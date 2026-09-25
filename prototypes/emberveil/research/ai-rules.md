# Combat AI rules: the original game, and where they live now (E42)

The original is `~/claude/emberveil` (read-only). Its AI was spread over four files that did not
quite agree with each other (the simulator used different thresholds from the live screen). Every
rule found is listed below with its source line, whether Emberveil 2 had it **before** E42, and where
it lives **now**. "ai.js" means `prototypes/emberveil/js/ai.js`; its numbers are in `data/ai.json`.

Short names for the original files:
- **T** `src/ui/screens/_aiTargeting.js` — the live hero skill picker (`pickHeroAction`)
- **E** `src/ui/screens/combat/combatEnemyAI.js` — the live enemy turn
- **S** `src/game/simulator.js` — the balance simulator's copy of both
- **CS** `src/ui/screens/CombatScreen.js` — targeting inside skill execution and the basic attack

## Hero rules

| # | Rule in the original | Source | Before E42 | Now |
|---|---|---|---|---|
| 1 | Only skills off cooldown, affordable, and not blocked by silence (silence stops magic, heals and anything that costs mana) | T:75-79, S:333-337 | yes (`combat.js usableSkills`) | same, unchanged |
| 2 | A fallen ally is raised first when a revive is ready | T:107-108, S:356-360 | yes | ai.js `planRevive`: scored by the health they return with × `revive.mult` and their output, weighted by role, so the healer is raised before a pet |
| 3 | Never cast a revive when nobody is down | T:168-175, T:180 | partly (checked before casting) | ai.js: a revive with nobody down has no plan |
| 4 | Healer classes (cleric, priest, druid, oracle, shaman, paladin, bard) or a "protective" personality count as healers | T:14, T:121, S:317-318 | classes only (`rules.js HEALER_CLASSES`) | `data/ai.json roles.healer`; heroes here have no personality field, so there is no protective/aggressive switch |
| 5 | Thresholds: critical under 25% (sim 30%), urgent at or under 40%, wounded under 50% (sim 60%), "any hurt" under 65% (sim 80%) | T:113-136, S:349-351 | 25% for anyone, 65% for healers | `heal.emergency` 0.35 for anyone, `heal.threshold` 0.65 for healers; urgency rises smoothly between them (`woundedMult` → `emergencyMult`) |
| 6 | Anyone with a heal heals a critical ally | T:144-145, S:362-364 | yes (under 25%) | yes, under `heal.emergency` |
| 7 | A healer heals anyone "hurt" | T:142-143, S:366-368 | yes (under 65%) | yes, under `heal.threshold` |
| 8 | A healer with an urgent ally reaches for its biggest support skill (heal × 20 + shield + regen) | T:122-141 | no | ai.js scores every heal, shield and regen by what would actually land, so the biggest useful one wins |
| 9 | Heal target = lowest share of health | CS:3581 | yes (`mostHurt`) | ai.js `healWorth`: lowest share first, weighted by role (`roles.weight`: tank 1.25, healer 1.35, self 1.1, companion 0.7) and by being hit last round |
| 10 | Pick the heal by mana cost (most expensive = strongest) | T:111-112, S:345-346 | by heal multiplier | ai.js: the heal whose healing lands best for the missing amount, minus mana share (`mana.costWeight`), so a small top-up uses the cheap heal |
| 11 | Skip a heal when the lowest ally is at 85% or more, and swing instead | CS:3587-3603 | no | `heal.never` 0.85 |
| 12 | Do not waste more than half a heal on overheal (M347 note) | T:115-119 | no | `heal.maxOverheal` 0.5 (ignored in an emergency); overheal also costs score (`heal.overhealPenalty`) |
| 13 | Never fall back to a heal or a buff when nobody needs one | T:163-175 | partly | a heal with no hurt target and a buff already running score 0 and are never picked |
| 14 | Healer with a wounded ally casts a shield/damage-reduction buff, but not if one is already up | S:374-376 (M262) | yes (if nobody had a barrier) | ai.js `buffWorth`: a barrier on someone who already has one is worth 30%; damage reduction only counts above what they already have |
| 15 | Damage skill score = damage multiplier × hits × expected targets (+ tiny mana tiebreak) | T:90-103, S:378-399 (M429) | yes, same formula | ai.js `planDamage`: the real expected damage — the game's own skill formula, hit chance, armour or magic resist, block, the 1 / 0.8 / 0.6 spread for 1 / 2 / 3+ targets, execute, bonus vs undead/demons, damage-vs-status, skill hooks read at their average — capped at what each target has left |
| 16 | Aggressive/opportunist personalities go straight to the best damage skill | T:148-156 | no (no personalities) | not ported: no personality field on heroes |
| 17 | Neutral hero: heal a wounded ally, else best damage, else first non-heal/buff skill, else any usable if someone is wounded | T:157-177 | roughly, with random 80%/50% rolls | replaced by one score for every option; nobody rolls dice to decide |
| 18 | Buff/shield self-cast as a fallback; any usable skill as the last fallback | S:401-403 | buff only in rounds 1–2 if no buff at all; random skill 50% | ai.js `planBuff`: every buff is priced (damage added or prevented over `buffs.horizon` rounds), worth more early (`buffs.earlyRounds`/`earlyMult`) and against bosses/champions/named; the basic attack is the fallback so nobody idles |
| 19 | Picked-skill list: heals and revives are always considered, and a damage skill is added back if the picks left none | T:40-71 (M283, M408, M411) | not needed (heroes use every unlocked skill) | same |
| 20 | Present only awake enemies to the picker when any are awake; basic attacks skip sleeping targets | CS:2757-2762, CS:3342-3351 (M398) | no for heroes (random target) | ai.js: a hit on a sleeping enemy is worth `focus.sleepingMult` while anything else is awake |
| 21 | Hero basic attack goes to the lowest absolute health enemy | CS:3350, S:277-285 | no (random) | ai.js `attackPlans`: finishing a target is worth its output for `focus.killRounds` rounds, plus `focus.lowHealth` on hurt targets |
| 22 | Log each AI decision (debug) | CS:2787-2796 (M377) | no | every decision's reason is written onto its event (`ev.why`, `ev.whyRule`), kept in `combat.decisions`, shown in the log after the skill name, and for basic attacks with `?aiwhy=1` |
| 23 | Buff aimed at an ally goes to the most wounded, respects `excludeSelf`, `targets` count | CS:3651-3656 (M95) | yes | ai.js picks the ally the buff is worth most on (a shield on whoever is being hit, haste on whoever hits hardest), same `excludeSelf`/`targets` |
| 24 | Buff aimed at an enemy (taunt) goes to the first enemy | CS:3657 | yes (random enemy) | ai.js `planEnemyDebuff`: the enemy that attacked the ally being protected |
| 25 | Corpse skills need an un-used body; refund if none | CS:3975-3982 (M94) | yes (`requiresDeadEnemy` gate, effects.js) | same |
| 26 | Area shapes: single first, adjacent 2, adjacent2/group2 up to 4 in a group, group all of a group, row/all everyone, chain nearest, random N distinct, multi on the first, pierce row, single overflow | CS:4126-4163 | yes (`combat.js skillTargets`) | same shapes; ai.js now chooses the **primary** (the group or row that scores highest) and `skillTargets` honours it |
| 27 | Manual combat: the player picks for real heroes | CS:2777-2791 | no | not ported (auto-battle only) |

## Enemy rules

| # | Rule in the original | Source | Before E42 | Now |
|---|---|---|---|---|
| 28 | Enemies skip sleeping heroes when an awake one exists | E:24-25 (M398) | yes (`pickFoe`) | same; spells score a sleeping hero at `focus.sleepingMult` |
| 29 | Enemy healers mend the lowest ally under 60%; silenced healers cannot | E:29-40 (M46, M171) | yes | ai.js `decideEnemy`: `enemy.healThreshold`, same amount |
| 30 | Channelled (wind-up) spells: count down, then cast; interrupted if enough damage was taken | E:45-69 (M303) | yes | unchanged in combat.js; heroes now **focus a channelling enemy** (`focus.threat.windUp`) and get `focus.interruptBonus` when their hit would reach the interrupt threshold |
| 31 | Spell cast: not silenced, off cooldown, roll `spellChance`, then a **random** spell | E:72-86, S:902-935 | yes | chance roll kept; the spell and target are chosen by score, and a spell worth nothing (a curse on the already cursed, a heal with nobody hurt, thorns already up) is skipped for a swing (`enemy.minSpellValue`) |
| 32 | Spell cooldown set on cast; wind-up spells start channelling | E:89-107 | yes | same (`enemy.windUpMult` prices a channelled spell a little lower) |
| 33 | A taunted enemy attacks only its taunter | E:116-119 (M95), CS:3725 | yes | same, and ai.js applies it to single-target spells too |
| 34 | Formation: taunting heroes first, then companions, then party order | E:122-136 (M46) | yes (`pickFoe`, plus taunt totems and stealth) | unchanged for basic attacks (`enemy.focusAttacks: false`); spells use the scored target |
| 35 | Spell targets: self, all heroes, lowest wounded ally (only if someone is below full), single = first in formation | E:158-179 | yes | self/all unchanged; lowest ally only when a heal is worth it; single-target spells go where they are worth most (silence on a caster or healer, a curse on whoever hits hardest, a finishing blow) unless taunted |
| 36 | Heal an ally, self-heal (drain) | E:186-199 | yes | same; ai.js counts self-healing in the spell's value |
| 37 | Simulator enemies cast at the first hero and basic-attack the lowest HP hero | S:920, S:944 | n/a | not copied: the live game (E:122-136) used formation, and that is what Emberveil 2 keeps |

## Rules the original did not have, added because the request asked for them

| Rule | Now |
|---|---|
| Group heal when several allies are hurt | `heal.group` (bonus once `minHurt` allies are under `threshold`) |
| Area skill must reach `aoe.minTargets` living enemies and beat the best single-target option by `aoe.minGain` | ai.js `decideHero` (only for area skills that cost mana) |
| Healer keeps its cheapest heal's mana (`mana.healerReserveCasts`) | ai.js `healReserve` |
| Tanks taunt when a non-tank ally (healer, caster, or under `taunt.squishyHp`) was attacked last round | ai.js `tauntWorth` |
| Crowd control goes to the biggest threat; no reapplying a status already on the target | ai.js `statusWorth` (worth scales with the target's output; an existing non-stacking status with at least as long left is worth 0) |
| Cleanse dangerous statuses | ai.js `cleanseWorth` (`cleanse.danger` rounds of output per status; damage over time by what is left) |
| Focus healers, casters, a boss's adds before the boss, marked targets | `focus.threat` |
| Save big-cooldown or expensive skills for bosses, champions, named enemies or three-plus packs | `cooldown` |
| Shields are worth more while an enemy channels a big spell | `buffs.braceMult` |
| Buffs are worth little when the fight is nearly won | `buffs.nearlyWonRounds` / `nearlyWonMult` |
| Avoid hitting thorns when low | `focus.thornsSelfHp` / `thornsMult` |
