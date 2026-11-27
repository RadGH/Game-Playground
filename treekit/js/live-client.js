// Tree Kit page ↔ live channel (tools/live.mjs). Listens on the server's event stream, sends small POSTs. When the
// channel is off (not started, or the page is on https and the channel is plain http) the page still works on its own
// copy and says why saving and notes are off.
//
//   const live = connectLive({ enabled, onStatus, onHello, onSpecies, onSaved, onReverted, onNotes })
//   live.on   live.set(id, path, value)   live.save()   live.revert(id)   live.addNote({ species, text, at })   live.note({ id, … })
export const LIVE_PORT = 8670;

export function connectLive(h) {
  const self = { on: false, base: '' };
  const status = (on, reason = '') => { self.on = on; h.onStatus?.({ on, reason }); };
  if (!h.enabled) { status(false, 'Live channel switched off (?live=0)'); return withCalls(self); }
  const here = location.port === String(LIVE_PORT);
  if (!here && location.protocol === 'https:') {
    status(false, `Live channel is on http — open http://${location.hostname}:${LIVE_PORT}/treekit/`);
    return withCalls(self);
  }
  self.base = here ? '' : `${location.protocol}//${location.hostname}:${LIVE_PORT}`;
  status(false, 'Looking for the live channel…');
  let es = null, retry = 0;
  const open = () => {
    try { es = new EventSource(self.base + '/events'); } catch { status(false, 'Live channel off — node treekit/tools/live.mjs'); return; }
    es.addEventListener('hello', e => { retry = 0; status(true); h.onHello?.(JSON.parse(e.data)); });
    es.addEventListener('species', e => h.onSpecies?.(JSON.parse(e.data)));
    es.addEventListener('saved', e => h.onSaved?.(JSON.parse(e.data)));
    es.addEventListener('reverted', e => h.onReverted?.(JSON.parse(e.data)));
    es.addEventListener('notes', e => h.onNotes?.(JSON.parse(e.data)));
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED || !self.on || ++retry > 2) { status(false, 'Live channel off — node treekit/tools/live.mjs'); }
      if (es.readyState === EventSource.CLOSED) { es.close(); setTimeout(open, 3000); }
    };
  };
  open();
  return withCalls(self);
}

function withCalls(self) {
  const post = async (path, body) => {
    if (!self.on) throw new Error('the live channel is off');
    const r = await fetch(self.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ by: 'owner', ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  // knob drags send at most every 120 ms per knob (the last value always goes)
  const pending = new Map(); let timer = 0;
  const flush = () => { timer = 0; for (const [k, v] of pending) post('/api/set', v).catch(() => {}); pending.clear(); };
  return Object.assign(self, {
    set(id, path, value) { if (!self.on) return; pending.set(id + ':' + path, { id, path, value }); if (!timer) timer = setTimeout(flush, 120); },
    save: () => { flush(); return post('/api/save', {}); },
    revert: id => post('/api/revert', { id }),
    addNote: n => post('/api/notes', n),
    note: n => post('/api/note', n),
  });
}
