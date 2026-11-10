const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { chromium, firefox, webkit } = require('playwright');
const { serve, load } = require('./runtime.cjs');
const source = '# Browser verification\n\nReadable **bold** text with É and 👨‍👩‍👧‍👦.\n\nمرحبا بالعالم\n\n漢字日本語中文\n\n| Left | Right |\n|:---|---:|\n| A | 12 |\n\n```js\nif (ready) {\n  run();\n}\n```';
(async () => {
  const server = await serve(), results = [];
  try {
    for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
      let browser;
      try {
        browser = await engine.launch();
        for (const width of [375, 1280]) {
          const page = await browser.newPage({ viewport: { width, height: 900 }, acceptDownloads: true });
          const errors = []; page.on('pageerror', error => errors.push(error.message));
          await load(page, server.url, source);
          const state = await page.evaluate(async () => {
            const article = document.querySelector('#article');
            const capture = await window.bmdExport(article);
            const controller = new AbortController();
            const original = window.html2canvas;
            let late;
            window.html2canvas = () => new Promise(resolve => { late = resolve; });
            const pending = window.bmdExport(article, null, { signal: controller.signal });
            while (!late) await new Promise(resolve => setTimeout(resolve, 10));
            controller.abort(new Error('Cancel regression'));
            let cancelled = false;
            try { await pending; } catch (error) { cancelled = error.message === 'Cancel regression'; }
            const lateCanvas = document.createElement('canvas'); lateCanvas.width = 100; lateCanvas.height = 100;
            late(lateCanvas); await new Promise(resolve => setTimeout(resolve, 10)); window.html2canvas = original;
            const fonts = window.bmdTypography.fontWarnings(article);
            const html = await window.bmdPrint.prepare(article);
            return { title: document.title, bold: article.querySelector('strong').textContent,
              rtl: Array.from(article.querySelectorAll('p')).some(p => getComputedStyle(p).direction === 'rtl'),
              compressed: capture.tiles.every(tile => tile.blob.size && !tile.canvas), fonts,
              cancelled, lateReleased: !lateCanvas.width && !lateCanvas.height, clean: !document.querySelector('.export-surface'),
              semantic: html.includes('<table>') && html.includes('<h1') && html.includes('漢字') };
          });
          assert.equal(state.bold, 'bold'); assert.equal(state.rtl, true); assert.equal(state.compressed, true);
          assert.deepEqual(state.fonts, []); assert.ok(state.cancelled && state.lateReleased && state.clean && state.semantic);
          await page.evaluate(() => {
            window.savedCapture = window.html2canvas;
            window.html2canvas = () => new Promise(resolve => { window.completeLateCapture = resolve; });
          });
          await page.locator('#exportBtn').click(); await page.locator('#downloadImageBtn').click();
          await page.waitForFunction(() => window.completeLateCapture);
          await page.locator('#exportCancel').click();
          await page.waitForFunction(() => !document.documentElement.dataset.exporting);
          state.uiCancelled = (await page.locator('#exportStatus').textContent()).includes('cancelled');
          assert.ok(state.uiCancelled);
          await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
            window.completeLateCapture(canvas); window.html2canvas = window.savedCapture;
          });
          await page.locator('#exportClose').click();
          assert.deepEqual(errors, []);
          await page.screenshot({ path: `output/playwright/${name}-${width}-verified.png`, fullPage: true });
          const valid = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32; return canvas.toDataURL(); });
          await page.locator('#editBtn').click(); await page.locator('#editorArea').fill('# Image\n\n![Safe](' + valid + ')'); await page.locator('#editorDone').click();
          await page.evaluate(() => window.bmdImages.ready(document.querySelector('#article')));
          state.safeImage = await page.locator('#article img[data-bmd-verified]').count() === 1;
          assert.ok(state.safeImage);
          const huge = await page.evaluate(() => {
            const bytes = new Uint8Array(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82],12);
            const view = new DataView(bytes.buffer); view.setUint32(16,100000); view.setUint32(20,100000);
            return 'data:image/png;base64,' + btoa(String.fromCharCode(...bytes));
          });
          await page.locator('#editBtn').click(); await page.locator('#editorArea').fill('# Oversized\n\n![Huge](' + huge + ')'); await page.locator('#editorDone').click();
          await page.evaluate(() => window.bmdImages.ready(document.querySelector('#article')));
          state.imageRejectedBeforeDecode = await page.locator('#article img[data-bmd-image-error]:not([src])').count() === 1;
          assert.ok(state.imageRejectedBeforeDecode);
          results.push({ engine: name, width, passed: true, state }); await page.close();
        }
      } catch (error) { results.push({ engine: name, passed: false, error: error.message }); process.exitCode = 1; }
      finally { if (browser) await browser.close(); }
    }
  } finally { await server.close(); }
  await fs.mkdir('output', { recursive: true }); await fs.writeFile('output/browser-matrix.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
