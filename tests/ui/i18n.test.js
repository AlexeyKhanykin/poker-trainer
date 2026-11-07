// Английская версия в настоящем Chrome: переключатель языка, все вкладки, режимы и окна — без русских букв.
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const TS = H.suite('Интерфейс: английская версия (Chrome)');
const URL = fileUrl(path.join(H.ROOT, 'poker-trainer.html'));

// Где на экране остались русские буквы: видимый текст, подсказки (title), aria-label, заголовок окна.
const CYR = `
  window.__cyr = () => {
    const re = /[А-Яа-яЁё]/, out = [];
    const lines = document.body.innerText.split('\\n').filter(l => re.test(l));
    lines.forEach(l => out.push(l.trim().slice(0, 90)));
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach(el => ['title', 'aria-label', 'placeholder'].forEach(a => {
      const v = el.getAttribute(a); if (v && re.test(v) && el.id !== 'lang-btn') out.push(a + ': ' + v.slice(0, 90));
    }));
    if (re.test(document.title)) out.push('title: ' + document.title);
    return Array.from(new Set(out));
  };
`;

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  try {
    const page = await browser.newPage({ viewport: [1280, 860] });
    const E = code => page.eval(PAGE_HELPERS + CYR + code);
    const cyr = async (what) => { const c = await E('return __cyr()'); TS.check(what + ': нет русского текста', c.length === 0, c.slice(0, 6)); };
    await page.goto(URL);

    TS.group('переключатель');
    TS.eq('по умолчанию русский', await E("return [document.documentElement.lang, document.title, __t.$('#lang-btn').textContent]"), ['ru', 'Покерный тренер', 'EN']);
    await E("setTimeout(() => __t.click('#lang-btn'), 10); return 1");
    await new Promise(r => setTimeout(r, 1200));
    await E("await __t.until(() => window.PKI18n && document.readyState === 'complete'); return 1");
    TS.eq('после нажатия EN — английский', await E("return [localStorage.getItem('pk-lang'), PKI18n.lang, document.documentElement.lang, document.title, __t.$('#lang-btn').textContent]"),
      ['en', 'en', 'en', 'Poker Trainer', 'RU']);
    TS.eq('вкладки по-английски', await E("return __t.$$('.tab-btn .t-long').map(s => s.textContent)"), ['Hand trainer', 'Table play', 'Rules', 'Stats']);
    await E("await __t.until(() => PKStore.info().backend); return 1");
    await cyr('тренажёр при открытии');

    // Тренажёр: каждый режим в каждом варианте, задание и разбор ответа
    const MODES = await E("return __t.$$('#mode-tabs [data-mode]').map(b => b.dataset.mode)");
    for (const vk of ['holdem', 'omaha', 'omaha5', 'short']) {
      TS.group('тренажёр · ' + vk);
      await E(`const s = __t.$('#variant-select'); s.value = '${vk}'; s.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(60); return 1`);
      for (const level of ['5', 'full']) {
        for (const mode of MODES) {
          await E(`__t.click('#mode-tabs [data-mode=${mode}]'); await __t.sleep(40); const lv = __t.$('#level-ctl [data-level="${level}"]'); if (lv) { lv.click(); await __t.sleep(40); } return 1`);
          await cyr(vk + '/' + mode + '/' + level + ': задание');
          await E(`
            if ('${mode}' === 'name') __t.click(__t.$('#task [data-cat]'));
            else if ('${mode}' === 'best') { for (let i = 0; i < 5; i++) { __t.$$('#task [data-i]')[i].click(); await __t.sleep(10); } __t.key('Enter'); }
            else if ('${mode}' === 'winner') __t.click(__t.$('#task [data-w]'));
            else if ('${mode}' === 'speed') { __t.key(' '); await __t.sleep(60); const b = await __t.until(() => __t.$('#task [data-cat]:not([disabled])')); if (b) b.click(); }
            else { const o = __t.$('#task [data-opt]'); if (o) o.click(); }
            await __t.sleep(60); return 1`);
          await cyr(vk + '/' + mode + '/' + level + ': разбор ответа');
          await E("__t.key('Escape'); __t.key('Enter'); await __t.sleep(40); return 1");
        }
      }
      // таблица стартовых рук из «Играть или сбросить»
      await E("__t.click('#mode-tabs [data-mode=preflop]'); await __t.sleep(40); const o = __t.$('#task [data-opt]'); if (o) o.click(); await __t.sleep(40); const b = __t.$('[data-show-chart]'); if (b) b.click(); await __t.sleep(60); return 1");
      await cyr(vk + ': таблица стартовых рук');
      await E("__t.key('Escape'); await __t.sleep(30); return 1");
    }

    TS.group('стол');
    await E(`const s = __t.$('#variant-select'); s.value = 'holdem'; s.dispatchEvent(new Event('change', { bubbles: true })); __t.click('[data-tab=game]'); await __t.sleep(100); return 1`);
    await cyr('стол при открытии');
    await E("__t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form')); return 1");
    await cyr('окно настроек стола');
    for (const vk of ['holdem', 'omaha', 'short']) {
      await E(`const s = __t.$('#variant-select'); s.value = '${vk}'; s.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(80);
        __t.click('#table-settings-btn'); await __t.until(() => __t.$('#ts-form'));
        const f = __t.$('#ts-form'); f.elements.opp.value = '5'; f.elements.speed.value = 'fast'; f.elements.level.value = 'mixed'; f.elements.showCards.checked = true;
        __t.click('#ts-apply'); await __t.sleep(150); return 1`);
      // Играем раздачи: колл, иногда рейз и фолд; после каждого хода — проверка текста
      const bad = await E(`
        const t0 = Date.now(), seen = new Set(); let hands = 0, acts = 0;
        while (hands < 8 && Date.now() - t0 < 45000) {
          await __t.sleep(40);
          __cyr().forEach(x => seen.add(x));
          const next = __t.$('#action-bar [data-act=next]'), restart = __t.$('#action-bar [data-act=restart]');
          if (restart) { restart.click(); continue; }
          if (next) { hands++; next.click(); continue; }
          const call = __t.$('#action-bar [data-act=call]:not([disabled])'), raise = __t.$('#action-bar [data-act=raise]:not([disabled])'), fold = __t.$('#action-bar [data-act=fold]:not([disabled])');
          if (!call) continue;
          acts++;
          if (acts % 7 === 3 && raise) { const q = __t.$('#action-bar [data-q=half]'); if (q) q.click(); raise.click(); }
          else if (acts % 11 === 5 && fold) __t.key('f');
          else call.click();
        }
        return { hands, seen: Array.from(seen) }`);
      TS.check(vk + ': сыграны раздачи', bad.hands >= 4, bad.hands);
      TS.check(vk + ': за столом нет русского текста', bad.seen.length === 0, bad.seen.slice(0, 6));
    }
    await E("const h = __t.$('#history [data-hand]'); if (h) h.click(); await __t.sleep(80); return 1");
    await cyr('окно раздачи из истории');
    await E("__t.key('Escape'); await __t.sleep(30); __t.click('#help-btn'); await __t.sleep(60); return 1");
    await cyr('справка по клавишам');
    await E("__t.key('Escape'); await __t.sleep(30); return 1");

    TS.group('правила и статистика');
    await E("__t.click('[data-tab=rules]'); await __t.sleep(80); return 1");
    await cyr('правила');
    for (const vk of ['holdem', 'omaha', 'short']) {
      await E(`const s = __t.$('#variant-select'); s.value = '${vk}'; s.dispatchEvent(new Event('change', { bubbles: true })); await __t.sleep(60); return 1`);
      await E("__t.click('[data-tab=stats]'); await __t.sleep(100); return 1");
      for (const view of ['overview', 'trainer', 'game', 'data']) {
        await E(`const b = __t.$('#st-view [data-view=${view}]'); if (b) b.click(); await __t.sleep(100); return 1`);
        await cyr(vk + ': статистика · ' + view);
      }
      await E(`const s = __t.$('#st-variant'); if (s) { s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); } await __t.sleep(80); const b = __t.$('#st-view [data-view=overview]'); if (b) b.click(); await __t.sleep(80); return 1`);
      await cyr(vk + ': статистика · все варианты');
    }

    TS.group('словарь');
    const miss = await E('return Array.from(PKI18n.missing)');
    TS.check('все тексты нашлись в словаре', miss.length === 0, miss.slice(0, 8));
    TS.check('числа с разделителем тысяч по-английски', await E("return PKI18n.num(12345) === '12,345'"));
    TS.check('нет ошибок на странице', page.errors.length === 0, page.errors);

    TS.group('телефон');
    await page.viewport(390, 844, true); await page.touch(true);
    for (const tab of ['trainer', 'game', 'rules', 'stats']) {
      const r = await E(`__t.click('[data-tab=${tab}]'); await __t.sleep(250); return [document.documentElement.scrollWidth, innerWidth, __t.$$('.keys').filter(el => __t.visible(el)).length]`);
      TS.check(tab + ': нет прокрутки вбок', r[0] <= r[1], r);
      TS.eq(tab + ': подсказки про клавиши скрыты на сенсорном экране', r[2], 0);
      await cyr(tab + ' на телефоне');
    }
    await page.viewport(1280, 860, false); await page.touch(false);

    TS.group('обратно на русский');
    await E("setTimeout(() => __t.click('#lang-btn'), 10); return 1");
    await new Promise(r => setTimeout(r, 1200));
    await E("await __t.until(() => window.PKI18n && document.readyState === 'complete'); return 1");
    TS.eq('снова русский', await E("return [localStorage.getItem('pk-lang'), document.documentElement.lang, document.title, __t.$('#lang-btn').textContent]"), ['ru', 'ru', 'Покерный тренер', 'EN']);
    TS.check('данные, накопленные на английском, на месте', await E("await __t.until(() => PKStore.all('answers').length); return PKStore.all('answers').length > 20 && PKStore.all('hands').length > 5"));
  } catch (e) {
    TS.check('сценарий без исключений', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    TS.done();
  }
})();
