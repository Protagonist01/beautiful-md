# Release evidence and remaining acceptance

This is an evidence ledger, not a claim of production readiness.

| Area | Implemented protection | Evidence / remaining step |
|---|---|---|
| Export cancellation | Cancel button, Escape, two-minute deadline, bounded waits and discarded late results | Automated primitive tests and three-engine browser matrix |
| Fonts | Reading, heading, code and table font checks; installed-font mode | Failed heading/code font tests and multilingual browser fixtures; arbitrary glyph coverage still depends on installed fallback fonts |
| Image allocation | Encoded byte/pixel budgets and raster header inspection before source assignment | Header tests and browser rejection test; physical low-memory-device validation remains |
| Damaged operation record | Schema/URL validation, writes blocked, explicit recovery action | Corrupt/null/hostile-record tests |
| Native tables | Docs cell-index readback; Slides native tables; Sheets cells; Gmail HTML tables | Request-builder tests; **live Google verification required** |
| Native images | Public HTTPS images in Docs/Slides/Gmail and Sheets IMAGE cells | Request-builder tests; private/embedded images remain in browser output, never automatically published |
| Native charts | Editable bar/line/pie/doughnut charts in Sheets | Request-builder tests; other hosts keep source; full chart/Mermaid visuals are in browser output |
| Semantic PDF | Semantic HTML print path and tagged Chromium command | Real PDF text extraction, structure-tree roles, outline, and rendered-page inspection; no claim of PDF/UA certification |
| Cross-browser layout | Chromium, Firefox, WebKit at 375px and 1280px | Six automated engine/width combinations; **physical Safari/iPhone/low-memory checks remain** |
| Live installation/auth/recovery | Setup guide, generated manifest/config, operation journal | **Not run: user has not created a Google test project yet** |

Run `npm test`, `npm run test:browsers`, and `npm run build:addon`. Generate the PDF fixture with `npm run export:pdf -- --input test/fixtures/semantic.md --output output/pdf/semantic-verified.pdf`; verify it using `python tools/verify-pdf.py output/pdf/semantic-verified.pdf` (requires pypdf).

Native Google content has a different layout model from the paper reader. Slides uses conservative font estimates because Google does not permit writing text-autofit mode through this API. Private image bytes are not made public to satisfy Google's image-URL requirement. These are explicit platform boundaries, not features covered by local test passes.
