async (page) => {
  await page.reload();
  await page.evaluate(() => window.bmdCharts.ready());
  if (await page.locator('.chart-figure').count() !== 4) throw new Error('Gallery incomplete');
  await page.locator('#exportBtn').click();
  const download = page.waitForEvent('download');
  await page.locator('#downloadPdfBtn').click();
  await (await download).saveAs('output/playwright/gallery.pdf');
  await page.screenshot({path:'output/playwright/gallery-mobile.png',fullPage:true});
}
