// Words (PLAN §2 "Words"): one Lingo with Oddhaven's pack merged in. Built on Lanternfall's bridge: game code asks for a line and gets { text, speech } or null, and if Lingo cannot load
// the game carries on in silence. Only conversations somebody can see produce words; people in the background swap small numbers in the sim.
//
//   const talk = await createTalk({ seed, day });          day() = the game day, with its fraction
//   talk.say(person, 'od_greet', { listener, fact });      one line
//   talk.beat(a, b, i, like, ctx)                          the i-th line of a conversation; ctx = { facts, place, minute, mood, needs, words }
//   talk.bark(person, 'od_ack')                            a short reaction
//   talk.dump() / talk.load(rows)                          the lines used lately, kept with the save
//
// PLAN M6: no line repeats inside five game days, for one speaker or anywhere in town. `used` is that memory: a line said by anyone is out for all of them for WINDOW days. A pool that has
// run dry is not refilled early: the conversation moves to another pool, and with nothing left it says nothing (a person goes quiet; they never repeat themselves).
const LINGO = new URL('../../../../lingo/', import.meta.url);
export const WINDOW = 5;
/**
 * The pack is about a thousand lines, but a given chat can only reach about 500 of them, so a town can say about 100 a day and never repeat. The screen could ask for three times that if you sit watching a busy street, so a conversation
 * spends from an allowance: words while there is some, otherwise they chat on with no bubble, as people across a street do. Scenes and spells do not spend it.
 */
export const PER_DAY = 100, BURST = 16;
export function createAllowance(day) { let have = BURST, was = null; return { take() { const d = day(); have = Math.min(BURST, have + (was === null ? 0 : d - was) * PER_DAY); was = d; if (have < 1) return false; have -= 1; return true; } }; }

export async function getJSON(url) {
  if (typeof window === 'undefined' && String(url).startsWith('file:')) {
    const { readFile } = await import('node:fs/promises'); const { fileURLToPath } = await import('node:url');
    return JSON.parse(await readFile(fileURLToPath(url), 'utf8'));
  }
  const r = await fetch(url); if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json();
}

function seeded(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const first = name => String(name).split(' ')[0];

export const stubTalk = reason => ({ ready: false, reason, say: () => null, beat: () => null, bark: () => null, flavour: () => [], stats: { said: 0, dry: 0 }, dump: () => [], load: () => {} });

export async function createTalk(opts = {}) {
  try { return await build(opts); } catch (e) { console.warn('[oddhaven] words not available:', e?.message || e); return stubTalk(String(e?.message || e)); }
}

/** What a sim topic says, as words a line can use. words = { name(id), place(id), job(id), cause(id), prank(id), ago(days), plural } from the page. */
function factWords(t, w) {
  const blank = { place: 'the place', who: 'someone', with: 'someone', person: 'someone', a: 'someone', b: 'someone', by: 'someone', job: 'a person with a job', cause: 'all that', rooms: 'a room', ago: 'the other day', prank: 'did something unspeakable' };
  if (!t || !w) return blank;
  const ago = t.ago === undefined ? blank.ago : w.ago(t.ago), rooms = t.rooms === undefined ? blank.rooms : `${t.rooms} room${t.rooms === 1 ? '' : 's'}`;
  const n = id => (id === undefined ? 'someone' : w.name(id));
  return { place: t.place === undefined ? blank.place : w.place(t.place), who: n(t.who), with: n(t.with), person: n(t.person), a: n(t.a), b: n(t.b), by: n(t.by), job: t.job ? w.job(t.job) : blank.job, cause: t.cause ? w.cause(t.cause) : blank.cause, rooms, ago, prank: t.prank ? w.prank(t.prank) : blank.prank };
}

const NEED_POOL = [['sleep', 'od_need_tired'], ['food', 'od_need_hungry'], ['company', 'od_need_lonely'], ['clean', 'od_need_grubby'], ['fun', 'od_need_bored'], ['comfort', 'od_need_stiff']];
const SITS = [['cafe', 'od_sit_cafe'], ['bar', 'od_sit_pub'], ['gym', 'od_sit_gym'], ['park', 'od_sit_park'], ['shop', 'od_sit_shop'], ['food', 'od_sit_diner'], ['clinic', 'od_sit_clinic']];

async function build({ seed = 1, day = () => 0 }) {
  const L = await import(new URL('js/lingo.js', LINGO).href), R = await import(new URL('js/relations.js', LINGO).href);
  const [lexicon, grammar, traits, pack, relations] = await Promise.all(['data/lexicon.json', 'data/grammar.json', 'data/traits.json', 'data/packs/oddhaven.json', 'data/relations.json'].map(f => getJSON(new URL(f, LINGO))));
  const lingo = new L.Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  for (const [name, list] of Object.entries(pack.symbols)) for (const entry of list) lingo.grammar.add(name, { ...entry, id: `${name}#${lingo.grammar.symbols[name]?.length ?? 0}` });
  const rng = seeded(seed ^ 0x0dd);
  const graph = new R.RelationGraph(relations);
  const speakers = new Map(), used = new Map(), stats = { said: 0, dry: 0 };
  const placeIds = pack.entries.filter(e => e.tags.includes('place')).map(e => e.id), townIds = pack.entries.filter(e => e.tags.includes('town')).map(e => e.id);
  const entity = id => new L.Entity(lingo.lexicon.get(id), { lexicon: lingo.lexicon });
  const pick = l => l[Math.floor(rng() * l.length)];
  const blankFact = factWords(null);

  function speaker(p) {
    let s = speakers.get(p.id ?? p.name);
    if (!s) { s = new L.Speaker({ id: String(p.id ?? p.name), name: first(p.name), lexicon: lingo.lexicon, speech: { traits: (p.traits || []).filter(t => traits[t]), pronouns: p.gender === 'f' ? 'she' : 'he' } }); speakers.set(p.id ?? p.name, s); }
    return s;
  }
  const fresh = id => { const d = used.get(id); return d === undefined || day() - d >= WINDOW; };
  const left = intent => (lingo.grammar.symbols[intent] ?? []).filter(e => fresh(e.id));
  /** One line from a pool nobody has heard from lately, or null. */
  function say(p, intent, { listener = null, fact = null, words = null } = {}) {
    const pool = lingo.grammar.symbols[intent];
    if (!pool?.length) return null;
    const open = left(intent);
    if (!open.length) { stats.dry++; return null; }
    const shut = new Set(pool.filter(e => !fresh(e.id)).map(e => e.id));
    const sp = speaker(p), who = listener ? speaker(listener) : sp, f = fact && words ? factWords(fact, words) : blankFact;
    const out = lingo.speak(intent, { speaker: sp, listener: who, place: entity(pick(placeIds)), town: entity(pick(townIds)), fact: f, exclude: shut });
    if (!out?.text || out.error || !out.entry?.id || shut.has(out.entry.id)) { stats.dry++; return null; }       // a personality can rule out everything still fresh: silence, never a repeat
    used.set(out.entry.id, day()); stats.said++;
    return { text: out.text, speech: out.speech, id: out.entry.id };
  }
  /** Which pools this person can talk from. */
  const flavour = p => [`od_race_${p.race}`, ...(p.quirks || []).map(q => `od_quirk_${q}`), ...(p.job ? ['od_work'] : [])].filter(s => lingo.grammar.symbols[s]);
  /** How they feel right now: the sim's "like" number, moved by what is being said (seeded, so nothing differs by device). */
  function feeling(a, b, like) {
    const rel = graph.get(a.id, b.id);
    rel.set('warmth', Math.max(-1, Math.min(1, like / 100)));
    graph.apply(a.id, b.id, like < -5 ? 'argument' : 'compliment', { traits: (a.traits || []), targetTraits: b.traits || [], now: 0, strength: 0.2, rng });
    return rel.opinion();
  }
  const shuffled = list => { const o = [...list]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  /** What this person has on their mind, as pools, likeliest first. */
  function mindOf(a, ctx) {
    const out = [], n = ctx.needs;
    if (n) for (const [need, pool] of NEED_POOL) if (n[need] < 0.3) out.push(pool);
    if (ctx.mood !== undefined) { if (ctx.mood > 0.74) out.push('od_mood_up'); else if (ctx.mood < 0.38) out.push('od_mood_down'); }
    for (const [tag, pool] of SITS) if (ctx.place?.tags?.includes(tag)) out.push(pool);
    if (ctx.working) out.push('od_sit_work');
    if (ctx.minute !== undefined) { if (ctx.minute > 300 && ctx.minute < 570) out.push('od_sit_morning'); else if (ctx.minute >= 1320 || ctx.minute < 240) out.push('od_sit_night'); }
    if (ctx.home) out.push('od_sit_home');
    return out;
  }
  const o0 = like => (like > 8 ? 'od_warm' : like < -5 ? 'od_tense' : 'od_part');
  function beat(a, b, i, like = 0, ctx = {}) {
    const rel = ctx.facts?.rel, topics = ctx.facts?.topics ?? [], heard = (ctx.heard ??= new Set());
    const tail = [...flavour(a), ...mindOf(a, ctx), 'od_small', o0(like)];
    const tryPools = list => { for (const name of [...list, ...shuffled(tail)]) { const out = say(a, name, { listener: b }); if (out) return out; } return null; };
    if (i === 0) return tryPools([...(rel ? [`od_rel_${rel}`] : []), 'od_greet']);
    if (i >= 5) return tryPools(['od_part', 'od_small']);
    // something that really happened comes first: a fire last week, a date, the feud
    for (const t of topics) { if (heard.has(t.k)) continue; heard.add(t.k); const out = say(a, `od_fact_${t.k}`, { listener: b, fact: t, words: ctx.words }); if (out) return out; }
    const o = feeling(a, b, like);
    if (o < -0.04 || rel === 'foe' || rel === 'sour') return tryPools([...(rel ? [`od_rel_${rel}`] : []), 'od_tense', 'od_small']);
    const mood = shuffled([...mindOf(a, ctx), ...flavour(a)]), warm = o > 0.12 ? ['od_warm'] : [];
    if (i % 2 === 1 && rng() < 0.6) return tryPools([...mood, ...warm, 'od_small']);
    return tryPools([...(rel ? [`od_rel_${rel}`] : []), ...warm, 'od_small', ...mood]);
  }
  return {
    ready: true, lingo, graph, say, beat, bark: (p, intent) => say(p, intent), flavour, pack, stats, used, left,
    /** The lines used in the last five days, for the save. */
    dump() { const now = day(), out = []; for (const [id, d] of used) if (now - d < WINDOW) out.push([id, +d.toFixed(2)]); return out; },
    load(rows) { used.clear(); for (const [id, d] of rows ?? []) used.set(id, d); },
  };
}
