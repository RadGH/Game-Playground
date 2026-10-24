// SKETCHY COPY — a simple doodle (a star, a house, a fish…) flashes up for a few seconds, then it is gone and you draw
// it from memory with your finger. No voting: the fair's Copy-O-Matic scores every drawing at once by how close its
// outline is to the original (size and position do not matter — both are fitted into the same box first), 0-100%.
// Three doodles, getting harder; each is worth up to 10 points. Then the gallery puts everyone's copies side by side
// with the original, which is the funny part. Alone: the same, with medals.
//
// Drawings travel like Draw the Disaster's: a stroke is "xxyyxxyy…" (two bytes a point on the 256 grid as four hex
// characters), sent in chunks with `ink` { s: stroke number, p: points } that append to the stroke they name. The
// score is worked out here from the points (pure, the same on every machine): both outlines are fitted into a 200-unit
// box, laid on a 48 x 48 grid, and compared with a one-cell allowance — how much of your ink is near the doodle
// (precision) and how much of the doodle your ink comes near (recall), combined (F1).
import { SHAPES, SHAPES_HW } from './shapes.js';

export const meta = {
  id: 'sketchy-copy', title: 'Sketchy Copy', blurb: 'Look at the doodle, then draw it from memory. How close can you get?',
  how: ['A doodle shows for a few seconds. Remember it!', 'Then draw it from memory with your finger.', 'The closer your copy, the more points. Size and place don\'t matter.'],
  kind: 'ui', min: 1, max: 4, seconds: 74, scoring: 'points', unit: 'points', tags: ['puzzle', 'social'], card: 'card-sketchy-copy', css: true,
  controls: { a: 'Done' },
};
export const ROUNDS = 3, COUNT_S = 2, REVEAL_S = 4.5, GALLERY_S = 8;
export const LEVELS = { easy: { show: 4, draw: 12, lv: [1, 1, 2] }, normal: { show: 3, draw: 11, lv: [1, 2, 3] }, hard: { show: 2.2, draw: 10, lv: [2, 3, 3] } };
export const MAX_STROKES = 40, MAX_POINTS = 600, MAX_CHUNK = 200;
export const MEDALS = [12, 18, 24];
export const G = 48, FLOOR = 0.3;
const HEX = /^[0-9a-f]*$/;

/** "xxyy…" -> [[x, y]…] */
export const ptsOf = p => { const out = []; for (let i = 0; i + 3 < p.length; i += 4) out.push([parseInt(p.substr(i, 2), 16), parseInt(p.substr(i + 2, 2), 16)]); return out; };
/** Strokes (each [[x, y]…]) -> the set of grid cells their outline crosses after fitting the whole thing into a 200 box. */
export function cellsOf(strokes) {
  const all = strokes.flat(); if (!all.length) return new Set();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of all) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const s = 200 / Math.max(24, x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = 256 / G, on = new Set();
  const mark = (x, y) => { const gx = Math.floor((128 + (x - cx) * s) / k), gy = Math.floor((128 + (y - cy) * s) / k); if (gx >= 0 && gy >= 0 && gx < G && gy < G) on.add(gy * G + gx); };
  for (const st of strokes) for (let i = 0; i < st.length; i++) {
    mark(st[i][0], st[i][1]);
    if (i) { const [ax, ay] = st[i - 1], [bx, by] = st[i], n = Math.ceil(Math.hypot(bx - ax, by - ay) * s / (k * 0.5)); for (let j = 1; j < n; j++) mark(ax + (bx - ax) * j / n, ay + (by - ay) * j / n); }
  }
  return on;
}
const near = (set, c) => { const x = c % G, y = (c / G) | 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < G && ny < G && set.has(ny * G + nx)) return true; } return false; };
/** How close a copy is to a doodle, 0-100. */
export function likeness(target, drawn) {
  const T = cellsOf(target), D = cellsOf(drawn); if (!D.size || !T.size) return 0;
  let p = 0, r = 0; for (const c of D) if (near(T, c)) p++; for (const c of T) if (near(D, c)) r++;
  const P = p / D.size, R = r / T.size, extra = Math.min(1, 1.5 * T.size / D.size);     // scribbling over everything is not a copy
  const f = P + R ? 2 * P * R / (P + R) * extra : 0;
  return Math.round(Math.max(0, (f - FLOOR) / (1 - FLOOR)) * 100);          // any outline overlaps a doodle a bit: the wrong shape scores ~40% raw, so that is the zero
}
export const pointsFor = pct => Math.round(pct / 10);

export function create({ rng, players, difficulty = 'normal', season = null }) {
  const L = LEVELS[difficulty] || LEVELS.normal, pids = players.map(p => p.pid), solo = pids.length === 1;
  const list = season === 'halloween' ? SHAPES_HW : SHAPES;
  const picks = [];                                                     // shape indices: same rng calls whatever the season
  for (const lv of L.lv) { const pool = SHAPES.map((s, i) => [s, i]).filter(([s, i]) => s.lv === lv && !picks.includes(i)).map(([, i]) => i); picks.push(rng.pick(pool)); }
  const P = Object.fromEntries(pids.map(p => [p, { score: 0, pct: 0, ink: [], used: 0, done: false }]));
  const art = [];                                                       // per finished round: { shape, ink: { pid: [strokes] }, pct: { pid } }
  let phase = 'count', round = -1, left = COUNT_S, over = false, last = null;
  const events = [];
  function next() { round++; phase = 'show'; left = L.show; for (const p of pids) Object.assign(P[p], { ink: [], used: 0, done: false }); }
  function settle() {
    const shape = list[picks[round]], r = { shape: picks[round], ink: {}, pct: {}, pts: {} };
    for (const p of pids) {
      const pct = likeness(shape.k, P[p].ink.map(ptsOf)), pts = pointsFor(pct);
      P[p].score += pts; P[p].pct += pct; r.ink[p] = P[p].ink.slice(); r.pct[p] = pct; r.pts[p] = pts;
    }
    art.push(r); last = { pct: r.pct, pts: r.pts };
    events.push({ e: 'art', round, ...r });
    phase = 'reveal'; left = REVEAL_S;
  }
  return {
    events,
    init: () => ({ rounds: ROUNDS, show: L.show, draw: L.draw, maxPoints: MAX_POINTS, maxStrokes: MAX_STROKES, maxChunk: MAX_CHUNK, solo, medals: MEDALS, season, art }),
    act(pid, a, d) {
      if (!P[pid] || phase !== 'draw' || over) return;
      const me = P[pid];
      if (a === 'done') { me.done = !!d || d === undefined; if (pids.every(p => P[p].done)) left = Math.min(left, 0.4); return; }
      if (me.done) return;
      if (a === 'clear') { me.ink = []; me.used = 0; return; }
      if (a !== 'ink' || !d || typeof d !== 'object' || !Number.isInteger(d.s) || typeof d.p !== 'string') return;
      if (d.p.length % 4 || d.p.length > MAX_CHUNK * 4 || !HEX.test(d.p)) return;
      const room = MAX_POINTS - me.used; if (room <= 0) return;
      const p = d.p.slice(0, room * 4);
      if (d.s === me.ink.length && me.ink.length < MAX_STROKES) me.ink.push(p);
      else if (d.s === me.ink.length - 1) me.ink[d.s] += p;
      else return;
      me.used += p.length / 4;
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'count') next();
      else if (phase === 'show') { phase = 'draw'; left = L.draw; }
      else if (phase === 'draw') settle();
      else if (phase === 'reveal') { if (round + 1 < ROUNDS) next(); else { phase = 'gallery'; left = GALLERY_S; } }
      else over = true;
    },
    state() {
      const g = { phase, round, left: Math.max(0, Math.ceil(left)), sc: Object.fromEntries(pids.map(p => [p, P[p].score])) };
      if (phase === 'show') g.shape = picks[round];
      if (phase === 'draw') g.done = pids.filter(p => P[p].done);
      if (phase === 'reveal') { g.shape = picks[round]; g.r = last; }
      return g;
    },
    priv: pid => ({ done: P[pid]?.done || false, n: P[pid]?.ink.length || 0 }),
    restore: pid => ({ ink: phase === 'draw' ? P[pid]?.ink.slice() : [] }),
    get over() { return over; },
    _P: P, _picks: picks, get _phase() { return phase; }, get _round() { return round; }, _list: list,
    result() {
      const scores = Object.fromEntries(pids.map(p => [p, P[p].score])), groups = new Map();
      for (const p of pids) { const k = P[p].score * 1000 + P[p].pct; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
      const r = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores, unit: meta.unit };
      if (solo) r.medal = MEDALS.filter(m => scores[pids[0]] >= m).length;
      return r;
    },
  };
}
