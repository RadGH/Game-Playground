# Emberveil 2 — simulation report

300 runs · seed 1 · day cap 140 · generated 2026-09-13

Run it again with `node tools/sim-emberveil.mjs --runs 300 --seed 1`.

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 11.3% |
| act reached on average | 3.3 |
| fights per run | 35.5 |
| rounds per fight | 12.5 |
| party wipes per run | 2.7 |
| average day of a wipe | 12.6 |
| days survived | 18.9 |
| hero level at the end | 17.2 |
| gold in hand at the end | 4875 |
| nights with no food | 9.3% of rests |
| night raids that wiped the party | 4.2% |
| acts cleared per run | 2.4 |
| crossings passed | 95.2% of 958 |

## Per act: cleared, stalled, wiped

"Cleared" means the act boss went down and the party walked on. "Stalled" is a run that ended in that act.

| act | runs that got there | cleared it | stalled there | wipes in that act | wipes per 100 fights |
|---|---|---|---|---|---|
| 1 | 300 | 274 (91.3%) | 26 | 212 | 6.3 |
| 2 | 274 | 188 (62.7%) | 86 | 334 | 11.9 |
| 3 | 188 | 109 (36.3%) | 79 | 149 | 9.2 |
| 4 | 109 | 77 (25.7%) | 32 | 61 | 4.3 |
| 5 | 77 | 49 (16.3%) | 28 | 40 | 4.3 |
| 6 | 49 | 34 (11.3%) | 49 | 28 | 5.4 |

## The difficulty curve

One line per act: how long a fight runs, what share of the party's health bar it costs, how much enemy
HP and how much enemy damage-per-round the party is facing, and how good the gear on their backs is.

| act | rounds per fight | party HP lost per fight | enemy HP per fight | enemy dmg/round | avg equipped item score | damage dealt | damage taken |
|---|---|---|---|---|---|---|---|
| 1 | 9.1 | 20.6% | 398 | 62 | 41 | 390 | 218 |
| 2 | 11.3 | 20.6% | 1127 | 56 | 48 | 1017 | 343 |
| 3 | 16.8 | 13.3% | 3673 | 101 | 56 | 3556 | 493 |
| 4 | 14.8 | 6.4% | 5807 | 179 | 66 | 5957 | 508 |
| 5 | 14.4 | 10.0% | 8354 | 231 | 74 | 7891 | 580 |
| 6 | 17.9 | 8.1% | 14061 | 249 | 86 | 2196 | 153 |

## Level and purse at each act boundary

`xp table` is the XP the party actually holds against the XP the table wants for the level it is on —
over 100% means they are ahead of the curve and will level again soon.

| act | runs | day it started | party level | xp held | xp for that level | gold | avg equipped item score |
|---|---|---|---|---|---|---|---|
| 1 | 300 | 1.0 | 1.0 | 0 | 0 | 150 | 32 |
| 2 | 274 | 7.7 | 6.8 | 2184 | 1950 | 609 | 46 |
| 3 | 188 | 13.6 | 14.1 | 10398 | 9300 | 1709 | 52 |
| 4 | 109 | 18.3 | 20.0 | 25000 | 23000 | 4268 | 59 |
| 5 | 77 | 22.5 | 25.2 | 55037 | 49600 | 7220 | 69 |
| 6 | 49 | 27.7 | 29.4 | 110638 | 94000 | 13172 | 79 |

## Loot per act

| act | gold per fight | xp per fight | drops per fight | normal | magic | rare | legendary |
|---|---|---|---|---|---|---|---|
| 1 | 33.2 | 193.2 | 0.55 | 793 | 532 | 334 | 185 |
| 2 | 79.5 | 612.7 | 0.93 | 236 | 833 | 1228 | 306 |
| 3 | 212.2 | 1346.6 | 1.38 | 0 | 236 | 1418 | 572 |
| 4 | 206.8 | 2055.6 | 1.08 | 0 | 0 | 613 | 930 |
| 5 | 382.9 | 3655.8 | 1.18 | 0 | 0 | 385 | 714 |
| 6 | 475.9 | 3839.1 | 1.57 | 0 | 0 | 206 | 614 |

## Crossings

958 crossings attempted · **95.2% passed** · 46 failed · 0 with no way through · 0 ended in a fight · 10 days spent.

| crossing | attempts | passed |
|---|---|---|
| cold_ford | 441 | 99.8% |
| scree_gate | 328 | 90.5% |
| grey_fen | 145 | 93.1% |
| broken_span | 22 | 90.9% |
| fever_row | 13 | 84.6% |
| toll_stone | 8 | 100.0% |
| wardens_gate | 1 | 100.0% |

## Damage by source

| source | share of hero damage |
|---|---|
| skill | 64.4% |
| status | 24.5% |
| weapon | 10.1% |
| proc | 1.1% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 26 | 212 |
| 2 | 86 | 334 |
| 3 | 79 | 149 |
| 4 | 32 | 61 |
| 5 | 28 | 40 |
| 6 | 49 | 28 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| boss | 405 | 49.2% |
| named | 256 | 31.1% |
| ordinary | 142 | 17.2% |
| night raid | 21 | 2.5% |

| enemy holding the field | wipes |
|---|---|
| lava_titan | 180 |
| molten_golem | 102 |
| goblin_warlord | 54 |
| emberveil_sovereign | 54 |
| goblin_warrior | 52 |
| hell_knight | 43 |
| archfiend_malgrath | 39 |
| veil_warden | 38 |
| cinder_hound | 35 |
| corrupted_bear | 29 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 1 | 9.1 |
| 2 | 11.3 |
| 3 | 16.8 |
| 4 | 14.8 |
| 5 | 14.4 |
| 6 | 17.9 |

## Damage share by class

| class | share of all damage |
|---|---|
| warlock | 16.1% |
| swashbuckler | 12.6% |
| dragon_knight | 8.2% |
| scavenger | 6.9% |
| rogue | 4.8% |
| pyromancer | 4.6% |
| warrior | 4.4% |
| paladin | 3.6% |
| mage | 3.5% |
| demon_hunter | 3.4% |
| ranger | 3.4% |
| necromancer | 3.4% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| flourish | 14314 |
| entangle | 13871 |
| breath_weapon | 13562 |
| hellfire | 13522 |
| bone_spike | 12125 |
| bone_spear | 10628 |
| glaive_toss | 10493 |
| dragon_claw | 9886 |
| multi_shot | 9745 |
| slow_time | 9548 |

Least used of the ones that fired at all: corpse_explosion (530), death_mark (670), soul_curse (690), inquisitor_mark (900), arcane_jolt (1035), monk_shadow_step (1111).

## Statuses and damage types

| status applied | times |
|---|---|
| regen | 168828 |
| bleed | 167987 |
| burn | 141738 |
| stun | 59883 |
| poison | 37825 |
| curse | 35800 |
| barrier | 30207 |
| slow | 29825 |
| dazed | 28528 |
| sunder | 26050 |
| blind | 19023 |
| sleep | 15755 |
| confused | 15041 |
| holy_burn | 11194 |
| silence | 10282 |
| marked | 8908 |
| freeze | 3346 |
| disarm | 2798 |
| thorns | 1133 |
| root | 886 |
| fury | 833 |
| rally | 486 |
| weaken | 86 |

| status | rounds of uptime it bought | per fight |
|---|---|---|
| regen | 453174 | 42.6 |
| bleed | 446650 | 42.0 |
| burn | 441832 | 41.5 |
| poison | 142390 | 13.4 |
| fury | 79002 | 7.4 |
| curse | 76828 | 7.2 |
| barrier | 71093 | 6.7 |
| slow | 60142 | 5.7 |
| stun | 54780 | 5.1 |
| sunder | 54750 | 5.1 |
| dazed | 51741 | 4.9 |
| blind | 32815 | 3.1 |

| act | status rounds on enemies per fight | on the party per fight |
|---|---|---|
| 1 | 15.3 | 15.8 |
| 2 | 106.9 | 50.7 |
| 3 | 273.2 | 108.8 |
| 4 | 284.2 | 89.5 |
| 5 | 289.7 | 83.3 |
| 6 | 82.5 | 34.4 |


Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 45.9% |
| fire | 22.8% |
| arcane | 8.7% |
| bleed | 6.4% |
| holy | 5.4% |
| shadow | 4.8% |
| poison | 3.4% |
| true | 1.2% |
| lightning | 1.1% |
| cold | 0.3% |
| nature | 0.0% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 9228 |
| shield | 3523 |
| ring | 2900 |
| quarterstaff | 1737 |
| necklace | 1512 |
| wand | 1222 |
| kite_shield | 1105 |
| tower_shield | 1086 |
| aegis_shield | 1052 |
| heavy_chest | 936 |
| abyssal_rod | 839 |
| buckler | 793 |

| road-weapon property equipped | times |
|---|---|
| cond_brandNature | 499 |
| cond_easeExhaustion | 477 |
| cond_brandFire | 420 |
| cond_killGrowth | 306 |
| cond_sunderOnHit | 161 |
| cond_roadFind | 146 |
| cond_dmgVsNamed | 140 |
| cond_nemesisMark | 138 |
| cond_critFromWounds | 130 |
| cond_brandArcane | 130 |
| cond_brandShadow | 100 |
| cond_forageRation | 99 |
| cond_companionExtra | 89 |
| cond_brandLightning | 65 |
| cond_nightWard | 61 |
| cond_companionFury | 57 |
| cond_killMemory | 54 |
| cond_brandIce | 54 |
| cond_brandHoly | 48 |
| cond_guardBond | 43 |
| cond_extraLeg | 40 |
| cond_watch | 36 |
| cond_vehicleDmg | 20 |

| affix on worn gear at the end of the run | runs |
|---|---|
| lifeSteal | 427 |
| str | 412 |
| magicResist | 409 |
| con | 409 |
| hp | 404 |
| armor | 388 |
| dodge | 386 |
| goldFind | 384 |
| xpFind | 379 |
| int | 351 |
| manaSteal | 348 |
| dex | 344 |
| hit | 331 |
| mp | 313 |

| rarity of worn gear at the end | pieces |
|---|---|
| normal | 2862 (42.0%) |
| rare | 1390 (20.4%) |
| legendary | 1307 (19.2%) |
| magic | 1257 (18.4%) |

| unique worn at the end | runs |
|---|---|
| lava_titans_mantle | 17 |
| sovereigns_eye | 11 |
| ancient_dragon_scale | 10 |
| champions_bane | 10 |
| malgraths_soulbrand | 6 |
| voidbinder | 5 |
| plate_of_creation | 4 |
| dragon_kings_headguard | 3 |
| veilspiller | 3 |
| the_long_watch | 2 |
| staff_of_primordial | 1 |
| grudge_crown | 1 |

| legendary power carried at the end | runs |
|---|---|
| dragon_fury_breath | 20 |
| echo_cast | 16 |
| cheat_death_once | 14 |
| strip_modifier | 10 |
| low_mana_shockwave | 6 |
| curse_spreads | 3 |
| no_night_raids | 2 |
| mage_missile_aoe | 1 |
| nemesis_hunter | 1 |
| kill_ledger | 1 |

| set piece worn at the end | pieces |
|---|---|
| unravelers_mantle | 10 |
| pilgrims_resolve | 8 |
| architects_vestments | 7 |
| clerics_vigil | 6 |
| sovereigns_regalia | 6 |
| shadow_adept | 6 |
| order_of_eclipse | 6 |
| hammerers_conviction | 5 |

| older conditional affix equipped | times |
|---|---|
| cond_speedOnFirstHit | 1629 |
| cond_fireDmgVsPoisoned | 1570 |
| cond_killInitBonus | 1545 |
| cond_ambushDmgFlat | 1544 |
| cond_sustainedDmgBonus | 1518 |
| cond_manaOnAttack | 1518 |
| cond_setThresholdReduce | 1517 |
| cond_lightningVsSlowed | 1493 |
| cond_cheatDeath | 1445 |
| cond_skillMpCostReduce | 1444 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 324 |
| affix:cond_guardBond | 165 |
| affix:cond_forageRation | 149 |
| affix:cond_roadFind | 29 |
| legendary:road_cache | 25 |
| affix:cond_watch | 5 |

## Class matrix

Each class dropped into a random party of four starting at the head of the act, on the same seeds as a
control party with nobody forced. The number is **fights won before the run gave up** (two wipes, 30 days);
the control line at the bottom is what a random party manages on those seeds.

| class | act 1 won | act 3 won | act 5 won | act-3 damage share |
|---|---|---|---|---|
| swashbuckler | 30.3 | 31.3 | 16.7 | 55.8% |
| warlock | 28.5 | 36.4 | 12.5 | 56.6% |
| rogue | 30.9 | 34.8 | 11.2 | 44.2% |
| scavenger | 33.1 | 26.7 | 6.6 | 45.5% |
| dragon_knight | 26.1 | 28.2 | 7.6 | 45.8% |
| witch_hunter | 28.8 | 25.9 | 5.8 | 15.1% |
| demon_hunter | 29.6 | 23.4 | 6.7 | 19.0% |
| shadow_dancer | 29.8 | 23.8 | 5.8 | 14.8% |
| cleric | 26.5 | 28.3 | 3.4 | 6.9% |
| ranger | 29.3 | 20.8 | 7.2 | 24.2% |
| bard | 23.9 | 29.3 | 3.8 | 9.7% |
| paladin | 24.3 | 24.3 | 7.2 | 22.5% |
| pyromancer | 24.4 | 26.0 | 3.5 | 37.1% |
| tinker | 23.9 | 25.2 | 4.0 | 11.9% |
| druid | 25.4 | 21.4 | 6.0 | 12.4% |
| chronomancer | 22.8 | 20.8 | 6.9 | 5.5% |
| runesmith | 20.0 | 21.9 | 8.1 | 22.7% |
| monk | 20.5 | 23.8 | 5.4 | 12.1% |
| sorcerer | 24.9 | 19.9 | 4.6 | 14.6% |
| knight | 24.7 | 20.7 | 3.5 | 19.1% |
| fighter | 24.6 | 20.8 | 3.3 | 20.5% |
| shaman | 22.7 | 17.7 | 8.3 | 8.4% |
| warrior | 25.5 | 16.5 | 4.9 | 22.0% |
| priest | 21.5 | 22.1 | 2.5 | 2.4% |
| mage | 24.3 | 17.2 | 3.0 | 29.9% |
| oracle | 18.7 | 20.8 | 3.5 | 12.1% |
| necromancer | 21.5 | 16.8 | 4.2 | 27.1% |
| stormcaller | 15.8 | 18.4 | 2.5 | 16.2% |
| enchanter | 17.9 | 15.6 | 3.0 | 3.3% |
| tactician | 16.4 | 16.3 | 3.3 | 6.1% |
| **control (random party)** | **25.7** | **30.6** | **6.0** | — |

## Weapon matrix (the road weapons)

One hero in a party of four starts the act carrying it, on the same seeds as the control party above.
"lift" is fights won minus what a control party managed in the **same** act on the same seeds — positive means the weapon helped.

Control: act 1 25.7 · act 2 26.5 · act 3 30.6 · act 4 17.8 · act 5 6.0 fights won.

| weapon | act | fights won | lift vs control | rounds per fight | wipes per run |
|---|---|---|---|---|---|
| veilspiller | 4 | 25.9 | +8.1 | 18.9 | 1.8 |
| starwake_bow | 5 | 11.9 | +5.9 | 22.7 | 1.5 |
| roadsong | 2 | 30.8 | +4.3 | 15.7 | 1.5 |
| grudgebrand | 4 | 21.7 | +3.9 | 19.7 | 1.7 |
| watchfire_glaive | 5 | 9.8 | +3.8 | 22.2 | 1.5 |
| grudge_crown | 5 | 9.4 | +3.3 | 18.8 | 1.5 |
| the_namesake | 2 | 29.2 | +2.6 | 16.3 | 1.5 |
| the_long_watch | 5 | 8.4 | +2.3 | 19.8 | 1.5 |
| covenant_hammer | 4 | 19.7 | +1.9 | 21.0 | 2.0 |
| forager_blade | 1 | 26.9 | +1.2 | 12.9 | 1.3 |
| wayfarers_pike | 5 | 7.2 | +1.2 | 20.1 | 1.5 |
| dawnwarden_hammer | 4 | 18.9 | +1.1 | 21.1 | 2.0 |
| bramble_staff | 2 | 27.4 | +0.8 | 14.9 | 1.4 |
| pilgrims_staff | 2 | 27.1 | +0.5 | 14.8 | 1.3 |
| ledger_of_ash | 4 | 18.0 | +0.2 | 19.3 | 1.6 |
| roadwarden_bow | 2 | 26.6 | +0.1 | 14.9 | 1.4 |
| bloodledger_blade | 4 | 17.7 | -0.1 | 20.5 | 2.0 |
| tithe_dagger | 1 | 25.5 | -0.3 | 12.1 | 1.4 |
| hunters_edge | 3 | 30.0 | -0.6 | 16.6 | 1.5 |
| emberbrand_wand | 2 | 25.6 | -0.9 | 15.2 | 1.5 |
| lantern_mace | 1 | 24.6 | -1.1 | 12.2 | 1.5 |
| rimecut_sabre | 2 | 25.4 | -1.2 | 15.4 | 1.5 |
| houndmasters_lash | 2 | 25.1 | -1.5 | 15.6 | 1.5 |
| pathfinder_javelin | 1 | 24.1 | -1.6 | 12.5 | 1.4 |
| emberwatch | 1 | 23.7 | -2.0 | 14.1 | 1.4 |
| gravebound_scepter | 4 | 15.1 | -2.7 | 19.7 | 1.8 |
| stormpin_crossbow | 3 | 27.2 | -3.4 | 17.5 | 1.4 |
| thistlewarden | 1 | 20.3 | -5.5 | 12.0 | 1.4 |
| champions_bane | 3 | 25.0 | -5.6 | 16.6 | 1.4 |
| warhorn_maul | 3 | 24.3 | -6.3 | 17.9 | 1.5 |
| axle_club | 3 | 24.3 | -6.3 | 17.9 | 1.5 |
| breakers_pick | 3 | 23.5 | -7.1 | 17.6 | 1.6 |
| the_ingrate | 3 | 19.5 | -11.2 | 16.7 | 1.5 |
| kennelbreaker | 3 | 19.4 | -11.2 | 17.2 | 1.5 |
