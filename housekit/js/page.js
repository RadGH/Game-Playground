// House Kit review page. Every house here goes through the same two steps as Oathwild's towns: describeHouse()
// (js/describe.js, pure) → kit.addParts() (js/build.js, three.js, one atlas material).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { el } from '../../shared/ui.js';
import { fmt } from '../../shared/format.js';
import { stopPageZoom } from '../../shared/no-zoom.js';
import { loadHouseKit } from './build.js';
import { describeHouse, describeFence, describeProp, houseFromKnobs, familyCells, rng } from './describe.js';

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const DECO_NAMES = {
  windowBox: 'Window boxes', shutters: 'Painted shutters', corners: 'Corner beams', floorBeams: 'Floor beams', gableBraces: 'Gable beams',
  ivy: 'Ivy', doorLantern: 'Door lantern', rainBarrel: 'Rain barrel', woodpile: 'Woodpile', dormer: 'Dormers', balcony: 'Balcony',
  porch: 'Porch', canopy: 'Door canopy', finials: 'Finials', chimneyPots: 'Chimney pots', doorFrame: 'Door frame',
};
const KIND_NAMES = { house: 'House', inn: 'Inn', tower: 'Watch tower', smithy: 'Smithy', chapel: 'Chapel' };

const state = {
  mode: ['one', 'gallery', 'street', 'pieces'].includes(Q.get('mode')) ? Q.get('mode') : 'one',
  kind: 'house', style: 'timber', wc: 3, dc: 2, storeys: 2, roofKind: 'clay', plaster: 0, slope: 0.15, seed: 4127,
  trade: '', jetty: true, chimney: true, quality: ['low', 'medium', 'high'].includes(Q.get('quality')) ? Q.get('quality') : 'medium',
  game: Q.get('house') || '', force: {}, mseed: 1,
};

// ---------------------------------------------------------------- three.js stage
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
stage.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#bcd3e2');
scene.fog = new THREE.Fog('#bcd3e2', 120, 320);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
scene.add(new THREE.HemisphereLight('#e8f0ff', '#6a5a40', 1.15));
const sun = new THREE.DirectionalLight('#fff1d6', 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const content = new THREE.Group(); scene.add(content);

function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#7d9a52'; x.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 1400; i++) { x.fillStyle = `hsl(${78 + r() * 26}, ${32 + r() * 20}%, ${30 + r() * 22}%)`; x.fillRect(r() * 256, r() * 256, 2 + r() * 5, 2 + r() * 5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const grassMat = new THREE.MeshLambertMaterial({ map: grassTexture() });
/** A ground patch whose height follows f(x, z). */
function groundMesh(x0, z0, x1, z1, f, step = 2) {
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < P.count; i++) { P.setY(i, f(P.getX(i), P.getZ(i))); uv.setXY(i, P.getX(i) / 6, P.getZ(i) / 6); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, grassMat); m.receiveShadow = true; return m;
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- the kit (one per quality: Low uses the small atlas)
const kits = {};
const kitFor = q => kits[q] || (kits[q] = loadHouseKit({ quality: q }));
let kit = null, snapshots = [];

// ---------------------------------------------------------------- labels drawn over the 3D view (never browser tooltips)
const labels = [];
function label(text, pos, cls = '') { const d = el('div', { class: 'hk-label ' + cls, text }); $('labels').append(d); labels.push({ d, pos: pos.clone() }); }
const _v = new THREE.Vector3();
function placeLabels() {
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const L of labels) {
    _v.copy(L.pos).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    L.d.style.display = vis ? '' : 'none';
    if (vis) L.d.style.left = ((_v.x + 1) / 2 * w) + 'px', L.d.style.top = ((1 - _v.y) / 2 * h) + 'px';
  }
}

// ---------------------------------------------------------------- building content
let built = { houses: 0, parts: 0, tris: 0 };
function clear() {
  for (const o of [...content.children]) { content.remove(o); o.traverse(m => { if (m.isMesh && m.geometry) m.geometry.dispose(); }); }
  for (const L of labels) L.d.remove(); labels.length = 0;
  built = { houses: 0, parts: 0, tris: 0 };
}
function meshOf(sink) { const m = new THREE.Mesh(sink.geometry(), kit.material); m.castShadow = m.receiveShadow = true; built.tris += sink.n; return m; }
function houseInto(sink, h, ctx) {
  const d = describeHouse(h, kit.S, { quality: state.quality, ...ctx });
  kit.addParts(sink, d.parts, { at: h.at, facing: h.facing, y0: h.floorY });
  built.houses++; built.parts += d.parts.length;
  return d;
}
function frame(radius, centre = new THREE.Vector3(), keep = false) {
  sun.position.set(centre.x + radius * 0.7, centre.y + radius * 1.4, centre.z + radius * 0.9); sun.target.position.copy(centre);
  const s = sun.shadow.camera; s.left = s.bottom = -radius * 1.2; s.right = s.top = radius * 1.2; s.near = 1; s.far = radius * 4; s.updateProjectionMatrix();
  if (keep) return;
  controls.target.copy(centre);
  camera.position.set(centre.x - radius * 0.9, centre.y + radius * 0.65, centre.z - radius * 1.25);
  controls.update();
}

/** The house the knobs describe (or a landmark, or a game house snapshot). */
function knobHouse() {
  return houseFromKnobs({ kind: state.kind === 'house' ? undefined : state.kind, style: state.style, wc: state.wc, dc: state.dc, storeys: state.storeys,
    roofKind: state.kind === 'house' ? state.roofKind : undefined, plaster: state.plaster, slope: state.slope, seed: state.seed,
    trade: state.trade || undefined, jetty: state.jetty, chimney: state.chimney }, kit.S);
}

let lastLook = null;
function buildOne(keepCam) {
  const sink = kit.sink();
  let h, ctx, f;
  const snap = state.game && snapshots.find(s => s.house.id === state.game);
  if (snap) {
    // a house from the game, moved to the middle: exactly its plan record + context
    h = { ...snap.house, at: [0, 0], facing: 0 };
    const dy = h.floorY; h = { ...h, floorY: 0, baseY: h.baseY - dy };
    ctx = { ...snap.ctx, streetY: snap.ctx.streetY - dy, yard: snap.ctx.yard ? { ...snap.ctx.yard, y: snap.ctx.yard.y - dy } : null, force: state.force };
    const sy = ctx.streetY;
    f = (x, z) => z < -h.d / 2 ? Math.min(-0.1, sy) : h.baseY + 0.25;
  } else {
    h = knobHouse();
    ctx = { streetY: h._ground(h.door.at[0], h.door.at[1]), yard: { d: 5, y: h._ground(0, h.d / 2 + 2.5) }, force: state.force };
    f = h._ground;
  }
  const d = houseInto(sink, h, ctx);
  lastLook = d.look;
  content.add(meshOf(sink));
  const gm = groundMesh(-22, -22, 22, 22, (x, z) => f(x, z) - 0.03, 1); content.add(gm);
  // a strip of street in front of the door
  const st = kit.sink();
  kit.addParts(st, [{ s: 'box', m: 'cobbles', t: '#d8d0c4', w: 44, h: 0.3, d: 4, p: [0, (ctx.streetY ?? 0) - 0.12, -h.d / 2 - 3.2] }]);
  content.add(meshOf(st));
  frame(Math.max(h.w, h.d, h.storeys * 3) * 1.25 + 4, new THREE.Vector3(0, h.floorY + h.storeys * 1.4, 0), keepCam);
  showLook(d.look, h);
}

function galleryHouse(style, seed, at) {
  const r = rng(seed * 977 + 13);
  return houseFromKnobs({ style, wc: 2 + Math.floor(r() * 2), dc: 2, storeys: 1 + Math.floor(r() * 3), roof: Math.floor(r() * 4), plaster: Math.floor(r() * 4),
    seed: seed * 7919 + style.length, shop: r() < 0.4, jetty: r() < 0.5, chimney: r() < 0.85, at, slope: 0 }, kit.S);
}
function buildGallery() {
  const styles = Object.keys(kit.S.styles), sink = kit.sink(), gap = 15;
  styles.forEach((style, row) => {
    for (let i = 0; i < 3; i++) {
      const seed = state.mseed + i, at = [i * gap, row * gap];
      const h = galleryHouse(style, seed, at);
      houseInto(sink, h, { streetY: -0.12, yard: { d: 5, y: 0 } });
      label(`seed ${seed}`, new THREE.Vector3(at[0], h.storeys * 3 + 5.2, at[1]));
    }
    label(kit.S.styles[style].label, new THREE.Vector3(2 * gap + 10, 2, row * gap), 'row');
  });
  // the landmarks get a row of their own
  const lrow = styles.length;
  Object.keys(kit.S.landmarks).filter(k => !k.startsWith('_')).forEach((k, i) => {
    const at = [i * gap * 1.2 - 4, lrow * gap + 4];
    const h = houseFromKnobs({ kind: k, seed: state.mseed * 31 + i, at, slope: 0 }, kit.S);
    houseInto(sink, h, { streetY: -0.12, yard: { d: 5, y: 0 } });
    label(kit.S.landmarks[k].label, new THREE.Vector3(at[0], h.storeys * 3 + 6, at[1]));
  });
  label('Landmarks', new THREE.Vector3(2 * gap + 14, 2, lrow * gap + 4), 'row');
  content.add(meshOf(sink));
  content.add(groundMesh(-16, -10, 3 * gap + 6, (lrow + 1) * gap + 6, () => -0.03, 4));
  frame(48, new THREE.Vector3(gap, 0, lrow * gap / 2));
}

/** A short street on a slope, the way a town strings houses: terraces with alleys, yards and fences behind, lamps. */
function buildStreet() {
  const sink = kit.sink(), r = rng(state.mseed * 131 + 7), S = kit.S, C = S.cell;
  const g = (x, z) => x * 0.07 + Math.max(0, Math.abs(z) - 3) * 0.14;      // climbs along the street and away from it
  const styles = ['timber', 'timber', 'plaster', 'stone', 'plaster', 'wood'];
  for (const side of [1, -1]) {
    let x = -36;
    while (x < 34) {
      const run = 2 + Math.floor(r() * 3);
      for (let k = 0; k < run && x < 34; k++) {
        const wc = 2 + Math.floor(r() * 2), dc = 2 + (r() < 0.35 ? 1 : 0), W = wc * C, D = dc * C;
        const cx = x + W / 2, cz = side * (3.4 + D / 2), facing = side > 0 ? 0 : Math.PI;
        // footprint heights → floor and plinth (like the town planner)
        let lo = Infinity, hi = -Infinity;
        for (const [lx, lz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2], [0, 0]]) { const y = g(cx + lx, cz + side * lz); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        const doorCell = wc <= 2 ? Math.floor(r() * 2) : 1;
        const dlx = -W / 2 + C * (doorCell + 0.5), doorAt = [cx + dlx * (side > 0 ? 1 : -1), side * 2.3];
        const h = {
          id: 'st' + side + '_' + Math.round(x), at: [cx, cz], w: W, d: D, facing, cells: [wc, dc], storeys: 1 + Math.floor(r() * 3),
          floorY: hi + 0.12, baseY: lo - 0.25, style: styles[Math.floor(r() * styles.length)], roof: Math.floor(r() * 4), plaster: Math.floor(r() * 4),
          door: { cell: doorCell, at: doorAt }, shop: r() < 0.35, jetty: r() < 0.5, chimney: r() < 0.8, seed: Math.floor(r() * 1e6),
        };
        if (h.storeys < 2) h.jetty = false;
        const yardD = 4 + Math.floor(r() * 3), yz = cz + side * (D / 2 + yardD / 2);
        houseInto(sink, h, { streetY: g(...doorAt), yard: { d: yardD, y: g(cx, yz) } });
        // the yard: fence on its three open sides, a gate, some clutter
        const kind = ['wood', 'hedge', 'stone'][Math.floor(r() * 3)];
        const x0 = cx - W / 2 + 0.1, x1 = cx + W / 2 - 0.1, z0 = cz + side * D / 2, z1 = cz + side * (D / 2 + yardD);
        for (const [a, b] of [[[x0, z0], [x0, z1]], [[x1, z0], [x1, z1]], [[x0, z1], [cx - 0.8, z1]], [[cx + 0.8, z1], [x1, z1]]]) kit.addParts(sink, describeFence({ a, b, kind }, S, { groundAt: g }));
        const clutter = ['barrel', 'crate', 'garden', 'washing', 'coop', 'sacks', 'woodpile'][Math.floor(r() * 7)];
        const parts = describeProp({ kind: clutter, at: [cx + (r() - 0.5) * (W - 3), cz + side * (D / 2 + yardD * 0.6)], facing: facing + (r() - 0.5) * 0.5, y: g(cx, cz + side * (D / 2 + yardD * 0.6)) }, S);
        if (parts) kit.addParts(sink, parts);
        if (h.shop) for (const o of [-W / 2 + 0.7, W / 2 - 0.7]) { const px = cx + o * (side > 0 ? 1 : -1), pz = side * 2.85; kit.addParts(sink, describeProp({ kind: r() < 0.5 ? 'barrel' : 'crate', at: [px, pz], facing, y: g(px, pz) }, S)); }
        x += W;
      }
      x += 3 + r() * 2;                                                 // an alley
    }
  }
  // the street itself (cobbles following the slope) and lamps along it
  const st = [];
  for (let x = -38; x < 38; x += 2) st.push({ s: 'box', m: 'cobbles', t: '#d8d0c4', w: 2.05, h: 0.4, d: 5.4, p: [x + 1, g(x + 1, 0) - 0.18, 0], r: [0, 0, Math.atan(0.07)] });
  kit.addParts(sink, st);
  for (let x = -30; x < 34; x += 14) for (const side of [1, -1]) { const z = side * 2.95, px = x + (side > 0 ? 0 : 7); kit.addParts(sink, describeProp({ kind: 'lantern', at: [px, z], y: g(px, z) }, S)); }
  content.add(meshOf(sink));
  content.add(groundMesh(-44, -24, 44, 24, (x, z) => g(x, z) - 0.05, 1.5));
  frame(34, new THREE.Vector3(0, 3, 0));
  camera.position.set(-30, 18, -26); controls.update();
}

/** Every piece the kit has, one by one, labelled (laid out on shelves, each piece as wide as it needs). */
function buildPieces() {
  const S = kit.S, rowW = 64;
  let cx = 0, cz = 0, rowD = 0, maxX = 0;
  const put = (parts, name, yaw = 0) => {
    const sink = kit.sink(); kit.addParts(sink, parts);
    if (!sink.n) return;
    const m = meshOf(sink); m.rotation.y = yaw; m.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    const w = Math.max(2.4, size.x) + 2.6, d = Math.max(2.4, size.z) + 3.2;
    if (cx + w > rowW && cx > 0) { cx = 0; cz += rowD; rowD = 0; }
    const x = cx + w / 2, z = cz + d / 2;
    m.position.set(x - c.x, -bb.min.y, z - c.z);
    content.add(m);
    label(name, new THREE.Vector3(x, size.y + 0.45, z - size.z / 2));
    cx += w; rowD = Math.max(rowD, d); maxX = Math.max(maxX, cx);
    built.parts += parts.length;
  };
  // the wall pieces of every family, as their style dresses them
  const seen = new Set();
  for (const [fid, f] of Object.entries(S.families)) {
    if (fid.startsWith('_')) continue;
    const st = Object.values(S.styles).find(s => s.family === fid);
    const cells = familyCells(S, Object.keys(S.styles).find(k => S.styles[k] === st));
    for (const id of new Set([...f.ground, ...f.upper, f.door, f.plain, f.small])) {
      if (seen.has(fid + id)) continue; seen.add(fid + id);
      const parts = [{ s: 'kit', kit: 'town', id, p: [0, 0, 0], r: [0, 0, 0], sc: [3, 3, 3], cells }];
      const g = S.windowGlass[id]; if (g) parts.push({ s: 'quad', m: 'glass', t: S.glassTint, w: g[0] * 6 + 0.08, h: (g[2] - g[1]) * 3 + 0.06, p: [1.28, (g[1] + g[2]) * 1.5, 0], r: [0, Math.PI / 2, 0] });
      put(parts, `${st.label}: ${id.replace(/^wall-?/, '').replace(/^wood-?/, '').replace(/-/g, ' ') || 'plain wall'}`, -Math.PI / 2);
    }
  }
  // every decoration and part of a house, grouped by what it is (from a few houses with everything switched on)
  const all = Object.fromEntries(Object.keys(DECO_NAMES).map(k => [k, true]));
  const groups = new Map();
  const take = (h, ctx) => { for (const p of describeHouse(h, S, { quality: state.quality, force: all, ...ctx }).parts) { if (!groups.has(p.tag)) groups.set(p.tag, []); const g = groups.get(p.tag); if (g.src === undefined) g.src = h.id; if (g.src === h.id) g.push(p); } };
  const base = { slope: 0.25, wc: 3, dc: 3, storeys: 3, jetty: true, chimney: true };
  take(houseFromKnobs({ ...base, id: 't', style: 'timber', seed: 11, trade: 'baker' }, S), { streetY: -1.2, yard: { d: 5, y: -0.5 } });
  take(houseFromKnobs({ ...base, id: 's', style: 'stone', seed: 12, roofKind: 'slate' }, S), { streetY: -1.2, yard: { d: 5, y: -0.5 } });
  take(houseFromKnobs({ ...base, id: 'th', style: 'plaster', seed: 13, roofKind: 'thatch', jetty: false }, S), { streetY: -1.2, yard: { d: 5, y: -0.5 } });
  for (const k of Object.keys(S.landmarks)) if (!k.startsWith('_')) take(houseFromKnobs({ id: k, kind: k, seed: 5 }, S), { streetY: -0.12, yard: { d: 5, y: 0 } });
  for (const [tag, parts] of groups) {
    if (['front wall', 'wall'].includes(tag)) continue;               // (shown piece by piece above)
    // move the group to the house origin it came from (it was described in that house's frame)
    put(parts, tag.replace(/^./, c => c.toUpperCase()));
  }
  // yard and street props
  for (const kind of ['lantern', 'stall', 'fountain', 'bench', 'cart', 'barrel', 'crate', 'sacks', 'workbench', 'bucket', 'tools', 'garden', 'washing', 'coop', 'woodpile'])
    put(describeProp({ kind, at: [0, 0], facing: 0, y: 0 }, S), kind.replace(/^./, c => c.toUpperCase()));
  for (const kind of ['wood', 'hedge', 'stone']) put(describeFence({ a: [0, -2.6], b: [0, 2.6], kind }, S, { groundAt: () => 0 }), { wood: 'Fence', hedge: 'Hedge', stone: 'Low stone wall' }[kind]);
  const D = cz + rowD;
  content.add(groundMesh(-3, -3, maxX + 3, D + 3, () => -0.02, 4));
  frame(Math.max(maxX, D) * 0.45, new THREE.Vector3(maxX / 2, 0, 10), true);
  controls.target.set(maxX / 2, 0, 8); camera.position.set(maxX / 2, 22, -16); controls.update();
}

// ---------------------------------------------------------------- the panel
function showLook(L, h) {
  const S = kit.S;
  const style = S.styles[L.style], roof = S.roofs[L.roof];
  const bits = [`<b>${style.label}</b>, ${h.cells[0]} × ${h.cells[1]} cells, ${h.storeys} ${h.storeys === 1 ? 'storey' : 'storeys'}`, `${roof.label} roof`];
  if (L.kind) bits.unshift(`<b>${KIND_NAMES[L.kind]}</b>`);
  if (L.trade) bits.push(`sign: ${S.trades[L.trade].label}`);
  $('summary').innerHTML = bits.join(' · ');
  $('deco').replaceChildren(...Object.keys(DECO_NAMES).map(k => {
    const b = el('button', { type: 'button', class: 'hk-chip' + (L.deco[k] ? ' on' : ''), 'aria-pressed': String(!!L.deco[k]), text: DECO_NAMES[k] });
    b.addEventListener('click', () => { state.force[k] = !L.deco[k]; rebuild(true); });
    return b;
  }));
}

function chips(box, items, get, set, cls = 'hk-chip') {
  box.replaceChildren(...items.map(([v, text]) => {
    const b = el('button', { type: 'button', class: cls, role: 'radio', 'aria-checked': String(get() === v), text });
    b.addEventListener('click', () => { set(v); syncPanel(); rebuild(); });
    return b;
  }));
}
function syncPanel() {
  const S = kit.S;
  for (const b of $('modes').children) b.setAttribute('aria-selected', String(b.dataset.mode === state.mode));
  for (const c of document.querySelectorAll('[data-for]')) c.hidden = !c.dataset.for.split(' ').includes(state.mode);
  const isHouse = state.kind === 'house' && !state.game;
  chips($('kind'), Object.entries(KIND_NAMES), () => (state.game ? '' : state.kind), v => { state.kind = v; state.game = ''; state.force = {}; });
  chips($('style'), Object.entries(S.styles).map(([k, s]) => [k, s.label]), () => state.style, v => { state.style = v; state.roofKind = S.styles[v].roofs[0]; state.force = {}; });
  chips($('roof'), Object.entries(S.roofs).filter(([k]) => !k.startsWith('_')).map(([k, r]) => [k, r.label]), () => state.roofKind, v => { state.roofKind = v; });
  $('plaster').replaceChildren(...S.styles[state.style].plasters.map((c, i) => {
    const b = el('button', { type: 'button', class: 'hk-swatch', role: 'radio', 'aria-checked': String(state.plaster === i), 'aria-label': `Wall colour ${i + 1}`, style: { background: c } });
    b.addEventListener('click', () => { state.plaster = i; syncPanel(); rebuild(true); });
    return b;
  }));
  const steps = [['wc', 'Wide', 1, 5, 'cells'], ['dc', 'Deep', 1, 4, 'cells'], ['storeys', 'Storeys', 1, 4, '']];
  $('sizes').replaceChildren(...steps.map(([k, name, lo, hi, unit]) => {
    const minus = el('button', { type: 'button', 'aria-label': `Less ${name.toLowerCase()}`, text: '−' }), plus = el('button', { type: 'button', 'aria-label': `More ${name.toLowerCase()}`, text: '+' });
    minus.disabled = state[k] <= lo || !isHouse; plus.disabled = state[k] >= hi || !isHouse;
    minus.addEventListener('click', () => { state[k]--; syncPanel(); rebuild(true); }); plus.addEventListener('click', () => { state[k]++; syncPanel(); rebuild(true); });
    return el('div', { class: 'hk-step' }, el('span', { text: name }), minus, el('b', { text: k === 'storeys' ? String(state[k]) : `${state[k]} (${state[k] * S.cell} m)` }), plus);
  }));
  $('slope').value = state.slope; $('slope-v').textContent = fmt(state.slope * 100) + '%';
  $('seed').value = state.seed;
  $('jetty').setAttribute('aria-pressed', String(state.jetty)); $('chimney').setAttribute('aria-pressed', String(state.chimney));
  $('trade').value = state.trade;
  $('game-house').value = state.game;
  for (const b of $('quality').children) b.setAttribute('aria-checked', String(b.dataset.v === state.quality));
  $('mseed').textContent = `${state.mseed}–${state.mseed + 2}`;
  const T = { gallery: ['Gallery', 'Every style with three seeds each, and the landmark buildings. Step the seeds to see more.'],
    street: ['Street', 'A short street on a hill, strung the way a town does it: terraces with alleys, yards and fences behind, lamps along the cobbles.'],
    pieces: ['Pieces', 'Every wall piece of every style and every decoration the kit can add, one by one and labelled.'] }[state.mode];
  if (T) { $('mode-title').textContent = T[0]; $('mode-text').textContent = T[1]; }
}

function wire() {
  for (const b of $('modes').children) b.addEventListener('click', () => { state.mode = b.dataset.mode; syncPanel(); rebuild(); });
  $('slope').addEventListener('input', () => { state.slope = +$('slope').value; $('slope-v').textContent = fmt(state.slope * 100) + '%'; rebuild(true); });
  $('seed').addEventListener('change', () => { state.seed = Math.max(0, Math.min(999999, Math.round(+$('seed').value || 0))); state.force = {}; rebuild(true); });
  $('seed-prev').addEventListener('click', () => { state.seed = Math.max(0, state.seed - 1); state.force = {}; syncPanel(); rebuild(true); });
  $('seed-next').addEventListener('click', () => { state.seed++; state.force = {}; syncPanel(); rebuild(true); });
  $('seed-dice').addEventListener('click', () => { state.seed = Math.floor(Math.random() * 999999); state.force = {}; syncPanel(); rebuild(true); });
  $('mseed-prev').addEventListener('click', () => { state.mseed = Math.max(1, state.mseed - 3); syncPanel(); rebuild(); });
  $('mseed-next').addEventListener('click', () => { state.mseed += 3; syncPanel(); rebuild(); });
  $('jetty').addEventListener('click', () => { state.jetty = !state.jetty; syncPanel(); rebuild(true); });
  $('chimney').addEventListener('click', () => { state.chimney = !state.chimney; syncPanel(); rebuild(true); });
  $('trade').addEventListener('change', () => { state.trade = $('trade').value; rebuild(true); });
  $('game-house').addEventListener('change', () => { state.game = $('game-house').value; state.force = {}; syncPanel(); rebuild(); });
  for (const b of $('quality').children) b.addEventListener('click', async () => { state.quality = b.dataset.v; syncPanel(); kit = await kitFor(state.quality); rebuild(true); });
}

let pending = null;
function rebuild(keepCam = false) {
  if (!kit) return;
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    clear();
    if (state.mode === 'one') buildOne(keepCam);
    else if (state.mode === 'gallery') buildGallery();
    else if (state.mode === 'street') buildStreet();
    else buildPieces();
    const u = new URL(location.href); u.searchParams.set('mode', state.mode); if (state.game) u.searchParams.set('house', state.game); else u.searchParams.delete('house'); history.replaceState(null, '', u);
  });
}

// ---------------------------------------------------------------- loop + numbers
let frames = 0, statsShown = '';
function stats() { const r = renderer.info.render; return { drawCalls: r.calls, triangles: r.triangles, houses: built.houses, parts: built.parts, built: built.tris }; }
function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.info.reset();
  renderer.render(scene, camera);
  placeLabels();
  if (++frames % 15 === 0 && kit) {
    const s = stats(), A = kit.A;
    const rows = [['Draw calls', fmt(s.drawCalls)], ['Triangles', fmt(s.triangles)], ['Houses', fmt(s.houses)], ['Parts', fmt(s.parts)]];
    const key = JSON.stringify(rows);
    if (key !== statsShown) {
      statsShown = key;
      $('hud').replaceChildren(...rows.slice(0, 2).flatMap(([a, b]) => [el('dt', { text: a }), el('dd', { text: b })]));
      const painted = Object.values(A.tiles).filter(t => t.source === 'codex').length;
      $('stats').replaceChildren(...[...rows, ['Texture picture', `${fmt(state.quality === 'low' ? A.size / 2 : A.size)} px`], ['Painted textures', `${painted} of ${Object.keys(A.tiles).length}`]].flatMap(([a, b]) => [el('dt', { text: a }), el('dd', { text: b })]));
    }
  }
}

// ---------------------------------------------------------------- start
window.__hk = { ready: false, state, stats, set: (o) => { Object.assign(state, o); syncPanel(); rebuild(); } };
(async () => {
  stopPageZoom();
  resize();
  kit = await kitFor(state.quality);
  snapshots = await fetch(new URL('../data/larkford.json', import.meta.url)).then(r => (r.ok ? r.json() : { houses: [] })).then(j => j.houses || []).catch(() => []);
  $('trade').replaceChildren(el('option', { value: '', text: 'Not a shop' }), ...Object.entries(kit.S.trades).filter(([k]) => !k.startsWith('_')).map(([k, t]) => el('option', { value: k, text: `${t.label} (sign: ${t.sign})` })));
  $('game-house').replaceChildren(el('option', { value: '', text: snapshots.length ? `— pick one of ${snapshots.length} —` : '— none saved —' }),
    ...snapshots.map((s, i) => el('option', { value: s.house.id, text: `House ${i + 1}: ${kit.S.styles[s.house.style]?.label || s.house.style}, ${s.house.cells[0]}×${s.house.cells[1]}, ${s.house.storeys} storeys${s.house.shop ? ', shop' : ''}` })));
  wire(); syncPanel(); rebuild();
  loop();
  requestAnimationFrame(() => requestAnimationFrame(() => { $('loading').classList.add('gone'); window.__hk.ready = true; }));
})().catch(e => { $('loading').textContent = 'The kit did not load: ' + e.message; console.error(e); });
