// Chibi 2 — the round-5 gear ("g5_") id tables, with no Three.js in them.
//
// Thousandvale play-test 5 (T23, and the model half of T15): "a whole new type of item for every slot and
// archetype — new plate chest, new cloth chest, new leather chest… for every weapon type and accessory" and
// "a variety of wands and staves with special magic attacks: cones, areas, projectiles, beams, forks,
// shields. Off hand focuses too."
//
// THIS FILE IS THE DESIGN LIST. Every new model is one row here: which avatar slot it goes in, what it is, the
// name an item made from it might carry, and — for things in a hand — how the clips should hold it. The
// builders (chibi2-gear5-weapons.js / -armour.js / -offhand.js) assert at load that they build exactly these
// ids, tools/build-gear-catalog.mjs turns the rows into avatar-3d/data/gear-catalog.json, and the node tests
// read it without a browser. Same reason chibi2-weapon-ids.js and creature-types.js exist.
//
// NOTHING HERE CHANGES AN EXISTING LOOK. Every id starts `g5_`; an avatar that names none builds what it
// always built (avatar-3d/tests/gear-catalog.test.js compares the geometry).
//
// Row fields:
//   type       weapon type / focus kind / armour piece — the catalog's `type`
//   name       a suggested item name (original names only — CLAUDE.md convention 9)
//   alias2d    the paper-doll part drawn for it in 2D (avatar-2d has no art for these; nearest kin)
//   color/color2  default tint
//   minLevel   suggested first level for drops and shops
// held:    hands 1|2 · hold = the clip family (chibi2-motion.js REST_PITCH) · edge = which of its own axes
//          the striking edge faces (default '+x') · headY / buttY = where the two ends are in hand space
//          (-y is out past the fingertips, +y runs up the forearm; staves carry their topper at +y)
// offhand: left = how the left arm carries it (shield | orb | book | torch | none)
// armour:  archetype cloth | leather | mail | plate · style = the plain body garment drawn UNDER the piece
//          (chibi2-body.js TOP_STYLES / BOTTOM_STYLES / SHOE_STYLES vocabulary)
// hat:     cover = hides the hair on the crown · brim = the height (head units) hair is cut off under it

export const G5_PREFIX = 'g5_';
export const isG5 = id => typeof id === 'string' && id.startsWith(G5_PREFIX);

/** The six magic attack forms a wand, staff or focus can suggest by its silhouette (T15). */
export const ATTACK_FORMS = ['projectile', 'cone', 'area', 'beam', 'fork', 'shield'];
export const ARCHETYPES = ['cloth', 'leather', 'mail', 'plate'];

// ---------------------------------------------------------------- held (right hand; one-handers also dual wield)
export const G5_HELD = {
  // ---- one new model per weapon type in the item data
  g5_kris: { type: 'dagger', hands: 1, hold: 'dagger', headY: -0.38, buttY: 0.08, name: 'Tidewater Kris', alias2d: 'fh_dagger', minLevel: 2 },
  g5_leafblade: { type: 'sword', hands: 1, hold: 'blade', headY: -0.66, buttY: 0.13, name: 'Marsh Leafblade', alias2d: 'fh_sword', minLevel: 2 },
  g5_flamberge: { type: 'sword2h', hands: 2, hold: 'heavy', headY: -1.14, buttY: 0.22, name: 'Rippled Greatblade', alias2d: 'fh_greatsword', minLevel: 8 },
  g5_moonaxe: { type: 'axe', hands: 1, hold: 'haft', edge: '-z', headY: -0.68, buttY: 0.10, name: 'Halfmoon Axe', alias2d: 'fh_axe', minLevel: 3 },
  g5_headsman: { type: 'axe2h', hands: 2, hold: 'heavy', edge: '-z', headY: -1.02, buttY: 0.25, name: "Headsman's Longaxe", alias2d: 'fh_greataxe', minLevel: 7 },
  g5_morningstar: { type: 'mace', hands: 1, hold: 'haft', headY: -0.59, buttY: 0.10, name: 'Thornhead Morningstar', alias2d: 'fh_mace', minLevel: 3 },
  g5_mallet: { type: 'hammer', hands: 1, hold: 'haft', edge: '-x', headY: -0.61, buttY: 0.10, name: "Cooper's Mallet", alias2d: 'fh_hammer', minLevel: 2 },
  g5_stonemaul: { type: 'hammer2h', hands: 2, hold: 'heavy', edge: '-x', headY: -0.98, buttY: 0.22, name: 'Quarrybound Sledge', alias2d: 'fh_maul', minLevel: 9 },
  g5_partisan: { type: 'spear', hands: 1, hold: 'polearm', headY: -1.24, buttY: 0.62, name: 'Winged Partisan', alias2d: 'fh_spear', minLevel: 4 },
  g5_bardiche: { type: 'polearm', hands: 2, hold: 'polearm', edge: '-z', headY: -1.28, buttY: 0.68, name: "Reaper's Bardiche", alias2d: 'fh_halberd', minLevel: 10 },
  g5_harpoon: { type: 'javelin', hands: 1, hold: 'polearm', headY: -0.86, buttY: 0.40, name: 'Barbed Harpoon', alias2d: 'fh_javelin', minLevel: 3 },
  g5_recurve: { type: 'bow', hands: 2, hold: 'none', bow: true, edge: '-z', name: 'Horn Recurve', alias2d: 'bow', minLevel: 4 },
  g5_arbalest: { type: 'crossbow', hands: 2, hold: 'crossbow', edge: '-z', name: 'Stirrup Arbalest', alias2d: 'crossbow', minLevel: 8 },
  g5_bostaff: { type: 'quarterstaff', hands: 2, hold: 'polearm', headY: -0.82, buttY: 0.82, name: 'Ironshod Bo', alias2d: 'fh_quarterstaff', minLevel: 3 },
  g5_crownsceptre: { type: 'scepter', hands: 1, hold: 'haft', headY: -0.47, buttY: 0.11, name: 'Crownhead Sceptre', alias2d: 'fh_scepter', minLevel: 5 },
  g5_armillary: { type: 'orb', hands: 1, hold: 'caster', name: 'Armillary Orb', alias2d: 'orb', minLevel: 5, form: 'area' },
  g5_codex: { type: 'tome', hands: 1, hold: 'caster', name: 'Open Codex', alias2d: 'book', minLevel: 4, form: 'projectile' },
  // ---- wands: one silhouette per magic attack form (the dart is the plain "wand")
  g5_wand_dart: { type: 'wand', hands: 1, hold: 'wand', headY: -0.46, buttY: 0.07, name: 'Dart Wand', alias2d: 'fh_wand', minLevel: 1, form: 'projectile' },
  g5_wand_bell: { type: 'wand', hands: 1, hold: 'wand', headY: -0.45, buttY: 0.07, name: 'Bellmouth Wand', alias2d: 'fh_wand', minLevel: 4, form: 'cone' },
  g5_wand_hoop: { type: 'wand', hands: 1, hold: 'wand', headY: -0.46, buttY: 0.07, name: 'Hoop Wand', alias2d: 'fh_wand', minLevel: 6, form: 'area' },
  g5_wand_lens: { type: 'wand', hands: 1, hold: 'wand', headY: -0.53, buttY: 0.07, name: 'Sunglass Wand', alias2d: 'fh_wand', minLevel: 8, form: 'beam' },
  g5_wand_fork: { type: 'wand', hands: 1, hold: 'wand', headY: -0.45, buttY: 0.07, name: 'Forked Wand', alias2d: 'fh_wand', minLevel: 10, form: 'fork' },
  g5_wand_ward: { type: 'wand', hands: 1, hold: 'wand', headY: -0.47, buttY: 0.07, name: 'Warding Wand', alias2d: 'fh_wand', minLevel: 12, form: 'shield' },
  // ---- staves: the same six forms, two-handed, topper at +y like the staff_* family
  g5_staff_spire: { type: 'staff', hands: 2, hold: 'staff', headY: 0.86, buttY: -0.59, name: 'Spire Staff', alias2d: 'staff_crystal', minLevel: 1, form: 'projectile' },
  g5_staff_horn: { type: 'staff', hands: 2, hold: 'staff', headY: 0.83, buttY: -0.59, name: 'Horncall Staff', alias2d: 'staff_crook', minLevel: 4, form: 'cone' },
  g5_staff_halo: { type: 'staff', hands: 2, hold: 'staff', headY: 0.88, buttY: -0.59, name: 'Halo Staff', alias2d: 'staff_orb', minLevel: 6, form: 'area' },
  g5_staff_lens: { type: 'staff', hands: 2, hold: 'staff', headY: 0.89, buttY: -0.59, name: 'Sunglass Staff', alias2d: 'staff_crystal', minLevel: 8, form: 'beam' },
  g5_staff_branch: { type: 'staff', hands: 2, hold: 'staff', headY: 0.92, buttY: -0.59, name: 'Stormbranch Staff', alias2d: 'staff_totem', minLevel: 10, form: 'fork' },
  g5_staff_aegis: { type: 'staff', hands: 2, hold: 'staff', headY: 0.91, buttY: -0.59, name: 'Bulwark Staff', alias2d: 'staff_orb', minLevel: 12, form: 'shield' },
};

// ---------------------------------------------------------------- off hand
export const G5_OFFHAND = {
  // shields: strapped to the forearm (elbowL), face out
  g5_targe: { type: 'shield', shield: 'buckler', left: 'shield', name: 'Studded Targe', alias2d: 'buckler', color: '#7a5a3a', minLevel: 1 },
  g5_scutcheon: { type: 'shield', shield: 'heater', left: 'shield', name: 'Notched Scutcheon', alias2d: 'heater_shield', color: '#8d97a3', minLevel: 3 },
  g5_almond: { type: 'shield', shield: 'kite', left: 'shield', name: 'Almond Kite', alias2d: 'kite_shield', color: '#8d97a3', minLevel: 6 },
  g5_pavise: { type: 'shield', shield: 'tower', left: 'shield', name: 'Ridged Pavise', alias2d: 'tower_shield', color: '#8d97a3', minLevel: 10 },
  // foci: one new model per focus kind, each suggesting one attack form
  g5_folio: { type: 'focus', focus: 'tome', left: 'book', name: 'Sealed Folio', alias2d: 'book', color: '#3a4a6a', minLevel: 3, form: 'projectile' },
  g5_starglass: { type: 'focus', focus: 'orb', left: 'orb', name: 'Caged Starglass', alias2d: 'orb', color: '#9fd8ff', minLevel: 5, form: 'area' },
  g5_thurible: { type: 'focus', focus: 'relic', left: 'orb', name: "Pilgrim's Thurible", alias2d: 'relic', color: '#c8a040', minLevel: 5, form: 'cone' },
  g5_seeingmask: { type: 'focus', focus: 'idol', left: 'orb', name: 'Seeing Mask', alias2d: 'idol', color: '#b89a58', minLevel: 8, form: 'beam' },
  g5_sigilplate: { type: 'focus', focus: 'ward', left: 'orb', name: 'Sigil Plate', alias2d: 'orb', color: '#9fe0ff', minLevel: 6, form: 'shield' },
  g5_antlerrod: { type: 'focus', focus: 'totem', left: 'orb', name: 'Antler Rod', alias2d: 'idol', color: '#8a6a42', minLevel: 8, form: 'fork' },
  // carried things that are not a focus
  g5_hipquiver: { type: 'quiver', left: 'none', name: 'Hip Quiver', alias2d: 'quiver', color: '#6a4a2a', minLevel: 2 },
  g5_cresset: { type: 'torch', gameSlot: 'light', left: 'torch', name: 'Cresset Torch', alias2d: 'torch', color: '#ff8c2a', minLevel: 1 },
};

// ---------------------------------------------------------------- armour: 5 slots x 4 archetypes
/** head -> avatar.hat.id. No id may contain "helm": chibi2.js sends every /helm/ id to its generic dome. */
export const G5_HATS = {
  g5_cloth_wrap: { archetype: 'cloth', name: "Scholar's Headwrap", alias2d: 'bandana', color: '#7a6a8a', color2: '#d8b040', cover: true, brim: 0.44, minLevel: 1 },
  g5_leather_slouch: { archetype: 'leather', name: 'Pinned Slouch Hat', alias2d: 'wide_brim', color: '#6a4a30', color2: '#c8b890', cover: true, brim: 0.43, minLevel: 2 },
  g5_mail_cap: { archetype: 'mail', name: 'Banded Cap and Aventail', alias2d: 'chain_coif', color: '#8a9098', color2: '#536a73', cover: true, brim: 0.42, minLevel: 5 },
  g5_plate_armet: { archetype: 'plate', name: 'Houndsnout Armet', alias2d: 'great_helm', color: '#a0a8b2', color2: '#d8b040', cover: true, minLevel: 9 },
};
/** chest -> avatar.top.id. `style` is the plain garment under the piece (a new TOP_STYLES row). */
export const G5_TOPS = {
  g5_cloth_vestment: { archetype: 'cloth', name: 'Layered Vestment', alias2d: 'sash_robe', color: '#5a4a7a', color2: '#d8c8a0', minLevel: 1,
    style: { sleeve: 'bell', collar: 'crossed', front: 'none', hem: 'knee', belt: 'none', g5: true } },
  g5_leather_brigandine: { archetype: 'leather', name: 'Studded Brigandine', alias2d: 'strapped_leather', color: '#6a4a30', color2: '#b8a070', minLevel: 2,
    style: { sleeve: 'short', collar: 'round', front: 'none', hem: 'none', belt: 'none', shirt: true, g5: true } },
  g5_mail_hauberk: { archetype: 'mail', name: 'Yoked Hauberk', alias2d: 'chainmail', color: '#7a8088', color2: '#6a4a30', minLevel: 5,
    style: { sleeve: 'mail', collar: 'round', front: 'none', hem: 'mail', belt: 'none', armor: 'g5', g5: true } },
  g5_plate_cuirass: { archetype: 'plate', name: 'Fluted Cuirass', alias2d: 'plate', color: '#a0a8b2', color2: '#d8b040', minLevel: 9,
    style: { sleeve: 'mail', collar: 'none', front: 'none', hem: 'none', belt: 'none', armor: 'g5', g5: true } },
};
/** legs -> avatar.bottom.id */
export const G5_BOTTOMS = {
  g5_cloth_pleats: { archetype: 'cloth', name: 'Pleated Wideleg', alias2d: 'baggy', color: '#4a3f66', color2: '#d8c8a0', minLevel: 1, style: { leg: 1, belt: false, loose: true, g5: true } },
  g5_leather_chaps: { archetype: 'leather', name: 'Strapped Chaps', alias2d: 'pants', color: '#5a4030', color2: '#b8a070', minLevel: 2, style: { leg: 1, belt: true, g5: true } },
  g5_mail_chausses: { archetype: 'mail', name: 'Mail Chausses', alias2d: 'leggings', color: '#7a8088', color2: '#6a4a30', minLevel: 5, style: { leg: 1, belt: true, tight: true, g5: true } },
  g5_plate_cuisses: { archetype: 'plate', name: 'Fan-kneed Cuisses', alias2d: 'greaves', color: '#a0a8b2', color2: '#d8b040', minLevel: 9, style: { leg: 1, belt: true, g5: true } },
};
/** feet -> avatar.shoes.id */
export const G5_SHOES = {
  g5_cloth_curltoes: { archetype: 'cloth', name: 'Curl-toe Slippers', alias2d: 'slippers', color: '#6a5a8a', color2: '#d8b040', minLevel: 1, style: { shaft: 0, foot: 'slipper', g5: true } },
  g5_leather_cuffboots: { archetype: 'leather', name: 'Cuffed Riding Boots', alias2d: 'boots', color: '#5a3a24', color2: '#b8a070', minLevel: 2, style: { shaft: 0.62, foot: 'boot', g5: true } },
  g5_mail_splints: { archetype: 'mail', name: 'Splinted Boots', alias2d: 'boots', color: '#5a5048', color2: '#8a9098', minLevel: 5, style: { shaft: 0.5, foot: 'boot', g5: true } },
  g5_plate_sabatons: { archetype: 'plate', name: 'Pointed Sabatons', alias2d: 'heavy', color: '#a0a8b2', color2: '#d8b040', minLevel: 9, style: { shaft: 0.7, foot: 'boot', g5: true } },
};
/**
 * hands -> avatar.top.gloves = { id, color, color2 }. A NEW field: Chibi 2 had no hands model at all (a
 * "gauntlet" was a cuff the plate top drew on its own forearm). Extra fields on a slot survive the shared
 * normaliser, so no 2D registration is needed.
 */
export const G5_GLOVES = {
  g5_cloth_handwraps: { archetype: 'cloth', name: 'Silk Handwraps', color: '#d8c8a0', color2: '#5a4a7a', minLevel: 1 },
  g5_leather_gloves: { archetype: 'leather', name: 'Studded Longgloves', color: '#5a3a24', color2: '#b8a070', minLevel: 2 },
  g5_mail_mitts: { archetype: 'mail', name: 'Mail Mittens', color: '#7a8088', color2: '#6a4a30', minLevel: 5 },
  g5_plate_gauntlets: { archetype: 'plate', name: 'Hourglass Gauntlets', color: '#a0a8b2', color2: '#d8b040', minLevel: 9 },
};

// ---------------------------------------------------------------- accessories
/** cape -> avatar.cape.id */
export const G5_CAPES = {
  g5_swallowtail: { type: 'cloak', gameSlot: 'cape', name: 'Swallowtail Cloak', alias2d: 'cape', color: '#3a4a5a', color2: '#c8a040', minLevel: 3 },
};
/**
 * Backpacks (Thousandvale owner feedback 8, W19) -> avatar.cape.id: the back slot draws a cloak OR a pack.
 * Models in chibi2-backpacks.js. `size` = how much it carries (the game's bag slots are the game's own numbers).
 */
export const G5_PACKS = {
  g5_pack_satchel: { type: 'pack', gameSlot: 'cape', name: 'Sling Satchel', alias2d: 'none', color: '#7a5a3a', color2: '#c8a040', minLevel: 1, size: 'small' },
  g5_pack_rucksack: { type: 'pack', gameSlot: 'cape', name: 'Trail Rucksack', alias2d: 'none', color: '#6a6a44', color2: '#c8a040', minLevel: 10, size: 'medium' },
  g5_pack_frame: { type: 'pack', gameSlot: 'cape', name: 'Frame Pack', alias2d: 'none', color: '#5f6a4a', color2: '#c8a040', minLevel: 20, size: 'large' },
  g5_pack_explorer: { type: 'pack', gameSlot: 'cape', name: "Explorer's Pack", alias2d: 'none', color: '#7a4a2a', color2: '#d8b040', minLevel: 10, size: 'medium' },
};
/** light / belt -> avatar.decor.id */
export const G5_DECOR = {
  g5_hexlantern: { type: 'lantern', gameSlot: 'light', name: 'Hooded Storm Lantern', alias2d: 'belt_lantern', color: '#4a4a52', minLevel: 2 },
  g5_girdle: { type: 'belt', gameSlot: 'belt', name: 'Buckled War Girdle', alias2d: 'trophy_belt', color: '#5a3a24', color2: '#c8a040', minLevel: 2 },
};
/** necklace -> avatar.accessory.id */
export const G5_ACCESSORY = {
  g5_torc: { type: 'amulet', gameSlot: 'necklace', name: 'Twisted Torc', alias2d: 'pendant', color: '#d8b040', color2: '#7fd4ff', minLevel: 3 },
};
/** ring -> avatar.accessory.ring (right hand) / avatar.accessory.ring2 (left hand) = { id, color, color2 } */
export const G5_RINGS = {
  g5_signet: { type: 'ring', gameSlot: 'ring', name: 'Signet Band', color: '#d8b040', color2: '#b03030', minLevel: 3 },
};

// ---------------------------------------------------------------- the lot, by avatar slot
/** avatar slot -> table. `field` rows ride an extra field of their slot rather than its id. */
export const G5_TABLES = [
  { slot: 'held', table: G5_HELD, kind: 'weapon', gameSlot: 'weapon', file: 'avatar-3d/js/chibi2-gear5-weapons.js', export: 'G5_WEAPON_BUILDERS' },
  { slot: 'offhand', table: G5_OFFHAND, kind: 'offhand', gameSlot: 'offhand', file: 'avatar-3d/js/chibi2-gear5-offhand.js', export: 'G5_OFFHAND_BUILDERS' },
  { slot: 'hat', table: G5_HATS, kind: 'armour', gameSlot: 'head', type: 'head', file: 'avatar-3d/js/chibi2-gear5-armour.js', export: 'G5_HAT_BUILDERS' },
  { slot: 'top', table: G5_TOPS, kind: 'armour', gameSlot: 'chest', type: 'chest', file: 'avatar-3d/js/chibi2-gear5-armour.js', export: 'G5_TOP_BUILDERS' },
  { slot: 'bottom', table: G5_BOTTOMS, kind: 'armour', gameSlot: 'legs', type: 'legs', file: 'avatar-3d/js/chibi2-gear5-armour.js', export: 'G5_BOTTOM_BUILDERS' },
  { slot: 'shoes', table: G5_SHOES, kind: 'armour', gameSlot: 'feet', type: 'feet', file: 'avatar-3d/js/chibi2-gear5-armour.js', export: 'G5_SHOE_BUILDERS' },
  { slot: 'top', field: 'gloves', table: G5_GLOVES, kind: 'armour', gameSlot: 'hands', type: 'hands', file: 'avatar-3d/js/chibi2-gear5-armour.js', export: 'G5_GLOVE_BUILDERS' },
  { slot: 'cape', table: G5_CAPES, kind: 'accessory', file: 'avatar-3d/js/chibi2-gear5-offhand.js', export: 'G5_CAPE_BUILDERS' },
  { slot: 'cape', table: G5_PACKS, kind: 'accessory', file: 'avatar-3d/js/chibi2-backpacks.js', export: 'G5_PACK_BUILDERS' },
  { slot: 'decor', table: G5_DECOR, kind: 'accessory', file: 'avatar-3d/js/chibi2-gear5-offhand.js', export: 'G5_DECOR_BUILDERS' },
  { slot: 'accessory', table: G5_ACCESSORY, kind: 'accessory', file: 'avatar-3d/js/chibi2-gear5-offhand.js', export: 'G5_ACCESSORY_BUILDERS' },
  { slot: 'accessory', field: 'ring', table: G5_RINGS, kind: 'accessory', file: 'avatar-3d/js/chibi2-gear5-offhand.js', export: 'G5_RING_BUILDERS' },
];

/** Ids that go in `avatar.<slot>.id`, per slot — what the 2D normaliser has to be told about. */
export const G5_SLOT_IDS = {};
for (const t of G5_TABLES) if (!t.field) (G5_SLOT_IDS[t.slot] ??= []).push(...Object.keys(t.table));

/** Held ids a bow's rules apply to (the bow is in the LEFT hand; the right draws). Includes the original. */
export const BOW_IDS = new Set(['bow', ...Object.keys(G5_HELD).filter(id => G5_HELD[id].bow)]);

// what chibi2-weapon-ids.js folds into its own tables, so every clip carries a g5_ item the way it carries its kin
export const G5_RIGHT_KIND = Object.fromEntries(Object.entries(G5_HELD).map(([id, r]) => [id, r.hold]));
export const G5_TWO_HANDED = Object.keys(G5_HELD).filter(id => G5_HELD[id].hands === 2 && ['heavy', 'polearm'].includes(G5_HELD[id].hold));
export const G5_EDGE_AXIS = Object.fromEntries(Object.entries(G5_HELD).filter(([, r]) => r.edge).map(([id, r]) => [id, r.edge]));
export const G5_LEFT_KIND = Object.fromEntries(Object.entries(G5_OFFHAND).map(([id, r]) => [id, r.left]));

/** Hats that hide the crown hair, and where the hair is cut under each. */
export const G5_HATS_COVER_CROWN = Object.keys(G5_HATS).filter(id => G5_HATS[id].cover);
export const G5_HAT_BRIM = Object.fromEntries(Object.entries(G5_HATS).filter(([, r]) => r.brim).map(([id, r]) => [id, r.brim]));

/** New garment rows for chibi2-body.js's tables (the plain body under each armour piece). */
const styles = table => Object.fromEntries(Object.entries(table).map(([id, r]) => [id, r.style]));
export const G5_TOP_STYLES = styles(G5_TOPS), G5_BOTTOM_STYLES = styles(G5_BOTTOMS), G5_SHOE_STYLES = styles(G5_SHOES);

for (const id of Object.keys(G5_HATS)) if (/helm/.test(id)) throw new Error(`chibi2-gear5-ids: hat id "${id}" contains "helm" and would fall into chibi2.js's generic dome`);
for (const t of G5_TABLES) for (const id of Object.keys(t.table)) if (!isG5(id)) throw new Error(`chibi2-gear5-ids: "${id}" must start with ${G5_PREFIX}`);
