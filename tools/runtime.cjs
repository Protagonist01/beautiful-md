const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function serve() {
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname !== '/' && pathname !== '/index.html' && !/^\/(css|js|vendor)\/[\w./-]+$/.test(pathname)) throw new Error('Not public');
      if (pathname.split('/').some(part => part === '.' || part === '..')) throw new Error('Traversal');
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) throw new Error('Outside root');
      const real = await fs.realpath(file);
      const permitted = pathname === '/' || pathname === '/index.html' ? path.join(root, 'index.html') : path.join(root, pathname.split('/')[1]) + path.sep;
      if (real !== permitted && !real.startsWith(permitted)) throw new Error('Private path');
      const data = await fs.readFile(real);
      response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
      response.end(data);
    } catch (_) { response.statusCode = 404; response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}
async function load(page, base, source) {
  await page.addInitScript(() => {
    localStorage.setItem('bmd-local-fonts', 'true'); localStorage.setItem('bmd-prefs', JSON.stringify({ typeface: 'georgia' }));
  });
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.goto(base + '/index.html#workspace=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.bmdEditor && window.bmdImages && window.bmdPrint);
  await page.locator('#clipboardBtn').click();
  await page.locator('#editorArea').fill(source);
  await page.locator('#editorDone').click();
  await page.waitForFunction(() => !document.querySelector('#reader').classList.contains('is-hidden'));
  await page.evaluate(async () => { await window.bmdImages.ready(document.querySelector('#article')); await window.bmdCharts.ready(); await document.fonts.ready; });
}
module.exports = { serve, load, root };
