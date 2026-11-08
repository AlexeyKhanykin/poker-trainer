// Скриншоты всех вкладок на разных экранах: node tests/lib/shots.js [ширина×высота ...]
// Английская версия: PK_LANG=en node tests/lib/shots.js …
// Файлы — в tests/out/shots/. Нужен для ручного просмотра вёрстки.
'use strict';
const path = require('path');
const { launch, PAGE_HELPERS, fileUrl } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const sizes = (process.argv.slice(2).length ? process.argv.slice(2) : ['390x844', '768x1024']).map(s => s.split('x').map(Number));
const OUT = path.join(__dirname, '..', 'out', 'shots');
const LANG = process.env.PK_LANG || 'ru';
const pre = LANG === 'ru' ? '' : LANG + '-';
(async () => {
  const b = await launch();
  if (!b) { console.log('Chrome не найден'); process.exit(1); }
  try {
    for (const [w, h] of sizes) {
      const p = await b.newPage({ viewport: [w, h], mobile: w < 1024 });
      await p.goto(fileUrl(path.join(ROOT, 'index.html')));
      const E = c => p.eval(PAGE_HELPERS + c);
      if (LANG !== 'ru') { await E(`localStorage.setItem('pk-lang', '${LANG}'); return 1`); await p.goto(fileUrl(path.join(ROOT, 'index.html'))); }
      await E("await __t.until(() => PKStore.info().backend !== 'memory'); return 1");
      for (const tab of ['trainer', 'game', 'rules', 'stats']) {
        await E(`__t.click('[data-tab=${tab}]'); await __t.sleep(${tab === 'game' ? 900 : 200}); return 1`);
        const ov = await E('return [document.documentElement.scrollWidth, innerWidth]');
        await p.screenshot(path.join(OUT, `${pre}${w}x${h}-${tab}.png`));
        console.log(`${w}x${h} ${tab}: ширина страницы ${ov[0]} при экране ${ov[1]}`);
      }
      // Игра после флопа: доходим до общих карт, отвечая коллом/чеком
      await E(`__t.click('[data-tab=game]');
        for (let k = 0; k < 120 && !document.querySelector('.board .card:not(.slot)'); k++) {
          const c = document.querySelector('[data-act=call]:not([disabled])'), n = document.querySelector('[data-act=next],[data-act=restart]');
          if (n) n.click(); else if (c) c.click();
          await __t.sleep(250);
        }
        await __t.sleep(900); scrollTo(0, 0); return 1`);
      await p.screenshot(path.join(OUT, `${pre}${w}x${h}-game-flop.png`));
      if (p.errors.length) console.log('ошибки:', p.errors);
      await p.close();
    }
  } finally { await b.close(); }
})();
