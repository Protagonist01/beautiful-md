/* Stable export layout, independent of the viewport and scroll position. */
window.bmdExport = async function (article, onProgress) {
  const report = typeof onProgress === 'function' ? onProgress : function () {};
  if (!window.html2canvas) throw new Error('Image exporter is unavailable');
  await window.bmdCharts.ready();
  const surface = article.cloneNode(true);
  surface.removeAttribute('id');
  surface.classList.add('export-surface');
  surface.setAttribute('aria-hidden', 'true');
  surface.querySelectorAll('.anchor, .copy-btn').forEach(el => el.remove());
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
      range.setEnd(text, match.index + Array.from(text.textContent.slice(match.index))[0].length);
      const span = document.createElement('span');
      span.className = 'export-dropcap';
      range.surroundContents(span);
      break;
    }
  });
  document.body.appendChild(surface);
  try {
    report('Waiting for type and pictures…');
    await document.fonts.ready;
    await Promise.all(Array.from(surface.querySelectorAll('img')).map(async img => {
      img.loading = 'eager';
      const src = img.currentSrc || img.src;
      if (!src) throw new Error('An image has no source');
      const url = new URL(src, location.href);
      if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) {
        img.crossOrigin = 'anonymous';
        img.src = src;
      }
      let timer;
      try {
        await Promise.race([img.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); })]);
      } catch (_) {
        throw new Error('Image could not load: ' + (img.alt || url.pathname.split('/').pop() || 'unnamed image') + '. Use an embedded image or a URL that permits cross-origin access.');
      } finally { clearTimeout(timer); }
    }));
    const style = getComputedStyle(surface);
    const vars = getComputedStyle(root);
    const color = vars.getPropertyValue('--paper-raised').trim();
    const width = surface.offsetWidth;
    const totalHeight = surface.scrollHeight;
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
    }
    const tiles = [];
    const tileEstimate = Math.max(1, Math.ceil(totalHeight / tileHeight));
    for (let offset = 0; offset < totalHeight;) {
      report('Rendering the page — part ' + (tiles.length + 1) + ' of ' + tileEstimate + '…');
      const limit = Math.min(offset + tileHeight, totalHeight);
      const end = limit === totalHeight ? limit : nextBoundary(offset, limit, 0);
      const height = end - offset;
      const content = await html2canvas(surface, {
        scale, width, height, x: 0, y: offset, scrollX: 0, scrollY: 0,
        backgroundColor: lined ? null : color, useCORS: true, logging: false,
        onclone: doc => {
          const clone = doc.querySelector('.export-surface');
          clone.style.background = 'transparent';
          doc.querySelectorAll('dialog, .settings-scrim, .toast').forEach(el => el.remove());
        }
      });
      if (!content || !content.width || !content.height) {
        throw new Error('This device ran out of drawing memory. Try a narrower measure or a smaller text size.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = content.width; canvas.height = content.height;
      const ctx = canvas.getContext('2d');
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
      tiles.push({ canvas, start: offset * scale });
      offset = end;
    }
    return { tiles, width: width * scale, height: totalHeight * scale, pages, color };
  } finally { surface.remove(); }
};
