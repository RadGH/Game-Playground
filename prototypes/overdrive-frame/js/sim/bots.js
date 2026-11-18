// Bot teammates (R4): frames the computer flies beside you — solo ("Bring bots") and to fill empty co-op seats, or to
// hold a dropped player's frame until they come back. botInputs() fills inputs[pid] for every S.players entry with
// `bot: true`, in the same shape as Controls.read(), and the bot's frame then goes through the very same stepMech and
// weapons a player's does — so it runs out of energy, overheats and reloads exactly like you.
//
// What a bot does, in order of importance each step:
//   1. get out of marked danger (artillery / acid circles, a boss's claw arc or charge lane), quick-boost off a shot
//      that is about to hit it;
//   2. pick a place to be: revive a downed teammate nearby → go to the extraction (only once its leader heads there)
//      → help with the job (plant a mast near the leader, guard the escort trucks, bring the data core home if no
//      human can) → otherwise stay beside its leader (the nearest standing human), catching up with a boost;
//   3. fight from there: shoot the best visible enemy in reach (tagged targets, what the leader is shooting at),
//      keep range and circle it, but never wander off the leash;
//   4. respect the frame: keep an energy reserve for a dodge, stop shooting heat weapons near the limit and let it cool.
// Per-bot memory lives on the mech as m.bot. Pure: S.rng only, no clock.
import { energyMaxOf, heatMaxOf } from './mech.js';
import { angleDiff } from './weapons.js';
import { blocked, rayLot } from './world.js';
import { makeFlow, updateFlow, flowDir } from './flow.js';

/** Twelve original callsigns for the computer's pilots. */
export const BOT_NAMES = ['Tally', 'Rivet', 'Halyard', 'Bramble', 'Quill', 'Sprocket', 'Dunlin', 'Corvo', 'Mica', 'Ostler', 'Tamber', 'Wicket'];
export const botName = i => BOT_NAMES[((i % BOT_NAMES.length) + BOT_NAMES.length) % BOT_NAMES.length];

// Paint schemes from data/paints.json (rank 0, so nothing locked) — each bot's frame wears a different one, so you can
// tell them from your own factory-coloured frame at a glance.
const BOT_PAINTS = [
  { primary: '#59606b', secondary: '#2a2e35', accent: '#e2a91c', glow: null },        // gunmetal
  { primary: '#e8eef4', secondary: '#8a96a4', accent: '#2f8fd8', glow: '#9fe8ff' },   // arctic
  { primary: '#f2c21b', secondary: '#232323', accent: '#e8e8e8', glow: '#ffb02e' },   // hazard
  { primary: '#24282f', secondary: '#14161a', accent: '#3a4250', glow: '#ff3b3b' },   // night op
];

// Same picks as starters.js: the maker's first parts, two one-hand arm guns and a shoulder launcher.
const SKIP_ARM = ['shield', 'repair', 'laser-blade', 'pile', 'saw'];
const SHOULDER_OK = ['missile-pod', 'swarm-pod', 'mortar'];

/**
 * The frame bot number i flies: maker MAKERS[i % 4]'s starter build (parts.json order), arm guns offset by i so two
 * bots of one maker don't carry the same pair, and a paint scheme that isn't factory colours.
 * PARTS = parts.json ({ parts }), MAKERS = makers.json's list (or the whole file).
 */
export function botBuild(PARTS, MAKERS, i = 0) {
  const makers = Array.isArray(MAKERS) ? MAKERS : MAKERS.makers, maker = makers[i % makers.length].id;
  const list = PARTS.parts;
  const first = slot => list.find(p => p.maker === maker && p.slot === slot && (p.tier || 1) === 1 && (slot !== 'legs' || p.type === 'biped'))?.id
    || list.find(p => p.maker === maker && p.slot === slot)?.id;
  const own = l => l.filter(p => p.maker === maker).concat(l.filter(p => p.maker !== maker));
  const arms = own(list.filter(p => p.slot === 'weapon' && p.mount === 'arm' && p.hand === 'one' && !SKIP_ARM.includes(p.kind)));
  const shoulders = own(list.filter(p => p.slot === 'weapon' && p.mount === 'shoulder' && SHOULDER_OK.includes(p.kind)));
  const k = Math.floor(i / makers.length);                 // the 5th bot (2nd round of makers) gets the next pair of guns
  const a1 = arms[(k * 2) % arms.length], a2 = arms[(k * 2 + 1) % arms.length];
  return { head: first('head'), core: first('core'), arms: first('arms'), legs: first('legs'), booster: first('booster'), generator: first('generator'),
    cooling: first('cooling'), cpu: first('cpu'), weapons: [a1.id, a2.id, shoulders[k % shoulders.length].id, null], paint: { ...BOT_PAINTS[i % BOT_PAINTS.length] } };
}

/** Fill in the inputs of every bot player for this step (human entries are never touched). */
export function botInputs(S, inputs, dt) {
  for (const p of S.players) if (p.bot) inputs[p.id] = botInput(S, p.mech, dt);
}

// ---- knobs (plain rules of thumb, not balance numbers) ----
const LEASH = 4.5;          // tiles: how far from its leader a bot is happy to fight
const CATCH_UP = 7;         // tiles: further than this → boost back
const REVIVE_REACH = 10;    // tiles: a downed teammate this close gets picked up
const HEAT_STOP = 0.8, HEAT_GO = 0.45;     // stop heat weapons at 80 %, start again under 45 %

const idleInput = () => ({ mx: 0, mz: 0, fire: [false, false, false, false], boost: false, jump: false, jumpPressed: false, qb: false, lockOnPressed: false });

/** Open ground for a mech (not inside a standing building, inside the map). */
const open = (S, x, z) => {
  const W = S.world; if (x < 0.35 || z < 0.35 || x > W.w - 0.35 || z > W.h - 0.35) return false;
  return !blocked(W, x, z, 0);
};

/** The way to walk from the mech to point p: straight when the street is clear, else along a flow field (cached). */
function wayTo(S, m, B, p) {
  const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz) || 1e-6;
  if (d < 1.2 || !rayLot(S.world, m.x, m.z, p.x, p.z, 0.05) && !rayLot(S.world, m.x + dz / d * 0.22, m.z - dx / d * 0.22, p.x, p.z, 0.05) && !rayLot(S.world, m.x - dz / d * 0.22, m.z + dx / d * 0.22, p.x, p.z, 0.05)) return [dx / d, dz / d];
  const tile = Math.floor(p.z) * S.world.w + Math.floor(p.x);
  if (!B.flow) B.flow = makeFlow(S.world);
  if ((B.flowTile !== tile && B.flowT <= 0) || B.flowTile == null || B.flowT < -3) {
    updateFlow(B.flow, S.world, [p]); B.flowTile = tile; B.flowT = 0.6;
  }
  return flowDir(B.flow, m.x, m.z) || [dx / d, dz / d];
}

/** Can this weapon shoot right now (ammo, magazine, not reloading)? */
const ready = w => w.reloadT <= 0 && (w.inMag == null || w.inMag > 0) && (w.ammo == null || w.ammo > 0);

/** A shooting kind: shots fly straight along the aim (a teammate in the way would be in the line of fire). */
const STRAIGHT = new Set(['bullet', 'pellets', 'rail', 'beam', 'flame', 'plasma', 'chain']);

/**
 * One bot's hands on the controls. Same shape as Controls.read():
 * { mx, mz, ax, az, fire: [L, R, shoulderL, shoulderR], boost, jump, jumpPressed, qb, lockOnPressed }.
 */
export function botInput(S, m, dt) {
  const T = S.T;
  const B = m.bot ||= { strafe: S.rng.next() < 0.5 ? 1 : -1, flipT: 1 + S.rng.next() * 2, dodgeCd: 0, cooling: false, flow: null, flowTile: null, flowT: 0,
    stuckT: 0, unstickT: 0, unstick: [0, 0], lastX: m.x, lastZ: m.z, hold: 0, retarget: 0, target: null, lexd: [], lexT: 0 };
  B.flowT -= dt; B.dodgeCd = Math.max(0, B.dodgeCd - dt); B.retarget -= dt;
  const inp = idleInput();
  inp.fire = m.weapons.map(() => false); while (inp.fire.length < 4) inp.fire.push(false);
  if (m.down) return inp;

  // ---- who's who ----
  const mates = S.players.map(p => p.mech).filter(o => o !== m && o.team === m.team);
  const humans = S.players.filter(p => !p.bot && p.mech.team === m.team).map(p => p.mech);
  const humansUp = humans.filter(h => !h.down);
  let leader = null, ld = Infinity;
  for (const h of humansUp) { const d = Math.hypot(h.x - m.x, h.z - m.z); if (d < ld) { ld = d; leader = h; } }
  const myIndex = S.players.filter(p => p.bot).findIndex(p => p.mech === m);

  // orbital drop: steer the landing next to the leader
  if (S.phase === 'drop') {
    if (S.def.orbital && leader) { const dx = leader.x + 1 - m.x, dz = leader.z + 1 - m.z, d = Math.hypot(dx, dz); if (d > 0.4) { inp.mx = dx / d; inp.mz = dz / d; } }
    return inp;
  }

  const eMax = energyMaxOf(m, T), energy = m.energy ?? eMax, eFrac = energy / eMax;
  const hMax = heatMaxOf(m, T), hFrac = m.heat / hMax;
  const qbCost = T.quickBoostEnergy * (m.stats.qbCostMul || 1);
  const reserve = Math.min(eMax * 0.45, qbCost * 1.3);          // always keep one dodge in the tank
  if (hFrac > HEAT_STOP || m.overheated) B.cooling = true; else if (hFrac < HEAT_GO) B.cooling = false;
  const hurt = m.hp < m.hpMax * 0.3;

  // ---- where to be (goal point + how close counts as there) ----
  let goal = null, goalR = 0.4, leash = LEASH, mustGo = false, why = 'follow';
  const ex = S.def.extract;
  // 1. a downed teammate nearby (any distance when no human is standing — they're the mission)
  if (!hurt || !humansUp.length) {
    let best = null, bd = Infinity;
    for (const o of mates) {
      if (!o.down || o.dead) continue;
      const d = Math.hypot(o.x - m.x, o.z - m.z);
      if ((d < REVIVE_REACH || !humansUp.length && humans.includes(o)) && d < bd) { bd = d; best = o; }
    }
    if (best) { goal = { x: best.x, z: best.z }; goalR = 0.35; mustGo = true; why = 'revive'; }
  }
  // 2. extraction: only once the leader is heading there (or every human is inside), never before
  if (!goal && S.phase === 'extract' && ex) {
    B.lexT -= dt;
    if (leader && B.lexT <= 0) { B.lexT = 0.5; B.lexd.push(Math.hypot(leader.x - ex.x, leader.z - ex.z)); if (B.lexd.length > 4) B.lexd.shift(); }
    const inside = h => Math.hypot(h.x - ex.x, h.z - ex.z) < ex.r;
    const lexd = leader ? Math.hypot(leader.x - ex.x, leader.z - ex.z) : Infinity;
    const heading = leader && (lexd < ex.r + 3 || B.lexd.length >= 3 && B.lexd[B.lexd.length - 1] < B.lexd[0] - 0.6);
    if (heading || humansUp.length && humansUp.every(inside) || !humansUp.length) {
      // a spot inside the circle, spread per bot so they don't stack
      const a = myIndex * 2.1 + 0.6, rr = ex.r * 0.45;
      goal = { x: ex.x + Math.cos(a) * rr, z: ex.z + Math.sin(a) * rr }; goalR = ex.r * 0.3; why = 'extract';
      mustGo = lexd < ex.r + 1.5 || !humansUp.length || humansUp.every(inside);
      leash = heading && !mustGo ? Math.max(LEASH, lexd + 1) : LEASH;
    }
  }
  // 3. the job: data core, masts, escort trucks
  const O = S.ops;
  if (!goal && O?.core && !O.core.home && ex) {
    const c = O.core;
    if (c.carrier === m.id) { goal = { x: ex.x, z: ex.z }; goalR = ex.r * 0.5; mustGo = true; why = 'core-home'; }
    else if (!c.carrier && !humansUp.length) { goal = { x: c.x, z: c.z }; goalR = 0.3; mustGo = true; why = 'core-pick'; }
  }
  if (!goal && leader && O?.plants?.length) {
    // the open mast nearest the leader, when the leader is near it (busy fighting there or planting it)
    let best = null, bd = Infinity;
    for (const pl of O.plants) { if (pl.done) continue; const d = Math.hypot(pl.x - leader.x, pl.z - leader.z); if (d < 6 && d < bd) { bd = d; best = pl; } }
    if (best) { goal = { x: best.x, z: best.z }; goalR = 0.35; mustGo = true; why = 'plant'; }
  }
  let home = leader ? { x: leader.x, z: leader.z } : null;
  if (!goal && leader && S.allies?.length) {
    // escort: hang between the leader and the truck nearest them
    let best = null, bd = Infinity;
    for (const a of S.allies) { if (a.down || a.arrived) continue; const d = Math.hypot(a.x - leader.x, a.z - leader.z); if (d < bd) { bd = d; best = a; } }
    if (best && bd < 9) home = { x: (leader.x + best.x * 2) / 3, z: (leader.z + best.z * 2) / 3 };
  }
  if (!home) home = ex && (S.phase === 'extract' || !S.def.start?.length) ? { x: ex.x, z: ex.z } : { ...(S.def.start?.[0] || { x: m.x, z: m.z }) };
  // keep off the data core while a human can carry it (stepping on it would pick it up)
  const coreFree = O?.core && !O.core.home && !O.core.carrier && humansUp.length ? O.core : null;

  // ---- what to shoot ----
  if (B.retarget <= 0 || !B.target || !alive(S, B.target)) { B.retarget = 0.25; B.target = pickTarget(S, m, leader, mates); }
  const tgt = B.target && alive(S, B.target) ? S.byId.get(B.target) : null;
  const tdist = tgt ? Math.hypot(tgt.x - m.x, tgt.z - m.z) : Infinity;

  // ---- movement ----
  let mx = 0, mz = 0, boost = false, qb = false;
  if (goal) {
    const d = Math.hypot(goal.x - m.x, goal.z - m.z);
    const dh = Math.hypot(home.x - m.x, home.z - m.z);
    if (mustGo || dh < leash + 2) {
      if (d > goalR) { [mx, mz] = wayTo(S, m, B, goal); const k = Math.min(1, d / 0.8); mx *= k; mz *= k; boost = d > 3 && eFrac > reserve / eMax + 0.15; }
    } else goal = null;      // too far from the leader: following comes first
  }
  if (!goal) {
    const dh = Math.hypot(home.x - m.x, home.z - m.z);
    // a formation spot beside the leader (each bot its own side)
    const a = myIndex * 2.4 + 2.2, spot = { x: home.x + Math.cos(a) * 1.3, z: home.z + Math.sin(a) * 1.3 };
    if (!open(S, spot.x, spot.z)) { spot.x = home.x; spot.z = home.z; }
    if (dh > leash) {
      [mx, mz] = wayTo(S, m, B, dh > leash + 1.5 ? home : spot);
      boost = dh > CATCH_UP ? eFrac > reserve / eMax + 0.05 : dh > leash + 1.5 && eFrac > 0.6;
    } else if (tgt) {
      // fight: keep the weapons' range, circle the target, lean back toward the leader the further out it is
      const want = Math.max(2.2, Math.min(6, B.want ?? (B.want = preferredRange(m)))) * (hurt ? 1.3 : 1);
      const ux = (tgt.x - m.x) / (tdist || 1), uz = (tgt.z - m.z) / (tdist || 1);
      const k = tdist > want + 0.6 ? 0.6 : tdist < want - 0.6 ? -0.9 : 0;
      B.flipT -= dt; if (B.flipT <= 0) { B.flipT = 1.4 + S.rng.next() * 2.2; if (S.rng.next() < 0.5) B.strafe = -B.strafe; }
      mx = ux * k - uz * B.strafe * 0.7; mz = uz * k + ux * B.strafe * 0.7;
      const pull = Math.max(0, dh - leash * 0.5) / (leash * 0.5);       // 0 near the leader, 1 at the leash
      if (pull > 0) { const hx = (home.x - m.x) / (dh || 1), hz = (home.z - m.z) / (dh || 1); mx += hx * pull * 1.2; mz += hz * pull * 1.2; }
      // too many enemies right on top of it: back off toward the leader with a boost
      if (tdist < 1.1 && eFrac > reserve / eMax + 0.2) boost = true;
    } else {
      const ds = Math.hypot(spot.x - m.x, spot.z - m.z);
      if (ds > 0.8) { [mx, mz] = wayTo(S, m, B, spot); const k = Math.min(1, ds / 1.5); mx *= k; mz *= k; }
    }
  }
  // stay out of each other's way (teammates, trucks)
  for (const o of mates) { if (o.down) continue; const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz); if (d < 0.65 && d > 1e-4) { mx += dx / d * (0.65 - d) * 2; mz += dz / d * (0.65 - d) * 2; } }
  if (coreFree) { const dx = m.x - coreFree.x, dz = m.z - coreFree.z, d = Math.hypot(dx, dz); if (d < 0.9) { mx += dx / (d || 1) * 1.5; mz += dz / (d || 1) * 1.5; } }

  // ---- danger: marked circles, boss attacks, shots about to land ----
  let danger = false;
  for (const k of S.strikes) {
    if (k.team === m.team) continue;
    const dx = m.x - k.x, dz = m.z - k.z, d = Math.hypot(dx, dz);
    if (d < k.r + m.r + 0.25) { danger = true; const e = d > 1e-3 ? [dx / d, dz / d] : [B.strafe, 0]; mx = e[0]; mz = e[1]; boost = eFrac > 0.12; if (k.t < 0.45 && d < k.r && eFrac > 0.1) qb = true; }
  }
  for (const e of S.enemies) {
    const A = e.atk; if (!A || e.dead) continue;
    const K = S.kinds[e.kind] || {};
    const dx = m.x - e.x, dz = m.z - e.z, d = Math.hypot(dx, dz);
    if (A.kind === 'claw' && K.claw && d < K.claw.range + m.r + 0.6 && Math.abs(angleDiff(Math.atan2(dz, dx), A.dir)) < (K.claw.arc || 2) / 2 + 0.3) { danger = true; mx = dx / (d || 1); mz = dz / (d || 1); boost = eFrac > 0.12; }
    if ((A.kind === 'charge' || A.kind === 'dash') && d < (A.len || 6) + 2) {
      const cx = Math.cos(A.dir), cz = Math.sin(A.dir), along = dx * cx + dz * cz, side = -dx * cz + dz * cx;
      if (along > -0.5 && along < (A.len || 6) + 1 && Math.abs(side) < (A.w || 0.8) / 2 + m.r + 0.35) {
        danger = true; const sg = side >= 0 ? 1 : -1; mx = -cz * sg; mz = cx * sg; boost = eFrac > 0.12;
        if (A.kind === 'dash' && eFrac > 0.1) qb = true;
      }
    }
  }
  if (B.dodgeCd <= 0 && eFrac > (reserve + qbCost) / eMax * 0.8) for (const s of S.shots) {
    if (s.team === m.team || s.lob) continue;
    const rx = m.x - s.x, rz = m.z - s.z, d = Math.hypot(rx, rz); if (d > 1.8 || d < 0.02) continue;
    const sp = Math.hypot(s.vx, s.vz) || 1, along = (rx * s.vx + rz * s.vz) / sp, miss = Math.abs((-s.vz * rx + s.vx * rz) / sp);
    if (along < 0 || miss > m.r + 0.15) continue;                       // flying away, or going to miss anyway
    if ((s.dmg || 0) < m.hpMax * 0.03 && s.kind !== 'missile') continue; // not worth the energy
    B.dodgeCd = 0.9;
    const side = (-s.vz * rx + s.vx * rz) >= 0 ? 1 : -1; mx = -s.vz / sp * side; mz = s.vx / sp * side; qb = true; danger = true;
    break;
  }

  // ---- steer around buildings: swap a blocked way for the open one nearest to it ----
  const wl = Math.hypot(mx, mz);
  if (wl > 0.05 && !open(S, m.x + mx / wl * 0.6, m.z + mz / wl * 0.6)) {
    let best = null, bs = -Infinity;
    for (let a = 0; a < 16; a++) { const ax = Math.cos(a * Math.PI / 8), az = Math.sin(a * Math.PI / 8); if (!open(S, m.x + ax * 0.6, m.z + az * 0.6)) continue; const sc = (ax * mx + az * mz) / wl; if (sc > bs) { bs = sc; best = [ax, az]; } }
    if (best) { mx = best[0] * Math.min(1, wl); mz = best[1] * Math.min(1, wl); }
  }
  // stuck (pushing but not moving): try a random way for a moment, hop if the legs can
  const moved = Math.hypot(m.x - B.lastX, m.z - B.lastZ); B.lastX = m.x; B.lastZ = m.z;
  if (B.unstickT > 0) { B.unstickT -= dt; if (!danger) { mx = B.unstick[0]; mz = B.unstick[1]; } }
  else if (Math.hypot(mx, mz) > 0.4 && moved < 0.3 * dt) {
    B.stuckT += dt;
    if (B.stuckT > 1.2) { B.stuckT = 0; const a = S.rng.next() * Math.PI * 2; B.unstick = [Math.cos(a), Math.sin(a)]; B.unstickT = 0.6; if (eFrac > 0.5) { inp.jumpPressed = true; B.hold = 0.35; } }
  } else B.stuckT = Math.max(0, B.stuckT - dt);
  if (B.hold > 0) { B.hold -= dt; inp.jump = true; }

  // never boost into the dodge reserve (a held boost would run the bar dry and stall)
  if (boost && !danger && energy < reserve + eMax * 0.1) boost = false;
  if (m.stall > 0) boost = false;
  inp.mx = mx; inp.mz = mz; inp.boost = boost; inp.qb = qb && m.qbCd <= 0;

  // ---- aim and fire ----
  const healTarget = repairTarget(S, m, mates, tdist);
  let ax, az;
  if (healTarget) { ax = healTarget.x; az = healTarget.z; }
  else if (tgt) {
    const lead = Math.min(1.2, tdist / (B.shotSp ?? (B.shotSp = shotSpeed(m))));
    ax = tgt.x + (tgt.vx || 0) * lead * 0.8; az = tgt.z + (tgt.vz || 0) * lead * 0.8;
  } else if (Math.hypot(mx, mz) > 0.2) { ax = m.x + mx * 2; az = m.z + mz * 2; }
  else { ax = m.x + Math.cos(m.aim) * 2; az = m.z + Math.sin(m.aim) * 2; }
  inp.ax = ax; inp.az = az;
  const aimErr = Math.abs(angleDiff(Math.atan2(az - m.z, ax - m.x), m.aim));
  const see = tgt ? S.canSee(m, tgt) : false;
  const blockedByMate = tgt && mates.some(o => {
    if (o.down) return false;
    const rx = o.x - m.x, rz = o.z - m.z, along = (rx * (tgt.x - m.x) + rz * (tgt.z - m.z)) / (tdist || 1);
    return along > 0 && along < tdist && Math.abs((-rx * (tgt.z - m.z) + rz * (tgt.x - m.x)) / (tdist || 1)) < o.r + 0.12;
  });
  const near = tgt ? countNear(S, m, 3.5) : 0;
  m.weapons.forEach((w, i) => {
    const sp = w.spec; if (!sp || sp.kind === 'none') return;
    if (sp.kind === 'repair') { inp.fire[i] = !!healTarget && aimErr < 0.4 && ready(w) && energy - (sp.energy || 0) > reserve; return; }
    if (healTarget) return;                                   // aiming at a friend: don't shoot the guns at them
    if (sp.kind === 'shield') { inp.fire[i] = near > 0 && energy - (sp.energy || 0) > reserve + eMax * 0.15; return; }
    if (!tgt) { if (sp.charge && w.charge > 0) inp.fire[i] = false; return; }
    if (!ready(w)) return;
    if (sp.heat > 0 && (B.cooling || m.overheated || (m.heat + sp.heat) / hMax > 0.95)) return;
    if (sp.energy && energy - sp.energy < reserve) return;
    const reach = (sp.kind === 'blade' ? sp.range + (tgt.r || 0.15) : sp.range * 0.95 + (tgt.r || 0) * 0.5);
    if (tdist > reach) return;
    if (sp.kind === 'deploy') { inp.fire[i] = tdist < Math.min(sp.range, 6); return; }
    if (sp.kind === 'lob' && tdist < (sp.splash || 0.5) + 0.4) return;
    const homing = sp.kind === 'missile' && (w.locks?.length || sp.vertical);
    if (!see && !homing && sp.kind !== 'lob' && !tgt.flying) return;
    if (!homing && aimErr > (sp.kind === 'blade' ? 0.6 : 0.35)) return;
    if (STRAIGHT.has(sp.kind) && blockedByMate) return;
    if (sp.charge) { inp.fire[i] = w.charge < sp.charge; return; }   // hold to charge, let go when full
    inp.fire[i] = true;
  });
  return inp;
}

/** Is this id a live, shootable enemy? */
function alive(S, id) {
  const e = S.byId.get(id);
  return !!e && !e.dead && e.state !== 'warn' && !e.hidden && !e.down;
}

/** Longest reach of the frame's guns (blades, shields, repair and deployables don't count) → the range to fight at. */
function preferredRange(m) {
  const r = m.weapons.map(w => w.spec).filter(s => s && STRAIGHT.has(s.kind) || s?.kind === 'missile' || s?.kind === 'lob').map(s => s.range);
  if (!r.length) return 1.2;                                   // melee frame: get close
  r.sort((a, b) => a - b);
  return r[0] * 0.65;                                          // inside the shortest gun's reach, so everything lands
}
/** How fast its main gun's shots fly (for leading a moving target). */
function shotSpeed(m) {
  const s = m.weapons.map(w => w.spec).find(s => s && (s.kind === 'bullet' || s.kind === 'pellets' || s.kind === 'plasma'));
  return s?.speed || 16;
}
function countNear(S, m, r) { let n = 0; for (const e of S.candidates(m.x, m.z, r)) { if (e.team === m.team) continue; n++; if (n > 3) break; } return n; }

/**
 * The best enemy to shoot: close, visible, in reach — tagged targets (hunt / convoy) and what the leader is shooting at
 * count extra; bosses and aces are fine targets (the boss's parts are just the boss).
 */
function pickTarget(S, m, leader, mates) {
  const R = Math.max(4, ...m.weapons.map(w => (w.spec && w.spec.kind !== 'none' && w.spec.kind !== 'repair' && w.spec.kind !== 'shield' ? w.spec.range : 0))) + 1.5;
  const lAim = leader ? leader.aim : null, lStuck = leader?.lockOn || null;
  const kills = S.objectives.filter(o => !o.done && o.type === 'kill' && o.kind).map(o => o.kind);
  let best = null, bs = Infinity;
  for (const e of S.candidates(m.x, m.z, Math.min(R, 14))) {
    if (e.team === m.team || e.dummy && !S.def.kind) continue;
    const d = Math.hypot(e.x - m.x, e.z - m.z);
    let sc = d;
    if (!e.flying && !S.canSee(m, e)) sc += 5;
    if (e.tag === 'target' || e.convoy) sc -= 3;
    if (kills.includes(e.kind)) sc -= 1.5;
    if (e.boss || e.ace) sc -= 1;
    if (leader) {
      if (e.id === lStuck) sc -= 3;
      const ld = Math.hypot(e.x - leader.x, e.z - leader.z);
      if (ld < 10 && Math.abs(angleDiff(Math.atan2(e.z - leader.z, e.x - leader.x), lAim)) < 0.3) sc -= 2;
      if (ld < 2) sc -= 1.5;                                   // something on top of the leader: help them first
    }
    for (const o of mates) if (!o.down && o.team === m.team && Math.hypot(e.x - o.x, e.z - o.z) < 1.2) { sc -= 0.5; break; }
    if (sc < bs) { bs = sc; best = e; }
  }
  return best?.id || null;
}

/** A hurt teammate the repair beam can reach (only when no enemy is right on top of the bot). */
function repairTarget(S, m, mates, tdist) {
  const rep = m.weapons.find(w => w.spec?.kind === 'repair'); if (!rep || tdist < 1.5) return null;
  let best = null, bh = 0.65;
  for (const o of mates) {
    if (o.dead || Math.hypot(o.x - m.x, o.z - m.z) > rep.spec.range * 0.9) continue;
    const f = o.down ? 0 : o.hp / o.hpMax;
    if (f < bh) { bh = f; best = o; }
  }
  return best;
}
