// PIZZA PRONTO — a pizza stall at the fair, one counter per player. Orders come in on a ticket: the sauce, cheese or
// no cheese, and toppings in amounts and places ("3 pepperoni on the LEFT half", "4 olives anywhere"). Build it on your
// phone — tap the sauce and the cheese, pick a topping and tap (or drag) on the pizza to drop them — then slide it
// INTO THE OVEN. A bake bar runs from pale to golden to burnt: PULL IT OUT in the golden band. Every pizza scores
//   match  0-10  right sauce 2, right cheese 2, each topping line: exact count 2 (one off 1) + in the right place 1,
//                minus 1 for each topping nobody ordered (scaled to 10)
//   bake   0-4   golden 4, a little pale or dark 2, raw or burnt 0 (left in too long, it burns by itself)
//   speed  0-2   into the oven within the order's par time 2, within 1.6x par 1
// and then the next ticket. Everyone gets the same tickets in the same order, so it is a straight race. At the bell
// the gallery shows each cook's best pizza and their funniest one ("Charcoal Surprise", "Topping Avalanche"…).
// The phone sends WHEN it slid the pizza in and WHEN it pulled it out; the server judges the bake from those.
import { phoneTime, r2 } from '../toss-kit.js';

export const meta = {
  id: 'pizza-chef', title: 'Pizza Pronto', blurb: 'Build the pizza on the ticket, bake it golden, and serve it fast!',
  how: ['Copy the ticket: tap the sauce and cheese, pick a topping, tap the pizza.', 'Slide it INTO THE OVEN, then PULL IT OUT when the bar is golden.', 'Right toppings + golden bake + speed = points. Then the next order!'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'points', unit: 'points', tags: ['action'], card: 'card-pizza-chef', css: true,
};
export const TOPS = ['pep', 'mush', 'olive', 'pepper', 'pine'];
export const COUNT_S = 3, PLAY_S = 68, END_S = 7, ORDERS = 14, MAX_TOPS = 36, MEDALS = [25, 45, 65];
export const LEVELS = {
  easy: { bake: 4.4, n: [2, 4], lines: [1, 1, 2, 2, 2, 2], white: 0.15, noCheese: 0.08 },
  normal: { bake: 3.7, n: [2, 5], lines: [1, 2, 2, 2, 3, 2], white: 0.25, noCheese: 0.12 },
  hard: { bake: 3.1, n: [3, 6], lines: [2, 2, 3, 3, 3, 3], white: 0.3, noCheese: 0.15 },
};
export const BAKE = { pale: 0.5, gold: [0.62, 0.86], dark: 1.0, auto: 1.35 };   // fractions of the oven's bake time
export const TAGS = ['Chef\'s Kiss', 'Charcoal Surprise', 'Doughy Disaster', 'Topping Avalanche', 'Mystery Pie', 'Naked Pizza', 'Lonely Crust'];
export const par = o => 5 + 2.2 * o.lines.length;
const half = (x, where) => where === 'left' ? x <= 0.06 : where === 'right' ? x >= -0.06 : true;

/** The tickets: the same list for everyone, getting busier as it goes. */
export function makeOrders(rng, L) {
  const out = [];
  for (let i = 0; i < ORDERS; i++) {
    const nLines = L.lines[Math.min(i, L.lines.length - 1)], kinds = rng.shuffle(TOPS).slice(0, nLines);
    const halves = rng.shuffle(['left', 'right']);
    const lines = kinds.map((k, j) => ({ k: TOPS.indexOf(k), n: rng.int(L.n[0], L.n[1]), where: i === 0 ? 'all' : nLines > 1 && j < 2 && rng.chance(0.65) ? halves[j] : 'all' }));
    out.push({ i, sauce: rng.chance(L.white) ? 'white' : 'red', cheese: i > 1 && rng.chance(L.noCheese) ? 0 : 1, lines });
  }
  return out;
}
/** A pizza as sent: { s: 'red'|'white'|null, c: 0|1, tp: [[kind, x, y]…] } (x, y in -1..1, inside the circle). */
export function cleanPizza(d) {
  if (!d || typeof d !== 'object') return null;
  const s = d.s === 'red' || d.s === 'white' ? d.s : null, c = d.c ? 1 : 0;
  if (!Array.isArray(d.tp) || d.tp.length > MAX_TOPS) return null;
  const tp = [];
  for (const t of d.tp) {
    if (!Array.isArray(t) || t.length !== 3) return null;
    const [k, x, y] = t.map(Number);
    if (!Number.isInteger(k) || k < 0 || k >= TOPS.length || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 1.02) return null;
    tp.push([k, r2(x), r2(y)]);
  }
  return { s, c, tp };
}
/** How well a pizza matches its ticket: { match 0..10, extra (unordered kinds), counts }. */
export function judgeMatch(o, p) {
  let got = 0; const max = 4 + 3 * o.lines.length;
  if (p.s === o.sauce) got += 2;
  if (p.c === o.cheese) got += 2;
  const counts = TOPS.map((_, k) => p.tp.filter(t => t[0] === k).length);
  for (const ln of o.lines) {
    const mine = p.tp.filter(t => t[0] === ln.k), off = Math.abs(mine.length - ln.n);
    got += off === 0 ? 2 : off === 1 ? 1 : 0;
    if (mine.length && (ln.where === 'all' ? (ln.n < 2 || (mine.some(t => t[1] < 0) && mine.some(t => t[1] > 0))) : mine.every(t => half(t[1], ln.where)))) got += 1;
  }
  const extra = counts.filter((c, k) => c && !o.lines.some(ln => ln.k === k)).length;
  return { match: Math.max(0, Math.round(10 * Math.max(0, got - extra) / max)), extra, counts };
}
/** The bake (fraction of the bake time it was in for) -> { pts, word }. */
export function judgeBake(f) {
  if (f < BAKE.pale) return { pts: 0, word: 'raw' };
  if (f < BAKE.gold[0]) return { pts: 2, word: 'pale' };
  if (f <= BAKE.gold[1]) return { pts: 4, word: 'golden' };
  if (f <= BAKE.dark) return { pts: 2, word: 'dark' };
  return { pts: 0, word: 'burnt' };
}
/** A label for the gallery. */
export function tagOf(o, p, m, bakeWord) {
  if (bakeWord === 'burnt') return 1;
  if (bakeWord === 'raw') return 2;
  const want = o.lines.reduce((a, ln) => a + ln.n, 0);
  if (p.tp.length >= Math.max(want * 2, want + 6)) return 3;
  if (!p.tp.length) return 6;
  if (!p.s) return 5;
  if (m.extra || m.match < 5) return 4;
  return 0;
}
/** The pizza a perfect cook would make for an order (used by the tests and the bots). */
export function perfectPizza(o) {
  const tp = [];
  o.lines.forEach((ln, j) => {
    for (let i = 0; i < ln.n; i++) {
      const a = (i + 0.5) / ln.n * Math.PI + j * 0.7, r = 0.3 + 0.35 * ((i * 7 + j * 3) % 5) / 4;
      const x = ln.where === 'left' ? -0.15 - Math.abs(Math.sin(a)) * r : ln.where === 'right' ? 0.15 + Math.abs(Math.sin(a)) * r : (i % 2 ? 1 : -1) * (0.2 + 0.3 * Math.abs(Math.sin(a)));
      tp.push([ln.k, r2(Math.max(-0.85, Math.min(0.85, x))), r2(Math.cos(a) * 0.6)]);
    }
  });
  return { s: o.sauce, c: o.cheese, tp };
}

export function create({ rng, players, difficulty = 'normal' }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const orders = makeOrders(rng, L);
  const S = Object.fromEntries(pids.map(p => [p, { k: 0, start: 0, oven: null, pizza: null, pts: 0, made: 0, last: null, best: null, worst: null, lastT: null }]));
  const events = [];
  let phase = 'count', left = COUNT_S, el = 0, over = false, gallery = null;
  function serve(pid, t) {
    const s = S[pid], o = orders[s.k], p = s.pizza, f = (t - s.oven) / L.bake;
    const m = judgeMatch(o, p), b = judgeBake(f), build = s.oven - s.start, sp = build <= par(o) ? 2 : build <= par(o) * 1.6 ? 1 : 0;
    const pts = m.match + b.pts + sp, tag = tagOf(o, p, m, b.word);
    s.pts += pts; s.made++;
    const card = { k: s.k, s: p.s, c: p.c, tp: p.tp, bake: r2(Math.min(f, 2)), pts, tag };
    if (!s.best || pts > s.best.pts) s.best = card;
    if (!s.worst || pts < s.worst.pts || (pts === s.worst.pts && tag && !s.worst.tag)) s.worst = card;
    s.last = [pts, m.match, b.pts, sp, tag, s.k];
    events.push({ e: 'served', pid, k: s.k, pts, match: m.match, bake: b.pts, word: b.word, speed: sp, tag });
    s.k++; s.start = t; s.oven = null; s.pizza = null; s.lastT = t;
  }
  return {
    events,
    init: () => ({ solo, orders, level: L, bakeT: L.bake, bake: BAKE, tops: TOPS, play: PLAY_S, medals: MEDALS, tags: TAGS, max: MAX_TOPS }),
    act(pid, a, d) {
      const s = S[pid]; if (!s || phase !== 'play' || over || s.k >= ORDERS) return;
      if (a === 'oven') {
        if (s.oven != null) return;
        const t = phoneTime(d, el, s.lastT, { ahead: 0.15, lag: 1.0, max: PLAY_S }); if (t == null) return;
        const p = cleanPizza(d.p); if (!p) return;
        s.oven = t; s.pizza = p; s.lastT = t; events.push({ e: 'oven', pid, k: s.k });
      } else if (a === 'pull') {
        if (s.oven == null) return;
        const t = phoneTime(d, el, s.oven, { ahead: 0.15, lag: 1.0, max: PLAY_S + 1 }); if (t == null) return;
        serve(pid, t);
      }
    },
    step(dt) {
      if (over) return;
      if (phase === 'count') { left -= dt; if (left <= 0) { phase = 'play'; el = 0; } return; }
      if (phase === 'play') {
        el += dt;
        for (const p of pids) { const s = S[p]; if (s.oven != null && el - s.oven >= L.bake * BAKE.auto) serve(p, r2(s.oven + L.bake * BAKE.auto)); }
        if (el >= PLAY_S || pids.every(p => S[p].k >= ORDERS)) {
          for (const p of pids) if (S[p].oven != null) serve(p, Math.max(S[p].oven, Math.min(el, S[p].oven + L.bake * BAKE.auto)));
          phase = 'end'; left = END_S;
          gallery = Object.fromEntries(pids.map(p => [p, { best: S[p].best, worst: S[p].worst && S[p].worst !== S[p].best ? S[p].worst : null }]));
          events.push({ e: 'end' });
        }
      } else if (phase === 'end') { left -= dt; if (left <= 0) over = true; }
    },
    state() {
      const sc = {}, k = {}, ov = {}, last = {};
      for (const p of pids) { const s = S[p]; sc[p] = s.pts; k[p] = s.k; ov[p] = s.oven; last[p] = s.last; }
      const g = { phase, el: Math.floor(el * 2) / 2, sc, k, ov, last, left: phase === 'count' ? Math.max(0, Math.ceil(left)) : phase === 'end' ? 0 : Math.max(0, Math.ceil(PLAY_S - el)) };
      if (gallery) g.gal = gallery;
      return g;
    },
    get over() { return over; },
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, S[p].pts])), groups = new Map();
      for (const p of pids) { const key = S[p].pts; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(x => groups.get(x)), scores, unit: meta.unit, ...(solo ? { medal: MEDALS.filter(m => scores[pids[0]] >= m).length } : {}) };
    },
    get _el() { return el; }, get _phase() { return phase; }, _stats: S, _orders: orders, _level: L,
  };
}
