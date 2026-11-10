const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function runtime() {
  const user = {}, script = {}, calls = [], drafts = [];
  const store = data => ({
    getProperty: key => data[key] ?? null,
    setProperties: values => Object.assign(data, values),
    deleteProperty: key => delete data[key]
  });
  const ctx = vm.createContext({
    console, PropertiesService: { getUserProperties: () => store(user), getScriptProperties: () => store(script) },
    Utilities: { newBlob: text => ({ getBytes: () => Array.from(Buffer.from(text)) }), getUuid: () => '12345678-abcd-1234-abcd-123456789abc' },
    LockService: { getUserLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: { getOAuthToken: () => 'test-token' },
    UrlFetchApp: { fetch(url, options) {
      calls.push({ url, options, body: options.payload && JSON.parse(options.payload) });
      const response = ctx.respond(url, options);
      return { getResponseCode: () => response.status || 200, getContentText: () => JSON.stringify(response.status ? response.body : response) };
    } },
    GmailApp: { createDraft(...args) { drafts.push(args); return { id: 'draft-1' }; } }
  });
  const methods = [
    'setFunctionName', 'setParameters', 'setText', 'setFieldName', 'setTitle', 'setValue', 'setMultiline',
    'setComposeAction', 'setOnClickAction', 'setHeader', 'setSubtitle', 'addSection', 'addWidget',
    'setNotification', 'setUrl', 'setOpenLink', 'setGmailDraft', 'setUpdateType', 'addUpdateContent',
    'setUpdateDraftBodyAction', 'setNavigation', 'updateCard', 'requestFileScopeForActiveDocument'
  ];
  function builder(type) {
    const value = { type, operations: [] };
    for (const name of methods) value[name] = (...args) => { value.operations.push({ name, args }); return value; };
    value.build = () => value;
    return value;
  }
  ctx.CardService = {};
  for (const name of ['Action', 'ActionResponseBuilder', 'Notification', 'CardSection', 'TextParagraph', 'TextInput',
    'TextButton', 'CardBuilder', 'CardHeader', 'EditorFileScopeActionResponseBuilder', 'OpenLink',
    'ComposeActionResponseBuilder', 'UpdateDraftBodyAction', 'UpdateDraftActionResponseBuilder', 'Navigation']) {
    ctx.CardService['new' + name] = () => builder(name);
  }
  ctx.CardService.ComposedEmailType = { STANDALONE_DRAFT: 'standalone' };
  ctx.CardService.ContentType = { MUTABLE_HTML: 'html' };
  ctx.CardService.UpdateDraftBodyType = { IN_PLACE_INSERT: 'cursor' };
  vm.runInContext(fs.readFileSync(path.join(root, '../vendor/marked.min.js'), 'utf8'), ctx);
  for (const file of ['Markdown', 'Google', 'Addon']) vm.runInContext(fs.readFileSync(path.join(root, 'src', file + '.js'), 'utf8'), ctx);
  return { ctx, user, script, calls, drafts, md: ctx.BmdMarkdown };
}
const plain = value => JSON.parse(JSON.stringify(value));
const event = (host, source = '# Hello\n\nA **bold** idea.', extra = {}) => ({
  commonEventObject: { hostApp: host.toUpperCase(), formInputs: {
    markdown: { stringInputs: { value: [source] } }, title: { stringInputs: { value: ['Example'] } }
  } }, ...extra
});
function operation(value, name) { return value.operations.find(op => op.name === name); }

test('Markdown retains Unicode, nested styles, literal HTML, and safe link protocols', () => {
  const { md } = runtime();
  const blocks = md.parse('# Résumé 😀\n\n**bold _and italic_** [good](https://example.com) [bad](javascript:alert)\n\n<img src=x onerror=alert(1)>');
  const html = md.html(blocks);
  assert.match(html, /<h1>Résumé 😀<\/h1>/);
  assert.match(html, /<em><strong>and italic<\/strong><\/em>|<strong><em>and italic<\/em><\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /&lt;img/);
  assert.equal(md.safeLink('java&#x73;cript:alert(1)'), '');
});

test('Docs uses UTF-16 offsets, starts appends on a fresh paragraph, and targets a tab', () => {
  const { md } = runtime();
  const requests = plain(md.docs(md.parse('😀 **bold**'), 12, 'tab-1'));
  assert.equal(requests[0].insertText.text, '\n😀 bold\n');
  assert.deepEqual(requests[0].insertText.location, { index: 12, tabId: 'tab-1' });
  const bold = requests.find(r => r.updateTextStyle?.textStyle.bold === true).updateTextStyle;
  assert.deepEqual(bold.range, { startIndex: 16, endIndex: 20, tabId: 'tab-1' });
  assert.equal(requests[1].updateTextStyle.textStyle.bold, false);
});

test('Sheets converts tables to cells and keeps formulas as literal strings', () => {
  const { md } = runtime();
  const requests = md.sheets(md.parse('| Name | Value |\n|---|---|\n| **A** | =IMPORTXML("x") |'), 4);
  const rows = requests[0].updateCells.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values[0].userEnteredFormat.textFormat.bold, true);
  assert.equal(rows[1].values[1].userEnteredValue.stringValue, '=IMPORTXML("x")');
  assert.equal(rows[1].values[1].userEnteredValue.formulaValue, undefined);
  assert.equal(rows[1].values[0].textFormatRuns[0].format.bold, true);
});

test('Slides respects custom dimensions, preserves styles, and creates continuation slides', () => {
  const { md } = runtime();
  const requests = md.slides(md.parse('# Title\n\n**bold** ' + 'more content '.repeat(150)), 720, 405, 'test_slide');
  const pages = requests.filter(r => r.createSlide);
  assert.ok(pages.length > 1);
  assert.equal(new Set(pages.map(r => r.createSlide.objectId)).size, pages.length);
  const shape = requests.find(r => r.createShape).createShape;
  assert.equal(shape.elementProperties.size.width.magnitude, 648);
  assert.ok(requests.some(r => r.updateTextStyle?.style.bold === true));
});

test('all four hosts expose creation and compose exposes insertion', () => {
  const { ctx } = runtime();
  for (const host of ['docs', 'sheets', 'slides', 'gmail']) {
    const card = ctx.onHomepage(event(host));
    const json = JSON.stringify(card);
    assert.match(json, /Beautiful MD/);
    assert.match(json, /Create new/);
    if (host !== 'gmail') assert.match(json, /Allow access to this file/);
  }
  assert.match(JSON.stringify(ctx.onGmailCompose(event('gmail'))), /Insert into this email/);
});

test('permission request preserves input, insertion rejects ungranted files without API writes', () => {
  const { ctx, user, calls } = runtime();
  const input = event('docs');
  assert.equal(ctx.requestEditorAccess(input).type, 'EditorFileScopeActionResponseBuilder');
  assert.equal(user.bmdSource, '# Hello\n\nA **bold** idea.');
  const result = ctx.insertNative(input);
  assert.match(JSON.stringify(result), /Allow access/);
  assert.equal(calls.length, 0);
  const allowed = event('docs', '# Again', { docs: { id: 'doc-1', addonHasFileScopePermission: true } });
  assert.match(JSON.stringify(ctx.onHomepage(allowed)), /Append to first document tab/);
});

test('Docs appends to first tab with revision guard and never uses another file', () => {
  const { ctx, calls } = runtime();
  ctx.respond = (url) => url.endsWith(':batchUpdate') ? {} : {
    revisionId: 'rev-1', tabs: [{ tabProperties: { tabId: 'first' }, documentTab: { body: { content: [{ endIndex: 40 }] } } }]
  };
  const e = event('docs', '# Added', { docs: { id: 'chosen-doc', addonHasFileScopePermission: true } });
  ctx.insertNative(e);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /chosen-doc\?includeTabsContent=true$/);
  assert.equal(calls[1].body.writeControl.requiredRevisionId, 'rev-1');
  assert.equal(calls[1].body.requests[0].insertText.location.index, 39);
  assert.equal(calls[1].body.requests[0].insertText.location.tabId, 'first');
});

test('Sheets inserts a uniquely named worksheet in one batch without overwriting an existing sheet', () => {
  const { ctx, calls } = runtime();
  ctx.respond = url => url.endsWith(':batchUpdate') ? {} : {
    sheets: [{ properties: { sheetId: 1, title: 'Example' } }, { properties: { sheetId: 2, title: 'Example (2)' } }]
  };
  ctx.insertNative(event('sheets', 'Data', { sheets: { id: 'chosen-sheet', addonHasFileScopePermission: true } }));
  const requests = calls[1].body.requests;
  assert.equal(requests[0].addSheet.properties.title, 'Example (3)');
  assert.equal(requests[0].addSheet.properties.sheetId, 3);
  assert.equal(requests.find(r => r.updateCells).updateCells.start.sheetId, 3);
});

test('Slides converts EMU page sizes and guards concurrent edits', () => {
  const { ctx, calls } = runtime();
  ctx.respond = url => url.endsWith(':batchUpdate') ? {} : {
    pageSize: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } }, revisionId: 'rev-2'
  };
  ctx.insertNative(event('slides', '# Deck\n\nContent', { slides: { id: 'deck', addonHasFileScopePermission: true } }));
  assert.equal(calls[1].body.writeControl.requiredRevisionId, 'rev-2');
  assert.equal(calls[1].body.requests.find(r => r.createShape).createShape.elementProperties.size.width.magnitude, 648);
});

test('new native files are created before content writes', () => {
  for (const host of ['docs', 'sheets', 'slides']) {
    const { ctx, calls } = runtime();
    ctx.respond = (url, options) => {
      if (options.method === 'post' && !url.endsWith(':batchUpdate')) return { documentId: 'new-file', spreadsheetId: 'new-file', presentationId: 'new-file' };
      if (url.endsWith(':batchUpdate')) return {};
      if (host === 'docs') return { body: { content: [{ endIndex: 2 }] } };
      if (host === 'sheets') return { sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] };
      return { pageSize: { width: { magnitude: 720, unit: 'PT' }, height: { magnitude: 405, unit: 'PT' } } };
    };
    const result = ctx.createNative(event(host));
    assert.match(JSON.stringify(result), /File created/);
    assert.equal(calls[0].options.method, 'post');
    assert.match(calls[1].url, /new-file/);
    assert.equal(calls.length, 3);
  }
});

test('Gmail draft and insertion use the correct response types and escaped HTML', () => {
  const { ctx, drafts } = runtime();
  const e = event('gmail', '**Hello**\n\n<script>alert(1)</script>');
  assert.equal(ctx.createGmailDraft(e).type, 'ComposeActionResponseBuilder');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0][0], '');
  assert.match(drafts[0][3].htmlBody, /&lt;script&gt;/);
  assert.doesNotMatch(drafts[0][3].htmlBody, /<script>/);
  const result = ctx.insertGmailBody(e);
  assert.equal(result.type, 'UpdateDraftActionResponseBuilder');
  const body = operation(result, 'setUpdateDraftBodyAction').args[0];
  assert.equal(operation(body, 'setUpdateType').args[0], 'cursor');
});

test('preview requires HTTPS configuration and carries exact Markdown only in the fragment', () => {
  const { ctx, script } = runtime();
  const e = event('docs', '# Hello 😀\n\nA&B + 20%');
  assert.match(JSON.stringify(ctx.openStyledPreview(e)), /BMD_PREVIEW_URL/);
  script.BMD_PREVIEW_URL = 'https://example.com/reader/';
  const result = ctx.openStyledPreview(e);
  const link = operation(result, 'setOpenLink').args[0];
  const url = new URL(operation(link, 'setUrl').args[0]);
  assert.equal(url.search, '');
  const fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(fragment.get('workspace'), '1');
  assert.equal(fragment.get('md'), '# Hello 😀\n\nA&B + 20%');
  script.BMD_PREVIEW_URL = 'http://example.com/';
  assert.match(JSON.stringify(ctx.openStyledPreview(e)), /HTTPS/);
});

test('input limits use UTF-8 bytes; empty, control characters and long URLs fail without writes', () => {
  const { ctx, calls, script } = runtime();
  for (const source of ['', '😀'.repeat(1800), 'bad\u0000text']) {
    assert.match(JSON.stringify(ctx.createNative(event('docs', source))), /first|7,000|control characters/);
  }
  script.BMD_PREVIEW_URL = 'https://example.com/';
  assert.match(JSON.stringify(ctx.openStyledPreview(event('docs', '%'.repeat(5000)))), /too long/);
  assert.equal(calls.length, 0);
});

test('API failures are not retried and do not echo content or tokens', () => {
  const { ctx, calls } = runtime();
  ctx.respond = () => ({ status: 403, body: { error: 'secret-content test-token' } });
  const result = JSON.stringify(ctx.createNative(event('docs')));
  assert.match(result, /HTTP 403/);
  assert.doesNotMatch(result, /secret-content|test-token/);
  assert.equal(calls.length, 1);
});

test('clear removes only add-on input and retains compose context', () => {
  const { ctx, user } = runtime();
  user.otherSetting = 'keep'; user.bmdSource = 'private'; user.bmdTitle = 'private title';
  const e = event('gmail'); e.commonEventObject.parameters = { compose: 'true' };
  const result = ctx.clearSavedInput(e);
  assert.equal(user.bmdSource, undefined);
  assert.equal(user.bmdTitle, undefined);
  assert.equal(user.otherSetting, 'keep');
  assert.match(JSON.stringify(result), /Insert into this email/);
  assert.doesNotMatch(JSON.stringify(result), /private title/);
});

test('manifest wires four hosts and every trigger to an existing callback', () => {
  const { ctx } = runtime();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'appsscript.json')));
  for (const host of ['docs', 'sheets', 'slides', 'gmail']) assert.ok(manifest.addOns[host]);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.runFunction) assert.equal(typeof ctx[value.runFunction], 'function');
    Object.values(value).forEach(visit);
  }
  visit(manifest);
  assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(!manifest.oauthScopes.some(scope => /mail\.google\.com|gmail\.send|gmail\.modify|gmail\.readonly/.test(scope)));
});
