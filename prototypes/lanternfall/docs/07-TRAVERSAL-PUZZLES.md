# LANTERNFALL — page 07: Traversal, Interactables, Traps, Building and Puzzles

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> One line: **how the Lamplighter moves (every number), how the grapple and ropes work, the pole-lantern as a
> tool, the 18 interactables and how they are wired together, the 10 traps, the building kit, how a broken room
> is recovered, and the 20 puzzles by act.**

Canon is `00-OVERVIEW.md` v2. Scale: 1 cell = 1 art pixel, **1 m = 8 cells**; view 480×270 cells; player 6×12
cells, walk 60 cells/s, run 95, jump apex ≈34 cells, gravity 900 cells/s², 60 ticks/s fixed step.

**What this page owns (00 §3):** movement numbers (`data/movement.json`, built), ropes, interactables, wiring
gate kinds, traps, building, puzzles, pinned cells and the Rekindle post. **What it links to:** keys and the
build-mode controls → 02; spell numbers, statuses (and how long `frozen` lasts) → 03; melee moves, frame data,
pogo height, the `subduable` tag and class movement → 04; enemy AI, the lure rule, mass classes per enemy → 05;
materials, cell rules, current zones, the gravity-band cell rule, light tiers → 06; node ids and room counts →
09; file names, JSON field shapes, the room format and the test files → 10.

## Table of contents

1. [Units and conventions](#1-units-and-conventions)
2. [Player movement](#2-player-movement)
   - 2.1 Body and collision · 2.2 Walk and run · 2.3 Jump · 2.4 Coyote time and jump buffer · 2.5 Falling and landing
   - 2.6 Wall-slide and wall-jump · 2.7 Ledge-grab · 2.8 Crouch, crawl, slide · 2.9 Drop-through · 2.10 Swim and dive
   - 2.11 Ladders and climbing · 2.12 Carry, push, pull · 2.13 Surfaces · 2.14 Wind, current zones, knockback · 2.15 Gravity bands
   - 2.16 (moved to 04) · 2.17 The state machine · 2.18 `data/movement.json`
3. [The grapple hook and ropes](#3-the-grapple-hook-and-ropes)
4. [The pole-lantern as a tool](#4-the-pole-lantern-as-a-tool)
5. [Interactables and zones](#5-interactables-and-zones)
6. [Wiring](#6-wiring)
7. [Spells against interactables](#7-spells-against-interactables)
8. [Traps](#8-traps)
9. [Building, and recovering a room](#9-building-and-recovering-a-room)
10. [Puzzle catalogue](#10-puzzle-catalogue)
11. [Authoring and testing puzzles](#11-authoring-and-testing-puzzles)
12. [Performance budget and cheap fallbacks](#12-performance-budget-and-cheap-fallbacks)
13. [Applied in v2](#applied-in-v2)
14. [Parked (v2)](#parked-v2)

---

## 1. Units and conventions

| Thing | Unit |
|---|---|
| Distance | cells (1 cell = 1 art pixel; **1 m = 8 cells**, so the Chimneysweep's 2,000 m = 16,000 cells) |
| Speed | cells/s (positive x = right, positive y = **down**, like the screen) |
| Acceleration | cells/s² |
| Time | seconds; the sim runs at 60 ticks/s, so 1 frame = 0.0167 s. Frame counts are given where they matter for feel. |
| Weight | **units**: the player = 1, a small crate = 1 (weight table in §5.2) |
| Signal | `on`, `off`, `pulse`, or a number (a valve's level, a counter's count) — §6 |

Every number on this page lives in a data file so it can be tuned without touching code. The file list is
10 §5.0; movement is the built `data/movement.json` (§2.18).

---

## 2. Player movement

### 2.1 Body and collision

| Property | Value |
|---|---|
| Collision box (standing) | 6 wide × 12 tall |
| Collision box (crouched / crawling / sliding) | 6 × 7 |
| Hurtbox (what enemies hit) | 4 × 10, centred (1 cell smaller on each side than the collision box — forgiving) |
| Origin | bottom-centre (feet) |
| Collision test | against the cell grid (built, 06 §12): every `static` **and every `powder`** material is solid for the player (stone, brick, wood, plank, wax, ice, metal, cloudstuff, bone, and dirt, sand, silt, ash, rubble, rust, salt). Powders are solid **with push-out**: a body inside powder is moved to the nearest free spot, so a landslide never buries you. **Loose top layers slow you ×0.7** (the `sand`/`ash` rows of §2.13). Liquids, gases and fire are not solid. |
| Resolution | move x then y, one cell step at a time (swept); at 420 cells/s that is up to 7 steps a frame — cheap. |
| One-way cells | `oneway` things (scaffolds, chain-walk gratings, market awnings): solid only from above, and only if the player's feet were at or above the top on the previous frame. Built planks are **not** one-way. |
| Step-up | walking into an obstacle ≤ **2 cells** high (≤ **3** when running, ≤ **4** in the air when moving up) with free space above lifts the player onto it. This is what makes rough pixel terrain walkable. |
| Step-down | walking off a drop of ≤ 3 cells snaps the player down (stays grounded). |
| Corner correction | a jump whose head clips a ceiling corner by ≤ 3 cells is nudged sideways; a dash whose feet clip a ledge by ≤ 3 cells is nudged up. |

### 2.2 Walk and run

Run is held (or toggled with the "always run" setting; keys in 02).

| Number | Value | Feel |
|---|---|---|
| Walk max speed | **60** cells/s | canon |
| Run max speed | **95** cells/s | canon |
| Ground acceleration | 750 cells/s² | 0 → walk in 0.08 s (5 frames) |
| Run acceleration (above walk) | 500 cells/s² | walk → run in 0.07 s |
| Ground deceleration (no input) | 1,200 cells/s² | run → stop in 0.08 s |
| Turn-around deceleration | 1,800 cells/s² | snappy reversals |
| Air acceleration | 450 cells/s² | |
| Air deceleration (no input) | 180 cells/s² | momentum carries through jumps |
| Air max speed | the speed you left the ground with, min walk (60), max run (95) | |
| Animation | walk cycle 6 frames at 10 fps, run cycle 8 frames at 14 fps | |

### 2.3 Jump

| Number | Value | Notes |
|---|---|---|
| Jump launch speed | **248** cells/s up | √(2 × 900 × 34) ≈ 247.4 → apex **34 cells** (canon) |
| Rise gravity | 900 | canon |
| Apex hang | while jump is held and \|vy\| < 40, gravity × 0.5 | ~3 extra frames of float; apex ≈ **35** cells |
| Variable height | releasing jump while rising sets vy = vy × 0.4 | |
| Minimum jump | jump is held at least 3 frames before a release counts | shortest hop ≈ **15** cells |
| Time to apex | 0.28 s | |
| Horizontal reach (flat, running) | ≈ **49** cells | level design uses **44** as the "comfortable running gap" (10's example rooms are tuned to this, R54) |
| Horizontal reach (flat, walking) | ≈ 31 cells; design uses 28 | |
| Jump from swimming surface | 200 cells/s (apex ≈ 22 cells) | §2.10 |
| Jump off a ladder / rope | 180 up + 60 sideways in the held direction | |
| Head bonk | hitting a ceiling sets vy = 0 (no bounce) | |

### 2.4 Coyote time and jump buffer

| Rule | Value |
|---|---|
| **Coyote time** — you can still jump for a moment after walking off a ledge | **0.10 s (6 frames)** |
| Coyote after a wall | 0.08 s (5 frames) after leaving a wall-slide, a wall-jump is still allowed |
| Coyote after a rope/ladder | 0.10 s after letting go without jumping |
| **Jump buffer** — a jump pressed slightly before landing still happens on landing | **0.12 s (7 frames)** |
| Grapple buffer | 0.10 s (pressing grapple during a jump's first frames is kept) |

The attack buffer is melee timing and belongs to 04.

### 2.5 Falling and landing

| Number | Value |
|---|---|
| Fall gravity (vy > 0) | 1,170 (× 1.3) — falls feel weightier than rises |
| Terminal speed | **420** cells/s |
| Fast-fall (hold down in the air) | gravity 1,440, terminal **520** |
| Landing lag | falls > 100 cells: 0.12 s where you can't jump (you can still attack and move at half speed) |
| **Fall damage (the player; R53)** | falls ≤ **160** cells: none. Above: **5% max health per 20 cells** beyond 160, capped at **60%**. Never lethal from full health. Monsters use 05's own rule. |
| Negated by | landing in liquid ≥ 8 cells deep (none), landing on cloudstuff or on ≥ 4 cells of loose powder (halved), a **tuck** (press down within 0.1 s before landing: halved, plays a roll) |
| Fall distance counter | resets on any ledge-grab, wall-slide, rope/ladder grab, swim, or a launch |
| Void (a room's bottom edge with no exit) | respawn at the room's last safe spot, −10% max health, no death |

### 2.6 Wall-slide and wall-jump

**Every class** wall-slides and wall-jumps from the start (R57); the Chimneysweep adds a wall-*run* (04).
Taught in the First Step (`a1_n02`, P1-1).

| Number | Value |
|---|---|
| Starts when | airborne, falling (vy > 0), pressing toward a wall, with ≥ 8 of the 12 body rows touching a grippable wall |
| Grippable walls | `stone`, `bedrock`, `brick`, `wood`, `plank`, `wax`, `metal`, `bone`, `cloudstuff`, and powders held in a wall. **Not**: `ice` (you slide at 160 with no wall-jump), cells with oil on them (no grip), `glass`, one-way things |
| Slide speed | ramps to **70** cells/s over 0.1 s (`WET` walls: 90; ash-dusted walls: 50, the `slideSoot` number) |
| Stick | pressing away from the wall for < 0.15 s does not detach (so you can press away + jump) |
| **Wall-jump** | vx **120** away from the wall, vy **230** up; toward-wall input is ignored for **0.14 s** |
| Wall-jump chain | unlimited on grippable walls; the same wall can be re-grabbed after 0.2 s |
| Slide dust | 1 particle per 4 frames from the hand (visual) |

### 2.7 Ledge-grab

Ledge-grab is **automatic** — there is no button.

| Rule | Value |
|---|---|
| Hand box | 2 cells in front of the body, rows 0–4 from the top of the head |
| Grab when | airborne, vy ≥ −60 (near apex or falling), moving or pressing toward the ledge, and the hand box touches the **top edge** of a solid cell with ≥ 12 free cells above it and ≥ 6 free cells wide |
| Hang | hands at the edge; no stamina limit |
| Climb up | up or jump: **0.30 s** animation (not cancellable), then you stand on top |
| Drop | down: let go (fall counter resets at the hang) |
| Hop away | jump + away: vx 90, vy 200 |
| Shimmy | left/right while hanging moves 20 cells/s along a continuous edge |
| Ledges that do not count | ice tops, oil-coated tops, one-way things (you land on them instead), moving platforms faster than 60 cells/s |

### 2.8 Crouch, crawl, slide

Crouch, crawl and slide are available **from the start** for every class, but **no Act 1 room requires them**
(the Act 1 reachability bot runs without them).

| Move | Input | Numbers |
|---|---|---|
| Crouch | hold down on the ground | box 6×7; lantern lowered (light origin drops 5 cells — a Blackwater hiding trick) |
| Crawl | crouch + move | **28** cells/s; fits any tunnel ≥ **8** tall |
| Slide | crouch while running ≥ 80 cells/s | 0.35 s at **130** cells/s decaying to 60; fits under 8-cell gaps; can slide off ledges (keeps speed into the air); cooldown 0.5 s; no invulnerability (the dodge roll is 04's) |
| Stand up | releasing down when there are 12 free cells above; otherwise you stay crouched |

### 2.9 Drop-through

| Rule | Value |
|---|---|
| Down + jump on a one-way surface | fall through; one-way collision ignored for **0.20 s** |
| Hold down for 0.3 s on a one-way surface | same (for players who don't know the combo) |
| Not possible on | built planks, solid terrain (feedback: a small "thunk" and dust) |

### 2.10 Swim and dive

Water is cells (06). The player is **in water** when ≥ 50% of the body's cells are any liquid. Swimming
arrives in Act 3 (`a3_n01`).

- **Before Act 3**: water deep enough to swim in is rare by design. If you are in it you **float and paddle**:
  28 cells/s, no dive, you bob at the surface, jump out at 180. Breath still applies if something holds you under.

**From Act 3 on:**

| Number | Value |
|---|---|
| Buoyancy (no input) | net 120 cells/s² upward; you drift to the surface |
| Swim speed | **50** cells/s in any direction (8 directions or analog) |
| Stroke | jump underwater: burst to **90** cells/s in the held direction for 0.25 s, cooldown 0.4 s |
| Dive | hold down: 55 cells/s down; buoyancy off while held |
| Water drag | velocity × e^(−4·dt) toward the swim target; entering water at speed: vy capped to 160 in 0.1 s (splash in 06) |
| Surface | the body's top 4 rows are out of the water: you bob (±1 cell, 1.2 s cycle), breath refills |
| Jump from the surface | vy **200** (apex ≈ 22 cells). With a stroke within 0.2 s before: 240 |
| **Breath** | **12 s** under. Refills at 4 s⁻¹ (full in 3 s) at the surface. At 0: **drowning, 8% max health per second**. Breath pauses in every menu (R74). |
| Breath bar | shows only when breath < 100% (02) |
| Flow | cell water has **no velocity** (06). Flow in play comes from **current zones** (06 §8.10, §2.14): in water the player gets **60%** of the zone's vector (`flowShare`) |
| Oil layer | swimming through oil: speed × 0.7; if the oil burns, you get `burn` (03) |
| Electrified water | anyone in a connected body of water takes the Spark hit (03), you included |
| Casting underwater | allowed; Ember wicks fizzle to steam (03), everything else works |
| Pole underwater | swing speed × 0.7 |
| Cold water | Act 3 unlit cisterns: after 20 s submerged, 1 health/s (01) |

### 2.11 Ladders and climbing

| Surface | Grab | Up | Down | Fast down | Notes |
|---|---|---|---|---|---|
| Ladder (terrain or built) | press up/down while overlapping, or land on it while pressing up | 45 | 60 | hold down + run: **140** | jump off: 180 up + 60 sideways |
| Hanging level rope (not your hook) | touch it while airborne, or press up while overlapping | 40 | 55 | 120 (slide) | swingable (§3.6) |
| Chain | as a rope, but no swing, no burn | 40 | 55 | 120 | |
| Frozen waterfall (Rime on falling water: `ice` cells with `FROM_WATER`) | behaves as a **ladder** where it is ≥ 6 cells wide | 45 | 60 | 140 | thaws per 03/06 |
| Climbable root-fibre (Act 6) | as a ladder | 40 | 55 | 120 | burns |
| Grate walls (Gutterways) | as a ladder, also sideways at 35 | 35 | 50 | — | |

### 2.12 Carry, push, pull

| Action | Rule |
|---|---|
| **Pick up** (interact near an object with weight ≤ 1 and size ≤ 10×10: small crate, empty oil barrel, bucket, gravity lantern) | carried above the head; walk only (60 → **48**), jump × 0.8 (apex ≈ 22), no wall-jump, no ledge-grab, no casting (you can still poke with the pole, 04) |
| **Throw** | the pole button while carrying: 180 cells/s in the aim direction + 60 up; a thrown barrel breaks on impact > 150 cells/s |
| **Drop** | interact again: placed in front |
| **Push** (walk into an object of weight ≥ 1 on the ground) | 30 cells/s for weight 1, 18 for weight 2, 10 for weight 3; weight > 3 does not move; objects on ice slide on at 80% of your speed |
| **Pull** | hold interact facing it + move away: same speeds, you walk backward |
| Pole shove | a pole hit gives an object an impulse of 80 cells/s ÷ its weight |

### 2.13 Surfaces

These are the built `surfaces` rows of `movement.json`. Any surface not listed moves at ×1.

| Surface | Accel × | Decel × | Max speed × | Jump × | Notes |
|---|---|---|---|---|---|
| `stone`, `brick`, `wood`, `plank`, `metal` (dry) | 1 | 1 | 1 | 1 | |
| Wet (`WET` flag: rain-soaked) | 0.8 | 0.6 | 1 | 1 | slides a little |
| `ice` | 0.2 | 0.07 | 1.1 | 1 | you keep sliding; no wall grip |
| Oil film | 0.4 | 0.15 | 1.05 | 1 | ignitable under you |
| `molten_wax` | 0.6 | 1 | 0.6 | 0.8 | hurts (06's `hurt` on the material) |
| Loose `sand` / `ash` top layers (also dirt, silt, rubble) | 0.7 | 1.2 | 0.7 | 0.9 | the ×0.7 slow of §2.1 |
| `mud` | 0.6 | 1.5 | 0.6 | 0.8 | |
| `cloudstuff` (Act 6) | 1 | 1 | 0.9 | 1.1 | **to add** to `surfaces` in M31; soaks water, gives way when saturated (06) |

### 2.14 Wind, current zones, knockback

| Force | Rule |
|---|---|
| **Current zone** (R12) | an authored `current` thing: a rect, a vector **w** and a strength, optionally switched by a wire (§5.35). It is the only source of flow in play: it pushes entities, floats and loose cells; cell water itself carries no flow (06 §8.10). In water the player gets `flowShare` (60%) of **w** each frame. In air the same zone is **wind**: acceleration toward w of **6 × (w − v)** per second airborne (capped at 240 cells/s²), **2 ×** on the ground. Act 6's 30 cells/s crosswind moves a standing player ≈ 10 cells/s if they do nothing. Gusts are a current zone switched by a `timer` in `blink` mode. |
| Rain | none on movement (visual), except the `WET` flag on surfaces |
| Knockback (from hits) | the hit sets velocity (the `knock` value from 03/05). Hurt state, reduced control and wall stagger are **04's** hurt rules (R84) — the built `knock` group of `movement.json` carries them (its `wallStagger` 200 is retuned to 04's 160 in M6). |
| Explosions | radial velocity = power × (1 − d / r), added, not set |

### 2.15 Gravity bands (Act 5)

A **gravity lantern** (§5.20) or an authored `gravity_band` zone (§5.35) flips gravity inside a rectangle.
Bands snap to **8-cell rows** (R13). The cell rule is 06 §10.7: bands affect **entities, fragments, particles,
rope points and rain only**; **cells inside an active flipped band are held** (not simulated) until the band
flips back — water hangs in the air, sand stays where it was.

- Gravity points **up** for everything the band affects. Every rule above is mirrored vertically: jumping
  pushes you **down** (away from the band's "floor", which is now a ceiling), ledge-grabs work on bottom edges,
  wall-slides slide up.
- Left/right controls stay screen-relative (never mirrored). The camera does not flip; the player sprite
  flips upside down over 0.12 s.
- Crossing a band edge keeps your velocity; the new gravity takes over the next frame. Fall damage counts
  from the point you crossed.
- Weight is **signed** inside a flipped band: an entity presses on whatever surface it now rests against, so a
  crate in a band weighs on the ceiling, not on a plate below it.
- A band has a lit rim (its edge is drawn in the bell-gold `#f2c66e` at 50%), per the "readable danger" pillar.

### 2.16 Class movement traits

Moved to **04** (R56): 04 owns every class's movement (Chimneysweep double jump and wall-run, Moth Oracle
glide, Sluicewarden weight and breath, Tinker build speed). The old table is in Parked (v2).

### 2.17 The state machine

```
            ┌────────── ground ─────────┐            ┌──────── air ────────┐
  idle ⇄ walk ⇄ run ──slide──┐          │   jump_rise ─► fall ─► (land)     │
   │ crouch ⇄ crawl          │          │      │ ▲        │ ▲               │
   │                         ▼          │      ▼ │        ▼ │               │
   └─► carry  push/pull    slide        │  wall_slide ─► wall_jump          │
                                        │  ledge_hang ─► ledge_climb        │
  ladder / rope_climb / rope_swing / hook_swing / hook_reel                   │
  swim_surface ⇄ swim_under                                                   │
  hurt   stagger   dead   cutscene   interact (lever/valve hold)   build
```

- One state at a time, stored as a string id; transitions are one table (module named in 10 §3.4).
- **Every state lists what it allows**: `canJump`, `canAttack`, `canCast`, `canGrapple`, `canInteract`,
  `gravityScale`, `maxSpeed`. E.g. `ledge_hang` allows cast (you can cast one-handed from a ledge, a deliberate
  power move), not attack; `carry` allows neither cast nor grapple.
- Animations key off the state (art list in 06): idle 4 frames, walk 6, run 8, jump 2, fall 2, land 2,
  wall_slide 2, ledge_hang 1, ledge_climb 4, crouch 1, crawl 4, slide 2, ladder 4, rope 4, swim 6, swim_under 6,
  carry-walk 6, push 4, hurt 1, tuck 3.

### 2.18 `data/movement.json`

**Built.** Every number in §2.1–§2.15 is in it, grouped `body`, `run`, `jump`, `land`, `wall`, `ledge`,
`crouch`, `dropThrough`, `swim`, `climb`, `carry`, `wind`, `knock`, `surfaces`, `pogo`. This page owns the
values; 10 §5 owns the file's shape. The reachability bot (09/10) reads the same file, so a tuning change
re-checks every room. (`pogo.v` 220 is the bounce speed; the pogo *height* is 04's 24 cells.)

---

## 3. The grapple hook and ropes

The grapple arrives at the start of Act 2 at **Hookwright's Forge** (`a2_n02`). Ropes exist before that
(hanging level ropes in Act 1 are climbable and swingable, §3.6), so the hook extends a verb the player knows.

### 3.1 Controls

Keys and pad buttons are **02's** (R18): `grapple` fires and releases; aim follows the cursor or right stick
(60° up-forward with no stick input); up/down reel; left/right pump; jump releases with a pop. Cutting your
own rope is a release.

### 3.2 The hook in flight

| Number | Value |
|---|---|
| Hook speed | **900** cells/s |
| Max range | **150** cells (the rope is 150 cells long; the hook stops and falls back at the end) |
| Hook size | 2×2 cells |
| Aim assist | if a **`grapple_point`** (a brass ring with Hush's sparkle, 01 §7) is within **8°** of the aim and in range, the hook flies to it |
| Retract (miss) | 1,200 cells/s; can fire again **0.25 s** after it is back |
| Hitting a liquid | passes through water/oil (slowed to 400 cells/s) and can hook things under water |
| Hitting an enemy or object | §3.8 |

### 3.3 What the hook bites (attach rules by material)

Material ids are the 36 built ones (06).

| Material | Hook? | Hold | Notes |
|---|---|---|---|
| `stone`, `bedrock`, `brick`, `bone` | yes | forever | |
| `wood`, `plank` (terrain, crates, built parts) | yes | forever | if the anchor cell burns away, the hook drops |
| `metal` | **no** — bounces off with a clang | — | iron beams you are meant to swing from carry `grapple_point`s (always valid) |
| `wax` | yes | **3 s** under load, then tears out | `molten_wax`: no |
| `ice` | **no** — skids off | — | exception: *rough ice* (`ice` with `FROM_WATER`, i.e. Rime-frozen falls and rain) — yes, 4 s |
| `glass` | no | — | |
| `cloudstuff` (Act 6) | yes | **2 s** under load, then pulls loose | |
| powders (`dirt`, `sand`, `silt`, `ash`, `rubble`, `rust`, `salt`) | no | — | |
| `moss`, `glowmoss` | as the cell they grow on | | |
| `rope` (a level rope or tether) | yes | forever | catches on it; the other rope takes your weight |
| `web` | no — the hook tears through | | |
| liquids, gases, `fire`, `spark` | no | — | |

"Under load" means the rope is taut with the player on it. A slack rope hooked into wax holds forever. A cell
under the hook that is destroyed (burned, dissolved, exploded, dug) releases the hook.

### 3.4 How ropes are simulated

Two methods (R48):

**The player's hook = a wrap list (the default).** The rope is a straight segment from the player to the last
**wrap point**. When that segment hits a solid corner, the corner is added as a new wrap point (the rope bends
there); when the player swings back past the angle it was added at, it is removed (the rope unwinds). The swing
pivot is always the last wrap point, and the swing radius is the rope length left after it. This never jitters
on pixel terrain. (This was v1's `rope.simple` fallback, now the only hook model.)

**Level ropes and tethers = verlet chains.** A chain of points joined by fixed-length links (each point remembers
its last position; its new position is `pos + (pos − prev) × damping + gravity × dt²`, then the links are pulled
back to their length a few times — the standard cheap rope method). They are few and slow-moving, so the chain
looks loose and alive.

| Number (verlet ropes) | Value |
|---|---|
| Link length | **4** cells |
| Constraint passes per tick | **10** |
| Damping | 0.995 per tick |
| Gravity on rope points | 900 (flipped inside gravity bands, §2.15) |
| Point mass | 0.05 (a hanging weight: crate 1, barrel 2) |
| Collision | each point is pushed out of solid cells to the nearest free neighbour, else back to its previous position |
| Taut rule (both methods) | the rope is taut when the pivot-to-player distance ≥ remaining length; the player is then held on the circle (velocity projected onto the tangent) |
| Wet | a rope out in the rain for 10 s is **wet** (conducts Spark, §3.7); dry again after 20 s out of the rain |
| Draw | 1-cell line in rope colour `#8a6a44` (wet `#5d4a35`) above the cell layer, never written into the grid |

### 3.5 Swinging on the hook

| Number | Value |
|---|---|
| Pump | tangential acceleration **260** cells/s² along the swing |
| Max swing speed | **260** cells/s at the bottom of the arc |
| Reel in | **70** cells/s (conserves angular momentum, so reeling in at the bottom speeds you up — capped at 260) |
| Reel out | 70 cells/s; while falling, reel out is free-fall until the rope is taut |
| Minimum length | **12** cells |
| Release | keeps velocity; adds **−60** vy ("release pop") if you release with jump; the 0.1 s grapple buffer lets you fire the next hook during the pop |
| Hook-jump chain | releasing and re-hooking within **0.3 s** keeps 100% speed; each chain after the third in a row adds +5% max swing speed up to +20% (the "Sweep's rhythm") |
| Wall contact while swinging | you slide along it; pressing into it for 0.2 s grabs as a wall-slide and releases the hook |
| Zip (reel fully in on a short rope) | at ≤ 30 cells, holding reel-in zips you to the anchor at **220** cells/s and into ledge-hang if the anchor is on a ledge top |
| Distance counted | the Ledger counts metres swung at **1 m = 8 cells**; the Chimneysweep unlock needs 2,000 m = 16,000 cells (00 §7) |

### 3.6 Level ropes (hanging, fixed)

Authored `rope_anchor` things (10 §6.5): an anchor point and a length (20–300 cells). Simulated near the camera.

- **Grab**: touching one while airborne, or up while overlapping. You hang at the touch point.
- **Swing**: pump with left/right (acceleration 200 cells/s²; the rope's own points move, so swings feel loose).
- **Climb**: up/down (§2.11).
- **Let go**: jump (vy 180 + 60 sideways) or down + jump (drop).
- **Hook onto it**: your hook catches level ropes (§3.3), so you can hang a rope from a rope.
- A rope with a **weight** on its end (a crate, a barrel, a bucket) can be cut to drop the weight (§3.7).

### 3.7 Cutting, burning and other things that happen to ropes

| Cause | Effect on a rope |
|---|---|
| Pole hit on a link | **cuts** it there (level ropes and enemy ropes; your own hook rope is cut by release) |
| Blade enemies (`cutter` tag, 05) | a hit on your taut hook rope cuts it; the hook is lost for **2 s** |
| **Ember** / any fire touching a link | the rope **ignites**: fire spreads along it at **24** cells/s both ways; each burning link **snaps after 1.2 s**; burning links drop an `ember` cell every 0.3 s (ignites oil below). A wet rope ignites only after 1 s of contact. |
| **Rime** | the links in the spell's area freeze stiff while `frozen` (03): a frozen section is rigid. A taut horizontal frozen rope can be **stood on** (one-way while frozen). Then it thaws and sags. |
| **Spark** | a **wet** rope conducts: the Spark travels the rope at 600 cells/s and hits whatever holds either end (the Spark hit of 03, you included). Dry rope: no effect. |
| **Bile** | dissolves the links in the area over **0.6 s** (cuts it) |
| **Tide** | pushes the rope's points like wind (swings it) |
| **Shade** | none; a rope in Shade darkness is drawn at 50% |
| **Gleam** | none |
| Explosion | links in radius snap |

### 3.8 Hooking enemies and objects

Every enemy and physics object has a **mass class** (05 sets it for enemies).

| Class | Examples | What the hook does |
|---|---|---|
| **S** (light: ≤ 1 unit) | rats, wax mites, small crates, buckets, empty barrels, gravity lanterns | **yank**: pulled to you at **300** cells/s; enemies stunned **0.4 s** on arrival; objects land in front of you (catch them into a carry with interact) |
| **M** (medium: 2–3) | tallow hounds, Knell, full barrels, big crates | **tug**: you and it pull toward each other at 120 cells/s each; standing on ground you are anchored and it comes to you at 120; enemies marked `anchored` (05) resist |
| **L** (heavy: 4+) and bosses | the Sluicemaw's head, a lift platform | **zip**: you are pulled to it at 220 cells/s; your next pole hit within 0.5 s is a **hook strike** (04 owns its damage) |
| Flying (any class) | stormgulls, echo bats | it **drags** you (a free ride) for up to **3 s**, then the hook tears out |
| Hook-immune | the Unlit (not solid — the hook passes through), fire, the Widow's silk (cuts it) | — |

### 3.9 Ropes from spells and building

- The **tether** shape (03) makes a verlet rope between two hit points, anchored at both ends, taut, climbable
  along its length (walk it as a one-way if it is within 20° of horizontal), and damaging to anything crossing
  it per the tether's flame (03). Burning, freezing and cutting apply.
- The **rope peg** build part (§9.3) makes a hanging rope 60 cells long.

### 3.10 Rope budget

| Budget | Value |
|---|---|
| Verlet ropes simulated at once | **11** nearest level ropes/tethers to the camera (the hook's wrap list costs next to nothing) |
| Ropes further than 400 cells from the camera | asleep (frozen in place; they wake with 10 extra constraint passes) |
| Cost | 11 ropes × ≤ 75 links × 10 passes ≈ 8,000 link fixes a tick ≈ < 0.3 ms |

---

## 4. The pole-lantern as a tool

The pole-lantern is the Lamplighter's melee weapon **and** a tool. **Melee — moves, frame data, damage,
heavy, plunge, pogo (24 cells), swat, the non-lethal heavy against `subduable` targets — is 04's** (R55). This
section keeps only what the pole and lantern do to the **world**. Other classes' pole-arms do the same tool jobs.

### 4.1 Pole hits on things

- **Pogo** (04's plunge) bounces off anything tagged `pogo`: enemies, `trap_spikes` tops, lamp-posts, bells,
  crates, built planks. Spikes don't hurt you on a pogo hit. The built bounce speed is `pogo.v` 220.
- **Knocking out** a `subduable` target with the heavy (04) counts toward the Kindling flag `knell_spared` (01).
- The **heavy** swing (04) breaks cells with the `cracked` flag in its arc (the legend's `?`, halved cell life).

### 4.2 The lantern as a tool ("lantern touch")

The lantern at the pole's end burns the **flame of the selected wick** (its light colour is that flame). During
any swing's active frames, the lantern end (a 4×4 box at the tip) **touches cells** with that flame:

| Flame | Lantern touch on cells (never on enemies) |
|---|---|
| Ember | ignites flammable cells (`wood`, `plank`, `oil`, `wax`, `rope`, `web`, `moss`); lights `lamp_post`s and `lamp_socket`s |
| Rime | freezes a 3×3 patch of water/steam; puts out a 3×3 fire |
| Spark | gives a `spark_coil` **1 charge** (§5.14); a wet rope or metal passes a small zap (no damage) |
| Bile | corrodes 1 cell of `metal` or `brick` per touch |
| Gleam | lights lamp-posts and sockets (a holy flame counts as fire for lamps, not for burning); counts as a light source at light doors |
| Tide | pushes 12 cells of water 20 cells in the swing direction |
| Shade | darkens a light it touches for 5 s (puts a socket out without breaking it) |

- Lantern touch costs **no oil** but works at most **once per 0.5 s**, and only on cells, so it can't replace
  spells in a fight. From Act 4 the lantern's own light burns oil in the dark (03 owns the oil rules);
  lantern touch still costs nothing.
- The lantern is always a **light source**; its radius is 06's (§14, 72 cells, Act 4 scaled by oil).
- **Relighting a guttered lantern (B4).** When oil hits 0 in the dark the lantern goes out (06/03). Relight it
  at a lamp-post, at a lit `lamp_socket` (interact), or by **pole-striking any burning cell**.

### 4.3 The pole as a tool

| Use | Rule |
|---|---|
| Hit levers, buttons, targets, bells | from the full swing reach, including through bars/grates |
| Ring bells | a swing rings a `bell` |
| Shove objects | 80 cells/s ÷ weight (§2.12) |
| Knock hanging things | hanging lanterns, signs, pots: a hit sets them swinging; the heavy knocks them off their hook |
| Cut ropes | §3.7 |
| Break | `cracked` cells (heavy); `cracked` `wood` and `wax` also break to any swing |
| Pierce an oil barrel | a heavy or a thrown hook opens its leak (§5.22) |
| Reach through water | ×0.7 swing speed underwater (§2.10) |

---

## 5. Interactables and zones

### 5.1 Common rules

- An interactable is a **thing** placed in a room (the room format, 10 §6.5: `t`, `id`, `at` or `rect`, and
  its props). **07's type names are canon**; 10 lists their field shapes and `prefabs.json` their defaults.
- Most interactables are also **drawn into the cell grid** as real material cells (a lever's base is `metal`; a
  sluice gate is a slab of `metal`; a crate is `plank`) so water, fire and physics treat them as the stuff they
  are. The thing owns and moves its cells; their mounts are `PINNED` (06 §12.6).
- **Interact** works within **12 cells** of the thing's interact point; a prompt shows over it (02). A pole hit
  counts as interact for levers, buttons, bells and targets.
- Things that send signals and things that act on them are joined by **wires** (§6).
- **What is saved** follows the save rule (00 §13): prefab state persists (lever positions, doors, lamp-posts,
  broken wall groups, built parts); raw cells do not. `plate`s, `button`s, `target`s and logic always reset.
- **Readability**: every interactable has a small indicator light: **off = dim red `#7a2a22`**, **on = green
  `#4fd06a`**, **timing = blinking amber**. Indicators are light sources (radius 6), so they read in the dark.

### 5.2 The 18 interactables

Weight units for plates: player 1; small crate 1; big crate 3; empty barrel 0.5; full oil barrel 2; water/oil/sand
cells: **80 cells = 1 unit**; an 8×8 ice block 1; enemies by mass class (S 1, M 2, L 4); built crate 1, built
sandbag 2.

| # | `t` | Size (cells) | States | You use it by | Sends | Takes | First used |
|---|---|---|---|---|---|---|---|
| 5.3 | `lever` | 4×8 | `off`, `on` | interact / pole hit (flip); `spring: s` flips back after `s` seconds; `locked` until a signal unlocks it | `on` / `off` | `open`(=on), `close`(=off), `toggle`, `enable`/`disable` (unlock/lock) | Act 2 (decoration in Act 1) |
| 5.5 | `button` | 6×3 on a wall/floor | `up`, `down` | interact, pole hit, **any** projectile or spell hit | `on` for `hold` s (default 0.5), then `off` | — | Act 2 |
| 5.6 | `target` | 6×6 eye | `idle`, `hit` | **projectiles only** (bolt, lob, wave, thrown objects; not beam, arc or ring) | `on` for 0.5 s | — | Act 2 |
| 5.7 | `plate` | 12×2 to 24×3 | `up`, `down` | anything with total weight ≥ `needs` (default 1) on it | `on` while down; also a number = weight / needs | — | Act 2 |
| 5.9 | `valve` | 8×8 wheel | level 0..1 | hold interact: turns 0→1 in 2 s (or 1→0 if at 1); release stops it | its level (a number) | `set` (drives it toward a value at the same speed) | Act 3 |
| 5.10 | `sluice_gate` | 8 wide × 20–80 tall | `closed`, `opening`, `open`, `closing` | never directly — wired | `on` while open | `open`, `close`, `toggle`, `set` (a valve's level = how far open); `basin` prop drains/fills that basin | Act 3 |
| 5.11 | `timed_door` | 8×24 | `shut`, `open`, `closing` | never directly | `on` while open | `open` starts or restarts its timer (`open`, default **4 s**); ticks amber every 0.5 s, faster in the last 1 s, then shuts at 120 cells/s; `hears: true` also opens it when a bell's wave reaches it | Act 2 |
| 5.12 | `door` | 8×24 | `shut`, `open` | interact if `manual: true`, else wired | `on` while open | `open`, `close`, `toggle` | Act 1 |
| 5.12b | `portcullis` | 24×32 bars | `down`, `rising`, `up`, `falling` | wired | `on` while up | `open` (rises at **30** cells/s while held), `close` (falls at **200** cells/s); bars (2-cell gaps) let water, S-class rats, projectiles and ropes through | Act 2 |
| 5.13 | `light_door` | 10×28 + eye glyph | `shut`, `open` | light at its eye ≥ its `tier` (default `lit`) for 0.3 s; optional `flame` filter; `invert: true` opens only while `dark` | `on` while open | `open`/`close` (override) | Act 1 |
| 5.14 | `spark_coil` | 8×12 | charge 0–5 | **Spark** hits (+1 per hit, +2 per 0.5 s of beam), Spark lantern touch (+1) | `on` while charge > 0; drains 1 charge every **3 s** | `fill` (a wired power source keeps it full) | Act 2 |
| 5.15 | `lift` | platform 24×4 on a track | `stopped@N`, `moving` | call buttons (built in), a wire, or its own crank (`crank: true`, hold interact, 25 cells/s) | `on` while moving | `open` (go to stop 1), `close` (stop 0), `toggle`; `power: "coil"` = runs only while its wired coil is `on` | Act 1 (crank), Act 2 on |
| 5.18 | `bell` | 16×16 to 48×48 | `still`, `ringing` (1.5 s) | pole hit, heavy thrown object, the heavy swing, a wire, a Spark hit on a metal bell | `pulse` on ringing, and a **sound wave** (§5.18 note) | `pulse` (rings it) | Act 5 |
| 5.19 | `breakable_wall` | a named group of `cracked` cells | per-cell life | damage: the heavy swing, explosions, Bile, a bell's wave, the `heavy` charm | `on` once the group is ≥ 80% destroyed (`save: once`) | — | Act 1 |
| 5.20 | `gravity_lantern` | 8×10 (carryable) | `off`, `on` | interact toggles; carry and place (you hold up to **2**); a wire toggles a fixed one | `on` while on | `open`/`close`/`toggle` | Act 5 |
| 5.22 | `oil_barrel` | 8×10, weight 2 (0.5 empty) | full, leaking, burning, exploded, empty | push/carry/throw, hook, pierce, **refuel** (§5.22 note) | — | — | Act 1 (few), Act 4 (many) |
| 5.25 | `lamp_post` | 4×20 | `dark`, `lit` | lantern touch (Ember/Gleam) or an Ember/Gleam hit lights it for good | `on` once lit | `light` | Act 1 |
| 5.27 | `lamp_socket` | 4×4 candle to 24×24 sconce | `empty`, `lit`, `guttering` | lantern touch or an Ember/Gleam hit; `gutter: s` goes out after `s` seconds (0 = forever) | `on` while lit | `light`, `snuff` | Act 1 |

Plus one physics object, **`crate`** (5.21): small 10×10 (weight 1) or big 20×20 (weight 3); push/pull/carry
(small), hook (§3.8), stand on, stack; `plank` cells, so it burns (~6 s), floats (small 40% above the surface,
big 20%) and is stable on another crate at ≥ 50% overlap. A burning crate is a moving fire source.

Interactables that were in v1 and are not on this list are in Parked (v2).

### 5.3–5.27 Behaviour notes

**Lever.** A flip takes 0.15 s. Pole hits flip it from the side the swing comes from, so a lever behind bars can
be flipped by poking through them. `spring` makes a lever that flips itself back (P2-2).

**Button.** Momentary. `hold` sets how long it stays `on`. Any hit presses it: a bolt fired across a room, a lob,
a pogo, a thrown object (ceiling buttons are pressed this way).

**Target.** As a button, but only projectiles. Arc, ring and beam do not count — a target puzzle forces a
projectile. A `target` with `dummy: true` is a Guild practice dummy: it also counts as an enemy for knot triggers
(03 owns the knot rules; P4-5, P4-7).

**Plate.** Sinks 2 cells when pressed. Its number (weight / needs) shows as a small dial (and as a figure in
Inspect, 02). Liquid on a plate counts: **80 cells = 1 unit** (the plate samples its own footprint column, so
flooding a room can hold it down). Ice counts by cells. A crate burning on a plate loses weight as its cells burn.
Inside a flipped gravity band weight is signed (§2.15).

**Valve.** Analog. Its level drives how far a wired `sluice_gate` opens, or how fast a basin fills or drains
(`fill`/`drain` with the level as the rate). The wheel sprite turns with the level. Rime `frozen` jams it (§7).

**Sluice gate.** Moves at **20** cells/s. When closing, anything under it takes **40** damage and is shoved out;
it stops (still `closing`) on a big crate — **you can jam a gate with a crate** (the crate is crushed over 3 s).
An open gate between basins at different levels levels them at 06's basin rate; if the gate has a `current`
zone wired to it, the zone switches on while the gate is open (the undertow).

**Timed door.** Default **4 s**. A second `open` while open restarts the timer (re-trigger with a button). A crate
in the doorway jams it open for 3 s while it is crushed. `hears: true`: a bell's sound wave reaching the door
counts as `open` (5 s for bell-doors, set with `open: 5`).

**Portcullis.** Falls fast (200 cells/s), 60 damage when it lands on you; rises slow.

**Light door.** Light is read from the **CPU light grid** (06 §14.7), the only gameplay truth, as a tier:
`dark` < 0.2, `dim` 0.2–0.5, `lit` ≥ 0.5, `bright` ≥ 0.8. The door uses `lightTier` (all light, your lantern
included). Your lantern next to the eye reads `lit`; a lit socket within ~20 cells reads `lit`. `flame` compares
the dominant light colour at the eye to that flame's colour (30° of hue). **Shade** on the eye forces `dark` for
5 s. `invert: true` doors (Blackwater, the Moth Nave) open only while `dark`.

**Spark coil.** Up to 5 charges, each 3 s of power: 15 s from full. A visible arc between its prongs while
charged. A coil touching water electrifies that water while it has charge (hazard and tool). A lift with
`power: "coil"` runs only while its coil is `on`.

**Lift.** Moves at **50** cells/s. Capacity 6 weight units; over capacity it stops and creaks (a hint). It
carries whatever stands on it, including pooled water (a flooded lift sinks). Crank lifts (Act 1): hold interact
on the crank, 25 cells/s.

**Bell.** Ringing sends (a) a `pulse` down its wires and (b) a **sound wave**, a ring expanding at 600 cells/s to
`radius` (default 200): it shakes `loose` cells (runs a support check in the radius, 06 §10), stuns S-class enemies
0.5 s, opens `hears: true` timed doors it reaches, sets off `trap_tollrubble` and `trap_icicle` in range, and is a
**noise** for the lure rule (05, B5). A big bell rung within 48 cells of you: muffled audio + a short stagger (04's
hurt rule).

**Breakable wall.** Cells with the `cracked` flag (the legend's `?`: halved cell life, built). Damage rules are 03's
(Bile dissolves brick, `heavy` digs, explosions hit every cell in radius). A wall is drawn with visible cracks so it
reads as breakable. Its group state is `save: once`.

**Gravity lantern.** Flips gravity in a **band**: default 40 wide × 120 tall (8-cell rows), on the lantern's axis
(on a floor: the band goes up; on a ceiling: down). Entity-only, cells held (§2.15). Max 2 carried, 2 placed;
placing a third picks up the oldest. Bands don't stack (overlap = normal gravity, drawn as a flicker).

**Oil barrel (5.22).** 120 oil cells inside. **Pierce** (the heavy swing, a thrown hook, a charm that digs)
opens a leak: oil pours 20 cells/s for 6 s. **Refuel (B13):** while a barrel leaks, `interact` at it puts
**20 oil** into your lantern (once per barrel). **Fire** on the barrel: after 0.8 s it explodes: **40 damage,
radius 20**, knockback 260, spilling the rest as burning oil — it hits **anything** in the blast (it is a trap
you can aim). Rime on a burning barrel within the 0.8 s puts it out. Thrown barrels break on impact > 150 cells/s
(spill, no explosion unless on fire). Barrels are how Act 4 hands out oil you have to earn — and how it kills you.

**Lamp-post (5.25).** The Guild lamp-post: rest, save, braid and respawn are 09's rules (10 §7.4). In play it is a
permanent light (06 radius) once lit and a place Unlit avoid (05). Not the Rekindle post (§9.5).

**Lamp socket (5.27).** Every small lamp you light: candles, sconces, street lamps. `gutter` makes it burn out
(candles in a draught, lamps in the rain) and it can be relit. Counts as light for light doors.

### 5.35 Zones

Zones are rect things with no cells of their own.

| `t` | Props | What it does |
|---|---|---|
| `current` | `rect`, `vec` [x, y] cells/s, `strength` 0..1, optional wired `enable`/`disable` | pushes entities, floats, particles and loose cells toward `vec` (§2.14); in air it is wind; the only flow in play (R12, 06 §8.10) |
| `gravity_band` | `rect` (8-cell rows), `state` | an authored band (Bellfather's arena, P5 rooms); same rules as a lantern band (§2.15) |
| `sanctuary` | `rect` (usually the whole hub) | **hubs** (R87): no building, spells change **no cells**, NPCs ignore damage (01); spells still light things and fly |
| `nobuild` | `rect` | build mode refuses parts here (§9.2): boss arenas, lesson rooms except the part taught, a band's rim, a Great Lamp |

---

## 6. Wiring

### 6.1 Model (10's syntax, R5)

A room's machines are joined by **wires** in the room's `wires` list (shape in 10 §6.6):

```json
{ "from": "lv_blue", "to": "g_both", "do": "input" }
```

- A **source** sends a signal: `on`, `off`, `pulse`, or a number (a valve's level, a plate's weight / needs, a
  basin level, a counter's count). A wire's `when` filter picks which signals it acts on: `"on"`, `"off"`,
  `"pulse"`, `{ "levelBelow": y }`, `{ "levelAbove": y }`, `{ "equals": n }`. No `when` = any change.
- `do` is the **action** the target performs: `open`, `close`, `toggle`, `enable`, `disable`, `pulse`, `spawn`,
  `fill`, `drain`, `stop`, `light`, `snuff`, `say` (with `"line"`), `shake`, `set` (with `"value"`, or the
  source's number if no value is given), and for logic things `input`, `set_latch`, `reset`.
- **Held vs edge actions.** `open`, `close`, `enable`, `disable`, `fill`, `drain`, `set`, `light`, `snuff`,
  `stop` and `input` are **held**: applied every tick the filter matches the source's current signal. `toggle`,
  `pulse`, `spawn`, `say`, `shake`, `set_latch` and `reset` fire **once**, on the tick the filter starts to match.
- **Not** is a wire with `"when": "off"`. Several wires into one target act as **or** (any held `open` keeps a
  door open).

### 6.2 Logic things (the gate kinds)

A gate is a `logic` thing: `{ "t": "logic", "id": "…", "kind": "…", … }`. It takes its inputs from the wires
pointed at it and sends `on`/`off` (and, for `sequence`, a `pulse` on a wrong step). Invisible unless `show: true`
(a small brass box on the wall). These seven kinds replace v1's gate list and 10's separate `timer`/`counter`
things.

| `kind` | Inputs (wire `do`) | Output | Props |
|---|---|---|---|
| `timer` | `input` | by `mode`: **`delay`** = the input, `sec` later · **`pulse`** = on a rising input, `on` for `sec` then `off` · **`hold`** = `on` while the input is on, then `sec` longer · **`blink`** = while the input is on (or always, with no input), toggles every `sec` | `mode`, `sec` |
| `latch` | `set_latch`, `reset` | `on` after a set, `off` after a reset (set wins a tie) | — |
| `toggle` | `input` | flips on each rising input | `state` |
| `counter` | `input`, `reset` | `on` once it has seen `n` rising inputs; also sends its count as a number | `n` |
| `sequence` | `input` from each of `order` | `on` when the sources in `order` rise in that order within `window` s; a wrong one sends `pulse` and starts over | `order` [ids], `window` |
| `compare` | `input` (a number) | `on` while the number is `op` `value` | `op` (`>=`, `<=`, `between`), `value` or `min`/`max` |
| `any_of` | `input` (2+) | `on` while at least `k` inputs are on. `k` = the number of inputs is **and**; `k` = 1 is **or** | `k` |

### 6.3 Evaluation

1. Once per sim tick, at step 2 of the tick (10 §4.1): after entity physics, before targets act.
2. Things are sorted so every thing comes after its inputs (done once at room load); a chain resolves in one
   tick, max depth 16.
3. **Loops** are allowed only through a `timer`, `latch`, `toggle` or `counter`: those read their inputs from the
   **previous** tick, which breaks the loop. Any other loop fails `room-check` with the loop named (and is cut at
   runtime).
4. Rising and falling edges compare with the previous tick's signal.

Cost: a room has at most 64 wired things; evaluation is a few microseconds.

### 6.4 Example (P2-2's door, in 10's syntax)

```json
"things": [
  { "t": "lever", "id": "lv_blue", "at": [300, 210] },
  { "t": "lever", "id": "lv_red",  "at": [112, 210], "spring": 2 },
  { "t": "plate", "id": "plate_a", "rect": [200, 242, 12, 2], "needs": 1 },
  { "t": "logic", "id": "g_both",  "kind": "any_of", "k": 2 },
  { "t": "timed_door", "id": "door_out", "rect": [440, 196, 8, 24], "open": 4 }
],
"wires": [
  { "from": "lv_blue", "to": "g_both",   "do": "input" },
  { "from": "lv_red",  "to": "g_both",   "do": "input" },
  { "from": "g_both",  "to": "door_out", "do": "open", "when": "on" },
  { "from": "plate_a", "to": "door_out", "do": "open", "when": "on",
    "path": [[206, 242], [206, 190], [444, 190]] }
]
```

`path` is optional and **for drawing only** (§6.5); logic never reads it. `room-check` warns when a wire between
two visible things has no `path`.

### 6.5 Showing the wires (readability)

- Wires with a `path` are thin copper lines (`#6b4a2c`, 1 cell) on the background layer.
- A live wire glows faintly in the source's indicator colour; the glow travels at 400 cells/s when the signal
  changes, so the player **sees** what a lever does.
- **Inspect** (02) brightens every wire in view, labels logic things with a glyph (⏱ ◐ ↻ # ⇶ ≷ ∀), and dims
  everything else. Puzzles never hide wiring; they hide **access**.
- By design, some Act 4 wires run through dark areas and show only where light falls (still visible in Inspect).

### 6.6 Wiring by spells (players can rewire, a little)

- **Spark** hitting a drawn wire sends a `pulse` along it from that point (so a Spark bolt can trigger a door
  whose lever you can't reach). Wires with `insulated: true` ignore this.
- **Bile** on a drawn wire **cuts** it for this visit (it sends nothing until the room resets or is Rekindled).
  Some puzzles want this (cut the wire that closes the gate).
- **Rime** on a lever or valve applies `frozen` (03): while frozen it cannot change state.
- The Knot `on_hit` (Act 4) can carry a Spark pulse through a dummy target (03, P4-7).
- **Turret shots never trigger knots** (R80), so a Tinker turret never sets off a knot's child.

---

## 7. Spells against interactables

Rows are the 7 flames (00 §8); the full flame × material table is 03 / 06. This matrix covers only the 18
interactables and the crate. "frozen" = 03's `frozen` status on an object (03 owns how long it lasts). "—" = no
effect.

| Interactable | Ember | Rime | Spark | Bile | Gleam | Tide | Shade |
|---|---|---|---|---|---|---|---|
| lever / valve | — | **frozen** (jammed) | — (drawn wires: pulse) | corrodes after 3 s: stuck in its state for this visit | — | — | — |
| button / target | presses (hit) | presses | presses | presses | presses | presses (a wave that reaches it) | presses |
| plate | burning crates lose weight | freezes water on it → ice (same weight, doesn't drain) | — | — | — | adds water (80 cells = 1 unit) | — |
| sluice gate | — | **frozen** (stops moving) | electrifies the water behind it | corrodes a 4×4 hole per 2 s | — | pushes water through an open gate faster | — |
| timed door | — | **frozen**: timer paused (stays open) | restarts its timer if wired from a coil | — | — | — | — |
| door / portcullis | burns a `wood` door | **frozen** | — | dissolves a `metal` bar per 1.5 s | — | — | — |
| light door | light counts (amber) | light counts (cyan) | light counts (white) | light counts (green) | light counts; the brightest | light counts (blue) | **forces dark** 5 s (opens `invert` doors) |
| spark coil | — | — | **+1 charge per hit** (beam: +2 per 0.5 s) | — | — | shorts it if water covers it (drains all charge) | drains 1 charge per hit |
| lift | — | **frozen** in place | runs a coil-powered lift like a coil | — | — | — | — |
| bell | — | muffled while frozen (pulse, no sound wave) | rings a metal bell | — | — | — | — |
| breakable wall | burns `cracked` wood and wax | brick **brittle** (03's shatter rule) | — | **dissolves** brick/metal | — | pushes water into it | — |
| gravity lantern | — | — | flickers it off 1 s | — | — | — | switches it **off** for 5 s |
| crate | burns (~6 s) | frozen to the floor (can't be pushed) | — | dissolves slowly | — | pushes it (a wave floats it) | — |
| oil barrel | **explodes** after 0.8 s | puts out a burning barrel; thickens the oil (no leak while frozen) | **explodes** (spark ignites oil) | leaks it | — | knocks it over (spill) | — |
| lamp-post / socket | **lights** | puts a socket out | lights a socket for 10 s only (a spark isn't a flame) | — | **lights** | puts a socket out (unless hooded) | darkens 5 s |

The pole's **lantern touch** (§4.2) gives the same effects at 1-cell scale, on cells only.

---

## 8. Traps

### 8.1 The rule

A trap is a thing with a **trigger**, a **telegraph** (a visible, lit warning — readable danger), an **effect**
and a **reset**. **Traps hit anything in them, enemies included** (00 §13, R51). Enemies are **lured** into them
by thrown lights and noise (05's lure rule, B5): a lit crate, a lantern post, a ringing bell, an explosion.
Damage numbers are at Act 1 scale and grow **+15% per act**. Every trap can be a wire target (`enable`, `disable`,
`pulse` = fire now), so puzzles can arm, disarm or fire it. **No trap asks you to mash a button** (R73): a trap
that holds you lets go on its own.

**Trap kills pay:** an enemy killed by a trap or by the world gives **+50% XP** and is booked in the Ledger under
the source **"The Hollow"**; the first one gets a Narrator line (01). The Tinker's Hijack node (04) takes a trap's
trigger.

### 8.2 The 10 traps

| # | `t` | Name | Acts | Trigger | Telegraph | Effect | Reset | Counters |
|---|---|---|---|---|---|---|---|---|
| 1 | `trap_spikes` | spike bed | all | always (static) | pale spikes, lit tips | **15** + knock up 180; if the spikes are in a pit, the player is returned to the last safe ledge (−15, no death unless ≤ 15 health) | — | pogo on them (no damage), cover with a crate/plank, fill the pit with water/sand |
| 2 | `trap_icicle` | falling spike / icicle | 1, 3, 6 | anything passes under (a 12-wide trigger column), or a bell's wave | shakes 0.4 s, a drip of dust | **20** on hit; 6×16 cells; becomes rubble cells | regrows 12 s (icicles), never (stone) | Ember melts icicles, a pole hit knocks it down early — onto whatever is below |
| 3 | `trap_pendulum` | swinging blade | 2, 5 | always | a lit arc painted on the wall showing its swing | **25**, knock 220; period 2.4 s, arc 120°, length 40 | — | Rime freezes it; cut its rope (chains: Bile only) to drop the blade (it becomes a weight) |
| 4 | `trap_crusher` | ceiling crusher | 2, 5 | cycle: down 0.3 s, pause 0.6, up 1.2, pause 1.0; or wired | a red light 0.5 s before each drop; dust | **50** + stagger; instant death with ≤ 8 cells of headroom (a crate or brace **jams** it — crushed over 3 s) | cycle | jam it, Rime-freeze it up, wire it off — or lure enemies under it |
| 5 | `trap_darts` | dart wall | 2, 4 | a plate or a wired button | slots glint when your light touches them | 3 darts, **8** each, 400 cells/s, 0.2 s apart; Act 2 darts are Bile-tipped (`corrode`, 03) | 2 s | swat (04), block with a crate, trigger it with a thrown object |
| 6 | `trap_flamejet` | oil flame jet | 1, 4 | cycle (on 1.5 / off 2.0) or wired | a pilot flame always burns; hiss 0.4 s before | a 48-cell jet of fire, **18/s** + `burn`; ignites oil/wood it touches | cycle | Rime puts out the pilot (off until relit), Tide floods the nozzle |
| 7 | `trap_ratpipe` | rat flood pipe | 2 | anything enters its zone | squeaking 1 s before, the pipe mouth glows green | 40 rats pour out like a liquid, **1** per rat touch (0.25 s per-rat cooldown), and bite whatever they meet — gutter rats included; they disperse after 8 s | 20 s | light (rats avoid light, 05), Ember ring, a crate over the mouth, Tide washes them away |
| 8 | `trap_sparkpuddle` | live puddle | 3, 4 | a `spark_coil` wired to a puddle; cycle or plate | the water glints white every 0.5 s while live | anyone in the connected water: **12/s** (Spark, 03) | cycle | drain it, freeze it (ice doesn't conduct), Shade/Tide the coil |
| 9 | `trap_waxdrip` | wax drip | 1 | cycle (every 1.2 s) | a glowing drop forms 0.4 s | a molten wax drop: **6** + slow; pools and hardens into 1–2 cells of wax (builds terrain over time) | cycle | Rime hardens it mid-air (a platform-building tool), Ember speeds it |
| 10 | `trap_tollrubble` | bell-rubble ceiling | 5 | any bell's wave in range | ceiling cracks are lit gold | chunks fall: **8–30** by size | never | stand under a marked arch; ring it yourself when the Knell are under it |

Counters use §7 and 03. Every "Rime freezes X" is 03's `frozen` status on that object.

### 8.3 Trap rooms (R51, B5)

- **The `trap` room tag.** 2–3 rooms per act **from Act 2** carry the tag `trap` in the room's tags (10 §6.2)
  and in the act map's room list (09). Their intended win is a trap: the enemies are placed so a lure (a thrown
  light, a bell, a barrel) walks them into a crusher, a flame jet, a rat pipe or a toll-rubble ceiling. A trap
  room has a Rekindle post (§9.5) and a **trap solution script** (§11): the bot wins it with a trap kill.
- **Where they sit** (per act, on the new node ids): Act 2 — `a2_n03` room 2 (the lesson below), `a2_n05`,
  `a2_n07` room 1; Act 3 — `a3_n03`, `a3_n04`; Act 4 — `a4_n03`, `a4_n04`, `a4_n07` room 1; Act 5 — `a5_n04`,
  `a5_n05`; Act 6 — `a6_n03`, `a6_n08` room 1. 09's act tables list them.
- **The lesson: Pickering's Crusher** (`a2_n03`, room 2 of the Lockhouse — a trap room, not a Lesson room, because
  it holds enemies). A `trap_crusher` over a gutter channel, a `lever` that wires it from `disable` to its cycle,
  and 3 `gutter_rat`s nosing along the far end. Hush chirrs at the lever. ★ Script: `goto lv_crusher ·
  interact lv_crusher · throw crate_lit → under_crusher · waitFor(kills ≥ 3, source "The Hollow")`. Alt: stand
  on the far side and let the rats chase you under it (they are lured by your light too). The first kill plays
  the Narrator's trap line.

---

## 9. Building, and recovering a room

The **plank kit** arrives in Act 1 at the Drip Gallery (`a1_n06`, P1-4). The Tinker builds from the start and
owns two extra parts. Parts are paid in **scrap**; 08 owns scrap drops and part prices (sold at Crane's Pawn).
Build-mode keys and the build strip are **02's** (R18).

### 9.1 Build mode (R19)

| Rule | Value |
|---|---|
| Time | the game keeps running at **full speed** (building in a fight is a skill). A 35% slow-time exists only as an accessibility option (02, default off on every difficulty) |
| Picking a part | from the build strip (02); only unlocked parts show |
| Placing | a **ghost** follows the cursor (or sits 20 cells in front of you on a pad and moves one grid step at a time); **green** = valid, **red** = invalid with a one-line reason ("Needs a solid end", "Too far", "No building here") |
| Rotate | **45° steps**: planks and ladders cycle horizontal → 45° → vertical → −45°; others as listed |
| Build time | per part (table); the part fills in cell by cell from its anchor end; **not solid until finished**; Tinker and Knack change it (04) |
| Build range | **64** cells from your hands, with line of sight (Tinker bonus: 04) |
| Grid | parts snap to a **4 × 4 cell grid** aligned to world coordinates |
| Deconstruct | hold interact on your own part for 0.5 s: **100%** scrap back within 5 s of it finishing, **50%** after; nothing for a burned or broken part |
| Part limit | **40** built parts per room in the campaign (Floodgate: 120); at the limit the ghost is red: "Room is full — take something down" |
| **Persistence (R3)** | built parts are **prefab state**: the room saves a **part list** — for each part its id, position, rotation and a mask of its remaining cells. A part that burned away or broke is dropped from the list and does not come back. The fire, ash, spilled sand and every other raw cell change reset on re-entry like all cells (00 §13). |

### 9.2 Placement rules

1. **Footprint**: the part's cells must not overlap solid cells (terrain, other parts, interactables' cells), the
   player, enemies, NPCs, or items on the floor. They **may** overlap liquids, gases and loose powders, which are
   pushed into the nearest free cells when the part finishes (so you can build a dam in water).
2. **Support**: each part has an attach rule (table), checked live.
3. **No-build**: inside a `nobuild` zone (boss arenas, Lesson rooms except the part taught, a band's rim, over a
   Great Lamp) and anywhere in a **`sanctuary`** (every hub, R87). Hatched overlay, visible in Inspect.
4. **Line of sight** from your hands to the part's anchor cell.
5. **No sealing yourself in**: a part that would close the last path between you and every room exit (a flood-fill
   of free cells, checked on confirm, ≈ 1 ms on a 480×270 room) is refused ("That would trap you"). Floodgate
   turns this check off.

### 9.3 Parts (8 + 2 for the Tinker)

Materials are the built ones (R60): `plank` for plank, brace, crate, ladder and float; `rope`; `metal`; `glass`.
The sandbag is a small prefab whose `plank` frame holds `sand` cells — burn the frame and the sand spills. A fuse
(if a room wants one) is a `rope` run with an end probe that sends `pulse` when fire reaches it; it is not a part.

| id | Name | Size (cells) | Cells | Scrap | Build time | Strength (weight units) | Attach rule | Unlock |
|---|---|---|---|---|---|---|---|---|
| `bp_plank` | Plank | 24 × 2 | `plank` | **2** | 0.4 s | 4 (cantilever) / 8 (both ends) | **one end** cell adjacent to solid (then it may overhang its full 24); rotations H, ±45°, V (V = a thin post) | Act 1 |
| `bp_brace` | Brace | 12 × 12 triangle | `plank` | 2 | 0.4 s | adds **+4** to a plank whose free end sits on it | two sides touching solid (a wall and a floor, or a wall and a plank's underside) | Act 1 |
| `bp_crate` | Crate | 10 × 10 | `plank` | 4 | 0.6 s | — (a weight-1 physics object; carry it, §2.12) | rests on anything; falls | Act 1 |
| `bp_ladder` | Ladder | 6 × 24 (stacks) | `plank` | 3 | 0.5 s | — | top **or** bottom touching solid or another ladder | Act 2 |
| `bp_rope_peg` | Rope peg | 4 × 4 peg + a 60-cell verlet rope | `metal` + rope | 3 | 0.5 s | holds 3 | its back against a solid surface (wall, ceiling, underside of a plank) | Act 2 |
| `bp_sandbag` | Sandbag | 12 × 8 | `plank` frame + `sand` | 4 | 0.8 s | 2; **holds back water** (a dam) | rests on solid; stacks | Act 3 |
| `bp_float` | Float | 12 × 6 | `plank` | 5 | 0.6 s | 2 (sinks past that) | placed on or in water; floats | Act 3 |
| `bp_lantern_post` | Lantern post | 4 × 20 | `plank` + `glass` | 6 + **5 oil** | 0.8 s | — | on a solid floor | Act 4 |
| **Tinker only** | | | | | | | | |
| `bp_turret_1` | Turret | 10 × 10 | `metal` | 20 + 30 oil | 1.5 s | HP 45 | on a solid floor; max **2** turrets | Tinker start |
| `bp_spikes` | Spike trap | 16 × 4 | `metal` | 6 | 0.6 s | — | on a floor | Tinker, Act 2 |

**What the special parts do**

| Part | Behaviour |
|---|---|
| Float | a raft; carries the player (1) + one crate; drifts with current zones (60% of `vec`, like the player); you can pole-push off walls (80 cells/s impulse) |
| Sandbag | a dam: water can't pass through it; burning its frame spills its sand (the dam fails) |
| Lantern post | a `lamp_socket` you own: lit by lantern touch; radius **50** for **90 s** on its 5 oil; relight by paying 5 oil again. Counts as light for light doors; a thrown-light lure for the lure rule; the Unlit avoid its radius (05) |
| Turret | fires the Tinker's **selected wick** at **50%** power, one shot per **1.5 s**, range 160 cells, auto-targets the nearest visible enemy; each shot spends the wick's oil from the turret's own **30-oil tank**; lasts until the tank is empty or HP 0. **Its shots never trigger knots** (R80). The class ability version is 04's |
| Spike trap | 12 damage per contact, 0.5 s per-enemy cooldown; pogo-able; counts as a trap (Ledger "The Hollow", §8.1) |

### 9.4 Built things are real cells

- When a part finishes, its cells are **written into the grid** with the part's material and the **`BUILT`** flag
  (06 §2.2), so every system treats it as world: water flows around it, fire burns it, Bile eats it, explosions
  break it, rain wets it.
- **Support.** A standing part is held **as one piece** by its attach rule and **strength** (the table), not by
  06's per-cell span rule — so a 24-cell cantilever plank holds even though `plank`'s cell span is 12. If the weight
  on it exceeds its strength for 0.5 s, or its attach cells are destroyed, it **creaks for 0.3 s** (a visible sag
  and a sound: fair warning), its cells drop the `BUILT` flag, and they fall as **debris** under 06's rules
  (fragments up to 40 cells). Debris deals **5 damage per 10 cells** to what it lands on.
- **Burning.** `plank` burns per 06 (a plank part burns through in a few seconds). A plank burning at its anchor
  end falls — **burning your own bridge** is a real tactic (drop it on enemies under it). `WET` wood (rain) is
  slower to catch (06).
- **Breaking.** Enemies with the `breaker` tag (05) attack parts in their way; a part loses cells one at a time.
- **Floating.** Plank debris floats; planks knocked into water become floating chunks you can stand on.
- **Freezing.** Rime makes a wood part `frozen` (03): it doesn't burn and its strength doubles while frozen.
- **Conducting.** Metal parts (pegs, turrets, spikes) conduct Spark like metal terrain.

### 9.5 Recovering a room (R10, B8, B9)

A falling-sand puzzle game **will** let the player burn the only rope or drain the water a plate needed. Three
rules make that a shrug, never a soft-lock.

**1. Brass means safe (`PINNED`).** Every cell a puzzle cannot lose is authored with the `PINNED` flag (the
legend's `%` stone and `=` brick) and drawn with a faint **brass rim**. Spells, explosions, Bile and collapse
leave pinned cells alone (06 §2.2 owns the rule). The player learns the look in the very first lesson: in
**P1-1 The First Step**, a guttering wall lamp drops burning oil onto a brass-rimmed plank bridge and an ordinary
crate — the crate burns, the bridge does not, and Hush chirrs `*brass!*`.

**2. The Rekindle post.** At the entry of every **puzzle, lesson, flood and trap** room hangs a small Guild lantern
on a hook (a `rekindle` thing, placed by the room compiler at the room's first `entry` if the author didn't place
one). It is free and always works.

- `interact` at it: a rewind shimmer runs across the room (0.6 s), the room's cells **stream back to the
  template**, and **prefab state is kept** (levers, doors, lamp-posts, broken wall groups — 00 §13). You are placed
  at the entry.
- **Killed enemies stay dead**; living ones go back to their placed spots.
- **Your built parts** in the room are taken down and their scrap refunded in full (so a bad bridge can never block
  the reset).
- **Items lying on the floor** of the room go to the save's `lootSafe` list and are handed back at the post, so a
  reset never deletes loot.
- A flood room's water returns to its start level and the flood restarts when you cross its trigger again.
- The Narrator makes one dry remark (01), and the Ledger counts **"Rooms rekindled"**.

**3. The pause-menu entry.** "Rekindle this room" is in the pause menu **in any room while no fight is live** (no
enemy is hunting you and no arena is locked). Same effect as the post, free.

**The single-flame check (room-check).** For every puzzle room, `room-check` takes the ★ solution script (§11),
finds every unpinned cell within 16 cells of the script's path and targets, and — group by 8×8 group — applies
each of the 7 flames' cell reaction to it, then re-runs the script. If any single flame on any unpinned group
breaks the ★ solution, the room **fails** until the author pins those cells or adds another way. (This is why
Rekindle is a comfort, not a crutch.)

---

## 10. Puzzle catalogue

**20 puzzles**, 3–4 per act, each on a node from 09's v2 act maps. Ids keep their v1 numbers so old references
still point at the right puzzle; the gaps are parked puzzles (Parked (v2)). Each entry names the node, the
**mechanic it teaches** or tests, the setup, **every intended solution**, and the ★ solution as a **script**
in the bot's verbs (§11.2). Solutions marked ★ are the expected one; the others are there on purpose for players
who think with materials. **Lesson** = a Lesson room (no enemies). Every puzzle room has a Rekindle post (§9.5).

Mechanic tags for the index (§10.7): `move`, `wall`, `wick`, `lob`, `plank`, `build`, `ember`, `rime`, `spark`,
`gleam`, `hook`, `rope`, `burn_rope`, `lever`, `timer`, `plate`, `weight`, `charm`, `bile`, `water`, `swim`,
`sluice`, `tide`, `current`, `dark`, `oil`, `light_door`, `knot`, `shade`, `explode`, `gravity`, `bell`,
`sequence`, `wind`, `cloud`, `overcharge`, `trap`, `multi`.

### 10.1 Act 1 — Lanterncrown & the Wax Stair

**P1-1 · The First Step** (`a1_n02`) — **Lesson** · teaches `move`, `wall`, `light_door`, pinned cells
- Setup: a 60-cell chimney (20 wide, stone) to climb by wall-jumping; at its top, a brass-rimmed plank bridge and a
  plain crate under a guttering wall lamp (the brass beat, §9.5); then a `light_door` (tier `lit`) on a ledge 30 cells
  up across a 36-cell gap, with a dead `lamp_socket` (`gutter: 60`) beside it. The rain has put the socket out.
- ★ Wall-jump up the chimney, watch the lamp's oil burn the crate and not the bridge, run-jump the gap (36 < 44), let
  the automatic ledge-grab catch the ledge, stand by the eye: your lantern alone reads `lit`.
  Script: `goto chimney_foot · goto chimney_top · waitFor(crate_1 burned) · goto ledge_door · waitFor(door_eye on) · goto exit`.
- Alt: light the socket with lantern touch; it lights the eye for 60 s.

**P1-2 · The Candle Shelves** (`a1_n03`) — **Lesson** (Wick builder; Rime, **lob**, wick slot 2) · teaches `wick`, `lob`
- Setup: six `lamp_socket` candles (`gutter: 20`) on shelves; `any_of k=6` → `latch` → the chapel stair `door`, so
  all six must be lit at once and the stair then stays open. Two candles sit behind a lip (a bolt can't reach them),
  two are high on a ledge a lob falls short of, two hang on a swinging wooden sign. The lesson grants **lob** and
  Rime; every class owns Ember and bolt (00 §7).
- ★ Braid **Ember Bolt** for the high ones and **Ember Lob** for the lipped ones; swap between wick slots 1 and 2.
  Script: `braid(slot1, ember, bolt) · braid(slot2, ember, lob) · castAt(candle_hi_1, slot1) · castAt(candle_hi_2, slot1) ·
  castAt(candle_lip_1, slot2) · castAt(candle_lip_2, slot2) · castAt(sign_candle_1, slot1) · castAt(sign_candle_2, slot1) ·
  waitFor(stair_door open)`.
- Alt: climb to each and lantern-touch (possible, but 20 s is tight: needs the roof route).
- Alt: knock the swinging sign into a lit candle with the pole (the sign is `wood`: it catches and lights its neighbours).

**P1-4 · Too Wide** (`a1_n06`) — **Lesson** (plank kit) · teaches `plank`, `build`
- Setup: a 70-cell gap (running reach is 49) and 6 scrap on the floor. On the far side, a ledge 60 cells up.
  Pim is on the far side, calling across (01).
- ★ Build a plank sticking out 24 cells from the near edge, run off its end: 24 + 44 > 70. Then two planks as steps up
  the wall to the 60-cell ledge (each ≤ 34 up from the last).
  Script: `pickup(scrap ×6) · build(bp_plank, gap_edge, 0°) · goto plank_tip · goto far_side ·
  build(bp_plank, step_1, 0°) · build(bp_plank, step_2, 0°) · goto ledge_top`.
- Alt: build a crate at the wall, jump on it (+10), then a plank from the crate's top.

### 10.2 Act 2 — The Gutterways

**P2-1 · Hookwright's Yard** (`a2_n02`) — **Lesson** (grapple) · teaches `hook`, attach rules
- Setup: a pit 200 wide with `grapple_point`s (bite), a smooth `metal` ceiling (the hook bounces off) and a `wood`
  beam. The metal is right where the obvious swing point would be.
- ★ Swing ring → ring → wood beam, releasing with the pop between.
  Script: `grapple(ring_1) · swing · release · grapple(ring_2) · swing · release · grapple(beam_1) · swing · release · goto far_ledge`.
- The lesson beat: the hook bounces off the metal with a clang and Hush chirrs `*no — wood!*`.

**P2-2 · Pickering's Locks** (`a2_n03`, room 1) — **Lesson** (levers, buttons, plates, timed doors, **Spark**) ·
teaches `lever`, `timer`, `plate`, `spark`
- **2a · The Locks.** The exit is a `timed_door` (4 s) opened by `any_of k=2` over `lv_red` and `lv_blue`, **or** by
  `plate_a` (the §6.4 example). The levers are 300 cells apart and red is **spring-loaded** (`spring: 2`, flips back after
  2 s), so you can't flip red, run to blue and still have both on. The door is 400 cells from the red lever.
  - ★ Flip blue first (it stays), then flip red and grapple-swing along the room's rope line to the door — the gate fires on
    red's flip, the door's 4 s timer starts when red springs back, and the swing gets you there in ≈ 3 s.
    Script: `goto lv_blue · interact lv_blue · goto lv_red · interact lv_red · grapple(rope_line) · goto door_out · waitFor(door_out open) · goto door_out.beyond`.
  - Alt: push the room's crate onto `plate_a` (needs 1): the door stays open while the plate is down. The crate sits behind a
    drop to a lower ledge, so you have to hook it up first (§3.8 "yank").
  - Alt: fire a bolt at the red lever (a hit flips it) from beside the door, then walk through.
- **2b · The Spark Lift** (was v1 P1-6; moved here with Spark, R27). Pickering hands over **Spark**. A `lift` with
  `power: "coil"` rises 400 cells to the exit; a full `spark_coil` (5 charges) powers 15 s; the ride takes 8 s at 50 cells/s.
  The coil is dead.
  - ★ Spark bolts into the coil (5 hits), ride up.
    Script: `braid(slot2, spark, bolt) · castAt(coil_1, slot2) ×5 · goto lift_1 · interact lift_1.call · waitFor(lift_1 at stop 1) · goto exit`.
  - Alt: lantern touch with a Spark wick 5 times (0.5 s apart).
  - Alt: ignore the lift: the shaft wall is `wood` — wall-jump, with planks where it is too wide (slow, but valid).
  - Alt: a wet level rope runs from the coil to the landing; hit the rope with Spark from below.
- Room 2 of the node is the trap lesson, **Pickering's Crusher** (§8.3).

**P2-4 · The Rat Sump** (`a2_n05`, The Brickgut) — teaches `plate`, `trap`, swarm-as-liquid
- Setup: the way down to the Gutter Cistern (where **Bile** waits) is a pipe full of rats (a `trap_ratpipe` that never
  empties). A solid sluice `door` over the pipe's mouth is held up while `plate_1` is down; a side channel leads to a
  flooded sump.
- ★ Hold the plate down with a crate: the door lifts, the rats pour out into the side channel and wash into the sump;
  shove the crate off to drop the door while the pipe is empty; climb down.
  Script: `goto crate_1 · push(crate_1 → plate_1) · waitFor(door_1 open) · waitFor(pipe_1 empty) · pole(crate_1) ·
  waitFor(door_1 shut) · goto pipe_1.foot`. (The rats that wash into the sump drown: the room's trap kills pay, §8.1.)
- Alt: Ember ring at the mouth (rats flee fire) while you drop in, then hold them off (hard).
- Revisit (Bile in hand): Bile the pipe's lower wall so the rats drain elsewhere.

**P2-5 · Three Eyes** (`a2_n06`, the Charmwife's Niche) — **Lesson** (Charm slot 1, **`split`**) · teaches `charm`
- Setup: three `target`s set in a fan around a slit in a brick screen, wired `any_of k=3` through their 0.5 s `on` —
  all three must be hit within 0.5 s. They open the Niche's back door. From the slit, one straight shot can only ever
  reach one eye.
- ★ Add `split` to a bolt: three copies in a fan (03) hit all three eyes at once.
  Script: `braid(slot1, ember, bolt, split) · goto slit_mark · castAt(target_mid, slot1) · waitFor(niche_door open)`.
- Alt: bolt one, then two quick lobs — the lobs' flight time makes the 0.5 s window only just possible.
- Alt: grapple the small crate above and throw it at one eye while two bolts take the others (hard timing).
- The room's second beat teaches **overcharge** (02/03): hold `cast` on the `target` behind a wax plug and watch the
  gutter meter. No puzzle rides on it.

### 10.3 Act 3 — The Sluice Ward

**P3-1 · The First Cistern** (`a3_n01`) — **Lesson** (swimming) · teaches `swim`
- Setup: a flooded cistern 180 cells deep; breath 12 s; three air pockets on the way down; a `valve` at the bottom
  whose level feeds `compare >= 1` → the exit `door`.
- ★ Pocket-hop down (each ≤ 10 s of swimming apart), turn the valve (2 s hold), swim up.
  Script: `goto pocket_1 · goto pocket_2 · goto pocket_3 · goto valve_1 · holdInteract(valve_1, 2) · goto pocket_3 · goto surface · goto exit`.
- Alt: stroke-dive straight down (strokes burst at 90) and back — possible with good timing.

**P3-2 · Top Gate First** (`a3_n02`, Voss's lesson room in the Pumpworks) — **Lesson** (sluices, basins, currents;
**Tide** is granted here) · teaches `sluice`, `water`, `current`
- Setup: three basins stacked like steps, each with a drain `sluice_gate` (+ a `lever`) into the next one down; the
  bottom one drains out of the Ward. Above them all, the **top gate** lets the reservoir in — and it is open, so the
  basins are full and keep refilling. Each open drain switches on a `current` zone at its mouth (an undertow of
  60 cells/s). The exit is on the bottom basin's floor.
- ★ Voss's rule: **deal with the top gate first** — shut the inflow, then open the drains bottom → middle → top so
  each basin empties into an empty one below.
  Script: `goto lv_top · interact lv_top · goto lv_drain_3 · interact lv_drain_3 · waitFor(basin_3 {levelBelow: floor_3}) ·
  goto lv_drain_2 · interact lv_drain_2 · waitFor(basin_2 {levelBelow: floor_2}) · goto lv_drain_1 · interact lv_drain_1 ·
  waitFor(basin_1 {levelBelow: floor_1}) · goto exit`.
- Alt: leave the top gate open but Rime the inflow in its gateway — the water there freezes into a plug while `frozen`
  — and run all three drains inside that window. Fast and risky.
- Alt: shut the top gate, then Bile a hole low in the bottom basin's outer wall (not pinned): it drains straight out of the
  Ward and you skip the lever order.

**P3-6 · Live Water** (`a3_n03`, Cistern Row) — teaches `spark`, `water`, `multi`
- Setup: a cistern crossing 300 wide with a `trap_sparkpuddle` (a `spark_coil` that electrifies the water every 2 s,
  12/s). The ceiling is `metal` (the hook won't bite).
- ★ Rime a path of ice across the surface (ice doesn't conduct) and walk it while it holds.
  Script: `braid(slot2, rime, bolt) · castAt(water_1, slot2) · goto ice_1 · castAt(water_2, slot2) · goto ice_2 · castAt(water_3, slot2) · goto far_bank`.
- Alt: Tide-short the coil (cover it with water: drains all charge), then swim.
- Alt: build **floats** and pole-push across (wood doesn't conduct).
- Alt (revisit, Act 4): Shade the coil (drains a charge per hit) until it is dead.

**P3-5 · Raise the Market** (`a3_n05`, the Drowned Market's approach) — teaches `water`, `sluice`, `build`
- Setup: the Drowned Market's door is 160 cells up a dry cistern wall (it is reachable only when flooded). An inflow
  `valve` (level = fill rate of the basin) and a drain `sluice_gate` on a `lever`.
- ★ Close the drain, open the inflow; the basin fills (06's basin rate, ~12 rows/s); swim up with the water.
  Script: `goto lv_drain · interact lv_drain · goto valve_in · holdInteract(valve_in, 2) · waitFor(basin_mk {levelAbove: door_sill}) · goto market_door`.
- Alt: stand on a **float** (built) and ride the rising water up.
- Alt: fill only halfway and wall-jump the pinned brick seams for the rest.
- The story choice of draining this cistern for good (`pale_kept`, 01) is a separate valve, not this puzzle.

### 10.4 Act 4 — Blackwater

**P4-1 · The Last Light** (`a4_n01`, the Last Derrick's lesson room) — **Lesson** (darkness, oil, the hood; **Gleam**
is granted here) · teaches `dark`, `oil`, `light_door`
- Setup: a 900-cell dark stretch with 5 dead `lamp_socket`s (`gutter: 60`). The exit is a `light_door` (tier `lit`).
  From here on, in `ambientTier` `dark` your oil does not regenerate and the lantern burns **2.5 oil/s** (hooded ×0.25;
  03 owns the oil rules). A leaking `oil_barrel` halfway along teaches the refuel (§5.22). Lesson rooms
  hold no enemies; Hush says what would be waiting in a real one.
- ★ Light each socket as you go (lantern touch — free) so each lights the next stretch; hood between them; refuel at the
  barrel; stand at the door.
  Script: `goto socket_1 · pole(socket_1) · hood · goto socket_2 · pole(socket_2) · … · pole(barrel_1) · interact barrel_1 ·
  goto socket_5 · pole(socket_5) · goto door_eye · waitFor(exit_door open) · goto exit`.
- Alt: send Hush to perch by the door (Hush holds a light 12 s, 01).
- Alt: throw Gleam bolts ahead as moving lights and sprint.

**P4-7 · Two Buttons, One Moment** (`a4_n02`, the Knot House) — **Lesson** (Knots) · teaches `knot`, `timer`
- Setup: two `button`s (`hold: 0.2`) 80 cells apart on opposite walls, `any_of k=2` → the exit — they must be down
  within 0.2 s of each other. A Guild practice dummy (`target`, `dummy: true`) hangs exactly between them.
- ★ A bolt with Knot `on_hit` = Spark ring: the bolt hits the dummy, the ring fires from there (radius 48, 03) and presses
  both buttons.
  Script: `braid(slot1, ember, bolt, knot:on_hit:spark:ring) · castAt(dummy_1, slot1) · waitFor(exit_door open)`.
- Alt: a `split` bolt from the exact middle (two of its three copies reach the buttons).
- Alt: throw a crate at one while a lob lands on the other (hard timing).

**P4-5 · The Oil Pits** (`a4_n03`) — teaches `knot`, `explode`, `oil`
- Setup: a basin of black water under an oil slick, crossed by a floating plank walkway. Pockets of `miasma` (a
  flammable gas) are trapped under the walkway; the brick wall at the far end must come down, and the only pocket that
  can break it sits behind a stone lip where no bolt or lob from the walkway can reach — and anyone within 60 cells of it
  is in the blast. A Knell practice dummy (`target`, `dummy: true`) stands in the open 30 cells from that pocket.
- ★ **Knot `on_hit`**: from 200 cells away, hit the dummy with a bolt whose child is an **Ember ring** (or Ember lob): the
  child fires from the dummy, over the lip, into the pocket; the pocket blows the wall.
  Script: `braid(slot1, ember, bolt, knot:on_hit:ember:ring) · goto walkway_far · castAt(dummy_1, slot1) · waitFor(wall_1 on) · goto wall_1.gap`.
- Alt: a chain: set off the nearest pocket; its blast sets off the next (pockets 20 cells apart chain) up to the wall.
  Run first.
- Alt: pierce one of the room's `oil_barrel`s, let its oil run down the slope behind the lip, and light the trail from afar.

### 10.5 Act 5 — The Bellwell

**P5-1 · The Nine Valves** (`a5_n01`) — set piece · teaches `sequence`, `water`, `bell`
- Setup: the Bellwell shaft is drowned. Nine `valve`s around three galleries each feed `compare >= 1` into one
  `sequence` (`window` 90 s) that opens the great drain; the wrong order sends the sequence's `pulse`, which floods the
  gallery you're in by 20 rows (a wired `fill`). Each valve has a small `bell` beside it; the right order is **lowest note
  to highest**, and a mural on the first gallery wall shows nine bells by size.
- ★ Ring each small bell (pole), hear the pitch, turn the valves low → high.
  Script: `pole(bell_1) · … · pole(bell_9) · holdInteract(valve_c, 2) · holdInteract(valve_f, 2) · … (the authored order) ·
  waitFor(drain_seq on) · waitFor(shaft {levelBelow: gallery_3}) · goto exit`.
- Alt: Bile the great drain grate at the bottom (a 60-cell dive, 12 s breath: just possible with an air pocket on the
  way) — drains faster but floods the lowest gallery for this visit.

**P5-2 · The Upside Altar** (`a5_n03`, the Bellwright's Foundry, room 1) — **Lesson** (gravity lanterns) · teaches `gravity`
- Setup: an altar (`lamp_socket`) on the ceiling 120 cells up. A `gravity_lantern` on a plinth.
- ★ Carry the lantern under the altar, switch it on: the band flips you up; walk the ceiling, light the socket. Then the
  exit is on the floor again — pick the lantern up while standing in its band (you fall to the floor; land with a tuck).
  Script: `interact lantern_1 · goto under_altar · interact lantern_1 (place, on) · goto altar_1 · pole(altar_1) ·
  interact lantern_1 (pick up) · waitFor(grounded) · goto exit`.

**P5-3 · The Whisper Room** (`a5_n03`, room 2) — teaches `bell`, `timer`, `multi`
- Setup: two bell-doors in series (`timed_door`, `hears: true`, `open: 5`). A big `bell` sits 300 cells from the second
  door, so ringing it and running can't make both. A small metal bell hangs on the far side of door 1.
- ★ Ring the big bell, pass door 1, then ring the small bell by throwing the room's crate at it from behind door 1 (the
  throw line is lined up by the architecture).
  Script: `pole(bell_big) · goto door_1.beyond · pickup(crate_1) · throw(crate_1 → bell_small) · goto door_2.beyond`.
- Alt: a Spark bolt at the metal bell from beside door 2 (Spark rings a metal bell, §7).
- Alt: an `echo` bolt (taught in this node) rings the big bell twice, 0.35 s apart — not enough alone, but with a sprint
  and a slide the second ring's wave catches door 2 (hard).

### 10.6 Act 6 — The Cloudroot

**P6-1 · The Crosswind** (`a6_n02`, the Empty Socket's wind room) — **Lesson** (wind) · teaches `wind`, `cloud`
- Setup: a 600-cell stretch of root against a **30 cells/s** crosswind (`current` zone) with gusts to 180 (a second zone
  on a `timer` `blink`); `cloudstuff` floor that gives way when soaked.
- ★ Move from gust to gust: crouch through gusts, hook `grapple_point`s and cloudstuff (2 s bite) between.
  Script: `goto shelter_1 · waitFor(gust_zone off) · goto shelter_2 · grapple(point_1) · swing · release · waitFor(gust_zone off) · goto shelter_3 · goto exit`.
- Alt: Rime the cloudstuff floor as you go (frozen floor holds and takes a hook).
- Alt: jump **with** a gust to cross the big gap (a tailwind adds ~40 cells of reach).

**P6-4 · Corvin's Hollow** (`a6_n04`) — story puzzle (01, `corvin_freed`) · teaches `overcharge`, `multi`
- Setup: Corvin Crake is held in a pocket of root; a small lake sits directly above him inside the root. Burning the root
  around him (the only way to free him) also releases the lake. **Corvin cannot die** (only Nell can, 00 §11): if the water
  lands on him, the root closes round him again — he coughs, he is fine, and you try again (the Rekindle post is at the door).
- ★ Rime the lake's floor first (it holds while `frozen`), then burn the root around Corvin, then walk him out.
  Script: `braid(slot2, rime, bolt) · castAt(lake_floor, slot2) · castAt(root_cage, slot1) · waitFor(root_cage burned) ·
  interact npc_corvin · goto exit`.
- Alt: cut a channel with Bile that drains the lake sideways into a lower chamber before burning.
- Alt: an **overcharged Ember** on your **mastered** wick (it cannot gutter; full charge held 2.0 s) burns the root in one
  cast, faster than the lake can fall.
- Alt: Tide pushes the falling water off him while you burn (hard).

**P6-5 · The Lightning Rods** (`a6_n05`, the Last Wall) — teaches `spark`, `rope`, `wind`
- Setup: a `timed_door` in the rim wall is powered by a `spark_coil` that needs 5 charges; lightning strikes the highest
  metal every 12–25 s. Three metal rods on the wall; a wet level rope hangs from rod 1 with its free end just short of the
  coil's hook.
- ★ Hook the rope's free end (§3.8 "yank") and hang it on the coil's hook (`interact`): the next strike runs down the rope
  (+5 charges). Don't be on it.
  Script: `grapple(rope_1.end) · interact coil_1 · goto shelter · waitFor(coil_1 charge 5) · goto rim_door.beyond`.
- Alt: charge the coil with Spark bolts (5 hits) in the wind — lobs drift, bolts don't.

### 10.7 Index by mechanic

| Mechanic | Taught in | Tested again in |
|---|---|---|
| `move` / `wall` | P1-1 | P2-2b (alt), P3-5 (alt) |
| `wick`, `lob` | P1-2 | P2-5, P4-5 |
| `plank` / `build` | P1-4 | P2-2b (alt), P3-5 (float), P3-6 (floats) |
| `ember` / `rime` materials | P1-1 (brass beat), P1-2 | P3-2, P3-6, P6-4 |
| `spark` machines | P2-2b | P3-6, P4-7, P6-5 |
| `light_door` | P1-1 | P4-1 |
| `hook` / attach rules | P2-1 | P2-2a, P6-1, P6-5 |
| `lever`, `timer`, `plate` | P2-2a | P2-4, P5-3 |
| `trap` (trap rooms, §8.3) | Pickering's Crusher (`a2_n03` room 2) | P2-4, 2–3 `trap` rooms per act (§8.3) |
| `charm` | P2-5 | P4-7 (alt) |
| `swim` / `water` / `sluice` / `current` | P3-1, P3-2 | P3-5, P3-6, P5-1 |
| `dark` / `oil` | P4-1 | P4-5 |
| `knot` | P4-7 | P4-5 |
| `gravity` | P5-2 | — (Ring Galleries fights, Bellfather) |
| `bell` / `sequence` | P5-1 | P5-3 |
| `wind` / `cloud` | P6-1 | P6-5 |
| `overcharge` | P2-5 (beat) | P6-4 |

Puzzles that rely on **flame × material** play (pillar 2): P1-1, P1-2, P2-2b, P3-2, P3-6, P4-5, P5-3, P6-4.

### 10.8 Puzzles in the other modes

- **Trials** (09) reuse puzzle rooms with a constraint ("P3-6 with no Rime", "the Hooded Crossing").
- **The Long Descent** builds rooms from the 6 **room kits** (09/10). A kit may carry one micro-puzzle made only from
  the 18 interactables: a plate + a timed door, a light door + a lamp socket, a spark lift, a rope over spikes, a
  breakable wall + a barrel. Rule: a generated puzzle must have a solution script using only the **start kit** of the
  run's class (checked by `room-check`, §11).

---

## 11. Authoring and testing puzzles

### 11.1 The `puzzle` block in a room file

A puzzle room carries a `puzzle` block (its field shape is 10 §6; this is what goes in it):

```json
"puzzle": {
  "id": "P3-6",
  "teaches": ["spark", "water"],
  "lesson": false,
  "requires": { "flames": ["rime"], "or": [["tide"], ["build:bp_float"]] },
  "solutions": [
    { "id": "ice_path", "star": true,
      "script": [["braid", "slot2", "rime", "bolt"], ["castAt", "water_1", "slot2"], ["goto", "ice_1"],
                 ["castAt", "water_2", "slot2"], ["goto", "ice_2"], ["castAt", "water_3", "slot2"], ["goto", "far_bank"]] },
    { "id": "tide_short", "script": [["braid", "slot2", "tide", "wave"], ["castAt", "coil_1", "slot2"],
                                     ["waitFor", "coil_1", "off"], ["goto", "far_bank"]] },
    { "id": "floats", "script": [["build", "bp_float", "bank_1", 0], ["goto", "float_1"], ["pole", "wall_push"], ["goto", "far_bank"]] }
  ],
  "hints": [
    { "after": 60, "who": "npc_hush", "intent": "hush_chirr", "tag": "cold" },
    { "after": 120, "who": "narrator", "text": "Ice has never carried a spark." }
  ]
}
```

- `requires` lists what the player must have unlocked; the act map (09) never places a puzzle before its requirements.
- `hints`: after N seconds in the room without solving it, a hint line plays (Hush or the Narrator). Hints can be turned
  off (02).

### 11.2 Solution scripts (R49)

A **solution script** is a list of **verbs** that the path-finding bot runs with the real `movement.json` and the act's
unlocked verbs; it does not care about exact frames, so tuning a jump does not break it. The verbs:

| Verb | Does |
|---|---|
| `goto(thing or mark)` | path-finds there (walk, jump, wall-jump, swim, climb) |
| `interact(id)` / `holdInteract(id, s)` | uses the thing |
| `pole(id)` | a pole hit on it (flip, ring, pierce, shove, lantern touch) |
| `castAt(id, slot)` | aims the wick in that slot at the thing and casts |
| `braid(slot, flame, shape, charm…, knot…)` | sets a wick in the builder |
| `build(part, mark, rotation)` | places a part |
| `grapple(id)` · `swing` · `release` | hook moves |
| `pickup(id)` · `throw(id → target)` · `push(id → mark)` | carry moves |
| `hood` | toggles the hood |
| `waitFor(id, state or filter)` | waits until a thing's signal or a basin level matches (times out after 60 s) |

(10 owns the runner; this is the verb set it needs.)

**Replays** (recorded inputs) are kept **only for determinism tests**: the same input log must give the same world hash.
They never decide whether a puzzle works.

### 11.3 Tests (files per 10 §9)

| Test | Kind | What it checks |
|---|---|---|
| wiring | node | every room's wires: every `from`/`to` resolves; no loop except through `timer`/`latch`/`toggle`/`counter`; every logic thing has inputs; each `kind` behaves per §6.2 (one unit test per kind) |
| movement | node | the movement code against `movement.json`: apex 34 ± 1; running reach 49 ± 2; coyote/buffer windows; step-up 2/3/4; a 160-cell fall does no damage and a 240-cell fall does 20% |
| rope | node | wrap points add at a corner and remove on unwind; a 38-link verlet rope settles within 2 s and stays within 1% of its length; a burning rope snaps on time; a frozen horizontal rope holds the player |
| build | node | every part's attach rule (valid/invalid placements on a fixture grid); overload → collapse after 0.5 + 0.3 s; "no sealing yourself in" refuses the fixture that would; the part list round-trips through a save |
| rekindle | node + e2e | a broken puzzle room restores its cells, keeps prefab state, keeps dead enemies dead, refunds parts, hands floor loot back |
| puzzles | e2e | every puzzle's ★ script and every alt script reach the exit; **every puzzle with ≥ 2 solutions has ≥ 2 passing scripts**; each trap room's script wins with a trap kill |
| room-check single-flame | tool | §9.5's rule on every puzzle room |
| traps | node | each trap's damage/timing reaches the entity code (move a number to an odd value and read it back from the module — the playground "dead data" lesson); every trap hurts an enemy standing in it |

---

## 12. Performance budget and cheap fallbacks

| System | Budget per frame | Fallback |
|---|---|---|
| Player movement + collision | 0.1 ms | — |
| Ropes (hook wrap list + 11 verlet ropes × 10 passes) | 0.3 ms | fewer passes (6) on far ropes |
| Wiring (≤ 64 things) | < 0.05 ms | — |
| Thing-owned cells (gates, lifts, crates moving cells) | 0.3 ms (≤ 30 moving things) | move thing cells every other frame when > 30 |
| Built parts (≤ 40 per room) | included in the cell sim | — |
| Light-door eyes | read the CPU light grid once per 4 frames | — |
| "No sealing in" flood fill | 1 ms, only on a build confirm | skipped in Floodgate |
| Debris chunks | ≤ 40 active; merge into loose cells after 3 s at rest | turn debris straight into powder cells |
| Rekindle | one room restream (≈ a room load, covered by the 0.6 s shimmer) | — |

Plates count liquid by sampling their own footprint column (cheap). Nothing on this page reads a water velocity (R12).

---

## Applied in v2

- **R3** Built parts persist as a part list (id, position, rotation, remaining-cells mask); a part that burned away is
  gone; raw cells reset (§9.1).
- **R5** Wiring is 10's `wires: [{from, to, do, when}]`; gates are `logic` things of kinds `timer`, `latch`, `toggle`,
  `counter`, `sequence`, `compare`, `any_of`; 07's type names are canon; timed door 4 s (§6).
- **R6** Powders are solid (as built), with push-out; loose top layers slow ×0.7; step-up 2/3/4 (§2.1, §2.13).
- **R10, B8, B9** §9.5: `PINNED` + brass rim, the free Rekindle post, the pause-menu entry, the single-flame room-check,
  the brass beat in P1-1.
- **R12** Flow is authored `current` zones (06 §8.10); cell water has no velocity (§2.10, §2.14, §5.35).
- **R13** Gravity bands are entity-only; cells in a flipped band are held (06 §10.7); 8-cell rows (§2.15).
- **R18** No key tables here; 02 owns keys (§3.1, §9.1).
- **R19** Build mode: full speed, 4×4 grid, 45°, 07's part sizes; slow-time is an accessibility option (§9.1).
- **R27** P1-2 uses bolt **and lob** (lob granted there); the Spark lift (v1 P1-6) is P2-2b in Act 2.
- **R48** The player's hook is a wrap list; verlet only for level ropes and tethers (§3.4).
- **R49** Puzzle tests are verb solution scripts; replays only for determinism (§11).
- **R51, B5, B6, B13** Traps hit anything; the `trap` room tag (2–3 per act from Act 2); the crusher lesson at `a2_n03`;
  trap kills +50% XP as "The Hollow"; oil barrels pierce-and-refuel 20 oil or explode (§8, §5.22).
- **R52** 1 m = 8 cells; the Chimneysweep's 2,000 m = 16,000 cells.
- **R53** The player's fall rule is 07's, from `movement.json` (§2.5).
- **R54** 07 owns movement numbers; coyote 0.10 s, buffer 0.12 s (built).
- **R55** Melee moves, frame data, pogo height and the `subduable` tag are 04's; §4 keeps only tool uses.
- **R56** §2.16 class movement deleted (04 owns it).
- **R57** Everyone wall-jumps from the start; the Chimneysweep gets wall-run (04).
- **R60** Parts use built materials (`plank`, `rope`, `metal`, `glass`); the sandbag holds `sand` cells; a fuse is a
  `rope` run with an end probe; `tar`, `soot`, `cracked_brick` and friends are gone (the `cracked` flag instead).
- **R73** No mashing anywhere; the snare net is parked.
- **R80** Turret shots never trigger knots (§6.6, §9.3).
- **R84** Knockback control and wall stagger link to 04's hurt table (§2.14).
- **R87** Hubs are `sanctuary` zones: no building, spells change no cells (§5.35, §9.2).
- **Small** Interact range 12; ledge-grab automatic; slide/crawl from the start, never required in Act 1.
- **Ship lists** 18 interactables, 10 traps, 8 parts + 2 Tinker parts, 4 zones, 20 puzzles on the new node ids; P4-5
  uses `on_hit`, not `on_timer`; P6-5's overcharged-Spark charges cut.
- **v1 proposals, resolved:** slide for every class — yes (§2.8); class movement traits — 04's call (R56); 1 m = 16 cells
  — no, 8 (R52); hand-worked levers from Act 2 — yes (00 §6.2); signed weight in a flipped band — yes, for entities
  (§2.15), counterweights parked.

---

## Parked (v2)

Everything cut from v1 is kept here as it was written, grouped by subject. Each block starts with the finding that cut
it and says what replaced it.

### Movement

**Parked by R56:** Class movement traits (v1 §2.16). Replaced by: 04 owns every class's movement.

Only the movement-relevant parts; 04-CLASSES-PROGRESSION.md owns kits.

| Class | Movement change |
|---|---|
| Lamplighter | none (the baseline) |
| Sluicewarden | run 90 (heavier), swim speed +20%, knockback taken −30%, breath 16 s |
| Tinker | build time −30%, build range 80 instead of 64 (§9) |
| Ferrywitch | swim +10%; can **stand on the surface** of still water while holding her oar-staff down (walk 40) |
| Bellringer | a pole-ring (the hand-bell) rings bells from 40 cells instead of 16 |
| Drowned Knight | no breath limit (canon); **sinks** (buoyancy −60); walks on the bottom at 45; underwater jump 180 |
| Moth Oracle | **glide**: hold jump while falling → terminal 90 cells/s (fall damage never applies while gliding) |
| Chimneysweep | **double jump** (second jump vy 210, apex ≈ 25) (canon), **wall-run**: running into a wall at ≥ 90 runs up it for up to 60 cells at 90 cells/s, once per wall contact (canon); rope swing pump +30% |

**Parked by R4:** v1 §1 file list and the §2.18 JSON dump. Replaced by: 10 §5.0 (files) and the built `data/movement.json` (§2.18).

Everything numeric on this page lives in JSON (`data/movement.json`, `data/rope.json`, `data/interactables.json`,
`data/traps.json`, `data/build-parts.json`) so it can be tuned without touching code.

```json
{
  "_doc": "Player movement numbers. Units: cells, cells/s, cells/s², seconds. See 07-TRAVERSAL-PUZZLES.md §2.",
  "body": { "w": 6, "h": 12, "crouchH": 7, "hurtW": 4, "hurtH": 10, "stepUp": 2, "stepUpRun": 3, "stepUpAir": 4, "stepDown": 3, "cornerFix": 3 },
  "run": { "walk": 60, "run": 95, "accel": 750, "runAccel": 500, "decel": 1200, "turn": 1800, "airAccel": 450, "airDecel": 180 },
  "jump": { "v": 248, "gravity": 900, "fallGravity": 1170, "apexHangVy": 40, "apexHangScale": 0.5, "cut": 0.4, "minHoldFrames": 3,
            "terminal": 420, "fastFallGravity": 1440, "fastFallTerminal": 520, "coyote": 0.10, "buffer": 0.12 },
  "land": { "lagAbove": 100, "lag": 0.12, "safeFall": 160, "dmgPer20": 0.05, "dmgCap": 0.6, "tuckWindow": 0.1 },
  "wall": { "rowsNeeded": 8, "slide": 70, "slideWet": 90, "slideSoot": 50, "stick": 0.15, "jumpVx": 120, "jumpVy": 230, "lock": 0.14, "coyote": 0.08, "regrab": 0.2 },
  "ledge": { "handRows": 5, "handReach": 2, "minVy": -60, "freeAbove": 12, "freeWide": 6, "climb": 0.30, "hopVx": 90, "hopVy": 200, "shimmy": 20 },
  "crouch": { "crawl": 28, "slideV": 130, "slideEnd": 60, "slideTime": 0.35, "slideMinSpeed": 80, "slideCooldown": 0.5 },
  "dropThrough": { "ignore": 0.20, "hold": 0.3 },
  "swim": { "buoyancy": 120, "speed": 50, "strokeV": 90, "strokeTime": 0.25, "strokeCd": 0.4, "dive": 55, "drag": 4,
            "surfaceJump": 200, "strokeJump": 240, "breath": 12, "breathRefill": 4, "drown": 0.08, "flowShare": 0.6, "paddle": 28 },
  "climb": { "ladderUp": 45, "ladderDown": 60, "ladderFast": 140, "ropeUp": 40, "ropeDown": 55, "ropeFast": 120, "offVy": 180, "offVx": 60 },
  "carry": { "maxWeight": 1, "maxSize": 10, "walk": 48, "jumpScale": 0.8, "throwV": 180, "throwUp": 60, "push": [30, 18, 10] },
  "wind": { "airResponse": 6, "groundResponse": 2, "maxAccel": 240 },
  "knock": { "control": 0.3, "time": 0.2, "wallStagger": 200, "staggerTime": 0.3 }
}
```

**Parked by R12:** v1 §2.10 rows that read a flow velocity from the cell sim. Replaced by: `current` zones (§2.14, 06 §8.10).

| Number | Value |
|---|---|
| Currents | water cells carry a flow velocity from the sim; the player gets **60%** of the local flow added each frame (a 100 cells/s undertow at an open sluice drags you at 60) |

**Parked by R60:** v1 §2.13 surface rows for materials or parts that do not ship. Replaced by: the built `surfaces` rows.

| Surface (material) | Accel × | Decel × | Max speed × | Jump × | Notes |
|---|---|---|---|---|---|
| Tar | 0.4 | 2 | 0.4 | 0.6 | ropes that touch tar stick (§3.4) |
| Spring pad (built) | — | — | — | launches (§9) | |
| Conveyor (Act 5 clockworks) | adds its belt speed (±40) | | | | |


### Grapple and ropes

**Parked by R18:** v1 §3.1 control table. Replaced by: 02 owns keys.

| Action | Mouse + keyboard | Gamepad |
|---|---|---|
| Fire hook / release | right mouse (press to fire, press again to let go) | LT |
| Aim | mouse direction from the player's hands | right stick; with no stick input: 60° up-forward |
| Reel in / out | W / S while hooked | left stick up/down |
| Pump the swing | A / D while hooked | left stick left/right |
| Jump-release (keeps momentum + pop) | Space | A |
| Cut your own rope | the same as release | |

**Parked by R60:** v1 §3.3 attach rows for materials that are not in the built 36. Replaced by: the v2 §3.3 table.

| Material (06 ids) | Hook? | Hold | Notes |
|---|---|---|---|
| `metal` plate | **no** — bounces off | — | the hook can't bite smooth metal |
| `metal` beam / grate / **grapple ring** | yes | forever | rings are always valid; iron beams are drawn with rivets so they read |
| `soil`, `mud` | yes | **4 s** under load | |
| `sand`, `soot`, `ash`, `snow` | no | — | |
| `bone`, `flesh` of a corpse | yes | forever while the corpse stays | |
| `tar` | yes, and **sticks**: the hook can't be released for 1 s | forever | |

**Parked by R48:** v1 §3.4, the verlet chain as the player's hook (and the `rope.simple` fallback). Replaced by: the wrap list (§3.4); verlet stays for level ropes and tethers.

*(v1 heading: 3.4 The rope simulation)*

A rope is a **chain of points joined by fixed-length links**, moved with Verlet integration (each point
remembers its last position; its new position is `pos + (pos − prev) × damping + gravity × dt²`, then the
links are pulled back to their length a few times — the standard cheap cloth/rope method).

| Number | Value |
|---|---|
| Link length | **4** cells |
| Links in a full hook rope | 150 / 4 = **38** |
| Constraint passes per tick | **10** |
| Damping | 0.995 per tick |
| Gravity on rope points | 900 (flipped inside gravity bands) |
| Point mass | 0.05 (the player is a point of mass 1 at the end; a crate 1; a barrel 2) |
| Collision | each point is pushed out of solid cells: if it is inside a solid cell it moves back to the nearest free cell among its 8 neighbours, else to its previous position |
| Wrapping | the rope bends around corners because its points collide. For the **player's swing**, the pivot is the **last rope point (counting from the player) that is touching solid geometry**, or the anchor if none is. The swing radius is the rope length from that pivot to the player. When the rope unwinds (the pivot point leaves the geometry), the pivot moves back up the chain. |
| Taut rule | the rope is taut when the distance from the pivot to the player ≥ remaining length; then the player is constrained to the circle (a hard constraint, velocity projected onto the tangent) |
| Sticking | points touching `tar` stop moving for 1 s |
| Wet | a rope out in the rain for 10 s is **wet** (conducts Spark, §3.7); a dry rope is dry again after 20 s out of the rain (rare) |
| Draw | each link is drawn as a 1-cell line of rope colour `#8a6a44` (wet `#5d4a35`) on top of the cell layer, not written into the cell grid |

**Cheap fallback (flag `rope.simple`)**: the hook rope is a straight line from anchor to player with no
wrapping; if something solid is between them for 0.2 s the hook lets go. Level ropes keep the Verlet chain
(they are few).

**Parked by R60:** v1 §3.7 tar row.

| Cause | Effect on a rope |
|---|---|
| Tar | sticks (§3.4) |


### Pole

**Parked by R55:** v1 §4.1 melee moves and frame data. Replaced by: 04 owns melee (pogo 24 cells, `subduable`).

*(v1 heading: 4.1 Moves)*

| Move | Input | Startup | Active | Recovery | Reach (cells from the hands) | Arc | Base damage | Knock |
|---|---|---|---|---|---|---|---|---|
| Swing 1 | attack | 0.06 | 0.08 | 0.14 | 16 | 150° front | 6 | 60 |
| Swing 2 | attack within 0.25 s | 0.05 | 0.08 | 0.14 | 16 | 150° reverse | 6 | 60 |
| Swing 3 (slam) | attack within 0.25 s | 0.10 | 0.10 | 0.22 | 18 | overhead, 120° | 11 | 160 |
| Up swing | up + attack | 0.06 | 0.08 | 0.16 | 16 | 100° above | 7 | 80 up |
| Air swing | attack in the air | 0.05 | 0.08 | 0.12 | 15 | 150° front | 6 | 60 |
| **Pogo** | down + attack in the air | 0.04 | 0.12 | 0.10 | 14 below | 60° below | 7 | — |
| **Clout** (charged) | hold attack 0.5 s, release | 0.5 hold | 0.10 | 0.25 | 18 | 150° | 14 | 220 |
| Poke (carrying) | attack while carrying | 0.08 | 0.06 | 0.14 | 12 | straight | 3 | 40 |

- **Pogo**: hitting anything **pogoable** below you (an enemy, a spike top, a lantern post, a bell, a crate,
  a hazard tagged `pogo` in 05/§8) bounces you up at **220** cells/s (apex ≈ 27 cells) and resets the
  double jump / air swing. Spikes don't hurt you on a pogo hit.
- **Clout never kills a humanoid** that is marked `can_knock_out` (cultists, oilrunners, human bosses' guards):
  if it would kill, it knocks them out for the room instead. This is how Deacon Marl's deal is done
  (01-WORLD-STORY.md A5.4). Clout also breaks cracked-brick cells in its arc (16 HP of cell damage).
- **Swat**: a swing whose active frames overlap an enemy projectile tagged `swattable` reflects it (Knack
  adds a 0.03 s wider window per 10 points, 04).

**Parked by R69:** v1 §4.3 Silent Bell line. Replaced by: plain bells (§4.3).

| Use | Rule |
|---|---|
| Ring bells | a swing rings a bell (Silent Bells ring only from the pole, 01 §4) |


### Interactables

**Parked by R7 (REVIEW §c):** the 15 interactables that do not ship: rows from the v1 §5.2 table. Replaced by: the 18 in §5.2.

| # | id | Size (cells) | States | You use it by | Signal out | Takes signal in | Unlocked |
|---|---|---|---|---|---|---|---|
| 5.4 | `lever3` | 6×8 | `left`, `mid`, `right` | interact cycles L→M→R→M; pole hit pushes it away from you | three outputs: `out.left`, `out.mid`, `out.right` | yes | Act 3 |
| 5.8 | `weighted_plate` | 16×3 + dial | `up`, `down` | weight ≥ `needs` | 1 while down; `level` = weight / needs (0..1) | no | Act 2 |
| 5.13b | `light_sensor` | 4×4 eye | `dark`, `lit` | same test as the door, no door attached | 1 while lit; `level` = light | no | Act 4 |
| 5.14b | `dynamo` | 16×16 wheel | `level` 0..1 | turned by water flow through it (a water wheel), wind (fan) or a winch; level = flow ÷ `ratedFlow` | `level`, 1 while level ≥ 0.5 | no | Act 3 |
| 5.16 | `counterweight` | two platforms 20×4 on one chain over a pulley | `balance` −1..1 | put weight on a side | `level` = side A's height 0..1 | no (it is pure physics) | Act 5 (also Act 2 intro) |
| 5.17 | `winch` | 10×10 crank | `level` 0..1 (rope wound) | hold interact: winds at **30** cells/s of rope; `ratchet: true` keeps it, else it unwinds at 60 when released | `level` | no | Act 2 |
| 5.18 | `bell` | 16×16 to 48×48 | `still`, `ringing` (1.5 s) | pole hit, a heavy thrown object, a clout, a Bellringer toll, or a signal | a **1-tick pulse** on ringing; also a sound wave (below) | yes (rings) | Act 1 (Silent Bells), heavy use Act 5 |
| 5.23 | `fan` | 16×8 housing | `off`, `on` | signal or its own switch | 1 while on | yes | Act 2 |
| 5.24 | `steam_vent` | 8×4 grate | `idle`, `puffing` | periodic (`period`, `duration`) or signal, or **automatic when water above it is boiled** | 1 while puffing | yes | Act 1 (small), Act 3 |
| 5.26 | `brazier` | 12×12 | `cold`, `burning` | any fire, lantern touch | 1 while burning | no | Act 1 |
| 5.28 | `fuse` | a line of `fuse` cells | burning front | ignite one end | pulse when the burn reaches the `end` point | no | Act 1 |
| 5.29 | `release_hook` | 6×6 | `holding`, `released` | cut/burn its rope, a pole slam, a signal | pulse on release | yes | Act 2 |
| 5.30 | `float_switch` | 6×16 | `low`, `high` | water level: 1 when water reaches its mark | 1 while high; `level` | no | Act 3 |
| 5.31 | `pipe` | any path of `pipe` cells + ends | flow 0..1 | through a `valve`, or its `in` | flow | yes | Act 3 |
| 5.32 | `mirror` | 8×8 | angle (0°, 45°, 90°, 135°) | interact rotates 45° | — | yes (rotates on each pulse) | Act 4 |
| 5.33 | `pressure_bellows` | 12×8 | charge 0..1 | stomp (land on it) | pulse, and a puff of air (pushes light things 40 cells) | no | Act 5 |

**Parked by R7 (REVIEW §c):** their v1 behaviour notes.

**Lever / lever3.** Flip takes 0.15 s. A lever can be **locked** (`locked: true`, a padlock sprite) until a
signal unlocks it. Pole hits flip levers from the side the swing comes from (so a lever behind bars can be
flipped by poking through them).
**Dynamo / water wheel.** Level from water flow through its cells (06 gives flow in cells/s): `level =
min(1, flow / ratedFlow)`, `ratedFlow` default 60. Also turned by wind (fans) at `wind / 120`.

**Counterweight.** Two platforms on one chain over a wheel. Each side's weight is the weight on it. The
heavier side moves down at `20 × |difference|` cells/s (max 80). Equal weights: balanced, doesn't move.
Pouring water onto a side works (80 cells = 1 unit). Built part: pulley (§9) makes your own.

**Winch.** Winds a rope/chain attached to something (a lift, a gate, a hanging bridge, a cage). 30 cells/s of
rope. With `ratchet: false` it unwinds when released (so you have to hold it — or wedge it with a crate,
which counts as holding).

**Fan.** Pushes a column `16 wide × length` (default 80) with wind speed `w` (default 160 cells/s) along its
facing. Moves the player (§2.14), gas (steam, smoke), light powders, rain, flames (blows a fire along), light
objects (≤ 1 weight: 160 cells/s² push), and Lob spells (as wind). An **upward** fan lets you hover and rise
at ≈ 40 cells/s. Rime on a fan: frozen for 6 s. Bile corrodes it (off permanently after 3 s of Bile).

**Steam vent.** Puffing: a column 8 wide × 100 tall of steam, pushing up at **700** cells/s² (you rise at
≈ 120 cells/s), **3 damage/s** to anything inside unless it is `cooled` (Rime'd). Ember on water above a
closed vent turns the water to steam and forces a puff. Rime on an active vent: condenses to water for 5 s
(the vent is off). Tide: pushes water into the vent (it stops puffing until the water boils off).

**Lamp post / brazier / lamp socket.** Light sources. Lamp post: radius **50**, burns **90 s** on its own
oil (60 s in the rain unless it has a hood) then gutters (half radius for 10 s) and goes out; a `pipe` of oil
feeding it keeps it lit. Brazier: radius 70, burns until put out. Lamp socket: the Great Lamps' small
cousins; stays lit forever once lit.

**Fuse.** A line of `fuse` cells (drawn as a dotted cord). Burns at **30** cells/s; stops at water; Rime puts
it out; a gap of > 2 cells stops it. When the burn reaches the `end` it sends a pulse and ignites whatever is
there (usually a barrel).

**Release hook.** Holds something hanging (a cage, a bridge end, a counterweight, a boulder). Released by any
cut/burn of its rope, a slam, or a signal.

**Float switch.** A bob on a rod: output 1 when the water in its chamber reaches `mark` (a cell row). The
simplest "flood this room to X" check.

**Pipe.** Moves liquid from one chamber to another at `rate × valve level` cells/s (default 40). Pipes are
cells of `pipe` material; Bile can corrode a pipe (leak), Rime freezes the liquid in it (blocks 8 s).

**Mirror.** Rotates 45° per interact or pulse. Reflects **beam** spells, light rays from light sources set to
`ray: true` (a lamp with a hood that throws a beam), and the Gleam `bolt`. Used for Act 4–5 light puzzles.

**Pressure bellows.** Land on it from ≥ 20 cells up: output pulse + a puff (pushes light objects and gas 40
cells). Used to ring small bells and blow out candles in Act 5.

**Parked by R12:** v1 sluice-gate jet rule (flow from the sim).

**Sluice gate.** Moves at **20** cells/s. When `closing`, anything under it takes **40** damage and is shoved
out; it stops (and stays `closing`) if a big crate or stone block is under it — **you can jam a gate with a
crate** (the crate is crushed over 3 s: 33 HP/s to its cells). Water pressure: an open gate between chambers
with different levels makes a jet; the jet speed = min(300, 10 × √(level difference in cells)) cells/s
(06-PHYSICS-RENDER.md owns the fluid sim; this is the gameplay target).

**Parked by R7 (REVIEW §c):** their v1 rows in the spells-against-interactables matrix.

| Interactable | Ember | Rime | Spark | Bile | Gleam | Tide | Shade |
|---|---|---|---|---|---|---|---|
| dynamo | — | freezes water in it (stops) | spins it for 3 s (level 1) | — | — | **drives it**: a Tide wave through a water wheel = level 1 for 4 s | — |
| counterweight | burning a side's crate lightens it | freezing water on a side keeps its weight | — | dissolving a metal weight lightens it | — | **adds water** to a side | — |
| winch | burns its rope (drops the load) | freezes it (holds position like a ratchet) | — | dissolves the rope | — | — | — |
| fan | blows the fire along the column (a flamethrower) | frozen 6 s | powers an unpowered fan 5 s | corrodes (off) after 3 s | — | — | — |
| steam vent | forces a puff (boils water above) | condenses: off 5 s | — | — | — | floods it: off until boiled | — |
| fuse | lights | puts out | lights | — | — | puts out | — |
| release hook | burns its rope | — | — | dissolves its rope | — | — | — |
| pipe | boils the water in it (steam from both ends) | freezes it (blocks 8 s) | electrifies the liquid in it | corrodes a leak | — | pushes flow +50% for 4 s | — |
| mirror | — | — | — | — | reflects Gleam bolts | — | — |


### Wiring

**Parked by R5:** v1 §6.1–§6.4: gates as nodes in `wiring[]`, `in` fields on targets, `wires[]` drawing-only, `and`/`or`/`not`/`xor`. Replaced by: 10's `wires: [{from, to, do, when}]` and `logic` things (§6).

*(v1 heading: 6.1 Model)*

A room has one **signal network**: a set of nodes. Every node has an output value (`0` or `1`) and an
optional `level` (0..1). There are three kinds of node:

- **Sources** — interactables that produce a signal (lever, button, target, plate, weighted plate, valve,
  light sensor, light door, spark coil, dynamo, float switch, bell pulse, fuse end, lamp post, lift, release
  hook, pressure bellows, and the special `always`/`never` constants).
- **Gates** — pure logic nodes, invisible in the world by default (optionally drawn as a small brass box on
  the wall, `show: true`).
- **Targets** — interactables with an `in` field (doors, gates, lifts, lamps, fans, vents, portcullises,
  gravity lanterns, spark coils, release hooks, pipes, mirrors, bells, sluice gates).

A node can be both (a timed door is a target and a source).

*(v1 heading: 6.2 Gates)*

| type | Inputs | Output | Fields |
|---|---|---|---|
| `and` | 2+ | 1 if all inputs are 1 | — |
| `or` | 2+ | 1 if any input is 1 | — |
| `not` | 1 | 1 if the input is 0 | — |
| `xor` | 2+ | 1 if an odd number of inputs are 1 | — |
| `timer` | 1 | depends on `mode`: | `mode`, `sec` |
| · `delay` | | the input, delayed by `sec` | |
| · `pulse` | | on a 0→1 edge, 1 for `sec` then 0 | |
| · `hold` | | 1 while the input is 1, then stays 1 for `sec` after it drops | |
| · `blink` | | while the input is 1, toggles every `sec` | |
| `latch` | `set`, `reset` | becomes 1 on a `set` edge, 0 on a `reset` edge (set wins ties) | — |
| `toggle` | 1 | flips on each 0→1 edge | — |
| `counter` | 1 (+ `reset`) | 1 once it has seen `n` rising edges | `n` |
| `sequence` | 2+ in order | 1 when the inputs rise in the listed order within `window` seconds; a wrong order resets it | `window` |
| `compare` | 1 (reads `level`) | 1 if `level` is `op` `value` | `op` (`>=`, `<=`, `between`), `value` / `min`,`max` |
| `any_of` | 2+ | 1 if at least `k` inputs are 1 | `k` |

*(v1 heading: 6.3 Evaluation)*

1. Once per sim tick, **after** entity physics and **before** targets act.
2. Nodes are sorted into an order where every node comes after its inputs (a topological sort, done once
   when the room loads).
3. **Loops** are allowed only through a `timer`, `latch`, `toggle` or `counter`: those read their inputs'
   values **from the previous tick**, which breaks the loop. A room whose wiring has a loop with no such node
   **fails to load** with an error naming the loop (a data test catches it first, §11).
4. Targets act on the new values in the same tick.
5. Edge detection (0→1) compares with the previous tick's value.

Cost: a room has at most 64 nodes; evaluation is a few microseconds.

*(v1 heading: 6.4 JSON shape (inside a room file))*

```json
{
  "id": "a2_lockhouse_03",
  "entities": [
    { "id": "lv_red",   "type": "lever", "at": [112, 210] },
    { "id": "lv_blue",  "type": "lever", "at": [300, 210] },
    { "id": "plate_a",  "type": "weighted_plate", "at": [200, 244], "needs": 2 },
    { "id": "door_out", "type": "timed_door", "at": [440, 220], "sec": 5, "in": "g_open" },
    { "id": "fan_1",    "type": "fan", "at": [60, 120], "facing": "up", "in": "g_fan" }
  ],
  "wiring": [
    { "id": "g_both",  "type": "and", "in": ["lv_red", "lv_blue"] },
    { "id": "g_open",  "type": "or",  "in": ["g_both", "plate_a"] },
    { "id": "g_fan",   "type": "timer", "mode": "blink", "sec": 1.5, "in": ["always"] }
  ],
  "wires": [
    { "from": "lv_red",  "to": "door_out", "path": [[112, 210], [112, 180], [440, 180], [440, 220]] },
    { "from": "plate_a", "to": "door_out", "path": [[200, 244], [200, 190], [440, 190]] }
  ]
}
```

- `in` on a target or gate is either one node id or a list. A target with a list uses **OR**.
- `wiring[]` holds gates; `entities[]` holds sources and targets. Node ids share one namespace per room.
- `wires[]` is **drawing only**: the copper lines shown on walls (below). It never affects logic. If a wire is
  missing from `wires[]`, the connection still works — the room test warns (§11).
- Reading a node's `level` instead of its 0/1: write `"in": "valve_1.level"` on a target that takes a level
  (a sluice gate, a pipe, a fan's speed).
- `"always"` and `"never"` are built-in constants.


### Traps

**Parked by R7 (REVIEW §c), R73 (snare net):** the 12 traps that do not ship. Replaced by: the 10 in §8.2.

| # | id | Name | Acts | Trigger | Telegraph | Effect | Reset | Counters |
|---|---|---|---|---|---|---|---|---|
| 7 | `trap_steamjet` | steam jet | 3, 5 | cycle or when water boils | a whistle 0.5 s before | a 60-cell steam column, **10/s**, pushes 700 | cycle | Rime condenses it; also a lift if you are cooled |
| 8 | `trap_grate` | drop grate | 2 | standing on it 0.4 s | the grate rattles at 0.2 s | opens: you fall to a lower room (a detour, not damage) | 3 s | move fast; a crate on it holds it shut; hook out while falling |
| 9 | `trap_rotplank` | rotten plank | 1, 2, 4 | standing on it 0.6 s | creaks and sags 2 cells | breaks into falling wood cells | no | move fast, brace it with a built brace (§9) |
| 11 | `trap_net` | snare net | 2, 4 | tripwire | a thin rope across the path, lit by your lantern at < 30 cells | pins you **1.5 s** (mash to cut 0.5 s faster) and rings a bell (alarm: nearby enemies come) | no | cut the tripwire with the pole, burn it, jump it (it is 2 cells high) |
| 12 | `trap_tripbell` | tripwire alarm | 2, 5 | tripwire | as above | rings a bell: enemies within 300 cells come to the bell; Act 5 cultists get +20% damage for 10 s | no | same as net; Rime-muffle the bell first |
| 14 | `trap_barrelchute` | barrel chute | 4 | plate at the top | rumbling 1 s, the chute's lamp flashes | 3 rolling oil barrels at 120 cells/s, 1 s apart, **20** each on contact; they explode if they touch fire | 10 s | jump them, light the fuse early so they explode in the chute, freeze them (they stop) |
| 15 | `trap_floodroom` | flood trap | 3 | entering: doors shut behind you | doors slam (sound + light change), pipes gush | water fills the room at **12 rows per second** from 4 pipes; the exit opens when a float switch reaches the top (you swim out) **or** when you close the pipes' valves | on leaving | close valves, freeze pipes, open a drain (Bile the floor grate) |
| 18 | `trap_gravflip` | gravity snare | 5 | plate | the band's rim lights up 0.5 s before | a gravity band flips on for 3 s (you fall up) | 5 s | read the rim, stand under a ceiling, carry your own gravity lantern to cancel it (overlap = normal) |
| 19 | `trap_cloudfloor` | soaked cloud | 6 | standing 2 s on saturated cloudstuff | it darkens and drips | it turns to falling water | regrows 20 s | Rime freezes it solid, Ember steams it (it rises as a cloud platform for 4 s) |
| 20 | `trap_lure` | false light | 4 | always | a warm lantern glow in the dark... with no lantern | it is an Unlit's lure: walking into the glow triggers an ambush by 2–3 Unlit | no | Lune's trick (lantern out: lures don't fire), Gleam burns the lure |
| 21 | `trap_jaw` | jaw trap | 2, 4 | stepping on it | 4-cell steel jaws, a glint | **14** + rooted 1.2 s | re-arms 5 s | pogo, a thrown crate springs it, Bile |
| 22 | `trap_gust` | gust funnel | 1, 6 | cycle | the rain streaks bend first 0.6 s | wind 180 cells/s sideways for 1.5 s | cycle | crouch (wind response ×0.5 crouched), anchor with the hook |


### Building

**Parked by R18, R19, R3:** v1 §9.1 rows for keys, part picking and persistence. Replaced by: v2 §9.1.

| Rule | Value |
|---|---|
| Enter / leave | toggle key (default **B** / gamepad d-pad down; 02-CONTROLS-UI.md) |
| Picking a part | a strip of unlocked parts along the bottom of the screen; mouse wheel / bumpers cycle; number keys 1–9 pick directly |
| Rotate | **R** / gamepad Y: planks and ladders cycle horizontal → 45° → vertical → −45°; others as listed |
| Confirm | attack button; you can keep moving while it builds |
| Persistence | campaign rooms save their parts (position, rotation, remaining cells); a burned plank stays burned |

**Parked by R60:** v1 §9.3 material list. Replaced by: built materials (`plank`, `rope`, `metal`, `glass`, `sand`).

Cell materials (06-PHYSICS-RENDER.md): `plank_wood` (burns, 6 HP/cell, floats), `brace_wood` (as plank),
`rope`, `brick` (16 HP, doesn't burn, Bile dissolves), `metal` (20 HP, conducts Spark), `cloth_sand` (sandbag:
cloth that holds sand cells; burns → spills sand), `glass` (lamp).

**Parked by R7 (REVIEW §c):** the 10 parts that do not ship (long plank, pulley, spring, rope bridge, ward, stone block, hook anchor, sparkmine, turrets Mk II/III) and their behaviour rows. Replaced by: the 8 + 2 in §9.3.

| id | Name | Size (cells) | Material | Scrap | Build time | Strength (weight units it holds) | Attach rule | Unlock |
|---|---|---|---|---|---|---|---|---|
| `bp_long_plank` | Long plank | 40 × 2 | plank_wood | 3 | 0.6 s | 6 | **both ends** on solid | Act 2 |
| `bp_pulley` | Pulley | 8 × 8 wheel | metal | 6 | 0.8 s | 6 | mounted on a ceiling or wall; you then **hook** two things (grapple from the pulley: the first hook sets end A, the second end B) to make a counterweight pair (§5.16 rules) | Act 2 |
| `bp_spring` | Spring pad | 10 × 4 | metal | 8 | 0.8 s | — | on a solid floor (or a ceiling inside a gravity band) | Act 3 |
| `bp_bridge` | Rope bridge | up to 48 × 4 | plank_wood + rope | 10 | 1.5 s | 6 (sags 1 cell per unit) | **both ends** on solid, ≤ 48 cells apart; walkable, grapple-able; rope rails burn (§3.7) | Act 3 |
| `bp_ward` | Ward | 8 × 8 glyph | brick | 10 | 1.0 s | — | any solid surface | Act 4 |
| `bp_stone` | Stone block | 8 × 8 | brick | 6 | 1.0 s | 8; weight 3 | on solid (falls as rubble if the support goes) | Act 5 |
| `bp_anchor` | Hook anchor | 4 × 4 ring | metal | 2 | 0.3 s | — | any solid surface **including metal plates and ice** (it makes an unhookable surface hookable) | Act 5 |
| `bp_turret_2` | Turret Mk II | 10 × 12 | metal | 30 + 30 oil | 1.5 s | HP 70 | as Mk I | Tinker, Act 3 (Clink blueprint) |
| `bp_mine` | Sparkmine | 6 × 3 | metal | 8 | 0.5 s | — | on a floor | Tinker, Act 4 |
| `bp_turret_3` | Turret Mk III | 12 × 14 | metal | 40 + 30 oil | 2 s | HP 100 | as Mk I | Tinker, Act 5 (Clink + escapement plans, 01 §6 #11) |

| Part | Behaviour |
|---|---|
| Spring pad | touching its top launches you at **360** cells/s up (apex ≈ 72 cells) along its facing; launches crates and enemies too; can be placed on a wall (sideways launch 300) |
| Ward | while lit (lantern touch, Gleam or Ember), makes a **40-cell** circle where the Unlit take 10/s and won't enter, for **20 s**; then it is spent (grey) — re-light costs 3 oil |
| Hook anchor | a grapple ring you place: the hook always bites it |
| Turret Mk II | 70% power, one shot per 1.1 s, 70 HP |
| Turret Mk III | 90% power, one shot per 0.9 s, and its shots gain the `split` charm for free (03-SPELLS.md) |
| Sparkmine | an enemy stepping on it: a Spark burst **30** damage in 20 cells, chains through water |


### Puzzles

**Parked by R7, R27 (Act 1):** P1-3 (the Drip Gallery keeps the plank lesson only), P1-5 (the Gullet Chimney is merged into the Drip Gallery; wall-jump is taught in P1-1), and v1 P1-6 (now P2-2b).

**P1-3 · The Wax Plug** (`a1_drip_gallery`) — teaches `ember`, `rime`, material thinking
- Setup: a 16-wide doorway is plugged with solid wax 24 cells deep. Below the plug is the floor you stand on.
  Melting it floods the floor with molten wax (6 dmg/s, slow).
- ★ Melt it from **above**: climb the wax drips to a ledge over the plug and fire Ember down — the molten wax
  pours down past you.
- Alt: melt it from below and **Rime** the pool as it spreads (hardens it into a ramp you can walk up).
- Alt: build a plank 8 cells above the floor first (after P1-4), stand on it and melt.

**P1-5 · The Gullet** (`a1_gull_chimney`) — **Lesson** · teaches `wall`
- Setup: a 300-cell tall chimney, 20 cells wide, soot walls (slide 50). A gust (`trap_gust`, every 3 s) blows
  up the chimney. Pim Rooke is stuck at the top. Silent Bell 01 on a side ledge at 220.
- ★ Wall-jump up between the walls; jump with the updraft (the gust adds 180 up for 1.5 s: time jumps into it).
- Alt: build planks as rungs inside the chimney (costs ~12 scrap).
- The bell: a side ledge reachable only by a wall-jump off the soot during a gust.

**P1-6 · Spark Lift** (`a1_stair`, a lift room) — teaches `spark`, `lever` (preview of wiring)
- Setup: a spark-lift (a `lift` wired to a `spark_coil`) to a 400-cell-high landing. A full coil (5 charges)
  powers 15 s; the ride takes 8 s at 50 cells/s. The coil is dead.
- ★ Spark bolts into the coil (5 hits), ride up.
- Alt: lantern touch with a Spark wick 5 times (0.5 s apart).
- Alt: ignore the lift: the shaft wall is wood — wall-jump, with planks where it is too wide (slow, but valid).
- Alt: wet rope trick — a hanging rope runs from the coil to the landing; hit the wet rope with Spark from below.

**Parked by R7, R69 (Act 2):** P2-3 (the Long Chain is a fight node; its rope run is 09's set piece), v1 P2-4 (Silent Bell; the rat pipe lives on as P2-4 The Rat Sump), v1 P2-5 (bounce; replaced by `split` in P2-5 Three Eyes), P2-6 (Silent Bell, parked node), P2-7 (counterweight, parked node).

**P2-3 · The Long Chain** (`a2_widows_span`) — teaches `rope`, `burn_rope`, `rime`
- Setup: 1,400 cells of hanging level ropes over a drop. A flame jet at the start ignites the first rope
  when you grab it (a plate), and the fire runs along the chain of ropes at 24 cells/s — the ropes snap behind you.
- ★ Outrun it: swing chain with hook-jumps (your chain speed ≈ 200+ cells/s beats 24; the challenge is not missing).
- Alt: Rime the first rope where the fire enters (frozen ropes don't burn) — the fire stops; take it slowly.
- Alt: cut the first rope before grabbing it (pole), then the fire has nowhere to go; use the hook on the next.

**P2-4 · Rat Pipe Bell** (`a2_sewers`, Silent Bell 05) — teaches `plate`, `timer`, swarm-as-liquid
- Setup: Silent Bell 05 is at the bottom of a pipe full of rats (a `trap_ratpipe` that never empties). A grate
  (`portcullis`, plate-driven) at the pipe's mouth; a side channel leads to a flooded sump.
- ★ Hold the plate down with a crate: the grate lifts, the rats pour out into the side channel and wash into
  the sump; kick the crate off to drop the grate while the pipe is empty; climb down.
- Alt: Ember ring at the mouth (rats flee fire) while you dive in, then hold them off (hard).
- Alt: Bile the pipe's lower wall so the rats drain elsewhere.

**P2-5 · Around the Pillar** (`a2_charm_shrine`) — **Lesson** (Charm slot 1, canon) · teaches `charm`
- Setup: a `target` behind two brick pillars; line of sight is blocked. The target opens the shrine door.
- ★ Bolt with `bounce` off the ceiling.
- Alt: `pierce` through the thin wooden screen on one side.
- Alt: Lob over the pillar (no charm needed — a player who spots it is rewarded).
- Alt: grapple the small crate next to it and throw it at the target (thrown objects count).

**P2-6 · The Beam in the Rafters** (`a2_choir_loft`, Silent Bell 06) — teaches `burn_rope`, `rope`
- Setup: a heavy wooden beam hangs from a `release_hook` on a rope 120 cells above. Silent Bell 06 sits in
  the rafters above the beam. No ledge reaches.
- ★ Burn the rope: the beam falls and wedges diagonally between the walls; climb it to the rafters.
- Alt: hook the beam (class L: you zip to it), then climb its rope.
- Alt (Chimneysweep): wall-run + double jump reaches the rafters directly.

**P2-7 · Gallows Awning** (`a2_gallows_awning`) — teaches `counterweight`, `weight`, `hook`
- Setup: two hanging market stalls on one chain over a wheel (a counterweight). Stall A is at the floor, B is
  up by the exit. To lift A you need B to be heavier. Two small crates lie around; B is out of reach.
- ★ You want stall A (with you on it) to go **up**, so stall B must be heavier than A + you. Hook each small
  crate and throw it onto B from A's roof (a throw is 180 cells/s + 60 up; B's deck is in range): 2 crates
  (2 units) > you (1), so B sinks and A rises to the exit.
- Alt: ride B down instead — stand on A's roof, grapple B and **pull** it down (tug: you are anchored), A rises.
- Alt: build a pulley over the gap and make your own lift (Act 2 blueprint).

**Parked by R7, R12 (Act 3):** P3-3 (dynamo), P3-4 (parked node, Silent Bell), P3-7 (weighted plate). v1's P3-5 steam-vent alt (vent parked).

**P3-3 · The Dead Wheel** (`a3_tide_font`) — teaches `tide`, `dynamo`
- Setup: a lift driven by a water-wheel `dynamo`. The channel feeding the wheel is dry (its upstream valve is
  rusted solid). The Tide flame is on a plinth on the far side of the lift's top.
- ★ Take the long way round to the Tide flame, come back, send a **Tide wave** through the wheel (level 1 for
  4 s) ×3 to ride the lift in stages (the lift holds at stops).
- Alt: Bile the rusted valve (it corrodes open, permanently).
- Alt: fill the channel by opening a nearby cistern pipe and pouring it in (slower, 20 s).

**P3-4 · The Broken Arch** (`a3_broken_arch`, Silent Bell 08) — teaches `rime`, `steam`, `multi`
- Setup: a snapped aqueduct pours a waterfall 240 cells tall into a pool. The upper channel is the way on.
  Silent Bell 08 is behind the fall halfway up.
- ★ Rime the waterfall: it becomes a 10-wide frozen ladder for 20 s. Climb. The bell is in the dry hollow behind it.
- Alt: Ember the pool at the bottom: the steam column (a vent without a grate) lifts you ~120 cells; then wall-jump the arch stones.
- Alt: grapple the **rough ice** of a partly frozen fall (4 s hold per bite) in a chain.

- Alt: skip the water: steam-ride from the vent in the corner (boil the puddle on it).

**P3-7 · Weighing the Flood** (`a3_gauge_tower`) — teaches `weight`, `water`, `plate`
- Setup: a `weighted_plate` needing **3** units opens the tower door. One small crate (1) is available; a pipe
  with a valve spills water into a basin that sits on the plate.
- ★ Put the crate on (1), then open the valve until 160 water cells (2 units) sit in the basin — the dial
  reaches 3/3. Close the valve before the basin overflows (overflow drains weight).
- Alt: freeze the water in the basin (ice keeps its weight and doesn't overflow).
- Alt: stand on it yourself (1) + crate (1) + 80 water cells (1). The plate feeds a `timer hold 3`, so the
  door stays open 3 s after you step off — a fast player can make the door.

**Parked by R7, R60, R69 (Act 4):** v1 P4-1 (Lampless Lane is a fight node now; the lesson moved to `a4_n01`), P4-2 (Lune, parked node), P4-3 (mirror), P4-4 (`tar`), v1 P4-5 (`on_timer` knot, parked; P4-5 now uses `on_hit`), P4-6 (Silent Bell).

**P4-1 · Lampless Lane** (`a4_no_light_lane`) — **Lesson** (darkness & oil, canon) · teaches `dark`, `oil`, `light_door`
- Setup: a 900-cell dark gauntlet with 5 dead lamp posts. The exit is a `light_door` that needs light 0.6 for
  0.3 s. Your lantern now burns oil (03-SPELLS.md); the Unlit come for anything standing in light < 0.1.
- ★ Light the lamp posts as you go (lantern touch — free) so each lights the next stretch; stand at the door.
- Alt: send Hush to perch by the door (Act 4 Hush, 01 §7).
- Alt: throw Gleam bolts ahead as moving lights and sprint.

**P4-2 · The Door That Hates Light** (`a4_moth_nave` approach) — teaches `shade`, `dark`
- Setup: an **inverted** light door (`invert: true`) — it opens only in darkness (< 0.1). Your lantern is
  always lit.
- ★ Crouch (the lantern drops 5 cells) behind the pillar so the eye is in your shadow — Lune's trick (01 A4.3).
- Alt: Shade bolt on the eye (forces dark 5 s).
- Alt: let your oil run out on purpose (the lantern goes out) — the Moth Oracle unlock hint.

**P4-3 · The Mirror Gallery** (`a4_hanging_houses`) — teaches `mirror`, `light_door`
- Setup: a hooded lamp throws a ray (`ray: true`). Three `mirror`s (rotatable 45°) on hanging houses; a
  `light_sensor` opens a gate across the black water. One mirror hangs out of reach.
- ★ Rotate the two reachable mirrors; hook the third's hanging house to swing it (the house rotates the mirror
  as it swings) and time the gate.
- Alt: skip the ray: fire a **Gleam beam** into the mirror chain (mirrors reflect beams).
- Alt: build a lantern post (Act 4 part, §9.3) next to the sensor: light 0.6 at 20 cells is enough.

**P4-4 · The Tar Pits** (`a4_tar_pits`) — teaches `oil`, `ember`, `explode`
- Setup: a basin of tar (slow 0.4) with an oil slick on top; snare nets and jaw traps are buried in the tar;
  the far wall has a rotten-wood door.
- ★ Ignite the slick from the edge: the fire sweeps the basin (30 cells/s), burning away the nets and the
  door; wait for it to die (8 s), cross the hardened tar (burned tar = rock).
- Alt: Rime the slick (thick oil, no spread) and grapple across the ceiling beams.
- Alt: roll one of the room's oil barrels into the door and shoot it.

**P4-5 · Bubbling Field** (`a4_gas_field`) — teaches `knot`, `explode`
- Setup: gas pockets (explode 60 dmg, 24 radius) under a floating walkway; a brick wall at the far end must
  come down; the only way to set off the pocket by the wall is from 200 cells away (closer and you are in the blast).
- ★ **Knot** `on_timer`: lob an Ember lob that sits on the walkway and fires a second Ember after 2 s
  (03-SPELLS.md) — run.
- Alt: light a `fuse` running along the walkway (it exists, but one link is soaked: Ember it dry first).
- Alt: a chain: set off the nearest pocket; its blast sets off the next (pockets 20 cells apart chain).

**P4-6 · The Drifting Bell** (`a4_slick`, Silent Bell 11) — teaches `oil`, `water`
- Setup: Silent Bell 11 sits on an oil-soaked raft drifting in circles on a slick; it never comes near a ledge.
- ★ Burn the oil around the raft: the raft (oil-soaked wood) burns and sinks; the bell drops onto a submerged
  ledge 20 cells down. Dive for it.
- Alt: hook the raft (class M: tug it in), stand on it, ring the bell.

**Parked by R7, R13, R69 (Act 5):** the Silent Bell hint in P5-1; v1 P5-3's Bellringer and bellows alts; P5-4 (counterweight), P5-5 (Clink and Osk, parked node), P5-6 (rubble falling up — cells are held in bands now, R13).

- Hush chirrs a rising note when you touch the next correct valve if you've found all 12 Silent Bells.

**P5-3 · The Whisper Gallery** (`a5_whisper_gallery`) — teaches `bell`, `timer`, `multi`
- Setup: two bell-doors in series (each opens 5 s after a bell rings within 200 cells). The bell is 300 cells
  from the second door, so ringing it and running can't make both.
- ★ Ring the bell, pass door 1, then ring the second small bell on the far side with a thrown crate from
  behind door 1 (the crate path is exactly lined up).
- Alt: Spark bolt at the metal bell from beside door 2 (a Spark rings a metal bell, §7).
- Alt: Bellringer's hand-bell rings from 40 cells.
- Alt: stomp the `pressure_bellows` near door 2 — its puff tips a hanging bell.

**P5-4 · Counterweight Row** (`a5_counterweight`) — teaches `counterweight`, `gravity`
- Setup: a counterweight lift; your side needs to go **up** 300 cells; the other side has 2 units on it; you
  have one small crate (1). You + crate = 2 → balanced, nothing moves.
- ★ Put a gravity lantern on the **other** side's platform: its contents now weigh **upward** (−2) — your side
  (2) outweighs by 4 and rises at 80 cells/s. (The band rule makes weight signed.)
- Alt: swap sides. Hook the other side's two weights (they are small crates) across onto **your** platform,
  then step over to the now-empty side yourself: 2 + 1 crate (3) on the old side vs you (1) on the empty one,
  and the empty side — with you on it — rises.
- Alt: skip it: spring pads up the shaft (8 scrap each, 5 needed).

**P5-5 · The Great Escapement** (`a5_escapement`) — teaches `clock`, `rime`, `build`
- Setup: a giant clock: a pendulum blade (`trap_pendulum`, 2.4 s) drives gear teeth that open a 16-cell gap
  for 0.6 s per tick; you need to pass three gaps in a row. Clink's escapement plans lie behind it.
- ★ Time it: pass one gap per tick, standing on the gear rims between.
- Alt: Rime the escapement wheel: the whole clock stops for 8 s with gaps half open — walk through.
- Alt: jam a gear with a **stone block** (8 strength) — the clock grinds to a stop permanently (and the
  pendulum stops too; Osk grumbles that you broke it).

**P5-6 · Falling Up** (`a5_galleries`, the lowest ring) — teaches `gravity`, `multi`
- Setup: a floorless drop of 2,000 cells (01 §3.5 hazard); the way on is a ledge on the **ceiling** of the
  gallery across the drop. Rubble piles on your side.
- ★ Place a gravity lantern at the drop's edge pointing across: in the band everything falls sideways-up —
  jump in, fall "up" onto the ceiling ledge.
- Alt: place the lantern under the rubble: the rubble falls up and wedges as a bridge in the band's top; walk
  it after switching the lantern off (the bridge is now held by the walls — collapses in 10 s).
- Alt: grapple chain along the ceiling's iron beams.

**Parked by R1, R7, R40 (Act 6); Corvin cannot die (REVIEW small items):** v1 P6-1 (used `trap_gust`), P6-2 and P6-3 (parked nodes), v1 P6-4 (Corvin drowning), P6-5's overcharged-Spark alt, P6-6 (the Falling Flood is now a fall, not a climb).

**P6-1 · The First Coil** (`a6_first_coil`) — **Lesson** (wind) · teaches `wind`, `cloud`
- Setup: a 600-cell stretch of root against a **30 cells/s** crosswind with gusts to 180; cloudstuff floor
  that gives way after 2 s when soaked.
- ★ Move from gust to gust: crouch through gusts (×0.5 wind), hook anchors (hook-bite, 2 s on cloudstuff) between.
- Alt: Rime the cloudstuff floor as you go (frozen = solid and hookable forever).
- Alt: jump **with** a gust to cross the big gap (a tailwind adds ~40 cells of reach).

**P6-2 · The Steam Stair** (`a6_rootway`) — teaches `ember`, `cloud`, `steam`
- Setup: a 400-cell sheer climb of soaked cloudstuff: too soft to wall-jump (it gives way).
- ★ Ember the cloudstuff below you: it becomes rising steam puffs that carry you up and set into **cloud
  platforms** for 4 s; chain them up.
- Alt: freeze a column with Rime and wall-jump the frozen strip.
- Alt: spring pads on frozen patches.

**P6-3 · The Floating Lake** (`a6_floating_lake`) — teaches `water`, `cloud`, `multi`
- Setup: a lake held in a cloud bowl 200 cells up. Below it, a dry chamber with a float lift (a `float` on a
  water column) that could carry you to the exit — if there were water.
- ★ Ember the bowl's underside: the lake pours down into the chamber (the "Falling Flood" in miniature) and
  the float rises.
- Alt: Bile the bowl (dissolves cloudstuff slowly — a controlled pour).
- Alt: Tide makes the water you need (Tide creates water, canon) — about 40 casts; slow but valid for a player
  who has ignored the lake.

**P6-4 · Corvin's Hollow** (`a6_corvins_cell`) — story puzzle (01-WORLD-STORY.md A6.4) · teaches `overcharge`, `multi`
- Setup: Corvin is held in a pocket of root; a floating lake sits directly above him inside the root. Burning
  the root around him (the only way to free him) also releases the lake onto him (he drowns in 6 s — the
  `corvin_freed` flag is lost if he dies).
- ★ Rime the lake's floor first (it holds for 8 s), then burn the root around Corvin, then walk him out.
- Alt: cut a channel with Bile that drains the lake sideways into a lower chamber before burning.
- Alt: an **overcharged Ember** (Act 6 mastery, canon) burns the root in one 2-second cast, faster than the
  lake can fall on him; he is out before it lands.
- Alt: Tide pushes the falling water off him while you burn (hard: keep him out of the water for 6 s).

**P6-5 · The Lightning Rods** (`a6_last_wall`) — teaches `spark`, `rope`, `wind`
- Setup: a spark gate in the rim wall needs 5 charges; lightning strikes every 12–25 s on the highest metal.
  Three metal rods on the wall, and a wet rope.
- ★ Hook the wet rope from a rod to the gate's coil: the next strike runs down it (+5 charges); don't be on it.
- Alt: charge the coil with Spark bolts (5 hits) in the wind — lobs drift, bolts don't.
- Alt: an overcharged Spark gives +3 per hit (03-SPELLS.md overcharge rules).

**P6-6 · Under the Falling Flood** (`a6_flood_2`) — teaches `build`, `plank`, `timer`
- Setup: during the Falling Flood (01 §9.6), water pours down a 1,200-cell shaft in surges (4 s on, 3 s off);
  a surge knocks you down 60 cells if it hits you.
- ★ Climb in the gaps between surges, using the root's niches as shelter.
- Alt: build **planks at 45°** above you as umbrellas: they split the flow sideways (and hold until they
  are knocked down: 2 surges).
- Alt: freeze a surge mid-fall with Rime (it becomes an ice column you can climb — 20 s).

**Parked by R49:** v1 replay-based puzzle block and test table. Replaced by: solution scripts (§11).

```json
"puzzle": {
  "id": "P3-6",
  "teaches": ["spark", "water"],
  "lesson": false,
  "requires": { "flames": ["rime"], "or": [["shade"], ["tide"], ["build:bp_float"]] },
  "solutions": [
    { "id": "ice_path", "star": true, "replay": "tests/replays/P3-6-ice_path.json" },
    { "id": "shade_coil", "replay": "tests/replays/P3-6-shade_coil.json" },
    { "id": "floats", "replay": "tests/replays/P3-6-floats.json" }
  ],
  "hints": [
    { "after": 60, "who": "npc_hush", "intent": "hush_chirr", "tag": "cold" },
    { "after": 120, "who": "narrator", "text": "Ice has never carried a spark." }
  ]
}
```

- `requires` lists what the player must have unlocked; the act-map generator (09) never places a puzzle
  before its requirements are met.
- `hints`: after N seconds in the room without solving it, a hint line plays (Hush or the Narrator). Players
  can turn hints off (02-CONTROLS-UI.md).
- A **replay** is a recorded input log (frame, buttons, aim) from room entry; `tools/record-replay` in the dev
  build writes it (10-TECH-DATA.md).

| Test | Kind | What it checks |
|---|---|---|
| `tests/wiring.test.js` | node | every room's network: every `in` resolves; no loop without a timer/latch/toggle/counter; every target has at least one source; every gate has the right input count; `wires[]` draws every connection (warning) |
| `tests/movement.test.js` | node | the movement code against `movement.json`: a full jump apex is 34 ± 1 cells; running reach 49 ± 2; coyote and buffer windows are the configured frame counts; a 160-cell fall does no damage and a 240-cell fall does 20% |
| `tests/rope.test.js` | node | a hanging rope of 38 links settles within 2 s and stays within 1% of its length; a burning rope snaps in the configured time; a frozen horizontal rope holds the player |
| `tests/build.test.js` | node | every part's attach rule (valid/invalid placements from a fixture grid); strength overload → collapse after 0.5 + 0.3 s; "no sealing yourself in" refuses the fixture that would |
| `tests/puzzles.spec.js` | Playwright | load each puzzle room, play each replay at 8× sim speed headless, assert the room's exit condition within the replay's length; **every puzzle with ≥ 2 solutions has ≥ 2 passing replays** |
| `tests/traps.test.js` | node | each trap's damage/timing from `traps.json` reaches the entity code (move a number to an odd value and read it back from the module — the playground "dead data" lesson) |


### Performance

**Parked by R48, R12:** v1 §12 rope fallback and flow-sim note.

| System | Budget per frame | Fallback flag |
|---|---|---|
| Player movement + collision | 0.1 ms | — |
| Ropes (12 × 38 links × 10 passes) | 0.3 ms | `rope.simple`: straight-line hook, fewer passes (6) |

Expensive items flagged: the full rope wrap (fallback above); water-driven dynamos and weighted plates need
the fluid sim to report cell counts per region — 06-PHYSICS-RENDER.md provides a per-chamber count; if it
can't, plates count water by sampling their own footprint column (cheap and nearly the same).
