// Мини-драйвер Chrome через DevTools Protocol — без внешних библиотек (нужен Node 22+ и установленный Chrome).
// Открывает тренажёр (index.html) с диска в Chrome без окна, выполняет код на странице, эмулирует экран телефона.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

function findChrome() { return CANDIDATES.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null; }

async function launch() {
  const exe = findChrome();
  if (!exe) return null;
  if (typeof WebSocket === 'undefined') throw new Error('Нужен Node 22 или новее (встроенный WebSocket)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poker-ui-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-extensions', '--mute-audio', '--allow-file-access-from-files', '--hide-scrollbars',
    // без этого фоновый Chrome (особенно когда их несколько) замедляет таймеры и тесты «зависают»
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  // Chrome не должен пережить тест, даже если тот упал
  const kill = () => { try { proc.kill(); } catch (e) { /* уже закрыт */ } };
  process.on('exit', kill);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { kill(); process.exit(1); });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome не ответил за 20 с')), 20000);
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', code => { clearTimeout(t); reject(new Error('Chrome завершился (код ' + code + ')')); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('не удалось подключиться к Chrome')); });
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) listeners.forEach(fn => fn(msg));
  };
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params: params || {}, sessionId }));
  });
  const browser = {
    exe,
    async newPage(opts) {
      opts = opts || {};
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      const errors = [], logs = [], media = {};
      listeners.push(msg => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Runtime.exceptionThrown') errors.push((msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) || msg.params.exceptionDetails.text);
        if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) errors.push('console.' + msg.params.type + ': ' + msg.params.args.map(a => a.value || a.description).join(' '));
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'log') logs.push(msg.params.args.map(a => a.value).join(' '));
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon/.test(msg.params.entry.url || '')) errors.push('log: ' + msg.params.entry.text);
        if (msg.method === 'Page.javascriptDialogOpening') s('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      });
      await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable');
      const page = {
        errors, logs,
        // Прямая команда DevTools Protocol (сеть без интернета, прозрачный фон и т. п.)
        cdp: s,
        async viewport(w, h, mobile) {
          await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
          await s('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
        },
        // Подмена медиа-признаков (тема, анимация, сенсорный экран); заданные раньше сохраняются.
        async media(name, value) { media[name] = value; await s('Emulation.setEmulatedMedia', { features: Object.keys(media).map(n => ({ name: n, value: media[n] })) }); },
        async colorScheme(v) { await page.media('prefers-color-scheme', v); },
        async reducedMotion(on) { await page.media('prefers-reduced-motion', on ? 'reduce' : 'no-preference'); },
        async touch(on) { await page.media('pointer', on ? 'coarse' : 'fine'); await page.media('hover', on ? 'none' : 'hover'); },
        async goto(url) {
          const loaded = new Promise(res => { const fn = msg => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(fn), 1); res(); } }; listeners.push(fn); });
          await s('Page.navigate', { url });
          await loaded;
        },
        async reload() {
          const loaded = new Promise(res => { const fn = msg => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(fn), 1); res(); } }; listeners.push(fn); });
          await s('Page.reload', {});
          await loaded;
        },
        // Выполняет выражение (можно async) на странице и возвращает результат.
        async eval(expr) {
          const r = await s('Runtime.evaluate', { expression: '(async () => { ' + expr + ' })()', awaitPromise: true, returnByValue: true, userGesture: true });
          if (r.exceptionDetails) throw new Error('Ошибка на странице: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
          return r.result.value;
        },
        async screenshot(file, full) {
          const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full });
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
        },
        // Настоящее нажатие пальцем/мышью в точке (x, y) — проверяет, что элемент не перекрыт.
        async tap(x, y) {
          await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        },
        async close() { await send('Target.closeTarget', { targetId }); }
      };
      if (opts.viewport) await page.viewport(opts.viewport[0], opts.viewport[1], opts.mobile);
      return page;
    },
    async close() {
      try { await send('Browser.close'); } catch (e) { /* уже закрыт */ }
      try { proc.kill(); } catch (e) { /* ничего */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ничего */ }
    }
  };
  return browser;
}

// Помощники, которые подключаются на страницу перед каждым шагом теста.
const PAGE_HELPERS = `
  window.__t = window.__t || {
    $: s => document.querySelector(s),
    $$: s => Array.from(document.querySelectorAll(s)),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    click(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) throw new Error('нет элемента ' + sel); el.click(); return true; },
    key(k, opts) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {}))); },
    text(sel) { const el = document.querySelector(sel); return el ? el.innerText : ''; },
    visible(el) { if (typeof el === 'string') el = document.querySelector(el); if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; },
    async until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { try { const v = fn(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 30)); } return null; }
  };
`;

function fileUrl(p) { return 'file://' + path.resolve(p).split(path.sep).map(encodeURIComponent).join('/').replace(/^\/?/, '/').replace(/^\/([A-Za-z])%3A/, '/$1:'); }

module.exports = { launch, findChrome, PAGE_HELPERS, fileUrl };
