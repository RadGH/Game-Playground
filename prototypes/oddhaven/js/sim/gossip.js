// What people have to talk about, how a street feels, and who stands where with whom: all read from what really happened, on request, and none of it changes the state. Facts only;
// the words are the page's (js/client/talk.js and the Oddhaven pack).
import { relationOf, partnerId, bondOf, foesOf, feel } from './social.js';
import { threadOf } from './threads.js';

const RECENT_DAYS = 8;

/** The topics two people could bring up, most interesting first: a list of { k, ...facts }, and what they are to each other. */
export function talkFacts(c, aId, bId) {
  const s = c.s, a = s.people[aId], b = s.people[bId]; if (!a || !b) return null;
  const rel = relationOf(c, a, b), out = [], since = s.t - RECENT_DAYS * c.clock.ticksPerDay, day = t => c.clock.day(s.t) - c.clock.day(t);
  const seen = new Set(), add = row => { if (!seen.has(row.k)) { seen.add(row.k); out.push(row); } };
  const feud = s.social.threads.find(x => x.k === 'feud' && ((x.a === aId && x.b === bId) || (x.a === bId && x.b === aId)));
  if (feud) add({ k: `cause_${feud.cause}`, stage: feud.stage, ago: day(feud.t0) });
  for (const M of s.social.meets) {
    if (M.a === aId || M.b === aId) add({ k: M.k === 'wedding' ? 'wedding_mine' : M.k === 'first_date' ? 'date_soon' : 'meet_soon', with: M.a === aId ? M.b : M.a, place: M.place });
    else if (M.g.includes(aId)) add({ k: 'wedding_guest', a: M.a, b: M.b, place: M.place });
  }
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i]; if (e.t < since) break;
    const mine = e.hh?.includes(a.household) || e.who === aId || e.a === aId || e.person === aId;
    if (e.kind === 'fire.out' && e.rooms > 0) add({ k: mine ? 'fire_mine' : 'fire_near', place: e.place, ago: day(e.t), rooms: e.rooms });
    else if (e.kind === 'rescued' && e.who === aId) add({ k: 'rescuer', person: e.person, ago: day(e.t) });
    else if (e.kind === 'rescued' && e.person === aId) add({ k: 'rescued', who: e.who, ago: day(e.t) });
    else if (e.kind === 'rehoused' && mine) add({ k: 'moved_out', place: e.place, ago: day(e.t) });
    else if (e.kind === 'promoted' && e.who === aId) add({ k: 'promoted', job: e.job, ago: day(e.t) });
    else if (e.kind === 'tow' && e.who === aId) add({ k: 'towed', ago: day(e.t) });
    else if (e.kind === 'mishap' && e.who === aId) add({ k: 'mishap', ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'rm_wedding' && !mine) add({ k: 'wedding_near', a: e.who, b: e.other, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'rm_first_ok' && mine) add({ k: 'date_went', with: e.who === aId ? e.other : e.who, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'rm_first_bad' && mine) add({ k: 'date_bad', with: e.who === aId ? e.other : e.who, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'rm_stood' && e.who === aId) add({ k: 'stood_up', with: e.other, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'rm_split' && mine) add({ k: 'split', with: e.who === aId ? e.other : e.who, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'fd_start' && !mine) add({ k: 'feud_near', a: e.who, b: e.other, cause: e.cause, ago: day(e.t) });
    else if (e.kind === 'story' && e.story === 'fd_prank' && e.other === aId) add({ k: 'pranked', by: e.who, prank: e.prank, ago: day(e.t) });
    if (out.length >= 6) break;
  }
  if (a.job) add({ k: 'job', job: a.job });
  return { rel, topics: out, cause: feud?.cause ?? null, stage: feud?.stage ?? 0, mate: partnerId(c, aId) };
}

/** The Phone's Who's Who: how this household stands, and the town's drama. */
export function whosWho(c, household, who) {
  const s = c.s, h = s.households[household]; if (!h) return null;
  const row = (id, th) => ({ id, name: s.people[id].name, race: s.people[id].race, look: s.people[id].look, ...(th ?? null) });
  const members = h.members.map(id => {
    const p = s.people[id], bond = bondOf(c, id), mate = partnerId(c, id), foes = [...(foesOf(c, id) ?? [])];
    const friends = Object.keys(p.f).map(Number).filter(o => s.people[o].household !== h.id && feel(c, p, s.people[o], 'like') >= c.k.feelings.friendsAt && !foes.includes(o) && o !== mate).sort((x, y) => feel(c, p, s.people[y], 'like') - feel(c, p, s.people[x], 'like')).slice(0, 5);
    const sour = Object.keys(p.f).map(Number).filter(o => s.people[o].household !== h.id && feel(c, p, s.people[o], 'grudge') >= c.k.social.feudAt && !foes.includes(o)).slice(0, 3);
    const flame = s.social.threads.find(x => x.k === 'romance' && !bond && (x.a === id || x.b === id));
    return {
      id, name: p.name, race: p.race, partner: mate >= 0 ? row(mate, { k: bond.k, since: bond.t }) : null,
      flame: flame ? row(flame.a === id ? flame.b : flame.a, { st: flame.st }) : null, friends: friends.map(o => row(o, { like: feel(c, p, s.people[o], 'like') })),
      feuds: foes.map(o => { const th = s.social.threads.find(x => x.k === 'feud' && [x.a, x.b].includes(id) && [x.a, x.b].includes(o)); return row(o, { cause: th?.cause, stage: th?.stage ?? 0, heat: Math.round(th?.heat ?? 0), since: th?.t0 ?? 0, th: th?.id }); }), sour: sour.map(o => row(o)),
    };
  });
  const feuds = s.social.threads.filter(x => x.k === 'feud').sort((x, y) => y.stage - x.stage || y.heat - x.heat).map(x => ({ a: x.a, b: x.b, an: s.people[x.a].name, bn: s.people[x.b].name, cause: x.cause, stage: x.stage, since: x.t0, id: x.id }));
  const romances = s.social.threads.filter(x => x.k === 'romance').map(x => ({ a: x.a, b: x.b, an: s.people[x.a].name, bn: s.people[x.b].name, st: x.st, id: x.id }));
  const married = s.social.bonds.filter(b => b.k === 'married' && b.t > 0).slice(-6).map(b => ({ a: b.a, b: b.b, an: s.people[b.a].name, bn: s.people[b.b].name, t: b.t }));
  return { members, feuds, romances, married, who };
}

/** A household's threads, for the Story app and the paper: facts, the beats in order. */
export const threadsFor = (c, household) => [...c.s.social.threads, ...c.s.social.done].filter(th => th.hh.includes(household) && th.beats.length).map(th => threadView(c, th));
export const threadView = (c, th) => ({ id: th.id, k: th.k, a: th.a, b: th.b, cause: th.cause, place: th.place, t0: th.t0, open: !th.end, st: th.st, stage: th.stage, beats: th.beats, from: th.from ? threadOf(c, th.from)?.k ?? null : null, fire: th.causeWas, rooms: th.rooms });

/** The street as weather, for the view from high up: one sign per block of town, worked out on the hour, never saved. */
export function stepSky(c) {
  const s = c.s, cl = c.clock;
  if (s.t % cl.ticks(60) && c.sky) return;
  const cells = new Map(), size = c.k.levels.l1Radius / 3;
  for (const p of s.people) {
    const pl = c.places[p.at >= 0 ? p.at : p.home], key = `${Math.round(pl.x / size)},${Math.round(pl.z / size)}`;
    let row = cells.get(key); if (!row) cells.set(key, row = { n: 0, mood: 0, x: 0, z: 0, foe: 0, love: 0 });
    row.n++; row.mood += p.mood; row.x += pl.x; row.z += pl.z;
    if (c.foes.has(p.id)) row.foe++;
    const b = bondOf(c, p.id); if (b && b.k !== 'married') row.love++;
  }
  c.sky = [...cells.values()].filter(r => r.n >= 3).map(r => [Math.round(r.x / r.n), Math.round(r.z / r.n), +(r.mood / r.n).toFixed(2), r.foe, r.love]);
  c.skyRev = (c.skyRev || 0) + 1;
}

/** What the signs over a head can say beyond the mood: bits. 1 in love, 2 a feud on, 4 lonely, 8 worn out, 16 hushed. */
export function weatherBits(c, p) {
  const b = bondOf(c, p.id), k = c.k.threads, comp = c.needIds.indexOf('company'), sl = c.needIds.indexOf('sleep');
  let bits = 0;
  const honeymoon = k.newlywedDays * c.clock.ticksPerDay;
  if (b && (b.k !== 'married' || (b.t > 0 && c.s.t - b.t < honeymoon))) bits |= 1;
  if (c.foes.has(p.id)) bits |= 2;
  if (p.n[comp] < 0.22) bits |= 4;
  if (p.n[sl] < 0.2) bits |= 8;
  if (p.hu > c.s.t) bits |= 16;
  return bits;
}
