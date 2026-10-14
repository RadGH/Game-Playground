// DRAW THE DISASTER — everyone gets their own silly prompt and draws it on their phone, then the whole room looks at
// the gallery and votes for a favourite (never your own). Points = votes received, plus a judge's ribbon worth one
// point, given by a stated rule (most colours / most ink / most strokes), which also settles a 2-player game where each
// player can only vote for the other. Alone it is a practice round: draw anything and you score 1.
//
// Drawings travel as compact point lists: a stroke is [colour, brush, "xxyyxxyy…"] where every point is two bytes
// (0-255 on a square grid) written as four hex characters. A phone sends a long stroke in chunks (`ink`), each chunk
// appending to the stroke it names. Drawings live only in this match's memory; nothing is ever stored.
import PROMPTS_FILE from '../../../data/prompts.json' with { type: 'json' };

export const meta = {
  id: 'draw-the-disaster', title: 'Draw the Disaster', blurb: 'Draw the silly prompt, then vote for the best picture!',
  how: ['You each get a silly thing to draw. Only you can see yours.', 'Draw it on your phone before the clock runs out.', 'Then vote for your favourite picture (not your own!).', 'Every vote is a point, and the judge gives a ribbon too.'],
  kind: 'ui', min: 1, max: 4, seconds: 82, scoring: 'vote', unit: 'points', tags: ['social'], card: 'card-draw-the-disaster', css: true,
};
export const PROMPTS = PROMPTS_FILE.prompts;
export const COLORS = [
  { id: 'ink', name: 'Black', hex: '#1d1d24' }, { id: 'red', name: 'Red', hex: '#e8383d' }, { id: 'orange', name: 'Orange', hex: '#ff9a1f' },
  { id: 'yellow', name: 'Yellow', hex: '#ffd23f' }, { id: 'green', name: 'Green', hex: '#3ecf5a' }, { id: 'blue', name: 'Blue', hex: '#2f7ff0' },
  { id: 'purple', name: 'Purple', hex: '#9b4fe0' }, { id: 'brown', name: 'Brown', hex: '#8a5225' }, { id: 'white', name: 'Rubber', hex: '#ffffff' },
];
export const ERASER = COLORS.length - 1;          // white paints the paper colour back: it does not count as a colour
export const WIDTHS = [4, 12];                    // brush sizes on the 256 grid
export const DRAW_S = 45, VOTE_S = 20, REVEAL_S = 9, SHOW_S = 8;
export const MAX_STROKES = 300, MAX_POINTS = 5000, MAX_CHUNK = 400;   // per drawing; 5000 points = 20 KB of hex
export const JUDGE_RULES = [
  { id: 'colours', text: 'most colours used' },
  { id: 'ink', text: 'most ink on the page' },
  { id: 'strokes', text: 'most brush strokes' },
];
const HEX = /^[0-9a-f]+$/;

/** How much drawing a stroke list holds: colours used (rubber not counted), ink (length x brush) and strokes. */
export function measure(strokes) {
  const cols = new Set(); let ink = 0;
  for (const [c, w, p] of strokes) {
    if (c !== ERASER) cols.add(c);
    const n = p.length / 4; let len = 0;
    for (let i = 1; i < n; i++) {
      const x0 = parseInt(p.substr((i - 1) * 4, 2), 16), y0 = parseInt(p.substr((i - 1) * 4 + 2, 2), 16);
      const x1 = parseInt(p.substr(i * 4, 2), 16), y1 = parseInt(p.substr(i * 4 + 2, 2), 16);
      len += Math.hypot(x1 - x0, y1 - y0);
    }
    if (c !== ERASER) ink += (len + 1) * WIDTHS[w];
  }
  return { colours: cols.size, ink: Math.round(ink), strokes: strokes.filter(s => s[0] !== ERASER).length };
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const deck = rng.shuffle(PROMPTS);
  const prompt = {}, art = {}, ids = {}, lastId = {}, points = {}, done = new Set();
  pids.forEach((p, i) => { prompt[p] = deck[i % deck.length]; art[p] = []; ids[p] = []; lastId[p] = -1; points[p] = 0; });
  const judge = rng.pick(JUDGE_RULES);
  let phase = 'draw', left = DRAW_S, over = false;
  let order = null, gallery = null;                 // order[i] = pid of gallery picture i (seeded shuffle, anonymous until the reveal)
  const votes = {};                                 // voter -> gallery index or 'both'
  let reveal = null;
  const events = [];

  const used = pid => art[pid].reduce((n, s) => n + s[2].length / 4, 0);
  const blank = pid => art[pid].length === 0;
  function toGallery() {
    order = rng.shuffle(pids);
    gallery = order.map(pid => ({ prompt: prompt[pid], k: art[pid].map(s => s.slice()) }));
    events.push({ e: 'art', art: gallery });
    if (solo) { phase = 'reveal'; left = SHOW_S; settle(); return; }
    phase = 'vote'; left = VOTE_S;
  }
  function settle() {
    const got = {}; for (const p of pids) got[p] = 0;
    for (const [voter, v] of Object.entries(votes)) {
      if (v === 'both') { for (const p of pids) got[p] += 1; }
      else got[order[v]] += 1;
    }
    let ribbon = [];
    if (solo) { points[pids[0]] = blank(pids[0]) ? 0 : 1; }
    else {
      const m = Object.fromEntries(pids.filter(p => !blank(p)).map(p => [p, measure(art[p])[judge.id]]));
      const best = Math.max(0, ...Object.values(m));
      if (best > 0) ribbon = pids.filter(p => m[p] === best);
      for (const p of pids) points[p] = got[p] + (ribbon.includes(p) ? 1 : 0);
    }
    const stats = Object.fromEntries(pids.map(p => [p, measure(art[p])]));
    reveal = { who: order, votes: { ...votes }, got, ribbon, stats };
  }

  return {
    events,
    init: () => ({ colors: COLORS, widths: WIDTHS, eraser: ERASER, maxPoints: MAX_POINTS, maxStrokes: MAX_STROKES, maxChunk: MAX_CHUNK, judge, solo, art: gallery }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'draw') {
        if (a === 'ink') {
          if (!d || typeof d !== 'object' || Array.isArray(d)) return;
          const { s, c, w, p } = d;
          if (!Number.isInteger(s) || s < 0 || s > 1e6 || typeof p !== 'string' || !p.length || p.length % 4 || p.length > MAX_CHUNK * 4 || !HEX.test(p)) return;
          const room = MAX_POINTS - used(pid); if (room <= 0) return;
          const pts = p.slice(0, room * 4);
          if (s === ids[pid][ids[pid].length - 1]) { art[pid][art[pid].length - 1][2] += pts; return; }   // more of the stroke being drawn
          if (s <= lastId[pid] || art[pid].length >= MAX_STROKES) return;
          if (!Number.isInteger(c) || c < 0 || c >= COLORS.length || (w !== 0 && w !== 1)) return;
          art[pid].push([c, w, pts]); ids[pid].push(s); lastId[pid] = s; done.delete(pid);
        } else if (a === 'undo') { art[pid].pop(); ids[pid].pop(); }
        else if (a === 'clear') { art[pid].length = 0; ids[pid].length = 0; }
        else if (a === 'done') { if (d === false) done.delete(pid); else done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5); }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (d === 'both') { if (pids.length !== 2) return; votes[pid] = 'both'; }
        else { if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid || blank(order[d])) return; votes[pid] = d; }
        if (pids.every(p => p in votes || !canVote(p))) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 0) return;
      if (phase === 'draw') toGallery();
      else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), judge: judge.id };
      if (phase === 'draw') { g.n = Object.fromEntries(pids.map(p => [p, art[p].length])); g.done = pids.filter(p => done.has(p)); }
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    priv: pid => ({ prompt: prompt[pid], mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null, done: done.has(pid), n: art[pid].length, full: used(pid) >= MAX_POINTS }),
    get over() { return over; },
    result() {
      if (!reveal) settle();
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
  /** Somebody can vote only when there is a picture that is not theirs and not blank (or 'both' in a pair). */
  function canVote(p) { return pids.length === 2 || order.some(q => q !== p && !blank(q)); }
}
