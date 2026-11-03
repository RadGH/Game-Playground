// Buildings as data. A town lists buildings; a kind (data/buildings.json) says what slots each has. A PLACE is one
// thing a person can be at: a house, a shop, or one flat of an apartment block, so "apartments absorb households"
// costs nothing. The static part is rebuilt from the town and never saved; who is in which slot is state (s.slots).
// M3: a building has a real plan (interior.js) and a place knows its own beds and chairs: place.spots[slot kind] = indexes
// into plan.slots, place.floor = indexes into plan.floor. Which spot a person holds is act.spot (spots.js).

import { planInterior } from './interior.js';

/** The one way anyone gets a building's plan: the sim, the page and the tests all ask here, so they all get the same rooms. */
export function buildingPlan(b, kind, wiring) {
  if (kind.role === 'public') return null;
  return planInterior({ id: b.id, kind: b.kind, w: b.w, d: b.d, floors: b.floors, units: b.units ?? kind.unitsDefault, doorX: b.doorX, garage: b.garage }, wiring, kind.slots);
}
/** Where a building's plan sits in the world. A town with no shapes (fake-town) gets a footprint behind the door. */
export function frameOf(b, plan) {
  if (b.cx !== undefined) return { cx: b.cx, cz: b.cz, yaw: b.yaw };
  return { cx: b.x - (b.doorX ?? 0), cz: b.z - (plan?.d ?? 0) / 2, yaw: 0 };
}

export function buildPlaces(town, kinds, roads, wiring = null) {
  const places = [], byBuilding = new Map(), byTag = new Map();
  const add = (b, unit, kind, plan, frame) => {
    const p = {
      id: places.length, building: b.id, unit, kind: b.kind, role: kind.role, x: b.x, z: b.z, node: b.node, zone: b.zone ?? 0,
      caps: kind.slots || {}, hours: kind.hours || null, rent: kind.rent || 0, jobs: kind.jobs || null, name: b.name || null, tags: kind.tags || [],
      plan, frame, spots: {}, floor: [],
    };
    if (plan) {
      const u = kind.unitsDefault ? unit : 0, mine = row => row.unit === null || row.unit === u || !plan.units.length;
      for (const s of plan.slots) if (mine(s)) (p.spots[s.kind] ||= []).push(s.i);
      for (const f of plan.floor) if (mine(f)) p.floor.push(f.i);
      // at home, work is done wherever there is a seat
      if (kind.role === 'home') p.spots.work = [...(p.spots.desk || []), ...(p.spots.chair || []), ...(p.spots.sofa || [])];
      p.spotLv = plan.units.find(x => x.u === u)?.lv ?? 0;
    }
    places.push(p);
    if (!byBuilding.has(b.id)) byBuilding.set(b.id, []);
    byBuilding.get(b.id).push(p.id);
    for (const tag of kind.tags || []) { if (!byTag.has(tag)) byTag.set(tag, []); byTag.get(tag).push(p); }
  };
  for (const b of town.buildings) {
    const kind = kinds[b.kind];
    if (!kind) throw new Error(`town: building ${b.id} has kind "${b.kind}", which data/buildings.json does not list`);
    if (!roads.nodeIndex.has(b.node)) throw new Error(`town: building ${b.id} stands on node ${b.node}, which does not exist`);
    const units = b.units ?? kind.unitsDefault ?? 1, plan = buildingPlan(b, kind, wiring), frame = frameOf(b, plan);
    for (let u = 0; u < units; u++) add(b, kind.unitsDefault ? u : null, kind, plan, frame);
  }
  // Every place must be reachable from the first; a town with an island in it would strand whoever lives there.
  const first = places[0]?.node;
  for (const p of places) {
    if (roads.distance(first, p.node) === Infinity) throw new Error(`town: ${p.building} cannot be reached by road`);
  }
  return { places, byBuilding, byTag };
}

/** Is this place open at minute `m`? Places with no hours are always open. */
export function isOpen(place, m) {
  if (place.fireShut || place.riftShut) return false;
  if (!place.hours) return true;
  const [a, b] = place.hours, from = a * 60, to = b * 60;
  return from <= to ? (m >= from && m < to) : (m >= from || m < to);
}

export const slotUsers = (c, placeId, slot) => (c.s.slots[placeId][slot] ||= []);
export const slotFree = (c, place, slot) => {
  const used = c.s.slots[place.id][slot];
  if ((used ? used.length : 0) >= (place.caps[slot] ?? 0)) return false;
  const gone = c.burntSlots.get(place.building);
  return !place.plan || !place.spots[slot] || place.spots[slot].some(i => !c.occ[place.id].has(i) && !gone?.has(i));
};
