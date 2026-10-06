// HUNT AREAS (stream A + E, play-test 4 S14: "kill-quest areas point at an area that may not have them — show where
// they spawn"). Pure.
//
// The camps the server spawns (L.camps: E's placements + <zone>.hunt.json + the sheet's ring camps) grouped per monster
// type into AREAS: camps of one type closer than LINK_M join (single link), so a marsh full of croaker pairs is one area,
// not forty dots. An area = { x, z, r, n, camps, zone, lv: [lo, hi] } — centre weighted by head count, `r` covers every
// camp's spread and a roamer's whole path, `n` = monsters alive when the area is full. Named/rare encounter camps are
// left out (a quest for "8 fen croakers" should not send you to a rare). Used by:
//   js/sim/quests.js  — every kill/collect step's marker is the best area of its type, and the step carries `areas`;
//   tools/content-hunts.mjs — writes data/quests/marks/<province>-hunts.json (the same areas, for the map and tools)
//                             and re-points E's quest marks.
//
//   huntAreas(camps, zoneOf?) -> Map(type -> [area])
//   pickArea(list, { ref, zone, count, place }) -> area | null      the area a step should point at
//   areaHas(area, camp) -> bool

export const LINK_M = 90;            // two camps of one type nearer than this are one hunting ground
export const AREA_PAD_M = 15;        // margin round the outermost camp
export const AREA_MIN_R = 25;
export const PLACE_M = 260;          // a step whose `where` names a place prefers areas this close to it
export const THIN_PENALTY_M = 500;   // an area with fewer monsters than the step needs (capped at 4) counts as this much further

const R = v => Math.round(v);

/** A camp's own spread: its radius, or the furthest point of its roam path. */
function spread(c) {
  let r = c.radius || 6;
  if (Array.isArray(c.path)) for (const p of c.path) { const px = Array.isArray(p) ? p[0] : p.x, pz = Array.isArray(p) ? p[1] : p.z; if (Number.isFinite(px)) r = Math.max(r, Math.hypot(px - c.x, pz - c.z) + 4); }
  return r;
}

export function huntAreas(camps = [], zoneOf = null) {
  const byType = new Map();
  for (const c of camps) {
    if (!c || !c.type || c.encounter || !Number.isFinite(c.x)) continue;
    (byType.get(c.type) || byType.set(c.type, []).get(c.type)).push(c);
  }
  const out = new Map();
  for (const [type, list] of byType) {
    const seen = new Uint8Array(list.length), areas = [];
    for (let i = 0; i < list.length; i++) {
      if (seen[i]) continue;
      const group = [i]; seen[i] = 1;
      for (let k = 0; k < group.length; k++) {
        const a = list[group[k]];
        for (let j = 0; j < list.length; j++) if (!seen[j] && Math.hypot(list[j].x - a.x, list[j].z - a.z) <= LINK_M) { seen[j] = 1; group.push(j); }
      }
      const cs = group.map(g => list[g]);
      const n = cs.reduce((s, c) => s + Math.max(1, c.count || 1), 0);
      const x = cs.reduce((s, c) => s + c.x * Math.max(1, c.count || 1), 0) / n, z = cs.reduce((s, c) => s + c.z * Math.max(1, c.count || 1), 0) / n;
      const r = Math.max(AREA_MIN_R, ...cs.map(c => Math.hypot(c.x - x, c.z - z) + spread(c))) + AREA_PAD_M;
      const lv = cs.map(c => c.level || 1);
      areas.push({ x: R(x), z: R(z), r: R(r), n, camps: cs.length, zone: zoneOf ? zoneOf(x, z) : null, lv: [Math.min(...lv), Math.max(...lv)] });
    }
    areas.sort((a, b) => b.n - a.n);
    out.set(type, areas);
  }
  return out;
}

/** Does `area` hold camp `c` (its centre inside the circle)? */
export const areaHas = (area, c) => !!area && Math.hypot(c.x - area.x, c.z - area.z) <= area.r;

/**
 * The area a kill/collect step should point at: in the quest's zone first, near the place its `where` names when one
 * of its areas is there, then the nearest to `ref` (the giver) — an area too thin for the count counts as further.
 */
export function pickArea(list, { ref = null, zone = null, count = 1, place = null } = {}) {
  if (!list || !list.length) return null;
  const need = Math.min(4, Math.max(1, count || 1));
  const nearPlace = place ? list.filter(a => Math.hypot(a.x - place.x, a.z - place.z) <= PLACE_M + (place.r || 0)) : [];
  const pool = nearPlace.length ? nearPlace : list;
  let best = null, bd = Infinity;
  for (const a of pool) {
    const d = (zone && a.zone && a.zone !== zone ? 1e7 : 0) + (ref ? Math.hypot(a.x - ref.x, a.z - ref.z) : 0) + (a.n < need ? THIN_PENALTY_M : 0);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

/** Areas of `list` whose circle reaches into the circle `c` (x, z, r). */
export const areasTouching = (list, c) => (list || []).filter(a => Math.hypot(a.x - c.x, a.z - c.z) <= a.r + (c.r || 0));
