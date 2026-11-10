/* Apps Script callbacks must be top-level declarations. */
function bmdHost(e) {
  var host = String(e && e.commonEventObject && e.commonEventObject.hostApp || '').toLowerCase();
  if (['docs', 'sheets', 'slides', 'gmail'].indexOf(host) === -1) throw new Error('Open Beautiful MD from Docs, Sheets, Slides, or Gmail.');
  return host;
}
function bmdField(e, name) {
  var inputs = e && e.commonEventObject && e.commonEventObject.formInputs;
  var input = inputs && inputs[name];
  return input && input.stringInputs && input.stringInputs.value ? String(input.stringInputs.value[0] || '') : '';
}
function bmdInput(e) {
  var source = bmdField(e, 'markdown');
  var title = bmdField(e, 'title').trim() || 'Beautiful MD';
  if (!source.trim()) throw new Error('Paste some Markdown first.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new Error('Remove control characters from the Markdown before converting.');
  if (Utilities.newBlob(source).getBytes().length > 7000) throw new Error('Use at most 7,000 UTF-8 bytes of Markdown per conversion.');
  if (title.length > 200) throw new Error('Use a title of 200 characters or fewer.');
  PropertiesService.getUserProperties().setProperties({ bmdSource: source, bmdTitle: title });
  return { source: source, title: title, blocks: BmdMarkdown.parse(source) };
}
function bmdAction(name, params) {
  var action = CardService.newAction().setFunctionName(name);
  return params ? action.setParameters(params) : action;
}
function bmdNotice(message) {
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(message)).build();
}
function bmdRun(fn, event) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return bmdNotice('Another action is still running. Please wait.');
  try { return fn(); }
  catch (error) {
    var response = CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(error.message || 'The action failed. Check your access and try again.'));
    if (event) response.setNavigation(CardService.newNavigation().updateCard(bmdCard(event, false)));
    return response.build();
  }
  finally { lock.releaseLock(); }
}
function onHomepage(e) { return bmdCard(e, false); }
function onGmailCompose(e) { return bmdCard(e, true); }
function bmdCard(e, compose) {
  var host = bmdHost(e), saved = PropertiesService.getUserProperties();
  var labels = { docs: 'Google Docs', sheets: 'Google Sheets', slides: 'Google Slides', gmail: 'Gmail' };
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('Turn Markdown into editable content, or open the paper preview for styled downloads.'))
    .addWidget(CardService.newTextInput().setFieldName('title').setTitle(host === 'gmail' ? 'Subject' : 'Title').setValue(saved.getProperty('bmdTitle') || ''))
    .addWidget(CardService.newTextInput().setFieldName('markdown').setTitle('Markdown').setMultiline(true).setValue(saved.getProperty('bmdSource') || ''));
  if (host === 'gmail') {
    section.addWidget(CardService.newTextButton().setText('Create new draft').setComposeAction(bmdAction('createGmailDraft'), CardService.ComposedEmailType.STANDALONE_DRAFT));
    if (compose) section.addWidget(CardService.newTextButton().setText('Insert into this email').setOnClickAction(bmdAction('insertGmailBody')));
    else section.addWidget(CardService.newTextParagraph().setText('To insert into an existing email, open Beautiful MD from that email’s compose toolbar.'));
  } else {
    section.addWidget(CardService.newTextButton().setText('Create new ' + { docs: 'document', sheets: 'spreadsheet', slides: 'presentation' }[host]).setOnClickAction(bmdAction('createNative')));
    var context = e[host];
    if (context && context.id && context.addonHasFileScopePermission === true) {
      var destination = { docs: 'Append to first document tab', sheets: 'Add new worksheet to this file', slides: 'Append slides to this deck' }[host];
      section.addWidget(CardService.newTextButton().setText(destination).setOnClickAction(bmdAction('insertNative')));
    } else section.addWidget(CardService.newTextButton().setText('Allow access to this file').setOnClickAction(bmdAction('requestEditorAccess')));
  }
  section.addWidget(CardService.newTextButton().setText('Open styled preview & exports').setOnClickAction(bmdAction('openStyledPreview')))
    .addWidget(CardService.newTextParagraph().setText('Native tables remain editable. Images require public HTTPS raster URLs; embedded/private images stay in browser preview. Sheets supports editable bar, line, pie, and doughnut charts; other hosts retain chart source. Custom HTML becomes literal text. Slides uses conservative font estimates; review layout in Google.'))
    .addWidget(CardService.newTextButton().setText('Clear saved input').setOnClickAction(bmdAction('clearSavedInput', { compose: compose ? 'true' : 'false' })));
  var last = BmdJournal.read();
  if (last) {
    section.addWidget(CardService.newTextParagraph().setText(last.state === 'damaged' ? 'The saved operation record is damaged. Writes are blocked to prevent duplicates. Review recent files and Gmail Drafts, then use the recovery action below.' : last.state === 'done' ? 'The last operation completed. Repeating the same input reopens its result.' : 'The last write has an uncertain result. Check the target or search recent files/drafts before starting another.'));
    if (last.target) section.addWidget(CardService.newTextButton().setText('Review last result').setOnClickAction(bmdAction('reviewLastResult')));
    section.addWidget(CardService.newTextButton().setText(last.state === 'damaged' ? 'I reviewed recent files — reset damaged record' : 'I checked the result — allow a new operation').setOnClickAction(bmdAction('acknowledgeOperation', { compose: compose ? 'true' : 'false' })));
  }
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Beautiful MD').setSubtitle(labels[host])).addSection(section).build();
}
function requestEditorAccess(e) {
  try {
    // Preserve source before Google's permission flow rebuilds the card.
    if (bmdField(e, 'markdown').trim()) bmdInput(e);
    return CardService.newEditorFileScopeActionResponseBuilder().requestFileScopeForActiveDocument().build();
  } catch (error) { return bmdNotice(error.message); }
}
function bmdNative(e, insert) {
  return bmdRun(function () {
    var input = bmdInput(e);
    var url = BmdGoogle.convert(bmdHost(e), input.title, input.blocks, e, insert);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText(insert ? 'Content inserted.' : 'File created.'))
      .setNavigation(CardService.newNavigation().updateCard(bmdCard(e, false)))
      .setOpenLink(CardService.newOpenLink().setUrl(url)).build();
  }, e);
}
function createNative(e) { return bmdNative(e, false); }
function insertNative(e) { return bmdNative(e, true); }
function openStyledPreview(e) {
  return bmdRun(function () {
    var input = bmdInput(e);
    var base = PropertiesService.getScriptProperties().getProperty('BMD_PREVIEW_URL');
    if (!base || !/^https:\/\/[^\s?#]+$/i.test(base)) throw new Error('Set BMD_PREVIEW_URL to your hosted HTTPS Beautiful MD site, without query or fragment.');
    var url = base + '#workspace=1&md=' + encodeURIComponent(input.source);
    if (url.length > 12000) throw new Error('This preview link is too long. Open the Beautiful MD site and paste the Markdown there.');
    return CardService.newActionResponseBuilder().setOpenLink(CardService.newOpenLink().setUrl(url)).build();
  });
}
function createGmailDraft(e) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Another action is still running. Please wait.');
  try {
    var input = bmdInput(e);
    BmdMarkdown.validateNative(input.blocks);
    var operation = BmdJournal.begin(['gmail-create', input.title, input.blocks], 'https://mail.google.com/mail/u/0/#drafts');
    if (operation.state === 'done') throw new Error('This draft was already created. Open Gmail Drafts to review it.');
    var text = BmdMarkdown.paragraphs(input.blocks).map(function (b) { return BmdMarkdown.plain(b.runs); }).join('\n');
    var draft = GmailApp.createDraft('', input.title, text, { htmlBody: BmdMarkdown.html(input.blocks) });
    BmdJournal.done(operation, 'https://mail.google.com/mail/u/0/#drafts');
    return CardService.newComposeActionResponseBuilder().setGmailDraft(draft).build();
  } finally { lock.releaseLock(); }
}
function insertGmailBody(e) {
  // Gmail expects an UpdateDraftActionResponse, not a generic ActionResponse.
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) throw new Error('Another action is still running. Please wait.');
  try {
  var input = bmdInput(e);
  BmdMarkdown.validateNative(input.blocks);
  BmdJournal.begin(['gmail-insert', input.blocks], 'https://mail.google.com/mail/u/0/#drafts');
  var body = CardService.newUpdateDraftBodyAction()
    .addUpdateContent(BmdMarkdown.html(input.blocks), CardService.ContentType.MUTABLE_HTML)
    .setUpdateType(CardService.UpdateDraftBodyType.IN_PLACE_INSERT);
  return CardService.newUpdateDraftActionResponseBuilder().setUpdateDraftBodyAction(body).build();
  } finally { lock.releaseLock(); }
}
function reviewLastResult() {
  var last = BmdJournal.read();
  if (!last || !last.target) return bmdNotice('Search your recent files or Gmail Drafts before allowing a new operation.');
  return CardService.newActionResponseBuilder().setOpenLink(CardService.newOpenLink().setUrl(last.target)).build();
}
function acknowledgeOperation(e) {
  return bmdRun(function () {
    BmdJournal.clear();
    var compose = e.commonEventObject.parameters && e.commonEventObject.parameters.compose === 'true';
    return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(bmdCard(e, compose))).build();
  });
}
function clearSavedInput(e) {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty('bmdSource'); props.deleteProperty('bmdTitle');
  var compose = e.commonEventObject.parameters && e.commonEventObject.parameters.compose === 'true';
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(bmdCard(e, compose)))
    .setNotification(CardService.newNotification().setText('Saved Markdown and title cleared.')).build();
}
