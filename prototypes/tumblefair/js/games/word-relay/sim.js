// WORD RELAY — everyone races on the same prompt. A link of the chain says: start with this letter (the last letter of
// the word before) AND obey this rule ("no letter E", "at least 6 letters", "a double letter"...). Type a word and send
// it: a valid one scores its length in points, and the FIRST valid word of the link scores 3 more and becomes the next
// word of the chain. After the first word lands the others have a few seconds to get theirs in, then the next link
// starts from it. The rule changes every two links. A word can be used once per game. Nobody finds one in 14 s: a
// new letter. Alone you race Quill the owl, who is slow but never misses.
//
// The dictionary is words.js (17,000 common English words, see tools/build-words.py). A letter + rule pair is only
// ever asked when at least MIN_OPTIONS unused words fit it, so a link is never impossible.
import { WORDS } from './words.js';

export const meta = {
  id: 'word-relay', title: 'Word Relay', blurb: 'Chain words that start with the last letter and obey the rule!',
  how: ['Type a word that starts with the big letter AND obeys the rule.', 'Longer words score more. The first good word scores +3 and sets the next letter.', 'The rule changes every two words. No word may be used twice!'],
  kind: 'ui', min: 1, max: 4, seconds: 60, scoring: 'points', unit: 'points', tags: ['puzzle'], card: 'card-word-relay', css: true,
};
export const GAME_S = 60, LINK_MAX_S = 14, SHOW_S = 1.4, FIRST_BONUS = 3, RULE_EVERY = 2, MIN_OPTIONS = 20, MAX_LEN = 16, COOLDOWN_STEPS = 8;
export const GRACE = { easy: 4, normal: 3, hard: 2 };
export const CPU_NAME = 'Quill';

const VOWELS = /[aeiou]/g;
/** Every rule a link can ask for. `test` sees a lower-case a-z word. */
export const RULES = [
  { id: 'any', text: 'Any word at all', short: 'any word', test: () => true },
  ...['r', 's', 't', 'n', 'l', 'o', 'a', 'i'].map(c => ({ id: 'has-' + c, text: `Must contain the letter ${c.toUpperCase()}`, short: `has ${c.toUpperCase()}`, test: w => w.includes(c) })),
  ...['e', 'a', 'i', 'o'].map(c => ({ id: 'no-' + c, text: `No letter ${c.toUpperCase()} anywhere`, short: `no ${c.toUpperCase()}`, test: w => !w.includes(c) })),
  { id: 'min6', text: 'At least 6 letters long', short: '6+ letters', test: w => w.length >= 6 },
  { id: 'min7', text: 'At least 7 letters long', short: '7+ letters', test: w => w.length >= 7 },
  { id: 'max4', text: 'No more than 4 letters', short: '4 letters max', test: w => w.length <= 4 },
  { id: 'double', text: 'Has a double letter, like LL or EE', short: 'double letter', test: w => /(.)\1/.test(w) },
  { id: 'vow3', text: 'At least 3 vowels (A E I O U)', short: '3+ vowels', test: w => (w.match(VOWELS) || []).length >= 3 },
  { id: 'end-y', text: 'Must end in Y', short: 'ends in Y', test: w => w.endsWith('y') },
  { id: 'end-s', text: 'Must end in S', short: 'ends in S', test: w => w.endsWith('s') },
];
export const RULE = Object.fromEntries(RULES.map(r => [r.id, r]));

let LIST = null, SET = null;
const words = () => { if (!LIST) { LIST = WORDS.split(' '); SET = new Set(LIST); } return LIST; };
export const isWord = w => { words(); return SET.has(w); };
/** Clean what a player typed: lower case, outer spaces gone. null when it is not letters a-z only. */
export const clean = s => { const w = String(s ?? '').trim().toLowerCase(); return /^[a-z]{1,16}$/.test(w) ? w : null; };
/** Why a word is refused for this link, or null when it is good. `used` = a Set of words already played. */
export function why(w, letter, rule, used) {
  if (!w) return 'letters only, please';
  if (w[0] !== letter) return `it must start with ${letter.toUpperCase()}`;
  if (w.length < 3) return 'at least 3 letters';
  if (!RULE[rule].test(w)) return `it breaks the rule: ${RULE[rule].short}`;
  if (used.has(w)) return 'already used this game';
  if (!isWord(w)) return 'not in our dictionary';
  return null;
}
/** Unused dictionary words that fit a letter + rule (stops counting at `cap`). */
export function options(letter, rule, used, cap = Infinity) {
  let n = 0; const t = RULE[rule].test;
  for (const w of words()) if (w[0] === letter && w.length >= 3 && t(w) && !used.has(w) && ++n >= cap) break;
  return n;
}

export function create({ rng, players, difficulty = 'normal' }) {
  const pids = players.map(p => p.pid), solo = pids.length === 1;
  const ids = solo ? [...pids, 'cpu'] : pids.slice();
  const grace = GRACE[difficulty] ?? GRACE.normal;
  const pts = Object.fromEntries(ids.map(k => [k, 0])), count = Object.fromEntries(ids.map(k => [k, 0]));
  const used = new Set(), chain = [], events = [];
  const all = words();
  // the opening word: a common one whose last letter starts plenty of words
  let prev = rng.pick(all.slice(0, 1500).filter(w => w.length >= 4 && w.length <= 6 && 'aeiou'.indexOf(w[w.length - 1]) < 0 && 'xqzjy'.indexOf(w[w.length - 1]) < 0));
  used.add(prev); chain.push({ w: prev, by: null });
  let phase = 'go', left = GAME_S, link = 0, letter = '', rule = 'any', ruleAt = 0, linkLeft = LINK_MAX_S, close = 0, first = null, got = [], over = false, stepNo = 0, cpuAt = Infinity;
  const lastTry = {};

  /** Choose this link's letter (the last letter of the word, or one further back if it is a hard one) and rule. */
  function pick() {
    const change = link > 0 && link - ruleAt >= RULE_EVERY;
    const pool = rng.shuffle(RULES.filter(r => r.id !== 'any' && r.id !== rule)).map(r => r.id);
    const tryRules = change ? pool : [rule, ...pool];
    const letters = [...new Set([...prev].reverse())];
    for (const L of letters) for (const r of tryRules) if (options(L, r, used, MIN_OPTIONS) >= MIN_OPTIONS) {
      if (r !== rule) ruleAt = link;
      letter = L; rule = r; return;
    }
    letter = 's'; rule = 'any'; ruleAt = link;                       // (never needed with this dictionary)
  }
  function start() {
    phase = 'go'; linkLeft = LINK_MAX_S; first = null; got = []; close = 0;
    pick();
    if (solo) { cpuAt = rng.range(5.5, 9.5); }
  }
  function cpuWord() {
    const t = RULE[rule].test, want = rng.int(4, 7), list = [];
    for (let i = 0; i < 5000 && i < all.length; i++) { const w = all[i]; if (w[0] === letter && w.length >= 4 && t(w) && !used.has(w) && !got.some(g => g.w === w)) list.push(w); }
    if (!list.length) return null;
    list.sort((a, b) => Math.abs(a.length - want) - Math.abs(b.length - want));
    return list[rng.int(0, Math.min(3, list.length - 1))];
  }
  function accept(k, w) {
    const isFirst = !first, p = w.length + (isFirst ? FIRST_BONUS : 0);
    pts[k] += p; count[k]++; used.add(w);
    got.push({ k, w, p, first: isFirst });
    if (isFirst) { first = { k, w }; close = grace; }
    events.push({ e: 'yes', k, w, p, first: isFirst });
    if (ids.every(i => got.some(g => g.k === i))) close = Math.min(close, 0.5);   // everyone is in: no need to wait
  }
  start();

  return {
    events,
    init: () => ({ seconds: GAME_S, solo, cpu: solo ? CPU_NAME : null, bonus: FIRST_BONUS, every: RULE_EVERY, grace, max: MAX_LEN }),
    act(pid, a, d) {
      if (over || a !== 'word' || !pids.includes(pid) || phase !== 'go') return;
      if (typeof d !== 'string' || d.length > 40) return;
      if (lastTry[pid] != null && stepNo - lastTry[pid] < COOLDOWN_STEPS) { events.push({ to: pid, e: 'no', w: d.slice(0, MAX_LEN), why: 'slow down a little' }); return; }
      lastTry[pid] = stepNo;
      if (got.some(g => g.k === pid)) { events.push({ to: pid, e: 'no', w: d.slice(0, MAX_LEN), why: 'you already scored this word' }); return; }
      const w = clean(d), bad = why(w, letter, rule, used);
      if (bad) { events.push({ to: pid, e: 'no', w: (w || d).slice(0, MAX_LEN), why: bad }); return; }
      accept(pid, w);
    },
    step(dt) {
      if (over) return;
      stepNo++; left -= dt;
      if (left <= 0) { left = 0; over = true; return; }
      if (phase === 'go') {
        linkLeft -= dt;
        if (solo && !got.some(g => g.k === 'cpu') && LINK_MAX_S - linkLeft >= cpuAt) { const w = cpuWord(); cpuAt = Infinity; if (w) accept('cpu', w); }
        if (first) { close -= dt; if (close <= 0) { phase = 'show'; linkLeft = SHOW_S; prev = first.w; chain.push({ w: first.w, by: first.k }); } }
        else if (linkLeft <= 0) {                                    // nobody: a fresh word from the dictionary sets a new letter
          phase = 'show'; linkLeft = SHOW_S;
          prev = rng.pick(all.slice(0, 3000).filter(w => !used.has(w) && w.length >= 4 && 'xqzjy'.indexOf(w[w.length - 1]) < 0 && w[w.length - 1] !== letter));
          used.add(prev); chain.push({ w: prev, by: null, skip: true });
        }
      } else if (phase === 'show') { linkLeft -= dt; if (linkLeft <= 0) { link++; start(); } }
    },
    state: () => ({
      phase, left: Math.max(0, Math.ceil(left)), link, letter, rule, ruleLeft: RULE_EVERY - (link - ruleAt), prev,
      close: first && phase === 'go' ? Math.max(0, Math.ceil(close)) : null, linkLeft: phase === 'go' && !first ? Math.max(0, Math.ceil(linkLeft)) : null,
      got: got.map(g => [g.k, g.w, g.p, g.first ? 1 : 0]), chain: chain.slice(-5).map(c => [c.w, c.by, c.skip ? 1 : 0]), pts: { ...pts },
    }),
    get over() { return over; },
    result() {
      const sorted = pids.slice().sort((a, b) => pts[b] - pts[a]), groups = new Map();
      for (const p of sorted) { if (!groups.has(pts[p])) groups.set(pts[p], []); groups.get(pts[p]).push(p); }
      return { order: [...groups.values()], scores: Object.fromEntries(pids.map(p => [p, pts[p]])), unit: meta.unit };
    },
  };
}
