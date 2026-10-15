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

import * as THREE from 'three';
import { statusLook } from './spell-looks.js';

const GRACE_MS = 1500;
/** Pure: the aura names a status list should show (dead bodies show none). Exported for tests. */
export function wantedAuras(st, dead) {
  if (dead || !Array.isArray(st)) return new Set();
  const out = new Set();
  // `item:*` are consumable buffs (C: whetted, oiled, well_fed, oats…) — no aura. (`item:torch` and the worn `light` slot were carried lights until play-test 8, W22: light items are gone and nothing is drawn for one.)
  for (const s of st) { if (String(s).startsWith('item:') || String(s).startsWith('bless:')) continue;      /* [World #47] a shrine blessing: no aura */ const k = statusLook(s) || String(s || ''); if (k) out.add(k); }
  return out;
}

/** S4: a rare's affixes that show as a standing aura (burning, frozen, shocking, venomous, shielded, frenzied…). Pure. */
const MOD_AURA = [[/burn|fire|flam|blaz|molten/, 'burn'], [/frost|frozen|ice|cold/, 'freeze'], [/shock|storm|lightning|thunder/, 'haste'], [/venom|poison|toxic|plague/, 'poison'], [/shield|ward|armou?red/, 'barrier'], [/frenz|berserk|rage|enrag/, 'rally'], [/vampir|curse|shadow|gloom/, 'curse'], [/regen|troll/, 'regen']];
export function modAuras(mods) {
  const out = new Set();
  // the server's affix rows carry their own `aura` (a status-look id) when they have one (protocol §20.4); ids/names otherwise
  if (Array.isArray(mods)) for (const m of mods) {
    if (m && typeof m === 'object' && m.aura) { out.add(statusLook(m.aura) || String(m.aura)); continue; }
    const t = m && typeof m === 'object' ? `${m.id || ''} ${m.name || ''}`.toLowerCase() : String(m).toLowerCase();
    for (const [re, k] of MOD_AURA) if (re.test(t)) { out.add(k); break; }
  }
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

export function createStatusSync({ actors, fx, infoOf = () => null, selfDead = () => false, selfId = () => null, groundY = null } = {}) {
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
    /** C's recall charm: `fx {kind:'channel', id, name, ms}` starts the channel, `{kind:'channel', id, end:'done'|'broken'}` ends it. */
    onChannel(ev) {
      if (!ev || ev.type !== 'fx' || ev.kind !== 'channel') return;
      const a = actors.get(ev.id); if (!a) return;
      const g = groundY ? groundY(a.pos.x, a.pos.z) : a.pos.y;
      try {
        if (!ev.end) { a.channelUntil = performance.now() + (ev.ms || 5000); fx.cast({ at: new THREE.Vector3(a.pos.x, g + 0.15, a.pos.z), element: 'arcane', ms: Math.min(8000, ev.ms || 5000), ground: g }); }
        else { a.channelUntil = 0; if (ev.end === 'done') fx.pillar?.({ at: new THREE.Vector3(a.pos.x, g, a.pos.z), radius: 1.3, element: 'arcane', ms: 900 }); }
      } catch { /* a missing effect is not worth a crash */ }
    },
    update(now = performance.now()) {
      if (now < next) return;
      next = now + 250;
      const me = selfId();
      for (const a of actors.actors.values()) {
        if (a.id === 'preview') continue;
        const info = infoOf(a.id);
        const dead = a.dead || (a.id === me && selfDead());
        // Y3 (report #30): ask the effects what is really on the body, not only our own book — an aura drawn on a corpse
        // by an event that arrived after the death (the killing blow's own stun) was in no book and so was never cleared
        if (dead) { if (a.auras?.drawn.size || (a.group && fx.statusesOn?.(a.group).length)) clear(a); continue; }
        if (!info && !a.auras) continue;
        const want = wantedAuras(info?.st, false);
        for (const k of modAuras(info?.aff || info?.mods || info?.affixes)) want.add(k);     // S4: a burning rare burns all the time
        const b = book(a);
        const { on, off } = auraDiff(b.drawn, want, b.grace, now);
        for (const s of on) set(a, s, true);
        for (const s of off) set(a, s, false);
      }
    },
    stats() { let n = 0; for (const a of actors.actors.values()) n += a.auras?.drawn.size || 0; return { auras: n, torches: 0 }; },
  };
}
