# Build Book — Beautiful MD
A journal of the real reasoning behind this build: decisions, options rejected, and things that broke along the way.

## Index
- [Entry 1 — Keep paper stock and lighting separate](#entry-1--keep-paper-stock-and-lighting-separate)
- [Entry 2 — Export the rendered page](#entry-2--export-the-rendered-page)
- [Entry 3 — Keep paste and file actions distinct](#entry-3--keep-paste-and-file-actions-distinct)
- [Entry 4 — Separate the file target from paste controls](#entry-4--separate-the-file-target-from-paste-controls)
- [Entry 5 — Lay out exports before capturing them](#entry-5--lay-out-exports-before-capturing-them)
- [Entry 6 — Let the measure narrow on a phone](#entry-6--let-the-measure-narrow-on-a-phone)
- [Entry 7 — Hand the phone a blob and a link it can tap](#entry-7--hand-the-phone-a-blob-and-a-link-it-can-tap)
- [Entry 8 — One render pipeline for the reader and the editor](#entry-8--one-render-pipeline-for-the-reader-and-the-editor)
- [Entry 9 — Let oversized rows continue across pages](#entry-9--let-oversized-rows-continue-across-pages)

## Entry 1 — Keep paper stock and lighting separate
**Files touched:** `css/style.css`, `js/app.js`, `index.html`

### Context
The night button replaced the selected paper with a single Night Ink stock. That erased a ruled, legal, graph, or colored paper choice. The ruled sheets also used a fixed 30px background grid even when text size and leading changed.

### Before you read on
How would you keep a paper's texture and accent while changing its lighting, and make every text line follow the same spacing as its printed rule?

### Options considered
- **Switch to Night Ink on every toggle** — already present; loses the paper design.
- **Chosen: independent paper and lighting attributes** — the paper selects the stock, while lighting supplies colors for that stock. Night Ink remains an available dark stock.

### Why
The paper choice describes the material and ruling. The lighting choice describes how that material reads at night. Keeping them separate lets the existing swatches keep their meaning.

### How to build it
1. Store the selected paper in `data-paper` and the lighting in `data-theme` on `html`. The toolbar toggles only `data-theme`, except when leaving the dark-only Night Ink preset.
2. Define dark color variables for each paper stock, including blue and red rule colors for lined paper. Keep the same gradient geometry in both modes.
3. Compute `--rule-period` from the selected article size and leading in `applyPrefs()`. Use it for both the repeated background and the text line height. Reset native margins within ruled sheets and use whole rule periods for vertical gaps.
4. Verify by switching paper and lighting independently, then checking text baselines and repeated line positions with different size and leading settings.

### What went wrong
The original 30px rule happened to suit one text configuration but drifted as soon as the typography preferences changed. Native paragraph and heading margins added spacing that was unrelated to the rule period.

## Entry 2 — Export the rendered page
**Files touched:** `index.html`, `css/style.css`, `js/app.js`, `vendor/html2canvas.min.js`, `vendor/jspdf.umd.min.js`

### Context
The reader needs downloads that preserve the selected paper, type, and lighting. Browser print can make a PDF but does not directly produce the requested image.

### Before you read on
How can one rendering path produce both an image and a paged PDF without changing the live document?

### Options considered
- **Browser print only** — simple, but no PNG output and paper backgrounds depend on print settings.
- **Chosen: capture the article once, then encode that canvas** — preserves the visible styling and supplies both formats.

### Why
The document already exists as styled HTML. Capturing that view avoids building a second markdown layout that could drift from the reader.

### How to build it
1. Add a Download button shown only while reading and a dialog with PDF and PNG actions.
2. Include local copies of html2canvas and jsPDF. Wait for web fonts before capturing the article with its computed raised-paper color.
3. Capture in vertical tiles no taller than 12,000 output pixels. For lined paper, draw the paper color and repeating lines beneath each captured tile. Keep each tile's start pixel so page assembly can join tile boundaries.
4. For a short PNG, download the canvas data URL. For a long document, use JSZip to bundle numbered PNG tiles. For PDF, create an A4 document with 12mm margins and copy any overlapping tile sections into each page canvas before saving.
5. Disable both actions while a capture runs, then restore them whether export succeeds or fails.

### What went wrong
The first jsPDF CDN version URL returned 404. A working pinned version was fetched before wiring the export code.
The first PNG also looked dim and lost its ruling. The export dialog backdrop and the article's entrance animation affected the cloned capture, while html2canvas did not paint the repeated gradients. The capture now closes the dialog, disables animation in its clone, and draws rule lines beneath the cloned content on the output canvas.
The longer test document exceeded the browser's safe single-canvas height at 2× scale. Splitting the capture into tiles keeps each canvas below that limit; PDF pages are assembled from tile overlaps, and images are bundled into a ZIP.

## Entry 3 — Keep paste and file actions distinct
**Files touched:** `js/app.js`

### Context
The drop area opens a file picker on every bubbled click and Enter or Space keydown. It also contains separate Browse and Paste buttons. The Paste handler waits for a clipboard read before opening its dialog, so a permission delay leaves no immediate visual response.

### Before you read on
How would you keep the whole drop area clickable while ensuring a nested button can never activate the file picker?

### Options considered
- **Remove the drop area's click action** — avoids interference but makes most of the apparent drop target inert.
- **Chosen: gate the parent's handlers by event target** — keeps the large file target and gives each nested control its own action.

### Why
The parent should handle clicks on its own decorative and text content, while Browse and Paste own clicks on their buttons. Keyboard activation should apply to the focused element, not bubble from a focused child into the parent. Opening the Paste dialog before the clipboard request also makes the action immediate.

### How to build it
1. In the drop area's click handler, return when the event originated inside a nested button or input; otherwise click the file input.
2. In its keydown handler, respond to Enter or Space only when the drop area itself has focus.
3. In the Paste handler, stop propagation and open the dialog first. Then attempt `navigator.clipboard.readText()`; fill the textarea only if the same dialog session is still open and the textarea is empty.
4. Check pointer and keyboard activation after switching themes, and verify the Browse button still opens the file picker.

### What went wrong
The event wiring made the outer drop area responsible for actions that originated inside its own buttons. The clipboard permission path added a delay before the dialog appeared, making a first activation appear ineffective.

## Entry 4 — Separate the file target from paste controls
**Files touched:** `index.html`, `css/style.css`, `js/app.js`

### Context
This supersedes Entry 3's target-guard approach. The user still saw a file picker when trying Paste in the in-app `file://` tab, even though pointer and keyboard clicks on the Paste button worked under localhost browser automation. The outer drop area still owned the file-picker click handler and surrounded the small Paste hit target.

### Before you read on
How can the drop card keep its full appearance and drag behavior while making it structurally impossible for a Paste-area click to invoke the file picker?

### Options considered
- **Add another condition to the parent click handler** — could still treat a click in the gap near Paste as a file action.
- **Remove clicking from the whole card** — reliable but loses the main file target affordance.
- **Chosen: a dedicated file target inside a passive drop card** — file clicks, Browse, and Paste are siblings with separate handlers.

### Why
The earlier guard depended on the click's exact target. The new structure makes the file picker handler belong only to the main upload region. Paste and Browse no longer have a clickable file-picker ancestor, so theme changes or small pointer offsets cannot route their clicks through that handler.

### How to build it
1. Leave `#dropzone` as the visual card and drag surface. Put its upload icon and text inside a new `#fileDropTarget` focusable region.
2. Keep `.dropzone-alt` as a sibling of that file target. Attach the picker click and Enter/Space handlers to `#fileDropTarget`, not `#dropzone`.
3. Move pointer styling to the dedicated target and give it a visible keyboard focus outline. Keep drag listeners on `#dropzone`.
4. Test Paste and Browse with pointer and keyboard; test clicks in the gap around the controls to confirm they do nothing instead of opening the picker.

### What went wrong
The first fix passed localhost checks but did not resolve the user's `file://` experience. Direct browser automation of that in-app file tab was blocked by the browser tool's URL policy, so this fix removes the event-routing dependency rather than attributing the behavior to a theme or clipboard permission without evidence.

## Entry 5 — Lay out exports before capturing them
**Files touched:** `js/app.js`, `css/style.css`, `index.html`

### Context
Supersedes Entry 2's fixed-height PDF slices. They can bisect lines, pictures, and table rows. Capturing the live article also ties export width to the device and does not wait for embedded images. The user wants separate controls for the metadata strip and decorative marks, plus more type and paper choices.

### Before you read on
How can we retain the browser's typography while finding page boundaries that do not cut through ink?

### Options considered
- Browser print: better native pagination and selectable text, but changes the existing direct-download workflow and cannot produce PNGs.
- Chosen: create an isolated article clone, settle its assets, measure safe boundaries, then capture bounded tiles.

### Why
The clone keeps the same document styles while allowing a consistent export width, padding, wrapped code and fully visible tables. Measuring text ranges gives us actual line boxes rather than guessing line heights.

### How to build it
1. Clone the article into an offscreen export surface. Remove interactive anchors and copy buttons, clear live ruling-alignment padding, and set a fixed width constrained by the selected measure.
2. Wait for fonts and decode images. Load remote images with CORS and stop with a useful error if an image cannot be exported rather than silently omitting it.
3. Measure text-node range rectangles and atomic image/table-row boxes. Prefer keeping headings with following text and small blocks intact; if a block exceeds a page, break between its lines.
4. Move each proposed page boundary upward until it intersects no protected box. Capture bounded tiles and assemble PDF pages using those boundaries. Add breathing room around PNG content.
5. Store header and ornament preferences alongside the existing preferences. Use shared CSS so reading and exporting honor the same settings. Add font stacks and three paired light/dark paper palettes.
6. Verify real downloads in Edge at desktop and phone widths, render the PDF with Poppler, inspect page edges, and check preference persistence.

### What went wrong
The default Playwright Chrome channel is absent on this machine; use the installed Edge channel. Verification findings will be appended as they occur.

Chart rendering extends Entry 5: recognize `mermaid`, `chart`, and `chartjs` fences after code decoration. Load pinned local renderers on demand; keep Mermaid in strict mode with HTML labels disabled, and parse Chart.js input as JSON. Convert the finished diagram SVG or chart canvas into a PNG image before placing it beside the hidden source block. This makes exports copy real image pixels instead of losing canvas contents during DOM cloning. Serialize Mermaid jobs, discard stale results when documents change, and destroy temporary Chart.js instances. On a theme change, rerender from the preserved source. On failure, show the original fence and a local error message.

The first visual check confirmed that html2canvas does not reproduce `::first-letter`: the dropped capital was small and detached. The export clone now wraps that character in a styled span. Variable-font optical axes also caused captured headings to overlap, so the export surface disables optical axes and negative heading tracking before measuring. The browser initially reused old CSS/JS; disabling the HTTP cache was necessary to verify the current code. The first 16-page PNG-backed PDF was about 204 MB because jsPDF embedded uncompressed pixels; enable document compression and PNG FAST compression before delivery. Long PNG tiles now use the same safe-boundary search as PDF pages.

Verification completed in Edge on localhost: default and dark paper exports, all six font options, Sage/Ocean/Rose, hidden metadata and ornaments, saved preferences after reload, a 390px mobile layout, a long PDF and PNG ZIP, Mermaid flowchart/sequence/pie, Chart.js bar/line/pie, invalid fences, and a missing-image failure with cleanup. PDF pages were rasterized with `pdftoppm` and visually inspected. The compressed long PDF was 5,036,572 bytes; the PNG ZIP was 7,471,600 bytes. Final chart-example PDF is under 0.4 MB. A visual check caught an orphaned chart heading: skip hidden source-code siblings when finding the following content to keep with a heading. Another caught white Mermaid pie slices and faint default Chart.js lines: explicitly supply matching light/dark palettes while preserving user-supplied dataset colors. The only unrelated browser error was a failed external analytics request.

## Entry 6 — Let the measure narrow on a phone
**Files touched:** `css/style.css`

### Context
A document pasted on a phone was cut off at the right edge. Long URLs, long inline code, wide tables and unbroken code lines all ran past the screen with nothing to scroll back. Because `html` and `body` are `overflow-x: clip`, the excess was not scrollable — it was simply gone.

### Before you read on
The reader is a two-column grid that collapses to one column on a phone, and the article column is centred with `margin: 0 auto` and capped at a reading measure. Why would that column refuse to narrow below its cap, even after the track is told it may shrink?

### Options considered
- **Clamp the grid track only** — declare every single-column override `minmax(0, 1fr)` so the track loses its `min-content` floor. Necessary, but not sufficient.
- **Drop the centring on small screens** — would work, but splits the layout into two rules that can drift apart.
- **Chosen: clamp the measure itself with `min()`** — `max-width: min(100%, var(--article-measure))` keeps the cap and the centring at every width.

### Why
An `auto` inline-axis margin opts a grid item out of stretching. Once `.article` carries `margin: 0 auto` it is no longer stretched to its track; it shrink-to-fits and then settles at its own `max-width`. On a phone that max-width is the 72ch reading measure — far wider than the track, whatever the track is allowed to do. Fixing the track alone cannot help, because the item was never consulting the track. Clamping the measure to `100%` restores the relationship: narrow screens get the track width, wide screens still get the measure, and the centring survives both.

### How to build it
1. Give every single-column grid override `minmax(0, 1fr)`, not a bare `1fr`, so the track has no `min-content` floor.
2. Set `.article { max-width: min(100%, var(--article-measure)); min-width: 0; margin: 0 auto }`.
3. Set `.editor-preview .article { max-width: 100% }` so the preview fills its pane but can still never push the pane sideways.
4. Add `overflow-wrap` so long words break, and leave `.table-wrap { overflow-x: auto }` to carry genuinely wide tables on their own scrollbar.
5. Verify by measuring boxes, not the document: at 375×812, assert that no element inside the reader is wider than the viewport unless it sits inside an ancestor that scrolls or clips it.

### What went wrong
The first fix clamped the three grid tracks and declared the problem solved. It was not: the article still measured 754px inside a 343px track. The assertion that passed it — `documentElement.scrollWidth <= innerWidth` — is worthless here, because `overflow-x: clip` on the root means `scrollWidth` can never report overflow in the first place. The check agreed with a page that was visibly broken. Only measuring bounding boxes found it, and three probes were needed to attribute it to the auto margin rather than to the track.

## Entry 7 — Hand the phone a blob and a link it can tap
**Files touched:** `js/app.js`, `js/export.js`, `index.html`, `css/style.css`

### Context
Download produced nothing on a phone. Three separate causes, each enough on its own: the capture overran the mobile canvas limit and came back blank; the result was handed to `<a download>` as a multi-megabyte data URL, which iOS Safari refuses; and the click happened several awaits after the tap, by which time the user gesture had expired. The dialog closed immediately either way, so a slow export was indistinguishable from a dead button.

### Before you read on
A phone browser may silently refuse a programmatic download and will not tell you. What do you put on screen so the user can always complete the save themselves?

### Options considered
- **Open the file in a new tab** — survives the gesture rules, but loses the filename and leaves the user to save by hand with no name.
- **Shrink the capture and keep everything else** — fixes the blank canvas only; the data URL and the lost gesture remain.
- **Chosen: size the capture to the device, deliver a blob, and always show a tappable save link** — the automatic path still works where it works, and there is a real fallback where it does not.

### Why
The programmatic click is an optimisation, not the mechanism. Treating it as best-effort and leaving a visible `Save <name>` anchor in an open dialog means the save completes inside a genuine user gesture no matter what the browser's policy is. Keeping the dialog open also gives progress somewhere to live, so a long export reads as work rather than as failure.

### How to build it
1. In `js/export.js`, derive the tile height from a canvas budget instead of a constant: `AREA_CAP = 16e6`, `DIM_CAP = 8192`, `tileHeight = min(floor(AREA_CAP / (width * scale²)), floor(DIM_CAP / scale))`. Throw a readable error if a canvas comes back zero-sized.
2. Replace `downloadUrl()` with `deliverFile(blob, name)`: make an object URL, attempt the `<a download>` click, and populate the dialog's save anchor with the same URL and `download` name. Revoke on close.
3. Use `canvas.toBlob()` rather than `toDataURL()`, and `pdf.output('blob')` rather than `pdf.save()`.
4. Keep the dialog open through the export, writing progress into a status line, then swap in the save link. Reset the link and status when the dialog closes.
5. Zero each tile canvas (`canvas.width = canvas.height = 0`) once it has been drawn into a page, so a phone does not hold every tile at once.
6. Guard `showModal()` with the same `typeof … === "function"` fallback the paste dialog already used.
7. Add a third action, **Download Markdown**, through the same `deliverFile()` path now that documents are editable.

### What went wrong
The old tile height was a constant chosen on a desktop. At the wide measure it asked for 1840 × 10000 = 18.4M pixels, over the iOS area cap, which is why the capture returned blank rather than erroring. Byte-for-byte identical exports from a 375px and a 1440px viewport afterwards confirmed the capture is sized by the measure and the budget, not by the device.

## Entry 8 — One render pipeline for the reader and the editor
**Files touched:** `index.html`, `js/editor.js`, `js/app.js`, `css/style.css`

### Context
The only way to change a document was to paste it again. The paste dialog was already a textarea in an overlay — most of an editor, with none of the use.

### Before you read on
A live preview must look exactly like the reader, or the preview is a lie. How do you guarantee that without maintaining two renderers?

### Options considered
- **Keep the paste dialog and add an edit mode beside it** — two overlays that do nearly the same thing.
- **Give the preview its own lighter renderer** — faster to write, and certain to drift from the reader the first time either changes.
- **Chosen: absorb the paste dialog into a full editor, and parameterise the existing decorators over a container** — one pipeline, two call sites.

### Why
`decorateHeadings`, `decorateCode`, `wrapTables`, `polishLinks` and `addDropCap` all closed over the module-level `article`. Giving each an element parameter that defaults to `article` costs nothing at the existing call site and makes `renderPreview(source, target)` possible: the same parse and the same decoration into any container, without the doc-head, the TOC or the session write. The preview cannot drift from the reader because there is nothing to drift from.

### How to build it
1. Add `js/editor.js` exposing one global, `window.bmdEditor` (`init`, `open`, `close`, `isOpen`, `fileName`, `value`), loaded before `js/app.js` like `bmdCharts` and `bmdExport`.
2. Remove `#pasteDialog`. Point the landing's clipboard button at `bmdEditor.open("", "untitled.md")` and a new masthead pencil at `bmdEditor.open(currentSource, currentFileName)`.
3. Apply every toolbar action through `document.execCommand("insertText", …)` where available, falling back to `setRangeText`, so the native undo stack survives — on a phone, undo is a long-press gesture and there is no substitute for it.
4. Make line-prefix actions toggle and swap rather than stack: match any existing list or heading marker before adding one, so bullets become numbers become tasks, and `##` cycles to `###` and then to plain text.
5. Debounce the preview at 250ms and the auto-save at 400ms. Charts are expensive, so only call the chart renderer when the source actually contains a `mermaid`/`chart`/`chartjs` fence, on a longer 900ms idle.
6. Auto-save through the existing `saveSession()` with an `editing: true` flag, and have the initial render reopen the editor on that text, so a discarded phone tab comes back mid-edit.
7. For the phone: `font-size: 16px` on the textarea to stop iOS zoom-on-focus, `body.locked` to stop background scroll, a `100dvh` overlay, Write/Preview tabs under 760px and a horizontally scrollable toolbar above the keyboard.

### What went wrong
Nothing in the editor itself, but two verification findings are worth recording. Chromium coalesces a contiguous `insertText` into the preceding typing transaction, so undo after a toolbar action at a bare cursor removes the typing too; undo is correct for a selection replacement, which is the case that matters. And a synthetic `paste` event dispatched on `document` makes `e.target` the Document, which has no `.matches`, so the app's paste guard throws — an artefact of the test, since a real paste always targets an element, and not worth hardening against.

### Known limitation
`alignPaperBlocks()` aligns block padding to the ruled-paper line grid for `#article` only. The editor preview on ruled, legal or graph paper is therefore not baseline-aligned; the reader still is. Generalising that function over containers was out of scope.

## Verification harness
`output/verify/verify.cjs` drives Edge through Playwright against `python -m http.server 8099` and runs five stages — `overflow`, `download`, `editor`, `autosave`, `regress`, or `all`:

```
NODE_PATH="…/npm/node_modules" node output/verify/verify.cjs all
```

The full sweep passes with no failures. Overflow is checked at 375×812 with contents on, contents off, no headings, and no headings at the wide measure; every case reports a 375px viewport, a 343px track and a 343px article, with tables and code fences scrolling inside their own boxes. All three exports run on a short and a long document at the wide measure on both phone and desktop: `untitled.pdf` 235,651 bytes (1 page), the long PDF 2,047,987 bytes (5 pages, each carrying a 1840px-wide tile of 280–420 KB, so no page is blank), the long ZIP 3,015,096 bytes, and phone and desktop byte sizes identical. The editor stage covers 43 checks including all fifteen toolbar actions against both a selection and a bare cursor. Regressions cover the TOC, all twelve papers, all six typefaces, the ink toggle, chart and mermaid fences in both the reader and the editor preview, and the Ctrl+V and drag-and-drop paths.

## Entry 9 — Let oversized rows continue across pages
**Files touched:** `js/export.js`, `css/style.css`, `output/playwright/pagination-mobile.cjs`

### Context
The exporter reports “A table row is taller than a page” whenever protected rectangles leave no legal page break. This replaces the fatal-error policy from the earlier export implementation. The user also reports mobile text overflowing; the existing 375px fixture passes, so additional long-heading and ruled-paper cases are being checked.

### Options considered
- Keep rows together by shrinking all text: this would change the selected reading size and could make a long row unreadable.
- Chosen: preserve normal blocks first, then allow row continuation at text-line boundaries, with a fixed-height cut only when no shared line gap exists.

### Why
An arbitrarily tall row cannot fit on one physical page. Separating text-line protection from whole-row protection lets the exporter keep ordinary rows together and split oversized rows without aborting. Differently sized text in neighboring cells can eliminate shared line gaps, so the last fallback must still guarantee forward progress.

### How to build it
1. Collect text rectangles into a separate `lines` array, while retaining them in the normal protected-block array.
2. Share a break chooser between PDF pagination and canvas tiling: try blocks and soft groups, then blocks alone, then text lines, then the requested limit.
3. Keep each returned boundary greater than the previous boundary. Pages and tiles must cover the entire surface contiguously, including the final pixel.
4. Run `node output/playwright/pagination-mobile.cjs` with Playwright available through `NODE_PATH` and the local server on port 8099. The probe checks 320–768px layouts and exports a row taller than both a page and a canvas tile.

### What went wrong
The original error assumes the absence of a safe break proves a table row caused it. In fact any connected set of protected rectangles can block pagination. Verification results will be appended after running the revised code.

### Mobile layout construction
Give `.reader` and `.reader-shell` `min-width: 0`, give the shell and article explicit `width: 100%`, and retain the article's measure cap. Use `overflow-wrap: anywhere` for prose and contents links so unbroken strings participate in intrinsic sizing. Give table wrappers `min-width: 0; max-width: 100%` and keep their existing horizontal scrolling. Override tables to `overflow-wrap: normal`: inheriting `anywhere` made six-column tables fit by breaking ordinary words into individual letters, which the screenshot revealed. Export cells still use their own wrapping rule to fit the fixed export width. The toast also gets a constrained max-content width and long-word wrapping.

### Verification so far
The new browser probe reproduced the original fatal error before the fix. Afterward, its oversized row produces eight contiguous pages and four contiguous image tiles, and both PDF and ZIP downloads arrive (approximately 2.7 MB and 3.8 MB). The 12 layout combinations (320, 375, 430, 768px with paper, ruled, graph) have no overflowing prose rectangles; the phone editor preview also fits. A final rerun checks the table-word correction and existing overflow suite. Actual device behavior has not been tested.

The final rerun passes both the new probe and the existing `overflow` stage, including wide tables that scroll locally and code blocks that stay within the article. The existing `download` stage passes for short and long documents on phone and desktop sizes, including Markdown, PNG/ZIP, and PDF. Visual inspection confirms table words stay intact. One concurrent overflow run timed out during app startup; rerunning that stage alone passed. `node --check` passes for the exporter and new probe.
