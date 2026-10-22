// AUCTION OF CHAOS — six curios go under the hammer, one at a time. Everyone has 15 chips for the whole auction (they
// are worth nothing afterwards). Each lot shows its value on paper, its tags and a CLUE about its hidden TWIST
// (items.js). Everyone sets a secret bid and locks in; bids are revealed together.
//   Highest bid wins the lot and pays. A tie goes to whoever has fewer prizes, then more chips left; still tied: unsold.
//   Nobody bids: unsold.
// At the end every twist is revealed (a golden goose eats your best other item, a snow globe melts next to something
// hot, a love letter goes to the poorest rival…) and each haul is appraised. Biggest haul wins.
// Solo: you bid against Baron Bidwell, a CPU whose bids come from the seed. His haul counts for gifts and curses but he
// is not placed.
import { ITEMS } from './items.js';
export { ITEMS };

export const meta = {
  id: 'auction-of-chaos', title: 'Auction of Chaos', blurb: 'Bid on wonderful curios… each one hides a twist!',
  how: ['15 chips for the whole auction. Bid in secret on six curios.', 'Highest bid wins the lot and pays. Chips left over are worth nothing.', 'Every curio hides a twist: read the clue!', 'At the end the twists are revealed. Biggest haul wins.'],
  kind: 'ui', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['chance', 'social'], card: 'card-auction-of-chaos', css: true,
};
export const CHIPS = 15, LOTS = 6, START_S = 2, BID_S = 5.5, SOLD_S = 2.2, FINALE_S = 6.5, END_S = 1.5;
export const CPU = 'cpu', CPU_NAME = 'Baron Bidwell';
export const byId = id => ITEMS.find(i => i.id === id);
/** What a browser may know about an item before the finale. */
export const publicItem = i => ({ id: i.id, name: i.name, icon: i.icon, v: i.v, tags: i.tags, clue: i.clue });

/** Six different lots; never more than three that simply lose value. */
export function pickLots(rng) {
  for (;;) {
    const lots = rng.shuffle(ITEMS).slice(0, LOTS);
    if (lots.filter(i => i.fx.k === 'flat' && i.fx.n < 0).length <= 3) return lots;
  }
}
/** Who wins a lot. bids: id -> chips. owned/chips: id -> count. -> winner id or null */
export function settleLot(bids, owned, chips) {
  const ids = Object.keys(bids), top = Math.max(0, ...ids.map(k => bids[k]));
  if (top <= 0) return null;
  let best = ids.filter(k => bids[k] === top);
  if (best.length > 1) { const few = Math.min(...best.map(k => owned[k] || 0)); best = best.filter(k => (owned[k] || 0) === few); }
  if (best.length > 1) { const rich = Math.max(...best.map(k => chips[k])); best = best.filter(k => chips[k] === rich); }
  return best.length === 1 ? best[0] : null;
}
/**
 * The final appraisal. hauls: id -> [item ids, in the order won]; chips: id -> chips left; last: the last lot's item id.
 * -> { rows: id -> [{ id, base, value, dead, note }], total: id -> number (never below 0), moved: [[from, to, value, item]] }
 */
export function appraise(hauls, chips, last) {
  const ids = Object.keys(hauls), rows = {};
  for (const k of ids) rows[k] = hauls[k].map(id => ({ id, base: byId(id).v, value: byId(id).v, dead: false, note: '', hit: false }));
  const alive = k => rows[k].filter(r => !r.dead);
  // 1. things that destroy other things, in the order they were won
  for (const k of ids) for (const r of rows[k]) {
    if (r.dead) continue;
    const fx = byId(r.id).fx, others = () => alive(k).filter(o => o !== r);
    if (fx.k === 'eat') for (const o of others().sort((a, b) => b.base - a.base).slice(0, fx.n)) { o.dead = true; o.note = `eaten by the ${byId(r.id).name}`; r.hit = true; }
    if (fx.k === 'drop') { const o = others().sort((a, b) => a.base - b.base)[0]; if (o) { o.dead = true; o.note = 'dropped!'; r.hit = true; } }
    if (fx.k === 'spoil') for (const o of others().filter(o => byId(o.id).tags.includes(fx.tag))) { o.dead = true; o.note = `ruined by the ${byId(r.id).name}`; r.hit = true; }
  }
  // 2. every living item's own worth
  const rivalsDelta = Object.fromEntries(ids.map(k => [k, 0])), gifts = [];
  for (const k of ids) {
    const live = alive(k);
    for (const r of rows[k]) {
      if (r.dead) { r.value = 0; continue; }
      const fx = byId(r.id).fx, others = live.filter(o => o !== r), tagged = t => others.filter(o => byId(o.id).tags.includes(t)).length;
      if (fx.k === 'flat') r.value = r.base + fx.n;
      if (fx.k === 'perTag') r.value = r.base + fx.n * tagged(fx.tag);
      if (fx.k === 'clash' && tagged(fx.tag)) r.value = 0;
      if (fx.k === 'alone' && live.length === 1) r.value = r.base + fx.n;
      if (fx.k === 'crowd' && hauls[k].length >= fx.min) r.value = r.base + fx.n;
      if (fx.k === 'copy') r.value = Math.max(r.base, ...others.map(o => o.base));
      if (fx.k === 'chips') r.value = r.base + fx.n * chips[k];
      if (fx.k === 'broke' && chips[k] <= 3) r.value = r.base + fx.n;
      if (fx.k === 'lastLot' && r.id === last) r.value = r.base + fx.n;
      if (fx.k === 'rivals') for (const o of ids) if (o !== k) { rivalsDelta[o] += fx.n; r.hit = true; }
      if (fx.k === 'flat' || fx.k === 'clash' || r.value !== r.base) r.hit = r.hit || r.value !== r.base;
      if (fx.k === 'gift') gifts.push([k, r]);
    }
  }
  // 3. totals, curses on rivals, then gifts to whoever is poorest (ties: the first in seat order)
  const total = {};
  for (const k of ids) total[k] = rows[k].reduce((s, r) => s + r.value, 0) + rivalsDelta[k];
  const moved = [];
  for (const [k, r] of gifts) {
    const rivals = ids.filter(o => o !== k); if (!rivals.length) continue;
    const to = rivals.reduce((a, b) => total[b] < total[a] ? b : a);
    total[k] -= r.value; total[to] += r.value; moved.push([k, to, r.value, r.id]); r.note = 'given away'; r.hit = true;
  }
  for (const k of ids) total[k] = Math.max(0, total[k]);
  return { rows, total, moved, curse: rivalsDelta };
}
/** Baron Bidwell's bid: a share of the paper value, a little bolder late on, never more than he has. */
export function cpuBid(rng, item, chips, lotsLeft, difficulty = 'normal') {
  const nerve = difficulty === 'hard' ? 0.75 : difficulty === 'easy' ? 0.35 : 0.55;
  const want = item.v * rng.range(0.2, nerve) + (lotsLeft <= 2 ? chips / 3 : 0);
  return Math.max(0, Math.min(chips, Math.round(want)));
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1, ids = solo ? [...pids, CPU] : pids;
  const lots = pickLots(rng);
  const chips = Object.fromEntries(ids.map(k => [k, CHIPS])), hauls = Object.fromEntries(ids.map(k => [k, []]));
  let phase = 'ready', lot = -1, left = START_S, over = false, bids = {}, locked = new Set(), sold = null, final = null;
  const history = [];
  function next() { lot++; phase = 'bid'; left = BID_S; bids = {}; locked = new Set(); sold = null; }
  function settle() {
    const all = Object.fromEntries(pids.map(p => [p, bids[p] ?? 0]));
    if (solo) all[CPU] = cpuBid(rng, lots[lot], chips[CPU], LOTS - lot, difficulty);
    const owned = Object.fromEntries(ids.map(k => [k, hauls[k].length]));
    const w = settleLot(all, owned, chips);
    const win = w == null ? null : (w === CPU ? CPU : +w);
    if (win != null) { chips[win] -= all[win]; hauls[win].push(lots[lot].id); }
    sold = { win, bids: all, pay: win != null ? all[win] : 0 };
    history.push(win);
    phase = 'sold'; left = SOLD_S;
  }
  return {
    init: () => ({ lots: lots.map(publicItem), chips: CHIPS, solo, ...(solo ? { cpu: { pid: CPU, name: CPU_NAME } } : {}) }),
    act(pid, a, d) {
      if (phase !== 'bid' || !pids.includes(pid)) return;
      if (a === 'bid') { if (!Number.isInteger(d) || d < 0 || d > chips[pid]) return; bids[pid] = d; locked.delete(pid); }
      else if (a === 'lock') {
        if (d === false) { locked.delete(pid); return; }
        if (d !== true) return;
        locked.add(pid); if (pids.every(p => locked.has(p))) left = Math.min(left, 0.5);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') next();
      else if (phase === 'bid') settle();
      else if (phase === 'sold') { if (lot + 1 < LOTS) next(); else { final = appraise(hauls, chips, lots[LOTS - 1].id); phase = 'finale'; left = FINALE_S; } }
      else if (phase === 'finale') { phase = 'end'; left = END_S; }
      else over = true;
    },
    state() {
      const g = { phase, lot, left: Math.max(0, Math.ceil(left)), chips: { ...chips }, hauls: Object.fromEntries(ids.map(k => [k, hauls[k].length])), won: history };
      if (phase === 'bid') g.in = pids.filter(p => locked.has(p));
      if (phase === 'sold') g.sold = sold;
      if (final) {
        g.final = final; g.scores = { ...final.total };
        g.twists = Object.fromEntries(lots.map(i => [i.id, i.twist]));
      } else g.scores = Object.fromEntries(ids.map(k => [k, hauls[k].reduce((s, id) => s + byId(id).v, 0)]));   // on paper
      return g;
    },
    priv: pid => ({ bid: phase === 'bid' ? bids[pid] ?? 0 : null, locked: locked.has(pid) }),
    get over() { return over; },
    result() {
      const total = final ? final.total : appraise(hauls, chips, lots[LOTS - 1].id).total, groups = new Map();
      for (const p of pids) { if (!groups.has(total[p])) groups.set(total[p], []); groups.get(total[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, total[p]])), unit: meta.unit };
    },
  };
}
