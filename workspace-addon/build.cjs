const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const dest = path.join(root, 'dist');
fs.mkdirSync(dest, { recursive: true });
for (const name of ['Markdown', 'Journal', 'Google', 'Addon']) {
  fs.copyFileSync(path.join(root, 'src', name + '.js'), path.join(dest, name + '.gs'));
}
// UMD chooses globalThis.marked in Apps Script; keep vendor license header.
fs.copyFileSync(path.join(root, '..', 'vendor', 'marked.min.js'), path.join(dest, 'Marked.gs'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8'));
const flag = process.argv.indexOf('--preview-url');
const configPath = path.join(dest, 'Config.gs');
if (flag !== -1) {
  const url = new URL(process.argv[flag + 1]);
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) throw new Error('Preview URL must be HTTPS without query, fragment, or credentials.');
  manifest.addOns.common.openLinkUrlPrefixes.push(url.href);
  fs.writeFileSync(configPath, 'function configurePreview() {\n  PropertiesService.getScriptProperties().setProperty("BMD_PREVIEW_URL", ' + JSON.stringify(url.href) + ');\n}\n');
} else if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
fs.writeFileSync(path.join(dest, 'appsscript.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Built Apps Script files in workspace-addon/dist');
