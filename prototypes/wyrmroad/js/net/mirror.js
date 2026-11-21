// The browser's copy of an online chapter (the "mirror"): snapshots (snap.js) keep a latest copy of the brawl, each
// snapshot is kept as a frame stamped with its server step, and render(now) builds the VIEW STATE (docs/ARCH.md) from
// the two frames around "server clock − 100 ms", positions blended between them (lessons rule 28: never draw moving
// things only at snapshot times). Events are held until that same clock passes the step they happened on, so a hit
// lands with the swing that made it — except the ones `immediate(ev)` picks (your own moves), which go out at once.
//
// The server clock: every message carries its step k; k/60 − (local seconds) is largest for the message that was
// least delayed, so the largest sample of the last few seconds is the clock offset. The offset used eases toward it
// (no visible jumps) unless it is far off (a stalled tab), then it snaps.
import { STEP_HZ } from './protocol.js';
import { heroStats } from '../sim/items.js';
import { applySnap, createLatest, frameOf, POS } from './snap.js';

const lerp = (a, b, t) => a + (b - a) * t;
export const INTERP_DELAY = 0.1;

export function createMirror({ data, T, chapter, delay = INTERP_DELAY, immediate = () => false }) {
  const latest = createLatest();
  const frames = [];
  const held = [];                         // [k, event] waiting for the clock
  const samples = [];                      // [localT, sample]
  let offset = null, renderK = 0;
  const objs = { heroes: new Map(), foes: new Map(), props: new Map(), shots: new Map(), zones: new Map() };
  const chOf = id => data.chapters.chapters.find(c => c.id === id) || data.chapters.chapters[0];
  const G = { online: true, mirror: true, data, T, t: 0, camX: 0, phase: 'walk', secI: 0, ch: chOf(chapter), quakeT: 0, over: false, outcome: null,
    heroes: [], foes: [], props: [], shots: [], zones: [], events: [] };
  const stats = { snaps: 0, late: 0, behindMs: 0 };

  function sample(k, now) {
    const s = k / STEP_HZ - now;
    samples.push([now, s]);
    while (samples.length && samples[0][0] < now - 3) samples.shift();
    const target = Math.max(...samples.map(x => x[1]));
    if (offset == null || Math.abs(target - offset) > 0.25) offset = target;
  }
  /** A snapshot arrived (now = local seconds). Returns the latest copy. */
  function push(snap, now) {
    applySnap(latest, snap);
    frames.push(frameOf(latest));
    stats.snaps++;
    sample(snap.k, now);
    return latest;
  }
  /** Events of server step k arrived. Returns the ones to hand out right now. */
  function pushEvents(k, evs, now) {
    sample(k, now);
    const out = [];
    for (const e of evs) { if (immediate(e)) out.push(e); else held.push([k, e]); }
    return out;
  }

  function sync(kind, map, frameA, frameB, a, override) {
    const out = [];
    for (const [id, ra] of frameA) {
      let o = map.get(id); if (!o) { o = { id }; map.set(id, o); }
      const rb = frameB?.get(id);
      Object.assign(o, ra);
      if (kind === 'foes' && ra.kind && !o.def) o.def = data.enemies.foes[ra.kind] || data.enemies.bosses[ra.kind] || null;
      if (rb && a > 0) {
        const far = Math.abs((rb.x ?? 0) - (ra.x ?? 0)) > 3 || Math.abs((rb.z ?? 0) - (ra.z ?? 0)) > 3;
        if (!far) for (const k of POS) if (typeof ra[k] === 'number' && typeof rb[k] === 'number') o[k] = lerp(ra[k], rb[k], a);
        if (kind === 'zones' && typeof ra.t === 'number' && typeof rb.t === 'number') o.t = lerp(ra.t, rb.t, a);
      }
      const ov = override?.(o); if (ov) Object.assign(o, ov);
      o.px = o.x; o.py = o.y ?? 0; o.pz = o.z;           // the view state is already smooth: the renderer's lerp is a no-op
      out.push(o);
    }
    for (const id of [...map.keys()]) if (!frameA.has(id)) map.delete(id);
    return out;
  }

  /**
   * Build the view state for local time `now` (seconds). own = { id, view(o) → position fields } draws your hero from
   * the newest snapshot (+ prediction) instead of 100 ms ago. Returns the events released this frame.
   */
  function render(now, own = null) {
    if (!frames.length || offset == null) return [];
    // ease the clock toward the newest estimate (at most 5% faster or slower than real time)
    const target = Math.max(...samples.map(x => x[1]));
    if (Math.abs(target - offset) > 0.25) offset = target; else offset += Math.max(-0.0008, Math.min(0.0008, target - offset));
    const want = (now + offset - delay) * STEP_HZ;
    renderK = Math.max(renderK, want);                      // the clock never runs backwards
    while (frames.length > 2 && frames[1].k <= renderK - STEP_HZ) frames.shift();
    let ia = frames.length - 1;
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i].k <= renderK) { ia = i; break; } else ia = 0;
    const A = frames[ia], B = frames[ia + 1] || null;
    const a = B && renderK > A.k ? Math.min(1, (renderK - A.k) / Math.max(1, B.k - A.k)) : 0;
    if (!B && renderK > A.k + 2) { stats.late++; stats.behindMs = Math.round((renderK - A.k) / STEP_HZ * 1000); } else stats.behindMs = 0;
    const N = frames[frames.length - 1];
    // the street: the camera moves smoothly too
    G.t = renderK / STEP_HZ;
    G.camX = B ? lerp(A.camX, B.camX, a) : A.camX;
    G.quakeT = A.quakeT; G.phase = A.phase; G.secI = A.secI;
    G.over = N.over; G.outcome = N.outcome;                 // the end is told at once (the session closes on the server's word)
    if (A.chId && A.chId !== G.ch.id) G.ch = chOf(A.chId);
    // your own hero comes from the newest frame; everyone else from the clock
    const ownRec = own && N.heroes.get(own.id);
    const heroesA = own && ownRec ? new Map([...A.heroes].filter(([id]) => id !== own.id).concat([[own.id, ownRec]])) : A.heroes;
    G.heroes = sync('heroes', objs.heroes, heroesA, B?.heroes, a, o => (own && o.id === own.id ? own.view(o) : null));
    for (const h of G.heroes) {
      const key = `${h.cls}|${h.level}|${JSON.stringify(h.gear)}`;
      if (h._statsKey !== key && data.classes.classes[h.cls]) { h._statsKey = key; h.stats = heroStats(data.classes, data.items, { cls: h.cls, level: h.level, gear: h.gear || {} }); }
    }
    G.foes = sync('foes', objs.foes, A.foes, B?.foes, a);
    G.props = sync('props', objs.props, A.props, B?.props, a);
    G.shots = sync('shots', objs.shots, A.shots, B?.shots, a);
    G.zones = sync('zones', objs.zones, A.zones, B?.zones, a);
    // events whose step the clock has passed
    const out = [];
    while (held.length && held[0][0] <= renderK) out.push(held.shift()[1]);
    if (held.length > 600) held.splice(0, held.length - 600).forEach(([, e]) => out.push(e));
    G.events = out;
    return out;
  }
  return { G, latest, frames, push, pushEvents, render, stats, get offset() { return offset; }, get renderK() { return renderK; } };
}
