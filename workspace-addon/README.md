# Beautiful MD for Google Workspace

Development variant for Docs, Sheets, Slides, and Gmail. This is source for a test deployment, not an installed or Marketplace-published add-on.

## Design

One Apps Script project uses CardService for all four hosts. Markdown is converted to editable Google content through the REST APIs, using event-provided file IDs and per-file permission. The existing Beautiful MD website supplies the full paper styles, charts, and PDF/PNG exports in a separate browser tab.

Google Workspace add-ons cannot embed the existing HTML reader in their card sidebar or access the editor cursor. Insertion therefore appends to the first Docs tab, adds a new worksheet in Sheets, appends slides, or inserts at the Gmail compose cursor. Existing editor content is preserved.

Native output supports headings, paragraphs, emphasis, links, code, and list markers. Docs, Sheets, Slides, and Gmail preserve native/HTML tables. Public HTTPS raster-image URLs become Docs inline images with captions, Slides image objects with alternatives, Gmail HTML images, and Sheets IMAGE cells. Slides puts images on dedicated slides, including images referenced by table cells. Private/data-URL images stay in browser output and are never automatically published.

Sheets converts chart/chartjs JSON for bar, line, pie, and doughnut charts into editable embedded charts with numeric source data. Other Google hosts retain chart/Mermaid source; the browser renders their full visuals. Native Google layout is not a paper-style replica. Slides wraps whole paragraphs and splits long titles/tables across pages using conservative glyph estimates; review layout in the real host.

## Build and test

Requires Node.js; there are no npm dependencies.

```powershell
node workspace-addon/build.cjs
node --test workspace-addon/test/*.test.cjs
```

The build copies the existing MIT-licensed Marked parser into the Apps Script bundle. Generated files go into `workspace-addon/dist/` and are ignored by Git.

## Configure and install for testing

For a new account/project, follow [the step-by-step setup guide](../SETUP_GOOGLE_WORKSPACE.md). You can run `npm run build:addon -- --preview-url https://YOUR-SITE.example/` to generate the preview allowlist and a `configurePreview` function. Run that function once in Apps Script after uploading the generated source.

1. Host the existing static Beautiful MD site over HTTPS. In Apps Script, add the script property `BMD_PREVIEW_URL` containing that site's URL. Add that HTTPS URL (ending in `/`) to `addOns.common.openLinkUrlPrefixes` in the manifest and rebuild. Markdown travels in the URL fragment, not the query string; it isn't sent to the site's server. The browser still processes it, so use a deployment you control. The workspace handoff removes the fragment before rendering and disables the site's analytics for that visit. The preview button rejects links over 12,000 characters instead of truncating them.
2. Create a standalone project at [Apps Script](https://script.google.com/). In Project Settings, enable showing `appsscript.json`.
3. Copy `dist/appsscript.json` and all generated `.gs` files into the project. Replace the manifest's `logoUrl` with an HTTPS PNG of your product logo before distribution. The initial icon is a Google-hosted generic document icon.
4. Link a standard Google Cloud project. Enable Google Docs API, Google Sheets API, and Google Slides API. Configure the OAuth consent screen and add test users.
5. Deploy > Test deployments > select Google Workspace add-on > Install. Open Docs, Sheets, Slides, and Gmail in that account and launch Beautiful MD from the side panel. Reload apps if necessary.
6. In each editor, use **Allow access to this file** before insertion. Source and title are saved per user across that permission flow. In Gmail, launch from the compose toolbar for insertion; the homepage offers a new draft instead.
7. Run the manual acceptance checks below. Marketplace publication, domain installation, OAuth verification, and production hosting are separate setup steps.

Optional clasp workflow: install/authenticate Google's clasp CLI yourself, then create an ignored `.clasp.json` at the repository root with `{"scriptId":"YOUR_SCRIPT_ID","rootDir":"workspace-addon/dist"}`. Run the build before each `clasp push`.

## Permissions and data

- `drive.file`: create files and edit only files opened/granted to this add-on.
- `script.external_request`: call Google's Docs, Sheets, and Slides APIs.
- `gmail.addons.execute`: run in Gmail.
- `gmail.addons.current.action.compose`: create a draft or update the current compose body following the user's action. No message-reading or send action is implemented.

The last Markdown input and title are stored in per-user Apps Script properties (up to 7,000 UTF-8 bytes for Markdown). **Clear saved input** removes them. Google APIs receive the content when the user creates/inserts it. Errors are shown without logging content or OAuth tokens.

## Failure protection and recovery

- Native conversion rejects control/private-use characters that Google removes, including characters produced by decoding HTML entities. Rejection happens before calculating style positions or creating files. Styled browser preview remains available for the original source. Native tables are bounded to 200 rows, 20 columns, and 1,000 cells; oversized Slides rows fail with an explicit message.
- Docs insertion resets text size, font, color, decoration, paragraph spacing/indentation, and inherited bullets in the new content. Existing content is not restyled. Gmail fenced code uses preformatted whitespace; RTL content receives explicit direction.
- Before a remote mutation, an operation record is saved per user with a content fingerprint and target link when known. A repeated completed native operation reopens its previous result. An uncertain operation blocks further writes, including different input, until reviewed. This covers timeouts, lost responses, revoked permissions, and quota failures; it does not claim the remote write failed.
- Reopen the add-on, choose **Review last result**, and inspect the file or Gmail Drafts. If no target link was received, search recent files by title. Then use **I checked the result — allow a new operation** only when it is safe to create/insert again. Empty files are preserved for review, not automatically deleted.
- Gmail does not report whether a returned compose-insertion response was applied. After insertion, review the email before acknowledging the operation and inserting again. No sending is implemented.
- Export holds content/settings stable and blocks failed charts. Cancel or Escape interrupts asynchronous export work; waits have deadlines and late results are discarded. A fully synchronous browser-library operation cannot be force-interrupted until it yields. Reading/heading/code/table web fonts are checked; **Use installed fonts** provides a complete offline font mode. This is not a guarantee of arbitrary glyph coverage across all installed fonts.
- Encoded raster images are read within 8 MB and inspected before assigning image src. PNG/JPEG/static WebP are supported; GIF/APNG/animated WebP and uninspectable files must be converted to static raster images. Per-source limits are 16 million pixels; document totals are 32 million pixels, 32 MB encoded bytes, and 64 images. Cross-origin images must permit CORS for safe inspection. Invalid/blocked images produce a visible message and block export.
- The download dialog shows the first actual exported image/PDF page. Fixed export typography and line breaks can differ from the responsive reader. **Print / searchable PDF** and accessible HTML preserve semantic text; the tagged Chromium command in the root README creates an explicitly tagged PDF with an outline. Raster PDF remains available. Semantic output disables floated drop caps to preserve sentence reading order.
- Export tiles are compressed immediately and raw canvases cleared, including error paths. At most one tile is decoded at a time when assembling PDF pages. Limits: 200 pages, 200,000 CSS pixels of document height, 16 million pixels per source image, and 32 MB total compressed tile data. These bounds reduce memory risk; actual low-memory devices can still fail. Split documents if necessary.
- A visible Save link is the reliable fallback when a browser blocks automatic downloads. The automatic click is best effort.

## Manual acceptance checks (requires Google account)

- Install in all four hosts; verify homepage and compose entry points.
- Paste headings, bold/italic text, Unicode, links, lists, code, and a Markdown table. Create a Doc, spreadsheet, deck, and draft. Confirm all remain editable.
- Grant access to each editor; append to a populated file. Confirm original content remains and insertion follows the destinations described above.
- Use a multi-tab Doc, a nonstandard slide size, and a long deck section. Confirm first-tab insertion and continuation slide layout.
- Open Gmail compose, insert Markdown alongside existing body/signature, and confirm nothing is sent.
- Open styled preview, change paper, render charts, and export PDF plus PNG/ZIP. Confirm source survives the handoff.
- Deny file access, omit preview URL, provide blank/oversized input, and revoke OAuth. Confirm understandable errors and no false success.
- Clear saved input and reopen the add-on; verify Markdown and title are gone.
- Append after colored/oversized/bulleted Docs text; verify the new content uses its own baseline and the old text stays unchanged.
- Interrupt a native create/insert request; verify repeating it cannot write again until the result is reviewed. Verify completed repeats reopen the existing target.
- Convert long titles, many short bold spans, Arabic/Hebrew, CJK, combining accents, joined emoji, and private-use characters. Verify layout, whitespace, rejection messages, and file contents in each real host.

Local regression coverage: `npm test`, `npm run test:browsers`, the PDF fixture verifier, and the existing Playwright probes. Browser engine/width evidence is written to `output/browser-matrix.json`. The current fixture passes Chromium/Firefox/WebKit at 375px and 1280px. Live Google integration, Gmail delivery rendering, physical-device memory limits, and exact native font fitting remain manual checks. See the [release evidence ledger](../RELEASE_CHECKLIST.md).

## Google references

- [Workspace interface restrictions](https://developers.google.com/workspace/add-ons/guides/workspace-restrictions)
- [Editor interfaces and per-file access](https://developers.google.com/workspace/add-ons/editors/gsao/building-editor-interfaces)
- [Event-provided file context](https://developers.google.com/workspace/add-ons/concepts/event-objects)
- [Gmail draft composition](https://developers.google.com/workspace/add-ons/gmail/compose)
