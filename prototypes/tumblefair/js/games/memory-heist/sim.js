// MEMORY HEIST — the vault door swings open for a few seconds: a grid of treasures, each a thing in a colour. Then it
// shuts and five quick questions follow ("What was in the top-left corner?", "How many crowns?", "What colour was the
// vase?"). Everyone gets the same vault and the same questions (seeded). A right answer scores 5 plus up to 5 more
// for speed; a wrong one scores nothing. After each question everyone sees the answer and who got it.
import { makeRng } from '../../shared/rng.js';
export const meta = {
  id: 'memory-heist', title: 'Memory Heist', blurb: 'Study the vault, then remember what you saw!',
  how: ['The vault opens for a few seconds. Remember everything!', 'Then answer five quick questions about it.', 'Right answers score; fast right answers score more.'],
  kind: 'ui', min: 1, max: 4, seconds: 64, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-memory-heist', css: true,
};
export const TREASURES = [
  { id: 'crown', name: 'Crown', many: 'crowns' }, { id: 'ring', name: 'Ring', many: 'rings' }, { id: 'vase', name: 'Vase', many: 'vases' },
  { id: 'goblet', name: 'Goblet', many: 'goblets' }, { id: 'key', name: 'Key', many: 'keys' }, { id: 'gem', name: 'Gem', many: 'gems' },
  { id: 'coin', name: 'Coin', many: 'coins' }, { id: 'lamp', name: 'Lamp', many: 'lamps' }, { id: 'scroll', name: 'Scroll', many: 'scrolls' },
  { id: 'mask', name: 'Mask', many: 'masks' }, { id: 'bell', name: 'Bell', many: 'bells' }, { id: 'medal', name: 'Star Medal', many: 'star medals' },
];
const PLAIN = TREASURES;
/** Round 12: two more twelve-thing sets for a plain (non-holiday) vault, picked from the game's seed on a side rng so
 *  the vault and the questions use the same rng calls whatever the theme. Same slot count, so every rule works alike. */
export const TREASURES_PIRATE = [
  { id: 'anchor', name: 'Anchor', many: 'anchors' }, { id: 'compass', name: 'Compass', many: 'compasses' }, { id: 'map', name: 'Map', many: 'maps' },
  { id: 'spyglass', name: 'Spyglass', many: 'spyglasses' }, { id: 'shell', name: 'Shell', many: 'shells' }, { id: 'pearl', name: 'Pearl', many: 'pearls' },
  { id: 'bottle', name: 'Bottle', many: 'bottles' }, { id: 'barrel', name: 'Barrel', many: 'barrels' }, { id: 'flag', name: 'Flag', many: 'flags' },
  { id: 'cutlass', name: 'Cutlass', many: 'cutlasses' }, { id: 'parrot', name: 'Parrot', many: 'parrots' }, { id: 'chest', name: 'Chest', many: 'chests' },
];
export const TREASURES_TOYS = [
  { id: 'teddy', name: 'Teddy Bear', many: 'teddy bears' }, { id: 'ball', name: 'Ball', many: 'balls' }, { id: 'kite', name: 'Kite', many: 'kites' },
  { id: 'yoyo', name: 'Yo-yo', many: 'yo-yos' }, { id: 'drum', name: 'Drum', many: 'drums' }, { id: 'rocket', name: 'Rocket', many: 'rockets' },
  { id: 'duck', name: 'Rubber Duck', many: 'rubber ducks' }, { id: 'block', name: 'Toy Block', many: 'toy blocks' }, { id: 'robot', name: 'Robot', many: 'robots' },
  { id: 'car', name: 'Toy Car', many: 'toy cars' }, { id: 'top', name: 'Spinning Top', many: 'spinning tops' }, { id: 'trumpet', name: 'Trumpet', many: 'trumpets' },
];
/** The vault's look + its treasure set. `door` is the word on the door, `title` the header. */
export const THEMES = [
  { id: 'royal', title: 'The Royal Vault', door: 'VAULT', set: TREASURES },
  { id: 'pirate', title: "The Pirate's Hold", door: 'HOLD', set: TREASURES_PIRATE },
  { id: 'toys', title: 'The Toy Chest', door: 'TOYS', set: TREASURES_TOYS },
];
export const THEME_HW = { id: 'haunted', title: 'The Haunted Vault', door: 'BOO', set: null };
/** Which plain theme a game seed gets (a side rng: never touches the game's own rng). */
export const themeFor = seed => THEMES[Math.floor(makeRng(((seed >>> 0) ^ 0x5eed1) >>> 0)() * THEMES.length)];
/** Halloween (round 6): the same twelve slots, spooky-cute things (same count, so every vault and question works alike). */
export const TREASURES_HW = [
  { id: 'pumpkin', name: 'Pumpkin', many: 'pumpkins' }, { id: 'hat', name: 'Witch Hat', many: 'witch hats' }, { id: 'potion', name: 'Potion', many: 'potions' },
  { id: 'broom', name: 'Broom', many: 'brooms' }, { id: 'candy', name: 'Candy', many: 'candies' }, { id: 'candle', name: 'Candle', many: 'candles' },
  { id: 'bat', name: 'Bat', many: 'bats' }, { id: 'ghost', name: 'Ghost', many: 'ghosts' }, { id: 'cauldron', name: 'Cauldron', many: 'cauldrons' },
  { id: 'moon', name: 'Moon', many: 'moons' }, { id: 'lolly', name: 'Lollipop', many: 'lollipops' }, { id: 'cat', name: 'Cat', many: 'cats' },
];
export const COLOURS = [
  { id: 'gold', name: 'Gold', hex: '#f4c430' }, { id: 'red', name: 'Red', hex: '#e8383d' }, { id: 'blue', name: 'Blue', hex: '#2f7ff0' },
  { id: 'green', name: 'Green', hex: '#2fbf57' }, { id: 'purple', name: 'Purple', hex: '#9b4fe0' }, { id: 'silver', name: 'Silver', hex: '#b8c4cc' },
];
export const SIZES = { easy: [3, 3], normal: [4, 3], hard: [4, 4] };          // [columns, rows]
export const STUDY_S = { easy: 8, normal: 7, hard: 8 };
export const QUESTIONS = 5, Q_S = 7, ANS_S = 2.6, END_S = 4, BASE = 5, SPEED = 5;

/** Fill a w x h vault: a few kinds, some repeated (so "how many" is worth asking), at least two that appear once. */
export function makeVault(rng, w, h) {
  const n = w * h, kinds = rng.shuffle(TREASURES.map((_, i) => i)).slice(0, Math.min(n - 2, Math.round(n * 0.55)));
  const cells = [kinds[0], kinds[1]];                                              // the two singles
  const pool = kinds.slice(2);
  pool.forEach(k => cells.length < n && cells.push(k));                           // every other kind at least once
  while (cells.length < n) cells.push(rng.pick(pool));                             // the rest repeat them
  return rng.shuffle(cells).map(k => [k, rng.int(0, COLOURS.length - 1)]);
}
const SPOTS = (w, h) => {
  const s = [{ i: 0, name: 'top-left corner' }, { i: w - 1, name: 'top-right corner' }, { i: (h - 1) * w, name: 'bottom-left corner' }, { i: h * w - 1, name: 'bottom-right corner' }];
  if (w % 2) s.push({ i: (w - 1) / 2, name: 'middle of the top row' }, { i: (h - 1) * w + (w - 1) / 2, name: 'middle of the bottom row' });
  if (h % 2) s.push({ i: ((h - 1) / 2) * w, name: 'middle of the left side' }, { i: ((h - 1) / 2) * w + w - 1, name: 'middle of the right side' });
  if (w % 2 && h % 2) s.push({ i: ((h - 1) / 2) * w + (w - 1) / 2, name: 'very middle' });
  return s;
};
/** Options for a question: the right one plus distractors, shuffled. Returns { opts, a }. */
function choices(rng, right, others, n = 4) {
  const opts = rng.shuffle([right, ...rng.shuffle(others.filter(o => o !== right)).slice(0, n - 1)]);
  return { opts, a: opts.indexOf(right) };
}
/** Five questions about a vault, different kinds of question where possible. Each: { kind, text, opts:[{t, k?|c?|n?}], a }. */
export function makeQuestions(rng, vault, w, h, TREASURES = PLAIN) {
  const count = new Map(); vault.forEach(([k]) => count.set(k, (count.get(k) || 0) + 1));
  const present = [...count.keys()], absent = TREASURES.map((_, i) => i).filter(k => !count.has(k));
  const kindOpt = k => ({ t: TREASURES[k].name, k });
  const make = {
    spot(used) {
      const spots = SPOTS(w, h).filter(s => !used.has('spot' + s.i)); if (!spots.length) return null;
      const s = rng.pick(spots); used.add('spot' + s.i);
      const right = vault[s.i][0], { opts, a } = choices(rng, right, [...present, ...absent]);
      return { kind: 'spot', text: `What was in the ${s.name}?`, spot: s.i, opts: opts.map(kindOpt), a };
    },
    count(used) {
      const ks = present.filter(k => !used.has('n' + k)); if (!ks.length) return null;
      const many = ks.filter(k => count.get(k) > 1), k = rng.pick(many.length && rng.chance(0.7) ? many : ks); used.add('n' + k);
      const right = count.get(k), lo = Math.max(1, right - rng.int(1, 2)), nums = [lo, lo + 1, lo + 2, lo + 3];
      if (!nums.includes(right)) nums[3] = right;
      return { kind: 'count', text: `How many ${TREASURES[k].many} were there?`, k, opts: nums.sort((x, y) => x - y).map(n => ({ t: String(n), n })), a: nums.indexOf(right) };
    },
    colour(used) {
      const ks = present.filter(k => count.get(k) === 1 && !used.has('c' + k)); if (!ks.length) return null;
      const k = rng.pick(ks); used.add('c' + k);
      const right = vault.find(v => v[0] === k)[1], { opts, a } = choices(rng, right, COLOURS.map((_, i) => i));
      return { kind: 'colour', text: `What colour was the ${TREASURES[k].name.toLowerCase()}?`, k, opts: opts.map(c => ({ t: COLOURS[c].name, c })), a };
    },
    missing(used) {
      if (used.has('missing') || !absent.length || present.length < 3) return null; used.add('missing');
      const right = rng.pick(absent), opts = rng.shuffle([right, ...rng.shuffle(present).slice(0, 3)]);
      return { kind: 'missing', text: 'Which of these was NOT in the vault?', opts: opts.map(kindOpt), a: opts.indexOf(right) };
    },
    beside(used) {                                              // round 12: "what was just to the LEFT of the robot?"
      if (used.has('beside')) return null;
      const spots = [];
      for (const k of present) if (count.get(k) === 1) {
        const i = vault.findIndex(v => v[0] === k), x = i % w;
        if (x > 0) spots.push([k, i - 1, 'LEFT']);
        if (x < w - 1) spots.push([k, i + 1, 'RIGHT']);
      }
      if (!spots.length) return null; used.add('beside');
      const [k, j, side] = rng.pick(spots), right = vault[j][0];
      const { opts, a } = choices(rng, right, [...present, ...absent].filter(o => o !== k));
      return { kind: 'beside', text: `What was just to the ${side} of the ${TREASURES[k].name.toLowerCase()}?`, k, spot: j, opts: opts.map(kindOpt), a };
    },
    most(used) {
      if (used.has('most')) return null;
      const top = Math.max(...count.values()), best = present.filter(k => count.get(k) === top);
      if (best.length !== 1 || top < 2) return null; used.add('most');
      const { opts, a } = choices(rng, best[0], present);
      return { kind: 'most', text: 'Which treasure was there the most of?', opts: opts.map(kindOpt), a };
    },
  };
  const used = new Set(), out = [];
  const order = ['spot', ...rng.shuffle(['count', 'colour', 'missing', 'most', 'beside']), 'spot', 'count', 'colour', 'spot', 'count'];
  for (const kind of order) { if (out.length >= QUESTIONS) break; const q = make[kind](used); if (q) out.push(q); }
  return rng.shuffle(out.slice(1)).reduce((list, q) => (list.push(q), list), [out[0]]);   // a corner question opens; the rest shuffled
}

export function create({ seed = 1, rng, players, difficulty = 'normal', season = null }) {
  const theme = season === 'halloween' ? { ...THEME_HW, set: TREASURES_HW } : themeFor(seed), T = theme.set;
  const pids = players.map(p => p.pid);
  const [w, h] = SIZES[difficulty] || SIZES.normal;
  const vault = makeVault(rng, w, h), qs = makeQuestions(rng, vault, w, h, T);
  const score = Object.fromEntries(pids.map(p => [p, 0]));
  let phase = 'study', qi = -1, left = STUDY_S[difficulty] || STUDY_S.normal, over = false;
  let picks = {}, took = {}, gain = null, tally = Object.fromEntries(pids.map(p => [p, 0]));
  const ask = () => { qi++; phase = 'q'; left = Q_S; picks = {}; took = {}; gain = null; };
  function mark() {
    const q = qs[qi]; gain = {};
    for (const p of pids) { const ok = picks[p] === q.a; gain[p] = ok ? BASE + Math.ceil(SPEED * Math.max(0, 1 - took[p] / Q_S)) : 0; score[p] += gain[p]; if (ok) tally[p]++; }
    phase = 'ans'; left = ANS_S;
  }
  return {
    init: () => ({ w, h, theme: { id: theme.id, title: theme.title, door: theme.door }, treasures: T, colours: COLOURS, questions: qs.length, qs: Q_S, ...(phase === 'study' || phase === 'end' ? { vault } : {}) }),
    act(pid, a, d) {
      if (phase !== 'q' || a !== 'ans' || !pids.includes(pid) || pid in picks) return;
      if (!Number.isInteger(d) || d < 0 || d >= qs[qi].opts.length) return;
      picks[pid] = d; took[pid] = Q_S - left;
      if (pids.every(p => p in picks)) mark();
    },
    step(dt) {
      if (over) return;
      left -= dt; if (left > 0) return;
      if (phase === 'study') ask();
      else if (phase === 'q') mark();
      else if (phase === 'ans') { if (qi + 1 < qs.length) ask(); else { phase = 'end'; left = END_S; } }
      else over = true;
    },
    state() {
      const g = { phase, left: Math.max(0, Math.ceil(left)), scores: { ...score } };
      if (phase === 'study' || phase === 'end') g.vault = vault;
      if (phase === 'end') g.tally = tally;
      if (phase === 'q' || phase === 'ans') { const q = qs[qi]; g.qi = qi; g.q = { kind: q.kind, text: q.text, opts: q.opts }; g.in = pids.filter(p => p in picks); }
      if (phase === 'ans') { g.a = qs[qi].a; g.spot = qs[qi].spot ?? null; g.picks = { ...picks }; g.gain = gain; }
      return g;
    },
    priv: pid => ({ pick: phase === 'q' || phase === 'ans' ? picks[pid] ?? null : null }),
    get over() { return over; },
    result() {
      const groups = new Map();
      for (const p of pids) { if (!groups.has(score[p])) groups.set(score[p], []); groups.get(score[p]).push(p); }
      return { order: [...groups.keys()].sort((a, b) => b - a).map(k => groups.get(k)), scores: { ...score }, unit: meta.unit };
    },
  };
}
