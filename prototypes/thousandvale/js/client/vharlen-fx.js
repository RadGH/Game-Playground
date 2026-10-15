// Vharlen's hazards, DRAWN (Expansion 1 §4, items 1–4; stream S). The rules are js/rules/hazards.js, the server runs them
// (js/sim/hazards.js); this file only draws what the sites look like and what the server's events say happened:
//
//   hot springs   steam rising off every pool (and off the crater lake's warm shallows) — always, near the camera
//   geysers       a crusted mound with a wisp of steam; `fx {kind:'geyser', phase:'rumble'}` bubbles and shakes the ground,
//                 `phase:'erupt'` throws up a column of water and steam (a jet mesh + a few hundred puffs + falling spray).
//                 The rumble's danger circle is the telegraph system's own (`tele`, el 'steam').
//   lava vents    a jagged glowing crack with a scorched rim and a pooled light; `fx {kind:'lavaVent', phase:'warn'}` brightens
//                 it and lifts embers, `phase:'spout'` throws fire along its length. The warning line is the telegraph (`tele`).
//   ashfall       in Pumice Wastes and Ashfall Hollow: grey flakes drifting round the camera and fog pulled in (ASHFALL).
//   steam vents   stream T's `steam_vent` scatter pieces breathe a wisp every second or so (only those near the camera).
//   toss          `fx {kind:'toss', id, ms, h}`: a monster a geyser threw goes up and comes down (actors.js `liftY`).
//
// Every particle is in TWO THREE.Points draw calls (one soft, one glowing), pooled; the ash is a third. Nothing is built
// for a province without hazards. createVharlenFx(scene, opts) -> { update(dt), onEvent(ev), stats() }.

import * as THREE from 'three';
import { SPRING, GEYSER, VENT, ASHFALL, ventShape } from '../rules/hazards.js';
import { SCATTER_KINDS } from '../rules/terrain-read.js';
import { LIGHTS } from './lightpool.js';

/** Where a province's hazards file is (js/sim/province-files.js `hazards`: placed; the home province's has none). */
export const hazardsPath = prov => (!prov || prov === 'torbor_downs' ? 'data/provinces/hazards.json' : `data/provinces/${prov}-hazards.json`);
/** The world zone id under (x, z): z<X>_<Y>, two digits each. */
export const zoneIdAt = (x, z) => `z${String(Math.floor(x / 2048)).padStart(2, '0')}_${String(Math.floor(z / 2048)).padStart(2, '0')}`;
const STEAM_VENT = SCATTER_KINDS.findIndex(k => k.key === 'steam_vent');

const VERT = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uScale; uniform vec2 uFade;
  varying float vA; varying vec3 vC;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vA = aAlpha * smoothstep(uFade.x, uFade.y, -mvPosition.z); vC = aColor;      // a puff right at the lens would fill the screen: fade it
    gl_PointSize = clamp(aSize * uScale / max(0.5, -mvPosition.z), 1.0, 256.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  varying float vA; varying vec3 vC;
  #include <fog_pars_fragment>
  void main() {
    vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * vA;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vC, a);
    #include <fog_fragment>
  }`;

/** A pooled cloud of soft round particles: one draw call. */
function createPuffs(scene, cap, { additive = false, name = 'puffs' } = {}) {
  const pos = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap), col = new Float32Array(cap * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 }, uFade: { value: new THREE.Vector2(1.2, 6) } }]) });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.name = name; pts.renderOrder = 4;
  scene.add(pts);
  // per particle: x y z vx vy vz age life s0 s1 a0 r g b drag grav
  const P = new Float32Array(cap * 16);
  let n = 0;
  const _c = new THREE.Color();
  function add(x, y, z, vx, vy, vz, life, s0, s1, a0, color, drag = 0.4, grav = 0) {
    if (n >= cap) return false;
    const o = n * 16; _c.set(color);
    P[o] = x; P[o + 1] = y; P[o + 2] = z; P[o + 3] = vx; P[o + 4] = vy; P[o + 5] = vz; P[o + 6] = 0; P[o + 7] = life;
    P[o + 8] = s0; P[o + 9] = s1; P[o + 10] = a0; P[o + 11] = _c.r; P[o + 12] = _c.g; P[o + 13] = _c.b; P[o + 14] = drag; P[o + 15] = grav;
    n++; return true;
  }
  function update(dt) {
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      P[o + 6] += dt;
      if (P[o + 6] >= P[o + 7]) { n--; if (i < n) { P.copyWithin(o, n * 16, n * 16 + 16); i--; } continue; }
      const k = Math.exp(-P[o + 14] * dt);
      P[o + 3] *= k; P[o + 5] *= k; P[o + 4] = P[o + 4] * k - P[o + 15] * dt;
      P[o] += P[o + 3] * dt; P[o + 1] += P[o + 4] * dt; P[o + 2] += P[o + 5] * dt;
    }
    for (let i = 0; i < n; i++) {
      const o = i * 16, f = P[o + 6] / P[o + 7];
      pos[i * 3] = P[o]; pos[i * 3 + 1] = P[o + 1]; pos[i * 3 + 2] = P[o + 2];
      size[i] = P[o + 8] + (P[o + 9] - P[o + 8]) * f;
      alpha[i] = P[o + 10] * Math.min(1, f * 6) * (1 - f) * (1 - f);
      col[i * 3] = P[o + 11]; col[i * 3 + 1] = P[o + 12]; col[i * 3 + 2] = P[o + 13];
    }
    g.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[k].needsUpdate = true;
  }
  return { add, update, mat, pts, get count() { return n; }, get room() { return cap - n; }, clear() { n = 0; g.setDrawRange(0, 0); } };
}

/** The water jet's streaks: a canvas texture, bright streaks fading out toward the top and at the seams. */
function jetTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  for (let x = 0; x < 64; x++) {
    const streak = 0.45 + 0.55 * Math.abs(Math.sin(x * 0.61) * Math.sin(x * 0.23 + 1.3));
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, `rgba(255,255,255,${(0.95 * streak).toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(240,248,255,${(0.7 * streak).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(230,242,255,0)');
    g.fillStyle = grad; g.fillRect(x, 0, 1, 128);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
/** A ribbon laid on the ground along a polyline (each vertex at the ground + lift), `w` wide. */
function groundRibbon(pts, w, groundY, lift) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ww = (pts[i][2] ?? 1) * w / 2;
    for (const s of [-1, 1]) { const x = pts[i][0] - dz * ww * s, z = pts[i][1] + dx * ww * s; pos.push(x, groundY(x, z) + lift, z); }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
/** A vertical sheet standing on a polyline (height 1, scaled when it spouts): the fire curtain of a vent. */
function curtainGeo(pts, groundY) {
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const y = groundY(pts[i][0], pts[i][1]);
    pos.push(pts[i][0], y, pts[i][1], pts[i][0], y + 1, pts[i][1]);
    uv.push(along / 4, 0, along / 4, 1);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
let FLAME_TEX = null;
/** Tongues of flame: hot at the foot, ragged and fading toward the top (a canvas texture, made once). */
function flameTexture() {
  if (FLAME_TEX || typeof document === 'undefined') return FLAME_TEX;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x++) {
    const top = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.19) * Math.cos(x * 0.071 + 0.7));
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.18, 'rgba(255,190,70,0.95)');
    grad.addColorStop(top * 0.6, 'rgba(255,110,25,0.75)'); grad.addColorStop(top, 'rgba(180,40,10,0)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(x, 0, 1, 128);
  }
  FLAME_TEX = new THREE.CanvasTexture(c); FLAME_TEX.wrapS = THREE.RepeatWrapping;
  return FLAME_TEX;
}
const curtainMat = () => new THREE.MeshBasicMaterial({ map: flameTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
/** A vent's crack: a jagged line from a to b (deterministic from its id), with a width taper per point. */
function crackPoints(v) {
  const sh = ventShape(v), n = Math.max(6, Math.round(sh.len / 1.1));
  let h = 0; for (const c of v.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const fx = Math.sin(sh.yaw), fz = Math.cos(sh.yaw), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, j = (i === 0 || i === n) ? 0 : (rnd() - 0.5) * 0.9;
    out.push([sh.x + fx * sh.len * t + fz * j, sh.z + fz * sh.len * t - fx * j, 0.35 + Math.sin(Math.PI * t) * 0.9]);
  }
  return out;
}

export function createVharlenFx(scene, { actors = null, groundY = () => 0, camera = null, renderer = null, quality = 'high', zones = null, roomOf = () => null, indoors = () => false, shake = null, selfPos = () => null, fetchJson = null } = {}) {
  const low = quality === 'low';
  const group = new THREE.Group(); group.name = 'vharlen-hazards'; scene.add(group);
  const soft = createPuffs(scene, low ? 700 : 1800, { name: 'vharl-steam' });
  const glow = createPuffs(scene, low ? 300 : 900, { additive: true, name: 'vharl-fire' });
  const S = { prov: null, loading: null, sites: null, byId: new Map(), built: false, springs: [], geysers: [], vents: [], tosses: new Map(), t: 0, ash: 0, inAsh: false, scatter: new Map(), wisps: 0 };
  const getJson = fetchJson || (p => fetch(new URL(`../../${p}`, import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null));

  // ---- materials (shared) ----
  const M = {
    moundRock: new THREE.MeshLambertMaterial({ color: '#4a433d', flatShading: true }),
    crust: new THREE.MeshLambertMaterial({ color: '#d9d3b8', flatShading: true }),
    mouth: new THREE.MeshBasicMaterial({ color: '#0f1418' }),
    jet: new THREE.MeshBasicMaterial({ color: '#eaf6ff', map: jetTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.FrontSide, fog: true }),      // front faces only: from inside the column you see out
    scorch: new THREE.MeshBasicMaterial({ color: '#140b07', transparent: true, opacity: 0.72, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  };
  const ventMat = () => new THREE.MeshBasicMaterial({ color: '#ff5a14', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const coreMat = () => new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });

  function clearSites() {
    for (const c of [...group.children]) { group.remove(c); c.traverse?.(o => { if (o.geometry) o.geometry.dispose(); if (o.material && !Object.values(M).includes(o.material)) o.material.dispose?.(); }); }
    for (const v of S.vents) v.light?.remove();
    S.springs = []; S.geysers = []; S.vents = []; S.byId.clear(); S.built = false; soft.clear(); glow.clear();
  }
  /**
   * The sites' drawings are made LAZILY, once the zone under each is streamed in: built from the horizon's rough heights a
   * mound floats or sinks and a crack lies under the ground (the first look had no visible cracks at all for that reason).
   */
  const groundReady = (x, z) => { if (!zones || !zones.loaded) return true; const L = zones.loaded.get(zoneIdAt(x, z)); return !!(L && L.T); };
  const jetGeo = new THREE.CylinderGeometry(0.55, 1.3, 1, 16, 6, true).translate(0, 0.5, 0);
  function placeGeyser(g) {
    const y = groundY(g.x, g.z), r = g.r || GEYSER.r;
    const node = new THREE.Group(); node.position.set(g.x, y, g.z); node.name = 'geyser:' + g.id;
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.9, 0.55, 16, 1), M.moundRock); mound.position.y = 0.12;
    const crust = new THREE.Mesh(new THREE.RingGeometry(r * 0.38, r * 1.12, 20).rotateX(-Math.PI / 2), M.crust); crust.position.y = 0.41;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(r * 0.4, 14).rotateX(-Math.PI / 2), M.mouth); mouth.position.y = 0.42;
    const jet = new THREE.Mesh(jetGeo, M.jet.clone()); jet.visible = false; jet.position.y = 0.4;
    node.add(mound, crust, mouth, jet);
    g.node = node; g.jet = jet; g.y = y; g.placed = true;
    group.add(node);
  }
  /** Raise a vent's fire curtain to `h` metres (its top vertices; the foot stays on the ground), ragged along its length. */
  function curtainHeight(v, h, t) {
    const pos = v.curtain.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) { const k = i / 2, rag = 0.75 + 0.25 * Math.sin(t * 13 + k * 1.7) * Math.sin(t * 7.3 + k * 0.9); pos.setY(i + 1, pos.getY(i) + h * rag * (v.pts[k][2] || 1)); }
    pos.needsUpdate = true; v.curtain.geometry.computeBoundingSphere();
  }
  function placeVent(v) {
    const pts = crackPoints(v);
    const scorch = new THREE.Mesh(groundRibbon(pts, (v.w || VENT.w) * 1.5, groundY, 0.05), M.scorch);
    const glowM = new THREE.Mesh(groundRibbon(pts, 1.3, groundY, 0.08), ventMat());
    const core = new THREE.Mesh(groundRibbon(pts, 0.32, groundY, 0.1), coreMat());
    const curtain = new THREE.Mesh(curtainGeo(pts, groundY), curtainMat());
    curtain.visible = false; curtain.renderOrder = 5;
    for (const m of [scorch, glowM, core]) { m.renderOrder = 2; group.add(m); }
    group.add(curtain);
    v.pts = pts; v.glow = glowM; v.core = core; v.curtain = curtain; v.placed = true;
    v.light = LIGHTS.add({ x: v.cx, y: groundY(v.cx, v.cz) + 1.2, z: v.cz, color: '#ff6a22', intensity: 1.2, distance: 16, decay: 1.6, flicker: 0.25, owner: group });
  }
  function build(doc) {
    clearSites();
    if (!doc) return;
    S.springs = (doc.springs || []).map(s => ({ ...s, acc: 0 }));
    for (const g0 of doc.geysers || []) { const g = { ...g0, acc: 0, rumbleUntil: 0, eruptAt: 0, eruptMs: 0, placed: false, y: 0 }; S.geysers.push(g); S.byId.set(g.id, g); }
    for (const v0 of doc.vents || []) { const v = { ...v0, acc: 0, warnAt: 0, warnMs: 0, spoutAt: 0, spoutMs: 0, placed: false, cx: (v0.ax + v0.bx) / 2, cz: (v0.az + v0.bz) / 2 }; S.vents.push(v); S.byId.set(v.id, v); }
    S.built = true;
  }
  function setProvince(prov) {
    if (prov === S.prov) return;
    S.prov = prov; S.sites = null; clearSites();
    if (!prov || prov === 'torbor_downs') return;
    const want = prov;
    S.loading = getJson(hazardsPath(prov)).then(doc => { if (S.prov !== want) return; S.sites = doc; build(doc); });
  }

  // ---- the steam-vent scatter: positions per loaded zone (world metres) ----
  function scatterVents() {
    if (!zones || STEAM_VENT < 0) return [];
    const out = [];
    for (const [key, L] of zones.loaded || []) {
      let list = S.scatter.get(key);
      if (!list) {
        const sc = L.extras && L.extras.scatter;
        if (!sc) continue;
        list = [];
        for (let i = 0; i < sc.count; i++) if (sc.kind[i] === STEAM_VENT) list.push([sc.x[i] + (L.ox || 0), sc.z[i] + (L.oz || 0), sc.scale ? sc.scale[i] || 1 : 1]);
        S.scatter.set(key, list);
      }
      out.push(list);
    }
    for (const k of [...S.scatter.keys()]) if (!(zones.loaded || new Map()).has(k)) S.scatter.delete(k);
    return out;
  }

  // ---- ash (Pumice Wastes, Ashfall Hollow) ----
  const ASH_N = low ? 260 : 700, ASH_BOX = 46;
  const ashPos = new Float32Array(ASH_N * 3), ashSeed = new Float32Array(ASH_N);
  for (let i = 0; i < ASH_N; i++) { ashPos[i * 3] = (Math.random() - 0.5) * ASH_BOX * 2; ashPos[i * 3 + 1] = Math.random() * 30; ashPos[i * 3 + 2] = (Math.random() - 0.5) * ASH_BOX * 2; ashSeed[i] = Math.random() * 6.28; }
  const ashGeo = new THREE.BufferGeometry(); ashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ASH_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
  // round soft flakes on the same shader as the puffs (a square GL point up close read as a grey tile)
  const ashA = new Float32Array(ASH_N), ashS = new Float32Array(ASH_N), ashC = new Float32Array(ASH_N * 3);
  for (let i = 0; i < ASH_N; i++) { ashS[i] = 0.09 + Math.random() * 0.12; const g = 0.3 + Math.random() * 0.45; ashC[i * 3] = g; ashC[i * 3 + 1] = g * 0.97; ashC[i * 3 + 2] = g * 0.93; }
  ashGeo.setAttribute('aSize', new THREE.BufferAttribute(ashS, 1)); ashGeo.setAttribute('aColor', new THREE.BufferAttribute(ashC, 3));
  ashGeo.setAttribute('aAlpha', new THREE.BufferAttribute(ashA, 1).setUsage(THREE.DynamicDrawUsage));
  const ashMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true, uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 }, uFade: { value: new THREE.Vector2(0.3, 1.6) } }]) });
  const ash = new THREE.Points(ashGeo, ashMat); ash.frustumCulled = false; ash.visible = false; ash.name = 'vharl-ash'; scene.add(ash);
  const fogState = { far: null, near: null, col: new THREE.Color(), bg: null, wroteFar: null, wroteNear: null, wroteCol: new THREE.Color(), active: false };
  const ASH_COL = new THREE.Color(ASHFALL.color);
  function applyAshFog() {
    const fog = scene.fog; if (!fog) return;
    const k = S.ash;
    // the day/night pass writes the fog twice a second: whatever differs from what WE wrote last is its new base
    if (fogState.wroteFar === null || Math.abs(fog.far - fogState.wroteFar) > 1e-3 || Math.abs(fog.near - fogState.wroteNear) > 1e-3 || !fog.color.equals(fogState.wroteCol)) {
      fogState.far = fog.far; fogState.near = fog.near; fogState.col.copy(fog.color);
      fogState.bg = scene.background && scene.background.isColor ? scene.background.clone() : null;
    }
    if (k <= 0.001 && !fogState.active) { fogState.wroteFar = fog.far; fogState.wroteNear = fog.near; fogState.wroteCol.copy(fog.color); return; }
    fogState.active = k > 0.001;
    fog.far = fogState.far * (1 - k * (1 - ASHFALL.fogK));
    fog.near = fogState.near * (1 - k * (1 - ASHFALL.fogNearK));
    fog.color.copy(fogState.col).lerp(ASH_COL, k * ASHFALL.mix);
    if (fogState.bg && scene.background && scene.background.isColor) scene.background.copy(fogState.bg).lerp(ASH_COL, k * ASHFALL.mix);
    fogState.wroteFar = fog.far; fogState.wroteNear = fog.near; fogState.wroteCol.copy(fog.color);
  }

  // ---- events ----
  function onEvent(ev) {
    if (!ev || ev.type !== 'fx') return;
    const t = S.t;
    if (ev.kind === 'geyser') {
      const g = S.byId.get(ev.site); if (!g || !g.placed) return;
      if (ev.phase === 'rumble') { g.rumbleUntil = t + (ev.ms || 2000) / 1000; g.rumbleMs = (ev.ms || 2000) / 1000; }
      else if (ev.phase === 'erupt') {
        g.rumbleUntil = 0; g.eruptAt = t; g.eruptMs = (ev.ms || GEYSER.eruptMs) / 1000;
        const me = selfPos(); if (me && shake && Math.hypot(me.x - g.x, me.z - g.z) < 30) shake(0.45);
        for (let i = 0; i < (low ? 40 : 110); i++) { const a = Math.random() * 6.283, sp = Math.random() * 2.2; soft.add(g.x + Math.cos(a) * 0.6, g.y + 0.6, g.z + Math.sin(a) * 0.6, Math.cos(a) * sp, 9 + Math.random() * 15, Math.sin(a) * sp, 1.6 + Math.random() * 1.4, 1.2, 4.5 + Math.random() * 3, 0.55, i % 3 ? '#f4f9ff' : '#cfe6f5', 0.9, 3); }
      }
      return;
    }
    if (ev.kind === 'lavaVent') {
      const v = S.byId.get(ev.site); if (!v || !v.placed) return;
      if (ev.phase === 'warn') { v.warnAt = t; v.warnMs = (ev.ms || VENT.warnMs) / 1000; }
      else if (ev.phase === 'spout') {
        v.warnAt = 0; v.spoutAt = t; v.spoutMs = (ev.ms || VENT.spoutMs) / 1000;
        const me = selfPos(); if (me && shake && Math.hypot(me.x - v.cx, me.z - v.cz) < 18) shake(0.3);
      }
      return;
    }
    if (ev.kind === 'toss' && ev.id != null) { S.tosses.set(ev.id, { at: t, ms: (ev.ms || GEYSER.tossMs) / 1000, h: ev.h || GEYSER.tossH }); }
  }

  // ---- per frame ----
  const emitSteam = (x, y, z, scale = 1, alpha = 0.22, color = '#eef4f6') =>
    soft.add(x, y, z, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4, 3 + Math.random() * 2.5, 1.2 * scale, (4 + Math.random() * 3) * scale, alpha, color, 0.25, -0.05);
  function update(dt) {
    S.t += dt;
    const room = roomOf();
    setProvince(room && !indoors() ? room.province || null : null);
    const cam = camera ? camera.position : null;
    group.visible = !indoors() && S.built;
    if (renderer && camera) { const hh = renderer.domElement.height || 800; const sc = hh / (2 * Math.tan((camera.fov || 60) * Math.PI / 360)); soft.mat.uniforms.uScale.value = sc; glow.mat.uniforms.uScale.value = sc; }
    const t = S.t, near = (x, z, r) => cam && Math.abs(cam.x - x) < r && Math.abs(cam.z - z) < r;
    if (group.visible && cam) {
      // springs: steam over the water, a puff per few square metres a second
      for (const s of S.springs) {
        if (s.kind === 'crater_lake') {
          // the warm shallows: steam along the rim nearest the camera only
          const d = Math.hypot(cam.x - s.x, cam.z - s.z); if (Math.abs(d - s.r) > 160) continue;
          s.acc += dt * (low ? 6 : 16);
          while (s.acc >= 1) { s.acc--; const a = Math.atan2(cam.z - s.z, cam.x - s.x) + (Math.random() - 0.5) * 1.6, rr = s.r - Math.random() * (s.shore || SPRING.shore); const x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr; emitSteam(x, s.level + 0.2, z, 1.3, 0.16); }
          continue;
        }
        if (!near(s.x, s.z, 220)) continue;
        s.acc += dt * Math.min(14, s.r * s.r * 0.09) * (low ? 0.45 : 1);
        while (s.acc >= 1) { s.acc--; const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * s.r * 0.95; emitSteam(s.x + Math.cos(a) * rr, s.level + 0.15, s.z + Math.sin(a) * rr, 1, 0.34); }
      }
      // geysers: idle wisp, rumble bubbles, the eruption column
      for (const g of S.geysers) {
        if (!near(g.x, g.z, 260)) { if (g.jet) g.jet.visible = false; continue; }
        if (!g.placed) { if (!groundReady(g.x, g.z)) continue; placeGeyser(g); }
        const rumbling = g.rumbleUntil > t, erupting = g.eruptAt && t - g.eruptAt < g.eruptMs;
        g.acc += dt * (erupting ? (low ? 30 : 70) : rumbling ? 14 : 1.2);
        while (g.acc >= 1) {
          g.acc--;
          if (erupting) { const a = Math.random() * 6.283, sp = 0.5 + Math.random() * 1.6, top = 0.5 + Math.random() * 0.5; soft.add(g.x + Math.cos(a) * 0.5, g.y + 1, g.z + Math.sin(a) * 0.5, Math.cos(a) * sp, 14 + Math.random() * 10 * top, Math.sin(a) * sp, 1.4 + Math.random(), 1.4, 5 + Math.random() * 4, 0.5, Math.random() < 0.35 ? '#d6ecfa' : '#f6fbff', 1.1, 4); }
          else if (rumbling) { const a = Math.random() * 6.283, rr = Math.random() * (g.r || GEYSER.r) * 0.7; soft.add(g.x + Math.cos(a) * rr, g.y + 0.45, g.z + Math.sin(a) * rr, 0, 1.6 + Math.random() * 2, 0, 0.9 + Math.random() * 0.6, 0.6, 2.2, 0.4, '#f2f7fa', 0.6, 0); }
          else emitSteam(g.x, g.y + 0.5, g.z, 0.6, 0.18);
        }
        if (erupting) {
          const f = (t - g.eruptAt) / g.eruptMs, up = Math.min(1, f / 0.12), down = f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1;
          g.jet.visible = true; g.jet.scale.set(1 + Math.sin(t * 30) * 0.05, Math.max(0.05, 16 * up * (0.75 + 0.25 * down)), 1 + Math.cos(t * 27) * 0.05);
          g.jet.material.opacity = 0.8 * down; g.jet.rotation.y += dt * 2; if (g.jet.material.map) g.jet.material.map.offset.y = -((t * 1.6) % 1);
          if (f < 0.8 && Math.random() < dt * 30) { const a = Math.random() * 6.283, sp = 3 + Math.random() * 4; soft.add(g.x, g.y + 12 + Math.random() * 3, g.z, Math.cos(a) * sp, 2, Math.sin(a) * sp, 1.6, 0.35, 0.5, 0.65, '#cfe4f2', 0.1, 18); }
        } else g.jet.visible = false;
        g.node.position.y = g.y + (rumbling ? Math.sin(t * 70) * 0.03 : 0);
      }
      // vents: the crack breathes; the warning brightens it and lifts embers; the spout throws fire the length of it
      for (const v of S.vents) {
        if (!v.placed) { if (!near(v.cx, v.cz, 400) || !groundReady(v.cx, v.cz)) continue; placeVent(v); }
        const warn = v.warnAt && t - v.warnAt < v.warnMs, spout = v.spoutAt && t - v.spoutAt < v.spoutMs;
        const wf = warn ? (t - v.warnAt) / v.warnMs : 0;
        const breathe = 0.5 + 0.12 * Math.sin(t * 2.1 + v.cx);
        v.glow.material.opacity = Math.min(1, spout ? 0.8 : warn ? 0.6 + wf * 0.4 + 0.15 * Math.sin(t * 24) : breathe);
        v.core.material.opacity = spout ? 0.8 : warn ? 0.9 : 0.75 + 0.1 * Math.sin(t * 3.3 + v.cz);
        if (v.light) v.light.intensity = spout ? 4.5 : warn ? 1.5 + wf * 2.5 : 1.0;
        // the curtain of fire: shoots up over a fifth of a second, roars, sinks back
        if (spout) {
          const f = (t - v.spoutAt) / v.spoutMs, up = Math.min(1, f / 0.15), down = f > 0.65 ? 1 - (f - 0.65) / 0.35 : 1;
          v.curtain.visible = true; curtainHeight(v, Math.max(0.05, (4.5 + Math.sin(t * 19 + v.cx) * 0.6) * up * (0.55 + 0.45 * down)), t);
          v.curtain.material.opacity = 0.95 * down; v.curtain.material.map.offset.x = (t * 0.9) % 1;
        } else if (warn && wf > 0.8) { v.curtain.visible = true; curtainHeight(v, 0.6 * (wf - 0.8) / 0.2 + 0.05, t); v.curtain.material.opacity = 0.5; }
        else if (v.curtain) v.curtain.visible = false;
        if (!near(v.cx, v.cz, 200)) continue;
        v.acc += dt * (spout ? (low ? 90 : 240) : warn ? 18 + wf * 30 : 2);
        while (v.acc >= 1) {
          v.acc--;
          const p = v.pts[Math.floor(Math.random() * v.pts.length)], y = groundY(p[0], p[1]);
          if (spout) { const j = (Math.random() - 0.5) * 0.7, hot = Math.random(); glow.add(p[0] + j, y + 0.15, p[1] - j, (Math.random() - 0.5) * 1.2, 7 + Math.random() * 8, (Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 0.45, 1.1, 0.3 + Math.random() * 0.5, 0.85, hot < 0.3 ? '#fff0b0' : hot < 0.7 ? '#ffb238' : '#ff5a12', 1.6, 3); if (Math.random() < 0.18) soft.add(p[0], y + 3.5 + Math.random() * 3, p[1], (Math.random() - 0.5) * 0.6, 1.8, (Math.random() - 0.5) * 0.6, 2.8, 1.2, 4.5, 0.4, '#2e2723', 0.4, -0.2); }
          else glow.add(p[0] + (Math.random() - 0.5) * 0.6, y + 0.15, p[1] + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * (warn ? 3 : 1.2), (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.8, 0.22, 0.08, 0.95, warn ? '#ffb347' : '#ff7a2a', 0.5, 0);
        }
      }
      // stream T's steam vents: a wisp every second or so from each one within reach of the camera
      const R = low ? 60 : 110;
      for (const list of scatterVents()) for (const [x, z, s] of list) {
        if (!near(x, z, R)) continue;
        if (Math.random() < dt * (low ? 0.6 : 1.4) && soft.room > 40) { emitSteam(x, groundY(x, z) + 0.6, z, 0.6 * s, 0.32); S.wisps++; }
      }
    }
    // tossed monsters: up and down again
    for (const [id, tk] of S.tosses) {
      const a = actors && actors.get(id), f = (t - tk.at) / tk.ms;
      if (!a || f >= 1) { if (a) a.liftY = 0; S.tosses.delete(id); continue; }
      a.liftY = tk.h * 4 * f * (1 - f);
    }
    // ashfall: fade the weather in and out with the zone you stand in
    const me = selfPos() || (cam ? { x: cam.x, z: cam.z } : null);
    S.inAsh = !!(me && !indoors() && S.prov && ASHFALL.zones.includes(zoneIdAt(me.x, me.z)));
    S.ash += ((S.inAsh ? 1 : 0) - S.ash) * Math.min(1, dt * 0.6);
    if (S.ash < 0.002 && !S.inAsh) S.ash = 0;
    applyAshFog();
    ash.visible = S.ash > 0.01 && !!cam;
    if (ash.visible) {
      ashA.fill(0.9 * S.ash); ashGeo.attributes.aAlpha.needsUpdate = true; ashMat.uniforms.uScale.value = soft.mat.uniforms.uScale.value;
      const out = ashGeo.attributes.position.array;
      const B2 = ASH_BOX * 2, wrap = d => ((((d + ASH_BOX) % B2) + B2) % B2) - ASH_BOX;
      for (let i = 0; i < ASH_N; i++) {
        // flakes live in WORLD space (they do not ride the camera) and wrap round a box centred on it, so none ever pops
        ashPos[i * 3] += dt * (0.9 + Math.sin(t * 0.4 + ashSeed[i]) * 0.4);
        ashPos[i * 3 + 1] -= dt * (0.55 + (ashSeed[i] % 1) * 0.5);
        ashPos[i * 3 + 2] += dt * (0.3 + Math.cos(t * 0.33 + ashSeed[i]) * 0.4);
        out[i * 3] = cam.x + wrap(ashPos[i * 3] - cam.x);
        out[i * 3 + 1] = cam.y - 10 + ((((ashPos[i * 3 + 1] - cam.y) % 30) + 30) % 30);
        out[i * 3 + 2] = cam.z + wrap(ashPos[i * 3 + 2] - cam.z);
      }
      ashGeo.attributes.position.needsUpdate = true;
    }
    soft.update(dt); glow.update(dt);
  }

  return {
    update, onEvent, setProvince,
    stats: () => ({ prov: S.prov, built: S.built, springs: S.springs.length, geysers: S.geysers.length, vents: S.vents.length, puffs: soft.count, fire: glow.count, ash: Math.round(S.ash * 100) / 100, inAsh: S.inAsh, wisps: S.wisps, ventScatter: [...S.scatter.values()].reduce((a, l) => a + l.length, 0), fogFar: scene.fog ? Math.round(scene.fog.far) : null }),
    get loading() { return S.loading; },
  };
}
