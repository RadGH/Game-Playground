// What is inside a building, drawn only while someone is looking (PLAN §2 "Interiors"; budget 180 draws, 350k triangles).
// A plan becomes one merged mesh per floor, cached: walls, floors and every stick of furniture in one draw call. The doors and
// wired things that move are one instanced pile. Shell gone, roof gone (world-view setCut), and any wall between the camera and
// the focus is cut down to knee height in the vertex shader, so a phone looking down sees the room from whichever side it turns.
//
// Unlit by the sun on purpose: a room's brightness is its light switch and the time of day, baked face shading does the rest, so
// no shadow pass, no extra light, no shader rebuild when somebody flips a switch.
//
//   const view = createInteriorView({ THREE, scene, plans, mech });
//   view.show([{ b, lv, focus: { x, z } }], camera, day01, dt, bodies)     view.stats
import { FLOOR_H, WALL_H, WALL_T, toWorld, furnChar } from '../sim/interior.js';

import { FLOOR_LIFT } from '../world/walker.js';
export const floorY = (b, lv) => b.y + FLOOR_LIFT + lv * FLOOR_H;
const LOW = 0.3, MAX_ROOMS = 32, MAX_PARTS = 230, WALL_CHAR = 0.16;
const FLOORS = { living: '#b08a5c', bedroom: '#a9a0b4', kitchen: '#c9c2b0', bath: '#b9d0d6', wc: '#b9d0d6', hall: '#b89a70', lobby: '#b9b4a8', landing: '#a8a59e', garage: '#8d8d8a', floor: '#c7bfae', stock: '#a39b8c', bay: '#8f8f8c', room: '#b5a78e', testroom: '#6b6480', vault: '#55506a' };
const PAINT = { living: '#e6dcc6', bedroom: '#d8d4e4', kitchen: '#e8e6d2', bath: '#d6e8ea', wc: '#d6e8ea', hall: '#e4dccb', lobby: '#dad6cc', landing: '#d2cfc6', garage: '#b7b7b2', floor: '#ece6d8', stock: '#c4bdae', bay: '#b8b8b2', room: '#e2dccb', testroom: '#8c84a4', vault: '#6e6888' };

function shadeOf(nx, ny, nz) { return 0.72 + 0.28 * Math.max(0, nx * 0.42 + ny * 0.8 + nz * 0.42); }

/** Triangles for one floor, in world space, with the extra numbers the shader wants. */
class Room {
  constructor(THREE, b, frame) { this.T = THREE; this.b = b; this.fr = frame; this.p = []; this.c = []; this.r = []; this.w = []; this.ch = []; this.char = WALL_CHAR; this.col = new THREE.Color(); this.q = {}; }
  v(x, y, z, c, room, wall) { const q = toWorld(this.fr, x, z, this.q); this.p.push(q.x, y, q.z); this.c.push(c[0], c[1], c[2]); this.r.push(room); this.w.push(...wall); this.ch.push(this.char); }
  rgb(hex, k = 1) { this.col.set(hex); return [this.col.r * k, this.col.g * k, this.col.b * k]; }
  /** A box between two corners. faces(nx, nz) may answer a colour and room for that side; top = its top colour. */
  box(x0, z0, x1, z1, y0, y1, hex, { room = 0, wall = null, faces = null, top = true } = {}) {
    const W = wall ? [wall[0], wall[1], 1] : [0, 0, 0], side = (a, b2, n, c0) => {
      const hit = faces ? faces(n[0], n[1]) : null, col = this.rgb(hit?.hex ?? c0, shadeOf(n[0], 0, n[1])), rm = hit?.room ?? room;
      const [ax, az] = a, [bx, bz] = b2;
      this.v(ax, y0, az, col, rm, W); this.v(bx, y0, bz, col, rm, W); this.v(bx, y1, bz, col, rm, W);
      this.v(ax, y0, az, col, rm, W); this.v(bx, y1, bz, col, rm, W); this.v(ax, y1, az, col, rm, W);
    };
    side([x0, z1], [x1, z1], [0, 1], hex); side([x1, z1], [x1, z0], [1, 0], hex); side([x1, z0], [x0, z0], [0, -1], hex); side([x0, z0], [x0, z1], [-1, 0], hex);
    if (top) { const col = this.rgb(typeof top === 'string' ? top : hex, shadeOf(0, 1, 0)); this.v(x0, y1, z1, col, room, W); this.v(x1, y1, z1, col, room, W); this.v(x1, y1, z0, col, room, W); this.v(x0, y1, z1, col, room, W); this.v(x1, y1, z0, col, room, W); this.v(x0, y1, z0, col, room, W); }
  }
  /** In a piece of furniture's own terms: along its wall, out into the room. */
  piece(f, along, out, hAlong, hOut, y0, y1, hex, room) {
    const cx = f.x + f.tx * along + f.nx * out, cz = f.z + f.tz * along + f.nz * out, hx = Math.abs(f.tx) * hAlong + Math.abs(f.nx) * hOut, hz = Math.abs(f.tz) * hAlong + Math.abs(f.nz) * hOut, B = this.base;
    this.box(cx - hx, cz - hz, cx + hx, cz + hz, B + y0, B + y1, hex, { room });
  }
  geometry() {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aRoom', new T.Float32BufferAttribute(this.r, 1)); g.setAttribute('aChar', new T.Float32BufferAttribute(this.ch, 1)); g.setAttribute('aWall', new T.Float32BufferAttribute(this.w, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const GOODS = ['#c8553d', '#e0b93c', '#3f78b5', '#4e9a6a', '#d0d0c8', '#a2507f', '#e08a3c'];
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function drawFurn(M, f, rm, seedHex) {
  const P = (a, o, ha, ho, y0, y1, hex) => M.piece(f, a, o, ha, ho, y0, y1, hex, rm), w = f.w / 2, d = f.d / 2;
  switch (f.kind) {
    case 'bed2': case 'bed1': {
      P(0, 0, w, d, 0, 0.3, '#6e5238'); P(0, 0.08, w - 0.04, d - 0.1, 0.3, 0.48, '#efe9dd'); P(0, 0.3, w - 0.02, d - 0.42, 0.48, 0.53, seedHex);
      if (f.kind === 'bed2') { P(-0.42, -d + 0.26, 0.3, 0.18, 0.48, 0.58, '#ffffff'); P(0.42, -d + 0.26, 0.3, 0.18, 0.48, 0.58, '#ffffff'); } else P(0, -d + 0.26, 0.3, 0.18, 0.48, 0.58, '#ffffff');
      P(0, -d + 0.03, w, 0.03, 0.3, 1, '#5b432e');
      break;
    }
    case 'bunk': {
      for (const y of [0.3, 1.05]) { P(0, 0, w - 0.04, d - 0.04, y, y + 0.16, '#efe9dd'); P(0, 0.3, w - 0.04, d - 0.42, y + 0.16, y + 0.2, seedHex); P(0, -d + 0.28, 0.3, 0.16, y + 0.16, y + 0.26, '#ffffff'); }
      for (const a of [-1, 1]) for (const o of [-1, 1]) P(a * (w - 0.04), o * (d - 0.04), 0.04, 0.04, 0, 1.75, '#6e5238');
      break;
    }
    case 'wardrobe': P(0, 0, w, d, 0, f.h, '#8a6a48'); P(-w / 2, d - 0.005, w / 2 - 0.02, 0.01, 0.1, f.h - 0.08, '#9a7a56'); P(w / 2, d - 0.005, w / 2 - 0.02, 0.01, 0.1, f.h - 0.08, '#9a7a56'); break;
    case 'desk': P(0, 0, w, d, 0.7, 0.76, '#b48a5a'); for (const a of [-1, 1]) P(a * (w - 0.04), 0, 0.03, d - 0.04, 0, 0.7, '#6e5238'); P(0.1, -0.1, 0.22, 0.02, 0.8, 1.05, '#30343a'); P(0.1, -0.08, 0.2, 0.01, 0.82, 1.03, '#7fb2d0'); break;
    case 'sofa': P(0, -0.1, w, d - 0.1, 0.18, 0.44, seedHex); P(0, -d + 0.1, w, 0.1, 0.18, f.h, seedHex); for (const a of [-1, 1]) P(a * (w - 0.09), 0, 0.09, d - 0.05, 0.18, 0.6, seedHex); P(0, 0, w, d, 0, 0.18, '#3a3a3e'); break;
    case 'tv': P(0, 0, w * 0.8, d, 0, 0.42, '#6e5238'); P(0, -0.03, w * 0.68, 0.03, 0.46, 0.92, '#1a1c20'); P(0, 0, w * 0.64, 0.005 + 0.02, 0.48, 0.9, '#3c6a90'); break;
    case 'stove': P(0, 0, w, d, 0, 0.9, '#e8e8e8'); P(0, 0, w - 0.03, d - 0.03, 0.9, 0.92, '#2a2a2e'); P(0, d - 0.01, w - 0.07, 0.015, 0.2, 0.7, '#3c3c40'); break;
    case 'fridge': P(0, 0, w, d, 0, f.h, '#e8ecec'); P(0, d, w - 0.04, 0.01, 1.25, 1.27, '#9aa0a4'); break;
    case 'worktop': case 'sink': case 'washer': P(0, 0, w, d, 0, 0.86, f.kind === 'washer' ? '#e8ecec' : '#a88a64'); P(0, 0, w, d, 0.86, 0.92, f.kind === 'washer' ? '#e8ecec' : '#dcd8cc'); if (f.kind === 'sink') P(0, 0, 0.26, 0.2, 0.92, 0.93, '#8fa4b0'); if (f.kind === 'washer') P(0, d, 0.2, 0.01, 0.3, 0.7, '#40484e'); break;
    case 'toilet': P(0, -0.08, 0.2, 0.28, 0, 0.42, '#f4f4f4'); P(0, -d + 0.1, w - 0.1, 0.1, 0.4, 0.8, '#f4f4f4'); break;
    case 'shower': P(0, 0, w, d, 0, 0.06, '#a8c4cc'); P(0, d, w, 0.015, 0.06, 2.05, '#bcd8e2'); P(w, 0, 0.015, d, 0.06, 2.05, '#bcd8e2'); break;
    case 'basin': P(0, 0, w, d, 0, 0.82, '#f4f4f4'); P(0, -d + 0.02, w, 0.02, 1.05, 1.7, '#a8d0e0'); break;
    case 'cabinet': P(0, 0, w, d, 0, f.h, '#8a8074'); break;
    case 'shelf': case 'rack': case 'fridgewall': case 'locker': {
      if (f.kind === 'fridgewall') { P(0, 0, w, d, 0, f.h, '#dfe9ee'); P(0, d, w - 0.05, 0.01, 0.2, 1.8, '#a8d4e4'); break; }
      if (f.kind === 'locker') { P(0, 0, w, d, 0, f.h, '#6f7f8c'); break; }
      P(0, 0, w, 0.06, 0, f.h, '#8a8074');
      const rows = f.kind === 'rack' ? 2 : 4, n = Math.max(3, Math.floor(f.w / 0.4));
      for (let r = 0; r < rows; r++) { const y = 0.12 + r * (f.h - 0.2) / rows; P(0, 0, w, d, y - 0.03, y, '#b5ad9e'); for (let i = 0; i < n; i++) { const a = -w + (i + 0.5) * f.w / n, hx = hash(i * 3 + r, Math.round(f.x * 10) + Math.round(f.z * 10)); if (hx < 0.18) continue; const hue = GOODS[Math.floor(hx * 97) % GOODS.length], t = 0.12 + hx * 0.2; for (const o of [-1, 1]) P(a, o * d * 0.5, 0.13, d * 0.42, y, y + t, hue); } }
      break;
    }
    case 'till': P(0, 0, w, d, 0, f.h, '#7c6a58'); P(w * 0.4, 0, 0.18, 0.15, f.h, f.h + 0.2, '#30343a'); P(-w * 0.2, 0.05, w * 0.5, d * 0.55, f.h, f.h + 0.02, '#c9c2b0'); break;
    case 'barcounter': P(0, 0, w, d - 0.05, 0, f.h - 0.06, '#6a4a30'); P(0, 0.02, w + 0.03, d + 0.02, f.h - 0.06, f.h, '#c9a26a'); for (let i = 0; i < Math.floor(f.w / 1.5); i++) { const a = -w + 0.7 + i * 1.5; P(a, -d + 0.15, 0.09, 0.09, f.h, f.h + 0.34, GOODS[i % GOODS.length]); } break;
    case 'bench': P(0, 0, w, d, 0.78, 0.9, '#8a8a84'); for (const a of [-1, 1]) P(a * (w - 0.06), 0, 0.05, d - 0.04, 0, 0.78, '#5a5d60'); P(-0.5, 0, 0.3, 0.16, 0.9, 1.1, '#3f78b5'); P(0.4, 0.1, 0.2, 0.14, 0.9, 1, '#c8553d'); break;
    case 'plant': P(0, 0, 0.16, 0.16, 0, 0.32, '#8a5a3c'); P(0, 0, 0.26, 0.26, 0.34, 1, '#4f8c4c'); P(0, 0, 0.16, 0.16, 1, 1.22, '#5f9c5a'); break;
    case 'boxes': P(-0.25, 0, 0.3, 0.3, 0, 0.5, '#b08a5c'); P(0.3, 0.05, 0.28, 0.28, 0, 0.44, '#a2805a'); P(0, 0, 0.26, 0.26, 0.5, 0.92, '#bc9868'); break;
    case 'reception': P(0, 0, w, d, 0, f.h, '#3c5a78'); P(0, 0.02, w + 0.02, d + 0.02, f.h, f.h + 0.05, '#dcd8cc'); P(0.3, -0.1, 0.2, 0.02, f.h, f.h + 0.3, '#30343a'); break;
    case 'table': P(0, 0, w, d, 0.7, 0.76, '#a8824e'); P(0, 0, 0.05, 0.05, 0, 0.7, '#5a4632'); P(0, 0, Math.min(w, 0.32), Math.min(d, 0.32), 0, 0.03, '#5a4632'); P(-w * 0.3, 0, 0.1, 0.1, 0.76, 0.8, '#f0ece2'); P(w * 0.3, 0, 0.1, 0.1, 0.76, 0.8, '#f0ece2'); break;
    case 'machine': P(0, 0, w, d, 0, 0.14, '#32363c'); P(-w * 0.55, 0, 0.1, d * 0.8, 0, f.h, '#50565e'); P(-w * 0.55, 0, 0.14, d * 0.6, f.h - 0.1, f.h, '#7fb2d0'); break;
    case 'lift': P(0, 0, w, d, 0, WALL_H, '#6f7880'); P(0, d, w * 0.7, 0.02, 0, 2.2, '#b4bcc2'); P(0, d, 0.015, 0.03, 0, 2.2, '#50565e'); break;
    default: P(0, 0, w, d, 0, f.h, '#999');
  }
}

/** One floor of one building as one geometry. */
function buildFloor(THREE, b, frame, plan, lv) {
  const M = new Room(THREE, b, frame), base = floorY(b, lv), rooms = plan.rooms.filter(r => r.lv === lv), roomIdx = new Map(rooms.map((r, i) => [r.id, i + 1]));
  M.base = base;
  const w = plan.w / 2, d = plan.d / 2;
  if (lv > 0) M.box(-w, -d, w, d, b.y - 0.3, base - 0.02, b.tint, { top: false });     // the floors below, as a plain block
  for (const r of rooms) M.box(r.x0, r.z0, r.x1, r.z1, base - 0.1, base, FLOORS[r.kind] ?? '#b5a78e', { room: roomIdx.get(r.id) });
  const lobby = plan.doors.find(q => q.a === 'out' && q.lv === lv);
  if (lobby) M.box(lobby.x - 0.7, lobby.z - 0.8, lobby.x + 0.7, lobby.z - 0.1, base + 0.001, base + 0.01, '#6a5a48', { room: roomIdx.get(lobby.b) ?? 0 });
  const roomAt = (x, z) => rooms.find(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const facesOf = q => (nx, nz) => {
    const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, hx = (q.x1 - q.x0) / 2 + 0.2, hz = (q.z1 - q.z0) / 2 + 0.2;
    const r = roomAt(nx ? cx + nx * hx : cx, nz ? cz + nz * hz : cz);
    return r ? { hex: PAINT[r.kind] ?? '#e2dccb', room: roomIdx.get(r.id) } : { hex: b.tint, room: 0 };
  };
  const wallTop = base + WALL_H;
  for (const q of plan.walls) {
    if (q.lv !== lv) continue;
    M.box(q.x0, q.z0, q.x1, q.z1, base, wallTop, '#f4efe4', { wall: wallMid(frame, q), faces: facesOf(q), top: '#cfc9bc' });
  }
  for (const o of plan.doors) {
    if (o.lv !== lv) continue;
    const q = o.rect, thin = o.axis === 'x' ? [q.x0, o.z - WALL_T / 2, q.x1, o.z + WALL_T / 2] : [o.x - WALL_T / 2, q.z0, o.x + WALL_T / 2, q.z1];
    M.box(thin[0], thin[1], thin[2], thin[3], base + o.h, wallTop, '#f4efe4', { wall: wallMid(frame, q), faces: facesOf({ x0: thin[0], z0: thin[1], x1: thin[2], z1: thin[3] }), top: '#cfc9bc' });
  }
  for (const g of plan.windows) {
    if (g.lv !== lv) continue;
    const hw = g.w / 2, o = WALL_T / 2 + 0.012;
    for (const s of [-1, 1]) {
      const q = g.axis === 'x' ? [g.x - hw, g.z + s * o - 0.004, g.x + hw, g.z + s * o + 0.004] : [g.x + s * o - 0.004, g.z - hw, g.x + s * o + 0.004, g.z + hw];
      M.box(q[0], q[1], q[2], q[3], base + 0.95, base + 2.1, '#9fd0ea', { wall: wallMid(frame, { x0: q[0], z0: q[1], x1: q[2], z1: q[3] }) });
    }
  }
  const tones = ['#5f7fa8', '#a2606a', '#5f9a7a', '#b08a4c', '#7a68a0'];
  // a piece of furniture chars at its own number, the same one the sim marks it burnt at
  for (const f of plan.furn) if (f.lv === lv) { M.char = furnChar(b.id, f.id); drawFurn(M, f, roomIdx.get(f.room) ?? 0, tones[Math.abs(Math.round(f.x * 3 + f.z * 7)) % tones.length]); }
  M.char = 0.4;
  // chairs: a seat and a back, where a slot says someone sits at a table or a desk
  for (const s of plan.slots) {
    if (s.lv !== lv || s.y < 0.4 || s.y > 0.5 || !['chair', 'counter', 'desk', 'work'].includes(s.kind)) continue;
    const rm = roomIdx.get(s.room) ?? 0, bx = -Math.sin(s.yaw) * 0.2, bz = -Math.cos(s.yaw) * 0.2;
    M.box(s.x - 0.2, s.z - 0.2, s.x + 0.2, s.z + 0.2, base + 0.4, base + 0.46, '#7a5a3c', { room: rm });
    M.box(s.x - 0.03, s.z - 0.03, s.x + 0.03, s.z + 0.03, base, base + 0.4, '#4c4038', { room: rm, top: false });
    M.box(s.x + bx - 0.17, s.z + bz - 0.17, s.x + bx + 0.17, s.z + bz + 0.17, base + 0.46, base + 0.5, '#7a5a3c', { room: rm });
  }
  const geo = M.geometry();
  return { geo, tris: M.p.length / 9, roomIds: rooms.map(r => r.id) };
}
const wallMid = (fr, q) => { const c = toWorld(fr, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, {}); return [c.x, c.z]; };

export function createInteriorView({ THREE, scene, plans, mech, burnt = () => null }) {
  const group = new THREE.Group(); group.name = 'interiors'; scene.add(group);
  const cache = new Map(), slots = [];
  const makeMat = () => {
    const u = { uFocus: { value: new THREE.Vector2() }, uCam: { value: new THREE.Vector2(0, 1) }, uBase: { value: 0 }, uDim: { value: 1 }, uLit: { value: new Float32Array(MAX_ROOMS + 1) }, uBurn: { value: new Float32Array(MAX_ROOMS + 1) } };
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute float aRoom; attribute float aChar; attribute vec3 aWall; uniform vec2 uFocus; uniform vec2 uCam; uniform float uBase; uniform float uDim; uniform float uLit[${MAX_ROOMS + 1}]; uniform float uBurn[${MAX_ROOMS + 1}]; varying float vLight; varying float vChar;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          if (aWall.z > 0.5 && dot(aWall.xy - uFocus, uCam) > 0.25) transformed.y = uBase + (transformed.y - uBase) * ${LOW.toFixed(2)};
          vLight = mix(uDim, 1.0, uLit[int(aRoom + 0.5)]);
          vChar = smoothstep(aChar, aChar + 0.12, uBurn[int(aRoom + 0.5)]);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLight; varying float vChar;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.055) + diffuseColor.rgb * 0.06, vChar * 0.94) * vLight;');
    };
    m.customProgramCacheKey = () => 'oddhaven-room';
    return { m, u };
  };
  for (let i = 0; i < 3; i++) {
    const { m, u } = makeMat(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    mesh.visible = false; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; group.add(mesh);
    slots.push({ mesh, u, key: null, floor: null });
  }
  // the parts that move: one unit box, instanced
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX_PARTS);
  parts.frustumCulled = false; parts.count = 0; parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3).fill(1), 3); group.add(parts);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), tc = new THREE.Color(), tmp = {};
  const swings = new Map();
  let n = 0;
  const put = (x, y, z, sx, sy, sz, yaw, hex) => { if (n >= MAX_PARTS) return; m4.compose(p3.set(x, y, z), q4.setFromAxisAngle(Y, yaw), s3.set(sx, sy, sz)); parts.setMatrixAt(n, m4); parts.setColorAt(n, tc.set(hex)); n++; };
  const self = {
    stats: { open: 0, tris: 0, parts: 0 }, group,
    /** What the open floors are really drawing, room by room: { 'b|lv': { room: burn } }. For the test that compares this to the sim. */
    drawnBurn() { const out = {}; for (const s of slots) { if (!s.key || !s.floor) continue; out[s.key] = Object.fromEntries(s.floor.roomIds.map((id, k) => [id, s.u.uBurn.value[k + 1]])); } return out; },
    floorOf(b, lv) {
      const key = `${b.id}|${lv}`; let f = cache.get(key);
      if (!f) { f = buildFloor(THREE, b, { cx: b.x, cz: b.z, yaw: b.yaw }, plans(b.id), lv); cache.set(key, f); if (cache.size > 12) { const old = cache.keys().next().value; if (!slots.some(s => s.key === old)) { cache.get(old).geo.dispose(); cache.delete(old); } } }
      return f;
    },
    /** Who is open this frame. `people` = [{x, z, lv}], for doors that swing as somebody comes up to them. */
    show(list, camera, day, dt, people = [], nearby = []) {
      n = 0;
      self.stats.open = 0; self.stats.tris = 0;
      const dirX = camera.position.x, dirZ = camera.position.z;
      slots.forEach((s, i) => {
        const row = list[i];
        if (!row) { s.mesh.visible = false; s.key = null; return; }
        const f = self.floorOf(row.b, row.lv), key = `${row.b.id}|${row.lv}`;
        if (s.key !== key) { s.mesh.geometry = f.geo; s.key = key; s.floor = f; }
        const fx = row.focus.x, fz = row.focus.z, cx = dirX - fx, cz = dirZ - fz, l = Math.hypot(cx, cz) || 1;
        s.u.uFocus.value.set(fx, fz); s.u.uCam.value.set(cx / l, cz / l); s.u.uBase.value = floorY(row.b, row.lv); s.u.uDim.value = 0.42 + 0.52 * day;
        const lit = s.u.uLit.value; lit.fill(0);
        f.roomIds.forEach((id, k) => { lit[k + 1] = mech(row.b.id, `light:${id}`) ? 1 : 0; });
        lit[0] = 1;
        // burned rooms stay burned until they are mended: a number in a uniform, so nothing is rebuilt and no shader is touched
        const burn = s.u.uBurn.value, marks = burnt(row.b.id);
        burn.fill(0); if (marks) f.roomIds.forEach((id, k) => { burn[k + 1] = marks.r[id] ?? 0; });
        s.mesh.visible = true; self.stats.open++; self.stats.tris += f.tris;
        drawParts(row, cx / l, cz / l, dt, people);
      });
      for (const b of nearby) outsideShutter(b);
      parts.count = n; parts.visible = n > 0; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
      self.stats.parts = n;
    },
  };
  function drawParts(row, cx, cz, dt, people) {
    const b = row.b, plan = plans(b.id), base = floorY(b, row.lv), fr = { cx: b.x, cz: b.z, yaw: b.yaw };
    for (const d of plan.doors) {
      if (d.lv !== row.lv) continue;
      const c = toWorld(fr, d.x, d.z, tmp), wx = c.x, wz = c.z, nearCam = (wx - row.focus.x) * cx + (wz - row.focus.z) * cz > 0.25, yawAlong = d.axis === 'x' ? b.yaw : b.yaw + Math.PI / 2;
      if (d.kind === 'garage' || d.shutter || d.kind === 'vault') {
        const up = mech(b.id, `door:${d.id}`) ? 1 : 0, k = `${b.id}/${d.id}`, was = swings.get(k) ?? up, v = was + Math.sign(up - was) * Math.min(Math.abs(up - was), dt * 1.2);
        swings.set(k, v);
        if (v < 0.98) put(wx, base + d.h * v, wz, d.w, d.h * (1 - v), 0.1, yawAlong, d.kind === 'vault' ? '#59606a' : '#7c8288');
        if (d.kind !== 'vault' || !up) continue;
        continue;
      }
      // an ordinary door swings for whoever comes near, and is left out on a wall the camera has cut down
      let open = 0;
      for (const p of people) if (p.lv === d.lv && Math.hypot(p.x - wx, p.z - wz) < 1.7) { open = 1; break; }
      const k = `${b.id}/${d.id}`, v0 = swings.get(k) ?? 0, v = v0 + Math.sign(open - v0) * Math.min(Math.abs(open - v0), dt * 4);
      swings.set(k, v);
      if (nearCam) continue;
      const ang = yawAlong + v * 1.5, ha = d.w / 2, hx = wx - Math.cos(yawAlong) * ha, hz = wz + Math.sin(yawAlong) * ha;
      put(hx + Math.cos(ang) * ha, base, hz - Math.sin(ang) * ha, d.w, d.h - 0.06, 0.05, ang, d.a === 'out' ? '#5b3b28' : '#8a6a48');
    }
    for (const t of plan.things) {
      if (t.lv !== row.lv) continue;
      const c = toWorld(fr, t.x, t.z, tmp), on = mech(b.id, `thing:${t.id}`) ? 1 : 0;
      if (t.kind === 'switch') { put(c.x, base + 1.15, c.z, 0.13, 0.18, 0.13, b.yaw, mech(b.id, t.id.replace('sw:', 'light:')) ? '#ffe9a0' : '#f4f4f0'); }
      else if (t.kind === 'button') put(c.x, base + 1.1, c.z, 0.18, 0.18, 0.18, b.yaw, '#d0402f');
      else if (t.kind === 'detector') put(c.x, base + 2.6, c.z, 0.16, 0.05, 0.16, b.yaw, '#f4f4f0');
      else if (t.kind === 'sprinkler') put(c.x + 0.4, base + 2.62, c.z, 0.1, 0.06, 0.1, b.yaw, '#b8bcc0');
      else if (t.kind === 'extinguisher') { put(c.x, base + 0.5, c.z, 0.2, 0.6, 0.2, b.yaw, '#d0402f'); put(c.x, base + 1.1, c.z, 0.1, 0.12, 0.1, b.yaw, '#30343a'); }
      else if (t.kind === 'lever') { put(c.x, base + 0.75, c.z, 0.26, 0.5, 0.2, b.yaw, '#3a3f46'); put(c.x, base + (on ? 1.3 : 0.95), c.z, 0.09, 0.42, 0.09, b.yaw, on ? '#66d07a' : '#e0b93c'); }
      else if (t.kind === 'plate') put(c.x, base + 0.01, c.z, 1.1, on ? 0.02 : 0.05, 1.1, b.yaw, on ? '#66d07a' : '#b48cff');
    }
  }
  /** A shut shop from the street, with its shell still on. */
  function outsideShutter(b) {
    const plan = plans(b.id);
    if (!plan?.shutter || mech(b.id, `door:${plan.shutter}`)) return;
    const d = plan.doors.find(x => x.id === plan.shutter), c = toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, d.x, d.z + 0.1, tmp);
    put(c.x, b.y, c.z, d.w + 0.1, d.h, 0.08, b.yaw, '#7c8288');
  }
  return self;
}
