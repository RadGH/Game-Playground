# LANTERNFALL — page 09: campaign map and game modes

> How the campaign is laid out (six branching act maps of named nodes, each node 1–4 rooms), how rooms are built and seeded, what dying costs, new game plus, and the five side modes: Floodgate, The Long Descent, Daily Wick, Boss Rush and Trials — plus Guild mark unlocks and achievements.

## Contents

1. [Words used on this page](#1-words-used-on-this-page)
2. [Campaign structure](#2-campaign-structure)
3. [Node types and what a node contains](#3-node-types-and-what-a-node-contains)
4. [How rooms are built (templates, variation, seeds)](#4-how-rooms-are-built)
5. [How branching choices matter (route rewards, locked routes, backtracking)](#5-how-branching-choices-matter)
6. [The six act maps](#6-the-six-act-maps)
7. [Difficulty curve per act](#7-difficulty-curve-per-act)
8. [Death and continue](#8-death-and-continue)
9. [New game plus](#9-new-game-plus)
10. [Floodgate (`waves`)](#10-floodgate-waves)
11. [The Long Descent (`endless`)](#11-the-long-descent-endless)
12. [Daily Wick (`daily`)](#12-daily-wick-daily)
13. [Boss Rush (`bossrush`)](#13-boss-rush-bossrush)
14. [Trials (`trials`)](#14-trials-trials)
15. [Meta-progression: the Guild Hall and Guild marks](#15-meta-progression-the-guild-hall)
16. [Achievements](#16-achievements)
17. [Data files this page implies](#17-data-files-this-page-implies)
18. [Tests](#18-tests)
19. [Build order and cheaper fallbacks](#19-build-order-and-cheaper-fallbacks)
20. [Proposed canon changes](#20-proposed-canon-changes)

---

## 1. Words used on this page

| Word | Meaning |
|---|---|
| **Act map** | The branching graph of **nodes** for one act. Drawn on the full-screen map's Act tab (02-CONTROLS-UI.md §13.1). |
| **Node** | One stop on the act map: a named place of **1–4 rooms** with one type (fight, puzzle, shop…). |
| **Room** | One continuous play space, 1–4 screens (480 × 270 cells each) in size, with entrances and exits. Rooms are what the simulation loads and what the Ledger calls a "fight" (02 §17). |
| **Layer** | A column of the act map. Every edge goes from one layer to the next (or, for side nodes, out and back). |
| **Pinch** | A layer with one node that every route passes through (lessons that grant a canon mechanic, minibosses that drop keys, the boss). |
| **Edge** | A connection between two nodes. Normal, **hidden** (appears once found), **locked** (needs a mechanic or key) or **one-way**. |
| **Template** | A hand-made room layout in `data/rooms/*.json` with **sockets** (marked spots the seed fills in). |
| **Seed** | A number that picks the variations. Same seed → same rooms, every time. |
| **Area level** | The level enemies in a room are scaled to (05-BESTIARY-BOSSES.md §2.3). |
| **Depth** | One room of The Long Descent. (08 and 03 call it a "floor"; the two words mean the same thing.) |

---

## 2. Campaign structure

- **Six acts** in canon order (00-OVERVIEW §5). Acts 1–5 are descended: layer 1 is at the top of the district
  and the boss is at the bottom. **Act 6 is climbed**: layer 1 is on the Hollow floor (Understar) and the boss is
  above the rim, so its map is drawn bottom-to-top (02 §13.1).
- Each act map has **15–18 nodes** in **9–11 layers**, with **3–4 branching layers** that split into 2–3
  nodes and **rejoin** at pinches. A single route through an act visits **9–11 nodes** and **25–32 rooms**,
  which is 01-WORLD-STORY.md §9.0's length target (60–90 minutes the first time).
- **Moving on the map.** You walk it: a node's exits are real doors in its last room. Leaving through an exit
  shows a 1 s card with the next node's name and type, then loads its first room. There is no "click a node to
  go there" except fast travel from a lamp-post (02 §13.5).
- **Going back.** Any edge you have walked can be walked backwards (the exit door in the first room of a node
  leads back). This is how a player returns for a locked route once they have the mechanic (§5.3). Pinch
  nodes behind you stay open; boss nodes seal only while the fight runs.
- **Cross-act travel.** Relit acts are reachable through The Ferry (08 §16.8, from Act 2) or on foot up the
  lifts between hubs. The act map of any visited act can be viewed at any time.
- **Story beats** (01 §9) are pinned to nodes: every beat lives in a named location from 01 §3, and every
  such location is a node or a room inside a node below.

---

## 3. Node types and what a node contains

### 3.1 The types

| Type (id) | Map icon | Rooms | What is in it | Rewards | Per act (approx.) |
|---|---|---|---|---|---|
| `hub` | house | 2–4 | the act's safe town: shops, NPCs, a **lamp-post**; may hold **one** lesson room (a hub is the only type that mixes) | shops, quests, story | 1 |
| `fight` | crossed poles | 2–4 | 2–4 combat rooms, each 2–5 spawn groups (05 §7), plus pots/crates | pennies, drops, XP; a chest in the last room 40% | 3–4 |
| `elite` | skull | 1–2 | a **miniboss** arena (05 §18, one per act) or an elite gauntlet (3 elite groups, 05 §17) | the miniboss's key/relic (08 §12.2, §7.2); elite tier drop rolls | 1–2 |
| `puzzle` | cog | 2–3 | physics / lever / water / light puzzles from 07-TRAVERSAL-PUZZLES.md, at most 1 small fight room | a chest per solved puzzle room (tier "puzzle", 08 §14) | 2–3 |
| `lesson` | quill | 1–3 | a **Lesson room** per canon mechanic (00 §6): no enemies, teaches with a physical puzzle, then 0–2 practice rooms that use it with light enemies | the mechanic / strand | 1–3 |
| `shop` | coin | 1 | 1–3 shopkeepers not in the hub (a market, a mooring, a landing) | — | 0–2 |
| `lamppost` | lantern | 1 | a **lamp-post** room (§8.1): rest, save, heal, Wick braiding, fast travel; sometimes a camp NPC | — | 2–3 (plus the one in the hub) |
| `event` | `!` | 1–2 | a story or random encounter: an NPC in trouble, a choice, an escort, a strange shrine (01 quests; random events from `data/events.json`) | varies: a Kindling flag, a relic, a companion line | 1–3 |
| `treasure` | chest | 1–2 | a vault: traps and a locked strongroom; one guaranteed **rare+** chest | rare chest (08 §14.5), pennies | 1–2 |
| `secret` | `?` (hidden until found) | 1–2 | reached by a hidden or locked edge; holds Silent Bells, relic strands (03 §15.2: secrets hold only duplicates and relics), world relics | bells, relics, lore | 1–2 |
| `trial` | hourglass | 1 | a Trial door (§14). Entering it leaves the campaign rules until you exit | trial rewards | 0–1 |
| `flood` | waves | 2–4 | the act's **rising-water set piece** (verdict steal 8: one per act): the water climbs behind you through a chain of rooms. Act 6's is the **Falling Flood** | a fixed reward chest at the top/bottom; no death penalty for the first failure (it restarts the chain) | 1 |
| `boss` | crown | 1 (Act 6: 2 boss nodes around the flood chain) | the boss arena (05) and the relight cutscene room | Great Wick (08 §12.1), marks, boss relic | 1 |

`hub` and `flood` are additions to the brief's list; §20 records them.

### 3.2 What a room carries

Every room, whatever its node type, has in its template:

| Field | Meaning |
|---|---|
| `entrances` / `exits` | door rectangles on the room's edges (`side`, `offset`, `size`), each tagged with the node edge it serves |
| `lampPost` | optional, for `lamppost`/`hub` rooms |
| `spawnSockets` | where spawn groups may appear (05 §7.1 placement rules still apply) |
| `lootSockets` | pots, crates, chests; each with an allowed tier |
| `propSockets` | barrels, oil drums, ropes, planks, hanging lamps |
| `swapZones` | rectangles whose material may be swapped (wood ↔ brick ↔ wax ↔ ice…) within the act's material list |
| `optionalChunks` | 32 × 32 or 64 × 64 blocks with 2–3 alternatives each ("A: a ledge", "B: a gap with a rope", "C: a collapsed wall") |
| `water` | chamber list with the starting water level range (06/07 own chambers) |
| `light` | ambient override and fixed lights (lamps, bioluminescence) |
| `weather` | rain density multiplier, wind range |
| `lootSafe` | a marker where lost drops teleport (08 §2.3) |
| `tags` | `act1`, `vertical`, `flooded`, `dark`, `endless`, `trialOnly` … used by the Long Descent and events |

### 3.3 Room counts per act (along one route)

| Act | Nodes on a route | Rooms on a route (min–max, computed from §6) | Lesson rooms | Lamp-posts on every route |
|---|---|---|---|---|
| 1 | 11 | 26–29 | 5 (move/jump/pole, Wick builder, overcharge, wall-slide, plank kit) | 3 (hub, Drip Gallery, Chapel Antechamber) |
| 2 | 10 | 28–32 | 3 (grapple, levers/doors, charm slot) | 3 (hub, Gutter Cistern, Choir Loft) |
| 3 | 10 (9 via the drained shortcut) | 24–27 (20–23 drained: the shortcut saves 4–6 rooms, 01 A3.8) | 3 (swimming, sluices, Tide) | 3 (hub, Three-Lock House, Reservoir Steps; + Oarly's Landing on the aqueduct side) |
| 4 | 9 | 25–27 | 2 (oil/darkness, knots) | 3 (hub, Hanging Houses, Nave Steps) |
| 5 | 9–10 | 26–30 | 1 (gravity lanterns) + the Nine Valves set piece | 2 (hub, Cracked Bell) |
| 6 | 11 | 26–29 | 2 (overcharge mastery, wind) | 3 (hub, Last Wall, + band camps on every route) |

`tests/actgraph.test.js` (§18) recomputes this table from the act JSON and fails if a route drops below 25 rooms
(the drained Act 3 shortcut is the one allowed exception).

---|---|---|---|---|
| 1 | 11 | 26–29 | 5 (move/jump/pole, Wick builder, overcharge, wall-slide, plank kit) | 3 (hub, Drip Gallery, Chapel Antechamber) |
| 2 | 11 | 28–35 | 3 (grapple, levers/doors, charm slot) | 3 |
| 3 | 11 (9 via the drained shortcut) | 26–36 | 3 (swimming, sluices, Tide) | 3 |
| 4 | 10 | 27–34 | 2 (oil/darkness, knots) | 3 |
| 5 | 10 | 26–33 | 1 (gravity lanterns) + the Nine Valves set piece | 2 |
| 6 | 11 | 30–38 | 2 (overcharge mastery, wind) | 3 (+ band camps) |

---

## 4. How rooms are built

### 4.1 Hand-authored templates + seeded variation

Every room in the campaign is a **hand-made template** (drawn in the room editor, page 10) with **sockets**.
The seed decides what fills the sockets. That keeps the level design authored (a puzzle is solvable by
construction) while each save looks and plays a little differently.

**Variation operations, applied in this order** (each draws from the room's own random stream, §4.3):

| # | Operation | What it does | Limits |
|---|---|---|---|
| 1 | **Chunk pick** | for each `optionalChunks` entry, pick one alternative (weights in the template) | a chunk marked `required` for a puzzle solution is never swapped |
| 2 | **Material swap** | each `swapZone` rolls a material from the act's list (Act 1: wax, wood, slate, brick) | a zone marked `solutionMaterial` keeps its material (e.g. the wax wall Ember must melt) |
| 3 | **Water level** | each chamber's start level rolls inside its range | puzzle rooms: fixed |
| 4 | **Spawn fill** | each spawn socket rolls a group from the act's spawn table (05 §7.3) up to the room's `budget` (spawn points; fodder 1, standard 2, heavy 4) | budget by node type (§7.2); Act 1 rooms 1–6 never elite (05 §7.4) |
| 5 | **Loot fill** | each loot socket rolls pot/crate/chest per its allowed tier | chest count per room ≤ 2 |
| 6 | **Props** | barrels, oil drums, hanging lamps, laundry lines, per socket weights | oil drums never within 24 cells of a spawn socket in Act 1 |
| 7 | **Dressing** | decals: moss, drips, graffiti, rat nests, candle stubs, broken glass — purely visual | — |
| 8 | **Weather** | rain density × (0.8–1.2), wind in the district's range | — |

**Mirroring:** a template may be flagged `mirrorable`; the seed then mirrors it left/right 50% of the time
(exits swap sides and the node's door wiring follows).

### 4.2 Template pools (content budget)

Each node lists **template slots**, and each slot names a pool (`a1_fight_small`, `a2_puzzle_lever`…). The seed
picks one template per slot from its pool without repeats inside an act.

| Pool kind | Templates per act (target) | Minimum to ship (cheaper fallback) |
|---|---|---|
| fight (small 1-screen, large 2–4 screen) | 10 | 5 (mirroring doubles them) |
| elite / miniboss arena | 2 | 2 |
| puzzle | 8 (fixed to their named nodes) | 6 |
| lesson | as needed (fixed) | as needed |
| treasure vault | 3 | 2 |
| secret | as needed (fixed) | as needed |
| lamp-post / camp | 3 | 1 (+ dressing variation) |
| event | 4 | 2 |
| flood chain | 1 chain of 2–4 rooms (fixed) | 1 |
| boss arena | 1 | 1 |
| **Total per act** | **~35** | **~22** |

Named story rooms (01 §3's locations) are **fixed templates** — the seed still fills their spawn and loot
sockets but never swaps their chunks.

### 4.3 Seeds

```
runSeed   = the save's Room seed (02 §10.2), a 32-bit unsigned int
nodeSeed  = hash32(runSeed, actIndex, nodeIndex)             // nodeIndex = the node's number in §6
roomSeed  = hash32(nodeSeed, roomIndex)                       // roomIndex 0..3 inside the node
streams   = one mulberry32 per operation: rng(roomSeed ^ OP_SALT[op])   // so adding a prop never moves the spawns
```

- `hash32` is the shared `shared/ui.js` seeded helper (FNV-1a over the numbers' bytes, then a mix step).
- **Separate streams per operation** (salt table in `js/rooms/variation.js`): this is the Farhold density
  lesson — if every operation shared one random stream, adding one prop draw would move every spawn after it.
- Revisiting a room rebuilds it from the same seed: same layout. **Changes you made** (burned walls, placed
  planks, frozen falls, opened chests, set sluices) are stored as a per-room diff in the save (page 10) and
  laid over the rebuilt template.
- **Spawns on revisit** use `hash32(roomSeed, visitCount)` so a re-populated room is not an exact replay.
- Shops use their own seed rule (08 §16: `runSeed ^ hash(shopId) ^ restockCount`).

### 4.4 Room JSON (template) shape

```json
{
  "id": "a2_fight_large_03",
  "act": "act2",
  "size": { "w": 960, "h": 540 },
  "pool": "a2_fight_large",
  "mirrorable": true,
  "cells": "rle:...",                       // the authored cell grid, run-length encoded (page 10)
  "entrances": [ { "id": "in_a", "side": "left",  "offset": 380, "size": 24 } ],
  "exits":     [ { "id": "out_a", "side": "right", "offset": 120, "size": 24 },
                 { "id": "out_b", "side": "bottom", "offset": 700, "size": 32, "needs": "grapple" } ],
  "spawnSockets": [ { "x": 300, "y": 400, "w": 60, "h": 12, "kinds": ["walker","swarm"] } ],
  "lootSockets":  [ { "x": 820, "y": 96, "tiers": ["pot","chest"] } ],
  "propSockets":  [ { "x": 510, "y": 380, "kinds": ["oil_drum","crate"], "chance": 0.6 } ],
  "swapZones":    [ { "x": 400, "y": 200, "w": 64, "h": 48, "materials": ["wood","brick"] } ],
  "optionalChunks": [ { "x": 640, "y": 256, "size": 64, "options": ["ledge", "rope_gap", "collapsed"], "weights": [2,1,1] } ],
  "water":  [ { "chamber": "c1", "level": [0.2, 0.5] } ],
  "light":  { "ambient": 0.3, "fixed": [ { "x": 100, "y": 60, "color": "#e89a74", "radius": 60 } ] },
  "weather": { "rainMult": [0.8, 1.2], "wind": [0, 4] },
  "budget": 14,
  "lootSafe": { "x": 480, "y": 500 },
  "tags": ["act2", "sewer", "endless"]
}
```

---

## 5. How branching choices matter

### 5.1 Why choose one branch over another

Every branching layer offers routes that differ in **what you get**, not just in scenery. The map shows each
unvisited neighbouring node's **reward hint** icon (02 §13.1) before you commit.

| Route difference | How it shows | Example |
|---|---|---|
| **Reward kind** | the hint icon: strand, charm, pearls, relic chance, Silent Bell rumour, NPC, shortcut | Act 1 L7: the Roofs route passes Dobb (Chimneysweep lore, a companion line) and the Melting Stair chest; the Deep Stair route has the Gleam Shrine (Gleam strand for classes that lack it) |
| **Risk** | type: elite and flood nodes pay more and hurt more | Act 2 L8: the Crank Room miniboss (relic 60%) vs the Overflow flood run (fixed chest) |
| **Story** | event nodes carry 01's choices and Kindling flags | Act 3 L7: drain the Market Cistern (shortcut, closes the Drowned Market) or keep it (`pale_kept`) |
| **Shops** | a shop node on one branch only | Act 3 L4: the Drowned Market lies only on the cistern side |
| **Length** | node room counts on the tooltip | Act 3's drained shortcut saves 6 rooms |
| **Class fit** | a few nodes suit a class (rope-heavy for Chimneysweep, flooded for Sluicewarden/Drowned Knight) | the node's tooltip names the class ("Ropes everywhere") |

**Rule of fairness:** every canon mechanic and every strand that 03 §15.2 calls **guaranteed** sits in a
**pinch** node or a hub, so no branch choice can lock a player out of the core kit. Branches decide extras.

### 5.2 Reward hints (the map icons)

`strand` (a flame/shape/charm on this node), `charm` (a charm specifically), `pearls` (2+ pearls), `relic`
(relic chance), `bell` (a Silent Bell rumour — only once you have heard of the Silent Bells from 01),
`npc` (someone to meet), `shortcut`, `chest` (guaranteed rare chest), `shop`. A node hides its hint until an
adjacent node has been visited, and secrets never show one.

### 5.3 Locked routes and backtracking (metroidvania light)

Some edges need a mechanic from a **later** act. They are drawn hatched violet with the mechanic's icon
(02 §13.1), and the door in the room is visibly blocked in a way that hints at the answer (a hook ring too high,
a flooded grate, a frozen-looking waterfall, a gravity-bell socket). When you gain the mechanic, the Narrator
adds one line to the Journal: "The hook ring over the Crown Lamp's cage — you could reach it now."

| Act | Edge | Needs | Opens | Reward |
|---|---|---|---|---|
| 1 | `a1_n01` → `a1_n18` Beneath the Crown (room 2) | **grapple** (Act 2) | the cage under the Crown Lamp | `bell_silent_02` + world relic `relic_first_lamp` (08 §7.3) |
| 1 | Sweeps' Loft trial door (`a1_n11`) | **grapple** (Act 2) | Trial `trial_rope_gauntlet` | Chimneysweep unlock route (§14) |
| 2 | `a2_n09` → `a2_n17` The Sunken Weir | **sluice control / `key_sluice_wheel`** (Act 3) | a weir vault | rare chest + 3 pearls |
| 2 | Long Chain side ledge (inside `a2_n04`) | **gravity lantern** (Act 5) | an upside-down stall | relic strand `bounce_gutter` (03 §15.4) |
| 3 | Broken Arch upper fall (inside `a3_n08`) | **darkness / hood** (Act 4) — a moth-glow path only visible with the lantern out | a hidden ledge | `key_ferry_token` + codex page |
| 3 | `a3_n12` flooded basement | **Shade** flame (Act 4) — drains a light-eating seal | a vault | relic strand `siphon_lampless` |
| 4 | Hanging Houses roof (inside `a4_n09`) | **gravity lantern** (Act 5) | the chain-tops | `vane_journal_4` duplicate lore + rare chest |
| 1–5 | "dry" sealed doors in every act | **the Rain stopped** (end of campaign / epilogue) | a drained room per act | cosmetic lantern + lore (Ending D clue, 01 §11.6) |

Backtracking is **never required** for the campaign's end. It is required for: the Bellringer unlock (bell 2
needs the grapple on a revisit, 01 §4), `relic_first_lamp`, and 100% map completion.

### 5.4 Revisiting a node

| Room type | On revisit within the same act visit | After leaving the act and returning |
|---|---|---|
| Fight rooms cleared | stay clear | repopulate at **50%** of the budget; × 0.7 more if the act's Lamp is relit (01 §3) |
| Elite / miniboss | stay dead | stay dead (a miniboss can be re-fought only in Boss Rush) |
| Puzzles | stay solved (your diff is saved) | stay solved |
| Chests | stay open | stay open |
| Terrain you changed | kept (per-room diff) | kept, except water chambers you did not lock, which drift back to their rest level over 60 s |
| Lamp-posts | lit | lit |

---

## 6. The six act maps

**How to read the drawings.** Node numbers are the `nodeIndex` (`a1_n07` = Act 1 node 7). Letters: `H` hub,
`F` fight, `E` elite, `P` puzzle, `L` lesson, `S` shop, `R` lamp-post, `V` event, `T` treasure, `?` secret,
`X` trial, `W` flood, `B` boss. `✚` = the node contains a lamp-post room. Solid lines are normal edges, dotted
`┊` are hidden, `▒` marks a locked edge (with what it needs). **The edge list under each drawing is the
authoritative data**; the drawing is for humans.

### 6.1 Act 1 — Lanterncrown & the Wax Stair (`act1`), 18 nodes, descended

```
L1                              [01 H The Guild Hall ✚]──▒grapple▒──[18 ? Beneath the Crown]
                                          │                                  ▲ (room 2 needs grapple)
L2                              [02 L The First Step]                        │
                                          │                                  │
L3                              [03 L Candlemarket]                          │
                        ┌─────────────────┼─────────────────┐                │
L4          [04 F Chandlers' Lane] [05 V Pilgrim's Candle] [06 T Waxworks Cellar]
                        └─────────────────┼─────────────────┘                │
L5                              [07 L Gullet Chimney]                        │
                                          │                                  │
L6                              [08 L The Drip Gallery ✚]                    │
                              ┌───────────┴───────────┐                      │
L7                 [09 F The Slate Roofs]   [10 F The Deep Stair]            │
                   ┌──────────┼───────────┐  ┌────────┴────────┐             │
L8  [11 V Sweeps' Loft]  [14 W The Melting Stair]  [13 P The Gleam Shrine]   │
     (▒ trial door: grapple)  │                  │                           │
                   └──────────┼──────────────────┘                           │
L9                              [15 E The Dipping Hall]                      │
                                          │                                  │
L10                             [16 R Chapel Antechamber ✚] ┊┊┊┊ [17 ? The Vestry] ─┘
                                          │                         (key_vestry)
L11                             [12 B The Tallow Chapel]
```

**Edge list:** 01→02, 02→03, 03→04, 03→05, 03→06, 04→07, 05→07, 06→07, 07→08, 08→09, 08→10, 09→11,
09→14, 10→14, 10→13, 11→15, 14→15, 13→15, 15→16, 16→12, 16┊17 (hidden: breakable wax wall; the door needs
`key_vestry`), 17→18 (one-way up a vestry stair: arrives in room 1 of 18), 01▒18 (from the hub: needs grapple).

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a1_n01` | The Guild Hall | hub | 3 | `a1_guild_hall`, `a1_guild_archive`, `a1_crown_lamp` | Aldra, Pask, class choice in fiction (A1.1); Wick & Tallow, Crane's Pawn, Watch House (Floodgate after the boss), lamp-post | shops |
| 02 | `a1_n02` | The First Step | lesson | 2 | `a1_first_step` | Lesson: move, jump, pole (A1.2); room 2: 3 `wax_mite` practice | — |
| 03 | `a1_n03` | Candlemarket | lesson | 3 | `a1_candlemarket` | room 1 (act room **3**, canon): Wick builder lesson + 2nd wick slot + shape `arc`; room 2: Brother Seld gives **Rime** (A1.3); room 3 (act room **5**): overcharge lesson (03 §15.1) | Rime, arc |
| 04 | `a1_n04` | Chandlers' Lane | fight | 4 | `a1_stair` | 2–3 groups per room: wax mites, drip-lings, soot pigeons; first rain-slicked slate | pennies |
| 05 | `a1_n05` | The Pilgrim's Candle | event | 2 | `a1_stair` | a wax pilgrim stuck in a hardening pool: free her with Ember (tutorial for melting) → she gives a tonic and a Silent Bell rumour | tonic, rumour |
| 06 | `a1_n06` | Waxworks Cellar | treasure | 2 | `a1_stair` | dripping-wax traps, a strongroom opened by melting its wax seal | rare chest |
| 07 | `a1_n07` | Gullet Chimney | lesson | 2 | `a1_gull_chimney` | Pim Rooke stuck (A1.5); wall-slide lesson; `bell_silent_01` on a side ledge 220 cells up | `pim_met`, bell 1 |
| 08 | `a1_n08` | The Drip Gallery | lesson | 3 | `a1_drip_gallery` | plank-kit lesson (A1.6); **Spark** via the dead lamp-lift machine (03's "dead lamp-lift puzzle" is room 2 here); Hush found in wax; `bell_silent_03` behind a wax wall; lamp-post | Spark, plank kit, bell 3 |
| 09 | `a1_n09` | The Slate Roofs | fight | 4 | `a1_roofs` | rooftop running, gusts, soot pigeons, tallow hounds; A1.7 branch | pennies |
| 10 | `a1_n10` | The Deep Stair | fight | 4 | `a1_stair` | more wax, chandler husks, a lamp mimic | pennies |
| 11 | `a1_n11` | Sweeps' Loft | event | 2 | `a1_sweeps_loft` | Dobb Ashcroft; the Rope Gauntlet trial door (**locked: grapple**) | companion line, trial later |
| 12 | `a1_n12` | The Tallow Chapel | boss | 2 | `a1_tallow_chapel` | **Mother Tallow** (`boss_tallow`, A1.9); room 2: relight cutscene `cs_relight_crown` | `great_wick_act1`, 5 marks, pick 1 of `wave`/`lob`/`ring` |
| 13 | `a1_n13` | The Gleam Shrine | puzzle | 3 | `a1_stair` | a light-sensitive door opened by lighting 4 candles in order; **Gleam** for classes that lack it, else 2 pearls-worth of pennies | Gleam (A1.7) |
| 14 | `a1_n14` | The Melting Stair | flood | 3 | `a1_stair` | **Act 1 set piece**: molten wax rises behind you (it is warm wax, not water: 2 cells/s, hardens where it stops); gentle, 45 s chain | fixed chest |
| 15 | `a1_n15` | The Dipping Hall | elite | 2 | `a1_stair` | miniboss **The Wickwright** (`mb_wickwright`, 05 §18.1) | `key_chapel`, relic 60% |
| 16 | `a1_n16` | Chapel Antechamber | lamppost | 1 | `a1_chapel` | Seld's confession and the `asked_gentle` choice (A1.8); lamp-post; a wax wall with a hidden door (to 17) | — |
| 17 | `a1_n17` | The Vestry | secret | 1 | `a1_chapel` | `key_vestry` lies behind the wax wall in room 1 of 16 (melt it); the vestry: codex, rare chest, the stair up to 18 | chest, lore |
| 18 | `a1_n18` | Beneath the Crown | secret | 2 | `a1_crown_lamp` | room 1: the vestry stair's top; room 2 (**grapple**): the cage under the Crown Lamp — `bell_silent_02`, `relic_first_lamp` | bell 2, world relic |

Every route through Act 1 is 11 nodes and 26–29 rooms (§3.3).

### 6.2 Act 2 — The Gutterways (`act2`), 17 nodes, descended

```
L1                         [01 H The Dripmarket ✚]
                                     │
L2                         [02 L Hookwright's Forge]
                                     │
L3                         [03 L Pickering's Lockhouse]
                  ┌──────────────────┼───────────────────┐
L4     [04 F The Long Chain]  [05 F The Brickgut]  [06 V The Ratcatchers' Den]
          │                    │   ┊              ┌──────┘
L5     [07 T Gallows Awning] [08 ? Rat-Pipe Warren] [09 F Plague Wash]──▒sluice▒──[17 T The Sunken Weir]
          └────────────────────┼──────────────────┘
L6                         [10 P The Gutter Cistern ✚]
                                     │
L7                         [11 L The Charmwife's Niche]
                  ┌──────────────────┼──────────────────┐
L8     [12 E The Crank Room]  [13 W The Overflow]  [14 X The Singing Grate]
                  └──────────────────┼──────────────────┘ (14 is a side door: in and back to 11)
L9                         [15 P The Choir Loft ✚]
                                     │
L10                        [16 B The Gutter Cathedral]
```

**Edge list:** 01→02, 02→03, 03→04, 03→05, 03→06, 04→07, 05┊08 (hidden: follow the rats), 05→09, 06→09,
07→10, 08→10, 09→10, 09▒17 (needs `key_sluice_wheel`, Act 3), 10→11, 11→12, 11→13, 11⇄14 (trial, side),
12→15, 13→15, 15→16.

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a2_n01` | The Dripmarket | hub | 4 | `a2_dripmarket`, `a2_soup_mooring`, `a2_scrapwrights` | arrival by crane-lift (A2.0–A2.1): Brisket's barge, Clink's shop, Crane's second counter, Wick & Tallow stall, Old Wenna's first Ferry dock | shops |
| 02 | `a2_n02` | Hookwright's Forge | lesson | 3 | `a2_hook_forge` | **grapple** lesson (A2.2); room 3: the Rope lesson that gives **tether** | grapple, tether |
| 03 | `a2_n03` | Pickering's Lockhouse | lesson | 3 | `a2_lockhouse` | levers, buttons, pressure plates, timed doors (A2.3) | — |
| 04 | `a2_n04` | The Long Chain | fight | 4 | `a2_widows_span` | the 1,400-cell rope run; rope scuttlers, knell hookmen; one of Dobb's lost sweeps (A2.6) | sweep 1 |
| 05 | `a2_n05` | The Brickgut | fight | 4 | `a2_sewers` | sewer tunnels, rat floods, pipe worms; sweep 2 | pennies |
| 06 | `a2_n06` | The Ratcatchers' Den | event | 2 | `a2_ratcatchers` | Nell's bounty (A2.5): kill 30 gutter rats in this act for a reward paid at the Choir Loft | bounty quest |
| 07 | `a2_n07` | Gallows Awning | treasure | 2 | `a2_gallows_awning` | hanging stalls; `bell_silent_04` on a chain between awnings (swing and pole mid-air) | bell 4, rare chest |
| 08 | `a2_n08` | Rat-Pipe Warren | secret | 1 | `a2_sewers` | `bell_silent_05` at the bottom of a rat pipe; lure the rats out first | bell 5 |
| 09 | `a2_n09` | Plague Wash | fight | 4 | `a2_sewers` | plague puddles, bloat leeches, a fatberg; sweep 3; the rusted sluice to 17 | pennies |
| 10 | `a2_n10` | The Gutter Cistern | puzzle | 3 | `a2_sewers` | **Bile** (03 §15.2 / 01 A2.4 "found in the Brickgut"): dissolve an iron grate to reach it; lamp-post | Bile |
| 11 | `a2_n11` | The Charmwife's Niche | lesson | 2 | `a2_charm_shrine` | **Charm slot 1** + charm `split` (A2.4) | charm slot, split |
| 12 | `a2_n12` | The Crank Room | elite | 2 | `a2_sewers` | miniboss **The Sewer-King** (`mb_sewer_king`) | `key_grate`, relic 60% |
| 13 | `a2_n13` | The Overflow | flood | 4 | `a2_sewers` | **Act 2 set piece**: the storm drain backs up; water rises 6 cells/s through 4 vertical rooms; ropes to climb | fixed chest |
| 14 | `a2_n14` | The Singing Grate | trial | 1 | `a2_sewers` | Trial `trial_singing_grate` (§14) | trial |
| 15 | `a2_n15` | The Choir Loft | puzzle | 3 | `a2_choir_loft` | Cantor Ebb escort (A2.7, `ebb_forgiven`); `bell_silent_06` in the rafters; the puzzle that yields `key_cathedral`; Nell's bounty paid; lamp-post | `key_cathedral`, bell 6 |
| 16 | `a2_n16` | The Gutter Cathedral | boss | 2 | `a2_gutter_cathedral` | **Saint Gnaw** (`boss_gnaw`); relight | `great_wick_act2`, 8 marks |
| 17 | `a2_n17` | The Sunken Weir | treasure | 2 | `a2_sewers` | locked until Act 3 (sluice wheel): drain the weir, loot the silt | rare chest, 3 pearls |

### 6.3 Act 3 — The Sluice Ward (`act3`), 18 nodes, descended

```
L1                          [01 L The First Cistern]
                                      │
L2                          [02 H The Pumpworks ✚]
                   ┌──────────────────┼──────────────────┐
L3      [03 F Cistern Row]   [04 P The Gauge Tower]   [05 F The Long Channel]
          │    ┊    └──────┐    │                        │
L4   [06 V Fennick Loft] [09 ? Third Cistern] [07 S The Drowned Market] [08 P The Broken Arch]
          └──────────┬─────────────────────────┘   └──────────┬──────────┘
L5            [10 V Kell's Rest]                     [11 S Oarly's Landing ✚]
                      └──────────────────┬─────────────────────┘
L6                          [12 E The Three-Lock House ✚]
                                      │
L7                          [13 P The Market Cistern Valve]  ◄── choice A3.8
                   ┌──────────────────┼────────────────────┐ ═══ drained: shortcut ═══╗
L8      [14 T The Silt Vaults]  [15 W The Spillway]   [16 X Pacifist Sluice]          ║
                   └──────────────────┼────────────────────┘ (16: side, back to 13)   ║
L9                          [17 R Reservoir Steps ✚] ◄═══════════════════════════════╝
                                      │
L10                         [18 B The Great Reservoir]
```

**Edge list:** 01→02, 02→03, 02→04, 02→05, 03→06, 03┊09 (hidden: dive under a cistern wall), 03→07,
04→07, 05→08, 06→10, 07→10, 07→11, 08→11, 09→10, 10→12, 11→12, 12→13, 13→14, 13→15, 13⇄16,
13→17 (**only if drained**, one-way), 14→17, 15→17, 17→18.

The Drowned Market (07) is only enterable while its cistern is flooded (00 §11). **Draining at 13 closes it
for the rest of this save** (01 A3.8), in exchange for the 6-room shortcut.

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a3_n01` | The First Cistern | lesson | 2 | `a3_first_cistern` | you fall in (A3.0); swimming + breath lesson (A3.1) | swimming |
| 02 | `a3_n02` | The Pumpworks | hub | 4 | `a3_voss_pumphouse`, `a3_tide_font`, `a3_gauge_tower` (door only) | Voss's sluice lesson room (A3.2: 3 wick slots, Charm slot 2), the **Tide** Font (A3.3), Brisket moored, Wick & Tallow, lamp-post | Tide, sluices, `key_sluice_wheel` |
| 03 | `a3_n03` | Cistern Row | fight | 4 | `a3_cisterns` | maw fry swarms, sluice eels, flood/drain a chamber mid-fight | pennies, pearls (clams) |
| 04 | `a3_n04` | The Gauge Tower | puzzle | 3 | `a3_gauge_tower` | set 3 gauges to target levels to open the district map (a free Ferry-style reveal of Act 3) | map reveal |
| 05 | `a3_n05` | The Long Channel | fight | 4 | `a3_long_channel` | the 2,000-cell water slide; crabs on the banks, eels in the channel | pennies |
| 06 | `a3_n06` | The Fennick Loft | event | 2 | `a3_fennick_loft` | Ada Fennick; escort to the barge (A3.4) | Ada's quest |
| 07 | `a3_n07` | The Drowned Market | shop | 1 | `a3_drowned_market` | the Pale Congregation (`shop_drowned`), Sister Unna, Ada's mother (A3.5, `ada_mother`); `bell_silent_09` in the back room for 3 pearls | shop, bell 9 |
| 08 | `a3_n08` | The Broken Arch | puzzle | 3 | `a3_broken_arch` | freeze the waterfall into a ladder (A3.7); `bell_silent_08` under the fall; the upper fall's moth-glow path (▒ hood, Act 4) | bell 8 |
| 09 | `a3_n09` | The Third Cistern | secret | 1 | `a3_cisterns` | flood it, dive: `bell_silent_07` | bell 7 |
| 10 | `a3_n10` | Kell's Rest | event | 2 | `a3_kells_rest` | Ser Aubry Kell's sunken chapel (A3.6); Drowned Knight hint | lore |
| 11 | `a3_n11` | Oarly's Landing | shop | 2 | `a3_oarly_landing` | Mag Oarly (Ferrywitch lore), a Ferry landing (`shop_ferry`), lamp-post | Ferry |
| 12 | `a3_n12` | The Three-Lock House | elite | 2 | `a3_cisterns` | a lamp-post in the approach room; miniboss **Lockmaster Ebb** (`mb_lockmaster`); charm **`linger`** in room 2 (guaranteed, 03 §15.2); a flooded basement (▒ Shade, Act 4) | `key_reservoir`, linger, relic 60% |
| 13 | `a3_n13` | The Market Cistern Valve | puzzle | 2 | `a3_cisterns` | **choice A3.8**: drain (shortcut to 17; the Market closes) or keep flooded (`pale_kept`) | shortcut or Kindling |
| 14 | `a3_n14` | The Silt Vaults | treasure | 2 | `a3_cisterns` | drain-and-flood vault; clams | rare chest, pearls |
| 15 | `a3_n15` | The Spillway | flood | 4 | `a3_reservoir` | **Act 3 set piece**: a reservoir surge climbs 8 cells/s; you ride currents up | fixed chest |
| 16 | `a3_n16` | Pacifist Sluice | trial | 1 | `a3_cisterns` | Trial `trial_pacifist_sluice` (§14) | trial |
| 17 | `a3_n17` | Reservoir Steps | lamppost | 2 | `a3_reservoir` | lamp-post; Voss over the pipes (`flood_warning`) | — |
| 18 | `a3_n18` | The Great Reservoir | boss | 2 | `a3_great_reservoir` | **The Sluicemaw** (`boss_sluicemaw`); relight | `great_wick_act3`, 10 marks, 5 pearls |

### 6.4 Act 4 — Blackwater (`act4`), 16 nodes, descended, dark

```
L1                          [01 H The Last Derrick ✚]
                                      │
L2                          [02 L The Knot House]
                   ┌──────────────────┼──────────────────┐
L3      [03 P The Tar Pits]   [04 V The Dead Lighthouse]   [05 F Bubbling Field]
             │   ┌────────────────────│────────────────┘ │  ┊
L4   [06 P The Floating Chapel]  [08 F Lampless Lane]   [07 ? The Drifting Raft]
             └─────────────┬──────────┘                   │
L5                   [09 F The Hanging Houses ✚] ◄────────┘
                   ┌──────────────────┼──────────────────┐
L6    [10 V Stilt Town Hunt]  [11 W The Sinking Pilings]  [12 R Wickett's Still ✚]
                   └──────────────────┼──────────────────┘
L7                          [13 E The Wick Loft]
                   ┌──────────────────┴────────────┐
L8       [14 X Hooded Crossing] (side)   [15 R The Nave Steps ✚]
                                                   │
L9                                       [16 B The Moth Nave]
```

**Edge list:** 01→02, 02→03, 02→04, 02→05, 03→06, 05→06, 04→08, 05┊07 (hidden: the raft drifts into view
only in darkness), 06→09, 08→09, 07→09, 09→10, 09→11, 09→12, 10→13, 11→13, 12→13, 13⇄14, 13→15, 15→16.

**Seal shards:** the Moth Nave needs `key_moth_nave` = 3 `seal_shard` (08 §12.2), one in each of three dark
rooms: Lampless Lane (08), the Hanging Houses (09) and the Wick Loft (13). 09 and 13 are on every route.
Extra shards beyond three sell for 1 penny. So every route gets three: the third shard is in Lampless Lane (08), and routes that skip 08 find a duplicate
in the Floating Chapel (06) or on the Drifting Raft (07).

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a4_n01` | The Last Derrick | hub | 4 | `a4_last_derrick`, `a4_mothwife_tent` | **Lesson: oil and darkness** (A4.1) is room 1; Jory Wickett, the Mothwife's Gamble, Wick & Tallow, lamp-post | darkness & oil |
| 02 | `a4_n02` | The Knot House | lesson | 3 | `a4_knot_house` | **Knots** `on_hit` + `on_timer` (03 §15.2) | knots |
| 03 | `a4_n03` | The Tar Pits | puzzle | 3 | `a4_tar_pits` | tar and fire: burn channels in oil to route fire; tarbodies | chest |
| 04 | `a4_n04` | The Dead Lighthouse | event | 2 | `a4_lune_lighthouse` | Lune teaches "lantern out" hiding (A4.3); Moth Oracle hint | hood trick |
| 05 | `a4_n05` | Bubbling Field | fight | 4 | `a4_gas_field` | gas-pocket chains, oilbacks, anglers | pennies; knot **`on_land`** |
| 06 | `a4_n06` | The Floating Chapel | puzzle | 3 | `a4_floating_chapel` | Deacon Marl's tithe box (A4.6); a spark-machine lift to `bell_silent_12` in the steeple; a duplicate seal shard | bell 12, shard |
| 07 | `a4_n07` | The Drifting Raft | secret | 1 | `a4_slick` | `bell_silent_11` floats on a raft; burn the oil around it so it sinks to a ledge; a duplicate seal shard | bell 11, shard |
| 08 | `a4_n08` | Lampless Lane | fight | 4 | `a4_no_light_lane` | pitch dark, lit only by spells; Unlit; `bell_silent_10` (see it only with your lantern out); seal shard 1 | bell 10, shard |
| 09 | `a4_n09` | The Hanging Houses | fight | 4 | `a4_hanging_houses` | Ser Kell fights beside you (A4.4); **Shade** found (A4.2); seal shard 2; roof route (▒ gravity, Act 5); lamp-post; knot **`on_kill`** | Shade, shard, on_kill |
| 10 | `a4_n10` | Stilt Town Hunt | event | 2 | `a4_stilts` | Nell's last hunt (A4.5, `nell_alive`); skip it and she dies at A4.8 | Kindling |
| 11 | `a4_n11` | The Sinking Pilings | flood | 3 | `a4_stilts` | **Act 4 set piece**: pilings sink, black water rises 5 cells/s under burning oil — light it to see, but fire spreads | fixed chest |
| 12 | `a4_n12` | Wickett's Still | lamppost | 2 | `a4_wickett_still` | lamp-post; oil refills; **choice A4.7** (`jory_shared`) | — |
| 13 | `a4_n13` | The Wick Loft | elite | 2 | `a4_derricks` | miniboss **The Lamp-Eater Matriarch** (`mb_lampeater_mother`); seal shard 3 | relic 60%, shard |
| 14 | `a4_n14` | Hooded Crossing | trial | 1 | `a4_stilts` | Trial `trial_hooded_crossing` | trial |
| 15 | `a4_n15` | The Nave Steps | lamppost | 2 | `a4_nave` | the Mothwife's reveal (A4.8); the Moth-Nave Seal door | — |
| 16 | `a4_n16` | The Moth Nave | boss | 2 | `a4_moth_nave` | **The Lampless Widow** (`boss_widow`); relight | `great_wick_act4`, 12 marks |

Knot guarantee: `on_hit` and `on_timer` in the pinch 02; `on_kill` in the pinch 09. `on_land` sits on **every
L3 node** (05's last fight room, 03's chest, Lune's gift at 04): the first one reached gives it and the others give
`strand_dust` instead, so no route misses it.

### 6.5 Act 5 — The Bellwell (`act5`), 16 nodes, descended (the shaft)

```
L1                          [01 P The Nine Valves]
                                      │
L2                          [02 H The Tithe Hall ✚]
                                      │
L3                          [03 L Tamberlane's Foundry]
                   ┌──────────────────┼──────────────────┐
L4    [04 P The Whisper Gallery] [05 F The Upside Chapel] [06 F Counterweight Row]
          ┊   └──────────┬───────────┘ └──────────┬─────────┘  │
L5  [16 ?]    [07 F The Ring Galleries]   [08 P The Great Escapement]  [09 T The Tollers' Vault]
              │        ╲ (marl_deal)            │                          │
L6    [10 E The Precentor's Loft]   ╲           │                          │
              └──────────────┬───────╲──────────┘──────────────────────────┘
L7                    [11 R The Cracked Bell ✚]
                   ┌──────────────┴───────────┐
L8     [12 E The Belfry Crown]     [13 X Fall Upward] (side)
                   │
L9     [14 W The Long Drop]
                   │
L10    [15 B The Bellwell Bottom]
```

**Edge list:** 01→02, 02→03, 03→04, 03→05, 03→06, 04┊16 (hidden, and sealed until all 12 Silent Bells
are rung), 04→07, 05→07, 05→08, 06→08, 06→09, 07→10, 08→10, 07→11 (**only with `marl_deal`**, A5.4: the
shortcut past Dunmere), 09→11, 10→11, 11→12, 11⇄13, 12→14, 14→15.

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a5_n01` | The Nine Valves | puzzle | 3 | `a5_drain_valves` | **set piece A5.1**: open 9 valves in order to drain the shaft (07 P5-1) — the reverse of a flood | the shaft drained |
| 02 | `a5_n02` | The Tithe Hall | hub | 4 | `a5_tithe_hall` | Deacon Marl, the Bell Tithe (`shop_tithe`), Wick & Tallow, Ferry landing; **4 wick slots** (A5.2) | 4th slot |
| 03 | `a5_n03` | Tamberlane's Foundry | lesson | 3 | `a5_bellwright_forge` | **gravity lanterns** (A5.3); charm **`echo`** (03 §15.2) | gravity, echo |
| 04 | `a5_n04` | The Whisper Gallery | puzzle | 3 | `a5_whisper_gallery` | sound puzzles: ring bells whose shockwaves reach levers you cannot see | chest |
| 05 | `a5_n05` | The Upside Chapel | fight | 4 | `a5_upside_chapel` | a chapel on the ceiling; fight in two gravities; knell cantors | pennies |
| 06 | `a5_n06` | Counterweight Row | fight | 4 | `a5_counterweight` | lifts and counterweights; tumblers, rope-ringers | pennies |
| 07 | `a5_n07` | The Ring Galleries | fight | 4 | `a5_galleries` | cultist patrols; **Marl's deal** counter (knock out 10 without killing, A5.4) | `marl_deal` |
| 08 | `a5_n08` | The Great Escapement | puzzle | 3 | `a5_escapement` | the giant clock puzzle; Clink's plans (A5.7) | `clink_blueprint_5` |
| 09 | `a5_n09` | The Tollers' Vault | treasure | 2 | `a5_clockworks` | a gravity-flipped strongroom | rare chest, relic strand chance |
| 10 | `a5_n10` | The Precentor's Loft | elite | 2 | `a5_precentor_loft` | Hallow Dunmere (a named elite fight, A5.5); skipped entirely by the deal | Dunmere's relic |
| 11 | `a5_n11` | The Cracked Bell | lamppost | 2 | `a5_cracked_bell` | a fallen bell you camp in; Pim brings Pask's letter (A5.6) | `knows_keeper_rule` |
| 12 | `a5_n12` | The Belfry Crown | elite | 2 | `a5_clockworks` | miniboss **The Carillon** (`mb_carillon`) | `key_bellwell`, relic 60% |
| 13 | `a5_n13` | Fall Upward | trial | 1 | `a5_galleries` | Trial `trial_fall_upward` | trial |
| 14 | `a5_n14` | The Long Drop | flood | 4 | `a5_galleries` | **Act 5 set piece**: a toll brings the shaft down: **rubble** falls behind you as you drop (a falling chase rather than water); gravity lanterns catch you | fixed chest |
| 15 | `a5_n15` | The Bellwell Bottom | boss | 2 | `a5_bellwell_bottom` | **The Bellfather** (`boss_bellfather`); relight; the floor cracks (A5.9) | `great_wick_act5`, 14 marks |
| 16 | `a5_n16` | The Thirteenth Note | secret | 1 | `a5_whisper_gallery` | opens only when all 12 Silent Bells ring: the 13th bell; Tamberlane's line (01 §4); a bronze cosmetic lantern and 5 marks | lore, cosmetic |

### 6.6 Act 6 — The Cloudroot (`act6`), 18 nodes, **climbed** (drawn bottom-to-top)

```
L11                        [17 B The Dry Eye]           (phase 4, the final choice)
                                     ▲
L10                        [16 W The Falling Flood]     (a6_flood_1 … a6_flood_4, forced)
                                     ▲
L9                         [15 B The Storm's Eye]       (phases 1–3, then cs_rain_stops)
                                     ▲
L8                         [14 R The Last Wall ✚]
                  ┌──────────────────┼───────────────────┐
L7     [11 F The Hail Terraces]  [12 P The Wind Stair]  [13 X Overcharge Line] (side)
                  └──────────────────┼───────────────────┘
L6                         [10 E The Knotted Gate]
                  ┌──────────────────┼───────────────────┐
L5     [09 F Stormgull Eyrie]   [08 R The Lamp Bands ✚]   [07 V Corvin's Hollow] ┊┊ [18 ? The Root's Memory]
                  │         ┌────────┘   └────────┐        │
L4     [04 F The First Coil]              [05 P The Floating Lake]   [06 T The Drowned Understreet]
                  └──────────────────┬────────────────────┘────────────────┘
L3                         [03 L The Empty Socket]
                                     ▲
L2                         [02 V The Vane House]
                                     ▲
L1                         [01 H Understar Well ✚]
```

**Edge list:** 01→02, 02→03, 03→04, 03→05, 03→06, 04→09, 04→08, 05→08, 05→07, 06→07, 07┊18 (hidden:
a knot in the root that gives way to Ember), 07→10, 08→10, 09→10, 10→11, 10→12, 10⇄13, 11→14, 12→14,
14→15, 15→16 (forced), 16→17 (forced).

| # | id | Name | Type | Rooms | 01 location | Contents | Reward |
|---|---|---|---|---|---|---|---|
| 01 | `a6_n01` | Understar Well | hub | 3 | `a6_understar_well` | the floor-town's last dry room; Wick & Tallow, Brisket, Ferry; lamp-post | shops |
| 02 | `a6_n02` | The Vane House | event | 2 | `a6_vane_house` | Merrit Vane, Elsbet's grave (A6.1) | the keeper rule |
| 03 | `a6_n03` | The Empty Socket | lesson | 2 | `a6_sky_socket` | **Overcharge mastery** + **Charm slot 3** (A6.2, 03 §9.4); Old Wenna's dock | mastery |
| 04 | `a6_n04` | The First Coil | fight | 4 | `a6_first_coil` | wind lesson room then fights; stormgulls, rainwraiths | pennies |
| 05 | `a6_n05` | The Floating Lake | puzzle | 3 | `a6_floating_lake` | a lake held in cloud: freeze, burn and flood it into a path | chest |
| 06 | `a6_n06` | The Drowned Understreet | treasure | 3 | `a6_understar` | sunken houses at the root's foot | rare chest |
| 07 | `a6_n07` | Corvin's Hollow | event | 3 | `a6_corvins_cell` | free Corvin (A6.4, `corvin_freed`) | Kindling |
| 08 | `a6_n08` | The Lamp Bands | lamppost | 3 | `a6_lamp_bands` | three band camps in a column (Crown amber, Gutter pink, Sluice teal); each is a lamp-post (A6.3) | rest |
| 09 | `a6_n09` | Stormgull Eyrie | fight | 4 | `a6_rootway` | cliffside nests, wind 20 cells/s, lightning | pennies |
| 10 | `a6_n10` | The Knotted Gate | elite | 2 | `a6_rootheart` | miniboss **The Rootwarden** (`mb_rootwarden`) | `key_cloudroot`, relic 60% |
| 11 | `a6_n11` | The Hail Terraces | fight | 4 | `a6_rootway` | hailstone golems, vane heralds; the Deep and Bell bands (camps) in rooms 2 and 4 | pennies |
| 12 | `a6_n12` | The Wind Stair | puzzle | 3 | `a6_rootway` | use lobs and tethers against a 30 cells/s crosswind; the Deep and Bell bands in rooms 1 and 3 | chest |
| 13 | `a6_n13` | Overcharge Line | trial | 1 | `a6_rootway` | Trial `trial_overcharge_line` | trial |
| 14 | `a6_n14` | The Last Wall | lamppost | 2 | `a6_last_wall` | the rim from inside; the 15-line montage (A6.5) | — |
| 15 | `a6_n15` | The Storm's Eye | boss | 1 | `a6_storm_eye` | **Ossery Vane**, phases 1–3 (A6.6); then `cs_rain_stops` (A6.7) | — |
| 16 | `a6_n16` | The Falling Flood | flood | 4 | `a6_storm_eye` | **Act 6 set piece** (01 A6 "The Falling Flood"): rooms `a6_flood_1`–`a6_flood_4`: fall 1,600 cells as the lakes pour past, then climb the swollen root back up | — |
| 17 | `a6_n17` | The Dry Eye | boss | 1 | `a6_storm_eye` | Ossery phase 4; at 10% the final choice (A6.8, 01 §11) | `great_wick_act6`, 20 marks, ending |
| 18 | `a6_n18` | The Root's Memory | secret | 2 | `a6_rootheart` | what the root drank: a drowned Guild office; relic strands ×2 (03 §15.2) and a clue for Ending D | relics |

**Death during 15–17:** you restart at The Last Wall (14). Beating phases 1–3 once (15) saves a checkpoint: a
later death during the Falling Flood or phase 4 restarts at the top of 16, not at 14.

---

## 7. Difficulty curve per act

### 7.1 The numbers

Enemy stats come from 05 §2.3 (per-level scaling from each monster's base level). This table adds the act's
**pressure multipliers** on top, then 02 §10.1's difficulty column on top of that.

| Act | Area level (by layer: first → last) | Base level (05) | Player level at the boss (expected) | Enemy HP × | Enemy damage × | Spawn budget per fight room | Elite chance × (on the difficulty's %) | Rooms per route |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 → 5 | 2 | 5–6 | ×0.85 | ×0.80 | 6–10 | ×0 in rooms 1–6, then ×0.5 | 26–33 |
| 2 | 5 → 10 | 7 | 10–11 | ×1.00 | ×1.00 | 10–14 | ×1.0 | 28–35 |
| 3 | 10 → 15 | 12 | 15–16 | ×1.00 | ×1.05 | 12–16 | ×1.0 | 26–36 |
| 4 | 15 → 20 | 17 | 20–21 | ×1.05 | ×1.10 | 10–14 (fewer, but the Unlit add more in darkness, 05 §15.3) | ×1.1 | 27–34 |
| 5 | 20 → 25 | 22 | 24–25 | ×1.10 | ×1.10 | 14–18 | ×1.2 | 26–33 |
| 6 | 25 → 30 | 27 | 29–30 | ×1.15 | ×1.15 | 16–20 | ×1.3 | 30–38 |

**Area level by layer:** `areaLevel = actMin + round((actMax − actMin) × (layer − 1) / (layers − 1))`.
The hub and lamp-post rooms have no spawns. A side node (trial) uses its own rules (§14).

### 7.2 Spawn budget by node type (multiplies the act's budget)

| Node type | Budget × | Notes |
|---|---|---|
| fight | ×1.0 | |
| elite (gauntlet variant) | ×0.8 + 3 guaranteed elite groups | miniboss arenas use 05 §18 instead |
| puzzle | ×0.3 (and only in the 1 fight room, if any) | |
| lesson | ×0 in the lesson room; ×0.4 in practice rooms | |
| treasure | ×0.5 + traps | |
| flood | ×0.4 (the water is the enemy) | |
| event | per event | |

### 7.3 Pacing targets (what the sim and the play-tests check)

| Act | Time for a first route | Deaths expected on Lamplighter | Longest stretch between lamp-posts |
|---|---|---|---|
| 1 | 60–75 min | 0–3 | 5 nodes |
| 2 | 70–85 min | 2–5 | 5 nodes |
| 3 | 70–90 min | 3–6 | 5 nodes |
| 4 | 70–90 min | 4–8 | 4 nodes |
| 5 | 60–80 min | 4–8 | 4 nodes |
| 6 | 70–90 min | 5–10 (boss included) | 4 nodes |

---

## 8. Death and continue

### 8.1 Lamp-posts

- A **lamp-post** is a Guild lantern on an iron post. First touch (`E`): you **light** it (it becomes a fast
  travel point, 02 §13.5). Sitting at it (`E` again): **rest**.
- **Rest** = full health, full oil, belt restocked from the satchel, cooldowns reset, a **save** (02 §8.2), and
  the lamp-post becomes your **checkpoint**. Resting does **not** respawn enemies (unlike some games): the
  world is not reset by resting.
- The lamp-post menu (DOM, 02 §6): `Rest` · `Braid wicks` · `Fast travel` · `Spend points` · `Change
  difficulty` · `Leave`.
- Lamp-posts are placed in: every hub, every `lamppost` node, and inside the nodes marked `✚` in §6.

### 8.2 When you die (campaign)

| Lost | Kept |
|---|---|
| **Pennies**: 25% of carried (Lamplighter; 0% Wick-lit, 50% Lampless, 75% Drowned — 02 §10.1) dropped as a **purse** where you fell (08 §13). Walk over it to take it back. One purse at a time: dying again before you reach it destroys it. If you fell somewhere unreachable (a pit, deep water), the purse floats up or is moved to the room's `lootSafe` point. | All XP and levels |
| The active **meal** buff (08 §9.4) | All items, gear, strands, wicks, burn-in |
| Temporary buffs and statuses | Pearls and Guild marks |
| Progress in the **room you died in** (it resets from its seed + saved diff) | Cleared rooms stay cleared (within this act visit) |
| An unfinished flood chain restarts from its first room (the first failure of each set piece is free: no penny loss) | Terrain you changed in *finished* rooms |
| A boss fight resets fully (bosses heal) | Opened chests, solved puzzles, lit lamp-posts |

- You **respawn at the last lamp-post you rested at**, with full health and oil. The death screen (02 §21)
  names what was lost.
- **Return to last lamp-post** from the pause menu (02 §20) applies the same penny loss without counting a death.
- **Boss retries:** the boss node's antechamber always has a lamp-post (every boss in §6 is preceded by one),
  so a boss retry never costs a walk longer than one room.
- **Iron Wick** (02 §10.3): death ends the save.

### 8.3 Modes

Floodgate, Long Descent, Daily Wick, Boss Rush and Trials have their own end rules (§10–§14). None of them take
anything from a campaign save.

---

## 9. New game plus

Unlocked for a save when its campaign ends (any ending). On the title screen, the save card gets
`[Begin NG+1]`, which makes a **copy** (the finished save stays as it was).

### 9.1 What carries over

| Carried | Reset |
|---|---|
| Level, attributes, skill board | Story flags, Kindling flags, quests, NPC relations (Lingo memories are cleared) |
| All gear, satchel, strands, wicks, burn-in | Keys, Great Wicks, relit Lamps (all dark again) |
| Pennies, pearls | Map reveals, pins, lamp-posts lit |
| All mechanics (grapple, sluices, hood, knots, gravity lanterns, mastery) — **available from the start** | Rooms, chests, secrets (all fresh, new seed) |
| Silent Bells rung and class unlocks (they live in the profile) | Difficulty (you pick again; Drowned is offered if unlocked) |

Because every mechanic is available from the start, **locked routes (§5.3) are open from the first visit**, and
lesson rooms turn into short challenge rooms (the same layout with enemies, budget ×0.6).

### 9.2 What changes (per cycle n = 1…5)

| Knob | NG+ n |
|---|---|
| Area level | campaign area level + **8n** (Act 1 NG+1 = 9–13; Act 6 NG+5 = 65–70), scaled by 05 §2.5's gentle curve above 30 |
| Player level cap | **30 + 10n** (40, 50, 60, 70, 80) — see §20 |
| Elites | every elite is a **champion** (2 modifiers, 05 §17); elite chance +10 percentage points |
| Bosses | gain their "Drowned only" extra attack per phase (05 §2.4) whatever the difficulty |
| Node maps | new seed; **within each non-pinch layer, node types are reshuffled** among the layer's nodes (story nodes stay where their story is) |
| Loot | +1 item level per 2 area levels (08 §4.2); `lamp_blessed` chance ×2 |
| Marks | ×(1 + 0.25n) for the lamps (the relight marks pay again each cycle) |
| Cosmetic | the lantern pole gains one gold ring per cycle |

NG+5 is the last cycle; finishing it grants the achievement `ng_plus_5` and nothing further changes.

---

## 10. Floodgate (`waves`)

Hold a lit Lamp against 30 waves while the water rises; build between waves. Unlocked after Mother Tallow in
any save (01 A1.11: Captain Hask at the Rim Watch House), from the title screen's Modes list or Hask himself.

### 10.1 The character

- Pick any **unlocked** class. You start at **level 8** with the class's starting kit, the class's starting
  wicks, and **every strand the profile has ever owned** (the "Guild Library": the profile keeps a set of
  strand ids seen in any save) — so the mode rewards campaign progress without importing gear.
- XP in the mode: each wave cleared = enough XP for **0.5 levels** at the current level (cap level 30).
  Level-ups give points as usual; the build phase is when you spend them.
- Gear: a **wave chest** after waves 5, 10, 15, 20, 25 rolls one item at item level `8 + wave/2` (08 §14 rules).
- Braiding is allowed during build phases (the arena counts as a lamp-post).

### 10.2 The map: The Watch Cistern (`fg_watch_cistern`)

```
 x: 0                                  480                                  959
 y:0 ┌──────────────────────────────── TOP GRATE (S3: flyers) ──────────────────┐
     │                                   ▼ ▼ ▼                                  │
 60  │   ▭▭▭▭ (B1)            ▭▭▭▭ (B2)        ▭▭▭▭ (B3)           ▭▭▭▭ (B4)    │
     │                                ╔═══════════╗                             │
 140 │  ▭▭▭▭▭▭ (B5)                   ║  THE LAMP ║                ▭▭▭▭▭▭ (B6)  │
     │                                ║  basin    ║  ← basin floor y=270        │
 220 │       ▭▭▭▭ (B7)                ║ (h = 250) ║              ▭▭▭▭ (B8)      │
     │                                ╚═══╦═══╦═══╝                             │
 300 │ S1═══▶  ▭▭▭▭▭ (B9)                 ║   ║                ▭▭▭▭▭ (B10) ◀═══S2│
     │ (left pipe, h=220)                 ║ T ║ tower                (right pipe)│
 380 │     ▭▭▭▭ (B11)      ▭▭▭▭ (B12)      ║ o ║      ▭▭▭▭ (B13)   ▭▭▭▭ (B14)     │
     │                                    ║ w ║                                 │
 460 │  ▭▭▭▭▭▭ (B15)      ▭▭▭ (B16)       ║ e ║     ▭▭▭ (B17)   ▭▭▭▭▭▭ (B18)     │
     │ ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈║ r ║≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈│ ← water h
 520 └─ floor (h = 0) ── D1 drain ──────── D2 drain ────────── D3 drain ───────────┘
```

| Feature | Spec |
|---|---|
| Size | **960 × 540 cells** (2 × 2 screens). The camera follows the player; a setting zooms the render out to show the whole arena at ×0.5 during build phases only. |
| Height `h` | measured in cells **up from the floor** (floor at y = 520, so `y = 520 − h`). |
| The Lamp | a Great-Lamp replica on a stone tower at x 440–520. Its **basin** (the flame's bowl) sits at **h = 250**. |
| Lamp oil | the Lamp's health: **1,000** max (upgradable, §10.5). Enemies that reach the tower attack it; ranged enemies target it at 20%; `knell_lampbreaker` targets it first. |
| Spawn mouths | **S1** left pipe (x 0, h 220), **S2** right pipe (x 959, h 220), **S3** top grate (x 400–560, flyers only), **S4** "the water" (swimmers rise from any water surface once `h ≥ 40`). |
| Platforms | 18 fixed stone ledges **B1–B18** (each 32–60 cells wide, 4 thick) that are **build sockets** (turrets go only on sockets); planks/braces go anywhere (07). |
| Drains | **D1–D3** in the floor: each lowers the water 1 cell per wave end while not clogged (a corpse or rubble on a drain clogs it; clear it by hand or with Tide). |
| Rain | heavy (80 drops/100 cols/s); a **surge** every 3rd wave doubles it for the wave (adds +2 cells of water at the wave's end). |

### 10.3 The rising water rule

- The flood is **one level** `h` for the whole arena, drawn as a surface with the reflection pass (06). It is
  not cell water except in a 16-cell band at the surface, where cells splash and flow around your planks. This
  keeps the mode cheap (verdict risk #2).
- Start: `h = 0` (a wet floor).
- **At each wave's end:** `h += rise(w) − drain`, where

```
rise(w)  = 6 + 2 × floor((w − 1) / 5)      // waves 1–5: 6 · 6–10: 8 · 11–15: 10 · 16–20: 12 · 21–25: 14 · 26–30: 16
           + 2 if wave w was a surge wave (every 3rd)
drain    = 1 per unclogged floor drain (0–3)
         + 4 per hand pump built (max 6 pumps)
         + the manual crank: holding E at a pump during the build phase lowers h by 1 per 2 s
```

- Without pumps, the raw rise over 30 waves is **330 + 20 = 350 cells**, more than the basin's 250, so a player
  who never builds pumps loses around wave 24–26. Six pumps from wave 10 hold it comfortably.
- **During waves 21–30** the water also creeps **0.2 cells/s** while the wave runs (it is raining harder).
- **Water effects:** anything below `h` is underwater — breath rules (07), Ember wicks cannot be cast from
  below the surface, Spark in the water shocks everything in it (you too), swimmers (S4) come up, turrets on
  submerged sockets stop working until the water drops.
- **Loss:** Lamp oil reaches 0, **or** `h ≥ 250` (the basin floods and the Lamp drowns).

### 10.4 Phases and the build timer

| Phase | Length | What happens |
|---|---|---|
| Build | **30 s** (before waves 1–9), **25 s** (10–19), **20 s** (20–29); **45 s** before waves 10, 20, 30 | enemies absent; build, repair, spend points, braid, crank pumps. The HUD shows a big timer and the next wave's preview (icons of its enemy families and mouths). |
| Ring early | `E` at the bell on the tower | starts the wave now: **+1 scrap and +10 score per full second left** |
| Wave | until every enemy of the wave is dead | the tower's bell tolls at start; the minimap shows enemy pips in this mode |
| Settle | 3 s | the water rises (`rise − drain`), the wave's rewards pay, the next build phase starts |

Death in a wave: you respawn at the tower **8 s** later; each death costs the Lamp **75 oil**.

### 10.5 Currencies and building

| Currency | Earned | Spent on |
|---|---|---|
| **Scrap** (`fg_scrap`, mode-only) | kills (fodder 1, standard 2, heavy 5, elite 12, miniboss 60); wave clear `10 + w`; ring-early bonus | building, repairs, upgrades |
| **Lamp oil** | the Lamp's health; refilled only by **oil casks** (bought with scrap) and `+50` at each wave chest | — |
| Pennies / pearls | none in this mode | — |
| **Guild marks** (profile) | 1 per 5 waves held (08 §13.3); +3 the first time you clear wave 30 | Guild Hall |

**Buildables** (turrets need a B-socket; everything else goes anywhere the build grid allows, 07):

| id | Name | Scrap | HP | Effect |
|---|---|---|---|---|
| `fg_plank` | Plank | 2 | 60 | a 16 × 2 platform (07's plank) |
| `fg_brace` | Brace | 3 | 90 | diagonal support |
| `fg_barricade` | Barricade | 8 | 300 | a 4 × 24 wall; walkers must break it |
| `fg_sandbag` | Sandbag wall | 6 | 200 | a 12 × 6 dam: water does not pass it (07 chamber rule) — shields a lower socket from the flood until the water tops it |
| `fg_pump` | Hand pump | 30 | 150 | −4 water per wave end; max 6; cranking by hand (§10.3) |
| `fg_drain_clear` | Drain grate (upgrade a drain) | 20 | — | the drain can no longer clog |
| `fg_brazier` | Ember brazier | 25 | 180 | turret: fires an Ember bolt (area level damage × 0.6) every 1.2 s at 140 cells; ignites oil |
| `fg_rime_spout` | Rime spout | 30 | 180 | turret: a Rime arc every 1.6 s, slows 40%; freezes the surface band into an ice raft |
| `fg_spark_coil` | Spark coil | 40 | 150 | turret: chains 3 targets every 1.4 s; if under water, shocks everything in the water |
| `fg_gleam_post` | Gleam post | 30 | 150 | turret: a light radius 80; burns Unlit 20/s in its light; heals you 2/s within 40 cells |
| `fg_bell_post` | Bell post | 35 | 250 | every 6 s a 60-cell stagger ring (bronze telegraph) |
| `fg_oil_trap` | Oil trap | 10 | — | a 24-cell oil slick; light it with any Ember |
| `fg_tide_gate` | Tide gate | 45 | 300 | a sluice in the arena wall: opening it (E) drops `h` by 12 once per 3 waves |
| `fg_oil_cask` | Oil cask | 20 | — | +150 Lamp oil (instant) |
| `fg_reservoir` | Lamp reservoir | 60 | — | +300 max Lamp oil (twice max) |
| Repair | — | 1 per 10 HP | — | any building |
| Upgrade (turrets) | — | ×1.0 of cost per rank, ranks 2–3 | +40% HP | +30% damage, −15% interval per rank |

### 10.6 The 30 waves

Area level = `3 + floor((w − 1) / 3)` (05 §2.5: +1 every 3 waves) → wave 1 = 3, wave 30 = 12. Enemy ids are
05's. "×n" is the count. Mouth S1/S2 = left/right pipe, S3 = top grate, S4 = the water. `E:` marks an elite group
(the elite modifier is rolled from 05 §17, but never `mod_relentless` here).

| Wave | Composition (mouth) | Special | Build phase before |
|---|---|---|---|
| 1 | wax_mite ×6 (S1) | — | 30 s |
| 2 | wax_mite ×5 (S1), dripling ×3 (S2) | — | 30 s |
| 3 | soot_pigeon ×6 (S3), wax_mite ×6 (S1+S2) | surge | 30 s |
| 4 | tallow_hound ×3 (S2), dripling ×4 (S1) | — | 30 s |
| 5 | chandler_husk ×2 (S1+S2), waxwing ×4 (S3); E: tallow_hound ×1 | first wave chest | 30 s |
| 6 | gutter_rat swarm ×12 (S1), rat_chorister ×1 (S2) | surge | 30 s |
| 7 | rope_scuttler ×4 (S3), knell_novice ×5 (S1+S2) | — | 30 s |
| 8 | bloat_leech ×3 (S4 if h ≥ 40, else S1), gutter_rat swarm ×12 (S2) | — | 30 s |
| 9 | pipe_worm ×2 (S1+S2), knell_hookman ×3 (S2), rat_chorister ×2 (S1) | surge | 30 s |
| 10 | **Echo of the Wickwright** (`mb_wickwright`, 60% HP, S3 ceiling rail) + wax_mite ×8 | miniboss wave, chest | **45 s** |
| 11 | maw_fry ×12 (S4), sluice_crab ×3 (S1) | — | 25 s |
| 12 | sluice_eel ×3 (S4), bloat_toad ×3 (S2), knell_novice ×6 (S1) | surge | 25 s |
| 13 | kelpwraith ×2 (S4), sluice_crab ×4 (S1+S2); E: sluice_crab ×1 | — | 25 s |
| 14 | fatberg ×1 (S1), gutter_rat swarm ×18 (S2), knell_lampbreaker ×2 (S2) | lampbreakers go for the Lamp | 25 s |
| 15 | **Echo of the Sewer-King** (`mb_sewer_king`, 60% HP, S1) + rat_king ×1 (S2) | miniboss wave, surge, chest | 25 s |
| 16 | drowned_lockkeeper ×2 (S1+S2), maw_fry ×12 (S4), gate_warden ×1 (S2) | — | 25 s |
| 17 | oilback ×3 (S1), lampeater ×4 (S3) | **the arena goes dark**: ambient 0.08 for this wave (only your light and turrets' light) | 25 s |
| 18 | unlit_creeper ×3, unlit_hound ×3 (from darkness, any dim corner), silkling ×6 (S3) | dark; surge | 25 s |
| 19 | blackwater_angler ×2 (S4), hollow_lamplighter ×3 (S1+S2), tarbody ×2 (S2); E: hollow_lamplighter | — | 25 s |
| 20 | **Echo of Lockmaster Ebb** (`mb_lockmaster`, 60% HP, S4) + sluice_eel ×4 (S4) | miniboss wave; his *Open the Gates* raises `h` by 10 once (then drains 10 after he dies) | **45 s** |
| 21 | clapperling ×10 (S3), tumbler ×3 (S1) | water creeps 0.2/s from now on; surge | 20 s |
| 22 | echo_bat ×8 (S3), rope_ringer ×3 (S1+S2), knell_cantor ×2 (S2) | — | 20 s |
| 23 | tollworm ×2 (S1+S2), knell_maulbearer ×2 (S1); E: knell_maulbearer | — | 20 s |
| 24 | bronze_sentinel ×2 (S1+S2), clapperling ×10 (S3), knell_lampbreaker ×3 (S2) | surge | 20 s |
| 25 | **Echo of the Carillon** (`mb_carillon`, 50% HP, anchored under S3) + knell_tollkeeper ×1 (S1) | miniboss wave, chest | 20 s |
| 26 | stormgull ×8 (S3), rainwraith ×4 (S1+S2) | wind 15 cells/s east all wave | 20 s |
| 27 | rootgnarl ×3 (S1), cloud_bloat ×4 (S3), vane_herald ×2 (S2); E: vane_herald | surge | 20 s |
| 28 | hailstone_golem ×2 (S1+S2), unlit_stalker ×2 (dark corners), lampeater ×4 (S3) | dark wave (as 17) | 20 s |
| 29 | champions: one E group from each of waves 23, 24, 27 (2 modifiers each) + knell_novice ×12 | all four mouths | 20 s |
| 30 | **The Floodgate Tide**: Echo of the Sewer-King + Echo of Lockmaster Ebb (both 50% HP), unlit_deepmaw ×1 placed in the tower wall, rainwraith ×6 | surge; the water creeps 0.4/s; winning here = mode cleared | **45 s** |

**After wave 30:** a victory screen, then an optional **Endless Tide**: wave 31+ repeats waves 21–30's
compositions with area level +1 per wave and `rise` fixed at 16; it scores but pays no more marks.

### 10.7 Scoring (`waves`)

```
score = 1000 × wavesCleared
      + Σ kill points (fodder 5, standard 12, heavy 30, elite 80, miniboss 600)
      + 10 × seconds rung early
      + 250 × waves in which the Lamp took no damage
      + 2 × lamp oil left at the end
      + 5 × (250 − h) at the end, if cleared
      − 300 × player deaths
score × difficulty (Wick-lit 0.8 · Lamplighter 1.0 · Lampless 1.3 · Drowned 1.6) × slow mode (1.0 / 0.9 / 0.8 / 0.6)
```

Local board: `store.js` key `fg_board`, top 20 (§11.7 shape, `mode: "waves"`).

---

## 11. The Long Descent (`endless`)

An infinite procedural descent with a flood chasing you down. Unlocked after Saint Gnaw (01 A2.10).

### 11.1 The run

- **Fresh character:** any unlocked class at **level 1**, class kit and starting wicks, no gear beyond the
  kit. XP ×2.5. Level cap **99** in this mode (00 §9: "Endless goes past it").
- **Strands:** only the class wicks at the start; strands come from chests (1 per 3 depths) and milestone
  caches, widening by act gate as depth rises (03 §15.2). Burn-in starts at level 1 per run (03 §10), level 2
  with the Guild unlock `old_habits`.
- **Pennies** are per run (08 §13: not kept); spent at depth-rest shops. **Pearls**: 1 per 5 depths (kept).
  **Guild marks**: 1 per 10 depths (kept).
- Death ends the run. There is no save mid-run except a **suspend** on quit (resumed once, then deleted).

### 11.2 The procedural room chain

- **Depth d** = the d-th room. A run is `d = 1, 2, 3, …`.
- Each depth draws one template from the pool of **every template tagged `endless`** (all campaign fight,
  puzzle-lite and traversal templates are tagged unless marked `campaignOnly`) **plus** ~20 endless-only
  templates (`ld_*`: long shafts, drop chutes, arenas).
- **Chain rule:** the template's entrance must be on the top or a side, and at least one exit must be lower than
  its entrance (you always go **down**). Rooms are chosen so the exit side matches the next room's entrance.
- **Run seed:** random at start (shown on the end screen), or typed in "Seeded run" (scores tagged
  `seeded`). `roomSeed = hash32(runSeed, d)`.
- **What each depth is:**

| Depth | Room |
|---|---|
| d mod 5 = 0 (5, 15, 25…) | **Rest room**: a lamp-post (heal 50%, full oil), a roaming merchant (08 §17: Fennick Tallowby's `shop_peddler` stock at `ilvl = areaLevel`), a **boon** choice (§11.4) |
| d mod 10 = 0 (10, 20, 30…) | **Milestone** (instead of rest): a miniboss echo, then the rest room services + a Guild cache (§11.5) |
| d mod 30 = 0 (30, 60, 90…) | **Boss depth**: a boss echo (05 bosses at 70% HP, rotating), then the milestone |
| d = 7, 17, 27… (d mod 10 = 7) | a **puzzle** template (puzzle-lite: solvable in under 60 s) with a chest |
| otherwise | a fight or traversal template, spawn budget from §11.3 |

### 11.3 Biome rotation and scaling

- **Biome** changes every 10 depths, following the acts: depths 1–10 Wax Stair (act1 palette, spawn table
  `sp_act1`), 11–20 Gutterways, 21–30 Sluice Ward, 31–40 Blackwater (dark, the Unlit), 41–50 Bellwell, 51–60
  Cloudroot (with rain), then **61–70 Wax Stair "Deeper"** and so on: the cycle repeats with each palette
  darkened one ramp step per cycle and the rain +20%.
- **Area level** `= 1 + floor(d / 2)` (05 §2.5), no cap; above 30, 05's gentler curve (`1.10^ΔL` HP, `1.06^ΔL`
  damage) applies.
- **Endless pressure** (on top, from depth 61):

```
hpMult     = 1 + 0.010 × max(0, d − 60)
damageMult = 1 + 0.005 × max(0, d − 60)
budget(d)  = min(24, 6 + floor(d / 4))                  // spawn points per fight room
eliteChance = difficulty elite % + 0.5 percentage points per depth past 20 (cap 60%)
champions  = 1 modifier; 2 from depth 36 (area level 19+); every 5th group gets +1 above level 35 (05 §2.5)
```

### 11.4 The flood chase (the Floodline)

- The **Floodline** is a depth number that chases you. It starts at **d = −2** (two rooms above your first).
- It advances **one depth every T(d) seconds**: `T(d) = max(30, 75 − 0.5 × d)` s (75 s at the start, 30 s from
  depth 90).
- The HUD shows it under the minimap: `FLOOD: 2 rooms behind` with a small wave icon; `1 room behind` turns it
  amber; when it **reaches your depth** the room starts to flood.
- **A flooding room:** the water rises from the room's lowest open cell at **6 cells/s** (a height-field level
  per chamber, drawn by the reflection pass — cheap; cell water only in a 16-cell surface band). Exits low in the
  room will go under: you can still swim through them (breath rules, 07), which is the tension.
- **Leaving** a flooding room puts you one room ahead again — but the Floodline keeps its timer, so lingering
  costs.
- **Rest rooms hold it back:** resting at a depth-rest lamp-post pushes the Floodline back by **2 depths** (the
  light holds the water). A milestone pushes it back 3.
- **Caught twice:** if the Floodline passes you (you are in a room it has already filled, i.e. you went back up),
  the room fills at 12 cells/s.
- **Why it's a chase and not a timer:** it rewards moving on, but a player who clears fast can bank a lead and
  spend it on chests and puzzles.

### 11.5 Boons, milestones and caches

- **Boon** (every rest room): pick 1 of 3 from `data/modes/boons.json` (run-only upgrades). The list (20):

| id | Boon |
|---|---|
| `bn_deep_breath` | breath +50% |
| `bn_oil_well` | max oil +25 |
| `bn_quick_wick` | cooldowns −10% |
| `bn_thick_coat` | max health +15% |
| `bn_scavenger` | pennies +30% |
| `bn_ember_heart` | Ember wicks +15% damage |
| `bn_cold_blood` | Rime wicks +15% damage and slow +10% |
| `bn_live_wire` | Spark chains +1 target |
| `bn_acid_tongue` | Bile corrodes armour twice as fast |
| `bn_halo` | Gleam heals +25% |
| `bn_undertow` | Tide knockback +40% |
| `bn_hollow_eye` | Shade ignores 20% more resistance |
| `bn_steady_hand` | overcharge safe line +0.1 |
| `bn_long_arm` | grapple range +40 cells |
| `bn_light_feet` | move speed +8% |
| `bn_second_wind` | once per run: revive at 40% health |
| `bn_floodwise` | the Floodline timer +10 s |
| `bn_chest_nose` | 1 extra chest in each puzzle depth |
| `bn_burn_bright` | burn-in grows twice as fast |
| `bn_last_light` | below 25% health, wicks cost no oil |

- **Milestone Guild cache** (every 10 depths): pick 1 of 3: a strand of the current act gate · a relic
  (08 §7) at `ilvl = areaLevel` · +3 attribute points. Plus 1 Guild mark (profile).
- **Milestone miniboss:** the 05 §18 miniboss of the current biome at 70% HP.
- **Boss depth (every 30):** 05's bosses in rotation (30 Mother Tallow, 60 Saint Gnaw, 90 Sluicemaw, 120 the
  Widow, 150 the Bellfather, 180 Ossery phases 1–3 only; then repeat) at 70% HP. Pays a boss relic (08 §7.1)
  roll and 3 marks the first time per profile.

### 11.6 Scoring (`endless`)

```
score = 100 × deepest depth reached
      + Σ kill points (as Floodgate)
      + 500 × milestones passed + 2000 × boss depths passed
      + 20 × seconds of Floodline lead at each milestone (how many seconds ahead you were)
      − 0 for deaths (a death ends the run)
score × difficulty × slow-mode factor (as §10.7)
```

End screen: depth, time, killer, cause, best wick (from the Ledger), boons taken, score, board position.

### 11.7 Local leaderboard JSON

Stored with `shared/store.js`, namespace `lanternfall`, key `boards` (one object for every mode's board):

```json
{
  "schema": 1,
  "endless": [
    { "score": 184230, "depth": 63, "class": "moth_oracle", "name": "Ilse", "difficulty": "lampless",
      "slow": 1.0, "seed": 3319940021, "seeded": false, "timeS": 5460, "killer": "unlit_stalker",
      "boons": ["bn_oil_well", "bn_halo"], "date": "2026-09-26T21:14:03Z", "version": "0.1.0" }
  ],
  "endlessByClass": { "lamplighter": [ /* top 5, same shape */ ] },
  "waves":   [ { "score": 41200, "waves": 30, "class": "tinker", "name": "Wren", "difficulty": "lamplighter",
                 "slow": 1.0, "lampOilLeft": 420, "deaths": 1, "date": "…", "version": "0.1.0" } ],
  "daily":   { "2026-09-26": { "score": 22100, "depth": 18, "class": "bellringer", "wick": "dw_07",
                               "slow": 1.0, "practice": false } },
  "bossrush": [ { "timeS": 1332.4, "bosses": 6, "class": "sluicewarden", "difficulty": "lamplighter",
                  "splits": [140.2, 188.0, 231.5, 250.1, 220.9, 301.7], "kit": "own", "date": "…" } ],
  "trials":  { "trial_rope_gauntlet": { "bestS": 71.3, "medal": "gold", "date": "…" } }
}
```

- `endless`: top 20 by score; `endlessByClass`: top 5 per class. Ties broken by earlier date.
- Every entry records `version` so a later balance change can mark old entries with a small `v0.1` badge.
- Export/import with the profile (02 §19.8).

---

## 12. Daily Wick (`daily`)

A seeded Long Descent with a fixed class and a fixed starting wick; one scored try a day. Unlocked after Saint
Gnaw.

### 12.1 The seed

```
dateKey = UTC date "YYYY-MM-DD"                 // the day changes at 00:00 UTC for everyone
seed    = fnv1a32("lanternfall-daily:" + dateKey)
dayNum  = days since 2026-01-01 (UTC)
```

The title card shows the local time the next Daily starts.

### 12.2 The fixed class and wick table (14-day cycle: `dayNum mod 14`)

The class may be one the profile has **not** unlocked: the Daily lends it ("a Guild loaner"). Playing it does
not unlock it.

| Slot | Class | Starting wick (id: Flame + Shape + charms) | Second wick |
|---|---|---|---|
| 0 | `lamplighter` | `dw_00` Ember Bolt | Gleam Ring |
| 1 | `sluicewarden` | `dw_01` Tide Wave | Rime Arc |
| 2 | `tinker` | `dw_02` Spark Rune | Ember Lob |
| 3 | `ferrywitch` | `dw_03` Shade Tether | Tide Bolt |
| 4 | `bellringer` | `dw_04` Spark Ring + `vast` | Ember Arc |
| 5 | `drowned_knight` | `dw_05` Tide Arc + `siphon` | Bile Bolt |
| 6 | `moth_oracle` | `dw_06` Gleam Beam | Shade Bolt + `seek` |
| 7 | `chimneysweep` | `dw_07` Ember Lob + `bounce` | Rime Bolt + `swift` |
| 8 | `lamplighter` | `dw_08` Rime Ring + `linger` | Spark Bolt + `split` |
| 9 | `sluicewarden` | `dw_09` Bile Wave + `pierce` | Gleam Ring |
| 10 | `tinker` | `dw_10` Ember Rune + `volatile` | Spark Tether |
| 11 | `ferrywitch` | `dw_11` Rime Lob + `heavy` | Shade Ring |
| 12 | `moth_oracle` | `dw_12` Shade Beam + `steady` | Gleam Bolt + `split` |
| 13 | `bellringer` | `dw_13` Tide Bolt + `echo` | Spark Arc + `vast` |

Charms appear in a Daily wick even before their act gate — the Daily is a fixed puzzle, not a progression.
Strands the run finds follow 03 §15.2's Endless rules.

### 12.3 The daily modifier (by weekday, UTC)

| Day | Modifier (id) | Effect |
|---|---|---|
| Mon | `dm_downpour` | rain ×2; water in every room starts 20% higher |
| Tue | `dm_tallow_tuesday` | every enemy death leaves a molten wax puddle for 3 s |
| Wed | `dm_short_wicks` | cooldowns −30%, oil costs +30% |
| Thu | `dm_lampless_night` | ambient light ×0.5 everywhere (the Unlit spawn from depth 1) |
| Fri | `dm_bell_friday` | every 30 s a toll: stagger ring from the room's centre, rubble falls |
| Sat | `dm_fast_flood` | Floodline T(d) × 0.75, score × 1.2 |
| Sun | `dm_easy_sunday` | no modifier; boons offer 4 choices instead of 3 |

### 12.4 One scored try

- The **scored try** begins when you enter depth 1. Quitting, crashing or closing the tab after that **counts**
  (the try is marked `abandoned` with whatever depth was reached, written at each room change).
- After the scored try, **practice** runs are unlimited on the same seed; they are marked `practice: true` and
  never replace the scored result.
- Scoring is the Long Descent's (§11.6) with the daily modifier's factor.
- Rewards: **1 Guild mark** for playing the scored try, **+2** if it lands in the profile's own all-time top 10
  Daily scores (08 §13.3).
- **Streak:** consecutive days with a scored try; shown on the Daily card; achievements at 7 and 30 (§16).

---

## 13. Boss Rush (`bossrush`)

The bosses you have beaten, back to back, with a timer. Unlocked when the profile has beaten any 3 bosses.

| Rule | Value |
|---|---|
| Which bosses | every boss the profile has beaten, in act order (Mother Tallow → Ossery). Ossery is fought as phases 1–3 plus a shortened phase 4 in a fixed arena (no Falling Flood chain) |
| Kit | **Own build**: a snapshot of a chosen campaign save (level, gear, wicks, strands) — changes do not flow back; or **Guild kit**: level 30, a fixed rare gear set per class, the class's 4 recommended wicks from 03 §18. Two separate boards |
| Between bosses | a 20 s **pause room** (a lamp-post that heals **50%** health and **100%** oil, allows wick swapping but not braiding); the timer **keeps running** in the pause room — rushing it is part of the score |
| Tonics | belt is refilled to the starting count once, after boss 3 |
| Timer | starts when boss 1's bar appears; stops at the last boss's death. Splits per boss; ghost splits compare against your best run (green/red) |
| Enrage | every boss's enrage (05) is on regardless of difficulty |
| Death | ends the run; the end screen shows splits so far |
| Difficulty | any; the board is split by difficulty |
| Rewards | first full clear: 5 Guild marks and the achievement; medals per boss: gold / silver / bronze times in `data/modes/bossrush.json` (targets: gold ≈ 1.5 × the dev's best, silver 2.5×, bronze 4×) |
| Score | total time (lower is better); board key `bossrush` (§11.7) |

---

## 14. Trials (`trials`)

Hand-made challenge rooms. Each has **one rule**, a **target**, and a reward. Trials are entered through **trial
doors** in the campaign (the `trial` nodes in §6) or from the title screen's Trials list once their door has been
found. Unlocked after Act 1 (00 §12).

**Common rules:** you enter with your current character (from a campaign save) or a **Guild kit** version for
that trial (title-screen entry). Death or giving up in a trial costs nothing and puts you back at the door.
Medals: **bronze** = the target, **silver** and **gold** = tighter numbers. Rewards pay once per profile per
medal. Marks per first clear: 2–6 (08 §13.3). Slow mode records on the medal but does not block it.

| # | Trial (id) | Door | Rule | Target (bronze / silver / gold) | Unlocks / rewards |
|---|---|---|---|---|---|
| 1 | **The Rope Gauntlet** (`trial_rope_gauntlet`) | Sweeps' Loft `a1_n11` (needs grapple); after Act 2 also the Choir Loft | reach the end of a 2,600-cell rope-and-chimney course; touching the floor sends you back to the last checkpoint | finish under 150 s / 110 s / 80 s | **Chimneysweep** class (canon, 00 §7), 6 marks; gold: sweep's brush cosmetic |
| 2 | **No Oil** (`trial_no_oil`) | Guild Hall `a1_n01` (after Act 1) | your lantern holds 0 oil: pole, building and the environment only; 4 rooms of wax enemies | clear in 240 s / 180 s / 130 s | 4 marks; the `lantern_cold_iron` cosmetic; gold: +1 Guild Library slot (a "free" 5th wick in modes) |
| 3 | **Pacifist Sluice** (`trial_pacifist_sluice`) | `a3_n16` | cross a 5-chamber flooding sluice run full of maw fry and eels without killing anything (stagger and knockback allowed; an enemy killed by water you moved counts as a kill) | 0 kills and reach the end; silver under 180 s; gold under 120 s | 5 marks; Sluicewarden `hood_lockward` cosmetic |
| 4 | **The Singing Grate** (`trial_singing_grate`) | `a2_n14` | the floor is grates that open on the beat of a rat choir (1 beat = 0.75 s); cross 3 rooms without falling | 0 falls; silver under 90 s; gold under 60 s and no damage | 3 marks; the Choir music track in the title's jukebox |
| 5 | **First Flame** (`trial_first_flame`) | Candlemarket `a1_n03` (after Act 1) | only **Ember Bolt** allowed; kill 40 wax mites and drip-lings in a burning chandlery before the fire reaches you | 40 kills in 90 s / 70 s / 55 s | 2 marks; Wick library +2 slots |
| 6 | **Burn Rate** (`trial_burn_rate`) | Waxworks Cellar `a1_n06` (after Act 2) | set wood and wax alight: the meter counts cells burned | 3,000 / 6,000 / 10,000 cells in 45 s | 3 marks; an ember-trail cosmetic on the lantern |
| 7 | **Frozen Falls** (`trial_frozen_falls`) | Broken Arch `a3_n08` | climb a 900-cell waterfall using only Rime ice you make (no grapple, no planks) | top in 120 s / 90 s / 60 s | 4 marks; Rime light gets a snow-mote trail (cosmetic) |
| 8 | **Spark in the Deep** (`trial_spark_deep`) | Cistern Row `a3_n03` (after Act 3) | a flooded hall with 30 swimmers and you on a floating plank: kill all with Spark in the water without being shocked more than 3 times | 30 kills; silver under 60 s; gold with 0 shocks | 4 marks; the `relic_conductor` trinket (Spark chains +1 when you stand dry) |
| 9 | **Hooded Crossing** (`trial_hooded_crossing`) | `a4_n14` | cross 4 dark rooms of the Unlit with the lantern **hooded** the whole time; unhooding fails | reach the end; silver under 150 s; gold without being seen (no Unlit alert) | 5 marks; Moth Oracle challenge hint + `lantern_moth_glass` cosmetic |
| 10 | **Fall Upward** (`trial_fall_upward`) | `a5_n13` | a vertical course of gravity lanterns; you may place at most 4 | finish in 120 s / 80 s / 55 s | 4 marks; gravity lanterns get the "bell-bronze" cosmetic glow |
| 11 | **Overcharge Line** (`trial_overcharge_line`) | `a6_n13` | 25 targets; every cast must be overcharged **past the safe line** (a tap or a safe release fails the cast); a gutter costs 10 s | 25 targets in 120 s / 90 s / 60 s | 6 marks; the mastery glow in gold on every wick (cosmetic) |
| 12 | **Plank and Prayer** (`trial_plank_prayer`) | Drip Gallery `a1_n08` (after Act 1) | build a bridge over a 320-cell gap with at most 12 planks while wax drips burn through them | cross with ≤ 12 / ≤ 9 / ≤ 7 planks | 3 marks; Tinker `wrench_brass` cosmetic; plank kit +2 capacity in modes |
| 13 | **The Long Breath** (`trial_long_breath`) | Kell's Rest `a3_n10` | a sunken chapel with no air pockets: 3 eels to kill and a lever at the bottom; air bubbles from Tide wicks are the only breath | finish; silver under 70 s; gold without a bubble | 4 marks; Drowned Knight challenge progress shown on the door; `hood_diving_bell` cosmetic |
| 14 | **Toll of Nine** (`trial_toll_nine`) | Whisper Gallery `a5_n04` | ring 9 bells in the order of a tune you hear once; each wrong bell drops rubble | 0 mistakes; silver under 60 s; gold under 40 s | 3 marks; a bell-shaped lantern cosmetic |
| 15 | **Lamp Carrier** (`trial_lamp_carrier`) | Lamp Bands `a6_n08` | carry a lit Guild lamp (held in the off hand, no casting) up 1,200 cells of root in a gale without it going out (wind > 20 snuffs it unless you shelter behind terrain) | reach the top in 180 s / 130 s / 100 s | 5 marks; a lamp-post cosmetic set for Floodgate |

Trial rooms are built at 1 room each (template pool `trial_*`, fixed, never seeded).

---

## 15. Meta-progression: the Guild Hall

### 15.1 Where and what

The **Guild Hall** screen (title menu, 02 §7) and its in-world counterpart (Pask's desk in `a1_guild_hall`)
spend **Guild marks** (profile currency, 08 §13.3) on **permanent unlocks**. Each unlock says which modes it
touches; the campaign ones are small or cosmetic on purpose, so a returning player never trivialises a new save.

Earning (08 §13.3): Lamps 5/8/10/12/14/20 (69 per campaign), first-time bosses 3 each (18), trials 2–6 each (§14,
~60 for all bronzes), class challenges 5 each (25), Floodgate 1 per 5 waves (+3 first clear), Long Descent
1 per 10 depths, Daily 1 (+2), Boss Rush 5 first clear, NG+ relights ×(1 + 0.25n).

### 15.2 The unlocks (26)

| # | id | Name | Cost (marks) | Affects | Effect |
|---|---|---|---|---|---|
| 1 | `gh_satchel_row` | Guild Satchel | 10 | campaign, modes | start every new save with satchel row 5 (25 slots) (08 §2.1) |
| 2 | `gh_flask` | Guild Flask | 6 | campaign, modes | start with a `flask_guild` oil flask (08) |
| 3 | `gh_oil_1` / `gh_oil_2` / `gh_oil_3` | Deeper Reservoir I–III | 8 each | campaign, modes | +5% starting max oil per rank (08 §13.3) |
| 4 | `gh_mothwife_reroll` | Mothwife's Favour | 1 per use | campaign | reroll a Gamble shelf once (08 §16.5); bought in the shop, paid from marks |
| 5 | `gh_wick_library` | The Guild Library | 12 | Floodgate, Boss Rush (Guild kit) | modes may use every strand the profile has seen (Floodgate always does, §10.1; this extends it to Boss Rush's Guild kit) |
| 6 | `gh_old_habits` | Old Habits | 10 | Endless, Daily | every core starts at burn-in level 2 (03 §10) |
| 7 | `gh_endless_start_wick` | Chosen Wick | 5 | Endless | pick 1 of 3 starting wicks instead of the class's first (08 §13.3) |
| 8 | `gh_endless_depth_11` | Deep Start I | 8 | Endless (unranked board) | start at depth 11 with a level-8 character; scores go to the "Deep Start" board |
| 9 | `gh_endless_depth_31` | Deep Start II | 14 | Endless (unranked) | start at depth 31 with a level-20 character |
| 10 | `gh_floodgate_scrap` | Quartermaster's Chit | 6 | Floodgate | start with +40 scrap |
| 11 | `gh_floodgate_pump` | Hask's Pump | 8 | Floodgate | start with 1 hand pump built |
| 12 | `gh_trials_door_1` | Trial Seals I | 4 | Trials | opens trials 5, 6, 12 from the title screen before their doors are found |
| 13 | `gh_trials_door_2` | Trial Seals II | 4 | Trials | opens trials 7, 8, 13 likewise |
| 14 | `gh_tonic_plus` | Pask's Recipe | 8 | campaign, modes | +1 starting tonic |
| 15 | `gh_map_act1` | The Guild Survey | 5 | campaign | Act 1's map starts revealed (outlines only) in every new save |
| 16 | `gh_soup_card` | Brisket's Card | 6 | campaign | Soup Barge meals −10% |
| 17 | `gh_second_purse` | The Second Purse | 10 | campaign | two death purses may exist at once (§8.2) |
| 18 | `gh_bell_map` | Tamberlane's Chart | 6 | campaign | the Journal names the node of each Silent Bell you have not rung (not the room) |
| 19 | `gh_boss_practice` | The Practice Hall | 8 | Boss Rush | fight any single beaten boss unranked, with a phase select |
| 20 | `gh_daily_practice_ghost` | Yesterday's Ghost | 4 | Daily | a faint replay-ghost of your scored try during practice runs (position samples at 4 Hz) |
| 21 | `gh_cos_lanterns` | Lantern Styles (set of 6) | 3 each (18 total) | cosmetic | brass, verdigris, moth-glass, bone, bell-bronze, drowned-pearl lantern skins |
| 22 | `gh_cos_hoods` | Hood Styles (set of 4) | 3 each (12 total) | cosmetic | hood shapes for the class select (02 §9) |
| 23 | `gh_cos_class_<id>` | Class regalia (8) | 12 each | cosmetic | a full alternate outfit per class (08's class cosmetics, 3–12) |
| 24 | `gh_jukebox` | The Guild Gramophone | 4 | title screen | play unlocked music tracks on the title |
| 25 | `gh_satchel_row7` | Clink's Last Row | 2 + 4,000 pennies | campaign | allows the 7th satchel row purchase (08 §2.1) |
| 26 | `gh_iron_wick_honour` | The Snuffed Roll | 0 (earned) | profile | unlocked by finishing any campaign with Iron Wick: shows a gold border on that slot forever |

Totals: the non-cosmetic unlocks cost ~175 marks, cosmetics ~130 more. One campaign (~87 with bosses) plus
trials (~60) and some modes buys most practical unlocks; cosmetics are a long tail. (08 §19 estimated ~140; §20
notes the difference.)

---

## 16. Achievements

Profile-wide (02 §18 Journal → Achievements). Hidden ones show "???" until earned. Each is an entry in
`data/achievements.json` with an id, a check (a counter or an event), and whether it is hidden.

| # | id | Name | How | Hidden |
|---|---|---|---|---|
| 1 | `ach_first_light` | First Light | relight the Crown Lamp | no |
| 2 | `ach_six_lamps` | No Tier Left Dark | relight all six Great Lamps in one save | no |
| 3 | `ach_tallow` | Snuffed | defeat Mother Tallow | no |
| 4 | `ach_gnaw` | Choirmaster | defeat Saint Gnaw | no |
| 5 | `ach_sluicemaw` | Drained | defeat the Sluicemaw | no |
| 6 | `ach_widow` | Moth to Flame | defeat the Lampless Widow | no |
| 7 | `ach_bellfather` | Last Toll | defeat the Bellfather | no |
| 8 | `ach_ossery` | The Rain Stops | defeat Ossery Vane | no |
| 9 | `ach_cooled` | Put Out Gently | finish Mother Tallow with only Rime/Tide in her last phase (`tallow_cooled`) | yes |
| 10 | `ach_ending_a` … `ach_ending_d` | The Long Dawn / The Keeper's Rain / Lanternfall / No Tier Left Dark | see each ending (01 §11); D is hidden | D only |
| 11 | `ach_all_bells` | Thirteenth Note | ring all 12 Silent Bells | no |
| 12 | `ach_all_classes` | The Whole Guild | unlock all 8 classes | no |
| 13 | `ach_lampless` | Lampless | finish the campaign with `lowestDifficulty = lampless` (02 §10.1) | no |
| 14 | `ach_drowned` | Drowned | finish the campaign on Drowned | yes |
| 15 | `ach_iron_wick` | Iron Wick | finish the campaign on Iron Wick | no |
| 16 | `ach_no_death_act` | Clean Wick | clear any act without dying | no |
| 17 | `ach_burn_in_5` | Well Burned | get any core to burn-in level 5 | no |
| 18 | `ach_all_flames` | Seven Colours | own all 7 flames | no |
| 19 | `ach_all_charms` | Charm Case | own all 12 charms | no |
| 20 | `ach_knot_chain` | Twice Tied | trigger a knot from a knot (depth 2, `knot_twicetied`) | yes |
| 21 | `ach_gutter_100` | Burnt Fingers | gutter 100 times (profile) | no |
| 22 | `ach_overcharge_safe_1000` | Steady Hand | release 1,000 overcharges on the safe line | no |
| 23 | `ach_freeze_fall` | Ice Ladder | freeze a waterfall and climb it | no |
| 24 | `ach_steam_lift` | Hot Air | ride steam you made 200 cells up | no |
| 25 | `ach_spark_self` | Conductive | shock yourself with your own Spark in water | yes |
| 26 | `ach_drown_boss` | Water Is a Machine | kill a boss or miniboss with water you moved | no |
| 27 | `ach_rope_10km` | Swing Low | swing 10,000 m on ropes (profile) | no |
| 28 | `ach_pacifist_room` | Light Touch | leave a fight room with every enemy alive and unhurt by you | yes |
| 29 | `ach_floodgate_30` | Held the Line | clear Floodgate wave 30 | no |
| 30 | `ach_floodgate_dry` | High and Dry | clear Floodgate with the water never above h = 100 | no |
| 31 | `ach_endless_30` / `_60` / `_100` | Deep / Deeper / Bottomless | reach depth 30 / 60 / 100 in the Long Descent | no |
| 32 | `ach_floodline_lead` | Ahead of the Water | reach a milestone with the Floodline 5+ rooms behind | no |
| 33 | `ach_daily_7` / `ach_daily_30` | Keeper of Days / A Month of Wicks | Daily streak of 7 / 30 | no |
| 34 | `ach_bossrush_all` | Rush of Lamps | clear Boss Rush with all six bosses | no |
| 35 | `ach_bossrush_gold` | Gilded | gold medal on every boss in one Boss Rush | no |
| 36 | `ach_trials_all` | Trial by Everything | bronze on every trial | no |
| 37 | `ach_trials_gold` | Guild Examiner | gold on every trial | yes |
| 38 | `ach_ng_plus_1` / `ng_plus_5` | Once More Down / The Fifth Wick | finish NG+1 / NG+5 | no |
| 39 | `ach_hoarder` | Pearl Diver | hold 100 pearls at once | no |
| 40 | `ach_ferry_life` | Everyone Pays the River | pay The Ferry in max health 5 times | yes |
| 41 | `ach_pawn_ledger` | Crane's Best Customer | sell 200 items to Hollis Crane in one save | no |
| 42 | `ach_mystery_bowl` | Brave Spoon | eat 10 Mystery Bowls | no |
| 43 | `ach_all_codex` | The Lamp Ledger | read every codex page | no |
| 44 | `ach_bestiary` | Studied | reach "Studied" (50 kills) on 30 bestiary entries | no |

Unlock toast: the pixel-font centre toast (02 §11.14) in gold, `quest.complete` sound, and a line in the
Journal. Achievements never gate gameplay.

---

## 17. Data files this page implies

| File | Holds |
|---|---|
| `data/acts/act1.json` … `act6.json` | the node list, edges (with `kind: normal/hidden/locked/oneway` and `needs`), layers, template slots per node, reward hints, story beat ids, lamp-posts |
| `data/rooms/*.json` | templates (§4.4) |
| `data/rooms/pools.json` | pool id → template ids |
| `data/difficulty.json` | 02 §10.1 + §7.1's act pressure table |
| `data/modes/floodgate.json` | arena, `rise` formula constants, 30 waves, buildables, scoring |
| `data/modes/endless.json` | depth rules, biome order, scaling constants, Floodline constants, scoring |
| `data/modes/boons.json` | the 20 boons |
| `data/modes/daily.json` | the 14-slot class/wick table, the 7 weekday modifiers |
| `data/modes/bossrush.json` | boss order, pause room, medal times |
| `data/modes/trials.json` | the 15 trials (door, rule id, targets, rewards) |
| `data/guildhall.json` | the 26 unlocks |
| `data/achievements.json` | the 44 achievements |
| `data/events.json` | random event node contents |

**Act JSON shape:**

```json
{
  "id": "act3", "direction": "down", "layers": 10,
  "nodes": [
    { "id": "a3_n13", "index": 13, "layer": 7, "name": "The Market Cistern Valve", "type": "puzzle",
      "rooms": [ { "slot": "fixed", "template": "a3_market_valve" } ],
      "location": "a3_cisterns", "beat": "A3.8", "lampPost": false,
      "rewardHint": "shortcut", "choice": { "flag": "pale_kept", "options": ["drain", "keep"] } }
  ],
  "edges": [
    { "from": "a3_n13", "to": "a3_n17", "kind": "oneway", "needs": { "choice": "drain" } },
    { "from": "a3_n03", "to": "a3_n09", "kind": "hidden" },
    { "from": "a2_n09", "to": "a2_n17", "kind": "locked", "needs": { "key": "key_sluice_wheel" } }
  ]
}
```

---

## 18. Tests

| Test | Kind | Checks |
|---|---|---|
| `tests/actgraph.test.js` | node | every act has 15–18 nodes; every node reachable from node 1; the boss reachable by at least 2 distinct routes; 3–4 branching layers; every route's room count within §3.3's range; every guaranteed strand/mechanic (03 §15.2, 00 §6) sits on a pinch or hub; every locked edge's `needs` names a real mechanic or key; node names and locations exist in 01's tables |
| `tests/seeds.test.js` | node | same `runSeed` → identical room JSON after variation; changing a prop weight does not change spawn placement (per-operation streams); mirrorable rooms keep exits wired |
| `tests/floodgate.test.js` | node | `rise()` sums; no-pump run loses between waves 22 and 27 in the headless sim; 6 pumps from wave 10 never lose to water; every wave's ids exist in 05's roster |
| `tests/endless.test.js` | node | area level and multipliers at depths 1, 30, 61, 100; Floodline T(d); rest pushes back 2; chain rule (every exit lower than the entrance) over 500 seeded depths |
| `tests/daily.test.js` | node | the seed for a fixed date is stable; `dayNum mod 14` table; the scored-try flag survives a reload; practice never overwrites |
| `tests/boards.test.js` | node | board insert/sort/trim to 20; ties by date; JSON round-trip through `store.js` |
| `tests/guildhall.test.js` | node | every unlock's effect is read by the module it names (set it to an odd value and ask the module — a file-vs-constant check passes against an orphan) |
| `tests/modes.spec.js` | Playwright | start each mode from the title, play 10 s headless with a bot, quit, see the end screen; screenshot desktop + mobile |

---

## 19. Build order and cheaper fallbacks

| Order | Piece | Cheaper fallback if it runs long |
|---|---|---|
| 1 | Act JSON + map screen (02 §13.1) with node walking via exit doors | node-to-node via a menu, no door wiring |
| 2 | Room templates with sockets and the variation pipeline | chunk pick + spawn fill only; skip material swaps and dressing |
| 3 | Act 1 (18 nodes) end to end | 12 nodes: drop 05, 06, 17, 18 (bell 2 moves to 07) |
| 4 | Death purse, lamp-posts, checkpoints | — (core) |
| 5 | Floodgate | height-field water only; 10 waves then Endless Tide |
| 6 | Long Descent | Floodline as a plain countdown per room instead of a chasing depth |
| 7 | Acts 2–6 | ship acts at the 12-node minimum (the §4.2 minimum pools) and add nodes later |
| 8 | Daily, Boss Rush | Daily first (it is Long Descent + a seed); Boss Rush reuses the boss arenas as they land |
| 9 | Trials | build the 5 that unlock things first: Rope Gauntlet (class), No Oil, Pacifist Sluice, Hooded Crossing (class hint), Long Breath (class hint) |
| 10 | NG+ | type reshuffle can wait; ship "same maps, higher level" first |

---

## 20. Proposed canon changes

1. **Two node types added** to the brief's list: `hub` (the act's safe town, the only type allowed to mix in a
   lesson room) and `flood` (the one rising-water set piece per act, verdict steal 8).
2. **When the Rain stops.** 00-OVERVIEW §6 puts "The Rain stops" at the *start* of Act 6; 01-WORLD-STORY.md §9.6
   puts it at the end of Ossery's phase 3 (`cs_rain_stops`) and 00 §10 agrees ("phase 4 happens as the Rain
   stops"). This page follows 01: Act 6 is climbed in the rain and the Rain stops in the final fight. 00 §6's
   row should read "Act 6 start: Overcharge mastery, Charm slot 3; end of Act 6: the Rain stops".
3. **NG+ level cap.** 00 §9 caps the campaign at level 30. NG+ raises it to `30 + 10n` (max 80) so later cycles
   still level; Endless's cap of 99 is separate.
4. **Guild Hall totals.** 08 §19 estimated ~140 marks for all unlocks; this page's list is ~175 practical + ~130
   cosmetic. 08's numbers for the unlocks it named are kept exactly.
5. **Depth = floor.** 03 and 08 say "floor" for a Long Descent room; this page says "depth". Same unit; the UI
   says "Depth".
6. **Seal shard duplicates.** 08 §12.2 has three seal shards "one each" in three dark rooms; §6.4 adds
   duplicates in the Floating Chapel and on the Drifting Raft so no Act 4 route can miss one.
