// Общая обвязка тестов: загрузка модулей приложения и проверки.
// Каждый файл набора запускается отдельным процессом (см. tests/run.js)
// и в конце печатает строку «##RESULT {...}», по которой runner считает итог.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS = path.join(ROOT, 'js');
const QUICK = !!process.env.TEST_QUICK;

// Количество случайных повторов: в быстром режиме — меньше.
const N = (full, quick) => QUICK ? (quick != null ? quick : Math.max(1, Math.ceil(full / 5))) : full;

function src(name) { return fs.readFileSync(path.join(JS, name + '.js'), 'utf8'); }

// Модули приложения — те же файлы, что подключает poker-trainer.html.
// lang: 'ru' (по умолчанию) или 'en' — язык текстов; у каждого вызова свой экземпляр модулей.
function loadI18n(lang) {
  const I = new Function('localStorage', src('i18n') + '\n' + src('i18n-en') + '\n;return PKI18n;')(undefined);
  I.use(lang || 'ru');
  return I;
}
function load(lang) {
  const PKI18n = loadI18n(lang);
  const PK = new Function('PKI18n', src('core') + '\n;return PK;')(PKI18n);
  const PKDrills = new Function('PK', 'PKI18n', src('drills') + '\n;return PKDrills;')(PK, PKI18n);
  const PKStats = new Function('PKI18n', src('stats') + '\n;return PKStats;')(PKI18n);
  return { PK, PKDrills, PKStats, PKI18n };
}
// Хранилище и звук работают с глобальными объектами браузера — подменяем их.
function loadStore(globals) { return new Function('globalThis', src('store') + '\n;return PKStore;')(globals || {}); }
function loadSound(win) { return new Function('window', src('sound') + '\n;return PKSound;')(win || {}); }

function fakeLocalStorage(quota) {
  const m = new Map();
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => {
      v = String(v); let size = 0;
      m.forEach((val, key) => { if (key !== k) size += val.length; });
      if (quota && size + v.length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem: k => m.delete(k), get length() { return m.size; }, _m: m
  };
}

function fmt(v) {
  try { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; } catch (e) { return String(v); }
}
function deepEq(a, b) { return fmt(a) === fmt(b) && JSON.stringify(a) === JSON.stringify(b); }

function suite(title) {
  const t0 = Date.now();
  let pass = 0, fail = 0, group = '';
  const fails = [];
  const api = {
    QUICK, N,
    group(name) { group = name; },
    check(name, cond, extra) {
      if (cond) { pass++; return true; }
      fail++;
      const line = (group ? '[' + group + '] ' : '') + name + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : fmt(extra)) : '');
      fails.push(line);
      if (fails.length <= 40) console.log('  ✗ ' + line);
      return false;
    },
    eq(name, actual, expected) {
      return api.check(name, deepEq(actual, expected), 'получено ' + fmt(actual) + ', ожидалось ' + fmt(expected));
    },
    near(name, actual, expected, tol) {
      return api.check(name, Math.abs(actual - expected) <= tol, 'получено ' + actual + ', ожидалось ' + expected + ' ± ' + tol);
    },
    throws(name, fn) {
      try { fn(); } catch (e) { return api.check(name, true); }
      return api.check(name, false, 'исключения не было');
    },
    noThrow(name, fn) {
      try { fn(); return api.check(name, true); } catch (e) { return api.check(name, false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
    },
    done(note) {
      const ms = Date.now() - t0;
      if (fails.length > 40) console.log('  … и ещё ' + (fails.length - 40) + ' провалов');
      console.log('##RESULT ' + JSON.stringify({ title, pass, fail, ms, note: note || '' }));
      process.exitCode = fail ? 1 : 0;
    }
  };
  process.on('uncaughtException', e => { api.check('без необработанных исключений', false, String(e && e.stack || e)); api.done(); process.exit(1); });
  process.on('unhandledRejection', e => { api.check('без необработанных исключений (promise)', false, String(e && e.stack || e)); api.done(); process.exit(1); });
  return api;
}

module.exports = {
  loadI18n, ROOT, JS, QUICK, N, load, loadStore, loadSound, fakeLocalStorage, suite, deepEq, fmt };
