// One mission's whole state and its step. Everything that happens is pushed to S.events for the renderer, sound and
// network (the co-op server runs this same file). Pure: no DOM, no clock — dt is passed in, randomness is S.rng.
//
// def = { id, name, seed, map: { w, h, lots: [...] }, start: [{ x, z }…], drop: seconds of drop-in,
//   waves: [{ at, kind, count, from: 'edge' | { x, z } | 'nest', spread, warn, elite, every, until, needsObjective }],
//   enemies: [{ kind, x, z, elite }] (placed at the start: nests, batteries…),
//   objectives: [{ id, type: 'kill' | 'destroy' | 'survive' | 'reach' | 'killAll', kind, count, lots, time, x, z, r, optional, label }],
//   extract: { x, z, r }, par: { time }, collateral: [lot ids that cost grade if they fall] }
import { makeRng, mixSeed } from './rng.js';
import { Grid } from './grid.js';
import { makeWorld, groundAt, pushOut, lotAt, rayLot, damageLot } from './world.js';
import { stepMech, hurtMech, energyMaxOf } from './mech.js';
import { setupOps, stepOps, opsObjective } from './ops.js';
import { bossSpot, initBoss, bossHit, bossDied } from './boss.js';
import { spawnAce, hurtAce, stepAces, aceAfterStep } from './ace.js';
import { makeEnemy, stepEnemies } from './enemies.js';
import { triggerWeapon, updateLocks, resolveHit, angleDiff } from './weapons.js';
import { mitigate, tickStatus } from './damage.js';
import { gradeOf } from './grade.js';
import { makeFlow, updateFlow, flowDist } from './flow.js';

export const PHASES = ['drop', 'fight', 'extract', 'won', 'failed'];

export function createMission(def, { kinds, T, players = [], seed = def.seed || 1 }) {
  const world = makeWorld(def.map);
  const S = {
    def, T, kinds, seed, rng: makeRng(mixSeed(seed, def.id)), time: 0, phase: 'drop', phaseT: def.drop ?? 3,
    world, grid: new Grid(world.w, world.h, 1), mechs: [], enemies: [], byId: new Map(), shots: [], strikes: [], delayed: [],
    pickups: [], deployed: [], events: [], nextId: 1, waveDone: new Set(), objectives: [], stats: { kills: 0, score: 0, structures: 0, collateral: 0 },
    revives: 0, checkpoint: null, result: null, flow: null, flowT: 0,
  };
  S.flow = makeFlow(world);
  // players drop in at the start points
  players.forEach((p, i) => {
    const st = def.start[i % def.start.length];
    p.mech.x = st.x + (i % 2) * 0.6; p.mech.z = st.z + Math.floor(i / 2) * 0.6; p.mech.y = 0;
    p.mech.pid = p.id; S.mechs.push(p.mech); S.byId.set(p.mech.id, p.mech);
    p.mats = { scrap: 0, alloy: 0, exotic: 0 }; p.loot = [];
  });
  S.players = players;
  for (const o of def.objectives || []) S.objectives.push({ ...o, progress: 0, done: false, failed: false });
  attachHelpers(S);
  for (const p of def.enemies || []) spawn(S, p.kind, p.x, p.z, { warn: 0, elite: p.elite, boss: p.boss });
  setupOps(S);          // mission types: placed enemies, masts, the data core, convoys, orbital drop (ops.js)
  return S;
}

/** Add an enemy (respects the cap and the spawn rules: never on top of a player, never inside a building). */
export function spawn(S, kind, x, z, opts = {}) {
  const K = S.kinds[kind]; if (!K) return null;
  if (K.job === 'ace') return spawnAce(S, kind, K, x, z, opts);             // rival aces are mechs (sim/ace.js)
  if (K.job === 'boss') { const p = bossSpot(S, x, z, K.radius); if (!p) return null; x = p.x; z = p.z; opts = { ...opts, force: true, warn: Math.max(opts.warn ?? 0, 1.6) }; }
  if (S.enemies.length - S.deadCount() >= S.T.maxEnemies && !opts.force) return null;
  const e = makeEnemy(kind, K, x, z, S.T, { ...opts, id: 'e' + (S.nextId++) });
  e.parent = opts.parent || null;
  S.enemies.push(e); S.byId.set(e.id, e);
  S.events.push({ type: e.state === 'warn' ? 'ewarn' : 'espawn', id: e.id, kind, x, z, t: e.stateT });
  if (K.job === 'boss') initBoss(S, e, K);
  return e;
}

/** Safe spot near (x, z) for a spawn: outside buildings and at least spawnSafeRadius from every player. */
function safeSpot(S, x, z, opts = null) {
  const R = S.T.spawnSafeRadius, W = S.world;
  const ok = (px, pz) => {
    if (px < 0.25 || pz < 0.25 || px > W.w - 0.25 || pz > W.h - 0.25) return false;
    const l = lotAt(W, px, pz); if (l && l.solid && l.stage < 3) return false;
    if (S.mechs.some(m => !m.down && m.team !== 'enemy' && Math.hypot(m.x - px, m.z - pz) < R)) return false;
    if (S.flow && !Number.isFinite(flowDist(S.flow, px, pz)) && !opts?.anywhere) return false;   // never in a sealed-off pocket
    return true;
  };
  if (ok(x, z)) return { x, z };
  // search outward ring by ring for the nearest open, reachable, safe spot (keeps the wave's shape)
  for (let r = 0.5; r <= 4; r += 0.5) {
    const n = Math.ceil(r * 8), a0 = S.rng.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) { const a = a0 + k / n * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (ok(px, pz)) return { x: px, z: pz }; }
  }
  return null;
}

function edgePoint(S, i) {
  // spread around the map edge, away from the players' average position
  const pm = S.mechs.filter(m => m.team !== 'enemy');
  const ax = pm.reduce((s, m) => s + m.x, 0) / Math.max(1, pm.length), az = pm.reduce((s, m) => s + m.z, 0) / Math.max(1, pm.length);
  const E = S.def.map.edges;
  if (E?.length) {        // the district's road ends: enemies pour in along the streets
    const far = E.filter(p => Math.hypot(p.x - ax, p.z - az) > S.T.spawnSafeRadius * 1.5);
    return S.rng.pick(far.length ? far : E);
  }
  for (let k = 0; k < 8; k++) {
    const side = S.rng.int(0, 3), t = S.rng.next();
    const p = side === 0 ? { x: t * S.world.w, z: 0.4 } : side === 1 ? { x: S.world.w - 0.4, z: t * S.world.h } : side === 2 ? { x: t * S.world.w, z: S.world.h - 0.4 } : { x: 0.4, z: t * S.world.h };
    if (Math.hypot(p.x - ax, p.z - az) > S.T.spawnSafeRadius * 1.5) return p;
  }
  return { x: 0.4, z: 0.4 };
}

function runWaves(S) {
  for (const [i, w] of (S.def.waves || []).entries()) {
    const key = i + ':' + (w.every ? Math.floor((S.time - w.at) / w.every) : 0);
    if (S.time < w.at || S.waveDone.has(key)) continue;
    if (w.until != null && S.time > w.until) continue;
    if (w.needsObjective && !S.objectives.find(o => o.id === w.needsObjective)?.done) continue;
    if (w.whileObjective && S.objectives.find(o => o.id === w.whileObjective)?.done) continue;
    S.waveDone.add(key);
    let from = w.from || 'edge';
    const centre = from === 'edge' ? edgePoint(S, i) : from === 'nest' ? null : from;
    for (let n = 0; n < w.count; n++) {
      let c = centre;
      if (from === 'nest') { const nests = S.enemies.filter(e => !e.dead && e.kind === 'nest'); if (!nests.length) break; const ne = nests[n % nests.length]; c = { x: ne.x, z: ne.z }; }
      const sp = w.spread ?? 1.6, a = S.rng.next() * Math.PI * 2, rr = Math.sqrt(S.rng.next()) * sp;
      const p = safeSpot(S, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr); if (!p) continue;
      spawn(S, w.kind, p.x, p.z, { warn: w.warn ?? S.T.spawnWarn, elite: w.elite && S.rng.chance(w.elite) });
    }
  }
}

function attachHelpers(S) {
  S.deadCount = () => S._dead || 0;
  S.countAlive = () => S.enemies.length - (S._dead || 0);
  S.candidates = function* (x, z, r) { for (const e of S.grid.within(x, z, r)) if (!e.dead && e.state !== 'warn' && !e.hidden) yield e; };
  S.jammedAt = (x, z) => S.enemies.some(e => e.jamming && !e.dead && Math.hypot(e.x - x, e.z - z) < S.kinds[e.kind].range);
  S.canSee = (a, b) => (a.flying || b.y > 0.5) ? true : !rayLot(S.world, a.x, a.z, b.x, b.z, 0.25);
  S.spawn = (kind, x, z, o) => spawn(S, kind, x, z, o);
  S.dropLoot = (e, K) => dropLoot(S, e, K);
  S.hurtPlayer = (m, amount, dtype, from) => { let n = mitigate(amount, dtype, m); const src = from?.id && S.byId.get(from.id);
    const sh = m.weapons.find(w => w.spec.kind === 'shield' && w.held); if (sh && src && Math.abs(angleDiff(Math.atan2(src.z - m.z, src.x - m.x), m.aim)) < 1.1) { n *= 1 - sh.spec.block; S.events.push({ type: 'block', id: m.id }); } const got = hurtMech(m, n, S.events, from?.id); if (got > 0) S.events.push({ type: 'phit', id: m.id, amount: got, dtype, x: m.x, z: m.z, from: from?.id || null }); };
  S.damageEnemy = (e, amount, dtype, by, tier = 0, hx = e.x, hz = e.z) => damageEnemy(S, e, amount, dtype, by, tier, hx, hz);
  S.killEnemy = (e, by, burst = false) => killEnemy(S, e, by, burst);
  S.hitLine = (shot, x, z, y, dir, len, pierce, width) => hitLine(S, shot, x, z, y, dir, len, pierce, width);
  S.chain = (shot, x, z, dir, range, jumps, jr) => chain(S, shot, x, z, dir, range, jumps, jr);
  S.melee = (shot, m, dir, range, arc) => melee(S, shot, m, dir, range, arc);
  S.repairLine = (shot, m, dir, range, heal) => repairLine(S, shot, m, dir, range, heal);
  S.deploy = (shot, m, spec, aim) => deploy(S, shot, m, spec, aim);
}

function damageEnemy(S, e, amount, dtype, by, tier, hx, hz) {
  if (e.dead || e.state === 'warn' || amount <= 0) return 0;
  // test-range dummies take every point (the meter reads the real hit) but never drop below 1 and never die
  if (e.dummy) { e.hp = Math.max(1, e.hp - amount); e.quiet = 0; S.events.push({ type: 'hit', id: e.id, amount, tier, dtype, x: hx, z: hz, y: e.flying || 0.2, by, dummy: true }); return amount; }
  if (e.ace) return hurtAce(S, e, amount, dtype, by, tier, hx, hz);          // a rival ace (a mech: sim/ace.js)
  let shown = null, part = null;
  if (e.parts) ({ amount, shown, part } = bossHit(S, e, amount, hx, hz, by));   // boss: the part where it landed (sim/boss.js)
  const n = Math.min(e.hp, amount); e.hp -= n; e.lastHitBy = by;
  const m = by && S.byId.get(by); if (m && m.dealt != null) m.dealt += n;
  S.events.push({ type: 'hit', id: e.id, amount: shown ?? n, tier, dtype, x: hx, z: hz, y: e.flying || 0.2, by, part });
  if (e.hp <= 0) killEnemy(S, e, by);
  return n;
}

function killEnemy(S, e, by, burst = false) {
  if (e.dead || e.dummy) return; e.dead = true; e.hp = 0; S._dead = (S._dead || 0) + 1;
  const K = S.kinds[e.kind];
  if (e.parent) { const p = S.byId.get(e.parent); if (p) p.out = Math.max(0, p.out - 1); }
  S.stats.kills++; S.stats.score += (K.score || 1) * (e.elite ? 3 : 1);
  if (K.structure) S.stats.structures++;
  const m = by && S.byId.get(by); if (m && m.kills != null) m.kills++;
  S.events.push({ type: 'kill', id: e.id, kind: e.kind, x: e.x, z: e.z, y: e.flying || 0, by, big: (K.radius || 0) > 0.2 || !!K.structure, elite: e.elite });
  // bloaters (and anything with a burst) explode, hurting everything near — friends too
  if (K.job === 'burst') blast(S, { owner: e.id, team: 'neutral', dtype: K.dtype || 'fire', dmg: K.dmg * S.T.enemyDamage, crit: 0 }, e.x, e.z, K.splash, true);
  for (const o of S.objectives) if (!o.done && (o.type === 'kill' && (!o.kind || o.kind === e.kind) && (!o.tag || o.tag === e.tag) || o.type === 'killAll')) o.progress++;
  if (e.parts) bossDied(S, e);
  dropLoot(S, e, K);
}

/** Each player gets their own drops (never fight over loot); materials only from the mission's tier table. */
function dropLoot(S, e, K) {
  const mats = K.mats || {};
  for (const p of S.players) {
    const st = p.mech.stats || {};
    for (const [mat, chance0] of Object.entries(mats)) {
      const chance = chance0 * (1 + (st.matBonus || 0));      // Magnet Hook chip
      let n = Math.floor(chance) + (S.rng.next() < chance % 1 ? 1 : 0);
      if (e.elite) n += S.rng.next() < 0.5 ? 1 : 0;
      for (let i = 0; i < n; i++) S.pickups.push({ id: 'p' + (S.nextId++), owner: p.id, mat, n: 1, x: e.x + S.rng.range(-0.15, 0.15), z: e.z + S.rng.range(-0.15, 0.15), t: 0 });
    }
    if ((e.elite || K.structure || e.boss) && S.def.partDrops !== false) {
      const extra = st.partLuck && S.rng.next() < st.partLuck ? 2 : 1;   // Salvage Eye chip: sometimes a second part
      for (let i = 0; i < extra; i++) S.pickups.push({ id: 'p' + (S.nextId++), owner: p.id, part: true, tier: S.def.tier || 1, boss: !!e.boss, x: e.x + i * 0.2, z: e.z, t: 0 });
    }
  }
}

/** An explosion: damages enemies, players (enemy blasts only — your own blasts never hurt allies) and buildings. */
function blast(S, shot, x, z, r, fromEnemyBurst = false) {
  S.events.push({ type: 'boom', x, z, r, dtype: shot.dtype, team: shot.team });
  if (shot.team !== 'enemy') for (const e of S.grid.within(x, z, r)) {
    if (e.dead || e.hidden || e.state === 'warn') continue;
    const d = Math.hypot(e.x - x, e.z - z), fall = 1 - 0.5 * Math.min(1, d / Math.max(0.01, r + e.r));
    const { amount, tier } = resolveHit(S, shot, e, S.T, fall); damageEnemy(S, e, amount, shot.dtype, shot.owner, tier, e.x, e.z);
  }
  if (shot.team === 'enemy' || fromEnemyBurst) for (const m of S.mechs) {
    if (m.down || m.team === 'enemy') continue; const d = Math.hypot(m.x - x, m.z - z); if (d > r + m.r) continue;
    S.hurtPlayer(m, shot.dmg * (1 - 0.5 * Math.min(1, d / (r + m.r))), shot.dtype, { id: shot.owner });
  }
  // buildings in the blast take damage (player shots and enemy shots alike — the city is destructible)
  const seen = new Set();
  for (let tz = Math.floor(z - r); tz <= Math.floor(z + r); tz++) for (let tx = Math.floor(x - r); tx <= Math.floor(x + r); tx++) {
    const l = lotAt(S.world, tx + 0.5, tz + 0.5); if (!l || seen.has(l)) continue; seen.add(l);
    damageLot(S.world, l, shot.dmg * 0.6 / S.T.buildingArmour, S.events);
  }
}

function hitLine(S, shot, x, z, y, dir, len, pierce, width) {
  const ex = x + Math.cos(dir) * len, ez = z + Math.sin(dir) * len;
  const wall = rayLot(S.world, x, z, ex, ez, y);
  const stopAt = wall && pierce < 99 ? wall.t * len : len;
  const hits = [];
  for (const e of S.grid.within(x + Math.cos(dir) * len / 2, z + Math.sin(dir) * len / 2, len / 2 + 0.5)) {
    if (e.dead || e.hidden || e.state === 'warn') continue;
    const rx = e.x - x, rz = e.z - z, along = rx * Math.cos(dir) + rz * Math.sin(dir); if (along < 0 || along > stopAt) continue;
    const off = Math.abs(-rx * Math.sin(dir) + rz * Math.cos(dir)); if (off > e.r + width) continue;
    hits.push([along, e]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  let n = 0;
  for (const [, e] of hits) { const { amount, tier } = resolveHit(S, { ...shot, vx: Math.cos(dir), vz: Math.sin(dir) }, e, S.T); damageEnemy(S, e, amount, shot.dtype, shot.owner, tier); if (++n > pierce) break; }
  const endLen = n > pierce && hits[n - 1] ? hits[n - 1][0] : stopAt;
  if (wall && (pierce < 99) && endLen >= stopAt - 1e-6) damageLot(S.world, wall.lot, shot.dmg / S.T.buildingArmour, S.events);
  if (pierce >= 99 && wall) damageLot(S.world, wall.lot, shot.dmg * 0.5 / S.T.buildingArmour, S.events);
  S.events.push({ type: 'line', owner: shot.owner, x, z, y, x2: x + Math.cos(dir) * endLen, z2: z + Math.sin(dir) * endLen, dtype: shot.dtype, weapon: shot.weapon });
}

function chain(S, shot, x, z, dir, range, jumps, jr) {
  let from = { x, z }, cur = null, best = Infinity; const hit = new Set();
  for (const e of S.candidates(x, z, range)) { const a = Math.abs(angleDiff(Math.atan2(e.z - z, e.x - x), dir)); if (a > 0.5) continue; const d = Math.hypot(e.x - x, e.z - z) + a * 3; if (d < best) { best = d; cur = e; } }
  const pts = [[x, z]];
  for (let j = 0; cur && j <= jumps; j++) {
    hit.add(cur.id); pts.push([cur.x, cur.z]);
    const { amount, tier } = resolveHit(S, shot, cur, S.T, Math.pow(0.85, j)); damageEnemy(S, cur, amount, shot.dtype, shot.owner, tier);
    from = cur; cur = null; best = Infinity;
    for (const e of S.candidates(from.x, from.z, jr)) { if (hit.has(e.id)) continue; const d = Math.hypot(e.x - from.x, e.z - from.z); if (d < best) { best = d; cur = e; } }
  }
  S.events.push({ type: 'chain', owner: shot.owner, pts });
}

function melee(S, shot, m, dir, range, arc) {
  let n = 0;
  for (const e of S.candidates(m.x, m.z, range + 0.3)) { const a = Math.abs(angleDiff(Math.atan2(e.z - m.z, e.x - m.x), dir)); if (a > arc / 2) continue; const { amount, tier } = resolveHit(S, shot, e, S.T); damageEnemy(S, e, amount, shot.dtype, shot.owner, tier); e.vx += Math.cos(dir) * (shot.knock || 2); e.vz += Math.sin(dir) * (shot.knock || 2); n++; }
  const l = lotAt(S.world, m.x + Math.cos(dir) * range, m.z + Math.sin(dir) * range); if (l) damageLot(S.world, l, shot.dmg / S.T.buildingArmour, S.events);
  S.events.push({ type: 'slash', owner: m.id, x: m.x, z: m.z, dir, range, arc, n });
}

function repairLine(S, shot, m, dir, range, heal) {
  let best = null, bd = Infinity;
  for (const o of S.mechs) { if (o === m || o.team !== m.team) continue; const d = Math.hypot(o.x - m.x, o.z - m.z); const a = Math.abs(angleDiff(Math.atan2(o.z - m.z, o.x - m.x), dir)); if (d < range && a < 0.5 && d < bd) { bd = d; best = o; } }
  if (!best) return;
  if (best.down) { best.reviveT += 0.25; } else { const n = Math.min(best.hpMax - best.hp, heal); best.hp += n; S.events.push({ type: 'heal', id: best.id, amount: n, by: m.id }); }
}

function deploy(S, shot, m, spec, aim) {
  const d = { id: 'd' + (S.nextId++), owner: m.id, kind: spec.deploy, flying: spec.deploy === 'drone' ? 0.6 : 0, x: m.x + Math.cos(m.aim) * 0.4, z: m.z + Math.sin(m.aim) * 0.4, hp: spec.hp || 300, life: spec.life || 20, cd: 0, spec };
  pushOut(S.world, d, 0.12); S.deployed.push(d); S.events.push({ type: 'deploy', id: d.id, kind: d.kind, x: d.x, z: d.z, owner: m.id });
}

function stepDeployed(S, dt) {
  for (const d of S.deployed) {
    d.life -= dt; d.cd -= dt;
    if (d.kind === 'mine') {
      for (const e of S.grid.within(d.x, d.z, 0.4)) if (!e.dead && !e.flying && !e.hidden) { blast(S, { owner: d.owner, team: 'player', dtype: 'explosive', dmg: d.spec.dmg, crit: 0 }, d.x, d.z, d.spec.splash || 0.8); d.life = 0; break; }
      continue;
    }
    if (d.kind === 'drone') {   // drones circle their owner and shoot what comes near
      const o = S.byId.get(d.owner); if (o) { d.orbit = (d.orbit || 0) + dt * 1.6; const k = S.deployed.indexOf(d); d.x = o.x + Math.cos(d.orbit + k * 2.1) * 0.55; d.z = o.z + Math.sin(d.orbit + k * 2.1) * 0.55; d.y = 0.6; }
    }
    if (d.cd > 0) continue;
    let best = null, bd = d.spec.range * d.spec.range;
    for (const e of S.candidates(d.x, d.z, d.spec.range)) { const q = (e.x - d.x) ** 2 + (e.z - d.z) ** 2; if (q < bd && S.canSee(d, e)) { bd = q; best = e; } }
    if (!best) continue;
    d.cd = 1 / (d.spec.turretRate || 4);
    const a = Math.atan2(best.z - d.z, best.x - d.x), sp = 10; d.aim = a;
    S.shots.push({ owner: d.owner, team: 'player', kind: 'bullet', dtype: 'kinetic', dmg: d.spec.turretDmg || 12, x: d.x, z: d.z, y: 0.25, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, life: d.spec.range / sp, age: 0, hits: [], pierce: 0, crit: 0 });
    S.events.push({ type: 'fire', id: d.id, kind: 'bullet', x: d.x, z: d.z, y: 0.25, dir: a, turret: true });
  }
  S.deployed = S.deployed.filter(d => d.life > 0);
}

function stepShots(S, dt) {
  const T = S.T, keep = [];
  for (const s of S.shots) {
    s.age += dt;
    if (s.target && !s.vertical) {                    // homing
      const t = S.byId.get(s.target);
      if (t && !t.dead) { const want = Math.atan2(t.z - s.z, t.x - s.x), cur = Math.atan2(s.vz, s.vx), sp = Math.hypot(s.vx, s.vz); const a = cur + Math.max(-s.turn * dt, Math.min(s.turn * dt, angleDiff(want, cur))); s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; }
    }
    if (s.vertical) { s.y += s.vy * dt; if (s.y > 1.6 || s.age > 0.6) { s.vertical = false; s.climbed = true; } }
    if (s.climbed) { const t = S.byId.get(s.target); if (t && !t.dead) { const want = Math.atan2(t.z - s.z, t.x - s.x), cur = Math.atan2(s.vz, s.vx), sp = Math.hypot(s.vx, s.vz); const a = cur + Math.max(-s.turn * 1.5 * dt, Math.min(s.turn * 1.5 * dt, angleDiff(want, cur))); s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; const d = Math.hypot(t.x - s.x, t.z - s.z); s.y = Math.max(0.2, Math.min(s.y, d * 0.8)); } else s.y = Math.max(0.2, s.y - dt * 2); }
    const ox = s.x, oz = s.z;
    s.x += s.vx * dt; s.z += s.vz * dt;
    if (s.lob) { s.y += s.vy * dt; s.vy -= s.g * dt; if (s.y <= 0 || s.age >= s.life) { land(S, s, s.x, s.z); continue; } keep.push(s); continue; }
    if (s.age >= s.life || s.x < -1 || s.z < -1 || s.x > S.world.w + 1 || s.z > S.world.h + 1) { if (s.splash > 0 && s.kind !== 'flame') land(S, s, s.x, s.z); else if (s.kind === 'missile') land(S, s, s.x, s.z); continue; }
    // buildings stop shots (and take the damage) unless the shot flies over them
    const l = lotAt(S.world, s.x, s.z);
    if (l && l.solid && l.stage < 3 && (s.y ?? 0.3) < l.h) {
      if (s.splash > 0) land(S, s, ox, oz);
      else { damageLot(S.world, l, s.dmg / T.buildingArmour, S.events); S.events.push({ type: 'spark', x: ox, z: oz, y: s.y, dtype: s.dtype }); }
      if (s.kind !== 'flame' || true) continue;
    }
    if (s.team === 'enemy') {
      let hit = false;
      for (const m of S.mechs) { if (m.down || m.team === 'enemy') continue; if ((m.x - s.x) ** 2 + (m.z - s.z) ** 2 < (m.r + 0.04) ** 2) { if (s.splash > 0) land(S, s, s.x, s.z); else S.hurtPlayer(m, s.dmg, s.dtype, { id: s.owner }); hit = true; break; } }
      for (const d of S.deployed) { if (hit) break; if ((d.x - s.x) ** 2 + (d.z - s.z) ** 2 < 0.03) { d.hp -= s.dmg; if (d.hp <= 0) d.life = 0; hit = true; } }
      if (!hit) keep.push(s);
      continue;
    }
    let stop = false;
    // swept test: a fast bullet moves more than a small target's width in one step, so check the whole path this step
    // (start → end), not just where it ended up (the test range showed bullets passing straight through dummies)
    const sx0 = s.x - ox, sz0 = s.z - oz, sl2 = sx0 * sx0 + sz0 * sz0 || 1e-9;
    S.grid.near((s.x + ox) / 2, (s.z + oz) / 2, 0.6 + Math.sqrt(sl2) / 2, e => {
      if (e.dead || e.hidden || e.state === 'warn' || s.hits.includes(e.id)) return;
      if (e.flying && s.kind !== 'missile' && s.y < e.flying - 0.6 && !s.flame) { /* flyers are hit by anything aimed at them */ }
      const rr = e.r + (s.flame ? 0.12 : 0.04);
      const k = Math.max(0, Math.min(1, ((e.x - ox) * sx0 + (e.z - oz) * sz0) / sl2));
      if ((e.x - (ox + sx0 * k)) ** 2 + (e.z - (oz + sz0 * k)) ** 2 > rr * rr) return;
      if (s.splash > 0 && !s.flame) { land(S, s, s.x, s.z); stop = true; return true; }
      const { amount, tier } = resolveHit(S, s, e, T); damageEnemy(S, e, amount, s.dtype, s.owner, tier, s.x, s.z);
      if (s.knock) { const k = s.knock / Math.max(0.5, e.r * 6); e.vx += s.vx / Math.hypot(s.vx, s.vz) * k; e.vz += s.vz / Math.hypot(s.vx, s.vz) * k; }
      s.hits.push(e.id);
      if (s.hits.length > s.pierce) { stop = true; return true; }
    });
    if (!stop) keep.push(s);
  }
  S.shots = keep;
}

function land(S, s, x, z) {
  if (s.splash > 0) blast(S, s, x, z, s.splash);
  else S.events.push({ type: 'spark', x, z, y: 0.1, dtype: s.dtype });
}

function stepStrikes(S, dt) {
  const keep = [];
  for (const k of S.strikes) { k.t -= dt; if (k.t <= 0) blast(S, k, k.x, k.z, k.r); else keep.push(k); }
  S.strikes = keep;
  const later = [];
  for (const d of S.delayed) {
    d.t -= dt; if (d.t > 0) { later.push(d); continue; }
    if (d.fn === 'enemyMissile') { const e = S.byId.get(d.e), p = S.byId.get(d.p); if (!e || e.dead || !p) continue; const K = S.kinds[e.kind], a = Math.atan2(p.z - e.z, p.x - e.x) + S.rng.range(-0.6, 0.6); S.shots.push({ owner: e.id, team: 'enemy', kind: 'missile', dtype: K.dtype, dmg: K.dmg * S.T.enemyDamage, splash: 0.35, x: e.x, z: e.z, y: 0.6, vx: Math.cos(a) * K.shotSpeed, vz: Math.sin(a) * K.shotSpeed, life: K.range / K.shotSpeed * 1.8, age: 0, hits: [], target: p.id, turn: K.turn }); S.events.push({ type: 'eshot', id: e.id, kind: e.kind, x: e.x, z: e.z, dir: a, missile: true }); }
  }
  S.delayed = later;
}

/** Collapses crush what's under them; explosive lots (fuel tanks) blow up and can chain. */
function handleWorldEvents(S, from) {
  for (let i = from; i < S.events.length; i++) {
    const ev = S.events[i]; if (ev.type !== 'collapse') continue;
    if ((S.def.collateral || []).includes(ev.lot)) S.stats.collateral++;
    const r = Math.max(ev.w, ev.d) * 0.5 * S.T.crushRadius + 0.3;
    for (const e of S.grid.within(ev.x, ev.z, r)) if (!e.dead && !e.flying) damageEnemy(S, e, S.T.crushDamage, 'kinetic', null, 0);
    if (ev.explosive) blast(S, { owner: null, team: 'neutral', dtype: 'explosive', dmg: ev.explosive, crit: 0 }, ev.x, ev.z, r + 0.6, true);
    for (const o of S.objectives) {
      if (!o.done && o.type === 'destroy' && o.lots?.includes(ev.lot)) o.progress++;
      if (o.type === 'keepLots' && o.lots?.includes(ev.lot) && !o.failed) { o.failed = true; S.events.push({ type: 'objectiveFailed', id: o.id, label: o.label }); }
    }
  }
}

function stepPickups(S, dt) {
  const keep = [];
  for (const p of S.pickups) {
    p.t += dt; const owner = S.players.find(q => q.id === p.owner); const m = owner?.mech;
    if (m && !m.down) { const d = Math.hypot(m.x - p.x, m.z - p.z); const pull = m.stats.magnet || 1.6;
      if (d < 0.3) { if (p.mat) owner.mats[p.mat] = (owner.mats[p.mat] || 0) + p.n; else owner.loot.push({ tier: p.tier, boss: p.boss, seed: mixSeed(S.seed, p.id) }); S.events.push({ type: 'pickup', id: p.id, owner: p.owner, mat: p.mat || null, part: !!p.part }); continue; }
      if (d < pull) { p.x += (m.x - p.x) / d * dt * 4; p.z += (m.z - p.z) / d * dt * 4; } }
    if (p.t < 90) keep.push(p);
  }
  S.pickups = keep;
}

function stepObjectives(S) {
  const requiredDone = S.objectives.filter(o => !o.optional).every(o => o.done);
  for (const o of S.objectives) {
    if (o.done || o.failed) continue;
    if (o.type === 'beat' && S.time - (S.def.drop ?? 3) > o.time) { o.failed = true; S.events.push({ type: 'objectiveFailed', id: o.id, label: o.label }); continue; }
    if (o.type === 'keepLots' || o.type === 'beat') { if (requiredDone && S.objectives.filter(x => !x.optional).length) { o.done = true; S.events.push({ type: 'objective', id: o.id, label: o.label }); } continue; }
    const ops = opsObjective(S, o);
    if (ops) {
      o.progress = ops.progress; o.goal = ops.goal;
      if (ops.failed) { o.failed = true; S.events.push({ type: 'objectiveFailed', id: o.id, label: o.label }); if (!o.optional && S.phase !== 'won') { S.phase = 'failed'; S.events.push({ type: 'phase', phase: 'failed' }); } }
      else if (S.phase !== 'drop' && o.progress >= o.goal) { o.done = true; S.events.push({ type: 'objective', id: o.id, label: o.label }); }
      continue;
    }
    if (o.type === 'survive') o.progress = Math.min(o.time, S.time - (S.def.drop ?? 3));
    if (o.type === 'reach') o.progress = S.mechs.some(m => !m.down && m.team !== 'enemy' && Math.hypot(m.x - o.x, m.z - o.z) < o.r) ? 1 : 0;
    let met;
    if (o.type === 'killAll') {
      const left = S.enemies.filter(e => !e.dead && (!o.kind || e.kind === o.kind)).length + S.mechs.filter(m => m.ace && !m.dead && (!o.kind || m.kind === o.kind)).length;
      const pending = (S.def.waves || []).some(w => S.time < w.at || (w.every && (w.until == null || S.time < w.until)));
      o.left = left; met = S.phase !== 'drop' && left === 0 && !pending && o.progress > 0;
    } else {
      const goal = o.type === 'survive' ? o.time : o.type === 'reach' ? 1 : o.type === 'destroy' ? o.lots.length : o.count;
      met = S.phase !== 'drop' && o.progress >= goal;
    }
    if (met) { o.done = true; S.events.push({ type: 'objective', id: o.id, label: o.label }); }
  }
}

/**
 * Step the mission. inputs: { [pid]: { mx, mz, ax, az, boost, qb, jump, jumpPressed, fire: [bool…] per weapon slot,
 *   lockOn: bool (sticky lock button), pad: bool } }. dt in seconds (fixed step, e.g. 1/30).
 */
export function stepMission(S, inputs, dt) {
  const T = S.T; S.events.length = 0; S.time += dt;
  const evStart = 0;
  S.grid.clear(); for (const e of S.enemies) if (!e.dead) S.grid.add(e);
  for (const a of S.mechs) if (a.team === 'enemy' && !a.dead) S.grid.add(a);   // rival aces: player shots find them like any enemy

  if (S.phase === 'drop') { S.phaseT -= dt; if (S.phaseT <= 0) { S.phase = 'fight'; S.events.push({ type: 'phase', phase: 'fight' }); } }
  const worldApi = { groundAt: (x, z) => groundAt(S.world, x, z), pushOut: (b, r) => pushOut(S.world, b, r) };

  for (const p of S.players) {
    const m = p.mech, inp = (S.phase === 'drop' ? null : inputs[p.id]) || {};
    m.padAim = !!inp.pad;
    stepMech(m, inp, dt, T, worldApi, S.events);
    const burn = tickStatus(m, dt); if (burn) hurtMech(m, burn, S.events);
    // sticky lock-on: the button grabs the enemy nearest the aim and the aim follows it until pressed again
    if (inp.lockOnPressed) {
      if (m.lockOn) m.lockOn = null;
      else { let best = null, bs = Infinity; for (const e of S.candidates(m.x, m.z, 12)) { const a = Math.abs(angleDiff(Math.atan2(e.z - m.z, e.x - m.x), Math.atan2((inp.az ?? m.z) - m.z, (inp.ax ?? m.x) - m.x))); const sc = a * 4 + Math.hypot(e.x - m.x, e.z - m.z) * 0.1; if (sc < bs) { bs = sc; best = e; } } m.lockOn = best?.id || null; }
      S.events.push({ type: 'stick', id: m.id, target: m.lockOn });
    }
    const stuck = m.lockOn && S.byId.get(m.lockOn);
    if (stuck && stuck.dead) m.lockOn = null;
    const aim = stuck && !stuck.dead ? { x: stuck.x, z: stuck.z } : { x: inp.ax ?? m.x + Math.cos(m.aim), z: inp.az ?? m.z + Math.sin(m.aim) };
    if (stuck && !stuck.dead && !m.down) m.aim = Math.atan2(stuck.z - m.z, stuck.x - m.x);
    if (m.down || S.phase === 'drop') { for (const w of m.weapons) w.held = false; continue; }
    m.weapons.forEach((w, i) => { updateLocks(S, m, w, dt, T, aim.x, aim.z); triggerWeapon(S, m, w, !!inp.fire?.[i], dt, T, aim); });
    // revive: stand next to a downed teammate
    for (const o of S.mechs) if (o !== m && o.down && o.team === m.team && !o.dead && Math.hypot(o.x - m.x, o.z - m.z) < 0.7) { o.reviveT += dt; if (o.reviveT >= (T.reviveTime || 3)) { o.down = false; o.hp = o.hpMax * 0.35; o.reviveT = 0; S.revives++; S.events.push({ type: 'revive', id: o.id, by: m.id }); } }
  }

  S.flowT -= dt;
  if (S.flowT <= 0) { S.flowT = 0.4; updateFlow(S.flow, S.world, [...S.mechs.filter(m => !m.down && m.team !== 'enemy'), ...(S.allies || []).filter(a => !a.down && !a.arrived)]); }   // escort trucks are worth walking to
  if (S.phase === 'fight' || S.phase === 'extract') { runWaves(S); stepEnemies(S, dt, T); stepAces(S, dt, worldApi); }
  stepShots(S, dt); stepStrikes(S, dt); stepDeployed(S, dt); stepPickups(S, dt);
  stepOps(S, inputs, dt);
  handleWorldEvents(S, evStart);
  aceAfterStep(S);
  stepObjectives(S);

  // cleanup dead enemies after their death animation has had time to be seen (renderer keeps its own copy)
  if (S._dead > 200) { S.enemies = S.enemies.filter(e => !e.dead); S._dead = 0; for (const [k, v] of S.byId) if (v.dead) S.byId.delete(k); }

  // phases: all required objectives → extract; at extraction with everyone standing (or all who are up) → won
  const required = S.objectives.filter(o => !o.optional);
  if (S.phase === 'fight' && required.length && required.every(o => o.done)) {
    S.phase = S.def.extract ? 'extract' : 'won'; S.events.push({ type: 'phase', phase: S.phase });
  }
  if (S.phase === 'extract') {
    const ex = S.def.extract, up = S.mechs.filter(m => !m.down && m.team !== 'enemy');
    if (up.length && up.every(m => Math.hypot(m.x - ex.x, m.z - ex.z) < ex.r)) { S.phase = 'won'; S.events.push({ type: 'phase', phase: 'won' }); }
  }
  if ((S.phase === 'fight' || S.phase === 'extract') && S.mechs.some(m => m.team !== 'enemy') && S.mechs.every(m => m.team === 'enemy' || m.down && m.downT > 1.5)) {
    S.phase = 'failed'; S.events.push({ type: 'phase', phase: 'failed' });
  }
  if ((S.phase === 'won' || S.phase === 'failed') && !S.result) S.result = gradeOf(S);
  return S.events;
}
