async (page) => {
  const source = [
    '# Workspace Preview', '', 'Unicode 😀 and **bold** text.', '',
    '<img src="invalid" onerror="window.bmdInjected = true">',
    '<svg onload="window.bmdInjected = true"></svg>',
    '<a href="java&#x73;cript:window.bmdInjected=true">Unsafe link</a>',
    '<iframe srcdoc="<script>window.bmdInjected=true</script>"></iframe>', '',
    '| Name | Value |', '|---|---|', '| A | 12 |', '',
    '```chart', '{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"Readers","data":[12,20]}]}}', '```', '',
    '```mermaid', 'flowchart LR', '  Draft --> Publish', '```'
  ].join('\n');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('about:blank');
  await page.goto('http://127.0.0.1:8099/index.html#workspace=1&md=' + encodeURIComponent(source));
  await page.locator('#article h1').waitFor();
  await page.evaluate(() => window.bmdCharts.ready());
  await page.evaluate(() => window.bmdImages.ready(document.querySelector('#article')));
  const state = await page.evaluate(() => ({
    hash: location.hash,
    analytics: Boolean(window.posthog),
    injected: Boolean(window.bmdInjected),
    handlers: document.querySelectorAll('#article [onerror], #article [onload], #article iframe').length,
    badLinks: Array.from(document.querySelectorAll('#article a')).filter(a => /^javascript:/i.test(a.href)).length,
    bold: document.querySelector('#article strong')?.textContent,
    cells: document.querySelectorAll('#article td').length,
    charts: document.querySelectorAll('#article .chart-figure img[alt="bar chart"]').length,
    diagrams: document.querySelectorAll('#article .chart-figure img[alt="Mermaid diagram"]').length
  }));
  if (state.hash || state.analytics || state.injected || state.handlers || state.badLinks) throw new Error('Unsafe handoff: ' + JSON.stringify(state));
  if (state.bold !== 'bold' || state.cells !== 2 || !state.charts || !state.diagrams) throw new Error('Formatting or charts failed: ' + JSON.stringify(state));
  // The broken test image is useful for injection checks, but must be removed
  // before testing successful export (the exporter correctly rejects it).
  await page.locator('#article img[data-bmd-image-error], #article .image-error').evaluateAll(images => images.forEach(image => image.remove()));
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  for (const [label, name] of [['Download PDF', 'workspace-preview.pdf'], ['Download PNG image', 'workspace-export.png']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#downloadPdfBtn').disabled);
    if (await page.locator('#exportSaveLink').isHidden()) throw new Error(await page.locator('#exportStatus').textContent());
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.locator('#exportSaveLink').click();
    const download = await downloadPromise;
    if (await download.failure()) throw new Error('Export failed: ' + name);
    await download.saveAs('output/playwright/' + name);
  }
  await page.getByRole('button', { name: 'Close download options' }).click();
  await page.screenshot({ path: 'output/playwright/workspace-preview.png', fullPage: true });
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  return { state, exports: ['PDF', 'PNG'], errors };
}
