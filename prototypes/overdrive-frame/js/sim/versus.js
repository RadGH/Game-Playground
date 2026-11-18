// Versus (round 5 — PLAN: "Arena / PvP simple"): frames against frames in a co-op room. Two teams (red / blue) or every
// frame for itself; rounds — the last team standing takes the round, first to `wins` takes the match. Downed frames can
// be revived by a teammate (the same rule as co-op); everyone stands up again at their spawn for the next round.
//
// How shots find frames: the rest of the rules aim at ONE target grid (S.grid — enemies for the players' side). In
// versus every team gets its own grid holding the OTHER teams' frames, and mission.js swaps S.grid to the right one
// before a team's frame fires, its shots move, its turrets aim and its bots think (useGrid). A hit on a frame goes
// through S.hurtPlayer (armour, resistances, shields, downs), scaled by tuning `versusDamage` so fights last.
// Pure: no clock, S.rng only.
import { Grid } from './grid.js';
import { farSpots } from './ops.js';
import { makeRng } from './rng.js';

export const TEAM_NAMES = { red: 'Red', blue: 'Blue' };

/** createMission: teams, spawn points, the score. def.versus = { mode: 'teams' | 'ffa', wins }. */
export function setupVersus(S) {
  const V = S.def.versus; if (!V) return;
  const ffa = V.mode === 'ffa';
  S.players.forEach((p, i) => { p.mech.team = ffa ? 'f' + (i + 1) : i % 2 ? 'blue' : 'red'; });
  const map = S.def.map, a = map.start, b = map.extract || { x: S.world.w - a.x, z: S.world.h - a.z };
  const spots = ffa ? [a, b, ...farSpots(S, makeRng((S.def.seed || 1) * 13), 2, { apart: 8, minFromStart: 10 })] : [a, b];
  const teams = [...new Set(S.players.map(p => p.mech.team))];
  S.versus = { mode: ffa ? 'ffa' : 'teams', wins: V.wins || 3, teams, score: Object.fromEntries(teams.map(t => [t, 0])), round: 1, resetT: 0,
    spawn: Object.fromEntries(teams.map((t, i) => [t, spots[i % spots.length]])), grids: new Map(teams.map(t => [t, new Grid(S.world.w, S.world.h, 1)])) };
  placeAll(S);
}

function placeAll(S) {
  const V = S.versus, count = {};
  for (const p of S.players) {
    const m = p.mech, sp = V.spawn[m.team], k = count[m.team] = (count[m.team] || 0) + 1;
    m.x = sp.x + ((k - 1) % 2) * 0.7; m.z = sp.z + Math.floor((k - 1) / 2) * 0.7; m.y = 0; m.vx = m.vz = m.vy = 0;
    m.hp = m.hpMax; m.down = false; m.downT = 0; m.reviveT = 0; m.heat = 0; m.overheated = false; m.energy = null; m.status = {};
    m.face = m.aim = Math.atan2(S.world.h / 2 - m.z, S.world.w / 2 - m.x);
  }
}

/** Someone drops in mid-match: the smaller team (or a team of their own in a free-for-all), at its spawn. */
export function joinVersus(S, m) {
  const V = S.versus; if (!V) return;
  if (V.mode === 'ffa') {
    const t = 'f' + (V.teams.length + 1); V.teams.push(t); V.score[t] = 0; V.grids.set(t, new Grid(S.world.w, S.world.h, 1));
    V.spawn[t] = farSpots(S, makeRng((S.def.seed || 1) * 17 + V.teams.length), 1, { apart: 6, minFromStart: 8 })[0] || V.spawn[V.teams[0]];
    m.team = t;
  } else {
    const n = t => S.mechs.filter(x => x !== m && x.team === t).length;
    m.team = n('red') <= n('blue') ? 'red' : 'blue';
  }
  const sp = V.spawn[m.team]; m.x = sp.x + 0.5; m.z = sp.z + 0.5;
}

/** Every step: each team's grid = the other teams' standing frames. */
export function buildVersusGrids(S) {
  for (const [t, g] of S.versus.grids) { g.clear(); for (const m of S.mechs) if (m.team !== t && !m.down) g.add(m); }
}
/** Aim at the right frames: the grid for this team's turn. */
export function useGrid(S, team) { if (S.versus) S.grid = S.versus.grids.get(team) || S.grid; }

/** A versus hit on a frame. Returns the damage shown. */
export function versusHurt(S, m, amount, dtype, by) {
  const src = by && S.byId.get(by);
  if (m.down || (src && src.team === m.team)) return 0;
  const before = m.hp;
  S.hurtPlayer(m, amount * (S.T.versusDamage ?? 0.6), dtype, { id: by, mitigated: true });
  const got = before - m.hp;
  if (src && src.dealt != null) src.dealt += got;
  if (m.down && src && before > 0) { src.kills = (src.kills || 0) + 1; S.events.push({ type: 'frameDown', id: m.id, by, x: m.x, z: m.z }); }
  return got;
}

/** Rounds: the last team standing takes it; a short pause, then everyone stands up at their spawn. */
export function stepVersus(S, dt) {
  const V = S.versus; if (!V || S.phase !== 'fight') return;
  if (V.resetT > 0) {
    V.resetT -= dt;
    if (V.resetT <= 0) { V.round++; placeAll(S); S.events.push({ type: 'roundStart', round: V.round }); }
    return;
  }
  if (new Set(S.mechs.map(m => m.team)).size < 2) return;      // one side on the field (a host alone, a test): nothing to win yet
  const up = new Set(S.mechs.filter(m => !m.down).map(m => m.team));
  if (up.size > 1) return;
  const winner = [...up][0] || null;                      // nobody standing: a draw round
  if (winner) V.score[winner]++;
  S.events.push({ type: 'roundEnd', round: V.round, winner, score: { ...V.score } });
  if (winner && V.score[winner] >= V.wins) {
    V.winner = winner; S.phase = 'won'; S.events.push({ type: 'phase', phase: 'won' });
  } else V.resetT = 3;
}

/** The match result (shared by everyone; each browser reads its own team's win). */
export function versusResult(S) {
  const V = S.versus;
  return { versus: true, won: true, winner: V.winner, score: { ...V.score }, rounds: V.round, mode: V.mode, time: Math.round(S.time), pay: 0, payPerScore: 0, grade: null, points: 0, parts: [], crates: 0, seed: S.seed,
    perPlayer: S.players.map(p => ({ id: p.id, name: p.mech.name || '', bot: !!p.bot, team: p.mech.team, mats: {}, loot: [], kills: p.mech.kills || 0, dealt: Math.round(p.mech.dealt || 0), taken: Math.round(p.mech.taken || 0) })) };
}
