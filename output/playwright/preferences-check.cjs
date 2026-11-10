async (page) => {
  await page.reload();
  await page.evaluate(() => window.bmdCharts.ready());
  if (await page.locator('.chart-figure').count() !== 2) throw new Error('Missing charts');
  await page.locator('#settingsBtn').click();
  await page.locator('label').filter({hasText:'Filename & reading stats'}).click();
  await page.locator('label').filter({hasText:'Decorative marks'}).click();
  for (const font of ['serif','sans','georgia','palatino','verdana','mono']) {
    await page.locator('#prefTypeface').selectOption(font);
    if (!(await page.evaluate(() => getComputedStyle(document.querySelector('#article')).fontFamily))) throw new Error('Missing font');
  }
  await page.locator('#prefTypeface').selectOption('georgia');
  for (const theme of ['sage','ocean','rose']) await page.locator('.swatch[data-paper="' + theme + '"]').click();
  await page.locator('#settingsClose').click();
  await page.locator('#themeToggle').click();
  await page.evaluate(() => window.bmdCharts.ready());
  if (await page.locator('.chart-error').count()) throw new Error('Theme chart error');
  await page.reload();
  if (!(await page.evaluate(() => document.body.classList.contains('no-dochead') && document.body.classList.contains('no-ornaments')))) throw new Error('Preferences lost');
  if (await page.locator('#prefTypeface').inputValue() !== 'georgia') throw new Error('Font preference lost');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => window.bmdCharts.ready());
  if (await page.evaluate(() => document.documentElement.scrollWidth > 390)) throw new Error('Mobile overflow');
  await page.screenshot({path:'output/playwright/mobile-dark.png'});
  await page.locator('#exportBtn').click();
  const pdfDownload = page.waitForEvent('download', {timeout:120000});
  await page.locator('#downloadPdfBtn').click();
  await (await pdfDownload).saveAs('output/playwright/charts-long.pdf');
  await page.locator('#exportBtn').click();
  const zipDownload = page.waitForEvent('download', {timeout:120000});
  await page.locator('#downloadImageBtn').click();
  await (await zipDownload).saveAs('output/playwright/charts-long.zip');
}

