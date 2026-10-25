// Parts every vehicle model is built from. Vehicle frame: +z forward, +y up, +x = LEFT, origin = the physics body's
// centre. Static parts are collected per colour and merged into ONE mesh per material at the end (`finish`), so a
// whole vehicle body is a handful of draw calls; moving parts (wheels, bars, turret, forks) stay separate groups.
//
//   const k = createKit(THREE, { enhance });
//   k.box(colour, [w, h, d], [x, y, z], { rot: [rx, ry, rz], bevel })   // into the merged body
//   k.tube(colour, [[x,y,z], [x,y,z], ...], radius)                     // a bent bar (roll cage, frame)
//   k.cyl(colour, r, len, [x,y,z], { axis: 'x'|'y'|'z', seg })
//   const tyre = k.tyre({ r, w, knobs, style: 'block'|'knobby'|'road', rim })   // a Group spun about x
//   const shock = k.shock(colour, from, to)                              // a strut you re-aim each frame (shock.set(a, b))
//   const body = k.finish(group)                                         // merges everything into `group`
//
// Every geometry carries position/normal (+ uv) only; colour comes from the material, so materials are shared across
// every vehicle of the game (MAT cache) and never re-made.

import { mergeGeometries } from '../../../../../vendor/three/addons/utils/BufferGeometryUtils.js';

const MAT = new Map();
let STRUT = null;

export function createKit(THREE, { enhance = m => m } = {}) {
  const parts = new Map();      // colour key -> geometries to merge
  const mat = (key) => {
    if (MAT.has(key)) return MAT.get(key);
    const [col, rough = 0.75, metal = 0, extra = {}] = PALETTE[key] || [key, 0.7, 0];
    const m = enhance(new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: metal, ...extra }));
    MAT.set(key, m);
    return m;
  };
  /** Two shared vertex-coloured materials: matte and shiny. Lamps and glass keep their own (they glow / see through). */
  const vmat = (shiny) => {
    const key = shiny ? '__vshiny' : '__vmatte';
    if (!MAT.has(key)) MAT.set(key, enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: shiny ? 0.38 : 0.78, metalness: shiny ? 0.65 : 0.05 })));
    return MAT.get(key);
  };
  const special = key => { const e = (PALETTE[key] || [])[3]; return !!e; };
  const shinyOf = key => ((PALETTE[key] || [])[2] || 0) > 0.5;
  function paint(g, key) {
    const c = new THREE.Color((PALETTE[key] || [key])[0]);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  /** Merge colour-keyed geometry lists into as few meshes as possible: one matte, one shiny, one per special. */
  function mergeInto(target, byCol) {
    const buckets = new Map();
    for (const [col, gs] of byCol) {
      const b = special(col) ? col : shinyOf(col) ? '__shiny' : '__matte';
      if (!buckets.has(b)) buckets.set(b, []);
      for (const g of gs) buckets.get(b).push(special(col) ? g : paint(g, col));
    }
    const out = [];
    for (const [b, gs] of buckets) {
      const m = new THREE.Mesh(mergeGeometries(gs), b === '__shiny' ? vmat(true) : b === '__matte' ? vmat(false) : mat(b));
      m.castShadow = true; m.receiveShadow = true; m.name = 'part:' + b;
      target.add(m); out.push(m);
    }
    return out;
  }
  const push = (key, g) => { if (!parts.has(key)) parts.set(key, []); parts.get(key).push(clean(g)); return g; };
  function clean(g) {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const n of Object.keys(ng.attributes)) if (n !== 'position' && n !== 'normal') ng.deleteAttribute(n);
    return ng;
  }
  function place(g, p = [0, 0, 0], rot = null) {
    if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    g.translate(p[0], p[1], p[2]);
    return g;
  }
  /** A box with chamfered edges (the toy-like look): a rounded-rect extrusion. */
  function bevelBox(w, h, d, b) {
    if (!b) return new THREE.BoxGeometry(w, h, d);
    b = Math.min(b, w / 3, h / 3, d / 3);
    const s = new THREE.Shape();
    const x = w / 2 - b, y = h / 2 - b;
    s.moveTo(-x, -h / 2); s.lineTo(x, -h / 2); s.lineTo(w / 2, -y); s.lineTo(w / 2, y); s.lineTo(x, h / 2); s.lineTo(-x, h / 2); s.lineTo(-w / 2, y); s.lineTo(-w / 2, -y); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: 0, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  }
  const kit = {
    THREE, mat,
    box(col, [w, h, d], p, { rot = null, bevel = 0.04 } = {}) { return push(col, place(bevelBox(w, h, d, bevel), p, rot)); },
    /** A slab whose top face slopes: front height h1, back height h0 (z = depth axis). */
    wedge(col, [w, h0, h1, d], p, { rot = null } = {}) {
      const g = new THREE.BoxGeometry(w, 1, d);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const top = pos.getY(i) > 0, front = pos.getZ(i) > 0;
        pos.setY(i, top ? (front ? h1 : h0) : 0);
      }
      g.computeVertexNormals();
      return push(col, place(g, p, rot));
    },
    cyl(col, r, len, p, { axis = 'y', seg = 10, r2 = r, rot = null } = {}) {
      const g = new THREE.CylinderGeometry(r2, r, len, seg);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      return push(col, place(g, p, rot));
    },
    sphere(col, r, p, { seg = 8, sy = 1 } = {}) { const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); g.scale(1, sy, 1); return push(col, place(g, p)); },
    tube(col, pts, r = 0.035, { seg = 6, closed = false } = {}) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
        const l = a.distanceTo(b);
        const g = new THREE.CylinderGeometry(r, r, l, seg, 1, true);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        push(col, g);
        if (i > 0) push(col, place(new THREE.SphereGeometry(r, seg, 3), pts[i]));     // a joint so bends look welded
      }
      if (closed) kit.tube(col, [pts[pts.length - 1], pts[0]], r, { seg });
    },
    /** A tyre + rim, spinning about its own x axis. Returns { group, spin } where `spin` is the node to rotate. */
    tyre({ r, w, style = 'block', rimCol = 'rim', tyreCol = 'rubber', knobs = 18, rim = 0.55, spokes = 0 }) {
      const group = new THREE.Group(), spin = new THREE.Group();
      group.add(spin);
      const geo = new Map();
      const add = (col, g) => { if (!geo.has(col)) geo.set(col, []); geo.get(col).push(clean(g)); };
      const core = style === 'knobby' ? r * 0.86 : r * 0.9;
      const c = new THREE.CylinderGeometry(core, core, w * 0.94, Math.max(14, knobs), 1); c.rotateZ(Math.PI / 2); add(tyreCol, c);
      // side walls bulge a little
      const sw = new THREE.TorusGeometry(core * 0.93, w * 0.16, 4, Math.max(14, knobs)); sw.rotateY(Math.PI / 2);
      add(tyreCol, sw.clone().translate(w * 0.36, 0, 0)); add(tyreCol, sw.translate(-w * 0.36, 0, 0));
      // tread: chunky blocks in two staggered rows (or many small knobs on a dirtbike)
      const n = knobs;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rows = style === 'road' ? 0 : 2;
        for (let row = 0; row < rows; row++) {
          const off = (row === 0 ? -1 : 1) * w * 0.22, aa = a + (row ? Math.PI / n : 0);
          const bw = style === 'knobby' ? w * 0.3 : w * 0.42, bh = r - core + 0.012, bd = (2 * Math.PI * r / n) * (style === 'knobby' ? 0.5 : 0.62);
          const b = new THREE.BoxGeometry(bw, bh, bd);
          b.translate(off, core + bh / 2 - 0.006, 0);
          b.rotateX(aa);
          add(tyreCol, b);
        }
      }
      if (style === 'road') { const t = new THREE.CylinderGeometry(r, r, w * 0.8, 20, 1, true); t.rotateZ(Math.PI / 2); add(tyreCol, t); }
      // rim: a dish with bolts, or spokes
      const rr = r * rim;
      if (spokes) {
        const hoop = new THREE.TorusGeometry(core * 0.95, 0.018, 4, 18); hoop.rotateY(Math.PI / 2); add(rimCol, hoop);
        const hub = new THREE.CylinderGeometry(0.05, 0.05, w * 0.9, 8); hub.rotateZ(Math.PI / 2); add('metal', hub);
        for (let i = 0; i < spokes; i++) {
          const s = new THREE.CylinderGeometry(0.006, 0.006, core * 0.95, 3); s.translate(0, core * 0.47, 0); s.rotateX((i / spokes) * Math.PI * 2);
          s.translate((i % 2 ? 1 : -1) * w * 0.15, 0, 0); add('metal', s);
        }
      } else {
        for (const sx of [1, -1]) {
          const d = new THREE.CylinderGeometry(rr, rr * 0.92, 0.04, 12); d.rotateZ(Math.PI / 2); d.translate(sx * w * 0.47, 0, 0); add(rimCol, d);
          const h = new THREE.CylinderGeometry(rr * 0.35, rr * 0.35, 0.05, 6); h.rotateZ(Math.PI / 2); h.translate(sx * w * 0.5, 0, 0); add('metal', h);
        }
      }
      mergeInto(spin, geo);
      return { group, spin };
    },
    /** A coil-over shock from a to b (in its parent's frame). `set(a, b)` re-aims it. */
    shock(a, b, { r = 0.05, col = 'shock' } = {}) {
      // one mesh (a coil-coloured strut) so a vehicle's eight struts are eight draws, not sixteen
      const g = new THREE.Mesh(STRUT || (STRUT = new THREE.CylinderGeometry(1, 1, 1, 6)), mat(col));
      g.userData.detail = true;
      const up = new THREE.Vector3(0, 1, 0), va = new THREE.Vector3(), vb = new THREE.Vector3(), d = new THREE.Vector3();
      g.set = (A, B) => {
        va.set(...A); vb.set(...B);
        const l = va.distanceTo(vb) || 0.01;
        g.position.copy(va).add(vb).multiplyScalar(0.5);
        g.quaternion.setFromUnitVectors(up, d.copy(vb).sub(va).normalize());
        g.scale.set(r, l, r);
      };
      g.set(a, b);
      g.castShadow = true;
      return g;
    },
    /** Merge every static part into `group` (one mesh per colour). */
    finish(group) {
      mergeInto(group, parts);
      parts.clear();
      return group;
    },
  };
  return kit;
}

// colour key -> [hex, roughness, metalness, extra]
export const PALETTE = {
  olive: ['#55613a', 0.7, 0.05], oliveDark: ['#3f4a2c', 0.72, 0.05], olivePale: ['#6c7a4a', 0.7, 0.05],
  orange: ['#ef6a12', 0.45, 0.05], orangeDark: ['#b84d0b', 0.5, 0.05],
  black: ['#1e1f22', 0.6, 0.1], trim: ['#2a2c2f', 0.55, 0.2], seat: ['#232427', 0.85, 0],
  rubber: ['#1b1b1d', 0.92, 0], rim: ['#3a3d42', 0.45, 0.6], metal: ['#9aa0a8', 0.35, 0.85], steel: ['#5d636b', 0.4, 0.8],
  gold: ['#c49a3c', 0.3, 0.9], shock: ['#d0731c', 0.4, 0.4], chrome: ['#cfd4da', 0.15, 1],
  glass: ['#a8d4ff', 0.05, 0.1, { transparent: true, opacity: 0.35 }],
  lamp: ['#fff6d8', 0.2, 0, { emissive: '#fff2c0', emissiveIntensity: 0.6 }],
  tail: ['#d0201a', 0.3, 0, { emissive: '#a01010', emissiveIntensity: 0.5 }],
  amber: ['#ffae1a', 0.3, 0, { emissive: '#c07010', emissiveIntensity: 0.4 }],
  engine: ['#7b8088', 0.4, 0.7], darkMetal: ['#34373c', 0.45, 0.7],
  sand: ['#c2a878', 0.75, 0.05], sandDark: ['#9c8458', 0.75, 0.05], track: ['#4a3a2c', 0.9, 0.1], gunDark: ['#4b3a2e', 0.6, 0.3],
  hullWhite: ['#e8ecf0', 0.5, 0.1], navy: ['#28365c', 0.55, 0.2],
  crateWood: ['#b0844e', 0.85, 0], crateDark: ['#7a5630', 0.85, 0], canvas: ['#8a8a5a', 0.95, 0], barrelRed: ['#a83a2a', 0.6, 0.2],
  ballWhite: ['#f2f2ee', 0.45, 0], ballBlue: ['#2f6fd0', 0.45, 0], jetSilver: ['#b9c0c8', 0.3, 0.8],
  flame: ['#ffb040', 0.2, 0, { emissive: '#ff8a20', emissiveIntensity: 2.2, transparent: true, opacity: 0.85 }],
  glow: ['#5fe0ff', 0.3, 0, { emissive: '#3fd0ff', emissiveIntensity: 1.6 }], glowSoft: ['#7fe8ff', 0.3, 0, { emissive: '#3fd0ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.55 }],
  // batch 2 (helicopter, plane, rocket car, forklift, trailer, sedan, quad, buggy, bikes, army truck)
  yellow: ['#f2c21b', 0.5, 0.05], yellowDark: ['#c99a10', 0.55, 0.05],
  blue: ['#1f5fd8', 0.4, 0.1], blueDark: ['#163f96', 0.45, 0.1],
  red: ['#c8372d', 0.45, 0.05], redDark: ['#8e2620', 0.5, 0.05], cream: ['#efe6d2', 0.6, 0.02],
  teal: ['#2f8f8a', 0.5, 0.05], tealDark: ['#216662', 0.55, 0.05],
  wood: ['#a8784a', 0.85, 0], woodDark: ['#6e4c2e', 0.9, 0], deck: ['#3a3330', 0.9, 0],
  tarp: ['#6b7550', 0.95, 0], tarpDark: ['#555e3e', 0.95, 0],
  lime: ['#8cc63f', 0.5, 0.05], limeDark: ['#5f8c27', 0.55, 0.05],
  flameCore: ['#fff2b0', 0.4, 0, { emissive: '#ffe080', emissiveIntensity: 2.6 }],
  blur: ['#2a2c2f', 0.6, 0.1, { transparent: true, opacity: 0.28, depthWrite: false }],
};

/**
 * Far away, a vehicle's struts, arms and little moving bits are a few pixels: hide everything marked
 * `userData.detail` beyond `far` metres (call once a frame or less). Returns whether it is drawn in detail.
 */
export function setDetail(group, near) {
  if (group.userData.near === near) return near;
  group.userData.near = near;
  group.traverse(o => { if (o.userData.detail) o.visible = near; });
  return near;
}
