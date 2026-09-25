// Farhold R25 — the caster's off hand: four FOCI, their uniques and a set.
//
//   "We recently added new Wand and Tome/Book models to the Chibi 2 system. Can you find those and
//    wire up appropriate items for Farhold? Book/tome should be an off-hand for casters to use along
//    with a wand. They should have their own distinct feature… drastically different compared to
//    using a 2nd wand or a shield. There should also be unique and set versions of these new items.
//    We could also add other off-hands beyond just tomes and books… maybe relics or orbs."
//
// A focus is an OFF-HAND ARMOUR PIECE, not a weapon: it never swings (a tome filed as a weapon was a
// second wand that happened to be a book), and its whole value is the property it carries:
//
//   grimoire  (Chibi 2 `book`)  every third wand bolt throws a page — a second bolt at 60% — and
//                               skills cost 15% less mana          (affix cond_focusGrimoire)
//   seer_orb  (`orb`)           a mote circles you and strikes the nearest enemy every 1.4s
//                                                                   (cond_focusOrb)
//   reliquary (`relic`)         a blow you take may be answered by holy light that hurts whatever
//                               is near and heals you               (cond_focusRelic)
//   effigy    (`idol`)          every status you lay lasts 2s longer and does 25% more
//                                                                   (cond_focusIdol)
//
// The effects live in js/effects.js (FOCI). Everything here is put into the SHARED item table in
// memory, like js/uniques.js does — items.json belongs to Emberveil as well and is never written.
// Each row carries `focus: true`, so installing twice replaces rather than doubles.

export const FOCUS_BASES = {
  grimoire: { name: 'Grimoire', type: 'armor', slot: 'offhand', tier: 'cloth', armor: 1, dodgeBonus: 0,
    isFocus: true, look: 'book', intrinsic: [{ stat: 'cond_focusGrimoire', value: 1, name: 'Pages' }, { stat: 'mp', value: 12, name: 'Mana' }] },
  seer_orb: { name: "Seer's Orb", type: 'armor', slot: 'offhand', tier: 'cloth', armor: 1, dodgeBonus: 1,
    isFocus: true, look: 'orb', intrinsic: [{ stat: 'cond_focusOrb', value: 1, name: 'Mote' }] },
  reliquary: { name: 'Reliquary', type: 'armor', slot: 'offhand', tier: 'cloth', armor: 3, dodgeBonus: 0,
    isFocus: true, look: 'relic', intrinsic: [{ stat: 'cond_focusRelic', value: 1, name: 'Answering Light' }, { stat: 'barrier', value: 10, name: 'Barrier' }] },
  // 2026-09-25: the paladin's starting book — a holy warrior's focus that simply makes spells
  // stronger, and keeps a little mana in hand. The plain one to hold beside a sword.
  psalter: { name: 'Psalter', type: 'armor', slot: 'offhand', tier: 'cloth', armor: 2, dodgeBonus: 0,
    isFocus: true, look: 'book', intrinsic: [{ stat: 'spellPower', value: 0.12, name: 'Hymns' }, { stat: 'mp', value: 8, name: 'Mana' }] },
  effigy: { name: 'Effigy', type: 'armor', slot: 'offhand', tier: 'cloth', armor: 1, dodgeBonus: 1,
    isFocus: true, look: 'idol', intrinsic: [{ stat: 'cond_focusIdol', value: 1, name: 'Binding' }] },
};

/** Two uniques per focus: one with a power of its own, one built on a power the game already had. */
export const FOCUS_UNIQUES = [
  { id: 'fh_codex_of_tides', name: 'Codex of Tides', slot: 'offhand', baseItemId: 'grimoire', act: 2, quality: 'high',
    fixedAffixes: [{ stat: 'int', value: 8 }, { stat: 'spellPower', value: 0.08 }], randomAffixes: [{ stat: 'mp', min: 15, max: 30 }],
    legendaryEffect: 'page_storm', lore: 'Every page is a sea someone drowned in. Read one aloud and it comes out of the book with you.' },
  { id: 'fh_ledger_of_ash', name: 'Ledger of Ash', slot: 'offhand', baseItemId: 'grimoire', act: 4, quality: 'elite',
    fixedAffixes: [{ stat: 'int', value: 12 }, { stat: 'cooldownReduction', value: 6 }], randomAffixes: [{ stat: 'spellPower', min: 0.08, max: 0.16 }],
    legendaryEffect: 'archivist', lore: 'A tally of every spell its owner ever cast. The ink is still warm on the newest line.' },
  { id: 'fh_eye_of_the_marsh', name: 'Eye of the Marsh', slot: 'offhand', baseItemId: 'seer_orb', act: 2, quality: 'high',
    fixedAffixes: [{ stat: 'int', value: 8 }, { stat: 'magicResist', value: 6 }], randomAffixes: [{ stat: 'mp', min: 12, max: 24 }],
    legendaryEffect: 'twin_motes', lore: 'Two lights live in it, and they do not agree about which of them is the reflection.' },
  { id: 'fh_starwell', name: 'Starwell', slot: 'offhand', baseItemId: 'seer_orb', act: 5, quality: 'elite',
    fixedAffixes: [{ stat: 'int', value: 14 }, { stat: 'spellPower', value: 0.12 }], randomAffixes: [{ stat: 'critChance', min: 3, max: 6 }],
    legendaryEffect: 'twin_motes', lore: 'Cold to the touch and bottomless to the eye. Something at the bottom is looking up.' },
  { id: 'fh_pilgrims_last_bone', name: "Pilgrim's Last Bone", slot: 'offhand', baseItemId: 'reliquary', act: 2, quality: 'high',
    fixedAffixes: [{ stat: 'con', value: 8 }, { stat: 'hp', value: 30 }], randomAffixes: [{ stat: 'armor', min: 6, max: 12 }],
    legendaryEffect: 'sanctuary', lore: 'The saint walked until only this was left. It is still walking, in a way.' },
  { id: 'fh_ward_of_the_first_lamp', name: 'Ward of the First Lamp', slot: 'offhand', baseItemId: 'reliquary', act: 4, quality: 'elite',
    fixedAffixes: [{ stat: 'con', value: 12 }, { stat: 'barrier', value: 25 }], randomAffixes: [{ stat: 'hpRegen', min: 1, max: 3 }],
    legendaryEffect: 'searing_light', lore: 'A shard of the lantern that was lit before the sun. It remembers being the only light.' },
  { id: 'fh_knot_of_nine_grudges', name: 'Knot of Nine Grudges', slot: 'offhand', baseItemId: 'effigy', act: 3, quality: 'high',
    fixedAffixes: [{ stat: 'int', value: 10 }, { stat: 'dex', value: 6 }], randomAffixes: [{ stat: 'spellPower', min: 0.06, max: 0.12 }],
    legendaryEffect: 'hexbound', lore: 'Nine names are tied into the straw. Eight of them have stopped answering.' },
  { id: 'fh_hollow_mother', name: 'The Hollow Mother', slot: 'offhand', baseItemId: 'effigy', act: 5, quality: 'elite',
    fixedAffixes: [{ stat: 'int', value: 14 }, { stat: 'magicResist', value: 10 }], randomAffixes: [{ stat: 'cooldownReduction', min: 4, max: 8 }],
    legendaryEffect: 'dread_lantern', lore: 'A clay figure with nothing inside. Whatever keeps its shape is not clay.' },
];

/** The set: a wand, a grimoire and a robe, and every fourth skill is free and goes off twice. */
export const FOCUS_SETS = [
  { id: 'archivists_regalia', name: "The Archivist's Regalia", tier: 'medium', pieces: 3,
    items: [
      { slot: 'weapon', baseItemId: 'wand', fixedAffixes: [{ stat: 'int', value: 8 }, { stat: 'spellPower', value: 0.06 }], randomAffixes: [{ stat: 'mp', min: 10, max: 20 }] },
      { slot: 'offhand', baseItemId: 'grimoire', fixedAffixes: [{ stat: 'int', value: 8 }, { stat: 'mp', value: 20 }], randomAffixes: [{ stat: 'cooldownReduction', min: 3, max: 6 }] },
      { slot: 'chest', baseItemId: 'cloth_chest', fixedAffixes: [{ stat: 'int', value: 8 }, { stat: 'magicResist', value: 8 }], randomAffixes: [{ stat: 'hp', min: 15, max: 30 }] },
    ],
    legendaryEffect: 'archivist', activationPieces: 3, partialBonuses: { 2: { int: 6, spellPower: 0.05 } } },
];

/** The level a focus starts dropping at, per base (added to the matching `lootTiers` rows). */
export const FOCUS_FROM_LEVEL = { grimoire: 3, psalter: 3, seer_orb: 5, reliquary: 5, effigy: 8 };

/**
 * Put the four bases, the eight uniques and the set into the shared tables. Call BEFORE `new Rpg`:
 * Emberveil's loot module snapshots the bases when it is built.
 */
export function installFoci(items, { describe = null, balance = null } = {}) {
  if (!items) return items;
  items.armorBases = items.armorBases || {};
  for (const [key, base] of Object.entries(FOCUS_BASES)) items.armorBases[key] = { ...JSON.parse(JSON.stringify(base)), farhold: true };
  items.uniques = (items.uniques || []).filter(u => !u.focus);
  items.legendaryEffects = items.legendaryEffects || {};
  for (const u of FOCUS_UNIQUES) {
    items.uniques.push({ ...JSON.parse(JSON.stringify(u)), farhold: true, focus: true });
    if (!items.legendaryEffects[u.legendaryEffect] && describe) {
      const text = describe(u.legendaryEffect);
      if (text) items.legendaryEffects[u.legendaryEffect] = text;
    }
  }
  items.sets = (items.sets || []).filter(s => !s.focus);
  for (const set of FOCUS_SETS) {
    items.sets.push({ ...JSON.parse(JSON.stringify(set)), farhold: true, focus: true });
    if (!items.legendaryEffects[set.legendaryEffect] && describe) {
      const text = describe(set.legendaryEffect);
      if (text) items.legendaryEffects[set.legendaryEffect] = text;
    }
  }
  // …and let them drop: each focus joins the loot tiers that open within four levels of its own
  // (tiers are cumulative lists, so joining one means joining every tier after it too)
  for (const tier of balance?.lootTiers || []) {
    for (const [key, from] of Object.entries(FOCUS_FROM_LEVEL)) {
      if ((tier.minLevel ?? 1) >= from - 4 && !tier.bases.includes(key)) tier.bases.push(key);
    }
  }
  return items;
}

/** The Chibi 2 off-hand model a focus (or an older magic off-hand) is drawn as. */
export function focusLook(item) {
  if (!item) return null;
  const key = item.baseKey || item.baseItemId;
  if (FOCUS_BASES[key]) return FOCUS_BASES[key].look;
  // the four old barrier foci: an orb reads as an orb, a warded focus as a relic
  if (key === 'spellguard_orb') return 'orb';
  if (key === 'warded_focus') return 'relic';
  return null;
}
