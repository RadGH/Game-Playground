# WILDMARCH — Design Bible, page 07: Progression

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Owns:** the XP formula and table, every XP source and
the **XP gain** magic-find stat, **the feature-unlock ladder** (what opens at every level from 1 to 60, and
whether by level, by quest or by clearing a dungeon), unlock cards and the Unlocks screen, attributes, the perk
forest at cap 60, the talent schedule, retraining and the **Second Loadout**, reputation (the seven factions'
tiers, deeds, level-scaled rewards and the **reputation gain** magic-find stat), **what there is to do after
level 60**, achievements, collections and titles.
**Reads from:** [page 00](00-OVERVIEW.md) (canon: cap 60, ladder 1/4/10/18/28/40, callings 6/20/40, talent
tiers 12/22/32/45, 59 perk points, the seven factions §12.2), [page 05](05-COMBAT.md) (formulas),
[page 06](06-CLASSES.md) (class system, hybrid roles), [page 08](08-ITEMS.md) (magic find, item rules),
[page 12](12-DUNGEONS.md) (Challenge mode, Depth), [page 14](14-QUESTS-EVENTS.md) (quest content),
[page 15](15-SOCIAL-ONLINE.md) (Dungeon Finder, guilds, duels), [page 19](19-PROFESSIONS.md) (harvesting and
crafting), [page 20](20-TRAVEL.md) (Recall Stone, Travel Methods).

Farhold paths are relative to `prototypes/farhold/`. `(reuse: path)` = exists in Farhold; `(new)` = Wildmarch only.
Quest ids and NPC ids on this page are **proposed**; page 14 (quests) and page 01 (NPCs, towns) adopt or rename
them and this page follows.

**Round 2 in one paragraph.** There is **no bonus XP for time spent logged out** (W11), **no post-60 point track**
(W13), **no daily or weekly quests** (W20), **no raids** and **no player-versus-player fighting beyond friendly
duels** (duels at level 10 stay). The ladder gains the **Recall Stone** (7), **Harvesting and one crafting
profession** (9), **Travel Methods** (12, replacing round 1's fixed flight routes),
the **Second Loadout** (30) and **Challenge mode and Depth past level 60** (60). A dungeon appears in the Dungeon
Finder once you have discovered its entrance. Reputation is **seven factions** that reach from the first regions
to level 60, and their rewards **scale to your level**, so a faction you met at level 5 still matters at 60. Two
magic-find stats land here: **XP gain** and **reputation gain**. The shared tank taunt is now called **Provoke**.

---

## Contents

- [The shape of a character's life](#the-shape-of-a-characters-life)
- [Levels and XP](#levels-and-xp)
  - [The XP formula](#the-xp-formula)
  - [The XP table, 1 to 60](#the-xp-table-1-to-60)
  - [Where XP comes from](#where-xp-comes-from)
  - [XP gain (magic find)](#xp-gain-magic-find)
- [The feature-unlock ladder](#the-feature-unlock-ladder)
  - [The ladder, level by level](#the-ladder-level-by-level)
  - [Unlock cards](#unlock-cards)
  - [Every unlock, one paragraph each](#every-unlock-one-paragraph-each)
- [Attributes](#attributes)
- [Perk forest](#perk-forest)
- [Talents](#talents)
- [Retraining](#retraining)
- [Reputation](#reputation)
- [After level 60](#after-level-60)
- [Achievements](#achievements)
- [Collections](#collections)
- [Titles](#titles)
- [What changed from Farhold](#what-changed-from-farhold)
- [Data shapes](#data-shapes)
- [Open questions](#open-questions)

---

## The shape of a character's life

Canon pillar 1: **unlock as you go.** A new character is simple on purpose — one spell, a starter weapon and a
road — and everything else arrives one piece at a time as you level or finish an important quest, each with a
card that says what it is and what it does in numbers.

| Stage | Levels | Region(s) | Hours (target, first character) | What the player gets |
|---|---|---|---|---|
| **The valley** | 1–6 | Hearthvale | ~1 h | sprint, the perk forest, the potion belt, spell 2, the dodge roll, the first calling, the Dungeon Finder and the first dungeon |
| **The road out** | 6–12 | Mossfen, Highcourt | ~1.5 h | the Recall Stone, a follower, harvesting and a crafting profession, spell 3, a mount, Provoke (tanks), duels, the capital (bank, mail, Trading Post), waystones, Travel Methods, the first talents |
| **The middle march** | 12–30 | Greyridge → Whisperwood | ~11 h | spell 4, spell 5, the second calling, faster riding, guilds, the upgrade bench, the wardrobe, the Second Loadout |
| **The hard north** | 30–48 | Cinder Steppe → Drowned Coast | ~34 h | spell 6, the third calling, the swimming and leaping mount, talent tiers 3–4 |
| **The last climb** | 48–60 | Riftmarch, Kingsfire | ~56 h | the end of the main story in **The Fire Court** (`d15_fire_court`) |
| **Level 60** | 60 | Spire Isle + everywhere | open | Challenge mode, Depth past level 60, **The Spire** (`d16_the_spire`), the flying mount chain, sockets, professions, reputation, collections ([After level 60](#after-level-60)) |

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
- **Level 60 in about 103 hours** of play for a first character. There is **no bonus for time logged out** (canon
  W11); the account bonus, the XP-gain stat and groups make later characters faster ([Where XP comes from](#where-xp-comes-from)).
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

At 60, XP stops: there is no post-60 point track (canon W13). The XP bar can instead show the standing of one
tracked faction ([Reputation](#reputation)), and [After level 60](#after-level-60) lists what a level-60
character does.

### Where XP comes from

**Target mix** over the whole climb: **40%** from kills, **45%** from quests, **15%** from events, discoveries
and dungeon completions. The formulas below are set so a player who follows the quests in a region gets
roughly that mix. (The mix and the hour targets assume **no** XP gain from gear; XP gain makes the climb faster
for whoever chases it.)

#### Kill XP and the grey-level rule

`(reuse: js/rpg.js killXpFor, data/balance.json xp — the rule; the base changes)`

```
killXP = round( 10 × 1.04 ^ (enemyLevel − 1) )        the "normal kill" column above
       × rank multiplier                               normal 1 · champion 2.4 · rare 4.5 · elite 2 · mini-boss 8
                                                       dungeon boss 20 · world boss 30 (first kill of each world boss each week)
       × 1.5 per greater rarity                        Giant, Flaming… (page 10 may retune)
       × grey rule                                     below
       × (1 + XP gain)                                 the magic-find stat, [XP gain](#xp-gain-magic-find); cap +100%
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
questXP = round to 10 of ( 0.07 × XP-to-next(questLevel) ) × kind × (1 + XP gain)
kind:  normal 1 · bonus objective 0.5 · main story 2 · unlock quest (this page) 1.5 · calling quest 3
grey:  a quest 3+ levels below you pays −10% for every level past 2, down to 10%
```

About **six normal quests fill 42% of a level**, which is the 45% target once story quests are counted.
Farhold's `eventXp` scaled awards by the **zone's** level (R22: "walking to a landmark in a level-40 zone is
worth more"); Wildmarch keeps that — `questLevel` is the zone's level, not yours. There are **no daily or
weekly quests** (canon W20).

#### Events, discovery, dungeons

Every row below is also multiplied by `(1 + XP gain)`.

| Source | XP | Farhold |
|---|---|---|
| Dynamic event (page 14) | 0.05 × XP-to-next(event level) × medal: gold 1.0 · silver 0.75 · bronze 0.5 | `eventXp(kind: 'event')` |
| Discovering a named area | 0.01 × XP-to-next(zone level) | — |
| First visit to a landmark | 0.02 × XP-to-next(zone level) | `eventXp(kind: 'landmark')` ×3 |
| **Discovering a dungeon entrance** (it appears in the Dungeon Finder) | 0.03 × XP-to-next(dungeon's top level) — also paid when you arrive by a teleport | new |
| Dungeon boss (Normal) | kill XP × 20 (the boss rank) | placed bosses |
| Dungeon completion (Normal, **every** clear) | 0.30 × XP-to-next(dungeon's top level), with the grey rule judged on the dungeon's top level | `clearRewardGold` only |
| **Depth** run below level 60 | as Normal, at the dungeon's **Depth-raised** level (each Depth adds 3 levels up to 60 — page 12). Example: `d03_shaft_seven` (13–16) at Depth 5 is a level-31 dungeon | new |
| World boss | kill XP × 30, the **first kill of each world boss each week** (Monday 06:00 — the same once-a-week rule as its loot, canon W5) | `worldbosses.json` |
| Challenge mode, Depth past 60 | level 60 only — there is no XP to earn at 60 | — |

#### Group XP

- A kill's XP is shared among the **players** in the group who are within 60 m (or tagged the enemy):
  each gets `killXP × groupBonus(N) ÷ N`, with `groupBonus` = 1.00, 1.15, 1.30, 1.45, 1.60 for N = 1…5
  (a player in a group of 5 gets 32% of a solo kill, and the group kills more than five times as fast).
- A world-boss crowd is counted as 5 (the only content with more than 5 players).
- **Followers and pets never take a share.** Their kills count as their owner's kills. (Farhold R22: "after
  just a few kills from my companions I was level 30" — the grey rule and the 75% follower damage cap fix
  the cause; followers taking no share keeps solo play from being punished for using them.)
- **Carry rule**: if the highest-level player in the group is **10 or more** levels above you, your share is
  halved. The grey rule is judged on **your own** level.
- Quests pay each player in full; events by each player's own medal.

#### The account bonus `(new)`

**Wayfarer's Memory**: every character on the account that has reached 60 gives every other character
**+10% XP gain**, up to **+30%**. It adds into the same XP-gain bucket as gear (below), so the +100% cap covers
both. Shown as a line on the XP bar tooltip.

### XP gain (magic find)

`(new — canon 00 §12.3: seven magic-find stats; page 08 owns the stat list, its roll ranges and where it rolls)`

| Rule | Value |
|---|---|
| Stat | `mf_xp`, written on cards as "**+N% experience gained**" |
| Sources | jewellery affixes and gems socketed in jewellery (page 08 — canon: jewellery gems carry magic find), perk nodes on **The Long Odds** arm ([Perk forest](#perk-forest)), Wayfarer's Memory, and a few consumables (page 08) |
| Applies to | **every** XP source: kills, quests, events, discoveries, dungeon bosses and completions, world bosses |
| Stacking | all sources **add** into one bucket; the bucket multiplies the award once: `× (1 + XP gain)` |
| Cap | **+100%** (the sheet shows the excess greyed out) |
| Grey rule | applied first — a grey kill is 0, and 0 × anything is 0; XP gain never makes a trivial enemy worth killing |
| Group | each player's own XP gain applies to their own share |
| At level 60 | the stat does nothing; its card line greys out with "No effect at level 60" (it keeps its value for alts it is traded to) |

Design check: a player who stacks XP gain to the cap reaches 60 in about **52 hours** instead of 103. That is
intended — it is a choice that costs item slots that would otherwise hold power.

---

## The feature-unlock ladder

The owner's key idea, and canon pillar 1: **start simple and unlock features as you level or finish an
important quest.** Rules:

1. **Every unlock is announced** with a card, a sound and an entry on the Unlocks screen (canon rule 5).
2. A **level** unlock happens the moment you reach the level. A **quest** unlock happens when you turn the quest
   in; the quest is **offered** at that level (a courier finds you if you are nowhere near the giver) and a
   **gold pin** marks the giver on the map. A **clear** unlock happens when you finish a dungeon on Normal.
3. Nothing in the ladder is behind a paywall, a random drop or another player.
4. The HUD's **"Next unlock"** line (under the XP bar) always names the next thing you will get and how:
   "Level 10 — a mount (quest in Highcourt)".
5. **Perk points** arrive at every level from 2 (canon: 59 in total) and are not repeated in the table.

### The ladder, level by level

**By** = `L` (reaching the level), `Q` (a quest offered at that level) or `C` (clearing a dungeon on Normal).
Paragraph links are to [Every unlock, one paragraph each](#every-unlock-one-paragraph-each).

| Level | Unlock | By | Quest · giver · where |
|---:|---|:---:|---|
| 1 | **Day-one kit**: spell slot 1, basic weapon attacks, Tab targeting, jog and jump, the 16-slot backpack, quest log, map, character sheet, achievements, collections, party and chat, Tend the Fallen | L | — |
| 2 | **Perk forest** (first perk point) | L | — |
| 2 | **Sprint** | Q | `q_hv_the_long_field` · `npc_hv_runner_tamsin` · Brightwater |
| 3 | **Potion belt** (2 slots) | Q | `q_hv_the_herbwifes_basket` · `npc_hv_herbwife_orla` · Brightwater orchards |
| 4 | **Spell slot 2** | L | — |
| 5 | **Dodge roll** | Q | `q_hv_fall_and_rise` · `npc_hesk` · Brightwater drill yard |
| 5 | **Player trade** | L | — |
| 6 | **Calling I** — the class mechanic | Q | `q_calling_<class>_1` · `npc_trainer_<class>` · Hall of Callings, Highcourt (letter by courier `npc_ollin_courier`) |
| 6 | **Dungeon Finder** and **dungeon journal** | Q | `q_hv_the_barrow_bell` · `npc_odile_marsh` · Brightwater |
| ~7 | **Depth** for a dungeon (each dungeon on its own) | C | clear that dungeon on Normal |
| 7 | **Recall Stone** | Q | `q_hv_a_bed_by_the_fire` · `npc_hv_innkeeper_bram` · the Lamp and Ladder and the First Waystone (`lm_first_waystone`), Brightwater |
| 7 | **Bag slot 1** | L | — |
| 8 | **First follower slot** | Q | `q_mf_coin_for_a_blade` · `npc_mf_broker_wendel` · Reedhollow |
| 9 | **Harvesting** (the tool slot and the shared Harvesting skill) | Q | `q_mf_the_right_tool` "The Right Tool" · `npc_neve_hollis` · Reedhollow → `sz_reedhollow_shallows` |
| 9 | **One crafting profession** (and salvage) | Q | `q_mf_what_the_fen_gives_back` "A Trade of Your Own" · `npc_mf_scrapwright_mabli` · Reedhollow, the profession stations |
| 10 | **Spell slot 3** | L | — |
| 10 | **Riding I** — the first mount | Q | `q_hc_saddle_and_bridle` · `npc_oswin_stablemaster` · Stable Gate, Highcourt |
| 10 | **Provoke** (the 13 tank-capable classes only) | Q | `q_hc_hold_the_line` · `npc_hc_shieldmaster_varr` · Highcourt barracks |
| 10 | **Duels** | L | — |
| 11 | **Bank**, **mail** and the **Trading Post** | Q | `q_hc_keys_to_the_city` · `npc_hc_herald_aldous` · Highcourt gate |
| 12 | **Talent tier 1** | L | — |
| 12 | **Travel Methods** and **waystones as teleport targets** (one unlock) | Q | `q_hc_the_waywardens_oath` "The Wayfarer's Writ" · `npc_hc_waywarden_liss` · Waykeepers' Hall (`hc_waykeepers_hall`), Highcourt |
| 12 | **Class travel spells** (mage Portal, chronomancer Retrace, oracle Guiding Call, druid Heron's Flight) | L | — ([page 06 §11](06-CLASSES.md#11-utility-spells), page 20) |
| 12 | **The Unbinder** (retraining) | L | `npc_the_unbinder` · Hall of Callings, Highcourt (and every hub from region 3 on) |
| 14 | **Bag slot 2** | L | — |
| 15 | **Follower slot 2** | L | — |
| 15 | **Guild charter** | Q | `q_hc_a_name_on_the_rolls` · `npc_melisande_hart` · Guild Row, Highcourt |
| 16 | **The upgrade bench** (temper, promote) | Q | `q_gr_the_second_hammer` · `npc_bodric_ashlock` · Anvilgate |
| 16 | **Potion belt, 4 slots** | L | — |
| 18 | **Spell slot 4** | L | — |
| 20 | **Calling II** | Q | `q_calling_<class>_2` · `npc_trainer_<class>` (letter by mail) |
| 20 | **Riding II** — faster mounts | Q | `q_ss_the_sand_runners` · `npc_zelde_marrach` · Dunehold |
| 22 | **Talent tier 2** | L | — |
| 24 | **Bag slot 3** | L | — |
| 25 | **Follower slot 3** | L | — |
| 25 | **The wardrobe** (appearance changing) | Q | `q_ww_the_moonwell_mirror` · `npc_ww_glamourist_eluned` · Silverbough |
| 28 | **Spell slot 5** | L | — |
| 30 | **Second Loadout** | Q | `q_hc_two_minds_one_will` · `npc_the_unbinder` · Hall of Callings, Highcourt |
| 32 | **Talent tier 3** | L | — |
| 34 | **The upgrade bench, second voice** (inscribe, reweave, recast, brand) | Q | `q_cs_brands_in_the_ash` · `npc_cs_runewright_gorsa` · Fort Ashfall |
| 35 | **Follower slot 4** | L | — |
| 36 | **Bag slot 4** | L | — |
| 40 | **Spell slot 6** | L | — |
| 40 | **Calling III** | Q | `q_calling_<class>_3` · a master of the class (class file) |
| 40 | **Riding III** — the swimming and leaping mount | Q | `q_dc_the_tide_steed` · `npc_dc_tidewright_morwen` · Saltmarch |
| 45 | **Talent tier 4** | L | — |
| 60 | **The Fire Court** (`d15_fire_court`) — the main story's climax | Q | story 11.9 `q_ms_the_last_offer` (discovers it) · `npc_iris_vael`; 11.10 `q_ms_the_fire_court` · `npc_marshal_ansel_crane` · Last Light |
| 60 | **Challenge mode** | Q | `q_kf_the_harder_road` "Harder Doors" · `npc_marshal_ansel_crane` · Last Light |
| 60 | **Depth past level 60** | Q | `q_kf_the_deep_road` "How Deep It Goes" · `npc_kf_depthwarden_orrin` · Last Light |
| 60 | **Spire Isle** and **The Spire** (`d16_the_spire`) | Q | story 12.2 `q_ms_across_the_pale_sea` · `npc_hale_marrow` · Saltmarch; 12.5 `q_ms_the_spire` · `npc_saelith` · the Spire |
| 60 | **Riding IV — the sky** (flying mount) | Q | chain `q_sky_1` … `q_sky_5` · `npc_kf_skywright_aveline` · Last Light |

Levels not in the table (13, 17, 19, 21, 23, 26, 27, 29, 31, 33, 37–39, 41–44, 46–59) give a perk point and
nothing else from this ladder — the region, its dungeons and its story carry those levels.

Removed from round 1's ladder (canon §12): the torch and its key (always daylight), personal boats and the
Portal Court (folded into Travel Methods and caster travel spells, page 20), the fixed flight routes, team
player-versus-player and the open-world flag, all five raids, round 1's two higher dungeon difficulties and its
timed dungeons (replaced by Challenge mode and Depth), the post-60 point track, and repeatable daily/weekly
quests. Raids and team player-versus-player are parked in [WISHLIST.md](WISHLIST.md).

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
  quest and pin the giver. Per-dungeon rows (discovered, cleared, Depth open) are listed under the Dungeon
  Finder row.
- **Never repeated**: an unlock card shows once per character. Alts can turn cards into one-line log messages
  with `set.interface.compactUnlockCards` (page 04).

### Every unlock, one paragraph each

Card text is written exactly as it should appear. `[key]` means the live binding.

#### Unlock: Day-one kit

**Level 1, no quest.** A new character starts in Brightwater with: **spell slot 1** (the class's first spell);
**basic attacks** with the starting weapon (its pattern on the card); **Tab targeting** (one hard target that
only you change, [page 05 §2](05-COMBAT.md#2-aiming-and-targeting)); **jog** (5.4 m/s) and **jump**; a
**16-slot backpack**; the **quest log**, the **map** (Hearthvale revealed as you walk), the **character sheet**,
**achievements** and **collections** (tracking from the first minute), **party invites, friends and chat**, and
**Tend the Fallen** (the shared out-of-combat revive, [page 06 §3.6](06-CLASSES.md#36-shared-verbs)). It is
always daylight — there is no torch to carry. The first minutes are a short guided walk (reuse the idea of
Farhold's `js/onboarding.js` line: one objective at a time, ignorable).
**Card (shown as a four-card welcome):** "Your first spell: <name>. Press [1]." · "Hold [attack] to keep swinging. <Weapon>: <pattern glyphs>." · "Press [Tab] to target an enemy. Your target stays until you change it." · "Follow the gold marker to your first task."

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

**Level 5, quest `q_hv_fall_and_rise`, giver `npc_hesk`** (the Wardens' drillmaster). Three drills: roll
through a swinging log, roll out of a red danger zone before it fills, and roll through a sparring partner's
overhead to earn a Riposte crit. What it teaches: i-frames (the moment of a roll when nothing can hurt you),
danger zones (the first telegraph a player learns — page 11), and that rolling costs stamina. **Card:** "Dodge
roll: press [Dodge] to roll 4 m. For 0.3 s of the roll, nothing can hurt you. Costs 30 stamina."

#### Unlock: Player trade

**Level 5, no quest.** Direct trade with another player opens (it is held back until 5 to stop brand-new
throwaway characters from being used for spam). **Card:** "Trade: right-click a player and choose Trade."

#### Unlock: Calling I

**Level 6, quest `q_calling_<class>_1`, giver `npc_trainer_<class>`** in the **Hall of Callings**, Highcourt
(one trainer per class; page 01 places the hall). The call arrives as a letter by courier from the Hall of
Callings (`npc_ollin_courier`, page 01), wherever you are. Structure and rewards:
[page 06 §13](06-CLASSES.md#13-calling-quests). What it teaches: the class mechanic, by making you use it; for
the ranger and warlock, their first tamed beast or bound demon. **Card:** "<Mechanic name>: <one sentence with a
number, from the class file>."

#### Unlock: Dungeon Finder and dungeon journal

**Level 6, quest `q_hv_the_barrow_bell`, giver `npc_odile_marsh`.** Something has woken in the Hollow Barrow
(`d01_hollow_barrow`, levels 5–7). Odile walks you to its entrance — which **discovers** it — then opens the
**dungeon journal** at the Barrow's page (bosses, their mechanics, their loot — `scr_dungeon_journal`) and shows
you the **Dungeon Finder** (`scr_group_finder`, page 15). The quest completes when you clear the Barrow, with
players or with followers.

**The discovery rule (canon W9):** a dungeon appears in the Dungeon Finder **only after you have discovered its
entrance** — by walking up to it, or by arriving there through a teleport (an oracle's Guiding Call, a scroll —
[page 06 §11](06-CLASSES.md#11-utility-spells), page 20). Each discovery is its own small unlock: a one-line log
message "Discovered: <dungeon> — it is now in your Dungeon Finder", a row on the Unlocks screen, and a small XP
award ([Events, discovery, dungeons](#events-discovery-dungeons)). An undiscovered dungeon shows in the journal
greyed out: "Not yet discovered — its entrance is in <region>."

What it teaches: roles (tank, healer, damage/support), that a Normal dungeon can be done with followers, and
that you can queue as your class's **hybrid** role too ([page 06 §3.3](06-CLASSES.md#33-hybrid-roles)).
**Cards:** "Dungeon journal: every boss, every mechanic, every drop. Open with [Shift+J]." · "Dungeon Finder: queue as <your roles> for any dungeon you have discovered. Open Social with [P], then Dungeon Finder."

#### Unlock: Depth (per dungeon)

**No level, no quest — clearing a dungeon on Normal** opens its **Depth** dial in the Dungeon Finder (canon W3;
page 12 owns every number). Depth has no timer and no keys. Each Depth raises the dungeon's level by **3** until
it reaches 60, with more and tougher enemies; the first time is typically the Hollow Barrow at level 7. Going
**past** level 60 needs the level-60 quest below. **Card:** "Depth: <dungeon> can now be run deeper. Each Depth
adds 3 to its level (up to 60) and more enemies."

#### Unlock: Recall Stone

**Level 7, quest `q_hv_a_bed_by_the_fire`, giver `npc_hv_innkeeper_bram`** at the Lamp and Ladder. Bram gives you
a **Recall Stone** (`it_recall_stone`, a permanent item in its own belt slot) and walks you to the **First
Waystone** (`lm_first_waystone`) on Brightwater's green to **bind** it there. Using it returns you to where it is
bound: a channel, out of combat only, with a long cooldown ([page 20](20-TRAVEL.md) owns the cast time and
cooldown). You can re-bind it at **any waystone or landmark in a town or other populated, safe place** — never a
dungeon entrance or a wild landmark (canon W24). **Card:** "Recall Stone: returns you to <place>. Bind it at any
waystone in a town or safe place."

#### Unlock: Bag slots

**Levels 7, 14, 24 and 36, no quest.** Four bag slots beside the 16-slot backpack. Bags are items (8 to 18
slots, page 08); the first 8-slot bag is a reward from the level-7 Recall Stone quest. **Card:** "Bag slot <n>: equip a bag to carry more. You have <n> of 4."

#### Unlock: First follower slot

**Level 8, quest `q_mf_coin_for_a_blade`, giver `npc_mf_broker_wendel`** (the mercenary broker in Reedhollow).
Wendel lends you a **Blade for Hire** for the quest (clearing a fen crossing) and then lets you hire from his
board. Follower rules: [page 06 §10](06-CLASSES.md#10-pets-tamed-bound-and-controlled); the ten mercenary kinds
and prices are Farhold's `data/mercenaries.json` (reuse; page 08 retunes prices). What it teaches: followers,
stances, and that a follower takes a group slot. **Card:** "Follower slot 1: hire a mercenary at any broker. More slots at levels 15, 25 and 35."

#### Unlock: Harvesting and a crafting profession

Two quests at level 9, both in Reedhollow (page 14 owns them).

**Harvesting — quest `q_mf_the_right_tool` "The Right Tool", giver `npc_neve_hollis`** (Reedhollow →
`sz_reedhollow_shallows`). Neve hands you a Common harvesting tool for the **tool** slot and has you pick 3
bog-myrtle, cut 2 peat-iron lumps and skin 1 marsh wolf — one shared **Harvesting** skill (1–300) covers mining,
skinning, herbs, timber and fishing, as long as the right tool is equipped (canon §12.3).

**A crafting profession — quest `q_mf_what_the_fen_gives_back` "A Trade of Your Own", giver
`npc_mf_scrapwright_mabli`** (Reedhollow, the profession stations). Mabli has you salvage 3 items, then you
**choose one crafting profession** of seven: **Blacksmithing, Leatherworking, Tailoring, Jewelcrafting,
Enchanting, Engineering, Alchemy**, each with its own skill (1–300), and make its first recipe.
**Salvage** (break an unwanted item into materials) opens for everyone with this quest. Page 19 owns every
profession rule, recipe and whether (and how) a profession can be changed later. **Cards:** "Harvesting: equip a
tool and press [E] on ore, herbs, timber, hides or fish. One skill, 1 to 300." · "Crafting: you are now a
<profession>. Skill 1 of 300. Recipes at any <profession> trainer." · "Salvage: break an item into materials
([Salvage] in the bag)."

#### Unlock: Spell slot 3

**Level 10, no quest.** **Card:** "New spell: <name>. Press [3]. <generated description>."

#### Unlock: Riding I

**Level 10, quest `q_hc_saddle_and_bridle`, giver `npc_oswin_stablemaster`** at the Stable Gate in Highcourt.
Oswin gives you a **Trail Horse** (`it_mount_trail_horse`, Common, in the mount slot; page 08 §20.1) and a lesson: mount, gallop, get
thrown. Mounts are **gear** in the mount slot with rarity and affixes (Farhold R10: "a mount is loot";
`js/gear.js`, reuse); riding skill decides the **speed** a mount may reach. Page 08 owns the mount catalogue
(horses, elk, boars, lizards, beetles, raptor-like runners, the crested plains-strider, giant frogs that swim…).

| Riding | Level | Ground speed | Extra |
|---|---:|---|---|
| I | 10 | +60% (8.6 m/s) | gallop: +35% for 4 s, then 3 s to recover (Farhold `gallopBonus`, `gallopSeconds`) |
| II | 20 | +100% (10.8 m/s) | — |
| III | 40 | +100% | swim at +80% on the surface; leap 6 m forward (Space while galloping). Aquatic mounts (giant frogs) swim from Riding I |
| IV | 60 | +100% ground, +150% flying (13.5 m/s) | flight where allowed (page 01) |

**Winged mounts before Riding IV** (griffin, drake, dragon, phoenix, Stormwing): they run like any mount and
**glide** — from any drop of 4 m or more (page 08 §20.1) they glide forward at their ground speed; they cannot
climb. Riding IV lets every winged mount **fly** (canon 00 §10).

Mounting is a 1.5 s cast, not in combat. A hit while mounted **Dazes** you and dismounts you (page 05 §10.4).
**Card:** "Riding I: summon your mount with [H]. Rides at 8.6 m/s. You cannot mount in a fight."

#### Unlock: Provoke

**Level 10, quest `q_hc_hold_the_line`, giver `npc_hc_shieldmaster_varr`** — offered only to the **13 classes
whose primary or hybrid role is Tank** ([page 06 §3.6](06-CLASSES.md#36-shared-verbs)). Round 1 called this verb
"Challenge"; it is **Provoke** now so it never clashes with Challenge mode. Varr's drill: pull three sparring
partners off a recruit and hold them for 20 s. What it teaches: threat, the nameplate threat glow, taunt, and
that the Tank role focus turns on the Guardian state. **Card:** "Provoke: press [Z] to make your target attack
you for 3 s. 20 m, 8 s cooldown."

#### Unlock: Duels

**Level 10, no quest.** Friendly duels are the only player-versus-player fighting in the game (canon W1).
**Card:** "Duels: right-click a player and choose Duel. A duel ends at 1 health. Nothing is won or lost." Rules:
[page 05 §21](05-COMBAT.md#21-duels).

#### Unlock: Bank, mail and the Trading Post

**Level 11, quest `q_hc_keys_to_the_city`, giver `npc_hc_herald_aldous`** at Highcourt's gate. A walk through
the capital with three stops, each an unlock: the **bank** (48 slots — page 15 owns account storage), the
**mailbox** (send items and gold), the **Trading Post** (the player market, page 15). All loot is tradeable
except quest items (canon W18). **Cards:** "Bank: 48 slots of storage at any banker." · "Mail: send items and gold from any mailbox." · "Trading Post: buy and sell with other players at any Trading Post."

#### Unlock: Talent tier 1

**Level 12, no quest.** Every spell you have gets its first talent pick ([page 06 §14](06-CLASSES.md#14-talents)).
**Card:** "Talents: choose 1 of 2–3 changes for each spell. Open Talents with [K]; the Talents tab is in the Spellbook. Choosing into an empty tier is free."

#### Unlock: Waystones

**Level 12, quest `q_hc_the_waywardens_oath` "The Wayfarer's Writ", giver `npc_hc_waywarden_liss`** at the
Waykeepers' Hall (`hc_waykeepers_hall`). The same quest unlocks Travel Methods (below) — it is one unlock. Every
region has 3–6 waystones (page 01). **Discover** one by touching it (once per character); it lights on your map.
A discovered waystone is: a place your **Recall Stone** can be bound (if it stands in a town or safe place); a
destination for **teleport scrolls** and caster **travel spells** ([page 06 §11](06-CLASSES.md#11-utility-spells));
and usually the site of a **Travel Methods** station. **A waystone does not itself send you anywhere** — that is
what Travel Methods, scrolls and casters are for ([page 20](20-TRAVEL.md)). The quest walks you to Highcourt's
and marks Brightwater's and Reedhollow's as discovered if you have touched them. **Card:** "Waystones: touch one
to discover it. Recall Stones bind to them; portals and scrolls arrive at them."

#### Unlock: Travel Methods

**Level 12, the same quest `q_hc_the_waywardens_oath`, giver `npc_hc_waywarden_liss`** (page 14). Liss sends
you to the South Gate station: ride the Kingsroad wagon to Brightwater (it waits up to 30 s for more riders,
then leaves), then the Wend barge back to the Low Wharf (it runs to a timetable), then buy one Scroll of
Passage. **Travel
Methods** replace round 1's fixed flight routes (canon W15; [page 20](20-TRAVEL.md) owns every route and number): wagons, horse
and creature trails, giant striders, boats, barges, trains, and flyers where needed. They are much faster than
walking, follow **known routes on real roads**, **protect riders** from weather and enemies, and **snap back onto
the route** if something goes wrong (a cart that falls off a bridge reappears on its path). Some leave like a
bus, waiting a set time for more riders; some run to a **schedule** (trains, boats, barges) and a group boards
together. Fares are gold (page 08). **Card:** "Travel Methods: ride a route from any station to any station you
have discovered. Nothing can attack you on the way."

#### Unlock: Class travel spells

**Level 12, no quest — four classes only.** The mage learns **Portal**, the chronomancer **Retrace**, the oracle
**Guiding Call** and the druid **Heron's Flight** — out-of-combat utility spells that use no slot
([page 06 §11](06-CLASSES.md#11-utility-spells); page 20 owns the numbers). They arrive with Travel Methods so a
caster can carry friends to waystones and dungeon entrances they have not discovered: **arriving by a teleport
counts as discovering the place**. **Card (mage):** "Portal: open a gate your party can step through to any town
waystone you have discovered. Out of combat. Find it in the Utility row of your spellbook."

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
(raise an item's rarity one step, adding an affix). Open to everyone, whatever their profession (page 19 says
what a Blacksmith or Enchanter does better at the bench). **Card:** "Upgrade bench: temper an affix's number or promote an item one rarity. Any forge from now on."

#### Unlock: Potion belt, 4 slots

**Level 16, no quest.** **Card:** "Potion belt: 2 more slots, on [9] and [0]."

#### Unlock: Spell slot 4

**Level 18, no quest.** **Card:** "New spell: <name>. Press [4]. <generated description>."

#### Unlock: Calling II

**Level 20, quest `q_calling_<class>_2`.** A letter from your trainer arrives by mail at 20. [Page 06 §13](06-CLASSES.md#13-calling-quests).
**Card:** "<Mechanic>, second stage: <one sentence with a number>."

#### Unlock: Riding II

**Level 20, quest `q_ss_the_sand_runners`, giver `npc_zelde_marrach`** in Dunehold. Race a
caravan's outriders across the dunes. Reward: riding II and a **Dune Strider** (`it_mount_dune_strider`, Uncommon mount; page 08 §20.1).
**Card:** "Riding II: mounts may now run at 10.8 m/s."

#### Unlock: Talent tier 2

**Level 22, no quest.** **Card:** "Talents: tier 2 is open for every spell."

#### Unlock: The wardrobe

**Level 25, quest `q_ww_the_moonwell_mirror`, giver `npc_ww_glamourist_eluned`** in Silverbough. Every item you
have ever equipped is saved as an **appearance** (collections); at a wardrobe (any hub) you may make any
equipped item **look like** any appearance of the same slot and armour tier (weapons: same family). Cost:
5% of the item's sell price. **Card:** "Wardrobe: change how an item looks to any appearance you have collected. At any glamourist."

#### Unlock: Spell slot 5

**Level 28, no quest.** **Card:** "New spell: <name>. Press [5]. <generated description>."

#### Unlock: Second Loadout

**Level 30, quest `q_hc_two_minds_one_will`, giver `npc_the_unbinder`.** A second saved build (canon W10): its own
**talent picks, perks, role focus, bar layout and a gear set**. Switching: a **5 s cast out of combat**, free,
**30 s** cooldown; the gear set's pieces must be in your bags. Anything you change while in a loadout only
changes that loadout. This is how a **hybrid role** is kept ready ([page 06 §3.3](06-CLASSES.md#33-hybrid-roles)):
the Dungeon Finder's role check offers "Switch to Loadout 2" when it gives you your other role. **Card:**
"Second Loadout: keep two builds — talents, perks, role focus and gear — and switch between them out of combat."

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

**Level 40, quest `q_calling_<class>_3`.** [Page 06 §13](06-CLASSES.md#13-calling-quests). **Card:** "<Mechanic>, mastered: <one sentence with a number>."

#### Unlock: Riding III

**Level 40, quest `q_dc_the_tide_steed`, giver `npc_dc_tidewright_morwen`** in Saltmarch. Tame a **Tide Steed**
(`it_mount_tide_steed`, Rare mount; page 08 §20.1) in a sea cave. Riding III lets any mount swim on the surface and leap. **Card:** "Riding III: your mount swims at +80% and leaps 6 m with [Jump] while galloping."

#### Unlock: Talent tier 4

**Level 45, no quest.** **Card:** "Talents: tier 4 — the last pick for every spell."

#### Unlock: The Fire Court

**Level 60, story quest 11.10 `q_ms_the_fire_court`, giver `npc_marshal_ansel_crane`** in Last Light (page 14). The climax of the
main story: **The Fire Court** (`d15_fire_court`), a 5-player dungeon where the party faces the Fire King
(`b_fire_king_kaedros`) — it was raid r04 in round 1 and is rebuilt for five (canon 00 §8). Page 14 owns the
story; page 12 the dungeon. **Card:** "The Fire Court: the end of the road, for 5 players at level 60."

#### Unlock: Challenge mode

**Level 60, quest `q_kf_the_harder_road` "Harder Doors", giver `npc_marshal_ansel_crane`** in Last Light. Every dungeon's
**Challenge** difficulty at level 60 (canon W4): the full boss mechanic set, harder numbers and better loot;
Challenge-mode bosses drop loot **once a week** per boss (Monday 06:00, canon W5). No followers (page 06 §3.4).
A dungeon must be discovered to be queued. **Card:** "Challenge mode: every dungeon at level 60 with its full set
of mechanics, for 5 players. Choose it in the Dungeon Finder."

#### Unlock: Depth past level 60

**Level 60, quest `q_kf_the_deep_road` "How Deep It Goes", giver `npc_kf_depthwarden_orrin`** in Last Light. Depth already opens per
dungeon when you clear it on Normal (above), raising it 3 levels a Depth until it reaches 60. This quest lets you
go **past** 60: each further Depth is **substantially harder** (health and damage climb, packs grow) and pays
**high-tier rewards** (better rarity odds, jewels, souls, special rarities); every **5 Depths** is a **Depth tier**
that adds more and tougher enemies, **new enemy types** and **new enemy abilities** (canon W3). No timer, no keys.
Page 12 owns every number. **Card:** "Depth past 60: every dungeon can now go deeper than level 60. Every 5 Depths
brings new enemies."

#### Unlock: Spire Isle and The Spire

**Level 60, story quest 12.2 `q_ms_across_the_pale_sea`, giver `npc_hale_marrow`** in Saltmarch (page 14),
offered after The Fire Court's last boss has been killed once and the Heartflame carried to Saltmarch (12.1). The Cutwater's boats carry you across the Pale Sea. Opens
the island (region 11, `spire_isle`) and **The Spire** (`d16_the_spire`, the epilogue — was raid r05, rebuilt for
five). **Card:** "Spire Isle is open. The Spire: the last dungeon, for 5 players."

#### Unlock: Riding IV — the sky

**Level 60, chain `q_sky_1` … `q_sky_5`, giver `npc_kf_skywright_aveline`** in Last Light. The hardest unlock
in the game, on purpose:

| Step | Quest | Task |
|---:|---|---|
| 1 | `q_sky_1` The First Feather | kill 3 different world bosses (any order, any week) and bring back a storm feather from each |
| 2 | `q_sky_2` The Fire Court's Wings | defeat The Fire Court's winged boss on any difficulty |
| 3 | `q_sky_3` Proof in the Deep | clear any dungeon at the **first Depth tier past level 60** (page 12) |
| 4 | `q_sky_4` Standing | reach **Kindred** with any two of the seven factions ([Reputation](#reputation)) |
| 5 | `q_sky_5` The Stormwing | a solo trial: ride a wild **Stormwing** until it accepts you (a 4-minute flying fight against the wind) |

Reward: Riding IV and the **Stormwing** (`it_mount_stormwing`, Epic flying mount; page 08 §20.1). Flying works
only where page 01 allows it (not in cities or dungeons). **Card:** "Riding IV: fly with [Jump] twice while
mounted. 13.5 m/s in the air."

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
| Gear | attribute affixes (`of_str` etc., Farhold `js/affixes.js`: 2–5 at item level 1, up to about ×4.5 at item level 60). A level-appropriate full set gives about **2.2 × level** to the primary and **1.5 × level** to CON |
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
| rove | The Light Step | move speed, dodge, smaller enemy notice range (Farhold `stealth`), minimap range, DEX |

Each arm has seven rings (3 minor · 4 minor · 3 major · 4 minor · 2 **talent** · 3 major · 1 **capstone**). (Farhold calls the end nodes *keystones*; Wildmarch says **capstone**, because "keystone" is a banned word — canon 00 §12.5.)
**Eight oddballs** sit on the seams between arms. In R25 the melee and arcane arms **branch** past ring 6 into
four paths each (melee: Two Great Weights, The Single Weight, Twin Edges, Sword and Board — one capstone per
hand shape; arcane: Flame and Frost, Storm and Venom, Dusk and Dawn, The Inner Study — two capstones per path,
one per element plus Overflow and Blood Price). A node is taken when something touching it is taken: **the
shape of the tree is the cost**. Capstones have a gift **and** a cost (e.g. Held Ground: +40% armour, +10%
resistance to all, block +25 — and −25% move speed). About **203 nodes** in all.

### What Wildmarch changes `(new)`

| Change | Rule | Why |
|---|---|---|
| **Points** | **one per level from 2 = 59** (canon). No bonus perk points from bosses or landmarks | Farhold gave `(level − 1) + floor((level − 1) / 5)` plus `bonusPerks` rewards; canon fixes 59 |
| **Reach** | 59 points take about 29% of the forest: a full arm to its capstone (7–10 points) and some of two or three others | same as Farhold's 58 points at 50 |
| **Level gates** | ring-5 **talent** nodes need level **15**; the R25 **branch paths** need level **25**; **capstones** need level **30** | a capstone is 7 points from the hub — without a gate a level-8 character could hold one |
| **Flat nodes grow** | every flat node (health, armour, flat damage, block power, barrier, magic resistance, health/mana on kill, health/mana regen) is worth **× (1 + 0.1 × (level − 1))**; attribute nodes **× (1 + 0.05 × (level − 1))**; percentage nodes never change | "+22 maximum health" is 19% of a level-1 character and 1% of a level-60 one; growing with you keeps a perk worth its point |
| **Sunder** (melee talent) | the last swing of every pattern strips **3% of base armour** for the fight (Farhold: 8 flat, forever) | page 05 §8.3 |
| **Riposte** (melee talent) | also armed by rolling through a hit and by a parry | page 05 §3 |
| **Blood Price** (arcane capstone) | spells cost health instead of their resource: mana spells cost health equal to `cost ÷ 1,000 × 50%` of max HP (a 120-mana spell: 6%); Momentum and Tempo spells 0.2% of max HP per point | Wildmarch's three resources |
| **Echo** (arcane talent) | 1 cast in 6 fires again free — at most once every 4 s | group balance |
| **The Kept Company / The Pack** | follower slots from perks apply in the **open world**; instances cap bodies at the group size | page 06 §10.5 |
| **The Long Odds** (fortune arm) | carries the **magic-find** stats (page 08): item quantity, item rarity, gold find, **XP gain**, **reputation gain**, profession skill and profession XP. Farhold's lamp-range nodes are gone (no light, always daylight) and become profession-XP nodes; minimap range stays | canon 00 §12.3 |
| **The Light Step** (rove arm) | Farhold's `stealth` nodes stay under the plain name **smaller enemy notice range** (page 05 §13.6) | the rogue has no stealth (canon W29) |
| **Far Shot** (ranged capstone) | unchanged | — |
| **Doubled Grasp** (melee capstone) | unchanged — two two-handers | — |
| **Capstone swap** | a capstone in a branch path can only be taken if its hands match right now (Farhold `handsFit`) — unchanged | — |

The **Perks** tab of the character screen (`scr_character`, Perks tab — page 03) is Farhold's lattice view with
zoom and pan (R10), unchanged; nodes show their **current** value at your level.

---

## Talents

Owned by [page 06 §14](06-CLASSES.md#14-talents); the schedule is progression's:

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
- **Second Loadout** (level 30): switching is free; each loadout is retrained separately.

---

## Reputation

### Farhold today `(reuse: js/factions.js, data/factions.json, data/faction-rewards.json)`

One number per faction from −100 to +100, five bands (**Hunted** ≤ −60, **Disliked**, **Known**, **Trusted**
≥ 20, **Sworn** ≥ 60) with a shop price multiplier (Disliked ×1.4, Trusted ×0.85, Sworn ×0.70). A deed for one
faction moves its **rivals** by a third of the opposite amount, so nobody can be liked by everybody. Deeds
have fixed values (a job +6, a caravan escorted +8, a nemesis killed +12…). Trusted and Sworn each open one
reward per faction ("A warden of your own"). **Farhold's problem** (the owner, W12): a faction might live only in
one low-level zone on one island, so players ignored it — it had nothing for them later.

### Wildmarch: seven factions with further reach `(new scale, reused rules)`

Canon 00 §12.2 (W12): **fewer factions, each present from the starting regions to level 60**, each with rewards
that stay useful at 60. A faction is made of **chapters** — local groups with their own towns, faces and quests
(the old regional factions became chapters). **Standing is per faction**: a deed for any chapter counts for the
whole faction, and a chapter's quartermaster sells from the whole faction's tier. Page 01 owns the chapters'
towns and people; this page owns the tiers, deeds and rewards. Standing is **per character**.

| id | Faction | What they want | Chapters | Where (low → high) | Rival |
|---|---|---|---|---|---|
| `fac_wardens` | **The Wardens** | roads safe, borders held | Vale watch, Rime watch, the Waystone keepers | Hearthvale → Frostmantle → Spire Isle | — (no rival) |
| `fac_crown_assembly` | **The Crown Assembly** | the realm kept together | Highcourt, the fort garrisons (Fort Ashfall, Last Light) | Highcourt → Cinder Steppe → Kingsfire | the Greenhand |
| `fac_deepforge_clans` | **The Deepforge Clans** | the deep roads back, steel not sold north | Anvilgate, Hollowpeak, the Stone Count | Greyridge → Frostmantle → Kingsfire forges | the Cutwater |
| `fac_greenhand` | **The Greenhand** | everyone fed, the wild kept whole | farmers and herders, the Fenfolk, the Moonwell Circle | Hearthvale → Mossfen → Whisperwood → Cinder Steppe herds | the Crown Assembly |
| `fac_lantern_house` | **The Lantern House** | every old thing catalogued, the Tear measured | scholars, the Longsight, the Riftwatch | Highcourt → Sunscar → Riftmarch → Spire Isle | the Quiet Wake |
| `fac_cutwater` | **The Cutwater** | free rivers and seas, no tolls | river boatmen, the Saltbound, the barge lines | Mossfen → Highcourt wharf → Drowned Coast | the Deepforge Clans |
| `fac_quiet_wake` | **The Quiet Wake** | the dead kept down, the tombs kept shut | graveyard keepers, the Sandsworn | every graveyard → Sunscar → Drowned Coast → Kingsfire | the Lantern House |

**Every faction has level-60 work.** So that a faction met at 5 is still worth serving at 60, each has chapter
quests and events in at least one level-60 place *(proposed; page 01 and page 14 place them)*:

| Faction | Where a level-60 character earns full standing |
|---|---|
| Wardens | the Waystone keepers on Spire Isle; the Rime watch's high passes |
| Crown Assembly | the Last Light garrison, Kingsfire |
| Deepforge Clans | the Kingsfire forges |
| Greenhand | the relief camps that feed Last Light, on Kingsfire's southern edge |
| Lantern House | the Riftwatch and the Spire Isle archive |
| Cutwater | the Pale Sea crossing to Spire Isle (the Cutwater run the boats) |
| Quiet Wake | the ash-graves of Kingsfire |

**Tiers** (names canon W22; the word list from Farhold plus Welcome and Kindred):

| Tier | Standing | Shop prices | What opens at the faction's quartermasters |
|---|---:|---:|---|
| Hunted | ≤ −3,000 | refuse to trade | their guards attack on sight; their town gates shut (Farhold R27 M4) |
| Disliked | −2,999 … −1 | ×1.40 | quests refuse; gates open for a fee |
| **Known** | 0 … 2,999 | ×1.00 | everyone starts here; consumables |
| **Welcome** | 3,000 … 8,999 | ×0.95 | the faction **tabard**; **Uncommon gear at your level** in the faction's theme; gem and consumable recipes |
| **Trusted** | 9,000 … 20,999 | ×0.85 | **Rare gear at your level**; **gadget recipes** (Engineering); the faction **mount** (Uncommon at first, rising with tier); the faction's Trusted reward |
| **Kindred** | 21,000 … 41,999 | ×0.80 | **Epic gear at your level**; a **jewel** of the faction's theme at your level (Rare); one **class-set token for Set A** per character ([page 06 §15](06-CLASSES.md#15-class-sets)) |
| **Sworn** | 42,000 (max) | ×0.70 | the title "*<name> of the <Faction>*"; the faction's **Unique** items at your level; the mount at Epic rarity; the faction's Sworn reward |

**Rewards scale to your level (canon W12).** Every piece of gear, jewel and mount a quartermaster sells is made
**at your level when you buy it** (item level = your level, capped at 60; page 08 owns the rolls). So Wardens gear
bought at level 20 and again at level 60 is two different items, and a faction you are Sworn to at 30 is still a
supplier at 60. Faction gear rolls as a Normal dungeon drop of the same rarity at that level and never rolls a
special rarity; its price in gold scales with your level (page 08). A tier, once reached, is never lost except
by losing standing.

**What each faction sells** *(names proposed; page 08 owns the items and the mount catalogue)*:

| Faction | Gear theme | Jewels / gems | Recipes | Mount | Trusted reward | Sworn reward |
|---|---|---|---|---|---|---|
| Wardens | shields, heavy and medium armour, defensive rings | defensive jewels | Blacksmithing (armour) | Roadwarden Elk | "Wardens on the road": Warden patrols join any fight you start within 40 m | "A warden of your own": a unique follower |
| Crown Assembly | swords, spears, crossbows, banners | offensive jewels | Leatherworking, Engineering | Highcourt Charger | Travel Methods fares −25% | a quartermaster of the Crown in every hub |
| Deepforge Clans | hammers, axes, heavy armour | **cut gems** of every kind | Blacksmithing (weapons), Jewelcrafting | Tunnel Boar | repairs free at clan smiths | one extra **gem socket** punched into an item (page 08 limits) |
| Greenhand | light armour, bows, staves, quarterstaffs | nature jewels | Alchemy, Leatherworking, cooking | Meadow Strider (the crested plains-strider) | Well Fed lasts twice as long; herb and timber nodes show on your map | a Unique harvesting tool for the tool slot |
| Lantern House | cloth armour, foci, wands | caster jewels | Enchanting, Engineering (gadgets) | Archive Beetle | teleport scrolls cost half | a Unique jewel, the Archivist's Lens |
| Cutwater | light armour, rapiers, sabres, hand crossbows | speed and crit jewels | Tailoring, Engineering | Marsh Leaper (a giant frog that swims) | free passage on every boat and barge route | a personal river skiff (page 20) |
| Quiet Wake | medium armour, maces, sceptres | holy and shadow jewels | Tailoring, Alchemy | Pale Stag | enemies you kill cannot be raised again by enemy necromancers | a class-neutral **soul** (page 08/09 owns souls) |

**Earning standing:**

| Deed | Standing |
|---|---:|
| A normal quest for the faction (any chapter) | +250 (a grey quest — 3+ levels below you — pays +125) |
| A main-story quest in a region the faction holds | +500 |
| A dynamic event in a region it holds (gold / silver / bronze) | +150 / +100 / +50 |
| A dungeon boss while wearing the faction's **tabard** (any dungeon) | Normal **+15** · Challenge **+40** · Depth **+15 + 2 per Depth**, at most +60 |
| A dungeon boss **without** a tabard | half of the above to the faction that holds the dungeon's region |
| A world boss in a region it holds | +100 (first kill of that world boss each week) |
| A profession **work order** from its quartermaster (page 19) | +100 |
| Faction tokens (dropped by the faction's enemies, 5% at even level) | +25 each, handed in at the quartermaster |
| Killing their people / robbing their caravans | −250 / −500 |

There are **no daily or weekly reputation quests** (canon W20). The grey rule for standing is gentler than for
XP on purpose: low content still pays **half**, so helping a friend in Hearthvale is never wasted.

**Reputation gain (magic find)** `(new — canon 00 §12.3; page 08 owns where it rolls)`:

| Rule | Value |
|---|---|
| Stat | `mf_reputation`, written "**+N% reputation gained**" |
| Sources | jewellery affixes and gems, perk nodes on The Long Odds, the tabard's own +5% for its faction |
| Applies to | every **positive** deed above, for every faction |
| Never applies to | losses, and the **rival shift** (the rival moves by a third of the **base** amount, not the boosted one) |
| Stacking | one additive bucket; cap **+100%** |

**Rivals**: a deed for a faction moves each of its rivals by **one third** of the base amount, the other way
(Farhold `RIVAL_SHARE`, kept). The pairs are Crown Assembly ↔ Greenhand, Deepforge Clans ↔ Cutwater, Lantern
House ↔ Quiet Wake; the Wardens have none. The rule means a player can be **Sworn** to at most one side of each
pair — and to the Wardens as well.

**Enemy factions** (standing only goes **down**; Farhold's `unlikeable` rule): the warbands — Sootwick Gang,
Unburied Legion, Thornmane Packs, **Ashtusk Warhost**, Stonehide Clans, **Kingsfire Legion**
(`fac_kingsfire_legion`) — plus the Drowned, the Threadcutters (`fac_threadcutters`) and the Riftborn. Their
standing only decides how hard their guards look for you. The Deepworn stay neutral.

**Screen**: `scr_reputation` (a tab of the character screen) — one row per faction: name, colour, tier bar,
next reward, the chapters near you and where to earn at your level; the enemy factions below a divider. At 60 the
XP bar can show one tracked faction's standing instead (right-click a row → "Show on XP bar").

---

## After level 60

`(new — replaces round 1's post-60 point track, which is gone; canon W13)`

Level 60 is the cap, and there is **no power track after it** — no point board, no endless XP levels. What a
level-60 character does:

| Activity | What it gives | Owner |
|---|---|---|
| **Depth past level 60** | each Depth harder than the last; every 5 Depths a Depth tier with new enemy types and abilities; better rarity odds, jewels, souls and special rarities | page 12 |
| **Challenge mode** | every dungeon with its full mechanic set; Set B pieces and Challenge-only drops, once a week per boss | page 12 |
| **The Spire** (`d16_the_spire`) and Spire Isle | the epilogue, its secret boss, Set C | pages 12, 14 |
| **Sockets** | chasing the right **jewel**, finding **souls** (from certain bosses, quests or great luck), cutting **gems**, configuring **gadgets** | page 08 |
| **Professions** | Harvesting and your crafting profession to 300; the best recipes need Depth and Challenge materials | page 19 |
| **Reputation** | the seven factions' Kindred and Sworn tiers, whose gear is made at 60 when you buy it at 60 | this page |
| **World bosses** | loot once a week per boss; the first feathers of the flying chain | page 13 |
| **The flying mount** | Riding IV, `q_sky_1` … `q_sky_5` | this page |
| **Collections, achievements, titles** | mounts (every species), appearances, the bestiary, lore, souls seen | this page |
| **Alts** | Wayfarer's Memory (+10% XP gain per level-60 character, up to +30%) | this page |

---

## Achievements

`(new; the nearest relative in the playground is Emberveil's Named Foes board in its Journal — prototypes/emberveil, reuse the idea)`

- **Screen** `scr_sheet_achievements` (a character-sheet tab, page 03; no own key — `Y` is Set Focus and `U` is Unlocks on page 02). Account-wide unless marked "character".
- **Ids** `ach_<snake>` (canon prefix, 00 §10).
- **Points**: 5 / 10 / 25 / 50 per achievement; the total shows on the character's inspect card.
- **Rewards**: titles, mount and follower appearances, wardrobe appearances, tabards, and **Wayfarer's
  Memory**-style account bonuses (only cosmetic or convenience — never power).

| Category | Examples (id — requirement — reward) |
|---|---|
| Levels | `ach_level_10` … `ach_level_60` — reach the level — points; 60: title "*the Seasoned*" |
| Callings | `ach_calling_3_<class>` — finish Calling III with that class — class tabard; all 30: title "*of Every Calling*" |
| Hybrid roles | `ach_hybrid_<class>` — clear a Normal dungeon in your class's hybrid role — points; 10 classes: title "*the Versatile*" |
| Exploration | `ach_explore_<region>` — discover every named area in a region — points; all 11: mount appearance "Cartographer's Stag" |
| Waystones | `ach_waystones_all` — discover every waystone — title "*the Wayfarer*" |
| Dungeon entrances | `ach_entrances_all` — discover all 16 dungeon entrances — points |
| Travel | `ach_travel_routes_all` — ride every Travel Methods route once — mount appearance |
| Quests | `ach_quests_<region>` — finish the region's story — points |
| Dungeons | `ach_d01_hollow_barrow` … — clear on Normal / on Challenge / at each Depth tier past 60 — points, appearances |
| Challenge | `ach_challenge_all` — every boss of all 16 dungeons on Challenge — title "*the Unbroken*" |
| Depth | `ach_depth_tier_<n>` — clear any dungeon at the n-th Depth tier past 60 — titles ([Titles](#titles)) |
| Bosses | `ach_boss_<id>_no_hit` — beat a named boss without being hit by a danger zone — appearance |
| Secret bosses | `ach_secret_<id>` — find and beat a dungeon's secret boss — points, appearance |
| World bosses | `ach_world_bosses_all` — defeat every world boss — title "*Stormbreaker*" |
| Bestiary | `ach_bestiary_<family>` — kill every monster of a family — points |
| Reputation | `ach_sworn_<faction>` — reach Sworn — points; `ach_sworn_four` — Sworn to four factions at once (the most the rival pairs allow: the Wardens plus one side of each pair) — title "*the Beloved*" |
| Professions | `ach_harvest_300`, `ach_<profession>_300` — reach 300 — title "*Master <Profession>*" |
| Sockets | `ach_souls_10` — socket 10 different souls — points |
| Collections | `ach_mounts_25`, `ach_appearances_500` — mount appearances |
| Duels | `ach_duels_100` — finish 100 duels (win or lose) — an emote; no ranking |
| Feats | `ach_feat_<snake>` — limited-time (season firsts) — never repeatable |

---

## Collections

`scr_sheet_collections` (a character-sheet tab, page 03; no own key). Account-wide unless marked.

| Collection | What is collected | How |
|---|---|---|
| Mounts | every mount item's **appearance**, by species (horses, elk, boars, lizards, beetles, runners, striders, frogs, flyers…) — the item's stats stay on the item (Farhold R10 mounts are loot) | equip it once |
| Followers | mercenary appearances | hire or earn |
| Pets | every tamed beast species and bound demon kind (ranger and warlock characters) | tame or bind it |
| Appearances (wardrobe) | every item's look by slot | equip it once |
| Titles | every title earned | earn it |
| Bestiary | every monster id: kills, and lore that unlocks at 1 / 50 / 500 kills; greater rarities seen | kill it (Emberveil's Named Foes board, reuse the idea) |
| Lore | landmark inscriptions, books, boss dialog lines heard | read / hear |
| Class sets | pieces of every class set, per class (character) | loot |
| Legendaries and souls | the legendary powers and souls you have seen, with their numbers | loot |
| Maps | named areas, waystones, dungeon entrances, Travel Methods stations | walk there (or arrive by teleport) |

---

## Titles

A title is shown under the name on the nameplate (`set.interface.showTitles`). One active at a time, chosen
on the character screen.

| Source | Titles |
|---|---|
| Callings | "*<name> the Proven <Class>*" (II), "*Master <Class>*" (III) |
| Reputation | "*<name> of the <Faction>*" at Sworn |
| Depth | Depth tier 1 past 60 "*the Deep-Walker*", tier 2 "*the Undaunted*", tier 3 "*the Bottomless*", tier 4 "*Keeper of the Deep Count*" (page 12 may add more tiers) |
| Challenge | "*the Unbroken*" (every boss on Challenge); the last boss of The Spire on Challenge: "*Spirebreaker*" |
| Professions | "*Master <Profession>*" at 300 |
| Achievements | as listed above |

No title names anything from another game.

---

## What changed from Farhold

| System | Farhold | Wildmarch |
|---|---|---|
| Level cap | a world setting (30/50/100), default 50 | fixed **60** (canon) |
| XP curve | three-part, fractions of the cap, two dips at cap 60 | one smooth formula, `600 × 1.107^(L−1)` a level; ~103 h to 60 |
| Kill XP | `base × 1.09^(L−1) × 0.2 × gap` | `10 × 1.04^(L−1) × rank × gap × (1 + XP gain)` (same gap rule) |
| Event XP | `base × kind × (1 + 0.12 × (zoneLevel − 1))` | a share of the zone level's XP-to-next |
| Bonus XP | — | **no bonus for time logged out** (canon W11); the **XP gain** magic-find stat and Wayfarer's Memory, cap +100% |
| Unlocks | almost everything open at once | a 60-level ladder of level, quest and clear unlocks, each with a card |
| Spell slots | 1/3/6/12/18/24 | 1/4/10/18/28/40 (canon) |
| Talent tiers | 3/8/18/28 | 12/22/32/45 (canon) |
| Attributes | no point-buy, base 6, gear and perks only | automatic class growth each level + gear + perks; 1% per point |
| Perk points | `(L−1) + floor((L−1)/5)` + bonus points | 59 (canon), level gates on talents/branches/capstones, flat nodes grow with level |
| Retraining | the Unbinder, gold | same, + newcomer's and patch grace, the **Second Loadout** |
| Reputation | −100…+100, five bands, many small regional factions | −3,000…+42,000, seven tiers, **seven factions that reach from level 1 to 60**, rewards made at your level, the same rival rule, **reputation gain** |
| After the cap | nothing | Depth past 60, Challenge mode, sockets, professions, reputation, collections — no point track (canon W13) |
| Followers | 3 slots at 1, +1 at 20 and 30 | 1 at 8 (quest), +1 at 15, 25, 35; group slots in dungeons |
| Mount | an item from the start | gear + four riding ranks by quest |
| Travel | walking, boats, flight | walking, mounts, **Travel Methods** (12), the **Recall Stone** (7), caster travel spells (12) — page 20 |

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

`by` is `"level"`, `"quest"` or `"clear"` (a per-dungeon Depth unlock: `{ "by": "clear", "dungeon": "d01_hollow_barrow" }`).
`classes` limits an unlock to some classes (`unl_provoke`: the 13 tank-capable ids; `unl_travel_spells`: mage,
chronomancer, oracle, druid).

**The XP knobs** (`data/balance.json`, `xp` block):

```json
{
  "xp": {
    "toNextBase": 600, "toNextGrowth": 1.107,
    "timeBaseMinutes": 10, "timeGrowth": 1.065,
    "killBase": 10, "killGrowth": 1.04, "greaterRarityMult": 1.5,
    "gap": { "belowPerLevel": 0.2, "abovePerLevel": 0.15, "aboveCap": 1.6 },
    "questShare": 0.07, "kinds": { "normal": 1, "bonus": 0.5, "story": 2, "unlock": 1.5, "calling": 3 },
    "eventShare": 0.05, "areaShare": 0.01, "landmarkShare": 0.02, "entranceShare": 0.03, "dungeonShare": 0.30,
    "worldBossWeekly": true,
    "group": [1, 1.15, 1.30, 1.45, 1.60], "carryGap": 10, "carryMult": 0.5,
    "account": { "perCharacter": 0.10, "cap": 0.30 },
    "xpGainCap": 1.0
  },
  "reputation": {
    "tiers": { "hunted": -3000, "disliked": -2999, "known": 0, "welcome": 3000, "trusted": 9000, "kindred": 21000, "sworn": 42000 },
    "rivalShare": 0.3333, "greyShare": 0.5, "gainCap": 1.0,
    "deeds": { "quest": 250, "story": 500, "event": [150, 100, 50], "bossNormal": 15, "bossChallenge": 40,
               "bossDepthBase": 15, "bossDepthPer": 2, "bossDepthMax": 60, "untabardedShare": 0.5,
               "worldBoss": 100, "workOrder": 100, "token": 25, "killMember": -250, "robCaravan": -500 }
  }
}
```

**A character's progression block** (in the save; page 16 owns the save):

```json
{
  "level": 23, "xp": 58210,
  "unlocks": ["unl_sprint", "unl_dodge_roll", "..."],
  "discovered": { "dungeons": ["d01_hollow_barrow", "d02_drowned_mill"], "waystones": ["ws_brightwater", "..."] },
  "clearedNormal": ["d01_hollow_barrow"],
  "perks": ["start", "melee:1:0", "..."], "skillTalents": { "mage_fireball": { "1": "a", "2": "b" } },
  "loadouts": [{ "perks": [], "skillTalents": {}, "roleFocus": "primary", "bar": [], "gear": {} },
               { "perks": [], "skillTalents": {}, "roleFocus": "hybrid",  "bar": [], "gear": {} }],
  "activeLoadout": 0,
  "standing": { "fac_wardens": 9120, "fac_greenhand": 3400, "fac_crown_assembly": -1130 },
  "trackedFaction": "fac_wardens",
  "titles": ["the_proven_mage"], "activeTitle": "the_proven_mage"
}
```

Farhold lesson (R18, R20): **every one of these fields must be on the save list** — `bonusPerks`, the perk forest
and `skillTalents` were each once missing from it and silently reset on reload. Page 16's save test must
round-trip every field here.

---

## Open questions

1. **103 hours to 60** for a first character — right size? Halving it means `timeGrowth` 1.065 → about 1.053.
   (XP gain at its cap already halves it for a player who builds for it.)
2. **No bonus perk points** (canon 59) — Farhold paid perk points for world bosses and landmarks and players
   liked finding them. Allow a few (e.g. 5 from world bosses) on top of 59?
3. **The flying chain** needs a Depth-tier clear past 60 and two Kindred reputations — too hard, or right for "a
   hard quest chain"?
4. **Sprint at level 2 and the dodge roll at 5** — is five levels without a roll acceptable, or should a weaker
   sidestep exist from level 1?
5. **Followers from level 8** (quest) rather than level 1 — Farhold gave three slots at level 1.
6. **Faction gear made at your level** — recommended as written (it is what makes low-level factions matter at
   60). The risk is that Sworn faction gear competes with dungeon gear; page 08 keeps it at a Normal dungeon
   drop's strength and never a special rarity.
7. **Grey quests pay half standing** — generous on purpose so helping a friend is never wasted. Too generous?
8. **Waystones do not teleport** — decided here so Travel Methods, scrolls and caster portals have a job. Page 20
   may still want a paid waystone-to-waystone jump as a late convenience; say if you want it.
