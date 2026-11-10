/* Verification harness for the mobile + editor work.
   Run: node output/verify/verify.cjs <stage>
   Stages: overflow | download | editor | autosave | regress | all     */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "output", "verify");
const URL = "http://localhost:8099/index.html";
const FIX = (name) => fs.readFileSync(path.join(OUT, "fixtures", name), "utf8");

const PHONE = { width: 375, height: 812 };
const DESK = { width: 1440, height: 900 };

/* Runs in the page: every element in the reader that is wider than the viewport
   AND not held inside a box that scrolls or clips it. A wide table inside
   `.table-wrap { overflow-x: auto }` is working as designed; a wide anything
   else is the bug being hunted. */
const OFFENDERS = `(() => {
  const held = (n) => {
    for (let p = n.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  const out = [];
  document.querySelectorAll("#reader *").forEach((n) => {
    const w = n.getBoundingClientRect().width;
    if (w <= window.innerWidth + 1 || held(n)) return;
    out.push(n.tagName + (n.id ? "#" + n.id : "") +
      (n.className ? "." + String(n.className).split(" ")[0] : "") + "=" + Math.round(w));
  });
  return out.slice(0, 8);
})()`;

let failures = 0;
const ok = (label) => console.log("  PASS  " + label);
const bad = (label, detail) => { failures++; console.log("  FAIL  " + label + (detail ? " — " + detail : "")); };
function expect(cond, label, detail) { cond ? ok(label) : bad(label, detail); }

/* ---------- page helpers ---------- */

async function fresh(browser, viewport) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const offline = new Set();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("requestfailed", (r) => {
    try { offline.add(new URL(r.url()).host); } catch (e) { offline.add(r.url()); }
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    /* This machine has no route to fonts.googleapis.com or posthog; a failed
       third-party fetch is the environment, not the code under test. */
    if (/net::ERR_|Failed to load resource/.test(m.text())) return;
    errors.push("console: " + m.text());
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.bmdEditor && !!window.bmdExport);
  page.bmdErrors = errors;
  page.bmdOffline = offline;
  return { ctx, page, errors, offline };
}

/* Type a document through the editor and land in the reader. */
async function loadViaEditor(page, source) {
  if (await page.locator("#landing").isVisible()) {
    await page.locator("#clipboardBtn").click();
  } else {
    await page.locator("#editBtn").click();
  }
  await page.waitForSelector("#editor:not(.is-hidden)");
  await page.locator("#editorArea").fill(source);
  await page.locator("#editorDone").click();
  await page.waitForSelector("#editor", { state: "hidden" });
  await page.waitForSelector("#article .article-body, #article h1, #article p");
}

async function setPref(page, group, value) {
  await page.locator("#settingsBtn").click();
  await page.locator(`.seg[data-pref="${group}"] button[value="${value}"]`).click();
  await page.locator("#settingsClose").click();
  await page.waitForTimeout(150);
}

/* ---------- stages ---------- */

async function overflow(browser) {
  console.log("\n== 1. Overflow at 375x812 ==");
  const { ctx, page, errors } = await fresh(browser, PHONE);

  async function probe(label, source, expectTocEmpty) {
    await loadViaEditor(page, source);
    await page.waitForTimeout(250);
    const m = await page.evaluate((offenders) => {
      const art = document.querySelector("#article");
      const track = parseFloat(
        getComputedStyle(document.querySelector(".reader-shell")).gridTemplateColumns.split(" ").pop());
      return {
        docScroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
        artWidth: Math.round(art.getBoundingClientRect().width),
        artScroll: art.scrollWidth,
        artClient: art.clientWidth,
        track: Math.round(track),
        over: eval(offenders),
        tocEmpty: document.body.classList.contains("toc-empty"),
        wraps: [...document.querySelectorAll(".table-wrap")].map((w) => ({
          scroll: w.scrollWidth, client: w.clientWidth,
          overflowX: getComputedStyle(w).overflowX
        })),
        pre: [...document.querySelectorAll("#article pre")].map((p) => ({
          scroll: p.scrollWidth, client: p.clientWidth,
          overflowX: getComputedStyle(p).overflowX
        })),
        cols: getComputedStyle(document.querySelector(".reader-shell")).gridTemplateColumns
      };
    }, OFFENDERS);
    console.log("   " + label + ": inner=" + m.inner + " track=" + m.track +
      " article=" + m.artWidth + " cols=" + m.cols);
    expect(m.over.length === 0, label + " — nothing in the reader is wider than the viewport",
      m.over.join(" "));
    expect(m.artWidth <= m.track + 1, label + " — article fits its grid track",
      m.artWidth + " > " + m.track);
    expect(m.artScroll <= m.artClient + 1, label + " — article has no internal overflow",
      m.artScroll + " > " + m.artClient);
    if (expectTocEmpty !== undefined) {
      expect(m.tocEmpty === expectTocEmpty, label + " — toc-empty is " + expectTocEmpty);
    }
    for (const w of m.wraps) {
      expect(w.overflowX === "auto" || w.overflowX === "scroll",
        label + " — table scrolls on its own (" + w.overflowX + ")");
      expect(w.scroll > w.client, label + " — table is genuinely wider than its box",
        w.scroll + " vs " + w.client);
    }
    for (const p of m.pre) {
      expect(p.overflowX === "auto" || p.overflowX === "scroll" || p.scroll <= p.client + 1,
        label + " — code block is scrollable or fits (" + p.overflowX + ", " +
        p.scroll + "/" + p.client + ")");
    }
    return m;
  }

  await probe("contents on", FIX("overflow.md"));
  await page.screenshot({ path: path.join(OUT, "overflow-phone-toc-on.png"), fullPage: true });

  /* contents off */
  await page.locator("#settingsBtn").click();
  await page.locator("#prefToc").uncheck({ force: true });
  await page.locator("#settingsClose").click();
  await page.waitForTimeout(200);
  const off = await page.evaluate((offenders) => ({
    over: eval(offenders),
    inner: window.innerWidth,
    tocOff: document.body.classList.contains("toc-off"),
    cols: getComputedStyle(document.querySelector(".reader-shell")).gridTemplateColumns
  }), OFFENDERS);
  console.log("   contents off: inner=" + off.inner + " cols=" + off.cols);
  expect(off.tocOff, "contents off — body.toc-off applied");
  expect(off.over.length === 0, "contents off — nothing overflows the viewport", off.over.join(" "));
  await page.locator("#settingsBtn").click();
  await page.locator("#prefToc").check({ force: true });
  await page.locator("#settingsClose").click();

  await probe("no headings", FIX("no-headings.md"), true);
  await page.screenshot({ path: path.join(OUT, "overflow-phone-no-headings.png"), fullPage: true });

  /* wide measure is the worst case for the column */
  await setPref(page, "measure", "wide");
  await probe("no headings + wide measure", FIX("overflow.md"));
  await setPref(page, "measure", "medium");

  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function editor(browser) {
  console.log("\n== 3. Editor ==");
  const { ctx, page, errors } = await fresh(browser, PHONE);

  /* --- open from the landing --- */
  await page.locator("#clipboardBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  expect(await page.locator("#editor").isVisible(), "opens from the landing");
  expect(await page.evaluate(() => document.body.classList.contains("locked")),
    "body.locked stops background scroll");

  const fontSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector("#editorArea")).fontSize));
  expect(fontSize >= 16, "textarea font-size >= 16px (no iOS zoom)", fontSize + "px");

  /* --- live preview --- */
  await page.locator("#editorArea").fill("# Live\n\nSome **bold** words.");
  await page.waitForTimeout(500);
  const previewHtml = await page.locator("#editorPreview").innerHTML();
  expect(/<h1/.test(previewHtml) && /<strong>bold<\/strong>/.test(previewHtml),
    "live preview renders markdown", previewHtml.slice(0, 120));
  expect(!/class="anchor"/.test(previewHtml), "preview strips heading anchors");
  expect(!/\sid="/.test(previewHtml), "preview strips ids so they cannot collide with the reader");

  /* --- tabs under 760px --- */
  const tabsVisible = await page.locator(".editor-tabs").isVisible();
  expect(tabsVisible, "Write/Preview tabs are shown on the phone");
  await page.locator("#editorTabPreview").click();
  await page.waitForTimeout(150);
  let panes = await page.evaluate(() => ({
    write: getComputedStyle(document.querySelector(".editor-write")).display,
    preview: getComputedStyle(document.querySelector(".editor-preview")).display,
    cls: document.querySelector("#editor").className
  }));
  expect(panes.write === "none" && panes.preview !== "none",
    "Preview tab shows only the preview", JSON.stringify(panes));
  await page.locator("#editorTabWrite").click();
  await page.waitForTimeout(150);
  panes = await page.evaluate(() => ({
    write: getComputedStyle(document.querySelector(".editor-write")).display,
    preview: getComputedStyle(document.querySelector(".editor-preview")).display
  }));
  expect(panes.write !== "none" && panes.preview === "none",
    "Write tab shows only the textarea", JSON.stringify(panes));
  await page.screenshot({ path: path.join(OUT, "editor-phone.png") });

  /* --- toolbar actions, with a selection and with a bare cursor --- */
  const val = () => page.evaluate(() => document.querySelector("#editorArea").value);
  const sel = () => page.evaluate(() => {
    const a = document.querySelector("#editorArea");
    return [a.selectionStart, a.selectionEnd];
  });
  async function seed(text, start, end) {
    await page.evaluate(([t, s, e]) => {
      const a = document.querySelector("#editorArea");
      a.value = t;
      a.focus();
      a.setSelectionRange(s, e === undefined ? s : e);
    }, [text, start, end]);
  }
  async function tool(name) {
    await page.locator(`.editor-tool[data-md="${name}"]`).click();
    await page.waitForTimeout(60);
  }

  const cases = [
    ["bold", "word", 0, 4, "**word**"],
    ["bold", "", 0, 0, "**bold text**"],
    ["italic", "word", 0, 4, "*word*"],
    ["strike", "word", 0, 4, "~~word~~"],
    ["code", "word", 0, 4, "`word`"],
    ["heading", "Title", 0, 0, "## Title"],
    ["quote", "line", 0, 4, "> line"],
    ["bullet", "line", 0, 4, "- line"],
    ["number", "line", 0, 4, "1. line"],
    ["task", "line", 0, 4, "- [ ] line"],
    ["link", "label", 0, 5, "[label](url)"],
    ["link", "https://example.com", 0, 19, "[](https://example.com)"],
    ["rule", "", 0, 0, "---\n"],
    ["table", "", 0, 0, "| Column | Column |"],
    ["codeblock", "x = 1", 0, 5, "```\nx = 1\n```"]
  ];
  for (const [name, text, s, e, want] of cases) {
    await seed(text, s, e);
    await tool(name);
    const got = await val();
    expect(got.includes(want), `tool ${name} (${text ? "selection" : "cursor"}) -> ${JSON.stringify(want)}`,
      JSON.stringify(got));
  }

  /* toggling off */
  await seed("**word**", 2, 6);
  await tool("bold");
  expect((await val()) === "word", "bold toggles back off", JSON.stringify(await val()));

  await seed("- one\n- two", 0, 11);
  await tool("bullet");
  expect((await val()) === "one\ntwo", "bullet list toggles off", JSON.stringify(await val()));

  /* switching list style swaps rather than stacks */
  await seed("- one\n- two", 0, 11);
  await tool("number");
  expect((await val()) === "1. one\n2. two", "bullets become a numbered list",
    JSON.stringify(await val()));
  await seed("1. one\n2. two", 0, 13);
  await tool("task");
  expect((await val()) === "- [ ] one\n- [ ] two", "numbers become a task list",
    JSON.stringify(await val()));

  /* heading cycles */
  await seed("Title", 0, 0);
  await tool("heading");
  await tool("heading");
  expect((await val()) === "### Title", "heading cycles ## -> ###", JSON.stringify(await val()));
  await tool("heading");
  expect((await val()) === "Title", "heading cycles back to plain", JSON.stringify(await val()));

  /* --- undo survives a toolbar action --- */
  await seed("", 0, 0);
  await page.locator("#editorArea").click();
  await page.keyboard.type("hello world");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
  await tool("bold");
  const beforeUndo = await val();
  expect(beforeUndo === "hello **world**", "bolding a typed selection",
    JSON.stringify(beforeUndo));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(80);
  const afterUndo = await val();
  expect(afterUndo === "hello world",
    "native undo reverses a toolbar action", JSON.stringify(beforeUndo) + " -> " + JSON.stringify(afterUndo));

  /* --- keyboard chords --- */
  await seed("chord", 0, 5);
  await page.locator("#editorArea").press("Control+b");
  expect((await val()) === "**chord**", "Ctrl+B bolds", JSON.stringify(await val()));
  await seed("tab", 3, 3);
  await page.locator("#editorArea").press("Tab");
  expect((await val()) === "tab  ", "Tab inserts two spaces", JSON.stringify(await val()));

  /* --- Done lands in the reader --- */
  await seed("# Done test\n\nBody copy.", 0, 0);
  await page.evaluate(() => document.querySelector("#editorArea")
    .dispatchEvent(new Event("input", { bubbles: true })));
  await page.locator("#editorDone").click();
  await page.waitForSelector("#editor", { state: "hidden" });
  expect(await page.locator("#reader").isVisible(), "Done shows the reader");
  expect((await page.locator("#article h1").first().textContent()).includes("Done test"),
    "Done renders the edited source");
  expect(await page.locator("#editBtn").isVisible(), "Edit button appears in the reader");

  /* --- reopen from the reader, Cancel keeps the document --- */
  await page.locator("#editBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  expect((await val()).includes("# Done test"), "Edit reopens with the current source");
  await page.locator("#editorArea").fill("# Done test\n\nBody copy. Plus more.");
  page.once("dialog", (d) => d.accept());
  await page.locator("#editorCancel").click();
  await page.waitForSelector("#editor", { state: "hidden" });
  expect((await page.locator("#article h1").first().textContent()).includes("Done test"),
    "Cancel leaves the reader on the old document");
  expect(!(await page.locator("#article").textContent()).includes("Plus more"),
    "Cancel discards the edit");

  /* --- desktop split view --- */
  await page.setViewportSize(DESK);
  await page.locator("#editBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  await page.waitForTimeout(200);
  const split = await page.evaluate(() => ({
    write: getComputedStyle(document.querySelector(".editor-write")).display,
    preview: getComputedStyle(document.querySelector(".editor-preview")).display,
    tabs: getComputedStyle(document.querySelector(".editor-tabs")).display
  }));
  expect(split.write !== "none" && split.preview !== "none",
    "desktop shows both panes at once", JSON.stringify(split));
  expect(split.tabs === "none", "desktop hides the tabs", split.tabs);
  await page.screenshot({ path: path.join(OUT, "editor-desktop.png") });

  /* --- Escape cancels --- */
  await page.keyboard.press("Escape");
  await page.waitForSelector("#editor", { state: "hidden" });
  ok("Escape closes a clean editor");

  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function autosave(browser) {
  console.log("\n== 4. Auto-save and restore ==");
  const { ctx, page, errors } = await fresh(browser, PHONE);

  await page.locator("#clipboardBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  await page.locator("#editorArea").fill("# Half written\n\nA sentence left mid-");
  await page.waitForTimeout(700);
  const stored = await page.evaluate(() => sessionStorage.getItem("bmd-doc"));
  expect(!!stored && JSON.parse(stored).editing === true,
    "typing writes an editing session", String(stored).slice(0, 90));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.bmdEditor);
  await page.waitForSelector("#editor:not(.is-hidden)", { timeout: 5000 });
  const restored = await page.evaluate(() => document.querySelector("#editorArea").value);
  expect(restored.includes("A sentence left mid-"), "reload reopens the editor with the text",
    JSON.stringify(restored));

  /* a second reload must still come back here, even with nothing newly typed */
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.bmdEditor);
  await page.waitForSelector("#editor:not(.is-hidden)", { timeout: 5000 });
  ok("a second reload still reopens the editor");

  await page.locator("#editorDone").click();
  await page.waitForSelector("#editor", { state: "hidden" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.bmdEditor);
  await page.waitForTimeout(400);
  expect(await page.locator("#reader").isVisible(), "after Done, reload restores the reader");
  expect(await page.locator("#editor").isHidden(), "after Done, the editor stays closed");
  expect((await page.locator("#article").textContent()).includes("A sentence left mid-"),
    "the reader restores the saved text");

  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

function longDoc(sections) {
  const out = ["# A long document", ""];
  for (let i = 1; i <= sections; i++) {
    out.push("## Section " + i, "");
    out.push("Prose for section " + i + ". " + "The quick brown fox jumps over the lazy dog. ".repeat(12), "");
    if (i % 3 === 0) {
      out.push("| Key | Value |", "| --- | --- |", "| alpha | " + i + " |", "| beta | " + (i * 2) + " |", "");
    }
    if (i % 4 === 0) {
      out.push("```js", "function section" + i + "() { return " + i + "; }", "```", "");
    }
  }
  return out.join("\n");
}

async function download(browser, viewport, label) {
  console.log("\n== 2. Downloads (" + label + ") ==");
  const { ctx, page, errors } = await fresh(browser, viewport);

  async function run(btn, docLabel, expectName) {
    await page.locator("#exportBtn").click();
    await page.waitForFunction(() => document.querySelector("#exportDialog").open);
    const dl = page.waitForEvent("download", { timeout: 180000 });
    await page.locator(btn).click();
    let saved = null;
    let err = null;
    try {
      const d = await dl;
      const name = d.suggestedFilename();
      const file = path.join(OUT, label.replace(/\W+/g, "-") + "-" + docLabel + "-" + name);
      await d.saveAs(file);
      saved = { name, file, size: fs.statSync(file).size };
    } catch (e) { err = e.message; }

    /* the dialog must stay open and show a tappable fallback link */
    const state = await page.evaluate(() => {
      const link = document.querySelector("#exportSaveLink");
      return {
        open: document.querySelector("#exportDialog").open,
        status: document.querySelector("#exportStatus").textContent,
        statusHidden: document.querySelector("#exportStatus").hidden,
        linkHidden: link.hidden,
        href: link.getAttribute("href") || "",
        download: link.getAttribute("download") || "",
        text: link.textContent
      };
    });
    expect(!!saved, docLabel + " " + expectName + " — a download arrived", err);
    if (saved) {
      console.log("   " + saved.name + "  " + saved.size + " bytes");
      expect(saved.size > 1000, docLabel + " " + expectName + " — file is not empty", saved.size + " bytes");
      expect(new RegExp(expectName + "$").test(saved.name),
        docLabel + " — filename ends " + expectName, saved.name);
    }
    expect(state.open, docLabel + " " + expectName + " — dialog stays open");
    expect(!state.linkHidden && state.href.startsWith("blob:"),
      docLabel + " " + expectName + " — a blob save link is offered", JSON.stringify(state).slice(0, 160));
    expect(!state.statusHidden && /\S/.test(state.status),
      docLabel + " " + expectName + " — status line reports progress", JSON.stringify(state.status));
    await page.locator("#exportClose").click();
    await page.waitForFunction(() => !document.querySelector("#exportDialog").open);
    const cleared = await page.evaluate(() => document.querySelector("#exportSaveLink").hidden);
    expect(cleared, docLabel + " " + expectName + " — closing resets the dialog");
    return saved;
  }

  /* worst case for the canvas cap: the wide measure */
  await loadViaEditor(page, FIX("overflow.md"));
  await setPref(page, "measure", "wide");

  await run("#downloadMdBtn", "short", ".md");
  await run("#downloadImageBtn", "short", ".png");
  const pdf = await run("#downloadPdfBtn", "short", ".pdf");
  if (pdf) {
    const head = fs.readFileSync(pdf.file).subarray(0, 5).toString("latin1");
    expect(head === "%PDF-", "short pdf — file really is a PDF", head);
  }

  /* and a long document, which tiles */
  await loadViaEditor(page, longDoc(14));
  await page.waitForTimeout(300);
  const img = await run("#downloadImageBtn", "long", "\\.(png|zip)");
  if (img && img.name.endsWith(".zip")) {
    const sig = fs.readFileSync(img.file).subarray(0, 2).toString("latin1");
    expect(sig === "PK", "long image — ZIP signature", sig);
  }
  const longPdf = await run("#downloadPdfBtn", "long", ".pdf");
  if (longPdf) {
    const buf = fs.readFileSync(longPdf.file);
    expect(buf.subarray(0, 5).toString("latin1") === "%PDF-", "long pdf — file really is a PDF");
    const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    console.log("   long pdf pages: " + pages);
    expect(pages >= 2, "long pdf — more than one page", String(pages));
  }

  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function regress(browser) {
  console.log("\n== 5. Regressions ==");
  const { ctx, page, errors, offline } = await fresh(browser, DESK);

  await loadViaEditor(page, FIX("overflow.md"));
  const links = await page.locator("#tocNav a").count();
  expect(links >= 1, "contents lists the headings (h2/h3 only)", String(links));
  expect(await page.locator("#article .anchor").count() >= 2, "reader keeps its heading anchors");
  expect(await page.locator("#article h2[id]").count() >= 1, "reader headings keep their ids");

  /* every paper */
  await page.locator("#settingsBtn").click();
  const papers = await page.locator(".swatch").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-paper")));
  for (const p of papers) {
    await page.locator(`.swatch[data-paper="${p}"]`).click();
    await page.waitForTimeout(60);
    const applied = await page.evaluate(() => document.documentElement.getAttribute("data-paper"));
    expect(applied === p, "paper " + p + " applies", applied);
  }
  await page.locator(`.swatch[data-paper="${papers[0]}"]`).click();

  /* every typeface — applied through the --reading-font custom property.
     Measure a prose paragraph: the first <p> in the article is the mono
     meta line, which never changes with the typeface. */
  const faces = await page.locator("#prefTypeface option").evaluateAll((o) => o.map((e) => e.value));
  const seen = new Set();
  for (const f of faces) {
    await page.locator("#prefTypeface").selectOption(f);
    await page.waitForTimeout(60);
    const font = await page.evaluate(() => {
      const p = [...document.querySelectorAll("#article p")]
        .find((n) => !n.closest(".article-head"));
      return {
        reading: document.documentElement.style.getPropertyValue("--reading-font"),
        used: p ? getComputedStyle(p).fontFamily : "(no prose paragraph)",
        sansClass: document.body.classList.contains("typeface-sans")
      };
    });
    expect(/\S/.test(font.reading) && /\S/.test(font.used),
      "typeface " + f + " applies", JSON.stringify(font));
    expect(!seen.has(font.used), "typeface " + f + " is distinct from the others", font.used);
    seen.add(font.used);
    expect(font.sansClass === (f === "sans"), "typeface " + f + " sets body.typeface-sans correctly");
  }
  await page.locator("#prefTypeface").selectOption("serif");
  await page.locator("#settingsClose").click();

  /* night ink — relative, because choosing the Night Ink paper already
     switched the ink to dark and nothing switches it back */
  const inkBefore = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  await page.locator("#themeToggle").click();
  await page.waitForTimeout(150);
  const inkAfter = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(inkAfter !== inkBefore && (inkAfter === "dark" || inkAfter === "light"),
    "the ink toggle flips the theme", inkBefore + " -> " + inkAfter);
  if (inkAfter === "dark") await page.screenshot({ path: path.join(OUT, "regress-night.png") });
  await page.locator("#themeToggle").click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === inkBefore,
    "the ink toggle flips back");
  if (inkBefore === "dark") {
    await page.locator("#themeToggle").click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, "regress-night.png") });
    await page.locator("#themeToggle").click();
  }

  /* charts + mermaid */
  await page.locator("#newDocBtn").click();
  await page.locator("#chartExampleBtn").click();
  await page.evaluate(() => window.bmdCharts.ready());
  await page.waitForTimeout(400);
  const figs = await page.locator(".chart-figure").count();
  const chartErrs = await page.locator(".chart-error").count();
  expect(figs >= 2, "chart and mermaid fences render", String(figs));
  expect(chartErrs === 0, "no chart errors",
    chartErrs ? (await page.locator(".chart-error").allTextContents()).join(" | ") : "");
  await page.screenshot({ path: path.join(OUT, "regress-charts.png"), fullPage: true });

  /* chart fences also render in the editor preview */
  await page.locator("#editBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  await page.waitForTimeout(1600);
  const previewFigs = await page.locator("#editorPreview .chart-figure").count();
  expect(previewFigs >= 2, "editor preview renders chart fences too", String(previewFigs));
  await page.screenshot({ path: path.join(OUT, "regress-editor-charts.png") });
  await page.keyboard.press("Escape");
  await page.waitForSelector("#editor", { state: "hidden" });

  /* Ctrl+V paste path still renders straight to the reader */
  await page.locator("#newDocBtn").click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "# Pasted straight\n\nFrom the clipboard.");
    document.body.dispatchEvent(new ClipboardEvent("paste",
      { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForSelector("#article h1", { timeout: 5000 });
  expect((await page.locator("#article h1").first().textContent()).includes("Pasted straight"),
    "Ctrl+V still renders straight to the reader");

  /* drag-and-drop text */
  await page.locator("#newDocBtn").click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "# Dropped text\n\nDragged in from elsewhere.");
    document.querySelector("#dropzone").dispatchEvent(new DragEvent("drop",
      { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForSelector("#article h1", { timeout: 5000 });
  expect((await page.locator("#article h1").first().textContent()).includes("Dropped text"),
    "dragged-in text still renders");

  /* a paste while the editor is open must not hijack the reader */
  await page.locator("#editBtn").click();
  await page.waitForSelector("#editor:not(.is-hidden)");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "# Should be ignored");
    document.body.dispatchEvent(new ClipboardEvent("paste",
      { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  expect(await page.locator("#editor").isVisible(), "a paste does not close the editor");
  expect(!(await page.locator("#article").textContent()).includes("Should be ignored"),
    "a paste while editing does not overwrite the reader");
  page.once("dialog", (d) => d.accept());
  await page.keyboard.press("Escape");

  expect(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
  if (offline.size) console.log("   (unreachable hosts in this environment: " + [...offline].join(", ") + ")");
  await ctx.close();
}

/* ---------- main ---------- */

(async () => {
  const stage = process.argv[2] || "all";
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    if (stage === "overflow" || stage === "all") await overflow(browser);
    if (stage === "editor" || stage === "all") await editor(browser);
    if (stage === "autosave" || stage === "all") await autosave(browser);
    if (stage === "download" || stage === "all") {
      await download(browser, PHONE, "phone 375x812");
      await download(browser, DESK, "desktop 1440x900");
    }
    if (stage === "regress" || stage === "all") await regress(browser);
  } finally {
    await browser.close();
  }
  console.log("\n" + (failures ? failures + " FAILURE(S)" : "all checks passed"));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("\nHARNESS ERROR: " + e.stack); process.exit(2); });
