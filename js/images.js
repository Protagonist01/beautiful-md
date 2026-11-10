/* Inspect bounded encoded raster bytes before giving them to an image decoder. */
(function (root) {
  const MAX_BYTES = 8 * 1024 * 1024, MAX_PIXELS = 16000000;
  function dimensions(bytes) {
    const b = bytes, view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const ascii = (start, length) => String.fromCharCode(...b.slice(start, start + length));
    let width, height;
    if (b.length >= 24 && ascii(1, 3) === 'PNG' && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === 'IHDR') {
      width = view.getUint32(16); height = view.getUint32(20);
      for (let i = 8; i + 12 <= b.length;) {
        const length = view.getUint32(i), type = ascii(i + 4, 4);
        if (type === 'acTL') throw new Error('Animated PNG is not supported. Use a static image.');
        if (type === 'IDAT') break;
        if (length > MAX_BYTES || i + length + 12 > b.length) break;
        i += length + 12;
      }
    } else if (b.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) {
      width = view.getUint16(6, true); height = view.getUint16(8, true);
      // GIF animations can decode many frames despite small dimensions.
      throw new Error('GIF images must be converted to static PNG or JPEG before loading.');
    } else if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const type = ascii(12, 4);
      if (type === 'VP8X' && b.length >= 30) {
        if (b[20] & 2) throw new Error('Animated WebP is not supported. Use a static image.');
        width = 1 + b[24] + (b[25] << 8) + (b[26] << 16); height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
      } else if (type === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
        const bits = view.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
      } else if (type === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a) {
        width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
      }
    } else if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 8 < Math.min(b.length, 65536);) {
        if (b[i++] !== 0xff) continue;
        while (b[i] === 0xff) i++;
        const marker = b[i++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
        if (i + 2 > b.length) break;
        const length = view.getUint16(i);
        if (length < 2 || i + length > b.length) break;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          height = view.getUint16(i + 3); width = view.getUint16(i + 5); break;
        }
        i += length;
      }
    }
    if (!width || !height) throw new Error('Cannot safely inspect this image. Use a standard static PNG, JPEG, or WebP.');
    if (width * height > MAX_PIXELS) throw new Error('Image exceeds 16 million pixels. Resize it before loading.');
    return { width, height };
  }
  async function read(url, signal) {
    if (url.startsWith('data:') && url.length > Math.ceil(MAX_BYTES * 4 / 3) + 256) throw new Error('Encoded image exceeds 8 MB.');
    const response = await fetch(url, { signal, credentials: 'omit' });
    if (!response.ok) throw new Error('Image request failed.');
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Image exceeds 8 MB.');
    if (!response.body?.getReader) throw new Error('Safe image loading requires streaming fetch support.');
    const reader = response.body.getReader(), chunks = []; let count = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        count += value.length;
        if (count > MAX_BYTES) throw new Error('Image exceeds 8 MB.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(count); let offset = 0;
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
    const size = dimensions(bytes);
    const mime = bytes[0] === 0xff ? 'image/jpeg' : bytes[0] === 0x89 ? 'image/png' : 'image/webp';
    return { blob: new Blob([bytes], { type: mime }), ...size };
  }
  const sessions = new WeakMap();
  function release(container) {
    const old = sessions.get(container); if (!old) return;
    old.controller.abort(); old.urls.forEach(url => URL.revokeObjectURL(url)); sessions.delete(container);
  }
  function hydrate(container) {
    release(container);
    const controller = new AbortController(), state = { controller, urls: [], promise: null };
    const images = Array.from(container.querySelectorAll('img[data-bmd-src]'));
    state.promise = (async () => {
      let pixels = 0, bytes = 0;
      for (const [index, image] of images.entries()) {
        if (controller.signal.aborted) return;
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          if (index >= 64) throw new Error('Use at most 64 images per document.');
          const result = await read(image.dataset.bmdSrc, controller.signal);
          if (controller.signal.aborted) return;
          pixels += result.width * result.height; bytes += result.blob.size;
          if (pixels > 32000000 || bytes > 32 * 1024 * 1024) throw new Error('Images exceed the total document image budget. Split the document.');
          const url = URL.createObjectURL(result.blob); state.urls.push(url);
          image.onerror = () => {
            if (!image.isConnected || controller.signal.aborted || image.dataset.bmdImageError) return;
            image.dataset.bmdImageError = 'true';
            const note = document.createElement('span'); note.className = 'image-error'; note.setAttribute('role', 'status');
            note.textContent = 'This image passed header checks but could not be decoded. Replace the damaged file.'; image.after(note);
          };
          image.loading = 'lazy'; image.width = result.width; image.height = result.height;
          image.dataset.bmdVerified = 'true'; image.src = url; image.removeAttribute('data-bmd-src');
        } catch (error) {
          if (!image.isConnected) return;
          image.dataset.bmdImageError = 'true';
          const note = document.createElement('span'); note.className = 'image-error'; note.setAttribute('role', 'status');
          note.textContent = 'Image could not load safely: ' + error.message + ' Use a smaller static image or embed one that allows cross-origin access.';
          image.after(note);
        } finally { clearTimeout(timeout); }
      }
    })();
    sessions.set(container, state); return state.promise;
  }
  root.bmdImages = { dimensions, read, hydrate, release, ready: container => sessions.get(container)?.promise || Promise.resolve() };
})(globalThis);
