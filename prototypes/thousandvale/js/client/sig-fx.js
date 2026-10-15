// Class signature spell effects, drawn (2026-10-14). What to draw is decided in sig-looks.js (pure, tested); this file
// is only the drawing. It sits ON TOP of the generic element effects (spells.js) and adds who cast it: the class's own
// Codex-drawn shapes in the class's own colours —
//
//   * a THROWN head that flies the server's own flight time (spinning, bobbing, zigzagging or tumbling by class) and
//     sheds the class's shards behind it, bursting into a spray of shards where it lands;
//   * a beam's STREAM of heads racing down the line, a melee ARC of shards across the swing, a dash's PATH of afterimages;
//   * a GROUND sigil (the class glyph laid flat, turning — or ticking like a clock hand) with shapes circling its rim and
//     motes rising off it, under the caster or at the aim, the size of the spell;
//   * a CAST bloom round the caster (rising, spiralling, orbiting, falling from above, a flare, an expanding ring).
//
// How it is built: ONE instanced quad mesh and ONE shader for everything; every motif lives in a single atlas texture
// (rasterised once from the SVGs); particles are plain typed arrays refilled into the instance buffers each frame. A cast
// creates no geometry, no material and no light — it only writes numbers into slots. Additive, no depth write.
//
//   const sig = createSigFx(scene, { camera, actors, groundY, classOf, skillOf, level })
//   sig.onEvent(ev)   sig.update(dt)   sig.setLevel('enhanced'|'standard'|'reduced'|'off')   sig.sample()   sig.stats

import * as THREE from 'three';
import { MOTIFS, motifSvg } from '../../../../icons/js/motifs.js';
import { sigLook } from './sig-looks.js';
import { drawFor } from './fx-level.js';

const TAU = Math.PI * 2;
const CAP = { enhanced: 1600, reduced: 600 };
const FAR = 70;                       // metres from the camera past which nothing new is drawn
const BIG = 1.55;                     // every sprite's size (tuned against the game camera: smaller read as dust)

// ---------------------------------------------------------------- the atlas
const IDS = Object.keys(MOTIFS);
const COLS = Math.ceil(Math.sqrt(IDS.length || 1));
const CELL = 128;
const CELL_OF = new Map(IDS.map((id, i) => [id, i]));

function buildAtlas() {
  const size = COLS * CELL;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  // each motif is drawn twice: a blurred copy underneath (the glow) and the crisp shape on top
  const jobs = IDS.map((id, i) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL, pad = CELL * 0.14, w = CELL - pad * 2;
      g.save(); g.filter = 'blur(5px)'; g.globalAlpha = 0.75; g.drawImage(img, x + pad, y + pad, w, w); g.restore();
      g.drawImage(img, x + pad, y + pad, w, w);
      res();
    };
    img.onerror = () => res();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(motifSvg(id, CELL));
  }));
  Promise.all(jobs).then(() => { tex.needsUpdate = true; });
  return tex;
}

const VERT = /* glsl */`
  attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iData;   // iData: size, rotation, atlas cell, flat (0 = faces the camera)
  uniform vec3 uRight; uniform vec3 uUp; uniform float uCols;
  varying vec2 vUv; varying vec4 vCol;
  void main() {
    float s = sin(iData.y), c = cos(iData.y);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
    vec3 world = iData.w > 0.5 ? iPos + vec3(q.x, 0.0, q.y) : iPos + uRight * q.x + uUp * q.y;
    float cell = iData.z;
    vec2 base = vec2(mod(cell, uCols), floor(cell / uCols));
    vUv = (base + vec2(uv.x, 1.0 - uv.y)) / uCols;
    vUv.y = 1.0 - vUv.y;
    vCol = iCol;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * 1.8, min(1.0, a * 1.25));       // additive blending multiplies by alpha itself
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createSigFx(scene, { camera, actors, groundY = () => 0, classOf = () => null, skillOf = () => null, level = 'enhanced', focus = () => ({}) } = {}) {
  const MAX = CAP.enhanced;
  // ---- particle state (structure of arrays) ----
  const px = new Float32Array(MAX * 3), pv = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX), life = new Float32Array(MAX), size0 = new Float32Array(MAX), size1 = new Float32Array(MAX);
  const rot = new Float32Array(MAX), spin = new Float32Array(MAX), grav = new Float32Array(MAX), cell = new Float32Array(MAX), flat = new Uint8Array(MAX);
  const alpha0 = new Float32Array(MAX), drag = new Float32Array(MAX);
  const own = new Int32Array(MAX);              // a sigil's glyph sprites: +id (turns with it) / -id (turns against it, slower)
  let n = 0;                                    // live particles are 0..n-1 (removal swaps the last one in)
  let cap = CAP[level] || 0, on = level === 'enhanced' || level === 'reduced';
  const stats = { spawned: 0, casts: 0, heads: 0, bursts: 0, sigils: 0, dropped: 0, live: 0 };

  // ---- the one mesh ----
  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(quad.index); geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iCol', aCol); geo.setAttribute('iData', aDat);
  geo.instanceCount = 0;
  let atlas = null;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: null }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uCols: { value: COLS } },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'sig-fx';
  scene.add(mesh);
  function ensureAtlas() { if (!atlas && typeof document !== 'undefined') { atlas = buildAtlas(); mat.uniforms.uMap.value = atlas; } }
  if (on) ensureAtlas();

  const _c = new THREE.Color();
  /** One sprite. o: { at:[x,y,z], v:[x,y,z], motif, colour, life, size, size1, spin, rot, gravity, flat, alpha, tick, drag } */
  function spawn(o) {
    if (!on || !o.motif || !CELL_OF.has(o.motif)) return;
    if (n >= cap) { stats.dropped++; return; }
    const i = n++;
    px[i * 3] = o.at[0]; px[i * 3 + 1] = o.at[1]; px[i * 3 + 2] = o.at[2];
    const v = o.v || [0, 0, 0]; pv[i * 3] = v[0]; pv[i * 3 + 1] = v[1]; pv[i * 3 + 2] = v[2];
    _c.set(o.colour || '#ffffff'); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    age[i] = 0; life[i] = o.life || 0.6; size0[i] = (o.size || 0.5) * (o.flat ? 1 : BIG); size1[i] = (o.size1 ?? o.size ?? 0.5) * (o.flat ? 1 : BIG);
    rot[i] = o.rot ?? Math.random() * TAU; spin[i] = o.spin || 0; grav[i] = o.gravity || 0; cell[i] = CELL_OF.get(o.motif);
    flat[i] = o.flat ? 1 : 0; alpha0[i] = o.alpha ?? 1; drag[i] = o.drag || 0; own[i] = o.own || 0;
    stats.spawned++;
  }
  function kill(i) {
    const j = --n; if (i === j) return;
    for (const [A, k] of [[px, 3], [pv, 3], [col, 3]]) for (let c = 0; c < k; c++) A[i * k + c] = A[j * k + c];
    for (const A of [age, life, size0, size1, rot, spin, grav, cell, alpha0, drag, own]) A[i] = A[j];
    flat[i] = flat[j];
  }

  // ---- helpers ----
  const actorAt = id => (id != null ? actors.get(id) : null);
  const chestOf = a => [a.pos.x, a.pos.y + Math.max(0.5, (a.height || 1.6) * 0.6), a.pos.z];
  const gy = (x, z) => groundY(x, z);
  const near = (x, z) => { const c = camera.position; return Math.hypot(x - c.x, z - c.z) < FAR; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const looks = new Map();
  function lookFor(skillId, casterId) {
    if (!skillId || skillId === 'basic' || skillId === 'dot') return null;
    const cls = classOf(skillId, actorAt(casterId));
    if (!cls) return null;
    const key = cls + ':' + skillId;
    if (!looks.has(key)) looks.set(key, sigLook(cls, skillId, skillOf(skillId) || {}));
    return looks.get(key);
  }
  const lite = () => (level === 'reduced' ? 0.45 : 1);

  /** Shards flung from a point. */
  function burst(L, at, { scale = 1, n: count = null } = {}) {
    const B = L.style.burst, P = L.palette, k = lite();
    const m = Math.max(3, Math.round((count ?? L.impact?.n ?? B.n) * k * scale));
    stats.bursts++;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU, sp = B.speed * rnd(0.55, 1.15) * scale;
      spawn({ at, v: [Math.cos(a) * sp, B.up * rnd(0.4, 1.2), Math.sin(a) * sp], motif: i % 3 === 2 ? L.motif.head : L.motif.shard, colour: i % 3 === 0 ? P.accent : i % 5 === 1 ? P.core : P.glow,
        life: B.life * rnd(0.7, 1.2), size: 0.42 * L.size * scale * rnd(0.7, 1.2), size1: 0.12, spin: rnd(-8, 8), gravity: B.gravity, drag: 1.6 });
    }
    // a bright head-shape flash at the centre
    spawn({ at, motif: L.motif.head, colour: P.core, life: 0.32, size: 0.7 * L.size * scale, size1: 1.6 * L.size * scale, spin: L.dir * 3, alpha: 0.9 });
    if (L.impact?.ring || B.ring) {
      const y = gy(at[0], at[2]) + 0.14, r0 = 0.4 * scale, ringN = Math.round(10 * k);
      for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * TAU;
        spawn({ at: [at[0] + Math.cos(a) * r0, y, at[2] + Math.sin(a) * r0], v: [Math.cos(a) * 4.2 * scale, 0, Math.sin(a) * 4.2 * scale], motif: L.motif.shard, colour: P.glow, life: 0.55, size: 0.5 * L.size, size1: 0.2, flat: true, rot: a, drag: 2.2 });
      }
    }
  }

  /** A ground sigil: the glyph flat on the ground, its orbiters and the motes rising off it, for `ms`. */
  const sigils = [], turns = new Map();     // sigil id -> its glyph's angle this frame
  let sigilSeq = 0;
  function sigil(L, x, z, { r = 2, ms = 1400 } = {}) {
    if (!near(x, z)) return;
    stats.sigils++;
    const G = L.style.glyph, k = lite(), y = gy(x, z) + 0.14;      // a hand's width up: the ground mesh is coarser than the height reader
    const s = { id: ++sigilSeq, L, x, z, y, r, until: performance.now() + ms, t: 0, ms, moteAcc: 0, orbit: Math.round((L.ground?.orbit ?? G.orbit) * (k < 1 ? 0.5 : 1)), spin: L.ground?.spin ?? G.spin, tick: L.ground?.tick ?? G.tick, rise: G.rise * k };
    sigils.push(s);
    // the glyph itself: one big flat sprite that lives as long as the sigil (its rotation is driven in update)
    turns.set(s.id, 0);
    spawn({ at: [x, y, z], motif: L.motif.glyph, colour: L.palette.glow, life: ms / 1000, size: r * 2.1, size1: r * 2.25, flat: true, rot: 0, alpha: 1, own: s.id });
    spawn({ at: [x, y + 0.02, z], motif: L.motif.glyph, colour: L.palette.core, life: ms / 1000, size: r * 1.2, size1: r * 1.3, flat: true, rot: 0, alpha: 0.75, own: -s.id });
  }

  /** A thrown head that flies from `from` to `to()` in `ms`, shedding its trail, bursting on arrival. */
  const heads = [];
  function head(L, from, to, ms, { burstAt = true } = {}) {
    stats.heads++;
    heads.push({ L, from, to, ms: Math.max(90, ms || 400), t: 0, acc: 0, phase: Math.random() * TAU, burstAt, last: from.slice() });
  }

  function castBloom(L, a) {
    const C = L.cast; if (!C) return;
    const P = L.palette, [x, , z] = chestOf(a), y = gy(x, z), k = lite(), m = Math.round(C.n * k);
    for (let i = 0; i < m; i++) {
      const ang = (i / m) * TAU, r = rnd(0.5, 1.1);
      const o = { motif: i % 3 ? L.motif.shard : L.motif.head, colour: i % 3 === 2 ? P.accent : P.glow, size: 0.32 * L.size, size1: 0.1, spin: rnd(-4, 4) };
      switch (C.kind) {
        case 'rise': spawn({ ...o, at: [x + Math.cos(ang) * r, y + 0.2, z + Math.sin(ang) * r], v: [0, rnd(1.5, 3), 0], life: 1.0 }); break;
        case 'spiral': spawn({ ...o, at: [x + Math.cos(ang) * 0.9, y + 0.1 + i * 0.12, z + Math.sin(ang) * 0.9], v: [-Math.sin(ang) * 3 * L.dir, 1.8, Math.cos(ang) * 3 * L.dir], life: 0.8, drag: 0.6 }); break;
        case 'orbit': spawn({ ...o, at: [x + Math.cos(ang) * 1.1, y + 1.1, z + Math.sin(ang) * 1.1], v: [-Math.sin(ang) * 3.5 * L.dir, 0.3, Math.cos(ang) * 3.5 * L.dir], life: 0.7 }); break;
        case 'fall': spawn({ ...o, at: [x + Math.cos(ang) * r, y + 3.6 + rnd(0, 1), z + Math.sin(ang) * r], v: [0, -rnd(3, 5), 0], life: 0.75 }); break;
        case 'flare': spawn({ ...o, at: [x, y + 1.0, z], v: [Math.cos(ang) * 4, rnd(0.5, 2), Math.sin(ang) * 4], life: 0.45, drag: 3 }); break;
        default: spawn({ ...o, at: [x + Math.cos(ang) * 0.4, y + 0.14, z + Math.sin(ang) * 0.4], v: [Math.cos(ang) * 3.2, 0, Math.sin(ang) * 3.2], life: 0.55, flat: true, rot: ang, drag: 1.5 });
      }
    }
  }

  // ---- events ----
  const shotSeen = new Map();     // caster -> last skill bolt time (a volley sends one event per arrow)
  function onCast(ev) {
    const a = actorAt(ev.s); if (!a || !near(a.pos.x, a.pos.z)) return;
    const L = lookFor(ev.skill, ev.s); if (!L) return;
    stats.casts++;
    castBloom(L, a);
    const aim = ev.aim ? ev.aim : (ev.target != null && actorAt(ev.target)) ? actorAt(ev.target).pos : { x: a.pos.x + Math.sin(a.yaw) * 4, z: a.pos.z + Math.cos(a.yaw) * 4 };
    const yaw = Math.atan2(aim.x - a.pos.x, aim.z - a.pos.z);
    const G = L.ground;
    if (G) {
      const c = G.at === 'aim' ? aim : G.at === 'front' ? { x: a.pos.x + Math.sin(yaw) * 2, z: a.pos.z + Math.cos(yaw) * 2 } : a.pos;
      const ms = G.at === 'aim' ? 2200 : 1300;
      sigil(L, c.x, c.z, { r: G.r, ms });
      if (G.ring) setTimeout(() => burst(L, [a.pos.x, gy(a.pos.x, a.pos.z) + 0.6, a.pos.z], { scale: Math.min(2, G.r / 3) }), 120);
      if (G.at === 'aim' && L.impact) setTimeout(() => burst(L, [c.x, gy(c.x, c.z) + 0.5, c.z], { scale: Math.min(2.2, G.r / 2.5) }), 420);
    }
    const T = L.travel; if (!T) return;
    const from = chestOf(a);
    if (T.kind === 'stream') {
      const to = actorAt(ev.target) ? chestOf(actorAt(ev.target)) : [aim.x, gy(aim.x, aim.z) + 1, aim.z];
      const m = Math.round(6 * lite());
      for (let i = 0; i < m; i++) setTimeout(() => head(L, from, () => to, 220, { burstAt: i === m - 1 }), i * 55);
    } else if (T.kind === 'arc') {
      const m = Math.round(9 * lite()), r = 1.6;
      for (let i = 0; i < m; i++) {
        const t = i / (m - 1), ang = yaw + (t - 0.5) * 1.9 * L.dir;
        setTimeout(() => spawn({ at: [a.pos.x + Math.sin(ang) * r, from[1] - 0.2 + t * 0.4, a.pos.z + Math.cos(ang) * r], v: [Math.sin(ang) * 2.5, 0.4, Math.cos(ang) * 2.5], motif: i % 2 ? L.motif.shard : L.motif.head,
          colour: i % 3 ? L.palette.glow : L.palette.core, life: 0.42, size: 0.55 * L.size, size1: 0.15, spin: L.dir * 6, drag: 2 }), i * 14);
      }
    } else if (T.kind === 'path') {
      const m = Math.round(7 * lite());
      for (let i = 0; i < m; i++) setTimeout(() => {
        const b = actorAt(ev.s); if (!b) return; const [bx, by, bz] = chestOf(b);
        spawn({ at: [bx, by, bz], motif: L.motif.head, colour: i % 2 ? L.palette.glow : L.palette.accent, life: 0.6, size: 0.8 * L.size, size1: 0.2, spin: L.dir * 2, alpha: 0.75 });
        spawn({ at: [bx, gy(bx, bz) + 0.14, bz], motif: L.motif.shard, colour: L.palette.glow, life: 0.7, size: 0.7 * L.size, size1: 0.3, flat: true, rot: yaw });
      }, i * 45);
    }
  }
  function onFx(ev) {
    if (ev.kind === 'bolt' || ev.kind === 'shot' || ev.kind === 'thrown' || ev.kind === 'arrow') {
      const a = actorAt(ev.id); const L = lookFor(ev.skill, ev.id);
      if (!L || L.travel?.kind !== 'head') return;
      const from = ev.from ? [ev.from.x, gy(ev.from.x, ev.from.z) + 1.1, ev.from.z] : a ? chestOf(a) : null; if (!from) return;
      if (!near(from[0], from[2])) return;
      const tgt = ev.to;
      const to = typeof tgt === 'object' && tgt ? (() => [tgt.x, gy(tgt.x, tgt.z) + 1, tgt.z]) : (() => { const t = actorAt(tgt); return t ? chestOf(t) : null; });
      if (!to()) return;
      if (lite() < 1) { const k = ev.id + ':' + ev.skill, now = performance.now(); if (now - (shotSeen.get(k) || 0) < 120) return; shotSeen.set(k, now); }
      head(L, from, to, ev.ms || 400);
      return;
    }
    // the rules' per-hit impact (C sends one per landed hit, with the skill as `ab`); the struck body is `id`
    if (ev.kind === 'impact' && ev.ab) hitBurst(ev.ab, ev.s ?? null, ev.id, { killed: ev.killed, crit: ev.crit });
  }
  // one burst per body per skill per 150 ms, whichever of `fx impact` / `hit` reports it first
  const hitSeen = new Map();
  function hitBurst(skill, casterId, bodyId, { killed = false, crit = false } = {}) {
    const L = lookFor(skill, casterId); if (!L || L.travel?.kind === 'head') return;      // a thrown head bursts on its own arrival
    const d = actorAt(bodyId); if (!d || !near(d.pos.x, d.pos.z)) return;
    const k = bodyId + ':' + skill, now = performance.now();
    if (now - (hitSeen.get(k) || 0) < 150) return;
    hitSeen.set(k, now); if (hitSeen.size > 300) hitSeen.clear();
    burst(L, chestOf(d), { scale: killed ? 1.2 : crit ? 1 : 0.75, n: Math.round((L.impact?.n || 8) * 0.55) });
  }
  function onHit(ev) {
    if (ev.kind && ev.kind !== 'dmg') return;
    hitBurst(ev.skill, ev.s, ev.d, { crit: !!ev.crit });
  }
  function onEvent(ev) {
    if (!on || drawFor(level, ev, focus(), { signature: true }) === 'none') return;      // reduced: only yours and your target's
    try {
      if (ev.type === 'cast') onCast(ev);
      else if (ev.type === 'fx') onFx(ev);
      else if (ev.type === 'hit') onHit(ev);
    } catch (e) { console.warn('[sig-fx]', ev.type, e.message); }
  }

  // ---- the frame ----
  const _r = new THREE.Vector3(), _u = new THREE.Vector3();
  function update(dt) {
    if (!on && !n) { geo.instanceCount = 0; return; }
    dt = Math.min(0.05, dt);
    const now = performance.now();
    // heads in flight
    for (let i = heads.length - 1; i >= 0; i--) {
      const H = heads[i], L = H.L, S = L.style;
      H.t += dt * 1000;
      const end = H.to() || H.last, k = Math.min(1, H.t / H.ms);
      const f = H.from;
      let x = f[0] + (end[0] - f[0]) * k, y = f[1] + (end[1] - f[1]) * k + Math.sin(k * Math.PI) * (S.head.arc || 0), z = f[2] + (end[2] - f[2]) * k;
      const dx = end[0] - f[0], dz = end[2] - f[2], len = Math.hypot(dx, dz) || 1, sx = -dz / len, sz = dx / len;
      const w = S.head.wobble, ph = H.phase + H.t * 0.012;
      if (w === 'sine') { const o = Math.sin(ph) * 0.35; x += sx * o; z += sz * o; y += Math.cos(ph * 0.5) * 0.12; }
      else if (w === 'zigzag') { const o = (((H.t / 45) | 0) % 2 ? 1 : -1) * 0.28 * (1 - k); x += sx * o; z += sz * o; }
      else if (w === 'spiral') { x += sx * Math.cos(ph) * 0.3; z += sz * Math.cos(ph) * 0.3; y += Math.sin(ph) * 0.3; }
      H.last = [x, y, z];
      // the head itself is re-spawned as a 1-frame sprite (cheap, and it can never be left behind)
      const hs = L.travel.size;
      spawn({ at: [x, y, z], motif: L.motif.head, colour: L.palette.core, life: dt * 1.05 + 0.001, size: hs, rot: (H.t / 1000) * S.head.spin * L.dir + (w === 'tumble' ? Math.sin(ph) : 0), alpha: 1 });
      spawn({ at: [x, y, z], motif: L.motif.head, colour: L.palette.glow, life: dt * 1.05 + 0.001, size: hs * 1.7, rot: -(H.t / 1000) * S.head.spin * 0.5, alpha: 0.45 });
      H.acc += dt * S.head.trail * lite();
      while (H.acc >= 1) {
        H.acc -= 1;
        const T = S.trail;
        spawn({ at: [x + rnd(-0.1, 0.1), y + rnd(-0.1, 0.1), z + rnd(-0.1, 0.1)], v: [T.drift[0] + rnd(-0.3, 0.3), T.drift[1] + rnd(-0.2, 0.2), T.drift[2] + rnd(-0.3, 0.3)],
          motif: T.shard === 'head' ? L.motif.head : L.motif.shard, colour: Math.random() < 0.3 ? L.palette.accent : L.palette.glow, life: T.life * rnd(0.7, 1.2), size: hs * 0.55, size1: 0.05, spin: rnd(-5, 5), gravity: T.gravity, alpha: 0.85 });
      }
      if (k >= 1) { heads.splice(i, 1); if (H.burstAt) burst(L, [x, y, z]); }
    }
    // sigils: turn the glyph, circle the orbiters, raise the motes
    for (let i = sigils.length - 1; i >= 0; i--) {
      const s = sigils[i]; s.t += dt;
      if (now > s.until) { sigils.splice(i, 1); turns.delete(s.id); continue; }
      const L = s.L, P = L.palette;
      // a ticking sigil (a clock, a drill-square) snaps round in steps instead of turning smoothly
      const turn = s.tick > 0 ? Math.floor((s.t * Math.abs(s.spin) * s.tick) / TAU) * (TAU / s.tick) * Math.sign(s.spin || 1) : s.t * s.spin;
      turns.set(s.id, turn);
      if (s.orbit) {
        const m = s.orbit, wob = s.t * 1.6 * Math.sign(s.spin || 1);
        for (let o = 0; o < m; o++) {
          const a = wob + (o / m) * TAU, ox = s.x + Math.cos(a) * s.r * 0.95, oz = s.z + Math.sin(a) * s.r * 0.95;
          spawn({ at: [ox, s.y + 0.45 + Math.sin(s.t * 3 + o) * 0.12, oz], motif: o % 2 ? L.motif.shard : L.motif.head, colour: o % 2 ? P.accent : P.core, life: dt * 1.05 + 0.001, size: 0.38 * L.size, rot: a });
        }
      }
      s.moteAcc += dt * s.rise * Math.min(2, s.r / 2);
      while (s.moteAcc >= 1) {
        s.moteAcc -= 1;
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * s.r;
        spawn({ at: [s.x + Math.cos(a) * d, s.y + 0.1, s.z + Math.sin(a) * d], v: [0, rnd(1, 2.4), 0], motif: L.motif.shard, colour: Math.random() < 0.3 ? P.accent : P.glow, life: rnd(0.6, 1.1), size: 0.26 * L.size, size1: 0.05, spin: rnd(-3, 3) });
      }
    }
    // integrate and write the buffers
    const P = aPos.array, C = aCol.array, D = aDat.array;
    for (let i = n - 1; i >= 0; i--) {
      age[i] += dt;
      if (age[i] >= life[i]) { kill(i); continue; }
    }
    for (let i = 0; i < n; i++) {
      const t = age[i] / life[i], dr = Math.max(0, 1 - drag[i] * dt);
      pv[i * 3] *= dr; pv[i * 3 + 2] *= dr; pv[i * 3 + 1] = pv[i * 3 + 1] * dr - grav[i] * dt;
      px[i * 3] += pv[i * 3] * dt; px[i * 3 + 1] += pv[i * 3 + 1] * dt; px[i * 3 + 2] += pv[i * 3 + 2] * dt;
      if (own[i]) { const tn = turns.get(Math.abs(own[i])) || 0; rot[i] = own[i] > 0 ? tn : -tn * 0.6; } else rot[i] += spin[i] * dt;
      P[i * 3] = px[i * 3]; P[i * 3 + 1] = px[i * 3 + 1]; P[i * 3 + 2] = px[i * 3 + 2];
      // fade in fast, out smoothly
      const fade = Math.min(1, t * 10) * (1 - t * t);
      C[i * 4] = col[i * 3]; C[i * 4 + 1] = col[i * 3 + 1]; C[i * 4 + 2] = col[i * 3 + 2]; C[i * 4 + 3] = alpha0[i] * fade;
      D[i * 4] = size0[i] + (size1[i] - size0[i]) * t; D[i * 4 + 1] = rot[i]; D[i * 4 + 2] = cell[i]; D[i * 4 + 3] = flat[i];
    }
    geo.instanceCount = n; stats.live = n;
    if (n) {
      aPos.needsUpdate = aCol.needsUpdate = aDat.needsUpdate = true;
      aPos.addUpdateRange?.(0, n * 3); aCol.addUpdateRange?.(0, n * 4); aDat.addUpdateRange?.(0, n * 4);
      camera.updateMatrixWorld();
      _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1);
      mat.uniforms.uRight.value.copy(_r); mat.uniforms.uUp.value.copy(_u);
    }
  }

  function setLevel(l) {
    level = l; cap = CAP[l] || 0; on = l === 'enhanced' || l === 'reduced';
    if (on) ensureAtlas();
    if (!on) { n = 0; heads.length = 0; sigils.length = 0; turns.clear(); geo.instanceCount = 0; }
    while (n > cap) kill(n - 1);
  }
  /** For the boot warm-up: the mesh, so its one shader compiles before the first cast. */
  function sample() { ensureAtlas(); return mesh; }
  /** Client-only: show a class's whole signature at a spot (the gallery and tv.demoSig). */
  function demo(cls, skillId, casterId, targetId) {
    const L = sigLook(cls, skillId, skillOf(skillId) || {}); if (!L) return false;
    looks.set(cls + ':' + skillId, L);
    const a = actorAt(casterId), t = actorAt(targetId); if (!a) return false;
    const aim = t ? { x: t.pos.x, z: t.pos.z } : { x: a.pos.x + Math.sin(a.yaw) * 6, z: a.pos.z + Math.cos(a.yaw) * 6 };
    const was = on; on = true;               // a demo shows even when the setting is lower
    onCast({ type: 'cast', s: casterId, skill: skillId, aim, target: targetId });
    if (L.travel?.kind === 'head') onFx({ kind: 'bolt', id: casterId, skill: skillId, from: { x: a.pos.x, z: a.pos.z }, to: t ? targetId : aim, ms: 520 });
    else if (t) setTimeout(() => burst(L, chestOf(t)), 260);
    on = was;
    return true;
  }
  return { onEvent, update, setLevel, sample, demo, stats, get level() { return level; }, get live() { return n; }, mesh };
}
