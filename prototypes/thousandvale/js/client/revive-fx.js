// A revive you can SEE, and tell whose it is (play-test 5, T4: "each revive slightly different so each class has its own
// niche… all need graphics").
//
// Stream C's six revive skills each carry a `style`; A tells everyone near when one lands:
//   fx {kind:'reviveCast', id (caster), on (body id, or ids for the mass one), ab, style, ms}   while the cast runs
//   fx {kind:'revive', id (the body), by (caster), skill}                                        the moment it stands
//
//   style      skill                    while casting                          the moment
//   choir      raise_the_fallen (mass)  a thread of light to every body,       a column of white-gold light on each
//                                       slow rings climbing each one
//   sunburst   second_dawn              (instant)                              one hard lance from the sky, a flat flash
//   bloom      green_return             green rings breathing at the body      leaves and motes; the mend keeps rising 6 s
//   aegis      oathbound_rise           a gold dome lowering over the body     the dome snaps shut and holds a moment
//   grave      unquiet_return           (instant)                              violet shards up out of the ground, a dark well
//   spirits    call_back_the_spirit     three wisps circling down, 8 s         they fall into the chest; a blue ring
//
// The body's own getting-up (off the ground, onto a knee, upright) is actors.js `standUp` — played when the snapshot says
// it lives again. Everything here is drawn with form-fx.js's pooled pieces and avatar-3d's SpellFx: no new program.
//
//   const revives = createReviveFx({ forms, spellFx: spells.fx, actors, groundY })
//   revives.onEvent(ev)      // every fx event

import * as THREE from 'three';

/** Skill id -> style (the `revive` event names the skill; `reviveCast` names the style itself). */
export const REVIVE_STYLE = {
  raise_the_fallen: 'choir', second_dawn: 'sunburst', green_return: 'bloom', oathbound_rise: 'aegis', unquiet_return: 'grave', call_back_the_spirit: 'spirits',
};
/** style -> { el (colour + SpellFx element), cast: pieces while casting, land: pieces when it stands }. Pure. */
export const REVIVE_LOOK = {
  choir: { el: 'holy', cast: ['thread', 'climb'], land: ['column', 'ring'] },
  sunburst: { el: 'holy', cast: [], land: ['skyLance', 'flash', 'ring'] },
  bloom: { el: 'nature', cast: ['thread', 'breathe'], land: ['leaves', 'ring', 'mend'] },
  aegis: { el: 'holy', cast: ['thread', 'lower'], land: ['dome', 'ring'] },
  grave: { el: 'shadow', cast: ['well'], land: ['shards', 'well', 'ring'] },
  spirits: { el: 'ice', cast: ['thread', 'wisps'], land: ['wispsFall', 'ring'] },
};
/** The style for an event (its own `style`, else the skill's, else by the caster's element). Never null. Pure. */
export function reviveStyle(ev) {
  const s = ev?.style || REVIVE_STYLE[ev?.skill] || REVIVE_STYLE[ev?.ab];
  if (REVIVE_LOOK[s]) return s;
  const el = String(ev?.el || '').toLowerCase();
  return el === 'nature' ? 'bloom' : el === 'shadow' ? 'grave' : el === 'ice' || el === 'lightning' ? 'spirits' : 'choir';
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createReviveFx({ forms, spellFx = null, actors = null, groundY = () => 0 } = {}) {
  const P = forms.prims, stats = { casts: 0, lands: 0, byStyle: {} };
  const posOf = id => { const a = actors?.get(id); return a ? { a, x: a.pos.x, y: a.pos.y, z: a.pos.z } : null; };

  function casting(ev) {
    const style = reviveStyle(ev), L = REVIVE_LOOK[style], dur = Math.max(0.3, (ev.ms || 0) / 1000);
    const from = posOf(ev.id), ids = Array.isArray(ev.on) ? ev.on : ev.on != null ? [ev.on] : [];
    stats.casts++;
    if (from) P.ring(from.x, from.z, 1.1, L.el, { life: Math.min(1.2, dur), from: 0.3, opacity: 0.7, y: from.y });
    for (const id of ids) {
      const b = posOf(id); if (!b) continue;
      const chest = V(b.x, b.y + 0.35, b.z);
      if (L.cast.includes('thread') && from) {
        const hand = V(from.x, from.y + 1.25, from.z), len = Math.max(0.5, hand.distanceTo(chest));
        P.play('lance', dur, m => { m.position.copy(hand); m.lookAt(chest); m.scale.set(0.035, 0.035, len); m.material.color.set(P.colourOf(L.el)); }, (m, k) => {
          const w = 0.03 + 0.025 * Math.abs(Math.sin(k * dur * 9)); m.scale.set(w, w, len); m.material.opacity = 0.55 * Math.min(1, k * 8) * (k > 0.92 ? (1 - k) / 0.08 : 1);
        });
      }
      const pulses = Math.max(1, Math.round(dur / 0.8));
      if (L.cast.includes('climb')) for (let i = 0; i < pulses; i++) P.play('ring', 0.8, m => { m.position.set(b.x, b.y + 0.1, b.z); m.rotation.set(0, 0, 0); m.scale.setScalar(0.9); m.material.color.set(P.colourOf(L.el)); }, (m, k) => { m.position.y = b.y + 0.1 + 1.8 * k; m.scale.setScalar(0.9 - 0.4 * k); m.material.opacity = 0.7 * (1 - k); }, i * 0.8);
      if (L.cast.includes('breathe')) for (let i = 0; i < pulses; i++) P.ring(b.x, b.z, 1.4, L.el, { life: 0.8, from: 0.2, opacity: 0.6, delay: i * 0.8, y: b.y });
      if (L.cast.includes('lower') && b.a) P.play('dome', dur, m => { m.position.set(b.x, b.y + 0.02, b.z); m.material.color.set('#ffd870'); }, (m, k) => { const s = 2.6 - 1.35 * k; m.scale.set(s, s * 0.9, s); m.rotation.y += 0.015; m.material.opacity = 0.12 + 0.3 * k; });
      if (L.cast.includes('wisps')) for (let i = 0; i < 3; i++) P.play('orb', dur, m => { m.material.color.set(P.colourOf(L.el)); m.scale.setScalar(0.11); }, (m, k) => {
        const q = i * 2.094 + k * dur * 2.6, r = 2.4 * (1 - k) + 0.25, h = 3.2 * (1 - k) + 0.5;
        m.position.set(b.x + Math.cos(q) * r, b.y + h, b.z + Math.sin(q) * r); m.scale.setScalar(0.09 + 0.05 * k); m.material.opacity = 0.9 * Math.min(1, k * 6);
      });
    }
    if (L.cast.includes('well') && ids.length) for (const id of ids) { const b = posOf(id); if (b) try { spellFx?.vortex({ at: V(b.x, b.y, b.z), radius: 1.3, element: 'shadow', ms: Math.max(500, ev.ms || 600) }); } catch {} }
  }

  function landing(ev) {
    const style = reviveStyle(ev), L = REVIVE_LOOK[style], b = posOf(ev.id); if (!b) return;
    stats.lands++; stats.byStyle[style] = (stats.byStyle[style] || 0) + 1;
    const g = V(b.x, b.y, b.z), col = P.colourOf(L.el);
    for (const piece of L.land) {
      try {
        if (piece === 'ring') { P.ring(b.x, b.z, 2.2, L.el, { life: 0.6, y: b.y }); P.ring(b.x, b.z, 1.3, L.el, { life: 0.7, delay: 0.1, opacity: 0.6, y: b.y }); }
        else if (piece === 'column') { spellFx?.pillar({ at: g, radius: 1.3, element: 'holy', ms: 900 }); spellFx?.revive({ at: g }); }
        else if (piece === 'skyLance') { const top = V(b.x + 1.5, b.y + 16, b.z - 1), foot = V(b.x, b.y + 0.2, b.z); P.lance(top, foot, 'holy'); }
        else if (piece === 'flash') { spellFx?.impact({ at: V(b.x, b.y + 0.6, b.z), element: 'holy', crit: true, scale: 1.4, ground: b.y, height: 1.8 }); }
        else if (piece === 'leaves') { spellFx?.heal({ at: g }); P.later(250, () => spellFx?.heal({ at: g })); spellFx?.aoe({ points: [V(b.x, b.y + 0.4, b.z)], element: 'nature', stagger: 0, ground: b.y }); }
        else if (piece === 'mend') { for (let i = 1; i <= 5; i++) P.later(i * 1100, () => { const q = posOf(ev.id); if (q && !q.a.dead) spellFx?.heal({ at: V(q.x, q.y, q.z) }); }); }
        else if (piece === 'dome') { P.dome(b.a, 'holy', 1.35); P.later(350, () => { const q = posOf(ev.id); if (q) P.dome(q.a, 'holy', 1.35); }); spellFx?.revive({ at: g }); }
        else if (piece === 'shards') { const tos = []; for (let i = 0; i < 6; i++) { const q = i / 6 * Math.PI * 2; tos.push(V(b.x + Math.cos(q) * 0.5, b.y + 2.4 + (i % 2) * 0.6, b.z + Math.sin(q) * 0.5)); } tos.forEach((to, i) => P.shards(V(b.x + (to.x - b.x) * 1.6, b.y + 0.05, b.z + (to.z - b.z) * 1.6), [to], 'shadow', { life: 0.45, width: 0.16 })); }
        else if (piece === 'well') { spellFx?.vortex({ at: g, radius: 1.6, element: 'shadow', ms: 900 }); spellFx?.impact({ at: V(b.x, b.y + 0.5, b.z), element: 'shadow', scale: 1.1, ground: b.y, height: 1.6 }); }
        else if (piece === 'wispsFall') {
          for (let i = 0; i < 3; i++) P.play('orb', 0.55, m => { m.material.color.set(col); m.scale.setScalar(0.13); }, (m, k) => { const q = i * 2.094 + k * 5, r = 0.9 * (1 - k); m.position.set(b.x + Math.cos(q) * r, b.y + 2.6 * (1 - k) + 0.5, b.z + Math.sin(q) * r); m.material.opacity = 0.95 * (1 - k * k * 0.6); });
          P.later(500, () => { spellFx?.impact({ at: V(b.x, b.y + 0.6, b.z), element: 'ice', scale: 0.8, ground: b.y, height: 1.4 }); spellFx?.heal({ at: g, color: 0x8fd0ff }); });
        }
      } catch { /* an effect that cannot draw is not worth a crash */ }
    }
  }

  function onEvent(ev) {
    if (!ev || ev.type !== 'fx') return false;
    if (ev.kind === 'reviveCast') { casting(ev); return true; }
    if (ev.kind === 'revive') { landing(ev); return true; }
    return false;
  }
  return { onEvent, stats };
}
