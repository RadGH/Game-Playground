// Loot: Emberveil's item generator rebuilt from items.json — bases, rarities, qualities, affixes with restrictions,
// names ("Sharp Longsword of Vitality"), uniques, set pieces, prices, salvage, blacksmith/enchanter, zone + boss drops.
import { makeRng } from './rng.js';
const RARITY = ['normal', 'magic', 'rare', 'legendary'];
export class Loot {
  constructor(data) { this.d = data; this.bases = { ...data.weaponBases, ...data.armorBases }; this.ngPlus = 0; }
  base(key) { return this.bases[key]; }
  /** Affix restriction filter (mirrors the original `filt`). */
  allowed(a, base, rarity) {
    const isWeapon = base.type === 'weapon', isMagicWpn = isWeapon && base.weaponCategory === 'magic', isPhysWpn = isWeapon && base.weaponCategory !== 'magic';
    const isNecklace = base.type === 'accessory' && base.slot === 'necklace', isGloves = base.slot === 'hands', isShield = !!base.isShield, isMagicShield = !!base.isMagicShield, magicPlus = rarity !== 'normal';
    if (a.magicOnly && !(isMagicWpn || isNecklace)) return false; if (a.physicalOnly && !isPhysWpn) return false; if (a.shieldOnly && !isShield) return false; if (a.magicShieldOnly && !isMagicShield) return false; if (a.magicPlus && !magicPlus) return false;
    if (a.slots && !a.slots.includes(base.slot)) return false; if (a.armorTiers && !a.armorTiers.includes(base.tier)) return false; if (a.critSlots && !(isWeapon || isNecklace || isGloves)) return false; return true;
  }
  pool(base, rarity, { extended = true } = {}) { const A = this.d.affixes; return [...A.prefixes, ...A.suffixes, ...A.shield, ...(extended ? A.extended : [])].filter(a => this.allowed(a, base, rarity)); }
  rollValue(a, rng, mult = 1) { return +((a.min + rng() * (a.max - a.min)) * mult).toFixed(2); }
  /** generateItem(baseKey, rarity, quality, { rng, extended }) */
  generate(baseKey, rarity = 'normal', quality = 'medium', opts = {}) {
    const rng = opts.rng || makeRng(); const base = this.base(baseKey); if (!base) return null;
    if (this.ngPlus) rarity = RARITY[Math.min(3, RARITY.indexOf(rarity) + this.ngPlus)];
    const q = this.d.qualityMult[quality] ?? 1;
    const item = { id: 'i_' + Math.floor(rng() * 1e9).toString(36), baseKey, name: base.name, baseName: base.name, type: base.type, subtype: base.subtype || base.slot, slot: base.slot || 'weapon', weaponCategory: base.weaponCategory || null, twoHanded: !!base.twoHanded, offHandOk: !!base.offHandOk, isShield: !!base.isShield, isMagicShield: !!base.isMagicShield, rarity, quality, affixes: [], statScaling: base.statScaling, attackSpeed: base.attackSpeed || 'normal', armorPen: base.armorPen || 0, stunChance: base.stunChance, bleedChance: base.bleedChance, burnChance: base.burnChance, ranged: !!base.ranged };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)]; if (base.armor !== undefined) item.armor = Math.round(base.armor * q); if (base.dodgeBonus) item.dodgeBonus = base.dodgeBonus;
    let [min, max] = this.d.rarityAffixCount[rarity] || [0, 0]; if (base.type === 'accessory') { min += this.d.accessoryAffixBonus; max += this.d.accessoryAffixBonus; }
    const count = min + Math.floor(rng() * (max - min + 1)); const pool = this.pool(base, rarity, opts); const picked = [];
    for (let i = 0; i < count && picked.length < pool.length; i++) { let a, tries = 0; do { a = pool[Math.floor(rng() * pool.length)]; tries++; } while (picked.find(p => p.id === a.id) && tries < 20); if (!picked.find(p => p.id === a.id)) picked.push({ ...a, value: this.rollValue(a, rng) }); }
    item.affixes = picked; this.rename(item);
    // intrinsic stats
    if (base.isShield) item.affixes.push({ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: +base.blockChance.toFixed(2), baseIntrinsic: true }, { id: 'base_block_power', name: 'Base Block Power', stat: 'block_power', value: Math.round(base.blockPower * q), baseIntrinsic: true });
    if (base.isMagicShield) item.affixes.push({ id: 'base_barrier', name: 'Barrier', stat: 'barrier', value: Math.round(base.barrier * q), baseIntrinsic: true }, { id: 'base_barrier_regen', name: 'Barrier Regen', stat: 'barrierRegen', value: Math.round(base.barrierRegen * q), baseIntrinsic: true });
    if (['orb', 'tome'].includes(base.subtype) || base.slot === 'necklace') item.affixes.push({ id: 'base_spell_power', name: 'Base Spell Power', stat: 'spellPower', value: +((['orb', 'tome'].includes(base.subtype) ? 0.15 : 0.08) * q).toFixed(2), baseIntrinsic: true });
    return item;
  }
  /** "<Prefix> <Base> <suffix>" from the first prefix-list and first suffix-list affix. */
  rename(item) { const A = this.d.affixes; const pre = item.affixes.find(a => A.prefixes.some(p => p.id === a.id) || (a.extended && !a.name.startsWith('of '))); const suf = item.affixes.find(a => A.suffixes.some(s => s.id === a.id) || (a.extended && a.name.startsWith('of '))); let n = item.baseName; if (pre) n = `${pre.name} ${n}`; if (suf) n = `${n} ${suf.name}`; item.name = n; return n; }
  generateUnique(id, rng = makeRng()) {
    const u = this.d.uniques.find(x => x.id === id); if (!u) return null; const base = this.base(u.baseItemId); const q = this.d.qualityMult[u.quality] ?? 1.2;
    const item = { id: 'u_' + Math.floor(rng() * 1e9).toString(36), baseKey: u.baseItemId, name: u.name, baseName: u.name, type: base.type, subtype: base.subtype || base.slot, slot: u.slot === 'ring1' ? 'ring' : (u.slot || base.slot || 'weapon'), weaponCategory: base.weaponCategory || null, twoHanded: !!base.twoHanded, offHandOk: !!base.offHandOk, isShield: !!base.isShield, isMagicShield: !!base.isMagicShield, rarity: 'legendary', quality: u.quality, uniqueId: u.id, isUnique: true, legendaryEffectId: u.legendaryEffect, lore: u.lore, statScaling: base.statScaling, attackSpeed: base.attackSpeed || 'normal', armorPen: base.armorPen || 0, ranged: !!base.ranged, affixes: [] };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)]; if (base.armor !== undefined) item.armor = Math.round(base.armor * q);
    for (const f of u.fixedAffixes) item.affixes.push({ id: 'fixed_' + f.stat, name: statName(f.stat), stat: f.stat, value: f.value });
    for (const r of u.randomAffixes) item.affixes.push({ id: 'rand_' + r.stat, name: statName(r.stat), stat: r.stat, value: +(r.min + rng() * (r.max - r.min)).toFixed(2) });
    item.affixes.push({ id: 'legendary_effect', name: 'Legendary', stat: 'cond_legendaryEffect', value: 1, descriptor: this.d.legendaryEffects[u.legendaryEffect] });
    if (base.isShield) item.affixes.push({ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: base.blockChance, baseIntrinsic: true }, { id: 'base_block_power', name: 'Base Block Power', stat: 'block_power', value: Math.round(base.blockPower * q), baseIntrinsic: true });
    return item;
  }
  generateSetItem(setId, pieceIndex, quality = 'high', rng = makeRng()) {
    const set = this.d.sets.find(s => s.id === setId); if (!set) return null; const piece = set.items[pieceIndex % set.items.length]; const base = this.base(piece.baseItemId); const q = this.d.qualityMult[quality] ?? 1;
    const item = { id: 's_' + Math.floor(rng() * 1e9).toString(36), baseKey: piece.baseItemId, name: `${base.name} (${set.name})`, baseName: base.name, type: base.type, subtype: base.subtype || base.slot, slot: piece.slot === 'ring1' ? 'ring' : piece.slot, weaponCategory: base.weaponCategory || null, twoHanded: !!base.twoHanded, offHandOk: !!base.offHandOk, isShield: !!base.isShield, rarity: 'legendary', quality, setId, statScaling: base.statScaling, attackSpeed: base.attackSpeed || 'normal', armorPen: base.armorPen || 0, ranged: !!base.ranged, affixes: [] };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)]; if (base.armor !== undefined) item.armor = Math.round(base.armor * q);
    for (const f of piece.fixedAffixes) item.affixes.push({ id: 'set_fixed_' + f.stat, name: statName(f.stat), stat: f.stat, value: f.value, setFixed: true });
    for (const r of piece.randomAffixes) item.affixes.push({ id: 'set_rand_' + r.stat, name: statName(r.stat), stat: r.stat, value: +(r.min + rng() * (r.max - r.min)).toFixed(2) });
    if (base.isShield) item.affixes.push({ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: base.blockChance, baseIntrinsic: true }, { id: 'base_block_power', name: 'Base Block Power', stat: 'block_power', value: Math.round(base.blockPower * q), baseIntrinsic: true });
    return item;
  }
  /** 3% by default; tier by act. Wired into drops (the original never called it). */
  maybeSetItem(act, rng = makeRng(), chance = 0.03) { if (rng() > chance) return null; const tier = act <= 2 ? 'low' : act <= 4 ? 'mid' : 'endgame'; const sets = this.d.sets.filter(s => s.tier === tier); if (!sets.length) return null; const set = rng.pick(sets); return this.generateSetItem(set.id, rng.int(0, set.items.length - 1), act <= 2 ? 'medium' : act <= 4 ? 'high' : 'elite', rng); }
  price(item) { return Math.round(this.d.basePrice * (this.d.priceQualityMult[item.quality] || 1) * (this.d.priceRarityMult[item.rarity] || 1) * (item.isUnique ? 2 : 1)); }
  sellPrice(item) { return Math.floor(this.price(item) * this.d.sellFactor); }
  salvage(item, rng = makeRng()) { const y = this.d.salvageYield[item.rarity] || this.d.salvageYield.normal; const out = {}; for (const [m, [lo, hi]] of Object.entries(y)) { const n = rng.int(lo, hi); if (n > 0) out[m] = n; } return out; }
  /** Blacksmith / enchanter: add one affix (random or chosen id) at a material tier; respects the cap per rarity. */
  addAffix(item, tierMat, materials, rng = makeRng(), chosenId = null) {
    const cap = { legendary: 6, rare: 4, magic: 2, normal: 0 }[item.rarity] || 0; const real = item.affixes.filter(a => !a.baseIntrinsic); if (real.length >= cap) return { ok: false, why: 'no free affix slot' };
    const tier = this.d.affixTiers.find(t => t.mat === tierMat); if (!tier) return { ok: false, why: 'bad material' }; if ((materials[tierMat] || 0) < tier.cost) return { ok: false, why: `needs ${tier.cost} ${tierMat}` };
    const base = this.base(item.baseKey); const cands = this.pool(base, item.rarity).filter(a => !item.affixes.some(x => x.id === a.id) && (!chosenId || a.id === chosenId)); if (!cands.length) return { ok: false, why: 'nothing to add' };
    const a = rng.pick(cands); item.affixes.push({ ...a, value: this.rollValue(a, rng, tier.mult) }); materials[tierMat] -= tier.cost; this.rename(item); return { ok: true, affix: a };
  }
  promote(item, materials) { const def = this.d.rarityPromote.find(p => p.from === item.rarity); if (!def) return { ok: false, why: 'cannot promote further' }; if ((materials[def.mat] || 0) < def.cost) return { ok: false, why: `needs ${def.cost} ${def.mat}` }; materials[def.mat] -= def.cost; item.rarity = def.to; return { ok: true }; }
  /** Per slain enemy in a zone. */
  zoneDrop(zoneId, rng, { revisit = false, magicFind = 0, act = 1, difficulty = 'normal' } = {}) {
    const z = this.d.zoneDrops[zoneId] || { drop: 0.15, rarity: 'magic', quality: 'medium', bases: ['sword', 'dagger', 'light_chest', 'ring'] };
    const chance = z.drop * (revisit ? 0.5 : 1) * (difficulty === 'hard' ? 1.2 : 1); if (rng() >= chance) return null;
    let rarity = z.rarity; if (z.normalChance != null && rng() < z.normalChance - magicFind) rarity = 'normal';
    return this.maybeSetItem(act, rng) || this.generate(rng.pick(z.bases), rarity, z.quality, { rng });
  }
  bossLoot(bossId, rng) { const t = this.d.bossLoot[bossId]; if (!t) return []; const out = []; if (t.uniques?.length && rng() < (t.uniqueChance ?? 0.15)) { const u = this.generateUnique(rng.pick(t.uniques), rng); if (u) out.push(u); } for (let i = 0; i < t.rolls; i++) { const it = this.generate(rng.pick(t.bases), t.rarity, t.quality, { rng }); if (it) out.push(it); } return out; }
  /** Seeded merchant stock for a town (10 items + potions). */
  merchantStock(townId, act, { seed = 0, ngPlus = 0, fame = 0, heroLvl = 1 } = {}) {
    const m = this.d.merchant; const rng = makeRng((hashStrLocal(`${townId}|ng${ngPlus}|merch`) ^ seed) >>> 0); const bump = (ngPlus > 0 ? 1 : 0) + fameBonus(fame, heroLvl);
    const R = ['normal', 'magic', 'rare', 'legendary'], Q = ['low', 'medium', 'high', 'elite', 'exotic']; const ra = m.rarityByAct[String(Math.min(6, act))], qa = m.qualityByAct[String(Math.min(6, act))];
    const roll = base => { const r = R[Math.min(3, rng.pick(ra) + bump)], q = Q[Math.min(4, rng.pick(qa) + bump)]; const it = this.generate(base, r, q, { rng }); if (it) it.price = this.price(it); return it; };
    const bySlot = slot => Object.keys(this.d.armorBases).filter(k => this.d.armorBases[k].slot === slot && m.bases.includes(k)); const weapons = Object.keys(this.d.weaponBases).filter(k => m.bases.includes(k));
    const out = []; for (const slot of ['chest', 'head', 'feet', 'hands', 'legs']) { const b = bySlot(slot); if (b.length) out.push(roll(rng.pick(b))); }
    if (rng() < 0.5) out.push(roll('ring')); if (rng() < 0.5) out.push(roll('necklace')); if (rng() < 0.7) out.push(roll(rng.pick(weapons))); if (rng() < 0.4) out.push(roll(rng.pick(bySlot('offhand'))));
    while (out.length < 10) out.push(roll(rng.pick(m.bases))); return out.filter(Boolean);
  }
  /** Score an item for comparisons: { offense, defense, utility, total } */
  score(item, hero = null) {
    let off = 0, def = 0, uti = 0; const W = this.d.scoreWeights;
    if (Array.isArray(item.dmg)) off += ((item.dmg[0] + item.dmg[1]) / 2) * 5 * scalingMult(item, hero); if (item.armor > 0) def += item.armor;
    for (const a of item.affixes || []) { const w = W[a.stat]; if (!w) continue; const [axis, weight, pct] = w; const v = (pct ? a.value * 100 : a.value) * weight; if (axis === 'offense') off += v; else if (axis === 'defense') def += v; else uti += v; }
    off = Math.round(off); def = Math.round(def); uti = Math.round(uti); return { offense: off, defense: def, utility: uti, total: off + def + uti };
  }
  /** Sum of affix stats across equipped items (+ set bonuses). Keys as stored (str, dex, hp, dmg, armor, critChance…). */
  equipmentBonuses(equipment) {
    const out = {}; const add = (k, v) => { out[k] = (out[k] || 0) + v; };
    for (const it of Object.values(equipment || {})) { if (!it) continue; for (const a of it.affixes || []) if (typeof a.value === 'number' && a.stat) add(norm(a.stat), a.stat === 'spellPower' && a.value >= 1 ? a.value * 0.05 : a.value); }
    for (const s of this.activeSets(equipment)) for (const b of s.bonuses) for (const [k, v] of Object.entries(b)) if (k !== 'desc' && typeof v === 'number') add(norm(k), v);
    return out;
  }
  activeSets(equipment) {
    const items = Object.values(equipment || {}).filter(Boolean); const out = [];
    for (const set of this.d.sets) { let count = items.filter(i => i.setId === set.id).length; if (!count) continue; if (items.some(i => i.affixes?.some(a => a.stat === 'cond_extraSetPiece'))) count = Math.min(set.pieces, count + 1); const bonuses = Object.entries(set.partialBonuses).filter(([t]) => count >= +t).map(([, b]) => b); out.push({ set, count, bonuses, legendaryActive: count >= set.activationPieces }); }
    return out;
  }
  legendaryEffects(equipment) { const ids = new Set(); for (const it of Object.values(equipment || {})) if (it?.legendaryEffectId) ids.add(it.legendaryEffectId); for (const s of this.activeSets(equipment)) if (s.legendaryActive) ids.add(s.set.legendaryEffect); return [...ids]; }
  describe(a) { const pct = ['critChance', 'critDamage', 'spellPower', 'goldFind', 'magicFind', 'xpFind', 'cooldownReduction', 'block_chance'].includes(a.stat) || String(a.stat).startsWith('cond_') && a.value < 1; const v = pct ? `${Math.round(a.value * 100)}%` : (Number.isInteger(a.value) ? a.value : a.value.toFixed(1)); return a.descriptor && a.id === 'legendary_effect' ? a.descriptor : `+${v} ${statName(a.stat)}`; }
}
function norm(k) { return ({ gold_find: 'goldFind', mana_regen: 'manaRegen', magic_resist: 'magicResist', crit_chance: 'critChance', crit_damage: 'critDamage', spell_power: 'spellPower', magic_find: 'magicFind', barrier_regen: 'barrierRegen', hp_regen: 'hpRegen' })[k] || k; }
function scalingMult(item, hero) { if (!hero || !item.statScaling || item.type !== 'weapon') return 1; const p = (hero.primaryAttr || 'STR').toLowerCase(); const parts = item.statScaling.split('_'); if (parts[0] === p) return 1.5; if (parts.includes(p)) return 1.15; return 0.55; }
const NAMES = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', con: 'Constitution', hp: 'Max HP', mp: 'Max MP', hit: 'Hit', dodge: 'Dodge', armor: 'Armor', dmg: 'Damage', initiative: 'Initiative', critChance: 'Crit Chance', critDamage: 'Crit Damage', spellPower: 'Spell Power', lifeSteal: 'Life Steal', manaSteal: 'Mana Steal', manaRegen: 'Mana Regen', mana_regen: 'Mana Regen', magicResist: 'Magic Resist', block_chance: 'Block Chance', block_power: 'Block Power', goldFind: 'Gold Find', magicFind: 'Magic Find', xpFind: 'XP Gain', barrier: 'Barrier', barrierRegen: 'Barrier Regen', hpRegen: 'HP Regen', cooldownReduction: 'Cooldown Reduction' };
export function statName(stat) { return NAMES[stat] || String(stat).replace(/^cond_/, '').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }
function fameBonus(fame, lvl) { const r = Math.max(fame || 0, 50 * (lvl || 1)); return r >= 2000 ? 2 : r >= 500 ? 1 : 0; }
function hashStrLocal(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
