// What a character WEARS, drawn on the body (play-test P22: "start with basic gear: no armour = basic shorts and a
// top; the full class outfit only as a preview; equipped gear must be visible"). Pure — no three, no DOM.
//
// The title screen still dresses the preview in its class outfit (avatar-3d/data/class-outfits.json, looks.js);
// in the world a character is its body in plain clothes plus exactly what it has equipped:
//
//   head  -> hat     chest -> top     legs -> bottom     feet -> shoes     weapon -> held     offhand -> offhand
//
// Armour picks its Chibi 2 part by the BASE's tier (cloth hood, leather cap, scaled horned helm, plate dragon
// helm …) — the same table Farhold's rpg.gearLook uses — tinted by rarity; weapons pick their model by subtype
// (Farhold's heldLookFor table: a longsword is fh_longsword, a fire staff wears the crystal topper).
//
//   gearLook(equipment, { tierOf })  -> { hat, top, bottom, shoes, held, offhand, cape, decor }
//   gearKey(equipment)               -> a short string that changes only when the drawn look would

import { isTier2Item, tier2Dress } from '../../../../avatar-3d/js/class-outfits.js';   // S18 tier-2 armour

/** No armour: plain shorts and a shirt, foot wraps, empty hands. */
export const PLAIN = {
  hat: { id: 'none' }, top: { id: 'tshirt', color: '#cdbf9f' }, bottom: { id: 'shorts', color: '#6b5a44' }, shoes: { id: 'wraps', color: '#8a7a62' },
  cape: { id: 'none' }, decor: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' },
};

/** Armour base tier -> Chibi 2 part (Farhold rpg.js ARMOUR_LOOK). */
export const ARMOUR_LOOK = {
  head: { cloth: 'hood', light: 'feather_cap', medium: 'hood', scaled: 'horned_helm', heavy: 'horned_helm', plate: 'dragon_helm', runed: 'hood' },
  chest: { cloth: 'robe', light: 'strapped_leather', medium: 'tunic', scaled: 'scale_plate', heavy: 'plate', plate: 'plate', runed: 'trim_robe' },
  legs: { cloth: 'baggy', light: 'pants', medium: 'pants', scaled: 'greaves', heavy: 'greaves', plate: 'greaves', runed: 'baggy' },
  feet: { cloth: 'sandals', light: 'boots', medium: 'boots', scaled: 'heavy', heavy: 'heavy', plate: 'heavy', runed: 'slippers' },
};
const SLOT_PART = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes' };
/** Plain colours per tier, so a leather jerkin is brown and plate is steel. */
const TIER_COLOUR = { cloth: '#7a6a8a', light: '#7a5a3a', medium: '#6a6a4a', scaled: '#6a7a6a', heavy: '#8a9098', plate: '#a0a8b2', runed: '#4a4a7a' };

/** Weapon subtype -> held model (Farhold rpg.js HELD_BY_SUBTYPE). */
export const HELD_BY_SUBTYPE = {
  dagger: 'fh_daggers', sword: 'fh_sword', longsword: 'fh_longsword', rapier: 'fh_rapier', saber: 'fh_sabre', scimitar: 'fh_sabre',
  sword2h: 'fh_greatsword', greatsword: 'fh_greatsword', axe2h: 'fh_greataxe', battleaxe: 'fh_axe', axe: 'fh_axe', cleaver: 'cleaver',
  hammer: 'fh_hammer', warhammer: 'fh_maul', mace: 'fh_mace', halberd: 'fh_halberd', spear: 'fh_spear', javelin: 'fh_javelin',
  quarterstaff: 'fh_quarterstaff', staff: 'staff_orb', wand: 'fh_wand', scepter: 'fh_scepter', orb: 'orb', tome: 'book',
  bow: 'bow', shortbow: 'bow', longbow: 'bow', crossbow: 'crossbow',
};
/**
 * Play-test 4 (S17): a BASE that has its own silhouette (wins over the subtype). Every base in data/rules/loot-pool.json
 * resolves to a Chibi 2 model — tests/D/weapon-models.test.js checks it against avatar-3d's catalogue.
 */
export const HELD_BY_BASE = {
  obsidian_scimitar: 'tv_scimitar', rimecut_sabre: 'fh_sabre', forager_blade: 'cleaver', breakers_pick: 'tv_warpick',
  axle_club: 'tv_club', watchfire_glaive: 'tv_glaive', warhorn_maul: 'fh_maul', iron_mace: 'fh_mace', lantern_mace: 'fh_mace',
  tithe_dagger: 'fh_dagger', houndmasters_lash: 'fh_dagger', pathfinder_javelin: 'fh_javelin', gravebound_scepter: 'fh_scepter',
  roadwarden_bow: 'bow', stormpin_crossbow: 'crossbow', emberbrand_wand: 'fh_wand', hunters_edge: 'fh_sword',
  dawnwarden_hammer: 'fh_maul', covenant_hammer: 'fh_hammer', bloodledger_blade: 'fh_greatsword', grudgebrand: 'fh_greatsword', starwake_bow: 'bow',
};
/**
 * items.json bases (and some uniques) carry an Emberveil-era `look.held` from the ORIGINAL vocabulary — a javelin drawn as a
 * quarterstaff, a mace with its head behind the fist. A base in HELD_BY_BASE wins (keeping the look's colour); any other
 * old id is swapped for its modern kit model here.
 */
const MODERN = { mace: 'fh_mace', hammer: 'fh_hammer', warhammer: 'fh_maul', greataxe: 'fh_greataxe', greatsword: 'fh_greatsword', saber: 'fh_sabre',
  sword: 'fh_sword', daggers: 'fh_daggers', rapier: 'fh_rapier', quarterstaff: 'fh_quarterstaff', flame: 'fh_wand' };
/** Off-hand bases (shields, foci, quivers) -> model. A focus is held up out of the fist (avatar-3d S6). */
export const OFFHAND_BY_BASE = {
  buckler: 'buckler', shield: 'fh_heater_shield', kite_shield: 'fh_kite_shield', tower_shield: 'fh_tower_shield', aegis_shield: 'fh_tower_shield',
  rune_aegis: 'fh_kite_shield', arcane_bulwark: 'fh_tower_shield',
  warded_focus: 'tv_ward', spellguard_orb: 'orb', seer_orb: 'orb', grimoire: 'book', psalter: 'book', reliquary: 'relic', effigy: 'idol', totem: 'tv_totem',
  quiver: 'quiver',
};
const OFFHAND_COLOUR = { spellguard_orb: '#c8a0ff', seer_orb: '#8fd0ff', grimoire: '#5a2a2a', psalter: '#e8e0c8', warded_focus: '#9fe0ff', quiver: '#6a4a2a',
  reliquary: '#c8a040', effigy: '#b89a58', totem: '#8a6a42' };
const STAFF_TOPPER = { fire: 'staff_crystal', ice: 'staff_crystal', lightning: 'staff_totem', poison: 'staff_crook', shadow: 'staff_skull', holy: 'staff_orb', arcane: 'staff_orb' };
const ELEMENT_TINT = { fire: '#ff8a40', ice: '#9fd8ff', lightning: '#ffe86a', poison: '#9ede6a', shadow: '#c090ff', holy: '#ffe6a0', arcane: '#b8a0ff' };
const OFFHAND_BY_SUBTYPE = { shield: 'fh_heater_shield', buckler: 'buckler', quiver: 'quiver', dagger: 'fh_dagger' };
const QUALITY = { legendary: 3, unique: 3, set: 3, rare: 2, magic: 1 };

function rarityTint(item) {
  if (item.setId || item.isUnique || item.rarity === 'legendary' || item.rarity === 'unique') return '#c8a24a';
  if (item.rarity === 'rare') return '#8a7a4a';
  if (item.rarity === 'magic') return '#4a5a7a';
  return null;
}

export function heldLook(item) {
  if (!item) return { id: 'none' };
  if (item.look?.held && !HELD_BY_BASE[item.baseKey]) return { id: MODERN[item.look.held] || item.look.held, color: item.look.color || '#b9c2cc', quality: QUALITY[item.rarity] || 0 };
  const sub = item.subtype || item.baseKey;
  let id = HELD_BY_BASE[item.baseKey] || HELD_BY_SUBTYPE[item.baseKey] || HELD_BY_SUBTYPE[item.subtype] || 'fh_sword';   // the base is the more specific (a longsword base has subtype 'sword')
  const el = item.castElement || item.brand || null;
  if (sub === 'staff' && el) id = STAFF_TOPPER[el] || 'staff_orb';
  const color = el ? (ELEMENT_TINT[el] || '#b9c2cc') : item.look?.color ? item.look.color : item.rarity === 'legendary' ? '#ffb040' : item.rarity === 'rare' ? '#e8d020' : '#b9c2cc';
  return { id, color, quality: QUALITY[item.rarity] || 0, element: el || null };
}

export function offhandLook(item) {
  if (!item) return { id: 'none' };
  if (item.look?.offhand) return { id: item.look.offhand, color: item.look.color || '#9aa3ad' };
  const byBase = OFFHAND_BY_BASE[item.baseKey];
  if (byBase) return { id: byBase, color: OFFHAND_COLOUR[item.baseKey] || (/shield$/.test(byBase) || byBase === 'buckler' ? '#8d97a3' : '#9aa3ad'), quality: QUALITY[item.rarity] || 0 };
  if (item.isShield || item.isMagicShield || /shield/.test(item.baseKey || item.subtype || '')) return { id: item.isMagicShield ? 'fh_kite_shield' : 'fh_heater_shield', color: '#8d97a3', quality: QUALITY[item.rarity] || 0 };
  if (item.subtype === 'tome' || item.baseKey === 'tome') return { id: 'book', color: '#5a2a2a' };
  if (item.subtype === 'orb' || item.baseKey === 'orb') return { id: 'orb', color: '#8fd0ff' };
  if (item.type === 'weapon' && !OFFHAND_BY_SUBTYPE[item.subtype]) {
    const h = heldLook(item);
    // S15: a second wand IS drawn in the off hand now (avatar-3d HELD_WEAPON_IDS takes wands); staves/bows stay two-handed
    if (h.id && h.id !== 'none' && !/^staff|^bow$|^crossbow$|^book$|^orb$/.test(h.id)) return h;
  }
  return { id: OFFHAND_BY_SUBTYPE[item.subtype] || 'none', color: '#9aa3ad' };
}

/**
 * One worn item in the shape the tables read. Accepts a full Farhold item (`baseKey`, `subtype`, `tier`…) or the
 * server's compact `info.gear` entry (`{ base, sub?, rarity, unique? }`); `baseOf(key)` fills what the compact form
 * leaves out from emberveil items.json (an armour base's tier, a weapon base's subtype, isShield).
 */
export function normItem(it, baseOf = () => null) {
  if (!it || typeof it !== 'object') return null;
  const key = it.baseKey || it.base || null, b = (key && baseOf(key)) || {};
  // `tier` here is the armour WEIGHT (cloth/light/…); a themed S18 item's numeric `tier: 2` must not replace it
  return { ...b, ...it, baseKey: key, subtype: it.subtype || it.sub || b.subtype || null, tier: (typeof it.tier === 'string' ? it.tier : null) || b.tier || null,
    isShield: it.isShield ?? b.isShield, isMagicShield: it.isMagicShield ?? b.isMagicShield, isUnique: it.isUnique || !!it.unique, type: it.type || b.type || null };
}

/** The worn item as it came (the raw form keeps a themed piece's numeric `tier`, which normItem drops for the weight). */
const raw = (equipment, slot) => (equipment?.[slot] && typeof equipment[slot] === 'object') ? equipment[slot] : null;

/** The parts to put on a body for a worn set (`slot -> item`, full items or the compact info.gear form). */
export function gearLook(equipment = {}, { baseOf = () => null, tierOf = null, tier2 = null, themes = null } = {}) {
  const out = JSON.parse(JSON.stringify(PLAIN));
  const lookup = tierOf ? (k => ({ tier: tierOf(k) })) : baseOf;
  const eq = {};
  for (const [slot, it] of Object.entries(equipment || {})) eq[slot] = normItem(it, lookup);
  for (const [slot, part] of Object.entries(SLOT_PART)) {
    const item = eq[slot]; if (!item) continue;
    if (item.look?.worn?.id) { out[part] = JSON.parse(JSON.stringify(item.look.worn)); continue; }
    const tier = item.tier || (slot === 'chest' ? 'medium' : 'light');
    const id = ARMOUR_LOOK[slot][tier] || ARMOUR_LOOK[slot].medium;
    out[part] = { id, color: rarityTint(item) || TIER_COLOUR[tier] || '#6a6a6a' };
  }
  // a helmet-less chest piece keeps the plain shorts unless legs are worn; plate over shorts reads oddly, so a
  // heavy chest with no legs gets plain trousers
  if (eq.chest && !eq.legs && /plate|scale/.test(out.top.id)) out.bottom = { id: 'pants', color: '#4a4038' };
  out.held = heldLook(eq.weapon || eq.mainhand || null);
  out.offhand = offhandLook(eq.offhand || null);
  if (eq.back || eq.cape) out.cape = { id: 'travel_cloak', color: rarityTint(eq.back || eq.cape) || '#4a3a2a' };
  // play-test 4 (S18): rare+ armour (or item level >= ITEM_TIER2_LEVEL, or item.look.tier 2) shows the wearer's class
  // tier-2 look — trim, the class emblem on chest and back, the class's t2 kit (avatar-3d class-outfits-t2.json)
  // (S18 data: a themed piece carries `theme` -> data/rules/armour-tiers.json `themes[id]` {emblem, trim, glow}, passed as `themes`)
  const ch = !!eq.chest && isTier2Item(raw(equipment, 'chest')), hd = !!eq.head && isTier2Item(raw(equipment, 'head'));
  // a themed shield / focus carries its emblem for the off-hand builder to put on its face
  const offT = themes?.[raw(equipment, 'offhand')?.theme || raw(equipment, 'offhand')?.look?.theme];
  if (offT && out.offhand?.id !== 'none') out.offhand = { ...out.offhand, emblem: offT.emblem, emblemColor: offT.glow, color2: offT.trim };
  if (tier2 && (ch || hd)) {
    const dress = (look, which) => {
      const it = raw(equipment, which), th = themes?.[it?.theme || it?.look?.theme] || null;
      return tier2Dress(look, tier2, { chest: which === 'chest', head: which === 'head', element: it?.element || null,
        emblem: th?.emblem || it?.look?.emblem || null, trim: th?.trim || it?.look?.trim || null, emblemColor: th?.glow || it?.look?.glow || null });
    };
    return hd ? dress(ch ? dress(out, 'chest') : out, 'head') : dress(out, 'chest');
  }
  return out;
}

/** A short key of what is drawn (cache key; a change means the body must be re-dressed). */
export function gearKey(equipment = {}) {
  const eq = equipment || {};
  return ['head', 'chest', 'legs', 'feet', 'weapon', 'offhand', 'back'].map(s => {
    const i = eq[s]; if (!i) return '-';
    return `${i.baseKey || i.base || i.subtype || i.sub || i.name || '?'}:${i.rarity || ''}:${i.castElement || i.brand || ''}:${i.tier || ''}:${i.unique || ''}:${i.lvl ?? i.level ?? ''}:${i.theme || ''}`;
  }).join('|');
}
