// Perks in a mission (round 7): the repair kit, the active skill, and every frame RULE — from part mods (mods.js),
// Frame Tuning keystones (tuning.js) and frame-line set bonuses (frames.js), all gathered in st.rules by mechStats.
// One file runs them so each rule is applied in exactly one place (lessons rule 33). Pure and seeded; everything a
// player sees comes out as events (render/perks-art.js draws them; co-op clients get them like every other event).
//
// mission.js calls, per player frame and step: stepPerks (before the weapons) → perkEvents (after stepMech, for its qb /
// land / overheat events) → afterPerks (after the weapons); once a step: stepPerkWorld (wells, domes, decoys, fire
// trails). S.hurtPlayer asks perkTaken; damageEnemy asks paintedMul.
import { resolveHit } from './weapons.js';
import { STATUS } from './damage.js';
import { energyMaxOf, heatMaxOf } from './mech.js';
import { kitStats } from './kit.js';
import { SKILL_BY_ID } from './skills.js';

const tierScale = S => 1 + 0.4 * Math.max(0, (S.def?.tier || 1) - 1);

/** First step of a frame in a mission: its kit charges, its skill, its timers. */
export function initPerks(m) {
  const st = m.stats, R = st.rules || (st.rules = {});
  const K = kitStats(st.kitLevel || 1, R);
  m.kit = { n: K.charges, max: K.charges, heal: K.heal, cd: 0, cdMax: K.cd, cleanse: !!K.cleanse };
  const sk = SKILL_BY_ID[st.skill];
  const n = 1 + Math.round(R.skillCharges || 0);
  m.skill = sk ? { id: sk.id, cd: 0, cdMax: sk.cd * (1 - Math.min(0.5, R.skillCd || 0)), n, max: n } : null;
  m.baseDmg = st.dmgMulAll || 1; m.quietT = 0; m.reactT = 0; m.dashT = -9; m.stillT = 0; m.phaseT = 0; m.shieldT = 0; m.odrvT = 0; m.ddReady = !!R.doubledash; m.staticT = 0;
  m.perks = true;
}

/** Silent area damage (the event that shows it is the caller's). */
function area(S, m, x, z, r, dmg, dtype, status = 0, knock = 0) {
  const shot = { owner: m.id, team: 'player', dtype, dmg, crit: 0, status };
  let hit = 0;
  for (const e of S.candidates(x, z, r)) {
    const d = Math.hypot(e.x - x, e.z - z);
    const { amount, tier } = resolveHit(S, shot, e, S.T, 1 - 0.4 * Math.min(1, d / (r + (e.r || 0.2))));
    S.damageEnemy(e, amount, dtype, m.id, tier, e.x, e.z); hit++;
    if (knock && !e.boss && !e.structure) { const k = knock / Math.max(0.5, (e.r || 0.2) * 6); e.vx = (e.vx || 0) + (e.x - x) / (d || 1) * k; e.vz = (e.vz || 0) + (e.z - z) / (d || 1) * k; }
  }
  return hit;
}
const stun = (e, t) => { if (e.boss || e.dead) return; e.status ||= {}; e.status.shock = Math.max(e.status.shock || 0, t); };
/** Frozen solid when the cryo status exists (round 7 weapons), else held still like a shock. */
const freeze = (e, t) => { if (e.boss || e.dead) return; e.status ||= {}; if (STATUS.frozen) e.status.frozen = Math.max(e.status.frozen || 0, t); else e.status.shock = Math.max(e.status.shock || 0, t); };

/** Before the weapons: kit and skill buttons, timers, the damage multiplier of the moment, static shell, nanites. */
export function stepPerks(S, m, inp, dt) {
  if (!m.perks) initPerks(m);
  const R = m.stats.rules, T = S.T;
  m.kit.cd = Math.max(0, m.kit.cd - dt);
  if (m.skill && m.skill.n < m.skill.max) { m.skill.cd = Math.max(0, m.skill.cd - dt); if (m.skill.cd === 0) { m.skill.n++; if (m.skill.n < m.skill.max) m.skill.cd = m.skill.cdMax; } }
  m.reactT = Math.max(0, m.reactT - dt); m.phaseT = Math.max(0, m.phaseT - dt); m.shieldT = Math.max(0, m.shieldT - dt); m.quietT += dt;
  if (m.down) return;
  const fighting = S.phase === 'fight' || S.phase === 'extract';
  if (inp.kit) useKit(S, m);
  if (inp.skill && fighting) useSkill(S, m, inp);
  // the damage multiplier right now: anchor (standing still), momentum (just dashed), spill capacitor (full energy)
  m.stillT = Math.hypot(m.vx, m.vz) < 0.08 && m.onGround ? m.stillT + dt : 0;
  let mul = m.baseDmg;
  if (R.anchor && m.stillT > 1) mul *= 1 + R.anchor;
  if (R.momentum && S.time - m.dashT < 2) mul *= 1 + R.momentum;
  if (R.capacitor && m.energy >= energyMaxOf(m, T) * 0.98) mul *= 1 + R.capacitor;
  m.stats.dmgMulAll = mul;
  // static shell: whatever touches the frame takes electric damage, a quarter second at a time
  if (R.static && fighting) { m.staticT -= dt; if (m.staticT <= 0) { m.staticT = 0.25; if (area(S, m, m.x, m.z, m.r + 0.35, 120 * 0.25 * R.static * tierScale(S), 'electric', 0.2)) S.events.push({ type: 'static', id: m.id, x: m.x, z: m.z }); } }
  // Breaker's ram: boosting (or a quick boost) into an enemy hits it hard and throws it, once per enemy every 0.6 s
  if (R.ram && fighting && (m.boosting || m.qbT > 0)) {
    for (const e of S.candidates(m.x, m.z, m.r + 0.3)) {
      if ((e.rammedT || 0) > S.time) continue; e.rammedT = S.time + 0.6;
      const d = Math.hypot(e.x - m.x, e.z - m.z) || 1, shot = { owner: m.id, team: 'player', dtype: 'kinetic', dmg: 380 * R.ram * tierScale(S), crit: 0, status: 0 };
      const { amount, tier } = resolveHit(S, shot, e, S.T); S.damageEnemy(e, amount, 'kinetic', m.id, tier, e.x, e.z);
      if (!e.boss && !e.structure) { const k = 8 / Math.max(0.5, (e.r || 0.2) * 6); e.vx = (e.vx || 0) + (e.x - m.x) / d * k; e.vz = (e.vz || 0) + (e.z - m.z) / d * k; }
      S.events.push({ type: 'ram', id: m.id, x: e.x, z: e.z });
    }
  }
  // Sickle's reaper: the speed after a kill
  if (m.baseSpeed == null) m.baseSpeed = m.stats.speedMul;
  m.stats.speedMul = m.baseSpeed * (S.time < (m.reapT || 0) ? 1 + (R.reaper || 0) : 1);
  // nanite weave: repairs once nothing has hit for 4 s
  if (R.nanite && m.quietT > 4 && m.hp < m.hpMax) m.hp = Math.min(m.hpMax, m.hp + m.hpMax * R.nanite * dt);
  // double dash: one extra quick boost, ready again a second after the last
  if (R.doubledash && !m.ddReady && m.qbCd <= 0 && S.time - m.dashT > 1) m.ddReady = true;
  // overdrive (skill): weapons cycle faster
  if (m.odrvT > 0) { m.odrvT = Math.max(0, m.odrvT - dt); for (const w of m.weapons) if (w.cd > 0) w.cd -= dt * (SKILL_BY_ID.overdrive.rate - 1); m._heldHeat = m.heat; if (m.odrvT === 0) S.events.push({ type: 'skillEnd', id: m.id, kind: 'overdrive' }); } else m._heldHeat = null;
}
/** After the weapons: overdrive keeps the heat where it was. */
export function afterPerks(m) {
  if (m._heldHeat == null) return;
  m.heat = Math.min(m.heat, m._heldHeat); m.overheated = false;
}

/** The repair kit. Returns true when used. */
export function useKit(S, m) {
  const K = m.kit; if (!K || K.n <= 0 || K.cd > 0 || m.down || m.hp >= m.hpMax) return false;
  K.n--; K.cd = K.cdMax;
  const was = m.hp; m.hp = Math.min(m.hpMax, m.hp + m.hpMax * K.heal);
  if (K.cleanse && m.status) { m.status.burn = 0; m.status.slow = 0; m.burnDps = 0; }
  if (m.stats.rules.kitShield) m.shieldT = m.stats.rules.kitShield;
  if (m.stats.rules.kitShare) for (const o of S.mechs) if (o !== m && o.team === m.team && !o.down && !o.decoy && Math.hypot(o.x - m.x, o.z - m.z) < 3 && o.hp < o.hpMax) {   // Bloom: the kit reaches teammates
    const w0 = o.hp; o.hp = Math.min(o.hpMax, o.hp + o.hpMax * K.heal); S.events.push({ type: 'kit', id: o.id, x: o.x, z: o.z, amount: Math.round(o.hp - w0), by: m.id });
  }
  S.events.push({ type: 'kit', id: m.id, x: m.x, z: m.z, amount: Math.round(m.hp - was), left: K.n });
  return true;
}

/** The skill button. Returns true when it fired. */
export function useSkill(S, m, inp) {
  const s = m.skill; if (!s || s.n <= 0 || m.down) return false;
  const K = SKILL_BY_ID[s.id], R = m.stats.rules, pw = 1 + (R.skillPower || 0), reach = 1 + (R.skillPower ? 0.2 : 0), sc = tierScale(S) * pw;
  if (s.n === s.max) s.cd = s.cdMax;
  s.n--;
  const ax = inp.ax ?? m.x + Math.cos(m.aim), az = inp.az ?? m.z + Math.sin(m.aim);
  const toward = (max) => { const d = Math.hypot(ax - m.x, az - m.z), k = d > max ? max / d : 1; return { x: m.x + (ax - m.x) * k, z: m.z + (az - m.z) * k }; };
  const ev = { type: 'skill', id: m.id, kind: K.id, x: m.x, z: m.z };
  switch (K.id) {
    case 'repulse': { const r = K.r * reach; area(S, m, m.x, m.z, r, K.dmg * sc, 'energy', 0, 7); for (const e of S.candidates(m.x, m.z, r)) stun(e, K.stun); ev.r = r; break; }
    case 'nova': {
      const r = K.r * reach, list = [...S.candidates(m.x, m.z, r)].map(e => [e, Math.hypot(e.x - m.x, e.z - m.z)]).sort((a, b) => a[1] - b[1]).slice(0, K.n).map(([e]) => e);
      const shot = { owner: m.id, team: 'player', dtype: 'electric', dmg: K.dmg * sc, crit: 0, status: 0 };
      ev.pts = list.map(e => [Math.round(e.x * 10) / 10, Math.round(e.z * 10) / 10]);
      for (const e of list) { const { amount, tier } = resolveHit(S, shot, e, S.T); S.damageEnemy(e, amount, 'electric', m.id, tier, e.x, e.z); stun(e, K.stun); }
      ev.r = r; break;
    }
    case 'dome': { const d = { x: m.x, z: m.z, r: K.r * reach, t: K.t * pw, cut: K.cut, team: m.team, owner: m.id }; (S.domes ||= []).push(d); Object.assign(ev, { r: d.r, t: d.t }); break; }
    case 'well': { const p = toward(K.reach); const w = { x: p.x, z: p.z, r: K.r * reach, t: K.t * pw, pull: K.pull, dmg: K.dmg * sc, owner: m.id }; (S.wells ||= []).push(w); Object.assign(ev, { x: p.x, z: p.z, r: w.r, t: w.t }); break; }
    case 'decoy': {
      const a = m.aim, d = { id: 'decoy-' + m.id + '-' + Math.round(S.time * 10), decoy: true, owner: m.id, team: m.team, x: m.x + Math.cos(a) * 0.7, z: m.z + Math.sin(a) * 0.7, y: 0, vx: 0, vz: 0, r: m.r,
        hp: m.hpMax * 0.5, hpMax: m.hpMax * 0.5, down: false, t: K.t * pw, dmg: K.dmg * sc, burstR: K.r * reach, weapons: [], status: {}, stats: {}, resist: {}, armour: 0, taken: 0 };
      (S.decoys ||= []).push(d); Object.assign(ev, { x: d.x, z: d.z, t: d.t }); break;
    }
    case 'cryo': { const r = K.r * reach; area(S, m, m.x, m.z, r, K.dmg * sc, STATUS.frozen ? 'cryo' : 'energy'); for (const e of S.candidates(m.x, m.z, r)) freeze(e, K.t * pw); ev.r = r; ev.t = K.t * pw; break; }
    case 'lance': { const p = toward(K.reach); S.strikes.push({ t: K.delay, x: p.x, z: p.z, r: K.r * reach, owner: m.id, team: 'player', dtype: 'energy', dmg: K.dmg * sc, crit: 0, lance: true }); Object.assign(ev, { x: p.x, z: p.z, r: K.r * reach, t: K.delay }); break; }
    case 'overdrive': { m.odrvT = K.t * pw; ev.t = m.odrvT; break; }
  }
  S.events.push(ev);
  return true;
}

/** This frame's own events from stepMech (indices from..end of S.events): quick boost, landing, overheating. */
export function perkEvents(S, m, from) {
  const R = m.stats.rules; if (!R || m.down) return;
  const end = S.events.length;
  for (let i = from; i < end; i++) {
    const ev = S.events[i];
    if (ev.id !== m.id) continue;
    if (ev.type === 'qb') {
      m.dashT = S.time;
      if (R.phase) { m.phaseT = R.phase; S.events.push({ type: 'phase', id: m.id, x: m.x, z: m.z, t: R.phase }); }
      if (R.afterburner) {
        const len = (S.T.quickBoostSpeed || 9) * m.stats.qbMul * (S.T.quickBoostTime || 0.25);
        const trail = { x: m.x, z: m.z, dx: ev.dx, dz: ev.dz, len, t: 3, owner: m.id, dps: 160 * R.afterburner * tierScale(S), tick: 0 };
        (S.trails ||= []).push(trail);
        S.events.push({ type: 'afterburn', id: m.id, x: m.x, z: m.z, dx: ev.dx, dz: ev.dz, len, t: 3 });
      }
      if (R.doubledash && m.ddReady) { m.ddReady = false; m.qbCd = Math.min(m.qbCd, 0.15); }
    } else if (ev.type === 'land' && R.shockland) {
      const r = 2;
      area(S, m, m.x, m.z, r, 260 * R.shockland * tierScale(S), 'electric', 0.6, 5);
      S.events.push({ type: 'shockland', id: m.id, x: m.x, z: m.z, r });
    } else if (ev.type === 'overheat' && R.vent) {
      const r = 3;
      area(S, m, m.x, m.z, r, 420 * R.vent * tierScale(S), 'fire', 0.6);
      m.heat *= 0.6; if (m.heat < heatMaxOf(m, S.T)) m.overheated = false;
      S.events.push({ type: 'vent', id: m.id, x: m.x, z: m.z, r });
    }
  }
}

/** Kills and pickups from the rest of the step (shots, blasts, pickups run after the frames): Sickle's reaper, Tinker's
 *  scavenger. */
export function perkLate(S, m, from) {
  const R = m.stats?.rules; if (!R || m.down || !(R.reaper || R.scavenge)) return;
  for (let i = from; i < S.events.length; i++) {
    const ev = S.events[i];
    if (ev.type === 'kill' && R.reaper && ev.by === m.id && Math.hypot(ev.x - m.x, ev.z - m.z) < 2) { m.qbCd = 0; m.reapT = S.time + 3; }
    else if (ev.type === 'pickup' && R.scavenge && ev.owner === m.pid) m.hp = Math.min(m.hpMax, m.hp + m.hpMax * R.scavenge);
  }
}

/** How much of a hit a player frame takes after its perks (and the domes it stands in). Also: dynamo, quiet timer. */
export function perkTaken(S, m, n) {
  if (!m.perks || n <= 0) return n;
  const R = m.stats.rules;
  if (m.phaseT > 0) return 0;
  if (R.reactive && m.reactT <= 0 && n > 20) { m.reactT = R.reactive; S.events.push({ type: 'reactive', id: m.id, x: m.x, z: m.z }); return 0; }
  if (S.domes) for (const d of S.domes) if (d.team === m.team && Math.hypot(d.x - m.x, d.z - m.z) < d.r) { n *= 1 - d.cut; break; }
  if (m.shieldT > 0) n *= 0.5;
  if (R.brace && m.stillT > 1) n *= 1 - Math.min(0.5, R.brace);                     // Redoubt: braced legs
  if (R.laststand && m.hp < m.hpMax * 0.3) n *= 1 - Math.min(0.5, R.laststand);
  m.quietT = 0;
  if (R.dynamo) m.energy = Math.min(energyMaxOf(m, S.T), (m.energy || 0) + n / 100 * R.dynamo);
  return n;
}

/** Painted enemies (locked or pinged by a frame with Target Painter) take more from everyone. */
export function paintedMul(S, e) { return e.painted > S.time ? 1 + (e.paintMul || 0.2) : 1; }
/** A lock or ping event by a painter frame marks its target for 6 s. */
export function paintFrom(S, from) {
  for (let i = from; i < S.events.length; i++) {
    const ev = S.events[i]; if (ev.type !== 'lock' && !(ev.type === 'ping' && ev.target) && ev.type !== 'stick') continue;
    const m = S.byId.get(ev.id), R = m?.stats?.rules; if (!R?.painter) continue;
    const e = S.byId.get(ev.target); if (!e || e.dead) continue;
    e.painted = S.time + 6; e.paintMul = R.painter;
  }
}

/** Once a step: gravity wells, domes, decoys, afterburner trails. */
export function stepPerkWorld(S, dt) {
  if (S.wells?.length) {
    for (const w of S.wells) {
      w.t -= dt;
      for (const e of S.candidates(w.x, w.z, w.r)) {
        if (e.boss || e.structure || e.ace) continue;
        const dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz) || 1, k = Math.min(d, w.pull * dt * (e.r > 0.3 ? 0.4 : 1));
        e.x += dx / d * k; e.z += dz / d * k;
      }
      if (w.t <= 0) { const m = S.byId.get(w.owner); if (m) area(S, m, w.x, w.z, w.r, w.dmg, STATUS.frozen ? 'void' : 'energy'); S.events.push({ type: 'wellBurst', x: w.x, z: w.z, r: w.r }); }
    }
    S.wells = S.wells.filter(w => w.t > 0);
  }
  if (S.domes?.length) { for (const d of S.domes) d.t -= dt; S.domes = S.domes.filter(d => d.t > 0); }
  if (S.decoys?.length) {
    for (const d of S.decoys) {
      d.t -= dt;
      if (d.t <= 0 || d.hp <= 0) { d.down = true; const m = S.byId.get(d.owner); if (m) area(S, m, d.x, d.z, d.burstR, d.dmg, 'energy'); S.events.push({ type: 'decoyBurst', id: d.owner, x: d.x, z: d.z, r: d.burstR }); }
    }
    S.decoys = S.decoys.filter(d => !d.down);
  }
  if (S.trails?.length) {
    for (const tr of S.trails) {
      tr.t -= dt; tr.tick -= dt; if (tr.tick > 0) continue; tr.tick = 0.25;
      const m = S.byId.get(tr.owner); if (!m) { tr.t = 0; continue; }
      for (let k = 0; k <= 3; k++) { const f = k / 3; area(S, m, tr.x + tr.dx * tr.len * f, tr.z + tr.dz * tr.len * f, 0.45, tr.dps * 0.25, 'fire', 0.5); }
    }
    S.trails = S.trails.filter(t => t.t > 0);
  }
}

/** A decoy takes the hit instead of a frame (S.hurtPlayer calls this first). */
export const isDecoy = m => !!m?.decoy;
