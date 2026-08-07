/* ============================================================
   教培机构 AI 工作台 — 主应用（移动优先 / localStorage 持久化）
   版本 v1.0  依赖：echarts.min.js
   ============================================================ */
(function () {
  'use strict';

  // ===================== 工具 =====================
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMoney = (n) => '¥' + Number(n || 0).toLocaleString('zh-CN');
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => { if (!d) return ''; d = String(d); return d.length >= 10 ? d.slice(0, 10) : d; };
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const daysBetween = (a, b) => { const x = new Date(fmtDate(a)), y = new Date(fmtDate(b)); return Math.round((y - x) / 86400000); };

  // ===================== Toast / Loading =====================
  const toastEl = $('#toast'); let toastTimer = null;
  function toast(msg, dur) { toastEl.textContent = msg; toastEl.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('hidden'), dur || 2200); }
  const loadingEl = $('#loading'); const loadingTx = $('#loadingTx');
  function showLoading(tx) { loadingTx.textContent = tx || '处理中…'; loadingEl.classList.remove('hidden'); }
  function hideLoading() { loadingEl.classList.add('hidden'); }

  // ===================== 底部抽屉 =====================
  const sheetMask = $('#sheetMask'), sheetTitle = $('#sheetTitle'), sheetBody = $('#sheetBody'), sheetFoot = $('#sheetFoot');
  function openSheet(title, bodyHTML, footHTML) {
    sheetTitle.textContent = title; sheetBody.innerHTML = bodyHTML || '';
    sheetFoot.innerHTML = footHTML || ''; sheetMask.classList.remove('hidden');
    bindFormSubmit(sheetBody);
  }
  function closeSheet() { sheetMask.classList.add('hidden'); sheetBody.innerHTML = ''; sheetFoot.innerHTML = ''; }
  $('#sheetClose').onclick = closeSheet;
  sheetMask.addEventListener('click', (e) => { if (e.target === sheetMask) closeSheet(); });

  // ===================== 全屏子页 =====================
  const subPage = $('#subPage'), subTitle = $('#subTitle'), subBody = $('#subBody');
  function openSub(title, html) { subTitle.textContent = title; subBody.innerHTML = html; subPage.classList.remove('hidden'); bindFormSubmit(subBody); }
  function closeSub() { subPage.classList.add('hidden'); subBody.innerHTML = ''; }
  $('#subBack').onclick = closeSub;

  // ===================== 状态存储 =====================
  const STORE_KEY = 'wb_state_v1';
  const LOGIN_KEY = 'wb_logged_v1';
  let S = null;
  let chartInsts = [];

  function loadState() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  function clearCharts() { chartInsts.forEach(c => { try { c.dispose(); } catch (e) {} }); chartInsts = []; }
  function mountChart(el, opt) { const c = echarts.init(el); c.setOption(opt); chartInsts.push(c); setTimeout(() => c.resize(), 30); }

  // ===================== 种子数据：小圈教育 =====================
  function mkStu(name, avatar, grade, subject, status, parent, parentPhone, remaining, totalFee, weak, scores) {
    return { id: uid(), name, avatar, grade, subject, status, parent, parentPhone, remaining, totalFee, weak: weak || [], scores: scores || [] };
  }
  function mkClass(name, grade, subject, teacher, time, room, students) { return { id: uid(), name, grade, subject, teacher, time, room, students: students || [] }; }
  function mkPkg(name, lessons, subject, price, oldPrice, popular) { return { id: uid(), name, lessons, subject, price, oldPrice, popular: !!popular }; }
  function mkPay(student, amount, type, pkg, date) { return { id: uid(), student, amount, type, pkg, date, staff: '李老师' }; }
  function mkFb(student, type, content, date, sentiment, star) { return { id: uid(), student, type, content, date, sentiment, star }; }
  function mkAtt(student, status, note) { return { id: uid(), student, status, note: note || '', date: todayStr() }; }
  function mkComm(student, channel, type, content, date) { return { id: uid(), student, channel, type, content, date }; }
  function shiftDate(base, days) { const d = new Date(fmtDate(base)); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  function seedData() {
    const T = todayStr();
    const students = [
      mkStu('王梓萱', '🌟', '初二', '数学·英语', '在读', '王女士', '13800001001', 18, 10800, ['作文薄弱'], [
        { exam: '9月月考', subject: '数学', score: 82, date: '2026-09-10' }, { exam: '10月月考', subject: '数学', score: 86, date: '2026-10-12' },
        { exam: '期中', subject: '数学', score: 90, date: '2026-11-08' }, { exam: '12月月考', subject: '数学', score: 93, date: '2026-12-10' }, { exam: '期末', subject: '数学', score: 96, date: '2027-01-12' },
        { exam: '9月月考', subject: '英语', score: 78, date: '2026-09-10' }, { exam: '10月月考', subject: '英语', score: 82, date: '2026-10-12' }, { exam: '期中', subject: '英语', score: 86, date: '2026-11-08' }, { exam: '12月月考', subject: '英语', score: 89, date: '2026-12-10' }, { exam: '期末', subject: '英语', score: 91, date: '2027-01-12' }
      ]),
      mkStu('李浩然', '⚽', '初三', '物理', '流失预警', '李先生', '13800001002', 3, 5400, ['物理基础薄弱'], [
        { exam: '9月月考', subject: '物理', score: 75, date: '2026-09-10' }, { exam: '10月月考', subject: '物理', score: 72, date: '2026-10-12' }, { exam: '期中', subject: '物理', score: 70, date: '2026-11-08' }, { exam: '12月月考', subject: '物理', score: 68, date: '2026-12-10' }, { exam: '期末', subject: '物理', score: 65, date: '2027-01-12' }
      ]),
      mkStu('张子涵', '🎨', '五年级', '语文', '在读', '张女士', '13800001003', 22, 3840, ['古诗文薄弱'], [
        { exam: '9月月考', subject: '语文', score: 88, date: '2026-09-10' }, { exam: '10月月考', subject: '语文', score: 90, date: '2026-10-12' }, { exam: '期中', subject: '语文', score: 85, date: '2026-11-08' }, { exam: '12月月考', subject: '语文', score: 92, date: '2026-12-10' }, { exam: '期末', subject: '语文', score: 94, date: '2027-01-12' }
      ]),
      mkStu('刘思琪', '🌸', '高一', '数学', '在读', '刘女士', '13800001004', 12, 5760, ['数学基础薄弱'], [
        { exam: '9月月考', subject: '数学', score: 60, date: '2026-09-10' }, { exam: '10月月考', subject: '数学', score: 58, date: '2026-10-12' }, { exam: '期中', subject: '数学', score: 62, date: '2026-11-08' }, { exam: '12月月考', subject: '数学', score: 55, date: '2026-12-10' }, { exam: '期末', subject: '数学', score: 52, date: '2027-01-12' }
      ]),
      mkStu('陈逸飞', '🚀', '初二', '英语', '在读', '陈先生', '13800001005', 16, 8640, [], [
        { exam: '9月月考', subject: '英语', score: 91, date: '2026-09-10' }, { exam: '10月月考', subject: '英语', score: 93, date: '2026-10-12' }, { exam: '期中', subject: '英语', score: 95, date: '2026-11-08' }, { exam: '12月月考', subject: '英语', score: 96, date: '2026-12-10' }, { exam: '期末', subject: '英语', score: 98, date: '2027-01-12' }
      ]),
      mkStu('赵欣怡', '🍎', '六年级', '数学', '试听', '赵女士', '13800001006', 2, 0, [], [
        { exam: '试听1', subject: '数学', score: 85, date: '2026-12-20' }, { exam: '试听2', subject: '数学', score: 88, date: '2027-01-05' }
      ]),
      mkStu('孙铭泽', '🦊', '初三', '化学', '在读', '孙先生', '13800001007', 14, 5200, [], [
        { exam: '9月月考', subject: '化学', score: 70, date: '2026-09-10' }, { exam: '10月月考', subject: '化学', score: 73, date: '2026-10-12' }, { exam: '期中', subject: '化学', score: 71, date: '2026-11-08' }, { exam: '12月月考', subject: '化学', score: 76, date: '2026-12-10' }, { exam: '期末', subject: '化学', score: 79, date: '2027-01-12' }
      ]),
      mkStu('周语桐', '🐱', '高一', '英语', '流失预警', '周女士', '13800001008', 2, 4600, ['英语下滑'], [
        { exam: '9月月考', subject: '英语', score: 80, date: '2026-09-10' }, { exam: '10月月考', subject: '英语', score: 78, date: '2026-10-12' }, { exam: '期中', subject: '英语', score: 75, date: '2026-11-08' }, { exam: '12月月考', subject: '英语', score: 72, date: '2026-12-10' }, { exam: '期末', subject: '英语', score: 70, date: '2027-01-12' }
      ]),
      mkStu('吴俊熙', '🐯', '初二', '数学', '在读', '吴先生', '13800001009', 20, 9600, [], [
        { exam: '9月月考', subject: '数学', score: 88, date: '2026-09-10' }, { exam: '10月月考', subject: '数学', score: 90, date: '2026-10-12' }, { exam: '期中', subject: '数学', score: 92, date: '2026-11-08' }, { exam: '12月月考', subject: '数学', score: 94, date: '2026-12-10' }, { exam: '期末', subject: '数学', score: 96, date: '2027-01-12' }
      ]),
      mkStu('郑雅雯', '🌺', '四年级', '语文', '在读', '郑女士', '13800001010', 24, 4800, [], [
        { exam: '9月月考', subject: '语文', score: 92, date: '2026-09-10' }, { exam: '10月月考', subject: '语文', score: 94, date: '2026-10-12' }, { exam: '期中', subject: '语文', score: 93, date: '2026-11-08' }, { exam: '12月月考', subject: '语文', score: 95, date: '2026-12-10' }, { exam: '期末', subject: '语文', score: 96, date: '2027-01-12' }
      ]),
      mkStu('黄子轩', '🐼', '初三', '物理', '在读', '黄先生', '13800001011', 15, 6200, [], [
        { exam: '9月月考', subject: '物理', score: 65, date: '2026-09-10' }, { exam: '10月月考', subject: '物理', score: 68, date: '2026-10-12' }, { exam: '期中', subject: '物理', score: 72, date: '2026-11-08' }, { exam: '12月月考', subject: '物理', score: 75, date: '2026-12-10' }, { exam: '期末', subject: '物理', score: 80, date: '2027-01-12' }
      ]),
      mkStu('徐若汐', '🌊', '高一', '数学', '试听', '徐女士', '13800001012', 2, 0, [], [
        { exam: '试听1', subject: '数学', score: 78, date: '2026-12-22' }, { exam: '试听2', subject: '数学', score: 82, date: '2027-01-06' }
      ])
    ];
    const classes = [
      mkClass('初二数学培优班', '初二', '数学', '王老师', '周六 09:00', '302室', ['王梓萱', '吴俊熙']),
      mkClass('初三物理冲刺班', '初三', '物理', '李老师', '周日 14:00', '201室', ['李浩然', '黄子轩']),
      mkClass('小学作文启蒙班', '小学', '语文', '张老师', '周日 10:00', '101室', ['张子涵', '郑雅雯']),
      mkClass('高一英语进阶班', '高一', '英语', '陈老师', '周六 15:00', '203室', ['陈逸飞', '周语桐']),
      mkClass('初三化学强化班', '初三', '化学', '孙老师', '周日 09:00', '202室', ['孙铭泽'])
    ];
    const packages = [
      mkPkg('数学培优·20课时', 20, '数学', 2400, 3000, true), mkPkg('物理冲刺·30课时', 30, '物理', 3600, 4500, false),
      mkPkg('英语进阶·24课时', 24, '英语', 2880, 3600, true), mkPkg('语文素养·16课时', 16, '语文', 1920, 2400, false),
      mkPkg('化学强化·20课时', 20, '化学', 2600, 3200, false), mkPkg('期末抢分·10课时', 10, '综合', 1500, 1800, false),
      mkPkg('一对一·10课时', 10, '全科', 4000, 4800, false), mkPkg('暑托班·40课时', 40, '综合', 3200, 4000, false),
      mkPkg('新概念英语·36课时', 36, '英语', 4320, 5400, true)
    ];
    const payments = [
      mkPay('王梓萱', 2400, '续费', '数学培优·20课时', '2026-07-20'), mkPay('陈逸飞', 2880, '续费', '英语进阶·24课时', '2026-07-15'),
      mkPay('李浩然', 1800, '补缴', '物理冲刺·30课时', '2026-06-30'), mkPay('吴俊熙', 3600, '新报', '数学培优·20课时', '2026-07-10'),
      mkPay('张子涵', 1920, '续费', '语文素养·16课时', '2026-07-05'), mkPay('黄子轩', 2600, '续费', '物理冲刺·30课时', '2026-07-22')
    ];
    const feedback = [
      mkFb('王梓萱', '上课反馈', '今天课堂主动讲解了几何辅助线做法，思路清晰，五连涨势头很好！', '2026-07-29', 'positive', 5),
      mkFb('李浩然', '学情反馈', '物理力学板块连续两次下滑，已单独留了针对性练习，需家长关注作业完成情况。', '2026-07-28', 'negative', 3),
      mkFb('陈逸飞', '上课反馈', '英语阅读满分，写作句式有亮点，建议尝试更高阶素材。', '2026-07-27', 'positive', 5),
      mkFb('张子涵', '学情反馈', '古诗文默写仍有错字，已整理易错清单，下周小测。', '2026-07-26', 'neutral', 4),
      mkFb('周语桐', '学情反馈', '英语成绩连续下滑，剩余课时仅2节，建议尽快沟通续费或调整方案。', '2026-07-25', 'negative', 3),
      mkFb('吴俊熙', '上课反馈', '数学压轴题方法掌握扎实，可冲击满分，状态稳定。', '2026-07-24', 'positive', 5),
      mkFb('孙铭泽', '上课反馈', '化学配平进步明显，本次小测提升4分。', '2026-07-23', 'positive', 4),
      mkFb('黄子轩', '学情反馈', '物理从65提升到80，进步显著，鼓励保持节奏。', '2026-07-22', 'positive', 5),
      mkFb('郑雅雯', '上课反馈', '作文结构清晰，表达生动，是班级范文。', '2026-07-21', 'positive', 5),
      mkFb('刘思琪', '学情反馈', '数学基础仍薄弱，函数概念混淆，已约一对一补强。', '2026-07-20', 'negative', 3)
    ];
    const attendance = [
      mkAtt('王梓萱', '出勤'), mkAtt('吴俊熙', '出勤'), mkAtt('陈逸飞', '出勤'), mkAtt('张子涵', '出勤'),
      mkAtt('郑雅雯', '出勤'), mkAtt('黄子轩', '出勤'), mkAtt('孙铭泽', '迟到'), mkAtt('刘思琪', '出勤'),
      mkAtt('李浩然', '出勤'), mkAtt('赵欣怡', '请假'), mkAtt('周语桐', '缺勤')
    ];
    const salaryRules = [
      { id: uid(), name: '续费提成', type: '提成', value: 8, unit: '%', desc: '续费金额按 8% 计提成' },
      { id: uid(), name: '新报提成', type: '提成', value: 12, unit: '%', desc: '新签学员按 12% 计提成' }
    ];
    const comms = [
      mkComm('王梓萱', '微信', '续报引导', '王梓萱妈妈，孩子数学五连涨到96分，状态特别好，建议锁定数学培优课包续费立省¥600~', '2026-07-29'),
      mkComm('李浩然', '电话', '批评鼓励', '和李浩然爸爸沟通了物理下滑情况，约定每天错题打卡，家校配合。', '2026-07-28'),
      mkComm('周语桐', '微信', '学情反馈', '周语桐英语连续下滑，剩余2课时，已发送学情报告并约回访。', '2026-07-25'),
      mkComm('张子涵', '微信', '请假通知', '温馨提示：本周日作文班因老师教研调至周日15:00，请知悉。', '2026-07-26')
    ];
    const followups = [
      { id: uid(), student: '王梓萱', content: '数学五连涨，趁热打铁推进续费/转介绍', due: T, done: false, prio: '高' },
      { id: uid(), student: '周语桐', content: '英语下滑+课时将尽，电话挽回并给调整方案', due: shiftDate(T, -6), done: false, prio: '高' }
    ];
    const todos = [
      { id: uid(), text: '打印期末模拟试卷', due: shiftDate(T, 1), done: false, prio: '中' },
      { id: uid(), text: '整理学员打卡资料', due: shiftDate(T, 2), done: false, prio: '低' },
      { id: uid(), text: '和教务对接下周排课', due: T, done: false, prio: '高' },
      { id: uid(), text: '采购新版教辅', due: shiftDate(T, 5), done: false, prio: '低' }
    ];
    const templates = [
      { id: uid(), cat: '学情反馈', title: '成绩提升报喜', content: '${name}家长您好，孩子本次${exam}${subject}成绩${score}分，较上次提升${delta}分，重点突破了${point}，继续保持这股劲头！' },
      { id: uid(), cat: '学情反馈', title: '需关注提醒', content: '${name}家长，孩子近期${subject}有所波动，主要卡在${point}，已在校针对性辅导，也麻烦家里多关注作业。' },
      { id: uid(), cat: '续报引导', title: '续费立省', content: '${name}家长，孩子目前剩余${remain}课时，学习状态很好，建议续报${pkg}课包立省¥${save}，锁定优惠~' },
      { id: uid(), cat: '续报引导', title: '转介绍有礼', content: '孩子进步这么明显，欢迎介绍同学一起来呀，老带新双方都有专属课时礼包🎁' },
      { id: uid(), cat: '批评鼓励', title: '温和批评', content: '${name}最近上课注意力有点下降，已和孩子单独聊过，相信调整后会更好，咱们一起多鼓励！' },
      { id: uid(), cat: '批评鼓励', title: '进步鼓励', content: '为${name}的进步点赞👍 这次${subject}提升明显，坚持下去一定会有更大突破！' },
      { id: uid(), cat: '请假通知', title: '调课通知', content: '温馨提示：本周${subject}课程因${reason}调至${time}，请知悉，如需请假请提前告知~' },
      { id: uid(), cat: '请假通知', title: '缺勤补发', content: '${name}本次${subject}请假，已整理好课堂重点与练习，回来后老师帮孩子补一遍。' }
    ];
    const plans = [
      { id: uid(), student: '李浩然', title: '物理力学补强计划', date: '2026-07-29', items: [{ text: '每日1道力学错题重做', done: true }, { text: '周末加练一套模拟', done: false }, { text: '家长群每日打卡', done: false }] },
      { id: uid(), student: '刘思琪', title: '数学基础夯实', date: '2026-07-28', items: [{ text: '函数概念专项视频', done: false }, { text: '一对一每周2次', done: false }] }
    ];
    return {
      org: { name: '小圈教育', owner: '李老师', phone: '13800000001', logo: '🔵', address: '阳光路 18 号 3 楼' },
      settings: { aiKey: '', aiBase: 'https://api.deepseek.com/v1', aiModel: 'deepseek-chat' },
      students, classes, packages, payments, feedback, attendance, salaryRules, comms, followups, todos, templates, plans, studies: []
    };
  }

  // ===================== 数据查询辅助 =====================
  const findStu = (name) => S.students.find(s => s.name === name) || S.students.find(s => s.id === name);
  const findStuById = (id) => S.students.find(s => s.id === id);
  function latestBySubject(stu) { const m = {}; stu.scores.forEach(s => { if (!m[s.subject] || s.date >= m[s.subject].date) m[s.subject] = s; }); return m; }
  function trendOf(stu, subject) { return stu.scores.filter(s => s.subject === subject).sort((a, b) => a.date.localeCompare(b.date)); }
  function isRising(stu, subject) { const t = trendOf(stu, subject); if (t.length < 2) return false; return t[t.length - 1].score > t[0].score; }
  function riseStreak(stu, subject) { const t = trendOf(stu, subject); let n = 0; for (let i = t.length - 1; i > 0; i--) { if (t[i].score > t[i - 1].score) n++; else break; } return n; }
  function classAvg(subject) { const arr = S.students.map(s => latestBySubject(s)[subject]).filter(Boolean).map(x => x.score); return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0; }
  function thisMonthRev() { const m = todayStr().slice(0, 7); return S.payments.filter(p => p.date.slice(0, 7) === m).reduce((a, b) => a + b.amount, 0); }
  function warnStudents() { return S.students.filter(s => s.status === '流失预警' || s.remaining <= 4); }
  function pendingFollowups() { return S.followups.filter(f => !f.done); }

  // ===================== AI 引擎 =====================
  async function callAI(system, prompt) {
    const st = S.settings;
    if (!st.aiKey) return null;
    try {
      showLoading('AI 生成中…');
      const res = await fetch(st.aiBase.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + st.aiKey },
        body: JSON.stringify({ model: st.aiModel || 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1400 })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return txt || '';
    } catch (e) { return '[[ERR]]' + e.message; }
    finally { hideLoading(); }
  }
  function localAssess(stu) {
    const subj = stu.subject.split('·')[0];
    const t = trendOf(stu, subj);
    const last = t[t.length - 1], first = t[0];
    const delta = last ? last.score - first.score : 0;
    const avg = classAvg(subj);
    const rising = delta > 0, declining = delta < 0;
    const bright = rising
      ? `该生${subj}从 ${first.score} 分稳步提升至 ${last.score} 分，累计进步 ${delta} 分，且高于班级平均 ${avg} 分，处于上升通道。`
      : declining ? `该生${subj}由 ${first.score} 分降至 ${last.score} 分，落后班级平均 ${avg} 分，需重点干预。` : `该生${subj}成绩稳定在 ${last.score} 分，与班级平均 ${avg} 分基本持平。`;
    const risk = (stu.weak && stu.weak.length ? `薄弱项：${stu.weak.join('、')}。` : '暂无明显薄弱项。') + (declining ? '趋势向下，存在流失风险，建议尽快家校沟通。' : (stu.remaining <= 4 ? '剩余课时偏少，临近临界点，需提前规划续费。' : '趋势平稳，保持常规跟踪即可。'));
    const advice = [
      rising ? `保持现有节奏，可适度拔高难度，冲击更高分段。` : `回归基础，针对${stu.weak[0] || subj + '基础'}做专项突破，每周一次小测跟踪。`,
      `家校联动：每周向家长推送一次学情卡，强化正反馈。`,
      stu.remaining <= 4 ? `趁热打铁推进续费，锚定课包立省优惠锁定意向。` : `设定下阶段目标分（建议 ${last.score + 5} 分），给学生明确抓手。`
    ];
    return { bright, risk, advice, rising, declining, delta, avg };
  }
  function localClassFeedback(stu) {
    const subj = stu.subject.split('·')[0];
    const t = trendOf(stu, subj);
    const last = t[t.length - 1];
    const praise = last.score >= 90 ? `${stu.name}本次${subj}取得 ${last.score} 分的高分，课堂专注、答题规范，是班级榜样🌟！`
      : last.score >= 75 ? `${stu.name}本次${subj} ${last.score} 分，课堂参与积极，最近几次有明显进步，值得肯定👍。`
        : `${stu.name}今天上课态度认真，虽然${subj}目前 ${last.score} 分还有提升空间，但基础在打牢，请家长多鼓励。`;
    const improve = (stu.weak && stu.weak.length) ? `需关注：${stu.weak.join('、')}，已在校内布置针对性练习，建议家里每天陪练 15 分钟。` : `可进一步优化答题速度与书写规范，向满分靠拢。`;
    const encourage = `相信${stu.name}只要保持节奏、稳扎稳打，下阶段一定能再上一个台阶，我们一起加油！`;
    return { praise, improve, encourage };
  }
  function localBidirectional(stu) {
    const subj = stu.subject.split('·')[0];
    const t = trendOf(stu, subj);
    const last = t[t.length - 1], first = t[0];
    const target = 95;
    const reach = Math.max(0, Math.min(100, Math.round((last.score / target) * 100)));
    const emo = last.score >= 85 ? 88 : last.score >= 70 ? 72 : 55;
    const rising = last.score >= first.score;
    const diag = `学员${stu.name}（${stu.grade}·${subj}）当前 ${last.score} 分，目标 ${target} 分，达成度 ${reach}%。${rising ? '整体呈上升趋势，学习状态积极。' : '近期成绩承压，需排查方法与动力因素。'}薄弱项：${stu.weak.join('、') || '无明显短板'}。`;
    const plan = [
      `设定阶梯目标：先稳${last.score + 3}分，再冲${target}分，每达成一个小目标给予正向激励。`,
      stu.weak[0] ? `针对「${stu.weak[0]}」做 3 次专项训练，配错题本跟踪。` : `保持题型广度，每周一套综合卷保持手感。`,
      `家校双向反馈：每周五推送学情卡，家长每日 10 分钟陪伴打卡。`,
      `情绪管理：多表扬少施压，用「进步可视化」提升自信。`
    ];
    return { reach, emo, target, diag, plan, subj, last: last.score };
  }

  // ===================== 导出 / 导入 / 清空 =====================
  function exportAll() {
    const blob = JSON.stringify(S, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
    a.download = `小圈教育数据备份_${todayStr()}.json`;
    a.click(); toast('已导出全部数据');
  }
  function importAll(file) {
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d.students) throw 0; S = d; saveState(); toast('导入成功，即将刷新'); setTimeout(() => location.reload(), 600); }
      catch (e) { toast('文件格式不正确'); }
    };
    r.readAsText(file);
  }

  // ===================== 路由 =====================
  let curTab = 'dashboard';
  let curStudy = 'report';
  const TAB_TITLE = { dashboard: '工作台', students: '学员', renewal: '续费', study: '学情', mine: '我的' };
  function switchTab(tab) {
    curTab = tab;
    $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('#topbarTitle').textContent = TAB_TITLE[tab];
    clearCharts();
    if (tab === 'dashboard') renderDashboard();
    else if (tab === 'students') renderStudentsView();
    else if (tab === 'renewal') renderRenewal();
    else if (tab === 'study') { renderStudyChips(); renderStudy(curStudy); }
    else if (tab === 'mine') renderMine();
    $('#pageHost').scrollTop = 0;
    refreshBell();
  }
  function renderStudyChips() {
    const subs = [['report', '学情报告'], ['attendance', '考勤'], ['comm', '家长沟通'], ['plan', '学习计划'], ['assess', 'AI测评'], ['feedback', 'AI反馈'], ['bi', '双向分析']];
    const host = $('#pageHost');
    host.innerHTML = `<div class="chips" id="studyChips">${subs.map(([k, t]) => `<button class="chip ${k === curStudy ? 'active' : ''}" data-study="${k}">${t}</button>`).join('')}</div><div id="studyBody"></div>`;
    $$('#studyChips .chip').forEach(c => c.onclick = () => { curStudy = c.dataset.study; $$('#studyChips .chip').forEach(x => x.classList.toggle('active', x === c)); clearCharts(); renderStudy(curStudy); });
  }
  function renderStudy(sub) {
    const body = $('#studyBody'); if (!body) return;
    if (sub === 'report') renderReport(body);
    else if (sub === 'attendance') renderAttendance(body);
    else if (sub === 'comm') renderComm(body);
    else if (sub === 'plan') renderPlans(body);
    else if (sub === 'assess') renderAssess(body);
    else if (sub === 'feedback') renderFeedbackAI(body);
    else if (sub === 'bi') renderBidirectional(body);
  }

  // ===================== 渲染：工作台（运营驾驶舱） =====================
  function renderDashboard() {
    const host = $('#pageHost');
    const T = todayStr();
    const onCount = S.students.filter(s => s.status === '在读').length;
    const trial = S.students.filter(s => s.status === '试听').length;
    const rev = thisMonthRev();
    const warns = warnStudents();
    const followCnt = pendingFollowups().length;
    const funnel = [
      { name: '试听', val: trial + 6, pct: 100 },
      { name: '成交', val: S.payments.filter(p => p.type === '新报').length + 8, pct: 70 },
      { name: '续费', val: S.payments.filter(p => p.type === '续费').length + 10, pct: 52 },
      { name: '转介绍', val: 5, pct: 28 }
    ];
    const kpi = `
      <div class="kpi"><div class="kpi-accent"></div><div class="k-label">在读学员</div><div class="k-val">${onCount}<small> 人</small></div><div class="k-trend trend-up">▲ 试听 ${trial} 人</div></div>
      <div class="kpi"><div class="kpi-accent"></div><div class="k-label">本月营收</div><div class="k-val">${fmtMoney(rev)}</div><div class="k-trend trend-up">▲ 环比 +12.5%</div></div>
      <div class="kpi"><div class="kpi-accent"></div><div class="k-label">续费预警</div><div class="k-val" style="color:var(--danger)">${warns.length}<small> 人</small></div><div class="k-trend trend-down">需尽快跟进</div></div>
      <div class="kpi"><div class="kpi-accent"></div><div class="k-label">待回访</div><div class="k-val">${followCnt}<small> 项</small></div><div class="k-trend trend-up">今日 ${pendingFollowups().filter(f => f.due === T).length} 项</div></div>`;
    const alertItems = warns.slice(0, 4).map(s => {
      const amt = S.packages.find(p => p.subject === s.subject.split('·')[0]) || S.packages[0];
      const loss = amt ? amt.price : 2000;
      return `<div class="alert-item"><span>${s.avatar} ${s.name} · 剩 ${s.remaining} 课时</span><span class="a-amt">流失风险 ¥${loss}</span></div>`;
    }).join('') || `<div class="alert-item"><span>暂无高危学员 🎉</span></div>`;
    const fun = funnel.map(f => `<div class="funnel-row"><span style="width:48px;font-size:12px;color:var(--ink2)">${f.name}</span><div class="funnel-bar" style="width:${Math.max(20, f.pct)}%">${f.val}</div></div>`).join('');
    const quick = [['💰', '记一笔', 'addPay'], ['👩‍🎓', '加学员', 'addStu'], ['📝', '写反馈', 'addFb'], ['🗓️', '排课', 'addClass']]
      .map(([i, t, a]) => `<button class="quick-item" data-act="${a}"><span class="q-ico">${i}</span><span class="q-tx">${esc(t)}</span></button>`).join('');
    const todos = [...pendingFollowups().map(f => ({ t: f.content, s: f.student + ' · 回访', over: daysBetween(f.due, T) < 0, due: f.due })),
      ...S.todos.filter(x => !x.done).map(x => ({ t: x.text, s: '待办', over: daysBetween(x.due, T) < 0, due: x.due }))]
      .sort((a, b) => (a.over === b.over) ? a.due.localeCompare(b.due) : (a.over ? -1 : 1));
    const todoHTML = todos.map(x => `<div class="todo-item"><span class="todo-dot ${x.over ? 'dot-red' : 'dot-amber'}"></span><div class="todo-main"><div class="tt">${esc(x.t)}</div><div class="ts">${esc(x.s)} · ${x.over ? '<span class="todo-over">已逾期 ' + Math.abs(daysBetween(x.due, T)) + ' 天</span>' : '截止 ' + fmtDate(x.due)}</div></div></div>`).join('') || `<div class="empty"><div class="e-ico">✅</div>今日待办已清空</div>`;
    host.innerHTML = `
      <div class="hero"><div class="hero-greet">🌅</div><h2>早安，${esc(S.org.owner)}</h2><p>${fmtDate(T)} · 今日有 ${warns.length} 位学员需重点关注</p></div>
      <div class="kpi-grid">${kpi}</div>
      <div class="alert-card"><div class="a-head">⚠️ 续费 / 流失预警</div>${alertItems}</div>
      <div class="card"><div class="card-h"><span class="t">转化漏斗</span><span class="more">试听→成交→续费→转介绍</span></div><div class="funnel">${fun}</div></div>
      <div class="card"><div class="card-h"><span class="t">快捷入口</span></div><div class="quick-grid">${quick}</div></div>
      <div class="card"><div class="card-h"><span class="t">今日待办</span><span class="more" id="dashTodoMore">全部</span></div>${todoHTML}</div>
      <div class="card center"><button class="btn-soft btn-sm" data-act="addPay">＋ 记一笔缴费</button></div>`;
    $$('#pageHost .quick-item, #pageHost [data-act="addPay"]').forEach(b => b.onclick = () => quickAction(b.dataset.act));
  }

  // ===================== 表单提交绑定（防止回车刷新） =====================
  function bindFormSubmit(root) { $$('form', root).forEach(f => f.addEventListener('submit', e => e.preventDefault())); }

  // ===================== 快捷动作 =====================
  function quickAction(act) {
    if (act === 'addPay') addPay();
    else if (act === 'addStu') openStudentModal();
    else if (act === 'addFb') addFb();
    else if (act === 'addClass') openClassModal();
  }

  // ===================== 渲染：学员管理 =====================
  function renderStudents() {
    const host = $('#stuSubBody') || $('#pageHost');
    host.innerHTML = `
      <div class="search-bar">
        <input id="stuSearch" placeholder="搜索姓名 / 家长电话">
        <select id="stuStatus"><option value="">全部</option><option>在读</option><option>试听</option><option>流失预警</option></select>
      </div>
      <div class="list" id="stuList"></div>`;
    const draw = () => {
      const q = $('#stuSearch').value.trim().toLowerCase();
      const st = $('#stuStatus').value;
      const list = S.students.filter(s => (!st || s.status === st) && (!q || s.name.toLowerCase().includes(q) || (s.parentPhone || '').includes(q)));
      $('#stuList').innerHTML = list.map(s => {
        const lp = latestBySubject(s);
        const main = Object.values(lp).map(x => `${x.subject}${x.score}`).join(' / ');
        const tag = s.status === '流失预警' ? 'tag-red' : s.status === '试听' ? 'tag-amber' : 'tag-green';
        return `<div class="row" data-id="${s.id}"><div class="avatar">${s.avatar}</div><div class="r-main"><div class="r-name">${esc(s.name)} <span class="tag ${tag}">${s.status}</span></div><div class="r-sub">${esc(s.grade)} · ${esc(s.subject)} · 剩 ${s.remaining}课时</div></div><div class="r-right">${main}</div></div>`;
      }).join('') || `<div class="empty"><div class="e-ico">🔍</div>没有匹配的学员</div>`;
      $$('#stuList .row').forEach(r => r.onclick = () => renderStudentDetail(findStuById(r.dataset.id)));
    };
    $('#stuSearch').oninput = draw; $('#stuStatus').onchange = draw; draw();
  }

  function renderStudentDetail(stu) {
    clearCharts();
    const lp = latestBySubject(stu);
    const mainSubj = stu.subject.split('·')[0];
    const t = trendOf(stu, mainSubj);
    const last = t[t.length - 1];
    const streak = riseStreak(stu, mainSubj);
    const tags = stu.weak.map(w => `<span class="tag tag-red">${esc(w)}</span>`).join('') || `<span class="tag">无</span>`;
    const table = stu.scores.length ? `<table class="tbl"><tr><th>考试</th><th>科目</th><th>分数</th><th>日期</th></tr>${stu.scores.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => `<tr><td>${esc(x.exam)}</td><td>${esc(x.subject)}</td><td>${x.score}</td><td>${fmtDate(x.date)}</td></tr>`).join('')}</table>` : `<div class="empty"><div class="e-ico">📊</div>暂无成绩记录</div>`;
    const chartHTML = (t.length >= 2) ? `<div class="card"><div class="card-h"><span class="t">${esc(mainSubj)}成绩趋势</span></div><div id="stuChart" class="chart"></div></div>` : '';
    openSub(stu.name + ' 的档案', `
      <div class="profile-head"><div class="pa">${stu.avatar}</div><div><div class="pn">${esc(stu.name)}</div><div class="ps">${esc(stu.grade)} · ${esc(stu.subject)}</div></div></div>
      <div class="stat-row mb">
        <div class="stat"><div class="sv">${stu.remaining}</div><div class="sl">剩余课时</div></div>
        <div class="stat"><div class="sv">${fmtMoney(stu.totalFee)}</div><div class="sl">累计缴费</div></div>
        <div class="stat"><div class="sv">${last ? last.score : '-'}</div><div class="sl">最新分</div></div>
        <div class="stat"><div class="sv ${streak > 0 ? 'trend-up' : ''}">${streak > 0 ? '连涨' + streak : (stu.status === '流失预警' ? '预警' : '稳')}</div><div class="sl">状态</div></div>
      </div>
      <div class="card"><div class="card-h"><span class="t">薄弱项</span></div><div class="flex wrap gap8">${tags}</div></div>
      ${chartHTML}
      <div class="card"><div class="card-h"><span class="t">成绩记录</span><span class="more" id="addScoreBtn">＋ 加成绩</span></div>${table}</div>
      <div class="btn-row mb"><button class="btn-soft" id="dFb">写反馈</button><button class="btn-soft" id="dPay">记缴费</button></div>
      <div class="btn-row mb"><button class="btn-primary" id="dAssess">🤖 AI 测评</button><button class="btn-primary" id="dReport">📈 学情报告</button></div>
      <div class="btn-row mb"><button class="btn-ghost" id="dEdit">编辑</button><button class="btn-danger" id="dDel">删除</button></div>
    `);
    if (t.length >= 2) {
      mountChart($('#stuChart'), {
        grid: { left: 36, right: 16, top: 24, bottom: 24 },
        xAxis: { type: 'category', data: t.map(x => x.exam), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', min: 40, max: 100, axisLabel: { fontSize: 10 } },
        series: [{ type: 'line', smooth: true, data: t.map(x => x.score), itemStyle: { color: '#7C3AED' }, areaStyle: { color: 'rgba(124,58,237,0.12)' }, lineStyle: { width: 3 } }]
      });
    }
    $('#addScoreBtn').onclick = () => addScoreModal(stu.id);
    $('#dFb').onclick = () => addFb(stu.id);
    $('#dPay').onclick = () => addPay(stu.name);
    $('#dAssess').onclick = () => runAssess(stu);
    $('#dReport').onclick = () => openReport(stu);
    $('#dEdit').onclick = () => openStudentModal(stu.id);
    $('#dDel').onclick = () => {
      if (confirm('确定删除学员 ' + stu.name + '？此操作不可撤销。')) {
        S.students = S.students.filter(x => x.id !== stu.id);
        S.classes.forEach(c => c.students = c.students.filter(n => n !== stu.name));
        saveState(); closeSub(); toast('已删除'); renderStudents();
      }
    };
  }

  function openStudentModal(id) {
    const stu = id ? findStuById(id) : null;
    const body = `
      <div class="field"><label>姓名</label><input id="f_name" value="${stu ? esc(stu.name) : ''}" placeholder="学员姓名"></div>
      <div class="field"><label>头像 Emoji</label><input id="f_avatar" value="${stu ? stu.avatar : '🙂'}"></div>
      <div class="field"><label>年级</label><input id="f_grade" value="${stu ? esc(stu.grade) : ''}" placeholder="如 初二"></div>
      <div class="field"><label>报读科目</label><input id="f_subject" value="${stu ? esc(stu.subject) : ''}" placeholder="如 数学·英语"></div>
      <div class="field"><label>状态</label><select id="f_status"><option ${stu && stu.status === '在读' ? 'selected' : ''}>在读</option><option ${stu && stu.status === '试听' ? 'selected' : ''}>试听</option><option ${stu && stu.status === '流失预警' ? 'selected' : ''}>流失预警</option></select></div>
      <div class="field"><label>家长姓名</label><input id="f_parent" value="${stu ? esc(stu.parent) : ''}"></div>
      <div class="field"><label>家长电话</label><input id="f_phone" value="${stu ? esc(stu.parentPhone) : ''}"></div>
      <div class="field"><label>剩余课时</label><input id="f_remain" type="number" value="${stu ? stu.remaining : 0}"></div>
      <div class="field"><label>薄弱项(逗号分隔)</label><input id="f_weak" value="${stu ? esc(stu.weak.join(',')) : ''}"></div>`;
    const foot = `<button class="btn-ghost" id="f_cancel">取消</button><button class="btn-primary" id="f_save">保存</button>`;
    openSheet(stu ? '编辑学员' : '新增学员', body, foot);
    $('#f_cancel').onclick = closeSheet;
    $('#f_save').onclick = () => {
      const data = {
        name: $('#f_name').value.trim() || '未命名', avatar: $('#f_avatar').value.trim() || '🙂', grade: $('#f_grade').value.trim(),
        subject: $('#f_subject').value.trim(), status: $('#f_status').value, parent: $('#f_parent').value.trim(), parentPhone: $('#f_phone').value.trim(),
        remaining: parseInt($('#f_remain').value) || 0, weak: $('#f_weak').value.split(',').map(x => x.trim()).filter(Boolean)
      };
      if (stu) Object.assign(stu, data);
      else S.students.push(Object.assign({ id: uid(), totalFee: 0, scores: [] }, data));
      saveState(); closeSheet(); toast('已保存'); renderStudents();
    };
  }

  function addScoreModal(stuId) {
    const stu = findStuById(stuId);
    const body = `
      <div class="field"><label>考试名称</label><input id="s_exam" placeholder="如 月考 / 期中"></div>
      <div class="field"><label>科目</label><input id="s_subject" value="${esc(stu.subject.split('·')[0])}"></div>
      <div class="field"><label>分数</label><input id="s_score" type="number" placeholder="0-100"></div>
      <div class="field"><label>日期</label><input id="s_date" type="date" value="${todayStr()}"></div>`;
    openSheet('添加成绩', body, `<button class="btn-ghost" id="s_cancel">取消</button><button class="btn-primary" id="s_save">保存</button>`);
    $('#s_cancel').onclick = closeSheet;
    $('#s_save').onclick = () => {
      const score = parseInt($('#s_score').value);
      if (isNaN(score)) return toast('请输入分数');
      stu.scores.push({ exam: $('#s_exam').value.trim() || '考试', subject: $('#s_subject').value.trim(), score, date: $('#s_date').value || todayStr() });
      saveState(); closeSheet(); toast('成绩已添加'); renderStudentDetail(stu);
    };
  }

  // ===================== 学员 / 班级 二级切换 =====================
  let stuSub = 'stu';
  function renderStudentsView() {
    const host = $('#pageHost');
    host.innerHTML = `<div class="chips" id="stuChips"><button class="chip ${stuSub === 'stu' ? 'active' : ''}" data-s="stu">学员</button><button class="chip ${stuSub === 'cls' ? 'active' : ''}" data-s="cls">班级</button></div><div id="stuSubBody"></div>`;
    $$('#stuChips .chip').forEach(c => c.onclick = () => { stuSub = c.dataset.s; $$('#stuChips .chip').forEach(x => x.classList.toggle('active', x === c)); stuSub === 'stu' ? renderStudents() : renderClasses(); });
    stuSub === 'stu' ? renderStudents() : renderClasses();
  }

  function renderClasses() {
    const host = $('#stuSubBody');
    const cards = S.classes.map(c => {
      const names = c.students.map(n => { const st = findStu(n); return st ? `${st.avatar}${st.name}` : n; }).join('、') || '暂无学员';
      return `<div class="card"><div class="card-h"><span class="t">${esc(c.name)}</span><span class="more" data-edit="${c.id}">编辑</span></div>
        <div class="muted">${esc(c.grade)} · ${esc(c.subject)} · ${esc(c.teacher)}</div>
        <div class="muted mt">🕐 ${esc(c.time)} · 📍 ${esc(c.room)}</div>
        <div class="divider"></div><div class="muted">学员（${c.students.length}）：${esc(names)}</div></div>`;
    }).join('');
    host.innerHTML = `<div class="btn-row mb"><button class="btn-soft" id="addClassBtn">＋ 新建班级</button></div>${cards || '<div class="empty"><div class="e-ico">🏫</div>还没有班级</div>'}`;
    $('#addClassBtn').onclick = () => openClassModal();
    $$('[data-edit]').forEach(b => b.onclick = () => openClassModal(b.dataset.edit));
  }

  function openClassModal(id) {
    const c = id ? S.classes.find(x => x.id === id) : null;
    const stuOpts = S.students.map(s => `<option ${c && c.students.includes(s.name) ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const body = `
      <div class="field"><label>班级名称</label><input id="c_name" value="${c ? esc(c.name) : ''}" placeholder="如 初二数学培优班"></div>
      <div class="field"><label>年级</label><input id="c_grade" value="${c ? esc(c.grade) : ''}"></div>
      <div class="field"><label>科目</label><input id="c_subject" value="${c ? esc(c.subject) : ''}"></div>
      <div class="field"><label>带班老师</label><input id="c_teacher" value="${c ? esc(c.teacher) : ''}"></div>
      <div class="field"><label>上课时间</label><input id="c_time" value="${c ? esc(c.time) : ''}" placeholder="如 周六 09:00"></div>
      <div class="field"><label>教室</label><input id="c_room" value="${c ? esc(c.room) : ''}"></div>
      <div class="field"><label>学员(可多选)</label><select id="c_students" multiple size="4">${stuOpts}</select></div>`;
    openSheet(c ? '编辑班级' : '新建班级', body, `<button class="btn-ghost" id="c_cancel">取消</button><button class="btn-primary" id="c_save">保存</button>`);
    $('#c_cancel').onclick = closeSheet;
    $('#c_save').onclick = () => {
      const students = $$('#c_students option').filter(o => o.selected).map(o => o.value);
      const data = { name: $('#c_name').value.trim() || '未命名班级', grade: $('#c_grade').value.trim(), subject: $('#c_subject').value.trim(), teacher: $('#c_teacher').value.trim(), time: $('#c_time').value.trim(), room: $('#c_room').value.trim(), students };
      if (c) Object.assign(c, data); else S.classes.push(Object.assign({ id: uid() }, data));
      saveState(); closeSheet(); toast('已保存'); renderClasses();
    };
  }

  // ===================== 渲染：续费 / 缴费 =====================
  function renderRenewal() {
    const host = $('#pageHost');
    const total = S.payments.reduce((a, b) => a + b.amount, 0);
    const month = thisMonthRev();
    const revCats = ['新报', '续费', '补缴'];
    const revBars = revCats.map(t => { const v = S.payments.filter(p => p.type === t).reduce((a, b) => a + b.amount, 0); return { t, v }; });
    const maxV = Math.max(1, ...revBars.map(x => x.v));
    const pkg = S.packages.map(p => {
      const save = p.oldPrice - p.price;
      return `<div class="pkg ${p.popular ? 'anchor' : ''}">
        ${p.popular ? '<span class="p-save" style="position:absolute;top:12px;left:14px">🔥 主推</span>' : ''}
        <div class="p-name">${esc(p.name)}</div>
        <div class="p-meta">${esc(p.subject)} · ${p.lessons} 课时</div>
        <div class="p-price"><span class="p-now">${fmtMoney(p.price)}</span><span class="p-old">${fmtMoney(p.oldPrice)}</span><span class="p-save">立省 ¥${save}</span></div>
        <button class="btn-primary btn-sm p-buy" data-pkg="${p.id}">续报</button>
      </div>`;
    }).join('');
    const payRows = S.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => `<div class="row"><div class="avatar">${findStu(p.student) ? findStu(p.student).avatar : '💳'}</div><div class="r-main"><div class="r-name">${esc(p.student)} <span class="tag ${p.type === '续费' ? 'tag-green' : p.type === '新报' ? 'tag-purple' : 'tag-amber'}">${p.type}</span></div><div class="r-sub">${esc(p.pkg)} · ${fmtDate(p.date)}</div></div><div class="r-right">${fmtMoney(p.amount)}</div></div>`).join('') || '<div class="empty"><div class="e-ico">💰</div>暂无缴费记录</div>';
    host.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">累计营收</div><div class="k-val">${fmtMoney(total)}</div></div>
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">本月营收</div><div class="k-val">${fmtMoney(month)}</div><div class="k-trend trend-up">▲ 环比 +12.5%</div></div>
      </div>
      <div class="card"><div class="card-h"><span class="t">营收构成</span></div>${revBars.map(x => `<div class="funnel-row"><span style="width:42px;font-size:12px;color:var(--ink2)">${x.t}</span><div class="funnel-bar" style="width:${Math.max(20, Math.round(x.v / maxV * 100))}%">${fmtMoney(x.v)}</div></div>`).join('')}</div>
      <div class="section-title">课包 · 锚定立省（损失厌恶）<span class="more" id="addPkgBtn">＋ 新课包</span></div>
      ${pkg}
      <div class="section-title">缴费记录</div>
      <div class="list">${payRows}</div>
      <div class="card center mt"><button class="btn-primary" id="addPayBtn">＋ 记一笔缴费</button></div>`;
    $('#addPayBtn').onclick = () => addPay();
    $('#addPkgBtn').onclick = () => openPkgModal();
    $$('[data-pkg]').forEach(b => b.onclick = () => { const p = S.packages.find(x => x.id === b.dataset.pkg); addPay('', p); });
  }

  function addPay(preName, pkg) {
    const stuOpts = S.students.map(s => `<option ${s.name === preName ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const pkgOpts = S.packages.map(p => `<option value="${p.id}" ${pkg && pkg.id === p.id ? 'selected' : ''}>${esc(p.name)} · ${fmtMoney(p.price)}</option>`).join('');
    const body = `
      <div class="field"><label>学员</label><select id="p_stu">${stuOpts}</select></div>
      <div class="field"><label>类型</label><select id="p_type"><option>续费</option><option>新报</option><option>补缴</option></select></div>
      <div class="field"><label>课包</label><select id="p_pkg">${pkgOpts}</select></div>
      <div class="field"><label>金额</label><input id="p_amt" type="number" value="${pkg ? pkg.price : ''}" placeholder="金额"></div>
      <div class="field"><label>日期</label><input id="p_date" type="date" value="${todayStr()}"></div>`;
    openSheet('记一笔缴费', body, `<button class="btn-ghost" id="p_cancel">取消</button><button class="btn-primary" id="p_save">保存</button>`);
    $('#p_pkg').onchange = () => { const p = S.packages.find(x => x.id === $('#p_pkg').value); if (p) $('#p_amt').value = p.price; };
    $('#p_cancel').onclick = closeSheet;
    $('#p_save').onclick = () => {
      const stuName = $('#p_stu').value; const p = S.packages.find(x => x.id === $('#p_pkg').value);
      const amt = parseInt($('#p_amt').value) || 0; const type = $('#p_type').value;
      S.payments.unshift({ id: uid(), student: stuName, amount: amt, type, pkg: p ? p.name : '', date: $('#p_date').value || todayStr(), staff: S.org.owner });
      const stu = findStu(stuName);
      if (stu) { stu.totalFee += amt; if (type !== '补缴' && p) stu.remaining += p.lessons; }
      saveState(); closeSheet(); toast(type + '已记录 · 课时+' + (p && type !== '补缴' ? p.lessons : 0)); renderRenewal();
    };
  }

  function openPkgModal(id) {
    const p = id ? S.packages.find(x => x.id === id) : null;
    const body = `
      <div class="field"><label>课包名称</label><input id="pk_name" value="${p ? esc(p.name) : ''}"></div>
      <div class="field"><label>科目</label><input id="pk_subject" value="${p ? esc(p.subject) : ''}"></div>
      <div class="field"><label>课时数</label><input id="pk_lessons" type="number" value="${p ? p.lessons : 20}"></div>
      <div class="field"><label>现价</label><input id="pk_price" type="number" value="${p ? p.price : 0}"></div>
      <div class="field"><label>原价(用于立省锚定)</label><input id="pk_old" type="number" value="${p ? p.oldPrice : 0}"></div>
      <div class="field"><label>是否主推</label><select id="pk_pop"><option value="1" ${p && p.popular ? 'selected' : ''}>是</option><option value="0" ${p && !p.popular ? 'selected' : ''}>否</option></select></div>`;
    openSheet(p ? '编辑课包' : '新课包', body, `<button class="btn-ghost" id="pk_cancel">取消</button><button class="btn-primary" id="pk_save">保存</button>`);
    $('#pk_cancel').onclick = closeSheet;
    $('#pk_save').onclick = () => {
      const data = { name: $('#pk_name').value.trim() || '未命名课包', subject: $('#pk_subject').value.trim(), lessons: parseInt($('#pk_lessons').value) || 0, price: parseInt($('#pk_price').value) || 0, oldPrice: parseInt($('#pk_old').value) || 0, popular: $('#pk_pop').value === '1' };
      if (p) Object.assign(p, data); else S.packages.push(Object.assign({ id: uid() }, data));
      saveState(); closeSheet(); toast('已保存'); renderRenewal();
    };
  }

  // ===================== 渲染：学情报告（图表） =====================
  function renderReport(body) {
    const opts = S.students.map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.subject)}</option>`).join('');
    body.innerHTML = `<div class="field"><label>选择学员</label><select id="rpStu">${opts}</select></div><div id="rpContent"></div>`;
    const draw = () => {
      const stu = findStuById($('#rpStu').value); if (!stu) return;
      const lp = latestBySubject(stu); const subs = Object.keys(lp);
      const mainSubj = stu.subject.split('·')[0]; const t = trendOf(stu, mainSubj); const last = t[t.length - 1];
      $('#rpContent').innerHTML = `<div class="hero"><div class="hero-greet">${stu.avatar}</div><h2>${esc(stu.name)}</h2><p>${esc(stu.grade)} · ${esc(stu.subject)} · 最新 ${mainSubj} ${last ? last.score : '-'} 分</p></div>
        <div class="card"><div class="card-h"><span class="t">${esc(mainSubj)}成绩趋势</span></div><div id="rpLine" class="chart"></div></div>
        <div class="card"><div class="card-h"><span class="t">各科 vs 班级平均</span></div><div id="rpBar" class="chart"></div></div>
        <div class="card"><div class="card-h"><span class="t">能力雷达</span></div><div id="rpRadar" class="chart"></div></div>
        <div class="btn-row"><button class="btn-primary" id="rpParent">📄 生成家长版报告</button></div>`;
      mountChart($('#rpLine'), {
        grid: { left: 36, right: 16, top: 24, bottom: 28 }, xAxis: { type: 'category', data: t.map(x => x.exam), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', min: 40, max: 100, axisLabel: { fontSize: 10 } },
        series: [{ type: 'line', smooth: true, data: t.map(x => x.score), itemStyle: { color: '#7C3AED' }, areaStyle: { color: 'rgba(124,58,237,0.12)' }, lineStyle: { width: 3 } }]
      });
      mountChart($('#rpBar'), {
        grid: { left: 36, right: 16, top: 24, bottom: 28 }, legend: { data: ['学员', '班级平均'], top: 0, textStyle: { fontSize: 10 } },
        xAxis: { type: 'category', data: subs, axisLabel: { fontSize: 10 } }, yAxis: { type: 'value', max: 100, axisLabel: { fontSize: 10 } },
        series: [{ name: '学员', type: 'bar', data: subs.map(s => lp[s].score), itemStyle: { color: '#2563EB', borderRadius: [4, 4, 0, 0] } },
        { name: '班级平均', type: 'bar', data: subs.map(s => classAvg(s)), itemStyle: { color: '#F59E0B', borderRadius: [4, 4, 0, 0] } }]
      });
      mountChart($('#rpRadar'), {
        legend: { data: ['学员', '班级平均'], top: 0, textStyle: { fontSize: 10 } },
        radar: { indicator: subs.map(s => ({ name: s, max: 100 })), radius: '62%' },
        series: [{ type: 'radar', data: [{ value: subs.map(s => lp[s].score), name: '学员', itemStyle: { color: '#7C3AED' }, areaStyle: { opacity: .2 } }, { value: subs.map(s => classAvg(s)), name: '班级平均', itemStyle: { color: '#10B981' }, areaStyle: { opacity: .1 } }] }]
      });
      $('#rpParent').onclick = () => openReport(stu);
    };
    $('#rpStu').onchange = draw; draw();
  }

  function openReport(stu) {
    const subj = stu.subject.split('·')[0]; const t = trendOf(stu, subj); const last = t[t.length - 1]; const first = t[0];
    const delta = last.score - first.score; const streak = riseStreak(stu, subj); const avg = classAvg(subj);
    const r = localAssess(stu);
    const html = `
      <div class="card" style="border:2px solid var(--purple);background:var(--grad-soft)">
        <div class="center" style="font-weight:800;font-size:16px">🔵 小圈教育 · 专属学情报告</div>
        <div class="center muted">${esc(stu.name)}（${esc(stu.grade)} · ${esc(subj)}）</div>
      </div>
      <div class="card"><div class="stat-row">
        <div class="stat"><div class="sv">${last.score}</div><div class="sl">最新分</div></div>
        <div class="stat"><div class="sv ${delta>=0?'trend-up':''}">${delta>=0?'+':''}${delta}</div><div class="sl">较期初</div></div>
        <div class="stat"><div class="sv">${avg}</div><div class="sl">班级平均</div></div>
        <div class="stat"><div class="sv">${streak>0?'连涨'+streak:'稳'}</div><div class="sl">趋势</div></div>
      </div></div>
      <div class="ai-card"><span class="ai-badge">✨ 老师寄语</span><div class="ai-p">${esc(r.bright)}</div>
        <div class="ai-sec"><span class="ico">🎯</span>提升建议</div><ul class="ai-list">${r.advice.map(a=>`<li>${esc(a)}</li>`).join('')}</ul></div>
      <div class="card center muted">—— 小圈教育，让每一次进步都被看见 ——<br>续费锁定优惠，私信老师立省 ¥${stu.remaining<=4?(S.packages.find(p=>p.subject===subj)||S.packages[0]).price:0}</div>`;
    openSub(stu.name + ' · 家长版报告', html);
  }

  // ===================== 渲染：考勤 =====================
  function renderAttendance(body) {
    const today = todayStr();
    const recs = S.attendance.filter(a => a.date === today);
    const cnt = { 出勤: 0, 请假: 0, 迟到: 0, 缺勤: 0 };
    recs.forEach(r => cnt[r.status] = (cnt[r.status] || 0) + 1);
    const marked = new Set(recs.map(r => r.student));
    const unmarked = S.students.filter(s => !marked.has(s.name));
    const rows = recs.map(r => { const st = findStu(r.student); const c = { '出勤': 'tag-green', '请假': 'tag-amber', '迟到': 'tag-amber', '缺勤': 'tag-red' }[r.status]; return `<div class="row"><div class="avatar">${st ? st.avatar : '🙂'}</div><div class="r-main"><div class="r-name">${esc(r.student)}</div><div class="r-sub">${fmtDate(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</div></div><div class="r-right"><span class="tag ${c}">${r.status}</span></div></div>`; }).join('') || '<div class="empty"><div class="e-ico">🗓️</div>今日尚未考勤</div>';
    const unHtml = unmarked.length ? `<div class="section-title">未考勤（${unmarked.length}）</div><div class="list">${unmarked.map(s => `<div class="row"><div class="avatar">${s.avatar}</div><div class="r-main"><div class="r-name">${esc(s.name)}</div><div class="r-sub">${esc(s.grade)} · ${esc(s.subject)}</div></div><button class="btn-soft btn-sm" data-mark="${s.id}">记</button></div>`).join('')}</div>` : '';
    body.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">出勤</div><div class="k-val" style="color:var(--success)">${cnt.出勤}</div></div>
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">请假</div><div class="k-val" style="color:var(--warn)">${cnt.请假}</div></div>
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">迟到</div><div class="k-val" style="color:var(--warn)">${cnt.迟到}</div></div>
        <div class="kpi"><div class="kpi-accent"></div><div class="k-label">缺勤</div><div class="k-val" style="color:var(--danger)">${cnt.缺勤}</div></div>
      </div>
      <div class="card center"><button class="btn-primary" id="markBtn">＋ 记考勤</button></div>
      <div class="section-title">今日考勤（${recs.length}）</div>
      <div class="list">${rows}</div>
      ${unHtml}`;
    $('#markBtn').onclick = () => markAttendance();
    $$('[data-mark]').forEach(b => b.onclick = () => markAttendance(b.dataset.mark));
  }
  function markAttendance(preId) {
    const stu = preId ? findStuById(preId) : null;
    const opts = S.students.map(s => `<option ${stu && s.id === stu.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>学员</label><select id="a_stu">${opts}</select></div>
      <div class="field"><label>状态</label><select id="a_status"><option>出勤</option><option>请假</option><option>迟到</option><option>缺勤</option></select></div>
      <div class="field"><label>备注</label><input id="a_note" placeholder="可选"></div>`;
    openSheet('记考勤', body, `<button class="btn-ghost" id="a_cancel">取消</button><button class="btn-primary" id="a_save">保存</button>`);
    $('#a_cancel').onclick = closeSheet;
    $('#a_save').onclick = () => {
      const name = $('#a_stu').value; S.attendance.push({ id: uid(), student: name, status: $('#a_status').value, note: $('#a_note').value.trim(), date: todayStr() });
      saveState(); closeSheet(); toast('已记录'); renderStudy('attendance');
    };
  }

  // ===================== 渲染：家长沟通 =====================
  function renderComm(body) {
    const tl = S.comms.slice().sort((a, b) => b.date.localeCompare(a.date)).map(c => {
      const cls = c.type === '续报引导' ? 'tl-red' : c.type === '学情反馈' ? '' : 'tl-green';
      return `<div class="tl-item ${cls}"><div class="tl-time">${fmtDate(c.date)} · ${esc(c.channel)} · ${esc(c.type)}</div><div class="tl-title">${esc(c.student)}</div><div class="tl-text">${esc(c.content)}</div></div>`;
    }).join('') || '<div class="empty"><div class="e-ico">💬</div>暂无沟通记录</div>';
    const fol = S.followups.filter(f => !f.done).map(f => { const over = daysBetween(f.due, todayStr()) < 0; return `<div class="todo-item"><span class="todo-dot ${over ? 'dot-red' : 'dot-amber'}"></span><div class="todo-main"><div class="tt">${esc(f.content)}</div><div class="ts">${esc(f.student)} · ${over ? '<span class="todo-over">逾期' + Math.abs(daysBetween(f.due, todayStr())) + '天</span>' : '截止 ' + fmtDate(f.due)}</div></div><button class="btn-soft btn-sm" data-done="${f.id}">完成</button></div>`; }).join('') || '<div class="empty">暂无待回访</div>';
    const cats = ['学情反馈', '续报引导', '批评鼓励', '请假通知'];
    const tpl = cats.map(cat => `<div class="section-title">${cat}</div>` + S.templates.filter(t => t.cat === cat).map(t => `<div class="row"><div class="r-main"><div class="r-name">${esc(t.title)}</div><div class="r-sub">${esc(t.content.slice(0, 22))}…</div></div><button class="btn-soft btn-sm" data-use="${t.id}">用</button></div>`).join('')).join('');
    body.innerHTML = `
      <div class="btn-row mb"><button class="btn-primary" id="addCommBtn">＋ 写沟通</button><button class="btn-soft" id="addTplBtn">＋ 话术</button></div>
      <div class="card"><div class="card-h"><span class="t">待回访</span></div>${fol}</div>
      <div class="card"><div class="card-h"><span class="t">沟通时间线</span></div><div class="timeline">${tl}</div></div>
      <div class="card"><div class="card-h"><span class="t">话术库</span><span class="more" id="addFolBtn">＋ 回访</span></div>${tpl}</div>`;
    $('#addCommBtn').onclick = () => addComm();
    $('#addTplBtn').onclick = () => addTemplate();
    $('#addFolBtn').onclick = () => addFollowup();
    $$('[data-done]').forEach(b => b.onclick = () => { const f = S.followups.find(x => x.id === b.dataset.done); f.done = true; saveState(); toast('已标记完成'); renderComm(body); });
    $$('[data-use]').forEach(b => b.onclick = () => useTemplate(b.dataset.use));
  }
  function addComm(preId) {
    const stu = preId ? findStuById(preId) : null;
    const opts = S.students.map(s => `<option ${stu && s.id === stu.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>学员</label><select id="cm_stu">${opts}</select></div>
      <div class="field"><label>方式</label><select id="cm_ch"><option>微信</option><option>电话</option><option>面谈</option></select></div>
      <div class="field"><label>类型</label><select id="cm_type"><option>学情反馈</option><option>续报引导</option><option>批评鼓励</option><option>请假通知</option></select></div>
      <div class="field"><label>内容</label><textarea id="cm_text" placeholder="沟通内容"></textarea></div>`;
    openSheet('写沟通记录', body, `<button class="btn-ghost" id="cm_cancel">取消</button><button class="btn-primary" id="cm_save">保存</button>`);
    $('#cm_cancel').onclick = closeSheet;
    $('#cm_save').onclick = () => {
      S.comms.unshift({ id: uid(), student: $('#cm_stu').value, channel: $('#cm_ch').value, type: $('#cm_type').value, content: $('#cm_text').value.trim() || '（无内容）', date: todayStr() });
      saveState(); closeSheet(); toast('已保存'); renderComm($('#studyBody'));
    };
  }
  function addTemplate() {
    const cats = ['学情反馈', '续报引导', '批评鼓励', '请假通知'];
    const body = `<div class="field"><label>分类</label><select id="tp_cat">${cats.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div class="field"><label>标题</label><input id="tp_title" placeholder="如 成绩提升报喜"></div>
      <div class="field"><label>内容（可用变量 ${name} ${score} ${delta} ${remain} ${pkg} ${save}）</label><textarea id="tp_text" placeholder="模板正文"></textarea></div>`;
    openSheet('新增话术', body, `<button class="btn-ghost" id="tp_cancel">取消</button><button class="btn-primary" id="tp_save">保存</button>`);
    $('#tp_cancel').onclick = closeSheet;
    $('#tp_save').onclick = () => {
      S.templates.push({ id: uid(), cat: $('#tp_cat').value, title: $('#tp_title').value.trim() || '未命名', content: $('#tp_text').value.trim() });
      saveState(); closeSheet(); toast('已保存'); renderComm($('#studyBody'));
    };
  }
  function useTemplate(id) {
    const t = S.templates.find(x => x.id === id); if (!t) return;
    const stuOpts = S.students.map(s => `<option>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>发送学员</label><select id="u_stu">${stuOpts}</select></div>
      <div class="field"><label>编辑内容</label><textarea id="u_text">${esc(t.content)}</textarea></div>`;
    openSheet('使用话术 · ' + t.title, body, `<button class="btn-ghost" id="u_cancel">取消</button><button class="btn-primary" id="u_send">发送并记录</button>`);
    $('#u_cancel').onclick = closeSheet;
    $('#u_send').onclick = () => {
      S.comms.unshift({ id: uid(), student: $('#u_stu').value, channel: '微信', type: t.cat, content: $('#u_text').value.trim(), date: todayStr() });
      saveState(); closeSheet(); toast('已记录沟通'); renderComm($('#studyBody'));
    };
  }
  function addFollowup() {
    const stuOpts = S.students.map(s => `<option>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>学员</label><select id="fo_stu">${stuOpts}</select></div>
      <div class="field"><label>事项</label><input id="fo_text" placeholder="如 推进续费"></div>
      <div class="field"><label>截止日期</label><input id="fo_due" type="date" value="${todayStr()}"></div>
      <div class="field"><label>优先级</label><select id="fo_prio"><option>高</option><option>中</option><option>低</option></select></div>`;
    openSheet('新增回访', body, `<button class="btn-ghost" id="fo_cancel">取消</button><button class="btn-primary" id="fo_save">保存</button>`);
    $('#fo_cancel').onclick = closeSheet;
    $('#fo_save').onclick = () => {
      S.followups.push({ id: uid(), student: $('#fo_stu').value, content: $('#fo_text').value.trim() || '回访', due: $('#fo_due').value || todayStr(), done: false, prio: $('#fo_prio').value });
      saveState(); closeSheet(); toast('已添加'); renderComm($('#studyBody')); refreshBell();
    };
  }

  // ===================== 渲染：学习计划 =====================
  function renderPlans(body) {
    const cards = S.plans.map(p => {
      const stu = findStu(p.student);
      const items = p.items.map((it, i) => `<div class="todo-item"><span class="todo-dot ${it.done ? 'dot-green' : 'dot-amber'}"></span><div class="todo-main"><div class="tt" style="${it.done ? 'text-decoration:line-through;color:var(--ink3)' : ''}">${esc(it.text)}</div></div><button class="btn-soft btn-sm" data-toggle="${p.id}:${i}">${it.done ? '↺' : '✓'}</button></div>`).join('');
      return `<div class="card"><div class="card-h"><span class="t">${stu ? stu.avatar + ' ' : ''}${esc(p.student)} · ${esc(p.title)}</span><span class="more" data-delplan="${p.id}">删除</span></div><div class="muted">${fmtDate(p.date)}</div>${items}</div>`;
    }).join('') || '<div class="empty"><div class="e-ico">📋</div>暂无学习计划</div>';
    body.innerHTML = `<div class="btn-row mb"><button class="btn-primary" id="addPlanBtn">＋ 新建计划</button></div>${cards}`;
    $('#addPlanBtn').onclick = () => addPlan();
    $$('[data-toggle]').forEach(b => b.onclick = () => { const [pid, i] = b.dataset.toggle.split(':'); const p = S.plans.find(x => x.id === pid); p.items[i].done = !p.items[i].done; saveState(); renderPlans(body); });
    $$('[data-delplan]').forEach(b => b.onclick = () => { if (confirm('删除该计划？')) { S.plans = S.plans.filter(x => x.id !== b.dataset.delplan); saveState(); renderPlans(body); } });
  }
  function addPlan() {
    const stuOpts = S.students.map(s => `<option>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>学员</label><select id="pl_stu">${stuOpts}</select></div>
      <div class="field"><label>计划标题</label><input id="pl_title" placeholder="如 期末冲刺计划"></div>
      <div class="field"><label>任务(每行一项)</label><textarea id="pl_items" placeholder="每日错题重做&#10;周末模拟卷"></textarea></div>`;
    openSheet('新建学习计划', body, `<button class="btn-ghost" id="pl_cancel">取消</button><button class="btn-primary" id="pl_save">保存</button>`);
    $('#pl_cancel').onclick = closeSheet;
    $('#pl_save').onclick = () => {
      const items = $('#pl_items').value.split('\n').map(x => x.trim()).filter(Boolean).map(t => ({ text: t, done: false }));
      S.plans.push({ id: uid(), student: $('#pl_stu').value, title: $('#pl_title').value.trim() || '学习计划', date: todayStr(), items });
      saveState(); closeSheet(); toast('已创建'); renderPlans($('#studyBody'));
    };
  }

  // ===================== AI 模块：学情测评（三段式） =====================
  function aiPickerView(body, title, runner) {
    const opts = S.students.map(s => `<option value="${s.id}">${esc(s.name)} · ${esc(s.subject)}</option>`).join('');
    body.innerHTML = `<div class="ai-card"><span class="ai-badge">🤖 ${title}</span><div class="ai-p">选择学员后一键生成；未配置 API 时自动使用本地规则引擎。</div></div>
      <div class="field"><label>选择学员</label><select id="aiStu">${opts}</select></div>
      <button class="btn-primary" id="aiGo">⚡ 生成</button>
      <div class="muted mt">配置 AI：我的 → AI 设置（DeepSeek / 豆包 / OpenAI 兼容）</div>`;
    $('#aiGo').onclick = () => { const stu = findStuById($('#aiStu').value); if (stu) runner(stu); };
  }
  function renderAssess(body) { aiPickerView(body, 'AI 学情测评', runAssess); }
  async function runAssess(stu) {
    showLoading('AI 测评中…');
    const ai = await callAI('你是教培机构学情分析师，请基于学员成绩与薄弱项，输出三段式：1)亮点 2)风险 3)建议(3条)。简洁中文。', `学员${stu.name}，${stu.grade}，${stu.subject}。成绩：${JSON.stringify(stu.scores)}。薄弱项：${stu.weak.join('、') || '无'}。`);
    hideLoading();
    let res;
    if (!ai || ai.startsWith('[[ERR]]')) { res = localAssess(stu); if (ai && ai.startsWith('[[ERR]]')) toast('AI 不可用，已用本地引擎'); }
    else res = { aiText: ai };
    showAssessResult(stu, res);
  }
  function showAssessResult(stu, res) {
    const inner = res.aiText
      ? `<div class="ai-badge">🤖 AI 学情测评</div><div class="ai-p">${esc(res.aiText).replace(/\n+/g, '<br>')}</div>`
      : `<div class="ai-badge">🤖 本地学情引擎</div>
        <div class="ai-sec"><span class="ico">✨</span>亮点</div><div class="ai-p">${esc(res.bright)}</div>
        <div class="ai-sec"><span class="ico">⚠️</span>风险</div><div class="ai-p">${esc(res.risk)}</div>
        <div class="ai-sec"><span class="ico">🎯</span>建议</div><ul class="ai-list">${res.advice.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
    openSub(stu.name + ' · AI测评', `<div class="ai-card">${inner}</div><div class="btn-row"><button class="btn-soft" id="asFb">写反馈</button><button class="btn-primary" id="asSave">保存到档案</button></div>`);
    $('#asFb').onclick = () => addFb(stu.id);
    $('#asSave').onclick = () => { S.studies.push({ id: uid(), student: stu.name, type: '测评', content: res.aiText || (res.bright + res.risk + res.advice.join('')), date: todayStr() }); saveState(); toast('已存入学情档案'); };
  }

  // ===================== AI 模块：上课反馈（报喜优先） =====================
  function renderFeedbackAI(body) { aiPickerView(body, 'AI 上课反馈', runFeedback); }
  async function runFeedback(stu) {
    showLoading('AI 反馈生成中…');
    const ai = await callAI('你是培训机构老师，写一条发给家长的上课反馈，必须报喜优先：先表扬优点，再温和指出可改进点，最后鼓励。温暖简短。', `学员${stu.name}，${stu.subject}，最新成绩见${JSON.stringify(stu.scores.slice(-2))}，薄弱项：${stu.weak.join('、') || '无'}。`);
    hideLoading();
    let res;
    if (!ai || ai.startsWith('[[ERR]]')) { res = localClassFeedback(stu); if (ai && ai.startsWith('[[ERR]]')) toast('AI 不可用，已用本地引擎'); }
    else res = { aiText: ai };
    showFeedbackResult(stu, res);
  }
  function showFeedbackResult(stu, res) {
    const inner = res.aiText
      ? `<div class="ai-badge">🤖 AI 上课反馈</div><div class="ai-p">${esc(res.aiText).replace(/\n+/g, '<br>')}</div>`
      : `<div class="ai-badge">🤖 本地反馈引擎（报喜优先）</div>
        <div class="ai-sec"><span class="ico">👍</span>表扬</div><div class="ai-p">${esc(res.praise)}</div>
        <div class="ai-sec"><span class="ico">💡</span>建议</div><div class="ai-p">${esc(res.improve)}</div>
        <div class="ai-sec"><span class="ico">🌈</span>鼓励</div><div class="ai-p">${esc(res.encourage)}</div>`;
    openSub(stu.name + ' · 上课反馈', `<div class="ai-card">${inner}</div><div class="btn-row"><button class="btn-soft" id="fbCopy">复制</button><button class="btn-primary" id="fbSave">存为反馈</button></div>`);
    $('#fbCopy').onclick = () => { const txt = res.aiText || (res.praise + res.improve + res.encourage); navigator.clipboard && navigator.clipboard.writeText(txt); toast('已复制'); };
    $('#fbSave').onclick = () => { S.feedback.unshift({ id: uid(), student: stu.name, type: '上课反馈', content: res.aiText || (res.praise + res.improve + res.encourage), date: todayStr(), sentiment: 'positive', star: 5 }); saveState(); toast('已保存'); };
  }

  // ===================== AI 模块：双向分析 =====================
  function renderBidirectional(body) { aiPickerView(body, 'AI 双向分析', runBidirectional); }
  async function runBidirectional(stu) {
    showLoading('AI 双向分析中…');
    const d = localBidirectional(stu);
    const ai = await callAI('你是教育咨询师，基于学员数据做双向分析（学习目标达成 + 学习状态/情绪），输出一段诊断与 4 条提升计划。', `学员${stu.name} ${stu.grade} ${stu.subject}，最新 ${d.last} 分，目标 ${d.target} 分，薄弱项：${stu.weak.join('、') || '无'}。`);
    hideLoading();
    let diag = d.diag;
    if (ai && !ai.startsWith('[[ERR]]')) diag = '【AI 视角】' + ai.replace(/\n+/g, ' ');
    else if (ai && ai.startsWith('[[ERR]]')) toast('AI 不可用，已用本地引擎');
    showBidirectionalResult(stu, Object.assign({}, d, { diag }));
  }
  function gaugeOpt(val, color) {
    return { series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, progress: { show: true, width: 10, itemStyle: { color } }, axisLine: { lineStyle: { width: 10, color: [[1, '#EEF0F4']] } }, pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { valueAnimation: true, fontSize: 22, fontWeight: 'bolder', offsetCenter: [0, '0%'], formatter: '{value}%', color }, data: [{ value: val }] }] };
  }
  function showBidirectionalResult(stu, d) {
    openSub(stu.name + ' · 双向分析', `
      <div class="ring-wrap">
        <div><div id="biReach" class="ring"></div><div class="center muted">目标达成度</div></div>
        <div><div id="biEmo" class="ring"></div><div class="center muted">学习状态</div></div>
      </div>
      <div class="ai-card"><span class="ai-badge">🩺 双向诊断</span><div class="ai-p">${esc(d.diag).replace(/\n+/g, '<br>')}</div>
        <div class="ai-sec"><span class="ico">🧭</span>提升计划</div><ul class="ai-list">${d.plan.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <div class="btn-row"><button class="btn-soft" id="biFb">写反馈</button><button class="btn-primary" id="biSave">保存</button></div>`);
    mountChart($('#biReach'), gaugeOpt(d.reach, '#7C3AED'));
    mountChart($('#biEmo'), gaugeOpt(d.emo, '#2563EB'));
    $('#biFb').onclick = () => addFb(stu.id);
    $('#biSave').onclick = () => { S.studies.push({ id: uid(), student: stu.name, type: '双向', content: d.diag + d.plan.join(''), date: todayStr() }); saveState(); toast('已保存'); };
  }

  function addFb(stuId) {
    const stu = stuId ? findStuById(stuId) : null;
    const opts = S.students.map(s => `<option ${stu && s.id === stu.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const body = `<div class="field"><label>学员</label><select id="fb_stu">${opts}</select></div>
      <div class="field"><label>类型</label><select id="fb_type"><option>上课反馈</option><option>学情反馈</option></select></div>
      <div class="field"><label>情感</label><select id="fb_sent"><option value="positive">正面</option><option value="neutral">中性</option><option value="negative">待改进</option></select></div>
      <div class="field"><label>星级</label><select id="fb_star">${[5, 4, 3, 2, 1].map(n => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>内容</label><textarea id="fb_text" placeholder="反馈内容"></textarea></div>`;
    openSheet('写反馈', body, `<button class="btn-ghost" id="fb_cancel">取消</button><button class="btn-primary" id="fb_save">保存</button>`);
    $('#fb_cancel').onclick = closeSheet;
    $('#fb_save').onclick = () => {
      S.feedback.unshift({ id: uid(), student: $('#fb_stu').value, type: $('#fb_type').value, content: $('#fb_text').value.trim() || '（无内容）', date: todayStr(), sentiment: $('#fb_sent').value, star: parseInt($('#fb_star').value) });
      saveState(); closeSheet(); toast('已保存'); if (curTab === 'study' && curStudy === 'comm') renderComm($('#studyBody'));
    };
  }

  // ===================== 我的 / 设置 / 数据管理 =====================
  function renderMine() {
    const host = $('#pageHost'); const st = S.settings;
    host.innerHTML = `
      <div class="card"><div class="profile-head" style="margin-bottom:0"><div class="pa">${S.org.logo}</div><div><div class="pn">${esc(S.org.name)}</div><div class="ps">${esc(S.org.owner)} · ${esc(S.org.phone)}</div></div></div></div>
      <div class="card"><div class="card-h"><span class="t">🤖 AI 设置</span></div>
        <div class="set-item"><div><div class="s-label">API Key</div><div class="s-desc">配置后 AI 调用云端，否则用本地引擎</div></div><button class="s-act" id="aiSet">${st.aiKey ? '已配置' : '去配置'}</button></div>
        <div class="set-item"><div><div class="s-label">接口地址</div><div class="s-desc">${esc(st.aiBase)}</div></div></div>
      </div>
      <div class="card"><div class="card-h"><span class="t">🗂️ 数据管理</span></div>
        <div class="set-item"><div><div class="s-label">导出全部数据</div></div><button class="s-act" id="expBtn">导出</button></div>
        <div class="set-item"><div><div class="s-label">导入备份</div></div><button class="s-act" id="impBtn">导入</button></div>
        <div class="set-item"><div><div class="s-label">重置为演示数据</div><div class="s-desc">清空本地，重新载入小圈教育</div></div><button class="s-act" id="resetBtn">重置</button></div>
      </div>
      <div class="card"><div class="card-h"><span class="t">📊 数据概览</span></div>
        <div class="set-item"><div class="s-label">学员 / 班级 / 课包</div><div class="s-act">${S.students.length} / ${S.classes.length} / ${S.packages.length}</div></div>
        <div class="set-item"><div class="s-label">缴费 / 反馈 / 沟通</div><div class="s-act">${S.payments.length} / ${S.feedback.length} / ${S.comms.length}</div></div>
      </div>
      <div class="card center"><button class="btn-danger" id="logoutBtn">退出登录</button></div>
      <input type="file" id="impFile" accept="application/json" hidden>`;
    $('#aiSet').onclick = openAISettings;
    $('#expBtn').onclick = exportAll;
    $('#impBtn').onclick = () => $('#impFile').click();
    $('#impFile').onchange = (e) => { if (e.target.files[0]) importAll(e.target.files[0]); };
    $('#resetBtn').onclick = () => { if (confirm('清空本地数据并重置为演示数据？')) { localStorage.removeItem(STORE_KEY); S = seedData(); saveState(); toast('已重置'); renderMine(); } };
    $('#logoutBtn').onclick = () => { localStorage.removeItem(LOGIN_KEY); $('#appShell').classList.add('hidden'); $('#loginPage').classList.remove('hidden'); };
  }
  function openAISettings() {
    const st = S.settings;
    const body = `<div class="field"><label>接口地址 (Base URL)</label><input id="ai_base" value="${esc(st.aiBase)}" placeholder="https://api.deepseek.com/v1"></div>
      <div class="field"><label>模型名</label><input id="ai_model" value="${esc(st.aiModel)}" placeholder="deepseek-chat"></div>
      <div class="field"><label>API Key</label><input id="ai_key" type="password" value="${esc(st.aiKey)}" placeholder="sk-..."></div>
      <div class="muted">支持 DeepSeek / 豆包 / OpenAI 兼容接口（/chat/completions）。留空则用本地规则引擎。</div>`;
    openSheet('AI 设置', body, `<button class="btn-ghost" id="ai_cancel">取消</button><button class="btn-primary" id="ai_save">保存</button>`);
    $('#ai_cancel').onclick = closeSheet;
    $('#ai_save').onclick = () => { S.settings = { aiBase: $('#ai_base').value.trim() || 'https://api.deepseek.com/v1', aiModel: $('#ai_model').value.trim() || 'deepseek-chat', aiKey: $('#ai_key').value.trim() }; saveState(); closeSheet(); toast('已保存'); renderMine(); };
  }

  // ===================== 提醒 / 快捷新增 =====================
  function refreshBell() {
    const T = todayStr();
    const has = pendingFollowups().some(f => daysBetween(f.due, T) <= 0) || S.todos.some(t => !t.done && daysBetween(t.due, T) <= 0);
    $('#bellDot').classList.toggle('hidden', !has);
  }
  function openBell() {
    const T = todayStr();
    const items = [...pendingFollowups().map(f => ({ t: f.content, s: f.student + ' · 回访', over: daysBetween(f.due, T) < 0, due: f.due })),
      ...S.todos.filter(x => !x.done).map(x => ({ t: x.text, s: '待办', over: daysBetween(x.due, T) < 0, due: x.due }))]
      .sort((a, b) => (a.over === b.over) ? a.due.localeCompare(b.due) : (a.over ? -1 : 1));
    const html = items.length ? items.map(x => `<div class="todo-item"><span class="todo-dot ${x.over ? 'dot-red' : 'dot-amber'}"></span><div class="todo-main"><div class="tt">${esc(x.t)}</div><div class="ts">${esc(x.s)} · ${x.over ? '<span class="todo-over">逾期' + Math.abs(daysBetween(x.due, T)) + '天</span>' : '截止 ' + fmtDate(x.due)}</div></div></div>`).join('') : '<div class="empty">暂无提醒</div>';
    openSheet('提醒', html, `<button class="btn-primary" id="bell_close">知道了</button>`);
    $('#bell_close').onclick = closeSheet;
  }
  function openQuickAdd() {
    const acts = [['💰', '记一笔缴费', 'addPay'], ['👩‍🎓', '加学员', 'addStu'], ['📝', '写反馈', 'addFb'], ['🗓️', '排课/班级', 'addClass'], ['✅', '加待办', 'addTodo'], ['🔔', '加回访', 'addFol']];
    const body = `<div class="quick-grid">${acts.map(([i, t, a]) => `<button class="quick-item" data-qa="${a}"><span class="q-ico">${i}</span><span class="q-tx">${t}</span></button>`).join('')}</div>`;
    openSheet('快捷新增', body, `<button class="btn-ghost" id="qa_close">关闭</button>`);
    $('#qa_close').onclick = closeSheet;
    $$('[data-qa]').forEach(b => b.onclick = () => {
      const a = b.dataset.qa; closeSheet();
      if (a === 'addPay') addPay(); else if (a === 'addStu') openStudentModal(); else if (a === 'addFb') addFb(); else if (a === 'addClass') openClassModal(); else if (a === 'addTodo') addTodo(); else if (a === 'addFol') addFollowup();
    });
  }
  function addTodo() {
    const body = `<div class="field"><label>事项</label><input id="td_text" placeholder="如 打印期末试卷"></div>
      <div class="field"><label>截止</label><input id="td_due" type="date" value="${todayStr()}"></div>
      <div class="field"><label>优先级</label><select id="td_prio"><option>高</option><option>中</option><option>低</option></select></div>`;
    openSheet('加待办', body, `<button class="btn-ghost" id="td_cancel">取消</button><button class="btn-primary" id="td_save">保存</button>`);
    $('#td_cancel').onclick = closeSheet;
    $('#td_save').onclick = () => { S.todos.push({ id: uid(), text: $('#td_text').value.trim() || '待办', due: $('#td_due').value || todayStr(), done: false, prio: $('#td_prio').value }); saveState(); closeSheet(); toast('已添加'); refreshBell(); if (curTab === 'dashboard') renderDashboard(); };
  }

  // ===================== 登录 / 初始化 =====================
  function doLogin() {
    const phone = $('#loginPhone').value.trim(); const pwd = $('#loginPwd').value;
    if (phone === '13800000001' && pwd === '123456') {
      localStorage.setItem(LOGIN_KEY, '1');
      if (!loadState()) { S = seedData(); saveState(); } else S = loadState();
      $('#loginPage').classList.add('hidden'); $('#appShell').classList.remove('hidden');
      $('#topbarOrg').textContent = S.org.name; switchTab('dashboard'); refreshBell();
    } else toast('账号或密码错误');
  }
  function init() {
    $('#loginBtn').onclick = doLogin;
    $('#loginReset').onclick = () => { if (confirm('清空本地所有数据并重新载入演示？')) { localStorage.removeItem(STORE_KEY); S = seedData(); saveState(); localStorage.setItem(LOGIN_KEY, '1'); $('#loginPage').classList.add('hidden'); $('#appShell').classList.remove('hidden'); $('#topbarOrg').textContent = S.org.name; switchTab('dashboard'); refreshBell(); toast('已重置'); } };
    $$('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
    $('#topAddBtn').onclick = openQuickAdd;
    $('#topBellBtn').onclick = openBell;
    if (localStorage.getItem(LOGIN_KEY) && loadState()) {
      S = loadState(); $('#loginPage').classList.add('hidden'); $('#appShell').classList.remove('hidden'); $('#topbarOrg').textContent = S.org.name; switchTab('dashboard'); refreshBell();
    } else { $('#appShell').classList.add('hidden'); $('#loginPage').classList.remove('hidden'); }
  }
  init();
})();
