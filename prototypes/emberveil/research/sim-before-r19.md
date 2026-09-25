# Emberveil 2 — simulation report

300 runs · seed 1 · day cap 140 · generated 2026-09-13

Run it again with `node tools/sim-emberveil.mjs --runs 300 --seed 1`.

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 28.0% |
| act reached on average | 4.5 |
| fights per run | 50.6 |
| rounds per fight | 12.5 |
| party wipes per run | 2.4 |
| average day of a wipe | 16.5 |
| days survived | 24.8 |
| hero level at the end | 24.4 |
| gold in hand at the end | 10345 |
| nights with no food | 17.0% of rests |
| night raids that wiped the party | 1.9% |
| acts cleared per run | 4.5 |
| crossings passed | 95.8% of 1049 |

## Per act: cleared, stalled, wiped

"Cleared" means the act boss went down and the party walked on. "Stalled" is a run that ended in that act.

| act | runs that got there | cleared it | stalled there | wipes in that act | wipes per 100 fights |
|---|---|---|---|---|---|
| 1 | 300 | 300 (100.0%) | 1 | 39 | 1.2 |
| 2 | 299 | 299 (99.7%) | 55 | 322 | 9.9 |
| 3 | 244 | 244 (81.3%) | 56 | 142 | 6.4 |
| 4 | 188 | 188 (62.7%) | 11 | 15 | 0.6 |
| 5 | 177 | 177 (59.0%) | 46 | 98 | 4.1 |
| 6 | 131 | 131 (43.7%) | 131 | 100 | 6.3 |

## The difficulty curve

One line per act: how long a fight runs, what share of the party's health bar it costs, how much enemy
HP and how much enemy damage-per-round the party is facing, and how good the gear on their backs is.

| act | rounds per fight | party HP lost per fight | enemy HP per fight | enemy dmg/round | avg equipped item score | damage dealt | damage taken |
|---|---|---|---|---|---|---|---|
| 1 | 7.1 | 11.7% | 323 | 50 | 41 | 319 | 147 |
| 2 | 11.2 | 19.3% | 1160 | 59 | 47 | 1050 | 339 |
| 3 | 15.3 | 10.4% | 3687 | 106 | 56 | 3604 | 460 |
| 4 | 11.6 | 2.1% | 4583 | 139 | 68 | 4625 | 352 |
| 5 | 16.0 | 6.8% | 7589 | 224 | 78 | 6948 | 603 |
| 6 | 18.0 | 7.1% | 11956 | 226 | 90 | 1763 | 130 |

## Level and purse at each act boundary

`xp table` is the XP the party actually holds against the XP the table wants for the level it is on —
over 100% means they are ahead of the curve and will level again soon.

| act | runs | day it started | party level | xp held | xp for that level | gold | avg equipped item score |
|---|---|---|---|---|---|---|---|
| 1 | 300 | 1.0 | 1.0 | 0 | 0 | 150 | 32 |
| 2 | 299 | 7.2 | 7.2 | 2365 | 1920 | 656 | 45 |
| 3 | 244 | 13.0 | 15.8 | 10635 | 10200 | 1783 | 52 |
| 4 | 188 | 17.9 | 24.9 | 26570 | 25560 | 4619 | 65 |
| 5 | 177 | 22.1 | 30.0 | 59300 | 38160 | 8114 | 75 |
| 6 | 131 | 27.7 | 30.0 | 117853 | 38160 | 14444 | 87 |

## Loot per act

| act | gold per fight | xp per fight | drops per fight | normal | magic | rare | legendary |
|---|---|---|---|---|---|---|---|
| 1 | 39.8 | 221.7 | 0.58 | 797 | 587 | 286 | 158 |
| 2 | 89.8 | 674.6 | 0.95 | 0 | 1074 | 1742 | 287 |
| 3 | 252.0 | 1547.0 | 1.70 | 0 | 0 | 2823 | 933 |
| 4 | 248.8 | 2335.7 | 1.20 | 0 | 0 | 452 | 2634 |
| 5 | 422.6 | 3899.7 | 1.32 | 0 | 0 | 468 | 2708 |
| 6 | 508.9 | 3969.7 | 1.56 | 0 | 0 | 298 | 2165 |

## Crossings

1049 crossings attempted · **95.8% passed** · 44 failed · 0 with no way through · 0 ended in a fight · 7 days spent.

| crossing | attempts | passed |
|---|---|---|
| cold_ford | 513 | 99.8% |
| scree_gate | 328 | 90.5% |
| grey_fen | 159 | 95.6% |
| fever_row | 28 | 82.1% |
| wardens_gate | 14 | 100.0% |
| broken_span | 6 | 100.0% |
| toll_stone | 1 | 100.0% |

## Damage by source

| source | share of hero damage |
|---|---|
| skill | 70.2% |
| status | 20.5% |
| weapon | 8.3% |
| proc | 1.0% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 1 | 39 |
| 2 | 55 | 322 |
| 3 | 56 | 142 |
| 4 | 11 | 15 |
| 5 | 46 | 98 |
| 6 | 131 | 100 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| boss | 404 | 56.4% |
| named | 196 | 27.4% |
| ordinary | 92 | 12.8% |
| night raid | 24 | 3.4% |

| enemy holding the field | wipes |
|---|---|
| lava_titan | 174 |
| molten_golem | 107 |
| dragon_king | 64 |
| emberveil_sovereign | 50 |
| archfiend_malgrath | 46 |
| hell_knight | 37 |
| the_architect | 30 |
| primordial_elemental | 29 |
| cinder_hound | 21 |
| abyssal_knight | 20 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 1 | 7.1 |
| 2 | 11.2 |
| 3 | 15.3 |
| 4 | 11.6 |
| 5 | 16.0 |
| 6 | 18.0 |

## Damage share by class

| class | share of all damage |
|---|---|
| swashbuckler | 11.2% |
| warlock | 9.7% |
| scavenger | 8.3% |
| dragon_knight | 7.9% |
| pyromancer | 6.5% |
| mage | 5.6% |
| ranger | 4.4% |
| warrior | 3.9% |
| necromancer | 3.7% |
| witch_hunter | 3.5% |
| rogue | 3.4% |
| paladin | 3.2% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| breath_weapon | 22564 |
| flourish | 21834 |
| entangle | 18972 |
| bone_spear | 18298 |
| bone_spike | 17664 |
| slow_time | 16790 |
| fireball | 16664 |
| hellfire | 16145 |
| arcane_surge | 16097 |
| flame_lance | 15761 |

Least used of the ones that fired at all: soul_curse (603), death_mark (1183), corpse_explosion (1255), smoke_trap (2107), hemorrhage (2162), monk_shadow_step (2190).

## Statuses and damage types

| status applied | times |
|---|---|
| bleed | 283879 |
| burn | 241356 |
| regen | 240573 |
| stun | 109805 |
| slow | 63221 |
| barrier | 51094 |
| dazed | 51078 |
| sunder | 47685 |
| poison | 45897 |
| curse | 45694 |
| sleep | 33881 |
| blind | 27771 |
| confused | 23473 |
| holy_burn | 19309 |
| marked | 18414 |
| silence | 16405 |
| freeze | 6291 |
| disarm | 5160 |
| fury | 1253 |
| root | 1113 |
| thorns | 741 |
| rally | 412 |
| weaken | 181 |

| status | rounds of uptime it bought | per fight |
|---|---|---|
| bleed | 719999 | 47.4 |
| burn | 714631 | 47.1 |
| regen | 614442 | 40.5 |
| poison | 170818 | 11.3 |
| barrier | 116617 | 7.7 |
| slow | 115141 | 7.6 |
| fury | 115137 | 7.6 |
| curse | 95282 | 6.3 |
| sunder | 93585 | 6.2 |
| stun | 93184 | 6.1 |
| dazed | 84057 | 5.5 |
| sleep | 64925 | 4.3 |

| act | status rounds on enemies per fight | on the party per fight |
|---|---|---|
| 1 | 14.1 | 12.1 |
| 2 | 110.7 | 50.9 |
| 3 | 283.2 | 90.7 |
| 4 | 248.3 | 59.2 |
| 5 | 286.8 | 78.2 |
| 6 | 60.9 | 16.1 |


Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 45.0% |
| fire | 22.7% |
| arcane | 9.6% |
| holy | 7.0% |
| bleed | 5.9% |
| shadow | 4.7% |
| poison | 2.1% |
| lightning | 1.5% |
| true | 1.1% |
| cold | 0.4% |
| nature | 0.0% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 17271 |
| ring | 7683 |
| shield | 5990 |
| quarterstaff | 2667 |
| necklace | 2256 |
| wand | 2184 |
| kite_shield | 1591 |
| heavy_chest | 1549 |
| tower_shield | 1542 |
| abyssal_rod | 1472 |
| aegis_shield | 1442 |
| pilgrims_staff | 1401 |

| road-weapon property equipped | times |
|---|---|
| cond_easeExhaustion | 1401 |
| cond_brandNature | 1388 |
| cond_killGrowth | 971 |
| cond_sunderOnHit | 671 |
| cond_nemesisMark | 604 |
| cond_brandFire | 592 |
| cond_brandShadow | 331 |
| cond_roadFind | 314 |
| cond_brandLightning | 296 |
| cond_critFromWounds | 242 |
| cond_brandArcane | 242 |
| cond_dmgVsNamed | 232 |
| cond_companionFury | 194 |
| cond_watch | 175 |
| cond_guardBond | 159 |
| cond_forageRation | 128 |
| cond_companionExtra | 107 |
| cond_killMemory | 84 |
| cond_brandHoly | 82 |
| cond_extraLeg | 79 |
| cond_nightWard | 74 |
| cond_brandIce | 68 |
| cond_vehicleDmg | 54 |

| affix on worn gear at the end of the run | runs |
|---|---|
| str | 704 |
| magicResist | 631 |
| goldFind | 630 |
| hp | 625 |
| lifeSteal | 621 |
| armor | 618 |
| con | 606 |
| dodge | 574 |
| dex | 568 |
| xpFind | 566 |
| int | 560 |
| manaSteal | 551 |
| mp | 508 |
| critDamage | 496 |

| rarity of worn gear at the end | pieces |
|---|---|
| legendary | 2736 (35.8%) |
| normal | 2259 (29.5%) |
| rare | 1583 (20.7%) |
| magic | 1067 (14.0%) |

| unique worn at the end | runs |
|---|---|
| ancient_dragon_scale | 34 |
| lava_titans_mantle | 20 |
| dragon_kings_headguard | 17 |
| sovereigns_eye | 17 |
| voidbinder | 13 |
| champions_bane | 10 |
| plate_of_creation | 10 |
| unravelers_sigil | 8 |
| malgraths_soulbrand | 8 |
| veilspiller | 6 |
| ledger_of_ash | 4 |
| staff_of_primordial | 3 |

| legendary power carried at the end | runs |
|---|---|
| cheat_death_once | 44 |
| dragon_fury_breath | 37 |
| echo_cast | 32 |
| low_mana_shockwave | 16 |
| strip_modifier | 10 |
| curse_spreads | 6 |
| kill_ledger | 4 |
| mage_missile_aoe | 3 |
| no_night_raids | 2 |
| road_cache | 1 |
| nemesis_hunter | 1 |

| set piece worn at the end | pieces |
|---|---|
| sovereigns_regalia | 27 |
| dragon_lords_aspect | 21 |
| architects_vestments | 18 |
| unravelers_mantle | 17 |
| fang_frost_wyrm | 13 |
| crimson_brotherhood | 12 |
| order_of_eclipse | 10 |
| clerics_vigil | 9 |

| older conditional affix equipped | times |
|---|---|
| cond_killInitBonus | 3802 |
| cond_lightningVsSlowed | 3784 |
| cond_extraSetPiece | 3493 |
| cond_poisonStackPower | 3456 |
| cond_consecutiveHitDmg | 3448 |
| cond_manaShieldOnHit | 3365 |
| cond_manaOnCrit | 3316 |
| cond_dmgVsUndead | 3287 |
| cond_partyHpOnKill | 3278 |
| cond_lowManaRegenBonus | 3256 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 516 |
| affix:cond_guardBond | 497 |
| affix:cond_forageRation | 227 |
| legendary:road_cache | 132 |
| affix:cond_roadFind | 40 |
| affix:cond_watch | 20 |
