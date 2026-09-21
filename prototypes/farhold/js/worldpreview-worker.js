// Farhold R16 — the title screen's map, built off the main thread.
//
// A 256 x 128 world takes about 600 ms to generate. Typing a seed and having the page stop dead for
// two thirds of a second on every keystroke is not a preview, it is a stutter — so the generating
// happens here and the page only ever does a `putImageData`.
//
// The pixel buffer is transferred rather than copied, so a preview costs one message and no memory
// churn. Everything else on the message is small plain JSON.
//
// WHY THE IMPORT IS A DYNAMIC ONE. `import { buildPreview } from './worldpreview.js'` at the top of
// this file looks tidier and does not work: `universe/js/elements.js` has a top-level `await`, which
// makes this whole module graph asynchronous, and the first message the page sends arrives and is
// DROPPED before the line that sets `self.onmessage` has run. The symptom is the worst kind — no
// error anywhere, the worker alive and idle, and a preview that says "shaping the planet…" for ever.
// Registering the handler synchronously and awaiting the module inside it fixes it: the handler
// exists from the first tick, and anything that arrives early simply waits for the promise.

const ready = import('./worldpreview.js');

self.onmessage = async e => {
  const { id, opts } = e.data || {};
  try {
    const { buildPreview } = await ready;
    const out = buildPreview(opts || {});
    self.postMessage({ id, ...out }, [out.pixels.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
