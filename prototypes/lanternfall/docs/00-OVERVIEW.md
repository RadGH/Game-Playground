# LANTERNFALL — Design Bible (page 00: overview and canon, **v2**)

> *"The Rain has not stopped for forty years. Go down, Lamplighter. Light them again."*

This page is the **canon**. Every other page expands one part of it and must use the names, ids and numbers
fixed here. If another page disagrees, this page wins until it is changed on purpose and the change is logged in
`docs/CHANGELOG.md`. v2 applies the design review (`docs/REVIEW.md`, answering `docs/ROAST.md`); the page
editors' instructions are in `docs/EDIT-ORDERS.md`.

| Page | Covers |
|---|---|
| `00-OVERVIEW.md` | this page: pitch, pillars, owners, canon names and ids, scope, rules every page obeys |
| `01-WORLD-STORY.md` | Vessmere, districts, people, voices, story beats, cutscenes, Kindling, endings, Lingo pack |
| `02-CONTROLS-UI.md` | keys and pad, screens, HUD, map, minimap, inventory, builder UI, settings, difficulty table |
| `03-SPELLS.md` | flames, shapes, charms, knots, overcharge, burn-in, statuses, combos, reactions, resist model |
| `04-CLASSES-PROGRESSION.md` | classes, melee, attributes, derived stats, boards, levels, respec rules, player hurt rules |
| `05-BESTIARY-BOSSES.md` | monsters, AI, spawning, elites, minibosses, bosses, telegraphs, void zones, camzones |
| `06-PHYSICS-RENDER.md` | cells, materials, liquids, floods, currents, gravity bands, light, rendering, camera, art formats, perf |
| `07-TRAVERSAL-PUZZLES.md` | movement numbers, ropes, interactables, wiring gates, traps, building, puzzles, soft-lock rules |
| `08-ITEMS-SHOPS.md` | items, affixes, relics, consumables, currencies, loot, prices, the five shops |
| `09-MODES-MAP.md` | act maps, room kits use, difficulty per act, death/continue, modes, Guild Hall, achievements |
| `10-TECH-DATA.md` | files, folders, JSON shapes, room format, save format, modules, tests, tools, integration |
| `REVIEW.md` · `EDIT-ORDERS.md` · `CHANGELOG.md` · `ROAST.md` | the v1 → v2 review, its instructions, the log |

---

## 1. The pitch

**Lanternfall** is a side-scrolling action RPG drawn at the pixel level. Every pixel of the world is a
simulated cell: stone crumbles, wood burns, water pours and pools, oil floats and ignites, steam rises, frost
freezes a waterfall into a ladder. You are small: a Lamplighter a dozen pixels tall, carrying a lantern on a pole
down the side of a drowned chasm-city. You **braid your own spells** ("wicks") out of a *Flame* (element and
light colour), a *Shape* (how it travels) and *Charms* (what it does besides). Every spell is also a **coloured
light**: it lights the rain, glints off wet stone and reflects in the black water below. The game is pushing
colour back into a dark, flooded city.

## 2. Pillars

1. **Light is the story and the mechanic.** Every flame is a colour; every relit Great Lamp changes its
   district's palette and play.
2. **The world is made of stuff.** Every flame has a rule against every material; the rules are the puzzles.
3. **Build the spell, then prove it.** The Wick builder is the main progression. Gear and levels support it.
4. **Each act changes the verbs** (§6). Act 1 is easy on purpose.
5. **Readable danger.** Telegraphs, void zones and enemy eyes always light themselves. Darkness hides
   terrain, never the attack about to kill you.
6. **Small and fast.** Small player, close camera, dense rooms of 30 s to 4 min.

## 3. Owners — who decides what

When two pages touch the same fact, the owner's text is the fact and every other page **links** to it instead of
restating it. **10 owns file names and field shapes; content pages own the values in them.**

| Fact | Owner | Others must |
|---|---|---|
| Canon names, ids, scope, the ladder, finale/ending shape, save/soft-lock/thread rules | 00 | use them verbatim |
| People: NPC ids, traits, tics, voices, lines, bark limits; story beats, cutscenes, Kindling flags, endings, Lingo pack | 01 | reference `npc_*` / line ids only |
| Keys, pad, contexts, screens, HUD layout, settings, the difficulty table (`data/difficulty.json`) | 02 | never print a key table |
| Flames, shapes, charms, knots, overcharge, burn-in, **statuses**, combos, flame × material reactions, resist model | 03 | list only AI reactions (05) or item hooks (08) |
| Classes, movesets, class abilities, attributes, derived stats, boards, XP/levels, respec rules, unlock challenges, player hurt/hit-stop/contact rules | 04 | link |
| Monsters, AI, spawning, elites, minibosses, bosses (phases, attacks, telegraphs, void zones, camzones), monster resist values | 05 | link |
| Materials, cell rules, liquids, height-field floods, current zones, gravity-band cell rule, light (sources, CPU grid, tiers), rendering, camera, room transitions, art formats, perf budget | 06 | link |
| Movement numbers (`movement.json`), ropes, interactables, wiring gate kinds, traps, building, puzzles, pinned cells + Rekindle | 07 | link |
| Items, affixes, relics, consumables, currencies, loot tables, prices, shops and their quirks, respec prices | 08 | reference ids only |
| Act maps (nodes, edges, where every strand and mechanic drops), room counts, per-act curve, death/continue, modes, Guild Hall, achievements | 09 | link |
| File manifest, folders, JSON shapes, room format, save format + budgets, modules, tests, tools, debug API, playground bridges (Lingo, voices, meter, sfx, score) | 10 | link; no page keeps its own file list |

## 4. Art direction (summary; formats in 06)

- **Logical resolution 480 × 270** cells visible (16:9), integer-scaled. One cell = one art pixel. Wide view
  (640 × 360 at 1080p) in boss arenas and Floodgate, entered by a cut, never a zoom.
- **Palette:** the unlit world is a narrow band of blue-greys and wet blacks. Colour comes **only from light**.
  A relit district's ambient ramp warms (the **relight sweep**: a 3 s wave down the district).
- **Rain always** (two layers) until the Rain stops mid-Act 6. Density by act: 60 / 70 / 90 / 110 / 130 / 160.
- **Reflections** on water and wet ground; **bloom** on lights; no chromatic aberration, no screen blur.
- **The player** is 6 × 12 cells, a hooded figure with a pole-lantern lit in the selected wick's flame colour.
- **Art plan:** small sprites are **ASCII in JSON** (`data/sprites.json`, ≤ 24 × 24, 2–4 frames per animation,
  squash/stretch in code); big enemies and bosses are **assembled from parts** (each ≤ 32 × 32 ASCII, ≤ 12 parts,
  posed by code from `data/rigs.json`, each part can glow for its telegraph); gear is a palette swap plus one
  overlay per slot; Mother Tallow's body is her own wax cells; portraits are 32 × 32. Art lands in each act's
  content milestone.
- Type: our own 5 × 7 pixel font in-world; `Cinzel` / `Spectral` in menus.

## 5. Setting in one paragraph

**Vessmere** was a trading city built down the walls of the **Hollow**, a chasm a mile deep. Its light came from
six **Great Lamps**, one per tier, fed with lamp-oil by the **Lamplighters' Guild**. Forty years ago the
**Cloudwarden Ossery Vane** tried to end a drought by binding the sky with the Sky Lamp's flame. He could not let
go: the **Rain** began and never stopped, the lower tiers drowned, the Lamps went out, and things came up out of
the dark water. Only **Lanterncrown** is still lit. You are the Guild's last apprentice, sent down to relight the
Lamps and find out what keeps the Rain alive.

---

## 6. Acts and the mechanic ladder

### 6.1 Acts

| # | Act (id) | Great Lamp | Hub | Miniboss | Set piece | Boss (id) |
|---|---|---|---|---|---|---|
| 1 | **Lanterncrown & the Wax Stair** (`act1`) | Crown Lamp | The Guild Hall | — | The Melting Stair (wax) | **Mother Tallow** (`boss_tallow`) |
| 2 | **The Gutterways** (`act2`) | Gutter Lamp | The Dripmarket | Sewer-King (`mb_sewer_king`) | the Long Chain rope run | **Saint Gnaw of the Rat Choir** (`boss_gnaw`) |
| 3 | **The Sluice Ward** (`act3`) | Sluice Lamp | The Pumpworks | Drowned Lockmaster (`mb_lockmaster`) | The Spillway | **The Sluicemaw** (`boss_sluicemaw`) |
| 4 | **Blackwater** (`act4`) | Deep Lamp | The Last Derrick | Lamp-Eater Matriarch (`mb_lampeater_mother`) | The Oil Pits (fire vs light) | **The Lampless Widow** (`boss_widow`) |
| 5 | **The Bellwell** (`act5`) | Bell Lamp | The Tithe Hall | — | The Long Drop (rubble) | **The Bellfather** (`boss_bellfather`) |
| 6 | **The Cloudroot** (`act6`) | Sky Lamp | Understar Well | — | The Falling Flood | **Ossery Vane, the Cloudwarden** (`boss_ossery`) |

Acts 1–5 are descended; Act 6 is climbed. Act maps have **50 nodes** in all (9 / 9 / 8 / 8 / 7 / 9, including
two secrets), about **42 on one route**, ~85 rooms played per campaign. Node lists are owned by 09
(`EDIT-ORDERS.md` §09 gives the new ids).

### 6.2 The ladder — "start easy" made real

Each row is a Lesson room (no enemies, a physical puzzle) before any fight asks for it.

| When | New for the player | What changes |
|---|---|---|
| Start (Act 1, First Step) | walk, run, jump, wall-slide + wall-jump, auto ledge-grab, dodge roll, pole light combo, interact, **1 wick slot** (class wick 1) | a plain action platformer |
| Act 1, Candlemarket | **Wick builder** (flame + shape only), **wick slot 2**, flame **Rime**, shape **lob** | you invent your ranged attack |
| Act 1, Drip Gallery | **plank kit** (plank, brace, crate), carry/push, pole heavy + plunge/pogo, Hush | you make your own ledges |
| Act 1 end (Crown relit) | **class ability** | your class shows |
| Act 2 start | **grapple hook**, rope swinging, shape **tether** | rooms go vertical and swingy |
| Act 2, Lockhouse | levers, buttons, plates, doors, **traps as weapons**, flame **Spark** | puzzles and machines |
| Act 2, Charmwife's Niche | **Charm slot 1** (`split`), **overcharge** with gutter risk, **skill board** opens, affixes on loot | spells get modifiers |
| Act 2 (optional branch) | flame **Bile** | — |
| Act 3 | **swimming + breath**, **sluices/valves/basins**, **current zones**, flame **Tide** (Sluicewarden's dry Tide becomes wet), **wick slot 3**, **Charm slot 2** | water is terrain you change |
| Act 4 | **darkness + oil economy**, **hood**, flame **Gleam** (guaranteed), flame **Shade**, **Knots** (`on_hit`, `on_kill`), Hush's perch, the Unlit | light is finite; spells chain |
| Act 5 | **gravity lanterns + bands**, bells, **wick slot 4**, charms `echo`, `volatile` | every room is two rooms |
| Act 6 | **overcharge mastery** (one wick), **Charm slot 3**, wind; mid-act **the Rain stops** | the world falls and dries; your build at full power |

Act 1 level-ups give attribute points only (skill points bank until Act 2). Act 1 drops are plain bases.
**Act 1 grace:** in Act 1, on every difficulty, telegraph wind-ups ×1.25 and one melee attack token.

---

## 7. Classes (kits in 04)

Three are open from the start; two are unlocked by challenges. An unlocked class can be taken up at the **next
act hub's lamp-post** (same level, points refunded into the new class's spread, new kit, gear kept), in a new
game, or at once in the modes.

| Class (id) | Role | Starting wicks (slot 1 / slot 2) | Class ability (`R`) | Status |
|---|---|---|---|---|
| **Lamplighter** (`lamplighter`) | balanced caster-duelist | Ember Bolt / Gleam Ring | Beacon (`ability_beacon`) | default |
| **Sluicewarden** (`sluicewarden`) | tank, water control | Rime Wave / Tide Arc (**dry** until the Act 3 Tide lesson) | Floodwall (`ability_floodwall`) | default |
| **Tinker** (`tinker`) | builder, traps, turret | Spark Rune / Ember Lob | Turret (`ability_turret`) | default |
| **Chimneysweep** (`chimneysweep`) | agile skirmisher, rope master | Ember Arc / Spark Tether | Flue Dash (`ability_flue_dash`) | unlock: swing **2,000 m** (16,000 cells) on ropes in one save, **or** bronze in the Rope Gauntlet trial |
| **Moth Oracle** (`moth_oracle`) | light-sight, crits in darkness | Gleam Bolt / Rime Rune | Foresight (`ability_foresight`) | unlock: clear Act 4 without your lantern going out (the Widow's snuff never counts; hooding is not "out"), **or** bronze in the Hooded Crossing trial |

Every class also owns the `ember` and `bolt` strands from the start. Boards: **12 nodes** per class (04).
Parked: Ferrywitch, Bellringer, Drowned Knight.

## 8. Spells (numbers in 03)

A **Wick** = 1 **Flame** + 1 **Shape** + 0–3 **Charms** (+ 0–1 **Knot** from Act 4). Wicks cost **oil**.

**Flames (7):**

| id | Name | Light colour | Core effect | Arrives |
|---|---|---|---|---|
| `ember` | Ember | amber `#ff8a2a` | burn, ignites oil/wood/wax, boils water, melts ice/wax | start |
| `rime` | Rime | cyan `#6fe3ff` | chill → freeze, freezes water, douses fire | Act 1 |
| `spark` | Spark | white-yellow `#fff27a` | shock + chain, electrifies water, powers machines | Act 2 |
| `bile` | Bile | acid green `#8dff4a` | corrode, dissolves metal/brick, poisons water | Act 2 (optional; shop from Act 2) |
| `tide` | Tide | deep blue `#3f7bff` | soak + knockback, makes/pushes water, douses fire | Act 3 |
| `gleam` | Gleam | gold-white `#ffe6b0` | radiance, heals allies, burns the Unlit, lights longest | Act 4 (Lamplighter at start; shop from Act 2) |
| `shade` | Shade | violet `#b25cff` | drain, ignores armour, darkens | Act 4 |

**Shapes (8):** `bolt`, `arc`, `lob`, `beam`, `ring`, `rune`, `wave`, `tether`.
**Charms (8):** `split`, `bounce`, `heavy`, `swift` (Act 2) · `linger`, `seek` (Act 3) · `echo`, `volatile` (Act 5).
Only split, bounce, echo and volatile change meaning by shape. **Knots (2):** `on_hit`, `on_kill` (Act 4).
**Combos (8):** `steam_burst`, `shatter`, `electrified`, `burning_slick`, `blessed_water`, `glassblow`,
`mud_trap`, `rime_lock`. Flame × material reactions: all of them, for all 36 materials.

**Overcharge:** hold `cast` (from Act 2) to pour in up to 2× oil for up to +80% power; past the safe line the wick
may **gutter**. **Mastery** (Act 6): one chosen wick cannot gutter; move it at any lamp-post.
**Burn-in:** two tracks, per flame and per shape, 5 levels each, +3% per level (+24% at full on both).

**Statuses (owner: 03):** `burn`, `chill`, `frozen`, `numbed` (bosses instead of frozen), `thawing`, `shocked`,
`corrode`, `radiant`, `soaked` (absorbs the old `wet`), `drained`, `dazzled` (Unlit flee), `dimmed` (player
only), `staggered`, `knocked_out`. Resist is percent, −100…+100 plus `heal`; bosses are immune to at most 2 flames.

## 9. Attributes (formulas in 04)

**Might**, **Wick**, **Draught**, **Nerve**, **Knack**. +3 attribute points and +1 skill point per level. Level cap
30 in the campaign; the Long Descent goes past it.

## 10. Monsters and bosses (owner: 05)

**Monsters (30):**

| Act | Ids |
|---|---|
| 1 | `wax_mite`, `soot_pigeon`, `dripling`, `tallow_hound` |
| 2 | `gutter_rat`, `rat_chorister`, `rope_scuttler`, `fatberg` |
| Knell (Acts 2–6) | `knell_novice`, `knell_hookman` (from Act 2), `knell_lampbreaker`, `knell_maulbearer` (from Act 5) |
| 3 | `maw_fry`, `sluice_eel`, `sluice_crab`, `drowned_lockkeeper` |
| 4 | `unlit_creeper`, `unlit_hound`, `unlit_stalker`, `unlit_wickthief`, `oilback`, `lampeater` |
| 5 | `clapperling`, `tumbler`, `echo_bat`, `bronze_sentinel` |
| 6 | `stormgull`, `rainwraith`, `rootgnarl`, `hailstone_golem` |

**Elite modifiers (8):** `mod_wickfed`, `mod_rimebound`, `mod_stormcalled`, `mod_blighted`, `mod_ironhide`,
`mod_swift`, `mod_splitting`, `mod_relentless`. Elites get a Name Forge name plate.

**Minibosses (3):** The Sewer-King (Act 2, the Crank Room), The Drowned Lockmaster (Act 3, the Three-Lock House),
The Lamp-Eater Matriarch (Act 4, the Wick Loft).

**Bosses (6):** every attack telegraphed (lit part + sound, ≥ 250 ms, big attacks ≥ 700 ms); each has at least one
**void zone** (lit rim, ≥ 500 ms warm-up, damage in 4 ticks per second, never on the entry frame); transitions heal
the player 20%; counters are positive (a weakness), never "your build is wrong here".

| Boss | Arena | Phases | Gimmick |
|---|---|---|---|
| Mother Tallow | the Tallow Chapel | **2** (1,500 HP; her third phase only on Lampless and in Boss Rush) | a candle-woman who melts; her wax hardens into terrain; molten pools are void zones |
| Saint Gnaw of the Rat Choir | the Gutter Cathedral | 3 | a rat-saint conducting a swarm; rope arena; plague puddles |
| The Sluicemaw | the Great Reservoir | 3 | a colossal pike; the arena floods and drains; work sluice levers mid-fight |
| The Lampless Widow | the Moth Nave | 3 | a moth-spider that eats light and speaks in stolen voices; weak to bolts and lobs in phase 3 |
| The Bellfather | the Bellwell Bottom | 3 | a bell automaton; tolls flip gravity in bands shown on screen |
| Ossery Vane | `a6_storm_eye` | **4** | P1–P3 in the storm (Rain Mantle 40%), P4 dry after the Rain stops (§12) |

## 11. People, Kindling and endings (owner: 01)

**NPCs (14):** `npc_aldra` (Lampwarden Aldra Crake), `npc_odile` (Odile Pennywax), `npc_hollis` (Hollis Crane),
`npc_seld` (Brother Seld), `npc_pim` (Pim Rooke), `npc_brisket` (Mother Brisket), `npc_nell` (Nell Gutterby),
`npc_wenna` (Old Wenna), `npc_voss` (Sluicemaster Hendry Voss), `npc_unna` (Sister Unna of the Pale),
`npc_mothwife` (the Mothwife), `npc_marl` (Deacon Marl), `npc_merrit` (Merrit Vane), `npc_corvin` (Corvin Crake).
Plus `npc_hush` (Hush the lanternmoth, companion) and `narrator` (the Lamp Ledger). Only Nell can die.

**Kindling** is the only karma counter. **8 flags**, each with an NPC hint line before its choice and listed in the
Journal's "People you could still help":

| Flag | Act | How |
|---|---|---|
| `tallow_cooled` | 1 | ask Seld, then finish Mother Tallow with Rime or Tide |
| `pim_trusted` | 1 | let Pim carry a lantern post |
| `hollis_lantern` | 2 | give Hollis his brother's lantern (Rat-Pipe Warren) instead of selling it |
| `pale_kept` | 3 | keep the Market Cistern flooded (Unna asks) |
| `nell_alive` | 4 | help Nell's last hunt in Stilt Town |
| `widow_mercy` | 4 | finish the Widow with Gleam (the Mothwife asks) |
| `knell_spared` | 2–5 | spare or knock out 10 Knell in all (Marl names it as his deal in Act 5; surrenders from Act 2 count) |
| `corvin_freed` | 6 | free Corvin from the root |

Also tracked: `knows_keeper_rule` (Pim's letter in Act 5, or Merrit in Act 6 — always obtainable).

**Endings (3):** **A "The Long Dawn"** (Ossery lets go) · **B "The Keeper's Rain"** (you hold the tether) ·
**C "Lanternfall"** (you take the flame). Ending D is parked.

## 12. The finale (one version)

1. `a6_n05` **The Last Wall** — lamp-post; the rim montage (living NPCs call up, up to 15 lines).
2. `a6_n06` **The Storm's Eye** — Ossery P1–P3 in the rain. Rain Mantle 40%, dropped for 5 s by any Ember, Rime or
   Shade counter-hit. He copies your flame colour for his next attack (a telegraph, not a theft).
3. `cs_rain_stops` (≤ 12 s) — drops hang, fall, silence; the root lets go of every lake it holds; control returns
   mid-fall.
4. `a6_n07` **The Falling Flood** — 3 forced rooms: fall down the root's inside as its lakes pour past
   (height-field water, ≤ 60k awake liquid cells).
5. `a6_n08` **The Dry Root** — 2 rooms: climb back up a dry, collapsing root; Ember finally burns cloudroot.
6. `a6_n09` **The Dry Eye** — P4 in the same arena, now dry and crumbling (the "last cloud" void zone).
7. **At 10% health** the fight freezes into three prompts you walk to (01 §11.2):
   **Take the flame** (always) → C · **Hold the tether** (needs `knows_keeper_rule`, reached by grapple) → B ·
   **Ask him to let go** (always shown; succeeds only with `kindling ≥ 5` and `knows_keeper_rule`) → A; on failure
   Ossery answers with a fixed line and the prompt greys out.
8. Checkpoint: once the Storm's Eye is won, a death in n07–n09 restarts at the top of n07.

## 13. Rules every page obeys

- **Save rule.** `localStorage` through `shared/store.js` (namespace `lanternfall:`). **Prefab state persists**
  (levers, gates, doors, chests, lamp-posts, broken wall groups, killed placed enemies, built parts as a part
  list); **raw cell changes do not** (burns, melts, moved water, frozen falls reset on re-entry). Anything a puzzle
  must remember is a prefab. Budgets: slot ≤ 64 KB, profile ≤ 16 KB, Long Descent run ≤ 16 KB, 3 slots + 1 backup
  each, ≤ 420 KB total, checked by a max-save test. IndexedDB only if that estimate ever passes 1 MB.
- **Soft-lock rule.** Puzzle-critical cells are `PINNED` (the grid flag) and drawn with a faint **brass rim**.
  Every puzzle, lesson, flood and trap room has a free **Rekindle** post at its entry (the room streams back to its
  template + saved prefab state; killed enemies stay dead), and the pause menu offers "Rekindle this room" whenever
  no fight is live. `room-check` fails a puzzle whose solution script any single flame on an unpinned cell can
  break. Building refuses to seal you in.
- **Single thread.** Sim, AI, spells, ropes, talk and audio share the main thread. No Worker, no
  `SharedArrayBuffer`. Measured (headless, software GPU): 1024 × 544 room, 56k water + oil/sand/fire/rain =
  1.4–1.8 ms sim per tick, 0.5 ms render CPU. Budget p95 per frame: sim ≤ 4 ms, AI + spells + ropes ≤ 3 ms, render
  CPU ≤ 2 ms, talk + audio ≤ 1 ms. **No scene holds more than 60,000 awake liquid cells**; all big water is
  height-field water with a thin real-cell band (≤ 8 rows).
- **Light.** One CPU light grid (1/8 resolution) is the gameplay truth. Tiers: `dark` < 0.2, `dim` 0.2–0.5,
  `lit` ≥ 0.5, `bright` ≥ 0.8. `lightTier` counts all light; `ambientTier` leaves out the player's own lantern.
  Room floor 0.08.
- **Traps hit anything**, enemies included. Enemies are lured by thrown lights and noise.
- **Hubs are sanctuaries**: no building, spells change no cells, NPCs ignore damage.
- **Music.** The rain is the score: a procedural layer on the sfx engine (per-act drone, Guild bell motif, a voice
  added per relit Lamp, boss pulse per phase, silence when the Rain stops). No vendored music, no jukebox.
- **Room building.** ~55 hand-authored rooms (10 §6 format, as built) + 6 room kits. Reachability is an error.
  Every puzzle has a verb-level solution script.
- **No module without a door.** Every milestone leaves its work reachable from the title screen; `reach-check`
  fails on any unreachable module, unloaded data file or unused id.

## 14. Shops, currencies, difficulty, modes

**Shops (5; quirks in 08):**

| Shop (id) | Keeper | Sells | Quirk |
|---|---|---|---|
| **Wick & Tallow** (`shop_wick`) | `npc_odile` | strands, lamp oil | prices drop when the district's Lamp is relit; she tastes and names your wicks (dish-name rule), free, any visit |
| **Crane's Pawn** (`shop_pawn`) | `npc_hollis` | anything, build parts, scrap, tempering | buys anything; remembers every sale (Lingo memory) and prices by his opinion of you |
| **Brisket's Soup Barge** (`shop_soup`) | `npc_brisket` | meals (timed buffs) | the menu rotates each visit; the mystery bowl can be anything |
| **The Mothwife's Gamble** (`shop_gamble`) | `npc_mothwife` | sealed lanterns (random gear) | a sealed lantern's glow hints its rarity; its first stall is the underwater **Drowned Market** (Act 3, kept by `npc_unna`, priced in pearls) |
| **The Ferry** (`shop_ferry`) | `npc_wenna` | fast travel, map reveals, respec | pays in coin **or max health** (debt capped at 20%, refunded at each Great Lamp) |

**Currencies:** `pennies` (lose 25% as a recoverable purse on death), `pearls` (underwater), `marks` (Guild marks,
profile-wide). Scrap is a material item.

**Difficulty (table in 02):** `wicklit`, `lamplighter` (default), `lampless`; **Iron Wick** is a one-life toggle.
`drowned` is parked.

**Modes (detail in 09):**

| Mode (id) | What | Unlocked |
|---|---|---|
| **Campaign** (`campaign`) | 6 acts, branching act maps, story | start |
| **Floodgate** (`waves`) | hold a lit Lamp for 15 waves while the water rises; build between waves; roster from acts reached | after Act 1 boss |
| **The Long Descent** (`endless`) | endless seeded descent from room kits, a floodline chase, scaling enemies, local board | after Act 2 boss |
| **Daily Wick** (`daily`) | a Long Descent flag: seeded daily, fixed class and wick, one scored try, a share line | after Act 2 boss |
| **Boss Rush** (`bossrush`) | beaten bosses back to back with splits; full Tallow | after any 3 bosses |
| **Trials** (`trials`) | `trial_first_flame`, `trial_no_oil` (Act 1), `trial_rope_gauntlet` (Act 2), `trial_pacifist_sluice` (Act 3), `trial_hooded_crossing` (Act 4) | after Act 1 boss; each door needs its act's mechanic |

Meta: 10 Guild Hall unlocks, 20 achievements, no NG+.

## 15. Built from the playground

| Piece | Used for |
|---|---|
| `lingo/` (+ `lingo/data/packs/lanternfall.json`) | every NPC line, haggling, boss openers/phase lines, barks, hub chatter |
| `voice-lab/` + `shared/voices.js` | NPC, boss and Narrator voices; babble for rats and moths. Seven roles are **added** (`elder`, `merchant`, `priest`, `child`, `cultist`, `brute`, `stormcaller`); nothing existing changes |
| `meters/` | the **Ledger**: damage/healing/taken per source (each wick, each combo, "The Hollow" for traps and the world), per room and per run |
| `sfx/` | every sound by logical id, and the audio context/buses the procedural score rides on |
| `shared/` | `store.js` saves, `tooltip.js`, `format.js`, `ui.js` rng |
| `namegen/` | elite and champion name plates |

## 16. Non-goals

- No 3D, no Three.js. WebGL2 over a cell texture; Canvas2D is a flat-colour debug view only.
- No online anything; boards are local.
- No third-party IP in player-facing text (playground rule 9).
- **Desktop + gamepad only.** Phones get a clear "desktop recommended" card; title and menus still pass a
  390 px layout test.
- Visual polish **is** a goal here: the brief asks for satisfying physics, rain, colour and reflections.

## 17. Parked

Everything cut from v1 is kept, not deleted: the master list is `REVIEW.md` §(c) "Parked list", and each page
holds its own cut text in a **"Parked (v2)"** appendix at its end. Bring the list up when the ship scope is done.
