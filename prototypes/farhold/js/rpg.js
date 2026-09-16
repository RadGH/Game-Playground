// Farhold — the role-playing rules: stats, levels, gear and loot.
//
// Pure JavaScript, no DOM and no Three.js, so the node tests drive the same code the game does.
// Items come from Emberveil's generator (`prototypes/emberveil/js/loot.js` + `data/items.json`):
// bases, rarities, qualities, affixes, uniques and set pieces are all already there, so this file
// only has to decide *what* drops and what an affix does to a character standing in a field.
//
//   import { Rpg } from './rpg.js';
//   const rpg = new Rpg(itemsData, balance);
//   const player = rpg.createPlayer({ name: 'Wren', classId: 'ranger' });
//   rpg.equip(player, rpg.rollDrop({ level: 3 }));
//
// Affixes this file does not understand are kept on the item and shown on its card, marked as
// having no effect yet. They are not silently dropped — later phases turn them on.

import { Loot } from '../../emberveil/js/loot.js';
import { makeRng } from '../../emberveil/js/rng.js';

/** Affixes that change a character here. Everything else is carried but does nothing yet. */
export const LIVE_STATS = {
  hp: 'maxHp', mp: 'maxMp', armor: 'armor', magicResist: 'magicResist', dmg: 'damageFlat',
  critChance: 'critChance', critDamage: 'critDamage', dodge: 'dodge', hit: 'hit', hpRegen: 'hpRegen',
  mana_regen: 'mpRegen', str: 'str', dex: 'dex', int: 'int', con: 'con', spellPower: 'spellPower',
  lifeSteal: 'lifeSteal', magicFind: 'magicFind', goldFind: 'goldFind', xpFind: 'xpFind',
  block_chance: 'blockChance', block_power: 'blockPower',
};

export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'necklace'];
export const MAX_LEVEL = 30;

/** XP needed to *reach* a level. A gentle curve — this prototype is about the walk, not the grind. */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(58 * Math.pow(level - 1, 1.86));
}
export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** Emberveil item subtypes -> the Chibi 2 part the character actually holds. */
const HELD_BY_SUBTYPE = {
  dagger: 'daggers', sword: 'sword', longsword: 'sword', rapier: 'rapier', saber: 'saber',
  sword2h: 'greataxe', greatsword: 'greataxe', axe2h: 'greataxe', battleaxe: 'greataxe', cleaver: 'cleaver',
  hammer: 'hammer', warhammer: 'warhammer', mace: 'mace', halberd: 'quarterstaff', spear: 'quarterstaff',
  javelin: 'quarterstaff', quarterstaff: 'staff_crook', staff: 'staff_orb', wand: 'flame', scepter: 'mace',
  orb: 'orb', tome: 'book', bow: 'bow', shortbow: 'bow', crossbow: 'crossbow',
};
const OFFHAND_BY_SUBTYPE = { shield: 'heater_shield', quiver: 'quiver', dagger: 'dagger' };

/** What a weapon looks like in the character's hand — the item's own look wins if it has one. */
export function heldLookFor(item) {
  if (!item) return { id: 'none' };
  if (item.look?.held) return { id: item.look.held, color: item.look.color || '#b9c2cc' };
  const id = HELD_BY_SUBTYPE[item.subtype] || HELD_BY_SUBTYPE[item.baseKey] || 'sword';
  return { id, color: item.rarity === 'legendary' ? '#ffb040' : item.rarity === 'rare' ? '#e8d020' : '#b9c2cc' };
}
export function offhandLookFor(item) {
  if (!item) return { id: 'none' };
  if (item.look?.offhand) return { id: item.look.offhand, color: item.look.color || '#9aa3ad' };
  if (item.isShield || item.isMagicShield) return { id: item.slot === 'offhand' && item.isMagicShield ? 'kite_shield' : 'heater_shield', color: '#8d97a3' };
  const id = OFFHAND_BY_SUBTYPE[item.subtype] || 'none';
  return { id, color: '#9aa3ad' };
}

/** A single number for "is this better than what I am wearing", used for the upgrade arrow. */
export function itemScore(item) {
  if (!item) return 0;
  let score = 0;
  if (item.dmg) score += (item.dmg[0] + item.dmg[1]) / 2 * 3;
  if (item.armor) score += item.armor * 2;
  for (const a of item.affixes || []) {
    const field = LIVE_STATS[a.stat];
    if (!field) continue;
    const weight = { maxHp: 0.5, armor: 2, damageFlat: 3, critChance: 4, critDamage: 2, dodge: 2, hit: 1, str: 3, dex: 3, int: 3, con: 3 }[field] ?? 1;
    score += (a.value || 0) * weight;
  }
  return Math.round(score);
}

export class Rpg {
  /** `items` is Emberveil's items.json; `balance` is data/balance.json. */
  constructor(items, balance = {}) {
    this.items = items;
    this.b = balance;
    this.loot = new Loot(items, balance.loot || {});
    this.rng = makeRng(balance.seed ?? 1);
  }

  // ---------------------------------------------------------------- characters

  createPlayer({ name = 'Wayfarer', classId = 'ranger', avatar = null, level = 1 } = {}) {
    const base = this.b.player || {};
    const player = {
      name, classId, avatar, level, xp: xpForLevel(level), gold: base.startGold ?? 0,
      attrs: { str: base.str ?? 6, dex: base.dex ?? 6, int: base.int ?? 6, con: base.con ?? 6 },
      pendingAttr: 0,
      equipment: {}, bag: [],
      kills: 0, deaths: 0,
    };
    for (let l = 2; l <= level; l++) player.pendingAttr += this.b.progression?.attrPerLevel ?? 3;
    this.refresh(player, { full: true });
    return player;
  }

  /** Everything the game reads off a character, worked out from level + attributes + gear. */
  derive(unit) {
    const b = this.b.player || {};
    const lvl = unit.level || 1;
    const d = {
      maxHp: (b.baseHp ?? 60) + (b.hpPerLevel ?? 14) * (lvl - 1),
      maxMp: (b.baseMp ?? 20) + (b.mpPerLevel ?? 4) * (lvl - 1),
      armor: 0, magicResist: 0, damageFlat: 0, critChance: b.critChance ?? 5, critDamage: b.critDamage ?? 50,
      dodge: 0, hit: 75, hpRegen: b.hpRegen ?? 0.5, mpRegen: 1, spellPower: 0, lifeSteal: 0,
      magicFind: 0, goldFind: 0, xpFind: 0, blockChance: 0, blockPower: 0,
      str: unit.attrs?.str ?? 0, dex: unit.attrs?.dex ?? 0, int: unit.attrs?.int ?? 0, con: unit.attrs?.con ?? 0,
      inert: [],
    };
    for (const slot of SLOTS) {
      const item = unit.equipment?.[slot];
      if (!item) continue;
      if (item.armor) d.armor += item.armor;
      for (const a of item.affixes || []) {
        const field = LIVE_STATS[a.stat];
        if (!field) { d.inert.push(a.stat); continue; }
        d[field] += a.value || 0;
      }
    }
    d.maxHp += d.con * (b.hpPerCon ?? 4);
    d.maxMp += d.int * (b.mpPerInt ?? 2);
    d.critChance += d.dex * 0.2;
    d.dodge += d.dex * 0.3;
    const weapon = unit.equipment?.weapon;
    const cat = weapon?.weaponCategory || 'light';
    const attr = cat === 'magic' ? d.int : cat === 'heavy' ? d.str : d.dex;
    const wd = weapon?.dmg || (b.unarmed ?? [2, 4]);
    const scale = 1 + attr * (b.damagePerAttr ?? 0.03);
    d.damage = [Math.max(1, Math.round((wd[0] + d.damageFlat) * scale)), Math.max(2, Math.round((wd[1] + d.damageFlat) * scale))];
    d.moveSpeed = (b.moveSpeed ?? 5.2) * (1 - Math.min(0.2, (d.armor / 400)));
    d.inert = [...new Set(d.inert)];
    return d;
  }

  /** Recompute derived stats, keeping the same share of health unless `full` is asked for. */
  refresh(unit, { full = false } = {}) {
    const before = unit.derived;
    const d = this.derive(unit);
    const hpFrac = full || !before ? 1 : Math.min(1, (unit.hp ?? d.maxHp) / (before.maxHp || d.maxHp));
    const mpFrac = full || !before ? 1 : Math.min(1, (unit.mp ?? d.maxMp) / (before.maxMp || d.maxMp));
    unit.derived = d;
    unit.maxHp = d.maxHp; unit.maxMp = d.maxMp;
    unit.hp = Math.max(1, Math.round(d.maxHp * hpFrac));
    unit.mp = Math.round(d.maxMp * mpFrac);
    return d;
  }

  /** Put an item on. The item that comes off goes back to the bag. Returns what was replaced. */
  equip(player, item) {
    if (!item) return null;
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    if (!SLOTS.includes(slot)) return null;
    const old = player.equipment[slot] || null;
    player.equipment[slot] = item;
    // a two-handed weapon clears the off hand
    if (slot === 'weapon' && item.twoHanded && player.equipment.offhand) {
      player.bag.push(player.equipment.offhand);
      delete player.equipment.offhand;
    }
    const at = player.bag.indexOf(item);
    if (at >= 0) player.bag.splice(at, 1);
    if (old) player.bag.push(old);
    this.refresh(player);
    return old;
  }

  unequip(player, slot) {
    const item = player.equipment[slot];
    if (!item) return null;
    delete player.equipment[slot];
    player.bag.push(item);
    this.refresh(player);
    return item;
  }

  /** XP in, levels out. Returns how many levels were gained (0 most of the time). */
  gainXp(player, amount) {
    const before = player.level;
    player.xp += Math.max(0, Math.round(amount * (1 + (player.derived?.xpFind || 0) / 100)));
    const after = levelFromXp(player.xp);
    if (after === before) return 0;
    player.level = after;
    player.pendingAttr += (after - before) * (this.b.progression?.attrPerLevel ?? 3);
    this.refresh(player, { full: true });
    return after - before;
  }

  /** Spend a level-up point. */
  spendAttr(player, key) {
    if (!player.pendingAttr || !(key in player.attrs)) return false;
    player.attrs[key]++;
    player.pendingAttr--;
    this.refresh(player);
    return true;
  }

  // ---------------------------------------------------------------- enemies

  /** Build a live enemy from a table entry in data/enemies.json. */
  makeEnemy(def, level, rng = this.rng) {
    const e = this.b.enemies || {};
    const lvl = Math.max(1, Math.round(level));
    const scale = Math.pow(e.perLevel ?? 1.17, lvl - 1);
    const hp = Math.round((def.hp ?? 30) * scale * (e.hp ?? 1) * rng.range(0.9, 1.1));
    const dmg = (def.dmg ?? [4, 7]).map(v => Math.max(1, Math.round(v * scale * (e.dmg ?? 1))));
    return {
      id: 'e' + Math.floor(rng() * 1e9).toString(36),
      defId: def.id, name: def.name, kind: def.kind || 'beast', level: lvl,
      hp, maxHp: hp, dmg, armor: Math.round((def.armor ?? 0) * scale), speed: def.speed ?? 3.1,
      reach: def.reach ?? 2.2, aggroRange: def.aggroRange ?? 26, attackEvery: def.attackEvery ?? 1.5,
      xp: Math.round((def.xp ?? 12) * scale * (e.xp ?? 1)),
      gold: Math.round((def.gold ?? 4) * scale * (e.gold ?? 1)),
      look: def.look || null, dropBases: def.dropBases || null,
    };
  }

  // ---------------------------------------------------------------- combat

  /**
   * One swing. Returns what happened so the caller can show numbers, play an animation and write
   * a line in the log. Attacker and defender are any `{ derived }` character or plain enemy.
   */
  strike(attacker, defender, rng = this.rng, { multiplier = 1 } = {}) {
    const a = attacker.derived, d = defender.derived;
    const dmgRange = a ? a.damage : attacker.dmg || [3, 5];
    const dodge = (d ? d.dodge : defender.dodge || 0) / 100;
    if (rng() < Math.min(0.35, dodge)) return { dodged: true, amount: 0, crit: false };
    const crit = rng() * 100 < (a ? a.critChance : attacker.critChance || 3);
    let amount = rng.range(dmgRange[0], dmgRange[1]) * multiplier;
    if (crit) amount *= 1 + (a ? a.critDamage : 50) / 100;
    const armor = d ? d.armor : defender.armor || 0;
    amount *= 100 / (100 + Math.max(0, armor));
    amount = Math.max(1, Math.round(amount));
    defender.hp = Math.max(0, (defender.hp ?? defender.maxHp) - amount);
    const healed = a?.lifeSteal ? Math.round(amount * a.lifeSteal / 100) : 0;
    if (healed && attacker.hp != null) attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
    return { dodged: false, amount, crit, healed, dead: defender.hp <= 0 };
  }

  // ---------------------------------------------------------------- loot

  /** The base items a character of this level can find. */
  basesFor(level) {
    const tiers = this.b.lootTiers || [];
    const tier = tiers.filter(t => (t.minLevel ?? 1) <= level).pop();
    return tier?.bases || ['sword', 'dagger', 'light_chest', 'ring'];
  }

  rarityFor(level, rng, magicFind = 0) {
    const table = this.b.rarity || { normal: 0.52, magic: 0.31, rare: 0.14, legendary: 0.03 };
    const lift = 1 + magicFind / 100;
    const roll = rng();
    let cut = (table.legendary ?? 0.03) * lift;
    if (roll < cut) return 'legendary';
    cut += (table.rare ?? 0.14) * lift;
    if (roll < cut) return 'rare';
    cut += (table.magic ?? 0.31) * lift;
    if (roll < cut) return 'magic';
    return 'normal';
  }

  qualityFor(level) {
    const q = ['low', 'medium', 'high', 'elite', 'exotic'];
    return q[Math.min(q.length - 1, Math.floor((level - 1) / 6))];
  }

  /**
   * Roll a drop. Returns an item or null. Uniques and set pieces come out of the same generator
   * Emberveil uses, so a legendary here is a real Emberveil legendary with its own power on it.
   */
  rollDrop({ level = 1, rng = this.rng, magicFind = 0, chance = null, bases = null } = {}) {
    const dropChance = chance ?? (this.b.loot?.dropRate ?? 0.42);
    if (rng() > dropChance) return null;
    const rarity = this.rarityFor(level, rng, magicFind);
    if (rarity === 'legendary') {
      const act = Math.max(1, Math.min(6, Math.ceil(level / 5)));
      const set = this.loot.maybeSetItem(act, rng, this.b.loot?.setChance ?? 0.35);
      if (set) return set;
      const uniques = (this.items.uniques || []).filter(u => (u.act ?? 1) <= act);
      if (uniques.length && rng() < 0.5) return this.loot.generateUnique(rng.pick(uniques).id, rng);
    }
    const pool = bases || this.basesFor(level);
    const baseKey = rng.pick(this.loot.basesForAct(pool, Math.ceil(level / 5)));
    return this.loot.generate(baseKey, rarity, this.qualityFor(level), { rng });
  }

  /** What an item sells for, so the bag can have a "sell" button later. */
  price(item) { return this.loot.price(item); }
}
