// Rival aces (owner: "rival army (… enemy mechs, aces)"): a named Halden-Voss pilot in a mech built from real Mech Kit
// parts, flown by an AI that produces the SAME input a player's controls make (controls.js read(): mx, mz, ax, az,
// boost, qb, jump, jumpPressed, fire[4]) and goes through the same stepMech — so it boosts, quick-boosts, jumps,
// runs out of energy and overheats exactly like you do. Personality knobs live in data/aces.json (ai).
//
// In a mission an ace is a mech in S.mechs with team 'enemy' (players are team 'player'): player shots, blasts, beams,
// locks and turrets hit it (it is filed in the enemy grid each step), its own shots hurt players, swarm and army
// enemies ignore it, and it never counts as a player (revive, extraction, grade health, flow fields). Beaten = gone
// for good (no revive): event 'aceDown', boss-style loot for every player. Spawned through the normal spawn rules as
// kind 'ace:<id>' (a wave or a placed enemy), so missions need no new fields.
// Pure: no DOM; randomness from S.rng.
import { makeMech, stepMech, hurtMech, energyMaxOf, heatMaxOf } from './mech.js';
import { arm, angleDiff, triggerWeapon } from './weapons.js';
import { mechStats, weaponSpec, itemId } from './loadout.js';
import { tickStatus } from './damage.js';

/** Kinds without a projectile: an ace never mounts them (their hits only know how to find swarm and army targets). */
export const ACE_WEAPON_KINDS = new Set(['bullet', 'pellets', 'missile', 'lob', 'plasma']);
const NONE = { id: 'none', name: 'Empty', kind: 'none', dmg: 0, rate: 1, range: 1, speed: 1 };

/**
 * data/aces.json → enemy kinds 'ace:<id>' (merge them into the kinds a mission gets). P = partsIndex(parts.json).
 * The numbers are worked out here, once, from the same one stat function the player's frame uses (loadout.js).
 */
export function aceKinds(json, P, C = null) {
  const out = {};
  for (const a of json.aces || []) {
    const build = { ...a.build, weapons: (a.build.weapons || []).slice(0, 4), paint: a.paint };
    while (build.weapons.length < 4) build.weapons.push(null);
    const st = mechStats(build, P, C);
    st.hp = Math.round(a.hp || st.hp * (a.hpMul || 1));
    st.dmgMulAll = (st.dmgMulAll || 1) * (a.dmgMul ?? 0.35);
    const specs = build.weapons.map(w => { const p = w && P[itemId(w)]; if (!p) return null; const sp = weaponSpec(p, null, st); return ACE_WEAPON_KINDS.has(sp.kind) && !sp.charge ? sp : null; });
    out['ace:' + a.id] = {
      name: `${a.callsign} (${a.name})`, faction: 'army', job: 'ace', score: a.score || 100, mats: a.mats || { scrap: 3, alloy: 1.5 }, radius: st.radius,
      ace: { id: a.id, name: a.name, callsign: a.callsign, colour: a.colour || '#ff5a3a', build, paint: a.paint, stats: st, specs, ai: { ...DEFAULT_AI, ...a.ai }, lines: a.lines || {}, tier: a.tier || 2 },
    };
  }
  return out;
}

export const DEFAULT_AI = { range: 4, aggression: 0.5, strafe: 0.7, dodge: 0.4, accuracy: 0.7, boostFloor: 0.3, heatLimit: 0.85, jump: 2 };

/** Who's speaking, for the comms box (the HUD draws the ace's own frame from build + paint). */
export const aceSpeakerOf = A => ({ id: A.id, name: A.callsign, colour: A.colour, build: A.build, paint: A.paint });

/** Bring an ace into the mission (mission.js spawn() calls this for a kind with job 'ace'). */
export function spawnAce(S, kind, K, x, z, opts = {}) {
  const A = K.ace;
  if (S.mechs.some(m => m.ace === A.id && !m.dead)) return null;            // one of each pilot at a time
  const m = makeMech({ id: 'a' + (S.nextId++), team: 'enemy', x, z, stats: { ...A.stats }, weapons: A.specs.map((sp, i) => arm(sp || NONE, i)), name: A.callsign, paint: A.paint });
  Object.assign(m, { ace: A.id, kind, build: A.build, dead: false, boss: true, state: (opts.warn ?? 1.2) > 0 ? 'warn' : null, stateT: opts.warn ?? 1.2,
    ai: { strafe: S.rng.next() < 0.5 ? 1 : -1, flipT: 2, dodgeCd: 0, jumpT: 0, hold: 0, tauntT: 20 + S.rng.next() * 15, hurtSaid: false } });
  S.mechs.push(m); S.byId.set(m.id, m);
  S.events.push({ type: 'aceIn', id: m.id, ace: A.id, name: A.callsign, x, z, t: m.stateT });
  say(S, A, 'in');
  return m;
}

function say(S, A, key) {
  const list = A.lines?.[key]; if (!list?.length) return;
  S.events.push({ type: 'say', who: 'ace:' + A.id, text: list[Math.floor(S.rng.next() * list.length) % list.length], ace: aceSpeakerOf(A), line: key });
}

/** Damage to an ace (after the hit's crit + resistances): mission.js damageEnemy routes here. */
export function hurtAce(S, m, amount, dtype, by, tier = 0, hx = m.x, hz = m.z) {
  if (m.dead || m.state === 'warn' || amount <= 0) return 0;
  const got = hurtMech(m, amount, S.events, by);
  const src = by && S.byId.get(by); if (src && src.dealt != null) src.dealt += got;
  S.events.push({ type: 'hit', id: m.id, amount: got, tier, dtype, x: hx, z: hz, y: (m.y || 0) + 0.4, by });
  const A = S.kinds[m.kind].ace;
  if (!m.ai.hurtSaid && m.hp < m.hpMax * 0.5 && !m.down) { m.ai.hurtSaid = true; say(S, A, 'hurt'); }
  if (m.down) aceDefeated(S, m, by);
  return got;
}

function aceDefeated(S, m, by) {
  if (m.dead) return;
  const K = S.kinds[m.kind], A = K.ace;
  m.dead = true; m.down = true; m.downT = 0; m.lockOn = null;
  S.stats.kills++; S.stats.score += K.score || 100;
  const src = by && S.byId.get(by); if (src && src.kills != null) src.kills++;
  S.events.push({ type: 'kill', id: m.id, kind: m.kind, x: m.x, z: m.z, y: 0.3, by, big: true });
  S.events.push({ type: 'aceDown', id: m.id, ace: A.id, name: A.callsign, x: m.x, z: m.z, by });
  say(S, A, 'down');
  for (const o of S.objectives) if (!o.done && o.type === 'kill' && (o.kind === m.kind || o.kind === 'ace')) o.progress++;
  S.dropLoot(m, K);               // boss-style: a part for every player (m.boss → one loot tier higher), plus materials
}

/** Every ace's step: think (same input shape as a player), then the same mech rules and weapons a player uses. */
export function stepAces(S, dt, worldApi) {
  for (const m of S.mechs) {
    if (m.team !== 'enemy' || m.dead) continue;
    if (m.state === 'warn') { m.stateT -= dt; if (m.stateT <= 0) { m.state = null; S.events.push({ type: 'espawn', id: m.id, kind: m.kind, x: m.x, z: m.z }); } continue; }
    const A = S.kinds[m.kind].ace;
    const inp = aceInput(S, m, A, dt);
    stepMech(m, inp, dt, S.T, worldApi, S.events);
    const burn = tickStatus(m, dt); if (burn) hurtAce(S, m, burn, 'fire', null);
    if (m.dead) continue;
    const aim = { x: inp.ax ?? m.x + Math.cos(m.aim), z: inp.az ?? m.z + Math.sin(m.aim) };
    m.weapons.forEach((w, i) => {
      if (w.spec.lock) w.locks = inp.target && inp.fire[i] ? [inp.target] : [];   // homing: its CPU locks the player it fights
      triggerWeapon(S, m, w, !!inp.fire[i], dt, S.T, aim);
    });
    // comms: now and then a taunt; a line when it puts a player down
    m.ai.tauntT -= dt; if (m.ai.tauntT <= 0) { m.ai.tauntT = 28 + S.rng.next() * 20; say(S, A, 'taunt'); }
  }
}

/** After a step: a player an ace put down hears it gloat. */
export function aceAfterStep(S) {
  for (let i = 0, n = S.events.length; i < n; i++) {
    const ev = S.events[i]; if (ev.type !== 'down') continue;
    const m = ev.by && S.byId.get(ev.by); if (m?.ace && !m.dead) say(S, S.kinds[m.kind].ace, 'win');
  }
}

const open = (S, x, z) => {
  const W = S.world; if (x < 0.35 || z < 0.35 || x > W.w - 0.35 || z > W.h - 0.35) return false;
  const l = W.cells[Math.floor(z) * W.w + Math.floor(x)]; return l == null || l < 0 || W.lots[l].stage >= 3;
};

/**
 * The ace's hands on the controls. Returns the same shape as Controls.read() plus `target` (the player it fights).
 * Rules it lives by, like a player: boosting costs energy (it keeps `boostFloor` in reserve), a quick boost needs the
 * energy for it, firing heats the frame (it stops near `heatLimit` and lets it cool), treads can't jump.
 */
export function aceInput(S, m, A, dt) {
  const ai = A.ai, st = m.ai, T = S.T;
  let P = null, bd = Infinity;
  for (const o of S.mechs) { if (o.team === 'enemy' || o.down) continue; const d = Math.hypot(o.x - m.x, o.z - m.z); if (d < bd) { bd = d; P = o; } }
  const fire = [false, false, false, false];
  if (!P) return { mx: 0, mz: 0, fire };
  const dx = P.x - m.x, dz = P.z - m.z, dist = bd || 1e-6, ux = dx / dist, uz = dz / dist;
  // range keeping: close in (how hard = aggression) or back off; circle the target (strafe), flipping now and then
  const want = ai.range, k = dist > want + 0.7 ? 0.4 + 0.6 * ai.aggression : dist < want - 0.7 ? -(1.1 - ai.aggression * 0.6) : 0;
  st.flipT -= dt; if (st.flipT <= 0) { st.flipT = 1.6 + S.rng.next() * 2.4; if (S.rng.next() < 0.55) st.strafe = -st.strafe; }
  let mx = ux * k - uz * st.strafe * ai.strafe, mz = uz * k + ux * st.strafe * ai.strafe;
  // streets: like a player steering, swap a blocked way for the open one closest to it
  const wl = Math.hypot(mx, mz) || 1;
  if (!open(S, m.x + mx / wl * 0.8, m.z + mz / wl * 0.8)) {
    let best = null, bs = -Infinity;
    for (let a = 0; a < 16; a++) { const ax = Math.cos(a * Math.PI / 8), az = Math.sin(a * Math.PI / 8); if (!open(S, m.x + ax * 0.8, m.z + az * 0.8)) continue; const sc = (ax * mx + az * mz) / wl + (ax * ux + az * uz) * 0.2; if (sc > bs) { bs = sc; best = [ax, az]; } }
    if (best) { mx = best[0]; mz = best[1]; st.strafe = S.rng.next() < 0.3 ? -st.strafe : st.strafe; }
  }
  const eMax = energyMaxOf(m, T), eFrac = (m.energy ?? eMax) / eMax, hFrac = m.heat / heatMaxOf(m, T);
  // boost to close or open a big gap, never into the reserve it keeps for a dodge
  let boost = eFrac > ai.boostFloor + 0.15 && (Math.abs(dist - want) > 2.5 || (ai.aggression > 0.7 && dist > want + 1));
  if (eFrac < ai.boostFloor) boost = false;
  // dodge: a player's shot coming straight at it → a quick boost sideways (if it has the energy and the reflex)
  let qb = false;
  st.dodgeCd = Math.max(0, st.dodgeCd - dt);
  if (st.dodgeCd <= 0) for (const s of S.shots) {
    if (s.team === 'enemy') continue;
    const rx = m.x - s.x, rz = m.z - s.z, d = Math.hypot(rx, rz); if (d > 2 || d < 0.05) continue;
    const sp = Math.hypot(s.vx, s.vz) || 1; if ((rx * s.vx + rz * s.vz) / sp < d * 0.85) continue;   // not coming at us
    st.dodgeCd = 0.9;
    if (S.rng.next() < ai.dodge) { const side = (-s.vz * rx + s.vx * rz) >= 0 ? 1 : -1; mx = -s.vz / sp * side; mz = s.vx / sp * side; qb = true; }
    break;
  }
  // red circles and acid landing spots: get out like a player would
  for (const k2 of S.strikes) { const ex = m.x - k2.x, ez = m.z - k2.z, d = Math.hypot(ex, ez); if (d < k2.r + 0.3) { mx = ex / (d || 1); mz = ez / (d || 1); boost = eFrac > 0.15; } }
  // jump now and then (hold to hover a moment) — a harder target, and over the rubble
  st.jumpT -= dt; let jumpPressed = false, jump = st.hold > 0;
  if (st.hold > 0) st.hold -= dt;
  if (st.jumpT <= 0) { st.jumpT = 2; if (S.rng.next() < ai.jump / 30 && eFrac > ai.boostFloor + 0.2) { jumpPressed = true; jump = true; st.hold = 0.5 + S.rng.next() * 0.5; } }
  // aim: lead the target by how fast its shots fly; a small honest wobble from accuracy (never a perfect aimbot)
  const shotSp = 16, lead = dist / shotSp;
  const wob = (1 - ai.accuracy) * Math.min(1.2, dist * 0.18);
  const ax = P.x + P.vx * lead * 0.8 + Math.sin(S.time * 2.3 + m.x) * wob, az = P.z + P.vz * lead * 0.8 + Math.cos(S.time * 1.9 + m.z) * wob;
  // fire what reaches and has a clear line; let the heat bleed off near the limit (an overheated frame is a dead one)
  const see = S.canSee(m, P), cool = hFrac > ai.heatLimit || m.overheated;
  m.weapons.forEach((w, i) => {
    if (w.spec.kind === 'none' || cool && w.spec.heat > 0) return;
    if (w.spec.energy && eFrac < ai.boostFloor * 0.6) return;
    const reach = w.spec.kind === 'missile' ? w.spec.range * 0.8 : w.spec.range * 0.95;
    fire[i] = dist < reach && (see || w.spec.kind === 'missile' || w.spec.kind === 'lob') && Math.abs(angleDiff(Math.atan2(az - m.z, ax - m.x), m.aim)) < 0.5;
  });
  return { mx, mz, ax, az, boost, qb, jump, jumpPressed, fire, target: P.id };
}
