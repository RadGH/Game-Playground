// The page's side of the sim worker. One request at a time per kind; replies come back as events.

export function createLink() {
  const worker = new Worker(new URL('../worker/sim-worker.js', import.meta.url), { type: 'module' });
  const handlers = {};
  let pendingInit = null, nextReply = 1;
  const replies = new Map();
  worker.onmessage = e => {
    const m = e.data;
    if (m.t === 'ready' && pendingInit) { pendingInit(m.macro); pendingInit = null; return; }
    if (m.t === 'error') console.error('[sim worker]', m.message);
    if (m.t === 'reply') { replies.get(m.id)?.(m.result); replies.delete(m.id); return; }
    handlers[m.t]?.(m);
  };
  worker.onerror = e => console.error('[sim worker]', e.message || e);
  return {
    init(settings, materials, opts = {}) { return new Promise(res => { pendingInit = res; worker.postMessage({ t: 'init', settings, materials, ...opts }); }); },
    requestChunks(want) { worker.postMessage({ t: 'chunks', want }); },
    send(t, data = {}) { worker.postMessage({ t, ...data }); },
    /** An order that answers (found, build…). */
    order(order) { return new Promise(res => { const id = nextReply++; replies.set(id, res); worker.postMessage({ t: 'order', order, reply: id }); }); },
    /** A question for the sim: ask('building', { x, y }), ask('save'). */
    ask(q, data = {}) { return new Promise(res => { const id = nextReply++; replies.set(id, res); worker.postMessage({ t: 'ask', q, ...data, reply: id }); }); },
    on(t, fn) { handlers[t] = fn; },
    terminate() { worker.terminate(); },
  };
}
