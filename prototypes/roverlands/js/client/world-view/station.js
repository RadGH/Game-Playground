// Lantern Station's view: the interior drawn from world.station (stationgen.js) in a handful of draw calls — every hull
// panel merged into one mesh (panel lines from a small canvas texture laid out in metres), the hatches in one, the
// glass in one, the light strips in one, the props in one, the handholds as one instanced mesh, a point light per room,
// and the space backdrop (stars, the planet filling the view below, the sun) seen through the windows.
//
//   buildStation(THREE, world, { pointLights })  -> { group, lights, dispose, stats }      (also used by simple-view.js)
//   createStationView({ THREE, renderer, scene, camera, world, quality })  -> the world-view contract (index.js)
//   drawStationMap(world, size)  -> canvas: a plan of the modules, in the same world -> map pixels as every other map

import { createSpaceBackdrop } from './space.js';

const FACE_TINT = { floor: [0.62, 0.66, 0.72], ceil: [0.96, 0.97, 1.0], wall: [0.9, 0.91, 0.93] };
const ROOM_TINT = { hub: [1, 1, 1], dock: [1, 0.97, 0.9], lab: [0.95, 0.98, 1.02], greenhouse: [0.94, 1.02, 0.94], sleep: [1.02, 0.97, 0.92], airlock: [1.02, 0.94, 0.9], cupola: [0.94, 0.96, 1.04] };
const PROP_COL = { bench: [0.55, 0.58, 0.62], rack: [0.3, 0.33, 0.38], planter: [0.42, 0.3, 0.2], bunk: [0.28, 0.4, 0.62], console: [0.18, 0.2, 0.24], locker: [0.6, 0.62, 0.58], suit: [0.92, 0.92, 0.88] };

export function buildStation(THREE, world, { pointLights = true } = {}) {
  const st = world.station;
  const group = new THREE.Group();
  group.name = 'station';
  const roomKind = Object.fromEntries([...st.rooms.map(r => [r.id, r.kind]), ...st.tunnels.map(t => [t.id, 'tunnel'])]);

  // --- merged box builder: position, normal, uv (metres / 2 on the face), colour --------------------------------
  function boxes(list, colourOf, uvScale = 0.5) {
    const n = list.length * 24;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const idx = new Uint32Array(list.length * 36);
    let v = 0, p = 0;
    const FACES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    for (const b of list) {
      for (const [ax, sg] of FACES) {
        const [ua, va] = [0, 1, 2].filter(q => q !== ax);
        const c0 = v;
        for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const P = [0, 0, 0];
          P[ax] = b.c[ax] + sg * b.h[ax]; P[ua] = b.c[ua] + su * b.h[ua]; P[va] = b.c[va] + sv * b.h[va];
          pos.set(P, v * 3);
          const N = [0, 0, 0]; N[ax] = sg; nor.set(N, v * 3);
          uv[v * 2] = P[ua] * uvScale; uv[v * 2 + 1] = P[va] * uvScale;
          col.set(colourOf(b, ax, sg), v * 3);
          v++;
        }
        // winding so the face points outward: (u, v) corners in this order give a normal of +x, -y, +z
        const a = c0, bq = c0 + 1, c = c0 + 2, d = c0 + 3;
        if ((ax === 0 && sg > 0) || (ax === 1 && sg < 0) || (ax === 2 && sg > 0)) { idx.set([a, bq, c, a, c, d], p); } else { idx.set([a, c, bq, a, d, c], p); }
        p += 6;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  const asBox = (o) => ({ c: [o.x, o.y + o.shape.hy, o.z], h: [o.shape.hx, o.shape.hy, o.shape.hz], o });

  const hull = world.objects.filter(o => o.kind === 'hull' && !o.glass && !o.hatch).map(asBox);
  const hatches = world.objects.filter(o => o.kind === 'hull' && o.hatch).map(asBox);
  const glass = world.objects.filter(o => o.kind === 'hull' && o.glass).map(asBox);
  // an inside face's look: which way the face points says floor / ceiling / wall (from the inside, the face that points
  // UP is the floor of the room above it)
  const hullCol = (b, ax, sg) => {
    const t = ROOM_TINT[roomKind[b.o.room]] || [1, 1, 1];
    const f = ax === 1 ? (sg > 0 ? FACE_TINT.floor : FACE_TINT.ceil) : FACE_TINT.wall;
    return [f[0] * t[0], f[1] * t[1], f[2] * t[2]];
  };
  const panelTex = panelTexture(THREE);
  const hullMat = new THREE.MeshStandardMaterial({ map: panelTex, vertexColors: true, roughness: 0.62, metalness: 0.08 });
  const hullMesh = new THREE.Mesh(boxes(hull, hullCol), hullMat);
  hullMesh.name = 'hull';
  group.add(hullMesh);
  const hatchMesh = new THREE.Mesh(boxes(hatches, () => [0.95, 0.62, 0.16], 0.5), new THREE.MeshStandardMaterial({ map: stripeTexture(THREE), vertexColors: true, roughness: 0.5, metalness: 0.3 }));
  hatchMesh.name = 'hatches';
  group.add(hatchMesh);
  const glassMesh = new THREE.Mesh(boxes(glass, () => [0.7, 0.85, 1]), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2, depthWrite: false }));
  glassMesh.name = 'glass'; glassMesh.renderOrder = 5;
  group.add(glassMesh);

  // --- light strips along every ceiling, and the props ------------------------------------------------------------
  const strips = [];
  for (const r of st.rooms) {
    const long = r.h[0] >= r.h[2] ? 0 : 2, other = 2 - long;
    for (const side of [-1, 1]) {
      const c = r.c.slice(), h = [0, 0.04, 0];
      c[1] = r.c[1] + r.h[1] - 0.04; c[other] = r.c[other] + side * r.h[other] * 0.45;
      h[long] = r.h[long] * 0.75; h[other] = 0.12;
      strips.push({ c, h, colour: r.light.colour });
    }
  }
  for (const t of st.tunnels) {
    const n = 'xyz'.indexOf(t.axis);
    const up = n === 1 ? 2 : 1;           // a vertical tunnel's "ceiling" is a side wall
    const c = t.c.slice(), h = [0.1, 0.1, 0.1];
    c[up] = t.c[up] + t.h[up] - 0.04; h[up] = 0.04; h[n] = Math.max(0.2, t.h[n] - 0.3);
    strips.push({ c, h, colour: '#e8eeff' });
  }
  const _c = new THREE.Color();
  const stripMesh = new THREE.Mesh(boxes(strips, (b) => { _c.set(b.colour); return [_c.r * 1.6, _c.g * 1.6, _c.b * 1.6]; }), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  stripMesh.name = 'light-strips';
  group.add(stripMesh);
  const propBoxes = [];
  for (const p of st.props) {
    propBoxes.push({ c: [p.x, p.y, p.z], h: [p.hx, p.hy, p.hz], kind: p.kind });
    if (p.kind === 'planter') {
      // a row of leafy tops on the planter (green boxes), facing into the room
      const n = Math.max(2, Math.round(p.hx * 1.4));
      const toward = p.y < 0 ? 1 : -1;
      for (let i = 0; i < n; i++) propBoxes.push({ c: [p.x - p.hx + (i + 0.5) * (2 * p.hx / n), p.y + toward * (p.hy + 0.28), p.z], h: [0.3, 0.28, p.hz * 0.7], kind: 'leaf' });
    }
    if (p.kind === 'console') propBoxes.push({ c: [p.x, p.y + p.hy + 0.02, p.z], h: [p.hx * 0.8, 0.02, p.hz * 0.6], kind: 'screen' });
  }
  const propMesh = new THREE.Mesh(boxes(propBoxes, (b) => b.kind === 'leaf' ? [0.26, 0.62, 0.24] : b.kind === 'screen' ? [0.2, 0.9, 0.85] : PROP_COL[b.kind] || [0.6, 0.6, 0.6]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));
  propMesh.name = 'props';
  group.add(propMesh);

  // --- handholds: one instanced bar ----------------------------------------------------------------------------
  const hh = st.handholds;
  const barGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: 0.4, metalness: 0.5 }), Math.max(1, hh.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const AXV = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  hh.forEach((h, i) => {
    q.setFromUnitVectors(AXV.y, AXV[h.axis]);
    m4.compose(ps.set(h.x, h.y, h.z), q, sc.set(h.r, h.len, h.r));
    bars.setMatrixAt(i, m4);
  });
  bars.count = hh.length;
  bars.computeBoundingSphere();
  bars.name = 'handholds';
  group.add(bars);

  // --- lights -------------------------------------------------------------------------------------------------
  const lights = [];
  // inside a lit white box, light comes from everywhere: the ceilings get almost as much as the floors
  const hemi = new THREE.HemisphereLight(0xe6edff, 0xb4bccc, pointLights ? 0.75 : 1.6);
  group.add(hemi);
  if (pointLights) {
    for (const l of st.lights) {
      const pl = new THREE.PointLight(l.colour, 28 * l.power, l.range * 1.6, 1.6);
      pl.position.set(l.x, l.y - 0.4, l.z);
      group.add(pl); lights.push(pl);
    }
  }
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(...(world.space?.sunDir || [0.5, 0.6, 0.5])).multiplyScalar(100);
  group.add(sun, sun.target);

  return {
    group, lights,
    stats: { hull: hull.length, glass: glass.length, hatches: hatches.length, handholds: hh.length, props: propBoxes.length, strips: strips.length },
    dispose() {
      group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      panelTex.dispose();
    },
  };
}

/** The full-view contract for the station (see index.js header). */
export function createStationView({ THREE, renderer, scene, camera, world, quality = 'medium', onProgress, progress: progressCb } = {}) {
  const cb = onProgress || progressCb;
  cb?.(0.2, 'pressurising the station');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false;
  renderer.toneMappingExposure = 1.0;
  scene.background = new THREE.Color('#000000');
  scene.fog = null;
  let q = typeof quality === 'string' ? quality : 'medium';
  let built = buildStation(THREE, world, { pointLights: q !== 'low' });
  scene.add(built.group);
  const space = createSpaceBackdrop(THREE, world.space, { stars: q === 'low' ? 1200 : 2600 });
  scene.add(space.group);
  const maps = new Map();
  cb?.(1, 'ready');
  const noop = () => {};
  return {
    get quality() { return q; }, preset: { name: q }, sunDir: space.sunDir, csm: null, sky: null, things: null,
    tracks: { add: noop, lift: noop, clear: noop, count: 0 },
    enhance: (m) => m,
    update(dt, cam = camera) { space.update(cam); },
    render() { renderer.info.reset(); renderer.setRenderTarget(null); renderer.render(scene, camera); },
    post: { mode: 'direct' },
    setCamera(cam) { camera = cam; },
    resize() {},
    preload() {},
    breakObject: () => null, objectPiece: () => null, isBroken: () => false,
    dust: noop, splash: noop, pushGrass: noop,
    mapImage(px = 1024) { if (!maps.has(px)) maps.set(px, drawStationMap(world, px)); return maps.get(px); },
    worldToMap(x, z, px) { return [((x + world.size / 2) / world.size) * px, ((z + world.size / 2) / world.size) * px]; },
    async setQuality(name) {
      if (name === q) return;
      q = name; scene.remove(built.group); built.dispose();
      built = buildStation(THREE, world, { pointLights: q !== 'low' }); scene.add(built.group);
    },
    setTime: noop, setWeather: noop, get hour() { return 12; },
    debug() {
      const info = renderer.info.render;
      return { quality: q, calls: info.calls, triangles: info.triangles, terrainChunks: 0, things: { instances: 0, farMeshes: 0 }, station: built.stats, lights: built.lights.length };
    },
    dispose() { scene.remove(built.group); built.dispose(); scene.remove(space.group); space.dispose(); },
  };
}

/** A top-down plan of the station: modules as rounded boxes with their names, tunnels, windows in blue, hatches in amber. */
export function drawStationMap(world, size = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const st = world.station;
  const toPx = (v) => ((v + world.size / 2) / world.size) * size;
  g.fillStyle = '#05070c'; g.fillRect(0, 0, size, size);
  // a few stars
  let s = 77; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.fillRect(rnd() * size, rnd() * size, 1.4, 1.4); }
  const rect = (b, fill, stroke) => {
    const x0 = toPx(b.c[0] - b.h[0]), z0 = toPx(b.c[2] - b.h[2]), w = toPx(b.c[0] + b.h[0]) - x0, h = toPx(b.c[2] + b.h[2]) - z0;
    g.fillStyle = fill; g.fillRect(x0, z0, w, h);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, size / 400); g.strokeRect(x0, z0, w, h); }
  };
  for (const t of st.tunnels) rect(t, '#5d6678', '#c8d0de');
  for (const r of st.rooms) rect(r, r.kind === 'cupola' ? '#3c5a86' : '#8892a6', '#e6ecf6');
  for (const o of world.objects) {
    if (!o.glass && !o.hatch) continue;
    const b = { c: [o.x, 0, o.z], h: [Math.max(o.shape.hx, 0.25), 0, Math.max(o.shape.hz, 0.25)] };
    rect(b, o.glass ? 'rgba(120,190,255,0.85)' : 'rgba(255,170,40,0.95)');
  }
  // (no names baked in: the HUD draws world.labels over every map)
  return cv;
}

function panelTexture(THREE) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#e9ebee'; g.fillRect(0, 0, S, S);
  // two panels a tile (a tile = 2 m): seams, a darker inset, rivets
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = i * S / 2, y = j * S / 2;
    g.fillStyle = '#dfe2e6'; g.fillRect(x + 10, y + 10, S / 2 - 20, S / 2 - 20);
    g.fillStyle = '#9aa0a8';
    for (const [rx, ry] of [[x + 6, y + 6], [x + S / 2 - 8, y + 6], [x + 6, y + S / 2 - 8], [x + S / 2 - 8, y + S / 2 - 8]]) g.fillRect(rx, ry, 3, 3);
  }
  g.strokeStyle = '#8a9099'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function stripeTexture(THREE) {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#2a2a2a';
  for (let k = -S; k < S * 2; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 8, 0); g.lineTo(k + 8 - S, S); g.lineTo(k - S, S); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
