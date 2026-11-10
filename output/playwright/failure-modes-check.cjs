async (page) => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:8099/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const source = '# Failure checks\n\nمرحبا بالعالم هذا نص عربي طويل لاختبار اتجاه الكتابة وتخطيط الفقرات.\n\n漢字日本語中文'.repeat(1) +
    '\n\nE\u0301clair and 👨‍👩‍👧‍👦 stay together.\n\n| Left | Right |\n|:---|---:|\n|A|12|\n\n<svg><text>unsupported</text></svg>';
  await page.goto('about:blank');
  await page.goto('http://127.0.0.1:8099/index.html#workspace=1&md=' + encodeURIComponent(source));
  await page.locator('#article h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const display = await page.evaluate(() => ({
    notice: document.querySelector('#article .render-notice')?.textContent,
    rtl: Array.from(document.querySelectorAll('#article p')).some(p => getComputedStyle(p).direction === 'rtl'),
    align: Array.from(document.querySelectorAll('#article th')).map(el => el.style.textAlign),
    grapheme: window.bmdTypography.firstGrapheme('E\u0301clair'),
    emoji: window.bmdTypography.firstGrapheme('👨‍👩‍👧‍👦 family')
  }));
  check(display.notice.includes('font is unavailable') && display.notice.includes('removed'), 'Missing conversion/font notice');
  check(display.rtl && display.align.join(',') === 'left,right', 'RTL or table alignment lost');
  check(display.grapheme === 'E\u0301' && display.emoji === '👨‍👩‍👧‍👦', 'Grapheme split');
  const fontError = await page.evaluate(async () => {
    try { await window.bmdExport(document.querySelector('#article')); return ''; } catch (e) { return e.message; }
  });
  check(fontError.includes('Use installed fonts'), 'Fallback font export was silent');
  await page.evaluate(() => {
    const select = document.querySelector('#prefTypeface'); select.value = 'georgia'; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const tiles = await page.evaluate(async () => {
    const result = await window.bmdExport(document.querySelector('#article'));
    return { count: result.tiles.length, compressed: result.tiles.every(t => t.blob instanceof Blob && t.blob.size > 0 && !t.canvas), clean: !document.querySelector('.export-surface') };
  });
  check(tiles.compressed && tiles.clean, 'Raw canvases retained or capture leaked');
  await page.evaluate(() => {
    window.originalCapture = window.html2canvas;
    window.html2canvas = async (...args) => { window.captureEntered = true; await new Promise(resolve => { window.releaseCapture = resolve; }); return window.originalCapture(...args); };
  });
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await page.getByRole('button', { name: 'Download PNG image', exact: true }).click();
  await page.waitForFunction(() => window.captureEntered);
  const locked = await page.evaluate(() => {
    document.querySelector('#newDocBtn').click();
    const data = new DataTransfer(); data.setData('text/plain', '# Changed');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    return { open: document.querySelector('#exportDialog').open, exporting: document.documentElement.dataset.exporting, title: document.querySelector('#article h1').textContent };
  });
  check(locked.open && locked.exporting === 'true' && locked.title.includes('Failure checks'), 'Export state changed during capture');
  await page.evaluate(() => window.releaseCapture());
  await page.waitForFunction(() => !document.documentElement.dataset.exporting);
  // The auto-download is best effort. Exercise the real user-gesture fallback.
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.locator('#exportSaveLink').click();
  const download = await downloadPromise;
  await download.saveAs('output/playwright/failure-checks.png');
  await page.getByRole('button', { name: 'Close download options' }).click();
  await page.evaluate(() => { window.html2canvas = window.originalCapture; });
  const portrait = await page.evaluate(async () => {
    const article = document.querySelector('#article'), canvas = document.createElement('canvas');
    canvas.width = 100; canvas.height = 1000;
    canvas.getContext('2d').fillRect(0, 0, 100, 1000);
    const img = new Image(); img.alt = 'Portrait ratio fixture'; img.src = canvas.toDataURL(); article.append(img); await img.decode();
    const original = window.html2canvas;
    let size;
    window.html2canvas = async (surface, options) => {
      const bounds = surface.querySelector('img[alt="Portrait ratio fixture"]').getBoundingClientRect();
      size = { width: bounds.width, height: bounds.height }; return original(surface, options);
    };
    try { await window.bmdExport(article); return size; }
    finally { window.html2canvas = original; img.remove(); }
  });
  check(portrait.height <= 850 && Math.abs(portrait.height / portrait.width - 10) < 0.1, 'Tall image ratio changed');
  const faults = await page.evaluate(async () => {
    const article = document.querySelector('#article');
    const marker = document.createElement('p'); marker.className = 'chart-error'; article.append(marker);
    let chart = ''; try { await window.bmdExport(article); } catch (e) { chart = e.message; } finally { marker.remove(); }
    const original = HTMLCanvasElement.prototype.toBlob;
    const encoded = [];
    HTMLCanvasElement.prototype.toBlob = function (callback) { encoded.push(this); callback({ size: 33 * 1024 * 1024 }); };
    let budget = ''; try { await window.bmdExport(article); } catch (e) { budget = e.message; }
    finally { HTMLCanvasElement.prototype.toBlob = original; }
    return { chart, budget, clean: !document.querySelector('.export-surface'), released: encoded.length > 0 && encoded.every(canvas => !canvas.width && !canvas.height) };
  });
  check(faults.chart.includes('Fix its source') && faults.budget.includes('32 MB') && faults.clean && faults.released, 'Export faults were silent or leaked drawing memory');
  await page.screenshot({ path: 'output/playwright/failure-checks-display.png', fullPage: true });
  await page.unroute('**/fonts.googleapis.com/**'); await page.unroute('**/fonts.gstatic.com/**');
  return { display, tiles, locked, portrait, faults, downloaded: download.suggestedFilename() };
}
