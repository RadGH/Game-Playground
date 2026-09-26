# LANTERNFALL — 06: Physics and Rendering

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> How the world is stored, how every pixel moves, burns, freezes and floods, how rain, light and reflections
> are made, and what each frame is allowed to cost.

This page is the spec for `js/world/` and `js/render/`. **06 owns** (00 §3): materials, cell rules, liquids,
height-field floods, current zones, the gravity-band cell rule, light (sources, the CPU light grid, tiers),
rendering, the camera, room transitions, art formats and the performance budget. It does **not** own: file
names, folders and JSON field shapes (10 §3, §5), spell numbers (03), movement numbers (07, `data/movement.json`),
statuses (03), monster behaviour and boss camzones (05), keys and settings screens (02). Where those come up,
this page links to them. Canon names, acts and flames are `00-OVERVIEW.md`.

**Built already** (commits `1080613`, `d6bd82d`, `c0ef340`): the grid, chunks and dirty rects
(`js/world/grid.js`), both cell passes (`cellsim.js`), the thermal pass (`thermal.js`), the equaliser, basins and
shock (`liquids.js`), the support rules and falling fragments (`support.js`, `fragments.js`, wired into the
tick), entity collision (`collide.js`), near rain, drips and ripples (`rain.js`), flame-on-cells and `explode()`
(`elements.js`), current zones and a first-cut floodline (`currents.js`), the CPU light grid and tiers
(`lightgrid.js`), the room compiler and decorator (`roomload.js`, `decor.js`), the reachability bot (`reach.js`),
the 36 materials (`data/materials.json`), and the WebGL2 pipeline (`js/render/webgl2.js`, `shaders.js`). The M1–M6
work is landing while this page is edited, so the "built / planned" notes below are a snapshot of 2026-09-26. Where this page and the
code disagree on a small constant, the code's value is written here or flagged; where a section describes
something not built yet, it says **planned** and names the milestone (REVIEW §d).

## Contents

1. [Units and scale](#1-units-and-scale)
2. [The cell grid](#2-the-cell-grid)
3. [Chunks, waking and sleeping](#3-chunks-waking-and-sleeping)
4. [The update order (one tick)](#4-the-update-order-one-tick)
5. [Materials table](#5-materials-table)
6. [Movement rules by behaviour class](#6-movement-rules-by-behaviour-class)
7. [Temperature, fire and reactions](#7-temperature-fire-and-reactions)
8. [Liquids in depth](#8-liquids-in-depth)
9. [Gases](#9-gases)
10. [Support, collapse and falling fragments](#10-support-collapse-and-falling-fragments)
11. [Rain, puddles, run-off and drips](#11-rain-puddles-run-off-and-drips)
12. [Entities against the grid](#12-entities-against-the-grid)
13. [Explosions and debris](#13-explosions-and-debris)
14. [Lighting](#14-lighting)
15. [Reflections and wet sheen](#15-reflections-and-wet-sheen)
16. [The WebGL2 render pipeline, pass by pass](#16-the-webgl2-render-pipeline-pass-by-pass)
17. [Canvas2D debug view](#17-canvas2d-debug-view)
18. [Particles](#18-particles)
19. [Camera and room transitions](#19-camera-and-room-transitions)
20. [Performance budget](#20-performance-budget)
21. [Benchmark room for milestone 1](#21-benchmark-room-for-milestone-1)
22. [What we learned from Tiny RTS](#22-what-we-learned-from-tiny-rts)
23. [Build order](#23-build-order)
24. [Applied in v2 — v2 changes](#24-applied-in-v2--v2-changes)
25. [Art formats](#25-art-formats)
26. [Parked (v2)](#parked-v2)

New in v2: §8.9 height-field floods, §8.10 current zones, §10.7 gravity bands, §14.7 the CPU light grid and
tiers, §19.5 room transitions, §25 art formats.

---

## 1. Units and scale

| Quantity | Value | Notes |
|---|---|---|
| 1 cell | 1 art pixel | the only length unit in the sim; "cells" below |
| 1 metre | 8 cells | shared number (EDIT-ORDERS §0); used only for player-facing distances (rope metres, the Chimneysweep unlock) |
| Visible view | 480 × 270 cells at 1080p | flexes a little with window shape, see §19.4 |
| Sim tick | 1/60 s, fixed | `DT = 1/60`; the sim never runs a variable step |
| Threads | one (the main thread) | canon (00 §13): no Worker, no `SharedArrayBuffer`. Sim, AI, spells, ropes, talk and audio share it |
| Gravity (particles, fragments) | 900 cells/s² | the player's gravity and every other movement number are `data/movement.json` (07 §2); cells use their own per-tick rules (§6) |
| Player body | 6 × 12 cells | 00 §4; speeds, jump and step-up are 07's |
| Room size | min 480 × 270, max 2048 × 2048 cells | 2048 is the smallest texture limit WebGL2 guarantees (§16.2) |
| Chunk | 64 × 64 cells | §3 |
| Temperature | whole °C, `Int16` | ambient in the rain is **12 °C** |

Speeds in this page are in cells per second unless it says "per tick". 1 cell per tick = 60 cells/s.

---

## 2. The cell grid

A room's world is one set of flat typed arrays, all the same length `n = W × H`, indexed
`i = y * W + x` (y grows downward, like the screen). Nothing in the inner loops touches objects: every
per-material fact is looked up from small typed arrays indexed by material id (§5.3).

### 2.1 Per-cell arrays

| Array | Type | Bytes | Meaning |
|---|---|---|---|
| `mat` | `Uint8Array` | 1 | material id (0 = air), table in §5 |
| `shade` | `Uint8Array` | 1 | colour variant: low 3 bits pick the ramp step (0–7), high 5 bits are a per-cell noise seed used by the shader for grain. Set when the cell is created, carried along when the cell moves (a moving grain of sand keeps its colour) |
| `temp` | `Int16Array` | 2 | temperature °C. Air cells hold temperature too, so heat can cross a gap of air slowly |
| `life` | `Uint8Array` | 1 | hit points for solids and powders; remaining lifetime in ticks÷4 for fire, gases and sparks; burn fuel for a burning solid |
| `flags` | `Uint8Array` | 1 | bit field, §2.2 |
| `stamp` | `Uint8Array` | 1 | "moved on tick" stamp so a cell moves at most once per tick (§4.3) |
| `bg` | `Uint8Array` | 1 | background-wall material behind this cell (not simulated; drawn when `mat` is air or see-through; scorched by fire) |
| `aux` | `Uint8Array` | 1 | per-material spare byte: liquid "last sideways direction" + "settle counter", wet-sheen timer for solids, electrified timer for water, growth counter for moss |

Total **9 bytes a cell**. The biggest legal room (2048 × 2048 = 4.19 M cells) is 37.7 MB; a typical
960 × 540 room is 4.7 MB. There is **no per-cell velocity**. Liquids get their "momentum" from the
remembered sideways direction in `aux` (§8.1), which is enough to make water run along a floor instead of
jittering, and costs nothing.

### 2.2 `flags` bits

| Bit | Name | Meaning |
|---|---|---|
| 0 | `BURNING` | a solid/powder/oil cell that is on fire (it spends `life` as fuel, §7.3) |
| 1 | `WET` | surface is wet: draws the sheen (§15.3), resists ignition (×0.25 chance), set by rain/splash, cleared by timer in `aux` or heat ≥ 60 °C |
| 2 | `SHOCK` | this water/metal cell is carrying Spark current (§7.6); timer in `aux` |
| 3 | `BUILT` | placed by the player (planks, braces, frozen bridges from Rime) — shown with a faint outline in build mode, counted for the Tinker's build cap |
| 4 | `PINNED` | never detaches or falls, and `explode()` skips it (built). Authored anchors, doors' frames, Great Lamp mounts, and **every puzzle-critical cell** (00 §13 soft-lock rule). Set by the room loader from the legend's `%` / `=` or an op's `"pin": true`. Drawn with a faint **brass rim** in the overlay pass (§16.8) so it reads even in the dark; this is what the v1 idea "lampstone" became (§5.5) |
| 5 | `FROM_WATER` | this ice/steam cell came from water, so it turns back into water (not into its default melt product) — keeps water totals stable across freeze/thaw |
| 6 | `SETTLED` | liquid only: has not moved for 30 ticks; skipped until a neighbour changes (§8.2) |
| 7 | `LIT_STATIC` | cell is a static light emitter this frame (glowmoss, lamp glass); set by the loader, used by the emissive pass |

### 2.3 Grid API (`js/world/grid.js`)

```js
const g = createGrid(W, H, materials);   // allocates all arrays, fills with air at 12 °C
g.idx(x, y)                 // y*W + x
g.inside(x, y)              // bounds check
g.get(x, y)                 // material, returns BEDROCK outside the room so nothing leaks out
g.set(x, y, mat, opts)      // create a cell: resets life to the material's HP, picks a shade, sets temp
                            //   to opts.temp ?? material default, wakes chunks, queues support checks
g.swap(i, j)                // move a cell (all 9 arrays except bg) — the only way cells move
g.damage(x, y, amount, kind) // kind: 'blast'|'cut'|'heat'|'acid'|'crush'; uses the material's resist table
g.heat(x, y, delta)         // add °C, wakes the thermal list (§7.1)
g.wet(x, y, ticks)          // set WET with a timer
g.solidAt(x, y)             // for entity collision: behaviour STATIC or POWDER (§12)
g.liquidAt(x, y)            // any liquid id
g.countIn(rect, pred)       // small-area counting for entities (swim fraction, steam lift)
g.snapshot(rect) / g.restore(snap) // tests and the room editor
```

`set` and `swap` are the only writers. Both call `touch(x, y)` (§3.2). Tests assert that no other module
writes to the arrays directly (a grep test in `10-TECH-DATA.md` §9.1).

As built, `damage(x, y, amount, kind)` takes `kind` as an index into `RESIST_KINDS`
(`['blast','cut','heat','acid','crush']`), `countIn(x0, y0, w, h)` takes a rect as four numbers, and the grid
also exposes `touchGfx`, `markHot`, `wakeRect`, `wakeAll`, `allGfxDirty`, `beginTick` and `rand` (the per-tick
xorshift of §4.4). The exact signatures are listed in 10 §3.2. (Known exceptions to "only writers": the room
compiler writes arrays directly before the first tick, and the equaliser's move is a `set` pair — both allowed.)

### 2.4 Room edges

Outside the room is treated as **bedrock** for every rule: water pouring off the edge of a room does not
vanish, it stacks against an invisible wall. Rooms that *want* water to leave (a drain, a waterfall into the
next room) mark edge spans as `drain` in the room file (`10-TECH-DATA.md` §6.2 `edges`). A liquid or powder cell
that moves onto a drain span is deleted and counted in `room.drained` (sluice puzzles read it).

---

## 3. Chunks, waking and sleeping

### 3.1 Layout

The grid is split into **64 × 64-cell chunks** (`CW = ceil(W/64)`, `CH = ceil(H/64)`). A 960 × 540 room
is 15 × 9 = 135 chunks; the biggest room is 32 × 32 = 1024. Per chunk we keep:

| Field | Type | Meaning |
|---|---|---|
| `awake` / `awakeNext` | `Uint8Array(nChunks)` | step this chunk this tick / next tick (double-buffered so a change late in the tick wakes the chunk for the next one) |
| `dirty` rect `x0,y0,x1,y1` | `Int16Array(nChunks*4)` ×2 (current/next) | the smallest rectangle inside the chunk where something changed last tick, grown by 2 cells. Only this rectangle is scanned (Noita-style "dirty rect") |
| `gfxDirty` rect | `Int16Array(nChunks*4)` | the area whose pixels must be re-uploaded to the GPU (§16.3) |
| `hot` | `Uint8Array` | chunk holds at least one cell whose temperature differs from ambient by > 4 °C, or any fire/ember/molten cell → run the thermal pass here |
| `liquidCount`, `gasCount` | `Uint16Array` | cheap counters, used by the renderer to skip the water pass and by debug |
| `lastActive` | `Uint32Array` | tick number of last change; drives the off-screen slow lane (§3.4) |

### 3.2 Waking (`touch`)

`touch(x, y)` is called by every `set`/`swap`:

1. Grow the chunk's `dirtyNext` rect to include `(x±2, y±2)`, clamped to the chunk.
2. Set `awakeNext` for this chunk; if the cell is within 2 cells of a chunk edge, also wake the neighbour
   chunk(s) on that side and grow *their* dirty rect to cover the 2-cell border strip. (Tiny RTS woke the
   chunk above too eagerly and always woke three chunks at once; we wake only what is touched.)
3. Grow `gfxDirty` to include `(x, y)`.
4. If the material involved is structural, push the 4 neighbours on the support queue (§10).

### 3.3 Sleeping

A chunk sleeps (is not stepped) when nothing in it moved or changed on the last tick. A settled lake does
not cost anything: its cells carry `SETTLED` (§8.2) and the chunk's dirty rect stays empty. Things that
keep a chunk awake on purpose: burning cells, gases (they always move), hot cells (thermal pass only),
`SHOCK` timers, a sluice basin that is filling or draining (§8.5), and any cell within an entity's AABB
that the entity disturbed this tick (swimming, digging).

### 3.4 The simulation window and the slow lane

| Zone | Rule |
|---|---|
| **Sim window** = camera view + 96 cells on every side (672 × 462 cells at 1080p, about 11 × 8 = 88 chunks at most) | awake chunks step **every tick** |
| Outside the window, awake | step on a **slow lane**: every 4th tick, staggered so a quarter of them run each tick (`(cx + cy + tick) % 4 === 0`). Water still finds its level off-screen, just four times slower |
| Outside the window, asleep | nothing |
| Hard cap | if more than **160 chunks** are awake inside the window, the ones furthest from the player drop into the slow lane for that tick and `perf.chunkOverflow` counts it |

Cells never freeze in mid-air forever: the slow lane always gets to them (the one deliberate exception is a
cell **held** by a flipped gravity band, §10.7). Tiny RTS stepped every awake chunk on the whole map every
tick; that was fine at 30 Hz with 32 × 32 chunks on a small map but will not hold for 4-million-cell rooms at
60 Hz. The sim window, the slow lane and the stagger `(cx + cy + tick) % 4` are built (`cellsim.js`); the
160-chunk hard cap is planned (M1).

---

## 4. The update order (one tick)

### 4.1 Tick order (whole game, `js/core/tick.js`)

| # | Step | Module | Notes |
|---|---|---|---|
| 1 | input → player intent | player movement | intent is a plain object, recorded for replays |
| 2 | wiring and prefabs (levers, doors, sluices, timers) | wiring (planned, M16) | may call `grid.set` (a door is cells, §12.6) |
| 3 | spells: cast, move projectiles, apply cell effects | spells | cell effects go through `grid.*` only |
| 4 | AI think + move enemies; current zones and gravity bands push bodies | AI, actor physics | §8.10, §10.7 |
| 5 | player move | player movement | after enemies so the player never gets pushed into a wall by an update-order accident |
| 6 | **cell pass A** — powders and liquids, bottom-up | cell passes | §4.2; cells held by a flipped band are skipped (§10.7) |
| 7 | **cell pass B** — gases and fire, top-down | cell passes | §4.2 |
| 8 | thermal pass (hot chunks only) + reactions | thermal | §7 |
| 9 | liquid level equaliser (every 8th tick) + basins + height-field levels | liquids | §8.4–8.5, §8.9 |
| 10 | support queue (budgeted) → new fragments | support | §10 |
| 11 | fragments fall / land | fragments | §10.5 |
| 12 | rain + drips + particles | rain, particle pool | particles that turn into cells call `grid.set` |
| 13 | damage resolution, deaths, loot | damage | meter records (`10-TECH-DATA.md` §10.3) |
| 14 | swap `awake`/`dirty` buffers, clear `awakeNext` | grid (`beginTick`, built into the start of step 6) | |
| 15 | events out (`bus.flush()`) | bus | UI, audio and speech listen here |

The file behind each step is listed in 10 §3. As built, `js/core/tick.js` runs every step except wiring (2, M16)
in this order — player movement and melee, spells, AI and actor physics, the cell passes, thermal, equaliser,
shock and basins, currents and floodlines, support → fragments, rain and particles, ripples, the CPU light grid
every 4th tick (§14.7), then the bus — and `grid.beginTick()` does step 14's buffer swap at the start of pass A.

### 4.2 Scan order inside the cell passes

- **Pass A (falling things):** chunk rows **bottom to top**; within a chunk, the dirty rect's rows bottom to
  top. The horizontal direction **alternates every tick** (left-to-right on even ticks, right-to-left on
  odd), for chunks *and* for cells within a row. Bottom-up means a column of sand falls together in one tick
  instead of opening gaps; alternating stops piles and floods leaning one way. Pass A only handles cells
  whose behaviour is `POWDER` or `LIQUID`; it `continue`s on anything else after one array read.
- **Pass B (rising things):** chunk rows **top to bottom**, same alternation, only `GAS` and `FIRE`
  behaviours. Running gases in their own top-down pass is the mirror image of pass A (a column of steam
  rises together) and keeps the inner loop of pass A short.

### 4.3 The move stamp

`stamp[i]` holds `(tick % 255) + 1` when a cell moves. A cell whose stamp equals the current tick's value is
skipped. The array is never cleared: a cell that has sat still for exactly 255 ticks may be skipped for one
tick, which nobody can see. (Same trick as Tiny RTS's `moved` array, but one byte instead of two.)

### 4.4 Randomness in cell rules

Cell rules never call `Math.random`. They use `grid.rand()` (built), an xorshift32 seeded from the room seed
at compile time and re-mixed with the tick number at the start of each tick (`beginTick`). Same room + same inputs = same result, which makes replays, the balance sim and
cell-rule unit tests exact. The cheap variant used inside inner loops is `r = (r ^ (r << 13)); r ^= r >>> 17;
r ^= r << 5;` kept in a local variable and written back at the end of the pass.

---

## 5. Materials table

### 5.1 Behaviour classes

| Class | Code | Moves | Entities stand on it | Blocks light |
|---|---|---|---|---|
| `EMPTY` | 0 | — | no | no |
| `STATIC` | 1 | never on its own; can be held up by support rules (§10) | yes | yes (unless `transmit` > 0) |
| `POWDER` | 2 | falls, slides diagonally, piles at its angle of repose | yes | yes |
| `LIQUID` | 3 | falls, spreads sideways, levels out | no (swim) | partly (`transmit`) |
| `GAS` | 4 | rises (or sinks, if heavier than air), drifts, fades | no | partly |
| `FIRE` | 5 | flickers upward, short-lived, spreads ignition | no | no (it *emits* light) |

### 5.2 The materials (ids fixed; `data/materials.json`)

**The 36 built materials below are the list** (R60). Ids 0–35 never change (saves and rooms store numbers).
Anything the other pages call by another name maps onto one of these (§5.5); a genuinely new material, if one
is ever needed, **appends from id 36** and is logged in `CHANGELOG.md`.

Density is relative (air = 1, water = 10). "Flam." is the chance per tick (×100) that a neighbouring
fire or burning cell ignites it. "HP" is `life` for solids and powders (255 = cannot be damaged).
Temperatures are °C. "Transmit" is how much light passes through one cell (0 = opaque, 1 = clear).

| id | key | Name | Class | Dens. | HP | Flam. | Melts / boils at → | Freezes / sets at → | Transmit | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `air` | Air | EMPTY | 1 | — | — | — | — | 1.0 | holds temperature |
| 1 | `bedrock` | Bedrock | STATIC | — | 255 | 0 | — | — | 0 | room frame, never damaged, never detaches |
| 2 | `stone` | Stone | STATIC | — | 60 | 0 | — | — | 0 | natural rock; support rule "island" (§10.2) |
| 3 | `brick` | Brick | STATIC | — | 40 | 0 | — | — | 0 | masonry; support rule "span 24"; Bile dissolves it |
| 4 | `metal` | Metal | STATIC | — | 120 | 0 | glows ≥ 400 (no melt) | — | 0 | conducts Spark and heat fast (conductivity 0.45); Bile dissolves it |
| 5 | `glass` | Glass | STATIC | — | 10 | 0 | 1200 → `molten_glass` | — | 0.85 | tints light that passes (its ramp colour × 0.5 mixed in); shatters into `sand` |
| 6 | `wood` | Wood | STATIC | — | 30 | 6 | ignites 280 | — | 0 | beams, scaffolds; span 16; burns → `ember`/`ash` |
| 7 | `plank` | Plank (player-built) | STATIC | — | 22 | 8 | ignites 260 | — | 0 | always has `BUILT`; span 12; see `07-TRAVERSAL-PUZZLES.md` for building |
| 8 | `wax` | Wax | STATIC | — | 18 | 3 | 60 → `molten_wax` | — | 0.2 | Act 1 terrain; span 10; softly translucent at edges |
| 9 | `ice` | Ice | STATIC | — | 20 | 0 | 1 → `water` (after 90 ticks above) | — | 0.7 | span 20; slippery (friction 0.1); Rime makes it |
| 10 | `moss` | Moss | STATIC | — | 6 | 2 | ignites 180 | — | 0 | grows on stone/brick next to water (§7.7); a soft landing (the fall-damage rule itself is 07's) |
| 11 | `glowmoss` | Glowmoss | STATIC | — | 6 | 1 | ignites 200 | — | 0 | emits pale teal light (`#4fd6b8`, power 0.35 in `materials.json`); Act 3–4 decoration |
| 12 | `rope` | Rope cell | STATIC | — | 8 | 10 | ignites 180 | — | 0.5 | climbable; support rule "hang" (§10.3); Tether shape makes it |
| 13 | `web` | Web | STATIC | — | 3 | 20 | ignites 120 | — | 0.6 | Act 4 (Widow's silk); entities inside move at 35% speed |
| 14 | `bone` | Bone | STATIC | — | 30 | 0 | — | — | 0 | Act 2 ossuaries; crush → `ash` |
| 15 | `cloudstuff` | Cloudstuff | STATIC | — | 50 | 0 | — | — | 0.4 | Act 6 only: the bound cloud. When the Rain stops it dissolves into falling water (§8.7) |
| 16 | `dirt` | Dirt | POWDER | 15 | 8 | 0 | — | — | 0 | repose: slides if the diagonal is free 1 in 2 ticks |
| 17 | `sand` | Sand | POWDER | 18 | 5 | 0 | 1200 → `molten_glass` | — | 0 | repose: always slides (loose) |
| 18 | `silt` | Silt | POWDER | 13 | 4 | 0 | — | — | 0 | settles out of moving water (§8.6); slides 1 in 4 ticks (cakes) |
| 19 | `ash` | Ash | POWDER | 4 | 2 | 0 | — | — | 0 | lighter than water: **floats**; blown by wind; left by fire |
| 20 | `rubble` | Rubble | POWDER | 22 | 10 | 0 | — | — | 0 | what broken stone/brick/bone becomes; slides 1 in 3 |
| 21 | `ember` | Ember | POWDER | 5 | 4 | — | — | cools to `ash` below 150 | 0 | a glowing coal; starts at 700 °C; emits amber light; ignites what it touches |
| 22 | `water` | Water | LIQUID | 10 | — | 0 | 100 → `steam` | −5 → `ice` | 0.8 | dispersion 5; puts out fire; conducts Spark |
| 23 | `oil` | Lamp oil | LIQUID | 8 | — | 30 | ignites 200 | — | 0.5 | **floats on water**; dispersion 3; burns hot and long; how the player collects it is 07/08's |
| 24 | `molten_wax` | Molten wax | LIQUID | 9 | — | 4 | — | < 50 → `wax` | 0.4 | dispersion 1; hurts entities (`hurt` block in the JSON; Tallow's void zone, 05); starts 90 °C |
| 25 | `bile` | Bile | LIQUID | 12 | — | 0 | 100 → `miasma` | — | 0.6 | dissolves `metal`, `brick`, `bone`, `glass` (§7.5); diluted by water (§8.6) |
| 26 | `ichor` | Ichor | LIQUID | 11 | — | 1 | 100 → `smoke` | — | 0.3 | blood of the drowned things; dispersion 2; stains `bg` dark red where it touches; fades to nothing after 1,800 ticks |
| 27 | `mud` | Mud | LIQUID | 16 | — | 0 | 100 → `dirt` | — | 0 | dispersion 1 (slow); entities move at 60% |
| 28 | `molten_glass` | Molten glass | LIQUID | 25 | — | 0 | — | < 900 → `glass` | 0.5 | dispersion 1; 1300 °C; emits orange light; rare (overcharged Ember on sand) |
| 29 | `steam` | Steam | GAS | 0.3 | 120t–240t | 0 | — | < 90 → `water` 25% / air 75% | 0.75 | lifts entities (§12.5); scalds (1 dmg/10 ticks) above 90 °C |
| 30 | `smoke` | Smoke | GAS | 0.6 | 90t–200t | 0 | — | — | 0.85 | fades to air; darkens light |
| 31 | `miasma` | Miasma | GAS | 1.6 | 300t–500t | 25 | ignites 150 (flash) | — | 0.8 | **heavier than air**, pools in dips; poisons (the status is 03's); flashes into fire |
| 32 | `fire` | Fire | FIRE | 0.2 | 12t–40t | — | — | — | 1.0 | emits light (colour by fuel, §7.3); becomes `smoke` 40% on death |
| 33 | `spark` | Spark cell | FIRE | 0.2 | 3t–8t | — | — | — | 1.0 | Spark flame's crackle on metal/water surfaces; purely visual + `SHOCK` trigger |
| 34 | `rust` | Rust | POWDER | 14 | 3 | 0 | — | — | 0 | what Bile leaves of metal |
| 35 | `salt` | Brine salt | POWDER | 12 | 3 | 0 | — | — | 0 | left when bile+water dries; melts ice it touches (turns ice to water) |

("t" = ticks of lifetime, stored in `life` ÷ 4.) New ids append from 36 (R60). The renderer's palette and
material-info textures have 64 rows, so ids above 63 would need them resized; nothing planned comes close.

### 5.3 Lookup tables built from the JSON

`js/world/materials.js` turns `data/materials.json` into `Uint8Array`/`Int16Array`/`Float32Array` tables
of length 256, one per property: `cls`, `density` (float), `hp`, `flam` (0–100), `meltAt`, `meltTo`,
`freezeAt`, `freezeTo`, `boilAt`, `boilTo`, `igniteAt`, `transmit` (float), `conduct` (float),
`dispersion`, `repose` (1 in N), `lifeMin`, `lifeMax`, `supportRule` (0 none, 1 island, 2 span, 3 hang),
`span`, `emit` (RGB + power), `temp0`, `brokenTo`, `burnsTo`, `hurt`, `slow`, `climbable`, `alpha`, `absorb`,
`reflect`, `friction`, `ramps` and `resist[kind]` (5 floats). The JSON field shapes are in `10-TECH-DATA.md`
§5.1; the values are this page's.

### 5.4 Colour ramps (unlit albedo)

The unlit world is a narrow blue-grey band (00 §4). These are the albedo colours the shader multiplies
by light; they look dull on purpose. Ramp step 0 is darkest. `shade & 7` picks the step; materials with
fewer than 8 colours wrap (`step % len`), so a 4-colour ramp gets each colour twice as often.

| Material | Ramp (hex, dark → light) |
|---|---|
| bedrock | `#0b0d12 #10131a #151923 #1a1f2b` |
| stone | `#1f2530 #262d3a #2e3645 #353e4f #3d4758 #465163` |
| brick | `#2a2330 #32293a #3a3044 #2b2f3d` (mortar lines use step 3) |
| metal | `#2c3440 #384352 #455266 #56657b` |
| glass | `#2f4a55 #3d5f6c #507886` |
| wood | `#2b2019 #35281f #3f3026 #4a392d` |
| plank | `#4a3726 #56402d #634a34` |
| wax | `#5a5448 #6b6455 #7d7563 #8f8672` |
| ice | `#6f8fa8 #86a6bf #9fc0d8` |
| moss | `#1f3a2c #274735 #30553f` |
| glowmoss | `#1c4a44 #25605a #2f7870` |
| rope | `#4b3f30 #5a4b39` |
| web | `#6c6f7a #83868f` |
| bone | `#6a665c #7d786c #908a7c` |
| cloudstuff | `#5a6478 #6a7489 #7c879b #8f9aae` |
| dirt | `#2a241f #322b24 #3a3229` |
| sand | `#4a4436 #57503f #645c49` |
| silt | `#343632 #3d403a #464a43` |
| ash | `#3a3a3e #47474c #55555b` |
| rubble | `#2a303a #343b47 #3f4755` |
| ember | `#6b2410 #9a3a14 #d8601c` (+ heat glow) |
| water | `#0d1a2a #10213a #14294a` (+ transmitted background, §15) |
| oil | `#1d1a14 #29241a #352e20` (iridescent sheen in shader) |
| molten_wax | `#9c8a5e #b39f6d` (+ glow) |
| bile | `#2f4a14 #3d6019 #4b761f` |
| ichor | `#2a0c10 #3a1016 #4a141c` |
| mud | `#2b251d #332b21` |
| molten_glass | `#c2561a #e2782a` (+ glow) |
| steam | `#8a96a8 #a3aebd` (drawn at 35% alpha) |
| smoke | `#1d2026 #262a31` (drawn at 60% alpha) |
| miasma | `#3e4a26 #4c5a2e` (drawn at 45% alpha) |
| fire | `#ff5a1a #ff8a2a #ffc04a #fff0a0` (step picked by remaining life, emissive) |
| spark | `#fff27a #ffffff` (emissive) |
| rust | `#4a2a1a #5a3420` |
| salt | `#7a7c80 #8c8e92` |

Colours are data (`materials.json` → `ramp`), so the art pass can retune them without code.

### 5.5 Heat glow

Any cell above 350 °C gets a glow value `g = clamp((temp − 350) / 950, 0, 1)` written to the GPU texture's
alpha channel (§16.3). The shader adds `mix(#ff3a0a, #ffd070, g) × g × 1.6` as emission. So heated metal
visibly reddens, embers pulse as they cool, and molten glass is almost white.

### 5.5 Other names for the same materials (R60)

Pages and v1 drafts used material names that are not in the list. Each maps onto a built material, a grid flag
or something that is not a cell at all:

| Name used elsewhere | What it is in the engine |
|---|---|
| `lampstone` (unbreakable puzzle stone) | any material with the `PINNED` flag, drawn with the brass rim (§2.2, §16.8) |
| cracked / rotten / crust | the legend's `cracked` flag: the cell starts at half life (built in the compiler) |
| slag | `rust` |
| gravel | `rubble` |
| soot | `ash` |
| plank / brace / crate / ladder wood (build parts) | `plank` (always `BUILT`) |
| fuse | a run of `rope` cells with an end probe (07 owns the probe) |
| frost | an `ice` skin one or two cells thick |
| flesh | not needed: bodies and corpses are entities, not cells |
| glass shard | `sand` (what broken glass becomes) |
| sandbag cloth | the `bp_sandbag` prefab holding `sand` cells (07) |
| pipe | `metal` cells |
| blessed / poisoned / black water | `water` cells plus 03's combo or status on the water body, not a new material |
| `tar`, `snow` | parked (see Parked) |

---

## 6. Movement rules by behaviour class

All rules below run on one cell at index `i` during its pass. "Free" means the target cell is a material the
mover may **swap with**: air, a gas, or a liquid/powder of lower density. Swaps are always a full `swap(i, j)`
so nothing is created or destroyed by movement.

The constants in §6–§9 are the design values. The built passes are tuned in a few places, and the code's value
is what runs: fire rises with chance 0.5 and drifts sideways with chance 0.3; a fire cell ignites a flammable
neighbour with `p = flam / 25` per tick (burning cells spread with `flam / 100 × 0.6`); a liquid that has
wandered 24 cells sideways on a flat surface stops and is handed to the equaliser (`FLAT_LIMIT`). M1's
benchmark pass writes the final numbers back into this page.

### 6.1 POWDER

1. **Down:** if the cell below is free → swap. If the cell below is a liquid of lower density, swap only with
   chance `0.5` (so sand sinks through water visibly slower than through air).
2. **Diagonal:** else, if repose allows this tick (`repose` 1 in N; sand N = 1, dirt 2, rubble 3, silt 4),
   try the diagonal in this tick's scan direction first, then the other one. Both the side cell and the
   diagonal-below cell must be free (no squeezing through corners).
3. **Floaters:** a powder lighter than the liquid it sits in (ash, ember in oil) **rises** one cell with
   chance 0.3 instead of falling. Ember that touches water becomes ash with a hiss (steam cell above).
4. **Nothing:** if it did not move, it does not re-wake its chunk.

### 6.2 LIQUID

See §8.1 for the full rule; in short: down, diagonal down, then sideways up to `dispersion` cells.

### 6.3 GAS

1. **Rise** (density < 1) or **sink** (density > 1) one cell if the target is air or a gas of the opposite
   tendency; chance 0.8 so plumes look ragged.
2. Else **drift** sideways 1–3 cells (random), biased by the room's wind (`room.wind`, −1…1: chance of the
   downwind side = `0.5 + wind × 0.35`).
3. Lifetime counts down every 4 ticks (`life`); at 0 it becomes its decay product (steam → condenses, smoke
   → air, miasma → air).
4. Gases trapped under a ceiling spread sideways only; they pool, which is what makes a steam-filled
   chamber readable.

### 6.4 FIRE

1. Move up 1 cell (chance 0.7) if air, else sideways, else stay.
2. Try to ignite each of the 8 neighbours (§7.3).
3. Heat the 4 neighbours by +18 °C.
4. `life` down by 1 each tick; at 0: 40% → `smoke`, else air.
5. A fire cell touching water, ice or a `WET` cell dies at once, and the water side turns to steam with
   chance 0.35.

### 6.5 STATIC

Static cells never move in the cell passes. They can: take damage (`grid.damage`), heat/melt/ignite (§7),
lose support and fall as a fragment (§10), or be dissolved (§7.5).

---

## 7. Temperature, fire and reactions

### 7.1 The thermal pass

Runs only in `hot` chunks (§3.1), over each hot chunk's full 64 × 64 area, **every 2nd tick** (half the
cost, and nobody can see heat move at 60 vs 30 Hz). For each cell:

```
avg = (temp[L] + temp[R] + temp[U] + temp[D]) / 4
temp[i] += (avg - temp[i]) * conduct[mat[i]] * 0.5          // conduct: air 0.05, water 0.25, stone 0.08,
                                                          //   metal 0.45, wood 0.06, wax 0.1, ice 0.2
temp[i] += (12 - temp[i]) * 0.002                          // slow drift to ambient
```

A chunk leaves the `hot` list when every cell in it is within 4 °C of ambient and there is no fire/ember/
molten material. After the diffusion step the same loop checks **state changes** (§7.2).

### 7.2 State changes

| From | Condition | To | Extra |
|---|---|---|---|
| water | temp ≥ 100 | steam (keeps `FROM_WATER`) | the steam starts at 110 °C |
| water | temp ≤ −5 | ice (sets `FROM_WATER`) | Rime spells set −30 °C directly, so they freeze instantly |
| ice | temp ≥ 1 for 90 ticks (counter in `aux`) | water | salt neighbour halves the time |
| steam | temp < 90 and life < 50% | water 25% / air 75% | cap: steam never makes more water than was boiled (§8.8) |
| wax | temp ≥ 60 | molten_wax at 90 °C | Mother Tallow's melting |
| molten_wax | temp < 50 | wax | Tallow's hardening wax terrain |
| sand | temp ≥ 1200 | molten_glass | only reachable with overcharged Ember (`03-SPELLS.md`) |
| glass | temp ≥ 1200 | molten_glass | |
| molten_glass | temp < 900 | glass | |
| ember | temp < 150 | ash | embers start at 700 °C and lose heat through the thermal pass |
| bile | temp ≥ 100 | miasma | burning bile is how miasma clouds appear |
| ichor | temp ≥ 100 | smoke | |
| mud | temp ≥ 100 | dirt (+ steam above, 30%) | bakes |

### 7.3 Ignition and burning

- **Ignition chance per tick** for a flammable cell next to fire, ember, burning cell or a spell's heat:
  `p = flam/100 × (WET ? 0.25 : 1)`; or certain if `temp ≥ igniteAt`.
- **Burning** (`BURNING` flag on a solid/powder/liquid): each tick
  - spend 1 `life` (fuel) every `burnRate` ticks (wood 6, plank 4, rope 2, web 1, moss 3, wax: melts
    instead of burning, oil 3 — per cell);
  - heat self to `max(temp, 450)` and neighbours +12 °C;
  - with chance 0.35 put a `fire` cell in the air cell above (or beside, if above is blocked);
  - on fuel 0: wood → `ember` 30% / `ash` 70%; plank → `ember` 50% / air 50%; rope, web → air; moss →
    ash; oil → air (burnt away).
- **Fire colour** (what the light and the fire pixels use): wood/plank/rope `#ff8a2a` (Ember amber),
  oil `#ffb040`, miasma flash `#b8ff5a`, wax `#ffd27a`. Fire cells store a 2-bit fuel code in `aux` for this.
- **Put out:** a burning cell next to water/ice/steam loses `BURNING` with chance 0.5 per tick; Rime and Tide
  spells clear it outright (`03-SPELLS.md` §material interactions).

### 7.4 Flame-vs-material rules (cell side only)

`03-SPELLS.md` owns the numbers and the full flame × material reaction list; this is how each flame is
applied to cells. All go through `applyElement(game, x, y, r, flame, opts)` (built, `js/world/elements.js`;
`opts` = `{ power, dig, fromPlayer, maxCells, water }`, and it returns a summary — cells boiled, frozen,
ignited, dissolved — that 03's combos read):

| Flame | What it does to cells in radius `r` |
|---|---|
| `ember` | `heat +power×6 °C`; ignite flammables; ice → water; water → steam if it reaches 100 |
| `rime` | set temp to `min(temp, −30)`; water → ice at once (sets `FROM_WATER`, and `BUILT` if cast by player so it counts as a bridge); fire → air; burning cleared |
| `spark` | metal/water cells in radius get `SHOCK` for 30 ticks, then the shock spreads (§7.6); `spark` cells on surfaces for looks; ignites oil & miasma |
| `bile` | places `bile` liquid cells (power÷10 cells) and damages metal/brick/bone/glass (`acid` kind) |
| `gleam` | no cell change except `web` → air and `ichor` → air in radius (it "cleans"); strong light |
| `tide` | places `water` cells (power÷6) and pushes loose cells + liquids away from the impact point as particles (§13.3 with no damage) |
| `shade` | darkens: removes light from static emitters in radius for 8 s (sets a `shade` timer on the chunk light list, §14.2); no cell change |

### 7.5 Dissolving (Bile)

A bile cell touching `metal`, `brick`, `bone` or `glass` deals `acid` damage 1 per 6 ticks to it. When that
cell's HP reaches 0: metal → `rust`, brick → `rubble`, bone → air, glass → `sand`, and the bile cell has a
30% chance to be used up (→ air). So a pool of bile eats a hole through a metal floor over ~10 s and
leaves rust to fall through.

### 7.6 Shock (Spark in water)

When a water cell gets `SHOCK`, `liquids.electrify(i)` flood-fills the connected water body (4-neighbour,
budget **20,000 cells**, stops early past the budget) and sets `SHOCK` with a 30-tick timer on every
cell it reaches. Entities with any shocked cell in their AABB take the Spark damage from `03-SPELLS.md`
once per 10 ticks, **the player included** (verdict steal 5). Shocked water adds a flicker of white-yellow
light (§14.4). Metal passes shock on to touching metal and water the same way.

### 7.7 Slow growth and decay

Every 60 ticks, for 256 random cells in the sim window (cheap, `rng`-picked): moss grows onto a stone or
brick neighbour that is `WET` or next to water (chance 0.04); ichor ages (after 1,800 ticks → air); `WET`
timers tick down for solids not under open sky. This is the only "random sampling" rule; it is what makes
old rooms look grown-in without costing anything.

---

## 8. Liquids in depth

### 8.1 The liquid move rule

For a liquid cell at `(x, y)`, `dir` = last sideways direction stored in `aux` bit 0 (0 left, 1 right),
initialised from the scan direction:

1. **Down:** below is free (air, gas, or lighter liquid with swap chance `0.6`) → swap, done.
2. **Diagonal down:** try `(x+dir, y+1)` then `(x−dir, y+1)` (both side and diagonal must be free).
3. **Sideways:** walk up to `dispersion` cells in `dir`, stopping at the first non-free cell; move to the
   **furthest** free cell reached, but stop early at any cell that has a free cell *below* it (the liquid
   falls off the ledge next tick instead of floating over the gap). If `dir` is blocked at distance 0, flip
   `dir` and try the other way.
4. **Density sort:** if the cell above is a *denser* liquid (say this cell is oil and water sits on top of
   it), swap with chance 0.25. This is how a drop of oil poured into water rises to the top and how bile
   sinks under water.
5. **Settle count:** if nothing happened, increment the settle counter (`aux` bits 1–5); at 30 set
   `SETTLED`.

| Liquid | Dispersion (cells/tick) | Swap chance falling through lighter liquid | Viscosity feel |
|---|---|---|---|
| water | 5 | 0.6 | runs fast, fills gaps |
| oil | 3 | 0.6 | spreads thin on top of water |
| bile | 3 | 0.5 | |
| ichor | 2 | 0.5 | |
| molten_wax | 1 | 0.4 | creeps |
| mud | 1 | 0.3 | creeps |
| molten_glass | 1 | 0.5 | creeps |

Dispersion 5 at 60 ticks means a water front can run 300 cells/s along a flat floor — fast enough that a
broken dam reads as a rush, slow enough that you can see it.

### 8.2 Settling and waking

`SETTLED` cells are skipped by pass A after a single `flags` read. Any `set`/`swap` within 1 cell clears
`SETTLED` on its neighbours (`touch` does this for liquid neighbours). A still lake therefore costs
nothing, and a stone dropped into it wakes only a small ring.

### 8.3 Surfaces

A liquid cell is a **surface cell** if the cell above is air or gas. Surfaces are not stored; they are
found:

- by the shader (it tests the texel above, §15.1),
- by `liquids.surfaceAt(x, yFrom)` on the CPU (walk up from `yFrom` until not liquid) — used for swimming,
  ripples and splashes,
- per chunk, `liquids.surfaceSpans(chunk)` returns runs of surface cells `{x0, x1, y, mat}` for the ripple
  simulation (§15.2), recomputed only when the chunk's liquid cells changed.

### 8.4 Pressure-lite: the level equaliser

Plain falling-sand water does not rise in the second arm of a U-bend. We fix that cheaply and slowly:

Every **8th tick**, `liquids.equalise(budget = 6)`:

1. Take the next **dirty water body** from a round-robin list (a body is a 4-connected set of cells of one
   liquid; bodies are rebuilt by flood fill only when a cell in them changes, **budget 20,000 cells per
   fill**, larger bodies are split at the budget edge and treated as separate bodies).
2. Find its **highest surface cell** `top` (smallest y) and its **lowest open spot** `low`: an air cell
   4-adjacent to the body with the largest y that has a solid or liquid cell under it (or is inside the
   body's own container).
3. If `low.y > top.y + 2` (the open spot is more than 2 cells lower than the highest water), move one cell
   of that liquid from `top` to `low` (a `set` pair, no swap). Repeat up to `budget` times per call.

Net effect: a U-tube fills its second arm at 6 cells per 8 ticks = 45 cells/s, and a siphon over a wall
does *not* happen (the low spot must touch the body). It is also what makes water pour **up** out of a
flooded pipe into a lower room when a sluice opens. Cost is one flood fill per changed body, amortised.

### 8.5 Basins (sluice chambers)

Big deliberate floods and drains in Act 3 (`act3`) and the Sluicemaw arena must not depend on thousands of
cells finding their way through a pipe. A room can declare **basins** (`10-TECH-DATA.md` §6.4, op `basin`):
a named rectangle plus a target water level `y`. A basin controller:

- **fills** by adding one row-segment of water at the current surface each tick, up to `rate` cells/tick
  (default 120 cells/tick = one 120-wide row per tick), spawning falling water from its `inlet` points
  (visible spouts) for looks;
- **drains** by deleting cells from the **bottom-most open drain** first (so you see the whirl at the
  drain), up to `rate` cells/tick; the outflow is drawn as a gush of `liquid` particles flagged to **fade
  instead of becoming cells**, so the channel it pours into does not fill up (a `physical` basin skips this
  and really pours its water out);
- ignores cells that are not water (oil floats up as the water drains — which is a puzzle);
- reports `basin.level` to the wiring system so a door can open when the water reaches a line.

Basins are built (`createBasin`, `stepBasin` in `liquids.js`: default rate 120 cells/tick, modes `idle` /
`fill` / `drain`, `surface` reported each tick). They are for rooms whose water fits under the awake-liquid cap
(§20). **Any body bigger than that is a height-field flood (§8.9)**, and a basin can drive one: the Sluicemaw's
flood/drain cycle (05) is the Great Reservoir's height-field level, moved by the boss script through the same
`fill` / `drain` / `stop` wiring actions. **Cheaper fallback** if a basin still costs too much: fill/drain by
whole rows at once every 4 ticks.

### 8.6 Mixing

| A | meets B | Result |
|---|---|---|
| water | bile | the bile cell becomes water with chance 0.02 per tick of contact (it dilutes slowly); every 10 dilutions leave 1 `salt` cell |
| water | oil | they don't mix; oil floats (§8.1 step 4) |
| water | molten_wax | wax → `wax` (solid chunk) at once, water → steam 20% |
| water | molten_glass | glass → `glass`, water → steam 50% |
| water | ember / fire | ember → ash; fire dies; steam 35% |
| water | dirt (powder resting in it) | dirt → `mud` with chance 0.005 per tick (slow) |
| water (moving fast: moved sideways ≥ 3 cells this tick) | silt / sand | picks the powder up: the powder cell is carried one cell in `dir` with chance 0.1 (erosion); silt is dropped again where the water settles (§6.1) |
| oil | fire / ember / spark | ignites; burning oil spreads fire over its whole surface in ~1 s |
| ichor | water | tints: ichor cells in water fade to water after 300 ticks |

### 8.7 When the Rain stops (Act 6)

After the Storm's Eye (`a6_n06`) comes `cs_rain_stops` (00 §12), and control returns mid-fall in the
**Falling Flood** (`a6_n07`, three forced rooms): the cloudroot lets go of every lake it holds and the player
falls down its inside while the lakes pour past. The room script calls `liquids.release(region, speedRows)`:

- `cloudstuff` in the region dissolves from the top down at **2 rows per tick** — the cells become falling
  water drawn as `liquid` particles and height-field sheets, not awake cells;
- each authored lake in the region is a **height-field flood** (§8.9) whose level `release` drops at its own
  rate, so a lake "pours out" as its level falls and its thin band of real cells spills over the lip;
- `PINNED` flags on authored cloud dams are cleared so the ordinary support rules take over.

**Budget: the Falling Flood is authored to the cap** — at most **60,000 awake liquid cells** in the scene at any
moment (00 §13), everything else height-field. `room-check` measures the peak over the scripted fall and fails
the room above it. (The v1 figure of ~250,000 cells is parked.) The Dry Root (`a6_n08`) and the Dry Eye
(`a6_n09`) that follow are dry rooms: rain density 0, no rain deposits, and held water is gone.

### 8.8 Conservation

Water must not multiply. Rules that turn water into something else keep it countable:

- water → steam keeps `FROM_WATER`; steam → water only up to what was boiled: `room.steamDebt` counts
  boiled cells, condensation spends it, and at 0 steam just becomes air;
- water → ice keeps `FROM_WATER`, and ice with the flag always melts back to water;
- rain deposits are capped per room (§11.3).

`tests/unit/cells.test.js` asserts total water + steamDebt + ice(FROM_WATER) is constant over 2,000 ticks of a
boil/freeze room. Height-field water (§8.9) keeps its own volume and is outside this count; converting
between the two (a band cell sinking into the body, the level rising to absorb it) is one-for-one.

### 8.9 Height-field floods

Every big water in the game — Floodgate's rising water, the Long Descent floodline, the Sluicemaw's Great
Reservoir, the Spillway (`a3_n07`) and the Falling Flood (`a6_n07`) — is a **height-field flood**: the water is
stored as a **level** (a surface height), not as cells, so a flood of any size costs about the same.

**What it is.** A `flood` record per room, or one per **column band** (a vertical strip of the room, for water
that stands at different heights in different parts):

```js
flood = { id,
          rect: [x, y, w, h],    // the columns it covers (a whole room, or a band) and how deep it can go
          level,                 // surface row in cells (smaller = higher)
          target,                // row it moves toward; then it stops
          rate,                  // rows per second it moves at (built default 8)
          mat: 22,               // liquid id (water); oil floods are allowed
          band: 8 }              // rows of real cells kept at the surface (≤ 8; planned with M4)
```

**The band.** Inside the sim window (§3.4), the top `band` rows under `level` (**at most 8**) are real water cells,
so everything that needs cells works at the surface: rain ripples, splashes, Rime freezing a skin, Ember
boiling steam, oil floating on top, Spark electrifying the top layer, a thrown body splashing. Below the band the
body is **not cells**: the water shader draws it (depth tint and absorption from the level, §15.1), and entities
treat any point below `level` as water.

**Entities.** For swim, breath and soak (07 and 03 own those rules) an entity is "in water" if its box overlaps
the band's cells **or** lies below `level` inside `rect`. `sampleBox` (built, `collide.js`) adds the
height-field part to its liquid fraction; the head test uses `level` directly.

**Moving the level.** `rate` is in **rows per second** (Floodgate and the floodline: 0.5–8 rows/s, set by 09's
wave data; the Sluicemaw cycle by 05's script). Each tick the level moves by `rate × DT` toward `target`; each whole row it
crosses, the band is rebuilt: rising adds a row of cells at the top of the band and absorbs its bottom row into
the height field; falling does the reverse. Any cell the new band row would overwrite (a plank, a crate's
cells, sand) is left alone and the water flows round it. The whole rebuild is one row of `set` calls per
crossed row, well under the §20 budget (a 400-wide room rising 8 rows/s costs about 3,200 `set`s a second).

**Outside the sim window** the band is not kept as cells at all: the renderer draws the water from the level,
and the band is rebuilt when those columns come into the window.

**Drains and release.** `drain(id, rate)` / `fill(id, rate)` / `stop(id)` are wiring actions (10 §6.6).
`release(region)` (Act 6) sets every flood in the region falling at its authored rate and turns its band into a
pour over the region's lip (§8.7).

**Loading mid-flood.** A room that starts flooded loads with the height-field level in place and its band
already level (§19.5): nothing has to pour in.

**Room field.** A room lists its floods under `floodlines` (10 §6.2): `{ "id", "rect", "level", "target",
"rate", "mat" }`. Status: a **first cut is built** (`js/world/currents.js` `createFloodline` / `stepFloodline`):
it raises or lowers **real** water one whole row at a time across the rect, so only the surface row changes each
step. M4 turns the body under the band into height-field water as described above (the record and the wiring
stay the same). Acceptance: a flood raises 8 rows/s across 400 cells in ≤ 2 ms/tick (REVIEW M4).

### 8.10 Current zones

Falling-sand water has no velocity, so it cannot push anything. **Gameplay flow is authored**: a **current**
is a room thing (10 §6.5, type `current`):

```json
{ "t": "current", "id": "cur_channel", "rect": [320, 400, 480, 64], "v": [140, 0], "share": 0.6, "on": true,
  "cells": true }
```

- `v` is the flow vector in cells per second (its length is the current's strength); `share` is the fraction
  the player feels (default **0.6**); `on` is the starting state, and wires turn it on and off (`open` /
  `close` / `toggle`, 10 §6.6) — a pump, a sluice; `cells` (default true) lets loose cells drift.
- **Entities** in the rect have their velocity steered toward `v` (a drag toward the flow, built): the
  **player at 60%**, halved again while grounded; the Sluicewarden **immune** (a class passive, 04); enemies by
  their `swim` type (05); floats and crates at 100%.
- **Loose cells** (liquid and powder) inside the rect drift along the vector: each tick up to 60 random cells in
  the rect try one swap in the flow's direction into air (or, for a powder, into liquid), using the grid's
  seeded `rand`. So silt drifts downstream and water visibly leans, but no cell is created and nothing moves
  faster than one cell a tick.
- Cell water is **cosmetic for flow**. Anything that reads "flow" (a water wheel, a floating plank's drift, the
  Long Channel's current, 07's puzzles) reads a current zone or a basin's drain rate, never the cells.

Status: **built** (`js/world/currents.js` `createCurrents` / `stepCurrents`, called from the tick; unit test
`tests/unit/currents.test.js`). Acceptance: a current zone pushes a body at 60% (REVIEW M4).

---

## 9. Gases

| Gas | Rises / sinks | Lifetime (ticks) | Effect on entities | Light transmit |
|---|---|---|---|---|
| steam | rises fast (0.8/tick) | 480–960 | **lift** (§12.5); scald 1 dmg per 10 ticks while > 90 °C | 0.75 |
| smoke | rises (0.6/tick) | 360–800 | none; blocks light; Moth Oracle's "sight in darkness" sees through | 0.85 |
| miasma | sinks (0.4/tick) | 1,200–2,000 | poison (numbers in `05-BESTIARY-BOSSES.md`); flashes to `fire` when lit | 0.8 |

Gas caps: at most **6,000 gas cells** in a room. When a new gas cell would exceed it, the oldest-lifetime
gas cell nearest the spawn is recycled instead (the cloud looks the same and never grows without limit).
Gas drawing: steam and smoke draw at partial alpha over what is behind them (§16.5), so a room full of steam
is misty, not white.

---

## 10. Support, collapse and falling fragments

This is the part most worth copying from Tiny RTS in spirit (0-1 search from anchors, a budget, rigid
fall with a bottom profile, shatter on landing) but with three changes: natural stone gets its own cheap
rule, falling pieces become proper objects that hurt what they land on and push water aside, and there is
an even cheaper fallback when the budget runs out.

Status: **built**. The three support rules are `js/world/support.js` (`createSupport(world)` → `process(budget)`
returns loose groups; `grid.set` queues every changed static cell); `js/world/fragments.js` detaches, falls,
displaces liquid, crushes bodies, lands with shatter and powderises past the caps; the tick calls both
(`tests/unit/support.test.js`). Open: the shatter and powderise rolls use `Math.random` (M1 moves them to the grid's
seeded `rand`).

### 10.1 Support rules per material

| Rule | Materials | Holds if… |
|---|---|---|
| `none` | bedrock, moss, glowmoss, powders, liquids, gases | (bedrock is always an anchor; powders just fall; moss is a skin held by whatever it grows on) |
| `island` | stone, cloudstuff, bone | the 4-connected group of `island` + `span` cells it belongs to touches **bedrock, the room edge or a `PINNED` cell**. Stone has no span limit: a stone ceiling holds however wide it is, as long as it connects to the room frame somewhere |
| `span` | brick 24, wood 16, plank 12, wax 10, ice 20, metal 40, glass 6 | reaching sideways or hanging below costs 1 per cell from the nearest anchor, standing on a cell costs 0 (Tiny RTS's rule). Anchors: a cell resting on stone/bedrock/powder/`PINNED`/any held `span` cell below, or pressed from the side against stone/bedrock |
| `hang` | rope, web | connected (8-neighbour) through `hang` cells to any solid non-`hang` cell. No span limit, no weight. Cut the top and the whole strand drops |

The in-game rule the Tinker learns (`07-TRAVERSAL-PUZZLES.md` building): *"Straight up is free. Every cell
you reach sideways or hang below counts one. Past the material's reach, it breaks off."*

### 10.2 The island check (stone)

Triggered only when a stone cell is destroyed (by damage, dissolving, explosion). Queue the 4 neighbours.
For each queued stone cell not already solved this call:

1. Flood fill its 4-connected group of `island`/`span` solids, **budget 4,096 cells**.
2. If the fill reaches bedrock, the room edge or a `PINNED` cell → held. Stop.
3. If the fill **exceeds the budget** → treat as held (big rock is assumed to connect somewhere; rooms are
   authored with bedrock frames so this is true).
4. Otherwise the whole group is loose → **detach** it (§10.4).

A flood fill that ends early on reaching an anchor is cheap: most checks touch a few dozen cells.

### 10.3 The span check (built things)

Exactly the Tiny RTS 0-1 breadth-first search (a search where some steps cost 0 and some cost 1, done with
a double-ended queue): flood the connected `span` structure (**budget 8,192 cells**), seed every anchored
cell at distance 0, relax "up" at +0 and sideways/down at +1, and any cell with distance > its material's
`span`, or unreached, is loose. Loose cells are split into 4-connected groups; each group detaches.

### 10.4 Detach → fragment

A detached group becomes a **fragment** object (`js/world/fragments.js`):

```js
{ id, x, y,            // integer top-left in cells
  fx, fy, vx, vy,      // float position and velocity (cells, cells/s)
  w, h,                // bounding box
  mat: Uint8Array(w*h), shade, temp, life, flags,   // copies of the cells (0 = hole)
  bottom: Int16Array(w),                              // lowest filled row per column (fast landing test)
  mass,                // filled cell count
  fallen,              // cells fallen so far
  tex }                // a small GPU texture of its pixels (uploaded once), drawn as a sprite
```

The cells are removed from the grid (`set` to air, waking chunks and queueing support around them). Budget
per tick for the whole support system: **12,000 visited cells**; leftover queue entries wait for the next
tick (a crack that spreads a little late looks natural).

### 10.5 Falling, landing, crushing

Each tick: `vy += 900 × DT` (cap 480 cells/s), `vx *= 0.97`. Move down one cell at a time up to the new
`fy`; before each step test `bottom[]` against the grid (solid or powder below = blocked). Liquids **do not
block**: a fragment falling into water swaps its way down, pushing each displaced liquid cell up to the first
air cell above the fragment's top (capped at 400 displaced cells per tick; the rest become splash
particles). This is what makes a collapsing ledge throw a wave.

**Landing:** `shatter = clamp((fallen − 4) / 30, 0, 0.9)`. Each cell is written back into the grid at its
landing spot (or the first free cell above if something moved in); with chance `shatter` it becomes its
**broken form** (stone/brick → rubble, wood/plank → splinters = `rubble` shaded brown, ice → water with
`FROM_WATER`, glass → sand, wax → wax, bone → ash). Unbroken cells keep HP × `(1 − shatter/2)`. Landed cells
are queued for one more support check (a fragment landing on a ledge edge may tip off).

**Crush damage** to entities whose AABB the fragment enters: `mass × speed(cells/s) × 0.004`, once per
fragment per entity. A 200-cell slab falling at 300 cells/s does 240: collapsing a ceiling on a pack of
enemies is a real tactic (and a boss mechanic for the Bellfather, `05-BESTIARY-BOSSES.md`). The player can
stand on a falling fragment (it is a moving platform while it falls, §12.4).

Sideways push from explosions: `vx` from the blast (§13.1), blocked by any solid in the way.

### 10.6 Limits and the cheap fallback

| Limit | Value | What happens past it |
|---|---|---|
| Live fragments | 24 | the oldest lands immediately where it is |
| Fragment size | 6,000 cells | the group is **powderised** instead (fallback below) |
| Support budget / tick | 12,000 visited cells | the queue carries over to next tick |

**Cheap fallback ("powderise")**: instead of a rigid fragment, every loose cell is converted in place to its
broken form (rubble, sand, water…) and falling-sand rules take over. It looks like a crumble rather than a
slab falling, costs nothing extra, and is the path taken when the setting *Physics detail* is `low`
(02's settings screen) or when the over-budget ladder drops it (§20.4).

No rotation. Fragments fall straight; spinning debris is left to particles.

### 10.7 Gravity bands (Act 5)

A **gravity band** is a horizontal strip of a room where "down" points another way while a gravity lantern
or a bell toll says so (07 owns the lanterns, bells and puzzles; 05 owns the Bellfather's bands). The cell rule
is deliberately simple (R13):

- **What a band moves:** entities (the player, enemies, pickups, crates), live fragments, particles and rain.
  Inside the band their gravity vector is the band's direction (`up`, `down`, `left`, `right`) at the same
  magnitude.
- **What a band holds:** cells. While a band is flipped (any direction but `down`), every powder, liquid and gas
  cell inside it is **held**: pass A and pass B skip it after one row test (no flag bit is used; the grid's 8 flag bits are full), the thermal pass still runs (so a
  held pool can freeze or boil), and nothing else changes. Water hangs in the air as a still sheet — a better
  image than a buggy up-fall, and it cannot desync.
- **Flip back:** when the band returns to `down`, every chunk it covers is woken (`wakeRect`) and the held cells
  fall under the ordinary rules on the next tick.
- **Snap:** band edges snap to **8-cell rows** (one room block at block 8), so a band edge never splits a cell
  row and the held test is one comparison per row.
- **Readability:** every band draws its state on screen (an arrow rim in the overlay pass, §16.8) for at least
  700 ms before it acts (05's Bellfather rule).

Data: a `gravity_band` room thing (10 §6.5): `{ "t": "gravity_band", "id", "rect", "dir", "wire" }`.
Status: **planned** (M28). Acceptance: held cells are unchanged across a flip; band edges snap to 8 (REVIEW M28).

---

## 11. Rain, puddles, run-off and drips

### 11.1 Two layers

| Layer | Made of | Interacts |
|---|---|---|
| **Near rain** | particles in the sim (§18) | yes: hits cells, wets surfaces, ripples water, can deposit water |
| **Far rain** | streaks drawn by a shader over the background parallax (§16.4) | no; free |

Canon: rain is on in every act until the Rain stops **mid-Act 6**, after the Storm's Eye (`cs_rain_stops`,
00 §12). From then on near and far rain are off (density 0) for the rest of the campaign.

### 11.2 Near rain numbers

| Setting | Value |
|---|---|
| Spawn rate | `rain.density` drops per second per 100 columns of view. **By act: act1 60, act2 70, act3 90, act4 110, act5 130, act6 160; 0 after `cs_rain_stops`** (R59, 00 §4). Rooms can override (indoors 0). At 480 columns and density 90 that is 432 drops/s ≈ 7 per tick |
| Spawn where | a random x across view + 64 cells either side, y = view top − 8; **only in columns open to the sky** (`room.skyTop[x]`: the first solid y from the top of the room at load, updated when a chunk in the top band changes). Indoor columns spawn nothing |
| Fall speed | 420 cells/s ± 40, plus `wind × 90` sideways (wind per room, −1…1) |
| Drawn as | a 1 × 3-cell streak, colour `#8fa6c4` at 55% alpha, brighter where lit (they pick up the light map, §16.6) |
| Particle cap | 1,800 rain particles alive |
| Perfect dodge | when the player dodges in the last 100 ms before a hit (04's rule), every rain streak in view **freezes for 0.2 s** and the player's rim flashes (B21): the rain particles skip their move for 12 ticks, drawn at full alpha |

### 11.3 On impact (raycast per tick from last to new position through the grid)

| Hits | Effect |
|---|---|
| a solid/powder cell | set `WET` on it with a 900-tick timer (a sheen that lasts 15 s after the rain stops reaching it); spawn **2 splash particles** (1 × 1, up and outward, 40–90 cells/s, life 0.25 s); with chance `rain.deposit` (default **1/14**) place one water cell in the air cell above the hit. |
| a liquid surface | push an impulse of −0.6 into the ripple buffer at that x (§15.2); 1 splash particle; no deposit |
| an entity | 1 splash particle off its top and a 3 s cosmetic drip. Whether standing in rain applies `soaked` (the status that absorbed v1's `wet`) is 03's rule |
| a fire cell | fire life −4 |

**Deposit cap:** a room can gain at most `rain.maxDeposit` water cells from rain (default **8,000**, 0 for
indoor rooms). Beyond it, deposits stop and splashes still happen. Water that runs off a drain edge
(§2.4) refunds the cap one-for-one, so an outdoor room with drains keeps getting puddles forever while a
sealed pit does not slowly flood the level.

### 11.4 Puddles and run-off

Nothing special: deposited cells are ordinary water, so they run downhill, collect in dips (puddles) and
pour off ledges. Two small extras:

- **Soak:** a water cell resting on `dirt`, `moss` or `silt`, with no water neighbour on either side (a lone
  puddle cell), soaks away with chance 0.002 per tick (→ air, and the ground gets `WET`). Keeps thin films
  from covering every floor.
- **Evaporate:** a lone water cell under a ceiling (no sky) with no water neighbours evaporates with
  chance 0.0005 per tick.

### 11.5 Drips from ledges

At room load and whenever a chunk's solid shape changes, `rain.findDripPoints(chunk)` lists cells that are:
solid, `WET` (or within 12 cells below an open-sky column), with air below, and with a solid cell on at
least one side at the same height (an underside or overhang lip). Max **48 drip points** per room are active,
chosen nearest the camera.

Each drip point has a timer: a drop every `1.2–4.0 s` (seeded per point). A drip is a particle that swells
for 0.4 s on the lip (drawn 1 × 1 → 1 × 2), falls with gravity 900, and on impact behaves like a rain drop
with a 1/4 deposit chance. Drips also happen indoors — that is where they matter most for mood.

Authors can place fixed drips (`drip` prefab, `10-TECH-DATA.md` §6.5) and **streams** (a drip point that
emits a continuous 1-wide trickle of water cells at 20 cells/s, used for leaking pipes).

Built today (`js/world/rain.js`): sky-column spawning, the 1,800 cap, wetting, splashes, ripples, the deposit
chance and cap, and drip points (found at room load, merged with authored `drip` things). Two gaps M4 closes:
the rain and drip rolls use `Math.random`, so a deposit can differ between two runs of the same seed — they
move to a seeded stream (10 §4.4); and the soak/evaporate extras of §11.4 and the drain refund are not built yet.

### 11.6 Sound hook

Rain loudness follows spawn rate × fraction of sky columns in view; two ambience loops
`ambience.rain.heavy` / `ambience.rain.light` crossfade (`10-TECH-DATA.md` §10.4). Every 6th splash on metal
plays a tiny `rain.tick.metal` at low volume, capped at 8 per second. These three ids are **new** — the
shared `sfx/` catalog has no rain yet; `10-TECH-DATA.md` §10.4 lists what must be added to it. The rain is also
the bed of the procedural score (00 §13, 10 §10.5): it is the one sound that is always there until the Rain
stops, and the silence after `cs_rain_stops` is the score's biggest moment.

---

## 12. Entities against the grid

### 12.1 Collision shape

Every entity (player, enemy, NPC, pickup, projectile with a body) has an axis-aligned box `{x, y, w, h}` in
float cells, where `(x, y)` is the **bottom-centre** (feet). Solid for movement = `STATIC` or `POWDER`
cells, closed door cells, and live fragments. Liquids, gases and fire never block.

### 12.2 Moving (`moveBox(grid, body, dx, dy, opts)`, built in `collide.js`)

Move along x, then along y, in **1-cell sub-steps** (a body at 95 cells/s moves 1.6 cells a tick, so this is
1–2 checks per axis; a fast knockback at 400 cells/s is 7). Each sub-step tests the
column of cells the leading edge enters (`h` cells for x moves, `w` cells for y moves) — a 12-cell test, not
a whole-box test.

- **Step-up:** when an x step is blocked, find the lowest lift up to `opts.stepUp` cells at which the whole box
  fits; if there is one, raise the entity and continue. The player's values are `movement.json` `body.stepUp`
  / `stepUpRun` / `stepUpAir` (07 §2; built as 2 walking, 3 running, 4 in the air); enemies carry `stepUp` in
  `enemies.json` (05). This makes rough pixel slopes walkable at full speed without slope maths.
- **Step-down:** when grounded last tick and the next x step leaves the ground, snap down up to
  `opts.stepDown` cells (player: `body.stepDown`) if there is floor. Walking down a rubble slope stays glued
  instead of hopping.
- **Powders are solid** for bodies (built, R6); the slow-down on loose top layers is 07's number.
- **Ceiling:** a blocked upward step zeroes `vy`.
- **Grounded** = any solid cell directly under the box's bottom row (w cells tested).

### 12.3 Depenetration

Powders can fall into an entity's box, and fragments can land on one. At the start of each entity update,
if any solid cell is inside the box: push the entity up by up to **4 cells** to the first clear position;
if still stuck, try left/right up to 4; if still stuck, take **crush damage 5 per tick** and flag
`stuck` (the AI and the player's "dig out" melee both check it). This is the rule that keeps sand burying
you from ever trapping you permanently.

### 12.4 Standing on fragments

A falling fragment's cells are solid for entities. An entity grounded on a fragment moves with it
(add the fragment's `dy` this tick before its own move).

### 12.5 Liquids and gases on entities

Each tick, count cells in the entity's box (`grid.countIn`): `water`, other liquids, `steam`, `web`.

| Fraction of the box | Effect |
|---|---|
| liquid ≥ 0.15 | "wading": speed × 0.8 (mud 0.6) |
| liquid ≥ 0.55 | **swimming**: the switch into the swim state. The swim forces, the pre-Act-3 clumsy float and breath are 07's (`movement.json` `swim`) |
| head cell in liquid (or head below a height-field level, §8.9) | breath runs; drowning rules and breath pausing in menus are 07's |
| oil ≥ 0.3 | the body is tagged `oily` for 03's `vs` multipliers (a tag, not one of 00's statuses) |
| steam ≥ 0.2 | **steam lift**: `vy −= 1400 × steamFrac × DT`, upward speed capped at 90 cells/s (verdict steal 7) |
| web ≥ 0.1 | speed × 0.35, jump × 0.5 |
| any `SHOCK` cell | Spark damage tick (§7.6) |
| inside a current zone | pushed along its vector (§8.10) |
| inside a flipped gravity band | gravity points the band's way (§10.7) |
| molten_wax / molten_glass / bile | damage per 10 ticks from the material's `hurt` block; where the pool is a boss's void zone, 05's numbers win |

Entities entering or leaving a surface add a ripple impulse `± speed/200` and 3–8 splash particles.

### 12.6 Doors, gates, platforms

Doors (`door`, `timed_door`, `light_door`), sluice gates (`sluice_gate`) and portcullises (`portcullis`) are
**cells** (material `metal` or `wood` with `PINNED`) written and erased by their prefab (07 owns the kinds and
timings; 10 §6.5 the thing shapes). Their open/closed state is prefab state, so it persists (00 §13); the cells
are rebuilt from it on load. Opening = the prefab erases one row per 2 ticks
(animated slide); closing writes rows back and **pushes** liquid cells out of the way (they go into the
nearest free cell above — the gate cuts the flow) and crushes entities under it (5/tick, the gate stops if
blocked more than 20 ticks). Moving platforms and lifts are entities with a solid box, not cells.

### 12.7 Projectiles

Projectiles are points or small boxes moved with a per-tick **grid raycast** (DDA: step cell by cell along
the segment, first cell that stops it wins; a planned `raycast()` helper, 10 §3.2 — today each shape handler in
`js/spells/instances.js` walks its own path). What stops a projectile is per-shape:
`bolt` stops at solids and powders; `lob` bounces off solids with 0.4 restitution (twice) then detonates;
`beam` is a raycast every tick up to its range, stopping at solids, **passing through glass** with
power × 0.7; `wave` follows the ground surface using step-up of 6. Liquids slow projectiles (×0.5 speed)
except Tide ones. Full shape behaviour is `03-SPELLS.md`.

---

## 13. Explosions and debris

### 13.1 `explode(game, x, y, r, power, opts)` (built, in `js/world/elements.js`)

1. For each cell within radius `r` (disc), falloff `f = 1 − (d / r)²`:
   - damage `power × f` with kind `blast` (materials' `resist.blast` applies: stone 0.6, brick 0.8,
     metal 0.25, bedrock 0);
   - if destroyed: with chance **0.3** spawn a debris particle (§13.2) using that cell's colour, else the
     cell simply vanishes; liquids in the disc are not destroyed but **thrown** (§13.3);
   - heat: `+power × f × opts.heat` (Ember lobs set `heat` 4; a plain blast 1).
2. Entities in `r × 1.5`: damage and knockback per `03-SPELLS.md`; knockback direction from centre.
3. Live fragments in `r × 1.5`: `vx += (dx/d) × power × 1.5`, `vy −= power`.
4. Queue support checks on the rim (every destroyed cell's neighbours).
5. Light flash (§14.2 transient light: radius `r × 3`, 0.15 s) and camera shake `trauma += power / 150`.
6. Events: `bus.emit('explode', {x, y, r, power, source})` for sound and AI hearing.

Hard caps per explosion: **r ≤ 48**, **debris particles ≤ 120**, **liquid thrown ≤ 300 cells**. `PINNED` cells
are skipped entirely (built), which is what makes pinned puzzle geometry safe from blasts (00 §13).

Built today: steps 1 (carve by blast resist, debris, thrown liquid, heat), 4 (destroyed cells queue support
through `grid.set`) and 6 (the event); entity damage comes from the spell that caused the blast. Steps 3 (push
live fragments) and 5 (flash and shake) are planned.

### 13.2 Debris particles

Debris is a particle with the source cell's material and shade. It flies with `v = outward × (120–320)` +
up bias `−80`, gravity 900, bounces once (0.3). When it stops or after 1.5 s: if the material has a
broken form that is a powder (stone → rubble etc.) and the **per-second debris-to-cell budget (60 cells/s)**
has room, it becomes a cell where it landed; otherwise it fades. (Tiny RTS used the same 60/s cap and it
looked right.)

### 13.3 Thrown liquid

Liquid cells in the disc become **liquid particles** (same pool as splashes, but carrying a material) with
outward velocity 100–250. On landing each becomes a liquid cell again (always — liquid is conserved, it has
no budget), which is how a blast in a pool throws a sheet of water over the room.

### 13.4 Digging and melee

The player's pole melee and the "dig out" action call `grid.damage` on a small arc of cells (kind `cut`),
the swing numbers are 04's. How hard each material is to dig is the built `HARDNESS` table in
`js/world/elements.js` (sand, ash, rubble, web, rust 0; wax, dirt, silt, moss, rope 1; wood, plank, ice, glass,
bone 2; brick, cloudstuff 3; stone 4; metal 5); a shape or melee with `dig` ≥ a cell's hardness can cut it.
Melee alone cuts powders, moss, web, rope, wax and wood; stone needs spells or tools.

---

## 14. Lighting

### 14.1 The idea

The albedo world is dull blue-grey (§5.4). A **light map** (how much coloured light reaches each spot)
is computed every frame on the GPU and multiplied in. Colour enters the game only through light (00 §4). Light
is additive: an Ember bolt passing a Gleam ring makes warm gold where they overlap.

There are two readings of the same lights (R45): the **GPU light map** is what you see; the **CPU light grid**
(§14.7) is what the game believes. Both are built from one light list with the same falloff and the same
opaque test, so they agree; only the CPU grid is ever read by gameplay.

### 14.2 Light sources

A light is `{x, y, r, color: [r, g, b] 0–1, i, flicker, shadow: bool, cone?: {dx, dy, spread}}` (the built frame
format, `js/render/frame.js` `buildFrame()`). All live lights are gathered each frame into one array.

| Source | Radius (cells) | Intensity | Shadows | Flicker | Notes |
|---|---|---|---|---|---|
| Player's pole lantern | **the equipped lantern item's radius** (08); from Act 4, while `ambientTier` is `dark`, × the oil factor below; **hooded: 18** | 1.1 | yes | 0.05 | colour = the flame of the selected wick (built: `game.lanternRadius`, default 72 until items land) |
| Great Lamp (lit) | 360 | 2.2 | yes | 0.02 | fills a district's hub room; relighting grows r 0 → 360 over 3 s and starts the relight sweep (§14.6) |
| Lamp-post | 96 | 1.2 | yes | 0.04 | warm `#ffc46a` (built) |
| Wall lantern / brazier (`light` thing) | 64 | 0.9 | yes | 0.1 | |
| Spell projectile | 24–48 by shape (`shapes.json` `light`, 03) | 0.8 | **no** | 0 | colour = flame colour; burn-in raises intensity (03) |
| Spell impact flash | r × 3 | 1.5 → 0 over 0.15 s | no | — | transient |
| Beam | a line light: 6 point lights along it, r 20 | 0.5 each | no | 0.15 | |
| Fire cells | aggregated (§14.5) | — | up to 8 shadowed | — | |
| Enemy eyes, telegraphs, void-zone rims | 8–20 | 0.4–0.6 | no | 0 | **always present** (pillar 5) |
| Glowmoss, glowing water, molten | emissive pass only (§14.4) | — | no | — | |
| Shocked water | emissive flicker | — | no | 0.5 | |

**Lantern oil factor (Act 4 on, dark only):** `radius × (0.5 + 0.5 × oil / maxOil)`, so an empty-ish lantern
lights half its radius. The oil it burns in the dark is 08's number (shared table: 2.5 oil/s base, hooded ×0.25).

**Last drop (B4).** When oil reaches 0 in the dark the lantern **gutters out**: over **0.4 s** its radius and
intensity fall to 0 with an ease-in curve (a short flare to 1.2× at the start, then collapse), a hiss plays, and
the lantern light is removed from the list. It can be relit only at a lamp-post, a sconce, or by striking a
burning cell with the pole (07 owns the relight actions; 05 owns the Unlit converging on you).

**Budgets:** the built light pass reads up to **128 lights** a frame (`MAX_LIGHTS`). Inside that, at most
**24 shadowed**; past either cap the dimmest by `intensity × r / distance-to-camera` are dropped (shadowed
ones first become unshadowed).

### 14.3 The GPU light map (built)

- **Resolution:** half of the view in each axis **plus a 32-cell margin** on every side (so lights just
  off-screen still light the edge): for the 482 × 272 scene target, 273 × 168 texels. Format `RGBA16F` when
  `EXT_color_buffer_float` exists, else `RGBA8`.
- **Light list:** uploaded each frame into a 128 × 3 `RGBA32F` texture (row 0 position + radius, row 1 colour +
  intensity with flicker applied, row 2 cone + shadow flag).
- **One pass for all lights:** a full-screen shader over the light map. Each texel starts at the ambient colour
  (a top-to-bottom gradient, §14.6) and loops over the lights: `falloff(t) = (1 − t²)²` with `t = dist / r`
  (smooth to zero at `r`), times the cone term for cone lights
  (`smoothstep(cos(spread), cos(spread × 0.7), dot(dir, toTexel))`).
- **Shadows:** for a shadowed light the shader **marches from the texel toward the light** through the cell
  texture (`steps = min(32, ceil(dist / 1.5))`), reading each cell's `transmit` from the material-info
  texture. Clear cells multiply by `mix(1, transmit, 0.85)`; the first 2.5 cells of solid at the end of the ray
  are free (so a wall's lit face shows), then an opaque cell zeroes the ray. Stops early below 0.02.
- **Glow:** the emission buffer (§14.4) is added after the lights.

Cost check: the built pass is one draw; its cost is texels × lights × march steps. At 128 lights it is the most
expensive pass, which is why the shadowed count is capped at 24. **Planned fallbacks** if the light pass goes
over its 2.0 ms GPU budget (measured with timer queries when available): (1) big lights (r > 160) march at
quarter resolution into their own buffer; (2) shadowed lights switch to a 1D shadow map each (256 angle rays into
a 256 × 1 row, texels compare distance to the stored blocker) — hard shadows, no partial transmission, a tenth
of the cost.

### 14.4 Emission and glow

Emissive cells (fire, ember, molten wax/glass, spark, glowmoss, hot metal glow §5.5, burning and shocked cells,
lit lamp glass) and emissive sprite pixels write colour into the **emission** target of the scene pass (§16.5).
For lighting their surroundings, the emission target is downsampled to the light-map resolution, blurred with a
separable blur (two passes), and **added to the light map** (no occlusion — a cheap glow that bleeds a little
round corners, which reads as warmth). This is how a burning scaffold lights the room without 2,000 lights.
Built.

### 14.5 Aggregated fire lights (planned, M3)

For shadows from big fires, `aggregateFire()` runs every 4 frames: split the view into 32 × 32-cell blocks,
count burning/fire/ember cells per block, and turn the **8 blocks with the most fire** (min 12 cells) into
shadowed lights at the block's fire centroid, radius `24 + 6 × sqrt(count)` (cap 110), intensity
`0.4 + count/200` (cap 1.4), colour from the dominant fuel (§7.3), flicker 0.25.

### 14.6 Ambient per district and the relight sweep

| District | Ambient before relighting | After the Great Lamp is lit |
|---|---|---|
| act1 Lanterncrown & the Wax Stair | `#2a3348` × 0.55 | `#5a4a3a` × 0.7 (warm) |
| act2 Gutterways | `#1e2a33` × 0.45 | `#3a4a3a` × 0.6 |
| act3 Sluice Ward | `#1a2a40` × 0.5 | `#2f4f6a` × 0.65 |
| act4 Blackwater | `#0a0d14` × 0.2 | `#302a40` × 0.5 |
| act5 Bellwell | `#2a2433` × 0.45 | `#4a3a52` × 0.6 |
| act6 Cloudroot | `#3a4458` × 0.6 → after `cs_rain_stops` `#8a8fa8` × 0.9 | (n/a — the Sky Lamp ends the game) |

Ambient has a slight **vertical gradient** per room (`ambientTop`, `ambientBottom`; default bottom = top × 0.6)
— deep rooms darken downward (built: the light pass takes `ambTop` / `ambBot`). The **light floor is 0.08 in
every room** (shared table, R46): the composite adds it after lighting so terrain silhouettes never go pure
black. The 02 setting "Brightness floor" raises it by up to +0.1. (The built boot passes `floor: 0.1` for the test
hero; M3 sets 0.08 and the dark-screenshot spec tests it.) Act 4 is dark because of its ambient, not because of
a lower floor. The values live in each act file's `ambient` block (`data/acts/actN.json`, 10 §5); rooms can
override.

**Relight sweep (B3).** When a Great Lamp is relit, the district's ambient ramp moves from its "before" colour to
its "after" colour as a **wave that runs down the district over 3 s**: each texel's ambient is
`mix(before, after, smoothstep(0, 1, (t × speed − depthInDistrict) / 0.4))`, where `depthInDistrict` is the
room's normalised depth in its act (0 at the top) plus the texel's height in the room. At the moment the wave
front passes, every puddle and water-surface reflection **pulses** (reflectivity +0.3 for 0.5 s, §15.1), and the
score adds the district's new drone voice (10 §10.5). It is two uniforms and a timer; no new pass. The hub
room plays it in full; other rooms of the act simply load with the "after" ambient.

### 14.7 The CPU light grid and light tiers (gameplay truth)

The GPU light map is never read by gameplay (a readback stalls the GPU). Instead:

- **The grid.** A CPU light grid at **1/8 resolution** of the room (one value per 8 × 8 cells), updated
  **every 4 ticks** for the sim window. It uses **the same light list, the same falloff `(1 − t²)²`, the same
  ambient gradient and the same opaque test** as the shader (cells with `transmit` < 0.05 block; others
  multiply), marching at 8-cell steps. It stores luminance plus the same value **without the player's own
  lantern**.
- **Tiers** (shared table, 00 §13):

| Tier | Luminance | Meaning |
|---|---|---|
| `dark` | < 0.2 | Unlit hunt here; oil regen stops (Act 4+); Moth Oracle's darkness crits |
| `dim` | 0.2 – 0.5 | |
| `lit` | ≥ 0.5 | Unlit flee |
| `bright` | ≥ 0.8 | |

  Floor 0.08 (§14.6). Everything that asks "how light is it here" asks for a **tier**, never a raw number.
- **Two readings.** `lightTier(x, y)` counts all light. `ambientTier(x, y)` leaves out the player's own
  lantern — it drives the oil economy and the hood (a lantern cannot light its own way out of "the dark"). What
  each tier *does* belongs to its owners: AI senses (05), oil and lantern burn (08, 03), Moth Oracle (04).
- **Agreement test.** A test-only async readback of the GPU light map at 1/8 resolution (one frame, in
  Playwright) must put **≥ 95% of tiles** in the same tier as the CPU grid (REVIEW M3).
- **Readability rule (pillar 5):** enemy eyes, attack telegraphs, void-zone rims, band arrows and the brass rim
  of pinned cells are drawn in the **unlit overlay** (§16.8), after lighting, so no amount of darkness hides them.
  Only terrain and bodies go dark.
- **Shade** spells cast on a light source dim static emitters for 8 s (§7.4); that removal shows in both the
  GPU map and the CPU grid because both read the same list.

Status: GPU side built. **The CPU grid and tiers are built** (`js/world/lightgrid.js`: `createLightGrid(grid)` →
`update(lights)` every 4 ticks from `collectLights(game)`, `at(x, y, own)`, `tier(x, y)`, `ambientTier(x, y)`,
floor 0.08). As built its opaque test is **coarse** — each 8 × 8 tile's opacity is the average `1 − transmit` of
its cells, rebuilt every 60 ticks — rather than the shader's per-cell march; the agreement test (planned, M3) is
what tells us whether that is close enough, and if it is not, the grid marches cells the way the shader does.

---

## 15. Reflections and wet sheen

Water is where the game shows off (R81). Three tricks carry it, and each has a cheap, bounded cost:

1. **Surface ripples** — a spring chain per screen column (§15.2) that rain, drips, splashes and bodies
   disturb; the only place ripples move real pixels is the surface line (±2 cells).
2. **Pour and jet particles** — water leaving a basin, a burst dam or a thrown blast travels as `liquid`
   particles (§13.3, §18) and becomes cells again only where it lands, so a gush reads as a gush without
   thousands of awake cells in flight.
3. **Height-field floods** — big water is a level, not cells (§8.9); the shader draws the body below the
   thin band of real cells with depth tint and reflections as if it were cells.

**One showcase room per act** is about water or light looking good (B2, R81); 09 names the room. Act 1's is
the Guild Hall balcony over the chasm: the guttering Crown Lamp, both rain layers, puddle reflections and the
city's dead lamps below.

### 15.1 Water reflection (screen space, in one shader pass; built)

For every screen texel whose cell is a liquid (from the cell texture), the water shader:

1. **Finds the surface** by stepping up in the cell texture until a non-liquid texel, **max 64 steps**;
   `depth = texel.y − surface.y`. If none found in 64, treat as deep (depth 64).
2. **Reflection sample:** mirror about the surface line: `ry = surface.y − (depth) − 1` with ripple offset
   `ry += ripple(x) × 2.0` and `rx = x + rippleSlope(x) × 3.0 + sin(time × 1.3 + depth × 0.4) × 0.6`.
   Sample the **lit composite** buffer (§16.6) at `(rx, ry)`.
3. **Transmitted sample:** the lit background behind the water (the `bg` wall and parallax), at `(x + wobble,
   y)` with `wobble = sin(time × 2 + y × 0.3) × 0.5`, tinted by the liquid's colour and darkened with depth
   `exp(−depth × absorb)` (water absorb 0.06; oil 0.2; bile 0.1; mud 0.5).
4. **Fresnel (made simple):** our view is side-on, so "angle" becomes "how close to the surface":
   `refl = reflectivity × (1 − smoothstep(0, 24, depth))` with reflectivity water 0.55, oil 0.7 (+ a thin-film
   rainbow sheen from `hue = fract(x × 0.02 + time × 0.05)` at 0.12 strength), bile 0.35, molten liquids 0.
   Final = `mix(transmitted, reflected, refl)`, then the surface texel line itself gets a 1-cell
   highlight = light map at that texel × 0.8 (a bright waterline).
5. **Glints:** where the light map at the surface is bright (> 0.6) add sparkle
   `step(0.985, hash(x, floor(time × 8)))` × light colour — a few twinkling points under each lantern.

Built values differ slightly: reflectivity water 0.55, oil 0.7, bile 0.35, mud 0.2 (others 0); the Fresnel
fade runs over 26 rows; the transmitted side is the lit scene darkened by `exp(−depth × 0.02)`; the waterline
highlight is `light × 0.55`. Below a height-field band (§8.9) the shader takes `depth` from the flood level
instead of stepping up through cells. During a relight sweep (§14.6) reflectivity is raised by 0.3 for 0.5 s as
the wave passes.

Reflections of reflections are not attempted. Things above the view top can't be reflected; near the top
of the screen the reflection fades out over 16 texels.

### 15.2 Ripples

A **1D ripple height array per visible surface run** (from `liquids.surfaceSpans`, §8.3), simulated on
the CPU as a simple spring chain: `v[i] += (h[i−1] + h[i+1] − 2h[i]) × 0.3 − h[i] × 0.02; v[i] *= 0.985;
h[i] += v[i]`. Impulses: rain (−0.6), drips (−1.0), entities entering/leaving (±speed/200, cap 3), splashes
from explosions (−4 near centre). Run lengths are capped at the view width (surfaces off-screen don't ripple).
The combined array for the view is uploaded each frame into a **1024 × 1 `R32F` texture** (built; one
height per screen column, for the surface nearest the camera's middle row where two surfaces share a column — rare,
acceptable). The visible surface line itself is displaced by `round(h)` cells (±2 max) — the only place
ripples move actual pixels.

### 15.3 Wet sheen

Solid cells with `WET` get a sheen in the composite shader:

- **Where:** only top-facing surfaces and the first 3 cells below them (the shader tests "air/rain above
  within 3 texels"), and vertical faces at 40% strength.
- **What:** `spec = lightMap × sheen × (0.35 + 0.65 × noise(x, y, time × 0.2))`, sheen = 0.6 for stone/brick,
  0.8 metal, 0.3 wood, 0 for powders except `mud` 0.5. Plus a **puddle mirror**: on top surfaces that are
  `WET` **and** flat for ≥ 6 cells, mirror the 6 texels above at 18% alpha with the ripple wobble — a wet
  street reflecting a lantern.
- **Glints:** as §15.1 step 5, but density 0.992 and only where light > 0.5.

The wet mask comes from the cell texture's flag channel (§16.3) so it costs no extra upload.

---

## 16. The WebGL2 render pipeline, pass by pass

The pipeline is **built** (`js/render/webgl2.js`, all shaders in `js/render/shaders.js`, helpers in `gl.js`;
file list in 10 §3.3). This section describes it as it is, then marks what is planned.

### 16.1 Targets and sizes (1080p example: view 480 × 270, targets are view + 2 cells)

| Target | Size | Format | Contents |
|---|---|---|---|
| `cellTex` | room size (≤ 2048²) | `RGBA8UI` (integer) | R material, G shade, B flags (the §2.2 bits), A heat glow |
| `bgTex` | room size | `R8UI` | background-wall material (uploaded at room load and on scorch updates) |
| `paletteTex` | 8 × 64 | `RGBA8` | ramp colours per material (row = material id) |
| `matInfoTex` | 64 × 1 | `RGBA32F` | per material: alpha, `transmit`, emissive power, ramp length ÷ 8 |
| light list | 128 × 3 | `RGBA32F` | §14.3 |
| scene (MRT) | 482 × 272 | `RGBA16F` × 2 | albedo (alpha = a marker: 1 solid, 0.5 liquid, 0.3 see-through, 0.1 sky); emission |
| `light` | half view + 32-cell margin (273 × 168) | `RGBA16F` | light map |
| `emisS` / `emisB` | same as `light` | `RGBA16F` | emission downsampled and blurred (§14.4) |
| `lit` | 482 × 272 | `RGBA16F` | composite (lit scene) |
| `water` | 482 × 272 | `RGBA16F` | lit scene with water and reflections applied; overlays drawn on it |
| `bloom[0..3]` / `bloomUp[0..2]` | ½, ¼, ⅛, 1/16 of the target | `RGBA16F` | bloom chain |
| `rippleTex` | 1024 × 1 | `R32F` | ripple heights (§15.2) |
| canvas | window | default | final |

`RGBA16F` targets fall back to `RGBA8` when `EXT_color_buffer_float` is missing. Everything world-space is
rendered at **logical resolution** (1 texel = 1 cell). Only the last pass touches window pixels.

### 16.2 Room texture size

`cellTex` is room-sized so the camera just moves a window over it. WebGL2 guarantees 2048 as the smallest
max texture size, hence the 2048 × 2048 room cap (§1). Memory: 2048² × 4 B = 16.8 MB of GPU memory; typical rooms
2 MB. Long vertical places (the Bellwell, the Cloudroot climb) are split into stacked rooms (09).

### 16.3 Pass 0 — upload (CPU → GPU)

For each chunk with a non-empty `gfx` dirty rect **that intersects the view + 64 cells**, pack the rect into a
staging `Uint8Array` (mat, shade, flags, glow — 4 bytes a cell) and `texSubImage2D` it. Dirty rects outside the
view stay dirty until they come into view. Budget: **≤ 0.8 ms**, normally ~40 k cells a frame in a busy scene
(≈ 160 KB). **Planned:** a 250 k-cell cap per frame (upload the biggest rects first, carry the rest) — the built
upload has no cap yet.

Particles and sprites are instanced (§16.5). Fragments (planned) upload their own small textures once.

### 16.4 Pass 1 — scene (albedo + emission, MRT, one full-screen shader + instanced batches)

One full-screen shader (`SCENE_FS`) draws, per texel:

1. **Background:** where the cell is air or see-through: the `bgTex` wall through its ramp × 0.5 (brick gets
   mortar lines from `(x, y)`); where there is no wall (sky), a **sky gradient** (theme `sky.top` / `sky.bottom`),
   **three parallax silhouette layers** (scroll factors **0.15, 0.35, 0.6**, drawn procedurally from a hash, with a
   few lit windows as emission) and **far rain streaks** (two layers at 380 and 260 cells/s, slant = wind,
   alpha scaled by the rain setting). Zero cost to the sim.
2. **Cells:** `paletteTex[mat][shade & 7]` (wrapped to the ramp length), ±4% grain from the shade's high bits,
   brick mortar and plank grain from `(x, y)`; mixed over the background by the material's alpha.
3. **Emission:** emissive materials, heat glow (§5.5), burning cells (flicker), shocked cells (crackle).
4. **Marker:** the albedo alpha tells later passes what the texel is (liquid 0.5, see-through 0.3, sky 0.1).

Then **sprites and particles** are drawn into the same two targets as instanced quads from one atlas
(`BATCH_VS` / `BATCH_FS`, up to 8,192 per draw): albedo, plus emission for emissive sprites and for atlas pixels
marked emissive (§25.1).

**Planned:** pre-rendered per-act parallax textures (`backdrops`) to replace the procedural skyline, lit by a
blurred copy of the light map so a Great Lamp lights the distant city.

### 16.5 Pass 2 — glow

Downsample the emission target to the light-map size (with the 32-cell margin), then a two-pass separable blur
(§14.4).

### 16.6 Pass 3 — light, then composite

1. **Light** (§14.3): ambient gradient → every light (shadowed ones march) → blurred emission added.
2. **Composite** into `lit`: `lit = albedo × (light × gain + floor) + emission`, with `gain` 2.4 (built) and
   `floor` the room floor (0.08, §14.6). The light map is sampled bilinearly (it is half-res; bilinear hides the
   texels). **Wet sheen** (§15.3) is added here from the flags channel of `cellTex`.

### 16.7 Pass 4 — water

Full-screen pass over `lit` → `water`, doing §15.1 only on texels the scene marked as liquid (others copy
through). **Planned:** skip the pass (copy) when no chunk in view holds liquid.

### 16.8 Pass 5 — overlays that ignore light

Drawn onto `water` after lighting, so darkness never hides them (pillar 5):

- **Alpha overlays:** enemy eyes, telegraph shapes, void-zone rims, pickup outlines, the build-mode ghost,
  in-world 5 × 7 text, and **near-rain streaks, splashes and drips** (built: rain is drawn here as 1 × 3
  streaks at 50% alpha).
- **Additive overlays:** sparks, embers, glints, moths.
- **Brass rim (planned, M9):** every `PINNED` cell that borders air gets a 1-cell rim in brass `#b08a4a` at
  35% alpha, so puzzle-critical cells read as "safe, unbreakable" in any light (00 §13, B9).
- **Gravity-band arrows (planned, M28):** each band's edge draws its current direction (§10.7).
- **Rekindle shimmer (planned, M9):** §19.5.

Damage numbers are DOM, not this pass (02).

### 16.9 Pass 6 — bloom

Threshold at luma 0.85 with a soft knee (0.2), four downsamples, three upsamples adding each level back, then
added in the final pass at strength **0.35** (settings: off / 0.2 / 0.35 / 0.5, 02). Crisp pixels are kept because
bloom is only added on top; the base image is never blurred.

### 16.10 Pass 7 — final

1. **Bloom add**, then a **soft shoulder** tone curve (values above 0.8 are compressed), a per-act
   lift/gamma/gain grade (numbers in the act file's `grade` block), a light vignette (0.12) and an optional
   full-screen flash (colour + amount, capped by the reduced-flashes setting).
2. **Integer upscale:** the `water` target is drawn to the canvas with nearest sampling at scale `s` (§19.4),
   offset by the camera's **sub-cell remainder × s** screen pixels (the targets are view + 2 cells, one extra on
   each side, so smooth scrolling never shimmers), centred in the canvas.
3. The DOM HUD sits over the canvas (02).

### 16.11 Shader programs (all in `js/render/shaders.js`, GLSL ES 3.00 in template strings)

| Export | Pass | Inputs → output |
|---|---|---|
| `FULL_VS` | every full-screen pass | — |
| `SCENE_FS` | 1 | `cellTex`, `bgTex`, palette, matInfo → albedo + emission |
| `BATCH_VS` / `BATCH_FS` | 1 | atlas, instance buffer → albedo + emission |
| `DOWN_FS` / `BLUR_FS` | 2, 6 | downsample (with optional threshold) / separable blur |
| `LIGHT_FS` | 3 | `cellTex`, matInfo, light list, blurred emission → light map |
| `COMPOSITE_FS` | 3 | albedo, emission, light, `cellTex` flags → `lit` |
| `WATER_FS` | 4 | `lit`, light, `cellTex`, ripple, matInfo → `water` |
| `OVERLAY_FS` (with `BATCH_VS`) | 5 | atlas, instances → `water` (alpha and additive) |
| `UP_FS` | 6 | bloom upsample |
| `FINAL_FS` | 7 | `water`, bloom → canvas |

`gl.js` `compile(gl, vs, fs, name)` compiles and links, and throws with the program name on any error (the boot
panel shows it).

### 16.12 Context loss

Built: `webglcontextlost` is caught and `stats.lost` set. **Planned (M2):** on restore, recreate every target,
mark every chunk `gfx` dirty and re-upload; a Playwright spec forces this with `WEBGL_lose_context`.

---

## 17. Canvas2D debug view

The game needs **WebGL2** (R33). Without it the boot panel shows a plain **"Lanternfall needs WebGL2"** card
(what to try: a current desktop Chrome, Firefox or Edge, hardware acceleration on) instead of the title screen.

Canvas2D exists only as a **flat-colour debug and test view** (planned, M2): one `ImageData` of the view, each
cell painted its material's middle ramp colour, no lights, no reflections, no bloom, no particles beyond rain as
dots. It is opened with `?view=flat` (and by the debug overlay's "material ids" toggle), and Node tools use the
same flat colours for room thumbnails (10 §6.11). It is never a second renderer: no spec compares it to the
WebGL2 picture, and no feature is ever built for it. (The v1 fallback renderer is in Parked.)

---

## 18. Particles

One pool, struct-of-arrays in typed arrays (built, `js/entities/particles.js`: `x, y, vx, vy, life, max, kind,
mat, col, g`), **4,000 max**. Updated in the sim step (they can turn into cells, so they must be deterministic
and fixed-step); drawn through the scene, overlay and additive batches (§16).

| Kind | Budget | Looks | Physics | Becomes |
|---|---|---|---|---|
| `rain` | 1,800 | 1 × 3 streak `#8fa6c4` 55% | 420 cells/s + wind, no gravity change | splash / water cell (§11.3) |
| `splash` | 500 | 1 × 1, water-coloured, lit | gravity 900, life 0.2–0.4 s | nothing |
| `liquid` | 400 (not budget-limited on landing) | 1 × 1 liquid colour | gravity 900 | liquid cell (§13.3) |
| `drip` | 48 (one per drip point) | 1 × 1 → 1 × 2 | swells 0.4 s, gravity 900 | as rain, 1/4 deposit |
| `spark` | 500 | 1 × 1 emissive, flame colour | gravity 400, drag 0.96, life 0.2–0.6 s | nothing |
| `ember` | 250 | 1 × 1 emissive amber, flickers | rises −30 cells/s ± 20, drifts with wind, life 1–3 s | nothing (landing in oil ignites it) |
| `debris` | 400 | 1 × 1 cell colour | gravity 900, 1 bounce 0.3 | powder cell within 60/s budget (§13.2) |
| `dust` | 150 | 1 × 1, 25% alpha | slow drift, lit only | nothing (ambient motes in light beams) |
| `moth` | 40 | 2 × 1 wing flap sprite, pale | steers toward the nearest light within 120 cells (seek 60 cells/s, wobble), orbits at 6–12 cells | nothing; cosmetic, never an AI signal |
| `smoke` | 150 | 3 × 3 soft blot, 30% alpha | rises, grows | nothing (cosmetic puffs where cells can't be spared) |
| `glint` | 60 | 1 × 1 additive, light colour | still, life 0.1–0.2 s | nothing (sparkles on wet stone and water) |

Overflow: rain stops spawning at its 1,800 budget (built); when the whole pool is full a new particle takes a
random slot (built). **Planned:** per-kind budgets replacing the oldest of that kind. The *Particles* setting
(02) scales every budget (low 40%, medium 70%, high 100%). Cosmetic kinds that never become cells (`splash`,
`spark`, `ember`, `dust`, `moth`, `smoke`, `glint`) may use `Math.random`; kinds that can become cells (`rain`,
`drip`, `liquid`, `debris`) must use a seeded stream (10 §4.4).

---

## 19. Camera and room transitions

### 19.1 Follow

- **Target point** = player feet − 6 cells (the lantern is the centre of attention) + look-ahead.
- **Dead zone** 24 × 16 cells around the screen centre: inside it the camera does not move.
- **Look-ahead x** = `facing × 40` cells, eased in over 0.4 s after the player has moved the same way for
  0.25 s (turning briefly doesn't swing the camera).
- **Look-ahead y** = +30 cells (camera looks down) when `vy > 250` (falling fast), −20 when climbing a rope
  upward, 0 otherwise.
- **Smoothing:** a critically damped follow with no overshoot (built: `smoothDamp` with 0.18 s on x and 0.20 s on
  y). **Planned:** in Act 6 (climbing up) the default look-ahead y is −30.

### 19.2 Room bounds and framing

The camera is clamped to the room rectangle (it never shows outside the room). Rooms smaller than the view
in an axis are centred with the leftover drawn as bedrock/void. **Camera zones** (the `camzone` thing, 10 §6.5)
can lock an axis, set a fixed frame or a different look-ahead, or switch to wide view. **Every boss's camzone
row (lock, wide, vertical follow) is 05's** (R89); this page only supplies the mechanism. Built: `cam.lock`
with an x and/or y.

### 19.3 Shake

Trauma model: `trauma` 0–1, decays 1.6 per second; offset `= maxOffset × trauma²` with maxOffset 6 cells,
direction from smooth noise at 18 Hz. Sources: explosions (`power/150`), boss slams (0.5), fragment
landings (`mass/2000`, cap 0.4), the player taking > 20% max HP in one hit (0.3). Setting "Screen shake"
0 / 50 / 100% (`02-CONTROLS-UI.md`). No rotation, no zoom punch.

### 19.4 Scale and zoom

- **Scale** `s = max(1, round(canvasHeight / 270))` where the canvas is in device pixels (built: the canvas is
  sized at up to 2× device-pixel ratio); view in cells = `ceil(canvasW / s) × ceil(canvasH / s)`, clamped
  (built) to 320…720 wide and 200…400 high. 1080p → s 4 → 480 × 270; 1440p → s 5 → 512 × 288; 768p → s 3 →
  456 × 256; 720p → s 3 → 427 × 240. The HUD is tested at 427 × 240, 512 × 288 and 640 × 360 (02).
- **Wide view** (boss arenas and the Floodgate mode only): `s − 1`, giving 640 × 360 at 1080p (built:
  `cam.fit(w, h, wide)`). Wide view is entered **by a cut, never a zoom** (non-integer scales would blur
  pixels): on a room change, and on a **boss phase transition** when 05's camzone row asks for it (R72) — the
  transition's hit-stop covers the cut.
- The sim window (§3.4) is computed from the current view, so wide view costs ~1.8× sim area; boss arenas
  are authored small enough to afford it (≤ 960 × 540).

### 19.5 Room transitions (R50)

Touching an `exit` changes room in four steps:

1. **Fade out, 0.25 s** to black (the sim keeps running under it; input is ignored).
2. **Load:** compile the target room (10 §6.9), apply its saved prefab state (00 §13), place the player at the
   entry. A room that **starts mid-flood** loads with its height-field level already in place (§8.9), so nothing
   has to pour in. There is **no settle run at load** in v2 (the v1 120-tick settle is deleted): the compiler
   places liquids already level and powders already on support, and `room-check` **fails any room that needs more
   than 30 ticks to go quiet** (no cell moves in the sim window). The built compiler still runs a 120-tick settle
   (`roomload.js` `opts.settle`); M2 removes it with the check.
3. **Fade in, 0.25 s.** The camera snaps to its target (no swoop).
4. **Followers:** enemies that follow you through doors (the Unlit, and any elite with `mod_relentless`; 05
   decides who) arrive **at the entry 1.5 s later**, announced by a sound cue at the door (and a door-shadow
   telegraph in the overlay) so the arrival is never a surprise hit.

Budget: compile + load inside the 0.25 s fade-out on the reference laptop for a 960 × 540 room.

**Rekindle shimmer (B8).** A Rekindle (the free Guild lantern at the entry of puzzle, lesson, flood and trap
rooms, or the pause-menu entry; 07 owns the rule) streams the room back to its template plus saved prefab state.
Visually, over **0.6 s**, every cell that differs from the template is redrawn from its current material to its
template material in a sweep outward from the Rekindle post (a soft gold edge at the wave front, drawn in the
overlay pass); the swap itself is done at the start of the sweep, so this is **visual only** and costs one
full re-upload. The Narrator's remark and the Ledger's "Rooms rekindled" stat are 01's and 10's.

Status: fades, the follower timer and the Rekindle shimmer are **planned** (M2, M9).

---

## 20. Performance budget

Target: **60 fps at 1080p on a mid laptop** (reference: 4-core ~2020 laptop CPU, Intel Iris Xe or similar
integrated GPU, Chrome). Frame = 16.7 ms. **Single thread is a constraint, not a choice we revisit** (00 §13):
no Worker, no `SharedArrayBuffer` (GitHub Pages cannot send the headers those need), so the sim, AI, spells,
ropes, talk and audio all share one main thread and one budget.

### 20.1 Measured (R11)

Headless Chromium with a software GPU, the built engine, a **1024 × 544 room holding 56,000 water cells plus
oil, sand, fire and rain** (the `dev/render.html` scene, §21):

| Measure | Result |
|---|---|
| Sim per tick (all cell passes, thermal, equaliser, rain) | **1.4–1.8 ms** |
| Render CPU per frame (upload + draw calls) | **0.5 ms** |
| Chunks awake | **20–150** |

That is better than a 2× margin on the sim budget below with a software GPU, so the real-laptop run (M39) is a
check, not a gate.

### 20.2 The p95 budget (canon, 00 §13)

Per frame, measured as the 95th percentile over a room:

| Slice | p95 budget | Holds |
|---|---|---|
| **Sim** | **≤ 4 ms** | cell passes A + B (~2.0), thermal (~0.3), equaliser + basins + height-field bands (~0.4), support + fragments (~0.4), rain + drips + particle sim (~0.3), ripples + CPU light grid (~0.2), current zones + bands (~0.1), slack 0.3 |
| **AI + spells + ropes** | **≤ 3 ms** | entities and AI (~1.5; 05's AI budget sits inside this), spell instances (~1.0), ropes (~0.5) |
| **Render CPU** | **≤ 2 ms** | frame build (~0.4), upload (~0.8), draw calls and uniforms (~0.6), DOM HUD throttled to 10 Hz for text (~0.2) |
| **Talk + audio** | **≤ 1 ms** | Lingo lines (pre-rendered per room, 01/10), voice scheduling, sfx cues, the score |
| GPU (in parallel) | ~3 ms typical, 5 ms worst | scene 0.6, light 1.2 (falls back per §14.3 above 2.0), composite + water 0.6, bloom + final 0.5 |

**The awake-liquid cap.** No scene holds more than **60,000 awake liquid cells** (00 §13). Every big water is a
height-field flood with a band of at most 8 rows of real cells (§8.9). `room-check` measures the peak for every
room (including scripted set pieces like the Falling Flood, §8.7) and fails the room above the cap.

### 20.3 What sleeps

| Thing | Sleeps when |
|---|---|
| chunk | nothing moved in it last tick (§3.3) |
| liquid cell | 30 ticks still (`SETTLED`) |
| thermal pass for a chunk | all within 4 °C of ambient, no hot materials |
| off-window chunks | slow lane, every 4th tick |
| water body in the equaliser | until one of its cells changes |
| height-field body | outside the sim window: no band cells at all, only the level (§8.9) |
| cells in a flipped gravity band | held until the band flips back (§10.7) |
| ripple runs | when all |h| < 0.01 |
| enemies | outside view + 160 cells and not alerted: AI thinks at 4 Hz, physics only if airborne (05 §3.4) |
| water render pass | no liquid in view (planned, §16.7) |
| drip points | beyond 48 nearest |

### 20.4 When over budget (automatic, in this order)

1. Measure sim time as a rolling 30-frame average (`perf.simMs`; the built loop records `stats.simMs` each frame).
2. Sim above **4 ms**: move the furthest in-window awake chunks to the slow lane until under.
3. Above **6 ms** for 60 frames: particles to 70%, rain density to 60%.
4. Above **8 ms** for 120 frames: *Physics detail* drops to `low` automatically (fragments powderise, thermal
   every 4th tick) and a small toast says so.
5. If the frame accumulator hits the 5-step cap (built, `js/core/loop.js`), the game slows down rather than
   skipping sim steps (the sim never runs more than 5 steps in one frame).

### 20.5 Active chunk numbers

| View | Sim window | Chunks in window | Typical awake | Hard cap |
|---|---|---|---|---|
| 480 × 270 | 672 × 462 | ≤ 88 | 10–40 | 160 |
| 640 × 360 (wide) | 832 × 552 | ≤ 126 | 20–60 | 160 |

Worst case the inner loop visits 160 × 4,096 = 655 k cells per tick if every rect were full; with dirty rects the
56k-water scene above scans far less.

---

## 21. Benchmark room for milestone 1

Build this **before any content** (verdict risk 2). Room id `bench_flood`, file `rooms/bench/bench_flood.json`
(listed in `rooms/index.json`), opened with `index.html?room=bench_flood&bench=1` and run headless by
`tools/bench.mjs` (10 §9.4). The measured numbers in §20.1 came from its predecessor, the hand-built scene in
`dev/render.html`. The room holds 56,000 water cells, inside the 60,000 awake-liquid cap: **every flood room is
authored to that cap**, the Falling Flood included (§8.7), and the cap is what `room-check` measures.

### 21.1 Layout (1024 × 544 cells)

```
x→ 0                     300        420                      760                     1023
   ┌──────────────────────────────────────────────────────────────────────────────────┐ y 0
   │ open sky (rain 140/100 cols)                                                      │
   │        ████ stone overhang w/ drips          wood scaffold (3 levels, 200×120)    │
   │  ░░░░░░░░░░░░░░░░░░░░░░░ ║brick║              ╫═══╫═══╫                           │
   │  ░ reservoir 280×200    ░ ║dam  ║              ╫═══╫═══╫   oil pool 120×10 on    │
   │  ░ water, 12 cells of   ░ ║12×  ║              ╫═══╫═══╫   a stone shelf         │
   │  ░ oil on top           ░ ║210  ║                                                │
   │  ░░░░░░░░░░░░░░░░░░░░░░░░ ║     ║    sand dunes (3 piles, 4,000 cells each)      │
   │█████████ stone floor with a U-bend pipe under the dam ███████████████████████████│ y 480
   │████████ bedrock ██████████████████████████████████████████████████████████████████│ y 543
   └──────────────────────────────────────────────────────────────────────────────────┘
```

Contents: 56,000 water cells, 3,360 oil cells, 12,000 sand, a 200 × 120 wood scaffold (≈ 3,500 wood
cells), a glass window 40 × 30, a 60-wide metal floor section, 24 lights (6 shadowed wall lanterns, 18
unshadowed), rain density 140, wind 0.3, 30 dummy enemies (`bench_dummy`: 6 × 10 AABB, walk back and forth,
no AI cost beyond pathing), the player on autopilot running left↔right along the floor.

### 21.2 Script (runs itself; built in `js/debug/bench.js`)

| t (s) | Event |
|---|---|
| 0 | start recording; camera fixed on x 0–480 |
| 2 | `explode(306, 380, 30, 200)` — breaks the dam; flood rushes right |
| 4 | camera pans right at 120 cells/s to follow the water |
| 6 | Ember lob on the scaffold base → fire climbs the scaffold, the oil pool ignites at ~8 s |
| 10 | Rime ring at the flood front → freezes a 60-cell ice bridge |
| 12 | Tide wave into the sand dunes (sand into water, silt settle) |
| 14 | Spark bolt into the flood → shock flood fill |
| 16 | stone overhang cut → a 900-cell fragment falls into the water (wave + displacement) |
| 20 | stop; print report |

### 21.3 Report and pass line

`window.lanternfall.perf.bench` holds `{ frames, simMs:{avg,p95,max}, frameMs:{avg,p95,max}, gpuMs (if
EXT_disjoint_timer_query_webgl2), awakeChunks:{avg,max}, cellsScanned:{avg,max}, uploads:{cellsAvg,cellsMax},
particles:{max}, fragments:{max}, waterTotalStart, waterTotalEnd }`.

| Measure | Pass line (reference laptop) |
|---|---|
| frame time p95 | ≤ 16.7 ms |
| sim time p95 | ≤ 4.0 ms (00 §13); max ≤ 8 ms |
| awake liquid cells, peak | ≤ 60,000 |
| water conserved | `waterTotalEnd + steamDebt + ice(FROM_WATER)` = start ± 0 |
| chunk overflow events | 0 |
| visible checks (screenshot) | flood reaches x ≥ 700 by t = 6; fire visible on scaffold at t = 9; ice bridge at t = 11; fragment landed by t = 18 |

The Playwright perf spec (`10-TECH-DATA.md` §9.4) runs the same room headless and compares against a stored
baseline **ratio** (headless GPUs are software; absolute numbers there mean nothing).

---

## 22. What we learned from Tiny RTS

Tiny RTS (`~/claude/tinyrts/js/world/`) is a working side-view cell world. What we keep, and what we change:

| Tiny RTS did | Keep? | Lanternfall |
|---|---|---|
| Flat typed arrays per cell field, per-material lookup arrays built from JSON | **keep** | same, plus `temp`, `flags`, `shade`, `bg` |
| 32 × 32 chunks, `awake`/`awakeNext` double buffer | keep the idea | 64 × 64 chunks (fewer chunk headers, bigger dirty-rect wins), plus per-chunk dirty rects |
| Bottom-up scan with alternating direction, tick stamp array | **keep** | stamp is one byte; separate top-down pass for gases |
| Every awake chunk on the map stepped every tick | change | sim window + slow lane (§3.4); our rooms are bigger and the rate is 60 Hz |
| Support: 0-1 BFS from anchors, span per material, per-tick budget, bail on huge components as "held" | **keep** for built materials | plus the cheap `island` flood rule for natural stone and `hang` for rope/web |
| Clumps fall straight with a bottom profile, shatter by fall distance into rubble | keep | fragments also push liquid, carry temperature, crush with mass × speed, and can be stood on; a `powderise` fallback |
| `Set`-based grouping in `detach()` | change | typed-array stamps (a `Set` of 6,000 ints per detach is a garbage spike) |
| `[x > 0 ? i-1 : -1, …]` array literal per cell in the flood | change | inline the 4 neighbour checks (no allocation in inner loops) |
| Debris → max 60 real cells per second | **keep** | same number |
| Only one "loose" behaviour | extend | powders, liquids, gases, fire, each with its own rule |

---

## 23. Build order

The milestone plan is **`REVIEW.md` §d** (39 milestones). This page's work lands in M1 (cell world: support,
fragments, conservation, bench numbers), M2 (camera, the flat debug view, `room-check` settle rule, room
transitions), M3 (CPU light grid, tiers, unlit overlay, floor 0.08, relight sweep hook), M4 (puddles, run-off,
drips, current zones, height-field floods, a showcase room), M9 (brass rim, Rekindle shimmer), M14 (the part
rig pipeline of §25.2), M28 (gravity bands) and M33 (the Falling Flood release). The v1 build list is in Parked.

---

## 24. Applied in v2 — v2 changes

The v1 "Proposed canon changes" are resolved:

1. **Room size cap 2048 × 2048** — adopted (§1, §16.2). Long vertical places are stacked rooms (09).
2. **Scale table** — adopted as §19.4, with the built view clamps (320–720 × 200–400).
3. **Pre-Act-3 swimming** — 07 owns it (R54); 06 only switches bodies into the swim state (§12.5).
4. **Added materials** — the 36 built materials are the list (R60); other names map through §5.5.

What changed on this page in v2:

| Finding | Change |
|---|---|
| R11 | §20 rewritten: measured headless numbers (1.4–1.8 ms sim, 0.5 ms render CPU, 20–150 chunks), the 00 §13 p95 budget (sim 4 / AI+spells+ropes 3 / render CPU 2 / talk+audio 1 ms), single thread as a constraint, the 60,000 awake-liquid cap. §8.7 and §21: the Falling Flood and every flood room are authored to the cap |
| (new) | §8.9 height-field floods: a level per room or column band, a ≤ 8-row band of real cells, `drain` / `fill` / `stop` / `release` |
| R12 | §8.10 current zones: authored `current` things push entities (player 60%, Sluicewarden immune), floats and loose cells; cell water is cosmetic for flow |
| R13 | §10.7 gravity bands move entities, fragments, particles and rain; cells in a flipped band are held; bands snap to 8-cell rows |
| R45, R46 | §14.7 rewritten: the CPU light grid (1/8 resolution, every 4 ticks, same list/falloff/opaque test as the shader) is the gameplay truth; tier table; `lightTier` vs `ambientTier`; floor 0.08 everywhere; ≥ 95% tile agreement test. §14.6 floor column removed |
| R50 | §19.5 room transitions: 0.25 s fades, followers at the entry after 1.5 s with a cue, mid-flood rooms load at their level, the 120-tick settle deleted (≤ 30 settle ticks enforced by `room-check`) |
| R9 | §25 art formats: ASCII sprites, palette keys, frame counts, part rigs in `rigs.json`, per-part telegraph glow, gear overlays, portraits, Tallow's wax body |
| R33 | §17: Canvas2D is a flat-colour debug/test view only; a "needs WebGL2" card otherwise; parity specs parked |
| R58 | §14.2: lantern radius = the lantern item's value (08) × the oil factor in the dark from Act 4; hooded 18 |
| R59 | §11.2: rain density by act 60 / 70 / 90 / 110 / 130 / 160, 0 after `cs_rain_stops` |
| R60 | §5.2: the 36 built materials are the list, new ids append from 36; §5.5 alias table; `lampstone` = `PINNED` + brass rim drawn in the overlay pass |
| R10, B9 | §2.2 and §16.8: pinned cells carry a brass rim that reads in the dark |
| R72, R89 | §19.4: boss transitions cut to wide view; every boss's camzone row lives in 05 |
| R81 | §15 intro: the three water tricks and one showcase room per act |
| R54, R6 | movement numbers removed (§1, §12.2, §12.5) — they are `movement.json` / 07; powders are solid for bodies (built) |
| R20 | §11.3 and §12.5: no statuses defined here (`wet` → 03's `soaked`; `oily` is a tag) |
| B3 | §14.6 relight sweep: a 3 s ambient-ramp wave down the district, puddle pulse, a new drone voice |
| B4 | §14.2 last drop: the lantern's light collapses over 0.4 s when it goes out |
| B8 | §19.5 Rekindle shimmer: cells stream back over 0.6 s, visual only |
| B21 | §11.2 perfect-dodge rain freeze: streaks stop for 0.2 s |
| (built) | §14.3 and §16 now describe the built pipeline (one light pass over up to 128 lights marching the cell texture, all shaders in `shaders.js`, sky/parallax/far rain inside the scene shader); the v1 pass design is in Parked. Built status notes throughout (support written but not wired; rain rolls not yet seeded; 120-tick settle still in the compiler) |
| (§23) | the build order is REVIEW §d; the v1 list is in Parked |

---

## 25. Art formats

The art plan of 00 §4, in full (R9). Everything is **data an agent can write**: ASCII in JSON, no image
files. Art for each act lands inside that act's content milestone; M14 builds the part-rig pipeline (§25.2).
The field shapes of `sprites.json` and `rigs.json` are listed in 10 §5; the rules are here.

### 25.1 Small sprites (`data/sprites.json`, built)

```json
{ "_doc": "…", "version": 1,
  "palettes": { "hero": { ".": null, "k": "#10131a", "h": "#2d3342", "f": "#c9b39a", "e": "#ffe6b0!",
                          "c": "#3a2f45", "d": "#2a2233", "b": "#1d1a14" } },
  "frames": { "hero_stand": [ "..kkk...", ".khhhk..", "…" ] },
  "sprites": {
    "hero": { "palette": "hero", "anchor": [4, 13],
              "anims": { "idle": { "fps": 2, "frames": [ [ "..kkk...", ".khhhk..", "…" ], "@hero_stand" ] },
                         "walk": { "fps": 10, "frames": [ [ "…" ], [ "…" ] ] } } } } }
```

- **One character = one pixel = one cell.** `.` (or a key mapped to `null`) is transparent. Rows in a frame are
  equal-length strings.
- **Palettes:** single-character keys → `"#rrggbb"`, or `"#rrggbb!"` for an **emissive** pixel (built: stored with
  alpha 254 in the atlas; the sprite shader writes it to emission as well, so eyes and lamp glass glow and light
  their surroundings, §14.4). A sprite may add `"pal": {…}` to override single keys of its palette.
- **Key conventions** (so gear swaps and tools work across sprites): `k` outline, `h` hood/hair, `f` face/skin,
  `e` eyes, `c` coat, `d` coat shade, `b` boots, `w` weapon, `l` lantern glass, `m` metal trim, `g` telegraph glow.
  A sprite may use other keys freely; these ones mean the same thing everywhere.
- **Reserved token (planned):** a palette value `"@flame"` means "the selected wick's flame colour", resolved at
  draw; until then the pole lantern is drawn by code (built, `frame.js`).
- **Named frames:** `frames` holds reusable frames; an entry `"@name"` in an anim's frame list reuses one (built).
- **Anchor** `[x, y]` = the feet (bottom-centre of the body) inside the frame; it lines the sprite up with the
  body box (§12.1).
- **Limits:** a frame is **≤ 24 × 24**; **2–4 frames per animation**; `fps` per animation (default 6), `loop`
  default true. Standard animation names: `idle`, `walk`, `run`, `jump`, `fall`, `land`, `hurt`, `die`, `cast`,
  `attack`; monsters add their attack ids (05). The player body is 6 × 12; the built hero frames are 8 × 13
  including the hood outline.
- **Squash and stretch are code, not frames:** on jump take-off, landing and hurt the sprite is drawn scaled (y
  0.85–1.15, x the inverse) about its anchor, rounded to whole cells.
- **Atlas (built):** every frame is shelf-packed into one RGBA atlas 512 wide (power-of-two height) at load,
  with a white texel at (0, 0) for untextured quads; `rect(id, anim, t)` picks the frame.

### 25.2 Big bodies: part rigs (`data/rigs.json`, planned M14)

Bosses, minibosses and big monsters are **assembled from parts** and posed by code:

```json
{ "_doc": "…", "version": 1,
  "rigs": {
    "boss_tallow": {
      "palette": "tallow",
      "parts": {
        "body":  { "sprite": "tallow_body", "pivot": [14, 30], "z": 0 },
        "head":  { "sprite": "tallow_head", "parent": "body", "at": [14, 2],  "pivot": [8, 14], "z": 1 },
        "arm_l": { "sprite": "tallow_arm",  "parent": "body", "at": [4, 9],   "pivot": [4, 2],  "z": -1 },
        "arm_r": { "sprite": "tallow_arm",  "parent": "body", "at": [24, 9],  "pivot": [4, 2],  "z": 2, "flip": true },
        "wick":  { "sprite": "tallow_wick", "parent": "head", "at": [8, 0],   "pivot": [2, 8],  "z": 3 }
      },
      "poses": {
        "idle": { "loop": true, "keys": [
          { "t": 0,   "arm_l": { "rot": 6 },  "arm_r": { "rot": -6 } },
          { "t": 0.8, "arm_l": { "rot": -6 }, "arm_r": { "rot": 6 } } ] },
        "wax_wave_windup": { "telegraph": ["arm_l", "arm_r", "wick"], "keys": [
          { "t": 0,   "body": { "dy": 0 } },
          { "t": 1.8, "body": { "dy": 4, "sy": 0.9 }, "arm_l": { "rot": -80 }, "arm_r": { "rot": 80 } } ] }
      } } } }
```

- **Parts:** each part is a sprite in `sprites.json` (one `idle` frame, more if it animates on its own), **≤ 32 × 32**,
  and a rig has **≤ 12 parts**. `parent` + `at` place a part's pivot on its parent's frame; `pivot` is the point it
  rotates about; `z` orders drawing; `flip` mirrors it.
- **Poses:** keyframes at times in seconds; each key sets any of `rot` (degrees), `dx`, `dy` (cells), `sx`, `sy`
  (scale) per part; code interpolates between keys and snaps every part's pivot to whole cells. Rotation is drawn
  with nearest sampling (a sprite-batch angle attribute, added in M14), so parts stay pixel-crisp.
- **Telegraph glow:** a pose's `telegraph` lists the parts that light up during an attack's wind-up. Those parts
  are drawn with emission rising from 0 to 1.5 over the wind-up **and** copied into the unlit overlay (§16.8), so
  the tell is readable in total darkness (pillar 5). Wind-up lengths are 05's (the example uses Tallow's canon
  1,800 ms wax wave).
- **Hit boxes** stay the body box plus 05's attack shapes; parts are only art.

### 25.3 Gear on the player

Gear is a **palette swap plus at most one overlay per slot**. The five slots (`lantern`, `weapon`, `coat`,
`boots`, `trinket`, 08) each may carry a `look` (10 §5): a palette patch for the hero's keys (`c`/`d` for a coat,
`b` for boots, `h` for a hood-coloured coat, `m` for trim) and an optional overlay sprite id. An overlay sprite
has **the same animation names and frame counts as the hero** and is drawn at the same anchor and frame, one
layer above. The lantern's glass colour is the flame colour (§25.1 `@flame`), not a gear colour.

### 25.4 Portraits

Dialogue portraits are **32 × 32** ASCII sprites with the id `portrait_<npc id>` (e.g. `portrait_npc_odile`), a
palette per person, 1–2 frames (`idle`, and `talk` with the mouth open), drawn by the DOM dialogue box scaled with
nearest sampling (02). Bosses get one each for their opener and phase lines (01).

### 25.5 Mother Tallow's wax body

Mother Tallow is drawn from her rig, but her **body is her own wax cells**: the `body` part is backed by a
**living fragment** (the fragment record of §10.4) holding `wax` cells in the shape of the body sprite, moved with
the rig each tick and drawn by the cell shader like any fragment. Ember hits melt cells off it (each melted cell
leaves as `molten_wax` into the grid, which hardens into terrain below 50 °C, §7.2), so damage is visible as
missing wax. Her health is 05's number; the cells are only the look and the spill, and a fully melted look is
re-grown from the sprite at each phase change so she never becomes invisible. Status: planned with M14.

### 25.6 Validation

`data-check` (10 §9) fails on: a frame over 24 × 24 (sprites) or a part over 32 × 32; a rig with more than
12 parts; an animation with fewer than 2 or more than 4 frames (single-frame parts and portraits exempt); an
unknown palette key in a frame; an overlay whose animation names or frame counts differ from the hero's.

---

## Parked (v2)

Material cut or superseded in v2, kept as it was. Each block says which finding cut it and what replaced it.
The master parked list is `REVIEW.md` §(c).

### Rendering

**Parked by R33 — the Canvas2D fallback renderer and its parity.** Replaced by the "needs WebGL2" card and the
flat debug view (§17). The v1 section:

**(v1) 17. Canvas2D fallback**

Used when WebGL2 is missing, with `?renderer=2d`, and by the Node-less Playwright specs that must not
depend on GPU (e.g. swiftshader timing).

| Step | Canvas2D way |
|---|---|
| Cells | one `ImageData` of the view (480 × 270); loop over view cells, look up an `Uint32Array` palette (pre-packed ABGR per material × step) — only re-paint dirty chunk rects in view |
| Background | parallax layers as pre-rendered `OffscreenCanvas` blits; no far-rain shader (draw 60 streaks with `fillRect`) |
| Lighting | CPU light map at **quarter** resolution (120 × 68): ambient + each light (max 12) with a DDA occlusion test from texel to light through opaque cells only; multiply per pixel while filling the ImageData (bilinear) |
| Reflections | water texels copy the mirrored pixel above at 40%, no ripple distortion |
| Emission / bloom | emission adds directly; no bloom |
| Fragments / sprites / particles | `drawImage` / `fillRect` |
| Upscale | `imageSmoothingEnabled = false`, `drawImage` at integer scale |

Target: 60 fps at 480 × 270 on a desktop with a lighter scene; it is allowed to drop to 30 fps in heavy
rooms (it is a fallback). Visual tests compare structure (pixel sums of regions), not exact colours, so
both renderers pass the same spec.

The v1 build list also had "Canvas2D fallback renderer to *see* it" (step 2) and "Canvas2D parity pass" (step 11).

**Superseded by the built pipeline — the v1 light-map design (v1 §14.3).** Replaced by §14.3 as built (one pass
over all lights marching the cell texture). The big-light buffer and the 1D shadow map survive in §14.3 as
planned fallbacks.

**(v1) 14.3 The light map (WebGL2)**

- **Resolution:** half of the view in each axis (240 × 135 at 1080p), **plus a 32-cell margin** so lights just
  off-screen still light the edge (so 272 × 167 texels). Format `RGBA16F` (needs `EXT_color_buffer_float`,
  present on nearly every WebGL2 device; fallback `RGBA8` with intensities scaled by 0.25 and rescaled in
  composite).
- **Occlusion texture:** built each frame from the cell texture at the same half resolution: each texel = the
  **transmittance** of the 2 × 2 cells it covers, per colour channel (`transmit` × tint for glass, 0 for
  opaque solids, water 0.8 with a blue tint `(0.6, 0.8, 1.0)`, smoke 0.85). Done by a tiny shader pass.
- **Ambient:** clear the light map to the district's ambient colour (§14.6).
- **Shadowed lights:** for each, draw a quad covering its radius with additive blending. The fragment shader
  **marches from the texel toward the light** through the occlusion texture: `steps = min(32, ceil(dist / 1.5))`,
  multiplying transmittance; stop early when it drops below 0.02. The texel receives
  `color × intensity × falloff(dist/r) × transmittance`, with `falloff(t) = (1 − t²)²` (smooth to zero at r).
  The light's own occluder texel is skipped (a lantern inside a wall's edge still shines).
- **Unshadowed lights:** batched into one instanced draw, falloff only.
- **Cone lights** (spotlights, the lantern held forward in Act 4): multiply by
  `smoothstep(cos(spread), cos(spread×0.7), dot(dir, toTexel))`.
- **Surface bleed:** solid texels that are 1 texel inside an edge receive 60% of the light of their lit
  neighbour, so the lit face of a wall shows (otherwise a wall's face texels are "inside" the occluder and
  go black). Done in the march by allowing the first 1.5 cells of solid at the *end* of the ray.

Cost check: a shadowed light of radius 72 covers ~ π × 36² ≈ 4,100 half-res texels × ≤ 32 samples ≈ 130 k
texture reads; 24 such lights ≈ 3.2 M reads, about 1 ms on a mid laptop GPU. A Great Lamp at r 360 is
~100 k texels × 32 = 3.2 M on its own, which is why it gets its own path: **big lights (r > 160) march at
quarter resolution** into a separate buffer that is upsampled.

**Cheaper fallback (if the light pass is over its 2.0 ms budget, measured with timer queries when
available, otherwise by frame time):** switch shadowed lights to a **1D shadow map** per light
(render 256 angle rays once into a 256 × 1 row, then each texel compares its distance to the stored
blocker distance). Loses partial transmission through glass/water, keeps hard shadows, costs a tenth.

**Superseded by the built pipeline — the v1 pass list (v1 §16).** Replaced by §16 as built. Ideas in it that are
still planned are carried in §16 (upload cap, per-act backdrops, skipping the water pass, context-loss restore).

**(v1) 16. The WebGL2 render pipeline, pass by pass**

**(v1) 16.1 Targets and sizes (1080p example)**

| Target | Size | Format | Contents |
|---|---|---|---|
| `cellTex` | room size (≤ 2048²) | `RGBA8` | R material, G shade, B flags (WET/SHOCK/BURNING/BUILT bits), A heat glow |
| `bgTex` | room size | `R8` | background-wall material (uploaded once at room load + scorch updates) |
| `paletteTex` | 8 × 64 | `RGBA8` | ramp colours per material (row = material id) |
| `sceneTex` + `emisTex` | view + 2 cells (482 × 272) | `RGBA8` ×2 (MRT) | lit-less albedo; emission |
| `occTex` | half view + margin (272 × 167) | `RGBA8` | transmittance |
| `lightTex` | 272 × 167 | `RGBA16F` | light map |
| `bigLightTex` | 136 × 84 | `RGBA16F` | big lights (r > 160) |
| `litTex` | 482 × 272 | `RGBA16F` | composite (lit scene) |
| `waterTex` | 482 × 272 | `RGBA16F` | lit scene with water/reflections applied |
| `bloomTex[0..3]` | 241×136, 121×68, 61×34, 31×17 | `RGBA16F` | bloom chain |
| `rippleTex` | 482 × 1 | `R16F` | ripple heights |
| canvas | window | default | final |

Everything world-space is rendered at **logical resolution** (1 texel = 1 cell). Only the very last pass
touches window pixels.

**(v1) 16.2 Room texture size**

`cellTex` is room-sized so the camera just moves a window over it. WebGL2 guarantees 2048 as the smallest
max texture size, hence the 2048 × 2048 room cap (§1). If a device reports more, nothing changes.
Memory: 2048² × 4 B = 16.8 MB of GPU memory; typical rooms 2 MB.

**(v1) 16.3 Pass 0 — upload (CPU → GPU)**

For each chunk with a non-empty `gfxDirty` rect **that intersects the view + 64 cells**, pack the rect into
a staging `Uint8Array` (4 bytes a cell) and `texSubImage2D` it. Dirty rects outside the view stay dirty
until they come into view. Budget: **≤ 0.8 ms**, normally ~40 k cells a frame (a busy scene) ≈ 160 KB.
If more than **250 k cells** are dirty in view (a huge flood), upload the worst 250 k by rect size and carry
the rest to next frame (a single frame of lag on some water is invisible).

Fragments upload their own small textures once at creation. Particles and sprites are instanced (§16.5).

**(v1) 16.4 Pass 1 — background**

1. **Sky/void gradient** per room (`room.bgGradient`), a full-screen quad.
2. **Three parallax layers** (far city silhouettes, mid chasm wall, near pipes/arches) as per-act
   pre-generated textures (made by `render/backdrops.js` at act load from seeded noise + a small shape
   library, 1024 × 512 each, tiled horizontally), scroll factors **0.15, 0.35, 0.6**, each tinted by the
   act's ambient × 0.7 and lit by a very blurred copy of the light map (so a Great Lamp lights the
   distant city).
3. **Far rain streaks** shader: procedural diagonal streaks from a hash per 3 × 40-cell cell of a scrolling
   grid; two layers at speeds 380 and 260 cells/s, alpha 0.12 and 0.07, slant = wind. Zero cost to the sim.

**(v1) 16.5 Pass 2 — scene (albedo + emission, MRT)**

1. **Background wall:** where `cellTex` is air or `transmit > 0`, draw `bgTex`'s material through its ramp
   × 0.55 (walls behind are darker than walls in front).
2. **Cells:** one full-screen quad; the shader samples `cellTex` at `camera + fragCoord`, looks up
   `paletteTex[mat][shade & 7]`, adds per-cell grain from the shade's high bits (±4% value), writes albedo;
   for emissive materials and heat glow, writes emission; gases are blended over the background with their
   alpha (§5.4); water writes a flag so the water pass knows (alpha channel of albedo = 0.5 marker).
   Brick mortar and plank grain are computed from `(x, y)` patterns in the shader, not stored.
3. **Fragments:** textured quads using the same palette shader.
4. **Sprites:** entities, NPCs, prefabs (levers, doors' frames, lamps) — one texture atlas, one instanced
   draw per layer (behind-cells, in-front). Sprites write albedo and optional emission (glowing eyes to
   emission *and* to the unlit overlay list).
5. **Particles** (§18): instanced `1 × 1`/`1 × 3` quads, albedo or emission by type.

**(v1) 16.6 Pass 3 — occlusion, light, composite**

1. `occTex` from `cellTex` (§14.3).
2. `lightTex`: clear to ambient gradient → shadowed lights → unshadowed batch → blurred emission add.
3. `bigLightTex` if any big lights; added in step 4.
4. **Composite** into `litTex`: `lit = albedo × (light + floor) + emission`; sheen and puddle mirror (§15.3)
   added here using `lightTex`. Light is sampled bilinearly (it is half-res; bilinear hides the texels).

**(v1) 16.7 Pass 4 — water**

Full-screen pass over `litTex` → `waterTex`, doing §15.1 only on texels flagged as liquid (others copy
through). Skipped entirely (copy) when no chunk in view has `liquidCount > 0`.

**(v1) 16.8 Pass 5 — overlays that ignore light**

Unlit overlay list, drawn on `waterTex` with plain alpha: enemy eyes, telegraph shapes, void-zone rims
(pillar 5), pickup outlines, the build-mode ghost, in-world 5 × 7 font text (damage numbers are DOM/2D
overlay, `02-CONTROLS-UI.md`). Near-rain particles are drawn here too, but *sampling the light map* so they
glint where lit.

**(v1) 16.9 Pass 6 — bloom**

Threshold `luma > 0.85` (soft knee 0.2) → 4-level dual-filter downsample → upsample (the cheap blur that
halves the size each step and back) → add at strength **0.35** (setting: off / 0.2 / 0.35 / 0.5). Crisp
pixels are kept because bloom is only added on top; the base image is never blurred (canon §3).

**(v1) 16.10 Pass 7 — final**

1. **Tone curve:** `x / (1 + x)` on luminance with a per-act lift/gamma/gain grade (numbers in `acts.json`
   `grade`), then a very light vignette (0.12).
2. **Integer upscale:** draw `waterTex` to the canvas with `NEAREST` sampling at scale `s` (§19.4),
   offset by the camera's **sub-cell remainder × s** screen pixels (we render 482 × 272, 1 extra cell each
   side, so smooth scrolling at 60 fps never shimmers — the cells move in whole screen pixels at scale 4).
3. DOM HUD sits over the canvas (`02-CONTROLS-UI.md`).

**(v1) 16.11 Shaders list (`js/render/shaders/*.js`, GLSL ES 3.00 in template strings)**

| File | Pass | Inputs → output |
|---|---|---|
| `fullscreen.vert.js` | all full-screen passes | — |
| `bg-gradient.frag.js` | 1 | uniforms → scene |
| `parallax.frag.js` | 1 | layer tex, blurred light → scene |
| `farrain.frag.js` | 1 | time, wind → scene (additive) |
| `cells.frag.js` | 2 | cellTex, bgTex, paletteTex → albedo, emission |
| `sprite.vert.js` / `sprite.frag.js` | 2, 5 | atlas, instance buffer → albedo, emission |
| `particle.vert.js` / `particle.frag.js` | 2, 5 | instance buffer |
| `occlusion.frag.js` | 3 | cellTex → occTex |
| `light-shadow.frag.js` | 3 | occTex, light uniforms → lightTex (additive) |
| `light-flat.vert.js` / `.frag.js` | 3 | instanced lights |
| `blur9.frag.js` | 3, 6 | separable blur |
| `composite.frag.js` | 3 | albedo, emission, lightTex, cellTex flags → litTex |
| `water.frag.js` | 4 | litTex, cellTex, rippleTex → waterTex |
| `bloom-down.frag.js` / `bloom-up.frag.js` | 6 | |
| `final.frag.js` | 7 | waterTex, bloom → canvas |

Each shader module exports `{ vert, frag, uniforms: [...] }`; `render/gl.js` compiles, caches and reports
compile errors with the file name to the debug overlay.

**(v1) 16.12 Context loss**

On `webglcontextlost`: pause the render loop, keep simulating paused. On restore: recreate every target,
mark every chunk `gfxDirty`, re-upload. A Playwright spec forces this with `WEBGL_lose_context`.

### Light and darkness

**Parked by R45 / R46 — the v1 `lightAt` estimate and per-act floors.** Replaced by the CPU light grid and tiers
(§14.7) and one floor of 0.08 (§14.6).

**(v1) 14.6 Ambient per district**

| District | Ambient before relighting | After the Great Lamp is lit | Min-light floor |
|---|---|---|---|
| act1 Lanterncrown & the Wax Stair | `#2a3348` × 0.55 | `#5a4a3a` × 0.7 (warm) | 0.10 |
| act2 Gutterways | `#1e2a33` × 0.45 | `#3a4a3a` × 0.6 | 0.10 |
| act3 Sluice Ward | `#1a2a40` × 0.5 | `#2f4f6a` × 0.65 | 0.10 |
| act4 Blackwater | `#0a0d14` × 0.2 | `#302a40` × 0.5 | **0.04** (rooms) / 0.10 (menus, telegraphs) |
| act5 Bellwell | `#2a2433` × 0.45 | `#4a3a52` × 0.6 | 0.10 |
| act6 Cloudroot | `#3a4458` × 0.6 → after the Rain stops `#8a8fa8` × 0.9 | (n/a — the Sky Lamp ends the game) | 0.12 |

Ambient also has a slight **vertical gradient** per room (`ambientTop`, `ambientBottom`; default bottom =
top × 0.6) — deep rooms darken downward. The **min-light floor** is added after everything (terrain
silhouettes never go pure black; verdict risk 1). Values live in `data/acts.json` (`10-TECH-DATA.md` §5).

**(v1) 14.7 Darkness as gameplay (Act 4 onward)**

- `lighting.lightAt(x, y)` on the CPU (the renderer's light map is never read back — that stalls the GPU)
  estimates luminance by summing the frame's light list with a **grid raycast occlusion test**
  (§12.7 raycast, opaque solids only) and falloff, plus ambient. Cached per 4 × 4-cell tile per 4 ticks,
  called only by AI (the Unlit prefer to stay where `lightAt < 0.15` and flee above 0.5) and by the
  player's "in the dark" status (Moth Oracle crits in darkness: `lightAt(player) < 0.2`).
- The player's lantern radius shrinks with oil in Act 4 (table above); **Shade** spells cast on a light
  source dim static emitters for 8 s (§7.4).
- **Readability rule (pillar 5):** enemy eyes, attack telegraphs and void-zone rims are drawn in the
  **unlit overlay** (§16.8), after lighting, so no amount of darkness hides them. Only terrain and
  bodies go dark.
- Settings "Brightness floor" (`02-CONTROLS-UI.md`) raises the floor up to +0.1 for accessibility.

**Parked by R58 — the v1 lantern radius row.** Replaced by the item's radius × the oil factor, hooded 18 (§14.2):

| Player's pole lantern | 72 (Act 4: `40 + oil% × 50`) | 1.0 | yes | 0.06 | colour = equipped flame of the selected wick; see darkness §14.7 |

### Water and floods

**Parked by R11 — the ~250,000-cell Falling Flood.** Replaced by the 60,000 awake-liquid cap and height-field
floods (§8.7, §8.9). The v1 text:

> The Act 6 set piece (`01-WORLD-STORY.md`, `09-MODES-MAP.md`) makes every held body of water fall. The
> room script calls `liquids.release(region, speedRows)`: it converts `cloudstuff` in the region to water
> from the top down, **speedRows = 2 rows per tick**, and deletes `PINNED` flags on authored water holders
> (cloud dams), so the ordinary rules take over. Budget: the chunk cap (§3.4) still applies; the scene is
> authored so that no more than ~250,000 liquid cells are in the sim window at once.

**Parked by R11 — a Worker thread for the sim.** Running the cell sim in a Web Worker and posting changed chunks
back with `postMessage` (or sharing memory through `SharedArrayBuffer`) was considered to buy headroom. Replaced
by the single-thread rule and the measured 2× margin (§20); GitHub Pages cannot send the headers
`SharedArrayBuffer` needs.

**Parked by R50 — offline settled-cell caches and the load-time settle.** v1 settled every room for 120 ticks at
load and cached the result per session keyed by `id + seed + format` (an offline, on-disk cache of settled rooms
was the next step). Replaced by a compiler that places liquids level and powders supported, and `room-check`'s
≤ 30 settle-tick rule (§19.5).

**Parked by R13 — an up-falling cell pass.** For flipped gravity bands, a third cell pass scanning top-down that
lets powders and liquids fall *upward* inside a band. Replaced by held cells (§10.7): the scan-order bugs it
would bring are not worth the image.

**Parked by R59 — the v1 rain densities:** "Defaults: act1 90, act2 60 (mostly under cover), act3 120, act4 70,
act5 100, act6 160 → 0 after the Rain stops. At 480 columns and density 120 that is 576 drops/s ≈ 10 per tick."
Replaced by 60 / 70 / 90 / 110 / 130 / 160 (§11.2).

### Bodies against the grid

**Parked by R54 / R6 — movement numbers on this page.** Replaced by links to `movement.json` (07 §2). The v1 text:

> Player | 6 × 12 cells, walk 60 cells/s, run 95, jump apex ≈ 34 cells | from the doc brief; movement feel is `07-TRAVERSAL-PUZZLES.md`

> **Step-up:** when an x step is blocked, test whether the obstruction's top is ≤ **3 cells** above the feet
> (player; enemies have `stepUp` in `enemies.json`) and the box fits 3 cells higher.

> liquid ≥ 0.55 | **swimming** (from Act 3; before Act 3 the player *can* swim clumsily — see `07-TRAVERSAL-PUZZLES.md`): gravity × 0.2, buoyancy `−(frac − 0.5) × 700 cells/s²`, drag `v × 0.9` per tick, breath timer starts when the head cell is in liquid

**Parked by R30 — the Drowned Knight.** v1: "head cell in liquid | breath; the player drowns at 0 (numbers in
`07`) — the Drowned Knight never does". The class is parked; breath is 07's.

**Parked by R20 — statuses on this page.** v1: rain gave entities "`wet` status for 3 s (cosmetic drip; Spark
bonus vs wet targets is in `03-SPELLS.md`)" and oil gave an "oily" status (flammable ×2). `wet` merged into 03's
`soaked`; `oily` is now a tag (§12.5).

### Budget and build order

**Superseded by R11 — the v1 per-frame budget table and over-budget ladder.** Replaced by the measured numbers,
the 00 §13 p95 budget (§20.1–20.2) and a ladder keyed to 4 / 6 / 8 ms (§20.4).

**(v1) 20.1 Per-frame budget (ms, main thread unless noted)**

| Item | Normal room | Worst case (flood + fire + 30 enemies) | Notes |
|---|---|---|---|
| Cell pass A (powder/liquid) | 1.2 | 3.5 | ~88 chunks in window, dirty rects only |
| Cell pass B (gas/fire) | 0.2 | 0.8 | gas cap 6,000 |
| Thermal (every 2nd tick) | 0.1 | 0.6 | hot chunks only |
| Liquids equaliser + basins | 0.1 | 0.4 | every 8th tick |
| Support + fragments | 0.05 | 0.8 | budget 12 k visited cells |
| Entities + AI + physics | 0.6 | 1.5 | |
| Spells + particles sim | 0.3 | 0.8 | 4,000 particle cap |
| Ripples + light list + CPU `lightAt` | 0.1 | 0.3 | |
| **Sim total** | **2.7** | **8.7** | hard ceiling 9.0; see §20.3 |
| Upload (texSubImage) | 0.2 | 0.8 | 250 k cells cap |
| Render CPU (draw calls, uniforms) | 0.6 | 1.0 | ≈ 30–45 draw calls |
| UI (DOM HUD updates, throttled to 10 Hz for text) | 0.2 | 0.4 | |
| **CPU total** | **3.7** | **10.9** | |
| GPU: scene + background | 0.6 | 0.8 | |
| GPU: light (occlusion + shadowed + flat + glow) | 1.2 | 2.5 | falls back to 1D shadow maps above 2.0 |
| GPU: composite + water | 0.6 | 0.9 | |
| GPU: bloom + final | 0.5 | 0.6 | |
| **GPU total** | **2.9** | **4.8** | runs in parallel with the CPU |

**(v1) 20.3 When over budget (automatic, in this order)**

1. Measure sim time as a rolling 30-frame average (`perf.simMs`).
2. Above **9 ms**: move the furthest in-window awake chunks to the slow lane until under.
3. Above **11 ms** for 60 frames: particles to 70%, rain density to 60%.
4. Above **13 ms** for 120 frames: `Physics detail` drops to `low` automatically (fragments powderise, thermal
   every 4th tick) and a small toast says so.
5. If the frame accumulator hits the 5-step cap (`10-TECH-DATA.md` §4.1), the game slows down rather
   than skipping sim steps (the sim never runs more than 5 steps in one frame).

**Replaced by REVIEW §d — the v1 build order (v1 §23).**

> The implementing agent should land these in order; each has its own unit tests before the next starts
> (test names in `10-TECH-DATA.md` §9.1).
>
> 1. Grid + materials tables + `set/swap/touch` + chunks (no rendering; tests only).
> 2. Pass A powders and liquids with dirty rects; Canvas2D fallback renderer to *see* it.
> 3. WebGL2 cell pass + upload + integer upscale + camera.
> 4. **Benchmark room** with water, sand and the perf report (§21) — milestone 1 gate.
> 5. Light map (shadowed + flat), ambient, composite.
> 6. Water reflection pass + ripples; wet sheen.
> 7. Thermal + fire + gases; emissive glow; aggregated fire lights.
> 8. Support + fragments + explosions + debris.
> 9. Rain particles, drips, deposit cap; far-rain shader; bloom; final grade.
> 10. Entity collision/swimming/steam lift; projectiles raycast.
> 11. Basins + equaliser + shock; Canvas2D parity pass.

### Materials

**Parked by R60 — `tar` and `snow`.** v1 07 had `tar` (ropes and hooks touching it stick for 1 s) and `snow`;
05 had a monster that spits tar patches. Nothing that ships needs either; if one returns it appends from id 36
(§5.2) and is logged in `CHANGELOG.md`.
