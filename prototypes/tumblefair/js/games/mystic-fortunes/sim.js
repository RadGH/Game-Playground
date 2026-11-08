// MYSTIC FORTUNES — Mystic Mabel's tent. Each player writes a fortune FOR another player (alone: for yourself): a
// template with 2-3 blanks ("Tomorrow you will ___ ___ ___.") and a private hand of six word cards per blank. No typing:
// tap a blank, tap a card. Then the crystal ball reads every fortune out, one at a time, the cards flipping in; then
// everyone votes for the funniest (never their own).
//   Mabel is in a mood all game, printed from the start (food, animals, anything fancy, anything messy, music): every
//   hand holds at least two cards that suit it.
//   Points: 3 a vote received, +1 for filling every blank yourself, +2 "Mabel's favourite" for the fortune with the most
//   cards that suit her mood (a tie goes to whoever finished first).
//   Alone: no vote — 2 points a blank you filled + 3 a card that suits Mabel's mood (out of 15).
// A fortune with at least one card picked is finished by "the spirits" (random cards from the hand) when time runs
// out; a fortune with none is not read. Who wrote which fortune is private until the reveal.
import { CARDS, TEMPLATES, MOOD_IDS, blanksOf, moodCount } from './cards.js';

export const meta = {
  id: 'mystic-fortunes', title: 'Mystic Fortunes', blurb: "Fill in a friend's fortune with silly cards and win the crystal ball vote!",
  how: ["Write a friend's fortune: tap a blank, then tap a card for it.", 'Mystic Mabel loves cards that suit her mood: +2 for the best fortune.', 'The crystal ball reads them all out, then vote for the funniest (not your own).', '3 points a vote.'],
  kind: 'ui', min: 1, max: 4, seconds: 84, scoring: 'vote', unit: 'points', tags: ['social'], card: 'card-mystic-fortunes', css: true,
};
export const READY_S = 2, FILL_S = 30, READ_S = 5.5, VOTE_S = 14, REVEAL_S = 8;
export const HAND = 6, MOOD_IN_HAND = 2, VOTE_PTS = 3, FULL_PTS = 1, MABEL_PTS = 2, SOLO_BLANK = 2, SOLO_MOOD = 3;

/** One hand for a blank of `kind`: HAND different cards, at least MOOD_IN_HAND of them suit the mood. */
export function dealHand(rng, kind, mood) {
  const all = CARDS[kind].map((c, i) => i), fits = all.filter(i => CARDS[kind][i].tags.includes(mood));
  const pick = rng.shuffle(fits).slice(0, MOOD_IN_HAND), rest = rng.shuffle(all.filter(i => !pick.includes(i))).slice(0, HAND - pick.length);
  return rng.shuffle([...pick, ...rest]);
}
/** Solo practice score for one fortune. */
export const soloScore = (t, picks, mood) => picks.filter(c => c >= 0).length * SOLO_BLANK + moodCount(t, picks, mood) * SOLO_MOOD;

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const mood = rng.pick(MOOD_IDS);
  const ring = rng.shuffle(pids), forWho = {};
  ring.forEach((p, i) => { forWho[p] = ring[(i + 1) % ring.length]; });
  const temps = rng.shuffle(TEMPLATES.map((_, i) => i));
  const tpl = {}, hands = {}, picks = {}, auto = {}, at = {}, done = new Set(), votes = {}, points = {};
  pids.forEach((p, i) => {
    tpl[p] = temps[i];
    hands[p] = blanksOf(tpl[p]).map(k => dealHand(rng, k, mood));
    picks[p] = hands[p].map(() => -1); auto[p] = []; at[p] = Infinity; points[p] = 0;
  });
  let phase = 'ready', left = READY_S, over = false, clock = 0, list = null, cur = 0, reveal = null;

  const filled = p => picks[p].filter(c => c >= 0).length;
  function toRead() {
    // the spirits finish any fortune that was started; an untouched one is not read
    for (const p of pids) {
      if (!filled(p)) continue;
      picks[p].forEach((c, b) => { if (c < 0) { picks[p][b] = rng.pick(hands[p][b]); auto[p].push(b); } });
    }
    const order = rng.shuffle(pids.filter(p => filled(p)));
    list = order.map(p => ({ by: p, for: forWho[p], t: tpl[p], c: picks[p].slice(), auto: auto[p].slice() }));
    if (!list.length) { settle(); return; }
    phase = 'read'; cur = 0; left = READ_S;
  }
  const canVote = p => list.some(f => f.by !== p);
  function settle() {
    const got = Object.fromEntries(pids.map(p => [p, 0]));
    for (const v of Object.values(votes)) got[list[v].by] += 1;
    const moodOf = Object.fromEntries(pids.map(p => [p, moodCount(tpl[p], picks[p], mood)]));
    let favourite = null;
    if (solo) points[pids[0]] = soloScore(tpl[pids[0]], picks[pids[0]].map((c, b) => auto[pids[0]].includes(b) ? -1 : c), mood);
    else {
      const ranked = list.map(f => f.by).filter(p => moodOf[p] > 0).sort((a, b) => moodOf[b] - moodOf[a] || at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b));
      favourite = ranked[0] ?? null;
      for (const p of pids) points[p] = got[p] * VOTE_PTS + (filled(p) && !auto[p].length ? FULL_PTS : 0) + (p === favourite ? MABEL_PTS : 0);
    }
    reveal = { by: list.map(f => f.by), votes: { ...votes }, got, favourite, mood: Object.fromEntries(list.map(f => [f.by, moodOf[f.by]])) };
    phase = 'reveal'; left = REVEAL_S;
  }

  return {
    init: () => ({ solo, n: pids.length, mood }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'fill') {
        if (a === 'pick') {
          if (!d || typeof d !== 'object' || !Number.isInteger(d.b) || !Number.isInteger(d.c)) return;
          const h = hands[pid][d.b]; if (!h) return;
          if (d.c !== -1 && !h.includes(d.c)) return;
          if (picks[pid][d.b] === d.c) return;
          picks[pid][d.b] = d.c; at[pid] = clock; done.delete(pid);
        } else if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true || picks[pid].some(c => c < 0)) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (!Number.isInteger(d) || d < 0 || d >= list.length || list[d].by === pid) return;
        votes[pid] = d;
        if (pids.every(p => p in votes || !canVote(p))) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt; if (left > 1e-9) return;
      if (phase === 'ready') { phase = 'fill'; left = FILL_S; }
      else if (phase === 'fill') toRead();
      else if (phase === 'read') {
        if (cur + 1 < list.length) { cur++; left = READ_S; }
        else if (solo || !pids.some(canVote)) settle();
        else { phase = 'vote'; left = VOTE_S; }
      } else if (phase === 'vote') settle();
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'fill') { g.done = pids.filter(p => done.has(p)); g.filled = Object.fromEntries(pids.map(p => [p, filled(p)])); }
      if (list && phase !== 'fill') g.list = list.map(f => ({ for: f.for, t: f.t, c: f.c, auto: f.auto }));
      if (phase === 'read') g.cur = cur;
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ for: forWho[pid], t: tpl[pid], hand: hands[pid], pick: picks[pid].slice(), done: done.has(pid), mine: list ? list.findIndex(f => f.by === pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!list) { list = pids.filter(p => filled(p)).map(p => ({ by: p, for: forWho[p], t: tpl[p], c: picks[p].slice(), auto: [] })); } settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
}
