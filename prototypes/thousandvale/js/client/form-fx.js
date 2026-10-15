// Caster attack FORMS you can tell apart (play-test 5, T15: "a variety of wands and staves with special magic attacks:
// cones, areas, projectiles, beams, forks, shields"), and the sceptre's elemental swing (T16).
//
// Stream C tags every basic attack of a wand / staff / sceptre / focus with `form` — the weapon's `castStyle`:
//   bolt · seeking · heavy          one bolt                      (castForm projectile)
//   burst · lob · nova · pool       something that covers ground  (area)
//   fan · chain · fork              more than one target          (fork)
//   cone                            a cone in front of you        (cone)
//   beam                            an instant line               (beam)
//   ward                            a bolt that shields you       (shield)
// on `cast {slot:0, form}`, `fx {kind:'attack', shape, form, el, x, z, yaw, reach, arc?, r?, to?}`, `fx {kind:'bolt', basic:1,
// form, from, to, ms}` and `fx {kind:'ward', id, amt}`. weapon-fx.js (R5) already draws the hand flash, the cone's breath and the
// nova's ring of bursts, and spells.js flies every bolt; this file adds what makes each form ITS OWN:
//
//   beam    a bright two-layer lance from the hand to the end of its reach, an impact where it stops
//   cone    a fan of light on the ground the length of the cone (so you can see how short it is — T14)
//   nova    a ring racing out from the feet to the nova's radius
//   lob     a high arc, and a ring where it comes down
//   burst   a ring the size of the burst where the bolt lands        pool   a slow second ring that lingers
//   fork    two splinters thrown past the point of impact            chain  arcs jumping to the nearest foes
//   fan     a three-way flare at the hand                            seeking / heavy   a tight spiral / a heavy thump
//   ward    a dome closing round the caster when a hit shields them
//   sceptre the swing leaves a second, wider trail in its element and scatters the element along the arc (T16)
//
// Cost: fixed pools made at start (beam lances, flat fans, rings, a dome), every one a MeshBasicMaterial with exactly the
// settings weapon-fx.js's crescents use — so nothing here adds a shader program (P1: no first-use stutter) or a light.
//
//   const forms = createFormFx(scene, { spellFx: spells.fx, actors, groundY })
//   forms.onEvent(ev)      // every cast / fx event (after weaponFx)
//   forms.update(dt)

import * as THREE from 'three';
import { ELEMENT_COLOUR, elementKey } from './weapon-fx.js';

/** C's castStyle (or F's castForm, or an older shape name) -> the family it is drawn as. Pure. Never null. */
export const FORM_FAMILY = {
  bolt: 'projectile', seeking: 'projectile', heavy: 'projectile', projectile: 'projectile', mortar: 'area',
  burst: 'area', lob: 'area', nova: 'area', pool: 'area', area: 'area', storm: 'area', dome: 'shield',
  fan: 'fork', chain: 'fork', fork: 'fork',
  cone: 'cone', wave: 'cone', jet: 'cone',
  beam: 'beam', ray: 'beam', lance: 'beam',
  ward: 'shield', shield: 'shield', barrier: 'shield', wall: 'shield',
};
/**
 * How one form is drawn. Pure — the test walks every castStyle C lists and every castForm F lists through it.
 * -> { family, draw: [piece…], muzzle } where a piece is one of: lance, fan, ring, arc, splinters, jumps, dome, spiral, thump, flare, linger.
 */
export function formLook(form) {
  const f = String(form || 'bolt').toLowerCase(), family = FORM_FAMILY[f] || 'projectile';
  const draw = {
    bolt: [], projectile: [], seeking: ['spiral'], heavy: ['thump'],
    burst: ['landRing'], area: ['landRing'], lob: ['arc', 'landRing'], mortar: ['arc', 'landRing'], nova: ['ring'], pool: ['landRing', 'linger'], storm: ['landRing', 'linger'],
    fan: ['flare'], chain: ['jumps'], fork: ['splinters'],
    cone: ['fan'], wave: ['fan'], jet: ['fan'],
    beam: ['lance'], ray: ['lance'], lance: ['lance'],
    ward: ['dome'], shield: ['dome'], barrier: ['dome'], dome: ['dome'], wall: ['dome'],
  }[f] || [];
  return { family, draw, muzzle: family === 'beam' ? 'line' : family === 'cone' ? 'wide' : family === 'shield' ? 'ward' : family === 'fork' ? 'split' : family === 'area' ? 'heavy' : 'point' };
}
/** Is this swing a sceptre's (T16)? `imbue` is C's flag; the type covers an older server. Pure. */
/** The element a worn weapon glows in when it is a sceptre (full item or the compact info.gear form), else null. Pure. */
export function sceptreElement(w) {
  if (!w || !/scept|scepter|sceptre/i.test(`${w.subtype || w.sub || ''} ${w.baseKey || w.base || ''} ${w.catalogBase || ''} ${w.g5 || w.look?.g5 || ''}`)) return null;
  const el = elementKey(w.castElement || w.brand || w.el); return el === 'physical' ? null : el;
}
export const isImbuedSwing = ev => !!ev && (ev.imbue === 1 || ev.imbue === true || /scept|scepter|sceptre/i.test(String(ev.wt || ''))) && elementKey(ev.el) !== 'physical';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });

export function createFormFx(scene, { spellFx = null, actors = null, groundY = () => 0, pool = 8 } = {}) {
  // ---- shared geometries (a geometry is not a program) ----
  const lanceGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); lanceGeo.rotateX(Math.PI / 2); lanceGeo.translate(0, 0, 0.5);   // unit lance from the origin along +z
  const fanGeos = new Map();
  const fanGeo = arc => { const a = Math.max(0.3, Math.min(2.6, Math.round(arc / 0.2) * 0.2)), k = a.toFixed(1); if (!fanGeos.has(k)) { const g = new THREE.RingGeometry(0.08, 1, Math.max(8, Math.round(a * 12)), 1, Math.PI / 2 - a / 2, a); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); fanGeos.set(k, g); } return fanGeos.get(k); };
  const ringGeo = new THREE.RingGeometry(0.86, 1, 56); ringGeo.rotateX(-Math.PI / 2);
  const domeGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const shardGeo = new THREE.ConeGeometry(0.5, 1, 5, 1, true); shardGeo.rotateX(Math.PI / 2); shardGeo.translate(0, 0, 0.5);
  const orbGeo = new THREE.SphereGeometry(1, 8, 6);

  const live = [];
  const mk = geo => { const m = new THREE.Mesh(geo, mat()); m.visible = false; m.frustumCulled = false; m.renderOrder = 3; scene.add(m); return m; };
  const pools = { lance: [], fan: [], ring: [], dome: [], shard: [], orb: [] };
  for (let i = 0; i < pool; i++) { pools.lance.push(mk(lanceGeo), mk(lanceGeo)); pools.ring.push(mk(ringGeo)); pools.shard.push(mk(shardGeo), mk(shardGeo)); pools.orb.push(mk(orbGeo)); }
  for (let i = 0; i < Math.ceil(pool / 2); i++) { pools.fan.push(mk(fanGeo(0.8))); pools.dome.push(mk(domeGeo)); }
  const next = { lance: 0, fan: 0, ring: 0, dome: 0, shard: 0, orb: 0 };
  const take = kind => { const list = pools[kind], m = list[next[kind]++ % list.length]; const i = live.findIndex(l => l.m === m); if (i >= 0) live.splice(i, 1); return m; };
  const stats = { beams: 0, fans: 0, rings: 0, domes: 0, arcs: 0, forks: 0, imbued: 0, forms: {} };
  const pending = [];                     // things that happen when a bolt lands: { at (ms), fn }
  const colourOf = el => ELEMENT_COLOUR[el === 'physical' ? 'arcane' : el] || ELEMENT_COLOUR.arcane;
  const elOf = ev => { const e = elementKey(ev.el || ev.element); return e === 'physical' ? 'arcane' : e; };

  /** Start one pooled piece: `step(m, k, dt)` runs every frame for `life` seconds (k 0..1), after `delay`. */
  function play(kind, life, setup, step, delay = 0) {
    const m = take(kind); setup(m); m.visible = delay <= 0; m.material.opacity = 0;
    live.push({ m, t: -delay, life, step });
    return m;
  }

  // ---- the pieces -------------------------------------------------------------------------------------------
  function lance(from, to, el) {
    stats.beams++;
    const colour = colourOf(el), d = to.clone().sub(from), len = Math.max(0.5, d.length());
    for (const [w, c, o, life] of [[0.2, colour, 0.75, 0.34], [0.07, '#ffffff', 1, 0.26]]) {
      play('lance', life, m => { m.position.copy(from); m.lookAt(to); m.scale.set(w, w, len); m.material.color.set(c); }, (m, k) => {
        const s = w * (k < 0.15 ? 0.4 + 4 * k : 1 - 0.75 * (k - 0.15) / 0.85); m.scale.set(s, s, len); m.material.opacity = o * (1 - k) * (1 - k * 0.5);
      });
    }
    try { spellFx?.impact({ at: to, element: el, scale: 0.9, ground: groundY(to.x, to.z), height: 1.6 }); } catch {}
  }
  function fan(x, z, yaw, reach, arc, el) {
    stats.fans++;
    const y = groundY(x, z) + 0.08;
    play('fan', 0.5, m => { m.geometry = fanGeo(arc); m.position.set(x, y, z); m.rotation.set(0, yaw, 0); m.scale.set(0.2, 1, 0.2); m.material.color.set(colourOf(el)); }, (m, k) => {
      const r = reach * Math.min(1, 0.25 + k * 3); m.scale.set(r, 1, r); m.material.opacity = 0.5 * (1 - k) * (1 - k);
    });
  }
  function ring(x, z, r, el, { life = 0.5, from = 0.15, opacity = 0.85, delay = 0, y = null } = {}) {
    stats.rings++;
    const gy = (y ?? groundY(x, z)) + 0.07;
    play('ring', life, m => { m.position.set(x, gy, z); m.rotation.set(0, 0, 0); m.scale.setScalar(Math.max(0.05, r * from)); m.material.color.set(colourOf(el)); }, (m, k) => {
      const e = 1 - (1 - k) * (1 - k); m.scale.setScalar(Math.max(0.05, r * (from + (1 - from) * e))); m.material.opacity = opacity * (1 - k);
    }, delay);
  }
  function dome(a, el, r = 1.25) {
    stats.domes++;
    const h = Math.max(1.2, (a.height || 1.8) * 0.75);
    play('dome', 0.8, m => { m.position.set(a.pos.x, a.pos.y + 0.02, a.pos.z); m.scale.set(r * 1.6, h * 1.5, r * 1.6); m.material.color.set(colourOf(el)); }, (m, k) => {
      const close = Math.min(1, k * 4), s = 1.6 - 0.6 * (1 - (1 - close) * (1 - close));
      if (a.pos) m.position.set(a.pos.x, a.pos.y + 0.02, a.pos.z);
      m.scale.set(r * s, h * (0.9 + 0.6 * (s - 1)), r * s); m.rotation.y += 0.02; m.material.opacity = 0.42 * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
    });
    ring(a.pos.x, a.pos.z, r, el, { life: 0.6, from: 1.5, opacity: 0.7, y: a.pos.y });
  }
  /** Thin shards flying from `from` toward each of `tos` (a fork's splinters, a chain's jumps). */
  function shards(from, tos, el, { life = 0.22, width = 0.09 } = {}) {
    stats.forks++;
    for (const to of tos) {
      const len = Math.max(0.3, from.distanceTo(to));
      play('shard', life, m => { m.position.copy(from); m.lookAt(to); m.scale.set(width, width, len * 0.2); m.material.color.set(colourOf(el)); }, (m, k) => {
        const head = Math.min(1, k * 1.8), tail = Math.max(0, k * 1.8 - 0.8);
        m.position.lerpVectors(from, to, tail); m.scale.set(width, width, Math.max(0.05, len * (head - tail))); m.material.opacity = 0.95 * (1 - k * k);
      });
    }
  }
  const at = (x, z, h = 1) => V(x, groundY(x, z) + h, z);
  const handOf = (a, yaw) => V(a.pos.x + Math.sin(yaw) * 0.45, a.pos.y + Math.max(0.9, (a.height || 1.8) * 0.66), a.pos.z + Math.cos(yaw) * 0.45);
  /** The nearest living hostile-to-the-caster bodies round a point (a chain's next links — the server picks the real ones). */
  function nearestFoes(p, caster, n = 2, within = 7) {
    if (!actors?.actors) return [];
    const out = [];
    for (const b of actors.actors.values()) {
      if (b === caster || b.dead || !b.pos || b.hostile === caster?.hostile) continue;
      const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); if (d > 0.8 && d < within) out.push([d, b]);
    }
    return out.sort((q, r) => q[0] - r[0]).slice(0, n).map(([, b]) => V(b.pos.x, b.pos.y + Math.max(0.4, (b.height || 1.4) * 0.55), b.pos.z));
  }
  const later = (ms, fn) => pending.push({ at: performance.now() + Math.max(0, ms), fn });
  const chestOf = id => { const b = actors?.get(id); return b?.pos ? V(b.pos.x, b.pos.y + Math.max(0.4, (b.height || 1.4) * 0.55), b.pos.z) : null; };
  let seenChain = false;                  // once C's `fx chain` has named real targets, the client stops guessing them

  // ---- T16: a sceptre's head glows in its element all the time (a few pooled orbs riding the nearest wielders' grips) ----
  const GLOWS = 6, glowOrbs = [];
  for (let i = 0; i < GLOWS; i++) glowOrbs.push(mk(orbGeo));
  const _g = new THREE.Vector3(), _d = new THREE.Vector3();
  function updateGlows(now) {
    let n = 0;
    if (actors?.actors) for (const a of actors.actors.values()) {
      if (n >= GLOWS) break;
      const w = a.look?.gear?.weapon; if (!w || a.dead || a.lod === 'far' || a.fishing || !a.body?.parts?.gripR) continue;
      const el = sceptreElement(w); if (!el) continue;
      const m4 = a.body.parts.gripR.matrixWorld, e = m4.elements;
      _d.set(-e[4], -e[5], -e[6]); const sc = _d.length(); if (sc < 0.2) continue;                 // hands-free clips shrink the grip: no glow on a put-away sceptre
      _g.setFromMatrixPosition(m4).addScaledVector(_d, 0.42);
      const m = glowOrbs[n++]; m.visible = true; m.position.copy(_g); m.material.color.set(colourOf(el));
      const pulse = 0.5 + 0.5 * Math.sin(now / 260 + n); m.scale.setScalar(0.1 + 0.03 * pulse); m.material.opacity = 0.4 + 0.2 * pulse;
    }
    stats.glows = n;
    for (let i = n; i < GLOWS; i++) glowOrbs[i].visible = false;
  }

  // ---- events -----------------------------------------------------------------------------------------------
  function onEvent(ev) {
    if (!ev) return false;
    // a bolt of a known form: the form's signature at the hand now, and at the landing point when it gets there
    if (ev.type === 'fx' && (ev.kind === 'bolt' || ev.kind === 'shot') && ev.basic && ev.form) {
      const L = formLook(ev.form), el = elOf(ev), a = actors?.get(ev.id);
      stats.forms[ev.form] = (stats.forms[ev.form] || 0) + 1;
      const to = ev.to && typeof ev.to === 'object' ? at(ev.to.x, ev.to.z, 1) : (ev.to != null && actors?.get(ev.to) ? (b => V(b.pos.x, b.pos.y + Math.max(0.4, (b.height || 1.4) * 0.55), b.pos.z))(actors.get(ev.to)) : null);
      const ms = Number.isFinite(ev.ms) ? ev.ms : 300;
      if (a) {
        const hand = handOf(a, a.yaw || 0);
        if (L.draw.includes('spiral')) for (let i = 0; i < 2; i++) ring(hand.x, hand.z, 0.5, el, { life: 0.3, from: 0.2, delay: i * 0.08, y: hand.y - 0.4 + i * 0.3 });
        if (L.draw.includes('thump')) ring(a.pos.x, a.pos.z, 1.5, el, { life: 0.4, from: 0.3, y: a.pos.y });
        // [C, owner #40] a fan's three bolts each arrive as their own fx bolt (n 1..3): the hand flare once
        if (L.draw.includes('flare') && to && !(ev.n > 1)) { const d = to.clone().sub(hand).setY(0).normalize(), side = V(d.z, 0, -d.x); shards(hand, [-0.45, 0, 0.45].map(k => hand.clone().addScaledVector(d, 2.2).addScaledVector(side, k * 2.2)), el, { life: 0.2, width: 0.12 }); }
      }
      if (to) {
        if (L.draw.includes('landRing')) later(ms, () => ring(to.x, to.z, ev.r || (ev.form === 'lob' ? 3 : 3.2), el, { life: 0.55 }));
        if (L.draw.includes('linger')) later(ms + 120, () => ring(to.x, to.z, (ev.r || 3) * 0.8, el, { life: 1.6, from: 0.9, opacity: 0.5 }));
        if (L.draw.includes('splinters') && a && !seenChain && !ev.hop) later(ms, () => { const d = to.clone().sub(V(a.pos.x, to.y, a.pos.z)).setY(0).normalize(), side = V(d.z, 0, -d.x); shards(to, [-1, 1].map(k => to.clone().addScaledVector(d, 3).addScaledVector(side, k * 1.8)), el); });
        if (L.draw.includes('jumps') && !seenChain && !ev.hop) later(ms, () => { const links = nearestFoes(to, a, 2); let from = to; for (const p of links) { shards(from, [p], el, { life: 0.2, width: 0.07 }); from = p; } });
      }
      return true;
    }
    // C names the bodies a chain or fork really reached: arcs to exactly those, hop by hop (a fork's shards leave together)
    if (ev.type === 'fx' && ev.kind === 'chain') {
      seenChain = true; stats.chains = (stats.chains || 0) + 1;
      const el = elOf(ev), ids = Array.isArray(ev.targets) ? ev.targets : [];
      let from = chestOf(ev.first) || chestOf(ev.id);
      ids.forEach((id, i) => {
        const start = ev.fork ? from : null;
        later(ev.fork ? 0 : i * 70, () => { const to = chestOf(id), a0 = start || chestOf(i ? ids[i - 1] : ev.first) || chestOf(ev.id); if (to && a0) { stats.chainArcs = (stats.chainArcs || 0) + 1; shards(a0, [to], el, { life: 0.24, width: 0.09 }); try { spellFx?.impact({ at: to, element: el, scale: 0.5, ground: groundY(to.x, to.z), height: 1.2, density: 0.5 }); } catch {} } });
      });
      return true;
    }
    if (ev.type === 'fx' && ev.kind === 'ward') {
      const a = actors?.get(ev.id); if (a) dome(a, elementKey(ev.el || 'arcane'));
      return true;
    }
    // an off-hand FOCUS's rider on the main hand's attack (C): echo (the attack repeats), burst (it bursts round the first
    // enemy hit), siphon (the hit gives mana), ward (a barrier — also sent as `fx ward`)
    if (ev.type === 'fx' && ev.kind === 'rider') {
      const a = actors?.get(ev.id), el = elementKey(ev.el || 'arcane'); stats.riders = (stats.riders || 0) + 1;
      if (ev.rider === 'burst' && Number.isFinite(ev.x)) { ring(ev.x, ev.z, ev.r || 2.5, el, { life: 0.5 }); try { spellFx?.aoe({ points: [at(ev.x, ev.z, 0.6)], element: el, stagger: 0, ground: groundY(ev.x, ev.z) }); } catch {} }
      else if (!a) return true;
      else if (ev.rider === 'echo') { const h = handOf(a, a.yaw || 0); for (let i = 0; i < 2; i++) ring(h.x, h.z, 0.7, el, { life: 0.35, from: 0.3, delay: i * 0.1, y: h.y - 0.9 + i * 0.5 }); try { spellFx?.cast({ at: h, element: el, ms: 220, ground: a.pos.y }); } catch {} }
      else if (ev.rider === 'siphon') { const c = V(a.pos.x, a.pos.y + 1.1, a.pos.z), from = []; for (let i = 0; i < 3; i++) { const q = (a.yaw || 0) + (i - 1) * 0.5; from.push(V(a.pos.x + Math.sin(q) * 3, a.pos.y + 1, a.pos.z + Math.cos(q) * 3)); } for (const f of from) shards(f, [c], 'ice', { life: 0.3, width: 0.07 }); ring(a.pos.x, a.pos.z, 0.9, 'ice', { life: 0.45, from: 1.6, opacity: 0.6, y: a.pos.y }); }
      else if (ev.rider === 'ward') dome(a, el);
      return true;
    }
    if (ev.type !== 'fx' || ev.kind !== 'attack') return false;
    const a = actors?.get(ev.id), x = ev.x ?? a?.pos.x, z = ev.z ?? a?.pos.z; if (x == null) return false;
    const yaw = ev.yaw ?? a?.yaw ?? 0, el = elOf(ev);
    // T16: a sceptre's swing carries its element
    if (ev.shape === 'swing') {
      if (!isImbuedSwing(ev)) return false;
      stats.imbued++;
      const reach = ev.reach || 2.4, arc = ev.arc || 1.6, gy = groundY(x, z);
      // a second trail, wider and slower than the steel's, in the element's colour — and a ground flash under the arc
      play('fan', 0.42, m => { m.geometry = fanGeo(arc); m.position.set(x, gy + 1.05, z); m.rotation.set(0, yaw, 0); m.scale.set(reach, 1, reach); m.material.color.set(colourOf(el)); }, (m, k) => {
        const r = reach * (0.75 + 0.5 * k); m.scale.set(r, 1, r); m.position.y = gy + 1.05 + 0.25 * k; m.material.opacity = 0.42 * (1 - k);
      });
      ring(x + Math.sin(yaw) * reach * 0.6, z + Math.cos(yaw) * reach * 0.6, reach * 0.55, el, { life: 0.4, from: 0.3, opacity: 0.6 });
      // the element scattered along the arc: three small bursts, left to right (or right to left on the back-swing)
      if (spellFx) {
        const dir = (ev.step | 0) % 2 ? -1 : 1;
        for (let i = 0; i < 3; i++) {
          const q = yaw + (i - 1) * arc * 0.33 * dir, px = x + Math.sin(q) * reach * 0.85, pz = z + Math.cos(q) * reach * 0.85;
          later(i * 45, () => { try { spellFx.impact({ at: at(px, pz, 1.0), element: el, scale: 0.45, ground: groundY(px, pz), height: 1.2, density: 0.5 }); } catch {} });
        }
      }
      return true;
    }
    const form = ev.form || ev.shape, L = formLook(form);
    stats.forms[form] = (stats.forms[form] || 0) + 1;
    const reach = ev.reach || (L.family === 'beam' ? 18 : L.family === 'cone' ? 9 : 8);
    const hand = V(x + Math.sin(yaw) * 0.45, groundY(x, z) + 1.25, z + Math.cos(yaw) * 0.45);
    for (const piece of L.draw) {
      if (piece === 'lance') { const end = ev.to && typeof ev.to === 'object' ? at(ev.to.x, ev.to.z, 1.1) : at(x + Math.sin(yaw) * reach, z + Math.cos(yaw) * reach, 1.1); lance(hand, end, el); }
      else if (piece === 'fan') fan(x, z, yaw, reach, ev.arc || 0.9, el);
      else if (piece === 'ring') { const r = ev.r || ev.reach || 5; ring(x, z, r, el, { life: 0.45 }); ring(x, z, r * 0.7, el, { life: 0.5, delay: 0.08, opacity: 0.5 }); }
      else if (piece === 'dome' && a) dome(a, el, ev.r || 1.25);
      else if (piece === 'arc') {
        stats.arcs++;
        const to = ev.to && typeof ev.to === 'object' ? at(ev.to.x, ev.to.z, 0.3) : at(x + Math.sin(yaw) * reach, z + Math.cos(yaw) * reach, 0.3);
        const ms = Number.isFinite(ev.ms) ? ev.ms : Math.max(350, hand.distanceTo(to) * 45);
        try { spellFx?.projectile({ from: hand, to, element: el, arc: 0.55, ms }); } catch {}
        later(ms, () => { ring(to.x, to.z, ev.r || 3, el, { life: 0.55 }); try { spellFx?.aoe({ points: [to.clone().setY(to.y + 0.5)], element: el, stagger: 0, ground: to.y - 0.3 }); } catch {} });
      } else if (piece === 'landRing' && ev.to && typeof ev.to === 'object') ring(ev.to.x, ev.to.z, ev.r || 3, el, { life: 0.55 });
    }
    return L.draw.length > 0;
  }

  let timeScale = 1;          // (specs / demos: slow the pieces down to look at them — this VM draws about one frame a second)
  function update(dt) {
    dt *= timeScale;
    updateGlows(performance.now());
    if (pending.length) { const now = performance.now(); for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= now) { const p = pending.splice(i, 1)[0]; try { p.fn(); } catch {} } }
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i]; l.t += dt;
      if (l.t < 0) continue;
      const k = l.t / l.life;
      if (k >= 1) { l.m.visible = false; l.m.material.opacity = 0; live.splice(i, 1); continue; }
      l.m.visible = true; l.step(l.m, k, dt);
    }
  }
  /** Visible copies of the pool's meshes for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group();
    for (const geo of [lanceGeo, fanGeo(0.8), ringGeo, domeGeo, shardGeo, orbGeo]) { const m = new THREE.Mesh(geo, mat()); m.material.opacity = 0.5; g.add(m); }
    return g;
  }
  /** The pooled pieces, lent to revive-fx.js and angling-view.js (same pools, same one material setting). */
  const prims = { play, ring, lance, dome, shards, later, colourOf, at };
  return { prims, onEvent, update, sample, stats, get timeScale() { return timeScale; }, set timeScale(v) { timeScale = Math.max(0.01, +v || 1); }, get live() { return live.length; }, dispose() { for (const list of Object.values(pools)) for (const m of list) { scene.remove(m); m.material.dispose(); } for (const g of [lanceGeo, ringGeo, domeGeo, shardGeo, orbGeo, ...fanGeos.values()]) g.dispose(); } };
}
