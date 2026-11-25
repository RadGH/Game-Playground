// Oathwild — putting gear on and taking it off, shop prices, and which Tabard pieces a hero wears. Pure (server, the
// browser's windows and tests). The rules core says WHO may wear WHAT (js/rules/proficiency.js canWear); this file
// says WHERE it goes and what comes off to make room (game-standards §5b: one-handed / two-handed / off hand).
//
//   slotFor(item, char, want)        → 'weapon' | 'offhand' | 'head' … | 'ring' | 'ring2' | 'necklace'
//   equipRefusal(rules, char, item, slot)  → why not, or null
//   equip(rules, char, itemId, slot) → { ok, why, slot, off: [items moved to the bag] }
//   unequip(char, slot)              → { ok, why }
//   itemValue(item)                  → base gold value (Guessed formula below)
//   buyPrice / sellPrice(rules, char, item)
//   shopStock(rules, service, seed, level) → items a shop sells (rolled from the rules' own loot maker)
//   tabardItems(char, look)          → Tabard item ids for createTabard / equip (the worn look of the gear)
import { canWear } from '../rules/proficiency.js';
import { priceMult } from '../rules/skills-use.js';
import { sheetOf } from '../rules/sheet.js';
import { makeRng } from '../rules/farhold.js';
import { casterKind } from '../rules/casters.js';

export const SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'ring2', 'necklace'];
export const SLOT_NAME = { weapon: 'Main hand', offhand: 'Off hand', head: 'Head', chest: 'Chest', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring', ring2: 'Ring', necklace: 'Neck' };

const isBowPair = (w, o) => w?.ranged && w?.subtype === 'bow' && o?.baseKey === 'quiver';

export function slotFor(item, char, want = null) {
  if (!item) return null;
  if (want && SLOTS.includes(want)) return want;
  if (item.type === 'weapon') return casterKind(item) === 'orb' ? 'offhand' : 'weapon';     // an orb is an off-hand implement
  if (item.slot === 'ring') return !char.gear?.ring ? 'ring' : !char.gear?.ring2 ? 'ring2' : 'ring';
  return item.slot || null;
}

export function equipRefusal(rules, char, item, slot) {
  if (!item) return 'That item is not in your bag.';
  if (!slot || !SLOTS.includes(slot)) return 'That does not go anywhere you can wear it.';
  const fits = item.type === 'weapon' ? (slot === 'weapon' || slot === 'offhand')
    : item.slot === 'ring' ? (slot === 'ring' || slot === 'ring2') : item.slot === slot;
  if (!fits) return `${item.name} does not go there.`;
  if (slot === 'weapon' && casterKind(item) === 'orb') return `${item.name} is an off-hand implement — it has no attack of its own. Hold it in your off hand beside a wand, tome or sceptre.`;
  // (level, training and attributes: proficiency.js canWear — owner 2026-11-25: gear mostly by attributes and training)
  const w = canWear(rules, char, item, { slot });
  if (!w.ok) return w.why;
  if (slot === 'offhand') {
    const main = char.gear?.weapon;
    if (main?.twoHanded && !isBowPair(main, item)) return `${main.name} needs both hands — take it off first, or wear a one-handed weapon.`;
    if (item.baseKey === 'quiver' && !(main?.ranged)) return 'A quiver goes beside a bow.';
  }
  return null;
}

/** Wear `itemId` from the bag. What it replaces goes to the bag; a two-hander also clears the off hand. */
export function equip(rules, char, itemId, want = null) {
  const bag = char.bag || (char.bag = []);
  const i = bag.findIndex(it => it.id === itemId);
  if (i < 0) return { ok: false, why: 'That item is not in your bag.' };
  const item = bag[i];
  const slot = slotFor(item, char, want);
  const why = equipRefusal(rules, char, item, slot);
  if (why) return { ok: false, why };
  bag.splice(i, 1);
  const off = [];
  if (char.gear[slot]) { off.push(char.gear[slot]); bag.push(char.gear[slot]); }
  char.gear[slot] = item;
  if (slot === 'weapon' && item.twoHanded && char.gear.offhand && !isBowPair(item, char.gear.offhand)) {
    off.push(char.gear.offhand); bag.push(char.gear.offhand); delete char.gear.offhand;
  }
  if (slot === 'weapon' && char.gear.offhand?.baseKey === 'quiver' && !item.ranged) {
    off.push(char.gear.offhand); bag.push(char.gear.offhand); delete char.gear.offhand;
  }
  return { ok: true, why: null, slot, off };
}

export function unequip(char, slot) {
  const it = char.gear?.[slot];
  if (!it) return { ok: false, why: 'Nothing is worn there.' };
  (char.bag = char.bag || []).push(it);
  delete char.gear[slot];
  return { ok: true, why: null, item: it };
}

// ---------------------------------------------------------------- prices (Guessed, owner may overrule)
// value = (8 + 5 × item level) × rarity × quality; weapons and chest pieces a little dearer. Shops sell at 2.5× value
// (less with Speech / Charisma), buy at 0.4× value (more with Speech / the Haggler perk).
const RARITY_K = { normal: 1, magic: 2.2, rare: 4, legendary: 9, unique: 9, set: 7 };
const QUALITY_K = { low: 0.8, medium: 1, high: 1.25 };
export const PRICE = { buy: 2.5, sell: 0.4 };
export function itemValue(item) {
  if (!item) return 0;
  const lv = item.ilvl || 1;
  const kind = item.type === 'weapon' ? 1.3 : item.slot === 'chest' ? 1.2 : item.type === 'accessory' ? 1.4 : 1;
  return Math.max(1, Math.round((8 + 5 * lv) * (RARITY_K[item.rarity] || 1) * (QUALITY_K[item.quality] || 1) * kind));
}
export function buyPrice(rules, char, item) {
  const cut = (sheetOf(rules, char).priceCut || 0) / 100;
  return Math.max(1, Math.round(itemValue(item) * PRICE.buy * priceMult(rules, char, { extraCut: cut })));
}
export function sellPrice(rules, char, item) {
  return Math.max(1, Math.round(itemValue(item) * PRICE.sell * priceMult(rules, char, { selling: true })));
}

/** A shop's goods: `service` = npcs.json { sells: ['weapon','armour',…], levels: [lo, hi] }. Same seed = same stock. */
export function shopStock(rules, service, seed, { count = 12 } = {}) {
  const LT = rules.data.lootTables;
  const kinds = (service.sells || ['weapon', 'armour']).map(k => (k === 'goods' ? 'jewellery' : k)).filter(k => LT.kinds[k]);
  const [lo, hi] = service.levels || [1, 5];
  const rng = makeRng(seed >>> 0);
  const out = [];
  for (let n = 0; out.length < count && n < count * 4; n++) {
    const kind = kinds[n % kinds.length] || 'armour';
    const bases = LT.kinds[kind];
    const baseKey = bases[Math.floor(rng() * bases.length)];
    const level = lo + Math.floor(rng() * (hi - lo + 1));
    const rarity = rng() < 0.25 ? 'magic' : 'normal';
    const it = rules.rpg.loot.generate(baseKey, rarity, 'medium', { rng, ilvl: level, level });
    if (!it) continue;
    it.id = `s${seed % 997}_${out.length}`;
    out.push(it);
  }
  return out;
}

// ---------------------------------------------------------------- the worn look (Tabard, avatar-3d/tabard)
// Gear → the closest Tabard piece by slot and armour tier. Tabard has five outfits (wanderer = cloth, trail = leather,
// ironlink = mail, bulwark = plate, mossgrove = druid robes) and a set of held props.
const TIER = { cloth: 'cloth', light: 'leather', medium: 'mail', scaled: 'mail', heavy: 'plate', runed: 'plate', plate: 'plate' };
const OUTFIT = { cloth: 'wanderer', leather: 'trail', mail: 'ironlink', plate: 'bulwark' };
const PIECE = {
  chest: { wanderer: 'robe_wanderer', trail: 'jerkin_trail', ironlink: 'hauberk_ironlink', bulwark: 'cuirass_bulwark', mossgrove: 'robe_mossgrove' },
  hands: { wanderer: 'wraps_wanderer', trail: 'gloves_trail', ironlink: 'mitts_ironlink', bulwark: 'gauntlets_bulwark' },
  legs: { wanderer: 'leggings_wanderer', trail: 'trousers_trail', ironlink: 'chausses_ironlink', bulwark: 'legplates_bulwark' },
  feet: { wanderer: 'shoes_wanderer', trail: 'boots_trail', ironlink: 'boots_ironlink', bulwark: 'sabatons_bulwark' },
  head: { wanderer: 'hood_wanderer', trail: 'cap_trail', ironlink: 'coif_ironlink', bulwark: 'helm_bulwark' },
};
// fal.ai hero weapons (avatar-3d/fal round 3, 2026-11-24) are Tabard items 'fal:<id>'; the shortbow waits for the owner's
// review (its string did not come through), so bows keep the horn bow
const WEAPON = { sword: 'sword_arming', sword2h: 'sword_arming', dagger: 'sword_arming', axe: 'axe_halfmoon', axe2h: 'axe_halfmoon', hammer: 'fal:ow-warhammer', mace: 'mace_thornhead', staff: 'fal:ow-quarterstaff', polearm: 'fal:ow-halberd', spear: 'staff_oak', scepter: 'mace_thornhead', wand: 'staff_oak', bow: 'bow_horn', crossbow: 'bow_horn', javelin: 'staff_oak' };
const CASTER = { wand: 'fal:ow-wand', sceptre: 'fal:ow-sceptre', tome: 'fal:ow-tome', staff: 'staff_oak', pole: 'staff_oak' };
const SHIELD = { buckler: 'shield_oakring', shield: 'shield_heater', kite_shield: 'shield_bluefield', tower_shield: 'shield_bastion', aegis_shield: 'shield_bastion', rune_aegis: 'shield_bastion' };

/** The armour tier of a worn piece (Emberveil base tier → cloth / leather / mail / plate). */
export function tierOf(rules, item) {
  const base = rules?.data.items.armorBases[item?.baseKey];
  if (base?.tier) return TIER[base.tier] || 'cloth';
  const k = String(item?.baseKey || '');
  return k.startsWith('heavy') || k.startsWith('plate') || k.startsWith('runed') ? 'plate' : k.startsWith('medium') || k.startsWith('scaled') ? 'mail' : k.startsWith('light') ? 'leather' : 'cloth';
}

/** Tabard item ids for a character's gear (always a shirt + trousers + shoes underneath, so nobody is bare). */
export function tabardItems(rules, char) {
  const g = char?.gear || {};
  const out = [];
  for (const slot of ['chest', 'hands', 'legs', 'feet', 'head']) {
    const it = g[slot];
    if (!it) { if (slot === 'chest') out.push('tunic_wanderer'); else if (slot === 'legs') out.push('leggings_wanderer'); else if (slot === 'feet') out.push('shoes_wanderer'); continue; }
    const outfit = OUTFIT[tierOf(rules, it)] || 'wanderer';
    const id = PIECE[slot][outfit] || PIECE[slot].wanderer;
    if (id) out.push(id);
  }
  const w = g.weapon;
  const ck = casterKind(w);
  if (w && w.weaponCategory !== 'magic') out.push(WEAPON[w.subtype] || 'sword_arming');
  else if (w) out.push(CASTER[ck] || 'staff_oak');
  const o = g.offhand;
  if (o?.isShield) out.push(SHIELD[o.baseKey] || 'shield_heater');
  else if (casterKind(o) === 'orb' && ck !== 'tome') out.push('fal:ow-orb');   // a tome already fills the left hand
  if (g.chest && tierOf(rules, g.chest) === 'plate') out.push('pauldrons_bulwark');
  return out;
}
