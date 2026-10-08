// Thousandvale — TEMPERING: improving gear you already own (round 8, W9; stream P-core). Pure.
//
// The ideas are Farhold's Upgrade tab (prototypes/farhold/js/craft.js: temper / promote / reweave / brand) — none of its
// code or UI. Everything here works on a plain item object with stream C's engine (`rulesEngine()` of js/rules/index.js):
// its item tables for the quality ladder, its own item maker for new properties (so a property is always rolled the way a
// drop of that level rolls it), and tv-gear.js's `canConvert` / `convertWeapon` for the brand.
//
//   matClassOf(engine, item)                    -> 'metal' | 'leather' | 'cloth' | 'wood'   (what the item is made of)
//   temperCost(P, engine, op, item, listPrice)  -> { needs: [{ id, n }], gold, skill, tier }
//   temperCheck(P, engine, op, item, { index, element, skill }) -> { ok, text (what it will do) } | { ok:false, why, text }
//   temperApply(P, engine, op, item, { index, element, rng, quality }) -> { ok, text, was?, now? }   (mutates `item`)
//
// The four works (data/rules/professions.json `temper.ops`):
//   temper_quality  the quality one step up (low -> medium -> high -> elite -> exotic), as far as your skill allows;
//                   damage / armour and every rolled property scale by the same ratio the item tables use
//   temper_promote  normal -> magic -> rare, and one new property comes with it. Never above rare.
//   temper_reweave  the ONE property you pick is replaced by a different one, rolled for the item's level
//   temper_brand    a weapon's hits become an element (C's conversion: it replaces one rolled property). One per weapon.
// A missed mini-game never reaches temperApply: the item is untouched by design.

import { canConvert, convertWeapon } from './tv-gear.js';

const WOOD = new Set(['bow', 'crossbow', 'staff', 'wand', 'scepter', 'orb', 'tome']);
const FIXED = a => !!(a && (a.baseIntrinsic || a.intrinsic || a.setFixed || a.tvConvert || a.brand || a.id === 'legendary_effect' || a.stat === 'castElement'));
export const isGearItem = item => !!item && typeof item === 'object' && !item.kind && (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory');
export const itemLevelOf = item => Math.max(1, Math.round(item.dropLevel || item.ilvl || item.levelReq || 1));

/** What an item is made of — decides which tier material its tempering costs. */
export function matClassOf(engine, item) {
  if (!item) return 'metal';
  if (item.type === 'weapon') return WOOD.has(item.subtype) ? 'wood' : 'metal';
  if (item.isShield) return 'metal';
  const base = engine && engine.items && engine.items.armorBases ? engine.items.armorBases[item.catalogBase || item.baseKey] || engine.items.armorBases[item.baseKey] : null;
  const weight = base && base.tier;
  if (weight === 'cloth') return 'cloth';
  if (weight === 'light') return 'leather';
  if (weight === 'medium' || weight === 'heavy' || weight === 'plate') return 'metal';
  if (item.slot === 'ring' || item.slot === 'necklace' || item.type === 'accessory') return 'metal';
  if (item.slot === 'waist' || item.pack) return 'leather';
  return 'cloth';
}

/** The materials, gold and skill one work on one item costs. */
export function temperCost(P, engine, op, item, listPrice = 0) {
  const row = (P.temper.ops || {})[op];
  if (!row || !item) return null;
  const t = P.tierForLevel(itemLevelOf(item));
  const cls = P.classes || {};
  const at = (c) => (cls[c] || [])[t.tier - 1] || (cls[c] || [])[0] || null;
  const needs = [];
  const main = at(matClassOf(engine, item));
  if (main && row.mat) needs.push({ id: main, n: row.mat });
  for (const [c, n] of row.extra || []) { const id = at(c); if (id) needs.push({ id, n }); }
  return { needs, gold: Math.max(1, Math.round((listPrice || 0) * (row.goldShare || 0))), skill: Math.min(P.maxLevel, t.minSkill + (row.skill || 0)), tier: t.tier };
}

const rolled = item => (item.affixes || []).map((a, i) => ({ a, i })).filter(x => !FIXED(x.a));
function maxQualityFor(P, skill) { let q = 'medium'; for (const [at, name] of ((P.temper.ops.temper_quality || {}).maxQualityBySkill || [])) if (skill >= at) q = name; return q; }
/** How many rolled properties an item of a rarity may carry (a backpack carries fewer — C's W19 rule). */
function affixRoom(engine, item, rarity) {
  if (item.pack) return ({ normal: 0, magic: 1, rare: 1 })[rarity] ?? 1;
  const c = engine && engine.items && engine.items.rarityAffixCount ? engine.items.rarityAffixCount[rarity] : null;
  return c ? c[1] : rarity === 'rare' ? 3 : rarity === 'magic' ? 2 : 0;
}

/** May this work be done on this item, and what will it do? (No costs here — see temperCost.) */
export function temperCheck(P, engine, op, item, { index = 0, element = null, skill = 1 } = {}) {
  const row = (P.temper.ops || {})[op];
  const no = (why, text) => ({ ok: false, why, text });
  if (!row) return no('recipe', 'No such work.');
  if (!isGearItem(item)) return no('item', 'Only weapons, armour and jewellery can be tempered.');
  if (item.isUnique || item.setId) return no('item', 'A unique or set piece cannot be reworked.');
  if (item.rarity === 'legendary') return no('item', 'Legendary gear cannot be reworked.');
  const Q = P.temper.qualities || ['low', 'medium', 'high', 'elite', 'exotic'];
  if (op === 'temper_quality') {
    const at = Math.max(0, Q.indexOf(item.quality || 'medium')), to = Q[at + 1];
    if (!to) return no('max', 'It is already the best quality there is.');
    const cap = maxQualityFor(P, skill);
    if (Q.indexOf(to) > Q.indexOf(cap)) { const need = ((row.maxQualityBySkill || []).find(([, n]) => n === to) || [])[0]; return { ok: false, why: 'skill', need, text: `Raising it to ${to} quality needs Tempering ${need}.` }; }
    const mult = engine && engine.items && engine.items.qualityMult ? (engine.items.qualityMult[to] ?? 1) / (engine.items.qualityMult[item.quality || 'medium'] ?? 1) : 1;
    return { ok: true, to, mult, text: `Quality ${item.quality || 'medium'} to ${to}: its ${item.type === 'weapon' ? 'damage' : 'armour'} and rolled properties grow by ${Math.round((mult - 1) * 100)}%.` };
  }
  if (op === 'temper_promote') {
    const to = (row.to || {})[item.rarity || 'normal'];
    if (!to) return no('max', 'It cannot be promoted any further. Rare is as high as tempering goes.');
    const adds = rolled(item).length < affixRoom(engine, item, to);
    return { ok: true, to, adds, text: `${item.rarity === 'magic' ? 'Uncommon' : 'Plain'} to ${to === 'magic' ? 'uncommon' : to}${adds ? ', with one new property' : ''}.` };
  }
  if (op === 'temper_reweave') {
    const a = (item.affixes || [])[index | 0];
    if (!a) return no('index', 'Pick the property to replace.');
    if (FIXED(a)) return no('index', `${a.name || 'That property'} is part of what the item is. It cannot be rewoven.`);
    return { ok: true, was: a, text: `Replaces "${a.name || a.stat}" with a different property, rolled for item level ${itemLevelOf(item)}.` };
  }
  if (op === 'temper_brand') {
    if (item.type !== 'weapon') return no('item', 'Only a weapon can be branded.');
    if (!(row.elements || []).includes(element)) return no('element', 'Pick an element for the brand.');
    if (item.rarity === 'normal') return no('item', 'A plain weapon will not hold a brand. Promote it first.');
    if (!engine || !canConvert(engine.tvGear, engine.items, item)) return no('item', item.brand || item.converted ? 'This weapon already carries a brand.' : 'This weapon already has an element of its own.');
    const [lo, hi] = row.value || [0.05, 0.1];
    return { ok: true, element, text: `Every hit deals ${element} damage instead of physical, with +${Math.round(lo * 100)}–${Math.round(hi * 100)}% ${element} damage. It replaces the weapon's last rolled property.` };
  }
  return no('recipe', 'No such work.');
}

/** A property the item does not carry yet, rolled by the engine's own item maker for the item's level (or null). */
export function freshAffix(engine, item, rng) {
  const base = item.catalogBase || item.baseKey;
  const have = new Set((item.affixes || []).map(a => a.id));
  for (let tries = 0; tries < 6; tries++) {
    const donor = engine.makeItem({ base, rarity: 'rare', level: itemLevelOf(item), rng });
    const pick = donor ? (donor.affixes || []).find(a => !FIXED(a) && !have.has(a.id)) : null;
    if (pick) return { ...pick };
  }
  return null;
}
function rename(engine, item) {
  // only an item still carrying a generated name is renamed (a brand's name, a crafter's, a unique's are kept)
  try { const L = engine.rpg && engine.rpg.loot; if (L && typeof L.rename === 'function' && !item.converted && (!L.keepsName || L.keepsName(item))) L.rename(item); } catch { /* the old name stays */ }
}

/**
 * Do the work (the mini-game was won). `quality` ('good' | 'fine' | 'perfect') only matters to the brand: a better
 * play rolls nearer the top of its range. Mutates and returns through `{ ok, text }`.
 */
export function temperApply(P, engine, op, item, { index = 0, element = null, rng = () => 0.5, quality = 'good', skill = 100 } = {}) {
  const chk = temperCheck(P, engine, op, item, { index, element, skill });
  if (!chk.ok) return chk;
  const row = P.temper.ops[op];
  if (op === 'temper_quality') {
    const step = chk.mult;
    item.quality = chk.to;
    if (Array.isArray(item.dmg)) item.dmg = item.dmg.map(v => Math.max(1, Math.round(v * step)));
    if (item.armor) item.armor = Math.max(1, Math.round(item.armor * step));
    for (const a of item.affixes || []) if (typeof a.value === 'number' && !FIXED(a)) a.value = +(a.value * step).toFixed(2);
    item.tempered = (item.tempered || 0) + 1;
    return { ok: true, text: `Tempered to ${chk.to} quality.` };
  }
  if (op === 'temper_promote') {
    let added = null;
    if (chk.adds) { added = freshAffix(engine, item, rng); if (added) (item.affixes || (item.affixes = [])).push(added); }
    item.rarity = chk.to;
    rename(engine, item);
    item.tempered = (item.tempered || 0) + 1;
    return { ok: true, now: added, text: `Promoted to ${chk.to === 'magic' ? 'uncommon' : chk.to}${added ? `: ${added.name || added.stat} was added` : ''}.` };
  }
  if (op === 'temper_reweave') {
    const fresh = freshAffix(engine, item, rng);
    if (!fresh) return { ok: false, why: 'none', text: 'There is no other property this item could carry.' };
    const was = item.affixes[index | 0];
    item.affixes[index | 0] = { ...fresh, reworked: true };
    rename(engine, item);
    item.tempered = (item.tempered || 0) + 1;
    return { ok: true, was, now: fresh, text: `${was.name || was.stat} became ${fresh.name || fresh.stat}.` };
  }
  if (op === 'temper_brand') {
    const [lo, hi] = row.value || [0.05, 0.1];
    const k = quality === 'perfect' ? 0.75 + rng() * 0.25 : quality === 'fine' ? 0.4 + rng() * 0.4 : rng() * 0.5;
    convertWeapon(engine.tvGear, item, element, lo + (hi - lo) * k);
    item.tempered = (item.tempered || 0) + 1;
    return { ok: true, text: item.convertText || `Branded with ${element}.` };
  }
  return { ok: false, why: 'recipe', text: 'No such work.' };
}
