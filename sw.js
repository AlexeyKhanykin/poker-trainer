// Работа без интернета, когда тренажёр открыт с сайта (GitHub Pages) или установлен как приложение.
// Со страницы, открытой из файла, не используется: браузеры не запускают такие скрипты для file://.
//
// Порядок: сначала сеть (чтобы после публикации сразу была свежая версия), при ошибке или долгом ответе — сохранённая копия.
// При установке заранее сохраняются все файлы из ASSETS — тест проверяет, что список совпадает с тем, что подключает страница.
'use strict';
const CACHE = 'poker-trainer-v1';
const ASSETS = [
  './',
  'index.html',
  'poker-trainer.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/i18n.js',
  'js/i18n-en.js',
  'js/core.js',
  'js/drills.js',
  'js/store.js',
  'js/stats.js',
  'js/sound.js',
  'js/ui.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
const NET_TIMEOUT = 4000;

self.addEventListener('install', e => {
  // cache: 'reload' — мимо HTTP-кэша браузера, чтобы сохранить именно свежие файлы
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('poker-trainer-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fromNetwork(req).catch(() => fromCache(req)));
});

function fromNetwork(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT);
    fetch(req, { cache: 'no-cache' }).then(res => {
      clearTimeout(t);
      if (!res || !res.ok) { reject(new Error('HTTP ' + (res && res.status))); return; }
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      resolve(res);
    }, err => { clearTimeout(t); reject(err); });
  });
}

async function fromCache(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  // Переход на страницу без своей копии (например, адрес с параметрами) — отдаём сам тренажёр
  if (req.mode === 'navigate') { const page = await c.match('poker-trainer.html'); if (page) return page; }
  return Response.error();
}
