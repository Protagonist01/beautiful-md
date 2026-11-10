# Set up your first Google Workspace test deployment

You need one Google account for testing, a standalone Apps Script project, a linked Google Cloud project, and an HTTPS address for the Beautiful MD website. No Marketplace publication, paid account, client secret, or shared password is needed for the initial test.

## 1. Create the Apps Script project

1. Sign in to [Apps Script](https://script.google.com/) with the account you will use to test the add-on.
2. Select **New project** and name it **Beautiful MD — Workspace Test**.
3. Open **Project Settings**. Enable **Show appsscript.json manifest file in editor**.
4. Copy the **Script ID** from Project Settings or save the project URL. This identifies the project; it is not an OAuth token.

## 2. Create and link the Google Cloud project

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project named **Beautiful MD Workspace Test**.
2. Enable **Google Docs API**, **Google Sheets API**, and **Google Slides API** under **APIs & Services → Library**.
3. Configure **Google Auth Platform** (OAuth consent). Supply the app name, your support email, and developer contact email. For a personal-account test, choose the external audience and add your test account under **Audience → Test users**. Keep the app in testing.
   In **Data Access**, add the scopes declared by `workspace-addon/appsscript.json`: `drive.file`, `script.external_request`, `gmail.addons.execute`, and `gmail.addons.current.action.compose`, using their full `https://www.googleapis.com/auth/…` URLs. The manifest is the source of truth for the requested permissions.
4. Copy the Cloud **project number**, not its textual project ID.
5. Return to Apps Script **Project Settings → Google Cloud Platform project → Change project**. Enter that project number.

If your organization restricts add-ons or OAuth apps, your Workspace administrator must allow this test deployment. Do not work around those account restrictions.

## 3. Host the preview and build the source

The website files in this repository run on any HTTPS static host. Publish the current feature-branch files, including `js/images.js`, `js/tasks.js`, and `js/print.js`; an older deployment ZIP will not contain these fixes. Use a deployment you control because the browser processes your Markdown there.

From the repository root, run:

```powershell
npm ci
npm run build:addon -- --preview-url https://YOUR-SITE.example/
```

Replace the example with your real site URL. The build adds that URL to the add-on manifest's link allowlist and generates `Config.gs`. It does not deploy anything to Google or your static host.

You can install/test native creation before hosting the preview by running `npm run build:addon` without a URL. The preview button will explain the missing configuration.

## 4. Upload and configure

1. In the Apps Script editor, remove the default empty `Code.gs` if it is still unused.
2. Copy `workspace-addon/dist/appsscript.json` into the project's manifest.
3. Create script files named **Addon**, **Google**, **Journal**, **Markdown**, and **Marked**. Paste the contents of the corresponding generated `.gs` files. If built with a preview URL, also copy **Config.gs**.
4. Save the project. If `Config.gs` is present, select **configurePreview** in the function dropdown and run it once. Complete Google's authorization flow using your test account. This saves the public preview URL as a script property.
5. Do not manually create a web OAuth client or paste credentials into the source.

The generic test icon can be replaced with your own HTTPS PNG through `addOns.common.logoUrl`. Use your own branding before distribution.

## 5. Install the test add-on

1. Choose **Deploy → Test deployments** and select the **Google Workspace add-on** deployment type.
2. Choose **Install** and follow the authorization prompts for your test account.
3. Open Docs, Sheets, Slides, and Gmail using that same account. Reload them if the sidebar icon does not appear immediately.
4. Open Beautiful MD from the side panel. In each editor, choose **Allow access to this file** before insertion. In Gmail, open it from the compose toolbar to insert into an existing draft.
5. Use the [live acceptance checklist](workspace-addon/README.md#manual-acceptance-checks-requires-google-account). Start with disposable files. Creating a draft does not send it.

For additional testers, Google's unpublished-add-on flow requires editor access to the script project and the documented domain restrictions. Begin with the account that owns this project; adding an OAuth test user alone does not grant script-project access.

You can share the Apps Script project URL or Script ID to identify the test project. Never share passwords, recovery codes, OAuth tokens, or client secrets. A URL alone does not grant another account access.

## What this setup does not prove

Installing the add-on is the start of live verification. It does not establish exact native font fitting, real interruption recovery, Gmail rendering after delivery, physical iPhone behavior, or Marketplace approval. Browser-engine tests in this repository cover Chromium, Firefox, and WebKit, not actual mobile hardware.

Official references: [build Workspace add-ons](https://developers.google.com/workspace/add-ons/how-tos/building-workspace-addons), [standard Cloud projects](https://developers.google.com/apps-script/guides/cloud-platform-projects), and [test deployments](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons).
