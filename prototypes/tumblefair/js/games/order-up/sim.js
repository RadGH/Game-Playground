// ORDER UP! — a fair food stand. A line of customers walks up, each one easy to tell apart by their hat, and each
// says their order in a bubble (a hot dog and a lemonade; popcorn; a pretzel, ice cream and a cookie…). Look while the
// bubbles are up. Then the bubbles pop and the customers come to the counter one at a time: put what THAT customer
// ordered on your tray and tap SERVE. Everyone serves the same customers at once on their own phone.
// This is BINDING memory (who wanted what), not a list in order: on Tricky the customers come back to the counter in
// a different order from the line, so you must know them by their hats.
// An order scores 1 a right item, -1 a wrong one (never below 0 for that order) and +2 when it is exactly right; the
// first player to serve the whole line +1. Every round one more customer joins the line.
// Difficulty: menu size (5 / 6 / 8 foods), items per order (1-2 / 1-3 / 2-3), how long the bubbles stay, and Tricky's
// shuffled counter. Alone: the same, with medals. Everything comes from the seed; an order is only in the state while
// its bubble is up, and again at the tally.
import { placeOrder } from '../toss-kit.js';
import { makeRng } from '../../shared/rng.js';

export const CUSTOMERS = 10, FOODS = 8;            // memory-icons.js: 10 customers, 8 foods (each with a Halloween twin)
export const meta = {
  id: 'order-up', title: 'Order Up!', blurb: 'Remember who ordered what — then serve every customer right!',
  how: ['Read every order while the bubbles are up.', 'Then serve each customer: tap their food, then SERVE.', 'Exactly right = +2 bonus. One more customer every round!'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'points', unit: 'tips', tags: ['puzzle'], card: 'card-order-up', css: true,
  controls: { a: 'Add food', b: 'Serve' },
};
export const READY_S = 2, LEAD_S = 0.8, TALLY_S = 2.6, END_S = 2.6, EXACT = 2, FIRST = 1, MAX_N = 7;
export const LEVELS = {
  easy: { foods: 5, items: [1, 2], start: 2, show: 2.0, base: 5, per: 4.0, shuffle: false },
  normal: { foods: 6, items: [1, 3], start: 2, show: 1.8, base: 5, per: 3.6, shuffle: false },
  hard: { foods: 8, items: [2, 3], start: 2, show: 1.6, base: 5, per: 3.4, shuffle: true },
};
export const MEDALS = { easy: [14, 22, 30], normal: [16, 26, 34], hard: [16, 26, 38] };
export const showTime = (L, n) => LEAD_S + L.show * n;
export const serveTime = (L, n) => L.base + L.per * n;
/** What one served tray is worth against the order. */
export function orderScore(order, items) {
  const want = new Set(order), got = new Set(items);
  let right = 0, wrong = 0; for (const i of got) want.has(i) ? right++ : wrong++;
  const exact = right === want.size && wrong === 0;
  return { right, wrong, exact, pts: Math.max(0, right - wrong) + (exact ? EXACT : 0) };
}
/** One round: `n` customers (different hats), their orders, and the order they come back to the counter in. */
export function makeRound(rng, L, n) {
  const who = rng.shuffle([...Array(CUSTOMERS).keys()]).slice(0, n);
  const orders = who.map(() => rng.shuffle([...Array(L.foods).keys()]).slice(0, rng.int(L.items[0], L.items[1])).sort((a, b) => a - b));
  const queue = L.shuffle ? rng.shuffle([...Array(n).keys()]) : [...Array(n).keys()];
  return { who, orders, queue };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const S = Object.fromEntries(pids.map(p => [p, { pts: 0, k: 0, served: [], exact: 0, done: false }]));
  let phase = 'ready', round = -1, n = L.start - 1, left = READY_S, el = 0, over = false, R = null, first = null;
  const events = [];
  const total = () => meta.seconds - END_S - 0.8;
  function nextRound() {
    const nn = n + 1, need = showTime(L, nn) + serveTime(L, nn) + TALLY_S;
    if (round >= 0 && (el + need > total() || nn > MAX_N)) { phase = 'end'; left = END_S; events.push({ e: 'end' }); return; }
    round++; n = nn; R = makeRound(rng, L, n); phase = 'show'; left = showTime(L, n); first = null;
    for (const p of pids) Object.assign(S[p], { k: 0, served: [], done: false });
    events.push({ e: 'show', round, n });
  }
  function tally() { phase = 'tally'; left = TALLY_S; events.push({ e: 'tally', round, first }); }
  return {
    events,
    init: () => ({ foods: L.foods, solo, medals: MEDALS[difficulty] || MEDALS.normal, shuffle: L.shuffle, maxItems: L.items[1], show: L.show, lead: LEAD_S }),
    act(pid, a, d) {
      if (a !== 'serve' || !S[pid] || phase !== 'serve' || over) return;
      const s = S[pid]; if (s.done) return;
      if (!d || typeof d !== 'object' || d.r !== round || d.k !== s.k || !Array.isArray(d.items) || d.items.length > 4) return;
      const items = [...new Set(d.items)];
      if (!items.every(i => Number.isInteger(i) && i >= 0 && i < L.foods)) return;
      const c = R.queue[s.k], sc = orderScore(R.orders[c], items);
      s.pts += sc.pts; if (sc.exact) s.exact++; s.served.push(items.sort((x, y) => x - y)); s.k++;
      events.push({ e: 'served', pid, k: s.k - 1, exact: sc.exact, pts: sc.pts });
      if (s.k >= n) {
        s.done = true;
        if (!solo && first == null) { first = pid; s.pts += FIRST; events.push({ e: 'first', pid }); }
      }
      if (pids.every(p => S[p].done)) tally();
    },
    step(dt) {
      if (over) return;
      el += dt; left -= dt; if (left > 1e-9) return;
      if (phase === 'ready' || phase === 'tally') nextRound();
      else if (phase === 'show') { phase = 'serve'; left = serveTime(L, n); events.push({ e: 'serve', round }); }
      else if (phase === 'serve') tally();
      else if (phase === 'end') over = true;
    },
    state() {
      const sc = {}, k = {};
      for (const p of pids) { sc[p] = S[p].pts; k[p] = S[p].k; }
      const g = { phase, round, n, left: Math.max(0, Math.ceil(left)), sc };
      if (R && phase !== 'end') {
        g.who = R.who;
        if (phase === 'show') g.orders = R.orders;
        if (phase === 'serve' || phase === 'tally') { g.queue = R.queue; g.k = k; }
        if (phase === 'tally') { g.orders = R.orders; g.first = first; g.served = Object.fromEntries(pids.map(p => [p, S[p].served])); }
      }
      return g;
    },
    priv: pid => ({ round, served: S[pid]?.served || [] }),
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts])), m = MEDALS[difficulty] || MEDALS.normal;
      return { order: placeOrder(pids, p => S[p].pts), scores, unit: meta.unit, exact: Object.fromEntries(pids.map(p => [p, S[p].exact])),
        ...(solo ? { medal: m.filter(x => S[pids[0]].pts >= x).length } : {}) };
    },
    get _phase() { return phase; }, get _round() { return round; }, get _R() { return R; }, _stats: S, _level: L,
  };
}

/** A cook that knows only what it READ in the bubbles. `keep` = the chance it remembers each item right (a slip
 *  swaps it for another food), `gap` = seconds per order it serves. Own rng, so it never moves the game's. */
export function orderBot(g, pid, { keep = 1, gap = 1.2, seed = 1 } = {}) {
  const r = makeRng(seed * 4241 + pid * 7867); let mem = null, memR = -1, wait = 0;
  return () => {
    const s = g.state();
    if (s.phase === 'show' && s.orders && memR !== s.round) {
      memR = s.round; const foods = g._level.foods;
      mem = new Map(s.who.map((c, i) => [c, s.orders[i].map(f => (r() < keep ? f : (f + 1 + Math.floor(r() * (foods - 1))) % foods))]));
    }
    if (s.phase !== 'serve' || !mem || s.k[pid] >= s.n) { wait = 0; return; }
    wait += 0.05; if (wait < gap) return; wait = 0;
    const kk = s.k[pid], c = s.who[s.queue[kk]];
    g.act(pid, 'serve', { r: s.round, k: kk, items: mem.get(c) || [0] });
  };
}
