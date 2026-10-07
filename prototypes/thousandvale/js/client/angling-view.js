// Angling in the world (play-test 5, T25): the rod in the hand, the cast and the reel, the float and its line, the
// splash of a bite, the catch held up — and the fish pools you can see from the road.
//
// What the server says (docs/requests.md "Round 5 contracts — A"):
//   ev fx {kind:'fish', id (the angler), phase:'cast'|'bite'|'tug'|'catch'|'lost'|'end', x, z, rarity?}   to everyone near
//   info.fishing = {x, z}                       while a line is out (someone who walks up late still sees the float)
//   room objects type 'fishpool', info.pool = {tier, minSkill, left, water}       (they vanish at 0 and open elsewhere)
// and for your own line D-UI raises `tv:fish` on `window` with `detail: {state, tension}` (the tug's bar bends the rod).
//
//   cast    the body plays `fishCast` (weapons put away), the float flies out from the rod tip and lands with a ring
//   wait    `fishWait`; the float rides the water, bobbing; the line hangs slack from the tip
//   bite    the float is pulled under and jumps; two fast rings and a spray of water
//   tug     `fishReel`; the float darts about on a taut line, ring after ring
//   catch   the fish comes out of the water in an arc into the off hand and is held up (`fishShow`), tinted by rarity
//   lost    the float pops back up, one ring, the line goes slack and is wound in
//
// A POOL is three slow rings spreading on the water, a pale glitter, and every few seconds a fish that jumps clear and
// falls back with a splash — bright and tall enough to read from 80 m. Its colour says its tier (pale / teal / gold).
//
// Cost: a rod, float, line and fish per ANGLER IN VIEW (built when they cast, dropped when they stop); per pool three
// rings and one fish. Every material here has a twin in `sample()`, which the boot warm-up compiles (P1: no first-use
// stutter); pools further than 220 m are hidden and not animated.
//
//   const angling = createAngling(scene, { actors, forms, spellFx: spells.fx, waterAt, groundY, camera })
//   angling.onEvent(ev) · angling.setLine(id, info.fishing) · angling.setPool(id, {x, z}, info.pool) · angling.removePool(id)
//   angling.update(dt, now)

import * as THREE from 'three';
import { ROD_MOUNT, CATCH_MOUNT } from '../../../../avatar-3d/js/chibi2-motion-dual.js';

export const ROD_LENGTH = 1.5;                      // bone units (about 1.9 m on a human)
export const RARITY_TINT = { common: '#c8d2d6', junk: '#8a7a62', uncommon: '#6ad07a', magic: '#6ad07a', rare: '#5aa0ff', epic: '#c080ff', legendary: '#ffb040', legend: '#ffb040', crate: '#c99a3a' };
export const POOL_TINT = { 1: '#cfeaff', 2: '#7fe6d8', 3: '#ffd870' };
const PHASES = new Set(['cast', 'wait', 'bite', 'tug', 'catch', 'lost', 'end', 'idle']);
/** What a phase means for the pieces. Pure — exported for tests. */
export function phasePlan(phase) {
  const p = PHASES.has(phase) ? phase : 'end';
  return {
    phase: p,
    rod: p !== 'end' && p !== 'idle',
    float: p === 'cast' || p === 'wait' || p === 'bite' || p === 'tug',
    line: p === 'cast' || p === 'wait' || p === 'bite' || p === 'tug' || p === 'lost',
    taut: p === 'tug' || p === 'bite',
    body: p === 'tug' ? 'tug' : p === 'cast' || p === 'wait' || p === 'bite' ? 'wait' : null,
    clip: p === 'cast' ? 'fishCast' : p === 'catch' ? 'fishShow' : null,
    fish: p === 'catch',
  };
}
/** `n` points of a line from the rod tip to the float: slack hangs in a curve, taut is straight. Pure. */
export function linePoints(tip, float, slack = 0.5, n = 12) {
  const out = [], sag = Math.max(0, slack) * Math.min(1.2, Math.hypot(float.x - tip.x, float.z - tip.z) * 0.12);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); out.push([tip.x + (float.x - tip.x) * t, tip.y + (float.y - tip.y) * t - Math.sin(Math.PI * t) * sag, tip.z + (float.z - tip.z) * t]); }
  return out;
}
/** When (seconds, repeating) the fish of pool `id` jumps: a stable 3.5-7 s rhythm per pool. Pure. */
export function jumpPeriod(id) { let h = 2166136261; for (const c of String(id)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return 3.5 + ((h >>> 0) % 1000) / 1000 * 3.5; }

/** Pieces with a colour each, merged into one vertex-coloured geometry. */
function merged(pieces) {
  let n = 0; for (const { g } of pieces) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
  let o = 0;
  for (const { g, c } of pieces) {
    const cnt = g.attributes.position.count, cc = new THREE.Color(c);
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = cc.r; col[(o + i) * 3 + 1] = cc.g; col[(o + i) * 3 + 2] = cc.b; }
    if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < cnt; i++) idx.push(i + o);
    o += cnt;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}
/** The rod: cork grip in the fist, a reel under it, a tapering blank with three guides. Along +y, butt at the origin. */
export function rodGeometry() {
  const cyl = (r0, r1, y0, y1, seg = 6) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg); g.translate(0, (y0 + y1) / 2, 0); return g; };
  const pieces = [
    { g: cyl(0.02, 0.018, -0.1, 0.1), c: '#b08a5a' },                     // cork grip (the fist closes round y = 0)
    { g: cyl(0.016, 0.011, 0.1, 0.55), c: '#3a2a1c' },
    { g: cyl(0.011, 0.007, 0.55, 1.05), c: '#4a3524' },
    { g: cyl(0.007, 0.003, 1.05, ROD_LENGTH), c: '#5a4230' },
    { g: cyl(0.022, 0.022, -0.12, -0.1), c: '#2a2018' },
  ];
  const reel = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10); reel.rotateZ(Math.PI / 2); reel.translate(0, 0.15, 0.045); pieces.push({ g: reel, c: '#9aa2ac' });
  for (const y of [0.5, 0.95, 1.3, ROD_LENGTH - 0.01]) { const t = new THREE.TorusGeometry(0.014, 0.003, 4, 8); t.rotateX(Math.PI / 2); t.translate(0, y, 0.016); pieces.push({ g: t, c: '#c8ccd6' }); }
  return merged(pieces);
}
/** A float: red over white, with a little stem. Centred on the waterline. */
export function floatGeometry() {
  const top = new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const bot = new THREE.SphereGeometry(0.085, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5); stem.translate(0, 0.14, 0);
  return merged([{ g: top, c: '#e8402a' }, { g: bot, c: '#f4f0e6' }, { g: stem, c: '#2a2018' }]);
}
/** A fish about 0.5 units long, nose toward +z: body, tail, back fin. */
export function fishGeometry() {
  const body = new THREE.SphereGeometry(1, 10, 7); body.scale(0.07, 0.11, 0.24);
  const belly = new THREE.SphereGeometry(1, 8, 5); belly.scale(0.062, 0.07, 0.2); belly.translate(0, -0.045, 0.01);
  const tail = new THREE.ConeGeometry(0.11, 0.16, 4); tail.scale(0.25, 1, 1); tail.rotateX(-Math.PI / 2); tail.translate(0, 0, -0.3);
  const fin = new THREE.ConeGeometry(0.05, 0.1, 4); fin.scale(0.2, 1, 1.4); fin.translate(0, 0.13, -0.02);
  return merged([{ g: body, c: '#7f9aa8' }, { g: belly, c: '#e6ecee' }, { g: tail, c: '#5f7a88' }, { g: fin, c: '#5f7a88' }]);
}

export function createAngling(scene, { actors = null, forms = null, spellFx = null, waterAt = () => null, groundY = () => 0, camera = null, selfId = () => null } = {}) {
  const P = forms?.prims || null;
  const solid = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  const rodGeo = rodGeometry(), floatGeo = floatGeometry(), fishGeo = fishGeometry();
  const rodMat = solid(), floatMat = solid();
  const lineMat = new THREE.LineBasicMaterial({ color: '#eef4f6', transparent: true, opacity: 0.75, fog: true });
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const lines = new Map();        // angler id -> state
  const pools = new Map();        // pool id -> state
  const stats = { casts: 0, bites: 0, catches: 0, lost: 0, pools: 0, jumps: 0 };
  const _tip = new THREE.Vector3(), _v = new THREE.Vector3();
  const surface = (x, z) => { const w = waterAt(x, z); return w && Number.isFinite(w.surface) ? w.surface : groundY(x, z) + 0.02; };
  const splash = (x, z, r = 0.9, tint = 'ice') => { const y = surface(x, z); P?.ring(x, z, r, tint, { life: 0.5, from: 0.15, opacity: 0.9, y }); P?.ring(x, z, r * 0.6, tint, { life: 0.4, from: 0.2, opacity: 0.6, delay: 0.08, y }); };
  const spray = (x, z, scale = 0.5) => { try { spellFx?.impact({ at: new THREE.Vector3(x, surface(x, z) + 0.15, z), element: 'ice', scale, ground: surface(x, z), height: 1, density: 0.5 }); } catch {} };

  // ---- one angler's line ------------------------------------------------------------------------------------
  function stateOf(id) {
    let s = lines.get(id);
    if (!s) { s = { id, phase: 'idle', t: 0, x: 0, z: 0, has: false, rod: null, float: null, line: null, fish: null, tension: 0, rarity: null, seen: performance.now() }; lines.set(id, s); }
    return s;
  }
  function ensurePieces(s) {
    if (!s.rod) { s.rod = new THREE.Mesh(rodGeo, rodMat); s.rod.castShadow = true; s.rod.position.set(...ROD_MOUNT.position); s.rod.rotation.set(...ROD_MOUNT.rotation); s.rod.frustumCulled = false; }
    if (!s.float) { s.float = new THREE.Mesh(floatGeo, floatMat); s.float.visible = false; s.float.frustumCulled = false; scene.add(s.float); }
    if (!s.line) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
      s.line = new THREE.Line(g, lineMat); s.line.visible = false; s.line.frustumCulled = false; scene.add(s.line);
    }
  }
  function drop(s) {
    if (s.rod) s.rod.parent?.remove(s.rod);
    if (s.float) scene.remove(s.float);
    if (s.line) { scene.remove(s.line); s.line.geometry.dispose(); }
    if (s.fish) { s.fish.parent?.remove(s.fish); s.fish.material.dispose(); }
    actors?.setFishing?.(s.id, null);
    lines.delete(s.id);
  }
  /** Where a line lands when the server has not said: 5 m ahead of the angler. */
  function ahead(a) { return { x: a.pos.x + Math.sin(a.yaw || 0) * 5, z: a.pos.z + Math.cos(a.yaw || 0) * 5 }; }

  function setPhase(id, phase, data = {}) {
    if (!PHASES.has(phase)) return;
    const a = actors?.get(id);
    if (phase === 'end' || phase === 'idle') { const s = lines.get(id); if (s) { if (s.phase === 'catch' && s.t < 1.9) s.endAfter = 1.9; else drop(s); } return; }
    if (!a) return;
    const s = stateOf(id), plan = phasePlan(phase), same = s.phase === phase;
    if (Number.isFinite(data.x) && Number.isFinite(data.z)) { s.x = data.x; s.z = data.z; s.has = true; }
    else if (!s.has) { const p = ahead(a); s.x = p.x; s.z = p.z; s.has = true; }
    if (data.rarity) s.rarity = data.rarity;
    if (Number.isFinite(data.tension)) s.tension = Math.max(0, Math.min(1, data.tension));
    if (same) return;
    if (phase === 'wait' && s.phase === 'cast' && s.t < 1.0) return;      // the cast is still in the air: it becomes the wait by itself
    ensurePieces(s);
    s.phase = phase; s.t = 0; s.endAfter = null; s.seen = performance.now();
    actors.setFishing?.(id, plan.body);
    if (plan.clip) actors.playClip?.(id, plan.clip);
    if (phase === 'cast') { stats.casts++; s.fx = s.x; s.fz = s.z; }
    else if (phase === 'bite') { stats.bites++; splash(s.x, s.z, 1.0); spray(s.x, s.z, 0.45); }
    else if (phase === 'tug') splash(s.x, s.z, 0.8);
    else if (phase === 'lost') { stats.lost++; splash(s.x, s.z, 0.7); s.endAfter = 0.8; }
    else if (phase === 'catch') {
      stats.catches++; splash(s.x, s.z, 1.3); spray(s.x, s.z, 0.7);
      if (!s.fish) { s.fish = new THREE.Mesh(fishGeo, solid()); s.fish.castShadow = true; s.fish.frustumCulled = false; }
      s.fish.material.color.set(RARITY_TINT[s.rarity] || RARITY_TINT.common).lerp(new THREE.Color('#ffffff'), 0.35);
      const big = s.rarity === 'legendary' || s.rarity === 'legend' ? 1.7 : s.rarity === 'epic' ? 1.4 : s.rarity === 'rare' ? 1.2 : 1;
      s.fish.scale.setScalar(big); s.fishFrom = new THREE.Vector3(s.x, surface(s.x, s.z), s.z);
      scene.add(s.fish); s.fishHeld = false;
      s.endAfter = 2.3;
    }
  }

  function updateLine(s, dt, now) {
    const a = actors?.get(s.id);
    if (!a || a.dead) { drop(s); return; }
    s.t += dt;
    if (s.endAfter != null && s.t >= s.endAfter) { drop(s); return; }
    // walking off with a line out ends it on this screen too (the server says so a moment later)
    if (a.speed > 1.2 && s.t > 0.4 && s.phase !== 'catch') { drop(s); return; }
    const plan = phasePlan(s.phase), parts = a.body?.parts, far = a.lod === 'far' || !parts;
    // the rod rides the hand bone (a re-dress swaps the skeleton: re-parent when it changed)
    if (plan.rod && !far) { const bone = parts[ROD_MOUNT.bone]; if (bone && s.rod.parent !== bone) bone.add(s.rod); s.rod.visible = true; }
    else if (s.rod) s.rod.visible = false;
    // the rod bends back as the tension climbs
    s.rod.rotation.x = ROD_MOUNT.rotation[0] + (plan.taut ? -0.18 * (0.4 + s.tension) : 0);
    const y = surface(s.x, s.z);
    if (far) { s.float.visible = plan.float; s.float.position.set(s.x, y, s.z); s.line.visible = false; return; }
    s.rod.updateWorldMatrix(true, false);
    _tip.set(0, ROD_LENGTH, 0).applyMatrix4(s.rod.matrixWorld);
    // the float
    let fx = s.x, fz = s.z, fy = y, shown = plan.float;
    if (s.phase === 'cast') {
      // it leaves the tip as the arm whips forward (0.5 s in) and lands 0.45 s later
      const k = (s.t - 0.5) / 0.45;
      if (k < 0) shown = false;
      else if (k < 1) { fx = _tip.x + (s.x - _tip.x) * k; fz = _tip.z + (s.z - _tip.z) * k; fy = _tip.y + (y - _tip.y) * k + Math.sin(Math.PI * k) * 1.6; }
      else if (!s.landed) { s.landed = true; splash(s.x, s.z, 0.8); }
    } else s.landed = true;
    if (s.phase === 'wait' || (s.phase === 'cast' && s.landed)) fy = y + Math.sin(now / 520 + s.x) * 0.025;
    else if (s.phase === 'bite') fy = y - 0.1 + Math.sin(s.t * 26) * 0.06;
    else if (s.phase === 'tug') {
      const q = s.t * 3.1 + Math.sin(s.t * 1.7) * 1.3, r = 0.35 + 0.35 * s.tension;
      fx = s.x + Math.cos(q) * r; fz = s.z + Math.sin(q * 1.3) * r; fy = y - 0.06 + Math.sin(s.t * 19) * 0.04;
      if (((s.t * 1.6) | 0) !== (((s.t - dt) * 1.6) | 0)) splash(fx, fz, 0.6);
    } else if (s.phase === 'lost') fy = y + 0.05 * Math.max(0, 1 - s.t * 3);
    s.float.visible = shown; s.float.position.set(fx, fy, fz); s.float.rotation.z = Math.sin(now / 300 + s.z) * 0.25;
    // the line
    const end = shown ? s.float.position : (s.phase === 'catch' && s.fish && !s.fishHeld ? s.fish.position : null);
    s.line.visible = (plan.line || s.phase === 'catch') && !!end;
    if (s.line.visible) {
      const pts = linePoints(_tip, end, plan.taut || s.phase === 'catch' ? 0.05 : s.phase === 'cast' ? 0.2 : 1), arr = s.line.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i++) { arr[i * 3] = pts[i][0]; arr[i * 3 + 1] = pts[i][1]; arr[i * 3 + 2] = pts[i][2]; }
      s.line.geometry.attributes.position.needsUpdate = true;
    }
    // the catch: out of the water in an arc to the off hand, then held up with the hand
    if (s.phase === 'catch' && s.fish) {
      const bone = parts[CATCH_MOUNT.bone];
      if (!s.fishHeld) {
        const k = Math.min(1, s.t / 0.45);
        bone.getWorldPosition(_v);
        s.fish.position.lerpVectors(s.fishFrom, _v, k); s.fish.position.y += Math.sin(Math.PI * k) * 1.2;
        s.fish.rotation.set(-1.2 + k * 2, now / 90, 0);
        if (k >= 1) { s.fishHeld = true; bone.add(s.fish); s.fish.position.set(...CATCH_MOUNT.position); s.fish.rotation.set(...CATCH_MOUNT.rotation); }
      } else { if (s.fish.parent !== bone) bone.add(s.fish); s.fish.rotation.z = Math.sin(now / 70) * 0.35 * Math.max(0, 1 - (s.t - 0.45) / 1.2); }
    }
  }

  // ---- pools ------------------------------------------------------------------------------------------------
  function setPool(id, at, info = null) {
    let p = pools.get(id);
    const left = info?.left;
    if (p && left != null && left <= 0) { removePool(id, true); return; }
    if (!p) {
      if (!at || !Number.isFinite(at.x)) return;
      p = { id, x: at.x, z: at.z, tier: info?.tier || 1, shelf: !!info?.shelf, rings: [], fish: null, period: jumpPeriod(id), t: 0, y: surface(at.x, at.z), jump: -1, jumpYaw: 0 };
      const tint = POOL_TINT[p.tier] || POOL_TINT[1];
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(ringGeo, ringMat()); m.material.color.set(tint); m.position.set(p.x, p.y + 0.04, p.z); m.renderOrder = 2; m.frustumCulled = false; scene.add(m); p.rings.push(m); }
      p.fish = new THREE.Mesh(fishGeo, solid()); p.fish.visible = false; p.fish.scale.setScalar((1.6 + p.tier * 0.3) * (p.shelf ? 0.6 : 1));        // E: a `shelf` pool is ankle-deep — a small fish, a low hop p.fish.material.color.set(tint).lerp(new THREE.Color('#ffffff'), 0.5); scene.add(p.fish);
      pools.set(id, p); stats.pools = pools.size;
    }
    if (at && Number.isFinite(at.x)) { p.x = at.x; p.z = at.z; p.y = surface(p.x, p.z); }
    if (info?.tier && info.tier !== p.tier) { p.tier = info.tier; for (const m of p.rings) m.material.color.set(POOL_TINT[p.tier] || POOL_TINT[1]); }
  }
  function removePool(id, fished = false) {
    const p = pools.get(id); if (!p) return;
    if (fished) splash(p.x, p.z, 2.4);
    for (const m of p.rings) { scene.remove(m); m.material.dispose(); }
    scene.remove(p.fish); p.fish.material.dispose();
    pools.delete(id); stats.pools = pools.size;
  }
  function updatePool(p, dt, now) {
    const cp = camera?.position, d = cp ? Math.hypot(p.x - cp.x, p.z - cp.z) : 0, on = d < 220;
    for (const m of p.rings) m.visible = on;
    if (!on) { p.fish.visible = false; return; }
    p.t += dt;
    if (!(p.y > -1e5)) p.y = surface(p.x, p.z);
    // three rings, each 2.6 s from the middle out to 2.8 m, a third of a cycle apart — bigger and brighter from afar
    const R = 2.8 + (d > 60 ? 0.8 : 0);
    p.rings.forEach((m, i) => {
      const k = ((p.t / 2.6) + i / 3) % 1;
      m.position.set(p.x, p.y + 0.04, p.z); m.scale.setScalar(0.25 + R * k); m.material.opacity = (d > 60 ? 0.85 : 0.6) * (1 - k) * Math.min(1, k * 6);
    });
    // the jumper
    if (p.jump < 0 && p.t >= p.next0()) { p.jump = 0; p.jumpYaw = (p.t * 2.399) % (Math.PI * 2); stats.jumps++; splash(p.x - Math.sin(p.jumpYaw) * 0.8, p.z - Math.cos(p.jumpYaw) * 0.8, 0.9); }
    if (p.jump >= 0) {
      p.jump += dt / 0.95;
      const k = p.jump, sx = Math.sin(p.jumpYaw), cz = Math.cos(p.jumpYaw), along = -0.8 + 1.6 * k, h = Math.sin(Math.PI * k) * (1.3 + p.tier * 0.2) * (p.shelf ? 0.5 : 1);
      p.fish.visible = k < 1; p.fish.position.set(p.x + sx * along, p.y + h - 0.1, p.z + cz * along);
      p.fish.rotation.set(-Math.cos(Math.PI * k) * 1.1, p.jumpYaw, 0, 'YXZ');
      if (k >= 1) { p.jump = -1; p.lastJump = p.t; splash(p.x + sx * 0.8, p.z + cz * 0.8, 1.2); if (d < 45) spray(p.x + sx * 0.8, p.z + cz * 0.8, 0.4); }
    }
  }
  /** (set on each pool) the time of its next jump */
  const withNext = p => { p.lastJump = p.lastJump ?? -p.period * 0.5; p.next0 = () => p.lastJump + p.period; return p; };

  // ---- events -----------------------------------------------------------------------------------------------
  function onEvent(ev) {
    if (!ev || ev.type !== 'fx' || ev.kind !== 'fish') return false;
    setPhase(ev.id, ev.phase, { x: ev.x, z: ev.z, rarity: ev.rarity || (ev.what === 'crate' ? 'crate' : null) });
    return true;
  }
  /** `info.fishing` from the mirror: a line is out there (or no longer). A cast that is already playing is left alone. */
  function setLine(id, fishing) {
    const s = lines.get(id);
    if (fishing && Number.isFinite(fishing.x)) { if (!s || s.phase === 'idle') setPhase(id, 'wait', fishing); else { s.x = fishing.x; s.z = fishing.z; s.has = true; s.seen = performance.now(); } }
    else if (s && s.phase !== 'catch' && s.phase !== 'lost' && s.t > 1.2) drop(s);
  }
  /** D-UI's `tv:fish` for your own line: the state names of the interface, and the tug's tension for the rod. */
  function onLocal(detail) {
    const id = selfId(); if (id == null || !detail) return;
    const st = detail.state === 'idle' ? 'end' : detail.state;
    if (st === 'tug' || st === 'bite' || st === 'wait') { const s = lines.get(id); if (s && s.phase === st) { if (Number.isFinite(detail.tension)) s.tension = detail.tension; return; } }
    // the interface may only say 'wait' (after the server's answer): with no line out yet, that is the cast
    setPhase(id, st === 'wait' && !lines.get(id) ? 'cast' : st, { x: detail.at?.x ?? detail.x, z: detail.at?.z ?? detail.z, rarity: detail.rarity, tension: detail.tension });
  }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('tv:fish', e => { try { onLocal(e.detail); } catch {} });

  function update(dt, now = performance.now()) {
    for (const s of [...lines.values()]) updateLine(s, dt, now);
    for (const p of pools.values()) { if (!p.next0) withNext(p); updatePool(p, dt, now); }
  }
  /** One of everything, visible, for the boot shader warm-up (warmup.js `extras`). */
  function sample() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rodGeo, rodMat), new THREE.Mesh(floatGeo, floatMat), new THREE.Mesh(fishGeo, solid()));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 0, 1, 1, 0]), 3));
    g.add(new THREE.Line(lg, lineMat));
    const r = new THREE.Mesh(ringGeo, ringMat()); r.material.opacity = 0.5; g.add(r);
    for (const c of g.children) if (c.isMesh) c.castShadow = true;
    return g;
  }
  return { onEvent, onLocal, setPhase, setLine, setPool, removePool, update, sample, stats, lines, pools,
    dispose() { for (const s of [...lines.values()]) drop(s); for (const id of [...pools.keys()]) removePool(id); for (const g of [rodGeo, floatGeo, fishGeo, ringGeo]) g.dispose(); } };
}
