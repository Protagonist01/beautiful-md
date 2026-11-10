async (page) => {
  await page.locator('#exportBtn').click();
  const download = page.waitForEvent('download');
  await page.locator('#downloadImageBtn').click();
  const file = await download;
  await file.saveAs('output/playwright/export-short.png');
  console.log(await page.locator('#toast').textContent());
}
