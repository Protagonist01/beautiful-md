/* Abortable waits detach UI work from libraries that cannot themselves abort. */
window.bmdTasks = {
  check(signal) { if (signal?.aborted) throw signal.reason || new Error('Export cancelled.'); },
  wait(promise, signal, milliseconds = 30000, lateCleanup) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return false;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); return true;
      };
      const abort = () => finish(reject, signal.reason || new Error('Export cancelled.'));
      const timer = setTimeout(() => finish(reject, new Error('Export step timed out. Cancel or retry with a smaller document.')), milliseconds);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      Promise.resolve(promise).then(value => { if (!finish(resolve, value)) lateCleanup?.(value); }, error => finish(reject, error));
    });
  }
};
