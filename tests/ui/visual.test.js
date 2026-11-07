// Сравнение скриншотов с эталоном: ловит то, что не видно проверкам наложений, — съехавший цвет, отступ, шрифт, пропавший элемент.
// Эталоны лежат в tests/visual/. Нет эталона — он создаётся. Изменили внешний вид намеренно — посмотрите разницу
// в tests/out/visual/*-diff.png и обновите эталоны: UPDATE_SNAPSHOTS=1 node tests/ui/visual.test.js
// Эталоны зависят от шрифтов системы: на другом компьютере их, скорее всего, придётся пересоздать.
const fs = require('fs');
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const { GEO, STRESS } = require('../lib/layout');
const TS = H.suite('Интерфейс: скриншоты совпадают с эталоном (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'poker-trainer.html'));
const BASE = path.join(__dirname, '..', 'visual');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;
const MAX_DIFF = 0.0005; // допускаем 0,05 % отличающихся пикселей (сглаживание); при одинаковых условиях снимки совпадают до пикселя

// Одинаковые снимки при каждом запуске: своя случайность с постоянным зерном, постоянная дата, без анимаций и мигающего курсора.
const FREEZE = `(() => {
  let s = 20260101; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const T0 = Date.UTC(2026, 0, 15, 12, 0, 0), RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(T0 + performance.now()); } static now() { return T0 + performance.now(); } }
  window.Date = FD;
  document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'; document.head.appendChild(st); });
})();`;

const COMBOS = [
  { key: 'desk-dark-ru', w: 1280, h: 860, mobile: false, theme: 'dark', lang: 'ru' },
  { key: 'desk-light-ru', w: 1280, h: 860, mobile: false, theme: 'light', lang: 'ru' },
  { key: 'desk-light-en', w: 1280, h: 860, mobile: false, theme: 'light', lang: 'en' },
  { key: 'phone-dark-ru', w: 390, h: 844, mobile: true, theme: 'dark', lang: 'ru' },
  { key: 'phone-light-ru', w: 390, h: 844, mobile: true, theme: 'light', lang: 'ru' },
  { key: 'phone-light-en', w: 390, h: 844, mobile: true, theme: 'light', lang: 'en' }
];
// Экран: что сделать на странице перед снимком
const SCREENS = {
  trainer: `__t.click('[data-tab=trainer]'); await __t.sleep(50); __t.click('#mode-tabs [data-mode=name]'); await __t.sleep(50);`,
  spot: `__t.click('[data-tab=trainer]'); await __t.sleep(50); __t.click('#mode-tabs [data-mode=spot]'); await __t.sleep(50); __t.$('#task [data-opt]').click(); await __t.sleep(50); __t.$('#feedback').scrollIntoView({ block: 'end' }); await __t.sleep(30);`,
  table: `__t.click('[data-tab=game]'); clearTimeout(__pkui.G.timer); await __stress(5, 5); clearTimeout(__pkui.G.timer); scrollTo(0, 0);`,
  rules: `__t.click('[data-tab=rules]'); await __t.sleep(50);`,
  stats: `__t.click('[data-tab=stats]'); await __t.sleep(80); const b = __t.$('#st-view [data-view=data]'); if (b) b.click(); await __t.sleep(80);`
};

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  fs.mkdirSync(BASE, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const cmp = await browser.newPage();
  const created = [], updated = [];
  try {
    for (const C of COMBOS) {
      TS.group(C.key);
      const page = await browser.newPage();
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: C.w, height: C.h, deviceScaleFactor: 1, mobile: C.mobile });
      if (C.mobile) { await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await page.touch(true); }
      await page.colorScheme(C.theme);
      await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: FREEZE + `try { localStorage.setItem('pk-lang', '${C.lang}'); } catch (e) {}` });
      const E = code => page.eval(PAGE_HELPERS + GEO + STRESS + code);
      for (const [name, act] of Object.entries(SCREENS)) {
        // Каждый экран — с чистого листа, чтобы порядок не влиял на случайные раздачи
        await page.cdp('Storage.clearDataForOrigin', { origin: 'file://', storageTypes: 'all' }).catch(() => {});
        await page.goto(URL);
        await E(`await __t.until(() => window.PKStore && PKStore.info().backend !== 'memory', 5000); scrollTo(0, 0); ${act} await __t.sleep(60); return 1`);
        const file = C.key + '-' + name + '.png', cur = path.join(OUT, file), base = path.join(BASE, file);
        await page.screenshot(cur);
        if (UPDATE || !fs.existsSync(base)) {
          (fs.existsSync(base) ? updated : created).push(file); fs.copyFileSync(cur, base);
          TS.check(file + ': эталон ' + (UPDATE ? 'обновлён' : 'создан'), true);
          continue;
        }
        const a = 'data:image/png;base64,' + fs.readFileSync(base).toString('base64'), b = 'data:image/png;base64,' + fs.readFileSync(cur).toString('base64');
        const r = await cmp.eval(`
          const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
          const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
          if (A.width !== B.width || A.height !== B.height) return { size: [A.width, A.height, B.width, B.height] };
          const w = A.width, h = A.height, cv = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
          const da = cv(A), db = cv(B), out = new ImageData(w, h);
          let diff = 0;
          for (let i = 0; i < da.data.length; i += 4) {
            const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
            if (d > 24) { diff++; out.data[i] = 255; out.data[i + 3] = 255; } else { const g = (db.data[i] + db.data[i + 1] + db.data[i + 2]) / 3; out.data[i] = out.data[i + 1] = out.data[i + 2] = g; out.data[i + 3] = 60; }
          }
          let png = null;
          if (diff) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0); png = c.toDataURL('image/png'); }
          return { diff, total: w * h, png }`);
        if (r.size) { TS.check(file + ': размер совпадает с эталоном', false, r.size); continue; }
        if (r.png) fs.writeFileSync(path.join(OUT, file.replace('.png', '-diff.png')), Buffer.from(r.png.split(',')[1], 'base64'));
        TS.check(file + ': совпадает с эталоном', r.diff / r.total <= MAX_DIFF, { отличается: (r.diff / r.total * 100).toFixed(2) + '%', разница: 'tests/out/visual/' + file.replace('.png', '-diff.png') });
      }
      TS.eq('нет ошибок на странице', page.errors, []);
      await page.close();
    }
  } catch (e) {
    TS.check('сценарий без исключений', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    TS.done(created.length ? 'созданы эталоны: ' + created.length : updated.length ? 'обновлены эталоны: ' + updated.length : '');
  }
})();
