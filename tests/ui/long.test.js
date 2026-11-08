// Долгая сессия: сотни раздач подряд и большая история — без утечки памяти, без роста страницы и без замедления.
// Таймеры ботов ускорены (задержки от 50 мс до 2,4 с делятся на 50), иначе 1000 раздач шли бы полчаса.
// Более длинные не трогаем: среди них ожидание открытия IndexedDB (2,5 с) — его ускорение ломает загрузку данных.
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const TS = H.suite('Интерфейс: долгая сессия и большая история (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'index.html'));
const HANDS = H.QUICK ? 200 : 1000;

const FAST_TIMERS = `(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms > 50 && ms < 2400 ? Math.ceil(ms / 50) : ms, ...a); })();`;

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  try {
    const page = await browser.newPage({ viewport: [1280, 860] });
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: FAST_TIMERS });
    await page.cdp('HeapProfiler.enable');
    const E = code => page.eval(PAGE_HELPERS + code);
    const heap = async () => { await page.cdp('HeapProfiler.collectGarbage'); await page.cdp('HeapProfiler.collectGarbage'); return (await page.cdp('Runtime.getHeapUsage')).usedSize / 1048576; };
    await page.goto(URL);
    await E("await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
    await E(`__t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
      const f = __t.$('#ts-form'); f.elements.opp.value = '5'; f.elements.speed.value = 'fast'; f.elements.stack.value = '5000'; __t.click('#ts-apply'); await __t.sleep(200); return 1`);
    await E("__t.click('[data-tab=game]'); await __t.sleep(200); return 1");

    // Играем: колл/чек, иногда рейз или фолд; после конца партии — новая
    const play = n => E(`
      const target = PKStore.all('hands').length + ${n}, t0 = Date.now(); let acts = 0, games = 0;
      while (PKStore.all('hands').length < target && Date.now() - t0 < 240000) {
        await new Promise(r => setTimeout(r, 1));
        const next = __t.$('#action-bar [data-act=next]'), restart = __t.$('#action-bar [data-act=restart]');
        if (restart) { games++; restart.click(); continue; }
        if (next) { next.click(); continue; }
        const call = __t.$('#action-bar [data-act=call]:not([disabled])');
        if (!call) continue;
        acts++;
        const raise = __t.$('#action-bar [data-act=raise]:not([disabled])'), fold = __t.$('#action-bar [data-act=fold]:not([disabled])');
        if (acts % 9 === 4 && raise) raise.click(); else if (acts % 13 === 7 && fold) fold.click(); else call.click();
      }
      return { hands: PKStore.all('hands').length, acts, games, ms: Date.now() - t0 }`);
    const nodes = () => E("return document.getElementsByTagName('*').length");
    const renderMs = () => E("const t0 = performance.now(); for (let i = 0; i < 30; i++) __pkui.renderTable(); return (performance.now() - t0) / 30");

    TS.group('сотни раздач подряд');
    const warm = await play(60);
    TS.check('разогрев: сыграно 60 раздач', warm.hands >= 60, warm);
    const h1 = await heap(), n1 = await nodes(), r1 = await renderMs();
    const run = await play(HANDS);
    TS.check('сыграно ' + HANDS + ' раздач', run.hands >= 60 + HANDS, run);
    const h2 = await heap(), n2 = await nodes(), r2 = await renderMs();
    TS.check('память почти не растёт (меньше 12 МБ на ' + HANDS + ' раздач)', h2 - h1 < 12, { before: h1.toFixed(1), after: h2.toFixed(1) });
    TS.check('элементы на странице не копятся', n2 < n1 * 1.3 + 300, { before: n1, after: n2 });
    TS.check('стол рисуется так же быстро (не медленнее в 2 раза и не дольше 25 мс)', r2 < Math.max(r1 * 2, 8) && r2 < 25, { before: r1.toFixed(2), after: r2.toFixed(2) });
    const parts = await E("return { log: __t.$$('#log > *').length, hist: __t.$$('#history [data-hand]').length, seen: __pkui.G.seen.size }");
    TS.check('ход раздачи показывает только текущую раздачу', parts.log < 120, parts);
    TS.check('история на экране ограничена', parts.hist <= 60, parts);
    TS.check('набор показанных карт не растёт бесконечно', parts.seen < 400, parts);
    TS.eq('нет ошибок на странице', page.errors, []);

    TS.group('большая история');
    // Доводим историю почти до лимитов IndexedDB: копируем уже сыгранные раздачи и ответы
    const fill = await E(`
      const hands = PKStore.all('hands'), lim = PKStore.LIMITS.indexeddb;
      const src = hands.slice(-200), t0 = Date.now() - 86400000 * 90;
      for (let i = hands.length; i < lim.hands - 50; i++) { const h = Object.assign({}, src[i % src.length]); delete h.id; h.ts = t0 + i * 600000; PKStore.add('hands', h); }
      const modes = ['name', 'best', 'winner', 'odds', 'preflop', 'spot'];
      for (let i = PKStore.all('answers').length; i < lim.answers - 500; i++) {
        const m = modes[i % modes.length];
        PKStore.add('answers', { mode: m, cat: m === 'name' ? i % 10 : -1, chosen: i % 3, ok: i % 4 !== 0, variant: 'holdem', level: i % 2 ? 5 : 'full', ms: 1500 + i % 3000, ts: t0 + i * 120000, sub: m === 'spot' ? ['flop', 'turn', 'river'][i % 3] : undefined });
      }
      await PKStore.flush && PKStore.flush();
      return { hands: PKStore.all('hands').length, answers: PKStore.all('answers').length }`);
    TS.check('история заполнена (≈10 000 раздач и ≈50 000 ответов)', fill.hands > 9000 && fill.answers > 45000, fill);
    const views = await E(`const out = {};
      __t.click('[data-tab=stats]'); await __t.sleep(50);
      for (const v of ['overview', 'trainer', 'game', 'data']) { const b = __t.$('#st-view [data-view=' + v + ']'); const t0 = performance.now(); if (b) b.click(); await __t.sleep(0); out[v] = Math.round(performance.now() - t0); }
      return out`);
    TS.check('каждый раздел статистики открывается быстрее 1,5 с', Object.values(views).every(ms => ms < 1500), views);
    const task = await E(`__t.click('[data-tab=trainer]'); await __t.sleep(50); const ms = [];
      for (const m of ['name', 'odds', 'preflop', 'spot']) { const t0 = performance.now(); __t.click('#mode-tabs [data-mode=' + m + ']'); ms.push(Math.round(performance.now() - t0)); }
      return ms`);
    TS.check('задания тренажёра появляются быстро и с большой историей (< 400 мс)', task.every(x => x < 400), task);
    const tableMs = await E("__t.click('[data-tab=game]'); await __t.sleep(100); const t0 = performance.now(); for (let i = 0; i < 20; i++) __pkui.renderTable(); return (performance.now() - t0) / 20");
    TS.check('стол не замедлился от большой истории', tableMs < 25, tableMs.toFixed(2));

    TS.group('перезагрузка с большой историей');
    // Запись в IndexedDB идёт в фоне — ждём, пока в базе окажется всё (в обычной игре записи по одной, тут — десятки тысяч сразу)
    const saved = await E(`const count = () => new Promise(res => { const r = indexedDB.open('poker-trainer'); r.onsuccess = () => { const db = r.result, tx = db.transaction(['hands', 'answers']); const a = tx.objectStore('answers').count(), h = tx.objectStore('hands').count(); tx.oncomplete = () => { db.close(); res({ hands: h.result, answers: a.result }); }; }; r.onerror = () => res(null); });
      const t0 = Date.now(); let c = null; while (Date.now() - t0 < 60000) { c = await count(); if (c && c.hands >= ${fill.hands} && c.answers >= ${fill.answers}) break; await new Promise(r => setTimeout(r, 3000)); }
      return Object.assign({ ms: Date.now() - t0 }, c)`);
    TS.check('всё записано в IndexedDB', saved && saved.hands >= fill.hands && saved.answers >= fill.answers, saved);
    const t0 = Date.now();
    await page.reload();
    const back = await E("await __t.until(() => window.PKStore && PKStore.info().backend !== 'memory' && PKStore.all('answers').length > 1000, 15000); return { hands: PKStore.all('hands').length, answers: PKStore.all('answers').length }");
    const loadMs = Date.now() - t0;
    TS.check('всё сохранилось', back.hands >= fill.hands - 5 && back.answers >= fill.answers - 5, { fill, back });
    TS.check('страница с большой историей открывается быстрее 4 с', loadMs < 4000, loadMs);
    TS.eq('нет ошибок на странице', page.errors, []);
  } catch (e) {
    TS.check('сценарий без исключений', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    TS.done();
  }
})();
