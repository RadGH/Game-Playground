// Game state + world rules: party/companions/bench, gold/materials/fame, zone graph + node handling, dialog and random
// events (with skill checks, flags, rewards), towns (act-gated services), dungeons, quests, save/load. No DOM.
import { makeRng, hashStr } from './rng.js';
import { Loot } from './loot.js';
import { createHero, gainXp, catchUp, refresh, hireCost, makeEnemy, equip, unequip, derive } from './rules.js';
const SAVE_KEY = 'playground:emberveil:save:v1';
export const TOWNS = { 1: { name: 'Emberglen', services: ['merchant', 'tavern', 'cleric'] }, 2: { name: 'Ashfort', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer'] }, 3: { name: 'Ironhold Bastion', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter'] }, 4: { name: 'Starfall Haven', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] }, 5: { name: 'The Last Bastion', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] }, 6: { name: 'Drakehold', services: ['merchant', 'tavern', 'cleric', 'blacksmith', 'trainer', 'enchanter', 'blackmarket'] } };
export const ACT_NAMES = { 0: 'Prologue · The Lonely Road', 1: 'Act I · The Goblin Frontier', 2: 'Act II · The Ashen Wastes', 3: 'Act III · The Hell Breach', 4: 'Act IV · The Cosmic Void', 5: 'Act V · The Primordial Abyss', 6: "Act VI · The Dragon's Reach" };
export const MAIN_QUESTS = [{ id: 'mq_act1', title: 'Blood at the Border', act: 1, boss: 'border_boss', text: 'Goblin warbands raid the border with unnatural discipline. Find who commands them.' }, { id: 'mq_act2', title: 'Embers Over Cinderhold', act: 2, boss: 'plateau_boss', text: 'Follow the corruption into the Ashen Wastes and find Silas\'s missing daughter.' }, { id: 'mq_act3', title: 'The Veil Breach', act: 3, boss: 'breach_boss', text: 'Cross the breach into a Hell already fracturing. Confront Silas at Dreadhearth.' }, { id: 'mq_act4', title: 'Shards of the Architect', act: 4, boss: 'core_boss', text: 'Kaela Thorne needs three void shards to track the cult through the rift.' }, { id: 'mq_act5', title: 'The Architect', act: 5, boss: 'rift_boss', text: 'The hooded scholar was the Architect all along. Reach the place where reality was made.' }, { id: 'mq_act6', title: 'The Dragon King', act: 6, boss: 'dragonking_boss', text: 'Bahamorth\'s heart beats beneath three scales of dragon-steel.' }];

export class Game {
  constructor(data) { this.d = data; this.loot = new Loot(data.items); this.zones = Object.fromEntries(Object.values(data.zones).flat().filter(z => z?.id).map(z => [z.id, z])); this.zoneOrder = Object.values(data.zones).flat().filter(z => z?.id).map(z => z.id); this.reset(); }
  reset() { this.party = []; this.companions = []; this.bench = []; this.inventory = []; this.materials = { iron_scrap: 0, magic_essence: 0, rare_dust: 0, legend_core: 0 }; this.gold = 150; this.fame = 0; this.act = 0; this.zoneId = 'prologue'; this.nodeId = 'start'; this.unlockedZones = ['prologue']; this.visited = { prologue: ['start'] }; this.cleared = []; this.usedNodes = []; this.flags = {}; this.seenEvents = []; this.completedBosses = []; this.completedDungeons = []; this.quests = { active: [], done: [] }; this.kills = 0; this.rareFound = 0; this.ngPlus = 0; this.seed = Math.floor(Math.random() * 1e9); this.rng = makeRng(this.seed); this.log = []; this.day = 1; }
  // ---------- party
  classDef(id) { return this.d.classes.classes.find(c => c.id === id); }
  build(classId) { const list = this.d.builds.presets || this.d.builds.builds || (Array.isArray(this.d.builds) ? this.d.builds : Object.values(this.d.builds).flat()); return list.find?.(b => b.class === classId) || null; }
  makeHero(classId, name, level = 1, blueprint = null) { const h = createHero({ name, classId, level, classDef: this.classDef(classId), build: this.build(classId), blueprint, loot: this.loot, skills: this.d.skills.skills }); if (blueprint) { h.avatar = blueprint.avatar; h.voice = blueprint.voice; h.speech = blueprint.speech; h.short = blueprint.short || name.split(' ')[0]; h.pronouns = blueprint.pronouns; } h.short = h.short || name.split(' ')[0]; return h; }
  addHero(h) { if (this.party.length < 4) this.party.push(h); else this.bench.push(h); return h; }
  addCompanion(c) { if (this.companions.length < 4) { this.companions.push(c); return true; } return false; }
  makeCompanion(def, level = null) { const L = Math.max(1, Math.round(level || this.avgLevel())); const P = def.power || 1; const hp = Math.round(30 * P + 8 * P * L); const c = { id: 'c_' + def.id + '_' + Math.random().toString(36).slice(2, 6), name: def.name, templateId: def.id, className: def.className || 'Companion', isCompanion: true, isHero: false, level: L, attrs: { ...(def.attrs || { STR: 8, DEX: 8, INT: 4, CON: 8 }) }, equipment: {}, skills: [], talents: {}, passiveRanks: {}, alive: true, statuses: [], cooldowns: {}, power: P, description: def.description, maxHp: hp, hp: hp, maxMp: 10, mp: 10, dmg: [Math.max(1, Math.round(3 + P + P * L)), Math.max(2, Math.round(5 + 2 * P + 1.5 * P * L))] }; return c; }
  avgLevel() { return this.party.length ? this.party.reduce((s, h) => s + h.level, 0) / this.party.length : 1; }
  alive() { return this.party.filter(h => h.alive && h.hp > 0); }
  fighters() { return [...this.party, ...this.companions].filter(x => x.alive); }
  // ---------- map
  zone(id = this.zoneId) { return this.zones[id]; }
  node(id = this.nodeId, zoneId = this.zoneId) { return this.zone(zoneId)?.nodes.find(n => n.id === id); }
  nodeKey(n = this.node()) { return `${this.zoneId}:${n.id}`; }
  isVisited(nId) { return (this.visited[this.zoneId] || []).includes(nId); }
  isCleared(nId) { return this.cleared.includes(`${this.zoneId}:${nId}`); }
  isUsed(nId) { return this.usedNodes.includes(`${this.zoneId}:${nId}`); }
  /** Nodes the party may travel to: exits of the current node plus any visited node (fast travel). */
  reachable() { const cur = this.node(); const set = new Set([...(cur?.exits || []), ...(this.visited[this.zoneId] || [])]); set.delete(this.nodeId); return [...set]; }
  canTravel(nId) { return this.reachable().includes(nId); }
  travel(nId) { if (!this.canTravel(nId)) return null; this.nodeId = nId; (this.visited[this.zoneId] ||= []).push(nId); this.visited[this.zoneId] = [...new Set(this.visited[this.zoneId])]; return this.node(); }
  nextZoneId(zoneId = this.zoneId) { return this.d.zoneTables.ZONE_UNLOCK_MAP[zoneId] || null; }
  unlockNextZone() { const nz = this.nextZoneId(); if (nz && !this.unlockedZones.includes(nz)) this.unlockedZones.push(nz); const bossAct = this.d.zoneTables.ACT_BOSS_ZONES[this.zoneId]; if (bossAct != null) { this.act = Math.max(this.act, bossAct); this.flags['act' + (bossAct - 1) + '_complete'] = true; } return nz; }
  enterZone(zoneId) { if (!this.unlockedZones.includes(zoneId)) return false; this.zoneId = zoneId; this.nodeId = 'start'; (this.visited[zoneId] ||= []).push('start'); this.act = Math.max(this.act, this.zone(zoneId).act); return true; }
  townFor(zoneId = this.zoneId) { const act = Math.max(1, this.zone(zoneId)?.act || 1); return { id: 'town_act' + act, act, ...TOWNS[Math.min(6, act)] }; }
  /** What happens at a node: returns { kind, ... } for the UI to run. Memory rules: cleared combat stays cleared; one-shot nodes stay used. */
  enter(n = this.node()) {
    const key = `${this.zoneId}:${n.id}`; const first = !this.isUsed(n.id);
    if (n.type === 'town') return { kind: 'town', town: this.townFor(), node: n };
    if (['combat', 'ambush', 'challenge', 'boss'].includes(n.type)) { if (this.isCleared(n.id)) return { kind: 'cleared', node: n }; return { kind: 'combat', node: n, encounter: this.encounter(n.encounter, n.type === 'boss'), boss: n.type === 'boss' }; }
    if (n.type === 'dialog') { if (!first) return { kind: 'quiet', node: n, text: 'Nothing more happens here.' }; const ev = this.d.dialogs.DIALOG_EVENTS[n.dialogEventId] || this.randomEvent(); return ev ? { kind: 'event', node: n, event: ev } : { kind: 'quiet', node: n, text: n.name }; }
    if (n.type === 'shrine') { if (!first) return { kind: 'quiet', node: n, text: 'The shrine is silent now.' }; this.usedNodes.push(key); const t = n.shrineType || 'heal'; for (const h of [...this.party, ...this.companions]) { h.alive = true; h.hp = h.maxHp; if (t === 'fullrestore') h.mp = h.maxMp; } if (t === 'empower') this.flags.empowered = 1; return { kind: 'shrine', node: n, shrineType: t, text: t === 'heal' ? 'Cool water and old stone. Everyone is whole again.' : t === 'fullrestore' ? 'Body and mind restored.' : 'Strength hums in your limbs. Your next fight starts with a blessing.' }; }
    if (n.type === 'treasure') { if (!first) return { kind: 'quiet', node: n, text: 'The cache is empty.' }; this.usedNodes.push(key); const g = 60 + this.rng.int(0, 59); this.gold += g; const item = this.rng() < 0.5 ? this.loot.generate(this.rng.pick(['ring', 'necklace', 'light_chest', 'sword', 'wand']), 'magic', 'medium', { rng: this.rng }) : null; if (item) this.inventory.push(item); return { kind: 'treasure', node: n, gold: g, item }; }
    if (n.type === 'skillCheck') { if (!first) return { kind: 'quiet', node: n, text: 'Already dealt with.' }; return { kind: 'skillCheck', node: n, check: n.skillCheck }; }
    if (n.type === 'lore') { if (!first) return { kind: 'quiet', node: n, text: n.name }; this.usedNodes.push(key); return { kind: 'lore', node: n, text: this.loreText(n) }; }
    if (n.type === 'dungeon') { const dg = Object.values(this.d.dungeons.DUNGEONS).find(x => x.parentZone === this.zoneId); return dg ? { kind: 'dungeon', node: n, dungeon: dg, done: this.completedDungeons.includes(dg.id) } : { kind: 'quiet', node: n, text: n.name }; }
    return { kind: 'quiet', node: n, text: n.name };
  }
  loreText(n) { const z = this.zone(); const acts = { 0: 'The road is quiet in the way roads are quiet just before they are not.', 1: 'Rot-rings in the fields, all the same size. Iris Vael would call it a pattern. The farmers call it Tuesday.', 2: 'The Ashen Veil worked here. You can tell by what is missing.', 3: 'Something in Hell is afraid. That is new.', 4: 'The sky is simply gone. What is left keeps its own counsel.', 5: 'This is where reality was made. It was not made carefully.', 6: 'Dragon-steel, three scales thick. The heart beneath still beats.' }; return `${n.name}. ${acts[z.act] || ''}`; }
  /** Resolve a node skill check with the party's best attribute + d20. */
  resolveSkillCheck(n) { const c = n.skillCheck; const best = Math.max(...this.alive().map(h => derive(h, this.loot)[c.stat] ?? h.attrs[c.stat] ?? 8)); const roll = 1 + this.rng.int(0, 19); const ok = best + roll >= c.dc; this.usedNodes.push(`${this.zoneId}:${n.id}`); if (ok) { if (c.success?.gold) this.gold += c.success.gold; if (c.success?.item) { const it = this.loot.generate(c.success.item, 'magic', 'medium', { rng: this.rng }); if (it) this.inventory.push(it); } } else if (c.failure?.hpLoss) for (const h of this.alive()) h.hp = Math.max(1, h.hp - c.failure.hpLoss); return { ok, roll, best, dc: c.dc, text: ok ? c.success?.text : c.failure?.text }; }
  // ---------- encounters
  encounter(id, boss = false) { const enc = this.d.encounters.encounters[id]; if (!enc) return null; const foes = []; let i = 0; const heroes = Math.max(1, this.party.length); enc.enemies.forEach((g, gi) => { for (let k = 0; k < (g.count || 1); k++) { const tpl = this.d.enemies.entities[g.ref] || this.d.bosses.entities[g.ref]; if (!tpl) continue; const isBoss = boss && (gi === 0) && (!!this.d.bosses.entities[g.ref] || g.count === 1); const e = makeEnemy(tpl, { act: Math.max(1, this.act), heroes, ngPlus: this.ngPlus, boss: isBoss, overrides: g.overrides || {}, index: i++ }); e.group = gi; if (this.rng() < 0.05 && !isBoss) { e.champion = true; e.maxHp = Math.round(e.maxHp * 1.5); e.hp = e.maxHp; e.dmg = e.dmg.map(x => Math.round(x * 1.3)); e.name = 'Champion ' + e.name; } foes.push(e); } }); return { id, name: enc.name, enemies: foes }; }
  /** After a victory: xp, gold, fame, drops; marks node cleared; boss → unlock next zone + quests. Returns a summary. */
  victory(node, enc, { revisit = false } = {}) {
    const alive = this.alive(); const avg = this.avgLevel(); const xpFind = alive.reduce((s, h) => s + (h.derived?.xpFind || 0), 0), goldFind = alive.reduce((s, h) => s + (h.derived?.goldFind || 0), 0), magicFind = alive.reduce((s, h) => s + (h.derived?.magicFind || 0), 0);
    let xp = 0, gold = 0; const drops = []; for (const e of enc.enemies) { xp += Math.round(e.xpValue * (1 + xpFind) * 3); gold += Math.round(this.rng.int(e.gold[0], e.gold[1]) * (1 + goldFind) * 1.2); this.kills++; const it = this.loot.zoneDrop(this.zoneId, this.rng, { revisit, magicFind, act: Math.max(1, this.act) }); if (it) drops.push(it); }
    const levelUps = []; for (const h of this.party) { if (!h.alive) continue; const got = Math.round(xp * catchUp(h.level, avg)); const ups = gainXp(h, got); if (ups) { refresh(h, this.loot); h.hp = h.maxHp; h.mp = h.maxMp; levelUps.push({ hero: h, ups }); } }
    const isBoss = node?.type === 'boss'; const fameMult = this.d.zoneTables.ZONE_FAME_MULT[this.zoneId] || 1; const fame = Math.round(enc.enemies.length * fameMult) + (isBoss ? Math.round(15 * fameMult) : 0); this.fame += fame; this.gold += gold;
    for (const it of drops) { this.inventory.push(it); if (['rare', 'legendary'].includes(it.rarity)) this.rareFound++; }
    if (node) this.cleared.push(`${this.zoneId}:${node.id}`);
    let bossDrops = [], unlockedZone = null, questDone = null;
    if (isBoss) { const bossId = enc.enemies.find(e => e.boss)?.templateId; if (bossId && !this.completedBosses.includes(node.id)) { this.completedBosses.push(node.id); this.completedBosses.push(bossId); bossDrops = this.loot.bossLoot(bossId, this.rng); this.inventory.push(...bossDrops); } unlockedZone = this.unlockNextZone(); const q = MAIN_QUESTS.find(q => q.boss === node.id); if (q && !this.quests.done.includes(q.id)) { this.quests.done.push(q.id); this.quests.active = this.quests.active.filter(x => x !== q.id); questDone = q; const next = MAIN_QUESTS.find(x => x.act === q.act + 1); if (next) this.quests.active.push(next.id); } }
    // survivors with a revive skill bring the fallen back at half hp
    const canRevive = alive.some(h => (h.skills || []).some(id => this.d.skills.skills[id]?.type === 'revive')); if (canRevive) for (const h of this.party) if (!h.alive) { h.alive = true; h.hp = Math.max(1, Math.floor(h.maxHp * 0.5)); }
    for (const h of this.party) if (!h.alive) { h.alive = true; h.hp = Math.max(1, Math.floor(h.maxHp * 0.25)); } // this prototype: no permadeath, fallen wake at 25% after the fight
    for (const c of this.companions) if (!c.alive) { c.alive = true; c.hp = Math.max(1, Math.floor(c.maxHp * 0.5)); }
    return { xp, gold, fame, drops, bossDrops, levelUps, unlockedZone, questDone };
  }
  defeat() { for (const h of this.party) { h.alive = true; h.hp = Math.max(1, Math.floor(h.maxHp * 0.5)); h.mp = Math.floor(h.maxMp * 0.5); } for (const c of this.companions) { c.alive = true; c.hp = Math.max(1, Math.floor(c.maxHp * 0.5)); } this.gold = Math.floor(this.gold * 0.85); const town = this.zone().nodes.find(n => n.type === 'town'); if (town) this.nodeId = town.id; return { text: 'You wake in town with lighter purses and heavier heads.', lost: '15% of your gold' }; }
  // ---------- events (dialog + random)
  randomEvent() { const lvl = Math.round(this.avgLevel()); const pool = this.d.randomEvents.RANDOM_EVENTS.filter(e => e.minLevel <= lvl && (e.zone === 'any' || (Array.isArray(e.zone) ? e.zone.includes(this.zoneId) : e.zone === this.zoneId)) && !this.seenEvents.includes(e.id)); if (!pool.length) return null; const ev = this.rng.pick(pool); this.seenEvents.push(ev.id); return ev; }
  choiceAllowed(c) { const r = c.requires; if (!r) return true; if (r.inventoryItem) return this.inventory.some(i => i.baseKey === r.inventoryItem || i.id === r.inventoryItem) || !!this.flags['item_' + r.inventoryItem]; if (r.flag) return !!this.flags[r.flag]; if (r.gold) return this.gold >= r.gold; if (r.minLevel) return this.avgLevel() >= r.minLevel; if (r.class) return this.party.some(h => h.class === r.class); return true; }
  /** Pick a choice; returns { text, reward?, startCombat?, check? }. */
  choose(ev, choice) {
    let outcomeId = choice.outcome; let check = null;
    if (choice.skillCheck) { const c = choice.skillCheck; const best = Math.max(...this.alive().map(h => derive(h, this.loot)[c.stat] ?? 8)); const roll = 1 + this.rng.int(0, 19); const ok = best + roll >= c.dc; check = { ok, roll, best, dc: c.dc, stat: c.stat }; outcomeId = ok ? choice.outcomes?.pass : choice.outcomes?.fail; }
    if (choice.effect?.gold) this.gold = Math.max(0, this.gold + choice.effect.gold);
    const out = (ev.outcomes && ev.outcomes[outcomeId]) || (typeof outcomeId === 'string' && !ev.outcomes?.[outcomeId] ? { text: outcomeId } : { text: '' }); const res = { text: out.text || '', check, startCombat: choice.effect?.startCombat || out.startCombat || null, rewards: [] };
    if (out.setFlag) this.flags[out.setFlag] = true; if (out.reward) res.rewards = this.applyReward(out.reward); if (choice.reward) res.rewards.push(...this.applyReward(choice.reward));
    this.usedNodes.push(`${this.zoneId}:${this.nodeId}`); return res;
  }
  applyReward(r) {
    const out = []; if (r.gold) { this.gold = Math.max(0, this.gold + r.gold); out.push(`${r.gold > 0 ? '+' : ''}${r.gold} gold`); } if (r.xp) { for (const h of this.party) if (h.alive) { const ups = gainXp(h, r.xp); if (ups) refresh(h, this.loot); } out.push(`+${r.xp} xp`); }
    if (r.heal) { for (const h of this.party) if (h.alive) h.hp = Math.min(h.maxHp, h.hp + r.heal); out.push(`healed ${r.heal}`); } if (r.damage) { for (const h of this.alive()) h.hp = Math.max(1, h.hp - r.damage); out.push(`took ${r.damage} damage`); }
    if (r.item) { const base = this.loot.base(r.item); const it = base ? this.loot.generate(r.item, r.itemRarity || 'magic', 'medium', { rng: this.rng }) : null; if (it) { if (r.itemName) it.name = r.itemName; it.desc = r.itemDesc; this.inventory.push(it); out.push(`found ${it.name}`); } else { this.flags['item_' + r.item] = true; out.push(`obtained ${r.itemName || r.item}`); } }
    if (r.buildLoot) { const keys = { jewelry: ['ring', 'necklace'], weapon: ['sword', 'dagger', 'wand', 'shortbow', 'staff'], armor: ['light_chest', 'medium_chest'] }[r.buildLoot] || ['ring']; const it = this.loot.generate(this.rng.pick(keys), 'magic', 'medium', { rng: this.rng }); if (it) { this.inventory.push(it); out.push(`found ${it.name}`); } }
    if (r.companion) { const def = { ...r.companion, power: r.companion.power || 2 }; if (this.addCompanion(this.makeCompanion(def))) out.push(`${def.name} joins you`); else out.push(`${def.name} would join, but your kennel is full`); }
    if (r.setFlag) this.flags[r.setFlag] = true; if (r.tapItem) out.push(`tap weapon (not in this prototype): ${r.tapItem}`); return out;
  }
  // ---------- towns
  merchantStock(town) { const key = 'stock:' + town.id + ':' + this.day; if (!this.flags[key]) this.flags[key] = this.loot.merchantStock(town.id, town.act, { seed: this.seed + this.day, ngPlus: this.ngPlus, fame: this.fame, heroLvl: Math.round(this.avgLevel()) }); return this.flags[key]; }
  buy(item, price, from) { if (this.gold < price) return false; this.gold -= price; const i = from.indexOf(item); if (i >= 0) from.splice(i, 1); this.inventory.push(item); return true; }
  sell(item) { const p = this.loot.sellPrice(item); this.gold += p; this.inventory = this.inventory.filter(i => i !== item); return p; }
  salvage(item) { const y = this.loot.salvage(item, this.rng); for (const [m, n] of Object.entries(y)) this.materials[m] = (this.materials[m] || 0) + n; this.inventory = this.inventory.filter(i => i !== item); return y; }
  rest(town) { const cost = 0; for (const h of [...this.party, ...this.companions]) { h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp; h.statuses = []; } this.day++; return cost; }
  hires(town) { const key = 'hires:' + town.id; if (!this.flags[key]) { const named = (this.d.companions.hires || []).filter(h => (h.level || 1) <= Math.max(3, this.avgLevel() + 2)); const walkIns = []; const rng = makeRng(this.seed + town.act * 77 + this.day); for (let i = 0; i < 3; i++) { const c = rng.pick(this.d.classes.classes); const lvl = Math.max(1, Math.round(this.avgLevel()) + rng.int(-1, 0)); walkIns.push({ id: 'walkin_' + c.id + '_' + i, name: null, class: c.id, level: lvl, cost: hireCost(lvl) }); } this.flags[key] = [...named.map(h => ({ id: h.id, name: h.name, class: h.class, level: h.level || 1, cost: Math.max(100, (h.level || 1) * 100), attrs: h.attrs, description: h.description })), ...walkIns]; } return this.flags[key]; }
  kennel() { return (this.d.companions.companions || []).filter(c => !c.narrative || true).map(c => ({ ...c, price: (c.power || 1) * 100 })); }
  // ---------- quests
  startQuests() { if (!this.quests.active.length && !this.quests.done.length) this.quests.active.push('mq_act1'); }
  // ---------- save
  toJSON() { const { d, loot, zones, zoneOrder, rng, ...rest } = this; return { ...rest, v: 1 }; }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this)); return true; } catch { return false; } }
  static hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  static clearSave() { localStorage.removeItem(SAVE_KEY); }
  static load(data) { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const j = JSON.parse(raw); const g = new Game(data); Object.assign(g, j); g.rng = makeRng(g.seed + (g.day || 1) * 1000 + (g.kills || 0)); for (const h of g.party.concat(g.bench)) refresh(h, g.loot); return g; }
}
export { equip, unequip, refresh, derive, hireCost };
