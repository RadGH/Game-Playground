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
import { createBeams } from './beam-fx.js';                       // Y20: a held, pulsing beam (Storm Beam)
import { carriedBy, zoneDrawMs, carryOffset } from './zone-follow.js';   // Y25: zones that ride their owner
import { drawFor, FX_DEFAULT } from './fx-level.js';
import { fanSide } from './projectile-kinds.js';
import { starTint } from './star-looks.js';                         // round 11: the Star Blade's arcane drawn gold                    // Z39: a fan's bolts each fly their own side                // 2026-10-14: Settings → Graphics → Spell effects

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createSpells(scene, { camera, renderer = null, actors, groundY = () => 0, skillOf = () => null, quality = 'high', lights = null, shots = null, stars = null, level = FX_DEFAULT, focus = () => ({}) } = {}) {
  // `quiet`: drawing an event at the 'flight' level (Spell effects Reduced for others' spells, or Off) — the projectile
  // still flies (you must see what is coming at you), nothing else is drawn
  let quiet = false;
  const fx = new SpellFx(scene, { camera, scale: 1.15, maxParticles: quality === 'low' ? 120 : 260, maxLive: quality === 'low' ? 20 : 40 });
  let ready = false;
  Assets.open(new URL('../../../../assets/', import.meta.url).href)
    .then(a => a.fxTextures(THREE, { size: quality === 'low' ? 64 : 128 }))
    .then(t => { fx.setTextures(t); ready = true; return renderer ? perf.span('spells:warm', () => fx.warm(renderer, camera, { draw: true }))      /* 2026-10-20: drawn once too (Windows) */ : null; })
    .catch(() => { ready = true; /* geometry only still reads */ });

  const looks = new Map();
  const lookOf = id => { if (!id || id === 'basic' || id === 'dot') return null; if (!looks.has(id)) { const sk = skillOf(id); looks.set(id, sk ? skillLook(id, sk) : null); } return looks.get(id); };
  const lingering = new Map();     // placed obj id -> { until }
  // play-test 6 (U3): ground zones that can be taken away early. key -> { src (caster id), entries: SpellFx live entries }
  const zones = new Map();
  let zoneSeq = 0;
  /** Run `draw()` and remember what it added to SpellFx, so the zone can be ended before its own time is up. */
  function trackZone(key, src, ms, draw) {
    const before = new Set(fx.live);
    draw();
    const entries = fx.live.filter(e => !before.has(e));
    let rec = null;
    if (entries.length) zones.set(key ?? 'z' + (++zoneSeq), rec = { src: src ?? null, entries, until: performance.now() + ms + 2500 });
    if (zones.size > 60) for (const [k, z] of zones) if (z.until < performance.now()) zones.delete(k);
    return rec;
  }
  // Y25: a zone that rides somebody (`fx place {follow: <entity id>}`): everything it drew is shifted, every frame, by
  // how far that body has moved from the spot it was cast on (its effects are built in world coordinates round that spot)
  let carried = 0;
  function carry(rec, id, c) { if (!rec || id == null) return; rec.follow = { id, base: { x: c.x, y: groundY(c.x, c.z), z: c.z } }; carried++; stats.carried = (stats.carried || 0) + 1; }
  function moveCarried() {
    if (!carried) return;
    let n = 0;
    for (const [k, z] of zones) {
      if (!z.follow) continue;
      if (z.entries.every(e => e.ended)) { zones.delete(k); continue; }
      n++;
      const a = actorAt(z.follow.id); if (!a) continue;          // out of sight: it stays where it was last seen
      const o = carryOffset(z.follow.base, a.pos, groundY);
      for (const e of z.entries) {
        if (e.ended || !e.obj) continue;
        e.obj.position.set(o.x, o.y, o.z);
        if (e.lightPos) { if (!e.lightBase) e.lightBase = e.lightPos.clone(); e.lightPos.set(e.lightBase.x + o.x, e.lightBase.y + o.y, e.lightBase.z + o.z); }   // its glow goes with it
      }
    }
    carried = n;
  }
  function endZone(key) { const z = zones.get(key); if (!z) return 0; for (const e of z.entries) { try { fx._end(e); } catch {} } zones.delete(key); stats.zonesEnded = (stats.zonesEnded || 0) + 1; return 1; }
  /** U3: every ground zone a body laid down ends with it (its death arrives before the server's own clean-up does). */
  function ownerGone(src) { let n = 0; if (src == null) return n; beams.drop(src); endOrbs?.(src); for (const [k, z] of [...zones]) if (z.src === src) n += endZone(k); return n; }
  let seenSpellFx = false, seenImpacts = false;   // C's richer events, once seen, replace the client's own guesses
  const stats = { casts: 0, projectiles: 0, impacts: 0, areas: 0, statuses: 0, unknown: 0 };

  const actorAt = id => (id != null ? actors.get(id) : null);
  // feedback dev#84 (Storm Orbs, "I don't see the orbs, and the lightning comes from me"): `fx orbs` used to draw three
  // sparks once. The orbs are now drawn circling the caster for as long as they last, and each zap (`fx arc` from that
  // caster) leaves from the orb nearest its target. Six pooled balls made at start and parked out of sight (never hidden:
  // a hidden mesh is compiled on its first show, mid-fight — perf note in docs/perf.md)
  const ORB_COLOR = { lightning: 0xffe860, fire: 0xff7a2a, ice: 0x9ad8ff, shadow: 0x9a6ad8, holy: 0xffe8a0, nature: 0x8ad860, arcane: 0xc08aff, poison: 0x9ad04a };
  const orbGeo = new THREE.IcosahedronGeometry(0.17, 1);
  const orbPool = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffe860, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.scale.setScalar(0.0001); m.position.set(0, -9999, 0); m.frustumCulled = false; m.renderOrder = 5; scene.add(m); return m;
  });
  const orbits = new Map();       // caster id -> { n, until, el, meshes, at: [Vector3] }
  function startOrbs(id, n, seconds, el) {
    endOrbs(id);
    const free = orbPool.filter(m => !m.userData.busy).slice(0, Math.max(1, Math.min(6, n)));
    for (const m of free) { m.userData.busy = true; m.material.color.setHex(ORB_COLOR[el] || ORB_COLOR.lightning); }
    orbits.set(id, { n: free.length, until: performance.now() + Math.min(60000, seconds * 1000), el, meshes: free, at: free.map(() => new THREE.Vector3()), t: 0 });
    stats.orbits = (stats.orbits || 0) + 1;
  }
  function endOrbs(id) { const o = orbits.get(id); if (!o) return; for (const m of o.meshes) { m.userData.busy = false; m.scale.setScalar(0.0001); m.position.set(0, -9999, 0); } orbits.delete(id); }
  function moveOrbs(dt) {
    const now = performance.now();
    for (const [id, o] of orbits) {
      const a = actorAt(id);
      if (!a || a.dead || now > o.until) { endOrbs(id); continue; }
      o.t += dt;
      const h = (a.height || 1.7) * 0.8;
      o.meshes.forEach((m, i) => {
        const ang = o.t * 2.4 + (i / o.n) * Math.PI * 2;
        o.at[i].set(a.pos.x + Math.cos(ang) * 1.05, a.pos.y + h + Math.sin(o.t * 3 + i * 2) * 0.12, a.pos.z + Math.sin(ang) * 1.05);
        m.position.copy(o.at[i]);
        m.scale.setScalar(1 + Math.sin(o.t * 11 + i) * 0.18);      // a crackle
      });
    }
  }
  /** The drawn orb of `id` nearest `to` (a Vector3), or null. */
  function orbNear(id, to) { const o = orbits.get(id); if (!o || !to) return null; let best = null, bd = Infinity; for (const p of o.at) { const d = p.distanceToSquared(to); if (d < bd) { bd = d; best = p; } } return best ? best.clone() : null; }
  const beams = createBeams(scene, { camera, actors, groundY });
  const chest = a => V(a.pos.x, a.pos.y + Math.max(0.5, a.height * 0.6), a.pos.z);
  const feet = (x, z) => V(x, groundY(x, z) + 0.05, z);
  const pointOf = p => (p && typeof p === 'object' ? feet(p.x, p.z).add(V(0, 1, 0)) : null);
  /** Where a `to` field points: an entity id (its chest, now) or a point (a metre above the ground there). */
  const target = to => { if (to == null) return null; if (typeof to === 'object') return pointOf(to); const a = actorAt(to); return a ? chest(a) : null; };
  const g = p => groundY(p.x, p.z);
  // Y32: the Starcaller's gold stars (star-fx.js) are handed every event first, with these so a star leaves the same hand as any shot
  const starCtx = { target, chest, hand: a => shots?.handOf?.(a) || null };

  function impactAt(p, element, { scale = 1, crit = false } = {}) {
    if (!p || quiet) return;
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
    if (stars?.onCast(ev, a, starCtx)) { stats.casts++; return; }       // Y32: a gold glint, not the arcane flash
    if (!L || !a) { if (ev.skill && ev.skill !== 'basic' && !L) stats.unknown++; return; }
    stats.casts++;
    const el = starTint(L.element, { cls: a.look?.cls, skill: ev.skill }), hand = chest(a);
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
    if (stars?.onFx(ev, a, starCtx)) { stats.stars = (stats.stars || 0) + 1; return; }       // Y32: thrown stars, falling stars, star-rune zones, wheeling stars
    const el = starTint(elementOf(ev.element || ev.el || (ev.kind === 'arrow' || ev.kind === 'shot' ? 'physical' : 'arcane')), { cls: a?.look?.cls, skill: ev.skill || ev.ab });   // round 11: a Star Blade's arcane is gold, not violet
    switch (ev.kind) {
      case 'bolt': case 'arrow': case 'shot': case 'thrown': {
        const L = lookOf(ev.skill);
        // play-test 8 (W2/W14): every shot is ONE body that leaves the hand and lands when the rules' damage does
        // (projectiles.js: arrow, quarrel, knife, stone, firebolt…). A skill's own look still decides the burst on arrival.
        if (shots) {
          const to0 = target(ev.to); if (!to0) break;
          const hush = quiet;                               // the landing comes later: remember how this one is drawn
          const follow = typeof ev.to !== 'object' && ev.to != null ? () => target(ev.to) : null;
          // (wrap-up: the rules send ONE event for each projectile of a volley, so one body per event — drawing the look's
          // whole count for each would be nine arrows for a three-arrow shot. Only the client's own demo sends one for all.)
          const n = ev.demo ? (L?.travel?.count || 1) : 1, hop = ev.hop || ev.fromId != null || ev.fork;
          const start = hop && ev.from ? V(ev.from.x, g(ev.from) + 1.1, ev.from.z) : !a && ev.from ? V(ev.from.x, g(ev.from) + 1.1, ev.from.z) : null;
          for (let k = 0; k < n; k++) {
            const off = n > 1 ? (k / (n - 1) - 0.5) * 1.6 : 0;
            const end = off ? to0.clone().add(V(Math.cos(off * 2) * off, 0, Math.sin(off * 2) * off)) : to0;
            stats.projectiles++;
            shots.fire(ev, { to: end, follow: off ? null : follow, from: start, ms: ev.ms, spread: fanSide(ev), onLand: p => {
              if (ev.miss || hush) return;
              impactAt(p, el, { scale: L ? L.scale : ev.kind === 'bolt' ? 0.8 : 0.6 });
              if (L?.area?.kind === 'burst') area(L, p, 0);
            } });
          }
          break;
        }
        const from = ev.from ? V(ev.from.x, g(ev.from) + (a ? Math.max(0.5, a.height * 0.6) : 1.1), ev.from.z) : a ? chest(a) : null;
        const to = target(ev.to);
        const n = L?.travel?.count || 1;
        for (let k = 0; k < n; k++) {
          const off = n > 1 ? (k / (n - 1) - 0.5) * 1.2 : 0;
          const end = to && off ? to.clone().add(V(Math.cos(off) * off, 0, Math.sin(off) * off)) : to;
          const body = L?.travel?.body || (ev.kind === 'bolt' ? null : 'arrow');
          const hush = quiet;
          projectile(from, end, el, { ms: ev.ms, body, onLand: () => { if (hush) return; const p = target(ev.to) || end; impactAt(p, el, { scale: L ? L.scale : 0.7 }); if (L?.area?.kind === 'burst') area(L, p, 0); } });
        }
        break;
      }
      case 'burst': { const c = { x: ev.x ?? a?.pos.x, z: ev.z ?? a?.pos.z }; if (c.x == null) break; area({ element: el, area: { kind: 'burst', r: ev.r || 3 } }, c, 0); break; }
      case 'pool': case 'place': {
        const c = { x: ev.x, z: ev.z }; if (c.x == null) break;
        const L = { element: el, area: { kind: el === 'ice' || el === 'lightning' ? 'storm' : 'vortex', r: ev.r || 3 } };
        const rides = carriedBy(ev), ms = zoneDrawMs(ev);                    // Y25: `follow` = the body it rides
        const rec = trackZone(ev.obj ?? ev.zone ?? null, ev.id ?? ev.s ?? null, ms, () => area(L, c, 0, { lingerMs: ms }));
        if (rides != null) carry(rec, rides, c);
        if (ev.obj != null) lingering.set(ev.obj, performance.now() + ms);
        break;
      }
      case 'unplace': lingering.delete(ev.obj); endZone(ev.obj); break;
      case 'beam': case 'beamPulse': case 'beamEnd': beams.onFx(ev); break;       // Y20: one held beam, a flare per pulse (beam-fx.js)
      // A (round 6): a zone the rules announced, and its end the moment its caster dies or is interrupted
      case 'zone': {
        if (ev.end) { endZone(ev.id); endZone(ev.obj); lingering.delete(ev.obj ?? ev.id); break; }
        if (ev.x == null) break;
        const ms = Math.min(8000, ev.ms || (ev.seconds || 2) * 1000);
        trackZone(ev.id ?? ev.obj ?? null, ev.s ?? null, ms, () => area({ element: el, area: { kind: el === 'ice' || el === 'lightning' ? 'storm' : 'vortex', r: ev.r || 3 } }, { x: ev.x, z: ev.z }, 0, { lingerMs: ms }));
        break;
      }
      case 'arc': case 'link': case 'linkShare': {
        const to = target(ev.to);
        const from = (ev.kind === 'arc' && orbNear(ev.id, to)) || (ev.from ? V(ev.from.x, g(ev.from) + 1.1, ev.from.z) : a ? chest(a) : null);
        projectile(from, to, ev.kind === 'arc' ? el : 'arcane', { body: 'bolt', ms: 90 });
        break;
      }
      case 'impact': {
        if (!a) break;
        if (ev.el || ev.ab) seenImpacts = true;           // C sends one per landed hit (with el/ab): onHit stops doubling it
        if (stars?.onImpact(ev, a, chest(a))) break;       // Y32: a star skill's hit is a gold starburst
        const L = lookOf(ev.ab);
        impactAt(chest(a), starTint(ev.el || ev.element ? elementOf(ev.el || ev.element) : L ? L.element : 'physical', { cls: actorAt(ev.s)?.look?.cls, skill: ev.ab }), { crit: !!ev.crit, scale: (ev.killed ? 1.2 : 0.8) * (L ? L.scale : 1) });
        break;
      }
      case 'spell': {
        // C's per-cast description (exact place, radius, line, delay): the ground part of the look is drawn from it
        seenSpellFx = true;
        if (ev.shape === 'beam' && beams.aim(ev)) break;      // Y20: a pulse of a held beam — the beam itself shows it
        const L0 = lookOf(ev.ab) || { element: elementOf(ev.el), area: null, shape: ev.shape };
        const L = { ...L0, element: starTint(ev.el ? elementOf(ev.el) : L0.element, { cls: a?.look?.cls, skill: ev.ab }) };
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
        if (!a || (a.dead && ev.on !== false)) break;         // Y3: nothing new is drawn on a corpse (the killing blow's own stun arrives after the death)
        const s = statusLook(ev.status) || String(ev.status || '');
        if (!s) break;
        stats.statuses++;
        fx.status(a.group, s, ev.on !== false);
        break;
      }
      case 'orbs': if (a) { startOrbs(ev.id, ev.count || 3, +ev.seconds || 12, el); for (let i = 0; i < Math.min(6, ev.count || 3); i++) setTimeout(() => { const b = actorAt(ev.id); if (b) impactAt(V(b.pos.x + Math.cos(i * 2.1) * 1.2, b.pos.y + 1.3, b.pos.z + Math.sin(i * 2.1) * 1.2), el, { scale: 0.45 }); }, i * 120); } break;
      case 'wall': { const c = { x: ev.x, z: ev.z }; if (c.x != null) area({ element: el === 'arcane' ? 'nature' : el, area: { kind: ev.ring ? 'ring' : 'line', r: 4, len: 8 } }, c, a ? a.yaw + Math.PI / 2 : 0); break; }
      case 'taunt': if (a) fx.aoe({ points: ringPoints(a.pos, 3.5, 10), element: 'physical', stagger: 0.015, ground: g(a.pos) }); break;
      case 'empower': if (a) fx.cast({ at: chest(a), element: 'arcane', ms: 400, ground: g(a.pos) }); break;
      case 'afterimage': if (ev.x != null) fx.footfall({ at: feet(ev.x, ev.z), element: 'shadow' }); break;
      case 'summon': case 'companion': if (a) fx.pillar({ at: V(a.pos.x, g(a.pos), a.pos.z), radius: 1.2, element: 'arcane', ms: 800 }); break;
      case 'form': if (a) fx.pillar({ at: V(a.pos.x, g(a.pos), a.pos.z), radius: 1.5, element: 'nature', ms: 700 }); break;
      case 'modifier': if (a) fx.cast({ at: chest(a), element: 'shadow', ms: 600, ground: g(a.pos) }); break;
      case 'sprint': if (a) fx.footfall({ at: feet(a.pos.x, a.pos.z), element: 'physical' }); break;     // play-test 12 (#75): a monster breaks into a sprint — a kick of dust as it goes
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

  const FLIGHT = new Set(['bolt', 'arrow', 'shot', 'thrown', 'beam', 'beamPulse', 'beamEnd', 'unplace', 'zone']);
  function onEvent(ev) {
    try {
      const how = drawFor(level, ev, focus());
      if (how === 'flight') {
        // only what flies (and a zone's END, so nothing drawn earlier is left behind when the level changes mid-fight)
        if (ev.type !== 'fx' || !FLIGHT.has(ev.kind) || (ev.kind === 'zone' && !ev.end)) return;
        quiet = true;
      }
      if (ev.type === 'cast') onCast(ev);
      else if (ev.type === 'fx') onFx(ev);
      else if (ev.type === 'hit') onHit(ev);
    } catch (e) { console.warn('[spells]', ev.type, ev.kind || ev.skill, e.message); }
    finally { quiet = false; }
  }
  function setLevel(l) { level = l; }

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
    if (L.travel?.kind === 'projectile') onEvent({ type: 'fx', kind: 'bolt', demo: 1, id: casterId, skill: skillId, element: L.element, from: { x: a.pos.x, z: a.pos.z }, to: t ? targetId : aim, ms });
    if (t && L.shape !== 'self' && L.shape !== 'summon') setTimeout(() => {
      onEvent({ type: 'hit', s: casterId, d: targetId, n: 10, el: L.element !== 'physical' ? L.element : undefined, kind: 'dmg', skill: L.shape });
      if (L.status) { onEvent({ type: 'fx', kind: 'status', id: targetId, status: L.status, on: true }); setTimeout(() => onEvent({ type: 'fx', kind: 'status', id: targetId, status: L.status, on: false }), 3000); }
    }, L.travel?.kind === 'projectile' ? ms : 120);
    return true;
  }

  return {
    ownerGone, endZone, zones, beams, orbits, endOrbs,
    fx, onEvent, lookOf, stats, demo, setLevel, get level() { return level; }, get ready() { return ready; },
    update(dt) {
      fx.update(dt);
      moveCarried(); beams.update(dt); moveOrbs(dt);
      if (lights) lights.setTransient(fx.lights(3));
    },
    /** Remove a body's auras (it left, died or changed room). */
    clearBody(group) { if (group) fx.clearStatus(group); },
  };
}
