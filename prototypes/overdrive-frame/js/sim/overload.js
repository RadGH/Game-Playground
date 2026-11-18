// Overload cores (round 5 — PLAN: "Overload = a late 'ultimate' part"): three crafted generators (data/crafted.json
// `set.overload`) that give the frame an ultimate. Damage you deal fills the Overload bar; when it's full, the Overload
// button (V · controller d-pad down · touch OD) fires it for a few seconds:
//   surge    — weapons fire half again as fast and make no heat
//   bastion  — you take a third of the damage; teammates standing near you take less too
//   cascade  — a blast around the frame, then a pulse every second
// Pure: S.rng-free, no clock. mission.js calls chargeOverload (on a hit), triggerOverload (on the button), and
// stepOverload before / afterWeapons around the weapons each step; S.hurtPlayer asks overloadTaken.

export const OVERLOAD = {
  surge: { label: 'Surge', time: 8, rate: 1.5, text: 'Weapons fire half again as fast and make no heat.' },
  bastion: { label: 'Bastion', time: 7, self: 0.35, ally: 0.6, allyR: 2.6, text: 'You take a third of the damage; teammates near you take less too.' },
  cascade: { label: 'Cascade', time: 5, dmg: 900, r: 3.2, pulse: 1, pulseDmg: 320, pulseR: 2.4, text: 'A blast around your frame, then a pulse every second.' },
};
export const overloadOf = m => (m?.stats?.overload && OVERLOAD[m.stats.overload]) ? m.stats.overload : null;

/** Damage this frame dealt fills its bar (not while one is running). Full → an 'odReady' event, once. */
export function chargeOverload(S, m, amount) {
  if (!overloadOf(m) || m.odT > 0) return;
  const was = m.od || 0;
  m.od = Math.min(1, was + amount / (S.T.overloadCharge || 9000));
  if (was < 1 && m.od >= 1) S.events.push({ type: 'odReady', id: m.id });
}

/** The button: a full bar starts it. */
export function triggerOverload(S, m, blast) {
  const k = overloadOf(m); if (!k || (m.od || 0) < 1 || m.odT > 0 || m.down) return false;
  const O = OVERLOAD[k];
  m.od = 0; m.odT = O.time; m.odK = k; m.odPulse = O.pulse || 0;
  S.events.push({ type: 'overload', id: m.id, kind: k, x: m.x, z: m.z, time: O.time });
  if (k === 'cascade') blast({ owner: m.id, team: 'player', dtype: 'energy', dmg: O.dmg, crit: 0 }, m.x, m.z, O.r);
  return true;
}

/** Before the weapons: the timer, surge's faster cycling, cascade's pulses. Returns the heat to hold for surge. */
export function stepOverload(S, m, dt, blast) {
  if (!(m.odT > 0)) return null;
  m.odT = Math.max(0, m.odT - dt);
  const k = m.odK, O = OVERLOAD[k];
  if (m.odT === 0) { S.events.push({ type: 'overloadEnd', id: m.id, kind: k }); m.odK = null; return null; }
  if (k === 'surge') { for (const w of m.weapons) if (w.cd > 0) w.cd -= dt * (O.rate - 1); return m.heat; }
  if (k === 'cascade') {
    m.odPulse -= dt;
    if (m.odPulse <= 0) { m.odPulse += O.pulse; blast({ owner: m.id, team: 'player', dtype: 'energy', dmg: O.pulseDmg, crit: 0 }, m.x, m.z, O.pulseR); S.events.push({ type: 'odPulse', id: m.id, x: m.x, z: m.z, r: O.pulseR }); }
  }
  return null;
}
/** After the weapons: surge keeps the heat where it was (and cools a little), so firing makes none. */
export function afterWeapons(m, heldHeat, dt) {
  if (heldHeat == null) return;
  m.heat = Math.max(0, Math.min(m.heat, heldHeat) - dt * 20); m.overheated = false;
}

/** How much of a hit a player frame takes: bastion on it, or a bastion teammate standing near. */
export function overloadTaken(S, m) {
  let k = 1;
  if (m.odT > 0 && m.odK === 'bastion') k = OVERLOAD.bastion.self;
  else for (const o of S.mechs) if (o !== m && o.odT > 0 && o.odK === 'bastion' && o.team === m.team && Math.hypot(o.x - m.x, o.z - m.z) < OVERLOAD.bastion.allyR) { k = OVERLOAD.bastion.ally; break; }
  return k;
}
