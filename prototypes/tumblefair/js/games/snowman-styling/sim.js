// SNOWMAN STYLING (Winter Fair only) — a theme card ("Pirate Cove", "Royal Ball"…) and a bare snowman each. 40 seconds
// to dress yours from seven small rows (hat, scarf, scarf colour, nose, eyes, buttons, arms; five choices each). Then
// every snowman stands in a row in the snow, shuffled and anonymous, and everyone votes for the best one (never their
// own, never a bare one). Points = votes received + the Frost Ribbon (+1) for the snowman that fits the theme best
// (a tie on fit goes to whoever finished dressing first).
//
// With few players the yard fills up with CPU snowman-builders (Mitten, Flurry) and CPU judges (Granny Frost…) so the
// vote still means something: 1 player = 2 builders + 3 judges, 2 players = 1 builder + 1 judge, 3-4 = none. A judge
// likes snowmen that fit the theme (2 a fitting piece, 1 any piece) plus its own seeded taste (+1 for each of its
// favourite pieces) and a little whim, so a well-dressed snowman usually wins and a bare one never gets a vote.
// Alone you win when you collect more points than both builders (`beat` in the result).
// With the room's "Rival when alone" off (`rivals: false`) a lone player gets no builders and no judges: there is no
// vote, the snowman goes straight to the reveal and scores 1 point per piece that fits the theme (0-7).
//
// The outfit is an array of 7 option indexes (-1 = nothing in that slot). Everything a phone sends is checked.
import { makeRng } from '../../shared/rng.js';
export const meta = {
  id: 'snowman-styling', title: 'Snowman Styling', blurb: 'Dress your snowman for the theme, then vote for the best in the snow!',
  how: ['A theme card shows what the judges love.', 'Dress your snowman: hat, scarf, nose, eyes, buttons, arms.', 'Vote for the best snowman (not your own!).', 'Votes are points. The best fit for the theme gets the Frost Ribbon.'],
  kind: 'ui', min: 1, max: 4, seconds: 72, scoring: 'vote', unit: 'points', tags: ['social', 'holiday'], season: 'winter', card: 'card-snowman-styling', css: true, rival: true,
};
export const DRESS_S = 40, VOTE_S = 15, REVEAL_S = 9;

export const SLOTS = [
  { id: 'hat', name: 'Hat' }, { id: 'scarf', name: 'Scarf' }, { id: 'colour', name: 'Colour' }, { id: 'nose', name: 'Nose' },
  { id: 'eyes', name: 'Eyes' }, { id: 'buttons', name: 'Buttons' }, { id: 'arms', name: 'Arms' },
];
/** Five choices per slot; `tags` say which themes a piece fits. Colour pieces carry the hex the scarf (and hat trim) use. */
export const OPTIONS = {
  hat: [
    { id: 'tophat', name: 'Top hat', tags: ['royal', 'fancy'] }, { id: 'beanie', name: 'Bobble hat', tags: ['cosy', 'sporty'] },
    { id: 'crown', name: 'Crown', tags: ['royal', 'starry'] }, { id: 'pirate', name: 'Pirate hat', tags: ['pirate'] },
    { id: 'party', name: 'Party hat', tags: ['party', 'sweet'] },
  ],
  scarf: [
    { id: 'striped', name: 'Stripes', tags: ['party', 'sporty', 'sweet'] }, { id: 'knit', name: 'Chunky knit', tags: ['cosy'] },
    { id: 'bowtie', name: 'Bow tie', tags: ['fancy', 'royal'] }, { id: 'bandana', name: 'Bandana', tags: ['pirate'] },
    { id: 'stars', name: 'Star scarf', tags: ['starry'] },
  ],
  colour: [
    { id: 'red', name: 'Red', hex: '#e8383d', tags: ['pirate', 'party'] }, { id: 'navy', name: 'Navy', hex: '#2a4fa8', tags: ['starry', 'sporty', 'pirate'] },
    { id: 'green', name: 'Green', hex: '#2fa34f', tags: ['cosy'] }, { id: 'gold', name: 'Gold', hex: '#f2b705', tags: ['royal', 'fancy', 'starry'] },
    { id: 'pink', name: 'Pink', hex: '#f06aa8', tags: ['sweet', 'party'] },
  ],
  nose: [
    { id: 'carrot', name: 'Carrot', tags: ['cosy', 'sporty', 'pirate'] }, { id: 'cherry', name: 'Cherry', tags: ['sweet', 'party'] },
    { id: 'button', name: 'Gold button', tags: ['royal', 'fancy'] }, { id: 'star', name: 'Star', tags: ['starry'] },
    { id: 'pebble', name: 'Pebble', tags: [] },
  ],
  eyes: [
    { id: 'coal', name: 'Coal', tags: ['cosy', 'sporty'] }, { id: 'patch', name: 'Eye patch', tags: ['pirate'] },
    { id: 'sparkle', name: 'Star eyes', tags: ['starry', 'party'] }, { id: 'monocle', name: 'Monocle', tags: ['fancy', 'royal'] },
    { id: 'happy', name: 'Happy', tags: ['sweet', 'cosy'] },
  ],
  buttons: [
    { id: 'coal', name: 'Coal', tags: ['cosy', 'pirate', 'sporty'] }, { id: 'gumdrops', name: 'Gumdrops', tags: ['sweet', 'party'] },
    { id: 'stars', name: 'Stars', tags: ['starry'] }, { id: 'gems', name: 'Gems', tags: ['royal', 'fancy'] },
    { id: 'hearts', name: 'Hearts', tags: ['sweet'] },
  ],
  arms: [
    { id: 'mittens', name: 'Mittens', tags: ['cosy', 'sporty'] }, { id: 'sceptre', name: 'Sceptre', tags: ['royal', 'fancy'] },
    { id: 'spyglass', name: 'Spyglass', tags: ['pirate'] }, { id: 'cane', name: 'Candy cane', tags: ['sweet', 'party'] },
    { id: 'wand', name: 'Star wand', tags: ['starry'] },
  ],
};
export const THEMES = [
  { id: 'cosy', name: 'Cosy Cabin', likes: ['cosy'], hint: 'warm, woolly and snug' },
  { id: 'royal', name: 'Royal Ball', likes: ['royal', 'fancy'], hint: 'crowns, gold and fancy bits' },
  { id: 'pirate', name: 'Pirate Cove', likes: ['pirate'], hint: 'ahoy! patches and spyglasses' },
  { id: 'party', name: 'Birthday Party', likes: ['party'], hint: 'bright, silly and sparkly' },
  { id: 'starry', name: 'Starry Night', likes: ['starry'], hint: 'stars, stars and more stars' },
  { id: 'sporty', name: 'Snow Games', likes: ['sporty'], hint: 'ready for a snowball race' },
  { id: 'sweet', name: 'Sweet Shop', likes: ['sweet'], hint: 'candy, pink and sugary' },
];
export const BUILDERS = ['Mitten', 'Flurry'];
export const JUDGES = ['Granny Frost', 'Sir Sleet', 'Little Hailey'];
/** How well the CPU builders dress: the chance each slot gets a piece that fits the theme. */
export const LEVELS = { easy: { fit: 0.3 }, normal: { fit: 0.5 }, hard: { fit: 0.7 } };
export const N_SLOTS = SLOTS.length;

const optsOf = s => OPTIONS[SLOTS[s].id];
export const fits = (theme, s, i) => i >= 0 && optsOf(s)[i].tags.some(t => theme.likes.includes(t));
/** Pieces that fit the theme. */
export const fitOf = (theme, outfit) => outfit.reduce((n, i, s) => n + (fits(theme, s, i) ? 1 : 0), 0);
/** Pieces worn at all. */
export const filledOf = outfit => outfit.filter(i => i >= 0).length;
/** What a judge thinks of an outfit (before its whim): 2 per fitting piece, 1 per piece, +1 per favourite piece. */
export const judgeScore = (theme, outfit, fav) => fitOf(theme, outfit) * 2 + filledOf(outfit) + outfit.reduce((n, i, s) => n + (i >= 0 && fav[s] === i ? 1 : 0), 0);
/** A full outfit: each slot fits the theme with chance `fit`, otherwise any piece. */
export function rollOutfit(rng, theme, fit) {
  return SLOTS.map((_, s) => {
    const ok = optsOf(s).map((o, i) => i).filter(i => fits(theme, s, i));
    return rng.chance(fit) && ok.length ? rng.pick(ok) : rng.int(0, optsOf(s).length - 1);
  });
}

export function create({ rng, players, difficulty = 'normal', rivals }) {
  const L = LEVELS[difficulty] || LEVELS.normal;
  const pids = players.map(p => p.pid), n = pids.length, solo = n === 1;
  const th = rng.int(0, THEMES.length - 1), theme = THEMES[th];
  const cpuRng = rng.fork();                                  // the CPUs never shift anything the players get
  const alone = solo && rivals === false;                    // a lone player who asked for no computer rivals
  const nb = alone ? 0 : n === 1 ? 2 : n === 2 ? 1 : 0, nj = alone ? 0 : n === 1 ? 3 : n === 2 ? 1 : 0;
  const cpus = BUILDERS.slice(0, nb).map((name, i) => ({ id: 'c' + i, name, outfit: rollOutfit(cpuRng, theme, L.fit) }));
  const judges = JUDGES.slice(0, nj).map(name => ({ name, fav: SLOTS.map((_, s) => cpuRng.int(0, optsOf(s).length - 1)) }));
  const outfit = {}, at = {}, done = new Set(), votes = {};
  for (const p of pids) { outfit[p] = new Array(N_SLOTS).fill(-1); at[p] = Infinity; }
  for (const c of cpus) { outfit[c.id] = c.outfit; at[c.id] = DRESS_S + 1; }
  const entries = [...pids, ...cpus.map(c => c.id)];
  let phase = 'dress', left = DRESS_S, clock = 0, over = false, order = null, reveal = null;
  const points = Object.fromEntries(entries.map(e => [e, 0]));

  const blank = e => filledOf(outfit[e]) === 0;
  const canVote = p => order.some(e => e !== p && !blank(e));
  function toVote() { order = rng.shuffle(entries); if (alone) { settle(); phase = 'reveal'; left = REVEAL_S; return; } phase = 'vote'; left = VOTE_S; }
  function settle() {
    if (!order) order = entries.slice();
    const got = order.map(() => 0);
    for (const v of Object.values(votes)) got[v]++;
    const jv = judges.map(j => {
      let best = -1, bs = -Infinity;
      order.forEach((e, i) => { if (blank(e)) return; const s = judgeScore(theme, outfit[e], j.fav) + cpuRng.range(0, 2); if (s > bs) { bs = s; best = i; } });
      if (best >= 0) got[best]++;
      return best;
    });
    const fit = order.map(e => fitOf(theme, outfit[e]));
    const ranked = order.map((e, i) => i).filter(i => fit[i] > 0).sort((a, b) => fit[b] - fit[a] || at[order[a]] - at[order[b]] || a - b);
    const rb = ranked.length ? ranked[0] : -1;
    order.forEach((e, i) => { points[e] = alone ? fit[i] : got[i] + (i === rb ? 1 : 0); });
    reveal = { who: order, v: { ...votes }, j: jv, got, rb, fit, pts: order.map(e => points[e]) };
  }

  return {
    init: () => ({ th, solo, ...(alone ? { alone: true } : {}), cpus: cpus.map(c => ({ id: c.id, name: c.name })), judges: judges.map(j => j.name), dress: DRESS_S }),
    act(pid, a, d) {
      if (!pids.includes(pid) || over) return;
      if (phase === 'dress') {
        if (a === 'wear') {
          if (!d || typeof d !== 'object' || !Number.isInteger(d.s) || !Number.isInteger(d.i) || d.s < 0 || d.s >= N_SLOTS) return;
          if (d.i < -1 || d.i >= optsOf(d.s).length || outfit[pid][d.s] === d.i) return;
          outfit[pid][d.s] = d.i; at[pid] = clock; done.delete(pid);
        } else if (a === 'done') {
          if (d === false) { done.delete(pid); return; }
          if (d !== true) return;
          done.add(pid); if (pids.every(p => done.has(p))) left = Math.min(left, 0.5);
        }
        return;
      }
      if (phase === 'vote' && a === 'vote') {
        if (!Number.isInteger(d) || d < 0 || d >= order.length || order[d] === pid || blank(order[d])) return;
        votes[pid] = d;
        if (pids.every(p => p in votes || !canVote(p))) left = Math.min(left, 1);
      }
    },
    step(dt) {
      if (over) return;
      clock += dt; left -= dt; if (left > 0) return;
      if (phase === 'dress') toVote();
      else if (phase === 'vote') { settle(); phase = 'reveal'; left = REVEAL_S; }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), th };
      if (phase === 'dress') { g.done = pids.filter(p => done.has(p)); g.n = Object.fromEntries(pids.map(p => [p, filledOf(outfit[p])])); }
      else g.show = order.map(e => outfit[e].join(''));      // one string per snowman, e.g. '03-1241' (-1 = nothing): parseShow
      if (phase === 'vote') g.voted = pids.filter(p => p in votes);
      if (phase === 'reveal') { g.rv = reveal; g.scores = Object.fromEntries(pids.map(p => [p, points[p]])); }
      return g;
    },
    priv: pid => ({ outfit: outfit[pid].slice(), done: done.has(pid), mine: order ? order.indexOf(pid) : null, vote: votes[pid] ?? null }),
    get over() { return over; },
    result() {
      if (!reveal) settle();
      const groups = new Map();
      for (const p of pids) { if (!groups.has(points[p])) groups.set(points[p], []); groups.get(points[p]).push(p); }
      const out = { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: Object.fromEntries(pids.map(p => [p, points[p]])), unit: meta.unit };
      if (cpus.length) out.cpu = Object.fromEntries(cpus.map(c => [c.name, points[c.id]]));
      if (solo && !alone) out.beat = cpus.every(c => points[pids[0]] > points[c.id]);
      return out;
    },
    get _phase() { return phase; }, _theme: theme, _outfit: outfit,
  };
}

/** Parse a `show` row back into indexes (every index is one digit; nothing worn is written '-1'). */
export function parseShow(s) { return (String(s).match(/-?\d/g) || []).map(Number); }

/** A test/practice bot: dresses one slot every `gap` s (a fitting piece with chance `fit`), says done, then votes for
 *  the best-fitting snowman that is not its own. Call the returned function once per 50 ms step. */
export function snowBot(g, pid, { fit = 1, gap = 0.4, seed = 1, idle = false } = {}) {
  const r = makeRng(seed * 7919 + pid * 104729); let wait = 0, voted = false;
  return () => {
    if (idle) return;
    const s = g.state(), me = g.priv(pid), theme = THEMES[s.th];
    if (s.phase === 'dress') {
      if (me.done) return;
      wait += 0.05; if (wait < gap) return; wait = 0;
      const slot = me.outfit.findIndex(i => i < 0);
      if (slot < 0) { g.act(pid, 'done', true); return; }
      const opts = OPTIONS[SLOTS[slot].id].map((o, i) => i), ok = opts.filter(i => fits(theme, slot, i)), no = opts.filter(i => !fits(theme, slot, i));
      const pool = r() < fit ? ok : (no.length ? no : ok);
      g.act(pid, 'wear', { s: slot, i: pool[Math.floor(r() * pool.length)] });
    } else if (s.phase === 'vote' && !voted && me.mine != null) {
      voted = true;
      const rows = s.show.map(parseShow);
      let best = -1, bs = -1;
      rows.forEach((o, i) => { if (i === me.mine || filledOf(o) === 0) return; const sc = fitOf(theme, o) * 10 + filledOf(o); if (sc > bs) { bs = sc; best = i; } });
      if (best >= 0) g.act(pid, 'vote', best);
    }
  };
}
