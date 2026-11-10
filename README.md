# Beautiful MD

Turn Markdown and plain text into beautifully typeset documents with customizable paper, typography, charts, diagrams, and PDF/PNG exports.

The web app runs in the browser with local vendor libraries and no build step. Serve this directory with any static server, for example:

```powershell
python -m http.server 8099 --bind 127.0.0.1
```

Open [the local app](http://127.0.0.1:8099). See [chart syntax](CHARTS.md) and the [build book](BUILD_BOOK.md).

## Google Workspace variant

Development is on `feat/google-workspace-addon`. The add-on source targets **Docs, Sheets, Slides, and Gmail**, with native creation/insertion plus a browser handoff for styled preview/export.

See [Workspace setup, supported formatting, and test-deployment instructions](workspace-addon/README.md). Local tests pass; installation, OAuth, and live Google host verification are still required.

Start with the [step-by-step Google setup guide](SETUP_GOOGLE_WORKSPACE.md). The [release checklist](RELEASE_CHECKLIST.md) separates verified code from live-account and physical-device checks.

```powershell
node workspace-addon/build.cjs
node --test workspace-addon/test/addon.test.cjs
```

The Apps Script bundle is generated into the ignored `workspace-addon/dist/` directory.

## Browser verification and semantic PDF

The static website needs no npm build. Development verification and the tagged-PDF command use pinned Playwright:

```powershell
npm ci
npx playwright install chromium firefox webkit
npm test
npm run test:browsers
npm run export:pdf -- --input test/fixtures/semantic.md --output output/pdf/semantic-verified.pdf
```

The browser offers **Print / searchable PDF** and **Download accessible HTML**. For a file generated with PDF structure tags and an outline, use `export:pdf`. The existing **Download PDF** path preserves raster appearance and remains image-based. Tagged output preserves document structure; it is not a claim of PDF/UA certification.

For artifact verification, install `pypdf` in your Python environment, then run `python tools/verify-pdf.py output/pdf/semantic-verified.pdf`. The fixture checks searchable sentences, CJK text, heading/table roles, and outline. Physical-device and live Google checks remain in the release checklist.
