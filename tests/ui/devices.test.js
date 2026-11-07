// Популярные устройства: телефоны, телефоны лёжа, планшеты, ноутбуки и мониторы.
// На каждом — облегчённый сценарий: вкладки касанием, режимы тренажёра, «самый тесный» стол, окно настроек, кнопки хода.
// Подробные сценарии для нескольких экранов — в mobile.test.js. Только некоторые устройства: DEVICES=iPad,1366 node tests/ui/devices.test.js
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const { GEO, STRESS } = require('../lib/layout');
const TS = H.suite('Интерфейс: популярные устройства (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'poker-trainer.html'));
const OUT = path.join(__dirname, '..', 'out', 'devices');

// Размеры — в CSS-пикселях, как их видит браузер. kind: phone — телефон (вкладки внизу), land — телефон лёжа,
// tablet — планшет, desk — компьютер (мышь, без сенсора).
const DEVICES = [
  ['iPhone SE (1-е поколение)', 320, 568, 'phone'],
  ['iPhone SE (2-е и 3-е поколение), iPhone 8', 375, 667, 'phone'],
  ['iPhone 12 mini / 13 mini', 375, 812, 'phone'],
  ['iPhone 12 / 13 / 14', 390, 844, 'phone'],
  ['iPhone 14 Pro / 15 / 16', 393, 852, 'phone'],
  ['iPhone 16 Pro', 402, 874, 'phone'],
  ['iPhone 14 Plus / 15 Pro Max', 430, 932, 'phone'],
  ['iPhone 16 Pro Max', 440, 956, 'phone'],
  ['Galaxy S8 / S9', 360, 740, 'phone'],
  ['Galaxy S20–S24 и массовые Android', 360, 800, 'phone'],
  ['Galaxy A, Pixel 7 / 8', 412, 915, 'phone'],
  ['Xiaomi Redmi Note', 393, 873, 'phone'],
  ['Galaxy Z Fold сложен', 344, 882, 'phone'],
  ['Galaxy Z Fold развёрнут', 673, 841, 'phone'],
  ['iPhone SE лёжа', 667, 375, 'land'],
  ['Android лёжа', 800, 360, 'land'],
  ['iPhone 12–14 лёжа', 844, 390, 'land'],
  ['iPhone Pro Max лёжа', 932, 430, 'land'],
  ['iPad mini', 744, 1133, 'tablet'],
  ['Galaxy Tab S', 800, 1280, 'tablet'],
  ['iPad 9', 810, 1080, 'tablet'],
  ['iPad 10 / iPad Air', 820, 1180, 'tablet'],
  ['iPad Pro 11', 834, 1194, 'tablet'],
  ['iPad Pro 12,9', 1024, 1366, 'tablet'],
  ['iPad mini лёжа', 1133, 744, 'tablet'],
  ['iPad 10 / iPad Air лёжа', 1180, 820, 'tablet'],
  ['iPad Pro 12,9 лёжа', 1366, 1024, 'tablet'],
  ['MacBook Air 13 (1280×800)', 1280, 800, 'desk'],
  ['ноутбук 1366×768', 1366, 768, 'desk'],
  ['MacBook Air 1440×900', 1440, 900, 'desk'],
  ['MacBook Pro 14', 1512, 982, 'desk'],
  ['ноутбук 1536×864 (Windows, масштаб 125%)', 1536, 864, 'desk'],
  ['монитор 1920×1080', 1920, 1080, 'desk'],
  ['монитор 2560×1440', 2560, 1440, 'desk']
];

// Что вылезает за экран по горизонтали (кроме того, что лежит в прокручиваемом блоке).
const WIDE = `__t.$$('body *').filter(el => { if (!__g.shown(el)) return false; const r = el.getBoundingClientRect(); if (r.right <= innerWidth + 1 && r.left >= -1) return false;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false; }
  return true; }).slice(0, 5).map(el => el.tagName + '.' + el.className)`;

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  const only = (process.env.DEVICES || '').split(',').map(s => s.trim()).filter(Boolean);
  let list = DEVICES.filter(d => !only.length || only.some(o => d[0].includes(o) || (d[1] + '×' + d[2]).includes(o)));
  // Быстрый прогон: каждое третье устройство, но все виды
  if (H.QUICK && !only.length) list = list.filter((d, i) => i % 3 === 0 || !list.slice(0, i).some(x => x[3] === d[3]));
  try {
    for (const [name, w, h, kind] of list) {
      const touch = kind !== 'desk', phone = w <= 720;
      const tag = w + 'x' + h;
      const page = await browser.newPage({ viewport: [w, h], mobile: touch });
      if (touch) await page.touch(true);
      const E = code => page.eval(PAGE_HELPERS + GEO + STRESS + code);
      await page.goto(URL);
      await E("await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
      // Анимации здесь не проверяем — выключаем их, чтобы не ждать раздачу карт на каждом шаге
      await E("const s = document.createElement('style'); s.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }'; document.head.appendChild(s); return 1");
      const D = name + ' ' + w + '×' + h;

      TS.group(D + ' · вкладки');
      const tabs = [];
      for (const tab of ['trainer', 'game', 'rules', 'stats']) {
        const r = await E(`const b = __t.$('[data-tab=${tab}]'); b.scrollIntoView({ block: 'nearest' }); const r = __g.R(b); return [r.l + r.w / 2, r.t + r.h / 2, r.h]`);
        if (touch) await page.tap(r[0], r[1]); else await E(`__t.click('[data-tab=${tab}]'); return 1`);
        await E('await __t.sleep(' + (tab === 'game' ? 250 : 80) + '); return 1');
        const st = await E(`return { active: __t.$('#tab-${tab}').classList.contains('active'), sw: document.documentElement.scrollWidth, iw: innerWidth, wide: ${WIDE},
          kbd: __t.$$('kbd').filter(__g.shown).length, nav: getComputedStyle(__t.$('.tabs')).position, navB: __g.R(__t.$('.tabs')).b, ih: innerHeight }`);
        tabs.push([tab, st, r[2]]);
      }
      TS.eq('все вкладки открываются ' + (touch ? 'касанием' : 'щелчком'), tabs.filter(t => !t[1].active).map(t => t[0]), []);
      TS.eq('нет прокрутки вбок', tabs.filter(t => t[1].sw > t[1].iw).map(t => t[0] + ': ' + t[1].sw + ' > ' + t[1].iw), []);
      TS.eq('ничего не вылезает за экран', tabs.filter(t => t[1].wide.length).map(t => t[0] + ': ' + t[1].wide.join(', ')), []);
      if (touch) TS.eq('подсказки клавиш скрыты на сенсорном экране', tabs.filter(t => t[1].kbd).map(t => t[0]), []);
      if (phone) {
        TS.check('вкладки — панель у нижнего края', tabs.every(t => t[1].nav === 'fixed' && Math.abs(t[1].navB - t[1].ih) <= 1), tabs.map(t => [t[1].nav, t[1].navB, t[1].ih]));
        TS.check('вкладки удобны для пальца (не ниже 44 px)', tabs.every(t => t[2] >= 44), tabs.map(t => t[2]));
      } else TS.check('вкладки в шапке', tabs.every(t => t[1].nav !== 'fixed'));

      TS.group(D + ' · тренажёр');
      const modes = await E(`__t.click('[data-tab=trainer]'); await __t.sleep(80); const out = [];
        for (const b of __t.$$('#mode-tabs [data-mode]')) {
          b.click(); await __t.sleep(40);
          const m = b.dataset.mode;
          if (m === 'name') { const x = __t.$('#task [data-cat]'); if (x) x.click(); }
          else if (m === 'best') { for (let i = 0; i < 5; i++) { const c = __t.$$('#task [data-i]')[i]; if (c) c.click(); await __t.sleep(5); } __t.key('Enter'); }
          else if (m === 'winner') { const x = __t.$('#task [data-w]'); if (x) x.click(); }
          else if (m === 'speed') { __t.key(' '); await __t.sleep(60); const x = await __t.until(() => __t.$('#task [data-cat]:not([disabled])'), 1500); if (x) x.click(); }
          else { const x = __t.$('#task [data-opt]'); if (x) x.click(); }
          await __t.sleep(60);
          const wide = ${WIDE}, sw = document.documentElement.scrollWidth;
          if (wide.length || sw > innerWidth) out.push(m + ': ' + sw + ' ' + wide.join(', '));
          __t.key('Escape');
        }
        return out`);
      TS.eq('все режимы с разбором ответа помещаются по ширине', modes, []);

      TS.group(D + ' · стол');
      await E("__t.click('[data-tab=game]'); await __t.sleep(150); return 1");
      const stress = [];
      for (const opp of [5, 4, 3, 2, 1]) {
        // пустые места под общие карты занимают столько же, сколько сами карты, поэтому хватает 5 карт и вскрытия
        (await E(`return await __stress(${opp}, 5)`)).forEach(p => stress.push(opp + ' соп.: ' + p));
        (await E(`return await __stress(${opp}, 5, true)`)).forEach(p => stress.push(opp + ' соп., вскрытие: ' + p));
      }
      TS.eq('самый тесный стол при любом числе соперников: ничего не налезает', stress.slice(0, 6), []);
      await page.screenshot(path.join(OUT, tag + '-stress.png'));

      const modal = await E(`__t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
        const m = __t.$('.modal'), r = __g.R(m), cs = getComputedStyle(m), fits = r.h <= innerHeight + 1 || cs.overflowY === 'auto' || cs.overflowY === 'scroll';
        const apply = __g.R(__t.$('#ts-apply'));
        const f = __t.$('#ts-form'); f.elements.opp.value = '5'; f.elements.speed.value = 'fast'; f.elements.showCards.checked = true;
        return { l: r.l, r: r.r, iw: innerWidth, fits, applyH: apply.h }`);
      TS.check('окно настроек стола помещается по ширине', modal.l >= -1 && modal.r <= modal.iw + 1, modal);
      TS.check('окно настроек помещается по высоте или прокручивается', modal.fits, modal);
      if (touch) TS.check('кнопка «Применить» удобна для пальца', modal.applyH >= 36, modal.applyH);
      await E("__t.click('#ts-apply'); await __t.sleep(250); scrollTo(0, 0); return 1");

      // Ждём своего хода и проверяем кнопки хода и панель рейза
      const turn = await E(`const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
          const n = __t.$('#action-bar [data-act=next]:not([disabled]), #action-bar [data-act=restart]:not([disabled])'); if (n) n.click();
          if (__t.$('#action-bar [data-act=call]:not([disabled])')) break;
          await __t.sleep(120);
        }
        await __t.until(() => !document.getAnimations().some(a => a.playState === 'running'), 1500);
        const btns = __t.$$('#action-bar .act-buttons button').filter(__g.shown);
        if (!btns.length) return null;
        ${phone ? '' : "btns[btns.length - 1].scrollIntoView({ block: 'nearest' }); await __t.sleep(50);"}
        const nav = __g.shown(__t.$('.tabs')) && getComputedStyle(__t.$('.tabs')).position === 'fixed' ? __g.R(__t.$('.tabs')) : null;
        const bad = [], small = [];
        btns.forEach(b => {
          const r = __g.R(b), x = r.l + r.w / 2, y = r.t + r.h / 2, top = document.elementFromPoint(x, y);
          if (r.t < 0 || r.b > innerHeight + 1 || (nav && r.b > nav.t + 1) || !top || !(top === b || b.contains(top))) bad.push(b.innerText.trim() + ' @' + Math.round(y));
          if (${touch ? 'r.h < 36' : 'false'}) small.push(b.innerText.trim() + ' ' + Math.round(r.h));
        });
        const box = __t.$('.raise-box'), rb = box && __g.shown(box) ? __g.R(box) : null;
        const raiseOut = rb ? __t.$$('.raise-box .btn, .raise-box input').filter(__g.shown).map(__g.R).filter(r => r.l < rb.l - 1 || r.r > rb.r + 1).length : 0;
        return { n: btns.length, bad, small, raiseOut, sw: document.documentElement.scrollWidth, iw: innerWidth, table: __g.tableProblems() }`);
      TS.check('дошли до своего хода', !!turn);
      if (turn) {
        TS.eq('кнопки хода видны и ничем не закрыты', turn.bad, []);
        if (touch) TS.eq('кнопки хода удобны для пальца', turn.small, []);
        TS.eq('панель рейза не вылезает из своего блока', turn.raiseOut, 0);
        TS.check('во время хода нет прокрутки вбок', turn.sw <= turn.iw, [turn.sw, turn.iw]);
        TS.eq('во время хода за столом ничего не налезает', turn.table, []);
      }
      await page.screenshot(path.join(OUT, tag + '-turn.png'));

      // Второй проход: светлая тема и английский — другие длины текстов и другие цвета
      TS.group(D + ' · светлая тема, английский');
      await E(`const dark = document.documentElement.getAttribute('data-theme') === 'dark'; if (dark) __t.click('#theme-btn'); localStorage.setItem('pk-lang', 'en'); return 1`);
      await page.reload();
      await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
      await E("const s = document.createElement('style'); s.textContent = '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }'; document.head.appendChild(s); return 1");
      TS.eq('язык и тема переключились', await E("return [PKI18n.lang, document.documentElement.getAttribute('data-theme')]"), ['en', 'light']);
      const CYR = `(() => { const re = /[А-Яа-яЁё]/; return document.body.innerText.split('\\n').filter(l => re.test(l)).slice(0, 4); })()`;
      const en = [];
      for (const tab of ['trainer', 'game', 'rules', 'stats']) {
        const st = await E(`__t.click('[data-tab=${tab}]'); await __t.sleep(${tab === 'game' ? 250 : 80}); return { sw: document.documentElement.scrollWidth, iw: innerWidth, wide: ${WIDE}, cyr: ${CYR} }`);
        if (st.sw > st.iw) en.push(tab + ': прокрутка вбок ' + st.sw + ' > ' + st.iw);
        if (st.wide.length) en.push(tab + ': вылезает ' + st.wide.join(', '));
        if (st.cyr.length) en.push(tab + ': русский текст ' + st.cyr.join(' | '));
      }
      TS.eq('все вкладки помещаются, русского текста нет', en, []);
      const enModes = await E(`__t.click('[data-tab=trainer]'); await __t.sleep(60); const out = [];
        for (const b of __t.$$('#mode-tabs [data-mode]')) {
          b.click(); await __t.sleep(30);
          const o = __t.$('#task [data-opt], #task [data-cat], #task [data-w]'); if (o) o.click(); await __t.sleep(40);
          const wide = ${WIDE}, cyr = ${CYR};
          if (wide.length || document.documentElement.scrollWidth > innerWidth) out.push(b.dataset.mode + ': ' + wide.join(', '));
          if (cyr.length) out.push(b.dataset.mode + ': ' + cyr.join(' | '));
          __t.key('Escape');
        }
        return out`);
      TS.eq('режимы тренажёра по-английски помещаются по ширине', enModes, []);
      await E("__t.click('[data-tab=game]'); await __t.sleep(150); return 1");
      const enStress = [];
      for (const opp of [5, 3, 1]) (await E(`return await __stress(${opp}, 5)`)).forEach(p => enStress.push(opp + ' соп.: ' + p));
      TS.eq('самый тесный стол по-английски: ничего не налезает', enStress.slice(0, 6), []);
      await page.screenshot(path.join(OUT, tag + '-en-light.png'));

      TS.eq('нет ошибок JavaScript', page.errors, []);
      await page.close();
    }
  } catch (e) {
    TS.check('тест завершился без исключения', false, e.stack || String(e));
  } finally {
    await browser.close();
    TS.done();
  }
})();
