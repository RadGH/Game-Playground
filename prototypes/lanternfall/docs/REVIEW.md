# LANTERNFALL — Review resolution (lead designer)

> Answers `docs/ROAST.md` (R1–R92) against the canon v1 bible (`00`–`10`) and the engine already built
> (commits `1080613`, working tree 2026-09-26). The result is **canon v2** in `00-OVERVIEW.md`, logged in
> `CHANGELOG.md`, with page-by-page instructions in `EDIT-ORDERS.md`.
>
> Rule used: take the roast's fix unless it conflicts with the user's brief or with something already built.
> Where it does, the decision says so ("Accept-modified") and why.

**Built facts I did not reopen:** the cell world (`js/world/*`: grid, cellsim, thermal, liquids, collide, decor,
roomload, rain), the WebGL2 pipeline (`js/render/*`), the core (`rng`, `bus`, `loop`, `math`, `input`, `data`),
`data/materials.json` (36 materials, ids fixed), `data/movement.json` (07 §2.18 numbers), `data/legend.json`,
`data/themes.json`, the room format of 10 §6 (both examples compile). Measured on headless Chromium with a
software GPU: a 1024×544 room with 56k water cells plus oil, sand, fire and rain costs **1.4–1.8 ms of sim per
tick** and **0.5 ms of render CPU**; 20–150 chunks awake.

---

## (a) Disposition of every finding

**Legend:** **A** = Accept as the roast wrote it · **AM** = Accept-modified (the change is stated) · **R** = Reject.

### Critical (R1–R14)

| # | Finding | Call | Decision |
|---|---|---|---|
| R1 | Finale written three ways | **AM** | One shape. 09's node chain wins, but moved earlier so R40 is also met: `a6_n06` **The Storm's Eye** (Ossery P1–P3, in rain) → `cs_rain_stops` → `a6_n07` **The Falling Flood** (3 rooms, forced) → `a6_n08` **The Dry Root** (2 rooms, dry world, the root burns) → `a6_n09` **The Dry Eye** (P4 + final choice, same arena as the Storm's Eye after the storm, platform crumbling). 05 §24.8's 8 s in-arena cinematic becomes `cs_rain_stops` (≤ 12 s, then control returns mid-fall). The Rootwarden "lever route" line is deleted with the Rootwarden (parked). Arena id `a6_storm_eye` everywhere. Checkpoint: after the Storm's Eye is won once, a death in n07–n09 restarts at the top of n07. |
| R2 | Ending chosen three ways | **A** | 01 owns the ending. At 10% in P4 the fight freezes into 01 §11.2's three physical prompts. **Kindling is the only karma counter** (8 flags, list in 00 §11). 05's Plea/death branch is deleted; the Knell `mercy` counter becomes progress toward the Kindling flag `knell_spared`; `vane_journal_*` pages stay as lore with no ending input. |
| R3 | Terrain saved and not saved | **A** | Canon save rule (00 §13): **prefab state persists** (levers, gates, doors, chests, lamp-posts, broken `breakable_wall` groups, killed placed enemies, built parts as a part list), **raw cell changes do not** (burns, melts, moved water, frozen falls reset on re-entry). Anything a puzzle must remember is a prefab. |
| R4 | Five schema dialects | **A** | 10 owns file names and field shapes; content pages own values. 10 §5.0 gets the one manifest (listed in `EDIT-ORDERS.md` §10); every other page deletes its file list and links to it. Examples in 10 are copied from the owning page. Resist is percent; rarity `fine`; no `charm_ring` slot. Rooms live in `rooms/`; tests in `tests/unit` + `tests/e2e` (both already exist). |
| R5 | Two wiring systems | **A** | 10's action model (`wires: [{from, to, do, when}]`, actions `open/close/toggle/drain/fill/say/spawn/fire`), plus 07's gate list as `logic` kinds (`timer`, `latch`, `toggle`, `counter`, `sequence`, `compare`, `any_of`), with 07's type names (`sluice_gate`, `plate`, `grapple_point`, `trap_*`). Timed door default **4 s**. 07 §6.4 is rewritten in 10's syntax. |
| R6 | Is sand solid? | **A** | Already built: powders are solid for entities, depenetration stops burial traps, loose top layers slow ×0.7; step-up 2 walk / 3 run / 4 air (`movement.json`). 10's `collide.test.js` numbers follow. |
| R7 | Content volume | **AM** | Ship scope in (c) below. Slightly above the roast's column on nodes (50 incl. 2 secrets, 42 on a route) and NPCs (14), because the brief asks for a branching multi-act map and hubs are where Lingo shines (R82); the extra rooms are covered by room kits (R8). Everything cut goes to the parked list, not the bin. |
| R8 | ~250 rooms cannot be authored | **A** | ~55 hand-authored rooms (hubs, lessons, puzzles, events, arenas, set pieces, trials) + **6 room kits** (`fight_small`, `fight_tall`, `shaft`, `bridge_gap`, `flooded_hall`, `corridor_run`) that emit 10 §6 JSON for fight nodes. Reachability is an **error**, found by a bot that uses the real `movement.json` and the act's unlocked verbs. Every puzzle has a verb-level **solution script** (R49). |
| R9 | ASCII sprites for everything | **A** | Art plan in 00 §4 / 06 §25: small sprites ASCII in `data/sprites.json` (≤ 24×24, 2–4 frames, squash/stretch in code); big enemies and bosses **assembled from parts** (each part ≤ 32×32 ASCII, ≤ 12 parts, rig in `data/rigs.json`, per-part telegraph glow); gear = palette swap + one overlay per slot; Tallow's body is her own wax cells. Art lands inside each act's content milestone, and M14 builds the part pipeline. |
| R10 | Physics puzzles soft-lock | **A** | Three rules: (1) puzzle-critical cells carry the grid's existing `PINNED` flag, drawn with a faint **brass rim** (the legend's `%`/`=` already make them); (2) a free **Rekindle** post at the entry of every puzzle, lesson, flood and trap room, and a pause-menu "Rekindle this room" when no fight is live; (3) `room-check` fails a puzzle room if any single flame applied to any unpinned cell on the solution path breaks its solution script. |
| R11 | Performance unproven, no escape valve | **AM** | The numbers are now measured (above) and go into 06 §20. **Single thread is canon**: no Worker, no `SharedArrayBuffer` (GitHub Pages cannot send the headers). Cap by design: **≤ 60,000 awake liquid cells** in any scene; every big water (Floodgate, Long Descent floodline, Sluicemaw reservoir, Spillway, Falling Flood) is **height-field water with a thin cell band** (≤ 8 rows of real cells at the surface). A real-laptop run is added to M39 as a check, not a gate: the headless numbers already have a 2× margin. |
| R12 | Currents need a velocity the sim lacks | **A** | Authored **current zones** (`current` thing: rect, vector, strength, optional wire) push entities, floats and loose cells. Cell water is cosmetic for flow; gameplay flow is zones. Dynamos are parked; anything that reads flow reads a zone or a basin's drain rate. |
| R13 | Gravity bands vs scan order | **A** (option a) | Bands affect **entities, fragments, particles and rain only**. Cells inside an active flipped band are **held** (not simulated) until it flips back: water hangs in the air, which is a better image than a buggy up-fall. Bands snap to 8-cell rows. |
| R14 | Music specified nowhere | **A** (option a) | **The rain is the score.** A procedural layer on the sfx engine (`js/audio/score.js`, `data/score.json`): per-act drone, a Guild bell motif, each relit Great Lamp adds a voice to its district's drone, a boss pulse that tightens per phase, silence when the Rain stops. No vendored tracks. The jukebox is cut. |

### Major (R15–R51)

| # | Finding | Call | Decision |
|---|---|---|---|
| R15 | Four difficulty ladders | **AM** | 02's ids (`wicklit` / `lamplighter` / `lampless`) with 05's enemy numbers, in one `data/difficulty.json`; Iron Wick is a one-life toggle. `drowned` is parked. Ending C's hard mode becomes a cosmetic. Lampless also adds Mother Tallow's third phase (R42). |
| R16 | Overcharge button and timing | **A** | Hold `cast` to overcharge (02). Unlocks at **Act 2, the Charmwife's Niche**, with Charm slot 1, gutter roll on from the first charge. `R` is no longer the overcharge modifier (it becomes the class ability); the "Overcharge needs a key" accessibility option stays, bound to hold `Shift`+`cast`. All four cross-references are fixed. |
| R17 | Mastery means three things | **A** | "One **wick** is mastered: it cannot gutter and holds full charge 2.0 s." Moved at any lamp-post for free. "Charm slot" and "steps" wording deleted. |
| R18 | Key map collides | **AM** | 02 owns keys. Final: `cast` mouse left / RT, `pole` mouse right / West, `dodge` `Q` / East, `class_ability` `R` / tap LB, `inspect` hold `Tab` in play / hold View, `build_mode` `G`, `wick_builder` `B`, `grapple` `F` / RB, `hood` `Y`, belt `Z X C V`, `quick_heal` `H`, `character` `P`, `skills` `K`, `journal` `J`, `ledger` `L`, `map` `M`. In build mode (its own context) `1`–`8` pick parts and the wheel rotates 45°. `js/core/input.js` (built with attack/cast swapped and different screen keys) is re-pointed at `data/bindings.json` in M5. Every key table outside 02 is deleted. |
| R19 | Build mode speed/grid/rotation | **A** | 07 owns building: full speed, 4×4 grid, 45° steps, 07's part sizes (plank 24×2 for 2 scrap). 35% slow-time is an accessibility toggle only (default off on every difficulty). |
| R20 | Statuses defined twice | **A** | 03 owns statuses. `wet` merges into `soaked`; 03's numbers win; `dazzled` is added to 03; 05 lists only AI reactions. Canon list in 00 §8. |
| R21 | Resistances break their rules | **A** | 03 allows `weak2` (−100) and `heal` explicitly; bosses immune to at most 2 flames; one format (percent, −100…+100 plus `heal`). |
| R22 | Boss voices differ | **A** | 01 owns voices and lines (stolen voices for the Widow stay). 05 keeps mechanics and references line ids. |
| R23 | Voice roles do not exist | **AM** | One reviewed change to `shared/voices.js` in M10, **add-only**: `elder`, `merchant`, `priest`, `child`, `cultist`, `brute`, `stormcaller` (7, not 12). Everything else maps onto existing roles (Nell `ranger`, Voss `mage`, Unna `cleric` + underwater fx, Mothwife `mage` + fx). Emberveil and Farhold tests must stay green. |
| R24 | Shopkeepers are two people | **A** | 01 owns people (only the 25 real Lingo traits and the 14 real tics). 08 references `npc_*` ids only. |
| R25 | Odile names spells five ways | **A** | 08's deterministic dish-name rule makes the name; 01's `spell_taste` pool makes her comment; offered any time at her shop, free; one intent id `odile_names_wick`. |
| R26 | Crane's memory is two systems | **A** | Lingo relation `opinion()` drives mood; memory type `sold_item`, recall intent `pawn_recall`; 08's price formula reads `opinion()`; 08's mood table and 3-step haggle are deleted. |
| R27 | Strand sources disagree; broken lesson | **A** | 09's node table is the source of truth for where every strand and mechanic drops; 03 §15.2 becomes a link. The Candlemarket lesson gives **Rime and lob** and teaches two shapes. The old P1-6 Spark lift moves to Act 2 (Spark is now an Act 2 flame). |
| R28 | Sluicewarden starts with Tide | **A** | Sluicewarden starts with **Rime Wave** and a **dry Tide Arc** (Guild-braided: it pushes, soaks and knocks back using water that already exists, cannot create water cells) until the Act 3 Tide lesson wets it. |
| R29 | Moth Oracle challenge impossible | **A** | 05's scripted exemption: the Widow's snuff never counts. 04's 2 s rule and its test are deleted. |
| R30 | Five classes you rarely play | **A** | Ship **3 + 2**: default Lamplighter, Sluicewarden, Tinker; unlockable Chimneysweep and Moth Oracle. An unlocked class can be taken up at the **next act hub's lamp-post** ("A new Lamplighter answers the call": same level, points refunded into the new class's spread, new kit, gear kept) or in a new game; modes can pick it at once. Ferrywitch, Bellringer, Drowned Knight parked. |
| R31 | Twelve shops | **AM** | Five shops: `shop_wick`, `shop_pawn` (absorbs Scrapwright: parts, scrap, tempering), `shop_soup`, `shop_gamble` (its first stall is the underwater **Drowned Market** in Act 3, kept by Sister Unna, priced in pearls), `shop_ferry`. Bell Tithe and the four roaming shops parked. Every quirk the brief asked for survives. |
| R32 | Too many item knobs | **A** | 5 slots (`lantern`, `weapon`, `coat`, `boots`, `trinket`), 12 affixes scaling with item level, 8 relics that touch spells or the world, no sets, tempering only. Affixes appear from Act 2 (Act 1 drops are plain bases). |
| R33 | Canvas2D as a second renderer | **A** | Built fact: Canvas2D is a flat-colour debug/test view. No parity specs. A "needs WebGL2" card otherwise. |
| R34 | NG+×5, 26 unlocks, 44 achievements, 15 trials | **A** | 5 trials, 10 Guild Hall unlocks, 20 achievements, no NG+. The rest is in the parked list. |
| R35 | Act 1 is the busiest act | **AM** | Act 1 = move, run, jump, wall-jump, auto ledge-grab, dodge roll, pole combo; one wick → two (Rime + lob at Candlemarket, no charms); plank kit + heavy/plunge late in the act. **Dodge stays from the start**: the brief asks for challenging telegraphed combat and the roll is its only defence verb. Overcharge, charms, affixes and the skill board move to Act 2; Act 1 level-ups give attribute points only (skill points bank). |
| R36 | Act 4 oil economy has no teeth | **A** | In the **dark** ambient tier (from Act 4) oil regen stops and the lantern burns **2.5 oil/s** base (item-dependent, Draught trims up to 30%); hooded ×0.25. The Guild flask holds 2 × 40 oil and refills **only at lamp-posts**; `lamp_oil` stacks to 10; oil blobs 10% (standard) / 25% (heavy, elite). Melee's +1.5 oil per hit stays: the pole is the skill answer. 08's "oil spend share 20–30% in Act 4" becomes the sim target. |
| R37 | Spell table fails its own rule | **A** | New shape numbers (03 owns): ring ×0.90→**1.30**, oil 14→**10**; arc ×1.40→**1.10**, oil 6→**8**; beam 0.45→**0.30** per tick, 18→**20** oil/s; wave ×1.10→**1.25**; tether: max one tick per enemy per 0.5 s, **1 oil/s upkeep** while it exists, default life 30→**12 s**. The sim gains a **utility score** column (cells changed, water moved, doors opened) so utility shapes are not flagged dead. |
| R38 | Burn-in punishes experiments | **A** | Burn-in is two tracks, **per flame** and **per shape**, 5 levels each, +3% per level (total still +24%), thresholds 200 / 600 / 1,500 / 3,500 oil per track. A new pairing starts half-trained. |
| R39 | Bell Tithe refuses everyone | **AM** | The Tithe is parked, so the bug goes with it. If it returns: only badge-marked Knell count and refusal at 60. Its idea lives on as Marl's deal (`knell_spared`). |
| R40 | Act 6's change is in the last fight | **AM** | The Rain stops **mid-act** after the Storm's Eye (not at the Last Wall, which stays the rim montage). The last third of Act 6 (Falling Flood, Dry Root, Dry Eye) is the dry, falling world: held water pours, cloudstuff dissolves, Ember burns the root, rain-fed tricks stop. P4 keeps the "last cloud" beat. |
| R41 | Bosses invalidate your build | **A** | Positive counters only: Widow P3 takes **+25% from bolt and lob** (no healing from lingering shapes); Ossery's Rain Mantle is **40%** and drops for **5 s** after any Ember, Rime or Shade counterplay hit; his wick-steal is replaced by "copies your flame colour for his next attack" (a telegraph, not a theft); Bellfather arena uses wide view and every band shows its state on screen. |
| R42 | Tallow is not an Act 1 boss | **A** | Campaign Tallow on Wick-lit and Lamplighter = P1 + P2, **1,500 HP**, no grab, no Last Pour, wax wave telegraph **1,800 ms**. Her full three phases run on Lampless and in Boss Rush. |
| R43 | Floodgate is a water puzzle | **A** | Enemy area level = player level + floor(wave / 5); waves draw only from acts the profile has reached; **15 waves**. |
| R44 | Hidden rules everywhere | **A** | Keep all flame × material reactions (pillar 2). Charm changed-meanings cut to 4 (split, bounce, echo, volatile). Combos cut to the 8 visible ones (steam burst, shatter, electrified water, burning slick, blessed water, glassblow, mud trap, rime-lock), each taught once with a codex entry and a room. |
| R45 | CPU and GPU disagree on light | **AM** | A **CPU light grid at 1/8 resolution** (same light list, same falloff constants, same opaque test as the shader) is the only gameplay truth. The built GPU light map keeps drawing (not undone). An e2e spec reads the GPU map back once at 1/8 (async, test only) and asserts tier agreement on ≥ 95% of tiles. |
| R46 | Light thresholds disagree | **A** | One tier table (06 §14.7): `dark` < 0.2, `dim` 0.2–0.5, `lit` ≥ 0.5, `bright` ≥ 0.8. Everything reads a tier. Room floor 0.08, tested by the dark-screenshot spec. Two readings: `lightTier` (all light) and `ambientTier` (without the player's own lantern: oil economy, hood). |
| R47 | `localStorage` too small | **AM** | Built fact: `localStorage` through `shared/store.js`, with **budgets** (slot ≤ 64 KB, profile ≤ 16 KB, Long Descent run ≤ 16 KB, 3 slots + 1 backup each, ≤ 420 KB total) and a max-save size test. R3 keeps rooms small; Lingo memories cap at 24 per NPC. IndexedDB only if that test's estimate passes 1 MB. |
| R48 | Verlet rope wrapping jitters | **A** | Player's hook = wrap list (segment to the last wrap point, add at corners, remove on unwind). Verlet stays for level ropes and tethers only. |
| R49 | Frame-exact replays break | **A** | Replays only for determinism (same log → same hash). Puzzle tests are **solution scripts** in verbs (`goto`, `interact`, `castAt`, `build`, `waitFor`) run by the path-finding bot. |
| R50 | 150 ms settle impossible; no transitions spec | **AM** | No offline cell caches: the compiler places liquids already level and powders on support, and `room-check` fails any room that needs more than **30 ticks** to go quiet. Transitions (06): 0.25 s fade out, load, 0.25 s fade in; followers arrive at the entry after 1.5 s with a sound cue; a room that starts mid-flood loads with its height-field level. |
| R51 | Traps mostly hurt you | **A** | Every trap hits anything in it, enemies included. Tag `trap` on 2–3 rooms per act from Act 2 whose intended win is a trap; the Act 2 Lockhouse lesson teaches it. Enemies are **lured** by thrown lights and noise (brainstorm B5). Trap kills are their own Ledger source. |

### Minor contradictions (R52–R72)

| # | Call | Decision |
|---|---|---|
| R52 | **A** | 1 m = 8 cells. Chimneysweep's 2,000 m = 16,000 cells. |
| R53 | **A** | 07's rule for the player (safe fall 160 cells, 5% per 20 over, cap 60%, never lethal), already in `movement.json`. Monsters keep 05's 60. |
| R54 | **A** | 07 owns movement: coyote 0.10 s, buffer 0.12 s (built); 10's example rooms retuned to the built jump. |
| R55 | **A** | 04 owns melee frame data and the `subduable` tag; 07 keeps only tool uses; pogo 24 cells. |
| R56 | **A** | 04 owns class movement; 07 §2.16 deleted. |
| R57 | **A** | Everyone wall-jumps from the start; Chimneysweep gets wall-run. |
| R58 | **A** | 08's lantern item value is the radius; 06 multiplies by oil % in Act 4; hood 18. |
| R59 | **A** | Rain density by act: 60 / 70 / 90 / 110 / 130 / 160 (0 after the Rain stops). |
| R60 | **AM** | 06 owns the list, which is **built and fixed at 36**. `lampstone` = the `PINNED` flag with the brass rim; cracked / rotten / crust = the legend's `cracked` flag (halves cell life, built); slag → `rust`, gravel → `rubble`, soot → `ash`, plank/brace wood → `plank`, fuse → a `rope` run with an end probe, frost → `ice` skin, flesh not needed (corpses are entities). `tar` parked. New ids, if ever needed, append from 36. |
| R61 | **A** | 03's compiled-program design; 10 lists its files. |
| R62 | **A** | 05 owns AI; 10 lists files only. |
| R63 | **A** | One bark table in 01: 6 s per enemy, 1.5 s global, room cooldown 6 s, max 2 enemy bubbles, max 3 voices. |
| R64 | **AM** | 1 rotating backup per slot (budget, R47); meter history 50 rooms. |
| R65 | **A** | Class pick before the intro; Aldra hands over *a* pole-lantern. |
| R66 | **A** | Fix both examples (lesson rooms never spawn; `drip_rat` → `gutter_rat`; `weirwarden_ashe` → `npc_voss`); the "examples compile" test also runs `room-check`. |
| R67 | **A** | Covered by R7/R8. |
| R68 | **A** | Delete 09 §3.3's corrupted duplicate table. |
| R69 | **AM** | Silent Bells are parked with the Bellringer, so the clapper-key question goes away. |
| R70 | **AM** | One Drowned Market, one stall, Sister Unna speaks (formant + underwater fx); it is the Mothwife's pearl shelf (R31). |
| R71 | **A** | Scroll of Rebraiding cut. |
| R72 | **A** | Boss transitions switch to wide view by a cut, never a zoom. |

**The unnumbered small items after R72** (all **A**): no Dunmere, Wickwright, Carillon or Rootwarden fights ship (parked); the Act 3 miniboss is renamed **The Drowned Lockmaster** (no clash with Cantor Ebb, who is parked anyway); Fennick the peddler parked; only Nell can die (Corvin cannot drown); Ossery's arena is `a6_storm_eye`; the Lamp Bands become cosmetic coloured bands at Act 6 lamp-posts (no "segment removed", which was a constant); Trials unlock after Act 1 with each door gated by its act's mechanic; tether reach 120, rune reach 80 (03); interact range 12 (07); 02 §19 adds "Physics detail" and "Brightness floor"; Tide sounds borrow `spell.water.*` via the Lanternfall bridge, else `spell.nature.*` (10); "Lamp shrine" and "rest point" → lamp-post; 07 P4-5 rewritten for `on_hit` (the `on_timer` knot is parked); 07 P6-5's overcharged-Spark charges cut; `docs/CHANGELOG.md` now exists.

### Fun, tech, brief (R73–R82)

| # | Call | Decision |
|---|---|---|
| R73 | **A** | Grabs end on their own in 1.5 s; a dodge, an Ember hit or a pole hit frees you early. No mashing. The snare net is parked. |
| R74 | **A** | Breath pauses in menus; no menu has a timer. |
| R75 | **A** | Ferry max-health debt capped at 20% and refunded in full at each Great Lamp relit. |
| R76 | **A** | Each Kindling flag gets one NPC hint line before its choice; the Journal lists "People you could still help". |
| R77 | **A** | Pre-render each enemy kind's bark pool at room load; cache per act. |
| R78 | **A** | HUD anchored to edges; tested at 427×240, 512×288, 640×360. |
| R79 | **A** | Wick sim gains a physics set (pool, oil slick, wood wall, 160×90) using the real cell code. |
| R80 | **A** | Turret shots never trigger knots. |
| R81 | **A** | 06 §15 names the three water tricks (surface ripples, pour/jet particles, height-field floods); one showcase room per act is about water or light looking good. |
| R82 | **A** | Hubs are the Lingo showcase (idle chatter, `converse` pairs, memories of your deeds); combat barks sparse. |

### Missing specs (R83–R92)

| # | Call | Decision (owner) |
|---|---|---|
| R83 | **A** | Enemies do not block the player; contact damage only from `contact` attacks; soft separation between enemies (04 player side, 05 enemy side). |
| R84 | **A** | One table in 04: i-frames 600 ms after a hit, hurt state 0.2 s at 30% control, stagger when knocked into a wall above 160 cells/s. |
| R85 | **A** | Hit-stop (04): 2 ticks on heavy and crit, 4 on boss poise break, 0 on DoT ticks. |
| R86 | **A** | Enemies are placed at room load; only hatches and ambushes spawn later, with a 500 ms sound (05 §7). |
| R87 | **A** | Hubs are `sanctuary`: no building, spells change no cells, NPCs ignore damage (07 + 01). |
| R88 | **A** | A 4-step skippable guided overlay the first time the Wick builder opens (02 §15). |
| R89 | **A** | Per-boss `camzone` row in 05: Tallow lock, Gnaw lock, Sluicemaw wide, Widow lock, Bellfather wide + vertical follow, Ossery wide. |
| R90 | **A** | Lamp-posts only; "Lamp shrine" and "rest point" deleted. |
| R91 | **A** | Endless flood kills only by breath rules; no instant loss when a room fills. |
| R92 | **A** | "Desktop + gamepad only" in 00 non-goals; phones get a clear card; the title and menus still pass a layout test at 390 px wide (house rule: test mobile). |

---

## (b) Brainstorm from the feedback

Ideas the roast sparked. **Adopt** = in canon v2 (folded into 00 and the edit orders). **Park** = on the parked list.

| # | Idea | Call | Why / where it lands |
|---|---|---|---|
| B1 | **Act 1 grace**: telegraph wind-ups ×1.25 and one melee attack token in Act 1 on every difficulty, on top of the difficulty table | Adopt | "Start easy" without a separate mode. 05 §2.3 act row. |
| B2 | **The first view**: the Guild Hall hub opens on a balcony over the chasm with the guttering Crown Lamp, rain streaks, puddle reflections and the city's dead lamps below: the most beautiful room, zero new verbs | Adopt | Act 1 wows with presentation, not systems. One showcase room per act (R81). |
| B3 | **Relight sweep**: when a Great Lamp relights, a warm palette wave runs down the district (ambient ramp lerp over 3 s), every puddle reflection pulses, the district drone gains a voice | Adopt | Cheap spectacle (uniforms + score). 06 §14.6, 10 score. |
| B4 | **Last drop**: when oil hits 0 in the dark the lantern gutters out (sound, light collapse) and Unlit converge; relight it only at a lamp-post, a sconce, or by striking any burning cell with the pole | Adopt | Makes darkness bite and teaches the pole-fire link. 03/06/07. |
| B5 | **Lure rule**: enemies within 120 cells path toward a thrown light (a lit crate, a lantern post) or a loud noise (bell, explosion) for 4 s | Adopt | Turns every trap into a weapon the player aims. 05 §3.2. |
| B6 | **Trap kills pay**: kills by traps or the world give +50% XP and show as "The Hollow" source in the Ledger, with a Narrator line the first time | Adopt | Rewards R51 play, feeds the meter. 04 §17.2, 10 §10.3. |
| B7 | **Tinker's Hijack** board node: pole-hit a trap to take its trigger for 20 s (it fires on your class ability key) | Adopt | Gives the builder class a trap identity. 04 board. |
| B8 | **The Ledger remembers**: Rekindle is a small Guild lantern at the door; touching it streams the room's cells back into place (a rewind shimmer, 0.6 s) and the Narrator makes a dry remark; "Rooms rekindled" is a Ledger stat | Adopt | Soft-lock prevention as a diegetic mechanic (R10). 07 §9, 06 transitions. |
| B9 | **Brass means safe**: the Act 1 First Step lesson shows an Ember bolt failing to burn brass-rimmed wood, so pinned cells are learned before they matter | Adopt | One lesson beat. 07 P1-1. |
| B10 | **Room kits** as parametric generators emitting 10 §6 JSON, validated by room-check and the reachability bot; campaign fight nodes and the Long Descent both use them | Adopt | R8. 09 + 10. |
| B11 | **Procedural score** from the sfx engine: per-act drone keys, a 6-note Guild bell motif, relight voices, boss pulse per phase, silence at the Rain's end | Adopt | R14. 10 §10. |
| B12 | **Burning panic**: burning enemies run and spread 1 burn stack per second to enemies they touch; burning corpses ignite what they fall on | Adopt | Makes fire a crowd tool; cheap. 05 §5. |
| B13 | **Oil barrels are both**: pole-pierce a barrel to refuel 20 oil from its leak, or ignite it | Adopt | Physical oil sources in Act 4 that can also kill you. 07 §5.22. |
| B14 | **Flood clock**: during a flood set piece the rising line shows on the minimap edge with a seconds readout | Adopt | Readable danger for set pieces. 02 §12. |
| B15 | **Wick codes**: a wick exports as a short text code (copy/paste) and Odile's named wicks fill a "Wick Book" page in the Journal | Adopt | Build-your-own-spell sharing, no server. 02 §15, 03 §16. |
| B16 | **Daily share line**: the Daily result screen prints seed, class, wick code and score as one line to copy | Adopt | Cheap social hook for Daily. 09 §12. |
| B17 | **No module without a door**: `tools/reach-check.mjs` fails if any `js/` module is not reachable from `main.js`, any data file is not loaded, or any data id is never referenced | Adopt | The house failure mode, made a test. 10 §9. M8 onward. |
| B18 | **Floodgate grows**: the roster follows acts reached (R43) and the arena's theme follows the highest act | Adopt roster / Park theme | Roster is free; a themed arena per act is 5 extra rooms. |
| B19 | **Flame weather**: Ember loses light in open rain, Rime makes sleet on wet floors | Park | Another hidden rule (R44). |
| B20 | **Hush's lamp**: in Act 4 the perch command lets Hush hold a light 12 s (cooldown 40 s): a free second light source for dark puzzles | Adopt (already in 01) | Confirmed and costed as part of M25. |
| B21 | **Perfect dodge rain-freeze**: a dodge in the last 100 ms before a hit freezes the rain streaks for 0.2 s with a rim flash | Adopt | Cheap feel reward; ties rain to combat. 04 §2, 06. |
| B22 | **Silent Bells as a score tune**: the 12 bells play the Guild motif | Park | Parked with the Bellringer. |

---

## (c) Ship scope and parked list

### Ship scope (what the build contains)

| Area | Ships | Count |
|---|---|---|
| Acts | `act1`–`act6` (1–5 descended, 6 climbed; Rain stops mid-Act 6) | 6 |
| Act map nodes | 9 / 9 / 8 / 8 / 7 / 9 (incl. 2 secrets); ~42 on one route | 50 |
| Rooms | hand-authored hubs, lessons, puzzles, events, arenas, set pieces, trials ≈ **55**; + 6 room kits giving ~30 fight rooms per campaign route | ~85 played per campaign |
| Regular monsters | 4 per act + 4 Knell + 2 extra Unlit-era (list in 00 §10) | 30 |
| Elite modifiers | wickfed, rimebound, stormcalled, blighted, ironhide, swift, splitting, relentless | 8 |
| Minibosses | Sewer-King (A2), Drowned Lockmaster (A3), Lamp-Eater Matriarch (A4) | 3 |
| Bosses | Tallow (2 phases; 3 on Lampless / Boss Rush), Gnaw 3, Sluicemaw 3, Widow 3, Bellfather 3, Ossery 4 | 6 (~44 telegraphed attacks) |
| Classes | 3 default + 2 unlockable, each with a moveset, ability, passive, **12-node** board | 5 |
| Spells | 7 flames, 8 shapes, 8 charms, 2 knots, 8 combos, full flame × material reactions | — |
| Statuses | burn, chill, frozen, numbed, thawing, shocked, corrode, radiant, soaked, drained, dazzled, dimmed, staggered, knocked_out | 14 |
| Items | 30 bases, 12 affixes, 4 rarities, 8 relics, 12 consumables, tempering | — |
| Shops | Wick & Tallow, Crane's Pawn, Soup Barge, Mothwife's Gamble (+ Drowned Market shelf), Ferry | 5 |
| Currencies | pennies, pearls, Guild marks (+ scrap as a material) | 3 |
| NPCs | 14 named + Hush + the Narrator | 16 speakers |
| Story | 8 Kindling flags, 3 endings (A, B, C), 6 cutscenes + act title cards, 24 lore plaques, ≤ 12 new Lingo intents | — |
| Traversal | 18 interactables, 10 traps, 8 build parts (+ 2 Tinker parts), 20 puzzles with solution scripts, current zones, gravity bands | — |
| Modes | Campaign, Floodgate (15 waves), Long Descent (+ Daily as a seeded flag), Boss Rush, Trials (5) | 5 (+Daily) |
| Meta | 10 Guild Hall unlocks, 20 achievements, 3 difficulties + Iron Wick | — |
| Presentation | WebGL2 light/reflections/bloom (built), rain two layers, height-field floods, procedural score, voices + subtitles | — |

### Parked list (kept for later, not deleted)

Every page moves its cut material into a **"Parked (v2)" appendix** at its end (see `EDIT-ORDERS.md`). The master list:

- **Classes:** Ferrywitch, Bellringer, Drowned Knight (kits, boards, challenges); 24-node boards (12 extra nodes per class).
- **Monsters:** chandler_husk, lamp_mimic, waxwing, bloat_leech, pipe_worm, rat_king, bloat_toad, kelpwraith, gate_warden, blackwater_angler, silkling, hollow_lamplighter, tarbody, rope_ringer, tollworm, cloud_bloat, vane_herald, unlit_shroud, unlit_deepmaw, knell_cantor, knell_tollkeeper (and the recall bell); elite mods haloed, tidecaller, umbral, bellstruck, mirrored, vampiric.
- **Minibosses:** The Wickwright, The Carillon, The Rootwarden, Hallow Dunmere's fight.
- **Boss extras:** Drowned-difficulty extra attacks, Tallow's grab and Last Pour.
- **Spells:** charms pierce, vast, siphon, steady; knots on_timer, on_land; 12 relic strands; 12 combos (void rift, thermal crack, scald, toxic smoke, conductor, brittle, static frost, black water, sunfire, undertow, floodspark, grease fire); knot depth 2.
- **Items:** hood and second trinket slots, oil flask slot, sets (3), affix tiers, reforge/recast/add-affix, relic rerolls, blessings, 10 of 18 uniques, gadgets, scrolls, 10 dishes.
- **Shops:** Bell Tithe, Scrapwright as its own shop, peddler, Undertow Fence, Salvage Diver, Hollow Lamp Auction.
- **People:** Pask, Hask, Dobb, Rennet, Clink, Pickering (the place keeps his name), Cantor Ebb, Ada Fennick, Ser Kell, Mag Oarly, Jory Wickett, Lune, Osk Tamberlane, Hallow Dunmere; Kindling flags `ebb_forgiven`, `ada_mother`, `jory_shared`; Ending D; Ending B2; 36 lore plaques.
- **World:** Silent Bells (12), the Lamp Bands as a climb mechanic, Act 2 Overflow and Act 4 Sinking Pilings set pieces, 47 v1 act-map nodes (listed per act in `EDIT-ORDERS.md` §09; 7 more were merged into kept nodes), `tar` material.
- **Traversal:** interactables lever3, weighted_plate, dynamo, counterweight, winch, fan, steam_vent, brazier, fuse (as its own thing), release_hook, float_switch, pipe, mirror, pressure_bellows, light_sensor; traps steamjet, grate, rotplank, net, tripbell, barrelchute, floodroom, gravflip, cloudfloor, lure, jaw, gust; parts long plank, pulley, spring, rope bridge, ward, stone block, hook anchor, sparkmine, turrets Mk II/III; 19 puzzles.
- **Modes and meta:** NG+ (5 cycles), Drowned difficulty, 10 trials, 16 Guild Hall unlocks, 24 achievements, jukebox, Endless "Dry" variant, Floodgate per-act themes.
- **Tech:** Worker with `postMessage` chunks, IndexedDB saves, Canvas2D parity, offline settled-cell caches, dynamos reading real flow.

---

## (d) Final milestone plan — 39 milestones

Each milestone ends green (unit + its e2e), committed, and **reachable from the title screen in normal play**
(the house rule; `reach-check` enforces it from M8). "Engine" marks milestones the built code already partly covers.

### Phase A — Foundations (M1–M10)

| # | Goal | Lands | Acceptance test |
|---|---|---|---|
| **M1** · Engine | Cell world complete | **Built:** grid, cellsim (passes A/B, sim window, slow lane), thermal, liquids (equaliser, electrify, basins), materials. **Left:** support/collapse + fragments (06 §10), `explode()`, conservation, bench numbers written into 06 §20 | `cells.test.js` water+steamDebt+ice constant over 2,000 ticks; collapse test; `bench.mjs` p95 sim ≤ 4 ms headless, numbers in 06 |
| **M2** · Engine | Rooms on screen | **Built:** WebGL2 pipeline, room compiler + decorator, thumbnails. **Left:** camera (follow, integer scale, wide view by cut), Canvas2D debug view, `room-check` with reachability as an error and a settle ≤ 30 ticks rule, room transitions (fade 0.25 s + followers) | both example rooms pass `room-check` (after R66 fixes); screenshots non-blank at 3 scales |
| **M3** · Engine | Light truth + readability | **Built:** light map, emission glow, bloom. **Left:** CPU light grid 1/8 with tiers, `lightTier`/`ambientTier`, unlit overlay (eyes, telegraphs, void rims), floor 0.08, relight sweep hook | dark-screenshot spec: telegraph rims visible in a 0.08 room; CPU/GPU tier agreement ≥ 95% |
| **M4** · Engine | Water and rain showcase | **Built:** reflections, ripples, wet sheen, near rain (`rain.js`). **Left:** puddles/run-off/drips, current zones, height-field flood module with thin band, one showcase room | flood raises 8 rows/s across 400 cells in ≤ 2 ms/tick; current zone pushes a body at 60%; showcase screenshot |
| **M5** · Engine | The small player | **Built:** `player.js`, `collide.js`, `movement.json`. **Left:** `data/bindings.json` from 02 and `input.js` re-pointed at it (fixes the swapped cast/pole), gamepad, ledge-grab, slide, drop-through, swim stub, fall damage, the movement model the reachability bot shares | unit: apex 34±1, wall-jump, step-up 2/3/4, fall damage; e2e: keyboard and simulated gamepad cross the movement test room |
| M6 | Fighting | Pole combo/heavy/plunge/pogo, hurt rules, hit-stop, contact rules, statuses core, damage + resist tiers, poise; AI core (05 state machine, senses on tiers, attack tokens, placement at load, lure rule); telegraph + void-zone system from data; 3 test monsters | formula unit tests; void zone never damages on its entry frame or during warm-up; e2e kills 3 monsters |
| M7 | Build your own spell | Compiled wick program (03 §20), Ember/Rime/Spark/Gleam, bolt/lob/arc/ring/wave/rune, flame × material reactions for all 36 materials, two-track burn-in, oil, cooldowns; Wick builder UI + test chamber + guided overlay; `wick-rank` with utility score | every shape inside 0.67–1.5× damage per oil or utility-flagged; e2e: braid Ember Lob, boil a pool to steam |
| M8 | RPG shell and the Ledger | Edge-anchored HUD, satchel + 5 gear slots, bases/rarities, attributes, level-ups (attribute points only), the Ledger over `meters/` (each wick a source, "The Hollow" source), tooltips + `format.js`, pause and death screens; `reach-check` tool | Ledger lists per-wick rows after a fight; HUD fits 427×240 / 512×288 / 640×360; `reach-check` green |
| M9 | Save and forgiveness | `shared/store.js` slots with budgets + 1 backup, profile, lamp-posts (rest/save/braid/fast travel), death purse, room state rule (prefabs persist, cells do not), Rekindle posts, brass rim on pinned cells | save/load round trip; max save ≤ 64 KB; Rekindle restores a broken puzzle room with prefabs kept |
| M10 | Voices, words, sound | Lingo bridge + pack, `npcs.json` speakers, bubbles/subtitles, anti-repeat, bark pre-render; 7 roles added to `shared/voices.js` (add-only); Narrator; sfx bridge; score v1 (rain bed + act drone) | `talk.test.js` variety; every NPC role exists; Emberveil + Farhold voice tests still green; audio e2e has no console errors |

### Phase B — Vertical slice: Act 1 (M11–M15)

| # | Goal | Lands | Acceptance test |
|---|---|---|---|
| M11 | The map you walk | 6 room kits; act JSON graph; node walking through exit doors; full-screen map (act + room tabs), minimap, fog, pins; flood clock; solution-script runner | every kit × 8 seeds passes `room-check`; `actgraph.test.js`; e2e opens both map tabs |
| M12 | Act 1, first half | Title → class pick → `cs_opening` → Guild Hall hub (Aldra, Odile, Crane, lamp-post, balcony view); lessons First Step (brass-rim beat), Candlemarket (Rime + lob, slot 2), Drip Gallery (plank kit, crates, heavy/plunge, Hush, Pim) | solution scripts pass for 3 lessons; e2e new game reaches the Drip Gallery |
| M13 | Act 1, second half | Chandlers' Lane / Slate Roofs (kits), Melting Stair wax flood, Beneath the Crown secret (grapple-locked), Act 1 monsters with ASCII art, Act 1 loot, Wick & Tallow (strands, naming, wick codes), Crane's Pawn (buy/sell, Lingo memory), shop frame | shop tests; `data-check` sprites valid; Melting Stair chain e2e |
| M14 | Mother Tallow | Part-assembled boss art pipeline (`rigs.json`), boss framework (arena lock, phase notches, transitions, enrage, camzone, 20% heal), Tallow P1+P2 (+P3 on Lampless), `cs_relight_crown`, relight sweep, `tallow_cooled` with its hint | phase changes at 66%; her wax cells harden into terrain; P3 only on Lampless |
| **M15** | **VERTICAL SLICE** | Act 1 end to end: difficulty menu, death/continue, Ledger, level 1 → 6, class ability granted at the relight, Floodgate and Trials doors announced; tuning pass; `publish-stable` | `act1-route.spec` plays title → Crown relit with debug accelerators; XP sim level 5–6 at Tallow; Act 1 rooms inside the frame budget |

### Phase C — Mechanics and acts (M16–M33)

| # | Goal | Lands | Acceptance test |
|---|---|---|---|
| M16 | Machines and traps | Wiring (10 actions + 07 gates), 18 interactables, 10 traps that hit anything, trap-kill XP, `inspect` | a unit test per gate kind and per trap; a trap-room solution script |
| M17 | Ropes | Wrap-list grapple, verlet level ropes, tether shape, swing strike, rope test course | wrap add/remove at corners; swing numbers match 07 |
| M18 | Act 2 world | Dripmarket hub (Soup Barge, Ferry dock, Nell), Hookwright's Forge, Pickering's Lockhouse (Spark + traps-as-weapons lesson), Long Chain / Brickgut (Bile), Charmwife's Niche (charm slot 1, split, overcharge + gutter), charms split/bounce/heavy/swift, affixes on, Act 2 monsters + Knell novice/hookman, Knell surrender | lesson scripts; charm compile tests; gutter chance matches 03 |
| M19 | Act 2 bosses and boards | Sewer-King (grate-drop trap), Saint Gnaw (pre-rendered choir, rope arena), `cs_relight`, Rat-Pipe Warren (`hollis_lantern`), 12-node boards for the 3 default classes | boss phase tests; board prerequisite tests |
| M20 | Floodgate | 15 waves, height-field rising water, building between waves, pumps, scoring, roster from acts reached; modes menu | wave sim; e2e survives waves 1–3 |
| M21 | Water as terrain | Swimming + breath, sluice gates, valves, basins, current zones in play, Tide (dry-Tide rule), Floodwall | basin fill/drain tests; breath pauses in menus |
| M22 | Act 3 world | First Cistern, Pumpworks hub (Voss, slot 3, charm slot 2), Cistern Row / Long Channel, Drowned Market (Unna, pearl shelf, `pale_kept` valve), Spillway, linger + seek, Act 3 monsters, the Ferry (travel, respec, capped health debt) | lesson scripts; Ferry refund test; shortcut edge opens on drain |
| M23 | Act 3 bosses | Drowned Lockmaster (levers mid-fight), Sluicemaw (height-field reservoir cycle, wide view), relight | Sluicemaw flood cycle keeps ≤ 60k awake liquid cells |
| M24 | Long Descent + Daily | Chain from kits + `endless`-tagged rooms, floodline (breath rules), boons, bosses you have reached, local board, daily seed + wick table + share line | seeded chain deterministic; e2e 3 depths |
| M25 | Darkness | Tiers in play, regen stops in the dark, lantern burn, hood, last drop / relight, flask at lamp-posts, oil barrels, Hush perch; Unlit (4); Gleam + Shade; all 8 combos | oil-economy unit tests; Unlit sight follows tiers; dark screenshot spec |
| M26 | Act 4 world | Last Derrick hub (+lesson), Knot House (on_hit, on_kill), Oil Pits / Lampless Lane, Hanging Houses, Stilt Town (`nell_alive`), Mothwife's tent, oilback + lampeater, Moth Oracle tracker | knot budget tests; challenge tracker unit test (Widow exempt) |
| M27 | Act 4 bosses | Lamp-Eater Matriarch, the Lampless Widow (stolen voices, snuff, +25% from bolt/lob in P3), `cs_relight_deep` | stolen voice picks only met NPCs; snuff never fails the challenge |
| M28 | Gravity and bells | Gravity bands (entity-only, cells held), gravity lanterns, bells, echo + volatile, slot 4 | held cells unchanged across a band flip; band snap test |
| M29 | Act 5 world | Nine Valves, Tithe Hall hub (Marl, `knell_spared` deal), Bellwright's Foundry, Upside Chapel / Ring Galleries, Long Drop rubble chase, Act 5 monsters + Knell lampbreaker/maulbearer, Pim's letter (`knows_keeper_rule`) | valve sequence script; deal counter test |
| M30 | Bellfather | Wide view + vertical follow, on-screen band states, tolls, relight | every band change is shown ≥ 700 ms before it acts |
| M31 | Act 6, the climb | Understar hub (Merrit), Empty Socket (mastery, charm slot 3, wind zones), First Coil / Corvin's Hollow, Last Wall montage, Act 6 monsters | mastery never gutters; montage lists only living NPCs |
| M32 | The Storm's Eye | Ossery P1–P3 (mantle 40%, 5 s drop), `cs_rain_stops`, rain density → 0, score goes silent | phase tests; rain particles 0 after the cutscene |
| M33 | The dry world and the end | Falling Flood (height-field release ≤ 60k awake cells), Dry Root (Ember burns cloudroot), Dry Eye P4, the final choice, endings A/B/C, credits, checkpoint rule | ending selection unit test over Kindling; e2e from the Last Wall to credits with debug accelerators |

### Phase D — Modes, classes, finish (M34–M39)

| # | Goal | Lands | Acceptance test |
|---|---|---|---|
| M34 | Unlockable classes and Trials | Chimneysweep and Moth Oracle (moveset, ability, passive, board, art), challenge tracking, next-act-hub class switch; Trials: First Flame, No Oil, Rope Gauntlet, Pacifist Sluice, Hooded Crossing | each challenge unlocks via the campaign rule and via its trial; class switch keeps level and gear |
| M35 | Boss Rush and meta | Boss Rush (splits, pause rooms, Tallow full), Guild Hall (10), achievements (20), Floodgate on all acts | each unlock has a "module reads the knob" test |
| M36 | Balance | `sim-lanternfall` with the physics set, `wick-rank`, XP pacing (6/11/16/21/25/29), oil share 20–30% in Act 4, difficulty tables | sims inside their targets; report in `research/` |
| M37 | Sound pass | Score complete (act drones, relight voices, boss pulse per phase), mix levels, voice pass, captions | loudness within sfx targets; every boss has a pulse layer |
| M38 | Polish and access | Settings (brightness floor, build slow-time, colour-blind flame patterns, rebinding), gamepad pass, menu fit at 390/768/1080, perf auto-degrade, phone card | `bindings.test.js`; menu-fit spec; perf spec under budget |
| M39 | Ship | Full campaign bot route acts 1–6, save fixtures, README + docs + playground CLAUDE.md row + GAME-GUIDE, real-laptop perf check, `publish-stable` + `publish-pages` | whole e2e suite green on stable; parked list re-read and reported to the user |

**Brief check at M39:** campaign through all six acts (M12–M33), Waves (M20) and Endless (M24), class
unlocks (M34), five quirky shops (M13, M18, M22, M26), the Ledger (M8), Lingo and voices (M10 on), multi-phase
telegraphed bosses with void zones (M6, M14, M19, M23, M27, M30, M32–33), rain, water, light and reflections
(M3, M4, M21, M25), building, ropes, levers, buttons, doors and traps (M12, M16, M17), full-screen map and
minimap (M11), inventory, skills, attributes and level-ups (M8, M19), start easy with drastic unlocks (00 §6).
