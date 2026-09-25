// Loot: Emberveil's item generator rebuilt from items.json — bases, rarities, qualities, affixes with restrictions,
// names ("Sharp Longsword of Vitality"), uniques, set pieces, prices, salvage, blacksmith/enchanter, zone + boss drops.
import { makeRng } from './rng.js';
import { describeAffixStat, describeLegendary } from './effects.js';
const RARITY = ['normal', 'magic', 'rare', 'legendary'];
export class Loot {
  /** `tuning` is data/balance.json's `loot` + `economy.globalMultipliers` block — drop rate, affix size, shop price. */
  constructor(data, tuning = {}) { this.d = data; this.bases = { ...data.weaponBases, ...data.armorBases }; this.ngPlus = 0; this.T = { affixMult: 1, dropRate: 1, setChance: 0.03, uniqueChance: 1, shopPrice: 1, ...tuning }; }
  base(key) { return this.bases[key]; }
  /** Affix restriction filter (mirrors the original `filt`). */
  allowed(a, base, rarity) {
    const isWeapon = base.type === 'weapon', isMagicWpn = isWeapon && base.weaponCategory === 'magic', isPhysWpn = isWeapon && base.weaponCategory !== 'magic';
    const isNecklace = base.type === 'accessory' && base.slot === 'necklace', isGloves = base.slot === 'hands', isShield = !!base.isShield, isMagicShield = !!base.isMagicShield, magicPlus = rarity !== 'normal';
    if (a.magicOnly && !(isMagicWpn || isNecklace)) return false; if (a.physicalOnly && !isPhysWpn) return false; if (a.shieldOnly && !isShield) return false; if (a.magicShieldOnly && !isMagicShield) return false; if (a.magicPlus && !magicPlus) return false;
    if (a.slots && !a.slots.includes(base.slot)) return false; if (a.armorTiers && !a.armorTiers.includes(base.tier)) return false; if (a.critSlots && !(isWeapon || isNecklace || isGloves)) return false; return true;
  }
  pool(base, rarity, { extended = true } = {}) { const A = this.d.affixes; return [...A.prefixes, ...A.suffixes, ...A.shield, ...(extended ? A.extended : [])].filter(a => this.allowed(a, base, rarity)); }
  rollValue(a, rng, mult = 1) { return +((a.min + rng() * (a.max - a.min)) * mult * (this.T?.affixMult ?? 1)).toFixed(2); }
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
    this.addIntrinsics(item, base);
    return item;
  }
  /** "<Prefix> <Base> <suffix>" from the first prefix-list and first suffix-list affix. */
  rename(item) { const A = this.d.affixes; const pre = item.affixes.find(a => A.prefixes.some(p => p.id === a.id) || (a.extended && !a.name.startsWith('of '))); const suf = item.affixes.find(a => A.suffixes.some(s => s.id === a.id) || (a.extended && a.name.startsWith('of '))); let n = item.baseName; if (pre) n = `${pre.name} ${n}`; if (suf) n = `${n} ${suf.name}`; item.name = n; return n; }
  /** A base's built-in properties (the road weapons): pushed as affixes so every system already reads them. */
  addIntrinsics(item, base) {
    for (const f of base.intrinsic || []) item.affixes.push({ id: 'base_' + f.stat, name: f.name || statName(f.stat), stat: f.stat, value: f.value, baseIntrinsic: true, intrinsic: true });
    if (base.look) item.look = { ...base.look };
    if (base.minAct) item.minAct = base.minAct;
    return item;
  }
  /** The keys in `list` a party in this act can find (bases carry `minAct`). */
  basesForAct(list, act = 99) { const out = (list || []).filter(k => (this.base(k)?.minAct || 0) <= act); return out.length ? out : (list || []); }
  generateUnique(id, rng = makeRng()) {
    const u = this.d.uniques.find(x => x.id === id); if (!u) return null; const base = this.base(u.baseItemId); const q = this.d.qualityMult[u.quality] ?? 1.2;
    const item = { id: 'u_' + Math.floor(rng() * 1e9).toString(36), baseKey: u.baseItemId, name: u.name, baseName: u.name, type: base.type, subtype: base.subtype || base.slot, slot: u.slot === 'ring1' ? 'ring' : (u.slot || base.slot || 'weapon'), weaponCategory: base.weaponCategory || null, twoHanded: !!base.twoHanded, offHandOk: !!base.offHandOk, isShield: !!base.isShield, isMagicShield: !!base.isMagicShield, rarity: 'legendary', quality: u.quality, uniqueId: u.id, isUnique: true, legendaryEffectId: u.legendaryEffect, lore: u.lore, statScaling: base.statScaling, attackSpeed: base.attackSpeed || 'normal', armorPen: base.armorPen || 0, ranged: !!base.ranged, affixes: [] };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)]; if (base.armor !== undefined) item.armor = Math.round(base.armor * q);
    for (const f of u.fixedAffixes) item.affixes.push({ id: 'fixed_' + f.stat, name: statName(f.stat), stat: f.stat, value: f.value });
    for (const r of u.randomAffixes) item.affixes.push({ id: 'rand_' + r.stat, name: statName(r.stat), stat: r.stat, value: +(r.min + rng() * (r.max - r.min)).toFixed(2) });
    item.affixes.push({ id: 'legendary_effect', name: 'Legendary', stat: 'cond_legendaryEffect', value: 1, legendaryId: u.legendaryEffect, descriptor: this.d.legendaryEffects[u.legendaryEffect] });
    this.addIntrinsics(item, base); if (u.look) item.look = { ...u.look }; item.act = u.act;
    if (base.isShield) item.affixes.push({ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: base.blockChance, baseIntrinsic: true }, { id: 'base_block_power', name: 'Base Block Power', stat: 'block_power', value: Math.round(base.blockPower * q), baseIntrinsic: true });
    return item;
  }
  generateSetItem(setId, pieceIndex, quality = 'high', rng = makeRng()) {
    const set = this.d.sets.find(s => s.id === setId); if (!set) return null; const piece = set.items[pieceIndex % set.items.length]; const base = this.base(piece.baseItemId); const q = this.d.qualityMult[quality] ?? 1;
    // Class sets (round 22) give every piece its own name ("Longwatch Hood"); the ported sets keep "Heavy Helm (Iron Brigade)".
    const item = { id: 's_' + Math.floor(rng() * 1e9).toString(36), baseKey: piece.baseItemId, name: piece.name || `${base.name} (${set.name})`, baseName: base.name, type: base.type, subtype: base.subtype || base.slot, slot: piece.slot === 'ring1' ? 'ring' : piece.slot, weaponCategory: base.weaponCategory || null, twoHanded: !!base.twoHanded, offHandOk: !!base.offHandOk, isShield: !!base.isShield, isMagicShield: !!base.isMagicShield, rarity: 'legendary', quality, setId, setName: set.name, statScaling: base.statScaling, attackSpeed: base.attackSpeed || 'normal', armorPen: base.armorPen || 0, ranged: !!base.ranged, affixes: [] };
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)]; if (base.armor !== undefined) item.armor = Math.round(base.armor * q);
    for (const f of piece.fixedAffixes) item.affixes.push({ id: 'set_fixed_' + f.stat, name: statName(f.stat), stat: f.stat, value: f.value, setFixed: true });
    for (const r of piece.randomAffixes) item.affixes.push({ id: 'set_rand_' + r.stat, name: statName(r.stat), stat: r.stat, value: +(r.min + rng() * (r.max - r.min)).toFixed(2) });
    this.addIntrinsics(item, base);
    if (base.isShield) item.affixes.push({ id: 'base_block_chance', name: 'Base Block', stat: 'block_chance', value: base.blockChance, baseIntrinsic: true }, { id: 'base_block_power', name: 'Base Block Power', stat: 'block_power', value: Math.round(base.blockPower * q), baseIntrinsic: true });
    if (base.isMagicShield) item.affixes.push({ id: 'base_barrier', name: 'Barrier', stat: 'barrier', value: Math.round(base.barrier * q), baseIntrinsic: true }, { id: 'base_barrier_regen', name: 'Barrier Regen', stat: 'barrierRegen', value: Math.round(base.barrierRegen * q), baseIntrinsic: true });
    return item;
  }
  /** Set tier a party in this act finds: acts 1-2 low, 3-4 mid, 5-6 endgame. */
  setTier(act) { return act <= 2 ? 'low' : act <= 4 ? 'mid' : 'endgame'; }
  /**
   * Which set a set drop comes from. `classSetShare` of the time (data/balance.json loot) it is one of the sets
   * made for a class in the party, from this act's tier or an easier one — so a party actually collects pieces
   * it can wear. Otherwise any set of the act's tier. `partyClasses` is set by the game (main.js) as a function
   * returning the party's class ids; without it (node tests, the simulator) every set of the tier is equally likely.
   */
  pickSet(act, rng) {
    const TIERS = ['low', 'mid', 'endgame']; const tier = this.setTier(act); const reach = TIERS.slice(0, TIERS.indexOf(tier) + 1);
    const classes = typeof this.partyClasses === 'function' ? (this.partyClasses() || []) : (this.partyClasses || []);
    if (classes.length && rng() < (this.T?.classSetShare ?? 0.6)) {
      const mine = this.d.sets.filter(s => reach.includes(s.tier) && (s.classes || []).some(c => classes.includes(c)));
      if (mine.length) return rng.pick(mine);
    }
    const sets = this.d.sets.filter(s => s.tier === tier); return sets.length ? rng.pick(sets) : null;
  }
  /** `chance` is the share of zone drops that come out as a set piece (balance.json loot.setChance). Wired into drops (the original never called it). */
  maybeSetItem(act, rng = makeRng(), chance = this.T?.setChance ?? 0.03) { if (rng() > chance) return null; const set = this.pickSet(act, rng); if (!set) return null; return this.generateSetItem(set.id, rng.int(0, set.items.length - 1), act <= 2 ? 'medium' : act <= 4 ? 'high' : 'elite', rng); }
  /**
   * Set progress for one item against what a hero wears: the set, how many pieces are on, which pieces
   * those are, every threshold with its bonus and whether it is on, and what wearing `item` would change.
   * `withItem` counts the item as worn (replacing whatever same-set piece sits in `slot`, if any).
   */
  setInfo(item, equipment = {}, { slot = null } = {}) {
    const set = item?.setId && this.d.sets.find(s => s.id === item.setId); if (!set) return null;
    const worn = Object.entries(equipment || {}).filter(([, i]) => i?.setId === set.id);
    const wearing = worn.some(([, i]) => i === item || i.id === item.id);
    const replaced = slot && equipment?.[slot]?.setId === set.id && equipment[slot] !== item;
    const withItem = wearing ? worn.length : worn.length + (replaced ? 0 : 1);
    const steps = Object.entries(set.partialBonuses).map(([t, b]) => ({ at: +t, bonus: b, power: set.thresholdPowers?.[t] || null })).sort((a, b) => a.at - b.at);
    if (!steps.some(s => s.at === set.activationPieces)) steps.push({ at: set.activationPieces, bonus: {}, power: null });
    for (const s of steps) { if (s.at === set.activationPieces) s.legendary = set.legendaryEffect; s.on = worn.length >= s.at; s.onWith = withItem >= s.at; }
    return { set, pieces: set.items.length, worn: worn.length, wearing, withItem, wornNames: worn.map(([, i]) => i.name), pieceList: set.items.map(p => ({ slot: p.slot, name: p.name || `${this.base(p.baseItemId)?.name || p.baseItemId} (${set.name})`, on: worn.some(([, i]) => i.baseKey === p.baseItemId && (!p.name || i.name === p.name)) })), steps, classes: set.classes || [] };
  }
  price(item) { return Math.round(this.d.basePrice * (this.T?.shopPrice ?? 1) * (this.d.priceQualityMult[item.quality] || 1) * (this.d.priceRarityMult[item.rarity] || 1) * (item.isUnique ? 2 : 1)); }
  sellPrice(item) { return Math.floor(this.price(item) / (this.T?.shopPrice ?? 1) * this.d.sellFactor); }
  salvage(item, rng = makeRng()) { const y = this.d.salvageYield[item.rarity] || this.d.salvageYield.normal; const out = {}; for (const [m, [lo, hi]] of Object.entries(y)) { const n = rng.int(lo, hi); if (n > 0) out[m] = n; } return out; }
  /** Blacksmith / enchanter: add one affix (random or chosen id) at a material tier; respects the cap per rarity. */
  addAffix(item, tierMat, materials, rng = makeRng(), chosenId = null) {
    const cap = { legendary: 6, rare: 4, magic: 2, normal: 0 }[item.rarity] || 0; const real = item.affixes.filter(a => !a.baseIntrinsic); if (real.length >= cap) return { ok: false, why: 'no free affix slot' };
    const tier = this.d.affixTiers.find(t => t.mat === tierMat); if (!tier) return { ok: false, why: 'bad material' }; if ((materials[tierMat] || 0) < tier.cost) return { ok: false, why: `needs ${tier.cost} ${tierMat}` };
    const base = this.base(item.baseKey); const cands = this.pool(base, item.rarity).filter(a => !item.affixes.some(x => x.id === a.id) && (!chosenId || a.id === chosenId)); if (!cands.length) return { ok: false, why: 'nothing to add' };
    const a = rng.pick(cands); item.affixes.push({ ...a, value: this.rollValue(a, rng, tier.mult) }); materials[tierMat] -= tier.cost; this.rename(item); return { ok: true, affix: a };
  }
  promote(item, materials) { const def = this.d.rarityPromote.find(p => p.from === item.rarity); if (!def) return { ok: false, why: 'cannot promote further' }; if ((materials[def.mat] || 0) < def.cost) return { ok: false, why: `needs ${def.cost} ${def.mat}` }; materials[def.mat] -= def.cost; item.rarity = def.to; return { ok: true }; }

  // ---------------------------------------------------------------- town services (round 22, E47)
  // Costs and caps come from data/balance.json `services` (passed in as `S`). Every action has a quote — what
  // it costs, the item as it will be afterwards (`preview`), or why it cannot be done (`why`, `capped` when a
  // limit was hit) — and an apply that re-quotes, spends from `wallet.gold` and changes the item IN PLACE, so
  // every screen that holds the item (bag, party tab, stage, an open card) shows the new one.
  // Add and reroll roll from a seed made of the item id and how often it has been worked on, so the preview is
  // exactly the result and opening the screen again cannot fish for a better roll.

  /** The name generate() would give this item ("Sharp Longsword of Vitality"). */
  autoName(item) { return this.rename({ ...item }); }
  /** Does the item still carry its generated name? Uniques, set pieces and renamed items ("Corvin's Sword") keep theirs. */
  keepsName(item) { return !item.isUnique && !item.setId && !item.earnedName && item.name === this.autoName(item); }
  costMult(item, S) { return S?.rarityCostMult?.[item.rarity] ?? 1; }
  canWorkOn(item) { return !!item && item.type !== 'consumable' && !!this.base(item.baseKey); }
  /** A copy for previews: numbers and property objects copied, so a preview never changes the real item. */
  previewCopy(item) { return { ...item, dmg: Array.isArray(item.dmg) ? [...item.dmg] : item.dmg, affixes: (item.affixes || []).map(a => ({ ...a })) }; }
  /** Set a quality and recompute what hangs off it: damage, armour, block power, barrier, an orb's spell power. */
  applyQuality(item, quality) {
    const base = this.base(item.baseKey); const q = this.d.qualityMult[quality] ?? 1; item.quality = quality; if (!base) return item;
    if (base.dmg) item.dmg = [Math.round(base.dmg[0] * q), Math.round(base.dmg[1] * q)];
    if (base.armor !== undefined) item.armor = Math.round(base.armor * q);
    for (const a of item.affixes || []) {
      if (a.id === 'base_block_power' && base.blockPower) a.value = Math.round(base.blockPower * q);
      else if (a.id === 'base_barrier' && base.barrier) a.value = Math.round(base.barrier * q);
      else if (a.id === 'base_barrier_regen' && base.barrierRegen) a.value = Math.round(base.barrierRegen * q);
      else if (a.id === 'base_spell_power') a.value = +((['orb', 'tome'].includes(base.subtype) ? 0.15 : 0.08) * q).toFixed(2);
    }
    return item;
  }
  /** Blacksmith: one quality step up, capped by the act. → { ok, why, capped, from, to, gold, cap, preview } */
  upgradeQuote(item, S, act = 1) {
    const B = S?.blacksmith; if (!B) return { ok: false, why: 'there is no smith here' };
    if (!this.canWorkOn(item)) return { ok: false, why: 'the smith does not work on that' };
    const order = B.qualityOrder || ['low', 'medium', 'high', 'elite', 'exotic']; const i = order.indexOf(item.quality);
    const capQ = B.maxQualityByAct?.[String(Math.max(0, Math.min(6, act)))] || order[order.length - 1]; const cap = order.indexOf(capQ);
    if (i < 0) return { ok: false, why: `nobody knows what "${item.quality}" quality is` };
    if (i >= order.length - 1) return { ok: false, capped: true, from: item.quality, cap: capQ, why: `already ${item.quality} — nothing is finer` };
    if (i >= cap) return { ok: false, capped: true, from: item.quality, cap: capQ, why: `${capQ} is the finest work a smith can manage this far along the road` };
    const to = order[i + 1]; const gold = Math.round((B.upgradeGold?.[to] || 0) * this.costMult(item, S));
    return { ok: true, from: item.quality, to, gold, cap: capQ, preview: this.applyQuality(this.previewCopy(item), to) };
  }
  upgradeQuality(item, wallet, S, act = 1) {
    const q = this.upgradeQuote(item, S, act); if (!q.ok) return q;
    if ((wallet.gold || 0) < q.gold) return { ...q, ok: false, why: `needs ${q.gold} gold, you have ${wallet.gold || 0}` };
    wallet.gold -= q.gold; this.applyQuality(item, q.to); item.smithed = (item.smithed || 0) + 1; return { ...q, ok: true, item };
  }
  /** Enchanter: property slots by rarity (normal 0, magic 2, rare 4, legendary 6). */
  affixCap(item, S) { return (S?.enchanter?.affixCap || { normal: 0, magic: 2, rare: 4, legendary: 6 })[item.rarity] ?? 0; }
  /** The properties that take up those slots (not the base item's own block/barrier, not a unique's legendary power). */
  ownAffixes(item) { return (item.affixes || []).filter(a => !a.baseIntrinsic && a.id !== 'legendary_effect'); }
  /** Only properties that came from the affix pool (they carry a min/max) can be rewoven — never a unique's or a set's fixed powers. */
  rerollable(a) { return !!a && !a.baseIntrinsic && !a.setFixed && a.id !== 'legendary_effect' && a.min != null && a.max != null; }
  enchantRng(item, what) { return makeRng(hashStrLocal(`${item.id}|${what}|${item.enchants || 0}|${item.rerolls || 0}`)); }
  /** Pool properties that fit the item and are not on it yet (by id or by stat). `except` is the one being replaced. */
  candidates(item, except = null) { const base = this.base(item.baseKey); if (!base) return []; return this.pool(base, item.rarity).filter(c => !(item.affixes || []).some(x => x !== except && !x.baseIntrinsic && (x.id === c.id || x.stat === c.stat))); }
  addQuote(item, S) {
    const E = S?.enchanter; if (!E) return { ok: false, why: 'there is no enchanter here' };
    if (!this.canWorkOn(item)) return { ok: false, why: 'there is nothing to bind a property to' };
    const cap = this.affixCap(item, S), have = this.ownAffixes(item).length;
    if (!cap) return { ok: false, cap, have, why: `a ${item.rarity} item has no room for a property — raise its rarity first` };
    if (have >= cap) return { ok: false, capped: true, cap, have, why: `all ${cap} property slots are taken — reroll one instead` };
    const cands = this.candidates(item); if (!cands.length) return { ok: false, cap, have, why: 'every property that fits this item is already on it' };
    const rng = this.enchantRng(item, 'add'); const c = rng.pick(cands); const affix = { ...c, value: this.rollValue(c, rng), enchanted: true };
    const gold = Math.round(E.addGold * (1 + (E.addPerAffix || 0) * have) * this.costMult(item, S));
    const preview = this.previewCopy(item); preview.affixes.push({ ...affix }); if (this.keepsName(item)) this.rename(preview);
    return { ok: true, gold, affix, cap, have, choices: cands.length, preview };
  }
  enchantAdd(item, wallet, S) {
    const q = this.addQuote(item, S); if (!q.ok) return q;
    if ((wallet.gold || 0) < q.gold) return { ...q, ok: false, why: `needs ${q.gold} gold, you have ${wallet.gold || 0}` };
    const auto = this.keepsName(item); wallet.gold -= q.gold; item.affixes.push({ ...q.affix }); item.enchants = (item.enchants || 0) + 1; if (auto) this.rename(item);
    return { ...q, ok: true, item };
  }
  /** Reroll the property at `index` in item.affixes into a different one. Each reroll of the same item costs more. */
  rerollQuote(item, index, S) {
    const E = S?.enchanter; if (!E) return { ok: false, why: 'there is no enchanter here' };
    const a = item?.affixes?.[index]; if (!a) return { ok: false, why: 'there is no such property' };
    if (!this.rerollable(a)) return { ok: false, why: a.setFixed || a.id === 'legendary_effect' || String(a.id).startsWith('fixed_') ? 'that power is what the item is — it cannot be rewoven' : 'that is part of the item itself, not a property' };
    const n = item.rerolls || 0, max = E.maxRerolls ?? 10;
    if (n >= max) return { ok: false, capped: true, rerolls: n, max, why: `rerolled ${n} times already — the threads will not take another` };
    const cands = this.candidates(item, a).filter(c => c.id !== a.id); if (!cands.length) return { ok: false, why: 'nothing else fits this item' };
    const rng = this.enchantRng(item, 'reroll:' + index); const c = rng.pick(cands); const affix = { ...c, value: this.rollValue(c, rng), enchanted: true };
    const gold = Math.round(E.rerollGold * Math.pow(E.rerollGrowth || 1, n) * this.costMult(item, S));
    const preview = this.previewCopy(item); preview.affixes[index] = { ...affix }; if (this.keepsName(item)) this.rename(preview);
    return { ok: true, gold, from: a, affix, index, rerolls: n, max, preview };
  }
  enchantReroll(item, index, wallet, S) {
    const q = this.rerollQuote(item, index, S); if (!q.ok) return q;
    if ((wallet.gold || 0) < q.gold) return { ...q, ok: false, why: `needs ${q.gold} gold, you have ${wallet.gold || 0}` };
    const auto = this.keepsName(item); wallet.gold -= q.gold; item.affixes[index] = { ...q.affix }; item.rerolls = (item.rerolls || 0) + 1; if (auto) this.rename(item);
    return { ...q, ok: true, item };
  }
  /** Raise rarity one step (normal → magic → rare → legendary): gold, plus a material for the top two steps. More property slots. */
  promoteQuote(item, S) {
    const E = S?.enchanter; if (!E) return { ok: false, why: 'there is no enchanter here' };
    if (!this.canWorkOn(item)) return { ok: false, why: 'there is nothing to work on' };
    if (item.isUnique || item.setId) return { ok: false, capped: true, why: 'a unique or a set piece is already as rare as it gets' };
    const def = this.d.rarityPromote.find(p => p.from === item.rarity); if (!def) return { ok: false, capped: true, why: `already ${item.rarity}` };
    const mat = E.promoteMaterial?.[def.to] || null; const preview = this.previewCopy(item); preview.rarity = def.to;
    return { ok: true, from: item.rarity, to: def.to, gold: Math.round(E.promoteGold?.[def.to] || 0), material: mat ? { id: mat[0], n: mat[1] } : null, slotsFrom: this.affixCap(item, S), slotsTo: this.affixCap(preview, S), preview };
  }
  enchantPromote(item, wallet, materials, S) {
    const q = this.promoteQuote(item, S); if (!q.ok) return q;
    if ((wallet.gold || 0) < q.gold) return { ...q, ok: false, why: `needs ${q.gold} gold, you have ${wallet.gold || 0}` };
    if (q.material && (materials?.[q.material.id] || 0) < q.material.n) return { ...q, ok: false, why: `needs ${q.material.n} ${String(q.material.id).replace('_', ' ')} (salvage a rare or legendary item for it)` };
    wallet.gold -= q.gold; if (q.material) materials[q.material.id] -= q.material.n; item.rarity = q.to; return { ...q, ok: true, item };
  }
  /** Per slain enemy in a zone. */
  zoneDrop(zoneId, rng, { revisit = false, magicFind = 0, act = 1, difficulty = 'normal' } = {}) {
    const z = this.d.zoneDrops[zoneId] || { drop: 0.15, rarity: 'magic', quality: 'medium', bases: ['sword', 'dagger', 'light_chest', 'ring'] };
    const chance = z.drop * (this.T?.dropRate ?? 1) * (revisit ? 0.5 : 1) * (difficulty === 'hard' ? 1.2 : 1); if (rng() >= chance) return null;
    let rarity = z.rarity; if (z.normalChance != null && rng() < z.normalChance - magicFind) rarity = 'normal';
    // `downshift` drops a roll one rarity step: a legendary zone should not hand out a legendary every time.
    else if (z.downshift && rng() < z.downshift - magicFind) rarity = RARITY[Math.max(0, RARITY.indexOf(rarity) - 1)];
    return this.maybeSetItem(act, rng) || this.generate(rng.pick(this.basesForAct(z.bases, act)), rarity, z.quality, { rng });
  }
  bossLoot(bossId, rng) { const t = this.d.bossLoot[bossId]; if (!t) return []; const out = []; if (t.uniques?.length && rng() < (t.uniqueChance ?? 0.15) * (this.T?.uniqueChance ?? 1)) { const u = this.generateUnique(rng.pick(t.uniques), rng); if (u) out.push(u); } for (let i = 0; i < t.rolls; i++) { const it = this.generate(rng.pick(t.bases), t.rarity, t.quality, { rng }); if (it) out.push(it); } return out; }
  /** Seeded merchant stock for a town (10 items + potions). */
  merchantStock(townId, act, { seed = 0, ngPlus = 0, fame = 0, heroLvl = 1 } = {}) {
    const m = this.d.merchant; const rng = makeRng((hashStrLocal(`${townId}|ng${ngPlus}|merch`) ^ seed) >>> 0); const bump = (ngPlus > 0 ? 1 : 0) + fameBonus(fame, heroLvl);
    const R = ['normal', 'magic', 'rare', 'legendary'], Q = ['low', 'medium', 'high', 'elite', 'exotic']; const ra = m.rarityByAct[String(Math.min(6, act))], qa = m.qualityByAct[String(Math.min(6, act))];
    const roll = base => { const r = R[Math.min(3, rng.pick(ra) + bump)], q = Q[Math.min(4, rng.pick(qa) + bump)]; const it = this.generate(base, r, q, { rng }); if (it) it.price = this.price(it); return it; };
    const stock = this.basesForAct(m.bases, act);
    const bySlot = slot => Object.keys(this.d.armorBases).filter(k => this.d.armorBases[k].slot === slot && stock.includes(k)); const weapons = Object.keys(this.d.weaponBases).filter(k => stock.includes(k));
    const out = []; for (const slot of ['chest', 'head', 'feet', 'hands', 'legs']) { const b = bySlot(slot); if (b.length) out.push(roll(rng.pick(b))); }
    if (rng() < 0.5) out.push(roll('ring')); if (rng() < 0.5) out.push(roll('necklace')); if (rng() < 0.7) out.push(roll(rng.pick(weapons))); if (rng() < 0.4) out.push(roll(rng.pick(bySlot('offhand'))));
    while (out.length < 10) out.push(roll(rng.pick(stock))); return out.filter(Boolean);
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
    const extraPiece = items.some(i => i.affixes?.some(a => a.stat === 'cond_extraSetPiece'));
    const cut = items.some(i => i.affixes?.some(a => a.stat === 'cond_setThresholdReduce')) ? 1 : 0;
    for (const set of this.d.sets) { let count = items.filter(i => i.setId === set.id).length; if (!count) continue; if (extraPiece) count = Math.min(set.pieces, count + 1); const eff = count + cut; const bonuses = Object.entries(set.partialBonuses).filter(([t]) => eff >= +t).map(([, b]) => b); const powers = Object.entries(set.thresholdPowers || {}).filter(([t]) => eff >= +t).map(([, id]) => id); const next = Object.keys(set.partialBonuses).map(Number).filter(t => t > eff).sort((a, b) => a - b)[0] || null; out.push({ set, count, eff, bonuses, powers, next, legendaryActive: eff >= set.activationPieces }); }
    return out;
  }
  /** Legendary powers on: unique items, full sets, and set threshold powers (round 22: `thresholdPowers` {"4": id}). */
  legendaryEffects(equipment) { const ids = new Set(); for (const it of Object.values(equipment || {})) if (it?.legendaryEffectId) ids.add(it.legendaryEffectId); for (const s of this.activeSets(equipment)) { if (s.legendaryActive) ids.add(s.set.legendaryEffect); for (const p of s.powers || []) ids.add(p); } return [...ids]; }
  /** Plain-language line for one affix — the effects registry first, then a generic "+N Stat". */
  describe(a) {
    if (a.id === 'legendary_effect') return a.legendaryId && describeLegendary(a.legendaryId) || a.descriptor || 'carries a legendary power';
    const fromRegistry = describeAffixStat(a.stat, a.value); if (fromRegistry) return fromRegistry;
    const pct = ['critChance', 'critDamage', 'spellPower', 'goldFind', 'magicFind', 'xpFind', 'cooldownReduction', 'block_chance'].includes(a.stat) || String(a.stat).startsWith('cond_') && a.value < 1;
    const v = pct ? `${Math.round(a.value * 100)}%` : (Number.isInteger(a.value) ? a.value : a.value.toFixed(1));
    return `+${v} ${statName(a.stat)}`;
  }
}
function norm(k) { return ({ gold_find: 'goldFind', mana_regen: 'manaRegen', magic_resist: 'magicResist', crit_chance: 'critChance', crit_damage: 'critDamage', spell_power: 'spellPower', magic_find: 'magicFind', barrier_regen: 'barrierRegen', hp_regen: 'hpRegen' })[k] || k; }
function scalingMult(item, hero) { if (!hero || !item.statScaling || item.type !== 'weapon') return 1; const p = (hero.primaryAttr || 'STR').toLowerCase(); const parts = item.statScaling.split('_'); if (parts[0] === p) return 1.5; if (parts.includes(p)) return 1.15; return 0.55; }
const NAMES = { str: 'Strength', dex: 'Dexterity', int: 'Intelligence', con: 'Constitution', hp: 'Max HP', mp: 'Max MP', hit: 'Hit', dodge: 'Dodge', armor: 'Armor', dmg: 'Damage', initiative: 'Initiative', critChance: 'Crit Chance', critDamage: 'Crit Damage', spellPower: 'Spell Power', lifeSteal: 'Life Steal', manaSteal: 'Mana Steal', manaRegen: 'Mana Regen', mana_regen: 'Mana Regen', magicResist: 'Magic Resist', block_chance: 'Block Chance', block_power: 'Block Power', goldFind: 'Gold Find', magicFind: 'Magic Find', xpFind: 'XP Gain', barrier: 'Barrier', barrierRegen: 'Barrier Regen', hpRegen: 'HP Regen', cooldownReduction: 'Cooldown Reduction' };
export function statName(stat) { return NAMES[stat] || String(stat).replace(/^cond_/, '').replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()); }
function fameBonus(fame, lvl) { const r = Math.max(fame || 0, 50 * (lvl || 1)); return r >= 2000 ? 2 : r >= 500 ? 1 : 0; }
function hashStrLocal(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
