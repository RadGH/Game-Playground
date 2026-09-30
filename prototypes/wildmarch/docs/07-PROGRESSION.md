# WILDMARCH — Design Bible, page 07: Progression

**Status:** v0.1 draft — 2026-09-29. **Owns:** the XP formula and table, every XP source, **the feature-unlock
ladder** (what opens at every level from 1 to 60, and whether by level or by quest), unlock cards and the
Unlocks screen, attributes, the perk forest at cap 60, the talent schedule, retraining, dual spec, reputation,
renown, achievements, collections and titles.
**Reads from:** [page 00](00-OVERVIEW.md) (canon: cap 60, ladder 1/4/10/18/28/40, callings 6/20/40, talent
tiers 12/22/32/45, 59 perk points), [page 05](05-COMBAT.md) (formulas), [page 06](06-CLASSES.md) (class
system), [page 14](14-QUESTS-EVENTS.md) (quest content), [page 15](15-SOCIAL-ONLINE.md) (group finder, guilds, PvP).

Farhold paths are relative to `prototypes/farhold/`. `(reuse: path)` = exists in Farhold; `(new)` = Wildmarch only.
Quest ids and NPC ids on this page are **proposed**; page 14 (quests) and page 01 (NPCs, towns) adopt or rename
them and this page follows.

---

## Contents

- [The shape of a character's life](#the-shape-of-a-characters-life)
- [Levels and XP](#levels-and-xp)
  - [The XP formula](#the-xp-formula)
  - [The XP table, 1 to 60](#the-xp-table-1-to-60)
  - [Where XP comes from](#where-xp-comes-from)
- [The feature-unlock ladder](#the-feature-unlock-ladder)
  - [The ladder, level by level](#the-ladder-level-by-level)
  - [Unlock cards](#unlock-cards)
  - [Every unlock, one paragraph each](#every-unlock-one-paragraph-each)
- [Attributes](#attributes)
- [Perk forest](#perk-forest)
- [Talents](#talents)
- [Retraining](#retraining)
- [Reputation](#reputation)
- [Renown](#renown)
- [Achievements](#achievements)
- [Collections](#collections)
- [Titles](#titles)
- [What changed from Farhold](#what-changed-from-farhold)
- [Data shapes](#data-shapes)
- [Open questions](#open-questions)

---

## The shape of a character's life

Canon pillar 1: **earn every verb.** A new character has one spell, a stick, a torch and a road. Everything
else is handed over one piece at a time, each with a card that says what it is and what it does in numbers.

| Stage | Levels | Region(s) | Hours (target, first character) | What the player gets |
|---|---|---|---|---|
| **The valley** | 1–6 | Hearthvale | ~1 h | sprint, the perk forest, the potion belt, spell 2, the dodge roll, the first calling, the first dungeon |
| **The road out** | 6–12 | Mossfen, Highcourt | ~1.5 h | the homeward stone, a follower, crafting, spell 3, a mount, the capital (bank, mail, market), waystones, the first talents |
| **The middle march** | 12–30 | Greyridge → Whisperwood | ~11 h | spell 4, spell 5, the second calling, faster riding, PvP, guilds, the wardrobe, the first raid, dual spec |
| **The hard north** | 30–48 | Cinder Steppe → Drowned Coast | ~34 h | spell 6, the third calling, the sea-steed, talents tier 3–4, two more raids |
| **The last climb** | 48–60 | Riftmarch, Emberthrone | ~56 h | the end of the story, then Heroic, Mythic+, the last raids, renown, the sky |
| **Level 60** | 60 | Veilspire Isle + everywhere | open | renown, reputation, the flying chain, achievements, collections |

---

## Levels and XP

### The XP formula

**Farhold today** `(reuse: js/rpg.js xpForLevel, setLevelCap)`: a three-part curve written in fractions of the
level cap — levels 1 to 60% of the cap cost `58 × ((n − 1) × stretch)^1.86`, the next 20% cost as much again,
and the last 20% cost 1.9× the first part. Stretched to cap 60 it takes 118,728 XP to reach 60, and it has
**two dips**: the joins at 60% and 80% of the cap make the level straight after each join *cheaper* than the
one before it.

| Farhold at cap 60 | XP to next |
|---|---:|
| 35 → 36 | 1,598 |
| **36 → 37** | **1,063** (cheaper than the level before) |
| 47 → 48 | 3,374 |
| **48 → 49** | **1,576** (cheaper than the level before) |

**Wildmarch** keeps the idea (each level costs more than the last, the top is much steeper than the bottom,
the curve is written once and every XP award is a share of it) and replaces the three-part curve with **one
smooth formula** that has no dips `(new)`:

```
XP to go from level L to L + 1 = round to the nearest 10 of ( 600 × 1.107 ^ (L − 1) )
XP to reach level L            = sum of the above for every level below L
Target time at level L         = 10 minutes × 1.065 ^ (L − 1)
```

Why these numbers:

- **1.107** a level makes the last level (59 → 60) cost 364× the first. The **time** a level takes grows by
  **1.065** a level (10 minutes at level 1, 6 h 26 min at level 59), and the difference between the two
  — **1.04** a level — is how much faster XP arrives as you level (kills and quests both grow by 1.04 a level).
- **Level 60 in about 103 hours** of play for a first character. Rested XP, the account bonus and groups make
  later characters faster ([Where XP comes from](#where-xp-comes-from)).
- Farhold's R22 complaint was "I reach level 12 before I even leave the first zone" and R25 "the game progresses
  way too quickly". Here Hearthvale (1–6) is about an hour and level 12 is about 2.5 hours.

### The XP table, 1 to 60

"Normal kill" is the XP for a normal-rank enemy of that level, killed solo at even level, before bonuses.
"Quest (normal)" is a normal quest of that level. Both are defined in [Where XP comes from](#where-xp-comes-from).

| Level | XP to next | Cumulative XP to reach | Target time at this level | Cumulative play time | Normal kill (even level) | Quest (normal) |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 600 | 0 | 10 min | 0 min | 10 | 40 |
| 2 | 660 | 600 | 11 min | 10 min | 10 | 50 |
| 3 | 740 | 1,260 | 11 min | 21 min | 11 | 50 |
| 4 | 810 | 2,000 | 12 min | 32 min | 11 | 60 |
| 5 | 900 | 2,810 | 13 min | 44 min | 12 | 60 |
| 6 | 1,000 | 3,710 | 14 min | 57 min | 12 | 70 |
| 7 | 1,100 | 4,710 | 15 min | 1 h 11 min | 13 | 80 |
| 8 | 1,220 | 5,810 | 16 min | 1 h 25 min | 13 | 90 |
| 9 | 1,350 | 7,030 | 17 min | 1 h 41 min | 14 | 90 |
| 10 | 1,500 | 8,380 | 18 min | 1 h 57 min | 14 | 110 |
| 11 | 1,660 | 9,880 | 19 min | 2 h 15 min | 15 | 120 |
| 12 | 1,840 | 11,540 | 20 min | 2 h 34 min | 15 | 130 |
| 13 | 2,030 | 13,380 | 21 min | 2 h 54 min | 16 | 140 |
| 14 | 2,250 | 15,410 | 23 min | 3 h 15 min | 17 | 160 |
| 15 | 2,490 | 17,660 | 24 min | 3 h 38 min | 17 | 170 |
| 16 | 2,760 | 20,150 | 26 min | 4 h 02 min | 18 | 190 |
| 17 | 3,050 | 22,910 | 27 min | 4 h 28 min | 19 | 210 |
| 18 | 3,380 | 25,960 | 29 min | 4 h 55 min | 19 | 240 |
| 19 | 3,740 | 29,340 | 31 min | 5 h 24 min | 20 | 260 |
| 20 | 4,140 | 33,080 | 33 min | 5 h 55 min | 21 | 290 |
| 21 | 4,580 | 37,220 | 35 min | 6 h 28 min | 22 | 320 |
| 22 | 5,070 | 41,800 | 38 min | 7 h 03 min | 23 | 350 |
| 23 | 5,620 | 46,870 | 40 min | 7 h 41 min | 24 | 390 |
| 24 | 6,220 | 52,490 | 43 min | 8 h 21 min | 25 | 440 |
| 25 | 6,880 | 58,710 | 45 min | 9 h 04 min | 26 | 480 |
| 26 | 7,620 | 65,590 | 48 min | 9 h 49 min | 27 | 530 |
| 27 | 8,430 | 73,210 | 51 min | 10 h 37 min | 28 | 590 |
| 28 | 9,340 | 81,640 | 55 min | 11 h 29 min | 29 | 650 |
| 29 | 10,330 | 90,980 | 58 min | 12 h 23 min | 30 | 720 |
| 30 | 11,440 | 101,310 | 1 h 02 min | 13 h 22 min | 31 | 800 |
| 31 | 12,660 | 112,750 | 1 h 06 min | 14 h 24 min | 32 | 890 |
| 32 | 14,020 | 125,410 | 1 h 10 min | 15 h 30 min | 34 | 980 |
| 33 | 15,520 | 139,430 | 1 h 15 min | 16 h 40 min | 35 | 1,090 |
| 34 | 17,180 | 154,950 | 1 h 20 min | 17 h 55 min | 36 | 1,200 |
| 35 | 19,020 | 172,130 | 1 h 25 min | 19 h 15 min | 38 | 1,330 |
| 36 | 21,050 | 191,150 | 1 h 31 min | 20 h 40 min | 39 | 1,470 |
| 37 | 23,310 | 212,200 | 1 h 37 min | 22 h 11 min | 41 | 1,630 |
| 38 | 25,800 | 235,510 | 1 h 43 min | 23 h 47 min | 43 | 1,810 |
| 39 | 28,560 | 261,310 | 1 h 49 min | 25 h 30 min | 44 | 2,000 |
| 40 | 31,620 | 289,870 | 1 h 57 min | 27 h 20 min | 46 | 2,210 |
| 41 | 35,000 | 321,490 | 2 h 04 min | 29 h 16 min | 48 | 2,450 |
| 42 | 38,740 | 356,490 | 2 h 12 min | 31 h 20 min | 50 | 2,710 |
| 43 | 42,890 | 395,230 | 2 h 21 min | 33 h 33 min | 52 | 3,000 |
| 44 | 47,480 | 438,120 | 2 h 30 min | 35 h 54 min | 54 | 3,320 |
| 45 | 52,560 | 485,600 | 2 h 40 min | 38 h 24 min | 56 | 3,680 |
| 46 | 58,180 | 538,160 | 2 h 50 min | 41 h 03 min | 58 | 4,070 |
| 47 | 64,410 | 596,340 | 3 h 01 min | 43 h 53 min | 61 | 4,510 |
| 48 | 71,300 | 660,750 | 3 h 13 min | 46 h 55 min | 63 | 4,990 |
| 49 | 78,930 | 732,050 | 3 h 25 min | 50 h 07 min | 66 | 5,530 |
| 50 | 87,370 | 810,980 | 3 h 39 min | 53 h 33 min | 68 | 6,120 |
| 51 | 96,720 | 898,350 | 3 h 53 min | 57 h 12 min | 71 | 6,770 |
| 52 | 107,070 | 995,070 | 4 h 08 min | 61 h 05 min | 74 | 7,490 |
| 53 | 118,530 | 1,102,140 | 4 h 24 min | 65 h 13 min | 77 | 8,300 |
| 54 | 131,210 | 1,220,670 | 4 h 42 min | 69 h 37 min | 80 | 9,180 |
| 55 | 145,250 | 1,351,880 | 5 h 00 min | 74 h 19 min | 83 | 10,170 |
| 56 | 160,790 | 1,497,130 | 5 h 19 min | 79 h 19 min | 86 | 11,260 |
| 57 | 178,000 | 1,657,920 | 5 h 40 min | 84 h 38 min | 90 | 12,460 |
| 58 | 197,050 | 1,835,920 | 6 h 02 min | 90 h 18 min | 94 | 13,790 |
| 59 | 218,130 | 2,032,970 | 6 h 26 min | 96 h 20 min | 97 | 15,270 |
| 60 | — (cap) | 2,251,100 | — | 102 h 46 min | 101 | 15,270 |

At 60 the XP bar becomes the **Renown** bar ([Renown](#renown)); kills and quests keep paying the level-60
amounts into it.

### Where XP comes from

**Target mix** over the whole climb: **40%** from kills, **45%** from quests, **15%** from events, discoveries
and dungeon completions. The formulas below are set so a player who follows the quests in a region gets
roughly that mix.

#### Kill XP and the grey-level rule

`(reuse: js/rpg.js killXpFor, data/balance.json xp — the rule; the base changes)`

```
killXP = round( 10 × 1.04 ^ (enemyLevel − 1) )        the "normal kill" column above
       × rank multiplier                               normal 1 · champion 2.4 · rare 4.5 · elite 2 · mini-boss 8 · dungeon boss 20 · world boss 30 (once a day)
       × grey rule                                     below
       × night 1.20 (page 05 §22)
       × rested 2.0 while rested XP lasts
       × (1 + xpFind%)                                 gear and perks, cap +100% (Farhold AFFIX_CAP)
       × group share                                   below
```

**The grey-level rule** (Farhold R22, kept exactly):

| Enemy level − your level | Kill XP × |
|---:|---:|
| −5 or lower (grey) | **0** — nothing at all, not a token 1 |
| −4 | 0.20 |
| −3 | 0.40 |
| −2 | 0.60 |
| −1 | 0.80 |
| 0 | 1.00 |
| +1 | 1.15 |
| +2 | 1.30 |
| +3 | 1.45 |
| +4 or higher | 1.60 (cap) |

Farhold's kill award is `base × 1.09^(level−1) × 0.2 × gap` (`xp.kill 0.2`, `enemies.xpPerLevel 1.09`). Wildmarch
restates the base so the numbers are readable (10 XP for a level-1 wolf) and the growth is the 1.04 that
matches the time targets.

#### Quest XP

```
questXP = round to 10 of ( 0.07 × XP-to-next(questLevel) ) × kind
kind:  normal 1 · bonus objective 0.5 · main story 2 · unlock quest (this page) 1.5 · calling quest 3 · daily (60) → renown
grey:  a quest 3+ levels below you pays −10% for every level past 2, down to 10%
```

About **six normal quests fill 42% of a level**, which is the 45% target once story quests are counted.
Farhold's `eventXp` scaled awards by the **zone's** level (R22: "walking to a landmark in a level-40 zone is
worth more"); Wildmarch keeps that — `questLevel` is the zone's level, not yours.

#### Events, discovery, dungeons, raids

| Source | XP | Farhold |
|---|---|---|
| Dynamic event (page 14) | 0.05 × XP-to-next(event level) × medal: gold 1.0 · silver 0.75 · bronze 0.5 | `eventXp(kind: 'event')` |
| Discovering a named area | 0.01 × XP-to-next(zone level) | — |
| First visit to a landmark | 0.02 × XP-to-next(zone level) | `eventXp(kind: 'landmark')` ×3 |
| Dungeon boss (Normal) | kill XP × 20 (the boss rank) | placed bosses |
| Dungeon completion (Normal, first each day per dungeon) | 0.30 × XP-to-next(dungeon's top level) | `clearRewardGold` only |
| Raids `r01`–`r03` below 60 | boss kill XP × 20, first kill per boss per week | — |
| World boss | kill XP × 30, once a day per boss | `worldbosses.json` |
| Heroic / Mythic+ / raids at 60 | renown only | — |

#### Rested XP `(new)`

- While logged out **in a town or at an inn** (inside a town's lamps), a character gains rested XP equal to
  **5% of the current level's XP-to-next every 8 hours**; logged out anywhere else, a quarter of that.
- Cap: **150%** of one level.
- While rested, **kill XP is doubled** (not quests, not events), and the rested pool drains by the bonus paid.
- The XP bar shows the rested amount as a pale blue extension; a moon icon at the portrait means "rested".

#### Group XP

- A kill's XP is shared among the **players** in the group who are within 60 m (or tagged the enemy):
  each gets `killXP × groupBonus(N) ÷ N`, with `groupBonus` = 1.00, 1.15, 1.30, 1.45, 1.60 for N = 1…5
  (a player in a group of 5 gets 32% of a solo kill, and the group kills more than five times as fast).
- Groups larger than 5 (raids) are counted as 5.
- **Followers and pets never take a share.** Their kills count as their owner's kills. (Farhold R22: "after
  just a few kills from my companions I was level 30" — the grey rule and the 75% follower damage cap fix
  the cause; followers taking no share keeps solo play from being punished for using them.)
- **Carry rule**: if the highest-level player in the group is **10 or more** levels above you, your share is
  halved. The grey rule is judged on **your own** level.
- Quests pay each player in full; events by each player's own medal.

#### The account bonus `(new)`

**Wayfarer's Memory**: every character on the account that has reached 60 gives every other character
**+10% XP** from all sources, up to **+30%**. Shown as a line on the XP bar tooltip.

---

## The feature-unlock ladder

The owner's key idea, and canon pillar 1: **start basic and unlock everything by level or by an important
quest.** Rules:

1. **Every unlock is announced** with a card, a sound and an entry on the Unlocks screen (canon rule 5).
2. A **level** unlock happens the moment you reach the level. A **quest** unlock happens when you turn the quest
   in; the quest is **offered** at that level (a courier finds you if you are nowhere near the giver) and a
   **gold pin** marks the giver on the map.
3. Nothing in the ladder is behind a paywall, a random drop or another player (except raids, which need a group
   by design).
4. The HUD's **"Next unlock"** line (under the XP bar) always names the next thing you will get and how:
   "Level 10 — a mount (quest in Highcourt)".
5. **Perk points** arrive at every level from 2 (canon: 59 in total) and are not repeated in the table.

### The ladder, level by level

**By** = `L` (reaching the level) or `Q` (a quest offered at that level). Paragraph links are to
[Every unlock, one paragraph each](#every-unlock-one-paragraph-each).

| Level | Unlock | By | Quest · giver · where |
|---:|---|:---:|---|
| 1 | **Day-one kit**: spell slot 1, basic weapon attacks, jog and jump, the torch, the 16-slot backpack, quest log, map, character sheet, achievements, collections, party and chat, Tend the Fallen | L | — |
| 2 | **Perk forest** (first perk point) | L | — |
| 2 | **Sprint** | Q | `q_hv_the_long_field` · `npc_hv_runner_tamsin` · Brightwater |
| 3 | **Potion belt** (2 slots) | Q | `q_hv_the_herbwifes_basket` · `npc_hv_herbwife_orla` · Brightwater orchards |
| 4 | **Spell slot 2** | L | — |
| 5 | **Dodge roll** | Q | `q_hv_fall_and_rise` · `npc_hesk` · Brightwater drill yard |
| 5 | **Player trade** | L | — |
| 6 | **Calling I** — the class mechanic | Q | `q_calling_<class>_1` · `npc_trainer_<class>` · Hall of Callings, Highcourt (letter by courier `npc_ollin_courier`) |
| 6 | **Group finder** and **dungeon journal** | Q | `q_hv_the_barrow_bell` · `npc_odile_marsh` · Brightwater |
| 7 | **Homeward stone** | Q | `q_hv_a_bed_by_the_fire` · `npc_hv_innkeeper_bram` · the Lamp and Ladder, Brightwater |
| 7 | **Bag slot 1** | L | — |
| 8 | **First follower slot** | Q | `q_mf_coin_for_a_blade` · `npc_mf_broker_wendel` · Reedhollow |
| 9 | **Salvage and the forge** (crafting) | Q | `q_mf_what_the_fen_gives_back` · `npc_mf_scrapwright_hesk` · Reedhollow |
| 9 | **Boats** (punt, barge and a personal raft/skiff/cutter) — *added from page 14* | Q | `q_unlock_boats` · `npc_corwin_reed` · `town_stillwater_landing` (page 01 §10.6) |
| 10 | **Spell slot 3** | L | — |
| 10 | **Riding I** — the first mount | Q | `q_hc_saddle_and_bridle` · `npc_oswin_stablemaster` · Stable Gate, Highcourt |
| 10 | **Challenge** (tank-capable classes only) | Q | `q_hc_hold_the_line` · `npc_hc_shieldmaster_varr` · Highcourt barracks |
| 10 | **Duels** | L | — |
| 11 | **Bank**, **mail** and **market** | Q | `q_hc_keys_to_the_city` · `npc_hc_herald_aldous` · Highcourt gate |
| 12 | **Talent tier 1** | L | — |
| 12 | **Waystones** (fast travel) | Q | `q_hc_the_waywardens_oath` · `npc_hc_waywarden_liss` · Waystone Circle, Highcourt |
| 12 | **Portals** (Highcourt Portal Court to every lit hub) — *added from page 14* | Q | `q_unlock_portals` · `npc_ysra_portalwarden` · `hc_portal_court`, Highcourt (page 01 §10.3) |
| 12 | **The Unbinder** (retraining) | L | `npc_the_unbinder` · Hall of Callings, Highcourt (and every hub from region 3 on) |
| 14 | **Bag slot 2** | L | — |
| 15 | **Follower slot 2** | L | — |
| 15 | **Guild charter** | Q | `q_hc_a_name_on_the_rolls` · `npc_melisande_hart` · Guild Row, Highcourt |
| 16 | **The upgrade bench** (temper, promote) | Q | `q_gr_the_second_hammer` · `npc_bodric_ashlock` · Anvilgate |
| 16 | **Potion belt, 4 slots** | L | — |
| 18 | **Spell slot 4** | L | — |
| 20 | **Calling II** | Q | `q_calling_<class>_2` · `npc_trainer_<class>` (letter by mail) |
| 20 | **Riding II** — faster mounts | Q | `q_ss_the_sand_runners` · `npc_zelde_marrach` · Dunehold |
| 20 | **Battlegrounds and war mode** (PvP) | Q | `q_hc_the_proving_yard` · `npc_brakka_arena` · Warden's Yard, Highcourt |
| 22 | **Talent tier 2** | L | — |
| 24 | **Bag slot 3** | L | — |
| 25 | **Follower slot 3** | L | — |
| 25 | **Skyways** (flight paths between roosts) — *added from page 14* | Q | `q_unlock_skyways` · `npc_tamsin_roost` · Stable Gate tower, Highcourt (page 01 §10.5) |
| 25 | **The wardrobe** (appearance changing) | Q | `q_ww_the_moonwell_mirror` · `npc_ww_glamourist_eluned` · Silverbough |
| 28 | **Spell slot 5** | L | — |
| 30 | **Dual spec** | Q | `q_hc_two_minds_one_will` · `npc_the_unbinder` · Hall of Callings, Highcourt |
| 30 | **Raid: Crypt of the Barrowking** (`r01_barrowking`) | Q | `q_hc_the_barrowkings_seal` · `npc_warden_of_bones` · the Undercroft, Highcourt |
| 32 | **Talent tier 3** | L | — |
| 34 | **The upgrade bench, second voice** (inscribe, reweave, recast, brand) | Q | `q_cs_brands_in_the_ash` · `npc_cs_runewright_gorsa` · Fort Ashfall |
| 35 | **Follower slot 4** | L | — |
| 36 | **Bag slot 4** | L | — |
| 40 | **Spell slot 6** | L | — |
| 40 | **Calling III** | Q | `q_calling_<class>_3` · a master of the class (class file) |
| 40 | **Riding III** — the swimming and leaping mount | Q | `q_dc_the_tide_steed` · `npc_dc_tidewright_morwen` · Saltmarch |
| 42 | **Raid: The Glacier Throne** (`r02_glacier_throne`) | Q | `q_fm_frost_under_the_throne` · `npc_hallveig_rime` · Rimehold |
| 45 | **Talent tier 4** | L | — |
| 50 | **Raid: The Sunken Choir** (`r03_sunken_choir`) | Q | `q_dc_the_choir_calls` · `npc_amos_keeper` · Lampwick Point |
| 60 | **Heroic dungeons** | Q | `q_el_the_heroic_road` · `npc_marshal_ansel_crane` · Last Light |
| 60 | **Mythic+ keystones** | Q | `q_el_the_keystone_vow` · `npc_el_keywarden_orrin` · Last Light (after one Heroic) |
| 60 | **Raid: The Ember Court** (`r04_ember_court`) | Q | `q_el_the_ember_court_gates` · `npc_marshal_ansel_crane` · Last Light |
| 60 | **Veilspire Isle** and **raid: Veilspire** (`r05_veilspire`) | Q | `q_vs_beyond_the_veil` (chain) · `npc_vs_veilwarden_isaure` · the Spire Landing |
| 60 | **Renown** | L | — |
| 60 | **Arenas** (rated PvP) | L | page 15 |
| 60 | **Daily and weekly quests** | L | quest boards in Last Light and the Spire Landing |
| 60 | **Riding IV — the sky** (flying mount) | Q | chain `q_sky_1` … `q_sky_5` · `npc_el_skywright_aveline` · Last Light |

Levels not in the table (13, 17, 19, 21, 23, 26, 27, 29, 31, 33, 37–39, 41, 43, 44, 46–49, 51–59) give a perk
point and nothing else from this ladder — the region, its dungeons and its story carry those levels.

### Unlock cards

`(new; screen ids proposed to page 03)`

- **The card** slides in at the top centre for 8 s (or until clicked), pauses nothing, and goes to the
  **Unlocks** list. It has: an icon, the unlock's name, one to three lines **in numbers** (Farhold `WORDING.md`
  rules), the key that uses it (from the live binding table), and a **Show me** button that opens the relevant
  screen or plays a 5 s demonstration.
- **Sound**: `ui_unlock` (an interface sting in the Sound Lab catalogue, `sfx/js/sfx.js` — reuse), and a Lingo
  line from the giver where there is one.
- **The Unlocks screen** `scr_unlocks` (a tab of the character screen): every row of the ladder, in order;
  done rows ticked with the date; the next three rows highlighted with how to get them; quest rows link to the
  quest and pin the giver.
- **Never repeated**: an unlock card shows once per character. Alts can turn cards into one-line log messages
  with `set.interface.compactUnlockCards` (page 04).

### Every unlock, one paragraph each

Card text is written exactly as it should appear. `[key]` means the live binding.

#### Unlock: Day-one kit

**Level 1, no quest.** A new character starts in Brightwater with: **spell slot 1** (the class's first spell);
**basic attacks** with the starting weapon (its pattern on the card); **jog** (5.4 m/s) and **jump**; a **torch**
in the light slot (34 m of light, `[L]` toggles it — reuse `js/light.js`); a **16-slot backpack**; the **quest
log**, the **map** (Hearthvale revealed as you walk), the **character sheet**, **achievements** and
**collections** (tracking from the first minute), **party invites, friends and chat**, and **Tend the Fallen**
(the shared out-of-combat revive, [page 06 §3.5](06-CLASSES.md#35-shared-verbs-proposed)). The first minutes are
a short guided walk (reuse the idea of Farhold's `js/onboarding.js` line: one objective at a time, ignorable).
**Card (shown as a four-card welcome):** "Your first spell: <name>. Press [1]." · "Hold [attack] to keep swinging. <Weapon>: <pattern glyphs>." · "Your torch lights 34 m. Press [L]." · "Follow the gold marker to your first task."

#### Unlock: Perk forest

**Level 2, no quest.** The first perk point arrives and the **Perks** tab opens ([Perk forest](#perk-forest)).
What it teaches: the forest is one tree for every class, you start in the middle, and a node is reachable when
something touching it is taken. **Card:** "Perk point: 1 to spend. Every level from now on gives 1 more. Open Perks with [N]."

#### Unlock: Sprint

**Level 2, quest `q_hv_the_long_field`, giver `npc_hv_runner_tamsin`** (Brightwater's message runner). Tamsin
needs a letter carried to the far orchard before the bell; the quest gives you sprint and a 60-second route to
run. What it teaches: sprint and the stamina bar ([page 05 §3.2](05-COMBAT.md#32-stamina-new)). **Card:**
"Sprint: hold [Shift] to run at 8.1 m/s. Costs 12 stamina a second in a fight, 4 out of one. Stamina refills 25 a second."

#### Unlock: Potion belt

**Level 3, quest `q_hv_the_herbwifes_basket`, giver `npc_hv_herbwife_orla`** (the orchard herbwife). Gather five
herbs; she brews your first two health potions. What it teaches: consumables on keys and the shared potion
cooldown. **Card:** "Potion belt: 2 slots on [7] and [8]. A health potion restores 35% of your health. All potions share a 60 s cooldown."

#### Unlock: Spell slot 2

**Level 4, no quest.** The class's second spell is learned automatically ([page 06 §5.2](06-CLASSES.md#52-how-a-spell-arrives)).
**Card:** "New spell: <name>. Press [2]. <generated description>."

#### Unlock: Dodge roll

**Level 5, quest `q_hv_fall_and_rise`, giver `npc_hesk`** (the Vale Wardens' drillmaster). Three
drills: roll through a swinging log, roll out of a red danger zone before it fills, and roll through a
sparring partner's overhead to earn a Riposte crit. What it teaches: i-frames, danger zones (the first
telegraph a player learns — page 11), and that rolling costs stamina. **Card:** "Dodge roll: press [Dodge]
to roll 4 m. For 0.3 s of the roll, nothing can hurt you. Costs 30 stamina."

#### Unlock: Player trade

**Level 5, no quest.** Direct trade with another player opens (it is held back until 5 to stop brand-new
throwaway characters from being used for spam). **Card:** "Trade: right-click a player and choose Trade."

#### Unlock: Calling I

**Level 6, quest `q_calling_<class>_1`, giver `npc_trainer_<class>`** in the **Hall of Callings**, Highcourt
(one trainer per class; page 01 places the hall). The call arrives as a letter by courier from the Hall of Callings (`npc_ollin_courier`, page 01), wherever you are. Structure and rewards: [page 06 §12](06-CLASSES.md#12-calling-quests).
What it teaches: the class mechanic, by making you use it. **Card:** "<Mechanic name>: <one sentence with a number, from the class file>. The gauge is above your spells."

#### Unlock: Group finder and dungeon journal

**Level 6, quest `q_hv_the_barrow_bell`, giver `npc_odile_marsh`.** Something has woken in the
Hollow Barrow (`d01_hollow_barrow`, levels 5–7). Odile opens the **dungeon journal** at the Barrow's page
(bosses, their mechanics, their loot — `scr_dungeon_journal`) and shows you the **group finder**
(`scr_group_finder`, page 15). The quest completes when you clear the Barrow, with players or with followers.
What it teaches: roles (tank, healer, damage/support) and that a Normal dungeon can be done with followers.
**Cards:** "Dungeon journal: every boss, every mechanic, every drop. Open with [Shift+J]." · "Group finder: queue as <your roles> for a dungeon. Open Social with [P], then Group Finder."

#### Unlock: Homeward stone

**Level 7, quest `q_hv_a_bed_by_the_fire`, giver `npc_hv_innkeeper_bram`** at the Lamp and Ladder. Bram gives
you a **Homeward Stone** (`it_homeward_stone`, a permanent item in its own slot on the belt). Using it: 10 s
channel, out of combat, returns you to the inn you set it at; **30 minute** cooldown. You can set it at any inn
by talking to the innkeeper. **Card:** "Homeward Stone: a 10 s channel takes you to <inn>. 30 min cooldown. Set it at any inn."

#### Unlock: Bag slots

**Levels 7, 14, 24 and 36, no quest.** Four bag slots beside the 16-slot backpack. Bags are items (8 to 18
slots, page 08); the first 8-slot bag is a reward from the level-7 homeward stone quest. **Card:** "Bag slot <n>: equip a bag to carry more. You have <n> of 4."

#### Unlock: First follower slot

**Level 8, quest `q_mf_coin_for_a_blade`, giver `npc_mf_broker_wendel`** (the mercenary broker in Reedhollow).
Wendel lends you a **Blade for Hire** for the quest (clearing a fen crossing) and then lets you hire from his
board. Follower rules: [page 06 §10](06-CLASSES.md#10-pets-and-class-companions); the ten mercenary kinds and
prices are Farhold's `data/mercenaries.json` (reuse; page 08 retunes prices). What it teaches: followers,
stances, and that a follower takes a group slot. **Card:** "Follower slot 1: hire a mercenary at any broker. More slots at levels 15, 25 and 35."

#### Unlock: Salvage and the forge

**Level 9, quest `q_mf_what_the_fen_gives_back`, giver `npc_mf_scrapwright_hesk`.** Break three unwanted items
into materials, then forge a base item from them at the bench. This is Farhold's crafting (reuse: `js/craft.js`,
`data/crafting.json` — "crafting from recycled gear only": three materials, a Crafting tab that forges a base
you pick). **Card:** "Salvage: break an item into materials ([Salvage] in the bag). Forge: make a base item from materials at any forge."

#### Unlock: Boats *(added from page 14)*

**Level 9, quest `q_unlock_boats` "Mind the Punt", giver `npc_corwin_reed`** at `town_stillwater_landing`. Ride the
punt, then row a raft 100 m. Opens the ferry routes and the personal boat (raft / skiff / cutter, auto-equipped in
deep water; reuse: Farhold `js/boat.js`). Routes, times and fares are page 01 §10.6. Boats are an unlock, not loot
(page 08 §20). **Card:** "Boats: ride ferries between docks, and row your own boat in deep water."

#### Unlock: Spell slot 3

**Level 10, no quest.** **Card:** "New spell: <name>. Press [3]. <generated description>."

#### Unlock: Riding I

**Level 10, quest `q_hc_saddle_and_bridle`, giver `npc_oswin_stablemaster`** at the Stable Gate in Highcourt.
Oswin gives you a **Trail Horse** (`it_mount_trail_horse`, Common, in the mount slot; page 08 §20.1) and a lesson: mount, gallop, get
thrown. Mounts are **gear** in the mount slot with rarity and affixes (Farhold R10: "a mount is loot";
`js/gear.js`, reuse); riding skill decides the **speed** a mount may reach.

| Riding | Level | Ground speed | Extra |
|---|---:|---|---|
| I | 10 | +60% (8.6 m/s) | gallop: +35% for 4 s, then 3 s to recover (Farhold `gallopBonus`, `gallopSeconds`) |
| II | 20 | +100% (10.8 m/s) | — |
| III | 40 | +100% | swim at +80% on the surface; leap 6 m forward (Space while galloping) |
| IV | 60 | +100% ground, +150% flying (13.5 m/s) | flight where allowed (page 01) |

**Winged mounts before Riding IV** (griffin, drake, dragon, phoenix, Stormwing): they run like any mount and
**glide** — from any drop of 4 m or more (page 08 §20.1) they glide forward at their ground speed; they cannot
climb. Riding IV lets every winged mount **fly** (canon 00 §10).

Mounting is a 1.5 s cast, not in combat. A hit while mounted **Dazes** you and dismounts you (page 05 §10.4).
**Card:** "Riding I: summon your mount with [H]. Rides at 8.6 m/s. You cannot mount in a fight."

#### Unlock: Challenge

**Level 10, quest `q_hc_hold_the_line`, giver `npc_hc_shieldmaster_varr`** — offered only to the eight
tank-capable classes ([page 06 §3.5](06-CLASSES.md#35-shared-verbs-proposed)). Varr's drill: pull three
sparring partners off a recruit and hold them for 20 s. What it teaches: threat, the nameplate threat glow,
taunt. **Card:** "Challenge: press [Challenge] to make one enemy within 20 m attack you for 3 s. 8 s cooldown."

#### Unlock: Duels

**Level 10, no quest.** **Card:** "Duels: right-click a player and choose Duel. A duel ends at 1 health."

#### Unlock: Bank, mail and market

**Level 11, quest `q_hc_keys_to_the_city`, giver `npc_hc_herald_aldous`** at Highcourt's gate. A walk through
the capital with three stops, each an unlock: the **bank** (48 slots, shared by nothing — page 15 owns account
storage), the **mailbox** (send items and gold), the **market** (the player auction, page 15). **Cards:** "Bank: 48 slots of storage at any banker." · "Mail: send items and gold from any mailbox." · "Market: buy and sell with other players in any capital."

#### Unlock: Talent tier 1

**Level 12, no quest.** Every spell you have gets its first talent pick ([page 06 §13](06-CLASSES.md#13-talents)).
**Card:** "Talents: choose 1 of 2–3 changes for each spell. Open Talents with [K]; the Talents tab is in the Spellbook. Choosing into an empty tier is free."

#### Unlock: Portals *(added from page 14)*

**Level 12, quest `q_unlock_portals` "Doors in the Court", giver `npc_ysra_portalwarden`** in Highcourt's Portal Court
(`hc_portal_court`). A portal stone to a region hub opens once you have lit that hub's waystone; every hub has a
return portal to Highcourt (page 01 §10.3; reuse: Farhold `js/portal.js`). **Card:** "Portals: step through a
portal stone in Highcourt to any hub whose waystone you have lit."

#### Unlock: Waystones

**Level 12, quest `q_hc_the_waywardens_oath`, giver `npc_hc_waywarden_liss`** at the Waystone Circle. Every region
has 3–6 waystones (page 01). **Attune** one by touching it (once per character). Then, from any attuned
waystone, travel to any other: **5 s channel, out of combat, cost 1 silver × destination region's level**
(page 08 may retune), no cooldown. The quest attunes Highcourt's and walks you to Brightwater's and Reedhollow's.
**Card:** "Waystones: touch one to attune it. From any attuned waystone, travel to another for 1 silver × the destination region's level."

#### Unlock: The Unbinder

**Level 12, no quest.** `npc_the_unbinder` in Highcourt (and an Unbinder in every hub from Anvilgate on)
starts talking to you: retraining talents and perks for gold ([Retraining](#retraining)). **Card:** "The Unbinder: forget a talent or a perk for gold. Found in every hub town."

#### Unlock: Follower slots 2, 3 and 4

**Levels 15, 25 and 35, no quest.** **Card:** "Follower slot <n>: <n> followers may walk with you. In a dungeon, each takes a group slot."

#### Unlock: Guild charter

**Level 15, quest `q_hc_a_name_on_the_rolls`, giver `npc_melisande_hart`.** Anyone may **join** a guild
from level 1; **founding** one needs this quest (a name, a tabard design, 4 other signatures, 10 gold). Page 15
owns guilds. **Card:** "Guild charter: found a guild at Guild Row with 4 other signatures."

#### Unlock: The upgrade bench

**Level 16, quest `q_gr_the_second_hammer`, giver `npc_bodric_ashlock`** in Anvilgate. Farhold's
**Upgrade** tab (reuse: `js/craft.js`): **temper** (re-roll one affix's value inside its range) and **promote**
(raise an item's rarity one step, adding an affix). **Card:** "Upgrade bench: temper an affix's number or promote an item one rarity. Any forge from now on."

#### Unlock: Potion belt, 4 slots

**Level 16, no quest.** **Card:** "Potion belt: 2 more slots, on [9] and [0]."

#### Unlock: Spell slot 4

**Level 18, no quest.** **Card:** "New spell: <name>. Press [4]. <generated description>."

#### Unlock: Calling II

**Level 20, quest `q_calling_<class>_2`.** A letter from your trainer arrives by mail at 20. [Page 06 §12](06-CLASSES.md#12-calling-quests).
**Card:** "<Mechanic>, second stage: <one sentence with a number>."

#### Unlock: Riding II

**Level 20, quest `q_ss_the_sand_runners`, giver `npc_zelde_marrach`** in Dunehold. Race a
caravan's outriders across the dunes. Reward: riding II and a **Dune Strider** (`it_mount_dune_strider`, Uncommon mount; page 08 §20.1).
**Card:** "Riding II: mounts may now run at 10.8 m/s."

#### Unlock: Battlegrounds and war mode

**Level 20, quest `q_hc_the_proving_yard`, giver `npc_brakka_arena`** at the Warden's Yard. One practice
match against followers. Opens the **battleground** queue and the **war mode** toggle (open-world PvP flag) —
page 15 owns both; combat numbers are on [page 05 §21](05-COMBAT.md#21-pvp-combat-rules). **Card:** "Battlegrounds: queue for team battles from the Warden's Yard or Social [P] → Group Finder. War mode: turn open-world PvP on at any hub."

#### Unlock: Talent tier 2

**Level 22, no quest.** **Card:** "Talents: tier 2 is open for every spell."

#### Unlock: Skyways *(added from page 14)*

**Level 25, quest `q_unlock_skyways` "Kite Lines", giver `npc_tamsin_roost`** at the Stable Gate tower, Highcourt.
Fly your first route, Highcourt → Anvilgate. Skyways are fixed routes between roosts (page 01 §10.5); you ride,
you do not steer — this is not flying (that is Riding IV at 60). **Card:** "Skyways: fly a fixed route from any roost
to another roost you have visited."

#### Unlock: The wardrobe

**Level 25, quest `q_ww_the_moonwell_mirror`, giver `npc_ww_glamourist_eluned`** in Silverbough. Every item you
have ever equipped is saved as an **appearance** (collections); at a wardrobe (any hub) you may make any
equipped item **look like** any appearance of the same slot and armour tier (weapons: same family). Cost:
5% of the item's sell price. **Card:** "Wardrobe: change how an item looks to any appearance you have collected. At any glamourist."

#### Unlock: Spell slot 5

**Level 28, no quest.** **Card:** "New spell: <name>. Press [5]. <generated description>."

#### Unlock: Dual spec

**Level 30, quest `q_hc_two_minds_one_will`, giver `npc_the_unbinder`.** A second saved build: its own
**talent picks, perks, role focus, bar layout and a gear set**. Switching: a **5 s cast out of combat**, free,
**30 s** cooldown. Anything you change while in a spec only changes that spec. **Card:** "Dual spec: keep two builds and switch between them out of combat. Switch on the character screen."

#### Unlock: Raid — Crypt of the Barrowking

**Level 30, quest `q_hc_the_barrowkings_seal`, giver `npc_warden_of_bones`** in the Undercroft (Highcourt's catacombs).
The quest is a short chain ending at the raid door (page 13 owns the raid). **Card:** "Raid: the Crypt of the Barrowking, 10 players, level 30. Queue from Social [P] → Group Finder or enter through the Highcourt catacombs."

#### Unlock: Talent tier 3

**Level 32, no quest.** **Card:** "Talents: tier 3 is open for every spell."

#### Unlock: The upgrade bench, second voice

**Level 34, quest `q_cs_brands_in_the_ash`, giver `npc_cs_runewright_gorsa`** in Fort Ashfall. The rest of
Farhold's Upgrade tab: **inscribe** (add an affix to an item with a free slot), **reweave** (re-roll one affix
into a different one), **recast** (re-roll an item's base damage or armour), **brand** (give a weapon an
element). **Card:** "Upgrade bench: inscribe, reweave, recast and brand are open at any forge."

#### Unlock: Spell slot 6

**Level 40, no quest.** **Card:** "Your last spell: <name>. Press [6]. <generated description>."

#### Unlock: Calling III

**Level 40, quest `q_calling_<class>_3`.** [Page 06 §12](06-CLASSES.md#12-calling-quests). **Card:** "<Mechanic>, mastered: <one sentence with a number>."

#### Unlock: Riding III

**Level 40, quest `q_dc_the_tide_steed`, giver `npc_dc_tidewright_morwen`** in Saltmarch. Tame a **Tide Steed**
(`it_mount_tide_steed`, Rare mount; page 08 §20.1) in a sea cave. Riding III lets any mount swim on the surface and leap. **Card:** "Riding III: your mount swims at +80% and leaps 6 m with [Jump] while galloping."

#### Unlock: Raid — The Glacier Throne

**Level 42, quest `q_fm_frost_under_the_throne`, giver `npc_hallveig_rime`** in Rimehold. **Card:** "Raid: the Glacier Throne, 10 players, level 42."

#### Unlock: Talent tier 4

**Level 45, no quest.** **Card:** "Talents: tier 4 — the last pick for every spell."

#### Unlock: Raid — The Sunken Choir

**Level 50, quest `q_dc_the_choir_calls`, giver `npc_amos_keeper`** at Lampwick Point. **Card:** "Raid: the Sunken Choir, 10 or 20 players, level 50."

#### Unlock: Heroic dungeons

**Level 60, quest `q_el_the_heroic_road`, giver `npc_marshal_ansel_crane`** in Last Light. Every dungeon's
Heroic difficulty at level 60 (canon). No followers (page 06 §10.5). **Card:** "Heroic dungeons: every dungeon, at level 60, for 5 players. Queue from Social [P] → Group Finder."

#### Unlock: Mythic+ keystones

**Level 60, quest `q_el_the_keystone_vow`, giver `npc_el_keywarden_orrin`** in Last Light — offered after you
finish one Heroic dungeon. Gives your first **keystone** (page 12 owns Mythic+ rules: timed, keyed levels).
**Card:** "Mythic+: your keystone opens a timed dungeon at a set level. Beat the timer to raise it."

#### Unlock: Raid — The Ember Court

**Level 60, quest `q_el_the_ember_court_gates`, giver `npc_marshal_ansel_crane`.** The last step of the main story
(page 14). **Card:** "Raid: the Ember Court, 10 or 20 players, level 60."

#### Unlock: Veilspire Isle and the Veilspire raid

**Level 60, chain `q_vs_beyond_the_veil`, giver `npc_vs_veilwarden_isaure`** at the Spire Landing, offered
after the Ember Court's fourth boss has been killed once. Opens the island (region 11) and the 20-player raid
`r05_veilspire`. **Card:** "Veilspire Isle is open. Raid: Veilspire, 20 players."

#### Unlock: Renown

**Level 60, no quest.** The XP bar becomes the Renown bar ([Renown](#renown)). **Card:** "Renown: experience now earns Renown. Every Renown level gives 1 Renown point."

#### Unlock: Arenas

**Level 60, no quest.** Rated 2v2 and 3v3 (page 15). **Card:** "Arenas: rated 2v2 and 3v3 matches. Queue from Social [P] → Group Finder."

#### Unlock: Daily and weekly quests

**Level 60, no quest.** Quest boards in Last Light and the Spire Landing offer 6 daily and 2 weekly quests
(page 14); they pay gold, renown XP and reputation. **Card:** "Daily quests: 6 a day and 2 a week on the boards in Last Light and the Spire Landing."

#### Unlock: Riding IV — the sky

**Level 60, chain `q_sky_1` … `q_sky_5`, giver `npc_el_skywright_aveline`** in Last Light. The hardest unlock
in the game, on purpose:

| Step | Quest | Task |
|---:|---|---|
| 1 | `q_sky_1` The First Feather | kill 3 different world bosses (any order, any week) and bring back a storm feather from each |
| 2 | `q_sky_2` The Ember Court's Wings | defeat the Ember Court's winged boss on any difficulty |
| 3 | `q_sky_3` Proof in the Dark | complete a Mythic+ keystone of level 10 or higher in time |
| 4 | `q_sky_4` Standing | reach **Kindred** with any two of the region factions ([Reputation](#reputation)) |
| 5 | `q_sky_5` The Stormwing | a solo trial: ride a wild **Stormwing** until it accepts you (a 4-minute flying fight against the wind) |

Reward: Riding IV and the **Stormwing** (`it_mount_stormwing`, Epic flying mount; page 08 §20.1). Flying works only where page 01 allows it (not in
cities, dungeons, raids or during war mode). **Card:** "Riding IV: fly with [Jump] twice while mounted. 13.5 m/s in the air."

---

## Attributes

### What each attribute does

`(reuse: js/rpg.js derive; rescaled — Farhold gave 3% per point because a Farhold character had ~6–50 points)`

| Attribute | Gives | Farhold |
|---|---|---|
| **STR** — Strength | **+1% Weapon Damage** with heavy weapons (swords, longswords, axes, maces, hammers, all two-handers except the quarterstaff); **+0.25 Block Power** per point | +3% heavy weapon damage |
| **DEX** — Dexterity | **+1% Weapon Damage** with light and ranged weapons (dagger, rapier, sabre, spear, quarterstaff, bows, crossbow, javelin); **+0.06% crit chance**; **+0.05% passive dodge** | +3%, +0.2% crit, +0.3% dodge |
| **INT** — Intellect | **+1% Weapon Damage** with magic weapons; **+1% Spell Power** (all classes); **+2 max mana** | +3% magic weapon damage, +2 mana |
| **CON** — Constitution | **+4 max health** | +4 health |

Formulas in full: [page 05 §6.1](05-COMBAT.md#61-the-two-power-numbers-farhold-one-wildmarch-two) and
[§7](05-COMBAT.md#7-critical-hits). Every attribute line on the sheet shows what it is currently worth
("DEX 142: +142% light weapon damage, +8.5% crit, +7.1% dodge").

### Where attributes come from

Farhold replaced attribute point-buy with the perk forest in round 7 (and the level-up message kept promising
a point that `pendingAttr` never paid — R10). Wildmarch keeps **no point-buy**; attributes grow **by
themselves** each level, by class `(new)`:

| Source | Amount |
|---|---|
| Base at level 1 | 10 in each |
| Class at level 1 | primary +5, secondary +3 ([page 06 §2](06-CLASSES.md#2-the-thirty-classes)) |
| Every level after 1 | primary **+2**, secondary **+1**, CON **+1** (on top of the secondary's +1 if CON is the secondary), each other attribute **+½** (shown as whole numbers, rising every second level) |
| Gear | attribute affixes (`of_str` etc., Farhold `js/affixes.js`: 2–5 at item level 1, up to ×4.45 at the Mythic tier). A level-appropriate full set gives about **2.2 × level** to the primary and **1.5 × level** to CON |
| Perk forest | attribute nodes ([Perk forest](#perk-forest)) |
| Set bonuses, food, buffs | as written |

**At level 60** from levelling alone (before gear), for a mage (INT/DEX): INT 133, DEX 72, CON 69, STR 39. For
a warrior (STR/CON): STR 133, CON 131, DEX 39, INT 39.

---

## Perk forest

### Farhold's forest `(reuse: js/perks.js)`

One generated tree for every class (Farhold R7), starting at a free hub node in the middle. **Eight arms**
(R16) at the compass points and the corners:

| Arm | Name | What it gives |
|---|---|---|
| melee | The Close Ground | STR, flat damage, armour, health, crit, damage %, crit damage, attack area |
| ranged | The Long Shot | DEX, crit, crit damage, attack speed, dodge, arrow damage, attack area |
| arcane | The Deep Study | INT, mana, spell damage, mana regen, magic resistance, cooldown reduction, spell area |
| wild | The Kept Company | CON, health regen, companion damage, magic find, move speed, gold find, life steal, **follower slots** |
| guard | The Held Line | armour, health, magic resistance, block chance and power, resistance to all, barrier |
| fortune | The Long Odds | magic find, experience, crafting material on kill, lamp range, minimap range |
| mend | The Slow Mend | health regen, life steal, mana steal, mana regen, health and mana on kill |
| rove | The Light Step | move speed, dodge, stealth (smaller enemy notice range), minimap range, DEX |

Each arm has seven rings (3 minor · 4 minor · 3 major · 4 minor · 2 **talent** · 3 major · 1 **keystone**).
**Eight oddballs** sit on the seams between arms. In R25 the melee and arcane arms **branch** past ring 6 into
four paths each (melee: Two Great Weights, The Single Weight, Twin Edges, Sword and Board — one keystone per
hand shape; arcane: Flame and Frost, Storm and Venom, Dusk and Dawn, The Inner Study — two keystones per path,
one per element plus Overflow and Blood Price). A node is taken when something touching it is taken: **the
shape of the tree is the cost**. Keystones have a gift **and** a cost (e.g. Held Ground: +40% armour, +10%
resistance to all, block +25 — and −25% move speed). About **203 nodes** in all.

### What Wildmarch changes `(new)`

| Change | Rule | Why |
|---|---|---|
| **Points** | **one per level from 2 = 59** (canon). No bonus perk points from bosses or landmarks | Farhold gave `(level − 1) + floor((level − 1) / 5)` plus `bonusPerks` rewards; canon fixes 59 |
| **Reach** | 59 points take about 29% of the forest: a full arm to its keystone (7–10 points) and some of two or three others | same as Farhold's 58 points at 50 |
| **Level gates** | ring-5 **talent** nodes need level **15**; the R25 **branch paths** need level **25**; **keystones** need level **30** | a keystone is 7 points from the hub — without a gate a level-8 character could hold one |
| **Flat nodes grow** | every flat node (health, armour, flat damage, block power, barrier, magic resistance, health/mana on kill, health/mana regen, lamp range excepted) is worth **× (1 + 0.1 × (level − 1))**; attribute nodes **× (1 + 0.05 × (level − 1))**; percentage nodes never change | "+22 maximum health" is 19% of a level-1 character and 1% of a level-60 one; growing with you keeps a perk worth its point |
| **Sunder** (melee talent) | the last swing of every pattern strips **3% of base armour** for the fight (Farhold: 8 flat, forever) | page 05 §8.3 |
| **Riposte** (melee talent) | also armed by rolling through a hit and by a parry | page 05 §3 |
| **Blood Price** (arcane keystone) | spells cost health instead of their resource: mana spells cost health equal to `cost ÷ 1,000 × 50%` of max HP (a 120-mana spell: 6%); Fury/Focus spells 0.2% of max HP per point | Wildmarch's three resources |
| **Echo** (arcane talent) | 1 cast in 6 fires again free — at most once every 4 s | group balance |
| **The Kept Company / The Pack** | follower slots from perks apply in the **open world**; instances cap bodies at the group size | page 06 §10.5 |
| **Far Shot** (ranged keystone) | unchanged | — |
| **Doubled Grasp** (melee keystone) | unchanged — two two-handers | — |
| **Keystone swap** | a keystone in a branch path can only be taken if its hands match right now (Farhold `handsFit`) — unchanged | — |

The **Perks** tab of the character screen (`scr_character`, Perks tab — page 03) is Farhold's lattice view with
zoom and pan (R10), unchanged; nodes show their **current** value at your level.

---

## Talents

Owned by [page 06 §13](06-CLASSES.md#13-talents); the schedule is progression's:

| Level | What opens |
|---:|---|
| 12 | tier 1 for every spell you have (slots 1–3) |
| 18 | slot 4's spell, with tier 1 |
| 22 | tier 2 for every spell |
| 28 | slot 5's spell, with tiers 1–2 |
| 32 | tier 3 for every spell |
| 40 | slot 6's spell, with tiers 1–3 |
| 45 | tier 4 for every spell |

**24 picks** at 60 (more for classes with alternate spells). Picking into an empty tier is free.

**Late spells (canon 00 §10):** a spell's talent tier opens at **the later of** the tier's level and the spell's
slot level. So spell 5 at 28 arrives with tiers 1–2 already open, and spell 6 at 40 arrives with tiers 1–3 open
at once; its tier 4 opens at 45 with everyone else's. The table above is this rule written out.

---

## Retraining

`(reuse: js/retrain.js — the Unbinder; data/balance.json retrain)`

Farhold R20: every free undo left the character sheet; a build is changed by a **person in a town, for gold**.
Wildmarch keeps that. The Unbinder offers:

| Service | Price (Farhold formula `one + perLevel × (level − 1)`) | At level 20 | At level 60 |
|---|---|---:|---:|
| Forget one perk (only one with nothing depending on it — Farhold `canRefund`) | 80 + 12 × (L − 1) gold | 308 | 788 |
| Forget every perk | 400 + 45 × (L − 1) | 1,255 | 3,055 |
| Forget one talent pick | 60 + 8 × (L − 1) | 212 | 532 |
| Forget every talent pick | 250 + 30 × (L − 1) | 820 | 2,020 |
| Spells | **cannot be forgotten** — a class's six spells are the class (Farhold R20 rule for preset classes) | — | — |

Page 08 may retune the gold numbers against the economy; the shape stays.

**Free resets** `(new)`:

- **Newcomer's grace**: one free "forget every perk" and one free "forget every talent" before level 20.
- **Patch grace**: when an update changes a class's spells or talents, every character of that class gets one
  free full talent reset; when the forest changes, everyone gets one free full perk reset. The Unbinder says so.
- **Dual spec** (level 30): switching is free; each spec is retrained separately.

---

## Reputation

### Farhold today `(reuse: js/factions.js, data/factions.json, data/faction-rewards.json)`

One number per faction from −100 to +100, five bands (**Hunted** ≤ −60, **Disliked**, **Known**, **Trusted**
≥ 20, **Sworn** ≥ 60) with a shop price multiplier (Disliked ×1.4, Trusted ×0.85, Sworn ×0.70). A deed for one
faction moves its **rivals** by a third of the opposite amount, so nobody can be liked by everybody. Deeds
have fixed values (a job +6, a caravan escorted +8, a nemesis killed +12…). Trusted and Sworn each open one
reward per faction ("A warden of your own").

### Wildmarch `(new scale, reused rules)`

**Factions** (page 01 owns names and ids; these are the canon holders from page 00 §7): the Vale Wardens, the
Fenfolk, the Deepforge Clans, the Crown Assembly (Highcourt), the Sandsworn, the Moonwell Circle, the Frost
Wardens, the Riftwatch, plus one faction per contested region for the people holding the line there (page 01).
The enemy warbands (Orc, the Drowned, the Ember Legion) have standing that only goes **down** (Farhold's
`unlikeable` rule for the Hollowed).

**Tiers:**

| Tier | Standing | Shop prices | What opens |
|---|---:|---:|---|
| Hunted | ≤ −3,000 | refuse to trade | their guards attack on sight; their town gates shut (Farhold R27 M4) |
| Disliked | −2,999 … −1 | ×1.40 | quests refuse; gates open for a fee |
| **Known** | 0 … 2,999 | ×1.00 | everyone starts here |
| **Welcome** | 3,000 … 8,999 | ×0.95 | the faction **quartermaster** sells to you: consumables, recipes, the faction tabard |
| **Trusted** | 9,000 … 20,999 | ×0.85 | a faction mount appearance; Rare recipes; the faction's Trusted reward (Farhold `faction-rewards.json` style: e.g. "their patrols join any fight you start within 40 m") |
| **Kindred** | 21,000 … 41,999 | ×0.80 | a class-set token for **Set A** (page 06 §14.2; one per faction per character); an Epic item |
| **Sworn** | 42,000 (max) | ×0.70 | the title "*<name> of the <Faction>*"; the faction's Sworn reward (e.g. "a warden of your own" — a unique follower); the faction's unique mount |

**Earning standing:**

| Deed | Standing |
|---|---:|
| A normal quest for the faction | +250 |
| A main-story quest in their region | +500 |
| A dynamic event in their region (gold / silver / bronze) | +150 / +100 / +50 |
| A dungeon boss in their region (Normal / Heroic) | +15 / +40 per boss; ×3 with the faction tabard worn in a Heroic |
| A daily quest (60) | +150 |
| Faction tokens (dropped by their region's enemies, 5% at even level) | +25 each at the quartermaster |
| Killing their people / robbing their caravans | −250 / −500 |

**Rivals**: a deed for a faction moves each of its rivals by **one third** of the amount, the other way
(Farhold `RIVAL_SHARE`, kept). Page 01 names the rival pairs; the rule means a player can be **Sworn** to at
most one side of each pair.

**Screen**: `scr_reputation` (a tab of the character screen) — one row per faction: name, colour, tier bar,
next reward, where to earn. Standing is **per character**.

---

## Renown

`(new — Farhold's levels simply stopped at the cap)`

At level 60 all XP goes into **Renown**.

| Rule | Value |
|---|---|
| Renown level cost | **50,000** XP for Renown 1–10, then **100,000** XP each (about 1.5 h and 3 h of level-60 play) |
| Cap | none |
| Renown point | **1 per Renown level** |
| Renown board (`scr_renown`) | four tracks, **20 ranks** each, 1 point a rank (80 points fill the board) |
| After 80 points | each Renown level gives a **Renown cache** instead: gold (level × 20), crafting materials, and a 2% chance of a legendary |
| Titles | at Renown 10, 25, 50, 100, 200 ([Titles](#titles)) |

**The four tracks** (small on purpose — renown is a long tail, not a gap between players):

| Track | Per rank | At 20 ranks |
|---|---|---|
| **Might** | +0.25% damage and healing done | +5% |
| **Bulwark** | +0.5% max health | +10% |
| **Swiftness** | +0.25% move speed, +0.5% mount speed | +5% / +10% |
| **Fortune** | +1% magic find, +1% gold found | +20% / +20% |

Renown board bonuses are **off** in rated PvP (arenas, rated battlegrounds).

---

## Achievements

`(new; the nearest relative in the playground is Emberveil's Named Foes board in its Journal — prototypes/emberveil, reuse the idea)`

- **Screen** `scr_sheet_achievements` (a character-sheet tab, page 03; no own key — `Y` is Set Focus and `U` is Unlocks on page 02). Account-wide unless marked "character".
- **Ids** `ach_<snake>` (proposed id convention — see canon change requests).
- **Points**: 5 / 10 / 25 / 50 per achievement; the total shows on the character's inspect card.
- **Rewards**: titles, mount and follower appearances, wardrobe appearances, tabards, and **Wayfarer's
  Memory**-style account bonuses (only cosmetic or convenience — never power).

| Category | Examples (id — requirement — reward) |
|---|---|
| Levels | `ach_level_10` … `ach_level_60` — reach the level — points; 60: title "*the Seasoned*" |
| Callings | `ach_calling_3_<class>` — finish Calling III with that class — class tabard; all 30: title "*of Every Calling*" |
| Exploration | `ach_explore_<region>` — discover every named area in a region — points; all 11: mount appearance "Cartographer's Stag" |
| Waystones | `ach_waystones_all` — attune every waystone — title "*the Wayfarer*" |
| Quests | `ach_quests_<region>` — finish the region's story — points |
| Dungeons | `ach_d01_hollow_barrow` … — clear on Normal / Heroic / Mythic+ 10 in time — points, appearances |
| Raids | `ach_r01_barrowking` … — defeat every boss; the secret boss; Mythic — titles, mounts |
| Bosses | `ach_boss_<id>_no_hit` — beat a named boss without being hit by a danger zone — appearance |
| World bosses | `ach_world_bosses_all` — defeat every world boss — title "*Stormbreaker*" |
| Bestiary | `ach_bestiary_<family>` — kill every monster of a family — points |
| Reputation | `ach_sworn_<faction>` — reach Sworn — points; 3 factions Sworn: title "*the Beloved*" |
| Renown | `ach_renown_10` … `ach_renown_200` | titles ([Titles](#titles)) |
| PvP | `ach_bg_wins_100`, `ach_arena_rating_2000` — titles, appearances |
| Collections | `ach_mounts_25`, `ach_appearances_500` — mount appearances |
| Feats | `ach_feat_<snake>` — limited-time (season firsts) — never repeatable |

---

## Collections

`scr_sheet_collections` (a character-sheet tab, page 03; no own key). Account-wide unless marked.

| Collection | What is collected | How |
|---|---|---|
| Mounts | every mount item's **appearance** (the item's stats stay on the item — Farhold R10 mounts are loot) | equip it once |
| Followers | mercenary and companion appearances | hire or earn |
| Appearances (wardrobe) | every item's look by slot | equip it once (bound items) |
| Titles | every title earned | earn it |
| Bestiary | every monster id: kills, and lore that unlocks at 1 / 50 / 500 kills | kill it (Emberveil's Named Foes board, reuse the idea) |
| Lore | landmark inscriptions, books, boss dialog lines heard | read / hear |
| Class sets | pieces of every class set, per class (character) | loot |
| Legendaries | the legendary powers you have seen, with their numbers | loot |
| Maps | named areas and waystones | walk there |

---

## Titles

A title is shown under the name on the nameplate (`set.interface.showTitles`). One active at a time, chosen
on the character screen.

| Source | Titles |
|---|---|
| Callings | "*<name> the Proven <Class>*" (II), "*Master <Class>*" (III) |
| Reputation | "*<name> of the <Faction>*" at Sworn |
| Renown | 10 "*the Renowned*", 25 "*the Storied*", 50 "*the Legend*", 100 "*the Unwearied*", 200 "*the Undying Name*" |
| Achievements | as listed above |
| Raids | the last boss of each raid on Mythic, e.g. "*Bane of the Barrowking*" |
| PvP | season ranks (page 15) |

No title names anything from another game.

---

## What changed from Farhold

| System | Farhold | Wildmarch |
|---|---|---|
| Level cap | a world setting (30/50/100), default 50 | fixed **60** (canon) |
| XP curve | three-part, fractions of the cap, two dips at cap 60 | one smooth formula, `600 × 1.107^(L−1)` a level; ~103 h to 60 |
| Kill XP | `base × 1.09^(L−1) × 0.2 × gap` | `10 × 1.04^(L−1) × rank × gap` (same gap rule) |
| Event XP | `base × kind × (1 + 0.12 × (zoneLevel − 1))` | a share of the zone level's XP-to-next |
| Unlocks | almost everything open at once | a 60-level ladder of level and quest unlocks, each with a card |
| Spell slots | 1/3/6/12/18/24 | 1/4/10/18/28/40 (canon) |
| Talent tiers | 3/8/18/28 | 12/22/32/45 (canon) |
| Attributes | no point-buy, base 6, gear and perks only | automatic class growth each level + gear + perks; 1% per point |
| Perk points | `(L−1) + floor((L−1)/5)` + bonus points | 59 (canon), level gates on talents/branches/keystones, flat nodes grow with level |
| Retraining | the Unbinder, gold | same, + newcomer's and patch grace, dual spec |
| Reputation | −100…+100, five bands | −3,000…+42,000, seven tiers, the same rival rule |
| After the cap | nothing | Renown, achievements, collections, titles |
| Followers | 3 slots at 1, +1 at 20 and 30 | 1 at 8 (quest), +1 at 15, 25, 35; group slots in instances |
| Mount | an item from the start | gear + four riding ranks by quest |

---

## Data shapes

**An unlock** (`data/unlocks.json`, one row per ladder entry):

```json
{
  "id": "unl_dodge_roll", "level": 5, "by": "quest",
  "quest": "q_hv_fall_and_rise", "giver": "npc_hesk", "where": "brightwater",
  "classes": null,
  "card": {
    "icon": "fa-person-running", "title": "Dodge roll",
    "text": "Press [Dodge] to roll 4 m. For 0.3 s of the roll, nothing can hurt you. Costs 30 stamina.",
    "showMe": { "demo": "dodge_roll" }
  },
  "grants": { "verbs": ["dodge"] }
}
```

`classes` limits an unlock to some classes (`unl_challenge`: the eight tank-capable ids).

**The XP knobs** (`data/balance.json`, `xp` block):

```json
{
  "xp": {
    "toNextBase": 600, "toNextGrowth": 1.107,
    "timeBaseMinutes": 10, "timeGrowth": 1.065,
    "killBase": 10, "killGrowth": 1.04,
    "gap": { "belowPerLevel": 0.2, "abovePerLevel": 0.15, "aboveCap": 1.6 },
    "questShare": 0.07, "kinds": { "normal": 1, "bonus": 0.5, "story": 2, "unlock": 1.5, "calling": 3 },
    "eventShare": 0.05, "areaShare": 0.01, "landmarkShare": 0.02, "dungeonShare": 0.30,
    "rested": { "per8h": 0.05, "awayShare": 0.25, "cap": 1.5, "killMult": 2 },
    "group": [1, 1.15, 1.30, 1.45, 1.60], "carryGap": 10, "carryMult": 0.5,
    "account": { "perCharacter": 0.10, "cap": 0.30 },
    "renown": { "early": 50000, "earlyLevels": 10, "each": 100000 }
  }
}
```

**A character's progression block** (in the save; page 16 owns the save):

```json
{
  "level": 23, "xp": 58210, "rested": 1840, "renown": { "level": 0, "xp": 0, "board": {} },
  "unlocks": ["unl_sprint", "unl_dodge_roll", "..."],
  "perks": ["start", "melee:1:0", "..."], "skillTalents": { "mage_ember_lance": { "1": "a", "2": "b" } },
  "specs": [{ "perks": [], "skillTalents": {}, "role": "damage", "bar": [], "gear": {} }], "activeSpec": 0,
  "standing": { "vale_wardens": 9120, "fenfolk": 3400 },
  "titles": ["the_proven_mage"], "activeTitle": "the_proven_mage"
}
```

Farhold lesson (R18, R20): **every one of these fields must be on the save list** — `bonusPerks`, the perk forest
and `skillTalents` were each once missing from it and silently reset on reload. Page 16's save test must
round-trip every field here.

---

## Open questions

1. **103 hours to 60** for a first character — right size? Halving it means `timeGrowth` 1.065 → about 1.053.
2. **No bonus perk points** (canon 59) — Farhold paid perk points for world bosses and landmarks and players
   liked finding them. Allow a few (e.g. 5 from world bosses) on top of 59?
3. **The flying chain** needs a Mythic+ 10 and two Kindred reputations — too hard, or right for "a hard quest chain"?
4. **Sprint at level 2 and the dodge roll at 5** — is five levels without a roll acceptable, or should a weaker
   sidestep exist from level 1?
5. **Followers from level 8** (quest) rather than level 1 — Farhold gave three slots at level 1.
6. **Renown board power** caps at +5% damage/healing and +10% health — acceptable, or cosmetic-only?
