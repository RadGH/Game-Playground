// Draws kit-props.js models with three.js, cheaply enough for a phone.
//
// Placed things (buildings, props, shrines, chests, quest objects): every part of every model in a 128 m tile goes into
// one InstancedMesh per unit shape (box, cyl, gable, … leaf, rock) — a whole village is ~12 draw calls, whatever is
// in it — plus one unlit InstancedMesh per shape for glowing parts (crystal, runes, lantern glass).
// Scatter (trees, rocks, bushes): bake() merges a model into ONE low-poly vertex-coloured geometry, which world.js
// instances per tile like before (one draw call per kind per tile).
// Fires flicker (two additive cones each, one InstancedMesh for the whole world), the mill wheel turns.
//
//   const kit = createKitDraw({ root, tileGroup, tileKey })
//   kit.place(model, x, y, z, yaw)      queue a model (kitModel() output) at a world spot
//   kit.build()                         make the meshes (call once, after every place)
//   kit.bake(model) -> BufferGeometry   for scatter instancing
//   kit.update(dt)                      fires + spinning parts
//   kit.stats -> { parts, meshes, fires }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { unitGeometry as propkitUnit } from '../../../../../proctown/js/propkit-three.js';

const hashN = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** Our own unit shapes (origin at the centre of the base, 1 m each way): a lumpy ball, a jagged rock, a pebble. */
function extraGeometry(kind, lite) {
  let g;
  if (kind === 'leaf') {
    g = new THREE.IcosahedronGeometry(0.5, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.88 + hashN(Math.round(p.getX(i) * 97) * 7 + Math.round(p.getY(i) * 89) * 13 + Math.round(p.getZ(i) * 83) * 17) * 0.24; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.translate(0, 0.5, 0);
  } else if (kind === 'rock' || kind === 'pebble') {
    g = new THREE.IcosahedronGeometry(0.5, kind === 'rock' ? 1 : 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 0.78 + hashN(Math.round(x * 61) * 3 + Math.round(y * 67) * 11 + Math.round(z * 71) * 29) * 0.34;
      p.setXYZ(i, x * k, Math.max(-0.42, y * k * (y > 0 ? 0.9 : 1)), z * k);   // a flatter base, a lumpy crown
    }
    g.translate(0, 0.42, 0);
    g.scale(1, 1 / 0.92, 1);
  }
  // the same vertex in two faces moved the same way (keyed on position), so the shape stays closed; facet it
  g = g.toNonIndexed(); g.computeVertexNormals();
  return g;
}
/** Fewer sides for baked scatter (thousands of trees): same unit shapes, about half the triangles. */
function liteGeometry(kind) {
  let g;
  switch (kind) {
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 7); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 8); g.translate(0, 0.5, 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 2, 1); break;
    default: return null;
  }
  return g;
}

export function createKitDraw({ root, tileGroup, tileKey }) {
  const FULL = new Map(), LITE = new Map();
  const geo = (kind, lite = false) => {
    const M = lite ? LITE : FULL;
    if (M.has(kind)) return M.get(kind);
    let g = (kind === 'leaf' || kind === 'rock' || kind === 'pebble') ? extraGeometry(kind, lite) : lite ? liteGeometry(kind) : null;
    if (!g) g = propkitUnit(THREE, kind);
    M.set(kind, g);
    return g;
  };
  const solidMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const buckets = new Map();     // `${tile}|${kind}|${glow}` -> [{ m, c }]
  const spinners = [];           // { pivot, axis, speed }
  const fires = [];              // { x, y, z, s }
  const chimneys = [];           // { x, y, z } chimney tops (smoke)
  const halos = [];              // { x, y, z, color }
  const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const partMatrix = (p, out = new THREE.Matrix4()) => { e.set(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ'); q.setFromEuler(e); return out.compose(v.set(p.x, p.y, p.z), q, s.set(p.w, p.h, p.d)); };
  const modelMatrix = (x, y, z, yaw) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw || 0), new THREE.Vector3(1, 1, 1));
  const stats = { parts: 0, meshes: 0, fires: 0 };
  let flames = null;

  function instanced(list, kind, glow) {
    const im = new THREE.InstancedMesh(geo(kind), glow ? glowMat : solidMat, list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, col.set(it.c)); });
    im.castShadow = !glow; im.receiveShadow = !glow;
    im.computeBoundingSphere();
    im.name = `kit ${kind}${glow ? ' glow' : ''}`;
    stats.meshes++;
    return im;
  }

  return {
    stats, chimneys,
    place(model, x, y, z, yaw = 0) {
      if (!model) return;
      const M = modelMatrix(x, y, z, yaw), tk = tileKey(x, z), pm = new THREE.Matrix4();
      for (const p of model.parts) {
        const glow = p.tag === 'glow' ? 1 : 0, key = `${tk}|${p.mesh || 'box'}|${glow}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({ m: new THREE.Matrix4().multiplyMatrices(M, partMatrix(p, pm)), c: p.colour });
        stats.parts++;
      }
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const world = p => ({ x: x + p.x * c + p.z * sn, y: y + p.y, z: z - p.x * sn + p.z * c });
      for (const f of model.fires || []) fires.push({ ...world(f), s: f.s || 1 });
      // chimney tops (the highest 'chimney' part of a model): where ambient.js lets smoke rise
      let top = null;
      for (const p of model.parts) if (p.tag === 'chimney' && (!top || p.y + p.h > top.y + top.h)) top = p;
      if (top) chimneys.push(world({ x: top.x, y: top.y + top.h, z: top.z }));
      for (const g of model.glows || []) halos.push({ ...world(g), color: g.color });
      for (const g of model.spin || []) {
        // pivot at the group's spot, turned with the model; the parts turn about the model's own x or z
        const pivot = new THREE.Group(), turn = new THREE.Group();
        const at = world(g);
        pivot.position.set(at.x, at.y, at.z); pivot.rotation.y = yaw + (g.yaw || 0); pivot.scale.setScalar(g.scale || 1);
        const by = new Map();
        for (const p of g.parts) { const k = p.mesh || 'box'; if (!by.has(k)) by.set(k, []); by.get(k).push({ m: partMatrix(p), c: p.colour }); }
        for (const [k, list] of by) turn.add(instanced(list, k, false));
        pivot.add(turn); pivot.name = 'kit spin';
        tileGroup(x, z).add(pivot);
        spinners.push({ turn, axis: g.axis === 'z' ? 'z' : 'x', speed: g.speed || 0.5 });
      }
    },
    build() {
      for (const [key, list] of buckets) {
        const [tk, kind, glow] = key.split('|');
        const [i, j] = tk.split(',').map(Number);
        const im = instanced(list, kind, glow === '1');
        tileGroup((i + 0.5) * 128, (j + 0.5) * 128).add(im);
      }
      buckets.clear();
      // fires: an outer orange and an inner yellow cone per fire, one InstancedMesh each for the world
      if (fires.length) {
        const flameGeo = new THREE.ConeGeometry(0.5, 1, 7); flameGeo.translate(0, 0.5, 0);
        const mk = colour => { const m = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), fires.length); m.frustumCulled = false; m.name = 'kit fire'; return m; };
        flames = [mk('#ff7a2a'), mk('#ffd25a')];
        for (const f of flames) root.add(f);
        stats.fires = fires.length;
      }
      // glows: a soft halo sprite (adds warmth at dusk; faint by day)
      if (halos.length) {
        const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
        const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(c);
        for (const h of halos) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: h.color || '#ffd28a', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
          sp.position.set(h.x, h.y, h.z); sp.scale.setScalar(0.9); sp.name = 'kit halo';
          tileGroup(h.x, h.z).add(sp);
        }
      }
    },
    bake(model) {
      const parts = [], m4 = new THREE.Matrix4(), c = new THREE.Color();
      model.parts.forEach((p, n) => {
        const g = geo(p.mesh || 'box', true);
        const ng = g.index ? g.toNonIndexed() : g.clone();
        ng.applyMatrix4(partMatrix(p, m4));
        c.set(p.colour);
        const cnt = ng.attributes.position.count, cols = new Float32Array(cnt * 3);
        for (let i = 0; i < cnt; i++) { const k = 1 + (hashN(i * 3 + n * 31) - 0.5) * 0.08; cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k; }
        ng.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'color'].includes(name)) ng.deleteAttribute(name);
        parts.push(ng);
      });
      const out = mergeGeometries(parts);
      for (const g of parts) g.dispose();
      out.computeBoundingSphere();
      return out;
    },
    update(dt, t) {
      for (const sp of spinners) sp.turn.rotation[sp.axis] += sp.speed * dt;
      if (flames) {
        const m = new THREE.Matrix4(), qq = new THREE.Quaternion();
        fires.forEach((f, i) => {
          const a = 1 + Math.sin(t * 11 + i * 1.7) * 0.12 + Math.sin(t * 17.3 + i) * 0.08;
          flames[0].setMatrixAt(i, m.compose(v.set(f.x, f.y, f.z), qq.setFromAxisAngle(s.set(0, 1, 0), t * 0.7 + i), s.set(0.62 * f.s, 0.9 * f.s * a, 0.62 * f.s)));
          flames[1].setMatrixAt(i, m.compose(v.set(f.x, f.y, f.z), qq, s.set(0.34 * f.s, 0.6 * f.s * (2 - a), 0.34 * f.s)));
        });
        for (const fl of flames) fl.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
