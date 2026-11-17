// 範例資料（全部虛構）：只在「先用範例資料試試看」時使用，不會寫進資料庫
export function sampleData({ CY, CM }) {
  const prev = CM === 1 ? { y: CY - 1, m: 12 } : { y: CY, m: CM - 1 };
  const key = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const pre = (y, m) => '萬' + y + String(m).padStart(2, '0');
  const srcOf = c => ['日常消耗用品', '通訊網路費', '104系統', '行政文書辦公', '冷氣清洗'].includes(c) ? '委辦費-業務費'
    : c === '幼兒食材' ? '營運收入支應-餐點費' : '營運收入支應-業務費';
  let n = 1;
  const inv = (d, payer, cat, desc, qty, price, food) => ({ id: 'i' + (n++), y: CY, m: CM, ym: CY * 100 + CM, d, payer, cat, src: srcOf(cat), desc, qty, price, food: food || '', voucher: null, settled: null, deleted: false, createdAt: Date.now() });
  const invoices = [
    inv(2, '主任', '教學活動及節慶活動用品', '感恩節花束', 1, 240),
    inv(3, '主任', '教學活動及節慶活動用品', '光泉豆漿', 5, 43),
    inv(4, '主任', '教學活動及節慶活動用品', '稻鴨米餅', 2, 377),
    inv(5, '主任', '員工福利', '10月會議誤餐費', 1, 840),
    inv(6, '主任', '日常消耗用品', '遙控器電池', 1, 103),
    inv(6, '主任', '日常消耗用品', '白兔螺絲鋼架', 1, 1490),
    inv(7, '主任', '幼兒食材', '幼兒食材', 1, 964, '豬瘦絞肉、澳洲柳橙、絲瓜、馬鈴薯、空心菜'),
    inv(9, '主任', '幼兒食材', '幼兒食材', 1, 532, '早安地瓜、南投蕉、有機鴻喜菇'),
    inv(10, '主任', '通訊網路費', '電路統包專案月費', 1, 797),
    inv(10, '主任', '104系統', '人資管理四模組', 1, 661),
    inv(12, '清涼冷氣工程行', '冷氣清洗', '分離式冷氣清洗', 1, 10290),
    inv(13, '主任', '行政文書辦公', '碳鋅電池', 2, 179),
    inv(13, '主任', '行政文書辦公', '自粘性標籤', 1, 24),
    inv(14, '主任', '幼兒食材', '幼兒食材', 1, 550, '網狀哈密瓜、牛心番茄、娃娃菜、甘藍'),
    inv(15, '主任', '教學活動及節慶活動用品', '聖誕裝飾', 1, 365),
    inv(16, '主任', '玩具書籍', '繪本', 2, 280),
  ];
  const amt = x => x.qty * x.price;
  const vouchers = []; let no = 10;
  const mk = (idx, desc, note) => {
    const list = idx.map(i => invoices[i]), f = list[0], v = { id: pre(CY, CM) + no, no: pre(CY, CM) + no, y: CY, m: CM, ym: CY * 100 + CM, payee: f.payer === '主任' ? '林雅婷' : f.payer, src: f.src, desc, note: note || '', amount: list.reduce((a, x) => a + amt(x), 0), ids: list.map(x => x.id), kind: 'inv', cat: f.cat, printed: true, printedAt: `${CM}/10`, deleted: false, createdAt: Date.now() };
    list.forEach(x => x.voucher = v.no); vouchers.push(v); no++;
  };
  mk([8], '通訊網路費：電路統包專案月費');
  mk([9], '104系統：人資管理四模組');
  mk([4, 5], '日常消耗用品：遙控器電池、白兔螺絲鋼架');
  mk([3], '員工福利：10月會議誤餐費', '10/30 主管會議，參與 6 人，誤餐費每人 140 元');
  mk([0, 1, 2], '教學活動及節慶活動用品：感恩節花束、光泉豆漿、稻鴨米餅');
  mk([6, 7], '幼兒食材');
  const settledIds = invoices.filter(x => x.payer === '主任' && x.d <= 10).map(x => x.id);
  const rows = invoices.filter(x => settledIds.includes(x.id)).sort((a, b) => a.voucher.localeCompare(b.voucher)).map(x => ({ m: x.m, d: x.d, cat: x.cat, desc: x.desc, qty: x.qty, price: x.price, voucher: x.voucher }));
  invoices.forEach(x => { if (settledIds.includes(x.id)) x.settled = 's1' });
  const settlements = [{ id: 's1', n: 1, y: CY, m: CM, date: `${CM}/10`, ids: settledIds, rows, total: rows.reduce((a, x) => a + x.qty * x.price, 0), createdAt: Date.now() }];

  const KN = ['陳小安', '林宥辰', '黃品妍', '張以晴', '李承恩', '王語彤', '吳柏宇', '劉思妤', '蔡宇翔', '楊沐恩', '許可薰', '鄭允晨', '謝芯妤', '郭承睿', '洪子喬', '曾若希', '邱宥寧', '廖品睿', '賴芊語', '周子謙'];
  const KB = ['2024-09-12', '2024-11-03', '2025-01-20', '2024-08-15', '2025-02-07', '2024-12-24', '2025-03-30', '2024-10-11', '2025-04-18', '2024-07-29', '2025-05-02', '2025-01-09', '2024-09-30', '2026-02-14', '2025-06-21', '2024-11-27', '2025-03-03', '2026-08-02', '2025-02-26', '2024-12-05'];
  const kids = KN.map((name, i) => ({ id: 'k' + (i + 1), seat: i + 1, name, birth: KB[i], active: true }));
  const staff = ['王怡萱', '李佩珊', '張雅琪', '劉淑芬', '黃郁婷', '吳美玲', '蔡宜蓁', '林雅婷'];
  const sal = [52307, 49094, 46136, 47424, 46136, 48483, 47250, 80002];
  const months = {
    [key(prev.y, prev.m)]: { id: key(prev.y, prev.m), y: prev.y, m: prev.m, rcptPrinted: true, rcptStart: 228, fees: Object.fromEntries(kids.map(k => [k.id, {}])), payroll: staff.map((name, i) => ({ name, src: '委辦費-人事費', amount: sal[i] })), supervisor: 5000 },
    [key(CY, CM)]: { id: key(CY, CM), y: CY, m: CM, fees: { k5: { late: 98 }, k11: { refund: -800 }, k18: { days: 10 }, k14: { ins: 141 } }, noteMap: { n1: { kid: 'k11', text: '11/3–11/6 腸病毒休養共 4 日，退費 800 元。', at: 1 }, n2: { kid: 'k5', text: '10/28 延托，一日延托費 98 元。', at: 2 } } },
  };
  const BUDGET = { '影印機': 6977, '愛托付系統': 6000, '飲水機': 23380, '保全': 22000, '計畫督導津貼': 60000, '通訊網路費': 15717, '電費': 84587, '場地費': 30000, '保險': 15883, '消防申報': 5000, '外聘督導費': 12000, '104系統': 6856, '日常消耗用品': 75539, '行政文書辦公': 21890, '環境維護消毒': 7650, '冷氣清洗': 10290, '維修': 51185, '電腦維修及採購': 6500, '購置設備': 68606 };
  const USED = { '影印機': 5820, '愛托付系統': 6000, '飲水機': 19200, '保全': 20167, '計畫督導津貼': 45000, '通訊網路費': 14060, '電費': 71240, '場地費': 30000, '保險': 15883, '消防申報': 5000, '外聘督導費': 8000, '104系統': 4820, '日常消耗用品': 56717, '行政文書辦公': 16420, '環境維護消毒': 5600, '冷氣清洗': 0, '維修': 32800, '電腦維修及採購': 3570, '購置設備': 41200 };
  const settings = { short: '萬丹', code: '萬', full: '屏東縣萬丹鄉公設民營托嬰中心', tax: '00451325', assoc: '中華頭心手希望教育協會', director: '林雅婷', reserved: 9, petty: 30000, supervisor: 5000, staff, wbPersonBudget: 2250000, wbPersonUsedBefore: 1600000, wbBizTotal: 530060, budget: BUDGET, usedBefore: USED, receiptNext: 248, receiptSkip: [], vendors: {} };
  const incomes = [{ id: 'n1', y: CY, m: 3, ym: CY * 100 + 3, source: '縣府補助款', amount: 1220000, note: '第一期補助款' }, { id: 'n2', y: CY, m: 8, ym: CY * 100 + 8, source: '縣府補助款', amount: 920000, note: '第二期補助款' }, { id: 'n3', y: CY, m: 10, ym: CY * 100 + 10, source: '提升托育品質', amount: 100000, note: '' }];
  return { settings, invoices, vouchers, settlements, kids, months, incomes };
}
