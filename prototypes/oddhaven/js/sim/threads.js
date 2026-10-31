// Stories that run across days (M6): the sim connects what happens, so the paper and a family's Story tell one thing you would retell. Three kinds of thread:
//   romance  a first date -> a second -> a couple -> the question -> a wedding and moving in. Can go wrong at every step, and a bad end can start a feud.
//   feud     starts for a stated reason (the hedge, a fire, being stood up), heats up day by day: words, a prank, a public row, a hearing at the town hall. Can end at any
//            point: fizzled, patched up, rescued by your enemy, ended by a wedding between the families.
//   fire     a home burns: who was carried out, who moved out, who was blamed, the thank-you, the repairs, the housewarming.
// Rolls are hashes, never the sim's random stream, so they run the same for people nobody has drawn. A thread's steps are ordinary facts: they go through log() as `story` rows, so
// Moments, Happening now, the Story and the paper all read them with no extra plumbing, and each carries `thread` and `part`.
//
//   th = { id, k, a, b, hh: [households], t0, st, next, beats: [[t, label]], cause?, heat?, from?, sign?, place?, tries? }     open: s.social.threads     finished: s.social.done
//
// A date, a row or a wedding is a MEET: both people really go there, at a time when neither is on shift or asleep, and the scene is a chat they have when both have arrived.
//   M = { i, k scene id, th, a, b, place, at, by, g: [guests], st: 0 booked | 1 sent for | 2 on }
import { log, say } from './log.js';
import { addMoodlet, settle } from './needs.js';
import { nudge } from './feelings.js';
import { canSpend, charge } from './economy.js';
import { isOpen } from './places.js';
import { inWindow } from './clock.js';
import { isWorkDay, joinChat, orderArrived } from './people.js';
import { sendMail } from './mail.js';
import { h01, adult, affinity, feel, isSingle, moveIn, refreshSocial, partnerId, isFoe } from './social.js';
import { raceTouch, rowMood } from './racemood.js';
import { fxOf } from './quirks.js';

const T = c => c.k.threads;
const person = (c, id) => c.s.people[id];
const open = (c, k) => c.s.social.threads.filter(x => x.k === k);
const salt = (c, ...bits) => `${c.s.seed}/${bits.join('/')}`;
const days = (c, d) => Math.round(d * c.clock.ticksPerDay);

function newThread(c, k, a, b, extra = {}) {
  const S = c.s.social, hh = [...new Set([person(c, a)?.household, person(c, b)?.household].filter(x => x !== undefined))];
  const th = { id: ++S.th, k, a, b, hh, t0: c.s.t, st: 'start', next: 0, beats: [], ...extra };
  S.threads.push(th);
  return th;
}
function close(c, th) {
  const S = c.s.social, k = T(c);
  S.threads.splice(S.threads.indexOf(th), 1);
  S.meets = S.meets.filter(M => M.th !== th.id);
  S.done.push(th);
  if (S.done.length > k.doneKeep) S.done.shift();
  th.end = c.s.t;
  refreshSocial(c);
}
/** One step of a thread: a fact in the log, numbered. */
function beat(c, th, label, facts = {}) {
  th.beats.push([c.s.t, label]);
  if (th.beats.length > T(c).beatsCap) th.beats.splice(1, 1);        // keep how it began
  log(c, 'story', { story: label, thread: th.id, part: th.beats.length, who: th.a, other: th.b, ...(th.cause ? { cause: th.cause } : null), ...(th.place !== undefined ? { place: th.place } : null), hh: th.hh, ...facts });
}
export const threadOf = (c, id) => c.s.social.threads.find(x => x.id === id) ?? c.s.social.done.find(x => x.id === id) ?? null;

// ---- when can two people meet?

function busyAt(c, p, tick) {
  const m = c.clock.minute(tick), day = c.clock.day(tick);
  if (inWindow(m, p.sch.bed, p.sch.wake)) return true;
  if (!p.job) return false;
  const job = c.jobById[p.job], [a, b] = job.shifts[p.shift], lead = c.clock.ticks(c.k.threads.meetLeadMinutes);
  for (let d = day - 1; d <= day; d++) {
    if (!isWorkDay(job, p, d)) continue;
    const from = c.clock.tickAt(d, a * 60) - lead, to = c.clock.tickAt(b > a ? d : d + 1, b * 60) + lead;
    if (tick >= from && tick < to) return true;
  }
  return false;
}
const SLOTS = [1110, 1170, 780, 1230, 840, 660, 960, 1020];
function freeTick(c, list, fromDay, spot) {
  for (let d = fromDay; d < fromDay + 3; d++) for (let i = 0; i < SLOTS.length; i++) {
    const m = SLOTS[(i + spot) % SLOTS.length], tick = c.clock.tickAt(d, m);
    if (tick > c.s.t + c.clock.ticks(90) && list.every(p => !busyAt(c, p, tick))) return { tick, minute: m };
  }
  return null;
}
function placeFor(c, k, a, b, minute) {
  const here = c.places[a.home], rows = [...c.places.filter(pl => pl.role !== 'home')];
  for (const want of c.d.social.scenes[k].places) {
    if (want === 'home') return here;
    let best = null, d = Infinity;
    for (const pl of rows) {
      if (pl.kind !== want && !pl.tags.includes(want)) continue;
      if (!isOpen(pl, minute) || c.burning.has(pl.building)) continue;
      const e = c.roads.distance(here.node, pl.node) + c.roads.distance(c.places[b.home].node, pl.node);
      if (e < d) { d = e; best = pl; }
    }
    if (best) return best;
  }
  return null;
}
function guestsFor(c, k, a, b) {
  const n = c.d.social.scenes[k].guests; if (!n) return [];
  const list = [], add = id => { if (id !== a.id && id !== b.id && !list.includes(id) && !isFoe(c, a.id, id) && !isFoe(c, b.id, id)) list.push(id); };
  for (const id of [...c.s.households[a.household].members, ...c.s.households[b.household].members]) add(id);
  const ring = [...Object.entries(a.f), ...Object.entries(b.f)].sort((x, y) => y[1][1] - x[1][1]).map(r => Number(r[0]));
  for (const id of ring) add(id);
  return list.slice(0, n);
}
/** Put a meet in the diary. Null: there is no time they could both make it. */
function book(c, th, k, a, b, inDays = 1) {
  const S = c.s.social, from = c.clock.day(c.s.t) + inDays, slot = freeTick(c, [a, b], from, Math.floor(h01(salt(c, 'slot', th?.id ?? 0, S.m)) * SLOTS.length));
  if (!slot) return null;
  const place = placeFor(c, k, a, b, slot.minute); if (!place) return null;
  const K = T(c), M = { i: ++S.m, k, th: th?.id ?? 0, a: a.id, b: b.id, place: place.id, at: slot.tick, by: slot.tick + c.clock.ticks(K.waitMinutes), g: guestsFor(c, k, a, b), st: 0 };
  S.meets.push(M); refreshSocial(c);
  if (th) th.place = place.id;
  return M;
}
const able = p => !p.call && !p.hurt && p.act?.a !== 'carried' && p.act?.a !== 'down' && p.act?.a !== 'clinic_stay' && !p.hold;
function sendFor(c, M, id) {
  const p = person(c, id);
  if (!able(p)) return;
  p.orders = [{ kind: 'meet', i: M.i }, ...p.orders].slice(0, c.k.orders.max);
  orderArrived(c, p);
}
const there = (c, M, p) => {
  if (p.hold) { const pl = c.places[M.place]; return Math.hypot(p.hold.x - pl.x, p.hold.z - pl.z) < 40; }
  return p.at === M.place && !p.trip;
};
function drop(c, M) { c.s.social.meets = c.s.social.meets.filter(x => x !== M); refreshSocial(c); }

function startScene(c, M) {
  const a = person(c, M.a), b = person(c, M.b), S = c.d.social.scenes[M.k];
  M.st = 2; M.end = c.s.t + c.clock.ticks(S.minutes);
  for (const p of [a, b]) if (!p.hold) { c.finishAct(c, p); p.goal = null; p.orders = p.orders.filter(o => !(o.kind === 'meet' && o.i === M.i)); }
  const lead = a.hold ? b : a, other = lead === a ? b : a;
  if (!lead.hold) joinChat(c, lead, other, null, { meet: M.i, stage: M.k, minutes: S.minutes });
  say(c, 'scene.start', { i: M.i, scene: M.k, a: M.a, b: M.b, place: M.place, th: M.th, until: M.end, guests: M.g });
}

/** Every few game minutes: send for people in time, start what can start, give up on what cannot. */
export function stepMeets(c) {
  const s = c.s, S = s.social;
  if (s.t % 8 || !S.meets.length) return;
  for (const M of [...S.meets]) {
    const a = person(c, M.a), b = person(c, M.b);
    if (M.st === 0) {
      const K = T(c), lead = Math.max(c.travelTicks(c, a, a.at >= 0 ? a.at : a.home, M.place), c.travelTicks(c, b, b.at >= 0 ? b.at : b.home, M.place)) + c.clock.ticks(K.gatherMinutes);
      if (s.t >= M.at - lead) { M.st = 1; sendFor(c, M, M.a); sendFor(c, M, M.b); for (const g of M.g) sendFor(c, M, g); }
    } else if (M.st === 1) {
      if (there(c, M, a) && there(c, M, b)) startScene(c, M);
      else if (s.t > M.by) noShow(c, M, there(c, M, a) ? b : a);
    } else if (s.t > (M.end ?? 0) + c.clock.ticks(10)) meetDone(c, M.i);
  }
}
function releaseGuests(c, M) {
  for (const id of [M.a, M.b, ...M.g]) { const p = person(c, id); p.orders = p.orders.filter(o => !(o.kind === 'meet' && o.i === M.i)); }
}
function noShow(c, M, p) {
  drop(c, M); releaseGuests(c, M);
  const th = threadOf(c, M.th), o = M.a === p.id ? person(c, M.b) : person(c, M.a);
  say(c, 'scene.off', { i: M.i, scene: M.k, a: M.a, b: M.b });
  if (!th || th.end) return;
  if (th.k === 'romance') {
    addMoodlet(c, o, 'stood_up', -0.14, 18); nudge(c, o, p.id, 'grudge', 12);
    beat(c, th, 'rm_stood', { who: o.id, other: p.id, place: M.place });
    th.tries = (th.tries || 0) + 1;
    if (th.tries > T(c).standUpRetries) { beat(c, th, 'rm_split'); close(c, th); startFeud(c, o, p, 'stood_up', { from: th.id }); return; }
    if (!book(c, th, M.k, person(c, th.a), person(c, th.b), 1)) { beat(c, th, 'rm_split'); close(c, th); }
  } else if (th.k === 'feud') {
    if (M.k === 'showdown') { beat(c, th, 'fd_noshow', { who: o.id, other: p.id }); endThreadFeud(c, th); } else th.stage = Math.min(th.stage, 2);
  } else if (M.k === 'housewarming' || M.k === 'thanks') maybeCloseArc(c, th);
}

/** A scene has finished: it went well or it did not, and the thread moves on. */
export function meetDone(c, i) {
  const M = c.s.social.meets.find(x => x.i === i); if (!M) return;
  drop(c, M); releaseGuests(c, M);
  const th = threadOf(c, M.th), a = person(c, M.a), b = person(c, M.b);
  const ok = sceneResult(c, M, th, a, b);
  say(c, 'scene.done', { i, scene: M.k, a: M.a, b: M.b, ok: ok ? 1 : 0 });
}

function sceneResult(c, M, th, a, b) {
  const K = T(c), aff = affinity(c, a, b), roll = h01(salt(c, 'scene', M.i));
  if (th?.k === 'romance') {
    if (M.k === 'first_date') {
      const ok = roll < K.firstOk + aff * 0.3;
      for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'known', 16); nudge(c, p, q.id, 'like', ok ? 12 : -6); if (ok) nudge(c, p, q.id, 'love', K.loveGain); addMoodlet(c, p, 'first_date', ok ? 0.12 : -0.07, 14); }
      if (ok) { beat(c, th, 'rm_first_ok', { place: M.place }); th.st = 'dating'; if (!book(c, th, 'second_date', a, b, K.secondDateDays)) th.next = c.s.t + days(c, 1); return true; }
      beat(c, th, 'rm_first_bad', { place: M.place }); close(c, th); return false;
    }
    if (M.k === 'second_date') {
      const ok = roll < K.secondOk + aff * 0.25;
      for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'like', ok ? 10 : -10); if (ok) nudge(c, p, q.id, 'love', K.loveGain + 6); else nudge(c, p, q.id, 'grudge', 10); addMoodlet(c, p, 'second_date', ok ? 0.14 : -0.1, 16); }
      if (!ok) { beat(c, th, 'rm_second_bad', { place: M.place }); beat(c, th, 'rm_split'); close(c, th); if (h01(salt(c, 'ex', th.id)) < 0.4) startFeud(c, a, b, 'ex', { from: th.id }); return false; }
      beat(c, th, 'rm_second_ok', { place: M.place });
      c.s.social.bonds.push({ a: a.id, b: b.id, k: 'dating', t: c.s.t }); refreshSocial(c);
      beat(c, th, 'rm_couple');
      th.st = 'couple'; th.next = c.s.t + days(c, K.familyDays);
      return true;
    }
    if (M.k === 'proposal') {
      const ok = roll < K.askOk + feel(c, a, b, 'love') / 400;
      if (ok) {
        const bond = c.partner.get(a.id); if (bond) bond.k = 'engaged';
        beat(c, th, 'rm_propose_yes', { place: M.place }); th.st = 'engaged';
        for (const p of [a, b]) addMoodlet(c, p, 'engaged', 0.16, 30);
        if (!book(c, th, 'wedding', a, b, K.weddingDays)) th.next = c.s.t + days(c, 1);
        return true;
      }
      beat(c, th, 'rm_propose_no', { place: M.place });
      th.tries = (th.tries || 0) + 1;
      addMoodlet(c, a, 'said_no', -0.1, 20);
      if (th.tries > 1) { beat(c, th, 'rm_split'); dropBond(c, a.id); close(c, th); return false; }
      th.st = 'couple'; th.next = c.s.t + days(c, K.proposeDays);
      return false;
    }
    if (M.k === 'wedding') { wed(c, th, a, b, M); return true; }
  }
  if (th?.k === 'feud') {
    if (M.k === 'row') {
      for (const [p, q] of [[a, b], [b, a]]) { addMoodlet(c, p, 'public_row', rowMood(c, p, -0.1), 12); nudge(c, p, q.id, 'grudge', 12); raceTouch(c, p, 'row'); }
      th.heat += 8; th.stage = 4; beat(c, th, 'fd_row', { place: M.place });
      return true;
    }
    if (M.k === 'showdown') {
      const lost = roll < 0.5 ? a : b, won = lost === a ? b : a, h = c.s.households[lost.household], fine = K.rulingFine;
      if (canSpend(c, h, fine)) charge(c, h, fine, 'fine');
      beat(c, th, 'fd_ruling', { who: won.id, other: lost.id, amount: fine, place: M.place });
      for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'grudge', -18); }
      endThreadFeud(c, th);
      return true;
    }
  }
  if (th?.k === 'fire') {
    if (M.k === 'thanks') { for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'like', 24); nudge(c, p, q.id, 'trust', 20); addMoodlet(c, p, 'thanks', 0.1, 14); } beat(c, th, 'fa_thanks', { who: a.id, other: b.id, place: M.place }); maybeCloseArc(c, th); return true; }
    if (M.k === 'housewarming') { for (const id of [M.a, M.b, ...M.g]) addMoodlet(c, person(c, id), 'housewarming', 0.1, 14); beat(c, th, 'fa_party', { who: a.id, other: b.id, place: M.place, guests: M.g.length }); close(c, th); return true; }
  }
  return true;
}
function dropBond(c, id) { const S = c.s.social; S.bonds = S.bonds.filter(b => b.a !== id && b.b !== id); refreshSocial(c); }

function wed(c, th, a, b, M) {
  const K = T(c), bond = c.partner.get(a.id);
  if (bond) { bond.k = 'married'; bond.t = c.s.t; } else c.s.social.bonds.push({ a: a.id, b: b.id, k: 'married', t: c.s.t });
  refreshSocial(c);
  for (const h of new Set([a.household, b.household])) { const hh = c.s.households[h]; if (canSpend(c, hh, K.weddingCost)) charge(c, hh, K.weddingCost, 'wedding'); }
  for (const id of [a.id, b.id, ...M.g]) { const p = person(c, id); addMoodlet(c, p, 'wedding', id === a.id || id === b.id ? 0.24 : 0.1, id === a.id || id === b.id ? 48 : 16); raceTouch(c, p, 'wedding'); }
  beat(c, th, 'rm_wedding', { place: M.place, guests: M.g.length });
  // the families' feud does not survive a wedding
  const feud = open(c, 'feud').find(x => x.hh.some(h => th.hh.includes(h)) && x.hh.every(h => th.hh.includes(h)));
  if (feud) { beat(c, feud, 'fd_wedding', { other2: th.a }); endThreadFeud(c, feud, true); }
  const moved = moveIn(c, a, b);
  if (moved) beat(c, th, 'rm_moved', { where: a.household });
  th.hh = [...new Set(th.hh)];
  close(c, th);
}

// ---- romance: every step has its time

export function startRomance(c, a, b, via = 'story', force = via === 'nudge' || via === 'stir') {
  const K = T(c);
  if (!isSingle(c, a) || !isSingle(c, b) || a.household === b.household || !adult(a) || !adult(b)) return null;
  if ((!force && open(c, 'romance').length >= K.maxRomance) || open(c, 'romance').some(x => [x.a, x.b].includes(a.id) || [x.a, x.b].includes(b.id))) return null;
  if (isFoe(c, a.id, b.id) && via !== 'stir') return null;
  const th = newThread(c, 'romance', a.id, b.id, { via });
  if (!book(c, th, 'first_date', a, b, 1)) { c.s.social.threads.pop(); return null; }
  beat(c, th, 'rm_spark', { place: th.place });
  // a thing between the two families? the town will want to know
  const feud = open(c, 'feud').find(x => x.hh.includes(a.household) && x.hh.includes(b.household));
  if (feud) { th.from = feud.id; beat(c, th, 'rm_feud_love', { cause: feud.cause }); }
  return th;
}

function stepRomance(c, th) {
  if (!th.next || c.s.t < th.next) return;
  th.next = 0;
  const K = T(c), a = person(c, th.a), b = person(c, th.b);
  if (th.st === 'dating') { if (!book(c, th, 'second_date', a, b, 1)) th.next = c.s.t + days(c, 1); return; }
  if (th.st === 'couple') {
    if (!th.met) {
      th.met = 1; beat(c, th, 'rm_family');
      // most couples are just couples. Some go on to ask, in their own time
      const roll = h01(salt(c, 'ask', th.id)), keen = th.hh.some(h => c.s.households[h].premade) ? K.marryShare * 1.6 : K.marryShare;
      if (roll >= keen) { beat(c, th, 'rm_steady'); close(c, th); return; }
      th.next = c.s.t + days(c, K.proposeDays + Math.floor(h01(salt(c, 'wait', th.id)) * K.proposeSpread)); return;
    }
    if (!book(c, th, 'proposal', a, b, 1)) th.next = c.s.t + days(c, 1);
    return;
  }
  if (th.st === 'engaged') { if (!book(c, th, 'wedding', a, b, 1)) th.next = c.s.t + days(c, 1); }
}

// ---- feuds

export const feudBetween = (c, a, b) => open(c, 'feud').find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)) ?? null;

export function startFeud(c, a, b, cause, { from = 0, force = false } = {}) {
  const K = T(c);
  if (a === b || a.household === b.household || partnerId(c, a.id) === b.id) return null;
  if (feudBetween(c, a.id, b.id) || (!force && open(c, 'feud').length >= K.maxFeuds)) return null;
  if ((c.foes.get(a.id)?.size ?? 0) >= K.maxFeudsEach || (c.foes.get(b.id)?.size ?? 0) >= K.maxFeudsEach) return null;
  const th = newThread(c, 'feud', a.id, b.id, { cause, heat: c.d.social.feudCauses[cause]?.heat ?? 15, stage: 0, ...(from ? { from } : null) });
  refreshSocial(c);
  for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'grudge', 14); nudge(c, p, q.id, 'like', -10); addMoodlet(c, p, 'feud', rowMood(c, p, -0.06), 12); }
  beat(c, th, 'fd_start');
  return th;
}
function endThreadFeud(c, th, kind = false) {
  th.ended = 1;
  const a = person(c, th.a), b = person(c, th.b);
  for (const [p, q] of [[a, b], [b, a]]) { nudge(c, p, q.id, 'grudge', kind ? -30 : -14); if (kind) nudge(c, p, q.id, 'like', 16); }
  delete th.sign; c.signRev = (c.signRev || 0) + 1;
  close(c, th);
}
/** Someone cooled it down: Stir, a spell, a good deed. */
export function endFeud(c, th, how, facts = {}) {
  beat(c, th, how, facts);
  endThreadFeud(c, th, true);
}
/** A spell or a word eased things. Enough of it and the feud is over. */
export function coolFeud(c, th, by) {
  th.heat = Math.max(0, th.heat + by);
  if (th.heat <= 0) endFeud(c, th, 'fd_hushed');
}

function prank(c, th) {
  const P = c.d.social.pranks, id = P[Math.floor(h01(salt(c, 'prank', th.id, th.beats.length)) * P.length)];
  const flip = h01(salt(c, 'by', th.id, th.beats.length)) < 0.5, by = person(c, flip ? th.b : th.a), to = person(c, flip ? th.a : th.b);
  addMoodlet(c, to, 'pranked', -0.08, 10);
  nudge(c, to, by.id, 'grudge', 8);
  sendMail(c, c.s.households[to.household], 'feud', { prank: id, a: by.id, b: to.id, cause: th.cause });
  th.sign = c.places[by.home].id; th.signKind = Math.floor(h01(salt(c, 'sign', th.id)) * c.d.social.signs); c.signRev = (c.signRev || 0) + 1;
  beat(c, th, 'fd_prank', { who: by.id, other: to.id, prank: id });
}

function stepFeud(c, th, day) {
  const K = T(c), a = person(c, th.a), b = person(c, th.b), who = [...c.s.households[a.household].members, ...c.s.households[b.household].members];
  const roll = h01(salt(c, 'feud', th.id, day));
  if (th.stage <= 1 && roll < K.fizzleChance) { beat(c, th, 'fd_fizzle'); endThreadFeud(c, th); return; }
  if (th.stage >= 2 && roll < K.coolChance) { endFeud(c, th, 'fd_patched'); return; }
  const gossip = who.some(id => fxOf(c, person(c, id)).stirs) ? K.gossipHeat : 0;
  th.heat += K.heatPerDay + h01(salt(c, 'heat', th.id, day)) * K.heatJitter + gossip;
  if (c.s.social.meets.some(M => M.th === th.id)) return;
  if (th.stage === 0 && th.heat >= K.words) { th.stage = 1; beat(c, th, 'fd_words'); return; }
  if (th.stage === 1 && th.heat >= K.prank) { th.stage = 2; prank(c, th); return; }
  if (th.stage === 2 && th.heat >= K.row) { th.stage = 3; if (!book(c, th, 'row', a, b, 1)) th.stage = 2; return; }
  if (th.stage === 4 && th.heat >= K.showdown) { th.stage = 5; if (!book(c, th, 'showdown', a, b, 1)) { th.stage = 4; prank(c, th); } return; }
  if (th.stage === 4 && h01(salt(c, 'again', th.id, day)) < 0.5) prank(c, th);
}

// ---- fire: the thread hangs on what fire.js already logs

function arcOf(c, e) { return c.s.social.threads.find(x => x.k === 'fire' && (x.fire === e.fire || (e.hh && e.place === x.place))) ?? null; }
function maybeCloseArc(c, th) {
  if (th.end) return;
  if (th.waitHome || c.s.social.meets.some(M => M.th === th.id)) return;
  if (th.repaired) close(c, th);
}

/** The family on the Story page: a fire is one thing that happened to them, with an end. */
function fireArc(c, e) {
  const s = c.s, K = T(c);
  if (e.kind === 'fire.start') {
    const pl = c.places[e.place];
    if (pl.role !== 'home' || open(c, 'fire').length >= K.maxArcs || !e.hh?.length) return;
    const h = s.households[e.hh[0]], a = h.members[0];
    if (a === undefined) return;
    const th = newThread(c, 'fire', e.who >= 0 && e.who !== undefined ? e.who : a, a, { fire: e.fire, place: e.place, hh: [...e.hh], cause: undefined });
    delete th.cause;
    return;
  }
  const th = arcOf(c, e); if (!th) return;
  const mark = () => { th.beats.push([s.t, e.story ?? e.kind]); e.thread = th.id; e.part = th.beats.length; };
  if (e.kind === 'rescued') {
    mark();
    const v = person(c, e.person), by = person(c, e.who), feud = feudBetween(c, v.id, by.id);
    if (feud) endFeud(c, feud, 'fd_rescue', { who: by.id, other: v.id, place: e.place });
    nudge(c, v, by.id, 'trust', 26); nudge(c, v, by.id, 'like', 18);
    th.owed = th.owed || []; th.owed.push(v.id, by.id);
  } else if (e.kind === 'fire.out') {
    if (!e.rooms && !e.rescued) { s.social.threads.splice(s.social.threads.indexOf(th), 1); return; }
    mark();
    th.rooms = e.rooms; th.causeWas = e.cause;
    if (!e.rooms) th.repaired = 1;
    if (th.owed) { const [v, by] = th.owed; book(c, th, 'thanks', person(c, v), person(c, by), K.thanksDays); }
    blame(c, th, e);
    maybeCloseArc(c, th);
  } else if (e.kind === 'rehoused') { mark(); th.waitHome = 1; th.moved = e.household; }
  else if (e.kind === 'home.again') {
    mark(); delete th.waitHome;
    const h = s.households[e.household], a = person(c, h.members[0]), near = neighbourOf(c, h);
    if (near && !book(c, th, 'housewarming', a, near, 1)) th.repaired = 1;
  } else if (e.kind === 'repaired') { mark(); th.repaired = 1; maybeCloseArc(c, th); } else if (e.kind === 'story' && e.story === 'pie') mark();
}
function neighbourOf(c, h) {
  const s = c.s, node = c.places[h.home].node;
  for (const q of s.households) if (q !== h && q.members.length && c.places[q.home].node === node) return s.people[q.members[0]];
  return null;
}
/** Someone next door wants to know whose stove it was. That is how a fire becomes a feud. */
function blame(c, th, e) {
  const K = T(c), s = c.s, who = th.a;
  if (e.cause === 'mishap' || h01(salt(c, 'blame', th.id)) >= K.blameChance || !e.rooms) return;
  const h = s.households[person(c, who).household], list = s.households.filter(q => q !== h && q.members.length && c.places[q.home].node === c.places[h.home].node);
  if (!list.length) return;
  const q = list[Math.floor(h01(salt(c, 'who', th.id)) * list.length)], other = s.people[q.members[0]];
  const feud = startFeud(c, other, person(c, who), 'fire', { from: th.id });
  if (feud) th.feud = feud.id;
}

// ---- what the log tells threads

export function threadsOnLog(c, e) {
  if (!c.s.social) return;
  if (e.kind === 'fire.start' || e.kind === 'rescued' || e.kind === 'fire.out' || e.kind === 'rehoused' || e.kind === 'home.again' || e.kind === 'repaired' || (e.kind === 'story' && e.story === 'pie')) { fireArc(c, e); return; }
  if (e.kind === 'stir') {
    const a = person(c, e.a), b = person(c, e.b), feud = feudBetween(c, a.id, b.id);
    if (e.stir === 'row' && e.ok) { if (feud) feud.heat += 16; else startFeud(c, a, b, 'row'); } else if (e.stir === 'patch' && e.ok && feud) endFeud(c, feud, 'fd_patched');
    else if (e.stir === 'date' && e.ok) { const th = startRomance(c, a, b, 'stir'); if (th) th.stir = 1; }
    return;
  }
  if (e.kind === 'quarrel') {
    const a = person(c, e.a), b = person(c, e.b), k = c.k.social;
    if (feel(c, a, b, 'grudge') >= k.feudAt && h01(salt(c, 'q', a.id, b.id, c.clock.day(e.t))) < k.quarrelFeudChance) startFeud(c, a, b, 'words');
    raceTouch(c, a, 'quarrel'); raceTouch(c, b, 'quarrel');
    return;
  }
  if (e.kind === 'promoted') {
    const p = person(c, e.who), mates = (c.staff[p.work] || []).filter(id => id !== p.id);
    if (mates.length && h01(salt(c, 'promo', p.id, e.t)) < c.k.social.promotionFeudChance) startFeud(c, p, person(c, mates[Math.floor(h01(salt(c, 'mate', p.id, e.t)) * mates.length)]), 'promotion');
  }
}

/** Once a day: feuds warm up, couples move on. New threads come from stories.js, Stir and the log. */
export function stepThreads(c) {
  const s = c.s, cl = c.clock, t = s.t, S = s.social;
  for (const th of [...S.threads]) if (th.k === 'romance') stepRomance(c, th);
  if (t % cl.ticksPerDay !== (cl.tickAt(1, T(c).hour * 60) % cl.ticksPerDay)) return;
  const day = cl.day(t);
  for (const th of [...S.threads]) if (th.k === 'feud' && S.threads.includes(th)) stepFeud(c, th, day);
}

/** The audit: what must always hold. */
export function socialProblems(c, fail) {
  const s = c.s, S = s.social, seen = new Set();
  for (const b of S.bonds) {
    for (const id of [b.a, b.b]) { if (seen.has(id)) fail(`person ${id} is in two bonds`); seen.add(id); if (!adult(s.people[id])) fail(`person ${id} is in a bond and not an adult`); }
    if (b.k === 'married' && b.t > 0 && s.people[b.a].household !== s.people[b.b].household && !s.people[b.a].apart) { /* two homes is allowed: no beds free, or a family they could not leave */ }
  }
  for (const th of S.threads) { if (th.k === 'romance' && (!adult(s.people[th.a]) || !adult(s.people[th.b]))) fail(`thread ${th.id}: romance with someone not an adult`); if (th.end) fail(`thread ${th.id} is both open and ended`); }
  for (const M of S.meets) { if (M.th && !S.threads.some(x => x.id === M.th)) fail(`meet ${M.i} has lost its thread`); if (s.t > M.by + c.clock.ticks(240) && M.st !== 2) fail(`meet ${M.i} is long past`); }
  for (const p of s.people) for (const o of p.orders) if (o.kind === 'meet' && !S.meets.some(M => M.i === o.i)) fail(`person ${p.id} is going to a meet that is off`);
}

// ---- what the page draws

export const signsView = c => c.s.social.threads.filter(x => x.sign !== undefined).map(x => [x.sign, x.signKind, x.id]);

/** Someone's life has no story yet: nudge one along. A family you can pick should never be left with nothing to read. */
export function nudgeStory(c, h, day) {
  const K = T(c), s = c.s, salts = salt(c, 'nudge', h.id, day);
  if (h01(salts) >= K.nudgeChance || S_busy(c, h)) return false;
  const lonely = h.members.map(id => s.people[id]).filter(p => isSingle(c, p));
  if (lonely.length) {
    const p = lonely[Math.floor(h01(salts + 'p') * lonely.length)], list = s.people.filter(q => q.household !== p.household && isSingle(c, q) && Math.abs(q.age - p.age) < 14 && affinity(c, p, q) > 0.05);
    if (list.length && startRomance(c, p, list[Math.floor(h01(salts + 'q') * list.length)], 'nudge')) return true;
  }
  // nobody to fall for: there is always the neighbour
  const node = c.places[h.home].node, near = s.households.filter(q => q !== h && q.members.length && c.places[q.home].node === node);
  if (!near.length) return false;
  const q = near[Math.floor(h01(salts + 'n') * near.length)], list = c.d.social.neighbourCauses, a = s.people[h.members[Math.floor(h01(salts + 'a') * h.members.length)]], b = s.people[q.members[0]];
  return !!startFeud(c, a, b, list[Math.floor(h01(salts + 'c') * list.length)], { force: true });
}
const S_busy = (c, h) => c.s.social.threads.some(x => x.hh.includes(h.id));
export { settle as _settle };
