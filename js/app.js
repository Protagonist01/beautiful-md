/* ============================================================
   Beautiful MD — app
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);

  const root = document.documentElement;
  const body = document.body;
  const landing = $("#landing");
  const reader = $("#reader");
  const article = $("#article");
  const tocAside = $("#tocAside");
  const tocTitle = $("#tocTitle");
  const tocNav = $("#tocNav");
  const dropzone = $("#dropzone");
  const fileDropTarget = $("#fileDropTarget");
  const fileInput = $("#fileInput");
  const browseBtn = $("#browseBtn");
  const clipboardBtn = $("#clipboardBtn");
  const newDocBtn = $("#newDocBtn");
  const editBtn = $("#editBtn");
  const exportBtn = $("#exportBtn");
  const exportDialog = $("#exportDialog");
  const exportClose = $("#exportClose");
  const downloadPdfBtn = $("#downloadPdfBtn");
  const downloadImageBtn = $("#downloadImageBtn");
  const downloadMdBtn = $("#downloadMdBtn");
  const exportStatus = $("#exportStatus");
  const exportSaveLink = $("#exportSaveLink");
  const brandLink = $("#brandLink");
  const themeToggle = $("#themeToggle");
  const settingsBtn = $("#settingsBtn");
  const settingsPanel = $("#settingsPanel");
  const settingsScrim = $("#settingsScrim");
  const settingsClose = $("#settingsClose");
  const progressBar = $("#progressBar");
  const toastEl = $("#toast");

  const MD_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;
  const FLEURON = "❦";
  let currentFileName = "document";
  let currentSource = "";

  /* ---------------- paper templates ---------------- */

  const PAPERS = [
    { id: "paper", name: "Paper & Ink" },
    { id: "white", name: "Bright White" },
    { id: "newsprint", name: "Newsprint" },
    { id: "sepia", name: "Aged Sepia" },
    { id: "kraft", name: "Kraft" },
    { id: "night", name: "Night Ink" },
    { id: "ruled", name: "Writing Paper" },
    { id: "legal", name: "Legal Pad" },
    { id: "graph", name: "Graph Paper" },
    { id: "sage", name: "Sage" },
    { id: "ocean", name: "Ocean" },
    { id: "rose", name: "Rose" }
  ];
  function setPaper(id) {
    if (!PAPERS.some((p) => p.id === id)) id = "paper";
    if (id !== "night") {
      try { localStorage.setItem("bmd-last-light", id); } catch (e) { /* private mode */ }
    } else {
      setTheme("dark");
    }
    root.setAttribute("data-paper", id);
    try { localStorage.setItem("bmd-paper", id); } catch (e) { /* private mode */ }
    if (typeof syncSettingsUI === "function") syncSettingsUI();
    schedulePaperAlignment();
  }

  function setTheme(theme) {
    root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    try { localStorage.setItem("bmd-mode", theme); } catch (e) { /* private mode */ }
    themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to day ink" : "Switch to night ink");
    themeToggle.title = themeToggle.getAttribute("aria-label");
  }

  function toggleTheme() {
    if (root.getAttribute("data-theme") === "dark") {
      if (root.getAttribute("data-paper") === "night") {
      let last = "paper";
      try { last = localStorage.getItem("bmd-last-light") || "paper"; } catch (e) { /* private mode */ }
      setPaper(last);
      }
      setTheme("light");
    } else {
      setTheme("dark");
    }
  }

  const swatchWrap = $("#paperSwatches");
  PAPERS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.setAttribute("data-paper", p.id);
    b.title = p.name;
    b.innerHTML = '<span class="swatch-paper" aria-hidden="true"></span><span class="swatch-name">' + escapeHTML(p.name) + "</span>";
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      setPaper(p.id);
    });
    swatchWrap.appendChild(b);
  });

  /* ---------------- preferences ---------------- */

  const PREF_KEY = "bmd-prefs";
  const DEFAULT_PREFS = { typeface: "serif", size: "m", measure: "medium", leading: "cozy", dropcap: true, justify: false, toc: true, dochead: true, ornaments: true };
  let prefs = { ...DEFAULT_PREFS };
  try {
    prefs = { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) };
  } catch (e) { /* keep defaults */ }

  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ }
  }

  const SIZE_MAP = { s: "1.0625rem", m: "1.1875rem", l: "1.3125rem" };
  const MEASURE_MAP = { narrow: "60ch", medium: "72ch", wide: "84ch" };
  const LEADING_MAP = { compact: "1.62", cozy: "1.78", airy: "1.95" };

  function applyPrefs() {
    try { root.classList.toggle('local-fonts', localStorage.getItem('bmd-local-fonts') === 'true'); } catch (_) { /* storage unavailable */ }
    const size = SIZE_MAP[prefs.size] || SIZE_MAP.m;
    const leading = LEADING_MAP[prefs.leading] || LEADING_MAP.cozy;
    root.style.setProperty("--article-size", size);
    root.style.setProperty("--article-measure", MEASURE_MAP[prefs.measure] || MEASURE_MAP.medium);
    root.style.setProperty("--article-leading", leading);
    root.style.setProperty("--rule-period", (parseFloat(size) * parseFloat(leading)).toFixed(5) + "rem");
    body.classList.toggle("typeface-sans", prefs.typeface === "sans");
    const fonts = { serif: 'var(--serif-body)', sans: 'var(--sans-body)', georgia: 'Georgia, serif', palatino: '"Palatino Linotype", Palatino, "Book Antiqua", serif', verdana: 'Verdana, Geneva, sans-serif', mono: 'var(--mono)' };
    root.style.setProperty("--reading-font", fonts[prefs.typeface] || fonts.serif);
    root.style.setProperty("--heading-font", prefs.typeface === "serif" ? 'var(--serif-display)' : (fonts[prefs.typeface] || fonts.serif));
    body.classList.toggle("no-dochead", !prefs.dochead);
    body.classList.toggle("no-ornaments", !prefs.ornaments);
    body.classList.toggle("justify-text", !!prefs.justify);
    body.classList.toggle("no-dropcap", !prefs.dropcap);
    body.classList.toggle("toc-off", !prefs.toc);
    body.classList.toggle("measure-narrow", prefs.measure === "narrow");
    body.classList.toggle("measure-wide", prefs.measure === "wide");
    syncSettingsUI();
    document.querySelectorAll('.article').forEach(target => target._bmdRefreshNotice?.());
    schedulePaperAlignment();
  }

  let alignmentFrame = 0;
  function schedulePaperAlignment() {
    cancelAnimationFrame(alignmentFrame);
    alignmentFrame = requestAnimationFrame(alignPaperBlocks);
  }

  function alignPaperBlocks() {
    const lined = ["ruled", "legal", "graph"].includes(root.getAttribute("data-paper"));
    const blocks = Array.from(article.children);
    blocks.forEach((block) => { block.style.paddingBottom = ""; });
    if (!lined || !blocks.length || reader.classList.contains("is-hidden")) return;
    const period = parseFloat(getComputedStyle(article).lineHeight);
    if (!Number.isFinite(period) || period <= 0) return;
    blocks.forEach((block) => {
      const height = block.getBoundingClientRect().height;
      const remainder = height % period;
      if (remainder > 0.02 && period - remainder > 0.02) {
        block.style.paddingBottom = (period - remainder).toFixed(3) + "px";
      }
    });
  }

  function syncSettingsUI() {
    document.querySelectorAll(".seg").forEach((seg) => {
      const key = seg.getAttribute("data-pref");
      const current = String(prefs[key]);
      seg.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("active", b.value === current);
      });
    });
    document.querySelectorAll(".swatch").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-paper") === root.getAttribute("data-paper"));
    });
    $("#prefDropcap").checked = !!prefs.dropcap;
    $("#prefJustify").checked = !!prefs.justify;
    $("#prefToc").checked = !!prefs.toc;
    $("#prefDochead").checked = !!prefs.dochead;
    $("#prefOrnaments").checked = !!prefs.ornaments;
    $("#prefTypeface").value = prefs.typeface;
  }

  let paperId = null;
  try { paperId = localStorage.getItem("bmd-paper"); } catch (e) { paperId = null; }
  if (!paperId) {
    let legacy = null;
    try { legacy = localStorage.getItem("bmd-theme"); } catch (e) { legacy = null; }
    paperId = legacy === "dark" ? "night" : "paper";
  }
  let mode = null;
  try { mode = localStorage.getItem("bmd-mode"); } catch (e) { mode = null; }
  setTheme(mode === "dark" || (!mode && paperId === "night") ? "dark" : "light");
  setPaper(paperId);

  themeToggle.addEventListener("click", toggleTheme);

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  /* Surface unexpected failures on devices where there is no console */
  window.addEventListener("error", (e) => {
    if (e && e.message) toast("Error: " + e.message);
  });

  /* ---------------- helpers ---------------- */

  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  }

  const COPY_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  const CHECK_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  /* ---------------- analytics ---------------- */

  function trackRender(origin) {
    if (!window.posthog || !posthog.capture) return;
    try {
      posthog.capture("document_rendered", { origin: origin });
    } catch (e) { /* analytics must never break reading */ }
  }

  /* ---------------- session restore ---------------- */

  /* Mobile browsers discard tabs freely and reload them to a blank slate.
     Keeping the document in sessionStorage means a reload puts the reader
     back exactly where it was — and `editing` brings back an unfinished
     edit rather than the last rendered version of it. */
  function saveSession(source, fileName, editing) {
    try {
      sessionStorage.setItem("bmd-doc", JSON.stringify({
        source: source, fileName: fileName, editing: !!editing
      }));
    } catch (e) { /* private mode */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem("bmd-doc"); } catch (e) { /* private mode */ }
  }

  /* ---------------- markdown pipeline ---------------- */

  if (window.marked) {
    marked.setOptions({ gfm: true, breaks: false });
  }

  function toHTML(source) {
    if (window.marked) {
      try {
        return window.bmdSanitizeHTML(marked.parse(source));
      } catch (e) {
        return "<pre><code>" + escapeHTML(source) + "</code></pre>";
      }
    }
    return "<pre><code>" + escapeHTML(source) + "</code></pre>";
  }

  function displayNotices(target) {
    target.dataset.conversionWarnings = JSON.stringify(window.bmdSanitizeHTML.warnings || []);
    window.bmdTypography.decorate(target);
    function refresh() {
      target.querySelector('.render-notice')?.remove();
      const warnings = JSON.parse(target.dataset.conversionWarnings || '[]').concat(window.bmdTypography.fontWarnings(target));
      if (!warnings.length) return;
      const notice = document.createElement('aside');
      notice.className = 'render-notice'; notice.setAttribute('role', 'status');
      notice.textContent = warnings.join(' ');
      target.prepend(notice);
    }
    target._bmdRefreshNotice = refresh;
    refresh();
    if (document.fonts) document.fonts.ready.then(() => { if (target.isConnected) refresh(); });
  }

  function renderMarkdown(source, fileName, origin) {
    if (root.dataset.exporting === 'true') return;
    window.bmdImages.release(article);
    currentFileName = fileName || "document";
    currentSource = source;
    saveSession(source, fileName, false);

    article.innerHTML = toHTML(source);
    window.bmdImages.hydrate(article).then(schedulePaperAlignment);

    let glitch = null;
    const safely = (step) => {
      try { step(); } catch (err) { glitch = glitch || err; }
    };
    safely(() => sanitizeEmbeds(article));
    safely(() => decorateHeadings(article));
    safely(() => decorateCode(article));
    safely(() => wrapTables(article));
    safely(() => polishLinks(article));
    safely(() => insertDocHead(fileName));
    safely(() => addDropCap(article));
    safely(() => displayNotices(article));
    safely(buildToc);
    safely(() => setTitle(source));
    if (glitch) {
      toast("Rendered with a glitch: " + (glitch && glitch.message ? glitch.message : "unknown"));
    }

    reader.classList.remove("is-hidden");
    landing.classList.add("is-hidden");
    newDocBtn.classList.remove("is-hidden");
    editBtn.classList.remove("is-hidden");
    exportBtn.classList.remove("is-hidden");
    body.classList.add("reading");
    window.bmdCharts.render(article).then(schedulePaperAlignment);
    schedulePaperAlignment();
    article.querySelectorAll("img").forEach((img) => img.addEventListener("load", schedulePaperAlignment, { once: true }));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedulePaperAlignment);

    const prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    document.documentElement.style.scrollBehavior = prevBehavior;

    updateProgress();
    updateActiveToc();
    trackRender(origin || "unknown");
  }

  /* The editor's preview runs the same pipeline into a different container,
     minus the byline, the contents and the session write — so the two views
     can never drift apart. */
  function renderPreview(source, target) {
    if (root.dataset.exporting === 'true') return;
    window.bmdImages.release(target);
    target.innerHTML = toHTML(source);
    window.bmdImages.hydrate(target);
    const safely = (step) => { try { step(); } catch (err) { /* keep the rest */ } };
    safely(() => sanitizeEmbeds(target));
    safely(() => decorateHeadings(target));
    safely(() => decorateCode(target));
    safely(() => wrapTables(target));
    safely(() => polishLinks(target));
    safely(() => addDropCap(target));
    safely(() => displayNotices(target));
    /* Anchors would collide with the reader's ids and hijack the URL */
    target.querySelectorAll(".anchor").forEach((a) => a.remove());
    target.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  }

  function setTitle(source) {
    const m = source.match(/^\s*#\s+(.+)$/m);
    document.title = m ? m[1].trim() + " — Beautiful MD" : "Beautiful MD";
  }

  /* Copy-pasted or shared markdown can carry raw HTML; keep it inert */
  function sanitizeEmbeds(container = article) {
    container.querySelectorAll("script, iframe, object, embed, link, meta").forEach((el) => el.remove());
  }

  /* First meaningful paragraph gets a drop cap */
  function addDropCap(container = article) {
    const nodes = container.children;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.tagName === "H1" || el.classList.contains("article-head")) continue;
      if (el.tagName === "P" && el.textContent.trim().length > 40) {
        el.classList.add("dropcap");
      }
      break;
    }
  }

  /* Heading ids + hover anchors */
  function decorateHeadings(container = article) {
    const used = new Set();
    container.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
      let id = slugify(h.textContent);
      let n = 2;
      while (used.has(id)) id = slugify(h.textContent) + "-" + n++;
      used.add(id);
      h.id = id;

      const anchor = document.createElement("a");
      anchor.className = "anchor";
      anchor.href = "#" + id;
      anchor.textContent = "#";
      anchor.setAttribute("aria-label", "Link to this section");
      h.appendChild(anchor);
    });
  }

  /* Code blocks: highlight, wrap in an inked card with a bar */
  function decorateCode(container = article) {
    container.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      let lang = "";
      if (code) {
        const m = code.className.match(/language-([\w+#-]+)/);
        lang = m ? m[1] : "";
        if (window.hljs && !["mermaid", "chart", "chartjs"].includes(lang)) {
          try { hljs.highlightElement(code); } catch (e) { /* leave plain */ }
        }
      }

      const figure = document.createElement("figure");
      figure.className = "code-block";

      const bar = document.createElement("figcaption");
      bar.className = "code-bar";

      const label = document.createElement("span");
      label.className = "code-lang";
      label.textContent = lang || "text";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.innerHTML = COPY_ICON + "<span>Copy</span>";
      btn.addEventListener("click", () => {
        copyText(code ? code.innerText : pre.innerText).then(() => {
          btn.classList.add("copied");
          btn.innerHTML = CHECK_ICON + "<span>Copied</span>";
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = COPY_ICON + "<span>Copy</span>";
          }, 1600);
        }).catch(() => toast("Copy failed"));
      });

      bar.append(label, btn);
      pre.replaceWith(figure);
      figure.append(bar, pre);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy") ? resolve() : reject();
      } catch (e) {
        reject(e);
      } finally {
        ta.remove();
      }
    });
  }

  /* External links open safely */
  function polishLinks(container = article) {
    container.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
  }

  /* Tables scroll horizontally on narrow screens */
  function wrapTables(container = article) {
    container.querySelectorAll("table").forEach((t) => {
      if (t.parentElement && t.parentElement.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
  }

  /* Byline strip above the document */
  function insertDocHead(fileName) {
    const clone = article.cloneNode(true);
    clone.querySelectorAll(".anchor").forEach((a) => a.remove());
    const words = (clone.textContent.trim().match(/\S+/g) || []).length;
    const minutes = Math.max(1, Math.ceil(words / 210));

    const head = document.createElement("header");
    head.className = "article-head";

    const meta = document.createElement("p");
    meta.className = "article-meta";
    const sep = '<span class="meta-sep">' + FLEURON + "</span>";
    meta.innerHTML =
      '<span class="meta-file">' + escapeHTML(fileName) + "</span>" +
      sep + "<span>" + words.toLocaleString() + " words</span>" +
      sep + "<span>" + minutes + " min read</span>";

    const rule = document.createElement("div");
    rule.className = "article-rule";
    rule.innerHTML = '<span class="colophon-mark" aria-hidden="true">' + FLEURON + "</span>";

    head.append(meta, rule);
    article.prepend(head);
  }

  /* ---------------- table of contents ---------------- */

  let tocHeadings = [];
  let activeTocIndex = -1;

  function buildToc() {
    tocNav.innerHTML = "";
    tocHeadings = [];
    activeTocIndex = -1;

    let headings = Array.from(article.querySelectorAll("h2, h3"))
      .filter((h) => !h.closest("blockquote"));
    if (!headings.length) headings = Array.from(article.querySelectorAll("h1"));

    headings.forEach((h) => {
      const link = document.createElement("a");
      link.className = "toc-link lvl-" + h.tagName[1];
      link.href = "#" + h.id;
      link.textContent = h.firstChild ? h.firstChild.textContent : h.textContent;
      link.addEventListener("click", () => {
        const i = tocHeadings.findIndex((t) => t.link === link);
        setActiveToc(i);
        if (matchMedia("(max-width: 1000px)").matches) {
          tocAside.classList.remove("open");
          tocTitle.setAttribute("aria-expanded", "false");
        }
      });
      tocNav.appendChild(link);
      tocHeadings.push({ el: h, link });
    });

    tocAside.classList.toggle("is-hidden", !tocHeadings.length);
    body.classList.toggle("toc-empty", !tocHeadings.length);
    updateActiveToc();
  }

  /* The last heading that has crossed the reading line is the active one —
     recomputed on every scroll frame so the outline can never drift. */
  function updateActiveToc() {
    if (!tocHeadings.length) return;
    const threshold = Math.max(120, window.innerHeight * 0.16);
    let index = -1;
    for (let i = 0; i < tocHeadings.length; i++) {
      if (tocHeadings[i].el.getBoundingClientRect().top <= threshold) index = i;
      else break;
    }
    const doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
      index = tocHeadings.length - 1;
    }
    setActiveToc(index);
  }

  function setActiveToc(index) {
    if (index === activeTocIndex) return;
    activeTocIndex = index;
    tocHeadings.forEach((t) => t.link.classList.remove("active"));
    if (index < 0) return;
    const link = tocHeadings[index].link;
    link.classList.add("active");
    scrollTocIntoView(link);
  }

  function scrollTocIntoView(link) {
    const top = link.offsetTop;
    const bottom = top + link.offsetHeight;
    const viewTop = tocNav.scrollTop;
    const viewBottom = viewTop + tocNav.clientHeight;
    if (top < viewTop + 4) {
      tocNav.scrollTop = top - 4;
    } else if (bottom > viewBottom - 4) {
      tocNav.scrollTop = bottom - tocNav.clientHeight + 4;
    }
  }

  /* On mobile the contents card is collapsed; the title row toggles it */
  tocTitle.addEventListener("click", () => {
    const open = tocAside.classList.toggle("open");
    tocTitle.setAttribute("aria-expanded", String(open));
  });

  /* ---------------- progress bar ---------------- */

  let ticking = false;
  function updateProgress() {
    if (!body.classList.contains("reading")) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progressBar.style.transform = "scaleX(" + p + ")";
  }

  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateProgress();
      updateActiveToc();
      ticking = false;
    });
  }, { passive: true });

  window.addEventListener("resize", () => {
    updateProgress();
    updateActiveToc();
    schedulePaperAlignment();
  });

  /* ---------------- view switching ---------------- */

  function showLanding() {
    if (window.bmdEditor && window.bmdEditor.isOpen()) window.bmdEditor.close();
    reader.classList.add("is-hidden");
    landing.classList.remove("is-hidden");
    newDocBtn.classList.add("is-hidden");
    editBtn.classList.add("is-hidden");
    exportBtn.classList.add("is-hidden");
    body.classList.remove("reading");
    window.bmdImages.release(article);
    article.innerHTML = "";
    currentSource = "";
    currentFileName = "document";
    tocNav.innerHTML = "";
    tocHeadings = [];
    activeTocIndex = -1;
    body.classList.remove("toc-empty");
    clearSession();
    document.title = "Beautiful MD";
  }

  brandLink.addEventListener("click", (e) => {
    e.preventDefault();
    showLanding();
  });

  newDocBtn.addEventListener("click", showLanding);

  /* ---------------- document export ---------------- */

  function openExportDialog() {
    resetExportUI();
    if (typeof exportDialog.showModal === "function") exportDialog.showModal();
    else exportDialog.setAttribute("open", "");
  }

  function closeExportDialog() {
    if (exporting) return;
    if (typeof exportDialog.close === "function") exportDialog.close();
    else exportDialog.removeAttribute("open");
    resetExportUI();
  }

  exportBtn.addEventListener("click", openExportDialog);
  exportClose.addEventListener("click", closeExportDialog);
  exportDialog.addEventListener("click", (e) => {
    if (e.target === exportDialog) closeExportDialog();
  });
  exportDialog.addEventListener("close", resetExportUI);

  function exportName(extension, fileName = currentFileName) {
    const stem = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
    return stem + "." + extension;
  }

  let deliveredUrl = null;
  let previewUrl = null;
  function previewOutput(blob, caption) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $('#exportPreviewImage').src = previewUrl;
    $('#exportPreviewCaption').textContent = caption;
    $('#exportPreview').hidden = false;
  }

  function setExportStatus(text) {
    if (!text) {
      exportStatus.hidden = true;
      exportStatus.textContent = "";
      return;
    }
    exportStatus.hidden = false;
    exportStatus.textContent = text;
  }

  function resetExportUI() {
    $('#exportPreview').hidden = true;
    $('#exportPreviewImage').removeAttribute('src');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    setExportStatus("");
    exportSaveLink.hidden = true;
    exportSaveLink.removeAttribute("href");
    if (deliveredUrl) {
      /* A download triggered a moment ago may still be reading the blob,
         so let the URL go stale rather than pulling it out from under it. */
      const stale = deliveredUrl;
      setTimeout(() => URL.revokeObjectURL(stale), 60000);
      deliveredUrl = null;
    }
  }

  /* Object URLs, never data URLs: phone browsers refuse multi-megabyte
     `data:` downloads outright. And because the click happens several awaits
     after the tap, the gesture that authorised it is gone — so the finished
     file is also parked on a visible link the reader can tap to save it. */
  function deliverFile(blob, name) {
    if (deliveredUrl) {
      const stale = deliveredUrl;
      setTimeout(() => URL.revokeObjectURL(stale), 60000);
    }
    deliveredUrl = URL.createObjectURL(blob);
    exportSaveLink.href = deliveredUrl;
    exportSaveLink.download = name;
    exportSaveLink.textContent = "Save " + name;
    exportSaveLink.hidden = false;

    const link = document.createElement("a");
    link.href = deliveredUrl;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    try { link.click(); } catch (e) { /* the visible link is the fallback */ }
    link.remove();
  }

  function releaseTiles(capture) {
    capture.tiles.forEach((tile) => {
      tile.blob = null;
    });
  }
  async function decodeTile(tile, signal) {
    const url = URL.createObjectURL(tile.blob);
    const image = new Image(); image.src = url;
    try { await window.bmdTasks.wait(image.decode(), signal); return { image, release: () => { image.src = ''; URL.revokeObjectURL(url); } }; }
    catch (error) { URL.revokeObjectURL(url); throw error; }
  }

  let exporting = false;
  let activeExport = null;
  const cancelExport = () => activeExport?.abort(new Error('Export cancelled.'));
  $('#exportCancel').addEventListener('click', cancelExport);
  exportDialog.addEventListener('cancel', event => { if (exporting) { event.preventDefault(); cancelExport(); } });
  // Keep the document and typography stable until all asynchronous work ends.
  ['click', 'keydown', 'paste', 'drop', 'change'].forEach(type => document.addEventListener(type, event => {
    if (!exporting) return;
    if (!exportDialog.contains(event.target) || type === 'paste' || type === 'drop') {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true));

  async function runExport(kind) {
    if (exporting) return;
    const printWindow = kind === 'print' ? window.open('', '_blank') : null;
    resetExportUI();
    exporting = true;
    const controller = new AbortController(); activeExport = controller;
    const signal = controller.signal;
    const deadline = setTimeout(() => controller.abort(new Error('Export exceeded two minutes. Try a smaller document.')), 120000);
    const wait = promise => window.bmdTasks.wait(promise, signal);
    const checkpoint = () => window.bmdTasks.check(signal);
    $('#exportCancel').hidden = false;
    exportClose.disabled = true;
    exportDialog.setAttribute('aria-busy', 'true');
    root.dataset.exporting = 'true';
    const fileName = currentFileName;
    const source = currentSource;
    const exportButtons = [downloadPdfBtn, downloadImageBtn, downloadMdBtn, $('#downloadTextPdfBtn'), $('#downloadHtmlBtn')];
    exportButtons.forEach((b) => { b.disabled = true; });
    exportSaveLink.hidden = true;
    setExportStatus("Preparing…");

    let capture = null;
    try {
      if (kind === 'print' || kind === 'html') {
        if (kind === 'print' && !printWindow) throw new Error('Allow popups to open the print dialog, or download accessible HTML instead.');
        const html = await window.bmdPrint.prepare(article, { signal }); checkpoint();
        if (kind === 'html') deliverFile(new Blob([html], { type: 'text/html;charset=utf-8' }), exportName('html', fileName));
        else {
          printWindow.document.open();
          const printLoaded = new Promise(resolve => { printWindow.onload = resolve; });
          printWindow.document.write(html); printWindow.document.close(); printWindow.opener = null;
          await wait(printLoaded);
          await wait(printWindow.document.fonts.ready); checkpoint(); printWindow.focus(); printWindow.print();
        }
        setExportStatus(kind === 'print' ? 'Choose Save as PDF in the print dialog. Text remains searchable; PDF tagging depends on your browser. Use the verified tagged-PDF command for a tagged file.' : 'Accessible HTML is ready to save.');
        return;
      }
      if (kind === "md") {
        deliverFile(new Blob([source], { type: "text/markdown;charset=utf-8" }), exportName("md", fileName));
        setExportStatus("Ready — tap below if the download did not start.");
        return;
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));
      capture = await window.bmdExport(article, setExportStatus, { signal });
      checkpoint();

      if (kind === "image") {
        previewOutput(capture.tiles[0].blob, capture.tiles.length > 1 ? 'First exported image — the ZIP contains all numbered images.' : 'Exported image');
        if (capture.tiles.length === 1) {
          setExportStatus("Encoding the image…");
          const blob = capture.tiles[0].blob;
          if (!blob) throw new Error("Could not encode image");
          deliverFile(blob, exportName("png", fileName));
        } else {
          if (!window.JSZip) throw new Error("Image packager is unavailable");
          const zip = new window.JSZip();
          const stem = exportName("png", fileName).replace(/\.png$/, "");
          for (let i = 0; i < capture.tiles.length; i++) {
            setExportStatus("Encoding image " + (i + 1) + " of " + capture.tiles.length + "…");
            const blob = capture.tiles[i].blob;
            if (!blob) throw new Error("Could not encode image");
            zip.file(stem + "-" + String(i + 1).padStart(2, "0") + ".png", blob);
          }
          setExportStatus("Packing the archive…");
          const packed = await wait(zip.generateAsync({ type: "blob" }));
          checkpoint(); deliverFile(packed, exportName("zip", fileName));
        }
      } else {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("PDF exporter is unavailable");
        const pdf = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
        const pageWidth = 186;

        let offset = 0;
        let page = 0;
        while (offset < capture.height) {
          checkpoint();
          setExportStatus("Building PDF page " + (page + 1) + " of " + capture.pages.length + "…");
          const height = capture.pages[page].height;
          const slice = document.createElement("canvas");
          slice.width = capture.width;
          slice.height = height;
          try {
          const context = slice.getContext("2d");
          if (!context) throw new Error('Not enough drawing memory for a PDF page.');
          for (const tile of capture.tiles) {
            const top = Math.max(offset, tile.start);
            const bottom = Math.min(offset + height, tile.start + tile.height);
            if (bottom > top) {
              const decoded = await decodeTile(tile, signal);
              try { context.drawImage(decoded.image, 0, top - tile.start, capture.width, bottom - top, 0, top - offset, capture.width, bottom - top); }
              finally { decoded.release(); }
            }
          }
          if (page++) pdf.addPage();
          pdf.setFillColor(capture.color);
          pdf.rect(0, 0, 210, 297, "F");
          pdf.addImage(slice.toDataURL("image/png"), "PNG", 12, 12, pageWidth, height * pageWidth / capture.width, undefined, "FAST");
          if (page === 1) {
            const preview = await wait(new Promise(resolve => slice.toBlob(resolve, 'image/png')));
            if (preview) previewOutput(preview, 'First PDF page — review the downloaded PDF for all pages.');
          }
          /* Phones hold every canvas in a limited pool — let each page go */
          } finally { slice.width = 0; slice.height = 0; }
          offset += height;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        setExportStatus("Writing the file…");
        checkpoint(); deliverFile(pdf.output("blob"), exportName("pdf", fileName));
      }
      setExportStatus("Ready — tap below if the download did not start.");
    } catch (err) {
      if (printWindow && !printWindow.closed) printWindow.close();
      const message = err && err.message ? err.message : "unknown error";
      setExportStatus("Could not export: " + message);
      toast("Could not export: " + message);
    } finally {
      clearTimeout(deadline); activeExport = null;
      $('#exportCancel').hidden = true;
      if (capture) releaseTiles(capture);
      exporting = false;
      exportClose.disabled = false;
      exportDialog.removeAttribute('aria-busy');
      delete root.dataset.exporting;
      exportButtons.forEach((b) => { b.disabled = false; });
    }
  }

  downloadPdfBtn.addEventListener("click", () => runExport("pdf"));
  downloadImageBtn.addEventListener("click", () => runExport("image"));
  downloadMdBtn.addEventListener("click", () => runExport("md"));
  $('#downloadTextPdfBtn').addEventListener('click', () => runExport('print'));
  $('#downloadHtmlBtn').addEventListener('click', () => runExport('html'));

  /* ---------------- file handling ---------------- */

  fileDropTarget.addEventListener("click", () => fileInput.click());
  fileDropTarget.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (evt === "drop" || e.target === dropzone) dropzone.classList.remove("dragging");
    });
  });
  dropzone.addEventListener("drop", handleDrop);

  /* Files dropped anywhere on the page work too — and so does raw text
     dragged from another app. */
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt && dt.files && dt.files[0];
    if (file) {
      readFile(file);
      return;
    }
    const text = dt ? dt.getData("text/plain") : "";
    if (text && text.trim()) {
      renderMarkdown(text, "dropped text.md", "text-drop");
      toast("Set with care — dropped text");
    }
  }

  /* Keep the page from navigating when something misses the dropzone */
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (editorOpen() || settingsPanel.classList.contains("open")) return;
    handleDrop(e);
  });

  function readFile(file) {
    const looksLikeText = MD_EXT.test(file.name) || /^text\//.test(file.type) || file.type === "";
    if (!looksLikeText) {
      toast("Please choose a Markdown or plain-text file");
      return;
    }
    const reader_ = new FileReader();
    reader_.onload = () => {
      renderMarkdown(String(reader_.result), file.name, "file");
      toast("Set with care — " + file.name);
    };
    reader_.onerror = () => toast("Could not read that file");
    reader_.readAsText(file);
  }

  /* ---------------- editor ---------------- */

  function editorOpen() {
    return !!(window.bmdEditor && window.bmdEditor.isOpen());
  }

  if (window.bmdEditor) {
    window.bmdEditor.init({
      renderPreview: renderPreview,
      onDone: (source, fileName) => {
        try {
          renderMarkdown(source, fileName, "editor");
          toast("Set with care");
        } catch (err) {
          toast("Could not render: " + (err && err.message ? err.message : "unknown"));
        }
      },
      onCancel: () => {
        /* Nothing rendered yet means there is nothing to go back to */
        if (!currentSource.trim()) {
          showLanding();
          return;
        }
        saveSession(currentSource, currentFileName, false);
      },
      /* Auto-save: a backgrounded phone tab can be discarded mid-sentence */
      onChange: (source, fileName) => saveSession(source, fileName, true)
    });
  }

  editBtn.addEventListener("click", () => {
    if (!window.bmdEditor) {
      toast("The editor is unavailable");
      return;
    }
    window.bmdEditor.open(currentSource, currentFileName);
  });

  /* ---------------- settings drawer ---------------- */

  function openSettings() {
    settingsPanel.classList.add("open");
    settingsScrim.classList.add("open");
    body.classList.add("locked");
    settingsBtn.setAttribute("aria-expanded", "true");
  }

  function closeSettings() {
    settingsPanel.classList.remove("open");
    settingsScrim.classList.remove("open");
    body.classList.remove("locked");
    settingsBtn.setAttribute("aria-expanded", "false");
  }

  settingsBtn.addEventListener("click", () => {
    if (settingsPanel.classList.contains("open")) closeSettings();
    else openSettings();
  });
  settingsClose.addEventListener("click", closeSettings);
  settingsScrim.addEventListener("click", closeSettings);

  document.querySelectorAll(".seg").forEach((seg) => {
    seg.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      prefs[seg.getAttribute("data-pref")] = btn.value;
      savePrefs();
      applyPrefs();
    });
  });

  $("#prefTypeface").addEventListener("change", (e) => {
    prefs.typeface = e.target.value;
    savePrefs();
    applyPrefs();
  });

  [["prefDropcap", "dropcap"], ["prefJustify", "justify"], ["prefToc", "toc"], ["prefDochead", "dochead"], ["prefOrnaments", "ornaments"]].forEach(([id, key]) => {
    $("#" + id).addEventListener("change", (e) => {
      prefs[key] = e.target.checked;
      savePrefs();
      applyPrefs();
    });
  });

  $("#resetPrefs").addEventListener("click", () => {
    try { localStorage.removeItem('bmd-local-fonts'); } catch (_) { /* storage unavailable */ }
    prefs = { ...DEFAULT_PREFS };
    savePrefs();
    applyPrefs();
    toast("Typesetting reset");
  });

  applyPrefs();
  $('#prefLocalFonts').addEventListener('click', () => {
    try { localStorage.setItem('bmd-local-fonts', 'true'); } catch (_) { /* storage unavailable */ }
    prefs.typeface = 'georgia'; savePrefs(); applyPrefs();
    root.classList.add('local-fonts');
    document.querySelectorAll('.article').forEach(target => target._bmdRefreshNotice?.());
    toast('Using installed fonts for reading, headings, and code.');
  });

  /* Initial render: a shareable #md= link wins, then the last session.
     #paper=<id> pins a paper stock for the visit. */
  (function initialRender() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const paperParam = hash.get("paper");
    if (paperParam) setPaper(paperParam);
    const mdParam = window.bmdWorkspaceSource || hash.get("md");
    delete window.bmdWorkspaceSource;
    if (mdParam && mdParam.trim()) {
      try {
        renderMarkdown(mdParam, "shared.md", "share-link");
        return;
      } catch (e) { /* fall through to session restore */ }
    }
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("bmd-doc")); } catch (e) { saved = null; }
    if (saved && saved.source && String(saved.source).trim()) {
      renderMarkdown(saved.source, saved.fileName || "restored.md", "session-restore");
      /* The tab was discarded mid-edit — come back to the editor, not the
         reader, so nothing typed on a phone is quietly lost. */
      if (saved.editing && window.bmdEditor) {
        const name = saved.fileName || "restored.md";
        window.bmdEditor.open(saved.source, name);
        /* renderMarkdown above cleared the flag; a second discard should
           still come back here, even if nothing new was typed. */
        saveSession(saved.source, name, true);
      }
    }
  })();

  /* ---------------- paste anywhere ---------------- */

  /* Opens empty on purpose: you write or paste into the editor yourself */
  clipboardBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!window.bmdEditor) {
      toast("The editor is unavailable");
      return;
    }
    window.bmdEditor.open("", "untitled.md");
  });

  /* Ctrl+V on the page itself renders the clipboard as markdown —
     no dialog, no file needed. */
  document.addEventListener("paste", (e) => {
    if (editorOpen()) return;
    if (e.target.matches("input, textarea")) return;
    const text = e.clipboardData && e.clipboardData.getData("text/plain");
    if (text && text.trim()) {
      e.preventDefault();
      renderMarkdown(text, "pasted markdown.md", "keyboard-paste");
      toast("Set with care — pasted markdown");
    }
  });

  /* ---------------- keyboard niceties ---------------- */

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea") || editorOpen()) return;
    if (e.key === "Escape" && settingsPanel.classList.contains("open")) {
      closeSettings();
      return;
    }
    if (e.key === "t" || e.key === "T") {
      toggleTheme();
    }
  });

  /* ---------------- sample document ---------------- */

  $("#chartExampleBtn").addEventListener("click", () => renderMarkdown([
    "# Charts & diagrams", "",
    "Use a mermaid code fence for diagrams, or a chart / chartjs code fence containing a Chart.js JSON configuration for data charts. Your charts follow the selected paper and appear in PDF and image downloads.", "",
    "## A simple workflow", "", "```mermaid", "flowchart LR", "  Draft --> Review --> Publish", "```", "",
    "## Monthly readers", "", "```chart",
    JSON.stringify({ type: "bar", data: { labels: ["Jan", "Feb", "Mar"], datasets: [{ label: "Readers", data: [120, 190, 260], backgroundColor: "#397b96" }] } }, null, 2),
    "```", "", "## Write your own", "",
    "Mermaid supports flowcharts, sequence diagrams, pie charts, and more. Data charts support bar, line, pie, doughnut, radar, polarArea, scatter, and bubble types. Use JSON values for data charts; JavaScript callbacks are not supported.", "",
    "A chart fence looks like this:", "", "````markdown", "```chart",
    '{"type":"line","data":{"labels":["Jan","Feb"],"datasets":[{"label":"Readers","data":[120,190]}]}}',
    "```", "````"
  ].join("\n"), "charts-example.md", "example"));

  const SAMPLE_IMAGE = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='840'%20height='300'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20y1='0'%20x2='1'%20y2='1'%3E%3Cstop%20offset='0'%20stop-color='%23a13a22'/%3E%3Cstop%20offset='1'%20stop-color='%233f2a1a'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='840'%20height='300'%20fill='url(%23g)'/%3E%3Ctext%20x='420'%20y='168'%20font-family='Georgia,serif'%20font-style='italic'%20font-size='42'%20fill='%23f7f2e7'%20text-anchor='middle'%3EThe%20Reading%20Room%3C/text%3E%3C/svg%3E";

  const SAMPLE = [
    "# The Reading Room",
    "",
    "Welcome to *Beautiful MD*. This sample document exercises everything the typesetter knows how to set: **bold arguments**, `inline code`, [quiet links](https://example.com), ~~struck-through doubts~~, and the occasional — very occasional — em dash.",
    "",
    "Everything you see is rendered in your browser. Nothing was uploaded, nothing was logged. It is simply markdown, given a good suit of clothes.",
    "",
    "## How it works",
    "",
    "The renderer walks your markdown and sets it like a fine publication. Headings receive anchors, the opening paragraph receives a **drop cap**, and every code fence is set on an inked card with its language in the margin.",
    "",
    "### A few of the details",
    "",
    "- Serif body text with optical sizing, set to a comfortable measure",
    "- Small caps for labels, fleurons for rules",
    "- A sticky table of contents that follows your place",
    "- A reading progress bar, for the long haul",
    "",
    "### And a task list, because everyone has tasks",
    "",
    "- [x] Choose a typeface worth reading",
    "- [x] Set headings with intent",
    "- [ ] Convince everyone that Comic Sans is a lifestyle, not a choice",
    "",
    "## Code, set properly",
    "",
    "Syntax highlighting ships with a warm, muted palette that belongs to the page — no neon, no arcade.",
    "",
    "```javascript",
    "// A tiny typesetter's helper",
    "function setBeautifully(markdown) {",
    "  const html = marked.parse(markdown);",
    "  return withFleurons(withDropCaps(html));",
    "}",
    "```",
    "",
    "```python",
    "def reading_time(words: int, wpm: int = 210) -> int:",
    '    """A courteous estimate."""',
    "    return max(1, round(words / wpm))",
    "```",
    "",
    "```bash",
    "# Serve the reading room locally",
    "python -m http.server 8080",
    "```",
    "",
    "## A table, of course",
    "",
    "Every good document has one. This one compares the two themes.",
    "",
    "| Theme | Paper | Ink | Best for |",
    "| --- | --- | --- | --- |",
    "| Paper & Ink | warm cream | near-black | daylight reading |",
    "| Night Ink | deep charcoal | bone white | late-night drafts |",
    "",
    "## Quotations",
    "",
    "> Typography is what language looks like.",
    ">",
    "> — *Ellen Lupton*",
    "",
    "Pull quotes keep their manners: an accent rule on the left, italics in the middle, no shouting.",
    "",
    "![A quiet cover](" + SAMPLE_IMAGE + ")",
    "",
    "---",
    "",
    "## Try your own",
    "",
    "Press **← New document** in the masthead, drop a `.md` file onto the page, or press **Edit** to write markdown yourself. The <kbd>T</kbd> key toggles night ink.",
    "",
    "That is the whole arrangement: *your words, set beautifully*.",
    "",
    "❦"
  ].join("\n");
})();
