// The job referee (Expansion 1 M6, docs/EXPANSION-1.md "Jobs"): the one place a job's steps are checked and paid.
// PURE like room-core (no sockets, no timers): room-core makes one per room and hands it a small window onto the room.
// Every job with a referee in REFEREES gets one; farming is the first (js/game/jobs/farming.js). Fire, ambulance, tow,
// haul, combat, survey and the Moon jobs plug in the same way: write `<job>Referee(api)` in js/game/jobs/<job>.js,
// add it to REFEREES, and the wire, the pay, the co-op rule and the rate limits are already here.
//
//   const J = createJobsCore({ jobs: jobTable, sites, seed, now, room });
//   J.message(pid, msg)     a `{ t:'job', id, step, … }` from a player (protocol.js has checked its fields)
//   J.tick()                STATE_HZ times a second while the room plays (referees decide how often they work)
//   J.resync(pid)           the player arrived in a place: every job of that place sends its picture of the world
//   J.fixtures()            [{ kind, x, y, z, yaw }] vehicles the jobs park in the world (room-core adds them as pads)
//   J.profileChanged(pid)   the player's profile changed (an upgrade, a level): referees may tell them again
//   J.get(id)               a job's referee (tests)
//
// `room` (from room-core):
//   player(pid)   -> { pid, place, spec, seat: [entId, seat] | null, pos: [x,y,z] | null, profile } | null
//   ent(id)       -> { id, kind, owner, seats, pos: [x,y,z] | null, acts, place } | null
//   payees({ place, at, vehicle })   -> pids that count as helping (in the job vehicle, or within 30 m of `at`)
//   grant(pid, gold, why, { events, extra })   -> gold paid to one player (0 = nothing)
//   jobDone(pid, jobId, level, { at, vehicle, place })   (records + pays a level: room-core)
//   players()     -> [{ pid, place, spec, seat, pos, down }] everyone connected (M8: the raiders' targets)
//   send(pid, msg) / castIn(place, msg) / deny(pid, what, why)
//
// `api` handed to a referee (all a job needs; no other door into the room):
//   job, seed, sites, now()
//   player(pid), ent(id)                      as above
//   upgrades(pid) -> this job's upgrade ids the player owns;  unlocked(pid) -> [levels open];  nextLevel(pid) -> n | null
//   take(key, rate, burst, n = 1) -> bool     a token bucket (n units at once): false = too much, too fast — drop it
//   pay({ pid, step, count, at, vehicle, why }) -> the pids that count as helping. Gold goes out in BATCHES: every
//        `job.batch` (10) units of `step` done with that vehicle pays job.steps[step] gold to each helper — so one
//        cell is never a coin and a message cannot be split to earn more. The sender always counts as helping.
//   payGold({ pid, gold, at, vehicle, why }) -> the pids paid that gold (each gets the whole amount: rule 3)
//   levelDone(pid, level, { at, vehicle })    -> room-core jobDone (the level pay to every helper, recorded for each)
//   send(pid, payload) / cast(payload)        -> `{ t:'job', id, …payload }` to one player / everyone in the job's place
//   deny(pid, why)                            -> `{ t:'deny', what:'job', why }` (the toast says it)
//   players()                                 (M8) -> [{ pid, place, spec, seat, pos, down }] everyone connected
//   payTo({ pids, gold, at, vehicle, why })   (M7) -> pids paid: `pids` (everyone who worked the job, e.g. every truck
//        that sprayed a fire) plus the usual helpers (in `vehicle` / within 30 m of `at`), each the whole amount, once
//   spawn({ kind, p, yaw, owner, noSeat }) -> entId | null   (M7) a job vehicle in the job's place (a runaway car, a
//        wreck), simulated by `owner`'s machine; `noSeat` = nobody may sit in it (a wreck is towed, not driven)
//   remove(entId)                             (M7) take a job vehicle away again (a wreck dropped at the yard)
//   saveProfile(pid)                          (M10) the referee changed the player's live profile (survey: profile.sites):
//        the room keeps it (store.changed) and sends the player their profile
//   award(pid, when) -> ids                   (M12) an achievement event for one player (data/achievements.json `when`)
//   sendAs(jobId, pid, payload) / castAs(jobId, payload)   (M12) speak as another job (the Moon's kits as 'survey')
// A referee may list `claims: [jobIds]`: that job's steps from a player in THIS referee's place come here (M12).
//
// A referee returns { step(pid, msg), tick?(), resync?(pid), fixtures?(), profileChanged?(pid) } (or null: nothing to
// referee on this map, e.g. no farm plots in the old world).
import { jobState, unlockedLevels, nextLevel } from '../game/jobs/registry.js';
import { farmingReferee } from '../game/jobs/farming.js';
import { skydiveReferee } from '../game/jobs/skydive.js';
import { combatReferee } from '../game/jobs/combat.js';
import { fireReferee } from '../game/jobs/fire.js';
import { ambulanceReferee } from '../game/jobs/ambulance.js';
import { patrolReferee } from '../game/jobs/patrol.js';
import { towReferee } from '../game/jobs/tow.js';
import { haulReferee } from '../game/jobs/haul.js';
import { surveyReferee } from '../game/jobs/survey.js';
import { moonReferee } from '../game/jobs/moon.js';
import { sharesView } from './places.js';

export const REFEREES = Object.freeze({ farming: farmingReferee, skydive: skydiveReferee,
  // M7: the emergency and haul jobs (they need world.sites.jobSpots: County only)
  fire: fireReferee, ambulance: ambulanceReferee, patrol: patrolReferee, tow: towReferee, haul: haulReferee,
  combat: combatReferee,        // M8: the Rustwild raids (needs sites.rustwild: County only)
  survey: surveyReferee,        // M10: survey kits (needs sites.surveyGrid + a survey_office place: County only)
  moon: moonReferee });         // M12: Moon Work (reads sites.moon = js/game/jobs/moon.js moonJobSites, built with the County)
export const JOB_BATCH = 10;

export function createJobsCore({ jobs = new Map(), sites = {}, seed = 1, now = () => Date.now(), room, referees = REFEREES }) {
  const refs = new Map();
  const buckets = new Map();        // key -> { n, at }
  const carry = new Map();          // `${job}:${vehicle | 'p' + pid}:${step}` -> units not yet paid
  for (const [id, make] of Object.entries(referees)) {
    const job = jobs.get(id); if (!job) continue;
    const place = job.place || 'county';
    const api = {
      job, seed, sites, now,
      player: pid => room.player(pid),
      ent: id2 => (id2 == null ? null : room.ent(id2)),
      upgrades: pid => jobState(room.player(pid)?.profile, id).upgrades,
      unlocked: pid => unlockedLevels(room.player(pid)?.profile || {}, job),
      nextLevel: pid => nextLevel(room.player(pid)?.profile || {}, job),
      take(key, rate, burst, n = 1) {
        const t = now(), k = id + ':' + key;
        let b = buckets.get(k); if (!b) { b = { n: burst, at: t }; buckets.set(k, b); }
        b.n = Math.min(burst, b.n + (t - b.at) / 1000 * rate); b.at = t;
        if (b.n < n) return false;
        b.n -= n; return true;
      },
      pay({ pid, step, count, at = null, vehicle = null, why = '' }) {
        const list = room.payees({ place, at, vehicle });
        if (!list.includes(pid)) list.unshift(pid);
        const rate = job.steps?.[step];
        if (Number.isFinite(rate) && rate > 0 && count > 0) {
          const per = job.batch || JOB_BATCH, k = `${id}:${vehicle ?? 'p' + pid}:${step}`;
          const have = (carry.get(k) || 0) + count, batches = Math.floor(have / per);
          carry.set(k, have - batches * per);
          if (batches > 0) for (const q of list) room.grant(q, batches * rate, why, { events: list.length > 1 ? ['coop_pay'] : [], extra: { job: id, step } });
        }
        return list;
      },
      payGold({ pid, gold, at = null, vehicle = null, why = '' }) {
        const list = room.payees({ place, at, vehicle });
        if (!list.includes(pid)) list.unshift(pid);
        return list.filter(q => room.grant(q, gold, why, { events: list.length > 1 ? ['coop_pay'] : [], extra: { job: id } }) > 0);
      },
      payTo({ pids = [], gold, at = null, vehicle = null, why = '' }) {
        const list = [...new Set([...pids, ...(at || vehicle != null ? room.payees({ place, at, vehicle }) : [])])];
        return list.filter(q => room.grant(q, gold, why, { events: list.length > 1 ? ['coop_pay'] : [], extra: { job: id } }) > 0);
      },
      spawn: o => room.spawn?.({ ...o, place, job: id }) ?? null,
      remove: id2 => room.remove?.(id2),
      saveProfile: pid => room.saveProfile?.(pid),     // M10: the referee changed the live profile (profile.sites): keep it + tell the player
      levelDone: (pid, level, { at = null, vehicle = null } = {}) => room.jobDone(pid, id, level, { at, vehicle, place }),
      players: () => (room.players?.() || []),      // M8 (combat): everyone connected — the raiders' targets
      award: (pid, when) => room.award?.(pid, { when }) || [],     // M12: a job's own achievement event (moon_sample, moon_ring…)
      send: (pid, payload) => room.send(pid, { t: 'job', id, ...payload }),
      sendAs: (as, pid, payload) => room.send(pid, { t: 'job', id: as, ...payload }),      // M12: the Moon's kits speak as 'survey'
      castAs: (as, payload) => room.castIn(place, { t: 'job', id: as, ...payload }),
      cast: payload => room.castIn(place, { t: 'job', id, ...payload }),
      deny: (pid, why) => room.deny(pid, 'job', why),
    };
    const ref = make(api);
    if (ref) refs.set(id, { ref, place });
  }
  return {
    message(pid, msg) {
      const r = refs.get(msg.id);
      const P = room.player(pid);
      if (!P || P.spec) return;
      if (!r || !sharesView(P.place, r.place)) {
        // M12: a referee of another place may take this job's steps there (the Moon's survey kits: `claims: ['survey']`)
        for (const x of refs.values()) if (x.ref.claims?.includes(msg.id) && sharesView(P.place, x.place)) return x.ref.step(pid, msg);
        return;
      }
      r.ref.step(pid, msg);
    },
    tick() { for (const { ref } of refs.values()) ref.tick?.(); },
    resync(pid) {
      const P = room.player(pid); if (!P || P.spec) return;
      for (const { ref, place } of refs.values()) if (sharesView(P.place, place)) ref.resync?.(pid);
    },
    fixtures() { return [...refs.values()].flatMap(({ ref }) => ref.fixtures?.() || []); },
    profileChanged(pid) { for (const { ref } of refs.values()) ref.profileChanged?.(pid); },
    get: id => refs.get(id)?.ref || null,
    get ids() { return [...refs.keys()]; },
  };
}
