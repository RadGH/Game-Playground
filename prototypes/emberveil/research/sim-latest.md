# Emberveil 2 — simulation report

300 runs · seed 1 · day cap 140 · generated 2026-09-14

Run it again with `node tools/sim-emberveil.mjs --runs 300 --seed 1`.

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 12.0% |
| act reached on average | 3.5 |
| fights per run | 64.1 |
| rounds per fight | 11.5 |
| party wipes per run | 2.8 |
| average day of a wipe | 26.8 |
| days survived | 40.1 |
| hero level at the end | 19.5 |
| gold in hand at the end | 8045 |
| nights with no food | 1.3% of rests |
| night raids that wiped the party | 9.3% |
| acts cleared per run | 2.7 |
| crossings passed | 95.4% of 2480 |

## Per act: cleared, stalled, wiped

"Cleared" means the act boss went down and the party walked on. "Stalled" is a run that ended in that act.

| act | runs that got there | cleared it | stalled there | wipes in that act | wipes per 100 fights |
|---|---|---|---|---|---|
| 1 | 300 | 260 (86.7%) | 40 | 277 | 4.5 |
| 2 | 260 | 207 (69.0%) | 53 | 159 | 4.2 |
| 3 | 207 | 139 (46.3%) | 68 | 161 | 4.2 |
| 4 | 139 | 99 (33.0%) | 40 | 92 | 3.4 |
| 5 | 99 | 56 (18.7%) | 43 | 101 | 5.6 |
| 6 | 56 | 36 (12.0%) | 56 | 36 | 3.8 |

## The difficulty curve

One line per act: how long a fight runs, what share of the party's health bar it costs, how much enemy
HP and how much enemy damage-per-round the party is facing, and how good the gear on their backs is.

| act | rounds per fight | party HP lost per fight | enemy HP per fight | enemy dmg/round | avg equipped item score | damage dealt | damage taken |
|---|---|---|---|---|---|---|---|
| 1 | 7.4 | 13.8% | 364 | 63 | 45 | 356 | 168 |
| 2 | 9.9 | 11.4% | 1310 | 75 | 58 | 1279 | 296 |
| 3 | 12.1 | 7.0% | 3558 | 151 | 70 | 2909 | 340 |
| 4 | 16.0 | 6.7% | 8208 | 345 | 86 | 870 | 79 |
| 5 | 17.7 | 13.6% | 14125 | 572 | 101 | 0 | 0 |
| 6 | 17.6 | 11.0% | 21949 | 631 | 111 | 0 | 0 |

## Level and purse at each act boundary

`xp table` is the XP the party actually holds against the XP the table wants for the level it is on —
over 100% means they are ahead of the curve and will level again soon.

| act | runs | day it started | party level | xp held | xp for that level | gold | avg equipped item score |
|---|---|---|---|---|---|---|---|
| 1 | 300 | 1.0 | 1.0 | 0 | 0 | 150 | 32 |
| 2 | 260 | 15.7 | 9.0 | 3917 | 3420 | 880 | 51 |
| 3 | 207 | 25.9 | 15.8 | 13576 | 12700 | 1619 | 63 |
| 4 | 139 | 38.8 | 23.2 | 41376 | 36400 | 4062 | 77 |
| 5 | 99 | 50.9 | 27.4 | 93438 | 74000 | 8073 | 91 |
| 6 | 56 | 64.4 | 29.8 | 181503 | 150000 | 20483 | 104 |

## Loot per act

| act | gold per fight | xp per fight | drops per fight | normal | magic | rare | legendary |
|---|---|---|---|---|---|---|---|
| 1 | 30.1 | 170.2 | 0.74 | 1741 | 1229 | 1057 | 533 |
| 2 | 95.7 | 555.6 | 1.07 | 400 | 1555 | 1652 | 432 |
| 3 | 244.5 | 1147.2 | 1.24 | 0 | 469 | 3367 | 906 |
| 4 | 310.2 | 2223.7 | 1.15 | 0 | 0 | 1170 | 1940 |
| 5 | 533.3 | 3756.9 | 1.21 | 0 | 0 | 727 | 1436 |
| 6 | 642.2 | 3819.7 | 1.48 | 0 | 0 | 379 | 1033 |

## Crossings

2480 crossings attempted · **95.4% passed** · 113 failed · 0 with no way through · 0 ended in a fight · 770 days spent.

| crossing | attempts | passed |
|---|---|---|
| scree_gate | 517 | 92.3% |
| cold_ford | 414 | 92.8% |
| fever_row | 328 | 98.8% |
| toll_stone | 299 | 100.0% |
| broken_span | 286 | 86.4% |
| wardens_gate | 233 | 100.0% |
| windbite_ridge | 222 | 100.0% |
| grey_fen | 181 | 100.0% |

## Damage by source

| source | share of hero damage |
|---|---|
| skill | 65.9% |
| status | 19.8% |
| weapon | 13.1% |
| proc | 1.2% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 40 | 277 |
| 2 | 53 | 159 |
| 3 | 68 | 161 |
| 4 | 40 | 92 |
| 5 | 43 | 101 |
| 6 | 56 | 36 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| named | 357 | 43.2% |
| ordinary | 164 | 19.9% |
| boss | 162 | 19.6% |
| night raid | 143 | 17.3% |

| enemy holding the field | wipes |
|---|---|
| goblin_warrior | 146 |
| hell_knight | 59 |
| bandit | 50 |
| primordial_elemental | 49 |
| molten_golem | 48 |
| goblin_scout | 38 |
| star_horror | 38 |
| archfiend_malgrath | 31 |
| emberveil_sovereign | 31 |
| lava_titan | 31 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 1 | 7.4 |
| 2 | 9.9 |
| 3 | 12.1 |
| 4 | 16.0 |
| 5 | 17.7 |
| 6 | 17.6 |

## Damage share by class

| class | share of all damage |
|---|---|
| warlock | 15.5% |
| scavenger | 10.5% |
| swashbuckler | 9.8% |
| dragon_knight | 9.3% |
| rogue | 7.4% |
| demon_hunter | 5.3% |
| pyromancer | 4.2% |
| ranger | 3.6% |
| paladin | 3.4% |
| warrior | 3.4% |
| mage | 2.7% |
| runesmith | 2.4% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| glaive_toss | 47114 |
| breath_weapon | 25512 |
| hellfire | 22806 |
| flourish | 22683 |
| dance_of_blades | 20630 |
| dragon_claw | 18595 |
| makeshift_bomb | 17846 |
| entangle | 17564 |
| multi_shot | 16744 |
| bone_spike | 16666 |

Least used of the ones that fired at all: soul_curse (565), corpse_explosion (1170), death_mark (1853), monk_shadow_step (2141), inquisitor_mark (2391), smoke_trap (2588).

## Statuses and damage types

| status applied | times |
|---|---|
| bleed | 307905 |
| burn | 232948 |
| regen | 210094 |
| stun | 113142 |
| curse | 64244 |
| slow | 60578 |
| dazed | 57290 |
| poison | 57266 |
| barrier | 46776 |
| sunder | 45830 |
| sleep | 36131 |
| confused | 29868 |
| blind | 27528 |
| holy_burn | 19091 |
| marked | 17720 |
| silence | 16896 |
| freeze | 5745 |
| disarm | 4185 |
| root | 2021 |
| fury | 646 |
| thorns | 506 |
| rally | 126 |
| weaken | 106 |

| status | rounds of uptime it bought | per fight |
|---|---|---|
| bleed | 472507 | 24.6 |
| burn | 429505 | 22.3 |
| regen | 411663 | 21.4 |
| poison | 130849 | 6.8 |
| barrier | 76687 | 4.0 |
| curse | 61012 | 3.2 |
| sunder | 59610 | 3.1 |
| stun | 58796 | 3.1 |
| slow | 57976 | 3.0 |
| fury | 51084 | 2.7 |
| sleep | 39940 | 2.1 |
| blind | 39487 | 2.1 |

| act | status rounds on enemies per fight | on the party per fight |
|---|---|---|
| 1 | 18.4 | 11.7 |
| 2 | 129.5 | 56.4 |
| 3 | 207.2 | 62.1 |
| 4 | 34.1 | 5.7 |
| 5 | 0.0 | 0.0 |
| 6 | 0.0 | 0.0 |


Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 49.3% |
| fire | 22.4% |
| bleed | 6.7% |
| arcane | 5.9% |
| holy | 5.8% |
| shadow | 4.2% |
| poison | 3.0% |
| true | 1.3% |
| lightning | 1.1% |
| cold | 0.2% |
| nature | 0.0% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 13625 |
| aegis_shield | 8735 |
| tower_shield | 6765 |
| shield | 5954 |
| kite_shield | 5082 |
| abyssal_rod | 4721 |
| ring | 4201 |
| bloodledger_blade | 2720 |
| buckler | 2476 |
| necklace | 2320 |
| voidsteel_greatsword | 2079 |
| bramble_staff | 1953 |

| road-weapon property equipped | times |
|---|---|
| cond_killGrowth | 2847 |
| cond_brandNature | 1953 |
| cond_nemesisMark | 1522 |
| cond_easeExhaustion | 1366 |
| cond_brandLightning | 1147 |
| cond_sunderOnHit | 922 |
| cond_brandFire | 889 |
| cond_roadFind | 562 |
| cond_dmgVsNamed | 477 |
| cond_nightWard | 418 |
| cond_brandShadow | 330 |
| cond_companionFury | 299 |
| cond_forageRation | 291 |
| cond_brandHoly | 217 |
| cond_companionExtra | 187 |
| cond_critFromWounds | 167 |
| cond_brandArcane | 167 |
| cond_killMemory | 155 |
| cond_extraLeg | 131 |
| cond_guardBond | 118 |
| cond_watch | 111 |
| cond_brandIce | 92 |
| cond_vehicleDmg | 87 |

| affix on worn gear at the end of the run | runs |
|---|---|
| goldFind | 1227 |
| lifeSteal | 1160 |
| xpFind | 1053 |
| dodge | 942 |
| manaSteal | 904 |
| str | 865 |
| con | 837 |
| critDamage | 836 |
| magicResist | 816 |
| int | 798 |
| hp | 794 |
| dex | 788 |
| hit | 745 |
| hpRegen | 739 |

| rarity of worn gear at the end | pieces |
|---|---|
| legendary | 3796 (41.7%) |
| rare | 1991 (21.9%) |
| normal | 1875 (20.6%) |
| magic | 1434 (15.8%) |

| unique worn at the end | runs |
|---|---|
| ancient_dragon_scale | 19 |
| lava_titans_mantle | 16 |
| sovereigns_eye | 8 |
| dragon_kings_headguard | 6 |
| malgraths_soulbrand | 5 |
| champions_bane | 4 |
| plate_of_creation | 4 |
| voidbinder | 3 |
| staff_of_primordial | 3 |
| unravelers_sigil | 2 |
| the_long_watch | 2 |
| grudge_crown | 1 |

| legendary power carried at the end | runs |
|---|---|
| cheat_death_once | 23 |
| dragon_fury_breath | 22 |
| echo_cast | 11 |
| low_mana_shockwave | 7 |
| strip_modifier | 4 |
| mage_missile_aoe | 3 |
| no_night_raids | 2 |
| nemesis_hunter | 1 |
| kill_ledger | 1 |
| road_cache | 1 |

| set piece worn at the end | pieces |
|---|---|
| unravelers_mantle | 12 |
| architects_vestments | 12 |
| arcanist_vestments | 12 |
| ironveil_covenant | 12 |
| iron_brigade | 11 |
| order_of_eclipse | 10 |
| dragon_lords_aspect | 10 |
| druidic_resurgence | 9 |

| older conditional affix equipped | times |
|---|---|
| cond_lowManaRegenBonus | 4852 |
| cond_combatStartBarrier | 4791 |
| cond_consecutiveHitDmg | 4757 |
| cond_cheatDeath | 4732 |
| cond_manaOnCrit | 4722 |
| cond_setThresholdReduce | 4683 |
| cond_lightningVsSlowed | 4678 |
| cond_ambushDmgFlat | 4661 |
| cond_extraSetPiece | 4606 |
| cond_manaShieldOnHit | 4578 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 1107 |
| affix:cond_forageRation | 509 |
| affix:cond_watch | 312 |
| affix:cond_guardBond | 168 |
| legendary:road_cache | 85 |
| affix:cond_roadFind | 74 |
