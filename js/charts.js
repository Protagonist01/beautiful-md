/* Markdown chart fences. Libraries are local and loaded only when needed. */
(function () {
  const scripts = new Map();
  let pending = Promise.resolve(), generation = 0, id = 0;
  function load(name, path) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!scripts.has(name)) scripts.set(name, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => resolve(window[name]);
      script.onerror = () => { scripts.delete(name); script.remove(); reject(new Error('Could not load the chart renderer.')); };
      document.head.appendChild(script);
    }));
    return scripts.get(name);
  }
  async function svgImage(svg) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const el = doc.documentElement;
    if (el.querySelector('foreignObject')) throw new Error('HTML labels are not supported; use plain-text labels.');
    const view = el.getAttribute('viewBox').split(/[ ,]+/).map(Number);
    const w = Math.max(1, view[2]), h = Math.max(1, view[3]);
    el.setAttribute('width', String(w)); el.setAttribute('height', String(h));
    const source = new Image();
    source.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(el));
    await source.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 4000 / w, 4000 / h);
    canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }
  async function renderAll(article, token) {
    const blocks = Array.from(article.querySelectorAll('pre > code')).filter(code => /language-(mermaid|chartjs|chart)(?:\s|$)/.test(code.className));
    if (!blocks.length) return;
    await document.fonts.ready;
    for (const code of blocks) {
      if (token !== generation || !code.isConnected) return;
      const block = code.closest('.code-block');
      if (!block) continue;
      const old = block.nextElementSibling;
      if (old && old.classList.contains('chart-figure')) old.remove();
      block.querySelectorAll('.chart-error').forEach(el => el.remove());
      block.hidden = false;
      let chart = null;
      try {
        const vars = getComputedStyle(document.documentElement);
        const ink = vars.getPropertyValue('--ink').trim();
        const paper = vars.getPropertyValue('--paper-raised').trim();
        const accent = vars.getPropertyValue('--accent').trim();
        const dark = document.documentElement.dataset.theme === 'dark';
        const palette = dark ? ['#88cfe5', '#efa1b7', '#a0d39b', '#e5bd78', '#bfa9ef', '#e79a78'] : ['#397b96', '#a54768', '#48794e', '#98692c', '#7960a0', '#b25a3a'];
        let image, label;
        if (code.classList.contains('language-mermaid')) {
          const mermaid = await load('mermaid', 'vendor/mermaid.min.js');
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, htmlLabels: false, flowchart: { htmlLabels: false },
            secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels', 'flowchart'],
            theme: 'base', fontFamily: 'Georgia, serif', themeVariables: { darkMode: dark, primaryColor: paper, primaryTextColor: ink, primaryBorderColor: accent, lineColor: accent, secondaryColor: paper, tertiaryColor: paper, textColor: ink,
              pie1: palette[0], pie2: palette[1], pie3: palette[2], pie4: palette[3], pie5: palette[4], pie6: palette[5], pieTitleTextColor: ink, pieLegendTextColor: ink, pieSectionTextColor: paper, pieStrokeColor: paper } });
          const result = await mermaid.render('bmd-diagram-' + (++id), code.textContent);
          image = await svgImage(result.svg);
          label = 'Mermaid diagram';
        } else {
          const config = JSON.parse(code.textContent, (key, value) => {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsupported configuration key.');
            return value;
          });
          if (!config || !['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble'].includes(config.type) || !Array.isArray(config.data?.datasets)) throw new Error('Use a chart type and data.datasets array.');
          const Chart = await load('Chart', 'vendor/chart.umd.js');
          config.data.datasets.forEach((dataset, index) => {
            const color = palette[index % palette.length];
            if (dataset.backgroundColor === undefined) dataset.backgroundColor = ['pie', 'doughnut', 'polarArea'].includes(config.type) ? palette : color;
            if (dataset.borderColor === undefined) dataset.borderColor = ['pie', 'doughnut', 'polarArea'].includes(config.type) ? paper : color;
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(360, Math.min(800, article.clientWidth - 40));
          canvas.height = Math.max(260, Math.round(canvas.width * 0.56));
          Chart.defaults.color = ink;
          Chart.defaults.borderColor = vars.getPropertyValue('--hairline').trim();
          Chart.defaults.font.family = 'Georgia, serif';
          const options = config.options || {};
          chart = new Chart(canvas, { type: config.type, data: config.data, options: { ...options, responsive: false, animation: false, devicePixelRatio: 2, plugins: { ...options.plugins, legend: { ...options.plugins?.legend, labels: { ...options.plugins?.legend?.labels, color: ink } } } } });
          image = chart.toBase64Image();
          label = typeof options.plugins?.title?.text === 'string' ? options.plugins.title.text : config.type + ' chart';
        }
        if (token !== generation || !code.isConnected) return;
        const figure = document.createElement('figure');
        figure.className = 'chart-figure';
        const img = document.createElement('img');
        img.src = image; img.alt = label;
        await img.decode();
        figure.appendChild(img);
        const caption = document.createElement('figcaption');
        caption.textContent = label;
        figure.appendChild(caption);
        block.after(figure);
        block.hidden = true;
      } catch (error) {
        if (token !== generation || !code.isConnected) return;
        const message = document.createElement('p');
        message.className = 'chart-error';
        message.setAttribute('role', 'status');
        message.textContent = 'Chart could not render: ' + error.message;
        block.appendChild(message);
      } finally { if (chart) chart.destroy(); }
    }
  }
  window.bmdCharts = {
    render(article) {
      const token = ++generation;
      // Mermaid has shared state; serialize renders and abandon stale documents.
      pending = pending.catch(() => {}).then(() => renderAll(article, token));
      return pending;
    },
    async ready() { let last; do { last = pending; await last; } while (last !== pending); }
  };
  new MutationObserver(() => {
    const article = document.getElementById('article');
    if (article?.children.length) window.bmdCharts.render(article);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-paper', 'data-theme'] });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const article = document.getElementById('article');
      if (article?.children.length) window.bmdCharts.render(article);
    }, 150);
  });
})();
