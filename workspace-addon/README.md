# Beautiful MD for Google Workspace

Development variant for Docs, Sheets, Slides, and Gmail. This is source for a test deployment, not an installed or Marketplace-published add-on.

## Design

One Apps Script project uses CardService for all four hosts. Markdown is converted to editable Google content through the REST APIs, using event-provided file IDs and per-file permission. The existing Beautiful MD website supplies the full paper styles, charts, and PDF/PNG exports in a separate browser tab.

Google Workspace add-ons cannot embed the existing HTML reader in their card sidebar or access the editor cursor. Insertion therefore appends to the first Docs tab, adds a new worksheet in Sheets, appends slides, or inserts at the Gmail compose cursor. Existing editor content is preserved.

Native output supports headings, paragraphs, emphasis, links, code, and lists. Sheets places Markdown tables into cells. Docs and Slides render tables as tab-separated text. Images appear as descriptive text in native output; charts and diagrams remain source code there. Use styled preview/export for full visual fidelity. Slides splits long sections into continuation slides; review layout after conversion.

## Build and test

Requires Node.js; there are no npm dependencies.

```powershell
node workspace-addon/build.cjs
node --test workspace-addon/test/*.test.cjs
```

The build copies the existing MIT-licensed Marked parser into the Apps Script bundle. Generated files go into `workspace-addon/dist/` and are ignored by Git.

## Configure and install for testing

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

The last Markdown input and title are stored in per-user Apps Script properties (up to 7,000 UTF-8 bytes for Markdown). **Clear saved input** removes them. Google APIs receive the content when the user creates/inserts it. Errors are shown without logging content or OAuth tokens. A failed request is not retried automatically: inspect the target before retrying because a new empty file may have been created.

## Manual acceptance checks (requires Google account)

- Install in all four hosts; verify homepage and compose entry points.
- Paste headings, bold/italic text, Unicode, links, lists, code, and a Markdown table. Create a Doc, spreadsheet, deck, and draft. Confirm all remain editable.
- Grant access to each editor; append to a populated file. Confirm original content remains and insertion follows the destinations described above.
- Use a multi-tab Doc, a nonstandard slide size, and a long deck section. Confirm first-tab insertion and continuation slide layout.
- Open Gmail compose, insert Markdown alongside existing body/signature, and confirm nothing is sent.
- Open styled preview, change paper, render charts, and export PDF plus PNG/ZIP. Confirm source survives the handoff.
- Deny file access, omit preview URL, provide blank/oversized input, and revoke OAuth. Confirm understandable errors and no false success.
- Clear saved input and reopen the add-on; verify Markdown and title are gone.

## Google references

- [Workspace interface restrictions](https://developers.google.com/workspace/add-ons/guides/workspace-restrictions)
- [Editor interfaces and per-file access](https://developers.google.com/workspace/add-ons/editors/gsao/building-editor-interfaces)
- [Event-provided file context](https://developers.google.com/workspace/add-ons/concepts/event-objects)
- [Gmail draft composition](https://developers.google.com/workspace/add-ons/gmail/compose)
