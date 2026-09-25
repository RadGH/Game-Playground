// Orbit and everything above it: satellites, probes, the rocket, the station and the beacons.
//
// The end of a planet is a rocket: six sections, fuel, oxidizer, and a hold with whatever you want
// to keep. What is in the hold lands with you on the next world; everything else stays behind.

export const ROCKET_PARTS = 6;
export const STATION_MODULES = 6;
export const BEACONS_TO_WIN = 3;
import { invChanged } from './production.js';
export const PROBE_TRAVEL = 900;          // game seconds for a probe to reach another planet
export const ROCKET_TRAVEL = 600;

const has = (game, res, n) => padPool(game, res) >= n;

/** Everything the pad and its linked stores can see. */
function padPool(game, res) {
  const pads = game.structures.filter(s => s.state === 'done' && ['launch_pad', 'rocket_assembly', 'satellite_launcher', 'probe_launcher', 'orbital_lift'].includes(s.type));
  let n = 0;
  for (const p of pads) {
    n += p.inv[res] || 0;
    for (const id of p.links || []) { const t = game.byId(id); if (t) n += t.inv[res] || 0; }
  }
  return n;
}

function takePad(game, res, n) {
  const pads = game.structures.filter(s => s.state === 'done' && ['launch_pad', 'rocket_assembly', 'satellite_launcher', 'probe_launcher', 'orbital_lift'].includes(s.type));
  let left = n;
  for (const p of pads) {
    for (const t of [p, ...(p.links || []).map(id => game.byId(id)).filter(Boolean)]) {
      const k = Math.min(left, t.inv[res] || 0);
      if (k > 0) { t.inv[res] -= k; if (t.inv[res] <= 1e-9) delete t.inv[res]; invChanged(t); left -= k; }
      if (left <= 0) return n;
    }
  }
  return n - left;
}

// ------------------------------------------------------------------ satellites

export function canLaunchSatellite(game) {
  if (!game.structures.some(s => s.state === 'done' && (s.type === 'satellite_launcher' || s.type === 'launch_pad'))) return { ok: false, reason: 'no launcher built' };
  if (!has(game, 'satellite', 1)) return { ok: false, reason: 'no satellite built yet' };
  return { ok: true };
}

/** Put a satellite up. The whole local map and the world map open, and orbital packs start working. */
export function launchSatellite(game) {
  const check = canLaunchSatellite(game);
  if (!check.ok) return check;
  takePad(game, 'satellite', 1);
  game.space.satellites++;
  game.fog.everything = true;
  game.fog.explored.fill(1);
  for (const n of game.map.nodes) n.scanned = true;
  game.threat += game.data.waves.threat.rocketLaunch * 0.3;
  game.notify('satellite_up', {});
  game.notify('satellite_online', {});
  game.emit('space:satellite', { n: game.space.satellites });
  game.trackQuest('launch', 'satellite');
  return { ok: true };
}

// ------------------------------------------------------------------ probes

export function canLaunchProbe(game, planetId) {
  if (!game.structures.some(s => s.state === 'done' && s.type === 'probe_launcher')) return { ok: false, reason: 'no probe launcher' };
  if (!has(game, 'probe', 1)) return { ok: false, reason: 'no probe built yet' };
  const p = game.planets.get(planetId);
  if (!p) return { ok: false, reason: 'no such planet' };
  if (game.space.surveyed.includes(planetId)) return { ok: false, reason: 'already surveyed' };
  return { ok: true, planet: p };
}

/** Fire a probe at another planet. It arrives later and tells you what is there. */
export function launchProbe(game, planetId) {
  const check = canLaunchProbe(game, planetId);
  if (!check.ok) return check;
  takePad(game, 'probe', 1);
  game.space.probes.push({ planetId, arrivesAt: game.time + PROBE_TRAVEL });
  game.emit('space:probe', { planetId });
  return { ok: true, arrivesAt: game.time + PROBE_TRAVEL };
}

/** Probes in flight land their reports. */
export function tickSpace(game, dt) {
  for (const p of [...game.space.probes]) {
    if (game.time < p.arrivesAt) continue;
    game.space.probes = game.space.probes.filter(x => x !== p);
    game.space.surveyed.push(p.planetId);
    const planet = game.planets.get(p.planetId);
    const rare = (planet.rareElements || []).map(r => game.data.resource[r]?.name || r).join(', ') || 'nothing unusual';
    game.notify('probe_result', { planet: planet.name, text: `${planet.archetype}, ${planet.resources.length} common resources, ${rare}. Hazards: ${planet.hazards.join(', ') || 'none'}.` });
    game.emit('space:probe-arrived', { planet });
    game.trackQuest('launch', 'probe');
  }
  // an observatory reads nearby worlds for free, slowly
  const obs = game.structures.filter(s => s.state === 'done' && s.def.planetIntel && s.powered > 0.3);
  if (obs.length && game.time - (game.space.lastObs || 0) > 600) {
    game.space.lastObs = game.time;
    const next = game.planets.list().find(p => p.id !== game.planet.id && !game.space.surveyed.includes(p.id));
    if (next) { game.space.surveyed.push(next.id); game.notify('probe_arrived', { planet: next.name, text: `read from the ground: ${next.archetype}, ${(next.rareElements || []).join(', ') || 'no rare elements'}.` }); }
  }
}

// ------------------------------------------------------------------ the rocket

export function rocketStatus(game) {
  return {
    parts: padPool(game, 'rocket_part'),
    needed: ROCKET_PARTS,
    fuel: padPool(game, 'rocket_fuel'),
    oxidizer: padPool(game, 'oxidizer'),
    hasPad: game.structures.some(s => s.state === 'done' && s.type === 'launch_pad'),
    ready: game.space.rocketReady,
  };
}

export function canAssembleRocket(game) {
  const st = rocketStatus(game);
  if (!st.hasPad) return { ok: false, reason: 'no launch pad' };
  if (st.ready) return { ok: false, reason: 'already assembled' };
  if (st.parts < ROCKET_PARTS) return { ok: false, reason: `${st.parts}/${ROCKET_PARTS} rocket sections` };
  if (st.fuel < 40) return { ok: false, reason: 'needs 40 rocket fuel' };
  if (st.oxidizer < 30) return { ok: false, reason: 'needs 30 oxidizer' };
  return { ok: true };
}

/** Stack the sections on the pad. After this the rocket can leave whenever you say. */
export function assembleRocket(game) {
  const check = canAssembleRocket(game);
  if (!check.ok) return check;
  takePad(game, 'rocket_part', ROCKET_PARTS);
  takePad(game, 'rocket_fuel', 40);
  takePad(game, 'oxidizer', 30);
  game.space.rocketReady = true;
  game.space.rocketReadyAt = game.time;
  game.notify('rocket_ready', { at: padAt(game) });
  game.emit('space:rocket-ready', {});
  return { ok: true };
}

function padAt(game) {
  const pad = game.structures.find(s => s.state === 'done' && s.type === 'launch_pad');
  return pad ? { x: pad.x, y: pad.y } : { x: 0, y: 0 };
}

/**
 * Launch. cargo is { resourceId: amount } taken from the pad and its stores; crew is a head count.
 * Returns a transfer descriptor - hand it to Game.land() to start the next planet.
 */
export function launchRocket(game, { to, cargo = {}, crew = 4 } = {}) {
  if (!game.space.rocketReady) return { ok: false, reason: 'rocket is not assembled' };
  const target = game.planets.get(to);
  if (!target) return { ok: false, reason: 'no such planet' };
  const hold = {};
  let crates = 0;
  for (const [res, want] of Object.entries(cargo)) {
    const got = takePad(game, res, want);
    if (got > 0) { hold[res] = got; crates += got; }
  }
  const archived = game.structures.some(s => s.state === 'done' && s.def.carryResearch);
  const transfer = {
    from: game.planet.id, to, at: game.time, crew,
    cargo: hold,
    research: archived ? [...game.research.done] : ['t_landfall'],
    beacons: [...game.space.beacons],
    stationModules: game.space.stationModules,
    satellites: game.space.satellites,
    surveyed: [...game.space.surveyed],
    seed: game.seed + 1,
    difficulty: game.difficulty,
  };
  game.space.rocketReady = false;
  game.space.launched = transfer;
  game.threat += game.data.waves.threat.rocketLaunch;
  game.notify('rocket_launched', { n: Math.round(crates), text: `${crew} crew`, planet: target.name });
  game.emit('space:launched', transfer);
  game.trackQuest('launch', 'rocket');
  return { ok: true, transfer };
}

// ------------------------------------------------------------------ station and beacons

export function stationStatus(game) {
  return { modules: game.space.stationModules, needed: STATION_MODULES, hasLift: game.structures.some(s => s.state === 'done' && s.type === 'orbital_lift') };
}

/** Send one module up. Six of them plus a lift makes the station. */
export function liftStationModule(game) {
  const st = stationStatus(game);
  if (!st.hasLift) return { ok: false, reason: 'no orbital lift' };
  if (!has(game, 'station_module', 1)) return { ok: false, reason: 'no station module built' };
  if (st.modules >= STATION_MODULES) return { ok: false, reason: 'station already complete' };
  takePad(game, 'station_module', 1);
  game.space.stationModules++;
  game.notify('station_module', { n: game.space.stationModules });
  if (game.space.stationModules >= STATION_MODULES) {
    game.space.station = true;
    game.notify('station_complete', {});
    game.emit('space:station', {});
    game.trackQuest('launch', 'station');
  }
  return { ok: true, modules: game.space.stationModules };
}

/** A finished beacon claims the planet. Enough claims and the run is won. */
export function lightBeacon(game) {
  if (game.space.beacons.includes(game.planet.id)) return { ok: false, reason: 'already claimed' };
  game.space.beacons.push(game.planet.id);
  game.notify('beacon_lit', { planet: game.planet.name, n: game.space.beacons.length, text: String(game.beaconsToWin) });
  game.emit('space:beacon', { planet: game.planet.id, n: game.space.beacons.length });
  checkVictory(game);
  return { ok: true, n: game.space.beacons.length };
}

export function checkVictory(game) {
  if (game.won) return true;
  if (game.space.beacons.length >= game.beaconsToWin && game.space.station) {
    game.won = true;
    game.notify('victory', { n: game.space.beacons.length });
    game.emit('victory', { beacons: game.space.beacons });
    return true;
  }
  return false;
}
