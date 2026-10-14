// CAPTION CLASH — everyone sees the same silly picture and writes a caption for it on their phone. Then the captions
// are shown together, anonymous and shuffled, and everyone votes for a favourite (never their own). Points = votes
// received, plus the judge's ribbon worth one point, given to exactly ONE caption by a rule printed on screen (shortest
// caption / most words starting with the same letter / most words), with ties on the rule going to whoever finished
// first. In a 2-player game each player can only vote for the other (or "both"), so the ribbon is what settles it.
// Alone it is a practice round: write anything and you score 1.
//
// Captions are cleaned on the server: markup and control characters removed, spaces collapsed, 80 characters at most.
// A phone sends its draft as you type (`cap`) so a caption is never lost when the clock runs out, and `done` when you
// press Submit. Captions live only in this match's memory.
import SCENES_FILE from '../../../data/scenes.json' with { type: 'json' };

export const meta = {
  id: 'caption-clash', title: 'Caption Clash', blurb: 'Write the funniest caption, then vote!',
  how: ['Everyone gets the same silly picture.', 'Write a caption for it on your phone (stuck? ask for a starter).', 'Then vote for the funniest caption (not your own!).', 'Every vote is a point, and the judge gives a ribbon too.'],
  kind: 'ui', min: 1, max: 4, seconds: 76, scoring: 'vote', unit: 'points', tags: ['social'], card: 'card-caption-clash', css: true,
};
export const SCENES = SCENES_FILE.scenes;
export const OPENERS = SCENES_FILE.openers;
export const MAX_LEN = 80;
export const WRITE_S = 40, VOTE_S = 20, REVEAL_S = 9, SHOW_S = 8;
export const JUDGE_RULES = [
  { id: 'short', text: 'the shortest caption' },
  { id: 'allit', text: 'the most words starting with the same letter' },
  { id: 'words', text: 'the most words' },
];

/** A caption as the server keeps it: no markup, no control characters, single spaces, at most MAX_LEN characters. */
export function cleanCaption(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_LEN).trim();
}
const words = s => s.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
/** How a caption does on each judge rule (bigger is better for every one). */
export function judgeScore(rule, s) {
  if (rule === 'short') return -s.length;
  if (rule === 'words') return words(s).length;
  const n = new Map(); for (const w of words(s)) n.set(w[0], (n.get(w[0]) || 0) + 1);
  return Math.max(0, ...n.values());
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const scene = rng.pick(SCENES), judge = rng.pick(JUDGE_RULES);
  const openers = rng.shuffle(OPENERS);
  const cap = {}, at = {}, starter = {}, points = {}, done = new Set();
  pids.forEach((p, i) => { cap[p] = ''; at[p] = Infinity; starter[p] = (i * 3) % openers.length; points[p] = 0; });
  let phase = 'write', left = WRITE_S, over = false, clock = 0;
  let order = null;                                  // order[i] = pid of caption i (seeded shuffle, anonymous until the reveal)
  const votes = {};
  let reveal = null;

  const has = p => cap[p] !== '';
  function toGallery() {
    order = rng.shuffle(pids.filter(has));
    if (solo || !order.length) { phase = 'reveal'; left = SHOW_S; settle(); return; }
    phase = 'vote'; left = VOTE_S;
    if (pids.every(p => !canVote(p))) left = Math.min(left, 3);
  }
  function settle() {
    const got = {}; for (const p of pids) got[p] = 0;
    for (const v of Object.values(votes)) { if (v === 'both') { for (const p of pids) got[p] += 1; } else got[order[v]] += 1; }
    let ribbon = null;
    if (solo) points[pids[0]] = has(pids[0]) ? 1 : 0;
    else {
      // exactly one ribbon: best on the rule, then whoever finished their caption first, then seat order
      const ranked = pids.filter(has).sort((a, b) => judgeScore(judge.id, cap[b]) - judgeScore(judge.id, cap[a]) || at[a] - at[b] || pids.indexOf(a) - pids.indexOf(b));
      ribbon = ranked[0] ?? null;
      for (const p of pids) points[p] = got[p] + (p === ribbon ? 1 : 0);
    }
    reveal = { who: order, votes: { ...votes }, got, ribbon };
  }
  function canVote(p) { return order.some(q => q !== p) || (pids.length === 2 && order.length > 0); }

  return {
    init: () => ({ scene, judge, solo, max: MAX_LEN, caps: order ? order.map(p => cap[p]) : null }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'write') {
        if (a === 'cap') {
          if (typeof d !== 'string' || d.length > 400) return;
          const c = cleanCaption(d); if (c !== cap[pid]) { cap[pid] = c; at[pid] = clock; }
          if (!c) done.delete(pid);
        } else if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true || !has(pid)) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        } else if (a === 'starter') {
          starter[pid] = (starter[pid] + 3) % openers.length;
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (d === 'both') { if (pids.length !== 2 || !order.length) return; votes[pid] = 'both'; }
        else { if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid) return; votes[pid] = d; }
        if (pids.every(p => p in votes || !canVote(p))) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt; if (left > 0) return;
      if (phase === 'write') toGallery();
      else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)) };
      if (phase === 'write') { g.done = pids.filter(p => done.has(p)); g.typing = pids.filter(p => has(p) && !done.has(p)); }
      if (phase !== 'write') g.caps = order.map(p => cap[p]);
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({
      cap: cap[pid], done: done.has(pid), mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null,
      starters: [0, 1, 2].map(k => openers[(starter[pid] + k) % openers.length]),
    }),
    get over() { return over; },
    result() {
      if (!reveal) { if (!order) order = pids.filter(has); settle(); }
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
}
