// 极简静态服务器：模拟 GitHub Pages（/teachAid 子路径，无后端）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.env.DIST || 'E:/vscodeProject/teachAid/web/dist';
const PREFIX = process.env.PREFIX || '/teachAid';
const PORT = Number(process.env.PORT || 8088);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json'
};

http.createServer((req, res) => {
  // 模拟 Pages：/api 一律 404（触发浏览器模式）
  if (req.url.startsWith('/api')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'not found' }));
  }
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith(PREFIX)) url = url.slice(PREFIX.length);
  if (url === '' || url === '/') url = '/index.html';
  const file = path.join(DIST, url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } else {
    res.writeHead(404);
    res.end('not found: ' + url);
  }
}).listen(PORT, () => console.log(`[static] ${PREFIX} -> ${DIST} on :${PORT}`));
