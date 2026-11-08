// Превью ссылки в мессенджерах и соцсетях (Open Graph): теги на месте, картинка есть, нужного размера и не слишком тяжёлая.
const fs = require('fs');
const path = require('path');
const H = require('../lib/harness');
const TS = H.suite('Превью ссылки в мессенджерах');
const R = f => path.join(H.ROOT, f);
const html = fs.readFileSync(R('index.html'), 'utf8');
const meta = p => (html.match(new RegExp('<meta (?:property|name)="' + p.replace(/[.:]/g, '\\$&') + '" content="([^"]*)"')) || [])[1];

// Ширина и высота JPEG — из маркера начала кадра (SOF0–SOF2)
function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xFF) return null;
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

const domain = fs.readFileSync(R('CNAME'), 'utf8').trim();
const site = 'https://' + domain + '/';

TS.group('теги');
for (const p of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'og:locale', 'twitter:card'])
  TS.check('есть ' + p, !!meta(p), meta(p));
TS.eq('og:title совпадает с заголовком страницы', meta('og:title'), (html.match(/<title>([^<]+)<\/title>/) || [])[1]);
TS.eq('og:url — адрес сайта из CNAME', meta('og:url'), site);
TS.eq('основной адрес страницы (canonical) — тот же', (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1], site);
TS.check('описание не длиннее 200 знаков (иначе обрезают)', meta('og:description').length <= 200, meta('og:description').length);
TS.eq('большая картинка в карточке', meta('twitter:card'), 'summary_large_image');

TS.group('картинка');
const img = meta('og:image') || '';
TS.check('полный адрес на этом сайте (сервисы не знают, откуда открыта страница)', img.startsWith(site), img);
const file = img.slice(site.length);
const exists = file && fs.existsSync(R(file));
TS.check('файл ' + file + ' есть в папке', exists);
if (exists) {
  const buf = fs.readFileSync(R(file));
  const size = jpegSize(buf);
  TS.eq('это JPEG 1200×630', size, [1200, 630]);
  TS.eq('размер в тегах совпадает с файлом', [+meta('og:image:width'), +meta('og:image:height')], size);
  TS.eq('тип в тегах — JPEG', meta('og:image:type'), 'image/jpeg');
  TS.check('легче 300 КБ (иначе WhatsApp не показывает превью)', buf.length < 300 * 1024, Math.round(buf.length / 1024) + ' КБ');
}

TS.done();
