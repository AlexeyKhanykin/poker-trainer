/* ===== POKER STORE: хранение на стороне клиента ===== */
/*
  Где и что хранится:
  • Настройки (тема, вариант, вкладка) — localStorage, ключ pokerTrainer.settings.
    Маленькие и нужны синхронно при открытии страницы (чтобы тема не «мигала»).
  • Подробные записи — IndexedDB, база «poker-trainer»:
      answers — каждый ответ в тренажёре (вариант, режим, категория, ответ, время);
      hands   — каждая сыгранная раздача (позиция, решения, результат, лог, разбор);
      games   — партии за столом;
      meta    — рекорды и служебные данные.
    IndexedDB вмещает сотни мегабайт, работает асинхронно и не тормозит интерфейс.
  • Если IndexedDB недоступна (например, Safari для файлов с диска), записи идут в
    localStorage с урезанными лимитами (там всего ~5 МБ), а если и он закрыт — в память.
  • Резервная копия — экспорт в JSON-файл и импорт обратно (перенос между браузерами).
  Всё кэшируется в памяти при старте, поэтому анализ статистики считается мгновенно.
*/
var PKStore = (function () {
  'use strict';
  const T = (s, v) => (typeof PKI18n !== 'undefined' ? PKI18n.t(s, v) : s);
  const DB_NAME = 'poker-trainer', DB_VERSION = 1;
  const STORES = ['answers', 'hands', 'games'];
  const LS_PREFIX = 'pokerTrainer.v2.';
  const LIMITS = {
    indexeddb: { answers: 50000, hands: 10000, games: 2000 },
    localStorage: { answers: 3000, hands: 400, games: 200 },
    memory: { answers: 50000, hands: 10000, games: 2000 }
  };
  const S = { backend: 'memory', db: null, cache: { answers: [], hands: [], games: [] }, meta: {}, nextId: { answers: 1, hands: 1, games: 1 }, persisted: null, error: null };
  let lsTimer = null;
  const lsDirty = new Set();
  const G = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

  // ---------- localStorage ----------
  function lsAvailable() {
    try { const k = '__pt_test'; G.localStorage.setItem(k, '1'); G.localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  function lsGet(key, def) {
    try { const v = G.localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { G.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function lsSaveStore(name) {
    const key = LS_PREFIX + name;
    const val = name === 'meta' ? S.meta : S.cache[name];
    for (let attempt = 0; attempt < 6; attempt++) {
      try { G.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) {
        // Не хватает места: удаляем самые старые 25% записей и пробуем снова.
        if (name === 'meta' || !val.length) break;
        val.splice(0, Math.max(1, Math.ceil(val.length * 0.25)));
        S.error = T('В localStorage мало места — самые старые записи удалены. Сделайте экспорт, чтобы не потерять историю.');
      }
    }
    return false;
  }
  function lsSchedule(name) {
    lsDirty.add(name);
    if (lsTimer) return;
    lsTimer = setTimeout(lsFlush, 300);
  }
  function lsFlush() {
    clearTimeout(lsTimer); lsTimer = null;
    lsDirty.forEach(lsSaveStore);
    lsDirty.clear();
  }

  // ---------- IndexedDB ----------
  function idbOpen(timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false, req;
      const t = setTimeout(() => { if (!done) { done = true; reject(new Error('нет ответа от IndexedDB')); } }, timeoutMs);
      const fail = e => { if (!done) { done = true; clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e && e.message || e || 'ошибка IndexedDB'))); } };
      try {
        if (!G.indexedDB) throw new Error('IndexedDB не поддерживается');
        req = G.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) { return fail(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' });
          os.createIndex('ts', 'ts'); os.createIndex('variant', 'variant');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        if (done) { try { req.result.close(); } catch (e) { /* поздно */ } return; }
        done = true; clearTimeout(t); resolve(req.result);
      };
      req.onerror = () => fail(req.error);
      req.onblocked = () => fail(new Error('база занята другой вкладкой'));
    });
  }
  function idbReq(store, mode, fn) {
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = S.db.transaction(store, mode); } catch (e) { return reject(e); }
      const os = tx.objectStore(store);
      let result;
      const r = fn(os);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('транзакция прервана'));
    });
  }
  function idbWrite(store, fn) {
    if (!S.db) return Promise.resolve();
    return idbReq(store, 'readwrite', fn).catch(e => {
      S.error = T('Не удалось записать в IndexedDB: {e}. Данные этой сессии есть в памяти — сделайте экспорт.', { e: e && e.message || e });
    });
  }

  // ---------- Общий интерфейс ----------
  async function init(opts) {
    opts = opts || {};
    const want = opts.backend || 'auto';
    if (want === 'auto' || want === 'indexeddb') {
      try {
        S.db = await idbOpen(opts.timeout || 2500);
        for (const s of STORES) S.cache[s] = (await idbReq(s, 'readonly', os => os.getAll())) || [];
        const m = await idbReq('meta', 'readonly', os => os.get('meta'));
        S.meta = (m && m.value) || {};
        S.backend = 'indexeddb';
      } catch (e) {
        S.db = null;
        S.error = null;
        S.idbReason = e && e.message || String(e);
      }
    }
    if (!S.db && want !== 'memory' && lsAvailable()) {
      S.backend = 'localStorage';
      for (const s of STORES) S.cache[s] = lsGet(LS_PREFIX + s, []) || [];
      S.meta = lsGet(LS_PREFIX + 'meta', {}) || {};
    } else if (!S.db) S.backend = 'memory';
    for (const s of STORES) {
      S.cache[s].sort((a, b) => a.id - b.id);
      S.nextId[s] = S.cache[s].reduce((m, r) => Math.max(m, r.id), 0) + 1;
    }
    // Если раньше пришлось писать в localStorage, а теперь IndexedDB доступна — переносим.
    if (S.backend === 'indexeddb' && lsAvailable()) {
      const old = {};
      let any = false;
      for (const s of STORES) { old[s] = lsGet(LS_PREFIX + s, null); if (old[s] && old[s].length) any = true; }
      if (any) {
        await importData({ format: 'poker-trainer-backup', answers: old.answers || [], hands: old.hands || [], games: old.games || [], meta: lsGet(LS_PREFIX + 'meta', {}) }, 'merge');
        for (const s of STORES.concat(['meta'])) { try { G.localStorage.removeItem(LS_PREFIX + s); } catch (e) { /* ничего */ } }
      }
    }
    if (!S.meta.createdAt) setMeta('createdAt', Date.now());
    if (S.backend === 'indexeddb') requestPersist();
    if (typeof G.addEventListener === 'function') G.addEventListener('pagehide', lsFlush);
    return info();
  }
  async function requestPersist() {
    try {
      if (G.navigator && G.navigator.storage && G.navigator.storage.persist) {
        S.persisted = await G.navigator.storage.persisted();
        if (!S.persisted) S.persisted = await G.navigator.storage.persist();
      }
    } catch (e) { S.persisted = null; }
  }
  function prune(store) {
    const limit = LIMITS[S.backend][store], arr = S.cache[store];
    if (arr.length <= limit) return;
    const removed = arr.splice(0, arr.length - limit);
    if (S.backend === 'indexeddb') idbWrite(store, os => { removed.forEach(r => os.delete(r.id)); });
  }
  function persist(store, rec) {
    if (S.backend === 'indexeddb') idbWrite(store, os => os.put(rec));
    else if (S.backend === 'localStorage') lsSchedule(store);
  }
  function add(store, rec) {
    rec.id = S.nextId[store]++;
    if (!rec.ts) rec.ts = Date.now();
    S.cache[store].push(rec);
    persist(store, rec);
    prune(store);
    return rec;
  }
  function update(store, rec) {
    const arr = S.cache[store], i = arr.findIndex(r => r.id === rec.id);
    if (i < 0) return add(store, rec);
    arr[i] = rec;
    persist(store, rec);
    return rec;
  }
  const all = store => S.cache[store];
  function getMeta(k, def) { return S.meta[k] === undefined ? def : S.meta[k]; }
  function setMeta(k, v) {
    S.meta[k] = v;
    if (S.backend === 'indexeddb') idbWrite('meta', os => os.put({ key: 'meta', value: S.meta }));
    else if (S.backend === 'localStorage') lsSchedule('meta');
  }
  // Удаляет записи, подходящие под условие (для выборочной очистки статистики).
  async function remove(store, pred) {
    const arr = S.cache[store], gone = arr.filter(pred);
    if (!gone.length) return 0;
    S.cache[store] = arr.filter(r => !pred(r));
    if (S.backend === 'indexeddb') await idbWrite(store, os => { gone.forEach(r => os.delete(r.id)); });
    else if (S.backend === 'localStorage') { lsDirty.add(store); lsFlush(); }
    return gone.length;
  }
  async function clearAll(keepMeta) {
    for (const s of STORES) S.cache[s] = [];
    const created = S.meta.createdAt;
    if (!keepMeta) S.meta = { createdAt: created, migratedV1: S.meta.migratedV1 };
    if (S.backend === 'indexeddb') {
      for (const s of STORES) await idbWrite(s, os => os.clear());
      await idbWrite('meta', os => os.put({ key: 'meta', value: S.meta }));
    } else if (S.backend === 'localStorage') { STORES.concat(['meta']).forEach(s => lsDirty.add(s)); lsFlush(); }
  }

  // ---------- Резервная копия ----------
  function exportData() {
    return {
      format: 'poker-trainer-backup', version: 2, exportedAt: new Date().toISOString(), backend: S.backend,
      answers: S.cache.answers, hands: S.cache.hands, games: S.cache.games, meta: S.meta
    };
  }
  const sig = {
    answers: r => [r.ts, r.variant, r.mode, r.cat, r.chosen].join('|'),
    games: r => [r.ts, r.variant].join('|'),
    hands: r => [r.ts, r.variant, r.handNo].join('|')
  };
  // mode: 'merge' — добавить недостающее; 'replace' — заменить всё.
  async function importData(obj, mode) {
    if (!obj || obj.format !== 'poker-trainer-backup' || !Array.isArray(obj.answers) || !Array.isArray(obj.hands)) throw new Error(T('Это не файл резервной копии покерного тренера'));
    if (mode === 'replace') await clearAll(false);
    const res = { answers: 0, hands: 0, games: 0 };
    const gameMap = {};
    const have = {};
    for (const s of STORES) have[s] = new Set(S.cache[s].map(sig[s]));
    for (const g of (obj.games || [])) {
      const k = sig.games(g);
      if (have.games.has(k)) { const ex = S.cache.games.find(x => sig.games(x) === k); gameMap[g.id] = ex.id; continue; }
      const old = g.id, rec = Object.assign({}, g); delete rec.id;
      add('games', rec); gameMap[old] = rec.id; have.games.add(k); res.games++;
    }
    for (const s of ['answers', 'hands']) for (const r of obj[s]) {
      const k = sig[s](r);
      if (have[s].has(k)) continue;
      const rec = Object.assign({}, r); delete rec.id;
      if (s === 'hands' && rec.gameId != null && gameMap[rec.gameId] != null) rec.gameId = gameMap[rec.gameId];
      add(s, rec); have[s].add(k); res[s]++;
    }
    for (const s of STORES) S.cache[s].sort((a, b) => a.ts - b.ts || a.id - b.id);
    const m = obj.meta || {};
    if (m.bestStreak > getMeta('bestStreak', 0)) setMeta('bestStreak', m.bestStreak);
    if (m.speed) { const sp = Object.assign({}, getMeta('speed', {})); for (const k in m.speed) sp[k] = Math.max(sp[k] || 0, m.speed[k]); setMeta('speed', sp); }
    if (m.legacy && !getMeta('legacy')) setMeta('legacy', m.legacy);
    if (S.backend === 'localStorage') lsFlush();
    return res;
  }
  async function estimate() {
    try { if (G.navigator && G.navigator.storage && G.navigator.storage.estimate) return await G.navigator.storage.estimate(); } catch (e) { /* нет данных */ }
    return null;
  }
  function info() {
    const counts = {};
    for (const s of STORES) counts[s] = S.cache[s].length;
    return { backend: S.backend, counts: counts, limits: LIMITS[S.backend], persisted: S.persisted, error: S.error, idbReason: S.idbReason || null };
  }

  // ---------- Настройки (синхронно, маленькие) ----------
  const SETTINGS_KEY = 'pokerTrainer.settings';
  let memSettings = null;
  function loadSettings(def) {
    let s = lsGet(SETTINGS_KEY, null);
    if (!s) s = memSettings;
    if (!s) {
      // Настройки из первой версии тренера
      const v1 = lsGet('pokerTrainer.v1', null);
      if (v1 && v1.settings) s = { theme: v1.settings.theme, hints: v1.settings.hints, tab: v1.settings.tab, mode: v1.settings.mode, level: v1.settings.level === 7 ? 'full' : 5 };
    }
    return Object.assign({}, def, s || {});
  }
  function saveSettings(s) { memSettings = s; lsSet(SETTINGS_KEY, s); }

  // Перенос данных из первой версии тренера (там хранились только суммарные счётчики).
  function migrateV1() {
    if (getMeta('migratedV1')) return null;
    const v1 = lsGet('pokerTrainer.v1', null);
    setMeta('migratedV1', true);
    if (!v1 || typeof v1 !== 'object') return null;
    if (v1.bestStreak) setMeta('bestStreak', Math.max(getMeta('bestStreak', 0), v1.bestStreak));
    if (v1.speedRecord) setMeta('speed', { 'holdem:5': v1.speedRecord[5] || 0, 'holdem:full': v1.speedRecord[7] || 0 });
    const cats = Array.isArray(v1.cats) ? v1.cats.map(c => ({ seen: c.seen | 0, correct: c.correct | 0 })) : null;
    if ((cats && cats.some(c => c.seen)) || v1.hands) setMeta('legacy', { cats: cats, hands: v1.hands | 0, handsWon: v1.handsWon | 0, at: Date.now() });
    return true;
  }

  return { init, add, update, all, remove, clearAll, getMeta, setMeta, exportData, importData, estimate, info, flush: lsFlush, loadSettings, saveSettings, migrateV1, LIMITS, _S: S };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PKStore;
/* ===== END POKER STORE ===== */
