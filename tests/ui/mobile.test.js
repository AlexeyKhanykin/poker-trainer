// Вёрстка на телефоне, планшете и в горизонтальной ориентации: настоящий Chrome с подменой экрана и сенсорного ввода.
// Проверяем, что ничего не вылезает за экран, кнопки нажимаются пальцем, места за столом не налезают друг на друга.
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const TS = H.suite('Интерфейс: телефон, планшет, поворот экрана (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'index.html'));
const OUT = path.join(__dirname, '..', 'out', 'mobile');

const { GEO, STRESS } = require('../lib/layout');

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  try {
    const SIZES = [
      { name: 'телефон 360×740', w: 360, h: 740, phone: true },
      { name: 'телефон 390×844', w: 390, h: 844, phone: true },
      { name: 'планшет 768×1024', w: 768, h: 1024, phone: false, touch: true },
      { name: 'телефон лёжа 844×390', w: 844, h: 390, phone: false, touch: true, land: true },
      { name: 'компьютер 1280×860', w: 1280, h: 860, phone: false }
    ];
    // SIZES=360,390 node tests/ui/mobile.test.js — только эти экраны (для отладки)
    const only = (process.env.SIZES || '').split(',').filter(Boolean);
    for (const S of SIZES.filter(S => !only.length || only.some(w => String(S.w) === w))) {
      const page = await browser.newPage({ viewport: [S.w, S.h], mobile: S.phone || !!S.touch });
      if (S.phone || S.touch) await page.touch(true);
      const E = code => page.eval(PAGE_HELPERS + GEO + STRESS + code);
      await page.goto(URL);
      await E("await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
      const tag = S.w + 'x' + S.h;

      TS.group(S.name + ' · вкладки');
      for (const tab of ['trainer', 'game', 'rules', 'stats']) {
        // Нажимаем на вкладку настоящим касанием в её центре — так проверяется, что её ничто не закрывает.
        const r = await E(`const b = __t.$('[data-tab=${tab}]'); b.scrollIntoView({ block: 'nearest' }); const r = __g.R(b); return [r.l + r.w / 2, r.t + r.h / 2, r.h]`);
        await page.tap(r[0], r[1]);
        await E('await __t.sleep(' + (tab === 'game' ? 700 : 150) + '); return 1');
        const st = await E(`return {
          active: __t.$('#tab-${tab}').classList.contains('active'),
          sw: document.documentElement.scrollWidth, iw: innerWidth,
          variant: __g.shown(__t.$('.top .variant-pick')),
          kbd: __t.$$('kbd').filter(__g.shown).length,
          help: __t.$('#help-btn') ? __g.shown(__t.$('#help-btn')) : false,
          wide: __t.$$('main *').filter(el => { if (!__g.shown(el)) return false; const r = el.getBoundingClientRect(); if (r.right <= innerWidth + 1 && r.left >= -1) return false;
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false; }
            return true; }).slice(0, 5).map(el => el.tagName + '.' + el.className)
        }`);
        TS.check(tab + ': вкладка открылась касанием', st.active);
        TS.check(tab + ': нет прокрутки вбок', st.sw <= st.iw, [st.sw, st.iw]);
        TS.eq(tab + ': ничего не вылезает за экран', st.wide, []);
        TS.eq(tab + ': список вариантов ' + (tab === 'trainer' || tab === 'game' ? 'виден' : 'скрыт'), st.variant, tab === 'trainer' || tab === 'game');
        if (S.phone || S.touch) {
          TS.eq(tab + ': подсказки клавиш скрыты на сенсорном экране', st.kbd, 0);
          TS.check(tab + ': кнопка справки по клавишам скрыта', !st.help);
        }
        if (S.phone) TS.check(tab + ': высота вкладки удобна для пальца', r[2] >= 44, r[2]);
        await page.screenshot(path.join(OUT, tag + '-' + tab + '.png'));
      }

      if (S.phone) {
        TS.group(S.name + ' · нижняя панель вкладок');
        const nav = await E(`const n = __g.R(__t.$('.tabs')); return { bottom: n.b, h: n.h, pos: getComputedStyle(__t.$('.tabs')).position, short: __t.$$('.tab-btn .t-short').filter(__g.shown).length, long: __t.$$('.tab-btn .t-long').filter(__g.shown).length, icons: __t.$$('.tab-btn .tab-ic').filter(__g.shown).length, ih: innerHeight }`);
        TS.eq('панель закреплена', nav.pos, 'fixed');
        TS.check('панель у нижнего края экрана', Math.abs(nav.bottom - nav.ih) <= 1, nav);
        TS.check('панель невысокая', nav.h < 90, nav.h);
        TS.eq('короткие подписи и значки', [nav.short, nav.long, nav.icons], [4, 0, 4]);
        await E('scrollTo(0, document.body.scrollHeight); await __t.sleep(100); return 1');
        TS.check('после прокрутки вниз панель на месте', Math.abs((await E("return __g.R(__t.$('.tabs')).b")) - S.h) <= 1);
        await E('scrollTo(0, 0); return 1');
      } else {
        TS.check('вкладки не закреплены внизу', await E("return getComputedStyle(__t.$('.tabs')).position !== 'fixed'"));
        if (S.land) TS.check('шапка в одну строку', await E("return __g.R(__t.$('.top')).h < 80"), await E("return __g.R(__t.$('.top')).h"));
      }

      // «Самый тесный» стол: все ставят по 1 000, у всех длинные подписи — при любом числе соперников
      TS.group(S.name + ' · тесный стол');
      await E("__t.click('[data-tab=game]'); await __t.sleep(150); return 1");
      for (const opp of (H.QUICK ? [5, 2, 1] : [5, 4, 3, 2, 1])) {
        // пустые места под общие карты занимают столько же, сколько сами карты, поэтому хватает 5 карт и вскрытия
        TS.eq('соперников ' + opp + ', 5 общих карт: ничего не налезает', await E(`return await __stress(${opp}, 5)`), []);
        TS.eq('соперников ' + opp + ', вскрытие: ничего не налезает', await E(`return await __stress(${opp}, 5, true)`), []);
      }
      await page.screenshot(path.join(OUT, tag + '-stress.png'));

      // Игра: несколько раздач, проверка стола на каждом ходу; ходим настоящими касаниями
      for (const opp of (S.phone ? [5, 2] : [5])) {
        TS.group(S.name + ' · игра, соперников: ' + opp);
        const set = await E(`__t.click('[data-tab=game]'); await __t.sleep(100);
          __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
          const m = __g.R(__t.$('.modal'));
          const f = __t.$('#ts-form'); f.elements.opp.value = '${opp}'; f.elements.speed.value = 'fast'; f.elements.showCards.checked = true;
          __t.click('#ts-apply'); await __t.sleep(300); scrollTo(0, 0);
          return { modal: m, seats: __t.$$('#table [data-seat]').length, iw: innerWidth, ih: innerHeight }`);
        TS.eq('за столом ' + (opp + 1), set.seats, opp + 1);
        if (S.phone && opp === 5) {
          TS.check('окно настроек — во всю ширину', Math.abs(set.modal.w - set.iw) <= 1, set.modal);
          TS.check('окно настроек прижато к низу', Math.abs(set.modal.b - set.ih) <= 1, set.modal);
        }
        const problems = new Set();
        let turns = 0, taps = 0, covered = [], small = [];
        for (let k = 0; k < (H.QUICK ? 25 : 45) && turns < (H.QUICK ? 4 : 8); k++) {
          const st = await E(`await __t.sleep(220);
            // кнопки панели хода (у сообщения «Игра окончена» на столе есть своя копия «Новая игра»)
            const next = __t.$('#action-bar [data-act=next]:not([disabled]), #action-bar [data-act=restart]:not([disabled])');
            const call = __t.$('[data-act=call]:not([disabled])');
            const b = next || call;
            if (!b) return { wait: true };
            // ждём, пока карты долетят (анимация раздачи), и только потом меряем
            await __t.until(() => !document.getAnimations().some(a => a.playState === 'running'), 1500);
            const out = { problems: __g.tableProblems(), turn: !!call };
            ${S.phone ? '' : "b.scrollIntoView({ block: 'nearest' });"}
            const r = __g.R(b), nav = __g.shown(__t.$('.tabs')) && getComputedStyle(__t.$('.tabs')).position === 'fixed' ? __g.R(__t.$('.tabs')) : null;
            out.x = r.l + r.w / 2; out.y = r.t + r.h / 2;
            out.visible = r.t >= 0 && r.b <= innerHeight && (!nav || r.b <= nav.t + 1);
            const top = document.elementFromPoint(out.x, out.y); out.ontop = !!top && (top === b || b.contains(top)); out.topEl = top ? top.tagName + '.' + top.className : null; out.btn = b.innerText.trim(); out.bottom = r.b; out.dbg = [scrollY, innerHeight, __g.R(__t.$('#action-bar')), __g.R(__t.$('.act-status'))].map(v => typeof v === 'object' ? [v.l, v.t, v.r, v.b].map(Math.round).join(',') : v).join(' | ');
            out.small = __t.$$('#action-bar button').filter(__g.shown).filter(x => x.getBoundingClientRect().height < ${S.phone || S.touch ? 36 : 0}).map(x => x.innerText.trim());
            return out;`);
          if (st.wait) continue;
          st.problems.forEach(p => problems.add(p));
          if (st.turn) turns++;
          if (!st.visible || !st.ontop) covered.push([st.btn, Math.round(st.x), Math.round(st.y), Math.round(st.bottom), st.visible, st.topEl, st.dbg]);
          small = small.concat(st.small);
          await page.tap(st.x, st.y); taps++;
        }
        TS.check('сыграно несколько ходов', turns >= 3, turns);
        TS.eq('за столом ничего не налезает друг на друга', Array.from(problems), []);
        TS.eq('кнопки хода видны и не закрыты', covered.slice(0, 4), []);
        TS.eq('кнопки хода удобного размера', small, []);
        TS.check('нажатия пальцем работают', taps >= turns);
        await page.screenshot(path.join(OUT, tag + '-game-' + opp + '.png'));
      }

      // Рейз ползунком и быстрыми кнопками
      if (S.phone) {
        TS.group(S.name + ' · рейз');
        const r = await E(`for (let i = 0; i < 40 && !__t.$('#raise-slider'); i++) { const n = __t.$('[data-act=next]:not([disabled])'); if (n) n.click(); await __t.sleep(200); }
          const s = __t.$('#raise-slider'); if (!s) return null;
          const box = __g.R(__t.$('.raise-box')), btns = __t.$$('.raise-box .btn').map(__g.R);
          return { rows: new Set(btns.map(b => Math.round(b.t))).size, inside: btns.every(b => b.l >= box.l - 1 && b.r <= box.r + 1), slider: __g.R(s).w, input: __g.R(__t.$('#raise-input')).w, iw: innerWidth }`);
        TS.check('панель рейза показана', !!r);
        if (r) {
          TS.eq('быстрые кнопки рейза — в одну строку', r.rows, 1);
          TS.check('кнопки рейза не вылезают', r.inside);
          TS.check('ползунок широкий', r.slider > r.iw * 0.5, r.slider);
        }
      }

      // Вибрация, когда ход переходит к вам; выключается в настройках стола
      if (S.phone && S.w === 390) {
        TS.group(S.name + ' · вибрация');
        const waitTurn = `const t0 = Date.now(); while (Date.now() - t0 < 20000) { const n = __t.$('#action-bar [data-act=next]:not([disabled])'); if (n) n.click();
          const c = __t.$('#action-bar [data-act=call]:not([disabled])'); if (c && window.__vib.length > before) break; if (c) { c.click(); } await __t.sleep(80); }`;
        const on = await E(`window.__vib = []; navigator.vibrate = ms => { window.__vib.push(ms); return true; }; const before = 0;
          __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form')); const box = __t.$('#ts-form [name=vibrate]');
          const shown = !!box; if (box) box.checked = true; __t.click('#ts-save'); await __t.sleep(100);
          ${waitTurn} return { shown, n: window.__vib.length, ms: window.__vib[0] }`);
        TS.check('переключатель вибрации есть на телефоне', on.shown);
        TS.check('на вашем ходу телефон вибрирует', on.n >= 1 && on.ms > 0 && on.ms <= 100, on);
        const off = await E(`__t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form')); __t.$('#ts-form [name=vibrate]').checked = false; __t.click('#ts-save'); await __t.sleep(100);
          window.__vib = []; let turns = 0; const t0 = Date.now();
          while (turns < 2 && Date.now() - t0 < 20000) { const n = __t.$('#action-bar [data-act=next]:not([disabled])'); if (n) n.click(); const c = __t.$('#action-bar [data-act=call]:not([disabled])'); if (c) { turns++; c.click(); } await __t.sleep(80); }
          const r = { turns, n: window.__vib.length };
          __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form')); __t.$('#ts-form [name=vibrate]').checked = true; __t.click('#ts-save'); await __t.sleep(50);
          return r`);
        TS.check('выключенная вибрация молчит', off.turns >= 1 && off.n === 0, off);
      }

      // Поворот экрана: стол перестраивается без перезагрузки
      if (S.phone && S.w === 390) {
        TS.group(S.name + ' · смена размера экрана');
        const pos = () => E("return __t.$$('#table .seat').map(s => s.style.left + '/' + s.style.top).join(' ')");
        const phonePos = await pos();
        await page.viewport(1280, 860, false); await page.touch(false);
        await E('await __t.sleep(300); return 1');
        const deskPos = await pos();
        TS.check('на широком экране места другие', deskPos !== phonePos, [phonePos, deskPos]);
        TS.eq('на широком экране стол цел', await E('return __g.tableProblems()'), []);
        TS.check('вкладки снова в шапке', await E("return getComputedStyle(__t.$('.tabs')).position !== 'fixed'"));
        await page.viewport(S.w, S.h, true); await page.touch(true);
        await E('await __t.sleep(300); return 1');
        TS.eq('обратно на телефоне — прежняя раскладка', await pos(), phonePos);
        TS.eq('и стол снова цел', await E('return __g.tableProblems()'), []);
      }

      TS.group(S.name + ' · ошибки');
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
