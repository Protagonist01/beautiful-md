/* Google APIs: explicit event file IDs; never active-document helpers. */
var BmdGoogle = (function () {
  'use strict';
  var endpoints = {
    docs: 'https://docs.googleapis.com/v1/documents',
    sheets: 'https://sheets.googleapis.com/v4/spreadsheets',
    slides: 'https://slides.googleapis.com/v1/presentations'
  };
  function api(url, method, payload) {
    var options = {
      method: method || 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    };
    if (payload !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
    var response = UrlFetchApp.fetch(url, options), status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      // API errors can echo user content. Expose status only, never payload/token.
      throw new Error('Google returned HTTP ' + status + '. Check file access and enabled APIs. Inspect the target before retrying.');
    }
    var text = response.getContentText();
    return text ? JSON.parse(text) : {};
  }
  function fileContext(event, host) {
    var context = event && event[host];
    if (!context || !context.id || context.addonHasFileScopePermission !== true) {
      throw new Error('Allow access to this file before inserting content.');
    }
    return String(context.id);
  }
  function docTarget(document) {
    var first = document.tabs && document.tabs[0];
    // The API represents document tabs separately from their metadata.
    var tabId = first && first.tabProperties && first.tabProperties.tabId;
    var content = first && first.documentTab ? first.documentTab.body.content : document.body && document.body.content;
    if (!content || !content.length) throw new Error('Google did not return an editable document body.');
    var end = content[content.length - 1].endIndex;
    if (!Number.isInteger(end) || end < 2) throw new Error('The document ending position is unavailable.');
    return { index: end - 1, tabId: tabId };
  }
  function writeDoc(id, blocks) {
    var doc = api(endpoints.docs + '/' + encodeURIComponent(id) + '?includeTabsContent=true');
    var target = docTarget(doc);
    var style = doc.documentStyle || {};
    var imageWidth = Math.max(36, Math.min(420, (style.pageSize && style.pageSize.width && style.pageSize.width.magnitude || 612) - (style.marginLeft && style.marginLeft.magnitude || 72) - (style.marginRight && style.marginRight.magnitude || 72)));
    var hasTables = blocks.some(function (block) { return block.type === 'table'; });
    var requests = hasTables ? blocks.slice().reverse().flatMap(function (block) {
      if (block.type === 'table') return [{ insertTable: { rows: block.rows.length, columns: block.rows[0].length,
        location: Object.assign({ index: target.index }, target.tabId ? { tabId: target.tabId } : {}) } }];
      return BmdMarkdown.docs([block], target.index, target.tabId, true, imageWidth);
    }) : BmdMarkdown.docs(blocks, target.index, target.tabId, true, imageWidth);
    // Keep computed append indices valid if another editor changes the file.
    var body = { requests: requests };
    if (doc.revisionId) body.writeControl = { requiredRevisionId: doc.revisionId };
    api(endpoints.docs + '/' + encodeURIComponent(id) + ':batchUpdate', 'post', body);
    if (hasTables) {
      // Read the table cell indices created by Google; never guess their offsets.
      var updated = api(endpoints.docs + '/' + encodeURIComponent(id) + '?includeTabsContent=true');
      var first = updated.tabs && updated.tabs[0];
      var content = first && first.documentTab ? first.documentTab.body.content : updated.body && updated.body.content;
      var tables = (content || []).filter(function (element) { return element.table && element.startIndex >= target.index; });
      var sources = blocks.filter(function (block) { return block.type === 'table'; });
      if (tables.length !== sources.length) throw new Error('Table structure changed. Review the saved document before another operation.');
      var cells = [];
      tables.forEach(function (element, ti) {
        element.table.tableRows.forEach(function (row, ri) { row.tableCells.forEach(function (cell, ci) {
          var paragraph = cell.content.find(function (part) { return part.paragraph; });
          if (!paragraph || !Number.isInteger(paragraph.startIndex)) throw new Error('Google did not return a writable table cell.');
          var runs = sources[ti].rows[ri][ci].map(function (run) { return Object.assign({}, run, { style: Object.assign({}, run.style, ri === 0 ? { bold: true } : {}) }); });
          cells.push({ index: paragraph.startIndex, runs: runs, width: Math.max(24, imageWidth / row.tableCells.length - 12), alignment: { left: 'START', right: 'END', center: 'CENTER' }[(sources[ti].align || [])[ci]] || 'START' });
        }); });
      });
      var fill = { requests: cells.sort(function (a, b) { return b.index - a.index; }).flatMap(function (cell) {
        return BmdMarkdown.docs([{ type: 'paragraph', runs: cell.runs }], cell.index, target.tabId, false, cell.width).map(function (request) {
          if (request.updateParagraphStyle) request.updateParagraphStyle.paragraphStyle.alignment = cell.alignment;
          return request;
        });
      }) };
      if (updated.revisionId) fill.writeControl = { requiredRevisionId: updated.revisionId };
      api(endpoints.docs + '/' + encodeURIComponent(id) + ':batchUpdate', 'post', fill);
    }
    return 'https://docs.google.com/document/d/' + encodeURIComponent(id) + '/edit';
  }
  function writeSheet(id, blocks, title, existing) {
    var meta = api(endpoints.sheets + '/' + encodeURIComponent(id) + '?fields=sheets.properties');
    var sheet = meta.sheets && meta.sheets[0];
    var requests = [], sheetId;
    if (existing || !sheet) {
      var usedIds = (meta.sheets || []).map(function (s) { return s.properties.sheetId; });
      sheetId = 1;
      while (usedIds.indexOf(sheetId) !== -1) sheetId++;
      var base = title.replace(/[\[\]*?:/\\]/g, ' ').trim().slice(0, 70) || 'Beautiful MD';
      var names = (meta.sheets || []).map(function (s) { return s.properties.title; });
      var name = base, suffix = 2;
      while (names.indexOf(name) !== -1) name = base + ' (' + suffix++ + ')';
      requests.push({ addSheet: { properties: { sheetId: sheetId, title: name } } });
    } else sheetId = sheet.properties.sheetId;
    var writes = BmdMarkdown.sheets(blocks, sheetId);
    var rows = writes[0].updateCells.rows;
    var columns = rows.reduce(function (n, r) { return Math.max(n, r.values.length); }, 1);
    if (rows.length > 1000 || columns > 100) throw new Error('Use at most 1,000 rows and 100 columns per conversion.');
    if (requests.length) requests[0].addSheet.properties.gridProperties = { rowCount: Math.max(1000, rows.length), columnCount: Math.max(26, columns) };
    else requests.push({ updateSheetProperties: { properties: { sheetId: sheetId, gridProperties: { rowCount: Math.max(1000, rows.length), columnCount: Math.max(26, columns) } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
    requests = requests.concat(writes);
    requests.push({ updateDimensionProperties: {
      range: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: columns },
      properties: { pixelSize: columns === 1 ? 600 : 200 }, fields: 'pixelSize'
    } });
    api(endpoints.sheets + '/' + encodeURIComponent(id) + ':batchUpdate', 'post', { requests: requests });
    return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/edit#gid=' + sheetId;
  }
  function points(dimension) {
    if (!dimension || !Number.isFinite(dimension.magnitude)) throw new Error('Google did not return the slide dimensions.');
    if (dimension.unit === 'PT') return dimension.magnitude;
    if (dimension.unit === 'EMU') return dimension.magnitude / 12700;
    throw new Error('Unsupported slide measurement unit.');
  }
  function writeSlides(id, blocks) {
    var meta = api(endpoints.slides + '/' + encodeURIComponent(id) + '?fields=pageSize,revisionId');
    var width = points(meta.pageSize.width), height = points(meta.pageSize.height);
    if (width < 240 || height < 240) throw new Error('This slide size is too small. Use a page at least 240 points wide and tall.');
    var prefix = 'bmd_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var body = { requests: BmdMarkdown.slides(blocks, width, height, prefix) };
    if (meta.revisionId) body.writeControl = { requiredRevisionId: meta.revisionId };
    api(endpoints.slides + '/' + encodeURIComponent(id) + ':batchUpdate', 'post', body);
    return 'https://docs.google.com/presentation/d/' + encodeURIComponent(id) + '/edit';
  }
  function convert(host, title, blocks, event, insert) {
    if (!endpoints[host]) throw new Error('Open this action in Docs, Sheets, or Slides.');
    BmdMarkdown.validateNative(blocks);
    if (blocks.some(function (block) { return block.type === 'table' && (block.rows.length > 200 || block.rows[0].length > 20 || block.rows.length * block.rows[0].length > 1000); })) throw new Error('Native tables are limited to 200 rows, 20 columns, and 1,000 cells. Split large tables first.');
    // Catch deterministic content failures before creating an empty file.
    if (host === 'slides' && !insert) BmdMarkdown.slides(blocks, 720, 405, 'preflight');
    if (host === 'sheets') {
      var rows = BmdMarkdown.sheets(blocks, 0)[0].updateCells.rows;
      if (rows.length > 1000 || rows.some(function (row) { return row.values.length > 100; })) throw new Error('Use at most 1,000 rows and 100 columns per conversion.');
    }
    var id;
    if (insert) id = fileContext(event, host);
    function url() { return 'https://docs.google.com/' + { docs: 'document', sheets: 'spreadsheets', slides: 'presentation' }[host] + '/d/' + encodeURIComponent(id) + '/edit'; }
    var operation = BmdJournal.begin([host, title, blocks, insert ? id : 'create'], id ? url() : '');
    if (operation.state === 'done') return operation.target;
    if (!insert) {
      var created = api(endpoints[host], 'post', host === 'sheets' ? { properties: { title: title } } : { title: title });
      id = created.documentId || created.spreadsheetId || created.presentationId;
      if (!id) throw new Error('Google did not return the new file ID.');
    }
    BmdJournal.target(operation, url());
    var result = host === 'docs' ? writeDoc(id, blocks) : host === 'sheets' ? writeSheet(id, blocks, title, insert) : writeSlides(id, blocks);
    BmdJournal.done(operation, result);
    return result;
  }
  return { convert: convert, fileContext: fileContext, docTarget: docTarget, points: points };
})();
