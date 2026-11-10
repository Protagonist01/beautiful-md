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
    var requests = BmdMarkdown.docs(blocks, target.index, target.tabId);
    // Keep computed append indices valid if another editor changes the file.
    var body = { requests: requests };
    if (doc.revisionId) body.writeControl = { requiredRevisionId: doc.revisionId };
    api(endpoints.docs + '/' + encodeURIComponent(id) + ':batchUpdate', 'post', body);
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
    var id;
    if (insert) id = fileContext(event, host);
    else {
      var created = api(endpoints[host], 'post', host === 'sheets' ? { properties: { title: title } } : { title: title });
      id = created.documentId || created.spreadsheetId || created.presentationId;
      if (!id) throw new Error('Google did not return the new file ID.');
    }
    if (host === 'docs') return writeDoc(id, blocks);
    if (host === 'sheets') return writeSheet(id, blocks, title, insert);
    return writeSlides(id, blocks);
  }
  return { convert: convert, fileContext: fileContext, docTarget: docTarget, points: points };
})();
