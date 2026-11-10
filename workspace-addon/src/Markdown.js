/* Common Markdown model. No browser or Google dependencies. */
var BmdMarkdown = (function () {
  'use strict';
  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function decode(value) {
    return String(value).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, function (_, name) {
      if (name[0] === '#') {
        var point = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\uFFFD';
      }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name.toLowerCase()];
    });
  }
  function safeLink(href) {
    var clean = decode(href || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(clean) && !/[\u0000-\u0020]/.test(clean) ? clean : '';
  }
  function inline(tokens, inherited) {
    var runs = [];
    (tokens || []).forEach(function (token) {
      var style = Object.assign({}, inherited || {});
      if (token.type === 'strong') style.bold = true;
      if (token.type === 'em') style.italic = true;
      if (token.type === 'del') style.strikethrough = true;
      if (token.type === 'codespan') style.code = true;
      if (token.type === 'link') style.link = safeLink(token.href);
      if (token.type === 'html') {
        // Raw HTML is literal text, never executable markup.
        runs.push({ text: token.raw, style: style });
      } else if (token.type === 'image') {
        runs.push({ text: '[Image: ' + decode(token.text || 'image') + ']', style: style,
          image: { url: safeLink(token.href), alt: decode(token.text || 'image') } });
      } else if (token.tokens) {
        runs = runs.concat(inline(token.tokens, style));
      } else {
        runs.push({ text: token.type === 'br' ? '\n' : decode(token.text || ''), style: style });
      }
    });
    return runs;
  }
  function plain(runs) { return runs.map(function (r) { return r.text; }).join(''); }
  function validateNative(blocks) {
    // Validate AFTER entity decoding as well as raw input. Google strips these
    // characters, which would invalidate every following text-style index.
    var text = paragraphs(blocks).map(function (b) { return plain(b.runs); }).join('\n');
    if (/[\u0000-\u0008\u000c-\u001f\ue000-\uf8ff]/.test(text)) {
      throw new Error('Native conversion cannot preserve control or private-use characters. Remove them or use styled preview instead.');
    }
    paragraphs(blocks).forEach(function (b) { b.runs.forEach(function (r) {
      if (r.image && (!/^https:\/\//i.test(r.image.url) || r.image.url.length > 2048)) throw new Error('Native images require a public HTTPS raster-image URL no longer than 2 KB. Use styled preview for private or embedded images.');
    }); });
  }
  function direction(text) {
    var first = String(text).match(/[A-Za-z\u00c0-\u02af\u0590-\u08ff\u3040-\u9fff]/);
    return first && /[\u0590-\u08ff]/.test(first[0]) ? 'RIGHT_TO_LEFT' : 'LEFT_TO_RIGHT';
  }
  function graphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), function (s) { return s.segment; });
    var result = [], mark;
    try { mark = new RegExp('\\p{Mark}', 'u'); } catch (_) { mark = /[\u0300-\u036f\u0591-\u05bd\u064b-\u065f]/; }
    Array.from(text).forEach(function (char) {
      var last = result[result.length - 1], point = char.codePointAt(0);
      var flagPair = point >= 0x1f1e6 && point <= 0x1f1ff && last && Array.from(last).length === 1 && last.codePointAt(0) >= 0x1f1e6 && last.codePointAt(0) <= 0x1f1ff;
      if (last && (mark.test(char) || /[\u200d\ufe00-\ufe0f]/.test(char) || last.endsWith('\u200d') || point >= 0x1f3fb && point <= 0x1f3ff || flagPair)) result[result.length - 1] += char;
      else result.push(char);
    });
    return result;
  }
  function parse(source) {
    if (typeof source !== 'string' || !source.trim()) throw new Error('Paste some Markdown first.');
    if (source.length > 30000) throw new Error('This document is too large for the add-on.');
    var blocks = [];
    function visit(tokens, prefix) {
      (tokens || []).forEach(function (t) {
        if (t.type === 'space' || t.type === 'def') return;
        if (t.type === 'blockquote') { visit(t.tokens, '> '); return; }
        if (t.type === 'list') {
          t.items.forEach(function (item, i) {
            var marker = t.ordered ? String(Number(t.start) + i) + '. ' : '• ';
            if (item.task) marker = item.checked ? '☑ ' : '☐ ';
            visit(item.tokens, (prefix || '') + marker);
          });
          return;
        }
        if (t.type === 'table') {
          var rows = [t.header].concat(t.rows).map(function (row) {
            return row.map(function (cell) { return inline(cell.tokens); });
          });
          blocks.push({ type: 'table', rows: rows, align: t.align });
          return;
        }
        var runs;
        if (t.type === 'code') runs = [{ text: t.text, style: { code: true } }];
        else if (t.type === 'html') runs = [{ text: t.raw.trimEnd(), style: {} }];
        else if (t.type === 'hr') runs = [{ text: '────────', style: {} }];
        else runs = inline(t.tokens || [{ type: 'text', text: t.text || t.raw || '' }]);
        if (prefix) runs.unshift({ text: prefix, style: {} });
        var block = { type: t.type === 'heading' ? 'heading' : t.type === 'code' ? 'code' : 'paragraph', depth: t.depth || 0, runs: runs };
        if (t.type === 'code' && /^(chart|chartjs)$/i.test((t.lang || '').trim())) {
          try { block.chart = JSON.parse(t.text, function (key, value) {
            if (['__proto__', 'constructor', 'prototype'].indexOf(key) !== -1) throw new Error('Unsafe chart key.'); return value;
          }); } catch (_) { throw new Error('Invalid chart JSON. Fix the chart before native conversion.'); }
        }
        blocks.push(block);
      });
    }
    visit(marked.lexer(source, { gfm: true }));
    if (!blocks.length) throw new Error('The Markdown contains no visible content.');
    return blocks;
  }
  function paragraphs(blocks) {
    var result = [];
    blocks.forEach(function (b) {
      if (b.type !== 'table') { result.push(b); return; }
      b.rows.forEach(function (cells) {
        var runs = [];
        cells.forEach(function (cell, i) {
          if (i) runs.push({ text: '\t', style: {} });
          runs = runs.concat(cell);
        });
        result.push({ type: 'paragraph', depth: 0, runs: runs });
      });
    });
    return result;
  }
  function html(blocks) {
    function renderRuns(runs) {
      return runs.map(function (r) {
        if (r.image) return '<img src="' + escape(r.image.url) + '" alt="' + escape(r.image.alt) + '" style="max-width:100%;height:auto">';
        var out = escape(r.text).replace(/\n/g, '<br>');
        if (r.style.code) out = '<code>' + out + '</code>';
        if (r.style.bold) out = '<strong>' + out + '</strong>';
        if (r.style.italic) out = '<em>' + out + '</em>';
        if (r.style.strikethrough) out = '<s>' + out + '</s>';
        if (r.style.link) out = '<a href="' + escape(r.style.link) + '">' + out + '</a>';
        return out;
      }).join('');
    }
    return blocks.map(function (b) {
      if (b.type === 'code') return '<pre dir="ltr" style="white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace"><code>' + escape(plain(b.runs)) + '</code></pre>';
      if (b.type === 'table') return '<table border="1" cellpadding="6" cellspacing="0">' + b.rows.map(function (row, i) {
        var tag = i ? 'td' : 'th';
        return '<tr>' + row.map(function (cell) { return '<' + tag + '>' + renderRuns(cell) + '</' + tag + '>'; }).join('') + '</tr>';
      }).join('') + '</table>';
      var tag = b.type === 'heading' ? 'h' + b.depth : 'p';
      var rtl = direction(plain(b.runs)) === 'RIGHT_TO_LEFT' ? ' dir="rtl"' : '';
      return '<' + tag + rtl + '>' + renderRuns(b.runs) + '</' + tag + '>';
    }).join('');
  }
  function textStyle(style, slides) {
    var out = {};
    ['bold', 'italic', 'strikethrough'].forEach(function (key) { if (style[key]) out[key] = true; });
    if (style.link) out.link = { url: style.link };
    if (style.code) {
      if (slides) out.fontFamily = 'Courier New';
      else out.weightedFontFamily = { fontFamily: 'Courier New' };
    }
    return out;
  }
  function docs(blocks, start, tabId, separator, imageWidth) {
    validateNative(blocks);
    var needsSeparator = separator !== false && start > 1;
    var all = paragraphs(blocks), text = needsSeparator ? '\n' : '', formats = [], images = [];
    all.forEach(function (b) {
      var begin = start + text.length;
      b.runs.forEach(function (r) {
        var from = start + text.length;
        text += r.text;
        if (r.image) images.push({ start: from, end: start + text.length, image: r.image });
        var style = textStyle(r.style, false);
        if (r.text.length && Object.keys(style).length) formats.push({ updateTextStyle: {
          range: Object.assign({ startIndex: from, endIndex: start + text.length }, tabId ? { tabId: tabId } : {}),
          textStyle: style, fields: Object.keys(style).join(',')
        } });
      });
      text += '\n';
      formats.push({ updateParagraphStyle: {
        range: Object.assign({ startIndex: begin, endIndex: start + text.length }, tabId ? { tabId: tabId } : {}),
        paragraphStyle: { namedStyleType: b.type === 'heading' ? 'HEADING_' + b.depth : 'NORMAL_TEXT',
          direction: b.type === 'code' ? 'LEFT_TO_RIGHT' : direction(plain(b.runs)),
          alignment: 'START', lineSpacing: 115, spaceAbove: { magnitude: 0, unit: 'PT' }, spaceBelow: { magnitude: 8, unit: 'PT' },
          indentStart: { magnitude: 0, unit: 'PT' }, indentEnd: { magnitude: 0, unit: 'PT' }, indentFirstLine: { magnitude: 0, unit: 'PT' } },
        fields: 'namedStyleType,direction,alignment,lineSpacing,spaceAbove,spaceBelow,indentStart,indentEnd,indentFirstLine,tabStops,shading,keepWithNext,avoidWidowAndOrphan'
      } });
      if (b.type === 'heading') formats.push({ updateTextStyle: {
        range: Object.assign({ startIndex: begin, endIndex: start + text.length }, tabId ? { tabId: tabId } : {}),
        textStyle: { bold: true, fontSize: { magnitude: [24, 20, 17, 14, 12, 11][b.depth - 1], unit: 'PT' } }, fields: 'bold,fontSize'
      } });
    });
    var range = Object.assign({ startIndex: start, endIndex: start + text.length }, tabId ? { tabId: tabId } : {});
    return [{ insertText: { location: Object.assign({ index: start }, tabId ? { tabId: tabId } : {}), text: text } },
      { deleteParagraphBullets: { range: Object.assign({}, range, { startIndex: start + (needsSeparator ? 1 : 0) }) } },
      { updateTextStyle: { range: range, textStyle: { bold: false, italic: false, strikethrough: false, underline: false,
        fontSize: { magnitude: 11, unit: 'PT' }, foregroundColor: { color: { rgbColor: { red: 0.15, green: 0.12, blue: 0.1 } } },
        baselineOffset: 'NORMAL', weightedFontFamily: { fontFamily: 'Georgia' } },
        fields: 'bold,italic,strikethrough,underline,fontSize,foregroundColor,backgroundColor,baselineOffset,weightedFontFamily,link,smallCaps' } }
    ].concat(formats, images.reverse().flatMap(function (item) {
      var at = Object.assign({ index: item.start }, tabId ? { tabId: tabId } : {});
      return [{ deleteContentRange: { range: Object.assign({ startIndex: item.start, endIndex: item.end }, tabId ? { tabId: tabId } : {}) } },
        { insertText: { location: at, text: '\n' + item.image.alt + '\n' } },
        { insertInlineImage: { uri: item.image.url, location: at, objectSize: { width: { magnitude: imageWidth || 420, unit: 'PT' } } } }];
    }));
  }
  function sheets(blocks, sheetId) {
    validateNative(blocks);
    var rows = [], imageRows = [], charts = [];
    blocks.forEach(function (b) {
      if (b.chart) {
        var config = b.chart, labels = config.data && config.data.labels, datasets = config.data && config.data.datasets;
        if (!['bar', 'line', 'pie', 'doughnut'].includes(config.type) || !Array.isArray(labels) || !Array.isArray(datasets) || !datasets.length || datasets.length > 8 || labels.length > 200) throw new Error('Native Sheets charts support bar, line, pie, and doughnut with up to 8 datasets and 200 labels. Use styled preview for other chart types.');
        if (['pie', 'doughnut'].includes(config.type) && datasets.length !== 1) throw new Error('Native pie/doughnut charts need one dataset.');
        var start = rows.length, columns = datasets.length + 1;
        var table = [[{ userEnteredValue: { stringValue: 'Label' } }].concat(datasets.map(function (set, i) { return { userEnteredValue: { stringValue: String(set.label || 'Series ' + (i + 1)) } }; }))];
        labels.forEach(function (label, ri) {
          if (typeof label !== 'string' && typeof label !== 'number') throw new Error('Chart labels must be text or numbers.');
          table.push([{ userEnteredValue: { stringValue: String(label) } }].concat(datasets.map(function (set) {
            var value = set.data && set.data[ri];
            if (value === null) return {};
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Native chart values must be finite numbers or null gaps.');
            return { userEnteredValue: { numberValue: value } };
          })));
        });
        table.forEach(function (values, i) {
          if (!i) values.forEach(function (cell) { cell.userEnteredFormat = { textFormat: { bold: true } }; });
          rows.push({ values: values });
        });
        function source(column) { return { sourceRange: { sources: [{ sheetId: sheetId, startRowIndex: start, endRowIndex: rows.length, startColumnIndex: column, endColumnIndex: column + 1 }] } }; }
        var spec = { title: String(config.options && config.options.plugins && config.options.plugins.title && config.options.plugins.title.text || 'Chart') };
        if (['pie', 'doughnut'].includes(config.type)) {
          var domain = source(0), series = source(1);
          domain.sourceRange.sources[0].startRowIndex++; series.sourceRange.sources[0].startRowIndex++;
          spec.pieChart = { domain: domain, series: series, pieHole: config.type === 'doughnut' ? 0.5 : 0, legendPosition: 'RIGHT_LEGEND' };
        }
        else spec.basicChart = { chartType: config.type === 'line' ? 'LINE' : config.options && config.options.indexAxis === 'y' ? 'BAR' : 'COLUMN',
          headerCount: 1, legendPosition: 'BOTTOM_LEGEND', domains: [{ domain: source(0) }],
          series: datasets.map(function (_, i) { return { series: source(i + 1), targetAxis: config.options && config.options.indexAxis === 'y' ? 'BOTTOM_AXIS' : 'LEFT_AXIS' }; }) };
        charts.push({ addChart: { chart: { spec: spec, position: { overlayPosition: { anchorCell: { sheetId: sheetId, rowIndex: start, columnIndex: columns + 1 }, widthPixels: 600, heightPixels: 360 } } } } });
        return;
      }
      var sourceRows = b.type === 'table' ? b.rows : [[b.runs]];
      sourceRows.forEach(function (cells, ri) {
        var values = cells.map(function (runs, ci) {
          var cell = { userEnteredValue: { stringValue: plain(runs) }, userEnteredFormat: { wrapStrategy: 'WRAP' } };
          if (b.align && b.align[ci]) cell.userEnteredFormat.horizontalAlignment = { left: 'LEFT', right: 'RIGHT', center: 'CENTER' }[b.align[ci]];
          var isHeader = b.type === 'heading' || (b.type === 'table' && ri === 0);
          if (isHeader) cell.userEnteredFormat.textFormat = { bold: true, fontSize: b.type === 'heading' ? Math.max(11, 22 - b.depth * 2) : 11 };
          var offset = 0;
          cell.textFormatRuns = runs.filter(function (r) { return r.text.length; }).map(function (r) {
            var format = {};
            ['bold', 'italic', 'strikethrough'].forEach(function (key) { if (r.style[key]) format[key] = true; });
            if (r.style.code) format.fontFamily = 'Courier New';
            if (r.style.link) format.link = { uri: r.style.link };
            var run = { startIndex: offset, format: format }; offset += r.text.length; return run;
          });
          return cell;
        });
        var images = cells.flatMap(function (runs) { return runs.filter(function (run) { return run.image; }); });
        images.forEach(function (run) {
          values.push({ userEnteredValue: { formulaValue: '=IMAGE("' + run.image.url.replace(/"/g, '""') + '",1)' }, note: run.image.alt });
        });
        if (images.length) imageRows.push(rows.length);
        rows.push({ values: values });
      });
    });
    return [{ updateCells: { start: { sheetId: sheetId, rowIndex: 0, columnIndex: 0 }, rows: rows, fields: 'userEnteredValue,userEnteredFormat,textFormatRuns,note' } }].concat(imageRows.map(function (index) {
      return { updateDimensionProperties: { range: { sheetId: sheetId, dimension: 'ROWS', startIndex: index, endIndex: index + 1 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } };
    }), charts);
  }
  function slides(blocks, pageWidth, pageHeight, prefix) {
    validateNative(blocks);
    var pages = [], current = null;
    // Apps Script has no font measurement API. Use conservative advances,
    // independent of style boundaries, with extra room for font fallback.
    function wrap(runs, size, available) {
      var lines = [], line = [], width = 0, limit = available || pageWidth - 96;
      function flush() { lines.push(line); line = []; width = 0; }
      runs.forEach(function (r) {
        var units = graphemes(r.text);
        units.forEach(function (char) {
          if (char === '\n') { flush(); return; }
          var advance = /[\u0300-\u036f\u200d\ufe0f]/.test(char) && char.length === 1 ? 0 :
            char === '\t' ? size * 3.6 : /[\u2e80-\u9fff\ud800-\udfff]/.test(char) ? size * 1.25 : /[ il.,'!|]/.test(char) ? size * 0.45 : /[MW@#]/.test(char) ? size * 1.15 : size * 0.85;
          if (width + advance > limit && line.length) flush();
          line.push({ text: char, style: r.style }); width += advance;
        });
      });
      if (line.length || !lines.length) flush();
      // Coalesce adjacent equal styles so requests stay bounded.
      return lines.map(function (units) {
        var merged = [];
        units.forEach(function (u) {
          var last = merged[merged.length - 1];
          if (last && JSON.stringify(last.style) === JSON.stringify(u.style)) last.text += u.text;
          else merged.push({ text: u.text, style: u.style });
        });
        return merged;
      });
    }
    var maxLines = Math.max(1, Math.floor((pageHeight - 146) / 24));
    function page(title) { current = { title: title || 'Beautiful MD', runs: [], lines: 0 }; pages.push(current); }
    blocks.forEach(function (b) {
      if (b.type === 'table') {
        var tableImages = b.rows.flatMap(function (row) { return row.flatMap(function (runs) { return runs.filter(function (run) { return run.image; }); }); });
        var columns = b.rows[0].length, maxColumns = Math.max(1, Math.floor((pageWidth - 72) / 120));
        for (var column = 0; column < columns; column += maxColumns) {
          var count = Math.min(maxColumns, columns - column), width = (pageWidth - 72) / count;
          var rows = b.rows.map(function (row) { return row.slice(column, column + count); });
          var header = rows[0], headerHeight = Math.max.apply(null, header.map(function (runs) { return wrap(runs, 12, width - 24).length * 18 + 12; }));
          var titleText = current ? current.title : 'Table';
          var used = 0;
          rows.forEach(function (row, ri) {
            var rowHeight = Math.max.apply(null, row.map(function (runs) { return wrap(runs, 12, width - 24).length * 18 + 12; }));
            if (rowHeight + (ri ? headerHeight : 0) > pageHeight - 146) throw new Error('A table row is too tall for a slide. Split its text or use the styled preview.');
            if (ri === 0 || used + rowHeight > pageHeight - 146) {
              if (!current || current.runs.length || current.table || current.image) page(titleText);
              current.table = [{ cells: header, height: headerHeight, align: (b.align || []).slice(column, column + count) }]; used = headerHeight;
              if (ri === 0) return;
            }
            current.table.push({ cells: row, height: rowHeight, align: (b.align || []).slice(column, column + count) }); used += rowHeight;
          });
        }
        current = null;
        tableImages.forEach(function (run) { page(run.image.alt); current.image = run.image; });
        current = null; return;
      }
      if (b.type === 'heading' && b.depth <= 2) {
        var titles = wrap([{ text: plain(b.runs), style: { bold: true } }], 28);
        for (var i = 0; i < titles.length; i += 2) page(titles.slice(i, i + 2).map(plain).join('\n'));
        return;
      }
      var images = b.runs.filter(function (run) { return run.image; });
      if (images.length) {
        var prior = current ? current.title : 'Beautiful MD';
        images.forEach(function (run) {
          if (!current || current.runs.length || current.image || current.table) page(prior);
          current.image = run.image;
        });
        current = null;
      }
      var textRuns = b.runs.filter(function (run) { return !run.image; });
      if (!textRuns.length) return;
      if (!current) page('Beautiful MD');
      wrap(textRuns, 16).forEach(function (line) {
        if (current.lines >= maxLines) page(current.title);
        current.runs = current.runs.concat(line, [{ text: '\n', style: {} }]);
        current.lines++;
      });
    });
    if (pages.length > 40) throw new Error('This document would create more than 40 slides. Split it into smaller documents.');
    var requests = [];
    pages.forEach(function (p, i) {
      var slide = prefix + '_s' + i, title = prefix + '_t' + i, body = prefix + '_b' + i;
      requests.push({ createSlide: { objectId: slide, slideLayoutReference: { predefinedLayout: 'BLANK' } } });
      [{ id: title, y: 24, height: 78, runs: [{ text: p.title, style: { bold: true } }], size: 28 },
        { id: body, y: 110, height: pageHeight - 134, runs: p.runs, size: 16 }].filter(function (box) { return box.id === title || !p.table && !p.image; }).forEach(function (box) {
        requests.push({ createShape: { objectId: box.id, shapeType: 'TEXT_BOX', elementProperties: {
          pageObjectId: slide, size: { width: { magnitude: pageWidth - 72, unit: 'PT' }, height: { magnitude: box.height, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: box.y, unit: 'PT' }
        } } });
        var content = plain(box.runs);
        if (!content) return;
        requests.push({ insertText: { objectId: box.id, text: content, insertionIndex: 0 } });
        requests.push({ updateTextStyle: { objectId: box.id, textRange: { type: 'ALL' }, style: { fontFamily: 'Georgia', fontSize: { magnitude: box.size, unit: 'PT' } }, fields: 'fontFamily,fontSize' } });
        requests.push({ updateParagraphStyle: { objectId: box.id, textRange: { type: 'ALL' },
          style: { direction: direction(content), alignment: 'START', lineSpacing: 100,
            spaceAbove: { magnitude: 0, unit: 'PT' }, spaceBelow: { magnitude: 0, unit: 'PT' } }, fields: 'direction,alignment,lineSpacing,spaceAbove,spaceBelow' } });
        var paragraphOffset = 0;
        content.split('\n').forEach(function (line) {
          var end = Math.min(content.length, paragraphOffset + line.length + 1);
          if (end > paragraphOffset) requests.push({ updateParagraphStyle: { objectId: box.id,
            textRange: { type: 'FIXED_RANGE', startIndex: paragraphOffset, endIndex: end },
            style: { direction: direction(line) }, fields: 'direction' } });
          paragraphOffset = end;
        });
        var offset = 0;
        box.runs.forEach(function (r) {
          var style = textStyle(r.style, true), from = offset; offset += r.text.length;
          if (offset > from && Object.keys(style).length) requests.push({ updateTextStyle: { objectId: box.id,
            textRange: { type: 'FIXED_RANGE', startIndex: from, endIndex: offset }, style: style, fields: Object.keys(style).join(',') } });
        });
      });
      var elementProperties = { pageObjectId: slide,
        size: { width: { magnitude: pageWidth - 72, unit: 'PT' }, height: { magnitude: pageHeight - 134, unit: 'PT' } },
        transform: { scaleX: 1, scaleY: 1, translateX: 36, translateY: 110, unit: 'PT' } };
      if (p.image) {
        var imageId = prefix + '_img' + i;
        requests.push({ createImage: { objectId: imageId, url: p.image.url, elementProperties: elementProperties } });
        requests.push({ updatePageElementAltText: { objectId: imageId, title: p.image.alt, description: p.image.alt } });
      }
      if (p.table) {
        var tableId = prefix + '_table' + i;
        var tableProperties = JSON.parse(JSON.stringify(elementProperties));
        tableProperties.size.height.magnitude = p.table.length * 18;
        requests.push({ createTable: { objectId: tableId, rows: p.table.length, columns: p.table[0].cells.length, elementProperties: tableProperties } });
        p.table.forEach(function (row, ri) {
          requests.push({ updateTableRowProperties: { objectId: tableId, rowIndices: [ri], tableRowProperties: { minRowHeight: { magnitude: row.height, unit: 'PT' } }, fields: 'minRowHeight' } });
          row.cells.forEach(function (runs, ci) {
            var location = { rowIndex: ri, columnIndex: ci }, content = plain(runs);
            if (!content) return;
            requests.push({ insertText: { objectId: tableId, cellLocation: location, text: content, insertionIndex: 0 } });
            requests.push({ updateTextStyle: { objectId: tableId, cellLocation: location, textRange: { type: 'ALL' },
              style: { fontFamily: 'Georgia', fontSize: { magnitude: 12, unit: 'PT' }, bold: ri === 0 }, fields: 'fontFamily,fontSize,bold' } });
            requests.push({ updateParagraphStyle: { objectId: tableId, cellLocation: location, textRange: { type: 'ALL' },
              style: { direction: direction(content), alignment: { left: 'START', right: 'END', center: 'CENTER' }[(row.align || [])[ci]] || 'START',
                spaceAbove: { magnitude: 0, unit: 'PT' }, spaceBelow: { magnitude: 0, unit: 'PT' } }, fields: 'direction,alignment,spaceAbove,spaceBelow' } });
            var at = 0;
            runs.forEach(function (run) {
              var style = textStyle(run.style, true), from = at; at += run.text.length;
              if (at > from && Object.keys(style).length) requests.push({ updateTextStyle: { objectId: tableId, cellLocation: location,
                textRange: { type: 'FIXED_RANGE', startIndex: from, endIndex: at }, style: style, fields: Object.keys(style).join(',') } });
            });
          });
        });
      }
    });
    return requests;
  }
  return { parse: parse, html: html, plain: plain, paragraphs: paragraphs, docs: docs, sheets: sheets, slides: slides, escape: escape, safeLink: safeLink, validateNative: validateNative };
})();
