// Memory system for lingo characters (inspired by Dwarf Fortress memories and RimWorld thoughts).
//
// A MemoryBank belongs to one character. Events (combat, a death, a level-up, a newcomer, loot, travel, a meal, an
// insult, world lore…) are remembered with a *personal* importance: the event type's base importance × the owner's
// trait multipliers. Salience fades with a per-type half-life and rises when a memory is recalled or repeated
// (similar events merge: "we fought orcs" ×3). Memories below a threshold are forgotten unless they are "core".
// recall() picks a memory weighted by salience × relevance to the current scene/listener, and memoryBindings()
// turns it into template bindings (foe, place, ally, weapon, when…) so grammar can say
// "Remember {memory.when}, at {place.the}? {foe.count} {foe.pl} and just my {weapon}."
//
// Time is game time in HOURS (a number the game advances). Nothing here uses the wall clock.
import { Entity } from './lingo.js';

export const HOUR = 1, DAY = 24, WEEK = 168, YEAR = 24 * 365;

/** Default event types. Games extend/override via new MemoryBank({ eventTypes }). See data/events.json for the full set. */
export const DEFAULT_EVENT_TYPES = {};

export class Memory {
  constructor(o) {
    this.id = o.id || Memory.nextId(); this.type = o.type; this.time = o.time ?? 0; this.firstTime = o.firstTime ?? this.time;
    this.importance = clamp(o.importance ?? 0.5, 0, 1); this.valence = clamp(o.valence ?? 0, -1, 1);
    this.bindings = { ...(o.bindings || {}) };      // { foe: { id, count }, place: id, ally: id, weapon: id, ... } (entity ids)
    this.details = { ...(o.details || {}) };        // free-form: outcome, level, skill, damage, ...
    this.participants = [...(o.participants || [])]; // character ids who were there (for shared memories)
    this.tags = [...(o.tags || [])]; this.count = o.count ?? 1; this.recalled = o.recalled ?? 0; this.lastRecalled = o.lastRecalled ?? null; this.core = !!o.core;
    this.halfLife = o.halfLife ?? DAY * 7;
  }
  static nextId() { return 'm' + (Memory._n = (Memory._n || 0) + 1) + '_' + Math.random().toString(36).slice(2, 6); }
  toJSON() { const { id, type, time, firstTime, importance, valence, bindings, details, participants, tags, count, recalled, lastRecalled, core, halfLife } = this; return { id, type, time, firstTime, importance, valence, bindings, details, participants, tags, count, recalled, lastRecalled, core, halfLife }; }
}

export class MemoryBank {
  /**
   * @param {object} o { ownerId, traits: [ids], eventTypes: { id: def }, lexicon, forgetBelow=0.04, maxMemories=300, mergeWindowHours=36 }
   * event def: { importance 0..1, halfLifeDays, valence -1..1, traitWeights: { traitId: mult }, tags: [], intent: 'recall_combat', mergeKeys: ['foe'] }
   */
  constructor(o = {}) {
    this.ownerId = o.ownerId || 'anon'; this.traits = o.traits || []; this.eventTypes = o.eventTypes || DEFAULT_EVENT_TYPES; this.lexicon = o.lexicon || null;
    this.forgetBelow = o.forgetBelow ?? 0.04; this.maxMemories = o.maxMemories ?? 300; this.mergeWindowHours = o.mergeWindowHours ?? 36;
    this.memories = []; this.log = [];
  }
  def(type) { return this.eventTypes[type] || { importance: 0.4, halfLifeDays: 7, valence: 0, traitWeights: {}, tags: [], intent: 'recall_generic', mergeKeys: [] }; }

  /** How much this owner cares about an event type: base importance × trait multipliers (capped). */
  personalImportance(type, override) {
    const d = this.def(type); let imp = override ?? d.importance;
    for (const t of this.traits) { const m = d.traitWeights?.[t]; if (m != null) imp *= m; }
    return clamp(imp, 0.02, 1);
  }

  /**
   * Store an event. event: { type, time, bindings, participants, details, importance?, valence?, tags?, core? }
   * Similar recent events (same type, same mergeKeys bindings, within mergeWindowHours) merge into one memory with count+1.
   */
  remember(event, now = event.time ?? 0) {
    const d = this.def(event.type); const time = event.time ?? now;
    const keys = d.mergeKeys || []; const sameKey = m => m.type === event.type && keys.every(k => JSON.stringify(m.bindings[k]?.id ?? m.bindings[k]) === JSON.stringify(event.bindings?.[k]?.id ?? event.bindings?.[k]));
    const existing = this.memories.find(m => sameKey(m) && Math.abs(time - m.time) <= this.mergeWindowHours);
    if (existing) {
      existing.count += 1; existing.time = Math.max(existing.time, time); existing.importance = clamp(existing.importance + 0.05, 0, 1);
      if (event.bindings?.foe?.count && existing.bindings.foe) existing.bindings.foe = { ...existing.bindings.foe, count: (existing.bindings.foe.count || 1) + (event.bindings.foe.count || 1) };
      this.log.push({ at: now, action: 'merged', id: existing.id }); return existing;
    }
    const m = new Memory({ type: event.type, time, importance: this.personalImportance(event.type, event.importance), valence: event.valence ?? d.valence ?? 0, bindings: event.bindings, details: event.details, participants: event.participants, tags: [...(d.tags || []), ...(event.tags || [])], core: event.core ?? (d.core || false), halfLife: (d.halfLifeDays ?? 7) * DAY });
    if (m.importance >= 0.9) m.core = true;
    this.memories.push(m); this.log.push({ at: now, action: 'remembered', id: m.id });
    if (this.memories.length > this.maxMemories) this.tick(now, true);
    return m;
  }

  /** Current strength of a memory (0..1-ish). Fades by half-life; recall and repetition strengthen; core memories keep a floor. */
  salience(m, now) {
    const age = Math.max(0, now - m.time);
    const decay = m.halfLife === Infinity || m.halfLife <= 0 ? 1 : Math.pow(0.5, age / m.halfLife);
    let s = m.importance * decay * (1 + 0.15 * Math.log1p(m.recalled)) * (1 + 0.25 * Math.log1p(m.count - 1));
    if (m.core) s = Math.max(s, 0.2);
    return clamp(s, 0, 1.5);
  }
  /** Forget faded memories. Returns the forgotten ones. */
  tick(now, force = false) {
    const gone = this.memories.filter(m => !m.core && this.salience(m, now) < this.forgetBelow);
    if (force && this.memories.length > this.maxMemories) { const sorted = [...this.memories].sort((a, b) => this.salience(a, now) - this.salience(b, now)); for (const m of sorted) { if (this.memories.length - gone.length <= this.maxMemories) break; if (!m.core && !gone.includes(m)) gone.push(m); } }
    this.memories = this.memories.filter(m => !gone.includes(m)); for (const m of gone) this.log.push({ at: now, action: 'forgot', id: m.id });
    return gone;
  }
  list(now) { return this.memories.map(m => ({ memory: m, salience: this.salience(m, now) })).sort((a, b) => b.salience - a.salience); }
  strongest(now) { return this.list(now)[0] || null; }

  /**
   * Relevance of a memory to the moment: shared with the listener, same place as the scene, same creature as a threat,
   * overlapping tags. Returns a multiplier ≥ 0.2.
   */
  relevance(m, { listenerId, scene, tags = [] } = {}) {
    let r = 1;
    if (listenerId && m.participants.includes(listenerId)) r *= 1.6;
    if (scene) { const placeId = scene.place?.id ?? scene.placeId; if (placeId && (m.bindings.place?.id ?? m.bindings.place) === placeId) r *= 1.6; for (const t of scene.threats || []) if ((m.bindings.foe?.id ?? m.bindings.foe) === (t.id ?? t)) r *= 1.8; for (const t of scene.tags || []) if (m.tags.includes(t)) r *= 1.2; }
    for (const t of tags) if (m.tags.includes(t)) r *= 1.3;
    if (m.lastRecalled != null) r *= 0.6; // said it already
    return Math.max(0.2, r);
  }
  /** Pick a memory to talk about (or null if nothing is salient enough). Marks it recalled. */
  recall(now, { rng = Math.random, minSalience = 0.08, listenerId, scene, tags, type } = {}) {
    const cands = this.memories.filter(m => (!type || m.type === type) && this.salience(m, now) >= minSalience).map(m => ({ m, w: this.salience(m, now) * this.relevance(m, { listenerId, scene, tags }) }));
    if (!cands.length) return null;
    const total = cands.reduce((a, c) => a + c.w, 0); let r = (typeof rng === 'function' ? rng() : Math.random()) * total;
    let pick = cands[cands.length - 1].m; for (const c of cands) { r -= c.w; if (r <= 0) { pick = c.m; break; } }
    pick.recalled += 1; pick.lastRecalled = now; this.log.push({ at: now, action: 'recalled', id: pick.id }); return pick;
  }
  /** Was the owner there? */
  shared(m, otherId) { return m.participants.includes(otherId); }
  toJSON() { return { ownerId: this.ownerId, traits: this.traits, memories: this.memories.map(m => m.toJSON()) }; }
  static fromJSON(json, o = {}) { const b = new MemoryBank({ ...o, ownerId: json.ownerId, traits: json.traits }); b.memories = (json.memories || []).map(m => new Memory(m)); return b; }
}

/** Human time-distance words from an age in hours. */
export function ageWords(hours) {
  const h = Math.max(0, hours);
  if (h < 1) return { bucket: 'now', when: 'just now', ago: 'a moment ago' };
  if (h < 6) return { bucket: 'today', when: 'earlier today', ago: `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago` };
  if (h < 24) return { bucket: 'today', when: 'today', ago: 'earlier today' };
  if (h < 48) return { bucket: 'yesterday', when: 'yesterday', ago: 'yesterday' };
  if (h < DAY * 7) return { bucket: 'recent', when: `${Math.round(h / DAY)} days ago`, ago: `${Math.round(h / DAY)} days ago` };
  if (h < DAY * 30) return { bucket: 'weeks', when: `${Math.round(h / WEEK)} week${Math.round(h / WEEK) === 1 ? '' : 's'} ago`, ago: 'a few weeks back' };
  if (h < YEAR) return { bucket: 'old', when: `${Math.round(h / (DAY * 30))} months ago`, ago: 'months ago' };
  if (h < YEAR * 3) return { bucket: 'old', when: `${Math.round(h / YEAR)} year${Math.round(h / YEAR) === 1 ? '' : 's'} ago`, ago: 'years ago' };
  return { bucket: 'ancient', when: 'long ago', ago: 'a lifetime ago' };
}

/**
 * Turn a memory into template bindings. Returns { memory: {...}, foe, place, ally, weapon, ... } where entity-valued
 * bindings become Entities (with counts) resolved from the lexicon. Missing entries become placeholder entities.
 */
export function memoryBindings(m, lexicon, now, { speakerId, recalledBefore = false } = {}) {
  const age = ageWords(Math.max(0, now - m.time)); const out = {};
  const ent = (v, fallbackType) => { if (v == null) return null; const id = v.id ?? v, count = v.count ?? 1; const e = lexicon?.get(id); return new Entity(e || { id, type: fallbackType || 'thing', proper: !e, forms: { sg: String(id).replace(/_/g, ' ') } }, { lexicon, count }); };
  for (const [k, v] of Object.entries(m.bindings)) { const e = ent(v, k === 'foe' ? 'creature' : k === 'place' ? 'place' : k === 'ally' || k === 'victim' || k === 'newcomer' || k === 'by' || k === 'figure' ? 'person' : 'thing'); if (e) out[k] = e; }
  out.memory = { ...m.details, id: m.id, type: m.type, when: age.when, ago: age.ago, bucket: age.bucket, ageHours: now - m.time, ageDays: (now - m.time) / DAY, count: m.count, times: m.count === 1 ? 'once' : m.count === 2 ? 'twice' : `${m.count} times`, valence: m.valence, tags: m.tags, shared: !!(speakerId && m.participants.includes(speakerId)), recalledBefore, ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v])) };
  return out;
}

/**
 * Random event generator for demos/tests. spec (from events.json) says which bindings to roll:
 *   bindings: { foe: { type: 'creature', count: [1, 12] }, place: { type: 'place' }, weapon: { type: 'item', tags: ['weapon'] } }
 *   details: { outcome: ['won', 'won', 'fled', 'lost'] }  (random pick), level: [2, 10] (random int)
 */
export function generateEvent(type, def, { lexicon, rng = Math.random, participants = [], time = 0, exclude = [] }) {
  const pick = arr => arr[Math.floor(rng() * arr.length)]; const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const bindings = {};
  for (const [k, spec] of Object.entries(def.bindings || {})) {
    const list = lexicon.byType(spec.type, { tags: spec.tags || [], exclude: [...exclude, ...(spec.type === 'person' ? participants : [])] });
    if (!list.length) continue; const e = pick(list); bindings[k] = spec.count ? { id: e.id, count: int(spec.count[0], spec.count[1]) } : { id: e.id };
  }
  const details = {};
  for (const [k, spec] of Object.entries(def.details || {})) details[k] = Array.isArray(spec) ? (typeof spec[0] === 'number' && spec.length === 2 ? int(spec[0], spec[1]) : pick(spec)) : spec;
  return { type, time, bindings, details, participants: [...participants] };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
