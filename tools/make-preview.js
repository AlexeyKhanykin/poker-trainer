#!/usr/bin/env node
// Рисует preview.jpg (1200×630) — картинку, которую мессенджеры и соцсети показывают при отправке ссылки на сайт.
// Запуск: node tools/make-preview.js. Нужно запускать заново только после смены оформления или текста на картинке.
'use strict';
const fs = require('fs');
const path = require('path');
const { launch } = require('../tests/lib/cdp');

const ROOT = path.join(__dirname, '..');
const W = 1200, H = 630;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const suit = id => html.match(new RegExp('<symbol id="suit-' + id + '"[^>]*>([\\s\\S]*?)</symbol>'))[1];
const icon = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8');

// Веер из пяти червей — роял-флеш, самая сильная комбинация.
const RED = '#c62f3a';
const card = (rank, i) => {
  const angle = -20 + i * 10, x = i * 58;
  return `<div class="card" style="left:${x}px;transform:rotate(${angle}deg)">
    <div class="r">${rank}<svg viewBox="0 0 100 100">${suit(1)}</svg></div>
    <svg class="big" viewBox="0 0 100 100">${suit(1)}</svg></div>`;
};

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; overflow: hidden; font-family: -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(ellipse 90% 110% at 72% 50%, #138a62 0%, #0d6a4d 45%, #073f2d 100%); color: #fff; position: relative; }
  .rim { position: absolute; inset: 22px; border: 3px solid rgba(255,255,255,.10); border-radius: 36px; }
  .left { position: absolute; left: 80px; top: 70px; width: 520px; }
  .logo { width: 88px; height: 88px; display: block; margin-bottom: 30px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.3)); }
  h1 { font-size: 80px; line-height: 1; font-weight: 800; letter-spacing: -1.5px; }
  p.sub { margin-top: 24px; font-size: 32px; line-height: 1.3; color: rgba(255,255,255,.88); font-weight: 500; }
  .tags { position: absolute; left: 80px; bottom: 76px; display: flex; gap: 14px; }
  .tags span { font-size: 24px; font-weight: 600; padding: 10px 20px; border-radius: 999px; background: rgba(0,0,0,.22); color: #e8fff4; }
  .site { position: absolute; right: 80px; bottom: 84px; font-size: 26px; font-weight: 600; color: rgba(255,255,255,.7); }
  .fan { position: absolute; left: 676px; top: 150px; width: 420px; height: 320px; }
  .card { position: absolute; top: 0; width: 170px; height: 238px; background: #fff; border-radius: 16px; transform-origin: 50% 120%;
    box-shadow: 0 10px 26px rgba(0,0,0,.35); color: ${RED}; fill: ${RED}; }
  .card .r { position: absolute; left: 14px; top: 10px; font-size: 40px; font-weight: 800; line-height: 1; display: flex; flex-direction: column; align-items: center; }
  .card .r svg { width: 30px; height: 30px; margin-top: 4px; }
  .card .big { position: absolute; right: 22px; bottom: 26px; width: 96px; height: 96px; }
</style></head><body>
  <div class="rim"></div>
  <div class="left">
    <img class="logo" src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}">
    <h1>Покерный тренер</h1>
    <p class="sub">Комбинации, шансы, решения и&nbsp;игра с&nbsp;ботами — для&nbsp;новичков</p>
  </div>
  <div class="fan">${['10', 'J', 'Q', 'K', 'A'].map(card).join('')}</div>
  <div class="tags"><span>Бесплатно</span><span>Без рекламы</span><span>Работает без интернета</span></div>
  <div class="site">pt.khanykin.dev</div>
</body></html>`;

(async () => {
  const browser = await launch();
  if (!browser) { console.error('Chrome не найден (укажите CHROME_PATH)'); process.exit(1); }
  try {
    const p = await browser.newPage();
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await p.goto('data:text/html;base64,' + Buffer.from(page).toString('base64'));
    // JPEG, а не PNG: WhatsApp не показывает превью тяжелее 300 КБ.
    const shot = await p.cdp('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    const out = path.join(ROOT, 'preview.jpg');
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    await p.close();
    console.log('preview.jpg', W + '×' + H, Math.round(fs.statSync(out).size / 1024) + ' КБ');
  } finally { await browser.close(); }
})();
