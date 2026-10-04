// Telegraphs — the danger shapes on the ground that say "move".
//
// The server places a shape, it fills up over its wind-up, and at the moment it lands the server checks
// who is inside (js/rules/telegraph.js is the one geometry both sides use). The client only draws:
//
//   tele  {id, s, ab, k, ms, el?, follow?, shape, x, z, yaw?, r?, r2?, arc?, len?, w?}   place + fill
//   teleR {id, hits?:[ids], x?}                                                           land (or x: cancelled)
//
// How a shape reads (the owner asked for "readable and pretty"):
//   * a dark tinted floor so the whole danger area is visible from the first frame,
//   * a bright, softly glowing OUTLINE that never fades while it is live,
//   * a FILL sweeping out from where the blow starts (centre of a circle, the mouth of a cone, the
//     start of a line, the rim of a ring) and arriving exactly as it lands, with a hot leading edge,
//   * faint marching stripes so even a still screenshot shows which way it fills,
//   * the last 0.35 s it pulses — the "now!" beat,
//   * on landing a white flash and a burst; on cancel it just fades.
// Shapes hug the ground: every vertex sits on the terrain (heightAt) a few centimetres up.
// If YOU are inside a live shape its outline brightens and the screen edge glows red.

import * as THREE from 'three';
import { inside as insideShape } from '../rules/telegraph.js';

const ELEMENT = {
  fire: '#ff7a2a', frost: '#5fd2ff', cold: '#5fd2ff', ice: '#5fd2ff', poison: '#7ee04a', nature: '#7ee04a',
  shadow: '#b066ff', arcane: '#c77dff', void: '#9b5cff', lightning: '#ffe15a', storm: '#ffe15a', holy: '#ffe9a8',
  physical: '#ff3b2f',
};
const SAFE_GAP = 0.08;   // metres above the ground

const VERT = /* glsl */`
  attribute float aF;      // 0..1: how far along the fill this point is
  attribute float aE;      // metres to the outline (0 on the edge)
  attribute float aS;      // stripe coordinate (metres along the fill direction)
  varying float vF; varying float vE; varying float vS;
  #include <fog_pars_vertex>
  void main() {
    vF = aF; vE = aE; vS = aS;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uProg; uniform float uTime; uniform float uFlash; uniform float uFade; uniform float uMine;
  varying float vF; varying float vE; varying float vS;
  #include <fog_pars_fragment>
  void main() {
    float edge = 1.0 - smoothstep(0.06, 0.3, vE);                 // crisp outline
    float glow = (1.0 - smoothstep(0.0, 0.9, vE)) * 0.35;         // soft halo just inside it
    float filled = 1.0 - smoothstep(uProg - 0.015, uProg, vF);    // the swept area
    float lead = (1.0 - smoothstep(0.0, 0.035, abs(vF - uProg))) * step(0.02, uProg) * (1.0 - step(0.999, uProg));
    float stripes = smoothstep(0.45, 0.55, fract(vS * 0.9 - uTime * 0.8)) * 0.07;
    float last = smoothstep(0.82, 1.0, uProg);
    float pulse = last * (0.5 + 0.5 * sin(uTime * 28.0));
    float a = 0.10 + stripes;                                      // the tinted floor
    a += filled * (0.20 + 0.16 * last);                            // the fill thickens as it nears
    a += glow * 0.8 + edge * (0.85 + 0.15 * pulse + 0.15 * uMine);
    a += lead * 0.7;
    vec3 base = uColor * (0.55 + 0.45 * filled);
    vec3 rim = mix(uColor, vec3(1.0, 0.96, 0.9), 0.45 + 0.25 * uMine);
    vec3 col = mix(base, rim, clamp(edge + lead, 0.0, 1.0)) + vec3(1.0, 0.9, 0.75) * pulse * filled * 0.18;
    col = mix(col, vec3(1.0), uFlash);
    a = clamp(a + uFlash * 0.6, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;

/** Local-frame field values for a point (lx = across, lz = forward along yaw). */
function fieldAt(t, lx, lz) {
  const d = Math.hypot(lx, lz);
  switch (t.shape) {
    case 'circle': return { f: d / t.r, e: t.r - d, s: d };
    case 'ring': case 'donut': {
      const r2 = t.r2 || 0;
      return { f: (t.r - d) / Math.max(0.01, t.r - r2), e: Math.min(t.r - d, d - r2), s: t.r - d };
    }
    case 'cone': {
      const off = Math.abs(Math.atan2(lx, lz));
      const side = d * Math.sin(Math.max(0, t.arc / 2 - off));
      return { f: d / t.r, e: Math.min(t.r - d, t.arc >= Math.PI * 1.99 ? 1e9 : side), s: d };
    }
    case 'line': return { f: lz / t.len, e: Math.min(t.w / 2 - Math.abs(lx), lz, t.len - lz), s: lz };
    case 'cross': {
      const arm = (u, v) => Math.min(t.w / 2 - Math.abs(v), t.r - Math.abs(u));
      const e1 = arm(lz, lx), e2 = arm(lx, lz);
      const f = e1 >= e2 ? Math.abs(lz) / t.r : Math.abs(lx) / t.r;
      return { f, e: Math.max(e1, e2), s: e1 >= e2 ? Math.abs(lz) : Math.abs(lx) };
    }
  }
  return { f: 0, e: 0, s: 0 };
}

/** Points + triangles covering the shape in its local frame. */
function localMesh(t) {
  const pts = [], idx = [];
  const grid = (us, vs, map) => {   // us × vs parameter grid -> local points through map(u, v)
    const base = pts.length / 2;
    for (let j = 0; j < vs.length; j++) for (let i = 0; i < us.length; i++) { const [x, z] = map(us[i], vs[j]); pts.push(x, z); }
    const n = us.length;
    for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = base + j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  };
  const steps = (a, b, size) => { const n = Math.max(2, Math.min(60, Math.ceil(Math.abs(b - a) / size))); return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); };
  if (t.shape === 'circle' || t.shape === 'ring' || t.shape === 'donut' || t.shape === 'cone') {
    const r0 = t.shape === 'circle' || t.shape === 'cone' ? 0 : (t.r2 || 0);
    const arc = t.shape === 'cone' ? Math.min(Math.PI * 2, t.arc) : Math.PI * 2;
    const radii = steps(r0, t.r, Math.max(0.35, t.r / 24));
    const angs = steps(-arc / 2, arc / 2, Math.max(0.04, 0.7 / Math.max(1, t.r)));
    grid(angs, radii, (a, rho) => [Math.sin(a) * rho, Math.cos(a) * rho]);
  } else if (t.shape === 'line') {
    grid(steps(-t.w / 2, t.w / 2, 0.5), steps(0, t.len, 0.6), (x, z) => [x, z]);
  } else if (t.shape === 'cross') {
    const h = t.w / 2, r = t.r;
    grid(steps(-h, h, 0.5), steps(-r, r, 0.6), (x, z) => [x, z]);          // the arm along yaw
    grid(steps(h, r, 0.6), steps(-h, h, 0.5), (x, z) => [x, z]);           // the cross arm, right half
    grid(steps(-r, -h, 0.6), steps(-h, h, 0.5), (x, z) => [x, z]);         // and left half
  }
  return { pts, idx };
}

export function createTelegraphs(scene, { heightAt = () => 0, serverNow, posOf, selfPos, selfId, onHitMe } = {}) {
  const live = new Map();          // id -> telegraph
  const group = new THREE.Group(); group.name = 'telegraphs';
  scene.add(group);
  let ground = heightAt;
  let mineAny = false;

  function build(t) {
    const { pts, idx } = localMesh(t);
    const n = pts.length / 2;
    const pos = new Float32Array(n * 3), f = new Float32Array(n), e = new Float32Array(n), s = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const v = fieldAt(t, pts[k * 2], pts[k * 2 + 1]);
      f[k] = Math.max(0, Math.min(1, v.f)); e[k] = Math.max(0, v.e); s[k] = v.s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aF', new THREE.BufferAttribute(f, 1));
    g.setAttribute('aE', new THREE.BufferAttribute(e, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(ELEMENT[t.el] || ELEMENT.physical) }, uProg: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uMine: { value: 0 } }]),
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 3;
    t.mesh = mesh; t.local = pts; t.placedAt = null;
    group.add(mesh);
    place(t, true);
  }

  /** Lay the shape on the ground at its anchor (only re-sampled when it has moved). */
  function place(t, force = false) {
    if (!force && t.placedAt && Math.hypot(t.placedAt.x - t.x, t.placedAt.z - t.z) < 0.15 && Math.abs(t.placedAt.yaw - (t.yaw || 0)) < 0.01) return;
    const pos = t.mesh.geometry.attributes.position, c = Math.cos(t.yaw || 0), sn = Math.sin(t.yaw || 0);
    for (let k = 0; k < pos.count; k++) {
      const lx = t.local[k * 2], lz = t.local[k * 2 + 1];
      // local +z is the facing (sin yaw, cos yaw); local +x is across it
      const wx = t.x + lz * sn + lx * c, wz = t.z + lz * c - lx * sn;
      pos.setXYZ(k, wx, ground(wx, wz) + SAFE_GAP, wz);
    }
    pos.needsUpdate = true;
    t.mesh.geometry.computeBoundingSphere();
    t.placedAt = { x: t.x, z: t.z, yaw: t.yaw || 0 };
  }

  function add(ev, tickTime) {
    const id = ev.id;
    if (live.has(id)) remove(id);
    const t = {
      id, src: ev.s, ab: ev.ab, kind: ev.k, el: ev.el, follow: ev.follow ?? null,
      shape: ev.shape, x: ev.x, z: ev.z, yaw: ev.yaw || 0, r: ev.r, r2: ev.r2, arc: ev.arc, len: ev.len, w: ev.w,
      start: tickTime, land: tickTime + Math.max(50, ev.ms || 1000), state: 'live', endAt: 0, born: performance.now(),
    };
    if (!['circle', 'ring', 'donut', 'cone', 'line', 'cross'].includes(t.shape)) return;
    if (t.shape === 'cone' && !(t.arc > 0)) t.arc = Math.PI / 2;
    if (t.shape === 'line' && !(t.w > 0)) t.w = 2;
    if (t.shape === 'cross' && !(t.w > 0)) t.w = 2;
    build(t);
    live.set(id, t);
  }
  function resolve(ev) {
    const t = live.get(ev.id); if (!t) return;
    if (ev.x) { t.state = 'cancel'; t.endAt = performance.now() + 300; return; }
    t.state = 'land'; t.endAt = performance.now() + 420;
    t.mesh.material.uniforms.uProg.value = 1;
    const hitMe = (ev.hits || []).includes(selfId());
    if (onHitMe && hitMe) onHitMe(t);
    t.landed = { hitMe, at: performance.now() };
    return t;
  }
  function remove(id) { const t = live.get(id); if (!t) return; group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); live.delete(id); }
  function clear() { for (const id of [...live.keys()]) remove(id); }

  function update(dt) {
    const now = serverNow(), wall = performance.now();
    const me = selfPos();
    mineAny = false;
    for (const t of live.values()) {
      const u = t.mesh.material.uniforms;
      u.uTime.value += dt;
      if (t.follow != null && t.state === 'live') {
        const p = posOf(t.follow);
        if (p) { t.x = p.x; t.z = p.z; if (p.yaw != null && (t.shape === 'cone' || t.shape === 'line')) t.yaw = p.yaw; }
      }
      place(t);
      if (t.state === 'live') {
        u.uProg.value = Math.max(0, Math.min(1, (now - t.start) / (t.land - t.start)));
        u.uFade.value = Math.min(1, (wall - t.born) / 120);
        const mine = me && insideShape(t, me.x, me.z);
        u.uMine.value = mine ? 1 : 0;
        if (mine) mineAny = true;
        // A shape the server never resolved (a lost packet): retire it a second after it should have landed.
        if (now > t.land + 1500) { t.state = 'cancel'; t.endAt = wall + 300; }
      } else {
        const left = Math.max(0, t.endAt - wall);
        if (t.state === 'land') {
          const k = 1 - left / 420;
          u.uFlash.value = Math.max(0, 1 - k * 3);
          u.uFade.value = Math.min(1, left / 250);
          t.mesh.scale.setScalar(1);
        } else u.uFade.value = left / 300;
        if (left <= 0) remove(t.id);
      }
    }
  }

  return {
    add, resolve, remove, clear, update, live,
    setGround(f) { ground = f; for (const t of live.values()) place(t, true); },
    get standingInDanger() { return mineAny; },
  };
}
