/* A timeout is not proof that a remote write failed. Never retry it blindly. */
var BmdJournal = (function () {
  function read() { return JSON.parse(PropertiesService.getUserProperties().getProperty('bmdOperation') || 'null'); }
  function save(value) { PropertiesService.getUserProperties().setProperties({ bmdOperation: JSON.stringify(value) }); }
  function begin(key, target) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(key), Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    var old = read();
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
