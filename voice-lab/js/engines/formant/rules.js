// Letter-to-sound rules for words the dictionary does not know (invented names, misspellings).
// Style follows the 1976 NRL rules (Elovitz et al.): for each letter, an ordered list of [left, match, right, phones];
// contexts use a tiny pattern language: '#' one or more vowels, ':' zero or more consonants, '^' one consonant,
// '.' a voiced consonant, '+' a front vowel (e i y), ' ' word boundary, '%' a suffix (-e, -es, -ed, -ing, -er, -ely).
// The first rule whose contexts match wins. Output uses ARPAbet without stress; stress is assigned afterwards.
const V = 'aeiouy';
const isV = c => !!c && V.includes(c);
const isC = c => c && /[a-z]/.test(c) && !isV(c);

function matchLeft(word, i, pat) { // pat applies to word[0..i-1], matched from the right
  let p = pat.length - 1, j = i - 1;
  while (p >= 0) {
    const t = pat[p];
    if (t === ' ') { if (j >= 0) return false; p--; continue; }
    if (t === '#') { if (j < 0 || !isV(word[j])) return false; while (j >= 0 && isV(word[j])) j--; p--; continue; }
    if (t === ':') { while (j >= 0 && isC(word[j])) j--; p--; continue; }
    if (t === '^') { if (j < 0 || !isC(word[j])) return false; j--; p--; continue; }
    if (t === '.') { if (j < 0 || !'bdvgjlmnrwz'.includes(word[j])) return false; j--; p--; continue; }
    if (t === '+') { if (j < 0 || !'eiy'.includes(word[j])) return false; j--; p--; continue; }
    if (j < 0 || word[j] !== t) return false; j--; p--;
  }
  return true;
}
function matchRight(word, i, pat) { // pat applies to word[i..]
  let p = 0, j = i;
  while (p < pat.length) {
    const t = pat[p];
    if (t === ' ') { if (j < word.length) return false; p++; continue; }
    if (t === '#') { if (!isV(word[j] || '')) return false; while (isV(word[j] || '')) j++; p++; continue; }
    if (t === ':') { while (isC(word[j] || '')) j++; p++; continue; }
    if (t === '^') { if (!isC(word[j] || '')) return false; j++; p++; continue; }
    if (t === '.') { if (!'bdvgjlmnrwz'.includes(word[j] || '')) return false; j++; p++; continue; }
    if (t === '+') { if (!'eiy'.includes(word[j] || '')) return false; j++; p++; continue; }
    if (t === '%') { const rest = word.slice(j); if (!/^(e|es|ed|ing|er|ely|ers|est)$/.test(rest)) return false; return true; }
    if (word[j] !== t) return false; j++; p++;
  }
  return true;
}

// [left, match, right, phones]
export const RULES = {
  a: [['', 'a', ' ', 'AH'], ['', 'ae', '', 'EY'], ['', 'a', '^e^ ', 'EY'], ['', 'a', '^i^ ', 'EY'], ['', 'a', '^y ', 'EY'], [' ', 'are', ' ', 'AA R'], [' ', 'ar', 'o', 'AH R'], ['', 'ar', '#', 'EH R'], ['^', 'as', '#', 'EY S'], ['', 'a', 'wa', 'AH'], ['', 'aw', '', 'AO'], [' :', 'any', '', 'EH N IY'], ['', 'a', '^+#', 'EY'], ['#:', 'ally', '', 'AH L IY'], [' ', 'al', '#', 'AH L'], ['', 'again', '', 'AH G EH N'], ['#:', 'ag', 'e', 'IH JH'], ['', 'a', '^+:#', 'AE'], [' :', 'a', '^+ ', 'EY'], ['', 'a', '^%', 'EY'], [' ', 'arr', '', 'AH R'], ['', 'arr', '', 'AE R'], [' :', 'ar', ' ', 'AA R'], ['', 'ar', ' ', 'ER'], ['', 'ar', '', 'AA R'], ['', 'air', '', 'EH R'], ['', 'ai', '', 'EY'], ['', 'ay', '', 'EY'], ['', 'au', '', 'AO'], ['#:', 'al', ' ', 'AH L'], ['#:', 'als', ' ', 'AH L Z'], ['', 'alk', '', 'AO K'], ['', 'al', '^', 'AO L'], [' :', 'able', '', 'EY B AH L'], ['', 'able', '', 'AH B AH L'], ['', 'ang', '+', 'EY N JH'], ['', 'a', '', 'AE']],
  b: [[' ', 'be', '^#', 'B IH'], ['', 'being', '', 'B IY IH NG'], [' ', 'both', ' ', 'B OW TH'], [' ', 'bus', '#', 'B IH Z'], ['', 'buil', '', 'B IH L'], ['', 'b', '', 'B']],
  c: [[' ', 'ch', '^', 'K'], ['^e', 'ch', '', 'K'], ['', 'ch', '', 'CH'], [' s', 'ci', '#', 'S AY'], ['', 'ci', 'a', 'SH'], ['', 'ci', 'o', 'SH'], ['', 'ci', 'en', 'SH'], ['', 'c', '+', 'S'], ['', 'ck', '', 'K'], ['', 'com', '%', 'K AH M'], ['', 'c', '', 'K']],
  d: [['#:', 'ded', ' ', 'D IH D'], ['.e', 'd', ' ', 'D'], ['#:^e', 'd', ' ', 'T'], [' ', 'de', '^#', 'D IH'], [' ', 'do', ' ', 'D UW'], [' ', 'does', '', 'D AH Z'], [' ', 'doing', '', 'D UW IH NG'], [' ', 'dow', '', 'D AW'], ['', 'du', 'a', 'JH UW'], ['', 'd', '', 'D']],
  e: [['#:', 'e', ' ', ''], ['#:^', 'en', ' ', 'AH N'], ['#:^', 'el', ' ', 'AH L'], [' :', 'ey', '', 'EY'], ["'", 'e', ' ', ''], [' :', 'e', ' ', 'IY'], ['#', 'ed', ' ', 'D'], ['#:', 'e', 'd ', ''], ['', 'ev', 'er', 'EH V'], ['', 'e', '^%', 'IY'], ['', 'eri', '#', 'IY R IY'], ['', 'eri', '', 'EH R IH'], ['#:', 'er', '#', 'ER'], ['', 'er', '#', 'EH R'], ['', 'er', '', 'ER'], [' ', 'even', '', 'IY V EH N'], ['#:', 'e', 'w', ''], ['t', 'ew', '', 'UW'], ['s', 'ew', '', 'UW'], ['r', 'ew', '', 'UW'], ['d', 'ew', '', 'UW'], ['l', 'ew', '', 'UW'], ['z', 'ew', '', 'UW'], ['n', 'ew', '', 'UW'], ['j', 'ew', '', 'UW'], ['th', 'ew', '', 'UW'], ['ch', 'ew', '', 'UW'], ['sh', 'ew', '', 'UW'], ['', 'ew', '', 'Y UW'], ['', 'e', 'o', 'IY'], ['#:s', 'es', ' ', 'IH Z'], ['#:c', 'es', ' ', 'IH Z'], ['#:g', 'es', ' ', 'IH Z'], ['#:z', 'es', ' ', 'IH Z'], ['#:x', 'es', ' ', 'IH Z'], ['#:j', 'es', ' ', 'IH Z'], ['#:ch', 'es', ' ', 'IH Z'], ['#:sh', 'es', ' ', 'IH Z'], ['#:', 'e', 's ', ''], ['#:', 'ely', ' ', 'L IY'], ['#:', 'ement', '', 'M EH N T'], ['', 'eful', '', 'F UH L'], ['', 'ee', '', 'IY'], ['', 'earn', '', 'ER N'], [' ', 'ear', '^', 'ER'], ['', 'ead', '', 'EH D'], ['#:', 'ea', ' ', 'IY AH'], ['', 'ea', 'su', 'EH'], ['', 'ea', '', 'IY'], ['', 'eigh', '', 'EY'], ['', 'ei', '', 'IY'], [' ', 'eye', '', 'AY'], ['', 'ey', '', 'IY'], ['', 'eu', '', 'Y UW'], ['', 'e', '', 'EH']],
  f: [['', 'ful', '', 'F UH L'], ['', 'f', '', 'F']],
  g: [['', 'giv', '', 'G IH V'], [' ', 'g', 'i^', 'G'], ['', 'ge', 't', 'G EH'], ['su', 'gges', '', 'G JH EH S'], ['', 'gg', '', 'G'], [' b#', 'g', '', 'G'], ['', 'g', '+', 'JH'], ['', 'great', '', 'G R EY T'], ['#', 'gh', '', ''], ['', 'g', '', 'G']],
  h: [[' ', 'hav', '', 'HH AE V'], [' ', 'here', '', 'HH IY R'], [' ', 'hour', '', 'AW ER'], ['', 'how', '', 'HH AW'], ['', 'h', '#', 'HH'], ['', 'h', '', '']],
  i: [[' ', 'in', '', 'IH N'], [' ', 'i', ' ', 'AY'], ['^', 'i', ' ', 'IY'], ['', 'in', 'd', 'AY N'], ['', 'ier', '', 'IY ER'], ['#:r', 'ied', '', 'IY D'], ['', 'ied', ' ', 'AY D'], ['', 'ien', '', 'IY EH N'], ['', 'ie', 't', 'AY EH'], [' :', 'i', '%', 'AY'], ['', 'i', '%', 'IY'], ['', 'ie', '', 'IY'], ['', 'i', '^+:#', 'IH'], ['', 'ir', '#', 'AY R'], ['', 'iz', '%', 'AY Z'], ['', 'is', '%', 'AY Z'], ['', 'i', 'd%', 'AY'], ['+^', 'i', '^+', 'IH'], ['', 'i', 't%', 'AY'], ['#:^', 'i', '^+', 'IH'], ['', 'i', '^+', 'AY'], ['', 'ir', '', 'ER'], ['', 'igh', '', 'AY'], ['', 'ild', '', 'AY L D'], ['', 'ign', ' ', 'AY N'], ['', 'ign', '^', 'AY N'], ['', 'ign', '%', 'AY N'], ['', 'ique', '', 'IY K'], ['', 'i', '', 'IH']],
  j: [['', 'j', '', 'JH']],
  k: [[' ', 'k', 'n', ''], ['', 'k', '', 'K']],
  l: [['', 'lo', 'c#', 'L OW'], ['l', 'l', '', ''], ['#:^', 'l', '%', 'AH L'], ['', 'lead', '', 'L IY D'], ['', 'l', '', 'L']],
  m: [['', 'mov', '', 'M UW V'], ['', 'm', '', 'M']],
  n: [['e', 'ng', '+', 'N JH'], ['', 'ng', 'r', 'NG G'], ['', 'ng', '#', 'NG G'], ['', 'ngl', '%', 'NG G AH L'], ['', 'ng', '', 'NG'], ['', 'nk', '', 'NG K'], [' ', 'now', ' ', 'N AW'], ['', 'n', '', 'N']],
  o: [['', 'of', ' ', 'AH V'], [' ', 'orough', '', 'ER OW'], ['#:', 'or', ' ', 'ER'], ['#:', 'ors', ' ', 'ER Z'], ['', 'or', '', 'AO R'], [' ', 'one', '', 'W AH N'], ['', 'ow', '', 'OW'], [' ', 'over', '', 'OW V ER'], ['', 'ov', '', 'AH V'], ['', 'o', '^%', 'OW'], ['', 'o', '^en', 'OW'], ['', 'o', '^i#', 'OW'], ['', 'ol', 'd', 'OW L'], ['', 'ought', '', 'AO T'], ['', 'ough', '', 'AH F'], [' ', 'ou', '', 'AW'], ['h', 'ou', 's#', 'AW'], ['', 'ous', '', 'AH S'], ['', 'our', '', 'AO R'], ['', 'ould', '', 'UH D'], ['^', 'ou', '^l', 'AH'], ['', 'oup', '', 'UW P'], ['', 'ou', '', 'AW'], ['', 'oy', '', 'OY'], ['', 'oing', '', 'OW IH NG'], ['', 'oi', '', 'OY'], ['', 'oor', '', 'AO R'], ['', 'ook', '', 'UH K'], ['', 'ood', '', 'UH D'], ['', 'oo', '', 'UW'], ['', 'o', 'e', 'OW'], ['', 'o', ' ', 'OW'], ['', 'oa', '', 'OW'], [' ', 'only', '', 'OW N L IY'], [' ', 'once', '', 'W AH N S'], ["", "on't", '', 'OW N T'], ['c', 'o', 'n', 'AA'], ['', 'o', 'ng', 'AO'], [' :^', 'o', 'n', 'AH'], ['i', 'on', '', 'AH N'], ['#:', 'on', ' ', 'AH N'], ['#:^', 'on', '', 'AH N'], ['', 'o', 'st ', 'OW'], ['', 'of', '^', 'AO F'], ['', 'other', '', 'AH DH ER'], ['', 'oss', ' ', 'AO S'], ['#:^', 'om', '', 'AH M'], ['', 'o', '', 'AA']],
  p: [['', 'ph', '', 'F'], ['', 'peop', '', 'P IY P'], ['', 'pow', '', 'P AW'], ['', 'put', ' ', 'P UH T'], ['', 'p', '', 'P']],
  q: [['', 'quar', '', 'K W AO R'], ['', 'qu', '', 'K W'], ['', 'q', '', 'K']],
  r: [[' ', 're', '^#', 'R IY'], ['r', 'r', '', ''], ['', 'r', '', 'R']],
  s: [['', 'sh', '', 'SH'], ['#', 'sion', '', 'ZH AH N'], ['', 'some', '', 'S AH M'], ['#', 'sur', '#', 'ZH ER'], ['', 'sur', '#', 'SH ER'], ['#', 'su', '#', 'ZH UW'], ['#', 'ssu', '#', 'SH UW'], ['#', 'sed', ' ', 'Z D'], ['#', 's', '#', 'Z'], ['', 'said', '', 'S EH D'], ['^', 'sion', '', 'SH AH N'], ['', 's', 's', ''], ['.', 's', ' ', 'Z'], ['#:.e', 's', ' ', 'Z'], ['#:^##', 's', ' ', 'Z'], ['#:^#', 's', ' ', 'S'], ['u', 's', ' ', 'S'], [' :#', 's', ' ', 'Z'], [' ', 'sch', '', 'S K'], ['', 's', 'c+', ''], ['#', 'sm', '', 'Z M'], ['#', 'sn', "'", 'Z AH N'], ['', 's', '', 'S']],
  t: [[' ', 'the', ' ', 'DH AH'], ['', 'to', ' ', 'T UW'], ['', 'that', '', 'DH AE T'], [' ', 'this', ' ', 'DH IH S'], [' ', 'they', '', 'DH EY'], [' ', 'there', '', 'DH EH R'], ['', 'ther', '', 'DH ER'], ['', 'their', '', 'DH EH R'], [' ', 'than', ' ', 'DH AE N'], [' ', 'them', ' ', 'DH EH M'], ['', 'these', ' ', 'DH IY Z'], [' ', 'then', '', 'DH EH N'], ['', 'through', '', 'TH R UW'], ['', 'those', '', 'DH OW Z'], ['', 'though', ' ', 'DH OW'], [' ', 'thus', '', 'DH AH S'], ['', 'th', '', 'TH'], ['#:', 'ted', ' ', 'T IH D'], ['s', 'ti', '#n', 'CH'], ['', 'ti', 'o', 'SH'], ['', 'ti', 'a', 'SH'], ['', 'tien', '', 'SH AH N'], ['', 'tur', '#', 'CH ER'], ['', 'tu', 'a', 'CH UW'], [' ', 'two', '', 'T UW'], ['', 't', '', 'T']],
  u: [[' ', 'un', 'i', 'Y UW N'], [' ', 'un', '', 'AH N'], [' ', 'upon', '', 'AH P AO N'], ['t', 'ur', '#', 'UH R'], ['s', 'ur', '#', 'UH R'], ['r', 'ur', '#', 'UH R'], ['d', 'ur', '#', 'UH R'], ['l', 'ur', '#', 'UH R'], ['z', 'ur', '#', 'UH R'], ['n', 'ur', '#', 'UH R'], ['j', 'ur', '#', 'UH R'], ['th', 'ur', '#', 'UH R'], ['ch', 'ur', '#', 'UH R'], ['sh', 'ur', '#', 'UH R'], ['', 'ur', '#', 'Y UH R'], ['', 'ur', '', 'ER'], ['', 'u', '^ ', 'AH'], ['', 'u', '^^', 'AH'], ['', 'uy', '', 'AY'], [' g', 'u', '#', ''], ['g', 'u', '%', ''], ['g', 'u', '#', 'W'], ['#n', 'u', '', 'Y UW'], ['t', 'u', '', 'UW'], ['s', 'u', '', 'UW'], ['r', 'u', '', 'UW'], ['d', 'u', '', 'UW'], ['l', 'u', '', 'UW'], ['z', 'u', '', 'UW'], ['n', 'u', '', 'UW'], ['j', 'u', '', 'UW'], ['th', 'u', '', 'UW'], ['ch', 'u', '', 'UW'], ['sh', 'u', '', 'UW'], ['', 'u', '', 'Y UW']],
  v: [['', 'view', '', 'V Y UW'], ['', 'v', '', 'V']],
  w: [[' ', 'were', '', 'W ER'], ['', 'wa', 's', 'W AA'], ['', 'wa', 't', 'W AA'], ['', 'where', '', 'W EH R'], ['', 'what', '', 'W AA T'], ['', 'whol', '', 'HH OW L'], ['', 'who', '', 'HH UW'], ['', 'wh', '', 'W'], ['', 'war', '', 'W AO R'], ['', 'wor', '^', 'W ER'], ['', 'wr', '', 'R'], ['', 'w', '', 'W']],
  x: [[' ', 'x', '', 'Z'], ['', 'x', '', 'K S']],
  y: [['', 'young', '', 'Y AH NG'], [' ', 'you', '', 'Y UW'], [' ', 'yes', '', 'Y EH S'], [' ', 'y', '', 'Y'], ['#:^', 'y', ' ', 'IY'], ['#:^', 'y', 'i', 'IY'], [' :', 'y', ' ', 'AY'], [' :', 'y', '#', 'AY'], [' :', 'y', '^+:#', 'IH'], [' :', 'y', '^#', 'AY'], ['', 'y', '', 'IH']],
  z: [['', 'z', '', 'Z']],
  "'": [['', "'s", ' ', 'Z'], ['', "'", '', '']],
};

for (const c of 'bcdfgkmnptvz') RULES[c].unshift([c, c, '', '']); // second letter of a double consonant is silent

/** Convert one lowercase word to ARPAbet phones (no stress) using the rules. */
export function lettersToPhones(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, ''); const out = []; let i = 0;
  while (i < w.length) {
    const c = w[i]; const rules = RULES[c];
    if (!rules) { i++; continue; }
    let hit = null;
    for (const [left, match, right, phones] of rules) {
      if (w.startsWith(match, i) && matchLeft(w, i, left) && matchRight(w, i + match.length, right)) { hit = [match, phones]; break; }
    }
    if (!hit) { i++; continue; }
    if (hit[1]) out.push(...hit[1].split(' '));
    i += hit[0].length;
  }
  return out;
}
