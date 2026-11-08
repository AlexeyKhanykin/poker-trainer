// Интерфейс в настоящем Chrome (без окна): все вкладки, режимы тренажёра, игра, статистика, сохранение данных.
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const TS = H.suite('Интерфейс: сценарии на компьютере (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'index.html'));
const OUT = path.join(__dirname, '..', 'out');

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  try {
    const page = await browser.newPage({ viewport: [1280, 860] });
    const E = code => page.eval(PAGE_HELPERS + code);
    await page.goto(URL);

    TS.group('запуск');
    TS.eq('заголовок', await E('return document.title'), 'Покерный тренер');
    TS.eq('данные в IndexedDB', await E("await __t.until(() => PKStore.info().backend === 'indexeddb'); return PKStore.info().backend"), 'indexeddb');
    TS.eq('4 вкладки', await E("return __t.$$('.tab-btn').map(b => b.dataset.tab)"), ['trainer', 'game', 'rules', 'stats']);
    TS.check('открыт тренажёр', await E("return __t.$('#tab-trainer').classList.contains('active')"));
    TS.check('нет ошибок при загрузке', page.errors.length === 0, page.errors);

    TS.group('вкладки');
    for (const tab of ['game', 'rules', 'stats', 'trainer']) {
      const r = await E(`__t.click('[data-tab=${tab}]'); await __t.sleep(60); return [__t.$('#tab-${tab}').classList.contains('active'), __t.$$('.tab-panel.active').length, __t.$('[data-tab=${tab}]').getAttribute('aria-selected')]`);
      TS.eq('вкладка ' + tab + ' открывается одна', r, [true, 1, 'true']);
    }

    // Тренажёр: каждый режим в каждом варианте
    const MODES = await E("return __t.$$('#mode-tabs [data-mode]').map(b => b.dataset.mode)");
    TS.eq('8 режимов тренажёра', MODES, ['name', 'best', 'winner', 'speed', 'odds', 'preflop', 'spot', 'review']);
    for (const vk of ['holdem', 'omaha', 'omaha5', 'short']) {
      TS.group('тренажёр · ' + vk);
      const sel = await E(`const s = __t.$('#variant-select'); s.value = '${vk}'; s.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(80); return s.value`);
      TS.eq('вариант выбран', sel, vk);
      for (const mode of MODES) {
        const r = await E(`
          __t.click('#mode-tabs [data-mode=${mode}]'); await __t.sleep(60);
          const before = PKStore.all('answers').length;
          const task = __t.$('#task');
          const out = { taskText: task.innerText.length };
          if ('${mode}' === 'name') __t.click(__t.$('#task [data-cat]'));
          else if ('${mode}' === 'best') { out.cards = __t.$$('#task [data-i]').length; for (let i = 0; i < 5; i++) { __t.$$('#task [data-i]')[i].click(); await __t.sleep(15); } __t.key('Enter'); }
          else if ('${mode}' === 'winner') __t.click(__t.$('#task [data-w]'));
          else if ('${mode}' === 'speed') { __t.key(' '); await __t.sleep(80); const b = await __t.until(() => __t.$('#task [data-cat]:not([disabled])')); if (b) b.click(); }
          else if ('${mode}' === 'review') { out.empty = !!__t.$('#task .empty-state'); const o = __t.$('#task [data-opt]'); if (o) o.click(); }
          else __t.click(__t.$('#task [data-opt]'));
          await __t.sleep(80);
          out.answered = PKStore.all('answers').length - before;
          out.feedback = __t.text('#feedback').length;
          out.last = PKStore.all('answers').slice(-1)[0];
          __t.key('Enter'); await __t.sleep(60);
          out.next = __t.$('#task').innerText.length;
          return out;`);
        TS.check(vk + '/' + mode + ': задание показано', r.taskText > 20, r);
        if (mode === 'review' && r.empty) { TS.check(vk + '/review: без ошибок — понятная заглушка', r.answered === 0); continue; }
        if (mode === 'speed') { TS.check(vk + '/speed: ответ засчитан', r.answered === 1 && r.last.mode === 'speed', r); continue; }
        TS.check(vk + '/' + mode + ': ответ сохранён', r.answered === 1 && r.last.mode === mode && r.last.variant === vk, r);
        TS.check(vk + '/' + mode + ': есть разбор ответа', r.feedback > 20, r.feedback);
        TS.check(vk + '/' + mode + ': Enter — следующее задание', r.next > 20);
        if (mode === 'best') TS.eq(vk + '/best: карт для выбора', r.cards, { holdem: 7, short: 7, omaha: 9, omaha5: 10 }[vk]);
      }
      await E("__t.key('Escape'); return 1");
    }
    TS.group('тренажёр · общее');
    {
      const r = await E(`__t.click('#mode-tabs [data-mode=name]'); await __t.sleep(50);
        const lv = __t.$$('#level-ctl [data-level]').map(b => b.dataset.level);
        __t.click('#level-ctl [data-level=full]'); await __t.sleep(50);
        const full = __t.$$('#task .card, #task [data-c]').length;
        __t.click('#level-ctl [data-level="5"]'); await __t.sleep(50);
        return { lv, full, five: __t.$$('#task [data-c]').length, cheat: __t.$$('#cheat .cheat-row, #cheat li, #cheat [data-cat]').length, strip: __t.text('#progress-strip') }`);
      TS.eq('уровни «5 карт» и «вся раздача»', r.lv, ['5', 'full']);
      TS.check('«5 карт» — 5 карт на экране', r.five === 5, r.five);
      TS.check('«вся раздача» — больше 5 карт', r.full > 5, r.full);
      TS.check('полоса пояса и цели дня', /пояс/i.test(r.strip) && /Цель дня/.test(r.strip), r.strip);
      const k = await E(`const b = PKStore.all('answers').length; __t.key('1'); await __t.sleep(60); const a = PKStore.all('answers').length; __t.key('Enter'); return a - b`);
      TS.eq('ответ клавишей 1', k, 1);
    }

    // Игра за столом
    TS.group('игра за столом');
    {
      await E(`const s = __t.$('#variant-select'); s.value = 'holdem'; s.dispatchEvent(new Event('change', { bubbles: true })); __t.click('[data-tab=game]'); await __t.sleep(100); return 1`);
      // Быстрые боты: настройки стола
      for (const opp of [1, 2, 3, 4, 5]) {
        const r = await E(`
          __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
          const f = __t.$('#ts-form'); f.elements.opp.value = '${opp}'; f.elements.speed.value = 'fast'; f.elements.level.value = '${['easy', 'normal', 'hard', 'mixed', 'hard'][opp - 1]}'; f.elements.showCards.checked = true;
          __t.click('#ts-apply'); await __t.sleep(150);
          return { seats: __t.$$('#table [data-seat]').length, modal: !!__t.$('#ts-form'), info: __t.text('#game-info') }`);
        TS.eq(opp + ' соперник(ов): мест за столом', r.seats, opp + 1);
        TS.check(opp + ': окно настроек закрылось', !r.modal);
        TS.check(opp + ': в шапке стола указан уровень', /Боты/.test(r.info), r.info);
      }
      // Играем раздачи кнопками и клавишами
      const played = await E(`
        const t0 = Date.now(); let hands = 0, acts = 0, keys = 0;
        while (hands < 6 && Date.now() - t0 < 60000) {
          await __t.sleep(40);
          const next = __t.$('#action-bar [data-act=next]'), restart = __t.$('#action-bar [data-act=restart]');
          if (restart) { restart.click(); continue; }
          if (next) { hands++; if (hands % 2) next.click(); else __t.key('Enter'); continue; }
          const call = __t.$('#action-bar [data-act=call]:not([disabled])');
          if (call) { if (acts % 3 === 2) { __t.key('c'); keys++; } else call.click(); acts++; }
        }
        return { hands, acts, keys, saved: PKStore.all('hands').length, review: __t.text('#review-panel').length, log: __t.$$('#log > *').length, hist: __t.$$('#history [data-hand]').length }`);
      TS.check('сыграно 6 раздач', played.hands >= 6, played);
      TS.check('ходы кнопкой и клавишей C', played.acts > 0 && played.keys > 0, played);
      TS.check('раздачи сохраняются', played.saved >= 5, played.saved);
      TS.check('разбор раздачи показан', played.review > 30, played.review);
      TS.check('ход раздачи записан', played.log > 2, played.log);
      TS.check('история раздач', played.hist >= 1, played.hist);
      // Вскрытие: светятся 5 карт победителя, в разборе пояснение (и кикер, если он есть)
      const sd = await E(`
        const t0 = Date.now(); let res = null;
        while (!res && Date.now() - t0 < 60000) {
          await __t.sleep(40);
          const g = __pkui.G.game, next = __t.$('#action-bar [data-act=next]'), rs = __t.$('#action-bar [data-act=restart]');
          if (rs) { rs.click(); continue; }
          if (next) {
            const r = g.result;
            if (r && r.type === 'showdown') {
              const main = r.pots.find(p => !p.returned), w = r.hands[main.winners[0]];
              const lit = __t.$$('#table .card.win');
              res = { lit: lit.map(el => +el.dataset.c).sort((a, b) => a - b), best: w.best.slice().sort((a, b) => a - b), cat: w.ev.cat,
                tips: lit.every(el => /лучшую пятёрку/.test(el.title)), note: __t.text('#review-panel .win-note') };
              break;
            }
            next.click(); continue;
          }
          const call = __t.$('#action-bar [data-act=call]:not([disabled])'); if (call) call.click();
        }
        return res`);
      TS.check('дошли до вскрытия', !!sd);
      if (sd) {
        TS.eq('на столе светятся ровно 5 карт победителя', sd.lit, sd.best);
        TS.check('у подсвеченных карт подсказка «лучшая пятёрка»', sd.tips);
        TS.check('в разборе пояснение к подсветке', /подсвечены 5 карт/.test(sd.note), sd.note);
        TS.eq('про кикер — только когда он есть', /кикер/.test(sd.note), [1, 2, 3, 7].includes(sd.cat));
      }
      const last = await E("const h = PKStore.all('hands').slice(-1)[0]; return { keys: Object.keys(h), dec: (h.decisions || [])[0] || null }");
      TS.check('у раздачи сохранены итог, позиция, решения', ['net', 'bb', 'pos', 'decisions', 'variant'].every(k => last.keys.includes(k)), last.keys);
      TS.check('решение сохранено со снимком ситуации', !last.dec || ['s', 'c', 'adv'].every(k => k in last.dec), last.dec);
      // Рейз и фолд
      const rf = await E(`
        let raised = false, folded = false; const t0 = Date.now();
        while (!(raised && folded) && Date.now() - t0 < 40000) {
          await __t.sleep(40);
          const next = __t.$('#action-bar [data-act=next]'), rs = __t.$('#action-bar [data-act=restart]'); if (rs) { rs.click(); continue; } if (next) { next.click(); continue; }
          const r = __t.$('#action-bar [data-act=raise]:not([disabled])');
          if (r && !raised) { const q = __t.$('#action-bar [data-q=half]') || __t.$('#action-bar [data-q=min]'); if (q) q.click(); r.click(); raised = true; continue; }
          const f = __t.$('#action-bar [data-act=fold]:not([disabled])'); if (f && raised) { __t.key('f'); folded = true; }
        }
        return { raised, folded }`);
      TS.eq('рейз (кнопкой размера) и фолд (клавишей F)', rf, { raised: true, folded: true });
      const hint = await E(`const t = __t.$('#hints-toggle'); const was = t.checked; t.click(); await __t.sleep(50); const now = t.checked; t.click(); return [was !== now, __t.text('#hint-panel').length]`);
      TS.check('подсказки включаются и выключаются', hint[0]);
      TS.check('панель подсказок не пустая', hint[1] > 10, hint[1]);
      const ng = await E(`__t.click('#restart-btn'); await __t.sleep(150); return __t.text('#game-info')`);
      TS.check('новая игра начинается с раздачи #1', /Раздача #1(\D|$)/.test(ng), ng);
    }

    // Мои ошибки после игры
    TS.group('мои ошибки');
    {
      const r = await E(`
        const list = PKDrills.collectMistakes(PKStore.all('hands'), 'holdem', PKStore.getMeta('fixed', {}));
        __t.click('[data-tab=trainer]'); __t.click('#mode-tabs [data-mode=review]'); await __t.sleep(80);
        return { n: list.length, empty: !!__t.$('#task .empty-state'), opts: __t.$$('#task [data-opt]').length }`);
      if (r.n) TS.check('ошибки из игры стали заданиями', !r.empty && r.opts >= 2, r);
      else TS.check('ошибок нет — заглушка с переходом к столу', r.empty, r);
    }

    // Статистика
    TS.group('статистика');
    for (const view of ['overview', 'trainer', 'game', 'data']) {
      const r = await E(`__t.click('[data-tab=stats]'); await __t.sleep(60); __t.click('#st-view [data-view=${view}]'); await __t.sleep(120); return { on: __t.$('#st-view [data-view=${view}]').classList.contains('on'), len: __t.text('#stats').length, bad: /undefined|NaN|\\[object/.test(__t.text('#stats')) }`);
      TS.check('раздел «' + view + '» открывается', r.on && r.len > 200, r);
      TS.check('раздел «' + view + '» без «undefined/NaN»', !r.bad);
    }
    {
      const r = await E(`__t.click('#st-view [data-view=overview]'); await __t.sleep(100); const t = __t.text('#stats'); return [/Пояс/.test(t), /По неделям/.test(t), /Что улучшить/.test(t)]`);
      TS.eq('обзор: пояса, недели, выводы', r, [true, true, true]);
      for (const v of ['holdem', 'omaha', 'all']) {
        const ok = await E(`const s = __t.$$('#tab-stats select')[0]; s.value = '${v}'; s.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(80); return __t.text('#stats').length > 200`);
        TS.check('фильтр варианта: ' + v, ok);
      }
      const before = await E("return [PKStore.all('answers').length, PKStore.all('hands').length]");
      const cl = await E(`__t.click('#st-view [data-view=data]'); await __t.sleep(80); const kinds = __t.$$('[data-clear]').map(b => b.dataset.clear); __t.click('[data-clear=trainer]'); await __t.sleep(200); return { kinds, a: PKStore.all('answers').length, h: PKStore.all('hands').length }`);
      TS.check('кнопки очистки: тренажёр, игра, рекорды, всё', cl.kinds.length >= 4, cl.kinds);
      TS.check('очистка тренажёра не трогает игру', cl.a < before[0] && cl.h === before[1], [before, cl]);
    }

    // Правила, справка, тема, звук
    TS.group('правила и прочее');
    {
      const r = await E(`__t.click('[data-tab=rules]'); await __t.sleep(80); return { cells: __t.$$('#hand-chart .hand-grid > *, #hand-chart [data-code], #hand-chart td').length, sections: __t.$$('#tab-rules section, #tab-rules [id^=r-]').length, combos: __t.text('#combo-table').length }`);
      TS.check('таблица стартовых рук (169 клеток)', r.cells >= 169, r.cells);
      TS.check('разделы правил', r.sections >= 10, r.sections);
      TS.check('таблица комбинаций', r.combos > 100);
      const h = await E(`__t.key('?'); await __t.sleep(60); const open = !!__t.$('#modal-root .modal'); __t.key('Escape'); await __t.sleep(60); return [open, !!__t.$('#modal-root .modal')]`);
      TS.eq('справка: «?» открывает, Esc закрывает', h, [true, false]);
      const th = await E(`const a = document.documentElement.dataset.theme; __t.click('#theme-btn'); await __t.sleep(30); const b = document.documentElement.dataset.theme; __t.click('#theme-btn'); return [a, b]`);
      TS.check('переключатель темы', th[0] !== th[1], th);
      const snd = await E(`__t.click('#sound-btn'); const off = JSON.parse(localStorage.getItem('pokerTrainer.settings')).sound; __t.click('#sound-btn'); const on = JSON.parse(localStorage.getItem('pokerTrainer.settings')).sound; return [off, on, PKSound.enabled]`);
      TS.eq('звук выключается и включается, настройка сохраняется', snd, [false, true, true]);
    }

    // Сохранение после перезагрузки
    TS.group('перезагрузка');
    {
      const before = await E("PKStore.flush(); await __t.sleep(300); return { a: PKStore.all('answers').length, h: PKStore.all('hands').length, tab: JSON.parse(localStorage.getItem('pokerTrainer.settings')).tab }");
      await page.reload();
      const after = await E("await __t.until(() => PKStore.info().backend === 'indexeddb'); await __t.sleep(100); return { a: PKStore.all('answers').length, h: PKStore.all('hands').length, tab: __t.$('.tab-btn[aria-selected=true]').dataset.tab }");
      TS.eq('ответы, раздачи и открытая вкладка сохранились', after, before);
    }
    await page.screenshot(path.join(OUT, 'desktop-rules.png'));
    TS.check('за весь прогон нет ошибок JavaScript', page.errors.length === 0, page.errors.slice(0, 5));
  } finally {
    await browser.close();
  }
  TS.done();
})();
