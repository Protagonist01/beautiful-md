/* Stable export layout, independent of the viewport and scroll position. */
window.bmdExport = async function (article, onProgress, options = {}) {
  const signal = options.signal;
  const wait = (promise, cleanup) => window.bmdTasks.wait(promise, signal, options.stepTimeout || 30000, cleanup);
  const report = text => { window.bmdTasks.check(signal); if (typeof onProgress === 'function') onProgress(text); };
  if (!window.html2canvas) throw new Error('Image exporter is unavailable');
  await wait(window.bmdImages.ready(article));
  if (article.querySelector('[data-bmd-image-error]')) throw new Error('An image failed safe preflight. Replace or remove it before exporting.');
  await wait(window.bmdCharts.ready());
  if (article.querySelector('.chart-error')) throw new Error('A chart could not render. Fix its source before exporting.');
  const surface = article.cloneNode(true);
  surface.removeAttribute('id');
  surface.classList.add('export-surface');
  surface.setAttribute('aria-hidden', 'true');
  surface.querySelectorAll('.anchor, .copy-btn, .render-notice').forEach(el => el.remove());
  surface.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  Array.from(surface.children).forEach(el => { el.style.paddingBottom = ''; });
  const root = document.documentElement;
  const paper = root.getAttribute('data-paper');
  const lined = ['ruled', 'legal', 'graph'].includes(paper);
  const widths = { narrow: 680, medium: 800, wide: 920 };
  const measure = document.body.classList.contains('measure-narrow') ? 'narrow' : document.body.classList.contains('measure-wide') ? 'wide' : 'medium';
  surface.style.width = widths[measure] + 'px';
  // html2canvas does not implement ::first-letter. Use an ordinary span.
  surface.querySelectorAll('.dropcap').forEach(p => {
    p.classList.remove('dropcap');
    if (lined || document.body.classList.contains('no-dropcap')) return;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode())) {
      const match = text.textContent.match(/\S/u);
      if (!match) continue;
      const range = document.createRange();
      range.setStart(text, match.index);
      const letter = window.bmdTypography.firstGrapheme(text.textContent.slice(match.index));
      if (!letter) break;
      range.setEnd(text, match.index + letter.length);
      const span = document.createElement('span');
      span.className = 'export-dropcap';
      range.surroundContents(span);
      break;
    }
  });
  document.body.appendChild(surface);
  try {
    report('Waiting for type and pictures…');
    await wait(document.fonts.ready);
    const fontWarnings = window.bmdTypography.fontWarnings(surface);
    if (fontWarnings.length) throw new Error(fontWarnings[0] + ' Choose Use installed fonts in Typesetting before exporting.');
    for (const img of surface.querySelectorAll('img')) {
      img.loading = 'eager';
      const src = img.currentSrc || img.src;
      if (!src) throw new Error('An image has no source');
      const url = new URL(src, location.href);
      if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) {
        img.crossOrigin = 'anonymous';
        img.src = src;
      }
      try {
        await wait(img.decode());
      } catch (_) {
        throw new Error('Image could not load: ' + (img.alt || url.pathname.split('/').pop() || 'unnamed image') + '. Use an embedded image or a URL that permits cross-origin access.');
      }
      if (img.naturalWidth * img.naturalHeight > 16000000) throw new Error('An image is too large to export safely. Resize it to at most 16 million pixels.');
      // Explicit dimensions avoid html2canvas's unsupported object-fit path.
      const available = surface.clientWidth - 72;
      const factor = Math.min(1, available / img.naturalWidth, 850 / img.naturalHeight);
      img.style.width = Math.max(1, Math.floor(img.naturalWidth * factor)) + 'px';
      img.style.height = Math.max(1, Math.floor(img.naturalHeight * factor)) + 'px';
      img.style.objectFit = 'fill';
    }
    const style = getComputedStyle(surface);
    const vars = getComputedStyle(root);
    const color = vars.getPropertyValue('--paper-raised').trim();
    const width = surface.offsetWidth;
    const totalHeight = surface.scrollHeight;
    if (totalHeight > 200000) throw new Error('This document is too long to export safely. Split it into smaller documents.');
    const scale = 2;
    const pageHeight = Math.floor(width * 273 / 186);
    /* Phone browsers refuse canvases past roughly 16.7M pixels of area, and
       several cap a single side at 8192. Derive the tile height from the
       export width so a wide measure on a phone shrinks instead of handing
       back a blank canvas. */
    const AREA_CAP = 16e6, DIM_CAP = 8192;
    const tileHeight = Math.max(600, Math.min(
      5000,
      Math.floor(AREA_CAP / (width * scale * scale)),
      Math.floor(DIM_CAP / scale)
    ));
    const origin = surface.getBoundingClientRect().top;
    const lines = [], hard = [], soft = [];
    const protect = (box, list, pad = 2) => {
      if (box.height > 0 && box.width > 0) list.push([Math.max(0, box.top - origin - pad), box.bottom - origin + pad]);
    };
    // Range rectangles reflect actual wrapped lines, including inline formatting.
    const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(box => protect(box, lines));
    }
    lines.forEach(line => hard.push(line));
    surface.querySelectorAll('img, tr, .export-dropcap').forEach(el => protect(el.getBoundingClientRect(), hard));
    Array.from(surface.children).forEach(el => {
      const box = el.getBoundingClientRect();
      if (box.height < pageHeight * 0.65) protect(box, soft, 0);
      let following = el.nextElementSibling;
      while (following && !following.getClientRects().length) following = following.nextElementSibling;
      if (/^H[1-6]$/.test(el.tagName) && following) {
        const next = following.getBoundingClientRect();
        const bottom = Math.min(next.bottom, next.top + 60);
        protect({ top: box.top, bottom, height: bottom - box.top, width: box.width }, soft);
      }
    });
    function boundary(start, limit, intervals) {
      let end = limit;
      while (true) {
        const overlaps = intervals.filter(([a, b]) => a < end && b > end);
        if (!overlaps.length) return Math.floor(end);
        const next = Math.floor(Math.min(...overlaps.map(([a]) => a)));
        if (next <= start + 1) return null;
        end = next;
      }
    }
    function nextBoundary(start, limit, minimum) {
      let end = boundary(start, limit, hard.concat(soft));
      if (end === null || end - start < minimum) end = boundary(start, limit, hard);
      // Oversized rows may span pages/tiles. Keep their text lines whole when
      // possible; staggered lines in neighboring cells may require a hard cut.
      if (end === null) end = boundary(start, limit, lines);
      return end === null ? limit : end;
    }
    const pages = [];
    let pos = 0;
    report('Measuring page breaks…');
    while (pos < totalHeight) {
      const limit = Math.min(pos + pageHeight, totalHeight);
      const end = limit === totalHeight ? limit : nextBoundary(pos, limit, pageHeight * 0.3);
      pages.push({ start: pos * scale, height: (end - pos) * scale });
      pos = end;
      if (pages.length > 200) throw new Error('Export is limited to 200 pages. Split the document into smaller files.');
    }
    const tiles = [];
    let encodedBytes = 0;
    const tileEstimate = Math.max(1, Math.ceil(totalHeight / tileHeight));
    for (let offset = 0; offset < totalHeight;) {
      report('Rendering the page — part ' + (tiles.length + 1) + ' of ' + tileEstimate + '…');
      const limit = Math.min(offset + tileHeight, totalHeight);
      const end = limit === totalHeight ? limit : nextBoundary(offset, limit, 0);
      const height = end - offset;
      const content = await wait(html2canvas(surface, {
        scale, width, height, x: 0, y: offset, scrollX: 0, scrollY: 0,
        backgroundColor: lined ? null : color, useCORS: true, logging: false,
        onclone: doc => {
          const clone = doc.querySelector('.export-surface');
          clone.style.background = 'transparent';
          doc.querySelectorAll('dialog, .settings-scrim, .toast').forEach(el => el.remove());
        }
      }), canvas => { canvas.width = canvas.height = 0; });
      if (!content || !content.width || !content.height) {
        throw new Error('This device ran out of drawing memory. Try a narrower measure or a smaller text size.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = content.width; canvas.height = content.height;
      try {
      const ctx = canvas.getContext('2d');
      if (!ctx) { content.width = content.height = canvas.width = canvas.height = 0; throw new Error('Drawing memory is unavailable. Try a smaller document.'); }
      ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (lined) {
        const period = parseFloat(style.lineHeight);
        ctx.fillStyle = vars.getPropertyValue('--rule-ink').trim();
        for (let y = Math.ceil(offset / period) * period; y < offset + height; y += period) ctx.fillRect(0, Math.round((y - offset) * scale), canvas.width, 1);
        if (paper === 'graph') {
          for (let x = period; x < width; x += period) ctx.fillRect(Math.round(x * scale), 0, 1, canvas.height);
        } else {
          ctx.fillStyle = vars.getPropertyValue('--margin-ink').trim();
          ctx.fillRect(22 * scale, 0, 1, canvas.height);
        }
      }
      ctx.drawImage(content, 0, 0);
      content.width = content.height = 0;
        const blob = await wait(new Promise(resolve => canvas.toBlob(resolve, 'image/png')));
        if (!blob) throw new Error('Could not encode an export tile.');
        encodedBytes += blob.size;
        if (encodedBytes > 32 * 1024 * 1024) throw new Error('Export exceeds the 32 MB image budget. Split the document into smaller files.');
        tiles.push({ blob, width: canvas.width, height: canvas.height, start: offset * scale });
      } finally { content.width = content.height = canvas.width = canvas.height = 0; }
      offset = end;
    }
    return { tiles, width: width * scale, height: totalHeight * scale, pages, color };
  } finally { surface.remove(); }
};
