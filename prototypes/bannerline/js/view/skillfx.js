// Skill and power effects on sim events (stream C). Data: data/skill-fx.json; drawing:
// avatar-3d/js/spellfx-batched.js (BatchedSpellFx: one draw call per sprite texture).
//
//   import { createSkillFx } from './skillfx.js';
//   const sfx3d = await createSkillFx({ scene, camera, actors, tickHz: 20 });  // actors.get(id) -> { x, z, height, group }
//   for (const ev of events) sfx3d.onEvent(ev);      // cast, bolt, zone, zoneEnd, pulse, dash, trap, power, powerHit, status, heal, hit (crit), form
//   sfx3d.update(dt)                                 // every frame
//   sfx3d.setCamera(camera)                          // sprites face this camera (split screen: the first viewport's)
//   sfx3d.dispose()
//
// Every hero skill (including the Druid's wolf abilities and the Engineer's kit) and every Sanctum
// power has a recipe; an unknown skill falls back to its shape + element, so nothing is invisible.
// This draws the SPELL, not the gameplay marker: js/view/fx.js (stream B) keeps drawing zone
// footprints and rings, this adds fire, frost, light and leaves on top.

import * as THREE from 'three';
import { BatchedSpellFx } from '../../../../avatar-3d/js/spellfx-batched.js';
import { Assets } from '../../../../assets/js/assets.js';

const here = p => new URL(p, import.meta.url).href;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function createSkillFx({ scene, camera, actors = null, tickHz = 20, scale = 2.2, table = null, heroes = null, textures = null, maxParticles = 700, maxLive = 90 } = {}) {
  const T = table || await (await fetch(here('../../data/skill-fx.json'))).json();
  const H = heroes || await (await fetch(here('../../data/heroes.json'))).json().catch(() => ({ skills: {} }));
  const tex = textures || await (await Assets.open(here('../../../../assets/'))).fxTextures(THREE, { size: 128 });
  const fx = new BatchedSpellFx(scene, { camera, textures: tex, scale, maxParticles, maxLive });
  const warnRoot = new THREE.Group(); warnRoot.name = 'skillfx-warn'; scene.add(warnRoot);
  const timers = [];            // { left, every, acc, fn }
  const zones = new Map();      // zone id -> { stop() }
  const auras = new Map();      // entity id -> Set(status)
  const el = name => T.dmgElements?.[name] || name || 'physical';
  const skillOf = id => H.skills?.[id] || {};

  const ent = id => (id != null && id >= 0 && actors?.get) ? actors.get(id) : null;
  const ground = (x, z, y = 0.1) => V(x, y, z);
  function atOf(r, ev, casterId) {
    if (r.at === 'caster') { const a = ent(casterId ?? ev.id); if (a) return ground(a.x, a.z); }
    if (r.at === 'target') { const a = ent(ev.dst); if (a) return ground(a.x, a.z, (a.height || 1.2) * 0.6); }
    return ground(ev.x ?? ev.toX ?? 0, ev.z ?? ev.toZ ?? 0);
  }
  const radiusOf = (r, ev) => r.radius === 'event' ? (ev.radius || ev.reach || 3) : (r.radius ?? 3);
  function circle(at, radius, n = 12, arc = null, face = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = arc ? face - arc / 2 + arc * (i / (n - 1)) : i / n * Math.PI * 2;
      pts.push(V(at.x + Math.sin(a) * radius, at.y + 0.2, at.z + Math.cos(a) * radius));
    }
    return pts;
  }
  /** A pulsing red ring on the ground for `ms` (the "it lands here" warning for delayed blasts). */
  function warn(at, radius, ms, color = '#ff5a3a') {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 64), mat); m.rotation.x = -Math.PI / 2; m.position.set(at.x, 0.12, at.z);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat.clone()); fill.rotation.x = -Math.PI / 2; fill.position.set(at.x, 0.11, at.z); fill.material.opacity = 0.1;
    warnRoot.add(m, fill);
    const life = ms / 1000; let t = 0;
    timers.push({ left: life, every: 0, acc: 0, fn: dt => { t += dt; const k = t / life; mat.opacity = 0.35 + 0.35 * Math.sin(t * 14); fill.scale.setScalar(Math.min(1, k)); }, end: () => { warnRoot.remove(m, fill); m.geometry.dispose(); fill.geometry.dispose(); mat.dispose(); fill.material.dispose(); } });
  }
  function every(seconds, period, fn) { const t = { left: seconds, every: period, acc: period, fn: null, tick: fn }; timers.push(t); return { stop() { t.left = 0; } }; }

  /** Run one recipe. `ctx`: { ev, element, casterId, life (s) }. */
  function play(r, ctx) {
    const { ev } = ctx, element = el(r.element || ctx.element), at = atOf(r, ev, ctx.casterId);
    const ms = r.ms ?? (ctx.life ? ctx.life * 1000 : 700);
    switch (r.fx) {
      case 'cast': return fx.cast({ at, element, ms: r.ms ?? 380 });
      case 'flare': return fx.cast({ at, element, ms: 420 * (r.scale || 1) });
      case 'impact': return fx.impact({ at: at.clone().setY(at.y + 0.6), element, crit: !!r.crit, scale: r.scale || 1 });
      case 'heal': return fx.heal({ at, color: r.color ? new THREE.Color(r.color).getHex() : undefined });
      case 'ring': { const rad = radiusOf(r, ev); return fx.aoe({ points: circle(at, rad, Math.max(6, Math.round(rad * 2.2)), r.arc ? (ev.arc || 2) : null, ev.face || 0), element, stagger: 0.02 }); }
      case 'pillar': return fx.pillar({ at, radius: radiusOf(r, ev), element, ms });
      case 'vortex': return fx.vortex({ at, radius: radiusOf(r, ev), element, ms });
      case 'storm': return fx.storm({ at, radius: radiusOf(r, ev), element, ms });
      case 'warn': return warn(at, radiusOf(r, ev), r.ms ?? ((ev.delay || 30) / tickHz * 1000));
      case 'breath': { const a = ent(ctx.casterId ?? ev.id); if (!a) return; const f = ev.face || 0; return fx.breath({ from: V(a.x, (a.height || 1.4) * 0.6, a.z), dir: V(Math.sin(f), 0, Math.cos(f)), length: r.length || 7, arc: r.arc || 0.9, element, ms: r.ms || 300 }); }
      case 'status': { const a = ent(ctx.casterId ?? ev.id); if (!a?.group) return; fx.status(a.group, r.status, true); timers.push({ left: r.seconds || 2, every: 0, acc: 0, fn: null, end: () => { if (!auras.get(ev.id)?.has(r.status)) fx.status(a.group, r.status, false); } }); return; }
      case 'footfalls': {
        // along a dash (fromX..toX), or along a line zone (length along face), else a ring of prints
        if (ev.fromX != null) { const n = Math.max(3, Math.round(Math.hypot(ev.toX - ev.fromX, ev.toZ - ev.fromZ) / 1.2)); const yaw = Math.atan2(ev.toX - ev.fromX, ev.toZ - ev.fromZ); for (let i = 0; i <= n; i++) fx.footfall({ at: ground(ev.fromX + (ev.toX - ev.fromX) * i / n, ev.fromZ + (ev.toZ - ev.fromZ) * i / n), element, yaw }); return; }
        const len = ev.length || 0, f = ev.face || 0, rad = ev.radius || 1.5;
        const drop = () => { const u = (Math.random() - 0.5) * len, w = (Math.random() - 0.5) * rad * 1.6; fx.footfall({ at: ground(ev.x + Math.sin(f) * u + Math.cos(f) * w, ev.z + Math.cos(f) * u - Math.sin(f) * w), element, size: 0.7 }); };
        if (ctx.life) return every(ctx.life, r.every || 0.4, () => { for (let i = 0; i < Math.max(2, Math.round(len / 2)); i++) drop(); });
        for (let i = 0; i < 6; i++) drop(); return;
      }
      default: return;
    }
  }
  const run = (list, ctx) => { for (const r of list || []) { try { const out = play(r, ctx); if (ctx.collect && out?.stop) ctx.collect.push(out); } catch (e) { console.warn('skillfx', r.fx, e.message); } } };

  function recipesFor(skillId, part) {
    const row = T.skills?.[skillId];
    if (row?.[part]) return row[part];
    if (part === 'cast' && !row) return T.default?.[skillOf(skillId).shape] || null;
    return null;
  }

  const api = {
    fx,
    setCamera(c) { fx.camera = c; if (fx.setCamera) fx.setCamera(c); },
    onEvent(ev) {
      switch (ev.type) {
        case 'cast': run(recipesFor(ev.skill, 'cast'), { ev, element: skillOf(ev.skill).element, casterId: ev.id }); break;
        case 'bolt': {
          const b = T.skills?.[ev.skill]?.bolt || { element: skillOf(ev.skill).element };
          const from = V(ev.fromX, 1.3, ev.fromZ), dst = ent(ev.dst), to = dst ? V(dst.x, (dst.height || 1.2) * 0.6, dst.z) : V(ev.toX, 1.0, ev.toZ);
          const ms = Math.max(80, (ev.ticks || 4) / tickHz * 1000);
          fx.projectile({ from, to, element: el(b.element), ms }).then(() => { const d = ent(ev.dst); fx.impact({ at: d ? V(d.x, (d.height || 1.2) * 0.6, d.z) : to, element: el(b.element) }); });
          break;
        }
        case 'zone': {
          const list = recipesFor(ev.skill, 'zone') || (ev.power ? null : null);
          if (!list) break;
          const collect = [];
          run(list, { ev, element: ev.dmgType || skillOf(ev.skill).element, life: (ev.ticks || 40) / tickHz, collect });
          zones.set(ev.zone, { stop() { for (const c of collect) c.stop(); } });
          break;
        }
        case 'zoneEnd': zones.get(ev.zone)?.stop(); zones.delete(ev.zone); break;
        case 'pulse': run(recipesFor(ev.skill, 'pulse') || [{ fx: 'ring', at: 'point', radius: 'event' }], { ev, element: skillOf(ev.skill).element }); break;
        case 'dash': run(recipesFor(ev.skill, 'dash') || T.default.dash, { ev: { ...ev, x: ev.toX, z: ev.toZ }, element: skillOf(ev.skill).element, casterId: ev.id }); break;
        case 'trap': run(T.skills?.shrapnel_mine?.trap, { ev, element: 'physical' }); break;
        case 'power': run(T.powers?.[ev.power]?.cast, { ev, element: 'arcane' }); break;
        case 'powerHit': run(T.powers?.[ev.power]?.land, { ev, element: 'fire' }); break;
        case 'form': { const a = ent(ev.id); if (a) { fx.cast({ at: ground(a.x, a.z), element: 'nature', ms: 600 }); fx.impact({ at: V(a.x, 0.8, a.z), element: 'nature', scale: 1.4 }); } break; }
        case 'heal': { const a = ent(ev.dst); if (a && ev.amount > 20) fx.heal({ at: ground(a.x, a.z) }); break; }
        case 'hit': { if (!ev.crit && !ev.skill) break; const a = ent(ev.dst); if (a) fx.impact({ at: V(a.x, (a.height || 1.2) * 0.6, a.z), element: el(ev.dmgType), crit: !!ev.crit, scale: ev.crit ? 1.2 : 0.8 }); break; }
        case 'status': {
          const aura = T.statuses?.[ev.status]; const a = ent(ev.id); if (!aura || !a?.group) break;
          if (!auras.has(ev.id)) auras.set(ev.id, new Set());
          const set = auras.get(ev.id);
          if (ev.on) { set.add(ev.status); fx.status(a.group, aura, true); }
          else { set.delete(ev.status); if (![...set].some(s => T.statuses[s] === aura)) fx.status(a.group, aura, false); }
          break;
        }
        case 'remove': case 'death': { const a = ent(ev.id); if (a?.group) fx.clearStatuses?.(a.group); auras.delete(ev.id); break; }
        default: break;
      }
    },
    update(dt) {
      fx.update(dt);
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i]; t.left -= dt;
        if (t.fn) t.fn(dt);
        if (t.tick) { t.acc += dt; while (t.acc >= t.every && t.left > 0) { t.acc -= t.every; t.tick(); } }
        if (t.left <= 0) { t.end?.(); timers.splice(i, 1); }
      }
    },
    /** Every skill / power id that has its own recipe (tests + the gallery). */
    ids: () => ({ skills: Object.keys(T.skills || {}), powers: Object.keys(T.powers || {}) }),
    dispose() { for (const t of timers) t.end?.(); timers.length = 0; fx.dispose(); scene.remove(warnRoot); },
  };
  return api;
}
