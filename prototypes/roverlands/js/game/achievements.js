// Achievements (Expansion 1 M4; the full list + release is M13): reads data/achievements.json and says which ones a
// player has just earned. PURE (no DOM, no storage, no sockets). The room (js/net/room-core.js) calls check() after every
// thing that could earn one — a job paid, a buy, a summon, a change of place, a `stats` report, a job level done — then
// record()s what came back and tells the player (`{ t:'ach', ids }`).
//
//   const A = achTable(json)                                   [{ id, name, text, when, n?, hidden?, requires?, reveal? }]
//   check(profile, event, A, { jobs })  -> [ids newly earned]  (never changes the profile; `jobs` = registry jobTable)
//   record(profile, ids, at)            -> ids actually added (in place: profile.ach[id] = at)
//   view(profile, A)                    -> what the phone shows: [{ id, name, text, earned, at, locked }] — a hidden one
//                                          that is not yet revealed shows as locked: name '???', text = its `requires` line
//
// An achievement's `when`:
//   * with `n`: a COUNT that has to reach n — 'gold' (gold held now), 'cities' (cities visited, profile.seen.cities),
//     any other name is profile.stats[name] (metres, airtime, …: the room adds to them)
//   * without `n`: an EVENT — earned when an event with that `when` happens ({ when: 'bought_vehicle' }, or a list of
//     them: { when: ['bought_vehicle', 'bought_rocket'] }), or when
//     profile.stats[when] is already 1 or more (so a count kept elsewhere earns it too)
//   * 'jobs_l1': level 1 of every job that is done on the planet (place county / sky) done at least once
//   * 'place_<place>': going to that place (the room sends { when: 'place_moon' })
// The hidden rule: a hidden achievement can be earned any time; it is SHOWN (name and text) once its `reveal`
// achievement is earned, or once it is earned itself.

const KEY = /^[a-z0-9_]{1,40}$/;

export function achTable(data) {
  const out = [], seen = new Set();
  for (const a of Array.isArray(data?.achievements) ? data.achievements : Array.isArray(data) ? data : []) {
    if (!a || typeof a.id !== 'string' || !KEY.test(a.id) || seen.has(a.id) || typeof a.when !== 'string') continue;
    seen.add(a.id); out.push(a);
  }
  return out;
}

/** The value a counting achievement compares with its `n`. */
export function countOf(profile, when) {
  if (when === 'gold') return profile?.gold || 0;
  if (when === 'cities') return profile?.seen?.cities?.length || 0;
  const v = profile?.stats?.[when];
  return Number.isFinite(v) ? v : 0;
}

function earnedNow(a, profile, event, jobs) {
  if (a.when === 'jobs_l1') {
    if (!jobs) return false;
    const planet = [...jobs.values()].filter(j => j.place === 'county' || j.place === 'sky');
    return planet.length > 0 && planet.every(j => profile?.jobs?.[j.id]?.done?.includes(j.levels[0].n));
  }
  if (Number.isFinite(a.n)) return countOf(profile, a.when) >= a.n;
  if (event && [].concat(event.when).includes(a.when)) return true;
  return countOf(profile, a.when) >= 1;
}

/** -> ids newly earned by this event (or by the profile as it now stands). */
export function check(profile, event, A, { jobs = null } = {}) {
  const have = profile?.ach || {}, out = [];
  for (const a of A) if (have[a.id] == null && earnedNow(a, profile, event, jobs)) out.push(a.id);
  return out;
}
export function record(profile, ids, at = Date.now()) {
  profile.ach ||= {};
  const added = [];
  for (const id of ids) if (profile.ach[id] == null) { profile.ach[id] = at; added.push(id); }
  return added;
}
export const isShown = (profile, a) => !a.hidden || profile?.ach?.[a.id] != null || (a.reveal && profile?.ach?.[a.reveal] != null);

export function view(profile, A) {
  return A.map(a => {
    const earned = profile?.ach?.[a.id] != null, shown = isShown(profile, a);
    const row = { id: a.id, name: shown ? a.name : '???', text: shown ? a.text : (a.requires || 'Keep exploring'), earned, at: earned ? profile.ach[a.id] : null, locked: !shown };
    if (Number.isFinite(a.n) && shown && !earned) row.progress = { have: Math.min(a.n, countOf(profile, a.when)), n: a.n };
    return row;
  });
}
