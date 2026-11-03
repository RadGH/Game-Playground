// The always-open "Happening now" list (PLAN §1). Worked out from what is live and from the shared log's last hours, never saved, and
// reading it changes nothing. Facts only: the page writes the words. Sorted, most interesting first; only the top row may catch your eye.

import { liveMoments } from './moments.js';

const RECENT_HOURS = 2;
const LOGGED = { mishap: 2.5, wage: 3, tow: 3, ticket: 3.5, arrested: 5.5 };

export function happening(c, max = 8) {
  const s = c.s, t = s.t, rows = [], T = c.town.timber;
  for (const F of s.fire.fires) { const pl = c.places[F.place], C = s.fire.calls.find(x => x.id === F.call); rows.push({ k: 'fire', pri: 9.5, place: F.place, st: C?.st ?? 'none', n: Object.values(F.rooms).filter(R => R.h > 0).length, down: F.down?.length ?? 0, at: [pl.x, pl.z], jump: C?.crew[0] ?? -1 }); }
  for (const R of s.rifts.list) rows.push({ k: 'rift', pri: R.st === 'signs' ? 8.5 : 9.6, st: R.st, place: R.place, n: R.M.length, crew: R.crew.length, at: [R.x, R.z], jump: R.team?.[0] ?? -1 });
  for (const C of s.law.calls) if (C.st !== 'open' || C.k !== 'patrol') { if (C.k === 'patrol') continue; rows.push({ k: 'call', pri: 3 + c.d.law.calls[C.k].pri * 0.5, why: C.k, st: C.st, place: C.place, at: [C.x, C.z], jump: C.by }); }
  for (const m of liveMoments(c)) { if (m.pri >= 4 && m.k !== 'fire.call' && m.k !== 'rift.open' && m.k !== 'rift.signs') rows.push({ k: 'moment', m, pri: m.pri, t: m.t, at: m.at, jump: m.jump ?? -1 }); }
  const spot = id => { const p = s.people[id]; if (p.hold) return [p.hold.x, p.hold.z]; if (p.wpos && p.act?.a === 'site_work') return p.wpos; const pl = c.places[p.at >= 0 ? p.at : p.home]; return [pl.x, pl.z]; };
  for (const p of s.people) if (p.act?.stir) rows.push({ k: 'scene', pri: 8, a: p.id, b: p.act.with, stir: p.act.stir, at: spot(p.id) });
  for (const M of s.social.meets) if (M.st === 2) rows.push({ k: 'stage', pri: M.k === 'wedding' ? 9 : 7.5, a: M.a, b: M.b, scene: M.k, place: M.place, at: [c.places[M.place].x, c.places[M.place].z], i: M.i });
  for (const tr of s.trips) if (tr.state === 'flipped') { const q = c.roads.at(c.roads.byId(tr.route), tr.s); rows.push({ k: 'flipped', pri: 7, who: tr.driver, at: [q.x, q.z] }); }
  if (s.obstacles.length) rows.push({ k: 'blocked', pri: 5, n: s.obstacles.length, at: null });
  if (s.sites) {
    const S = s.sites, on = id => s.people[id].job, loggers = s.crew.filter(id => on(id) === 'logger'), sawyers = s.crew.filter(id => on(id) === 'sawyer');
    if (loggers.length) rows.push({ k: 'felling', pri: 2, n: loggers.length, at: [T.landing[0], T.landing[1] - 30] });
    if (sawyers.length) rows.push({ k: 'sawing', pri: 2, n: sawyers.length, at: T.deck });
    for (const car of s.cars) if (car.company && car.load > 0 && car.at < 0) { const trip = s.trips.find(x => x.car === car.id); if (trip) { const q = c.roads.at(c.roads.byId(trip.route), trip.s); rows.push({ k: 'truck', pri: 3, who: car.driver, planks: car.load, at: [q.x, q.z] }); } }
    if (S.deck >= c.k.work.deckCap) rows.push({ k: 'deckfull', pri: 3, at: T.deck });
    if (!Object.values(S.yards).some(n => n > 0)) rows.push({ k: 'noplanks', pri: 2, at: null });
  }
  const since = t - c.clock.ticks(RECENT_HOURS * 60);
  for (let i = s.log.length - 1, n = 0; i >= 0 && n < 40; i--, n++) {
    const e = s.log[i];
    if (e.t < since) break;
    if (!LOGGED[e.kind]) continue;
    const who = e.who ?? e.a;
    rows.push({ k: e.kind, pri: LOGGED[e.kind], who, a: e.a, b: e.b, stir: e.stir, ok: e.ok, why: e.why, t: e.t, at: who !== undefined ? spot(who) : null });
  }
  const m = c.clock.minute(t), every = c.k.economy.billsEveryDays;
  if (m >= 1080 && (c.clock.day(t) + 1) % every === 0) rows.push({ k: 'bills', pri: 1, at: null });
  rows.sort((a, b) => b.pri - a.pri || (b.t ?? t) - (a.t ?? t));
  return rows.slice(0, max);
}
