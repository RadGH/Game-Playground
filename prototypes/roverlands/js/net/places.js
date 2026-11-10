// Places (Expansion 1 M2, docs/EXPANSION-1.md "Places"): one room can have friends in different worlds — the county,
// the old sandbox world, the Moon, the station, the sky over the county. Every player and every body has a `place`; the
// room only sends you what is in yours. PURE: js/net/room-core.js uses it, tests/places.test.js checks it.
//
//   PLACES                 the place names
//   homePlace(mode)        where a room's players start: 'county' (County rooms) or 'sandbox' (Flag Run + Sandbox)
//   mapFor(mode)           the world generateWorld({ seed, map }) builds for a mode: 'county' | 'classic'
//   mapOfPlace(place)      the world a place is drawn from ('sky' is the county, seen from high up)
//   sharesView(a, b)       true when someone in place a sees bodies in place b (the same place, or county <-> sky)
//   goRefusal({...})       null when a player may go to a place now, else the sentence that says why not
//   payees({...})          who gets paid for a job step: everyone in the job vehicle or within PAY_RANGE of the step

export const PLACES = Object.freeze(['county', 'sandbox', 'moon', 'station', 'sky']);
export const PAY_RANGE = 30;          // metres from a job step that still counts as helping (each helper gets the full pay)
export const SUMMON_RANGE = 25;       // metres: how far from you a summoned vehicle may be put down

export const homePlace = mode => (mode === 'county' ? 'county' : 'sandbox');
export const mapFor = mode => (mode === 'county' ? 'county' : 'classic');
const MAP = { county: 'county', sky: 'county', sandbox: 'classic', moon: 'moon', station: 'station' };
export const mapOfPlace = place => MAP[place] || 'classic';
/** The sky is "the county with you high up": a skydiver and their friends on the ground see each other. */
export const sharesView = (a, b) => a === b || (mapOfPlace(a) === 'county' && mapOfPlace(b) === 'county');

/**
 * May this player go there now?  mode = the room's mode; from / to = places; launched = the player is in orbit or already
 * on the Moon / the station (M11: room-core sets it from a refereed `space` 'launch'; home from there is a landing pod,
 * room-core podHome); open = tests only (every place allowed).
 */
export function goRefusal({ mode, from, to, launched = false, open = false }) {
  if (!PLACES.includes(to)) return 'There is no such place.';
  if (to === from) return null;
  if (open) return null;
  if (mode !== 'county') return 'This room has only the one world.';
  if (to === 'sandbox') return 'The old world is its own game — start a Sandbox room for it.';
  // M11: from the Moon or the station the way home is the landing pod (go 'county'), not a jump into the sky
  if (to === 'sky' && (from === 'moon' || from === 'station')) return 'Ride the landing pod home first.';
  if (to === 'county' || to === 'sky') return null;
  if (to === 'moon' || to === 'station') return launched ? null : 'You need to launch the rocket first.';
  return 'You cannot go there.';
}

/**
 * Everyone paid for one job step (expansion rule 3: gold is not split, each one gets the whole amount).
 *   players: [{ pid, place, spec, seat: [entId, seatIdx] | null, pos: [x,y,z] | null }]
 *   at: [x,y,z] the step's position (y may be null: measured across the ground); vehicle: the job vehicle's id (or null);
 *   place: where the step happened (someone in a place that shares its view counts: county <-> sky).
 * -> pids, in the order given.
 */
export function payees({ players, at = null, vehicle = null, place, range = PAY_RANGE }) {
  const out = [];
  for (const p of players) {
    if (!p || p.spec || !sharesView(p.place, place)) continue;
    const inIt = vehicle != null && p.seat && p.seat[0] === vehicle;
    let near = false;
    if (!inIt && at && p.pos) {
      const dx = p.pos[0] - at[0], dz = p.pos[2] - at[2];
      const dy = at[1] == null || p.pos[1] == null ? 0 : p.pos[1] - at[1];
      near = Math.hypot(dx, dy, dz) <= range;
    }
    if (inIt || near) out.push(p.pid);
  }
  return out;
}
