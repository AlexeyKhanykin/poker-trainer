// Простой статический сервер для тестов: отдаёт папку проекта по http://127.0.0.1:<порт>/, как GitHub Pages.
// Нужен там, где file:// не годится (служебный скрипт для работы без интернета, установка как приложение).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function serve(root, port) {
  const hits = [];
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    hits.push(p);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(port || 0, '127.0.0.1', () => resolve({
    url: 'http://127.0.0.1:' + server.address().port + '/',
    hits,
    port: server.address().port,
    // закрывает и открытые соединения — иначе браузер ещё какое-то время «видит» сервер
    close: () => new Promise(r => { server.close(r); if (server.closeAllConnections) server.closeAllConnections(); })
  })));
}

module.exports = { serve };
