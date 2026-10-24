// PUMPKIN CARVE-OFF (Halloween only) — everyone gets a secret prompt ("a surprised pumpkin", "a pirate pumpkin"…) and
// carves a jack-o'-lantern face on their phone by drawing on a big orange pumpkin: every stroke cuts a hole that glows
// with the candle inside. Then the lanterns are lit up in a row at night and everyone votes for the best one (never
// their own). The prompts are only shown at the reveal, so the votes are on the faces alone. Points = votes received,
// plus the Night Judge's ribbon (+1) given by a printed rule (most carved / most cuts / most even face), which also
// settles a 2-player game where each player can only vote for the other (or "both"). Alone, the judge scores your
// lantern 0-10 (some carving, plus a bonus for a face whose left matches its right).
//
// Carvings travel as compact point lists like Draw the Disaster: a cut is [tool, "xxyyxxyy…"], every point two bytes
// (0-255 on a square grid) as four hex characters; a phone sends a long cut in chunks (`cut`) that append to the cut it
// names. Nothing is ever stored past the match.
export const meta = {
  id: 'pumpkin-carve-off', title: 'Pumpkin Carve-Off', blurb: 'Carve the secret face on your pumpkin, then vote for the best lantern!',
  how: ['You each get a secret pumpkin to carve. Only you can see yours.', 'Draw on the pumpkin with your finger: every line glows.', 'The lanterns light up at night: vote for the best (not your own!).', 'Every vote is a point, and the Night Judge gives a ribbon too.'],
  kind: 'ui', min: 1, max: 4, seconds: 80, scoring: 'vote', unit: 'points', tags: ['social', 'holiday'], season: 'halloween', card: 'card-pumpkin-carve-off', css: true,
};
export const PROMPTS = [
  'a surprised pumpkin', 'a pumpkin who lost its sock', 'a pirate pumpkin', 'a sleepy pumpkin', 'a pumpkin who just sneezed',
  'a pumpkin who loves cake', 'a pumpkin with a moustache', 'a very shy pumpkin', 'a pumpkin who is trying not to laugh', 'a cat pumpkin',
  'a pumpkin with hiccups', 'a grumpy grandpa pumpkin', 'a pumpkin singing opera', 'a pumpkin who saw a tiny mouse', 'a robot pumpkin',
  'a pumpkin with braces', 'a pumpkin eating spaghetti', 'a winking pumpkin', 'a pumpkin who smelled a stinky sock', 'a royal king pumpkin',
  'a pumpkin with three eyes', 'a pumpkin blowing a bubble', 'a pumpkin who got a bad haircut', 'an owl pumpkin', 'a pumpkin who is very cold',
  'a pumpkin who won a prize', 'a pumpkin trying to whistle', 'a pumpkin with big glasses', 'a ghost pumpkin saying boo', 'a pumpkin with a toothache',
  'a dizzy pumpkin', 'a pumpkin who forgot its homework', 'a bat pumpkin', 'a pumpkin wearing a bow tie', 'a pumpkin making a silly face',
  'a pumpkin who is in love', 'a pumpkin who ate a lemon', 'a wizard pumpkin', 'a baby pumpkin', 'a pumpkin doing a big yawn',
  'a pumpkin who is scared of the dark', 'a pumpkin telling a secret', 'a vampire pumpkin with tiny fangs', 'a pumpkin with a beard', 'a star-eyed pumpkin',
  'a pumpkin who just woke up', 'a frog pumpkin', 'a pumpkin who smells pie', 'a pumpkin with a band-aid', 'a pumpkin dancing',
  // round 12: thirty more
  'a pumpkin who lost a tooth', 'a pumpkin astronaut', 'a pumpkin who heard a joke', 'a pumpkin with freckles', 'a pumpkin chef',
  'a pumpkin stuck in a hat', 'a pumpkin who is very proud', 'a pumpkin seeing a rainbow', 'a pumpkin with a lollipop', 'a pumpkin on a rollercoaster',
  'a pumpkin who is counting sheep', 'a sneaky pumpkin', 'a pumpkin with a snorkel', 'a pumpkin pulling a face at you', 'a bunny pumpkin',
  'a pumpkin who loves music', 'a pumpkin caught in the rain', 'a pumpkin with a hiccupping ghost', 'a pumpkin who won the lottery', 'a spider pumpkin',
  'a pumpkin with a funny nose', 'a pumpkin blowing out candles', 'a pumpkin wearing a crown of leaves', 'a pumpkin doing a magic trick', 'a pumpkin who smelled cheese',
  'a pumpkin with a star sticker', 'a pumpkin taking a selfie', 'a puppy pumpkin', 'a pumpkin who is ticklish', 'a pumpkin at the dentist',
];
export const TOOLS = [5, 13];                     // carving widths on the 256 grid: thin knife, big scoop
export const CARVE_S = 42, VOTE_S = 20, REVEAL_S = 9, SHOW_S = 9;
export const MAX_CUTS = 240, MAX_POINTS = 4000, MAX_CHUNK = 400;
export const JUDGE_RULES = [
  { id: 'ink', text: 'the most pumpkin carved' },
  { id: 'cuts', text: 'the most separate cuts' },
  { id: 'even', text: 'the most even face (left matches right)' },
];
/** The pumpkin's face area on the 256 grid: an ellipse a phone draws the pumpkin into (cuts outside it are rind-less air). */
export const FACE = { cx: 128, cy: 148, rx: 100, ry: 90 };
const HEX = /^[0-9a-f]+$/;
const G = 32;                                       // the coarse grid the judge looks at for "even" (32 x 32 cells)

/** Points of a cut as [[x, y]…] */
const ptsOf = p => { const out = []; for (let i = 0; i < p.length; i += 4) out.push([parseInt(p.substr(i, 2), 16), parseInt(p.substr(i + 2, 2), 16)]); return out; };
/** Which coarse cells a carving touches (inside the pumpkin), as a Set of y*G+x. */
export function cells(cuts) {
  const on = new Set();
  const mark = (x, y, r) => {
    const k = 256 / G, rr = r / k;
    const gx = x / k, gy = y / k;
    for (let cy = Math.floor(gy - rr); cy <= Math.ceil(gy + rr); cy++) for (let cx = Math.floor(gx - rr); cx <= Math.ceil(gx + rr); cx++) {
      if (cx < 0 || cy < 0 || cx >= G || cy >= G) continue;
      if (Math.hypot(cx + 0.5 - gx, cy + 0.5 - gy) > rr + 0.5) continue;
      const px = (cx + 0.5) * k, py = (cy + 0.5) * k;
      if (((px - FACE.cx) / FACE.rx) ** 2 + ((py - FACE.cy) / FACE.ry) ** 2 > 1) continue;
      on.add(cy * G + cx);
    }
  };
  for (const [w, p] of cuts) {
    const pts = ptsOf(p), r = TOOLS[w] / 2;
    for (let i = 0; i < pts.length; i++) {
      mark(pts[i][0], pts[i][1], r);
      if (i) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4); for (let j = 1; j < n; j++) mark(x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n, r); }
    }
  }
  return on;
}
/** How a carving measures: ink (cells carved), cuts (strokes), even (0-100: share of carved cells whose mirror cell is carved too). */
export function measure(cuts) {
  const on = cells(cuts);
  let pair = 0; const mid = FACE.cx / (256 / G);           // mirror around the pumpkin's middle (x = 128 -> between cells 15 and 16)
  for (const c of on) { const x = c % G, y = (c / G) | 0, mx = Math.round(2 * mid - 1 - x); if (on.has(y * G + mx)) pair++; }
  return { ink: on.size, cuts: cuts.length, even: on.size ? Math.round(pair / on.size * 100) : 0 };
}
/** The solo judge, 0-10: carving (up to 6, full marks from 60 cells, a little off for carving the whole thing away) + evenness (up to 4). */
export function soloScore(cuts) {
  const m = measure(cuts); if (!m.ink) return 0;
  const carve = m.ink > 420 ? 4 : Math.min(6, Math.round(m.ink / 10));
  const even = Math.round(m.even / 25);
  return Math.max(1, Math.min(10, carve + even));
}

export function create({ rng, players }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const deck = rng.shuffle(PROMPTS);
  const prompt = {}, art = {}, ids = {}, lastId = {}, points = {}, done = new Set();
  pids.forEach((p, i) => { prompt[p] = deck[i % deck.length]; art[p] = []; ids[p] = []; lastId[p] = -1; points[p] = 0; });
  const judge = rng.pick(JUDGE_RULES);
  let phase = 'carve', left = CARVE_S, over = false;
  let order = null, gallery = null;               // order[i] = pid of lantern i (seeded shuffle, anonymous until the reveal)
  const votes = {};
  let reveal = null;
  const events = [];

  const used = pid => art[pid].reduce((n, s) => n + s[1].length / 4, 0);
  const blank = pid => art[pid].length === 0;
  function toGallery() {
    order = rng.shuffle(pids);
    gallery = order.map(pid => ({ k: art[pid].map(s => s.slice()) }));
    events.push({ e: 'art', art: gallery });
    if (solo) { phase = 'reveal'; left = SHOW_S; settle(); return; }
    phase = 'vote'; left = VOTE_S;
  }
  function settle() {
    const got = {}; for (const p of pids) got[p] = 0;
    for (const v of Object.values(votes)) { if (v === 'both') { for (const p of pids) got[p] += 1; } else got[order[v]] += 1; }
    const stats = Object.fromEntries(pids.map(p => [p, measure(art[p])]));
    let ribbon = [];
    if (solo) points[pids[0]] = soloScore(art[pids[0]]);
    else {
      const best = Math.max(0, ...pids.filter(p => !blank(p)).map(p => stats[p][judge.id]));
      if (best > 0) ribbon = pids.filter(p => !blank(p) && stats[p][judge.id] === best);
      for (const p of pids) points[p] = got[p] + (ribbon.includes(p) ? 1 : 0);
    }
    reveal = { who: order, prompts: order.map(p => prompt[p]), votes: { ...votes }, got, ribbon, stats };
  }
  function canVote(p) { return pids.length === 2 || order.some(q => q !== p && !blank(q)); }

  return {
    events,
    init: () => ({ tools: TOOLS, face: FACE, maxPoints: MAX_POINTS, maxCuts: MAX_CUTS, maxChunk: MAX_CHUNK, judge, solo, art: gallery }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'carve') {
        if (a === 'cut') {
          if (!d || typeof d !== 'object' || Array.isArray(d)) return;
          const { s, w, p } = d;
          if (!Number.isInteger(s) || s < 0 || s > 1e6 || typeof p !== 'string' || !p.length || p.length % 4 || p.length > MAX_CHUNK * 4 || !HEX.test(p)) return;
          const room = MAX_POINTS - used(pid); if (room <= 0) return;
          const pts = p.slice(0, room * 4);
          if (s === ids[pid][ids[pid].length - 1]) { art[pid][art[pid].length - 1][1] += pts; return; }   // more of the cut being carved
          if (s <= lastId[pid] || art[pid].length >= MAX_CUTS) return;
          if (w !== 0 && w !== 1) return;
          art[pid].push([w, pts]); ids[pid].push(s); lastId[pid] = s; done.delete(pid);
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
      if (phase === 'carve') toGallery();
      else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), judge: judge.id };
      if (phase === 'carve') { g.n = Object.fromEntries(pids.map(p => [p, art[p].length])); g.done = pids.filter(p => done.has(p)); }
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.reveal = reveal; g.scores = { ...points }; }
      return g;
    },
    restore: pid => ({ cuts: art[pid].map(s => s.slice()), sid: lastId[pid] }),     // a phone that comes back mid-carving gets its pumpkin back
    priv: pid => ({ prompt: prompt[pid], mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null, done: done.has(pid), n: art[pid].length, full: used(pid) >= MAX_POINTS }),
    get over() { return over; },
    result() {
      if (!reveal) settle();
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...points }, unit: meta.unit };
    },
  };
}
