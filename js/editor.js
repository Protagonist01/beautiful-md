/* ============================================================
   Beautiful MD — editor
   A write/preview surface that shares the reader's render pipeline.
   Attaches one global, initialised by app.js.
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const editor = $("#editor");
  const area = $("#editorArea");
  const preview = $("#editorPreview");
  const tools = $(".editor-tools");
  const tabWrite = $("#editorTabWrite");
  const tabPreview = $("#editorTabPreview");
  const doneBtn = $("#editorDone");
  const cancelBtn = $("#editorCancel");

  const CHART_FENCE = /^[ \t]*(?:```|~~~)[ \t]*(mermaid|chartjs|chart)\b/mi;

  let hooks = { renderPreview: null, onDone: null, onCancel: null, onChange: null };
  let open = false;
  let fileName = "untitled.md";
  let opening = "";
  let previewTimer = 0;
  let chartTimer = 0;
  let changeTimer = 0;

  /* ---------------- open / close ---------------- */

  function openEditor(source, name) {
    fileName = name || "untitled.md";
    opening = source || "";
    area.value = opening;
    open = true;
    editor.classList.remove("is-hidden");
    document.body.classList.add("locked");
    showPane("write");
    renderPreview();
    /* A phone keyboard springing up during the opening paint fights the
       layout, so hold focus until the surface has settled. */
    requestAnimationFrame(() => {
      if (!open) return;
      area.focus();
      const end = area.value.length;
      try { area.setSelectionRange(end, end); } catch (e) { /* not focusable yet */ }
    });
  }

  function closeEditor() {
    open = false;
    clearTimeout(previewTimer);
    clearTimeout(chartTimer);
    clearTimeout(changeTimer);
    editor.classList.add("is-hidden");
    document.body.classList.remove("locked");
    preview.innerHTML = "";
  }

  function isDirty() {
    return area.value !== opening;
  }

  /* ---------------- panes ---------------- */

  function showPane(which) {
    const writing = which !== "preview";
    editor.classList.toggle("show-preview", !writing);
    tabWrite.classList.toggle("is-active", writing);
    tabPreview.classList.toggle("is-active", !writing);
    tabWrite.setAttribute("aria-selected", String(writing));
    tabPreview.setAttribute("aria-selected", String(!writing));
  }

  tabWrite.addEventListener("click", () => {
    showPane("write");
    area.focus();
  });
  tabPreview.addEventListener("click", () => showPane("preview"));

  /* ---------------- live preview ---------------- */

  function renderPreview() {
    if (!hooks.renderPreview) return;
    const source = area.value;
    try {
      hooks.renderPreview(source, preview);
    } catch (e) {
      preview.textContent = "Preview failed: " + (e && e.message ? e.message : "unknown");
      return;
    }
    /* Diagram renderers are heavy — only wake them for documents that
       actually contain a chart fence, and only once typing has paused. */
    clearTimeout(chartTimer);
    if (window.bmdCharts && CHART_FENCE.test(source)) {
      chartTimer = setTimeout(() => {
        if (open) window.bmdCharts.render(preview);
      }, 900);
    }
  }

  area.addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 250);
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      if (open && hooks.onChange) hooks.onChange(area.value, fileName);
    }, 400);
  });

  /* ---------------- text editing ---------------- */

  /* Route every edit through execCommand where it exists so the browser's own
     undo stack survives — on a phone that stack is the only undo there is. */
  function replaceSelection(text, selectStart, selectEnd) {
    const start = area.selectionStart;
    area.focus();
    let inserted = false;
    if (document.execCommand) {
      try { inserted = document.execCommand("insertText", false, text); } catch (e) { inserted = false; }
    }
    if (!inserted) {
      area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
    }
    if (typeof selectStart === "number") {
      const from = start + selectStart;
      const to = start + (typeof selectEnd === "number" ? selectEnd : selectStart);
      area.setSelectionRange(from, to);
    }
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wrap(marker, placeholder) {
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = area.value.slice(start, end);
    const before = area.value.slice(Math.max(0, start - marker.length), start);
    const after = area.value.slice(end, end + marker.length);

    if (before === marker && after === marker) {
      // Already wrapped — peel the markers off instead of stacking more.
      area.setSelectionRange(start - marker.length, end + marker.length);
      replaceSelection(selected, 0, selected.length);
      return;
    }
    const body = selected || placeholder;
    replaceSelection(marker + body + marker, marker.length, marker.length + body.length);
  }

  function lineRange() {
    const value = area.value;
    let start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
    let end = value.indexOf("\n", area.selectionEnd);
    if (end === -1) end = value.length;
    return { start, end };
  }

  /* Toggle a line marker across every selected line. `next` builds the marker
     for a line's index so ordered lists can count; `strip` is what the new
     marker replaces, so switching between list styles swaps rather than
     stacks. */
  function prefixLines(test, next, strip) {
    const span = lineRange();
    const lines = area.value.slice(span.start, span.end).split("\n");
    const allMarked = lines.every((line) => !line.trim() || test(line));
    const remove = strip || test.strip;
    const updated = lines.map((line, i) => {
      if (allMarked) return line.replace(test.strip, "");
      if (!line.trim() && lines.length > 1) return line;
      return next(i) + line.replace(remove, "");
    });
    area.setSelectionRange(span.start, span.end);
    const text = updated.join("\n");
    replaceSelection(text, 0, text.length);
  }

  function marker(pattern) {
    const test = (line) => pattern.test(line);
    test.strip = pattern;
    return test;
  }

  const HEADING = marker(/^#{1,6} /);
  const QUOTE = marker(/^> /);
  const BULLET = marker(/^[-*+] (?!\[[ xX]\] )/);
  const NUMBER = marker(/^\d+\. /);
  const TASK = marker(/^[-*+] \[[ xX]\] /);
  /* Any list marker, so one list style cleanly replaces another */
  const ANY_LIST = /^(?:[-*+] (?:\[[ xX]\] )?|\d+\. )/;

  function insertBlock(text, selectStart, selectEnd) {
    const value = area.value;
    const at = area.selectionStart;
    // Keep block elements on their own line with a blank line above.
    let lead = "";
    if (at > 0) lead = value[at - 1] === "\n" ? (value[at - 2] === "\n" || at === 1 ? "" : "\n") : "\n\n";
    replaceSelection(lead + text, lead.length + selectStart, lead.length + (selectEnd === undefined ? selectStart : selectEnd));
  }

  const ACTIONS = {
    bold: () => wrap("**", "bold text"),
    italic: () => wrap("*", "italic text"),
    strike: () => wrap("~~", "struck text"),
    code: () => wrap("`", "code"),
    heading: () => {
      // Cycle ## → ### → plain, so repeated taps step through the levels.
      const span = lineRange();
      const line = area.value.slice(span.start, span.end);
      const current = (line.match(/^(#{1,6}) /) || [])[1];
      const level = !current ? "## " : current.length >= 3 ? "" : "#".repeat(current.length + 1) + " ";
      const text = level + line.replace(HEADING.strip, "");
      area.setSelectionRange(span.start, span.end);
      replaceSelection(text, text.length, text.length);
    },
    quote: () => prefixLines(QUOTE, () => "> "),
    bullet: () => prefixLines(BULLET, () => "- ", ANY_LIST),
    number: () => prefixLines(NUMBER, (i) => (i + 1) + ". ", ANY_LIST),
    task: () => prefixLines(TASK, () => "- [ ] ", ANY_LIST),
    link: () => {
      const start = area.selectionStart;
      const end = area.selectionEnd;
      const selected = area.value.slice(start, end);
      if (/^(https?:\/\/|mailto:|www\.)\S*$/i.test(selected.trim())) {
        const url = selected.trim();
        replaceSelection("[](" + url + ")", 1, 1);
        return;
      }
      const label = selected || "link text";
      replaceSelection("[" + label + "](url)", label.length + 3, label.length + 6);
    },
    codeblock: () => {
      const selected = area.value.slice(area.selectionStart, area.selectionEnd);
      const body = selected || "code";
      insertBlock("```\n" + body + "\n```\n", 3, 3);
    },
    table: () => insertBlock(
      "| Column | Column |\n| --- | --- |\n| Cell | Cell |\n", 2, 8
    ),
    rule: () => insertBlock("---\n", 4, 4)
  };

  tools.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-md]");
    if (!btn) return;
    e.preventDefault();
    const run = ACTIONS[btn.getAttribute("data-md")];
    if (run) run();
  });

  /* Tapping a tool must not dismiss the phone keyboard mid-edit */
  tools.addEventListener("pointerdown", (e) => {
    if (e.target.closest("[data-md]")) e.preventDefault();
  });

  /* ---------------- keyboard ---------------- */

  area.addEventListener("keydown", (e) => {
    const chord = e.metaKey || e.ctrlKey;
    if (chord && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b") { e.preventDefault(); ACTIONS.bold(); return; }
      if (key === "i") { e.preventDefault(); ACTIONS.italic(); return; }
      if (key === "k") { e.preventDefault(); ACTIONS.link(); return; }
      if (key === "s") { e.preventDefault(); finish(); return; }
      if (key === "enter") { e.preventDefault(); finish(); return; }
    }
    if (e.key === "Tab" && !chord) {
      e.preventDefault();
      replaceSelection("  ");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    abandon();
  });

  /* ---------------- finish ---------------- */

  function finish() {
    const source = area.value;
    if (!source.trim()) {
      if (hooks.onCancel) hooks.onCancel();
      closeEditor();
      return;
    }
    closeEditor();
    if (hooks.onDone) hooks.onDone(source, fileName);
  }

  function abandon() {
    if (isDirty() && !window.confirm("Discard the changes you have made?")) return;
    closeEditor();
    if (hooks.onCancel) hooks.onCancel();
  }

  doneBtn.addEventListener("click", finish);
  cancelBtn.addEventListener("click", abandon);

  window.bmdEditor = {
    init(options) { hooks = { ...hooks, ...options }; },
    open: openEditor,
    close: closeEditor,
    isOpen() { return open; },
    fileName() { return fileName; },
    value() { return area.value; }
  };
})();
