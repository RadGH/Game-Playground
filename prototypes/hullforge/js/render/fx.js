// Effects. Everything is pooled and drawn with a handful of shared materials made once at load (no new shaders
// mid-fight — lessons rule 29), and the pools are drawn once while the title shows so their shaders are ready:
//   - glow particles (one Points cloud, additive): fire, embers, emitter glows, plasma balls, engine sparks.
//     A particle with `st` is drawn as a short streak along its motion instead (sparks), `ramp` makes it burn
//     white → its colour → dark red (fire), `once` draws it for one frame only (beam blooms, emitters).
//   - smoke/dust particles (one Points cloud, normal blending)
//   - streaks (render/streaks.js, one mesh): beams + helix strands (render/beams.js), bullet tracers by gun,
//     railgun lines, muzzle cones, spark streaks, engine trails
//   - flash sprites and shock rings (pools), debris cubes (one InstancedMesh, red-hot → dark), missiles, pickups
// The look follows Voidwright's round 4 (every gun has its own flash, tracer and impact in its damage colour).

import * as THREE from 'three';
import { softGlow } from './sky.js';
import { RARITY, ORES } from '../data/blocks.js';
import { createStreaks } from './streaks.js';
import { drawBeams } from './beams.js';
import { bus } from './fxbus.js';

const MAXP = 6000;
const MAX_DEBRIS = 220;
/** Damage colours for impacts. */
export const DMG_COLOR = { kinetic: '#ffc35a', energy: '#7fe8ff', explosive: '#ff9b52' };

function cloud(additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAXP * 3), col = new Float32Array(MAXP * 4), size = new Float32Array(MAXP);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute vec4 pcol; attribute float psize; varying vec4 vC; uniform float scale; void main(){ vC = pcol; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = clamp(psize*scale/max(1.0,-mv.z), 1.0, 260.0); gl_Position = projectionMatrix*mv; }',
    fragmentShader: additive
      ? 'varying vec4 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); a*=a; gl_FragColor = vec4(vC.rgb*a*vC.a, 1.0); }'
      : 'varying vec4 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.15,d)*vC.a; gl_FragColor = vec4(vC.rgb, a); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return { pts, geo, pos, col, size, list: [] };
}

// fire colour over a particle's life: white-hot → its own colour → dark red
const HOT = new THREE.Color(1.6, 1.45, 1.1), EMBER = new THREE.Color(0.45, 0.1, 0.03);
function ramp(out, base, k) {
  if (k < 0.15) return out.copy(HOT).lerp(base, k / 0.15);
  if (k < 0.55) return out.copy(base);
  return out.copy(base).lerp(EMBER, (k - 0.55) / 0.45);
}

export function createFx(scene) {
  const glow = cloud(true), smoke = cloud(false);
  scene.add(glow.pts); scene.add(smoke.pts);
  const streaks = createStreaks(scene);
  // flash sprites + shock rings
  const flashes = [];
  const flashMat = new THREE.SpriteMaterial({ map: softGlow(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48), thinRingGeo = new THREE.RingGeometry(0.955, 1, 96);   // big blasts use the thin one
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // debris: small tumbling cubes. The instance colour is used as the glow (red-hot fading to nothing), over a dark
  // metal base, so one material covers every piece.
  const debGeo = new THREE.BoxGeometry(1, 1, 1);
  const debMat = new THREE.MeshStandardMaterial({ color: 0x3b3e44, metalness: 0.55, roughness: 0.5 });
  debMat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance += vColor.rgb;\n#endif');
  };
  const debMesh = new THREE.InstancedMesh(debGeo, debMat, MAX_DEBRIS);
  debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debMesh.setColorAt(0, new THREE.Color(0, 0, 0)); debMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  debMesh.count = 0; debMesh.frustumCulled = false; scene.add(debMesh);
  const debris = [];
  // missiles
  const misGeo = new THREE.ConeGeometry(0.18, 1.1, 8); misGeo.rotateX(Math.PI / 2);
  const misMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.5, roughness: 0.4, emissive: 0x331100 });
  const misMeshes = [];
  const addMissileMesh = () => { const m = new THREE.Mesh(misGeo, misMat); m.visible = false; scene.add(m); misMeshes.push(m); return m; };
  for (let i = 0; i < 8; i++) addMissileMesh();
  // pickups
  const gemGeo = new THREE.OctahedronGeometry(0.9);
  const oreGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const chipGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.2, 16);
  const pillarGeo = new THREE.CylinderGeometry(0.15, 0.6, 30, 10, 1, true); pillarGeo.translate(0, 15, 0);
  const pickMeshes = new Map();
  const pickMat = new Map();
  const matFor = hex => { if (!pickMat.has(hex)) pickMat.set(hex, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6), toneMapped: false })); return pickMat.get(hex); };
  const pillarMats = new Map();
  const pillarFor = hex => { if (!pillarMats.has(hex)) pillarMats.set(hex, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); return pillarMats.get(hex); };

  const C = new THREE.Color(), C2 = new THREE.Color(), RC = new THREE.Color();
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), M4 = new THREE.Matrix4(), S3 = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  let quality = 1;
  const camPos = new THREE.Vector3();
  const lines = [];           // streaks that live a while (rail lines, muzzle cones, engine trails)
  const later = [];           // delayed effects (a capital ship's chain of blasts), timed by the game clock
  const rails = new Map();    // railgun slugs in flight → where they started
  const railMuzzles = [];     // recent railgun muzzles, to start the next slug's line there
  let clock = 0, warm = 3;

  function particle(cl, p) { if (cl.list.length < MAXP) cl.list.push(p); }
  const glowP = p => particle(glow, p), smokeP = p => particle(smoke, p);
  /** A glow point drawn this frame only. */
  function glowOnce(x, y, z, r, g, b, size, a = 1) { particle(glow, { x, y, z, vx: 0, vy: 0, vz: 0, life: 1, max: 1, r, g, b, size, a, once: true }); }
  const n = k => Math.max(1, Math.round(k * quality));
  const rnd = () => Math.random() - 0.5;

  function spark(pos, hex, cnt = 6, speed = 18, life = 0.45, size = 0.5) {
    C.set(hex);
    for (let i = 0; i < cnt * quality; i++) {
      const s = speed * (0.4 + Math.random());
      glowP({ x: pos.x, y: pos.y, z: pos.z, vx: rnd() * 2 * s, vy: rnd() * 2 * s, vz: rnd() * 2 * s, life: life * (0.6 + Math.random() * 0.8), max: life, r: C.r, g: C.g, b: C.b, size: size * (0.6 + Math.random() * 0.8), drag: 0.92, st: 1 });
    }
  }
  // pooled: materials are made once at load and reused, never disposed mid-fight (no shader rebuild stutter)
  const spritePool = [], ringPool = [];
  for (let i = 0; i < 160; i++) { const s = new THREE.Sprite(flashMat.clone()); s.visible = false; scene.add(s); spritePool.push(s); }
  for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(ringGeo, ringMat.clone()); m.visible = false; m.frustumCulled = false; scene.add(m); ringPool.push(m); }
  const take = pool => { const o = pool.find(x => !x.visible) || pool[0]; const i = flashes.findIndex(f => f.obj === o); if (i >= 0) flashes.splice(i, 1); o.visible = true; return o; };
  function flash(pos, hex, size, life = 0.18, opts = {}) {
    const s = take(spritePool); C.set(hex); s.material.color.copy(C).multiplyScalar(2.2); s.material.opacity = 1; s.position.set(pos.x, pos.y, pos.z); s.scale.setScalar(size);
    flashes.push({ obj: s, life, max: life, size, grow: opts.grow ?? 1.3, ramp: opts.ramp ? C.clone() : null });
  }
  /** A shock ring. Faces the camera, or lies across `normal` when given (a ring round the shot line). */
  function ring(pos, size, hex = '#ffc890', life = 0.5, camera, normal = null) {
    const m = take(ringPool); m.material.color.set(hex); m.position.set(pos.x, pos.y, pos.z); m.geometry = size > 5 ? thinRingGeo : ringGeo;
    if (normal) m.quaternion.setFromUnitVectors(Z, V.set(normal.x, normal.y, normal.z).normalize()); else if (camera) m.quaternion.copy(camera.quaternion);
    flashes.push({ obj: m, life, max: life, size: size * 0.2, grow: size * 3.2, ring: true, faceCam: !normal });
  }
  /** A streak that lives a while and fades (grows wider by `grow` m/s). */
  function line(a, b, w, hex, life, { alpha = 1, tail = alpha, sharp = 1, boost = 1.6, grow = 0 } = {}) {
    C.set(hex);
    lines.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, w, r: C.r * boost, g: C.g * boost, b: C.b * boost, a: alpha, t: tail, sharp, life, max: life, grow });
  }

  // ---------------------------------------------------------------- muzzle flashes (one look per gun)
  function muzzle(kind, m, dir, hex, vis = 0, rc = null) {
    const d = dir ? V2.set(dir.x, dir.y, dir.z).normalize() : V2.set(0, 0, 1);
    const k = 1 + Math.min(4, vis) * 0.12;
    const at = (dist) => ({ x: m.x + d.x * dist, y: m.y + d.y * dist, z: m.z + d.z * dist });
    switch (kind) {
      case 'autocannon': {
        // twin lobes: a forward tongue and a short cross flash, plus a couple of hot flecks
        flash(m, hex, 1.3 * k, 0.07);
        line(m, at(1.5 * k), 0.32 * k, hex, 0.06, { alpha: 1, tail: 0.1, sharp: 0.8, boost: 2 });
        V.set(d.y, -d.x, 0.3).normalize();
        line({ x: m.x - V.x * 0.5, y: m.y - V.y * 0.5, z: m.z - V.z * 0.5 }, { x: m.x + V.x * 0.5, y: m.y + V.y * 0.5, z: m.z + V.z * 0.5 }, 0.16 * k, hex, 0.05, { alpha: 0.8, sharp: 1.2, boost: 2 });
        spark(at(0.4), hex, 2, 10, 0.18, 0.3);
        break;
      }
      case 'gatling': {
        // a flickering cone: a different length every shot
        const L = (0.7 + Math.random() * 0.9) * k;
        flash(m, hex, 0.8 * k, 0.04);
        line(m, at(L), 0.22 * k, hex, 0.04, { alpha: 0.95, tail: 0.05, sharp: 0.9, boost: 2 });
        break;
      }
      case 'railgun': {
        // the coils dump at once: a blue-white burst, a ring round the barrel, a shock line ahead
        flash(m, hex, 3.4 * k, 0.2); flash(m, '#ffffff', 1.2 * k, 0.09);
        ring(m, 1.1 * k, hex, 0.35, null, d);
        ring(at(2.2), 0.7 * k, '#d8ecff', 0.28, null, d);
        line(m, at(5 * k), 0.45 * k, hex, 0.16, { alpha: 0.9, tail: 0, sharp: 1.2, boost: 2 });
        spark(m, hex, 6, 14, 0.3, 0.35);
        railMuzzles.push({ x: m.x, y: m.y, z: m.z, t: clock });
        break;
      }
      case 'plasma': {
        // a green puff that swells, and a few slow glowing motes drifting forward
        flash(m, hex, 2.4 * k, 0.22, { grow: 2.2 });
        C.set(hex);
        for (let i = 0; i < n(6); i++) { const s = 2 + Math.random() * 4; glowP({ x: m.x, y: m.y, z: m.z, vx: d.x * s + rnd() * 3, vy: d.y * s + rnd() * 3, vz: d.z * s + rnd() * 3, life: 0.4, max: 0.4, r: C.r, g: C.g, b: C.b, size: 0.5, drag: 0.9 }); }
        break;
      }
      case 'missile': {
        // launch flash + back-blast: smoke and sparks thrown out behind the pod
        flash(m, '#ffb070', 1.7 * k, 0.18);
        for (let i = 0; i < n(7); i++) { const s = 5 + Math.random() * 9; const g = 0.42 + Math.random() * 0.15; smokeP({ x: m.x, y: m.y, z: m.z, vx: -d.x * s + rnd() * 4, vy: -d.y * s + rnd() * 4, vz: -d.z * s + rnd() * 4, life: 1 + Math.random() * 0.8, max: 1.8, r: g, g, b: g * 1.05, a: 0.4, size: 0.8, grow: 2, drag: 0.94 }); }
        for (let i = 0; i < n(4); i++) { const s = 8 + Math.random() * 8; glowP({ x: m.x, y: m.y, z: m.z, vx: -d.x * s + rnd() * 5, vy: -d.y * s + rnd() * 5, vz: -d.z * s + rnd() * 5, life: 0.3, max: 0.3, r: 1, g: 0.6, b: 0.3, size: 0.35, drag: 0.9, st: 1 }); }
        break;
      }
      case 'flak': {
        flash(m, hex, 1.5 * k, 0.08);
        line(m, at(1.2 * k), 0.3 * k, hex, 0.06, { alpha: 1, tail: 0.1, sharp: 0.8, boost: 2 });
        const g = 0.4; smokeP({ x: m.x + d.x, y: m.y + d.y, z: m.z + d.z, vx: d.x * 3, vy: d.y * 3, vz: d.z * 3, life: 0.8, max: 0.8, r: g, g, b: g, a: 0.3, size: 0.7, grow: 1.6, drag: 0.92 });
        break;
      }
      case 'laser': flash(m, hex, 1.5 * k, 0.12); ring(m, 0.4 * k, hex, 0.18, null, d); break;
      default: flash(m, hex, 1.2 * k, 0.08);
    }
    if (rc && vis >= 3) flash(m, rc, 1.1 * k, 0.12);
  }

  // ---------------------------------------------------------------- impacts
  /** A shot landed: sparks in its damage colour (more for better parts); shields only ripple (drawn by views). */
  function impact(pos, { color, dmgType, vis = 0, rc = null, shield = false, small = false, kind = null, dir = null } = {}) {
    if (shield) { glowOnce(pos.x, pos.y, pos.z, 0.6, 0.85, 1.2, 1.2); flash(pos, '#9fdcff', 0.9, 0.08); return; }
    const hex = DMG_COLOR[dmgType] || color || '#ffcf7a';
    if (small) { spark(pos, hex, 2, 10, 0.25, 0.3); return; }
    const k = 1 + Math.min(5, vis) * 0.2;
    flash(pos, hex, 1 * k, 0.1); flash(pos, '#ffffff', 0.4 * k, 0.05);
    C.set(hex);
    const back = dir ? V.set(-dir.x, -dir.y, -dir.z) : V.set(0, 0, 0);
    for (let i = 0; i < n(5 + vis * 2); i++) {
      const s = 10 + Math.random() * 16 * k;
      glowP({ x: pos.x, y: pos.y, z: pos.z, vx: (back.x * 0.8 + rnd() * 1.6) * s, vy: (back.y * 0.8 + rnd() * 1.6) * s, vz: (back.z * 0.8 + rnd() * 1.6) * s,
        life: 0.25 + Math.random() * 0.25, max: 0.5, r: C.r, g: C.g, b: C.b, size: 0.35 + Math.random() * 0.2, drag: 0.9, st: 1 });
    }
    for (let i = 0; i < n(1 + vis * 0.5); i++) glowP({ x: pos.x, y: pos.y, z: pos.z, vx: rnd() * 4, vy: rnd() * 4, vz: rnd() * 4, life: 0.6, max: 0.6, r: C.r, g: C.g * 0.7, b: C.b * 0.4, size: 0.3, drag: 0.97, ramp: 1 });
    if (rc && vis >= 3) flash(pos, rc, 0.9 * k, 0.12);
    if (kind === 'rail') { ring(pos, 1.6 * k, '#cfe6ff', 0.4, null, dir); flash(pos, '#cfe6ff', 2.2 * k, 0.14); }
  }

  // ---------------------------------------------------------------- explosions
  function explosion(pos, size, hex = '#ffb35a', camera, big = false) {
    const capital = big && size >= 12;
    C2.set(hex);
    flash(pos, '#ffffff', size * 1.5, 0.12, { grow: 0.6 });                        // the bright core
    for (let i = 0; i < (big ? 4 : 2); i++)                                      // the fire ball
      flash({ x: pos.x + rnd() * size * 0.5, y: pos.y + rnd() * size * 0.5, z: pos.z + rnd() * size * 0.5 }, hex, size * (2 + Math.random()), 0.32 + size * 0.025 + i * 0.05, { grow: 1.5, ramp: true });
    ring(pos, size, hex, 0.45 + size * 0.03, camera);
    if (size > 2) { V.set(rnd(), rnd(), rnd()).normalize(); ring(pos, size * 1.3, '#ffe2b0', 0.55 + size * 0.03, null, V); }
    // fire: slow, fat, burning white → orange → red
    for (let i = 0; i < Math.min(90, 10 + size * 6) * quality; i++) {
      V.set(rnd(), rnd(), rnd()).normalize(); const s = (0.5 + Math.random()) * (2 + size * 1.6);
      glowP({ x: pos.x, y: pos.y, z: pos.z, vx: V.x * s, vy: V.y * s, vz: V.z * s, life: 0.6 + Math.random() * 0.7 + size * 0.04, max: 1.3 + size * 0.04, r: C2.r, g: C2.g, b: C2.b, size: 0.7 + size * 0.28, drag: 0.9, ramp: 1, grow: 0.8 });
    }
    // embers: fast streaks that cool as they fly
    for (let i = 0; i < Math.min(50, 6 + size * 3) * quality; i++) {
      V.set(rnd(), rnd(), rnd()).normalize(); const s = 12 + Math.random() * (10 + size * 5);
      glowP({ x: pos.x, y: pos.y, z: pos.z, vx: V.x * s, vy: V.y * s, vz: V.z * s, life: 0.6 + Math.random() * 0.9, max: 1.5, r: 1, g: 0.62, b: 0.25, size: 0.3 + Math.random() * 0.25, drag: 0.975, st: 1, ramp: 1 });
    }
    // only a little smoke
    for (let i = 0; i < Math.min(16, 2 + size) * quality; i++) {
      V.set(rnd(), rnd(), rnd()); const s = 1 + Math.random() * size * 0.8; const g = 0.1 + Math.random() * 0.08;
      smokeP({ x: pos.x, y: pos.y, z: pos.z, vx: V.x * s, vy: V.y * s, vz: V.z * s, life: 1.4 + Math.random() * 1.4, max: 2.8, r: g, g, b: g * 1.1, a: 0.35, size: 0.8 + size * 0.45, grow: 1.4, drag: 0.97 });
    }
    if (big) {
      for (let i = 0; i < 3; i++) later.push({ t: clock + 0.08 + i * 0.12, fn: () => flash({ x: pos.x + rnd() * size * 2, y: pos.y + rnd() * size, z: pos.z + rnd() * size * 2 }, hex, size * 2, 0.3, { ramp: true }) });
      debrisBurst(pos, null, Math.min(16, 4 + size * 0.8), 6 + size * 1.5, true, null, null, 1.8);
    }
    if (capital) {
      // a capital ship goes up in a chain of blasts along its hull, then one slow huge ring
      for (let i = 0; i < 8; i++) {
        const t = 0.15 + i * 0.2 + Math.random() * 0.1;
        later.push({ t: clock + t, fn: () => explosion({ x: pos.x + rnd() * size * 1.6, y: pos.y + rnd() * size * 0.8, z: pos.z + rnd() * size * 1.6 }, size * (0.25 + Math.random() * 0.2), hex, camera, false) });
      }
      later.push({ t: clock + 1.9, fn: () => { flash(pos, '#ffffff', size * 3, 0.35, { grow: 1 }); flash(pos, hex, size * 5, 1.4, { grow: 1.2, ramp: true }); ring(pos, size * 2.6, '#ffd9a0', 1.6, camera); V.set(rnd(), rnd() * 0.3, rnd()).normalize(); ring(pos, size * 3.2, hex, 1.9, null, V); spark(pos, '#ffe9b0', 40, 30 + size * 3, 1.4, 0.6); } });
    }
  }

  // ---------------------------------------------------------------- debris cubes
  /** Throw `cnt` tumbling cubes out of p (away from `from` when given). hot = red-hot metal; else cold chips of `hex`. */
  function debrisBurst(p, from, cnt, speed = 8, hot = true, hex = null, baseVel = null, big = 1) {
    if (hex) C.set(hex);
    for (let i = 0; i < Math.round(cnt * (quality < 1 ? 0.6 : 1)); i++) {
      if (debris.length >= MAX_DEBRIS) debris.shift();
      V.set(rnd(), rnd(), rnd()).normalize();
      if (from) { V2.set(p.x - from.x, p.y - from.y, p.z - from.z); if (V2.lengthSq() > 1e-6) V.addScaledVector(V2.normalize(), 1.2).normalize(); }
      const s = speed * (0.5 + Math.random());
      debris.push({ x: p.x, y: p.y, z: p.z, vx: V.x * s + (baseVel?.x || 0), vy: V.y * s + (baseVel?.y || 0), vz: V.z * s + (baseVel?.z || 0),
        ax: rnd(), ay: rnd(), az: rnd(), ang: Math.random() * 6, spin: 2 + Math.random() * 8, size: (0.18 + Math.random() * 0.3) * big,
        life: 2.5 + Math.random() * 2, max: 4.5, hot, cr: hex ? C.r * 0.25 : 0, cg: hex ? C.g * 0.25 : 0, cb: hex ? C.b * 0.25 : 0 });
    }
  }
  /** A block broke off: 1-3 red-hot cubes + sparks (cold chips + dust for rock). */
  function blockLost(p, body, hex) {
    const rock = body?.kind === 'rock';
    const bv = body?.vel || null;
    if (rock) {
      debrisBurst(p, body?.pos, 1 + Math.floor(Math.random() * 2), 5, false, hex || '#8a7f78', bv);
      for (let i = 0; i < n(4); i++) { const g = 0.3 + Math.random() * 0.1; smokeP({ x: p.x, y: p.y, z: p.z, vx: rnd() * 4, vy: rnd() * 4, vz: rnd() * 4, life: 1.2, max: 1.2, r: g * 1.1, g, b: g * 0.85, a: 0.4, size: 0.9, grow: 1.5, drag: 0.95 }); }
      spark(p, hex || '#ffd080', 3, 8, 0.3, 0.3);
      return;
    }
    debrisBurst(p, body?.pos, 1 + Math.floor(Math.random() * 3), 7, true, null, bv);
    spark(p, '#ffb060', 7, 16, 0.45, 0.4);
    flash(p, '#ff9a50', 1.4, 0.15, { ramp: true });
  }
  /** Old name: a puff of chips (kept for callers that still use it). */
  function debrisPuff(pos, hex = '#888888', cnt = 4) { debrisBurst(pos, null, Math.max(1, cnt / 2), 7, false, hex); spark(pos, '#ffb060', cnt, 12, 0.4, 0.35); }

  /** A damaged block burning (sev 0..1, 1 = nearly gone): small fires and sparks; smoke when very low. */
  function burn(p, sev, smokey, vel) {
    const vx = vel?.x || 0, vy = vel?.y || 0, vz = vel?.z || 0;
    if (Math.random() < 0.7) glowP({ x: p.x + rnd() * 0.5, y: p.y + rnd() * 0.5, z: p.z + rnd() * 0.5, vx: vx + rnd() * 1.5, vy: vy + rnd() * 1.5, vz: vz + rnd() * 1.5, life: 0.35 + Math.random() * 0.3, max: 0.6, r: 1, g: 0.55, b: 0.2, size: 0.35 + sev * 0.4, drag: 0.95, ramp: 1 });
    if (Math.random() < 0.25) { const s = 4 + Math.random() * 8; glowP({ x: p.x, y: p.y, z: p.z, vx: vx + rnd() * 2 * s, vy: vy + rnd() * 2 * s, vz: vz + rnd() * 2 * s, life: 0.3, max: 0.3, r: 1, g: 0.8, b: 0.45, size: 0.22, drag: 0.92, st: 1 }); }
    if (smokey && Math.random() < 0.6) { const g = 0.16 + Math.random() * 0.08; smokeP({ x: p.x, y: p.y, z: p.z, vx: vx * 0.6 + rnd() * 1.2, vy: vy * 0.6 + rnd() * 1.2, vz: vz * 0.6 + rnd() * 1.2, life: 1.6 + Math.random(), max: 2.6, r: g, g, b: g * 1.05, a: 0.3, size: 0.6, grow: 1.2, drag: 0.985 }); }
  }
  /** An engine trail piece: a faint streak from the nozzle's last spot to this one. */
  function trail(a, b, w, hex, life = 0.45) { if (lines.length < 3000) line(a, b, w, hex, life, { alpha: 0.32, sharp: 1.4, boost: 1.4 }); }

  function rail(from, to) {
    line(from, to, 0.35, '#6fb6ff', 0.7, { alpha: 0.55, sharp: 1.3, boost: 1.6, grow: 0.5 });
    line(from, to, 0.07, '#e8f4ff', 0.5, { alpha: 1, sharp: 0.8, boost: 1.4 });
  }

  // ---------------------------------------------------------------- per frame
  const TRACER = {
    // half-width (m), length (s of flight), core width, head glow size
    gatling: { w: 0.05, len: 0.022, core: 0.018, head: 0 },
    autocannon: { w: 0.1, len: 0.028, core: 0.035, head: 0.5 },
    flak: { w: 0.12, len: 0.02, core: 0.04, head: 0.7 },
    rail: { w: 0.24, len: 0.03, core: 0.08, head: 1.4 },
    plasma: { w: 0.35, len: 0.05, core: 0.12, head: 2.1 },
  };
  function update(w, dt, camera, now) {
    clock += dt;
    if (camera) camPos.copy(camera.position);
    streaks.begin(camera, window.innerHeight);
    // delayed effects
    for (let i = later.length - 1; i >= 0; i--) if (later[i].t <= clock) { const f = later[i].fn; later.splice(i, 1); f(); }
    // tracers from the sim's shots: a soft coloured streak + a hot core, thicker for heavier guns
    const live = new Set();
    for (const s of w.shots) {
      if (s.kind === 'missile') continue;
      const T = TRACER[s.kind === 'shell' ? (s.gun === 'gatling' ? 'gatling' : 'autocannon') : s.kind] || TRACER.autocannon;
      const k = 1 + Math.min(4, s.vis || 0) * 0.08;
      C.set(s.color || '#ffcf7a'); if (s.rc) C.lerp(RC.set(s.rc), 0.35);
      const tx = s.pos.x - s.vel.x * T.len, ty = s.pos.y - s.vel.y * T.len, tz = s.pos.z - s.vel.z * T.len;
      streaks.add(s.pos.x, s.pos.y, s.pos.z, tx, ty, tz, T.w * 2.4 * k, C.r * 1.4, C.g * 1.4, C.b * 1.4, 0.55, 0, 1.4);
      streaks.add(s.pos.x, s.pos.y, s.pos.z, tx, ty, tz, T.core * k, 1.5, 1.45, 1.3, 1, 0.1, 0.8);
      if (T.head) glowOnce(s.pos.x, s.pos.y, s.pos.z, C.r, C.g, C.b, T.head * k, s.kind === 'plasma' ? 1 : 0.8);
      if (s.kind === 'plasma') {
        glowOnce(s.pos.x, s.pos.y, s.pos.z, 1, 1, 1, 0.7 * k);
        if (Math.random() < 0.6 * quality) glowP({ x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, r: C.r * 0.5, g: C.g * 0.5, b: C.b * 0.5, size: 1.4 });
      }
      if (s.kind === 'flak' && Math.random() < 0.15 * quality) { const g = 0.38; smokeP({ x: s.pos.x, y: s.pos.y, z: s.pos.z, vx: 0, vy: 0, vz: 0, life: 0.7, max: 0.7, r: g, g, b: g, a: 0.18, size: 0.5, grow: 1.2 }); }
      if (s.kind === 'rail') {
        live.add(s);
        let r = rails.get(s);
        if (!r) {
          // start the line at the muzzle that just fired (the nearest one in the last moment)
          let best = null, bd = 60 * 60;
          for (const m of railMuzzles) { const d = (m.x - s.pos.x) ** 2 + (m.y - s.pos.y) ** 2 + (m.z - s.pos.z) ** 2; if (d < bd && clock - m.t < 0.3) { bd = d; best = m; } }
          r = { x: best ? best.x : s.pos.x, y: best ? best.y : s.pos.y, z: best ? best.z : s.pos.z, last: null };
          rails.set(s, r);
        }
        r.last = { x: s.pos.x + s.vel.x / 60, y: s.pos.y + s.vel.y / 60, z: s.pos.z + s.vel.z / 60 };
        streaks.add(r.x, r.y, r.z, s.pos.x, s.pos.y, s.pos.z, 0.3, 0.45, 0.75, 1.6, 0.45, 0.6, 1.3);
      }
    }
    for (const [s, r] of rails) if (!live.has(s)) { rails.delete(s); if (r.last) rail(r, r.last); }
    for (let i = railMuzzles.length - 1; i >= 0; i--) if (clock - railMuzzles[i].t > 0.4) railMuzzles.splice(i, 1);
    // missiles: the body, a hot exhaust tongue, a smoke trail
    const ms = w.shots.filter(s => s.kind === 'missile');
    while (misMeshes.length < ms.length) addMissileMesh();
    misMeshes.forEach((m, i) => {
      const s = ms[i]; m.visible = !!s || warm > 0; if (!s) { if (warm > 0) { m.position.copy(camPos); m.position.y -= 1e4; } return; }
      m.position.set(s.pos.x, s.pos.y, s.pos.z); m.lookAt(s.pos.x + s.vel.x, s.pos.y + s.vel.y, s.pos.z + s.vel.z);
      C.set(s.color || '#ff6a4a');
      const sp = Math.hypot(s.vel.x, s.vel.y, s.vel.z) || 1; const bx = s.pos.x - s.vel.x / sp * 0.6, by = s.pos.y - s.vel.y / sp * 0.6, bz = s.pos.z - s.vel.z / sp * 0.6;
      streaks.add(bx, by, bz, bx - s.vel.x / sp * 2.2, by - s.vel.y / sp * 2.2, bz - s.vel.z / sp * 2.2, 0.28, 1.6, 1.0, 0.5, 1, 0, 1);
      glowOnce(bx, by, bz, 1.4, 0.9, 0.5, 0.9);
      if (Math.random() < 0.6 * quality) smokeP({ x: bx, y: by, z: bz, vx: rnd() * 2, vy: rnd() * 2, vz: rnd() * 2, life: 1.2, max: 1.2, r: 0.5, g: 0.5, b: 0.52, a: 0.32, size: 0.7, grow: 1.3 });
    });
    // beams (layers, emitter, helix, hit bloom)
    drawBeams(w.beams, fxCtx, camPos, now);
    // streaks that live a while
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i]; l.life -= dt;
      if (l.life <= 0) { lines[i] = lines[lines.length - 1]; lines.pop(); continue; }
      const f = l.life / l.max; l.w += l.grow * dt;
      streaks.add(l.ax, l.ay, l.az, l.bx, l.by, l.bz, l.w, l.r, l.g, l.b, l.a * f, l.t * f, l.sharp);
    }
    // debris cubes
    let di = 0;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.life -= dt;
      if (d.life <= 0) { debris.splice(i, 1); continue; }
      const k = Math.pow(0.995, dt * 60); d.vx *= k; d.vy *= k; d.vz *= k;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.ang += d.spin * dt;
      const f = d.life / d.max; const fade = Math.min(1, d.life / 0.6);
      Q.setFromAxisAngle(V.set(d.ax, d.ay, d.az).normalize(), d.ang); S3.setScalar(d.size * fade);
      M4.compose(V2.set(d.x, d.y, d.z), Q, S3); debMesh.setMatrixAt(di, M4);
      // red-hot metal cools: bright orange → dull red → nothing over the first ~70% of its life
      const heat = d.hot ? Math.max(0, (f - 0.3) / 0.7) : 0;
      C.setRGB(d.cr + heat * heat * 3.2, d.cg + heat * heat * heat * 1.4, d.cb + heat ** 4 * 0.4); debMesh.setColorAt(di, C);
      if (d.hot && heat > 0.5 && Math.random() < 0.3 * quality) glowP({ x: d.x, y: d.y, z: d.z, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, r: 1, g: 0.45, b: 0.15, size: 0.3, ramp: 1 });
      di++;
    }
    if (warm > 0 && di === 0) { M4.compose(V2.copy(camPos).setY(camPos.y - 1e4), Q.identity(), S3.setScalar(1e-3)); debMesh.setMatrixAt(0, M4); debMesh.setColorAt(0, C.setRGB(0, 0, 0)); di = 1; }
    debMesh.count = di; debMesh.instanceMatrix.needsUpdate = true; if (debMesh.instanceColor) debMesh.instanceColor.needsUpdate = true;
    // particles (glow + smoke); streak sparks go into the streak batch
    for (const cl of [glow, smoke]) {
      let cnt = 0; const keep = [];
      const isGlow = cl === glow;
      for (const p of cl.list) {
        if (!p.once) {
          p.life -= dt; if (p.life <= 0) continue;
          const k = Math.pow(p.drag || 0.95, dt * 60);
          p.vx *= k; p.vy *= k; p.vz *= k; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.grow) p.size += p.grow * dt;
        }
        const f = p.once ? 1 : p.life / p.max;
        let r = p.r, g = p.g, b = p.b;
        if (p.ramp) { ramp(C, C2.setRGB(p.r, p.g, p.b), 1 - f); r = C.r; g = C.g; b = C.b; }
        if (isGlow && p.st) {
          // a spark: a short streak along its motion, longer when fast
          const L = 0.03 + 0.01 * quality;
          streaks.add(p.x, p.y, p.z, p.x - p.vx * L, p.y - p.vy * L, p.z - p.vz * L, p.size * 0.32, r * 2, g * 2, b * 2, Math.min(1, f * 1.6), 0, 1);
          keep.push(p); continue;
        }
        if (cnt < MAXP) {
          cl.pos[cnt * 3] = p.x; cl.pos[cnt * 3 + 1] = p.y; cl.pos[cnt * 3 + 2] = p.z;
          cl.col[cnt * 4] = r; cl.col[cnt * 4 + 1] = g; cl.col[cnt * 4 + 2] = b;
          cl.col[cnt * 4 + 3] = isGlow ? (p.once ? (p.a ?? 1) : f * 1.6 * (p.a ?? 1)) : (p.a ?? 1) * Math.min(1, f * 1.5);
          cl.size[cnt] = p.size; cnt++;
        }
        if (!p.once) keep.push(p);
      }
      if (warm > 0 && cnt === 0) { cl.pos[0] = camPos.x; cl.pos[1] = camPos.y - 1e4; cl.pos[2] = camPos.z; cl.col[3] = 0; cl.size[0] = 0.01; cnt = 1; }
      cl.list = keep;
      cl.geo.setDrawRange(0, cnt);
      for (const a of ['position', 'pcol', 'psize']) cl.geo.attributes[a].needsUpdate = true;
      cl.pts.material.uniforms.scale.value = window.innerHeight * 0.9;
    }
    if (warm > 0) streaks.add(camPos.x, camPos.y - 1e4, camPos.z, camPos.x + 0.01, camPos.y - 1e4, camPos.z, 0.001, 0, 0, 0, 0, 0, 1);
    streaks.end();
    // flashes / rings
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]; f.life -= dt; const k = f.life / f.max;
      if (f.life <= 0) { f.obj.visible = false; flashes.splice(i, 1); continue; }
      if (f.ring) { const s = f.size + f.grow * (1 - k); f.obj.scale.setScalar(s); f.obj.material.opacity = k * 0.9; if (camera && f.faceCam) f.obj.quaternion.copy(camera.quaternion); }
      else {
        f.obj.scale.setScalar(f.size * (1 + (1 - k) * f.grow)); f.obj.material.opacity = k;
        if (f.ramp) { ramp(C, f.ramp, 1 - k); f.obj.material.color.copy(C).multiplyScalar(2); }
      }
    }
    // warm-up: draw one of each pooled kind (far below, tiny) for the first frames so their shaders are built now
    if (warm > 0) {
      warm--;
      const s = spritePool[spritePool.length - 1], r = ringPool[ringPool.length - 1];
      for (const o of [s, r]) { if (!flashes.some(f => f.obj === o)) { o.visible = warm > 0; o.position.copy(camPos).setY(camPos.y - 1e4); o.scale.setScalar(1e-3); } }
    }
    // pickups
    const seen = new Set();
    for (const k of w.pickups) {
      seen.add(k);
      let m = pickMeshes.get(k);
      if (!m) {
        const hex = k.kind === 'item' ? RARITY[k.item.rarity].color : k.kind === 'ore' ? ORES[k.ore].color : '#ffd34a';
        m = new THREE.Group();
        const core = new THREE.Mesh(k.kind === 'item' ? gemGeo : k.kind === 'ore' ? oreGeo : chipGeo, matFor(hex)); m.add(core); m.userData.core = core;
        if (k.kind === 'item') { const pil = new THREE.Mesh(pillarGeo, pillarFor(hex)); pil.scale.setScalar(k.item.rarity >= 2 ? 1 : 0.5); m.add(pil); }
        if (k.kind === 'ore') core.scale.setScalar(0.6 + Math.min(1, k.qty * 0.2));
        scene.add(m); pickMeshes.set(k, m);
      }
      m.position.set(k.pos.x, k.pos.y, k.pos.z);
      m.userData.core.rotation.y = now * 1.8; m.userData.core.rotation.x = now * 0.7;
      if (camera) { const p = m.children[1]; if (p) p.quaternion.identity(); }
    }
    for (const [k, m] of pickMeshes) if (!seen.has(k)) { scene.remove(m); pickMeshes.delete(k); }
  }
  function clear() {
    glow.list = []; smoke.list = [];
    for (const f of flashes) f.obj.visible = false; flashes.length = 0;
    lines.length = 0; later.length = 0; rails.clear(); railMuzzles.length = 0; debris.length = 0; debMesh.count = 0;
    for (const m of pickMeshes.values()) scene.remove(m); pickMeshes.clear();
    for (const m of misMeshes) m.visible = false;
  }
  const fxCtx = { streaks, glowOnce, glow: glowP, smoke: smokeP, get quality() { return quality; } };
  const api = {
    spark, flash, ring, line, explosion, debris: debrisPuff, debrisBurst, blockLost, impact, muzzle, burn, trail, rail, update, clear,
    setQuality(q) { quality = q; }, get quality() { return quality; },
    particle: glowP, smoke: smokeP, glowOnce, glowCloud: glow, streaks,
    counts: () => ({ glow: glow.list.length, smoke: smoke.list.length, streaks: streaks.count, debris: debris.length, lines: lines.length }),
  };
  bus.fx = api;
  return api;
}
