/* ============================================
   语文教师专属工作台 - 主应用
   数据持久化：IndexedDB + localStorage
   ============================================ */

(function () {
  'use strict';

  // ================= 工具函数 =================
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fmtDate = ts => {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // ================= Toast =================
  const toastEl = $('#toast');
  let toastTimer = null;
  function toast(msg, duration) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, duration || 2200);
  }

  // ================= 模态框 =================
  const modalMask = $('#modalMask');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalFooter = $('#modalFooter');
  $('#modalClose').onclick = closeModal;
  modalMask.addEventListener('click', e => {
    if (e.target === modalMask) closeModal();
  });
  function openModal(title, bodyHTML, footerHTML) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML || '';
    modalFooter.innerHTML = footerHTML || '';
    modalMask.hidden = false;
  }
  function closeModal() {
    modalMask.hidden = true;
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
  }

  // ================= IndexedDB 存储 =================
  const DB_NAME = 'yuwen_teacher_db';
  const DB_VER = 2;
  const STORES = ['settings', 'card', 'classes', 'students', 'communications', 'templates', 'callbacks', 'hours', 'library', 'mindmaps', 'todos', 'clips', 'sticky', 'express', 'memos', 'countdowns'];

  let dbInstance = null;
  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = e => { dbInstance = e.target.result; resolve(dbInstance); };
      req.onerror = e => reject(e);
    });
  }

  async function dbAll(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = reject;
    });
  }
  async function dbGet(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  }
  async function dbPut(store, obj) {
    if (!obj.id) obj.id = uid();
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(obj);
      req.onsuccess = () => resolve(obj);
      req.onerror = reject;
    });
  }
  async function dbDel(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = reject;
    });
  }
  async function dbClear(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = reject;
    });
  }
  async function dbClearAll() {
    for (const s of STORES) await dbClear(s);
  }

  // ================= 简易 KV 存储（localStorage 备份） =================
  const LS_KEY = 'yuwen_teacher_state';
  function saveLocalCache() {
    try {
      const data = {};
      STORES.forEach(s => {
        data[s] = state[s] || [];
      });
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) { /* quota exceeded, ignore */ }
  }
  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // ================= 应用状态 =================
  const state = {
    settings: [],
    card: [],
    classes: [],
    students: [],
    communications: [],
    templates: [],
    callbacks: [],
    hours: [],
    library: [],
    mindmaps: [],
    todos: [],
    clips: [],
    sticky: [],
    express: [],
    memos: [],
    countdowns: []
  };
  let currentStudentId = null;
  let mmChart = null;
  let mmEditHistory = [];

  // ================= 初始化 =================
  async function init() {
    // 0) 防休眠 / 禁止空间关停
    setupKeepAlive();

    // 1) 加载 localStorage 缓存（秒开）
    const cache = loadLocalCache();
    if (cache) {
      STORES.forEach(s => { state[s] = cache[s] || []; });
    }
    // 2) 从 IndexedDB 加载
    for (const s of STORES) {
      try {
        const rows = await dbAll(s);
        if (rows.length || !cache) state[s] = rows;
      } catch (e) { console.warn('加载', s, '失败', e); }
    }
    saveLocalCache();

    // 默认数据
    ensureDefaultData();

    // 绑定事件
    bindEvents();

    // 应用个性化设置
    applySettings();

    // 移动端 touch-action 修复
    $$('button, .btn-primary, .btn-ghost, .nav-item, .bnav-item, .quick-btn').forEach(el => {
      el.style.touchAction = 'manipulation';
    });

    // 移动端弹窗从底部滑入
    if (window.innerWidth <= 768) {
      const mask = $('#modalMask');
      if (mask) mask.classList.add('mobile-modal');
    }

    // 渲染首页
    showPage('dashboard');
    renderDashboard();

    // 渲染工具页面
    renderTools();
    renderSticky();

    // 启动心跳（此时 state 已就绪）
    startHeartbeat();
  }

  // ================= 防休眠 / 禁止空间关停 =================
  // 1) Wake Lock API - 防止屏幕/页面进入休眠
  // 2) Page Visibility API - 页面隐藏时定时保持活跃
  // 3) Web Audio 静音播放 - 兼容老浏览器
  // 4) Service Worker 心跳 - 防止 service worker 休眠
  let wakeLock = null;
  let keepAliveAudioCtx = null;
  let keepAliveInterval = null;
  let isPageVisible = true;
  let lastActivity = Date.now();

  function setupKeepAlive() {
    // 监测页面可见性
    document.addEventListener('visibilitychange', () => {
      isPageVisible = !document.hidden;
      if (isPageVisible) {
        requestWakeLock();
        onUserActivity();
        updateKeepAliveIndicator('ok');
      } else {
        updateKeepAliveIndicator('warn');
      }
    });

    // 用户活动监测
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
      document.addEventListener(evt, onUserActivity, { passive: true });
    });

    // 首次请求唤醒锁
    requestWakeLock();

    // 注册 Service Worker（防止浏览器回收页面资源）
    if ('serviceWorker' in navigator) {
      // 清掉旧版本SW的缓存，强制获取最新资源
      if ('caches' in window) {
        caches.keys().then(ks => ks.filter(k => k !== 'yuwen-teacher-v2').forEach(k => caches.delete(k)));
      }
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  function onUserActivity() {
    lastActivity = Date.now();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      if (wakeLock) {
        try { await wakeLock.release(); } catch (e) {}
        wakeLock = null;
      }
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        // 锁被释放（如切到后台），重新请求
        if (isPageVisible) requestWakeLock();
      });
    } catch (e) {
      // 静默失败
    }
  }

  function startHeartbeat() {
    if (keepAliveInterval) return;
    updateKeepAliveIndicator('ok');
    keepAliveInterval = setInterval(() => {
      // 写入一条心跳到 localStorage，触发数据写入活动
      try {
        localStorage.setItem('__heartbeat', Date.now().toString());
      } catch (e) {}
      // Web Audio 静音播放（兼容不支持 wakeLock 的浏览器）
      playSilentAudio();
      // 页面可见时重新申请唤醒锁
      if (isPageVisible) requestWakeLock();
      // 重新保存 localCache 防止被识别为闲置
      saveLocalCache();
      // 向 Service Worker 发送心跳
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        try {
          const channel = new MessageChannel();
          navigator.serviceWorker.controller.postMessage({ type: 'heartbeat' }, [channel.port2]);
        } catch (e) {}
      }
      updateKeepAliveIndicator('ok');
    }, 25000);
  }

  function updateKeepAliveIndicator(state) {
    const el = document.getElementById('keepAliveIndicator');
    if (!el) return;
    el.classList.toggle('warn', state === 'warn');
  }

  function playSilentAudio() {
    try {
      if (!keepAliveAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        keepAliveAudioCtx = new Ctx();
      }
      if (keepAliveAudioCtx.state === 'suspended') {
        keepAliveAudioCtx.resume();
      }
      // 创建一个极短且音量几乎为 0 的振荡器
      const osc = keepAliveAudioCtx.createOscillator();
      const gain = keepAliveAudioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(keepAliveAudioCtx.destination);
      osc.start();
      setTimeout(() => { try { osc.stop(); } catch (e) {} }, 50);
    } catch (e) {}
  }

  function ensureDefaultData() {
    if (state.templates.length === 0) {
      state.templates = [
        { id: uid(), title: '日常学习反馈', content: '您好，我是 X 老师。宝贝今天上课表现积极，作业完成良好，【具体表现】。希望家长继续配合，我们一起努力！', ts: Date.now() },
        { id: uid(), title: '进步表扬', content: '您好！宝贝最近进步很大，【具体进步点】，希望继续坚持！有任何学习问题欢迎随时沟通。', ts: Date.now() },
        { id: uid(), title: '学习建议', content: '您好！根据近期表现，建议孩子在家【具体建议】，坚持一段时间会有明显效果。如有疑问可随时联系。', ts: Date.now() },
        { id: uid(), title: '续费提醒', content: '您好！宝贝本阶段课程即将结束，为保证学习连贯性，建议尽快续费。我们为孩子定制了下一阶段学习计划。', ts: Date.now() }
      ];
      state.templates.forEach(t => dbPut('templates', t));
    }
    if (state.students.length === 0) {
      const demo = {
        id: uid(),
        name: '示例学员',
        grade: '三年级',
        className: '春季提高班',
        weakness: '阅读理解、作文结构',
        tags: ['阅读短板', '作文待提升'],
        scores: [
          { type: '月考', date: '2025-09-15', score: 78 },
          { type: '月考', date: '2025-10-15', score: 82 },
          { type: '期中', date: '2025-11-10', score: 85 },
          { type: '月考', date: '2025-12-15', score: 88 },
          { type: '期末', date: '2026-01-15', score: 91 }
        ],
        communications: [],
        leaves: [],
        reports: [],
        hours: 20,
        ts: Date.now()
      };
      state.students.push(demo);
      dbPut('students', demo);
    }
  }

  // ================= 页面切换 =================
  function showPage(page) {
    $$('.page').forEach(p => p.hidden = true);
    const target = $('#page-' + page);
    if (target) target.hidden = false;
    const titles = {
      dashboard: '工作台首页', schedule: '班级课表',
      students: '学员档案', 'student-detail': '学员档案详情',
      communicate: '家长沟通', hours: '课时管理', library: '教学素材库',
      mindmap: 'AI 备课导图', kanban: '工作看板', tools: '工具中心',
      settings: '个性化设置', data: '数据备份', life: '生活助手'
    };
    $('#pageTitle').textContent = titles[page] || page;

    $$('.nav-item, .bnav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // 渲染对应页面
    if (page === 'dashboard') renderDashboard();
    if (page === 'schedule') renderSchedule();
    if (page === 'students') renderStudentList();
    if (page === 'communicate') renderCommunicate();
    if (page === 'hours') renderHours();
    if (page === 'library') renderLibrary();
    if (page === 'mindmap') renderMindmapHistory();
    if (page === 'kanban') renderKanban();
    if (page === 'tools') renderTools();
    if (page === 'settings') renderSettings();
    if (page === 'data') renderData();
    if (page === 'life') renderLife();

    // 移动端收起侧边栏
    const sidebar = $('#sidebar');
    const sidebarMask = $('#sidebarMask');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      if (sidebarMask) sidebarMask.classList.remove('active');
    }
  }

  // 移动端点击主内容区域关闭侧边栏
  document.addEventListener('click', e => {
    if (window.innerWidth > 768) return;
    const sb = $('#sidebar');
    if (!sb.classList.contains('mobile-open')) return;
    if (sb.contains(e.target) || e.target.closest('#hamburger')) return;
    if (e.target.closest('#sidebarMask')) return;
    sb.classList.remove('mobile-open');
    $('#sidebarMask').classList.remove('active');
  });

  // ================= 事件绑定 =================
  function bindEvents() {
    // 导航点击
    $$('.nav-item, .bnav-item, .quick-btn').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const page = el.dataset.page;
        if (page) showPage(page);
      });
    });

    // 侧边栏收起
    $('#collapseBtn').onclick = () => {
      const sb = $('#sidebar');
      sb.classList.toggle('collapsed');
      if (window.innerWidth > 768) {
        $('#sidebarMask').classList.remove('active');
      }
    };
    $('#hamburger').onclick = () => {
      const sb = $('#sidebar');
      const mask = $('#sidebarMask');
      sb.classList.toggle('mobile-open');
      mask.classList.toggle('active', sb.classList.contains('mobile-open'));
    };
    $('#sidebarMask').onclick = () => {
      $('#sidebar').classList.remove('mobile-open');
      $('#sidebarMask').classList.remove('active');
    };

    // 名片横幅
    const editCardBtn = $('#editCardBtn');
    if (editCardBtn) editCardBtn.onclick = () => window.__app.editCardModal();
    const bannerAvatar = $('#bannerAvatar');
    if (bannerAvatar) bannerAvatar.onclick = () => $('#avatarInput').click();
    const uploadAvatarBtn = $('#uploadAvatarBtn');
    if (uploadAvatarBtn) uploadAvatarBtn.onclick = () => $('#avatarInput').click();
    const avatarInput = $('#avatarInput');
    if (avatarInput) avatarInput.onchange = e => {
      handleAvatar(e.target.files[0]);
      renderBanner();
    };
    const copyCardBtn = $('#copyCard');
    if (copyCardBtn) copyCardBtn.onclick = copyCard;

    // 课表
    const addClassBtn = $('#addClassBtn');
    if (addClassBtn) addClassBtn.onclick = () => editClassModal();
    const scheduleType = $('#scheduleType');
    if (scheduleType) scheduleType.onchange = renderSchedule;
    const classFilter = $('#classFilter');
    if (classFilter) classFilter.onchange = renderSchedule;
    const exportClassBtn = $('#exportClassBtn');
    if (exportClassBtn) exportClassBtn.onclick = exportClassToWPS;

    // 学员
    const addStudentBtn = $('#addStudentBtn');
    if (addStudentBtn) addStudentBtn.onclick = () => editStudentModal();
    const studentFilter = $('#studentFilter');
    if (studentFilter) studentFilter.oninput = renderStudentList;
    const tagFilter = $('#tagFilter');
    if (tagFilter) tagFilter.onchange = renderStudentList;
    const backStudentList = $('#backStudentList');
    if (backStudentList) backStudentList.onclick = () => showPage('students');
    const exportStudentBtn = $('#exportStudentBtn');
    if (exportStudentBtn) exportStudentBtn.onclick = exportStudentXLSX;

    // 沟通
    const addCommBtn = $('#addCommBtn');
    if (addCommBtn) addCommBtn.onclick = () => editCommModal();
    $$('.tab').forEach(tab => {
      tab.onclick = () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.tab-content').forEach(c => c.hidden = true);
        $('#tab-' + tab.dataset.tab).hidden = false;
        if (tab.dataset.tab === 'template') renderTemplates();
        if (tab.dataset.tab === 'callback') renderCallbacks();
        if (tab.dataset.tab === 'timeline') renderTimeline();
      };
    });

    // 课时
    const addHourBtn = $('#addHourBtn');
    if (addHourBtn) addHourBtn.onclick = () => editHourModal();
    const hourStudentFilter = $('#hourStudentFilter');
    if (hourStudentFilter) hourStudentFilter.onchange = renderHours;
    const hourTypeFilter = $('#hourTypeFilter');
    if (hourTypeFilter) hourTypeFilter.onchange = renderHours;

    // 素材库
    const addLibBtn = $('#addLibBtn');
    if (addLibBtn) addLibBtn.onclick = () => editLibModal();
    const libTypeFilter = $('#libTypeFilter');
    if (libTypeFilter) libTypeFilter.onchange = renderLibrary;
    const importLibBtn = $('#importLibBtn');
    if (importLibBtn) importLibBtn.onclick = () => $('#libFileInput').click();
    const libFileInput = $('#libFileInput');
    if (libFileInput) libFileInput.onchange = e => handleLibFileImport(e.target.files[0]);

    // 思维导图
    const generateMindmapBtn = $('#generateMindmapBtn');
    if (generateMindmapBtn) generateMindmapBtn.onclick = generateMindmap;
    const exportMindmapBtn = $('#exportMindmapBtn');
    if (exportMindmapBtn) exportMindmapBtn.onclick = exportMindmapPNG;
    const addRootNodeBtn = $('#addRootNode');
    if (addRootNodeBtn) addRootNodeBtn.onclick = addRootNode;
    const saveMindmapBtn = $('#saveMindmapBtn');
    if (saveMindmapBtn) saveMindmapBtn.onclick = saveCurrentMindmap;
    const loadHistoryBtn = $('#loadHistoryBtn');
    if (loadHistoryBtn) loadHistoryBtn.onclick = loadMindmapHistory;
    const importMindmapBtn = $('#importMindmapBtn');
    if (importMindmapBtn) importMindmapBtn.onclick = () => $('#mindmapFileInput').click();
    const mindmapFileInput = $('#mindmapFileInput');
    if (mindmapFileInput) mindmapFileInput.onchange = e => handleMindmapImport(e.target.files[0]);
    const exportMindmapJsonBtn = $('#exportMindmapJsonBtn');
    if (exportMindmapJsonBtn) exportMindmapJsonBtn.onclick = exportMindmapJSON;

    // 看板
    const addTodoBtn = $('#addTodoBtn');
    if (addTodoBtn) addTodoBtn.onclick = () => editTodoModal();

    // 工具
    const timerStart = $('#timerStart');
    if (timerStart) timerStart.onclick = () => startTimer();
    const timerPause = $('#timerPause');
    if (timerPause) timerPause.onclick = () => pauseTimer();
    const timerReset = $('#timerReset');
    if (timerReset) timerReset.onclick = () => resetTimer();
    $$('.timer-presets button').forEach(b => {
      b.onclick = () => { setTimer(parseInt(b.dataset.sec)); };
    });
    const clipAdd = $('#clipAdd');
    if (clipAdd) clipAdd.onclick = addClip;
    const stickyNote = $('#stickyNote');
    if (stickyNote) stickyNote.oninput = e => {
      const note = { id: 'main', text: e.target.value, ts: Date.now() };
      state.sticky = [note];
      dbPut('sticky', note);
      saveLocalCache();
    };

    // 个性化
    const bgColor = $('#bgColor');
    if (bgColor) bgColor.oninput = e => updateSetting('bgColor', e.target.value);
    const resetBgColor = $('#resetBgColor');
    if (resetBgColor) resetBgColor.onclick = () => { updateSetting('bgColor', ''); if (bgColor) bgColor.value = '#f5f5f5'; };
    const bgImageInput = $('#bgImageInput');
    if (bgImageInput) bgImageInput.onchange = e => handleBgImage(e.target.files[0]);
    const clearBgImage = $('#clearBgImage');
    if (clearBgImage) clearBgImage.onclick = () => { updateSetting('bgImage', ''); applyBgImage(''); };
    const fontFamily = $('#fontFamily');
    if (fontFamily) fontFamily.onchange = e => updateSetting('fontFamily', e.target.value);
    const fontSizeEl = $('#fontSize');
    if (fontSizeEl) fontSizeEl.oninput = e => {
      const fsv = $('#fontSizeVal');
      if (fsv) fsv.textContent = e.target.value + 'px';
      updateSetting('fontSize', e.target.value);
    };
    $$('#themePalette button').forEach(b => { b.onclick = () => {}; });

    // 数据
    const backupBtn = $('#backupBtn');
    if (backupBtn) backupBtn.onclick = backupData;
    const restoreInput = $('#restoreInput');
    if (restoreInput) restoreInput.onchange = e => restoreData(e.target.files[0]);
    const gitmindSync = $('#gitmindSync');
    if (gitmindSync) gitmindSync.onclick = testGitmind;
    const clearAllBtn = $('#clearAllBtn');
    if (clearAllBtn) clearAllBtn.onclick = clearAllData;

    // WPS 导出按钮
    const exportAllBtn = $('#exportAllBtn');
    if (exportAllBtn) exportAllBtn.onclick = exportAllToWPS;
    const exportAllStudentsBtn = $('#exportAllStudentsBtn');
    if (exportAllStudentsBtn) exportAllStudentsBtn.onclick = exportStudentsToWPS;
    const exportCommBtn = $('#exportCommBtn');
    if (exportCommBtn) exportCommBtn.onclick = exportCommunicationsToWPS;
    const exportHoursBtn = $('#exportHoursBtn');
    if (exportHoursBtn) exportHoursBtn.onclick = exportHoursToWPS;
    const exportLibBtn = $('#exportLibBtn');
    if (exportLibBtn) exportLibBtn.onclick = exportLibraryToWPS;
    const exportKanbanBtn = $('#exportKanbanBtn');
    if (exportKanbanBtn) exportKanbanBtn.onclick = exportKanbanToWPS;
    const exportAllDataBtn = $('#exportAllDataBtn');
    if (exportAllDataBtn) exportAllDataBtn.onclick = exportAllToWPS;

    // 生活助手
    bindLifeEvents();

    // 悬浮球
    $('#floatBall').onclick = () => $('#floatMenu').hidden = !$('#floatMenu').hidden;
    $$('#floatMenu button').forEach(b => {
      b.onclick = () => {
        $('#floatMenu').hidden = true;
        const fm = b.dataset.fm;
        if (fm === 'student') editStudentModal();
        else if (fm === 'comm') editCommModal();
        else if (fm === 'schedule') showPage('schedule');
        else if (fm === 'template') {
          showPage('communicate');
          setTimeout(() => {
            $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'template'));
            $$('.tab-content').forEach(c => c.hidden = c.id !== 'tab-template');
            renderTemplates();
          }, 50);
        }
        else if (fm === 'mindmap') showPage('mindmap');
      };
    });

    // 全局搜索
    $('#globalSearch').oninput = e => doSearch(e.target.value);

    // 关闭悬浮菜单（外部点击）
    document.addEventListener('click', e => {
      if (!$('#floatBall').contains(e.target) && !$('#floatMenu').contains(e.target)) {
        $('#floatMenu').hidden = true;
      }
      if (!$('#globalSearch').contains(e.target) && !$('#searchResult').contains(e.target)) {
        $('#searchResult').classList.remove('active');
      }
    });
  }

  // ================= 个性化设置 =================
  function getSetting(key, def) {
    const item = state.settings.find(s => s.id === key);
    return item ? item.value : def;
  }
  function updateSetting(key, value) {
    const item = { id: key, value, ts: Date.now() };
    state.settings = state.settings.filter(s => s.id !== key);
    state.settings.push(item);
    dbPut('settings', item);
    saveLocalCache();
    applySettings();
  }
  function applySettings() {
    const bg = getSetting('bgColor', '');
    if (bg) document.body.style.background = bg;
    else document.body.style.background = '';

    const bgImg = getSetting('bgImage', '');
    applyBgImage(bgImg);

    const font = getSetting('fontFamily', '');
    const fontMap = {
      'default': '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
      'pingfang': '"PingFang SC", "Microsoft YaHei", sans-serif',
      'serif': '"Source Han Serif SC", "Songti SC", serif',
      'kaiti': '"KaiTi", "STKaiti", serif',
      'hand': '"Comic Sans MS", cursive'
    };
    if (font && fontMap[font]) document.documentElement.style.setProperty('--font-family', fontMap[font]);
    else if (font) document.documentElement.style.setProperty('--font-family', font);

    const fs = getSetting('fontSize', '14');
    document.documentElement.style.setProperty('--font-size', fs + 'px');
  }
  function applyBgImage(dataUrl) {
    document.body.style.backgroundImage = dataUrl ? `url(${dataUrl})` : '';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
  }
  function handleAvatar(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target.result;
      $('#avatarPreview').style.backgroundImage = `url(${url})`;
      $('#avatarPreview').innerHTML = '';
      updateSetting('avatar', url);
    };
    reader.readAsDataURL(file);
  }
  function handleBgImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      applyBgImage(e.target.result);
      updateSetting('bgImage', e.target.result);
      toast('背景图已设置');
    };
    reader.readAsDataURL(file);
  }

  function renderSettings() {
    const bg = getSetting('bgColor', '#f6f7fb');
    $('#bgColor').value = bg;
    const fontVal = getSetting('fontFamily', 'default');
    $('#fontFamily').value = fontVal || 'default';
    const fs = getSetting('fontSize', '14');
    $('#fontSize').value = fs;
    $('#fontSizeVal').textContent = fs + 'px';
  }

  // ================= 首页 =================
  function renderDashboard() {
    renderBanner();
    $('#stat-students').textContent = state.students.length;
    $('#stat-classes').textContent = state.classes.length;
    $('#stat-comm').textContent = state.communications.length;
    $('#stat-todo').textContent = state.todos.filter(t => t.status !== 'done').length;

    // 待回访
    const callbacks = state.callbacks.filter(c => !c.done);
    const list = $('#reminderList');
    if (callbacks.length === 0) {
      list.innerHTML = '<li>暂无待回访提醒</li>';
    } else {
      list.innerHTML = callbacks.slice(0, 5).map(c =>
        `<li><span class="badge">待回访</span> ${escapeHtml(c.student)} · ${escapeHtml(c.reason)} · ${fmtDate(c.ts)}</li>`
      ).join('');
    }
  }

  // ================= 名片 =================
  function renderCard() {
    const card = state.card[0] || { id: 'main' };
    $$('[data-card]').forEach(el => {
      el.value = card[el.dataset.card] || '';
    });
    const avatar = getSetting('avatar', '');
    if (avatar) {
      $('#avatarPreview').style.backgroundImage = `url(${avatar})`;
      $('#avatarPreview').innerHTML = '';
    }
  }

  function renderBanner() {
    const card = state.card[0] || {};
    const bannerName = $('#bannerName');
    const bannerTitle = $('#bannerTitle');
    const bannerOrg = $('#bannerOrg');
    const bannerGrade = $('#bannerGrade');
    const bannerMotto = $('#bannerMotto');
    const bannerAvatar = $('#bannerAvatar');
    if (bannerName) bannerName.textContent = card.name || '语文教师';
    if (bannerTitle) bannerTitle.textContent = card.title || '';
    if (bannerOrg) bannerOrg.textContent = card.org || '';
    if (bannerGrade) bannerGrade.textContent = card.grade || '';
    if (bannerMotto) bannerMotto.textContent = card.motto || '';
    const avatar = getSetting('avatar', '');
    if (bannerAvatar) {
      if (avatar) {
        bannerAvatar.style.backgroundImage = `url(${avatar})`;
        bannerAvatar.textContent = '';
      } else {
        bannerAvatar.style.backgroundImage = '';
        bannerAvatar.textContent = '👤';
      }
    }
  }

  window.editCardModal = function () {
    const card = state.card[0] || { id: 'main' };
    const body = `
      <label>姓名 <input type="text" id="cm_card_name" value="${escapeHtml(card.name||'')}"></label>
      <label>职称 <input type="text" id="cm_card_title" value="${escapeHtml(card.title||'')}"></label>
      <label>机构 <input type="text" id="cm_card_org" value="${escapeHtml(card.org||'')}"></label>
      <label>年级 <input type="text" id="cm_card_grade" value="${escapeHtml(card.grade||'')}"></label>
      <label>特色 <input type="text" id="cm_card_feature" value="${escapeHtml(card.feature||'')}"></label>
      <label>电话 <input type="text" id="cm_card_phone" value="${escapeHtml(card.phone||'')}"></label>
      <label>微信 <input type="text" id="cm_card_wechat" value="${escapeHtml(card.wechat||'')}"></label>
      <label>理念 <textarea id="cm_card_motto" rows="2">${escapeHtml(card.motto||'')}</textarea></label>
      <div style="margin-top:12px">
        <label>头像</label>
        <div id="cm_avatarPreview" style="width:80px;height:80px;border-radius:50%;border:2px solid var(--primary);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;background-size:cover;background-position:center;margin-top:8px;font-size:32px">${getSetting('avatar','')?'':'👤'}</div>
        <input type="file" id="cm_avatarInput" accept="image/*" style="display:none">
      </div>
    `;
    openModal('编辑名片', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="cm_card_save">保存</button>
    `);
    const avatarUrl = getSetting('avatar', '');
    if (avatarUrl) {
      $('#cm_avatarPreview').style.backgroundImage = `url(${avatarUrl})`;
      $('#cm_avatarPreview').textContent = '';
    }
    $('#cm_avatarPreview').onclick = () => $('#cm_avatarInput').click();
    $('#cm_avatarInput').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        $('#cm_avatarPreview').style.backgroundImage = `url(${ev.target.result})`;
        $('#cm_avatarPreview').textContent = '';
        updateSetting('avatar', ev.target.result);
      };
      reader.readAsDataURL(file);
    };
    $('#cm_card_save').onclick = async () => {
      const data = {
        id: 'main',
        name: $('#cm_card_name').value,
        title: $('#cm_card_title').value,
        org: $('#cm_card_org').value,
        grade: $('#cm_card_grade').value,
        feature: $('#cm_card_feature').value,
        phone: $('#cm_card_phone').value,
        wechat: $('#cm_card_wechat').value,
        motto: $('#cm_card_motto').value,
        ts: Date.now()
      };
      state.card = [data];
      await dbPut('card', data);
      saveLocalCache();
      closeModal();
      renderBanner();
      toast('名片已保存');
    };
  };
  function saveCard() {
    const data = { id: 'main', ts: Date.now() };
    $$('[data-card]').forEach(el => data[el.dataset.card] = el.value);
    state.card = [data];
    dbPut('card', data);
    saveLocalCache();
  }
  async function copyCard() {
    const card = state.card[0] || {};
    const avatar = getSetting('avatar', '');
    const lines = [
      '【语文教师名片】',
      `姓名：${card.name || ''}`,
      `职称：${card.title || ''}`,
      `机构：${card.org || ''}`,
      `年级：${card.grade || ''}`,
      `特色：${card.feature || ''}`,
      `电话：${card.phone || ''}`,
      `微信：${card.wechat || ''}`,
      `理念：${card.motto || ''}`
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('名片已复制到剪贴板');
    } catch (e) {
      // 备选
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('名片已复制');
    }
  }

  // ================= 班级课表 =================
  function renderSchedule() {
    const type = $('#scheduleType').value;
    const filter = $('#classFilter').value;
    // 更新班级下拉
    const cls = state.classes.filter(c => !type || c.type === type);
    $('#classFilter').innerHTML = '<option value="">全部班级</option>' +
      cls.map(c => `<option value="${c.id}" ${filter===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('');

    const list = $('#scheduleList');
    let classes = state.classes;
    if (type) classes = classes.filter(c => c.type === type);
    if (filter) classes = classes.filter(c => c.id === filter);

    if (classes.length === 0) {
      list.innerHTML = '<div class="info-block">暂无班级，点击右上「＋ 新建班级」开始</div>';
      return;
    }
    list.innerHTML = classes.map(c => `
      <div class="schedule-item">
        <div class="info">
          <h4>${escapeHtml(c.name)} <span class="tag-type ${c.type==='summer'?'summer':''}">${c.type==='summer'?'暑假班':'常规班'}</span></h4>
          <p>${escapeHtml(c.time || '')} · ${escapeHtml(c.room || '')} · ${c.studentCount || 0} 人</p>
        </div>
        <div class="actions">
          <button class="btn-ghost" onclick="window.__app.editClassModal('${c.id}')">编辑</button>
          <button class="btn-ghost" onclick="window.__app.confirmDelete('classes','${c.id}','${escapeHtml(c.name)}')">删除</button>
        </div>
      </div>
    `).join('');
  }

  window.editClassModal = function (id) {
    const c = id ? state.classes.find(x => x.id === id) : { type: $('#scheduleType').value };
    const body = `
      <label>班级名称 <input type="text" id="cm_name" value="${escapeHtml(c.name||'')}"></label>
      <label>班级类型
        <select id="cm_type">
          <option value="regular" ${c.type==='regular'?'selected':''}>常规班</option>
          <option value="summer" ${c.type==='summer'?'selected':''}>暑假班</option>
        </select>
      </label>
      <label>上课时间 <input type="text" id="cm_time" value="${escapeHtml(c.time||'')}" placeholder="如：每周六 14:00-16:00"></label>
      <label>教室 <input type="text" id="cm_room" value="${escapeHtml(c.room||'')}"></label>
      <label>学员人数 <input type="number" id="cm_count" value="${c.studentCount||0}"></label>
      <label>备注 <textarea id="cm_note" rows="2">${escapeHtml(c.note||'')}</textarea></label>
    `;
    const footer = `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="cm_save">保存</button>
    `;
    openModal(id ? '编辑班级' : '新建班级', body, footer);
    $('#cm_save').onclick = async () => {
      const data = {
        id: id || uid(),
        name: $('#cm_name').value.trim() || '未命名班级',
        type: $('#cm_type').value,
        time: $('#cm_time').value,
        room: $('#cm_room').value,
        studentCount: parseInt($('#cm_count').value) || 0,
        note: $('#cm_note').value,
        ts: Date.now()
      };
      await dbPut('classes', data);
      state.classes = state.classes.filter(x => x.id !== data.id);
      state.classes.push(data);
      saveLocalCache();
      closeModal();
      renderSchedule();
      toast('保存成功');
    };
  };

  function exportClassToWPS() {
    if (state.classes.length === 0) { toast('暂无班级数据'); return; }
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['班级名称', '类型', '上课时间', '教室', '人数', '备注']];
    state.classes.forEach(c => rows.push([
      c.name || '', c.type === 'summer' ? '暑假班' : '常规班',
      c.time || '', c.room || '', c.studentCount || 0, c.note || ''
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '班级课表');
    XLSX.writeFile(wb, `班级课表_${todayStr()}.xlsx`);
    toast('课表已导出为WPS格式');
  }

  // ================= 学员档案 =================
  function renderStudentList() {
    const filter = ($('#studentFilter').value || '').toLowerCase();
    const tag = $('#tagFilter').value;
    const list = $('#studentList');
    let students = state.students;
    if (filter) {
      students = students.filter(s =>
        (s.name||'').toLowerCase().includes(filter) ||
        (s.grade||'').toLowerCase().includes(filter) ||
        (s.className||'').toLowerCase().includes(filter)
      );
    }
    if (tag) students = students.filter(s => (s.tags || []).includes(tag));
    if (students.length === 0) {
      list.innerHTML = '<div class="info-block">暂无学员，点击右上「＋ 新建学员」开始</div>';
      return;
    }
    list.innerHTML = students.map(s => `
      <div class="student-card" onclick="window.__app.openStudent('${s.id}')">
        <h4>${escapeHtml(s.name||'未命名')}</h4>
        <p>${escapeHtml(s.grade||'')} · ${escapeHtml(s.className||'')}</p>
        <p>薄弱项：${escapeHtml(s.weakness||'无')}</p>
        <p>课时：${s.hours||0} · 最近成绩：${s.scores && s.scores.length ? s.scores[s.scores.length-1].score : '-'}</p>
        <div class="student-tags">${(s.tags||[]).map(t => `<span class="student-tag">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
    `).join('');
  }

  window.openStudent = function (id) {
    currentStudentId = id;
    showPage('student-detail');
    renderStudentDetail();
  };

  function renderStudentDetail() {
    const s = state.students.find(x => x.id === currentStudentId);
    if (!s) { showPage('students'); return; }
    $('#studentDetailTitle').textContent = s.name + ' - 档案';
    const detail = $('#studentDetail');
    detail.innerHTML = `
      <div class="sd-section">
        <h3>基本信息</h3>
        <div class="sd-grid">
          <label><span>姓名</span><input type="text" data-sd="name" value="${escapeHtml(s.name||'')}"></label>
          <label><span>年级</span><input type="text" data-sd="grade" value="${escapeHtml(s.grade||'')}"></label>
          <label><span>班级</span><input type="text" data-sd="className" value="${escapeHtml(s.className||'')}"></label>
          <label><span>课时</span><input type="number" data-sd="hours" value="${s.hours||0}"></label>
          <label><span>家长电话</span><input type="text" data-sd="phone" value="${escapeHtml(s.phone||'')}"></label>
          <label><span>学校</span><input type="text" data-sd="school" value="${escapeHtml(s.school||'')}"></label>
        </div>
        <label>薄弱项 <textarea data-sd="weakness" rows="2">${escapeHtml(s.weakness||'')}</textarea></label>
        <div style="margin-top:10px">
          <span style="font-size:12px;color:#6b7280">标签：</span>
          ${['基础薄弱','阅读短板','作文待提升','意向续报'].map(t => `
            <label style="display:inline-flex;align-items:center;margin-right:10px">
              <input type="checkbox" data-sd-tag="${t}" ${(s.tags||[]).includes(t)?'checked':''}> ${t}
            </label>
          `).join('')}
        </div>
        <div style="margin-top:12px">
          <button class="btn-primary" id="sdSave">保存基本信息</button>
          <button class="btn-ghost" onclick="window.__app.confirmDelete('students','${s.id}','${escapeHtml(s.name)}')">删除学员</button>
        </div>
      </div>

      <div class="sd-section">
        <h3>固定成绩栏目</h3>
        <div style="overflow-x:auto;max-width:100%">
          <table class="score-table">
            <thead>
              <tr><th>类型</th><th>日期</th><th>分数</th><th>操作</th></tr>
            </thead>
            <tbody id="scoreBody">
              ${(s.scores||[]).map((sc, i) => `
                <tr data-idx="${i}">
                  <td>
                    <select data-score-field="type">
                      <option ${sc.type==='月考'?'selected':''}>月考</option>
                      <option ${sc.type==='期中'?'selected':''}>期中</option>
                      <option ${sc.type==='期末'?'selected':''}>期末</option>
                      <option ${sc.type==='单元测'?'selected':''}>单元测</option>
                    </select>
                  </td>
                  <td><input type="date" data-score-field="date" value="${sc.date||''}"></td>
                  <td><input type="number" data-score-field="score" value="${sc.score||0}"></td>
                  <td><button class="btn-ghost" onclick="window.__app.delScore(${i})">删除</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <button class="btn-ghost" onclick="window.__app.addScore()">＋ 添加成绩</button>
        <button class="btn-primary" onclick="window.__app.saveScores()">保存成绩</button>
      </div>

      <div class="sd-section">
        <h3>成绩走势图</h3>
        <div class="chart-wrap"><canvas id="scoreChart"></canvas></div>
      </div>

      <div class="sd-section">
        <h3>家长沟通记录</h3>
        <ul class="report-list" id="commList"></ul>
        <button class="btn-ghost" onclick="window.__app.editCommModal('${s.id}')">＋ 新增沟通</button>
      </div>

      <div class="sd-section">
        <h3>请假补课记录</h3>
        <ul class="report-list" id="leaveList"></ul>
        <button class="btn-ghost" onclick="window.__app.editHourModal('${s.id}')">＋ 新增记录</button>
      </div>

      <div class="sd-section">
        <h3>学情报告存档</h3>
        <ul class="report-list" id="reportList"></ul>
        <button class="btn-ghost" onclick="window.__app.addReport()">＋ 新增报告</button>
        <div id="reportInput" style="display:none;margin-top:10px">
          <textarea id="reportText" rows="4" placeholder="粘贴学生阶段总结…"></textarea>
          <button class="btn-primary" onclick="window.__app.saveReport()">保存报告</button>
        </div>
      </div>
    `;

    // 绑定信息修改
    $$('[data-sd]').forEach(el => el.oninput = () => {
      s[el.dataset.sd] = el.value;
      saveStudentSilent(s);
    });
    $$('[data-sd-tag]').forEach(el => el.onchange = () => {
      const tags = $$('[data-sd-tag]:checked').map(x => x.dataset.sdTag);
      s.tags = tags;
      saveStudentSilent(s);
    });
    $('#sdSave').onclick = () => { dbPut('students', s); saveLocalCache(); toast('已保存'); renderStudentList(); };

    // 渲染沟通/请假/报告
    renderStudentComm(s);
    renderStudentLeave(s);
    renderStudentReport(s);

    // 渲染图表
    setTimeout(() => renderScoreChart(s), 50);
  }

  function saveStudentSilent(s) {
    dbPut('students', s);
    saveLocalCache();
  }

  window.addScore = function () {
    const s = state.students.find(x => x.id === currentStudentId);
    s.scores = s.scores || [];
    s.scores.push({ type: '月考', date: todayStr(), score: 0 });
    renderStudentDetail();
  };
  window.delScore = function (idx) {
    const s = state.students.find(x => x.id === currentStudentId);
    s.scores.splice(idx, 1);
    saveStudentSilent(s);
    renderStudentDetail();
  };
  window.saveScores = function () {
    const s = state.students.find(x => x.id === currentStudentId);
    const rows = $$('#scoreBody tr');
    s.scores = rows.map(tr => ({
      type: tr.querySelector('[data-score-field="type"]').value,
      date: tr.querySelector('[data-score-field="date"]').value,
      score: parseFloat(tr.querySelector('[data-score-field="score"]').value) || 0
    }));
    saveStudentSilent(s);
    renderScoreChart(s);
    toast('成绩已保存');
  };

  function renderScoreChart(s) {
    const canvas = $('#scoreChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (mmChart) mmChart.destroy();
    const scores = (s.scores || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (scores.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无成绩数据', canvas.width / 2, canvas.height / 2);
      return;
    }
    const w = canvas.parentElement.clientWidth - 24;
    canvas.width = w;
    canvas.height = 250;
    const data = scores.map(sc => ({ x: sc.date, y: sc.score, type: sc.type }));
    const colors = { '月考': '#5b6cff', '期中': '#f59e0b', '期末': '#ef4444', '单元测': '#10b981' };
    // 简单折线图（避免依赖 chart.js）
    const padding = { l: 40, r: 20, t: 20, b: 40 };
    const cw = w - padding.l - padding.r;
    const ch = 250 - padding.t - padding.b;
    ctx.clearRect(0, 0, w, 250);
    const maxY = Math.max(100, ...data.map(d => d.y)) + 10;
    const minY = Math.max(0, Math.min(...data.map(d => d.y)) - 10);
    // 网格
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.t + (ch * i / 4);
      ctx.beginPath();
      ctx.moveTo(padding.l, y);
      ctx.lineTo(padding.l + cw, y);
      ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxY - (maxY - minY) * i / 4), padding.l - 6, y + 4);
    }
    // 折线
    if (data.length > 0) {
      ctx.strokeStyle = '#5b6cff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = padding.l + (data.length === 1 ? cw / 2 : (cw * i / (data.length - 1)));
        const y = padding.t + ch - (ch * (d.y - minY) / (maxY - minY));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      // 点
      data.forEach((d, i) => {
        const x = padding.l + (data.length === 1 ? cw / 2 : (cw * i / (data.length - 1)));
        const y = padding.t + ch - (ch * (d.y - minY) / (maxY - minY));
        ctx.fillStyle = colors[d.type] || '#5b6cff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2330';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.y, x, y - 10);
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px sans-serif';
        ctx.fillText(d.x.slice(5), x, 250 - 16);
      });
    }
  }

  function renderStudentComm(s) {
    const list = $('#commList');
    if (!list) return;
    const comms = state.communications.filter(c => c.studentId === s.id);
    if (comms.length === 0) list.innerHTML = '<li style="color:#9ca3af">暂无沟通记录</li>';
    else list.innerHTML = comms.map(c => `
      <li>
        <strong>${fmtDate(c.ts)}</strong> · ${escapeHtml(c.type || '')}<br>
        ${escapeHtml(c.content || '')}
        <button class="btn-ghost" style="float:right" onclick="window.__app.delComm('${c.id}')">删除</button>
      </li>
    `).join('');
  }
  function renderStudentLeave(s) {
    const list = $('#leaveList');
    if (!list) return;
    const items = state.hours.filter(h => h.studentId === s.id);
    if (items.length === 0) list.innerHTML = '<li style="color:#9ca3af">暂无请假补课记录</li>';
    else list.innerHTML = items.map(h => `
      <li>
        <strong>${h.date}</strong> · <span class="type-tag ${h.type==='请假'?'leave':(h.type==='补课'?'makeup':'')}">${h.type}</span>
        ${h.hours ? `· ${h.hours} 课时` : ''}
        ${h.note ? `· ${escapeHtml(h.note)}` : ''}
      </li>
    `).join('');
  }
  function renderStudentReport(s) {
    const list = $('#reportList');
    if (!list) return;
    if (!s.reports || s.reports.length === 0) list.innerHTML = '<li style="color:#9ca3af">暂无学情报告</li>';
    else list.innerHTML = s.reports.map((r, i) => `
      <li>
        <strong>${fmtDate(r.ts)}</strong>
        <button class="btn-ghost" style="float:right" onclick="window.__app.delReport(${i})">删除</button>
        <div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(r.text)}</div>
      </li>
    `).join('');
  }
  window.addReport = function () {
    $('#reportInput').style.display = 'block';
    $('#reportText').focus();
  };
  window.saveReport = function () {
    const s = state.students.find(x => x.id === currentStudentId);
    const text = $('#reportText').value.trim();
    if (!text) { toast('请输入报告内容'); return; }
    s.reports = s.reports || [];
    s.reports.push({ text, ts: Date.now() });
    saveStudentSilent(s);
    $('#reportText').value = '';
    $('#reportInput').style.display = 'none';
    renderStudentReport(s);
    toast('已保存');
  };
  window.delReport = function (i) {
    const s = state.students.find(x => x.id === currentStudentId);
    s.reports.splice(i, 1);
    saveStudentSilent(s);
    renderStudentReport(s);
  };
  window.delComm = function (id) {
    if (!confirm('确认删除该沟通记录？')) return;
    state.communications = state.communications.filter(c => c.id !== id);
    dbDel('communications', id);
    saveLocalCache();
    const s = state.students.find(x => x.id === currentStudentId);
    renderStudentComm(s);
  };

  window.editStudentModal = function (id) {
    const s = id ? state.students.find(x => x.id === id) : {};
    const body = `
      <label>姓名 <input type="text" id="sm_name" value="${escapeHtml(s.name||'')}"></label>
      <label>年级 <input type="text" id="sm_grade" value="${escapeHtml(s.grade||'')}"></label>
      <label>班级 <input type="text" id="sm_class" value="${escapeHtml(s.className||'')}"></label>
      <label>学校 <input type="text" id="sm_school" value="${escapeHtml(s.school||'')}"></label>
      <label>家长电话 <input type="text" id="sm_phone" value="${escapeHtml(s.phone||'')}"></label>
      <label>课时 <input type="number" id="sm_hours" value="${s.hours||0}"></label>
      <label>薄弱项 <textarea id="sm_weak" rows="2">${escapeHtml(s.weakness||'')}</textarea></label>
    `;
    openModal(id ? '编辑学员' : '新建学员', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="sm_save">保存</button>
    `);
    $('#sm_save').onclick = async () => {
      const data = Object.assign({}, s, {
        id: id || uid(),
        name: $('#sm_name').value.trim() || '未命名',
        grade: $('#sm_grade').value,
        className: $('#sm_class').value,
        school: $('#sm_school').value,
        phone: $('#sm_phone').value,
        hours: parseInt($('#sm_hours').value) || 0,
        weakness: $('#sm_weak').value,
        scores: s.scores || [],
        tags: s.tags || [],
        reports: s.reports || [],
        ts: Date.now()
      });
      await dbPut('students', data);
      state.students = state.students.filter(x => x.id !== data.id);
      state.students.push(data);
      saveLocalCache();
      closeModal();
      renderStudentList();
      toast('保存成功');
    };
  };

  function exportStudentXLSX() {
    const s = state.students.find(x => x.id === currentStudentId);
    if (!s) return;
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();

    // 基本信息
    const info = [
      ['学员档案'],
      ['姓名', s.name || ''],
      ['年级', s.grade || ''],
      ['班级', s.className || ''],
      ['学校', s.school || ''],
      ['家长电话', s.phone || ''],
      ['课时', s.hours || 0],
      ['薄弱项', s.weakness || ''],
      ['标签', (s.tags || []).join('、')],
      [],
      ['成绩记录'],
      ['类型', '日期', '分数']
    ];
    (s.scores || []).forEach(sc => info.push([sc.type, sc.date, sc.score]));
    const ws1 = XLSX.utils.aoa_to_sheet(info);
    XLSX.utils.book_append_sheet(wb, ws1, '基本信息');

    // 沟通记录
    const comms = state.communications.filter(c => c.studentId === s.id);
    const commData = [['日期', '类型', '内容']];
    comms.forEach(c => commData.push([fmtDate(c.ts), c.type || '', c.content || '']));
    const ws2 = XLSX.utils.aoa_to_sheet(commData);
    XLSX.utils.book_append_sheet(wb, ws2, '沟通记录');

    // 学情报告
    const repData = [['日期', '内容']];
    (s.reports || []).forEach(r => repData.push([fmtDate(r.ts), r.text]));
    const ws3 = XLSX.utils.aoa_to_sheet(repData);
    XLSX.utils.book_append_sheet(wb, ws3, '学情报告');

    XLSX.writeFile(wb, `${s.name}_档案_${todayStr()}.xlsx`);
    toast('WPS 表格已导出');
  }

  // ================= 沟通 =================
  function renderCommunicate() {
    renderTimeline();
    renderTemplates();
    renderCallbacks();
  }
  function renderTimeline() {
    const el = $('#tab-timeline');
    const comms = state.communications.slice().reverse();
    if (comms.length === 0) el.innerHTML = '<div class="info-block">暂无沟通记录</div>';
    else el.innerHTML = comms.map(c => {
      const s = state.students.find(x => x.id === c.studentId);
      return `
        <div class="timeline-item">
          <h4>${escapeHtml(s ? s.name : '未知学员')} · ${escapeHtml(c.type || '')}</h4>
          <p>${fmtDate(c.ts)}</p>
          <p style="margin-top:6px;color:#1f2330">${escapeHtml(c.content || '')}</p>
        </div>
      `;
    }).join('');
  }
  function renderTemplates() {
    const el = $('#tab-template');
    el.innerHTML = `
      <button class="btn-primary" style="margin-bottom:12px" onclick="window.__app.editTemplateModal()">＋ 新增话术</button>
      ${state.templates.map(t => `
        <div class="template-item">
          <h4>${escapeHtml(t.title)}<span>
            <button class="btn-ghost" onclick="window.__app.copyText(\`${escapeAttr(t.content)}\`)">复制</button>
            <button class="btn-ghost" onclick="window.__app.editTemplateModal('${t.id}')">编辑</button>
            <button class="btn-ghost" onclick="window.__app.confirmDelete('templates','${t.id}','${escapeHtml(t.title)}')">删除</button>
          </span></h4>
          <p>${escapeHtml(t.content)}</p>
        </div>
      `).join('')}
    `;
  }
  function renderCallbacks() {
    const el = $('#tab-callback');
    el.innerHTML = `
      <button class="btn-primary" style="margin-bottom:12px" onclick="window.__app.editCallbackModal()">＋ 新增回访</button>
      ${state.callbacks.length === 0 ? '<div class="info-block">暂无待回访</div>' : state.callbacks.map(c => `
        <div class="callback-item">
          <div>
            <strong>${escapeHtml(c.student)}</strong> · ${escapeHtml(c.reason || '')}
            <p style="font-size:12px;color:#6b7280">${fmtDate(c.ts)} ${c.done ? '· 已完成' : ''}</p>
          </div>
          <div>
            ${c.done ? '' : `<button class="btn-ghost" onclick="window.__app.finishCallback('${c.id}')">完成</button>`}
            <button class="btn-ghost" onclick="window.__app.confirmDelete('callbacks','${c.id}','${escapeHtml(c.student)}')">删除</button>
          </div>
        </div>
      `).join('')}
    `;
  }

  window.editCommModal = function (sid) {
    const body = `
      <label>学员
        <select id="cm_student">
          ${state.students.map(s => `<option value="${s.id}" ${sid===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </label>
      <label>沟通类型
        <select id="cm_type">
          <option>电话</option><option>微信</option><option>面谈</option><option>其他</option>
        </select>
      </label>
      <label>沟通内容 <textarea id="cm_content" rows="4" placeholder="本次沟通要点…"></textarea></label>
    `;
    openModal('记录沟通', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="cm_save">保存</button>
    `);
    $('#cm_save').onclick = async () => {
      const data = {
        id: uid(),
        studentId: $('#cm_student').value,
        type: $('#cm_type').value,
        content: $('#cm_content').value,
        ts: Date.now()
      };
      await dbPut('communications', data);
      state.communications.push(data);
      saveLocalCache();
      closeModal();
      if (currentStudentId) {
        const s = state.students.find(x => x.id === currentStudentId);
        renderStudentComm(s);
      } else {
        renderCommunicate();
      }
      toast('已记录');
    };
  };

  window.editTemplateModal = function (id) {
    const t = id ? state.templates.find(x => x.id === id) : {};
    const body = `
      <label>标题 <input type="text" id="tm_title" value="${escapeHtml(t.title||'')}"></label>
      <label>内容 <textarea id="tm_content" rows="6">${escapeHtml(t.content||'')}</textarea></label>
    `;
    openModal(id ? '编辑话术' : '新增话术', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="tm_save">保存</button>
    `);
    $('#tm_save').onclick = async () => {
      const data = { id: id || uid(), title: $('#tm_title').value || '未命名', content: $('#tm_content').value, ts: Date.now() };
      await dbPut('templates', data);
      state.templates = state.templates.filter(x => x.id !== data.id);
      state.templates.push(data);
      saveLocalCache();
      closeModal();
      renderTemplates();
      toast('已保存');
    };
  };

  window.editCallbackModal = function (id) {
    const c = id ? state.callbacks.find(x => x.id === id) : {};
    const body = `
      <label>学员 <input type="text" id="cb_student" value="${escapeHtml(c.student||'')}"></label>
      <label>回访原因 <textarea id="cb_reason" rows="3">${escapeHtml(c.reason||'')}</textarea></label>
    `;
    openModal(id ? '编辑回访' : '新增回访', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="cb_save">保存</button>
    `);
    $('#cb_save').onclick = async () => {
      const data = { id: id || uid(), student: $('#cb_student').value, reason: $('#cb_reason').value, ts: Date.now(), done: c.done || false };
      await dbPut('callbacks', data);
      state.callbacks = state.callbacks.filter(x => x.id !== data.id);
      state.callbacks.push(data);
      saveLocalCache();
      closeModal();
      renderCallbacks();
      toast('已保存');
    };
  };
  window.finishCallback = async function (id) {
    const c = state.callbacks.find(x => x.id === id);
    c.done = true;
    await dbPut('callbacks', c);
    saveLocalCache();
    renderCallbacks();
  };

  window.copyText = async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制');
    }
  };

  // ================= 课时管理 =================
  function renderHours() {
    const filterStu = $('#hourStudentFilter').value;
    const filterType = $('#hourTypeFilter').value;
    $('#hourStudentFilter').innerHTML = '<option value="">全部学员</option>' +
      state.students.map(s => `<option value="${s.id}" ${filterStu===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('');

    let list = state.hours;
    if (filterStu) list = list.filter(h => h.studentId === filterStu);
    if (filterType) list = list.filter(h => h.type === filterType);

    const el = $('#hourList');
    if (list.length === 0) { el.innerHTML = '<div class="info-block">暂无记录</div>'; return; }
    el.innerHTML = list.slice().reverse().map(h => {
      const s = state.students.find(x => x.id === h.studentId);
      return `
        <div class="record-item">
          <div>
            <strong>${escapeHtml(s ? s.name : '未知')}</strong>
            <span class="type-tag ${h.type==='请假'?'leave':(h.type==='补课'?'makeup':'')}">${h.type}</span>
            · ${h.date} ${h.hours ? '· ' + h.hours + ' 课时' : ''}
            <p style="font-size:12px;color:#6b7280;margin-top:4px">${escapeHtml(h.note || '')}</p>
          </div>
          <button class="btn-ghost" onclick="window.__app.confirmDelete('hours','${h.id}','课时记录')">删除</button>
        </div>
      `;
    }).join('');
  }

  window.editHourModal = function (sid) {
    const body = `
      <label>学员
        <select id="hm_student">
          ${state.students.map(s => `<option value="${s.id}" ${sid===s.id?'selected':''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      </label>
      <label>类型
        <select id="hm_type">
          <option>消课</option><option>补课</option><option>请假</option>
        </select>
      </label>
      <label>日期 <input type="date" id="hm_date" value="${todayStr()}"></label>
      <label>课时数 <input type="number" id="hm_hours" value="1" step="0.5"></label>
      <label>备注 <textarea id="hm_note" rows="2"></textarea></label>
    `;
    openModal('课时登记', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="hm_save">保存</button>
    `);
    $('#hm_save').onclick = async () => {
      const type = $('#hm_type').value;
      const data = {
        id: uid(),
        studentId: $('#hm_student').value,
        type,
        date: $('#hm_date').value,
        hours: parseFloat($('#hm_hours').value) || 0,
        note: $('#hm_note').value,
        ts: Date.now()
      };
      await dbPut('hours', data);
      state.hours.push(data);
      saveLocalCache();
      // 同步更新学员课时
      if (type === '消课' || type === '补课') {
        const s = state.students.find(x => x.id === data.studentId);
        if (s) {
          s.hours = (s.hours || 0) + (type === '补课' ? data.hours : -data.hours);
          await dbPut('students', s);
        }
      }
      closeModal();
      renderHours();
      if (currentStudentId) renderStudentDetail();
      toast('已登记');
    };
  };

  // ================= 教学素材 =================
  function renderLibrary() {
    const filter = $('#libTypeFilter').value;
    let list = state.library;
    if (filter) list = list.filter(l => l.type === filter);
    const el = $('#libList');
    if (list.length === 0) { el.innerHTML = '<div class="info-block">暂无素材</div>'; return; }
    el.innerHTML = list.map(l => {
      let contentHtml = '';
      if (l.type === '文件' && l.content) {
        // 图片文件 - 显示缩略图
        contentHtml = `<div style="margin-top:8px"><img src="${l.content}" style="max-width:120px;max-height:80px;border-radius:6px;border:1px solid #e5e7eb" /></div>`;
      } else if (l.type === '文件') {
        // 非图片文件 - 显示文件名和下载按钮
        contentHtml = `<div style="margin-top:8px;font-size:12px;color:#6b7280">${escapeHtml(l.fileName || l.title)} · ${l.fileSize || ''}</div>`;
      }
      return `
      <div class="lib-item">
        <h4>${escapeHtml(l.title)}</h4>
        <p>${escapeHtml(l.note || '')}</p>
        ${contentHtml}
        <div class="lib-meta">
          <span>${escapeHtml(l.type)}</span>
          <span>${escapeHtml(l.grade || '')}</span>
          <span>${fmtDate(l.ts)}</span>
        </div>
        <div style="margin-top:8px">
          <button class="btn-ghost" onclick="window.__app.editLibModal('${l.id}')">编辑</button>
          <button class="btn-ghost" onclick="window.__app.confirmDelete('library','${l.id}','素材')">删除</button>
          ${l.type === '文件' && l.content ? `<button class="btn-ghost" onclick="window.__app.downloadLibFile('${l.id}')">下载</button>` : ''}
        </div>
      </div>
    `;
    }).join('');
  }

  function handleLibFileImport(file) {
    if (!file) return;
    const fileName = file.name;
    const fileSize = (file.size / 1024).toFixed(1) + ' KB';
    const fileType = file.type || '';
    const isImage = fileType.startsWith('image/');
    const reader = new FileReader();
    reader.onload = async e => {
      const data = {
        id: uid(),
        type: '文件',
        title: fileName,
        fileName: fileName,
        fileSize: fileSize,
        fileType: fileType,
        content: isImage ? e.target.result : '',
        note: '',
        grade: '',
        ts: Date.now()
      };
      await dbPut('library', data);
      state.library.push(data);
      saveLocalCache();
      renderLibrary();
      toast('文件已导入素材库');
    };
    if (isImage) {
      reader.readAsDataURL(file);
    } else {
      // 非图片文件只存元信息
      const data = {
        id: uid(),
        type: '文件',
        title: fileName,
        fileName: fileName,
        fileSize: fileSize,
        fileType: fileType,
        content: '',
        note: '',
        grade: '',
        ts: Date.now()
      };
      dbPut('library', data);
      state.library.push(data);
      saveLocalCache();
      renderLibrary();
      toast('文件已导入素材库');
    }
  }

  window.downloadLibFile = function (id) {
    const l = state.library.find(x => x.id === id);
    if (!l || !l.content) { toast('该文件无可下载内容'); return; }
    const link = document.createElement('a');
    link.href = l.content;
    link.download = l.fileName || l.title;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  window.editLibModal = function (id) {
    const l = id ? state.library.find(x => x.id === id) : {};
    const body = `
      <label>类型
        <select id="lm_type">
          <option ${l.type==='试卷'?'selected':''}>试卷</option>
          <option ${l.type==='讲义'?'selected':''}>讲义</option>
          <option ${l.type==='答题模板'?'selected':''}>答题模板</option>
          <option ${l.type==='练习题'?'selected':''}>练习题</option>
        </select>
      </label>
      <label>标题 <input type="text" id="lm_title" value="${escapeHtml(l.title||'')}"></label>
      <label>适用年级 <input type="text" id="lm_grade" value="${escapeHtml(l.grade||'')}" placeholder="如：三年级"></label>
      <label>备注 / 链接 <input type="text" id="lm_note" value="${escapeHtml(l.note||'')}"></label>
      <label>内容/正文 <textarea id="lm_content" rows="5">${escapeHtml(l.content||'')}</textarea></label>
    `;
    openModal(id ? '编辑素材' : '新增素材', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      <button class="btn-primary" id="lm_save">保存</button>
    `);
    $('#lm_save').onclick = async () => {
      const data = {
        id: id || uid(),
        type: $('#lm_type').value,
        title: $('#lm_title').value || '未命名',
        grade: $('#lm_grade').value,
        note: $('#lm_note').value,
        content: $('#lm_content').value,
        ts: Date.now()
      };
      await dbPut('library', data);
      state.library = state.library.filter(x => x.id !== data.id);
      state.library.push(data);
      saveLocalCache();
      closeModal();
      renderLibrary();
      toast('已保存');
    };
  };

  // ================= 思维导图（自绘 SVG） =================
  let mmData = null;
  let mmZoom = 1;
  let mmPan = { x: 0, y: 0 };
  let mmDrag = null;
  let mmSelected = null;
  let mmEditing = null;

  function renderMindmapHistory() {
    const el = $('#mmHistory');
    el.innerHTML = state.mindmaps.slice().reverse().map(m => `
      <li>
        <span>${escapeHtml(m.title)} · ${fmtDate(m.ts)}</span>
        <span>
          <button class="btn-ghost" onclick="window.__app.loadMindmapById('${m.id}')">载入</button>
          <button class="btn-ghost" onclick="window.__app.delMindmap('${m.id}')">删除</button>
        </span>
      </li>
    `).join('');
    // 如果当前页面已有 mmData（未保存），自动重绘
    if (mmData && !$('#mindmapSvg').children.length) {
      setTimeout(() => layoutAndRenderMindmap(), 50);
    }
  }

  function generateMindmap() {
    const content = $('#mmContent').value.trim();
    const focus = $('#mmFocus').value.trim();
    const plan = $('#mmPlan').value.trim();
    if (!content) { toast('请填写本节课内容'); return; }
    const root = { id: uid(), text: content, children: [] };
    if (focus) {
      const items = focus.split(/[，。；\n;、]/).map(s => s.trim()).filter(Boolean);
      items.forEach(it => root.children.push({ id: uid(), text: it, children: [] }));
    }
    if (plan) {
      const items = plan.split(/[，。；\n;、]/).map(s => s.trim()).filter(Boolean);
      items.forEach(it => {
        root.children.push({ id: uid(), text: '⏱ ' + it, children: [] });
      });
    }
    if (root.children.length === 0) {
      root.children.push({ id: uid(), text: '重点内容', children: [] });
    }
    mmData = { id: uid(), title: content, root, ts: Date.now() };
    layoutAndRenderMindmap();
    toast('思维导图已生成');
  }

  function addRootNode() {
    if (!mmData) {
      mmData = { id: uid(), title: '未命名备课', root: { id: uid(), text: '中心主题', children: [] }, ts: Date.now() };
    } else {
      const text = prompt('新主节点文本：', '新主题');
      if (text) {
        mmData.root.children.push({ id: uid(), text, children: [] });
      }
    }
    layoutAndRenderMindmap();
  }

  function layoutAndRenderMindmap() {
    if (!mmData) return;
    const svg = $('#mindmapSvg');
    const wrap = svg.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    // 内部画布用更大尺寸，SVG 用 viewBox 缩放显示
    const virtualW = Math.max(w, 900);
    const virtualH = Math.max(h, 500);
    svg.setAttribute('viewBox', `0 0 ${virtualW} ${virtualH}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 计算布局（水平右向辐射）
    const levels = [];
    function collect(node, depth) {
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(node);
      (node.children || []).forEach(c => collect(c, depth + 1));
    }
    collect(mmData.root, 0);

    // 测量文本宽度（粗略）
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '13px sans-serif';
    const measure = (text, isRoot) => {
      const f = isRoot ? 'bold 14px sans-serif' : '13px sans-serif';
      ctx.font = f;
      return Math.max(80, ctx.measureText(text).width + 24);
    };

    // 分配每个节点的宽高
    const nodeSize = (n, isRoot) => {
      const w0 = measure(n.text, isRoot);
      const h0 = isRoot ? 40 : 32;
      n._w = w0;
      n._h = h0;
    };
    nodeSize(mmData.root, true);
    (function rec(n) {
      (n.children || []).forEach(c => {
        nodeSize(c, false);
        rec(c);
      });
    })(mmData.root);

    // 计算每个叶子的子树高度
    const subtreeH = (n) => {
      if (!n.children || n.children.length === 0) return n._h + 8;
      return Math.max(n._h + 8, n.children.reduce((s, c) => s + subtreeH(c), 0));
    };

    // 横向布局
    const xStart = 40;
    const yMid = virtualH / 2;
    const dx = 180;
    function place(node, x, yCenter, isRoot) {
      node._x = x;
      node._y = yCenter;
      let childX = x + node._w / 2 + dx;
      let childY = yCenter - subtreeH(node) / 2;
      (node.children || []).forEach(c => {
        const ch = subtreeH(c);
        place(c, childX, childY + ch / 2, false);
        childY += ch;
      });
    }
    place(mmData.root, xStart, yMid, true);

    // 渲染
    const colors = ['#5b6cff', '#8a7bff', '#2ec4b6', '#f59e0b', '#ef4444', '#06b6d4'];
    let html = '';
    function renderEdges(n) {
      let s = '';
      (n.children || []).forEach(c => {
        s += `<path class="mm-edge" d="M ${n._x + n._w/2} ${n._y} C ${(n._x + c._x)/2} ${n._y}, ${(n._x + c._x)/2} ${c._y}, ${c._x - c._w/2} ${c._y}" />`;
        s += renderEdges(c);
      });
      return s;
    }
    function renderNodes(n, depth) {
      let s = '';
      const fill = depth === 0 ? colors[0] : (depth === 1 ? colors[1] : '#fff');
      const stroke = depth <= 1 ? 'none' : colors[depth % colors.length];
      s += `<g class="mm-node" data-id="${n.id}" data-depth="${depth}">`;
      s += `<rect class="mm-node-rect ${depth===0?'root':''}" x="${n._x - n._w/2}" y="${n._y - n._h/2}" width="${n._w}" height="${n._h}" style="${depth>1?`fill:${fill};stroke:${stroke}`:''}" />`;
      s += `<text class="mm-node-text ${depth===0?'root':''}" x="${n._x}" y="${n._y}">${escapeHtml(n.text)}</text>`;
      s += `</g>`;
      (n.children || []).forEach(c => s += renderNodes(c, depth + 1));
      return s;
    }
    html += renderEdges(mmData.root);
    html += renderNodes(mmData.root, 0);
    svg.innerHTML = html;

    // 绑定事件
    bindMindmapEvents();
  }

  function bindMindmapEvents() {
    const svg = $('#mindmapSvg');
    $$('.mm-node').forEach(g => {
      const id = g.dataset.id;
      g.onmousedown = e => {
        e.preventDefault();
        if (mmEditing) return;
        const node = findMMNode(mmData.root, id);
        if (!node) return;
        const pt = svgPoint(svg, e);
        mmDrag = { id, dx: pt.x - node._x, dy: pt.y - node._y, moved: false };
      };
      g.ondblclick = e => {
        e.preventDefault();
        e.stopPropagation();
        startEditMMNode(id);
      };
    });
    svg.onmousemove = e => {
      if (!mmDrag) return;
      const node = findMMNode(mmData.root, mmDrag.id);
      if (!node) return;
      const pt = svgPoint(svg, e);
      node._x = pt.x - mmDrag.dx;
      node._y = pt.y - mmDrag.dy;
      mmDrag.moved = true;
      // 重绘位置
      const g = svg.querySelector(`[data-id="${mmDrag.id}"]`);
      if (g) {
        g.querySelector('rect').setAttribute('x', node._x - node._w/2);
        g.querySelector('rect').setAttribute('y', node._y - node._h/2);
        g.querySelector('text').setAttribute('x', node._x);
        g.querySelector('text').setAttribute('y', node._y);
      }
      // 重绘边
      redrawMMEdges();
    };
    svg.onmouseup = () => { mmDrag = null; };
    svg.onmouseleave = () => { mmDrag = null; };

    // 右键添加子节点
    svg.oncontextmenu = e => {
      e.preventDefault();
      const g = e.target.closest('.mm-node');
      if (!g) return;
      const id = g.dataset.id;
      const text = prompt('子节点文本：', '新节点');
      if (text) {
        const node = findMMNode(mmData.root, id);
        if (node) {
          node.children = node.children || [];
          node.children.push({ id: uid(), text, children: [] });
          layoutAndRenderMindmap();
        }
      }
    };
  }

  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function findMMNode(root, id) {
    if (root.id === id) return root;
    for (const c of (root.children || [])) {
      const f = findMMNode(c, id);
      if (f) return f;
    }
    return null;
  }

  function redrawMMEdges() {
    if (!mmData) return;
    const svg = $('#mindmapSvg');
    const edges = svg.querySelectorAll('.mm-edge');
    let i = 0;
    function walk(n) {
      (n.children || []).forEach(c => {
        if (edges[i]) {
          edges[i].setAttribute('d', `M ${n._x + n._w/2} ${n._y} C ${(n._x + c._x)/2} ${n._y}, ${(n._x + c._x)/2} ${c._y}, ${c._x - c._w/2} ${c._y}`);
        }
        i++;
        walk(c);
      });
    }
    walk(mmData.root);
  }

  function startEditMMNode(id) {
    const node = findMMNode(mmData.root, id);
    if (!node) return;
    const svg = $('#mindmapSvg');
    const wrap = svg.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.text;
    input.className = 'mm-edit-input';
    input.style.left = (wrapRect.left + node._x - node._w/2) + 'px';
    input.style.top = (wrapRect.top + node._y - 12) + 'px';
    input.style.width = node._w + 'px';
    document.body.appendChild(input);
    input.focus();
    input.select();
    mmEditing = { id, input, node };
    const finish = () => {
      const v = input.value.trim() || node.text;
      node.text = v;
      input.remove();
      mmEditing = null;
      layoutAndRenderMindmap();
    };
    input.onblur = finish;
    input.onkeydown = e => {
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') { input.remove(); mmEditing = null; layoutAndRenderMindmap(); }
    };
  }

  function saveCurrentMindmap() {
    if (!mmData) { toast('请先生成导图'); return; }
    const title = prompt('保存标题：', mmData.title || '未命名备课');
    if (title) mmData.title = title;
    mmData.ts = Date.now();
    dbPut('mindmaps', mmData);
    state.mindmaps = state.mindmaps.filter(x => x.id !== mmData.id);
    state.mindmaps.push(mmData);
    saveLocalCache();
    renderMindmapHistory();
    toast('已保存到本地');
  }

  window.loadMindmapById = function (id) {
    const m = state.mindmaps.find(x => x.id === id);
    if (!m) return;
    mmData = JSON.parse(JSON.stringify(m));
    $('#mmContent').value = m.title;
    layoutAndRenderMindmap();
    toast('已载入');
  };

  window.delMindmap = async function (id) {
    if (!confirm('确认删除？')) return;
    await dbDel('mindmaps', id);
    state.mindmaps = state.mindmaps.filter(x => x.id !== id);
    saveLocalCache();
    renderMindmapHistory();
  };

  function loadMindmapHistory() {
    renderMindmapHistory();
    if (state.mindmaps.length === 0) { toast('暂无历史备课'); return; }
  }

  function exportMindmapPNG() {
    if (!mmData) { toast('请先生成导图'); return; }
    const svg = $('#mindmapSvg');
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth * 2;
      canvas.height = svg.clientHeight * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${mmData.title || '思维导图'}_${todayStr()}.png`;
        a.click();
        toast('已导出 PNG');
      });
    };
    img.src = url;
  }

  function handleMindmapImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || !data.root) { toast('JSON 格式不正确，需要包含 root 字段'); return; }
        mmData = data;
        mmData.id = mmData.id || uid();
        mmData.title = mmData.title || '导入备课';
        mmData.ts = mmData.ts || Date.now();
        layoutAndRenderMindmap();
        toast('思维导图已导入');
      } catch (err) {
        toast('JSON 解析失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function exportMindmapJSON() {
    if (!mmData) { toast('请先生成导图'); return; }
    // 清除内部布局属性后导出
    const cleanData = JSON.parse(JSON.stringify(mmData));
    function cleanNode(n) {
      delete n._x; delete n._y; delete n._w; delete n._h;
      (n.children || []).forEach(c => cleanNode(c));
    }
    cleanNode(cleanData.root);
    const json = JSON.stringify(cleanData, null, 2);
    downloadFile(json, `${mmData.title || '思维导图'}_${todayStr()}.json`, 'application/json');
    toast('已导出 JSON');
  }

  // ================= 工作看板 =================
  function renderKanban() {
    $$('.kanban-items').forEach(col => {
      const status = col.dataset.status;
      const items = state.todos.filter(t => t.status === status);
      col.innerHTML = items.map(t => `
        <div class="kanban-card" draggable="true" data-id="${t.id}" data-action="edit">
          <h4>${escapeHtml(t.title)}</h4>
          ${t.note ? `<p>${escapeHtml(t.note)}</p>` : ''}
          <div class="meta">
            <span>${t.dueDate || '无截止'}</span>
            <span>${t.cycle ? '周期' : ''}</span>
          </div>
        </div>
      `).join('');
    });
    bindKanbanDrag();
    // 绑定卡片点击
    $$('.kanban-card').forEach(card => {
      card.onclick = e => {
        if (e.target.tagName === 'BUTTON') return;
        if (card.draggable && card.dataset.dragged === '1') return;
        editTodoModal(card.dataset.id);
      };
    });
  }
  function bindKanbanDrag() {
    $$('.kanban-card').forEach(card => {
      card.ondragstart = e => {
        card.classList.add('dragging');
        card.dataset.dragged = '0';
        e.dataTransfer.setData('text/plain', card.dataset.id);
      };
      card.ondrag = () => { card.dataset.dragged = '1'; };
      card.ondragend = e => {
        card.classList.remove('dragging');
        setTimeout(() => { card.dataset.dragged = '0'; }, 200);
      };
    });
    $$('.kanban-items').forEach(col => {
      col.ondragover = e => { e.preventDefault(); col.classList.add('drag-over'); };
      col.ondragleave = () => col.classList.remove('drag-over');
      col.ondrop = async e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const t = state.todos.find(x => x.id === id);
        if (t) {
          t.status = col.dataset.status;
          await dbPut('todos', t);
          saveLocalCache();
          renderKanban();
        }
      };
    });
  }

  window.editTodoModal = function (id) {
    const t = id ? state.todos.find(x => x.id === id) : { status: 'todo' };
    const body = `
      <label>标题 <input type="text" id="td_title" value="${escapeHtml(t.title||'')}"></label>
      <label>状态
        <select id="td_status">
          <option value="todo" ${t.status==='todo'?'selected':''}>待办</option>
          <option value="doing" ${t.status==='doing'?'selected':''}>进行中</option>
          <option value="done" ${t.status==='done'?'selected':''}>已完成</option>
        </select>
      </label>
      <label>截止日期 <input type="date" id="td_due" value="${t.dueDate||''}"></label>
      <label>是否周期 <input type="checkbox" id="td_cycle" ${t.cycle?'checked':''}></label>
      <label>备注 <textarea id="td_note" rows="2">${escapeHtml(t.note||'')}</textarea></label>
    `;
    openModal(id ? '编辑任务' : '新增任务', body, `
      <button class="btn-ghost" onclick="window.__app.closeModal()">取消</button>
      ${id ? '<button class="btn-danger" id="td_del">删除</button>' : ''}
      <button class="btn-primary" id="td_save">保存</button>
    `);
    if (id) {
      $('#td_del').onclick = async () => {
        await dbDel('todos', id);
        state.todos = state.todos.filter(x => x.id !== id);
        saveLocalCache();
        closeModal();
        renderKanban();
        toast('已删除');
      };
    }
    $('#td_save').onclick = async () => {
      const data = {
        id: id || uid(),
        title: $('#td_title').value || '未命名',
        status: $('#td_status').value,
        dueDate: $('#td_due').value,
        cycle: $('#td_cycle').checked,
        note: $('#td_note').value,
        ts: Date.now()
      };
      await dbPut('todos', data);
      state.todos = state.todos.filter(x => x.id !== data.id);
      state.todos.push(data);
      saveLocalCache();
      closeModal();
      renderKanban();
      toast('已保存');
    };
  };

  // ================= 工具中心 =================
  let timerInterval = null;
  let timerRemaining = 0;
  function updateTimerDisplay() {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
    $('#timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function startTimer() {
    if (timerInterval) return;
    if (timerRemaining === 0) timerRemaining = 600;
    timerInterval = setInterval(() => {
      timerRemaining--;
      updateTimerDisplay();
      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        toast('时间到！');
        try { playBeep(); } catch (e) {}
      }
    }, 1000);
  }
  function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  function resetTimer() {
    pauseTimer();
    timerRemaining = 0;
    updateTimerDisplay();
  }
  function setTimer(sec) {
    pauseTimer();
    timerRemaining = sec;
    updateTimerDisplay();
  }
  function playBeep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 800;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.6);
  }

  function addClip() {
    const text = $('#clipInput').value.trim();
    if (!text) return;
    const item = { id: uid(), text, ts: Date.now() };
    dbPut('clips', item);
    state.clips.push(item);
    saveLocalCache();
    $('#clipInput').value = '';
    renderClips();
    toast('已保存');
  }
  function renderClips() {
    const el = $('#clipList');
    el.innerHTML = state.clips.slice().reverse().map(c => `
      <li>
        <span style="flex:1;cursor:pointer" onclick="window.__app.copyText(\`${escapeAttr(c.text)}\`)">${escapeHtml(c.text)}</span>
        <button onclick="window.__app.delClip('${c.id}')">×</button>
      </li>
    `).join('');
  }
  window.delClip = async function (id) {
    await dbDel('clips', id);
    state.clips = state.clips.filter(x => x.id !== id);
    saveLocalCache();
    renderClips();
  };
  function renderTools() {
    renderClips();
    updateTimerDisplay();
  }
  function renderSticky() {
    const note = state.sticky.find(s => s.id === 'main');
    $('#stickyNote').value = note ? note.text : '';
  }

  // ================= 数据备份/恢复 =================
  function renderData() {
    $('#gitmindStatus').textContent = '未连接';
  }

  async function backupData() {
    const data = { version: 1, ts: Date.now(), payload: {} };
    for (const s of STORES) {
      data.payload[s] = state[s] || [];
    }
    // 头像和背景图也包含在 settings 中
    const json = JSON.stringify(data, null, 2);
    const filename = `语文工作台备份_${todayStr()}_${Date.now()}.json`;
    downloadFile(json, filename, 'application/json');
    toast('备份文件已下载，建议上传至夸克网盘');
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function restoreData(file) {
    if (!file) return;
    if (!confirm('恢复将覆盖当前所有数据，确认继续？')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.payload) { toast('文件格式错误'); return; }
        await dbClearAll();
        state.settings = []; state.card = []; state.classes = []; state.students = [];
        state.communications = []; state.templates = []; state.callbacks = [];
        state.hours = []; state.library = []; state.mindmaps = []; state.todos = [];
        state.clips = []; state.sticky = [];
        for (const s of STORES) {
          if (data.payload[s]) {
            for (const item of data.payload[s]) {
              await dbPut(s, item);
              state[s].push(item);
            }
          }
        }
        saveLocalCache();
        applySettings();
        renderDashboard();
        toast('数据已恢复');
      } catch (err) {
        toast('恢复失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function testGitmind() {
    $('#gitmindStatus').textContent = '正在连接…';
    // GitMind 没有公开 API 通道，使用 web 测试连通性
    const img = new Image();
    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      $('#gitmindStatus').textContent = ok ? '已连接 ✓（手动同步请使用导出 JSON 后上传）' : '连接失败：' + msg;
      $('#gitmindStatus').style.color = ok ? 'var(--success)' : 'var(--danger)';
    };
    // 尝试访问 GitMind
    fetch('https://www.gitmind.com/', { mode: 'no-cors' })
      .then(() => finish(true))
      .catch(err => {
        // no-cors 模式下不会真正失败
        finish(false, '无法访问 GitMind');
      });
    setTimeout(() => finish(true, 'GitMind 服务端无公开 API，建议使用夸克网盘备份'), 3000);
  }

  async function clearAllData() {
    if (!confirm('确认清空所有数据？此操作不可恢复！')) return;
    if (!confirm('再次确认：所有数据将永久删除，建议先备份！')) return;
    await dbClearAll();
    STORES.forEach(s => state[s] = []);
    saveLocalCache();
    applySettings();
    renderDashboard();
    toast('已清空所有数据');
  }

  // ================= WPS 导出 =================
  function exportAllToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();

    // Sheet 1: 学员总表
    const stuRows = [['姓名', '年级', '班级', '学校', '家长电话', '课时', '薄弱项', '标签']];
    state.students.forEach(s => stuRows.push([
      s.name || '', s.grade || '', s.className || '', s.school || '',
      s.phone || '', s.hours || 0, s.weakness || '', (s.tags || []).join('、')
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stuRows), '学员总表');

    // Sheet 2: 成绩明细
    const scoreRows = [['学员', '类型', '日期', '分数']];
    state.students.forEach(s => {
      (s.scores || []).forEach(sc => scoreRows.push([s.name || '', sc.type || '', sc.date || '', sc.score || 0]));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scoreRows), '成绩明细');

    // Sheet 3: 沟通记录
    const commRows = [['学员', '沟通类型', '日期', '内容']];
    state.communications.forEach(c => {
      const s = state.students.find(x => x.id === c.studentId);
      commRows.push([s ? s.name : '', c.type || '', fmtDate(c.ts), c.content || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(commRows), '沟通记录');

    // Sheet 4: 课时记录
    const hourRows = [['学员', '类型', '日期', '课时数', '备注']];
    state.hours.forEach(h => {
      const s = state.students.find(x => x.id === h.studentId);
      hourRows.push([s ? s.name : '', h.type || '', h.date || '', h.hours || 0, h.note || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hourRows), '课时记录');

    XLSX.writeFile(wb, `语文工作台_全量导出_${todayStr()}.xlsx`);
    toast('WPS 全量导出已完成');
  }

  function exportStudentsToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['姓名', '年级', '班级', '学校', '家长电话', '课时', '薄弱项', '标签']];
    state.students.forEach(s => rows.push([
      s.name || '', s.grade || '', s.className || '', s.school || '',
      s.phone || '', s.hours || 0, s.weakness || '', (s.tags || []).join('、')
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '学员列表');
    XLSX.writeFile(wb, `学员列表_${todayStr()}.xlsx`);
    toast('学员列表已导出');
  }

  function exportCommunicationsToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['学员', '沟通类型', '日期', '内容']];
    state.communications.forEach(c => {
      const s = state.students.find(x => x.id === c.studentId);
      rows.push([s ? s.name : '', c.type || '', fmtDate(c.ts), c.content || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '沟通记录');
    XLSX.writeFile(wb, `沟通记录_${todayStr()}.xlsx`);
    toast('沟通记录已导出');
  }

  function exportHoursToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['学员', '类型', '日期', '课时数', '备注']];
    state.hours.forEach(h => {
      const s = state.students.find(x => x.id === h.studentId);
      rows.push([s ? s.name : '', h.type || '', h.date || '', h.hours || 0, h.note || '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '课时记录');
    XLSX.writeFile(wb, `课时记录_${todayStr()}.xlsx`);
    toast('课时记录已导出');
  }

  function exportLibraryToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['标题', '类型', '适用年级', '备注', '日期']];
    state.library.forEach(l => rows.push([
      l.title || '', l.type || '', l.grade || '', l.note || '', fmtDate(l.ts)
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '素材清单');
    XLSX.writeFile(wb, `素材清单_${todayStr()}.xlsx`);
    toast('素材清单已导出');
  }

  function exportKanbanToWPS() {
    if (typeof XLSX === 'undefined') { toast('表格组件未就绪'); return; }
    const wb = XLSX.utils.book_new();
    const rows = [['标题', '状态', '截止日期', '是否周期', '备注', '日期']];
    state.todos.forEach(t => rows.push([
      t.title || '', t.status === 'todo' ? '待办' : (t.status === 'doing' ? '进行中' : '已完成'),
      t.dueDate || '', t.cycle ? '是' : '否', t.note || '', fmtDate(t.ts)
    ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '看板任务');
    XLSX.writeFile(wb, `看板任务_${todayStr()}.xlsx`);
    toast('看板任务已导出');
  }

  // ================= 全局搜索 =================
  function doSearch(q) {
    if (!q) { $('#searchResult').classList.remove('active'); return; }
    q = q.toLowerCase();
    const results = [];
    state.students.forEach(s => {
      if ((s.name||'').toLowerCase().includes(q) || (s.weakness||'').toLowerCase().includes(q)) {
        results.push({ type: '学员', text: s.name, action: `window.__app.openStudent('${s.id}')` });
      }
    });
    state.communications.forEach(c => {
      if ((c.content||'').toLowerCase().includes(q)) {
        const s = state.students.find(x => x.id === c.studentId);
        results.push({ type: '沟通', text: (s ? s.name : '') + ' · ' + (c.content || '').slice(0, 30), action: `window.__app.openStudent('${c.studentId}')` });
      }
    });
    state.templates.forEach(t => {
      if ((t.title||'').toLowerCase().includes(q) || (t.content||'').toLowerCase().includes(q)) {
        results.push({ type: '话术', text: t.title, action: "showPage('communicate');setTimeout(()=>{$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='template'));$$('.tab-content').forEach(c=>c.hidden=c.id!=='tab-template')},50)" });
      }
    });
    state.classes.forEach(c => {
      if ((c.name||'').toLowerCase().includes(q)) {
        results.push({ type: '班级', text: c.name, action: "showPage('schedule')" });
      }
    });
    state.library.forEach(l => {
      if ((l.title||'').toLowerCase().includes(q) || (l.content||'').toLowerCase().includes(q)) {
        results.push({ type: '素材', text: l.title, action: "showPage('library')" });
      }
    });
    state.mindmaps.forEach(m => {
      if ((m.title||'').toLowerCase().includes(q)) {
        results.push({ type: '备课', text: m.title, action: `window.__app.loadMindmapById('${m.id}')` });
      }
    });
    state.todos.forEach(t => {
      if ((t.title||'').toLowerCase().includes(q)) {
        results.push({ type: '任务', text: t.title, action: "showPage('kanban')" });
      }
    });

    const el = $('#searchResult');
    if (results.length === 0) {
      el.innerHTML = '<div class="sr-item">无匹配结果</div>';
    } else {
      el.innerHTML = results.slice(0, 20).map(r => `
        <div class="sr-item" onclick="${r.action}; document.getElementById('searchResult').classList.remove('active'); document.getElementById('globalSearch').value=''">
          <span class="badge" style="background:var(--primary);color:#fff;padding:1px 6px;border-radius:8px;font-size:10px">${r.type}</span>
          ${escapeHtml(r.text)}
        </div>
      `).join('');
    }
    el.classList.add('active');
  }

  // ================= 通用工具函数 =================
  function escapeHtml(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, '&#96;');
  }
  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ================= 生活助手 =================
  function renderLife() {
    renderExpress();
    renderMemos();
    renderCountdowns();
  }

  function renderExpress() {
    const el = $('#expressList');
    if (!el) return;
    el.innerHTML = state.express.slice().reverse().map(e => `
      <li class="record-item">
        <div>
          <strong>${escapeHtml(e.company)}</strong>
          <span style="margin-left:8px;color:var(--text-muted);font-size:12px">${escapeHtml(e.no)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted)">${fmtDate(e.ts).slice(0,10)}</span>
          <a class="btn-link" href="https://www.kuaidi100.com/chaxun?nu=${encodeURIComponent(e.no)}" target="_blank" rel="noopener" style="font-size:12px">查询</a>
          <button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="window.__app.delLife('express','${e.id}')">删</button>
        </div>
      </li>
    `).join('') || '<li style="padding:12px;color:var(--text-muted);font-size:13px">暂无快递记录</li>';
  }

  function renderMemos() {
    const el = $('#memoList');
    if (!el) return;
    el.innerHTML = state.memos.slice().reverse().map(m => `
      <li class="record-item">
        <span>${escapeHtml(m.text)}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted)">${fmtDate(m.ts).slice(5,10)}</span>
          <button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="window.__app.delLife('memos','${m.id}')">删</button>
        </div>
      </li>
    `).join('') || '<li style="padding:12px;color:var(--text-muted);font-size:13px">暂无记事</li>';
  }

  function renderCountdowns() {
    const el = $('#cdList');
    if (!el) return;
    const now = Date.now();
    el.innerHTML = state.countdowns.map(c => {
      const diff = new Date(c.date).getTime() - now;
      const days = Math.ceil(diff / 86400000);
      const text = days > 0 ? `还剩 ${days} 天` : days === 0 ? '今天' : `已过 ${-days} 天`;
      const color = days > 0 && days <= 7 ? 'var(--danger)' : 'var(--text-muted)';
      return `
        <li class="record-item">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <span style="margin-left:8px;font-size:12px;color:var(--text-muted)">${c.date}</span>
          </div>
          <span style="font-size:14px;font-weight:600;color:${color}">${text}</span>
          <button class="btn-ghost" style="font-size:11px;padding:2px 8px" onclick="window.__app.delLife('countdowns','${c.id}')">删</button>
        </li>
      `;
    }).join('') || '<li style="padding:12px;color:var(--text-muted);font-size:13px">暂无倒计时</li>';
  }

  async function addExpress() {
    const company = $('#expressCompany').value.trim();
    const no = $('#expressNo').value.trim();
    if (!company || !no) { toast('请填写快递公司和单号'); return; }
    const item = { id: uid(), company, no, ts: Date.now() };
    await dbPut('express', item);
    state.express.push(item);
    saveLocalCache();
    $('#expressCompany').value = '';
    $('#expressNo').value = '';
    renderExpress();
    toast('快递已记录');
  }

  async function addMemo() {
    const text = $('#memoInput').value.trim();
    if (!text) return;
    const item = { id: uid(), text, ts: Date.now() };
    await dbPut('memos', item);
    state.memos.push(item);
    saveLocalCache();
    $('#memoInput').value = '';
    renderMemos();
  }

  async function addCountdown() {
    const name = $('#cdName').value.trim();
    const date = $('#cdDate').value;
    if (!name || !date) { toast('请填写事件名称和日期'); return; }
    const item = { id: uid(), name, date, ts: Date.now() };
    await dbPut('countdowns', item);
    state.countdowns.push(item);
    saveLocalCache();
    $('#cdName').value = '';
    $('#cdDate').value = '';
    renderCountdowns();
    toast('倒计时已添加');
  }

  async function delLifeItem(store, id) {
    await dbDel(store, id);
    state[store] = state[store].filter(x => x.id !== id);
    saveLocalCache();
    if (store === 'express') renderExpress();
    if (store === 'memos') renderMemos();
    if (store === 'countdowns') renderCountdowns();
  }

  async function queryWeather() {
    const city = $('#weatherCity').value.trim();
    if (!city) { toast('请输入城市名'); return; }
    $('#weatherResult').innerHTML = '<p class="hint">查询中…</p>';
    try {
      const resp = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      const data = await resp.json();
      const cur = data.current_condition[0];
      const desc = cur.weatherDesc[0].value;
      const temp = cur.temp_C;
      const humidity = cur.humidity;
      const wind = cur.windspeedKmph;
      $('#weatherResult').innerHTML = `
        <div style="padding:16px;text-align:center">
          <div style="font-size:36px;font-weight:700">${temp}°C</div>
          <div style="font-size:14px;color:var(--text-soft);margin:4px 0">${desc}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px">
            湿度 ${humidity}% · 风速 ${wind}km/h
          </div>
        </div>
      `;
    } catch (e) {
      $('#weatherResult').innerHTML = '<p class="hint" style="color:var(--danger)">查询失败，请稍后重试</p>';
    }
  }

  // 生活助手事件绑定
  function bindLifeEvents() {
    $$('.life-tab').forEach(tab => {
      tab.onclick = () => {
        $$('.life-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.life-content').forEach(c => c.hidden = true);
        $('#ltab-' + tab.dataset.ltab).hidden = false;
      };
    });
    const addExpressBtn = $('#addExpressBtn');
    if (addExpressBtn) addExpressBtn.onclick = addExpress;
    const addMemoBtn = $('#addMemoBtn');
    if (addMemoBtn) addMemoBtn.onclick = addMemo;
    const addCdBtn = $('#addCdBtn');
    if (addCdBtn) addCdBtn.onclick = addCountdown;
    const weatherBtn = $('#weatherBtn');
    if (weatherBtn) weatherBtn.onclick = queryWeather;
  }

  window.confirmDelete = async function (store, id, name) {
    if (!confirm(`确认删除「${name}」？`)) return;
    await dbDel(store, id);
    state[store] = state[store].filter(x => x.id !== id);
    saveLocalCache();
    // 重新渲染当前页
    const active = $$('.nav-item.active')[0];
    if (active) showPage(active.dataset.page);
    toast('已删除');
  };

  window.__app = {
    editClassModal, editStudentModal, editCommModal, editTemplateModal,
    editCallbackModal, editHourModal, editLibModal, editTodoModal,
    editCardModal, downloadLibFile,
    openStudent, addScore, delScore, saveScores, addReport, saveReport,
    delReport, delComm, loadMindmapById, delMindmap, copyText, delClip,
    confirmDelete, closeModal, delLife: delLifeItem
  };

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
