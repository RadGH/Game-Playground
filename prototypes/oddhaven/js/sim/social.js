// Who is what to whom (M6). The numbers are the same small rows as ever (`p.f`, feelings.js), capped per person. On top of them: `s.social.bonds`, the few
// relations with a name (dating, engaged, married), one row each. A daily pass off hashes, never the sim's random stream, moves the numbers for everyone, so people nobody
// has ever drawn make friends and fall out just as those on screen do; a chat you can see only adds to it.
//
//   s.social = { bonds: [{ a, b, k, t }], threads, done, meets, th, m }     see threads.js for the last four
//   c.partner  person id -> bond        c.foes  person id -> Set of people they are in a feud with        c.booked  people with a date in the diary (none saved)
import { log, say } from './log.js';
import { nudge, feelingIndex, friendsCheck } from './feelings.js';
import { hashString } from './rng.js';
import { fxOf } from './quirks.js';
import { raceTouch } from './racemood.js';
import { buildSchedule } from './people.js';
import { setBill } from './economy.js';

export const h01 = text => parseInt(hashString(text), 16) / 4294967296;
export const adult = p => p.age >= 18;

export function newSocial() { return { bonds: [], threads: [], done: [], meets: [], th: 0, m: 0 }; }

/** Couples who started the game together are married already. */
export function seedBonds(c) {
  const s = c.s;
  for (const h of s.households) if (h.ties === 'couple' && h.members.length === 2) s.social.bonds.push({ a: h.members[0], b: h.members[1], k: 'married', t: 0 });
}

export function refreshSocial(c) {
  const S = c.s.social;
  c.partner = new Map(); c.foes = new Map(); c.booked = new Set();
  for (const b of S.bonds) { c.partner.set(b.a, b); c.partner.set(b.b, b); }
  for (const th of S.threads) {
    if (th.k !== 'feud') continue;
    (c.foes.get(th.a) ?? c.foes.set(th.a, new Set()).get(th.a)).add(th.b);
    (c.foes.get(th.b) ?? c.foes.set(th.b, new Set()).get(th.b)).add(th.a);
  }
  for (const M of S.meets) { c.booked.add(M.a); c.booked.add(M.b); for (const g of M.g) c.booked.add(g); }
}

export const bondOf = (c, id) => c.partner.get(id) ?? null;
export const partnerId = (c, id) => { const b = c.partner.get(id); return b ? (b.a === id ? b.b : b.a) : -1; };
export const foesOf = (c, id) => c.foes.get(id) ?? null;
export const isFoe = (c, a, b) => !!c.foes.get(a)?.has(b);
/** A foe is standing at that place right now. */
export function foeAt(c, p, place) {
  const foes = c.foes.get(p.id); if (!foes) return false;
  for (const id of foes) if (c.s.people[id].at === place) return true;
  return false;
}
export const isSingle = (c, p) => adult(p) && !c.partner.has(p.id) && c.s.households[p.household].ties !== 'couple';
const feel = (c, a, b, name) => a.f[b.id]?.[feelingIndex(c, name)] ?? 0;
export { feel };

/** How well two people suit each other, -1 to 1: the same for this pair for ever, in either order. */
export function affinity(c, a, b) {
  const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id);
  let v = h01(`aff/${c.s.seed}/${lo}/${hi}`) * 1.4 - 0.7;
  if (a.race === b.race) v += 0.1;
  for (const t of a.traits) if (b.traits.includes(t)) v += 0.15;
  for (const q of a.quirks) if (b.quirks.includes(q)) v += 0.2;
  return Math.max(-1, Math.min(1, v));
}

/** What these two are to each other, in one word. */
export function relationOf(c, a, b) {
  if (a === b) return 'self';
  const bond = c.partner.get(a.id), k = bond && (bond.a === b.id || bond.b === b.id) ? bond.k : null;
  if (k === 'married') return 'spouse';
  if (k) return 'date';
  if (isFoe(c, a.id, b.id)) return 'foe';
  if (a.household === b.household) return 'housemate';
  if (feel(c, a, b, 'grudge') >= c.k.social.feudAt) return 'sour';
  if (a.work >= 0 && a.work === b.work) return 'coworker';
  if (feel(c, a, b, 'like') >= c.k.feelings.friendsAt) return 'friend';
  if (feel(c, a, b, 'known') >= 8) return 'known';
  return 'stranger';
}

function quietMeet(c, a, b, salt) {
  const k = c.k.social, fa = fxOf(c, a), fb = fxOf(c, b), aff = affinity(c, a, b);
  const known = Math.round(k.knownGain * Math.max(fa.knownGain ?? 1, fb.knownGain ?? 1));
  nudge(c, a, b.id, 'known', known); nudge(c, b, a.id, 'known', known);
  raceTouch(c, a, 'chat'); raceTouch(c, b, 'chat');
  const scale = person => person.traits.reduce((v, tr) => v * (c.traitById[tr].quarrelScale || 1), 1);
  if (h01(salt) < k.quarrelChance * Math.max(scale(a), scale(b)) * (aff < 0 ? 2 : 1)) {
    nudge(c, a, b.id, 'grudge', k.quarrelLoss); nudge(c, b, a.id, 'grudge', k.quarrelLoss);
    nudge(c, a, b.id, 'like', -k.quarrelLoss); nudge(c, b, a.id, 'like', -k.quarrelLoss);
    if (feel(c, a, b, 'grudge') >= k.feudAt && a.household !== b.household) log(c, 'quarrel', { a: a.id, b: b.id, quiet: 1 });
    return;
  }
  const gain = Math.round(k.likeGain * (0.6 + aff) * Math.min(fa.likeGain ?? 1, fb.likeGain ?? 1));
  if (!gain) return;
  const before = feel(c, a, b, 'like');
  nudge(c, a, b.id, 'like', gain); nudge(c, b, a.id, 'like', gain);
  friendsCheck(c, a, b, before);
}

/** Once a day, for everyone at every detail level: a couple of people from your circle. */
export function stepSocial(c) {
  const s = c.s, cl = c.clock, k = c.k.social, t = s.t;
  if (t % cl.ticksPerDay !== (cl.tickAt(1, k.hour * 60) % cl.ticksPerDay)) return;
  const day = cl.day(t), street = new Map();
  for (const h of s.households) { const node = c.places[h.home].node; if (!street.has(node)) street.set(node, []); street.get(node).push(...h.members); }
  for (const p of s.people) {
    const ring = [...(p.work >= 0 && p.work !== p.home ? c.staff[p.work] ?? [] : []), ...(street.get(c.places[p.home].node) ?? []), ...Object.keys(p.f).map(Number)];
    for (let i = 0; i < k.meetsPerDay && ring.length; i++) {
      const salt = `${s.seed}/${day}/${p.id}/${i}`, q = s.people[ring[Math.floor(h01(salt) * ring.length)]];
      if (q && q !== p) quietMeet(c, p, q, salt + 'q');
    }
  }
}

/** Two people set up home. One household keeps its address; the other person moves in with their car. False: they cannot, and stay in two homes. */
export function moveIn(c, a, b) {
  const s = c.s, ha = s.households[a.household], hb = s.households[b.household];
  if (ha === hb) { ha.ties = ha.members.length === 2 ? 'couple' : ha.ties; return true; }
  const can = (p, from, to) => {
    if (from.premade || from.homeWas !== undefined || to.homeWas !== undefined) return false;
    if (to.members.length >= (c.places[to.home].caps.bed ?? 2)) return false;
    return from.members.length === 1 || from.members.some(id => id !== p.id && (s.people[id].job || s.people[id].retired));
  };
  const first = hb.premade || ha.members.length > hb.members.length ? [a, ha, hb] : [b, hb, ha], second = first[0] === a ? [b, hb, ha] : [a, ha, hb];
  const go = can(...first) ? first : can(...second) ? second : null;
  if (!go) return false;
  const [p, from, to] = go;
  from.members.splice(from.members.indexOf(p.id), 1); to.members.push(p.id);
  p.household = to.id; p.home = to.home;
  const cars = from.cars.filter(id => s.cars[id].driver === p.id);
  for (const id of cars) { const car = s.cars[id]; car.household = to.id; from.cars.splice(from.cars.indexOf(id), 1); to.cars.push(id); if (car.at === from.home) car.at = to.home; }
  if (!from.members.length) { to.money += from.money; to.ledger.joined = (to.ledger.joined || 0) + from.money; from.ledger.joined = (from.ledger.joined || 0) - from.money; from.money = 0; }
  to.ties = to.members.length === 2 ? 'couple' : 'family';
  if (from.members.length === 1) from.ties = 'single';
  buildSchedule(c, p);
  setBill(c, from); setBill(c, to);
  say(c, 'moved.in', { who: p.id, from: from.id, to: to.id, home: to.home, cars });
  void log;
  return true;
}
