// Makes block bodies: the three starter ships, enemy ships for any danger level, asteroids and stations.
// Every generated hull is symmetric left/right and tapers in steps of 1-over-1 or 1-over-2 so the automatic
// corners (sim/corners.js) turn the noses, wings and tails into slopes.
//
// Ship axes: +z forward, +y up, +x right. Facing `r` indexes DIRS: 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z.

import { BLOCKS } from '../data/blocks.js';
import { createGrid, put, get, has, remove, key } from './grid.js';
import { makeItem, rollRarity } from './items.js';
import { rng, DIRS, clamp } from '../core/math.js';
import { keepClearCells } from './corners.js';

const R = { right: 0, left: 1, up: 2, down: 3, fwd: 4, back: 5 };
const mirrorR = r => (r === 0 ? 1 : r === 1 ? 0 : r);

function fill(g, x0, y0, z0, x1, y1, z1, t, p = 0) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) put(g, { x, y, z, t, p });
}
/** Put a part (item block); `mirror` also puts the mirrored copy at −x. */
function part(g, x, y, z, kind, r, item, p = 0, mirror = false) {
  put(g, { x, y, z, t: kind, r, p, item });
  if (mirror && x !== 0) put(g, { x: -x, y, z, t: kind, r: mirrorR(r), p, item: { ...item, uid: item.uid + 100000 } });
}

// ------------------------------------------------------------------ starter ships
export const STARTERS = [
  { id: 'wasp', name: 'Wasp', role: 'Fighter', blurb: 'Quick and light, two autocannons and a mining laser.' },
  { id: 'mule', name: 'Mule', role: 'Miner', blurb: 'Slow and roomy, two mining lasers and a gatling.' },
  { id: 'bulwark', name: 'Bulwark', role: 'Tank', blurb: 'Armoured nose, a shield and a flak cannon.' },
];

/** Builds a starter. `newItem(kind, tier)` makes (and registers) each part item. */
export function buildStarter(id, newItem, paint = 0, accent = 2) {
  const g = createGrid(); const P = paint, A = accent;
  const it = k => newItem(k, 1, 0);
  if (id === 'wasp') {
    // body 3 wide, nose tapers 1-over-1, swept wings 1-over-1
    fill(g, -1, 0, -2, 1, 0, 3, 'hull', P); fill(g, 0, 0, 4, 0, 0, 5, 'hull', P);
    fill(g, -1, 1, -2, 1, 1, 1, 'hull', P); put(g, { x: 0, y: 1, z: 2, t: 'window' });
    for (let i = 0; i < 3; i++) { fill(g, -2 - i, 0, -2, -2 - i, 0, 1 - i, 'hull', A); fill(g, 2 + i, 0, -2, 2 + i, 0, 1 - i, 'hull', A); }
    put(g, { x: 0, y: 1, z: 1, t: 'bridge', r: R.fwd, item: it('bridge') });
    put(g, { x: 0, y: 0, z: 0, t: 'reactor', item: it('reactor') });
    for (const x of [-1, 0, 1]) put(g, { x, y: 0, z: -3, t: 'thruster', r: R.back, item: it('thruster') });
    put(g, { x: 0, y: 1, z: -3, t: 'thruster', r: R.back, item: it('thruster') });
    put(g, { x: 0, y: 0, z: -1, t: 'gyro', item: it('gyro') });
    put(g, { x: -1, y: 2, z: -1, t: 'autocannon', r: R.up, item: it('autocannon') });
    put(g, { x: 1, y: 2, z: -1, t: 'autocannon', r: R.up, item: it('autocannon') });
    put(g, { x: 0, y: 0, z: 6, t: 'mining', r: R.fwd, item: it('mining') });     // on the nose: mines what you point at
  } else if (id === 'mule') {
    fill(g, -2, 0, -3, 2, 0, 2, 'hull', P); fill(g, -1, 1, -3, 1, 1, 2, 'hull', P);
    fill(g, -1, 0, 3, 1, 0, 3, 'hull', P); fill(g, 0, 0, 4, 0, 0, 4, 'hull', P); fill(g, 0, 2, -2, 0, 2, 0, 'hull', A);
    put(g, { x: 0, y: 2, z: 1, t: 'bridge', r: R.fwd, item: it('bridge') }); put(g, { x: 0, y: 2, z: 2, t: 'window' });
    put(g, { x: -1, y: 0, z: -1, t: 'cargo', item: it('cargo') }); put(g, { x: 1, y: 0, z: -1, t: 'cargo', item: it('cargo') });
    put(g, { x: 0, y: 1, z: 0, t: 'reactor', item: it('reactor') });
    for (const x of [-1, 1]) for (const y of [0, 1]) put(g, { x, y, z: -4, t: 'thruster', r: R.back, item: it('thruster') });
    put(g, { x: 0, y: 1, z: -2, t: 'gyro', item: it('gyro') });
    put(g, { x: -1, y: 0, z: 4, t: 'mining', r: R.fwd, item: it('mining') }); put(g, { x: 1, y: 0, z: 4, t: 'mining', r: R.fwd, item: it('mining') });
    put(g, { x: 0, y: 3, z: -2, t: 'gatling', r: R.up, item: it('gatling') });
    fill(g, -2, 0, -4, -2, 0, -4, 'hull', A); fill(g, 2, 0, -4, 2, 0, -4, 'hull', A);
  } else {
    fill(g, -2, 0, -3, 2, 1, 2, 'hull', P); fill(g, -1, 0, 3, 1, 1, 3, 'armor', P); fill(g, 0, 0, 4, 0, 1, 4, 'armor', P);
    fill(g, -2, 0, 2, 2, 1, 2, 'armor', P); fill(g, -1, 2, -2, 1, 2, 1, 'hull', A);
    put(g, { x: 0, y: 2, z: 0, t: 'bridge', r: R.fwd, item: it('bridge') }); put(g, { x: 0, y: 2, z: 1, t: 'window' });
    put(g, { x: 0, y: 1, z: -1, t: 'shield', item: it('shield') }); put(g, { x: 0, y: 0, z: 0, t: 'reactor', item: it('reactor') });
    put(g, { x: 0, y: 1, z: -2, t: 'gyro', item: it('gyro') });
    for (const x of [-1, 1]) for (const y of [0, 1]) put(g, { x, y, z: -4, t: 'thruster', r: R.back, item: it('thruster') });
    put(g, { x: 0, y: 3, z: -1, t: 'flak', r: R.up, item: it('flak') });
    put(g, { x: 0, y: -1, z: 1, t: 'autocannon', r: R.down, item: it('autocannon') });
    put(g, { x: 0, y: 0, z: 5, t: 'mining', r: R.fwd, item: it('mining') });
  }
  return g;
}

// ------------------------------------------------------------------ enemy ships
export const FACTIONS = {
  pirate: { name: 'Pirates', paints: [7, 2, 10], kinds: ['autocannon', 'gatling', 'flak', 'autocannon', 'missile', 'railgun'], glow: '#ff7a4a' },
  swarm: { name: 'Hive', paints: [9, 5, 4], kinds: ['plasma', 'laser', 'gatling', 'plasma'], glow: '#8dff6a' },
  navy: { name: 'Patrol', paints: [3, 1, 0], kinds: ['autocannon', 'laser', 'railgun', 'missile', 'flak'], glow: '#7ad8ff' },
  traders: { name: 'Traders', paints: [6, 1, 10], kinds: ['autocannon', 'gatling', 'flak'], glow: '#ffd27a' },   // world: convoys, merchants, escorts
};

/**
 * A symmetric enemy ship. Size grows with danger; `boss` makes a capital ship.
 * Returns { grid, items } where items is every part item used (for loot).
 */
export function generateShip(seed, { danger = 1, faction = 'pirate', boss = false, small = false } = {}) {
  const r = rng(seed); const F = FACTIONS[faction] || FACTIONS.pirate;
  const g = createGrid(); const items = [];
  const [P, A, D] = F.paints;
  const tierFor = () => clamp(Math.round(1 + (danger - 1) * 0.5 + (r() - 0.6)), 1, 4);
  const it = (kind, tier = tierFor()) => { const x = makeItem(kind, tier, rollRarity(r, danger * 0.04 + (boss ? 0.3 : 0))); items.push(x); return x; };
  const scale = small ? 0.42 : boss ? 1.7 + danger * 0.12 : 0.5 + danger * 0.13 + r() * 0.15;
  const L = Math.round(clamp(8 * scale + 2 + r() * 2, 5, 40));
  const halfW = Math.max(1, Math.round(0.4 + scale * 1.3 + r()));
  const H = Math.max(1, Math.round(0.5 + scale * 0.8 + r() * 0.6));
  const z0 = -Math.floor(L * 0.45);
  const noseRun = r() < 0.5 ? 1 : 2;                      // how fast the nose tapers (1-over-1 or 1-over-2)
  // hull: half-width and height fall off toward the nose in steps, and a little at the tail
  for (let i = 0; i < L; i++) {
    const z = z0 + i; const fromNose = L - 1 - i;
    const hw = clamp(Math.min(halfW, Math.floor(fromNose / noseRun)), 0, halfW);
    const hh = clamp(Math.min(H, Math.floor(fromNose / (noseRun + 1)) + 1), 1, H);
    const tail = i === 0 && halfW > 2 ? 1 : 0;
    for (let x = -hw + tail; x <= hw - tail; x++) for (let y = 0; y < hh; y++) {
      const edge = Math.abs(x) === hw || y === hh - 1;
      put(g, { x, y, z, t: edge && danger >= 3 && r() < 0.35 ? 'armor' : 'hull', p: y === hh - 1 && Math.abs(x) <= 0 ? A : P });
    }
  }
  // wings: 1 thick, swept back 1-over-1 or 1-over-2
  if (!small || r() < 0.5) {
    const span = Math.round(halfW + 1 + scale * 1.6 + r() * 2), root = Math.max(2, Math.round(L * 0.35)), sweep = r() < 0.5 ? 1 : 2;
    const wz = z0 + Math.floor(r() * Math.max(1, L * 0.3));
    for (let k = 1; k <= span - halfW; k++) {
      const len = root - Math.floor(k / sweep); if (len <= 0) break;
      for (let j = 0; j < len; j++) for (const sx of [-1, 1]) put(g, { x: sx * (halfW + k), y: 0, z: wz + j, t: 'hull', p: k === span - halfW ? D : A });
    }
  }
  // dorsal tower with the bridge, stepped
  const tz = z0 + Math.floor(L * 0.35), tl = Math.max(2, Math.round(L * 0.35));
  for (let j = 0; j < tl; j++) put(g, { x: 0, y: H, z: tz + j, t: 'hull', p: A });
  if (scale > 1.2) for (let j = 1; j < tl - 1; j++) for (const sx of [-1, 1]) put(g, { x: sx, y: H, z: tz + j, t: 'hull', p: P });
  const bz = tz + tl - 1;
  put(g, { x: 0, y: H + 1, z: bz - 1, t: 'bridge', r: R.fwd, item: it('bridge', clamp(Math.ceil(danger / 1.6), 1, 4)) });
  put(g, { x: 0, y: H + 1, z: bz, t: 'window' });
  // engines on the tail
  const tailZ = z0 - 1;
  const ex = Math.max(1, Math.floor(halfW * 0.7));
  for (let x = -ex; x <= ex; x += Math.max(1, ex)) for (let y = 0; y < Math.min(2, H); y++) if (has(g, x, y, z0)) put(g, { x, y, z: tailZ, t: 'thruster', r: R.back, item: it('thruster') });
  // insides: reactor(s), shield, gyro
  const inner = [...g.cells.values()].filter(b => b.t === 'hull' && Math.abs(b.x) < halfW && b.y < H - 1 || (b.t === 'hull' && b.x === 0 && b.y === 0));
  const swap = (kind, n) => { for (let i = 0; i < n && inner.length; i++) { const b = inner.splice(Math.floor(r() * inner.length), 1)[0]; put(g, { x: b.x, y: b.y, z: b.z, t: kind, item: it(kind) }); } };
  swap('reactor', 1 + Math.floor(scale)); swap('gyro', Math.max(1, Math.floor(scale * 0.8)));
  if (danger >= 2 || boss) swap('shield', boss ? 3 : 1 + Math.floor(danger / 3));
  // turrets on outward faces, mirrored
  const nT = small ? 1 : clamp(Math.round(1 + scale * 1.3 + (boss ? 4 : 0)), 1, 16);
  // weapons grow with danger: no missiles before danger 2, no railguns or lasers before danger 3, and at most one
  // missile pod per ship (lessons-from-games rule 54: cap enemy homing fire)
  const kinds = F.kinds.filter(k => (k !== 'missile' || danger >= 2) && ((k !== 'railgun' && k !== 'laser') || danger >= 3 || faction === 'swarm'));
  if (!kinds.length) kinds.push('autocannon');
  let pods = 0;
  let placed = 0, tries = 0;
  while (placed < nT && tries++ < 200) {
    const cells = [...g.cells.values()];
    const b = cells[Math.floor(r() * cells.length)]; if (b.t !== 'hull' && b.t !== 'armor') continue;
    const dir = r.pick([R.up, R.up, R.down, b.x > 0 ? R.right : R.left]);
    const [dx, dy, dz] = DIRS[dir];
    const tx = b.x + dx, ty = b.y + dy, tz2 = b.z + dz;
    const [mx, my, mz] = DIRS[dir];
    if (has(g, tx, ty, tz2) || has(g, tx + mx, ty + my, tz2 + mz)) continue;
    if (b.x !== 0 && (has(g, -tx, ty, tz2) || has(g, -tx - mx, ty + my, tz2 + mz) || !has(g, -b.x, b.y, b.z))) continue;
    let kind = r.pick(kinds);
    if (kind === 'missile' && (pods >= 1 || b.x !== 0)) kind = kinds.find(k => k !== 'missile') || 'autocannon';
    if (kind === 'missile') pods++;
    put(g, { x: tx, y: ty, z: tz2, t: kind, r: dir, item: it(kind) });
    if (b.x !== 0 && tx !== 0) put(g, { x: -tx, y: ty, z: tz2, t: kind, r: mirrorR(dir), item: it(kind) });
    placed += tx === 0 ? 1 : 2;
  }
  clearMounts(g);
  // capital ships (and big ships deep out) are plated with 2×2×2 blocks wherever eight plain hull cells form a cube
  if (boss || danger >= 5) bigify(g, boss ? 'armor2' : 'hull2', boss ? 1 : 0.5, r);
  return { grid: g, items };
}
/** Swap 2×2×2 cubes of plain hull/armor for one big block (share = how many of the cubes found are swapped). */
export function bigify(g, t, share = 1, r = Math.random) {
  const plain = b => b && !b.item && (b.t === 'hull' || b.t === 'armor');
  for (const b of [...g.cells.values()]) {
    if (!plain(b) || !g.cells.has(key(b.x, b.y, b.z)) || r() > share) continue;
    const cells = []; let ok = true;
    for (let i = 0; i < 2 && ok; i++) for (let j = 0; j < 2 && ok; j++) for (let k = 0; k < 2 && ok; k++) { const c = get(g, b.x + i, b.y + j, b.z + k); if (!plain(c) || (BLOCKS[c.t]?.size || 1) > 1) ok = false; else cells.push(c); }
    if (!ok) continue;
    const p = b.p; for (const c of cells) remove(g, c.x, c.y, c.z);
    put(g, { x: b.x, y: b.y, z: b.z, t, p });
  }
}
/** Remove any block that sits in a turret's gun cell or a thruster's flame cell. */
function clearMounts(g) {
  for (const k of keepClearCells(g)) { const b = g.occ.get(k); if (b && !b.item) remove(g, b.x, b.y, b.z); }
}

// ------------------------------------------------------------------ asteroids
const ORE_BY_DANGER = [['ore_iron'], ['ore_iron', 'ore_copper'], ['ore_copper', 'ore_iron', 'ore_cobalt'], ['ore_cobalt', 'ore_copper', 'ore_iridium'], ['ore_iridium', 'ore_cobalt', 'ore_solar'], ['ore_solar', 'ore_iridium', 'ore_cobalt']];
export function generateRock(seed, { radius = 5, danger = 1 } = {}) {
  const r = rng(seed); const g = createGrid();
  const R0 = radius; const bumps = [];
  for (let i = 0; i < 6; i++) bumps.push({ x: r.range(-1, 1), y: r.range(-1, 1), z: r.range(-1, 1), a: r.range(0.15, 0.35) });
  const ores = ORE_BY_DANGER[clamp(danger - 1, 0, 5)];
  const ore = r.pick(ores); const veins = [];
  const nv = Math.round(2 + radius * 0.7);
  for (let i = 0; i < nv; i++) { const k = i < 2 ? 0.95 : 0.7; veins.push({ x: r.range(-R0, R0) * k, y: r.range(-R0, R0) * k, z: r.range(-R0, R0) * k, s: r.range(1.8, 3.2), t: r() < 0.75 ? ore : r.pick(ores) }); }   // two veins reach the surface so you can see where to cut
  const sy = r.range(0.65, 1), sz = r.range(0.8, 1.25);
  for (let x = -R0 - 2; x <= R0 + 2; x++) for (let y = -R0 - 2; y <= R0 + 2; y++) for (let z = -R0 - 2; z <= R0 + 2; z++) {
    const d = Math.hypot(x, y / sy, z / sz) / R0; if (d > 1.3) continue;
    let f = 1; const nx = x / (Math.hypot(x, y, z) || 1), ny = y / (Math.hypot(x, y, z) || 1), nz = z / (Math.hypot(x, y, z) || 1);
    for (const b of bumps) f += (nx * b.x + ny * b.y + nz * b.z) * b.a;
    if (d > f * 0.95) continue;
    let t = 'rock';
    for (const v of veins) if (Math.hypot(x - v.x, y - v.y, z - v.z) < v.s) { t = v.t; break; }
    put(g, { x, y, z, t });
  }
  return g;
}

// ------------------------------------------------------------------ stations
export function generateStation(seed) {
  const r = rng(seed); const g = createGrid();
  const ring = 22, thick = 2;
  // hub
  for (let x = -5; x <= 5; x++) for (let y = -10; y <= 10; y++) for (let z = -5; z <= 5; z++) {
    const d = Math.hypot(x, z); const taper = Math.abs(y) > 6 ? 5 - (Math.abs(y) - 6) : 5;
    if (d <= taper + 0.3) put(g, { x, y, z, t: (Math.abs(y) % 4 === 1 && d > taper - 0.8) ? 'station_lit' : 'station' });
  }
  // ring
  for (let a = 0; a < 360; a += 1) {
    const rad = a * Math.PI / 180;
    for (let w = -thick; w <= thick; w++) for (let h = -1; h <= 1; h++) {
      const R2 = ring + w; const x = Math.round(Math.cos(rad) * R2), z = Math.round(Math.sin(rad) * R2);
      const lit = w === thick && h === 0 && Math.floor(a / 6) % 2 === 0;
      put(g, { x, y: h, z, t: lit ? 'station_lit' : 'station' });
    }
  }
  // spokes
  for (const ang of [0, 90, 180, 270]) {
    const rad = ang * Math.PI / 180;
    for (let d = 5; d < ring; d++) for (const o of [-1, 0, 1]) {
      const x = Math.round(Math.cos(rad) * d - Math.sin(rad) * o), z = Math.round(Math.sin(rad) * d + Math.cos(rad) * o);
      put(g, { x, y: 0, z, t: 'station' });
    }
  }
  // docking arm out along +x, lit green at the mouth
  for (let d = ring + 3; d <= ring + 9; d++) for (const y of [-1, 1]) for (const z of [-2, 2]) put(g, { x: d, y, z, t: d === ring + 9 ? 'station_dock' : 'station' });
  for (let i = 0; i < 40; i++) { const x = r.int(-5, 5), y = r.int(-10, 10), z = r.int(-5, 5); const b = get(g, x, y, z); if (b && b.t === 'station') b.t = 'station_lit'; }
  return g;
}
// ------------------------------------------------------------------ world: round 2 bodies
/**
 * A drone: five blocks — bridge, engine, nose, two fins — plus its tool on top (combat: a gun; mining: a cutter;
 * repair: a lit arm). `items` = { bridge, thruster, tool } made by the caller.
 */
export function generateDrone(kind, items, paint = 0, accent = 2) {
  const g = createGrid();
  put(g, { x: 0, y: 0, z: 0, t: 'bridge', r: R.fwd, item: items.bridge, p: paint });
  put(g, { x: 0, y: 0, z: -1, t: 'thruster', r: R.back, item: items.thruster });
  put(g, { x: 0, y: 0, z: 1, t: 'hull', p: accent });
  put(g, { x: -1, y: 0, z: 0, t: 'hull', p: paint }); put(g, { x: 1, y: 0, z: 0, t: 'hull', p: paint });
  if (kind === 'fighter') put(g, { x: 0, y: 1, z: 0, t: items.tool.kind, r: R.up, item: items.tool });
  else if (kind === 'miner') put(g, { x: 0, y: 0, z: 2, t: 'mining', r: R.fwd, item: items.tool });
  else put(g, { x: 0, y: 1, z: 0, t: 'window', p: accent });
  return g;
}

/** Slots where an outpost's guns go (top and bottom corners of the hub), in build order. */
const OUTPOST_GUNS = [[-3, 6, -3, R.up], [3, 6, 3, R.up], [3, -6, -3, R.down], [-3, -6, 3, R.down], [3, 6, -3, R.up], [-3, 6, 3, R.up]];
/**
 * Your planet outpost: a small station in your colours (a hub, a ring on four spokes, a docking arm with green
 * lights). It grows a piece for every module you build: ore site = a drill under the hub, R&D lab = a glass dome on
 * top, factory = a works block, trade post = an antenna, storage = cargo pods, defence guns = real turrets (2 a level).
 * `makeGun(slot)` returns each turret's item.
 */
export function generateOutpost(levels = {}, { paint = 0, accent = 2, makeGun = null, reactor = null } = {}) {
  const g = createGrid(); const L = k => levels[k] || 0;
  fill(g, -4, -5, -4, 4, 5, 4, 'hull', paint);
  for (const y of [-3, 3]) for (let i = -4; i <= 4; i++) for (const [x, z] of [[i, -4], [i, 4], [-4, i], [4, i]]) put(g, { x, y, z, t: 'station_lit' });
  if (reactor) put(g, { x: 0, y: 0, z: 0, t: 'reactor', item: reactor });
  // the ring on four spokes
  for (let a = 0; a < 360; a += 1.5) { const rad = a * Math.PI / 180; const x = Math.round(Math.cos(rad) * 12), z = Math.round(Math.sin(rad) * 12); for (const y of [-1, 0]) put(g, { x, y, z, t: 'hull', p: accent }); }
  for (let d = 5; d <= 11; d++) for (const [x, z] of [[d, 0], [-d, 0], [0, d], [0, -d]]) put(g, { x, y: 0, z, t: 'frame', p: paint });
  // docking arm along +x, green lights at its mouth
  fill(g, 13, 0, 0, 18, 0, 0, 'hull', paint); for (const y of [-1, 1]) put(g, { x: 18, y, z: 0, t: 'station_dock' });
  if (L('ore')) { fill(g, 0, -6, 0, 0, -6 - L('ore') * 3, 0, 'frame', accent); put(g, { x: 0, y: -7 - L('ore') * 3, z: 0, t: 'station_lit' }); }
  if (L('lab')) { fill(g, -1, 6, -1, 1, 6, 1, 'window'); if (L('lab') >= 2) put(g, { x: 0, y: 7, z: 0, t: 'window' }); if (L('lab') >= 3) for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(g, { x, y: 6, z, t: 'window' }); }
  if (L('factory')) fill(g, -2, -2, -5, 2, 1, -4 - L('factory') * 2, 'hull', accent);
  if (L('trade')) { fill(g, 1, 1, 5, 1, 1, 5 + L('trade') * 3, 'frame', paint); put(g, { x: 1, y: 1, z: 6 + L('trade') * 3, t: 'station_lit' }); }
  if (L('storage')) fill(g, -5, -2, -1, -4 - L('storage'), 1, 1, 'cargo', paint);
  const guns = Math.min(OUTPOST_GUNS.length, L('turrets') * 2);
  for (let i = 0; i < guns; i++) { const [x, y, z, r] = OUTPOST_GUNS[i]; const it = makeGun ? makeGun(i) : null; if (it) put(g, { x, y, z, t: it.kind, r, item: it }); }
  return g;
}

/** A derelict station: a hollow, holed shell (a 5 m wide way in on one side) and a broken ring. */
export function generateDerelict(seed) {
  const r = rng(seed); const g = createGrid(); const Rr = 14;
  for (let x = -Rr; x <= Rr; x++) for (let y = -Rr; y <= Rr; y++) for (let z = -Rr; z <= Rr; z++) {
    const d = Math.hypot(x, y * 1.15, z); if (d > Rr || d < Rr - 2) continue;
    if (x > 0 && Math.abs(y) <= 2 && Math.abs(z) <= 2) continue;        // the way in
    if (r() < 0.06) continue;                                         // holes
    put(g, { x, y, z, t: r() < 0.25 ? 'armor' : r() < 0.08 ? 'frame' : 'hull', p: r() < 0.7 ? 2 : 7 });
  }
  const a0 = Math.PI / 2 - 0.2 - r() * 1.8;     // the ring's arc always crosses +z, where the spoke meets it
  for (let a = 0; a < 2.2; a += 0.012) for (let w = -1; w <= 1; w++) for (const h of [-1, 0]) {
    const R2 = 24 + w; const x = Math.round(Math.cos(a0 + a) * R2), z = Math.round(Math.sin(a0 + a) * R2);
    if (r() < 0.04) continue;
    put(g, { x, y: h, z, t: 'hull', p: 2 });
  }
  for (let z = Rr - 2; z <= 25; z++) for (const x of [-1, 0]) put(g, { x, y: 0, z, t: 'frame', p: 2 });   // a spoke holds the ring on
  return g;
}
/** A sealed cache: a little glowing crate. */
export function generateCache() {
  const g = createGrid();
  fill(g, 0, 0, 0, 1, 1, 1, 'station_lit');
  return g;
}

export { R as FACE, fill, part, remove, key };
