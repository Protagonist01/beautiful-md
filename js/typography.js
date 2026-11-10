/* Shared display checks; keep notices outside the document's actual content. */
window.bmdTypography = {
  firstGrapheme(text) {
    if (typeof Intl.Segmenter === 'function') return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text))[0]?.segment || '';
    // Never risk splitting a joined emoji/combining sequence on older engines.
    return /^[A-Za-z]$/.test(text[0] || '') && !/[\u0300-\u036f\u200d\ufe00-\ufe0f]/.test(text.slice(1, 3)) ? text[0] : '';
  },
  decorate(container) {
    container.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,figcaption').forEach(el => {
      if (!el.hasAttribute('dir')) el.setAttribute('dir', 'auto');
    });
    container.querySelectorAll('pre,pre code').forEach(el => el.setAttribute('dir', 'ltr'));
    container.querySelectorAll('.dropcap').forEach(el => {
      if (!/^[A-Za-z\u00c0-\u024f]/.test(el.textContent.trim())) el.classList.remove('dropcap');
    });
  },
  fontWarnings(container) {
    const elements = [container, ...container.querySelectorAll('h1,h2,h3,h4,h5,h6,code,pre,td,th,figcaption')];
    const required = new Set(elements.filter(el => el.textContent.trim()).map(el => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/["']/g, '')));
    const webFonts = ['Newsreader', 'Fraunces', 'IBM Plex Sans', 'IBM Plex Mono'];
    const missing = Array.from(required).filter(family => {
      const faces = Array.from(document.fonts).filter(face => face.family.replace(/["']/g, '') === family);
      return faces.some(face => face.status === 'error') || (webFonts.includes(family) && !faces.length);
    });
    return missing.length ? ['A selected web font is unavailable (' + missing.join(', ') + '). A fallback font is being used; line and page breaks may differ.'] : [];
  }
};
