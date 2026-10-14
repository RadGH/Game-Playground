// The Starcaller's stars, drawn (wrap-up 2026-10-13, Y32). What to draw is decided in star-looks.js (pure, tested);
// this file is only the drawing:
//
//   * a THROWN star (Star Dart, Scattered Stars): a gold compass star that spins as it flies, sheds small stars behind
//     it and bursts into a gold starburst where it lands;
//   * a FALLING star (Called Star, Heavens' Barrage): it streaks down from high above with a bright tail and touches the
//     ground exactly `ev.ms` after its event — when the rules deal the damage — then throws a gold ring across the
//     ground. A thin gold ring marks the spot while it falls and closes as the star nears;
//   * a gold STAR-RUNE on the ground for the class's zones (Star Field, and the talents' lingering ground), turning
//     slowly, with motes rising off it. It is drawn wherever its `x, z` are this frame, so a zone that rides its owner
//     (Drifting Field) is simply moved: `zoneMove(key, x, z)`, or `follow` an actor id;
//   * WHEELING stars circling a body, and the CONSTELLATION — up to five small motes round the Starcaller's head, one
//     for each Starlight held, which flare outward when the big skill spends them.
//
// How it is built (the rules this project learned the hard way): TWO materials for everything, both compiled in the
// boot warm-up through `sample()`; six InstancedMeshes made once and refilled every frame — a cast creates no geometry,
// no material, no mesh and no light, and fading is a per-instance colour, so nothing is ever cloned. No glowing
// spheres: every shape is a star, a ring, a rune or a streak.
//
//   const stars = createStarFx(scene, { camera, actors, groundY, quality })
//   stars.shot(ev, { from, to, follow, onLand })    stars.skyfall(ev)    stars.zone(spec) / zoneMove / zoneEnd
//   stars.orbs(spec)    stars.setMotes(actorId, n)    stars.burst(point, opts)    stars.ownerGone(id)
//   stars.update(dt)    stars.sample()    stars.stats

import * as THREE from 'three';
import { flightMs } from './projectile-kinds.js';
import { STAR_GOLD, STAR_SHOT, skyfallPlan, skyAt, moteSeat, isStarShot, isStarSkill, starZone, starOrbs } from './star-looks.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------- geometry (built once)

/** A flat geometry from triangles: `tris` = [[x,y,z, brightnessOrColour] × 3 …]. Colour is per vertex. */
function flat(verts) {
  const n = verts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const v = verts[i];
    pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2];
    if (typeof v[3] === 'string') { c.set(v[3]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    else { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v[3]; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/**
 * A compass star in the XY plane (it faces +z): four long points, four short ones between them. `major`/`minor` = the
 * two tip radii, `waist` = the radius between tips; colours (or brightness) at the centre, the waist and the tips.
 */
function starVerts({ major = 1, minor = 0.5, waist = 0.26, z = 0, centre, mid, tip, turn = 0 }) {
  const rim = [];
  for (let i = 0; i < 16; i++) {
    const a = turn + (i / 16) * TAU + Math.PI / 2;
    const r = i % 2 ? waist : (i % 4 === 0 ? major : minor);
    rim.push([Math.cos(a) * r, Math.sin(a) * r, z, i % 2 ? mid : tip]);
  }
  const out = [];
  for (let i = 0; i < 16; i++) out.push([0, 0, z, centre], rim[i], rim[(i + 1) % 16]);
  return out;
}
/** A band in the XZ plane between two radii, `seg` pieces round; brightness at the inner and the outer edge. */
function bandVerts(r0, r1, b0, b1, seg = 48, y = 0) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU, b = ((i + 1) / seg) * TAU;
    const p = (r, t, br) => [Math.cos(t) * r, y, Math.sin(t) * r, br];
    out.push(p(r0, a, b0), p(r1, a, b1), p(r1, b, b1), p(r0, a, b0), p(r1, b, b1), p(r0, b, b0));
  }
  return out;
}
/** A bar on the ground from (ax, az) to (bx, bz), `w` wide. */
function barVerts(ax, az, bx, bz, w, br) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
  const A = [ax + nx, 0, az + nz, br], B = [ax - nx, 0, az - nz, br], C = [bx - nx, 0, bz - nz, br], D = [bx + nx, 0, bz + nz, br];
  return [A, B, C, A, C, D];
}
/** A small compass star lying on the ground at (cx, cz). */
function groundStar(cx, cz, size, br, turn = 0) {
  return starVerts({ major: size, minor: size * 0.45, waist: size * 0.22, centre: br, mid: br * 0.8, tip: br * 0.6, turn }).map(v => [cx + v[0], 0, cz + v[1], v[3]]);
}

function buildGeometries() {
  const G = {};
  // the gold star itself: a dark amber edge behind a body that runs from a pale heart to deep gold tips (solid, unlit)
  G.star = flat([
    ...starVerts({ major: 1, minor: 0.58, waist: 0.36, z: -0.03, centre: '#6a3c04', mid: '#6a3c04', tip: '#7a4806' }),
    ...starVerts({ major: 0.86, minor: 0.46, waist: 0.27, z: 0, centre: '#ffe27a', mid: '#ffc21f', tip: '#ff9a08' }),
  ]);
  // the glow: the same star, bright at the heart and gone at the tips (additive; the instance colour is the gold)
  G.glow = flat(starVerts({ major: 1, minor: 0.5, waist: 0.2, centre: 1, mid: 0.34, tip: 0 }));
  // a ring on the ground: nothing — bright — nothing across its width
  G.ring = flat([...bandVerts(0.86, 0.95, 0, 1), ...bandVerts(0.95, 1, 1, 0)]);
  // the rune's outer wheel: two fine rings, ten small stars and ten ticks between them, and a faint wash over the floor
  {
    const v = [...bandVerts(0.955, 0.985, 0.2, 1, 64), ...bandVerts(0.985, 1, 1, 0, 64), ...bandVerts(0.79, 0.805, 0.75, 0.75, 64), ...bandVerts(0, 0.79, 0.09, 0.05, 40)];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU, b = a + TAU / 20;
      v.push(...groundStar(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.062, 1, a));
      v.push(...barVerts(Math.cos(b) * 0.84, Math.sin(b) * 0.84, Math.cos(b) * 0.92, Math.sin(b) * 0.92, 0.012, 0.7));
    }
    G.runeOuter = flat(v);
  }
  // the rune's heart: a five-pointed star drawn tip to tip, a ring where its lines cross, a compass star in the middle
  {
    const v = [], P = i => [Math.cos(i * TAU / 5 - Math.PI / 2), Math.sin(i * TAU / 5 - Math.PI / 2)];
    for (let i = 0; i < 5; i++) { const a = P(i), b = P((i + 2) % 5); v.push(...barVerts(a[0], a[1], b[0], b[1], 0.03, 0.9)); v.push(...groundStar(a[0] * 1.0, a[1] * 1.0, 0.07, 1, i)); }
    v.push(...bandVerts(0.36, 0.39, 0.7, 0.7, 40), ...groundStar(0, 0, 0.26, 1, 0));
    G.runeInner = flat(v);
  }
  // a tail: a blade along +y from the head (y = 0, bright, full width) to nothing (y = 1), facing +z
  G.streak = flat([
    [-0.5, 0, 0, 0.0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 1], [0.5, 0, 0, 0.0], [0, 1, 0, 0],
    [-0.18, 0, 0, 0.6], [0.18, 0, 0, 0.6], [0, 0.55, 0, 0],
  ]);
  return G;
}

// ---------------------------------------------------------------- one refillable batch

const _m4 = new THREE.Matrix4(), _s = new THREE.Vector3();
function makeBatch(parent, geometry, material, capacity, order) {
  const m = new THREE.InstancedMesh(geometry, material, capacity);
  m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = order; m.matrixAutoUpdate = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.count = 0; m.visible = false;
  parent.add(m);
  let n = 0, peak = 0;
  const M = m.instanceMatrix.array, C = m.instanceColor.array;
  return {
    mesh: m,
    begin() { n = 0; },
    put(pos, quat, sx, sy, sz, r, g, b) {
      if (n >= capacity) return;
      _m4.compose(pos, quat, _s.set(sx, sy, sz)).toArray(M, n * 16);
      C[n * 3] = r; C[n * 3 + 1] = g; C[n * 3 + 2] = b; n++;
    },
    end() {
      if (n > peak) peak = n;
      if (m.count === 0 && n === 0) return;
      m.count = n; m.visible = n > 0;
      if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    },
    get n() { return n; }, get peak() { return peak; },
  };
}

// ---------------------------------------------------------------- the drawer

export function createStarFx(scene, { camera, actors = null, groundY = () => 0, quality = 'high' } = {}) {
  const low = quality === 'low';
  const group = new THREE.Group(); group.name = 'star-fx'; scene.add(group);
  const GEO = buildGeometries();
  // the two materials. Solid: the star's own body. Glow: everything bright (additive, never writes depth, sits a hair
  // proud of the ground it lies on so a rune does not flicker against the grass).
  const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const B = {
    star: makeBatch(group, GEO.star, solidMat, 48, 3),
    glow: makeBatch(group, GEO.glow, glowMat, low ? 260 : 520, 5),
    ring: makeBatch(group, GEO.ring, glowMat, 40, 4),
    runeOuter: makeBatch(group, GEO.runeOuter, glowMat, 16, 4),
    runeInner: makeBatch(group, GEO.runeInner, glowMat, 16, 4),
    streak: makeBatch(group, GEO.streak, glowMat, 24, 5),
  };
  const gold = new THREE.Color(STAR_GOLD), pale = new THREE.Color('#fff0c0');
  const GR = gold.r, GG = gold.g, GB = gold.b;

  const stats = { shots: 0, landed: 0, falls: 0, fallsLanded: 0, zones: 0, zonesEnded: 0, orbs: 0, flares: 0, bursts: 0, lastFall: null, lastShot: null };
  const shots = [], falls = [], zones = new Map(), orbits = [], flashes = [];
  const motes = new Map();            // actor id -> { n, shown }
  let time = 0, drawn = false, zoneSeq = 0;
  let clock = () => performance.now();
  // A flight starts when its event is HANDLED and ends `ms` later — the hit's number is shown when ITS event is handled,
  // `ms` after that one, so the two meet. (Starting it by the server clock instead lands it a network delay early.)
  let lastT = 0;

  // ---- sparkles: small stars that drift and fade (struct of arrays; one glow instance each)
  const SN = low ? 150 : 340;
  const sp = { x: new Float32Array(SN), y: new Float32Array(SN), z: new Float32Array(SN), vx: new Float32Array(SN), vy: new Float32Array(SN), vz: new Float32Array(SN),
    t: new Float32Array(SN), life: new Float32Array(SN), size: new Float32Array(SN), grav: new Float32Array(SN), seed: new Float32Array(SN), on: new Uint8Array(SN) };
  let spNext = 0, spLive = 0;
  function sparkle(x, y, z, vx, vy, vz, life, size, grav = 0) {
    const i = spNext; spNext = (spNext + 1) % SN;
    if (!sp.on[i]) spLive++;
    sp.on[i] = 1; sp.x[i] = x; sp.y[i] = y; sp.z[i] = z; sp.vx[i] = vx; sp.vy[i] = vy; sp.vz[i] = vz; sp.t[i] = 0; sp.life[i] = life; sp.size[i] = size; sp.grav[i] = grav; sp.seed[i] = Math.random() * TAU;
  }
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _qg = new THREE.Quaternion(), _n = new THREE.Vector3();
  const _fwd = new THREE.Vector3(0, 0, -1);
  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _zv = new THREE.Vector3(), _basis = new THREE.Matrix4(), _to = new THREE.Vector3();
  /** A quaternion that faces the camera, turned `a` radians about the line of sight. */
  const facing = a => _q.copy(camera.quaternion).multiply(_qz.setFromAxisAngle(ZAX, a));
  /** The lie of the ground at a spot: writes the tilt into `out`, returns the height. `d` = how far out it feels. */
  function lie(x, z, d, out) {
    const h = groundY(x, z);
    const gx = (groundY(x - d, z) - groundY(x + d, z)) / (2 * d), gz = (groundY(x, z - d) - groundY(x, z + d)) / (2 * d);
    _n.set(Number.isFinite(gx) ? gx : 0, 1, Number.isFinite(gz) ? gz : 0).normalize();
    out.setFromUnitVectors(UP, _n);
    return Number.isFinite(h) ? h : 0;
  }
  /** A glow star facing the camera. */
  function glowAt(x, y, z, size, turn, k, white = 0) {
    if (k <= 0.003 || size <= 0) return;
    B.glow.put(_p.set(x, y, z), facing(turn), size, size, size, (GR + (pale.r - GR) * white) * k, (GG + (pale.g - GG) * white) * k, (GB + (pale.b - GB) * white) * k);
  }
  /** The solid gold star facing the camera, with its glow behind it. */
  function starAt(x, y, z, size, turn, halo = 1) {
    B.star.put(_p.set(x, y, z), facing(turn), size, size, size, 1, 1, 1);
    // the glow sits just BEHIND the body (further from the eye), so the gold of the star is not washed out by its own light
    const bx = x + _fwd.x * size * 0.12, by = y + _fwd.y * size * 0.12, bz = z + _fwd.z * size * 0.12;
    glowAt(bx, by, bz, size * 2.1 * halo, -turn * 0.5 + 0.4, 0.75);
    glowAt(bx, by, bz, size * 1.45 * halo, turn * 0.5 + Math.PI / 4, 0.45, 0.4);
  }

  // ---- bursts
  /** A gold starburst in the air at `p` (a thrown star landing, a hit): a flash and a spray of small stars. */
  function burst(p, { n = STAR_SHOT.burst, size = 1, speed = 4.2 } = {}) {
    if (!p) return;
    stats.bursts++;
    flashes.push({ kind: 'flash', x: p.x, y: p.y, z: p.z, t: 0, ms: 260, size: 1.5 * size });
    const count = Math.round(n * (low ? 0.6 : 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, e = rnd(1.1), s = speed * (0.45 + Math.random() * 0.75) * size;
      sparkle(p.x, p.y, p.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1.2, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.3, (0.13 + Math.random() * 0.13) * size, 5);
    }
  }
  /** A star striking the GROUND at (x, z): a ring racing out to `r`, a flash, a short pillar of light, a fountain of stars. */
  function groundBurst(x, z, r, { n = 24, big = true } = {}) {
    stats.bursts++;
    const y = groundY(x, z);
    flashes.push({ kind: 'ring', x, z, t: 0, ms: big ? 560 : 420, r0: r * 0.25, r1: r * 1.08 });
    if (big) flashes.push({ kind: 'ring', x, z, t: -90, ms: 620, r0: r * 0.1, r1: r * 0.7 });
    flashes.push({ kind: 'flash', x, y: y + 0.6, z, t: 0, ms: 300, size: (big ? 3.4 : 1.9) });
    flashes.push({ kind: 'pillar', x, y, z, t: 0, ms: 340, h: big ? 7 : 4, w: big ? 1.5 : 0.9 });
    const count = Math.round(n * (low ? 0.6 : 1));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = (2.5 + Math.random() * 4.5) * Math.min(1.6, 0.6 + r * 0.14);
      sparkle(x, y + 0.25, z, Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s, 0.5 + Math.random() * 0.45, 0.16 + Math.random() * 0.2, 13);
    }
  }

  // ---- thrown stars
  /**
   * Throw one. `ev` = the rules' shot event; `from`, `to` = Vector3; `follow()` = the target's live position (it homes)
   * or null; `onLand(point)` runs when it arrives, `ms` after the throw (the rules' own flight time).
   */
  function shot(ev, { from, to, follow = null, ms = null, onLand = null } = {}) {
    if (!from || !to) return false;
    if (shots.length >= 40) shots.shift();
    const dist = from.distanceTo(to);
    const it = { from: from.clone(), to: to.clone(), follow, onLand, t: 0, ms: flightMs({ ...ev, ms: ms ?? ev.ms }, dist, 'star'), src: ev.id ?? null, big: ev.big ? 1.4 : 1, born: 0, trail: 0, turn: Math.random() * TAU, pos: from.clone() };
    it.born = clock();
    shots.push(it);
    stats.shots++; stats.lastShot = { ms: Math.round(it.ms), dist: +dist.toFixed(2), from: [+from.x.toFixed(2), +from.y.toFixed(2), +from.z.toFixed(2)] };
    return true;
  }

  // ---- falling stars
  /** `fx skyfall`: a star comes down on `ev.to`, touching the ground `ev.ms` after this call. Returns its plan. */
  function skyfall(ev) {
    const plan = skyfallPlan(ev);
    if (falls.length >= 30) falls.shift();
    const f = { plan, t: 0, trail: 0, turn: Math.random() * TAU, gy: groundY(plan.x, plan.z), born: clock() };
    falls.push(f);
    stats.falls++;
    stats.lastFall = { skill: plan.skill, landMs: plan.landMs, landedAfter: null, x: plan.x, z: plan.z, r: plan.r, big: plan.big };
    if (plan.landMs <= 0) land(f);
    return plan;
  }
  function land(f) {
    f.done = true;
    stats.fallsLanded++;
    if (stats.lastFall && stats.lastFall.x === f.plan.x && stats.lastFall.z === f.plan.z) stats.lastFall.landedAfter = Math.round(clock() - f.born);
    groundBurst(f.plan.x, f.plan.z, f.plan.r, { n: f.plan.burst, big: f.plan.big });
  }

  // ---- zones
  /**
   * A gold star-rune on the ground. `spec` = star-looks.js starZone(): { key, src, x, z, r, ms, follow, field }.
   * `follow` = an actor id it rides (read each frame); or call `zoneMove(key, x, z)` from whoever knows better.
   */
  function zone(spec) {
    const key = spec.key ?? 'sz' + (++zoneSeq);
    zones.set(key, { key, src: spec.src ?? null, x: spec.x, z: spec.z, r: spec.r, t: 0, ms: spec.ms, follow: spec.follow ?? null, field: !!spec.field, spin: Math.random() * TAU, mote: 0, q: new THREE.Quaternion(), gy: 0, lx: NaN, lz: NaN, endAt: -1 });
    stats.zones++;
    if (zones.size > 14) zones.delete(zones.keys().next().value);
    return key;
  }
  function zoneMove(key, x, z) { const zn = zones.get(key); if (!zn || !Number.isFinite(x) || !Number.isFinite(z)) return false; zn.x = x; zn.z = z; return true; }
  /** End a zone now (it fades over a quarter of a second rather than blinking out). */
  function zoneEnd(key) { const zn = zones.get(key); if (!zn) return 0; if (zn.endAt < 0) { zn.endAt = zn.t + 250; stats.zonesEnded++; } return 1; }
  const hasZone = key => zones.has(key);

  // ---- Wheeling Stars
  function orbs(spec) {
    for (let i = orbits.length - 1; i >= 0; i--) if (orbits[i].id === spec.id) orbits.splice(i, 1);     // a recast replaces the wheel
    orbits.push({ id: spec.id, count: spec.count, t: 0, ms: spec.ms, trail: 0 });
    stats.orbs++;
    return true;
  }

  // ---- the Constellation
  /** How many Starlight a body holds (0..5). A fall is a spend: the motes it lost flare outward. */
  function setMotes(id, n) {
    if (id == null) return;
    const had = motes.get(id)?.n || 0;
    n = Math.max(0, Math.min(5, n | 0));
    if (n === had) return;
    if (n < had) flare(id, had, n);
    if (n > 0) motes.set(id, { n, t: motes.get(id)?.t || 0, grew: time }); else motes.delete(id);
  }
  function flare(id, had, left) {
    const a = actors?.get?.(id); if (!a) return;
    stats.flares++;
    const hy = a.pos.y + (a.height || 1.7) + 0.28;
    for (let i = left; i < had; i++) {
      const s = moteSeat(i, time, had >= 5), x = a.pos.x + Math.cos(s.a) * 0.46, z = a.pos.z + Math.sin(s.a) * 0.46;
      flashes.push({ kind: 'flash', x, y: hy, z, t: 0, ms: 320, size: 0.9 });
      for (let k = 0; k < (low ? 3 : 6); k++) sparkle(x, hy, z, Math.cos(s.a) * 2.4 + rnd(1), 1.5 + Math.random() * 2, Math.sin(s.a) * 2.4 + rnd(1), 0.5 + Math.random() * 0.3, 0.12 + Math.random() * 0.08, 3);
    }
    flashes.push({ kind: 'ring', x: a.pos.x, z: a.pos.z, t: 0, ms: 420, r0: 0.3, r1: 1.6 + had * 0.22, follow: id });
  }

  /** Everything a body was throwing or calling is gone with it (the rules cancel the hits of the dead). */
  function ownerGone(src) {
    if (src == null) return 0;
    let n = 0;
    for (let i = shots.length - 1; i >= 0; i--) if (shots[i].src === src) { shots.splice(i, 1); n++; }
    for (let i = falls.length - 1; i >= 0; i--) if (falls[i].plan.src === src && !falls[i].done) { falls.splice(i, 1); n++; }
    for (const zn of zones.values()) if (zn.src === src) n += zoneEnd(zn.key);
    for (let i = orbits.length - 1; i >= 0; i--) if (orbits[i].id === src) { orbits.splice(i, 1); n++; }
    motes.delete(src);
    return n;
  }

  // ---- the rules' events (spells.js hands every `fx` and `cast` here first; true = "that was a star, I drew it")
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const zoneKey = ev => (ev.kind === 'pool' ? `p${ev.id}:${ev.pid}` : ev.kind === 'zone' ? `z${ev.id ?? ev.obj}` : `o${ev.obj}`);
  /**
   * `ctx` = spells.js's own helpers, so a star leaves the same hand and lands on the same chest as every other shot:
   * { target(to) -> Vector3 | null, chest(actor) -> Vector3, hand(actor) -> Vector3 | null }.
   */
  function onFx(ev, a, ctx = {}) {
    switch (ev.kind) {
      case 'bolt': case 'shot': case 'arrow': case 'thrown': {
        if (!isStarShot(ev)) return false;
        const to = ctx.target?.(ev.to); if (!to) return true;
        const follow = typeof ev.to !== 'object' && ev.to != null ? () => ctx.target(ev.to) : null;
        const hop = ev.hop || ev.fromId != null || ev.fork;
        const from = (hop || !a) && ev.from ? V3(ev.from.x, groundY(ev.from.x, ev.from.z) + 1.1, ev.from.z) : a ? (ctx.hand?.(a) || ctx.chest?.(a)) : null;
        shot(ev, { from, to, follow, ms: ev.ms, onLand: p => { if (!ev.miss) burst(p); } });
        return true;
      }
      case 'skyfall': skyfall(ev); return true;
      case 'pool': case 'place': case 'zone': {
        const key = zoneKey(ev);
        if (ev.end) return zones.has(key) ? !!zoneEnd(key) : false;
        const spec = starZone(ev, a?.look?.cls ?? null);
        if (!spec) return false;
        zone({ ...spec, key });
        return true;
      }
      case 'unplace': { const key = `o${ev.obj}`; return zones.has(key) ? !!zoneEnd(key) : false; }
      case 'orbs': { const spec = starOrbs(ev, a?.look?.cls ?? null); return spec ? orbs(spec) : false; }
      case 'spell': {
        if (!isStarSkill(ev.ab)) return false;
        // the falling skills draw their own mark and their own landing (skyfall); a barrage also shows the edge of the sky it falls in
        if (ev.ab === 'called_star') return true;
        const around = ev.shape === 'around' || ev.shape === 'self' || ev.shape === 'melee';
        const c = !around && ev.to ? ev.to : !around && ev.x != null ? { x: ev.x, z: ev.z } : a ? a.pos : null;
        if (!c) return true;
        const r = Math.max(1, Math.min(14, +ev.r || 3));
        if (ev.ab === 'sky_barrage') flashes.push({ kind: 'mark', x: c.x, z: c.z, r, t: 0, ms: Math.max(1200, (ev.n || 10) * 400 + 600) });
        else if (ev.shape !== 'self') groundBurst(c.x, c.z, r, { n: 16, big: false });
        return true;
      }
      default: return false;
    }
  }
  /** A star skill's hit on a body (`fx impact {ab}`): a small gold starburst instead of the element's own. */
  function onImpact(ev, a, at) {
    if (!isStarSkill(ev.ab) || !at) return false;
    burst(at, { n: ev.crit ? 12 : 7, size: ev.crit ? 0.95 : 0.7, speed: 3.4 });
    return true;
  }
  /** `cast` of a star skill: a gold glint at the hand. */
  function onCast(ev, a, ctx = {}) {
    if (!isStarSkill(ev.skill) || !a) return false;
    const h = ctx.hand?.(a) || ctx.chest?.(a); if (!h) return true;
    flashes.push({ kind: 'flash', x: h.x, y: h.y, z: h.z, t: 0, ms: 240, size: 0.85 });
    for (let i = 0; i < (low ? 3 : 6); i++) sparkle(h.x, h.y, h.z, rnd(1.2), 0.6 + Math.random() * 1.4, rnd(1.2), 0.4, 0.1 + Math.random() * 0.06, 2);
    return true;
  }

  const idle = () => !shots.length && !falls.length && !zones.size && !orbits.length && !flashes.length && !motes.size && !spLive;

  function update(dt) {
    if (idle()) {
      if (drawn) { for (const b of Object.values(B)) { b.begin(); b.end(); } drawn = false; }
      lastT = 0;
      return;
    }
    // the wall clock, not the game loop's (capped) frame time: on a slow frame a zone must still end when its seconds are up
    const now = clock();
    if (lastT) dt = Math.max(0, Math.min(1, (now - lastT) / 1000));
    lastT = now;
    time += dt;
    const ms = dt * 1000;
    for (const b of Object.values(B)) b.begin();
    camera.getWorldDirection(_fwd);

    // thrown stars
    for (let i = shots.length - 1; i >= 0; i--) {
      const it = shots[i];
      it.t = now - it.born;                                    // the wall clock, not summed frames: a slow frame must not make it late
      const k = Math.min(1, it.t / it.ms);
      if (it.follow) { const p = it.follow(); if (p) it.to.lerp(p, Math.min(1, 0.25 + k)); }       // it homes, like every shot
      it.pos.lerpVectors(it.from, it.to, k);
      it.turn += dt * STAR_SHOT.spin;
      const size = STAR_SHOT.size * it.big;
      starAt(it.pos.x, it.pos.y, it.pos.z, size, it.turn, STAR_SHOT.halo);
      it.trail -= dt;
      while (it.trail <= 0) {
        it.trail += STAR_SHOT.trailEvery * (low ? 2 : 1);
        sparkle(it.pos.x + rnd(0.07), it.pos.y + rnd(0.07), it.pos.z + rnd(0.07), rnd(0.35), 0.15 + rnd(0.3), rnd(0.35), STAR_SHOT.trailLife * (0.7 + Math.random() * 0.5), 0.11 + Math.random() * 0.1 * it.big, 0.6);
      }
      if (k >= 1) {
        shots.splice(i, 1); stats.landed++;
        const fn = it.onLand;
        if (fn) { try { fn(it.pos.clone()); } catch { /* an impact that cannot draw is not worth a crash */ } }
      }
    }

    // falling stars
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i], pl = f.plan;
      if (f.done) { falls.splice(i, 1); continue; }
      f.t = now - f.born;                                      // the wall clock: it lands `landMs` after its event whatever the frame rate
      const at = skyAt(pl, f.t);
      const x = pl.x + at.ox, y = f.gy + at.oy, z = pl.z + at.oz;
      f.turn += dt * 9;
      starAt(x, y, z, pl.size, f.turn, 0.9);
      // the tail: a blade from the star back up the way it came, turned to face the camera
      _y.set(pl.dx, pl.height, pl.dz).normalize();
      _to.copy(camera.position).sub(_p.set(x, y, z));
      _x.crossVectors(_y, _to).normalize(); _zv.crossVectors(_x, _y);
      _qg.setFromRotationMatrix(_basis.makeBasis(_x, _y, _zv));
      const grow = Math.min(1, at.k * 5 + 0.15), tl = pl.tail * grow, tw = pl.size * 0.95;
      B.streak.put(_p.set(x, y, z), _qg, tw, tl, tw, GR, GG, GB);
      B.streak.put(_p, _qg, tw * 0.45, tl * 0.6, tw * 0.45, pale.r, pale.g, pale.b);
      f.trail -= dt;
      while (f.trail <= 0) {
        f.trail += (pl.big ? 0.016 : 0.03) * (low ? 2 : 1);
        sparkle(x + rnd(0.3) * pl.size, y + rnd(0.3) * pl.size + 0.3, z + rnd(0.3) * pl.size, rnd(0.8), 0.6 + Math.random(), rnd(0.8), 0.35 + Math.random() * 0.4, (0.14 + Math.random() * 0.16) * (pl.big ? 1.3 : 1), 1.5);
      }
      // the mark on the ground while it falls: the spot's edge, and a second ring closing on the centre as it nears
      const gy = lie(pl.x, pl.z, Math.min(2.5, pl.r * 0.6), _qg) + 0.09;
      const pulse = 0.55 + 0.25 * Math.sin(f.t * 0.02);
      B.ring.put(_p.set(pl.x, gy, pl.z), _qg, pl.r, 1, pl.r, GR * pulse, GG * pulse, GB * pulse);
      const close = Math.max(0.08, 1 - at.k) * pl.r;
      B.ring.put(_p, _qg, close, 1, close, GR * 0.9, GG * 0.9, GB * 0.9);
      if (f.t >= pl.landMs) land(f);
    }

    // zones: the rune wherever it is this frame
    for (const zn of zones.values()) {
      zn.t += ms;
      if (zn.follow != null) { const a = actors?.get?.(zn.follow); if (a) { zn.x = a.pos.x; zn.z = a.pos.z; } }
      if (zn.x !== zn.lx || zn.z !== zn.lz) { zn.gy = lie(zn.x, zn.z, Math.min(3, zn.r * 0.6), zn.q) + 0.1; zn.lx = zn.x; zn.lz = zn.z; }
      const end = zn.endAt >= 0 ? zn.endAt : zn.ms;
      const fade = Math.min(1, zn.t / 300) * Math.max(0, Math.min(1, (end - zn.t) / (zn.endAt >= 0 ? 250 : 500)));
      if (zn.t >= end) { zones.delete(zn.key); continue; }
      const breathe = 0.8 + 0.2 * Math.sin(zn.t * 0.004), k = fade * breathe * (zn.field ? 1 : 0.8);
      _p.set(zn.x, zn.gy, zn.z);
      _qg.copy(zn.q).multiply(_q.setFromAxisAngle(UP, zn.spin + zn.t * 0.00028));
      B.runeOuter.put(_p, _qg, zn.r, 1, zn.r, GR * k, GG * k, GB * k);
      _qg.copy(zn.q).multiply(_q.setFromAxisAngle(UP, -zn.spin - zn.t * 0.00045));
      const inner = zn.r * 0.74;
      B.runeInner.put(_p, _qg, inner, 1, inner, GR * k, GG * k, GB * k);
      // motes rising off it
      zn.mote -= dt;
      while (zn.mote <= 0 && fade > 0.3) {
        zn.mote += (zn.field ? 0.075 : 0.15) * (low ? 2 : 1) * (6 / Math.max(3, zn.r));
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * zn.r * 0.95, mx = zn.x + Math.cos(a) * d, mz = zn.z + Math.sin(a) * d;
        sparkle(mx, groundY(mx, mz) + 0.1, mz, rnd(0.12), 0.7 + Math.random() * 0.8, rnd(0.12), 0.9 + Math.random() * 0.7, 0.1 + Math.random() * 0.12, -0.2);
      }
      if (zn.mote <= 0) zn.mote = 0.1;
    }

    // Wheeling Stars
    for (let i = orbits.length - 1; i >= 0; i--) {
      const o = orbits[i], a = actors?.get?.(o.id);
      o.t += ms;
      if (o.t >= o.ms || !a || a.dead) { orbits.splice(i, 1); continue; }
      const grow = Math.min(1, o.t / 350) * Math.min(1, (o.ms - o.t) / 350), h = a.height || 1.7;
      o.trail -= dt;
      const drop = o.trail <= 0; if (drop) o.trail = low ? 0.09 : 0.045;
      for (let j = 0; j < o.count; j++) {
        const ang = o.t * 0.0029 + (j / o.count) * TAU, rad = 1.25 * grow + 0.1;
        const x = a.pos.x + Math.cos(ang) * rad, y = a.pos.y + h * 0.62 + Math.sin(o.t * 0.004 + j * 2.1) * 0.16, z = a.pos.z + Math.sin(ang) * rad;
        starAt(x, y, z, 0.27 * grow, o.t * 0.006 + j, 0.9);
        if (drop) sparkle(x, y, z, rnd(0.15), rnd(0.15), rnd(0.15), 0.4, 0.1 + Math.random() * 0.06, 0);
      }
    }

    // the Constellation: one mote for each Starlight, in five fixed seats round the head
    for (const [id, m] of motes) {
      const a = actors?.get?.(id);
      if (!a || a.dead) continue;
      const full = m.n >= 5, hy = a.pos.y + (a.height || 1.7) + 0.28;
      for (let i = 0; i < m.n; i++) {
        const s = moteSeat(i, time, full);
        const born = i === m.n - 1 ? Math.min(1, (time - m.grew) / 0.25) : 1;          // the newest one swells in
        const x = a.pos.x + Math.cos(s.a) * 0.46, z = a.pos.z + Math.sin(s.a) * 0.46, y = hy + s.bob;
        const size = (full ? 0.115 : 0.095) * (0.4 + 0.6 * born) * (1 + (1 - born) * 1.2);
        glowAt(x, y, z, size * 1.7, time * 1.5 + i, full ? 0.8 : 0.55);
        glowAt(x, y, z, size, -time * 2 + i, 0.9, 0.5);
      }
      if (full && Math.random() < dt * (low ? 5 : 12)) { const s = moteSeat((Math.random() * 5) | 0, time, true); sparkle(a.pos.x + Math.cos(s.a) * 0.46, hy, a.pos.z + Math.sin(s.a) * 0.46, rnd(0.2), 0.4, rnd(0.2), 0.5, 0.08, 0); }
    }

    // flashes, rings, pillars
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += ms;
      if (f.t >= f.ms) { flashes.splice(i, 1); continue; }
      if (f.t < 0) continue;
      const k = f.t / f.ms, out = 1 - k;
      if (f.kind === 'flash') {
        const s = f.size * (0.35 + 0.65 * Math.sqrt(k));
        glowAt(f.x, f.y, f.z, s, 0.3 + k, out * out, 0.6);
        glowAt(f.x, f.y, f.z, s * 0.75, Math.PI / 4 - k, out, 0.3);
      } else if (f.kind === 'ring') {
        let x = f.x, z = f.z;
        if (f.follow != null) { const a = actors?.get?.(f.follow); if (a) { x = a.pos.x; z = a.pos.z; } }
        const e = 1 - out * out * out, r = f.r0 + (f.r1 - f.r0) * e;
        const gy = lie(x, z, Math.min(2.5, Math.max(0.5, r * 0.6)), _qg) + 0.11, b = out * 1.25;
        B.ring.put(_p.set(x, gy, z), _qg, r, 1, r, GR * b, GG * b, GB * b);
      } else if (f.kind === 'mark') {
        // a steady edge on the ground for as long as stars are still coming down inside it
        const gy = lie(f.x, f.z, Math.min(3, f.r * 0.6), _qg) + 0.08, b = Math.min(1, f.t / 250) * Math.min(1, (f.ms - f.t) / 400) * (0.5 + 0.15 * Math.sin(f.t * 0.006));
        B.ring.put(_p.set(f.x, gy, f.z), _qg, f.r, 1, f.r, GR * b, GG * b, GB * b);
      } else if (f.kind === 'pillar') {
        _y.copy(UP); _to.copy(camera.position).sub(_p.set(f.x, f.y, f.z)); _to.y = 0;
        _x.crossVectors(_y, _to).normalize(); _zv.crossVectors(_x, _y);
        _qg.setFromRotationMatrix(_basis.makeBasis(_x, _y, _zv));
        B.streak.put(_p, _qg, f.w * (1 + k), f.h * (0.6 + 0.6 * k), f.w, GR * out, GG * out, GB * out);
      }
    }

    // sparkles
    if (spLive) {
      for (let i = 0; i < SN; i++) {
        if (!sp.on[i]) continue;
        sp.t[i] += dt;
        const k = sp.t[i] / sp.life[i];
        if (k >= 1) { sp.on[i] = 0; spLive--; continue; }
        sp.vy[i] -= sp.grav[i] * dt;
        sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt; sp.z[i] += sp.vz[i] * dt;
        const tw = 0.75 + 0.25 * Math.sin(sp.t[i] * 22 + sp.seed[i]);
        glowAt(sp.x[i], sp.y[i], sp.z[i], sp.size[i] * (1 - k * 0.55), sp.seed[i] + sp.t[i] * 3, (1 - k) * tw, 0.25);
      }
    }

    for (const b of Object.values(B)) b.end();
    drawn = true;
  }

  /** One instanced mesh of each material, visible, for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group(); g.name = 'star-fx-samples';
    const one = (geo, mat, x) => { const m = new THREE.InstancedMesh(geo, mat, 1); m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, 0)); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.frustumCulled = false; return m; };
    g.add(one(GEO.star, solidMat, 0), one(GEO.glow, glowMat, 2));
    return g;
  }

  return {
    onFx, onCast, onImpact, shot, skyfall, zone, zoneMove, zoneEnd, hasZone, orbs, setMotes, burst, groundBurst, ownerGone, update, sample, stats, group,
    /** What is on screen right now (specs and screenshots). */
    live: () => ({
      shots: shots.map(s => ({ k: +(s.t / s.ms).toFixed(2), x: s.pos.x, y: s.pos.y, z: s.pos.z })),
      falls: falls.map(f => ({ k: +(f.plan.landMs ? f.t / f.plan.landMs : 1).toFixed(2), x: f.plan.x, z: f.plan.z, y: f.gy + skyAt(f.plan, f.t).oy })),
      zones: [...zones.values()].map(z => ({ key: z.key, x: z.x, z: z.z, r: z.r, follow: z.follow })),
      orbits: orbits.map(o => ({ id: o.id, count: o.count })), motes: Object.fromEntries([...motes].map(([id, m]) => [id, m.n])), sparkles: spLive,
      instances: Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b.mesh.count])), peak: Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b.peak])),
    }),
    /** Specs only: run the stars on another clock (a slowed one, so a burst that lasts a quarter of a second can be looked at). null = the real one. */
    setClock(fn) { clock = typeof fn === 'function' ? fn : () => performance.now(); lastT = 0; },
    dispose() { scene.remove(group); for (const g of Object.values(GEO)) g.dispose(); solidMat.dispose(); glowMat.dispose(); },
  };
}
