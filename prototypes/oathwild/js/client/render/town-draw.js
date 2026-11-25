// Oathwild — draws the towns planned by js/world/town.js (town round 2026-11-25). Houses are built storey by storey
// from Kenney's Fantasy Town Kit wall pieces (CC0, playground/assets/kenney/fantasy-town: windows, shutters, doors,
// half-timber bracing), on a plinth that meets the sloping ground, under a roof made here to fit the walls exactly
// (gable along the long side, overhanging eaves, ridge cap, a chimney that smokes). Yards get fences / hedges / low
// stone walls and clutter (the Survival Kit, playground/assets/kenney/survival); streets get lamps; the square its
// fountain and stalls; terraces their retaining walls.
//
// Colour: every Kenney piece samples one small palette picture. Its top quarter is empty, so we paint our own swatches
// there (plasters, roof colours, stones) and move each house's plaster / stone texture coordinates onto the swatch its
// plan picked — every house a different colour, still ONE material. Everything in a 48 m chunk is merged into one mesh
// per palette (two draw calls a chunk, whatever is in it).
//
//   const town = await createTownView({ T, plan, quality, tileGroup, chimneys })
//   town.stats   { houses, chunks, triangles, drawCalls }
//   town.leftovers  props this file does not draw (world.js places them: training dummies, weapon racks, banners)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL } from '../../world/town.js';

const ROOT = new URL('../../../../../', import.meta.url);           // the playground folder
const KIT = { town: 'assets/kenney/fantasy-town/', survival: 'assets/kenney/survival/' };
const CHUNK = 48;
const loader = new GLTFLoader();

// ---------------------------------------------------------------- our swatches in the palette's empty top band
// column → colour; row 0 (v 0..0.25 in glTF texture space, the picture's top quarter)
export const SWATCH = {
  plaster: ['#e9dcbf', '#dcbd84', '#e8d2c4', '#cfcac0'],   // cream, ochre, rose-white, grey wash
  roof: ['#9c4f39', '#6b7584', '#71503a', '#b39457'],      // terracotta, slate, shingle, straw thatch
  stone: 8, stoneDark: 9, timberDark: 10, timber: 11, soil: 12, leaf: 13, cloth: 14, water: 15,
};
const EXTRA = { 8: '#9b9285', 9: '#6e675e', 10: '#7a5638', 11: '#936c47', 12: '#5e4631', 13: '#5d7c39', 14: '#9b3b33', 15: '#5f93b4' };
function paintPalette(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const cw = img.width / 16, rh = img.height / 4;
  const cols = [...SWATCH.plaster, ...SWATCH.roof]; for (const [k, v] of Object.entries(EXTRA)) cols[+k] = v;
  cols.forEach((hex, i) => {
    if (!hex) return;
    const base = new THREE.Color(hex);
    const g = x.createLinearGradient(0, 0, 0, rh);
    g.addColorStop(0, '#' + base.clone().offsetHSL(0, -0.02, 0.07).getHexString());
    g.addColorStop(1, '#' + base.clone().offsetHSL(0, 0.03, -0.09).getHexString());
    x.fillStyle = g; x.fillRect(i * cw, 0, cw / 2, rh);
    const g2 = x.createLinearGradient(0, 0, 0, rh);
    g2.addColorStop(0, '#' + base.clone().offsetHSL(0.006, -0.03, 0.03).getHexString());
    g2.addColorStop(1, '#' + base.clone().offsetHSL(0.006, 0.02, -0.13).getHexString());
    x.fillStyle = g2; x.fillRect(i * cw + cw / 2, 0, cw / 2, rh);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
/** UV for a flat colour from swatch column `col`, row `row` (0 = ours), `t` 0..1 down the swatch. */
const sw = (col, row = 0, t = 0.5) => [(col + 0.5) / 16, (row + 0.12 + 0.76 * t) / 4];

// ---------------------------------------------------------------- loading pieces
const pieceCache = new Map();
async function piece(kit, id) {
  const key = kit + id;
  if (!pieceCache.has(key)) pieceCache.set(key, loader.loadAsync(new URL(KIT[kit] + id + '.glb', ROOT).href).then(g => {
    g.scene.updateMatrixWorld(true);
    const parts = [];
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      if (!mats[0]?.map) return;                                         // (a fountain's water has no picture: drawn here)
      for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
      parts.push(geo);
    });
    if (!parts.length) return null;
    const m = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    m.userData.texture = null;
    return m;
  }).catch(() => null));
  return pieceCache.get(key);
}
async function paletteImage(kit) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = new URL(KIT[kit] + 'Textures/colormap.png', ROOT).href; });
}

// ---------------------------------------------------------------- wall families per style
const FAMILY = {
  timber: { ground: ['wall', 'wall-window-shutters', 'wall-window-glass', 'wall'], upper: ['wall-detail-cross', 'wall-window-shutters', 'wall-detail-diagonal', 'wall-window-shutters', 'wall-detail-horizontal'], door: 'wall-door', plain: 'wall', small: 'wall-window-small' },   // (plain sides are plaster: the dark wood-panel piece read as black squares, owner #135)
  stone: { ground: ['wall', 'wall-window-stone', 'wall', 'wall-window-small'], upper: ['wall-window-stone', 'wall', 'wall-window-round', 'wall-window-stone'], door: 'wall-door', plain: 'wall', small: 'wall-window-small' },
  plaster: { ground: ['wall-window-glass', 'wall', 'wall-window-shutters'], upper: ['wall-window-shutters', 'wall', 'wall-window-glass', 'wall-window-shutters'], door: 'wall-door', plain: 'wall', small: 'wall-window-small' },
  wood: { ground: ['wall-wood', 'wall-wood-window-small', 'wall-wood-window-shutters'], upper: ['wall-wood-window-shutters', 'wall-wood-detail-cross', 'wall-wood'], door: 'wall-wood-door', plain: 'wall-wood', small: 'wall-wood-window-small' },
};
const PROP_UV = { '3,2': [8, 0], '15,3': [9, 0], '9,3': [11, 0], '11,3': [10, 0] };   // stone, dark stone, oak, dark oak
const LOW_SWAP = { 'wall-window-shutters': 'wall-window-small', 'wall-wood-window-shutters': 'wall-wood-window-small', 'wall-window-round': 'wall-window-small', 'wall-window-glass': 'wall-window-small' };
const PROP_PIECE = {
  lantern: ['town', 'lantern', 2.4], stall: ['town', 'stall-red', 3], 'stall-green': ['town', 'stall-green', 3], fountain: ['town', 'fountain-round-detail', 3],
  bench: ['town', 'stall-bench', 2.4], cart: ['town', 'cart', 2.6], barrel: ['survival', 'barrel', 3], crate: ['survival', 'box', 3.2], sacks: ['survival', 'box-open', 3],
  woodpile: ['survival', 'resource-planks', 4], workbench: ['survival', 'workbench', 3.6], bucket: ['survival', 'bucket', 3], tools: ['survival', 'tool-shovel', 3.4],
};

// ---------------------------------------------------------------- generated shapes (roofs, plinths, walls…)
function boxGeo(w, h, d, uvOf) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const n = g.attributes.position.count, uv = new Float32Array(n * 2), N = g.attributes.normal;
  for (let i = 0; i < n; i++) { const [u, v] = uvOf(N.getY(i), i); uv[i * 2] = u; uv[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const flat = (col, row = 0) => ny => sw(col, row, ny > 0.5 ? 0.2 : ny < -0.5 ? 0.9 : 0.55);
function triGeo(a, b, c, uv) {
  const g = new THREE.BufferGeometry();
  const P = [...a, ...b, ...c, ...a, ...c, ...b];                          // both faces
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute([...uv, uv[0], uv[1], uv[4], uv[5], uv[2], uv[3]], 2));   // one pair per vertex (a b c, then a c b)
  return g;
}

export async function createTownView({ T, plan, quality = 'medium', tileGroup, chimneys = [] }) {
  const low = quality === 'low';
  const [townImg, survImg] = await Promise.all([paletteImage('town'), paletteImage('survival')]);
  const mats = {
    town: new THREE.MeshLambertMaterial({ map: paintPalette(townImg) }),
    survival: new THREE.MeshLambertMaterial({ map: (() => { const t = new THREE.Texture(survImg); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.needsUpdate = true; return t; })() }),
  };
  mats.town.name = 'town kit'; mats.survival.name = 'town clutter';
  // load every piece we may use
  const want = new Set();
  for (const f of Object.values(FAMILY)) for (const id of [...f.ground, ...f.upper, f.door, f.plain, f.small]) { want.add('town:' + id); if (LOW_SWAP[id]) want.add('town:' + LOW_SWAP[id]); }
  for (const id of ['fence', 'hedge-large', 'banner-red', 'banner-green', 'overhang']) want.add('town:' + id);
  for (const [kit, id] of Object.values(PROP_PIECE)) want.add(kit + ':' + id);
  for (const id of ['grass-large', 'patch-grass']) want.add('survival:' + id);
  const P = {};
  await Promise.all([...want].map(async k => { const [kit, id] = k.split(':'); P[k] = await piece(kit, id); }));

  const chunks = new Map();     // key → { x, z, town: [], survival: [] }
  const chunkOf = (x, z) => { const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; if (!chunks.has(k)) chunks.set(k, { x, z, town: [], survival: [] }); return chunks.get(k); };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  /** Add a Kenney piece: scale (number or [sx, sy, sz]), turn about y, at a world spot; `uvMap` = { 'col,row': [col, row] }. */
  function add(kit, id, x, y, z, yaw, scale, uvMap = null, chunkAt = null) {
    const src = P[kit + ':' + id]; if (!src) return;
    const g = src.clone();
    Array.isArray(scale) ? S.set(...scale) : S.setScalar(scale);
    M.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, yaw), S);
    g.applyMatrix4(M);
    if (uvMap) remapUV(g, uvMap);
    (chunkAt ? chunkOf(...chunkAt) : chunkOf(x, z))[kit].push(g);
  }
  function addGen(g, x, y, z, yaw, chunkAt) { M.compose(V.set(x, y, z), Q.setFromAxisAngle(UP, yaw), S.setScalar(1)); g.applyMatrix4(M); (chunkAt ? chunkOf(...chunkAt) : chunkOf(x, z)).town.push(g); }
  function remapUV(g, map) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i), cu = Math.floor(u * 16), cv = Math.floor(v * 4), to = map[cu + ',' + cv];
      if (to) uv.setXY(i, u + (to[0] - cu) / 16, v + (to[1] - cv) / 4);
    }
  }

  // ---------------------------------------------------------------- houses
  let houses = 0;
  for (const h of plan.houses) {
    houses++;
    const fam = FAMILY[h.style] || FAMILY.timber;
    const [wc, dc] = h.cells, W = h.w, D = h.d, top = h.floorY + h.storeys * CELL;
    const c = Math.cos(h.facing), s = Math.sin(h.facing);
    const at = (lx, lz) => [h.at[0] + lx * c + lz * s, h.at[1] - lx * s + lz * c];
    const here = h.at;
    // plaster swatch for this house; stone houses take the stone swatch instead
    const wallTo = h.style === 'stone' ? [SWATCH.stone, 0] : [h.plaster % 4, 0];
    // Kenney's timber is a loud orange: our oak brown instead (frames, doors, shutters), the dark wood darker still
    const uvMap = { '3,2': wallTo, '15,3': [SWATCH.stoneDark, 0], '9,3': [SWATCH.timber, 0], '11,3': [SWATCH.timberDark, 0] };
    const rnd = (() => { let a = h.seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 10000) / 10000; }; })();
    const pick = list => { const id = list[Math.floor(rnd() * list.length)]; return low && LOW_SWAP[id] ? LOW_SWAP[id] : id; };
    // the four sides: [cell count, place cell i → local centre, the piece's turn]
    const sides = [
      { n: wc, at: i => [-W / 2 + CELL * (i + 0.5), -D / 2 + CELL / 2], yaw: Math.PI / 2, front: true },
      { n: wc, at: i => [-W / 2 + CELL * (i + 0.5), D / 2 - CELL / 2], yaw: -Math.PI / 2 },
      { n: dc, at: i => [-W / 2 + CELL / 2, -D / 2 + CELL * (i + 0.5)], yaw: Math.PI },
      { n: dc, at: i => [W / 2 - CELL / 2, -D / 2 + CELL * (i + 0.5)], yaw: 0 },
    ];
    for (let k = 0; k < h.storeys; k++) {
      const y = h.floorY + k * CELL;
      for (const sd of sides) for (let i = 0; i < sd.n; i++) {
        let id;
        if (k === 0 && sd.front && i === h.door.cell) id = fam.door;
        else if (!sd.front && rnd() < (low ? 0.75 : 0.55)) id = fam.plain;        // sides and backs: mostly plain wall (cost)
        else if (!sd.front) id = fam.small;
        else id = pick(k === 0 ? fam.ground : fam.upper);
        const [lx, lz] = sd.at(i), [wx, wz] = at(lx, lz);
        add('town', id, wx, y, wz, h.facing + sd.yaw, CELL, uvMap, here);
      }
    }
    // shop front: an awning over the door and a hanging banner beside it
    if (h.shop) {
      const [lx, lz] = sides[0].at(h.door.cell), [wx, wz] = at(lx, lz);
      add('town', 'overhang', wx, h.floorY, wz, h.facing + Math.PI / 2, CELL, null, here);
      const bi = h.door.cell + (h.door.cell + 1 < wc ? 1 : -1);
      if (bi >= 0 && bi < wc && h.storeys > 1) { const [bx, bz] = sides[0].at(bi), [ux, uz] = at(bx, bz); add('town', (h.seed % 2) ? 'banner-red' : 'banner-green', ux, h.floorY + CELL * 0.55, uz, h.facing + Math.PI / 2, CELL, null, here); }
    }
    // the roof: a gable along the long side, overhanging, from the wall rectangle (it cannot disagree with the walls)
    const alongX = W >= D, L = alongX ? W : D, Sp = alongX ? D : W, e = 0.45, gOver = 0.35, th = 0.22;
    const rise = (Sp / 2) * (0.78 + (h.seed % 7) * 0.04), ang = Math.atan2(rise, Sp / 2), slope = (Sp / 2 + e) / Math.cos(ang);
    const roofCol = h.roof % 4;
    for (const side of [-1, 1]) {
      const slab = boxGeo(L + gOver * 2, th, slope, ny => sw(4 + roofCol, 0, ny > 0.5 ? 0.25 : 0.85));
      // slab in the house frame: tilted about the ridge, its underside through the wall top at the eave line
      const m = new THREE.Matrix4();
      const tilt = new THREE.Matrix4().makeRotationX(side * ang);
      const off = new THREE.Matrix4().makeTranslation(0, th / 2, side * slope / 2);
      m.multiplyMatrices(tilt, off);
      slab.applyMatrix4(m);
      slab.translate(0, top + rise, 0);
      if (!alongX) slab.rotateY(Math.PI / 2);
      addGen(slab, here[0], 0, here[1], h.facing, here);
    }
    const ridge = boxGeo(L + gOver * 2 + 0.1, 0.24, 0.36, flat(SWATCH.timber)); ridge.translate(0, top + rise + 0.1, 0); if (!alongX) ridge.rotateY(Math.PI / 2); addGen(ridge, here[0], 0, here[1], h.facing, here);
    // gable triangles at both ends (the house's own plaster, or timber on a timber house)
    for (const end of [-1, 1]) {
      const gx = end * (L / 2 - 0.06), col = h.style === 'stone' ? SWATCH.stone : h.style === 'timber' ? h.plaster % 4 : h.plaster % 4;
      const tri = triGeo([gx, top, -Sp / 2], [gx, top, Sp / 2], [gx, top + rise, 0], [...sw(col, 0, 0.3), ...sw(col, 0, 0.3), ...sw(col, 0, 0.2)]);
      if (!alongX) tri.rotateY(Math.PI / 2);
      addGen(tri, here[0], 0, here[1], h.facing, here);
    }
    // plinth down to the lowest ground under the house (a house on a slope stands on a stone base)
    if (h.floorY - h.baseY > 0.12) { const pl = boxGeo(W + 0.24, h.floorY - h.baseY, D + 0.24, flat(SWATCH.stone)); pl.translate(0, h.baseY + (h.floorY - h.baseY) / 2, 0); addGen(pl, here[0], 0, here[1], h.facing, here); }
    // steps up to a raised door
    const [dx, dz] = h.door.at, streetY = T.heightAt(dx, dz), climb = h.floorY - streetY;
    if (climb > 0.28) {
      const n = Math.min(6, Math.ceil(climb / 0.2)), [lx] = sides[0].at(h.door.cell);
      for (let i = 0; i < n; i++) { const st = boxGeo(1.5, climb * (n - i) / n, 0.34, flat(SWATCH.stoneDark)); st.translate(lx, streetY + climb * (n - i) / n / 2 - 0.05, -D / 2 - 0.17 - 0.34 * i); addGen(st, here[0], 0, here[1], h.facing, here); }
    }
    // chimney through the roof by one gable end
    if (h.chimney) {
      const cxl = (h.seed % 2 ? 1 : -1) * (L / 2 - 1.1), ch = rise + 1.4;
      const chg = boxGeo(0.9, ch + 0.8, 0.9, flat(SWATCH.stoneDark)); chg.translate(cxl, top - 0.8 + (ch + 0.8) / 2, Sp * 0.12); if (!alongX) chg.rotateY(Math.PI / 2);
      addGen(chg, here[0], 0, here[1], h.facing, here);
      const lx = alongX ? cxl : Sp * 0.12, lz = alongX ? Sp * 0.12 : -cxl, [wx, wz] = at(lx, lz);
      chimneys.push({ x: wx, y: top + ch, z: wz });
    }
  }

  // ---------------------------------------------------------------- yards: fences, hedges, low walls; clutter; gardens
  for (const f of plan.fences) {
    const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], L = Math.hypot(dx, dz); if (L < 0.4) continue;
    const yaw = Math.atan2(dx, dz), n = Math.max(1, Math.round(L / 2.6)), seg = L / n;
    for (let i = 0; i < n; i++) {
      const mx = f.a[0] + dx * (i + 0.5) / n, mz = f.a[1] + dz * (i + 0.5) / n, y = T.heightAt(mx, mz) - 0.05;
      if (f.kind === 'stone') { const w = boxGeo(0.5, 0.95, seg + 0.05, flat(SWATCH.stone)); w.translate(0, 0.47, 0); addGen(w, mx, y, mz, yaw); const cap = boxGeo(0.62, 0.12, seg + 0.08, flat(SWATCH.stoneDark)); cap.translate(0, 1.0, 0); addGen(cap, mx, y, mz, yaw); }
      else if (f.kind === 'hedge') add('town', 'hedge-large', mx - Math.cos(yaw) * 0.3 * 2, y, mz + Math.sin(yaw) * 0.3 * 2, yaw - Math.PI / 2 + Math.PI / 2, [2, 2.2, seg], null);
      else add('town', 'fence', mx - Math.cos(yaw) * 0.46 * 3, y, mz + Math.sin(yaw) * 0.46 * 3, yaw, [3, 3, seg], null);
    }
  }
  const leftovers = [];
  for (const p of plan.props) {
    const [x, z] = p.at, y = p.y ?? T.heightAt(x, z);
    if (p.kind === 'garden') {
      const bed = boxGeo(2.2, 0.25, 1.4, flat(SWATCH.soil)); bed.translate(0, 0.08, 0); addGen(bed, x, y, z, p.facing);
      for (const o of [-0.7, 0, 0.7]) add('survival', 'grass-large', x + Math.cos(p.facing) * o, y + 0.18, z - Math.sin(p.facing) * o, p.facing + o, 3.2);
      continue;
    }
    if (p.kind === 'washing' || p.kind === 'coop') { add('survival', p.kind === 'washing' ? 'workbench' : 'bucket', x, y, z, p.facing, p.kind === 'washing' ? 3.6 : 3); continue; }
    if (p.kind === 'fountain') {
      add('town', 'fountain-round-detail', x, y, z, 0, CELL);
      const water = new THREE.CylinderGeometry(CELL * 0.86, CELL * 0.86, 0.1, 24).toNonIndexed();
      const n = water.attributes.position.count, uv = new Float32Array(n * 2); for (let i = 0; i < n; i++) { const [u, v] = sw(SWATCH.water, 0, 0.4); uv[i * 2] = u; uv[i * 2 + 1] = v; }
      water.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); water.translate(0, CELL * 0.33, 0); addGen(water, x, y, z, 0);
      continue;
    }
    const pp = p.kind === 'stall' && p.colour === 'green' ? PROP_PIECE['stall-green'] : PROP_PIECE[p.kind];
    // town-kit props take the same stone and oak as the houses (Kenney's lavender plaster and orange timber otherwise)
    if (pp) { add(pp[0], pp[1], x, y, z, p.facing || 0, pp[2], pp[0] === 'town' ? PROP_UV : null); continue; }
    leftovers.push(p);
  }
  // terrace walls under the level pads
  for (const w of plan.walls) {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), h = w.y1 - w.y0 + 0.5;
    const g = boxGeo(0.6, h, L + 0.4, flat(SWATCH.stone)); g.translate(0, w.y0 - 0.5 + h / 2, 0); addGen(g, (w.a[0] + w.b[0]) / 2, 0, (w.a[1] + w.b[1]) / 2, yaw);
    const cap = boxGeo(0.75, 0.14, L + 0.5, flat(SWATCH.stoneDark)); cap.translate(0, w.y1 + 0.07, 0); addGen(cap, (w.a[0] + w.b[0]) / 2, 0, (w.a[1] + w.b[1]) / 2, yaw);
  }

  // ---------------------------------------------------------------- merge per chunk
  let triangles = 0, drawCalls = 0;
  const meshes = [];
  for (const ch of chunks.values()) for (const kit of ['town', 'survival']) {
    if (!ch[kit].length) continue;
    const geo = mergeGeometries(ch[kit]);
    ch[kit].forEach(g => g.dispose());
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[kit]);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `town ${kit}`;
    tileGroup(ch.x, ch.z).add(mesh);
    meshes.push(mesh);
    triangles += geo.attributes.position.count / 3; drawCalls++;
  }
  return { stats: { houses, chunks: chunks.size, triangles: Math.round(triangles), drawCalls }, leftovers, meshes, materials: mats };
}

// Shared with js/client/render/bridge-draw.js (bridge newels and lantern posts): the same piece loader and painted palette.
export { piece as kenneyPiece, paletteImage as kenneyPaletteImage, paintPalette as kenneyPalette };
