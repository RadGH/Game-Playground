// The world simulation: one star system's worth of bodies, shots, beams, loot and drones.
// Pure: no drawing, no sound, no DOM, no clock. step(w, dt, input) moves it forward; everything the
// screen or speakers should react to is pushed to w.events.

import { rand, setRand } from './rand.js';
import { CELL, blockAt, killBlock, reviveBlock, neighbours, createGrid, place } from './grid.js';
import { recompute, toWorld, toLocal, blockAtWorld, rayHit, damageBlock, splitOff, makeBody, newId } from './ship.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { FACTIONS } from '../data/factions.js';
import { DRONES } from '../data/drones.js';
import { RARITY_BY_ID, MATERIALS, matTier, matOf } from '../data/types.js';
import { weaponStat } from './partstats.js';
import { rng, clamp, angDiff, turnToward, TAU } from '../core/math.js';
import { rollLoot } from './loot.js';
import { researchLootBonus } from './research.js';
import { makeDroneItem } from './state.js';
import { think } from './ai.js';

const HASH = 400;
const SPLASH_CAP = 1.5;
export const GRACE_SECONDS = 6;
const SHIELD_MULT = { kinetic: 1, laser: 1.15, plasma: 0.85, explosive: 0.9, lightning: 1.6 };

export function createWorld({ seed = 1, game = null } = {}) {
  return {
    seed, t: 0, r: rng(seed), bodies: [], shots: [], beams: [], pickups: [], drones: [], planets: [], tethers: [],
    events: [], player: null, game, hash: new Map(), size: 16000, sun: null, combatT: -99, notes: [],
  };
}

export const emit = (w, e) => { if (w.events.length < 4000) w.events.push(e); };

// ------------------------------------------------------------------ relations
export function hostile(w, a, b) {
  if (!a || !b || a === b) return false;
  const ta = a.team, tb = b.team;
  if (ta === 'neutral' || tb === 'neutral') return false;
  // a player just out of a station (or just arrived) is left alone for a few seconds: nobody may shoot
  // them, but they may shoot back (which ends the grace — see hitBlock)
  const P = w.player;
  if (P && P.grace > w.t && b === P && ta !== 'player') return false;
  const rep = w.game?.rep || {};
  // stations never turn on you over reputation (a bad standing used to make every Guild station open fire
  // the moment you undocked); only a ship can hold a grudge
  const angryAtPlayer = s => s.kind !== 'station' && (s.angry || (s.faction && FACTIONS[s.faction] && !FACTIONS[s.faction].hostile && (rep[s.faction] ?? 0) <= -60));
  if (ta === 'player') return tb === 'hostile' || (tb === 'friendly' && angryAtPlayer(b));
  if (tb === 'player') return ta === 'hostile' || (ta === 'friendly' && angryAtPlayer(a));
  if (ta === 'hostile' && tb === 'friendly') return true;
  if (tb === 'hostile' && ta === 'friendly') return true;
  if (ta === 'hostile' && tb === 'hostile') return a.faction !== b.faction && (FACTIONS[a.faction]?.rivals || []).includes(b.faction);
  return false;
}

// ------------------------------------------------------------------ spatial hash
function rebuildHash(w) {
  w.hash.clear();
  for (const s of w.bodies) {
    if (s.dead) continue;
    const x0 = Math.floor((s.x - s.r) / HASH), x1 = Math.floor((s.x + s.r) / HASH);
    const y0 = Math.floor((s.y - s.r) / HASH), y1 = Math.floor((s.y + s.r) / HASH);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const k = x * 73856093 ^ y * 19349663;
      let l = w.hash.get(k); if (!l) w.hash.set(k, l = []); l.push(s);
    }
  }
}
export function near(w, x, y, rad) {
  const out = new Set();
  const x0 = Math.floor((x - rad) / HASH), x1 = Math.floor((x + rad) / HASH);
  const y0 = Math.floor((y - rad) / HASH), y1 = Math.floor((y + rad) / HASH);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const l = w.hash.get(gx * 73856093 ^ gy * 19349663); if (l) for (const s of l) out.add(s);
  }
  return out;
}

// ------------------------------------------------------------------ flight (arcade, PLAN §0 #7 + #10)
export function fly(s, inp, dt) {
  const st = s.stats; if (!st || s.static) return;
  const empSlow = s.emp > 0 ? 0.3 : 1;
  let mx = inp.mx || 0, my = inp.my || 0; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const boosting = inp.boost && (s.boostFuel ?? 1) > 0.05;
  const od = st.overdrive || 0; // "of Overdrive" engines: boost goes faster and lasts longer
  // 2026-11-12 (report #36, "boosters don't do much"): +10% on the boost, and boosting no longer switches cruise off —
  // out of combat it used to drop you from cruise (x2.4) to boost (x1.55), so pressing boost made you SLOWER.
  const boostMul = boosting ? (1.55 + st.boost * 0.3 + od * 0.25) * 1.1 : 1;
  if (boosting) s.boostFuel = Math.max(0, (s.boostFuel ?? 1) - dt * 0.35 / (1 + od * 0.5)); else s.boostFuel = Math.min(1, (s.boostFuel ?? 1) + dt * 0.18);
  s.boosting = boosting;
  // cruise: out of combat the engines open up so the (big) systems can be crossed (main.js sets inp.cruise)
  const cruise = inp.cruise ? 2.4 : 1;
  const vmax = st.maxSpeed * st.efficiency ** 0.5 * empSlow * boostMul * cruise * (s.slow > 0 ? 0.5 : 1);
  const dvx = mx * vmax - s.vx, dvy = my * vmax - s.vy; const dl = Math.hypot(dvx, dvy);
  const acc = st.accel * empSlow * (boosting ? (cruise > 1 ? 2.4 : 1.6) : cruise > 1 ? 1.8 : 1) * dt;
  if (dl > 0) { const k = Math.min(1, acc / dl); s.vx += dvx * k; s.vy += dvy * k; }
  s.thrusting = ml > 0.1;
  // nose follows travel; a stopped ship keeps its heading
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > 12 && ml > 0.05) { const want = Math.atan2(my, mx); s.va = clamp(angDiff(s.a, want) * 6, -st.turnRate, st.turnRate); }
  else if (inp.face != null) { s.va = clamp(angDiff(s.a, inp.face) * 5, -st.turnRate, st.turnRate); }
  else s.va *= Math.pow(0.02, dt);
}

// ------------------------------------------------------------------ the step
export function step(w, dt, input) {
  setRand(w.r);
  w.t += dt; w.beams.length = 0;
  rebuildHash(w);
  const P = w.player;
  // controls
  for (const s of w.bodies) {
    if (s.dead || s.kind !== 'ship') continue;
    if (s === P && P && !P.dead) {
      fly(s, input, dt);
      s.input = input;
    } else {
      s.input = think(w, s, dt);
      fly(s, s.input, dt);
    }
  }
  // move bodies
  for (const s of w.bodies) {
    if (s.dead || s.static) continue;
    s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
    if (s.kind === 'wreck' || s.kind === 'rock') {
      const drag = s.kind === 'wreck' ? 0.985 : 0.995;
      s.vx *= Math.pow(drag, dt * 60); s.vy *= Math.pow(drag, dt * 60); s.va *= Math.pow(0.995, dt * 60);
      if (s.kind === 'wreck') { s.life -= dt; if (s.life <= 0 && !s.harpooned) { s.dead = true; emit(w, { t: 'fizzle', x: s.x, y: s.y, r: s.r }); } }
    }
    // soft edge of the system: drift back in
    const d = Math.hypot(s.x, s.y);
    if (d > w.size) { const k = (d - w.size) * 0.5 * dt; s.vx -= (s.x / d) * k * 60; s.vy -= (s.y / d) * k * 60; }
  }
  collide(w, dt);
  tethers(w, dt);
  // turrets + timers
  for (const s of w.bodies) {
    if (s.dead) continue;
    if (s.kind === 'ship' || s.kind === 'station' || s.kind === 'ground') { turrets(w, s, dt); upkeep(w, s, dt); }
  }
  drones(w, dt);
  shots(w, dt);
  pickups(w, dt);
  // break off pieces / kill ships whose blocks died this step
  for (const s of w.bodies.slice()) {
    if (s.dead || !s.dirty) continue;
    s.dirty = false;
    const { pieces, dead } = splitOff(s);
    for (const p of pieces) { if (s.kind === 'rock') { p.kind = 'rock'; p.ore = s.ore; delete p.life; } if (s.sector) p.sector = s.sector; w.bodies.push(p); }
    if (pieces.length) emit(w, { t: 'break', x: s.x, y: s.y, n: pieces.length });
    if (dead) destroy(w, s);
  }
  // clean up
  if ((w.cleanT = (w.cleanT || 0) + dt) > 1) {
    w.cleanT = 0; w.clangT?.clear();
    w.bodies = w.bodies.filter(s => !s.dead);
    w.drones = w.drones.filter(d => !d.dead);
  }
}

// ------------------------------------------------------------------ collisions (cell-accurate, impulse push)
function collide(w, dt) {
  const seen = new Set();
  for (const a of w.bodies) {
    if (a.dead) continue;
    for (const b of near(w, a.x, a.y, a.r)) {
      if (b === a || b.dead || (a.static && b.static)) continue;
      const key = a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id;
      if (seen.has(key)) continue; seen.add(key);
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy);
      if (d > a.r + b.r || d === 0) continue;
      // sample the smaller body's blocks against the bigger one's grid
      const [sm, bg] = a.stats.blocks <= b.stats.blocks ? [a, b] : [b, a];
      let hit = null;
      for (const bl of sm.grid.blocks) {
        if (!bl.alive) continue; const n = bl.def.size || 1;
        const [px, py] = toWorld(sm, bl.x + n / 2, bl.y + n / 2);
        if ((px - bg.x) ** 2 + (py - bg.y) ** 2 > (bg.r + n * CELL) ** 2) continue;
        const o = blockAtWorld(bg, px, py) || (n > 1 ? blockAtWorld(bg, px + CELL * 0.5, py) : null);
        if (o) { hit = { x: px, y: py, mine: bl, other: o }; break; }
      }
      if (!hit) continue;
      const nx = dx / d, ny = dy / d;
      const ima = a.static ? 0 : 1 / a.stats.mass, imb = b.static ? 0 : 1 / b.stats.mass;
      if (ima + imb === 0) continue;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      // push apart
      const push = 60 * dt * 60;
      a.x -= nx * push * dt * ima / (ima + imb) * 2; a.y -= ny * push * dt * ima / (ima + imb) * 2;
      b.x += nx * push * dt * imb / (ima + imb) * 2; b.y += ny * push * dt * imb / (ima + imb) * 2;
      // two ships on the same side only nudge each other: no damage, no grudge, no combat
      const actorA = a.kind === 'ship' || a.kind === 'station' || a.kind === 'ground', actorB = b.kind === 'ship' || b.kind === 'station' || b.kind === 'ground';
      const foes = actorA && actorB && hostile(w, a, b);
      const friends = actorA && actorB && !foes;
      if (rv < 0) {
        const j = -(1.3) * rv / (ima + imb);
        a.vx -= nx * j * ima; a.vy -= ny * j * ima; b.vx += nx * j * imb; b.vy += ny * j * imb;
        const speed = -rv;
        w.clangT ||= new Map();
        if (speed > 70 && !friends && (w.clangT.get(key) || -9) < w.t - 0.5) {
          w.clangT.set(key, w.t);
          // ramming: the lighter body takes more
          const mA = a.static ? 1e6 : a.stats.mass, mB = b.static ? 1e6 : b.stats.mass;
          const e = Math.min(600, speed * speed * 0.0009);
          hitBlock(w, a, hit.mine.alive && sm === a ? hit.mine : hit.other.alive && bg === a ? hit.other : null, e * Math.min(4, mB / mA), 'kinetic', 'l', foes ? b : null);
          hitBlock(w, b, hit.mine.alive && sm === b ? hit.mine : hit.other.alive && bg === b ? hit.other : null, e * Math.min(4, mA / mB), 'kinetic', 'l', foes ? a : null);
          emit(w, { t: 'clang', x: hit.x, y: hit.y, v: speed });
        }
      }
    }
  }
}

// ------------------------------------------------------------------ damage
/** Shield check for a point on a body. Returns the shield object that covers it, or null. */
export function shieldAt(s, x, y) {
  if (!s.shields?.length) return null;
  const dx = x - s.x, dy = y - s.y; const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  for (const sh of s.shields) {
    if (sh.cur <= 0 || !sh.b.alive) continue;
    const R = s.r + sh.pad * CELL;
    if (d > R + 4) continue;
    if (sh.kind === 'arc') {
      const face = s.a + sh.b.rot * Math.PI / 4;
      if (Math.abs(angDiff(face, ang)) > (sh.arc * Math.PI / 360)) continue;
    }
    return sh;
  }
  return null;
}
export function shieldRadius(s, sh) { return s.r + sh.pad * CELL; }

function absorb(w, s, sh, dmg, type, x, y, mult = 1, src = null) {
  if (s.grace > w.t && s === w.player) return;
  const take = dmg * (SHIELD_MULT[type] || 1) * mult;
  sh.cur -= take; s.lastHit = w.t;
  if (src) noteCombat(w, src, s);
  emit(w, { t: 'shieldhit', x, y, sx: s.x, sy: s.y, id: s.id, r: shieldRadius(s, sh), color: FACTIONS[s.faction]?.style.light || '#6fd0ff', amt: take, down: sh.cur <= 0 });
  if (sh.cur <= 0) { sh.cur = 0; emit(w, { t: 'shielddown', x: s.x, y: s.y, r: shieldRadius(s, sh) }); }
}

/** A hostile exchange involving the player: starts (or extends) combat, and ends any undock grace. */
function noteCombat(w, src, s) {
  if (!hostile(w, src, s)) return;
  const P = w.player;
  if (src === P || s === P || src.owner === P) {
    w.combatT = w.t;
    if (src === P && P.grace > w.t) P.grace = 0;   // you opened fire: the grace is over
  }
}

/** Damage a specific block (already past shields). */
export function hitBlock(w, s, b, dmg, type, size, src, opts = {}) {
  if (!b || !b.alive || s.dead) return 0;
  if (s.invuln) return 0;
  if (s === w.player && s.grace > w.t) return 0;
  const before = b.hp;
  const { dealt, killed } = damageBlock(s, b, dmg, type, size);
  s.lastHit = w.t;
  if (src && (s.kind === 'ship' || s.kind === 'station' || s.kind === 'ground')) {
    // only a ship, station or ground base is an attacker; a rock or wreck you rammed is not something to fight
    const actor = src.kind === 'ship' || src.kind === 'station' || src.kind === 'ground';
    if (actor) s.lastAttacker = src;
    // only a real fight counts: friendly fire cannot happen any more (shots pass through friends), and a
    // bump or a stray block is not combat — so nothing but enemies can lock you out of building
    if (actor && hostile(w, src, s)) {
      if (s.ai) s.ai.target = s.ai.target || src;
      noteCombat(w, src, s);
    }
  }
  if (src?.leech && src.stats) src.leechBank = (src.leechBank || 0) + dealt * 0.08;
  if (killed) {
    const n = b.def.size || 1; const [x, y] = toWorld(s, b.x + n / 2, b.y + n / 2);
    emit(w, { t: 'blockdie', x, y, size: n, color: b.def.color || FACTIONS[s.faction]?.style.hull || '#888', kind: s.kind, ore: b.def.ore, vx: s.vx, vy: s.vy });
    if (b.def.ore || (s.kind === 'rock' && w.r() < (opts.mining ? 0.35 : 0.15)) || (s.kind === 'wreck' && w.r() < 0.25)) dropOre(w, s, b, x, y, opts.mining);
    // play-test #34: a small, forgiving chance to lose a crew member when a part with people in it is destroyed
    if (s === w.player && (b.def.crew || b.def.crewCap) && s.crew > 1 && w.r() < 0.25) { s.crew--; w.notes.push({ t: 'crewlost', n: 1 }); }
    if (b.def.explode && !b.item?.mods?.sun) splash(w, x, y, b.def.explode * 0.6 + 20 * n, b.def.explode, 'explosive', 'l', null, { noTeam: true });
    s.dirty = true;
    if (b.def.core && s.kind === 'ship') s.coreLost = true;
  } else if (dealt > 0 && w.r() < 0.4) {
    const n = b.def.size || 1; const [x, y] = toWorld(s, b.x + n / 2, b.y + n / 2);
    emit(w, { t: 'spark', x, y, type, amt: dealt });
  }
  void before;
  return dealt;
}

function dropOre(w, s, b, x, y, mining) {
  let mat = b.def.ore;
  const t = matTier(s.fromTier || s.tier || w.tier || 1);
  // plain rock cells give Rock (the filler for frames and cargo bays) — unless you switched it off in the hold
  if (!mat) {
    if (s.kind === 'wreck') mat = w.r() < 0.65 ? matOf('structural', t) : matOf('energy', t);
    else { if (w.game?.settings?.noRock) return; mat = 'rock'; }
  }
  const n = Math.max(1, Math.round((b.def.ore ? 2 + w.r() * 3 : 1) * (mining ? 1 : 0.6) * (mining && b.def.ore && mining.motherlode ? 2 : 1)));
  spawnPickup(w, { kind: 'mat', mat, n, ore: s.kind === 'rock' }, x, y, s.vx, s.vy, 30);
}

/** A projectile / beam / arc reaches a body at (x,y). Handles shields, then the grid. */
export function hitBody(w, s, x, y, dmg, type, size, src, opts = {}) {
  const sh = opts.ignoreShield ? null : shieldAt(s, x, y);
  if (sh) { absorb(w, s, sh, dmg, type, x, y, opts.shieldMult || 1, src); return 'shield'; }
  let b = blockAtWorld(s, x, y);
  if (!b) {
    // nearest block within a cell
    for (const [ox, oy] of [[CELL * 0.6, 0], [-CELL * 0.6, 0], [0, CELL * 0.6], [0, -CELL * 0.6]]) { b = blockAtWorld(s, x + ox, y + oy); if (b) break; }
  }
  if (!b) return null;
  hitBlock(w, s, b, dmg, type, size, src, opts);
  if (opts.burn) { s.burn = Math.max(s.burn, 3); s.burnDps = Math.max(s.burnDps || 0, opts.burn); s.burnSrc = src; }
  if (opts.emp) s.emp = Math.max(s.emp, opts.emp);
  return 'block';
}

/** Area damage. Shields block it for the covered side; blocks in the radius take falloff damage. */
export function splash(w, x, y, R, dmg, type, size, src, opts = {}) {
  emit(w, { t: 'boom', x, y, r: R, type, big: R > 80 });
  for (const s of near(w, x, y, R)) {
    if (s.dead) continue;
    if (!opts.noTeam && src && !hostile(w, src, s) && s.kind !== 'rock' && s.kind !== 'wreck') continue;
    const d = Math.hypot(s.x - x, s.y - y); if (d > R + s.r) continue;
    const sh = shieldAt(s, x, y) || (d > s.r ? shieldAt(s, s.x + (x - s.x) * (s.r / d), s.y + (y - s.y) * (s.r / d)) : null);
    if (sh && d > s.r * 0.6) { absorb(w, s, sh, dmg, type, x, y, 1, src); continue; }
    // blocks within R, using the local grid window
    const [lx, ly] = toLocal(s, x, y); const rc = R / CELL;
    const x0 = Math.max(0, Math.floor(lx - rc)), x1 = Math.min(s.grid.w - 1, Math.ceil(lx + rc));
    const y0 = Math.max(0, Math.floor(ly - rc)), y1 = Math.min(s.grid.h - 1, Math.ceil(ly + rc));
    const done = new Set(); const hits = []; let tot = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const b = blockAt(s.grid, cx, cy); if (!b || !b.alive || done.has(b)) continue;
      const dd = Math.hypot(cx + 0.5 - lx, cy + 0.5 - ly) / rc; if (dd > 1) continue;
      done.add(b);
      const k = dmg * (1 - dd * 0.7) * 0.5; hits.push([b, k]); tot += k;   // each block in the blast takes up to half
    }
    // ...but a blast never deals more than SPLASH_CAP x its damage to YOUR ship in total. Without this a
    // missile hitting a tightly packed little ship hurt fifty blocks at once and one volley erased it.
    // Enemies take the full blast again (2026-11-11, owner: enemies were too strong with the cap on them).
    const m = s === w.player && tot > dmg * SPLASH_CAP ? dmg * SPLASH_CAP / tot : 1;
    for (const [b, k] of hits) hitBlock(w, s, b, k * m, type, size, src);
  }
  // flak / blasts also kill drones and missiles
  for (const dr of w.drones) if (!dr.dead && (!src || hostile(w, src, dr.owner)) && Math.hypot(dr.x - x, dr.y - y) < R) damageDrone(w, dr, dmg * 0.8);
  if (opts.interceptor || type === 'explosive') for (const p of w.shots) if (p.hp && !p.dead && src && p.team !== src.team && Math.hypot(p.x - x, p.y - y) < R) killShot(w, p);
}

// ------------------------------------------------------------------ turrets
const wStat = (t, key, s) => {
  const w = t.w, it = t.b.item;
  if (key === 'dmg') return weaponStat(w, it, 'dmg') * (s?.dmgMul ?? 1);
  if (key === 'rate' || key === 'range' || key === 'turn') return weaponStat(w, it, key);
  return w[key];
};

/** Who should this turret shoot? */
function pickTarget(w, s, t, range, pos, arcC, arcH, pd) {
  let best = null, bd = 1e18;
  if (pd) {
    for (const p of w.shots) {
      if (!p.hp || p.dead || p.team === s.team || (s.team === 'player' && p.team !== 'hostile' && !p.angry)) continue;
      const d = (p.x - pos[0]) ** 2 + (p.y - pos[1]) ** 2; if (d > range * range || d >= bd) continue;
      if (Math.abs(angDiff(arcC, Math.atan2(p.y - pos[1], p.x - pos[0]))) > arcH) continue;
      best = { shot: p }; bd = d;
    }
    for (const dr of w.drones) {
      if (dr.dead || !hostile(w, s, dr.owner)) continue;
      const d = (dr.x - pos[0]) ** 2 + (dr.y - pos[1]) ** 2; if (d > range * range || d >= bd) continue;
      if (Math.abs(angDiff(arcC, Math.atan2(dr.y - pos[1], dr.x - pos[0]))) > arcH) continue;
      best = { drone: dr }; bd = d;
    }
    if (best) return best;
  }
  for (const o of near(w, pos[0], pos[1], range)) {
    if (o.dead || o.invuln || o.dockable || !hostile(w, s, o) || o.cloak > 0) continue;
    const d = Math.max(0, Math.hypot(o.x - pos[0], o.y - pos[1]) - o.r * 0.7); if (d > range) continue;
    const ang = Math.atan2(o.y - pos[1], o.x - pos[0]);
    if (Math.abs(angDiff(arcC, ang)) > arcH + Math.atan2(o.r, d + 1)) continue;
    const score = d - (o === s.ai?.target || o === s.input?.lock ? 200 : 0) - (o.kind === 'ship' ? 80 : 0);
    if (score < bd) { bd = score; best = { body: o }; }
  }
  if (!pd) for (const dr of w.drones) {
    if (dr.dead || !hostile(w, s, dr.owner)) continue;
    const d = Math.hypot(dr.x - pos[0], dr.y - pos[1]); if (d > range || d + 60 > bd) continue;
    if (Math.abs(angDiff(arcC, Math.atan2(dr.y - pos[1], dr.x - pos[0]))) > arcH) continue;
    best = { drone: dr }; bd = d + 60;
  }
  return best;
}

function targetPos(tg) {
  if (!tg) return null;
  if (tg.body) return [tg.body.x, tg.body.y, tg.body.vx, tg.body.vy, tg.body];
  if (tg.drone) return [tg.drone.x, tg.drone.y, tg.drone.vx, tg.drone.vy, null];
  if (tg.shot) return [tg.shot.x, tg.shot.y, tg.shot.vx, tg.shot.vy, null];
  return null;
}

function turrets(w, s, dt) {
  if (!s.turrets.length) return;
  const inp = s.input || {};
  const eff = s.stats.efficiency * (s.emp > 0 ? 0 : 1);
  for (const t of s.turrets) {
    if (!t.b.alive) continue;
    const W = t.w; const pos = toWorld(s, t.cx, t.cy);
    t.kick = Math.max(0, t.kick - dt * 3);
    t.cd -= dt * Math.max(0.15, eff) * (s.fireMul ?? 1);
    if (W.mode === 'tool' && W.tool === 'harpoon') { t.aim = turnToward(t.aim, clampArc(t, localAim(s, pos, inp.ax, inp.ay)), wStat(t, 'turn') * dt); continue; }
    const arcC = s.a + t.b.rot * Math.PI / 4, arcH = W.arc >= 360 ? Math.PI * 1.01 : W.arc * Math.PI / 360;
    const range = wStat(t, 'range');
    let wantWorld = null, fire = false, tgt = null;
    const isPlayer = s.team === 'player' && s === w.player;
    const mode = W.mode;
    // the player chooses (owner #26): every gun fires by hand at your aim unless it holds a targeting slot
    // (t.autoOn, ship.js) or is an always-automatic sentry / point-defence weapon
    const autoAim = isPlayer ? (t.autoOn && mode !== 'tool') : (mode === 'auto' || mode === 'pd' || mode === 'manual' || mode === 'beam' || mode === 'lock' || mode === 'tool');
    if (autoAim) {
      // automatic aim: hostile turrets use the AI's chosen target when it is in reach
      t.retarget = (t.retarget || 0) - dt;
      if (t.retarget <= 0 || !t.target || (t.target.body && t.target.body.dead) || (t.target.drone && t.target.drone.dead) || (t.target.shot && t.target.shot.dead)) {
        t.target = W.tool === 'mine' ? mineTarget(w, s, pos, range, arcC, arcH) : pickTarget(w, s, t, range, pos, arcC, arcH, mode === 'pd');
        t.retarget = 0.25 + rand() * 0.2;
      }
      const tp = targetPos(t.target);
      if (tp) {
        const d = Math.hypot(tp[0] - pos[0], tp[1] - pos[1]); const sp = W.speed || 1e9;
        const lead = d / sp; const lx = tp[0] + (tp[2] - s.vx) * lead, ly = tp[1] + (tp[3] - s.vy) * lead;
        wantWorld = Math.atan2(ly - pos[1], lx - pos[0]); tgt = t.target;
        fire = mode === 'lock' ? (isPlayer || inp.missile !== false) && d < range : d < range + (tp[4]?.r || 0) * 0.7;
        if (!isPlayer && mode !== 'auto' && mode !== 'pd') fire = fire && (inp.fire || inp.missile);
        if (isPlayer && W.tool === 'mine') fire = false;
      }
    } else if (mode === 'manual' || mode === 'beam' || mode === 'tool' || mode === 'auto' || mode === 'pd') {
      wantWorld = Math.atan2(inp.ay - pos[1], inp.ax - pos[0]);
      fire = !!inp.fire;
    } else if (mode === 'fixed') {
      wantWorld = arcC; fire = !!inp.fire;
      if (!isPlayer) fire = inp.fire && inp.noseOn;
    } else if (mode === 'lock') {
      wantWorld = inp.lock ? Math.atan2(inp.lock.y - pos[1], inp.lock.x - pos[0]) : arcC;
      fire = !!inp.missile && !!inp.lock; tgt = inp.lock ? { body: inp.lock } : null;
    }
    if (mode === 'fixed' && W.rear) wantWorld = arcC;
    // during the undock grace your automatic guns hold fire (so the grace is not thrown away by a turret);
    // firing a weapon yourself ends it
    if (isPlayer && s.grace > w.t && autoAim) fire = false;
    if (wantWorld != null) {
      const local = clampArc(t, wantWorld - s.a);
      t.aim = turnToward(t.aim, local, wStat(t, 'turn') * dt);
    }
    const worldAim = s.a + t.aim;
    const onTarget = wantWorld == null || Math.abs(angDiff(worldAim, wantWorld)) < (mode === 'lock' ? 3 : 0.12);
    // beams and tools are continuous
    if (W.proj === 'beam') {
      const want = fire && onTarget && eff > 0;
      t.beamOn = want ? Math.min(1, t.beamOn + dt * 6) : Math.max(0, t.beamOn - dt * 5);
      if (t.beamOn > 0.05) beam(w, s, t, pos, worldAim, range, dt, tgt);
      continue;
    }
    if (t.burst > 0) { t.burstT -= dt; if (t.burstT <= 0) { t.burst--; t.burstT = W.burst; shoot(w, s, t, pos, worldAim, tgt); } continue; }
    if (fire && onTarget && t.cd <= 0 && eff > 0) {
      const rate = wStat(t, 'rate') || 1;
      t.cd = 1 / rate;
      if (W.burst && W.count > 1) { t.burst = W.count - 1; t.burstT = W.burst; shoot(w, s, t, pos, worldAim, tgt, 1); }
      else shoot(w, s, t, pos, worldAim, tgt);
      if (s.team === 'player' && tgt?.body && hostile(w, s, tgt.body)) noteCombat(w, s, tgt.body);
      s.lastFire = w.t;
    }
  }
}

function localAim(s, pos, ax, ay) { return Math.atan2((ay ?? pos[1]) - pos[1], (ax ?? pos[0] + 1) - pos[0]) - s.a; }
function clampArc(t, local) {
  if (t.w.arc >= 360) return t.aim + angDiff(t.aim, local);
  const c = t.b.rot * Math.PI / 4, h = t.w.arc * Math.PI / 360;
  const d = angDiff(c, local);
  return c + clamp(d, -h, h);
}
function mineTarget(w, s, pos, range, arcC, arcH) {
  let best = null, bd = 1e18;
  for (const o of near(w, pos[0], pos[1], range)) {
    if (o.dead || (o.kind !== 'rock' && o.kind !== 'wreck')) continue;
    const d = Math.hypot(o.x - pos[0], o.y - pos[1]) - o.r; if (d > range || d > bd) continue;
    if (Math.abs(angDiff(arcC, Math.atan2(o.y - pos[1], o.x - pos[0]))) > arcH) continue;
    bd = d; best = { body: o };
  }
  return best;
}

/** One shot (or one volley of `count`). */
function shoot(w, s, t, pos, ang, tgt, volley) {
  const W = t.w; const it = t.b.item; const mods = it?.mods || {};
  // how grand the shot LOOKS (report #40): weapon tier above 1 plus the part's rarity step; rc = the rarity colour
  const RR = RARITY_BY_ID[it?.rarity]; const vis = Math.max(0, (W.tier || 1) - 1) + (RR?.index || 0); const rc = RR && RR.index >= 3 ? RR.color : null;
  const dmg = wStat(t, 'dmg', s); const range = wStat(t, 'range');
  const n = (volley ? 1 : W.count || 1) + (mods.twin ? 1 : 0);
  const muzzle = (t.n * CELL) * 0.55;
  const mx = pos[0] + Math.cos(ang) * muzzle, my = pos[1] + Math.sin(ang) * muzzle;
  t.kick = Math.min(1, t.kick + (W.recoil || 0.2) * 2);
  emit(w, { t: 'fire', w: W.id, x: mx, y: my, a: ang, color: W.color, team: s.team, owner: s.id, n: t.n, vis, rc });
  if (s.kind === 'ship' && W.recoil > 0.5) { s.vx -= Math.cos(ang) * W.recoil * 8 / Math.sqrt(s.stats.mass); s.vy -= Math.sin(ang) * W.recoil * 8 / Math.sqrt(s.stats.mass); }
  const opt = { burn: W.burn || (mods.burn ? 4 : 0), emp: W.emp, shieldMult: W.shieldMult || 1 };
  if (W.proj === 'arc') { arcStrike(w, s, mx, my, ang, range, dmg, W, tgt, mods); return; }
  if (W.proj === 'rail' || W.proj === 'lance') { railStrike(w, s, mx, my, ang, range, dmg, W, mods); return; }
  for (let i = 0; i < n; i++) {
    const a = ang + (rand() - 0.5) * W.spread * (n > 1 && !W.burst ? 1.6 : 1) * 2;
    const sp = (W.speed || 800) * (0.94 + rand() * 0.12);
    const p = {
      id: newId(), x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * sp + s.vx * 0.6, vy: Math.sin(a) * sp + s.vy * 0.6, a,
      w: W, dmg, team: s.team, owner: s, life: range / sp * (W.proj === 'mine' ? 40 : 1.15), age: 0,
      pierce: (W.pierce || 0) + (mods.pierce ? 2 : 0), splash: (W.splash || 0) * (mods.splash ? 1.6 : 1), opt, color: W.color, kind: W.proj,
      target: tgt?.body || (tgt?.drone ? null : null), homing: W.homing || 0, hp: (W.proj === 'missile' || W.proj === 'torpedo' || W.proj === 'rocket') ? (W.proj === 'torpedo' ? 60 : 4) : 0,
      leech: !!mods.leech, size: W.size, vis, rc,
    };
    if (W.proj === 'mine') { p.vx = s.vx * 0.2 - Math.cos(s.a) * 40; p.vy = s.vy * 0.2 - Math.sin(s.a) * 40; p.armed = 0.8; }
    if (W.proj === 'missile' || W.proj === 'torpedo') p.launch = 0.25;
    w.shots.push(p);
  }
}

function arcStrike(w, s, x, y, ang, range, dmg, W, tgt, mods = {}) {
  const pts = [[x, y]]; const hitSet = new Set();
  let cur = tgt?.body || tgt?.drone || null;
  if (!cur) {
    // no target: discharge into empty space
    pts.push([x + Math.cos(ang) * range * 0.6, y + Math.sin(ang) * range * 0.6]);
    emit(w, { t: 'arc', pts, color: W.color }); return;
  }
  const chain = (W.chain || 0) + (mods.chain ? 1 : 0);
  let px = x, py = y, d = dmg;
  for (let i = 0; i <= chain && cur; i++) {
    hitSet.add(cur);
    const tx = cur.x + (rand() - 0.5) * (cur.r || 6), ty = cur.y + (rand() - 0.5) * (cur.r || 6);
    pts.push([tx, ty]);
    if (cur.owner) damageDrone(w, cur, d); // a drone
    else hitBody(w, cur, tx, ty, d, W.type, W.size, s, { shieldMult: W.shieldMult || 1 });
    px = tx; py = ty; d *= 0.8;
    // next: nearest hostile within chainRange
    let nx = null, nd = (W.chainRange || 150) ** 2;
    for (const o of near(w, px, py, W.chainRange || 150)) if (!o.dead && !hitSet.has(o) && hostile(w, s, o)) { const dd = (o.x - px) ** 2 + (o.y - py) ** 2; if (dd < nd) { nd = dd; nx = o; } }
    for (const dr of w.drones) if (!dr.dead && !hitSet.has(dr) && hostile(w, s, dr.owner)) { const dd = (dr.x - px) ** 2 + (dr.y - py) ** 2; if (dd < nd) { nd = dd; nx = dr; } }
    cur = nx;
  }
  emit(w, { t: 'arc', pts, color: W.color, big: W.size === 'l' });
}

function railStrike(w, s, x, y, ang, range, dmg, W, mods) {
  const ex = x + Math.cos(ang) * range, ey = y + Math.sin(ang) * range;
  let pierce = (W.pierce || 1) + (mods.pierce ? 2 : 0); let endT = 1;
  // bodies along the line, nearest first
  const cand = [];
  const mxp = (x + ex) / 2, myp = (y + ey) / 2;
  for (const o of near(w, mxp, myp, range / 2 + 50)) {
    if (o.dead || o === s || (!hostile(w, s, o) && o.kind !== 'rock' && o.kind !== 'wreck')) continue;
    const t = ((o.x - x) * (ex - x) + (o.y - y) * (ey - y)) / (range * range); if (t < 0 || t > 1) continue;
    const px = x + (ex - x) * t, py = y + (ey - y) * t; if (Math.hypot(o.x - px, o.y - py) > o.r + 30) continue;
    cand.push([t, o]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, o] of cand) {
    if (pierce <= 0) break;
    const sh = (() => { const R = o.r + 30; for (let k = 0; k < 40; k++) { const tt = k / 40; const px = x + (ex - x) * tt, py = y + (ey - y) * tt; if (Math.hypot(px - o.x, py - o.y) < R) { const s2 = shieldAt(o, px, py); if (s2) return [s2, px, py, tt]; } } return null; })();
    if (sh && W.proj !== 'lance') { absorb(w, o, sh[0], dmg, W.type, sh[1], sh[2], 1, s); endT = sh[3]; pierce = 0; break; }
    // walk the line through the grid, hitting each block once
    const seen = new Set();
    const steps = Math.ceil(range / (CELL * 0.5));
    for (let k = 0; k <= steps && pierce > 0; k++) {
      const tt = k / steps; const px = x + (ex - x) * tt, py = y + (ey - y) * tt;
      if (Math.hypot(px - o.x, py - o.y) > o.r + 2) continue;
      const b = blockAtWorld(o, px, py); if (!b || seen.has(b)) continue;
      seen.add(b); hitBlock(w, o, b, dmg, W.type, W.size, s); pierce--; endT = tt;
    }
  }
  if (pierce > 0) endT = 1;
  emit(w, { t: 'rail', x, y, x2: x + (ex - x) * endT, y2: y + (ey - y) * endT, color: W.color, big: W.proj === 'lance' });
}

/** Continuous beams (focus beam, plasma lance, mining laser, tractor). Damage is per second. */
function beam(w, s, t, pos, ang, range, dt, tgt) {
  const W = t.w; const [x, y] = pos;
  const ex = x + Math.cos(ang) * range, ey = y + Math.sin(ang) * range;
  let hitT = 1, hitBodyRef = null, hitShield = false;
  // nearest body along the ray (shield or block)
  for (const o of near(w, (x + ex) / 2, (y + ey) / 2, range / 2 + 40)) {
    if (o.dead || o === s) continue;
    const friendlyFire = !hostile(w, s, o) && o.kind !== 'rock' && o.kind !== 'wreck';
    if (friendlyFire) continue; // beams pass through friends (no friendly fire for anyone)
    const tc = ((o.x - x) * (ex - x) + (o.y - y) * (ey - y)) / (range * range);
    if (tc < -0.1 || tc > 1.1) continue;
    const cx = x + (ex - x) * tc, cy = y + (ey - y) * tc;
    if (Math.hypot(o.x - cx, o.y - cy) > o.r + 40) continue;
    // shield first
    if (W.tool !== 'tractor') for (let k = 0; k < 50; k++) {
      const tt = k / 50; if (tt >= hitT) break;
      const px = x + (ex - x) * tt, py = y + (ey - y) * tt;
      if (shieldAt(o, px, py)) { hitT = tt; hitBodyRef = o; hitShield = true; break; }
    }
    const hit = rayHit(o, x, y, x + (ex - x) * hitT, y + (ey - y) * hitT);
    if (hit && hit.t * hitT < hitT) { hitT = hit.t * hitT; hitBodyRef = o; hitShield = false; }
  }
  const hx = x + (ex - x) * hitT, hy = y + (ey - y) * hitT;
  const it = t.b.item;
  const dps = weaponStat(W, it, 'dmg') * t.beamOn * s.stats.efficiency * (s.dmgMul ?? 1) * (s.fireMul ?? 1);
  const BR = RARITY_BY_ID[it?.rarity]; const vis = Math.max(0, (W.tier || 1) - 1) + (BR?.index || 0);   // looks (report #40)
  w.beams.push({ x, y, x2: hx, y2: hy, color: W.color, width: (W.size === 'l' ? 7 : W.size === 'm' ? 4 : 2.5) * t.beamOn * (t.n > 1 ? 1.6 : 1), hit: !!hitBodyRef, tool: W.tool || null, shield: hitShield, owner: s.id, vis, rc: BR && BR.index >= 3 ? BR.color : null, tid: t.b.idx ?? 0 });
  if (hitBodyRef) {
    t.beamHeat = (t.beamHeat || 0) + dt;
    const isRock = hitBodyRef.kind === 'rock' || hitBodyRef.kind === 'wreck';
    let d = dps * dt * (W.tool === 'mine' ? (isRock ? W.mineMult || 4 : 0.35) : 1);
    if (W.race === 'ossari' || W.id === 'refractor') d *= 1 + Math.min(1.5, t.beamHeat * 0.4);
    if (W.tool === 'tractor') { tractorPull(w, s, hitBodyRef, dt); return; }
    if (hitShield) { const sh = shieldAt(hitBodyRef, hx, hy); if (sh) absorb(w, hitBodyRef, sh, d, W.type, hx, hy, 1, s); }
    else {
      const b = blockAtWorld(hitBodyRef, hx + Math.cos(ang) * 2, hy + Math.sin(ang) * 2) || blockAtWorld(hitBodyRef, hx, hy);
      if (b) hitBlock(w, hitBodyRef, b, d, W.type, 'm', s, { mining: W.tool === 'mine' ? (it?.mods?.motherlode ? { motherlode: true } : true) : false });
      if (W.burn) { hitBodyRef.burn = Math.max(hitBodyRef.burn, 1); hitBodyRef.burnDps = Math.max(hitBodyRef.burnDps || 0, W.burn); }
      if (W.emp) hitBodyRef.emp = Math.max(hitBodyRef.emp, W.emp * dt * 2);
    }
  } else {
    t.beamHeat = 0;
    if (W.tool === 'mine') minePlanet(w, s, hx, hy, dps * dt);
  }
}

function tractorPull(w, s, o, dt) {
  if (o.static) return;
  const dx = s.x - o.x, dy = s.y - o.y; const d = Math.hypot(dx, dy) || 1;
  const f = 260 / Math.sqrt(o.stats.mass);
  o.vx += dx / d * f * dt; o.vy += dy / d * f * dt;
}

/** Mining beam on a planet surface below you (PLAN §0 #2): ore pops out of the ground. */
function minePlanet(w, s, x, y, amt) {
  const pl = w.planets.find(p => Math.hypot(p.x - x, p.y - y) < p.r);
  if (!pl) return;
  pl.mineBank = (pl.mineBank || 0) + amt;
  emit(w, { t: 'scorch', x, y, planet: pl.id });
  if (pl.mineBank > 60) {
    pl.mineBank = 0;
    const mat = w.r.pick(pl.ores);
    spawnPickup(w, { kind: 'mat', mat, n: 1 + Math.floor(w.r() * 3), ore: true }, x, y, 0, 0, 60);
  }
}

// ------------------------------------------------------------------ shots
function killShot(w, p) {
  if (p.dead) return;
  p.dead = true;
  if (p.splash) splash(w, p.x, p.y, p.splash * 0.7, p.dmg * 0.25, 'explosive', 's', p.owner, { noTeam: false });
  else emit(w, { t: 'pop', x: p.x, y: p.y, color: p.color });
}

function shots(w, dt) {
  for (const p of w.shots) {
    if (p.dead) continue;
    p.age += dt; p.life -= dt;
    p.px = p.x; p.py = p.y;
    if (p.kind === 'missile' || p.kind === 'torpedo') {
      if (p.launch > 0) { p.launch -= dt; p.vx *= 0.96; p.vy *= 0.96; }
      else {
        if (p.target && p.target.dead) p.target = null;
        if (!p.target) { // reacquire
          let best = null, bd = 900 * 900;
          for (const o of near(w, p.x, p.y, 900)) if (!o.dead && !o.invuln && !o.dockable && hostile(w, p.owner, o) && o.kind !== 'rock' && o.cloak <= 0) { const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d < bd) { bd = d; best = o; } }
          p.target = best;
        }
        const sp = p.w.speed * (p.kind === 'torpedo' ? 1 : 1.0);
        let a = Math.atan2(p.vy, p.vx);
        if (p.target) a = turnToward(a, Math.atan2(p.target.y - p.y, p.target.x - p.x), p.homing * dt);
        const cur = Math.hypot(p.vx, p.vy); const ns = Math.min(sp, cur + sp * 2 * dt);
        p.vx = Math.cos(a) * ns; p.vy = Math.sin(a) * ns; p.a = a;
      }
    } else if (p.kind === 'mine') {
      p.vx *= 0.97; p.vy *= 0.97; p.armed -= dt;
      if (p.armed <= 0) for (const o of near(w, p.x, p.y, 50)) if (!o.dead && hostile(w, p.owner, o) && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 40) { p.life = 0; break; }
    } else if (p.kind === 'flak') {
      // air-burst near anything hostile
      if (p.age > 0.08) for (const o of near(w, p.x, p.y, 60)) if (!o.dead && hostile(w, p.owner, o) && Math.hypot(o.x - p.x, o.y - p.y) < o.r + 26) { p.life = 0; break; }
      if (p.life > 0) for (const q of w.shots) if (q.hp && !q.dead && q.team !== p.team && Math.abs(q.x - p.x) < 30 && Math.abs(q.y - p.y) < 30) { p.life = 0; break; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'harpoon') { if (p.life <= 0) p.dead = true; continue; }   // tethers() latches it
    if (p.life <= 0) {
      if (p.splash) { p.dead = true; splash(w, p.x, p.y, p.splash, p.dmg, p.w.type, p.w.size, p.owner, { interceptor: p.kind === 'flak' }); }
      else p.dead = true;
      continue;
    }
    // interceptors hit hostile missiles
    if (p.w.mode === 'pd' || p.interceptor) {
      for (const q of w.shots) if (q.hp && !q.dead && q.team !== p.team && Math.abs(q.x - p.x) < 14 && Math.abs(q.y - p.y) < 14) { q.hp -= p.dmg; p.dead = true; emit(w, { t: 'pop', x: p.x, y: p.y, color: p.color }); if (q.hp <= 0) killShot(w, q); break; }
      if (p.dead) continue;
    }
    // drones
    for (const dr of w.drones) {
      if (dr.dead || !hostile(w, p.owner, dr.owner)) continue;
      if (Math.abs(dr.x - p.x) < 12 && Math.abs(dr.y - p.y) < 12) { damageDrone(w, dr, p.dmg); if (p.splash) splash(w, p.x, p.y, p.splash, p.dmg, p.w.type, p.w.size, p.owner); else emit(w, { t: 'pop', x: p.x, y: p.y, color: p.color }); p.dead = true; break; }
    }
    if (p.dead) continue;
    // bodies
    for (const o of near(w, p.x, p.y, 40)) {
      if (o.dead || o === p.owner || p.hitIds?.has(o.id)) continue;
      // not an enemy: only the PLAYER's stray shots can hit (and anger) a friendly; NPC shots never hit the player
      // not an enemy: shots pass straight through (no friendly fire — a stray round used to anger allies,
      // lock you out of building and, after a few, turn a whole faction's stations against you)
      if (!hostile(w, p.owner, o) && o.kind !== 'rock' && o.kind !== 'wreck') continue;
      if (p.kind === 'mine' && p.armed > 0) continue;
      const d2 = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      const shR = o.shields?.length ? o.r + 3 * CELL : o.r;
      if (d2 > (shR + 10) ** 2) continue;
      // shield bubble check at the current point
      const sh = shieldAt(o, p.x, p.y);
      if (sh && Math.hypot(p.px - o.x, p.py - o.y) > Math.hypot(p.x - o.x, p.y - o.y) - 1) {
        absorb(w, o, sh, p.dmg, p.w.type, p.x, p.y, p.opt.shieldMult, p.owner);
        p.dead = true;
        if (p.splash) emit(w, { t: 'boom', x: p.x, y: p.y, r: p.splash * 0.6, type: p.w.type });
        break;
      }
      const hit = rayHit(o, p.px, p.py, p.x, p.y);
      if (!hit) continue;
      if (p.splash) { p.dead = true; splash(w, hit.x, hit.y, p.splash, p.dmg, p.w.type, p.w.size, p.owner); hitBlock(w, o, hit.b, p.dmg * 0.6, p.w.type, p.w.size, p.owner); break; }
      hitBlock(w, o, hit.b, p.dmg, p.w.type, p.w.size, p.owner);
      if (p.opt.burn) { o.burn = Math.max(o.burn, 3); o.burnDps = Math.max(o.burnDps || 0, p.opt.burn); }
      if (p.opt.emp) o.emp = Math.max(o.emp, p.opt.emp);
      if (p.leech && p.owner.stats) p.owner.leechBank = (p.owner.leechBank || 0) + p.dmg * 0.1;
      emit(w, { t: 'hit', x: hit.x, y: hit.y, type: p.w.type, color: p.color, size: p.w.size, kind: p.kind });
      if (p.pierce > 0) { p.pierce--; (p.hitIds ||= new Set()).add(o.id); p.dmg *= 0.75; continue; }
      p.dead = true; break;
    }
  }
  if (w.shots.length > 1500) w.shots.splice(0, w.shots.length - 1500);
  w.shots = w.shots.filter(p => !p.dead);
}

// ------------------------------------------------------------------ upkeep: shields, burn, emp, repair, cloak
function upkeep(w, s, dt) {
  const st = s.stats;
  s.emp = Math.max(0, s.emp - dt); s.cloak = Math.max(0, s.cloak - dt); s.slow = Math.max(0, (s.slow || 0) - dt);
  for (const sh of s.shields) {
    if (!sh.b.alive) { sh.cur = 0; continue; }
    if (w.t - s.lastHit > sh.delay && !w.storm && !s.ionized) sh.cur = Math.min(sh.max, sh.cur + sh.regen * dt * st.efficiency);   // s.ionized: inside an ion cloud (encounters.js)
  }
  if (s.burn > 0) {
    s.burn -= dt; s.burnTick = (s.burnTick || 0) - dt;
    if (s.burnTick <= 0) {
      s.burnTick = 0.33;
      const alive = s.grid.blocks.filter(b => b.alive); if (alive.length) {
        const b = alive[Math.floor(w.r() * alive.length)];
        hitBlock(w, s, b, (s.burnDps || 4) * 0.33, 'plasma', 's', s.burnSrc);
        const n = b.def.size || 1; const [x, y] = toWorld(s, b.x + n / 2, b.y + n / 2); emit(w, { t: 'burn', x, y });
      }
    }
  }
  // alien hulls regrow
  if (st.regrow > 0) for (const b of s.grid.blocks) if (b.alive && b.def.regrow && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.def.regrow * b.maxHp * 0.01 * dt);
  if (s.leechBank > 1) { healSome(w, s, s.leechBank); s.leechBank = 0; }
  // out-of-combat repair (PLAN: broken blocks repaired out of combat)
  if (s.kind === 'ship' && st.repair > 0 && w.t - s.lastHit > 6 && w.t - (s.lastFire || -99) > 3) repair(w, s, st.repair * dt * 8);
  // Repair rigs (repair_bay blocks, not the bridge's own crew) also patch allied ships within 600 out of combat:
  // your mercenary wingmen, or you from a wingman's rig (play-test #29). Free — the rig's owner pays no ore.
  if (s.kind === 'ship' && s.team === 'player' && w.t - s.lastHit > 6 && w.t - (w.combatT ?? -99) > 6) {
    if ((s.rigT = (s.rigT || 0) - dt) <= 0) {
      s.rigT = 1; s.rig = 0;
      for (const b of s.grid.blocks) if (b.alive && b.def.repair && !b.def.core) s.rig += b.def.repair;
      if (s.rig > 0) for (const o of near(w, s.x, s.y, 600 + s.r)) {
        if (o === s || o.dead || o.kind !== 'ship' || o.team !== s.team || o.stats.hp >= o.stats.maxHp) continue;
        repair(w, o, s.rig * 8, true);
      }
    }
  }
}

function healSome(w, s, amt) {
  for (const b of s.grid.blocks) { if (amt <= 0) break; if (b.alive && b.hp < b.maxHp) { const d = Math.min(amt, b.maxHp - b.hp); b.hp += d; amt -= d; } }
}

/** Repair: top up damaged blocks, then rebuild missing ones next to living ones. Costs ferrite for rebuilds. */
const STRUCTURAL = Object.keys(MATERIALS).filter(m => MATERIALS[m].role === 'structural');
export function repair(w, s, amt, free = false) {
  let used = 0;
  for (const b of s.grid.blocks) {
    if (amt <= 0) break;
    if (b.alive && b.hp < b.maxHp) { const d = Math.min(amt, b.maxHp - b.hp); b.hp += d; amt -= d; used += d; }
  }
  if (amt <= 0) return used;
  const cargo = s === w.player ? w.game?.cargo : null;
  const dead = s.grid.blocks.filter(b => !b.alive);
  if (!dead.length) s.repairStarved = false;
  for (const b of dead) {
    if (amt <= 0) break;
    const near = neighbours(s.grid, b); if (!near.size) continue;
    const cost = Math.max(1, Math.round(b.maxHp / 60));
    // rebuilding a block takes structural ore — any tier, cheapest first
    const ore = cargo ? STRUCTURAL.find(m => (cargo[m] || 0) >= cost) : null;
    if (!free && cargo && !ore) { s.repairStarved = true; break; }
    s.repairStarved = false; // the warning goes away once ore is back in the hold
    if (reviveBlock(s.grid, b, Math.min(b.maxHp, amt))) {
      if (!free && cargo) cargo[ore] -= cost;
      amt -= b.maxHp * 0.5; used += b.maxHp;
      const n = b.def.size || 1; const [x, y] = toWorld(s, b.x + n / 2, b.y + n / 2);
      emit(w, { t: 'rebuilt', x, y });
      recompute(s);
    }
  }
  return used;
}

// ------------------------------------------------------------------ destruction
export function destroy(w, s) {
  if (s.dead) return;
  s.dead = true;
  const big = s.r;
  if (s.kind === 'rock') { emit(w, { t: 'dust', x: s.x, y: s.y, r: big }); return; }
  if (s.kind === 'wreck') { emit(w, { t: 'boom', x: s.x, y: s.y, r: big * 0.8, type: 'explosive' }); return; }
  const color = FACTIONS[s.faction]?.style.light || '#ffaa55';
  emit(w, { t: 'death', x: s.x, y: s.y, r: big, vx: s.vx, vy: s.vy, color, cls: s.cls, id: s.id, player: s === w.player });
  // the remains break into tumbling chunks
  const alive = s.grid.blocks.filter(b => b.alive);
  const chunks = [];
  const left = new Set(alive);
  while (left.size) {
    const seed = left.values().next().value; const grp = [seed]; left.delete(seed);
    const want = 2 + Math.floor(w.r() * 8);
    for (let i = 0; i < grp.length && grp.length < want; i++) for (const o of neighbours(s.grid, grp[i])) if (left.has(o) && grp.length < want) { left.delete(o); grp.push(o); }
    chunks.push(grp);
  }
  for (const grp of chunks) {
    for (const b of grp) killBlock(s.grid, b);
    const g = createGrid(1, 1); void g;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of grp) { const n = b.def.size || 1; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + n); y1 = Math.max(y1, b.y + n); }
    const ng = createGrid(x1 - x0, y1 - y0);
    for (const b of grp) { const nb = place(ng, b.id, b.x - x0, b.y - y0, b.rot); if (nb) nb.hp = Math.max(1, b.maxHp * 0.3); }
    const piece = makeBody('wreck', ng, { team: 'neutral', name: 'Wreckage', fromFaction: s.faction, fromTier: s.tier });
    const [wx, wy] = toWorld(s, x0 + piece.ox, y0 + piece.oy);
    const ax = wx - s.x, ay = wy - s.y; const al = Math.hypot(ax, ay) || 1;
    const kick = 40 + w.r() * 110 + big * 0.2;
    piece.x = wx; piece.y = wy; piece.a = s.a;
    piece.vx = s.vx + ax / al * kick; piece.vy = s.vy + ay / al * kick; piece.va = (w.r() - 0.5) * 3;
    piece.life = 25 + w.r() * 25; piece.burnFx = 2 + w.r() * 3;
    w.bodies.push(piece);
  }
  if (s === w.player || s.wing) return;   // a mercenary wingman's ship drops no loot (it is yours)
  // loot fountain
  const r = rng((s.id * 7919) ^ Math.floor(w.t * 1000));
  for (const l of rollLoot(r, s, (w.game ? researchLootBonus(w.game) : 0) + (w.system?.traits?.luck || 0) + (w.eventLuck || 0))) {   // eventLuck: galaxy events / treasure systems (events.js via encounters.js)
    const a = r() * TAU, sp = 60 + r() * 160;
    spawnPickup(w, l, s.x + Math.cos(a) * s.r * 0.3, s.y + Math.sin(a) * s.r * 0.3, s.vx * 0.5 + Math.cos(a) * sp, s.vy * 0.5 + Math.sin(a) * sp, 0);
  }
  if (s.lastAttacker?.team === 'player' || s.lastAttacker?.owner === w.player) {
    w.notes.push({ t: 'kill', faction: s.faction, cls: s.cls, tier: s.tier, boss: !!s.boss, name: s.name, id: s.id, kind: s.kind, bounty: s.bounty || 0 });
    if (s.faction && w.game) {
      const F = FACTIONS[s.faction];
      repChange(w, s.faction, F?.hostile ? 1 : -15, null);
      for (const riv of F?.rivals || []) repChange(w, riv, 2, null);
    }
  }
}

export function repChange(w, faction, d, why) {
  if (!w.game || !faction || !FACTIONS[faction]) return;
  const rep = w.game.rep || (w.game.rep = {});
  rep[faction] = clamp((rep[faction] ?? (FACTIONS[faction].hostile ? -50 : 10)) + d, -100, 100);
  if (why) w.notes.push({ t: 'rep', faction, d, why });
}

// ------------------------------------------------------------------ pickups (loot, ore, pods)
export function spawnPickup(w, l, x, y, vx = 0, vy = 0, jitter = 40) {
  const a = w.r() * TAU, j = w.r() * jitter;
  w.pickups.push({ id: newId(), ...l, x, y, vx: vx + Math.cos(a) * j, vy: vy + Math.sin(a) * j, age: 0, spin: w.r() * TAU });
  if (l.kind === 'item' || l.kind === 'drone') emit(w, { t: 'drop', x, y, rarity: l.rarity });
}

function pickups(w, dt) {
  const P = w.player; const G = w.game;
  const magnet = P && !P.dead ? 120 + (P.stats.magnet || 0) + P.r : 0;
  for (const p of w.pickups) {
    if (p.dead) continue;
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.4, dt); p.vy *= Math.pow(0.4, dt);
    if (p.age > (p.kind === 'item' || p.kind === 'cache' ? 240 : 120)) { p.dead = true; continue; }
    if (!P || P.dead || p.age < 0.6) continue;
    const dx = P.x - p.x, dy = P.y - p.y; const d = Math.hypot(dx, dy);
    if (d < magnet) {
      if (p.kind === 'mat' && G && cargoFull(w, p.n)) { if (!p.fullWarn) { p.fullWarn = true; if (!(w.t < (w.fullWarnT ?? -1))) { w.fullWarnT = w.t + 20; w.notes.push({ t: 'full' }); } } continue; }
      const pull = 500 * (1 - d / magnet) + 120;
      p.vx += dx / d * pull * dt * 4; p.vy += dy / d * pull * dt * 4;
    }
    if (d < P.r * 0.8 + 10) collect(w, p);
  }
  w.pickups = w.pickups.filter(p => !p.dead);
}

export function cargoUsed(G) { let n = 0; for (const v of Object.values(G.cargo || {})) n += v; for (const v of Object.values(G.goods || {})) n += v; return n; }
export function cargoFull(w, add = 1) { const G = w.game; return G && w.player && cargoUsed(G) + add > w.player.stats.cargo; }

function collect(w, p) {
  const G = w.game; if (!G) { p.dead = true; return; }
  p.dead = true;
  if (p.kind === 'cr') G.credits += p.n;
  else if (p.kind === 'mat') { const room = Math.max(0, Math.floor(w.player.stats.cargo - cargoUsed(G))); const n = Math.min(room, p.n); G.cargo[p.mat] = (G.cargo[p.mat] || 0) + n; if (n < p.n) {
      // part of the pile fits: count (and announce) what came aboard; the rest stays floating
      p.dead = false; p.n -= n;
      if (n > 0) { emit(w, { t: 'collect', x: p.x, y: p.y, kind: p.kind, mat: p.mat, n }); w.notes.push({ t: 'collect', kind: p.kind, mat: p.mat, n, ore: !!p.ore }); }
      return;
    } }
  else if (p.kind === 'item') { G.parts.push(p.item); if (p.item.unique && !(G.uniques ||= []).includes(p.item.unique)) G.uniques.push(p.item.unique); }
  else if (p.kind === 'cache') (G.caches ||= []).push({ tier: p.tier || 1 });
  else if (p.kind === 'drone') { const d = makeDroneItem(p.drone, p.rarity); (G.droneItems ||= []).push(d); p.item = d; }
  else if (p.kind === 'pod') {
    // crew are just a number (owner #33): they fill empty room; with no room the pod is towed to safety
    const room = Math.max(0, w.player.stats.crewCap - w.player.crew); const n = Math.min(room, p.n);
    w.player.crew += n; if (n) recompute(w.player);
    w.notes.push({ t: 'crew', n, full: p.n - n }); p.got = n;
  }
  else if (p.kind === 'data') G.dataCores = (G.dataCores || 0) + p.n;
  else if (p.kind === 'specimen') { (G.specimens ||= []).push({ name: p.name, faction: p.faction, value: p.value }); }
  emit(w, { t: 'collect', x: p.x, y: p.y, kind: p.kind, mat: p.mat, n: p.n, rarity: p.rarity, item: p.item });
  w.notes.push({ t: 'collect', kind: p.kind, mat: p.mat, n: p.n, ore: !!p.ore, item: p.item, rarity: p.rarity, name: p.name });
}

// ------------------------------------------------------------------ harpoon tethers
export function fireHarpoon(w, s) {
  if (s.tether) { s.tether.dead = true; if (s.tether.b) s.tether.b.harpooned = false; s.tether = null; emit(w, { t: 'unhook', x: s.x, y: s.y }); return 'released'; }
  const t = s.turrets.find(t => t.b.alive && t.w.tool === 'harpoon');
  if (!t) return 'none';
  if ((t.cd || 0) > 0) return 'cooldown';
  t.cd = 0.6;
  const pos = toWorld(s, t.cx, t.cy); const a = s.a + t.aim;
  w.shots.push({ id: newId(), x: pos[0], y: pos[1], px: pos[0], py: pos[1], vx: Math.cos(a) * t.w.speed + s.vx, vy: Math.sin(a) * t.w.speed + s.vy, a, w: t.w, dmg: t.w.dmg, team: s.team, owner: s, life: t.w.range / t.w.speed, age: 0, pierce: 0, splash: 0, opt: {}, color: t.w.color, kind: 'harpoon', harpoon: t, hp: 0 });
  emit(w, { t: 'fire', w: 'harpoon', x: pos[0], y: pos[1], a, color: t.w.color, team: s.team, owner: s.id, n: 1 });
  return 'fired';
}

function tethers(w, dt) {
  // harpoon heads that reach something latch on
  for (const p of w.shots) {
    if (p.kind !== 'harpoon' || p.dead) continue;
    const s = p.owner;
    for (const o of near(w, p.x, p.y, 30)) {
      if (o === s || o.dead || o.kind === 'station' || o.static) continue;
      const hit = rayHit(o, p.px, p.py, p.x, p.y); if (!hit) continue;
      const [lx, ly] = toLocal(o, hit.x, hit.y);
      const ht = p.harpoon; const [sx, sy] = toWorld(s, ht.cx, ht.cy);
      const len = Math.max(60, Math.hypot(hit.x - sx, hit.y - sy));
      s.tether = { a: s, b: o, alx: ht.cx, aly: ht.cy, blx: lx, bly: ly, len, dead: false, pull: ht.w.pull || 1 };
      o.harpooned = true;
      w.tethers.push(s.tether);
      hitBlock(w, o, hit.b, p.dmg, 'kinetic', 'm', s);
      emit(w, { t: 'hook', x: hit.x, y: hit.y });
      p.dead = true; break;
    }
  }
  for (const T of w.tethers) {
    if (T.dead) continue;
    if (T.a.dead || T.b.dead) { T.dead = true; if (T.a.tether === T) T.a.tether = null; T.b.harpooned = false; continue; }
    const [ax, ay] = toWorld(T.a, T.alx, T.aly), [bx, by] = toWorld(T.b, T.blx, T.bly);
    const dx = bx - ax, dy = by - ay; const d = Math.hypot(dx, dy) || 1;
    // reel in slowly when the owner is holding "reel"
    if (T.a.input?.reel) T.len = Math.max(40, T.len - 140 * dt);
    if (d > T.len * 3) { T.dead = true; T.a.tether = null; T.b.harpooned = false; emit(w, { t: 'snap', x: (ax + bx) / 2, y: (ay + by) / 2 }); continue; }
    if (d > T.len) {
      const nx = dx / d, ny = dy / d; const stretch = d - T.len;
      const ima = 1 / T.a.stats.mass, imb = T.b.static ? 0 : 1 / T.b.stats.mass;
      const rv = (T.b.vx - T.a.vx) * nx + (T.b.vy - T.a.vy) * ny;
      const k = stretch * 12 * T.pull + Math.max(0, rv) * 4;
      const J = k * dt / (ima + imb);
      T.a.vx += nx * J * ima; T.a.vy += ny * J * ima;
      T.b.vx -= nx * J * imb; T.b.vy -= ny * J * imb;
      // a little spin from pulling off-centre
      if (!T.b.static) T.b.va += ((bx - T.b.x) * -ny - (by - T.b.y) * -nx) * J * imb * 0.0004;
    }
    T.ax = ax; T.ay = ay; T.bx = bx; T.by = by; T.d = d;
    // the quest counts metres dragged (10 world units = 1 m)
    if (T.a === w.player && w.game && !T.b.static) { const sp = Math.hypot(T.b.vx, T.b.vy); if (sp > 20) w.game.stats.dragged += sp * dt / 10; }
  }
  w.tethers = w.tethers.filter(t => !t.dead);
}

// ------------------------------------------------------------------ drones
/** Launch a drone. `item` (a drone item from the save: { uid, kind, rarity }) lifts its health and damage by rarity. */
export function launchDrone(w, owner, kind, slot, item = null) {
  const D = DRONES[kind]; if (!D) return null;
  const mul = 1 + (item?.rarity ? RARITY_BY_ID[item.rarity]?.bonus || 0 : 0);
  const dr = { id: newId(), kind, def: D, owner, x: owner.x, y: owner.y, vx: owner.vx, vy: owner.vy, a: owner.a, hp: D.hp * mul, maxHp: D.hp * mul, cd: rand(), slot, shield: (D.shield || 0) * mul, team: owner.team, r: 8, mul, uid: item?.uid ?? null, rarity: item?.rarity || null };
  w.drones.push(dr);
  emit(w, { t: 'launch', x: owner.x, y: owner.y, color: D.color });
  return dr;
}
export function damageDrone(w, dr, d) {
  if (dr.dead) return;
  if (dr.shield > 0) { dr.shield -= d; emit(w, { t: 'pop', x: dr.x, y: dr.y, color: '#9fd8ff' }); return; }
  dr.hp -= d;
  if (dr.hp <= 0) { dr.dead = true; emit(w, { t: 'boom', x: dr.x, y: dr.y, r: 24, type: 'explosive' }); }
}

function drones(w, dt) {
  const bySlot = new Map();
  for (const dr of w.drones) { if (dr.dead) continue; if (!bySlot.has(dr.owner)) bySlot.set(dr.owner, []); bySlot.get(dr.owner).push(dr); }
  for (const [owner, list] of bySlot) {
    if (owner.dead) { for (const d of list) { d.dead = true; emit(w, { t: 'boom', x: d.x, y: d.y, r: 18, type: 'explosive' }); } continue; }
    // formation: a fan AHEAD of the owner (toward where they aim, else where they travel)
    const inp = owner.input || {};
    const fa = inp.ax != null ? Math.atan2(inp.ay - owner.y, inp.ax - owner.x) : owner.a;
    const n = list.length;
    for (let i = 0; i < list.length; i++) {
      const dr = list[i];
      const D = dr.def;
      const spread = (i - (n - 1) / 2) * 0.32;
      const dist = owner.r + 70 + (i % 2) * 26;
      let gx = owner.x + Math.cos(fa + spread) * dist, gy = owner.y + Math.sin(fa + spread) * dist;
      // engage: target near the formation point
      dr.retarget = (dr.retarget || 0) - dt;
      if (dr.retarget <= 0) {
        dr.retarget = 0.4;
        dr.target = null;
        const range = (D.weapon?.range || 200) + 160;
        if (D.mines) { let bd = 1e18; for (const o of near(w, gx, gy, 360)) if (!o.dead && o.kind === 'rock') { const d = Math.hypot(o.x - gx, o.y - gy); if (d < bd) { bd = d; dr.target = o; } } }
        else if (!D.repairs) { let bd = range; for (const o of near(w, gx, gy, range)) if (!o.dead && hostile(w, owner, o) && o.cloak <= 0) { const d = Math.hypot(o.x - gx, o.y - gy) - o.r; if (d < bd) { bd = d; dr.target = o; } } }
      }
      const T = dr.target && !dr.target.dead ? dr.target : null;
      if (T && !D.interceptor && !D.shield) {
        // hover near the target, staying on the owner's side
        const ang = Math.atan2(owner.y - T.y, owner.x - T.x) + spread * 2;
        const keep = T.r + (D.weapon?.range || 150) * 0.6;
        gx = T.x + Math.cos(ang) * keep; gy = T.y + Math.sin(ang) * keep;
        if (Math.hypot(gx - owner.x, gy - owner.y) > 900) { gx = owner.x + Math.cos(fa) * 300; gy = owner.y + Math.sin(fa) * 300; }
      }
      const dx = gx - dr.x, dy = gy - dr.y; const d = Math.hypot(dx, dy);
      const want = Math.min(D.speed, d * 3);
      const tvx = d > 1 ? dx / d * want + owner.vx * 0.3 : owner.vx, tvy = d > 1 ? dy / d * want + owner.vy * 0.3 : owner.vy;
      dr.vx += (tvx - dr.vx) * Math.min(1, dt * 4); dr.vy += (tvy - dr.vy) * Math.min(1, dt * 4);
      dr.x += dr.vx * dt; dr.y += dr.vy * dt;
      const face = T ? Math.atan2(T.y - dr.y, T.x - dr.x) : Math.atan2(dr.vy, dr.vx);
      dr.a = turnToward(dr.a, face, 8 * dt);
      // act
      dr.cd -= dt;
      if (D.repairs && owner.stats) {
        // menders patch you first, then the most damaged friendly ship near you (mercenary wingmen)
        if (w.t - (dr.healT || 0) > 0.5) {
          dr.healT = w.t; let tg = owner;
          if (owner.stats.hp >= owner.stats.maxHp * 0.98) { let worst = 0.98; for (const o of near(w, owner.x, owner.y, 900)) if (!o.dead && o.kind === 'ship' && o !== owner && o.team === owner.team && o.stats.hp / o.stats.maxHp < worst) { worst = o.stats.hp / o.stats.maxHp; tg = o; } }
          repair(w, tg, D.repairs * (dr.mul || 1) * 0.5 * (w.t - tg.lastHit > 4 ? 3 : 1), true); dr.beam = tg;
        }
        continue;
      }
      if (D.interceptor) {
        let best = null, bd = (D.weapon.range) ** 2;
        for (const q of w.shots) if (q.hp && !q.dead && q.team !== dr.team) { const dd = (q.x - dr.x) ** 2 + (q.y - dr.y) ** 2; if (dd < bd) { bd = dd; best = q; } }
        if (best && dr.cd <= 0) { dr.cd = 1 / D.weapon.rate; best.hp -= D.weapon.dmg * (dr.mul || 1); emit(w, { t: 'zap', x: dr.x, y: dr.y, x2: best.x, y2: best.y, color: D.color }); if (best.hp <= 0) killShot(w, best); continue; }
      }
      if (!T || !D.weapon) continue;
      const Wp = D.weapon; const dd = Math.hypot(T.x - dr.x, T.y - dr.y) - T.r;
      if (dd > Wp.range) continue;
      if (D.mines || Wp.proj === 'beam') {
        const hit = rayHit(T, dr.x, dr.y, T.x, T.y);
        if (hit) { hitBlock(w, T, hit.b, Wp.dmg * (dr.mul || 1) * dt * (D.mines ? 3 : 1), Wp.type, 's', owner, { mining: D.mines }); w.beams.push({ x: dr.x, y: dr.y, x2: hit.x, y2: hit.y, color: Wp.color, width: 1.6, hit: true, tool: D.mines ? 'mine' : null }); }
        continue;
      }
      if (dr.cd > 0) continue;
      dr.cd = 1 / Wp.rate;
      const a = Math.atan2(T.y + T.vy * dd / (Wp.speed || 900) - dr.y, T.x + T.vx * dd / (Wp.speed || 900) - dr.x);
      if (Wp.proj === 'arc') { arcStrike(w, owner, dr.x, dr.y, a, Wp.range, Wp.dmg * (dr.mul || 1), { ...Wp, id: 'drone_arc' }, { body: T }); continue; }
      const sp = Wp.speed || 900;
      w.shots.push({ id: newId(), x: dr.x, y: dr.y, px: dr.x, py: dr.y, vx: Math.cos(a) * sp + dr.vx * 0.5, vy: Math.sin(a) * sp + dr.vy * 0.5, a,
        w: { ...Wp, mode: 'drone', id: 'drone_' + Wp.proj }, dmg: Wp.dmg * (dr.mul || 1), team: owner.team, owner, life: Wp.range / sp * 1.2, age: 0, pierce: 0, splash: Wp.splash || 0,
        opt: { shieldMult: Wp.shieldMult || 1 }, color: Wp.color, kind: Wp.proj, target: T, homing: Wp.homing || 0, hp: Wp.proj === 'missile' || Wp.proj === 'rocket' ? 3 : 0, size: Wp.size, launch: Wp.proj === 'missile' ? 0.15 : 0 });
      emit(w, { t: 'fire', w: 'drone_' + Wp.proj, x: dr.x, y: dr.y, a, color: Wp.color, team: owner.team, owner: owner.id, n: 0.5, drone: true });
    }
  }
}

/** For tests / tools: the material colour for a pickup. */
export const pickupColor = p => p.kind === 'mat' ? MATERIALS[p.mat]?.color : p.kind === 'item' ? RARITY_BY_ID[p.rarity]?.color : p.kind === 'cr' ? '#ffd84a' : p.kind === 'pod' ? '#ffffff' : '#c8ff6a';
