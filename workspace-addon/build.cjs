const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const dest = path.join(root, 'dist');
fs.mkdirSync(dest, { recursive: true });
for (const name of ['Markdown', 'Google', 'Addon']) {
  fs.copyFileSync(path.join(root, 'src', name + '.js'), path.join(dest, name + '.gs'));
}
// UMD chooses globalThis.marked in Apps Script; keep vendor license header.
fs.copyFileSync(path.join(root, '..', 'vendor', 'marked.min.js'), path.join(dest, 'Marked.gs'));
fs.copyFileSync(path.join(root, 'appsscript.json'), path.join(dest, 'appsscript.json'));
console.log('Built Apps Script files in workspace-addon/dist');
