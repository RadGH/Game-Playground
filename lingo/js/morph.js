// English morphology helpers for lingo. Pure functions, no DOM. Explicit lexicon forms always win; these are fallbacks.
import pluralizeLib from '../../vendor/pluralize/pluralize.esm.js';
// the UMD wrapper resolves differently depending on the host (function, {default}, or {pluralize}); accept all three
const pluralize = typeof pluralizeLib === 'function' ? pluralizeLib : (pluralizeLib.default || pluralizeLib.pluralize);

// Fantasy-friendly irregulars that pluralize does not know.
for (const [sg, pl] of [['elf', 'elves'], ['dwarf', 'dwarves'], ['wolf', 'wolves'], ['thief', 'thieves'], ['staff', 'staves'], ['leaf', 'leaves'], ['lich', 'liches'], ['golem', 'golems'], ['undead', 'undead'], ['kin', 'kin'], ['folk', 'folk'], ['mana', 'mana'], ['ore', 'ore']]) pluralize.addIrregularRule(sg, pl);

export function plural(word) { return pluralize.plural(word); }
export function singular(word) { return pluralize.singular(word); }
export function isPlural(word) { return pluralize.isPlural(word); }

const AN_EXCEPTIONS = /^(hour|honest|honor|honour|heir|herb)\b/i;
const A_EXCEPTIONS = /^(uni|use|usu|eu|ewe|one|once|ub|uk|ur[aei]|ut[eo]|uvu)/i;
/** Indefinite article for a word (based on spelling with common exceptions). */
export function article(word) {
  const w = String(word).trim(); if (!w) return 'a';
  if (AN_EXCEPTIONS.test(w)) return 'an';
  if (A_EXCEPTIONS.test(w)) return 'a';
  if (/^[A-Z]{2,}$/.test(w)) return /^[AEFHILMNORSX]/.test(w) ? 'an' : 'a'; // acronyms read letter by letter
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}
export function withArticle(word) { return `${article(word)} ${word}`; }

/** Possessive: Thalen → Thalen's, elves → elves', boss → boss's */
export function possessive(word) { const w = String(word); return /s$/i.test(w) && isPlural(w) ? w + "'" : w + "'s"; }

export function capitalize(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
export function upper(s) { return String(s).toUpperCase(); }
export function lower(s) { return String(s).toLowerCase(); }
export function titleCase(s) { return String(s).replace(/\b\w/g, c => c.toUpperCase()); }

const VERB_PAIRS = { is: 'are', has: 'have', does: 'do', was: 'were', goes: 'go', "isn't": "aren't", "hasn't": "haven't", "doesn't": "don't", "wasn't": "weren't" };
/** Third-person-singular verb → plural/base form ("walks" → "walk", "is" → "are"). */
export function verbPlural(v3) {
  const v = String(v3); if (VERB_PAIRS[v.toLowerCase()] != null) return matchCase(v, VERB_PAIRS[v.toLowerCase()]);
  if (/ies$/.test(v)) return v.slice(0, -3) + 'y';
  if (/(ss|sh|ch|x|z|o)es$/.test(v)) return v.slice(0, -2);
  if (/s$/.test(v) && !/ss$/.test(v)) return v.slice(0, -1);
  return v;
}
/** Base form → third-person-singular ("walk" → "walks"). */
export function verb3sg(base) {
  const v = String(base); const inv = Object.fromEntries(Object.entries(VERB_PAIRS).map(([a, b]) => [b, a])); if (inv[v.toLowerCase()]) return matchCase(v, inv[v.toLowerCase()]);
  if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + 'ies';
  if (/(ss|sh|ch|x|z|o)$/.test(v)) return v + 'es';
  return v + 's';
}
function matchCase(src, out) { return /^[A-Z]/.test(src) ? capitalize(out) : out; }

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** 0..999999 → words. Larger numbers fall back to digits. */
export function numberWords(n) {
  n = Math.round(Number(n)); if (!Number.isFinite(n)) return String(n); if (n < 0) return 'minus ' + numberWords(-n);
  if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numberWords(n % 100) : '');
  if (n < 1000000) return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + numberWords(n % 1000) : '');
  return String(n);
}
export function ordinal(n) { n = Math.round(Number(n)); const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

/** Join a list Oxford-style: "a, b, and c" */
export function joinList(items, conj = 'and') { const a = items.map(String); if (a.length <= 1) return a.join(''); if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`; return `${a.slice(0, -1).join(', ')}, ${conj} ${a[a.length - 1]}`; }

/** Sentence-case every sentence, fix spacing and doubled punctuation. */
export function tidy(text) {
  let t = String(text).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/([,.;:!?])(?=[A-Za-z])/g, '$1 ').trim();
  t = t.replace(/([.!?]){2,}/g, (m, p) => (m.includes('!') && m.includes('?')) ? '?!' : (m === '...' || m.length > 2 && p === '.') ? '...' : p);
  t = t.replace(/(^|[.!?]\s+|["“]\s*)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
  t = t.replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  if (t && !/[.!?…"'”)\]]$/.test(t)) t += '.';
  return t;
}

const CONTRACTIONS = [["do not", "don't"], ["does not", "doesn't"], ["did not", "didn't"], ["cannot", "can't"], ["can not", "can't"], ["will not", "won't"], ["would not", "wouldn't"], ["should not", "shouldn't"], ["could not", "couldn't"], ["is not", "isn't"], ["are not", "aren't"], ["was not", "wasn't"], ["were not", "weren't"], ["have not", "haven't"], ["has not", "hasn't"], ["had not", "hadn't"], ["I am", "I'm"], ["you are", "you're"], ["we are", "we're"], ["they are", "they're"], ["it is", "it's"], ["that is", "that's"], ["I will", "I'll"], ["you will", "you'll"], ["we will", "we'll"], ["I have", "I've"], ["you have", "you've"], ["we have", "we've"], ["I would", "I'd"], ["let us", "let's"]];
export function contract(text) { let t = text; for (const [a, b] of CONTRACTIONS) t = t.replace(new RegExp('\\b' + a + '\\b', 'g'), b).replace(new RegExp('\\b' + capitalize(a) + '\\b', 'g'), capitalize(b)); return t; }
export function expandContractions(text) { let t = text; for (const [a, b] of CONTRACTIONS) t = t.replace(new RegExp('\\b' + b.replace("'", "'") + '\\b', 'g'), a).replace(new RegExp('\\b' + capitalize(b) + '\\b', 'g'), capitalize(a)); return t; }
