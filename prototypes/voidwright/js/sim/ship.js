// A ship = a body (position, velocity, angle) + a block grid + the stats the grid adds up to.
// Asteroids, wrecks and stations use the same body shape with kind = 'rock' | 'wreck' | 'station'.

import { rand, setRand } from './rand.js';
import { CELL, blockAt, components, killBlock, cropToBlocks, gridFromRows } from './grid.js';
import { CLASSES } from '../data/hulls.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { armorDamage } from '../data/types.js';
import { partStat } from './partstats.js';

let nextId = 1;
export const newId = () => nextId++;
export const resetIds = (n = 1) => { nextId = n; };

/** Make a body around a grid. Local origin = the grid's centre of mass. */
export function makeBody(kind, grid, opts = {}) {
  const s = {
    id: newId(), kind, grid, x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0,
    team: 'neutral', faction: null, cls: 'skiff', name: '', ox: grid.w / 2, oy: grid.h / 2, r: 10,
    alive: true, dead: false, stats: null, turrets: [], shields: [], shieldHp: 0, bakedVersion: -1,
    lastHit: -99, emp: 0, burn: 0, burnSrc: null, cloak: 0, boost: 0, heat: 0, lockTarget: null, ai: null,
    crew: undefined, cargo: {}, ...opts,
  };
  recompute(s);
  return s;
}

/** Centre of mass, radius, and every number the blocks add up to. Call after any block change. */
export function recompute(s) {
  const g = s.grid; let m = 0, mx = 0, my = 0;
  const st = { mass: 0, thrust: 0, turn: 0, power: 0, powerUse: 0, cpu: 0, cpuCap: 0, crewNeed: 0, crewCap: 0, cargo: 0,
    repair: 0, scan: 0, jump: 0, magnet: 0, drones: 0, cloak: 0, boost: 0, blocks: 0, hp: 0, maxHp: 0, core: null, regrow: 0 };
  s.turrets = []; s.shields = []; s.engines = []; s.lights = [];
  for (const b of g.blocks) {
    const d = b.def; const n = d.size || 1;
    st.maxHp += b.maxHp;
    if (!b.alive) continue;
    st.blocks++; st.hp += b.hp;
    const cx = b.x + n / 2, cy = b.y + n / 2, bm = d.mass;
    m += bm; mx += cx * bm; my += cy * bm;
    // part bonuses rolled on the item (loot.js AFFIX/POWERS): weapons read theirs in wStat, the rest here
    const it = b.item; const mo = it?.mods || {};
    st.power += partStat(d, it, 'powerOut'); st.powerUse += partStat(d, it, 'powerUse');
    st.cpu += partStat(d, it, 'cpu'); st.cpuCap += partStat(d, it, 'cpuCap');
    st.crewNeed += d.crew || 0; st.crewCap += partStat(d, it, 'crewCap');
    st.thrust += partStat(d, it, 'thrust');
    if (!d.weapon) st.turn += partStat(d, it, 'turn');
    st.cargo += partStat(d, it, 'cargo');
    if (mo.overdrive) st.overdrive = (st.overdrive || 0) + 1;
    if (mo.motherlode) st.motherlode = true;
    st.repair += partStat(d, it, 'repair'); st.scan = Math.max(st.scan, d.scan || 0); st.scanRange = Math.max(st.scanRange || 0, partStat(d, it, 'scanRange'));
    st.jump = Math.max(st.jump, d.jump || 0); st.fab = Math.max(st.fab || 0, d.fab || 0);
    st.autoSlots = (st.autoSlots || 0) + partStat(d, it, 'autoSlots') + (d.core && !d.enemyOnly ? (d.size >= 4 ? 10 : d.size >= 2 ? 4 : 2) : 0);
    st.magnet = Math.max(st.magnet, d.magnet || 0); st.drones += partStat(d, it, 'drones'); st.cloak = Math.max(st.cloak, d.cloak || 0);
    st.boost += d.boost || 0; st.regrow += d.regrow || 0;
    if (d.core && !st.core) st.core = b;
    if (d.weapon) {
      const w = ALL_WEAPONS[d.weapon];
      // keep a turret's live state (aim angle, cooldown) across recomputes
      const old = (s.turretState && s.turretState.get(b)) || { aim: b.rot * Math.PI / 4, cd: ((b.idx * 0.618) % 1) * 0.5, kick: 0, burst: 0, beamOn: 0, target: null, charge: 0 };
      s.turrets.push({ b, w, cx, cy, n, ...old, b, w, cx, cy, n });
    }
    if (d.shield) s.shields.push({ b, cx, cy, n, ...d.shield, regen: partStat(d, it, 'regen') });
    if (d.cat === 'engine') s.engines.push({ b, cx, cy, n });
    if (d.cat === 'power' || d.cat === 'core') s.lights.push({ b, cx, cy, n });
  }
  s.turretState = new Map(s.turrets.map(t => [t.b, t]));
  // targeting slots (owner #26): sentries and point defence are always automatic; any other gun is
  // automatic only when it is set to Auto (block.auto) AND a slot is free — first come, first served.
  // A weapon nobody chose yet (old saves, premades) defaults to Auto if it was built as a turret.
  let slots = st.autoSlots || 0; st.autoUsed = 0;
  for (const t of s.turrets) {
    if (t.w.autoOnly) { t.autoOn = true; continue; }
    if (t.w.mode === 'tool') { t.autoOn = false; continue; }
    const want = t.b.auto ?? (t.w.mode === 'auto');
    t.autoOn = want && slots > 0; if (t.autoOn) { slots--; st.autoUsed++; }
    t.wantsAuto = want;
  }
  if (m > 0) { s.ox = mx / m; s.oy = my / m; }
  st.mass = Math.max(1, m);
  // radius = furthest alive cell from the centre of mass
  let r2 = 0;
  for (const b of g.blocks) if (b.alive) {
    const n = b.def.size || 1;
    for (const [cx, cy] of [[b.x, b.y], [b.x + n, b.y], [b.x, b.y + n], [b.x + n, b.y + n]]) {
      const dx = cx - s.ox, dy = cy - s.oy; r2 = Math.max(r2, dx * dx + dy * dy);
    }
  }
  s.r = Math.sqrt(r2) * CELL + 2;
  const cls = CLASSES[s.cls] || CLASSES.skiff;
  st.cpuCap += cls.baseCpu; st.crewCap = Math.round(st.crewCap + cls.baseCrew); st.cargo = Math.round(st.cargo + (cls.baseCargo || 0));
  // research bonuses (player ship only — set by research.js applyResearch; survives every recompute)
  const bo = s.bonus;
  if (bo) {
    st.cargo *= bo.cargo || 1; st.thrust *= bo.thrust || 1; st.turn *= bo.turn || 1; st.repair *= bo.repair || 1;
    st.power *= bo.power || 1; st.cpuCap += bo.cpu || 0; st.crewCap += bo.crew || 0;
  }
  st.droneCap = Math.round(st.drones * (cls.droneBonus || 1)) + (bo?.drones && st.drones > 0 ? bo.drones : 0);
  // power is shown as whole numbers, so it is judged as whole numbers too: "10 made / 10 used" is enough
  // (part bonuses leave fractions like 10.376, which used to read as "over power" while showing 10/10)
  st.power = Math.round(st.power * 100) / 100; st.powerUse = Math.round(st.powerUse * 100) / 100;
  st.powerOk = Math.round(st.power) >= Math.round(st.powerUse);
  st.powerRatio = st.powerOk ? 1 : st.powerUse > 0 ? Math.min(1, st.power / st.powerUse) : 1;
  // crew (owner #34): MIN to fly at all, NEED for full strength, ROOM (crewCap) is the most you can carry
  st.crewMin = st.crewNeed > 0 ? Math.max(1, Math.ceil(st.crewNeed * 0.4)) : 1;
  st.crewRatio = st.crewNeed > 0 ? Math.min(1, (s.crew ?? st.crewCap) / st.crewNeed) : 1;
  st.efficiency = Math.min(st.powerRatio, 0.35 + 0.65 * st.crewRatio);
  // arcade flight: top speed and acceleration from thrust per mass, turning from gyros per mass
  const tpm = st.thrust / st.mass;
  st.maxSpeed = Math.min(420, (70 + 72 * Math.sqrt(tpm)) * cls.speed);
  st.accel = 90 + 60 * tpm;
  st.turnRate = Math.min(5, 0.5 + 1.6 * Math.sqrt((st.turn + 12 * Math.sqrt(st.mass)) / st.mass)) * [1, 0.95, 0.7, 0.6, 0.45, 0.38, 0.38, 0.3, 0.2][cls.rank] ;
  // shield pools
  let shHp = 0;
  const shK = s.bonus?.shield || 1;
  for (const sh of s.shields) shHp += sh.hp * shieldBonus(sh.b) * shK;
  st.shieldMax = shHp;
  s.stats = st;
  if (s.shieldHp == null || s.shieldHp > shHp) s.shieldHp = Math.min(s.shieldHp ?? shHp, shHp);
  // per-shield pools so a deflector facing forward holds independently of one facing back
  for (const sh of s.shields) {
    const old = (s.shieldState && s.shieldState.get(sh.b));
    sh.max = sh.hp * shieldBonus(sh.b) * shK;
    sh.cur = old ? Math.min(old.cur, sh.max) : sh.max;
    sh.down = old ? old.down : 0;
  }
  s.shieldState = new Map(s.shields.map(sh => [sh.b, sh]));
  return st;
}

const shieldBonus = b => partStat(b.def, b.item, 'shield') / Math.max(1, b.def.shield?.hp || 1);

/** World position of a local cell coordinate (cx, cy in cells). */
export function toWorld(s, cx, cy) {
  const lx = (cx - s.ox) * CELL, ly = (cy - s.oy) * CELL;
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c];
}
/** Local cell coordinate of a world point. */
export function toLocal(s, wx, wy) {
  const dx = wx - s.x, dy = wy - s.y; const c = Math.cos(-s.a), sn = Math.sin(-s.a);
  return [(dx * c - dy * sn) / CELL + s.ox, (dx * sn + dy * c) / CELL + s.oy];
}
/** The alive block under a world point, or null. */
export function blockAtWorld(s, wx, wy) {
  const [cx, cy] = toLocal(s, wx, wy);
  return blockAt(s.grid, Math.floor(cx), Math.floor(cy));
}

/**
 * Walk a segment through the grid and return the first alive block it crosses (for bullets that move
 * further than a cell per step). Samples every half cell.
 */
export function rayHit(s, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0; const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / (CELL * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; const px = x0 + dx * t, py = y0 + dy * t;
    const b = blockAtWorld(s, px, py);
    if (b) return { b, x: px, y: py, t };
  }
  return null;
}

/**
 * Damage one block. Returns { dealt, killed }. Rarity armour bonuses and resistances apply.
 * The caller handles shields first (see world.js hitShip).
 */
export function damageBlock(s, b, dmg, type, size) {
  if (!b.alive) return { dealt: 0, killed: false };
  const d = armorDamage(dmg, type, size, b.def.armor);
  b.hp -= d;
  if (b.hp <= 0) { killBlock(s.grid, b); return { dealt: d, killed: true }; }
  return { dealt: d, killed: false };
}

/**
 * After blocks die: split off pieces that lost their path to the core. Returns the broken-off groups as
 * new 'wreck' bodies (tumbling debris) and whether the ship itself is now dead.
 */
export function splitOff(s) {
  const st = s.stats; const core = st.core && st.core.alive ? st.core : s.grid.blocks.find(b => b.alive && b.def.core) || null;
  const groups = components(s.grid, core);
  const out = [];
  if (!groups.length) return { pieces: out, dead: true };
  const mainHasCore = core && groups[0].includes(core);
  const keep = mainHasCore ? groups[0] : (s.kind === 'ship' ? [] : groups.sort((a, b) => b.length - a.length)[0]);
  for (const grp of groups) {
    if (grp === keep) continue;
    // copy the piece BEFORE killing its blocks here — killBlock zeroes hp, and the debris would get 0 hp blocks
    const { grid, ox, oy } = cropToBlocks(grp);
    for (const b of grp) killBlock(s.grid, b);
    const w = makeBody('wreck', grid, { team: 'neutral', cls: 'skiff', name: 'Debris' });
    // place the piece where it was, moving with the parent plus a push away from the centre
    const n = grid; void n;
    const [wx, wy] = toWorld(s, ox + w.ox, oy + w.oy);
    w.x = wx; w.y = wy; w.a = s.a;
    const ax = wx - s.x, ay = wy - s.y; const al = Math.hypot(ax, ay) || 1;
    w.vx = s.vx + (ax / al) * (30 + rand() * 50) - s.va * ay * 0.5;
    w.vy = s.vy + (ay / al) * (30 + rand() * 50) + s.va * ax * 0.5;
    w.va = s.va + (rand() - 0.5) * 2.4;
    w.life = 40 + rand() * 30; w.fromFaction = s.faction; w.fromTier = s.tier || 1;
    out.push(w);
  }
  recompute(s);
  // a ship is lost when its core goes, or when it is shot down to a wreck (critical damage)
  const crit = s.kind === 'ship' && s.stats.hp < s.stats.maxHp * (s.team === 'player' ? 0.12 : 0.25);
  // a ship shot down to one lonely block is finished too (play-test #24: "weird just one block is still able to fly around")
  const dead = s.kind === 'ship' ? !mainHasCore || s.stats.blocks <= 1 || crit : s.stats.blocks === 0;
  return { pieces: out, dead };
}

/** Build a ship body from a premade layout. */
export function shipFromRows(rows, opts = {}) {
  const { grid } = gridFromRows(rows);
  return makeBody('ship', grid, opts);
}
