// Game state + world rules: party/companions/bench, gold/materials/fame, zone graph + node handling, dialog and random
// events (with skill checks, flags, rewards), towns (act-gated services), dungeons, quests, save/load. No DOM.
import { makeRng, hashStr } from './rng.js';
import { Loot } from './loot.js';
import { createHero, gainXp, catchUp, refresh, hireCost, makeEnemy, equip, unequip, derive, applyBalance, bestCheckBonus, CHAMPION, NAMED, ECONOMY, HEALER_CLASSES } from './rules.js';
import { applySpawnMods, CHAMPION_MODS, NAMED_MODS, fireWorld, worldSum, worldMax } from './effects.js';
import { partyLimit, benchHero, joinParty, canBench, canJoin, takeGear } from './bench.js';
import { MemoryBank } from '../../../lingo/js/memory.js';
import { RelationGraph } from '../../../lingo/js/relations.js';
import { Meter } from '../../../meters/js/meter.js';
const SAVE_KEY = 'playground:emberveil:save:v1';
export const TOWNS = { 1: { name: 'Emberglen', services: ['merchant', 'tavern', 'cleric'] }, 2: { name: 'Ashfort', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer'] }, 3: { name: 'Ironhold Bastion', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter'] }, 4: { name: 'Starfall Haven', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] }, 5: { name: 'The Last Bastion', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] }, 6: { name: 'Drakehold', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] } };
export const VEHICLES = { none: { name: 'On foot', legs: 3, rationEvery: 1, attack: 0, difficulty: 0, price: 0, desc: 'Three nodes a day. One ration a day.' }, mule: { name: 'Pack mule', legs: 3, rationEvery: 2, attack: 0, difficulty: 0, price: 60, desc: 'Carries the food: a ration lasts two days. Still three nodes a day.' }, wagon: { name: 'Wagon', legs: 4, rationEvery: 2, attack: -0.15, difficulty: 0, price: 180, desc: 'Four nodes a day, rations last two days, high sides deter night raiders (−15%).' }, ox_cart: { name: 'Ox cart', legs: 2, rationEvery: 3, attack: -0.3, difficulty: -1, price: 120, desc: 'Slow (two nodes a day) but a ration lasts three days and oxen scare off small raiders (−30%, weaker attacks).' }, war_wagon: { name: 'War wagon', legs: 3, rationEvery: 2, attack: -0.45, difficulty: -1, price: 420, desc: 'Armoured. Night attacks are rare (−45%) and weaker; the party starts night fights behind a barrier.' }, coach: { name: 'Fast coach', legs: 5, rationEvery: 1, attack: 0.2, difficulty: 1, price: 350, desc: 'Five nodes a day. Loud and rich-looking: night attacks are likelier (+20%) and larger.' }, dragon_sled: { name: 'Dragon sled', legs: 6, rationEvery: 2, attack: 0.4, difficulty: 2, price: 900, act: 6, desc: 'Six nodes a day, pulled by something that should not be tame. Everything hunts it (+40%, much larger attacks).' } };
export const SUPPLY_KINDS = { ration: { name: 'Ration', icon: '🍞', price: 4, desc: 'One day of food for the party.' }, bandages: { name: 'Bandages', icon: '🩹', price: 12, desc: 'Out of combat: heals one hero 30% of max HP.' }, torch: { name: 'Torches', icon: '🔥', price: 3, desc: 'A lit camp: fewer night raiders for one night (the exact number is in the rest tooltip).' }, tent: { name: 'Tent', icon: '⛺', price: 90, desc: 'Reusable. Rest recovers 15% HP.' }, rope: { name: 'Rope', icon: '🪢', price: 18, desc: 'A coil of good rope. Gets the party over a ford or down a gorge.' }, timber: { name: 'Timber', icon: '🪵', price: 26, desc: 'Cut beams. Shores up a rockslide or bridges a gap.' } };
export const ACT_NAMES = { 0: 'Prologue · The Lonely Road', 1: 'Act I · The Goblin Frontier', 2: 'Act II · The Ashen Wastes', 3: 'Act III · The Hell Breach', 4: 'Act IV · The Cosmic Void', 5: 'Act V · The Primordial Abyss', 6: "Act VI · The Dragon's Reach" };
// ---------------------------------------------------------------------------------------------
// Head counts in names. "Goblin Pair" promises two goblins, "Lone Goblin" promises one, and a
// "band"/"patrol"/"swarm" promises three or more. Anything that can change the size of a fight
// (a named leader turning up with followers, a coach dragging extra raiders out of the dark) has to
// leave those names alone or rewrite them — see enter(), nightEncounter() and encounterLabel().
/** Words that name an exact number of enemies. */
export const COUNT_WORDS = { lone: 1, solo: 1, single: 1, one: 1, pair: 2, duo: 2, two: 2, twin: 2, twins: 2, couple: 2, brace: 2, trio: 3, three: 3, four: 4, quartet: 4, five: 5, six: 6 };
/** Words that only promise "a crowd": at least this many. */
export const GROUP_WORDS = { band: 3, warband: 3, pack: 3, patrol: 3, gang: 3, troupe: 3, swarm: 3, horde: 3, host: 3 };
/** Split a name into words, keeping hyphenated compounds whole so "One-eye" is not the number one. */
const nameWords = name => String(name).toLowerCase().split(/[^a-z-]+/).filter(Boolean);
/** The exact head count a name promises, or null when it promises no particular number. */
export function countWordIn(name = '') { for (const w of nameWords(name)) if (COUNT_WORDS[w] != null) return COUNT_WORDS[w]; return null; }
/** The smallest head count a crowd word promises, or null. */
export function groupWordIn(name = '') { for (const w of nameWords(name)) if (GROUP_WORDS[w] != null) return GROUP_WORDS[w]; return null; }
/** Does this many enemies keep the promise the name makes? Names with no number word always pass. */
export function labelFits(name, n) { const exact = countWordIn(name); if (exact != null) return n === exact; const min = groupWordIn(name); return min == null || n >= min; }

// ---------------------------------------------------------------------------------------------
// Revives. A hero who is knocked out in a fight STAYS DOWN afterwards — the road does not hand them
// back. There are exactly four ways to get somebody on their feet again, and every one of them is
// written down here so the UI, the tooltips and the README can quote the same rules:
//
//   1. a living healer in the party — a class whose role heals, or anyone who knows a heal or revive
//      skill — picks the fallen up after the fight and again at camp, at `healerHp` of max health;
//   2. a revive item bought from a merchant (Revival Flask, or the expensive Emberheart Draught),
//      used from the Bag tab, at the item's own percentage;
//   3. a shrine node on the map: the whole party wakes and is fully healed;
//   4. a settlement: the cleric's free rest wakes and fully heals everyone.
//
// Losing a fight is not a dead end either — defeat() wakes the party in town at half health, minus
// some gold. Every revive is written on the hero as `hero.revivedBy` ({ by, byName, how, source,
// day, where }) and remembered as a `revive` memory (importance 0.95, never forgotten), so camp
// conversations can thank the person who did it.
export const REVIVE = { healerHp: 0.5, shrineHp: 1, townHp: 1, defeatHp: 0.5, companionHp: 0.5 };

export const MAIN_QUESTS = [{ id: 'mq_act1', title: 'Blood at the Border', act: 1, boss: 'border_boss', text: 'Goblin warbands raid the border with unnatural discipline. Find who commands them.' }, { id: 'mq_act2', title: 'Embers Over Cinderhold', act: 2, boss: 'plateau_boss', text: 'Follow the corruption into the Ashen Wastes and find Silas\'s missing daughter.' }, { id: 'mq_act3', title: 'The Veil Breach', act: 3, boss: 'breach_boss', text: 'Cross the breach into a Hell already fracturing. Confront Silas at Dreadhearth.' }, { id: 'mq_act4', title: 'Shards of the Architect', act: 4, boss: 'core_boss', text: 'Kaela Thorne needs three void shards to track the cult through the rift.' }, { id: 'mq_act5', title: 'The Architect', act: 5, boss: 'rift_boss', text: 'The hooded scholar was the Architect all along. Reach the place where reality was made.' }, { id: 'mq_act6', title: 'The Dragon King', act: 6, boss: 'dragonking_boss', text: 'Bahamorth\'s heart beats beneath three scales of dragon-steel.' }];

export class Game {
  constructor(data) { this.d = data; applyBalance(data.balance); this.B = { nightAttack: { base: 0.15, perAct: 0.06, torch: -0.1, cap: 0.95 }, exhaustion: { perStack: 0.1, floor: 0.5 }, rest: { tentHeal: 0.15, extraRationHeal: 0.3, bandageHeal: 0.3 }, defeat: { goldKept: 0.85, hpAfter: 0.5 }, ...(data.balance?.world || {}) }; this.loot = new Loot(data.items, { ...(data.balance?.loot || {}), shopPrice: data.balance?.economy?.globalMultipliers?.shopPrice ?? 1, dropRate: data.balance?.economy?.globalMultipliers?.dropRate ?? 1 }); this.zones = Object.fromEntries(Object.values(data.zones).flat().filter(z => z?.id).map(z => [z.id, z])); this.zoneOrder = Object.values(data.zones).flat().filter(z => z?.id).map(z => z.id);
    // Our own road bands (data/enemy-families.json) join the original's encounter table so a toll
    // collector on any road has people to call on — see familyOf()/humanoidFight().
    for (const [id, enc] of Object.entries(data.families?.extraEncounters || {})) if (!data.encounters.encounters[id]) data.encounters.encounters[id] = enc;
    this.reset(); }
  reset() { this.party = []; this.companions = []; this.bench = []; this.benchCompanions = []; this.inventory = []; this.materials = { iron_scrap: 0, magic_essence: 0, rare_dust: 0, legend_core: 0 }; this.gold = 150; this.fame = 0; this.act = 0; this.zoneId = 'prologue'; this.nodeId = 'start'; this.unlockedZones = ['prologue']; this.visited = { prologue: ['start'] }; this.cleared = []; this.usedNodes = []; this.flags = {}; this.seenEvents = []; this.completedBosses = []; this.completedDungeons = []; this.quests = { active: [], done: [] }; this.kills = 0; this.rareFound = 0; this.ngPlus = 0; this.seed = Math.floor(Math.random() * 1e9); this.rng = makeRng(this.seed); this.log = []; this.day = 1;
    this.nemeses = []; this.namedSlain = []; this.namedSeen = []; this.heroQuests = {}; this.threads = {}; this.nodesTravelled = 0; this.stats = { fightsUnbroken: 0, salvaged: 0, looted: 0, rests: 0, nodeTypes: [] }; this.supplies = { ration: 6, bandages: 1, torch: 2, tent: 0, rope: 0, timber: 0 }; this.vehicle = 'none'; this.legsUsed = 0; this.exhaustion = 0; this.fedToday = true; this.lootLog = []; this.foraged = 0; this.winGear = []; this.legGear = []; this.banks = {}; this.relations = new RelationGraph(this.d.relations || { dimensions: {}, opinionWeights: {}, tags: [], events: {}, memoryEvents: {} }); this.meter = new Meter({ maxFights: 60 }); this.hour = 8; this.restLog = []; this.crossings = []; this.revives = []; this.questOffers = []; }
  // ---------- memory & feelings
  get now() { return (this.day - 1) * 24 + this.hour; }
  bank(id, traits = []) { if (!this.banks[id]) this.banks[id] = new MemoryBank({ ownerId: id, traits, eventTypes: this.d.events?.types || {}, lexicon: this.d.lexicon || null }); return this.banks[id]; }
  traitsOf(id) { return [...this.party, ...this.bench, ...this.companions].find(h => h.id === id)?.speech?.traits || []; }
  partyIds({ companions = true } = {}) { return [...this.party.map(h => h.id), ...(companions ? this.companions.map(c => c.id) : [])]; }
  /** Every participant remembers; feelings between them move (relations.json memoryEvents). */
  remember(event) { event.time = event.time ?? this.now; for (const id of event.participants || []) this.bank(id, this.traitsOf(id)).remember(event, this.now); try { this.relations.applyMemoryEvent(event, { traitsOf: id => this.traitsOf(id), now: this.now }); } catch {} this.log.push({ at: this.now, type: event.type, details: event.details }); return event; }
  // ---------- days, travel legs, supplies, vehicles
  vehicleDef() { return VEHICLES[this.vehicle] || VEHICLES.none; }
  /** Everyone whose gear can change the road: the living heroes carrying it. */
  bearers() { return this.party.filter(h => h.alive); }
  legsPerDay() { return this.vehicleDef().legs + Math.round(worldSum('legs', this, this.bearers())); }
  legsLeft() { return Math.max(0, this.legsPerDay() - this.legsUsed); }
  canMove() { return this.legsLeft() > 0; }
  /** Spend a travel leg (called on every node move). Returns false if the party must rest first. */
  spendLeg() { if (!this.canMove()) return false; this.legsUsed++; this.hour = Math.min(22, 8 + Math.round(14 * this.legsUsed / this.legsPerDay())); return true; }
  /** Night attack odds for the current zone before resting: base by act, vehicle and torches. */
  nightAttack() { const N = this.B.nightAttack; const act = this.zone()?.act || 0; const base = N.base + act * N.perAct; const v = this.vehicleDef(); const torch = this.supplies.torch > 0 ? N.torch : 0; const town = this.node()?.type === 'town'; const gear = worldSum('nightChance', this, this.bearers()); const chance = town ? 0 : Math.max(0, Math.min(N.cap, base + v.attack + torch + gear)); return { chance, difficulty: v.difficulty, base, vehicle: v.attack, torch, gear, town }; }
  /** Rest for the night: eat (or suffer), tick memories/relations, maybe get attacked. Does NOT heal by itself. Returns what happened. */
  rest({ eatExtra = false, useTorch = true } = {}) {
    const v = this.vehicleDef(); const out = { ate: false, extra: false, exhaustion: 0, healed: 0, day: this.day + 1, torchUsed: false };
    const needsFood = (this.day % v.rationEvery) === 0 || v.rationEvery === 1; if (needsFood) { if (this.supplies.ration > 0) { this.supplies.ration--; out.ate = true; this.fedToday = true; } else { this.fedToday = false; } } else { out.ate = true; this.fedToday = true; }
    if (this.fedToday) this.exhaustion = Math.max(0, this.exhaustion - 1); else this.exhaustion = Math.min(5, this.exhaustion + 1); out.exhaustion = this.exhaustion;
    if (eatExtra && this.supplies.ration > 0) { this.supplies.ration--; out.extra = true; for (const h of this.party) if (h.alive) { const heal = Math.round(h.maxHp * this.B.rest.extraRationHeal); h.hp = Math.min(h.maxHp, h.hp + heal); out.healed += heal; } }
    if (this.supplies.tent > 0) for (const h of this.party) if (h.alive) h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * this.B.rest.tentHeal));
    if (useTorch && this.supplies.torch > 0 && this.node()?.type !== 'town') { this.supplies.torch--; out.torchUsed = true; }
    // A night's sleep does not raise the dead. A healer sitting up with them does.
    const medic = this.healers()[0] || null;
    out.revived = medic ? this.reviveFallen({ by: medic, how: `${medic.short} sat up with them all night`, hpFrac: REVIVE.healerHp, source: 'healer' }) : [];
    this.reviveCompanions();
    for (const h of [...this.party, ...this.companions]) { h.mp = h.maxMp; h.statuses = []; if (!h.alive) continue; const d = h.derived; if (d?.hpRegen) h.hp = Math.min(h.maxHp, Math.round(h.hp + d.hpRegen * 8)); }
    out.gear = fireWorld('onRest', this, this.bearers(), out);
    this.remember({ type: 'meal', participants: this.partyIds(), bindings: { food: { id: out.ate ? 'trail_ration' : 'hardtack' }, place: { id: this.zoneId } }, details: { quality: out.extra ? 'good' : out.ate ? 'cold' : 'terrible' } });
    this.day++; this.hour = 8; this.legsUsed = 0; this.restLog.push({ day: this.day, zone: this.zoneId, ...out }); out.questsDone = this.trackEvent('rest'); return out;
  }
  /** Exhaustion penalty: −10% hit/dodge/damage per stack (applied in derive via game.exhaustionMult). */
  exhaustionMult() { const E = this.B.exhaustion; const ease = Math.min(0.9, worldMax('exhaustionEase', this, this.bearers())); return Math.max(E.floor, 1 - E.perStack * this.exhaustion * (1 - ease)); }
  buySupply(kind, n = 1) { const def = SUPPLY_KINDS[kind]; if (!def) return false; const cost = def.price * n; if (this.gold < cost) return false; this.gold -= cost; this.supplies[kind] = (this.supplies[kind] || 0) + n; return true; }
  useBandage(hero) { if ((this.supplies.bandages || 0) <= 0) return false; this.supplies.bandages--; hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * this.B.rest.bandageHeal)); return true; }
  buyVehicle(id) { const v = VEHICLES[id]; if (!v || this.gold < v.price) return false; if (v.act && this.act < v.act) return false; this.gold -= v.price; this.vehicle = id; return true; }
  /** Log loot so conversations can talk about it (found when, equipped or not, better/worse than what it replaced). */
  logLoot(item, { holder = null, equipped = false, replaced = null, delta = 0 } = {}) { const e = this.lootLog.find(l => l.itemId === item.id); if (e) { Object.assign(e, { holder: holder || e.holder, equipped, replaced: replaced || e.replaced, delta: delta || e.delta }); return e; } const l = { itemId: item.id, item, holder, day: this.day, equipped, replaced, delta }; this.lootLog.push(l); if (this.lootLog.length > 80) this.lootLog.shift(); return l; }
  // ---------- party
  classDef(id) { return this.d.classes.classes.find(c => c.id === id); }
  build(classId) { const list = this.d.builds.presets || this.d.builds.builds || (Array.isArray(this.d.builds) ? this.d.builds : Object.values(this.d.builds).flat()); return list.find?.(b => b.class === classId) || null; }
  makeHero(classId, name, level = 1, blueprint = null) { const h = createHero({ name, classId, level, classDef: this.classDef(classId), build: this.build(classId), blueprint, loot: this.loot, skills: this.d.skills.skills, rng: this.rng }); if (blueprint) { h.avatar = blueprint.avatar; h.voice = blueprint.voice; h.speech = blueprint.speech; h.short = blueprint.short || name.split(' ')[0]; h.pronouns = blueprint.pronouns; } h.short = h.short || name.split(' ')[0]; return h; }
  addHero(h) { if (this.party.length < this.partyLimit()) this.party.push(h); else this.bench.push(h); return h; }
  // ---------- the bench (round 21, E38) — rules in js/bench.js
  /** Most heroes the active party can hold (data/balance.json partySize.max). */
  partyLimit() { return partyLimit(this.d.balance); }
  /** The party only changes in a settlement. */
  inTown() { return this.node()?.type === 'town'; }
  /** Can this party member sit out? { ok, why } */
  canBench(id) { return canBench(this, id, { inTown: this.inTown() }); }
  /** Can this bench hero join (optionally in place of `swapWith`)? { ok, why, needsSwap } */
  canJoin(id, swapWith = null) { return canJoin(this, id, { limit: this.partyLimit(), inTown: this.inTown(), swapWith }); }
  /** Send a party member to the bench; their talent pets go with them. */
  benchHero(id) { const r = benchHero(this, id, { inTown: this.inTown() }); if (r.ok) this.benchCompanions ||= []; return r; }
  /** Bring a bench hero in, swapping somebody out when the party is full. */
  joinParty(id, swapWith = null) { const r = joinParty(this, id, { limit: this.partyLimit(), inTown: this.inTown(), swapWith }); if (r.ok) { this.benchCompanions ||= []; refresh(r.hero, this.loot); } return r; }
  /** Move everything a hero wears into the bag (for a benched hero whose kit the party needs). */
  takeGear(hero) { return takeGear(this, hero, (h, slot) => unequip(h, slot, this.loot)); }
  addCompanion(c) { if (this.companions.length < 4) { this.companions.push(c); c.speech = c.speech || { traits: ['loyal'] }; this.remember({ type: 'join', participants: [...this.party.map(h => h.id), c.id], bindings: { newcomer: { id: c.id }, place: { id: this.zoneId } }, details: { impression: 'brought food, which helped' } }); return true; } return false; }
  makeCompanion(def, level = null) { const L = Math.max(1, Math.round(level || this.avgLevel())); const P = def.power || 1; const hp = Math.round(30 * P + 8 * P * L); const c = { id: 'c_' + def.id + '_' + Math.random().toString(36).slice(2, 6), name: def.name, templateId: def.id, className: def.className || 'Companion', isCompanion: true, isHero: false, level: L, attrs: { ...(def.attrs || { STR: 8, DEX: 8, INT: 4, CON: 8 }) }, equipment: {}, skills: [], talents: {}, passiveRanks: {}, alive: true, statuses: [], cooldowns: {}, power: P, description: def.description, maxHp: hp, hp: hp, maxMp: 10, mp: 10, dmg: [Math.max(1, Math.round(3 + P + P * L)), Math.max(2, Math.round(5 + 2 * P + 1.5 * P * L))] }; return c; }
  avgLevel() { return this.party.length ? this.party.reduce((s, h) => s + h.level, 0) / this.party.length : 1; }
  alive() { return this.party.filter(h => h.alive && h.hp > 0); }
  fighters() { return [...this.party, ...this.companions].filter(x => x.alive); }
  // ---------- going down and getting back up (the four rules are written out above REVIVE)
  /** Is this hero somebody who can pick the fallen up? A healing role, or a heal/revive skill. */
  isHealer(h) { if (!h || !h.alive || h.hp <= 0) return false; const role = String(this.classDef(h.class)?.role || h.className || '').toLowerCase(); if (HEALER_CLASSES.includes(h.class) || /heal|priest|cleric|medic/.test(role)) return true; return (h.skills || []).some(id => ['heal', 'revive'].includes(this.d.skills?.skills?.[id]?.type)); }
  /** The living healers in the party, best (highest level) first. */
  healers() { return this.party.filter(h => this.isHealer(h)).sort((a, b) => b.level - a.level); }
  /** Party members who are down. */
  fallen() { return this.party.filter(h => !h.alive || h.hp <= 0); }
  /**
   * Bring one hero back. `by` is the party member who did it (the healer, or whoever tipped the flask
   * or carried them to the shrine) so both of them remember it and their feelings move. `how` is the
   * plain words that go into the memory and the log; `source` is which of the four rules applied.
   * Returns the `revivedBy` record, or null if the hero was not actually down.
   */
  revive(hero, { by = null, how = 'somebody would not let go', hpFrac = REVIVE.healerHp, source = 'healer' } = {}) {
    if (!hero) return null;
    const wasDown = !hero.alive || hero.hp <= 0;
    hero.alive = true; hero.hp = Math.max(1, Math.round(hero.maxHp * hpFrac)); hero.statuses = [];
    if (!wasDown) return null;
    const saviour = (by && by !== hero && by.alive) ? by : (this.party.find(h => h !== hero && h.alive && h.hp > 0) || null);
    hero.revivedBy = { by: saviour?.id || null, byName: saviour?.short || saviour?.name || null, how, source, day: this.day, where: this.zoneId, at: this.now };
    (this.revives ||= []).push({ hero: hero.id, heroName: hero.short, ...hero.revivedBy });
    if (this.revives.length > 40) this.revives.shift();
    if (saviour) this.remember({ type: 'revive', participants: [hero.id, saviour.id], bindings: { by: { id: saviour.id }, place: { id: this.zoneId } }, details: { how, source } });
    return hero.revivedBy;
  }
  /** Everyone who is down gets up the same way. Returns one record per hero actually raised. */
  reviveFallen(opts = {}) { const out = []; for (const h of this.fallen()) { const r = this.revive(h, opts); if (r) out.push({ hero: h, ...r }); } return out; }
  /** Companions are not heroes: a knocked-out pet always limps back after the fight. */
  reviveCompanions() { for (const c of this.companions) if (!c.alive || c.hp <= 0) { c.alive = true; c.hp = Math.max(1, Math.floor(c.maxHp * REVIVE.companionHp)); } }
  /** One line of plain English for the UI: what can get this party back on its feet right now. */
  reviveHelp() {
    const medic = this.healers()[0];
    return `A hero who falls stays down until somebody picks them up. ${medic ? `${medic.short} heals, so the fallen get up at ${Math.round(REVIVE.healerHp * 100)}% health after every fight and at camp.` : 'Nobody in this party heals, so you need a Revival Flask (or the Emberheart Draught) from a merchant, a shrine on the map, or a settlement cleric.'} Shrines and settlements wake and fully heal everyone. Losing a fight wakes the whole party in town at ${Math.round(REVIVE.defeatHp * 100)}% health, minus gold.`;
  }
  // ---------- map
  zone(id = this.zoneId) { return this.zones[id]; }
  node(id = this.nodeId, zoneId = this.zoneId) { return this.zone(zoneId)?.nodes.find(n => n.id === id); }
  nodeKey(n = this.node()) { return `${this.zoneId}:${n.id}`; }
  isVisited(nId) { return (this.visited[this.zoneId] || []).includes(nId); }
  isCleared(nId) { return this.cleared.includes(`${this.zoneId}:${nId}`); }
  isUsed(nId) { return this.usedNodes.includes(`${this.zoneId}:${nId}`); }
  /**
   * Nodes the party may travel to: only the ones joined to where they stand by a trail, in either
   * direction. There is no fast travel and no teleporting back — turning round and walking back the
   * way you came costs a move (and therefore a day's food) exactly like walking on.
   */
  reachable() { const cur = this.node(); if (!cur) return []; const z = this.zone(); const back = (z?.nodes || []).filter(n => (n.exits || []).includes(this.nodeId)).map(n => n.id); const set = new Set([...(cur.exits || []), ...back]); set.delete(this.nodeId); return [...set].filter(id => !!this.node(id)); }
  /** Every neighbour of a node, both directions — what the map draws as a walkable trail. */
  neighbours(nId = this.nodeId, zoneId = this.zoneId) { const z = this.zone(zoneId); if (!z) return []; const n = z.nodes.find(x => x.id === nId); const back = z.nodes.filter(x => (x.exits || []).includes(nId)).map(x => x.id); return [...new Set([...(n?.exits || []), ...back])].filter(id => id !== nId && z.nodes.some(x => x.id === id)); }
  canTravel(nId) { return this.reachable().includes(nId); }
  travel(nId) { if (!this.canTravel(nId)) return null; if (!this.spendLeg()) return null; this.nodeId = nId; this.nodesTravelled++; if (!this.isVisited(nId)) { this.stats.nodeTypes.push(this.node(nId)?.type); for (const q of Object.values(this.heroQuests)) { if (q.done) continue; if (q.objective.type === 'nodes') q.progress++; if (q.objective.type === 'node_types' && q.objective.types.includes(this.node(nId)?.type)) q.progress++; } } (this.visited[this.zoneId] ||= []).push(nId); this.visited[this.zoneId] = [...new Set(this.visited[this.zoneId])]; this.legGear = fireWorld('onLeg', this, this.bearers()); return this.node(); }
  nextZoneId(zoneId = this.zoneId) { return this.d.zoneTables.ZONE_UNLOCK_MAP[zoneId] || null; }
  unlockNextZone() { const nz = this.nextZoneId(); if (nz && !this.unlockedZones.includes(nz)) this.unlockedZones.push(nz); const bossAct = this.d.zoneTables.ACT_BOSS_ZONES[this.zoneId]; if (bossAct != null) { this.act = Math.max(this.act, bossAct); this.flags['act' + (bossAct - 1) + '_complete'] = true; } return nz; }
  startNodeId(zoneId) { const z = this.zone(zoneId); if (!z) return 'start'; if (z.nodes.some(n => n.id === 'start')) return 'start'; const targets = new Set(z.nodes.flatMap(n => n.exits || [])); return (z.nodes.find(n => !targets.has(n.id)) || z.nodes[0]).id; }
  enterZone(zoneId) { if (!this.unlockedZones.includes(zoneId)) return false; this.zoneId = zoneId; this.nodeId = this.startNodeId(zoneId); (this.visited[zoneId] ||= []).push(this.nodeId); this.act = Math.max(this.act, this.zone(zoneId).act); this.remember({ type: 'travel', participants: this.partyIds(), bindings: { place: { id: zoneId } }, details: {} }); return true; }
  townFor(zoneId = this.zoneId) { const act = Math.max(1, this.zone(zoneId)?.act || 1); return { id: 'town_act' + act, act, ...TOWNS[Math.min(6, act)] }; }
  /** What happens at a node: returns { kind, ... } for the UI to run. Memory rules: cleared combat stays cleared; one-shot nodes stay used. */
  enter(n = this.node()) {
    const key = `${this.zoneId}:${n.id}`; const first = !this.isUsed(n.id);
    if (n.type === 'town') return { kind: 'town', town: this.townFor(), node: n };
    if (n.type === 'heroquest') { if (this.isCleared(n.id)) return { kind: 'cleared', node: n }; let enc = n.encounter ? this.encounter(n.encounter) : null; if (enc && !countWordIn(n.name) && this.rng() < 0.4) enc = this.namedEncounter({ base: enc }) || enc; const q = this.heroQuests[n.questId]; return enc ? { kind: 'combat', node: n, encounter: enc, boss: false, named: enc.named || null, heroQuest: q } : { kind: 'quiet', node: n, text: `${q?.heroName}'s errand: ${q?.task}` }; }
    if (['combat', 'ambush', 'challenge', 'boss'].includes(n.type)) { if (this.isCleared(n.id)) return { kind: 'cleared', node: n }; let enc = this.encounter(n.encounter, n.type === 'boss');
      if (n.type === 'challenge' && enc && !countWordIn(n.name)) { const st = this.staticNamed()[0]; enc = this.namedEncounter({ staticDef: st || null, templateId: st ? null : enc.enemies[0]?.templateId, base: enc }) || enc; }
      // a named leader arrives with followers, which makes the fight bigger — never on a node whose
      // name already promised a head count ("Goblin Pair" must stay two goblins)
      else if (n.type !== 'boss' && enc && !countWordIn(n.name)) { const grudge = worldSum('nemesisChance', this, this.bearers()); const r = this.rng(); if (this.nemeses.length && r < NAMED.nemesisChance + grudge) enc = this.nemesisEncounter() || enc; else if (r < NAMED.chance + grudge) enc = this.namedEncounter({ base: enc }) || enc; }
      if (enc && !labelFits(n.name, enc.enemies.length)) enc.name = this.encounterLabel(enc);   // belt and braces: the fight renames itself rather than lie
      return { kind: 'combat', node: n, encounter: enc, boss: n.type === 'boss', named: enc?.named || null, label: enc ? this.encounterLabel(enc) : n.name }; }
    if (n.type === 'dialog') { if (!first) return { kind: 'quiet', node: n, text: 'Nothing more happens here.' };
      // a stranger with paying work turns up on the road now and then, instead of the usual scene
      const road = this.rng() < (this.d.roadQuests?.chance ?? 0) ? this.roadQuestEvent() : null;
      const ev = road || this.d.dialogs.DIALOG_EVENTS[n.dialogEventId] || this.randomEvent(); return ev ? { kind: 'event', node: n, event: ev } : { kind: 'quiet', node: n, text: n.name }; }
    if (n.type === 'shrine') { if (!first) return { kind: 'quiet', node: n, text: 'The shrine is silent now.' }; this.usedNodes.push(key); const t = n.shrineType || 'heal'; const raised = this.reviveFallen({ how: 'cold shrine water and old stone', hpFrac: REVIVE.shrineHp, source: 'shrine' }); this.reviveCompanions(); for (const h of [...this.party, ...this.companions]) { h.alive = true; h.hp = h.maxHp; if (t === 'fullrestore') h.mp = h.maxMp; } if (t === 'empower') this.flags.empowered = 1; return { kind: 'shrine', node: n, revived: raised, shrineType:t, text: t === 'heal' ? 'Cool water and old stone. Everyone is whole again.' : t === 'fullrestore' ? 'Body and mind restored.' : 'Strength hums in your limbs. Your next fight starts with a blessing.' }; }
    if (n.type === 'treasure') { if (!first) return { kind: 'quiet', node: n, text: 'The cache is empty.' }; this.usedNodes.push(key); const g = 60 + this.rng.int(0, 59); this.gold += g; const item = this.rng() < 0.5 ? this.loot.generate(this.rng.pick(['ring', 'necklace', 'light_chest', 'sword', 'wand']), 'magic', 'medium', { rng: this.rng }) : null; if (item) this.inventory.push(item); return { kind: 'treasure', node: n, gold: g, item }; }
    if (n.type === 'skillCheck') { if (!first) return { kind: 'quiet', node: n, text: 'Already dealt with.' }; return { kind: 'skillCheck', node: n, check: n.skillCheck }; }
    if (n.type === 'lore') { if (!first) return { kind: 'quiet', node: n, text: n.name }; this.usedNodes.push(key); return { kind: 'lore', node: n, text: this.loreText(n) }; }
    // A crossing is a travel hazard between two places: the party walks the stage, then picks how to
    // get past. The rules live in js/explore.js; the node stays passable once it has been beaten.
    if (n.type === 'crossing') { const c = this.crossingFor(n); if (!c) return { kind: 'quiet', node: n, text: n.name }; if (this.isCleared(n.id)) return { kind: 'quiet', node: n, text: `${c.name}: behind you now.` }; return { kind: 'crossing', node: n, crossing: c, failed: (this.crossings || []).some(x => x.id === c.id && x.zone === this.zoneId && !x.ok) }; }
    if (n.type === 'dungeon') { const dg = Object.values(this.d.dungeons.DUNGEONS).find(x => x.parentZone === this.zoneId); return dg ? { kind: 'dungeon', node: n, dungeon: dg, done: this.completedDungeons.includes(dg.id) } : { kind: 'quiet', node: n, text: n.name }; }
    return { kind: 'quiet', node: n, text: n.name };
  }
  /** The hazard waiting at a crossing node: whatever the map tool wrote on it, else one picked by name. */
  crossingFor(n) { const list = this.d.crossings?.crossings || []; if (!list.length) return null; return list.find(c => c.id === n.crossingId) || list[Math.abs(hashStr(`${this.zoneId}:${n.id}`)) % list.length]; }
  /** Mark a crossing beaten so the party can walk through it from now on. */
  clearCrossing(n) { const key = `${this.zoneId}:${n.id}`; if (!this.cleared.includes(key)) this.cleared.push(key); return key; }
  loreText(n) { const z = this.zone(); const acts = { 0: 'The road is quiet in the way roads are quiet just before they are not.', 1: 'Rot-rings in the fields, all the same size. Iris Vael would call it a pattern. The farmers call it Tuesday.', 2: 'The Ashen Veil worked here. You can tell by what is missing.', 3: 'Something in Hell is afraid. That is new.', 4: 'The sky is simply gone. What is left keeps its own counsel.', 5: 'This is where reality was made. It was not made carefully.', 6: 'Dragon-steel, three scales thick. The heart beneath still beats.' }; return `${n.name}. ${acts[z.act] || ''}`; }
  /** Resolve a node skill check with the party's best attribute + d20. */
  resolveSkillCheck(n) { const c = n.skillCheck; const read = h => derive(h, this.loot)[c.stat] ?? h.attrs[c.stat] ?? 8; const best = Math.max(...this.alive().map(read)); const statBonus = bestCheckBonus(this.alive(), c.stat, read); const roll = 1 + this.rng.int(0, 19); const ok = statBonus + roll >= c.dc; this.usedNodes.push(`${this.zoneId}:${n.id}`); if (ok) { if (c.success?.gold) this.gold += c.success.gold; if (c.success?.item) { const it = this.loot.generate(c.success.item, 'magic', 'medium', { rng: this.rng }); if (it) this.inventory.push(it); } } else if (c.failure?.hpLoss) for (const h of this.alive()) h.hp = Math.max(1, h.hp - c.failure.hpLoss); return { ok, roll, best, statBonus, dc: c.dc, stat: c.stat, text: ok ? c.success?.text : c.failure?.text }; }
  // ---------- encounters
  /**
   * A name for a fight worked out from the enemies actually standing there, so the label can never
   * promise a number the fight does not have. One kind of enemy gets "Lone goblin" / "Goblin pair" /
   * "Goblin trio" / "Goblin band (5)"; a mixed group is listed out.
   */
  encounterLabel(enc) {
    const foes = enc?.enemies || []; if (!foes.length) return enc?.name || 'Nothing at all';
    if (enc.named) return `${enc.named.name}${foes.length > 1 ? ' and followers' : ''}`;
    const counts = new Map(); for (const e of foes) { const k = String(e.name || '').replace(/^Champion /, ''); counts.set(k, (counts.get(k) || 0) + 1); }
    if (counts.size === 1) { const [name, n] = [...counts][0]; return n === 1 ? `Lone ${name}` : n === 2 ? `${name} pair` : n === 3 ? `${name} trio` : `${name} band (${n})`; }
    return [...counts].map(([name, n]) => n > 1 ? `${n} ${name}s` : name).join(' and ');
  }
  encounter(id, boss = false) { const enc = this.d.encounters.encounters[id]; if (!enc) return null; const foes = []; let i = 0; const heroes = Math.max(1, this.party.length); enc.enemies.forEach((g, gi) => { for (let k = 0; k < (g.count || 1); k++) { const tpl = this.d.enemies.entities[g.ref] || this.d.bosses.entities[g.ref]; if (!tpl) continue; const isBoss = boss && (gi === 0) && (!!this.d.bosses.entities[g.ref] || g.count === 1); const e = makeEnemy(tpl, { act: Math.max(1, this.act), heroes, ngPlus: this.ngPlus, boss: isBoss, overrides: g.overrides || {}, index: i++ }); e.group = gi; if (this.rng() < CHAMPION.chance + CHAMPION.perAct * Math.max(0, this.act - 1) && !isBoss) { e.champion = true; e.maxHp = Math.round(e.maxHp * CHAMPION.hp); e.hp = e.maxHp; e.dmg = e.dmg.map(x => Math.round(x * CHAMPION.damage)); e.name = 'Champion ' + e.name; applySpawnMods(e, 'champion', this.rng.shuffle([...CHAMPION_MODS]).slice(0, this.rng() < 0.5 ? 1 : 2)); } foes.push(e); } }); return { id, name: enc.name, enemies: foes }; }
  // ---------- named enemies (super-uniques, random names, nemeses)
  named() { return this.d.named || { static: [], modifiers: { tough: '+8 armor', fast: 'acts twice' }, titles: ['the Cruel', 'the Loud'], syllables: { human: ['Mor', 'Vel'] }, suffixes: { human: ['wick', 'gan'] } }; }
  raceOf(templateId) { if (/goblin|kobold/.test(templateId)) return 'goblin'; if (/demon|imp|fiend|hell|fel|archfiend/.test(templateId)) return 'demon'; if (/skeleton|ghoul|wraith|lich|undead|bone|shade|wight/.test(templateId)) return 'undead'; if (/wolf|bear|spider|hound|drake|dragon|wyrm|worm|horror|titan|elemental|golem/.test(templateId)) return 'beast'; if (/void|star|cosmic|reality|shard|prophet|null/.test(templateId)) return 'void'; return 'human'; }
  // ---------- enemy families: what kind of thing a fight is made of
  // A toll on the road is collected by somebody with hands. data/enemy-families.json says which
  // enemies are people, which encounters are made of people, and which road band to call on when a
  // zone's own pool has nobody suitable — so a bandit demanding a toll can no longer whistle up four
  // cinder hounds.
  /** 'humanoid' | 'beast' | 'undead' | 'construct' | 'horror' for one enemy template. */
  familyOf(templateId) { const known = this.d.families?.enemies?.[templateId]; if (known) return known; const r = this.raceOf(templateId); return r === 'goblin' || r === 'human' || r === 'demon' ? 'humanoid' : r === 'beast' ? 'beast' : r === 'undead' ? 'undead' : 'horror'; }
  /** The family of a whole encounter: the one every group shares, else what most of the bodies are. */
  encounterFamily(encId) { const enc = this.d.encounters.encounters[encId]; if (!enc) return null; const counts = {}; for (const g of enc.enemies || []) counts[this.familyOf(g.ref)] = (counts[this.familyOf(g.ref)] || 0) + (g.count || 1); const list = Object.entries(counts).sort((a, b) => b[1] - a[1]); return list.length ? list[0][0] : null; }
  /** Encounter ids of one family the party could meet here: the zone's own pool first, then the road bands. */
  encountersOfFamily(family, act = this.act) {
    const pool = (this.d.zones.ZONE_ENCOUNTER_POOLS[this.zoneId] || []).filter(id => this.encounterFamily(id) === family);
    if (pool.length) return pool;
    const bands = this.d.families?.roadBandsByAct || {};
    for (let a = Math.max(0, Math.round(act)); a >= 0; a--) { const list = (bands[String(a)] || []).filter(id => this.d.encounters.encounters[id]); if (list.length) return list; }
    return Object.keys(this.d.encounters.encounters).filter(id => this.encounterFamily(id) === family).slice(0, 4);
  }
  /** One fight against people, scaled to the act. Used by tolls, bandits and the road's gate keepers. */
  humanoidFight(rng = this.rng) { const ids = this.encountersOfFamily('humanoid'); return ids.length ? rng.pick(ids) : null; }
  /** Does this event want a fight against people? (data/enemy-families.json humanoidEvents) */
  isHumanoidEvent(ev) { const H = this.d.families?.humanoidEvents; if (!ev || !H) return false; const id = String(ev.id || ''); if (ev.enemyFamily) return ev.enemyFamily === 'humanoid'; if ((H.ids || []).includes(id)) return true; return (H.prefixes || []).some(p => id === p || id.startsWith(p + '_')); }
  /**
   * Turn whatever an event wrote on `startCombat` into an encounter id the game can actually run.
   * The original data says `startCombat: true` — "fight whoever we were just talking to" — which used
   * to resolve to nothing at all. A toll or bandit event now gets a humanoid band; anything else gets
   * something out of the zone's pool.
   */
  combatFor(ev, startCombat, rng = this.rng) {
    if (!startCombat) return null;
    if (typeof startCombat === 'string' && this.d.encounters.encounters[startCombat]) return startCombat;
    const family = ev?.enemyFamily || (this.isHumanoidEvent(ev) ? 'humanoid' : null);
    if (family) { const ids = this.encountersOfFamily(family); if (ids.length) return rng.pick(ids); }
    const pool = this.d.zones.ZONE_ENCOUNTER_POOLS[this.zoneId] || [];
    return pool.length ? rng.pick(pool) : (typeof startCombat === 'string' ? startCombat : null);
  }
  /** Random named enemy built on a template: name from syllables, a title, 1–2 modifiers, +50% hp/+25% dmg, better loot. */
  namedEnemy(templateId, { rng = this.rng, mods = null, name = null, title = null, staticId = null } = {}) {
    const tpl = this.d.enemies.entities[templateId] || this.d.bosses.entities[templateId]; if (!tpl) return null; const N = this.named(); const race = this.raceOf(templateId);
    const nm = name || (rng.pick(N.syllables[race] || N.syllables.human) + rng.pick(N.suffixes[race] || N.suffixes.human)); const tt = title ?? (rng() < 0.7 ? rng.pick(N.titles) : '');
    const e = makeEnemy(tpl, { act: Math.max(1, this.act), heroes: Math.max(1, this.party.length), ngPlus: this.ngPlus, overrides: {}, index: 90 + Math.floor(rng() * 9) }); const chosen = mods || rng.shuffle(Object.keys(N.modifiers)).slice(0, rng() < 0.5 ? 1 : 2);
    e.named = true; e.staticId = staticId; e.baseName = tpl.name; e.name = nm + (tt ? ' ' + tt : ''); e.short = nm; e.title = tt; e.mods = chosen; e.maxHp = Math.round(e.maxHp * NAMED.hp); e.hp = e.maxHp; e.dmg = e.dmg.map(x => Math.round(x * NAMED.damage)); e.xpValue = Math.round(e.xpValue * NAMED.xp); e.gold = e.gold.map(x => Math.round(x * NAMED.gold));
    applySpawnMods(e, 'named', chosen);
    return e;
  }
  /** Companion ids a hero has unlocked with talents (skills.json `unlocksCompanion`). */
  unlockedPets(hero) { const out = new Set(); for (const id of hero.skills || []) { const sk = this.d.skills.skills[id]; for (const t of sk?.talents || []) if (hero.talents?.[t.id] && t.effect?.unlocksCompanion) out.add(t.effect.unlocksCompanion); } return [...out]; }
  staticNamed(zoneId = this.zoneId) { return this.named().static.filter(n => n.zone === zoneId && !this.namedSlain.includes(n.id)); }
  /** Build a named-led encounter: the named enemy plus followers from the base encounter (or the zone pool). */
  namedEncounter({ staticDef = null, templateId = null, base = null, rng = this.rng } = {}) {
    const pool = this.d.zones.ZONE_ENCOUNTER_POOLS[this.zoneId] || []; const enc = base || this.encounter(rng.pick(pool)) || { id: 'named', name: 'named', enemies: [] }; const tid = staticDef?.base || templateId || enc.enemies[0]?.templateId; if (!tid) return null;
    const leader = staticDef ? this.namedEnemy(tid, { rng, mods: staticDef.mods, name: staticDef.name, title: staticDef.title, staticId: staticDef.id }) : this.namedEnemy(tid, { rng }); if (!leader) return null; leader.look = staticDef?.look || null; leader.lore = staticDef?.lore || null; leader.group = 0;
    const followers = enc.enemies.slice(0, leader.mods.includes('summoner') ? 4 : 2); enc.enemies = [leader, ...followers]; enc.name = `${leader.name}${followers.length ? ' and followers' : ''}`; enc.named = leader; if (!this.namedSeen.includes(leader.name)) this.namedSeen.push(leader.name); return enc;
  }
  /** A nemesis is a named enemy that beat the party. It escapes and comes back stronger in name (a new title), same power. */
  addNemesis(leader) { const ex = this.nemeses.find(n => n.name === leader.short || n.name === leader.name); const N = this.named(); if (ex) { ex.defeats++; ex.title = ex.defeats >= 3 ? 'the Unkillable' : ex.defeats === 2 ? 'the Twice-Victorious' : ex.title; return ex; } const n = { name: leader.short || leader.name, title: leader.title || '', templateId: leader.templateId, mods: leader.mods || [], staticId: leader.staticId || null, look: leader.look || null, defeats: 1, zone: this.zoneId, sinceDay: this.day }; n.title = n.title || N.titles[Math.floor(this.rng() * N.titles.length)]; this.nemeses.push(n); this.remember({ type: 'nemesis', participants: this.partyIds(), bindings: { foe: { id: leader.templateId }, place: { id: this.zoneId } }, details: { name: n.name + ' ' + n.title, outcome: 'beat_us' } }); return n; }
  nemesisEncounter(rng = this.rng) { const cand = this.nemeses.filter(n => this.zone(n.zone)?.act <= (this.zone().act || 0) + 1); if (!cand.length) return null; const n = rng.pick(cand); const enc = this.namedEncounter({ templateId: n.templateId, rng }); if (!enc) return null; const L = enc.named; L.short = n.name; L.title = n.title; L.name = `${n.name} ${n.title}`.trim(); L.mods = n.mods; L.nemesis = n; L.look = n.look; enc.name = `${L.name} returns`; enc.nemesis = n; return enc; }
  /** After a combat with a named leader: slain → memory + bounty progress; escaped (party lost) → nemesis. */
  resolveNamed(enc, won) { const L = enc.named; if (!L) return null; if (won) { this.namedSlain.push(L.staticId || L.name); this.nemeses = this.nemeses.filter(n => n.name !== L.short && n.name !== L.name); this.remember({ type: 'nemesis', participants: this.partyIds(), bindings: { foe: { id: L.templateId }, place: { id: this.zoneId } }, details: { name: L.name, outcome: 'slain' } }); this.checkSideQuests(); return { slain: L }; } return { nemesis: this.addNemesis(L) }; }
  // ---------- hero (class) quests: the hero asks at camp, the party tracks it, a quest node appears on the map
  classQuestsFor(hero) { return (this.d.classQuests?.quests?.[hero.class] || []).filter(q => !this.stats.heroQuestsDone?.includes(q.id)); }
  /** Start a personal quest for a hero (if none active). Adds a violet quest node branching off the current node. Returns the quest. */
  startHeroQuest(hero, rng = this.rng) { if (Object.values(this.heroQuests).some(q => q.heroId === hero.id && !q.done)) return null; const opts = this.classQuestsFor(hero); if (!opts.length) return null; const def = rng.pick(opts); const q = { ...def, heroId: hero.id, heroName: hero.short, progress: 0, done: false, day: this.day, nodeId: null }; this.heroQuests[def.id] = q;
    const z = this.zone(); const cur = this.node(); if (z && cur) { const id = `hq_${def.id}_${this.day}`; const pool = this.d.zones.ZONE_ENCOUNTER_POOLS[this.zoneId] || []; const node = { id, type: 'heroquest', name: `${hero.short}'s errand`, x: cur.x, y: cur.y, exits: [...(cur.exits || [])], encounter: pool.length ? rng.pick(pool) : null, questId: def.id, added: true }; z.nodes.push(node); cur.exits = [...(cur.exits || []), id]; q.nodeId = id; }
    this.remember({ type: 'skill', participants: [hero.id], bindings: { skill: { id: (def.objective.skills || [])[0] || 'fireball' }, teacher: { id: hero.id } }, details: {} }); return q; }
  activeHeroQuest(hero) { return Object.values(this.heroQuests).find(q => q.heroId === hero.id && !q.done) || null; }
  /** Feed combat facts into quest progress. combat: the Combat instance after a fight; enc; won. */
  trackFight(combat, enc, won) { if (!won) return; const recs = this.meter.fight()?.records || []; const anyDown = recs.some(r => r.kind === 'death' && this.party.some(h => h.id === r.target)); if (!anyDown) this.stats.fightsUnbroken++;
    for (const q of Object.values(this.heroQuests)) { if (q.done) continue; const o = q.objective; const mine = recs.filter(r => r.source === q.heroId);
      if (o.type === 'skill_kills') q.progress += mine.filter(r => r.kind === 'damage' && r.killingBlow && o.skills.some(s => r.via === 'skill:' + s)).length; if (o.type === 'skill_hits') q.progress += mine.filter(r => r.kind === 'damage' && o.skills.some(s => r.via === 'skill:' + s)).length; if (o.type === 'skill_uses') q.progress += (combat?.log || []).filter(ev => ev.type === 'skill' && ev.source?.id === q.heroId && o.skills.includes(ev.skill)).length; if (o.type === 'skill_heal') q.progress += mine.filter(r => r.kind === 'heal' && o.skills.some(s => r.via === 'skill:' + s)).reduce((a, r) => a + r.amount, 0); if (o.type === 'heal') q.progress += mine.filter(r => r.kind === 'heal').reduce((a, r) => a + r.amount, 0); if (o.type === 'crits') q.progress += mine.filter(r => r.kind === 'damage' && r.crit).length; if (o.type === 'statuses') q.progress += mine.filter(r => r.kind === 'status').length; if (o.type === 'status_type') q.progress += mine.filter(r => r.kind === 'status' && r.status === o.status).length; if (o.type === 'weapon_kills') { const w = this.party.find(h => h.id === q.heroId)?.equipment?.weapon; if (w && o.subs.includes(w.subtype)) q.progress += mine.filter(r => r.kind === 'damage' && r.killingBlow && r.via === 'attack').length; } if (o.type === 'kills_tag') q.progress += mine.filter(r => r.kind === 'damage' && r.killingBlow && o.tags.some(t => new RegExp(t === 'undead' ? 'skeleton|ghoul|wraith|lich|undead|bone|shade|wight' : t === 'demon' ? 'demon|imp|fiend|hell|fel' : t === 'cult' ? 'cult|sorcerer|prophet|acolyte' : t).test(r.target))).length; if (o.type === 'named_kills' && enc?.named) q.progress++; if (o.type === 'fights_unbroken' && !anyDown) q.progress++; }
    return this.completeHeroQuests(); }
  /** Threads: objectives the host reports (town visit, named kill, rest…). */
  threadEvent(type) { for (const st of Object.values(this.threads)) { if (st.done || !st.objective || st.objectiveDone) continue; if (st.objective.type === type) st.objectiveDone = true; } }
  trackEvent(type, n = 1) { if (type === 'rest') this.threadEvent('rest'); if (type === 'rest') this.stats.rests++; if (type === 'salvage') this.stats.salvaged++; if (type === 'loot') this.stats.looted += n; for (const q of Object.values(this.heroQuests)) { if (q.done) continue; const o = q.objective; if (o.type === 'rests' && type === 'rest') q.progress++; if (o.type === 'salvage' && type === 'salvage') q.progress++; if (o.type === 'loot' && type === 'loot') q.progress += n; } return this.completeHeroQuests(); }
  completeHeroQuests() { const done = []; for (const q of Object.values(this.heroQuests)) { if (q.done || q.progress < q.objective.n) continue; q.done = true; (this.stats.heroQuestsDone ||= []).push(q.id); const hero = this.party.find(h => h.id === q.heroId); if (hero) { const r = q.reward; if (r.talent) hero.pendingTalent += r.talent; if (r.xp) gainXp(hero, r.xp); if (r.gold) this.gold += r.gold; if (r.item) { const keys = r.item.category === 'weapon' ? ['sword', 'dagger', 'bow', 'staff', 'wand', 'hammer', 'rapier', 'shortbow'] : ['ring', 'necklace']; const it = this.loot.generate(this.rng.pick(keys), r.item.rarity || 'rare', 'high', { rng: this.rng }); if (it) { it.name = `${hero.short}'s ${it.baseName}`; this.inventory.push(it); this.logLoot(it, { holder: hero.id }); q.rewardItem = it; } } refresh(hero, this.loot); this.remember({ type: 'levelup', participants: [hero.id], bindings: {}, details: { level: hero.level, quest: q.title } }); for (const o of this.party) if (o !== hero) { const rel = this.relations.get(o.id, hero.id); rel.apply(rel.opinion() >= 0 ? 'skill_seen' : 'mockery', { now: this.now }); } } if (q.nodeId) { const z = this.zone(); const n = z?.nodes.find(x => x.id === q.nodeId); if (n) n.done = true; } done.push(q); } return done; }
  /** Party reactions to a finished hero quest: warm friends congratulate, cold ones sneer (intent per relationship). */
  reactionsTo(hero) { return this.party.filter(o => o !== hero && o.alive).map(o => ({ who: o, intent: this.relations.get(o.id, hero.id).opinion() >= 0.1 ? 'compliment' : this.relations.get(o.id, hero.id).opinion() <= -0.15 ? 'insult' : 'agree' })); }
  // ---------- side quests (bounty board)
  sideQuests() { return (this.d.sideQuests?.quests || []).filter(q => q.act <= Math.max(1, this.act)); }
  /** Every bounty the game knows about, town board and road offers together. */
  allSideQuests() { return [...(this.d.sideQuests?.quests || []), ...(this.questOffers || [])]; }
  questById(id) { return this.allSideQuests().find(q => q.id === id) || null; }
  acceptSideQuest(id) { if (!this.quests.active.includes(id) && !this.quests.done.includes(id)) this.quests.active.push(id); }
  // ---------- road quests: a stranger with a job, offered on a dialog node instead of a random event
  // Better paid than the town board (you have to be out there to be offered one), aimed at a real
  // uncleared node, and an ordinary side quest the moment it is accepted. Data: data/road-quests.json.
  /** Road quests already taken and not yet finished. */
  openRoadQuests() { return (this.questOffers || []).filter(q => this.quests.active.includes(q.id)); }
  /** A node worth sending somebody to: uncleared, not the boss, not the settlement, in an open zone. */
  roadQuestTarget(types, rng = this.rng) {
    const zoneIds = this.unlockedZones.filter(z => this.zones[z]);
    const taken = new Set(this.allSideQuests().map(q => `${q.zone}:${q.targetNode}`));
    const cand = [];
    for (const zid of zoneIds) for (const n of this.zones[zid].nodes) {
      if (!types.includes(n.type) || n.added && n.type === 'heroquest') continue;
      const key = `${zid}:${n.id}`; if (this.cleared.includes(key) || taken.has(key)) continue;
      cand.push({ zone: zid, node: n });
    }
    return cand.length ? rng.pick(cand) : null;
  }
  /** Build (and file) a road quest from one of the offers in data/road-quests.json. */
  makeRoadQuest(rng = this.rng) {
    const R = this.d.roadQuests; if (!R?.offers?.length) return null; this.questOffers ||= [];
    if (this.openRoadQuests().length >= (R.maxOpen ?? 2)) return null;
    const act = Math.max(0, this.act);
    const pool = R.offers.filter(o => (o.minAct ?? 0) <= act && (o.maxAct == null || act <= o.maxAct));
    if (!pool.length) return null;
    const offer = rng.pick(pool);
    const target = this.roadQuestTarget(offer.targets || ['combat'], rng); if (!target) return null;
    const gold = Math.round(((R.goldBase ?? 90) + (R.goldPerAct ?? 130) * Math.max(1, act)) * (offer.pay ?? 1));
    const name = target.node.name;
    const q = { id: `rq_${offer.id}_${this.day}_${this.questOffers.length}`, title: offer.title, act, zone: target.zone,
      targetNode: target.node.id, targetName: name, zoneName: this.zones[target.zone]?.name || target.zone,
      text: String(offer.text).replace('{target}', name), gold, road: true, from: offer.npcName, offerId: offer.id, day: this.day };
    this.questOffers.push(q);
    return { quest: q, offer };
  }
  /**
   * A dialog-node event in the shape the event runner already understands: an NPC with lines and two
   * answers. Taking the job files it as an active side quest and puts a marker on the map.
   */
  roadQuestEvent(rng = this.rng) {
    const made = this.makeRoadQuest(rng); if (!made) return null;
    const { quest: q, offer } = made; const fill = t => String(t).replace(/\{target\}/g, q.targetName);
    return {
      id: 'roadquest_' + q.id, npcName: offer.npcName, role: offer.role || 'villager', roadQuest: q,
      lines: (offer.lines || []).map(l => ({ ...l, text: fill(l.text) })),
      choices: [{ text: `Take the job (${q.gold} gold)`, outcome: 'accept' }, { text: 'Not our road.', outcome: 'decline' }],
      outcomes: { accept: { text: fill(offer.accept), reward: { roadQuest: q.id } }, decline: { text: fill(offer.decline) } },
    };
  }
  /** Where the map should draw a quest marker: every accepted job that names a place. */
  questMarkers(zoneId = this.zoneId) {
    const out = [];
    for (const id of this.quests.active) { const q = this.questById(id); if (q?.targetNode && q.zone === zoneId) out.push({ nodeId: q.targetNode, title: q.title, kind: q.road ? 'road' : 'bounty', text: q.text, gold: q.gold }); }
    for (const q of Object.values(this.heroQuests)) if (!q.done && q.nodeId && this.node(q.nodeId, zoneId)) out.push({ nodeId: q.nodeId, title: `${q.heroName}'s errand: ${q.title}`, kind: 'errand', text: q.task });
    for (const mq of MAIN_QUESTS) { if (!this.quests.active.includes(mq.id)) continue; const n = this.zone(zoneId)?.nodes.find(x => x.id === mq.boss); if (n) out.push({ nodeId: n.id, title: mq.title, kind: 'story', text: mq.text }); }
    return out;
  }
  checkSideQuests() { const done = []; for (const id of [...this.quests.active]) { const q = this.questById(id); if (!q) continue; let ok = false; if (q.targetNode) ok = this.cleared.includes(`${q.zone}:${q.targetNode}`); if (q.targetEncounter) ok = (this.flags['enc_' + q.targetEncounter] || 0) > 0; if (q.targetNamed) ok = this.namedSlain.length >= q.targetNamed; if (ok) { this.quests.active = this.quests.active.filter(x => x !== id); this.quests.done.push(id); this.gold += q.gold; this.fame += Math.round(q.gold / 20); done.push(q); } } return done; }
  /** Journal: each hero's strongest memories as prose lines (needs a lingo instance), plus the day log. */
  journal(lingo, talk) { const out = []; for (const h of this.party) { const bank = this.banks[h.id]; if (!bank) continue; const sp = talk.speaker(h); const lines = bank.list(this.now).slice(0, 6).map(({ memory }) => { try { return lingo.speakAbout(memory, bank, this.now, { speaker: sp, scene: talk.scene(this.zoneId) }).text; } catch { return null; } }).filter(Boolean); out.push({ hero: h, lines }); } return out; }
  /** A night raid from the zone's pool, sized by vehicle difficulty. */
  /** Night-raid knobs from balance.json `world.nightRaid`. */
  nightRaid() { const N = { extra: 1, extraFromAct: 2, hp: 1.1, damage: 1.05, xp: 1.6, gold: 1.7, dropChance: 0.5, namedChance: 0.35, ...(this.B.nightRaid || {}) }; if ((this.zone()?.act ?? 0) < (N.extraFromAct ?? 0)) N.extra = 0; return N; }
  /**
   * A night raid from the zone's pool. Sleeping on the road is the dangerous way to travel, so a raid
   * is deliberately worse than the same fight in daylight — more bodies (the vehicle still counts, a
   * war wagon still thins them out), tougher bodies, and a better chance of a named leader — and it
   * pays better, which victory() applies from the same knobs.
   */
  nightEncounter() { const pool = this.d.zones.ZONE_ENCOUNTER_POOLS[this.zoneId] || []; if (!pool.length) return null; const enc = this.encounter(this.rng.pick(pool)); if (!enc) return null; const N = this.nightRaid();
    const diff = this.vehicleDef().difficulty + (N.extra || 0);
    if (diff < 0 && enc.enemies.length > 1) enc.enemies = enc.enemies.slice(0, Math.max(1, enc.enemies.length + diff));
    if (diff > 0) { const extra = []; for (let i = 0; i < diff; i++) { const src = enc.enemies[i % enc.enemies.length]; extra.push({ ...JSON.parse(JSON.stringify(src)), id: src.id + '_n' + i, statuses: [], cooldowns: {} }); } enc.enemies.push(...extra); }
    const harden = e => { e.maxHp = Math.round(e.maxHp * N.hp); e.hp = e.maxHp; e.dmg = e.dmg.map(x => Math.round(x * N.damage)); return e; };
    if (this.rng() < N.namedChance) { const led = this.nemeses.length && this.rng() < 0.5 ? this.nemesisEncounter() : this.namedEncounter({ base: enc }); if (led) { led.night = true; for (const e of led.enemies) if (!e.named) harden(e); led.name = 'Night raid: ' + this.encounterLabel(led); return led; } }
    for (const e of enc.enemies) harden(e);
    enc.night = true; enc.name = 'Night raid: ' + (labelFits(enc.name, enc.enemies.length) ? enc.name : this.encounterLabel(enc)); return enc; }
  /** After a victory: xp, gold, fame, drops; marks node cleared; boss → unlock next zone + quests. Returns a summary. */
  victory(node, enc, { revisit = false, bonusGold = 0 } = {}) {
    const alive = this.alive(); const avg = this.avgLevel(); const xpFind = alive.reduce((s, h) => s + (h.derived?.xpFind || 0), 0), goldFind = alive.reduce((s, h) => s + (h.derived?.goldFind || 0), 0) + (bonusGold || 0), magicFind = alive.reduce((s, h) => s + (h.derived?.magicFind || 0), 0);
    // A night raid is harder than the same fight in daylight, so it pays more: the multipliers and the
    // extra roll on the drop table are the other half of nightEncounter()'s difficulty bump.
    const NR = this.nightRaid(); const nightXp = enc.night ? NR.xp : 1, nightGold = enc.night ? NR.gold : 1;
    let xp = 0, gold = 0; const drops = []; for (const e of enc.enemies) { xp += Math.round(e.xpValue * (1 + xpFind) * ECONOMY.xp * nightXp); gold += Math.round(this.rng.int(e.gold[0], e.gold[1]) * (1 + goldFind) * ECONOMY.gold * nightGold); this.kills++; const it = this.loot.zoneDrop(this.zoneId, this.rng, { revisit, magicFind, act: Math.max(1, this.act) }); if (it) drops.push(it); }
    if (enc.night && this.rng() < (NR.dropChance || 0)) { const it = this.loot.zoneDrop(this.zoneId, this.rng, { revisit, magicFind: magicFind + 0.1, act: Math.max(1, this.act) }); if (it) drops.push(it); }
    const levelUps = []; for (const h of this.party) { if (!h.alive) continue; const got = Math.round(xp * catchUp(h.level, avg)); const ups = gainXp(h, got); if (ups) { refresh(h, this.loot); h.hp = h.maxHp; h.mp = h.maxMp; levelUps.push({ hero: h, ups }); this.remember({ type: 'levelup', participants: [h.id], bindings: {}, details: { level: h.level } }); } }
    const isBoss = node?.type === 'boss'; const fameMult = this.d.zoneTables.ZONE_FAME_MULT[this.zoneId] || 1; const fame = Math.round(enc.enemies.length * fameMult) + (isBoss ? Math.round(15 * fameMult) : 0); this.fame += fame; this.gold += gold;
    for (const it of drops) { this.inventory.push(it); if (['rare', 'legendary'].includes(it.rarity)) this.rareFound++; }
    if (node) this.cleared.push(`${this.zoneId}:${node.id}`); if (enc.id) this.flags['enc_' + enc.id] = (this.flags['enc_' + enc.id] || 0) + 1;
    const ids = this.partyIds(); const foe = enc.enemies[0]?.templateId; const wounded = this.party.some(h => h.hp <= h.maxHp / 2);
    this.remember({ type: 'combat', participants: ids, bindings: { foe: { id: foe, count: enc.enemies.length }, place: { id: this.zoneId }, ally: { id: ids[1] || ids[0] } }, details: { outcome: 'won', wounded, night: !!enc.night, boss: !!node && node.type === 'boss' } });
    for (const h of this.party) { if (!h.alive) this.remember({ type: 'wounded', participants: [h.id], bindings: { foe: { id: foe, count: 1 }, place: { id: this.zoneId } }, details: { down: true } }); else if (h.hp <= h.maxHp / 2) this.remember({ type: 'wounded', participants: [h.id], bindings: { foe: { id: foe, count: 1 }, place: { id: this.zoneId } }, details: { down: false } }); }
    for (const h of [...this.party, ...this.companions]) { const k = enc.killsBy?.[h.id] || 0; if (k > 0) this.remember({ type: 'kill', participants: [h.id], bindings: { foe: { id: foe, count: k }, place: { id: this.zoneId } }, details: { how: k >= 3 ? 'a long ugly struggle' : 'a clean stroke' } }); }
    // gear that reacts to a won fight: forage, kill memories, feelings, a blade earning its name
    this.winGear = this.bearers().flatMap(h => fireWorld('onWin', this, [h], { enc, node, foe, kills: enc.killsBy?.[h.id] || 0 }));
    if (drops.length) this.trackEvent('loot', drops.length);
    for (const it of drops) { const finder = this.alive()[Math.floor(this.rng() * Math.max(1, this.alive().length))]; this.logLoot(it, { holder: finder?.id || null }); this.remember({ type: 'loot', participants: ids, bindings: { item: { id: it.baseKey }, place: { id: this.zoneId } }, details: { worth: it.rarity === 'legendary' ? 'a fortune' : it.rarity === 'rare' ? 'more than it looked' : 'a few coins', itemName: it.name } }); }
    let bossDrops = [], unlockedZone = null, questDone = null; const namedResult = this.resolveNamed(enc, true); if (namedResult?.slain) { this.threadEvent('named'); const extra = this.loot.generate(this.rng.pick(['sword', 'heavy_chest', 'ring', 'necklace', 'staff', 'bow']), this.rng() < 0.3 ? 'legendary' : 'rare', 'high', { rng: this.rng }); if (extra) { extra.name = `${namedResult.slain.short}'s ${extra.baseName}`; drops.push(extra); this.inventory.push(extra); this.logLoot(extra); } } const sideDone = this.checkSideQuests();
    if (isBoss) { const bossId = enc.enemies.find(e => e.boss)?.templateId; if (bossId && !this.completedBosses.includes(node.id)) { this.completedBosses.push(node.id); this.completedBosses.push(bossId); bossDrops = this.loot.bossLoot(bossId, this.rng); this.inventory.push(...bossDrops); } unlockedZone = this.unlockNextZone(); const q = MAIN_QUESTS.find(q => q.boss === node.id); if (q && !this.quests.done.includes(q.id)) { this.quests.done.push(q.id); this.quests.active = this.quests.active.filter(x => x !== q.id); questDone = q; const next = MAIN_QUESTS.find(x => x.act === q.act + 1); if (next) this.quests.active.push(next.id); } }
    // Who gets back up: only a living healer, and only if the party has one. Everyone else stays down
    // until a flask, a shrine or a settlement — see the REVIVE block at the top of this file.
    const medic = this.healers()[0] || null;
    const revived = medic ? this.reviveFallen({ by: medic, how: `${medic.short} would not let go`, hpFrac: REVIVE.healerHp, source: 'healer' }) : [];
    this.reviveCompanions();
    return { xp, gold, fame, drops, bossDrops, levelUps, unlockedZone, questDone, namedSlain: namedResult?.slain || null, sideDone, revived, stillDown: this.fallen() };
  }
  /** Losing is not the end: the party wakes in the nearest settlement, lighter by some gold. */
  defeat(enc = null) { if (enc?.named) this.resolveNamed(enc, false); const D = this.B.defeat; const raised = this.reviveFallen({ how: 'strangers carried you into town', hpFrac: D.hpAfter ?? REVIVE.defeatHp, source: 'town' }); for (const h of this.party) { h.alive = true; h.hp = Math.max(1, Math.floor(h.maxHp * D.hpAfter)); h.mp = Math.floor(h.maxMp * 0.5); } this.reviveCompanions(); for (const c of this.companions) { c.alive = true; c.hp = Math.max(1, Math.floor(c.maxHp * D.hpAfter)); } this.defeatRevived = raised;this.gold = Math.floor(this.gold * D.goldKept); const town = this.zone().nodes.find(n => n.type === 'town'); this.nodeId = town ? town.id : this.startNodeId(); return { text: 'You wake in town with lighter purses and heavier heads.', lost: '15% of your gold' }; }
  // ---------- events (dialog + random)
  randomEvent() { const lvl = Math.round(this.avgLevel()); const pool = this.d.randomEvents.RANDOM_EVENTS.filter(e => e.minLevel <= lvl && (e.zone === 'any' || (Array.isArray(e.zone) ? e.zone.includes(this.zoneId) : e.zone === this.zoneId)) && !this.seenEvents.includes(e.id)); if (!pool.length) return null; const ev = this.rng.pick(pool); this.seenEvents.push(ev.id); return ev; }
  choiceAllowed(c) { const r = c.requires; if (!r) return true; if (r.inventoryItem) return this.inventory.some(i => i.baseKey === r.inventoryItem || i.id === r.inventoryItem) || !!this.flags['item_' + r.inventoryItem]; if (r.flag) return !!this.flags[r.flag]; if (r.gold) return this.gold >= r.gold; if (r.minLevel) return this.avgLevel() >= r.minLevel; if (r.class) return this.party.some(h => h.class === r.class); return true; }
  /** Pick a choice; returns { text, reward?, startCombat?, check? }. */
  choose(ev, choice) {
    let outcomeId = choice.outcome; let check = null;
    if (choice.skillCheck) { const c = choice.skillCheck; const read = h => derive(h, this.loot)[c.stat] ?? 8; const best = Math.max(...this.alive().map(read)); const statBonus = bestCheckBonus(this.alive(), c.stat, read); const roll = 1 + this.rng.int(0, 19); const ok = statBonus + roll >= c.dc; check = { ok, roll, best, statBonus, dc: c.dc, stat: c.stat }; outcomeId = ok ? choice.outcomes?.pass : choice.outcomes?.fail; }
    if (choice.effect?.gold) this.gold = Math.max(0, this.gold + choice.effect.gold);
    const out = (ev.outcomes && ev.outcomes[outcomeId]) || (typeof outcomeId === 'string' && !ev.outcomes?.[outcomeId] ? { text: outcomeId } : { text: '' }); const res = { text: out.text || '', check, startCombat: this.combatFor(ev, choice.effect?.startCombat || out.startCombat || null), rewards: [] };
    if (out.setFlag) this.flags[out.setFlag] = true; if (out.reward) res.rewards = this.applyReward(out.reward); if (choice.reward) res.rewards.push(...this.applyReward(choice.reward));
    this.usedNodes.push(`${this.zoneId}:${this.nodeId}`); return res;
  }
  applyReward(r) {
    const out = []; if (r.gold) { this.gold = Math.max(0, this.gold + r.gold); out.push(`${r.gold > 0 ? '+' : ''}${r.gold} gold`); } if (r.xp) { for (const h of this.party) if (h.alive) { const ups = gainXp(h, r.xp); if (ups) refresh(h, this.loot); } out.push(`+${r.xp} xp`); }
    if (r.heal) { for (const h of this.party) if (h.alive) h.hp = Math.min(h.maxHp, h.hp + r.heal); out.push(`healed ${r.heal}`); } if (r.damage) { for (const h of this.alive()) h.hp = Math.max(1, h.hp - r.damage); out.push(`took ${r.damage} damage`); }
    if (r.item) { const base = this.loot.base(r.item); const it = base ? this.loot.generate(r.item, r.itemRarity || 'magic', 'medium', { rng: this.rng }) : null; if (it) { if (r.itemName) it.name = r.itemName; it.desc = r.itemDesc; this.inventory.push(it); out.push(`found ${it.name}`); } else { this.flags['item_' + r.item] = true; out.push(`obtained ${r.itemName || r.item}`); } }
    // A random loot roll: `buildLoot` says what kind of thing turns up, `buildLootRarity` how good it
    // is. The four road charms the original handed out (the cut real-time "tap" layer) pay out here.
    if (r.buildLoot) { const keys = { jewelry: ['ring', 'necklace'], weapon: ['sword', 'dagger', 'wand', 'shortbow', 'staff'], armor: ['light_chest', 'medium_chest'] }[r.buildLoot] || ['ring']; const rarity = r.buildLootRarity || 'magic'; const it = this.loot.generate(this.rng.pick(keys), rarity, rarity === 'magic' ? 'medium' : 'high', { rng: this.rng }); if (it) { this.inventory.push(it); this.logLoot(it); if (['rare', 'legendary'].includes(it.rarity)) this.rareFound++; out.push(`found ${it.name}`); } }
    if (r.companion) { const def = { ...r.companion, power: r.companion.power || 2 }; if (this.addCompanion(this.makeCompanion(def))) out.push(`${def.name} joins you`); else out.push(`${def.name} would join, but your kennel is full`); }
    if (r.roadQuest) { const q = this.questById(r.roadQuest); if (q) { this.acceptSideQuest(q.id); out.push(`took the job: ${q.title} (${q.zoneName || q.zone} — ${q.targetName || q.targetNode}, ${q.gold} gold)`); } }
    if (r.setFlag) this.flags[r.setFlag] = true; return out;
  }
  /** Record what was said at camp so later talks can call it back. */
  rememberConversation(speakerId, withId, topic, said) { this.remember({ type: 'conversation', participants: [speakerId, withId], bindings: { with: { id: withId }, place: { id: this.zoneId } }, details: { topic, said: String(said).slice(0, 90), by: speakerId } }); }
  // ---------- towns
  merchantStock(town) { const key = 'stock:' + town.id + ':' + this.day; if (!this.flags[key]) this.flags[key] = this.loot.merchantStock(town.id, town.act, { seed: this.seed + this.day, ngPlus: this.ngPlus, fame: this.fame, heroLvl: Math.round(this.avgLevel()) }); return this.flags[key]; }
  buy(item, price, from) { if (this.gold < price) return false; this.gold -= price; const i = from.indexOf(item); if (i >= 0) from.splice(i, 1); this.inventory.push(item); return true; }
  sell(item) { const p = this.loot.sellPrice(item); this.gold += p; this.inventory = this.inventory.filter(i => i !== item); return p; }
  salvage(item) { const y = this.loot.salvage(item, this.rng); for (const [m, n] of Object.entries(y)) this.materials[m] = (this.materials[m] || 0) + n; this.inventory = this.inventory.filter(i => i !== item); this.trackEvent('salvage'); return y; }
  /** Town cleric: full heal + a new day (free; the cleric does the healing, not the bed). */
  /** Town cleric: wakes the fallen, full heal, a new day. Free — settlements are the safe ground. */
  clericRest(town) { const raised = this.reviveFallen({ how: `the cleric of ${town?.name || 'the town'} and a long prayer`, hpFrac: REVIVE.townHp, source: 'town' }); this.reviveCompanions(); for (const h of [...this.party, ...this.companions]) { h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp; h.statuses = []; } this.day++; this.hour = 8; this.legsUsed = 0; this.fedToday = true; this.exhaustion = 0; return { cost: 0, revived: raised }; }
  hires(town) { const key = 'hires:' + town.id; if (!this.flags[key]) { const named = (this.d.companions.hires || []).filter(h => (h.level || 1) <= Math.max(3, this.avgLevel() + 2)); const walkIns = []; const rng = makeRng(this.seed + town.act * 77 + this.day); for (let i = 0; i < 3; i++) { const c = rng.pick(this.d.classes.classes); const lvl = Math.max(1, Math.round(this.avgLevel()) + rng.int(-1, 0)); walkIns.push({ id: 'walkin_' + c.id + '_' + i, name: null, class: c.id, level: lvl, cost: hireCost(lvl) }); } this.flags[key] = [...named.map(h => ({ id: h.id, name: h.name, class: h.class, level: h.level || 1, cost: Math.max(100, (h.level || 1) * 100), attrs: h.attrs, description: h.description })), ...walkIns]; } return this.flags[key]; }
  kennel() { return (this.d.companions.companions || []).filter(c => !c.narrative || true).map(c => ({ ...c, price: (c.power || 1) * 100 })); }
  // ---------- quests
  startQuests() { if (!this.quests.active.length && !this.quests.done.length) this.quests.active.push('mq_act1'); }
  // ---------- save
  toJSON() { const { d, loot, zones, zoneOrder, rng, banks, relations, meter, ...rest } = this; return { ...rest, v: 2, banks: Object.fromEntries(Object.entries(banks).map(([k, b]) => [k, b.toJSON()])), relations: relations.toJSON(), meter: meter.toJSON() }; }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this)); return true; } catch { return false; } }
  static hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  static clearSave() { localStorage.removeItem(SAVE_KEY); }
  static load(data) { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const j = JSON.parse(raw); const g = new Game(data); const { banks, relations, meter, ...rest } = j; Object.assign(g, rest); g.banks = Object.fromEntries(Object.entries(banks || {}).map(([k, b]) => [k, MemoryBank.fromJSON(b, { eventTypes: data.events?.types || {}, lexicon: data.lexicon || null })])); g.relations = RelationGraph.fromJSON(relations || {}, data.relations || g.relations.model); g.meter = Meter.fromJSON(meter || {}, { maxFights: 60 }); g.supplies ||= { ration: 6, bandages: 1, torch: 2, tent: 0 }; g.vehicle ||= 'none'; g.lootLog ||= []; g.revives ||= []; g.questOffers ||= []; g.crossings ||= []; g.bench ||= []; g.benchCompanions ||= []; g.rng = makeRng(g.seed + (g.day || 1) * 1000 + (g.kills || 0)); for (const h of g.party.concat(g.bench)) refresh(h, g.loot); return g; }
}
export { equip, unequip, refresh, derive, hireCost, VEHICLES as VEHICLE_DEFS };
