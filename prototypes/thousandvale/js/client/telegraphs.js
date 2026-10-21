// Telegraphs — the danger shapes on the ground that say "move".
//
// The server places a shape, it fills up over its wind-up, and at the moment it lands the server checks
// who is inside (js/rules/telegraph.js is the one geometry both sides use). The client only draws:
//
//   tele  {id, s, ab, k, ms, el?, follow?, shape, x, z, yaw?, r?, r2?, arc?, len?, w?}   place + fill
//   teleR {id, hits?:[ids], x?}                                                           land (or x: cancelled)
//   teleM {id, x, z}                                                                      its caster was knocked: the shape goes with it (Y12)
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
import { fieldAt, localMesh } from './telegraph-shape.js';

const ELEMENT = {
  fire: '#ff7a2a', frost: '#5fd2ff', cold: '#5fd2ff', ice: '#5fd2ff', poison: '#7ee04a', nature: '#7ee04a',
  shadow: '#b066ff', arcane: '#c77dff', void: '#9b5cff', lightning: '#ffe15a', storm: '#ffe15a', holy: '#ffe9a8',
  physical: '#ff3b2f',
  steam: '#e8f6ff',      // [S] a geyser's rumble (Vharlen)
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

export function createTelegraphs(scene, { heightAt = () => 0, serverNow, posOf, selfPos, selfId, onHitMe } = {}) {
  const live = new Map();          // id -> telegraph
  const group = new THREE.Group(); group.name = 'telegraphs';
  scene.add(group);
  let ground = heightAt;
  let mineAny = false;
  // Play-test 12 (#83, owner: "the game locks up when enemies cast area spells at my feet, right before they go off"):
  // every telegraph built its OWN ShaderMaterial and disposed it when it landed. three.js frees a program when the last
  // material using it is disposed, so once a fight's telegraphs had all landed the next cast linked the shader again —
  // a stall at exactly the moment the warning appears (9 links in a 36 s fight with two champions, cp-freeze.spec.js).
  // ONE template is made here, compiled in the boot warm-up (`sample()`) and never disposed; each telegraph draws with a
  // clone of it, which shares its program, so disposing a clone frees uniforms and nothing else.
  const TEMPLATE = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(ELEMENT.physical) }, uProg: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uMine: { value: 0 } }]),
  });
  TEMPLATE.name = 'telegraph';
  const stats = { built: 0, materials: 0 };

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
    const mat = TEMPLATE.clone();                       // #83: the template's program, never a new one
    mat.uniforms.uColor.value.set(ELEMENT[t.el] || ELEMENT.physical);
    stats.built++;
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
    // play-test 6 (U3): cancelled = the caster died or was interrupted. The drawing goes AT ONCE (it used to fade for
    // 300 ms, and a shape still on the ground reads as still dangerous), with no landing flash.
    if (ev.x) { remove(ev.id); return; }
    if (t.goal) { t.x = t.goal.x; t.z = t.goal.z; t.goal = null; place(t, true); }     // Y12: it lands where the rules had it
    t.state = 'land'; t.endAt = performance.now() + 420;
    t.mesh.material.uniforms.uProg.value = 1;
    const hitMe = (ev.hits || []).includes(selfId());
    if (onHitMe && hitMe) onHitMe(t);
    t.landed = { hitMe, at: performance.now() };
    return t;
  }
  /**
   * Y12 (owner feedback 10, report #44): the caster was knocked back mid wind-up and the rules moved the danger area
   * with it — `teleM {id, x, z}`, once a tick while the knock lasts. The drawing moved nowhere, so the warning lay in
   * one place and the blow landed in another. `t.goal` is where the rules say the shape IS (what "am I standing in it?"
   * asks at once); the drawn shape glides there over a few frames, like the body it belongs to.
   */
  function move(ev) {
    const t = live.get(ev.id);
    if (!t || t.state !== 'live' || !Number.isFinite(ev.x) || !Number.isFinite(ev.z)) return false;
    t.goal = { x: ev.x, z: ev.z };
    if (Number.isFinite(ev.yaw)) t.yaw = ev.yaw;
    return true;
  }
  function remove(id) { const t = live.get(id); if (!t) return; group.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); live.delete(id); }
  /**
   * U3: every telegraph a body was casting, gone now — called when that body's death (or its interrupted cast) arrives,
   * without waiting for the server's `teleR {x: 1}` for each shape. A shape that has already landed keeps its flash.
   */
  function dropSource(src) { let n = 0; if (src == null) return n; for (const t of [...live.values()]) if (t.src === src && t.state === 'live') { remove(t.id); n++; } return n; }
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
        if (p) { t.x = p.x; t.z = p.z; t.goal = null; if (p.yaw != null && (t.shape === 'cone' || t.shape === 'line')) t.yaw = p.yaw; }
      }
      if (t.goal && t.state === 'live') {          // Y12: glide to where the knock put it (about 80 ms behind, like the body)
        const dx = t.goal.x - t.x, dz = t.goal.z - t.z, d = Math.hypot(dx, dz), k = d < 0.03 ? 1 : Math.min(1, dt * 18);
        t.x += dx * k; t.z += dz * k; t.dirty = true;
        if (k === 1) t.goal = null;
      }
      place(t, !!t.dirty); t.dirty = false;
      if (t.state === 'live') {
        u.uProg.value = Math.max(0, Math.min(1, (now - t.start) / (t.land - t.start)));
        u.uFade.value = Math.min(1, (wall - t.born) / 120);
        const mine = me && insideShape(t.goal ? { ...t, x: t.goal.x, z: t.goal.z } : t, me.x, me.z);   // (asked of where the rules have it, not of the glide)
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
    dropSource, get count() { return live.size; },
    add, resolve, move, remove, clear, update, live,
    setGround(f) { ground = f; for (const t of live.values()) place(t, true); },
    get standingInDanger() { return mineAny; },
    stats,
    /** #83: a mesh drawn with the template, for the boot shader warm-up (warmup.js `extras`) — compiles the program once. */
    sample() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
      for (const a of ['aF', 'aE', 'aS']) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(3), 1));
      const m = new THREE.Mesh(g, TEMPLATE); m.frustumCulled = false; m.name = 'telegraph-sample';
      return m;
    },
  };
}
