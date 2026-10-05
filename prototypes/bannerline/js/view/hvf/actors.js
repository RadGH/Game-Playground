// Hunters vs Farmers — entities on screen (stream H view). Low-poly procedural stand-ins built from
// merged, vertex-coloured primitives (one material, fog of war applied): farmers and hunters, the
// animals (one InstancedMesh per species), every farm building, the hunters' kennels and lodges,
// the farmers' army, watchstones, snares, hawks, hounds and graves. Stream C can swap any builder
// for a real model later: `MODELS[kind]` is the only place a look is decided.
//
// What a player may see is decided by the sim (query.visibleEnt / seenBuildings); this file draws
// only what it is told is visible, and remembered enemy buildings where they were last seen.

import * as THREE from 'three';
import { groundY } from './world.js';

export const FARMER_COLOURS = ['#e8c34a', '#4fa3e8', '#e8664f', '#7fd06a', '#c27fe8', '#f0a04a', '#5fd8c8', '#f07fb4', '#b8b8b8'];
const HUNTER_COLOUR = '#b23a2a';

// ── geometry helpers ───────────────────────────────────────────────────────────────────────────────
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
function part(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[3 * i] = col[0]; a[3 * i + 1] = col[1]; a[3 * i + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  return g;
}
function merged(parts) {
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), Cc = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); Cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  out.computeVertexNormals(); out.computeBoundingSphere();
  return out;
}
const box = (w, h, d, x, y, z, col, ry = 0) => part(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z), col);
const cyl = (r0, r1, h, x, y, z, col, seg = 8) => part(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), col);
const cone = (r, h, x, y, z, col, seg = 8) => part(new THREE.ConeGeometry(r, h, seg).translate(x, y, z), col);
const ball = (r, x, y, z, col, sy = 1, sx = 1) => part(new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, 1).translate(x, y, z), col);
const roof = (w, d, h, x, y, z, col) => part(new THREE.CylinderGeometry(0.01, 1, h, 4, 1).rotateY(Math.PI / 4).scale(w / 1.414, 1, d / 1.414).translate(x, y + h / 2, z), col);

const WOOD = C('#8a6440'), DARK = C('#5a3e26'), STRAW = C('#d8b55a'), WALL = C('#d9cfb5'), RED = C('#a8432f'), STONE = C('#9a968c'), SKIN = C('#e6b48c');

// one model per building kind, footprint w x d metres centred on the origin
function buildingModel(kind, w, d) {
  const p = [];
  switch (kind) {
    case 'coop': p.push(box(w * 0.8, 1.1, d * 0.7, 0, 0.55, 0, WOOD), roof(w * 0.95, d * 0.85, 0.8, 0, 1.1, 0, RED), box(0.4, 0.5, 0.05, 0, 0.35, d * 0.36, DARK)); break;
    case 'pen': {
      for (const s of [-1, 1]) { p.push(box(w * 0.92, 0.12, 0.12, 0, 0.75, s * d * 0.46, WOOD), box(w * 0.92, 0.12, 0.12, 0, 0.4, s * d * 0.46, WOOD)); p.push(box(0.12, 0.12, d * 0.92, s * w * 0.46, 0.75, 0, WOOD), box(0.12, 0.12, d * 0.92, s * w * 0.46, 0.4, 0, WOOD)); }
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(box(0.18, 1, 0.18, a * w * 0.46, 0.5, b * d * 0.46, DARK));
      p.push(box(w * 0.4, 1.2, d * 0.3, 0, 0.6, -d * 0.25, WOOD), roof(w * 0.5, d * 0.42, 0.6, 0, 1.2, -d * 0.25, STRAW));
      break;
    }
    case 'sty': p.push(box(w * 0.85, 0.9, d * 0.7, 0, 0.45, 0, C('#b07a5a')), roof(w * 0.95, d * 0.85, 0.7, 0, 0.9, 0, C('#6e5a44')), box(w * 0.5, 0.05, d * 0.3, 0, 0.03, d * 0.45, C('#6a4a2a'))); break;
    case 'barn': p.push(box(w * 0.85, 2.4, d * 0.8, 0, 1.2, 0, RED), roof(w * 0.95, d * 0.92, 1.6, 0, 2.4, 0, C('#4a3a30')), box(1.4, 1.6, 0.06, 0, 0.8, d * 0.41, WALL)); break;
    case 'hive': p.push(box(0.5, 0.4, 0.5, 0, 0.2, 0, WOOD), cyl(0.32, 0.42, 0.7, 0, 0.75, 0, STRAW), cone(0.36, 0.35, 0, 1.25, 0, C('#c49a40'))); break;
    case 'granary': p.push(cyl(1.2, 1.3, 2.4, 0, 1.2, 0, WALL), cone(1.5, 1.4, 0, 3.1, 0, STRAW)); break;
    case 'windmill': p.push(cyl(0.9, 1.4, 6.5, 0, 3.25, 0, WALL, 8), cone(1.2, 1.4, 0, 7.2, 0, RED)); break;
    case 'farmhouse': p.push(box(w * 0.85, 2.0, d * 0.8, 0, 1.0, 0, WALL), roof(w * 0.98, d * 0.95, 1.5, 0, 2.0, 0, C('#7a4a30')), box(0.9, 1.3, 0.06, 0, 0.65, d * 0.41, DARK), box(0.4, 1.4, 0.4, w * 0.25, 3.0, 0, STONE)); break;
    case 'sheepdog': p.push(box(0.9, 0.7, 0.9, 0, 0.35, 0, WOOD), roof(1.05, 1.05, 0.45, 0, 0.7, 0, RED), box(0.5, 0.3, 0.22, 0.2, 0.32, 0.65, C('#3a3028')), ball(0.15, 0.2, 0.55, 0.85, C('#3a3028'))); break;
    case 'fence': p.push(box(0.14, 1.0, 0.14, -0.8, 0.5, 0, DARK), box(0.14, 1.0, 0.14, 0.8, 0.5, 0, DARK), box(1.9, 0.12, 0.1, 0, 0.75, 0, WOOD), box(1.9, 0.12, 0.1, 0, 0.4, 0, WOOD), box(0.1, 0.12, 1.9, 0, 0.6, 0, WOOD)); break;
    case 'wall': p.push(box(1.95, 1.3, 1.95, 0, 0.65, 0, STONE), box(2.0, 0.15, 2.0, 0, 1.35, 0, C('#b3afa3'))); break;
    case 'hedge': p.push(ball(0.95, 0, 0.6, 0, C('#4a3a2c'), 0.75), ball(0.6, 0.3, 0.9, 0.2, C('#5e3a46'), 0.8)); break;
    case 'mud': p.push(box(w * 0.95, 0.06, d * 0.95, 0, 0.03, 0, C('#5b4126')), ball(0.35, 0.6, 0.05, 0.4, C('#4a331c'), 0.2), ball(0.3, -0.7, 0.05, -0.5, C('#4a331c'), 0.2)); break;
    case 'lookout': p.push(cyl(0.12, 0.15, 4.2, -0.5, 2.1, -0.5, DARK, 5), cyl(0.12, 0.15, 4.2, 0.5, 2.1, 0.5, DARK, 5), cyl(0.12, 0.15, 4.2, 0.5, 2.1, -0.5, DARK, 5), cyl(0.12, 0.15, 4.2, -0.5, 2.1, 0.5, DARK, 5), box(1.6, 0.15, 1.6, 0, 4.2, 0, WOOD), roof(1.8, 1.8, 0.7, 0, 4.9, 0, STRAW)); break;
    case 'tower': p.push(cyl(1.3, 1.6, 4.5, 0, 2.25, 0, STONE, 8), cyl(1.6, 1.4, 0.6, 0, 4.8, 0, C('#b3afa3'), 8), cone(1.7, 1.6, 0, 5.9, 0, C('#5a4636'))); break;
    case 'hall': p.push(box(w * 0.9, 2.6, d * 0.85, 0, 1.3, 0, C('#a87a4a')), roof(w * 0.98, d * 0.95, 2.2, 0, 2.6, 0, STRAW), box(1.6, 1.8, 0.06, 0, 0.9, d * 0.43, DARK), cyl(0.1, 0.1, 2.4, w * 0.3, 4.2, 0, DARK, 4), box(0.9, 0.5, 0.05, w * 0.3 + 0.45, 5.0, 0, C('#d8b55a'))); break;
    case 'kennel': p.push(box(4.4, 2.2, 3.6, 0, 1.1, 0, C('#5a4a3e')), roof(5, 4.2, 1.8, 0, 2.2, 0, C('#3a2e26')), box(1.4, 1.5, 0.06, 0, 0.75, 1.82, C('#1e1814')), cyl(0.1, 0.1, 3.2, 2.0, 1.6, 1.6, DARK, 4), box(0.08, 0.9, 0.7, 2.0, 2.7, 1.95, C(HUNTER_COLOUR))); break;
    case 'lodge': p.push(cone(1.8, 3.0, 0, 1.5, 0, C('#6a5a44'), 7), cyl(0.06, 0.06, 3.6, 0, 1.8, 0, DARK, 4), box(0.06, 0.6, 0.5, 0.25, 3.3, 0, C(HUNTER_COLOUR))); break;
    default: p.push(box(w, 1, d, 0, 0.5, 0, WOOD));
  }
  return merged(p);
}

function characterModel(kind, colour) {
  const band = C(colour), p = [];
  if (kind === 'farmer') {
    p.push(cyl(0.2, 0.32, 0.95, 0, 0.62, 0, C('#6e8a4a')), cyl(0.33, 0.33, 0.12, 0, 0.98, 0, band), ball(0.24, 0, 1.33, 0, SKIN),
      cyl(0.62, 0.62, 0.05, 0, 1.5, 0, STRAW, 10), cyl(0.24, 0.28, 0.24, 0, 1.62, 0, STRAW), cyl(0.29, 0.29, 0.06, 0, 1.53, 0, band),
      cyl(0.05, 0.05, 1.6, 0.36, 0.95, 0.1, WOOD, 4), cyl(0.09, 0.09, 0.3, 0.27, 0.12, 0, C('#4a3a28')), cyl(0.09, 0.09, 0.3, -0.13, 0.12, 0, C('#4a3a28')));
  } else if (kind === 'hunter') {
    p.push(cone(0.62, 1.55, 0, 0.78, 0, C('#3a3a32'), 8), cyl(0.38, 0.4, 0.14, 0, 1.15, 0, band), ball(0.26, 0, 1.62, 0.02, SKIN),
      cone(0.36, 0.62, 0, 1.86, -0.04, C('#2a2a24'), 8), cyl(0.04, 0.04, 2.4, 0.5, 1.2, 0.15, WOOD, 4), cone(0.08, 0.35, 0.5, 2.55, 0.15, STONE, 4));
  }
  return merged(p);
}

function animalModel(kind) {
  const p = [];
  if (kind === 'sheep') p.push(ball(0.42, 0, 0.55, 0, C('#f2efe6'), 0.85, 1), ball(0.3, 0.2, 0.62, 0.18, C('#ebe7dc')), ball(0.16, 0, 0.62, 0.45, C('#2e2a26'), 1.1), cyl(0.05, 0.05, 0.35, 0.18, 0.17, 0.18, C('#2e2a26'), 4), cyl(0.05, 0.05, 0.35, -0.18, 0.17, -0.18, C('#2e2a26'), 4), cyl(0.05, 0.05, 0.35, 0.18, 0.17, -0.18, C('#2e2a26'), 4), cyl(0.05, 0.05, 0.35, -0.18, 0.17, 0.18, C('#2e2a26'), 4));
  else if (kind === 'hen') p.push(ball(0.2, 0, 0.3, 0, C('#f4ede0'), 0.9), ball(0.11, 0, 0.5, 0.15, C('#f4ede0')), cone(0.04, 0.09, 0, 0.5, 0.27, C('#e8a030'), 4), box(0.05, 0.08, 0.06, 0, 0.62, 0.15, C('#d83a2a')), cyl(0.02, 0.02, 0.15, 0.06, 0.07, 0, C('#e8a030'), 3), cyl(0.02, 0.02, 0.15, -0.06, 0.07, 0, C('#e8a030'), 3));
  else if (kind === 'pig') p.push(ball(0.36, 0, 0.45, 0, C('#eba3a0'), 0.8, 1), ball(0.22, 0, 0.5, 0.36, C('#eba3a0')), ball(0.1, 0, 0.47, 0.56, C('#d4807d'), 0.8), cyl(0.06, 0.06, 0.3, 0.17, 0.15, 0.17, C('#d4807d'), 4), cyl(0.06, 0.06, 0.3, -0.17, 0.15, -0.17, C('#d4807d'), 4), cyl(0.06, 0.06, 0.3, 0.17, 0.15, -0.17, C('#d4807d'), 4), cyl(0.06, 0.06, 0.3, -0.17, 0.15, 0.17, C('#d4807d'), 4));
  else if (kind === 'cow') p.push(box(0.75, 0.6, 1.25, 0, 0.95, 0, C('#f0ece4')), box(0.5, 0.3, 0.55, 0.1, 1.1, 0.1, C('#2a2622')), box(0.4, 0.42, 0.42, 0, 1.05, 0.78, C('#f0ece4')), box(0.3, 0.2, 0.12, 0, 0.92, 1.0, C('#e8b4a8')), cone(0.05, 0.22, 0.17, 1.33, 0.78, C('#e8dcc0'), 4), cone(0.05, 0.22, -0.17, 1.33, 0.78, C('#e8dcc0'), 4),
    cyl(0.09, 0.09, 0.65, 0.25, 0.33, 0.45, C('#e8e2d8'), 5), cyl(0.09, 0.09, 0.65, -0.25, 0.33, 0.45, C('#e8e2d8'), 5), cyl(0.09, 0.09, 0.65, 0.25, 0.33, -0.45, C('#e8e2d8'), 5), cyl(0.09, 0.09, 0.65, -0.25, 0.33, -0.45, C('#e8e2d8'), 5));
  return merged(p);
}

function miscModel(kind) {
  const p = [];
  if (kind === 'scarecrow') p.push(cyl(0.06, 0.06, 2.0, 0, 1.0, 0, WOOD, 4), box(1.6, 0.08, 0.08, 0, 1.45, 0, WOOD), cone(0.5, 1.0, 0, 1.15, 0, C('#8a7a4a'), 6), ball(0.28, 0, 1.85, 0, C('#cdb58a')), cone(0.4, 0.45, 0, 2.2, 0, C('#3a2e22'), 7), cone(0.12, 0.4, 0.8, 1.35, 0, STRAW, 4), cone(0.12, 0.4, -0.8, 1.35, 0, STRAW, 4));
  else if (kind === 'crow') p.push(ball(0.18, 0, 0, 0, C('#1c1c22'), 0.8, 1), ball(0.11, 0, 0.06, 0.2, C('#1c1c22')), box(0.9, 0.03, 0.22, 0, 0.03, -0.02, C('#26262e')), ball(0.04, 0, 0.06, 0.32, C('#c49a40')));
  else if (kind === 'hawk') p.push(ball(0.22, 0, 0, 0, C('#8a5a2a'), 0.8), box(1.4, 0.03, 0.3, 0, 0.03, 0, C('#6a4220')), ball(0.13, 0, 0.06, 0.24, C('#e8dcc0')));
  else if (kind === 'hound') p.push(box(0.35, 0.35, 0.85, 0, 0.55, 0, C('#6a4a2e')), box(0.28, 0.3, 0.35, 0, 0.78, 0.5, C('#6a4a2e')), box(0.1, 0.2, 0.08, 0.1, 0.98, 0.45, C('#3a2a1a')), box(0.1, 0.2, 0.08, -0.1, 0.98, 0.45, C('#3a2a1a')),
    cyl(0.06, 0.06, 0.4, 0.12, 0.2, 0.3, C('#5a3e26'), 4), cyl(0.06, 0.06, 0.4, -0.12, 0.2, 0.3, C('#5a3e26'), 4), cyl(0.06, 0.06, 0.4, 0.12, 0.2, -0.3, C('#5a3e26'), 4), cyl(0.06, 0.06, 0.4, -0.12, 0.2, -0.3, C('#5a3e26'), 4));
  else if (kind === 'ward') p.push(cyl(0.18, 0.32, 1.5, 0, 0.75, 0, C('#8a8f9a'), 6), ball(0.14, 0, 1.6, 0, C('#9fe0ff')));
  else if (kind === 'snare') p.push(part(new THREE.TorusGeometry(0.35, 0.05, 4, 10).rotateX(Math.PI / 2).translate(0, 0.06, 0), C('#a89a7a')), cyl(0.04, 0.04, 0.4, 0.4, 0.2, 0, WOOD, 4));
  else if (kind === 'grave') p.push(box(0.6, 0.8, 0.18, 0, 0.4, 0, STONE), box(1.0, 0.1, 1.6, 0, 0.05, 0.6, C('#5b4126')), box(0.12, 0.4, 0.05, 0, 0.55, 0.1, C('#d8d0c0')), box(0.3, 0.1, 0.05, 0, 0.62, 0.1, C('#d8d0c0')));
  return merged(p);
}

// ── the actor set ─────────────────────────────────────────────────────────────────────────────────

export function createHvfActors({ scene, map, data, fogify: fogifyWorld, localTeam, models = null }) {
  // actors keep their full colour under the spectator's soft fog (the ground shows the fog instead)
  const fogify = (m) => fogifyWorld(m, { actor: true });
  const group = new THREE.Group();
  group.name = 'hvf-actors';
  scene.add(group);
  const mat = fogify(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const ghostMat = fogify(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }));
  const geoCache = new Map();
  const geo = (key, make) => { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; };
  const items = new Map();   // ent id -> { mesh, ent } (characters, buildings, army, kit)
  const BK = data.hvf.buildings.kinds;

  // animals: one InstancedMesh per species
  const herds = {};
  for (const kind of Object.keys(data.hvf.animals.kinds)) {
    const m = new THREE.InstancedMesh(animalModel(kind), mat, 480);
    m.count = 0; m.frustumCulled = false; m.name = 'hvf-' + kind;
    group.add(m);
    herds[kind] = m;
  }
  // stream C's art when it loaded (js/view/hvf/models.js); the stand-ins above otherwise
  const animalScale = { hen: 1.5, sheep: 1.45, pig: 1.4, cow: 1.45 };
  // C's crowd poses: one InstancedMesh per (species, pose); an animal swaps between them (walkA / walkB
  // while it moves, run while it flees, bleat when it calls, graze or idle at rest)
  const POSES = ['idle', 'walkA', 'walkB', 'run', 'graze', 'bleat'];
  const poseHerds = {};
  const bleatUntil = new Map();
  const poseMat = fogify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  if (models) {
    for (const mm of models.materials()) { fogify(mm); mm.needsUpdate = true; }
    for (const kind of Object.keys(herds)) models.animalPoses(kind).then((poses) => {
      if (!group.parent) return;
      const set = {};
      for (const pose of POSES) {
        const geo = poses[pose] || poses.idle; if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, poseMat, 480);
        im.count = 0; im.frustumCulled = false; im.name = `hvf-${kind}-${pose}`; im.userData.shared = true;
        group.add(im); set[pose] = im;
      }
      poseHerds[kind] = set;
      herds[kind].visible = false;
    }).catch((e) => console.warn('hvf poses', kind, e));
  }
  // joined fences / walls / briar hedges: one InstancedMesh per (kind, link shape, material) for the whole map
  const linked = new Map();   // 'fence:5:std' -> InstancedMesh
  function linkedMesh(kind, mask, key, geo, need) {
    const k = `${kind}:${mask}:${key}`;
    let im = linked.get(k);
    if (!im || im.instanceMatrix.count < need) {
      if (im) { group.remove(im); im.dispose(); }
      im = new THREE.InstancedMesh(geo, models.material(key), Math.max(16, need * 2));
      im.frustumCulled = false; im.name = 'hvf-' + k; group.add(im); linked.set(k, im);
    }
    return im;
  }
  const colourOf = (e, state) => (e.team === 1 ? HUNTER_COLOUR : FARMER_COLOURS[(state.players[e.owner]?.colour ?? 0) % FARMER_COLOURS.length]);
  const LINKED = { fence: 1, wall: 1, hedge: 1 };
  let linkMap = null;
  const maskOf = (e) => {
    if (!LINKED[e.type] || !e.cells) return 0;
    const c = e.cells[0], x = c % map.cols, z = (c / map.cols) | 0, same = (cx, cz) => linkMap.get(cz * map.cols + cx) === e.type;
    return (same(x, z - 1) ? 1 : 0) | (same(x + 1, z) ? 2 : 0) | (same(x, z + 1) ? 4 : 0) | (same(x - 1, z) ? 8 : 0);
  };
  const graves = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(1.5, 1.5, 1.5),   // animals drawn a little large so a flock reads from the RTS camera
  p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

  function modelFor(e, state) {
    if (e.kind === 'farmer') return geo('farmer:' + e.owner, () => characterModel('farmer', FARMER_COLOURS[state.players[e.owner].colour % FARMER_COLOURS.length]));
    if (e.kind === 'hunter') return geo('hunter', () => characterModel('hunter', HUNTER_COLOUR));
    if (e.kind === 'building') {
      const def = BK[e.type], size = def ? def.size : [2, 2];
      return geo('b:' + e.type, () => buildingModel(e.type, size[0] * map.cell, size[1] * map.cell));
    }
    if (e.kind === 'army') return geo(e.type, () => miscModel(e.type));
    return geo(e.kind, () => miscModel(e.kind === 'ward' ? 'ward' : e.kind));
  }

  function makeItem(e, state, ghost = false) {
    if (models) {
      try {
        if (e.kind === 'building' || e.kind === 'ward' || e.kind === 'snare') {
          const def = BK[e.type], size = def ? def.size : null, mask = maskOf(e);
          const obj = models.building(e.kind === 'building' ? e.type : e.kind, { color: colourOf(e, state), w: size ? size[0] * map.cell : null, d: size ? size[1] * map.cell : null, mask, seed: e.id });
          group.add(obj.group);
          return { mesh: obj.group, ent: e, obj, mask };
        }
        if (e.kind === 'farmer' || e.kind === 'hunter') { const b = models.body(e.kind, colourOf(e, state)); group.add(b.object); return { mesh: b.object, ent: e, body: b }; }
        if (e.kind === 'army') { const b = models.creature('army', e.type); group.add(b.object); return { mesh: b.object, ent: e, body: b }; }
        if (e.kind === 'hound' || e.kind === 'hawk') { const b = models.creature('pets', e.kind); group.add(b.object); return { mesh: b.object, ent: e, body: b }; }
      } catch (err) { /* no look for this one: the stand-in below */ }
    }
    const mesh = new THREE.Mesh(modelFor(e, state), ghost ? ghostMat : mat);
    mesh.name = 'hvf-' + e.kind + ':' + e.type;
    if (e.type === 'windmill') {
      const sails = new THREE.Mesh(geo('sails', () => merged([box(0.25, 5.6, 0.06, 0, 0, 0, C('#efe6d0')), box(5.6, 0.25, 0.06, 0, 0, 0, C('#efe6d0')), ball(0.22, 0, 0, 0, DARK)])), mat);
      sails.position.set(0, 6.0, 1.3); sails.name = 'sails';
      mesh.add(sails);
    }
    group.add(mesh);
    return { mesh, ent: e };
  }

  let t = 0;
  /**
   * Draw the state for `team` (what that team may see). alpha: interpolation between ticks.
   * visible(e) -> bool from the sim's query; remembered: [{id, kind, x, z}] enemy buildings.
   */
  function dropItem(id, it) { group.remove(it.mesh); it.obj?.dispose(); it.body?.dispose(); items.delete(id); }
  function sync(state, alpha, dt, visible, remembered) {
    t += dt;
    const allTeams = localTeam < 0;   // the spectator (team -1) sees every side's buildings live
    if (models) { linkMap = new Map(); for (const e of state.ents) if (e.kind === 'building' && LINKED[e.type] && e.alive && !e._gone && e.cells) linkMap.set(e.cells[0], e.type); }
    const seen = new Set();
    const counts = {};
    for (const k of Object.keys(herds)) counts[k] = 0;
    const pcount = {};
    const links = new Map();   // 'fence:5' -> [ent]
    for (const e of state.ents) {
      if (e._gone) continue;
      if (e.kind === 'animal') {
        if (!e.alive || !visible(e)) continue;
        const h = herds[e.type]; if (!h) continue;
        const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
        const moving = Math.abs(e.x - e.px) + Math.abs(e.z - e.pz) > 0.001;
        const ph = poseHerds[e.type];
        if (ph) {
          const pose = e.fleeUntil > state.tick ? 'run' : (bleatUntil.get(e.id) || 0) > t ? 'bleat' : moving ? ((Math.floor(t * 4 + e.id * 0.37) & 1) ? 'walkA' : 'walkB') : (e.id % 3 ? 'graze' : 'idle');
          const im = ph[pose] || ph.idle; if (!im) continue;
          p3.set(x, groundY(map, x, z), z); q.setFromAxisAngle(Y, e.face || 0); s3.setScalar(animalScale[e.type] || 1.4);
          m4.compose(p3, q, s3); s3.setScalar(1.5);
          const key = e.type + ':' + pose; const n = pcount[key] || 0; pcount[key] = n + 1;
          if (n < im.instanceMatrix.count) im.setMatrixAt(n, m4);
          continue;
        }
        p3.set(x, groundY(map, x, z) + (moving ? Math.abs(Math.sin(t * 9 + e.id)) * 0.08 : 0), z);
        q.setFromAxisAngle(Y, e.face || 0);
        m4.compose(p3, q, s3);
        if (h.userData.s) { s3.setScalar(h.userData.s); m4.compose(p3, q, s3); s3.setScalar(1.5); }
        h.setMatrixAt(counts[e.type]++, m4);
        continue;
      }
      const isChar = e.kind === 'farmer' || e.kind === 'hunter';
      if (isChar && !e.alive) {
        // a downed farmer stands as a ghost at his grave (C's ghost style); hunters simply vanish until they respawn
        const gr = e.kind === 'farmer' && models ? state.hvf.graves.find((g) => g.pid === e.owner) : null;
        const it0 = items.get(e.id);
        if (!gr || !it0 || !it0.body) continue;
        seen.add(e.id);
        if (!it0.ghost && it0.body.actor) it0.ghost = models.ghost(it0.body.object);
        it0.mesh.position.set(gr.x + 0.6, groundY(map, gr.x, gr.z) + 0.25 + Math.sin(t * 2) * 0.12, gr.z);
        it0.body.setAnim('idle'); if (dt > 0) it0.body.update(dt, t);
        it0.mesh.visible = true;
        continue;
      }
      if (e.kind === 'farmer') { const it1 = items.get(e.id); if (it1 && it1.ghost) { it1.ghost(); it1.ghost = null; } }
      if (models && e.kind === 'building' && LINKED[e.type] && (allTeams || e.team === localTeam) && e.alive && e.cells) {
        if (!visible(e)) continue;
        const key = e.type + ':' + maskOf(e);
        if (!links.has(key)) links.set(key, []);
        links.get(key).push(e);
        continue;
      }
      if (e.kind === 'building' && !allTeams && e.team !== localTeam) continue;   // drawn from memory below
      if (!visible(e)) continue;
      seen.add(e.id);
      let it = items.get(e.id);
      if (it && it.obj && LINKED[e.type] && maskOf(e) !== it.mask) { dropItem(e.id, it); it = null; }   // a fence that gained a neighbour re-joins
      if (!it) { it = makeItem(e, state); items.set(e.id, it); }
      it.ent = e;
      const x = e.px + (e.x - e.px) * alpha, z = e.pz + (e.z - e.pz) * alpha;
      let y = groundY(map, x, z);
      if (e.kind === 'army' && e.type === 'crow') y += 3.2 + Math.sin(t * 3 + e.id) * 0.3;
      if (e.kind === 'hawk') y += 9;
      it.mesh.position.set(x, y, z);
      it.mesh.rotation.y = e.face || 0;
      if (isChar || e.kind === 'army' || e.kind === 'hound') {
        const moving = Math.abs(e.x - e.px) + Math.abs(e.z - e.pz) > 0.001;
        it.mesh.position.y += moving ? Math.abs(Math.sin(t * 10 + e.id)) * 0.1 : 0;
      }
      if (it.obj) {
        if (e.done === false) it.obj.setProgress(e.hp / e.hpMax); else it.obj.setProgress(1);
        it.obj.setDamage(e.hpMax > 0 ? 1 - e.hp / e.hpMax : 0);
        if (e.type === 'hall') it.obj.setReady(state.players[e.owner].gold >= data.hvf.units.army.crow.cost);
        else if (e.lodge) it.obj.setReady(e.done !== false);
        if (dt > 0) it.obj.update(dt);
      } else if (e.kind === 'building' && e.done === false) it.mesh.scale.setScalar(0.55 + 0.45 * (e.hp / e.hpMax));
      else if (e.kind === 'building') it.mesh.scale.setScalar(1);
      if (it.body) {
        const moving = Math.abs(e.x - e.px) + Math.abs(e.z - e.pz) > 0.001;
        if (moving) it.body.setAnim('walk'); else if (e.ord && e.ord.k === 'attack' && (e._atkAt || 0) > state.tick - 25) it.body.setAnim('attack'); else it.body.setAnim('ready');
        if (dt > 0) it.body.update(dt, t);
        it.mesh.position.y = y;   // a real body walks; no bob
      }
      if (!it.obj) { const sails = it.mesh.getObjectByName('sails'); if (sails) sails.rotation.z = t * 0.8; }
      it.mesh.visible = true;
    }
    // remembered enemy buildings (grey where the fog keeps them)
    for (const m of remembered) {
      const live = state.ents.find((e) => e.id === m.id);
      const key = 'mem:' + m.id;
      seen.add(key);
      let it = items.get(key);
      if (!it) { it = makeItem(live || { kind: 'building', type: m.kind, owner: 0, team: 0, id: m.id }, state, false); items.set(key, it); }
      it.mesh.position.set(m.x, groundY(map, m.x, m.z), m.z);
      if (!it.obj) { const sails = it.mesh.getObjectByName('sails'); if (sails && live && visible(live)) sails.rotation.z = t * 0.8; }
      it.mesh.visible = true;
    }
    for (const [k, h] of Object.entries(herds)) { h.count = counts[k]; h.instanceMatrix.needsUpdate = true; }
    for (const [kind, set] of Object.entries(poseHerds)) for (const [pose, im] of Object.entries(set)) { im.count = Math.min(im.instanceMatrix.count, pcount[kind + ':' + pose] || 0); im.instanceMatrix.needsUpdate = true; }
    if (models) {
      const used = new Set();
      for (const [key, list] of links) {
        const [kind, mask] = key.split(':');
        const geos = models.linked(kind, +mask);
        for (const [mk, geo] of Object.entries(geos)) {
          if (!geo) continue;
          const im = linkedMesh(kind, +mask, mk, geo, list.length);
          list.forEach((e, n) => { const x = (e.cells[0] % map.cols + 0.5) * map.cell, z = ((e.cells[0] / map.cols | 0) + 0.5) * map.cell; p3.set(x, groundY(map, x, z), z); q.identity(); s3.setScalar(1); m4.compose(p3, q, s3); im.setMatrixAt(n, m4); });
          im.count = list.length; im.instanceMatrix.needsUpdate = true; im.visible = true;
          used.add(`${kind}:${mask}:${mk}`);
        }
      }
      for (const [k, im] of linked) if (!used.has(k)) { im.count = 0; im.visible = false; }
      s3.setScalar(1.5);
    }
    for (const [id, it] of items) if (!seen.has(id)) {
      if (typeof id === 'string') { it.mesh.visible = false; continue; }   // a remembered building: kept for the other half of a split screen
      if (state.ents.some((e) => e.id === id && !e._gone && (e.kind !== 'farmer' && e.kind !== 'hunter' || e.alive))) { it.mesh.visible = false; continue; }
      dropItem(id, it);
    }
    // graves (everyone sees a grave: hunters may camp it)
    const gk = new Set();
    for (const g of state.hvf.graves) {
      gk.add(g.pid);
      let m = graves.get(g.pid);
      if (!m) {
        if (models) { const o = models.building('grave', { color: FARMER_COLOURS[(state.players[g.pid]?.colour ?? 0) % FARMER_COLOURS.length], seed: g.pid }); m = o.group; m.userData.obj = o; }
        else m = new THREE.Mesh(geo('grave', () => miscModel('grave')), mat);
        group.add(m); graves.set(g.pid, m);
      }
      m.position.set(g.x, groundY(map, g.x, g.z), g.z);
    }
    for (const [pid, m] of graves) if (!gk.has(pid)) { group.remove(m); m.userData.obj?.dispose(); graves.delete(pid); }
  }

  /** Screen picking: the entity under a ground point (characters, animals, buildings), or null. */
  function pick(state, x, z, filter = () => true) {
    let best = null, bd = 1e9;
    for (const e of state.ents) {
      if (e._gone || !e.alive || !filter(e)) continue;
      const r = (e.kind === 'building' ? e.r : Math.max(0.6, e.r)) + 0.6;
      const d = (e.x - x) * (e.x - x) + (e.z - z) * (e.z - z);
      if (d <= r * r && d < bd) { bd = d; best = e; }
    }
    return best;
  }

  return {
    group, sync, pick, items,
    /** Sim events the crowd reacts to: an animal calling bleats for a moment. */
    onEvent(ev) {
      if (ev.type === 'noise' && ev.src != null) bleatUntil.set(ev.src, t + 0.9);
      if (bleatUntil.size > 2000) bleatUntil.clear();
      if (ev.type === 'shot') { const it = items.get(ev.src); it?.obj?.fire?.(); }
    },
    /** Whose eyes the next sync draws with (split screen: each half sets its own team; -1 = the spectator, every side). */
    setTeam(team) { localTeam = team; },
    stats() { let calls = 0, tris = 0; group.traverse((o) => { if (o.isMesh && o.visible && (o.count == null || o.count > 0)) { calls++; tris += ((o.geometry.index?.count || o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); } }); return { calls, tris }; },
    /** A free-standing model for the placement ghost. */
    ghostFor(kind) { const def = BK[kind]; return new THREE.Mesh(buildingModel(kind, def.size[0] * map.cell, def.size[1] * map.cell), ghostMat); },
    dispose() { scene.remove(group); for (const g of geoCache.values()) g.dispose(); for (const [id, it] of items) dropItem(id, it); for (const h of Object.values(herds)) { if (!h.userData.shared) h.geometry.dispose(); h.dispose(); } for (const set of Object.values(poseHerds)) for (const im of Object.values(set)) im.dispose(); for (const im of linked.values()) im.dispose(); poseMat.dispose(); mat.dispose(); ghostMat.dispose(); },
  };
}
