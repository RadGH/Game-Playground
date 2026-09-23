// Farhold R17 — build your own class.
//
//   "I've been thinking it would be really cool to build a custom class in this game. We could use
//    a point-buy system… We can extract all the existing classes into a spell tier list and allow
//    choosing spells. You would pick only your starting spell, and would get to choose another
//    spell at every significant level (same as current skill unlocks). We should also let you
//    choose a default loadout such as wands with a specific element, dual swords, daggers, bow,
//    etc; effectively all combinations except for dual 2h (which require a perk). You should be
//    able to unlearn a skill at any time. You should also be able to pick a companion or, for the
//    solo players, start with a bonus crate…"
//
// PURE. No DOM, no Three.js, nothing loaded — js/classbuild-ui.js draws it and js/newgame.js wires
// it into the title flow, so the node tests can drive every rule in here without a browser.
//
//   import { spellCatalogue, createBuild, pickSpell, installCustomClass } from './classbuild.js';
//   const cat = spellCatalogue({ classData, skillData });
//   const build = createBuild(classbuildData);
//   pickSpell(build, 0, 'power_strike', cat);
//   installCustomClass({ classData, skillData, classLooks, data: classbuildData, build });
//   // …and `classId: 'custom'` now resolves everywhere in the game.
//
// ---------------------------------------------------------------------------------------------
// WHERE THE TIER LIST COMES FROM, AND WHY THERE IS NO GENERATED FILE.
//
// The brief allowed either: derive the catalogue with a script under tools/ and commit the JSON, or
// read the existing data at runtime. This reads it at runtime, and the reason is the fault this
// project keeps finding — a second copy of something that nothing keeps in step. `data/classes.json`
// and `data/skills.json` ALREADY say which class gets which skill and at what level; both are
// already loaded by js/main.js and by js/newgame.js before this module is ever called. A committed
// `spells.json` would be a third statement of the same fact, correct on the day it was generated and
// silently wrong the first time somebody adds a skill to a class — and nothing would fail, because
// a tier list that is missing a spell just quietly does not offer it.
//
// What IS in `data/classbuild.json` is the part that genuinely cannot be derived: the loadouts, the
// elements, the armour tiers, the opening kit, and the six tier names. Its `tiers` levels are
// checked against `skills.json`'s own `unlockAt` at load (see `spellCatalogue`) and throw if they
// disagree, because two ladders that disagree is exactly the bug worth failing loudly over.
//
// ---------------------------------------------------------------------------------------------
// HOW A CUSTOM CLASS REACHES THE REST OF THE GAME: IT BECOMES A CLASS.
//
// `installCustomClass` writes a synthetic entry into the three data objects main.js has already
// loaded — `classData.classes` gets a class whose `id` is "custom", `skillData.classes.custom` gets
// the six chosen spell ids in slot order, and `classLooks.classes.custom` gets a body. Everything
// downstream then works with no change at all: `classData.classes.find(c => c.id === classId)`
// finds it, `createSkillBar` reads `data.classes[player.classId]`, `classDef.pet` summons the
// companion, `classDef.starter`/`startingArmour` equip the loadout. That is deliberate — the
// alternative was a dozen "if the class is custom" branches in files this round does not own.

import { attuneWeapon } from './rpg.js';

/** The rarity ladder, low to high. Shared with js/rpg.js `rollDrop`. */
const RARITY_LADDER = ['normal', 'magic', 'rare', 'legendary'];

/** How many spells a character ever picks. One per rung of `skills.json`'s `unlockAt`. */
export const PICK_COUNT = 6;

/**
 * THE SPELL TIER LIST — every skill the 30 classes hand out, with the earliest level anybody gets it.
 *
 * A spell's tier is the EARLIEST rung any class grants it on, not the average and not the latest.
 * A warrior gets Power Strike in slot 0 and a rogue gets it in slot 4, and the honest answer to
 * "when could a character have this" is the first of those. It is also the rule that keeps the
 * opening slot interesting: eleven spells are available at level 1 and Meteor is not one of them.
 *
 * Returns `{ tiers, spells, byId, unlockAt }`. `spells` is sorted by tier then name, which is the
 * order the builder draws them in.
 */
export function spellCatalogue({ classData = null, skillData = null, data = null } = {}) {
  const unlockAt = skillData?.unlockAt || [1, 3, 6, 12, 18, 24];
  const skills = skillData?.skills || {};
  const classSkills = skillData?.classes || {};
  const classes = classData?.classes || [];

  /**
   * THE TWO LADDERS MUST AGREE, AND IT IS WORTH THROWING OVER.
   *
   * `data/classbuild.json` names the six rungs for the screen; `data/skills.json` decides what a
   * level actually unlocks. If somebody retunes one and not the other the builder would offer a
   * spell at level 12 that the skill bar does not unlock until 18, and nothing anywhere would
   * complain — the player would simply have a dead key. So they are compared here, once.
   */
  const tierLevels = (data?.tiers || []).map(t => t.level);
  if (tierLevels.length && (tierLevels.length !== unlockAt.length
    || tierLevels.some((lv, i) => lv !== unlockAt[i]))) {
    throw new Error(`classbuild.json tiers [${tierLevels}] do not match skills.json unlockAt [${unlockAt}]`);
  }

  /** skillId -> the earliest unlock level any class grants it on. */
  const earliest = new Map();
  /** skillId -> the names of the classes that carry it, for the "who else uses this" line. */
  const carriedBy = new Map();
  const nameOf = id => classes.find(c => c.id === id)?.name || id;

  for (const [classId, ids] of Object.entries(classSkills)) {
    // the synthetic class installs itself into this same table; it must never feed the tier list
    if (classId === (data?.custom?.id || 'custom')) continue;
    ids.forEach((skillId, i) => {
      const level = unlockAt[i] ?? unlockAt[unlockAt.length - 1];
      earliest.set(skillId, Math.min(earliest.get(skillId) ?? Infinity, level));
      const list = carriedBy.get(skillId) || [];
      if (!list.includes(classId)) list.push(classId);
      carriedBy.set(skillId, list);
    });
  }

  const spells = Object.entries(skills).map(([id, s]) => {
    const tier = earliest.get(id) ?? unlockAt[unlockAt.length - 1];
    return {
      id,
      name: s.name || id,
      desc: s.desc || '',
      shape: s.shape || 'bolt',
      element: s.element || 'physical',
      // a summoning spell is the one kind whose limit the follower book has to know about
      summon: s.shape === 'summon' ? (s.pet || null) : null,
      count: s.count || 1,
      cooldown: s.cooldown ?? 6,
      mp: s.mp ?? 0,
      tier,
      tierIndex: Math.max(0, unlockAt.indexOf(tier)),
      classes: (carriedBy.get(id) || []).map(nameOf),
      /** Rough tags, so the builder can filter without a second hand-written table. */
      tags: tagsFor(s),
    };
  }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));

  const byId = new Map(spells.map(s => [s.id, s]));
  const tiers = unlockAt.map((level, i) => ({
    level,
    name: data?.tiers?.[i]?.name || `Tier ${i + 1}`,
    blurb: data?.tiers?.[i]?.blurb || '',
    spells: spells.filter(s => s.tier === level),
  }));
  return { tiers, spells, byId, unlockAt };
}

/** What kind of thing a skill is, read off its own row rather than typed out a second time. */
function tagsFor(s) {
  const out = [];
  if (s.shape === 'summon') out.push('summon');
  if (s.shape === 'self') out.push(s.heal ? 'heal' : 'buff');
  if (s.heal) out.push('heal');
  if (['melee', 'around', 'dash'].includes(s.shape)) out.push('melee');
  if (['bolt', 'beam', 'ground'].includes(s.shape)) out.push('ranged');
  if (s.element && s.element !== 'physical') out.push('magic');
  if (s.status) out.push('status');
  return out;
}

// ---------------------------------------------------------------------------- the build itself

/**
 * A fresh build. This object IS the save — it rides on `player.build` and js/save.js carries it, so
 * a custom character reloads as the character that was built rather than as a ranger.
 */
export function createBuild(data = null) {
  const first = data?.loadouts?.[0];
  return {
    schema: 1,
    name: data?.custom?.name || 'Freelance',
    loadout: first?.id || 'blade_board',
    element: first?.element ? 'fire' : null,
    look: data?.custom?.baseLook || 'ranger',
    spells: new Array(PICK_COUNT).fill(null),
    opening: { kind: 'crate', companion: data?.opening?.companions?.[0]?.id || null },
    /** Set once the opening kit has been handed out, so a reload cannot pay it twice. */
    granted: false,
  };
}

/** How many picks are still unspent. */
export function picksLeft(build) {
  return (build?.spells || []).filter(s => !s).length;
}

/**
 * Can this spell go in this slot?
 *
 * Two rules and no more: a slot may only take a spell whose tier is at or below the level that slot
 * unlocks at, and no spell twice. The first is the point-buy — a level-1 slot cannot hold Meteor —
 * and it uses the EXISTING unlock ladder rather than a new one, which is the brief's own condition:
 * "match the existing unlock levels exactly — do not invent a new ladder".
 *
 * ---------------------------------------------------------------------------------------------
 * R20 — AND A THIRD RULE, WHICH IS WHY THE CHARACTER CREATOR NOW ONLY ASKS FOR ONE SPELL.
 *
 *   "Let's change the character creator so that you only pick the first level spell. When you reach
 *    levels 3/6/12/18/24 unlock the next spell…"
 *
 * `level` is how far the character has actually got, and a slot cannot be filled before the level
 * it opens at. That single rule is the WHOLE of the change: the title screen builds a level-1
 * character, so five of the six slots refuse themselves and the creator asks for one spell without
 * needing to know anything about creation. The in-game chooser passes `player.level` and the same
 * function opens exactly the slots that have come due.
 *
 * The default is 1 rather than Infinity on purpose. A caller that forgets to pass a level gets the
 * conservative answer (only the opening slot), never a free run at all six.
 */
export function pickRefusal(build, slot, skillId, cat, { level = 1 } = {}) {
  if (!cat) return 'No spell list loaded.';
  if (!Number.isInteger(slot) || slot < 0 || slot >= PICK_COUNT) return 'There is no such slot.';
  const spell = cat.byId.get(skillId);
  if (!spell) return `There is no spell called ${skillId}.`;
  const at = cat.unlockAt[slot];
  if (level < at) {
    return `This slot opens at level ${at}. You are level ${level}.`;
  }
  if (spell.tier > at) {
    return `${spell.name} is a level ${spell.tier} spell and this slot opens at level ${at}.`;
  }
  const already = (build.spells || []).findIndex((id, i) => id === skillId && i !== slot);
  if (already >= 0) return `${spell.name} is already in slot ${already + 1}.`;
  /**
   * AND A SLOT ALREADY LEARNED IS NOT RE-PICKED FOR FREE — ONCE THE RUN HAS STARTED.
   *
   * Unlearning used to be a button on the same screen, so swapping a spell was two free clicks.
   * It costs gold at an Unbinder now (js/retrain.js), and a slot you could simply overwrite would
   * be a way straight round that — the spell you are bored of would be gone and the counter never
   * paid.
   *
   * `build.granted` is what separates the two cases, and it is already on the build: it is set once
   * by `applyOpeningKit`, at the moment the character walks out of the gate. Before that the build
   * is a DRAFT — nothing has been learned, nobody has cast anything, and the whole point of a
   * builder is that you can try something and change your mind. The first version of this rule
   * refused an overwrite from the moment the pick was made, which made the character creator's one
   * decision irreversible on the title screen with no way back short of 120 gold at an NPC in a town
   * the player has not reached yet. That is the opposite of what the counter is for.
   */
  if (build.spells?.[slot] && build.granted) {
    const worn = cat.byId.get(build.spells[slot]);
    return `${worn?.name || 'A spell'} is already in this slot. An Unbinder in town can unlearn ${worn?.name || 'that spell'} for gold.`;
  }
  return null;
}

/** Put a spell in a slot. Returns `{ ok, why }`. */
export function pickSpell(build, slot, skillId, cat, { level = 1 } = {}) {
  const why = pickRefusal(build, slot, skillId, cat, { level });
  if (why) return { ok: false, why };
  build.spells[slot] = skillId;
  return { ok: true, why: null };
}

/**
 * UNLEARN, AT ANY TIME. "You should be able to unlearn a skill at any time."
 *
 * The pick comes straight back — there is no cost, no cooldown and no penalty, because the point of
 * a build screen is that you can try something. It returns what came out so the caller can say so
 * in a sentence, and it is deliberately the only way a slot is emptied: nothing anywhere writes
 * `build.spells[i] = null` directly.
 */
export function unlearnSpell(build, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= PICK_COUNT) return { ok: false, why: 'There is no such slot.', refunded: null };
  const had = build.spells?.[slot] || null;
  if (!had) return { ok: false, why: 'That slot is already empty.', refunded: null };
  build.spells[slot] = null;
  return { ok: true, why: null, refunded: had };
}

/**
 * Every slot, with what is in it, whether it has come due, and what it may hold.
 *
 * `open` is "this character is high enough level to fill it", `pending` is "…and it is still
 * empty", which is the thing the character sheet puts a badge on. `at` is the level it opens at.
 */
export function slotsOf(build, cat, { level = 1 } = {}) {
  return cat.unlockAt.slice(0, PICK_COUNT).map((at, i) => {
    const spellId = build?.spells?.[i] || null;
    const open = level >= at;
    return {
      index: i,
      level: at,
      open,
      pending: open && !spellId,
      /**
       * Can this slot be CHANGED right now? An empty one that has come due, always — and a filled
       * one too while the build is still a draft on the title screen, because a creator you cannot
       * take a decision back in is not a creator. Once `granted` is set the answer is the
       * Unbinder. Same rule as `pickRefusal`, asked once so the screen and the refusal cannot
       * disagree about which rows are live.
       */
      editable: open && (!spellId || !build?.granted),
      name: cat.tiers[i]?.name || `Tier ${i + 1}`,
      blurb: cat.tiers[i]?.blurb || '',
      spellId,
      spell: spellId ? cat.byId.get(spellId) || null : null,
      /** Every spell this slot could take right now — tier low enough, and not already picked. */
      options: cat.spells.filter(s => s.tier <= at && !pickRefusal(build, i, s.id, cat, { level })),
    };
  });
}

/**
 * How many spells this character is owed right now: slots whose level has come and gone with
 * nothing in them. This is the number the character sheet badges and the HUD announces on a
 * level-up, and it is the ONLY thing that decides whether the chooser has anything to offer.
 */
export function pendingPicks(build, cat, level = 1) {
  if (!build || !cat) return 0;
  return slotsOf(build, cat, { level }).filter(s => s.pending).length;
}

// ---------------------------------------------------------------------------- the loadout

/**
 * THE TWO-TWO-HANDERS GATE.
 *
 *   "…effectively all combinations except for dual 2h (which require a perk)."
 *
 * The perk is the melee keystone **Doubled Grasp** (round 13 renamed it from the name it shipped
 * with, which was somebody else's). A saved perk is the NODE id — `melee:7:0` — not the keystone id,
 * so this never compares ids by hand: it asks for the flag the keystone grants (`doubleGrip`, which
 * is what js/rpg.js `equip` and js/weapons.js `offhandRefusal` both already read), and failing that
 * walks the forest to find which node carries the keystone. Either answer is the same answer.
 */
export function hasKeystone(player, keystoneId, forest = null) {
  if (!player) return false;
  if (player.perkFlags && forest) {
    const node = [...forest.byId.values()].find(n => n.keystoneId === keystoneId);
    if (node && player.perkFlags[node.flag]) return true;
  }
  const taken = new Set(player.perks || []);
  if (forest) {
    for (const node of forest.byId.values()) {
      if (node.keystoneId === keystoneId && taken.has(node.id)) return true;
    }
    return false;
  }
  // no forest to walk (the title screen has none): the flag is the only honest answer
  return !!player.perkFlags?.[keystoneId === 'doubled_grasp' ? 'doubleGrip' : keystoneId];
}

/**
 * Why this loadout is not available, in a sentence, or null when it is.
 *
 * Called by the builder for every row, so every greyed option says what it is waiting for — a
 * greyed row with no reason is the one answer a player cannot act on.
 */
export function loadoutRefusal(loadout, { player = null, forest = null } = {}) {
  if (!loadout) return 'No loadout.';
  if (!loadout.needsPerk) return null;
  if (hasKeystone(player, loadout.needsPerk, forest)) return null;
  return loadout.needsPerk === 'doubled_grasp'
    ? 'Two two-handers needs the Doubled Grasp keystone, at the end of the melee arm of the Perks forest.'
    : `This one needs the ${String(loadout.needsPerk).replace(/_/g, ' ')} perk.`;
}

/** The loadout a build is currently on, out of the data file. */
export function loadoutOf(build, data) {
  return (data?.loadouts || []).find(l => l.id === build?.loadout) || (data?.loadouts || [])[0] || null;
}

// ---------------------------------------------------------------------------- installing it

/**
 * Turn a build into a class the rest of the game already knows how to read.
 *
 * Mutates the three loaded data objects in place and returns the synthetic class def. Safe to run
 * more than once — a second call replaces the first, which is what the builder does on every edit
 * and what a load does when it re-installs a saved build.
 */
export function installCustomClass({
  classData = null, skillData = null, classLooks = null, data = null, build = null, name = null,
} = {}) {
  if (!classData || !skillData || !build || !data) return null;
  const id = data.custom?.id || 'custom';
  const loadout = loadoutOf(build, data);
  const spells = (build.spells || []).map(s => s || null);

  /**
   * R20 — AN EMPTY SLOT STAYS EMPTY, AND THAT IS NOW THE NORMAL CASE.
   *
   * This used to fall back to the cheapest spell of the slot's own tier, on the grounds that the
   * builder would never let you start with an empty one. It will now: five of the six are empty
   * for every new character, and a fallback here would silently HAND the player four spells they
   * never chose the moment they hit level 3 — the choice would be made for them and nothing would
   * say so.
   *
   * `createSkillBar` takes a null id as a real, explainable empty slot (see js/skills.js `fill`),
   * so nothing downstream needs a spell to point at.
   */
  const filled = spells.map(s => s || null);

  const companion = build.opening?.kind === 'companion'
    ? (data.opening?.companions || []).find(c => c.id === build.opening.companion) || null
    : null;

  const def = {
    id,
    name: build.name || data.custom?.name || 'Freelance',
    role: data.custom?.role || 'Built to order',
    hook: data.custom?.hook || '',
    primaryAttr: data.custom?.primaryAttr || 'STR',
    armorTier: loadout?.armour || 'medium',
    weapons: loadout?.weapons || ['sword'],
    starter: loadout?.main || 'sword',
    startingArmour: [...(data.armour?.[loadout?.armour || 'medium'] || [])],
    shield: !!(loadout?.offArmour && String(loadout.offArmour).includes('shield')),
    skills: filled,
    look: (classLooks?.classes?.[build.look || data.custom?.baseLook]?.avatar) || null,
    sample: build.name || 'Freelance',
    /**
     * `pet` is read by js/main.js the moment the world is built, so a chosen companion needs no
     * hook of its own — it is the same field every preset class with a companion already carries.
     */
    pet: companion ? { id: companion.id, count: companion.count || 1, verb: 'is followed by' } : null,
    /** Everything the opening kit needs, carried on the class so one hook can find it. */
    build: { ...build, custom: true },
  };

  const list = classData.classes;
  const at = list.findIndex(c => c.id === id);
  if (at >= 0) list[at] = def; else list.push(def);
  skillData.classes[id] = filled;
  if (classLooks?.classes) {
    /**
     * The borrowed entry, NAME AND ALL.
     *
     * `js/newgame.js` falls back to `classLooks.classes[classId].name` when the player has not
     * typed a character name, so overwriting it with the build's name would call an unnamed custom
     * character "Freelance" — which is the name of their CLASS, not of a person. The borrowed
     * class's sample person is the right fallback and costs nothing to keep.
     */
    const base = classLooks.classes[build.look] || classLooks.classes[data.custom?.baseLook] || null;
    classLooks.classes[id] = base ? { ...base } : { name: 'Wayfarer', avatar: null, race: 'human' };
  }
  return def;
}

/** Take the synthetic class back out again — used when the player backs out of the builder. */
export function removeCustomClass({ classData, skillData, classLooks, data } = {}) {
  const id = data?.custom?.id || 'custom';
  if (classData?.classes) {
    const at = classData.classes.findIndex(c => c.id === id);
    if (at >= 0) classData.classes.splice(at, 1);
  }
  if (skillData?.classes) delete skillData.classes[id];
  if (classLooks?.classes) delete classLooks.classes[id];
}

// ---------------------------------------------------------------------------- the opening kit

/**
 * THREE THINGS OF MAGIC QUALITY OR BETTER, AND SOME MONEY.
 *
 *   "…or, for the solo players, start with a bonus crate that gives you 3 magic or better items
 *    plus some starting gold."
 *
 * Rolled through `rpg.rollDrop` — the same path every chest, every drop and every crafted item in
 * the game comes down — with `chance: 1` so it never rolls a blank and `floor: 'magic'` so the
 * promise is a promise. `lift` is a rarity boost on top, which is what makes the crate feel like a
 * crate: about a quarter of the time one of the three comes out rare or better.
 */
export function rollStartingCrate({ rpg, spec = null, level = 1, rng = null } = {}) {
  const S = spec || { count: 3, floor: 'magic', lift: 0.28 };
  const roll = rng || rpg?.rng || Math.random;
  const out = [];
  for (let i = 0; i < (S.count ?? 3); i++) {
    const item = rpg.rollDrop({
      level, rng: roll, chance: 1, floor: S.floor || 'magic',
      rarityBoost: 1 + (S.lift ?? 0),
    });
    if (item) out.push(item);
  }
  return out;
}

/** Is this item at or above a rarity? The crate's own promise, as a function the tests can call. */
export function atLeastRarity(item, floor = 'magic') {
  const a = RARITY_LADDER.indexOf(item?.rarity || 'normal');
  const b = RARITY_LADDER.indexOf(floor);
  return a >= 0 && b >= 0 && a >= b;
}

/**
 * The one hook js/main.js needs for the whole of the custom class, run once on a new game.
 *
 * Everything a preset class does — starter weapon, armour, companion — already happens above it in
 * `begin()`, because the build was installed AS a class. What is left is the three things a class
 * def has no field for: the second weapon a dual loadout wants, the element a branded caster was
 * attuned to, and the crate.
 */
export function applyOpeningKit({ player, rpg, classDef = null, data = null, log = null } = {}) {
  const build = classDef?.build;
  if (!player || !rpg || !build?.custom) return { ok: false, why: 'not a custom class' };
  if (build.granted) return { ok: false, why: 'already granted' };
  const loadout = loadoutOf(build, data);
  const given = { offhand: null, items: [], gold: 0, element: null };

  /**
   * THE OFF HAND.
   *
   * `classDef.startingArmour` covers a shield, a focus or a quiver, because those are armour bases
   * and main.js equips every one of them. A second WEAPON is not armour, so it lands here — and it
   * goes in through `rpg.equip` like anything else, which means `offhandRefusal` decides whether it
   * is allowed. Two two-handers is therefore gated in exactly one place for both the builder and
   * the game: the keystone, or the off hand stays empty and the weapon goes in the bag.
   */
  if (loadout?.off) {
    const second = attuneWeapon(rpg.loot.generate(loadout.off, 'normal', 'low', { rng: rpg.rng }));
    if (second) {
      player.bag.push(second);
      rpg.equip(player, second, { into: 'offhand' });
      given.offhand = second;
    }
  }
  if (loadout?.offArmour) {
    const piece = attuneWeapon(rpg.loot.generate(loadout.offArmour, 'normal', 'low', { rng: rpg.rng }));
    if (piece) rpg.equip(player, piece, { force: true });
  }

  /**
   * THE ELEMENT.
   *
   * `rpg.attuneWeapon` picks a caster's element off a hash of its id unless the item carries a
   * `brand`, which is how the crafting bench forces one. The starter is generated and attuned by
   * main.js before this runs, so the brand is written on and the attunement redone — clearing
   * `castElement` first, because `attuneWeapon` leaves an already-attuned weapon alone.
   */
  if (build.element && loadout?.element) {
    const weapon = player.equipment?.weapon;
    if (weapon) {
      weapon.brand = build.element;
      weapon.castElement = null;
      attuneWeapon(weapon);
      /**
       * R18 — fall back to the BRAND, because one weapon on this loadout's list never attunes.
       *
       * A quarterstaff is deliberately not a caster (see `attuneWeapon`), so `attuneWeapon` leaves
       * its `castElement` null however it got here — and this loadout lists `quarterstaff` among
       * its weapons. `elementOf()` and `describeWeapon` both read `brand` before `castElement`, so
       * the damage IS the element the player chose; only this summary line was losing it.
       */
      given.element = weapon.castElement || weapon.brand || null;
    }
  }

  // …and the crate, for anyone who chose it over a companion
  if (build.opening?.kind === 'crate') {
    const spec = data?.opening?.crate || {};
    given.items = rollStartingCrate({ rpg, spec, level: player.level || 1 });
    for (const item of given.items) player.bag.push(item);
    given.gold = spec.gold ?? 450;
    player.gold = (player.gold || 0) + given.gold;
  }

  build.granted = true;
  // the build travels on the player from here on, because that is what js/save.js carries
  player.build = build;
  if (log) {
    if (given.items.length) log(`A sealed chest was waiting for you: ${given.items.map(i => i.name).join(', ')}, and ${given.gold} gold.`, 'good');
    if (given.offhand) log(`${given.offhand.name} goes in your off hand.`, '');
  }
  return { ok: true, ...given };
}

/**
 * A custom build, in words, for the class card and the Followers screen.
 */
export function describeBuild(build, cat, data, { level = 1 } = {}) {
  const loadout = loadoutOf(build, data);
  const el = (data?.elements || []).find(e => e.key === build?.element);
  const picked = (build?.spells || []).filter(Boolean).length;
  const pending = pendingPicks(build, cat, level);
  const opening = build?.opening?.kind === 'companion'
    ? (data?.opening?.companions || []).find(c => c.id === build.opening.companion)?.name || 'a companion'
    : (data?.opening?.crate?.name || 'a sealed chest');
  return {
    name: build?.name || 'Freelance',
    loadout: loadout?.name || '—',
    element: el ? el.name : null,
    picked, total: PICK_COUNT, pending,
    opening,
    spells: (build?.spells || []).map((id, i) => {
      const at = cat?.unlockAt?.[i] ?? 1;
      return {
        level: at,
        name: id ? (cat?.byId?.get(id)?.name || id) : null,
        // an empty slot is either one you are owed RIGHT NOW or one that has not come due yet,
        // and those read very differently on a card
        pending: !id && level >= at,
      };
    }),
  };
}

/** Everything that is still missing before this build can start a run. */
export function buildRefusal(build, cat, data) {
  if (!build) return 'No build.';
  if (!loadoutOf(build, data)) return 'Pick a loadout.';
  /**
   * R20 — ONE SPELL, NOT SIX.
   *
   * This used to refuse until all six slots were full, which was the creator asking a level-1
   * character to plan a level-24 build out of forty spells they have never cast. The other five
   * are chosen at the level they open at, from the character sheet — so the only thing that has
   * to be settled before the first morning is what you walk out of the gate holding.
   */
  if (!(build.spells || [])[0]) return 'Pick the spell you start with. The other 5 spells are chosen at levels 3, 6, 12, 18 and 24.';
  if (build.opening?.kind === 'companion' && !build.opening.companion) return 'Pick which companion comes with you.';
  const loadout = loadoutOf(build, data);
  if (loadout?.element && !build.element) return 'Pick which element your caster is attuned to.';
  return null;
}
