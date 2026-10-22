// COSTUME CATWALK — a theme card ("Royal Ball", "Swamp Chic"…) and a tray of random wardrobe pieces for each player.
// 40 seconds to dress a runway model by tapping pieces onto slots, then every outfit walks the catwalk one at a time,
// anonymous and shuffled, strikes the pose its dresser chose, and everyone votes for a favourite (never their own).
// Points = votes received + the judge's ribbon (+1) given to exactly ONE outfit by a rule printed on screen from the
// start (most pieces that fit the theme / most pieces in one colour / most different colours; a tie on the rule goes to
// whoever finished dressing first). Two players can vote "both", so the ribbon settles it. Alone it is practice: the
// judge scores you against the theme (1 a fitting piece, +2 when three or more pieces share a colour).
//
// The outfit is TEMPORARY: it is a list of [pieceIndex, colourIndex] from this game's tray, never written to the
// player's look or costume. The model on the runway is a random body (race + seed rolled here) so the vote stays
// anonymous; every browser rebuilds the same avatar from pieces.js `dressedAvatar`. Everything a phone sends is checked
// against the tray it was dealt.
import { SLOTS, SLOT_IDS, PIECES, COLOURS, THEMES, POSES, RACES, JUDGE_RULES, worn, judgeScore, soloScore, themeFit } from './pieces.js';

export const meta = {
  id: 'costume-catwalk', title: 'Costume Catwalk', blurb: 'Dress up for the theme, strut the runway, win the vote!',
  how: ['Everyone gets a theme and a tray of random clothes.', 'Tap pieces to dress your model, then pick a pose.', 'Every outfit walks the runway (nobody knows whose is whose).', 'Vote for the best look (not your own!). The judge gives a ribbon too.'],
  kind: 'ui', min: 1, max: 4, seconds: 92, scoring: 'vote', unit: 'points', tags: ['social'], card: 'card-costume-catwalk', css: true,
};
export const DRESS_S = 40, WALK_S = 5.5, VOTE_S = 15, REVEAL_S = 8;
const MIN_FIT = 4;                                       // every tray holds at least this many pieces that fit the theme

/** Deal one tray: slot -> [[pieceIndex, colourIndex], …], `deal` different pieces per slot. */
export function dealTray(rng, theme) {
  const tray = {};
  for (const s of SLOTS) {
    const pool = PIECES.map((p, i) => i).filter(i => PIECES[i].slot === s.id);
    tray[s.id] = rng.shuffle(pool).slice(0, s.deal).map(p => [p, rng.int(0, COLOURS.length - 1)]);
  }
  // make sure the theme is reachable: swap fitting pieces into slots that have none, until MIN_FIT
  const fitsP = p => PIECES[p].tags.some(t => theme.likes.includes(t));
  const count = () => SLOT_IDS.reduce((n, s) => n + (tray[s].some(([p]) => fitsP(p)) ? 1 : 0), 0);
  for (const s of rng.shuffle(SLOT_IDS)) {
    if (count() >= MIN_FIT) break;
    if (tray[s].some(([p]) => fitsP(p))) continue;
    const have = new Set(tray[s].map(([p]) => p));
    const ok = PIECES.map((p, i) => i).filter(i => PIECES[i].slot === s && fitsP(i) && !have.has(i));
    if (ok.length) tray[s][0] = [rng.pick(ok), tray[s][0][1]];
  }
  return tray;
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const theme = rng.pick(THEMES), judge = rng.pick(JUDGE_RULES);
  const tray = {}, outfit = {}, pose = {}, model = {}, at = {}, points = {}, done = new Set();
  pids.forEach(p => {
    tray[p] = dealTray(rng, theme);
    outfit[p] = Object.fromEntries(SLOT_IDS.map(s => [s, -1]));
    pose[p] = rng.int(0, POSES.length - 1);
    model[p] = [rng.int(0, RACES.length - 1), rng.int(1, 999999)];
    at[p] = Infinity; points[p] = 0;
  });
  let phase = 'dress', left = DRESS_S, over = false, clock = 0, walk = 0;
  let order = null, show = null, reveal = null;
  const votes = {};

  const list = p => worn(tray[p], outfit[p]);
  function toRunway() {
    order = rng.shuffle(pids);
    show = order.map(p => ({ m: model[p], o: list(p), pose: pose[p] }));
    phase = 'runway'; walk = 0; left = WALK_S;
  }
  function settle() {
    const got = Object.fromEntries(pids.map(p => [p, 0]));
    for (const v of Object.values(votes)) { if (v === 'both') { for (const p of pids) got[p] += 1; } else got[order[v]] += 1; }
    let ribbon = null;
    const judged = Object.fromEntries(pids.map(p => [p, solo ? soloScore(theme, list(p)) : judgeScore(judge.id, theme, list(p))]));
    if (solo) points[pids[0]] = judged[pids[0]];
    else {
      const ranked = pids.filter(p => list(p).length).sort((a, b) => judged[b] - judged[a] || at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b));
      ribbon = ranked[0] ?? null;
      for (const p of pids) points[p] = got[p] + (p === ribbon ? 1 : 0);
    }
    reveal = { who: order, votes: { ...votes }, got, ribbon, judged, fit: Object.fromEntries(pids.map(p => [p, themeFit(theme, list(p))])) };
  }
  const canVote = p => order.length > 1 || (pids.length === 2 && order.length > 0);

  return {
    init: () => ({ theme, judge, solo, n: pids.length }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'dress') {
        if (a === 'wear') {
          if (!d || typeof d !== 'object' || !SLOT_IDS.includes(d.s) || !Number.isInteger(d.i)) return;
          if (d.i < -1 || d.i >= tray[pid][d.s].length) return;
          if (outfit[pid][d.s] === d.i) return;
          outfit[pid][d.s] = d.i; at[pid] = clock;
          if (done.has(pid)) done.delete(pid);
        } else if (a === 'pose') {
          if (!Number.isInteger(d) || d < 0 || d >= POSES.length) return;
          pose[pid] = d;
        } else if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (d === 'both') { if (pids.length !== 2) return; votes[pid] = 'both'; }
        else { if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid) return; votes[pid] = d; }
        if (pids.every(p => p in votes || !canVote(p))) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt; if (left > 0) return;
      if (phase === 'dress') toRunway();
      else if (phase === 'runway') {
        if (walk + 1 < show.length) { walk++; left = WALK_S; }
        else if (solo) { settle(); phase = 'reveal'; left = REVEAL_S; }
        else { phase = 'vote'; left = VOTE_S; }
      } else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'dress') g.done = pids.filter(p => done.has(p));
      if (show) g.show = show;
      if (phase === 'runway') g.walk = walk;
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ tray: tray[pid], outfit: { ...outfit[pid] }, pose: pose[pid], model: model[pid], done: done.has(pid), mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!order) { order = pids.slice(); show = order.map(p => ({ m: model[p], o: list(p), pose: pose[p] })); } settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
}
