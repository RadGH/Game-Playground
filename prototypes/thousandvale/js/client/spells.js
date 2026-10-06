// Spell effects in the world (play-test P20). The rules (stream C) already describe every skill as it happens —
// `cast {s, skill, aim}`, `fx {kind:'bolt'|'arrow'|'shot', from, to, ms}`, `fx {kind:'burst', x, z, r}`,
// `fx {kind:'pool'|'place', …, seconds}`, `fx {kind:'arc'|'link'|'status'|'impact'|'orbs'|'wall'|…}`, and
// `hit {s, d, el, skill}` — and the client drew none of it, so a Gnawing Dark left no mark at all. This module
// turns those events into avatar-3d's SpellFx (shaped geometry + sprites, the same module Farhold uses):
//
//   cast   -> the skill's look (spell-looks.js): a flash at the hand, a rune circle, a slash arc, a ring around
//             the caster, a column of light at the aim, a beam, a dash trail, a rising buff…
//   bolt / arrow / shot -> a projectile that flies the server's own flight time and bursts on arrival
//   hit    -> an on-hit impact in the hit's element on whatever was struck (every hit, every element)
//   status -> a looping aura on the body while it lasts (gnawed = a shadow curse at the feet, burn, root…)
//
//   const spells = createSpells(scene, { camera, renderer, actors, groundY, skillOf })
//   spells.onEvent(ev, selfId)      // every ev from the server (main.js routes cast/hit/fx here)
//   spells.update(dt)

import * as THREE from 'three';
import { SpellFx } from '../../../../avatar-3d/js/spellfx.js';
import { Assets } from '../../../../assets/js/assets.js';
import { skillLook, statusLook, elementOf } from './spell-looks.js';
import { perf } from './perf.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createSpells(scene, { camera, renderer = null, actors, groundY = () => 0, skillOf = () => null, quality = 'high', lights = null } = {}) {
  const fx = new SpellFx(scene, { camera, scale: 1.15, maxParticles: quality === 'low' ? 120 : 260, maxLive: quality === 'low' ? 20 : 40 });
  let ready = false;
  Assets.open(new URL('../../../../assets/', import.meta.url).href)
    .then(a => a.fxTextures(THREE, { size: quality === 'low' ? 64 : 128 }))
    .then(t => { fx.setTextures(t); ready = true; return renderer ? perf.span('spells:warm', () => fx.warm(renderer, camera)) : null; })
    .catch(() => { ready = true; /* geometry only still reads */ });

  const looks = new Map();
  const lookOf = id => { if (!id || id === 'basic' || id === 'dot') return null; if (!looks.has(id)) { const sk = skillOf(id); looks.set(id, sk ? skillLook(id, sk) : null); } return looks.get(id); };
  const lingering = new Map();     // placed obj id -> { until }
  let seenSpellFx = false, seenImpacts = false;   // C's richer events, once seen, replace the client's own guesses
  const stats = { casts: 0, projectiles: 0, impacts: 0, areas: 0, statuses: 0, unknown: 0 };

  const actorAt = id => (id != null ? actors.get(id) : null);
  const chest = a => V(a.pos.x, a.pos.y + Math.max(0.5, a.height * 0.6), a.pos.z);
  const feet = (x, z) => V(x, groundY(x, z) + 0.05, z);
  const pointOf = p => (p && typeof p === 'object' ? feet(p.x, p.z).add(V(0, 1, 0)) : null);
  /** Where a `to` field points: an entity id (its chest, now) or a point (a metre above the ground there). */
  const target = to => { if (to == null) return null; if (typeof to === 'object') return pointOf(to); const a = actorAt(to); return a ? chest(a) : null; };
  const g = p => groundY(p.x, p.z);

  function impactAt(p, element, { scale = 1, crit = false } = {}) {
    if (!p) return;
    stats.impacts++;
    fx.impact({ at: p, element, crit, scale, ground: g(p), height: 1.8 });
  }

  function projectile(from, to, element, { ms = null, body = null, crit = false, onLand = null } = {}) {
    if (!from || !to) return;
    stats.projectiles++;
    const p = fx.projectile({ from, to, element, shape: body, ms: ms != null ? Math.max(90, ms) : null, crit });
    if (onLand) Promise.resolve(p).then(onLand, onLand);
  }

  function ringPoints(c, r, n = 10, y = null) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; out.push(V(x, (y ?? groundY(x, z)) + 0.6, z)); }
    return out;
  }
  function fillPoints(c, r, n = 7) {
    const out = [V(c.x, g(c) + 0.6, c.z)];
    for (let i = 0; i < n; i++) { const a = i * 2.39996, d = r * Math.sqrt((i + 1) / (n + 1)); const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; out.push(V(x, groundY(x, z) + 0.6, z)); }
    return out;
  }
  function arcPoints(c, yaw, r, arc, n = 6) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = yaw + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc); const x = c.x + Math.sin(a) * r * 0.75, z = c.z + Math.cos(a) * r * 0.75; out.push(V(x, groundY(x, z) + 0.9, z)); }
    return out;
  }

  /** Draw a look's ground part at `c` (facing `yaw`). */
  function area(L, c, yaw, { lingerMs = 0 } = {}) {
    const A = L.area; if (!A) return;
    stats.areas++;
    const el = L.element, r = Math.max(1, Math.min(14, A.r || 3));
    const at = V(c.x, g(c) + 0.05, c.z);
    switch (A.kind) {
      case 'ring': for (let k = 0; k < (A.pulses || 1); k++) setTimeout(() => fx.aoe({ points: ringPoints(c, r * (0.6 + 0.4 * ((k + 1) / (A.pulses || 1))), A.soft ? 8 : 12), element: el, stagger: 0.02, ground: at.y }), k * 260); break;
      case 'fill': fx.aoe({ points: fillPoints(c, r, 8), element: el, stagger: 0.04, ground: at.y }); break;
      case 'burst': fx.aoe({ points: fillPoints(c, r, 5), element: el, stagger: 0.02, ground: at.y }); impactAt(V(c.x, at.y + 0.8, c.z), el, { scale: Math.min(2.2, 0.7 + r * 0.18), crit: true }); break;
      case 'slash': for (let k = 0; k < (A.hits || 1); k++) setTimeout(() => fx.aoe({ points: arcPoints(c, yaw + (k % 2 ? 0.25 : -0.25), r, A.arc || 1.6, A.heavy ? 7 : 5), element: el, stagger: 0.025, ground: at.y }), k * 140); break;
      case 'line': {
        const len = Math.min(30, A.len || 10), pts = [];
        for (let i = 1; i <= 6; i++) { const d = (i / 6) * len, x = c.x + Math.sin(yaw) * d, z = c.z + Math.cos(yaw) * d; pts.push(V(x, groundY(x, z) + 0.8, z)); }
        fx.aoe({ points: pts, element: el, stagger: 0.03, ground: at.y });
        break;
      }
      case 'pillar': fx.pillar({ at, radius: r, element: el, ms: 700 }); break;
      case 'storm': fx.storm({ at, radius: r, element: el, ms: Math.max(1200, Math.min(6000, lingerMs || 2400)) }); break;
      case 'vortex': fx.vortex({ at, radius: r, element: el, ms: Math.max(1000, Math.min(6000, lingerMs || 1800)) }); break;
      default: fx.aoe({ points: fillPoints(c, r, 5), element: el, ground: at.y });
    }
    if (A.repeats > 1) for (let k = 1; k < A.repeats; k++) setTimeout(() => fx.aoe({ points: fillPoints(c, r, 4), element: el, stagger: 0.03, ground: at.y }), k * 420);
  }

  /** `cast {s, skill, aim}` — the skill starting. */
  function onCast(ev) {
    const L = lookOf(ev.skill);
    const a = actorAt(ev.s);
    if (!L || !a) { if (ev.skill && ev.skill !== 'basic' && !L) stats.unknown++; return; }
    stats.casts++;
    const el = L.element, hand = chest(a);
    const aim = ev.aim ? { x: ev.aim.x, z: ev.aim.z } : (ev.target != null && actorAt(ev.target) ? actorAt(ev.target).pos : { x: a.pos.x + Math.sin(a.yaw) * 4, z: a.pos.z + Math.cos(a.yaw) * 4 });
    const yaw = Math.atan2(aim.x - a.pos.x, aim.z - a.pos.z);
    const ground = g(a.pos);
    switch (L.cast) {
      case 'hand': fx.cast({ at: hand, element: el, ms: 300, ground }); break;
      case 'circle': fx.cast({ at: hand, element: el, ms: 520, ground }); break;
      case 'summon': fx.cast({ at: hand, element: el, ms: 700, ground }); fx.pillar({ at: V(a.pos.x + Math.sin(yaw) * 2, ground, a.pos.z + Math.cos(yaw) * 2), radius: 1.2, element: el, ms: 800 }); break;
      case 'heal': fx.cast({ at: hand, element: el === 'physical' ? 'holy' : el, ms: 600, ground }); impactAt(hand, el === 'physical' ? 'holy' : el, { scale: 0.7 * L.scale }); break;
      case 'form': fx.pillar({ at: V(a.pos.x, ground, a.pos.z), radius: 1.4, element: el, ms: 650 }); break;
      case 'aura': {
        fx.cast({ at: hand, element: el, ms: 450, ground });
        if (L.pattern === 'ring' || L.pattern === 'burst') fx.aoe({ points: ringPoints(a.pos, 1.6, L.pattern === 'ring' ? 10 : 6), element: el, stagger: 0.02, ground });
        else if (L.pattern === 'spiral') fx.vortex({ at: V(a.pos.x, ground, a.pos.z), radius: 1.6, element: el, ms: 700 });
        else impactAt(V(a.pos.x, ground + 1.2, a.pos.z), el, { scale: 0.6 * L.scale });
        break;
      }
      default: break;
    }
    if (L.status && (L.shape === 'self' || L.cast === 'aura' || L.cast === 'heal')) { const h = fx.status(a.group, L.status, true); if (h) setTimeout(() => fx.status(a.group, L.status, false), 4000); }
    // travel the rules do not describe on their own (a beam, a dash), and ground parts at the aim / around you
    if (L.travel?.kind === 'beam') {
      const to = target(ev.target) || V(aim.x, g(aim) + 1, aim.z);
      if (el === 'lightning' || el === 'arcane') projectile(hand, to, el, { body: 'bolt', ms: 90 });
      else fx.breath({ from: hand, dir: V(to.x - hand.x, 0, to.z - hand.z), length: Math.min(30, hand.distanceTo(to) + 1), arc: 0.18, element: el, ms: 380 });
    }
    if (L.travel?.kind === 'dash') {
      for (let i = 0; i < 5; i++) { const x = a.pos.x + Math.sin(yaw) * i * 1.4, z = a.pos.z + Math.cos(yaw) * i * 1.4; setTimeout(() => fx.footfall({ at: V(x, groundY(x, z), z), element: el, yaw }), i * 45); }
    }
    if (L.area && !seenSpellFx) {
      if (L.shape === 'ground') area(L, aim, yaw);
      else if (L.shape === 'around' || L.shape === 'self') area(L, a.pos, yaw);
      else if (L.shape === 'melee') area(L, a.pos, yaw);
      else if (L.shape === 'dash') setTimeout(() => { const b = actorAt(ev.s); if (b) area(L, b.pos, yaw); }, 260);
      else if (L.shape === 'beam') area(L, a.pos, yaw);
    }
  }

  /** `fx {kind, …}` from the rules. */
  function onFx(ev) {
    const a = actorAt(ev.id);
    const el = elementOf(ev.element || ev.el || (ev.kind === 'arrow' || ev.kind === 'shot' ? 'physical' : 'arcane'));
    switch (ev.kind) {
      case 'bolt': case 'arrow': case 'shot': {
        const L = lookOf(ev.skill);
        const from = ev.from ? V(ev.from.x, g(ev.from) + (a ? Math.max(0.5, a.height * 0.6) : 1.1), ev.from.z) : a ? chest(a) : null;
        const to = target(ev.to);
        const n = L?.travel?.count || 1;
        for (let k = 0; k < n; k++) {
          const off = n > 1 ? (k / (n - 1) - 0.5) * 1.2 : 0;
          const end = to && off ? to.clone().add(V(Math.cos(off) * off, 0, Math.sin(off) * off)) : to;
          const body = L?.travel?.body || (ev.kind === 'bolt' ? null : 'arrow');
          projectile(from, end, el, { ms: ev.ms, body, onLand: () => { const p = target(ev.to) || end; impactAt(p, el, { scale: L ? L.scale : 0.7 }); if (L?.area?.kind === 'burst') area(L, p, 0); } });
        }
        break;
      }
      case 'burst': { const c = { x: ev.x ?? a?.pos.x, z: ev.z ?? a?.pos.z }; if (c.x == null) break; area({ element: el, area: { kind: 'burst', r: ev.r || 3 } }, c, 0); break; }
      case 'pool': case 'place': {
        const c = { x: ev.x, z: ev.z }; if (c.x == null) break;
        const L = { element: el, area: { kind: el === 'ice' || el === 'lightning' ? 'storm' : 'vortex', r: ev.r || 3 } };
        const ms = Math.min(6000, (ev.seconds || 2) * 1000);
        area(L, c, 0, { lingerMs: ms });
        if (ev.obj != null) lingering.set(ev.obj, performance.now() + ms);
        break;
      }
      case 'unplace': lingering.delete(ev.obj); break;
      case 'arc': case 'link': case 'linkShare': {
        const from = ev.from ? V(ev.from.x, g(ev.from) + 1.1, ev.from.z) : a ? chest(a) : null;
        projectile(from, target(ev.to), ev.kind === 'arc' ? el : 'arcane', { body: 'bolt', ms: 90 });
        break;
      }
      case 'impact': {
        if (!a) break;
        if (ev.el || ev.ab) seenImpacts = true;           // C sends one per landed hit (with el/ab): onHit stops doubling it
        const L = lookOf(ev.ab);
        impactAt(chest(a), ev.el || ev.element ? elementOf(ev.el || ev.element) : L ? L.element : 'physical', { crit: !!ev.crit, scale: (ev.killed ? 1.2 : 0.8) * (L ? L.scale : 1) });
        break;
      }
      case 'spell': {
        // C's per-cast description (exact place, radius, line, delay): the ground part of the look is drawn from it
        seenSpellFx = true;
        const L0 = lookOf(ev.ab) || { element: elementOf(ev.el), area: null, shape: ev.shape };
        const L = { ...L0, element: ev.el ? elementOf(ev.el) : L0.element };
        if (!L.area && ['ground', 'around', 'melee'].includes(ev.shape)) L.area = { kind: ev.shape === 'melee' ? 'slash' : ev.shape === 'around' ? 'ring' : 'burst', r: ev.r || 3 };
        if (!L.area) break;
        const ar = { ...L.area, r: ev.r || ev.reach || L.area.r, arc: ev.arc || L.area.arc, len: ev.line?.len || L.area.len, repeats: ev.n || L.area.repeats };
        const c = ev.to ? { x: ev.to.x, z: ev.to.z } : { x: ev.x ?? a?.pos.x, z: ev.z ?? a?.pos.z };
        if (c.x == null) break;
        const yaw = ev.yaw ?? (a ? Math.atan2(c.x - a.pos.x, c.z - a.pos.z) : 0);
        const at = L.shape === 'melee' || L.shape === 'around' ? (a ? a.pos : c) : c;
        if (ev.ms > 0) {                                   // a delayed blast: mark the spot, then go off
          fx.cast({ at: V(at.x, g(at) + 0.2, at.z), element: L.element, ms: Math.min(3000, ev.ms), ground: g(at) });
          setTimeout(() => area({ ...L, area: ar }, at, yaw), Math.min(4000, ev.ms));
        } else area({ ...L, area: ar }, at, yaw);
        break;
      }
      case 'status': {
        if (!a) break;
        const s = statusLook(ev.status) || String(ev.status || '');
        if (!s) break;
        stats.statuses++;
        fx.status(a.group, s, ev.on !== false);
        break;
      }
      case 'orbs': if (a) for (let i = 0; i < Math.min(6, ev.count || 3); i++) setTimeout(() => { const b = actorAt(ev.id); if (b) impactAt(V(b.pos.x + Math.cos(i * 2.1) * 1.2, b.pos.y + 1.3, b.pos.z + Math.sin(i * 2.1) * 1.2), el, { scale: 0.45 }); }, i * 120); break;
      case 'wall': { const c = { x: ev.x, z: ev.z }; if (c.x != null) area({ element: el === 'arcane' ? 'nature' : el, area: { kind: ev.ring ? 'ring' : 'line', r: 4, len: 8 } }, c, a ? a.yaw + Math.PI / 2 : 0); break; }
      case 'taunt': if (a) fx.aoe({ points: ringPoints(a.pos, 3.5, 10), element: 'physical', stagger: 0.015, ground: g(a.pos) }); break;
      case 'empower': if (a) fx.cast({ at: chest(a), element: 'arcane', ms: 400, ground: g(a.pos) }); break;
      case 'afterimage': if (ev.x != null) fx.footfall({ at: feet(ev.x, ev.z), element: 'shadow' }); break;
      case 'summon': case 'companion': if (a) fx.pillar({ at: V(a.pos.x, g(a.pos), a.pos.z), radius: 1.2, element: 'arcane', ms: 800 }); break;
      case 'form': if (a) fx.pillar({ at: V(a.pos.x, g(a.pos), a.pos.z), radius: 1.5, element: 'nature', ms: 700 }); break;
      case 'modifier': if (a) fx.cast({ at: chest(a), element: 'shadow', ms: 600, ground: g(a.pos) }); break;
      default: break;
    }
  }

  /** `hit` — every blow lands with something in its element (on-hit collision), basic swings included. */
  function onHit(ev) {
    if (ev.kind === 'heal') { const d = actorAt(ev.d); if (d && ev.n > 0) impactAt(chest(d), 'holy', { scale: 0.45 }); return; }
    if (ev.kind !== 'dmg' && ev.kind !== undefined) return;
    const d = actorAt(ev.d); if (!d) return;
    if (ev.skill === 'dot') { for (const s of ['curse', 'burn', 'poison', 'bleed']) fx.pulseStatus(d.group, s); return; }
    if (!ev.el || seenImpacts) return;  // physical swings already burst sparks (fx.js); elements get their own (unless C's fx impact does)
    impactAt(chest(d), elementOf(ev.el), { scale: ev.crit ? 0.9 : 0.6, crit: !!ev.crit });
  }

  function onEvent(ev) {
    try {
      if (ev.type === 'cast') onCast(ev);
      else if (ev.type === 'fx') onFx(ev);
      else if (ev.type === 'hit') onHit(ev);
    } catch (e) { console.warn('[spells]', ev.type, ev.kind || ev.skill, e.message); }
  }

  /**
   * Client-only: play a skill the way the server would describe it (cast, then the bolt/arrow fx for a bolt, then
   * the hit and its status) from `casterId` at `targetId`. tv.demoSpells() uses it for screenshots and the audit.
   */
  function demo(skillId, casterId, targetId) {
    const L = lookOf(skillId), a = actorAt(casterId), t = actorAt(targetId);
    if (!L || !a) return false;
    const aim = t ? { x: t.pos.x, z: t.pos.z } : { x: a.pos.x + Math.sin(a.yaw) * 6, z: a.pos.z + Math.cos(a.yaw) * 6 };
    onEvent({ type: 'cast', s: casterId, skill: skillId, aim, target: targetId });
    const ms = Math.max(120, Math.hypot(aim.x - a.pos.x, aim.z - a.pos.z) / 30 * 1000);
    if (L.travel?.kind === 'projectile') onEvent({ type: 'fx', kind: 'bolt', id: casterId, skill: skillId, element: L.element, from: { x: a.pos.x, z: a.pos.z }, to: t ? targetId : aim, ms });
    if (t && L.shape !== 'self' && L.shape !== 'summon') setTimeout(() => {
      onEvent({ type: 'hit', s: casterId, d: targetId, n: 10, el: L.element !== 'physical' ? L.element : undefined, kind: 'dmg', skill: L.shape });
      if (L.status) { onEvent({ type: 'fx', kind: 'status', id: targetId, status: L.status, on: true }); setTimeout(() => onEvent({ type: 'fx', kind: 'status', id: targetId, status: L.status, on: false }), 3000); }
    }, L.travel?.kind === 'projectile' ? ms : 120);
    return true;
  }

  return {
    fx, onEvent, lookOf, stats, demo, get ready() { return ready; },
    update(dt) {
      fx.update(dt);
      if (lights) lights.setTransient(fx.lights(3));
    },
    /** Remove a body's auras (it left, died or changed room). */
    clearBody(group) { if (group) fx.clearStatus(group); },
  };
}
