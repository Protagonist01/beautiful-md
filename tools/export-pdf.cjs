const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { serve, load } = require('./runtime.cjs');
async function main() {
  const args = process.argv.slice(2), at = name => args[args.indexOf(name) + 1];
  if (!args.includes('--input') || !args.includes('--output')) throw new Error('Usage: npm run export:pdf -- --input document.md --output output/pdf/document.pdf');
  const input = path.resolve(at('--input')), output = path.resolve(at('--output'));
  const source = await fs.readFile(input, 'utf8');
  if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('PDF input is limited to 2 MB. Split this document.');
  const server = await serve(); let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage(); await load(page, server.url, source);
    const html = await page.evaluate(() => window.bmdPrint.prepare(document.querySelector('#article')));
    await page.setContent(html, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });
    const bytes = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
    await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, bytes);
    console.log('Wrote tagged, searchable PDF: ' + output);
  } finally { if (browser) await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
