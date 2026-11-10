// What the five M7 jobs (fire, ambulance, patrol, tow, haul) share: a "call" (an incident one player started, that
// anyone may help with), the places they start from and end at, the goal line, the refusal toasts. PURE — no DOM,
// three, Rapier or sockets; every time comes from api.now(). Each job's own file (js/game/jobs/<job>.js) holds its rules
// and its referee; this file is only the plumbing they would otherwise each write again.
//
//   flat(a, b)                         metres across the ground between two [x, y, z] / { x, z }
//   placesOf(sites, kind)              the county places of one kind (fire_station, hospital, tow_yard, depot, garage)
//   inYard(place, p, pad = 10)         is p inside the place's yard (its paved rect, `pad` m of slack), else within r + pad
//   nearest(list, p)                   the nearest { x, z } of a list to p -> { item, d } | null
//   pick(list, seed, n)                a fixed choice from a list (same seed + n = same item)
//   stationSigns(sites, job)           where the job's station signs stand: [{ id, x, z, y, name, place }]
//   kit(api)                           the referee helpers: warn / prog / driving / levelUp (see below)

export const STATION_KIND = Object.freeze({ fire: 'fire_station', ambulance: 'hospital', patrol: 'garage', tow: 'tow_yard', haul: 'depot' });
export const SIGN_RANGE = 7;           // metres on foot from a station sign where E takes a call
export const SIGN_DRIVE_RANGE = 16;    // metres in the job's vehicle (stopped) where H takes a call

const xz = p => (Array.isArray(p) ? [p[0], p[2]] : [p.x, p.z]);
export function flat(a, b) { const [ax, az] = xz(a), [bx, bz] = xz(b); return Math.hypot(ax - bx, az - bz); }
export function placesOf(sites, kind) { return (sites?.places || []).filter(p => p && p.kind === kind && Number.isFinite(p.x) && Number.isFinite(p.z)); }
export function inYard(place, p, pad = 10) {
  if (!place || !p) return false;
  const [x, z] = xz(p), y = place.yard;
  if (y && Number.isFinite(y.x0)) return x >= Math.min(y.x0, y.x1) - pad && x <= Math.max(y.x0, y.x1) + pad && z >= Math.min(y.z0, y.z1) - pad && z <= Math.max(y.z0, y.z1) + pad;
  return Math.hypot(x - place.x, z - place.z) <= (place.r || 14) + pad;
}
export function nearest(list, p) {
  let best = null;
  for (const it of list || []) { const d = flat(it, p); if (!best || d < best.d) best = { item: it, d }; }
  return best;
}
export function hash(seed, n) {
  let h = (Math.imul((n | 0) + 1, 2654435761) ^ Math.imul(seed | 0, 2246822519)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
export function pick(list, seed, n) { return list?.length ? list[hash(seed, n) % list.length] : null; }

/** The station signs a job starts from (one per place of its kind); a sign stands at the yard's street edge. */
export function stationSigns(sites, job) {
  const kind = STATION_KIND[job]; if (!kind) return [];
  return placesOf(sites, kind).map(p => {
    const z = p.yard ? Math.max(p.yard.z0, p.yard.z1) - 2 : p.z;
    const x = p.yard ? Math.min(p.yard.x0, p.yard.x1) + 4 : p.x;
    return { id: p.id, x, z, y: p.y ?? null, name: p.name, place: p.id, city: p.city };
  });
}

/**
 * The plumbing a referee needs. `api` is jobs-core's (see js/net/jobs-core.js).
 *   warn(pid, what, why)          a refusal toast, one per kind every 5 s
 *   prog(pid, text, extra)        tell a player their next level's goal (+ the call they are on): k:'prog'
 *   goal(pid)                     that line: the level's goal text, or "Every level done"
 *   driving(P) -> ent | null      the vehicle the player drives (seat 0)
 *   seatedIn(P) -> ent | null     the vehicle the player sits in (any seat)
 *   levelUp(pids, meets, at, veh) every pid whose next level's need `meets(need, level)` gets it (jobDone pays helpers)
 *   levelFor(pid)                 the level a new call is made for: the next one, else the highest open
 */
export function kit(api) {
  const job = api.job, warned = new Map(), told = new Map();
  const warn = (pid, what, why) => { const k = pid + ':' + what, t = api.now(); if (t - (warned.get(k) || 0) < 5000) return; warned.set(k, t); api.deny(pid, why); };
  const row = n => job.levels.find(l => l.n === n) || null;
  const goal = pid => { const L = api.nextLevel(pid), r = row(L); return r ? (r.goal || r.title || '') : `Every level done. Keep taking ${job.name.toLowerCase()} calls for gold.`; };
  function prog(pid, call = '') {
    const P = api.player(pid); if (!P?.profile) return;
    const L = api.nextLevel(pid), text = goal(pid) + (call ? ` — ${call}` : ''), key = `${L}|${text}`;
    if (told.get(pid) === key) return;
    told.set(pid, key);
    api.send(pid, { k: 'prog', level: L, text });
  }
  const forget = pid => told.delete(pid);
  const driving = P => (P?.seat && P.seat[1] === 0 ? api.ent(P.seat[0]) : null);
  const seatedIn = P => (P?.seat ? api.ent(P.seat[0]) : null);
  function levelUp(pids, meets, at = null, vehicle = null) {
    // each player's level as it was BEFORE this call: one job done is one level at most (a helper's level done also
    // records it for the others, and the next one must not ride on the same delivery)
    const before = new Map(pids.map(pid => [pid, api.nextLevel(pid)]));
    const done = [];
    for (const pid of pids) {
      const L = before.get(pid), r = row(L);
      if (r && api.nextLevel(pid) === L && meets(r.need || {}, L)) { const res = api.levelDone(pid, L, { at, vehicle }); if (res?.ok) done.push([pid, L]); }
      forget(pid);
    }
    return done;
  }
  function levelFor(pid) { const L = api.nextLevel(pid); if (L) return L; const open = api.unlocked(pid); return open.length ? Math.max(...open) : 1; }
  return { warn, prog, goal, forget, driving, seatedIn, levelUp, levelFor, row };
}
