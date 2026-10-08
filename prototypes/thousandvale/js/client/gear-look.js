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
/**
 * Play-test 8 (W25): a BASE whose NAME says what it is draws that model, whatever its weight class ("the War Helm is a
 * gold dome with white horns": every heavy head piece was the horned helm, a Leather Cap was a feathered cap and a Chain
 * Coif was a cloth hood). Wins over ARMOUR_LOOK; anything not listed still goes by weight.
 */
export const ARMOUR_BY_BASE = {
  cloth_helm: 'hood', light_helm: 'leather_cap', medium_helm: 'chain_coif', heavy_helm: 'war_helm', plate_helm: 'plate_helm', wyrmscale_helm: 'dragon_helm',
  medium_chest: 'chainmail', scaled_chest: 'scale_plate', light_chest: 'leather',
};
/** Plain colours per tier, so a leather jerkin is brown and plate is steel. */
const TIER_COLOUR = { cloth: '#7a6a8a', light: '#7a5a3a', medium: '#6a6a4a', scaled: '#6a7a6a', heavy: '#8a9098', plate: '#a0a8b2', runed: '#4a4a7a' };

/** A model that is plainly one material takes that material's colour (mail is steel, not the weight class's olive). */
const MODEL_COLOUR = { chain_coif: '#9aa2ac', chainmail: '#8a9098', war_helm: '#8f98a2', plate_helm: '#a0a8b2', leather_cap: '#7a5a3a', leather: '#7a5a3a' };

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
  const el = item.castElement || item.brand || item.el || null;      // `el`: the compact info.gear form (asked of A, play-test 5)
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
    // T7 (play-test 5): a second two-hander — staves included — is drawn in the off hand (the perk decides on the server)
    if (h.id && h.id !== 'none' && !/^bow$|^crossbow$|^book$|^orb$/.test(h.id)) return h;
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

// ---------------------------------------------------------------- play-test 5 (T23): the gear catalog's new models
//
// Stream F's `g5_` models (avatar-3d/data/gear-catalog.json, read through avatar-3d/js/gear-catalog.js) cover every
// slot — including four the game never drew at all: gloves, rings, necklaces and belts. An item says which model it
// is with `look.g5` / `g5` (C stamps both on catalog items) or simply by its base id being the row's id (the compact
// `info.gear` form carries only `base`). For the slots with NO older model, any item is drawn with the catalog's model
// for its slot and armour weight, so a pair of leather gloves from the old loot table shows on the hands too.

// play-test 8 (W22): light items are gone from the game. A `light` slot an old character still carries is not drawn at all
// (no lantern on the hip, no torch in the hand) and is not part of the look's key.
export const isG5 = id => typeof id === 'string' && id.startsWith('g5_');

// ---------------------------------------------------------------- play-test 8 (W19): backpacks on the back slot
/** C's backpack bases -> the model each draws (avatar-3d/js/chibi2-backpacks.js). A rare-or-better pack is the explorer's. */
export const PACK_BY_BASE = { sling_satchel: 'g5_pack_satchel', trail_rucksack: 'g5_pack_rucksack', expedition_pack: 'g5_pack_frame' };
const PACK_COLOUR = { g5_pack_satchel: '#7a5a3a', g5_pack_rucksack: '#6a6a44', g5_pack_frame: '#5f6a4a', g5_pack_explorer: '#7a4a2a' };
const PACK_TRIM = { legendary: '#ffb040', unique: '#ffb040', set: '#6fd08a', rare: '#e8d020', magic: '#7fa8e8' };
const RARE_PACK = new Set(['rare', 'legendary', 'unique', 'set']);
/**
 * The pack model a back item draws, or null when it is a cloak. Pure. The item's own word first (`g5` / `look.g5` /
 * `packLook`), then its base, then anything C marks `pack: true` or names like one.
 */
export function packLookId(item) {
  if (!item) return null;
  const named = [item.look?.g5, item.g5, item.packLook, item.baseKey, item.base].find(v => typeof v === 'string' && v.startsWith('g5_pack_'));
  const key = item.catalogBase || item.baseKey || item.base || '';
  const isPack = !!named || item.pack === true || !!PACK_BY_BASE[key] || /(^|_)(pack|satchel|rucksack|knapsack|haversack)($|_)/.test(key);
  if (!isPack) return null;
  if (named) return named;                                                 // the rules chose a model outright (C: `packLook`, and `packs.rareLook` for a rare one)
  if (RARE_PACK.has(item.rarity) || item.isUnique || item.unique) return 'g5_pack_explorer';
  return PACK_BY_BASE[key] || 'g5_pack_rucksack';
}
/** The avatar part (`cape`) for a worn pack: the bag keeps its own colour, the buckles and piping take the rarity's. */
export function packPart(item) {
  const id = packLookId(item); if (!id) return null;
  return { id, color: item.look?.color || PACK_COLOUR[id] || '#6a5a3a', color2: PACK_TRIM[item.rarity] || '#c8a040' };
}
/** Equipment slot -> the catalog's game slot. */
const G5_SLOT = { weapon: 'weapon', mainhand: 'weapon', offhand: 'offhand', head: 'head', chest: 'chest', legs: 'legs', feet: 'feet', hands: 'hands', gloves: 'hands',
  back: 'cape', cape: 'cape', cloak: 'cape', necklace: 'necklace', neck: 'necklace', amulet: 'necklace', ring: 'ring', ring2: 'ring', belt: 'belt', waist: 'belt' };
/** Slots the game drew nothing for before the catalog: every item in them takes the catalog's model for its kind. */
const G5_ONLY = new Set(['hands', 'necklace', 'ring']);
/** Slots a worn set is keyed and drawn by, in a fixed order. */
export const DRAWN_SLOTS = ['head', 'chest', 'legs', 'feet', 'hands', 'weapon', 'offhand', 'back', 'cape', 'necklace', 'neck', 'ring', 'ring2', 'belt', 'waist'];

/** The catalog row a worn item is drawn with, or null (the older tables draw it). Pure. */
export function g5RowFor(item, slot, catalog) {
  if (!catalog || !item) return null;
  const gs = G5_SLOT[slot]; if (!gs) return null;
  const named = item.look?.g5 || item.g5 || (isG5(item.baseKey) ? item.baseKey : isG5(item.base) ? item.base : null);
  if (named) return catalog.byId(named, gs === 'offhand' ? 'offhand' : null) || catalog.byId(named) || null;
  if (!G5_ONLY.has(gs)) return null;
  try { return catalog.forItem({ ...item, slot: gs }) || null; } catch { return null; }
}

/**
 * Lay every catalog-drawn item over a look. `eq` = normalised items by slot. Mirrors gear-catalog.js `applyGear`
 * (one level deep: gloves merge into the top, rings into the accessory) with two game rules on top: a two-hander in
 * the OFF hand is drawn there (T7), and a belt never replaces a tier-2 kit's own decor.
 */
export function applyG5(out, eq, catalog) {
  const drawn = [];
  const free = k => !out[k]?.id || out[k].id === 'none';
  for (const slot of DRAWN_SLOTS) {
    const item = eq[slot]; if (!item) continue;
    const row = g5RowFor(item, slot, catalog);
    // C's slots addendum (play-test 5): `waist` is worn. A tier-2 kit's decor wins over a belt; a plain belt takes the older part.
    const gs = G5_SLOT[slot];
    if (!row && gs === 'belt') { if (free('decor')) out.decor = { id: 'belt_pouches', color: rarityTint(item) || '#6a4a2a' }; continue; }
    if (packLookId(item) && (slot === 'back' || slot === 'cape')) { drawn.push(out.cape?.id); continue; }   // W19: gearLook already put the pack on (its colours are its own)
    if (!row) continue;
    const el = item.castElement || item.brand || item.el || row.element || null;
    const weapon = row.kind === 'weapon' || row.slot === 'held';
    const color = weapon ? (el ? ELEMENT_TINT[el] || row.color : item.look?.color || (item.rarity === 'legendary' ? '#ffb040' : item.rarity === 'rare' ? '#e8d020' : row.color))
      : item.look?.color || rarityTint(item) || row.color;
    const part = { id: row.id, ...(color ? { color } : {}), ...(row.color2 ? { color2: row.color2 } : {}), quality: QUALITY[item.rarity] || 0, ...(el && weapon ? { element: el } : {}) };
    if (row.slot === 'held') { out[slot === 'offhand' ? 'offhand' : 'held'] = part; drawn.push(row.id); continue; }
    if (row.slot === 'decor' && out.decor?.id && out.decor.id !== 'none') continue;
    const field = slot === 'ring2' ? 'ring2' : row.field || null;
    if (field) out[row.slot] = { ...(out[row.slot] || { id: 'none' }), [field]: part };
    else {
      const keep = row.slot === 'top' ? { gloves: out.top?.gloves } : row.slot === 'accessory' ? { ring: out.accessory?.ring, ring2: out.accessory?.ring2 } : {};
      out[row.slot] = { ...Object.fromEntries(Object.entries(keep).filter(([, v]) => v != null)), ...part };
    }
    drawn.push(row.id);
  }
  if (drawn.length) out.g5 = drawn;         // (not an avatar slot: a note for tests and the perf read-out; the normaliser drops it)
  return out;
}

/** The worn item as it came (the raw form keeps a themed piece's numeric `tier`, which normItem drops for the weight). */
const raw = (equipment, slot) => (equipment?.[slot] && typeof equipment[slot] === 'object') ? equipment[slot] : null;

/** The parts to put on a body for a worn set (`slot -> item`, full items or the compact info.gear form). */
export function gearLook(equipment = {}, { baseOf = () => null, tierOf = null, tier2 = null, themes = null, catalog = null } = {}) {
  const out = JSON.parse(JSON.stringify(PLAIN));
  const lookup = tierOf ? (k => ({ tier: tierOf(k) })) : baseOf;
  const eq = {};
  for (const [slot, it] of Object.entries(equipment || {})) eq[slot] = normItem(it, lookup);
  for (const [slot, part] of Object.entries(SLOT_PART)) {
    const item = eq[slot]; if (!item) continue;
    if (item.look?.worn?.id) { out[part] = JSON.parse(JSON.stringify(item.look.worn)); continue; }
    const tier = item.tier || (slot === 'chest' ? 'medium' : 'light');
    const id = ARMOUR_BY_BASE[item.baseKey] || ARMOUR_LOOK[slot][tier] || ARMOUR_LOOK[slot].medium;
    out[part] = { id, color: rarityTint(item) || MODEL_COLOUR[id] || TIER_COLOUR[tier] || '#6a6a6a' };
  }
  // a helmet-less chest piece keeps the plain shorts unless legs are worn; plate over shorts reads oddly, so a
  // heavy chest with no legs gets plain trousers
  if (eq.chest && !eq.legs && /plate|scale/.test(out.top.id)) out.bottom = { id: 'pants', color: '#4a4038' };
  out.held = heldLook(eq.weapon || eq.mainhand || null);
  out.offhand = offhandLook(eq.offhand || null);
  // the back slot draws ONE thing: a backpack (W19) or a cloak
  if (eq.back || eq.cape) out.cape = packPart(eq.back || eq.cape) || { id: 'travel_cloak', color: rarityTint(eq.back || eq.cape) || '#4a3a2a' };
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
    return applyG5(hd ? dress(ch ? dress(out, 'chest') : out, 'head') : dress(out, 'chest'), eq, catalog);     // T23: LAST — tier2Dress replaces `decor`
  }
  return applyG5(out, eq, catalog);
}

// ---------------------------------------------------------------- play-test 8 (W25): ONE function for the worn model AND its icon
//
// "The War Helm's icon is a knight helm with a red plume; on my character it is a gold dome with horns." The bag's icon
// came from a second table (ui/inv-core.js ARMOUR_PARTS) that had drifted from this file. There is one answer now:
//
//   wornLook(item, slot, opts)   the whole look a body has wearing ONLY that item — exactly gearLook({ [slot]: item }, opts)
//   wornPart(item, slot, opts)   just what that item changed: { partSlot, part, parts } (parts = every avatar slot it touched)
//
// `opts` are the SAME ones the bodies in the world are dressed with (looks.js `gearOpts(cls)`): the item bases, the
// wearer's class tier-2 kit, the armour themes and the gear catalog. An icon drawn from wornLook cannot disagree with
// the body, because the body is drawn from the same call.
/** Equipment slot -> the avatar slot its model mainly lives in. */
export const PART_OF_SLOT = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes', hands: 'top', gloves: 'top', weapon: 'held', mainhand: 'held', offhand: 'offhand',
  back: 'cape', cape: 'cape', cloak: 'cape', necklace: 'accessory', neck: 'accessory', amulet: 'accessory', ring: 'accessory', ring2: 'accessory', belt: 'decor', waist: 'decor' };
export function wornLook(item, slot, opts = {}) { return gearLook({ [slot]: item }, opts); }
export function wornPart(item, slot, opts = {}) {
  const look = wornLook(item, slot, opts), parts = {};
  for (const k of Object.keys(look)) {
    if (k === 'g5') continue;
    if (JSON.stringify(look[k]) !== JSON.stringify(PLAIN[k] ?? null)) parts[k] = look[k];
  }
  // a chest piece with no legs puts plain trousers on: that is the body's doing, not the item's picture
  if (slot === 'chest' && parts.bottom && !item?.look?.worn) delete parts.bottom;
  const partSlot = PART_OF_SLOT[slot] && parts[PART_OF_SLOT[slot]] ? PART_OF_SLOT[slot] : Object.keys(parts)[0] || PART_OF_SLOT[slot] || null;
  let part = partSlot ? parts[partSlot] ?? null : null;
  if (part && (slot === 'hands' || slot === 'gloves') && part.gloves) part = part.gloves;
  if (part && (slot === 'ring' || slot === 'ring2') && (part.ring || part.ring2)) part = part.ring || part.ring2;
  return { partSlot, part, parts, look };
}
/** A short, stable key of an item's picture (two items with the same key draw the same model in the same colours). */
export function wornKey(item, slot, opts = {}) { const w = wornPart(item, slot, opts); return `${slot}>${w.partSlot || '-'}:${JSON.stringify(w.parts)}`; }

/** A short key of what is drawn (cache key; a change means the body must be re-dressed). */
export function gearKey(equipment = {}) {
  const eq = equipment || {};
  return DRAWN_SLOTS.map(s => {
    const i = eq[s]; if (!i) return '-';
    return `${i.baseKey || i.base || i.subtype || i.sub || i.name || '?'}:${i.rarity || ''}:${i.castElement || i.brand || i.el || ''}:${i.tier || ''}:${i.unique || ''}:${i.lvl ?? i.level ?? ''}:${i.theme || ''}:${i.look?.g5 || i.g5 || ''}`;
  }).join('|');
}
