// Rogueloot item data generator. Every base row below is hand-specified (kind, drop level, speed, grid, reqs, look);
// the script only turns the weapon damage ladder and armour ladder into numbers, checks ids are unique and writes JSON.
import fs from 'node:fs';
const OUT = new URL('../data/', import.meta.url).pathname;   // re-run: node tools/gen-items.mjs (it rewrites data/item-bases, affixes, rarity, currency, uniques, legendaries)
fs.mkdirSync(OUT, { recursive: true });

// ---------- ladders (also written into the _doc so a programmer can tune monsters against them) ----------
const refDps = L => 4 + 1.5 * L + 0.02 * L * L;          // one-handed weapon dps at drop level L (before affixes)
const armourPool = L => 10 * L + 50;                      // the K in dr = armour / (armour + K(attackerLevel))
const fullSetArmour = L => 1.5 * armourPool(L);           // plate full set = 60% reduction vs a same-level attacker
const PROF_MULT = { cloth: 0.45, leather: 0.6, mail: 0.8, plate: 1.0 };
const SLOT_SHARE = { chest: 0.35, head: 0.2, feet: 0.15, hands: 0.12, belt: 0.08, shield: 0.1 };
const r = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

// ---------- weapon kinds ----------
// hands: 1 or 2. class = the weapon proficiency class a Path must have. dps = share of refDps.
const KINDS = {
  dagger:     { class: 'dagger',   hands: 1, speed: 1.6,  dps: 0.9,  grid: [1, 2], offhandOk: true, primary: 'agi' },
  sword:      { class: 'sword',    hands: 1, speed: 1.2,  dps: 1.0,  grid: [1, 3], offhandOk: true, primary: 'str' },
  axe:        { class: 'axe',      hands: 1, speed: 1.1,  dps: 1.0,  grid: [2, 3], offhandOk: true, primary: 'str' },
  mace:       { class: 'mace',     hands: 1, speed: 1.0,  dps: 1.0,  grid: [1, 3], offhandOk: false, primary: 'str' },
  sceptre:    { class: 'mace',     hands: 1, speed: 1.0,  dps: 0.8,  grid: [1, 3], offhandOk: false, primary: 'spi', caster: true },
  greatsword: { class: 'sword',    hands: 2, speed: 0.8,  dps: 1.35, grid: [2, 4], primary: 'str' },
  greataxe:   { class: 'axe',      hands: 2, speed: 0.75, dps: 1.35, grid: [2, 4], primary: 'str' },
  maul:       { class: 'mace',     hands: 2, speed: 0.7,  dps: 1.35, grid: [2, 4], primary: 'str' },
  spear:      { class: 'polearm',  hands: 2, speed: 1.0,  dps: 1.25, grid: [1, 4], primary: 'str' },
  polearm:    { class: 'polearm',  hands: 2, speed: 0.75, dps: 1.35, grid: [1, 4], primary: 'str' },
  bow:        { class: 'bow',      hands: 2, speed: 1.1,  dps: 1.2,  grid: [2, 3], ranged: true, primary: 'agi' },
  crossbow:   { class: 'crossbow', hands: 2, speed: 0.7,  dps: 1.25, grid: [2, 3], ranged: true, primary: 'agi' },
  staff:      { class: 'staff',    hands: 2, speed: 0.9,  dps: 0.9,  grid: [1, 4], primary: 'int', caster: true },
  wand:       { class: 'wand',     hands: 1, speed: 1.3,  dps: 0.6,  grid: [1, 2], ranged: true, primary: 'int', caster: true },
};
const SPELL_POWER = L => r(2 + 1.2 * L);   // flat spell power implicit for wands / sceptres (staff gets 1.6x)

// [id, name, kind, dropLevel, tier, look, extraReq?, implicitOverride?]
// tier: plain (Act 1), fine (Veteran / Act 2), masterwork (Legend / Act 3)
const WEAPONS = [
  // daggers
  ['skinning_knife', 'Skinning Knife', 'dagger', 1, 'plain', 'dagger: short plain blade, wood grip'],
  ['stiletto', 'Stiletto', 'dagger', 6, 'plain', 'dagger: needle blade, round guard'],
  ['hooked_dirk', 'Hooked Dirk', 'dagger', 13, 'plain', 'dagger: curved tip, bone handle'],
  ['glass_fang', 'Glass Fang', 'dagger', 24, 'fine', 'dagger: translucent green blade'],
  ['widow_needle', 'Widow Needle', 'dagger', 44, 'masterwork', 'dagger: black thin blade, silver wire grip'],
  // swords
  ['footman_sword', 'Footman Sword', 'sword', 1, 'plain', 'sword: straight short blade, cross guard'],
  ['river_sabre', 'River Sabre', 'sword', 7, 'plain', 'sword: curved single edge, brass guard'],
  ['warden_blade', 'Warden Blade', 'sword', 14, 'plain', 'sword: long straight blade, blue grip wrap'],
  ['heron_sword', 'Heron Sword', 'sword', 23, 'fine', 'sword: slim blade, upswept guard'],
  ['kingfisher', 'Kingfisher', 'sword', 45, 'masterwork', 'sword: pale blade, gold and teal hilt'],
  // axes
  ['hand_axe', 'Hand Axe', 'axe', 2, 'plain', 'axe: woodcutter head, ash haft'],
  ['bearded_axe', 'Bearded Axe', 'axe', 9, 'plain', 'axe: long bearded blade'],
  ['cleaver_axe', 'Cleaver Axe', 'axe', 16, 'plain', 'axe: broad square head'],
  ['moon_axe', 'Moon Axe', 'axe', 26, 'fine', 'axe: crescent blade, dark steel'],
  ['raven_axe', 'Raven Axe', 'axe', 47, 'masterwork', 'axe: black head with a beak-shaped back spike'],
  // maces
  ['cudgel', 'Cudgel', 'mace', 1, 'plain', 'mace: knotted wooden club'],
  ['iron_mace', 'Iron Mace', 'mace', 8, 'plain', 'mace: flanged iron head'],
  ['morningstar', 'Morningstar', 'mace', 15, 'plain', 'mace: spiked ball head'],
  ['bell_mace', 'Bell Mace', 'mace', 25, 'fine', 'mace: bronze bell-shaped head'],
  ['sunder_mace', 'Sunder Mace', 'mace', 46, 'masterwork', 'mace: wide steel head with four fins'],
  // sceptres (healer)
  ['prayer_rod', 'Prayer Rod', 'sceptre', 3, 'plain', 'sceptre: short rod with a wooden disc'],
  ['hallow_sceptre', 'Hallow Sceptre', 'sceptre', 11, 'plain', 'sceptre: silver rod, sun disc'],
  ['bishop_sceptre', 'Bishop Sceptre', 'sceptre', 18, 'plain', 'sceptre: gilded, ring-shaped head'],
  ['dawn_sceptre', 'Dawn Sceptre', 'sceptre', 28, 'fine', 'sceptre: white gold, radiant head'],
  ['choir_sceptre', 'Choir Sceptre', 'sceptre', 48, 'masterwork', 'sceptre: tall, three-ringed head, soft glow'],
  // two-handed swords
  ['bastard_sword', 'Bastard Sword', 'greatsword', 4, 'plain', 'greatsword: hand-and-a-half, plain guard'],
  ['claymore', 'Claymore', 'greatsword', 12, 'plain', 'greatsword: long blade, down-turned quillons'],
  ['headsman', 'Headsman', 'greatsword', 19, 'plain', 'greatsword: heavy wide blade, square tip'],
  ['flamberge', 'Flamberge', 'greatsword', 29, 'fine', 'greatsword: wavy blade'],
  ['king_cleaver', 'King Cleaver', 'greatsword', 49, 'masterwork', 'greatsword: enormous dark blade, gold pommel'],
  // two-handed axes
  ['splitting_axe', 'Splitting Axe', 'greataxe', 5, 'plain', 'greataxe: single heavy head on a long haft'],
  ['war_axe', 'War Axe', 'greataxe', 13, 'plain', 'greataxe: double-bitted head'],
  ['reaver_axe', 'Reaver Axe', 'greataxe', 20, 'plain', 'greataxe: crescent double head, spiked top'],
  ['giant_axe', 'Giant Axe', 'greataxe', 30, 'fine', 'greataxe: oversized head, iron-banded haft'],
  ['doom_axe', 'Doom Axe', 'greataxe', 50, 'masterwork', 'greataxe: black double head, red runes'],
  // mauls
  ['sledge', 'Sledge', 'maul', 3, 'plain', 'maul: square iron sledgehammer'],
  ['war_maul', 'War Maul', 'maul', 11, 'plain', 'maul: long haft, round head'],
  ['ogre_maul', 'Ogre Maul', 'maul', 18, 'plain', 'maul: huge stone head'],
  ['thunder_maul', 'Thunder Maul', 'maul', 27, 'fine', 'maul: steel head with lightning engraving'],
  ['mountain_maul', 'Mountain Maul', 'maul', 48, 'masterwork', 'maul: obsidian head, gold bands'],
  // spears
  ['boar_spear', 'Boar Spear', 'spear', 2, 'plain', 'spear: leaf head with crossbar'],
  ['long_spear', 'Long Spear', 'spear', 10, 'plain', 'spear: narrow head, long shaft'],
  ['trident', 'Trident', 'spear', 17, 'plain', 'spear: three-pronged head'],
  ['pike', 'Pike', 'spear', 26, 'fine', 'spear: very long, small steel head'],
  ['star_spear', 'Star Spear', 'spear', 46, 'masterwork', 'spear: silver head, blue tassel'],
  // polearms
  ['bill_hook', 'Bill Hook', 'polearm', 4, 'plain', 'polearm: hooked blade on a pole'],
  ['halberd', 'Halberd', 'polearm', 12, 'plain', 'polearm: axe blade plus spike'],
  ['glaive', 'Glaive', 'polearm', 19, 'plain', 'polearm: single long curved blade'],
  ['bardiche', 'Bardiche', 'polearm', 28, 'fine', 'polearm: long crescent blade'],
  ['sky_scythe', 'Sky Scythe', 'polearm', 49, 'masterwork', 'polearm: sweeping scythe blade, pale steel'],
  // bows
  ['hunting_bow', 'Hunting Bow', 'bow', 1, 'plain', 'bow: short plain self bow'],
  ['long_bow', 'Long Bow', 'bow', 8, 'plain', 'bow: tall yew bow'],
  ['recurve_bow', 'Recurve Bow', 'bow', 15, 'plain', 'bow: recurved limbs, horn tips'],
  ['composite_bow', 'Composite Bow', 'bow', 24, 'fine', 'bow: layered horn and sinew'],
  ['wyvern_bow', 'Wyvern Bow', 'bow', 45, 'masterwork', 'bow: bone limbs, green string glow'],
  // crossbows
  ['light_crossbow', 'Light Crossbow', 'crossbow', 3, 'plain', 'crossbow: wooden stock, short prod'],
  ['heavy_crossbow', 'Heavy Crossbow', 'crossbow', 11, 'plain', 'crossbow: steel prod, stirrup'],
  ['arbalest', 'Arbalest', 'crossbow', 19, 'plain', 'crossbow: windlass, thick steel prod'],
  ['siege_crossbow', 'Siege Crossbow', 'crossbow', 29, 'fine', 'crossbow: double prod'],
  ['gale_crossbow', 'Gale Crossbow', 'crossbow', 50, 'masterwork', 'crossbow: silver prod, swept stock'],
  // staves
  ['walking_staff', 'Walking Staff', 'staff', 1, 'plain', 'staff: plain wooden pole'],
  ['gnarled_staff', 'Gnarled Staff', 'staff', 7, 'plain', 'staff: twisted wood, knot at the top'],
  ['lens_staff', 'Lens Staff', 'staff', 14, 'plain', 'staff: crystal lens in a bronze ring'],
  ['spire_staff', 'Spire Staff', 'staff', 23, 'fine', 'staff: tall steel spire, blue stone'],
  ['halo_staff', 'Halo Staff', 'staff', 44, 'masterwork', 'staff: floating ring of light at the top'],
  // wands
  ['willow_wand', 'Willow Wand', 'wand', 1, 'plain', 'wand: slim pale stick'],
  ['bone_wand', 'Bone Wand', 'wand', 6, 'plain', 'wand: carved bone, dark tip'],
  ['fork_wand', 'Fork Wand', 'wand', 13, 'plain', 'wand: two-pronged tip holding a stone'],
  ['hoop_wand', 'Hoop Wand', 'wand', 25, 'fine', 'wand: small hoop at the tip, gold'],
  ['bell_wand', 'Bell Wand', 'wand', 46, 'masterwork', 'wand: tiny silver bell, violet glow'],
];
const TIER_LEVELREQ = { plain: 0, fine: 0, masterwork: 0 };

function attrReq(primary, L, tier) {
  // characters start at 12 in every attribute; a player who puts 3 of 5 points a level into the primary attribute meets it (12 + 3(L-1) vs 8 + 2.5L).
  const req = {};
  req[primary] = r(8 + 2.5 * L);
  return req;
}
function weaponRow([id, name, kind, L, tier, look, extraReq, implicit]) {
  const k = KINDS[kind];
  const dps = refDps(L) * k.dps;
  const per = dps / k.speed;
  const min = Math.max(1, r(per * 0.75)), max = Math.max(min + 1, r(per * 1.25));
  const req = { ...attrReq(k.primary, L, tier), ...(extraReq || {}) };
  const row = {
    id, name, slot: 'weapon', kind, class: k.class, hands: k.hands, tier, grid: { w: k.grid[0], h: k.grid[1] },
    proficiency: k.class, levelReq: L, req, dropLevel: L,
    damage: { min, max, speed: k.speed, dps: r(dps, 1) },
  };
  if (k.ranged) row.ranged = true;
  if (k.offhandOk) row.offhandOk = true;
  if (k.caster) {
    const sp = kind === 'staff' ? r(SPELL_POWER(L) * 1.6) : SPELL_POWER(L);
    row.implicit = { stat: 'spellPower', units: 'flat', value: sp };
  }
  if (implicit) row.implicit = implicit;
  row.look = look;
  return row;
}

// ---------- armour ----------
// [id, name, slot, proficiency, dropLevel, tier, look]
const ARMOUR = [
  // cloth
  ['linen_hood', 'Linen Hood', 'head', 'cloth', 1, 'plain', 'hood: loose linen hood'],
  ['scholar_cap', 'Scholar Cap', 'head', 'cloth', 9, 'plain', 'cap: soft round cap with a tassel'],
  ['linen_robe', 'Linen Robe', 'chest', 'cloth', 1, 'plain', 'robe: plain belted robe'],
  ['quilted_robe', 'Quilted Robe', 'chest', 'cloth', 9, 'plain', 'robe: padded diamond-stitched robe'],
  ['wool_mitts', 'Wool Mitts', 'hands', 'cloth', 1, 'plain', 'gloves: short wool mitts'],
  ['scribe_gloves', 'Scribe Gloves', 'hands', 'cloth', 9, 'plain', 'gloves: thin leather-palmed cloth gloves'],
  ['cloth_shoes', 'Cloth Shoes', 'feet', 'cloth', 1, 'plain', 'shoes: soft slippers'],
  ['pilgrim_shoes', 'Pilgrim Shoes', 'feet', 'cloth', 9, 'plain', 'shoes: wrapped travelling shoes'],
  ['sage_cowl', 'Sage Cowl', 'head', 'cloth', 22, 'fine', 'hood: deep cowl with silver edging'],
  ['sage_vestment', 'Sage Vestment', 'chest', 'cloth', 22, 'fine', 'robe: layered vestment, runic hem'],
  ['sage_gloves', 'Sage Gloves', 'hands', 'cloth', 22, 'fine', 'gloves: embroidered cuffs'],
  ['sage_slippers', 'Sage Slippers', 'feet', 'cloth', 22, 'fine', 'shoes: curl-toed slippers'],
  ['archon_crown', 'Archon Crown', 'head', 'cloth', 42, 'masterwork', 'hood: circlet over a hood, floating gems'],
  ['archon_robe', 'Archon Robe', 'chest', 'cloth', 42, 'masterwork', 'robe: flowing robe with glowing seams'],
  ['archon_gloves', 'Archon Gloves', 'hands', 'cloth', 42, 'masterwork', 'gloves: long gloves with rune bands'],
  ['archon_shoes', 'Archon Shoes', 'feet', 'cloth', 42, 'masterwork', 'shoes: silk boots with gold toes'],
  // leather
  ['hide_cap', 'Hide Cap', 'head', 'leather', 2, 'plain', 'cap: stitched hide skullcap'],
  ['ranger_hood', 'Ranger Hood', 'head', 'leather', 11, 'plain', 'hood: leather hood with a brim'],
  ['hide_jerkin', 'Hide Jerkin', 'chest', 'leather', 2, 'plain', 'jerkin: sleeveless hide'],
  ['studded_jerkin', 'Studded Jerkin', 'chest', 'leather', 11, 'plain', 'jerkin: riveted leather'],
  ['hide_gloves', 'Hide Gloves', 'hands', 'leather', 2, 'plain', 'gloves: plain hide gloves'],
  ['bracer_gloves', 'Bracer Gloves', 'hands', 'leather', 11, 'plain', 'gloves: gloves with laced bracers'],
  ['hide_boots', 'Hide Boots', 'feet', 'leather', 2, 'plain', 'boots: soft ankle boots'],
  ['tracker_boots', 'Tracker Boots', 'feet', 'leather', 11, 'plain', 'boots: knee-high laced boots'],
  ['drake_cap', 'Drake Cap', 'head', 'leather', 23, 'fine', 'cap: scaled leather cap'],
  ['drake_coat', 'Drake Coat', 'chest', 'leather', 23, 'fine', 'jerkin: scaled hide long coat'],
  ['drake_gloves', 'Drake Gloves', 'hands', 'leather', 23, 'fine', 'gloves: scaled knuckles'],
  ['drake_boots', 'Drake Boots', 'feet', 'leather', 23, 'fine', 'boots: scaled shin guards'],
  ['shade_mask', 'Shade Mask', 'head', 'leather', 43, 'masterwork', 'cap: dark half-mask hood'],
  ['shade_harness', 'Shade Harness', 'chest', 'leather', 43, 'masterwork', 'jerkin: black strapped harness'],
  ['shade_gloves', 'Shade Gloves', 'hands', 'leather', 43, 'masterwork', 'gloves: clawed dark gloves'],
  ['shade_boots', 'Shade Boots', 'feet', 'leather', 43, 'masterwork', 'boots: silent dark boots'],
  // mail
  ['mail_coif', 'Mail Coif', 'head', 'mail', 4, 'plain', 'helm: ring-mail coif'],
  ['nasal_helm', 'Nasal Helm', 'head', 'mail', 13, 'plain', 'helm: conical helm with nose bar'],
  ['mail_shirt', 'Mail Shirt', 'chest', 'mail', 4, 'plain', 'hauberk: short ring-mail shirt'],
  ['mail_hauberk', 'Mail Hauberk', 'chest', 'mail', 13, 'plain', 'hauberk: knee-length mail'],
  ['mail_gloves', 'Mail Gloves', 'hands', 'mail', 4, 'plain', 'gloves: ring-mail mittens'],
  ['mail_gauntlets', 'Mail Gauntlets', 'hands', 'mail', 13, 'plain', 'gloves: mail with steel cuffs'],
  ['mail_boots', 'Mail Boots', 'feet', 'mail', 4, 'plain', 'boots: mail-wrapped boots'],
  ['splint_boots', 'Splint Boots', 'feet', 'mail', 13, 'plain', 'boots: boots with steel splints'],
  ['scale_helm', 'Scale Helm', 'head', 'mail', 24, 'fine', 'helm: scale-covered helm'],
  ['scale_hauberk', 'Scale Hauberk', 'chest', 'mail', 24, 'fine', 'hauberk: overlapping steel scales'],
  ['scale_gauntlets', 'Scale Gauntlets', 'hands', 'mail', 24, 'fine', 'gloves: scaled gauntlets'],
  ['scale_boots', 'Scale Boots', 'feet', 'mail', 24, 'fine', 'boots: scaled boots'],
  ['wyrm_helm', 'Wyrm Helm', 'head', 'mail', 44, 'masterwork', 'helm: crested scale helm'],
  ['wyrm_hauberk', 'Wyrm Hauberk', 'chest', 'mail', 44, 'masterwork', 'hauberk: dark scales with gold edging'],
  ['wyrm_gauntlets', 'Wyrm Gauntlets', 'hands', 'mail', 44, 'masterwork', 'gloves: clawed scale gauntlets'],
  ['wyrm_boots', 'Wyrm Boots', 'feet', 'mail', 44, 'masterwork', 'boots: scaled greaves'],
  // plate (Fighter specs / Paladin from level 10 — the first bases drop from 10)
  ['kettle_helm', 'Kettle Helm', 'head', 'plate', 10, 'plain', 'helm: wide-brimmed iron helm'],
  ['great_helm', 'Great Helm', 'head', 'plate', 17, 'plain', 'helm: full-face barrel helm'],
  ['breastplate', 'Breastplate', 'chest', 'plate', 10, 'plain', 'cuirass: plain steel breastplate'],
  ['field_plate', 'Field Plate', 'chest', 'plate', 17, 'plain', 'cuirass: full plate with pauldrons'],
  ['plate_gauntlets', 'Plate Gauntlets', 'hands', 'plate', 10, 'plain', 'gloves: articulated steel gauntlets'],
  ['war_gauntlets', 'War Gauntlets', 'hands', 'plate', 17, 'plain', 'gloves: heavy gauntlets with knuckle spikes'],
  ['plate_boots', 'Plate Boots', 'feet', 'plate', 10, 'plain', 'boots: steel sabatons'],
  ['war_boots', 'War Boots', 'feet', 'plate', 17, 'plain', 'boots: sabatons with greaves'],
  ['bastion_helm', 'Bastion Helm', 'head', 'plate', 25, 'fine', 'helm: visored helm with a crest'],
  ['bastion_plate', 'Bastion Plate', 'chest', 'plate', 25, 'fine', 'cuirass: fluted plate'],
  ['bastion_gauntlets', 'Bastion Gauntlets', 'hands', 'plate', 25, 'fine', 'gloves: fluted gauntlets'],
  ['bastion_boots', 'Bastion Boots', 'feet', 'plate', 25, 'fine', 'boots: fluted sabatons'],
  ['titan_helm', 'Titan Helm', 'head', 'plate', 45, 'masterwork', 'helm: horned great helm, gold inlay'],
  ['titan_plate', 'Titan Plate', 'chest', 'plate', 45, 'masterwork', 'cuirass: massive dark plate, gold trim'],
  ['titan_gauntlets', 'Titan Gauntlets', 'hands', 'plate', 45, 'masterwork', 'gloves: huge gauntlets'],
  ['titan_boots', 'Titan Boots', 'feet', 'plate', 45, 'masterwork', 'boots: thick armoured boots'],
];
const ARMOUR_PRIMARY = { cloth: null, leather: 'agi', mail: 'str', plate: 'str' };
const ARMOUR_GRID = { head: [2, 2], chest: [2, 3], hands: [2, 2], feet: [2, 2] };
function armourRow([id, name, slot, prof, L, tier, look]) {
  const armour = r(fullSetArmour(L) * PROF_MULT[prof] * SLOT_SHARE[slot]);
  const req = {};
  const p = ARMOUR_PRIMARY[prof];
  if (p) req[p] = r((prof === 'plate' ? 12 : 8) + 2 * L);
  if (prof === 'cloth') req.int = r(5 + 1 * L);
  const row = { id, name, slot, kind: slot, tier, grid: { w: ARMOUR_GRID[slot][0], h: ARMOUR_GRID[slot][1] },
    proficiency: prof, levelReq: L, req, dropLevel: L, armour, look };
  return row;
}

// belts: potion slots are the implicit. [id, name, dropLevel, tier, slots, prof, look]
const BELTS = [
  ['rope_sash', 'Rope Sash', 1, 'plain', 2, 'cloth', 'belt: knotted rope'],
  ['leather_belt', 'Leather Belt', 5, 'plain', 3, 'leather', 'belt: buckled leather belt with loops'],
  ['war_belt', 'War Belt', 12, 'plain', 4, 'mail', 'belt: wide belt with steel plates and pouches'],
  ['champion_girdle', 'Champion Girdle', 26, 'fine', 4, 'mail', 'belt: broad girdle with a lion buckle'],
  ['titan_girdle', 'Titan Girdle', 46, 'masterwork', 5, 'plate', 'belt: heavy plated girdle, gold clasp'],
];
function beltRow([id, name, L, tier, slots, prof, look]) {
  const armour = r(fullSetArmour(L) * PROF_MULT[prof] * SLOT_SHARE.belt);
  return { id, name, slot: 'belt', kind: 'belt', tier, grid: { w: 2, h: 1 }, proficiency: prof, levelReq: L, req: {},
    dropLevel: L, armour, implicit: { stat: 'potionSlots', units: 'flat', value: slots }, look };
}

// shields: block chance (whole percent), block amount flat. [id, name, dropLevel, tier, prof, blockChance, blockMult, grid, look]
const SHIELDS = [
  ['buckler', 'Buckler', 1, 'plain', 'leather', 15, 0.6, [2, 2], 'shield: small round buckler'],
  ['round_shield', 'Round Shield', 3, 'plain', 'mail', 20, 0.8, [2, 2], 'shield: painted round wooden shield'],
  ['kite_shield', 'Kite Shield', 8, 'plain', 'mail', 24, 1.0, [2, 3], 'shield: tall kite shield'],
  ['tower_shield', 'Tower Shield', 15, 'plain', 'plate', 30, 1.25, [2, 3], 'shield: rectangular tower shield'],
  ['heater_shield', 'Heater Shield', 24, 'fine', 'mail', 24, 1.0, [2, 3], 'shield: heater shape, heraldic paint'],
  ['pavise', 'Pavise', 30, 'fine', 'plate', 32, 1.3, [2, 3], 'shield: huge pavise with a prop'],
  ['aegis_shield', 'Aegis Shield', 44, 'masterwork', 'mail', 26, 1.1, [2, 3], 'shield: gold-rimmed with a glowing boss'],
  ['rampart_shield', 'Rampart Shield', 50, 'masterwork', 'plate', 34, 1.35, [2, 3], 'shield: wall-like, iron-studded'],
];
function shieldRow([id, name, L, tier, prof, bc, bm, grid, look]) {
  const armour = r(fullSetArmour(L) * PROF_MULT[prof] * SLOT_SHARE.shield);
  const req = { str: r((prof === 'plate' ? 14 : 8) + 2.2 * L) };
  return { id, name, slot: 'offhand', kind: 'shield', class: 'shield', tier, grid: { w: grid[0], h: grid[1] }, proficiency: prof,
    levelReq: L, req, dropLevel: L, armour, block: { chance: bc, amount: r((6 + 2.2 * L) * bm) }, look };
}

// foci (caster off-hands): implicit spell power + a small flavour implicit. [id,name,dropLevel,tier,implicit2,look]
const FOCI = [
  ['charm_bundle', 'Charm Bundle', 1, 'plain', { stat: 'manaRegen', units: 'flat', value: 1 }, 'focus: bundle of charms on a cord'],
  ['bound_tome', 'Bound Tome', 4, 'plain', { stat: 'mana', units: 'flat', value: 10 }, 'focus: small leather book'],
  ['glass_orb', 'Glass Orb', 9, 'plain', { stat: 'castSpeed', units: 'pct', value: 4 }, 'focus: glass sphere in a claw mount'],
  ['saint_idol', 'Saint Idol', 14, 'plain', { stat: 'healingPower', units: 'pct', value: 6 }, 'focus: small carved saint'],
  ['star_glass', 'Star Glass', 25, 'fine', { stat: 'castSpeed', units: 'pct', value: 6 }, 'focus: lens with a star etched in it'],
  ['reliquary', 'Reliquary', 30, 'fine', { stat: 'healingPower', units: 'pct', value: 9 }, 'focus: gold box with a window'],
  ['void_lens', 'Void Lens', 44, 'masterwork', { stat: 'castSpeed', units: 'pct', value: 8 }, 'focus: black disc with a white rim'],
  ['seraph_idol', 'Seraph Idol', 50, 'masterwork', { stat: 'healingPower', units: 'pct', value: 12 }, 'focus: winged figure, warm glow'],
];
function focusRow([id, name, L, tier, imp2, look]) {
  return { id, name, slot: 'offhand', kind: 'focus', class: 'focus', tier, grid: { w: 1, h: 2 }, proficiency: 'focus',
    levelReq: L, req: { int: r(8 + 2 * L) }, dropLevel: L,
    implicit: { stat: 'spellPower', units: 'flat', value: r(SPELL_POWER(L) * 0.7) }, implicit2: imp2, look };
}
const QUIVERS = [
  ['hip_quiver', 'Hip Quiver', 1, 'plain', 5, 'quiver: small leather quiver at the hip'],
  ['back_quiver', 'Back Quiver', 10, 'plain', 8, 'quiver: tall quiver on the back'],
  ['horn_quiver', 'Horn Quiver', 26, 'fine', 10, 'quiver: horn-tipped quiver'],
  ['storm_quiver', 'Storm Quiver', 46, 'masterwork', 12, 'quiver: bone quiver, blue-fletched arrows'],
];
function quiverRow([id, name, L, tier, asp, look]) {
  return { id, name, slot: 'offhand', kind: 'quiver', class: 'quiver', tier, grid: { w: 1, h: 3 }, proficiency: 'quiver',
    levelReq: L, req: { agi: r(8 + 2 * L) }, dropLevel: L, pairsWith: ['bow', 'crossbow'],
    implicit: { stat: 'attackSpeed', units: 'pct', value: asp }, look };
}
const JEWELLERY = [
  ['copper_ring', 'Copper Ring', 'ring', 1, 'plain', 'ring: plain copper band'],
  ['silver_ring', 'Silver Ring', 'ring', 8, 'plain', 'ring: silver band with a small stone'],
  ['gold_signet', 'Gold Signet', 'ring', 16, 'plain', 'ring: gold signet'],
  ['opal_ring', 'Opal Ring', 'ring', 28, 'fine', 'ring: opal in a twisted setting'],
  ['star_ring', 'Star Ring', 'ring', 48, 'masterwork', 'ring: a ring with a tiny orbiting light'],
  ['bead_necklace', 'Bead Necklace', 'neck', 1, 'plain', 'amulet: wooden beads'],
  ['silver_amulet', 'Silver Amulet', 'neck', 8, 'plain', 'amulet: silver disc on a chain'],
  ['jade_pendant', 'Jade Pendant', 'neck', 16, 'plain', 'amulet: jade teardrop'],
  ['sun_amulet', 'Sun Amulet', 'neck', 28, 'fine', 'amulet: gold sunburst'],
  ['eclipse_amulet', 'Eclipse Amulet', 'neck', 48, 'masterwork', 'amulet: black disc ringed with light'],
];
function jewelRow([id, name, slot, L, tier, look]) {
  return { id, name, slot, kind: slot, tier, grid: { w: 1, h: 1 }, proficiency: 'any', levelReq: L, req: {}, dropLevel: L, look };
}

const bases = [
  ...WEAPONS.map(weaponRow), ...ARMOUR.map(armourRow), ...BELTS.map(beltRow), ...SHIELDS.map(shieldRow),
  ...FOCI.map(focusRow), ...QUIVERS.map(quiverRow), ...JEWELLERY.map(jewelRow),
];
{
  const seen = new Set();
  for (const b of bases) { if (seen.has(b.id)) throw new Error('dup base ' + b.id); seen.add(b.id); }
}
const act1 = bases.filter(b => b.dropLevel <= 20).length;

const itemBases = {
  _doc: [
    'Rogueloot item bases. Every row is hand-specified (kind, drop level, grid, reqs, look); the damage and armour NUMBERS come from the two ladders below so the whole game scales from one place.',
    'Weapon dps ladder: refDps(L) = 4 + 1.5*L + 0.02*L*L for a ONE-HANDED weapon at drop level L; a kind multiplies it (`kinds[kind].dps`: two-handers 1.35, bows 1.2, wands 0.6 + spell power). damage.min/max = refDps*dpsMult/speed * [0.75, 1.25]. speed = attacks per second. Monster health should be tuned so a same-level normal monster dies to ~6-10 weapon hits.',
    'Armour ladder: damage reduction = armour / (armour + K) with K = 10*attackerLevel + 50 (that is ruling 41, armour diminishing against attacker level). A full plate set at level L sums to 1.5*K(L) = 60% reduction against a same-level attacker; cloth 0.45x, leather 0.6x, mail 0.8x of plate. Slot shares: chest 35%, head 20%, feet 15%, hands 12%, belt 8%, shield 10%. The percentages a tooltip prints must be computed against the PLAYER level (what you would feel against a same-level monster).',
    'Block: chance is whole PERCENT (24 = 24%), amount is FLAT damage removed from a blocked hit.',
    'Tiers: plain (drops 1-20, Act 1 Normal), fine (21-40, Act 2 / Veteran), masterwork (41-60, Act 3 / Legend). Tiers are the D2 normal/exceptional/elite ladder: same shapes, bigger numbers.',
    'levelReq: the character level needed = max(base.levelReq, ceil(0.8 * ilvlMin of the item\'s highest affix tier)) — see affixes.json. req: minimum ATTRIBUTES (str/agi/int/spi). proficiency: the armour weight or weapon class the character\'s Path must allow (`proficiency` table below). dropLevel: the lowest ITEM LEVEL at which this base can be rolled (rarity.json `basePick` says how a base is chosen).',
    'Units: every `pct` value is whole percentage points (4 = +4%). Code converts with /100 in ONE place. Never store fractions.',
    'grid: w x h cells in the 10x4 bag (ruling 11). hands: 2 = takes the off-hand slot too. offhandOk: may be held in the off hand by a dual-wielding Path (Rogue). pairsWith: a quiver only works with a bow or crossbow in the main hand.',
    'look: a hint for the Chibi 2.6 model (avatar-3d gear-catalog kinds first: dagger/sword/axe/mace/bow/crossbow/staff/wand, hood/cap/helm, robe/jerkin/hauberk/cuirass, gloves, shoes/boots, shield/focus/quiver, belt, ring/amulet).',
    `Counts: ${bases.length} bases, ${act1} droppable in Act 1 (dropLevel <= 20).`,
  ].join(' '),
  ladders: {
    weaponDps: '4 + 1.5*L + 0.02*L*L',
    armourK: '10*attackerLevel + 50',
    fullSetArmour: '1.5 * armourK(L) * profMult * slotShare',
    profMult: PROF_MULT, slotShare: SLOT_SHARE,
    spellPowerImplicit: 'wand/sceptre 2 + 1.2*L; staff x1.6; focus x0.7',
    attributeReq: 'characters start at 12 in each attribute (+5 a level). weapons: primary attribute 8 + 2.5*L; leather agi 8 + 2L; mail str 8 + 2L; plate str 12 + 2L; cloth int 5 + L',
  },
  kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { class: v.class, hands: v.hands, speed: v.speed, dpsMult: v.dps,
    grid: { w: v.grid[0], h: v.grid[1] }, ranged: !!v.ranged, offhandOk: !!v.offhandOk, caster: !!v.caster, primary: v.primary }])),
  proficiency: {
    _doc: 'Which armour weights and weapon classes each Path (and the two first hybrid specs) may use. Wanderer is level 1-2. A spec ADDS to its Path (plate at the spec pick, ruling 2). Mage stays cloth so cloth never becomes pointless; the Spellblade hybrid gets leather at 10. Healer hybrids (Paladin) get mail then plate at 10.',
    wanderer: { armour: ['cloth', 'leather'], weapons: ['dagger', 'sword', 'mace', 'bow', 'wand', 'staff'], offhand: ['shield', 'focus', 'quiver'], dualWield: false },
    fighter: { armour: ['cloth', 'leather', 'mail'], weapons: ['dagger', 'sword', 'axe', 'mace', 'polearm', 'crossbow'], offhand: ['shield', 'quiver'], dualWield: false },
    rogue: { armour: ['cloth', 'leather'], weapons: ['dagger', 'sword', 'axe', 'bow', 'crossbow', 'polearm'], offhand: ['quiver', 'shield'], dualWield: true, dualWieldClasses: ['dagger', 'sword', 'axe'] },
    mage: { armour: ['cloth'], weapons: ['wand', 'staff', 'dagger'], offhand: ['focus'], dualWield: false },
    healer: { armour: ['cloth', 'leather'], weapons: ['mace', 'staff', 'wand', 'sword'], offhand: ['shield', 'focus'], dualWield: false },
    specAdds: {
      _doc: 'Spec picks at level 10 add these. Fighter specs are the only way to plate besides the Paladin hybrid.',
      fighter_any: { armour: ['plate'] },
      paladin: { armour: ['mail', 'plate'], weapons: ['mace', 'sword', 'axe', 'polearm'] },
      spellblade: { armour: ['leather'], weapons: ['sword', 'dagger'], dualWield: false },
    },
  },
  slots: ['head', 'chest', 'hands', 'belt', 'feet', 'neck', 'ring1', 'ring2', 'weapon', 'offhand', 'weapon2', 'offhand2'],
  bases,
};
write('item-bases.json', itemBases);

// ---------- affixes ----------
// Tier ladder: tier numbers go UP with power (T1 weakest). ilvlMin per tier. weight = base pick weight.
const TIER_ILVL = [1, 8, 15, 23, 32, 42, 52, 62];
const TIER_W = [100, 80, 62, 48, 36, 26, 17, 10];
const tiers = (ranges) => ranges.map(([min, max], i) => ({ tier: i + 1, ilvlMin: TIER_ILVL[i], min, max, weight: TIER_W[i] }));
const W_ALL = ['dagger', 'sword', 'axe', 'mace', 'sceptre', 'greatsword', 'greataxe', 'maul', 'spear', 'polearm', 'bow', 'crossbow', 'staff', 'wand'];
const W_PHYS = ['dagger', 'sword', 'axe', 'mace', 'greatsword', 'greataxe', 'maul', 'spear', 'polearm', 'bow', 'crossbow'];
const W_CAST = ['wand', 'staff', 'sceptre', 'focus'];
const ARM = ['head', 'chest', 'hands', 'feet', 'belt', 'shield'];
const JEW = ['ring', 'neck'];
const A = (id, name, stat, units, kinds, group, ranges, extra = {}) => ({ id, name, stat, units, kinds, group, tiers: tiers(ranges), ...extra });

// flat added damage on weapons scales with the weapon: these ranges are PER HIT, added to both min and max before the % multiplier.
const prefixes = [
  A('honed', 'Honed', 'physDamageFlat', 'flat', W_PHYS, 'physFlat', [[1, 2], [2, 4], [3, 7], [5, 11], [8, 16], [12, 24], [18, 34], [26, 48]], { desc: '+X physical damage per hit (added to min and max). The two-handed bonus: a 2h weapon multiplies this by 1.5 (code: kinds[kind].hands === 2).' }),
  A('brutal', 'Brutal', 'physDamagePct', 'pct', W_PHYS, 'physPct', [[8, 15], [16, 25], [26, 38], [39, 52], [53, 68], [69, 85], [86, 105], [106, 130]], { desc: '+X% physical weapon damage (applied after flat added damage).' }),
  A('searing', 'Searing', 'fireDamageFlat', 'flat', W_ALL, 'elemFlat', [[1, 3], [2, 6], [4, 10], [6, 15], [9, 22], [13, 31], [19, 43], [27, 60]], { desc: '+X fire damage per hit. One elemental flat affix per weapon (group elemFlat).' }),
  A('rimed', 'Rimed', 'frostDamageFlat', 'flat', W_ALL, 'elemFlat', [[1, 3], [2, 6], [4, 10], [6, 15], [9, 22], [13, 31], [19, 43], [27, 60]], { desc: '+X frost damage per hit; frost hits slow 15% for 2 s.' }),
  A('crackling', 'Crackling', 'stormDamageFlat', 'flat', W_ALL, 'elemFlat', [[1, 5], [1, 9], [2, 15], [3, 23], [5, 33], [7, 46], [10, 64], [14, 90]], { desc: '+X storm damage per hit (wide range, low floor: storm is swingy).' }),
  A('venomed', 'Venomed', 'poisonDamageOverTime', 'flat', W_ALL, 'elemFlat', [[3, 6], [6, 12], [10, 20], [16, 30], [24, 44], [34, 62], [48, 86], [66, 120]], { desc: '+X poison damage over 4 seconds per hit (total, dealt in 1 s ticks, stacks refresh).' }),
  A('duskbitten', 'Duskbitten', 'shadowDamageFlat', 'flat', W_ALL, 'elemFlat', [[1, 3], [2, 6], [4, 10], [6, 15], [9, 22], [13, 31], [19, 43], [27, 60]], { desc: '+X shadow damage per hit.' }),
  A('vicious', 'Vicious', 'attackPower', 'flat', [...W_PHYS, 'ring', 'neck', 'hands', 'belt'], 'attackPower', [[2, 4], [5, 9], [10, 16], [17, 25], [26, 38], [39, 54], [55, 75], [76, 100]], { desc: '+X attack power (14 attack power = +1 weapon damage per hit; the sheet does that once).' }),
  A('attuned', 'Attuned', 'spellPower', 'flat', [...W_CAST, 'ring', 'neck', 'head', 'hands'], 'spellPower', [[2, 4], [5, 9], [10, 16], [17, 25], [26, 38], [39, 54], [55, 75], [76, 100]], { desc: '+X spell power (added to the spell\'s base damage/heal before % modifiers).' }),
  A('blazing', 'Blazing', 'fireDamagePct', 'pct', [...W_CAST, 'neck', 'ring'], 'elemPct', [[5, 9], [10, 14], [15, 20], [21, 27], [28, 35], [36, 44], [45, 54], [55, 65]], { desc: '+X% fire damage (spells and weapon fire). One elemental % affix per item (group elemPct).' }),
  A('glacial', 'Glacial', 'frostDamagePct', 'pct', [...W_CAST, 'neck', 'ring'], 'elemPct', [[5, 9], [10, 14], [15, 20], [21, 27], [28, 35], [36, 44], [45, 54], [55, 65]], { desc: '+X% frost damage.' }),
  A('thundering', 'Thundering', 'stormDamagePct', 'pct', [...W_CAST, 'neck', 'ring'], 'elemPct', [[5, 9], [10, 14], [15, 20], [21, 27], [28, 35], [36, 44], [45, 54], [55, 65]], { desc: '+X% storm damage.' }),
  A('festering', 'Festering', 'poisonDamagePct', 'pct', [...W_CAST, 'neck', 'ring'], 'elemPct', [[5, 9], [10, 14], [15, 20], [21, 27], [28, 35], [36, 44], [45, 54], [55, 65]], { desc: '+X% poison damage.' }),
  A('gloaming', 'Gloaming', 'shadowDamagePct', 'pct', [...W_CAST, 'neck', 'ring'], 'elemPct', [[5, 9], [10, 14], [15, 20], [21, 27], [28, 35], [36, 44], [45, 54], [55, 65]], { desc: '+X% shadow damage.' }),
  A('mending', 'Mending', 'healingPower', 'pct', [...W_CAST, 'neck', 'ring', 'chest'], 'healingPct', [[4, 7], [8, 11], [12, 16], [17, 22], [23, 28], [29, 35], [36, 42], [43, 50]], { desc: '+X% healing done.' }),
  A('keen', 'Keen', 'critChance', 'pct', [...W_ALL, 'ring', 'neck', 'hands', 'quiver'], 'critChance', [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 10]], { desc: '+X% critical strike chance (additive to the sheet; base crit 5%, soft cap 50%).' }),
  A('quick', 'Quick', 'attackSpeed', 'pct', [...W_PHYS, 'hands', 'quiver', 'ring'], 'attackSpeed', [[3, 5], [6, 8], [9, 11], [12, 14], [15, 17], [18, 20], [21, 24], [25, 28]], { desc: '+X% attack speed (multiplies attacks per second; cap +60% total).' }),
  A('fluent', 'Fluent', 'castSpeed', 'pct', [...W_CAST, 'hands', 'neck', 'ring'], 'castSpeed', [[3, 5], [6, 8], [9, 11], [12, 14], [15, 17], [18, 20], [21, 24], [25, 28]], { desc: '+X% cast speed (shortens cast bars; does not shorten the 1.5 s global cooldown below 1.0 s).' }),
  A('sturdy', 'Sturdy', 'armourFlat', 'flat', ARM, 'armourFlat', [[3, 6], [7, 14], [15, 26], [27, 44], [45, 70], [71, 105], [106, 150], [151, 210]], { desc: '+X armour (flat, added before armourPct).' }),
  A('reinforced', 'Reinforced', 'armourPct', 'pct', ARM, 'armourPct', [[10, 18], [19, 28], [29, 40], [41, 54], [55, 70], [71, 88], [89, 108], [109, 130]], { desc: '+X% armour of this item (the base armour plus its flat affix).' }),
  A('stout', 'Stout', 'health', 'flat', [...ARM, 'neck', 'ring'], 'health', [[5, 10], [11, 20], [21, 34], [35, 52], [53, 76], [77, 108], [109, 150], [151, 200]], { desc: '+X maximum health. (Level-1 health is ~100; +10 is a tenth of a life.)' }),
  A('clear', 'Clear', 'mana', 'flat', [...ARM, 'neck', 'ring', ...W_CAST], 'mana', [[5, 10], [11, 20], [21, 34], [35, 52], [53, 76], [77, 108], [109, 150], [151, 200]], { desc: '+X maximum mana (Mage/Healer resource). On a rage/energy character this affix is still legal but useless — the rarity roller skips it when the dropper is a personal-loot roll for a non-mana player (rarity.json `smartLoot`).' }),
  A('bracing', 'Bracing', 'blockChance', 'pct', ['shield'], 'blockChance', [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18]], { desc: '+X% block chance (additive with the shield\'s own; cap 75%).' }),
  A('bulwark', 'Bulwark', 'blockAmount', 'pct', ['shield'], 'blockAmount', [[10, 18], [19, 28], [29, 40], [41, 54], [55, 70], [71, 88], [89, 108], [109, 130]], { desc: '+X% block amount of this shield.' }),
];
const suffixes = [
  A('of_strength', 'of Strength', 'str', 'flat', [...ARM, ...JEW, ...W_ALL], 'attrStr', [[1, 2], [3, 4], [5, 7], [8, 10], [11, 14], [15, 18], [19, 23], [24, 30]], { desc: '+X Strength (each point: +1 attack power with str weapons, +0.5 armour).' }),
  A('of_agility', 'of Agility', 'agi', 'flat', [...ARM, ...JEW, ...W_ALL], 'attrAgi', [[1, 2], [3, 4], [5, 7], [8, 10], [11, 14], [15, 18], [19, 23], [24, 30]], { desc: '+X Agility (+1 attack power with agi weapons, +0.05% dodge, +0.04% crit).' }),
  A('of_intellect', 'of Intellect', 'int', 'flat', [...ARM, ...JEW, ...W_ALL], 'attrInt', [[1, 2], [3, 4], [5, 7], [8, 10], [11, 14], [15, 18], [19, 23], [24, 30]], { desc: '+X Intellect (+1 spell power, +5 mana).' }),
  A('of_vitality', 'of Vitality', 'vit', 'flat', [...ARM, ...JEW, ...W_ALL], 'attrVit', [[1, 2], [3, 4], [5, 7], [8, 10], [11, 14], [15, 18], [19, 23], [24, 30]], { desc: '+X Vitality (+8 health each).' }),
  A('of_spirit', 'of Spirit', 'spi', 'flat', [...ARM, ...JEW, ...W_ALL], 'attrSpi', [[1, 2], [3, 4], [5, 7], [8, 10], [11, 14], [15, 18], [19, 23], [24, 30]], { desc: '+X Spirit (+0.5 healing power, +0.3 mana regen per 5 s, +0.1 health regen per 5 s).' }),
  A('of_cinders', 'of Cinders', 'fireResist', 'pct', [...ARM, ...JEW], 'resFire', [[4, 7], [8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 31], [32, 36]], { desc: '+X% fire resistance (cap 75%, ruling 41).' }),
  A('of_rime', 'of Rime', 'frostResist', 'pct', [...ARM, ...JEW], 'resFrost', [[4, 7], [8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 31], [32, 36]], { desc: '+X% frost resistance.' }),
  A('of_the_gale', 'of the Gale', 'stormResist', 'pct', [...ARM, ...JEW], 'resStorm', [[4, 7], [8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 31], [32, 36]], { desc: '+X% storm resistance.' }),
  A('of_the_adder', 'of the Adder', 'poisonResist', 'pct', [...ARM, ...JEW], 'resPoison', [[4, 7], [8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 31], [32, 36]], { desc: '+X% poison resistance.' }),
  A('of_lanterns', 'of Lanterns', 'shadowResist', 'pct', [...ARM, ...JEW], 'resShadow', [[4, 7], [8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 31], [32, 36]], { desc: '+X% shadow resistance.' }),
  A('of_warding', 'of Warding', 'allResist', 'pct', [...ARM, ...JEW], 'resAll', [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15], [16, 18]], { desc: '+X% to all five resistances (its own group, so it stacks with one single resist of each element).' }),
  A('of_the_oak', 'of the Oak', 'healthRegen', 'flat', [...ARM, ...JEW], 'healthRegen', [[1, 2], [3, 4], [5, 7], [8, 11], [12, 16], [17, 22], [23, 30], [31, 40]], { desc: '+X health per 5 seconds (always on; natural regen is slow per ruling 23 so this is a real stat).' }),
  A('of_the_spring', 'of the Spring', 'manaRegen', 'flat', [...ARM, ...JEW, ...W_CAST], 'manaRegen', [[1, 2], [3, 4], [5, 7], [8, 11], [12, 16], [17, 22], [23, 30], [31, 40]], { desc: '+X mana per 5 seconds.' }),
  A('of_the_leech', 'of the Leech', 'lifeOnHit', 'flat', [...W_PHYS, 'ring', 'hands'], 'lifeOnHit', [[1, 2], [2, 3], [3, 5], [5, 8], [8, 12], [12, 17], [17, 24], [24, 32]], { desc: '+X health per weapon hit (melee and ranged auto-attacks and weapon skills, not spells).' }),
  A('of_the_well', 'of the Well', 'manaOnKill', 'flat', [...W_CAST, 'ring', 'neck'], 'manaOnKill', [[2, 3], [4, 6], [7, 10], [11, 15], [16, 22], [23, 30], [31, 40], [41, 52]], { desc: '+X mana when you kill an enemy.' }),
  A('of_the_fox', 'of the Fox', 'dodge', 'pct', ['feet', 'hands', 'head', 'chest', 'ring'], 'dodge', [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 10]], { desc: '+X% dodge (cloth and leather only: the roller skips it on mail/plate; cap 40%).', proficiency: ['cloth', 'leather', 'any'] }),
  A('of_the_hare', 'of the Hare', 'moveSpeed', 'pct', ['feet'], 'moveSpeed', [[4, 6], [7, 9], [10, 12], [13, 15], [16, 18], [19, 21], [22, 24], [25, 28]], { desc: '+X% movement speed (feet only; cap +40%).' }),
  A('of_precision', 'of Precision', 'hitChance', 'pct', [...W_ALL, 'ring', 'neck', 'hands', 'quiver'], 'hitChance', [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 10]], { desc: '+X% chance to hit (counters the level-gap miss chance of ruling 41).' }),
  A('of_ruin', 'of Ruin', 'critDamage', 'pct', [...W_ALL, 'ring', 'neck', 'hands'], 'critDamage', [[5, 8], [9, 13], [14, 19], [20, 26], [27, 34], [35, 43], [44, 54], [55, 70]], { desc: '+X% critical strike damage (base crit = 150%).' }),
  A('of_the_purse', 'of the Purse', 'goldFind', 'pct', [...ARM, ...JEW], 'goldFind', [[5, 10], [11, 18], [19, 26], [27, 35], [36, 45], [46, 56], [57, 68], [69, 80]], { desc: '+X% gold dropped (your own drops only).' }),
  A('of_fortune', 'of Fortune', 'magicFind', 'pct', [...ARM, ...JEW], 'magicFind', [[3, 5], [6, 9], [10, 13], [14, 18], [19, 23], [24, 29], [30, 35], [36, 42]], { desc: '+X% better rarity (see rarity.json `magicFind`: diminishing, never changes drop COUNT).' }),
  A('of_thorns', 'of Thorns', 'thorns', 'flat', ['chest', 'shield', 'head'], 'thorns', [[2, 4], [5, 8], [9, 14], [15, 22], [23, 32], [33, 46], [47, 64], [65, 90]], { desc: 'Melee attackers take X physical damage per hit on you.' }),
  A('of_ease', 'of Ease', 'reqReduce', 'pct', [...W_ALL, ...ARM, 'shield'], 'reqReduce', [[5, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40], [41, 45]], { desc: '-X% attribute requirements of this item (not the level requirement).' }),
  A('of_haste', 'of Haste', 'cooldownReduction', 'pct', [...JEW, 'head', 'hands'], 'cdr', [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15], [16, 18]], { desc: '-X% skill cooldowns (not the global cooldown; cap 40%). Starts at ilvl 8: no tier 1.', minTier: 2 }),
  A('of_draughts', 'of Draughts', 'potionPower', 'pct', ['belt'], 'potionPower', [[8, 12], [13, 18], [19, 25], [26, 32], [33, 40], [41, 48], [49, 56], [57, 65]], { desc: '+X% potion healing / mana restored (belt only).' }),
  A('of_menace', 'of Menace', 'threat', 'pct', ['shield', 'chest', 'head'], 'threat', [[8, 12], [13, 18], [19, 25], [26, 32], [33, 40], [41, 48], [49, 56], [57, 65]], { desc: '+X% threat generated (tanks). Mail/plate/shield only.', proficiency: ['mail', 'plate'] }),
  A('of_quiet', 'of Quiet', 'threat', 'pct', ['chest', 'head', 'feet', 'hands'], 'threat', [[-8, -5], [-13, -9], [-19, -14], [-25, -20], [-32, -26], [-40, -33], [-48, -41], [-56, -49]], { desc: '-X% threat generated. Cloth/leather only (same group as of Menace).', proficiency: ['cloth', 'leather'] }),
  A('of_staggering', 'of Staggering', 'staggerChance', 'pct', ['mace', 'maul', 'axe', 'greataxe', 'hands'], 'stagger', [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18]], { desc: 'X% chance per weapon hit to stagger (0.6 s stun; bosses: 0.3 s and only every 8 s).' }),
  A('of_the_watch', 'of the Watch', 'lightRadius', 'flat', ['head', 'neck', 'ring'], 'light', [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 5]], { desc: '+X metres of light radius in dark dungeons (a comfort stat; cheap, common).' }),
];
// drop tiers below minTier (cdr starts at tier 2)
for (const a of [...prefixes, ...suffixes]) if (a.minTier) { a.tiers = a.tiers.filter(t => t.tier >= a.minTier); delete a.minTier; }
{
  const ids = new Set();
  for (const a of [...prefixes, ...suffixes]) { if (ids.has(a.id)) throw new Error('dup affix ' + a.id); ids.add(a.id); }
}

const affixes = {
  _doc: [
    'Rogueloot affixes. prefixes = power (damage, armour, health, speed); suffixes = utility (attributes, resists, regen, finds). An item holds at most 3 prefixes and 3 suffixes, and only ONE affix per `group` (so an item cannot roll two different flat elemental damages, but can roll +fire% AND +fire flat since those are different groups).',
    'UNITS: `units: "flat"` is a plain number added to the stat. `units: "pct"` is WHOLE PERCENTAGE POINTS: 12 means +12%. There are NO fractions anywhere in this file. The sheet converts once, in one function (pct -> x/100). Past games shipped two readers disagreeing on 0.02 vs 2 — do not add a third.',
    'TIERS count UP with power: tier 1 is the weakest and is open from item level 1; `ilvlMin` says the lowest ITEM LEVEL (not character level) that can roll that tier. The ladder is ' + JSON.stringify(TIER_ILVL) + ' which puts tiers 1-3 in Act 1 Normal (ilvl <= 22), 4-5 in Veteran / Act 2, 6-7 in Legend / Act 3, and tier 8 only at the very top (ilvl 62+, boss drops in Legend at area level 60). `min`/`max` is the roll range inside the tier.',
    'TIER PICK: eligible tiers are those with ilvlMin <= ilvl. Each eligible tier\'s pick weight = `weight` * fade, where fade = 1 when (ilvl - ilvlMin) <= 10, else max(0.2, 1 - (ilvl - ilvlMin - 10) / 30). Base weights fall with the tier (' + JSON.stringify(TIER_W) + ') so the newest tier is never the most likely one, but old tiers fade so an ilvl-40 item is not full of tier-1 rolls. Worked example at ilvl 20: tier 1 (gap 19) 100*0.7 = 70, tier 2 (gap 12) 80*0.93 = 74.7, tier 3 (gap 5) 62*1 = 62 -> 34% / 36% / 30%.',
    'AFFIX PICK: among affixes whose `kinds` include the item\'s kind (weapons use their kind id, armour uses the slot, shield/focus/quiver use that word, rings "ring", amulets "neck") and whose `proficiency` list (if any) includes the base\'s proficiency, excluding groups already on the item, pick uniformly by affix (then a tier by the rule above). Prefix or suffix is chosen first: an item with room on both sides picks prefix 50/50.',
    'COUNT per rarity (rarity.json `affixCount` holds the same numbers): magic 1-2 (one prefix and/or one suffix, 60% one, 40% two), rare 3-6 where the share of 5s and 6s grows with ilvl, legendary = 3-5 affixes rolled like a rare PLUS one legendary power (legendaries.json), unique = fixed (uniques.json).',
    'LEVEL REQUIREMENT of a finished item: max(base.levelReq, ceil(0.8 * highest ilvlMin among its affix tiers)). A tier-3 roll (ilvlMin 15) on a level-1 ring makes it a level-12 ring.',
    'DAMAGE ORDER on a weapon hit: (base min..max + physDamageFlat [x1.5 on two-handers] + attackPower/14) * (1 + physDamagePct/100) -> plus each elemental flat * (1 + thatElementPct/100) -> crit -> target armour / resist.',
    'SMART ROLL (personal loot only): when the roll is for a specific player, affixes useless to their Path are given weight 0.25 instead of being removed (mana on a Fighter, attack speed on a Mage): drops stay surprising, mostly useful.',
  ].join(' '),
  tierLadder: { ilvlMin: TIER_ILVL, weight: TIER_W, fade: 'gap = ilvl - ilvlMin; gap <= 10 ? 1 : max(0.2, 1 - (gap - 10) / 30)' },
  maxPerItem: { prefixes: 3, suffixes: 3 },
  affixCount: {
    magic: { one: 60, two: 40 },
    rare: { _doc: 'weights for 3/4/5/6 affixes by ilvl band (whole percent)', bands: [{ ilvlMin: 1, w: [60, 30, 9, 1] }, { ilvlMin: 10, w: [40, 35, 18, 7] }, { ilvlMin: 30, w: [30, 33, 24, 13] }, { ilvlMin: 50, w: [22, 32, 28, 18] }] },
    legendary: { _doc: 'affixes rolled like a rare, then capped at 5 (the power takes a slot), plus one power', bands: [{ ilvlMin: 1, w: [60, 30, 10, 0] }, { ilvlMin: 30, w: [40, 35, 25, 0] }] },
  },
  smartRoll: { uselessWeight: 0.25 },
  prefixes, suffixes,
};
write('affixes.json', affixes);

// ---------- rarity ----------
const rarity = {
  _doc: [
    'Drop rules. Everything here is read by js/rules/loot.js (pure, seeded). All chances are WHOLE PERCENT unless the key says `weight`.',
    'ITEM LEVEL: ilvl = area level of the dropper + rank bonus (`ilvlBonus`), capped at `ilvlCap`. Chests use the area level + their tier bonus. An item\'s base is chosen from bases with dropLevel <= ilvl (see basePick). Item level is NOT the character level: a level-20 player farming a level-8 zone gets ilvl-8 items, and ilvl drives the affix tiers (affixes.json) and the salvage grade (currency.json).',
    'DROP FLOW per kill, per player (personal loot, ruling 5): 1) roll `itemDrops` for how many equipment items (normal monsters mostly drop nothing), 2) for each item roll a rarity from the `rarityByLevel` weights interpolated at the area level, multiplied by the monster kind\'s `rarityMult` and the player\'s magic find, 3) roll gold (`gold`), potions and currency (currency.json) separately — they never compete with items.',
    'STINGY ON PURPOSE: a normal monster drops an item 16-24% of the time in Act 1; most of them are white. Rares are ~0.5% of items at level 1 and ~3.4% at level 20; champions, rare monsters, bosses and locked chests multiply that. The `expected` table below is COMPUTED from these weights (scratch sim over 150 kills, 6 champions, 2 rare monsters, 0.5 bosses, 3 chests per solo hour): rares per hour 0.9 at level 1, 1.8 at 10, 3.4 at 20; uniques one per ~7 h at level 1, ~2.4 h at 10, ~1.2 h at 20; legendaries one per ~24 h at level 1, ~6 h at 10, ~2.7 h at 20, about one an hour in Legend. Over an 8-12 hour Act 1 at ~30 min a level that is roughly 18-22 rares, 4 uniques and 2 legendaries: enough that every clear has a story, few enough that each one matters. tools/sim must keep its report inside +-30% of `expected`.',
    'MAGIC FIND: `magicFind` percent from gear is turned into a multiplier on the rare/unique/legendary WEIGHTS: mult = 1 + (mf / 100) / (1 + mf / 250). 50% mf -> x1.42, 100% -> x1.71, 200% -> x2.11. Never changes how many items drop.',
    'EXTRA PLAYERS: each player rolls their own loot, so a full party already sees four times the items. On top of that each extra player in the area adds `perExtraPlayer.itemChancePct` to everyone\'s item drop chance and `goldPct` to gold, because monsters are tougher (ruling 5).',
    'GEAR SCORE (ruling 38): the weighted average of (ilvl + rarityBonus) over the equipped slots, empty slots counting as 0. A two-hander fills both weapon weights. Shown as a whole number; the sim reports it against the zone level, and a zone\'s `recommendedGearScore` is its level - 2.',
    'GOLD: amount = (base + perLevel * L) * [0.6, 1.4] * (1 + goldFind/100), dropped with `chancePct`. Item sell value = kindValue * (1 + ilvl * 0.35) * rarityMult; vendors buy at sellPct and sell at 100%.',
  ].join(' '),
  ilvlCap: 65,
  ilvlBonus: { normal: 0, champion: 1, rare: 2, boss: 3, actBoss: 4 },
  itemDrops: {
    _doc: 'How many equipment items a kill gives one player. `chancePct` interpolates by area level (keyframes), `count` is weights for 1/2/3 items once something drops. Chests are in `chests`.',
    normal: { chancePct: [[1, 16], [10, 20], [20, 24], [40, 27], [60, 30]], count: [93, 6, 1] },
    champion: { chancePct: [[1, 100]], count: [70, 25, 5] },
    rare: { chancePct: [[1, 100]], count: [30, 50, 20], guaranteedMinRarity: 'magic' },
    boss: { chancePct: [[1, 100]], count: [0, 30, 70], extra: 2, guaranteedMinRarity: 'rare', guaranteedRares: 1 },
    actBoss: { chancePct: [[1, 100]], count: [0, 10, 90], extra: 3, guaranteedMinRarity: 'rare', guaranteedRares: 2, firstKillUniqueChancePct: 50 },
  },
  rarityByLevel: {
    _doc: 'weights per equipment item at an area level; linear interpolation between keyframes [level, normal, magic, rare, unique, legendary]',
    keys: [
      [1, 86, 13, 0.55, 0.2, 0.06],
      [5, 80, 18, 0.9, 0.35, 0.12],
      [10, 74, 22, 1.7, 0.55, 0.22],
      [15, 68, 26, 2.5, 0.75, 0.33],
      [20, 62, 30, 3.4, 1.0, 0.45],
      [30, 55, 34, 5.0, 1.4, 0.65],
      [40, 48, 37, 7.0, 1.8, 0.85],
      [50, 42, 39, 9.5, 2.2, 1.05],
      [60, 36, 40, 12, 2.6, 1.3],
    ],
  },
  rarityMult: {
    _doc: 'multiplies the rare/unique/legendary weights (and `minRarity` lifts normals to magic) for the monster kind that dropped it',
    normal: { rare: 1, unique: 1, legendary: 1 },
    champion: { rare: 2, unique: 2, legendary: 2 },
    rare: { rare: 3, unique: 3, legendary: 3, minRarity: 'magic' },
    boss: { rare: 5, unique: 4, legendary: 4, minRarity: 'magic' },
    actBoss: { rare: 6, unique: 6, legendary: 5, minRarity: 'magic' },
    chest: { rare: 1.5, unique: 1.2, legendary: 1.2 },
    lockedChest: { rare: 3, unique: 2.5, legendary: 2.5, minRarity: 'magic' },
  },
  magicFind: { formula: '1 + (mf/100) / (1 + mf/250)', appliesTo: ['rare', 'unique', 'legendary'] },
  basePick: {
    _doc: 'Which base: first a slot group by weight, then a base among that group whose dropLevel <= ilvl and whose proficiency the player can use (personal loot; 20% of the time ignore proficiency so trade bait exists), weighted 1 when dropLevel is within `freshLevels` of ilvl, else `oldWeight`. Two-handers and off-hands count in `weapon`/`offhand`.',
    groups: { weapon: 34, armour: 40, offhand: 12, jewellery: 10, belt: 4 },
    freshLevels: 10, oldWeight: 0.3, ignoreProficiencyPct: 20,
  },
  affixCount: 'see affixes.json affixCount',
  uniques: { _doc: 'When the roll says unique: pick among uniques.json entries whose base dropLevel <= ilvl and levelReq <= ilvl + 2, weighted by their `weight`; none eligible -> downgrade to rare. Legendary: same with legendaries.json powers filtered by slot/kind and ilvlMin, on a base rolled like a rare.' },
  unidentified: { _doc: 'rare, unique and legendary drop unidentified (ruling 40): name shows as "Unidentified <base>"; right-click identifies free; trading an unidentified item is allowed (a gamble for the buyer).', rarities: ['rare', 'unique', 'legendary'] },
  perExtraPlayer: { itemChancePct: 3, goldPct: 15, _doc: 'per extra player present in the same area; with 4 players a normal monster drops something 18+9 = 27% of the time for EACH player' },
  gold: {
    chancePct: [[1, 35], [20, 40], [60, 45]],
    amount: { base: 2, perLevel: 1.2, spread: [0.6, 1.4] },
    rankMult: { normal: 1, champion: 3, rare: 5, boss: 12, actBoss: 25, chest: 4, lockedChest: 10 },
    sellPct: 20,
    kindValue: { weapon: 12, chest: 10, head: 7, hands: 5, feet: 5, belt: 5, shield: 8, focus: 8, quiver: 4, ring: 9, neck: 10 },
    rarityValueMult: { normal: 1, magic: 2.5, rare: 6, unique: 12, legendary: 20 },
    identifyCost: 0,
    _doc: 'A level-10 kill pays 14 gold on average when it pays; a plain ilvl-10 sword sells for 12*(1+3.5)*0.2 = 10.8 gold; a rare one for 65. Vendor gear costs the full value and is normal/magic only (the gambler sells unidentified items for 3x at a flat rarity table: magic 78, rare 20, unique 1.6, legendary 0.4).',
  },
  potions: { _doc: 'potion drops are separate from items: chance per kill (whole percent) and which size by area level', chancePct: [[1, 14], [20, 10]], sizes: [{ id: 'minor', levelMax: 6 }, { id: 'light', levelMax: 12 }, { id: 'full', levelMax: 20 }, { id: 'greater', levelMax: 40 }, { id: 'grand', levelMax: 65 }], healthWeight: 70, manaWeight: 30 },
  chests: {
    _doc: 'tier by what the zone places; `items` = weights for 0/1/2/3 items; ilvl = area level + bonus',
    crate: { items: [92, 8, 0, 0], ilvlBonus: 0, gold: 'chest', mult: 'chest', potionChancePct: 25 },
    chest: { items: [15, 60, 22, 3], ilvlBonus: 0, gold: 'chest', mult: 'chest', potionChancePct: 40 },
    lockedChest: { items: [0, 20, 55, 25], ilvlBonus: 2, gold: 'lockedChest', mult: 'lockedChest', minRarity: 'magic' },
    bossHoard: { items: [0, 0, 40, 60], ilvlBonus: 3, gold: 'boss', mult: 'boss', minRarity: 'magic', guaranteedRares: 1, oncePerSession: true },
  },
  gearScore: {
    formula: 'round( sum(slotWeight * (ilvl + rarityBonus)) / sum(slotWeight) ) over equipped slots; empty slot contributes 0 but keeps its weight',
    slotWeights: { weapon: 2.0, offhand: 1.0, chest: 1.5, head: 1.0, hands: 0.75, feet: 0.75, belt: 0.5, neck: 0.75, ring1: 0.5, ring2: 0.5 },
    twoHander: 'contributes weapon + offhand weights with its own ilvl',
    rarityBonus: { normal: 0, magic: 1, rare: 3, unique: 4, legendary: 5 },
    recommended: 'zone level - 2',
  },
  expected: {
    _doc: 'targets for tools/sim (per solo player-hour at ~150 kills, ~6 champions, ~2 rare monsters, ~3 chests an hour)',
    itemsPerHour: [[1, 44], [10, 50], [20, 57], [40, 62], [60, 67]],
    raresPerHour: [[1, 0.9], [5, 1.2], [10, 1.8], [15, 2.5], [20, 3.4], [30, 4.8], [40, 6.6], [50, 9.0], [60, 11.5]],
    uniquesPerHour: [[1, 0.14], [5, 0.25], [10, 0.41], [15, 0.58], [20, 0.81], [30, 1.16], [40, 1.52], [50, 1.9], [60, 2.3]],
    legendariesPerHour: [[1, 0.04], [5, 0.085], [10, 0.16], [15, 0.26], [20, 0.36], [30, 0.54], [40, 0.72], [50, 0.91], [60, 1.15]],
    tolerancePct: 30,
  },
};
write('rarity.json', rarity);

// ---------- currency ----------
const GRADES = [
  { grade: 1, name: 'Rough', ilvlMin: 1, ilvlMax: 14, rollCap: 14, colour: '#9aa', dropAreaMin: 1 },
  { grade: 2, name: 'Cut', ilvlMin: 15, ilvlMax: 29, rollCap: 29, colour: '#6cf', dropAreaMin: 13 },
  { grade: 3, name: 'Keen', ilvlMin: 30, ilvlMax: 44, rollCap: 44, colour: '#fc6', dropAreaMin: 28 },
  { grade: 4, name: 'Flawless', ilvlMin: 45, ilvlMax: 65, rollCap: 65, colour: '#f6c', dropAreaMin: 43 },
];
// [id, name, does, from area level, weight, vendor (grade-1 price or null), rule object]
const SHARDS = [
  ['glimmer', 'Glimmer Shard', 'Turns a NORMAL item into a MAGIC item with 1-2 affixes.', 1, 100, 60, { target: 'normal', result: 'magic', affixes: 'affixCount.magic' }],
  ['tangle', 'Tangle Shard', 'Rerolls every affix on a MAGIC item (new affixes, new tiers, new values; 1-2 affixes again).', 2, 90, 40, { target: 'magic', result: 'magic', reroll: 'all' }],
  ['bloom', 'Bloom Shard', 'Adds one affix to a MAGIC item that has only one.', 3, 60, 120, { target: 'magic', requires: 'affixCount == 1', add: 1 }],
  ['crown', 'Crown Shard', 'Turns a MAGIC item into a RARE: keeps its affixes and adds one more.', 5, 45, null, { target: 'magic', result: 'rare', add: 1 }],
  ['blank', 'Blank Shard', 'Strips an item back to NORMAL (same base, same item level, quality kept). Never works on a unique or a legendary.', 4, 70, 50, { target: ['magic', 'rare'], result: 'normal' }],
  ['polish', 'Polish Shard', 'Rerolls the NUMBERS of every affix on the item inside their current tiers (the affixes and tiers stay). Works on uniques and legendaries too.', 6, 40, null, { target: ['magic', 'rare', 'unique', 'legendary'], reroll: 'values' }],
  ['churn', 'Churn Shard', 'Rerolls every affix on a RARE item (3-6 new affixes at the roll level). The bread and butter of rare crafting.', 8, 50, null, { target: 'rare', result: 'rare', reroll: 'all' }],
  ['graft', 'Graft Shard', 'Adds one affix to a RARE item with fewer than 6.', 12, 14, null, { target: 'rare', requires: 'affixCount < 6', add: 1 }],
  ['pare', 'Pare Shard', 'Removes ONE random affix from a magic or rare item.', 14, 16, null, { target: ['magic', 'rare'], remove: 1 }],
  ['wager', 'Wager Shard', 'Turns a NORMAL item into a random rarity: magic 70%, rare 25%, unique 4.5%, legendary 0.5% (the unique must exist for that base; otherwise rare).', 7, 30, null, { target: 'normal', result: { magic: 70, rare: 25, unique: 4.5, legendary: 0.5 } }],
  ['whet', 'Whet Shard', 'Raises an item\'s QUALITY by 5% (weapon damage or armour / block amount), to a maximum of 20%. Quality survives every other shard.', 5, 55, 80, { quality: 5, qualityMax: 20 }],
  ['anchor', 'Anchor Shard', 'Locks ONE affix you choose: the next Tangle or Churn used on this item keeps it. The lock is spent by that one reroll. The meta-crafting shard — rare, never sold.', 18, 4, null, { lock: 1, consumedBy: ['tangle', 'churn'] }],
];
const currency = {
  _doc: [
    'Currency shards (ruling 9): each does ONE thing, PoE-style. No gathering. They drop from monsters and chests (`drop`), come back from salvaging gear (`salvage`), and a few are sold (`vendor`).',
    'GRADES are the heart of the gating. Every shard has a grade 1-4 (`grades`), the grade a drop gets is set by the AREA level and the grade salvage gives is set by the ITEM level of what you break. A shard\'s grade caps the roll: when a shard rerolls or adds affixes, the affix tiers are rolled at rollIlvl = min(item.ilvl, grade.rollCap). So a Rough (grade 1) Churn Shard on an ilvl-40 rare rolls as if the item were ilvl 14: tiers 1-2 only. To get tier-5 affixes you need an ilvl-32+ ITEM and a Keen (grade 3) or better shard, and both only exist past area level 28. That is the owner\'s rule in one line: low-level materials only touch low-tier affixes.',
    'NOT SET FOR LIFE: (1) the item\'s own ilvl is a hard ceiling nothing raises — there is no "raise item level" shard on purpose; (2) shard grades are a second ceiling; (3) the affix level requirement (affixes.json) means a low-level character cannot even WEAR a tier-5 roll; (4) crafting at ilvl 12 produces an item a level-20 zone out-drops by itself (see docs/ITEMS.md worked example); (5) converting grades up costs 5:1 plus gold and never skips a grade; (6) salvage of a unique/legendary gives shards, never the item back.',
    'VENDOR: only the cheap shaping shards (Glimmer, Tangle, Bloom, Blank, Whet) are sold, at grade 1 only; grade 2+ must drop or be salvaged. Every price is gold at grade 1; `vendorGradeMult` says what a higher grade would cost if a future act sells it. Buying is capped at `vendorDailyCap` per shard per game day so gold cannot replace drops.',
    'CONVERT (at the crafter): 5 shards of one id and grade -> 1 of the same id one grade up, for `convertGoldPerGrade` gold; 1 -> 3 one grade down, free. 20 Dust of a grade -> 1 Glimmer of that grade.',
    'DUST: `shard_dust` is the small change. Salvage always gives some; 20 dust of a grade make one Glimmer of that grade at the crafter, and that is all it does. It carries a grade like a shard.',
  ].join(' '),
  grades: GRADES,
  shards: SHARDS.map(([id, name, does, fromLevel, weight, vendor, rule]) => ({ id, name, does, fromAreaLevel: fromLevel, dropWeight: weight, vendorPriceGrade1: vendor, rule, grid: { w: 1, h: 1 }, stack: 50 })),
  dust: { id: 'shard_dust', name: 'Shard Dust', grid: { w: 1, h: 1 }, stack: 200, toGlimmer: 20 },
  drop: {
    _doc: 'per kill per player: chance (whole percent, keyframes by area level) that ONE currency item drops; then pick a shard by dropWeight among those with fromAreaLevel <= area level; the grade is the one whose [ilvlMin, ilvlMax] holds the area level (dropAreaMin lets the next grade appear a couple of levels early at `earlyGradePct`). Monster kinds multiply the chance.',
    chancePct: [[1, 5], [10, 7], [20, 9], [40, 11], [60, 13]],
    rankMult: { normal: 1, champion: 3, rare: 5, boss: 10, actBoss: 20, chest: 2, lockedChest: 5 },
    earlyGradePct: 15,
    dustChancePct: 6,
  },
  salvage: {
    _doc: 'Break an item at the crafter (or from the bag, with a confirm). Grade = the grade whose ilvl range holds the ITEM level. Yields are [min, max] counts; `pick` lists which shards can come out and their weights — salvage can never give Anchor. A unique or legendary salvages into its listed shards plus one guaranteed Polish.',
    byRarity: {
      normal: { dust: [1, 3], shards: [0, 0] },
      magic: { dust: [2, 4], shards: [0, 1], pick: { glimmer: 50, tangle: 30, blank: 20 } },
      rare: { dust: [3, 6], shards: [1, 2], pick: { tangle: 20, bloom: 15, crown: 20, churn: 25, polish: 10, pare: 5, whet: 5 } },
      unique: { dust: [5, 10], shards: [2, 3], pick: { churn: 35, polish: 25, graft: 15, wager: 15, pare: 10 }, guaranteed: ['polish'] },
      legendary: { dust: [5, 10], shards: [2, 3], pick: { churn: 30, graft: 30, polish: 20, pare: 20 }, guaranteed: ['polish'] },
    },
    qualityBonus: 'each 5% quality on the salvaged item adds +1 dust',
    goldPerSalvage: 0,
  },
  vendor: { vendorGradeMult: [1, 4, 12, 30], vendorDailyCap: 10, sellBackPct: 25 },
  convert: { up: { ratio: 5, convertGoldPerGrade: [100, 400, 1500] }, down: { ratio: 3, gold: 0 }, dustToGlimmer: 20 },
  crafterNpc: { _doc: 'In town. Screens: Apply shard (drag shard onto item, shows the roll level = min(ilvl, grade cap) BEFORE you confirm, and lists which tiers are reachable), Salvage (with the yields shown), Convert, Buy. Every shard action is logged (item before/after) so a bug report can show what happened.' },
  antiSetForLife: {
    rules: [
      'ilvl never rises; rollIlvl = min(item.ilvl, grade.rollCap)',
      'grade drops follow the AREA level, grade salvage follows the ITEM level; neither follows the character level',
      'a finished item\'s level requirement rises with its best affix tier, so a level-6 character cannot wear a tier-4 roll (ilvlMin 23 -> level 19) even if a friend gives one',
      'Anchor never drops below area 18 and is never sold; Graft needs area 12',
      'vendor stock is grade 1, 10 a day, 5 shaping shards only',
      'convert up is 5:1 with a gold fee and one grade at a time',
      'uniques and legendaries cannot be Blanked or Crowned, only Polished (numbers) — their power stays what it dropped as',
    ],
  },
};
write('currency.json', currency);

// ---------- uniques ----------
// stats: [stat, units, min, max]; the item rolls each once at drop (Polish rerolls them).
const U = (id, name, base, levelReq, weight, stats, extra = {}) => ({ id, name, base, levelReq, weight, stats: stats.map(([stat, units, min, max]) => ({ stat, units, min, max })), ...extra });
const uniques = {
  _doc: 'Act 1 uniques (ruling 38: scarce, never zero). `base` is an item-bases.json id (the unique keeps the base\'s damage/armour and grid; `baseMult` scales the base damage or armour). `stats` are rolled once inside [min, max] at drop and may be re-rolled by a Polish Shard. `rule` is a special that no affix gives (plain text + an object a programmer can implement). `weight` is the pick weight among eligible uniques (rarity.json `uniques`). Units follow affixes.json: pct = whole percentage points. levelReq overrides the base. A unique never gets random affixes.',
  items: [
    U('toll_ring', 'Toll Ring', 'copper_ring', 2, 100, [['goldFind', 'pct', 15, 25], ['vit', 'flat', 2, 3], ['lightRadius', 'flat', 1, 1]], { lore: 'Every traveller paid it once.', look: 'ring: dull copper with a coin set in it' }),
    U('hollow_reed', 'Hollow Reed', 'willow_wand', 3, 90, [['spellPower', 'flat', 5, 8], ['castSpeed', 'pct', 10, 15], ['manaOnKill', 'flat', 3, 5]], { baseMult: 1.1, lore: 'Whistles when it is pointed at something that should not be there.', look: 'wand: pale hollow reed with a green glow inside' }),
    U('brindlecoat', 'Brindlecoat', 'hide_jerkin', 4, 90, [['armourPct', 'pct', 35, 50], ['health', 'flat', 10, 16], ['poisonResist', 'pct', 8, 12], ['dodge', 'pct', 3, 5]], { lore: 'Stitched from a hound that would not die.', look: 'jerkin: mottled brown-and-black hide, fur collar' }),
    U('quiet_hatchet', 'The Quiet Hatchet', 'hand_axe', 5, 80, [['physDamagePct', 'pct', 50, 70], ['threat', 'pct', -40, -30], ['staggerChance', 'pct', 5, 5]], { lore: 'The woodcutter never heard it either.', look: 'axe: small dark head, leather-wrapped haft' }),
    U('moth_eaten_hood', 'Moth-Eaten Hood', 'linen_hood', 5, 80, [['int', 'flat', 2, 3], ['shadowResist', 'pct', 8, 12], ['mana', 'flat', 12, 18], ['shadowDamagePct', 'pct', 10, 15]], { lore: 'The holes are where the moths got in. Or out.', look: 'hood: grey ragged hood, holes with a faint purple shimmer' }),
    U('candlewick_gloves', 'Candlewick Gloves', 'wool_mitts', 6, 80, [['castSpeed', 'pct', 6, 9], ['fireDamageFlat', 'flat', 3, 6], ['mana', 'flat', 8, 12]], { rule: { text: 'Your fire spells light the target for 3 s (+2 m light radius around it).', effect: 'onFireSpellHit', apply: { status: 'lit', seconds: 3, lightRadius: 2 } }, lore: 'Warm. Always warm.', look: 'gloves: cream wool with scorched fingertips' }),
    U('thornwall', 'Thornwall', 'round_shield', 6, 80, [['blockChance', 'pct', 10, 14], ['thorns', 'flat', 8, 14], ['str', 'flat', 2, 3]], { lore: 'A hedge, hammered flat.', look: 'shield: round shield wrapped in dried briar' }),
    U('pennyweight_belt', 'Pennyweight Belt', 'leather_belt', 6, 70, [['potionPower', 'pct', 18, 25], ['goldFind', 'pct', 8, 12]], { rule: { text: '+1 potion slot (4 on this belt).', effect: 'potionSlots', add: 1 }, lore: 'Weighs exactly what it says.', look: 'belt: leather belt hung with small brass weights' }),
    U('longstride_boots', 'Longstride Boots', 'hide_boots', 7, 80, [['moveSpeed', 'pct', 10, 14], ['dodge', 'pct', 3, 4], ['agi', 'flat', 2, 3]], { lore: 'Made for someone with somewhere to be.', look: 'boots: tall soft boots with a red stripe' }),
    U('shepherds_crook', "Shepherd's Crook", 'prayer_rod', 7, 80, [['healingPower', 'pct', 12, 16], ['manaRegen', 'flat', 3, 5], ['spi', 'flat', 2, 3]], { rule: { text: 'Your single-target heals also heal the ally nearest the target for 25%.', effect: 'healSplash', nearest: 1, pct: 25 }, lore: 'Keeps the flock together.', look: 'sceptre: wooden crook with a bell' }),
    U('redcaps_needle', "Redcap's Needle", 'stiletto', 8, 70, [['critChance', 'pct', 8, 10], ['poisonDamageOverTime', 'flat', 6, 12], ['attackSpeed', 'pct', 8, 12]], { lore: 'Dipped in something, long ago.', look: 'dagger: thin rusty-red blade' }),
    U('bellwether_amulet', 'Bellwether Amulet', 'silver_amulet', 8, 70, [['threat', 'pct', 20, 30], ['armourFlat', 'flat', 25, 40], ['str', 'flat', 4, 6]], { lore: 'Where it goes, they follow.', look: 'amulet: a small brass bell on a leather cord' }),
    U('scriveners_tome', "Scrivener's Tome", 'bound_tome', 9, 70, [['spellPower', 'flat', 10, 14], ['int', 'flat', 2, 3], ['stormDamagePct', 'pct', 10, 15]], { rule: { text: 'Casting the same spell twice in a row costs 20% less mana the second time.', effect: 'repeatCastDiscount', pct: 20 }, lore: 'Every page is a correction.', look: 'focus: ink-stained book with loose pages' }),
    U('burrow_gloves', 'Burrow Gloves', 'mail_gloves', 10, 70, [['attackSpeed', 'pct', 8, 10], ['str', 'flat', 4, 6], ['lifeOnHit', 'flat', 2, 4]], { lore: 'Dug out of a grave that dug itself.', look: 'gloves: mail gloves caked with dry earth' }),
    U('foxfire_bow', 'Foxfire Bow', 'long_bow', 10, 70, [['fireDamageFlat', 'flat', 6, 12], ['attackSpeed', 'pct', 12, 16], ['fireDamagePct', 'pct', 10, 15]], { baseMult: 1.15, rule: { text: '30% of this bow\'s physical damage is dealt as fire instead.', effect: 'convertDamage', from: 'physical', to: 'fire', pct: 30 }, lore: 'The string burns and never burns through.', look: 'bow: dark wood with a thin orange-glowing string' }),
    U('owlbone_staff', 'Owlbone Staff', 'gnarled_staff', 11, 60, [['spellPower', 'flat', 14, 20], ['frostDamagePct', 'pct', 20, 28], ['mana', 'flat', 20, 30]], { rule: { text: 'Frost spell hits have 15% chance to freeze the target for 1 s (bosses: slow 30% instead).', effect: 'onFrostSpellHit', chancePct: 15, status: 'freeze', seconds: 1, bossFallback: { status: 'slow', pct: 30, seconds: 1 } }, lore: 'Hoots in the cold.', look: 'staff: pale bone staff topped with an owl skull' }),
    U('millstone_cuirass', 'Millstone Cuirass', 'breastplate', 12, 60, [['armourPct', 'pct', 50, 70], ['health', 'flat', 25, 40], ['moveSpeed', 'pct', -8, -5], ['allResist', 'pct', 4, 6]], { lore: 'Two parts of a mill wheel, hinged.', look: 'cuirass: grey stone-like plate, round and heavy' }),
    U('chanters_beads', "Chanter's Beads", 'silver_amulet', 12, 60, [['castSpeed', 'pct', 10, 14], ['mana', 'flat', 15, 25], ['healingPower', 'pct', 8, 12]], { rule: { text: 'Spells cost 10% less mana.', effect: 'manaCostPct', pct: -10 }, lore: 'One bead per verse.', look: 'amulet: long loop of red wooden beads' }),
    U('sunder_pick', 'Sunder Pick', 'war_axe', 13, 60, [['physDamagePct', 'pct', 80, 100], ['str', 'flat', 5, 8], ['hitChance', 'pct', 4, 6]], { rule: { text: 'Hits reduce the target\'s armour by 10% for 4 s, stacking to 3.', effect: 'onWeaponHit', status: 'sundered', armourPct: -10, seconds: 4, maxStacks: 3 }, lore: 'A miner\'s answer to a locked door.', look: 'greataxe: pick-headed axe, one blade one spike' }),
    U('black_loam_boots', 'Black Loam Boots', 'mail_boots', 13, 60, [['poisonResist', 'pct', 20, 28], ['moveSpeed', 'pct', 6, 9], ['vit', 'flat', 4, 6]], { rule: { text: 'You take no damage from poison pools and poison ground effects.', effect: 'immuneGround', element: 'poison' }, lore: 'The mud never dried.', look: 'boots: mail boots stained black to the shin' }),
    U('rimehorn', 'Rimehorn', 'iron_mace', 14, 55, [['frostDamageFlat', 'flat', 8, 16], ['physDamagePct', 'pct', 40, 60], ['frostResist', 'pct', 10, 15]], { rule: { text: 'Every hit slows the target 20% for 3 s.', effect: 'onWeaponHit', status: 'slow', pct: 20, seconds: 3 }, lore: 'A ram\'s horn, iron-shod, cold to hold.', look: 'mace: curled horn head rimed with frost' }),
    U('catacomb_keyring', 'Catacomb Keyring', 'silver_ring', 15, 50, [['magicFind', 'pct', 20, 28], ['goldFind', 'pct', 10, 15], ['physDamagePct', 'pct', -12, -8]], { lore: 'Opens doors you would rather stayed shut.', look: 'ring: iron ring with three tiny keys' }),
    U('lantern_jaw', 'Lantern Jaw', 'kettle_helm', 16, 50, [['armourPct', 'pct', 30, 45], ['allResist', 'pct', 8, 11], ['vit', 'flat', 5, 8], ['lightRadius', 'flat', 3, 3]], { lore: 'The visor glows from the inside.', look: 'helm: kettle helm with a lit grille visor' }),
    U('wayfarers_crossbow', "Wayfarer's Crossbow", 'heavy_crossbow', 18, 45, [['physDamagePct', 'pct', 100, 130], ['critChance', 'pct', 6, 8], ['agi', 'flat', 6, 9]], { rule: { text: 'Bolts pierce through the first enemy to hit one more behind it (at 60%).', effect: 'pierce', count: 1, pct: 60 }, lore: 'Nobody walks the whole road.', look: 'crossbow: travel-worn crossbow, a map case under the stock' }),
    U('stormcrow_band', 'Stormcrow Band', 'gold_signet', 19, 45, [['stormDamagePct', 'pct', 22, 30], ['castSpeed', 'pct', 6, 8], ['stormResist', 'pct', 10, 15]], { rule: { text: 'Storm spell crits chain to one extra enemy within 5 m for 40%.', effect: 'onStormSpellCrit', chain: 1, range: 5, pct: 40 }, lore: 'It was on the bird\'s leg.', look: 'ring: black band with a blue stone' }),
    U('kingsmoot', 'Kingsmoot', 'claymore', 24, 35, [['physDamagePct', 'pct', 120, 150], ['str', 'flat', 10, 14], ['threat', 'pct', 20, 30], ['health', 'flat', 40, 60]], { baseMult: 1.1, rule: { text: 'Killing a champion or rare monster gives you and allies within 10 m +15% damage for 10 s.', effect: 'onRankKill', buff: { damagePct: 15, seconds: 10, range: 10 } }, lore: 'Twelve chiefs swore on it. Eleven lied.', look: 'greatsword: broad blade with twelve notches' }),
    U('cinder_idol', 'Cinder Idol', 'saint_idol', 28, 35, [['spellPower', 'flat', 30, 40], ['fireDamagePct', 'pct', 25, 35], ['fireResist', 'pct', 15, 20]], { rule: { text: 'Fire damage over time you apply ticks 25% faster.', effect: 'dotTickRate', element: 'fire', pct: 25 }, lore: 'Still warm after a hundred years.', look: 'focus: blackened wooden saint with glowing cracks' }),
  ],
};
write('uniques.json', uniques);

// ---------- legendaries ----------
// Path skill ids assumed for M9 (rename here if M9 names them differently; the ids are the only coupling).
const L = (id, name, path, skill, kinds, ilvlMin, text, rule, look) => ({ id, name, path, skill, kinds, ilvlMin, weight: 10, text, rule, look });
const legendaries = {
  _doc: [
    'Legendary powers (ruling 18: the loot chase, no sockets). A LEGENDARY ITEM = a random base rolled like a rare (3-5 affixes, affixes.json) plus ONE power from this list whose `kinds` includes the item\'s kind (weapons by kind id, armour by slot, "ring"/"neck"/"shield"/"focus"/"quiver"/"belt") and whose ilvlMin <= ilvl. The power shows as an orange line on the tooltip and the item name is "<power name> <base>" (e.g. "Oxhide Grip Hide Gloves").',
    'Each `rule` is an object a programmer implements in js/rules/effects.js: `type` is the hook, the rest are its numbers. Every power changes HOW a skill works or a playstyle, never just a number. A power for a Path a player has not chosen still drops (trade bait, 20% off-Path per rarity.json basePick) but is down-weighted 0.25 by the personal-loot smart roll.',
    'SKILL IDS: these name Path skills M9 will build (fighter_cleave, fighter_shield_slam, fighter_war_cry, fighter_charge, fighter_rend; rogue_slip_step, rogue_backstab, rogue_aimed_shot, rogue_poison_coat, rogue_knife_fan; mage_firebolt, mage_frost_ring, mage_storm_lance, mage_shift, mage_ward; healer_mend, healer_radiance, healer_smite, healer_rebuke, healer_sanctify). If M9 names a skill differently, change the id HERE; nothing else couples to it. A power whose skill the player does not have does nothing (the tooltip says so in grey).',
    'Spec skills replace Path skills (ruling 10), so each power also lists `specAlso`: the spec skills that inherit it (fill in as specs land; empty = Path skill only).',
  ].join(' '),
  powers: [
    // Fighter
    L('oxhide_grip', 'Oxhide Grip', 'fighter', 'fighter_cleave', ['hands', 'greatsword', 'greataxe', 'maul'], 6, 'Cleave strikes all enemies around you (a full circle instead of a cone) for 85% of its damage.', { type: 'skillShape', shape: 'circle', radiusFromCone: true, damageMult: 0.85 }, 'glow: brown leather with a glowing ox-horn stamp'),
    L('ramhorn', 'Ramhorn', 'fighter', 'fighter_shield_slam', ['shield'], 8, 'Shield Slam knocks the target back 3 m and stuns it for 1 s; its cooldown is 2 s longer.', { type: 'skillAdd', knockback: 3, stun: 1.0, cooldownAdd: 2 }, 'glow: curled ram horns on the shield boss'),
    L('standard_of_the_wall', 'Standard of the Wall', 'fighter', 'fighter_war_cry', ['chest', 'head'], 10, 'War Cry also gives allies within 10 m +20% armour for 8 s.', { type: 'skillAllyBuff', range: 10, buff: { armourPct: 20, seconds: 8 } }, 'glow: a banner motif across the chest'),
    L('chasers_greaves', "Chaser's Greaves", 'fighter', 'fighter_charge', ['feet', 'belt'], 8, 'Charge has 2 charges, and a kill within 3 s of a Charge restores one.', { type: 'skillCharges', charges: 2, refundOnKillWithin: 3 }, 'glow: boots with a running-hound stamp'),
    L('grudge_edge', 'Grudge Edge', 'fighter', 'fighter_rend', ['sword', 'axe', 'greatsword', 'greataxe', 'polearm'], 12, 'Rend lasts twice as long, and when a rended enemy dies the bleed jumps to the nearest enemy within 6 m with its remaining time.', { type: 'skillDot', durationMult: 2, spreadOnDeath: { range: 6, count: 1 } }, 'glow: a dark red line down the blade'),
    // Rogue
    L('night_soil', 'Night Soil', 'rogue', 'rogue_slip_step', ['feet'], 6, 'Slip Step leaves a smoke cloud (3 m, 3 s) where you were; enemies inside have -50% chance to hit.', { type: 'skillLeaveGround', radius: 3, seconds: 3, enemyDebuff: { hitChancePct: -50 } }, 'glow: boots that trail dark smoke'),
    L('twinning_spine', 'Twinning Spine', 'rogue', 'rogue_backstab', ['dagger', 'sword'], 8, 'Backstab works from any side at 60% damage (full damage from behind as before).', { type: 'skillCondition', relax: 'behind', frontMult: 0.6 }, 'glow: a blade with a second ghost edge'),
    L('brace_of_sparrows', 'Brace of Sparrows', 'rogue', 'rogue_aimed_shot', ['bow', 'crossbow', 'quiver'], 10, 'Aimed Shot fires two arrows, each for 65% damage; each can crit on its own.', { type: 'skillMultiHit', hits: 2, damageMult: 0.65 }, 'glow: twin sparrow feathers on the fletching'),
    L('hemlock_cord', 'Hemlock Cord', 'rogue', 'rogue_poison_coat', ['belt', 'hands'], 10, 'Poison Coat also coats the weapons of allies within 6 m (same poison, half duration).', { type: 'skillShareBuff', range: 6, durationMult: 0.5 }, 'glow: a belt of braided pale-green cord'),
    L('jugglers_band', "Juggler's Band", 'rogue', 'rogue_knife_fan', ['ring', 'neck'], 12, 'Each Knife Fan knife that kills refunds 10 energy; each that crits refunds 3.', { type: 'skillRefund', resource: 'energy', onKill: 10, onCrit: 3 }, 'glow: a ring of tiny spinning knives'),
    // Mage
    L('tallow_crown', 'Tallow Crown', 'mage', 'mage_firebolt', ['head', 'wand', 'staff'], 6, 'Firebolt leaves burning ground (2 m, 3 s) where it lands: 20% of the bolt\'s damage per second as fire.', { type: 'skillLeaveGround', radius: 2, seconds: 3, dps: { pctOfHit: 20, element: 'fire' } }, 'glow: a dripping wax crown with lit wicks'),
    L('frostweft', 'Frostweft', 'mage', 'mage_frost_ring', ['chest', 'focus'], 8, 'Frost Ring also wraps you in a frost shell that absorbs 15% of your maximum health for 6 s.', { type: 'skillSelfShield', pctMaxHealth: 15, seconds: 6 }, 'glow: a robe woven with frost thread'),
    L('forked_lance', 'Forked Lance', 'mage', 'mage_storm_lance', ['wand', 'staff', 'focus'], 10, 'Storm Lance chains to up to 2 more enemies within 6 m, each for 50% damage.', { type: 'skillChain', count: 2, range: 6, damageMult: 0.5 }, 'glow: a forked blue arc along the shaft'),
    L('hourglass_band', 'Hourglass Band', 'mage', 'mage_shift', ['ring', 'neck'], 8, 'Shift has 2 charges, and a kill restores one.', { type: 'skillCharges', charges: 2, refundOnKill: true }, 'glow: a ring with sand running inside it'),
    L('deep_well', 'Deep Well', 'mage', 'mage_ward', ['focus', 'chest'], 12, 'Ward absorbs 2 damage per point of mana instead of 1, but Ward cannot be cast below 30% mana.', { type: 'skillRate', absorbPerMana: 2, minManaPct: 30 }, 'glow: a dark glass focus with a point of light far inside'),
    // Healer
    L('dawnbreak', 'Dawnbreak', 'healer', 'healer_smite', ['sceptre', 'mace', 'staff'], 6, 'Smite heals the most injured ally within 12 m for 40% of the damage it dealt.', { type: 'skillHealFromDamage', target: 'lowestAllyInRange', range: 12, pct: 40 }, 'glow: a sceptre head like a rising sun'),
    L('lichen_robe', 'Lichen Robe', 'healer', 'healer_mend', ['chest', 'head'], 8, 'Mend leaves a heal over time for 30% of its amount over 6 s.', { type: 'skillHot', pct: 30, seconds: 6 }, 'glow: a robe grown over with soft green lichen'),
    L('beacon_amulet', 'Beacon Amulet', 'healer', 'healer_radiance', ['neck', 'ring'], 10, 'Radiance reaches 50% further and pulses once more, 2 s after it ends, for 50%.', { type: 'skillArea', radiusMult: 1.5, extraPulse: { delay: 2, pct: 50 } }, 'glow: an amulet that pulses with warm light'),
    L('shieldbearers_rebuke', "Shieldbearer's Rebuke", 'healer', 'healer_rebuke', ['shield', 'hands'], 10, 'Rebuke taunts every enemy within 8 m and gives you +30% block chance for 4 s.', { type: 'skillTauntArea', range: 8, selfBuff: { blockChancePct: 30, seconds: 4 } }, 'glow: a shield with an open hand sigil'),
    L('sanctum_band', 'Sanctum Band', 'healer', 'healer_sanctify', ['ring', 'belt'], 12, 'Sanctify also removes one poison or shadow effect from each ally it touches.', { type: 'skillCleanse', elements: ['poison', 'shadow'], count: 1 }, 'glow: a plain white band that hums'),
    // Any Path
    L('hungering_band', 'Hungering Band', 'any', null, ['ring', 'neck'], 8, 'Your auto-attacks heal you for 2% of the damage they deal; skills do not.', { type: 'autoAttackLeech', pct: 2 }, 'glow: a ring with a tiny open mouth'),
    L('packrats_sash', "Packrat's Sash", 'any', null, ['belt'], 6, 'Potions you drink from the belt have a 25% chance not to be used up.', { type: 'potionRefundChance', pct: 25 }, 'glow: a sash crowded with tiny pockets'),
  ].map(p => ({ ...p, specAlso: [] })),
};
write('legendaries.json', legendaries);

// ---------- writer with one-line small arrays ----------
function write(name, obj) {
  const json = JSON.stringify(obj, null, 2)
    // collapse short arrays / objects of numbers and strings onto one line
    .replace(/\[\s+((?:-?[\d.]+|"[^"\n]*"|true|false|null)(?:,\s+(?:-?[\d.]+|"[^"\n]*"|true|false|null))*)\s+\]/g, (m, inner) => '[' + inner.replace(/,\s+/g, ', ') + ']')
    .replace(/\{\s+("(?:w|h|min|max|tier|ilvlMin|weight|stat|units|value)": (?:-?[\d.]+|"[^"\n]*")(?:,\s+"\w+": (?:-?[\d.]+|"[^"\n]*"))*)\s+\}/g, (m, inner) => '{ ' + inner.replace(/,\s+/g, ', ') + ' }');
  fs.writeFileSync(OUT + name, json + '\n');
  JSON.parse(json);
  console.log('wrote', name, (json.length / 1024).toFixed(1) + ' KB');
}
// ---------- cross-checks ----------
const baseIds = new Set(bases.map(b => b.id));
const KIND_WORDS = new Set([...Object.keys(KINDS), 'head', 'chest', 'hands', 'feet', 'belt', 'shield', 'focus', 'quiver', 'ring', 'neck']);
for (const u of uniques.items) if (!baseIds.has(u.base)) throw new Error('unique base missing ' + u.base);
for (const a of [...prefixes, ...suffixes]) for (const k of a.kinds) if (!KIND_WORDS.has(k)) throw new Error('affix kind ' + k + ' on ' + a.id);
for (const p of legendaries.powers) for (const k of p.kinds) if (!KIND_WORDS.has(k)) throw new Error('legendary kind ' + k + ' on ' + p.id);
for (const a of [...prefixes, ...suffixes]) for (const t of a.tiers) if (t.min > t.max) throw new Error('tier min>max ' + a.id + ' T' + t.tier);
const statIds = new Set([...prefixes, ...suffixes].map(a => a.stat));
for (const u of uniques.items) for (const s of u.stats) if (!statIds.has(s.stat)) throw new Error('unique stat not an affix stat: ' + s.stat + ' on ' + u.id);
const banned = /\b(heroic|mythic|keystone|horde|alliance|hearthstone|delve|renown|rested|honored|revered|exalted|fury|focus\b.*resource|rage\b|garrote|prowl|maul\b.*ability|barkskin|blink|counterspell|consecration|hellfire|starfall|soulbound|chi\b|muster|ember|veil|orb of|chaos|divine|mirror)\b/i;
const allNames = [...bases.map(b => b.name), ...uniques.items.map(u => u.name), ...legendaries.powers.map(p => p.name), ...SHARDS.map(s => s[1]), ...[...prefixes, ...suffixes].map(a => a.name)];
for (const n of allNames) if (banned.test(n)) throw new Error('banned word in name: ' + n);
console.log('bases', bases.length, 'act1', act1, 'weapons', WEAPONS.length, 'armour', ARMOUR.length);
console.log('affixes', prefixes.length, 'prefixes', suffixes.length, 'suffixes', [...prefixes, ...suffixes].reduce((n, a) => n + a.tiers.length, 0), 'tier rows');
console.log('uniques', uniques.items.length, 'legendaries', legendaries.powers.length, 'shards', SHARDS.length);
