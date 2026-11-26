// Fluffy leaf tufts — the stylized-tree technique used across games and the three.js community (owner 2026-11-24:
// "Trees look bad compared to Thousandvale … look at reddit and github for some procedurally generated trees and foliage
// instead of reinventing the wheel"). Sources this follows:
//   • Michael Dougall, "Creating fluffy trees with Three.js" (douges.dev/blog/threejs-trees-1), after Pontus Karlsson's
//     Unity method: foliage is many small quads; the vertex shader pushes each quad's corners out IN VIEW SPACE, so every
//     tuft turns to face the camera and the crown reads as a solid, soft ball from every side and distance.
//   • leoawen/fluffytree-threejs (MIT) and the three.js forum "Fluffy Tree - Anime Style": split the canopy into
//     clusters / tufts and light each one as a ball.
// Our own parts: the clumps come from story-trees.js's plan (the trunk, limbs and colliders do not change), normals point
// out of each clump (a clump lights like one ball), the tuft picture is painted here (a dense round cluster of BIG leaves,
// lessons rule 74 — never a sparse sprig stretched over a house-sized card), and each tuft's size is in the tree's own
// units and grows with the instance's scale, so a 40 m giant has big leaves, not a few huge flat cards.
//
//   buildTufts(plan, { lod }) → BufferGeometry | null    (position = the tuft's centre; aCorner, aSize, aRot, aWind)
//   tuftAtlas() → { texture, cell(kind, i) → {u0,v0,u1,v1} }   painted once per page
//   tuftMaterials(atlas, { cheap, wind }) → { color, depth }   (the depth one casts tuft-shaped shadows)
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function rngOf(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the picture
// 4 × 2 cells: row 0 broadleaf tufts (4 looks), row 1 needle tufts (pine / spruce, 4 looks)
const COLS = 4, ROWS = 2, CELL = 256;
let atlasCache = null;
export function tuftAtlas() {
  if (atlasCache) return atlasCache;
  const cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = ROWS * CELL;
  const g = cv.getContext('2d');
  for (let i = 0; i < COLS; i++) { paintLeafTuft(g, i * CELL, 0, CELL, 101 + i * 17); paintNeedleTuft(g, i * CELL, CELL, CELL, 301 + i * 23); }
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const pad = 3 / (COLS * CELL), padV = 3 / (ROWS * CELL);
  const cell = (kind, i) => { const col = ((i % COLS) + COLS) % COLS, row = kind === 'needle' ? 1 : 0; return { u0: col / COLS + pad, u1: (col + 1) / COLS - pad, v0: 1 - (row + 1) / ROWS + padV, v1: 1 - row / ROWS - padV }; };
  atlasCache = { texture, cell, canvas: cv };
  return atlasCache;
}

/** One broadleaf tuft: ~30 big overlapping leaves in a round mound, dark ones behind, light ones in front and on top. */
function paintLeafTuft(g, x0, y0, S, seed) {
  const r = rngOf(seed), cx = x0 + S / 2, cy = y0 + S / 2, R = S * 0.36;
  const leaves = [];
  const n = 34;
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.92;
    const out = Math.atan2(y - cy, x - cx) + (r() - 0.5) * 0.9;
    leaves.push({ x, y, a: out, len: S * lerp(0.15, 0.21, r()), w: lerp(0.5, 0.62, r()), depth: d / R + (y - cy) / R * 0.4 + r() * 0.3 });
  }
  // back to front: the outer, lower leaves first (darker), the top-front ones last (lighter)
  leaves.sort((a, b) => b.depth - a.depth);
  leaves.forEach((L, i) => {
    const t = i / (leaves.length - 1);                       // 0 back … 1 front
    const lit = clamp(lerp(0.62, 1.08, t) - (L.y - cy) / R * 0.12, 0.5, 1.15);
    const hue = r();
    const base = [lerp(92, 118, hue) * lit, lerp(146, 166, hue) * lit, lerp(62, 74, hue) * lit];
    leaf(g, L.x, L.y, L.a, L.len, L.w, base);
  });
}
function leaf(g, x, y, a, len, w, rgb) {
  g.save(); g.translate(x, y); g.rotate(a);
  const hw = len * w * 0.5;
  g.beginPath();
  g.moveTo(-len * 0.45, 0);
  g.bezierCurveTo(-len * 0.2, -hw * 1.25, len * 0.3, -hw * 1.1, len * 0.55, 0);
  g.bezierCurveTo(len * 0.3, hw * 1.1, -len * 0.2, hw * 1.25, -len * 0.45, 0);
  g.closePath();
  const grad = g.createLinearGradient(0, -hw, 0, hw);
  grad.addColorStop(0, `rgb(${rgb.map(v => Math.round(clamp(v * 1.12, 0, 255))).join(',')})`);
  grad.addColorStop(1, `rgb(${rgb.map(v => Math.round(clamp(v * 0.82, 0, 255))).join(',')})`);
  g.fillStyle = grad; g.fill();
  g.lineWidth = Math.max(1, len * 0.025); g.strokeStyle = `rgba(${Math.round(rgb[0] * 0.45)},${Math.round(rgb[1] * 0.5)},${Math.round(rgb[2] * 0.4)},0.85)`; g.stroke();
  // the middle vein
  g.beginPath(); g.moveTo(-len * 0.38, 0); g.quadraticCurveTo(len * 0.05, -hw * 0.12, len * 0.46, 0);
  g.lineWidth = Math.max(1, len * 0.02); g.strokeStyle = `rgba(${Math.round(clamp(rgb[0] * 1.3, 0, 255))},${Math.round(clamp(rgb[1] * 1.25, 0, 255))},${Math.round(clamp(rgb[2] * 1.2, 0, 255))},0.55)`; g.stroke();
  g.restore();
}
/** One needle tuft: a spiky round burst — long needle sprays fanned out from the middle over a dark solid body, so a
 *  pine reads as needles (a jagged edge) and an oak as leaves (a scalloped one) even far away. */
function paintNeedleTuft(g, x0, y0, S, seed) {
  const r = rngOf(seed), cx = x0 + S / 2, cy = y0 + S / 2, R = S * 0.44;
  g.save(); g.lineCap = 'round';
  // the dark body
  g.beginPath(); g.ellipse(cx, cy, R * 0.6, R * 0.55, 0, 0, TAU); g.fillStyle = 'rgb(58,104,70)'; g.fill();
  // sprays: back ring dark, front ring light, each a fan of long needles pointing outward
  for (let layer = 0; layer < 3; layer++) {
    const n = [16, 13, 9][layer], lit = [0.92, 1.12, 1.34][layer], reach = [1, 0.85, 0.6][layer];
    for (let k = 0; k < n; k++) {
      const a = (k + r() * 0.6) / n * TAU, d = R * lerp(0.1, 0.3, r()) * (layer === 2 ? 0.5 : 1);
      const bx = cx + Math.cos(a) * d, by = cy + Math.sin(a) * d * 0.95;
      const hue = r(), col = [lerp(52, 70, hue) * lit, lerp(104, 124, hue) * lit, lerp(66, 80, hue) * lit];
      for (let j = 0; j < 11; j++) {
        const f = a + (j / 10 - 0.5) * 0.9, l = R * reach * lerp(0.55, 0.78, r());
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(f) * l, by + Math.sin(f) * l * 0.95);
        g.lineWidth = Math.max(1.5, S * lerp(0.008, 0.013, r()));
        g.strokeStyle = `rgb(${col.map(v => Math.round(clamp(v * lerp(0.88, 1.18, r()), 0, 255))).join(',')})`; g.stroke();
      }
    }
  }
  g.restore();
}

// ---------------------------------------------------------------- the geometry
/** Tufts per clump by detail level: near trees get more, but even the far set is a full, round crown. */
const PER_CLUMP = [26, 15, 7];

/**
 * A conifer's skirts as tuft clumps: a ring round each skirt's rim (drooping a little) and a puff on the top one, so a
 * pine or spruce reads as soft stacked tiers of needles rather than flat paper cones.
 */
export function tierClumps(plan, lod = 0) {
  const out = [], ring = [12, 9, 6][clamp(lod, 0, 2)];
  plan.tiers.forEach((tr, i) => {
    const m = Math.max(5, Math.round(ring * clamp(tr.R / 3, 0.6, 1.3))), inner = Math.max(3, Math.round(m / 2));
    for (let k = 0; k < m; k++) {
      const a = tr.a + (k + 0.5 * (i % 2)) / m * TAU;   // the rim, drooping a little
      out.push({ c: new THREE.Vector3(Math.cos(a) * tr.R * 0.8, tr.y + tr.H * 0.04, Math.sin(a) * tr.R * 0.8), r: tr.R * 0.28, ph: tr.ph, flat: 0.55 });
    }
    for (let k = 0; k < inner; k++) {
      const a = tr.a + (k + 0.25) / inner * TAU;         // the middle of the skirt, higher up (no see-through tiers)
      out.push({ c: new THREE.Vector3(Math.cos(a) * tr.R * 0.38, tr.y + tr.H * 0.32, Math.sin(a) * tr.R * 0.38), r: tr.R * 0.32, ph: tr.ph, flat: 0.6 });
    }
    if (i === plan.tiers.length - 1) {   // the crown's point: a puff, then a small one at the very tip so no bare trunk shows
      out.push({ c: new THREE.Vector3(0, tr.y + tr.H * 0.62, 0), r: tr.R * 0.42, ph: tr.ph });
      out.push({ c: new THREE.Vector3(0, tr.y + tr.H * 1.02, 0), r: tr.R * 0.26, ph: tr.ph, flat: 1.3 });
    }
  });
  return out;
}

/**
 * The tufts for every leaf clump in a story-tree plan. A tuft is one quad whose 4 corners share its centre; the shader
 * spreads them by aCorner × aSize (in the tree's own units) facing the camera.
 * `shade(p, clump)` colours (the canopy light: darker inside and underneath), `kind` 'leaf' | 'needle'.
 */
export function buildTufts(plan, { lod = 0, shade, kind = 'leaf', atlas, per = 1 } = {}) {
  if (!plan.clumps?.length) return null;
  const rng = rngOf(plan.seed * 131 + 7 || 7);
  const pos = [], nor = [], uv = [], col = [], wind = [], corner = [], size = [], rot = [], idx = [];
  const n = PER_CLUMP[clamp(lod, 0, 2)] * per;
  let maxSize = 0, top = 0, reach = 0;
  plan.clumps.forEach((cl, ci) => {
    const count = Math.max(per < 1 ? 4 : 6, Math.round(n * clamp(0.7 + cl.r / 6, 0.75, 1.25)));
    for (let k = 0; k < count; k++) {
      // a fibonacci sphere (even cover), squashed a little, the shell thick enough that no gap shows through
      const t = (k + 0.5) / count, y = 1 - 2 * t, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = k * 2.39996 + ci * 1.3;
      const shell = k % 5 === 0 ? lerp(0.15, 0.4, rng()) : lerp(0.55, 0.82, rng());
      const d = new THREE.Vector3(Math.cos(a) * rr, y * (cl.flat ?? 0.86), Math.sin(a) * rr);
      const p = cl.c.clone().addScaledVector(d, cl.r * shell);
      const nn = d.clone().add(new THREE.Vector3(0, 0.3, 0)).normalize();
      const s = cl.r * lerp(0.5, 0.66, rng()) * (cl.flat ? 1.15 : 1) * (shell < 0.5 ? 1.15 : 1);
      maxSize = Math.max(maxSize, s); top = Math.max(top, p.y + s * 0.8); reach = Math.max(reach, Math.hypot(p.x, p.z) + s * 0.8);
      const c = shade(p, cl);
      const cell = atlas.cell(kind, Math.floor(rng() * 4));
      const r0 = rng() * TAU, w = clamp(0.45 + 0.5 * (p.clone().sub(cl.c).length() / cl.r), 0.45, 0.95), ph = cl.ph ?? rng();
      const base = pos.length / 3;
      for (const [cx, cy, u, v] of [[-1, -1, cell.u0, cell.v0], [1, -1, cell.u1, cell.v0], [1, 1, cell.u1, cell.v1], [-1, 1, cell.u0, cell.v1]]) {
        pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(u, v); col.push(c[0], c[1], c[2]);
        wind.push(w, ph); corner.push(cx, cy); size.push(s); rot.push(r0);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 2));
  geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  geo.setAttribute('aRot', new THREE.Float32BufferAttribute(rot, 1));
  geo.setIndex(idx);
  // the corners reach past the centres: grow the bounds so a tree at the screen's edge is not culled early
  geo.computeBoundingSphere(); geo.boundingSphere.radius += maxSize * 1.5;
  geo.computeBoundingBox(); geo.boundingBox.expandByScalar(maxSize * 1.5);
  geo.userData.top = top; geo.userData.reach = reach;   // how tall / wide the drawn crown is (the tree's height includes it)
  return geo;
}

// ---------------------------------------------------------------- the shader
// project_vertex replaced: the tuft's centre goes through the instance + view as usual, then its corner is pushed out
// in view space (so it faces the camera), scaled by the instance's own scale.
const PROJECT = `
  vec4 mvPosition = vec4( transformed, 1.0 );
  float tuftScale = 1.0;
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    tuftScale = length( instanceMatrix[0].xyz );
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  float tuftC = cos( aRot ), tuftS = sin( aRot );
  vec2 tuftCorner = vec2( tuftC * aCorner.x - tuftS * aCorner.y, tuftS * aCorner.x + tuftC * aCorner.y );
  mvPosition.xy += tuftCorner * aSize * tuftScale;
  gl_Position = projectionMatrix * mvPosition;`;

// backlit leaves (environment round): looking toward the sun through a crown, the leaves glow with the sun's colour —
// strongest at the thin edge of a clump, never on the side the sun lights directly
const TRANSLUCENT = `
  #if NUM_DIR_LIGHTS > 0
  {
    float tBack = max(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0);
    outgoingLight += directionalLights[0].color * diffuseColor.rgb * pow(tBack, 6.0) * 0.42;
  }
  #endif
  #include <opaque_fragment>`;
// leaves right in front of the camera dissolve (owner 2026-11-26: low conifer skirts "block view of enemies"): a tuft
// closer than NEAR_FADE_M to the camera is thinned with a screen-door pattern, gone by a third of that — so a crown on
// a downhill slope or one the camera backs into never hides the hero or the fight. Shadows are untouched.
export const NEAR_FADE_M = 7;
const NEAR_FADE = `
  if (vTuftDepth < ${NEAR_FADE_M.toFixed(1)}) {
    float tuftK = clamp((vTuftDepth - ${(NEAR_FADE_M / 3).toFixed(2)}) / ${(NEAR_FADE_M * 2 / 3).toFixed(2)}, 0.0, 1.0);
    float tuftN = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (tuftN > tuftK) discard;
  }`;
function tuftShader(material, key) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, r) => {
    if (prev) prev(shader, r);
    const see = !material.isMeshDepthMaterial;   // the see-through fade is for the player's camera, never the sun's shadow pass
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCorner; attribute float aSize; attribute float aRot;' + (see ? '\nvarying float vTuftDepth;' : ''))
      .replace('#include <project_vertex>', PROJECT + (see ? '\n  vTuftDepth = -mvPosition.z;' : ''));
    if (see) shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTuftDepth;')
      .replace('#include <alphatest_fragment>', NEAR_FADE + '\n#include <alphatest_fragment>')
      .replace('#include <opaque_fragment>', TRANSLUCENT);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

/** The tufts' colour material and the depth material that makes their shadows. `wind(material, amount)` adds the sway. */
export function tuftMaterials(atlas, { cheap = false, wind = m => m } = {}) {
  const common = { map: atlas.texture, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true };
  const color = cheap
    ? new THREE.MeshLambertMaterial({ ...common, emissive: '#1a2610', emissiveMap: atlas.texture, emissiveIntensity: 0.45 })
    : new THREE.MeshStandardMaterial({ ...common, roughness: 0.9, emissive: '#1a2610', emissiveMap: atlas.texture, emissiveIntensity: 0.5 });
  wind(color, 0.45);
  tuftShader(color, cheap ? 'ow-tuft-lambert' : 'ow-tuft-std');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.texture, alphaTest: 0.42, side: THREE.DoubleSide });
  wind(depth, 0.45);
  tuftShader(depth, 'ow-tuft-depth');
  return { color, depth };
}
