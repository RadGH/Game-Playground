# WILDMARCH — Design Bible, page 13: World Bosses

> *"It does not care how many of you came. It only cares how many are left."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.** Claude-facing design page.

**This page owns:** every **world boss** — the eight regional ones and the five seasonal ones — their sites,
spawn timers, open tagging, scaling, the weekly **Ascendant** rotation, abilities, minions and loot tables.

**World bosses are the one open-group exception to the 5-player rule** (canon 00 §1, §11 rule 9). Everything
else in the game is designed for at most five players; a world boss is designed for **any number**, from a
party of five up to 60, and scales to whoever turns up.

**Raids are not in v2.** The round-1 raid designs (r01–r05, their rules, attunement, raid frames and raid loot)
moved to [WISHLIST.md](WISHLIST.md) unchanged. The two story raids became 5-player dungeons d15 *The Fire Court*
and d16 *The Spire* ([page 12](12-DUNGEONS.md)).

**This page reads (and must agree with):** [page 00](00-OVERVIEW.md) (canon: ids, levels, weekly reset),
[page 01](01-WORLD-LORE.md) (the world boss sites `wb_site_*` and their landmarks),
[page 05](05-COMBAT.md) (damage maths, revives), [page 07](07-PROGRESSION.md) (XP, achievements, titles, the
flying chain), [page 08](08-ITEMS.md) (every payout number, special rarities, magic find),
[page 09](09-SETS-LEGENDARIES.md) (the world-boss set and legendaries), [page 10](10-BESTIARY.md) (monster
families, monster rarities and greater rarities), [page 11](11-BOSS-MECHANICS.md) (the telegraph vocabulary and
its §22.4 world-boss budget), [page 14](14-QUESTS-EVENTS.md) (`ev_world_boss_call`, the seasonal calendar,
`q_sky_1`), [page 15](15-SOCIAL-ONLINE.md) (the arena layer, open groups), [page 03](03-UI-SCREENS.md) /
[page 04](04-SETTINGS.md) (the tracker screen and the two settings in §11).

**Where the numbers come from.** Page 05 owns the real damage and health maths. Every damage number here is
written against a **reference non-tank at the boss's level** (its health is in each table header, e.g.
"vs ≈900"). The fights are designed in *proportions* (a Danger zone hit ≈ 75% of a non-tank's health); if page 05
changes the reference, scale every number on this page by the same ratio and keep the proportion.

---

## Contents

1. [What a world boss is](#1-what-a-world-boss-is)
2. [Spawn rules and timers](#2-spawn-rules-and-timers)
3. [Open tagging, levels and scaling](#3-open-tagging-levels-and-scaling)
4. [The Ascendant rotation](#4-the-ascendant-rotation)
5. [World boss loot](#5-world-boss-loot)
6. [The eight regional world bosses](#6-the-eight-regional-world-bosses)
7. [Seasonal and event world bosses](#7-seasonal-and-event-world-bosses)
8. [Feats and quest links](#8-feats-and-quest-links)
9. [Loot index](#9-loot-index)
10. [Id index](#10-id-index)
11. [Screens and settings](#11-screens-and-settings)
12. [Reuse map](#12-reuse-map)
13. [Notes for other pages](#13-notes-for-other-pages)
14. [Round 2 changes on this page](#14-round-2-changes-on-this-page)

---

## 1. What a world boss is

Farhold's `data/worldbosses.json` defines a world boss as three things at once, and Wildmarch keeps all three
(reuse: `prototypes/farhold/data/worldbosses.json` `_doc`): it is **over-levelled** for the ground it stands on,
it is **two to three times the size** of anything else there (`scale` 1.9–3.0 on top of the body size), and it
**keeps calling minions** for as long as it lives (`minions: { first, add, every, max, radius, weaken }`). Farhold
also gives each a tier (1–4), a map pin, a chest and phases in the `{ at, modifier, say }` shape
(reuse: `js/actors.js` `applyModifier`, the modifier names in `data/enemies.json` `modifiers`).

**What changes in Wildmarch** (new):

| | Farhold | Wildmarch |
|---|---|---|
| Where | rolled onto map slots per seed (landmark, pass, dungeon, crossing) | **one fixed site per region** from region 3 up (hand-placed; page 01 names the site and landmark), plus seasonal ones |
| When | always standing | on a **timer** (§2), announced 15 minutes ahead |
| Who | the one player | **open tagging** for any number of players, no party needed (§3) |
| Size of fight | scaled to one level | **scaled to the number of players** in the arena (§3) |
| Mechanics | stat modifiers per phase, minion waves | minion waves **plus** page 11 telegraphs (4–6 abilities each, page 11 §22.4 budget), phases, one spoken line per phase |
| Loot | a chest in the arena, one kill | a **personal** chest **once per boss per week** (Monday 06:00 reset), tradeable (§5) |
| Level-60 reason to go back | — | two bosses a week are **Ascendant**: raised to level 60 with one extra mechanic and better rewards (§4) |

Farhold's tier-1 world bosses (Bramblecoat, the Reedmother, Gravel-Tusk) are too small for this page; page 01
already uses them as **rare elites** in Hearthvale, Mossfen and Greyridge.

**Mechanic budget** (page 11 §22.4 owns it; repeated here so the tables below can be checked against it):
4–6 abilities per boss, **no ability that kills outright**, no forced tank swap (stacking debuffs decay by
themselves), no dialog opportunity (bosses speak lines but offer no replies), and cover is always optional
damage reduction — never the only way to live. Soaks, Targeted circles and minion waves grow with the crowd
(§3.3).

## 2. Spawn rules and timers

- **Schedule:** each regional world boss spawns **every 2 hours** of real time, the eight staggered by 15 minutes:
  Greyridge at :00 of even hours, Sunscar :15, Whisperwood :30, Cinder Steppe :45, Frostmantle :00 of odd hours,
  Drowned Coast :15, Riftmarch :30, Kingsfire :45. Somewhere on the continent a world boss is always 15 minutes or
  less away. The clock is the server's; the tracker shows it on your local clock.
- **Announcement:** 15 minutes before a spawn, a pin with a countdown appears on that region's map and on the
  continent map; a line goes to the region's chat channel (*"The ground at the Ironfield is shaking. (15:00)"*)
  and — per the *World boss warnings* setting (§11) — a toast to everyone in the region, or everywhere. Page 14's
  `ev_world_boss_call` adds a continent-wide banner 5 minutes before. At 1 minute: a horn sound for everyone within
  400 m.
- **Window:** it stays **30 minutes**. If it is not killed in that time it leaves (*"…and goes back into the
  mountain."*) and the next spawn is on schedule.
- **Leash and reset** (page 11 §22.4): no arena lock; the boss is leashed **120 m** from its spawn point. If **no
  player** is within **80 m** for **30 s**, it heals to full, its minions despawn and its phases reset.
- **Arena layer:** while a boss is up, its arena is its own server layer with room for up to 60 fighters and 160
  total (page 15 owns the numbers and the move between layers).
- **Tracker:** `scr_world_boss_tracker` (a Journal tab, page 03): every world boss, its region, its next spawn
  time on your local clock, whether it is **Ascendant** this week, whether you have **looted it this week**, and a
  *Guide me* button that sets a map marker.
- **Seasonal bosses** (§7) follow their event's calendar instead (page 14).

## 3. Open tagging, levels and scaling

### 3.1 Tagging and credit

- **Open tagging:** no party is needed. Any player who, inside the arena, deals, heals or absorbs **at least 1%
  of the boss's health in total**, or spends **60 s** in combat inside the arena (page 11 §22.4), is **credited**:
  they get the kill, the weekly chest (§5), kill XP (page 07) and any quest credit. Party members are credited
  one by one the same way; nobody is carried by a party.
- Followers (hired NPCs) help but are never credited and never count toward N. Class companions (tamed beasts,
  bound demons) follow the pet rules in canon §10 (they never count toward soaks).

### 3.2 The open group

Entering the arena offers *Join the open group for {boss}*. The open group is a temporary public group of up to
**60**, split automatically into **parties of 5** (your own party stays together). What it gives:

| You get | You do not get |
|---|---|
| your own party's 5 frames, as always | frames for the other 55 (raid frames are parked — [WISHLIST.md](WISHLIST.md)) |
| the group's shared world markers (Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye — canon W23) | a leader who can kick or loot |
| a boss chat channel and the credited count ("41 fighting") | any change to your loot (loot is personal) |

The first three players to join get marker rights. The *Join open groups* setting (§11) answers Ask / Always /
Never. Solo players are credited whether or not they join.

### 3.3 Levels and scaling

- **Level:** a regional world boss is **its region's top level + 3** (Kingsfire's is level 60 with +20% health and
  damage, an "elite 60"). A player **above** the boss's level is **synced down** to boss level while inside the
  arena (stats only — spells, talents and perks stay). A player **below** it fights at their own level (it is hard,
  which is the point). Ascendant bosses are level 60 (§4).
- **Health:** `health = base × (0.6 + 0.08 × N)` where **N = credited players in the arena**, recomputed every
  10 s. It can rise at any time but **falls at most 10% per 10 s** (so leaving to make it weaker does not work).
  N is capped at 60 (×5.4 base). Base health is the number for N = 5.
- **Mechanics** (page 11 §22.4 clamps): Soak pips = `clamp(ceil(N / 5), 1, 8)`; Targeted players per cast =
  `clamp(ceil(N / 8), 1, 10)`, never two on one player; void zones on the field at once ≤ 12; minion `max` ×
  (1 + N / 10), capped at 40.
- **Greater-rarity minions** (page 10 owns the rarity list): once **N ≥ 10**, every third minion wave includes
  **one** greater-rarity minion — *Giant* plus the boss's own element where it has one (the Slagborn's minion is a
  *Giant Flaming* cinder elemental; the Carrion Crown's is an *Electrified* vulture). Ascendant bosses put one in
  **every** wave. Killing one follows page 10's rule: a greater-rarity monster drops its matching special rarity
  more often (an Electrified minion → Electrified items).
- **Warnings:** world bosses use **2.0 s** on everything and **3.0 s** on the biggest hit in the fight (crowds are
  messy), above page 11's 1.5 s floor.
- **Deaths:** anyone may revive a fallen player, in or out of combat, **with no limit** (canon W21). Or release to
  the nearest graveyard (page 05) and run back; the arena has a waystone within 150 m.

## 4. The Ascendant rotation

Every **Monday 06:00** (the weekly reset, canon §4), **two of the eight regional world bosses** become
**Ascendant** for the week. The tracker marks them; the region's hub puts up a notice (*"The Glass Wyrm has
grown. Level 60 only."*). The rotation is a fixed shuffled cycle so every boss is Ascendant once every four weeks,
and never two weeks in a row.

This is the level-60 reason to go back to a region you out-levelled — the same idea as a dungeon's **Depth**
(page 12), in a lighter form, without a dial.

| | Normal week | Ascendant week |
|---|---|---|
| Level | region top + 3 | **60** (Kingsfire's Slagborn: 60 with +45% health and damage instead of +20%) |
| Health | its base | Slagborn's base, **2,000,000**, before the N formula |
| Damage | against its level | the same **share of health** against a level-60 reference non-tank (≈3,600) |
| Mechanics | its table | its table **plus its Ascendant row** (§6, one per boss) |
| Greater-rarity minions | every third wave once N ≥ 10 | **every** wave |
| Who is credited | anyone | anyone, but players below 55 are warned at the arena edge |
| Loot | §5, at `min(your level, boss level)` | §5, at `min(your level, 60)`, plus the Ascendant rows |

Ascendant is not a separate lockout: **one chest per boss per week** either way. If the boss you already looted
this week turns Ascendant, you wait for next week.

## 5. World boss loot

**Personal loot only; nothing is bound** (canon W18): every item from a world boss can be traded, mailed and sold.
Quest items (the storm feather, §8) are the only exception. **No currencies** (canon W19/W26): world bosses pay
**items, gold and reputation** only. Page 08 owns every amount; the numbers below are this page's proposal and
must match page 08's world-boss table.

| Reward | Once per | What (proposal — page 08 owns) |
|---|---|---|
| **Personal chest** | **week per boss per character** (Monday 06:00 reset) | **1 item** guaranteed from the boss's table, **Epic floor**; **5%** the boss's own unique (§6); **3%** a legendary from page 09's world pool; gold (page 08); region faction reputation +150 (the faction that holds the region, canon §7) |
| **Ascendant extras** | the same weekly chest, on an Ascendant boss | **+1 item** (Epic floor); **30%** a piece of `set_trophies_of_the_wild_hunt` (page 09); legendary chance 5% |
| **Special rarity boost** | every chest item | the boss's **favoured special rarity** (table below) rolls at **×3** page 08's normal chance on that item; the other four at ×1.5. Page 08 owns the base chance |
| **Mount** | per chest | the boss's own mount at **1%** |
| **Repeat kills** | after your chest this week | kill XP (page 07), gold and reputation only — no item |
| **Storm feather** | per credited kill, while on `q_sky_1` | a quest item for the flying chain (§8) |

- **Item level** is the level needed to wear it (canon §4: 1–60, nothing above 60): `min(your level, boss level)`
  on a normal week, `min(your level, 60)` on an Ascendant week. A player synced down still gets items for their
  **real** level up to that cap.
- **Magic find** (page 08): item quantity and rarity apply to the chest item's rarity roll only (never to the
  guaranteed count); gold find and reputation gain apply as normal.
- The chest is **Farhold's `warded` chest kind** (reuse: `data/balance.json` `chests.kinds`), opened by each
  credited player at the boss's body; it shows only what is yours.

**Favoured special rarities** (canon §12.3; page 08 owns what each does, page 17 the card art):

| Boss | Favoured | Why |
|---|---|---|
| Grief-in-Iron | **Ancient** | a war-engine older than the Deepforge |
| The Glass Wyrm | **Starwoven** | glass plates that throw back the sky |
| The Hungering Brood | **Living** | it never stops breeding |
| The Carrion Crown | **Electrified** | a storm bird; its dive leaves lightning |
| The Standing Ruin | **Ancient** | a colossus built of a fallen giant hold |
| The Sallow King | **Twinned** | a king and his reflection in the tide |
| The Unmoored | **Starwoven** | stones that orbit it like small moons |
| Slagborn | **Living** | lava that eats and grows |
| Seasonal (§7) | each names its own | — |

## 6. The eight regional world bosses

Numbers: **base health** is for N = 5; multiply by `0.6 + 0.08 × N`. Damage is against a reference non-tank **at
the boss's level** (its health is in the table header). Sites are page 01's (`wb_site_*`).

### 6.1 Grief-in-Iron — Greyridge Highlands

| Field | Value |
|---|---|
| id | `b_grief_in_iron` (reuse: Farhold `grief_in_iron`, tier 2) |
| Site | `wb_site_ironfield` — the Ironfield on the Bellows Heights, above Anvilgate · level **21** · Farhold `over` +3, `scale` 2.4 |
| Body | `creature:golem ×2.9` at scale 2.4 (≈7 m), body `#5e5a54`, belly `#7e7a72`, accent `#2e2b28`, eyes `#ff8a20`; `barrier` and `sunder` auras (reuse) |
| Base health | **180,000** · leaves after 30 min |
| Phases | 60% *Ironclad* ("Grief-in-Iron shuts its plates and stops caring what you are holding.") — takes 30% less damage from the front; 30% *Vicious* — +25% attack speed (reuse: Farhold `phases`) |
| Minions | construct and mine families: first 5–7, +2–3 every 18 s, max 10, weaken 0.8 — `m_construct_mine_sentry` (golem ×1.4) and `m_folk_deepforge_deserter` (`chibi2:dwarf/fighter`) |

| Ability | Kind | Shape / colour | Warning | Damage (vs level-21 non-tank ≈ 900 health) | Counterplay |
|---|---|---|---|---|---|
| **Ironcross** `b_grief_in_iron_cross` | Danger zone | cross, 2 lines 50 m × 5 m, RED | 2.0 s | 700 | stand on the diagonals |
| **Plate Shed** `b_grief_in_iron_plates` | Void zone | 4 iron plates fall (circles 4 m, PURPLE-black, 45 s) | 2.0 s | 60 / tick | step out; the plates become cover |
| **Grinding Grip** `b_grief_in_iron_grip` | Tank | melee, stacking Sunder (−5% armour per stack, decays 1 stack / 6 s) | — | 400 + Sunder | a second tank may take over; not required |
| **Pass Holder** `b_grief_in_iron_hold` | Soak | ORANGE 6 m, `ceil(N/5)` pips | 3.0 s | 2,000 × N/5, split between soakers | enough people stand in it |
| *Ascendant:* **Second Cross** `b_grief_in_iron_second_cross` | Danger zone | Ironcross fires twice: the cross, then an X rotated 45°, 1.5 s apart | 2.0 s each | 70% of health each | move from the diagonal to the old cross lines |

Loot: `uq_griefplate_gauntlets` (heavy hands: blocking gives a 5% armour stack, max 5), `it_mount_mine_crawler`
(`creature:beetle ×1.6`, iron plates), Deepforge Clans reputation.

### 6.2 The Glass Wyrm — Sunscar Barrens

| Field | Value |
|---|---|
| id | `b_glass_wyrm` (new) |
| Site | `wb_site_shattered_pan` — the Shattered Pan (`lm_shattered_pan`), a salt flat south of the Glass Tombs · level **27** · scale 2.6 |
| Body | `creature:worm ×3.4` at scale 2.6 (≈9 m long out of the ground), body `#d8b070` sand with **glass plates** `#c8f0ff` (`plates` on), eyes `#ffe060` |
| Base health | **300,000** |
| Phases | 60% *Scorched* (sand turns to glass under it: the ground it crosses becomes a slippery surface, +30% slide on dodge); 25% *Frenzied* |
| Minions | `m_sand_skitter` (`creature:beetle ×1.4`), `m_sand_glass_grub` (`creature:worm ×1.4`), first 6, +3 / 16 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,100) | Counterplay |
|---|---|---|---|---|---|
| **Glass Storm** `b_glass_wyrm_storm` | Void zone | 6 circles 5 m of glass shards, 40 s | 2.0 s | 80 / tick | leave |
| **Burrow Line** `b_glass_wyrm_burrow` | Danger zone | it dives; a line 40 m × 6 m RED marks where it will breach | 2.5 s | 900 + knock-up | step out |
| **Sun-Glare** `b_glass_wyrm_glare` | Line of sight | Room-wide flash off its glass plates | 3.0 s | 700 + Blind 4 s (facing it); 150 facing away or behind a mesa rock | turn your back, or stand behind a rock |
| **Tail Sweep** `b_glass_wyrm_tail` | Danger zone | cone 120° 14 m behind the head | 2.0 s | 800 | do not stand behind it |
| *Ascendant:* **Twin Burrow** `b_glass_wyrm_twin_burrow` | Danger zone | two Burrow Lines at once, crossing at a random angle | 2.5 s | 80% + knock-up | step out of both; the crossing point is the worst place |

Loot: `uq_glasswyrm_scale_ring` (ring: 5% of damage taken is thrown back as glass shards), `it_mount_sand_strider`
(`creature:elk`, desert colours), Quiet Wake reputation (the Sandsworn).

### 6.3 The Hungering Brood — Whisperwood

| Field | Value |
|---|---|
| id | `b_hungering_brood` (reuse: Farhold `the_hungering_brood`, tier 2) |
| Site | `wb_site_brood_hollow` — Brood Hollow in the Fey Crossing, a hollow of dead moonwell trees · level **33** · scale 2.2 |
| Body | `creature:spider ×3.0` at scale 2.2, body `#2a2a30`, accent `#8a2020`, eyes `#e02020`; `poison` and `root` auras (reuse) |
| Base health | **450,000** |
| Phases | 45% *Venomous* (reuse) — every bite poisons |
| Minions | `m_beast_brood_spiderling` (`creature:spider ×1.4`), first 8, +4 / 12 s, max 16 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,400) | Counterplay |
|---|---|---|---|---|---|
| **Brood Web** `b_hungering_brood_web` | Tether | WHITE web strands between `ceil(N/8)` pairs of players; rooted while linked | 2.0 s | 100 / s | a third player cuts the strand (it has 3% of a player's health) |
| **Egg Sacs** `b_hungering_brood_eggs` | Adds | 4 sacs hatch in 15 s | 15 s | spiderlings | break them first |
| **Venom Spray** `b_hungering_brood_spray` | Danger zone | cone 60° 16 m | 2.0 s | 900 + poison | go to its sides |
| **Drop from the Canopy** `b_hungering_brood_drop` | Targeted | circle 6 m YELLOW | 2.0 s | 800 | spread |
| *Ascendant:* **Mother's Call** `b_hungering_brood_call` | Adds | an Egg Sac left unbroken hatches a **Giant** spiderling (greater rarity, page 10) instead of four small ones | 15 s | — | break every sac; if one hatches, the tanks pick it up |

Loot: `uq_brood_silk_wraps` (light hands: your roots last 1 s longer), `it_mount_silkfall_spider` (a white
`creature:spider` mount), Greenhand reputation (the Moonwell Circle).

### 6.4 The Carrion Crown — Cinder Steppe

| Field | Value |
|---|---|
| id | `b_carrion_crown` (reuse: Farhold `the_carrion_crown`, tier 4) |
| Site | `wb_site_carrion_mound` — the Carrion Mound in the Charred Barrows, above an old Ashtusk battlefield · level **39** · scale 3.0 |
| Body | `creature:griffin ×3.0` at scale 3.0, carrion colours `#4a3a2a` / `#8a7a5a`, eyes `#ff4020`; `bleed`, `haste`, `marked` auras (reuse) |
| Base health | **650,000** |
| Phases | 60% *Fleet*; 30% *Frenzied* (reuse) |
| Minions | `m_beast_carrion_vulture` (`creature:owl ×1.4`, bald, grey) and Ashtusk Warhost Cutthroats (`m_orc_ashtusk_cutthroat`, page 10 §9.5), first 6, +3 / 15 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈1,800) | Counterplay |
|---|---|---|---|---|---|
| **Carrion Circles** `b_carrion_crown_circles` | Void zone (moving) | 3 shadows, 6 m circles on the ground (it circles overhead), PURPLE-black, moving 4 m/s | 2.0 s | 150 / tick | stay out of the shadows |
| **Dive** `b_carrion_crown_dive` | Danger zone | line 50 m × 6 m | 2.0 s | 1,300 + bleed | sidestep |
| **Pick the Weak** `b_carrion_crown_pick` | Targeted | circle 5 m YELLOW on the **lowest-health** players | 2.0 s | 1,000 | heal them up; spread |
| **Crown of Bones** `b_carrion_crown_crown` | Soak | ORANGE 8 m, `ceil(N/5)` pips | 3.0 s | 3,500 × N/5, split | soak |
| *Ascendant:* **Storm Dive** `b_carrion_crown_storm_dive` | Void zone | every Dive leaves its line crackling (6 m wide, 20 s), Electrified | 2.0 s | 200 / tick | do not cross the old dive lines |

Loot: `uq_carrion_crown_talons` (medium hands: +10% damage to enemies below 30% health),
`it_mount_carrion_griffin` (`creature:griffin`, ragged; a winged mount: runs and glides until the flying chain
at 60, page 07), Crown Assembly reputation (Fort Ashfall).

### 6.5 The Standing Ruin — Frostmantle

| Field | Value |
|---|---|
| id | `b_standing_ruin` (reuse: Farhold `the_standing_ruin`, tier 4) |
| Site | `wb_site_ruin_field` — a ring of fallen standing stones in the Stonehide Peaks below Rimehold · level **45** · scale 3.0 |
| Body | `creature:titan ×3.0` at scale 3.0 (≈11 m), frost-rimed stone `#6a7078`, eyes `#9ad8ff`; `barrier`, `sunder`, `rally` (reuse) |
| Base health | **900,000** |
| Phases | reuse Farhold: *Ironclad*, *Unyielding*, *Vicious* at 70 / 40 / 20% |
| Minions | Stonehide warband (reuse: `stonehide_smasher`, `stonehide_hurler`, page 10), first 5, +2 / 20 s, max 10 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈2,000) | Counterplay |
|---|---|---|---|---|---|
| **Standing Stones** `b_standing_ruin_stones` | Danger zone → blocker | 5 circles 5 m RED; a stone stands there 60 s | 2.0 s | 1,500 | step out; the stones are cover |
| **Ruinous Roar** `b_standing_ruin_roar` | Line of sight | Room-wide | 3.0 s | 1,500 + knockback in the open; 300 behind a standing stone | behind a stone (optional, page 11 §22.4) |
| **Frost Stomp** `b_standing_ruin_stomp` | Danger zone | circle 14 m around it | 2.0 s | 1,200 + slow | out |
| **Hold the Circle** `b_standing_ruin_hold` | Soak | 2 × ORANGE 6 m, `ceil(N/10)` pips each | 3.0 s | split | soak |
| *Ascendant:* **Avalanche** `b_standing_ruin_avalanche` | Moving wave | every 60 s a wall of snow crosses the field from the north at 6 m/s; standing stones split it | 3.0 s | 75% + knockdown 2 s | stand behind a stone |

Loot: `uq_ruinstone_helm` (heavy head: standing still 2 s gives 15% damage reduction until you move),
`it_mount_frost_ram` (`creature:deer`, curled horns, white), Wardens reputation (the Rime watch).

### 6.6 The Sallow King — The Drowned Coast

| Field | Value |
|---|---|
| id | `b_sallow_king` (reuse: Farhold `the_sallow_king`, tier 3) |
| Site | `wb_site_brine_pool` — a tidal causeway on the Brinehollow Flats north of Saltmarch · level **51** · scale 2.6. Page 14 hands every third low tide's rising to `ev_world_boss_call` |
| Body | `creature:wraith ×3.2` at scale 2.6, `#6a7a6a`, eyes `#c8ff80`; `curse` and `marked` auras (reuse) |
| Base health | **1,200,000** |
| Phases | reuse: *Graveborn* 60%, *Leeching* 30% |
| Minions | `m_drowned_tide_thrall` and `m_drowned_choir_wailer` (page 10's Drowned Coast dead; they replace the round-1 sailor and chorister ids), first 6, +3 / 16 s, max 12 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈2,600) | Counterplay |
|---|---|---|---|---|---|
| **Sallow Tide** `b_sallow_king_tide` | Void zone (rising) | the causeway floods from the edges every 60 s; the water ticks and slows | 6 s | 150 / tick | keep to the causeway's crown |
| **Sallow Curse** `b_sallow_king_curse` | Dispel | a curse on `ceil(N/8)` players, 200 / s; spreads to anyone within 4 m when removed | — | 200 / s | move apart, then remove the curse |
| **Grasping Dead** `b_sallow_king_grasp` | Tether | WHITE hands grab players' feet, rooting 4 s | 1.5 s → **2.0 s** (world-boss floor) | — | break with a movement ability |
| **King's Lament** `b_sallow_king_lament` | Room-wide | every 45 s | 2.0 s | 1,400 | healers heal |
| *Ascendant:* **High Tide** `b_sallow_king_high_tide` | Safe zone | the tide covers the whole causeway for 8 s except 3 BLUE islands, 5 m each, that move 10 m after each tide | 3.0 s | 80% + slow outside an island | reach an island; share them |

Loot: `uq_sallow_crown` (head: your curses last 20% longer and heal you for 1% of the damage they deal),
`it_mount_drowned_horse` (`creature:courser`, kelp and bones), Quiet Wake reputation.

### 6.7 The Unmoored — The Riftmarch

| Field | Value |
|---|---|
| id | `b_unmoored` (new) |
| Site | `wb_site_half_made_plain` — the Half-Made Plain in the Unwritten Fields, floating stones above a torn valley · level **57** · scale 2.8 |
| Body | `creature:horror ×3.4` at scale 2.8, body `#4a3f7a` with orbiting stones (a ring of `shard` bodies ×0.6 circling it), eyes `#e0c0ff`; `enchant` aura |
| Base health | **1,600,000** |
| Phases | 60% *Warded*; 30% *Wizened* (reuse modifier names) |
| Minions | `m_rift_rift_shard` (weaken 0.6) and `m_demon_rift_imp`, first 6, +3 / 14 s, max 14 (page 10 §6.14 owns both; the imp is tagged Demon, so a warlock may bind one) |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈3,200) | Counterplay |
|---|---|---|---|---|---|
| **Gravity Flip** `b_unmoored_flip` | Room-wide / Safe zone | gravity lets go: everyone floats 4 s except inside BLUE anchor circles (`3 × ceil(N/10)` of them, 4 m each) | 3.0 s | floating players take 1,800 on landing | be in an anchor circle |
| **Drifting Stones** `b_unmoored_stones` | Moving wave | 4 stones cross the field at 5 m/s along drawn lines | 2.0 s | 2,000 | dodge |
| **Rift Pull** `b_unmoored_pull` | Void zone (pulling) | circle 6 m that pulls everyone within 15 m | 2.0 s | 300 / tick | walk out against it |
| **Split** `b_unmoored_split` | Adds | at 50%: two copies (15% health each) that must both die within 15 s of each other | 3 s | — | split damage |
| *Ascendant:* **Double Flip** `b_unmoored_double_flip` | Room-wide / Safe zone | Gravity Flip twice, 6 s apart; the anchor circles move 12 m between them | 3.0 s each | 1,800 per landing | run to the new anchors |

Loot: `uq_unmoored_anchor` (off hand: immune to knockback and pull effects for 3 s after taking one, 20 s
cooldown), `it_mount_floating_stone` (a floating slab you ride — a hover mount), Lantern House reputation (the
Riftwatch).

### 6.8 Slagborn — Kingsfire

| Field | Value |
|---|---|
| id | `b_slagborn` (reuse: Farhold `slagborn`, tier 3 → raised to the top tier here) |
| Site | `wb_site_slagpit` — the Slagpit in the Obsidian Fields, a cooling lava plain under the Fire King's palace · level **60 elite** · scale 3.0 |
| Body | `creature:elemental ×3.2` at scale 3.0, body `#ff6a20`, belly `#ffd070`, accent `#7a1a00`; `burn` and `enchant` (reuse) |
| Base health | **2,000,000** (+20% elite) |
| Phases | reuse: *Fiery* 60%, *Frenzied* 30% |
| Minions | Kingsfire Legion soldiers (the warband, page 10; weaken 0.6) and `m_kingsfire_cinder_elemental`, first 6, +3 / 15 s, max 14 |

| Ability | Kind | Shape / colour | Warning | Damage (vs ≈3,600) | Counterplay |
|---|---|---|---|---|---|
| **Slag Rain** `b_slagborn_rain` | Void zone | 8 circles 5 m of lava, 60 s | 2.0 s | 400 / tick | out |
| **Molten Share** `b_slagborn_share` | Soak | ORANGE 7 m, `ceil(N/5)` pips | 3.0 s | 5,000 × N/5, split | soak |
| **Crust Break** `b_slagborn_crust` | Danger zone | a 20 m circle of the plain cracks open | **3.0 s** | 3,200 (≈90%) + burn, never lethal on its own (page 11 §22.4) | out |
| **Molten Core** `b_slagborn_core` | Room-wide | every 40 s, +10% each time | 2.0 s | 1,800 | healers heal |
| *Ascendant:* **Crust Chain** `b_slagborn_crust_chain` | Danger zone | a second Crust Break 4 s after the first, centred where the most players stood when the first landed | 3.0 s | 90% + burn | do not all run to the same spot |

Loot: `uq_slagborn_core` (necklace: fire damage you take is 10% lower and 10% of it is added to your next Fire-tagged
hit), `it_mount_magma_salamander` (`creature:crocodile`, lava seams), Crown Assembly reputation (Last Light).

## 7. Seasonal and event world bosses

Seasonal bosses appear during their event (page 14 owns the calendar and festival names) at a fixed site, spawn
**every hour** of the event, and are **level-synced to the event**: every participant is scaled to the
**median level** of the credited players (up or down), so a level-8 and a level-60 fight it together and both get
loot at their real level. They follow §3's tagging and scaling and §5's rules, with **one chest per boss per
event** instead of per week. They are never Ascendant.

| id | Name | Event | Site | Body | Base health (at level-60 sync) | Favoured special rarity |
|---|---|---|---|---|---|---|
| `b_harvest_effigy` | The Harvest Effigy | the autumn harvest festival (2 weeks) | Brightwater's fields, Hearthvale | `creature:golem ×3.0` of straw and pumpkins: body `#c8a040`, belly `#e86a20`, accent `#5a3a1a`, eyes `#ffb020` (candle eyes) | 1,400,000 | Living |
| `b_midwinter_stag` | The Midwinter Stag | the midwinter festival (2 weeks) | the frozen lake at Rimehold, Frostmantle | `creature:elk ×3.4`, white, a lantern hung in each antler (`glow`), eyes `#9ad8ff` | 1,400,000 | Twinned |
| `b_bloomtyrant` | The Bloomtyrant | the spring festival (2 weeks) | the moonwell meadow, Whisperwood | `creature:mushroom ×4.0`, cap `#a64b62` with flowers, `slime` spores | 1,400,000 | Living |
| `b_sunwake_serpent` | The Sunwake Serpent | the summer festival (2 weeks) | the sandbar at Saltmarch, Drowned Coast | `creature:snake ×8.0`, gold and blue `#e8b830` / `#3a8ac0`, `haste` | 1,400,000 | Electrified |
| `b_tearstorm_herald` | The Tearstorm Herald | *Tearstorm* (a random 3-day event: a small Tear opens in a random region) | that region's centre | `creature:wraith ×4.0` of pale threads | 1,800,000 | Starwoven |

**The Harvest Effigy** — `b_harvest_effigy`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Harvest Ring** `b_harvest_effigy_ring` | Danger zone (donut) | RED from 6 m to 24 m; safe inside | 2.0 s | 50% of a non-tank's health | run in |
| **Scythe Sweep** `b_harvest_effigy_scythe` | Danger zone | cone 180° 14 m | 2.0 s | 40% | get behind it |
| **Scarecrows** `b_harvest_effigy_scarecrows` | Adds | `m_construct_scarecrow` (golem ×1.4, straw) × `ceil(N/5)` | 3 s | — | kill them; Fire-tagged hits do double damage to them |
| **Bring in the Sheaves** `b_harvest_effigy_sheaves` | Soak | ORANGE 6 m, `ceil(N/5)` pips | 3.0 s | split | soak — each soaker gets a pumpkin (a thrown item, 5% of the boss's health) |

Loot: `it_pumpkin_lantern` (a back-slot cosmetic for the wardrobe: a pumpkin lantern on a pole),
`it_harvest_scythe_skin` (a weapon look), `it_mount_haywain_pony` (`creature:pony` in harvest ribbons) 1%,
`uq_effigys_candle_eyes` (head: +5% damage with Fire-tagged skills).

**The Midwinter Stag** — `b_midwinter_stag`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Lantern Warmth** `b_midwinter_stag_lanterns` | Beneficial | 4 GREEN 6 m circles of lantern warmth drop from its antlers; outside them, **Deep Cold** takes 3% health / s | — | — | stay in the warmth |
| **Antler Charge** `b_midwinter_stag_charge` | Danger zone | line 40 m × 6 m | 2.0 s | 45% | sidestep |
| **Ice Cracks** `b_midwinter_stag_cracks` | Checkerboard | the frozen lake in a 6 m checkerboard, RED squares | 2.0 s | 50% + slow | the unmarked squares |
| **Snowfall Hush** `b_midwinter_stag_hush` | Interrupt (gold) | cast 4.0 s: puts out 2 lanterns | 4.0 s | — | interrupt |

Loot: `it_midwinter_lantern_antlers` (head cosmetic), `it_mount_midwinter_stag` (`creature:elk` with lanterns) 1%,
`uq_stags_lantern` (necklace: allies within 10 m of you take 5% less cold damage).

**The Bloomtyrant** — `b_bloomtyrant`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Spore Cloud** `b_bloomtyrant_spores` | Void zone | 8 circles 5 m of spores, 30 s; each becomes a `m_fen_sporeling` if nobody stands in it for 1 s | 2.0 s | 5% / tick | stand in one briefly to pop it, then leave |
| **Root Snare** `b_bloomtyrant_roots` | Tether | WHITE roots between the boss and `ceil(N/8)` players; they are pulled 2 m/s | 2.0 s | — | walk out |
| **Bloom** `b_bloomtyrant_bloom` | Room-wide | every 45 s | 2.0 s | 30% | healers heal |
| **Pollen Burst** `b_bloomtyrant_pollen` | Targeted | YELLOW 5 m | 2.0 s | 35% + Confused 2 s | spread |

Loot: `it_flower_crown_bloom` (head cosmetic), `it_mount_bloom_toad` (`creature:frog ×2.4`, mossy, flowers; an
aquatic hybrid — it swims, canon §12.3) 1%, `uq_tyrants_seed` (necklace: your heals leave a 3 m flower that heals
1% per second for 5 s).

**The Sunwake Serpent** — `b_sunwake_serpent`

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Sunwake** `b_sunwake_serpent_wake` | Moving wave | a wave rolls up the sandbar, one BLUE gap | 2.0 s | 45% + knockback | the gap |
| **Glare** `b_sunwake_serpent_glare` | Line of sight | Room-wide from its golden scales | 3.0 s | 40% + Blind in the open; 10% behind cover | behind the beach rocks or its own coils |
| **Coil Ring** `b_sunwake_serpent_coil` | Danger zone (donut) | RED outside 10 m | 2.0 s | 50% | get in close |
| **Tide Pools** `b_sunwake_serpent_pools` | Beneficial | 3 GREEN pools: +20% damage for 10 s | — | — | take turns |

Loot: `it_sunwake_parasol` (a held toy), `it_mount_sunwake_serpent` (a swimming serpent mount) 1%,
`uq_sunwake_scale` (ring: +8% movement speed; +20% in water).

**The Tearstorm Herald** — `b_tearstorm_herald`

A small Tear opens and the Herald steps out of it. Four rifts stand around the arena; stepping into one moves you to
**the torn side**, a shifted copy of the arena that only torn-side players see. The Herald is **invulnerable unless
at least `ceil(N/5)` players are on the torn side**. Torn-side players see telegraphs the others cannot, and call
them out. A player may stay on the torn side **60 s**, then is pushed back out with 20% of their health lost and
cannot re-enter for 30 s. (Page 12 may reuse the torn side in d16 *The Spire*.)

| Ability | Kind | Shape / colour | Warning | Damage | Counterplay |
|---|---|---|---|---|---|
| **Loose Threads** `b_tearstorm_herald_threads` | Tether | WHITE threads pull `ceil(N/8)` players toward it at 2 m/s | 2.0 s | — | walk out against it |
| **Unravel Line** `b_tearstorm_herald_unravel` | Danger zone | line 40 m × 6 m (seen only from the torn side on the normal side) | 2.0 s | 55% | torn-side players call it; step out |
| **Fray** `b_tearstorm_herald_fray` | Void zone | 5 circles 5 m, 30 s | 2.0 s | 4% / tick | leave |
| **Knot** `b_tearstorm_herald_knot` | Soak | ORANGE 6 m, `ceil(N/5)` pips, on the torn side | 3.0 s | split | soak it from the torn side |

Loot: `it_tearstorm_thread_cape` (back cosmetic), `uq_tearstorm_lens` (head: telegraphs that only the other side
can see show faintly for you), and the §5 chest.

## 8. Feats and quest links

- **No world-boss quests.** The round-1 weekly quests `q_world_boss_<region>` are removed (canon W20: no daily or
  weekly quests). The weekly chest is the reward.
- **The flying chain:** `q_sky_1` *The First Feather* (page 07 / page 14) asks for a storm feather from 3
  different world bosses. While you are on that step, every credited kill of a world boss you have not yet
  taken a feather from drops `it_storm_feather` (quest item) — whether or not you already opened its chest this
  week.
- **Page 14's `ev_world_boss_call`** is the gathering event wrapped around every spawn (banner, gathering, the
  fight is this page's).
- **Achievement:** defeating every regional world boss is page 07's `ach_world_bosses_all` (page 07 owns the
  title).
- **Feats** (`ft_wb_*`, new, account-wide): `ft_wb_<bossid>` per boss (eight), `ft_wb_ascendant_<bossid>` for an
  Ascendant kill (eight), `ft_wb_seasons` (all five seasonal and event bosses), `ft_wb_small_army` (be credited on
  a kill with fewer than 5 credited players), `ft_wb_big_army` (be in a kill with 60 credited).

---

## 9. Loot index

For [page 09](09-SETS-LEGENDARIES.md) to index and [page 08](08-ITEMS.md) to price. Every item here has a source on
this page (canon rule 4: no orphan loot). All are tradeable (canon W18) except `it_storm_feather`.

| Kind | Items |
|---|---|
| Uniques (regional) | `uq_griefplate_gauntlets`, `uq_glasswyrm_scale_ring`, `uq_brood_silk_wraps`, `uq_carrion_crown_talons`, `uq_ruinstone_helm`, `uq_sallow_crown`, `uq_unmoored_anchor`, `uq_slagborn_core` |
| Uniques (seasonal) | `uq_effigys_candle_eyes`, `uq_stags_lantern`, `uq_tyrants_seed`, `uq_sunwake_scale`, `uq_tearstorm_lens` |
| Set | `set_trophies_of_the_wild_hunt` (page 09) — Ascendant weeks only, 30% of chests |
| Legendaries | page 09's world pool, 3% (5% Ascendant); no world-boss-exclusive legendary is defined here — page 09 may add one per boss |
| Mounts (1% per chest) | `it_mount_mine_crawler`, `it_mount_sand_strider`, `it_mount_silkfall_spider`, `it_mount_carrion_griffin`, `it_mount_frost_ram`, `it_mount_drowned_horse`, `it_mount_floating_stone`, `it_mount_magma_salamander` · seasonal `it_mount_haywain_pony`, `it_mount_midwinter_stag`, `it_mount_bloom_toad`, `it_mount_sunwake_serpent` |
| Cosmetics | `it_pumpkin_lantern`, `it_harvest_scythe_skin`, `it_midwinter_lantern_antlers`, `it_flower_crown_bloom`, `it_sunwake_parasol`, `it_tearstorm_thread_cape` |
| Quest item | `it_storm_feather` (`q_sky_1`) |

## 10. Id index

### 10.1 Bosses

| Region # | id | Name | Level | Body |
|---|---|---|---|---|
| 3 | `b_grief_in_iron` | Grief-in-Iron (Greyridge) | 21 | creature golem |
| 4 | `b_glass_wyrm` | The Glass Wyrm (Sunscar) | 27 | creature worm |
| 5 | `b_hungering_brood` | The Hungering Brood (Whisperwood) | 33 | creature spider |
| 6 | `b_carrion_crown` | The Carrion Crown (Cinder Steppe) | 39 | creature griffin |
| 7 | `b_standing_ruin` | The Standing Ruin (Frostmantle) | 45 | creature titan |
| 8 | `b_sallow_king` | The Sallow King (Drowned Coast) | 51 | creature wraith |
| 9 | `b_unmoored` | The Unmoored (Riftmarch) | 57 | creature horror |
| 10 | `b_slagborn` | Slagborn (Kingsfire) | 60 elite | creature elemental |
| Seasonal | `b_harvest_effigy`, `b_midwinter_stag`, `b_bloomtyrant`, `b_sunwake_serpent`, `b_tearstorm_herald` | — | event sync | golem, elk, mushroom, snake, wraith |

Spire Isle (region 11) has no regional world boss; the Tearstorm Herald can open there.
Ability ids follow `<bossid>_<snake>` and are listed in each table. Boss lines follow `bl_<bossid>_<snake>`
(assigned by the builder in the same pattern).

### 10.2 Monsters (minions)

`m_construct_mine_sentry`, `m_folk_deepforge_deserter`, `m_sand_skitter`, `m_sand_glass_grub`,
`m_beast_brood_spiderling`, `m_beast_carrion_vulture`, `m_drowned_tide_thrall`, `m_drowned_choir_wailer`,
`m_rift_rift_shard`, `m_demon_rift_imp`, `m_kingsfire_cinder_elemental`, `m_construct_scarecrow`,
`m_fen_sporeling`; plus warband members by page 10's ids (`m_orc_ashtusk_cutthroat`, `m_giant_stonehide_smasher`,
`m_giant_stonehide_hurler`, the Kingsfire Legion's §9.7 ids). Page 10 lists the minions in its §6.14 and owns their families.

### 10.3 Everything else

- **Sites:** `wb_site_ironfield`, `wb_site_shattered_pan`, `wb_site_brood_hollow`, `wb_site_carrion_mound`,
  `wb_site_ruin_field`, `wb_site_brine_pool`, `wb_site_half_made_plain`, `wb_site_slagpit` (page 01).
- **Feats:** §8. **Screen:** `scr_world_boss_tracker`. **Event:** `ev_world_boss_call` (page 14).

## 11. Screens and settings

For pages 03 and 04 to list (both already carry them; names as they stand):

| Kind | id | What |
|---|---|---|
| Screen | `scr_world_boss_tracker` | world boss timers, map pins, Ascendant marks, "looted this week" (§2) |
| HUD | boss frame | the world boss's frame right of centre, with phase notches, cast bar and the credited count |
| Setting | *World boss warnings* (`world_boss_alerts`) | Region · All · Off (default Region): the 15-minute toast |
| Setting | *Join open groups* (`join_open_groups`) | Ask · Always · Never (default Ask): the open group of up to 60 (§3.2) |

## 12. Reuse map

| What | Reused from | How |
|---|---|---|
| World boss shape (tier, over-level, scale, minion waves, phases, chest, pin) | `prototypes/farhold/data/worldbosses.json` (reuse) | the schema carries over; `minions` and `phases` keep their fields; Wildmarch adds `schedule`, `site`, `abilities[]`, `scaling`, `ascendant` |
| Six world bosses by name and body | the same file: `grief_in_iron`, `the_hungering_brood`, `the_sallow_king`, `slagborn`, `the_standing_ruin`, `the_carrion_crown` (reuse) | ids become `b_<snake>`; tiers are replaced by region |
| Phase modifiers (`ironclad`, `vicious`, `frenzied`, `fleet`, `venomous`, `leeching`, `graveborn`, `warded`, `wizened`, `fiery`, `unyielding`…) | `prototypes/farhold/data/enemies.json` `modifiers`, applied by `js/actors.js` `applyModifier` (reuse) | world-boss phases |
| Warband minions and leaders | `prototypes/farhold/js/warbands.js` + `data/warbands.json` (reuse) | Ashtusk, Stonehide and Kingsfire Legion minion waves |
| Bodies | `avatar-3d/js/creature-types.js`, Chibi 2 races + `data/class-outfits.json` (reuse) | every body names one; creature `size` × Farhold world-boss `scale` |
| Effects | `avatar-3d/js/spellfx.js` `ELEMENTS`, `STATUS_FX`, `aoe`, `ring`, `beam`, `storm` (reuse) | every ability's look; telegraph decals are page 11's (new) |
| Boss voices and lines | `shared/voices.js` `voiceFor({ role, gender, seed })`, Lingo `boss_opener` / `boss_phase` pools, Emberveil `js/talk.js` `narrate` (reuse) | bosses that do not speak use the Narrator |
| Chests | `data/balance.json` `chests.kinds` `warded` (reuse) | the weekly personal chest |
| Weekly loot ledger | Farhold R27 M1 `sites.take` (reuse) | a chest is filed once per boss per character per week |
| **Not** reused | `prototypes/farhold/data/raids.json` | Farhold's **base-defence** waves, unrelated |

## 13. Notes for other pages

- **Pages 07, 08, 09 and 14** — resolved in the round-2 sweep: page 07 pays world-boss XP on the first kill
  of each boss each week; page 08 §16.5/§24.3 match §5 and list this page's mounts (`it_mount_tidewalker` moved
  to the Cutwater quartermaster); page 09's `set_trophies_of_the_wild_hunt` is level 60 and Ascendant-only;
  page 14 has no world-boss quests and uses the Midwinter Stag and the Tearstorm Herald.
- **Page 10:** the minion ids in §10.2 are adopted (page 10 §6.14); supply the greater-rarity minion per boss (§3.3).
- **Page 11 §22.4** now points to §3.3 for health (resolved in the round-2 sweep).
- **Page 03:** the tracker shows "looted this week" and "Ascendant", not "looted today".

## 14. Round 2 changes on this page

- **Raids moved out:** §1–§7 (reading guide, raid rules, r01–r05) and the raid rows of the loot index, id
  index, reuse map and notes moved **verbatim** to [WISHLIST.md](WISHLIST.md). The page is renamed from
  `13-RAIDS-WORLD-BOSSES.md`.
- **Loot:** once per **day** → once per **week** per boss (Monday 06:00); the weekly Oathstone bonus, the region
  currency and the Ember shrine row are gone; items are tradeable; special-rarity boost added.
- **New:** the **Ascendant rotation** (§4) with one Ascendant ability per boss; greater-rarity minions (§3.3);
  the open group no longer uses raid frames (§3.2); world-boss weekly quests removed (§8).
- **Budget:** matched page 11 §22.4 — Crust Break is no longer lethal, Grasping Dead's warning is 2.0 s, the
  Ruinous Roar and the glares only reduce damage behind cover.
- **Sites** now use page 01's `wb_site_*` ids and names (the Bellows Scar → the Ironfield, the Silkfall → Brood
  Hollow, the Bone Mesa → the Carrion Mound, the Broken Circle → the Ruin Field, the Drowned Barrow → the Brine
  Pool, the Anchorless Field → the Half-Made Plain, the Slag Sea → the Slagpit).

**Renames (old → new):**

| Old | New |
|---|---|
| Emberthrone (Slagborn's region) | **Kingsfire** |
| Ember Legion minions (`m_ember_*`) | **Kingsfire Legion** (page 10's ids) |
| Ember Soak `b_slagborn_soak` | **Molten Share** `b_slagborn_share` |
| The Veilstorm Herald `b_veilstorm_herald`, event *Veilstorm* | **The Tearstorm Herald** `b_tearstorm_herald`, event *Tearstorm* |
| `it_veilstorm_thread_cape`, `uq_veilstorm_lens` | `it_tearstorm_thread_cape`, `uq_tearstorm_lens` |
| The Longnight Stag `b_longnight_stag` (always daylight) | **The Midwinter Stag** `b_midwinter_stag` |
| `it_longnight_lantern_antlers`, `it_mount_longnight_stag` | `it_midwinter_lantern_antlers`, `it_mount_midwinter_stag` |
| Lantern Light / "Longnight" cold | **Lantern Warmth** / **Deep Cold** |
| `it_pumpkin_lantern` (light slot) | the same id, a back-slot cosmetic (the light slot is gone) |
| `uq_stags_lantern` (light slot) | the same id, a necklace |
| `uq_effigys_candle_eyes` "+5% damage in the dark" | "+5% damage with Fire-tagged skills" |
| world-boss minions `m_humanoid_deepforge_deserter`, `m_beast_sand_skitter`, `m_aberration_glass_grub`, `m_elemental_rift_shard`, `m_fiend_rift_imp`, `m_elemental_cinder_elemental`, `m_aberration_sporeling`, `m_undead_drowned_sailor`, `m_undead_drowned_chorister`; minion `ashtusk_raider` | `m_folk_deepforge_deserter`, `m_sand_skitter`, `m_sand_glass_grub`, `m_rift_rift_shard`, `m_demon_rift_imp`, `m_kingsfire_cinder_elemental`, `m_fen_sporeling`, `m_drowned_tide_thrall`, `m_drowned_choir_wailer`; `m_orc_ashtusk_cutthroat` (page 10's families, consistency sweep) |
