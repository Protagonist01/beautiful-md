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

```powershell
node workspace-addon/build.cjs
node --test workspace-addon/test/addon.test.cjs
```

The Apps Script bundle is generated into the ignored `workspace-addon/dist/` directory.
