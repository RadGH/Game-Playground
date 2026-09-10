// Lingo — template + lexicon + personality text engine. No DOM; runs in browser and Node.
//
//   import { Lingo, Lexicon, Grammar, Speaker, parseTemplate } from './lingo.js';
//   const lingo = new Lingo({ lexicon, grammar, traits });          // data objects (see data/*.json)
//   const thalen = new Speaker({ id: 'thalen', name: 'Thalen', speech: { traits: ['pompous'], formality: 0.8 } });
//   const out = lingo.speak('greet', { speaker: thalen, listener: bran });
//   out.text  → "Well met, Bran. The roots remember you."
//
// Template syntax (see README for the full list):
//   {listener.name}  {item.pl}  {item.a}  {item.the.cap}  {speaker.they}  {speaker.verb(is)}  {foe.count}
//   {#symbol}  {#symbol.cap}                 expand a grammar symbol (tag-scored pick)
//   {$race}  {$race.pl}  {$item2.a}          random lexicon entry of a type, stable within one utterance
//   {~yes|no|maybe}                          inline random alternative
//   {n, plural, one{...} other{...}}         plural branch (n can be a count ref like foe.count)
//   {x, select, a{...} b{...} other{...}}    select branch on a value
//   {{ and }}                                literal braces
import * as M from './morph.js';
import { memoryBindings as memoryBindingsFor } from './memory.js';
import { scenePools as scenePoolsFor } from './context.js';

// ---------------------------------------------------------------- random
export function makeRng(seed) {
  let a = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const next = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  next.weighted = (items, weightOf) => { let total = 0; for (const it of items) total += weightOf(it); let r = next() * total; for (const it of items) { r -= weightOf(it); if (r <= 0) return it; } return items[items.length - 1]; };
  next.chance = p => next() < p;
  return next;
}

// ---------------------------------------------------------------- pronouns
export const PRONOUN_SETS = {
  he: { they: 'he', them: 'him', their: 'his', theirs: 'his', themself: 'himself', plural: false },
  she: { they: 'she', them: 'her', their: 'her', theirs: 'hers', themself: 'herself', plural: false },
  they: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themself', plural: true },
  it: { they: 'it', them: 'it', their: 'its', theirs: 'its', themself: 'itself', plural: false },
  we: { they: 'we', them: 'us', their: 'our', theirs: 'ours', themself: 'ourselves', plural: true },
  you: { they: 'you', them: 'you', their: 'your', theirs: 'yours', themself: 'yourself', plural: true },
  theyPl: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', themself: 'themselves', plural: true },
};

// ---------------------------------------------------------------- lexicon
/**
 * A lexicon entry: { id, type, forms: { sg, pl, adj, people, lang, ... }, proper, mass, pronouns, tags, pron: { respell, ipa, espeak }, ...refs }
 * Any other field whose value is another entry id becomes a navigable reference (e.g. person.race → race entry).
 */
export class Lexicon {
  constructor(data = {}) { this.types = { ...(data.types || {}) }; this.entries = new Map(); for (const e of data.entries || []) this.add(e); }
  add(entry) { if (!entry.id) throw new Error('lexicon entry needs an id'); const e = { forms: {}, tags: [], ...entry, forms: { ...(entry.forms || {}) } }; if (!e.forms.sg) e.forms.sg = e.name || e.id; this.entries.set(e.id, e); return e; }
  remove(id) { this.entries.delete(id); }
  get(id) { return this.entries.get(id); }
  has(id) { return this.entries.has(id); }
  all() { return [...this.entries.values()]; }
  byType(type, { tags = [], exclude = [] } = {}) { return this.all().filter(e => e.type === type && tags.every(t => e.tags.includes(t)) && !exclude.includes(e.id)); }
  random(type, rng, opts = {}) { const list = this.byType(type, opts); return list.length ? rng.pick(list) : null; }
  /** Words that have custom pronunciation, for the speech bridge. */
  pronunciations() { const out = {}; for (const e of this.all()) if (e.pron) for (const f of Object.values(e.forms)) out[f] = e.pron; return out; }
}

/** Wraps a lexicon entry (or an ad-hoc object) with a count and gives all the forms a template can ask for. */
export class Entity {
  constructor(entry, { count = 1, lexicon = null, overrides = {} } = {}) {
    this.entry = entry || { id: '?', type: 'thing', forms: { sg: '?' } }; this.count = count; this.lexicon = lexicon; this.overrides = overrides;
  }
  get id() { return this.entry.id; } get type() { return this.entry.type; } get tags() { return this.entry.tags || []; }
  get proper() { return !!this.entry.proper; } get mass() { return !!this.entry.mass; }
  get isPlural() { return this.count !== 1 && !this.proper; }
  form(name) { return this.overrides[name] ?? this.entry.forms?.[name]; }
  get sg() { return this.form('sg'); }
  get pl() { return this.form('pl') ?? (this.mass ? this.sg : M.plural(this.sg)); }
  get name() { return this.form('name') ?? this.form('short') ?? this.sg; }
  get adj() { return this.form('adj') ?? this.sg; }
  get people() { return this.form('people') ?? this.pl; }
  get lang() { return this.form('lang') ?? this.adj; }
  /** default text: singular, or plural when count != 1 */
  toString() { return this.isPlural ? this.pl : this.sg; }
  get pronounSet() { const p = this.entry.pronouns; if (p && typeof p === 'object') return p; return PRONOUN_SETS[p] || (this.isPlural ? PRONOUN_SETS.theyPl : this.entry.type === 'person' ? PRONOUN_SETS.they : PRONOUN_SETS.it); }
  /** navigate to a related entity: person.race, item.owner … */
  ref(field) { const v = this.entry[field]; if (v == null) return undefined; if (v instanceof Entity) return v; if (typeof v === 'object') return new Entity(v, { lexicon: this.lexicon }); if (this.lexicon?.has(v)) return new Entity(this.lexicon.get(v), { lexicon: this.lexicon }); return v; }
  get(prop) { if (prop in this.entry && !['forms', 'tags', 'pron'].includes(prop)) { const r = this.ref(prop); if (r !== undefined) return r; } return undefined; }
}

// ---------------------------------------------------------------- template parser
/** Parse a template string into an AST. Throws on unbalanced braces. */
export function parseTemplate(src) {
  let i = 0; const s = String(src);
  function parseSeq(stopAt) { // stopAt: set of chars that end the sequence at depth 0 (e.g. '}' or '|')
    const nodes = []; let text = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') { text += '{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}' && !stopAt.has('}')) { text += '}'; i += 2; continue; }
      if (stopAt.has(c)) break;
      if (c === '{') { if (text) { nodes.push({ type: 'text', text }); text = ''; } i++; nodes.push(parseBrace()); continue; }
      text += c; i++;
    }
    if (text) nodes.push({ type: 'text', text });
    return nodes;
  }
  function parseBrace() {
    const start = i;
    // inline alternatives {~a|b|c}
    if (s[i] === '~') { i++; const options = []; for (;;) { options.push(parseSeq(new Set(['|', '}']))); if (s[i] === '|') { i++; continue; } if (s[i] === '}') { i++; break; } throw new Error('unterminated {~…} at ' + start); } return { type: 'alt', options }; }
    // read the head up to ',' or '}' (no nesting in heads)
    let head = ''; while (i < s.length && s[i] !== '}' && s[i] !== ',') head += s[i++];
    head = head.trim();
    if (s[i] === ',') {
      i++; let kind = ''; while (i < s.length && s[i] !== ',') kind += s[i++]; kind = kind.trim(); if (s[i] !== ',') throw new Error(`expected ',' after ${kind} at ${start}`); i++;
      const cases = {};
      for (;;) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] === '}') { i++; break; }
        let key = ''; while (i < s.length && s[i] !== '{') key += s[i++]; key = key.trim(); if (s[i] !== '{') throw new Error('expected { after case key ' + key);
        i++; cases[key] = parseSeq(new Set(['}'])); if (s[i] !== '}') throw new Error('unterminated case ' + key); i++;
      }
      return { type: kind === 'plural' ? 'plural' : 'select', expr: parseRef(head), cases };
    }
    if (s[i] !== '}') throw new Error('unterminated { at ' + start); i++;
    if (head.startsWith('#')) { const [name, ...mods] = splitMods(head.slice(1)); return { type: 'sym', name, mods }; }
    if (head.startsWith('$')) { const [key, ...mods] = splitMods(head.slice(1)); return { type: 'rand', key, typeName: key.replace(/\d+$/, ''), mods }; }
    return { type: 'ref', ...parseRef(head) };
  }
  const out = parseSeq(new Set());
  if (i < s.length) throw new Error('unexpected } at ' + i);
  return out;
}
function splitMods(str) { // "listener.race.adj.cap" or "speaker.verb(is,are)" → segments (args kept with their segment)
  const segs = []; let cur = '', depth = 0;
  for (const c of str) { if (c === '(') depth++; if (c === ')') depth--; if (c === '.' && depth === 0) { segs.push(cur); cur = ''; } else cur += c; }
  segs.push(cur); return segs.map(x => x.trim()).filter(Boolean);
}
function parseRef(head) { const segs = splitMods(head); return { path: segs.map(seg => { const m = /^(\w+)\((.*)\)$/.exec(seg); return m ? { name: m[1], args: m[2].split(',').map(a => a.trim()) } : { name: seg, args: [] }; }) }; }

// ---------------------------------------------------------------- grammar
/** Grammar symbols: { name: [ entry | "template string" ] }, entry = { t, tags, w, cond, id } */
export class Grammar {
  constructor(data = {}) { this.symbols = {}; this.meta = data.meta || {}; for (const [name, list] of Object.entries(data.symbols || {})) this.set(name, list); }
  set(name, list) { this.symbols[name] = list.map((e, i) => typeof e === 'string' ? { id: `${name}#${i}`, t: e, tags: [], w: 1 } : { id: e.id || `${name}#${i}`, tags: [], w: 1, ...e }); }
  add(name, entry) { if (!this.symbols[name]) this.symbols[name] = []; this.symbols[name].push(typeof entry === 'string' ? { id: `${name}#${this.symbols[name].length}`, t: entry, tags: [], w: 1 } : { id: entry.id || `${name}#${this.symbols[name].length}`, tags: [], w: 1, ...entry }); }
  has(name) { return !!this.symbols[name]; }
  names() { return Object.keys(this.symbols); }
  /** Public intents = symbols flagged in meta.intents, else all symbols not starting with '_'. */
  intents() { return this.meta.intents || this.names().filter(n => !n.startsWith('_')); }
}

// ---------------------------------------------------------------- speaker / personality
export const SLIDERS = { formality: 0.5, verbosity: 0.5, cheer: 0.5, aggression: 0.3, confidence: 0.5 };
export const CUSTOM_SLOTS = ['greeting', 'farewell', 'catchphrase', 'prefix', 'suffix', 'happy', 'angry', 'sad', 'worried', 'yes', 'no', 'thanks', 'curse', 'oath'];
/**
 * A speaker = identity (name, pronouns, race…) + speech section:
 * speech: { traits: [], formality, verbosity, cheer, aggression, confidence, custom: {slot: text}, customRate: {slot: 0..1}, tics: [], mood: -1..1, tagWeights: {} }
 */
export class Speaker {
  constructor({ id, name, entry = null, speech = {}, lexicon = null } = {}) {
    this.id = id || entry?.id || name; this.name = name || entry?.forms?.sg || id;
    this.entry = entry || { id: this.id, type: 'person', proper: true, forms: { sg: this.name }, pronouns: speech.pronouns || 'they' };
    this.entity = new Entity(this.entry, { lexicon });
    this.speech = { traits: [], custom: {}, customRate: {}, tics: [], mood: 0, tagWeights: {}, ...SLIDERS, ...speech };
    this.recent = []; // recently used grammar entry ids (anti-repeat)
  }
  get traits() { return this.speech.traits; }
  get mood() { return this.speech.mood; }
  set mood(v) { this.speech.mood = Math.max(-1, Math.min(1, v)); }
  has(trait) { return this.speech.traits.includes(trait); }
  custom(slot) { return this.speech.custom?.[slot] || null; }
  rate(slot, fallback) { return this.speech.customRate?.[slot] ?? fallback; }
  toJSON() { return { id: this.id, name: this.name, speech: this.speech }; }
}

// ---------------------------------------------------------------- the engine
export class Lingo {
  /**
   * @param {object} o  { lexicon: Lexicon|data, grammar: Grammar|data, traits: { id: { tagWeights, tics, custom } }, rng, seed }
   */
  constructor({ lexicon, grammar, traits = {}, rng, seed } = {}) {
    this.lexicon = lexicon instanceof Lexicon ? lexicon : new Lexicon(lexicon);
    this.grammar = grammar instanceof Grammar ? grammar : new Grammar(grammar);
    this.traits = traits.traits ? Object.fromEntries(traits.traits.map(t => [t.id, t])) : traits;
    this.rng = rng || makeRng(seed);
    this.filters = { ...DEFAULT_FILTERS };
    this.plurals = typeof Intl !== 'undefined' && Intl.PluralRules ? new Intl.PluralRules('en') : { select: n => (n === 1 ? 'one' : 'other') };
    this.maxDepth = 24; this.recentSize = 6;
  }

  /** Tag weights for a speaker in a context: traits × sliders × mood × opinion. Weight 0 = never pick. */
  tagWeights(speaker, ctx = {}) {
    const w = {}; const mul = (tag, f) => { w[tag] = (w[tag] ?? 1) * f; };
    if (!speaker) return w;
    const s = speaker.speech;
    for (const id of s.traits) { const t = this.traits[id]; if (t?.tagWeights) for (const [tag, f] of Object.entries(t.tagWeights)) mul(tag, f); }
    const lin = (x, lo, hi) => lo + x * (hi - lo);
    mul('formal', lin(s.formality, 0.15, 2.2)); mul('casual', lin(1 - s.formality, 0.15, 2.2)); mul('crude', lin(1 - s.formality, 0.05, 1.5) * lin(s.aggression, 0.3, 2));
    mul('long', lin(s.verbosity, 0.1, 2.5)); mul('short', lin(1 - s.verbosity, 0.1, 2.5));
    mul('happy', lin(s.cheer, 0.2, 2) * lin((s.mood + 1) / 2, 0.2, 2)); mul('gloomy', lin(1 - s.cheer, 0.2, 2) * lin((1 - s.mood) / 2, 0.2, 2));
    mul('aggressive', lin(s.aggression, 0.1, 2.5) * (s.mood < 0 ? 1 - s.mood : 1)); mul('gentle', lin(1 - s.aggression, 0.1, 2.5));
    mul('confident', lin(s.confidence, 0.2, 2)); mul('timid', lin(1 - s.confidence, 0.2, 2));
    mul('angry', s.mood < -0.3 ? 1 + (-s.mood) * 2 : 0.3); mul('sad', s.mood < -0.3 ? 1 + (-s.mood) : 0.3); mul('joyful', s.mood > 0.3 ? 1 + s.mood * 2 : 0.3);
    if (ctx.opinion != null) { mul('friendly', lin((ctx.opinion + 1) / 2, 0.1, 2.5)); mul('hostile', lin((1 - ctx.opinion) / 2, 0.1, 2.5)); }
    for (const [tag, f] of Object.entries(s.tagWeights || {})) mul(tag, f);
    if (ctx.scene?.tagWeights) for (const [tag, f] of Object.entries(ctx.scene.tagWeights())) mul(tag, f);
    return w;
  }

  /** Evaluate an entry condition string against the context. Errors count as false. */
  cond(expr, ctx) {
    if (!expr) return true;
    try { const f = new Function('ctx', 'with (ctx) { return (' + expr + '); }'); return !!f(this.condScope(ctx)); } catch (e) { return false; }
  }
  condScope(ctx) {
    const s = ctx.speaker, l = ctx.listener;
    const sc = ctx.scene;
    return { ...ctx, has: t => !!s?.has(t), listenerHas: t => !!l?.has?.(t), mood: s?.mood ?? 0, opinion: ctx.opinion ?? 0, sceneHas: t => !!sc?.has?.(t), danger: sc?.danger ?? 0, comfort: sc?.comfort ?? 0.5, timeOfDay: sc?.timeOfDay ?? 'day', speakerType: s?.entity?.type, listenerType: l?.entity?.type ?? l?.type, sameRace: !!(s?.entity?.ref('race')?.id && s.entity.ref('race').id === (l?.entity?.ref?.('race')?.id ?? l?.ref?.('race')?.id)), chance: p => this.rng.chance(p) };
  }

  /** Pick one entry from a symbol using weights × tags × conditions, avoiding recent repeats. */
  pick(symbol, ctx, weights) {
    const list = this.grammar.symbols[symbol]; if (!list || !list.length) return null;
    const recent = ctx.speaker?.recent || [];
    const scored = [];
    for (const e of list) {
      let w = e.w ?? 1; let dead = false;
      for (const tag of e.tags || []) { const f = weights[tag]; if (f === 0) { dead = true; break; } if (f != null) w *= f; }
      if (dead || w <= 0) continue;
      if (e.cond && !this.cond(e.cond, ctx)) continue;
      const ri = recent.lastIndexOf(e.id); if (ri >= 0) w *= 0.08 + 0.8 * (1 - (ri + 1) / recent.length); // just-used ≈ 0.08, oldest ≈ 0.75
      scored.push({ e, w });
    }
    if (!scored.length) return null;
    const chosen = this.rng.weighted(scored, x => x.w).e;
    if (ctx.speaker) { ctx.speaker.recent.push(chosen.id); if (ctx.speaker.recent.length > this.recentSize) ctx.speaker.recent.shift(); }
    return chosen;
  }

  // ---- expansion
  /** Expand a template string in a context. Returns { text, used: [entry ids], tags: [] }. */
  expand(template, ctx = {}, state = null) {
    state = state || this.newState(ctx);
    const ast = typeof template === 'string' ? parseTemplate(template) : template;
    return { text: this.expandNodes(ast, ctx, state, 0), used: state.used, tags: [...state.tags], bindings: state.rand };
  }
  newState(ctx) { return { used: [], tags: new Set(), rand: {}, weights: this.tagWeights(ctx.speaker, ctx), depth: 0 }; }
  expandNodes(nodes, ctx, state, depth) { let out = ''; for (const n of nodes) out += this.expandNode(n, ctx, state, depth); return out; }
  expandNode(n, ctx, state, depth) {
    if (depth > this.maxDepth) return '…';
    switch (n.type) {
      case 'text': return n.text;
      case 'alt': return this.expandNodes(this.rng.pick(n.options), ctx, state, depth + 1);
      case 'sym': {
        // Tomodachi-style custom slots override matching symbols (greeting → greetword etc.)
        const custom = this.customFor(n.name, ctx);
        if (custom != null) return this.applyMods(this.expandNodes(parseTemplate(custom), ctx, state, depth + 1), n.mods, ctx, state);
        const e = this.pick(n.name, ctx, state.weights);
        if (!e) return `{#${n.name}?}`;
        state.used.push(e.id); for (const t of e.tags || []) state.tags.add(t);
        if (e.bind) this.bind(e.bind, ctx, state);
        return this.applyMods(this.expandNodes(parseTemplate(e.t), ctx, state, depth + 1), n.mods, ctx, state);
      }
      case 'rand': {
        if (!state.rand[n.key]) { const entry = this.lexicon.random(n.typeName, this.rng, { exclude: [...Object.values(state.rand).map(x => x.id), ctx.speaker?.id, ctx.listener?.id].filter(Boolean) }); state.rand[n.key] = entry ? new Entity(entry, { lexicon: this.lexicon }) : new Entity({ id: '?', type: n.typeName, forms: { sg: `<no ${n.typeName}>` } }); }
        return this.applyMods(state.rand[n.key], n.mods, ctx, state);
      }
      case 'ref': { const { value, mods } = this.resolve(n.path, ctx, state); return this.applyMods(value, mods, ctx, state); }
      case 'plural': { const { value } = this.resolve(n.expr.path, ctx, state); const num = Number(value instanceof Entity ? value.count : value); const cat = Number.isFinite(num) ? this.plurals.select(num) : 'other'; const c = n.cases['=' + num] ?? n.cases[cat] ?? n.cases.other ?? []; return this.expandNodes(c, ctx, state, depth + 1).replace(/#/g, String(num)); }
      case 'select': { const { value } = this.resolve(n.expr.path, ctx, state); const key = value instanceof Entity ? value.id : String(value); const c = n.cases[key] ?? n.cases.other ?? []; return this.expandNodes(c, ctx, state, depth + 1); }
      default: return '';
    }
  }
  /** Custom slot lookup for symbols named like a slot (e.g. symbol "greetword" ↔ custom.greeting). Uses customRate (default 0.85). */
  customFor(symbol, ctx) {
    const sp = ctx.speaker; if (!sp) return null;
    const slot = SYMBOL_TO_SLOT[symbol] || (CUSTOM_SLOTS.includes(symbol) ? symbol : null); if (!slot) return null;
    const text = sp.custom(slot); if (!text) return null;
    return this.rng.chance(sp.rate(slot, 0.85)) ? text : null;
  }
  bind(spec, ctx, state) { for (const [key, def] of Object.entries(spec)) { if (ctx[key] != null) continue; const entry = this.lexicon.random(def.type, this.rng, { tags: def.tags || [] }); if (entry) ctx[key] = new Entity(entry, { lexicon: this.lexicon, count: def.count ?? 1 }); } }

  /** Walk a path like [listener, race, adj, cap]: bindings/properties first, the rest are modifiers. */
  resolve(path, ctx, state) {
    let i = 0; let value;
    const first = path[0]?.name;
    if (first == null) return { value: '', mods: [] };
    if (first in ctx) value = ctx[first];
    else if (state.rand[first]) value = state.rand[first];
    else if (this.lexicon.has(first)) value = new Entity(this.lexicon.get(first), { lexicon: this.lexicon });
    else if (/^-?\d+(\.\d+)?$/.test(first)) value = Number(first);
    else return { value: `{${first}?}`, mods: [] };
    i = 1;
    if (value instanceof Speaker) value = value.entity;
    while (i < path.length) {
      const seg = path[i].name;
      if (value instanceof Entity) { const r = value.get(seg); if (r !== undefined) { value = r instanceof Speaker ? r.entity : r; i++; continue; } break; }
      if (value && typeof value === 'object' && !(value instanceof Entity) && seg in value && !MODS[seg]) { value = value[seg]; if (value instanceof Speaker) value = value.entity; i++; continue; }
      break;
    }
    return { value, mods: path.slice(i) };
  }
  applyMods(value, mods, ctx, state) {
    let cur = value; // Entity | string | number
    for (const m of mods) {
      const mod = typeof m === 'string' ? { name: m, args: [] } : m;
      const fn = MODS[mod.name];
      if (!fn) { cur = `${stringify(cur)}.${mod.name}?`; continue; }
      cur = fn(cur, mod.args, this, ctx, state);
    }
    return stringify(cur);
  }

  // ---- high level
  /**
   * Produce a full utterance for an intent (top-level grammar symbol).
   * ctx: { speaker: Speaker, listener: Speaker|Entity, opinion: -1..1, ...bindings }
   * Returns { text, speech, intent, entry, tags, used, bindings, parts }
   */
  speak(intent, ctx = {}, { wrap = true, tidy = true } = {}) {
    ctx = { ...ctx }; const sp = ctx.speaker;
    if (ctx.scene?.bindings) for (const [k, v] of Object.entries(ctx.scene.bindings())) if (ctx[k] === undefined) ctx[k] = v;
    if (ctx.listener instanceof Speaker) ctx.listenerSpeaker = ctx.listener; // keep the Speaker (traits) reachable for cond()
    const state = this.newState(ctx);
    const parts = { prefix: null, body: null, catchphrase: null, suffix: null };
    // mood slot lines: if the intent is a mood word and the speaker has a custom line for it, use it sometimes
    let body;
    if (sp && CUSTOM_SLOTS.includes(intent) && sp.custom(intent) && this.rng.chance(sp.rate(intent, 0.7))) { body = this.expand(sp.custom(intent), ctx, state).text; parts.customBody = true; }
    else { const e = this.pick(intent, ctx, state.weights); if (!e) return { text: '', intent, error: `no phrase for intent "${intent}"`, tags: [], used: [], parts }; state.used.push(e.id); for (const t of e.tags || []) state.tags.add(t); if (e.bind) this.bind(e.bind, ctx, state); body = this.expandNodes(parseTemplate(e.t), ctx, state, 0); parts.entry = e; }
    parts.body = body;
    let text = body;
    if (wrap && sp) {
      const verb = sp.speech.verbosity;
      if (sp.custom('prefix') && this.rng.chance(sp.rate('prefix', 0.25 + verb * 0.3))) { parts.prefix = this.expand(sp.custom('prefix'), ctx, state).text; text = joinSentences(parts.prefix, text); }
      if (sp.custom('catchphrase') && this.rng.chance(sp.rate('catchphrase', 0.1 + verb * 0.25))) { parts.catchphrase = this.expand(sp.custom('catchphrase'), ctx, state).text; text = joinSentences(text, parts.catchphrase); }
      if (sp.custom('suffix') && this.rng.chance(sp.rate('suffix', 0.2 + verb * 0.3))) { parts.suffix = this.expand(sp.custom('suffix'), ctx, state).text; text = joinSentences(text, parts.suffix); }
    }
    if (sp) text = this.applyFilters(text, sp, ctx);
    if (tidy) text = M.tidy(text);
    return { text, speech: this.toSpeech(text), intent, entry: parts.entry, tags: [...state.tags], used: state.used, bindings: { ...state.rand, ...pickEntities(ctx) }, parts };
  }

  /** Apply the speaker's verbal tics (from traits + speech.tics) and formality contraction rules. */
  applyFilters(text, sp, ctx) {
    const tics = new Set(sp.speech.tics || []);
    for (const id of sp.traits) for (const t of this.traits[id]?.tics || []) tics.add(t);
    let t = text;
    if (sp.speech.formality >= 0.75 && !tics.has('contractions')) t = M.expandContractions(t); else if (sp.speech.formality <= 0.3) t = M.contract(t);
    for (const tic of tics) { const f = this.filters[tic]; if (f) t = f(t, this.rng, sp, ctx); }
    return t;
  }

  /** Text for a TTS engine: words with custom pronunciations get inline [[espeak phonemes]]. */
  toSpeech(text) {
    const prons = this._pron || (this._pron = this.lexicon.pronunciations());
    if (!Object.keys(prons).length) return text;
    return text.replace(/[A-Za-z][A-Za-z'-]*/g, w => { const p = prons[w] || prons[w.toLowerCase()] || prons[M.capitalize(w)]; if (!p) return w; const ph = p.espeak || (p.respell ? respellToEspeak(p.respell) : null); return ph ? `[[${ph}]]` : w; });
  }
  invalidatePronunciations() { this._pron = null; }

  /**
   * Talk about a memory. bank: MemoryBank of the speaker; now: game hours. Picks a memory (weighted by salience ×
   * relevance to scene/listener) and speaks its type's recall intent with memory bindings. Returns null if nothing to say.
   */
  speakMemory(bank, now, ctx = {}, opts = {}) {
    const m = bank.recall(now, { rng: this.rng, listenerId: ctx.listener?.id, scene: ctx.scene, ...opts }); if (!m) return null;
    const out = this.speakAbout(m, bank, now, ctx); return out;
  }
  /** Speak about a specific memory (already chosen). */
  speakAbout(m, bank, now, ctx = {}) {
    const intent = bank.def(m.type).intent || 'recall_generic';
    const b = memoryBindingsFor(m, this.lexicon, now, { speakerId: ctx.listener?.id, recalledBefore: m.recalled > 1 });
    const out = this.speak(intent, { ...ctx, ...b });
    out.memory = m; return out;
  }
  /** Listener's reply to a memory line. */
  replyToMemory(m, now, ctx = {}) {
    const b = memoryBindingsFor(m, this.lexicon, now, { speakerId: ctx.speaker?.id, recalledBefore: m.recalled > 1 });
    return this.speak('recall_reply', { ...ctx, ...b });
  }

  /** Two speakers take turns. Returns an array of { speaker, listener, intent, text, speech }. */
  converse(a, b, { turns = 6, opinionAB = 0, opinionBA = 0, topics = null, banks = null, now = 0, scene = null, ...extra } = {}) {
    const lines = []; let cur = a, other = b, opinion = opinionAB, opinionOther = opinionBA; let lastMemory = null;
    const plan = topics || this.planConversation(a, b, opinionAB, opinionBA, turns, { banks, now, scene });
    for (let i = 0; i < plan.length; i++) {
      const intent = plan[i]; const ctx = { speaker: cur, listener: other, opinion, scene, ...extra }; let out;
      if (intent === 'recall') { const bank = banks?.[cur.id]; out = bank ? this.speakMemory(bank, now, ctx) : null; if (!out) out = this.speak('smalltalk', ctx); else lastMemory = out.memory; }
      else if (intent === 'recall_reply' && lastMemory) { out = this.replyToMemory(lastMemory, now, ctx); lastMemory = null; }
      else out = this.speak(intent, ctx);
      lines.push({ speaker: cur, listener: other, intent: out.intent || intent, text: out.text, speech: out.speech, tags: out.tags, memory: out.memory || null });
      [cur, other] = [other, cur]; [opinion, opinionOther] = [opinionOther, opinion];
    }
    return lines;
  }
  /** Simple topic planner: greet → middle beats chosen by opinion/traits → farewell. */
  planConversation(a, b, opAB, opBA, turns, { banks = null, now = 0, scene = null } = {}) {
    const plan = ['greet', 'greet_reply'];
    const beats = [];
    const hostile = (op, sp) => op < -0.3 || (sp.speech.aggression > 0.7 && op < 0.2);
    const friendly = (op) => op > 0.3;
    const sceneMix = scenePoolsFor(scene);
    let sp = a, op = opAB, opO = opBA;
    for (let i = 2; i < turns - 1; i++) {
      let pool = hostile(op, sp) ? ['insult', 'threat', 'complain', 'gossip', 'disagree'] : friendly(op) ? ['compliment', 'smalltalk', 'gossip', 'lore', 'brag', 'agree', 'thanks', 'flirt'] : ['smalltalk', 'gossip', 'complain', 'lore', 'question', 'brag', 'work'];
      // scene awareness: in danger or comfort, most beats are about the surroundings
      if (sceneMix && this.rng.chance(sceneMix.weight)) pool = sceneMix.pool;
      let intent = this.rng.pick(pool.filter(p => this.grammar.has(p)));
      // memories: the stronger the speaker's strongest memory, the likelier they bring it up
      const bank = banks?.[sp.id]; const top = bank?.strongest(now);
      if (top && this.rng.chance(Math.min(0.6, top.salience * 0.9)) && !beats.includes('recall')) intent = 'recall';
      // reactive beats: an insult/threat is answered with a retort; a compliment/flirt with thanks or a rejection
      const prev = beats[beats.length - 1];
      if (prev === 'recall') intent = 'recall_reply';
      if (prev === 'insult' || prev === 'threat') intent = this.rng.pick(['retort', 'insult', 'apology', 'threat'].filter(p => this.grammar.has(p)));
      if (prev === 'compliment') intent = this.rng.pick(['thanks', 'compliment', 'disagree'].filter(p => this.grammar.has(p)));
      if (prev === 'flirt') intent = this.rng.pick(['flirt_reply', 'reject', 'thanks'].filter(p => this.grammar.has(p)));
      if (prev === 'question') intent = this.rng.pick(['answer', 'lore', 'disagree'].filter(p => this.grammar.has(p)));
      beats.push(intent); [sp] = [sp === a ? b : a]; [op, opO] = [opO, op];
    }
    return [...plan, ...beats, 'farewell'];
  }
}

// ---------------------------------------------------------------- modifiers
const SYMBOL_TO_SLOT = { greetword: 'greeting', farewellword: 'farewell', yesword: 'yes', noword: 'no', thanksword: 'thanks', curse: 'curse', oath: 'oath' };
function stringify(v) { if (v == null) return ''; if (v instanceof Entity) return v.toString(); return String(v); }
function ent(v) { return v instanceof Entity ? v : null; }
export const MODS = {
  // forms (Entity → string; strings pass through)
  sg: v => ent(v) ? v.sg : v, pl: v => ent(v) ? v.pl : M.plural(stringify(v)), name: v => ent(v) ? v.name : v, adj: v => ent(v) ? v.adj : v, people: v => ent(v) ? v.people : v, lang: v => ent(v) ? v.lang : v,
  count: v => ent(v) ? v.count : v, num: v => M.numberWords(ent(v) ? v.count : v), ordinal: v => M.ordinal(ent(v) ? v.count : v),
  // articles
  a: v => { const e = ent(v); if (e) { if (e.proper) return e.toString(); if (e.mass) return 'some ' + e.sg; if (e.isPlural) return `${e.count === 0 ? 'no' : M.numberWords(e.count)} ${e.pl}`; return M.withArticle(e.sg); } return M.withArticle(stringify(v)); },
  the: v => { const e = ent(v); if (e && e.proper) return e.toString(); return 'the ' + stringify(v); },
  some: v => 'some ' + (ent(v) ? v.pl : stringify(v)),
  poss: v => M.possessive(stringify(v)), of: v => 'of ' + stringify(v),
  // pronouns
  they: v => ent(v) ? v.pronounSet.they : v, them: v => ent(v) ? v.pronounSet.them : v, their: v => ent(v) ? v.pronounSet.their : v, theirs: v => ent(v) ? v.pronounSet.theirs : v, themself: v => ent(v) ? v.pronounSet.themself : v,
  /** verb(is) or verb(is,are): agree with the entity's number */
  verb: (v, args) => { const e = ent(v); const pluralSubject = e ? (e.pronounSet.plural || e.isPlural) : false; const [sg3, plForm] = args; return pluralSubject ? (plForm ?? M.verbPlural(sg3)) : sg3; },
  // string ops
  cap: v => M.capitalize(stringify(v)), upper: v => M.upper(stringify(v)), lower: v => M.lower(stringify(v)), title: v => M.titleCase(stringify(v)),
  quote: v => `"${stringify(v)}"`, ellipsis: v => stringify(v) + '…', bang: v => stringify(v) + '!',
  // misc: {x.or(fallback)} when x is missing
  or: (v, args) => (v == null || v === '' ? args.join(',') : v),
  type: v => ent(v) ? v.type : '', id: v => ent(v) ? v.id : stringify(v),
  race: v => { const e = ent(v); const r = e?.ref('race'); return r ?? ''; },
};

function joinSentences(a, b) { a = String(a).trim(); b = String(b).trim(); if (!a) return b; if (!b) return a; return (/[.!?…"]$/.test(a) ? a : a + '.') + ' ' + b; }
function pickEntities(ctx) { const o = {}; for (const [k, v] of Object.entries(ctx)) if (v instanceof Entity) o[k] = v; else if (v instanceof Speaker) o[k] = v.entity; return o; }

// ---------------------------------------------------------------- post filters (verbal tics)
export const DEFAULT_FILTERS = {
  um: (t, rng) => t.replace(/(^|[.!?,]\s+)(\w)/g, (m, pre, c) => rng.chance(0.3) ? `${pre}${rng.pick(['um, ', 'uh, ', 'er, '])}${c}` : m),
  drawl: (t, rng) => t.replace(/\b(\w*?)([aeiou])(\w{0,2})\b/gi, (m, a, v, b) => (m.length > 3 && rng.chance(0.2)) ? `${a}${v}${v}${v}${b}` : m),
  shout: t => t.toUpperCase().replace(/\.(\s|$)/g, '!$1'),
  whisper: t => t.toLowerCase().replace(/[!]/g, '...'),
  hesitant: (t, rng) => t.replace(/,\s/g, m => rng.chance(0.5) ? '... ' : m).replace(/\.\s/g, m => rng.chance(0.3) ? '... ' : m),
  archaic: t => t.replace(/\byou are\b/gi, 'thou art').replace(/\byou're\b/gi, 'thou art').replace(/\byour\b/g, 'thy').replace(/\bYour\b/g, 'Thy').replace(/\byours\b/g, 'thine').replace(/\byou\b/g, 'thee').replace(/\bYou\b/g, 'Thou').replace(/\bdo not\b/g, 'do not').replace(/\bhas\b/g, 'hath').replace(/\bdoes\b/g, 'doth'),
  lisp: t => t.replace(/s/g, 'th').replace(/S/g, 'Th'),
  growl: (t, rng) => t.replace(/\b(r\w+)/gi, (m) => rng.chance(0.4) ? m.replace(/^r/i, c => c + c.toLowerCase() + c.toLowerCase()) : m),
  clipped: t => t.replace(/\b(I think|I suppose|perhaps|really|quite|rather|very)\s/gi, ''),
  flowery: (t, rng) => t.replace(/\b(good|bad|big|small|old|dark)\b/gi, m => rng.chance(0.6) ? ({ good: 'splendid', bad: 'wretched', big: 'colossal', small: 'diminutive', old: 'ancient', dark: 'stygian' })[m.toLowerCase()] || m : m),
  contractions: t => t, // marker: keep contractions even when formal
  curses: (t, rng) => t.replace(/([.!?])(\s|$)/, (m, p, s) => rng.chance(0.35) ? `${p} ${rng.pick(['Damn it all.', 'Blast.', 'Rot and ruin.', "Gods' teeth."])}${s}` : m),
  thirdperson: (t, rng, sp) => t.replace(/\bI am\b/g, `${sp.name} is`).replace(/\bI'm\b/g, `${sp.name} is`).replace(/\bI\b/g, sp.name).replace(/\bmy\b/g, `${sp.name}'s`).replace(/\bMy\b/g, `${sp.name}'s`).replace(/\bme\b/g, sp.name),
  pirate: t => t.replace(/\bmy\b/g, 'me').replace(/\byou\b/g, 'ye').replace(/\byes\b/gi, 'aye').replace(/\bing\b/g, "in'").replace(/ing\b/g, "in'"),
  posh: t => t.replace(/\bvery\b/g, 'terribly').replace(/\bgood\b/g, 'marvellous').replace(/\bbad\b/g, 'frightful').replace(/\byes\b/gi, 'quite'),
};

// ---------------------------------------------------------------- respelling → espeak phonemes
// Author-friendly pronunciation like "THAY-len" or "kay-LITH". Uppercase syllable = stressed. Hyphens split syllables.
const RESPELL = [['tch', 'tS'], ['ch', 'tS'], ['sh', 'S'], ['zh', 'Z'], ['th', 'T'], ['dh', 'D'], ['ng', 'N'], ['kh', 'x'], ['gh', 'g'], ['ph', 'f'], ['wh', 'w'],
  ['eye', 'aI'], ['igh', 'aI'], ['ay', 'eI'], ['ai', 'eI'], ['ey', 'eI'], ['ee', 'i:'], ['ea', 'i:'], ['oo', 'u:'], ['uu', 'U'], ['oh', 'oU'], ['oa', 'oU'], ['ow', 'aU'], ['ou', 'aU'], ['aw', 'O:'], ['au', 'O:'], ['oy', 'OI'], ['oi', 'OI'], ['ah', 'A:'], ['ar', 'A:r'], ['ur', '3:'], ['er', '3:'], ['ir', '3:'], ['or', 'O:r'], ['air', 'e@'], ['eer', 'i@'], ['uh', 'V'],
  ['a', 'a'], ['e', 'e'], ['i', 'I'], ['o', 'O'], ['u', 'V'], ['y', 'j'], ['c', 'k'], ['q', 'k'], ['x', 'ks'], ['j', 'dZ']];
export function respellToEspeak(respell) {
  return String(respell).split(/[-\s]+/).filter(Boolean).map(syl => {
    const stressed = syl === syl.toUpperCase() && /[A-Z]/.test(syl);
    let s = syl.toLowerCase(), out = '';
    while (s.length) { let hit = false; for (const [k, v] of RESPELL) { if (s.startsWith(k)) { out += v; s = s.slice(k.length); hit = true; break; } } if (!hit) { out += s[0]; s = s.slice(1); } }
    return (stressed ? "'" : '') + out;
  }).join('');
}
