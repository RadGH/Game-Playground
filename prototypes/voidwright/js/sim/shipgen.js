// Procedural ships and stations: same seed + class + faction → the same ship every time.
// Ships are mirror-symmetric along their length (nose = +x). Built in "units" the size of the class's
// biggest block, so a cruiser is made of 4x4 parts and still only has a few hundred blocks.

import { rng } from '../core/math.js';
import { createGrid, place, canPlace, remove } from './grid.js';
import { BLOCKS } from '../data/blocks.js';
import { CLASSES } from '../data/hulls.js';
import { FACTIONS } from '../data/factions.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { makeBody, recompute } from './ship.js';

const sized = (id, U) => {
  if (U === 1) return id;
  const s = `${id}_${U}`;
  return BLOCKS[s] ? s : id;
};
export const TIER_DMG = [0.3, 0.3, 0.42, 0.55, 0.65, 0.74, 0.82, 0.9, 0.96, 1.02, 1.08];
/**
 * Enemy pacing (play-test 2026-11-10: "one or two missile bursts kill them before they fight back", and a
 * danger-3 base "obliterated me immediately"). Enemy guns cycle slower and bases carry fewer of them.
 * The extra hull (x2.1-3.2 per block) that came with it was taken back on 2026-11-11 (owner: "now they
 * are too strong"), so ENEMY_HP is 1 — the knob stays in case a later play-test wants a little more.
 */
export const ENEMY_HP = () => 1;
export const ENEMY_FIRE = 0.75;      // ships
export const STATION_FIRE = 0.45;    // hostile stations and strongholds: big, but they no longer shred you on sight
export function hardenEnemy(body) {
  if (!body || body.hardened) return body;
  const k = ENEMY_HP(body.tier || 1);
  for (const b of body.grid.blocks) { b.maxHp *= k; b.hp *= k; }
  body.hardened = true;
  body.fireMul = body.kind === 'station' ? STATION_FIRE : ENEMY_FIRE;
  if (body.kind === 'station') body.dmgMul = (body.dmgMul ?? 1) * 0.6;
  recompute(body);
  return body;
}
const CORE = { 1: 'bridge', 2: 'command_deck', 4: 'flag_bridge' };
const ENGINE = { 1: 'thruster', 2: 'thruster_2', 4: 'thruster_4' };
const POWER = { 1: 'reactor', 2: 'reactor_2', 4: 'reactor_4' };
const CPU = { 1: 'cpu', 2: 'cpu_2', 4: 'cpu_4' };
const GYRO = { 1: 'gyro', 2: 'gyro_2', 4: 'gyro_2' };
const BUBBLE = { 1: 'shield_bubble', 2: 'shield_bubble_2', 4: 'shield_bubble_4' };
const ARCSH = { 1: 'shield_arc', 2: 'shield_arc_2', 4: 'shield_arc_2' };
const BAY = { 1: 'drone_bay', 2: 'drone_bay_2', 4: 'drone_bay_4' };

/** Size of the ship in units: [length, width] (width odd so there is a centre row). */
function dims(cls, r) {
  const c = CLASSES[cls]; const U = c.maxBlock;
  const span = Math.floor(c.grid / U);
  const len = Math.max(3, Math.round(span * r.range(0.65, 0.95)));
  let wid = Math.max(3, Math.round(span * r.range(0.4, 0.7)));
  if (wid % 2 === 0) wid++;
  return [len, wid, U];
}

/** Half-width (in units) of the hull at column x (0 = stern, len-1 = nose). */
function profile(shape, len, half, r) {
  const hw = [];
  const bumps = [r.range(0, 6), r.range(0, 6)];
  for (let x = 0; x < len; x++) {
    const t = x / Math.max(1, len - 1);     // 0 stern → 1 nose
    let v;
    switch (shape) {
      case 'wedge': v = half * (1 - t * 0.85); break;
      case 'jagged': v = half * (0.55 + 0.45 * Math.sin(t * 9 + bumps[0])) * (1 - t * 0.6); break;
      case 'organic': v = half * (0.45 + 0.4 * Math.sin(t * Math.PI) + 0.2 * Math.sin(t * 7 + bumps[1])); break;
      case 'grid': v = half * ((x % 3 === 1) ? 1 : 0.6) * (t > 0.85 ? 0.5 : 1); break;
      case 'crystal': v = half * (1 - Math.abs(t - 0.45) * 1.8); break;
      case 'slab': v = half * (t > 0.9 ? 0.7 : 1); break;
      default: v = half * (t > 0.75 ? 1 - (t - 0.75) * 2.6 : 0.85 + 0.15 * Math.sin(t * 6 + bumps[0]));
    }
    hw.push(Math.max(0, Math.round(v)));
  }
  // the bridge column and its neighbours always have some width
  return hw;
}

/**
 * Generate a ship body.
 * @param {object} o { cls, faction, tier, seed, role }
 */
export function generateShip({ cls = 'skiff', faction = 'redfang', tier = 1, seed = 1, role = null, gnat = false } = {}) {
  const r = rng(seed);
  const F = FACTIONS[faction] || FACTIONS.redfang; const style = F.style;
  // a gnat: the smallest enemy there is — a 3-4 cell dart with one or two small guns, no shield, thin
  // hull. They come in packs of 5-9 (galaxy.js spawnGroup 'gnats') as easy targets for any loadout.
  if (gnat) { cls = 'skiff'; role = 'swarm'; }
  role = role || r.pick(style.roles);
  const [len, wid, U] = gnat ? [r.int(3, 4), 3, 1] : dims(cls, r);
  const half = (wid - 1) / 2;
  const hw = profile(style.shape, len, half, r);
  // occupancy mask in units, mirrored
  const mask = [];
  for (let y = 0; y < wid; y++) { mask.push([]); for (let x = 0; x < len; x++) mask[y][x] = Math.abs(y - half) <= hw[x]; }
  // wings: a pair of rectangles sticking out
  const wings = gnat ? 0 : r.int(0, cls === 'skiff' ? 1 : 2);
  for (let k = 0; k < wings; k++) {
    const wx = r.int(0, Math.max(0, len - 3)), wl = r.int(1, Math.max(1, Math.round(len / 3)));
    const reach = half;
    for (let x = wx; x < Math.min(len, wx + wl); x++) for (let d = 0; d <= reach; d++) { mask[half - d][x] = true; mask[half + d][x] = true; }
  }
  for (let x = 0; x < len; x++) mask[half][x] = true;   // spine
  // which units are on the outside
  const isIn = (x, y) => y >= 0 && y < wid && x >= 0 && x < len && mask[y][x];
  const outer = (x, y) => !isIn(x + 1, y) || !isIn(x - 1, y) || !isIn(x, y + 1) || !isIn(x, y - 1);

  const g = createGrid(len * U, wid * U);
  const armorMat = r.pick(style.armor);
  const armorBase = tier >= 6 && faction === 'navy' ? 'iridium' : tier >= 4 && faction === 'navy' ? 'titanium' : armorMat;
  const armorId = sized(tier >= 6 && faction === 'navy' ? 'iridium' : tier >= 4 && faction === 'navy' ? 'titanium' : armorMat, U);
  const frameId = sized('frame', U);
  const itemFor = () => (tier > 1 ? { rarity: tier >= 7 ? 'epic' : tier >= 5 ? 'rare' : tier >= 3 ? 'uncommon' : 'common', mods: { dmg: (tier - 1) * 0.05 } } : null);
  const putUnit = (x, y, id, rot = 0, item = null) => {
    const def = BLOCKS[id];
    if (!def) return;
    const n = def.size || 1;
    if (n >= U) { place(g, id, x * U, y * U, rot, item); return; }
    if (def.cat === 'weapon') {
      // a smaller gun in a bigger slot: two guns on the diagonal, armour in the other two quarters
      const h = U / 2, sub = sized(armorBase, h), armorIn = (ax, ay) => { const ad = BLOCKS[sub]; const an = ad.size || 1; for (let j = 0; j < h; j += an) for (let i = 0; i < h; i += an) place(g, sub, ax + i, ay + j); };
      const putQ = (qx, qy) => { const ax = x * U + qx * h, ay = y * U + qy * h; if (n === h) place(g, id, ax, ay, rot, item); else { place(g, id, ax, ay, rot, item); armorIn(ax, ay); } };
      putQ(0, 0); putQ(1, 1); armorIn(x * U + h, y * U); armorIn(x * U, y * U + h);
      return;
    }
    for (let j = 0; j < U; j += n) for (let i = 0; i < U; i += n) place(g, id, x * U + i, y * U + j, rot, item);
  };
  let pdCount = 0, gunCount = 0;
  const weaponFor = (want) => {
    const pools = style.weapons;
    // big hulls mix capital guns with secondary batteries one size down
    const lst = U === 4 ? (r.chance(0.55) ? pools.l : pools.m) : U === 2 ? (r.chance(0.6) ? pools.m : pools.s) : pools.s;
    const fit = lst.filter(id => (ALL_WEAPONS[id].bsize || 1) <= U && (U < 4 || (ALL_WEAPONS[id].bsize || 1) >= 2));
    const pool = fit.length ? fit : pools.s;
    const wantList = want ? pool.filter(id => ALL_WEAPONS[id].mode === want) : [];
    let pick = r.pick(wantList.length ? wantList : pool);
    // keep point defence to about a quarter of the guns
    if (ALL_WEAPONS[pick].mode === 'pd') { pdCount++; if (pdCount > 1 + gunCount * 0.33) { const alt = pool.filter(id => ALL_WEAPONS[id].mode !== 'pd'); if (alt.length) { pick = r.pick(alt); pdCount--; } } }
    gunCount++;
    return pick;
  };

  const used = new Set(); const key = (x, y) => x + ',' + y;
  const set = (x, y, id, rot = 0, item = null) => { if (!isIn(x, y) || used.has(key(x, y))) return false; used.add(key(x, y)); putUnit(x, y, id, rot, item); return true; };
  const pair = (x, d, id, rotTop = 0, rotBot = 0, item = null) => { set(x, half - d, id, rotTop, item); if (d) set(x, half + d, id, rotBot, item); };

  // core in the middle of the spine
  const coreX = Math.max(1, Math.floor(len * 0.4));
  set(coreX, half, CORE[U]);
  // engines on the stern of every row, facing back
  for (let y = 0; y < wid; y++) { let x = 0; while (x < len && !isIn(x, y)) x++; if (x < len && (Math.abs(y - half) % 2 === 0 || r.chance(0.5))) set(x, y, ENGINE[U], 4); }
  // systems near the core
  set(coreX - 1, half, POWER[U]);
  pair(coreX, 1, r.chance(0.5) ? CPU[U] : GYRO[U]);
  pair(coreX - 1, 1, sized('quarters', U));
  if (!gnat && (tier >= 2 || r.chance(0.5))) set(coreX + 1, half, r.chance(0.6) ? BUBBLE[U] : ARCSH[U]);
  if (role === 'carrier') { pair(coreX + 1, 1, BAY[U]); if (CLASSES[cls].rank >= 4) pair(coreX - 2, 1, BAY[U]); }
  if (role === 'trader' || role === 'miner') { for (let x = 1; x < len - 1; x++) pair(x, 1, sized('cargo', U)); }
  if (len > 6) set(coreX - 2, half, POWER[U]);
  // nose weapon (fixed or manual) and front deflector
  const nose = len - 1;
  if (role !== 'trader') set(nose, half, weaponFor(r.chance(0.5) ? 'fixed' : null), 0, itemFor());
  // turrets on the outer hull, armour everywhere else on the outside
  const density = gnat ? 0.15 : role === 'trader' ? 0.12 : role === 'capital' ? 0.4 : (U === 1 && tier <= 2 ? 0.16 : 0.26) + Math.min(0.2, tier * 0.02);
  for (let x = len - 1; x >= 0; x--) for (let d = 0; d <= half; d++) {
    const y = half - d;
    if (!isIn(x, y) || used.has(key(x, y))) continue;
    if (outer(x, y) && r.chance(density) && !(gnat && gunCount >= 1)) {
      const wid0 = weaponFor(role === 'miner' ? null : null);
      const rotTop = x < len * 0.3 ? 5 : x > len * 0.7 ? 7 : 6;
      pair(x, d, role === 'miner' && r.chance(0.5) ? (U === 1 ? 'mining_laser' : 'big_mining_laser') : wid0, rotTop, (8 - rotTop) & 7, itemFor());
    } else if (outer(x, y)) pair(x, d, gnat ? frameId : armorId);
    else pair(x, d, gnat ? frameId : r.chance(0.15) ? sized('cargo', U) : r.chance(0.2) ? armorId : frameId);
  }
  // give it enough CPU and power to run what it carries: swap interior frames for computers / reactors
  const fix = () => {
    const tmp = makeBody('ship', g, { cls });
    const st = tmp.stats;
    const need = st.cpu > st.cpuCap ? CPU[U] : st.powerUse > st.power ? POWER[U] : null;
    if (!need) return false;
    const spot = g.blocks.find(b => b.alive && (b.def.cat === 'frame' || b.def.cat === 'cargo') && (b.def.size || 1) === U);
    if (!spot) return false;
    const { x, y } = spot; remove(g, spot); place(g, need, x, y);
    return true;
  };
  for (let k = 0; k < 40 && fix(); k++) { /* keep swapping */ }
  const body = makeBody('ship', g, { cls, faction, team: F.hostile ? 'hostile' : 'friendly', tier, role, seed });
  body.crew = body.stats.crewCap; recompute(body);
  body.name = shipName(r, F, cls);
  // enemies near home hit softly; the far rim hits harder than the raw numbers
  body.dmgMul = TIER_DMG[Math.min(10, tier)];
  if (gnat) { body.gnat = true; body.dmgMul *= 0.6; body.name = gnatName(r, F); }
  return body;
}

const PREFIX = {
  guild: ['GTS', 'Hauler', 'Merchant'], navy: ['CNS', 'Picket', 'Warden'], redfang: ['Reaver', 'Cutthroat', 'Raider'],
  vesh: ['Brood', 'Swarmling', 'Maw'], lattice: ['Node', 'Unit', 'Array'], ossari: ['Cantor', 'Prism', 'Hymn'], kharr: ['Forge', 'Anvil', 'Slag'],
};
const WORDS = ['Ashfall', 'Brine', 'Corvid', 'Dusk', 'Ferris', 'Gale', 'Harrow', 'Ivory', 'Juniper', 'Krait', 'Lumen', 'Moth', 'Nadir', 'Onyx',
  'Pike', 'Quill', 'Rook', 'Sable', 'Thistle', 'Umber', 'Vane', 'Wick', 'Xylo', 'Yarrow', 'Zephyr', 'Cinder', 'Halberd', 'Gannet'];
function gnatName(r, F) {
  return `${F.human ? 'Gnat' : 'Mite'}-${r.int(10, 999)}`;
}
function shipName(r, F, cls) {
  const id = Object.keys(FACTIONS).find(k => FACTIONS[k] === F);
  if (!F.human) return `${r.pick(PREFIX[id])}-${r.int(10, 999)}`;
  return `${r.pick(PREFIX[id])} ${r.pick(WORDS)}`;
}

/**
 * A station: a ring of capital blocks with docking arms. `kind` = 'trade' | 'pirate' | 'navy' | 'alien'.
 * Stations are big (60-120 cells across) — the "massive stations" of the brief.
 */
export function generateStation({ seed = 1, size = 80, faction = 'guild', kind = 'trade', tier = 1 } = {}) {
  const r = rng(seed); const U = 4; const n = Math.floor(size / U); const c = (n - 1) / 2;
  const g = createGrid(n * U, n * U);
  const F = FACTIONS[faction];
  const arm = sized(r.pick(F.style.armor), U);
  const ringR = c * r.range(0.6, 0.8), ringW = r.range(1.0, 1.8);
  const arms = r.int(3, 6), armW = 0.7;
  const weapons = F.style.weapons.l;
  let guns = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x - c, dy = y - c; const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const inRing = Math.abs(d - ringR) <= ringW;
    const inHub = d <= c * 0.28;
    let inArm = false;
    for (let k = 0; k < arms; k++) { const aa = (k / arms) * Math.PI * 2 + 0.3; const along = dx * Math.cos(aa) + dy * Math.sin(aa); const across = Math.abs(-dx * Math.sin(aa) + dy * Math.cos(aa)); if (along > 0 && along < c && across <= armW) inArm = true; }
    if (!(inRing || inHub || inArm)) continue;
    let id = 'frame_4';
    if (inHub && d < 1) id = 'flag_bridge';
    else if (inHub) id = r.chance(0.3) ? 'reactor_4' : r.chance(0.3) ? 'cargo_4' : 'quarters_4';
    else if (inRing && Math.abs(d - ringR) > ringW - 0.8) {
      id = (kind !== 'trade' || r.chance(0.12)) && r.chance(0.35) ? r.pick(weapons) : arm;
      // hostile bases carry a handful of big guns, not a ring of them (a danger-3 hive fired a wall of acid
      // in every direction); the cap grows with danger
      if (id !== arm && kind !== 'trade' && guns >= 3 + tier) id = arm;
      if (id !== arm) guns++;
    }
    else if (inArm && d > c - 1.5) id = 'shield_bubble_4';
    const def = BLOCKS[id];
    const rot = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) & 7;
    if (def && canPlace(g, def, x * U, y * U)) place(g, id, x * U, y * U, rot, def.weapon ? { rarity: 'rare', mods: { dmg: tier * 0.15 } } : null);
  }
  // `kind` must stay 'station' (an opts.kind here used to overwrite it with 'trade'/'hive', so trade stations and
  // hives were never treated as stations: their guns never ran and reputation rules missed them)
  const body = makeBody('station', g, { cls: 'station', faction, team: F.hostile ? 'hostile' : 'friendly', tier, stationKind: kind });
  body.va = r.range(-0.02, 0.02);
  body.crew = body.stats.crewCap; recompute(body);
  body.dmgMul = TIER_DMG[Math.min(10, tier)];
  return body;
}

/** Build one of the shipyard's premade ships (hand-drawn rows, or a fixed-seed generated design). */
import { gridFromRows } from './grid.js';
import { PREMADES } from '../data/hulls.js';
export function buildPremade(id, opts = {}) {
  const p = PREMADES.find(x => x.id === id);
  if (!p) throw new Error('no premade ' + id);
  let body;
  if (p.rows) body = makeBody('ship', gridFromRows(p.rows).grid, { cls: p.cls });
  else {
    // shipyard designs are generated like a ship of their class's tier, but every part is a plain common one
    body = generateShip({ cls: p.cls, tier: CLASSES[p.cls].tier, ...p.gen });
    for (const b of body.grid.blocks) b.item = null;
    body.dmgMul = 1; body.crew = undefined; recompute(body);
    // a ship for sale must run what it carries: trade extra guns for armour until the CPU fits,
    // and frames for reactors until the power fits
    const U = CLASSES[p.cls].maxBlock;
    for (let k = 0; k < 60; k++) {
      const st = body.stats;
      if (st.cpu > st.cpuCap) {
        const guns = body.grid.blocks.filter(b => b.alive && b.def.cat === 'weapon').sort((a, b) => (a.def.weapon && ALL_WEAPONS[a.def.weapon].mode === 'pd' ? -1 : 0) - (b.def.weapon && ALL_WEAPONS[b.def.weapon].mode === 'pd' ? -1 : 0));
        const g = guns[0]; if (!g) break;
        const { x, y } = g; const n = g.def.size || 1; remove(body.grid, g); place(body.grid, sized('steel', n), x, y);
      } else if (st.powerUse > st.power) {
        const f = body.grid.blocks.find(b => b.alive && (b.def.cat === 'frame' || b.def.cat === 'armor') && (b.def.size || 1) === U);
        if (!f) break;
        const { x, y } = f; remove(body.grid, f); place(body.grid, POWER[U], x, y);
      } else break;
      recompute(body);
    }
  }
  Object.assign(body, { team: 'player', faction: 'player', name: p.name, design: p.id, ...opts });
  body.crew = body.stats.crewCap; recompute(body);
  return body;
}
