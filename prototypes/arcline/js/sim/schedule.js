// The Comms Array's timetable (owner 2026-11-16: "see passing ships and maybe request things from there, in addition to
// special things becoming available based on a schedule"). Two kinds of visit on top of the ships that pass on their
// own (ships.js):
//   regular visits — a merchant convoy and a warship patrol on a fixed beat, shown in the Comms panel as "in N days";
//   requests       — pay a fee at the Comms Array and a merchant or warship comes after a short delay.
// A visit only reaches you while a powered Comms Array is listening; a missed one waits for the next beat.
// A visit becomes an ordinary passing ship (r.ships.passing), so the strip, the Comms panel and ships.answer() treat it
// like any other. ships.js may grow a spawnShip(r, kind, opts) — used when it exists; otherwise the ship is made here
// in the same shape makeShip() uses.
//
// Pure: no DOM. Time = game days (r.day). Seeded randomness (the region's seed + a counter in r.schedule).
import * as ships from './ships.js';
import { T } from './tuning.js';
import { item } from './catalog.js';
import { rng } from '../../../../citykit/js/kit/rng.js';
import { fmt } from '../../../../shared/format.js';

/** Regular visits. every / first = game days (first counts from the founding). */
export const VISITS = [
  { id: 'convoy', kind: 'merchant', name: 'Merchant convoy', every: 75, first: 40, blurb: 'A trade convoy on its regular run: rare goods you can\'t make yourself.' },
  { id: 'patrol', kind: 'warship', name: 'Warship patrol', every: 100, first: 70, blurb: 'The orbital patrol passes on its beat and sells strike charges.' },
];
/** Requests made from the Comms Array. fee in credits, delay in game days, tier = Comms Array needed. */
export const REQUESTS = [
  { id: 'call-merchant', kind: 'merchant', name: 'Call a merchant', fee: 1500, delay: 10, tier: 1, blurb: 'A trader turns aside for your colony and passes overhead with rare goods.' },
  { id: 'call-warship', kind: 'warship', name: 'Call a warship', fee: 2500, delay: 6, tier: 1, blurb: 'A frigate comes by to sell orbital strike charges.' },
];
const KIND = { merchant: 'Merchant', warship: 'Warship' };
const CALL_A = ['Steady', 'Long', 'Silver', 'Northern', 'Patient', 'Cobalt', 'Brass', 'Open', 'Far', 'Quiet'];
const CALL_B = { merchant: ['Caravan', 'Convoy', 'Exchange', 'Ledger', 'Manifest'], warship: ['Patrol', 'Picket', 'Sentinel', 'Watch', 'Escort'] };

const dayLen = () => Math.max(0.1, T.dayLengthSec ?? 6);
export function ensureSchedule(r) {
  const s = r.schedule || (r.schedule = {});
  s.next ??= {}; s.requests ??= []; s.rolls ??= 0;
  const from = r.foundedDay ?? 0;
  for (const v of VISITS) s.next[v.id] ??= from + v.first;
  return s;
}
function roll(r) { const s = r.schedule; s.rolls++; return rng((r.seed || 1) * 4513 + s.rolls * 7681); }

/**
 * Advance the timetable to r.day (call once a game day). → events:
 *   { type: 'ship-arrived', ship, why: 'convoy'|'patrol'|'request' }   a visit is now overhead
 *   { type: 'visit-missed', name }                                       no powered Comms Array when it came by
 */
export function scheduleTick(r) {
  const s = ensureSchedule(r), ev = []; if (!r.founded) return ev;
  const online = ships.commsTier(r) > 0;
  for (const v of VISITS) {
    if (r.day < s.next[v.id]) continue;
    s.next[v.id] = Math.max(s.next[v.id] + v.every, r.day + v.every * 0.5);
    if (!online) { ev.push({ type: 'visit-missed', name: v.name }); continue; }
    const sh = spawnVisit(r, v.kind, v.id); if (sh) ev.push({ type: 'ship-arrived', ship: ships.shipView(r, sh), why: v.id });
  }
  for (const q of [...s.requests]) {
    if (r.day < q.due) continue;
    if (!online) continue;              // a called ship waits for the array to come back
    s.requests = s.requests.filter(x => x !== q);
    const sh = spawnVisit(r, q.kind, 'request'); if (sh) ev.push({ type: 'ship-arrived', ship: ships.shipView(r, sh), why: 'request' });
  }
  return ev;
}

/** Put a merchant or warship overhead now. → the ship (in r.ships.passing) or null (a merchant with nothing new). */
export function spawnVisit(r, kind, why = 'request') {
  if (typeof ships.spawnShip === 'function') { const sh = ships.spawnShip(r, kind, { why }); if (sh) return sh; }
  ensureSchedule(r); const S = ships.ensureShips(r), R = roll(r);
  let offer;
  if (kind === 'merchant') { const goods = merchantGoods(r, R); if (!goods.length) return null; offer = { goods }; }
  else offer = { charges: R.int(1, 3), price: T.strikePrice ?? 4000, crystal: T.strikeCrystal ?? 40 };
  const name = `${R.pick(CALL_A)} ${R.pick(CALL_B[kind])}`;
  const cross = R.range(T.shipPassMinSec ?? 60, T.shipPassMaxSec ?? 90) * 1.5 / dayLen();   // called ships wait a little longer
  const sh = { id: ++S.seq, kind, cls: kind, name, title: `${KIND[kind]} ${name}`, came: r.day, leaves: r.day + cross, offer, answered: false, called: why };
  S.passing.push(sh);
  return sh;
}
function merchantGoods(r, R) {
  const rare = ships.commsTier(r) >= 3 || ships.hasSpaceport?.(r);
  const can = (ships.GOODS || []).filter(g => ships.goodOpen(r, g) && (!g.rare || rare));
  const out = [], pool = [...can];
  for (let k = 0; k < Math.min(3, pool.length); k++) out.push(pool.splice(R.int(0, pool.length - 1), 1)[0].id);
  return out;
}

/** Pay to call a ship. → { ok, why?, text } */
export function requestVisit(r, id) {
  const s = ensureSchedule(r), q = REQUESTS.find(x => x.id === id);
  const bad = requestProblem(r, q); if (bad) return { ok: false, why: bad };
  r.money -= q.fee;
  s.requests.push({ id: q.id, kind: q.kind, made: r.day, due: r.day + q.delay });
  r.log?.push({ day: Math.round(r.day), text: `${q.name}: paid ${fmt(q.fee)} credits.` });
  return { ok: true, text: `${KIND[q.kind]} called. It should pass overhead in about ${fmt(q.delay)} days.` };
}
function requestProblem(r, q) {
  if (!q) return 'Unknown request';
  const tier = ships.commsTier(r);
  if (!tier) return 'Needs a powered Comms Array';
  if (tier < q.tier) return 'Needs a bigger Comms Array';
  if (r.schedule.requests.some(x => x.id === q.id)) return 'Already on its way';
  if (r.money < q.fee) return `Needs ${fmt(q.fee)} credits`;
  return null;
}

/** Days → "in 3 days" / "today". Also the real seconds at normal speed. */
export function whenText(days) { const d = Math.ceil(Math.max(0, days)); return d <= 0 ? 'any moment' : d === 1 ? 'tomorrow' : `in ${fmt(d)} days`; }
/**
 * What the Comms panel's timetable shows.
 * → { online, visits: [{ id, kind, name, blurb, inDays, when, every }],
 *     requests: [{ id, kind, name, blurb, fee, delay, ok, why, pending: null | { inDays, when } }] }
 */
export function scheduleView(r) {
  const s = ensureSchedule(r);
  return {
    online: ships.commsTier(r) > 0,
    visits: VISITS.map(v => { const inDays = Math.max(0, s.next[v.id] - r.day); return { id: v.id, kind: v.kind, name: v.name, blurb: v.blurb, inDays, when: whenText(inDays), every: `every ${fmt(v.every)} days` }; })
      .sort((a, b) => a.inDays - b.inDays),
    requests: REQUESTS.map(q => {
      const p = s.requests.find(x => x.id === q.id), why = p ? null : requestProblem(r, q);
      return { id: q.id, kind: q.kind, name: q.name, blurb: q.blurb, fee: q.fee, delay: q.delay, ok: !p && !why, why, pending: p ? { inDays: Math.max(0, p.due - r.day), when: whenText(p.due - r.day) } : null };
    }),
  };
}
