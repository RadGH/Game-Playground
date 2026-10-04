// A dungeon instance drawn from `joined.room.dungeon` (protocol §10.3): floors laid side by side, each a
// w × h grid of `cell`-metre tiles (1 floor, 0 wall) sent as run lengths.
//
// Floors are one instanced flagstone tile per walkable cell; walls are instanced blocks on every wall cell
// that touches a floor (the solid rock beyond is never drawn). Torches stand on walls next to room
// centres; six real lights hop to the torches nearest you, the rest are glow sprites.
// Also returns the two terrain functions the client needs: `ground` (always 0 — dungeon floors are flat,
// the same as the server's js/sim/dungeon.js dungeonTerrain) and `cameraHeight` (wall tops count as high
// ground, so the third-person camera pulls in instead of looking through rock).

import * as THREE from 'three';
import { makeSurface } from '../../../../highdef-3d/js/kit/textures.js';
import { unrleTiles, dungeonTerrain } from '../sim/dungeon.js';
import { makeGlowTexture } from './decor.js';

const WALL_H = 4.2;
const FAMILY_TINT = { crypt: '#9aa0b0', mine: '#b08a66', cistern: '#7fa0a6', keep: '#a59c90', cave: '#8f8a80', tower: '#b0a8a0', barrow: '#8e9a7e', temple: '#b8a77e' };

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
  const tex = k => { if (cheap) return null; const s = makeSurface(k, { size: 256, seed: 5 }); s.map.wrapS = s.map.wrapT = THREE.RepeatWrapping; return s.map; };
  const tint = new THREE.Color(FAMILY_TINT[d.family] || '#a0a0a0');
  const floorMat = new (cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ map: tex('cobble'), color: tint.clone().multiplyScalar(0.9), ...(cheap ? {} : { roughness: 0.92 }) });
  const wallMat = new (cheap ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial)({ map: tex('cliff'), color: tint, ...(cheap ? {} : { roughness: 0.95 }) });

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
  const wallGeo = new THREE.BoxGeometry(cell, WALL_H, cell); wallGeo.translate(0, WALL_H / 2, 0);
  const wl = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  const col = new THREE.Color();
  wallCells.forEach(([x, z, v], k) => {
    wl.setMatrixAt(k, m4.compose(new THREE.Vector3(x, -0.02 * v, z), new THREE.Quaternion(), new THREE.Vector3(1, 1 + v * 0.04, 1)));
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
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, WALL_H * 0.9, 6); barGeo.translate(0, WALL_H * 0.45, 0);
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
      const color = r.kind === 'boss' ? '#ff5a3a' : r.kind === 'reward' ? '#ffd56a' : '#ffa552';
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(x, 2.6, z); s.scale.set(0.9, 1.3, 1); group.add(s);
      torches.push({ x, z, color, s });
      if (torches.length % 2) break;   // one or two per room
    }
  }
  const lights = [];
  for (let k = 0; k < (cheap ? 3 : 6); k++) { const l = new THREE.PointLight('#ffa552', 0, 14, 1.7); l.position.y = 2.6; group.add(l); lights.push(l); }
  let relightAt = 0, t = 0;

  function update(dt, me) {
    t += dt;
    for (const [k, tc] of torches.entries()) tc.s.material.opacity = 0.75 + Math.sin(t * 9 + k) * 0.12;
    if (!me || t < relightAt) { for (const [k, l] of lights.entries()) if (l.userData.base) l.intensity = l.userData.base * (0.88 + Math.sin(t * 11 + k * 2) * 0.12); return; }
    relightAt = t + 0.5;
    const near = torches.map(tc => ({ tc, d: Math.hypot(tc.x - me.x, tc.z - me.z) })).sort((a, b) => a.d - b.d);
    lights.forEach((l, k) => {
      const n = near[k];
      if (!n || n.d > 40) { l.intensity = 0; l.userData.base = 0; return; }
      l.position.set(n.tc.x, 2.6, n.tc.z); l.color.set(n.tc.color); l.userData.base = 14; l.intensity = 14;
    });
  }

  return {
    group, terrain, update, tileAt, openGate,
    floorAt: (x, z) => { for (const f of floors) if (x >= f.origin.x && z >= f.origin.z && x < f.origin.x + f.w * cell && z < f.origin.z + f.h * cell) return f.index; return -1; },
    ground: () => 0,
    cameraHeight: (x, z) => (tileAt(x, z) ? 0 : WALL_H),
  };
}
