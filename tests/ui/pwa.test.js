// Тренажёр с сайта (как на GitHub Pages): устанавливается как приложение и работает без интернета.
const path = require('path');
const H = require('../lib/harness');
const { launch, PAGE_HELPERS, fileUrl } = require('../lib/cdp');
const { serve } = require('../lib/serve');
const TS = H.suite('Интерфейс: приложение с сайта и работа без интернета (Chrome)');

(async () => {
  const browser = await launch();
  if (!browser) { TS.done('Chrome не найден — интерфейсные тесты пропущены (укажите CHROME_PATH)'); return; }
  let site = await serve(H.ROOT);
  try {
    const page = await browser.newPage();
    await page.viewport(390, 844, true); await page.touch(true);
    const E = code => page.eval(PAGE_HELPERS + code);

    TS.group('адрес сайта');
    await page.goto(site.url);
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");
    TS.eq('тренажёр открывается прямо по адресу сайта, без имени файла', await E('return location.pathname'), '/');
    await E("await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
    TS.eq('данные хранятся в IndexedDB', await E('return PKStore.info().backend'), 'indexeddb');
    // Старый адрес из закладок ведёт на новый — и на сайте, и в файле на диске
    await page.goto(site.url + 'poker-trainer.html?x=1#y');
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");
    TS.eq('старый адрес poker-trainer.html ведёт на адрес сайта (с параметрами)', await E('return location.pathname + location.search + location.hash'), '/?x=1#y');
    await page.goto(fileUrl(path.join(H.ROOT, 'poker-trainer.html')));
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");
    TS.check('старый файл poker-trainer.html открывает index.html с диска', await E('return location.href.endsWith("/index.html")'), await E('return location.href'));
    await page.goto(site.url);
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");

    TS.group('служебный скрипт');
    const reg = await E(`const r = await __t.until(() => navigator.serviceWorker && navigator.serviceWorker.controller ? 1 : 0, 100) ; const reg = await navigator.serviceWorker.ready; return { scope: reg.scope, active: !!reg.active }`);
    TS.check('зарегистрирован и активен', reg.active, reg);
    TS.eq('действует на весь сайт', reg.scope, site.url);
    const cached = await E(`const keys = await caches.keys(); const c = await caches.open(keys.find(k => k.startsWith('poker-trainer-')));
      const list = (await c.keys()).map(r => new URL(r.url).pathname); return { keys, list }`);
    TS.check('кэш создан', cached.keys.some(k => /^poker-trainer-v\d+$/.test(k)), cached.keys);
    TS.check('все файлы сохранены заранее', ['/', '/index.html', '/js/ui.js', '/js/i18n-en.js', '/css/style.css', '/manifest.webmanifest', '/icons/icon-512.png'].every(p => cached.list.includes(p)), cached.list);

    TS.group('установка');
    const inst = await page.cdp('Page.getInstallabilityErrors');
    TS.eq('Chrome считает тренажёр устанавливаемым', (inst.installabilityErrors || []).map(e => e.errorId), []);
    const man = await page.cdp('Page.getAppManifest');
    TS.check('манифест прочитан без ошибок', man.url && (!man.errors || !man.errors.length), man.errors);
    await E(`__t.click('[data-tab=stats]'); await __t.sleep(150); const b = __t.$('#st-view [data-view=data]'); if (b) b.click(); await __t.sleep(150); return 1`);
    const panel = await E(`const p = __t.$('#pwa-panel'); return p ? p.innerText : null`);
    TS.check('в «Данных» есть панель «Приложение»', !!panel, panel);
    TS.check('с сайта не говорит «открыт из файла»', panel && !/из файла\. Установить/.test(panel), panel);

    TS.group('плашка «Установите на главный экран»');
    const bar = () => E(`const b = __t.$('#install-bar'), r = b.getBoundingClientRect(), go = __t.$('#install-go');
      return { shown: !b.hidden && r.height > 0, text: b.innerText, fits: r.right <= innerWidth + 0.5 && (!go || go.getBoundingClientRect().right <= r.right + 0.5), scroll: document.documentElement.scrollWidth > innerWidth }`);
    for (const w of [390, 320]) {
      await page.viewport(w, 700, true); await page.touch(true); await E('await __t.sleep(100); return 1');
      const b = await bar();
      TS.check(w + ' px: на телефоне с сайта плашка видна', b.shown && /как приложение/.test(b.text), b);
      TS.check(w + ' px: помещается, без прокрутки вбок', b.fits && !b.scroll, b);
    }
    await page.viewport(390, 844, true);
    // Если Chrome уже предложил установку (как на Android), первое нажатие открывает его окно; второе — уже без него — инструкцию.
    const help = await E(`__t.click('#install-go'); await __t.sleep(200); const native = !__t.$('#modal-root .modal');
      if (native) { __t.click('#install-go'); await __t.sleep(200); }
      const m = __t.$('#modal-root .modal');
      const r = { native, modal: !!m, steps: __t.$$('#modal-root .install-steps li').length, text: m ? m.innerText : '' }; if (m) __t.click('#modal-root [data-close]'); return r`);
    TS.check('«Установить» без системного окна — инструкция по шагам', help.modal && help.steps >= 2, help);
    TS.check('в инструкции — что делать, если ссылка открылась в Telegram', /Telegram/.test(help.text), help.text);
    await E("__t.click('#install-hide'); await __t.sleep(100); return 1");
    TS.check('крестик прячет плашку', !(await bar()).shown);
    await page.reload();
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); await __t.sleep(200); return 1");
    TS.check('после перезагрузки плашка остаётся скрытой', !(await bar()).shown);
    await E("const s = JSON.parse(localStorage.getItem('pokerTrainer.settings')); s.installHidden = false; localStorage.setItem('pokerTrainer.settings', JSON.stringify(s)); return 1");
    await page.viewport(1280, 860, false); await page.touch(false);
    await page.reload();
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); await __t.sleep(200); return 1");
    TS.check('на компьютере плашки нет (там есть значок установки в адресной строке)', !(await bar()).shown);
    await page.viewport(390, 844, true); await page.touch(true);

    // Перезагрузка: теперь страницей управляет служебный скрипт
    await page.reload();
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");
    TS.check('после перезагрузки страница под управлением служебного скрипта', await E('return !!navigator.serviceWorker.controller'));

    TS.group('без интернета');
    // Готовим данные, которые должны пережить работу офлайн
    await E(`__t.click('[data-tab=trainer]'); await __t.sleep(100); const o = __t.$('#task [data-cat], #task [data-opt]'); if (o) o.click(); await __t.sleep(100); return 1`);
    const answersBefore = await E("await __t.until(() => PKStore.all('answers').length); return PKStore.all('answers').length");
    // Сайт недоступен по-настоящему: сервер выключен (эмуляция сети в Chrome не действует на служебный скрипт)
    const port = site.port;
    await site.close();
    await page.reload();
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 8000); await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
    TS.check('страница открылась без сети', await E('return !!document.querySelector("#tab-trainer") && !!window.PK && !!window.PKDrills'));
    TS.check('стили загружены', await E("return getComputedStyle(document.querySelector('.top')).position !== 'static' || getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'"));
    TS.check('статистика на месте', await E("await __t.until(() => PKStore.all('answers').length); return PKStore.all('answers').length") >= answersBefore);
    const off = await E(`const r = {};
      __t.click('[data-tab=trainer]'); await __t.sleep(100); r.task = __t.$$('#task .card').length;
      const o = __t.$('#task [data-cat], #task [data-opt]'); if (o) o.click(); await __t.sleep(100); r.fb = __t.text('#feedback').length;
      __t.click('[data-tab=game]'); await __t.sleep(400); r.seats = __t.$$('#table [data-seat]').length;
      __t.click('[data-tab=rules]'); await __t.sleep(100); r.rules = __t.text('#tab-rules').length;
      return r`);
    TS.check('тренажёр работает офлайн', off.task > 0 && off.fb > 10, off);
    TS.check('игра за столом работает офлайн', off.seats >= 2, off);
    TS.check('правила открываются офлайн', off.rules > 500, off);
    // Английский тоже работает без сети (словарь сохранён)
    await E("localStorage.setItem('pk-lang', 'en'); return 1");
    await page.reload();
    await E("await __t.until(() => window.PKI18n && document.readyState === 'complete', 8000); return 1");
    TS.eq('английская версия офлайн', await E('return [PKI18n.lang, document.title]'), ['en', 'Poker Trainer']);
    await E("localStorage.setItem('pk-lang', 'ru'); return 1");
    site = await serve(H.ROOT, port);

    TS.group('обновление');
    // С сетью страница берёт свежие файлы с сервера, а не старую копию
    const hits0 = site.hits.length;
    await page.reload();
    await E("await __t.until(() => window.PKStore && document.readyState === 'complete', 5000); return 1");
    TS.check('с сетью файлы запрашиваются у сервера (обновления приходят сразу)', site.hits.slice(hits0).some(p => p.endsWith('/js/ui.js')), site.hits.slice(hits0));
    TS.eq('нет ошибок на странице', page.errors, []);
  } catch (e) {
    TS.check('сценарий без исключений', false, String(e && e.stack || e));
  } finally {
    await browser.close();
    await site.close();
    TS.done();
  }
})();
