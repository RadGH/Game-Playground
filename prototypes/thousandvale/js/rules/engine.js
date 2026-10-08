// Thousandvale — one rules engine: Farhold's `Rpg` built over the loaded data, with the boot steps
// Farhold's main.js performs before its first fight (uniques and foci injected into the item table
// in memory, the combat and weapon knobs handed to their modules, an explicit level cap).
//
// One engine per server process is enough: `Rpg` holds the item tables and an `Effects` registry,
// and every fight call is passed its room's own rng. Rooms keep their mutable state in
// js/rules/room.js, never here.

import { buildProjectiles } from './projectiles.js';
import { buildCombatCfg } from './combat-cfg.js';
import { installAffixes } from './affixes.js';
import {
  Rpg, installUniques, installFoci, installWarbands, tuneFeel, tuneWeapons, setLevelCap, EFFECTS,
} from './farhold.js';
import { installLevelGap } from './level-gap.js';
import { installItemBuffs } from './buffs.js';
import { installTalentTrees } from './talents.js';
import { buildTvForest } from './perk-forest.js';
import { installLootPool, buildLootPool } from './loot-pool.js';
import { installTvSkills, installTvClasses } from './tv-skills.js';
import { buildCasterForms } from './caster-forms.js';
import { installTvGear, poolTvGear, attachTvGear, removeLights, removeSlotless, stripInert } from './tv-gear.js';
import { setKitSource } from './starter-kits.js';
import { createFishing } from './fishing.js';

/** The same describe hook main.js passes, so a unique's power text matches Farhold's tooltip. */
const EFFECTS_DESC = id => EFFECTS['legendary:' + id]?.desc?.() || null;

export const DEFAULT_LEVEL_CAP = 50;

/**
 * `data` is what js/rules/data.js `loadRulesData` returned (fresh objects — `items` is mutated).
 * `levelCap` is realm-wide: Farhold keeps it in one module variable (rpg.js `LEVEL_CAP`), so every
 * engine in a process must agree on it. createEngine sets it explicitly rather than trusting the
 * default.
 */
export function createEngine(data, { seed = 1, levelCap = DEFAULT_LEVEL_CAP, tvSkills = true, tvGear = true } = {}) {
  const { items, balance, skills, classes, enemies, talents, uniques, tools } = data;
  if (!items || !balance || !skills) throw new Error('createEngine: items, balance and skills are required');

  // main.js line ~299: Farhold's 184 uniques and the four foci, in memory, before anything reads items
  installUniques(items, uniques, { tools, describe: EFFECTS_DESC });
  installFoci(items, { describe: EFFECTS_DESC, balance });
  // play-test 5 (T23 + two missing bases): Thousandvale's own item bases and stream F's gear catalog, in memory, after
  // Farhold's foci are in (a catalog focus copies one) and before `Rpg` reads the table. Off for the parity fixtures.
  const gearReport = tvGear ? installTvGear(items, data.tvGear || null, data.gearCatalog || null) : null;
  // main.js line ~439: the combat and weapon knobs (both mutate module tables in place, idempotent)
  tuneFeel(balance.player?.combat);
  tuneWeapons(balance.player);
  setLevelCap(levelCap);

  // play-test 5 (T3, T4): Thousandvale's own skill rows and class lists (data/rules/skills-tv.json), in memory, BEFORE the
  // talent trees are rewritten — a parity engine keeps Farhold's table (`tvSkills: false`)
  // owner feedback 10 (Y32): Thousandvale's own classes (the Starcaller) — class row, six skills, skill list — first,
  // so the patch below, the talent policy and every audit see them like any other class
  const classReport = tvSkills ? installTvClasses(classes, skills, data.tvClasses || null) : null;
  const skillReport = tvSkills ? installTvSkills(skills, data.tvSkills || null) : null;
  // P6 — Thousandvale's talent trees (data/rules/talents.json), in memory, before any bar is built
  const talentReport = installTalentTrees(skills, data.tvTalents || {});
  const rpg = new Rpg(items, { ...balance, seed }, talents);
  // owner feedback 8 (W22): Farhold restates its affix table as `Rpg` boots (its light-only affixes and slot lists come
  // back), so the lights are taken out again AFTER it — nothing rolls on, or for, a carried light
  if (tvGear && gearReport) { gearReport.slotless = [...(gearReport.slotless || []), ...removeSlotless(items)]; { const more = stripInert(items); for (const k of ['uniques', 'sets', 'bases']) gearReport.inert[k].push(...more[k]); } const again = removeLights(items); gearReport.lights = { bases: [...gearReport.lights.bases, ...again.bases], uniques: [...gearReport.lights.uniques, ...again.uniques], affixes: [...gearReport.lights.affixes, ...again.affixes] }; }
  // P6 — Thousandvale's perk forest (data/rules/perks.json) replaces Farhold's in the engine's Rpg, so
  // Farhold's own perkBonuses / rpg.derive put every node's grants, flags and powers on the sheet
  const forest = data.tvPerks?.arms ? buildTvForest(data.tvPerks) : rpg.forest;
  rpg.forest = forest;
  const classList = classes?.classes || [];
  const bestiary = enemies || { enemies: [], bosses: [], modifiers: [] };
  // main.js line ~307: the five warbands (members + warlords) into the bestiary, in memory
  if (data.warbands) { installWarbands(bestiary, data.warbands); bestiary.warbands = data.warbands; }

  const engine = {
    rpg, items, balance,
    skillData: skills,
    statuses: skills.statuses || {},
    classes: classList,
    classById: id => classList.find(c => c.id === id) || null,
    bestiary,
    enemyDef: id => (bestiary.enemies || []).find(d => d.id === id) || (bestiary.bosses || []).find(d => d.id === id) || null,
    levelCap,
    mercenaries: data.mercenaries || null,
    encounters: data.encounters || { scripts: {}, specials: { families: {} }, defaults: {}, byType: {} },
    progression: data.progression || {},
    /** play-test 3 R2: Farhold's xp rules with Thousandvale's kill multiplier (data/rules/progression.json `xp`) */
    xpCfg: { ...(balance.xp || {}), kill: (balance.xp?.kill ?? 0.2) * (data.progression?.xp?.killMult ?? 1) },
    /**
     * owner feedback 8 (W4): the kill rules for a monster of `level` — low-level monsters pay more (progression.json
     * `xp.killEarly`: `mult` up to level `until`, fading to killMult at `fadeTo`). A parity engine replaces `xpCfg` with
     * Farhold's own and so never asks.
     */
    xpCfgFor(level) {
      const E = data.progression?.xp?.killEarly, base = data.progression?.xp?.killMult ?? 1;
      if (!E || !(E.mult > base) || this.xpCfg === balance.xp) return this.xpCfg;
      const L = Math.max(1, level | 0), a = E.until ?? 6, b = Math.max(a + 1, E.fadeTo ?? 14);
      const k = L <= a ? E.mult : L >= b ? base : E.mult + (base - E.mult) * (L - a) / (b - a);
      return { ...this.xpCfg, kill: (balance.xp?.kill ?? 0.2) * k };
    },
    /** quest / event experience multiplier (a share of a level's span x this) */
    xpMult: kind => data.progression?.xp?.[kind + 'Mult'] ?? 1,
    /** P26 — the level-gap softening (js/rules/level-gap.js); null turns it off (parity fixtures) */
    levelGap: data.progression?.levelGap || null,
    forest, talentReport, skillReport, gearReport, classReport,
  };
  installLevelGap(engine);
  installItemBuffs(engine);             // shop buffs: armour oil, hearty stew (js/rules/buffs.js)
  // play-test 4 S17/S18: every weapon family drops at low levels; themed second-tier armour from level 15
  const lootPool = buildLootPool(data.lootPool, items, balance);
  if (tvGear) poolTvGear(lootPool, items, data.tvGear || null, gearReport);          // the new bases drop from their first level
  installLootPool(engine, { pool: lootPool, tiers: data.armourTiers || null });
  // play-test 5: T17 conversion + the caster stamp on every new item (`engine.finishItem`), `engine.makeItem`
  if (tvGear) attachTvGear(engine, data.tvGear || null);
  // owner feedback 7 (V2): the gold formulas (js/rules/economy.js); a parity engine keeps Farhold's own gold
  engine.prices = tvGear ? (data.prices || null) : null;
  engine.guardsCfg = data.guards || null;                 // W1: stream E's guards.json (js/rules/guards.js)
  engine.crates = data.crates || null;                    // T9 / T20 (js/rules/crates.js)
  engine.kits = data.starterKits || null;                 // T5 (js/rules/starter-kits.js)
  setKitSource(engine, engine.kits);
  // T25 — angling: C's numbers + E's fish (absent = an empty water: junk only, never an error)
  engine.fishing = data.fishing ? createFishing(data.fishing, data.angling || null) : null;
  // play-test 5 (T14-T16): caster forms — how wands, staves, sceptres and foci attack (js/rules/caster-forms.js); off for parity
  engine.casterForms = tvGear ? buildCasterForms(data.casterForms || null) : null;
  // owner feedback 8 (W14, W2): slower, homing projectiles for skills, weapons and monsters; a parity engine keeps Farhold's
  engine.projectiles = tvGear ? buildProjectiles(data.projectiles || null) : null;
  // owner feedback 10: one swing = one number, attacks while moving, attack speed, walls, knock interrupts, dummies (js/rules/combat-cfg.js); off for parity
  engine.combatCfg = tvGear ? buildCombatCfg(data.combat || null) : null;
  installAffixes(engine, data.affixes || null);          // play-test 4 S4: champion / rare rolls, Pack-leader, affix specials
  return engine;
}
