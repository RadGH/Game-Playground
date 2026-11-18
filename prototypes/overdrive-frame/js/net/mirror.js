// The browser's copy of a co-op mission (the "mirror"): the same createMission the server runs, from the same mission
// and the same roster, so the city, the buildings and every id line up — then snapshots (snap.js) keep it current.
// frameFor is shared with the server (server/room.js): a seat's frame is built from its parts the same way on both.
import { createMission } from '../sim/mission.js';
import { buildMissionDef } from '../sim/missiondef.js';
import { makeMech } from '../sim/mech.js';
import { arm } from '../sim/weapons.js';
import { mechStats, weaponSpec } from '../sim/loadout.js';

const NONE = { id: 'none', kind: 'none', dmg: 0, rate: 1, range: 1, speed: 1 };

/** A frame from a build ({ head: { id, rarity, rolls }, …, weapons: [item|null ×4], chips, paint }). */
export function frameFor(data, pid, build, name) {
  const st = mechStats(build, data.P, data.C);
  const weapons = [0, 1, 2, 3].map(i => { const w = build.weapons?.[i]; const p = w && data.P[w.id]; return arm(p ? weaponSpec(p, w, st) : NONE, i); });
  const m = makeMech({ id: 'm-' + pid, x: 0, z: 0, stats: st, weapons, paint: build.paint, name });
  m.build = build;
  return m;
}

/** A build in item form ({ id } objects), so every browser's Mech Kit draws it the same way. */
export const asItems = b => { const o = { ...b }; for (const [k, v] of Object.entries(b)) if (typeof v === 'string' && k !== 'paint' && k !== 'name') o[k] = { id: v }; o.weapons = (b.weapons || []).map(w => (typeof w === 'string' ? { id: w } : w || null)); return o; };

/** The mirror for a mission start message: { mission, roster: [{ pid, mid, name, bot, build, rank }], seed }. */
export function makeMirror(start, data, localPid) {
  const def = buildMissionDef(start.mission);
  const players = start.roster.map(r => ({ id: r.pid, bot: r.bot, rank: r.rank, mech: frameFor(data, r.pid, r.build, r.name) }));
  const M = createMission(def, { kinds: data.KINDS, T: data.T, players, seed: start.seed ?? def.seed });
  M.localPid = localPid; M.mirror = true;
  M.enemies = []; M.byId = new Map(M.mechs.map(m => [m.id, m])); M.shots = []; M._dead = 0;   // enemies come from the server
  M.roster = new Map(start.roster.map(r => [r.mid, r]));
  return M;
}

/** A roster update (someone dropped in or out): mechs the mirror does not have yet are built from their parts. */
export function applyRoster(M, roster, data) {
  for (const r of roster) {
    M.roster.set(r.mid, r);
    if (M.byId.has(r.mid)) continue;
    const m = frameFor(data, r.pid, r.build, r.name); m.pid = r.pid;
    M.mechs.push(m); M.byId.set(m.id, m);
    if (!M.players.some(p => p.id === r.pid)) M.players.push({ id: r.pid, bot: r.bot, mech: m, mats: {}, loot: [] });
  }
  const ids = new Set(roster.map(r => r.pid));
  M.players = M.players.filter(p => ids.has(p.id));
}
