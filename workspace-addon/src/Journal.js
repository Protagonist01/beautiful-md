/* A timeout is not proof that a remote write failed. Never retry it blindly. */
var BmdJournal = (function () {
  function read() {
    var raw = PropertiesService.getUserProperties().getProperty('bmdOperation');
    if (raw === null) return null;
    var value;
    try { value = JSON.parse(raw); } catch (_) { return { state: 'damaged', target: '' }; }
    if (!value || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
      ['done', 'uncertain'].indexOf(value.state) === -1 || typeof value.target !== 'string' ||
      typeof value.started !== 'string' || !Number.isFinite(Date.parse(value.started)) || value.state === 'done' && !value.target ||
      value.target && !/^https:\/\/(docs\.google\.com\/(document|spreadsheets|presentation)\/d\/[a-zA-Z0-9_-]+\/edit(?:#gid=\d+)?|mail\.google\.com\/mail\/u\/0\/#drafts)$/.test(value.target)) {
      return { state: 'damaged', target: '' };
    }
    return value;
  }
  function save(value) { PropertiesService.getUserProperties().setProperties({ bmdOperation: JSON.stringify(value) }); }
  function begin(key, target) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(key), Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    var old = read();
    if (old && old.state === 'damaged') throw new Error('The saved operation record is damaged. Review recent files and drafts, then use the recovery action before writing again.');
    if (old && old.state !== 'done') throw new Error('The previous operation may have completed. Review its result before allowing another write.');
    if (old && old.fingerprint === digest) return old;
    var operation = { fingerprint: digest, state: 'uncertain', target: target || '', started: new Date().toISOString() };
    save(operation); return operation;
  }
  function target(operation, url) { operation.target = url; save(operation); }
  function done(operation, url) { operation.state = 'done'; operation.target = url; save(operation); }
  function clear() { PropertiesService.getUserProperties().deleteProperty('bmdOperation'); }
  return { read: read, begin: begin, target: target, done: done, clear: clear };
})();
