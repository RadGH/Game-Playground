// Effect zones and region looks (map editor, 2026-11-26 — owner: "Can we add shaders or other effects to the map editor
// as well"). The zones live in data/edits.json (js/world/edits.js ZONE_KINDS); this draws them, in the game AND in the
// editor (the same module, so a zone never shows in one and not the other — lessons rule 31).
//
//   const zones = createZones(view, { T, edits, quality })
//   zones.setEdits(edits)        a live edit came in (no rebuild: the pool stays, nothing recompiles — rule 29)
//   zones.update(dt, at)         at = { x, z } where the player (or the editor's camera) is: particles round it, and the
//                                colour look there (lookAt: region looks blended across the border, then each zone's tint,
//                                grade and mist, fading in over its soft edge)
//   zones.look                   the look last applied (tests, the editor's readout)    zones.stats { particles, zones }
//   zones.dispose()
//
// Cost: two instanced quad meshes (one glowing, one soft), a fixed pool per quality (Low 240 / Medium 640 / High 1100),
// shared by the zones within reach and spent on the part of each zone near you; two draw calls whatever the zones.
import * as THREE from 'three';
import { lookAt, normEdits, zoneWeight } from '../../world/edits.js';
import { GRADE, BLOOM } from './post.js';
import { ATMOS } from './atmos.js';

const POOL = { low: 240, medium: 640, high: 1100 };
const NEAR = 70;                 // metres round you that particles are spent on
// per kind: how many per 100 m² (× the zone's amount), which mesh, and how one particle is made and moves
const KIND = {
  fireflies: { per: 0.7, glow: true },
  embers:    { per: 6, glow: true, cap: 60 },
  marsh:     { per: 0.35, glow: true },
  dust:      { per: 0.5, glow: true },
  shafts:    { per: 0.05, glow: true, cap: 14 },
  leaves:    { per: 0.35, glow: false },
  fog:       { per: 0.045, glow: false, cap: 90 },
  look:      { per: 0 },
};

const VERT = /* glsl */`
  attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol; attribute float iMode;
  varying vec2 vUv; varying vec4 vCol; varying float vMode; varying float vFade;
  void main(){
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    if (iMode > 0.5 && iMode < 1.5) {          // light shaft: stands upright, turns about y to face you
      vec3 to = vec3(cameraPosition.x - iPos.x, 0.0, cameraPosition.z - iPos.z);
      to = length(to) > 0.001 ? normalize(to) : vec3(0.0, 0.0, 1.0);
      right = vec3(to.z, 0.0, -to.x); up = vec3(0.0, 1.0, 0.0);
    }
    vec3 wp = iPos + right * position.x * iSize.x + up * position.y * iSize.y;
    vUv = uv; vCol = iCol; vMode = iMode;
    float d = distance(cameraPosition, wp);
    vFade = 1.0 - smoothstep(${(NEAR * 0.75).toFixed(1)}, ${NEAR.toFixed(1)}, d);
    vFade *= smoothstep(0.4, 2.0, d);           // nothing pops right in your face
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const FRAG = /* glsl */`
  varying vec2 vUv; varying vec4 vCol; varying float vMode; varying float vFade;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float a;
    if (vMode > 0.5 && vMode < 1.5) a = (1.0 - abs(p.x)) * smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.35, vUv.y);   // shaft: soft sides, fades at both ends
    else if (vMode > 1.5) { float r = length(p * vec2(1.0, 1.9)); a = smoothstep(1.0, 0.7, r); }   // leaf: a small ellipse
    else { float r = length(p); a = pow(max(0.0, 1.0 - r * r), 1.6); }                            // soft round puff / spark
    a *= vCol.a * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makeMesh(n, glow) {
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const A = (name, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
  const att = { pos: A('iPos', 3), size: A('iSize', 2), col: A('iCol', 4), mode: A('iMode', 1) };
  g.instanceCount = 0;
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
  m.name = glow ? 'zones glow' : 'zones soft';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = glow ? 5 : 4; mesh.name = m.name;
  return { mesh, att, n };
}

const hexRgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const rnd = Math.random;

export function createZones(view, { T, edits = null, quality = 'medium' }) {
  const { scene, renderer, sun } = view;
  const N = POOL[quality] || POOL.medium;
  const glow = makeMesh(Math.round(N * 0.6), true), soft = makeMesh(Math.round(N * 0.4), false);
  scene.add(glow.mesh); scene.add(soft.mesh);
  let E = normEdits(edits);
  // the game's own numbers when nothing changes them (the ?tune Look group, when present, sets them every frame)
  const base0 = {
    exposure: renderer.toneMappingExposure, saturation: GRADE.saturation, contrast: GRADE.contrast, warm: GRADE.warm[0] - 1,
    bloom: BLOOM.strength, mist: ATMOS.uniforms.uAtMist.value.x, fogColour: scene.fog.color.toArray(), sunColour: sun.color.toArray(),
  };
  const fogBase = scene.fog.color.clone();
  // particles: one record per slot; slots handed out to zones near you every half second
  const P = [glow, soft].map(M => ({ M, parts: Array.from({ length: M.n }, () => ({ zone: null, life: 0 })) }));
  let alloc = 0, t = 0;
  const stats = { particles: 0, zones: 0 };
  const zonesById = () => new Map(E.zones.map(z => [z.id, z]));

  function spawn(p, zn, at, first) {
    const K = zn.kind, r = Math.min(zn.r, NEAR);
    // a point in the zone, near you (the zone part within NEAR m)
    let x = zn.at[0], z = zn.at[1];
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd());
      const cx = Math.hypot(at.x - zn.at[0], at.z - zn.at[1]) < zn.r ? at.x : zn.at[0], cz = cx === at.x ? at.z : zn.at[1];
      x = cx + Math.cos(a) * d * r; z = cz + Math.sin(a) * d * r;
      if (zoneWeight(zn, x, z) > rnd() * 0.9) break;
    }
    const g = T.heightAt(x, z), w = T.waterAt(x, z), floor = w && w.depth > 0 ? w.surface : g;
    p.zone = zn.id; p.kind = K; p.x = x; p.z = z; p.age = first ? rnd() * 3 : 0; p.seed = rnd() * 100;
    if (K === 'fireflies') { p.y = floor + 0.4 + rnd() * 2.6; p.life = 6 + rnd() * 8; p.size = 0.16; p.col = [0.85, 1, 0.45]; }
    else if (K === 'embers') { const rr = Math.min(zn.r, 2.5) * Math.sqrt(rnd()), a = rnd() * 6.283; p.x = zn.at[0] + Math.cos(a) * rr; p.z = zn.at[1] + Math.sin(a) * rr; p.y = T.heightAt(p.x, p.z) + 0.3 + rnd() * 0.4; p.vy = 0.8 + rnd() * 1.2; p.life = 1.6 + rnd() * 2.4; p.size = 0.07 + rnd() * 0.07; p.col = [1, 0.48 + rnd() * 0.25, 0.12]; }
    else if (K === 'marsh') { p.y = floor + 0.05 + rnd() * 0.5; p.vy = 0.05 + rnd() * 0.12; p.life = 3 + rnd() * 4; p.size = 0.1 + rnd() * 0.18; const c = zn.tint ? hexRgb(zn.tint) : [0.55, 0.95, 0.65]; p.col = c; }
    else if (K === 'dust') { p.y = g + 0.5 + rnd() * 5; p.life = 6 + rnd() * 6; p.size = 0.035 + rnd() * 0.035; p.col = [1, 0.93, 0.75]; }
    else if (K === 'shafts') { p.y = g + 7 + rnd() * 3; p.life = 9 + rnd() * 8; p.size = 2.2 + rnd() * 2.5; p.h = 15 + rnd() * 7; p.col = [1, 0.9, 0.68]; }
    else if (K === 'leaves') { p.y = g + 6 + rnd() * 10; p.vy = -(0.6 + rnd() * 0.6); p.life = 30; p.ground = g; p.size = 0.22 + rnd() * 0.12; const c = [[0.82, 0.5, 0.16], [0.66, 0.34, 0.12], [0.58, 0.62, 0.2], [0.86, 0.68, 0.24]][Math.floor(rnd() * 4)]; p.col = c; }
    else if (K === 'fog') { p.y = floor + 1.2 + rnd() * 1.6; p.life = 14 + rnd() * 10; p.size = 9 + rnd() * 8; p.h = 3.2 + rnd() * 1.8; p.col = zn.tint ? hexRgb(zn.tint).map(v => 0.6 + v * 0.4) : [0.86, 0.9, 0.92]; }
  }
  function reallocate(at) {
    const near = E.zones.filter(zn => KIND[zn.kind]?.per && Math.hypot(at.x - zn.at[0], at.z - zn.at[1]) < zn.r + NEAR);
    stats.zones = near.length;
    for (const pool of P) {
      const glowPool = pool.M === glow;
      const mine = near.filter(zn => !!KIND[zn.kind].glow === glowPool);
      const want = mine.map(zn => { const K = KIND[zn.kind], rr = Math.min(zn.r, NEAR); return Math.min(K.cap || 300, Math.round(Math.PI * rr * rr / 100 * K.per * (zn.amount ?? 1))); });
      const total = want.reduce((a, b) => a + b, 0), k = total > pool.M.n ? pool.M.n / total : 1;
      const counts = new Map(mine.map((zn, i) => [zn.id, Math.floor(want[i] * k)]));
      // keep particles whose zone still wants them; free the rest
      const have = new Map();
      for (const p of pool.parts) if (p.zone) { const c = counts.get(p.zone) || 0, h = have.get(p.zone) || 0; if (h < c) have.set(p.zone, h + 1); else p.zone = null; }
      const byId = zonesById();
      let i = 0;
      for (const [id, c] of counts) for (let h = have.get(id) || 0; h < c; h++) {
        while (i < pool.parts.length && pool.parts[i].zone) i++;
        if (i >= pool.parts.length) break;
        spawn(pool.parts[i], byId.get(id), at, true);
      }
    }
  }
  const tmpC = new THREE.Color();
  function applyLook(at) {
    const tuned = view.tuning?.lookExposure != null;
    const b = tuned ? { ...base0, exposure: renderer.toneMappingExposure, bloom: view.post?.bloom.strength ?? base0.bloom, saturation: view.post?.grade.uSat.value ?? base0.saturation, contrast: view.post?.grade.uCon.value ?? base0.contrast, mist: ATMOS.uniforms.uAtMist.value.x, warm: view.post ? view.post.grade.uWarm.value.x - 1 : base0.warm } : base0;
    const L = lookAt(E, T, at.x, at.z, b);
    renderer.toneMappingExposure = L.exposure;
    ATMOS.set({ mist: { density: L.mist } });
    scene.fog.color.fromArray(L.fogColour);
    if (scene.background?.isColor) scene.background.copy(scene.fog.color);
    sun.color.fromArray(L.sunColour);
    const post = view.post;
    if (post) {
      post.bloom.strength = L.bloom; post.bloom.enabled = L.bloom > 0;
      const g = post.grade, tn = L.tint;
      g.uSat.value = L.saturation; g.uCon.value = L.contrast;
      g.uWarm.value.set((1 + L.warm) * tn[0], 1 * tn[1], (1 - L.warm * 1.5) * tn[2]);
      const cool = tuned ? g.uCool.value.toArray() : GRADE.cool;     // (the tuning panel's own cool shadows, when it set them this frame)
      g.uCool.value.set(cool[0] * tn[0], cool[1] * tn[1], cool[2] * tn[2]);
    } else if (L.tint.some(v => v !== 1)) {
      // Low has no grade pass: the tint goes into the fog colour a little instead (the air, not the picture)
      tmpC.fromArray(L.fogColour); scene.fog.color.setRGB(tmpC.r * L.tint[0], tmpC.g * L.tint[1], tmpC.b * L.tint[2]);
    }
    zones.look = L;
  }
  let lookAtPos = { x: 0, z: 0 };
  view.afterLook = () => applyLook(lookAtPos);        // called by view.render() right after the tuning Look numbers

  const zones = {
    stats, look: null,
    setEdits(e) { E = normEdits(e); alloc = 0; },
    update(dt, at) {
      t += dt; lookAtPos = at;
      if ((alloc -= dt) <= 0) { alloc = 0.5; reallocate(at); }
      const byId = zonesById();
      let count = 0;
      for (const pool of P) {
        const { att } = pool.M; let n = 0;
        for (const p of pool.parts) {
          if (!p.zone) continue;
          const zn = byId.get(p.zone);
          if (!zn) { p.zone = null; continue; }
          p.age += dt;
          if (p.age > p.life || Math.hypot(p.x - at.x, p.z - at.z) > NEAR + 5) { spawn(p, zn, at, false); }
          const s = p.seed, a = p.age;
          let alpha = Math.min(1, a / 1.2) * Math.min(1, (p.life - a) / 1.2), mode = 0, w = p.size, h = p.size;
          switch (p.kind) {
            case 'fireflies': p.x += Math.sin(t * 0.7 + s) * dt * 0.5; p.z += Math.cos(t * 0.6 + s * 1.3) * dt * 0.5; p.y += Math.sin(t * 0.9 + s * 2) * dt * 0.25; alpha *= 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + s * 5)); break;
            case 'embers': p.y += p.vy * dt; p.x += Math.sin(t * 3 + s) * dt * 0.3; p.z += Math.cos(t * 2.6 + s) * dt * 0.3; alpha *= 0.9; break;
            case 'marsh': p.y += p.vy * dt; alpha *= 0.45 * (0.6 + 0.4 * Math.sin(t * 1.5 + s)); break;
            case 'dust': p.x += Math.sin(t * 0.2 + s) * dt * 0.25; p.y += Math.sin(t * 0.3 + s * 2) * dt * 0.08; alpha *= 0.32; break;
            case 'shafts': mode = 1; w = p.size; h = p.h; alpha *= 0.075 * (0.7 + 0.3 * Math.sin(t * 0.25 + s)); break;
            case 'leaves': mode = 2; p.y += p.vy * dt; p.x += Math.sin(t * 1.3 + s) * dt * 0.9; p.z += Math.cos(t * 1.1 + s) * dt * 0.6; w = p.size * (0.35 + 0.65 * Math.abs(Math.sin(t * 2.4 + s))); if (p.y < p.ground + 0.05) { p.y = p.ground + 0.05; p.life = Math.min(p.life, a + 1.5); } alpha *= 0.95; break;
            case 'fog': p.x += Math.sin(t * 0.05 + s) * dt * 0.35; p.z += Math.cos(t * 0.04 + s) * dt * 0.35; w = p.size; h = p.h; alpha *= 0.2 * Math.min(1.5, zn.amount ?? 1); break;
            default: break;
          }
          alpha *= zoneWeight(zn, p.x, p.z);
          if (alpha <= 0.003) continue;
          att.pos.setXYZ(n, p.x, p.y, p.z); att.size.setXY(n, w, h); att.col.setXYZW(n, p.col[0], p.col[1], p.col[2], Math.min(1, alpha)); att.mode.setX(n, mode);
          n++;
        }
        pool.M.mesh.geometry.instanceCount = n;
        for (const k of ['pos', 'size', 'col', 'mode']) att[k].needsUpdate = true;
        count += n;
      }
      stats.particles = count;
    },
    dispose() {
      if (view.afterLook) view.afterLook = null;
      scene.fog.color.copy(fogBase); if (scene.background?.isColor) scene.background.copy(fogBase);
      for (const M of [glow, soft]) { scene.remove(M.mesh); M.mesh.geometry.dispose(); M.mesh.material.dispose(); }
    },
  };
  return zones;
}
