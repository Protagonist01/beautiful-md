/* Markdown HTML is processed in an inert template before touching the page. */
window.bmdSanitizeHTML = function (html) {
  'use strict';
  const template = document.createElement('template');
  template.innerHTML = html;
  const warnings = new Set();
  const tags = new Set('a abbr b blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input kbd li mark ol p pre s samp small span strong sub summary sup table tbody td th thead tr ul'.split(' '));
  const discard = new Set('script style iframe object embed svg math template noscript'.split(' '));
  function safeUrl(value, image) {
    const clean = value.trim();
    if (image && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(clean)) return clean;
    // URL parsing normalizes tabs/newlines, including obfuscated javascript:.
    try {
      const url = new URL(clean, location.href);
      if (['http:', 'https:'].includes(url.protocol) || (!image && url.protocol === 'mailto:')) return clean;
    } catch (_) { /* invalid URL */ }
    return null;
  }
  function visit(parent) {
    Array.from(parent.children).forEach(el => {
      const tag = el.localName;
      if (discard.has(tag)) { warnings.add('Embedded HTML, SVG, or math was removed. Use a supported chart fence or raster image.'); el.remove(); return; }
      visit(el);
      if (!tags.has(tag)) { warnings.add('Unsupported HTML elements were simplified.'); el.replaceWith(...el.childNodes); return; }
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name, value = attr.value;
        if (['title', 'alt'].includes(name)) return;
        if (['td', 'th'].includes(tag) && name === 'align' && /^(left|right|center)$/.test(value)) {
          el.style.textAlign = value; el.removeAttribute('align'); return;
        }
        if (name === 'dir' && /^(auto|rtl|ltr)$/.test(value)) return;
        if (['td', 'th'].includes(tag) && name === 'style' && /^text-align:\s*(left|right|center);?$/i.test(value.trim())) return;
        if (name === 'class' && tag === 'code') {
          el.className = value.split(/\s+/).filter(c => /^language-[\w+#-]+$/.test(c)).join(' ');
          return;
        }
        if ((name === 'href' && tag === 'a') || (name === 'src' && tag === 'img')) {
          const safe = safeUrl(value, tag === 'img');
          if (safe !== null) { el.setAttribute(name, safe); return; }
        }
        if (['colspan', 'rowspan', 'start'].includes(name) && /^\d{1,3}$/.test(value)) return;
        if (tag === 'input' && name === 'checked') return;
        warnings.add('Unsupported attributes or styling were removed for safe display.');
        el.removeAttribute(name);
      });
      if (tag === 'input') { el.type = 'checkbox'; el.disabled = true; }
    });
  }
  visit(template.content);
  window.bmdSanitizeHTML.warnings = Array.from(warnings);
  return template.innerHTML;
};
