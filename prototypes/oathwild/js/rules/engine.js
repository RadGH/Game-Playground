// Oathwild — the rules engine: one object every other rules module is handed. Pure.
//
//   const rules = createRules(data, { seed })     data = js/rules/data.js loadRulesData(…)
//   rules.rpg        Farhold's Rpg (sheet maths, strike, enemies, item generator) on Oathwild's balance
//   rules.data       every data file by key (see data.js)
//   rules.statuses   Farhold's status table with Oathwild's display rows laid over it (data/auras.json)
//   rules.spells     the spell catalogue, every row normalised (js/rules/spells.js)
//   rules.rng        a seeded generator (never Math.random — tests/rules/purity.test.mjs)

import { Rpg, makeRng } from './farhold.js';
import { buildCatalog } from './spells.js';
import { finishCaster } from './casters.js';
import { empower, armourKindFor } from './gear-power.js';

const strip = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));

export function createRules(data, { seed = 1 } = {}) {
  // Farhold's balance with Oathwild's player overrides (attributes.json farholdPlayer), in memory only
  const balance = structuredClone(data.balance);
  balance.player = { ...balance.player, ...strip(data.attributes.farholdPlayer) };
  balance.enemies = { ...balance.enemies, ...strip(data.combat.farholdEnemies) };
  const rpg = new Rpg(data.items, balance);

  // statuses: Farhold's rows plus Oathwild's extra rows and display fields (auras.json)
  const statuses = structuredClone(data.skills.statuses);
  for (const [id, row] of Object.entries(data.auras?.statuses || {})) {
    statuses[id] = { ...(statuses[id] || {}), ...strip(row) };
  }

  const rules = { data, rpg, balance, statuses, rng: makeRng(seed), seed };
  rules.spells = buildCatalog(rules);
  // every item made anywhere (loot, shops, quest rewards, a starting kit) comes out of this one maker: a magic one
  // leaves it with its element, its wand / tome / staff style or its off-hand rider (js/rules/casters.js).
  // `raw: true` skips that (a named caster sets its element and style first).
  const generate = rpg.loot.generate.bind(rpg.loot);
  // gear power (js/rules/gear-power.js, owner 2026-11-27 "upgrades like d2"): item level grows the base, rarity adds
  // enhanced damage / armour, and plate below its item level comes out as mail (#143) — on EVERY item, raw or not
  rpg.loot.generate = (baseKey, rarity, quality, opts = {}) => {
    const key = opts.ilvl ? armourKindFor(rules, baseKey, opts.ilvl) : baseKey;
    const it = empower(rules, generate(key, rarity, quality, opts));
    return it && !opts.raw ? finishCaster(rules, it) : it;
  };
  return rules;
}
