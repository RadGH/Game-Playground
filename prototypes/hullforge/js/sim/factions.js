// Factions and standing (round 2, owner 2026-11-14: "implement the other features"). Two hostile powers that were
// already in the game (pirates, the Hive) and two human ones you can work for (traders, the patrol). Every faction
// has a standing from −100 to 100 in the save (G.rep). Hurting one pleases its rivals (Voidwright PLAN §0 #15).
//
// What standing changes (all read from REP_LEVELS, the one table):
//   - jobs: a station's board pays more (or less) with the station owner's standing, offers one more job at
//     Trusted, and offers none at Hated
//   - prices: ore sells for a little more (or less) at a station whose owner likes you
//   - ships: traders and patrol ships turn their guns on you at Hated; pirates leave you be at Liked or better
//     unless you fly right up to them; the Hive never deals with anyone
//
// Pure: no DOM. The save holds only numbers (G.rep = { traders, navy, pirate, swarm }).

import { hash, clamp } from '../core/math.js';

export const FACTIONS = {
  traders: { name: 'Meridian Traders', short: 'Traders', color: '#ffd27a', team: 'neutral', rivals: ['pirate'],
    blurb: 'Merchants and haulers. They run most stations, buy your ore and pay for escorts.' },
  navy: { name: 'Halcyon Patrol', short: 'Patrol', color: '#7ad8ff', team: 'ally', rivals: ['pirate'],
    blurb: 'The law near home. Their ships hunt pirates and the Hive, and they pay bounties.' },
  pirate: { name: 'Rustwake Pirates', short: 'Pirates', color: '#ff7a4a', team: 'hostile', rivals: ['traders', 'navy'],
    blurb: 'Raiders and thieves. They will cut a deal with anyone who helps them rob a convoy.' },
  swarm: { name: 'The Hive', short: 'Hive', color: '#8dff6a', team: 'hostile', rivals: ['navy', 'traders'], fixed: true,
    blurb: 'A living swarm. It never makes deals: standing with it only goes down.' },
};
export const FACTION_IDS = Object.keys(FACTIONS);
/** Where a new captain starts. */
export const START_REP = { traders: 0, navy: 0, pirate: -40, swarm: -60 };
/** How much of a hurt a rival feels as a gain (hurting pirates by 2 pleases traders and the patrol by 1 each). */
export const RIVAL_SHARE = 0.5;

/**
 * Standing levels, lowest first. `min` is inclusive. `price` lifts ore prices at that faction's stations, `pay` lifts
 * job pay on their boards, `jobs` = how many jobs their boards offer (0 = none). `hostileShips` = their ships shoot
 * you on sight; `calm` = pirates leave you alone unless you come within 200 m.
 */
export const REP_LEVELS = [
  { id: 'hated', name: 'Hated', min: -100, color: '#ff3a5a', price: -0.15, pay: 0, jobs: 0, hostileShips: true },
  { id: 'disliked', name: 'Disliked', min: -50, color: '#ff8a5a', price: -0.06, pay: -0.1, jobs: 3 },
  { id: 'neutral', name: 'Neutral', min: -15, color: '#c9d4e0', price: 0, pay: 0, jobs: 4 },
  { id: 'liked', name: 'Liked', min: 15, color: '#9fe06a', price: 0.04, pay: 0.1, jobs: 4, calm: true },
  { id: 'trusted', name: 'Trusted', min: 40, color: '#62f0a8', price: 0.08, pay: 0.2, jobs: 5, calm: true },
  { id: 'allied', name: 'Allied', min: 70, color: '#5fd8ff', price: 0.12, pay: 0.3, jobs: 5, calm: true },
];

export const repState = G => (G.rep ||= { ...START_REP });
export const repOf = (G, f) => repState(G)[f] ?? START_REP[f] ?? 0;
/** The level object for a faction's standing. */
export function repLevel(G, f) { return levelFor(repOf(G, f)); }
export function levelFor(v) { let out = REP_LEVELS[0]; for (const L of REP_LEVELS) if (v >= L.min) out = L; return out; }
/** The next level up (or null at the top) — for "12 more to Trusted". */
export function nextLevel(G, f) { const v = repOf(G, f); return REP_LEVELS.find(L => L.min > v) || null; }

/**
 * Change a faction's standing by n. A loss also pleases each rival by n × RIVAL_SHARE. The Hive's standing never
 * rises. Returns the changes actually made: [{ faction, d }] (for the "+1 Traders" toasts).
 */
export function addRep(G, f, n) {
  if (!FACTIONS[f] || !n) return [];
  const R = repState(G); const out = [];
  const bump = (id, d) => {
    if (FACTIONS[id].fixed && d > 0) return;
    const was = R[id] ?? START_REP[id] ?? 0; const now = clamp(was + d, -100, 100);
    if (now !== was) { R[id] = Math.round(now * 10) / 10; out.push({ faction: id, d: R[id] - was }); }
  };
  bump(f, n);
  if (n < 0) for (const r of FACTIONS[f].rivals) bump(r, -n * RIVAL_SHARE);
  return out;
}

/** Standing changes when a ship of `faction` is destroyed by you (or your drones / outpost guns). */
export const KILL_REP = { pirate: -2, swarm: -2, traders: -12, navy: -15 };
export function repForKill(G, faction) { return KILL_REP[faction] ? addRep(G, faction, KILL_REP[faction]) : []; }

/** Who runs a system's station: home and a share of the near systems are patrol stations, the rest traders'. */
export function stationOwner(sys) {
  if (sys.id === 0) return 'navy';
  const roll = hash(sys.seed, 'owner') % 100;
  return roll < (sys.danger <= 3 ? 45 : 15) ? 'navy' : 'traders';
}
/** Ore price multiplier at a station (owner's standing). */
export const priceMul = (G, owner) => 1 + repLevel(G, owner).price;
/** Job pay multiplier on a board (owner's standing). */
export const payMul = (G, owner) => 1 + repLevel(G, owner).pay;
/** Do this faction's ships shoot you on sight? */
export const shipsHostile = (G, f) => !!repLevel(G, f).hostileShips && !FACTIONS[f]?.fixed && FACTIONS[f]?.team !== 'hostile';
/** Pirates leave you alone (unless you come close or shoot)? */
export const piratesCalm = G => !!repLevel(G, 'pirate').calm;

/** Plain lines for the Standing screen: what each level gives with this faction. */
export function levelPerks(f, L) {
  const pct = v => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  if (f === 'swarm') return L.id === 'hated' ? ['Hive ships attack on sight (always)'] : ['The Hive never deals with anyone'];
  if (f === 'pirate') {
    const out = [];
    out.push(L.calm ? 'Pirate patrols leave you alone unless you come within 200 m or shoot' : 'Pirate patrols attack you on sight');
    if (L.min >= 40) out.push('Robbing a convoy with them pays 50% more');
    return out;
  }
  const out = [];
  if (L.hostileShips) out.push(`${FACTIONS[f].short} ships shoot at you on sight`);
  out.push(L.jobs ? `${L.jobs} jobs on their boards` : 'Their boards offer you no jobs');
  if (L.pay) out.push(`Job pay ${pct(L.pay)}`);
  if (L.price) out.push(`Ore sells for ${pct(L.price)} at their stations`);
  return out;
}
