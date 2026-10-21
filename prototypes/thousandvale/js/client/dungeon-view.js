// A dungeon instance drawn from `joined.room.dungeon` (protocol §10.3): floors laid side by side, each a
// w × h grid of `cell`-metre tiles (1 floor, 0 wall) sent as run lengths.
//
// Floors are one instanced flagstone tile per walkable cell; walls are instanced blocks on every wall cell
// that touches a floor (the solid rock beyond is never drawn). Torches stand on walls next to room
// centres; each torch is a source in the page's fixed light pool (lightpool.js), which lights the nearest few.
// Also returns the two terrain functions the client needs: `ground` (always 0 — dungeon floors are flat,
// the same as the server's js/sim/dungeon.js dungeonTerrain) and `cameraHeight` (wall tops count as high
// ground, so the third-person camera pulls in instead of looking through rock).

import * as THREE from 'three';
import { makeSurface } from '../../../../highdef-3d/js/kit/textures.js';
import { unrleTiles, dungeonTerrain } from '../sim/dungeon.js';
import { makeGlowTexture } from './decor.js';
import { LIGHTS } from './lightpool.js';
import { DUNGEON_AMBIENT } from './daynight.js';
import { perf } from './perf.js';
const DTEX = new Map();

import { buildProp, buildGroundDetail } from '../../../../highdef-3d/js/kit/rocks.js';

const WALL_H = 4.2;
/**
 * The sixteen dungeon looks — eight Torbor + eight Vharlen (stream E's `plan.look`; the family picks one when no
 * look is sent). Each is surfaces + tints + light colour + fog + the props that dress its rooms.
 */
export const LOOKS = {
  crypt:   { floor: 'cobble', wall: 'cliff', fT: '#9aa0b0', wT: '#a2a6b4', torch: '#ffa552', fog: '#07060c', wallH: 4.2, props: ['skull_totem', 'stone_marker', 'stone_step'], ground: ['bone_scatter', 'lichen_patch'], tombs: true },
  warren:  { floor: 'gravel', wall: 'rock', fT: '#a88a6a', wT: '#b08a66', torch: '#ffb066', fog: '#0a0705', wallH: 3.8, props: ['cart_wheel', 'wood_pile', 'crate', 'barrel'], ground: ['ash_patch'], beams: true },
  flooded: { floor: 'mud', wall: 'moss', fT: '#7fa0a6', wT: '#7f9ea0', torch: '#9fd8ff', fog: '#050a0c', wallH: 4.6, props: ['barrel', 'stone_step'], ground: ['puddle_ring'], water: true },
  ruin:    { floor: 'cobble', wall: 'cliff', fT: '#a59c90', wT: '#b0a698', torch: '#ffa552', fog: '#08070a', wallH: 5.0, props: ['ruined_pillar', 'banner_pole', 'crate', 'barrel'], ground: ['ash_patch'] },
  cave:    { floor: 'gravel', wall: 'rock', fT: '#8f8a80', wT: '#8a857a', torch: '#ff9a50', fog: '#060606', wallH: 5.4, props: ['stone_marker'], ground: ['mushroom_ring', 'pine_cone_scatter'], boulders: true, glow: '#7fe8ff', rough: 0.22 },
  vault:   { floor: 'cobble', wall: 'cliff', fT: '#b0a8a0', wT: '#c0b8ae', torch: '#c9a8ff', fog: '#08060e', wallH: 5.2, props: ['rune_stone', 'ruined_pillar'], ground: ['lichen_patch'] },
  barrow:  { floor: 'dirt', wall: 'moss', fT: '#8e9a7e', wT: '#7e8a6e', torch: '#ffb070', fog: '#070806', wallH: 3.4, props: ['stone_marker', 'dolmen'], ground: ['root_mat', 'lichen_patch'] },
  hollow:  { floor: 'cobble', wall: 'cliff', fT: '#b8a77e', wT: '#b8a77e', torch: '#ffd56a', fog: '#0a0806', wallH: 5.6, props: ['ruined_arch', 'ruined_pillar'], ground: ['lichen_patch', 'root_mat'] },
  // Vharlen (EXPANSION-1 §8) — same surfaces and kit props, volcanic tints and lights
  lava:    { floor: 'gravel', wall: 'rock', fT: '#5a524c', wT: '#3c3734', torch: '#ff7a2a', fog: '#0c0503', wallH: 5.2, props: ['stone_marker', 'fire_ring'], ground: ['ash_patch'], glow: '#ff6a1a', rough: 0.2 },
  steam:   { floor: 'mud', wall: 'moss', fT: '#7a9484', wT: '#4f6a5a', torch: '#e8f4ff', fog: '#121815', wallH: 5.0, props: ['stone_marker', 'rune_stone', 'stone_step'], ground: ['puddle_ring', 'lichen_patch', 'mushroom_ring'], water: true, rough: 0.12 },
  sulphur: { floor: 'gravel', wall: 'rock', fT: '#c8b860', wT: '#b8a548', torch: '#ffe070', fog: '#0c0a03', wallH: 3.8, props: ['cart_wheel', 'crate', 'barrel', 'wood_pile'], ground: ['ash_patch', 'sand_ripple'], beams: true, glow: '#e8e040' },
  vent:    { floor: 'mud', wall: 'moss', fT: '#6e6852', wT: '#5a5848', torch: '#b8e0a0', fog: '#070a06', wallH: 4.4, props: ['barrel', 'stone_step', 'fence_post'], ground: ['puddle_ring', 'root_mat'], water: true, glow: '#a8e070' },
  glass:   { floor: 'cobble', wall: 'cliff', fT: '#6a6878', wT: '#3e3c4e', torch: '#e0d0ff', fog: '#06050c', wallH: 5.6, props: ['ruined_pillar', 'rune_stone', 'skull_totem'], ground: ['sand_ripple', 'bone_scatter'], tombs: true, glow: '#c8b8ff' },
  ash:     { floor: 'dirt', wall: 'cliff', fT: '#8f8b86', wT: '#6e6a66', torch: '#ffa860', fog: '#0a0908', wallH: 4.0, props: ['ruined_wall', 'ruined_arch', 'well', 'signpost', 'crate'], ground: ['ash_patch', 'bone_scatter'], beams: true },
  kiln:    { floor: 'cobble', wall: 'cliff', fT: '#9a6a52', wT: '#a85a40', torch: '#ff9040', fog: '#0c0604', wallH: 4.8, props: ['wood_pile', 'barrel', 'crate', 'fire_ring', 'sawhorse'], ground: ['ash_patch'], beams: true },
  throat:  { floor: 'rock', wall: 'rock', fT: '#5e3026', wT: '#4a201a', torch: '#ff5020', fog: '#140402', wallH: 6.0, props: ['stone_marker', 'dolmen', 'fire_ring'], ground: ['ash_patch'], glow: '#ff4010', rough: 0.25 },
};
export const FAMILY_LOOK = { crypt_spiral: 'crypt', mine_descent: 'warren', flooded_cistern: 'flooded', fortress_keep: 'ruin', cave_river: 'cave', tower_climb: 'vault', barrow_maze: 'barrow', sunken_temple: 'hollow', crypt: 'crypt', mine: 'warren',
  lava_tube: 'lava', steam_grotto: 'steam', sulphur_mine: 'sulphur', drowned_vent: 'vent', glass_tomb: 'glass', buried_town: 'ash', kiln_forge: 'kiln', caldera_deep: 'throat' };
export const lookFor = d => LOOKS[d.look] ? d.look : LOOKS[FAMILY_LOOK[d.family]] ? FAMILY_LOOK[d.family] : 'crypt';

export function createDungeonView(d, { quality = 'high' } = {}) {
  const group = new THREE.Group(); group.name = 'dungeon';
  const cell = d.cell || 2;
  const floors = d.floors.map(f => ({ ...f, tiles: Array.isArray(f.tiles) ? unrleTiles(f.tiles, f.w * f.h) : f.tiles }));
  const plan = { cell, floors };
  const terrain = dungeonTerrain(plan);
  for (const f of floors) if (f.gate?.open) terrain.openGate(f.index);

  const tileAt = (x, z) => {
    for (const f of floors) {
      const i = Math.floor((x - f.origin.x) / cell), j = Math.floor((z - f.origin.z) / cell);
      if (i >= 0 && j >= 0 && i < f.w && j < f.h) return f.tiles[j * f.w + i];
    }
    return 0;
  };

  // --- materials -----------------------------------------------------------------------------------
  const cheap = quality === 'low';
  // P10: surfaces are cached for the page (built per dungeon they froze every dungeon entrance)
  const tex = k => { if (cheap) return null; if (!DTEX.has(k)) { const s = makeSurface(k, { size: 256, seed: 5 }); s.map.wrapS = s.map.wrapT = THREE.RepeatWrapping; DTEX.set(k, s.map); } return DTEX.get(k); };
  const lookKey = lookFor(d), LK = LOOKS[lookKey];
  const wallH = LK.wallH || WALL_H;
  // Low quality has no textures and few lights: a faint glow in the stone itself keeps rooms readable
  // play-test 8 (W22): and on every quality the stone keeps a trace of its own colour, so no corner is pitch black
  const glowF = cheap ? 0.2 : DUNGEON_AMBIENT.floorGlow, glowW = cheap ? 0.12 : DUNGEON_AMBIENT.wallGlow;
  const floorMat = new (cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ map: tex(LK.floor), color: new THREE.Color(LK.fT).multiplyScalar(0.92), emissive: new THREE.Color(LK.fT).multiplyScalar(glowF), ...(cheap ? {} : { roughness: 0.92 }) });
  const wallMat = new (cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ map: tex(LK.wall), color: new THREE.Color(LK.wT), emissive: new THREE.Color(LK.wT).multiplyScalar(glowW), ...(cheap ? {} : { roughness: 0.95 }) });

  // --- tiles ---------------------------------------------------------------------------------------
  const floorCells = [], wallCells = [];
  for (const f of floors) {
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const v = f.tiles[j * f.w + i];
      const x = f.origin.x + (i + 0.5) * cell, z = f.origin.z + (j + 0.5) * cell;
      if (v) { floorCells.push([x, z]); continue; }
      let touches = false;
      for (let dj = -1; dj <= 1 && !touches; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < f.w && jj < f.h && f.tiles[jj * f.w + ii]) { touches = true; break; }
      }
      if (touches) wallCells.push([x, z, (i * 7 + j * 13) % 5]);
    }
  }
  const m4 = new THREE.Matrix4();
  const floorGeo = new THREE.PlaneGeometry(cell, cell); floorGeo.rotateX(-Math.PI / 2);
  // UVs in metres / 2 so the cobbles tile across cells
  const fl = new THREE.InstancedMesh(floorGeo, floorMat, floorCells.length);
  floorCells.forEach(([x, z], k) => fl.setMatrixAt(k, m4.makeTranslation(x, 0, z)));
  fl.receiveShadow = true; group.add(fl);
  const wallGeo = new THREE.BoxGeometry(cell, wallH, cell); wallGeo.translate(0, wallH / 2, 0);
  const wl = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  const col = new THREE.Color();
  wallCells.forEach(([x, z, v], k) => {
    const rough = LK.rough || 0;   // caves: ragged walls
    wl.setMatrixAt(k, m4.compose(new THREE.Vector3(x, -0.02 * v, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rough * v), new THREE.Vector3(1 + rough * (v % 3) * 0.2, 1 + v * (0.04 + rough * 0.3), 1 + rough * ((v + 1) % 3) * 0.2)));
    wl.setColorAt(k, col.setScalar(0.82 + v * 0.05));
  });
  wl.castShadow = wl.receiveShadow = true; group.add(wl);
  // A dark ceiling-less void: a black plane under everything hides the gaps between floors.
  const under = new THREE.Mesh(new THREE.PlaneGeometry(terrain.bounds.maxX - terrain.bounds.minX + 40, terrain.bounds.maxZ - terrain.bounds.minZ + 40), new THREE.MeshBasicMaterial({ color: '#050406' }));
  under.rotation.x = -Math.PI / 2; under.position.set((terrain.bounds.minX + terrain.bounds.maxX) / 2, -0.05, (terrain.bounds.minZ + terrain.bounds.maxZ) / 2);
  group.add(under);

  // --- gates: iron bars across a floor's gate tiles until its lever is pulled -----------------------
  const gates = new Map();
  const barMat = new THREE.MeshStandardMaterial({ color: '#3d3f45', metalness: 0.7, roughness: 0.45 });
  for (const f of floors) if (f.gate) {
    const g = new THREE.Group();
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, wallH * 0.9, 6); barGeo.translate(0, wallH * 0.45, 0);
    for (let j = f.gate.j; j < f.gate.j + f.gate.h; j++) for (let i = f.gate.i; i < f.gate.i + f.gate.w; i++)
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(barGeo, barMat); b.position.set(f.origin.x + (i + 0.5) * cell + (k - 1.5) * cell / 4.5, 0, f.origin.z + (j + 0.5) * cell + (k - 1.5) * cell / 4.5); b.castShadow = true; g.add(b); }
    g.visible = !f.gate.open; group.add(g); gates.set(f.index, g);
  }
  function openGate(index) { terrain.openGate(index); const g = gates.get(index); if (g) g.visible = false; }

  // --- torches: on a wall cell beside each room's middle ---------------------------------------------
  const torches = [];
  const glow = makeGlowTexture();
  for (const f of floors) for (const r of f.rooms || []) {
    const cx = f.origin.x + (r.i + r.w / 2) * cell, cz = f.origin.z + (r.j + r.h / 2) * cell;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const ex = dx ? (dx > 0 ? r.i + r.w : r.i - 1) : Math.floor(r.i + r.w / 2);
      const ez = dz ? (dz > 0 ? r.j + r.h : r.j - 1) : Math.floor(r.j + r.h / 2);
      if (ex < 0 || ez < 0 || ex >= f.w || ez >= f.h || f.tiles[ez * f.w + ex]) continue;
      const x = f.origin.x + (ex + 0.5) * cell - dx * (cell * 0.5 + 0.05), z = f.origin.z + (ez + 0.5) * cell - dz * (cell * 0.5 + 0.05);
      const color = r.kind === 'boss' ? '#ff5a3a' : r.kind === 'reward' ? '#ffd56a' : LK.torch;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(x, 2.6, z); s.scale.set(0.9, 1.3, 1); group.add(s);
      torches.push({ x, z, color, s });
      if (torches.length % 2) break;   // one or two per room
    }
  }
  // --- dressing: the look's props along each room's walls, water, beams, glowing growths --------------
  const dress = dressRooms(floors, cell, LK, (i, j, f) => f.tiles[j * f.w + i]);
  const propMat = new (cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ vertexColors: true, ...(cheap ? {} : { roughness: 0.85 }) });
  const byId = new Map();
  for (const p of dress.props) { if (!byId.has(p.id)) byId.set(p.id, []); byId.get(p.id).push(p); }
  for (const [id, list] of byId) {
    let g = null;
    try { g = (p => p.ground ? buildGroundDetail(id, { seed: 4, lod: 0 }) : buildProp(id, { seed: 4, lod: 1 }))(list[0]).geometry; } catch { continue; }
    const im = new THREE.InstancedMesh(g, propMat, list.length);
    list.forEach((p, k) => im.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(p.s, p.s, p.s))));
    im.castShadow = !p_ground(list[0]); im.receiveShadow = true; group.add(im);
  }
  if (dress.tombs.length) {
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#8f8a82', roughness: 0.9 }), dress.tombs.length);
    dress.tombs.forEach((t, k) => tm.setMatrixAt(k, m4.compose(new THREE.Vector3(t.x, 0, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw), new THREE.Vector3(1.0, 0.8, 2.1))));
    tm.castShadow = tm.receiveShadow = true; group.add(tm);
  }
  if (dress.beams.length) {
    const bg = new THREE.BoxGeometry(0.28, wallH, 0.28); bg.translate(0, wallH / 2, 0);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: '#6a5038', roughness: 0.95 }), dress.beams.length);
    dress.beams.forEach((b, k) => bm.setMatrixAt(k, m4.makeTranslation(b.x, 0, b.z)));
    bm.castShadow = true; group.add(bm);
  }
  let waterTex = null;
  if (dress.pools.length || floors.some(f => f.river)) {
    const wm = new THREE.MeshStandardMaterial({ color: '#2a4c58', roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.72, depthWrite: false });
    for (const p of dress.pools) { const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), wm); m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.07, p.z); m.renderOrder = 1; group.add(m); }
    for (const f of floors) if (Array.isArray(f.river) && f.river.length > 1) {
      for (let i = 0; i < f.river.length - 1; i++) {
        // feedback #96 (2026-10-21): a lava tube's river points are {x, z} objects, not [x, z] pairs — destructuring one threw
        // "object is not iterable", the whole dungeon view failed, and you stood in the outdoor world at the dungeon's local
        // coordinates: the corner of the sea
        const pt = q => (Array.isArray(q) ? q : [q?.x, q?.z]);
        const [ax, az] = pt(f.river[i]), [bx, bz] = pt(f.river[i + 1]);
        if (![ax, az, bx, bz].every(Number.isFinite)) continue;
        const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, L + 1.2), wm); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(bx - ax, bz - az); m.rotation.x = -Math.PI / 2;
        m.position.set((ax + bx) / 2, 0.06, (az + bz) / 2); m.renderOrder = 1; group.add(m);
      }
    }
    waterTex = wm;
  }
  const glows = [];
  for (const gp of dress.glows) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: LK.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); sp.position.set(gp.x, 0.35, gp.z); sp.scale.set(1.1, 0.8, 1); group.add(sp); glows.push(sp); }

  const lights = [];
  // torches borrow lights from the page's fixed pool (lightpool.js): entering a dungeon adds no light, so no shader recompiles
  for (const tc of torches) lights.push(LIGHTS.add({ x: tc.x, y: 2.6, z: tc.z, color: tc.color, intensity: cheap ? 22 : 14, distance: cheap ? 20 : 14, decay: cheap ? 1.2 : 1.7, flicker: 0.12, owner: group }));
  let t = 0;

  function update(dt, me) {
    t += dt;
    for (const [k, tc] of torches.entries()) tc.s.material.opacity = 0.75 + Math.sin(t * 9 + k) * 0.12;
    for (const [k, g] of glows.entries()) g.material.opacity = 0.45 + Math.sin(t * 1.3 + k) * 0.15;
  }

  return {
    group, terrain, update, tileAt, openGate,
    dispose() { for (const h of lights) h.remove(); lights.length = 0; },
    floorAt: (x, z) => { for (const f of floors) if (x >= f.origin.x && z >= f.origin.z && x < f.origin.x + f.w * cell && z < f.origin.z + f.h * cell) return f.index; return -1; },
    ground: () => 0,
    cameraHeight: (x, z) => (tileAt(x, z) ? 0 : wallH),
    look: lookKey, fog: LK.fog, bright: cheap, dressing: { props: dress.props.length, tombs: dress.tombs.length, beams: dress.beams.length, pools: dress.pools.length, glows: dress.glows.length },
  };
}

const p_ground = p => !!p.ground;
/**
 * Where a look's dressing goes. Pure (exported for tests): props hug the walls of each room (a tile
 * whose neighbour is a wall), never the middle where fights happen; boss rooms get fewer. Deterministic.
 */
export function dressRooms(floors, cell, LK, tileAt) {
  const props = [], tombs = [], beams = [], pools = [], glows = [];
  for (const f of floors) for (const [ri, r] of (f.rooms || []).entries()) {
    let s = (f.index * 977 + ri * 131 + 7) >>> 0;
    const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0) / 4294967296);
    const edge = [];
    for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) {
      if (!tileAt(i, j, f)) continue;
      const nearWall = !tileAt(i - 1, j, f) || !tileAt(i + 1, j, f) || !tileAt(i, j - 1, f) || !tileAt(i, j + 1, f);
      if (nearWall) edge.push([i, j]);
    }
    const w = (i, j) => ({ x: f.origin.x + (i + 0.5) * cell, z: f.origin.z + (j + 0.5) * cell });
    const n = Math.min(16, Math.round(edge.length / (r.kind === 'boss' ? 9 : 4)) + 2);
    for (let k = 0; k < n && edge.length; k++) {
      const [i, j] = edge.splice(Math.floor(rnd() * edge.length), 1)[0];
      const p = w(i, j);
      const ground = rnd() < 0.4 && LK.ground?.length;
      const list = ground ? LK.ground : LK.props;
      props.push({ id: list[Math.floor(rnd() * list.length)], x: p.x, z: p.z, yaw: rnd() * Math.PI * 2, s: (ground ? 1.2 : 1.1) + rnd() * 0.5, ground: !!ground });
    }
    const cx = f.origin.x + (r.i + r.w / 2) * cell, cz = f.origin.z + (r.j + r.h / 2) * cell;
    if (LK.tombs && r.kind !== 'boss' && r.w >= 4 && r.h >= 4 && rnd() < 0.7) for (const dz of [-1, 1]) tombs.push({ x: cx + (rnd() - 0.5) * cell, z: cz + dz * (r.h * cell * 0.28), yaw: 0 });
    if (LK.beams) for (const [i, j] of [[r.i, r.j], [r.i + r.w - 1, r.j], [r.i, r.j + r.h - 1], [r.i + r.w - 1, r.j + r.h - 1]]) if (tileAt(i, j, f)) { const p = w(i, j); beams.push({ x: p.x, z: p.z }); }
    if (LK.water && r.kind !== 'boss' && rnd() < 0.8) pools.push({ x: cx, z: cz, w: r.w * cell * 0.8, h: r.h * cell * 0.8 });
    if (LK.glow) for (let k = 0; k < 6 && edge.length; k++) { const [i, j] = edge.splice(Math.floor(rnd() * edge.length), 1)[0]; glows.push(w(i, j)); }
  }
  return { props, tombs, beams, pools, glows };
}
