// Game state: party, inventory, time, quests, deeds, memories + relations for everyone, save/load.
import { MemoryBank } from '../../../lingo/js/memory.js';
import { RelationGraph } from '../../../lingo/js/relations.js';
import { makeRng } from './rng.js';
import { itemStats } from './combat.js';

const SAVE_KEY = 'playground:party-quest:save:v1';
export class Game {
  constructor(data) { this.data = data; this.rng = makeRng(); this.reset(); }
  reset() {
    this.party = []; this.inventory = []; this.gold = 15; this.reputation = 0; this.deeds = []; this.quests = { active: [], done: [] };
    this.location = this.data.world.start; this.visited = new Set([this.location]); this.day = 1; this.slot = 1; this.npcs = {}; this.flags = {}; this.log = [];
    this.banks = {}; this.relations = new RelationGraph(this.data.relations); this.cleared = new Set(); this.turnCount = 0;
  }
  // ---- time
  get slotName() { return this.data.rules.time.slots[this.slot]; }
  get now() { return (this.day - 1) * 24 + this.slot * 4; }              // game hours for memory/relations
  get isNight() { return this.slotName === 'night'; }
  advance(n = 1) { this.slot += n; if (this.slot >= this.data.rules.time.slots.length - 1) this.slot = this.data.rules.time.slots.length - 1; return this.slotName; }
  newDay() { this.day++; this.slot = 0; for (const b of Object.values(this.banks)) b.tick(this.now); this.relations.tick(this.now); }
  // ---- party
  /** Turn a library character blueprint + class into a party member (game state only; blueprint untouched). */
  makeMember(blueprint, classId) {
    const cls = this.data.rules.classes[classId]; const bp = JSON.parse(JSON.stringify(blueprint));
    const m = { id: bp.id || ('m_' + Math.random().toString(36).slice(2, 7)), name: bp.name, short: bp.short || bp.name.split(' ')[0], race: bp.race || 'human', pronouns: bp.pronouns || 'they', gender: bp.gender, class: classId, className: cls.name, role: cls.role, side: 'party', level: 1, xp: 0, hp: cls.hp, maxHp: cls.hp, weapon: null, armour: null, implement: null, spell: cls.spell || null, damage: 1, armourValue: 0, blueprint: bp, avatar: bp.avatar, voice: bp.voice, speech: bp.speech, entry: bp.entry, respell: bp.respell, libraryId: bp.libraryId };
    for (const [slot, itemId] of Object.entries(cls.kit)) { const item = this.data.items.byId[itemId]; if (item) this.equip(m, { ...item, base: item, name: item.name, fullName: item.name, tags: item.tags, rarity: item.rarity }, slot); }
    return m;
  }
  equip(m, item, slot = null) {
    const st = itemStats(item, this.data.rules); slot = slot || (st.kind === 'weapon' ? 'weapon' : st.kind === 'armour' ? 'armour' : st.kind === 'implement' ? 'implement' : null); if (!slot) return false;
    const old = m[slot]; m[slot] = item; this.recalc(m); if (old) this.inventory.push(old); return true;
  }
  recalc(m) { const w = m.weapon ? itemStats(m.weapon, this.data.rules) : null; m.damage = w?.damage ?? 1; const a = m.armour ? itemStats(m.armour, this.data.rules) : null; m.armourValue = a?.armour ?? 0; const im = m.implement ? itemStats(m.implement, this.data.rules) : null; m.spell = im?.spell || this.data.rules.classes[m.class].spell || null; m.armour_ = m.armourValue; }
  gainXp(m, xp) { m.xp += xp; const table = this.data.rules.levels.xpPer; let ups = 0; while (m.level < table.length && m.xp >= table[m.level]) { m.level++; m.maxHp += this.data.rules.levels.hpPerLevel; m.hp = Math.min(m.maxHp, m.hp + this.data.rules.levels.hpPerLevel); ups++; } return ups; }
  alive() { return this.party.filter(m => m.hp > 0); }
  // ---- memories & relations
  bank(id, traits = []) { if (!this.banks[id]) this.banks[id] = new MemoryBank({ ownerId: id, traits, eventTypes: this.data.events, lexicon: this.data.lingo.lexicon }); return this.banks[id]; }
  traitsOf(id) { const m = this.party.find(x => x.id === id) || Object.values(this.npcs).flat().find(x => x.id === id); return m?.speech?.traits || []; }
  /** Record an event for every participant's memory and update feelings between them. */
  remember(event) { event.time = event.time ?? this.now; for (const id of event.participants || []) this.bank(id, this.traitsOf(id)).remember(event, this.now); this.relations.applyMemoryEvent(event, { traitsOf: id => this.traitsOf(id), now: this.now }); this.log.push({ at: this.now, type: event.type, participants: event.participants, bindings: event.bindings, details: event.details }); return event; }
  partyIds() { return this.party.map(m => m.id); }
  // ---- inventory & money
  addItem(item) { this.inventory.push(item); return item; }
  removeItem(item) { const i = this.inventory.indexOf(item); if (i >= 0) this.inventory.splice(i, 1); }
  sellValue(item) { return Math.max(1, Math.round((item.value || 5) * this.data.rules.prices.sellFactor)); }
  // ---- quests & deeds
  quest(id) { return this.data.world.quests.find(q => q.id === id); }
  addDeed(text, { place, quest } = {}) { const deed = { text, place, quest, day: this.day }; this.deeds.push(deed); return deed; }
  // ---- save/load (memory banks and relations serialize with the rest)
  toJSON() { return { v: 1, party: this.party, inventory: this.inventory, gold: this.gold, reputation: this.reputation, deeds: this.deeds, quests: this.quests, location: this.location, visited: [...this.visited], day: this.day, slot: this.slot, npcs: this.npcs, flags: this.flags, log: this.log.slice(-200), banks: Object.fromEntries(Object.entries(this.banks).map(([k, b]) => [k, b.toJSON()])), relations: this.relations.toJSON(), cleared: [...this.cleared] }; }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this)); return true; } catch { return false; } }
  static hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  static clearSave() { localStorage.removeItem(SAVE_KEY); }
  static load(data) {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const j = JSON.parse(raw); const g = new Game(data);
    Object.assign(g, { party: j.party, inventory: j.inventory, gold: j.gold, reputation: j.reputation, deeds: j.deeds, quests: j.quests, location: j.location, visited: new Set(j.visited), day: j.day, slot: j.slot, npcs: j.npcs, flags: j.flags, log: j.log || [], cleared: new Set(j.cleared || []) });
    g.banks = Object.fromEntries(Object.entries(j.banks || {}).map(([k, b]) => [k, MemoryBank.fromJSON(b, { eventTypes: data.events, lexicon: data.lingo.lexicon })])); g.relations = RelationGraph.fromJSON(j.relations || {}, data.relations);
    for (const m of g.party) g.recalc(m); return g;
  }
}
