// Scene / context awareness: where the characters are right now, what is around them, how dangerous or comfortable it
// is. A Scene turns into template bindings (here, threat, weather…) and into tag weights / condition helpers so the
// grammar and the conversation planner favour lines about the surroundings instead of random pleasantries.
import { Entity } from './lingo.js';

export class Scene {
  /**
   * def: { id, name, place: lexiconId | entry, tags: ['dark','damp','cold','enclosed','holy','crowded','wild','high','ruined','wet','hot','quiet','loud'],
   *        threats: [{ id: creatureId, count }], weather: lexiconId, timeOfDay: 'dawn|day|dusk|night', danger: 0..1, comfort: 0..1, smell, sound, recentEvent? }
   */
  constructor(def = {}, lexicon = null) {
    this.def = { tags: [], threats: [], danger: 0.2, comfort: 0.5, timeOfDay: 'day', ...def }; this.lexicon = lexicon;
    const p = this.def.place; this.place = p ? new Entity(typeof p === 'object' ? p : (lexicon?.get(p) || { id: p, type: 'place', forms: { sg: String(p).replace(/_/g, ' ') } }), { lexicon }) : null;
    this.threats = (this.def.threats || []).map(t => new Entity(lexicon?.get(t.id ?? t) || { id: t.id ?? t, type: 'creature', forms: { sg: String(t.id ?? t) } }, { lexicon, count: t.count ?? 2 }));
    this.weather = this.def.weather ? new Entity(lexicon?.get(this.def.weather) || { id: this.def.weather, type: 'weather', mass: true, forms: { sg: this.def.weather } }, { lexicon }) : null;
  }
  get id() { return this.def.id; } get name() { return this.def.name; } get tags() { return this.def.tags; } get danger() { return this.def.danger; } get comfort() { return this.def.comfort; } get timeOfDay() { return this.def.timeOfDay; }
  has(tag) { return this.def.tags.includes(tag); }
  /** Bindings for lingo.expand / speak: here, threat (first), threat2, weather, scene (plain values). */
  bindings() {
    const b = { scene: { id: this.id, name: this.name, tags: this.tags, danger: this.danger, comfort: this.comfort, timeOfDay: this.timeOfDay, smell: this.def.smell, sound: this.def.sound } };
    if (this.place) b.here = this.place; if (this.threats[0]) b.threat = this.threats[0]; if (this.threats[1]) b.threat2 = this.threats[1]; if (this.weather) b.weather = this.weather;
    return b;
  }
  /** Extra tag multipliers for lingo.tagWeights: danger pushes worried/fear/short lines, comfort pushes relaxed ones. */
  tagWeights() {
    const d = this.danger, c = this.comfort, w = {};
    w.fear = 0.3 + d * 3; w.worried = 0.6 + d * 2; w.alert = 0.4 + d * 3; w.short = 1 + d * 0.8; w.long = 1 - d * 0.5;
    w.relaxed = 0.4 + c * 2; w.joke = 0.5 + c * 1.2 - d * 0.4; w.drink = 0.3 + c * 2; w.romantic = 0.4 + c * 1.2 - d * 0.6;
    // descriptor tags: boosted when the scene has them, nearly silenced when it does not (a cave is never 'hot as a forge')
    for (const t of ['dark', 'cold', 'damp', 'enclosed', 'crowded', 'ruin', 'wild', 'hot', 'wet', 'loud', 'quiet', 'night', 'holy']) w[t] = 0.08;
    if (this.has('holy')) w.religious = 2.5; if (this.has('dark')) w.dark = 3; if (this.has('cold')) w.cold = 3; if (this.has('damp')) w.damp = 3; if (this.has('wet')) w.wet = 3; if (this.has('loud')) w.loud = 3; if (this.has('quiet')) w.quiet = 3; if (this.has('holy')) w.holy = 3; if (this.has('enclosed')) w.enclosed = 3; if (this.has('crowded')) w.crowded = 3; if (this.has('ruined')) w.ruin = 3; if (this.has('wild')) w.wild = 3; if (this.has('hot')) w.hot = 3;
    if (this.timeOfDay === 'night') w.night = 3;
    for (const k in w) w[k] = Math.max(0.05, w[k]);
    return w;
  }
  toJSON() { return this.def; }
}

/** Intent pools per situation, used by the planner. */
export function scenePools(scene) {
  if (!scene) return null;
  const d = scene.danger, c = scene.comfort, hasThreat = scene.threats.length > 0;
  if (d >= 0.6) return { weight: 0.75, pool: ['observe', ...(hasThreat ? ['fear', 'plan', 'warning'] : ['plan']), 'rally', 'pray', 'complain'] };
  if (d >= 0.35) return { weight: 0.5, pool: ['observe', ...(hasThreat ? ['fear', 'plan'] : ['plan']), 'smalltalk', 'complain', 'gossip'] };
  if (c >= 0.7) return { weight: 0.45, pool: ['observe', 'relief', 'smalltalk', 'drink', 'gossip', 'brag', 'flirt', 'lore'] };
  return { weight: 0.35, pool: ['observe', 'smalltalk', 'gossip', 'lore', 'question'] };
}
