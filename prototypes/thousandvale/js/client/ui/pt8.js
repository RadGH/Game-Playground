// The play-test-8 interface in one place (stream D-UI), so main.js only creates it, wires it and ticks it:
//   W5  the ox-cart window (ui/cart-travel.js)            W21 the damage meter (ui/meter-window.js; Settings, default off)
//   W12 quest marks on the minimap and the map: A's per-player `questMarks {marks, full?}` kept here and turned into markers
// The rest of the round lives where it belongs: W8 ui/loot.js · W10 ui/unseen.js · W13 ui/event-tracker.js + hidden-events.js ·
// W15/W17 ui/map-tools.js + worldmap.js + minimap.js · W16 minimap.js · W19/W22 bag.js + inv-core.js · W25 item-icons.js ·
// W27 pt8-core.js npcTitle (pt2.js) · W28/W29 ui/feedback.js · W23 ui/kit-step.js. Pure rules: ui/pt8-core.js.
//
//   const ui8 = createUi8({ ...main's pieces });  ui8.wire(net);  ui8.tick(dt)
// window.tvui8 = test hooks (state of every piece, fake server messages through the real handlers).

import { createCartTravel } from './cart-travel.js';
import { createMeterWindow } from './meter-window.js';
import { questMarkMarkers } from './pt8-core.js';
import { HIDDEN } from './hidden-events.js';

export function createUi8(o) {
  const { net, hud, actors, atlas, settings } = o;
  const cart = createCartTravel({ net, hud, onOpen: () => o.worldUi?.closeDialog?.() });      // the carter's own "hello" dialog gives way to the route window
  const meter = createMeterWindow({ net, hud, actors, selfId: () => o.selfId?.() ?? null, bar: o.bar, settings });

  // ---- W12: who has a quest for you ----
  const marks = new Map();        // entity id -> 'offer' | 'turnin' | 'active' | 'later' | 'job'
  function onMarks(m) {
    if (!m || typeof m.marks !== 'object' || !m.marks) return;
    if (m.full) marks.clear();
    for (const [id, v] of Object.entries(m.marks)) { const k = isNaN(+id) ? id : +id; if (v == null) marks.delete(k); else marks.set(k, v); }
  }
  if (atlas) {
    const prev = atlas.extraMarkers;
    atlas.extraMarkers = () => {
      const base = prev ? prev() || [] : [];
      if (!marks.size) return base;
      const bodies = [];
      for (const [id] of marks) { const a = actors.get(id); if (a && !a.dead) bodies.push({ id, name: a.name, x: a.pos.x, z: a.pos.z }); }
      // the journal's own pins (a tracked quest's "hand it in here") win over a mark on the same spot
      const pins = (atlas.quests || []).filter(q => q.loc && (!atlas.isTracked || atlas.isTracked(q.id))).map(q => ({ kind: q.ready ? 'questdone' : 'quest', area: !q.loc.exact, x: q.loc.x, z: q.loc.z }));
      const mine = questMarkMarkers(bodies, marks, pins);
      if (!mine.length) return base;
      const marked = new Set(mine.map(x => 'see:' + x.id.slice(3)));       // the plain "someone in sight" dot gives way to the mark
      return base.filter(x => !marked.has(String(x.id))).concat(mine);
    };
  }

  function wire(n) {
    cart.wire(n); meter.wire(n);
    n.on('questMarks', onMarks);
    n.on('joined', j => { marks.clear(); if (j?.you?.marks) onMarks({ marks: j.you.marks, full: true }); });
  }
  function tick() { meter.tick(); }

  const api = { cart, meter, marks, wire, tick,
    /** /meter from chat (true = it was ours). */
    command(cmd) { if (cmd === 'meter' || cmd === 'dps' || cmd === 'damage') { const on = meter.toggle(); hud.toast(on ? 'Damage meter on.' : 'Damage meter off.', 'info'); return true; } return false; },
    panels: { meter: meter.panel, cart: cart.panel } };
  const fakeTaps = new Map();
  api.wire = n0 => { const n = Object.create(n0); n.on = (ev, fn) => { (fakeTaps.get(ev) || fakeTaps.set(ev, []).get(ev)).push(fn); return n0.on(ev, fn); }; wire(n); };
  window.tvui8 = {
    state: () => ({ cart: cart.state, meter: meter.state, marks: Object.fromEntries(marks), hidden: HIDDEN.list() }),
    fake: (ev, msg) => { if (typeof window.tv?.fake === 'function') return window.tv.fake(ev, msg); const fns = fakeTaps.get(ev) || []; for (const fn of fns) fn(msg); return fns.length; },
    cart: m => cart.open(m), meter: (on = true) => (settings?.set ? settings.set('meter', on) : meter.setOn(on)), hits: rows => { let n = 0; for (const r of rows || []) if (meter.feed(r)) n++; meter.tick(); return n; },
    marks: m => onMarks(m), hide: ev => HIDDEN.hide(ev), show: ev => (ev ? HIDDEN.show(ev) : HIDDEN.showAll()),
  };
  return api;
}
