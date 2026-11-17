// 資料層：正式模式用 Firebase，範例模式用記憶體（不存檔）。兩者介面相同。
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCf9422jx4OvH7n0DJSSoqBqEEF6dMB1OI",
  authDomain: "gongtuo-fund.firebaseapp.com",
  projectId: "gongtuo-fund",
  storageBucket: "gongtuo-fund.firebasestorage.app",
  messagingSenderId: "22121032611",
  appId: "1:22121032611:web:dd4f9105cbf12a971f4816"
};
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const EMAIL_DOMAIN = '@gongtuo-fund.firebaseapp.com';

// 序號 → 帳號：去掉「-」和空白、轉小寫；帳號＝序號@網域，密碼＝序號
export function serialToCred(serial) {
  const s = String(serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 6 || s.length > 20) return null;   // 各園 8 碼；管理者可以用較長的
  const l = s.toLowerCase();
  return { email: l + EMAIL_DOMAIN, password: l };
}

export const COLS = ['invoices', 'vouchers', 'settlements', 'kids', 'months', 'incomes'];

function emptyState() {
  return { settings: null, invoices: [], vouchers: [], settlements: [], kids: [], months: {}, incomes: [], loaded: {} };
}

/* ================= 正式模式：Firebase ================= */
export async function createFirebaseStore({ year, ym }) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(app); }

  let nid = null, unsubs = [], listener = null, onStatus = () => {};
  let state = emptyState();
  let pending = 0;
  const inv = { win: new Map(), open: new Map(), trash: new Map() };   // 發票由三個查詢合併
  const base = () => F.doc(db, 'nurseries', nid);
  const col = c => F.collection(db, 'nurseries', nid, c);
  const emit = () => listener && listener(state);
  const track = p => {
    pending++; onStatus({ pending });
    return p.then(r => r, e => { onStatus({ writeError: e.code || e.message }); throw e; })
            .finally(() => { pending--; onStatus({ pending }); });
  };

  function mergeInvoices() {
    const m = new Map([...inv.win, ...inv.open, ...inv.trash]);
    state.invoices = [...m.values()];
  }
  function watch() {
    unsubs.forEach(u => u()); unsubs = [];
    const onErr = e => onStatus({ readError: e.code || e.message });
    const snapList = (q, fn) => unsubs.push(F.onSnapshot(q, fn, onErr));
    // 設定：只有確定伺服器上真的沒有（不是本機快取還沒載入）才算「沒有設定」，避免用預設值蓋掉真正的設定
    unsubs.push(F.onSnapshot(base(), { includeMetadataChanges: true }, s => {
      state.settings = s.exists() ? s.data() : null;
      state.loaded.settings = s.exists() || !s.metadata.fromCache;
      emit();
    }, onErr));
    const toArr = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // 發票：近三個月＋所有還沒做憑證的＋垃圾桶
    const fromYm = ym - (ym % 100 > 2 ? 2 : 90);   // 往前兩個月（跨年時多抓一點）
    snapList(F.query(col('invoices'), F.where('ym', '>=', fromYm)), s => { inv.win = new Map(toArr(s).map(x => [x.id, x])); mergeInvoices(); state.loaded.invoices = true; emit(); });
    snapList(F.query(col('invoices'), F.where('voucher', '==', null)), s => { inv.open = new Map(toArr(s).map(x => [x.id, x])); mergeInvoices(); emit(); });
    snapList(F.query(col('invoices'), F.where('deleted', '==', true)), s => { inv.trash = new Map(toArr(s).map(x => [x.id, x])); mergeInvoices(); emit(); });
    // 憑證、結算、收入：今年（一月時連去年一起）
    const fromY = ym % 100 === 1 ? year - 1 : year;
    snapList(F.query(col('vouchers'), F.where('y', '>=', fromY)), s => { state.vouchers = toArr(s); state.loaded.vouchers = true; emit(); });
    snapList(F.query(col('settlements'), F.where('y', '>=', fromY)), s => { state.settlements = toArr(s); emit(); });
    snapList(F.query(col('incomes'), F.where('y', '>=', fromY)), s => { state.incomes = toArr(s); emit(); });
    snapList(col('kids'), s => { state.kids = toArr(s); state.loaded.kids = true; emit(); });
    snapList(F.query(col('months'), F.where('y', '>=', fromY)), s => { state.months = Object.fromEntries(toArr(s).map(x => [x.id, x])); emit(); });
  }

  return {
    mode: 'firebase',
    get state() { return state; },
    onData(cb) { listener = cb; },
    onStatus(cb) { onStatus = cb; },
    onAuth(cb) {
      A.onAuthStateChanged(auth, async u => {
        unsubs.forEach(x => x()); unsubs = []; state = emptyState(); nid = null;
        if (!u) return cb(null);
        try {
          const m = await F.getDoc(F.doc(db, 'members', u.email));
          if (!m.exists()) return cb({ error: 'nomember' });
          const n = m.data().nursery;
          if (n === 'admin') {          // 管理者：可以切換四間公托
            let last = null; try { last = localStorage.getItem('gongtuo.adminNid') } catch (e) { }
            nid = last || 'wandan'; watch(); return cb({ nid, admin: true });
          }
          nid = n; watch(); cb({ nid });
        } catch (e) { cb({ error: e.code || e.message }); }
      });
    },
    switchNursery(n) { nid = n; state = emptyState(); inv.win = new Map(); inv.open = new Map(); inv.trash = new Map(); watch(); emit(); },
    async login(serial) {
      const c = serialToCred(serial);
      if (!c) throw { code: 'format' };
      await A.signInWithEmailAndPassword(auth, c.email, c.password);
    },
    async logout() { unsubs.forEach(x => x()); unsubs = []; await A.signOut(auth); },
    newId(c) { return F.doc(col(c)).id; },
    setSettings(patch) { return track(F.setDoc(base(), patch, { merge: true })); },
    set(c, id, data, merge = true) { return track(F.setDoc(F.doc(col(c), id), data, { merge })); },
    update(c, id, patch) { return track(F.updateDoc(F.doc(col(c), id), patch)); },
    remove(c, id) { return track(F.deleteDoc(F.doc(col(c), id))); },
    // 一次寫多筆：ops = [{c, id, data, merge} | {c, id, update} | {c, id, remove:true}]
    batch(ops) {
      const b = F.writeBatch(db);
      for (const o of ops) {
        const r = F.doc(col(o.c), o.id);
        if (o.remove) b.delete(r); else if (o.update) b.update(r, o.update); else b.set(r, o.data, { merge: o.merge !== false });
      }
      return track(b.commit());
    },
    // 備份用：抓這間公托的全部資料（不只畫面上載入的近期資料）
    // n：管理者一次備份四間時指定公托，沒給就是目前這間
    async fetchAll(n = nid) {
      const s = await F.getDoc(F.doc(db, 'nurseries', n)), out = { settings: s.exists() ? s.data() : null };
      for (const c of COLS) {
        const snap = await F.getDocs(F.collection(db, 'nurseries', n, c)), arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        out[c] = c === 'months' ? Object.fromEntries(arr.map(x => [x.id, x])) : arr;
      }
      return out;
    },
    // 建立憑證：用交易確認編號沒被別台裝置用掉
    async createVoucher(v, invoiceIds) {
      if (!navigator.onLine) throw { code: 'offline' };
      return track(F.runTransaction(db, async t => {
        const ref = F.doc(col('vouchers'), v.no);
        const s = await t.get(ref);
        if (s.exists()) throw { code: 'taken' };
        t.set(ref, v);
        for (const id of invoiceIds) t.update(F.doc(col('invoices'), id), { voucher: v.no });
      }));
    },
  };
}

/* ================= 範例模式：記憶體，不存檔 ================= */
export function createDemoStore(sample) {
  let state = emptyState(), listener = null, authCb = null, onStatus = () => {};
  let seq = 1;
  const emit = () => queueMicrotask(() => listener && listener(state));
  const arr = c => state[c];
  const find = (c, id) => c === 'months' ? state.months[id] : arr(c).find(x => x.id === id);
  const deepMerge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; };
  function setDoc(c, id, data, merge) {
    if (c === 'months') { state.months[id] = merge && state.months[id] ? deepMerge(state.months[id], structuredClone(data)) : { id, ...structuredClone(data) }; return; }
    const x = find(c, id);
    if (x && merge) deepMerge(x, structuredClone(data));
    else { if (x) arr(c).splice(arr(c).indexOf(x), 1); arr(c).push({ id, ...structuredClone(data) }); }
  }
  function updDoc(c, id, patch) {
    const x = find(c, id); if (!x) throw { code: 'not-found' };
    for (const k in patch) x[k] = structuredClone(patch[k]);
  }
  function delDoc(c, id) {
    if (c === 'months') { delete state.months[id]; return; }
    const x = find(c, id); if (x) arr(c).splice(arr(c).indexOf(x), 1);
  }
  const done = () => { emit(); return Promise.resolve(); };
  let cur = 'wandan';
  return {
    mode: 'demo',
    get state() { return state; },
    onData(cb) { listener = cb; },
    onStatus(cb) { onStatus = cb; },
    onAuth(cb) {
      authCb = cb;
      queueMicrotask(() => {
        state = emptyState();
        Object.assign(state, sample());
        state.loaded = { settings: true, invoices: true, vouchers: true, kids: true };
        const admin = new URLSearchParams(location.search).has('admin');
        cb({ nid: 'wandan', demo: true, admin });
        emit();
      });
    },
    switchNursery(n) {
      cur = n; state = emptyState();
      if (n === 'wandan') Object.assign(state, sample());
      state.loaded = { settings: true, invoices: true, vouchers: true, kids: true };
      emit();
    },
    async login() {},
    async logout() { state = emptyState(); authCb && authCb(null); },
    newId(c) { return 'd' + (Date.now().toString(36)) + (seq++); },
    setSettings(patch) { state.settings = deepMerge(state.settings || {}, structuredClone(patch)); return done(); },
    set(c, id, data, merge = true) { setDoc(c, id, data, merge); return done(); },
    update(c, id, patch) { updDoc(c, id, patch); return done(); },
    remove(c, id) { delDoc(c, id); return done(); },
    batch(ops) { for (const o of ops) { if (o.remove) delDoc(o.c, o.id); else if (o.update) updDoc(o.c, o.id, o.update); else setDoc(o.c, o.id, o.data, o.merge !== false); } return done(); },
    async fetchAll(n) { if (n && n !== cur) { const { loaded, ...rest } = emptyState(); return rest; } const { loaded, ...rest } = structuredClone(state); return rest; },
    async createVoucher(v, invoiceIds) {
      if (find('vouchers', v.no)) throw { code: 'taken' };
      setDoc('vouchers', v.no, v, false);
      for (const id of invoiceIds) updDoc('invoices', id, { voucher: v.no });
      emit();
    },
  };
}
