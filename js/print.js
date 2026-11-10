/* Semantic printing keeps real text, headings, tables, and image alternatives. */
window.bmdPrint = {
  async prepare(article, options = {}) {
    const wait = promise => window.bmdTasks.wait(promise, options.signal);
    await wait(window.bmdImages.ready(article));
    await wait(window.bmdCharts.ready()); await wait(document.fonts.ready);
    if (article.querySelector('.chart-error,[data-bmd-image-error]')) throw new Error('Fix failed images or charts before printing.');
    const warnings = window.bmdTypography.fontWarnings(article);
    if (warnings.length) throw new Error(warnings.join(' '));
    const clone = article.cloneNode(true);
    clone.removeAttribute('id'); clone.className = 'article print-article';
    clone.querySelectorAll('.anchor,.copy-btn,.render-notice').forEach(el => el.remove());
    // Floated drop caps detach the first letter in PDF reading/search order.
    clone.querySelectorAll('.dropcap').forEach(el => el.classList.remove('dropcap'));
    // Freeze loaded image bytes so a downloaded HTML document is self-contained.
    for (const img of clone.querySelectorAll('img')) {
      const response = await wait(fetch(img.src, { signal: options.signal }));
      if (!response.ok) throw new Error('Could not prepare an image for printing.');
      const blob = await wait(response.blob());
      img.src = await wait(new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      }));
      img.loading = 'eager';
    }
    const css = await wait(fetch(new URL('css/style.css', location.href), { signal: options.signal }).then(r => {
      if (!r.ok) throw new Error('Could not load print styles.'); return r.text();
    }));
    const variables = getComputedStyle(document.documentElement);
    let custom = '';
    for (const name of variables) if (name.startsWith('--')) custom += name + ':' + variables.getPropertyValue(name) + ';';
    const fonts = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).filter(link => new URL(link.href).hostname === 'fonts.googleapis.com').map(link => link.outerHTML).join('');
    const escape = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    return '<!doctype html><html lang="' + escape(document.documentElement.lang || 'en') + '"><head><meta charset="utf-8"><title>' + escape(document.title) + '</title>' + fonts +
      '<style>' + css + '\n:root{' + custom + '}\n' +
      '@page{size:A4;margin:12mm}body{display:block;min-height:0;padding:0;background:var(--paper-raised);color:var(--ink)}' +
      '.print-article{display:block;width:100%;max-width:none;margin:0;padding:0;animation:none;opacity:1;transform:none;box-shadow:none;border:0}' +
      '.print-article pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.table-wrap{overflow:visible}table{table-layout:fixed;width:100%}th,td{overflow-wrap:anywhere}' +
      'thead{display:table-header-group}tr,figure{break-inside:avoid}h1,h2,h3,h4,h5,h6{break-after:avoid}p{orphans:3;widows:3}' +
      '.print-article img{max-width:100%;max-height:240mm;object-fit:contain}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '</style></head><body class="' + escape(document.body.className) + '"><main>' + clone.outerHTML + '</main></body></html>';
  }
};
