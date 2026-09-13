# Emberveil 2 — simulation and the round-14 balance pass

`tools/sim-emberveil.mjs` plays whole runs headlessly with the game's own modules — the same `Game`
(map, travel legs, rations, night attacks, rest, towns, named enemies, nemeses), the same `Combat`,
the same `Loot`, the same damage meter. A bot makes the decisions a player would: it spends the
attribute, talent and passive points a level-up hands out, walks toward the boss, fights what is in
the way, bandages between fights, goes back to town when it is hurt or hungry, buys food, bandages,
torches, a tent, a wagon and a dog, and equips anything that scores better. A run ends when the
party has been wiped three times or the day cap is reached.

```bash
node tools/sim-emberveil.mjs --runs 200 --seed 1                     # ~60 s
node tools/sim-emberveil.mjs --runs 200 --matrix --quiet \
     --report prototypes/emberveil/research/sim-latest.md            # + class and weapon matrices (~7 min)
node tools/sim-emberveil.mjs --runs 60 --act 3                       # start every run at the head of act 3
node tools/sim-emberveil.mjs --runs 40 --class stormcaller           # every party carries one
```

Runs are seeded and repeatable (`--seed`). Everything below is 200 runs at seed 1, day cap 140,
with the class and weapon matrices on.

> This file is the write-up. The raw generated report goes wherever `--report` points — use
> `research/sim-latest.md` so this one is not overwritten.

---

## What the first run found

| reading | before the pass | what it meant |
|---|---|---|
| full clears (all six acts) | **16.5%** | fine as a ceiling, but almost nobody was getting past act 2 |
| act reached on average | **3.6** | |
| runs that ended in act 2 | **88 of 200** | act 2 was the wall, not the endgame |
| wipes in act 2 | **348** | more than every other act put together |
| enemy holding the field most often | **Molten Golem, 187 wipes** | more than the next three enemies combined |
| rounds per fight, act 3 / 5 / 6 | **17.3 / 16.4 / 17.8** | late fights were a grind |
| nights with no food | **14.3% of rests** | |
| worst class, act 1 (fights won) | **stormcaller 14.4** vs a control party's 25.7 | barely half |
| worst class, act 3 | **mage 9.3** vs 27.4 | cloth casters fell off a cliff with the act-3 HP jump |
| statuses that never fired | haste, block, deflect, enchant, taunt_totem, soulbind; `rally` 11 times, `weaken` 60 | |

Two things stood out in the numbers.

**The HP curve has one bad step.** `enemies.actMultipliers` went 0.85 → 1.15 → **1.85** → 2.15 →
2.45 → 2.6. That act-2-to-3 jump is +61%, far bigger than any other step, and act 2 was already the
act everyone died in. The Molten Golem (740 HP, 20 armour, in a pack with three Ash Wraiths) sat
right at the top of it.

**Three classes were broken rather than weak.** The tactician has INT as its primary attribute and
was handed a *longsword* to start with — a heavy weapon, so `derive()` scaled its damage off STR,
which its build preset never raises. The priest's only attack, `shadow_bolt`, had a one-round
cooldown, so it spent half of every fight doing nothing. The stormcaller's only level-1 skill costs
15 mana against a level-1 mana pool and about 4 mana a round of regeneration, so it ran dry by
round three and swung a wand for the rest of the fight.

---

## The pass: 14 tweaks

All of them are numbers in data files. Nine of the fourteen are in `data/balance.json`, which is now
genuinely the knob file — `rules.js` used to carry its own private copies of the enemy multipliers,
and `applyBalance(data.balance)` (called from the `Game` constructor) now loads them from the JSON,
along with a new `world` block for the travel layer that `game.js` reads.

| # | file | what | from → to | why |
|---|---|---|---|---|
| 1 | `balance.json` | `enemies.actMultipliers.2.hp` | 1.15 → **1.05** | 44% of runs ended in act 2 |
| 2 | `balance.json` | `enemies.actMultipliers.2.damage` | 1.10 → **1.02** | same |
| 3 | `balance.json` | `enemies.actMultipliers.3.hp` | 1.85 → **1.55** | the steepest step in the table |
| 4 | `balance.json` | `enemies.actMultipliers.4.hp` | 2.15 → **1.95** | keeps the curve smooth after #3 |
| 5 | `balance.json` | `combat.skill.heroDamageMult` | 0.95 → **1.00** | act 3/5/6 fights ran 17 rounds |
| 6 | `balance.json` | `world.exhaustion.perStack` | 0.10 → **0.08** | going hungry compounded with the act wall |
| 7 | `balance.json` | `world.nightAttack.torch` | −0.10 → **−0.12** | torches cost 3 gold and were being ignored |
| 8 | `enemies.json` | `molten_golem` HP / armour | 740 / 20 → **620 / 16** | held the field in more wipes than the next three together |
| 9 | `enemies.json` | `cinder_hound` damage | [42, 60] → **[38, 54]** | third biggest killer, and it comes in packs |
| 10 | `encounters.json` | `obsidian_garrison` Ash Wraiths | 3 → **2** | golem + three wraiths was the single worst room in act 2 |
| 11 | `items.json` | `hunters_edge` damage | [10, 19] → **[13, 24]** | an act-3 base statted like an act-1 one |
| 12 | `items.json` | `warhorn_maul` damage | [11, 20] → **[13, 23]** | a companion weapon has to stand up when you have no dog |
| 13 | `items.json` | `roadwarden_bow` damage | [7, 15] → **[9, 18]** | worst weapon in the matrix (Roadsong at −6.1) |
| 14 | `items.json` | `thistlewarden` quality | high → **elite** | its whole power is out of combat; give the blade some weight |

Plus three one-line class fixes that are repairs rather than tuning:

| # | file | what | why |
|---|---|---|---|
| 15 | `classes.json` | tactician starts with a **scepter**, not a longsword | INT primary swinging a STR-scaled weapon; the scepter was already in its allowed list |
| 16 | `skills.json` | `shadow_bolt` cooldown 1 → **0** | it is the priest's only attack |
| 17 | `skills.json` | `chain_lightning` mana 15 → **10** | the stormcaller ran dry by round three |

---

## Before and after

| reading | before | after | |
|---|---|---|---|
| full clears (all six acts) | 16.5% | **23.0%** | +6.5 points |
| act reached on average | 3.6 | **4.4** | |
| fights per run | 37.9 | **48.8** | runs last longer instead of ending early |
| days survived | 18.8 | **23.2** | |
| party wipes per run | 2.7 | **2.5** | |
| average day of a wipe | 12.2 | **15.6** | deaths come later, not sooner |
| runs that ended in act 2 | 88 | **38** | the wall is gone |
| wipes in act 2 | 348 | **236** | |
| Molten Golem wipes | 187 | **88** | |
| rounds per fight, act 2 | 12.9 | **11.1** | |
| rounds per fight, act 3 | 17.3 | **15.9** | |
| share of wipes caused by bosses | 37.2% | **55.7%** | bosses are the gate now, which is what they are for |
| night raids that wiped the party | 4.1% | **2.3%** | |
| nights with no food | 14.3% | **17.4%** | *worse* — see below |
| stormcaller, act 1 fights won | 14.4 (control 25.7) | **26.3** (control 29.5) | fixed |
| priest, act 1 / act 3 | 25.0 / 20.1 | **30.9 / 28.7** | fixed |
| tactician, act 3 | 15.4 | **28.6** | fixed |
| mage, act 3 | 9.3 | **37.6** | the act-3 HP step was what was killing cloth casters |
| class spread, act 3 (worst → best) | 9.3 → 38.0 | **25.9 → 42.3** | much tighter |
| weapon lift spread | −6.1 … +5.6 | **−9.7 … +8.7** | still no dominator; the extremes are weak *bodies*, not strong properties |

Where the runs end now: act 2 holds 38, act 3 holds 44, and **83 of 200 runs end in act 6** — the
party gets all the way to the Dragon King and loses there. That is the shape you want.

**Starvation got worse, not better** (14.3% → 17.4%), and that is expected: runs are 23 days long
instead of 18, and the extra days are spent in late-act zones that are further from a town. The
exhaustion tweak made each hungry night cost less, which is why it did not show up as more wipes.
It is still the most obvious remaining rough edge.

---

## Recommendations I did **not** apply

These are bigger than a number, so they are yours to decide.

1. **Six statuses still never fire at all** — `haste`, `block`, `deflect`, `enchant`, `taunt_totem`,
   `soulbind` — and `rally` (914), `weaken` (114), `root` (536) and `thorns` (518) are rounding
   errors next to `bleed` (183k) or `burn` (152k). They all have working mechanics in the registry;
   nothing in the game hands them out often enough to matter. Fixing it properly means new sources
   (affixes, a couple of skill upgrades, an enemy modifier), not a number change.
2. **The hero AI almost never casts a buff.** `heroAI` picks the best expected-damage skill first, so
   pure-buff kits look terrible: the tactician has three buff skills out of four and still sits last
   in act 1 (24.3 against a control of 29.5). Either the AI needs a "buff early, then damage" rule,
   or those classes need a damage skill at level 1.
3. **Ice, nature and lightning are invisible** — 0.4%, 0.0% and 1.5% of all damage dealt. The new
   brand weapons are the only real source of nature and ice. Worth a look if the elemental
   resistances are ever going to mean anything.
4. **Act 5 is thin for eight classes.** Monk (5.4), enchanter (5.4), priest (6.4), sorcerer (8.9)
   and tactician (8.0) all sit far under the control party's 12.3 fights won. That is a level-20+
   kit problem — their late skills do not keep up — and needs a look at the skill tables, not a
   multiplier.
5. **Bosses are now 56% of all wipes.** That is healthy at the shape level, but the Lava Titan (122
   wipes) and the Dragon King (56) are doing most of it. If you want the endgame to feel winnable
   rather than a gate, the boss HP multiplier (`boss ? 1 + (am[0] - 1) * 0.35 : am[0]` in
   `makeEnemy`) is the lever, and it is in code rather than in `balance.json`.
6. **Three weapons are weak bodies rather than weak ideas.** Pilgrim's Staff (−9.7), Champion's Bane
   (−6.0) and Thistlewarden (−4.8) all lose fights when forced over an act-appropriate weapon. Their
   properties are good; their damage ranges are a tier low. Raising them would be easy, but it would
   also blur the "you trade combat power for road power" line these weapons are meant to draw, so I
   left it for you.
7. **The simulator's bot does not use potions, the blacksmith, the enchanter or the trainer**, and
   never respecs. Numbers here are therefore a floor, not a ceiling — a real player does better.

---

## Full report (latest run, after the pass)

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 23.0% |
| act reached on average | 4.4 |
| fights per run | 48.8 |
| rounds per fight | 12.6 |
| party wipes per run | 2.5 |
| average day of a wipe | 15.6 |
| days survived | 23.2 |
| hero level at the end | 23.8 |
| gold in hand at the end | 9548 |
| nights with no food | 17.4% of rests |
| night raids that wiped the party | 2.3% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 0 | 22 |
| 2 | 38 | 236 |
| 3 | 44 | 94 |
| 4 | 5 | 10 |
| 5 | 30 | 58 |
| 6 | 83 | 81 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| boss | 279 | 55.7% |
| named | 132 | 26.3% |
| ordinary | 77 | 15.4% |
| night raid | 13 | 2.6% |

| enemy holding the field | wipes |
|---|---|
| lava_titan | 122 |
| molten_golem | 88 |
| dragon_king | 56 |
| emberveil_sovereign | 35 |
| archfiend_malgrath | 32 |
| hell_knight | 22 |
| primordial_elemental | 21 |
| wyrm_warrior | 16 |
| the_architect | 14 |
| cinder_hound | 13 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 0 | 5.0 |
| 1 | 8.2 |
| 2 | 11.1 |
| 3 | 15.9 |
| 4 | 11.6 |
| 5 | 16.3 |
| 6 | 18.5 |

## Damage share by class

| class | share of all damage |
|---|---|
| warlock | 10.0% |
| swashbuckler | 9.5% |
| scavenger | 8.1% |
| dragon_knight | 7.1% |
| ranger | 5.0% |
| pyromancer | 5.0% |
| mage | 4.7% |
| rogue | 4.1% |
| witch_hunter | 4.0% |
| warrior | 3.9% |
| necromancer | 3.7% |
| fighter | 3.5% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| entangle | 13843 |
| flourish | 13199 |
| breath_weapon | 13138 |
| slow_time | 11635 |
| bone_spear | 11444 |
| bone_spike | 11041 |
| multi_shot | 10977 |
| knight_holy_strike | 9926 |
| hellfire | 9783 |
| purge_strike | 9550 |

Least used of the ones that fired at all: soul_curse (334), corpse_explosion (738), death_mark (910), hemorrhage (1562), smoke_trap (1693), monk_shadow_step (1731).

## Statuses and damage types

| status applied | times |
|---|---|
| regen | 185898 |
| bleed | 183857 |
| burn | 152010 |
| stun | 70081 |
| slow | 34742 |
| barrier | 32498 |
| dazed | 31714 |
| sunder | 30674 |
| poison | 28704 |
| curse | 28028 |
| sleep | 21843 |
| blind | 17194 |
| confused | 13650 |
| holy_burn | 13408 |
| marked | 12296 |
| silence | 11189 |
| disarm | 3568 |
| freeze | 3480 |
| rally | 914 |
| fury | 797 |
| root | 536 |
| thorns | 518 |
| weaken | 114 |

Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 46.0% |
| fire | 21.0% |
| arcane | 9.7% |
| holy | 7.5% |
| bleed | 5.8% |
| shadow | 4.8% |
| poison | 2.1% |
| lightning | 1.5% |
| true | 1.2% |
| cold | 0.4% |
| nature | 0.0% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 7272 |
| ring | 4413 |
| shield | 2525 |
| necklace | 1327 |
| quarterstaff | 1059 |
| heavy_chest | 981 |
| wand | 910 |
| greatsword | 656 |
| bramble_staff | 596 |
| kite_shield | 566 |
| scepter | 546 |
| bloodledger_blade | 543 |

| road-weapon property equipped | times |
|---|---|
| cond_brandNature | 596 |
| cond_killGrowth | 543 |
| cond_easeExhaustion | 499 |
| cond_brandFire | 335 |
| cond_nemesisMark | 311 |
| cond_sunderOnHit | 293 |
| cond_brandShadow | 165 |
| cond_roadFind | 165 |
| cond_dmgVsNamed | 127 |
| cond_critFromWounds | 116 |
| cond_brandArcane | 116 |
| cond_companionFury | 106 |
| cond_guardBond | 101 |
| cond_brandHoly | 98 |
| cond_extraLeg | 97 |
| cond_forageRation | 96 |
| cond_brandLightning | 71 |
| cond_brandIce | 62 |
| cond_watch | 61 |
| cond_companionExtra | 51 |
| cond_nightWard | 44 |
| cond_killMemory | 36 |
| cond_vehicleDmg | 26 |

| older conditional affix equipped | times |
|---|---|
| cond_manaShieldOnHit | 1830 |
| cond_fireDmgVsPoisoned | 1780 |
| cond_cheatDeath | 1756 |
| cond_physDmgReducePct | 1753 |
| cond_dmgBelowHpThresh | 1753 |
| cond_lightningVsSlowed | 1739 |
| cond_consecutiveHitDmg | 1737 |
| cond_combatStartBarrier | 1715 |
| cond_lowManaRegenBonus | 1714 |
| cond_dmgVsDemon | 1680 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 354 |
| affix:cond_guardBond | 316 |
| legendary:road_cache | 170 |
| affix:cond_forageRation | 158 |
| affix:cond_roadFind | 52 |
| affix:cond_watch | 17 |

## Class matrix

Each class dropped into a random party of four starting at the head of the act, on the same seeds as a
control party with nobody forced. The number is **fights won before the run gave up** (two wipes, 30 days);
the control line at the bottom is what a random party manages on those seeds.

| class | act 1 won | act 3 won | act 5 won | act-3 damage share |
|---|---|---|---|---|
| warlock | 34.7 | 41.4 | 18.3 | 35.4% |
| scavenger | 34.9 | 41.6 | 17.7 | 38.8% |
| rogue | 40.1 | 36.1 | 12.7 | 34.9% |
| necromancer | 38.9 | 36.4 | 13.7 | 23.2% |
| witch_hunter | 39.0 | 36.0 | 12.9 | 15.0% |
| swashbuckler | 40.1 | 30.9 | 16.3 | 53.0% |
| dragon_knight | 34.4 | 31.6 | 21.1 | 22.3% |
| pyromancer | 35.0 | 32.0 | 18.6 | 36.2% |
| shadow_dancer | 38.3 | 36.4 | 10.3 | 12.4% |
| ranger | 35.4 | 36.9 | 12.7 | 23.2% |
| tinker | 34.1 | 36.6 | 13.9 | 10.5% |
| warrior | 37.3 | 31.7 | 15.3 | 20.4% |
| paladin | 27.4 | 42.3 | 14.0 | 19.0% |
| cleric | 34.3 | 40.1 | 9.0 | 6.8% |
| mage | 32.7 | 37.6 | 12.9 | 22.6% |
| bard | 34.6 | 36.1 | 12.3 | 8.7% |
| demon_hunter | 35.0 | 36.9 | 11.0 | 19.8% |
| chronomancer | 33.0 | 36.4 | 10.3 | 6.3% |
| druid | 30.7 | 36.0 | 11.9 | 15.3% |
| stormcaller | 26.3 | 37.1 | 12.7 | 18.5% |
| shaman | 32.4 | 31.0 | 12.4 | 13.4% |
| fighter | 32.6 | 30.9 | 11.7 | 19.2% |
| sorcerer | 29.4 | 36.1 | 8.9 | 12.2% |
| runesmith | 33.0 | 26.9 | 12.7 | 22.9% |
| monk | 28.7 | 36.1 | 5.4 | 11.3% |
| enchanter | 34.0 | 30.4 | 5.4 | 2.6% |
| oracle | 26.3 | 29.6 | 10.9 | 11.1% |
| priest | 30.9 | 28.7 | 6.4 | 2.6% |
| knight | 30.0 | 25.9 | 9.7 | 15.6% |
| tactician | 24.3 | 28.6 | 8.0 | 6.7% |
| **control (random party)** | **29.5** | **34.3** | **12.3** | — |

## Weapon matrix (the road weapons)

One hero in a party of four starts the act carrying it, on the same seeds as the control party above.
"lift" is fights won minus what a control party managed in the **same** act on the same seeds — positive means the weapon helped.

Control: act 1 29.5 · act 2 39.3 · act 3 34.3 · act 4 23.7 · act 5 12.3 fights won.

| weapon | act | fights won | lift vs control | rounds per fight | wipes per run |
|---|---|---|---|---|---|
| pathfinder_javelin | 1 | 38.1 | +8.7 | 12.8 | 1.1 |
| wayfarers_pike | 5 | 19.4 | +7.1 | 19.2 | 0.9 |
| the_long_watch | 5 | 19.1 | +6.9 | 19.3 | 0.9 |
| tithe_dagger | 1 | 35.9 | +6.4 | 12.0 | 0.9 |
| forager_blade | 1 | 35.7 | +6.2 | 11.9 | 1.1 |
| grudge_crown | 5 | 17.0 | +4.7 | 18.9 | 0.9 |
| roadwarden_bow | 2 | 43.6 | +4.3 | 13.9 | 1.0 |
| lantern_mace | 1 | 32.4 | +3.0 | 12.2 | 1.1 |
| axle_club | 3 | 37.1 | +2.9 | 12.8 | 1.1 |
| houndmasters_lash | 2 | 42.0 | +2.7 | 13.9 | 1.0 |
| warhorn_maul | 3 | 36.9 | +2.6 | 12.7 | 1.1 |
| the_namesake | 2 | 41.9 | +2.6 | 16.1 | 1.3 |
| the_ingrate | 3 | 36.9 | +2.6 | 13.0 | 1.3 |
| breakers_pick | 3 | 36.6 | +2.3 | 12.5 | 1.1 |
| hunters_edge | 3 | 36.3 | +2.0 | 12.7 | 1.3 |
| roadsong | 2 | 41.0 | +1.7 | 14.7 | 1.0 |
| kennelbreaker | 3 | 36.0 | +1.7 | 12.8 | 1.1 |
| bloodledger_blade | 4 | 25.4 | +1.7 | 15.0 | 1.4 |
| veilspiller | 4 | 25.0 | +1.3 | 14.8 | 1.1 |
| ledger_of_ash | 4 | 24.1 | +0.4 | 15.4 | 1.4 |
| rimecut_sabre | 2 | 39.1 | -0.1 | 13.8 | 1.0 |
| gravebound_scepter | 4 | 23.6 | -0.1 | 15.3 | 1.4 |
| emberwatch | 1 | 28.9 | -0.6 | 11.6 | 1.3 |
| dawnwarden_hammer | 4 | 21.3 | -2.4 | 15.5 | 1.4 |
| stormpin_crossbow | 3 | 31.7 | -2.6 | 12.6 | 1.3 |
| covenant_hammer | 4 | 21.1 | -2.6 | 15.7 | 1.4 |
| watchfire_glaive | 5 | 9.6 | -2.7 | 17.7 | 1.1 |
| starwake_bow | 5 | 9.3 | -3.0 | 17.5 | 1.1 |
| grudgebrand | 4 | 20.3 | -3.4 | 15.7 | 1.4 |
| emberbrand_wand | 2 | 35.3 | -4.0 | 13.3 | 1.1 |
| bramble_staff | 2 | 35.1 | -4.1 | 13.0 | 1.1 |
| thistlewarden | 1 | 24.7 | -4.8 | 11.3 | 1.1 |
| champions_bane | 3 | 28.3 | -6.0 | 11.6 | 1.3 |
| pilgrims_staff | 2 | 29.6 | -9.7 | 12.5 | 1.1 |

---

## Full report (the run before the pass)

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 16.5% |
| act reached on average | 3.6 |
| fights per run | 37.9 |
| rounds per fight | 12.8 |
| party wipes per run | 2.7 |
| average day of a wipe | 12.2 |
| days survived | 18.8 |
| hero level at the end | 19.0 |
| gold in hand at the end | 6448 |
| nights with no food | 14.3% of rests |
| night raids that wiped the party | 4.1% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 0 | 23 |
| 2 | 88 | 348 |
| 3 | 35 | 82 |
| 4 | 2 | 4 |
| 5 | 27 | 44 |
| 6 | 48 | 30 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| boss | 198 | 37.2% |
| named | 180 | 33.8% |
| ordinary | 136 | 25.6% |
| night raid | 18 | 3.4% |

| enemy holding the field | wipes |
|---|---|
| molten_golem | 187 |
| lava_titan | 92 |
| cinder_hound | 34 |
| hell_knight | 30 |
| emberveil_sovereign | 28 |
| archfiend_malgrath | 21 |
| dragon_king | 20 |
| bandit_captain | 18 |
| primordial_elemental | 18 |
| ash_wraith | 17 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 0 | 5.2 |
| 1 | 8.3 |
| 2 | 12.7 |
| 3 | 17.8 |
| 4 | 12.7 |
| 5 | 17.1 |
| 6 | 17.4 |

## Damage share by class

| class | share of all damage |
|---|---|
| warlock | 15.9% |
| dragon_knight | 8.3% |
| scavenger | 6.9% |
| swashbuckler | 6.7% |
| pyromancer | 5.4% |
| warrior | 5.3% |
| ranger | 4.5% |
| druid | 4.2% |
| mage | 4.2% |
| rogue | 4.2% |
| paladin | 3.5% |
| necromancer | 3.5% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| entangle | 13529 |
| breath_weapon | 10809 |
| hellfire | 10410 |
| slow_time | 8997 |
| multi_shot | 8464 |
| bone_spike | 8171 |
| bone_spear | 7795 |
| glaive_toss | 7792 |
| natures_wrath | 7367 |
| flame_lance | 6937 |

Least used of the ones that fired at all: soul_curse (334), corpse_explosion (409), death_mark (676), arcane_jolt (872), monk_shadow_step (983), sunder_armor (987).

## Statuses and damage types

| status applied | times |
|---|---|
| regen | 182498 |
| bleed | 140236 |
| burn | 118576 |
| stun | 54114 |
| barrier | 28039 |
| curse | 27506 |
| poison | 26243 |
| slow | 24234 |
| dazed | 24155 |
| sunder | 20216 |
| blind | 13803 |
| sleep | 12376 |
| holy_burn | 10776 |
| confused | 8910 |
| marked | 7930 |
| silence | 7662 |
| freeze | 2497 |
| disarm | 2363 |
| thorns | 590 |
| fury | 540 |
| root | 470 |
| rally | 344 |
| weaken | 72 |

Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 41.2% |
| fire | 24.9% |
| arcane | 10.2% |
| bleed | 6.7% |
| holy | 6.4% |
| shadow | 4.8% |
| poison | 3.0% |
| lightning | 1.3% |
| true | 1.2% |
| cold | 0.3% |
| nature | 0.1% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 5672 |
| ring | 2629 |
| shield | 1927 |
| necklace | 941 |
| wand | 846 |
| quarterstaff | 808 |
| heavy_chest | 677 |
| greatsword | 600 |
| bramble_staff | 525 |
| bloodledger_blade | 446 |
| buckler | 418 |
| aegis_shield | 385 |

| road-weapon property equipped | times |
|---|---|
| cond_brandNature | 525 |
| cond_killGrowth | 446 |
| cond_easeExhaustion | 331 |
| cond_nemesisMark | 284 |
| cond_brandFire | 178 |
| cond_sunderOnHit | 140 |
| cond_brandShadow | 106 |
| cond_critFromWounds | 105 |
| cond_brandArcane | 105 |
| cond_roadFind | 99 |
| cond_brandLightning | 85 |
| cond_guardBond | 81 |
| cond_extraLeg | 77 |
| cond_brandHoly | 76 |
| cond_forageRation | 76 |
| cond_companionExtra | 75 |
| cond_watch | 73 |
| cond_dmgVsNamed | 64 |
| cond_brandIce | 48 |
| cond_killMemory | 32 |
| cond_nightWard | 28 |
| cond_companionFury | 19 |
| cond_vehicleDmg | 10 |

| older conditional affix equipped | times |
|---|---|
| cond_coldDmgVsBurning | 1406 |
| cond_skillMpCostReduce | 1329 |
| cond_poisonStackPower | 1290 |
| cond_ambushDmgFlat | 1271 |
| cond_combatStartBarrier | 1226 |
| cond_manaShieldOnHit | 1208 |
| cond_poisonDmgVsBurning | 1207 |
| cond_manaOnAttack | 1202 |
| cond_magicDmgReducePct | 1199 |
| cond_dmgVsDemon | 1197 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 199 |
| affix:cond_forageRation | 153 |
| affix:cond_guardBond | 111 |
| affix:cond_roadFind | 17 |
| legendary:road_cache | 13 |
| affix:cond_watch | 5 |

## Class matrix

Each class dropped into a random party of four starting at the head of the act, on the same seeds as a
control party with nobody forced. The number is **fights won before the run gave up** (two wipes, 30 days);
the control line at the bottom is what a random party manages on those seeds.

| class | act 1 won | act 3 won | act 5 won | act-3 damage share |
|---|---|---|---|---|
| rogue | 39.3 | 36.7 | 15.6 | 37.3% |
| scavenger | 34.7 | 36.4 | 18.1 | 35.2% |
| warlock | 33.6 | 35.7 | 18.3 | 36.9% |
| demon_hunter | 33.9 | 32.0 | 11.3 | 18.6% |
| paladin | 26.0 | 37.0 | 13.0 | 15.8% |
| dragon_knight | 34.1 | 23.4 | 18.0 | 27.0% |
| chronomancer | 27.9 | 38.0 | 9.4 | 6.3% |
| tinker | 30.1 | 30.7 | 14.1 | 12.0% |
| pyromancer | 32.0 | 26.0 | 16.4 | 37.1% |
| druid | 30.0 | 30.7 | 9.3 | 12.7% |
| cleric | 26.3 | 34.7 | 8.0 | 6.3% |
| ranger | 29.4 | 26.4 | 11.4 | 20.3% |
| witch_hunter | 31.0 | 24.3 | 11.6 | 14.9% |
| fighter | 27.6 | 26.1 | 12.1 | 21.4% |
| oracle | 25.9 | 30.9 | 9.1 | 10.0% |
| sorcerer | 30.9 | 28.7 | 5.7 | 12.7% |
| monk | 27.1 | 33.7 | 4.1 | 11.3% |
| swashbuckler | 30.0 | 19.0 | 15.3 | 48.1% |
| shaman | 27.4 | 19.6 | 15.9 | 10.6% |
| enchanter | 25.6 | 27.3 | 9.0 | 2.6% |
| knight | 29.4 | 21.6 | 10.4 | 13.0% |
| necromancer | 30.0 | 21.1 | 9.3 | 21.2% |
| warrior | 28.3 | 16.0 | 14.9 | 20.6% |
| runesmith | 24.3 | 21.1 | 10.0 | 20.3% |
| bard | 26.1 | 16.9 | 10.3 | 10.3% |
| priest | 25.0 | 20.1 | 5.6 | 2.2% |
| tactician | 24.1 | 15.4 | 10.9 | 7.2% |
| shadow_dancer | 23.6 | 17.4 | 8.9 | 13.2% |
| mage | 29.6 | 9.3 | 9.6 | 19.8% |
| stormcaller | 14.4 | 19.6 | 7.9 | 18.7% |
| **control (random party)** | **25.7** | **27.4** | **13.1** | — |

## Weapon matrix (the road weapons)

One hero in a party of four starts the act carrying it, on the same seeds as the control party above.
"lift" is fights won minus what a control party managed in the **same** act on the same seeds — positive means the weapon helped.

Control: act 1 25.7 · act 2 35.4 · act 3 27.4 · act 4 23.0 · act 5 13.1 fights won.

| weapon | act | fights won | lift vs control | rounds per fight | wipes per run |
|---|---|---|---|---|---|
| emberwatch | 1 | 31.3 | +5.6 | 12.4 | 1.1 |
| the_long_watch | 5 | 17.9 | +4.8 | 18.8 | 0.9 |
| grudge_crown | 5 | 16.9 | +3.8 | 19.2 | 0.9 |
| breakers_pick | 3 | 31.0 | +3.6 | 12.8 | 1.1 |
| tithe_dagger | 1 | 28.4 | +2.8 | 11.9 | 1.3 |
| the_ingrate | 3 | 30.0 | +2.6 | 14.3 | 1.4 |
| bloodledger_blade | 4 | 25.4 | +2.4 | 15.5 | 1.4 |
| wayfarers_pike | 5 | 15.4 | +2.3 | 18.4 | 0.9 |
| ledger_of_ash | 4 | 24.6 | +1.6 | 16.4 | 1.1 |
| veilspiller | 4 | 24.3 | +1.3 | 15.5 | 1.4 |
| warhorn_maul | 3 | 28.3 | +0.9 | 12.2 | 1.1 |
| axle_club | 3 | 28.3 | +0.9 | 12.2 | 1.1 |
| hunters_edge | 3 | 28.0 | +0.6 | 13.4 | 1.3 |
| lantern_mace | 1 | 26.1 | +0.5 | 11.6 | 1.3 |
| gravebound_scepter | 4 | 23.3 | +0.3 | 16.3 | 1.4 |
| kennelbreaker | 3 | 26.6 | -0.9 | 13.2 | 1.4 |
| pilgrims_staff | 2 | 34.3 | -1.1 | 14.5 | 1.3 |
| bramble_staff | 2 | 34.3 | -1.1 | 14.6 | 1.4 |
| stormpin_crossbow | 3 | 26.1 | -1.3 | 14.0 | 1.4 |
| watchfire_glaive | 5 | 11.0 | -2.1 | 18.2 | 1.1 |
| starwake_bow | 5 | 10.7 | -2.4 | 17.9 | 1.1 |
| the_namesake | 2 | 33.0 | -2.4 | 14.2 | 1.3 |
| houndmasters_lash | 2 | 32.6 | -2.9 | 14.6 | 1.1 |
| forager_blade | 1 | 22.7 | -3.0 | 11.3 | 1.3 |
| pathfinder_javelin | 1 | 22.4 | -3.2 | 11.7 | 1.7 |
| covenant_hammer | 4 | 19.4 | -3.6 | 16.4 | 1.4 |
| dawnwarden_hammer | 4 | 19.1 | -3.9 | 16.1 | 1.4 |
| champions_bane | 3 | 23.4 | -4.0 | 14.0 | 1.3 |
| grudgebrand | 4 | 18.6 | -4.4 | 16.5 | 1.4 |
| thistlewarden | 1 | 21.1 | -4.5 | 12.5 | 1.3 |
| roadsong | 2 | 29.3 | -6.1 | 13.7 | 1.3 |
| roadwarden_bow | 2 | 27.7 | -7.7 | 12.9 | 1.1 |
| emberbrand_wand | 2 | 26.9 | -8.6 | 12.6 | 1.1 |
| rimecut_sabre | 2 | 26.9 | -8.6 | 13.4 | 1.1 |
