// Relationships with several factors instead of one opinion number (RimWorld-style, but split).
//   import { RelationGraph, Relationship } from '/lingo/js/relations.js';
//   const graph = new RelationGraph(relationsData);                 // lingo/data/relations.json
//   const rel = graph.get('mara', 'thalen');                        // how Mara feels about Thalen (directional)
//   graph.apply('mara', 'thalen', 'saved_life', { traits: mara.traits, now });   // Thalen saved Mara → Mara's feelings change
//   rel.opinion()  → -1..1 for code that wants one number;  rel.tags() → ['grateful','respectful',…] for phrase selection
//   rel.knows('coward'), rel.learn('kind'), rel.familiarity
//   graph.applyMemoryEvent(memoryEvent, viewerId)                   // hook memory events (combat, kindness, death…) to feelings
export class Relationship {
  constructor(from, to, model, data = {}) {
    this.from = from; this.to = to; this.model = model;
    this.dims = {}; for (const d of Object.keys(model.dimensions)) this.dims[d] = data.dims?.[d] ?? 0;
    this.familiarity = data.familiarity ?? 0; this.knowledge = new Set(data.knowledge || []); this.facts = data.facts || []; this.history = data.history || []; this.updatedAt = data.updatedAt ?? 0;
  }
  get(dim) { return this.dims[dim] ?? 0; }
  set(dim, v) { if (dim === 'familiarity') this.familiarity = clamp(v, 0, 1); else if (dim in this.dims) this.dims[dim] = clamp(v, -1, 1); return this; }
  /** One number for old code: weighted mix of the factors. */
  opinion() { let o = 0; for (const [d, w] of Object.entries(this.model.opinionWeights)) o += w * (this.dims[d] ?? 0); return clamp(o, -1, 1); }
  /** Phrase tags switched on by the current mix (see relations.json → tags). */
  tags() { const scope = { ...this.dims, familiarity: this.familiarity, opinion: this.opinion() }; const out = []; for (const t of this.model.tags) { try { if (new Function(...Object.keys(scope), 'return (' + t.when + ')')(...Object.values(scope))) out.push(t.tag); } catch {} } return out; }
  knows(trait) { return this.knowledge.has(trait); }
  learn(trait) { if (trait) this.knowledge.add(trait); return this; }
  /** Apply a named event. opts: { traits (viewer's), now, strength (multiplier), source } */
  apply(eventId, { traits = [], now = 0, strength = 1, source = null, targetTraits = [] } = {}) {
    const ev = this.model.events[eventId]; if (!ev) throw new Error('unknown relationship event ' + eventId);
    const before = { ...this.dims };
    for (const [dim, delta] of Object.entries(ev.effects || {})) {
      let mult = strength;
      for (const t of traits) { const m = this.model.traitModifiers[t]?.[dim]; if (m) mult *= delta > 0 ? (m.gain ?? 1) : (m.loss ?? 1); }
      // diminishing returns near the ends of the scale
      const cur = this.dims[dim] ?? 0; const room = delta > 0 ? 1 - cur : 1 + cur; this.dims[dim] = clamp(cur + delta * mult * (0.4 + 0.6 * room), -1, 1);
    }
    let fam = ev.familiarity || 0; for (const t of traits) { const m = this.model.traitModifiers[t]?.familiarity; if (m && fam > 0) fam *= m.gain ?? 1; } this.familiarity = clamp(this.familiarity + fam, 0, 1);
    // learning: events reveal the target's traits (only ones they actually have); familiarity reveals random ones
    for (const t of ev.reveals || []) if (targetTraits.includes(t)) this.knowledge.add(t);
    if (targetTraits.length && this.familiarity > 0.3 && Math.random() < this.familiarity * 0.3) this.knowledge.add(targetTraits[Math.floor(Math.random() * targetTraits.length)]);
    this.history.push({ at: now, event: eventId, source, delta: Object.fromEntries(Object.keys(this.dims).filter(d => this.dims[d] !== before[d]).map(d => [d, +(this.dims[d] - before[d]).toFixed(3)])) });
    if (this.history.length > 50) this.history.shift(); this.updatedAt = now;
    return this;
  }
  /** Fade toward neutral over time (hours). */
  tick(now) { const days = Math.max(0, now - this.updatedAt) / 24; if (days <= 0) return; for (const [d, def] of Object.entries(this.model.dimensions)) { const k = Math.pow(1 - (def.decayPerDay || 0), days); this.dims[d] *= k; } this.updatedAt = now; }
  summary() { const strongest = Object.entries(this.dims).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 2).map(([d, v]) => `${v > 0 ? '+' : ''}${v.toFixed(2)} ${d}`); return `opinion ${this.opinion().toFixed(2)} (${strongest.join(', ')}) · familiarity ${this.familiarity.toFixed(2)} · knows: ${[...this.knowledge].join(', ') || 'nothing'}`; }
  toJSON() { return { from: this.from, to: this.to, dims: this.dims, familiarity: this.familiarity, knowledge: [...this.knowledge], facts: this.facts, history: this.history.slice(-20), updatedAt: this.updatedAt }; }
}

export class RelationGraph {
  constructor(model) { this.model = model; this.rels = new Map(); }
  key(a, b) { return a + '→' + b; }
  get(a, b) { const k = this.key(a, b); if (!this.rels.has(k)) this.rels.set(k, new Relationship(a, b, this.model)); return this.rels.get(k); }
  has(a, b) { return this.rels.has(this.key(a, b)); }
  /** viewer's feelings about target change by event. */
  apply(viewer, target, eventId, opts = {}) { return this.get(viewer, target).apply(eventId, opts); }
  /** Both directions at once (shared experiences). */
  applyMutual(a, b, eventId, opts = {}) { this.get(a, b).apply(eventId, { ...opts, traits: opts.traitsA || [], targetTraits: opts.traitsB || [] }); this.get(b, a).apply(eventId, { ...opts, traits: opts.traitsB || [], targetTraits: opts.traitsA || [] }); }
  /**
   * Translate a memory event ({ type, bindings, details, participants }) into relationship changes for everyone present.
   * traitsOf(id) → traits array. Mapping in relations.json → memoryEvents.
   */
  applyMemoryEvent(event, { traitsOf = () => [], now = 0 } = {}) {
    const map = this.model.memoryEvents[event.type]; if (!map) return [];
    const applied = []; const parts = event.participants || [];
    const byId = event.bindings?.by?.id ?? event.bindings?.by, teacher = event.bindings?.teacher?.id ?? event.bindings?.teacher;
    for (const viewer of parts) {
      if (map.by && byId && byId !== viewer) { this.apply(viewer, byId, map.by, { traits: traitsOf(viewer), targetTraits: traitsOf(byId), now, source: event.type }); applied.push([viewer, byId, map.by]); }
      if (map.teacher && teacher && teacher !== viewer) { this.apply(viewer, teacher, map.teacher, { traits: traitsOf(viewer), targetTraits: traitsOf(teacher), now, source: event.type }); applied.push([viewer, teacher, map.teacher]); }
      const shared = map[event.details?.outcome] || map['*']; if (!shared) continue;
      for (const other of parts) { if (other === viewer) continue; this.apply(viewer, other, shared, { traits: traitsOf(viewer), targetTraits: traitsOf(other), now, source: event.type }); applied.push([viewer, other, shared]); }
    }
    return applied;
  }
  tick(now) { for (const r of this.rels.values()) r.tick(now); }
  toJSON() { return { rels: [...this.rels.values()].map(r => r.toJSON()) }; }
  static fromJSON(json, model) { const g = new RelationGraph(model); for (const r of json.rels || []) g.rels.set(g.key(r.from, r.to), new Relationship(r.from, r.to, model, r)); return g; }
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
