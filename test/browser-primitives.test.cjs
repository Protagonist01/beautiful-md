const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const load = file => { const ctx = vm.createContext({ window: {}, setTimeout, clearTimeout }); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx); return ctx; };
test('oversized PNG dimensions are rejected from header bytes without a decoder', () => {
  const ctx = load('js/images.js');
  const bytes = new Uint8Array(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, 100000); view.setUint32(20, 100000);
  assert.throws(() => ctx.bmdImages.dimensions(bytes), /16 million/);
  view.setUint32(16, 100); view.setUint32(20, 500);
  assert.equal(ctx.bmdImages.dimensions(bytes).height, 500);
});
test('unknown and animated sources fail closed before decoder use', () => {
  const ctx = load('js/images.js');
  assert.throws(() => ctx.bmdImages.dimensions(new Uint8Array([1, 2, 3])), /safely inspect/);
  assert.throws(() => ctx.bmdImages.dimensions(new Uint8Array(Buffer.from('GIF89a\x01\x00\x01\x00', 'binary'))), /static PNG/);
});
test('aborted and timed-out waits settle promptly and clean up late results', async () => {
  const ctx = load('js/tasks.js'), tasks = ctx.window.bmdTasks;
  const controller = new AbortController(); let resolve, cleaned = false;
  const pending = tasks.wait(new Promise(r => { resolve = r; }), controller.signal, 1000, () => { cleaned = true; });
  controller.abort(new Error('cancelled')); await assert.rejects(pending, /cancelled/);
  resolve({}); await new Promise(r => setTimeout(r, 1)); assert.equal(cleaned, true);
  await assert.rejects(tasks.wait(new Promise(() => {}), undefined, 5), /timed out/);
});

test('font checks include heading and code families even when reading font is available', () => {
  const heading = { textContent: 'Heading', family: 'Fraunces' }, code = { textContent: 'code', family: 'IBM Plex Mono' };
  const container = { textContent: 'Body', family: 'Newsreader', querySelectorAll: () => [heading, code] };
  const ctx = vm.createContext({ window: {}, getComputedStyle: el => ({ fontFamily: el.family }), document: { fonts: [
    { family: 'Newsreader', status: 'loaded' }, { family: 'Fraunces', status: 'error' }, { family: 'IBM Plex Mono', status: 'error' }
  ] } });
  vm.runInContext(fs.readFileSync('js/typography.js', 'utf8'), ctx);
  const notices = ctx.window.bmdTypography.fontWarnings(container);
  assert.match(notices[0], /Fraunces/); assert.match(notices[0], /IBM Plex Mono/);
});
