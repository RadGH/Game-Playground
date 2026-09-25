// Text → phonemes (ARPAbet with stress digits). Dictionary (CMUdict, BSD) first, then derivations (-s, -'s, -ed, -ing, -er),
// then letter-to-sound rules for anything else (invented names). Custom pronunciations override everything.
// Also accepts inline phoneme blocks: [[HH AH0 L OW1]] (ARPAbet) or espeak-style [[h@l'oU]] (converted).
import { lettersToPhones } from './rules.js';
import { isVowel, stripStress } from './phonemes.js';

let DICT = null, loading = null;
export const dictUrl = new URL('../../../data/cmudict/cmudict.txt', import.meta.url).href;
/** Load the dictionary (browser fetch or node fs). Safe to call repeatedly. */
export function loadDictionary(text) {
  if (text) { DICT = parse(text); return Promise.resolve(DICT); }
  if (DICT) return Promise.resolve(DICT);
  if (!loading) loading = (typeof window !== 'undefined' ? fetch(dictUrl).then(r => r.text()) : import('node:fs').then(fs => fs.readFileSync(new URL(dictUrl), 'utf8'))).then(t => (DICT = parse(t)));
  return loading;
}
function parse(text) { const m = new Map(); for (const line of text.split('\n')) { const i = line.indexOf('\t'); if (i > 0) m.set(line.slice(0, i), line.slice(i + 1)); } return m; }
export function dictionarySize() { return DICT ? DICT.size : 0; }

const CUSTOM = new Map();
/** Add/override a pronunciation: addPronunciation('thalen', 'TH EY1 L AH0 N') */
export function addPronunciation(word, phones) { CUSTOM.set(word.toLowerCase(), typeof phones === 'string' ? phones.trim().split(/\s+/) : phones); }
export function clearPronunciations() { CUSTOM.clear(); }

const ABBREV = { mr: 'mister', mrs: 'missus', ms: 'miz', dr: 'doctor', st: 'saint', vs: 'versus', etc: 'etcetera' };
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numberWords(n) { n = Math.round(n); if (n < 0) return 'minus ' + numberWords(-n); if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numberWords(n % 100) : ''); if (n < 1e6) return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberWords(n % 1000) : ''); return String(n).split('').map(d => ONES[+d]).join(' '); }

const PH_OPEN = '§', PH_SEP = '¦'; // printable markers for protected phoneme blocks (never appear in normal text)
/** Expand numbers, abbreviations, symbols; keep punctuation attached so it can be split per word. */
export function normalize(text) {
  let t = String(text).replace(/\s+/g, ' ');
  // stash phoneme blocks first so number expansion never touches their stress digits; placeholders use letters only
  const blocks = []; t = t.replace(/\[\[([^\]]*)\]\]/g, (m, p) => { blocks.push(p.trim()); return ' ' + PH_OPEN + String.fromCharCode(97 + (blocks.length - 1) % 26) + String.fromCharCode(97 + Math.floor((blocks.length - 1) / 26)) + ' '; });
  t = t.replace(/(\d+)%/g, '$1 percent').replace(/\$(\d+)/g, '$1 dollars').replace(/&/g, ' and ').replace(/\+/g, ' plus ');
  t = t.replace(/\d[\d,]*(\.\d+)?/g, m => { const n = Number(m.replace(/,/g, '')); return Number.isFinite(n) ? (Number.isInteger(n) ? numberWords(n) : numberWords(Math.floor(n)) + ' point ' + String(n).split('.')[1].split('').map(d => ONES[+d]).join(' ')) : m; });
  t = t.replace(/\b([A-Za-z]{1,3})\.(?=\s|$)/g, (m, a) => ABBREV[a.toLowerCase()] ? ABBREV[a.toLowerCase()] + ' .' : m);
  t = t.replace(new RegExp(PH_OPEN + '([a-z])([a-z])', 'g'), (m, a, b) => PH_OPEN + blocks[(a.charCodeAt(0) - 97) + 26 * (b.charCodeAt(0) - 97)].split(' ').join(PH_SEP));
  return t;
}

const ESPEAK2ARPA = [['tS', 'CH'], ['dZ', 'JH'], ['aI', 'AY'], ['eI', 'EY'], ['OI', 'OY'], ['oU', 'OW'], ['aU', 'AW'], ['i:', 'IY'], ['u:', 'UW'], ['A:', 'AA'], ['O:', 'AO'], ['3:', 'ER'], ['@L', 'AH L'], ['e@', 'EH R'], ['i@', 'IH R'], ['U@', 'UH R'], ['a#', 'AE'], ['I#', 'IH'], ['I2', 'IH'], ['@', 'AH'], ['a', 'AE'], ['e', 'EH'], ['i', 'IY'], ['I', 'IH'], ['O', 'AA'], ['0', 'AA'], ['A', 'AA'], ['V', 'AH'], ['U', 'UH'], ['u', 'UW'], ['T', 'TH'], ['D', 'DH'], ['S', 'SH'], ['Z', 'ZH'], ['N', 'NG'], ['j', 'Y'], ['h', 'HH'], ['R', 'R'], ['r', 'R'], ['p', 'P'], ['b', 'B'], ['t', 'T'], ['d', 'D'], ['k', 'K'], ['g', 'G'], ['f', 'F'], ['v', 'V'], ['s', 'S'], ['z', 'Z'], ['m', 'M'], ['n', 'N'], ['l', 'L'], ['w', 'W']];
/** Convert an espeak ASCII phoneme string (Kirshenbaum-style) to ARPAbet with stress digits. */
export function espeakToArpabet(s) {
  const out = []; let stress = 0, str = s.replace(/_:?/g, ' ');
  for (let i = 0; i < str.length;) {
    const c = str[i];
    if (c === "'") { stress = 1; i++; continue; } if (c === ',') { stress = 2; i++; continue; } if (c === ' ' || c === '%' || c === '=') { i++; continue; }
    let hit = null; for (const [k, v] of ESPEAK2ARPA) if (str.startsWith(k, i)) { hit = [k, v]; break; }
    if (!hit) { i++; continue; }
    for (const p of hit[1].split(' ')) { if (isVowel(p)) { out.push(p + (stress || 0)); stress = 0; } else out.push(p); }
    i += hit[0].length;
  }
  return out;
}
const ARPA_TOKEN = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)[0-2]?$|^(B|CH|D|DH|F|G|HH|JH|K|L|M|N|NG|P|R|S|SH|T|TH|V|W|Y|Z|ZH)$/;

/** Assign primary stress when a phone list has none: first syllable of 1–2 syllable words, penultimate for longer. */
export function assignStress(phones) {
  if (phones.some(p => /[12]$/.test(p))) return phones;
  const vi = phones.map((p, i) => isVowel(p) ? i : -1).filter(i => i >= 0);
  if (!vi.length) return phones;
  const target = vi.length <= 2 ? vi[0] : vi[vi.length - 2];
  return phones.map((p, i) => isVowel(p) ? stripStress(p) + (i === target ? '1' : '0') : p);
}

const SIB = ['S', 'Z', 'SH', 'ZH', 'CH', 'JH'], VOICED_C = ['B', 'D', 'G', 'V', 'DH', 'Z', 'ZH', 'JH', 'M', 'N', 'NG', 'L', 'R', 'W', 'Y'];
const lastOf = p => stripStress(p[p.length - 1]);
const pluralOf = p => (SIB.includes(lastOf(p)) ? ['IH0', 'Z'] : (isVowel(lastOf(p)) || VOICED_C.includes(lastOf(p))) ? ['Z'] : ['S']);
const pastOf = p => { const l = lastOf(p); return l === 'T' || l === 'D' ? ['IH0', 'D'] : (isVowel(l) || VOICED_C.includes(l)) ? ['D'] : ['T']; };
const dict = w => (DICT?.has(w) ? DICT.get(w).split(' ') : null);

function lookup(word) {
  const w = word.toLowerCase(); let p;
  if (CUSTOM.has(w)) return { phones: [...CUSTOM.get(w)], source: 'custom' };
  if ((p = dict(w))) return { phones: p, source: 'dict' };
  if (w.endsWith("'s") && w.length > 3) { const b = lookup(w.slice(0, -2)); return { phones: [...b.phones, ...pluralOf(b.phones)], source: b.source === 'dict' ? 'dict+suffix' : b.source }; }
  if (w.endsWith('es') && (p = dict(w.slice(0, -2)))) return { phones: [...p, ...pluralOf(p)], source: 'dict+suffix' };
  if (w.endsWith('s') && (p = dict(w.slice(0, -1)))) return { phones: [...p, ...pluralOf(p)], source: 'dict+suffix' };
  if (w.endsWith('ed')) for (const base of [w.slice(0, -2), w.slice(0, -1), w.slice(0, -3)]) if ((p = dict(base))) return { phones: [...p, ...pastOf(p)], source: 'dict+suffix' };
  if (w.endsWith('ing')) for (const base of [w.slice(0, -3), w.slice(0, -3) + 'e', w.slice(0, -4)]) if ((p = dict(base))) return { phones: [...p, 'IH0', 'NG'], source: 'dict+suffix' };
  if (w.endsWith('er')) for (const base of [w.slice(0, -2), w.slice(0, -1)]) if ((p = dict(base))) return { phones: [...p, 'ER0'], source: 'dict+suffix' };
  if (w.endsWith('ly') && (p = dict(w.slice(0, -2)))) return { phones: [...p, 'L', 'IY0'], source: 'dict+suffix' };
  if (w.includes('-')) { const parts = w.split('-').filter(Boolean).map(lookup); return { phones: parts.flatMap(x => x.phones), source: 'compound' }; }
  return { phones: assignStress(lettersToPhones(w)), source: 'rules' };
}

/**
 * Main entry. Returns { words: [{ text, phones, source, punct }], phones: flat list with word boundaries ('|') and punctuation }.
 */
export function textToPhonemes(text) {
  const norm = normalize(text); const words = [];
  const tokens = norm.match(/\S+/g) || [];
  for (const tok of tokens) {
    if (tok[0] === PH_OPEN) { // phoneme block
      const raw = tok.slice(1).split(PH_SEP).join(' ').trim(); const parts = raw.split(/\s+/);
      const phones = parts.every(p => ARPA_TOKEN.test(p)) ? assignStress(parts.map(p => isVowel(p) && !/[0-2]$/.test(p) ? p + '0' : p)) : assignStress(espeakToArpabet(raw));
      words.push({ text: raw, phones, source: 'phonemes', punct: '' }); continue;
    }
    const m = /^([^A-Za-z']*)([A-Za-z][A-Za-z'\-]*)?(.*)$/.exec(tok); if (!m) continue;
    const word = m[2], trail = m[3] || '';
    if (word) { const { phones, source } = lookup(word.replace(/^'+|'+$/g, '') || word); if (phones.length) words.push({ text: word, phones, source, punct: '' }); }
    const punct = trail.includes('?') ? '?' : trail.includes('!') ? '!' : /[.…]/.test(trail) ? '.' : /[;:]/.test(trail) ? ';' : trail.includes(',') ? ',' : '';
    if (punct && words.length) words[words.length - 1].punct = punct;
  }
  return { words, phones: words.flatMap(w => [...w.phones, w.punct ? w.punct : '|']) };
}
