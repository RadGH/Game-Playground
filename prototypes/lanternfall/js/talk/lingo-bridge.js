// The Lingo bridge (docs/10 §10.1, docs/01 §12): one Lingo instance with the Lanternfall pack and grammar
// extension merged in, one Speaker per NPC / boss / Hush / the Narrator (data/npcs.json), and per-spawn speakers
// for the talking enemy kinds. Game code never calls Lingo directly: it asks this module for a line and gets
// { text, speech, tags, ... } back, or null when there is nothing to say.
//
//   const talk = await createTalk({ data: game.data, seed: game.seed });
//   talk.say('npc_aldra', 'greet')                        → { text, speech, tags, speakerId, name, color, … } | null
//   talk.say('npc_hush', 'hush_chirr', { tag: 'wall' })   → a tag narrows the pool to that tag's lines
//   talk.line('bl_tallow_open')                           → a FIXED line by id (boss lines, Kindling hints…)
//   talk.bossLine('tallow', 'p2', { flags })              → fixed the first time, the boss's pool after that
//   talk.foe('gutter_rat', 3)                             → a Lingo Entity ("three gutter rats")
//   talk.speaker('npc_odile')                             → the Lingo Speaker
//
// Pure: runs in Node (tests) and the browser. If Lingo or its data fails to load, createTalk() resolves to a
// stub with the same API that says nothing, so the game still runs (docs/10 §10: everything optional).
// Rules that live here, not in Lingo:
// - a speaker turns on its own family tag (speech.family, e.g. `knell`, `tallow`) and zeroes every other family
//   tag (01 §12.4.11); when its own family has lines for an intent, it speaks ONLY those (a boss never borrows
//   a core line meant for somebody else). `ctx.tag` narrows further (a Hush trigger, a Kindling flag, a phase);
//   tags are dropped from the end until some line matches, so ['act3', 'lit'] falls back to 'act3'.
// - a per-room exclude set (01 §12.8 rule 2): no phrase repeats inside a room until its pool is used up.
// - world lines tagged `lanternfall` get weight 2 for every NPC.
// - multi-word respellings are split word by word, so the short name "Aldra" is not read as "Aldra Crake".

const LINGO = new URL('../../../../lingo/', import.meta.url);
const OWN = new URL('../../data/', import.meta.url);

/** Load a JSON file by URL in the browser (fetch) or Node (readFile). */
export async function getJSON(url) {
  if (typeof window === 'undefined' && String(url).startsWith('file:')) {
    const { readFile } = await import('node:fs/promises'); const { fileURLToPath } = await import('node:url');
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json();
}

// ---------------------------------------------------------------- the Narrator (copied from emberveil/js/talk.js)
export const NARRATOR_ID = 'narrator';
const QUOTED = /"[^"]*"|“[^”]*”|'(?:[^']{6,})'/g;
const FIRST_PERSON = /\b(i|i'm|i'll|i've|i'd|my|me|we|we're|we've|we'll|our|us|let's)\b/i;
/** Is this line the scene describing itself (third person, no "I"/"we" outside quotes), rather than a person speaking? */
export function isSceneText(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  if (/^["'“‘]/.test(t)) return false;
  return !FIRST_PERSON.test(t.replace(QUOTED, ' '));
}

/** Words never given a custom pronunciation even when a name's respelling covers them (plain English). */
const PLAIN = new Set(['the', 'of', 'a', 'an', '&', 'old', 'mother', 'brother', 'sister', 'deacon', 'saint', 'deep', 'springs', 'dry', 'rim', 'wax', 'stair', 'well', 'lane', 'hall', 'ward', 'face', 'rat', 'one', 'hollow', 'pale', 'eel', 'moth', 'bell', 'root', 'thing', 'bird', 'wax-thing']);
/**
 * Lingo keys a pronunciation by a whole form ("Aldra Crake") but replaces single words, so a multi-word
 * respelling would be read in full for the short name. Split it: the n-th word of the form gets the n-th
 * respelled word, when the counts agree. Plain English words keep the engine's own pronunciation.
 */
export function splitPronunciations(entries) {
  const out = {};
  for (const e of entries) {
    if (!e.pron) continue;
    if (!e.pron.respell) { for (const f of Object.values(e.forms || {})) if (typeof f === 'string') out[f] = e.pron; continue; }
    const parts = String(e.pron.respell).trim().split(/\s+/);
    for (const f of Object.values(e.forms || {})) {
      if (typeof f !== 'string') continue;
      const words = f.split(/\s+/);
      const keep = words.map((w, i) => [w, i]).filter(([w]) => !/^(the|of|a|an|&)$/i.test(w));
      if (keep.length !== parts.length) continue;
      keep.forEach(([w], k) => { if (!PLAIN.has(w.toLowerCase())) out[w] = { respell: parts[k] }; });
    }
  }
  return out;
}

/** Binding names that take a lexicon id and become a Lingo Entity (strings elsewhere stay strings, e.g. gate). */
const ENTITY_KEYS = new Set(['flame', 'shape', 'charm', 'item', 'dish', 'dish2', 'dish3', 'lamp', 'place', 'here', 'foe', 'third', 'fallen', 'god']);
const RESERVED = new Set(['tag', 'flags', 'exclude', 'listener', 'speaker', 'x', 'y']);

/**
 * Build the talk module. Never rejects: on any failure it returns a stub (ready: false, say() → null).
 * @param {object} o
 * @param {object} [o.data]    game.data; uses data.npcs if the manifest loaded it, else fetches data/npcs.json
 * @param {number} [o.seed]
 * @param {object} [o.files]   pre-loaded files for tests: { lexicon, grammar, traits, events, pack, extra, npcs, eventsExtra }
 * @param {object} [o.lingoModule]  the imported lingo.js module (tests pass it; the browser imports it)
 */
export async function createTalk(o = {}) {
  try { return await buildTalk(o); }
  catch (err) { console.warn('[talk] Lingo unavailable, running without speech:', err?.message || err); return stubTalk(String(err?.message || err)); }
}

async function buildTalk({ data = {}, seed = 1, files = null, lingoModule = null, playerName = 'Lamplighter', playerPronouns = 'they' } = {}) {
  const L = lingoModule || await import(new URL('js/lingo.js', LINGO).href);
  const M = await import(new URL('js/memory.js', LINGO).href).catch(() => null);
  const f = files || {};
  const [lexicon, grammar, traits, events, pack, extra, npcs, eventsExtra] = await Promise.all([
    f.lexicon || getJSON(new URL('data/lexicon.json', LINGO)), f.grammar || getJSON(new URL('data/grammar.json', LINGO)),
    f.traits || getJSON(new URL('data/traits.json', LINGO)), f.events || getJSON(new URL('data/events.json', LINGO)).catch(() => ({ types: {} })),
    f.pack || getJSON(new URL('data/packs/lanternfall.json', LINGO)), f.extra || getJSON(new URL('grammar-lanternfall.json', OWN)),
    f.npcs || data.npcs || getJSON(new URL('npcs.json', OWN)), f.eventsExtra || data.events_lanternfall || getJSON(new URL('events-lanternfall.json', OWN)).catch(() => ({ types: {} })),
  ]);
  const lingo = new L.Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.lexicon.pronunciations = () => splitPronunciations(lingo.lexicon.all());
  lingo.invalidatePronunciations();
  // the grammar extension: extra lines on core intents, 12 new intents, their docs and anti-repeat
  for (const [name, list] of Object.entries(extra.symbols || {})) for (const entry of list) lingo.grammar.add(name, entry);
  const meta = lingo.grammar.meta = { ...(lingo.grammar.meta || {}) };   // a copy: never touch the loaded core file
  meta.intents = [...new Set([...(meta.intents || []), ...(extra.meta?.intents || [])])];
  meta.intentDoc = { ...(meta.intentDoc || {}), ...(extra.meta?.intentDoc || {}) };
  for (const s of extra.meta?.noRepeat || []) lingo.noRepeat.add(s);
  const eventTypes = { ...(events.types || {}), ...(eventsExtra.types || {}) };
  const FAMILIES = new Set([...(npcs.familyTags || []), ...(extra.meta?.familyTags || [])]);
  const WORLD = extra.meta?.worldTag || 'lanternfall';
  const list = npcs.list || [];
  const byId = Object.fromEntries(list.map(n => [n.id, n]));

  /** A speaker's tag weights: its own family on, every other family off, this world's lines ×2. */
  function weightsFor(speech) {
    const w = {}; for (const t of FAMILIES) w[t] = 0;
    if (speech.family) w[speech.family] = 3;
    w[WORLD] = 2;
    return { ...w, ...(speech.tagWeights || {}) };
  }
  const makeSpeaker = (id, name, lexId, speech) => new L.Speaker({ id, name, entry: lingo.lexicon.get(lexId) || null, lexicon: lingo.lexicon,
    speech: { ...speech, tagWeights: weightsFor(speech) } });
  const speakers = new Map();
  for (const n of list) speakers.set(n.id, makeSpeaker(n.id, n.name, n.lexicon, n.speech || {}));
  const player = new L.Speaker({ id: 'player', name: playerName, lexicon: lingo.lexicon, speech: { pronouns: playerPronouns } });

  // enemy kinds: which pack creature family → which enemyVoices kind
  const kindByFamily = {};
  for (const [kind, v] of Object.entries(npcs.enemyVoices || {})) for (const fam of v.families || []) kindByFamily[fam] = kind;
  const kindOf = (enemyId) => { const e = lingo.lexicon.get(enemyId); const fam = e?.family || enemyId; return kindByFamily[fam] || null; };
  const enemySpeakers = new Map(); let spawnN = 0;
  /** A speaker for one spawned enemy (the Knell get a voice seed each). Returns { id, kind, talks, gloss } or null for a silent beast. */
  function enemySpeaker(entity) {
    const defId = entity?.def?.id || entity?.defId || entity?.id; const kind = kindOf(defId); if (!kind) return null;
    if (entity && typeof entity === 'object' && entity.talkId && enemySpeakers.has(entity.talkId)) return enemySpeakers.get(entity.talkId).info;
    const v = npcs.enemyVoices[kind]; const id = `${defId}#${entity?.uid ?? entity?.id ?? ++spawnN}`;
    const sp = makeSpeaker(id, lingo.lexicon.get(defId)?.forms?.name || entity?.name || defId, defId, v.speech || {});
    const info = { id, kind, defId, talks: !!v.talks, gloss: !!v.gloss, color: v.color, seed: (v.voice?.seed || 1) + (v.voice?.seedPerSpawn ? (++spawnN * 7) : 0) };
    enemySpeakers.set(id, { sp, info }); if (entity && typeof entity === 'object') entity.talkId = id;
    return info;
  }
  const findSpeaker = id => speakers.get(id) || enemySpeakers.get(id)?.sp || null;

  const state = { roomUsed: new Set(), last: new Map(), place: null, act: null, lit: false, flags: {}, heard: new Set() };
  // flame / shape / charm ids are the game's ('ember', 'bolt', 'split'); their pack entries are prefixed
  // (flame_ember…) so they never collide with a core word of the same name
  const PREFIX = { flame: 'flame_', shape: 'shape_', charm: 'charm_' };
  const entity = (v, key = null, count = 1) => {
    if (v == null || v instanceof L.Entity) return v;
    if (typeof v === 'object' && v.id) return entity(v.id, key, v.count ?? count);
    if (typeof v !== 'string') return v;
    const id = PREFIX[key] && lingo.lexicon.has(PREFIX[key] + v) ? PREFIX[key] + v : v;
    return lingo.lexicon.has(id) ? new L.Entity(lingo.lexicon.get(id), { lexicon: lingo.lexicon, count }) : v;
  };

  /** Which lines of `intent` this call may use: the speaker's family + ctx tags, dropping tags from the end. */
  function allowedFor(intent, family, ctxTags) {
    const all = lingo.grammar.symbols[intent] || [];
    const tries = [];
    const both = [family, ...ctxTags].filter(Boolean);
    for (let k = both.length; k > (family ? 1 : 0); k--) tries.push(both.slice(0, k));      // family + ctx tags
    for (let k = ctxTags.length; k > 0; k--) tries.push(ctxTags.slice(0, k));               // ctx tags alone (a Knell's orders)
    if (family) tries.push([family]);                                                         // the family's own pool
    for (const want of tries) { const hit = all.filter(e => want.every(t => (e.tags || []).includes(t))); if (hit.length) return { all, allowed: hit, want }; }
    return { all, allowed: null, want: [] };
  }

  function info(id) {
    const n = byId[id]; if (n) return { name: n.name, color: n.color || null, gloss: !!n.gloss, narration: !!n.narration, babble: n.voice?.engine === 'babble' };
    const en = enemySpeakers.get(id)?.info; if (en) return { name: findSpeaker(id)?.name, color: en.color, gloss: en.gloss, narration: false, babble: en.gloss, kind: en.kind, seed: en.seed, enemy: true };
    return { name: id, color: null, gloss: false, narration: false, babble: false };
  }

  /** Speak an intent. Returns null when the speaker or intent is unknown or no line fits. */
  function say(speakerId, intent, ctx = {}) {
    const sp = findSpeaker(speakerId); if (!sp || !lingo.grammar.has(intent)) return null;
    const c = { speaker: sp, listener: ctx.listener || player, flags: ctx.flags || state.flags, ...(extra.defaults?.[intent] || {}) };
    for (const [to, from] of Object.entries(extra.aliases?.[intent] || {})) if (ctx[from] != null && ctx[to] == null) c[to] = ctx[from];
    for (const [k, v] of Object.entries(ctx)) { if (RESERVED.has(k)) continue; c[k] = ENTITY_KEYS.has(k) ? entity(v, k) : v; }
    for (const k of Object.keys(c)) if (ENTITY_KEYS.has(k) && c[k] != null) c[k] = entity(c[k], k);
    if (c.here == null && state.place) c.here = entity(state.place);
    if (c.place == null && state.place && intent !== 'ledger_arrival') c.place = entity(state.place);
    const ctxTags = [].concat(ctx.tag || []).filter(Boolean);
    const { all, allowed } = allowedFor(intent, sp.speech.family, ctxTags);
    const exclude = new Set();
    if (allowed) {
      const ok = new Set(allowed.map(e => e.id)); for (const e of all) if (!ok.has(e.id)) exclude.add(e.id);
      if (allowed.every(e => state.roomUsed.has(e.id))) for (const e of allowed) state.roomUsed.delete(e.id);
    } else if (all.length && all.every(e => state.roomUsed.has(e.id))) for (const e of all) state.roomUsed.delete(e.id);
    for (const id of state.roomUsed) exclude.add(id);
    // never the same line twice in a row from one speaker, whatever the pool size
    const lastKey = `${speakerId}|${intent}`, prev = state.last.get(lastKey);
    if (prev && (allowed || all).filter(e => !exclude.has(e.id)).length > 1) exclude.add(prev);
    // a ctx tag is allowed to speak even when it is another family's (Knell orders, the Narrator's Sluicemaw lines)
    const saved = sp.speech.tagWeights; if (ctxTags.length) { sp.speech.tagWeights = { ...saved }; for (const t of ctxTags) sp.speech.tagWeights[t] = 3; }
    let out;
    try { out = lingo.speak(intent, { ...c, exclude }); } finally { sp.speech.tagWeights = saved; }
    if (!out || !out.text || out.error) return null;
    if (out.entry?.id) { state.roomUsed.add(out.entry.id); state.last.set(lastKey, out.entry.id); }
    return { speakerId, intent, text: out.text, speech: out.speech, tags: out.tags, entryId: out.entry?.id || null, ...info(speakerId) };
  }

  const lines = extra.lines || {};
  /** A fixed line by id, exactly as written (no personality filter). */
  function line(lineId) {
    const l = lines[lineId]; if (!l) return null;
    state.heard.add(lineId);
    return { lineId, speakerId: l.speaker, intent: null, text: l.text, speech: lingo.toSpeech(l.text), tags: [], ...info(l.speaker), ...(l.narration ? { narration: true } : {}), ...(l.gloss ? { gloss: true } : {}),
      voiceOf: l.voiceOf || null, fx: l.fx || null, phase: l.phase || null, boss: l.boss || null, slot: l.slot || null, flag: l.flag || null };
  }
  const BOSS_SPEAKER = { tallow: 'boss_tallow', gnaw: 'boss_gnaw', sluicemaw: 'narrator', widow: 'boss_widow', bellfather: 'boss_bellfather', ossery: 'boss_ossery' };
  const SLOT_INTENT = { open: 'boss_opener', low: 'boss_low', death: 'last_words', kill: 'combat_kill', freeze: 'boss_low', refuse: 'boss_low' };
  /**
   * A boss moment (01 §6.5): the fixed line the first time it is heard (or when `first` is set), the boss's
   * tagged pool on later tries. slot: open | p1..p4 | low | death | kill | freeze | refuse. Flag variants
   * (tallow_cooled, widow_mercy, corvin_freed) win when their flag is set.
   */
  function bossLine(boss, slot, { flags = state.flags, first = null } = {}) {
    const variant = Object.entries(lines).find(([, l]) => l.boss === boss && l.slot === slot && l.when && flags?.[l.when]);
    const fixedId = variant ? variant[0] : (lines[`bl_${boss}_${slot}`] ? `bl_${boss}_${slot}` : null);
    const isFirst = first ?? (fixedId && !state.heard.has(fixedId));
    if (fixedId && isFirst) return line(fixedId);
    const who = BOSS_SPEAKER[boss]; if (!who) return null;
    if (boss === 'sluicemaw') return say('narrator', 'named_beast', { tag: 'sluicemaw' });
    const phase = /^p\d$/.test(slot) ? slot : null;
    const out = say(who, phase ? 'boss_phase' : SLOT_INTENT[slot] || 'boss_phase', { tag: phase ? [phase] : [], flags });
    if (out && phase) out.phase = phase;
    return out || (fixedId ? line(fixedId) : null);
  }
  /** Narrator reading any text (scene text, plaques, title cards). */
  function narrate(text) { const t = String(text ?? '').trim(); if (!t) return null; return { speakerId: NARRATOR_ID, intent: null, text: t, speech: lingo.toSpeech(t), tags: [], ...info(NARRATOR_ID), narration: true }; }
  /** Talk about a memory from a Lingo MemoryBank (e.g. Hollis's sold_item → pawn_recall). */
  function recall(speakerId, bank, now, ctx = {}) {
    if (!M || !bank) return null; const m = bank.recall(now, { rng: lingo.rng, listenerId: 'player' }); if (!m) return null;
    const b = M.memoryBindings(m, lingo.lexicon, now, {}); const intent = bank.def(m.type).intent || 'recall_generic';
    return say(speakerId, intent, { ...ctx, ...b, price: m.details?.price ?? ctx.price, days: Math.max(1, Math.round((now - m.time) / 24)) });
  }
  /** A new MemoryBank for one NPC with Lanternfall's event types (cap 24 memories, 01 §12.5). */
  function memoryBank(speakerId) { if (!M) return null; const n = byId[speakerId]; return new M.MemoryBank({ ownerId: speakerId, traits: n?.speech?.traits || [], eventTypes, lexicon: lingo.lexicon, maxMemories: 24 }); }

  return {
    ready: true, lingo, npcs, player, eventTypes,
    say, line, bossLine, narrate, recall, memoryBank, enemySpeaker, kindOf,
    speaker: id => findSpeaker(id), npc: id => byId[id] || null, info,
    foe: (enemyId, count = 1) => new L.Entity(lingo.lexicon.get(enemyId) || { id: enemyId, type: 'creature', forms: { sg: String(enemyId).replace(/_/g, ' ') } }, { lexicon: lingo.lexicon, count }),
    lines: () => Object.keys(lines),
    /** Start a room: clear the per-room exclude set; remember where we are (for {here} / {place}). */
    newRoom({ place = null, act = null, lit = null } = {}) { state.roomUsed.clear(); if (place) state.place = place; if (act) state.act = act; if (lit != null) state.lit = lit; },
    setFlags(flags) { state.flags = flags || {}; },
    heard: () => [...state.heard], setHeard(ids) { state.heard = new Set(ids || []); },
    resetSession() { lingo.resetSession(); state.roomUsed.clear(); },
    state,
  };
}

/** Same API, says nothing. Used when Lingo or its data could not load. */
export function stubTalk(reason = 'not loaded') {
  const nil = () => null;
  return { ready: false, reason, lingo: null, npcs: { list: [], bark: {} }, player: null, eventTypes: {}, say: nil, line: nil, bossLine: nil, narrate: nil, recall: nil, memoryBank: nil,
    enemySpeaker: nil, kindOf: nil, speaker: nil, npc: nil, info: () => ({}), foe: nil, lines: () => [], newRoom() {}, setFlags() {}, heard: () => [], setHeard() {}, resetSession() {}, state: {} };
}
