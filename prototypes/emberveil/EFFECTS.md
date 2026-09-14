# Emberveil 2 — every effect, and where it lives

Claude-facing. This is the audit + reference for `js/effects.js`, the single registry that holds
every named gameplay effect in Emberveil 2: legendary powers, item affixes, skill/talent/upgrade
keys, status effects, champion and named-enemy modifiers, enemy-spell keys and boss-phase keys.

Source of truth for the audit: the original game at `~/claude/emberveil` (read-only) —
`src/game/legendaryEffects.js`, `affixes.js`, `uniques.js`, `sets.js`, `passives.js`,
`championModifiers.js`, `equipBonuses.js`, `statusEffects.js`, `statusTick.js`, `enemySpells.js`,
`bossPhases.js`, `skills.js`, `stats.js`, `formulas.js`, `items.js`, `companions.js`, `recipes.js`,
`fame.js`, and `src/ui/screens/CombatScreen.js`.

## Headline numbers

| | count |
|---|---|
| effect ids audited and registered | **359** |
| of those, ids that had **no working mechanic in the original** (data only, or a glyph with nothing behind it) | **176** |
| ids now implemented in Emberveil 2 | **359 (all)** |
| ids with a test that proves they change the game | **359 (all)** — `tests/effects.test.js` |
| not ported, on purpose | **2 systems** (see the bottom of this file) |

The original shipped a lot of effect *data* that nothing ever read: 99 of the 214 skill keys in
`skills.json`, 38 of the 40 `cond_*` affixes (only `cond_extraSetPiece` and `cond_legendaryEffect`
were wired), and 10 of the 26 status types were a glyph and a sentence with no mechanic behind
them. Emberveil 2 implements all of them.

## How the registry works

`js/effects.js` exports `EFFECTS`, keyed `<group>:<id>`. Each entry owns a plain-language
`desc(value)` (used by item tooltips and the skills tab) plus hook functions. Adding an effect
later is **one entry in that file** — nothing else changes.

Hook points, and who calls them:

| hook | called from | used by |
|---|---|---|
| `derive(v, d, hero)` | `rules.js` `derive()` | affixes that change a stat |
| `combatStart` / `roundStart` | `combat.js` constructor / `tickStatuses()` | fight-long setup, per-round ticks |
| `dmgOut` / `dmgIn` / `dmgFlat` / `critBonus` / `critArmorPen` | `combat.js` `applyDamage()` | conditional damage and crit modifiers |
| `onAttack` / `onHit` / `onCrit` / `onDamaged` / `onBlocked` / `onKill` / `preLethal` | `combat.js` `attack()`, `applyDamage()`, `kill()` | procs |
| `onCastDone` / `manaRegenMult` / `auraDmg` | `combat.js` `cast()`, `tickStatuses()`, `dmgBuffMult()` | cast-triggered and aura effects |
| `merge(v, skill, hero)` | `rules.js` `mergeSkill()` | upgrade keys that rewrite the skill |
| `gate` / `pickTargets` / `onCast` / `onBuff` / `dmgMult` / `armorPen` / `onHit` / `onEnd` | `combat.js` `usableSkills()`, `skillTargets()`, `cast()` | skill effect keys |
| status fields (`dot`, `heal`, `skip`, `hitMult`, `dealtMult`, `takenMult`, `initMult`, `extraActions`, `blockBonus`, `absorbNext`, `reflect`, `noSpells`, `noWeapon`, `noDodge`, `noExtra`, `drawsFire`, `share`, `armorReduce`, `wakesOnDamage`) | `combat.js` reads them straight off the registry | status effects |
| `spawn(unit)` | `game.js` via `applySpawnMods()` | champion and named-enemy modifiers |

Anything a player can see emits a combat event, so the damage meter and the 3D stage pick it up:
procs use `via: 'proc:<id>'`, `'legendary:<id>'`, `'affix:<id>'`, `'champion:<id>'`, `'status:<id>'`
or `'skill:<id>'`, carry a `label`, and pass a sensible `dtype` (`fire`, `cold`, `lightning`,
`holy`, `shadow`, `poison`, `arcane`, `physical`, `true`).

## Tests

`tests/effects.test.js` is table-driven: **one row per registry id**, and a coverage test fails if
any id has no row. Each row runs the same seeded fight twice — once with the effect attached and
once without — and asserts the two fights differ (events, HP/MP, statuses, buffs, cooldowns,
derived stats, gold). There are also tests that:

* every legendary / affix / set / unique id in `items.json` resolves to a registered effect (no orphans);
* every `skills.json` effect, talent and upgrade key resolves, as does every enemy-spell and boss-phase key;
* every `statusMeta` type has a real mechanic, not just a glyph — and every mechanic has a glyph;
* every effect id produces a readable plain-language line.

```
node --test prototypes/emberveil/tests/*.test.js      # 390 pass
npm run test:unit                                     # 471 pass
npx playwright test prototypes/emberveil              # 2 pass
```

## The table

### Legendary powers (unique items + set bonuses) (12)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `legendary:mage_missile_aoe` | Bolt spells bounce to a second enemy for 60% damage. | `combat.js` | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:crit_bleed_5` | Critical hits make the target bleed (3 rounds, 8 a round). | `effects.js` onCrit | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:low_mana_shockwave` | Casting below a quarter mana blasts every enemy (15 + half your INT). | `combat.js` | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:kill_party_heal` | Killing blows heal every ally for a tenth of the victim's max HP. | `effects.js` onKill | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:speed_combat_init` | +8 initiative for the whole fight. | `effects.js` combatStart | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:cheat_death_once` | Once a fight, a killing blow leaves you on 1 HP. | `effects.js` preLethal | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:burn_extend` | Burns you set last 2 rounds longer. | `effects.js` combatStart | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:mana_on_attack` | Every basic attack gives back 3 mana. | `effects.js` onHit | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:critical_armorpen` | Critical hits strip 30% of the target's armour for a round. | `effects.js` onCrit | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:rally_on_kill` | Killing an enemy rallies the whole party for a round. | `effects.js` onKill | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:echo_cast` | A quarter of your spells echo for half damage. | `combat.js` | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |
| `legendary:dragon_fury_breath` | Killing blows breathe fire over every other enemy and set them alight. | `effects.js` onKill | `legendaryEffects.js` LEGENDARY_HOOKS — working | done |

### Item affixes (72)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `affix:str` | +1 Strength | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:dex` | +1 Dexterity | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:int` | +1 Intelligence | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:con` | +1 Constitution | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:hp` | +1 max HP | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:mp` | +1 max mana | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:hit` | +1 to hit | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:dodge` | +1 dodge | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:initiative` | +1 initiative | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:dmg` | +1 weapon damage | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:armor` | +1 armour | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:goldFind` | +100% gold found | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:manaRegen` | +1 mana a round | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:mana_regen` | +1 mana a round | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:lifeSteal` | heals you for 1% of the damage you deal | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:manaSteal` | gives back 1% of the damage you deal as mana | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:magicResist` | +1 magic resistance | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:magic_resist` | +1 magic resistance | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:critChance` | +100% critical chance | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:crit_chance` | +100% critical chance | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:critDamage` | +100% critical damage | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:crit_damage` | +100% critical damage | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:spellPower` | +5% spell power | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:spell_power` | +5% spell power | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:magicFind` | +100% chance of better loot | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:magic_find` | +100% chance of better loot | `rules.js` derive() | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:xpFind` | +100% experience | `rules.js` derive() | `affixes.js` data only — **no mechanic existed** | done |
| `affix:block_chance` | +100% chance to block | `rules.js` derive() | `formulas.js` getCharacterBlockStats — working | done |
| `affix:block_power` | blocks 1 more damage | `rules.js` derive() | `formulas.js` getCharacterBlockStats — working | done |
| `affix:hpRegen` | +1 HP a round | `rules.js` derive() | `affixes.js` data only — **no mechanic existed** | done |
| `affix:hp_regen` | +1 HP a round | `rules.js` derive() | `affixes.js` data only — **no mechanic existed** | done |
| `affix:barrier` | start each fight with a 1 point barrier | `effects.js` derive, combatStart | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:barrierRegen` | your barrier rebuilds 1 points a round | `effects.js` derive | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:barrier_regen` | your barrier rebuilds 1 points a round | `effects.js` derive | `equipBonuses.js` STAT_TO_KEY — working | done |
| `affix:cooldownReduction` | skills come back 100% sooner | `effects.js` derive | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_fireDmgVsPoisoned` | +100% fire damage against poisoned enemies | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_coldDmgVsBurning` | +100% cold damage against burning enemies | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_lightningVsSlowed` | +100% lightning damage against slowed enemies | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_poisonDmgVsBurning` | +100% poison damage against burning enemies | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_magicDmgVsAnyStatus` | +100% magic damage against anything already suffering | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_burnExtend` | burns you set last 1 round longer | `effects.js` combatStart | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_poisonStackPower` | your poison hits 1 harder a round | `effects.js` combatStart | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_firstHitCritBonus` | +100% critical chance on your first hit of a fight | `effects.js` combatStart, critBonus, onHit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_dmgBelowHpThresh` | +100% damage while under a third of your health | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_consecutiveHitDmg` | +100% damage for each hit in a row on the same enemy (up to 5) | `effects.js` dmgOut, onHit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_killInitBonus` | +1 initiative for the rest of the fight after a kill | `effects.js` onKill | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_critArmorPen` | critical hits ignore 100% of armour | `effects.js` critArmorPen | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_afterSkillSpellPow` | +100% spell power for a round after you use a skill | `effects.js` onCastDone, roundStart | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_ambushDmgFlat` | +1 flat damage in the first round | `effects.js` dmgFlat | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_extraSetPiece` | counts as one extra piece of any set you wear | `loot.js` activeSets()/describe() | `sets.js` getActiveSets — working | done |
| `affix:cond_setThresholdReduce` | set bonuses need one piece fewer | `loot.js` activeSets()/describe() | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_dotDmgReduce` | burn, poison and bleed on you hurt 100% less | `effects.js` derive | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_thornsFlat` | returns 1 damage to anything that hits you | `effects.js` derive | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_physDmgReducePct` | 100% less damage from weapons | `effects.js` dmgIn | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_cheatDeath` | once a fight, a killing blow leaves you on 1 HP | `effects.js` preLethal | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_magicDmgReducePct` | 100% less damage from spells | `effects.js` dmgIn | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_combatStartBarrier` | start each fight behind a 1 point barrier | `effects.js` combatStart | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_manaOnAttack` | +1 mana whenever you hit something | `effects.js` onHit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_hpOnKill` | +1 HP on a kill | `effects.js` onKill | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_skillMpCostReduce` | skills cost 1 less mana | `effects.js` derive | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_lowManaRegenBonus` | +100% mana regeneration while low on mana | `effects.js` manaRegenMult | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_manaOnCrit` | +1 mana on a critical hit | `effects.js` onCrit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_partyHpOnKill` | your kills heal every ally 1 HP | `effects.js` onKill | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_dmgVsUndead` | +1% damage against the undead | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_dmgVsDemon` | +1% damage against demons | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_goldOnEliteKill` | +100% gold from champions, named enemies and bosses | `effects.js` onKill | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_sustainedDmgBonus` | +100% damage from the fourth round on | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_speedOnFirstHit` | +1 initiative once you land your first hit | `effects.js` onHit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_executeDmgPct` | +100% damage to enemies under a quarter health | `effects.js` dmgOut | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_manaShieldOnHit` | 100% of the damage you take comes out of mana instead | `effects.js` onDamaged | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_bleedOnCrit` | 100% chance to make a critical hit bleed | `effects.js` onCrit | `affixes.js` data only — **no mechanic existed** | done |
| `affix:cond_legendaryEffect` | carries a legendary power | `loot.js` activeSets()/describe() | `uniques.js` / `items.js` — carries the unique power | done |

### Skill / talent / upgrade keys (skills.json) (214)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `skill:aoe` | hits the whole group | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:damageMult` | deals 100% weapon damage | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:hits` | 1 hit | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:bolts` | 1 bolts | `combat.js` shotCount() | `skills.js` + CombatScreen — working | done |
| `skill:targets` | 1 targets | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:target` | aimed at party | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:duration` | lasts 1 round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:rounds` | lasts 1 round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:cooldown` | usable again after 1 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:mpCost` | costs 1 mana | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:damageCategory` | counts as magic damage | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:damageType` | fire damage | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:healStat` | healing scales with INT | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:damageStat` | damage scales with INT | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:strikeCount` | 1 strikes | `effects.js` merge → `effect.hits` | `skills.js` + CombatScreen — working | done |
| `skill:attackCount` | 1 attacks | `effects.js` merge | `skills.json` data only — **no mechanic existed** | done |
| `skill:glaiveCount` | 1 glaives, so everything it passes is hit 1 times | `effects.js` merge → `effect.hits` | `skills.json` data only — **no mechanic existed** | done |
| `skill:chainCount` | chains to 1 enemies | `effects.js` pickTargets | `skills.json` data only — **no mechanic existed** | done |
| `skill:chainTargets` | chains to 1 enemies | `effects.js` pickTargets (never below the shape's own reach) | `skills.js` + CombatScreen — working | done |
| `skill:chainTarget` | chains to 1 more | `effects.js` pickTargets | `skills.js` + CombatScreen — working | done |
| `skill:pullToGroup` | drags the target into the middle of its group, so the whole group is hit | `effects.js` pickTargets | `skills.json` data only — **no mechanic existed** | done |
| `skill:split` | the damage is split 1 ways | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:chainDmgScale` | each link of the chain keeps 100% of the damage | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:chainMult` | each link of the chain keeps 100% of the damage | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:aoeReduction` | extra targets take 100% of the damage | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:splash` | splashes 100% of the damage onto everything else | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:partySplash` | 100% of it washes over the rest of the party as healing | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:splashOnKill` | a kill splashes 100% of the damage onto everything else | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:excludeSelf` | helps everyone but you | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:selfFree` | casting it on yourself costs you no turn | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:firstStrike` | the party gets the jump on the enemy | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:neverMiss` | never misses | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:variance` | damage swings by 100% | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:varianceFloor` | never rolls below 100% damage | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:varianceCeiling` | can roll as high as 100% damage | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:bonusVsUndead` | +100% against the undead | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:bonusVsDemon` | +100% against demons | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:dmgBuffVsUndead` | +100% against the undead | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:dmgBuffVsDemon` | +100% against demons | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:burnVsUndead` | sets the undead alight on top of the damage | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:damageVsStatus` | +50% against marked | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:conditionBonus` | +100% against anything already suffering | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:sunderAmp` | +100% against sundered armour | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:dmgPerBleedStack` | +100% for every bleed on the target | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:dmgScaling` | up to +100% the more hurt you are | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:damageMultInt` | an extra 100% for every 20 Intelligence | `effects.js` dmgMult | `skills.json` data only — **no mechanic existed** | done |
| `skill:stackBonusPerDeath` | +100% for every enemy that has already fallen | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:corpseHpScale` | scales with the bodies on the floor (100% each) | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:executeThreshold` | finishes anything under 100% health | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:executeMult` | 1× damage on a finisher | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:executeChance` | 100% chance to finish a badly hurt enemy outright | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:critBonus` | +100% critical chance | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:critVsBleed` | +100% critical chance against bleeding enemies | `effects.js` critBonus | `skills.json` data only — **no mechanic existed** | done |
| `skill:critExtra` | a critical hit lands twice | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:armorPen` | ignores 100% armour | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:armorPenPct` | ignores 100% armour | `effects.js` armorPen | `skills.js` + CombatScreen — working | done |
| `skill:ignoreMR` | ignores magic resistance | `effects.js` armorPen | `skills.json` data only — **no mechanic existed** | done |
| `skill:magicPen` | ignores 100% magic resistance | `effects.js` armorPen | `skills.json` data only — **no mechanic existed** | done |
| `skill:mrPen` | ignores 100% magic resistance | `effects.js` armorPen | `skills.json` data only — **no mechanic existed** | done |
| `skill:dmg` | +1 flat damage | `effects.js` dmgFlat | `skills.js` + CombatScreen — working | done |
| `skill:dmgAmp` | the target takes 100% more damage afterwards | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:statusEffects` | applies burn (100%, 2 rounds) | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:stunChance` | 100% chance to stun | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:bleedChance` | 100% chance to cause bleeding | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:bleed` | causes bleeding for 2 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:slow` | slows for 2 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:freezeChance` | 100% chance to freeze | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:confuse` | 100% chance to confuse | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:skipTurnChance` | 100% chance the target loses its next turn | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:suppressAbilities` | stops the target casting anything | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:healingReduction` | healing on the target is 100% weaker | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:applyCurse` | curses the target | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:curseDuration` | the curse lasts 1 rounds | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:curseDur` | the curse lasts 1 rounds | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:cursePower` | the curse saps 1% of their strength | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:curseSpreadCount` | the curse jumps to 1 more enemies | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:dmgCurse` | the curse also eats away 1 HP a round | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:addCorruptionStack` | adds 1 stack of corruption | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:corruptionDetonate` | blows the corruption stacks off the target | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:detonateMult` | the blast hits 1× as hard | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:minDebuffs` | always lands at least 1 harmful effect | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:guaranteedDebuffPerStack` | each stack lands a harmful effect for certain | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:randomStatus` | lands a random harmful effect | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:randomStatusChance` | 100% chance of a random harmful effect | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:randomStatusDuration` | random effects last 1 rounds | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:randomStatusRolls` | rolls 1 random effects | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:randomStatusRollChance` | each roll has a 100% chance | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:randomElement` | strikes with a random element | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:elementalStatus` | leaves behind the spell's own element | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:elementStatusGuaranteed` | the element always takes hold | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:elementStatusMult` | element effects bite 1× as hard | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:onHitStatus` | your attacks apply burn for a while | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:burnDmgMult` | your burns hurt 1× as much | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:burnMult` | your burns hurt 1× as much | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:burnDuration` | your burns last 1 rounds longer | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:burnStackRate` | 100% chance to stack a second burn | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:burnSpread` | the fire jumps to another enemy | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:igniteZone` | leaves the ground burning for 1 rounds | `effects.js` onEnd | `skills.json` data only — **no mechanic existed** | done |
| `skill:poisonDmgMult` | your poison hurts 1× as much | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:poisonMaxStacks` | poison can stack up to 1 times | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:poisonPerTwoStacks` | every second poison stack adds another 1 | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:bleedStack` | adds 1 more bleed | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:hemorrhage` | every bleed on the target bursts at once | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:rebleedAfter` | the wound opens again 1 rounds later | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:dotDmgMult` | your lingering damage hurts 1× as much | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:dotPower` | lingering damage does 1 a round | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:dotDuration` | lingering damage lasts 1 rounds longer | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:dotDurationMult` | lingering damage lasts 1× as long | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:dotLifesteal` | you heal for 100% of your lingering damage | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:regenBonus` | regeneration gives 1 more a round | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:slowMult` | slows last 1× as long | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:spreadOnDeath` | when the target dies its afflictions spread | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:spreadToAdjacentGroup` | it spreads to the rest of the target group | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:armorReduce` | strips 1 armour | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:armorReduceDuration` | armour stays stripped for 1 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:armorDebuff` | strips 1 armour | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:armorDebuffDur` | stripped armour stays off for 1 rounds | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:armorDebuffOnHit` | every hit strips 1 armour | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:mrDebuff` | strips 1 magic resistance | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:mrDebuffDur` | the magic resistance stays down for 1 rounds | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:fireResistDebuff` | the target takes 100% more fire damage | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:intDebuff` | saps 100% of the target's Intelligence | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:intDebuffDur` | the mind stays fogged for 1 rounds | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:atkDebuff` | the target is 100% less likely to hit | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:dmgDebuff` | the target hits 100% softer | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:dodgeDebuff` | the target is 1 easier to hit | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:dodgeDebuffDur` | it stays easier to hit for 1 rounds | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:dmgBuff` | +100% party damage | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:dmgReduct` | 100% less damage taken | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:reflect` | reflects 100% of what hits you | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:dodgeBuff` | +1 dodge | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:critBuff` | +1% critical chance | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:critChance` | +100% critical chance | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:spellDmgBuff` | +100% spell damage | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:armorBonus` | +1 armour | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:tempHp` | +1 temporary HP | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:barrier` | a barrier worth 1× your Intelligence | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:shield` | a shield worth 3× your Constitution | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:taunt` | draws enemy attacks onto you | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:tauntedBy` | forces the enemy to come for you | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:stealth` | slips out of sight | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:thorns` | returns 100% of the damage you take | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:parryCount` | parries the next 1 hit | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:extraAction` | 1 extra action | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:initiative` | +1 initiative | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:dodgeBonus` | +100% dodge | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:hitBonus` | +1 to hit | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:hitBuff` | +1 to hit | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:magicResistBonus` | +1 magic resistance | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:attackSpeed` | swings 100% faster | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:extraActionDuration` | the extra actions keep coming for 1 rounds | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:stealthDur` | stays hidden for 1 rounds | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:drainBuff` | what you drain feeds you 100% more damage | `effects.js` onEnd | `skills.json` data only — **no mechanic existed** | done |
| `skill:returnMult` | whatever you reflect comes back 1× as hard | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:elementImmunityParty` | the whole party shrugs off fire, frost and poison | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:durationMult` | everything it puts up lasts 1× as long | `effects.js` merge | `skills.json` data only — **no mechanic existed** | done |
| `skill:shieldDur` | the shield holds for 1 rounds | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:shieldMult` | the shield is 1× as strong | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:immuneStun` | immune to stuns | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:immuneBleed` | immune to bleeding | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:immuneBlind` | immune to blinding | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:immuneSlow` | immune to being slowed | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:immuneConfuse` | immune to confusion | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:immuneCC` | immune to anything that stops you acting | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:immuneRound` | untouchable for 1 round | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:immune` | untouchable for a moment after coming back | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:cleanse` | clears everything harmful | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:cleanseParty` | clears harmful effects from the whole party | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:cleanseOnActivate` | clears your own afflictions the moment it goes off | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:healMult` | heals for 100% of the stat it scales with | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:healAmount` | heals 1 | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:healPct` | heals 100% of max health | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:hpRegen` | +1 HP a round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:regenPct` | regenerates 100% of max health a round | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:regenRounds` | regeneration runs for 1 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:regenDur` | regeneration runs for 1 rounds | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:regenMult` | regeneration is 1× as strong | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:reviveHp` | brings the fallen back on 100% health | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:reviveAll` | brings everyone back | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:reviveImmuneRounds` | the revived are untouchable for 1 round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:partyHealPct` | heals the whole party 100% of their health | `effects.js` onEnd | `skills.json` data only — **no mechanic existed** | done |
| `skill:partyRegen` | the whole party regenerates | `effects.js` onBuff | `skills.json` data only — **no mechanic existed** | done |
| `skill:splitHeal` | the healing is shared out across the party | `effects.js` onBuff | `skills.js` + CombatScreen — working | done |
| `skill:hpSacrifice` | costs you 100% of your own health | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:selfDamagePct` | costs you 100% of your own health | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:mpRestore` | gives back 1 mana | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:mpOnHit` | +1 mana a hit | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:mpRegen` | +1 mana a round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:mpDrain` | drains 1 mana | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:lifesteal` | heals you for 100% of the damage | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:mpDrainDamage` | the drained mana burns them for 100% as much again | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:mpRestoreOnKill` | a kill gives back 100% of your mana | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:mpReturn` | refunds 1 mana | `effects.js` onEnd | `skills.json` data only — **no mechanic existed** | done |
| `skill:refundOnKill` | a kill refunds what the skill cost | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:cdrOnKill` | a kill knocks 1 round off your cooldowns | `effects.js` onHit | `skills.json` data only — **no mechanic existed** | done |
| `skill:breathWeaponFree` | Breath Weapon costs nothing | `effects.js` onCast, merge | `skills.json` data only — **no mechanic existed** | done |
| `skill:actionsLost` | the enemy loses 1 action | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:enemySkipRound` | the enemy loses a round | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:enemySkipExtra` | the enemy loses 1 more round | `combat.js` cast() | `skills.json` data only — **no mechanic existed** | done |
| `skill:enemySkipRounds` | the enemy loses 1 rounds | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:trapCount` | lays 1 trap | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:buildsFlairStacks` | builds 1 Flair | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:consumesFlairStacks` | spends all your Flair | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:keepStacks` | keeps 1 Flair afterwards | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:stackDmgMult` | 1× damage for every stack spent | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:maxStacks` | stacks up to 1 times | `combat.js` cast() | `skills.js` + CombatScreen — working | done |
| `skill:stackingMode` | only one of these can be on a target at a time — a fresh one refreshes it | `effects.js` onCast | `skills.js` + CombatScreen — working | done |
| `skill:persistStacks` | your stacks carry over between fights | `effects.js` onCast | `skills.json` data only — **no mechanic existed** | done |
| `skill:requiresDeadEnemy` | needs a body on the floor | `effects.js` gate | `skills.json` data only — **no mechanic existed** | done |
| `skill:pilferBuff` | steals one of the enemy's blessings — and the next spell they try to cast | `effects.js` onCast, onHit | `skills.js` + CombatScreen — working | done |
| `skill:pilferCount` | steals 1 blessings, and as many spells out of the air | `effects.js` onCast, onHit | `skills.js` + CombatScreen — working | done |
| `skill:pilferBonusDuration` | stolen blessings last 1 rounds longer | `effects.js` onHit | `skills.js` + CombatScreen — working | done |
| `skill:pilferDamagePerBuff` | +100% damage for every blessing you have stolen | `effects.js` dmgMult | `skills.js` + CombatScreen — working | done |
| `skill:unlocksCompanion` | unlocks the wolf companion | `effects.js` unlock | `skills.js` + CombatScreen — working | done |

### Status effects (29)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `status:bleed` | Bleeding: loses HP every round from an open wound. | `combat.js` (registry fields: dot, stacks) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:poison` | Poisoned: loses HP every round, and doses stack. | `combat.js` (registry fields: dot, stacks) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:burn` | Burning: takes fire damage every round and is more vulnerable to flame. | `combat.js` (registry fields: dot, stacks, takenMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:stun` | Stunned: cannot act at all. | `combat.js` (registry fields: skip) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:haste` | Hasted: takes an extra action each round. | `combat.js` (registry fields: extraActions) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:rally` | Rallied: deals more damage while it lasts. | `combat.js` (registry fields: dealtMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:barrier` | Barrier: soaks up damage before health is touched. | `combat.js` (registry fields: absorbs) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:block` | Blocking: much more likely to block an incoming hit. | `combat.js` (registry fields: blockBonus) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:deflect` | Deflecting: the next hit that lands is turned aside completely. | `combat.js` (registry fields: absorbNext) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:enchant` | Enchanted: the weapon carries a charge, adding 25% magic damage. | `combat.js` (registry fields: dealtMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:slow` | Slowed: acts later and less often. | `combat.js` (registry fields: initMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:taunt_totem` | Taunt Totem: a totem pulls enemy attacks away from the party. | `combat.js` (registry fields: drawsFire) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:regen` | Regenerating: recovers HP at the start of each round. | `combat.js` (registry fields: heal) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:marked` | Marked: takes 30% more damage from everything. | `combat.js` (registry fields: takenMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:blind` | Blinded: swings wildly and misses far more often. | `combat.js` (registry fields: hitMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:soulbind` | Soul-Bound: shares half of every wound with whoever is bound to it. | `combat.js` (registry fields: share) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:curse` | Cursed: deals noticeably less damage. | `combat.js` (registry fields: dealtMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:silence` | Silenced: cannot cast anything. | `combat.js` (registry fields: noSpells) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:disarm` | Disarmed: its weapon is gone, so its hits land at half strength. | `combat.js` (registry fields: noWeapon, dealtMult) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:root` | Rooted: held fast — cannot dodge and loses any extra actions. | `combat.js` (registry fields: noDodge, noExtra) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:holy_burn` | Holy Fire: sacred flame that burns twice as hot on the undead and demons. | `combat.js` (registry fields: dot, holy, stacks) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:freeze` | Frozen: locked in ice for the round. | `combat.js` (registry fields: skip, consumed) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:confused` | Confused: half the time it does nothing at all. | `combat.js` (registry fields: skip) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:thorns` | Thorns: hurts anything that hits it. | `combat.js` (registry fields: reflect) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:dazed` | Dazed: much less likely to hit anything. | `combat.js` (registry fields: hitFlat) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:sleep` | Asleep: out cold until something wakes it. | `combat.js` (registry fields: skip, wakesOnDamage) | `statusEffects.js` STATUS_META — **glyph only** | done |
| `status:sunder` | Sundered: its armour is broken open. | `combat.js` (registry fields: armorReduce) | used by data, **no entry in STATUS_META** | done |
| `status:fury` | Furious: lashing out much harder than normal. | `combat.js` (registry fields: dealtMult) | used by data, **no entry in STATUS_META** | done |
| `status:weaken` | Weakened: its blows have lost their strength. | `combat.js` (registry fields: dealtMult) | used by data, **no entry in STATUS_META** | done |

### Champion (blue elite) modifiers (10)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `champion:regen` | Regenerating: heals a twentieth of its health each round. | `effects.js` spawn, roundStart | `championModifiers.js` — working | done |
| `champion:aura_damage` | Damage Aura: every other enemy hits 20% harder while it lives. | `effects.js` auraDmg | `championModifiers.js` — working | done |
| `champion:fast` | Swift: acts half again as often. | `effects.js` spawn | `championModifiers.js` — working | done |
| `champion:extra_strong` | Extra Strong: hits 30% harder. | `effects.js` spawn | `championModifiers.js` — working | done |
| `champion:tough` | Tough: 30% more health. | `effects.js` spawn | `championModifiers.js` — working | done |
| `champion:cursed_aura` | Cursed Aura: curses a random hero every round. | `effects.js` roundStart | `championModifiers.js` — working | done |
| `champion:shielded` | Shielded: takes half damage from everything. | `effects.js` dmgIn | `championModifiers.js` — working | done |
| `champion:lifesteal` | Lifesteal: heals for 30% of the damage it deals. | `effects.js` spawn, onHit | `championModifiers.js` — working | done |
| `champion:thorns` | Thorns: returns 10 damage to anything that hits it. | `effects.js` onDamaged | `championModifiers.js` — working | done |
| `champion:inferno` | Inferno: anything that hits it catches fire. | `effects.js` onDamaged | `championModifiers.js` — working | done |

### Named-enemy modifiers (9)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `named:tough` | Tough: +8 armour. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:fast` | Fast: acts twice a round. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:regen` | Regenerating: heals a twentieth of its health each round. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:thorns` | Thorns: returns a fifth of the damage it takes. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:fiery` | Fiery: sets you alight when it hits. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:vampiric` | Vampiric: heals for 30% of the damage it deals. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:cursed` | Cursed: its hits curse you. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |
| `named:summoner` | Summoner: brings two extra followers. | `combat.js` | not in the original (Emberveil 2 addition) | done |
| `named:colossal` | Colossal: half again as big, and hits harder for it. | `effects.js` spawn | not in the original (Emberveil 2 addition) | done |

### Enemy spell keys (7)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `spell:damage` | deals 1 damage | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:status` | applies burn | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:statuses` | applies burn | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:heal` | heals an ally 1 | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:selfHeal` | heals the caster 1 | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:windUp` | takes 2 rounds to build, and fizzles if it takes 40 damage first | `combat.js` | `enemySpells.js` + CombatScreen — working | done |
| `spell:stealable` | cannot be snatched away | `combat.js` | `enemySpells.js` + CombatScreen — working | done |

### Boss phase keys (6)

| id | what it does | where Emberveil 2 does it | in the original | status |
|---|---|---|---|---|
| `phase:hpThreshold` | triggers below 50% health | `combat.js` | `bossPhases.js` — working | done |
| `phase:name` | phase: Wrath Unbound | `combat.js` | `bossPhases.js` — working | done |
| `phase:onEnter` | The air turns to ash. | `combat.js` | `bossPhases.js` — working | done |
| `phase:addSpells` | learns imp_fireball | `combat.js` | `bossPhases.js` — working | done |
| `phase:swapSpells` | swaps to imp_fireball | `combat.js` | `bossPhases.js` — working | done |
| `phase:addStatuses` | gains fury | `combat.js` | `bossPhases.js` — working | done |

## Not ported, and why

| system | original | why not |
|---|---|---|
| `recipes.js` — unique-item and common-gear crafting recipes (~850 lines: material costs, gold costs, `unlockBy` gates) | working | Emberveil 2 has no crafting screen or recipe hook. What it does have is the blacksmith/enchanter path — `loot.addAffix()` (add an affix at a material tier) and `loot.promote()` (raise rarity) — plus `craftTiers` / `craftSlots` in `items.json`. Recipes would need a whole new town screen, which is outside "make the effects work". |
| `fame.js` — fame thresholds unlocking extra class appearances and weapon varieties | working | Emberveil 2 has no per-class appearance/weapon-variety catalogue (characters are built from the playground's Mii-style avatar system instead). Fame *is* used: it raises merchant stock rarity and quality (`loot.js` `fameBonus`) and is awarded per fight and per quest in `game.js`. The cosmetic unlock tiers have nothing to unlock. |

Everything else audited is implemented: all 12 legendary powers, all 40 `cond_*` affixes and the 32
plain affix stats, all 214 skill keys, all 29 statuses, all 10 champion modifiers, all 9 named-enemy
modifiers, all 7 enemy-spell keys and all 6 boss-phase keys.

Two more things worth noting, which were already done before this pass and were re-checked:

* **Class passives** — all 19 nodes in `PASSIVE_NODES` (`js/rules.js`) match the original's
  `passives.js` one for one, and every effect key (`maxHp`, `maxMp`, `hpRegen`, `mpRegen`,
  `blockChance`, `thorns`, `resistAll`, `dodgePct`, `critPct`, `lifesteal`, `burnOnHit`,
  `poisonOnCrit`, `chainOnHit`, `hpOnKill`, `manaOnKill`) is read in `derive()` and used in combat.
* **Companion power tiers** — `companions.json` carries `companionPower`, and `game.js`
  `makeCompanion()` scales HP and damage by it. Class pets unlocked through skill talents
  (`unlocksCompanion`) are summoned for real by `effects.js` `syncCompanions(game)` (round 20): it
  reads every hero's bought talents with `companionIdsFor()` and hands the party any pet it does not
  already have, so the Mage's Arcane Familiar turns up on the stage and in the Party tab. `main.js`
  calls it when a talent is learned and when a save is loaded; it is safe to call repeatedly.

## Things the original got wrong that Emberveil 2 fixes

* Enemy spells with a `statuses` **array** (6 of the 26 spells, including the Sovereign's voidstorm)
  applied nothing at all; `selfHeal` was ignored; boss wind-up spells fired instantly.
* `skills.json` says `confuse` where the engine calls the status `confused` — `effects.js` carries a
  `STATUS_ALIAS` so the typo still works.
* `sunder`, `fury` and `weaken` were applied by skills and boss phases but had no entry in
  `statusMeta`, so they drew no icon. They have one now.
* Armour penetration read the *attacker's* `_tempArmorPen` instead of the target's, so
  `critical_armorpen` never did anything.
* Magic-shield `barrier` / `barrierRegen` were rolled on items and never used in a fight.
* `cooldownReduction` and `xpFind` were summed from gear and then thrown away.

---

## Round 14: the road weapons

Thirty-five new registry ids — 23 `affix:cond_*` properties carried as `intrinsic` affixes on 22 new
weapon bases, and 12 new `legendary:*` powers on 12 new uniques. Each one touches a system
**Emberveil 2 added on top of the original**, so none of them existed in the source game.

Combat-side ones use the hooks that were already here. The out-of-combat ones use a new set of
**world hooks**, dispatched from `js/game.js` through `worldFx` / `fireWorld` / `worldSum` /
`worldMax`:

| hook | signature | called from |
|---|---|---|
| `legs` | `(v, game, hero) → number` | `Game.legsPerDay()` |
| `nightChance` | `(v, game, hero) → number` | `Game.nightAttack()` |
| `exhaustionEase` | `(v, game, hero) → 0…1` | `Game.exhaustionMult()` (biggest wins, they do not stack) |
| `nemesisChance` | `(v, game, hero) → number` | `Game.enter()` |
| `onLeg` | `(v, game, hero) → result?` | `Game.travel()` |
| `onRest` | `(v, game, hero, out) → result?` | `Game.rest()` |
| `onWin` | `(v, game, hero, ctx) → result?` | `Game.victory()` (`ctx` = `{ enc, node, foe, kills }`) |

A hook that returns a truthy object is collected into `game.legGear` / `out.gear` / `game.winGear`,
which `main.js` turns into a plain-language line in the log (`narrateGear`).

| id | what it does | system it touches |
|---|---|---|
| `affix:cond_forageRation` | a chance of a day's food after a won fight | supplies |
| `affix:cond_nightWard` | night attacks are less likely | night raids |
| `affix:cond_extraLeg` | one extra node move every N days | travel legs |
| `affix:cond_roadFind` | a chance of loot on every move | travel legs, loot |
| `affix:cond_easeExhaustion` | the hunger penalty costs less | exhaustion |
| `affix:cond_watch` | no ambush at all, for one extra ration | rest, supplies |
| `affix:cond_killGrowth` | +1% damage per ten kills on it (cap +25%) | damage meter `itemStats` |
| `affix:cond_critFromWounds` | crit climbs with the health already spent | — |
| `affix:cond_brand{Fire,Ice,Shadow,Holy,Lightning,Nature,Arcane}` | hits strike again as that element and can apply its status | statuses + the 3D stage's elements |
| `affix:cond_sunderOnHit` | a chance to break armour open | statuses (`sunder` had almost no source) |
| `affix:cond_dmgVsNamed` | more damage to champions, named enemies and bosses | named enemies |
| `affix:cond_nemesisMark` | more damage, and survivors come back as nemeses far more often | nemeses |
| `affix:cond_companionExtra` | the companion acts twice a round | companions |
| `affix:cond_companionFury` | the companion starts every fight furious | companions, `fury` |
| `affix:cond_vehicleDmg` | more damage while the party has a vehicle | vehicles (`Combat` ctx carries `vehicle`) |
| `affix:cond_killMemory` | killing blows are remembered, and told again at camp | memories, conversations |
| `affix:cond_guardBond` | you take a little more, and the party thinks better of you | relationships |
| `legendary:camp_mend` | a night beside it mends the party 15% | rest |
| `legendary:forage_feast` | two days of food after a fight, and a good-meal memory | supplies, memories |
| `legendary:naming_kills` | at 50 kills it earns a name and a `deed` memory | meter, memories |
| `legendary:road_cache` | coin on every move | travel legs |
| `legendary:companion_might` | companion +40% damage, +25% HP, starts furious | companions |
| `legendary:strip_modifier` | the biggest champion or named enemy loses a modifier at fight start | champions, named enemies |
| `legendary:hated_blade` | +25% damage, and the party resents every swing | relationships |
| `legendary:kill_ledger` | +1% damage per five kills (cap +60%) | damage meter `itemStats` |
| `legendary:curse_spreads` | a kill spills the curse over everything still standing | statuses, spell effects |
| `legendary:free_move` | one extra move every day | travel legs |
| `legendary:nemesis_hunter` | double damage to grudges, and a kill mends the party | nemeses |
| `legendary:no_night_raids` | nothing comes near the camp, even on an empty larder | night raids |

Combat-side rows live in `tests/effects.test.js` like everything else. World-side rows are marked
`world: true` there — the harness cannot prove them in a fight, so it checks instead that each one
has a row in `tests/weapons.test.js`, where it is run against a real `Game` through travel, rest
and victory.

## Round 20: how many things a skill hits

`skills.json` writes hit counts two ways and the engine used to honour neither reliably:

* a **talent** usually means "one more" — `{ "bolts": 5 }` on a `random3` skill, `{ "strikeCount": 1 }`
  on a single-strike one, `{ "chainTargets": 2 }` on a chain;
* a **level upgrade** states the new total — `{ "bolts": 4 }`, `{ "strikeCount": 5 }`.

Three pieces settle it, and nothing else in the engine reads a count directly:

| Piece | Where | What it does |
|---|---|---|
| `shotCount(skill, fallback)` | `js/combat.js` | how many enemies a multi-target shape picks: `bolts` → `targets` → `chainTargets`/`chainCount`/`glaiveCount` → the shape's default. Used by `random3/4`, `multi3/4`, `chain`, `adjacent`, `adjacent2`, `group2` |
| `hitCount(skill)` | `js/combat.js` | how many times each picked target is struck. Reads the merged `effect.hits`, which `rules.mergeSkill` seeds from the skill's own `hits` so a talent has something to add to |
| `countUp(v, base)` | `js/effects.js` | a value is the new total when it is bigger than the skill already does, and an addition when it is not — so a talent can never make a skill hit **fewer** things |

Known data oddity, deliberately left alone: `chain_lightning_spirit`'s "Forked Spirit" adds a target
to a skill whose `aoe` is `row`, which already hits every enemy on the field. The shape wins;
`tests/multishot.test.js` skips sweep shapes for that reason and says so.
