const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.bmdEditor && window.bmdExport);
    async function load(source) {
      await page.evaluate(source => {
        const data = new DataTransfer();
        data.setData('text/plain', source);
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, source);
      await page.waitForTimeout(800);
    }
    await load('# ' + 'LongHeading'.repeat(15) + '\n\n' + 'LongWord'.repeat(80) + '\n\n## Details\n\n' + fs.readFileSync('output/verify/fixtures/overflow.md', 'utf8'));
    const overflow = [];
    for (const width of [320, 375, 430, 768]) {
      await page.setViewportSize({ width, height: 812 });
      for (const paper of ['paper', 'ruled', 'graph']) {
        await page.evaluate(paper => document.documentElement.dataset.paper = paper, paper);
        await page.waitForTimeout(100);
        const result = await page.evaluate(() => {
          const art = document.querySelector('#article');
          const textOutside = [];
          const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode())) {
            if (!text.textContent.trim() || text.parentElement.closest('.table-wrap, pre')) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            if ([...range.getClientRects()].some(r => r.left < -1 || r.right > innerWidth + 1)) textOutside.push(text.textContent.slice(0, 30));
          }
          return { width: innerWidth, paper: document.documentElement.dataset.paper, article: art.clientWidth, scroll: art.scrollWidth,
            textOutside,
            outside: [...document.querySelectorAll('#article p, #article h1, #article h2, .table-wrap, .code-block')].filter(el => {
              const r = el.getBoundingClientRect();
              return r.left < -1 || r.right > innerWidth + 1;
            }).map(el => el.tagName + '.' + el.className) };
        });
        console.log('layout', result);
        if (result.scroll > result.article + 1 || result.outside.length || result.textOutside.length) overflow.push(result);
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => document.documentElement.dataset.paper = 'paper');
    await page.screenshot({ path: 'output/playwright/mobile-wrapping.png', fullPage: true });
    await page.locator('#editBtn').click();
    await page.locator('#editorTabPreview').click();
    const preview = await page.locator('#editorPreview').evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(preview.scroll <= preview.client + 1, 'Editor preview overflows');
    await page.screenshot({ path: 'output/playwright/mobile-preview-wrapping.png' });
    await page.locator('#editorDone').click();
    await load('# Oversized row\n\n| Long cell | Other cell |\n| --- | --- |\n| ' + 'A row must continue onto the next page without losing its text. '.repeat(180) + ' | Another column. |\n\nEND OF DOCUMENT');
    const capture = await page.evaluate(async () => {
      try {
        const result = await window.bmdExport(document.querySelector('#article'));
        let position = 0;
        for (const page of result.pages) {
          if (page.start !== position || page.height <= 0) throw new Error('Page gap or empty page');
          position += page.height;
        }
        let tileEnd = 0;
        for (const tile of result.tiles) {
          if (tile.start !== tileEnd || tile.canvas.height <= 0) throw new Error('Tile gap or empty tile');
          tileEnd += tile.canvas.height;
        }
        return { pages: result.pages.length, tiles: result.tiles.length, covered: position === result.height && tileEnd === result.height, clean: !document.querySelector('.export-surface') };
      } catch (err) { return { error: err.message }; }
    });
    console.log('oversized row', capture);
    assert.equal(overflow.length, 0, 'Mobile content overflows');
    assert.ok(!capture.error, capture.error);
    assert.ok(capture.pages > 1 && capture.tiles > 1 && capture.covered && capture.clean);
    for (const [button, extension] of [['#downloadPdfBtn', 'pdf'], ['#downloadImageBtn', 'zip']]) {
      await page.locator('#exportBtn').click();
      const pending = page.waitForEvent('download', { timeout: 120000 });
      await page.locator(button).click();
      const download = await pending;
      assert.ok(download.suggestedFilename().endsWith('.' + extension));
      const file = 'output/playwright/oversized-row.' + extension;
      await download.saveAs(file);
      assert.ok(fs.statSync(file).size > 10000);
      console.log('download', extension, fs.statSync(file).size, 'bytes');
      await page.waitForFunction(() => !document.querySelector('#downloadPdfBtn').disabled);
      if (await page.locator('#exportDialog').isVisible()) await page.locator('#exportClose').click();
    }
    assert.deepEqual(errors, [], 'Browser errors');
    console.log('All pagination and mobile checks passed');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
