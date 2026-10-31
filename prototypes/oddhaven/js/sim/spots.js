// Who stands where inside a building. The sim decides this, not the page, so a town nobody is watching has the same people in
// the same chairs, and "nobody stands inside anybody" is a rule the audit can check.
//
//   act.spot >= 0   plan.slots[spot], a real bed, chair, till ...
//   act.spot < -1   plan.floor[-2 - spot], a place to stand
//   act.spot = -1   no room inside: act.q = their place in the line outside the door
//   act.spot null   outdoors, or a place with no plan
//
// c.occ[place] = Map(spot -> person), rebuilt from the acts on load, never saved. A home's `work` shares its seats with `desk`,
// `chair` and `sofa`, which is why one map holds every kind.
import { toWorld } from './interior.js';

const floorKey = i => -2 - i;

export const freshOcc = c => { c.occ = c.places.map(() => new Map()); };

function take(c, place, key, p) { c.occ[place.id].set(key, p.id); return key; }

/** The first free spot of a kind, or -1. Seeded by nothing: the first free one, so a save reloads to the same room. */
export function claimSlot(c, p, place, kind) {
  const list = place.spots[kind] || [], occ = c.occ[place.id], gone = c.burntSlots?.get(place.building);
  // a person who sleeps in a bed sleeps in the same one: start from their own place in the household
  const start = kind === 'bed' ? Math.max(0, c.s.households[p.household].members.indexOf(p.id)) : 0;
  for (let k = 0; k < list.length; k++) { const i = list[(start + k) % list.length]; if (!occ.has(i) && !gone?.has(i)) return take(c, place, i, p); }
  return -1;
}

/** Somewhere to stand. `pair` = two spots facing each other, for two people talking. */
export function claimFloor(c, p, place, mate = null) {
  const occ = c.occ[place.id], list = place.floor;
  if (mate) {
    for (let k = 0; k + 1 < list.length; k += 2) {
      const a = floorKey(list[k]), b = floorKey(list[k + 1]);
      if (!occ.has(a) && !occ.has(b)) { take(c, place, a, p); take(c, place, b, mate); return [a, b]; }
    }
    return null;
  }
  for (const i of list) { const key = floorKey(i); if (!occ.has(key)) return take(c, place, key, p); }
  return -1;
}

export function lineUp(c, place) {
  const q = new Set();
  for (const id of c.occ[place.id].values()) void id;
  for (const p of c.s.people) if (p.at === place.id && p.act?.spot === -1) q.add(p.act.q);
  let n = 0; while (q.has(n)) n++;
  return n;
}

export function releaseSpot(c, act) {
  if (act.spot === null || act.spot === undefined || act.spot === -1) return;
  c.occ[act.place].delete(act.spot);
}

/** From a saved world: who is where. A save older than M3 has no spots yet, so everyone indoors is given one now. */
export function rebuildSpots(c) {
  freshOcc(c);
  for (const p of c.s.people) {
    const a = p.act;
    if (!a) continue;
    if (a.spot === undefined) continue;
    if (a.spot !== null && a.spot !== -1) c.occ[a.place].set(a.spot, p.id);
  }
  for (const p of c.s.people) {
    const a = p.act;
    if (!a || a.spot !== undefined) continue;
    const place = c.places[a.place], def = c.actionById[a.a];
    a.spot = null;
    if (!place.plan || def.outdoors) continue;
    a.spot = def.slot ? claimSlot(c, p, place, def.slot) : -1;
    if (a.spot === -1) a.spot = claimFloor(c, p, place);
    if (a.spot === -1) a.q = lineUp(c, place);
  }
}

export const spotRow = (place, spot) => (spot === null || spot === undefined || spot === -1 ? null : spot >= 0 ? place.plan.slots[spot] : place.plan.floor[-2 - spot]);

/** World position of where someone in this spot stands, for handing them to a player. */
export function spotInWorld(place, spot) {
  const row = spotRow(place, spot);
  if (!row) return null;
  const q = toWorld(place.frame, row.sx ?? row.x, row.sz ?? row.z);
  return { x: q.x, z: q.z, lv: row.lv ?? 0, h: row.yaw ?? 0 };
}
