// The phone fix (PLAN §2 "Vehicles"): a Roverlands model is 11-30 meshes, so traffic never draws one. At load each type
// is built once for real, flattened into a single vertex-coloured geometry with its wheels taken off, and turned into:
//   near  every triangle of the body                   (drawn within ~45 m)
//   far   a hand-sized shell lofted from that body      (~100 triangles; drawn beyond that)
//   wheels a list of where the tyres go                 (one shared instanced wheel covers every car on the map)
// Colour: `aPaint` says which vertices take the car's own colour, so a blue sedan can be a red one and its bumpers stay
// black. `paintMaterial` is that one shared material; `iFade` lets a car fade through something (a stipple, no blending).
import { buildModel } from '../../../roverlands/js/client/models/index.js';

export function paintMaterial(THREE, { fade = true, extraVertex = '', uniforms = null } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (s) => {
    if (uniforms) Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aPaint;${fade ? '\nattribute float iFade;\nvarying float vFade;' : ''}${uniforms?.uTime ? '\nuniform float uTime;\nattribute float aLeg;' : ''}`)
      .replace('#include <color_vertex>', `vColor = vec4(color * mix(vec3(1.0), instanceColor.rgb, aPaint), 1.0);${fade ? '\nvFade = iFade;' : ''}`);
    if (extraVertex) s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', extraVertex);
    if (fade) s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFade < 0.75 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;');
  };
  m.customProgramCacheKey = () => `paint:${fade ? 1 : 0}:${uniforms ? 1 : 0}:${extraVertex.length}`;
  return m;
}

/** The model's commonest colour, as what 'auto' paints. */
function dominant(col) {
  const seen = new Map();
  for (let i = 0; i < col.length; i += 9) {
    const k = `${Math.round(col[i] * 40)},${Math.round(col[i + 1] * 40)},${Math.round(col[i + 2] * 40)}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  let best = null, n = 0;
  for (const [k, v] of seen) { const [r, g, b] = k.split(',').map(x => x / 40); if (v > n && r + g + b > 0.12 && Math.max(r, g, b) - Math.min(r, g, b) > 0.03) { n = v; best = [r, g, b]; } }
  return best;
}

export async function bakeVehicle(THREE, def, extra) {
  const model = await buildModel(THREE, def, {});
  const skip = new Set(); for (const w of model.wheels) w.group.traverse(o => skip.add(o));
  model.group.updateMatrixWorld(true);
  const P = [], N = [], C = [], v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  model.group.traverse(o => {
    if (!o.isMesh || skip.has(o) || o.userData.detail || o.isInstancedMesh) return;
    const g0 = o.geometry, g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, nr = g.attributes.normal, cl = g.attributes.color;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material, base = mat.color, glass = mat.transparent;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z);
      if (nr) { n.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize(); N.push(n.x, n.y, n.z); } else N.push(0, 1, 0);
      if (glass) C.push(0.09, 0.14, 0.19);
      else if (cl) C.push(cl.getX(i) * base.r, cl.getY(i) * base.g, cl.getZ(i) * base.b);
      else C.push(base.r, base.g, base.b);
    }
  });
  const count = P.length / 3, paint = new Float32Array(count), col = new Float32Array(C);
  const paints = extra.paint === 'auto' ? [dominant(col)].filter(Boolean) : (extra.paint || []).map(h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });
  if (paints.length) {
    const main = paints[0], lum = c => c[0] + c[1] + c[2], mainL = lum(main);
    for (let i = 0; i < count; i++) {
      const k = i * 3, hit = paints.find(c => Math.abs(col[k] - c[0]) + Math.abs(col[k + 1] - c[1]) + Math.abs(col[k + 2] - c[2]) < 0.05);
      if (!hit) continue;
      const shade = lum(hit) / mainL;
      paint[i] = 1; col[k] = col[k + 1] = col[k + 2] = shade;
    }
  }
  const near = new THREE.BufferGeometry();
  near.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); near.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  near.setAttribute('color', new THREE.BufferAttribute(col, 3)); near.setAttribute('aPaint', new THREE.BufferAttribute(paint, 1));
  const box = new THREE.Box3().setFromBufferAttribute(near.attributes.position);
  const w0 = def.wheels[0];
  const info = {
    id: def.id, near, far: shell(THREE, P, col, paint, box),
    len: box.max.z - box.min.z, width: box.max.x - box.min.x, height: box.max.y - box.min.y, centerZ: (box.max.z + box.min.z) / 2,
    lift: w0.r - (w0.p[1] + 0.05),                // body origin above the ground at rest
    wheels: def.wheels.map(w => ({ x: w.p[0], y: w.p[1] + 0.05, z: w.p[2], r: w.r, w: w.w, steer: !!w.steer })),
    painted: paints.length > 0, tris: count / 3,
  };
  for (const c of model.group.children) c.traverse?.(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  return info;
}

/** A shell lofted over the body: slices along its length, each a six-cornered ring read off the body's own vertices. */
function shell(THREE, P, col, paint, box) {
  const SL = 9, n = P.length / 3, z0 = box.min.z, zs = (box.max.z - z0) / (SL - 1), rings = [];
  for (let s = 0; s < SL; s++) {
    const zc = z0 + s * zs; let lo = 1e9, hi = -1e9;
    for (let i = 0; i < n; i++) if (Math.abs(P[i * 3 + 2] - zc) <= zs * 0.6) { const y = P[i * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
    if (lo > hi) { lo = box.min.y; hi = box.min.y + 0.1; }
    const belt = lo + (hi - lo) * 0.45; let wl = 0.02, wt = 0.02;
    for (let i = 0; i < n; i++) if (Math.abs(P[i * 3 + 2] - zc) <= zs * 0.6) { const x = Math.abs(P[i * 3]), y = P[i * 3 + 1]; if (y <= belt) wl = Math.max(wl, x); else wt = Math.max(wt, x); }
    wt = Math.min(wt, wl * 1.05);
    rings.push([[wl, lo, zc], [wl, belt, zc], [wt * 0.9, hi, zc], [-wt * 0.9, hi, zc], [-wl, belt, zc], [-wl, lo, zc]]);
  }
  const nearest = q => { let b = 0, d = 1e18; for (let i = 0; i < n; i += 3) { const dx = P[i * 3] - q[0], dy = P[i * 3 + 1] - q[1], dz = P[i * 3 + 2] - q[2], e = dx * dx + dy * dy + dz * dz; if (e < d) { d = e; b = i; } } return b; };
  const pos = [], nor = [], c2 = [], pa = [];
  const push = (q, nrm) => { const k = nearest(q); pos.push(...q); nor.push(...nrm); c2.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); pa.push(paint[k]); };
  const face = (a, b, c, d) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...nm) || 1; nm = nm.map(x => x / l);
    for (const q of [a, b, c, a, c, d]) push(q, nm);
  };
  for (let s = 0; s + 1 < SL; s++) for (let k = 0; k < 6; k++) { const A = rings[s], B = rings[s + 1], k2 = (k + 1) % 6; face(A[k], A[k2], B[k2], B[k]); }
  const capFace = (R, flip) => { const quad = [[R[0], R[1], R[4], R[5]], [R[1], R[2], R[3], R[4]]]; for (const [a, b, c, d] of quad) if (flip) face(d, c, b, a); else face(a, b, c, d); };
  capFace(rings[0], true); capFace(rings[SL - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c2, 3)); g.setAttribute('aPaint', new THREE.Float32BufferAttribute(pa, 1));
  return g;
}

/** One wheel for every car: 1 m across, 1 m wide, turned about x; each instance is scaled to its tyre. */
export function wheelGeometry(THREE) {
  const tyre = new THREE.CylinderGeometry(1, 1, 1, 14, 1); tyre.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.62, 0.62, 1.04, 8, 1); hub.rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(1.06, 0.16, 1.1);
  const pos = [], nor = [], col = [];
  for (const [g0, c] of [[tyre, [0.03, 0.03, 0.035]], [hub, [0.45, 0.47, 0.5]], [spoke, [0.2, 0.2, 0.22]]]) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(...c); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
