// Name generator: per-race languages (phonology + concept dictionary), pattern grammar, tags, seeded rng.
//   import { NameGen } from '/namegen/js/namegen.js';
//   const gen = await NameGen.load('/namegen/data/');      // or new NameGen({ languages, concepts, patterns })
//   gen.generate('person.full', { race: 'elf', gender: 'f', seed: 42 })
//   → { text: 'Ithilwen Ashvine', category, race, gender, parts: { given, family }, gloss: ['ash', 'vine'], forms: { sg, short, poss }, respell: 'ITH-il-wen ASH-vine', tags: [...], seed }
//   gen.toLexiconEntry(result)  → a lingo lexicon entry (person / faction / place / item)
export function makeRng(seed) {
  let a = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.weighted = (items, w) => { let total = 0; for (const it of items) total += w(it); let r = next() * total; for (const it of items) { r -= w(it); if (r <= 0) return it; } return items[items.length - 1]; };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return next;
}
export function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const VOW = 'aeiouy';
export function pluralize(w) { if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es'; if (/[^aeiou]y$/i.test(w)) return w.slice(0, -1) + 'ies'; if (/(fe?)$/i.test(w) && !/(ff|fe)$/i.test(w)) return w.replace(/f$/i, 'ves'); if (/man$/i.test(w)) return w.replace(/man$/i, 'men'); if (/tooth$/i.test(w)) return w.replace(/tooth$/i, 'teeth'); if (/foot$/i.test(w)) return w.replace(/foot$/i, 'feet'); return w + 's'; }
export function possessive(w) { return /s$/i.test(w) ? w + "'" : w + "'s"; }

export class NameGen {
  constructor({ languages, concepts, patterns }) {
    this.languages = languages.languages || languages; this.concepts = concepts.concepts || concepts; this.patterns = patterns; this.wordCache = new Map();
    this.byId = Object.fromEntries(this.concepts.map(c => [c.id, c]));
  }
  static async load(base = './data/') { const j = async f => (await fetch(base + f)).json(); const [languages, concepts, patterns] = await Promise.all([j('languages.json'), j('concepts.json'), j('patterns.json')]); return new NameGen({ languages, concepts, patterns }); }
  get races() { return Object.keys(this.languages); }
  get categories() { return Object.keys(this.patterns.categories); }
  lang(race) { return this.languages[race] || this.languages.human; }

  // ---- native word generation from phonology (deterministic per seed)
  syllable(ph, rng, pos, count) {
    const pickW = obj => rng.weighted(Object.keys(obj), k => obj[k]);
    let onset = pickW(ph.onsets), nucleus = pickW(ph.nuclei), coda = pickW(ph.codas);
    if (pos === 0 && onset === '' && rng() < 0.5) onset = pickW(ph.onsets);           // words usually start with a consonant
    if (pos < count - 1 && coda && coda.length > 1 && rng() < 0.6) coda = coda[0];    // lighter codas inside words
    return { onset, nucleus, coda, text: onset + nucleus + coda };
  }
  /** Generate a native word: n syllables (or from the language's weights), optional gendered ending. */
  nativeWord(race, rng, { syllables = null, gender = null } = {}) {
    const ph = this.lang(race).phonology; let n = syllables || +rng.weighted(Object.keys(ph.syllables), k => ph.syllables[k]);
    const ending = gender && ph.endings?.[gender]?.length ? rng.pick(ph.endings[gender]) : '';
    if (ending) n = Math.max(1, n - 1); // the ending counts as a syllable
    const syls = []; for (let i = 0; i < n; i++) syls.push(this.syllable(ph, rng, i, n));
    let text = syls.map(s => s.text).join('');
    if (ending) { const endsV = VOW.includes(text.slice(-1)), startsV = VOW.includes(ending[0]); if (endsV && startsV) text = text.replace(/[aeiouy]+$/, ''); else if (!endsV && !startsV) text += rng.pick(['a', 'i', 'e', 'o', 'u']); text += ending; syls.push({ text: ending }); }
    for (const [a, b] of ph.ortho || []) text = text.split(a).join(b);
    text = text.replace(/([bcdfghjklmnpqrstvwxz])\1\1/g, '$1$1').replace(/^(.)\1/, '$1');
    return { text: cap(text), syllables: syls.map(s => s.text), respell: syls.map((s, i) => (i === 0 ? s.text.toUpperCase() : s.text)).join('-') };
  }
  /** Translate a concept into a language: curated lexicon first, else a stable generated word. */
  translate(race, conceptId) {
    const L = this.lang(race); if (L.lexicon?.[conceptId]) return L.lexicon[conceptId];
    if (race === 'human' || race === 'halfling') return cap(this.byId[conceptId]?.en || conceptId);
    const key = race + ':' + conceptId; if (this.wordCache.has(key)) return this.wordCache.get(key);
    const w = this.nativeWord(race, makeRng(hash(key)), { syllables: 1 + (hash(key + 'n') % 2) }).text; this.wordCache.set(key, w); return w;
  }
  /** Pick a concept with any of the tags, weighted by race affinity. Tags may also be concept ids. */
  pickConcept(rng, tags, race, used = new Set()) {
    const want = tags.split(',').map(t => t.trim()).filter(Boolean);
    let pool = this.concepts.filter(c => !used.has(c.id) && (want.some(t => c.tags.includes(t) || c.id === t)));
    if (!pool.length) pool = this.concepts;
    return rng.weighted(pool, c => (c.races?.[race] ?? 0.25) * (c.tags.includes('adjective') && want.includes('quality') ? 1.2 : 1));
  }

  // ---- pattern expansion
  expand(text, ctx) {
    const { rng, race, gender, L, out } = ctx; let idx = 0;
    return text.replace(/\{([^{}]+)\}/g, (m, body) => {
      idx++;
      if (body.startsWith('~')) return body.slice(1).split('|')[Math.floor(rng() * body.slice(1).split('|').length)];
      const [head, ...mods] = body.split('|'); const [kind, arg] = head.split(':'); let val = '', concept = null;
      if (kind === 'given') { const g = gender || rng.pick(['m', 'f', 'n']); const pool = L.curated.given[g]?.length ? L.curated.given[g] : L.curated.given.m; val = rng() < 0.7 ? rng.pick(pool) : this.nativeWord(race, rng, { syllables: 2, gender: g }).text; out.parts.given = out.parts.given || val; }
      else if (kind === 'family') { val = rng() < 0.6 && L.curated.familyNative?.length ? rng.pick(L.curated.familyNative) : this.compound(rng, race, out); out.parts.family = out.parts.family || val; }
      else if (kind === 'epithet') { val = rng.pick(L.curated.epithets); out.parts.epithet = out.parts.epithet || val; }
      else if (kind === 'native') { val = this.nativeWord(race, rng, { syllables: +arg || null }).text; }
      else if (kind === 'concept' || kind === 'tr') { concept = this.pickConcept(rng, arg, race, out.usedConcepts); out.usedConcepts.add(concept.id); out.gloss.push(concept.en); val = kind === 'tr' ? this.translate(race, concept.id) : concept.en; if (kind === 'concept' && mods.includes('adj') && concept.adj) val = concept.adj; if (mods.includes('agent') && concept.agent) val = concept.agent; if (mods.includes('adj') && !concept.adj) val = concept.en; }
      else if (kind === 'list') { val = rng.pick(this.patterns.lists[arg] || [arg]); out.parts['list'] = out.parts.list || val; }
      else if (kind === 'race') { val = L.race[arg || 'sg']; }
      else val = m;
      for (const mod of mods) { if (mod === 'cap') val = cap(val); else if (mod === 'lower') val = val.toLowerCase(); }
      out.slots.push({ kind, val, concept });
      for (const mod of mods) { if (mod === 'pl') val = pluralize(val); else if (mod === 'possessive') val = possessive(val); else if (mod === 'a') val = (/^[aeiou]/i.test(val) ? 'an ' : 'a ') + val; else if (mod === 'the') val = 'the ' + val; }
      return val;
    });
  }
  compound(rng, race, out) { const a = this.pickConcept(rng, 'nature,metal,weather,element,quality,animal', race, out.usedConcepts); out.usedConcepts.add(a.id); const b = this.pickConcept(rng, 'nature,body,landform,war,agent,animal', race, out.usedConcepts); out.usedConcepts.add(b.id); out.gloss.push(a.en, b.en); return joinCompound(cap((a.adj && rng() < 0.3 ? a.adj : a.en).toLowerCase()), (b.agent || b.en).toLowerCase()); }
  /** Fill a forms template with slots of the main expansion ({1} = first slot value, {given}, {family}, {list}, {concept}, {tr}, * = name). */
  fillForm(tpl, out, name) {
    return tpl.replace(/\*/g, name).replace(/\{([^{}]+)\}/g, (m, body) => {
      const [head, ...mods] = body.split('|'); let val;
      if (/^\d+$/.test(head)) val = out.slots[+head - 1]?.val ?? ''; else if (head === 'given' || head === 'family' || head === 'list') val = out.parts[head] ?? ''; else if (head === 'concept' || head === 'tr') val = out.slots.find(s => s.kind === head)?.val ?? '';
      else val = out.slots.find(s => s.kind === head)?.val ?? m;
      for (const mod of mods) { if (mod === 'pl') val = pluralize(val); else if (mod === 'sg') val = val.replace(/s$/, ''); else if (mod === 'possessive') val = possessive(val); else if (mod === 'cap') val = cap(val); }
      return val;
    });
  }

  /**
   * Generate one name. opts: { race, gender ('m'|'f'|'n'), seed, tags: [] (prefer patterns with these tags), pattern (index) }
   */
  generate(category, opts = {}) {
    const race = opts.race && this.languages[opts.race] ? opts.race : 'human';
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9); const rng = makeRng(seed); const L = this.lang(race);
    const gender = opts.gender && opts.gender !== 'any' ? opts.gender : rng.pick(['m', 'f', 'm', 'f', 'n']);
    const list = (this.patterns.categories[category] || []).filter(p => (!p.races || p.races.includes(race)) && !(p.not || []).includes(race) && (!p.gender || p.gender === gender));
    if (!list.length) throw new Error('no patterns for ' + category + ' / ' + race);
    const pat = opts.pattern != null ? list[opts.pattern % list.length] : rng.weighted(list, p => (p.w ?? 1) * ((opts.tags || []).some(t => (p.tags || []).includes(t)) ? 3 : 1));
    const out = { parts: {}, gloss: [], usedConcepts: new Set(), slots: [] };
    const text = tidyName(this.expand(pat.t, { rng, race, gender, L, out }).replace(/\s+/g, ' ').trim());
    const forms = { sg: text }; for (const [k, tpl] of Object.entries(pat.forms || {})) forms[k] = this.fillForm(tpl, out, text);
    if (category === 'person.full' || category === 'person.given') { forms.short = forms.short || out.parts.given || text; forms.poss = possessive(text); }
    if (category === 'faction') { forms.members = forms.members || text.replace(/^the /i, ''); forms.member = forms.member || forms.members.replace(/s$/, ''); forms.adj = forms.adj || forms.member; forms.people = forms.people || text; }
    const result = { text, category, race, gender: category.startsWith('person') ? gender : undefined, parts: out.parts, gloss: pat.gloss ? out.gloss : [], forms, respell: respellOf(text), tags: [...(pat.tags || []), race, ...(L.style || [])], seed, pattern: pat.t };
    return result;
  }
  /** Batch with distinct seeds. */
  batch(category, n, opts = {}) { const base = opts.seed ?? Math.floor(Math.random() * 1e9); const seen = new Set(); const out = []; for (let i = 0; i < n * 3 && out.length < n; i++) { const r = this.generate(category, { ...opts, seed: (base + i * 7919) >>> 0 }); if (!seen.has(r.text)) { seen.add(r.text); out.push(r); } } return out; }

  /** Convert to a lingo lexicon entry. */
  toLexiconEntry(r) {
    const id = r.text.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (r.category.startsWith('person')) return { id, type: 'person', proper: true, pronouns: r.gender === 'm' ? 'he' : r.gender === 'f' ? 'she' : 'they', race: r.race, forms: { sg: r.text, short: r.forms.short || r.text }, tags: ['generated', r.race], pron: { respell: r.respell }, gloss: r.gloss.join(' + ') || undefined };
    if (r.category === 'faction') return { id, type: 'faction', proper: true, forms: { sg: r.text, pl: r.forms.members, adj: r.forms.adj || r.forms.member, people: r.forms.people || r.text }, tags: ['generated', r.race], pron: { respell: r.respell } };
    if (r.category === 'region' || r.category === 'settlement' || r.category === 'landmark') return { id, type: 'place', proper: true, forms: { sg: r.text, adj: r.forms.adj || r.text, people: r.forms.people || r.text + ' folk' }, tags: ['generated', r.race, r.category], pron: { respell: r.respell } };
    if (r.category === 'object') return { id, type: 'item', proper: true, forms: { sg: r.text }, tags: ['generated', 'artifact', r.race], pron: { respell: r.respell } };
    return { id, type: 'concept', proper: true, forms: { sg: r.text }, tags: ['generated', r.race, r.category] };
  }
}

/** Join two compound halves without ugly letter pile-ups (Ash+shelf → Ashelf, Iron+nail → Ironail is avoided: keep both unless a digraph repeats). */
export function joinCompound(a, b) {
  let s = a + b;
  s = s.replace(/shsh/g, 'sh').replace(/thth/g, 'th').replace(/chch/g, 'ch').replace(/(.)\1\1/g, '$1$1');
  return s;
}
export function tidyName(s) { return s.replace(/(.)\1\1/g, '$1$1').replace(/shsh/g, 'sh').replace(/thth/g, 'th'); }

/** Syllabify a word: V-CV, VC-CV; digraphs (th sh ch ck ph wh gh ng) stay together; a silent final e joins the last syllable. */
export function syllabify(word) {
  const w = word.toLowerCase(); const isV = c => 'aeiouy'.includes(c);
  const groups = []; let i = 0; while (i < w.length) { const v = isV(w[i]); let j = i; while (j < w.length && isV(w[j]) === v) j++; groups.push({ v, s: w.slice(i, j) }); i = j; }
  const out = []; let cur = '';
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    if (!grp.v) { cur += grp.s; continue; }
    cur += grp.s;
    const cons = groups[g + 1]?.s, nextV = g + 2 < groups.length;
    if (cons == null) break;
    if (!nextV) { cur += cons; g++; continue; }                                  // word-final consonants
    const dig = /^(th|sh|ch|ck|ph|wh|gh|ng)/.test(cons);
    const keep = cons.length === 1 ? 0 : dig ? (cons.length === 2 ? 0 : 2) : 1;   // consonants that stay with this syllable
    cur += cons.slice(0, keep); out.push(cur); cur = cons.slice(keep); g++;
  }
  if (cur) out.push(cur);
  // silent final e: "vine" → ["vi","ne"] → ["vine"]
  if (out.length > 1 && out[out.length - 1].length === 2 && out[out.length - 1].endsWith('e') && !isV(out[out.length - 1][0])) { const last = out.pop(); out[out.length - 1] += last; }
  return out.filter(Boolean);
}
/** Respelling for pronunciation: syllables joined by hyphens, first syllable of each word stressed (upper case). */
export function respellOf(text) {
  return text.split(/\s+/).map(w => { const core = w.replace(/[^A-Za-z]/g, ''); if (!core) return ''; return syllabify(core).map((s, i) => (i === 0 ? s.toUpperCase() : s)).join('-'); }).filter(Boolean).join(' ');
}
