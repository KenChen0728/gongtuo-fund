import { createFirebaseStore, createDemoStore } from './data.js';
import { colName } from './xlsx.js';
import { sampleData } from './sample.js';

const VERSION = '2026.11.18.1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n < 0 ? '-' : '') + Math.abs(Math.round(n || 0)).toLocaleString('en-US');
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const ls = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) { } } };

/* ===== 日期 ===== */
const NOW = new Date();
const CY = NOW.getFullYear() - 1911, CM = NOW.getMonth() + 1, CD = NOW.getDate();
const ymNum = (y, m) => y * 100 + m;
const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const CYM = ymNum(CY, CM);
const TODAY = `${CM}/${CD}`;
const TODAY_ISO = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`;
const shiftYM = (y, m, d) => { let t = y * 12 + (m - 1) + d; return { y: Math.floor(t / 12), m: t % 12 + 1 }; };
const daysIn = (y, m) => new Date(y + 1911, m, 0).getDate();

/* ===== 固定資料 ===== */
const NURSERIES = {
  wandan: { short: '萬丹', code: '萬', full: '屏東縣萬丹鄉公設民營托嬰中心', tax: '00451325', assoc: '中華頭心手希望教育協會' },
  yuying: { short: '育英', code: '育', full: '屏東縣內埔鄉育英公設民營托嬰中心', tax: '00451697', assoc: '中華頭心手希望教育協會' },
  gongzheng: { short: '公正', code: '公', full: '屏東縣屏東市公正公設民營托嬰中心', tax: '94574090', assoc: '中華頭心手希望教育協會', reserved: 11 },
  shoutian: { short: '壽天', code: '壽', full: '高雄市岡山區壽天公共托嬰中心', tax: '61189590', assoc: '中華頭心手希望教育協會' },
};
const DEFAULT_CATS = [
  { src: '委辦費-業務費', items: ['影印機', '愛托付系統', '飲水機', '保全', '計畫督導津貼', '通訊網路費', '電費', '場地費', '保險', '消防申報', '外聘督導費', '104系統', '日常消耗用品', '行政文書辦公', '環境維護消毒', '冷氣清洗', '維修', '電腦維修及採購', '購置設備'] },
  { src: '營運收入支應-業務費', items: ['員工福利', '專業提升研習費', '教學活動及節慶活動用品', '玩具書籍', '幼兒退費'] },
  { src: '營運收入支應-餐點費', items: ['幼兒食材'] },
  { src: '營運收入支應-兒童團體保險', items: ['兒童團體保險'] },
  { src: '提升托育品質-業務費', items: ['提升托育品質'] },
  { src: '委辦費-行管費', items: ['行政管理費'] },
];
const SETTINGS_REV = 4;
// 委辦費-業務費的細項：上面那串是萬丹的；其他三間預設只有這 6 項，不用的可以在設定刪除、再加自己的。01 號四間都是計畫督導津貼
const OTHER_WB = ['影印機', '網路通訊費', '愛托付', '保險', '計畫督導津貼', '104系統'];
const OTHER_CATS = DEFAULT_CATS.map((g, i) => i ? g : { ...g, items: [...OTHER_WB] });
for (const n of ['yuying', 'gongzheng', 'shoutian']) NURSERIES[n].cats = OTHER_CATS;
const DEFAULTS = { rev: SETTINGS_REV, firstItem: '計畫督導津貼', pi: '', admBudget: 0, manualUntil: {}, director: '', reserved: 9, petty: 30000, supervisor: 5000, staff: [], wbPersonBudget: 0, wbPersonUsedBefore: 0, wbBizTotal: 0, budget: {}, usedBefore: {}, cats: DEFAULT_CATS, receiptNext: 1, receiptSkip: [], vendors: {} };
// 經費來源：內建的有顏色和報表位置；各公托自己加的（例如開辦費）列在年度報表下方的「其他經費來源」
const SRC_CLS = { '委辦費-業務費': 'wb', '委辦費-人事費': 'wb', '委辦費-行管費': 'adm', '營運收入支應-業務費': 'op', '營運收入支應-人事費': 'op', '營運收入支應-年終獎金': 'op', '營運收入支應-餐點費': 'food', '營運收入支應-兒童團體保險': 'ins', '提升托育品質-業務費': 'q', '提升托育品質-人事費': 'q' };
const COMMON = ['幼兒食材', '教學活動及節慶活動用品', '日常消耗用品', '行政文書辦公', '員工福利', '玩具書籍'];
const INCOME_SRC = ['優化比', '提升托育品質', '縣府補助款', '其他'];

/* ===== 狀態 ===== */
let store = null, NID = null, DEMO = false;
const S = () => store.state;
let N = { ...DEFAULTS };                 // 目前公托的設定（含預設）
function refreshN() { N = { ...DEFAULTS, ...(NURSERIES[NID] || {}), ...(S().settings || {}) }; if (!N.cats || !N.cats.length) N.cats = DEFAULT_CATS; }
const cats = () => N.cats;
const wbItems = () => (cats().find(g => g.src === '委辦費-業務費') || DEFAULT_CATS[0]).items;
let invKeep = null;
const invSrc = cat => invKeep && cat === invKeep.cat && invKeep.src ? invKeep.src : srcOf(cat);
const srcOf = cat => { for (const g of cats()) if (g.items.includes(cat)) return g.src; return '營運收入支應-業務費'; };
const pill = src => `<span class="pill p-${SRC_CLS[src] || 'cus'}">${esc(src)}</span>`;
const isCustomSrc = src => !!src && !(src in SRC_CLS);
const allSrcs = () => [...Object.keys(SRC_CLS), ...cats().map(g => g.src).filter(s => isCustomSrc(s))].filter((s, i, a) => a.indexOf(s) === i);
const amt = x => (+x.qty || 1) * (+x.price || 0);
const isWB = v => v.src === '委辦費-業務費' || v.src === '委辦費-人事費';

/* ===== 資料查詢 ===== */
const invoices = () => S().invoices.filter(x => !x.deleted);
const openInv = () => invoices().filter(x => !x.voucher);
const pettyOpen = () => invoices().filter(x => x.payer === '主任' && !x.settled);
const vouchers = () => S().vouchers.filter(v => !v.deleted);
const vouchersOf = (y, m) => vouchers().filter(v => v.y === y && v.m === m);
const printableOf = (y, m) => vouchersOf(y, m).filter(v => v.kind === 'inv').sort((a, b) => a.no.localeCompare(b.no));
const unprintedAll = () => vouchers().filter(v => v.kind === 'inv' && !v.printed);
const pre = (y, m) => N.code + y + String(m).padStart(2, '0');
function nextNo(y = CY, m = CM) {
  const p = pre(y, m); let max = +N.reserved || 0;
  for (const v of S().vouchers) if (v.no.startsWith(p)) max = Math.max(max, +v.no.slice(p.length) || 0);
  return p + String(max + 1).padStart(2, '0');
}
function sortPetty(list) { const key = x => x.voucher ? '0' + x.voucher : '1'; return list.slice().sort((a, b) => key(a).localeCompare(key(b)) || a.ym - b.ym || a.d - b.d); }
const monthDoc = (y, m) => S().months[ymKey(y, m)] || {};
const activeKids = () => S().kids.filter(k => k.active !== false).sort((a, b) => a.seat - b.seat);
function monthKids(y, m) {
  const doc = monthDoc(y, m), ids = Object.keys(doc.fees || {});
  const byId = id => S().kids.find(k => k.id === id);
  if (ymNum(y, m) >= CYM) { const a = activeKids(); const extra = ids.map(byId).filter(k => k && !a.includes(k)); return [...a, ...extra].sort((a, b) => a.seat - b.seat); }
  return ids.map(byId).filter(Boolean).sort((a, b) => a.seat - b.seat);
}

/* ===== 計算 ===== */
// 餐點費的月齡以每月 1 號為準：到 1 號已滿幾個月（1 號生日當天算滿）
const ageMonths = (birth, y, m) => { if (!birth) return 99; const [by, bm, bd] = birth.split('-').map(Number); return (y + 1911) * 12 + m - (by * 12 + bm) - ((bd || 1) > 1 ? 1 : 0); };
function kidCalc(k, f, y, m) {
  f = f || {};
  const am = ageMonths(k.birth, y, m), mealFull = am < 6 ? 0 : am < 12 ? 300 : 600;
  const days = f.days === '' || f.days == null ? null : +f.days;
  const fee = days == null ? 12000 : days * 400;
  const meal = mealFull === 0 ? 0 : (days == null ? mealFull : days * (mealFull / 30));   // 600 元一天 20，300 元一天 10
  return { fee, meal, am, total: fee + meal + (+f.late || 0) + (+f.ins || 0) + (+f.refund || 0) };
}
const feeTotal = (y, m) => { const d = monthDoc(y, m); return monthKids(y, m).reduce((a, k) => a + kidCalc(k, (d.fees || {})[k.id], y, m).total, 0); };
function chNum(n) {
  const d = '零壹貳參肆伍陸柒捌玖', u = ['仟', '佰', '拾', ''];
  const four = x => { let s = '', z = false; const t = String(x).padStart(4, '0'); for (let i = 0; i < 4; i++) { const c = +t[i]; if (c === 0) { if (s) z = true } else { if (z) s += '零'; z = false; s += d[c] + u[i] } } return s };
  n = Math.round(Math.abs(n)); if (!n) return '零元整';
  const w = Math.floor(n / 10000), r = n % 10000; let s = '';
  if (w) s += four(w) + '萬';
  if (r) { if (w && r < 1000) s += '零'; s += four(r); }
  return s + '元整';
}
// 收據日期：每月可以自己選；沒選就用設定的「每月幾號」（預設 15 號），遇週六、週日順延
const isoOf = r => `${r.y + 1911}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`;
const fromISO = s => { const [Y, M, D] = String(s).split('-').map(Number); return Y && M && D ? { y: Y - 1911, m: M, d: D } : null; };
function autoReceiptDate(y, m, want = +N.rcptDay || 15) {
  const day = Math.max(1, Math.min(want, daysIn(y, m))), dt = new Date(y + 1911, m - 1, day);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return { y: dt.getFullYear() - 1911, m: dt.getMonth() + 1, d: dt.getDate() };
}
function receiptDate(y, m) { const r = fromISO(monthDoc(y, m).rcptDate || ''); return r ? { ...r, set: true } : autoReceiptDate(y, m); }
// 個別收據的日期：勾選改過的用自己的；請款收據沒改過時，用設定的「優化比／契約價金預設幾號」，沒設就跟月費一樣
const kidRcptDate = (y, m, kid) => fromISO(((monthDoc(y, m).kidDates || {})[kid]) || '') || receiptDate(y, m);
const XR_DAY = { opt: 'rcptDayOpt', contract: 'rcptDayContract' };
const xrDefDate = (y, m, type) => { const day = +N[XR_DAY[type]]; return day ? autoReceiptDate(y, m, day) : receiptDate(y, m) };
const xrDate = (y, m, r) => fromISO(r.date || '') || xrDefDate(y, m, r.type);
const md = r => `${r.m}/${r.d}`;
const rocDate = r => `${r.y} 年 ${String(r.m).padStart(2, '0')} 月 ${String(r.d).padStart(2, '0')} 日`;
// 請款收據：優化比（1、4、7、10 月，繳款人預設屏東縣政府）、契約價金（1、2、7、10 月，繳款人預設協會），也可以另開其他收據。
// 和月費收據共用同一本號碼。存在每月資料的 xr（每張一個 key，刪除寫 null）
const CNUM = ['', '一', '二', '三', '四'];
const XR_TYPES = {
  // 優化比：1–3 月是第一期，4 月請款；4–6 月第二期 7 月請款；7–9 月第三期 10 月請款；10–12 月第四期隔年 1 月請款
  opt: { t: '優化比補助款', months: [1, 4, 7, 10], payer: () => N.payGov || '屏東縣政府', memo: () => '', desc: (y, m) => m === 1 ? `${y - 1}年第四期優化比補助款` : `${y}年第${CNUM[[4, 7, 10].indexOf(m) + 1] || ''}期優化比補助款` },
  contract: { t: '契約價金', months: [1, 2, 7, 10], payer: () => N.payAssoc || '中華頭心手希望教育協會', memo: () => '', desc: (y, m) => m === 1 ? `${y - 1}年第四期契約價金` : `${y}年第${({ 2: '一', 7: '二', 10: '三' })[m] || ''}期契約價金` },
  other: { t: '其他收據', months: [], payer: () => '', memo: () => '', desc: () => '' },
};
const monthXR = d => Object.entries(d.xr || {}).filter(([, r]) => r).map(([id, r]) => ({ ...r, id })).sort((a, b) => (a.at || 0) - (b.at || 0));
// 預設金額：契約價金找去年同一期，其他找最近一張同類的
function xrDefaultAmount(type, y, m) {
  const all = Object.values(S().months).flatMap(d => monthXR(d).map(r => ({ ...r, y: d.y, m: d.m }))).filter(r => r.type === type && +r.amount);
  if (type === 'contract') { const same = all.find(r => r.y === y - 1 && r.m === m); if (same) return same.amount; }
  all.sort((a, b) => ymNum(b.y, b.m) - ymNum(a.y, a.m) || (b.at || 0) - (a.at || 0));
  return all.length ? all[0].amount : '';
}
// 收據號碼每年從 001 重新開始。115 年以前沿用舊的單一設定（receiptNext、receiptSkip），之後每年分開記
const RCPT_OLD_Y = 115;
const rcptNext = y => { const v = (N.receiptNextY || {})[y]; return v != null ? +v || 1 : y <= RCPT_OLD_Y ? +N.receiptNext || 1 : 1; };
const rcptSkip = y => (N.receiptSkipY || {})[y] || (y <= RCPT_OLD_Y ? N.receiptSkip || [] : []);
const rcptNo = n => String(n).padStart(3, '0');
// 收據號碼：印過的孩子固定用印的那一號；還沒印過的，從「下一張收據」往後排（跳過協會借用的號碼）
function receiptNos(y, m, kids) {
  const d = monthDoc(y, m), fixed = { ...(d.rcptNos || {}) };
  if (d.rcptStart && !d.rcptNos) {        // 舊資料：只記了起始號碼，照名單順序推回去
    let n = d.rcptStart; const skip = rcptSkip(y);
    for (const k of kids) { while (skip.includes(n)) n++; fixed[k.id] = n++; }
  }
  const used = new Set([...Object.values(fixed), ...monthXR(d).map(r => r.no).filter(Boolean)]), skip = new Set(rcptSkip(y));
  let n = rcptNext(y);
  return kids.map(k => { if (fixed[k.id]) return fixed[k.id]; while (used.has(n) || skip.has(n)) n++; used.add(n); return n++; });
}
function payrollRows(y, m) {
  const d = monthDoc(y, m);
  if (d.payroll) return d.payroll;
  const prev = shiftYM(y, m, -1), pd = monthDoc(prev.y, prev.m).payroll || [];
  return (N.staff || []).map(name => { const p = pd.find(r => r.name === name); return { name, src: p ? p.src : '委辦費-人事費', amount: p ? p.amount : '' }; });
}
const yearMonths = () => Object.values(S().months).filter(d => d.y === CY);
/* ===== 年度經費報表（照萬丹 115 年「每月報表」的列別） =====
   補登月份（系統啟用前，從 Excel 匯入）用 months.manual；其他月份由系統資料算 */
const manualUntil = y => +((N.manualUntil || {})[y]) || 0;
const AN_INC = [['fee', '月費收入'], ['opt', '優化比'], ['q', '提升托育品質']];
const AN_GROUPS = [
  { g: '營運收入\n支應', key: 'op', rows: [['opHR', '人事'], ['opBiz', '業務'], ['opBonus', '年終'], ['opMeal', '餐點'], ['opIns', '兒童團體保險']] },
  { g: '提升托育\n品質', key: 'qq', rows: [['qHR', '人事'], ['qBiz', '業務']] },
];
const AN_WB = [['wbHR', '人事'], ['wbBiz', '業務']];
const SRC_KEY = { '營運收入支應-人事費': 'opHR', '營運收入支應-業務費': 'opBiz', '營運收入支應-年終獎金': 'opBonus', '營運收入支應-餐點費': 'opMeal', '營運收入支應-兒童團體保險': 'opIns', '提升托育品質-人事費': 'qHR', '提升托育品質-業務費': 'qBiz', '委辦費-人事費': 'wbHR', '委辦費-業務費': 'wbBiz', '委辦費-行管費': 'adm' };
const emptyMonth = () => ({ fee: 0, opt: 0, q: 0, other: 0, sub: {}, cus: {}, opHR: 0, opBiz: 0, opBonus: 0, opMeal: 0, opIns: 0, qHR: 0, qBiz: 0, wbHR: 0, wbBiz: 0, adm: 0 });
function sysMonth(y, m) {
  const r = emptyMonth(); r.fee = feeTotal(y, m);
  for (const x of S().incomes) if (x.y === y && x.m === m) {
    const a = +x.amount || 0;
    if (x.source === '優化比') r.opt += a; else if (x.source === '提升托育品質') r.q += a;
    else if (x.source === '縣府補助款') { const l = x.label || '縣府補助款'; r.sub[l] = (r.sub[l] || 0) + a } else r.other += a;
  }
  const d = monthDoc(y, m);
  for (const p of d.payroll || []) r[p.src === '委辦費-人事費' ? 'wbHR' : 'opHR'] += +p.amount || 0;
  if (d.payroll) r.wbBiz += +(d.supervisor ?? N.supervisor) || 0;
  for (const v of vouchersOf(y, m)) {
    if (isCustomSrc(v.src)) { r.cus[v.src] = (r.cus[v.src] || 0) + (+v.amount || 0); continue }
    r[SRC_KEY[v.src] || (v.src.startsWith('提升') ? 'qBiz' : 'opBiz')] += +v.amount || 0;
  }
  return r;
}
function manualMonth(y, m) {
  const r = emptyMonth();
  for (const x of (monthDoc(y, m).manual || {}).rows || []) { const a = +x.a || 0; if (x.k === 'sub') r.sub[x.l] = (r.sub[x.l] || 0) + a; else if (x.k in r) r[x.k] += a; }
  return r;
}
// 這個月要用哪一種：補登、系統、還沒到（空白）
const monthMode = (y, m) => m <= manualUntil(y) ? 'manual' : ymNum(y, m) > CYM ? 'future' : 'sys';
function annual(y) {
  const months = Array.from({ length: 12 }, (_, i) => { const mode = monthMode(y, i + 1); return { mode, d: mode === 'manual' ? manualMonth(y, i + 1) : mode === 'sys' ? sysMonth(y, i + 1) : null } });
  const vals = k => months.map(x => x.d ? x.d[k] : null);
  const sum = a => a.reduce((t, v) => t + (v || 0), 0);
  const subs = []; months.forEach(x => x.d && Object.keys(x.d.sub).forEach(l => { if (!subs.includes(l)) subs.push(l) }));
  const inc = AN_INC.map(([k, t]) => ({ k, t, v: vals(k) }));
  const sub = subs.map(l => ({ k: 'sub', l, t: l, v: months.map(x => x.d ? (x.d.sub[l] ?? null) : null) }));
  const other = vals('other'); if (sum(other)) sub.push({ k: 'other', t: '其他收入', v: other });
  const groups = AN_GROUPS.map(g => ({ ...g, rows: g.rows.map(([k, t]) => ({ k, t, v: vals(k) })) }));
  const wb = [{ k: 'wbHR', t: '人事', b: +N.wbPersonBudget || 0, v: vals('wbHR') }, { k: 'wbBiz', t: '業務', b: +N.wbBizTotal || 0, v: vals('wbBiz') }];
  const adm = { k: 'adm', t: `${y}年度\n行管費`, b: +N.admBudget || 0, v: vals('adm') };
  const incRows = [...inc, ...sub], expRows = [...groups.flatMap(g => g.rows), ...wb, adm];
  const loss = months.map((x, i) => x.d ? sum(incRows.map(r => r.v[i])) - sum(expRows.map(r => r.v[i])) : null);
  for (const r of [...incRows, ...expRows]) r.total = sum(r.v);
  for (const r of [...wb, adm]) { r.left = r.b - r.total; r.pct = r.b ? r.total / r.b : 0 }
  const incTotal = sum(incRows.map(r => r.total)), opTotal = sum(groups.flatMap(g => g.rows).map(r => r.total));
  const expBudget = opTotal + sum([...wb, adm].map(r => r.b));     // 範本「支出(含補助)」：委辦和行管費用預算全額計
  const cusNames = []; months.forEach(x => x.d && Object.keys(x.d.cus || {}).forEach(l => { if (!cusNames.includes(l)) cusNames.push(l) }));
  const cus = cusNames.map(l => { const v = months.map(x => x.d ? (x.d.cus || {})[l] ?? null : null); return { t: l, v, total: sum(v) } });
  return { y, months, cus, inc, sub, groups, wb, adm, incRows, expRows, loss, lossTotal: sum(loss), incTotal, expTotal: sum(expRows.map(r => r.total)), expBudget, opTotal };
}
function wbPersonUsed() { const A = annual(CY); return (manualUntil(CY) ? 0 : +N.wbPersonUsedBefore || 0) + A.wb[0].total; }
function wbUsed(cat) {
  let u = +(N.usedBefore || {})[cat] || 0; const mu = manualUntil(CY);
  for (const v of vouchers()) if (v.y === CY && v.m > mu && v.src === '委辦費-業務費' && v.cat === cat) u += v.amount;
  if (cat === N.firstItem) for (const d of yearMonths()) if (d.m > mu && d.payroll) u += +(d.supervisor ?? N.supervisor) || 0;
  return u;
}
// 委辦業務費總共用了多少：有補登時用年度報表的數字（補登＋系統），沒有補登時用各細項加總（含啟用前已用）
const wbBizUsed = () => manualUntil(CY) ? annual(CY).wb[1].total : wbItems().reduce((a, k) => a + wbUsed(k), 0);
function monthExpense(y, m) { const A = annual(y); return A.expRows.reduce((t, r) => t + (r.v[m - 1] || 0), 0); }
const monthIncome = (y, m) => { const A = annual(y); return A.incRows.reduce((t, r) => t + (r.v[m - 1] || 0), 0); };
function getAlerts() {
  const a = [];
  if (needAllBk()) a.push({ go: 'bkall', t: `月底備份：請下載四間公托的每月報表和備份，存到電腦或雲端硬碟，萬一系統出問題資料還在。` });
  if (+N.wbPersonBudget > 0) {
    const remain = N.wbPersonBudget - wbPersonUsed();
    const cur = payrollRows(CY, CM).filter(r => r.src === '委辦費-人事費').reduce((x, r) => x + (+r.amount || 0), 0);
    if (cur > 0 && remain < cur) a.push({ go: 'staff', t: `委辦人事費剩 ${fmt(remain)} 元，不夠支付本月薪資約 ${fmt(cur)} 元，這個月要拆單。` });
  }
  const low = wbItems().filter(k => { const b = +(N.budget || {})[k] || 0, r = b - wbUsed(k); return b > 0 && r !== 0 && r < b * .1; });
  if (low.length) a.push({ go: 'report', t: `委辦業務費有 ${low.length} 項快用完或超支：${low.join('、')}。請在核銷前決定要從哪一項挪用。` });
  return a;
}

/* ===== 提示 ===== */
let toastT, UNDO = null;
// 存檔後的提示：沒有網路時講清楚只存在本機，還沒上傳
const OFFLINE_OK = /^(已(儲存|刪除|復原|救回|新增|設定|結算|取消|標記|印)|收據已印好)/;
function toast(msg, undo) {
  const t = $('#toast'); UNDO = undo || null;
  if (!navigator.onLine && !DEMO && OFFLINE_OK.test(msg)) msg = msg.replace(/[。]?$/, '') + '。目前離線，已先存在本機，連線後會自動上傳。';
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="undo" id="undoBtn">復原</button>' : ''}`;
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; UNDO = null }, undo ? 6000 : msg.length > 30 ? 5000 : 2800);
}
const fail = msg => e => { console.error(e); toast(e && e.code === 'offline' ? '這個動作需要網路，請連上網路後再試一次。' : (msg || '沒有存到，請再按一次。')); };
let netState = { pending: 0 };
function renderNet() {
  const b = $('#netBar'); let t = '';
  if (netState.readError) t = netState.readError.includes('resource-exhausted') ? '今天的使用量已滿，明天會恢復。這不代表沒有資料，請明天再開，並告訴管理者。' : netState.readError.includes('permission') ? '資料讀取失敗，這個序號可能沒有使用權限，請通知管理者。' : '現在讀不到資料，可能是網路不穩。這不代表沒有資料，請晚點再開。';
  else if (!navigator.onLine) t = netState.pending ? '現在沒有網路，剛才的動作還沒存好。連上網路後會自動補存，在那之前請不要關掉 App。' : '現在沒有網路，畫面可能不是最新的。';
  else if (netState.writeError) t = '有一筆資料沒有存成功，請重新整理後確認。';
  b.textContent = t; b.hidden = !t;
}

/* ===== 啟動與登入 ===== */
async function boot() {
  if (/Line\//i.test(navigator.userAgent)) $('#lineHint').hidden = false;
  const demo = new URLSearchParams(location.search).has('demo') || sessionStorage.getItem('gongtuo.demo') === '1';
  await startStore(demo);
  if ('serviceWorker' in navigator && !DEMO_ONLY) navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) $('#updateBtn').hidden = false; }); });
  }).catch(() => { });
}
const DEMO_ONLY = location.protocol === 'file:';
async function startStore(demo) {
  DEMO = demo;
  try { store = demo ? createDemoStore(() => sampleData({ CY, CM })) : await createFirebaseStore({ year: CY, ym: CYM }); }
  catch (e) { console.error(e); $('#bootMsg').textContent = '無法連線到資料庫，請確認網路後重新開啟。如果一直這樣，請告訴管理者。'; return; }
  store.onStatus(s => { const had = netState.readError; Object.assign(netState, s); renderNet(); if (s.readError && !had) render(); });
  store.onData(() => onData());
  store.onAuth(info => {
    $('#boot').hidden = true;
    if (!info) { showLogin(); return; }
    if (info.error) { showLogin(info.error === 'nomember' ? '這個序號還沒有設定是哪一間公托，請通知管理者。' : '登入後讀取資料失敗，請確認網路後再試一次。'); return; }
    NID = info.nid; firstData = true; ADMIN = !!info.admin;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#demoBar').hidden = !DEMO;
    renderAdminBar();
    refreshN(); go('home');
  });
}
// 管理者：上方固定顯示目前在哪一間，可以切換
let ADMIN = false;
function renderAdminBar() {
  const b = $('#adminBar'); b.hidden = !ADMIN; if (!ADMIN) return;
  b.innerHTML = `<label class="check" style="flex-wrap:wrap;font-weight:700">管理者模式：目前在
    <select id="adminNid" style="width:auto;min-height:40px">${Object.entries(NURSERIES).map(([k, v]) => `<option value="${k}" ${k === NID ? 'selected' : ''}>${v.short}公托</option>`).join('')}</select>
    <span style="font-weight:400">修改會直接存到這一間。</span></label>`;
}
document.addEventListener('change', e => {
  if (e.target.id !== 'adminNid') return;
  const n = e.target.value; ls.set('gongtuo.adminNid', n);
  NID = n; firstData = true; sel.clear();
  store.switchNursery(n); refreshN(); renderAdminBar(); go('home');
  toast(`已切換到${NURSERIES[n].short}公托。`);
});
function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false; $('#mergebar').hidden = true;
  const e = $('#loginErr'); e.textContent = msg || ''; e.hidden = !msg;
}
$('#fLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginGo'), err = $('#loginErr');
  err.hidden = true; btn.setAttribute('aria-disabled', 'true'); btn.textContent = '登入中…';
  try { await store.login($('#serial').value); }
  catch (x) {
    const c = x.code || '';
    err.textContent = c === 'format' ? '序號是英文字母和數字，例如 7K3P-92QX，請再確認一次。'
      : c.includes('too-many') ? '嘗試太多次，請過幾分鐘再試。'
      : c.includes('network') ? '現在沒有網路，請連上網路後再登入。'
      : '序號不正確，請再確認一次。';
    err.hidden = false;
  }
  btn.removeAttribute('aria-disabled'); btn.textContent = '登入';
});
$('#tryDemo').onclick = () => { sessionStorage.setItem('gongtuo.demo', '1'); location.reload(); };
async function leaveDemo() { sessionStorage.removeItem('gongtuo.demo'); location.href = location.pathname; }

let firstData = true;
function onData() {
  if (!NID) return;
  const st = S();
  if (st.loaded.settings && !st.settings && !DEMO) { store.setSettings({ ...DEFAULTS, ...NURSERIES[NID], createdAt: Date.now() }).catch(fail()); return; }
  if (st.settings && !DEMO && (st.settings.rev || 1) < SETTINGS_REV) { const p = upgradeSettings(st.settings); if (p) store.setSettings(p).catch(() => { }); }
  refreshN();
  if (firstData && st.loaded.invoices && st.loaded.vouchers && st.settings) {
    firstData = false; purgeTrash(); maybeAlert();
  }
  render();
}
// 改版時補上新的預設：只改還是舊預設值的欄位，自己改過的不動
function upgradeSettings(cur, nid = NID) {
  const NID = nid, p = { rev: SETTINGS_REV }, F = '計畫督導津貼', OLDF = '計畫主持費';
  if (NID === 'gongzheng' && (cur.reserved ?? 9) === 9) p.reserved = 11;
  if (NID === 'shoutian' && cur.assoc === '高雄市岡山區壽天公共托嬰中心') p.assoc = '中華頭心手希望教育協會';
  // rev 4：01 號四間都叫計畫督導津貼。之前改成計畫主持費的改回來（類別、預算、已用金額一起）
  let cs = Array.isArray(cur.cats) ? cur.cats : null;
  const ren = o => (o && o[OLDF] != null && o[F] == null) ? (r => { r[F] = o[OLDF]; delete r[OLDF]; return r })({ ...o }) : null;
  if (cur.firstItem === OLDF) p.firstItem = F;
  if (cs && cs.some(g => g.items.includes(OLDF))) { cs = cs.map(g => ({ ...g, items: g.items.map(x => x === OLDF ? F : x).filter((x, i, a) => a.indexOf(x) === i) })); p.cats = cs }
  const b = ren(cur.budget), u = ren(cur.usedBefore); if (b) p.budget = b; if (u) p.usedBefore = u;
  // rev 3：萬丹以外的委辦業務費細項改成 6 項。還是舊預設（沒改過）的才換；已經填了預算或已用金額的細項保留
  if (NID !== 'wandan' && (cur.rev || 1) < 3) {
    const g0 = cs && cs.find(g => g.src === '委辦費-業務費');
    const same = (a, c) => a.length === c.length && a.every(x => c.includes(x));
    if (g0 && same(g0.items, DEFAULT_CATS[0].items)) {
      const bb = b || cur.budget || {}, uu = u || cur.usedBefore || {};
      const keep = g0.items.filter(x => !OTHER_WB.includes(x) && (+bb[x] || +uu[x]));
      p.cats = cs.map(g => g === g0 ? { ...g, items: [...OTHER_WB, ...keep] } : g);
    }
  }
  return p;
}
function purgeTrash() {
  const limit = Date.now() - 30 * 864e5, ops = [];
  for (const x of S().invoices) if (x.deleted && x.deletedAt < limit) ops.push({ c: 'invoices', id: x.id, remove: true });
  for (const v of S().vouchers) if (v.deleted && v.deletedAt < limit) ops.push({ c: 'vouchers', id: v.id, remove: true });
  if (ops.length) store.batch(ops).catch(() => { });
}
function maybeAlert(force) {
  const a = getAlerts(); if (!a.length) return;
  const ack = ls.get('gongtuo.ack.' + NID);
  const twentieth = `${NOW.getFullYear()}-${String(CM).padStart(2, '0')}-20`;
  if (!force && ack && !(CD >= 20 && ack < twentieth)) return;
  $('#alertList').innerHTML = a.map(x => `<li>${esc(x.t)}</li>`).join('');
  $('#alertOk').checked = false; $('#alertGo').setAttribute('aria-disabled', 'true');
  if (!$('#dlgAlert').open) $('#dlgAlert').showModal();
}

/* ===== 頁面 ===== */
const NAMES = { home: '本月', inv: '發票', fee: '月費與收據', report: '報表', vou: '憑證與列印', cash: '零用金結算', staff: '人事費', trash: '垃圾桶', set: '設定', help: '說明' };
const IN_MORE = ['vou', 'cash', 'staff', 'trash', 'set', 'help'];
let view = 'home', sel = new Set(), invFilter = 'all', cashTab = 'list';
const SEL_M = { vou: { y: CY, m: CM }, fee: { y: CY, m: CM }, staff: { y: CY, m: CM }, food: { y: CY, m: CM } };
// 設定、人事費改到一半就要離開時，先問一下
function leaveGuard(next) {
  if (!(dirty && (view === 'set' || view === 'staff'))) return next();
  ask('還沒儲存', `<p class="hint">這一頁有修改還沒按「儲存」，離開的話這些修改不會留下來。</p>`, () => { dirty = false; setTimeout(next, 0) }, '不儲存，離開', 'btn danger');
}
function go(v, force) {
  if (!force && v !== view && dirty && (view === 'set' || view === 'staff')) return leaveGuard(() => go(v, true));
  dirty = false; if (v !== view) FP = null;
  document.querySelectorAll('dialog[open]').forEach(d => { if (d.id !== 'dlgAlert') d.close() });
  view = v; $('#app').dataset.view = v; $('#pageName').textContent = NAMES[v]; $('#helpQ').hidden = v === 'help';
  document.querySelectorAll('.tab[data-view]').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') });
  $('#moreBtn').toggleAttribute('data-on', IN_MORE.includes(v));
  if (v !== 'inv') sel.clear();
  closeMore(); render(); window.scrollTo(0, 0);
}
function render() {
  if (!NID || $('#app').hidden) return;
  $('#brandName').innerHTML = `${esc(N.short)}公托經費${DEMO ? '<span class="demo-tag">範例</span>' : ''}`;
  $('#today').textContent = `民國 ${CY} 年 ${CM} 月`;
  $('#headExtra').innerHTML = '';
  ({ home, inv: invView, fee, report, vou, cash, staff, trash, set, help })[view]();
  // 讀不到資料時，空白的地方不能寫成「沒有資料」
  if (netState.readError && view !== 'set' && view !== 'help') {
    $('#view').insertAdjacentHTML('afterbegin', '<div class="status" role="alert" style="font-weight:700">資料讀取失敗，下面的數字和清單可能不完整，不代表資料不見了。請確認網路後重新整理。</div>');
    document.querySelectorAll('#view .empty').forEach(e => e.textContent = '讀取失敗，這裡暫時看不到資料。');
  }
  updateMerge(); renderAlerts(); renderNet();
  $('#add').hidden = innerWidth < 1000 && !(view === 'home' || view === 'inv');
}
function renderAlerts() {
  const a = getAlerts(), b = $('#alertBar'); b.hidden = !a.length;
  b.innerHTML = `<b>重要提醒（${a.length}）</b>` + a.map(x => `<button type="button" data-go="${x.go}"><span>${esc(x.t)}</span><span aria-hidden="true">›</span></button>`).join('');
}
function monthNav(key) {
  const s = SEL_M[key];
  return `<div class="monthnav"><button type="button" class="btn" data-mnav="${key}" data-d="-1" aria-label="上個月">‹</button><b>${s.y} 年 ${s.m} 月</b><button type="button" class="btn" data-mnav="${key}" data-d="1" aria-label="下個月">›</button>${s.y !== CY || s.m !== CM ? `<button type="button" class="btn" data-mnav="${key}" data-d="0">回到本月</button>` : ''}</div>`;
}
function bar(name, used, budget) {
  const p = pct(used, budget), cls = p >= 95 ? 'bad' : p >= 85 ? 'warn' : '';
  if (!budget) return `<div><span class="title">${name}</span><div class="meta">還沒輸入今年預算，請到「設定 → 委辦費預算」填寫。</div></div>`;
  return `<div><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="title">${name}</span><span class="meta" style="margin:0">已用 <b class="${cls ? 'when-' + cls : ''}">${p}%</b>・剩 ${fmt(budget - used)} 元</span></div><div class="kpibar ${cls}"><i style="width:${Math.min(p, 100)}%"></i></div></div>`;
}

function home() {
  const open = openInv(), po = pettyOpen(), unp = unprintedAll();
  const todo = [];
  const needSetup = [];
  if (!N.director) needSetup.push('主任姓名');
  if (!N.pi) needSetup.push('計畫主持人');
  if (!(N.staff || []).length) needSetup.push('員工名單');
  if (!+N.wbBizTotal) needSetup.push('委辦費預算');
  if (!activeKids().length) needSetup.push('幼兒名單（在「月費」新增）');
  if (open.length) todo.push({ go: 'inv', t: `${open.length} 張發票還沒做憑證`, m: '到「發票」勾選同一類別，合併成憑證' });
  if (unp.length) todo.push({ go: 'vou', t: `${unp.length} 張憑證還沒印`, m: `委辦費 ${unp.filter(isWB).length} 張用一般紙，其他 ${unp.filter(v => !isWB(v)).length} 張用色紙` });
  if (po.length) { const t = po.reduce((a, x) => a + amt(x), 0); todo.push({ go: 'cash', t: `零用金有 ${po.length} 張發票還沒結算`, m: `合計 ${fmt(t)} 元，餘額 ${fmt(N.petty - t)} 元` }); }
  if (activeKids().length && !monthDoc(CY, CM).rcptPrinted) { const r = receiptDate(CY, CM); todo.push({ go: 'fee', t: `本月收據還沒印（${activeKids().length} 位）`, m: `收據日期 ${r.m}/${r.d}` }); }
  { const xl = monthXR(monthDoc(CY, CM)), due = Object.entries(XR_TYPES).filter(([k, T]) => T.months.includes(CM) && !xl.some(r => r.type === k && r.printed)).map(([, T]) => T.t); if (due.length) todo.push({ go: 'fee', t: `本月要開請款收據：${due.join('、')}`, m: '到「月費」頁下方的「請款收據」填寫並列印' }); }
  $('#view').innerHTML = `
  ${needSetup.length ? `<button type="button" class="card setupcard linkrow" data-go="set" style="text-align:left"><div class="title">第一次使用，請先完成設定</div><div class="meta">還沒填：${needSetup.map(esc).join('、')}</div></button>` : ''}
  <section><h2>要做的事<small>${todo.length} 件</small></h2>
   ${todo.length ? `<div class="list todo">${todo.map(t => `<button type="button" class="row linkrow" data-go="${t.go}"><div class="main"><div class="title">${esc(t.t)}</div><div class="meta">${esc(t.m)}</div></div><span class="go" aria-hidden="true">›</span></button>`).join('')}</div>` : '<div class="empty">目前沒有要處理的事。</div>'}
  </section>
  <div class="card" style="flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px 12px">
   <div class="main"><div class="title">新增發票的方式：${MODE === 'step' ? '一步一步模式' : '一般模式'}</div><div class="meta">${MODE === 'step' ? '一次問一件事，每一步只按一個按鈕。' : '一個畫面填完所有欄位。'}只影響這台裝置。</div></div>
   <button type="button" class="edit" data-mode="${MODE === 'step' ? 'normal' : 'step'}">${MODE === 'step' ? '改成一般模式' : '改成一步一步'}</button>
  </div>`;
}
function rowInv(x, withTick) {
  const payer = x.payer === '主任' ? '<span class="pill p-dir">主任代墊</span>' : `<span class="pill p-vendor">${esc(x.payer)}</span>`;
  const tick = withTick && !x.voucher ? `<button type="button" class="tick" role="checkbox" aria-checked="${sel.has(x.id)}" data-sel="${x.id}" aria-label="選取 ${esc(x.desc)}"><i>✓</i>選取</button>` : '';
  const locked = x.voucher || x.settled;
  return `<div class="row">${tick}<div class="main"><div class="title">${esc(x.cat)}${x.cat === '幼兒食材' ? '' : '：' + esc(x.desc)}${x.food ? `<span class="meta" style="display:inline;margin-left:6px">（${esc(x.food)}）</span>` : ''}</div>
   <div class="meta">${payer}${pill(x.src)}<span>${x.y !== CY ? x.y + '/' : ''}${x.m}/${x.d}</span>${x.qty > 1 ? `<span>${x.qty} × ${fmt(x.price)}</span>` : ''}${x.voucher ? `<span class="pill p-done">${esc(x.voucher)}</span>` : ''}${x.settled && !x.voucher ? '<span class="pill p-todo">已結算</span>' : ''}</div></div>
   <span class="amount">${fmt(amt(x))}</span>${!locked ? `<button type="button" class="edit" data-edit="${x.id}">修改</button>` : ''}</div>`;
}
function invView() {
  const flt = x => invFilter === 'all' || (invFilter === 'dir' ? x.payer === '主任' : x.payer !== '主任');
  const open = openInv().filter(flt).sort((a, b) => a.ym - b.ym || a.d - b.d);
  const done = invoices().filter(x => x.voucher && x.ym >= ymNum(shiftYM(CY, CM, -1).y, shiftYM(CY, CM, -1).m)).filter(flt).sort((a, b) => b.voucher.localeCompare(a.voucher));
  $('#headExtra').innerHTML = `<div class="chips" role="group" aria-label="篩選">${[['all', '全部'], ['dir', '主任代墊'], ['ven', '付給廠商']].map(([k, t]) => `<button type="button" class="chip" aria-pressed="${invFilter === k}" data-filter="${k}">${t}</button>`).join('')}</div>`;
  $('#view').innerHTML = `
  <p class="hint">勾選同一類別的發票，按下方「合併成憑證」，編號、受款人、用途說明和金額都會自動帶入。</p>
  <section><h2>還沒做憑證<small>${open.length} 張</small></h2>
   ${open.length ? `<div class="list">${open.map(x => rowInv(x, true)).join('')}</div>` : `<div class="empty">${S().loaded.invoices ? '目前沒有還沒做憑證的發票。按「＋ 新增發票」開始記帳。' : '正在載入發票…'}</div>`}</section>
  <section><h2>最近已做憑證<small>上個月起 ${done.length} 張；已做憑證或已結算的不能修改</small></h2>
   ${done.length ? `<div class="list">${done.map(x => rowInv(x)).join('')}</div>` : '<div class="empty">還沒有。</div>'}</section>`;
}
function updateMerge() {
  const mb = $('#mergebar');
  _updateMerge(mb);
  // 合併列出現時，頁面下方多留它的高度，最後一張發票才不會被蓋住
  $('#app').style.setProperty('--mb', mb.hidden ? '0px' : (mb.offsetHeight + 12) + 'px');
}
function _updateMerge(mb) {
  if (view !== 'inv' || !sel.size || $('#app').hidden) { mb.hidden = true; $('#add').style.visibility = ''; return }
  const list = [...sel].map(id => S().invoices.find(x => x.id === id)).filter(Boolean);
  if (!list.length) { sel.clear(); mb.hidden = true; return }
  const catsSet = new Set(list.map(x => x.cat)), payers = new Set(list.map(x => x.payer));
  const ok = catsSet.size === 1 && payers.size === 1;
  mb.innerHTML = `<div class="main"><div class="title">已選 ${list.length} 張・<span class="amount">${fmt(list.reduce((a, x) => a + amt(x), 0))}</span> 元</div>
   ${ok ? `<div class="meta">${esc(list[0].cat)}・${pill(list[0].src)}</div>` : `<div class="why">${catsSet.size > 1 ? '只有同一類別可以合併，請取消不同類別的發票。' : '付款對象不同，不能合在同一張憑證。'}</div>`}</div>
   <button type="button" class="btn" id="selClear">取消選取</button>
   <button type="button" class="btn primary" id="selMerge" ${ok ? '' : 'aria-disabled="true"'}>合併成憑證</button>`;
  mb.hidden = false;
  if (innerWidth < 1000) $('#add').style.visibility = 'hidden';
}
function fee() {
  const { y, m } = SEL_M.fee, kids = monthKids(y, m), d = monthDoc(y, m), fees = d.fees || {};
  const nos = receiptNos(y, m, kids), rd = receiptDate(y, m);
  const total = kids.reduce((a, k) => a + kidCalc(k, fees[k.id], y, m).total, 0);
  $('#headExtra').innerHTML = monthNav('fee');
  $('#view').innerHTML = `
  <div class="rdate"><label for="rDate">${m} 月收據日期</label><input type="date" id="rDate" value="${isoOf(rd)}" max="9999-12-31">${rd.set ? '<button type="button" class="btn" id="rDateReset">改回預設</button>' : ''}<span class="meta">收據上印「${rocDate(rd)}」。${rd.set ? '這是這個月自己選的日期。' : `預設每月 ${+N.rcptDay || 15} 號，遇週末順延，可以改成別天。`}</span></div>
  <div class="tally"><span>應收<b>${fmt(total)}</b></span><span>收據號碼<b style="font-size:18px">${kids.length ? rcptNo(Math.min(...nos)) + '–' + rcptNo(Math.max(...nos)) : '—'}</b></span><span class="${d.rcptPrinted ? '' : 'warn'}">收據<b style="font-size:18px">${d.rcptPrinted ? '已印' : '還沒印'}</b></span></div>
  <div class="actions start"><button type="button" class="btn primary" id="printRcptAll" ${kids.length ? '' : 'aria-disabled="true"'}>列印收據</button><button type="button" class="btn" id="addKid">＋ 新增幼兒</button><button type="button" class="btn" id="fpStart" ${FP ? 'aria-pressed="true"' : ''}>勾選改日期</button><button type="button" class="btn" id="borrow">協會借用號碼</button></div>
  ${FP ? '<p class="status info">勾選要改日期的收據（月費、請款收據都可以），在下方選日期後按「套用日期」。</p>' : ''}
  <p class="hint">名單沿用上個月，月費和餐點費依上課天數和生日自動算。有延托、保險、退費的孩子，按「修改」再填。${d.rcptPrinted ? '印過的號碼不會再變；之後新增的孩子會用新的號碼。' : '收據號碼在列印時確定，印之前可能會變。'}</p>
  ${earlierUnprinted(y, m) ? `<p class="status">${earlierUnprinted(y, m)} 月的收據還沒印。先印這個月的話，${earlierUnprinted(y, m)} 月的號碼會排在這個月後面。</p>` : ''}
  ${kids.length ? `<div class="list">${kids.map((k, i) => {
    const f = fees[k.id] || {}, c = kidCalc(k, f, y, m), ex = [];
    if (f.days !== '' && f.days != null) ex.push(`上課 ${f.days} 天`);
    ex.push(`月費 ${fmt(c.fee)}`); ex.push(c.meal ? `餐點費 ${fmt(c.meal)}` : '未滿 6 個月不收餐點費');
    if (+f.late) ex.push(`延托 ${fmt(f.late)}`); if (+f.ins) ex.push(`保險 ${fmt(f.ins)}`);
    const own = (d.kidDates || {})[k.id] && kidRcptDate(y, m, k.id);
    return `<div class="row">${fpTick('k:' + k.id, k.name)}<div class="main"><div class="title">${k.seat}. ${esc(k.name)}${k.active === false ? ' <span class="pill p-todo">已離開</span>' : ''}</div><div class="meta"><span>收據 ${rcptNo(nos[i])}</span>${own ? `<span class="when-warn">日期 ${md(own)}</span>` : ''}${ex.map(e => `<span>${e}</span>`).join('')}${+f.refund ? `<span class="when-bad">退費 ${fmt(f.refund)}</span>` : ''}</div></div><span class="amount">${fmt(c.total)}</span><button type="button" class="edit" data-kid="${k.id}">修改</button></div>`
  }).join('')}</div>` : `<div class="empty">${ymNum(y, m) >= CYM ? '還沒有幼兒名單。按「＋ 新增幼兒」，輸入座號、姓名和生日。' : '這個月沒有月費紀錄。'}</div>`}
  ${xrSection(y, m, d)}
  <section><h2>備註<small>自動編號，列在月費表下方</small></h2>
   <div class="list">${monthNotes(d).map((n, i) => { const k = S().kids.find(x => x.id === n.kid); return `<div class="row"><div class="main"><div class="title">${i + 1}. ${esc(k ? k.name : '')} ${esc(n.text)}</div></div><button type="button" class="edit" data-delnote="${esc(n.key)}">刪除</button></div>` }).join('') || '<div class="row"><div class="main meta">還沒有備註。</div></div>'}</div>
  </section>
  ${rcptSkip(y).length ? `<p class="hint">${y} 年已標記協會借用：${rcptSkip(y).slice(-10).map(rcptNo).join('、')} 號，收據會跳過這些號碼。</p>` : ''}
  ${FP ? `<div style="height:150px"></div><div class="mergebar" id="fpBar"><div class="main"><div class="title" id="fpCount">已選 ${FP.size} 張</div></div>
    <label class="fpdate">日期<input type="date" id="fpDate" value="${FPD || isoOf(rd)}" max="9999-12-31"></label>
    <button type="button" class="btn" id="fpAll">全選月費</button><button type="button" class="btn" id="fpCancel">取消</button>
    <button type="button" class="btn primary" id="fpApply" aria-disabled="${!FP.size}">套用日期</button></div>` : ''}`;
}
// 勾選改日期：FP 是勾選的收據（k:幼兒 id、x:請款收據 id），FPD 是選的日期
let FP = null, FPD = '';
const fpTick = (id, name) => FP ? `<button type="button" class="tick" role="checkbox" aria-checked="${FP.has(id)}" data-fpick="${esc(id)}" aria-label="選取 ${esc(name)}"><i>✓</i>選取</button>` : '';
function fpSync() { $('#fpCount').textContent = `已選 ${FP.size} 張`; $('#fpApply').setAttribute('aria-disabled', String(!FP.size)); document.querySelectorAll('[data-fpick]').forEach(b => b.setAttribute('aria-checked', FP.has(b.dataset.fpick))) }
function fpApply() {
  const { y, m } = SEL_M.fee, iso = $('#fpDate').value, r = fromISO(iso), d = monthDoc(y, m);
  if (!r) return toast('請選日期。'); if (!FP.size) return toast('請先勾選收據。');
  const kidDates = {}, xr = {}; let printed = 0;
  for (const id of FP) {
    const [t, k] = [id.slice(0, 1), id.slice(2)];
    if (t === 'k') { kidDates[k] = iso === isoOf(receiptDate(y, m)) ? null : iso; if (d.rcptPrinted) printed++ }
    else { const x = (d.xr || {})[k]; if (!x) continue; xr[k] = { date: iso === isoOf(xrDefDate(y, m, x.type)) ? '' : iso }; if (x.printed) printed++ }
  }
  const patch = { y, m }; if (Object.keys(kidDates).length) patch.kidDates = kidDates; if (Object.keys(xr).length) patch.xr = xr;
  store.set('months', ymKey(y, m), patch).catch(fail());
  const n = FP.size; FP = null; FPD = '';
  toast(`已把 ${n} 張收據的日期改成 ${r.y}/${r.m}/${r.d}。${printed ? `其中 ${printed} 張已經印過，要重印才會換成新日期。` : ''}`);
  render();
}
// 請款收據區：這個月固定要開的（優化比、契約價金）先列出來，按「填寫」建立；另外可以加其他收據
function xrSection(y, m, d) {
  const list = monthXR(d), due = Object.entries(XR_TYPES).filter(([k, T]) => T.months.includes(m) && !list.some(r => r.type === k));
  const rows = [
    ...due.map(([k, T]) => `<div class="row"><div class="main"><div class="title">${T.t}收據</div><div class="meta"><span>繳款人 ${esc(T.payer())}</span><span class="when-warn">還沒填金額</span></div></div><button type="button" class="edit" data-xrnew="${k}">填寫</button></div>`),
    ...list.map(r => `<div class="row">${fpTick('x:' + r.id, r.desc)}<div class="main"><div class="title">${esc(r.desc || XR_TYPES[r.type]?.t || '收據')}</div><div class="meta"><span>${r.no ? '收據 ' + rcptNo(r.no) : '號碼在列印時確定'}</span><span>日期 ${md(xrDate(y, m, r))}</span><span>繳款人 ${esc(r.payer)}</span>${r.memo ? '' : '<span class="when-warn">摘要空白</span>'}${r.printed ? '<span>已印</span>' : '<span class="when-warn">還沒印</span>'}</div></div><span class="amount">${fmt(r.amount)}</span><button type="button" class="edit" data-xr="${r.id}">修改</button><button type="button" class="edit" data-xrprint="${r.id}">列印</button></div>`),
  ];
  return `<section><h2>請款收據<small>1、4、7、10 月優化比；1、2、7、10 月契約價金</small></h2>
   <div class="list">${rows.join('') || '<div class="row"><div class="main meta">這個月沒有固定要開的請款收據。</div></div>'}</div>
   <div class="actions start"><button type="button" class="btn" data-xrnew="other">＋ 其他收據</button></div></section>`;
}
function openXR(y, m, type, id) {
  const d = monthDoc(y, m), r = id ? (d.xr || {})[id] : null, T = XR_TYPES[r ? r.type : type] || XR_TYPES.other, rd = receiptDate(y, m);
  const v = r || { type, payer: T.payer(), desc: T.desc(y, m), memo: T.memo(y, m), amount: xrDefaultAmount(type, y, m) };
  ask(`${r ? '修改' : '新增'}${T.t}收據（${y} 年 ${m} 月）`, `
   <label>繳款人<input type="text" id="xrPayer" value="${esc(v.payer)}"></label>
   <label>名稱（列在月費頁，不印在收據上）<input type="text" id="xrDesc" value="${esc(v.desc)}" placeholder="例如：${y}年第一期優化比補助款"></label>
   <label>摘要（印在收據中間）<textarea id="xrMemo" rows="3" placeholder="協會提供的文字貼在這裡">${esc(v.memo || '')}</textarea></label>
   <div class="two"><label>金額（元）<input type="number" id="xrAmt" inputmode="numeric" value="${esc(v.amount)}"></label><label>收據日期<input type="date" id="xrDate" value="${isoOf(xrDate(y, m, v))}" max="9999-12-31"></label></div>
   <p class="hint" style="font-size:14px">${r && r.no ? `收據號碼 ${rcptNo(r.no)}，重印也是同一號。` : '收據號碼和月費收據共用，按「列印」時才確定。'}${type === 'other' && !r ? '' : '繳款人的預設可以到「設定 → 收據」改。'}</p>
   ${r ? `<div class="actions start"><button type="button" class="btn" data-xrdel="${id}">刪除這張收據</button></div>` : ''}`, () => {
    const amount = +$('#xrAmt').value, payer = $('#xrPayer').value.trim(), desc = $('#xrDesc').value.trim(), memo = $('#xrMemo').value.trim(), date = $('#xrDate').value;
    if (!payer || !desc) { toast('請填繳款人和名稱。'); return false }
    if (!(amount > 0)) { toast('請填金額。'); return false }
    const key = id || 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { ...(r || {}), type: r ? r.type : type, payer, desc, memo, amount, date: date && date !== isoOf(xrDefDate(y, m, r ? r.type : type)) ? date : '', at: r ? r.at || Date.now() : Date.now() };
    store.set('months', ymKey(y, m), { y, m, xr: { [key]: rec } }).catch(fail());
    toast(r ? '已儲存。' : `已新增，按「列印」就可以印。`);
  }, '儲存');
}
function printXR(y, m, id) {
  const d = monthDoc(y, m), r = (d.xr || {})[id]; if (!r) return;
  let no = r.no;
  if (!no) {          // 還沒印過：從「下一張收據」往後找沒用過、沒被協會借用的號碼
    const used = new Set(), skip = new Set(rcptSkip(y));
    for (const md of Object.values(S().months)) if (md.y === y) { Object.values(md.rcptNos || {}).forEach(n => used.add(n)); monthXR(md).forEach(x => x.no && used.add(x.no)); }
    no = rcptNext(y); while (used.has(no) || skip.has(no)) no++;
  }
  const date = xrDate(y, m, r);
  openPreview({
    title: `${r.desc}（收據 ${rcptNo(no)}）`, pages: [rcptPage({ no, y, date, payer: r.payer, desc: r.memo || '', total: +r.amount, third: '第三聯：繳款人留存聯' })], goText: '列印收據',
    onPrint: () => {
      store.set('months', ymKey(y, m), { y, m, xr: { [id]: { ...r, no, printed: true } } }).catch(fail());
      if (no + 1 > rcptNext(y)) store.setSettings({ receiptNextY: { [y]: no + 1 } }).catch(fail());
      toast(`收據 ${rcptNo(no)} 已印好。`);
    }
  });
}
// 月費備註：每則一個 key 分開存，兩台裝置同時新增不會互相蓋掉（舊資料的 notes 陣列照樣顯示）
function monthNotes(d) {
  const old = (d.notes || []).map((n, i) => ({ ...n, key: 'old' + i, at: 0 }));
  const map = Object.entries(d.noteMap || {}).filter(([, n]) => n).map(([key, n]) => ({ ...n, key }));
  return [...old, ...map].sort((a, b) => (a.at || 0) - (b.at || 0));
}
// 這個月之前（今年）有孩子但收據還沒印的月份
function earlierUnprinted(y, m) {
  for (const d of Object.values(S().months)) if (ymNum(d.y, d.m) < ymNum(y, m) && d.y === y && !d.rcptPrinted && Object.keys(d.fees || {}).length) return d.m;
  return 0;
}
function report() {
  const A = annual(CY), mu = manualUntil(CY);
  const wbB = +N.wbBizTotal || 0, wbU = wbBizUsed();
  const inc = S().incomes.filter(x => x.y === CY).sort((a, b) => a.m - b.m);
  $('#headExtra').innerHTML = `<div class="actions"><button type="button" class="btn" id="govReport">產出核銷報表</button></div>`;
  $('#view').innerHTML = `
  <div class="tally"><span>年收入<b>${fmt(A.incTotal)}</b></span><span>年支出<b>${fmt(A.expTotal)}</b></span><span class="${A.lossTotal < 0 ? 'bad' : ''}">年盈餘<b>${fmt(A.lossTotal)}</b></span></div>
  <section><h2>年度經費報表<small>民國 ${CY} 年，依憑證月份歸月</small></h2>
   <div class="actions start"><button type="button" class="btn primary" id="printYear">列印（A4 橫式）</button><button type="button" class="btn" id="exportYear">匯出 Excel</button></div>
   <div class="tablewrap anwrap">${annualHTML(A)}</div>
   <div class="card" style="gap:8px">
    <div class="title">系統啟用前的月份</div>
    <p class="hint" style="font-size:15px">${mu ? `1–${mu} 月用從 Excel 補登的數字，${mu + 1} 月起用系統裡的資料。` : '還沒補登。系統啟用前的月份，可以從原本的 Excel（每月報表）匯入。'}</p>
    <div class="actions start"><button type="button" class="btn" id="importYear">從 Excel 補登</button>${mu ? `<label class="check" style="font-weight:400">補登到<select id="muSel" style="width:auto;min-height:44px">${Array.from({ length: 13 }, (_, i) => `<option value="${i}" ${i === mu ? 'selected' : ''}>${i ? i + ' 月' : '不使用補登'}</option>`).join('')}</select></label>` : ''}</div>
   </div>
  </section>
  <section><h2>委辦費使用情形</h2><div class="card">${bar('委辦人事費', wbPersonUsed(), +N.wbPersonBudget || 0)}${bar('委辦業務費', wbU, wbB)}${+N.admBudget ? bar(`${CY}年度行管費`, A.adm.total, +N.admBudget) : ''}</div></section>
  <section><h2>撥款收入<small>優化比、提升托育品質、縣府補助款，到帳那個月輸入</small></h2>
   <div class="list">${inc.map(x => `<div class="row"><div class="main"><div class="title">${x.m} 月・${esc(x.source === '縣府補助款' && x.label ? x.label : x.source)}</div>${x.note ? `<div class="meta">${esc(x.note)}</div>` : ''}</div><span class="amount">${fmt(x.amount)}</span><button type="button" class="edit" data-delincome="${x.id}">刪除</button></div>`).join('') || `<div class="row"><div class="main meta">${mu ? `${mu + 1} 月起還沒有撥款收入。` : '今年還沒有撥款收入。'}</div></div>`}</div>
   <div class="actions start"><button type="button" class="btn" id="addIncome">＋ 新增撥款收入</button></div>
  </section>
  <details class="card pickbox"><summary>委辦業務費細項（${wbItems().length} 項）</summary>
  ${mu ? `<p class="hint" style="font-size:14px">1–${mu} 月是補登的總數，沒有分細項；細項的「已用」要在「設定 → 委辦費預算 → 啟用前已用」填各項目 1–${mu} 月用掉的金額。</p>` : ''}
  <div class="tablewrap"><table><thead><tr><th>項目</th><th class="num">預算</th><th class="num">已用</th><th class="num">剩餘</th><th style="min-width:120px">使用率</th></tr></thead>
  <tbody>${wbItems().map(k => { const u = wbUsed(k), b = +(N.budget || {})[k] || 0, p = pct(u, b), cls = p >= 100 ? 'bad' : p >= 90 ? 'warn' : ''; return `<tr><td>${k}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(u)}</td><td class="num ${b - u < 0 ? 'neg' : ''}">${fmt(b - u)}</td><td><div class="kpibar ${cls}"><i style="width:${Math.min(p, 100)}%"></i></div><span class="meta" style="margin:0">${b ? p + '%' : '—'}</span></td></tr>` }).join('')}</tbody></table></div>
  <div class="actions start"><button type="button" class="btn" data-go="set">調整預算或挪用</button></div></details>`;
}
function vou() {
  const { y, m } = SEL_M.vou;
  const list = vouchersOf(y, m).sort((a, b) => a.no.localeCompare(b.no));
  const pr = printableOf(y, m), unp = pr.filter(v => !v.printed);
  const d = monthDoc(y, m), pay = d.payroll || [];
  $('#headExtra').innerHTML = monthNav('vou');
  $('#view').innerHTML = `
  <div class="tally"><span class="${unp.length ? 'warn' : ''}">還沒印<b>${unp.length}</b></span><span>一般紙／色紙<b>${unp.filter(isWB).length} / ${unp.filter(v => !isWB(v)).length}</b></span><span>下一個編號<b>${nextNo(y, m).slice(-2)}</b></span></div>
  <div class="actions start"><button type="button" class="btn primary" id="printV" ${pr.length ? '' : 'aria-disabled="true"'}>列印憑證</button><button type="button" class="btn" id="exportBiz">匯出業務費明細（Excel）</button></div>
  <p class="hint">還沒印的會先勾好；印過的要補印，再自己勾起來。一頁印一張，先印委辦費（一般紙），再印其他經費來源（色紙）。01 到 ${String(N.reserved).padStart(2, '0')} 保留給${esc(N.firstItem)}和薪資。</p>
  ${pay.length ? `<details class="card pickbox"><summary>人事費（01–${String(pay.length + 1).padStart(2, '0')}，清冊另外製作）</summary><div class="list">
    <div class="row"><div class="main"><div class="title"><span class="amount">${pre(y, m)}01</span>　${esc(N.firstItem)}</div><div class="meta">${pill('委辦費-業務費')}</div></div><span class="amount">${fmt(d.supervisor ?? N.supervisor)}</span></div>
    ${pay.map((r, i) => `<div class="row"><div class="main"><div class="title"><span class="amount">${pre(y, m)}${String(i + 2).padStart(2, '0')}</span>　${esc(r.name)} ${y}年${m}月薪資</div><div class="meta">${pill(r.src)}</div></div><span class="amount">${fmt(r.amount)}</span></div>`).join('')}</div></details>` : ''}
  ${list.length ? `<div class="list">${list.map(v => `<div class="row"><div class="main"><div class="title"><span class="amount">${esc(v.no)}</span>　${esc(v.desc)}</div>
    <div class="meta">${pill(v.src)}<span>受款人：${esc(v.payee)}</span>${v.kind === 'inv' ? `${v.printed ? `<span class="pill p-done">已印 ${esc(v.printedAt)}</span>` : '<span class="pill p-todo">還沒印</span>'}<span>${isWB(v) ? '一般紙' : '色紙'}</span>` : '<span>另外製作</span>'}${v.note ? '<span>有備註</span>' : ''}</div></div>
    <span class="amount">${fmt(v.amount)}</span>${v.kind === 'inv' ? `<button type="button" class="edit" data-printv="${esc(v.no)}">列印</button>` : ''}<button type="button" class="edit" data-cancelv="${esc(v.no)}">取消</button></div>`).join('')}</div>` : '<div class="empty">這個月還沒有憑證。到「發票」勾選發票，就能合併成憑證。</div>'}`;
}
function cash() {
  const po = sortPetty(pettyOpen()), pt = po.reduce((a, x) => a + amt(x), 0);
  $('#headExtra').innerHTML = `<div class="chips" role="group" aria-label="切換">${[['list', '代墊結報清單'], ['food', '食材費統計']].map(([k, t]) => `<button type="button" class="chip" aria-pressed="${cashTab === k}" data-cash="${k}">${t}</button>`).join('')}</div>`;
  if (cashTab === 'food') {
    const { y, m } = SEL_M.food;
    const f = invoices().filter(x => x.cat === '幼兒食材' && x.y === y && x.m === m).sort((a, b) => a.d - b.d);
    $('#view').innerHTML = `${monthNav('food')}<p class="hint">新增發票時選「幼兒食材」並填寫買了哪些食材，就會自動列在這裡（依發票日期，可看最近三個月）。</p>
    <div class="list">${f.map(x => `<div class="row"><div class="main"><div class="title">${x.m}/${x.d} 幼兒食材</div><div class="meta">${esc(x.food)}</div></div><span class="amount">${fmt(amt(x))}</span></div>`).join('') || '<div class="row"><div class="main meta">這個月沒有食材發票。</div></div>'}
    <div class="row"><div class="main"><div class="title">合計</div></div><span class="amount">${fmt(f.reduce((a, x) => a + amt(x), 0))}</span></div></div>
    <div class="actions start"><button type="button" class="btn" id="printFood" ${f.length ? '' : 'aria-disabled="true"'}>列印食材費統計</button></div>`;
    return;
  }
  const done = S().settlements.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  $('#view').innerHTML = `
  <div class="tally"><span>本期合計<b>${fmt(pt)}</b></span><span>代墊金<b>${fmt(N.petty)}</b></span><span class="${N.petty - pt < 5000 ? 'bad' : ''}">餘額<b>${fmt(N.petty - pt)}</b></span></div>
  <section><h2>本期<small>${po.length} 張，只列主任代墊的發票</small></h2>
  <p class="hint">照憑證編號排列，會計可以拿著憑證依序對帳；還沒做憑證的排在最後。</p>
  ${po.length ? `<div class="list">${po.map(x => `<div class="row"><div class="main"><div class="title">${esc(x.cat)}${x.cat === '幼兒食材' ? '' : '：' + esc(x.desc)}</div><div class="meta"><span>${x.m}/${x.d}</span>${x.qty > 1 ? `<span>${x.qty} × ${fmt(x.price)}</span>` : ''}${x.voucher ? `<span class="pill p-done">${esc(x.voucher)}</span>` : '<span class="pill p-todo">還沒做憑證</span>'}</div></div><span class="amount">${fmt(amt(x))}</span></div>`).join('')}</div>
   <div class="actions start"><button type="button" class="btn primary" id="settle">結算到今天</button><button type="button" class="btn" id="printCash">預覽結報清單</button></div>` : '<div class="empty">本期還沒有主任代墊的發票。</div>'}
  </section>
  <section><h2>已結算</h2>
   ${done.length ? `<div class="list">${done.map(s => `<div class="row"><div class="main"><div class="title">${s.m} 月第 ${s.n} 次結算・${esc(s.date)}</div><div class="meta">${s.rows.length} 張發票</div></div><span class="amount">${fmt(s.total)}</span><button type="button" class="edit" data-printset="${s.id}">列印</button></div>`).join('')}</div>` : '<div class="empty">還沒有結算紀錄。</div>'}
  </section>`;
}
function staff() {
  const { y, m } = SEL_M.staff, d = monthDoc(y, m), rows = payrollRows(y, m), saved = !!d.payroll;
  const remain = (+N.wbPersonBudget || 0) - wbPersonUsed();
  const hr = vouchersOf(y, m).filter(v => v.kind === 'hr');
  $('#headExtra').innerHTML = monthNav('staff');
  $('#view').innerHTML = `
  <div class="card">${bar('委辦人事費', wbPersonUsed(), +N.wbPersonBudget || 0)}${N.wbPersonBudget && remain < rows.filter(r => r.src === '委辦費-人事費').reduce((a, r) => a + (+r.amount || 0), 0) ? `<p class="hint" style="font-size:15px">委辦人事費不夠這個月的薪資：選一位按「拆單」，填好委辦費付多少，其餘自動改由營運收入支應-人事費。</p>` : ''}</div>
  ${!(N.staff || []).length ? '<div class="empty">還沒有員工名單，請先到「設定 → 員工名單」填寫。</div>' : `
  <p class="hint">薪資清冊另外製作，這裡只輸入金額，改完按「儲存本月人事費」。編號前面都是 ${pre(y, m)}。${saved ? '' : '<b>這個月還沒儲存。</b>'}</p>
  <div class="list paylist">
   <div class="row"><div class="main"><div class="title"><span class="amount">01</span>　${esc(N.pi || '（請到設定填計畫主持人）')}</div><div class="meta">${esc(N.firstItem)}・${pill('委辦費-業務費')}</div></div>
    <label class="payamt">金額<input type="number" inputmode="numeric" id="supAmt" value="${d.supervisor ?? N.supervisor}"></label></div>
   ${rows.map((r, i) => `<div class="row"><div class="main"><div class="title"><span class="amount">${String(i + 2).padStart(2, '0')}</span>　${esc(r.name)}</div>
    <select data-psrc="${i}" aria-label="${esc(r.name)} 經費來源"><option ${r.src === '委辦費-人事費' ? 'selected' : ''}>委辦費-人事費</option><option ${r.src === '營運收入支應-人事費' ? 'selected' : ''}>營運收入支應-人事費</option></select></div>
    <label class="payamt">金額<input type="number" inputmode="numeric" value="${r.amount}" data-pamt="${i}"></label><button type="button" class="edit" data-split="${i}">拆單</button></div>`).join('')}
  </div>
  ${rows.length + 1 > N.reserved ? `<p class="err">員工人數超過保留的編號（${N.reserved} 個），請到設定調整。</p>` : ''}
  <div class="actions start"><button type="button" class="btn primary" id="savePay">儲存本月人事費</button></div>`}
  <section><h2>其他人事支出<small>編號自動接在這個月最新一號之後</small></h2>
   <div class="actions start"><button type="button" class="btn" data-hr="bday">＋ 生日禮金</button><button type="button" class="btn" data-hr="sub">＋ 代班薪資</button><button type="button" class="btn" data-hr="bonus">＋ 年終獎金</button></div>
   ${hr.length ? `<div class="list">${hr.map(v => `<div class="row"><div class="main"><div class="title"><span class="amount">${esc(v.no)}</span>　${esc(v.desc)}</div><div class="meta">${pill(v.src)}<span>${esc(v.payee)}</span></div></div><span class="amount">${fmt(v.amount)}</span><button type="button" class="edit" data-cancelv="${esc(v.no)}">取消</button></div>`).join('')}</div>` : ''}
  </section>`;
}
function trash() {
  const di = S().invoices.filter(x => x.deleted), dv = S().vouchers.filter(v => v.deleted);
  const left = t => Math.max(0, 30 - Math.floor((Date.now() - t) / 864e5));
  $('#view').innerHTML = `<p class="hint">刪除的發票和取消的憑證會在這裡放 30 天，任何一台裝置都能救回來；滿 30 天自動清除。</p>
  <section><h2>發票<small>${di.length} 張</small></h2>${di.length ? `<div class="list">${di.map(x => `<div class="row"><div class="main"><div class="title">${esc(x.cat)}：${esc(x.desc)}</div><div class="meta"><span>${x.m}/${x.d}</span><span>還剩 ${left(x.deletedAt)} 天</span></div></div><span class="amount">${fmt(amt(x))}</span><button type="button" class="edit" data-restorei="${x.id}">救回</button></div>`).join('')}</div>` : '<div class="empty">垃圾桶是空的。</div>'}</section>
  <section><h2>取消的憑證<small>${dv.length} 張</small></h2>${dv.length ? `<div class="list">${dv.map(v => `<div class="row"><div class="main"><div class="title">${esc(v.no)}　${esc(v.desc)}</div><div class="meta"><span>還剩 ${left(v.deletedAt)} 天</span></div></div><span class="amount">${fmt(v.amount)}</span><button type="button" class="edit" data-restorev="${esc(v.no)}">救回</button></div>`).join('')}</div>` : '<div class="empty">沒有取消的憑證。</div>'}</section>`;
}
function set() {
  const B = N.budget || {}, U = N.usedBefore || {};
  const bsum = wbItems().reduce((a, k) => a + (+B[k] || 0), 0);
  $('#view').innerHTML = `
  <section><h2>新增發票的方式<small>只影響這台裝置，兩種方式存下來的資料完全一樣</small></h2>
   <div class="bigopts">
    <button type="button" class="bigopt" data-mode="normal" aria-pressed="${MODE === 'normal'}"><span>一般模式<br><small>一個畫面填完所有欄位，熟悉的人比較快。</small></span><span aria-hidden="true">${MODE === 'normal' ? '✓' : ''}</span></button>
    <button type="button" class="bigopt" data-mode="step" aria-pressed="${MODE === 'step'}"><span>一步一步模式<br><small>一次問一件事，每一步只按一個按鈕，字也比較大。</small></span><span aria-hidden="true">${MODE === 'step' ? '✓' : ''}</span></button>
   </div></section>
  <div class="status info">${ADMIN ? `管理者模式：目前在${esc(N.short)}公托，可以在上方切換。` : `目前登入：${esc(N.short)}公托${DEMO ? '（範例資料）' : ''}。只看得到、改得到${esc(N.short)}的資料。`}</div>
  <details class="card pickbox" ${!N.director ? 'open' : ''}><summary>公托資料</summary>
   <div class="two"><label>簡稱<input type="text" id="sShort" value="${esc(N.short)}"></label><label>憑證代字<input type="text" id="sCode" value="${esc(N.code)}" maxlength="2"></label></div>
   <label>全名（收據抬頭）<input type="text" id="sFull" value="${esc(N.full)}"></label>
   <div class="two"><label>統一編號<input type="text" id="sTax" inputmode="numeric" value="${esc(N.tax)}"></label><label>目前主任（預設代墊人）<input type="text" id="sDir" value="${esc(N.director)}"></label></div>
   <div class="two"><label>保留給人事的編號<input type="number" id="sRes" inputmode="numeric" value="${N.reserved}"></label><label>每月代墊金（元）<input type="number" id="sPetty" inputmode="numeric" value="${N.petty}"></label></div>
   <div class="two"><label>計畫主持人（01 號受款人）<input type="text" id="sPI" value="${esc(N.pi || '')}"></label><label>01 號：${esc(N.firstItem)}（每月）<input type="number" id="sSup" inputmode="numeric" value="${N.supervisor}"></label></div>
   <label>粘存單抬頭（辦理協會）<input type="text" id="sAssoc" value="${esc(N.assoc)}"></label>
   <div class="actions start"><button type="button" class="btn primary" id="saveBasic">儲存公托資料</button></div>
  </details>
  <details class="card pickbox" ${!(N.staff || []).length ? 'open' : ''}><summary>員工名單（${(N.staff || []).length} 位）</summary>
   <label>一行一位，順序就是薪資憑證的編號順序（第一位是 02）<textarea id="sStaff" style="min-height:160px">${esc((N.staff || []).join('\n'))}</textarea></label>
   <div class="actions start"><button type="button" class="btn primary" id="saveStaff">儲存員工名單</button></div>
  </details>
  <details class="card pickbox"><summary>收據</summary>
   <div class="two"><label>${CY} 年下一張收據從幾號開始<input type="number" id="sRcpt" inputmode="numeric" value="${rcptNext(CY)}"></label><label>收據日期預設每月幾號<input type="number" id="sRDay" inputmode="numeric" min="1" max="31" value="${+N.rcptDay || 15}"></label></div>
   <p class="hint" style="font-size:14px">印過收據後，號碼會自動接下去，每年 1 月從 001 號重新開始。協會借用的號碼在「月費」頁標記。收據日期遇週六、週日順延，每個月也可以在「月費」頁最上面改。</p>
   <div class="two"><label>優化比收據預設幾號（空白＝跟月費一樣）<input type="number" id="sRDayOpt" inputmode="numeric" min="1" max="31" value="${+N.rcptDayOpt || ''}"></label><label>契約價金收據預設幾號（空白＝跟月費一樣）<input type="number" id="sRDayCon" inputmode="numeric" min="1" max="31" value="${+N.rcptDayContract || ''}"></label></div>
   <div class="two"><label>優化比收據繳款人<input type="text" id="sPayGov" value="${esc(N.payGov || '屏東縣政府')}"></label><label>契約價金收據繳款人<input type="text" id="sPayAssoc" value="${esc(N.payAssoc || '中華頭心手希望教育協會')}"></label></div>
   <div class="actions start"><button type="button" class="btn primary" id="saveRcpt">儲存</button></div>
  </details>
  <details class="card pickbox" ${!+N.wbBizTotal ? 'open' : ''}><summary>委辦費預算（每年 1/1 依契約書輸入）</summary>
   <div class="two"><label>委辦人事費<input type="number" id="sPB" inputmode="numeric" value="${N.wbPersonBudget || ''}"></label><label>系統啟用前已用的人事費<input type="number" id="sPU" inputmode="numeric" value="${N.wbPersonUsedBefore || ''}"></label></div>
   <div class="two"><label>委辦業務費總額<input type="number" id="sBT" inputmode="numeric" value="${N.wbBizTotal || ''}"></label><label>${CY}年度行管費<input type="number" id="sAdm" inputmode="numeric" value="${N.admBudget || ''}"></label></div>
   <p class="hint" style="font-size:14px">各細項預算加總要等於業務費總額。年中要挪用時，直接改兩個項目的預算即可。「啟用前已用」只有今年開始使用系統前已經花掉的金額要填。</p>
   <div class="tablewrap bgrid"><table><thead><tr><th>項目</th><th>預算</th><th>啟用前已用</th></tr></thead><tbody>
    ${wbItems().map((k, i) => `<tr><td>${k}</td><td><input type="number" inputmode="numeric" data-bud="${i}" value="${B[k] || ''}"></td><td><input type="number" inputmode="numeric" data-used="${i}" value="${U[k] || ''}"></td></tr>`).join('')}
   </tbody><tfoot><tr><td>細項合計</td><td id="bSum">${fmt(bsum)}</td><td></td></tr></tfoot></table></div>
   <p class="err" id="bWarn" ${bsum && +N.wbBizTotal && bsum !== +N.wbBizTotal ? '' : 'hidden'}>細項合計和業務費總額不一樣，請再確認。</p>
   <div class="actions start"><button type="button" class="btn primary" id="saveBudget">儲存預算</button></div>
  </details>
  <details class="card pickbox"><summary>類別清單（選了類別，經費來源就自動帶出）</summary>
   <p class="hint" style="font-size:14px">用不到的項目按 ✕ 刪除，再用下方「＋ 新增類別」加自己的名稱；只有 01 號（${esc(N.firstItem)}）不能刪。刪除不影響已經記過的發票和憑證。</p>
   ${cats().map(g => `<div><div class="meta" style="margin:0 0 4px">${pill(g.src)}</div><div class="chips">${g.items.length ? '' : '<span class="hint" style="font-size:14px">已經沒有項目，要用時再從下方新增。</span>'}${g.items.map(x => `<span class="chip">${esc(x)}${!canDelCat(g.src, x) ? '' : `<button type="button" class="chipx" data-delsrc="${esc(g.src)}" data-delcat="${esc(x)}" aria-label="刪除 ${esc(x)}">✕</button>`}</span>`).join('')}</div></div>`).join('')}
   <div class="two"><label>新類別名稱<input type="text" id="sNewCat"></label><label>經費來源<select id="sNewSrc">${allSrcs().map(s => `<option>${esc(s)}</option>`).join('')}<option value="__new">＋ 新的經費來源…</option></select></label></div>
   <label id="sNewSrcWrap" hidden>新的經費來源名稱<input type="text" id="sNewSrcName" placeholder="例如：開辦費"></label>
   <p class="hint" style="font-size:14px">要記別的經費（例如開辦費），選「＋ 新的經費來源」，再填這筆經費底下的第一個類別。自己加的經費來源會列在年度經費報表下方，不算進每月損益。</p>
   <div class="actions start"><button type="button" class="btn" id="addCat">＋ 新增類別</button></div>
  </details>
  <details class="card pickbox"><summary>重要提醒的規則</summary>
   <p class="hint" style="font-size:15px">登入時會跳出重要提醒，勾選並按「已了解」後，下次登入不再跳出；每月 20 號以後第一次登入會再跳一次。提醒會一直顯示在頁面最上方，處理好才消失。</p>
   <div class="actions start"><button type="button" class="btn" id="demoAlert">再看一次提醒</button></div>
  </details>
  <details class="card pickbox" id="bkCard" ${needAllBk() ? 'open' : ''}><summary>備份</summary>
   ${ADMIN ? `<div class="status ${needAllBk() ? '' : 'info'}">管理者：一次下載四間公托的每月報表（Excel，一間一張工作表）和備份（還原用）。${allBkDone() ? `這台裝置上次下載的是 ${String(allBkDone()).slice(0, -2)} 年 ${+String(allBkDone()).slice(-2)} 月的。` : '這台裝置還沒下載過。'}每月 25 號起會提醒。</div>
   <div class="actions start"><button type="button" class="btn primary" id="backupAll">一次下載四間</button></div>` : ''}
   <p class="hint" style="font-size:15px">資料存在雲端，換手機或電腦都還在。建議每個月下載一份備份存到電腦。萬一資料被改錯，可以用備份檔還原。</p>
   <div class="actions start"><button type="button" class="btn" id="backup">下載備份</button><button type="button" class="btn" id="restore">從備份還原</button></div>
  </details>
  <div class="actions start"><button type="button" class="btn logout" id="logout" style="background:var(--bad);border-color:var(--bad);color:#fff;font-weight:700">${DEMO ? '離開範例資料' : '登出這台裝置'}</button></div>
  <p class="ver">版本 ${VERSION}・遇到問題時，把畫面截圖傳給管理者，並告知這個版本號。</p>${COPYRIGHT}`;
}
// 使用說明：每個主題一張真實畫面＋步驟；各頁右上「？這頁怎麼用」直接跳到對應主題
const HELP = [
  { id: 'start', t: '第一次使用', shot: 'set', steps: ['到「更多 → 設定」，打開「公托資料」，填主任姓名和計畫主持人（01 號受款人），按「儲存公托資料」。', '打開「員工名單」，一行一位，順序就是薪資憑證的編號（第一位是 02）。', '打開「委辦費預算」，依契約書填人事費、業務費總額和各細項。', '到「月費」按「＋ 新增幼兒」，輸入座號、姓名和生日。'] },
  { id: 'add', t: '輸入發票', shot: 'dlginv', steps: ['拿到發票就按「＋ 新增發票」。', '代墊人預設是主任；付給廠商的選「付給廠商」並填廠商名稱。', '年、月已帶好，選日期、類別，填品名、數量和單價。經費來源會依類別自動帶出。', '不習慣一個畫面填很多欄位，可以在「本月」或「設定」改成一步一步模式。'] },
  { id: 'merge', t: '合併成憑證', shot: 'merge', steps: ['到「發票」，勾選同一類別、同一個付款對象的發票。', '按下方「合併成憑證」，編號、受款人、經費來源、用途說明、金額都會自動帶入。', '需要時可以改用途說明，或加一行備註（會印在簽章欄下方）。', '建立憑證需要網路，避免兩台裝置用到同一個編號。'] },
  { id: 'print', t: '列印憑證', shot: 'print', steps: ['到「更多 → 憑證與列印」，按「列印憑證」。', '還沒印的會先勾好；要補印的，在「要印哪幾張」清單自己勾起來。', '先印第 1 批委辦費（一般紙），再印第 2 批其他經費來源（色紙），畫面會說要放幾張色紙。', '可以左右滑動或按「上一張／下一張」看每一張。'] },
  { id: 'cash', t: '零用金結算', shot: 'cash', steps: ['每月兩次，到「更多 → 零用金結算」。', '清單只列主任代墊的發票，照憑證編號排列，會計可以拿著憑證依序對帳。', '按「結算到今天」。還有發票沒做憑證、憑證沒印的，會先提醒你。', '結算過的清單在下方「已結算」，可以再列印。'] },
  { id: 'staff', t: '人事費', shot: 'staff', steps: ['薪資清冊做好後，到「更多 → 人事費」。', '每位員工填這個月的金額，經費來源預設委辦費-人事費。', '委辦人事費不夠時，按那位員工的「拆單」，填委辦費付多少，其餘自動改由營運收入支應。', '按「儲存本月人事費」。生日禮金、代班薪資、年終獎金在下方新增。'] },
  { id: 'fee', t: '月費與收據', shot: 'fee', steps: ['名單沿用上個月，月費和餐點費依上課天數和生日自動算。餐點費看孩子到當月 1 號滿幾個月：未滿 6 個月不收、未滿 1 歲 300 元、滿 1 歲 600 元。', '有延托、保險、退費的孩子，按「修改」填寫；退費填負數。', '按「列印收據」，每位孩子一頁三聯。收據號碼在列印時確定，印過的不會再變；每年 1 月從 001 號重新開始。', '協會借用的收據號碼，按「協會借用號碼」標記，之後會跳過。', '收據日期在頁面最上面，預設每月 15 號（遇週末順延），每個月可以自己改；預設幾號在「設定 → 收據」改，優化比、契約價金也可以設不同的預設日。', '有幾張要用不同的日期：按「勾選改日期」，像發票一樣勾選收據，在下方選日期後按「套用日期」。', '頁面下方「請款收據」：1、4、7、10 月會出現優化比（繳款人預設屏東縣政府；1 月是前一年第四期），1、2、7、10 月會出現契約價金（繳款人預設協會）。按「填寫」確認金額、貼上摘要，再按「列印」。其他要開的收據按「＋ 其他收據」。'] },
  { id: 'report', t: '報表', shot: 'report', steps: ['「年度經費報表」照每月報表的格式，自動算每月收入、支出、損益，和委辦費、行管費用了幾 %。', '優化比、提升托育品質、縣府補助款到帳時，按「＋ 新增撥款收入」；補助款要選期別（第一期、第二期⋯），每一期各一列。', '按「列印（A4 橫式）」印一頁；按「匯出 Excel」下載和原本格式一樣的 Excel（標楷體、顏色、公式）。', '系統啟用前的月份，按「從 Excel 補登」選原本的經費明細檔，核對數字後按「補登」。要交縣府時按「產出核銷報表」。'] },
  { id: 'trash', t: '刪錯了怎麼辦', shot: 'trash', steps: ['刪除的發票、取消的憑證會在「更多 → 垃圾桶」放 30 天。', '按「救回」就回到原本的地方，任何一台裝置都能救。', '剛刪掉時，畫面下方的提示也有「復原」可以按。'] },
  { id: 'backup', t: '備份與還原', shot: 'backup', steps: ['建議每個月到「更多 → 設定 → 備份」按「下載備份」，存到電腦。', '萬一資料被改錯，按「從備份還原」，選那個備份檔。', '還原前會先自動下載一份目前的資料，還原錯了還能再還原回來。', '備份之後才新增的資料不會被刪掉。', '管理者每月 25 號起會看到提醒，到「設定 → 備份」按「一次下載四間」，會下載四間的每月報表（Excel）和備份（還原用）兩個檔案。還原時選這個四間的備份檔也可以，會自動取出目前這間。'] },
  { id: 'install', t: '安裝成 App', steps: ['iPhone、iPad：用 Safari 開啟，按分享 →「加入主畫面」。', 'Android：用 Chrome 開啟，按右上選單 →「加到主畫面」或「安裝應用程式」。', '電腦（Windows、Mac、Chromebook）：用 Chrome 或 Edge 開啟，按網址列右邊的安裝圖示。', '從 LINE 點開的話，請先選「用預設瀏覽器開啟」，登入才會留下來。'] },
];
const HELP_OF = { home: 'add', inv: 'merge', fee: 'fee', report: 'report', vou: 'print', cash: 'cash', staff: 'staff', trash: 'trash', set: 'start' };
let helpTopic = '';
const COPYRIGHT = '<p class="copyright">© 2026 公托經費記帳・僅供四間公托內部使用</p>';
function help() {
  $('#view').innerHTML = `<nav class="card" aria-label="說明目錄"><div class="title">想知道哪一件事？</div><div class="chips">${HELP.map(h => `<button type="button" class="chip" data-helpto="${h.id}">${h.t}</button>`).join('')}</div></nav>
  ${HELP.map((h, i) => `<section class="card helpsec" id="h-${h.id}"><h2>${i + 1}. ${h.t}</h2>
    <div class="helpbody">${h.shot ? `<img class="helpshot" src="help/${h.shot}.webp" alt="${h.t}的畫面" loading="lazy" width="390" height="560">` : ''}
    <ol class="helpsteps">${h.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div></section>`).join('')}
  <p class="hint">說明裡的畫面都是範例資料，名字和金額都是虛構的。</p>
  <p class="ver">版本 ${VERSION}・遇到問題時，把畫面截圖傳給管理者，並告知這個版本號。</p>${COPYRIGHT}`;
  if (helpTopic) { const el = $('#h-' + helpTopic); helpTopic = ''; if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
}

/* ===== 紙本內容 ===== */
function voucherSheet(v) {
  const s = String(Math.round(v.amount)).padStart(6, ' ').split('');
  return `<h3>${esc(N.assoc)}</h3><h4>支出憑證粘存單</h4>
  <div style="margin:0 0 6px">受款人：${esc(N.short)}公托 ${esc(v.payee)}</div>
  <table><thead><tr><th rowspan="2">憑證編號</th><th rowspan="2">經費來源</th><th rowspan="2">用途說明</th><th colspan="6">金額</th></tr>
  <tr>${['十萬', '萬', '千', '百', '十', '元'].map(t => `<th class="dig">${t}</th>`).join('')}</tr></thead>
  <tbody><tr><td style="white-space:nowrap">${esc(v.no)}</td><td style="white-space:nowrap">${esc(v.src)}</td><td>${esc(N.short)}公托-${esc(v.desc)}</td>${s.map(c => `<td class="dig">${c.trim()}</td>`).join('')}</tr></tbody></table>
  <div class="sign"><span>經手人</span><span>計畫主持人</span><span>會計</span><span>出納</span><span>理事長</span></div>
  ${v.note ? `<div class="pnote">備註：${esc(v.note)}</div>` : ''}
  <div class="cut">憑　證　黏　貼　線</div><div class="glue">（以下貼發票）</div>`;
}
function cashSheet(rows, title, y, m) {
  const t = rows.reduce((a, x) => a + amt(x), 0);
  return `<h3>${esc(N.short)}公托${y}年 ${m}月業務費代墊金結報清單</h3><div style="text-align:center;margin:4px 0 10px">${esc(title)}</div>
  <table><thead><tr><th>月</th><th>日</th><th>內容</th><th>數量</th><th>單價</th><th>總價</th><th>餘額</th></tr></thead>
  <tbody>${rows.map((x, i) => `<tr><td>${x.m}</td><td>${x.d}</td><td>${esc(x.cat)}${x.cat === '幼兒食材' ? '' : '：' + esc(x.desc)}</td><td>${x.qty > 1 ? x.qty : ''}</td><td>${x.qty > 1 ? fmt(x.price) : ''}</td><td style="text-align:right">${fmt(amt(x))}</td>${i === 0 ? `<td rowspan="${rows.length}" style="text-align:center">${fmt(N.petty - t)}</td>` : ''}</tr>`).join('')}
  <tr><td colspan="5" style="text-align:center;font-weight:700">合計</td><td style="text-align:right;font-weight:700">${fmt(t)}</td><td></td></tr></tbody></table>
  <div style="margin-top:16px;line-height:2.4">製表：<br>經手人：<br>覆核：</div>`;
}
function foodSheet(y, m) {
  const f = invoices().filter(x => x.cat === '幼兒食材' && x.y === y && x.m === m).sort((a, b) => a.d - b.d);
  return `<h3>${y}年${m}月份食材費統計</h3><br><table><thead><tr><th>月</th><th>日</th><th>內容</th><th>總價</th></tr></thead><tbody>${f.map(x => `<tr><td>${x.m}</td><td>${x.d}</td><td>幼兒食材（${esc(x.food)}）</td><td style="text-align:right">${fmt(amt(x))}</td></tr>`).join('')}<tr><td colspan="3" style="text-align:right;font-weight:700">合計</td><td style="text-align:right;font-weight:700">${fmt(f.reduce((a, x) => a + amt(x), 0))}</td></tr></tbody></table>`;
}
function receiptPage(k, no, y, m) {
  const f = (monthDoc(y, m).fees || {})[k.id] || {}, c = kidCalc(k, f, y, m);
  const parts = [`${y}年${m}月月費${c.fee}元`]; if (c.meal) parts.push(`${m}月餐點費${c.meal}元`);
  if (+f.late) parts.push(`延托費${f.late}元`); if (+f.ins) parts.push(`保險費${f.ins}元`); if (+f.refund) parts.push(`退費${Math.abs(f.refund)}元`);
  return rcptPage({ no, y, date: kidRcptDate(y, m, k.id), payer: k.name, desc: parts.join('；'), total: c.total, third: '第三聯：家長留存聯' });
}
function rcptPage({ no, y, date, payer, desc, total, third }) {
  const one = lab => `<div style="display:flex"><div style="flex:1"><h3 style="font-size:18px">${esc(N.full)}</h3><h4 style="margin:2px 0 6px;font-size:16px">收據 RECEIPT</h4>
   <div class="rhead"><span>日期：${rocDate(date)}<br>統一編號：${esc(N.tax)}</span><span>（${y}）${esc(N.short)}收字第 <b>${rcptNo(no)}</b> 號</span></div>
   <table class="rbox"><thead><tr><th style="width:24%">繳款人 PAYER</th><th>摘要 DESCRIPTION</th><th style="width:20%">金額 AMOUNT</th></tr></thead>
   <tbody><tr><td>${esc(payer)}</td><td style="white-space:pre-line">${esc(desc)}</td><td style="text-align:right">$${fmt(total)}</td></tr>
   <tr><td colspan="3" style="height:auto">金額 AMOUNT　新臺幣 ${chNum(total)}</td></tr></tbody></table>
   <div style="font-size:14px;margin-top:4px">經手人：</div></div><div class="side-note">${lab}</div></div>`;
  return one('第一聯：協會留存聯') + '<div class="rcut"></div>' + one('第二聯：公托留存聯') + '<div class="rcut"></div>' + one(third);
}
// 金額寫法照範本：$1,234；負數 ($1,234)
const money = v => v == null ? '' : v < 0 ? `<span class="neg">(${'$' + fmt(-v)})</span>` : '$' + fmt(v);
const ZERO_BLANK = new Set(['fee', 'opt', 'q', 'sub', 'other', 'qHR', 'qBiz', 'adm']);
const cellV = (r, v) => v == null || (v === 0 && ZERO_BLANK.has(r.k)) ? '' : money(v);
const anTitle = () => `${N.full.startsWith('高雄市') ? '高雄市' : '屏東縣'}政府委託${N.assoc}辦理<br>${N.full}`;
function annualHTML(A) {
  const mcells = r => r.v.map((v, i) => `<td class="m${A.months[i].mode === 'manual' ? ' man' : ''}">${cellV(r, v)}</td>`).join('');
  let h = `<table class="antable"><thead><tr class="an-h"><th colspan="3"></th>${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}月</th>`).join('')}<th>總額</th><th></th></tr></thead><tbody>`;
  A.inc.forEach((r, i) => h += `<tr class="an-lav"><th colspan="3">${r.t}</th>${mcells(r)}<td class="m">${money(r.total)}</td>${i === 0 ? `<th rowspan="${A.inc.length}" class="anside">年收入</th>` : ''}</tr>`);
  A.sub.forEach((r, i) => h += `<tr class="an-yel"><th colspan="3">${esc(r.t)}</th>${mcells(r)}<td class="m">${money(r.total)}</td>${i === 0 ? `<th rowspan="${A.sub.length}" class="anside"></th>` : ''}</tr>`);
  A.groups.forEach(g => g.rows.forEach((r, i) => h += `<tr class="${g.key === 'op' ? 'an-blue' : 'an-green'}">${i === 0 ? `<th rowspan="${g.rows.length}">${g.g.replace('\n', '<br>')}</th>` : ''}<th colspan="2">${r.t}</th>${mcells(r)}<td class="m">${money(r.total)}</td>${i === 0 ? `<th rowspan="${g.rows.length}" class="anside">${g.key === 'op' ? '年支出' : '支出'}</th>` : ''}</tr>`));
  A.wb.forEach((r, i) => h += `<tr class="an-green">${i === 0 ? '<th rowspan="2" class="an-lavc">委辦支出</th>' : ''}<th>${r.t}</th><td class="m">${money(r.b)}</td>${mcells(r)}<td class="m">${money(r.left)}</td><td class="anside">${r.b ? Math.round(r.pct * 100) + '%' : ''}</td></tr>`);
  h += `<tr class="an-gray"><th colspan="2" class="admlab">${A.adm.t.replace('\n', '<br>')}</th><td class="m">${money(A.adm.b)}</td>${mcells(A.adm)}<td class="m">${money(A.adm.left)}</td><td class="anside">${A.adm.b ? Math.round(A.adm.pct * 100) + '%' : ''}</td></tr>`;
  h += `<tr class="an-lav"><th colspan="3">每月損益</th>${A.loss.map(v => `<td class="m">${money(v)}</td>`).join('')}<td class="m">${money(A.lossTotal)}</td><th class="anside">年盈餘</th></tr></tbody></table>`;
  if (A.cus.length) h += `<table class="antable ancus"><thead><tr><th>其他經費來源（不算進上方損益）</th>${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}月</th>`).join('')}<th>總額</th></tr></thead><tbody>${A.cus.map(r => `<tr><th>${esc(r.t)}</th>${r.v.map(v => `<td class="m">${v ? money(v) : ''}</td>`).join('')}<td class="m">${money(r.total)}</td></tr>`).join('')}</tbody></table>`;
  h += `<table class="anbox"><tr><th>收入（含補助）</th><td>${money(A.incTotal)}</td></tr><tr><th>支出（含補助）</th><td>${money(A.expBudget)}</td></tr><tr><th>盈餘（含補助）</th><td>${money(A.incTotal - A.expBudget)}</td></tr></table>`;
  return h;
}
function annualPrint(A) {
  return `<div class="anprint"><div class="antitle">${anTitle()}</div>${annualHTML(A)}
  <p class="annote">「支出（含補助）」的委辦人事費、委辦業務費、行管費以預算全額計算。${manualUntil(A.y) ? `1–${manualUntil(A.y)} 月為系統啟用前補登的數字。` : ''}列印日期 ${CY}/${CM}/${CD}</p></div>`;
}
// 匯出 Excel：版面、顏色、框線、公式都照範本
function annualSheet(A) {
  const C = {}, M = [], rows = { 1: 42.75 }, FMT = '"$"#,##0_);[Red]\\("$"#,##0\\)';
  const col = i => String.fromCharCode(65 + i);                 // 0→A
  const put = (ref, v, st, f) => C[ref] = { v, f, s: st };
  const fill = { h: 'FAEDA0', lav: 'E5DFEC', yel: 'FFFFCC', blue: 'DAEEF3', green: 'EAF1DD', gray: 'F2F2F2' };
  const box = (r1, c1, r2, c2, v, st) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(col(c) + r, r === r1 && c === c1 ? v : null, st); if (r1 !== r2 || c1 !== c2) M.push(`${col(c1)}${r1}:${col(c2)}${r2}`) };
  const t = `${N.full.startsWith('高雄市') ? '高雄市' : '屏東縣'}政府委託${N.assoc}辦理\n${N.full}`;
  box(1, 0, 1, 16, t, { wrap: true, border: false });
  box(2, 0, 2, 2, null, { fill: fill.h });
  for (let m = 0; m < 12; m++) put(col(3 + m) + 2, `${m + 1}月`, { fill: fill.h });
  put('P2', '總額', { fill: fill.h }); put('Q2', null, { fill: fill.h });
  let r = 3;
  const monthRow = (row, f, rr) => { row.v.forEach((v, i) => put(col(3 + i) + rr, v == null || (v === 0 && ZERO_BLANK.has(row.k)) ? null : v, { fill: f, fmt: FMT })) };
  const sumRow = (rr, f) => put('P' + rr, null, { fill: f, fmt: FMT }, `SUM(D${rr}:O${rr})`);
  const incStart = r;
  A.inc.forEach((row, i) => { box(r, 0, r, 2, row.t, { fill: fill.lav }); monthRow(row, fill.lav, r); sumRow(r, fill.lav); C['P' + r].v = row.total; r++ });
  box(incStart, 16, r - 1, 16, '年收入', { fill: fill.lav });
  if (A.sub.length) { const s0 = r; A.sub.forEach(row => { box(r, 0, r, 2, row.t, { fill: fill.yel }); monthRow(row, fill.yel, r); sumRow(r, fill.yel); C['P' + r].v = row.total; r++ }); box(s0, 16, r - 1, 16, null, { fill: fill.yel }) }
  const incEnd = r - 1, opStart = r;
  for (const g of A.groups) {
    const f = g.key === 'op' ? fill.blue : fill.green, g0 = r;
    g.rows.forEach(row => { box(r, 1, r, 2, row.t, { fill: f }); monthRow(row, f, r); sumRow(r, f); C['P' + r].v = row.total; r++ });
    box(g0, 0, r - 1, 0, g.g, { fill: f, wrap: true }); box(g0, 16, r - 1, 16, g.key === 'op' ? '年支出' : '支出', { fill: f });
  }
  const opEnd = r - 1, wb0 = r;
  A.wb.forEach(row => {
    put('B' + r, row.t, { fill: fill.green }); put('C' + r, row.b, { fill: fill.green, fmt: FMT }); monthRow(row, fill.green, r);
    put('P' + r, row.left, { fill: fill.green, fmt: FMT }, `C${r}-SUM(D${r}:O${r})`); put('Q' + r, row.pct, { fill: fill.green, fmt: '0%' }, `IF(C${r}=0,0,1-P${r}/C${r})`); r++;
  });
  box(wb0, 0, r - 1, 0, '委辦支出', { fill: fill.lav });
  const adm = r; rows[r] = 30.6;
  box(r, 0, r, 1, A.adm.t, { fill: fill.gray, bold: true, color: '003399', wrap: true }); put('C' + r, A.adm.b, { fill: fill.gray, fmt: FMT }); monthRow(A.adm, fill.gray, r);
  put('P' + r, A.adm.left, { fill: fill.gray, fmt: FMT }, `C${r}-SUM(D${r}:O${r})`); put('Q' + r, A.adm.pct, { fill: fill.gray, fmt: '0%' }, `IF(C${r}=0,0,1-P${r}/C${r})`); r++;
  box(r, 0, r, 2, '每月損益', { fill: fill.lav });
  A.loss.forEach((v, i) => { const c = col(3 + i); put(c + r, v, { fill: fill.lav, fmt: FMT }, `SUM(${c}${incStart}:${c}${incEnd})-SUM(${c}${opStart}:${c}${adm})`) });
  put('P' + r, A.lossTotal, { fill: fill.lav, fmt: FMT }, `SUM(D${r}:O${r})`); put('Q' + r, '年盈餘', { fill: fill.lav }); r += 2;
  const lab = { align: 'left' }, val = { align: 'left', fmt: '"$"#,##0;[Red]"$"#,##0' };
  box(r, 1, r, 2, '收入(含補助)', lab); box(r, 3, r, 4, A.incTotal, val); C['D' + r].f = `SUM(P${incStart}:P${incEnd})`;
  box(r + 1, 1, r + 1, 2, '支出(含補助)', lab); box(r + 1, 3, r + 1, 4, A.expBudget, val); C['D' + (r + 1)].f = `SUM(P${opStart}:P${opEnd},C${wb0}:C${adm})`;
  box(r + 2, 1, r + 2, 2, '盈餘(含補助)', lab); box(r + 2, 3, r + 2, 4, A.incTotal - A.expBudget, val); C['D' + (r + 2)].f = `D${r}-D${r + 1}`;
  if (A.cus.length) {          // 各公托自己加的經費來源：放在最下面，上面的列號和原檔一樣
    r += 4; box(r, 0, r, 2, '其他經費來源（不算進損益）', { bold: true }); for (let i = 0; i < 12; i++) put(col(3 + i) + r, `${i + 1}月`, {}); put('P' + r, '總額', {}); r++;
    for (const x of A.cus) { box(r, 0, r, 2, x.t, {}); monthRow(x, null, r); put('P' + r, x.total, { fmt: FMT }, `SUM(D${r}:O${r})`); r++ }
  }
  return { name: '每月報表', cells: C, merges: M, rows, landscape: true, cols: [10.75, 4.25, 12, 12.5, 12.5, 14.4, 13.9, 12.5, 12.5, 12.6, 13.4, 12.5, 12.5, 12.5, 12.5, 16.6, 7.5] };
}
async function exportYear() {
  try {
    const { writeXlsx } = await import('./xlsx.js');
    const blob = writeXlsx(annualSheet(annual(CY)));
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${N.short}經費明細-${CY}年.xlsx`; document.body.appendChild(a); a.click(); a.remove();
    toast('已匯出 Excel。');
  } catch (e) { console.error(e); toast('匯出沒有成功，請再試一次。') }
}
// 從 Excel 補登：讀「每月報表」，依左邊的名稱對應到系統的列別
function mapImported(cells) {
  const at = (c, r) => cells[c + r], txt = v => v == null ? '' : String(v).replace(/\s+/g, '');
  let head = 0, mcol = {};
  for (let r = 1; r <= 60 && !head; r++) { const m = {}; for (let i = 0; i < 26; i++) { const c = colName(i), t = txt(at(c, r)); const mm = /^(\d{1,2})月$/.exec(t); if (mm) m[+mm[1]] = c } if (m[1] && m[12]) { head = r; mcol = m } }
  if (!head) return null;
  const months = Array.from({ length: 12 }, () => []), budgets = {}, unknown = [];
  let group = '';
  const put = (m, row) => { if (row.a) months[m - 1].push(row) };
  const num = v => typeof v === 'number' ? Math.round(v) : 0;
  for (let r = head + 1; r <= head + 60; r++) {
    const A = txt(at('A', r)), B = txt(at('B', r));
    if (!A && !B) continue;
    if (A === '總收入' || A.includes('含補助') || B.includes('含補助')) break;
    if (A.includes('每月損益') || A.includes('年盈餘')) { group = ''; continue }
    if (A && B) group = A; else if (A) group = '';
    let k = null, l = null;
    const g = group;
    if (g) {
      const sub = B.includes('人事') ? 'HR' : B.includes('業務') ? 'Biz' : B.includes('年終') ? 'Bonus' : B.includes('餐') ? 'Meal' : B.includes('保險') ? 'Ins' : '';
      if (/營運|自籌/.test(g) && sub) k = 'op' + sub;
      else if (g.includes('提升') && (sub === 'HR' || sub === 'Biz')) k = 'q' + sub;
      else if (g.includes('委辦') && (sub === 'HR' || sub === 'Biz')) { k = 'wb' + sub; if (typeof at('C', r) === 'number') budgets[k] = num(at('C', r)) }
    } else if (A === '月費收入') k = 'fee';
    else if (A === '優化比') k = 'opt';
    else if (A === '提升托育品質') k = 'q';
    else if (A.includes('行管費')) { k = 'adm'; if (typeof at('C', r) === 'number') budgets.adm = num(at('C', r)) }
    else if (A.includes('補助')) { k = 'sub'; l = String(at('A', r)).trim() }
    if (!k) { unknown.push(String(at('A', r) || '') + String(at('B', r) || '')); continue }
    for (let m = 1; m <= 12; m++) put(m, { k, ...(l ? { l } : {}), a: num(at(mcol[m], r)) });
  }
  return { months, budgets, unknown };
}
function importPreview(res, file) {
  const keys = [...AN_INC, ['sub', '縣府補助款'], ...AN_GROUPS.flatMap(g => g.rows.map(([k, t]) => [k, (g.key === 'op' ? '營運' : '提升') + t])), ['wbHR', '委辦人事'], ['wbBiz', '委辦業務'], ['adm', '行管費']];
  const tot = (m, k) => res.months[m].filter(x => x.k === k).reduce((a, x) => a + x.a, 0);
  const def = Math.max(0, Math.min(12, CM - 1));
  const B = res.budgets;
  ask('從 Excel 補登', `<p class="hint">讀到「${esc(file)}」的每月報表。請核對下面的數字和 Excel 一樣（單位：元）。</p>
   <div class="tablewrap" style="max-height:40vh;overflow:auto"><table class="imptable"><thead><tr><th>項目</th>${Array.from({ length: 12 }, (_, i) => `<th class="num">${i + 1}月</th>`).join('')}</tr></thead><tbody>
   ${keys.map(([k, t]) => `<tr><td>${t}</td>${Array.from({ length: 12 }, (_, m) => `<td class="num">${tot(m, k) ? fmt(tot(m, k)) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
   ${res.unknown.length ? `<p class="hint" style="font-size:14px">沒有對應到的列（不會匯入）：${res.unknown.map(esc).join('、')}</p>` : ''}
   <div class="two"><label>年度<select id="impY"><option value="${CY}">民國 ${CY} 年</option><option value="${CY - 1}">民國 ${CY - 1} 年</option></select></label>
   <label>補登到幾月<select id="impM">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === def ? 'selected' : ''}>${i + 1} 月</option>`).join('')}</select></label></div>
   <p class="hint" style="font-size:14px">補登的月份用 Excel 的數字；之後的月份用系統裡的資料。之後可以在報表頁改。</p>
   ${B.wbHR || B.wbBiz || B.adm ? `<label class="check"><input type="checkbox" id="impB" checked> 預算也一起更新：委辦人事費 ${fmt(B.wbHR || 0)}、委辦業務費 ${fmt(B.wbBiz || 0)}、行管費 ${fmt(B.adm || 0)}</label>` : ''}`, () => {
    const y = +$('#impY').value, mu = +$('#impM').value;
    const ops = res.months.map((rows, i) => ({ c: 'months', id: ymKey(y, i + 1), data: { y, m: i + 1, manual: { rows, at: Date.now() } } }));
    store.batch(ops).catch(fail());
    const patch = { manualUntil: { ...(N.manualUntil || {}), [y]: mu } };
    if ($('#impB') && $('#impB').checked) { if (B.wbHR) patch.wbPersonBudget = B.wbHR; if (B.wbBiz) patch.wbBizTotal = B.wbBiz; if (B.adm) patch.admBudget = B.adm }
    store.setSettings(patch).catch(fail());
    toast(`已補登 ${y} 年 1–${mu} 月。`);
  }, '補登');
}
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const { readXlsx } = await import('./xlsx.js');
    const x = await readXlsx(await f.arrayBuffer(), '每月報表');
    const res = mapImported(x.cells);
    if (!res) return toast(`在「${x.sheet}」找不到 1月到 12月的標題列，請確認是每月報表。`);
    importPreview(res, f.name);
  } catch (err) { console.error(err); toast('這個檔案讀不出來，請確認是 Excel 檔（.xlsx）。') }
});
function govSheet(f, t) {
  let pers = 0, biz = 0, op = 0, total = 0, wbP = 0;
  for (let m = f; m <= t; m++) {
    const d = monthDoc(CY, m);
    for (const r of d.payroll || []) { pers += +r.amount || 0; if (r.src === '委辦費-人事費') wbP += +r.amount || 0; else op += +r.amount || 0; }
    if (d.payroll) biz += +(d.supervisor ?? N.supervisor) || 0;
    for (const v of vouchersOf(CY, m)) { if (v.kind === 'hr') { pers += v.amount; if (v.src.startsWith('營運')) op += v.amount; } else { if (v.src === '委辦費-業務費') biz += v.amount; else if (v.src.startsWith('營運')) op += v.amount; } }
    total += monthExpense(CY, m);
  }
  const pB = +N.wbPersonBudget || 0, pU = wbPersonUsed(), bB = +N.wbBizTotal || 0, bU = wbBizUsed();
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`;
  return `<h3>${esc(N.full)}</h3><h4>${CY}年 ${f}–${t} 月經費支出摘要</h4>
  <table><tbody>${row('期間總支出', fmt(total) + ' 元')}${row('人事費支出', fmt(pers) + ' 元')}${row('委辦業務費支出（含${esc(N.firstItem)}）', fmt(biz) + ' 元')}${row('營運收入支應支出', fmt(op) + ' 元')}
  ${row('委辦人事費：已用／預算', `${fmt(pU)} ／ ${fmt(pB)} 元（${pct(pU, pB)}%），剩 ${fmt(pB - pU)} 元`)}${row('委辦業務費：已用／預算', `${fmt(bU)} ／ ${fmt(bB)} 元（${pct(bU, bB)}%），剩 ${fmt(bB - bU)} 元`)}</tbody></table>
  <p style="font-size:13px;margin-top:12px">已用金額計至列印當天；系統啟用前的支出依「設定 → 委辦費預算」填寫的已用金額計算。明細可匯出業務費明細 Excel 附上。</p>`;
}

/* ===== 預覽（一頁一張、可滑動） ===== */
const PV = { pages: [], i: 0, onPrint: null };
// 列印用標楷體：電腦有內建標楷體就用；手機沒有，改用網路上的楷體（第一次預覽時才載入，不拖慢開啟）
let kaiLoaded = false;
function loadKai() {
  if (kaiLoaded) return; kaiLoaded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap';
  document.head.appendChild(l);
}
function openPreview(o) {
  loadKai(); PV.land = !!o.land; $('#pvView').classList.toggle('land', PV.land);
  PV.pages = o.pages; PV.onPrint = o.onPrint || null;
  $('#pTitle').textContent = o.title;
  $('#pTools').innerHTML = o.tools || ''; $('#pTools').hidden = !o.tools;
  $('#pSide').innerHTML = o.side || ''; $('#pSide').hidden = !o.side; $('#pGrid').classList.toggle('withside', !!o.side);
  $('#pGo').textContent = o.goText || '列印';
  $('#pGo').setAttribute('aria-disabled', String(!PV.pages.length));
  if (!$('#dlgPrint').open) $('#dlgPrint').showModal();
  const keep = o.keep ? PV.i : 0;
  $('#pvStrip').innerHTML = PV.pages.length ? PV.pages.map(p => `<div class="a4slot"><div class="a4box"><div class="a4${PV.land ? ' land' : ''}">${p}</div></div></div>`).join('') : '<div class="a4slot"><div class="empty" style="margin:24px">這一批沒有勾選的頁面。</div></div>';
  pvFit(); pvGo(keep, false);
}
function pvFit() { const vp = $('#pvView'); if (!vp.clientWidth) return; const [w, h] = PV.land ? [1123, 794] : [794, 1123]; const s = Math.min(1, (vp.clientWidth - 24) / w, Math.max(300, innerHeight * .55) / h); vp.style.setProperty('--s', s.toFixed(4)) }
function pvGo(i, anim = true) {
  const n = PV.pages.length; PV.i = Math.max(0, Math.min(i, n - 1));
  const st = $('#pvStrip');
  if (!anim) { st.style.transition = 'none'; st.style.transform = `translateX(${-PV.i * 100}%)`; void st.offsetWidth; st.style.transition = ''; }
  else st.style.transform = `translateX(${-PV.i * 100}%)`;
  $('#pvNav').hidden = n < 2;
  $('#pvPos').textContent = n ? `第 ${PV.i + 1} 張，共 ${n} 張` : '';
  $('#pvPrev').disabled = PV.i === 0; $('#pvNext').disabled = PV.i >= n - 1;
  document.querySelectorAll('.pickrow').forEach(r => r.toggleAttribute('data-cur', +r.dataset.idx === PV.i));
}
(function () {
  const vp = $('#pvView'), st = $('#pvStrip'); let x0 = 0, y0 = 0, dx = 0, dir = null, t0 = 0, id = null;
  vp.addEventListener('pointerdown', e => { if (PV.pages.length < 2) return; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; dir = null; t0 = performance.now() });
  vp.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!dir) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; dir = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (dir === 'x') { vp.setPointerCapture(id); st.style.transition = 'none' } }
    if (dir !== 'x') return;
    dx = mx; let d = dx; const n = PV.pages.length; if ((PV.i === 0 && d > 0) || (PV.i === n - 1 && d < 0)) d /= 3;
    st.style.transform = `translateX(calc(${-PV.i * 100}% + ${d}px))`;
  });
  const end = e => { if (e.pointerId !== id) return; id = null; if (dir !== 'x') return; st.style.transition = '';
    const w = vp.clientWidth, v = Math.abs(dx) / Math.max(1, performance.now() - t0); let ni = PV.i;
    if (Math.abs(dx) > w / 2 || (v > .5 && Math.abs(dx) > 40)) ni += dx < 0 ? 1 : -1; pvGo(ni) };
  vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  $('#pvPrev').onclick = () => pvGo(PV.i - 1); $('#pvNext').onclick = () => pvGo(PV.i + 1);
  $('#dlgPrint').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') pvGo(PV.i - 1); if (e.key === 'ArrowRight') pvGo(PV.i + 1) });
  addEventListener('resize', () => { if ($('#dlgPrint').open) { pvFit(); pvGo(PV.i, false) } });
})();
$('#pGo').onclick = async () => {
  if (!PV.pages.length) return toast('這一批沒有勾選要印的頁面。');
  $('#printArea').innerHTML = PV.pages.map(p => `<div class="a4${PV.land ? ' land' : ''}">${p}</div>`).join('');
  $('#pageSize').textContent = PV.land ? '@page{size:A4 landscape;margin:0}' : '';
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))]) } catch (e) { }   // 等字型載好再印
  window.print();
  if (PV.onPrint) PV.onPrint();
};

/* 憑證列印：預設勾還沒印的，印過的可自己勾回來補印 */
const VP = { batch: 1, chosen: new Set(), open: innerWidth >= 1000 };
$('#pSide').addEventListener('toggle', e => { if (e.target.tagName === 'DETAILS') VP.open = e.target.open }, true);
function startVoucherPrint() {
  const { y, m } = SEL_M.vou, l = printableOf(y, m);
  VP.chosen = new Set(l.filter(v => !v.printed).map(v => v.no));
  VP.batch = l.some(v => isWB(v) && VP.chosen.has(v.no)) || !l.some(v => !isWB(v) && VP.chosen.has(v.no)) ? 1 : 2;
  showVP();
}
function showVP(keep) {
  const { y, m } = SEL_M.vou, l = printableOf(y, m), inB = l.filter(v => VP.batch === 1 ? isWB(v) : !isWB(v));
  const cnt = b => l.filter(v => (b === 1 ? isWB(v) : !isWB(v)) && VP.chosen.has(v.no)).length;
  const selV = inB.filter(v => VP.chosen.has(v.no));
  const tools = `<div class="chips" role="group" aria-label="選擇批次">${[[1, `第 1 批：委辦費・一般紙 ${cnt(1)} 張`], [2, `第 2 批：其他來源・色紙 ${cnt(2)} 張`]].map(([k, t]) => `<button type="button" class="chip" aria-pressed="${VP.batch === k}" data-batch="${k}">${t}</button>`).join('')}</div>
   <p class="hint" style="font-size:15px;margin-top:8px">${VP.batch === 1 ? '這一批用一般紙。' : `印這一批前，請在影印機放 <b>${cnt(2)} 張色紙</b>。`}</p>`;
  const side = `<details class="pickbox" ${VP.open ? 'open' : ''}><summary>要印哪幾張（已勾 ${selV.length}，共 ${inB.length} 張）</summary>
   <p class="hint" style="font-size:14px">還沒印的已先勾好；要補印的，把它勾起來。</p>
   <div class="pickscroll">${inB.map(v => `<div class="pickrow" data-idx="${selV.indexOf(v)}"><label class="check"><input type="checkbox" data-vpick="${esc(v.no)}" ${VP.chosen.has(v.no) ? 'checked' : ''}><span><b>${esc(v.no)}</b> ${esc(v.desc)}<br><span class="meta" style="display:inline">${v.printed ? '已印 ' + esc(v.printedAt) : '還沒印'}・${fmt(v.amount)} 元</span></span></label>${VP.chosen.has(v.no) ? `<button type="button" class="edit" data-jump="${selV.indexOf(v)}">看</button>` : ''}</div>`).join('') || '<p class="hint">這一批沒有憑證。</p>'}</div></details>`;
  openPreview({
    title: `列印憑證（${y} 年 ${m} 月）`, pages: selV.map(voucherSheet), tools, side, keep,
    goText: VP.batch === 1 ? `列印第 1 批（${selV.length} 張）` : `列印第 2 批（${selV.length} 張色紙）`,
    onPrint: () => {
      store.batch(selV.map(v => ({ c: 'vouchers', id: v.no, update: { printed: true, printedAt: TODAY } }))).catch(fail());
      selV.forEach(v => VP.chosen.delete(v.no));
      if (VP.batch === 1 && cnt(2)) { VP.batch = 2; toast(`第 1 批已印好。接著印第 2 批，請先放 ${cnt(2)} 張色紙。`); }
      else toast(`已印 ${selV.length} 張，已標記「已印」。`);
      setTimeout(() => showVP(), 0);
    }
  });
}

/* ===== 新增／修改發票 ===== */
let editId = null, MODE = ls.get('gongtuo.mode') || 'normal';
function vendorsList() { $('#vendors').innerHTML = [...new Set(invoices().filter(i => i.payer !== '主任').map(i => i.payer))].map(v => `<option value="${esc(v)}">`).join('') }
function fillInvForm(x) {
  const y = $('#iY'), m = $('#iM'), d = $('#iD'), c = $('#iCat');
  y.innerHTML = [CY - 1, CY].map(v => `<option value="${v}">民國 ${v} 年</option>`).join('');
  m.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1} 月</option>`).join('');
  d.innerHTML = '<option value="">選日期</option>' + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1} 日</option>`).join('');
  invKeep = x && !cats().some(g => g.items.includes(x.cat)) ? { cat: x.cat, src: x.src } : null;   // 項目已從清單刪掉的舊發票：保留原本的類別和經費來源
  c.innerHTML = '<option value="">請選類別</option>' + cats().filter(g => g.items.length).map(g => `<optgroup label="${esc(g.src)}">${g.items.map(i => `<option>${esc(i)}</option>`).join('')}</optgroup>`).join('') + (invKeep ? `<option value="${esc(invKeep.cat)}">${esc(invKeep.cat)}（已刪除的項目）</option>` : '') + '<option value="__other">其他（自己新增）</option>';
  $('#iOtherSrc').innerHTML = allSrcs().map(s => `<option>${esc(s)}</option>`).join('');
  $('#iPayer').options[0].textContent = `主任代墊（${N.director || '主任'}）`;
  $('#iPayer').value = x ? (x.payer === '主任' ? '主任' : '廠商') : '主任';
  $('#iVendor').value = x && x.payer !== '主任' ? x.payer : '';
  y.value = x ? x.y : CY; m.value = x ? x.m : CM; d.value = x ? x.d : '';
  c.value = x ? x.cat : ''; $('#iDesc').value = x ? x.desc : ''; $('#iFood').value = x ? x.food : '';
  $('#iQty').value = x ? x.qty : 1; $('#iPrice').value = x ? x.price : ''; $('#iOtherName').value = '';
  $('#iDel').hidden = !x; $('#invTitle').textContent = x ? '修改發票' : '新增發票';
  syncInv();
}
function syncInv() {
  $('#iVendorWrap').hidden = $('#iPayer').value !== '廠商';
  const cat = $('#iCat').value, other = cat === '__other';
  $('#iOtherWrap').hidden = !other;
  const src = other ? $('#iOtherSrc').value : (cat ? invSrc(cat) : '');
  $('#iSrc').innerHTML = src ? pill(src) : '選了類別會自動帶出';
  $('#iFoodWrap').hidden = cat !== '幼兒食材';
  if (cat === '幼兒食材' && !$('#iDesc').value) $('#iDesc').value = '幼兒食材';
  $('#iTotal').textContent = fmt((+$('#iQty').value || 1) * (+$('#iPrice').value || 0));
}
['iPayer', 'iCat', 'iOtherSrc'].forEach(id => $('#' + id).addEventListener('change', syncInv));
['iQty', 'iPrice'].forEach(id => $('#' + id).addEventListener('input', syncInv));
function addCategory(name, src) {
  const cs = structuredClone(cats()); const g = cs.find(g => g.src === src);
  if (g) { if (g.items.includes(name)) return; g.items.push(name) } else cs.push({ src, items: [name] });
  store.setSettings({ cats: cs }).catch(fail());
}
// 可以刪的：委辦費-業務費的細項（01 號除外）、自己加的經費來源和類別。餐點、團保、行管費這些系統用到的不給刪
const canDelCat = (src, x) => x !== N.firstItem;
// 刪除類別：只從選單拿掉，已經記過的發票、憑證照舊。01 號的項目不能刪（人事費頁要用）
function delCategory(src, name, btn) {
  const used = S().invoices.filter(x => !x.deleted && x.cat === name).length, bud = +(N.budget || {})[name] || 0;
  const warn = [used ? `已經有 ${used} 張發票用這個項目，舊的發票不受影響，但之後新增發票選不到。` : '', bud ? `這個項目有填預算 ${fmt(bud)} 元，刪除後預算加總會少這一筆，請記得到「委辦費預算」重新分配。` : ''].filter(Boolean).join('');
  ask('你確定要刪除此經費來源嗎？', `<p class="hint">要刪除「${esc(name)}」（${esc(src)}）。${warn}</p><p class="hint">刪錯了可以按提示上的「復原」，或再用「＋ 新增類別」加回來。</p>`, () => {
    const before = structuredClone(cats());
    const cs = before.map(g => g.src === src ? { ...g, items: g.items.filter(x => x !== name) } : g).filter(g => g.items.length || !isCustomSrc(g.src));
    store.setSettings({ cats: cs }).catch(fail());
    if (dirty && btn) btn.closest('.chip')?.remove();          // 設定頁有沒存的修改時畫面不會重畫，先自己拿掉
    toast(`已刪除「${name}」。`, () => { store.setSettings({ cats: before }).catch(fail()); toast('已復原') });
  }, '刪除', 'btn primary');
}
function saveInvoice(data, id) {
  const doc = { ...data, ym: ymNum(data.y, data.m) };
  if (id) return store.update('invoices', id, doc).catch(fail());
  const nid = store.newId('invoices');
  return store.set('invoices', nid, { ...doc, voucher: null, settled: null, deleted: false, createdAt: Date.now() }, false).catch(fail());
}
$('#fInv').addEventListener('submit', e => {
  const payer = $('#iPayer').value === '主任' ? '主任' : $('#iVendor').value.trim();
  let cat = $('#iCat').value; const d = +$('#iD').value, price = +$('#iPrice').value, desc = $('#iDesc').value.trim();
  const y = +$('#iY').value, m = +$('#iM').value;
  let msg = '';
  if (!payer) msg = '請填廠商名稱。'; else if (!d) msg = '請選發票日期。'; else if (d > daysIn(y, m)) msg = `${m} 月沒有 ${d} 日，請再確認日期。`; else if (!cat) msg = '請選類別。';
  else if (cat === '__other' && !$('#iOtherName').value.trim()) msg = '請填新類別名稱。'; else if (!desc) msg = '請填內容。'; else if (!(price > 0)) msg = '單價要大於 0。';
  if (msg) { e.preventDefault(); toast(msg); return }
  let src;
  if (cat === '__other') { cat = $('#iOtherName').value.trim(); src = $('#iOtherSrc').value; addCategory(cat, src) } else src = invSrc(cat);
  saveInvoice({ y, m, d, payer, cat, src, desc, qty: +$('#iQty').value || 1, price, food: cat === '幼兒食材' ? $('#iFood').value.trim() : '' }, editId);
  toast(editId ? '已儲存' : payer === '主任' ? '已儲存，也列進零用金清單了。' : '已儲存。');
});
$('#iDel').onclick = () => {
  const id = editId; $('#dlgInv').close(); sel.delete(id);
  store.update('invoices', id, { deleted: true, deletedAt: Date.now() }).catch(fail('沒有刪除成功，請再試一次。'));
  toast('已刪除，30 天內可以在垃圾桶救回。', () => { store.update('invoices', id, { deleted: false, deletedAt: null }).catch(fail()); toast('已復原') });
};

/* 一步一步模式 */
const W = {};
function openWiz() {
  Object.assign(W, { step: 0, payer: '', vendor: '', y: CY, m: CM, d: 0, cat: '', src: '', desc: '', food: '', qty: 1, price: '', err: '', done: false, other: false, otherName: '', otherSrc: '營運收入支應-業務費' });
  vendorsList(); wizRender(); if (!$('#dlgWiz').open) $('#dlgWiz').showModal();
}
const wizSteps = () => ['payer', ...(W.payer === '廠商' ? ['vendor'] : []), 'date', 'cat', 'what', 'money', 'confirm'];
function wizSummary() {
  return `<dl class="sumlist"><dt>誰付的</dt><dd>${W.payer === '主任' ? '主任代墊（' + esc(N.director || '主任') + '）' : esc(W.vendor)}</dd>
  <dt>日期</dt><dd>${W.y} 年 ${W.m} 月 ${W.d} 日</dd>
  <dt>類別</dt><dd>${esc(W.cat)}<br>${pill(W.src)}</dd>
  <dt>${W.cat === '幼兒食材' ? '食材' : '品名'}</dt><dd>${esc(W.cat === '幼兒食材' ? W.food : W.desc)}</dd>
  <dt>金額</dt><dd>${W.qty > 1 ? `${W.qty} × ${fmt(W.price)} = ` : ''}${fmt(W.qty * W.price)} 元</dd></dl>`;
}
function wizRender() {
  const steps = wizSteps(), key = W.done ? 'done' : steps[W.step], n = steps.length;
  const err = W.err ? `<p class="err" role="alert">${esc(W.err)}</p>` : '';
  const inv_ = W.err ? 'class="invalid"' : '';
  const next = '<div class="actions"><button type="button" class="btn primary" data-wiz="next" style="min-height:52px;min-width:140px;font-size:18px">下一步</button></div>';
  let b = '';
  switch (key) {
    case 'payer': b = `<h2>這張發票是誰付的錢？</h2><div class="bigopts">
      <button type="button" class="bigopt" data-wiz="payer" data-v="主任" aria-pressed="${W.payer === '主任'}"><span>主任代墊<br><small>${esc(N.director || '主任')}先付，會列進零用金</small></span><span aria-hidden="true">›</span></button>
      <button type="button" class="bigopt" data-wiz="payer" data-v="廠商" aria-pressed="${W.payer === '廠商'}"><span>付給廠商<br><small>直接付款給店家</small></span><span aria-hidden="true">›</span></button></div>`; break;
    case 'vendor': b = `<h2>付給哪一家廠商？</h2><label>廠商名稱<input type="text" id="wVendor" list="vendors" value="${esc(W.vendor)}" placeholder="例如：清涼冷氣工程行" ${inv_}></label>${err}${next}`; break;
    case 'date': {
      const dim = daysIn(W.y, W.m);
      b = `<h2>發票上的日期是哪一天？</h2><div class="srcline" style="font-size:17px">民國 ${W.y} 年 <select id="wM" style="width:auto;font-size:17px" aria-label="月份">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${W.m === i + 1 ? 'selected' : ''}>${i + 1} 月</option>`).join('')}</select>　點一下日期</div>
      <div class="daygrid">${Array.from({ length: dim }, (_, i) => `<button type="button" data-wiz="day" data-v="${i + 1}" aria-pressed="${W.d === i + 1}">${i + 1}</button>`).join('')}</div>`; break;
    }
    case 'cat': b = `<h2>買的是哪一類？</h2><div style="display:flex;flex-direction:column;gap:6px"><div class="title">常用</div><div class="catgrid">${COMMON.filter(i => cats().some(g => g.items.includes(i))).map(i => `<button type="button" data-wiz="cat" data-v="${esc(i)}" aria-pressed="${W.cat === i}">${esc(i)}</button>`).join('')}</div></div><p class="hint" style="font-size:15px">找不到的話，往下看全部類別。</p>${cats().filter(g => g.items.length).map(g => `<div style="display:flex;flex-direction:column;gap:6px"><div>${pill(g.src)}</div><div class="catgrid">${g.items.map(i => `<button type="button" data-wiz="cat" data-v="${esc(i)}" aria-pressed="${W.cat === i}">${esc(i)}</button>`).join('')}</div></div>`).join('')}
      <div class="catgrid"><button type="button" data-wiz="cat" data-v="__other" aria-pressed="${W.other}">其他（自己新增）</button></div>
      ${W.other ? `<label>新類別名稱<input type="text" id="wOther" value="${esc(W.otherName)}" ${inv_}></label><label>經費來源<select id="wOtherSrc">${Object.keys(SRC_CLS).map(s => `<option ${s === W.otherSrc ? 'selected' : ''}>${s}</option>`).join('')}</select></label>${err}${next}` : ''}`; break;
    case 'what': b = W.cat === '幼兒食材'
      ? `<h2>這張幼兒食材的發票買了哪些食材？</h2><label>食材（用頓號分開，會列在食材費統計）<input type="text" id="wFood" value="${esc(W.food)}" placeholder="例如：豬瘦絞肉、絲瓜" ${inv_}></label>${err}${next}`
      : `<h2>買了什麼？</h2><label>品名（會寫在憑證和結報清單上）<input type="text" id="wDesc" value="${esc(W.desc)}" placeholder="例如：光泉豆漿" ${inv_}></label>${err}${next}`; break;
    case 'money': b = `<h2>多少錢？</h2><div class="two"><label>數量<input type="number" inputmode="numeric" id="wQty" value="${W.qty}" min="1"></label><label>單價（元）<input type="number" inputmode="numeric" id="wPrice" value="${W.price}" placeholder="0" ${inv_}></label></div><div class="totalline"><span>總價</span><b id="wTotal">${fmt((+W.qty || 1) * (+W.price || 0))}</b></div>${err}${next}`; break;
    case 'confirm': b = `<h2>請確認，沒問題就按「儲存」</h2>${wizSummary()}<p class="hint" style="font-size:15px">要改哪一項，按左上角「‹ 上一步」回去改。</p><div class="actions"><button type="button" class="btn primary" data-wiz="save" style="min-height:52px;min-width:140px;font-size:18px">儲存</button></div>`; break;
    case 'done': b = `<div class="donecheck" aria-hidden="true">✓</div><h2 style="text-align:center;justify-content:center">已儲存</h2>${wizSummary()}<p class="hint" style="font-size:15px">${W.payer === '主任' ? '也已經列進零用金結報清單。' : '付給廠商的發票不會列進零用金。'}</p>
      <div class="actions"><button type="button" class="btn" data-wiz="close">完成</button><button type="button" class="btn primary" data-wiz="again">再新增一張</button></div>`; break;
  }
  $('#wizBody').innerHTML = `<div class="wiztop">${W.step > 0 && !W.done ? '<button type="button" class="back" data-wiz="back">‹ 上一步</button>' : ''}<span class="prog">${W.done ? '' : `第 ${W.step + 1} 步，共 ${n} 步`}</span>${W.done ? '' : '<button type="button" class="btn" data-wiz="close">關閉</button>'}</div>${b}`;
  const f = $('#wizBody input'); if (f && !('ontouchstart' in window)) f.focus();
}
function wizNext() {
  const key = wizSteps()[W.step]; W.err = '';
  if (key === 'vendor') { W.vendor = $('#wVendor').value.trim(); if (!W.vendor) W.err = '請填廠商名稱。' }
  if (key === 'cat') { W.otherName = $('#wOther').value.trim(); W.otherSrc = $('#wOtherSrc').value; if (!W.otherName) W.err = '請填新類別名稱。'; else { W.cat = W.otherName; W.src = W.otherSrc } }
  if (key === 'what') { if (W.cat === '幼兒食材') { W.food = $('#wFood').value.trim(); W.desc = '幼兒食材'; if (!W.food) W.err = '請填這張發票買了哪些食材。' } else { W.desc = $('#wDesc').value.trim(); if (!W.desc) W.err = '請填品名。' } }
  if (key === 'money') { W.qty = +$('#wQty').value || 1; W.price = +$('#wPrice').value || 0; if (!(W.price > 0)) W.err = '請填單價，要大於 0。' }
  if (!W.err) W.step++;
  wizRender();
}
function wizClick(t) {
  const a = t.dataset.wiz, v = t.dataset.v;
  if (a === 'back') { W.step--; W.err = ''; return wizRender() }
  if (a === 'close') { $('#dlgWiz').close(); return render() }
  if (a === 'again') { return openWiz() }
  if (a === 'payer') { W.payer = v; W.step++; return wizRender() }
  if (a === 'day') { W.d = +v; W.step++; return wizRender() }
  if (a === 'cat') { if (v === '__other') { W.other = true; W.err = ''; return wizRender() } W.other = false; W.cat = v; W.src = srcOf(v); if (v === '幼兒食材') W.desc = '幼兒食材'; W.step++; return wizRender() }
  if (a === 'next') return wizNext();
  if (a === 'save') {
    if (W.other) addCategory(W.cat, W.src);
    saveInvoice({ y: W.y, m: W.m, d: W.d, payer: W.payer === '主任' ? '主任' : W.vendor, cat: W.cat, src: W.src, desc: W.desc, qty: W.qty, price: W.price, food: W.cat === '幼兒食材' ? W.food : '' });
    W.done = true; return wizRender();
  }
}
$('#dlgWiz').addEventListener('change', e => { if (e.target.id === 'wM') { W.m = +e.target.value; if (W.d > daysIn(W.y, W.m)) W.d = 0; wizRender() } });
$('#dlgWiz').addEventListener('input', e => { if (e.target.id === 'wQty' || e.target.id === 'wPrice') $('#wTotal').textContent = fmt((+$('#wQty').value || 1) * (+$('#wPrice').value || 0)) });
$('#dlgWiz').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); wizNext() } });

/* ===== 合併成憑證 ===== */
const autoDesc = list => { const cat = list[0].cat; if (cat === '幼兒食材') return '幼兒食材'; return cat + '：' + [...new Set(list.map(x => x.desc))].join('、'); };
function openMerge() {
  const list = [...sel].map(id => S().invoices.find(x => x.id === id)).filter(Boolean).sort((a, b) => a.ym - b.ym || a.d - b.d);
  $('#mNo').textContent = nextNo();
  $('#mPayee').textContent = list[0].payer === '主任' ? (N.director || '主任') + '（主任代墊）' : list[0].payer;
  $('#mSrc').innerHTML = pill(list[0].src);
  $('#mDesc').value = autoDesc(list); $('#mNote').value = '';
  $('#mCount').textContent = list.length; $('#mAmt').textContent = fmt(list.reduce((a, x) => a + amt(x), 0));
  $('#dlgMerge').showModal();
}
async function createInvVoucher(list, desc, note) {
  for (let tries = 0; tries < 3; tries++) {
    const f = list[0], no = nextNo();
    const v = { no, y: CY, m: CM, ym: CYM, payee: f.payer === '主任' ? (N.director || '主任') : f.payer, src: f.src, desc, note: note || '', amount: list.reduce((a, x) => a + amt(x), 0), ids: list.map(x => x.id), kind: 'inv', cat: f.cat, printed: false, printedAt: '', deleted: false, createdAt: Date.now() };
    try { await store.createVoucher(v, v.ids); return v; }
    catch (e) { if (e.code !== 'taken') throw e; await new Promise(r => setTimeout(r, 600)); }
  }
  throw { code: 'taken-again' };
}
$('#fMerge').addEventListener('submit', e => {
  e.preventDefault();
  const list = [...sel].map(id => S().invoices.find(x => x.id === id)).filter(Boolean).sort((a, b) => a.ym - b.ym || a.d - b.d);
  const btn = $('#mGo'); btn.setAttribute('aria-disabled', 'true'); btn.textContent = '建立中…';
  createInvVoucher(list, $('#mDesc').value.trim(), $('#mNote').value.trim())
    .then(v => { sel.clear(); $('#dlgMerge').close(); render(); toast(`已建立憑證 ${v.no}。要印的時候到「更多 → 憑證與列印」。`) })
    .catch(fail('沒有建立成功，請確認網路後再按一次。'))
    .finally(() => { btn.removeAttribute('aria-disabled'); btn.textContent = '建立憑證' });
});
async function createHrVoucher(data) {
  for (let tries = 0; tries < 3; tries++) {
    const v = { no: nextNo(SEL_M.staff.y, SEL_M.staff.m), y: SEL_M.staff.y, m: SEL_M.staff.m, ym: ymNum(SEL_M.staff.y, SEL_M.staff.m), kind: 'hr', cat: null, note: '', printed: false, printedAt: '', deleted: false, createdAt: Date.now(), ...data };
    try { await store.createVoucher(v, []); return v; }
    catch (e) { if (e.code !== 'taken') throw e; await new Promise(r => setTimeout(r, 600)); }
  }
  throw { code: 'taken-again' };
}

/* ===== 孩子 ===== */
let kidId = null;
function kidFields() { return { days: $('#kDays').value === '' ? '' : +$('#kDays').value, late: $('#kLate').value === '' ? '' : +$('#kLate').value, ins: $('#kIns').value === '' ? '' : +$('#kIns').value, refund: $('#kRefund').value === '' ? '' : +$('#kRefund').value } }
function kidSync() {
  const { y, m } = SEL_M.fee;
  const k = { birth: $('#kBirth').value };
  const f = kidFields(), c = kidCalc(k, f, y, m);
  $('#kCalc').textContent = `月費 ${fmt(c.fee)}＋餐點費 ${fmt(c.meal)}${+f.late ? `＋延托 ${fmt(f.late)}` : ''}${+f.ins ? `＋保險 ${fmt(f.ins)}` : ''}${+f.refund ? `－退費 ${fmt(-f.refund)}` : ''}`;
  $('#kTotal').textContent = fmt(c.total);
  if (k.birth) $('#kInfo').textContent = mealInfo(c, y, m);
}
const mealInfo = (c, y, m) => `${y} 年 ${m} 月・到 ${m}/1 滿 ${Math.max(0, c.am)} 個月，${c.am < 6 ? '未滿 6 個月不收餐點費' : c.am < 12 ? '餐點費 300 元' : '餐點費 600 元'}`;
function openKid(id) {
  const { y, m } = SEL_M.fee; kidId = id;
  const k = id ? S().kids.find(x => x.id === id) : null, f = id ? ((monthDoc(y, m).fees || {})[id] || {}) : {};
  const nextSeat = Math.max(0, ...activeKids().map(x => +x.seat || 0)) + 1;
  $('#kTitle').textContent = k ? `${k.seat}. ${k.name}` : '新增幼兒';
  const c = k ? kidCalc(k, f, y, m) : null;
  $('#kInfo').textContent = k ? mealInfo(c, y, m) : '填座號、姓名和生日，月費和餐點費會自動算。';
  $('#kBasic').open = !k;
  $('#kSeat').value = k ? k.seat : nextSeat; $('#kName').value = k ? k.name : ''; $('#kBirth').value = k ? k.birth || '' : '';
  $('#kDays').value = f.days ?? ''; $('#kLate').value = f.late ?? ''; $('#kIns').value = f.ins ?? ''; $('#kRefund').value = f.refund ?? ''; $('#kNote').value = '';
  $('#kLeave').hidden = !k || k.active === false; $('#kRcpt').hidden = !k;
  kidSync(); $('#dlgKid').showModal();
}
['kDays', 'kLate', 'kIns', 'kRefund', 'kBirth'].forEach(id => $('#' + id).addEventListener('input', kidSync));
$('#fKid').addEventListener('submit', e => {
  const { y, m } = SEL_M.fee;
  const name = $('#kName').value.trim(), seat = +$('#kSeat').value, birth = $('#kBirth').value, f = kidFields();
  let msg = '';
  if (!name) msg = '請填姓名。'; else if (!(seat > 0)) msg = '請填座號。'; else if (!birth) msg = '請填生日，餐點費要依生日計算。'; else if (+f.refund > 0) msg = '退費請填負數，例如 -800。';
  if (msg) { e.preventDefault(); $('#kBasic').open = true; toast(msg); return }
  const id = kidId || store.newId('kids');
  const ops = [{ c: 'kids', id, data: { seat, name, birth, active: true } }];
  const note = $('#kNote').value.trim(), d = monthDoc(y, m);
  const patch = { y, m, fees: { [id]: f } };
  if (note) patch.noteMap = { ['n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)]: { kid: id, text: note, at: Date.now() } };
  ops.push({ c: 'months', id: ymKey(y, m), data: patch });
  store.batch(ops).catch(fail());
  toast('已儲存');
});
$('#kLeave').onclick = () => {
  const k = S().kids.find(x => x.id === kidId); $('#dlgKid').close();
  ask('畢業／離開', `<p class="hint">${esc(k.name)} 從下個月起不會出現在月費名單，這個月的資料保留。</p>`, () => {
    const { y, m } = SEL_M.fee;
    store.batch([{ c: 'kids', id: k.id, data: { active: false, leftAt: ymKey(y, m) } }, { c: 'months', id: ymKey(y, m), data: { y, m, fees: { [k.id]: (monthDoc(y, m).fees || {})[k.id] || {} } } }]).catch(fail());
    toast(`已設定 ${k.name} 離開。`);
  }, '確定');
};
$('#kRcpt').onclick = () => {
  const { y, m } = SEL_M.fee, k = S().kids.find(x => x.id === kidId);
  const kids = monthKids(y, m), i = kids.indexOf(k), no = receiptNos(y, m, kids)[i];
  $('#dlgKid').close();
  openPreview({ title: `收據：${k.name}`, pages: [receiptPage({ ...k, birth: $('#kBirth').value || k.birth }, no, y, m)] });
};

/* ===== 通用對話框 ===== */
function ask(title, body, onOk, okText, okClass) {
  $('#aTitle').textContent = title; $('#aBody').innerHTML = body; $('#aOk').textContent = okText || '確定'; $('#aOk').className = okClass || 'btn primary';
  $('#fAsk').onsubmit = e => { if (onOk() === false) e.preventDefault() };
  $('#dlgAsk').showModal();
}
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
// 點視窗外面關閉：只有真的點在框外才算（框內的空白邊不算）；
// 有輸入東西的視窗（發票、幼兒、建立憑證、一步一步、簡單表單）打了字就不會因為點外面或按 Esc 而不見，要按「取消」才放棄
const GUARDED = ['dlgInv', 'dlgKid', 'dlgMerge', 'dlgWiz', 'dlgAsk'];
const isDirty = d => d.dataset.dirty === '1';
const KEEP_MSG = '還沒儲存，打的內容都還在。要放棄這次輸入，請按「取消」。';
document.querySelectorAll('dialog:not(#dlgAlert)').forEach(d => {
  d.addEventListener('click', e => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) return;
    if (GUARDED.includes(d.id) && isDirty(d)) return toast(KEEP_MSG);
    d.close();
  });
  if (!GUARDED.includes(d.id)) return;
  const mark = e => { if (e.target.matches('input,select,textarea')) d.dataset.dirty = '1' };
  d.addEventListener('input', mark); d.addEventListener('change', mark);
  d.addEventListener('cancel', e => { if (isDirty(d)) { e.preventDefault(); toast(KEEP_MSG) } });   // Esc、Android 返回鍵
  d.addEventListener('close', () => { d.dataset.dirty = '' });
});
// 一步一步模式：選過任何一步就算有輸入，完成儲存後就不算
$('#dlgWiz').addEventListener('click', e => { const b = e.target.closest('[data-wiz]'); if (!b) return; const a = b.dataset.wiz; if (['payer', 'day', 'cat', 'next'].includes(a)) $('#dlgWiz').dataset.dirty = '1'; if (a === 'save' || a === 'again') $('#dlgWiz').dataset.dirty = '' }, true);
$('#dlgAlert').addEventListener('cancel', e => { e.preventDefault(); toast('請先勾選「我已了解」，再按「已了解」。') });
$('#alertOk').addEventListener('change', e => $('#alertGo').setAttribute('aria-disabled', String(!e.target.checked)));
$('#fAlert').addEventListener('submit', e => { if (!$('#alertOk').checked) { e.preventDefault(); toast('請先勾選「我已了解」，再按「已了解」。'); return } ls.set('gongtuo.ack.' + NID, TODAY_ISO) });

/* ===== 結算 ===== */
function doSettle() {
  const po = sortPetty(pettyOpen());
  const n = S().settlements.filter(s => s.y === CY && s.m === CM).length + 1;
  const id = store.newId('settlements');
  const rows = po.map(x => ({ m: x.m, d: x.d, cat: x.cat, desc: x.desc, qty: x.qty, price: x.price, voucher: x.voucher || '' }));
  const total = po.reduce((a, x) => a + amt(x), 0);
  store.batch([{ c: 'settlements', id, data: { n, y: CY, m: CM, date: TODAY, ids: po.map(x => x.id), rows, total, createdAt: Date.now() }, merge: false },
  ...po.map(x => ({ c: 'invoices', id: x.id, update: { settled: id } }))]).catch(fail());
  toast(`已結算 ${CM} 月第 ${n} 次，可以在「已結算」列印清單。`);
}

/* ===== 匯出、備份 ===== */
// 管理者月底備份：每月 25 號起提醒下載這個月的；1–24 號還沒下載上個月的也會提醒。記在這台裝置
const allBkTarget = () => CD >= 25 ? ymNum(CY, CM) : (({ y, m }) => ymNum(y, m))(shiftYM(CY, CM, -1));
const allBkDone = () => +(ls.get('gongtuo.allbk') || 0);
const needAllBk = () => ADMIN && allBkDone() < allBkTarget();
// 用別間公托的資料暫時算報表（年度報表的函式都讀目前的 store 和 N）
function withNursery(n, data, fn) {
  const sv = store, sn = NID;
  store = { state: { settings: null, invoices: [], vouchers: [], settlements: [], kids: [], months: {}, incomes: [], ...data, loaded: {} } }; NID = n; refreshN();
  try { return fn() } finally { store = sv; NID = sn; refreshN() }
}
async function backupAll() {
  if (!ADMIN) return;
  if (!navigator.onLine && !DEMO) return toast('下載四間的資料需要網路。');
  toast('正在準備四間公托的資料…');
  try {
    const ids = Object.keys(NURSERIES), all = {};
    for (const n of ids) all[n] = await store.fetchAll(n);
    const { writeXlsx } = await import('./xlsx.js');
    const sheets = ids.map(n => withNursery(n, all[n], () => ({ ...annualSheet(annual(CY)), name: `${N.short}每月報表` })));
    const a = download(`四間公托每月報表-${CY}年-${TODAY_ISO}.xlsx`, writeXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await new Promise(r => setTimeout(r, 600));
    const b = download(`經費備份-四間公托-${TODAY_ISO}.json`, JSON.stringify({ app: 'gongtuo-fund', version: VERSION, kind: 'all', exportedAt: new Date().toISOString(), nurseries: all }, null, 1), 'application/json');
    if (a && b) { ls.set('gongtuo.allbk', String(allBkTarget())); render(); toast('已下載兩個檔案：四間的每月報表（Excel）和四間的備份（還原用）。請存到電腦或雲端硬碟。') }
  } catch (e) { console.error(e); toast('下載沒有完成，請確認網路後再試一次。') }
}
function download(name, text, type) {
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return true }
  catch (e) { toast('下載沒有成功，請再試一次。'); return false }
}
const csv = rows => '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
function exportBiz() {
  const cols = [...wbItems(), '營運收入支應', '餐點費', '兒童團體保險', '提升托育品質', '行管費'];
  const colOf = v => v.src === '委辦費-業務費' ? v.cat : v.src === '營運收入支應-餐點費' ? '餐點費' : v.src === '營運收入支應-兒童團體保險' ? '兒童團體保險' : v.src.startsWith('提升') ? '提升托育品質' : v.src === '委辦費-行管費' ? '行管費' : '營運收入支應';
  const list = vouchers().filter(v => v.y === CY && v.kind === 'inv').sort((a, b) => a.no.localeCompare(b.no));
  const rows = [['支出憑證編號', '廠商/代墊/受款人', '經費來源', '用途說明', ...cols, '總計']];
  for (const v of list) rows.push([v.no, v.payee, v.src, v.desc, ...cols.map(c => colOf(v) === c ? v.amount : ''), v.amount]);
  rows.push(['合計', '', '', '', ...cols.map(c => list.filter(v => colOf(v) === c).reduce((a, v) => a + v.amount, 0)), list.reduce((a, v) => a + v.amount, 0)]);
  if (download(`${N.short}業務費經費明細-${CY}年.csv`, csv(rows), 'text/csv')) toast('已匯出，Excel 可以直接開啟。');
}
const BK_COLS = ['invoices', 'vouchers', 'settlements', 'kids', 'incomes'];
async function backup(label = '') {
  if (!navigator.onLine && !DEMO) { toast('下載備份需要網路，才能拿到完整的資料。'); return false }
  toast('正在準備備份…');
  try {
    const all = await store.fetchAll();
    const data = { app: 'gongtuo-fund', version: VERSION, nursery: NID, exportedAt: new Date().toISOString(), ...all };
    const ok = download(`經費備份-${N.short}-${TODAY_ISO}${label}.json`, JSON.stringify(data, null, 1), 'application/json');
    if (ok) toast(label ? '已先下載目前資料的備份。' : '備份已下載，請存到電腦。');
    return ok;
  } catch (e) { console.error(e); toast('備份沒有成功，請確認網路後再試一次。'); return false }
}
// 從備份還原：同一筆資料改回備份當時的內容；備份之後才新增的資料保留，不刪除
function checkBackup(d) {
  if (!d || typeof d !== 'object' || !d.nursery || !d.exportedAt) return '這個檔案不是經費記帳的備份。';
  if (!NURSERIES[d.nursery]) return '這個檔案不是經費記帳的備份。';
  if (d.nursery !== NID) return `這是${NURSERIES[d.nursery].short}公托的備份，不能還原到${N.short}公托。`;
  for (const c of BK_COLS) if (d[c] != null && !Array.isArray(d[c])) return '備份檔案的內容不完整，沒辦法還原。';
  if (d.months != null && typeof d.months !== 'object') return '備份檔案的內容不完整，沒辦法還原。';
  return '';
}
async function restoreFrom(d) {
  const ops = [];
  for (const c of BK_COLS) for (const x of d[c] || []) { if (!x || !x.id) continue; const { id, ...data } = x; ops.push({ c, id: String(id), data, merge: false }); }
  for (const [id, x] of Object.entries(d.months || {})) { if (!x) continue; const { id: _, ...data } = x; ops.push({ c: 'months', id, data, merge: false }); }
  if (d.settings) await store.setSettings(d.settings);
  for (let i = 0; i < ops.length; i += 400) { await store.batch(ops.slice(i, i + 400)); toast(`還原中…（${Math.min(i + 400, ops.length)} / ${ops.length}）`); }
  return ops.length;
}
$('#restoreFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let d; try { d = JSON.parse(await f.text()) } catch (x) { return toast('這個檔案打不開，請確認是下載的備份檔（.json）。') }
  if (d && d.kind === 'all' && d.nurseries) {          // 管理者下載的四間合併備份：取出目前這間
    if (!d.nurseries[NID]) return toast(`這個備份裡沒有${N.short}公托的資料。`);
    d = { ...d.nurseries[NID], app: d.app, version: d.version, nursery: NID, exportedAt: d.exportedAt };
  }
  const bad = checkBackup(d); if (bad) return toast(bad);
  const cnt = c => (d[c] || []).length, when = new Date(d.exportedAt);
  ask('從備份還原', `<p class="hint">備份時間：${when.getFullYear() - 1911} 年 ${when.getMonth() + 1} 月 ${when.getDate()} 日 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}<br>發票 ${cnt('invoices')} 張、憑證 ${cnt('vouchers')} 張、幼兒 ${cnt('kids')} 位。</p>
    <p class="hint">還原後，備份裡有的資料會改回備份當時的內容；備份之後才新增的資料會保留，不會被刪掉。</p>
    <p class="hint">按「還原」後，會先自動下載一份目前資料的備份，萬一還原錯了還可以再還原回來。</p>`, () => {
    if (!navigator.onLine && !DEMO) { toast('還原需要網路，請連上網路後再試一次。'); return false }
    (async () => {
      if (!(await backup('-還原前'))) return toast('目前資料的備份沒有下載成功，所以沒有還原。');
      try { const n = await restoreFrom(d); toast(`已還原 ${n} 筆資料。`) }
      catch (x) { console.error(x); toast('還原沒有完成，請確認網路後再試一次。已寫入的部分會保留。') }
    })();
  }, '還原', 'btn danger');
});

/* ===== 事件 ===== */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'undoBtn') { const f = UNDO; UNDO = null; $('#toast').hidden = true; return f && f() }
  if (t.dataset.wiz) return wizClick(t);
  if (t.id === 'helpQ') { helpTopic = HELP_OF[view] || ''; return go('help') }
  if (t.dataset.helpto) { const el = $('#h-' + t.dataset.helpto); return el && el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }
  if (t.dataset.go === 'bkall') { go('set'); const c = $('#bkCard'); if (c) { c.open = true; c.scrollIntoView({ block: 'start' }) } return }
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.view && t.classList.contains('tab')) return go(t.dataset.view);
  if (t.dataset.mode) { MODE = t.dataset.mode; ls.set('gongtuo.mode', MODE); render(); return toast(MODE === 'step' ? '已改成一步一步模式（只有這台裝置）。' : '已改成一般模式（只有這台裝置）。') }
  if (t.dataset.mnav && dirty && view === 'staff') return leaveGuard(() => t.click());
  if (t.dataset.mnav) { FP = null; const s = SEL_M[t.dataset.mnav], d = +t.dataset.d; const r = d === 0 ? { y: CY, m: CM } : shiftYM(s.y, s.m, d); s.y = r.y; s.m = r.m; dirty = false; return render() }
  if (t.dataset.sel) { const id = t.dataset.sel; sel.has(id) ? sel.delete(id) : sel.add(id); t.setAttribute('aria-checked', sel.has(id)); return updateMerge() }
  if (t.dataset.edit) { editId = t.dataset.edit; vendorsList(); fillInvForm(S().invoices.find(x => x.id === editId)); return $('#dlgInv').showModal() }
  if (t.dataset.filter) { invFilter = t.dataset.filter; sel.clear(); return render() }
  if (t.dataset.cash) { cashTab = t.dataset.cash; return render() }
  if (t.dataset.batch) { VP.batch = +t.dataset.batch; return showVP() }
  if (t.dataset.jump !== undefined) return pvGo(+t.dataset.jump);
  if (t.dataset.kid) return openKid(t.dataset.kid);
  if (t.id === 'fpStart') { FP = FP ? null : new Set(); FPD = ''; return render() }
  if (t.dataset.fpick) { if (!FP) return; const id = t.dataset.fpick; FP.has(id) ? FP.delete(id) : FP.add(id); return fpSync() }
  if (t.id === 'fpAll') { const { y, m } = SEL_M.fee; monthKids(y, m).forEach(k => FP.add('k:' + k.id)); return fpSync() }
  if (t.id === 'fpCancel') { FP = null; FPD = ''; return render() }
  if (t.id === 'fpApply') return t.getAttribute('aria-disabled') === 'true' ? toast('請先勾選收據。') : fpApply();
  if (t.dataset.delcat) return delCategory(t.dataset.delsrc, t.dataset.delcat, t);
  if (t.dataset.xrnew) { const { y, m } = SEL_M.fee; return openXR(y, m, t.dataset.xrnew) }
  if (t.dataset.xr) { const { y, m } = SEL_M.fee; return openXR(y, m, null, t.dataset.xr) }
  if (t.dataset.xrprint) { const { y, m } = SEL_M.fee; return printXR(y, m, t.dataset.xrprint) }
  if (t.dataset.xrdel) {
    const { y, m } = SEL_M.fee, id = t.dataset.xrdel, r = (monthDoc(y, m).xr || {})[id]; $('#dlgAsk').close();
    store.set('months', ymKey(y, m), { y, m, xr: { [id]: null } }).catch(fail());
    return toast(r && r.no ? `已刪除收據 ${rcptNo(r.no)}。這個號碼不會再用到，紙本請註明作廢。` : '已刪除收據。', () => { store.set('months', ymKey(y, m), { y, m, xr: { [id]: r } }).catch(fail()); toast('已復原') });
  }
  if (t.id === 'rDateReset') { const { y, m } = SEL_M.fee; store.set('months', ymKey(y, m), { y, m, rcptDate: null }).catch(fail()); const r = autoReceiptDate(y, m); return toast(`${m} 月收據日期改回 ${r.m}/${r.d}。`) }
  if (t.dataset.printv) { const v = S().vouchers.find(x => x.no === t.dataset.printv); return openPreview({ title: `支出憑證 ${v.no}`, pages: [voucherSheet(v)], onPrint: () => store.update('vouchers', v.no, { printed: true, printedAt: TODAY }).catch(fail()) }) }
  if (t.dataset.cancelv) {
    const v = S().vouchers.find(x => x.no === t.dataset.cancelv);
    return ask(`取消憑證 ${v.no}`, `<p class="hint">${esc(v.desc)}，${fmt(v.amount)} 元。取消後${v.kind === 'inv' ? '這些發票會回到「還沒做憑證」，' : ''}憑證放進垃圾桶 30 天，可以救回。編號不會被重複使用。</p>`, () => {
      store.batch([{ c: 'vouchers', id: v.no, update: { deleted: true, deletedAt: Date.now() } }, ...(v.ids || []).map(id => ({ c: 'invoices', id, update: { voucher: null } }))]).catch(fail());
      toast(`已取消 ${v.no}。`);
    }, '取消這張憑證', 'btn danger');
  }
  if (t.dataset.restorei) { store.update('invoices', t.dataset.restorei, { deleted: false, deletedAt: null }).catch(fail()); toast('已救回這張發票。'); return }
  if (t.dataset.restorev) {
    const v = S().vouchers.find(x => x.no === t.dataset.restorev);
    const bad = (v.ids || []).some(id => { const x = S().invoices.find(i => i.id === id); return !x || x.voucher || x.deleted; });
    if (bad) return toast('這張憑證的發票已經做成別的憑證或被刪除，沒辦法救回。請重新勾選發票建立。');
    store.batch([{ c: 'vouchers', id: v.no, update: { deleted: false, deletedAt: null } }, ...(v.ids || []).map(id => ({ c: 'invoices', id, update: { voucher: v.no } }))]).catch(fail()); toast(`已救回 ${v.no}。`);
    return;
  }
  if (t.dataset.printset) { const s = S().settlements.find(x => x.id === t.dataset.printset); return openPreview({ title: `代墊金結報清單（${s.m} 月第 ${s.n} 次）`, pages: [cashSheet(s.rows, `${s.m} 月第 ${s.n} 次結算（${s.date}）`, s.y, s.m)] }) }
  if (t.dataset.delnote) {
    const { y, m } = SEL_M.fee, key = t.dataset.delnote, d = monthDoc(y, m);
    if (key.startsWith('old')) {      // 舊資料的備註陣列
      const notes = [...(d.notes || [])], i = +key.slice(3), n = notes[i];
      notes.splice(i, 1); store.set('months', ymKey(y, m), { y, m, notes }).catch(fail());
      return toast('已刪除備註。', () => { const cur = [...(monthDoc(y, m).notes || [])]; cur.splice(i, 0, n); store.set('months', ymKey(y, m), { y, m, notes: cur }).catch(fail()); toast('已復原') });
    }
    const n = (d.noteMap || {})[key];
    store.set('months', ymKey(y, m), { y, m, noteMap: { [key]: null } }).catch(fail());
    return toast('已刪除備註。', () => { store.set('months', ymKey(y, m), { y, m, noteMap: { [key]: n } }).catch(fail()); toast('已復原') });
  }
  if (t.dataset.delincome) { const id = t.dataset.delincome; return ask('刪除撥款收入', '<p class="hint">確定要刪除這筆撥款收入嗎？</p>', () => { store.remove('incomes', id).catch(fail()); toast('已刪除。') }, '刪除', 'btn danger') }
  if (t.dataset.split) {
    const { y, m } = SEL_M.staff, rows = payrollRows(y, m), r = rows[+t.dataset.split];
    const remain = Math.max(0, (+N.wbPersonBudget || 0) - wbPersonUsed());
    return ask(`拆單：${r.name}`, `<p class="hint">本月薪資 ${fmt(r.amount)} 元。委辦費付的部分留在原本的編號，另一部分會建立一張新的憑證（營運收入支應-人事費），編號接在這個月最新一號之後。</p>
     <label>委辦費-人事費支付<input type="number" inputmode="numeric" id="spA" data-sp="${+r.amount || 0}" value="${Math.min(+r.amount || 0, remain)}"></label>
     <div class="totalline"><span>營運收入支應-人事費支付</span><b id="spB">${fmt((+r.amount || 0) - Math.min(+r.amount || 0, remain))}</b></div>`, () => {
      const a = +$('#spA').value || 0, b = (+r.amount || 0) - a;
      if (a < 0 || b <= 0) { toast('拆出來的金額要大於 0。'); return false }
      const nr = rows.map((x, i) => i === +t.dataset.split ? { ...x, amount: a, src: '委辦費-人事費' } : x);
      store.set('months', ymKey(y, m), { y, m, payroll: nr, supervisor: +$('#supAmt')?.value || N.supervisor }).catch(fail());
      createHrVoucher({ payee: r.name, src: '營運收入支應-人事費', desc: `${y}年${m}月薪資(2)`, amount: b }).then(v => toast(`已拆單，另一筆是 ${v.no}。`)).catch(fail('拆單沒有完成，請確認網路後再試一次。'));
    }, '確定拆單');
  }
  if (t.dataset.hr) {
    const kind = t.dataset.hr, { y, m } = SEL_M.staff;
    const staffOpts = (N.staff || []).map(n => `<option>${esc(n)}</option>`).join('');
    const remain = (+N.wbPersonBudget || 0) - wbPersonUsed();
    const title = { bday: '新增生日禮金', sub: '新增代班薪資', bonus: '新增年終獎金' }[kind];
    const body = kind === 'sub'
      ? `<label>代班人員姓名<input type="text" id="hrName"></label><label>金額<input type="number" inputmode="numeric" id="hrAmt"></label><label>經費來源<select id="hrSrc"><option ${remain > 0 ? 'selected' : ''}>委辦費-人事費</option><option ${remain > 0 ? '' : 'selected'}>營運收入支應-人事費</option></select></label>`
      : `<label>員工<select id="hrName">${staffOpts}</select></label><label>金額<input type="number" inputmode="numeric" id="hrAmt" value="${kind === 'bday' ? 500 : ''}"></label>`;
    return ask(title, body + `<p class="hint">會編在 ${nextNo(y, m)}。</p>`, () => {
      const name = $('#hrName').value.trim(), a = +$('#hrAmt').value || 0;
      if (!name || !(a > 0)) { toast('請填姓名和金額。'); return false }
      const data = kind === 'bday' ? { payee: name, src: '營運收入支應-人事費', desc: `員工福利-${m}月(${name})生日禮金`, amount: a }
        : kind === 'bonus' ? { payee: name, src: '營運收入支應-年終獎金', desc: `${y}年度年終獎金(${name})`, amount: a }
          : { payee: name, src: $('#hrSrc').value, desc: `${y}年${m}月代班薪資(${name})`, amount: a };
      createHrVoucher(data).then(v => toast(`已新增 ${v.no}。`)).catch(fail('沒有建立成功，請確認網路後再試一次。'));
    }, '新增');
  }
  switch (t.id) {
    case 'add': if (MODE === 'step') return openWiz(); editId = null; vendorsList(); fillInvForm(null); return $('#dlgInv').showModal();
    case 'moreBtn': return $('#tabs').classList.contains('open') ? closeMore() : openMore();
    case 'moreShade': return closeMore();
    case 'leaveDemo': return leaveDemo();
    case 'updateBtn': return location.reload();
    case 'selClear': sel.clear(); return render();
    case 'selMerge': if (t.getAttribute('aria-disabled') === 'true') return toast('只有同一類別、同一個付款對象的發票可以合併。'); return openMerge();
    case 'printV': if (t.getAttribute('aria-disabled') === 'true') return toast('這個月還沒有憑證可以印。'); return startVoucherPrint();
    case 'settle': {
      const po = pettyOpen(), noV = po.filter(x => !x.voucher);
      const unp = [...new Set(po.filter(x => x.voucher).map(x => x.voucher))].map(no => S().vouchers.find(v => v.no === no)).filter(v => v && !v.printed);
      const total = po.reduce((a, x) => a + amt(x), 0);
      if (noV.length || unp.length) return ask('結算前請先確認', `<p class="hint">下面這些還沒處理，結算後就不容易補：</p>
        <div class="list">${noV.length ? `<button type="button" class="row linkrow" data-go="inv"><div class="main"><div class="title">${noV.length} 張發票還沒做憑證</div><div class="meta">${noV.map(x => esc(x.cat === '幼兒食材' ? '幼兒食材' : x.desc)).join('、')}</div></div><span class="go" aria-hidden="true">›</span></button>` : ''}
        ${unp.length ? `<button type="button" class="row linkrow" data-go="vou"><div class="main"><div class="title">${unp.length} 張憑證還沒印</div><div class="meta">${unp.map(v => esc(v.no)).join('、')}</div></div><span class="go" aria-hidden="true">›</span></button>` : ''}</div>
        <p class="hint" style="font-size:15px">按上面的項目可以直接去處理。確定這次先不處理，再按「仍要結算」。</p>`, doSettle, '仍要結算', 'btn');
      return ask('結算到今天', `<p class="hint">會把 ${po.length} 張主任代墊的發票結成 ${CM} 月第 ${S().settlements.filter(s => s.y === CY && s.m === CM).length + 1} 次結報清單，合計 ${fmt(total)} 元。結算後清單會清空，重新累計。</p>`, doSettle, '結算');
    }
    case 'printCash': return openPreview({ title: '代墊金結報清單（本期，還沒結算）', pages: [cashSheet(sortPetty(pettyOpen()), '本期（尚未結算）', CY, CM)] });
    case 'printFood': { const { y, m } = SEL_M.food; return openPreview({ title: '食材費統計', pages: [foodSheet(y, m)] }) }
    case 'printRcptAll': {
      const { y, m } = SEL_M.fee, kids = monthKids(y, m); if (!kids.length) return toast('還沒有幼兒名單。');
      const nos = receiptNos(y, m, kids);
      return openPreview({
        title: `收據（${kids.length} 位，每頁一位三聯）`, pages: kids.map((k, i) => receiptPage(k, nos[i], y, m)), goText: `列印收據（${kids.length} 頁）`,
        onPrint: () => {
          const d = monthDoc(y, m), fees = {}, rcptNos = {}; kids.forEach((k, i) => { fees[k.id] = (d.fees || {})[k.id] || {}; rcptNos[k.id] = nos[i] });
          store.set('months', ymKey(y, m), { y, m, fees, rcptNos, rcptPrinted: true }).catch(fail());
          const top = Math.max(...nos); if (top + 1 > rcptNext(y)) store.setSettings({ receiptNextY: { [y]: top + 1 } }).catch(fail());
          toast('收據已印好。');
        }
      });
    }
    case 'addKid': return openKid(null);
    case 'borrow': { const { y } = SEL_M.fee; return ask(`協會借用收據號碼（${y} 年）`, `<p class="hint">標記後，這些號碼會被跳過，之後印 ${y} 年的收據不會重複。</p><label>從幾號開始<input type="number" inputmode="numeric" id="bFrom" value="${rcptNext(y)}"></label><label>借用幾張<input type="number" inputmode="numeric" id="bCnt" value="3"></label>`, () => {
      const f = +$('#bFrom').value, c = +$('#bCnt').value; if (!(f > 0 && c > 0)) { toast('請填號碼和張數。'); return false }
      const skip = [...new Set([...rcptSkip(y), ...Array.from({ length: c }, (_, i) => f + i)])].sort((a, b) => a - b).slice(-200);
      store.setSettings({ receiptSkipY: { [y]: skip } }).catch(fail()); toast(`已標記 ${y} 年 ${rcptNo(f)}–${rcptNo(f + c - 1)} 號為協會借用。`)
    }, '標記借用'); }
    case 'savePay': {
      const { y, m } = SEL_M.staff, rows = payrollRows(y, m).map((r, i) => ({ name: r.name, src: document.querySelector(`[data-psrc="${i}"]`).value, amount: +document.querySelector(`[data-pamt="${i}"]`).value || 0 }));
      store.set('months', ymKey(y, m), { y, m, payroll: rows, supervisor: +$('#supAmt').value || 0 }).catch(fail());
      return toast(`已儲存 ${m} 月人事費。`);
    }
    case 'addIncome': { const periods = [`${CY - 1}年第四期補助款`, '第一期補助款', '第二期補助款', '第三期補助款', '第四期補助款'];
      return ask('新增撥款收入', `<div class="two"><label>到帳月份<select id="inM">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === CM ? 'selected' : ''}>${i + 1} 月</option>`).join('')}</select></label><label>來源<select id="inS">${INCOME_SRC.map(s => `<option>${s}</option>`).join('')}</select></label></div>
      <div id="inPWrap" hidden><label>期別（年度報表上每一期各一列）<select id="inP">${periods.map(p => `<option>${p}</option>`).join('')}<option value="__other">其他（自己填）</option></select></label><label id="inPOther" hidden>名稱<input type="text" id="inPO" placeholder="例如：契變第一~第三期補助款差額"></label></div>
      <label>金額<input type="number" inputmode="numeric" id="inA"></label><label>說明（選填）<input type="text" id="inN"></label>`, () => {
      const a = +$('#inA').value || 0; if (!(a > 0)) { toast('請填金額。'); return false }
      const src = $('#inS').value; let label = '';
      if (src === '縣府補助款') { label = $('#inP').value === '__other' ? $('#inPO').value.trim() : $('#inP').value; if (!label) { toast('請填補助款名稱。'); return false } }
      const m = +$('#inM').value; store.set('incomes', store.newId('incomes'), { y: CY, m, ym: ymNum(CY, m), source: src, label, amount: a, note: $('#inN').value.trim(), createdAt: Date.now() }, false).catch(fail()); toast('已新增。')
    }, '新增'); }
    case 'exportBiz': return exportBiz();
    case 'exportYear': return exportYear();
    case 'printYear': return openPreview({ title: `年度經費報表（${CY} 年）`, pages: [annualPrint(annual(CY))], land: true });
    case 'importYear': return $('#importFile').click();
    case 'govReport': return ask('產出核銷報表', `<div class="two"><label>從<select id="gF">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1} 月</option>`).join('')}</select></label><label>到<select id="gT">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${i + 1 === Math.min(6, CM) ? 'selected' : ''}>${i + 1} 月</option>`).join('')}</select></label></div><p class="hint">會產出這段期間的總支出、人事費／業務費／營運收入各支出多少，以及委辦費已用幾 %、還剩多少。明細請另外匯出業務費明細 Excel。</p>`, () => {
      const f = +$('#gF').value, t2 = +$('#gT').value; if (f > t2) { toast('開始月份不能晚於結束月份。'); return false }
      setTimeout(() => openPreview({ title: `核銷報表（${f}–${t2} 月）`, pages: [govSheet(f, t2)] }), 0);
    }, '產出');
    case 'demoAlert': return getAlerts().length ? maybeAlert(true) : toast('目前沒有重要提醒。');
    case 'backup': return backup();
    case 'backupAll': return backupAll();
    case 'restore': return $('#restoreFile').click();
    case 'logout': return ask(DEMO ? '離開範例資料' : '登出這台裝置', `<p class="hint">${DEMO ? '範例資料不會保留。' : '登出後要重新輸入序號才能進入。資料都存在雲端，不會不見。'}</p>`, () => { if (DEMO) leaveDemo(); else store.logout().then(() => location.reload()) }, DEMO ? '離開' : '登出', 'btn danger');
    case 'saveBasic': {
      const p = { short: $('#sShort').value.trim(), code: $('#sCode').value.trim(), full: $('#sFull').value.trim(), tax: $('#sTax').value.trim(), director: $('#sDir').value.trim(), pi: $('#sPI').value.trim(), reserved: +$('#sRes').value || 9, petty: +$('#sPetty').value || 0, supervisor: +$('#sSup').value || 0, assoc: $('#sAssoc').value.trim() };
      if (!p.code || !p.short) return toast('簡稱和憑證代字不能空白。');
      store.setSettings(p).catch(fail()); return toast('已儲存公托資料。');
    }
    case 'saveStaff': { const staff = $('#sStaff').value.split('\n').map(s => s.trim()).filter(Boolean); store.setSettings({ staff }).catch(fail()); return toast(`已儲存 ${staff.length} 位員工。`) }
    case 'saveRcpt': {
      const n = +$('#sRcpt').value, day = +$('#sRDay').value; if (!(n > 0)) return toast('請填號碼。'); if (!(day >= 1 && day <= 31)) return toast('收據日期請填 1 到 31。');
      const dOpt = +$('#sRDayOpt').value || 0, dCon = +$('#sRDayCon').value || 0;
      if (dOpt > 31 || dCon > 31 || dOpt < 0 || dCon < 0) return toast('日期請填 1 到 31，或留空白。');
      store.setSettings({ receiptNextY: { [CY]: n }, rcptDay: day, rcptDayOpt: dOpt, rcptDayContract: dCon, payGov: $('#sPayGov').value.trim() || '屏東縣政府', payAssoc: $('#sPayAssoc').value.trim() || '中華頭心手希望教育協會' }).catch(fail()); return toast('已儲存。')
    }
    case 'saveBudget': {
      const budget = {}, usedBefore = {};
      wbItems().forEach((k, i) => { budget[k] = +document.querySelector(`[data-bud="${i}"]`).value || 0; usedBefore[k] = +document.querySelector(`[data-used="${i}"]`).value || 0 });
      const total = +$('#sBT').value || 0, sum = Object.values(budget).reduce((a, b) => a + b, 0);
      store.setSettings({ budget, usedBefore, wbBizTotal: total, wbPersonBudget: +$('#sPB').value || 0, wbPersonUsedBefore: +$('#sPU').value || 0, admBudget: +$('#sAdm').value || 0 }).catch(fail());
      return toast(total && sum !== total ? `已儲存，但細項合計 ${fmt(sum)} 和總額 ${fmt(total)} 不一樣，請再確認。` : '已儲存預算。');
    }
    case 'addCat': {
      const name = $('#sNewCat').value.trim(); if (!name) return toast('請填類別名稱。');
      let src = $('#sNewSrc').value;
      if (src === '__new') { src = $('#sNewSrcName').value.trim(); if (!src) return toast('請填新的經費來源名稱。') }
      if (cats().some(g => g.items.includes(name))) return toast(`「${name}」已經有了。`);
      addCategory(name, src); return toast(`已新增類別「${name}」（${src}）。`)
    }
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'muSel') { store.setSettings({ manualUntil: { ...(N.manualUntil || {}), [CY]: +t.value } }).catch(fail()); return toast(+t.value ? `改成補登到 ${t.value} 月。` : '不使用補登的數字。') }
  if (t.id === 'inS') { $('#inPWrap').hidden = t.value !== '縣府補助款'; return }
  if (t.id === 'fpDate') { FPD = t.value; return }
  if (t.id === 'rDate') {
    const { y, m } = SEL_M.fee, r = fromISO(t.value), d = monthDoc(y, m);
    if (!r) return toast('請選日期。');
    store.set('months', ymKey(y, m), { y, m, rcptDate: t.value }).catch(fail());
    return toast(`${m} 月收據日期改成 ${r.y}/${r.m}/${r.d}。${d.rcptPrinted ? '這個月的收據已經印過，要重印才會換成新日期。' : ''}`);
  }
  if (t.id === 'inP') { $('#inPOther').hidden = t.value !== '__other'; return }
  if (t.id === 'sNewSrc') { $('#sNewSrcWrap').hidden = t.value !== '__new'; if (t.value === '__new') $('#sNewSrcName').focus(); return }
  if (t.dataset.vpick) { t.checked ? VP.chosen.add(t.dataset.vpick) : VP.chosen.delete(t.dataset.vpick); return showVP(true) }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'spA') $('#spB').textContent = fmt(+t.dataset.sp - (+t.value || 0));
  if (t.dataset.bud !== undefined) { const s = [...document.querySelectorAll('[data-bud]')].reduce((a, x) => a + (+x.value || 0), 0); $('#bSum').textContent = fmt(s); const tot = +$('#sBT').value || 0; $('#bWarn').hidden = !(s && tot && s !== tot) }
});
function openMore() { $('#tabs').classList.add('open'); $('#moreShade').hidden = false; $('#moreBtn').setAttribute('aria-expanded', 'true') }
function closeMore() { $('#tabs').classList.remove('open'); $('#moreShade').hidden = true; $('#moreBtn').setAttribute('aria-expanded', 'false') }
addEventListener('resize', () => updateMerge());
addEventListener('online', renderNet); addEventListener('offline', renderNet);
// 設定、人事頁有還沒儲存的修改時，別台裝置的資料更新不要把畫面重畫掉
let dirty = false;
document.addEventListener('input', e => { if (e.target.closest('#view') && (view === 'set' || view === 'staff')) dirty = true }, true);
document.addEventListener('change', e => { if (e.target.closest('#view') && (view === 'set' || view === 'staff')) dirty = true }, true);
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && /^save|^addCat$|^logout$/.test(b.id || '')) dirty = false; if (b && b.dataset.mode) dirty = false }, true);
const _render = render;
render = function () { if (dirty && (view === 'set' || view === 'staff')) return; _render(); };

window.__app = { go, get store() { return store }, upgrade: upgradeSettings, fillInv: fillInvForm, openWiz };   // 自動測試用
boot();
