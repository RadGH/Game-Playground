// A mech's body in a mission: walking, boosting, quick boosts, jumping and hovering, energy, heat, armour.
// Legs face where it moves; the upper body turns toward the aim on its own. Pure: inputs in, state out.
//
// stats (from the build's parts — see loadout.js): { hp, armour, speedMul, boostMul, accelMul, energyMax, regenMul,
//   heatMax, coolMul, jumpMul, hoverMul, qbMul, qbCostMul, turnMul, legs: 'biped'|'reverse'|'quad'|'treads'|'hover',
//   radius, overweight (0 = within carry limit, 0.2 = 20% over) }

import { STATUS } from './damage.js';
const SLOW_MUL = STATUS.slow.mul;

export const DEFAULT_STATS = {
  hp: 1000, armour: 40, speedMul: 1, boostMul: 1, accelMul: 1, energyMax: 0, regenMul: 1, heatMax: 0, coolMul: 1,
  jumpMul: 1, hoverMul: 1, qbMul: 1, qbCostMul: 1, turnMul: 1, legs: 'biped', radius: 0.2, overweight: 0, critChance: 0,
  lockTime: 0.6, lockCount: 4, resist: {},
};

/** What each leg type changes, on top of the part's own numbers (PLAN §0: leg types change how you move). */
export const LEG_TRAITS = {
  biped: { label: 'Two legs' },
  reverse: { label: 'Reverse-joint', jump: 1.45, hover: 0.9 },
  quad: { label: 'Four legs', speed: 0.85, steadyFire: true, jump: 0.7 },
  treads: { label: 'Treads', speed: 0.9, jump: 0, hover: 0, boost: 0.85, armour: 1.3 },
  hover: { label: 'Hover', speed: 1.1, accel: 0.55, overWater: true, jump: 0.6, hover: 1.3 },
};

export function makeMech({ id, team = 'player', x, z, stats = {}, weapons = [], name = '', paint = null }) {
  const s = { ...DEFAULT_STATS, ...stats };
  return {
    id, team, name, paint, x, z, y: 0, vx: 0, vz: 0, vy: 0, r: s.radius, stats: s,
    face: -Math.PI / 4, aim: -Math.PI / 4,
    hp: s.hp, hpMax: s.hp, armour: s.armour, resist: s.resist,
    energy: null, heat: 0, stall: 0, regenWait: 0, overheated: false,
    qbT: 0, qbCd: 0, qbX: 0, qbZ: 0, onGround: true, boosting: false, hovering: false, airT: 0,
    down: false, downT: 0, reviveT: 0, status: {},
    weapons,                // [{ slot, spec, cd, ammo, heat… }] — weapons.js fills these
    anim: 'idle', animT: 0, hurtT: 0, kills: 0, dealt: 0, taken: 0,
  };
}

const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);
const turnToward = (a, b, rate, dt) => { let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; const s = rate * dt; return a + Math.max(-s, Math.min(s, d)); };

/** Energy and heat limits after parts (the base tuning number + the part's). */
export const energyMaxOf = (m, T) => T.energyMax + m.stats.energyMax;
export const heatMaxOf = (m, T) => T.heatMax + m.stats.heatMax;

/** Spend energy; false (and nothing spent) if there isn't enough. Hitting zero stalls boosting for a moment. */
export function spendEnergy(m, n, T, drain = false) {
  if (m.energy == null) m.energy = energyMaxOf(m, T);
  if (n <= 0) return true;
  if (m.stall > 0) return false;
  if (m.energy < n) {                       // a held drain (boost, hover) runs the bar dry and stalls; a one-off cost just fails
    if (!drain) return false;
    m.energy = 0; m.stall = T.stallTime; m.regenWait = T.energyRegenDelay; return false;
  }
  m.energy -= n; m.regenWait = T.energyRegenDelay;
  if (m.energy <= 0.001) { m.energy = 0; m.stall = T.stallTime; }
  return true;
}
export function addHeat(m, n, T) {
  m.heat = Math.min(heatMaxOf(m, T) * 1.1, m.heat + n);
  if (m.heat >= heatMaxOf(m, T)) m.overheated = true;
}

/**
 * One step. inp: { mx, mz: wanted move in world x/z (length 0..1, already turned so W = screen north),
 *   ax, az: aim point in world, boost, qb (pressed this step), jump (held), jumpPressed }
 * world: { groundAt(x, z), pushOut(body, r), gravity? }. Pushes events (qb, jump, land, overheat, stall) to `ev`.
 * world.gravity (round 5, the moon): share of normal gravity, default 1 = unchanged. Below 1 a frame jumps higher,
 * falls slower, hovers on less energy and keeps more momentum off a quick boost (less grip on loose dust).
 */
export function stepMech(m, inp, dt, T, world, ev = []) {
  if (m.energy == null) m.energy = energyMaxOf(m, T);
  const S = m.stats, L = LEG_TRAITS[S.legs] || LEG_TRAITS.biped;
  const G = world.gravity ?? 1, gMod = G !== 1;                 // gMod: every gravity change sits behind this, so G = 1 runs the exact old maths
  if (m.down) { m.vx = approach(m.vx, 0, 6, dt); m.vz = approach(m.vz, 0, 6, dt); m.x += m.vx * dt; m.z += m.vz * dt; world.pushOut(m, m.r); m.downT += dt; m.anim = 'down'; return; }

  // timers
  m.qbCd = Math.max(0, m.qbCd - dt); m.stall = Math.max(0, m.stall - dt); m.regenWait = Math.max(0, m.regenWait - dt);
  m.hurtT = Math.max(0, m.hurtT - dt);
  const stunned = (m.status?.shock || 0) > 0;
  const heavy = 1 / (1 + Math.max(0, S.overweight) * 1.5);        // over the carry limit = sluggish, never blocked
  const hot = m.overheated ? T.overheatSlow : 1;
  const gas = (m.status?.slow || 0) > 0 ? SLOW_MUL : 1;            // round 5: inside spore gas (and 2 s after) — damage.js STATUS.slow

  // move intent
  let mx = stunned ? 0 : inp.mx || 0, mz = stunned ? 0 : inp.mz || 0;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const wantBoost = !!inp.boost && ml > 0.1 && m.stall <= 0 && S.boostMul > 0;
  let boosting = false;
  if (wantBoost) boosting = spendEnergy(m, T.boostEnergy * (S.boostCostMul || 1) * dt, T, true);
  m.boosting = boosting;
  if (boosting) addHeat(m, T.boostHeat * dt, T);

  const speed = (boosting ? T.boostSpeed * S.boostMul * (L.boost ?? 1) : T.walkSpeed * S.speedMul * (L.speed ?? 1)) * heavy * hot * gas;
  let grip = (boosting ? T.boostAccel : T.walkAccel) * S.accelMul * (L.accel ?? 1) * (m.onGround ? 1 : 0.45);
  if (gMod) grip *= 0.5 + 0.5 * G;                                // low gravity: less traction, a quick boost carries further

  // quick boost: a sharp burst the way you push (or straight back from the aim when standing still)
  if (inp.qb && !stunned && m.qbCd <= 0 && m.stall <= 0 && S.qbMul > 0) {
    let qx = mx, qz = mz; if (ml < 0.1) { qx = -Math.cos(m.aim); qz = -Math.sin(m.aim); }
    const ql = Math.hypot(qx, qz) || 1;
    if (spendEnergy(m, T.quickBoostEnergy * S.qbCostMul, T)) {
      m.qbX = qx / ql; m.qbZ = qz / ql; m.qbT = T.quickBoostTime; m.qbCd = T.quickBoostCooldown * (S.qbCooldown ? S.qbCooldown / 0.6 : 1);
      addHeat(m, T.quickBoostHeat, T);
      ev.push({ type: 'qb', id: m.id, x: m.x, z: m.z, dx: m.qbX, dz: m.qbZ });
    }
  }
  if (m.qbT > 0) {
    const k = T.quickBoostSpeed * S.qbMul * hot;
    m.vx = m.qbX * k; m.vz = m.qbZ * k; m.qbT = Math.max(0, m.qbT - dt);
  } else {
    m.vx = approach(m.vx, mx * speed, grip, dt); m.vz = approach(m.vz, mz * speed, grip, dt);
  }

  // jump + hover
  const jumpMul = S.jumpMul * (L.jump ?? 1);
  if (inp.jumpPressed && m.onGround && jumpMul > 0 && !stunned) {
    m.vy = T.jumpSpeed * jumpMul; m.onGround = false; m.airT = 0; ev.push({ type: 'jump', id: m.id, x: m.x, z: m.z });
  }
  m.hovering = false;
  if (!m.onGround) {
    m.airT += dt;
    let ay = gMod ? -T.gravity * G : -T.gravity;
    const hoverMul = S.hoverMul * (L.hover ?? 1);
    const hoverCost = gMod ? T.hoverEnergy * (0.6 + 0.4 * G) : T.hoverEnergy;       // less to hold up: hovers longer on a bar
    if (inp.jump && m.airT > 0.18 && hoverMul > 0 && m.stall <= 0 && spendEnergy(m, hoverCost * dt, T, true)) {
      ay += gMod ? T.hoverLift * hoverMul * G : T.hoverLift * hoverMul; m.hovering = true; addHeat(m, T.boostHeat * 0.6 * dt, T);
      const sink = gMod ? -0.4 * G : -0.4;                         // and sinks slower while it does
      if (m.vy < sink) m.vy = approach(m.vy, sink, 4, dt);
    }
    m.vy += ay * dt;
  }

  // move, then collide (feet height decides whether a roof is under us or a wall in front)
  m.x += m.vx * dt; m.z += m.vz * dt; m.y += m.vy * dt;
  world.pushOut(m, m.r);
  const g = world.groundAt(m.x, m.z);
  if (m.y <= g) {
    if (!m.onGround && m.airT > 0.05) ev.push({ type: 'land', id: m.id, x: m.x, z: m.z, hard: m.vy < -2.5 });
    m.y = g; m.vy = 0; m.onGround = true;
  } else if (m.onGround && m.y > g + 0.02) { m.onGround = false; m.airT = 0.2; m.vy = Math.min(m.vy, 0); }   // walked off a roof

  // energy recharge, cooling, overheat damage
  const eMax = energyMaxOf(m, T), hMax = heatMaxOf(m, T);
  if (m.regenWait <= 0 && !boosting && !m.hovering) m.energy = Math.min(eMax, m.energy + T.energyRegen * S.regenMul * dt);
  if (m.stall > 0 && m.energy > eMax * 0.25) m.stall = 0;
  const wasHot = m.overheated;
  m.heat = Math.max(0, m.heat - T.heatCool * S.coolMul * dt * (m.overheated ? 1.2 : 1));
  if (m.overheated) {
    m.hp = Math.max(1, m.hp - m.hpMax * (T.overheatDamage / 100) * dt);
    if (m.heat <= hMax * T.overheatRecover) m.overheated = false;
  }
  if (!wasHot && m.overheated) ev.push({ type: 'overheat', id: m.id });

  // facing: legs turn toward movement, the upper body toward the aim
  const sp = Math.hypot(m.vx, m.vz);
  if (sp > 0.15) m.face = turnToward(m.face, Math.atan2(m.vz, m.vx), T.turnRate * S.turnMul, dt);
  if (inp.ax != null && !stunned) m.aim = turnToward(m.aim, Math.atan2(inp.az - m.z, inp.ax - m.x), T.aimRate * S.turnMul, dt);

  // animation name for the renderer (Mech Kit leg animations)
  const prev = m.anim;
  m.anim = m.qbT > 0 ? 'quickboost' : !m.onGround ? (m.hovering ? 'hover' : 'jump') : boosting ? 'boost' : sp > 0.12 ? 'walk' : 'idle';
  m.animT = prev === m.anim ? m.animT + dt * (m.anim === 'walk' ? Math.max(0.6, sp / (T.walkSpeed || 1)) : 1) : 0;
}

/** Damage a mech (after its own armour/resist). Returns the real amount taken. */
export function hurtMech(m, amount, ev, from = null) {
  if (m.down || amount <= 0) return 0;
  const n = Math.min(m.hp, amount); m.hp -= n; m.taken += n; m.hurtT = 0.25;
  if (m.hp <= 0) { m.down = true; m.downT = 0; m.timesDown = (m.timesDown || 0) + 1; m.reviveT = 0; ev.push({ type: 'down', id: m.id, x: m.x, z: m.z, by: from }); }
  return n;
}
