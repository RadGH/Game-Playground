// Preview kit — the small shared pieces a "look at this model" page needs, so each viewer does not
// grow its own copy. Added 2026-10-06 for the Armory (armory/); NEW and opt-in, no existing page uses it.
//
//   createScene (re-exported from scene.js)  the orbit viewer every avatar page already uses
//   createThumbnailer({ size })              ONE shared WebGL renderer + a queue + a cache of image URLs,
//                                            so three hundred thumbnails cost one context and never freeze the page
//   vertexKeys(character)                    a fingerprint of a Chibi 2 character's vertices
//   extractAdded(character, baseKeys)        what one piece of gear ADDED to a body: its own triangles as plain
//                                            geometry, counts, bounds in metres, bones and colours
//   holdOf(extract, character, bone)         where a held item sits in a hand: long axis, how far the palm is
//                                            from the handle, where along the item the fist closes
//   staticModel(extract)                     the extracted gear as an ordinary mesh (item alone, wireframe…)
//   frameBox(camera, box, { yaw, pitch })    aim a camera at a box from a direction
//
// WHY MEASURE BY DIFFERENCE. Chibi 2 gear is not a separate object: every builder adds skinned pieces into the
// body's two merged meshes (cloth, metal), which is why gear never costs a draw call. So "how many triangles is
// this sword" has no object to ask. The honest way to answer is to build the same body with and without the
// piece and keep what is new — it measures what the game really draws, and cannot go stale when a model changes.
import * as THREE from 'three';
export { createScene } from './scene.js';

const Q = 4000;                      // quarter-millimetre grid for comparing vertices
const CQ = 64;                       // colour steps
function keyOf(p, c, i) {
  let k = Math.round(p.getX(i) * Q) + ',' + Math.round(p.getY(i) * Q) + ',' + Math.round(p.getZ(i) * Q);
  if (c) k += '|' + Math.round(c.getX(i) * CQ) + ',' + Math.round(c.getY(i) * CQ) + ',' + Math.round(c.getZ(i) * CQ);
  return k;
}

/** The skinned meshes of a Chibi 2 character (one per material bucket: cloth, metal). */
export function skinnedMeshes(character) {
  const out = [];
  character.group.traverse(o => { if (o.isSkinnedMesh) out.push(o); });
  return out;
}

/** Every vertex of a character as a set of position+colour keys. Build it once per bare body. */
export function vertexKeys(character) {
  const set = new Set();
  for (const m of skinnedMeshes(character)) {
    const p = m.geometry.attributes.position, c = m.geometry.attributes.color;
    for (let i = 0; i < p.count; i++) set.add(keyOf(p, c, i));
  }
  return set;
}

/** Whole-character numbers, for "what does the body cost with this on". */
export function characterStats(character) {
  const meshes = skinnedMeshes(character);
  return {
    meshes: meshes.length,
    triangles: meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0),
    vertices: meshes.reduce((n, m) => n + m.geometry.attributes.position.count, 0),
    bones: character.skeleton?.bones.length ?? 0,
    height: character.metrics?.().height ?? 0,
  };
}

/**
 * What `character` has that the body behind `baseKeys` does not: the triangles whose three corners are all new.
 * Positions are the bind pose (arms hanging, hand space = world axes), in metres.
 */
export function extractAdded(character, baseKeys) {
  const bones = character.skeleton?.bones || [];
  const parts = [], boneCount = new Map(), colours = new Map(), box = new THREE.Box3();
  const allPos = [], allBone = [];
  let triangles = 0, vertices = 0;
  const byBucket = {};
  for (const mesh of skinnedMeshes(character)) {
    const g = mesh.geometry, p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const idx = g.index ? g.index.array : null, count = idx ? idx.length : p.count;
    const fresh = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) fresh[i] = baseKeys.has(keyOf(p, c, i)) ? 0 : 1;
    const remap = new Int32Array(p.count).fill(-1), pos = [], nrm = [], col = [], index = [];
    const take = i => {
      if (remap[i] >= 0) return remap[i];
      const k = pos.length / 3; remap[i] = k;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      pos.push(x, y, z); box.expandByPoint(_v.set(x, y, z));
      if (n) nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      if (c) { col.push(c.getX(i), c.getY(i), c.getZ(i)); const hex = swatch(c.getX(i), c.getY(i), c.getZ(i)); colours.set(hex, (colours.get(hex) || 0) + 1); }
      // the bone that carries this vertex (the heavier of its two weights)
      const b = si ? (sw && sw.getY(i) > sw.getX(i) ? si.getY(i) : si.getX(i)) : 0;
      const name = bones[b]?.name || 'root'; boneCount.set(name, (boneCount.get(name) || 0) + 1);
      allPos.push(x, y, z); allBone.push(b);
      return k;
    };
    for (let t = 0; t < count; t += 3) {
      const a = idx ? idx[t] : t, b = idx ? idx[t + 1] : t + 1, d = idx ? idx[t + 2] : t + 2;
      if (!(fresh[a] && fresh[b] && fresh[d])) continue;
      index.push(take(a), take(b), take(d));
    }
    if (!index.length) continue;
    const bucket = mesh.name.replace(/^chibi2-/, '') || 'cloth';
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nrm.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); else geo.computeVertexNormals();
    if (col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(index);
    parts.push({ bucket, geometry: geo, metal: bucket === 'metal' });
    byBucket[bucket] = index.length / 3;
    triangles += index.length / 3; vertices += pos.length / 3;
  }
  const size = triangles ? box.getSize(new THREE.Vector3()) : new THREE.Vector3();
  return {
    parts, triangles, vertices, byBucket, box, size,
    bones: [...boneCount.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, share: n / Math.max(1, vertices) })),
    colours: [...colours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex]) => hex),
    positions: new Float32Array(allPos), boneOf: new Uint16Array(allBone),
    dispose() { for (const p of parts) p.geometry.dispose(); },
  };
}
const _v = new THREE.Vector3(), _c = new THREE.Color();
/** A vertex colour (linear) as a coarse sRGB hex, so the cloth's top-to-bottom tint does not read as 40 colours. */
function swatch(r, g, b) {
  _c.setRGB(r, g, b);
  const hex = _c.getHex(THREE.SRGBColorSpace), step = v => Math.min(255, Math.round(v / 24) * 24);
  return '#' + [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => step(v).toString(16).padStart(2, '0')).join('');
}

/**
 * How an item sits in a hand. `bone` is the bone that carries it (`gripR`, `gripL`, `handL`, `elbowL`…); the
 * answer is in THAT bone's own space, where the origin is the palm for a grip bone.
 *
 *   axis        'x' | 'y' | 'z' — the item's long axis in the bone's space ('y' is along the fist, which is right
 *               for anything with a handle)
 *   length      metres along that axis
 *   palmAlong   0..1 — where the palm sits along the item, 0 = the end nearer the palm (the butt)
 *   offAxis     metres from the palm to the item where the fist closes on it (0 = the handle runs through the fist)
 *   palmOnItem  false when no part of the item is within 6 cm of the palm along its length (it is not in the fist)
 *   head, butt  the far and near ends along the axis, signed (a blade's head is at -y, past the fingers)
 */
export function holdOf(extract, character, bone) {
  const bones = character.skeleton.bones, b = bones.findIndex(x => x.name === bone);
  if (b < 0) return null;
  const inv = character.skeleton.boneInverses[b], min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let n = 0;
  for (let i = 0; i < extract.boneOf.length; i++) {
    if (extract.boneOf[i] !== b) continue;
    _v.fromArray(extract.positions, i * 3).applyMatrix4(inv); min.min(_v); max.max(_v); n++;
  }
  if (!n) return null;
  const size = max.clone().sub(min), centre = min.clone().add(max).multiplyScalar(0.5);
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const lo = min[axis], hi = max[axis], length = hi - lo;
  // the butt is the end nearer the palm (the origin); the head is the far end
  const butt = Math.abs(lo) < Math.abs(hi) ? lo : hi, head = butt === lo ? hi : lo;
  const others = ['x', 'y', 'z'].filter(k => k !== axis);
  // the HANDLE LINE is where the item is at the fist, not the middle of its bounding box (an axe head or a
  // crossguard pulls the box sideways): average the vertices within 6 cm of the palm along the long axis
  let cu = 0, cv = 0, near = 0;
  for (let i = 0; i < extract.boneOf.length; i++) {
    if (extract.boneOf[i] !== b) continue;
    _v.fromArray(extract.positions, i * 3).applyMatrix4(inv);
    if (Math.abs(_v[axis]) > 0.06) continue;
    cu += _v[others[0]]; cv += _v[others[1]]; near++;
  }
  return {
    bone, axis, length, head, butt, vertices: n, size,
    palmAlong: length > 1e-6 ? THREE.MathUtils.clamp((0 - butt) / (head - butt), -1, 2) : 0,
    palmOnItem: near > 0,
    offAxis: near ? Math.hypot(cu / near, cv / near) : Math.hypot(centre[others[0]], centre[others[1]]),
    axisVector: new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).multiplyScalar(Math.sign(head - butt) || 1),
  };
}

/** The extracted gear as an ordinary (unskinned) group in the bind pose. */
export function staticModel(extract, { wireframe = false } = {}) {
  const group = new THREE.Group();
  for (const part of extract.parts) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: part.metal ? 0.38 : 0.82, metalness: part.metal ? 0.65 : 0, side: THREE.DoubleSide, wireframe });
    const mesh = new THREE.Mesh(part.geometry, material); mesh.name = 'gear-' + part.bucket;
    group.add(mesh);
  }
  group.userData.dispose = () => group.traverse(o => o.material?.dispose?.());
  return group;
}

/** Aim `camera` at a box from a direction, far enough back that the whole box fits. */
export function frameBox(camera, box, { yaw = 0.35, pitch = 0.12, pad = 1.15 } = {}) {
  const centre = box.getCenter(new THREE.Vector3()), radius = Math.max(0.02, box.getSize(new THREE.Vector3()).length() * 0.5 * pad);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.position.copy(centre).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - radius * 4); camera.far = dist + radius * 6;
  camera.lookAt(centre); camera.updateProjectionMatrix();
  return { centre, radius, dist };
}

/**
 * Turn a loose item so it reads in a square picture: its thinnest side toward the camera, and a weapon's long
 * axis on the diagonal with the business end up and to the right (the head is at -y in hand space).
 */
export function poseForPicture(group, extract, { diagonal = true } = {}) {
  const s = extract.size, thin = s.x <= s.y && s.x <= s.z ? 'x' : s.y <= s.z ? 'y' : 'z';
  const q = new THREE.Quaternion();
  if (thin === 'x') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);          // a shield's face looks along -x
  else if (thin === 'y') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const after = new THREE.Vector3(thin === 'x' ? s.z : s.x, thin === 'y' ? s.z : s.y, 0);
  if (diagonal && Math.max(after.x, after.y) > Math.min(after.x, after.y) * 1.6) {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), after.y >= after.x ? Math.PI * 0.75 : Math.PI * 0.25));
  }
  group.quaternion.copy(q);
  return group;
}

/**
 * One renderer for every thumbnail on a page.
 *
 *   const thumbs = createThumbnailer({ size: 192 });
 *   const url = await thumbs.request(key, async stage => {      // stage: { scene, camera, THREE }
 *     stage.scene.add(thing); frameBox(stage.camera, box);
 *     return () => { stage.scene.remove(thing); };              // called after the picture is taken
 *   });
 *
 * Jobs run one at a time with the frame handed back between them. A finished picture is kept as an object URL
 * under its key, so asking again is free. `cancel(key)` drops a job that has not started (a card that scrolled
 * away); `front(key)` moves one to the head of the line.
 */
export function createThumbnailer({ size = 192, gapMs = 0 } = {}) {
  let R = null, busy = false, disposed = false, slowest = 0, done = 0;
  const cache = new Map(), waiting = new Map(), order = [];
  function stage() {
    if (R) return R;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-2.5, 4, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.3); rim.position.set(3, 2.5, -4); scene.add(rim);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
    R = { renderer, scene, camera, canvas, THREE };
    return R;
  }
  const breathe = () => new Promise(r => setTimeout(() => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : r()), gapMs));
  async function pump() {
    if (busy || disposed) return;
    busy = true;
    try {
      while (order.length && !disposed) {
        const key = order.shift(), job = waiting.get(key);
        if (!job) continue;
        const t0 = performance.now();
        let url = null, error = null;
        try {
          const st = stage();
          const cleanup = await job.make(st);
          st.renderer.clear(); st.renderer.render(st.scene, st.camera);
          const copy = document.createElement('canvas'); copy.width = copy.height = size;
          copy.getContext('2d').drawImage(st.canvas, 0, 0);
          try { cleanup?.(); } catch (e) { console.warn('[thumbs] cleanup', e); }
          const blob = await new Promise(res => copy.toBlob(res, 'image/png'));
          url = blob ? URL.createObjectURL(blob) : null;
        } catch (e) { error = e; }
        waiting.delete(key);
        slowest = Math.max(slowest, performance.now() - t0); done++;
        if (url) { cache.set(key, url); job.resolve(url); } else job.reject(error || new Error('no picture'));
        await breathe();
      }
    } finally { busy = false; }
  }
  return {
    size,
    get: key => cache.get(key) || null,
    has: key => cache.has(key),
    request(key, make) {
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      const w = waiting.get(key);
      if (w) return w.promise;
      let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
      promise.catch(() => {});
      waiting.set(key, { make, resolve, reject, promise }); order.push(key); pump();
      return promise;
    },
    cancel(key) { const i = order.indexOf(key); if (i < 0) return false; order.splice(i, 1); const w = waiting.get(key); waiting.delete(key); w?.reject(new Error('cancelled')); return true; },
    front(key) { const i = order.indexOf(key); if (i > 0) { order.splice(i, 1); order.unshift(key); } },
    forget(key) { const u = cache.get(key); if (u) URL.revokeObjectURL(u); cache.delete(key); },
    stats: () => ({ cached: cache.size, waiting: order.length, done, slowest: Math.round(slowest), contexts: R ? 1 : 0 }),
    dispose() { disposed = true; for (const u of cache.values()) URL.revokeObjectURL(u); cache.clear(); order.length = 0; R?.renderer.dispose(); R = null; },
  };
}
