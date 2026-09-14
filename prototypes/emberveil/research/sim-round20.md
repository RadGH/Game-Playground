# Emberveil 2 — simulation report

300 runs · seed 1 · day cap 140 · generated 2026-09-14

Run it again with `node tools/sim-emberveil.mjs --runs 300 --seed 1`.

## Headline

| number | value |
|---|---|
| full clears (all six acts) | 38.3% |
| act reached on average | 4.5 |
| fights per run | 88.0 |
| rounds per fight | 11.2 |
| party wipes per run | 2.1 |
| average day of a wipe | 29.3 |
| days survived | 52.7 |
| hero level at the end | 23.5 |
| gold in hand at the end | 21913 |
| nights with no food | 1.0% of rests |
| night raids that wiped the party | 4.2% |
| acts cleared per run | 3.8 |
| crossings passed | 94.3% of 3274 |

## Per act: cleared, stalled, wiped

"Cleared" means the act boss went down and the party walked on. "Stalled" is a run that ended in that act.

| act | runs that got there | cleared it | stalled there | wipes in that act | wipes per 100 fights |
|---|---|---|---|---|---|
| 1 | 300 | 254 (84.7%) | 46 | 278 | 4.6 |
| 2 | 254 | 243 (81.0%) | 11 | 44 | 1.1 |
| 3 | 243 | 203 (67.7%) | 40 | 114 | 2.2 |
| 4 | 203 | 177 (59.0%) | 26 | 64 | 1.4 |
| 5 | 177 | 159 (53.0%) | 18 | 46 | 1.2 |
| 6 | 159 | 115 (38.3%) | 159 | 96 | 3.3 |

## The difficulty curve

One line per act: how long a fight runs, what share of the party's health bar it costs, how much enemy
HP and how much enemy damage-per-round the party is facing, and how good the gear on their backs is.

| act | rounds per fight | party HP lost per fight | enemy HP per fight | enemy dmg/round | avg equipped item score | damage dealt | damage taken |
|---|---|---|---|---|---|---|---|
| 1 | 7.4 | 13.7% | 364 | 63 | 45 | 356 | 167 |
| 2 | 8.0 | 6.4% | 1022 | 57 | 57 | 999 | 217 |
| 3 | 11.3 | 3.9% | 3041 | 101 | 70 | 2531 | 272 |
| 4 | 13.6 | 1.8% | 6024 | 187 | 87 | 766 | 63 |
| 5 | 14.0 | 2.7% | 8797 | 240 | 101 | 0 | 0 |
| 6 | 15.7 | 2.1% | 13350 | 251 | 111 | 0 | 0 |

## Level and purse at each act boundary

`xp table` is the XP the party actually holds against the XP the table wants for the level it is on —
over 100% means they are ahead of the curve and will level again soon.

| act | runs | day it started | party level | xp held | xp for that level | gold | avg equipped item score |
|---|---|---|---|---|---|---|---|
| 1 | 300 | 1.0 | 1.0 | 0 | 0 | 150 | 32 |
| 2 | 254 | 15.5 | 9.0 | 3876 | 3420 | 936 | 50 |
| 3 | 243 | 25.1 | 15.6 | 13128 | 12700 | 1767 | 62 |
| 4 | 203 | 38.1 | 23.2 | 41032 | 36400 | 4286 | 75 |
| 5 | 177 | 50.5 | 28.6 | 96837 | 94000 | 9968 | 93 |
| 6 | 159 | 62.7 | 30.0 | 190184 | 110000 | 25482 | 105 |

## Loot per act

| act | gold per fight | xp per fight | drops per fight | normal | magic | rare | legendary |
|---|---|---|---|---|---|---|---|
| 1 | 33.1 | 168.9 | 0.73 | 1679 | 1189 | 1020 | 527 |
| 2 | 110.1 | 584.9 | 1.09 | 391 | 1537 | 1796 | 489 |
| 3 | 277.9 | 1188.5 | 1.29 | 0 | 636 | 4823 | 1288 |
| 4 | 365.9 | 2329.6 | 1.20 | 0 | 0 | 2049 | 3369 |
| 5 | 675.2 | 4110.9 | 1.31 | 0 | 0 | 1643 | 3396 |
| 6 | 783.4 | 3968.7 | 1.49 | 0 | 0 | 1109 | 3174 |

## Crossings

3274 crossings attempted · **94.3% passed** · 188 failed · 0 with no way through · 0 ended in a fight · 793 days spent.

| crossing | attempts | passed |
|---|---|---|
| scree_gate | 707 | 87.7% |
| cold_ford | 527 | 90.9% |
| fever_row | 474 | 98.9% |
| toll_stone | 359 | 100.0% |
| broken_span | 358 | 86.6% |
| wardens_gate | 330 | 100.0% |
| windbite_ridge | 317 | 100.0% |
| grey_fen | 202 | 100.0% |

## Damage by source

| source | share of hero damage |
|---|---|
| skill | 68.6% |
| status | 17.6% |
| weapon | 12.6% |
| proc | 1.2% |

## Where runs end

| act | runs that got no further | wipes in that act |
|---|---|---|
| 1 | 46 | 278 |
| 2 | 11 | 44 |
| 3 | 40 | 114 |
| 4 | 26 | 64 |
| 5 | 18 | 46 |
| 6 | 159 | 96 |

## What kills the party

| kind of fight | wipes | share |
|---|---|---|
| named | 247 | 38.5% |
| boss | 207 | 32.2% |
| ordinary | 109 | 17.0% |
| night raid | 79 | 12.3% |

| enemy holding the field | wipes |
|---|---|
| goblin_warrior | 152 |
| dragon_king | 81 |
| bandit | 48 |
| emberveil_sovereign | 40 |
| goblin_scout | 37 |
| star_horror | 35 |
| hell_knight | 33 |
| void_shade | 23 |
| goblin_warlord | 18 |
| genesis_worm | 18 |

## Fight length by act

| act | rounds per fight |
|---|---|
| 1 | 7.4 |
| 2 | 8.0 |
| 3 | 11.3 |
| 4 | 13.6 |
| 5 | 14.0 |
| 6 | 15.7 |

## Damage share by class

| class | share of all damage |
|---|---|
| swashbuckler | 10.1% |
| scavenger | 9.5% |
| warlock | 8.9% |
| dragon_knight | 7.3% |
| pyromancer | 5.0% |
| demon_hunter | 4.9% |
| rogue | 4.5% |
| warrior | 4.2% |
| witch_hunter | 4.1% |
| shadow_dancer | 4.0% |
| ranger | 4.0% |
| fighter | 3.8% |

## Skills the bot leans on

| skill | hits recorded |
|---|---|
| glaive_toss | 53618 |
| dance_of_blades | 48453 |
| purge_strike | 28789 |
| breath_weapon | 27170 |
| flourish | 25488 |
| bone_spear | 23998 |
| bone_spike | 22753 |
| flurry | 22052 |
| song_of_ruin | 21645 |
| hellfire | 21194 |

Least used of the ones that fired at all: soul_curse (452), corpse_explosion (2057), death_mark (2149), smoke_trap (2547), pilfer_magic (2761), hemorrhage (3000).

## Statuses and damage types

| status applied | times |
|---|---|
| bleed | 398438 |
| burn | 293068 |
| regen | 286282 |
| stun | 152241 |
| slow | 86051 |
| dazed | 80265 |
| sunder | 69645 |
| curse | 64961 |
| barrier | 62071 |
| sleep | 57192 |
| poison | 54050 |
| blind | 38945 |
| confused | 38739 |
| marked | 29269 |
| holy_burn | 27739 |
| silence | 20654 |
| freeze | 7853 |
| disarm | 6523 |
| root | 2241 |
| rally | 830 |
| fury | 719 |
| thorns | 237 |
| weaken | 189 |

| status | rounds of uptime it bought | per fight |
|---|---|---|
| bleed | 543332 | 20.6 |
| burn | 486719 | 18.4 |
| regen | 467457 | 17.7 |
| poison | 125244 | 4.7 |
| barrier | 89676 | 3.4 |
| sunder | 72906 | 2.8 |
| fury | 69696 | 2.6 |
| stun | 68404 | 2.6 |
| slow | 68070 | 2.6 |
| curse | 55046 | 2.1 |
| sleep | 51555 | 2.0 |
| blind | 42119 | 1.6 |

| act | status rounds on enemies per fight | on the party per fight |
|---|---|---|
| 1 | 18.1 | 11.7 |
| 2 | 112.4 | 42.8 |
| 3 | 195.2 | 52.6 |
| 4 | 38.5 | 11.6 |
| 5 | 0.0 | 0.0 |
| 6 | 0.0 | 0.0 |


Never applied in these runs: haste, block, deflect, enchant, taunt_totem, soulbind.

| damage type | total dealt |
|---|---|
| physical | 50.7% |
| fire | 18.5% |
| holy | 8.2% |
| arcane | 6.6% |
| bleed | 5.8% |
| shadow | 5.0% |
| poison | 1.9% |
| lightning | 1.9% |
| true | 1.2% |
| cold | 0.2% |
| nature | 0.0% |
| ice | 0.0% |

## Gear

| base picked up and worn | times |
|---|---|
| staff | 17218 |
| aegis_shield | 14357 |
| tower_shield | 9494 |
| ring | 7657 |
| shield | 7108 |
| kite_shield | 6851 |
| abyssal_rod | 6782 |
| bloodledger_blade | 4397 |
| grudgebrand | 3567 |
| buckler | 3298 |
| voidsteel_greatsword | 2898 |
| necklace | 2895 |

| road-weapon property equipped | times |
|---|---|
| cond_killGrowth | 4497 |
| cond_nemesisMark | 3572 |
| cond_brandNature | 2733 |
| cond_easeExhaustion | 2515 |
| cond_brandLightning | 1909 |
| cond_sunderOnHit | 1404 |
| cond_brandFire | 1035 |
| cond_roadFind | 817 |
| cond_brandShadow | 669 |
| cond_critFromWounds | 646 |
| cond_brandArcane | 646 |
| cond_dmgVsNamed | 635 |
| cond_companionFury | 627 |
| cond_brandHoly | 418 |
| cond_nightWard | 329 |
| cond_extraLeg | 290 |
| cond_forageRation | 288 |
| cond_watch | 280 |
| cond_companionExtra | 232 |
| cond_guardBond | 222 |
| cond_killMemory | 185 |
| cond_brandIce | 160 |
| cond_vehicleDmg | 145 |

| affix on worn gear at the end of the run | runs |
|---|---|
| goldFind | 1656 |
| lifeSteal | 1568 |
| xpFind | 1374 |
| critDamage | 1301 |
| dodge | 1235 |
| manaSteal | 1179 |
| str | 1158 |
| con | 1112 |
| magicResist | 1084 |
| int | 1047 |
| dex | 1031 |
| hp | 1015 |
| hpRegen | 1003 |
| armor | 932 |

| rarity of worn gear at the end | pieces |
|---|---|
| legendary | 5735 (57.6%) |
| rare | 1912 (19.2%) |
| normal | 1280 (12.9%) |
| magic | 1031 (10.4%) |

| unique worn at the end | runs |
|---|---|
| ancient_dragon_scale | 29 |
| sovereigns_eye | 27 |
| dragon_kings_headguard | 26 |
| lava_titans_mantle | 13 |
| plate_of_creation | 11 |
| voidbinder | 11 |
| champions_bane | 5 |
| veilspiller | 4 |
| staff_of_primordial | 3 |
| malgraths_soulbrand | 3 |
| grudge_crown | 3 |
| the_long_watch | 2 |

| legendary power carried at the end | runs |
|---|---|
| echo_cast | 40 |
| cheat_death_once | 40 |
| dragon_fury_breath | 39 |
| strip_modifier | 5 |
| curse_spreads | 4 |
| mage_missile_aoe | 3 |
| low_mana_shockwave | 3 |
| nemesis_hunter | 3 |
| no_night_raids | 2 |

| set piece worn at the end | pieces |
|---|---|
| sovereigns_regalia | 23 |
| architects_vestments | 20 |
| unravelers_mantle | 19 |
| ironveil_covenant | 17 |
| dragon_lords_aspect | 15 |
| order_of_eclipse | 14 |
| crimson_brotherhood | 11 |
| iron_brigade | 10 |

| older conditional affix equipped | times |
|---|---|
| cond_ambushDmgFlat | 8072 |
| cond_hpOnKill | 7898 |
| cond_cheatDeath | 7704 |
| cond_speedOnFirstHit | 7662 |
| cond_poisonDmgVsBurning | 7643 |
| cond_dmgVsUndead | 7533 |
| cond_extraSetPiece | 7532 |
| cond_critArmorPen | 7505 |
| cond_lightningVsSlowed | 7410 |
| cond_magicDmgReducePct | 7346 |

| road property that actually fired (rest / travel / victory) | times |
|---|---|
| affix:cond_killMemory | 1538 |
| affix:cond_watch | 671 |
| affix:cond_forageRation | 562 |
| affix:cond_guardBond | 517 |
| affix:cond_roadFind | 77 |
| legendary:road_cache | 45 |
