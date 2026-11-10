async (page) => {
  await page.locator('#newDocBtn').click();
  await page.locator('#clipboardBtn').click();
  const md = '# Charts and export\n\nA complete document with diagrams, charts, tables, code, and paragraphs to check the typesetting across page boundaries.\n\n## Workflow\n\n```mermaid\nflowchart LR\n  Draft --> Review --> Publish\n```\n\n## Readers\n\n```chart\n{"type":"bar","data":{"labels":["Jan","Feb","Mar"],"datasets":[{"label":"Readers","data":[120,190,260],"backgroundColor":"#397b96"}]},"options":{"plugins":{"title":{"display":true,"text":"Monthly readers"}}}}\n```\n\n' + Array.from({length: 24}, (_, i) => '## Section ' + (i+1) + '\n\n' + 'Readable words should stay together across page boundaries. The final sentence must remain visible. '.repeat(8) + '\n\n| Item | Result |\n| --- | --- |\n| Typography | Clear and complete |\n| Charts | Included in downloads |\n\n').join('');
  await page.locator('#pasteArea').fill(md);
  await page.locator('#pasteRender').click();
  await page.evaluate(() => window.bmdCharts.ready());
  console.log(await page.locator('.chart-error').allTextContents());
  console.log('charts', await page.locator('.chart-figure').count());
  await page.screenshot({path:'output/playwright/charts-reader.png', fullPage:false});
  await page.locator('#exportBtn').click();
  const download = page.waitForEvent('download', {timeout:120000});
  await page.locator('#downloadPdfBtn').click();
  const file = await download;
  await file.saveAs('output/playwright/charts-long.pdf');
}
