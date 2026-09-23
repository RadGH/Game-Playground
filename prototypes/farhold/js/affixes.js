// Farhold — what an affix is actually worth, and when it is allowed to appear.
//
// The play-test note that produced this file:
//
//   "0.1% critical chance on the first hit against a target… 0.1% experience… 0.1% critical damage…
//    0% Critical chance… Skills come back 0% sooner… 1993% damage to the undead… 0.1% better loot."
//
// Every one of those is the same defect wearing a different hat: **the data and the engine disagree
// about what the number means.**
//
// Emberveil's `items.json` is a turn-based game's item file, and it is not consistent with itself.
// Some percentages are stored as a fraction (`critChance: 0.02–0.1` meaning 2–10%), some as a plain
// percentage (`dmg_vs_undead: 8–20` meaning +8–20%). Farhold's own two consumers are each internally
// consistent and each picked a different side:
//
//   * the plain stats in `STAT_FIELDS` are read as **percent numbers** — `rng() * 100 < critChance`,
//     `xpFind / 100`, `critDamage / 100`. Hand them 0.02 and you get a two-hundredth of a percent,
//     and the card prints "0% critical chance".
//   * the `cond_*` effects are read as **fractions** — `1 + v`, `1 - v`. Hand them 19.93 and you get
//     "+1993% damage to the undead", which is exactly what turned up.
//
// So this module does two jobs, in this order:
//
//   1. **Units.** Every affix is restated in the unit its own consumer reads, once, at load.
//   2. **Balance.** With the units fixed, the ranges are retuned to the floors the play-test asked
//      for — nothing that can roll to nothing, a real number at level 1, and a ceiling on the
//      conditionals that were multiplying out of control.
//
// On top of that sits **item level**, which is the thing that lets low-level rolls be meaty without
// high-level rolls being flat:
//
//   * every piece of gear carries an `ilvl`;
//   * an affix has a `minIlvl` — damage from 1, crit from 3, the "first hit against a target"
//     conditionals from 8 — so early gear has fewer, simpler, still-punchy properties;
//   * an affix rolls inside a **tier** chosen by the item's level, so the same `crit_chance` is
//     +6–9% on a level-4 dagger and +14–20% on a level-40 one.
//
//   import { tuneAffixData, rollAffixValue, itemLevelFor, affixAllowed } from './affixes.js';
//   tuneAffixData(items);                       // once, at boot, before anything reads the tables
//   const ilvl = itemLevelFor(playerLevel, 'rare', rng);
//   const v = rollAffixValue(affixDef, ilvl, rng);
//
// Pure data and arithmetic — no DOM, no Three.js — so the node tests drive the same code the game
// does.

// ---------------------------------------------------------------------------- units

/**
 * What each consumer reads. `pct` is a percentage point (5 means 5%), `frac` is a multiplier share
 * (0.05 means 5%), `flat` is a raw number of health, mana, armour or seconds.
 *
 * This table is the authority. When a value looks wrong on a card, the question is always "which of
 * these three is it, and does the reader agree" — not "what number shall we put here".
 */
export const ENGINE_UNIT = {
  // plain stats, read as percentage points
  critChance: 'pct', critDamage: 'pct', dodge: 'pct', hit: 'pct', lifeSteal: 'pct', manaSteal: 'pct',
  magicFind: 'pct', goldFind: 'pct', xpFind: 'pct', cooldownReduction: 'pct', block_chance: 'pct',
  initiative: 'pct',
  // plain stats, read as a raw amount
  hp: 'flat', mp: 'flat', armor: 'flat', magicResist: 'flat', dmg: 'flat', hpRegen: 'flat',
  mana_regen: 'flat', str: 'flat', dex: 'flat', int: 'flat', con: 'flat',
  block_power: 'flat', barrier: 'flat', barrierRegen: 'flat',
  /**
   * R18 — `spellPower` WAS FILED `flat` AND BOTH READERS TREAT IT AS A SHARE.
   *
   * `js/rpg.js`'s `amount *= 1 + a.spellPower` and `js/skills.js`'s `1 + (d.spellPower || 0)` are
   * the only two consumers and both want a fraction. Filing it `flat` let the writers grant POINTS:
   * `AFFIX_TUNING.potency` was retuned to `{min:3, max:8}` under a comment claiming "spell power is
   * read flat here, not as a share", which was simply false, and the perk arm granted 4/10/14 on
   * top. A level-3 mage with one +4 node had `spellPower = 4`, so every spell and every elemental
   * hit did FIVE TIMES damage; four arcane nodes was x33. Measured: a physical hit of 5 against a
   * fire hit of 41 from a single +8 potency ring.
   *
   * The user's ruling: "Potency/spellpower should be a percentage modifier that applies to spells."
   * So the readers were right all along and every writer moves. `frac` also makes `convert()`
   * self-correcting from here on — anything above `MAX_SENSIBLE_FRAC` is divided by 100.
   */
  spellPower: 'frac',
  // conditionals, read as a multiplier share (`1 + v`, `1 - v`)
  cond_fireDmgVsPoisoned: 'frac', cond_coldDmgVsBurning: 'frac', cond_lightningVsSlowed: 'frac',
  cond_poisonDmgVsBurning: 'frac', cond_magicDmgVsAnyStatus: 'frac', cond_dmgBelowHpThresh: 'frac',
  cond_consecutiveHitDmg: 'frac', cond_critArmorPen: 'frac', cond_dotDmgReduce: 'frac',
  cond_physDmgReducePct: 'frac', cond_magicDmgReducePct: 'frac', cond_executeDmgPct: 'frac',
  cond_dmgVsUndead: 'frac', cond_dmgVsDemon: 'frac', cond_goldOnEliteKill: 'frac',
  cond_sustainedDmgBonus: 'frac', cond_manaShieldOnHit: 'frac', cond_killInitBonus: 'frac',
  cond_speedOnFirstHit: 'frac', cond_poisonStackPower: 'frac', cond_cheatDeath: 'frac',
  // conditionals, read as a raw amount
  cond_ambushDmgFlat: 'flat', cond_combatStartBarrier: 'flat', cond_hpOnKill: 'flat',
  cond_partyHpOnKill: 'flat', cond_thornsFlat: 'flat', cond_manaOnAttack: 'flat',
  cond_manaOnCrit: 'flat', cond_lowManaRegenBonus: 'flat', cond_skillMpCostReduce: 'flat',
  cond_burnExtend: 'flat', cond_bleedOnCrit: 'flat', cond_afterSkillSpellPow: 'flat',
  // conditionals, read as a percentage point (it is added straight to a percent stat)
  cond_firstHitCritBonus: 'pct',
  cond_levelReqReduce: 'flat',
  // flags — present or absent, the value is ignored
  cond_extraSetPiece: 'flag', cond_setThresholdReduce: 'flag',
  // round 6: the light, mount and quiver slots' own properties (js/gear.js)
  cond_lightRange: 'flat', cond_lightBase: 'flat', cond_lightReveal: 'flat',
  cond_lightSteady: 'frac', cond_lightWard: 'frac',
  cond_mountSpeed: 'flat', cond_mountBase: 'flat', cond_mountWind: 'flat',
  cond_mountStamina: 'flat', cond_mountTrample: 'flat',
  cond_mountSlope: 'frac', cond_mountCalm: 'frac',
  cond_quiverDamage: 'flat', cond_quiverSplit: 'flat', cond_quiverHoming: 'flat',
  cond_quiverBurst: 'flat', cond_quiverElement: 'flag',
};

/**
 * A hard ceiling per stat, applied to a roll AND to anything crafting does to it afterwards.
 *
 * "1993% damage to the undead… that should cap out around 250% tops and that is still extreme."
 * The cap is in engine units, so a `frac` stat capped at 2.5 reads as +250% on the card. Tempering
 * an item repeatedly used to walk a conditional straight past any sane number, because nothing was
 * watching the result.
 */
export const AFFIX_CAP = {
  critChance: 60, critDamage: 250, dodge: 45, hit: 60, lifeSteal: 25, manaSteal: 25,
  magicFind: 300, goldFind: 300, xpFind: 100, cooldownReduction: 50, block_chance: 65,
  // `initiative` is multiplied by INITIATIVE_PER_POINT (4) before it is shown, so a cap of 15
  // reads as +60% attack speed — which is already the most anything should give.
  initiative: 15, cond_firstHitCritBonus: 40,
  cond_dmgVsUndead: 2.5, cond_dmgVsDemon: 2.5, cond_executeDmgPct: 2.5, cond_dmgBelowHpThresh: 2.5,
  cond_fireDmgVsPoisoned: 2.5, cond_coldDmgVsBurning: 2.5, cond_lightningVsSlowed: 2.5,
  cond_poisonDmgVsBurning: 2.5, cond_magicDmgVsAnyStatus: 2.5, cond_sustainedDmgBonus: 2.0,
  cond_consecutiveHitDmg: 0.5, cond_critArmorPen: 0.75, cond_dotDmgReduce: 0.6,
  cond_physDmgReducePct: 0.5, cond_magicDmgReducePct: 0.5, cond_manaShieldOnHit: 0.5,
  cond_goldOnEliteKill: 3, cond_killInitBonus: 0.6, cond_speedOnFirstHit: 0.5,
  cond_poisonStackPower: 1.5, cond_levelReqReduce: 12,
  // R18 — spellPower had no cap at all while it was (wrongly) flat. As a share, +150% from gear is
  // the ceiling; the perk arm stacks on top of this.
  spellPower: 1.5,
  cond_lightRange: 60, cond_lightSteady: 0.6, cond_lightWard: 0.5, cond_lightReveal: 90,
  cond_mountSlope: 0.7, cond_mountCalm: 0.8, cond_mountStamina: 60, cond_mountTrample: 60,
  cond_quiverDamage: 40, cond_quiverSplit: 4, cond_quiverBurst: 6,
};

// ---------------------------------------------------------------------------- the balance table

/**
 * The retune, in engine units, at **item level 1**. `AFFIX_TIERS` below grows these with the item.
 *
 *   min / max   the level-1 roll. Nothing here can roll to nothing.
 *   ilvl        the lowest item level this affix may appear on at all.
 *   slots       when present, the ONLY slots it may appear on.
 *   growth      how much of the level-1 range the top tier adds, as a multiplier (default 3).
 *
 * Where a row's numbers look unremarkable, that is the point: they are the same properties the data
 * always had, restated in the unit their reader uses, with a floor under them.
 */
export const AFFIX_TUNING = {
  // ---- attributes and raw stats: flat, already sane, floors only
  of_str: { min: 2, max: 5, ilvl: 1, growth: 4.5 },
  of_dex: { min: 2, max: 5, ilvl: 1, growth: 4.5 },
  of_int: { min: 2, max: 5, ilvl: 1, growth: 4.5 },
  of_con: { min: 2, max: 5, ilvl: 1, growth: 4.5 },
  // "Plain damage, minimum damage, maximum damage; these are the best stats especially for a
  // weapon." So damage and the attributes get a steeper `growth` than anything else: they are what
  // a level-45 weapon should be carrying, not a conditional.
  sharp: { min: 2, max: 5, ilvl: 1, growth: 6 },
  sturdy: { min: 2, max: 5, ilvl: 1, growth: 5 },
  of_hp: { min: 8, max: 22, ilvl: 1, growth: 5 },
  of_mp: { min: 6, max: 16, ilvl: 1 },
  of_magic_resist: { min: 3, max: 9, ilvl: 1 },
  of_mana_regen: { min: 0.6, max: 1.6, ilvl: 2 },
  hp_regen: { min: 2, max: 8, ilvl: 2 },
  // R18 — a SHARE, per the user's ruling. items.json's own 0.05-0.15 is the same unit; this row
  // stretches the top a little so a high-ilvl roll is worth finding.
  potency: { min: 0.05, max: 0.18, ilvl: 3 },

  // ---- percentages that were stored as fractions. ×100, then floored.
  crit_chance: { min: 4, max: 9, ilvl: 3 },           // was 0.02–0.1 → "0% critical chance"
  crit_damage: { min: 12, max: 25, ilvl: 3 },         // was 0.1–0.35 → "0.1% critical damage"
  of_hit: { min: 4, max: 10, ilvl: 1 },
  of_dodge: { min: 3, max: 7, ilvl: 2 },
  of_speed: { min: 1.5, max: 3.5, ilvl: 2, growth: 2 },  // shown x4 as attack speed
  lifeSteal: { min: 3, max: 8, ilvl: 5 },
  manaSteal: { min: 3, max: 8, ilvl: 5 },
  of_gold: { min: 10, max: 25, ilvl: 1 },
  xp_gain: { min: 5, max: 12, ilvl: 4, slots: ['head'] },     // "exp should probably have a minimum of 5%"
  magic_find_adv: { min: 20, max: 35, ilvl: 4 },              // "better loot… should start around 20%"
  cdr: { min: 5, max: 12, ilvl: 6 },                          // was 0.05–0.15 → "skills come back 0% sooner"

  // ---- shields
  block_chance: { min: 6, max: 15, ilvl: 1 },
  block_power: { min: 12, max: 50, ilvl: 1 },
  shield_magic_resist: { min: 6, max: 16, ilvl: 1 },
  barrier_size: { min: 8, max: 32, ilvl: 3 },
  barrier_regen: { min: 2, max: 8, ilvl: 3 },

  // ---- conditionals stored as percentages, read as fractions. ÷100.
  dmg_vs_undead: { min: 0.15, max: 0.35, ilvl: 6 },   // was 8–20 read as 1+v → "+1993% damage"
  dmg_vs_demons: { min: 0.15, max: 0.35, ilvl: 6 },
  kill_rally: { min: 0.08, max: 0.16, ilvl: 8 },
  speed_on_hit: { min: 0.08, max: 0.18, ilvl: 8 },    // "the move speed on hit proc doesn't seem to work"
  poison_stack: { min: 0.2, max: 0.4, ilvl: 8 },

  // ---- conditionals already in fractions: floors, so none of them rolls to a rounding error
  fire_vs_poison: { min: 0.15, max: 0.3, ilvl: 8 },
  cold_vs_burn: { min: 0.15, max: 0.3, ilvl: 8 },
  lightning_vs_slow: { min: 0.15, max: 0.3, ilvl: 8 },
  poison_vs_burn: { min: 0.15, max: 0.3, ilvl: 8 },
  magic_vs_status: { min: 0.12, max: 0.26, ilvl: 8 },
  low_hp_dmg: { min: 0.15, max: 0.3, ilvl: 6 },
  focus_dmg: { min: 0.08, max: 0.16, ilvl: 8 },
  crit_armorpen: { min: 0.25, max: 0.45, ilvl: 8 },
  dot_resist: { min: 0.15, max: 0.3, ilvl: 6 },
  phys_dmg_reduce: { min: 0.08, max: 0.15, ilvl: 6 },
  magic_dmg_reduce: { min: 0.08, max: 0.15, ilvl: 6 },
  execute: { min: 0.2, max: 0.4, ilvl: 8 },
  sustained_dmg: { min: 0.1, max: 0.22, ilvl: 8 },
  mana_shield: { min: 0.12, max: 0.25, ilvl: 8 },
  gold_on_elite: { min: 0.15, max: 0.4, ilvl: 4 },

  // ---- the percentage conditional that reads as a percentage point
  first_hit_crit: { min: 12, max: 22, ilvl: 8 },      // "0.1%… should be more like 10-20% minimum"

  // ---- flat conditionals: already raw amounts, floors only
  ambush_bonus: { min: 8, max: 20, ilvl: 6 },
  combat_barrier: { min: 12, max: 32, ilvl: 8 },
  hp_on_kill: { min: 5, max: 15, ilvl: 4 },
  party_hp_on_kill: { min: 3, max: 8, ilvl: 8 },
  thorns_flat: { min: 4, max: 12, ilvl: 4 },
  mana_on_attack: { min: 1, max: 3, ilvl: 4 },
  mana_on_crit: { min: 2, max: 6, ilvl: 6 },
  low_mana_regen: { min: 0.5, max: 1.5, ilvl: 6 },
  skill_cost_reduce: { min: 1, max: 4, ilvl: 6 },
  burn_extend: { min: 1, max: 2.5, ilvl: 8 },
  bleed_on_crit: { min: 0.3, max: 0.6, ilvl: 8 },
  after_skill_sp: { min: 3, max: 8, ilvl: 8 },

  // ---- new in round 6: the requirement-lowering affix
  //
  // "There could be an affix that lowers the level requirement for an item, which should affect the
  // item itself without even being equipped as well as other items once you have it equipped." It
  // is the one affix worth reading on an item you cannot yet wear, which is why it is here at all.
  early_promise: { min: 2, max: 4, ilvl: 4, growth: 2.5 },

  // ---- the light, mount and quiver slots' own affixes (js/gear.js). Their `slots` come from
  // SLOT_AFFIXES rather than SLOT_RULES, because the module that invents them owns that fact.
  wide_beam: { min: 8, max: 20, ilvl: 1, slots: ['light'] },
  steady_flame: { min: 0.1, max: 0.25, ilvl: 3, slots: ['light'] },
  warding_light: { min: 0.1, max: 0.22, ilvl: 5, slots: ['light'] },
  seeking_light: { min: 12, max: 30, ilvl: 4, slots: ['light'] },
  surefoot: { min: 0.15, max: 0.35, ilvl: 1, slots: ['mount'] },
  longwind: { min: 6, max: 18, ilvl: 1, slots: ['mount'] },
  trample: { min: 4, max: 14, ilvl: 4, slots: ['mount'] },
  calm: { min: 0.15, max: 0.4, ilvl: 3, slots: ['mount'] },

  // ---- flags: the value is ignored, but they are the rarest thing in the pool
  set_piece_bonus: { min: 1, max: 1, ilvl: 10, growth: 1 },
  set_threshold_low: { min: 1, max: 1, ilvl: 10, growth: 1 },
  cheat_death: { min: 1, max: 1, ilvl: 12, growth: 1 },
};

/**
 * Slot rules beyond the ones in `AFFIX_TUNING`.
 *
 * "Experience can be tricky and should only come on certain slots like helm; other affixes should
 * have limited slots, while most should still be available on jewellery."
 *
 * The principle: the odd, conditional, build-defining properties live on the small slots you swap
 * often — rings, amulets, the light and the mount — plus the one piece each is thematically at home
 * on. Damage, armour and the attributes stay available everywhere, because they are the stats a
 * player should be able to find on anything.
 */
// The slot names are `items.json`'s own — head/chest/legs/hands/feet/necklace, not helm/gloves/boots.
export const JEWELLERY = ['ring', 'ring2', 'necklace', 'light', 'mount'];

export const SLOT_RULES = {
  xp_gain: ['head'],
  magic_find_adv: [...JEWELLERY, 'head'],
  gold_on_elite: [...JEWELLERY, 'head'],
  cdr: [...JEWELLERY, 'head'],
  first_hit_crit: [...JEWELLERY, 'weapon', 'offhand'],
  crit_armorpen: [...JEWELLERY, 'weapon'],
  execute: [...JEWELLERY, 'weapon'],
  ambush_bonus: [...JEWELLERY, 'weapon'],
  bleed_on_crit: [...JEWELLERY, 'weapon'],
  focus_dmg: [...JEWELLERY, 'weapon'],
  sustained_dmg: [...JEWELLERY, 'weapon'],
  dmg_vs_undead: [...JEWELLERY, 'weapon'],
  dmg_vs_demons: [...JEWELLERY, 'weapon'],
  kill_rally: [...JEWELLERY, 'feet'],
  speed_on_hit: [...JEWELLERY, 'feet'],
  combat_barrier: [...JEWELLERY, 'chest', 'offhand'],
  mana_shield: [...JEWELLERY, 'chest', 'offhand'],
  thorns_flat: [...JEWELLERY, 'chest', 'hands', 'offhand'],
  dot_resist: [...JEWELLERY, 'chest', 'head'],
  phys_dmg_reduce: [...JEWELLERY, 'chest', 'legs'],
  magic_dmg_reduce: [...JEWELLERY, 'chest', 'legs'],
  cheat_death: [...JEWELLERY],
  early_promise: [...JEWELLERY],
  set_piece_bonus: [...JEWELLERY],
  set_threshold_low: [...JEWELLERY],
  party_hp_on_kill: [...JEWELLERY],
  mana_on_attack: [...JEWELLERY, 'weapon'],
  mana_on_crit: [...JEWELLERY, 'weapon'],
  low_mana_regen: [...JEWELLERY],
  skill_cost_reduce: [...JEWELLERY, 'head'],
  after_skill_sp: [...JEWELLERY, 'weapon', 'offhand'],
  burn_extend: [...JEWELLERY, 'weapon'],
  poison_stack: [...JEWELLERY, 'weapon'],
  fire_vs_poison: [...JEWELLERY, 'weapon'],
  cold_vs_burn: [...JEWELLERY, 'weapon'],
  lightning_vs_slow: [...JEWELLERY, 'weapon'],
  poison_vs_burn: [...JEWELLERY, 'weapon'],
  magic_vs_status: [...JEWELLERY, 'weapon'],
  low_hp_dmg: [...JEWELLERY, 'chest', 'weapon'],
  hp_on_kill: [...JEWELLERY, 'hands', 'weapon'],
};

/**
 * Affixes Farhold adds that Emberveil's `items.json` does not carry.
 *
 * They are injected at load rather than written into the file, because that file is SHARED with
 * `prototypes/emberveil/`, which has its own effect registry and its own test that every affix in
 * it resolves. Adding a row there broke that test — correctly. Anything only this game understands
 * belongs here.
 */
export const FARHOLD_AFFIXES = [
  {
    id: 'early_promise', name: 'of Early Promise', stat: 'cond_levelReqReduce',
    min: 2, max: 4, extended: true,
  },
];

// ---------------------------------------------------------------------------- item level

/**
 * Tiers. An affix's range grows with the item it is on, so the same property is worth having at
 * level 2 and worth hunting at level 40 — "low levels should still have considerable numbers and
 * not like 0.1% crit chance, however higher level is significantly harder so requires stronger
 * gear".
 *
 * `at` is the item level the tier starts at; `mult` scales the level-1 range.
 */
export const AFFIX_TIERS = [
  { name: 'crude', at: 1, mult: 1 },
  { name: 'plain', at: 8, mult: 1.35 },
  { name: 'fine', at: 16, mult: 1.75 },
  { name: 'superior', at: 24, mult: 2.2 },
  { name: 'exquisite', at: 34, mult: 2.7 },
  { name: 'mythic', at: 44, mult: 3.3 },
];

/** Which tier an item level sits in. */
export function tierFor(ilvl = 1) {
  let best = AFFIX_TIERS[0];
  for (const t of AFFIX_TIERS) if (ilvl >= t.at) best = t;
  return best;
}

/**
 * The default `growth` for a stat.
 *
 * A flat stat scales freely — twenty more health at level 45 is fine. A **multiplicative** one does
 * not: `cond_critArmorPen` at the default growth reached "critical hits ignore 90% of armour" by the
 * top tier, and `initiative` reached "+90% attack speed", because a share of everything compounds
 * with all the other shares you are wearing. Fractions grow at little more than half the rate.
 */
export function defaultGrowth(stat) {
  return ENGINE_UNIT[stat] === 'frac' ? 1.7 : 3;
}

/** How much an affix on an item of this level is scaled by, never below 1. */
export function tierMult(ilvl = 1, growth = 3) {
  const t = tierFor(ilvl);
  // `growth` lets a row opt out (a flag grows not at all) or stretch further than the default
  const span = Math.max(0, t.mult - 1);
  return 1 + span * (growth / 3);
}

/**
 * The level of a dropped item. Gear is usually around the level of whatever dropped it, with the
 * better rarities pulling a little above — which is what makes a rare off a tough fight feel like a
 * find rather than a recolour.
 */
export function itemLevelFor(level = 1, rarity = 'normal', rng = Math.random) {
  const lift = { normal: 0, magic: 1, rare: 2, legendary: 3 }[rarity] ?? 0;
  const wobble = Math.floor(rng() * 3) - 1;              // −1 … +1
  return Math.max(1, Math.round(level + lift + wobble));
}

/** The character level needed to wear something of this item level. */
export function requirementFor(ilvl = 1) {
  return Math.max(1, Math.round(ilvl - 1));
}

// ---------------------------------------------------------------------------- rolling

/** Clamp a value to its stat's ceiling. Used on a roll and again after anything crafting does. */
export function capValue(stat, value) {
  const cap = AFFIX_CAP[stat];
  if (!Number.isFinite(cap)) return value;
  return Math.min(cap, value);
}

/**
 * Round a value the way its unit wants to be read: percentage points and raw amounts to one
 * decimal, fractions to two. Nothing should ever print "0.30000000000000004", and nothing that is
 * meant to be a real number should print as 0.
 */
export function roundFor(stat, value) {
  const unit = ENGINE_UNIT[stat];
  if (unit === 'flag') return 1;
  if (unit === 'frac') return Math.round(value * 100) / 100;
  return Math.round(value * 10) / 10;
}

/**
 * Roll one affix for an item of `ilvl`. The floor is the point: the bottom of the tier's range is
 * always a number worth reading, because an affix that can roll to nothing is a failed affix.
 */
export function rollAffixValue(def, ilvl = 1, rng = Math.random) {
  const tuning = AFFIX_TUNING[def.id];
  const growth = tuning?.growth ?? defaultGrowth(def.stat);
  const lo = tuning?.min ?? def.min ?? 1;
  const hi = tuning?.max ?? def.max ?? lo;
  const mult = tierMult(ilvl, growth);
  const value = (lo + rng() * Math.max(0, hi - lo)) * mult;
  return roundFor(def.stat, capValue(def.stat, Math.max(lo, value)));
}

/** Is this affix allowed on this slot, at this item level? */
export function affixAllowed(def, slot = null, ilvl = 99) {
  const tuning = AFFIX_TUNING[def.id];
  if (tuning && ilvl < (tuning.ilvl ?? 1)) return false;
  const slots = tuning?.slots || SLOT_RULES[def.id];
  if (slots && slot && !slots.includes(slot)) return false;
  return true;
}

// ---------------------------------------------------------------------------- applying the table

/**
 * Rewrite `items.json`'s affix tables in place, once, before anything reads them.
 *
 * In place rather than as a copy because `loot.js` holds the same object and every consumer — the
 * pool, the shop, the crafting bench, the uniques — reaches through it. Returns a small report so a
 * test can assert that every row was covered and nothing was left on the old units.
 */
export function tuneAffixData(items) {
  const groups = items?.affixes;
  if (!groups) return { tuned: 0, untuned: [] };
  let tuned = 0;
  const untuned = [];
  for (const list of Object.values(groups)) {
    for (const def of list) {
      const t = AFFIX_TUNING[def.id];
      if (!t) { untuned.push(def.id); continue; }
      def.min = t.min;
      def.max = t.max;
      def.minIlvl = t.ilvl ?? 1;
      def.growth = t.growth ?? defaultGrowth(def.stat);
      if (t.slots || SLOT_RULES[def.id]) def.onlySlots = t.slots || SLOT_RULES[def.id];
      tuned++;
    }
  }
  // Uniques and set pieces carry their own fixed and random affixes, written in the same mixed
  // units. They get the same treatment: a value in the wrong unit is wrong wherever it is written.
  for (const u of items.uniques || []) {
    for (const f of u.fixedAffixes || []) fixUnit(f);
    for (const r of u.randomAffixes || []) fixRange(r);
  }
  for (const set of items.sets || []) {
    for (const piece of set.items || set.pieces || []) {
      for (const f of piece.fixedAffixes || []) fixUnit(f);
      for (const r of piece.randomAffixes || []) fixRange(r);
    }
    // A set's partial bonuses are a bare `{ stat: value }` map — the same mixed units, and the
    // thing that was printing "int +7, cooldownReduction +0.05" at the player.
    for (const table of Object.values(set.partialBonuses || {})) {
      for (const stat of Object.keys(table)) {
        table[stat] = roundFor(stat, capValue(stat, convert(stat, table[stat])));
      }
    }
  }
  return { tuned, untuned };
}

/**
 * A single fixed value on a unique or a set piece. There is no affix id to look up, so the unit is
 * decided by the stat and the magnitude: a `pct` stat carrying something under 1 was written as a
 * fraction, and a `frac` stat carrying something over 1 was written as a percentage.
 */
export function fixUnit(entry) {
  if (!entry || typeof entry.value !== 'number') return entry;
  entry.value = convert(entry.stat, entry.value);
  entry.value = roundFor(entry.stat, capValue(entry.stat, entry.value));
  return entry;
}

/** The same, for a `{ min, max }` random range. */
export function fixRange(entry) {
  if (!entry) return entry;
  if (typeof entry.min === 'number') entry.min = roundFor(entry.stat, capValue(entry.stat, convert(entry.stat, entry.min)));
  if (typeof entry.max === 'number') entry.max = roundFor(entry.stat, capValue(entry.stat, convert(entry.stat, entry.max)));
  if (typeof entry.min === 'number' && typeof entry.max === 'number' && entry.max < entry.min) entry.max = entry.min;
  return entry;
}

/**
 * Put one number into its engine unit.
 *
 * The magnitude test is safe here because the two units are two orders of magnitude apart and the
 * data has no legitimate values in between: a percentage stat is never a genuine 0.3%, and a
 * fraction stat is never a genuine 800% multiplier. `MIN_SENSIBLE_PCT` is where the line sits.
 */
export function convert(stat, value) {
  const unit = ENGINE_UNIT[stat];
  if (unit === 'flag') return 1;
  if (unit === 'pct' && value > 0 && value < MIN_SENSIBLE_PCT) return value * 100;
  if (unit === 'frac' && value > MAX_SENSIBLE_FRAC) return value / 100;
  return value;
}

/** Below this, a value claiming to be a percentage was written as a fraction. */
export const MIN_SENSIBLE_PCT = 1;
/** Above this, a value claiming to be a fraction was written as a percentage. */
export const MAX_SENSIBLE_FRAC = 3;
