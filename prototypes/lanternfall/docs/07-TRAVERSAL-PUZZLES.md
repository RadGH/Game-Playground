# LANTERNFALL — page 07: Traversal, Interactables, Traps, Building and Puzzles

> One line: **how the Lamplighter moves (every number), how the grapple and ropes work, the pole-lantern as a tool, every interactable and how they are wired together, the traps, the building kit, and a catalogue of 39 puzzles by act.**

Canon is `00-OVERVIEW.md`. Scale reference (brief): 1 cell = 1 art pixel; view 480×270 cells; player 6×12
cells, walk 60 cells/s, run 95, jump apex ≈34 cells, gravity 900 cells/s², 60 fps fixed timestep.
Key bindings named here are **defaults**; `02-CONTROLS-UI.md` is the authority on keys. Spell numbers (damage,
oil) are in `03-SPELLS.md`; materials and the cell simulation in `06-PHYSICS-RENDER.md`; enemy ropes/cutters
in `05-BESTIARY-BOSSES.md`; room layout rules in `09-MODES-MAP.md`; schemas in `10-TECH-DATA.md`.

## Table of contents

1. [Units and conventions](#1-units-and-conventions)
2. [Player movement](#2-player-movement)
   - 2.1 Body and collision · 2.2 Walk and run · 2.3 Jump · 2.4 Coyote time and jump buffer · 2.5 Falling and landing
   - 2.6 Wall-slide and wall-jump · 2.7 Ledge-grab · 2.8 Crouch, crawl, slide · 2.9 Drop-through · 2.10 Swim and dive
   - 2.11 Ladders and climbing · 2.12 Carry, push, pull · 2.13 Surfaces · 2.14 Wind, currents, knockback · 2.15 Gravity bands
   - 2.16 Class movement traits · 2.17 The state machine · 2.18 `data/movement.json`
3. [The grapple hook and ropes](#3-the-grapple-hook-and-ropes)
4. [The pole-lantern](#4-the-pole-lantern)
5. [Interactables catalogue](#5-interactables-catalogue)
6. [Wiring: the signal network](#6-wiring-the-signal-network)
7. [Spells against interactables](#7-spells-against-interactables)
8. [Traps](#8-traps)
9. [Building](#9-building)
10. [Puzzle catalogue](#10-puzzle-catalogue)
11. [Authoring and testing puzzles](#11-authoring-and-testing-puzzles)
12. [Performance budget and cheap fallbacks](#12-performance-budget-and-cheap-fallbacks)
13. [Proposed canon changes](#13-proposed-canon-changes)

---

## 1. Units and conventions

| Thing | Unit |
|---|---|
| Distance | cells (1 cell = 1 art pixel) |
| Speed | cells/s (positive x = right, positive y = **down**, like the screen) |
| Acceleration | cells/s² |
| Time | seconds; the sim runs at 60 ticks/s, so 1 frame = 0.0167 s. Frame counts are given where they matter for feel. |
| Weight | **units**: the player = 1, a crate = 1 (see §5.3 for the full weight table) |
| Signal | 0 or 1, plus an optional analog `level` 0..1 (§6) |

Everything numeric on this page lives in JSON (`data/movement.json`, `data/rope.json`, `data/interactables.json`,
`data/traps.json`, `data/build-parts.json`) so it can be tuned without touching code.

---

## 2. Player movement

### 2.1 Body and collision

| Property | Value |
|---|---|
| Collision box (standing) | 6 wide × 12 tall |
| Collision box (crouched / crawling / sliding) | 6 × 7 |
| Hurtbox (what enemies hit) | 4 × 10, centred (1 cell smaller on each side than the collision box — forgiving) |
| Origin | bottom-centre (feet) |
| Collision test | against the cell grid: a cell is **solid** if its material is solid (stone, brick, wood, wax-solid, ice, metal, cloudstuff, built parts, crates) — see 06-PHYSICS-RENDER.md's material table. Liquids, gases, powders (sand, soot, ash) are not solid for the player; powders slow (×0.7). |
| Resolution | move x then y, one cell step at a time (swept); at 420 cells/s that is up to 7 steps a frame — cheap. |
| One-way cells | material flag `oneway`: solid only from above, and only if the player's feet were at or above the cell's top on the previous frame. Planks you build are **not** one-way; scaffolds, chain-walk gratings and market awnings are. |
| Step-up | when walking into a wall, if the obstacle is ≤ **2 cells** high (≤ **3** when running, ≤ **4** in the air when moving up) and the space above is free, the player is lifted onto it. This is what makes rough pixel terrain walkable. |
| Step-down | when walking off a drop of ≤ 3 cells, the player snaps down (stays grounded) instead of going airborne. |
| Corner correction | a jump whose head clips a ceiling corner by ≤ 3 cells is nudged sideways; a dash-across whose feet clip a ledge by ≤ 3 cells is nudged up. |

### 2.2 Walk and run

Run is **held** (Shift / gamepad B held, 02-CONTROLS-UI.md) — or toggled with the "always run" setting.

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
| Idle → walk animation | 6-frame walk cycle at 10 fps, run cycle 8 frames at 14 fps | |

### 2.3 Jump

| Number | Value | Notes |
|---|---|---|
| Jump launch speed | **248** cells/s up | √(2 × 900 × 34) ≈ 247.4 → apex **34 cells** (canon) |
| Rise gravity | 900 | canon |
| Apex hang | while jump is held and \|vy\| < 40, gravity × 0.5 | ~3 extra frames of float at the top; apex becomes ≈ **35** cells |
| Variable height | releasing jump while rising sets vy = vy × 0.4 | |
| Minimum jump | jump is held at least 3 frames before a release counts | shortest hop ≈ **15** cells |
| Time to apex | 0.28 s | |
| Horizontal reach (flat, running) | ≈ **49** cells | level design uses **44** as the "comfortable running gap" |
| Horizontal reach (flat, walking) | ≈ 31 cells; design uses 28 | |
| Jump from swimming surface | 200 cells/s (apex ≈ 22 cells) | §2.10 |
| Jump off a ladder / rope | 180 up + 60 sideways in the held direction | |
| Head bonk | hitting a ceiling sets vy = 0 (no bounce) | |

### 2.4 Coyote time and jump buffer

| Rule | Value |
|---|---|
| **Coyote time** — you can still jump for a short moment after walking off a ledge | **0.10 s (6 frames)** after leaving the ground without jumping |
| Coyote after a wall | 0.08 s (5 frames) after leaving a wall-slide, a wall-jump is still allowed |
| Coyote after a rope/ladder | 0.10 s after letting go without jumping |
| **Jump buffer** — a jump pressed slightly before landing still happens on landing | **0.12 s (7 frames)** |
| Attack buffer | 0.10 s (an attack pressed during recovery fires on the first allowed frame) |
| Grapple buffer | 0.10 s (pressing grapple during a jump's first frames is kept) |

### 2.5 Falling and landing

| Number | Value |
|---|---|
| Fall gravity (vy > 0) | 1,170 (× 1.3) — falls feel weightier than rises |
| Terminal speed | **420** cells/s |
| Fast-fall (hold down in the air) | gravity 1,440, terminal **520** |
| Landing lag | falls > 100 cells: 0.12 s where you can't jump (you can still attack and move at half speed) |
| **Fall damage** | falls ≤ **160** cells: none. Above: **5% max health per 20 cells** beyond 160, capped at **60%**. Never lethal from full health. |
| Negated by | landing in liquid ≥ 8 cells deep (none), landing on cloudstuff or sand/soot ≥ 4 deep (halved), a **tuck** (press down within 0.1 s before landing: halved, plays a roll) |
| Fall distance counter | resets on any ledge-grab, wall-slide, rope/ladder grab, swim, or a spring/steam launch |
| Void (a room's bottom edge with no exit) | respawn at the room's last safe spot, −10% max health, no death |

### 2.6 Wall-slide and wall-jump

Available from the start; taught in `a1_gull_chimney` (01-WORLD-STORY.md §3.1).

| Number | Value |
|---|---|
| Starts when | airborne, falling (vy > 0), pressing toward a wall, with ≥ 8 of the 12 body rows touching a grippable wall |
| Grippable walls | stone, brick, wood, wax (solid), metal, cloudstuff, built parts. **Not**: ice (you slide at 160 with no wall-jump), oil-coated cells (no grip), glass, one-way cells |
| Slide speed | ramps to **70** cells/s over 0.1 s (wet walls: 90; soot: 50) |
| Stick | pressing away from the wall for < 0.15 s does not detach (so you can press away + jump) |
| **Wall-jump** | vx **120** away from the wall, vy **230** up; toward-wall input is ignored for **0.14 s** |
| Wall-jump chain | unlimited on grippable walls; the same wall can be re-grabbed after 0.2 s |
| Slide dust | 1 soot/rain particle per 4 frames from the hand (visual) |

### 2.7 Ledge-grab

| Rule | Value |
|---|---|
| Hand box | 2 cells in front of the body, rows 0–4 from the top of the head |
| Grab when | airborne, vy ≥ −60 (near apex or falling), moving or pressing toward the ledge, the hand box touches the **top edge** of a solid cell with ≥ 12 free cells above it and ≥ 6 free cells wide |
| Hang | body hangs with hands at the edge; no stamina limit |
| Climb up | up or jump: **0.30 s** animation (not cancellable), then you stand on top |
| Drop | down: let go (fall counter resets at the hang) |
| Hop away | jump + away: vx 90, vy 200 |
| Shimmy | left/right while hanging moves 20 cells/s along a continuous edge |
| Ledges that do not count | ice tops, oil-coated tops, one-way scaffolds (you land on them instead), moving platforms faster than 60 cells/s |

### 2.8 Crouch, crawl, slide

| Move | Input | Numbers |
|---|---|---|
| Crouch | hold down on the ground | box 6×7; lantern lowered (light origin drops 5 cells — a Blackwater hiding trick) |
| Crawl | crouch + move | **28** cells/s; fits any tunnel ≥ **8** tall |
| Slide | crouch while running ≥ 80 cells/s | 0.35 s at **130** cells/s decaying to 60; fits under 8-cell gaps; can slide off ledges (keeps speed into the air); cooldown 0.5 s; no invulnerability |
| Stand up | releasing down when there are 12 free cells above; otherwise you stay crouched |

### 2.9 Drop-through

| Rule | Value |
|---|---|
| Down + jump on a one-way surface | fall through; one-way collision ignored for **0.20 s** |
| Hold down for 0.3 s on a one-way surface | same (for players who don't know the combo) |
| Not possible on | built planks, solid terrain (feedback: a small "thunk" and dust) |

### 2.10 Swim and dive

Water is cells (06-PHYSICS-RENDER.md). The player is **in water** when ≥ 50% of the body's cells are water
(or oil-on-water, or any liquid). Swimming arrives in Act 3 (canon). Before Act 3:

- **Before Act 3**: water deep enough to swim in is rare by design. If you are in it you **float and paddle**:
  28 cells/s, no dive, you bob at the surface, jump out at 180. Breath still applies if something holds you under.

**From Act 3 on:**

| Number | Value |
|---|---|
| Buoyancy (no input) | net 120 cells/s² upward; you drift to the surface |
| Swim speed | **50** cells/s in any direction (8 directions or analog) |
| Stroke | jump underwater: burst to **90** cells/s in the held direction for 0.25 s, cooldown 0.4 s |
| Dive | hold down: 55 cells/s down; buoyancy off while held |
| Water drag | velocity × e^(−4·dt) toward the swim target; entering water at speed: vy capped to 160 in 0.1 s (splash cells thrown up, 06-PHYSICS-RENDER.md) |
| Surface | the body's top 4 rows are out of the water: you bob (±1 cell, 1.2 s cycle), breath refills |
| Jump from the surface | vy **200** (apex ≈ 22 cells). With a stroke within 0.2 s before: 240 |
| **Breath** | **12 s** under. Refills at 4 s⁻¹ (full in 3 s) at the surface. At 0: **drowning, 8% max health per second** |
| Breath bar | shows only when breath < 100% (02-CONTROLS-UI.md) |
| Currents | water cells carry a flow velocity from the sim; the player gets **60%** of the local flow added each frame (a 100 cells/s undertow at an open sluice drags you at 60) |
| Oil layer | swimming through oil: speed × 0.7; if the oil burns, you burn (14/s, 03-SPELLS.md burn rules) |
| Electrified water | 03-SPELLS.md: anyone in a connected body of water takes the Spark damage (you included) |
| Casting underwater | allowed; Ember wicks fizzle to steam (03-SPELLS.md), everything else works |
| Pole underwater | swing speed × 0.7 |
| Cold water | Act 3 unlit cisterns: after 20 s submerged, 1 hp/s (01-WORLD-STORY.md §3.3) |

### 2.11 Ladders and climbing

| Surface | Grab | Up | Down | Fast down | Notes |
|---|---|---|---|---|---|
| Ladder (terrain or built) | press up/down while overlapping, or land on it while pressing up | 45 | 60 | hold down + run: **140** | jump off: 180 up + 60 sideways |
| Hanging rope (level rope, not your hook) | touch it while airborne, or press up while overlapping | 40 | 55 | 120 (slide) | swingable (§3.6) |
| Chain | as a rope, but no swing, no burn | 40 | 55 | 120 | |
| Frozen waterfall (Rime on falling water) | behaves as a **ladder** where it is ≥ 6 cells wide | 45 | 60 | 140 | melts after 20 s (03-SPELLS.md) |
| Climbable vines / root-fibre (Act 6) | as a ladder | 40 | 55 | 120 | burns |
| Grate walls (Gutterways) | as a ladder, also sideways at 35 | 35 | 50 | — | |

### 2.12 Carry, push, pull

| Action | Rule |
|---|---|
| **Pick up** (interact near an object with weight ≤ 1 and size ≤ 10×10: small crate, oil barrel, bucket, sandbag, fuse-pot, gravity lantern) | carried above the head; walk only (60 → **48**), jump × 0.8 (apex ≈ 22), no wall-jump, no ledge-grab, no casting (the lantern is in the other hand — you can still pole-hit with a one-handed poke, 50% damage) |
| **Throw** | attack while carrying: 180 cells/s in the aim direction + 60 up; a thrown barrel breaks on impact > 150 cells/s |
| **Drop** | interact again: placed in front |
| **Push** (walk into an object of weight ≥ 1 on the ground) | 30 cells/s for weight 1, 18 for weight 2, 10 for weight 3; weight > 3 does not move; objects on ice slide on at 80% of your speed |
| **Pull** | hold interact facing it + move away: same speeds, you walk backward |
| Pole shove | a pole hit gives an object an impulse of 80 cells/s ÷ its weight |

### 2.13 Surfaces

| Surface (material) | Accel × | Decel × | Max speed × | Jump × | Notes |
|---|---|---|---|---|---|
| Stone, brick, wood, metal | 1 | 1 | 1 | 1 | |
| Wet slate / wet stone (rain-soaked flag) | 0.8 | 0.6 | 1 | 1 | slides a little |
| Ice | 0.2 | 0.07 | 1.1 | 1 | you keep sliding; no wall grip |
| Oil film | 0.4 | 0.15 | 1.05 | 1 | ignitable under you |
| Molten wax | 0.6 | 1 | 0.6 | 0.8 | 6 dmg/s |
| Tar | 0.4 | 2 | 0.4 | 0.6 | ropes that touch tar stick (§3.4) |
| Sand / soot / ash ≥ 3 deep | 0.7 | 1.2 | 0.7 | 0.9 | |
| Mud | 0.6 | 1.5 | 0.6 | 0.8 | |
| Cloudstuff (Act 6) | 1 | 1 | 0.9 | 1.1 | soaks water; gives way after 2 s when saturated |
| Spring pad (built) | — | — | — | launches (§9) | |
| Conveyor (Act 5 clockworks) | adds its belt speed (±40) | | | | |

### 2.14 Wind, currents, knockback

| Force | Rule |
|---|---|
| Wind (Act 1 gusts, Act 6 storm, fans) | a zone with a velocity **w**. The player gets acceleration toward w: **6 × (w − v)** per second in the air (capped at 240 cells/s²), **2 ×** on the ground. Act 6's 30 cells/s crosswind moves a standing player ≈ 10 cells/s if they do nothing. |
| Rain | none on movement (visual), except the "wet" flag on surfaces |
| Currents | §2.10 |
| Knockback (from hits) | the hit sets velocity (`knock` vector from 03/05), then control is reduced to 30% for **0.2 s**. Nerve reduces knockback (04-CLASSES-PROGRESSION.md). Knockback into a wall ≥ 200 cells/s = a 0.3 s stagger. |
| Explosions | radial velocity = power × (1 − d / r), added, not set |

### 2.15 Gravity bands (Act 5)

A **gravity lantern** (§5.20) flips gravity inside a rectangle. Inside a flipped band:

- Gravity points **up**. Every rule above is mirrored vertically: jumping pushes you **down** (away from the
  band's "floor", which is now a ceiling), ledge-grabs work on bottom edges, wall-slides slide up.
- Left/right controls stay screen-relative (never mirrored). The camera does not flip; the player sprite
  flips upside down over 0.12 s.
- Crossing a band edge keeps your velocity; the new gravity takes over the next frame. Fall damage counts
  from the point you crossed.
- Loose cells (sand, water, rubble, rain) inside the band fall up too (06-PHYSICS-RENDER.md). Ropes' nodes
  inside the band get flipped gravity.
- A band has a lit rim (its edge is drawn in the bell-gold `#f2c66e` at 50%), per the "readable danger" pillar.

### 2.16 Class movement traits

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
  hurt (0.2 s)   stagger (0.3 s)   dead   cutscene   interact (lever/valve hold)
```

- One state at a time, stored as a string id; transitions are a table in `js/player/states.js`.
- **Every state lists what it allows**: `canJump`, `canAttack`, `canCast`, `canGrapple`, `canInteract`,
  `gravityScale`, `maxSpeed`. E.g. `ledge_hang` allows cast (yes — you can cast one-handed from a ledge, a
  deliberate power move), not attack; `carry` allows neither cast nor grapple.
- Animations key off the state (sprite sheet in 06-PHYSICS-RENDER.md's art list): idle 4 frames, walk 6, run 8,
  jump 2, fall 2, land 2, wall_slide 2, ledge_hang 1, ledge_climb 4, crouch 1, crawl 4, slide 2, ladder 4,
  rope 4, swim 6, swim_under 6, carry-walk 6, push 4, hurt 1, tuck 3.

### 2.18 `data/movement.json`

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

---

## 3. The grapple hook and ropes

The grapple arrives at the start of Act 2 (canon) at `a2_hook_forge`. Ropes exist before that (hanging
level ropes in Act 1 are climbable and swingable, §3.6), so the hook is an extension of a verb the player
already knows.

### 3.1 Controls (defaults; 02-CONTROLS-UI.md is the authority)

| Action | Mouse + keyboard | Gamepad |
|---|---|---|
| Fire hook / release | right mouse (press to fire, press again to let go) | LT |
| Aim | mouse direction from the player's hands | right stick; with no stick input: 60° up-forward |
| Reel in / out | W / S while hooked | left stick up/down |
| Pump the swing | A / D while hooked | left stick left/right |
| Jump-release (keeps momentum + pop) | Space | A |
| Cut your own rope | the same as release | |

### 3.2 The hook in flight

| Number | Value |
|---|---|
| Hook speed | **900** cells/s |
| Max range | **150** cells (the rope is 150 cells long; the hook stops and falls back if it reaches the end) |
| Hook size | 2×2 cells |
| Aim assist | if a **grapple ring** (a marked hook point, drawn with a small brass ring and Hush's sparkle, 01 §7) is within **8°** of the aim and in range, the hook flies to it |
| Retract (miss) | 1,200 cells/s; can fire again **0.25 s** after it is back |
| Hitting a liquid | passes through water/oil (slowed to 400 cells/s) and can hook things under water |
| Hitting an enemy | §3.8 |
| Hitting an object | crates, barrels, lanterns: §3.8 (objects are "light things" or "heavy things") |

### 3.3 What the hook bites (attach rules by material)

| Material (06 ids) | Hook? | Hold | Notes |
|---|---|---|---|
| `stone`, `brick` | yes | forever | |
| `wood` (terrain, crates, built planks) | yes | forever | if the wood burns, the anchor cell burns away → the hook drops |
| `metal` plate | **no** — bounces off | — | the hook can't bite smooth metal |
| `metal` beam / grate / **grapple ring** | yes | forever | rings are always valid; iron beams are drawn with rivets so they read |
| `wax` (solid) | yes | **3 s** under load, then tears out | molten wax: no |
| `ice` | **no** — skids off | — | exception: *rough ice* (Rime freezing a waterfall/rain) — yes, 4 s |
| `glass` | no | — | |
| `soil`, `mud` | yes | **4 s** under load | |
| `sand`, `soot`, `ash`, `snow` | no | — | |
| `cloudstuff` (Act 6) | yes | **2 s** under load, then pulls loose | Rime-frozen cloudstuff: forever |
| `rope` (another rope) | yes | forever | catches on it; the other rope takes your weight |
| `bone`, `flesh` of a corpse | yes | forever while the corpse stays | |
| liquids, gases, fire | no | — | |
| `tar` | yes, and **sticks**: the hook can't be released for 1 s | forever | |

"Under load" means the rope is taut with the player on it. A slack rope hooked into wax or soil holds forever.
A cell under the hook that is destroyed (burned, dissolved, exploded, dug) releases the hook.

### 3.4 The rope simulation

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

### 3.5 Swinging on the hook

| Number | Value |
|---|---|
| Pump (A/D) | tangential acceleration **260** cells/s² along the swing |
| Max swing speed | **260** cells/s at the bottom of the arc |
| Reel in | **70** cells/s (shortens the rope; conserves angular momentum, so reeling in at the bottom speeds you up — capped at 260) |
| Reel out | 70 cells/s; while falling, reel out is free-fall until the rope is taut |
| Minimum length | **12** cells |
| Release | keeps velocity; adds **−60** vy ("release pop") if you release with the jump button; the 0.1 s grapple buffer lets you fire the next hook during the pop |
| Hook-jump chain | releasing and re-hooking within **0.3 s** keeps 100% speed; each chain after the third in a row adds +5% max swing speed up to +20% (the "Sweep's rhythm"; counts toward the Chimneysweep 2,000 m unlock, canon) |
| Wall contact while swinging | you slide along it; pressing into it for 0.2 s grabs as a wall-slide and releases the hook |
| Zip (reel fully in on a short rope) | at ≤ 30 cells, holding reel-in zips you to the anchor at **220** cells/s and puts you into ledge-hang if the anchor is on a ledge top |
| Distance counted | the Ledger counts metres swung (1 m = 16 cells, a Ledger convention) |

### 3.6 Level ropes (hanging, fixed)

Authored rope entities (`rope` in room JSON): an anchor point and a length (20–300 cells). Always simulated
near the camera.

- **Grab**: touching one while airborne, or up while overlapping. You hang at the touch point.
- **Swing**: pump with left/right (acceleration 200 cells/s²; the rope's own points move, so swings feel loose).
- **Climb**: up/down (§2.11).
- **Let go**: jump (vy 180 + 60 sideways) or down + jump (drop).
- **Hook onto it**: your hook rope catches level ropes (§3.3), so you can hang a rope from a rope.
- A rope with a **weight** on its end (a crate, a barrel, a bucket) can be cut to drop the weight (§3.7).

### 3.7 Cutting, burning and other things that happen to ropes

| Cause | Effect on a rope |
|---|---|
| Pole hit on a link | **cuts** it there (level ropes and enemy ropes; your own hook rope is cut by release, not by your pole) |
| Blade enemies (`cutter` tag in 05) | a hit on your taut hook rope cuts it; the hook is lost for **2 s** |
| **Ember** / any fire cell touching a link | the rope **ignites**: the fire spreads along it at **24** cells/s both ways; each burning link **snaps after 1.2 s**; burning links drop an ember cell every 0.3 s (ignites oil below). A wet rope ignites only after 1 s of contact. |
| **Rime** | the links in the spell's area **freeze stiff** for **6 s**: a frozen section is rigid (a pole). A taut horizontal frozen rope can be **stood on** (it is a one-way surface while frozen). Then it thaws and sags. |
| **Spark** | a **wet** rope conducts: the Spark travels the rope at 600 cells/s and hits whatever holds either end (8 damage to you if you are on it; full wick damage to an enemy). Dry rope: no effect. |
| **Bile** | dissolves the links in the area over **0.6 s** (cuts it) |
| **Tide** | pushes the rope's points like a wind (swings it) |
| **Shade** | none on the rope; a rope in Shade darkness is hard to see (the rope colour is drawn at 50%) |
| **Gleam** | none |
| Explosion | links in radius snap |
| Tar | sticks (§3.4) |

### 3.8 Hooking enemies and objects

Every enemy and physics object has a **mass class** (05-BESTIARY-BOSSES.md sets it for enemies).

| Class | Examples | What the hook does |
|---|---|---|
| **S** (light: ≤ 1 unit) | rats, candle-mites, small crates, buckets, barrels (empty), gravity lanterns | **yank**: pulled to you at **300** cells/s; enemies stunned **0.4 s** on arrival; objects land in front of you (you can catch them into a carry with interact) |
| **M** (medium: 2–3) | wax-things, cultists, full barrels, big crates | **tug**: you and it pull toward each other at 120 cells/s each; if you are standing on ground you are anchored and it comes to you at 120; an enemy may **resist** (05 marks some `anchored`) |
| **L** (heavy: 4+) and bosses | the Sluicemaw's head, clappers, a lift platform | **zip**: you are pulled to it at 220 cells/s; your next pole hit within 0.5 s is a **hook strike** (+50% damage, knocks back) |
| Flying (any class) | storm-crows, moth-swarms | it **drags** you (a free ride) for up to **3 s**, then the hook tears out |
| Hook-immune | Unlit (they are not solid — your hook passes through), fire, the Widow's silk (cuts it) | — |

### 3.9 Ropes from spells and building

- The **tether** shape (03-SPELLS.md) makes a rope between two hit points: a level rope anchored at both ends,
  taut, climbable along its length (walk it as a one-way if it is within 20° of horizontal), and damaging to
  anything crossing it per the tether's flame. It uses the same rope simulation with both ends pinned, so
  burning/freezing/cutting apply.
- The **rope peg** build part (§9) makes a hanging rope 60 cells long; the **pulley** runs a rope over a wheel.

### 3.10 Rope budget

| Budget | Value |
|---|---|
| Ropes simulated at once | **12** (the hook rope + the 11 nearest level ropes/tethers to the camera) |
| Ropes further than 400 cells from the camera | asleep (frozen in place; they wake with 10 extra constraint passes) |
| Cost | 12 ropes × 38 links × 10 passes ≈ 4,600 link fixes a tick ≈ < 0.3 ms in JS |

---

## 4. The pole-lantern

The pole-lantern is the Lamplighter's melee weapon **and** a tool. Other classes carry a different pole-arm
(hook-staff, wrench, oar-staff, maul, anchor-blade, moth-lamp, brush-spear — canon) with the same move set and
different numbers (04-CLASSES-PROGRESSION.md). Numbers below are the Lamplighter's base; damage scales with
Might (04).

### 4.1 Moves

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

### 4.2 The lantern as a tool ("lantern touch")

The lantern at the pole's end burns the **flame of the selected wick** (canon: its light colour is that flame).
During any swing's active frames, the lantern end (a 4×4 box at the tip) **touches cells** with that flame:

| Flame | Lantern touch on cells (never on enemies) |
|---|---|
| Ember | ignites flammable cells (wood, oil, wax, rope, fuse, cloth, dry soot); lights lamp posts, braziers, lamp sockets, fuses |
| Rime | freezes a 3×3 patch of water/steam; puts out a 3×3 fire |
| Spark | gives a spark machine **1 charge** (§5.14); a wet rope/metal conducts a small zap (no damage) |
| Bile | corrodes 1 cell of metal or brick per touch |
| Gleam | lights lamp posts/sockets (a holy flame counts as fire for lamps, not for burning); counts as light 1.0 at light-sensitive doors |
| Tide | pushes 12 cells of water 20 cells in the swing direction |
| Shade | darkens a light source it touches for 5 s (puts a lamp post out without breaking it) |

- Lantern touch costs **no oil** but works at most **once per 0.5 s**, and only on cells, so it can't
  replace spells in a fight. From Act 4 (oil economy) the lantern's own light costs oil (03-SPELLS.md §oil);
  lantern touch still costs nothing.
- The lantern is a **light source** always: radius 40 cells (Draught and gear change it, 04/08), colour =
  the selected wick's flame. It lights light-sensitive doors (§5.13) like any other light.

### 4.3 The pole as a tool

| Use | Rule |
|---|---|
| Hit levers, buttons, targets, bells | from the full swing reach (16), including through bars/grates |
| Ring bells | a swing rings a bell (Silent Bells ring only from the pole, 01 §4) |
| Shove objects | 80 cells/s ÷ weight (§2.12) |
| Knock hanging things | hanging lanterns, signs, pots, hives: a hit sets them swinging; a slam knocks them off their hook |
| Cut ropes | §3.7 |
| Break | cracked brick (clout), rotten wood (any swing, 4 HP per cell), wax crust (any swing) |
| Reach through water | ×0.7 swing speed underwater (§2.10) |

---
## 5. Interactables catalogue

### 5.1 Common rules

- An interactable is an **entity** placed in a room (`room.entities[]`, 10-TECH-DATA.md), with an `id`
  unique in the room, a `type`, a position `at: [x, y]` (top-left, cells) and type-specific fields.
- Most interactables are also **drawn into the cell grid** as real material cells (a lever's base is metal
  cells; a sluice gate is a slab of bronze cells; a crate is wood cells) so that water, fire and physics
  treat them as the stuff they are. The entity owns and moves its cells (06-PHYSICS-RENDER.md "entity-owned
  cells").
- **Interact** key (E / gamepad X) works within **12 cells** of the entity's interact point. A prompt shows
  over it (02-CONTROLS-UI.md). A pole hit counts as interact for levers, buttons, bells and targets.
- Every interactable that can be a **signal source** has an `out` value; every one that can be a
  **target** has an `in` (a node id). Wiring is §6.
- **States are saved** per room (a lever you pulled stays pulled on revisit) unless the entity has
  `"resets": true` (plates, buttons, timers always reset).
- **Readability**: every interactable has a small indicator light: **off = dim red `#7a2a22`**, **on = green
  `#4fd06a`**, **timing = blinking amber**. Lights are light sources (radius 6) so they read in the dark
  (the readable-danger pillar).

### 5.2 Table of interactables

Weight units for plates: player 1; small crate 1; big crate 3; empty barrel 0.5; oil barrel (full) 2;
water/oil/sand cells: **80 cells = 1 unit**; ice block (8×8) 1; enemies by mass class (S 1, M 2, L 4);
built parts: crate 1, sandbag 2, stone block 3.

| # | id | Size (cells) | States | You use it by | Signal out | Takes signal in | Unlocked |
|---|---|---|---|---|---|---|---|
| 5.3 | `lever` | 4×8 | `off`, `on` | interact / pole hit (flip) | 1 while `on` | yes (forces state; a *locked* lever can't be flipped by hand) | Act 2 (canon); decorative in Act 1 |
| 5.4 | `lever3` | 6×8 | `left`, `mid`, `right` | interact cycles L→M→R→M; pole hit pushes it away from you | three outputs: `out.left`, `out.mid`, `out.right` | yes | Act 3 |
| 5.5 | `button` | 6×3 on a wall/floor | `up`, `down` | interact, pole hit, any projectile or spell hit | 1 for **0.5 s** after the press (the `hold` field changes it) | no | Act 2 |
| 5.6 | `target` | 6×6 eye | `idle`, `hit` | **projectiles only** (bolt/lob/wave/thrown objects; not beams) | 1 for 0.5 s | no | Act 2 |
| 5.7 | `plate` | 12×2 | `up`, `down` | anything with weight ≥ 0.5 on it | 1 while down | no | Act 2 |
| 5.8 | `weighted_plate` | 16×3 + dial | `up`, `down` | weight ≥ `needs` | 1 while down; `level` = weight / needs (0..1) | no | Act 2 |
| 5.9 | `valve` | 8×8 wheel | `level` 0..1 | hold interact: turns 0→1 in 2 s (or 1→0 if it is already 1); release stops it | `level` | yes (a signal drives it to 1, its absence to 0, at the same speed) | Act 3 |
| 5.10 | `sluice_gate` | 8 wide × 20–80 tall | `closed`, `opening`, `open`, `closing` | never directly: wired to a lever/valve/winch | 1 while `open` | yes | Act 3 |
| 5.11 | `timed_door` | 8×24 | `shut`, `open`, `closing` | never directly | 1 while open | yes: opens on a 0→1 edge, stays open `sec` (default **4 s**), ticks (amber blink + tick sound every 0.5 s, faster in the last 1 s), then shuts at 120 cells/s | Act 2 |
| 5.12 | `door` | 8×24 | `shut`, `open` | interact if `manual: true`, else signal | 1 while open | yes (open while 1) | Act 1 |
| 5.12b | `portcullis` | 24×32 bars | `down`, `rising`, `up`, `falling` | signal | 1 while up | yes: rises at **30** cells/s while 1; falls at **200** cells/s when 0; bars (2-cell gaps) let water, rats (S), projectiles and ropes through | Act 2 |
| 5.13 | `light_door` | 10×28 + eye glyph | `shut`, `open` | light: opens while the **light level at its eye ≥ `threshold`** (default 0.6) for 0.3 s; `flame` field (optional) requires that light colour (e.g. only Gleam) | 1 while open | no | Act 1 (Gleam door), heavy use Act 4 |
| 5.13b | `light_sensor` | 4×4 eye | `dark`, `lit` | same test as the door, no door attached | 1 while lit; `level` = light | no | Act 4 |
| 5.14 | `spark_coil` | 8×12 | charge 0–5 | **Spark** hits (+1 charge per hit, +2 for a beam held 0.5 s), lantern touch with Spark (+1) | 1 while charge > 0; drains 1 charge every **3 s** | yes (a wired power source keeps it full) | Act 1 (canon: Spark powers machines) |
| 5.14b | `dynamo` | 16×16 wheel | `level` 0..1 | turned by water flow through it (a water wheel), wind (fan) or a winch; level = flow ÷ `ratedFlow` | `level`, 1 while level ≥ 0.5 | no | Act 3 |
| 5.15 | `lift` | platform 24×4 on a track | `stopped@N`, `moving` | call buttons (built in), a signal, or a crank | 1 while moving | yes: moves to stop 1 while 1, stop 0 while 0; or `mode: "cycle"` | Act 1 (hand-cranked), Act 2 on |
| 5.16 | `counterweight` | two platforms 20×4 on one chain over a pulley | `balance` −1..1 | put weight on a side | `level` = side A's height 0..1 | no (it is pure physics) | Act 5 (also Act 2 intro) |
| 5.17 | `winch` | 10×10 crank | `level` 0..1 (rope wound) | hold interact: winds at **30** cells/s of rope; `ratchet: true` keeps it, else it unwinds at 60 when released | `level` | no | Act 2 |
| 5.18 | `bell` | 16×16 to 48×48 | `still`, `ringing` (1.5 s) | pole hit, a heavy thrown object, a clout, a Bellringer toll, or a signal | a **1-tick pulse** on ringing; also a sound wave (below) | yes (rings) | Act 1 (Silent Bells), heavy use Act 5 |
| 5.19 | `breakable_wall` | any area of `cracked_brick` / `rotten_wood` / `wax_crust` cells | per cell HP | damage: clout, explosions, Bile, bells' shock wave, heavy charm | 1 once a named cell group (`group`) is ≥ 80% destroyed | no | Act 1 |
| 5.20 | `gravity_lantern` | 8×10 (carryable) | `off`, `on` | interact toggles; carry and place (the player holds up to **2**, canon Act 5); a signal toggles a fixed one | 1 while on | yes | Act 5 |
| 5.21 | `crate` | small 10×10 (weight 1), big 20×20 (weight 3) | intact, burning, broken | push/pull/carry (small), hook (§3.8), stand on, stack | — | — | Act 1 |
| 5.22 | `oil_barrel` | 8×10, weight 2 (0.5 empty) | full, leaking, burning, exploded, empty | push/carry/throw, hook, pierce to leak | — | — | Act 1 (few), Act 4 (many) |
| 5.23 | `fan` | 16×8 housing | `off`, `on` | signal or its own switch | 1 while on | yes | Act 2 |
| 5.24 | `steam_vent` | 8×4 grate | `idle`, `puffing` | periodic (`period`, `duration`) or signal, or **automatic when water above it is boiled** | 1 while puffing | yes | Act 1 (small), Act 3 |
| 5.25 | `lamp_post` | 4×20 | `dark`, `lit`, `guttering` | lantern touch (Ember/Gleam), an Ember/Gleam spell hit, a signal | 1 while lit | yes | Act 1 |
| 5.26 | `brazier` | 12×12 | `cold`, `burning` | any fire, lantern touch | 1 while burning | no | Act 1 |
| 5.27 | `lamp_socket` | 24×24 | `empty`, `lit` | lantern touch with Ember or Gleam (the story Lamps use this) | 1 while lit | no | Act 1 |
| 5.28 | `fuse` | a line of `fuse` cells | burning front | ignite one end | pulse when the burn reaches the `end` point | no | Act 1 |
| 5.29 | `release_hook` | 6×6 | `holding`, `released` | cut/burn its rope, a pole slam, a signal | pulse on release | yes | Act 2 |
| 5.30 | `float_switch` | 6×16 | `low`, `high` | water level: 1 when water reaches its mark | 1 while high; `level` | no | Act 3 |
| 5.31 | `pipe` | any path of `pipe` cells + ends | flow 0..1 | through a `valve`, or its `in` | flow | yes | Act 3 |
| 5.32 | `mirror` | 8×8 | angle (0°, 45°, 90°, 135°) | interact rotates 45° | — | yes (rotates on each pulse) | Act 4 |
| 5.33 | `pressure_bellows` | 12×8 | charge 0..1 | stomp (land on it) | pulse, and a puff of air (pushes light things 40 cells) | no | Act 5 |

### 5.3 – 5.33 Behaviour notes per interactable

**Lever / lever3.** Flip takes 0.15 s. A lever can be **locked** (`locked: true`, a padlock sprite) until a
signal unlocks it. Pole hits flip levers from the side the swing comes from (so a lever behind bars can be
flipped by poking through them).

**Button.** Momentary. `hold` (seconds) sets how long the output stays on after the press (default 0.5). A
button can be pressed by **any** hit: a bolt fired across a room presses it. Buttons on ceilings are pressed by
lobbed spells, pogo, or thrown objects.

**Target.** As a button but only projectiles (spell shapes bolt/lob/wave and thrown objects). Beam and arc do
not count — so a target puzzle forces a projectile.

**Plate / weighted plate.** A plate sinks 2 cells when pressed. The weighted plate's dial shows `weight /
needs` as a needle (and a number when Knack ≥ 10, or with the Inspect key). Water pooling on a plate counts:
**80 water cells = 1 unit**, so flooding a room can hold a plate down. Ice counts by cells. Burning a crate
on a plate lowers its weight as the crate's cells burn away (each wood cell = 1/100 of a crate).

**Valve.** Analog. Its `level` is the fraction a connected `pipe` or `sluice_gate` is open. Wheel sprite
rotates with level. Can be jammed with Rime (§7).

**Sluice gate.** Moves at **20** cells/s. When `closing`, anything under it takes **40** damage and is shoved
out; it stops (and stays `closing`) if a big crate or stone block is under it — **you can jam a gate with a
crate** (the crate is crushed over 3 s: 33 HP/s to its cells). Water pressure: an open gate between chambers
with different levels makes a jet; the jet speed = min(300, 10 × √(level difference in cells)) cells/s
(06-PHYSICS-RENDER.md owns the fluid sim; this is the gameplay target).

**Timed door.** `sec` default 4 s. A second 0→1 edge while open **restarts** the timer (so a player can
re-trigger it with a button). It can be jammed open for 3 s by a crate in the doorway (it crushes like the
sluice gate at 33 HP/s).

**Portcullis.** Falls fast (200 cells/s), 60 damage when it lands on you; rises slow.

**Light door / light sensor.** Light level is read from the light buffer (06-PHYSICS-RENDER.md) at the eye's
centre cell, 0..1 where 1 = directly next to a bright source. Your lantern at 10 cells is ≈ 0.8; at 40 cells
≈ 0.3 (radius 40). A lamp post at 20 cells ≈ 0.6. `flame` filter compares the dominant hue in the light
buffer at that cell to the flame's colour (tolerance 30° of hue). A **Shade** effect on the eye forces its
level to 0 for its duration. Some doors are **inverted** (`invert: true`): open only while **dark**
(Blackwater, Moth Nave).

**Spark coil.** Holds up to 5 charges, each 3 s of power, so max 15 s of output from a full coil. Draws a
visible arc between its prongs while charged. Chained coils (`chain: [...]`) pass charge along at 1 per 0.2 s.
A coil next to water electrifies the water while it has charge (hazard and tool).

**Dynamo / water wheel.** Level from water flow through its cells (06 gives flow in cells/s): `level =
min(1, flow / ratedFlow)`, `ratedFlow` default 60. Also turned by wind (fans) at `wind / 120`.

**Lift.** Moves at **50** cells/s. Capacity 6 weight units; over capacity it stops and creaks (a hint). A
lift carries whatever stands on it, including water cells pooled on it (they count toward capacity: a
flooded lift sinks). Crank lifts (Act 1): hold interact on the crank, 25 cells/s.

**Counterweight.** Two platforms on one chain over a wheel. Each side's weight is the weight on it. The
heavier side moves down at `20 × |difference|` cells/s (max 80). Equal weights: balanced, doesn't move.
Pouring water onto a side works (80 cells = 1 unit). Built part: pulley (§9) makes your own.

**Winch.** Winds a rope/chain attached to something (a lift, a gate, a hanging bridge, a cage). 30 cells/s of
rope. With `ratchet: false` it unwinds when released (so you have to hold it — or wedge it with a crate,
which counts as holding).

**Bell.** Ringing emits (a) a signal pulse, (b) a **sound wave** (a ring that expands at 600 cells/s to
`radius` (default 200)): loosens `loose` cells (rubble, icicles, wax drips) within the radius so they fall,
stuns enemies of class S for 0.5 s, and triggers `listens: "bell"` entities (Act 5 bell-cultists come; some
doors are "bell-doors" that open for 5 s when a bell rings within their radius). Ringing a big bell next to
you: deaf (muffled audio) + 0.8 s stagger unless you are > 48 cells away (01 §3.5 hazard).

**Breakable wall.** Made of cells with HP: `cracked_brick` 16 HP/cell, `rotten_wood` 4, `wax_crust` 6.
Damage rules from 03-SPELLS.md (Bile dissolves brick, heavy charm doubles cell damage, explosions deal their
power to every cell in radius). A wall is drawn with visible cracks so it reads as breakable.

**Gravity lantern.** Flips gravity inside a **band**: default 40 wide × 120 tall, centred on the lantern,
oriented along the lantern's axis (placed on a floor: band goes up from it; on a ceiling: band goes down).
Canon: "place/flip local gravity". Placed lanterns: max 2 carried, 2 placed at once; placing a third picks up
the oldest. Bands don't stack (overlap = normal gravity, drawn as a flicker to show it). The Bellfather's tolls
flip bands in its arena (05).

**Crate.** Wood cells, burnable (a small crate burns out in ~6 s), floats (weight 1 floats with 40% above the
surface; big crate 20%), stackable (a crate on a crate is stable if ≥ 50% overlap). A burning crate is a
moving fire source.

**Oil barrel.** 120 oil cells inside. **Pierce** (a pierce-charm bolt, a thrown hook, a pole slam) makes a
leak: oil pours out at 20 cells/s for 6 s. **Fire** on the barrel: after 0.8 s it explodes: **40 damage,
radius 20**, knockback 260, spills the remaining oil as burning oil cells. Rime on a burning barrel puts it out
if hit within the 0.8 s fuse. Thrown barrels break on impact > 150 cells/s (spill, no explosion unless on fire).

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

---

## 6. Wiring: the signal network

### 6.1 Model

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

### 6.2 Gates

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

### 6.3 Evaluation

1. Once per sim tick, **after** entity physics and **before** targets act.
2. Nodes are sorted into an order where every node comes after its inputs (a topological sort, done once
   when the room loads).
3. **Loops** are allowed only through a `timer`, `latch`, `toggle` or `counter`: those read their inputs'
   values **from the previous tick**, which breaks the loop. A room whose wiring has a loop with no such node
   **fails to load** with an error naming the loop (a data test catches it first, §11).
4. Targets act on the new values in the same tick.
5. Edge detection (0→1) compares with the previous tick's value.

Cost: a room has at most 64 nodes; evaluation is a few microseconds.

### 6.4 JSON shape (inside a room file)

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

### 6.5 Showing the wires (readability)

- Wires are thin copper lines (`#6b4a2c`, 1 cell) drawn on the background layer along `wires[].path`.
- A live wire (carrying 1) glows faintly in the source's indicator colour; the glow travels along the wire
  at 400 cells/s when the value changes, so the player **sees** what a lever does.
- **Inspect** (hold Tab / gamepad R3, 02-CONTROLS-UI.md) brightens every wire in view, labels gates with a
  glyph (∧ ∨ ¬ ⊕ ⏱ ◐ #), and dims everything else. Puzzles never hide wiring; they hide **access**.
- Exception by design: in Act 4 some wires run through dark areas, so you see them only where light falls
  (still visible in Inspect).

### 6.6 Wiring by spells (players can wire, a little)

- **Spark** hitting a bare wire **pulses** it (sets it to 1 for 0.5 s from that point on), so a Spark bolt
  can trigger a door whose lever you can't reach. Wires marked `insulated: true` ignore this.
- **Bile** on a wire **cuts** it for the room (that connection is permanently 0). Some puzzles want this
  (cut the wire that closes the gate).
- **Rime** on a lever or valve **jams** it in its current state for 8 s.
- The **Knot** `on_hit` (Act 4) can carry a Spark pulse through a target (03-SPELLS.md).

---

## 7. Spells against interactables

Rows are flames (canon, 00-OVERVIEW.md §8); the full element × material table is 03-SPELLS.md /
06-PHYSICS-RENDER.md. This matrix is only interactables. "—" = no effect.

| Interactable | Ember | Rime | Spark | Bile | Gleam | Tide | Shade |
|---|---|---|---|---|---|---|---|
| lever / valve | — | **jams** 8 s | — (wires: pulse) | corrodes after 3 s: stuck in current state for the room | — | — | — |
| button / target | presses (hit) | presses | presses | presses | presses | presses (a wave that reaches it) | presses |
| plate / weighted plate | burning crates lose weight | freeze water on it → counts as ice (same weight, doesn't drain) | — | dissolves metal weights over time | — | adds water (80 cells = 1 unit) | — |
| sluice gate | — | frozen **8 s** (stops moving) | electrifies the water behind it | corrodes bronze: a 4×4 hole per 2 s of Bile | — | pushes water through an open gate faster (+50% jet) | — |
| timed door | — | freezes its timer for 8 s (stays open) | resets its timer (if wired to a coil) | — | — | — | — |
| portcullis | — | frozen 8 s | — | dissolves one bar per 1.5 s | — | — | — |
| light door / sensor | light counts (amber) | light counts (cyan) | light counts (white) | light counts (green) | light counts; **the brightest (×1.5)** | light counts (blue) | **forces dark** 5 s (opens inverted doors) |
| spark coil | — | — | **+1 charge per hit** (beam: +2 per 0.5 s) | — | — | shorts it out if water covers it (drains all charge) | drains 1 charge per hit |
| dynamo | — | freezes water in it (stops) | spins it for 3 s (level 1) | — | — | **drives it**: a Tide wave through a water wheel = level 1 for 4 s | — |
| lift | — | freezes it 8 s | powers an unpowered spark-lift (like a coil) | — | — | — | — |
| counterweight | burning a side's crate lightens it | freezing water on a side keeps its weight | — | dissolving a metal weight lightens it | — | **adds water** to a side | — |
| winch | burns its rope (drops the load) | freezes it (holds position like a ratchet) | — | dissolves the rope | — | — | — |
| bell | — | muffles it 8 s (rings silently: pulse, no sound wave) | rings it (a metal bell) | — | — | — | — |
| breakable wall | burns rotten wood and wax crust | makes brick **brittle** 6 s (×2 damage taken) | — | **dissolves** brick/metal cells | — | pushes water into it (cracked brick with water behind: bursts at 3× pressure) | — |
| gravity lantern | — | freezes the band's contents | flickers it off 1 s | — | — | — | switches it **off** for 5 s |
| crate | burns (small crate ~6 s) | freezes to the floor (can't be pushed 8 s) | — | dissolves slowly | — | pushes it (a wave floats it) | — |
| oil barrel | **explodes** after 0.8 s | puts out a lit fuse; freezes the oil (thick, no leak 8 s) | **explodes** (spark ignites oil) | leaks it | — | knocks it over (spill) | — |
| fan | blows the fire along the column (a flamethrower) | frozen 6 s | powers an unpowered fan 5 s | corrodes (off) after 3 s | — | — | — |
| steam vent | forces a puff (boils water above) | condenses: off 5 s | — | — | — | floods it: off until boiled | — |
| lamp post / brazier / socket | **lights** | puts out | lights a lamp post for 10 s only (a spark isn't a flame) | — | **lights** | puts out (unless hooded) | darkens 5 s |
| fuse | lights | puts out | lights | — | — | puts out | — |
| release hook | burns its rope | — | — | dissolves its rope | — | — | — |
| pipe | boils the water in it (steam from both ends) | freezes it (blocks 8 s) | electrifies the liquid in it | corrodes a leak | — | pushes flow +50% for 4 s | — |
| mirror | — | — | — | — | reflects Gleam bolts | — | — |

The pole's **lantern touch** (§4.2) gives the same effects as the table at 1-cell scale and only on cells.

---

## 8. Traps

A trap is an entity with a **trigger**, a **telegraph** (a visible/lit warning, per the readable-danger
pillar), an **effect**, and a **reset**. Damage numbers are at Act 1 scale; they grow **+15% per act**
(05-BESTIARY-BOSSES.md uses the same curve for enemies). All traps can be wired as targets (§6) so puzzles
can arm, disarm or fire them.

| # | id | Name | Acts | Trigger | Telegraph | Effect | Reset | Counters |
|---|---|---|---|---|---|---|---|---|
| 1 | `trap_spikes` | spike bed | all | always (static) | pale spikes, lit tips | **15** + knock up 180; the player is returned to the last safe ledge if the spikes are in a pit (−15 hp, no death unless ≤ 15 hp) | — | pogo on them (no damage), cover with a crate/plank, fill the pit with water/sand |
| 2 | `trap_icicle` | falling spike / icicle | 1, 3, 6 | player passes under (a 12-wide trigger column), or a bell's sound wave | shakes 0.4 s, a drip of dust | **20** on hit; 6×16 cells; it becomes rubble cells | regrows 12 s (icicles), no (stone) | Ember melts icicles, a pole hit knocks it down early |
| 3 | `trap_pendulum` | swinging blade | 2, 5 | always | a lit arc painted on the wall showing its swing | **25**, knock 220; period 2.4 s, arc 120°, length 40 | — | Rime freezes it 8 s; cut its rope/chain (chains: Bile only) drops the blade (it becomes a weight) |
| 4 | `trap_crusher` | ceiling crusher | 2, 5 | cycle: down 0.3 s, pause 0.6, up 1.2, pause 1.0 | a red light 0.5 s before each drop; dust | **50** + stagger if caught; instant death if caught with ≤ 8 cells of headroom (a crate or brace **jams** it — crushed over 3 s) | cycle | jam it, Rime-freeze it up, wired off |
| 5 | `trap_darts` | dart wall | 2, 4 | a pressure plate or tripwire | slots in the wall glint when your light touches them | 3 darts, **8** each, 400 cells/s, 0.2 s apart; poison 2/s for 3 s in Act 2 | 2 s | swat, block with a crate, trigger with a thrown object |
| 6 | `trap_flamejet` | oil flame jet | 1, 4 | cycle (on 1.5 / off 2.0) or plate | a pilot flame always burns; hiss 0.4 s before | a 48-cell jet of fire, **18/s** + burn; ignites oil/wood it touches | cycle | Rime puts out the pilot (off until relit), Tide floods the nozzle, cut its oil pipe with Bile |
| 7 | `trap_steamjet` | steam jet | 3, 5 | cycle or when water boils | a whistle 0.5 s before | a 60-cell steam column, **10/s**, pushes 700 | cycle | Rime condenses it; also a lift if you are cooled |
| 8 | `trap_grate` | drop grate | 2 | standing on it 0.4 s | the grate rattles at 0.2 s | opens: you fall to a lower room (a detour, not damage) | 3 s | move fast; a crate on it holds it shut; hook out while falling |
| 9 | `trap_rotplank` | rotten plank | 1, 2, 4 | standing on it 0.6 s | creaks and sags 2 cells | breaks into falling wood cells | no | move fast, brace it with a built brace (§9) |
| 10 | `trap_ratpipe` | rat flood pipe | 2 | player enters a trigger zone | squeaking from the pipe 1 s before, the pipe mouth glows green | a swarm of 40 rats pours out like a liquid, **1** per rat touch (0.25 s per-rat cooldown), they disperse after 8 s | 20 s | light (rats avoid light > 0.3 once the Gutter Lamp is lit), Ember ring, a crate over the pipe mouth, Tide washes them away |
| 11 | `trap_net` | snare net | 2, 4 | tripwire | a thin rope across the path, lit by your lantern at < 30 cells | pins you **1.5 s** (mash to cut 0.5 s faster) and rings a bell (alarm: nearby enemies come) | no | cut the tripwire with the pole, burn it, jump it (it is 2 cells high) |
| 12 | `trap_tripbell` | tripwire alarm | 2, 5 | tripwire | as above | rings a bell: enemies within 300 cells come to the bell; Act 5 cultists get +20% damage for 10 s | no | same as net; Rime-muffle the bell first |
| 13 | `trap_sparkpuddle` | live puddle | 3, 4 | a spark coil wired to a puddle; cycle or plate | the water glints white every 0.5 s while live | anyone in the connected water: **12/s** | cycle | drain it, freeze it (ice doesn't conduct), Shade/Tide the coil |
| 14 | `trap_barrelchute` | barrel chute | 4 | plate at the top | rumbling 1 s, the chute's lamp flashes | 3 rolling oil barrels at 120 cells/s, 1 s apart, **20** each on contact; they explode if they touch fire | 10 s | jump them, light the fuse early so they explode in the chute, freeze them (they stop) |
| 15 | `trap_floodroom` | flood trap | 3 | entering: doors shut behind you | doors slam (sound + light change), pipes gush | water fills the room at **12 rows per second** from 4 pipes; the exit opens when a float switch reaches the top (you swim out) **or** when you close the pipes' valves | on leaving | close valves, freeze pipes, open a drain (Bile the floor grate) |
| 16 | `trap_waxdrip` | wax drip | 1 | cycle (every 1.2 s) | a glowing drop forms 0.4 s | a molten wax drop: **6** + slow; pools and hardens into 1–2 cells of wax (builds terrain over time) | cycle | Rime hardens it mid-air (becomes a platform-building tool), Ember speeds it |
| 17 | `trap_tollrubble` | bell-rubble ceiling | 5 | any bell toll in range | cracks in the ceiling are lit gold | chunks fall: **8–30** by size | no | stand under an arch (marked), kill the ringer, muffle the bell |
| 18 | `trap_gravflip` | gravity snare | 5 | plate | the band's rim lights up 0.5 s before | a gravity band flips on for 3 s (you fall up) | 5 s | read the rim, stand under a ceiling, carry your own gravity lantern to cancel it (overlap = normal) |
| 19 | `trap_cloudfloor` | soaked cloud | 6 | standing 2 s on saturated cloudstuff | it darkens and drips | it turns to falling water | regrows 20 s | Rime freezes it solid, Ember steams it (it rises as a cloud platform for 4 s) |
| 20 | `trap_lure` | false light | 4 | always | a warm lantern glow in the dark... with no lantern | it is an Unlit's lure: walking into the glow triggers an ambush by 2–3 Unlit | no | Lune's trick (lantern out: lures don't fire), Gleam burns the lure |
| 21 | `trap_jaw` | jaw trap | 2, 4 | stepping on it | 4-cell steel jaws, a glint | **14** + rooted 1.2 s | re-arms 5 s | pogo, a thrown crate springs it, Bile |
| 22 | `trap_gust` | gust funnel | 1, 6 | cycle | the rain streaks bend first 0.6 s | wind 180 cells/s sideways for 1.5 s | cycle | crouch (wind response ×0.5 crouched), anchor with the hook |

Counters use the spell rules of §7 and 03-SPELLS.md; every "Rime freezes X for 8 s" is the same `frozen`
status with that duration.

---
## 9. Building

Canon: the **plank kit** arrives in Act 1 mid (Lesson room `a1_drip_gallery`, 01-WORLD-STORY.md §3.1); the
Tinker starts with a "big plank kit" and builds turrets. Parts are paid in **scrap** (08-ITEMS-SHOPS.md owns
drop rates and Clink's blueprint prices).

### 9.1 Build mode

| Rule | Value |
|---|---|
| Enter / leave | toggle key (default **B** / gamepad d-pad down; 02-CONTROLS-UI.md) |
| Time | the game keeps running at full speed (building in a fight is a skill, not a pause) |
| Picking a part | a strip of unlocked parts along the bottom of the screen; mouse wheel / bumpers cycle; number keys 1–9 pick directly |
| Placing | a **ghost** of the part follows the cursor (mouse) or sits 20 cells in front of the player (gamepad; stick nudges it by one grid step); **green** = valid, **red** = invalid with a one-line reason under it ("Needs a solid end", "Too far", "Blocked by water gate") |
| Rotate | **R** / gamepad Y: planks and ladders cycle horizontal → 45° → vertical → −45°; others as listed |
| Confirm | attack button; you can keep moving while it builds |
| Build time | per part (table); the part fills in cell by cell from its anchor end; **it is not solid until finished**; Tinker −30%, Knack −1% per point (04) |
| Build range | **64** cells from the player's hands, with line of sight (Tinker **80**) |
| Grid | parts snap to a **4 × 4 cell grid** aligned to world coordinates |
| Deconstruct | hold interact on your own part for 0.5 s: **100%** scrap back within 5 s of it finishing, **50%** after; nothing for burned/broken parts |
| Part limit | **40** built parts per room in the campaign (Waves mode: 120); at the limit the ghost is red: "Room is full — take something down" |
| Persistence | campaign rooms save their parts (position, rotation, remaining cells); a burned plank stays burned |

### 9.2 Placement rules

1. **Footprint**: the part's cells must not overlap solid cells (terrain, other parts, interactables' cells),
   the player, enemies, NPCs, or items on the floor. They **may** overlap liquids, gases and loose powders,
   which are pushed out into the nearest free cells when the part finishes (so you can build a dam in water).
2. **Support**: each part has an attach rule (table). The ghost checks it live.
3. **No-build zones**: marked with a faint hatched overlay (visible in Inspect): boss arenas (except where
   05-BESTIARY-BOSSES.md allows, e.g. Floodgate-style arenas), NPC hubs, Lesson rooms (except the part being
   taught), inside a gravity band's rim, over a Great Lamp.
4. **Line of sight** from the hands to the part's anchor cell.
5. **No sealing yourself in**: a part that would close the last path between the player and every room exit
   (a flood-fill of free cells, checked on confirm, cost ≈ 1 ms on a 480×270 room) is refused ("That would
   trap you"). Waves mode turns this check off.

### 9.3 Parts

Cell materials (06-PHYSICS-RENDER.md): `plank_wood` (burns, 6 HP/cell, floats), `brace_wood` (as plank),
`rope`, `brick` (16 HP, doesn't burn, Bile dissolves), `metal` (20 HP, conducts Spark), `cloth_sand` (sandbag:
cloth that holds sand cells; burns → spills sand), `glass` (lamp).

| id | Name | Size (cells) | Material | Scrap | Build time | Strength (weight units it holds) | Attach rule | Unlock |
|---|---|---|---|---|---|---|---|---|
| `bp_plank` | Plank | 24 × 2 | plank_wood | **2** | 0.4 s | 4 (cantilever) / 8 (both ends) | **one end** cell adjacent to solid (then it may overhang its full 24); rotations: H, ±45°, V (V = a thin post) | Act 1 mid |
| `bp_brace` | Brace | 12 × 12 triangle | brace_wood | 2 | 0.4 s | adds **+4** to a plank whose free end sits on it | two sides touching solid (e.g. a wall and a floor, or a wall and a plank's underside) | Act 1 mid |
| `bp_crate` | Crate | 10 × 10 | plank_wood | 4 | 0.6 s | — (a weight-1 physics object; can be carried, §2.12) | rests on anything; falls | Act 1 mid |
| `bp_ladder` | Ladder | 6 × 24 (stacks) | plank_wood | 3 | 0.5 s | — | top **or** bottom touching solid or another ladder | Act 2 |
| `bp_long_plank` | Long plank | 40 × 2 | plank_wood | 3 | 0.6 s | 6 | **both ends** on solid | Act 2 |
| `bp_rope_peg` | Rope peg | 4 × 4 peg + a 60-cell rope | metal + rope | 3 | 0.5 s | holds 3 | its back against a solid surface (wall, ceiling, underside of a plank) | Act 2 |
| `bp_pulley` | Pulley | 8 × 8 wheel | metal | 6 | 0.8 s | 6 | mounted on a ceiling or wall; you then **hook** two things (grapple from the pulley: the first hook sets end A, the second end B) to make a counterweight pair (§5.16 rules) | Act 2 |
| `bp_spring` | Spring pad | 10 × 4 | metal | 8 | 0.8 s | — | on a solid floor (or a ceiling inside a gravity band) | Act 3 |
| `bp_float` | Float | 12 × 6 | plank_wood | 5 | 0.6 s | 2 (sinks past that) | placed on or in water; floats | Act 3 |
| `bp_sandbag` | Sandbag | 12 × 8 | cloth_sand | 4 | 0.8 s | 2; **holds back water** (a dam) | rests on solid; stacks | Act 3 |
| `bp_bridge` | Rope bridge | up to 48 × 4 | plank_wood + rope | 10 | 1.5 s | 6 (sags 1 cell per unit) | **both ends** on solid, ≤ 48 cells apart; walkable, grapple-able; rope rails burn (§3.7) | Act 3 |
| `bp_lantern_post` | Lantern post | 4 × 20 | plank_wood + glass | 6 + **5 oil** | 0.8 s | — | on a solid floor | Act 4 |
| `bp_ward` | Ward | 8 × 8 glyph | brick | 10 | 1.0 s | — | any solid surface | Act 4 |
| `bp_stone` | Stone block | 8 × 8 | brick | 6 | 1.0 s | 8; weight 3 | on solid (falls as rubble if the support goes) | Act 5 |
| `bp_anchor` | Hook anchor | 4 × 4 ring | metal | 2 | 0.3 s | — | any solid surface **including metal plates and ice** (it makes an unhookable surface hookable) | Act 5 |
| **Tinker only** | | | | | | | | |
| `bp_turret_1` | Turret Mk I | 10 × 10 | metal | 20 + 30 oil | 1.5 s | HP 45 | on a solid floor; max **2** turrets | Tinker start |
| `bp_spikes` | Spike trap | 16 × 4 | metal | 6 | 0.6 s | — | on a floor | Tinker, Act 2 |
| `bp_turret_2` | Turret Mk II | 10 × 12 | metal | 30 + 30 oil | 1.5 s | HP 70 | as Mk I | Tinker, Act 3 (Clink blueprint) |
| `bp_mine` | Sparkmine | 6 × 3 | metal | 8 | 0.5 s | — | on a floor | Tinker, Act 4 |
| `bp_turret_3` | Turret Mk III | 12 × 14 | metal | 40 + 30 oil | 2 s | HP 100 | as Mk I | Tinker, Act 5 (Clink + escapement plans, 01 §6 #11) |

**What the special parts do**

| Part | Behaviour |
|---|---|
| Spring pad | touching its top launches you at **360** cells/s up (apex ≈ 72 cells) along its facing; launches crates and enemies too; can be placed on a wall (sideways launch 300) |
| Float | a raft; carries the player (1) + one crate; drifts with currents (60% of flow like the player); you can pole-push off walls (80 cells/s impulse) |
| Sandbag | a dam: water can't pass through it; burning its cloth spills its sand (the dam fails) |
| Lantern post | a `lamp_post` (§5.25) that **you** own: lit by lantern touch; radius **50** for **90 s** on its 5 oil; re-light it by paying 5 oil again. Counts as light for light doors; the Unlit avoid its radius (05). |
| Ward | while lit (lantern touch, Gleam or Ember), makes a **40-cell** circle where the Unlit take 10/s and won't enter, for **20 s**; then it is spent (grey) — re-light costs 3 oil |
| Hook anchor | a grapple ring you place: the hook always bites it |
| Turret Mk I | fires the Tinker's **selected wick** at **50%** power, one shot per **1.5 s**, range 160 cells, auto-targets the nearest visible enemy; each shot spends the wick's oil cost from the turret's own **30-oil tank** (not your oil); lasts until the tank is empty or HP 0 |
| Turret Mk II | 70% power, one shot per 1.1 s, 70 HP |
| Turret Mk III | 90% power, one shot per 0.9 s, and its shots gain the `split` charm for free (03-SPELLS.md) |
| Spike trap | 12 damage per contact, 0.5 s per-enemy cooldown; pogo-able |
| Sparkmine | an enemy stepping on it: a Spark burst **30** damage in 20 cells, chains through water |

### 9.4 Built things are real cells

- When a part finishes, its cells are **written into the cell grid** with the part's material and an
  `owner` tag (part id), so every system treats it as world: water flows around it, fire burns it, Bile eats
  it, explosions break it, rain wets it. 06-PHYSICS-RENDER.md owns the materials.
- **Support and collapse.** Built parts obey the same support rule as terrain (06-PHYSICS-RENDER.md "wall
  support spans + collapses"): each part also has a **strength** (table) = weight units it can hold. If the
  weight on it exceeds its strength for 0.5 s, or its attach cells are destroyed, it **creaks for 0.3 s**
  (a visible sag and a sound: fair warning) and its remaining cells become **falling debris** chunks (rigid
  pieces up to 40 cells, 06-PHYSICS-RENDER.md). Debris deals **5 damage per 10 cells** to what it lands on.
- **Burning.** Wood parts ignite from any fire touching them; fire spreads **1 cell per 0.25 s** through
  `plank_wood`; burned cells vanish (become smoke + ash). A plank burning at its anchor end loses support and
  falls — **burning your own bridge** is a real tactic (drop it on enemies under it). Wet wood (rain ≥ 10 s)
  ignites after 1 s of contact instead of at once.
- **Breaking.** Enemies with the `breaker` tag (05) attack parts in their way. Each cell has the material's
  HP; a part loses cells one at a time.
- **Floating.** Wood debris and loose floats float; planks knocked into water become floating chunks you can
  stand on.
- **Freezing.** Rime makes a wood part's cells `frozen` for 8 s: they don't burn and their strength doubles.
- **Conducting.** Metal parts (pulleys, pegs, springs, turrets, anchors) conduct Spark like metal terrain.

---

## 10. Puzzle catalogue

39 puzzles, grouped by act. Every puzzle has an id `P<act>-<n>`, the room it lives in (room ids per
09-MODES-MAP.md; named locations from 01-WORLD-STORY.md §3), the **mechanic it teaches** or tests, a setup
and **every intended solution**. Solutions marked ★ are the "expected" one; the others are there on purpose
for players who think with materials. A puzzle marked **Lesson** is in a Lesson room (no enemies, canon).

Mechanic tags used in the index (§10.7): `move`, `wall`, `wick`, `lob`, `plank`, `ember`, `rime`, `spark`,
`gleam`, `hook`, `rope`, `burn_rope`, `lever`, `timer`, `plate`, `weight`, `charm`, `bile`, `water`, `swim`,
`sluice`, `tide`, `steam`, `dynamo`, `dark`, `oil`, `light_door`, `mirror`, `knot`, `shade`, `explode`,
`gravity`, `bell`, `counterweight`, `clock`, `wind`, `cloud`, `overcharge`, `build`, `multi`.

### 10.1 Act 1 — Lanterncrown & the Wax Stair

**P1-1 · Lantern in the Rain** (`a1_first_step`) — **Lesson** · teaches `move`, `light_door`
- Setup: a door with an eye (`light_door`, threshold 0.6) sits on a ledge 30 cells up across a 36-cell gap.
  The rain gutters lamps, so a lamp post near the door is out.
- ★ Run-jump the gap (36 < 44), climb the ledge (ledge-grab), stand within 10 cells of the eye: your lantern
  alone lights it.
- Alt: light the lamp post with lantern touch; it lights the eye from 20 cells (≈ 0.6) for 60 s.

**P1-2 · The Candle Shelves** (`a1_candlemarket`) — **Lesson** (Wick builder, canon room 3) · teaches `wick`, `lob`
- Setup: six small braziers ("candles") on shelves; lighting all six within **20 s** (an `and` of six into a
  `timer hold 20`, reset if any goes out) opens the chapel stair. Two candles sit behind a lip (a bolt can't
  reach them), two are high (a lob falls short), two are on a swinging sign.
- ★ Build Ember + Bolt for the high ones and Ember + Lob for the lipped ones; swap wicks with the 2 wick slots.
- Alt: climb to each and lantern-touch (possible, but 20 s is tight: needs the roof route).
- Alt: knock the swinging sign into a lit candle with the pole (the sign is wood: it catches and lights its neighbours).

**P1-3 · The Wax Plug** (`a1_drip_gallery`) — teaches `ember`, `rime`, material thinking
- Setup: a 16-wide doorway is plugged with solid wax 24 cells deep. Below the plug is the floor you stand on.
  Melting it floods the floor with molten wax (6 dmg/s, slow).
- ★ Melt it from **above**: climb the wax drips to a ledge over the plug and fire Ember down — the molten wax
  pours down past you.
- Alt: melt it from below and **Rime** the pool as it spreads (hardens it into a ramp you can walk up).
- Alt: build a plank 8 cells above the floor first (after P1-4), stand on it and melt.

**P1-4 · Too Wide** (`a1_drip_gallery`) — **Lesson** (plank kit, canon) · teaches `plank`, `build`
- Setup: a 70-cell gap (running reach is 49) and 6 scrap on the floor. On the far side, a ledge 60 cells up.
- ★ Build a plank sticking out 24 cells from the near edge, run off its end: 24 + 44 > 70.
- Then: two planks as steps up the wall to the 60-cell ledge (each ≤ 34 up from the last).
- Alt: build a crate at the wall, jump on it (+10), then a plank from the crate's top.

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

### 10.2 Act 2 — The Gutterways

**P2-1 · Hookwright's Yard** (`a2_hook_forge`) — **Lesson** (grapple, canon) · teaches `hook`, attach rules
- Setup: a pit 200 wide with grapple rings (bite), a smooth metal plate ceiling (hook bounces off) and a wood beam.
  The plate is right where the obvious swing point would be.
- ★ Swing ring → ring → wood beam, releasing with the pop between.
- The lesson beat: the hook bounces off the metal plate with a clang and Hush chirrs `*no — wood!*`.
- Alt (later, Act 5): place a hook anchor on the plate.

**P2-2 · Pickering's Locks** (`a2_lockhouse`) — **Lesson** (levers/buttons/timed doors, canon) · teaches `lever`, `timer`, `plate`
- Setup: the exit is a `timed_door` (4 s) wired to `or( and(lv_red, lv_blue), plate_a )`. The two levers are
  300 cells apart and the red one is **spring-loaded** (`hold`-style: it flips back after 2 s), so you can't
  flip red, run to blue and still have both on. The door is 400 cells from the red lever.
- ★ Flip blue first (it stays), then flip red and grapple-swing along the room's rope line to the door —
  the `and` fires on red's flip, the door's 4 s timer starts, and the swing gets you there in ≈ 3 s.
- Alt: push the room's crate onto `plate_a` (needs 1): the door stays open while the plate is down. The crate
  sits behind a drop grate, so you have to hook it out first (§3.8 "yank").
- Alt: fire a bolt at the red lever (a hit flips it) from beside the door, then walk through.

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

### 10.3 Act 3 — The Sluice Ward

**P3-1 · The First Cistern** (`a3_first_cistern`) — **Lesson** (swimming, canon) · teaches `swim`
- Setup: a flooded cistern 180 cells deep; breath 12 s; three air pockets on the way down; a valve at the
  bottom opens the exit door (a float switch door would need you to drain first).
- ★ Pocket-hop down (each ≤ 10 s of swimming apart), turn the valve (2 s hold), swim up.
- Alt: stroke-dive straight down (stroke bursts at 90) and back — possible with good timing.

**P3-2 · Top Gate First** (`a3_voss_pumphouse`) — **Lesson** (sluice control, canon) · teaches `sluice`, `water`
- Setup: three chambers stacked like steps, each with a drain gate (`sluice_gate` + lever) into the next one
  down, and the bottom one drains out of the Ward. Above them all, the **top gate** lets the reservoir in —
  and it is open, so the chambers are full and keep refilling. The exit is on the bottom chamber's floor.
- ★ Voss's rule: **deal with the top gate first** — shut the inflow, then open the drains bottom → middle →
  top so each chamber empties into an empty one below. Open a drain while the top gate is still open and the
  chambers just keep refilling, with a 60 cells/s undertow at every open gate (you can survive it; you can't
  get to the exit through it).
- Alt: leave the top gate open but Rime the inflow jet in its gateway — the water there freezes into a plug
  for 8 s — and run all three drains inside that window. Fast and risky.
- Alt: shut the top gate, then Bile a hole low in the bottom chamber's outer wall: it drains straight out of
  the Ward and you skip the lever order.

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

**P3-5 · Raise the Market** (`a3_drowned_market` approach) — teaches `water`, `sluice`, `float`
- Setup: the Drowned Market's door is 160 cells up a dry cistern wall (canon: reachable only when flooded).
  An inflow pipe (valve) and a drain gate (lever).
- ★ Close the drain gate, open the inflow valve; the cistern fills at ~12 rows/s; swim up with the water.
- Alt: stand on a **float** (built) and ride the rising water up.
- Alt: skip the water: steam-ride from the vent in the corner (boil the puddle on it).
- Note: draining this cistern for good is the story choice A3.8 (01-WORLD-STORY.md) — handled by a separate valve.

**P3-6 · Live Water** (`a3_cisterns`) — teaches `spark`, `water`, `multi`
- Setup: a cistern crossing 300 wide with a `spark_coil` that electrifies the water every 2 s
  (`trap_sparkpuddle`, 12/s). Ceiling too smooth to hook (metal plate).
- ★ Rime a path of ice across the surface (ice doesn't conduct) and walk it while it holds (8 s per patch).
- Alt: Shade the coil (drains a charge per hit) until it is dead; swim.
- Alt: Tide-short the coil (cover it with water: drains all charge).
- Alt: build **floats** and pole-push across (wood doesn't conduct).

**P3-7 · Weighing the Flood** (`a3_gauge_tower`) — teaches `weight`, `water`, `plate`
- Setup: a `weighted_plate` needing **3** units opens the tower door. One small crate (1) is available; a pipe
  with a valve spills water into a basin that sits on the plate.
- ★ Put the crate on (1), then open the valve until 160 water cells (2 units) sit in the basin — the dial
  reaches 3/3. Close the valve before the basin overflows (overflow drains weight).
- Alt: freeze the water in the basin (ice keeps its weight and doesn't overflow).
- Alt: stand on it yourself (1) + crate (1) + 80 water cells (1). The plate feeds a `timer hold 3`, so the
  door stays open 3 s after you step off — a fast player can make the door.

### 10.4 Act 4 — Blackwater

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

**P4-7 · Two Buttons, One Moment** (`a4_knot_house`) — **Lesson** (Knots, canon) · teaches `knot`, `timer`
- Setup: two `button`s 160 cells apart on opposite walls, wired to `and` inside a `timer hold 0.2` — they
  must be pressed within 0.2 s. A spark coil in the middle.
- ★ Bolt with Knot `on_hit` = Spark ring: the bolt hits the coil, the ring fires from there and hits both buttons.
- Alt: a `split` charm bolt (two projectiles) from the exact middle.
- Alt: throw a crate at one while a lob lands on the other (hard timing).

### 10.5 Act 5 — The Bellwell

**P5-1 · The Nine Valves** (`a5_drain_valves`) — set piece · teaches `sequence`, `water`, `bell`
- Setup: the Bellwell shaft is drowned (01 A5.1). Nine `valve`s around three galleries feed one drain; a
  `sequence` gate (window 90 s) needs them in the right order; the wrong order resets and floods the gallery
  you're in by 20 rows. Each valve has a small bell beside it; the right order is **lowest note to highest**
  (a mural in the Tithe Hall shows nine bells by size — a second hint).
- ★ Ring each small bell (pole), hear the pitch, turn the valves low → high.
- Alt: Bile the great drain grate at the bottom (a 60-cell dive, 12 s breath: just possible with an air pocket
  on the way) — drains faster but floods the lowest gallery permanently (a shortcut lost).
- Hush chirrs a rising note when you touch the next correct valve if you've found all 12 Silent Bells.

**P5-2 · The Upside Chapel** (`a5_upside_chapel`) — **Lesson** (gravity lanterns, canon) · teaches `gravity`
- Setup: a chapel built on the ceiling of a gallery; the altar (a lamp socket) is on the ceiling 120 cells up.
  A gravity lantern on a plinth.
- ★ Carry the lantern under the altar, switch it on: the band flips you up; walk the ceiling, light the socket.
- Then: the exit is on the floor again — pick the lantern up while standing in its band (you fall to the floor; land with a tuck).

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

### 10.6 Act 6 — The Cloudroot

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

### 10.7 Index by mechanic

| Mechanic | Taught in | Tested again in |
|---|---|---|
| `move` / `wall` | P1-1, P1-5 | P2-6, P6-1 |
| `wick`, `lob` | P1-2 | P2-5, P4-5 |
| `plank` / `build` | P1-4 | P1-3, P1-5, P5-5, P6-6 |
| `ember` / `rime` materials | P1-3 | P3-4, P3-6, P4-4, P6-2, P6-4 |
| `spark` machines | P1-6 | P3-6, P4-7, P6-5 |
| `light_door` | P1-1 | P4-1, P4-2, P4-3 |
| `hook` / attach rules | P2-1 | P2-2, P2-6, P2-7, P5-6 |
| `rope` / `burn_rope` | P2-3 | P2-6, P6-5 |
| `lever`, `timer`, `plate` | P2-2 | P2-4, P3-7, P4-7, P5-3 |
| `charm` | P2-5 | P4-7 |
| `counterweight` / `weight` | P2-7 | P3-7, P5-4 |
| `swim` / `water` / `sluice` | P3-1, P3-2 | P3-5, P3-6, P5-1, P6-3 |
| `tide` / `dynamo` | P3-3 | P6-3, P6-4 |
| `steam` | P3-4 | P3-5, P6-2 |
| `dark` / `oil` | P4-1 | P4-2, P4-4, P4-6 |
| `mirror` | P4-3 | — (Endless rooms) |
| `knot` | P4-7 | P4-5 |
| `shade` | P4-2 | P3-6 (as an alt, from Act 4 revisits) |
| `gravity` | P5-2 | P5-4, P5-6 |
| `bell` / `sequence` | P5-1 | P5-3 |
| `clock` | P5-5 | — |
| `wind` / `cloud` | P6-1 | P6-2, P6-5 |
| `overcharge` | P6-4 | P6-5 |

Multi-solution puzzles that rely on **spell × material** interactions (the pillar-2 showcase): P1-3, P1-6,
P2-3, P2-5, P3-2, P3-4, P3-6, P3-7, P4-2, P4-4, P5-3, P5-5, P6-3, P6-4.

### 10.8 Puzzles in the other modes

- **Trials** (09-MODES-MAP.md) reuse puzzle rooms with a constraint ("P3-6 with no Rime", "P2-3 without
  touching the ground").
- **The Long Descent** builds rooms from chunks (09); each chunk may carry one small puzzle from a pool of
  "micro-puzzles" made from §5 parts: a plate + a timed door, a light door + a lamp post, a spark lift, a
  rope over spikes, a breakable wall + a barrel. Rule: a procedural puzzle must have a solution using only the
  **start kit** of the run's class (a room test checks it, §11).

---

## 11. Authoring and testing puzzles

### 11.1 The `puzzle` block in a room file

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

### 11.2 Tests

| Test | Kind | What it checks |
|---|---|---|
| `tests/wiring.test.js` | node | every room's network: every `in` resolves; no loop without a timer/latch/toggle/counter; every target has at least one source; every gate has the right input count; `wires[]` draws every connection (warning) |
| `tests/movement.test.js` | node | the movement code against `movement.json`: a full jump apex is 34 ± 1 cells; running reach 49 ± 2; coyote and buffer windows are the configured frame counts; a 160-cell fall does no damage and a 240-cell fall does 20% |
| `tests/rope.test.js` | node | a hanging rope of 38 links settles within 2 s and stays within 1% of its length; a burning rope snaps in the configured time; a frozen horizontal rope holds the player |
| `tests/build.test.js` | node | every part's attach rule (valid/invalid placements from a fixture grid); strength overload → collapse after 0.5 + 0.3 s; "no sealing yourself in" refuses the fixture that would |
| `tests/puzzles.spec.js` | Playwright | load each puzzle room, play each replay at 8× sim speed headless, assert the room's exit condition within the replay's length; **every puzzle with ≥ 2 solutions has ≥ 2 passing replays** |
| `tests/traps.test.js` | node | each trap's damage/timing from `traps.json` reaches the entity code (move a number to an odd value and read it back from the module — the playground "dead data" lesson) |

---

## 12. Performance budget and cheap fallbacks

| System | Budget per frame | Fallback flag |
|---|---|---|
| Player movement + collision | 0.1 ms | — |
| Ropes (12 × 38 links × 10 passes) | 0.3 ms | `rope.simple`: straight-line hook, fewer passes (6) |
| Signal network (≤ 64 nodes) | < 0.05 ms | — |
| Entity-owned cells (gates, lifts, crates moving cells) | 0.3 ms (≤ 30 moving entities) | move entity cells only every other frame when > 30 |
| Built parts (≤ 40 per room) | included in the cell sim | — |
| Light-door sensors | read from the light buffer once per 4 frames | — |
| "No sealing in" flood fill | 1 ms, only on a build confirm | skip in Waves |
| Debris chunks | ≤ 40 active; merge into loose cells after 3 s at rest | turn debris straight into sand cells |

Expensive items flagged: the full rope wrap (fallback above); water-driven dynamos and weighted plates need
the fluid sim to report cell counts per region — 06-PHYSICS-RENDER.md provides a per-chamber count; if it
can't, plates count water by sampling their own footprint column (cheap and nearly the same).

---

## 13. Proposed canon changes

None of these rename anything; they are additions 04 / 02 should confirm.

1. **Slide** (run + crouch) is a movement verb for every class (§2.8). It has no invulnerability, so it does
   not step on any dodge 04-CLASSES-PROGRESSION.md might define.
2. Movement traits for classes the canon doesn't specify (§2.16): Sluicewarden (breath 16 s, heavier), Moth
   Oracle **glide**, Ferrywitch **stand on still water**, Bellringer 40-cell bell reach, Tinker build range 80.
   04 owns the final call.
3. **1 m = 16 cells** for the Chimneysweep unlock's "2,000 m on ropes" (canon) — so 32,000 cells swung.
4. Levers appear in Act 1 only as decoration or pre-wired (P1-6); hand-operated puzzles with levers,
   buttons, plates and timed doors begin in Act 2, matching canon §6.
5. Gravity lanterns make weight **signed** inside a flipped band (P5-4). 06-PHYSICS-RENDER.md should use the
   same sign for weighted plates and counterweights.
