// The job registry (Expansion 1 M4, docs/EXPANSION-1.md "Jobs"): reads data/jobs.json and answers every question the
// room, the phone and later the job referees ask about a player's jobs. PURE (no DOM, no storage, no sockets).
//
//   const T = jobTable(jobsJson)                Map(id -> job), in file order; rows with no id / no levels are left out
//   upgradeIndex(T)                             Map(upgradeId -> { job, up }) (upgrade ids are unique across jobs)
//   jobState(profile, id)                       the profile's record of that job, or a blank one (never changes the profile)
//   unlockedLevels(profile, job)                [1, 2, …]: level 1 always, level N once level N-1 has been done once
//   nextLevel(profile, job)                     the first unlocked level not yet done, or null when every level is done
//   isRevealed(profile, job)                    a job with no `hidden` is always known; a hidden one once its `reveal`
//                                               achievement is earned, or (reveal 'found') once its place was reached —
//                                               both end up in profile.seen.jobs, which also counts
//   levelPay(job, n)                            the gold a level pays when it is done (level.pay, job.pay.base, the sum of
//                                               job.steps, else 50)
//   levelRefusal(profile, T, id, n)             null when level n of that job may be recorded now, else why not
//   levelDone(profile, T, id, n)                record it (in place): -> { ok, first, level, pay } | { ok: false, why }
//   upgradeRefusal / applyUpgrade(profile, T, upId)   buy a job upgrade with gold (kept forever, rule 2)
//   checklist(profile, T)                       the Jobs checklist: [{ id, name, revealed, done, total, hidden }]
//   jobSpot(job, sites, from)                   where "Start" puts the waypoint: the nearest place of the job's kind
//
// A player's job record (profile.jobs[id], js/game/profile.js): { level, done: [levels done at least once], upgrades, best }.
// `level` is the highest unlocked level (what the phone offers next); `done` is what the Jobs checklist counts.

const KEY = /^[a-z0-9_]{1,40}$/;

/** data/jobs.json -> Map(id -> job). */
export function jobTable(data) {
  const T = new Map();
  for (const j of Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : []) {
    if (!j || typeof j.id !== 'string' || !KEY.test(j.id) || T.has(j.id)) continue;
    const levels = (Array.isArray(j.levels) ? j.levels : []).filter(l => l && Number.isInteger(l.n) && l.n >= 1).sort((a, b) => a.n - b.n);
    if (!levels.length) continue;
    T.set(j.id, { ...j, levels, upgrades: (Array.isArray(j.upgrades) ? j.upgrades : []).filter(u => u && typeof u.id === 'string' && KEY.test(u.id) && Number.isInteger(u.cost) && u.cost >= 0) });
  }
  return T;
}
const asJob = (T, j) => (typeof j === 'string' ? T.get(j) : j);

/** Map(upgradeId -> { job, up }). A repeated id keeps its first job (a test checks there are none). */
export function upgradeIndex(T) {
  const U = new Map();
  for (const job of T.values()) for (const up of job.upgrades) if (!U.has(up.id)) U.set(up.id, { job, up });
  return U;
}

export function jobState(profile, id) {
  const j = profile?.jobs?.[id];
  return j ? { level: j.level || 1, done: Array.isArray(j.done) ? j.done : [], upgrades: Array.isArray(j.upgrades) ? j.upgrades : [], ...(j.best != null ? { best: j.best } : {}) }
    : { level: 1, done: [], upgrades: [] };
}
/** The job record a write goes into (made when missing). */
function stateFor(profile, id) {
  profile.jobs ||= {};
  return (profile.jobs[id] ||= { level: 1, done: [], upgrades: [] });
}

export function unlockedLevels(profile, job) {
  const done = new Set(jobState(profile, job.id).done), out = [];
  for (const l of job.levels) { if (l.n === job.levels[0].n || done.has(out[out.length - 1])) out.push(l.n); else break; }
  return out;
}
export function nextLevel(profile, job) {
  const done = new Set(jobState(profile, job.id).done);
  return unlockedLevels(profile, job).find(n => !done.has(n)) ?? null;
}
export function isRevealed(profile, job) {
  if (!job.hidden) return true;
  if (profile?.seen?.jobs?.includes(job.id)) return true;
  if (job.reveal && job.reveal !== 'found' && profile?.ach?.[job.reveal] != null) return true;
  return false;
}
export function levelPay(job, n) {
  const L = job.levels.find(l => l.n === n);
  if (L && Number.isFinite(L.pay)) return Math.max(0, Math.floor(L.pay));
  if (Number.isFinite(job.pay?.base)) return Math.floor(job.pay.base);
  if (job.steps && typeof job.steps === 'object') { const s = Object.values(job.steps).filter(Number.isFinite).reduce((a, b) => a + b, 0); if (s > 0) return Math.floor(s); }
  return 50;
}

export function levelRefusal(profile, T, id, n) {
  const job = asJob(T, id);
  if (!job) return 'There is no such job.';
  if (!job.levels.some(l => l.n === n)) return 'That job has no such level.';
  if (!unlockedLevels(profile, job).includes(n)) return `Finish level ${n - 1} first.`;
  return null;
}
/** Record that level n of a job was done (in place). The first time also unlocks the next level. */
export function levelDone(profile, T, id, n) {
  const why = levelRefusal(profile, T, id, n);
  if (why) return { ok: false, why };
  const job = asJob(T, id), st = stateFor(profile, job.id);
  const first = !st.done.includes(n);
  if (first) { st.done.push(n); st.done.sort((a, b) => a - b); }
  st.level = Math.max(...unlockedLevels(profile, job));
  // doing a hidden job's level means you found it
  if (job.hidden) { profile.seen ||= { jobs: [] }; profile.seen.jobs ||= []; if (!profile.seen.jobs.includes(job.id)) profile.seen.jobs.push(job.id); }
  return { ok: true, first, level: st.level, pay: levelPay(job, n), job };
}

/** null when the upgrade can be bought now, else a player-facing sentence. */
export function upgradeRefusal(profile, T, upId) {
  const hit = upgradeIndex(T).get(upId);
  if (!hit) return 'There is no such upgrade.';
  if (!isRevealed(profile, hit.job)) return 'You have not found that job yet.';
  if (jobState(profile, hit.job.id).upgrades.includes(upId)) return 'You already have that upgrade.';
  if ((profile.gold || 0) < hit.up.cost) return `You need ${hit.up.cost - (profile.gold || 0)} more gold.`;
  return null;
}
/** Buy: -> { ok: true, job, up, price } (gold taken, kept forever) | { ok: false, why }. */
export function applyUpgrade(profile, T, upId) {
  const why = upgradeRefusal(profile, T, upId);
  if (why) return { ok: false, why };
  const { job, up } = upgradeIndex(T).get(upId);
  profile.gold -= up.cost;
  stateFor(profile, job.id).upgrades.push(upId);
  return { ok: true, job, up, price: up.cost };
}

/** The Jobs checklist: every job, how many of its levels have been done at least once; a hidden job not yet found is obscured. */
export function checklist(profile, T) {
  return [...T.values()].map(job => {
    const revealed = isRevealed(profile, job), done = new Set(jobState(profile, job.id).done);
    return { id: job.id, name: revealed ? job.name : '???', revealed, hidden: !!job.hidden, requires: revealed ? null : job.hidden,
      done: job.levels.filter(l => done.has(l.n)).length, total: job.levels.length };
  });
}

/** Which kind of county place each job starts from (sites.places[].kind, js/world/county). */
export const JOB_PLACE_KIND = Object.freeze({ farming: 'market', fire: 'fire_station', ambulance: 'hospital', patrol: 'garage', tow: 'tow_yard', haul: 'depot',
  skydive: 'jump_point', survey: 'survey_office', moon: 'sample_drop' });
/**
 * Where the phone's "Start" puts the waypoint pin: the nearest place of the job's kind (from `from` = [x, z]), the
 * Rustwild's middle for raids, the farm barn for farming when there is no market. -> { x, z, name } | null.
 */
export function jobSpot(job, sites, from = [0, 0]) {
  if (!job || !sites) return null;
  const places = Array.isArray(sites.places) ? sites.places : [];
  // farming starts in the farm yard, where the farm's own tractors are parked (M6)
  if (job.id === 'farming' && sites.farms?.yard && Number.isFinite(sites.farms.yard.x)) return { x: Math.round(sites.farms.yard.x), z: Math.round(sites.farms.yard.z - (sites.farms.yard.hz || 30) + 6), name: 'Marrow Barn farm yard' };
  // raids start at the Rustwild Gate Garage (M8: its own buggies, where you wake up), else the badlands' middle
  if (job.id === 'combat' && sites.rustwild?.garage && Number.isFinite(sites.rustwild.garage.x)) return { x: Math.round(sites.rustwild.garage.x), z: Math.round(sites.rustwild.garage.z), name: sites.rustwild.garage.name || 'Rustwild Gate Garage' };
  if (job.id === 'combat' && Array.isArray(sites.rustwild?.poly) && sites.rustwild.poly.length) {
    const P = sites.rustwild.poly, x = P.reduce((a, p) => a + p[0], 0) / P.length, z = P.reduce((a, p) => a + p[1], 0) / P.length;
    return { x: Math.round(x), z: Math.round(z), name: sites.rustwild.name || 'Rustwild' };
  }
  const kind = JOB_PLACE_KIND[job.id];
  let best = null, bd = Infinity;
  for (const p of places) {
    if (!kind || p.kind !== kind || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    const d = Math.hypot(p.x - from[0], p.z - from[1]);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) return { x: Math.round(best.x), z: Math.round(best.z), name: best.name || job.where || job.name };
  if (job.id === 'farming' && sites.farms?.barn) return { x: Math.round(sites.farms.barn.x), z: Math.round(sites.farms.barn.z), name: 'Farm barn' };
  return null;
}
