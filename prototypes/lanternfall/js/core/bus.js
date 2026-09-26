// Event bus (docs/10 §4.3). Events emitted during a tick are queued and delivered at flush(), so a
// listener never runs in the middle of a cell pass. Gameplay systems call each other directly; the
// bus is for reactions (UI, audio, talk, meter, challenges).
export function createBus() {
  const listeners = new Map(); let queue = [];
  const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); };
  return {
    on,
    once(type, fn) { const off = on(type, p => { off(); fn(p); }); return off; },
    emit(type, payload = {}) { queue.push([type, payload]); },
    /** deliver now, bypassing the queue (UI-only events outside the tick) */
    emitNow(type, payload = {}) { deliver(type, payload); },
    flush() { const q = queue; queue = []; for (const [t, p] of q) deliver(t, p); return q.length; },
    clear() { queue = []; listeners.clear(); },
    pending: () => queue.length,
  };
  function deliver(type, payload) {
    const a = listeners.get(type); if (a) for (const fn of [...a]) { try { fn(payload, type); } catch (e) { console.error('[bus]', type, e); } }
    const s = listeners.get('*'); if (s) for (const fn of [...s]) { try { fn(payload, type); } catch (e) { console.error('[bus *]', e); } }
  }
}
