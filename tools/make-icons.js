#!/usr/bin/env node
// Рисует PNG-иконки приложения из icons/icon.svg через Chrome без окна: node tools/make-icons.js
// Нужно запускать заново только после правки эмблемы.
'use strict';
const fs = require('fs');
const path = require('path');
const { launch } = require('../tests/lib/cdp');

const ROOT = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8');
const spade = svg.match(/<path[^>]*\/>/)[0];
const GREEN = '#0d6a4d';
// purpose: any — скруглённый квадрат на прозрачном фоне; maskable и apple — зелёный во весь квадрат,
// эмблема в «безопасной зоне» (центральные 80 %), система сама скругляет углы.
const full = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${GREEN}"/>` +
  `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${spade}</g></svg>`;
const ICONS = [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['icon-maskable-512.png', 512, full(0.78)],
  ['apple-touch-icon.png', 180, full(0.9)]
];

(async () => {
  const browser = await launch();
  if (!browser) { console.error('Chrome не найден (укажите CHROME_PATH)'); process.exit(1); }
  try {
    for (const [file, size, src] of ICONS) {
      const page = await browser.newPage();
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
      await page.cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      const html = `<!doctype html><html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(src).toString('base64')}" style="display:block;width:${size}px;height:${size}px"></body></html>`;
      await page.goto('data:text/html;base64,' + Buffer.from(html).toString('base64'));
      await page.screenshot(path.join(ROOT, 'icons', file));
      await page.close();
      console.log('icons/' + file, size + '×' + size);
    }
  } finally { await browser.close(); }
})();
