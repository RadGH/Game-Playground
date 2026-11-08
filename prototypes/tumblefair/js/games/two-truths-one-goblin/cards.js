// Two Truths, One Goblin — the prize stall and the claims about it (Expansion 1 M4, 2026-11-07).
//
// Round 10 dealt "facts about the Teller" (letters in their name, points on their chip, what they did last round).
// Live play rated it "unplayable": nobody could check a claim like "I've been the Teller twice" and counting the
// letters of a name is not a game. Now there is ONE thing everyone looks at: a prize stall with three shelves of
// prizes, shown for a few seconds. Then the Goblin makes three claims about it — two true, one a lie — and you tap the
// lie. Every claim is checkable against the picture you just saw, so a good memory always wins.
// Pure and seeded: the room's rng picks the prizes, the shelves and the claims.

export const PRIZES = [
  { id: 'balloon', e: '🎈', one: 'balloon', many: 'balloons' },
  { id: 'teddy', e: '🧸', one: 'teddy', many: 'teddies' },
  { id: 'apple', e: '🍎', one: 'apple', many: 'apples' },
  { id: 'fish', e: '🐟', one: 'fish', many: 'fish' },
  { id: 'hat', e: '🎩', one: 'top hat', many: 'top hats' },
  { id: 'lolly', e: '🍭', one: 'lollipop', many: 'lollipops' },
  { id: 'duck', e: '🦆', one: 'duck', many: 'ducks' },
  { id: 'star', e: '⭐', one: 'star', many: 'stars' },
  { id: 'cake', e: '🧁', one: 'cupcake', many: 'cupcakes' },
  { id: 'crown', e: '👑', one: 'crown', many: 'crowns' },
  { id: 'drum', e: '🥁', one: 'drum', many: 'drums' },
  { id: 'kite', e: '🪁', one: 'kite', many: 'kites' },
];
export const SHELVES = ['top', 'middle', 'bottom'], SLOTS = 4;
/** How many kinds and how many prizes the stall holds, and how long it is shown, by difficulty. */
export const SIZE = { easy: { kinds: 4, items: 7, show: 8 }, normal: { kinds: 5, items: 9, show: 7 }, hard: { kinds: 6, items: 11, show: 6 } };
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const byId = Object.fromEntries(PRIZES.map(p => [p.id, p]));
const many = (id, n) => `${n === 1 ? 'one' : NUM[n] || n} ${byId[id].e} ${n === 1 ? byId[id].one : byId[id].many}`;

/** A stall: slots[shelf][i] = prize id or null; counts = { id: n }. */
export function makeStall(rng, difficulty = 'normal') {
  const S = SIZE[difficulty] || SIZE.normal;
  const kinds = rng.shuffle(PRIZES.map(p => p.id)).slice(0, S.kinds);
  const counts = Object.fromEntries(kinds.map(k => [k, 1]));
  for (let left = S.items - S.kinds; left > 0;) { const k = rng.pick(kinds); if (counts[k] < 4) { counts[k]++; left--; } }
  const bag = rng.shuffle(kinds.flatMap(k => Array(counts[k]).fill(k)));
  const spots = rng.shuffle(SHELVES.flatMap((_, s) => [...Array(SLOTS).keys()].map(i => [s, i]))).slice(0, bag.length);
  const slots = SHELVES.map(() => Array(SLOTS).fill(null));
  spots.forEach(([s, i], j) => { slots[s][i] = bag[j]; });
  return { slots, counts };
}
const shelvesOf = (st, id) => SHELVES.filter((_, s) => st.slots[s].includes(id));

/** Every claim the Goblin could make about this stall, true and false, one per (kind of claim, prize). */
export function claimsAbout(st, rng) {
  const present = Object.keys(st.counts), absent = PRIZES.map(p => p.id).filter(id => !(id in st.counts));
  const out = [];
  for (const id of present) {
    const n = st.counts[id], m = rng.pick([n - 1, n + 1].filter(v => v >= 1 && v <= 5));
    const say = v => `There ${v === 1 ? 'was' : 'were'} ${many(id, v)} on the stall.`;
    out.push({ k: 'count', ids: [id], truth: say(n), lie: say(m) });
    const on = shelvesOf(st, id), off = SHELVES.filter(s => !on.includes(s));
    if (off.length) {
      const say2 = s => `${n === 1 ? 'The' : 'A'} ${byId[id].e} ${byId[id].one} was on the ${s} shelf.`;
      out.push({ k: 'shelf', ids: [id], truth: say2(rng.pick(on)), lie: say2(rng.pick(off)) });
    }
  }
  if (absent.length) {
    const no = id => `There was no ${byId[id].e} ${byId[id].one} at all.`;
    for (const id of present) { const a = rng.pick(absent); out.push({ k: 'none', ids: [id, a], truth: no(a), lie: no(id) }); }
  }
  for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) {
    const a = present[i], b = present[j]; if (st.counts[a] === st.counts[b]) continue;
    const [hi, lo] = st.counts[a] > st.counts[b] ? [a, b] : [b, a];
    const more = (x, y) => `There were more ${byId[x].e} ${byId[x].many} than ${byId[y].e} ${byId[y].many}.`;
    out.push({ k: 'more', ids: [hi, lo], truth: more(hi, lo), lie: more(lo, hi) });
  }
  return out;
}

/**
 * Deal a round: two truths and two candidate lies, four claims about four different prizes where it can, and never
 * two of the same kind of claim among the truths. -> { truths: [text, text], lies: [text, text], kinds }
 */
export function dealClaims(st, rng) {
  const all = rng.shuffle(claimsAbout(st, rng)), pick = [], used = new Set(), kinds = new Set();
  for (const pass of [0, 1, 2]) for (const c of all) {
    if (pick.length >= 4 || pick.includes(c)) continue;
    if (pass < 2 && c.ids.some(id => used.has(id))) continue;
    if (pass < 1 && kinds.has(c.k)) continue;
    pick.push(c); c.ids.forEach(id => used.add(id)); kinds.add(c.k);
  }
  return { truths: pick.slice(0, 2).map(c => c.truth), lies: pick.slice(2, 4).map(c => c.lie), kinds: pick.map(c => c.k) };
}

/** Is this sentence true of the stall? Reads the sentence back (tests, and the CPU guessers' memory). */
export function check(st, text) {
  const idOf = e => PRIZES.find(p => p.e === e)?.id, cnt = e => st.counts[idOf(e)] || 0;
  let m;
  if ((m = /^There (?:was|were) (\w+) (\S+) .* on the stall\.$/.exec(text))) return cnt(m[2]) === NUM.indexOf(m[1]);
  if ((m = /^(?:The|A) (\S+) .* was on the (\w+) shelf\.$/.exec(text))) return shelvesOf(st, idOf(m[1])).includes(m[2]);
  if ((m = /^There was no (\S+) .* at all\.$/.exec(text))) return cnt(m[1]) === 0;
  if ((m = /^There were more (\S+) .* than (\S+) .*\.$/.exec(text))) return cnt(m[1]) > cnt(m[2]);
  return null;
}
