// The Catacombs drawn (brainstorm 2026-11-27-regions §3: "the Moria halls — wide open spaces with tall columns —
// ossuaries, crypts, a boss throne hall; fog + torchlight; darkness beyond the light so halls feel huge"). Every piece
// comes from the dungeon plan the server walks (js/world/dungeon/plan.js; lessons rule 22): floors at the walk grid's
// heights (ramps slope the same way), walls only where floor meets rock, a vault over every room and corridor that
// springs at the plan's ceiling height (so the camera space, walk.air, is always inside what is drawn), columns at the
// plan's columns, sarcophagi, bone walls, the lever, the gate and the secret door at the plan's features.
//
// Look: the House Kit's painted atlas (housekit/js/build.js — dressed stone, fieldstone, cobbles, planks, iron, cloth),
// tinted cold and dark, so nothing is untextured (rule 77); the ossuary's bone walls are a painted bone texture.
//   rooms        barrel vaults with transverse ribs on pilasters (crypts, ossuaries, chapels, halls, dens)
//   column halls ribbed groin vaults bay by bay over 2-3 m columns (base, shaft, flared capital), a carved boss in the
//                middle of each bay, a hanging pendant where a column is left out (the troll's ring)
//   corridors    barrel vaults with ribs every 4 m; arched door frames where they open into a room
//   details      skirting and cornice bands, burial niches in the crypts, stairs up at the entrance and the exit,
//                rubble and a cold light shaft at the fallen grave, a stone bridge with parapets over the chasm, the
//                throne and its hanging, goblin hide tents / fire / crates / shoring, the troll's chains and bones
// No two faces share a plane (rule 83): bands, pilasters, frames and ribs stand proud of the faces they sit on, and
// bands that cross at a corner differ in height by 3 cm.
//
// Light: no sun and no sky. A very dim cold fill, thick dark fog (DUNGEON_LOOK), and fire: every torch, brazier,
// candle and the fallen grave's daylight is BAKED into the stone once at load (an emissive term per vertex, with a
// line-of-sight check on the plan grid so light never leaks through rock), the nearest few are also REAL lights from
// one fixed pool (DUNGEON_GFX lights; made once, never added or removed or hidden — only moved and dimmed: rule 29)
// so heroes and monsters are lit and the fire flickers, and the hero carries a lantern glow. Flames are one instanced
// draw (camera-facing, flickering in the shader, a soft halo that stays visible in the dark far past the fog so you
// can see how big a hall is); dust motes drift round the camera (one draw).
//
// Cost: the static stone is merged into one mesh per 32 m chunk (+ one for the bone walls where there are any), so a
// view draws ~10-20 meshes; chunks beyond the fog are hidden. Low (phones) has fewer wall rows and vault segments,
// thinner clutter and 3 real lights; the shaders are compiled before the dungeon is shown (renderer.compileAsync).
//
//   const v = createDungeonView(view, { W, quality })   W = the dungeon place (js/world/dungeon/place.js; W.dungeon)
//   v.update(dt, at)  v.ready()  v.afterWeather()  (the dungeon's air, instead of the weather's)  v.dispose()
//   v.stats  v.root  v.chunks  v.torches  v.lights
//   dungeonAmbient({ sound })   the ambience bed for a dungeon (play.js uses it instead of render/ambient.js)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadHouseKit } from '../../../../../housekit/js/build.js';
import { ATMOS } from './atmos.js';
import { rampY } from '../../world/dungeon/plan.js';
import { CODE } from '../../world/dungeon/features.js';

/** Per graphics setting. rows = wall rows (metres above the floor) for the baked light; seg = vault segments across. */
export const DUNGEON_GFX = {
  low: { lights: 3, rows: [1.2, 3, 5.5, 10], seg: 8, bay: 6, lathe: 12, clutter: 0.45, dust: 140, niches: 2, near: 3, far: 46 },
  medium: { lights: 6, rows: [0.9, 2.2, 3.6, 5.5, 8.5, 13], seg: 12, bay: 8, lathe: 16, clutter: 0.8, dust: 320, niches: 3, near: 4, far: 58 },
  high: { lights: 9, rows: [0.7, 1.6, 2.6, 3.8, 5.2, 7, 10, 14, 19], seg: 16, bay: 10, lathe: 20, clutter: 1, dust: 520, niches: 3, near: 5, far: 70 },
};
/** The air down here (checked on the dungeon pictures, tests/ui/dungeon-shots.mjs). */
export const DUNGEON_LOOK = {
  fog: '#0a0c11', fill: '#5f7298', fillGround: '#59637e', fillIntensity: 3.2, env: 0.015, exposure: 1.1,
  mist: { density: 0.03, falloff: 0.3, max: 0.42 }, bloom: { strength: 0.14, threshold: 0.9 }, vignette: 0.34, saturation: 1.04,
  bake: 1.0,                                         // the baked fire light's strength (a uniform: tune live)
  torch: '#ffc489', brazier: '#ffb574', candle: '#ffd39c', fire: '#ffab6a', shaft: '#a8bede', lantern: '#ffd6a8',
  lantern_intensity: 6, lantern_distance: 16, light_intensity: 11, light_distance: 15,
};
// stone tints per place (multiplied with the painted atlas)
const TINT = {
  wall: '#7688a8', wallDen: '#7c7e86', floor: '#7486a6', floorDen: '#6f7584', vault: '#6e80a2', rib: '#9cadca', band: '#8c9cb8',
  column: '#94a5c2', rubble: '#a3a7b0', pit: '#4b4743', dark: '#1d1a17', bone: '#d8ccb0', wood: '#6b4f33', iron: '#55555a', hide: '#8a6a48',
};
const TILE = 2;
const CHUNK = 32;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- a growable triangle list (the House Kit's attributes)
class Grow {
  constructor() { this.n = 0; this.cap = 0; this.grow(2048); }
  grow(min) {
    const cap = Math.max(min, this.cap * 2);
    const cp = (old, T, k) => { const a = new T(cap * k); if (old) a.set(old.subarray(0, this.n * k)); return a; };
    this.pos = cp(this.pos, Float32Array, 3); this.nrm = cp(this.nrm, Float32Array, 3); this.uv = cp(this.uv, Float32Array, 2);
    this.tile = cp(this.tile, Uint16Array, 4); this.col = cp(this.col, Uint8Array, 4);
    this.cap = cap;
  }
  /** one vertex: position, normal, uv, the atlas square (rect), colour 0..255 */
  v(x, y, z, nx, ny, nz, u, w, rect, r, g, b) {
    if (this.n >= this.cap) this.grow(this.n + 1);
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = w;
    if (rect) { this.tile[i * 4] = rect[0] * 65535; this.tile[i * 4 + 1] = rect[1] * 65535; this.tile[i * 4 + 2] = rect[2] * 65535; this.tile[i * 4 + 3] = rect[3] * 65535; }
    this.col[i * 4] = clamp(r, 0, 255); this.col[i * 4 + 1] = clamp(g, 0, 255); this.col[i * 4 + 2] = clamp(b, 0, 255); this.col[i * 4 + 3] = 255;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('tile', new THREE.BufferAttribute(this.tile.slice(0, n * 4), 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 4), 4, true));
    return g;
  }
}

// ---------------------------------------------------------------- small helpers
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
/** soft patchy variation for the stone's tint (damp patches, lighter blocks) */
const patch = (x, y, z) => 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.23) * 2.1) * Math.sin(z * 0.41 + y * 0.29 + Math.sin(x * 0.17) * 1.7));
const rgbOf = hex => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A painted texture of stacked bones and rows of skulls (the ossuary walls). 1.6 m × 0.8 m a repeat. */
function boneTexture(size = 512) {
  const W = size, H = size / 2, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), R = rng(77);
  g.fillStyle = '#1c1712'; g.fillRect(0, 0, W, H);
  const bone = (x, y, len, th) => {
    const gr = g.createLinearGradient(0, y - th, 0, y + th);
    gr.addColorStop(0, '#f1e6cc'); gr.addColorStop(0.45, '#d9c9a6'); gr.addColorStop(1, '#8c7b5c');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(x, y - th * 0.55, len, th * 1.1, th * 0.5); g.fill();
    for (const ex of [x + th * 0.4, x + len - th * 0.4]) { g.beginPath(); g.arc(ex, y - th * 0.45, th * 0.62, 0, TAU); g.arc(ex, y + th * 0.45, th * 0.62, 0, TAU); g.fill(); }
  };
  const skull = (x, y, r) => {
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.2);
    gr.addColorStop(0, '#f5ecd6'); gr.addColorStop(0.6, '#d4c3a0'); gr.addColorStop(1, '#7d6c50');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, 0, TAU); g.fill();
    g.beginPath(); g.roundRect(x - r * 0.55, y + r * 0.55, r * 1.1, r * 0.55, r * 0.2); g.fill();
    g.fillStyle = '#17110c';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.38, y + r * 0.1, r * 0.26, r * 0.3, s * 0.3, 0, TAU); g.fill(); }
    g.beginPath(); g.moveTo(x, y + r * 0.42); g.lineTo(x - r * 0.12, y + r * 0.66); g.lineTo(x + r * 0.12, y + r * 0.66); g.fill();
    g.fillStyle = 'rgba(30,20,12,0.6)'; for (let k = -2; k <= 2; k++) g.fillRect(x + k * r * 0.2 - 1, y + r * 0.8, 2, r * 0.28);
  };
  // rows: bones, bones, skulls, bones, bones, skulls … wrapping seamlessly left-right (drawn twice across the seam)
  const rowsH = [0.13, 0.13, 0.22, 0.13, 0.13, 0.26];
  let y = 0;
  for (const [ri, hh] of rowsH.entries()) {
    const h = hh * H, cy = y + h / 2;
    if (hh > 0.2) { const r = h * 0.42, step = r * 2.25; for (let x = (ri % 2) * step / 2; x < W + step; x += step) { skull(x, cy + (R() - 0.5) * 3, r * (0.92 + R() * 0.12)); if (x - W > -step) skull(x - W, cy, r); } }
    else { let x = -R() * 40; while (x < W) { const len = 60 + R() * 70, th = h * (0.34 + R() * 0.12); bone(x, cy + (R() - 0.5) * h * 0.25, len, th); if (x + len > W) bone(x - W, cy, len, th); x += len * (0.55 + R() * 0.25); } }
    y += h;
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Flame (left half) + soft halo (right half), one picture for the instanced fire. */
function fireTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 96, 4, 32, 82, 62);
  gr.addColorStop(0, 'rgba(255,250,215,1)'); gr.addColorStop(0.22, 'rgba(255,196,90,0.95)'); gr.addColorStop(0.55, 'rgba(235,96,24,0.6)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(60, 60, 58, 122, 32, 124); g.bezierCurveTo(6, 122, 4, 60, 32, 6); g.fill();
  const h = g.createRadialGradient(96, 64, 0, 96, 64, 62);
  h.addColorStop(0, 'rgba(255,200,130,0.85)'); h.addColorStop(0.25, 'rgba(255,150,70,0.35)'); h.addColorStop(0.6, 'rgba(200,90,30,0.08)'); h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h; g.fillRect(64, 0, 64, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- the view
export function createDungeonView(view, { W, quality = 'medium' }) {
  const D = W.dungeon, P = D.plan, walk = D.walk;
  const Q = DUNGEON_GFX[quality] || DUNGEON_GFX.medium;
  const scene = view.scene, renderer = view.renderer;
  const root = new THREE.Group(); root.name = 'dungeon'; scene.add(root);
  const U = { bake: { value: DUNGEON_LOOK.bake }, time: { value: 0 }, cam: { value: new THREE.Vector3() } };

  // ---- the real lights: a fixed pool + the hero's lantern, made NOW (before anything compiles) and never removed
  const torchCol = new THREE.Color(DUNGEON_LOOK.torch);
  const pool = [];
  for (let i = 0; i < Q.lights; i++) {
    const l = new THREE.PointLight(torchCol, 0, DUNGEON_LOOK.light_distance, 2);
    l.name = 'dungeon torch light ' + i; l.castShadow = false; l.position.set(0, -500, 0);
    root.add(l); pool.push({ light: l, src: -1, w: 0, want: 0 });
  }
  const lantern = new THREE.PointLight(new THREE.Color(DUNGEON_LOOK.lantern), DUNGEON_LOOK.lantern_intensity, DUNGEON_LOOK.lantern_distance, 1.3);
  lantern.name = 'hero lantern'; lantern.castShadow = false; root.add(lantern);

  // ---- the view's sky, sun and shadows: off while we are down here (put back by dispose)
  const saved = {
    sunShadow: view.sun.castShadow, sky: view.sky.visible, hills: view.hills?.visible, hemiSky: view.hemi.color.clone(), hemiGround: view.hemi.groundColor.clone(),
    fog: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far, bg: scene.background?.isColor ? scene.background.clone() : scene.background,
    mist: ATMOS.uniforms.uAtMist.value.clone(), cloud: ATMOS.uniforms.uAtCloud.value.clone(),
    post: view.post ? { bloom: view.post.bloom.strength, cut: view.post.bloom.threshold, vig: view.post.grade.uVig.value, sat: view.post.grade.uSat.value, lift: view.post.grade.uLift.value } : null,
  };
  view.sun.castShadow = false;        // nothing to cast from: no sun underground (the shadow pass would only cost)

  const stats = { triangles: 0, chunks: 0, boneTris: 0, torches: 0, lights: Q.lights + 1, flames: 0, bakeMs: 0, buildMs: 0 };
  const chunks = [];
  const torches = [];                 // every light source: { x, y, z, col:[r,g,b], k, r0, R, pool }
  let flames = null, dust = null, shaft = null;
  const movers = { gates: [], secrets: [], levers: [] };
  let built = false;

  const ready = build().catch(e => { console.warn('dungeon draw', e); });

  async function build() {
    const t0 = performance.now();
    const kit = await loadHouseKit({ quality });
    const L = id => kit.looks[id] || kit.looks.stone;
    const R0 = rng(((P.seed || 1) * 2654435761) >>> 0);
    const keep = () => R0() < Q.clutter;

    // ------------------------------------------------------------ regions: rooms + corridors on the tile grid
    const N = P.cols * P.rows, regionOf = new Int16Array(N).fill(-1), regs = [];
    const roomById = new Map(P.rooms.map(r => [r.id, r]));
    const stairById = new Map(P.stairs.map(s => [s.id, s]));
    const rise = span => Math.min(span * 0.4, 7);
    for (const r of P.rooms) {
      const cols = P.columns.filter(c => c.room === r.id);
      const [x0, z0, x1, z1] = r.rect;
      const reg = { i: regs.length, type: 'room', id: r.id, kind: r.kind, rect: r.rect, y: r.y, ceil: r.ceiling, room: r, cols, stair: null };
      if (cols.length) {
        reg.vault = 'groin';
        const uniq = a => [...new Set(a.map(v => Math.round(v * 100) / 100))].sort((p, q) => p - q);
        reg.xs = [x0, ...uniq(cols.map(c => c.x)), x1]; reg.zs = [z0, ...uniq(cols.map(c => c.z)), z1];
      } else {
        reg.vault = 'barrel';
        reg.along = (x1 - x0) >= (z1 - z0) ? 'x' : 'z';
        reg.R = Math.min(Math.min(x1 - x0, z1 - z0) * 0.36, 8);
      }
      regs.push(reg);
      for (let k = r.tiles.z; k < r.tiles.z + r.tiles.h; k++) for (let i = r.tiles.x; i < r.tiles.x + r.tiles.w; i++) regionOf[k * P.cols + i] = reg.i;
    }
    for (const c of P.corridors) {
      const a = roomById.get(c.a), b = roomById.get(c.b);
      const stair = c.ramp ? stairById.get(`stair-${c.a}-${c.b}`) || null : null;
      const R = Math.max(0.6, Math.min(c.width * 0.4, 2.6, Math.min(a.ceiling, b.ceiling) - c.ceiling - 0.35));
      const reg = { i: regs.length, type: 'corridor', id: c.id, kind: 'corridor', rect: c.rect, y: a.y, ceil: c.ceiling, corridor: c, stair, vault: 'barrel', along: c.dir === 'E' || c.dir === 'W' ? 'x' : 'z', R, level: c.level, warren: !!(a.wing || b.wing) || a.kind === 'goblin_den' || b.kind === 'goblin_den' };
      regs.push(reg);
      for (let k = c.tiles.z; k < c.tiles.z + c.tiles.h; k++) for (let i = c.tiles.x; i < c.tiles.x + c.tiles.w; i++) regionOf[k * P.cols + i] = reg.i;
    }
    // the stone's courses are bigger in the big halls (small bricks made a 50 m hall look like a cellar)
    const TS = { pillared_hall: 1.8, troll_pit: 1.6, boss_hall: 1.8, hall: 1.5, chapel: 1.5, ossuary: 1.3, crypt: 1.2, entrance: 1.25, goblin_den: 1, corridor: 1.1 };
    for (const reg of regs) reg.ts = reg.warren ? 1 : TS[reg.kind] || 1;
    const floorAt = (reg, x, z) => (reg.stair ? rampY(reg.stair, x, z) : reg.y);
    function topAt(reg, x, z) {
      const base = floorAt(reg, x, z) + reg.ceil, [x0, z0, x1, z1] = reg.rect;
      if (reg.vault === 'groin') {
        const bi = bay(reg.xs, x), bj = bay(reg.zs, z);
        const xa = reg.xs[bi], xb = reg.xs[bi + 1], za = reg.zs[bj], zb = reg.zs[bj + 1];
        const u = clamp((x - (xa + xb) / 2) / ((xb - xa) / 2), -1, 1), v = clamp((z - (za + zb) / 2) / ((zb - za) / 2), -1, 1);
        return base + Math.max(rise(zb - za) * Math.sqrt(1 - v * v), rise(xb - xa) * Math.sqrt(1 - u * u));
      }
      const lo = reg.along === 'x' ? z0 : x0, hi = reg.along === 'x' ? z1 : x1, c = reg.along === 'x' ? z : x;
      const h = (hi - lo) / 2, v = clamp((c - (lo + h)) / h, -1, 1);
      return base + reg.R * Math.sqrt(1 - v * v);
    }
    function bay(lines, v) { for (let i = 0; i < lines.length - 2; i++) if (v < lines[i + 1]) return i; return lines.length - 2; }
    const regAt = (x, z) => { const t = walk.tileOf(x, z); return t < 0 ? null : regs[regionOf[t]] || null; };

    // ------------------------------------------------------------ chunks: one triangle list per 32 m square (+ bones, + kit parts)
    const chunkMap = new Map();
    function chunkOf(x, z) {
      const key = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
      let c = chunkMap.get(key);
      if (!c) { c = { key, stone: new Grow(), bones: null, parts: [] }; chunkMap.set(key, c); }
      return c;
    }
    const S = (x, z) => chunkOf(x, z).stone;
    const Bn = (x, z) => { const c = chunkOf(x, z); return c.bones || (c.bones = new Grow()); };
    const part = (x, z, p) => chunkOf(x, z).parts.push(p);

    // emitters ------------------------------------------------------------------------------------------------
    /** a quad a b c d (counter-clockwise seen from the front), flat normal, the House Kit's world-space texture axes */
    function quad(B, a, b, c, d, look, tint, shade = null, ts = 1) {
      const n = norm3(cross(sub(b, a), sub(c, a)));
      if (!Number.isFinite(n[0]) || (n[0] === 0 && n[1] === 0 && n[2] === 0)) return;
      const lk = L(look), m = lk.metres * ts;
      let tx, ty, tz, bx, by, bz;
      if (Math.abs(n[1]) > 0.92) { tx = 1; ty = 0; tz = 0; bx = 0; by = 0; bz = n[1] > 0 ? -1 : 1; }
      else { const t = norm3(cross([0, 1, 0], n)), bt = cross(n, t); [tx, ty, tz] = t; [bx, by, bz] = bt; }
      const [r, g, bl] = rgbOf(tint);
      for (const p of [a, b, c, a, c, d]) {
        const k = shade ? shade(p) : patch(p[0], p[1], p[2]);
        B.v(p[0], p[1], p[2], n[0], n[1], n[2], (p[0] * tx + p[1] * ty + p[2] * tz) / m, -(p[0] * bx + p[1] * by + p[2] * bz) / m, lk.rect, r * k, g * k, bl * k);
      }
    }
    /** a quad with its own normals and texture coordinates per corner: vs = [{p, n, uv}] ×4 */
    function quadN(B, vs, look, tint, shade = null, ts = 1) {
      const lk = L(look), [r, g, bl] = rgbOf(tint), m = lk.metres * ts;
      for (const j of [0, 1, 2, 0, 2, 3]) { const { p, n, uv } = vs[j]; const k = shade ? shade(p) : patch(p[0], p[1], p[2]); B.v(p[0], p[1], p[2], n[0], n[1], n[2], uv[0] / m, uv[1] / m, lk.rect, r * k, g * k, bl * k); }
    }
    const box = (w, h, d, p, ry = 0, m = 'stone', t = TINT.band, rx = 0, rz = 0) => ({ s: 'box', w, h, d, p, r: [rx, ry, rz], m, t });

    // ------------------------------------------------------------ the entrances' and exit's stairs up (cut into the rock behind a wall)
    const stairwells = [];
    const cut = new Map();            // "tileIndex,dir" → stairwell (the wall there is an opening, lintel above)
    for (const e of [...P.entrances, ...P.exits]) {
      const r = roomById.get(e.room); if (!r) continue;
      const [x0, z0, x1, z1] = r.rect;
      const side = [['W', e.at[0] - x0], ['E', x1 - e.at[0]], ['N', e.at[1] - z0], ['S', z1 - e.at[1]]].sort((a, b) => a[1] - b[1])[0][0];
      const horiz = side === 'N' || side === 'S';               // the wall runs along x
      const along = horiz ? e.at[0] : e.at[1];
      const lo = horiz ? x0 : z0, hi = horiz ? x1 : z1;
      const s0 = clamp(Math.round((along - 3) / TILE) * TILE, lo + 2, hi - 8), s1 = s0 + 6;
      const wallC = side === 'W' ? x0 : side === 'E' ? x1 : side === 'N' ? z0 : z1;
      const out = side === 'W' || side === 'N' ? -1 : 1;     // the rock is on this side of the wall line
      // how deep the rock behind is free (all rock, one tile of margin each side), up to 12 m
      let depth = 0;
      for (let d = 1; d <= 6; d++) {
        let ok = true;
        for (let s = s0 - TILE; s < s1 + TILE && ok; s += TILE) {
          const c = wallC + out * (d - 0.5) * TILE, x = horiz ? s + 1 : c, z = horiz ? c : s + 1;
          const t = walk.tileOf(x, z); if (t < 0 || P.cells[t] !== CODE.ROCK) ok = false;
        }
        if (!ok) break; depth = d;
      }
      const collapsed = !!e.collapsed;
      if (!collapsed && depth < 3) continue;
      const sw = { e, room: r, side, horiz, s0, s1, wall: wallC, out, depth: depth * TILE - 0.6, y: r.y, collapsed };
      stairwells.push(sw);
      if (collapsed) continue;
      for (let s = s0; s < s1; s += TILE) {
        const inC = wallC - out * 1, x = horiz ? s + 1 : inC, z = horiz ? inC : s + 1;
        cut.set(walk.tileOf(x, z) + ',' + side, sw);
      }
    }

    // ------------------------------------------------------------ floors (per tile, corner heights from the walk grid)
    const chasmF = P.features.find(f => f.kind === 'chasm');
    const bridge = chasmF?.bridge || null;
    const inRect = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;
    const DEPTH = chasmF?.depth || 30;
    for (let t = 0; t < N; t++) {
      const c = P.cells[t]; if (c === CODE.ROCK) continue;
      const reg = regs[regionOf[t]]; if (!reg) continue;
      const i = t % P.cols, k = (t / P.cols) | 0, x0 = i * TILE, z0 = k * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
      const cx = x0 + 1, cz = z0 + 1;
      const den = reg.kind === 'goblin_den' || reg.warren;
      if (c === CODE.CHASM || (bridge && inRect(cx, cz, bridge.rect))) {
        const y = reg.y - DEPTH;                               // the pit's floor, far below (also under the bridge)
        quad(S(cx, cz), [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 'fieldstone', TINT.pit);
        if (c === CODE.CHASM) continue;
      }
      const look = den ? 'cobbles' : reg.type === 'corridor' ? 'cobbles' : 'stone';
      const tint = den ? TINT.floorDen : TINT.floor;
      const y = (x, z) => floorAt(reg, clamp(x, x0 + 0.001, x1 - 0.001), clamp(z, z0 + 0.001, z1 - 0.001));
      quad(S(cx, cz), [x0, y(x0, z1), z1], [x1, y(x1, z1), z1], [x1, y(x1, z0), z0], [x0, y(x0, z0), z0], look, tint, null, reg.ts);
    }

    // ------------------------------------------------------------ walls: every tile edge where open space meets rock (or a lower region)
    const DIRS = [['E', 1, 0], ['W', -1, 0], ['S', 0, 1], ['N', 0, -1]];
    const runsMap = new Map();         // rock-edge runs, for skirting, pilasters, sconces, niches
    const rowOff = Q.rows;
    /** one tile edge as a strip of quads: bottom(x,z) → top(x,z), split in rows for the baked light */
    function wallEdge(B, p0, p1, n, bottomF, topF, look, tint, floorF, ts = 1) {
      // order the two ends so the face looks along n
      if (-(p1[1] - p0[1]) * n[0] + (p1[0] - p0[0]) * n[1] < 0) [p0, p1] = [p1, p0];
      const segs = 2, pts = [];
      for (let s = 0; s <= segs; s++) { const x = p0[0] + (p1[0] - p0[0]) * s / segs, z = p0[1] + (p1[1] - p0[1]) * s / segs; const b = bottomF(x, z), tp = topF(x, z), f = floorF(x, z); pts.push({ x, z, hs: [b, ...rowOff.map(o => clamp(f + o, b, tp)), tp] }); }
      for (let s = 0; s < segs; s++) {
        const A = pts[s], Bp = pts[s + 1];
        for (let r = 0; r < A.hs.length - 1; r++) {
          if (A.hs[r + 1] - A.hs[r] < 1e-3 && Bp.hs[r + 1] - Bp.hs[r] < 1e-3) continue;
          const a = [A.x, A.hs[r], A.z], b = [Bp.x, Bp.hs[r], Bp.z], c = [Bp.x, Bp.hs[r + 1], Bp.z], d = [A.x, A.hs[r + 1], A.z];
          const lk = L(look), m = lk.metres * ts, [cr, cg, cb] = rgbOf(tint);
          for (const p of [a, b, c, a, c, d]) {
            const f = floorF(p[0], p[2]);
            const k = patch(p[0], p[1], p[2]) * (0.72 + 0.28 * clamp((p[1] - f) / 1.4, 0, 1));    // damp, darker foot of the wall
            B.v(p[0], p[1], p[2], n[0], 0, n[1], (p[0] * n[1] - p[2] * n[0]) / m, -p[1] / m, lk.rect, cr * k, cg * k, cb * k);
          }
        }
      }
    }
    const OVER = 0.45;                 // walls reach this far past the vault's line (hidden above it: no hairline gaps)
    for (let t = 0; t < N; t++) {
      const c = P.cells[t]; if (c === CODE.ROCK) continue;
      const reg = regs[regionOf[t]]; if (!reg) continue;
      const i = t % P.cols, k = (t / P.cols) | 0, cx = (i + 0.5) * TILE, cz = (k + 0.5) * TILE;
      const isPit = c === CODE.CHASM;
      const isBridge = bridge && !isPit && inRect(cx, cz, bridge.rect);
      const den = reg.kind === 'goblin_den' || reg.warren || reg.kind === 'troll_pit';
      const wallLook = den ? 'fieldstone' : 'stone', wallTint = den ? TINT.wallDen : TINT.wall;
      const B = S(cx, cz);
      for (const [dn, di, dk] of DIRS) {
        const ni = i + di, nk = k + dk, nt = ni < 0 || nk < 0 || ni >= P.cols || nk >= P.rows ? -1 : nk * P.cols + ni;
        const nc = nt < 0 ? CODE.ROCK : P.cells[nt];
        // the shared edge's ends and the normal into this tile
        const ex = di === 1 ? (i + 1) * TILE : di === -1 ? i * TILE : null, ez = dk === 1 ? (k + 1) * TILE : dk === -1 ? k * TILE : null;
        const p0 = ex != null ? [ex, k * TILE] : [i * TILE, ez], p1 = ex != null ? [ex, (k + 1) * TILE] : [(i + 1) * TILE, ez];
        const n = [-di, -dk];
        const fl = (x, z) => floorAt(reg, x, z), top = (x, z) => topAt(reg, x, z) + OVER;
        if (nc === CODE.ROCK) {
          const sw = cut.get(t + ',' + dn);
          const bottom = sw ? (x, z) => sw.y + 4.6 : isPit ? (x, z) => fl(x, z) - DEPTH - 0.5 : (x, z) => fl(x, z) - 0.3;
          wallEdge(B, p0, p1, n, bottom, top, isPit ? 'fieldstone' : wallLook, isPit ? TINT.pit : wallTint, fl, reg.ts);
          if (!sw && !isPit) {
            // a rock edge: remember it for the runs (line key: region, side, wall line)
            const line = ex != null ? ex : ez, key = `${reg.i}|${dn}|${line}`;
            if (!runsMap.has(key)) runsMap.set(key, { reg, dn, n, line, along: ex != null ? 'z' : 'x', segs: [] });
            runsMap.get(key).segs.push(ex != null ? k * TILE : i * TILE);
          }
          continue;
        }
        const nreg = regs[regionOf[nt]];
        const nPit = nc === CODE.CHASM;
        if (isPit && !nPit) {
          const nBridge = bridge && inRect((ni + 0.5) * TILE, (nk + 0.5) * TILE, bridge.rect);
          if (nBridge) continue;                                 // the bridge's own sides are drawn with the bridge
          // the pit's wall below the rim of the floor next to it
          wallEdge(B, p0, p1, n, (x, z) => fl(x, z) - DEPTH - 0.5, (x, z) => fl(x, z) + 0.02, 'fieldstone', TINT.pit, (x, z) => fl(x, z) - DEPTH);
          continue;
        }
        if (isBridge && nPit) continue;
        if (!nreg || nreg === reg) continue;
        // two regions meet (a door): the higher one gets the face over the lower one's opening
        const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
        if (topAt(reg, mx, mz) <= topAt(nreg, mx, mz)) continue;
        wallEdge(B, p0, p1, n, (x, z) => topAt(nreg, x, z) - 0.15, top, wallLook, wallTint, fl, reg.ts);
      }
    }
    // merge the rock edges into straight runs
    const runs = [];
    for (const R of runsMap.values()) {
      R.segs.sort((a, b) => a - b);
      let a0 = R.segs[0], a1 = a0 + TILE;
      for (let j = 1; j <= R.segs.length; j++) {
        const s = R.segs[j];
        if (s === a1) { a1 += TILE; continue; }
        runs.push({ reg: R.reg, dn: R.dn, n: R.n, line: R.line, along: R.along, a0, a1 });
        if (s != null) { a0 = s; a1 = s + TILE; }
      }
    }
    const runPt = (R, s, out = 0, ) => (R.along === 'x' ? [s, R.line + R.n[1] * out] : [R.line + R.n[0] * out, s]);
    const runYaw = R => Math.atan2(R.n[0], R.n[1]);         // a part's +z looks out of the wall
    /** is the wall at (s) on this run solid rock (not a door) — for pilasters and sconces */
    const solidAt = (R, s) => s > R.a0 + 0.3 && s < R.a1 - 0.3;

    // ------------------------------------------------------------ vaults
    const SEG = Q.seg;
    function barrelVault(reg) {
      const [x0, z0, x1, z1] = reg.rect, ax = reg.along === 'x';
      const a0 = (ax ? x0 : z0) - 0.1, a1 = (ax ? x1 : z1) + 0.1, lo = ax ? z0 : x0, hi = ax ? z1 : x1;
      const h = (hi - lo) / 2, mid = lo + h, R = reg.R;
      const look = reg.warren || reg.kind === 'goblin_den' ? 'fieldstone' : 'stone', tint = reg.warren || reg.kind === 'goblin_den' ? TINT.wallDen : TINT.vault;
      const steps = Math.max(2, Math.ceil((a1 - a0) / TILE));
      // cumulative arc length for the texture across
      const th = Array.from({ length: SEG + 1 }, (_, j) => Math.PI * j / SEG);
      const arc = [0]; for (let j = 1; j <= SEG; j++) { const p = Math.hypot(h * (Math.cos(th[j - 1]) - Math.cos(th[j])), R * (Math.sin(th[j]) - Math.sin(th[j - 1]))); arc.push(arc[j - 1] + p); }
      const P3 = (a, j) => {
        const c = mid - h * Math.cos(th[j]), x = ax ? a : c, z = ax ? c : a;
        const y = floorAt(reg, clamp(x, x0 + 0.01, x1 - 0.01), clamp(z, z0 + 0.01, z1 - 0.01)) + reg.ceil + R * Math.sin(th[j]);
        const nc = Math.cos(th[j]) / h, ny = -Math.sin(th[j]) / R, l = Math.hypot(nc, ny);
        return { p: [x, y, z], n: ax ? [0, ny / l, nc / l] : [nc / l, ny / l, 0], uv: [a, arc[j]] };
      };
      for (let s = 0; s < steps; s++) {
        const aa = a0 + (a1 - a0) * s / steps, ab = a0 + (a1 - a0) * (s + 1) / steps;
        for (let j = 0; j < SEG; j++) {
          const v00 = P3(aa, j), v10 = P3(ab, j), v11 = P3(ab, j + 1), v01 = P3(aa, j + 1);
          // seen from below: order so the face looks along the normal
          const ord = ax ? [v00, v01, v11, v10] : [v00, v10, v11, v01];
          const nn = norm3(cross(sub(ord[1].p, ord[0].p), sub(ord[2].p, ord[0].p)));
          const vs = dot(nn, v00.n) >= 0 ? ord : [ord[0], ord[3], ord[2], ord[1]];
          const cxq = (v00.p[0] + v11.p[0]) / 2, czq = (v00.p[2] + v11.p[2]) / 2;
          quadN(S(cxq, czq), vs, look, tint, p => patch(p[0], p[1], p[2]) * 0.9, reg.ts);
        }
      }
      return { mid, h, R, a0: a0 + 0.1, a1: a1 - 0.1, th, P3 };
    }
    /**
     * A rib along a curve of points: a band hanging under the vault (bottom face + two sides). The sides reach `over`
     * up into the stone above (hidden there: no hairline gap); radial = they reach out from the curve instead (a door's
     * arch ring, whose sides are its front and back).
     */
    function rib(B, pts, l, centre, w, hgt, over, look = 'stone', tint = TINT.rib, radial = false) {
      const n = pts.length;
      const T = pts.map((p, j) => sub(pts[Math.min(n - 1, j + 1)], pts[Math.max(0, j - 1)]));
      const d = pts.map((p, j) => { let v = norm3(cross(T[j], l)); if (dot(v, sub(centre, p)) < 0) v = [-v[0], -v[1], -v[2]]; return v; });
      const at = (j, sl, sd) => (sd < 0 && !radial
        ? [pts[j][0] + l[0] * sl, pts[j][1] + l[1] * sl - sd, pts[j][2] + l[2] * sl]
        : [pts[j][0] + l[0] * sl + d[j][0] * sd, pts[j][1] + l[1] * sl + d[j][1] * sd, pts[j][2] + l[2] * sl + d[j][2] * sd]);
      let acc = 0;
      for (let j = 0; j < n - 1; j++) {
        const segL = Math.hypot(...sub(pts[j + 1], pts[j]));
        const u0 = acc, u1 = acc + segL; acc = u1;
        // bottom
        const bot = [{ p: at(j, w, hgt), n: d[j], uv: [u0, 0] }, { p: at(j + 1, w, hgt), n: d[j + 1], uv: [u1, 0] }, { p: at(j + 1, -w, hgt), n: d[j + 1], uv: [u1, 2 * w] }, { p: at(j, -w, hgt), n: d[j], uv: [u0, 2 * w] }];
        orient(bot, d[j]); quadN(B, bot, look, tint);
        for (const sgn of [1, -1]) {
          const nn = [l[0] * sgn, l[1] * sgn, l[2] * sgn];
          const side = [{ p: at(j, sgn * w, -over), n: nn, uv: [u0, 0] }, { p: at(j + 1, sgn * w, -over), n: nn, uv: [u1, 0] }, { p: at(j + 1, sgn * w, hgt), n: nn, uv: [u1, hgt + over] }, { p: at(j, sgn * w, hgt), n: nn, uv: [u0, hgt + over] }];
          orient(side, nn); quadN(B, side, look, tint);
        }
      }
    }
    function orient(vs, want) {
      const nn = cross(sub(vs[1].p, vs[0].p), sub(vs[2].p, vs[0].p));
      if (dot(nn, want) < 0) { const t = vs[1]; vs[1] = vs[3]; vs[3] = t; }
    }
    function groinVault(reg) {
      const n = Q.bay, look = 'stone', tint = TINT.vault;
      const { xs, zs } = reg;
      for (let bi = 0; bi < xs.length - 1; bi++) for (let bj = 0; bj < zs.length - 1; bj++) {
        const xa = xs[bi] - (bi === 0 ? 0.1 : 0), xb = xs[bi + 1] + (bi === xs.length - 2 ? 0.1 : 0);
        const za = zs[bj] - (bj === 0 ? 0.1 : 0), zb = zs[bj + 1] + (bj === zs.length - 2 ? 0.1 : 0);
        const xm = (xs[bi] + xs[bi + 1]) / 2, zm = (zs[bj] + zs[bj + 1]) / 2;
        const V = (iu, iv) => {
          // the grid is even in normalised bay coordinates (creases run along its diagonals)
          const uN = -1 + 2 * iu / n, vN = -1 + 2 * iv / n;
          const x = clamp(xm + uN * (xs[bi + 1] - xs[bi]) / 2, xa, xb), z = clamp(zm + vN * (zs[bj + 1] - zs[bj]) / 2, za, zb);
          const xi = bi === 0 && iu === 0 ? xa : bi === xs.length - 2 && iu === n ? xb : x;
          const zi = bj === 0 && iv === 0 ? za : bj === zs.length - 2 && iv === n ? zb : z;
          const y = topAt(reg, clamp(xi, xs[bi] + 0.001, xs[bi + 1] - 0.001), clamp(zi, zs[bj] + 0.001, zs[bj + 1] - 0.001));
          const e = 0.06, fx = (topAt(reg, clamp(xi + e, xs[bi] + 0.001, xs[bi + 1] - 0.001), zi) - topAt(reg, clamp(xi - e, xs[bi] + 0.001, xs[bi + 1] - 0.001), zi)) / (2 * e);
          const fz = (topAt(reg, xi, clamp(zi + e, zs[bj] + 0.001, zs[bj + 1] - 0.001)) - topAt(reg, xi, clamp(zi - e, zs[bj] + 0.001, zs[bj + 1] - 0.001))) / (2 * e);
          return { p: [xi, y, zi], n: norm3([fx, -1, fz]), uv: [xi, zi], uN, vN };
        };
        const grid = []; for (let iu = 0; iu <= n; iu++) { grid.push([]); for (let iv = 0; iv <= n; iv++) grid[iu].push(V(iu, iv)); }
        for (let iu = 0; iu < n; iu++) for (let iv = 0; iv < n; iv++) {
          const a = grid[iu][iv], b = grid[iu + 1][iv], c = grid[iu + 1][iv + 1], d = grid[iu][iv + 1];
          const qu = (a.uN + c.uN) / 2, qv = (a.vN + c.vN) / 2;
          const B = S((a.p[0] + c.p[0]) / 2, (a.p[2] + c.p[2]) / 2);
          // split along the crease's direction in this quarter of the bay
          const tris = qu * qv > 0 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
          for (const [p, q, r] of tris) { const nn = cross(sub(q.p, p.p), sub(r.p, p.p)); const want = [p.n[0] + q.n[0] + r.n[0], p.n[1] + q.n[1] + r.n[1], p.n[2] + q.n[2] + r.n[2]]; triN(B, dot(nn, want) >= 0 ? [p, q, r] : [p, r, q], look, tint, reg.ts); }
        }
        // ribs: the two diagonals of the bay, and the arch along each inner bay line
        const base = reg.y + reg.ceil, ctr = [xm, base, zm], B = S(xm, zm);
        const W2 = (xs[bi + 1] - xs[bi]) / 2, D2 = (zs[bj + 1] - zs[bj]) / 2;
        for (const sgn of [1, -1]) {
          const pts = [];
          for (let j = 0; j <= 16; j++) { const t = -1 + 2 * j / 16; const x = xm + t * W2, z = zm + sgn * t * D2; pts.push([x, topAt(reg, clamp(x, xs[bi] + 0.001, xs[bi + 1] - 0.001), clamp(z, zs[bj] + 0.001, zs[bj + 1] - 0.001)), z]); }
          const g = norm3([W2, 0, sgn * D2]);
          rib(B, pts, [-g[2], 0, g[0]], ctr, 0.28, 0.32, 1.2);
        }
        // a carved boss where the ribs cross
        part(xm, zm, { s: 'blob', rad: 0.55, p: [xm, topAt(reg, xm, zm) - 0.38, zm], r: [0, 0, 0], m: 'stone', t: TINT.rib });
        // the transverse arches along this bay's inner edges (each inner line once: the bay's low-x and low-z edges)
        if (bi > 0) {
          const pts = []; for (let j = 0; j <= 16; j++) { const th = Math.PI * j / 16; const z = zm - D2 * Math.cos(th); pts.push([xs[bi], base + rise(2 * D2) * Math.sin(th), z]); }
          rib(B, pts, [1, 0, 0], [xs[bi], base, zm], 0.42, 0.4, 1.4);
        }
        if (bj > 0) {
          const pts = []; for (let j = 0; j <= 16; j++) { const th = Math.PI * j / 16; const x = xm - W2 * Math.cos(th); pts.push([x, base + rise(2 * W2) * Math.sin(th), zs[bj]]); }
          rib(B, pts, [0, 0, 1], [xm, base, zs[bj]], 0.42, 0.4, 1.4);
        }
      }
      // a hanging pendant where an inner bay corner has no column (the troll pit's open ring)
      for (let bi = 1; bi < xs.length - 1; bi++) for (let bj = 1; bj < zs.length - 1; bj++) {
        const x = xs[bi], z = zs[bj];
        if (reg.cols.some(c => Math.hypot(c.x - x, c.z - z) < 0.5)) continue;
        if (chasmF && inRect(x, z, chasmF.rect, 1)) { /* over the pit: a pendant too */ }
        const y = reg.y + reg.ceil;
        part(x, z, { s: 'cone', rb: 0.9, h: 2.6, n: 8, p: [x, y - 1.0, z], r: [Math.PI, 0, 0], m: 'stone', t: TINT.rib });
        part(x, z, { s: 'blob', rad: 0.5, p: [x, y - 2.4, z], r: [0, 0, 0], m: 'stone', t: TINT.rib });
      }
    }
    function triN(B, vs, look, tint, ts = 1) {
      const lk = L(look), [r, g, bl] = rgbOf(tint), m = lk.metres * ts;
      for (const { p, n, uv } of vs) { const k = patch(p[0], p[1], p[2]) * 0.9; B.v(p[0], p[1], p[2], n[0], n[1], n[2], uv[0] / m, uv[1] / m, lk.rect, r * k, g * k, bl * k); }
    }
    const vaults = new Map();
    for (const reg of regs) {
      if (reg.vault === 'groin') groinVault(reg);
      else vaults.set(reg, barrelVault(reg));
    }
    // transverse ribs on the barrel vaults (rooms every ~4.5 m, corridors every 4 m) — and where they land, pilasters
    const ribAt = new Map();          // reg → [along positions]
    for (const [reg, V] of vaults) {
      const len = V.a1 - V.a0, every = reg.type === 'corridor' ? 4 : 4.6;
      const n = Math.max(1, Math.round(len / every) - 1);
      const at = Array.from({ length: n }, (_, j) => V.a0 + len * (j + 1) / (n + 1));
      ribAt.set(reg, at);
      const ax = reg.along === 'x';
      for (const a of at) {
        const pts = V.th.map((_, j) => V.P3(a, j).p);
        const c = ax ? [a, floorAt(reg, a, V.mid) + reg.ceil, V.mid] : [V.mid, floorAt(reg, V.mid, a) + reg.ceil, a];
        rib(S(c[0], c[2]), pts, ax ? [1, 0, 0] : [0, 0, 1], c, reg.type === 'corridor' ? 0.3 : 0.38, reg.type === 'corridor' ? 0.26 : 0.34, 1.0, reg.warren || reg.kind === 'goblin_den' ? 'planks' : 'stone', reg.warren || reg.kind === 'goblin_den' ? TINT.wood : TINT.rib);
      }
    }

    // ------------------------------------------------------------ columns (base, shaft with a little swell, flared capital)
    function lathe(B, x, z, y0, prof, look, tint, rU = 1, ts = 1) {
      const n = Q.lathe, lk = L(look), m = lk.metres * ts, [r, g, bl] = rgbOf(tint);
      for (let s = 0; s < prof.length - 1; s++) {
        const [ra, ya] = prof[s], [rb, yb] = prof[s + 1];
        const dy = yb - ya, dr = rb - ra, ln = Math.hypot(dy, dr) || 1;
        const nr = dy / ln, ny = -dr / ln;                                       // the profile's outward normal
        for (let i = 0; i < n; i++) {
          const a0 = TAU * i / n, a1 = TAU * (i + 1) / n;
          const V = (a, rr, yy) => { const sx = Math.sin(a), cz = Math.cos(a); return { p: [x + sx * rr, y0 + yy, z + cz * rr], n: [sx * nr, ny, cz * nr], uv: [a * rU, -yy] }; };
          const vs = [V(a0, ra, ya), V(a1, ra, ya), V(a1, rb, yb), V(a0, rb, yb)];
          // seen from outside: a0→a1 runs clockwise looking down; order for an outward face
          const nn = cross(sub(vs[1].p, vs[0].p), sub(vs[3].p, vs[0].p));
          const out = [vs[0].n[0] + vs[1].n[0], vs[0].n[1] + vs[1].n[1], vs[0].n[2] + vs[1].n[2]];
          const ord = dot(nn, out) >= 0 ? [vs[0], vs[1], vs[2], vs[3]] : [vs[0], vs[3], vs[2], vs[1]];
          for (const j of [0, 1, 2, 0, 2, 3]) { const { p, n: nv, uv } = ord[j]; const k = patch(p[0], p[1], p[2]); B.v(p[0], p[1], p[2], nv[0], nv[1], nv[2], uv[0] / m, uv[1] / m, lk.rect, r * k, g * k, bl * k); }
        }
      }
    }
    for (const c of P.columns) {
      const reg = regAt(c.x, c.z); const y0 = reg ? floorAt(reg, c.x, c.z) : 0, r = c.r, h = c.h;
      const prof = [[r + 0.05, -0.3], [r + 0.3, -0.2], [r + 0.3, 0.42], [r + 0.16, 0.55], [r + 0.16, 0.78], [r + 0.04, 0.95], [r, 1.15], [r * 1.025, h * 0.4], [r * 0.985, h - 1.9], [r * 1.06, h - 1.75], [r * 1.06, h - 1.55], [r * 1.5, h - 0.42], [r * 1.62, h - 0.42], [r * 1.62, h + 0.3]];
      lathe(S(c.x, c.z), c.x, c.z, y0, prof, 'stone', TINT.column, r, 1.5);
    }

    // ------------------------------------------------------------ room and corridor trim: skirting, cornices, pilasters, responds
    const sconces = [];                // { x, y, z, yaw } — torches on walls / pilasters / columns
    for (const R of runs) {
      const reg = R.reg, yaw = runYaw(R), ax = R.along === 'x';
      const len = R.a1 - R.a0, mid = (R.a0 + R.a1) / 2;
      const den = reg.kind === 'goblin_den' || reg.warren || reg.kind === 'troll_pit';
      // skirting along the foot of the wall (proud 0.14), its height a few cm different on x and z runs (rule 83)
      const [mx, mz] = runPt(R, mid, 0.06);
      const fy = floorAt(reg, mx, mz);
      if (reg.type !== 'corridor' || !reg.stair) {
        const lo = fy - 0.3 - (ax ? 0 : 0.03), hi = fy + 0.55 + (ax ? 0 : 0.03);   // (x and z runs cross at corners: no shared top or bottom)
        // (2 cm short at each end: its end never lies in the plane of a pit's wall, a frame's side or the next wall)
        part(mx, mz, box(len - 0.04, hi - lo, 0.14, [mx, (lo + hi) / 2, mz], yaw, den ? 'fieldstone' : 'stone', TINT.band));
      }
      // pilasters (barrel rooms + corridors: under each rib, on the walls the vault springs from)
      if (reg.vault === 'barrel') {
        const sideWall = (reg.along === 'x') === ax;       // a wall running along the vault's axis
        if (sideWall) for (const a of ribAt.get(reg) || []) {
          if (!solidAt(R, a)) continue;
          const pw = reg.type === 'corridor' ? 0.7 : 1.0, pd = reg.type === 'corridor' ? 0.28 : 0.38;
          if (a - pw / 2 < R.a0 + 0.05 || a + pw / 2 > R.a1 - 0.05) continue;
          const [px, pz] = runPt(R, a, pd / 2);
          const f = floorAt(reg, px, pz), top = f + reg.ceil;
          part(px, pz, box(pw, top - f + 0.3, pd, [px, f + (top - f) / 2 - 0.15, pz], yaw, den ? 'fieldstone' : 'stone', TINT.band));
          const [qx, qz] = runPt(R, a, (pd + 0.2) / 2);
          part(qx, qz, box(pw + 0.3, 0.5, pd + 0.2, [qx, top - 0.25 + 0.02, qz], yaw, 'stone', TINT.rib));     // its capital (a corbel the rib lands on)
          if (reg.type === 'room') sconces.push({ x: px + R.n[0] * pd / 2, z: pz + R.n[1] * pd / 2, y: f + (reg.kind === 'ossuary' ? 3.75 : 3.1), yaw, reg, run: R, s: a });   // (above the bone walls' coping)
        }
        if (!sideWall && len >= 6 && reg.type === 'room') {
          // an end wall: torches either side of its middle (or one in the middle when short)
          const spots = len >= 14 ? [mid - len * 0.25, mid + len * 0.25] : [mid];
          for (const s of spots) if (solidAt(R, s) && s > R.a0 + 1 && s < R.a1 - 1) { const [px, pz] = runPt(R, s, 0); sconces.push({ x: px, z: pz, y: floorAt(reg, px, pz) + (reg.kind === 'ossuary' ? 3.75 : 3.1), yaw, reg, run: R, s }); }
        }
      } else {
        // groin halls: a respond (half pier) where each bay line meets the wall
        const lines = ax ? reg.xs.slice(1, -1) : reg.zs.slice(1, -1);
        for (const a of lines) {
          if (!solidAt(R, a) || a - 0.9 < R.a0 || a + 0.9 > R.a1) continue;
          const [px, pz] = runPt(R, a, 0.25);
          const f = floorAt(reg, px, pz), top = f + reg.ceil;
          part(px, pz, box(1.5, top - f + 0.3, 0.5, [px, f + (top - f) / 2 - 0.15, pz], yaw, 'stone', TINT.column));
          const [qx, qz] = runPt(R, a, 0.42);
          part(qx, qz, box(2.1, 0.7, 0.84, [qx, top - 0.35 + 0.02, qz], yaw, 'stone', TINT.rib));
          sconces.push({ x: px + R.n[0] * 0.25, z: pz + R.n[1] * 0.25, y: f + 3.4, yaw, reg, run: R, s: a });
        }
      }
      // corridors: a torch every ~10 m, sides taking turns
      if (reg.type === 'corridor' && len >= 6) {
        const n = Math.max(1, Math.round(len / 10));
        for (let j = 0; j < n; j++) {
          if ((j + (R.dn === 'N' || R.dn === 'W' ? 1 : 0)) % 2) continue;
          let s = R.a0 + len * (j + 0.5) / n;
          const near = (ribAt.get(reg) || []).find(a => Math.abs(a - s) < 0.8); if (near != null) s = near + (s > near ? 0.9 : -0.9);
          if (!solidAt(R, s)) continue;
          const [px, pz] = runPt(R, s, 0); sconces.push({ x: px, z: pz, y: floorAt(reg, px, pz) + 2.9, yaw, reg, run: R, s });
        }
      }
    }
    // cornices round every room and along every corridor at the spring line (the rect edges: over doors too)
    for (const reg of regs) {
      if (reg.stair) continue;
      const [x0, z0, x1, z1] = reg.rect, y = reg.y + reg.ceil;
      const den = reg.kind === 'goblin_den' || reg.warren;
      const edges = reg.type === 'corridor'
        ? (reg.along === 'x' ? [['x', z0, 1], ['x', z1, -1]] : [['z', x0, 1], ['z', x1, -1]])
        : [['x', z0, 1], ['x', z1, -1], ['z', x0, 1], ['z', x1, -1]];
      for (const [ax, line, sgn] of edges) {
        // (a corridor's cornice stops 6 cm short of each end: its end would lie in the room's face over the door)
        const trim = reg.type === 'corridor' ? 0.06 : ax === 'z' ? 0.02 : 0;        // (a room's z cornices stop inside the x ones at the corners)
        const a0 = (ax === 'x' ? x0 : z0) + trim, a1 = (ax === 'x' ? x1 : z1) - trim, h = 0.42, d = 0.3, dy = ax === 'x' ? 0 : 0.03;
        const c = (a0 + a1) / 2, px = ax === 'x' ? c : line + sgn * d / 2, pz = ax === 'x' ? line + sgn * d / 2 : c;
        part(px, pz, box(ax === 'x' ? a1 - a0 : d, h, ax === 'x' ? d : a1 - a0, [px, y - 0.1 + dy, pz], 0, den ? 'fieldstone' : 'stone', TINT.band));
      }
    }

    // ------------------------------------------------------------ arched frames where a corridor opens into a room
    for (const d of P.doors) {
      if (d.kind === 'secret') continue;
      const reg = regs.find(r => r.id === d.room), creg = regs.find(r => r.id === d.corridor);
      if (!reg || !creg) continue;
      const out = [Math.sin(d.facing), Math.cos(d.facing)];          // from the room into the corridor
      const lat = [out[1], -out[0]];
      const [dx, dz] = d.at, hw = d.width / 2, f = floorAt(reg, dx - out[0] * 0.5, dz - out[1] * 0.5);
      const yaw = Math.atan2(-out[0], -out[1]);
      const spring = f + creg.ceil, Rr = creg.R;
      // jambs either side of the opening, 0.2 m proud of the room's wall
      for (const sg of [-1, 1]) {
        const jx = dx + lat[0] * sg * (hw + 0.43) - out[0] * 0.1, jz = dz + lat[1] * sg * (hw + 0.43) - out[1] * 0.1;
        part(jx, jz, box(0.8, spring - f + 0.3, 0.2, [jx, f + (spring - f) / 2 - 0.15, jz], yaw, 'stone', TINT.rib));
        part(jx, jz, box(1.0, 0.36, 0.3, [jx - out[0] * 0.05, spring + 0.05, jz - out[1] * 0.05], yaw, 'stone', TINT.band));   // the impost
      }
      // the arch ring: voussoirs following the corridor vault's line at the door, 0.75 m deep ring, 0.16 m proud
      const pts = [], ctr = [dx - out[0] * 0.09, spring, dz - out[1] * 0.09];
      for (let j = 0; j <= 18; j++) { const th = Math.PI * j / 18, l = -Math.cos(th) * (hw + 0.375); pts.push([ctr[0] + lat[0] * l, spring + (Rr + 0.375) * Math.sin(th), ctr[2] + lat[1] * l]); }
      rib(S(dx, dz), pts, [out[0], 0, out[1]], [ctr[0], spring - 1, ctr[2]], 0.07, 0.375, 0.375, 'stone', TINT.rib, true);
      part(dx, dz, box(0.7, 0.9, 0.24, [ctr[0] - out[0] * 0.04, spring + Rr + 0.6, ctr[2] - out[1] * 0.04], yaw, 'stone', TINT.band));   // keystone
    }

    // ------------------------------------------------------------ stairs up at the entrance and the exit; the fallen grave's rubble + shaft
    for (const sw of stairwells) {
      const { horiz, s0, s1, wall, out, depth, y } = sw;
      const P2 = (s, d) => (horiz ? [s, wall + out * d] : [wall + out * d, s]);      // s along the wall, d into the rock
      const B = S(...P2((s0 + s1) / 2, 1));
      if (sw.collapsed) {
        // a mound of fallen stone against the wall, a broken column drum, and the daylight from the hole above
        // (the arrival spot is 5 m out from this wall: the mound keeps to the wall's first 3.5 m, the shaft falls on it)
        const [cx, cz] = P2((s0 + s1) / 2, 0);
        const into = [-(horiz ? 0 : out), -(horiz ? out : 0)], along = horiz ? [1, 0] : [0, 1];
        const mound = (u, v) => [cx + along[0] * u + into[0] * v, cz + along[1] * u + into[1] * v];
        for (let j = 0; j < 46; j++) {
          const u = (R0() - 0.5) * 11, v = 0.4 + Math.pow(R0(), 1.4) * 3.1, hgt = Math.max(0, 3.2 * (1 - v / 3.6) * (1 - Math.abs(u) / 6.5));
          const [px, pz] = mound(u, v), sz = 0.3 + R0() * 0.75;
          part(px, pz, { s: 'blob', rad: sz, p: [px, y + hgt * 0.85 + sz * 0.3, pz], r: [R0(), R0() * 3, R0()], m: R0() < 0.6 ? 'stone' : 'fieldstone', t: TINT.rubble });
        }
        // fallen blocks and a broken column drum on the slope
        for (let j = 0; j < 7; j++) { const [px, pz] = mound((R0() - 0.5) * 9, 1 + R0() * 2.4); part(px, pz, box(0.9 + R0() * 0.8, 0.55, 0.6 + R0() * 0.5, [px, y + 0.25 + R0() * 1.2, pz], R0() * 3, 'stone', TINT.band, (R0() - 0.5) * 0.6, (R0() - 0.5) * 0.5)); }
        { const [px, pz] = mound(3.4, 2.4); part(px, pz, { s: 'cyl', rt: 0.9, rb: 0.95, h: 1.5, n: 12, p: [px, y + 0.8, pz], r: [0, 0.5, Math.PI / 2 * 0.9], m: 'stone', t: TINT.column }); }
        const [sx2, sz2] = mound(0, 2.2);
        torches.push({ x: sx2, y: y + 7, z: sz2, col: new THREE.Color(DUNGEON_LOOK.shaft), k: 2.6, r0: 5, R: 22, pool: true, kind: 'shaft' });
        sw.shaftAt = [sx2, sz2];
        continue;
      }
      const W0 = s0, W1 = s1, steps = Math.floor(depth / 0.5);
      for (let j = 0; j < steps; j++) {
        const da = j * 0.5, db = da + 0.5, yt = y + 0.32 * (j + 1);
        const a = P2(W0, da), b = P2(W1, da), c = P2(W1, db), dd = P2(W0, db);
        const rise0 = y + 0.32 * j;
        // tread (up) and riser (facing the room)
        const tread = [[a[0], yt, a[1]], [b[0], yt, b[1]], [c[0], yt, c[1]], [dd[0], yt, dd[1]]];
        if (dot(cross(sub(tread[1], tread[0]), sub(tread[2], tread[0])), [0, 1, 0]) < 0) tread.reverse();
        quad(B, ...tread, 'stone', TINT.floor);
        const riser = [[a[0], rise0, a[1]], [b[0], rise0, b[1]], [b[0], yt, b[1]], [a[0], yt, a[1]]];
        const toRoom = horiz ? [0, 0, -out] : [-out, 0, 0];
        if (dot(cross(sub(riser[1], riser[0]), sub(riser[2], riser[0])), toRoom) < 0) riser.reverse();
        quad(B, ...riser, 'stone', TINT.band);
      }
      const yTop = y + 0.32 * steps;
      // side walls, end wall, the sloping ceiling — into the dark
      for (const [s, sg] of [[W0, 1], [W1, -1]]) {
        const a = P2(s, 0), b = P2(s, depth + 0.3);                          // (from the wall line: the frame's jambs cover the corner)
        const nrm = horiz ? [sg, 0, 0] : [0, 0, sg];
        const v = [[a[0], y - 0.3, a[1]], [b[0], y - 0.3, b[1]], [b[0], yTop + 4.9, b[1]], [a[0], y + 4.9, a[1]]];
        if (dot(cross(sub(v[1], v[0]), sub(v[2], v[0])), nrm) < 0) v.reverse();
        quad(B, ...v, 'stone', TINT.wall);
      }
      {
        const a = P2(W0 - 0.1, depth), b = P2(W1 + 0.1, depth), nrm = horiz ? [0, 0, -out] : [-out, 0, 0];
        const v = [[a[0], yTop - 0.2, a[1]], [b[0], yTop - 0.2, b[1]], [b[0], yTop + 5, b[1]], [a[0], yTop + 5, a[1]]];
        if (dot(cross(sub(v[1], v[0]), sub(v[2], v[0])), nrm) < 0) v.reverse();
        quad(B, ...v, 'stone', TINT.pit);
        const c0 = P2(W0 - 0.1, -0.1), c1 = P2(W1 + 0.1, -0.1), c2 = P2(W1 + 0.1, depth + 0.1), c3 = P2(W0 - 0.1, depth + 0.1);
        const cv = [[c0[0], y + 4.6, c0[1]], [c1[0], y + 4.6, c1[1]], [c2[0], yTop + 4.6, c2[1]], [c3[0], yTop + 4.6, c3[1]]];
        if (dot(cross(sub(cv[1], cv[0]), sub(cv[2], cv[0])), [0, -1, 0]) < 0) cv.reverse();
        quad(B, ...cv, 'stone', TINT.vault);
      }
      // a frame round the mouth: jambs and a heavy lintel (proud of the room's wall), braziers either side
      const yaw = Math.atan2(horiz ? 0 : -out, horiz ? -out : 0);
      for (const [s, sg] of [[W0, -1], [W1, 1]]) {
        const [jx, jz] = P2(s + sg * 0.45, -0.12);
        part(jx, jz, box(0.96, 5.2, 0.24, [jx, y + 2.45, jz], yaw, 'stone', TINT.rib));       // (3 cm past the opening's edge: no face shared with the skirting's end)
        const [bx, bz] = P2(s + sg * 2.2, -1.1);
        brazier(bx, bz, y);
      }
      const [lx, lz] = P2((W0 + W1) / 2, -0.15);
      part(lx, lz, box(W1 - W0 + 2.2, 0.9, 0.3, [lx, y + 5.0, lz], yaw, 'stone', TINT.rib));
      torches.push({ ...(() => { const [tx, tz] = P2((W0 + W1) / 2, depth - 1); return { x: tx, z: tz }; })(), y: yTop + 3, col: new THREE.Color(DUNGEON_LOOK.shaft), k: 1.2, r0: 3, R: 12, pool: false, kind: 'daylight' });
    }

    // ------------------------------------------------------------ the chasm's bridge: an arch of stone with parapets
    if (bridge) {
      const [bx0, bz0, bx1, bz1] = bridge.rect, y = bridge.y;
      const spanX = chasmF.rect[2] - chasmF.rect[0] < chasmF.rect[3] - chasmF.rect[1];   // the pit is narrow along x: the bridge spans x
      const A0 = spanX ? bx0 : bz0, A1 = spanX ? bx1 : bz1, C0 = spanX ? bz0 : bx0, C1 = spanX ? bz1 : bx1;
      const L2 = A1 - A0, under = s => y - 1.0 - 5.2 * (1 - Math.sin(Math.PI * clamp((s - A0) / L2, 0, 1)));
      const P3 = (a, c, yy) => (spanX ? [a, yy, c] : [c, yy, a]);
      const B = S((bx0 + bx1) / 2, (bz0 + bz1) / 2);
      const n = 16;
      for (let j = 0; j < n; j++) {
        const a = A0 + L2 * j / n, b = A0 + L2 * (j + 1) / n;
        // the underside (facing down), across the parapets' width too
        const u = [P3(a, C0 - 0.45, under(a)), P3(b, C0 - 0.45, under(b)), P3(b, C1 + 0.45, under(b)), P3(a, C1 + 0.45, under(a))];
        if (dot(cross(sub(u[1], u[0]), sub(u[2], u[0])), [0, -1, 0]) < 0) u.reverse();
        quad(B, ...u, 'stone', TINT.wall);
        for (const [c, sg] of [[C0 - 0.45, -1], [C1 + 0.45, 1]]) {
          // the outer face (spandrel + parapet), the parapet's top and its inner face above the deck
          const nrm = spanX ? [0, 0, sg] : [sg, 0, 0];
          const o = [P3(a, c, under(a)), P3(b, c, under(b)), P3(b, c, y + 0.95), P3(a, c, y + 0.95)];
          if (dot(cross(sub(o[1], o[0]), sub(o[2], o[0])), nrm) < 0) o.reverse();
          quad(B, ...o, 'stone', TINT.wall);
          const ci = sg < 0 ? C0 : C1;
          const tp = [P3(a, c, y + 0.95), P3(b, c, y + 0.95), P3(b, ci, y + 0.95), P3(a, ci, y + 0.95)];
          if (dot(cross(sub(tp[1], tp[0]), sub(tp[2], tp[0])), [0, 1, 0]) < 0) tp.reverse();
          quad(B, ...tp, 'stone', TINT.band);
          const inn = [P3(a, ci, y - 0.05), P3(b, ci, y - 0.05), P3(b, ci, y + 0.95), P3(a, ci, y + 0.95)];
          const nIn = nrm.map(v => -v);
          if (dot(cross(sub(inn[1], inn[0]), sub(inn[2], inn[0])), nIn) < 0) inn.reverse();
          quad(B, ...inn, 'stone', TINT.band);
        }
      }
      // the pit's wall under each end of the bridge (below the arch's spring) and the parapets' end posts
      for (const [a, sg] of [[A0, 1], [A1, -1]]) {
        const nrm = spanX ? [sg, 0, 0] : [0, 0, sg];
        const v = [P3(a, C0, y - DEPTH - 0.5), P3(a, C1, y - DEPTH - 0.5), P3(a, C1, under(a) + 0.05), P3(a, C0, under(a) + 0.05)];   // (the pit's own walls go on either side)
        if (dot(cross(sub(v[1], v[0]), sub(v[2], v[0])), nrm) < 0) v.reverse();
        quad(B, ...v, 'fieldstone', TINT.pit);
        for (const c of [C0 - 0.25, C1 + 0.25]) { const p = P3(a - sg * 0.3, c, y + 0.7); part(p[0], p[2], box(0.62, 1.5, 0.62, p, 0, 'stone', TINT.rib)); }
      }
    }

    // ------------------------------------------------------------ features: sarcophagi, bone walls, lever, gate, secret door
    for (const f of P.features) {
      if (f.kind === 'sarcophagus') {
        const [x, z] = f.at, reg = regAt(x, z), y = reg ? floorAt(reg, x, z) : 0, yaw = f.facing, hoard = f.loot === 'hoard';
        // two in a corner stand 2.1 m apart at right angles: shorter there, so they never overlap
        const near = Math.min(9, ...P.features.filter(o => o.kind === 'sarcophagus' && o !== f).map(o => Math.hypot(o.at[0] - x, o.at[1] - z)));
        const L2 = Math.min(hoard ? 2.4 : 2.0, near * 0.78), Wd = hoard ? 1.3 : 1.0;
        const hv = (Number(f.id.split('-').pop()) || 0) % 2 ? 0.03 : 0;          // neighbours' plinths and lids differ by 3 cm
        part(x, z, box(L2 + 0.16, 0.2 + hv, Wd + 0.16, [x, y + (0.2 + hv) / 2, z], yaw, 'fieldstone', TINT.pit));
        part(x, z, box(L2, 0.86, Wd, [x, y + 0.2 + hv + 0.43, z], yaw, 'stone', '#8d877e'));
        part(x, z, box(L2 + 0.12, 0.2, Wd + 0.12, [x, y + 1.16 + hv, z], yaw, 'stone', '#a69f94'));
        // a carved figure on the lid: a head, the body under a shroud, the hands at the chest
        const ca = Math.cos(yaw), sa = Math.sin(yaw);
        const at = (lx, lz) => [x + ca * lx + sa * lz, z - sa * lx + ca * lz];
        const [hx, hz] = at(-L2 * 0.36, 0);
        part(x, z, { s: 'blob', rad: 0.17, p: [hx, y + 1.39 + hv, hz], r: [0, yaw, 0], m: 'stone', t: '#b1a99c' });
        part(x, z, box(L2 * 0.62, 0.16, Wd * 0.46, [...(() => { const [bx, bz] = at(L2 * 0.08, 0); return [bx, y + 1.33 + hv, bz]; })()].slice(0, 3), yaw, 'stone', '#aaa295'));
        if (hoard) {
          for (let j = 0; j < 9; j++) { const [gx, gz] = at((R0() - 0.5) * 2.6, (R0() < 0.5 ? -1 : 1) * (0.95 + R0() * 0.5)); part(gx, gz, { s: 'blob', rad: 0.12 + R0() * 0.18, p: [gx, y + 0.08, gz], r: [0, R0() * 3, 0], m: 'paint', t: '#d2a83a' }); }
        }
        if (f.skeleton && keep()) {
          const [sx, sz] = at((R0() - 0.5) * 1.2, 1.0);
          part(sx, sz, { s: 'blob', rad: 0.13, p: [sx, y + 0.1, sz], r: [0.4, R0() * 3, 0], m: 'plaster', t: TINT.bone });
          for (let j = 0; j < 4; j++) { const [bx, bz] = at((R0() - 0.5) * 1.6, 0.9 + R0() * 0.6); part(bx, bz, { s: 'cyl', rt: 0.035, rb: 0.04, h: 0.4 + R0() * 0.3, n: 5, p: [bx, y + 0.04, bz], r: [Math.PI / 2, R0() * 3, 0], m: 'plaster', t: TINT.bone }); }
        }
      } else if (f.kind === 'bone_wall') {
        const reg = regs.find(r => r.id === f.room); if (!reg) continue;
        const [ax, az] = f.from, [bx, bz] = f.to, len = Math.hypot(bx - ax, bz - az);
        const dir = [(bx - ax) / len, (bz - az) / len];
        const [x0, z0, x1, z1] = reg.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        let nin = [-dir[1], dir[0]]; if ((cx - ax) * nin[0] + (cz - az) * nin[1] < 0) nin = [-nin[0], -nin[1]];
        const gaps = [...f.gaps].sort((p, q) => p[0] - q[0]);
        let s = 0.0; const spans = [];
        for (const [g0, g1] of gaps) { if (g0 > s) spans.push([s, g0]); s = Math.max(s, g1); }
        if (s < len) spans.push([s, len]);
        const TH = 0.34, H = 2.85, y = reg.y;
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 0.6) continue;
          const pa = [ax + dir[0] * s0, az + dir[1] * s0], pb = [ax + dir[0] * s1, az + dir[1] * s1];
          const fa = [pa[0] + nin[0] * TH, pa[1] + nin[1] * TH], fb = [pb[0] + nin[0] * TH, pb[1] + nin[1] * TH];
          const Bn2 = Bn((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2);
          const nrm = [nin[0], 0, nin[1]], segs = Math.max(1, Math.ceil((s1 - s0) / 2));
          const tint = rgbOf('#e8dcc4');
          for (let j = 0; j < segs; j++) for (const [h0, h1] of [[y - 0.05, y + 1.0], [y + 1.0, y + 2.0], [y + 2.0, y + H]]) {
            const ta = s0 + (s1 - s0) * j / segs, tb = s0 + (s1 - s0) * (j + 1) / segs;
            const p = t => [ax + dir[0] * t + nin[0] * TH, az + dir[1] * t + nin[1] * TH];
            const [qa, qb] = [p(ta), p(tb)];
            const vs = [[qa[0], h0, qa[1], ta, h0], [qb[0], h0, qb[1], tb, h0], [qb[0], h1, qb[1], tb, h1], [qa[0], h1, qa[1], ta, h1]];
            if (dot(cross(sub(vs[1], vs[0]), sub(vs[2], vs[0])), nrm) < 0) { vs.reverse(); }
            for (const k of [0, 1, 2, 0, 2, 3]) { const [vx, vy, vz, tu, tv] = vs[k]; const sh = 0.85 + 0.15 * hash2(Math.round(tu), 3); Bn2.v(vx, vy, vz, nrm[0], 0, nrm[2], tu / 1.6, -(tv - y) / 0.8, null, tint[0] * sh, tint[1] * sh, tint[2] * sh); }
          }
          // the cap: a dark stone coping along the top (stone, so the bones end cleanly), end posts
          const [mx, mz] = [(fa[0] + fb[0]) / 2 - nin[0] * TH / 2, (fa[1] + fb[1]) / 2 - nin[1] * TH / 2];
          const yaw = Math.atan2(dir[0], dir[1]) + Math.PI / 2;
          const cy = Math.abs(dir[0]) > 0.5 ? 0 : 0.03;                         // (copings cross at the corners: no shared top)
          part(mx, mz, box(s1 - s0, 0.22, TH + 0.12, [mx + nin[0] * 0.06, y + H + 0.11 + cy, mz + nin[1] * 0.06], yaw, 'stone', TINT.band));
          // a row of real skulls along the coping (not on phones)
          if (Q.clutter > 0.5) for (let t = s0 + 0.4; t < s1 - 0.3; t += 0.55) { const px = ax + dir[0] * t + nin[0] * (TH * 0.6), pz = az + dir[1] * t + nin[1] * (TH * 0.6); part(px, pz, { s: 'blob', rad: 0.13, p: [px, y + H + 0.33, pz], r: [0, R0() * 3, 0], m: 'plaster', t: TINT.bone }); }
        }
      } else if (f.kind === 'lever') {
        const [x, z] = f.at, reg = regAt(x, z), y = reg ? floorAt(reg, x, z) : 0;
        part(x, z, box(0.7, 1.0, 0.5, [x, y + 0.5, z], f.facing, 'stone', TINT.band));
        part(x, z, box(0.85, 0.12, 0.62, [x, y + 1.06, z], f.facing, 'stone', TINT.rib));
        movers.levers.push({ f, x, z, y, gate: f.gate });
      } else if (f.kind === 'gate') {
        movers.gates.push({ f });
      } else if (f.kind === 'secret') {
        movers.secrets.push({ f });
      }
    }

    // ------------------------------------------------------------ what each kind of room holds
    function brazier(x, z, y, big = false) {
      const s = big ? 1.35 : 1;
      part(x, z, { s: 'cyl', rt: 0.16 * s, rb: 0.32 * s, h: 0.95 * s, n: 8, p: [x, y + 0.47 * s, z], r: [0, 0, 0], m: 'stone', t: TINT.band });
      part(x, z, { s: 'cyl', rt: 0.62 * s, rb: 0.36 * s, h: 0.42 * s, n: 10, p: [x, y + 1.12 * s, z], r: [0, 0, 0], m: 'iron', t: TINT.iron });
      part(x, z, { s: 'blob', rad: 0.42 * s, p: [x, y + 1.3 * s, z], r: [0, 0, 0], m: 'fieldstone', t: '#3a1e10' });     // coals
      torches.push({ x, y: y + 1.45 * s, z, col: new THREE.Color(DUNGEON_LOOK.brazier), k: big ? 2.6 : 2.0, r0: 4.8, R: big ? 26 : 22, pool: true, kind: 'brazier', flame: big ? 1.9 : 1.45 });
    }
    function candle(x, z, y, h = 0.3) {
      part(x, z, { s: 'cyl', rt: 0.045, rb: 0.05, h, n: 6, p: [x, y + h / 2, z], r: [0, 0, 0], m: 'plaster', t: '#e9dfc8' });
      torches.push({ x, y: y + h + 0.08, z, col: new THREE.Color(DUNGEON_LOOK.candle), k: 0.45, r0: 0.9, R: 6, pool: false, kind: 'candle', flame: 0.28 });
    }
    for (const reg of regs) {
      if (reg.type !== 'room') continue;
      const [x0, z0, x1, z1] = reg.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = reg.y;
      const door0 = P.doors.find(d => d.room === reg.id);
      // the far wall from the first door (the throne's, the altar's)
      const far = (() => { if (!door0) return null; const out = [Math.sin(door0.facing), Math.cos(door0.facing)]; return out; })();
      const farPoint = (inset) => { if (!far) return [cx, cz]; const ax = Math.abs(far[0]) > Math.abs(far[1]); return ax ? [far[0] > 0 ? x0 + inset : x1 - inset, cz] : [cx, far[1] > 0 ? z0 + inset : z1 - inset]; };
      const farYaw = () => { if (!far) return 0; return Math.atan2(far[0], far[1]); };   // looks back toward the door
      const rects = (cxp, czp, hw) => !P.features.some(f => f.at && Math.hypot(f.at[0] - cxp, f.at[1] - czp) < hw) && !P.entrances.concat(P.exits).some(e => Math.hypot(e.at[0] - cxp, e.at[1] - czp) < hw + 2);
      if (reg.kind === 'chapel') {
        const [ax, az] = farPoint(1.6), yaw = farYaw();
        if (rects(ax, az, 1.5)) {
          part(ax, az, box(3.0, 1.05, 1.3, [ax, y + 0.525, az], yaw, 'stone', '#9a9388'));
          part(ax, az, box(3.3, 0.14, 1.5, [ax, y + 1.12, az], yaw, 'stone', TINT.rib));
          part(ax, az, box(2.6, 0.03, 1.32, [ax, y + 1.205, az], yaw, 'cloth', '#5c1c1c'));
          const ca = Math.cos(yaw), sa = Math.sin(yaw);
          for (const l of [-1.1, -0.55, 0.55, 1.1]) candle(ax + ca * l, az - sa * l, y + 1.22, 0.22 + R0() * 0.2);
          for (const l of [-2.6, 2.6]) { const px = ax + ca * l, pz = az - sa * l; part(px, pz, { s: 'cyl', rt: 0.08, rb: 0.16, h: 1.7, n: 6, p: [px, y + 0.85, pz], r: [0, 0, 0], m: 'iron', t: TINT.iron }); candle(px, pz, y + 1.7, 0.4); }
          // a faded hanging on the wall behind it, and two braziers before the altar
          const wx = ax - Math.sin(yaw) * 1.12, wz = az - Math.cos(yaw) * 1.12;       // (in front of the pilaster behind the altar)
          part(wx, wz, box(3.4, 7.5, 0.06, [wx, y + 5.2, wz], yaw, 'cloth', '#3c2238'));
          part(wx, wz, box(3.7, 0.24, 0.14, [wx + Math.sin(yaw) * 0.02, y + 9.0, wz + Math.cos(yaw) * 0.02], yaw, 'paint', '#8c6a2a'));
          for (const l of [-3.6, 3.6]) brazier(ax + ca * l + Math.sin(yaw) * 2.2, az - sa * l + Math.cos(yaw) * 2.2, y);
        }
      } else if (reg.kind === 'boss_hall') {
        // the throne against the far wall, a long hanging behind it, braziers down the nave, a worn red runner
        const [tx, tz] = farPoint(1.25), yaw = farYaw();
        const ca = Math.cos(yaw), sa = Math.sin(yaw), at = (lx, lz) => [tx + ca * lx + sa * lz, tz - sa * lx + ca * lz];
        const th = (lx, lz, w, h, d, yy, m, t) => { const [px, pz] = at(lx, lz); part(px, pz, box(w, h, d, [px, y + yy, pz], yaw, m, t)); };
        th(0, 0, 3.6, 0.5, 2.6, 0.25, 'stone', '#5d5852');           // a low step under it
        th(0, 0.1, 2.4, 0.9, 1.6, 0.95, 'stone', '#4a4641');         // the seat block
        th(0, 0.12, 2.0, 0.16, 1.3, 1.46, 'cloth', '#6b1f1f');       // its cushion
        th(0, -0.75, 2.6, 4.4, 0.45, 2.72, 'stone', '#4a4641');      // the tall back (2 cm off the step: no shared plane)
        th(0, -0.68, 1.6, 3.4, 0.4, 2.9, 'cloth', '#6b1f1f');        // red inlay on the back (4.5 cm proud of it)
        th(0, -0.78, 3.0, 0.5, 0.6, 5.1, 'paint', '#b08a2e');         // a gilded crest
        for (const s of [-1, 1]) th(s * 1.35, 0.2, 0.4, 1.3, 1.6, 1.2, 'stone', '#5d5852');    // arms
        for (const s of [-1, 1]) { const [px, pz] = at(s * 1.35, 0.7); part(px, pz, { s: 'blob', rad: 0.26, p: [px, y + 1.95, pz], r: [0, 0, 0], m: 'paint', t: '#b08a2e' }); }
        const [hx, hz] = at(0, -1.15);
        part(hx, hz, box(4.6, 9, 0.08, [hx, y + 6.8, hz], yaw, 'cloth', '#4a1414'));
        const [gx, gz] = at(0, -1.12);
        part(gx, gz, box(4.9, 0.3, 0.16, [gx, y + 11.35, gz], yaw, 'paint', '#b08a2e'));
        for (const s of [-1, 1]) { const [bx, bz] = at(s * 3.6, 1.6); brazier(bx, bz, y, true); }
        // braziers by the columns down the nave and the runner from the door to the throne
        for (const c of reg.cols) { const dx = cx - c.x, dz = cz - c.z, l = Math.hypot(dx, dz) || 1; if (R0() < 0.5) continue; const bx = c.x + dx / l * (c.r + 1.0), bz = c.z + dz / l * (c.r + 1.0); brazier(bx, bz, y); }
        if (door0) {
          const out = [Math.sin(door0.facing), Math.cos(door0.facing)], ax = Math.abs(out[0]) > Math.abs(out[1]);
          const len = (ax ? x1 - x0 : z1 - z0) - 6, w = 4.2;
          part(cx, cz, box(ax ? len : w, 0.035, ax ? w : len, [cx, y + 0.0175, cz], 0, 'cloth', '#3a1414'));
        }
      } else if (reg.kind === 'goblin_den') {
        // hide tents against the walls, a cook fire, crates and barrels, bones, timber shoring
        const spots = [[x0 + 3.2, z0 + 3.2], [x1 - 3.2, z0 + 3.2], [x0 + 3.2, z1 - 3.2], [x1 - 3.2, z1 - 3.2]].filter(([a, b]) => rects(a, b, 3));
        for (const [j, [tx, tz]] of spots.entries()) {
          if (j > 2) continue;                                       // (tents are the den: never thinned)
          const yaw = Math.atan2(cx - tx, cz - tz);
          const ca = Math.cos(yaw), sa = Math.sin(yaw), at = (lx, ly, lz) => [tx + ca * lx + sa * lz, y + ly, tz - sa * lx + ca * lz];
          // an A-frame of hides on poles
          for (const s of [-1, 1]) part(tx, tz, { s: 'tri', pts: [at(0, 2.5, -1.4), at(s * 1.6, 0, -1.4), at(s * 1.6, 0, 1.4)], m: 'cloth', t: TINT.hide });
          for (const s of [-1, 1]) part(tx, tz, { s: 'tri', pts: [at(0, 2.5, -1.4), at(0, 2.5, 1.4), at(s * 1.6, 0, 1.4)], m: 'cloth', t: '#7a5a3c' });
          part(tx, tz, { s: 'tri', pts: [at(-1.6, 0, -1.4), at(1.6, 0, -1.4), at(0, 2.5, -1.4)], m: 'cloth', t: '#6e5236' });
          for (const lz of [-1.5, 1.5]) { const p = at(0, 1.4, lz); part(tx, tz, { s: 'cyl', rt: 0.05, rb: 0.06, h: 2.9, n: 5, p, r: [0, 0, 0], m: 'planks', t: TINT.wood }); }
          // a bedroll of furs in front of it
          const [bx, , bz] = at(0.9, 0, 2.3);
          part(bx, bz, box(0.9, 0.16, 1.9, [bx, y + 0.08, bz], yaw + 0.2, 'cloth', '#5a4632'));
          part(bx, bz, box(0.7, 0.1, 1.2, [bx, y + 0.2, bz], yaw + 0.25, 'cloth', '#6e5a44'));
        }
        // a crude totem by the fire: a pole, a crossbar hung with bones, a skull on top
        { const tx = cx + 3.2, tz = cz - 2.4;
          if (rects(tx, tz, 1)) {
            part(tx, tz, { s: 'cyl', rt: 0.08, rb: 0.11, h: 3.4, n: 6, p: [tx, y + 1.7, tz], r: [0, 0, 0], m: 'planks', t: TINT.wood });
            part(tx, tz, box(1.5, 0.1, 0.1, [tx, y + 2.9, tz], 0.4, 'planks', TINT.wood));
            part(tx, tz, { s: 'blob', rad: 0.2, p: [tx, y + 3.55, tz], r: [0, 0.4, 0], m: 'plaster', t: TINT.bone });
            for (const l of [-0.6, 0, 0.6]) part(tx, tz, { s: 'cyl', rt: 0.03, rb: 0.03, h: 0.5, n: 5, p: [tx + Math.cos(0.4) * l, y + 2.6, tz - Math.sin(0.4) * l], r: [0, 0, 0.1], m: 'plaster', t: TINT.bone });
          } }
        const fx = cx + (R0() - 0.5) * 3, fz = cz + (R0() - 0.5) * 3;
        for (let j = 0; j < 9; j++) { const a = TAU * j / 9; part(fx, fz, { s: 'blob', rad: 0.24, p: [fx + Math.sin(a) * 0.85, y + 0.12, fz + Math.cos(a) * 0.85], r: [0, a, 0], m: 'fieldstone', t: '#5c564e' }); }
        for (const a of [0.3, 1.9, 3.6]) part(fx, fz, { s: 'cyl', rt: 0.08, rb: 0.08, h: 1.1, n: 6, p: [fx, y + 0.18, fz], r: [Math.PI / 2 - 0.3, a, 0], m: 'planks', t: '#3d2a1a' });
        torches.push({ x: fx, y: y + 0.6, z: fz, col: new THREE.Color(DUNGEON_LOOK.fire), k: 2.2, r0: 4.5, R: 20, pool: true, kind: 'fire', flame: 1.6 });
        const stash = [];                                                     // crates and barrels already placed (kept 1.7 m apart)
        for (let j = 0; j < 7; j++) {
          if (!keep()) continue;
          const side = j % 4, t = R0();
          const px = side === 0 ? x0 + 1.1 : side === 1 ? x1 - 1.1 : x0 + 4 + t * (x1 - x0 - 8), pz = side === 2 ? z0 + 1.1 : side === 3 ? z1 - 1.1 : z0 + 4 + t * (z1 - z0 - 8);
          if (!rects(px, pz, 1.4) || stash.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 1.7)) continue;
          stash.push([px, pz]);
          const ch = 0.82 + R0() * 0.2;
          if (R0() < 0.5) part(px, pz, box(1.0, ch, 1.0, [px, y + ch / 2, pz], R0() * 3, 'planks', '#8a6a44'));
          else part(px, pz, { s: 'cyl', rt: 0.42, rb: 0.42, h: ch + 0.15, n: 10, p: [px, y + (ch + 0.15) / 2, pz], r: [0, R0() * 3, 0], m: 'planks', t: '#7a5634' });
        }
        // timber shoring the goblins put up along their diggings: two posts and a cap beam, every 6 m
        for (const [ax, line, sg] of [['x', z0, 1], ['x', z1, -1], ['z', x0, 1], ['z', x1, -1]]) {
          const a0 = ax === 'x' ? x0 : z0, a1 = ax === 'x' ? x1 : z1;
          for (let s = a0 + 2.5; s < a1 - 4; s += 6) {
            const P2 = (ss, off) => (ax === 'x' ? [ss, line + sg * off] : [line + sg * off, ss]);
            const ok = [s, s + 2.6].every(ss => { const [qx, qz] = P2(ss, -1); const t = walk.tileOf(qx, qz); return t < 0 || P.cells[t] === CODE.ROCK; });
            if (!ok) continue;                                                   // not across a doorway
            for (const ss of [s, s + 2.6]) { const [px, pz] = P2(ss, 0.24); part(px, pz, box(0.3, 4.3, 0.3, [px, y + 2.0, pz], 0, 'planks', '#6a4e34')); }
            const [bx, bz] = P2(s + 1.3, 0.27);
            part(bx, bz, box(ax === 'x' ? 3.3 : 0.34, 0.34, ax === 'x' ? 0.34 : 3.3, [bx, y + 4.0, bz], 0, 'planks', '#5e442c'));
          }
        }
        for (let j = 0; j < 5; j++) { if (!keep()) continue; const bx = x0 + 2 + R0() * (x1 - x0 - 4), bz = z0 + 2 + R0() * (z1 - z0 - 4); for (let k = 0; k < 4; k++) part(bx, bz, { s: 'cyl', rt: 0.04, rb: 0.05, h: 0.5, n: 5, p: [bx + (R0() - 0.5) * 0.8, y + 0.05, bz + (R0() - 0.5) * 0.8], r: [Math.PI / 2, R0() * 3, 0], m: 'plaster', t: TINT.bone }); }
      } else if (reg.kind === 'troll_pit') {
        // chains hanging from the vault, a drain grate in the floor, great bones of something it ate, wall rings
        const y0 = y + reg.ceil;
        const chainAt = [];
        for (let bi = 1; bi < reg.xs.length - 1; bi++) for (let bj = 1; bj < reg.zs.length - 1; bj++) if (!reg.cols.some(c => Math.hypot(c.x - reg.xs[bi], c.z - reg.zs[bj]) < 0.5)) chainAt.push([reg.xs[bi], reg.zs[bj]]);
        for (const [hx, hz] of chainAt) for (const off of [[-1.6, 0.6], [1.4, -1.2]]) {
          if (!keep()) continue;
          const px = hx + off[0], pz = hz + off[1], len = 9 + R0() * 6, links = Math.floor(len / 0.34);
          for (let k = 0; k < links; k++) part(px, pz, box(0.07, 0.42, 0.24, [px, y0 - 1.5 - k * 0.34, pz], k % 2 ? Math.PI / 2 : 0, 'iron', '#4c4c50'));
          part(px, pz, { s: 'blob', rad: 0.32, p: [px, y0 - 1.6 - links * 0.34, pz], r: [0, 0, 0], m: 'iron', t: '#4c4c50' });
        }
        for (let k = -3; k <= 3; k++) { part(cx, cz, box(4.2, 0.05, 0.16, [cx, y + 0.025, cz + k * 0.6], 0, 'iron', '#3e3e42')); }
        part(cx, cz, box(0.16, 0.06, 4.2, [cx - 2.1, y + 0.03, cz], 0, 'iron', '#3e3e42')); part(cx, cz, box(0.16, 0.06, 4.2, [cx + 2.1, y + 0.03, cz], 0, 'iron', '#3e3e42'));
        // a giant ribcage against one wall
        const rx = x0 + 3.5, rz = cz + (R0() - 0.5) * 8;
        if (rects(rx, rz, 3)) for (let k = 0; k < 7; k++) { const pz = rz - 3 + k; for (const sg of [-1, 1]) part(rx, pz, { s: 'cyl', rt: 0.09, rb: 0.14, h: 3.4 - Math.abs(k - 3) * 0.3, n: 6, p: [rx + sg * 0.9, y + 1.4, pz], r: [0, 0, sg * 0.55], m: 'plaster', t: TINT.bone }); }
        part(rx, rz, { s: 'cyl', rt: 0.16, rb: 0.2, h: 7.5, n: 7, p: [rx, y + 0.2, rz], r: [Math.PI / 2, 0, 0], m: 'plaster', t: '#cfc2a4' });
        for (let j = 0; j < 14; j++) { if (!keep()) continue; const a = R0() * TAU, rr = 4 + R0() * 14, px = cx + Math.cos(a) * rr, pz = cz + Math.sin(a) * rr; part(px, pz, { s: 'cyl', rt: 0.06, rb: 0.09, h: 0.8 + R0() * 1.2, n: 5, p: [px, y + 0.07, pz], r: [Math.PI / 2, R0() * 3, 0], m: 'plaster', t: TINT.bone }); }
      } else if (reg.kind === 'ossuary') {
        // skull heaps in the corners, an old charnel slab in the middle
        for (const [qx, qz] of [[x0 + 1.4, z0 + 1.4], [x1 - 1.4, z0 + 1.4], [x0 + 1.4, z1 - 1.4], [x1 - 1.4, z1 - 1.4]]) {
          if (!rects(qx, qz, 1.5)) continue;
          for (let k = 0; k < 14; k++) { const a = R0() * TAU, rr = R0() * 1.0, py = y + 0.13 + (1 - rr) * 0.55 * R0(); part(qx, qz, { s: 'blob', rad: 0.14, p: [qx + Math.cos(a) * rr, py, qz + Math.sin(a) * rr], r: [(R0() - 0.5) * 0.8, R0() * 6, (R0() - 0.5) * 0.8], m: 'plaster', t: TINT.bone }); }
        }
        if (rects(cx, cz, 2)) { part(cx, cz, box(2.6, 0.7, 1.4, [cx, y + 0.35, cz], 0.2, 'stone', '#827b72')); for (const l of [-0.8, 0, 0.8]) candle(cx + l, cz + (R0() - 0.5) * 0.6, y + 0.7, 0.18 + R0() * 0.2); }
      } else if (reg.kind === 'hall') {
        for (const [qx, qz] of [[x0 + 2.4, z0 + 2.4], [x1 - 2.4, z0 + 2.4], [x0 + 2.4, z1 - 2.4], [x1 - 2.4, z1 - 2.4]]) if (rects(qx, qz, 1.5)) brazier(qx, qz, y);
        // banners hanging on the long walls between the pilasters
        for (const R of runs.filter(r => r.reg === reg && (r.along === reg.along))) for (const a of ribAt.get(reg) || []) {
          const s = a + 2.3; if (!solidAt(R, s) || s > R.a1 - 1.5 || R0() < 0.4) continue;
          const [px, pz] = runPt(R, s, 0.08); part(px, pz, box(1.4, 4.2, 0.06, [px, y + 5.6, pz], runYaw(R), 'cloth', R0() < 0.5 ? '#4a1818' : '#2d3446'));
        }
      }
      // broken stone and small rubble along the walls (not on phones' thinnest setting)
      const nR = Math.round((x1 - x0 + z1 - z0) / 10 * Q.clutter);
      for (let j = 0; j < nR; j++) {
        const side = Math.floor(R0() * 4), t = R0();
        const px = side === 0 ? x0 + 0.5 : side === 1 ? x1 - 0.5 : x0 + 1 + t * (x1 - x0 - 2), pz = side === 2 ? z0 + 0.5 : side === 3 ? z1 - 0.5 : z0 + 1 + t * (z1 - z0 - 2);
        const wt = walk.tileOf(px + (side === 0 ? -1 : side === 1 ? 1 : 0), pz + (side === 2 ? -1 : side === 3 ? 1 : 0));
        if (wt >= 0 && P.cells[wt] !== CODE.ROCK) continue;
        for (let k = 0; k < 3; k++) part(px, pz, { s: 'blob', rad: 0.12 + R0() * 0.22, p: [px + (R0() - 0.5) * 0.7, y + 0.06, pz + (R0() - 0.5) * 0.7], r: [R0(), R0() * 3, R0()], m: 'stone', t: TINT.rubble });
      }
    }

    // ------------------------------------------------------------ burial niches in the crypts and the first level's corridors
    for (const R of runs) {
      const reg = R.reg;
      const crypt = reg.kind === 'crypt' || reg.kind === 'entrance' || (reg.type === 'corridor' && reg.level === 1);
      if (!crypt) continue;
      const pil = R.along === reg.along ? (ribAt.get(reg) || []).filter(a => solidAt(R, a)) : [];
      const sc = sconces.filter(s => s.run === R).map(s => s.s);
      const yaw = runYaw(R);
      for (let s = R.a0 + 1.2; s + 1.0 < R.a1 - 0.2; s += 2.1) {
        if (pil.some(a => Math.abs(a - s) < 1.45) || sc.some(a => Math.abs(a - s) < 1.3)) continue;
        for (let row = 0; row < Q.niches; row++) {
          const [px, pz] = runPt(R, s, 0), f = floorAt(reg, px, pz), yb = f + 0.95 + row * 1.15;
          // the dark hollow (a few cm proud of the wall), its stone frame round it (proud of both), sometimes a skull
          const [hx, hz] = runPt(R, s, 0.03);
          part(hx, hz, box(1.3, 0.62, 0.04, [hx, yb + 0.31, hz], yaw, 'fieldstone', TINT.dark));
          const [fx, fz] = runPt(R, s, 0.08);
          part(fx, fz, box(1.6, 0.12, 0.14, [fx, yb - 0.06, fz], yaw, 'stone', TINT.band));
          part(fx, fz, box(1.6, 0.12, 0.14, [fx, yb + 0.68, fz], yaw, 'stone', TINT.band));
          if (Q.clutter > 0.5) for (const sg of [-1, 1]) { const [jx, jz] = runPt(R, s + sg * 0.72, 0.075); part(jx, jz, box(0.14, 0.62, 0.13, [jx, yb + 0.31, jz], yaw, 'stone', TINT.band)); }
          if (Q.clutter > 0.5 && R0() < 0.4) { const [kx, kz] = runPt(R, s + (R0() - 0.5) * 0.6, 0.2); part(kx, kz, { s: 'blob', rad: 0.13, p: [kx, yb + 0.14, kz], r: [0, yaw, 0], m: 'plaster', t: TINT.bone }); }
        }
      }
    }

    // ------------------------------------------------------------ torches on the walls, pilasters and columns
    function sconce(x, z, y, yaw) {
      const ca = Math.cos(yaw), sa = Math.sin(yaw), at = (lx, ly, lz) => [x + ca * lx + sa * lz, y + ly, z - sa * lx + ca * lz];
      part(x, z, box(0.26, 0.5, 0.06, at(0, 0, 0.03), yaw, 'iron', TINT.iron));                 // the wall plate (proud of the stone)
      part(x, z, box(0.07, 0.07, 0.36, at(0, -0.05, 0.22), yaw, 'iron', TINT.iron));           // the arm
      part(x, z, { s: 'cyl', rt: 0.13, rb: 0.07, h: 0.2, n: 7, p: at(0, 0.02, 0.4), r: [0.25, yaw, 0], m: 'iron', t: TINT.iron });   // the cup
      part(x, z, { s: 'cyl', rt: 0.05, rb: 0.04, h: 0.62, n: 6, p: at(0, 0.18, 0.43), r: [0.25, yaw, 0], m: 'planks', t: '#4a3422' });   // the torch
      const [fx, fy, fz] = at(0, 0.5, 0.52);
      torches.push({ x: fx, y: fy, z: fz, col: new THREE.Color(DUNGEON_LOOK.torch), k: 1.15, r0: 4.6, R: 26, pool: true, kind: 'torch', flame: 0.85 });
    }
    for (const s of sconces) sconce(s.x, s.z, s.y, s.yaw);
    for (const c of P.columns) {
      // one torch on each column, on the side toward the room's middle (the troll's ring: away from the open floor)
      const reg = regAt(c.x, c.z); if (!reg) continue;
      const [x0, z0, x1, z1] = reg.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let dx = cx - c.x, dz = cz - c.z; if (reg.kind === 'troll_pit') { dx = -dx; dz = -dz; }
      if (Math.abs(dx) > Math.abs(dz)) { dz = 0; dx = Math.sign(dx) || 1; } else { dx = 0; dz = Math.sign(dz) || 1; }
      if (chasmF && inRect(c.x + dx * 3, c.z + dz * 3, chasmF.rect, 2)) { dx = -dx; dz = -dz; }
      const y = floorAt(reg, c.x, c.z);
      sconce(c.x + dx * c.r, c.z + dz * c.r, y + 3.4, Math.atan2(dx, dz));
    }
    stats.torches = torches.length;

    // ------------------------------------------------------------ moving pieces: the portcullis, the secret slab, the lever's arm
    const atlasMat = bakedAtlasMaterial(kit, U);
    const boneMat = bakedPlainMaterial(boneTexture(quality === 'low' ? 256 : 512), U);
    for (const g of movers.gates) {
      const f = g.f, creg = regs.find(r => r.id === f.corridor); if (!creg) continue;
      const out = [Math.sin(f.facing), Math.cos(f.facing)], lat = [out[1], -out[0]];
      const [x, z] = f.at, y = floorAt(creg, x, z), hw = f.width / 2, hgt = creg.ceil + creg.R + 0.3;
      const parts = [];
      const nb = Math.round(f.width / 0.42);
      for (let i = 0; i <= nb; i++) parts.push(box(0.12, hgt, 0.12, [-hw + f.width * i / nb, hgt / 2, 0], 0, 'iron', '#5a5a60'));
      for (let k = 0; k < Math.floor(hgt / 1.1); k++) parts.push(box(f.width, 0.12, 0.16, [0, 0.55 + k * 1.1, 0], 0, 'iron', '#4c4c52'));
      for (let i = 0; i <= nb; i++) parts.push({ s: 'cone', rb: 0.09, h: 0.3, n: 4, p: [-hw + f.width * i / nb, -0.12, 0], r: [Math.PI, 0, 0], m: 'iron', t: '#5a5a60' });
      const sink = kit.sink(); kit.addParts(sink, parts, null);
      const geo = sink.geometry(); geo.translate(0, 0, 0);
      const m = new THREE.Mesh(geo, atlasMat); m.name = 'portcullis ' + f.id;
      m.position.set(x, y, z); m.rotation.y = Math.atan2(lat[0], lat[1]) - Math.PI / 2 + Math.PI / 2; m.rotation.y = Math.atan2(out[0], out[1]);
      m.userData = { open: D.state.open[f.id] ? 1 : 0, lift: hgt - 0.6, y0: y, id: f.id };
      g.mesh = m;
      // the grooves it runs in: two stone posts proud of the corridor walls and a lintel
      for (const sg of [-1, 1]) { const px = x + lat[0] * sg * (hw - 0.12), pz = z + lat[1] * sg * (hw - 0.12); part(px, pz, box(0.42, creg.ceil + 0.2, 0.7, [px, y + creg.ceil / 2 - 0.1, pz], m.rotation.y, 'stone', TINT.rib)); }
    }
    for (const sgate of movers.secrets) {
      const f = sgate.f, creg = regs.find(r => r.id === f.corridor); if (!creg) continue;
      const out = [Math.sin(f.facing), Math.cos(f.facing)];
      // the slab fills the corridor's first row: its face 3 cm behind the room's wall line (it reads as wall, with a crack)
      const [x, z] = f.at, y = floorAt(creg, x, z), hgt = creg.ceil + creg.R + 0.6;
      const parts = [box(f.width + 0.2, hgt, 1.94, [0, hgt / 2 - 0.3, 0.03], 0, 'stone', TINT.wall), box(f.width + 0.2, 0.85, 0.14, [0, 0.13, -0.98], 0, 'stone', TINT.band)];
      const sink = kit.sink(); kit.addParts(sink, parts, null);
      const m = new THREE.Mesh(sink.geometry(), atlasMat); m.name = 'secret door ' + f.id;
      m.position.set(x, y, z); m.rotation.y = Math.atan2(out[0], out[1]);
      m.userData = { open: D.state.open[f.id] ? 1 : 0, drop: hgt + 0.2, y0: y, id: f.id };
      sgate.mesh = m;
    }
    for (const lv of movers.levers) {
      const parts = [{ s: 'cyl', rt: 0.045, rb: 0.05, h: 1.1, n: 6, p: [0, 0.55, 0], r: [0, 0, 0], m: 'iron', t: TINT.iron }, { s: 'blob', rad: 0.11, p: [0, 1.12, 0], r: [0, 0, 0], m: 'iron', t: '#7a2a20' }];
      const sink = kit.sink(); kit.addParts(sink, parts, null);
      const m = new THREE.Mesh(sink.geometry(), atlasMat); m.name = 'lever ' + lv.f.id;
      m.position.set(lv.x, lv.y + 1.1, lv.z); m.rotation.y = lv.f.facing;
      m.userData = { on: D.state.open[lv.gate] ? 1 : 0, gate: lv.gate };
      lv.mesh = m;
    }

    // ------------------------------------------------------------ bake the fire into the stone, merge per chunk
    const tb = performance.now();
    const lightGrid = new Map(), LG = 16;
    torches.forEach((L2, j) => { const k = Math.floor(L2.x / LG) + ',' + Math.floor(L2.z / LG); if (!lightGrid.has(k)) lightGrid.set(k, []); lightGrid.get(k).push(j); });
    const losCache = new Map();
    function los(j, px, pz) {
      const T = torches[j], t = walk.tileOf(px, pz), key = j * N + t;
      let v = losCache.get(key);
      if (v !== undefined) return v;
      const dx = px - T.x, dz = pz - T.z, d = Math.hypot(dx, dz);
      v = 1;
      for (let s = 0.7; s < d - 0.7; s += 0.6) {
        const tt = walk.tileOf(T.x + dx * s / d, T.z + dz * s / d);
        const c = tt < 0 ? CODE.ROCK : P.cells[tt];
        if (c === CODE.ROCK || c === CODE.SECRET) { v = 0; break; }
      }
      losCache.set(key, v);
      return v;
    }
    /** the fire light reaching each vertex (M: a moving piece's placement, so its local shape is baked where it stands) */
    function bake(geo, M = null) {
      let pos = geo.attributes.position.array, nrm = geo.attributes.normal.array;
      const n = pos.length / 3;
      if (M) {
        const g2 = geo.clone(); g2.applyMatrix4(M);
        pos = g2.attributes.position.array; nrm = g2.attributes.normal.array;
      }
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
        const sx = x + nx * 0.35, sz = z + nz * 0.35;
        let r = 0, g = 0, b = 0;
        const gx = Math.floor(x / LG), gz = Math.floor(z / LG);
        for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) {
          const list = lightGrid.get((gx + a) + ',' + (gz + c)); if (!list) continue;
          for (const j of list) {
            const T = torches[j];
            const lx = T.x - x, ly = T.y - y, lz = T.z - z, d = Math.hypot(lx, ly, lz), dd = Math.max(d, 1.4);
            if (d > T.R) continue;
            const lam = clamp(((lx * nx + ly * ny + lz * nz) / (d || 1)) * 0.8 + 0.2, 0, 1);
            if (lam <= 0) continue;
            const q = d / T.R, win = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4 * ((q - 0.6) / 0.4) * (3 - 2 * (q - 0.6) / 0.4);
            const e = T.k * win * lam / (1 + (dd / T.r0) * (dd / T.r0));
            if (e < 0.004) continue;
            if (!los(j, sx, sz)) continue;
            r += T.col.r * e; g += T.col.g * e; b += T.col.b * e;
          }
        }
        out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
      }
      geo.setAttribute('bake', new THREE.BufferAttribute(out, 3));
    }
    let lastYield = performance.now();
    for (const c of chunkMap.values()) {
      // let the loading screen breathe on a slow phone (the bake is the long part)
      if (performance.now() - lastYield > 40) { await new Promise(r => setTimeout(r, 0)); lastYield = performance.now(); if (disposed) return; }
      const geos = [];
      if (c.stone.n) geos.push(c.stone.geometry());
      if (c.parts.length) { const sink = kit.sink(); kit.addParts(sink, c.parts, null); if (sink.triangles) geos.push(sink.geometry()); }
      if (geos.length) {
        const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
        geos.forEach(g => g !== geo && g.dispose());
        bake(geo); geo.computeBoundingSphere(); geo.computeBoundingBox();
        const m = new THREE.Mesh(geo, atlasMat); m.name = 'dungeon stone ' + c.key; m.matrixAutoUpdate = false;
        stats.triangles += geo.attributes.position.count / 3;
        chunks.push({ mesh: m, box: geo.boundingBox });
      }
      if (c.bones?.n) {
        const geo = c.bones.geometry(); bake(geo); geo.computeBoundingSphere(); geo.computeBoundingBox();
        const m = new THREE.Mesh(geo, boneMat); m.name = 'dungeon bones ' + c.key; m.matrixAutoUpdate = false;
        stats.boneTris += geo.attributes.position.count / 3;
        chunks.push({ mesh: m, box: geo.boundingBox });
      }
    }
    for (const mv of [...movers.gates, ...movers.secrets, ...movers.levers]) if (mv.mesh) { mv.mesh.updateMatrix(); bake(mv.mesh.geometry, mv.mesh.matrix); stats.triangles += mv.mesh.geometry.attributes.position.count / 3; }
    stats.bakeMs = Math.round(performance.now() - tb);
    stats.chunks = chunks.length;

    // ------------------------------------------------------------ flames + halos: one instanced draw, flickering in the shader
    const lit = torches.filter(t => t.flame);
    {
      const base = new THREE.InstancedBufferGeometry();
      // two quads: the flame (kind 0) and its halo (kind 1); position.xy = the corner, position.z = the kind
      const pos = [], uv = [];
      for (const kind of [0, 1]) for (const [cx2, cy2] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]]) { pos.push(cx2, cy2, kind); uv.push((cx2 + 0.5) * 0.5 + kind * 0.5, cy2); }
      base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      base.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const at = new Float32Array(lit.length * 4), ph = new Float32Array(lit.length);
      lit.forEach((t, i) => { at.set([t.x, t.y, t.z, t.flame], i * 4); ph[i] = hash2(t.x, t.z) * 10; });
      base.setAttribute('aAt', new THREE.InstancedBufferAttribute(at, 4));
      base.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
      base.instanceCount = lit.length;
      const mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: fireTexture() }, uTime: U.time, uFar: { value: Q.far + 15 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: /* glsl */`
          attribute vec4 aAt; attribute float aPhase; uniform float uTime, uFar; varying vec2 vUv; varying float vA;
          void main(){
            float kind = position.z, s = aAt.w;
            float fl = 0.86 + 0.1 * sin(uTime * 9.3 + aPhase * 6.1) + 0.06 * sin(uTime * 21.7 + aPhase * 13.0);
            vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 up = kind < 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            vec2 c = position.xy;
            float w = kind < 0.5 ? s * 0.5 : s * 2.6, h = kind < 0.5 ? s * fl : s * 2.6;
            vec3 base = aAt.xyz + (kind < 0.5 ? vec3(0.0, -0.08 * s, 0.0) : -up * h * 0.42);
            vec3 p = base + right * (c.x * w + (kind < 0.5 ? sin(uTime * 3.1 + aPhase) * 0.04 * s * c.y : 0.0)) + up * c.y * h;
            vec4 mv = viewMatrix * vec4(p, 1.0);
            float d = -mv.z;
            vA = (kind < 0.5 ? exp(-d / 95.0) * 1.15 : 0.5 * fl * exp(-d / 55.0)) * (1.0 - smoothstep(uFar * 0.75, uFar, d));   // gone before the stone is (chunks past the fog are hidden)
            vUv = uv;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          uniform sampler2D uMap; varying vec2 vUv; varying float vA;
          void main(){ vec4 c = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)); gl_FragColor = vec4(c.rgb * c.a * vA, 1.0); }`,
      });
      flames = new THREE.Mesh(base, mat); flames.frustumCulled = false; flames.name = 'dungeon flames'; flames.renderOrder = 5;
      stats.flames = lit.length;
    }
    // ------------------------------------------------------------ dust in the air round the camera (wrapped in the shader)
    {
      const n = Q.dust, BOX = 26, pos = new Float32Array(n * 3), seed = new Float32Array(n);
      const R = rng(99);
      for (let i = 0; i < n; i++) { pos.set([R() * BOX, R() * BOX * 0.6, R() * BOX], i * 3); seed[i] = R(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: U.time, uCam: U.cam, uBox: { value: new THREE.Vector3(BOX, BOX * 0.6, BOX) }, uScale: { value: 1 } },
        transparent: true, depthWrite: false, fog: false,
        vertexShader: /* glsl */`
          attribute float aSeed; uniform float uTime, uScale; uniform vec3 uCam, uBox; varying float vA;
          void main(){
            vec3 p = position + vec3(sin(uTime * 0.11 + aSeed * 40.0) * 1.5 + uTime * 0.12, sin(uTime * 0.07 + aSeed * 17.0) * 0.8 - uTime * 0.03, cos(uTime * 0.09 + aSeed * 23.0) * 1.5);
            p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float d = -mv.z;
            vA = smoothstep(0.5, 2.0, d) * (1.0 - smoothstep(6.0, 13.0, d)) * (0.55 + 0.45 * sin(uTime * 1.3 + aSeed * 50.0));
            gl_PointSize = uScale * (0.05 + 0.04 * aSeed) * 900.0 / max(d, 0.5);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */`
          varying float vA;
          void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard; gl_FragColor = vec4(vec3(0.95, 0.82, 0.62), (1.0 - r * 4.0) * 0.32 * vA); }`,
      });
      dust = new THREE.Points(g, mat); dust.frustumCulled = false; dust.name = 'dungeon dust';
    }
    // ------------------------------------------------------------ the fallen grave's shaft of daylight
    const sh = stairwells.find(s => s.collapsed && s.shaftAt);
    if (sh) {
      const reg = regs.find(r => r.id === sh.room.id), top = reg.y + reg.ceil + 5;
      const h = top - reg.y;
      const g = new THREE.CylinderGeometry(1.4, 2.6, h, 20, 1, true); g.translate(0, h / 2, 0);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: U.time, uCol: { value: new THREE.Color(DUNGEON_LOOK.shaft) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uTime; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float a = edge * (0.10 + 0.05 * vUv.y) * (0.85 + 0.15 * sin(uTime * 0.5 + vUv.x * 18.0)) * smoothstep(0.0, 0.12, vUv.y); gl_FragColor = vec4(uCol * a, 1.0); }',
      });
      shaft = new THREE.Mesh(g, mat); shaft.position.set(sh.shaftAt[0], reg.y, sh.shaftAt[1]); shaft.name = 'dungeon light shaft';
    }

    // ------------------------------------------------------------ compile off-screen, then show
    const holder = new THREE.Group(); holder.name = 'dungeon pieces';
    for (const c of chunks) holder.add(c.mesh);
    for (const mv of [...movers.gates, ...movers.secrets, ...movers.levers]) if (mv.mesh) holder.add(mv.mesh);
    holder.add(flames, dust); if (shaft) holder.add(shaft);
    holder.updateMatrixWorld(true);
    try { if (renderer.compileAsync) await renderer.compileAsync(holder, view.camera, scene); } catch { /* a warm-up only */ }
    if (disposed) return;
    root.add(holder);
    stats.buildMs = Math.round(performance.now() - t0);
    built = true;
  }

  // ---------------------------------------------------------------- per frame
  let t = 0, assignT = 0, disposed = false;
  const lampPos = new THREE.Vector3();
  const order = [];
  function assign(at) {
    // the nearest fires that can light where you are: those you can see first, then by distance
    order.length = 0;
    const hx = at.x, hz = at.z;
    for (let j = 0; j < torches.length; j++) {
      const T = torches[j]; if (!T.pool) continue;
      const d = Math.hypot(T.x - hx, T.z - hz); if (d > 26) continue;
      let seen = 1;
      const steps = Math.ceil(d / 1.0);
      for (let s = 1; s < steps; s++) { const tt = walk.tileOf(hx + (T.x - hx) * s / steps, hz + (T.z - hz) * s / steps); if (tt < 0 || P.cells[tt] === CODE.ROCK) { seen = 0; break; } }
      order.push({ j, score: d + (seen ? 0 : 30) });
    }
    order.sort((a, b) => a.score - b.score);
    const want = new Set(order.slice(0, pool.length).map(o => o.j));
    for (const s of pool) s.want = s.src >= 0 && want.has(s.src) ? 1 : 0;
    const used = new Set(pool.filter(s => s.src >= 0 && s.want).map(s => s.src));
    for (const j of want) {
      if (used.has(j)) continue;
      const free = pool.find(s => s.src < 0 || (s.want === 0 && s.w < 0.02));
      if (!free) break;
      free.src = j; free.w = 0; free.want = 1; used.add(j);
      const T = torches[j]; free.light.position.set(T.x, T.y + 0.15, T.z); free.light.color.copy(T.col);
    }
  }
  return {
    root, stats, chunks, get torches() { return torches; }, lights: pool, lantern, dungeon: true,
    // the world view's other fields (play.js / arena-ui.js read them): nothing like them down here
    tiles: new Map(), chestMeshes: new Map(), objectMeshes: new Map(), rewardMeshes: [], shrineMarks: [], chimneys: [], arena: null, kitStats: null, treeStats: null, townStats: null,
    ready: () => ready,
    update(dt, at) {
      t += dt; U.time.value = t;
      const cam = view.camera.position; U.cam.value.copy(cam);
      if (!built) return;
      // chunks past the fog are not drawn
      const far = (Q.far + 20);
      for (const c of chunks) { const b = c.box; const dx = Math.max(b.min.x - cam.x, 0, cam.x - b.max.x), dz = Math.max(b.min.z - cam.z, 0, cam.z - b.max.z), dy = Math.max(b.min.y - cam.y, 0, cam.y - b.max.y); c.mesh.visible = Math.hypot(dx, dz, dy) < far; }
      // the light pool: re-pick the fires every 0.25 s, fade them in and out (never a pop), flicker
      if (at && (assignT -= dt) <= 0) { assignT = 0.25; assign(at); }
      if (shaft) shaft.visible = Math.hypot(shaft.position.x - cam.x, shaft.position.z - cam.z) < Q.far + 10;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        s.w += (s.want - s.w) * Math.min(1, dt * 3.5);
        if (s.src < 0) { s.light.intensity = 0; continue; }
        const T = torches[s.src], ph = s.src * 1.37;
        const fl = 0.84 + 0.1 * Math.sin(t * 9.3 + ph * 6.1) + 0.06 * Math.sin(t * 21.7 + ph * 13.0);
        s.light.intensity = DUNGEON_LOOK.light_intensity * (T.kind === 'brazier' || T.kind === 'fire' ? 1.4 : T.kind === 'shaft' ? 1.1 : 1) * s.w * (T.kind === 'shaft' ? 1 : fl);
      }
      if (at) {
        const y = walk.y(at.x, at.z);
        lampPos.set(at.x, y + 2.9, at.z);
        lantern.position.lerp(lampPos, Math.min(1, dt * 12));
        lantern.intensity = DUNGEON_LOOK.lantern_intensity * (0.96 + 0.04 * Math.sin(t * 7.1));
      }
      // gates rise, the secret door sinks, the lever flips: from the dungeon's state (D.state.open)
      for (const g of movers.gates) { const m = g.mesh; if (!m) continue; const u = m.userData, want = D.state.open[u.id] ? 1 : 0; u.open += (want - u.open) * Math.min(1, dt * 1.6); m.position.y = u.y0 + u.open * u.lift; }
      for (const g of movers.secrets) { const m = g.mesh; if (!m) continue; const u = m.userData, want = D.state.open[u.id] ? 1 : 0; u.open += (want - u.open) * Math.min(1, dt * 0.8); m.position.y = u.y0 - u.open * u.drop; m.visible = u.open < 0.995; }
      for (const lv of movers.levers) { const m = lv.mesh; if (!m) continue; const u = m.userData, want = D.state.open[u.gate] ? 1 : 0; u.on += (want - u.on) * Math.min(1, dt * 6); m.rotation.x = -0.6 + 1.2 * u.on; m.position.y = lv.y + 1.0; }
    },
    /** The dungeon's air instead of the weather's (view.afterWeather): no sun, a cold dim fill, dark fog, fire. */
    afterWeather() {
      const Lk = DUNGEON_LOOK;
      view.sun.intensity = 0; view.sun.castShadow = false;
      view.hemi.color.set(Lk.fill); view.hemi.groundColor.set(Lk.fillGround); view.hemi.intensity = Lk.fillIntensity;
      scene.environmentIntensity = Lk.env;
      renderer.toneMappingExposure = Lk.exposure;
      scene.fog.color.set(Lk.fog); scene.fog.near = Q.near; scene.fog.far = Q.far;
      if (scene.background?.isColor) scene.background.set(Lk.fog);
      view.sky.visible = false; if (view.hills) view.hills.visible = false;
      ATMOS.set({ cloud: { strength: 0 }, mist: { density: Lk.mist.density, base: lantern.position.y - 2.9 + 0.4, falloff: Lk.mist.falloff, max: Lk.mist.max }, wet: 0 });
      const post = view.post;
      if (post) {
        post.bloom.strength = Lk.bloom.strength; post.bloom.threshold = Lk.bloom.threshold; post.bloom.enabled = true;
        if (post.rays) post.rays.enabled = false;
        post.grade.uVig.value = Lk.vignette; post.grade.uSat.value = Lk.saturation; post.grade.uLift.value = 0;
      }
    },
    dispose() {
      disposed = true;
      view.sun.castShadow = saved.sunShadow; view.sky.visible = saved.sky; if (view.hills) view.hills.visible = saved.hills;
      view.hemi.color.copy(saved.hemiSky); view.hemi.groundColor.copy(saved.hemiGround);
      scene.fog.color.copy(saved.fog); scene.fog.near = saved.near; scene.fog.far = saved.far;
      if (saved.bg?.isColor && scene.background?.isColor) scene.background.copy(saved.bg);
      ATMOS.uniforms.uAtMist.value.copy(saved.mist); ATMOS.uniforms.uAtCloud.value.copy(saved.cloud);
      if (view.post?.rays) view.post.rays.enabled = true;
      if (view.post && saved.post) { view.post.bloom.strength = saved.post.bloom; view.post.bloom.threshold = saved.post.cut; view.post.grade.uVig.value = saved.post.vig; view.post.grade.uSat.value = saved.post.sat; view.post.grade.uLift.value = saved.post.lift; }
    },
  };
}

/** The House Kit atlas look (each square repeating on its own) + the baked fire light as an emissive term. */
function bakedAtlasMaterial(kit, U) {
  const mat = new THREE.MeshLambertMaterial({ map: kit.texture, vertexColors: true });
  mat.name = 'dungeon stone';
  const size = kit.texture.image?.width || kit.A.size;
  const maxLod = Math.log2(kit.A.gutter || 32) - 0.5;
  mat.onBeforeCompile = sh => {
    sh.uniforms.atlasSize = { value: size }; sh.uniforms.uBake = U.bake;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tile;\nattribute vec3 bake;\nvarying vec4 vTile;\nvarying vec2 vTUv;\nvarying vec3 vBake;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = tile; vTUv = uv; vBake = bake;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTile;\nvarying vec2 vTUv;\nvarying vec3 vBake;\nuniform float atlasSize;\nuniform float uBake;')
      .replace('#include <map_fragment>', `
        vec2 hkCell = fract(vTUv);
        vec2 hkUv = vTile.xy + hkCell * vTile.zw;
        vec2 hkGx = dFdx(vTUv) * vTile.zw * atlasSize, hkGy = dFdy(vTUv) * vTile.zw * atlasSize;
        float hkLod = clamp(0.5 * log2(max(max(dot(hkGx, hkGx), dot(hkGy, hkGy)), 1e-8)), 0.0, ${maxLod.toFixed(2)});
        vec4 sampledDiffuseColor = textureLod(map, hkUv, hkLod);
        diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBake;');
  };
  mat.customProgramCacheKey = () => 'ow-dungeon-atlas-v1';
  return mat;
}
/** A plain painted texture (the bone walls) + the baked fire light. */
function bakedPlainMaterial(tex, U) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  mat.name = 'dungeon bones';
  mat.onBeforeCompile = sh => {
    sh.uniforms.uBake = U.bake;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 bake;\nvarying vec3 vBake;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvBake = bake;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uBake;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBake;');
  };
  mat.customProgramCacheKey = () => 'ow-dungeon-bones-v1';
  return mat;
}

/** The ambience bed for a dungeon (play.js uses this instead of render/ambient.js, which reads the open world's land). */
export function dungeonAmbient({ sound = null } = {}) {
  let bed = null, tick = 0;
  return {
    wet: 0, bedOverride: null,
    update(dt) {
      if ((tick -= dt) > 0 || !sound) return; tick = 2;
      if (bed !== 'ambience.cave') { bed = 'ambience.cave'; try { sound()?.ambience?.(bed); } catch { /* no sound yet */ } }
    },
    dispose() { try { if (bed) sound?.()?.stopLoop?.(bed, 0.6); } catch { /* fine */ } },
  };
}
