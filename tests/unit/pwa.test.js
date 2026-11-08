// Приложение для установки: манифест, иконки и список файлов для работы без интернета (sw.js) — всё на месте и согласовано.
const fs = require('fs');
const path = require('path');
const H = require('../lib/harness');
const TS = H.suite('Установка как приложение: манифест и офлайн-файлы');
const R = f => path.join(H.ROOT, f);
const exists = f => { try { return fs.statSync(R(f)).isFile(); } catch (e) { return false; } };

// Размер PNG из заголовка (ширина и высота — байты 16–23)
const pngSize = f => { const b = fs.readFileSync(R(f)); return b.slice(1, 4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

const sw = fs.readFileSync(R('sw.js'), 'utf8');
const ASSETS = JSON.parse('[' + sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '') + ']');
const html = fs.readFileSync(R('index.html'), 'utf8');

TS.group('манифест');
let man = null;
try { man = JSON.parse(fs.readFileSync(R('manifest.webmanifest'), 'utf8')); } catch (e) { TS.check('манифест — корректный JSON', false, e.message); }
if (man) {
  TS.check('есть имя и короткое имя', man.name && man.short_name && man.short_name.length <= 12, [man.name, man.short_name]);
  TS.eq('открывается сам тренажёр — по адресу сайта без имени файла', [man.start_url, man.id], ['./', './']);
  TS.eq('отдельное окно, как у приложения', man.display, 'standalone');
  TS.check('цвета заданы', /^#[0-9a-f]{6}$/i.test(man.theme_color) && /^#[0-9a-f]{6}$/i.test(man.background_color));
  TS.eq('цвет шапки совпадает с theme-color страницы', man.theme_color, (html.match(/name="theme-color" content="([^"]+)"/) || [])[1]);
  for (const ic of man.icons) {
    TS.check('иконка ' + ic.src + ' есть', exists(ic.src));
    if (ic.type === 'image/png' && exists(ic.src)) TS.eq('иконка ' + ic.src + ': размер как в манифесте', pngSize(ic.src).join('x'), ic.sizes);
    TS.check('иконка ' + ic.src + ' сохраняется для офлайна', ASSETS.includes(ic.src));
  }
  TS.check('есть иконки 192 и 512', ['192x192', '512x512'].every(s => man.icons.some(i => i.sizes === s && i.purpose !== 'maskable')));
  TS.check('есть иконка для круглых и квадратных значков Android (maskable)', man.icons.some(i => /maskable/.test(i.purpose)));
}

TS.group('страница');
TS.check('страница подключает манифест', /<link rel="manifest" href="manifest.webmanifest">/.test(html));
const apple = (html.match(/rel="apple-touch-icon" href="([^"]+)"/) || [])[1];
TS.check('иконка для iPhone есть и сохраняется', apple && exists(apple) && ASSETS.includes(apple), apple);
if (apple && exists(apple)) TS.eq('иконка для iPhone — 180×180', pngSize(apple), [180, 180]);
TS.check('index.html — сам тренажёр', /<script src="js\/ui\.js"><\/script>/.test(html));
const old = fs.readFileSync(R('poker-trainer.html'), 'utf8');
TS.check('старый адрес poker-trainer.html ведёт на тренажёр (с сайта и из файла)', /location\.replace\(/.test(old) && old.includes("'index.html'") && old.includes("'./'") && !/<script src=/.test(old));

TS.group('файлы для работы без интернета');
const linked = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"#:]+)"/g)].map(m => m[1]);
TS.check('страница что-то подключает', linked.length >= 9, linked);
TS.eq('всё, что подключает страница, сохраняется', linked.filter(f => !ASSETS.includes(f)), []);
const dirFiles = d => fs.readdirSync(R(d)).filter(f => !f.startsWith('.')).map(f => d + '/' + f);
TS.eq('все файлы из js/, css/ и icons/ сохраняются', [...dirFiles('js'), ...dirFiles('css'), ...dirFiles('icons')].filter(f => !ASSETS.includes(f)), []);
TS.eq('в списке нет несуществующих файлов', ASSETS.filter(f => f !== './' && !exists(f)), []);
TS.eq('в списке нет повторов', ASSETS.length, new Set(ASSETS).size);
TS.check('сохраняются адрес сайта, index.html и манифест', ['./', 'index.html', 'manifest.webmanifest'].every(f => ASSETS.includes(f)));
TS.check('у кэша есть версия (старые копии удаляются)', /const CACHE = 'poker-trainer-v\d+'/.test(sw));

TS.group('публикация');
TS.check('.nojekyll — GitHub Pages отдаёт файлы как есть', exists('.nojekyll'));
const ign = exists('.gitignore') ? fs.readFileSync(R('.gitignore'), 'utf8') : '';
TS.check('скриншоты тестов не публикуются', /tests\/out/.test(ign), ign);

TS.done();
