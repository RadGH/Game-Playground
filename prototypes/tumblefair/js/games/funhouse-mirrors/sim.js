// FUNHOUSE MIRRORS — each player is handed ANOTHER player's face (alone: your own) in a wavy funhouse mirror and warps
// it with a few big controls: Tall, Wide, Bulge (the middle of the face swells or pinches), Twist (a lean), Wobble (it
// jiggles), a silly Tint and a stick-on Prop (moustache, glasses, party hat…). Every control is a small whole number;
// the browser draws them with CSS transforms only. Then the show: each mirror wobbles in one at a time, big, with the
// original face beside it. Then everyone votes for the funniest mirror (never the one they made).
//   Points: 3 a vote received, +1 for a finished mirror (silliness 3 or more), +1 "Silliest mirror" for the most
//   warped one (ties all get it). Alone there is no vote: your score is the silliness itself (0-18).
// Nothing about anyone's mirror is public until the show; who MADE each mirror stays private until the reveal.
export const meta = {
  id: 'funhouse-mirrors', title: 'Funhouse Mirrors', blurb: "Warp a friend's face in a funhouse mirror and win the giggle vote!",
  how: ["Make a friend's face as funny as you can in the funhouse mirror.", 'Tap − and + to stretch, bulge, twist and wobble. Add a tint and a prop!', 'Every mirror is shown off, then vote for the funniest (not your own).', '3 points a vote. Alone: the sillier the better.'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'vote', unit: 'points', tags: ['social'], card: 'card-funhouse-mirrors', css: true,
};
export const READY_S = 2, WARP_S = 32, SHOW_S = 4, VOTE_S = 14, REVEAL_S = 8;
export const VOTE_PTS = 3, DONE_PTS = 1, SILLY_PTS = 1, DONE_SILLY = 3;
/** The controls: key -> [min, max]. All start at 0 (a plain mirror). */
export const WARPS = Object.freeze({ tall: [-3, 3], wide: [-3, 3], bulge: [-3, 3], twist: [-3, 3], wobble: [0, 3], tint: [0, 5], prop: [0, 7] });
export const KEYS = Object.freeze(Object.keys(WARPS));
export const TINTS = Object.freeze(['Clear', 'Lime', 'Bubblegum', 'Ocean', 'Tangerine', 'Grape']);
export const PROPS = Object.freeze(['None', 'Moustache', 'Big glasses', 'Party hat', 'Clown nose', 'Bow tie', 'Unibrow', 'Star shades']);
export const plain = () => Object.fromEntries(KEYS.map(k => [k, 0]));

/** How far from a normal mirror a warp is: 0 (plain) to 18. */
export function silliness(w) {
  if (!w) return 0;
  return Math.abs(w.tall) + Math.abs(w.wide) + Math.abs(w.bulge) + Math.abs(w.twist) + w.wobble + (w.tint > 0 ? 1 : 0) + (w.prop > 0 ? 2 : 0);
}
/** A whole warp object from a phone, or null when anything in it is off. */
export function cleanWarp(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const out = {};
  for (const k of KEYS) { const v = d[k], [lo, hi] = WARPS[k]; if (!Number.isInteger(v) || v < lo || v > hi) return null; out[k] = v; }
  if (Object.keys(d).length !== KEYS.length) return null;
  return out;
}
/** Who gets whose face: a shuffled ring, so nobody gets their own (alone: yourself). pid -> pid */
export function dealFaces(rng, pids) {
  const ring = rng.shuffle(pids), of = {};
  ring.forEach((p, i) => { of[p] = ring[(i + 1) % ring.length]; });
  return of;
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const face = dealFaces(rng, pids), warp = {}, done = new Set(), votes = {}, points = {};
  pids.forEach(p => { warp[p] = plain(); points[p] = 0; });
  let phase = 'ready', left = READY_S, over = false, order = null, show = null, cur = 0, reveal = null;

  function toShow() {
    order = rng.shuffle(pids);
    show = order.map(p => ({ of: face[p], w: { ...warp[p] } }));
    phase = 'show'; cur = 0; left = SHOW_S;
  }
  function settle() {
    const got = Object.fromEntries(pids.map(p => [p, 0])), silly = Object.fromEntries(pids.map(p => [p, silliness(warp[p])]));
    for (const v of Object.values(votes)) got[order[v]] += 1;
    const top = Math.max(...Object.values(silly));
    const silliest = solo || top <= 0 ? [] : pids.filter(p => silly[p] === top);
    for (const p of pids) points[p] = solo ? silly[p] : got[p] * VOTE_PTS + (silly[p] >= DONE_SILLY ? DONE_PTS : 0) + (silliest.includes(p) ? SILLY_PTS : 0);
    reveal = { by: order.slice(), votes: { ...votes }, got, silly, silliest };
    phase = 'reveal'; left = REVEAL_S;
  }

  return {
    init: () => ({ solo, n: pids.length }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'warp') {
        if (a === 'warp') { const w = cleanWarp(d); if (!w) return; warp[pid] = w; return; }
        if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid) return;
        votes[pid] = d;
        if (pids.every(p => p in votes)) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'warp'; left = WARP_S; }
      else if (phase === 'warp') toShow();
      else if (phase === 'show') {
        if (cur + 1 < show.length) { cur++; left = SHOW_S; }
        else if (solo) settle();
        else { phase = 'vote'; left = VOTE_S; }
      } else if (phase === 'vote') settle();
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'warp') g.done = pids.filter(p => done.has(p));
      if (show) g.show = show;
      if (phase === 'show') g.cur = cur;
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ of: face[pid], warp: { ...warp[pid] }, done: done.has(pid), mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!order) { order = pids.slice(); show = order.map(p => ({ of: face[p], w: { ...warp[p] } })); } settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
}
