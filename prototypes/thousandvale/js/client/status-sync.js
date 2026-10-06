// Statuses everyone sees (play-test 2, Q8: "Died to an ash wisp, revived still on fire; other people don't see
// the fire").
//
// The client used to draw a status aura ONLY from the `fx {kind:'status', on}` event, so (1) somebody who walked
// into view after the event never saw it, (2) an aura whose "off" was lost (a death, a room change, a status that
// simply ran out) stayed on for good — the burning corpse that stood back up still burning — and (3) your own
// body's aura depended on you having seen the event. Stream A now keeps `info.st = [status ids]` on every entity
// in step with the rules (protocol §18.8). This file makes that list the truth:
//
//   * 4 times a second every drawn body's auras are brought in line with `info.st` (dead = none at all);
//   * the event path still turns an aura on/off at once (no lag on the frame it happens) and gives that change a
//     short grace period, so a snapshot that has not caught up yet does not flicker it straight back;
//   * a death clears every aura on the spot, a revive starts from nothing.
//
//   const st = createStatusSync({ actors, fx: spells.fx, infoOf: id => S.mirror.infos.get(id) })
//   st.onEvent(ev)      // every fx status event (after spells.onEvent drew it)
//   st.dead(id)         // a death
//   st.update(nowMs)    // every frame

import { statusLook } from './spell-looks.js';

const GRACE_MS = 1500;

/** Pure: the aura names a status list should show (dead bodies show none). Exported for tests. */
export function wantedAuras(st, dead) {
  if (dead || !Array.isArray(st)) return new Set();
  const out = new Set();
  for (const s of st) { const k = statusLook(s) || String(s || ''); if (k) out.add(k); }
  return out;
}

/**
 * Pure: the changes that bring `drawn` in line with `want`, leaving alone anything inside its grace period.
 * -> { on: [names], off: [names] }. Exported for tests.
 */
export function auraDiff(drawn, want, grace = new Map(), now = 0) {
  const on = [], off = [];
  for (const s of want) if (!drawn.has(s) && !((grace.get(s) || 0) > now && grace.get('-' + s))) on.push(s);
  for (const s of drawn) if (!want.has(s) && !((grace.get(s) || 0) > now)) off.push(s);
  return { on, off };
}

export function createStatusSync({ actors, fx, infoOf = () => null, selfDead = () => false, selfId = () => null } = {}) {
  let next = 0;
  const book = a => (a.auras ||= { drawn: new Set(), grace: new Map() });
  function set(a, s, on) {
    const b = book(a);
    if (on === b.drawn.has(s)) return;
    try { fx.status(a.group, s, on); } catch { /* an aura that cannot draw is not worth a crash */ }
    if (on) b.drawn.add(s); else b.drawn.delete(s);
  }
  function clear(a) {
    const b = book(a);
    try { fx.clearStatus(a.group); } catch {}
    b.drawn.clear(); b.grace.clear();
  }
  return {
    /** The event path drew (or dropped) an aura: record it, and protect it from a stale snapshot for a moment. */
    onEvent(ev) {
      if (!ev || ev.type !== 'fx' || ev.kind !== 'status') return;
      const a = actors.get(ev.id); if (!a) return;
      const s = statusLook(ev.status) || String(ev.status || ''); if (!s) return;
      const b = book(a), on = ev.on !== false;
      if (a.dead && on) return;                         // nothing burns on a corpse
      if (on) b.drawn.add(s); else b.drawn.delete(s);
      b.grace.set(s, performance.now() + GRACE_MS);
      if (on) b.grace.delete('-' + s); else b.grace.set('-' + s, 1);
    },
    dead(id) { const a = actors.get(id); if (a) clear(a); },
    update(now = performance.now()) {
      if (now < next) return;
      next = now + 250;
      const me = selfId();
      for (const a of actors.actors.values()) {
        if (a.id === 'preview') continue;
        const info = infoOf(a.id);
        const dead = a.dead || (a.id === me && selfDead());
        if (dead) { if (a.auras?.drawn.size) clear(a); continue; }
        if (!info && !a.auras) continue;
        const want = wantedAuras(info?.st, false);
        const b = book(a);
        const { on, off } = auraDiff(b.drawn, want, b.grace, now);
        for (const s of on) set(a, s, true);
        for (const s of off) set(a, s, false);
      }
    },
    stats() { let n = 0; for (const a of actors.actors.values()) n += a.auras?.drawn.size || 0; return { auras: n }; },
  };
}
