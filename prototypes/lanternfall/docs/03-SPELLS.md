# LANTERNFALL — page 03: Spells (the Wick builder)

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> **One line:** a wick is Flame + Shape + up to 3 Charms (+ 1 Knot from Act 4); this page gives every number,
> every rule against every material, every status, the resist model and the compiled "spell plan" the game runs.

Canon (names, ids, unlock acts) comes from `00-OVERVIEW.md` §6 and §8. This page **owns** flames, shapes, charms,
knots, overcharge, burn-in, **statuses**, combos, flame × material reactions and the resist model (00 §3). Other
pages link here for those numbers. Where a value lives in a data file, the file's field shape is owned by
`10-TECH-DATA.md` §5; this page owns the values.

## Contents

1. [Words used on this page](#1-words-used-on-this-page)
2. [The spell formula](#2-the-spell-formula)
3. [Flames (7)](#3-flames-7)
4. [Status effects (the one table)](#4-status-effects-the-one-table)
5. [Shapes (8)](#5-shapes-8)
6. [Charms (8)](#6-charms-8)
7. [Which charm works on which shape](#7-which-charm-works-on-which-shape)
8. [Knots (Act 4+)](#8-knots-act-4)
9. [Overcharge](#9-overcharge)
10. [Burn-in (two tracks)](#10-burn-in-two-tracks)
11. [Light: what every spell emits](#11-light-what-every-spell-emits)
12. [Flames against materials (all 36)](#12-flames-against-materials-all-36)
13. [Combos (8)](#13-combos-8)
14. [Enemy resistances and armour](#14-enemy-resistances-and-armour)
15. [Slots per act, strands, the Strand Case](#15-slots-per-act-strands-the-strand-case)
16. [The Wick builder screen](#16-the-wick-builder-screen)
17. [Balance rules and the balance simulator](#17-balance-rules-and-the-balance-simulator)
18. [Example builds (10)](#18-example-builds-10)
19. [Data: which values live where](#19-data-which-values-live-where)
20. [Code: the compiled spell plan](#20-code-the-compiled-spell-plan)
21. [Tests](#21-tests)
22. [Cheaper fallbacks](#22-cheaper-fallbacks)
23. [v2 changes](#23-v2-changes)
24. [Parked (v2)](#parked-v2)

---

## 1. Words used on this page

| Word | Meaning |
|---|---|
| **Strand** | One building block you own: a Flame, Shape, Charm or Knot strand. Owning a strand is permanent; it is never used up. |
| **Wick** | A spell you have braided from strands and put in a wick slot. The wick-slot keys are in 02. |
| **Core** | The Flame + Shape pair of a wick. |
| **Track** | A burn-in counter. There is one track per flame and one per shape (§10). |
| **Oil** | The spell resource. Max oil and regen come from Draught (04 §4–§5); in the dark regen stops (04 §5). |
| **Power** | The number every damage/heal of a wick is multiplied by. A plain Ember Bolt at level 1 hits for 12 before the character's Wick attribute. |
| **Instance** | One live copy of a spell in the world (one bolt in flight, one rune on a wall). A split bolt makes three instances. |
| **Cell** | One art pixel of the world simulation (06). All sizes and speeds are in cells and cells/s; 1 m = 8 cells. |
| **Hardness** | How hard a cell is to break (§12.1). Anything with **dig ≥ hardness** breaks the cell. |
| **Tick** | One sim step, 1/60 s. Damage-over-time "ticks" are slower and listed per status. |
| **DoT** | Damage over time: a status that hurts every so often (burn, corrode). |
| **Dry wick** | A Guild-braided Tide wick used before the Act 3 Tide lesson: it can move water but cannot make it (§3.3). |
| **Utility score** | What a spell does to the world rather than to enemies: cells changed, water made or moved, fires started or put out, machines worked (§17). |

---

## 2. The spell formula

Every wick is compiled once (when braided, and again when a stat changes) into a flat list of numbers, the **cast
plan** (§20). The steps are always in this order, so two builds with the same strands give the same numbers.

### 2.1 Damage per hit

```
hitDamage = FLAME.power              // base damage, §3.1 (e.g. Ember 12)
          × SHAPE.mult               // §5.1 (bolt 1.00, arc 1.10 …)
          × Π CHARM.dmg              // §6.1, product of the charms' damage multipliers, clamped to [0.35, 1.80]
          × castScale                // see below
          × overchargePower(c)       // §9, 1.00 when not overcharged
          × burnIn                   // §10, flame factor × shape factor, 1.00 … 1.254
```

`castScale` is the part that comes from the character:

```
castScale = (1 + 0.04 × (level − 1))           // character level, 1.00 at L1, 2.16 at L30
          × (1 + wickBonus)                     // Wick attribute, 04 §4 (0.02 per effective point)
          × (1 + gearSpellPct + gearFlamePct)   // gear, 08; a flame-specific % adds to the generic %
```

Then on the target (§14):

```
taken        = hitDamage × (1 − resist[flame] / 100) × armourFactor × (crit ? critMult : 1) × statusAmp
armourFactor = 100 / (100 + max(0, armour − armourPierce))    // Shade ignores armour entirely
statusAmp    = 1.15 if Shocked × 1.5 if Spark vs Soaked × 2 if Gleam vs Unlit × 0.85 if the ATTACKER is Drained
```

Damage is a float inside the sim and **shown** with `shared/format.js` `hp()` (whole numbers). A DoT tick below 1
keeps its remainder so a 0.4-per-tick burn still adds up. `resist: "heal"` is handled in §14.1.

### 2.2 Oil cost

```
oilCost = SHAPE.oil × FLAME.oilMult × Π CHARM.oil × c        (rounded to 0.5; c = the overcharge, 1.00 on a tap)
```

- Beam's cost is **per second while held**; the tether pays its cast cost plus **1 oil per second of upkeep** while
  it exists (§5.9); everything else is per cast.
- Minimum cast cost 2 oil. The product of charm oil multipliers is clamped to **2.50**. A wick whose cost is above
  your max oil still braids; the builder greys it red and names both numbers.
- Casting with too little oil does nothing, plays `ui.fizzle` and flashes the oil bar. There is **no** "cast from
  health".

### 2.3 Timing

```
cooldown = SHAPE.cooldown × Π CHARM.cd × (1 − gearHaste) ;  floor 0.12 s
castTime = SHAPE.castTime × Π CHARM.cast                 ;  0 means "leaves the hand this tick"
```

- Cooldown is **per wick slot**, so the wicks can be cycled. A global **0.10 s** gap sits between any two casts so a
  key mash cannot fire every wick on one frame.
- During `castTime` you can walk (at 60%), not run; jumping or dodging cancels the cast and refunds the oil.
- Melee and casting share nothing: you can pole-swing during a wick's cooldown.

### 2.4 Travel numbers

```
speed    = SHAPE.speed    × Π CHARM.speed     (cells/s)
size     = SHAPE.size     × Π CHARM.size × (1 + 0.25 × (c − 1))   (radius or width in cells, whole cells, min 1)
lifetime = SHAPE.lifetime × Π CHARM.life      (seconds)
reach    = speed × lifetime (travelling shapes; the builder shows it)
```

### 2.5 Light

```
burnLevel      = the HIGHER of the wick's flame track level and shape track level (§10)
lightRadius    = SHAPE.light × |FLAME.lightMult| × (1 + 0.04 × (burnLevel − 1))
lightIntensity = FLAME.lightIntensity × (1 + 0.10 × (burnLevel − 1)) × (c > 1 ? 1 + 0.5 × (c − 1) : 1)
lightColour    = FLAME.colour   (Shade: negative light, §11.3)
```

### 2.6 Worked example

*Ember Bolt with Split + Seek, character level 8, Wick attribute 12, no gear; Ember track at level 2, Bolt track at
level 1.* This is the case `tests/unit/wick.test.js` checks.

| Step | Value |
|---|---|
| Ember power | 12 |
| × bolt mult 1.00 | 12 |
| × split 0.55 (per bolt) × seek 0.90 | 5.94 |
| × castScale (1 + 0.04 × 7) × (1 + 0.02 × 12) = 1.28 × 1.24 = 1.587 | 9.43 |
| × burn-in: Ember L2 1.03 × Bolt L1 1.00 | **9.71 per bolt, 3 bolts** |
| Oil: 8 × 1.0 × split 1.30 × seek 1.15 = 11.96 | **12 oil** |
| Cooldown: 0.35 × 1 × 1 | **0.35 s** |
| Burn per stack: 20% of 9.71 per second | 1.94/s for 3 s |

---

## 3. Flames (7)

### 3.1 Flame numbers

| id | Power | Oil × | Status | Light colour | Light × | Light intensity | Resist key | Arrives (00 §6.2) |
|---|---|---|---|---|---|---|---|---|
| `ember` | 12 | 1.00 | burn | `#ff8a2a` | 1.10 | 1.00 | `ember` | start (every class) |
| `rime` | 10 | 1.00 | chill → frozen | `#6fe3ff` | 1.00 | 0.85 | `rime` | Act 1 |
| `spark` | 11 | 1.10 | shocked + chain | `#fff27a` | 1.20 (flickers) | 1.10 | `spark` | Act 2 |
| `bile` | 8 | 0.90 | corrode | `#8dff4a` | 0.80 | 0.70 | `bile` | Act 2 (optional; shop from Act 2) |
| `tide` | 8 | 0.90 | soaked + knockback | `#3f7bff` | 0.70 | 0.60 | `tide` | Act 3 (Sluicewarden: dry from the start, §3.3) |
| `gleam` | 10 | 1.00 | radiant (dazzled on the Unlit) | `#ffe6b0` | 1.50 | 1.25 | `gleam` | Act 4 (Lamplighter at start; shop from Act 2) |
| `shade` | 13 | 1.25 | drained | `#b25cff` (rim only) | −0.80 (darkens) | 0.50 rim | `shade` | Act 4 |

The exact node that hands each strand over is in **09 §6.0** (the strand and mechanic source table).

Why these numbers: Ember is the yardstick. Rime and Tide pay for their control with less damage. Bile is cheap and
weak up front but strips armour for your melee. Shade is the strongest and priciest, and costs you light in the act
where light is life.

### 3.2 What each flame does besides damage

| Flame | On hit (enemy) | On the world (full rules §12) | Tether version (§5.9) |
|---|---|---|---|
| Ember | +1 burn stack | ignites flammable cells, boils water, melts wax and ice | **Fuse rope**: burns for 6 s then snaps; +50% crossing damage |
| Rime | +1 chill stack (5 = frozen) | freezes water, puts out fire, hardens molten wax and glass | **Ice span**: rigid, walkable on top, not climbable, lasts 20 s |
| Spark | shocked, chains to 2 more | electrifies water, bile and metal; powers machines | **Live wire**: powers a machine at either end while it exists |
| Bile | +1 corrode stack | dissolves brick, metal, bone, glass; turns water to `bile` | **Gut-vine**: sticky, climbable, slows enemies crossing it 40% |
| Gleam | radiant; dazzled on the Unlit; heals allies | afterglow on lit tiles (8 s), clears web and ichor, grows glowmoss, blesses water (§13) | **Light rope**: climbable, lights its whole length, heals allies on it 3/s |
| Tide | soaked + knockback | adds water, pushes loose cells, puts out fire, wets surfaces | **Stream**: a rope of flowing water you swim up (drawn, not water cells) |
| Shade | drained (heal + oil), ignores armour | eats light, rots moss and wood to ash, turns water to `ichor` | **Umbral line**: climbable; you are unseen by the Unlit while on it |

### 3.3 The dry Tide rule (Sluicewarden before Act 3)

The Sluicewarden starts with a Guild-braided **Tide Arc** (04 §6.2), long before Tide arrives for everyone in Act 3.
Until the Act 3 Tide lesson at the Pumpworks (`a3_n02`, 09 §6.0), **every wick braided with the `tide` strand is dry**:

- It **pushes, soaks and knocks back** normally: damage, `soaked`, knockback, putting out fire, cooling molten wax,
  wetting surfaces, and pushing loose cells and **water that already exists**.
- It **cannot create water cells**: the "adds water" reactions (§12.2 air row, the Tide water counts in §5) do
  nothing, and a Tide tether's Stream is drawn but gives nothing to swim in.
- The builder shows a small "dry" drop icon and the tooltip "Guild-braided: moves water, cannot make it (until the
  Pumpworks)".
- The Act 3 lesson "wets" the strand for good: every Tide wick, old and new, makes water from then on.

---

## 4. Status effects (the one table)

This is the only status table in the bible (R20). 05 lists only how monsters **react** to these; 08 lists only item
hooks. "Hit damage" means the final `taken` of the hit that applied the stack (after resist and armour), so
resisted hits make weaker statuses. The v1 `wet` status (05, 08) is **`soaked`**.

| Status (id) | From | Stacks | Per stack / effect | Tick | Duration | Special rules |
|---|---|---|---|---|---|---|
| **Burn** (`burn`) | Ember | max 5 (heavy charm: +2 per hit) | 20% of the applying hit's damage **per second** | every 0.5 s | 3.0 s, refreshed for all stacks on a new stack | Soaked targets cannot burn and lose all burn. Burning enemies ignite flammable cells they touch (1 cell per 0.25 s) and **panic** (05): they run and spread 1 burn stack per second to enemies they touch. |
| **Chill** (`chill`) | Rime | max 5 | −10% move speed and −10% attack speed | — | 4.0 s | At 5 stacks (3 if Soaked) → **Frozen** (bosses → **Numbed**). No chill while Thawing. |
| **Frozen** (`frozen`) | 5 chill; `mud_trap` | — | cannot move or act | — | 1.5 s standard, 1.0 s elite, 2.0 s from `mud_trap`; **never on bosses** | Then **Thawing**. Frozen targets take **Shatter** (§13). A frozen enemy in water is a solid block you can stand on. |
| **Numbed** (`numbed`) | a boss reaching the freeze count | — | −50% move and attack speed | — | 2.0 s | Then **Thawing**. The boss's version of Frozen. |
| **Thawing** (`thawing`) | Frozen or Numbed ending | — | immune to chill | — | 4.0 s | Stops chain-freezing. |
| **Shocked** (`shocked`) | Spark | 1 | takes +15% damage from every source | — | 2.0 s | A target tagged `metal` is also stunned 0.3 s, once per 3 s. |
| *Chain (not a status)* | Spark hit | — | jumps to the nearest un-hit enemy within 48 cells | instant (0.05 s per jump, visible arc) | — | 2 jumps; each jump deals 70% of the previous hit. Split bolts chain separately. Chain reaches the caster only through water (`electrified`, §13). |
| **Corrode** (`corrode`) | Bile | max 6 | −8 armour, −5 to every resist, and a DoT of 10% of hit damage per second | every 1.0 s | 6.0 s, refreshed | A target tagged `shield` loses its shield at 4 stacks. |
| **Radiant** (`radiant`) | Gleam | 1 | revealed (drawn lit through darkness); the Unlit take ×2 Gleam damage and cannot regenerate or hide | — | 5.0 s | Gleam hitting an **ally** (a Tinker turret, an escorted NPC, Hush) heals 60% of the hit instead of damaging it. |
| **Dazzled** (`dazzled`) | a Gleam hit on a target tagged `unlit` | 1 | flees toward the nearest `dark` tile (06 tiers); makes no attacks | — | 2.0 s | Then immune to Dazzled for 4 s. Bosses and `steadfast` targets are never Dazzled. 05 says how each Unlit flees. |
| **Soaked** (`soaked`) | Tide; standing in water ≥ 8 cells deep (refreshed while in it). **Rain never soaks.** | 1 | removes and blocks burn; Spark ×1.5 against it; freezes at 3 chill | — | 5.0 s | Tide knockback is separate: 140 cells/s × (1 − kbResist), ×2 with heavy. |
| **Drained** (`drained`) | Shade | 1 | −15% damage dealt; the target's own light is removed | — | 3.0 s | The caster heals **6%** of each Shade hit and regains **4%** of it as oil. |
| **Dimmed** (`dimmed`) | **player only**: standing in your own Shade field (linger, rune, beam line) | — | your lantern radius −30% | — | while inside | Shown on the HUD: it is the price of Shade. |
| **Staggered** (`staggered`) | a full poise meter (player: 04 §5; monsters: 05's poise values); or knocked into a wall faster than 160 cells/s | — | cannot act; the attack in progress is cancelled | — | player 0.4 s (wall stagger 0.3 s); fodder and standard 0.8 s; heavy and elite 0.6 s; boss **poise break** 1.5 s | Poise empties on stagger and starts refilling 2 s after the last hit (04 §5). A boss poise break gives 4 ticks of hit-stop (04 §2.2). |
| **Knocked out** (`knocked_out`) | a fully charged pole heavy taking a `subduable` target to 1 HP (04 §3) | — | down, harmless, not dead | — | rest of the room | Pays full kill XP and drops loot as a kill; counts toward `knell_spared` (01). Prefab-placed enemies stay down on re-entry like killed ones (00 §13). |

Caps and notes:

- At most 6 different statuses on one enemy at once (the oldest non-control status drops first).
- Durations are ×0.5 on bosses and on enemies tagged `steadfast` (05 names who has it).
- Statuses go to the meter as `kind: 'status'` records and their ticks as `via: 'dot:burn'` / `'dot:corrode'`.

---

## 5. Shapes (8)

### 5.1 Shape numbers

| id | Mult | Oil | Cooldown | Cast time | Speed (cells/s) | Size | Lifetime | Light radius | Hits | Dig |
|---|---|---|---|---|---|---|---|---|---|---|
| `bolt` | 1.00 | 8 | 0.35 s | 0 ms | 320 | radius 2 (a 5×5 blob) | 1.2 s (reach 384) | 26 | first enemy or solid cell | 0 |
| `arc` | **1.10** | **8** | 0.50 s | 80 ms | — | radius 22, 150° sweep | 0.15 s | 34 (flash) | every enemy in the sweep once | 0 |
| `lob` | 1.30 | 10 | 0.70 s | 120 ms | 220 at aim angle, gravity 600 | burst radius 14 | on impact or 2.5 s | 22 in flight, 40 burst | everything in the burst | 1 |
| `beam` | **0.30 per tick**, 10 ticks/s | **20 per second** | 0.30 s after release | 150 ms warm-up | instant | length 140, width 3 | while held, max 4 s | 18 along its length | every enemy on the line, each tick | 0 (1 on wax/ice) |
| `ring` | **1.30** | **10** | 1.20 s | 100 ms | expands 0 → 48 radius in 0.40 s | ring 4 cells thick | 0.40 s | 48 at peak | every enemy the edge passes | 0 |
| `rune` | 1.80 | 12 | 1.00 s | 200 ms | placed on the first surface within 80 cells | 12 wide × 4 tall trigger | arms in 0.5 s, lasts 20 s, max 3 out | 10 idle, 44 when it fires | enemies stepping on it (burst radius 16) | 1 |
| `wave` | **1.25** | 10 | 0.80 s | 60 ms | 150 along the ground | 8 long × 12 tall | 1.6 s (reach 240) | 24 | every enemy it passes once | 0 |
| `tether` | 0.30 per tick, **at most one tick per enemy per 0.5 s** | 15 + **1 per second upkeep** | 2.00 s | 150 ms | instant, anchor up to 120 cells | line width 1, anchors 2×2 | **12 s** default (flame changes it, §3.2), max 2 out | 12 along its length | enemies crossing the line | 0 |

### 5.2 Bolt (`bolt`)

- Travels straight from the lantern tip (the pole's end, 10 cells in front of the player at chest height).
- Not affected by gravity. Stopped by any solid cell of hardness ≥ 1 (sand, ash and rubble let it through, leaving
  a 1-cell hole); water slows it to 40% speed and halves its remaining life (Tide and Rime bolts are exempt).
- On hitting a cell: applies the flame's cell reaction (§12) in a radius of 2.
- Aim: mouse direction or the stick; with no aim input it goes straight ahead.

### 5.3 Arc (`arc`)

- A 150° sweep in front, radius 22, centred on the aim; it lasts 0.15 s. The shape for people who like to be close.
- Knocks back enemy projectiles of size ≤ 3 that it touches (they fly back at 1.0× their speed and now hurt
  enemies). This is the only default "parry" in the game.
- Applies the cell reaction in a thin band on every solid cell under the sweep edge.
- Arc counts as a spell for oil, burn-in and resist, **not** melee (melee is the pole, 04 §3).

### 5.4 Lob (`lob`)

- Leaves at 220 cells/s at the aim angle and falls under its own gravity of 600 (lighter than the world's 900, so
  it reads as "thrown").
- Bursts on the first solid, enemy or liquid contact, or after 2.5 s. Burst radius 14: full damage inside radius 7,
  60% to the edge.
- The burst applies the cell reaction to the cells in 70% of its radius, dig 1.
- In water it does not burst at once: it sinks at 40 cells/s and bursts on the floor or after 1.0 s (useful for a
  steam burst from below, §13).
- A dotted arc preview shows while the cast is held.

### 5.5 Beam (`beam`)

- A line from the lantern out to 140 cells, 3 cells wide, redrawn every tick. Stops at the first solid cell of
  hardness ≥ 2 (burns or melts 1 cell per 0.2 s of contact through anything softer).
- Damages every enemy on the line 10 times a second at 0.30 power per tick = **3.0× flame power per second**, for
  **20 oil per second**, drained each tick. If oil runs out the beam ends.
- Warm-up 150 ms (a thin flickering line, no damage). Max 4 s held, then a forced 0.30 s cooldown; releasing earlier
  starts the same cooldown.
- While beaming you walk at 40% speed and cannot jump. You can turn freely.
- Beam cooks the world fastest: a held Ember Beam on a water surface boils cells every tick (§12.2).

### 5.6 Ring (`ring`)

- Expands from the player's centre from radius 0 to 48 in 0.40 s. Hits each enemy once as the edge passes.
- Pushes enemies outward 80 cells/s (Tide: 200) and **destroys enemy projectiles** it touches.
- Every loose cell (powder, liquid or gas) the edge passes is pushed 3 cells outward: a Tide Ring in a puddle throws
  the puddle away from you (a dry Tide Ring still does this, §3.3).
- Gleam Ring also heals the caster 40% of its base damage (once per cast, not per enemy).

### 5.7 Rune (`rune`)

- Cast: a glyph is placed on the first solid surface (floor, wall **or** ceiling) along the aim, up to 80 cells
  away. Its trigger box is 12 cells wide and 4 cells deep into the air from the surface. No surface in reach: the
  cast fizzles.
- Arms after 0.5 s (dim → bright). An enemy touching the trigger sets it off: burst radius 16, full power.
- Lasts 20 s. At most 3 runes per character; a 4th removes the oldest (it fizzles, no burst).
- A rune also fires if its surface cell is destroyed, or if the player's melee hits it (manual detonation).
- Runes are what puzzles use: a Spark Rune on a machine plate powers it every time something steps on it; a Rime
  Rune beside a waterfall freezes it when a rat walks by. Traps hit anything (00 §13), and so do your runes' bursts
  on enemies lured over them (05 lure rule).

### 5.8 Wave (`wave`)

- Spawns on the ground under the player and travels along the surface at 150 cells/s, 8 cells long and 12 tall.
- Follows the ground: climbs steps up to 3 cells high, goes down any drop up to 12 cells, and **stops** at a
  higher wall step or a deeper drop (it breaks into sparks).
- On water it rides the surface (a Tide wave: +50% speed and pushes the surface water ahead of it).
- Passes through every enemy it meets, hitting each once.
- Cast in the air, it drops at 400 cells/s until it meets ground, then runs.

### 5.9 Tether (`tether`)

The tether is the spell that is also a tool: **it makes a climbable rope**.

- **Anchor A**: an invisible probe along the aim up to 120 cells sticks to the first solid cell of hardness ≥ 1. If
  nothing is hit, the cast fizzles and refunds its oil.
- **Anchor B**: the nearest solid cell within 8 cells of the player's feet or hands at cast time. If there is none
  (you are in mid-air), B is the player: you are **attached** and swing from A like a grapple rope (07 covers
  rope physics; tethers use the verlet rope, the player's hook uses the wrap list). Casting again while attached
  drops you and pins B to your position if a solid is within 8 cells; otherwise the tether ends.
- The line is a rope entity. Tethers between two solid anchors are taut. Climb at the rope climb speed (07); jump off
  like any rope.
- **Damage**: 0.30 power per tick to any enemy whose body crosses the line, **at most one tick per enemy per 0.5 s**,
  plus the flame's status. Enemies that cannot fly treat an Ember, Spark or Bile tether as a wall and path around
  it if they can (05).
- **Cost while it lives**: 1 oil per second of upkeep on top of the cast cost. If you cannot pay, the tether ends.
- **Lifetime**: 12 s by default; the flame changes it (§3.2: fuse 6 s, ice span 20 s). Max 2 tethers per
  character; a 3rd removes the oldest.
- If either anchor cell is destroyed the tether snaps and falls as loose `rope` cells (1 per 4 cells of length).
- A tether counts as a "hit" for the `on_hit` knot at most once per enemy per second.

---

## 6. Charms (8)

### 6.1 Charm numbers

"—" means 1.00 (no change). Where each charm strand drops is in 09 §6.0; the act below is when it can first appear.

| id | Name | What it does | Dmg × | Oil × | Cooldown × | Speed × | Size × | Life × | Other numbers | Arrives |
|---|---|---|---|---|---|---|---|---|---|---|
| `split` | Split | 3 instances fanned ±12° | 0.55 each | 1.30 | — | — | 0.80 | — | changed meaning on 5 shapes (§7) | Act 2 (`a2_n06`) |
| `bounce` | Bounce | rebounds off solids and enemies | full on the first hit, then ×0.85 per bounce (compounding) | 1.15 | — | — | — | — | 2 bounces; an enemy bounce picks the nearest other enemy within 60 cells | Act 2 |
| `heavy` | Heavy | slow, hard-hitting, digs | 1.50 | 1.30 | 1.25 | 0.60 | 1.20 | — | knockback ×2, dig +1, burn/chill/corrode +1 extra stack per hit | Act 2 |
| `swift` | Swift | fast and cheap to repeat | 0.85 | — | 0.70 | 1.60 | — | — | cast time ×0.5 | Act 2 |
| `linger` | Linger | leaves a field where it ends | field: 25% of hit damage per second | 1.25 | — | — | — | — | field 3.0 s; radius 6 for a bolt, otherwise the larger of 8 and 0.7 × the shape's size; applies the flame's status each second | Act 3 |
| `seek` | Seek | homes on the nearest enemy | 0.90 | 1.15 | — | — | — | 1.25 | turn rate 240°/s, acquire cone 90° and 90 cells, retargets once | Act 3 |
| `echo` | Echo | the spell casts itself again | — | 1.35 | 1.10 | — | — | — | a free copy 0.35 s later from the same place and aim at 60% power; the copy does not echo | Act 5 |
| `volatile` | Volatile | explodes at the end | — | 1.20 | — | — | — | — | end burst radius 16, 60% damage, dig 2; hurts you for 25% if you are inside it | Act 5 |

Only **split, bounce, echo and volatile** change meaning by shape (§7). The other four always mean exactly what this
table says.

### 6.2 Stacking rules

1. **One of each.** A wick cannot hold the same charm twice.
2. **Multipliers multiply.** Damage, oil, cooldown, speed, size and lifetime multipliers all multiply together.
3. **Order does not matter**, except Split and Echo, resolved in a fixed order: Split first (makes N instances), then
   Echo (copies the whole cast, all N instances, once).
4. **Per-instance effects** (bounce, seek, linger, volatile) apply to every instance, including split copies and the
   echo copy.
5. **Damage clamp**: the product of charm damage multipliers is clamped to **[0.35, 1.80]**.
6. **Oil clamp**: the product of charm oil multipliers is clamped to **2.50**.
7. **Shade's drain** (§4) is never capped: it is Shade's whole point.

### 6.3 Charm × charm table

✔ = works as written. ✗ = not allowed (the builder refuses and says why). **!** = allowed with the rule below.

| | split | bounce | linger | heavy | swift | seek | echo | volatile |
|---|---|---|---|---|---|---|---|---|
| **split** | — | ✔ | ! a | ✔ | ✔ | ! b | ! c | ! a |
| **bounce** | ✔ | — | ✔ | ✔ | ✔ | ! e | ✔ | ! f |
| **linger** | ! a | ✔ | — | ✔ | ✔ | ✔ | ! a | ! h |
| **heavy** | ✔ | ✔ | ✔ | — | **✗** | ✔ | ✔ | ✔ |
| **swift** | ✔ | ✔ | ✔ | **✗** | — | ✔ | ✔ | ✔ |
| **seek** | ! b | ! e | ✔ | ✔ | ✔ | — | ✔ | ✔ |
| **echo** | ! c | ✔ | ! a | ✔ | ✔ | ✔ | — | ✔ |
| **volatile** | ! a | ! f | ! h | ✔ | ✔ | ✔ | ✔ | — |

(The letters keep their v1 names; d, g and i went with the parked charms.)

- **a. Field cap.** At most 4 linger fields and 4 volatile bursts from one cast (split + echo would otherwise make 6).
  A target standing in two of your fields from the same wick takes only the stronger.
- **b. Split + seek.** Split instances pick **different** targets if there are enough; otherwise they share.
- **c. Split + echo.** The echo copies all three split instances, each at 60%: total 3 × 0.55 + 3 × 0.55 × 0.60 =
  **2.64×** for oil ×1.755. Strong and expensive on purpose.
- **e. Bounce + seek.** After a bounce the instance re-acquires a target (that is its one retarget).
- **f. Bounce + volatile.** The volatile burst happens only at the end of life, not at each bounce.
- **h. Linger + volatile.** The burst happens first, then the field is left in the burst radius (16).
- **✗ Heavy + swift**: opposites.

---

## 7. Which charm works on which shape

✔ = the charm's plain meaning (§6.1). **✗** = cannot be braided. **!** = changed meaning, listed below. Only split,
bounce, echo and volatile have changed meanings.

| Charm \ Shape | bolt | arc | lob | beam | ring | rune | wave | tether |
|---|---|---|---|---|---|---|---|---|
| `split` | ✔ 3 bolts ±12° | ! 1 | ✔ 3 lobs at −10/0/+10° | ! 2 | ! 3 | ! 4 | ! 5 | **✗** |
| `bounce` | ✔ | **✗** | ! 6 | ! 7 | **✗** | **✗** | ! 8 | **✗** |
| `linger` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | **✗** |
| `heavy` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `swift` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `seek` | ✔ | **✗** | ✔ | **✗** | **✗** | **✗** | **✗** | **✗** |
| `echo` | ✔ | ✔ | ✔ | **✗** | ✔ | ! 9 | ✔ | **✗** |
| `volatile` | ✔ | **✗** | ! 10 | ! 11 | **✗** | ✔ | ✔ at the end of its run | ! 12 |

Changed meanings:

1. **Split arc**: three sweeps at 0°, +30° and −30° from the aim, each 90° wide.
2. **Split beam**: the beam forks into 3 thinner beams (width 1) at ±8°, each 0.55 power per tick.
3. **Split ring**: 3 rings expanding one after another, 0.1 s apart, each at 0.55.
4. **Split rune**: places 3 runes 14 cells apart along the surface; they count against the 3-rune cap.
5. **Split wave**: 3 waves: one forward, one backward, one forward 0.2 s later.
6. **Bounce lob**: bounces off solids instead of bursting, and bursts on the last bounce or at the end of its life.
7. **Bounce beam**: reflects once off the first solid it hits (total length still 140), 85% after the bounce.
8. **Bounce wave**: at a wall it turns around instead of breaking (twice).
9. **Echo rune**: the rune fires twice, 0.35 s apart, the second at 60%.
10. **Volatile lob**: one bigger burst, radius 22, instead of the normal burst plus a second one.
11. **Volatile beam**: on release the far end of the beam bursts: radius 16, 60% of one second of beam damage.
12. **Volatile tether**: both anchors burst (radius 16, 60%) when the tether ends.

A tether takes heavy and swift with their plain numbers only; linger, seek, split, bounce and echo cannot go on it.

---

## 8. Knots (Act 4+)

A Knot ties a **child wick** to the main wick. When the trigger happens, the child fires from the trigger point. The
knot slot (one per wick) opens at the Act 4 Knot House lesson (`a4_n02`), which teaches both knots.

### 8.1 Triggers

| id | Name | Fires when | Where the child spawns | Aim of the child | Caps |
|---|---|---|---|---|---|
| `on_hit` | Hitknot | an instance hits an enemy | the hit point | continues the parent's direction (arc/ring: away from the caster) | at most 1 per instance per 0.25 s; at most 3 children per instance |
| `on_kill` | Deathknot | an instance's damage kills an enemy (including its burn/corrode ticks within 3 s) | the enemy's centre | toward the nearest other enemy within 120 cells, else straight up | at most 3 children per instance |

### 8.2 The child wick

- The child is braided in the knot slot: **Flame + Shape + at most 1 Charm**, from strands you own. It cannot hold
  Echo or Split (the builder hides them in the child's charm row).
- **Child power** = its own formula × **0.60** × the trigger's power extra (§8.3).
  **Child oil** = its own oil cost × **0.50** × the trigger's oil extra, paid **when it fires**. Without the oil it
  does not fire (a small grey puff; `ui.fizzle` at most every 0.5 s).
- The child uses the burn-in levels of **its own** flame and shape, and its oil trains those two tracks (§10). It
  never overcharges.
- **Depth 1 only.** A child is always a leaf: children never trigger knots. The compiler refuses anything deeper.
- One cast may spawn at most **12 children** in total (split instances and the echo copy included). A spent budget
  shows as a crossed-out knot icon over the parent in the meter tooltip.
- **Turret shots never trigger knots** (the Tinker's turret fires your wick's flame, 04 §10.3). Echo copies do,
  within the caps.
- Children are a separate meter source: `via: 'knot:<parentWickId>'`, name "Ember Bolt ↳ Spark Ring".

### 8.3 Knot numbers per trigger

| Trigger | Child power extra | Child oil extra | Notes |
|---|---|---|---|
| on_hit | × 1.00 | × 1.00 | the common one |
| on_kill | × 1.30 | × 0.80 | rewards finishing; chains through packs |

Final child power = base child formula × 0.60 × trigger extra. (The Moth Oracle node `mo_c5` raises 0.60 to 0.70
and the capstone `mo_c7` changes the caps, 04 §14.4.)

---

## 9. Overcharge

**Input: hold `cast`** (02 owns the key). A press shorter than **0.18 s** is a normal tap. Held longer, the wick
starts charging: the lantern swells and a charge ring around the player fills; release `cast` to fire.
The accessibility option "Overcharge needs a key" (02) moves charging onto a held modifier instead.

**Unlock:** Act 2, the Charmwife's Niche (`a2_n06`), together with charm slot 1. The gutter roll is on from the
first charge. Before `a2_n06`, holding `cast` just taps.

### 9.1 The curve

`c` is the oil multiplier. From the moment charging starts it rises linearly from **1.00 to 2.00 over 1.2 s**
(0.833 per second).

```
overchargePower(c) = 1 + 0.80 × ((c − 1) ^ 0.7)
overchargeOil      = c
```

| c (oil ×) | Hold time after charging starts | Power × | Power per oil vs tap | Zone |
|---|---|---|---|---|
| 1.00 | tap (< 0.18 s press) | 1.00 | 100% | tap |
| 1.20 | 0.24 s | 1.26 | 105% | safe |
| 1.30 | 0.36 s | 1.34 | 103% | safe |
| **1.40** | 0.48 s | **1.42** | 101% | **safe line** |
| 1.60 | 0.72 s | 1.56 | 97% | danger |
| 1.80 | 0.96 s | 1.68 | 93% | danger |
| 2.00 | 1.20 s | 1.80 | 90% | full |

Overcharge is **never** much more oil-efficient than tapping: it buys *burst* (one big hit, one big status stack,
bigger lob/ring/rune/volatile bursts: size × `1 + 0.25 × (c − 1)`, up to +25%) and more light (§2.5), not sustained
damage.

- At c = 2.00 you may keep holding for **0.8 s** (a mastered wick: **2.0 s**); then the wick fires by itself.
- If your oil cannot pay for more, c stops rising at what you can pay.
- **Beam and tether do not overcharge** (beam's hold is its fire button); the builder says "no overcharge".

### 9.2 The safe line and guttering

- **Safe line = 1.40.** The Lamplighter's board node `ll_b4` Guild Temper adds +0.10 (04 §8.4), so the highest safe
  line in the game is **1.50**. Nothing else moves it.
- Releasing at or below the safe line: always fine. Releasing above it rolls a **gutter chance**:

```
gutterChance = 0.60 × ((c − safe) / (2.00 − safe)) ^ 2
```

| c | chance (safe 1.40) | chance (safe 1.50) |
|---|---|---|
| 1.50 | 1.7% | 0% |
| 1.60 | 6.7% | 2.4% |
| 1.80 | 26.7% | 21.6% |
| 2.00 | 60% | 60% |

- The ring turns from gold to red past the safe line and ticks audibly (`ui.tick`, pitch rising), so it reads
  without numbers.

### 9.3 What a gutter does

- The spell **bursts in your hand** instead of leaving it: a burst centred on the lantern tip, radius
  `8 + 8 × (c − 1)` cells, using the wick's flame.
- **You** take 40% of the spell's hit damage (reduced by your own resist to that flame, not by armour). Enemies in
  the radius take 100%.
- The oil is spent. **All wicks** lock out for **1.5 s** ("your hand is scorched").
- The flame's cell reaction happens at your feet: Ember: you stand in fire. Rime: frozen to the floor 0.5 s.
  Spark: you are Shocked 2 s. Bile: a small `bile` pool. Tide: knocked back 140 cells/s. Gleam: a 0.3 s white
  flash that **heals** you 10% instead of hurting. **Shade: your lantern goes out** and stays out until you relight
  it by the **last-drop rule** (07: at a lamp-post, at a lit `lamp_socket`, or by striking any burning cell with the
  pole). For the Moth Oracle challenge this counts as the lantern going out (04 §16.5).
- Logged to the meter as damage taken, `via: 'gutter:<wickId>'`.

### 9.4 Mastery (Act 6)

At the Empty Socket (`a6_n02`) the player picks **one wick** to be **mastered**. A mastered wick **cannot gutter**
(any c up to 2.00 is safe) and **holds full charge for 2.0 s** instead of 0.8 s. The builder draws it with a gold
border. The mastery moves to another wick **at any lamp-post, free** (a lamp-post menu action, 02).

---

## 10. Burn-in (two tracks)

Burn-in rewards using a flame and a shape, not one exact pairing (R38). There are **15 tracks**: one per flame (7)
and one per shape (8). **Every oil spent through a wick counts toward both its flame's track and its shape's
track.** Each track has 5 levels.

| Track level | Oil spent on that track to reach it | Power × (per track) | Look (by the wick's higher level) |
|---|---|---|---|
| 1 | 0 | 1.00 | plain |
| 2 | 200 | 1.03 | slightly brighter core |
| 3 | 600 | 1.06 | + trailing embers of the flame colour |
| 4 | 1,500 | 1.09 | + the lantern on the pole gains a coloured glass pane |
| 5 | 3,500 | 1.12 | + the wick's name gets a gold border |

```
burnIn    = (1 + 0.03 × (flameLevel − 1)) × (1 + 0.03 × (shapeLevel − 1))     // 1.00 … 1.12 × 1.12 = 1.254
burnLevel = max(flameLevel, shapeLevel)                                       // used for light (§2.5) and the look
```

00 rounds "both tracks full" to "+24%"; the exact product is ×1.254. A new pairing of two used parts starts
half-trained or better.

Rules:

- Changing charms or the knot never touches burn-in; switching flame or shape just reads the other tracks.
- A knot child's oil trains the child's own flame and shape tracks. Oil spent on a gutter counts. Beam oil counts
  as it drains.
- **Strand Dust** (08) seasons **one track**: +25% of the oil that track needs for its next level. Price and limits
  are 08's.
- The builder shows **two bars**, flame and shape (02 §15).
- In the Long Descent and Daily, tracks are per run and start at level 1 (the Guild Hall unlock `gh_old_habits`
  starts every track at level 2, 09).
- Build note: `js/spells/wick.js` still carries the v1 thresholds (400 / 1,200 / 3,000 / 7,000); M7 changes them to
  this table.

---

## 11. Light: what every spell emits

The light system itself (the GPU light map, the CPU light grid at 1/8 resolution that is the gameplay truth, the
tiers, bloom, reflections) is 06's. This section says **what spells put into it**.

### 11.1 Light sources per shape

| Shape | Light while alive | Light at the end |
|---|---|---|
| bolt | point light at the head, radius per §2.5 (26 base) | flash radius ×1.5 for 0.15 s |
| arc | a 150° wedge light, radius 34, 0.15 s | — |
| lob | point radius 22, plus a faint trail | burst flash radius 40, 0.25 s |
| beam | a line light: 1 point every 12 cells along the beam, each radius 18 | — |
| ring | a ring light at the edge, radius 48 at its peak | — |
| rune | radius 10 idle, pulses every 1.5 s | burst radius 44, 0.3 s |
| wave | radius 24, moving with the wave | — |
| tether | 1 point every 16 cells, radius 12 | — |
| linger field | radius = field radius + 8, flickering, 60% intensity | — |

Gleam adds **afterglow**: every tile of the CPU light grid that a Gleam spell's light reached at ≥ 0.5 keeps a faint
gold light (intensity 0.2) for **8 s**. This is why Gleam "lights dark areas longest" (00 §8).

### 11.2 Light budget

- Max **64 dynamic spell lights** at once; past that, the weakest lights within 24 cells of each other merge into
  one. Beam and tether point lights count 1 each.
- Flicker by flame: Ember ±12% at 8 Hz, Spark ±35% random at 20 Hz with 1-frame white pops, Rime steady, Bile slow
  pulse ±15% at 1 Hz, Gleam steady ±4% at 4 Hz, Tide ripple ±10% at 3 Hz, Shade (rim) ±20% at 2 Hz.

### 11.3 Shade's negative light

Shade subtracts light: a Shade spell writes `−0.8 × radius` of darkness into the light map and the CPU grid, clamped
so the room never drops below its floor of **0.08** (00 §13). The instance is drawn with a thin violet rim that is
always lit (pillar 5: your own spell is always readable). Uses: hide from the Unlit (they hunt light, 05), put out
enemy lanterns, walk past light-sensitive guards. Cost: while your own Shade field is on you, you are **Dimmed**.

### 11.4 Lighting the world with spells

- Spells light rain streaks and wet surfaces in their colour through the normal light map; nothing special.
- A **`lamp_socket`** (07) takes a flame: hit an unlit one with any spell and it burns in that flame's colour for
  120 s (Gleam 300 s). Tide and Shade put it out. A lit socket is a relight point for the last-drop rule.
- A **`light_door`** (07) opens when light of its named colour at the `bright` tier (≥ 0.8 on the CPU grid) falls on
  its eye for 1 s.

---

## 12. Flames against materials (all 36)

Pillar 2: every flame has a rule against every material. The material list is **built and fixed at 36**
(`data/materials.json`, 06 owns the cell rules). Names from v1 map as: slag → `rust`, gravel → `rubble`,
soot → `ash`, frost → an `ice` skin, poison water → `bile`, black water → `ichor`; **lampstone is not a material**:
it is any solid cell with the grid's `PINNED` flag (drawn with a brass rim), and **no flame and no dig affects a
pinned solid**. `bedrock` is never touched either. Flesh, void and blessed water are not materials (corpses are
entities; blessed water is a zone, §13).

### 12.1 Material reference (what spells need)

"Dig" is the hardness a burst needs to break the cell (§12.3); "—" means dig never breaks it (liquids, gases, and
the few powders the explosion code handles instead, 06 §13).

| id | Material | Kind | Dig hardness | Burns (ignites next to fire) | Notes for spells |
|---|---|---|---|---|---|
| 0 | `air` | empty | — | — | Tide makes water here; Ember and Spark throw sparks into it |
| 1 | `bedrock` | solid | never | no | nothing affects it |
| 2 | `stone` | solid | 4 | no | the default wall; breaks to `rubble` |
| 3 | `brick` | solid | 3 | no | city walls; Bile eats it |
| 4 | `metal` | solid | 5 | no | conducts Spark; Bile rusts it |
| 5 | `glass` | solid | 2 | no | see-through; breaks to `sand`; melts at 1,200 °C |
| 6 | `wood` | solid | 2 | yes | beams, doors; burns to `ember` and `ash` |
| 7 | `plank` | solid | 2 | yes | built parts (07); burns away |
| 8 | `wax` | solid | 1 | slowly | Act 1 everywhere; melts at 60 °C to `molten_wax` |
| 9 | `ice` | solid, slippery | 2 | no | melts to `water`; frozen falls are ladders |
| 10 | `moss` | solid growth | 1 | fast | |
| 11 | `glowmoss` | solid growth | 1 | fast | glows faintly |
| 12 | `rope` | solid strand | 1 | yes | climbable; burns away |
| 13 | `web` | solid strand | 0 | very | slows; Gleam clears it |
| 14 | `bone` | solid | 2 | no | breaks to `ash` |
| 15 | `cloudstuff` | solid | 3 | only after the Rain stops | the cloudroot of Act 6 |
| 16 | `dirt` | powder | 1 | no | Tide turns it to `mud` |
| 17 | `sand` | powder | 0 | no | heat makes glass (`glassblow`, §13) |
| 18 | `silt` | powder | 1 | no | flows easily |
| 19 | `ash` | powder, light | 0 | no | blown by rings and wind |
| 20 | `rubble` | powder | 0 | no | broken stone and brick |
| 21 | `ember` | powder, hot | — | (already hot) | cools to `ash` |
| 22 | `water` | liquid | — | no | conducts; boils; freezes |
| 23 | `oil` | liquid, floats | — | very | lamp oil (`burning_slick`, §13) |
| 24 | `molten_wax` | liquid, hot | — | slowly | hurts while molten; cools to `wax` |
| 25 | `bile` | liquid | — | no | hurts things in it; conducts Spark; boils to `miasma` |
| 26 | `ichor` | liquid, dark | — | barely | drinks light; boils to `smoke` |
| 27 | `mud` | liquid, slow | — | no | slows you; Rime makes it `dirt` (`mud_trap`) |
| 28 | `molten_glass` | liquid, very hot | — | no | cools to `glass` |
| 29 | `steam` | gas | — | no | rises; lifts the player; cools to `water` |
| 30 | `smoke` | gas | — | no | blocks sight |
| 31 | `miasma` | gas | — | yes | burns in a flash |
| 32 | `fire` | fire | — | — | the burning cell |
| 33 | `spark` | fire | — | — | a short-lived spark |
| 34 | `rust` | powder | 0 | no | dissolved metal |
| 35 | `salt` | powder | — | no | brine salt |

Two cell flags matter to every row: **burning** (any cell on fire; Rime and Tide clear it) and **wet** (Tide and
rain set it; 06 decides what it changes).

### 12.2 The matrix

Read a row as "this flame hits cells of this material". Chances are **per cell per hit**, inside the impact radius
(bolt 2; a burst uses 70% of its damage radius; beam every tick along its line). The outer 30% of any radius rolls a
50% chance to be skipped. At most **400 cells** change per hit. "—" = nothing happens.

| Material | Ember | Rime | Spark | Bile | Gleam | Tide | Shade |
|---|---|---|---|---|---|---|---|
| `air` | 8% → `fire` (a spark of flame) | — | 3% → `spark` | 4% → a `bile` drop | — (light only) | **adds water**: 6 cells per bolt hit, 40 per burst (dry Tide: none) | — |
| `bedrock` | — | — | — | — | — | — | — |
| `stone` | heats, dries the surface | cools; a **wet** surface gets a 1-cell `ice` skin | — | — | afterglow (§11.1) | wets | — |
| `brick` | heats, dries | cools; wet → `ice` skin | — | **35% → `rubble`** | afterglow | wets | — |
| `metal` | heats (hot metal hurts to touch, 06) | cools; wet → `ice` skin | **electrifies** the connected metal (§13 `electrified`); machines on it power up | **20% → `rust`** (grates open, locks break) | — | wets | — |
| `glass` | heats (sustained → `molten_glass`) | — | — | **20% → `sand`** | — | wets | — |
| `wood` | **60% ignites** | puts out burning; wet → `ice` skin | 15% ignites | — | — | puts out burning; wets | **25% → `ash`** |
| `plank` | **60% ignites** | puts out burning | 15% ignites | — | — | puts out burning; wets | — |
| `wax` | **80% → `molten_wax`**, 20% ignites instead | — | — | — | — | — | — |
| `ice` | **melts 100% → `water`** | — | — | — | — | — | — |
| `moss` | **ignites** | puts out burning | — | **50% → `dirt`** | **20% → `glowmoss`** | puts out burning; wets | **80% → `ash`** |
| `glowmoss` | **ignites** | puts out burning | — | **50% → `dirt`** | — | puts out burning; wets | **80% → `ash`** |
| `rope` | **ignites** (burns away; the rope snaps) | puts out burning | — | — | — | puts out burning; wets | — |
| `web` | **ignites** | — | **ignites** | — | **clears it → `air`** | wets | — |
| `bone` | heats | — | — | **25% → `ash`** | — | wets | — |
| `cloudstuff` | **ignites only after the Rain stops** (`cs_rain_stops`, Act 6: "Ember finally burns cloudroot") | — | — | — | — | wets | — |
| `dirt` | dries | — | — | — | — | **30% → `mud`** | — |
| `sand` | **heats** (+90 per touch; held under Ember it reaches 1,200 °C → `molten_glass`: `glassblow`) | — | 5% → `glass` | — | — | wets (wet sand packs, 06) | — |
| `silt` | dries | — | — | — | — | wets | — |
| `ash` | — | — | — | — | — | wets | — |
| `rubble` | — | — | — | — | — | wets | — |
| `ember` (hot coal) | — | **cools → `ash`** | — | — | — | puts out | — |
| `water` | **30% → `steam`** (feeds `steam_burst`) | **freezes 100% → `ice`** (player-made ice is flagged `BUILT`) | **electrifies** the connected body (`electrified`) | **30% → `bile`** | **blesses** it: `blessed_water` field (§13) | — (adds more beside it via the air row) | **15% → `ichor`** |
| `oil` | **ignites** (`burning_slick`) | puts out burning oil | **ignites** | — | — | puts out burning oil only where water covers it | — |
| `molten_wax` | — | **→ `wax` at once** | — | — | — | **→ `wax` at once** | — |
| `bile` | — | — | **electrifies** the connected pool | — | — | — | — |
| `ichor` | — | — | — | — | **clears it → `air`** | — | — |
| `mud` | — | **→ `dirt` at once** (`mud_trap`) | — | — | — | — | — |
| `molten_glass` | — | **→ `glass` at once** | — | — | — | — | — |
| `steam` | reheats: steam life extended | **condenses → `water`** (steam that came from water) or vanishes | — | — | — | — | — |
| `smoke` | — | — | — | — | — | — | — |
| `miasma` | **ignites** (a flash fire) | — | **ignites** | — | — | — | — |
| `fire` | — | **→ `air`** (put out) | — | — | — | **→ `air`** (put out) | — |
| `spark` | — | — | — | — | — | — | — |
| `rust` | — | — | — | — | — | wets | — |
| `salt` | — | — | — | — | — | wets | — |

Rings also push every loose cell they pass (§5.6), whatever the flame. Enemies are **entities**, not cells: this
table is what happens to the world, and statuses (§4) are what happens to live enemies. Corpses are entities too.

The **built** reactions (in `js/world/elements.js`) already match every bold entry except three new rules this page
adds for M7: the Rime `ice` skin on wet solids, cloudstuff igniting after the Rain stops, and the dry Tide rule
(§3.3).

### 12.3 Dig and breaking

- Each shape has a dig value (§5.1); heavy +1; a lob or rune burst digs at least 1; a volatile end burst digs 2.
- A hit with dig *d* breaks every cell in its reaction radius whose hardness is ≤ *d* (§12.1). A broken cell
  becomes **debris** 40% of the time and air otherwise: stone, brick, wood and plank → `rubble`; ice → `water`;
  glass → `sand`; anything else → air.
- A **steam burst** blasts cells with the explosion code (06 §13): radius 10, power 12.
- `bedrock` and `PINNED` solids are never broken. Puzzles rely on them (00 §13 soft-lock rule).

---

## 13. Combos (8)

A combo happens when a flame hits something carrying another flame's effect (a status or a cell). Only these 8 ship
(R44); each is taught once in a room and has a codex entry. **Every combo's product is a built material, a grid
flag or a zone.** "Hit" = the triggering hit's damage after resist.

| # | Combo (id) | Needs | Trigger | Result | Numbers | Product |
|---|---|---|---|---|---|---|
| 1 | **Steam burst** (`steam_burst`) | water | one Ember instance boils ≥ 20 water cells (or a lob bursts under water) | an explosion of steam | radius 20, damage 2.0× the hit, knockback 220 cells/s outward (+160 up); cells blasted as in §12.3; the steam then **lifts** the player (06) | `steam` (material) |
| 2 | **Shatter** (`shatter`) | a Frozen target | any non-Rime hit, or melee | ends Frozen (→ Thawing), a big hit | ×1.5 damage on that hit (×2.0 with the heavy charm or a pole heavy); 6 ice shards fly out, 30% of the hit each to others within 24 cells | none (damage only) |
| 3 | **Electrified water** (`electrified`) | water, `bile` or metal cells | a Spark hit | everything touching the connected body is shocked | 60% of the hit every 0.5 s for 2.0 s to every entity touching it — **you too** (your resist applies). Up to 600 connected cells conduct. Soaked targets take ×1.5. | the grid's electrified flag (a zone of cells) |
| 4 | **Burning slick** (`burning_slick`) | oil cells | Ember or Spark | the connected slick burns | fire spreads along the oil; a burning oil cell deals 8 damage/s to what stands in it; oil floating on water burns on the surface (the water beneath is safe) | `fire` (material) |
| 5 | **Blessed water** (`blessed_water`) | water | Gleam | a **healing field** over the water | a zone over the hit water surface (width = the reaction radius × 2, 8 cells deep) for **20 s**: heals the player 4 health/s while inside, burns the Unlit 6/s; the water itself is unchanged | a zone |
| 6 | **Glassblow** (`glassblow`) | sand | Ember held on it (beam, linger, repeated hits) until it reaches 1,200 °C | `sand` → `molten_glass` → cools to `glass` | a Rime hit hardens molten glass to glass at once (a quick bridge or plug) | `molten_glass`, `glass` |
| 7 | **Mud trap** (`mud_trap`) | `mud` | Rime | the mud sets hard | `mud` → `dirt` at once; an enemy standing in those cells is **Frozen 2.0 s** (bosses: Numbed) | `dirt` |
| 8 | **Rime-lock** (`rime_lock`) | a tether of another flame | a Rime hit on the line | the tether becomes an **ice span** | keeps its remaining life; walkable on top, no longer climbable; the only way to make a bridge from a rope | the tether's kind (an entity; no cells) |

Combos never set themselves off again within 1.0 s (a steam burst cannot trigger another from its own steam). Every
combo is a meter source: `via: 'combo:<id>'`, credited to whoever cast the triggering hit.

---

## 14. Enemy resistances and armour

### 14.1 The model

Every enemy (05) carries a `defence` block (shape: 10 §5): `armour`, `resist` per flame and physical, `kbResist`
(0–1), `statusResist` per status (0–1) and `tags`.

**Resist is percent**, from **−100 to +100**, plus the word **`heal`**. Damage × `(1 − resist / 100)`. Tier words
make data readable:

| Tier word | Value | Shown in the bestiary as |
|---|---|---|
| `weak2` | −100 | double cracked icon, "Very weak" (takes double) |
| `weak` | −50 | cracked icon, "Weak" |
| `normal` | 0 | nothing |
| `tough` | +25 | half shield |
| `resistant` | +50 | shield |
| `warded` | +75 | double shield |
| `immune` | +100 | crossed-out flame (the player must see this before wasting oil) |
| `heal` | — | a flame with a green plus: the hit **heals** the target |

- **`heal`**: the target takes no damage from that flame and instead heals 50% of what the hit would have dealt at
  `normal`; that flame's status does not apply. Good design when it is readable: "douse the candle" (Tallow heals
  from Ember, the Unlit from Shade). 05 decides who has it.
- **Bosses** are `immune` or `heal` to **at most 2 flames** combined.
- **Armour**: `armourFactor = 100 / (100 + armour)` on physical and every flame except Shade (which ignores it).
  Corrode lowers armour (never below 0). Armour pierce from gear subtracts first.
- **statusResist**: 0–1, multiplies a status's duration (and for burn/corrode the DoT damage) by `1 − value`;
  1 = immune.
- **kbResist**: 0–1, multiplies knockback. Bosses take no knockback.
- Resistance families (a starting point that 05 follows):

| Family | Weak to | Tough/resistant to | Immune / heal | Notes |
|---|---|---|---|---|
| Wax-things (Act 1) | ember, spark | rime (tough) | — (Tallow: `heal` ember in one phase, 05) | melt into wax cells |
| Rats and vermin (Act 2) | ember | bile (resistant) | — | |
| Drowned / water things (Act 3) | spark | tide (resistant), rime (tough) | — | soaked always |
| The Unlit (Act 4) | gleam (and radiance ×2, dazzled) | shade (warded) | some: `heal` shade | hunt light |
| Bell constructs (Act 5) | bile, spark | ember, physical (resistant) | — | `metal`: conduct and stun |
| Cloud-bound (Act 6) | ember, shade | tide (warded), rime (resistant) | spark on storm-types | |

Build note: `js/rpg/damage.js` clamps resist to ±100 and does not yet read `"heal"`; M6 adds it.

### 14.2 Resistances of the player

The player has the same `resist` block (04 §5). Base 0 everywhere; class, Nerve, gear and board add. Player resist
caps at **+75** (+85 Tide with the Sluicewarden capstone `sw_a7`). The player is never `heal` to anything. Self-hits
from gutters, electrified water and volatile use the player's resist.

---

## 15. Slots per act, strands, the Strand Case

### 15.1 Slots by progress (from 00 §6.2)

| When | Wick slots | Charm slots per wick | Knot slot | Overcharge |
|---|---|---|---|---|
| Start (`a1_n01`) | 1 (holds the class's first starting wick; the second waits, ready-braided, 04 §6.2) | 0 | — | none (holding `cast` taps) |
| Candlemarket lesson (`a1_n03`) | **2** (+ the Wick builder, Rime and lob) | 0 | — | none |
| Charmwife's Niche (`a2_n06`) | 2 | **1** (`split`) | — | **overcharge, gutter on** |
| Act 3, the Pumpworks (`a3_n02`) | **3** | **2** | — | — |
| Act 4, the Knot House (`a4_n02`) | 3 | 2 | **1 per wick** | — |
| Act 5, the Tithe Hall (`a5_n02`) | **4** | 2 | 1 | — |
| Act 6, the Empty Socket (`a6_n02`) | 4 | **3** | 1 | **mastery** (§9.4) |

**No overcharge in Act 1.** A class's starting wick that holds more strands than the current slots allow keeps them:
it is **Guild-braided** and locked until the slot count catches up (you cannot edit its extra part, only remove it).
The builder opens at **any lamp-post**; away from one, wicks can be swapped between slots but not re-braided.

### 15.2 Where strands come from

09's strand table (09 §6.0) says where every strand drops; every canon strand is guaranteed by the end of the act it
arrives in (00 §6.2). Prices and drop odds are 08's; the Long Descent's strand drops are 09's.

### 15.3 The Strand Case

- The **Strand Case** (08) is a separate list for learned strands; a strand item is learned by using it. Unlimited
  size, sorted Flames / Shapes / Charms / Knots.
- Each strand shows: name, icon (its colour), a one-line rule, its numbers, and "used in: Wick 1, Wick 3".
- A strand can be used in **any number of wicks at once** (owning Ember once lets every wick be Ember).
- A duplicate strand becomes `strand_dust` (08; it seasons a burn-in track, §10).

---

## 16. The Wick builder screen

Layout, controls and the 4-step first-time overlay are 02's (§15). This section fixes what the builder must **show**.

```
┌ WICK BUILDER ───────────────────────────── Wick 2 [Ember Bolt of the Choir] ─ Ember ■■□□□ L2  Bolt ■■■□□ L3 ┐
│ FLAME   [ember][rime][spark][bile][gleam][tide][shade]        │  PREVIEW (live, in a small room)    │
│ SHAPE   [bolt][arc][lob][beam][ring][rune][wave][tether]      │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│ CHARMS  (1)[split ✕] (2)[seek ✕] (3)[ locked: Act 6 ]         │  ▓ dummy  water  wood  oil  ice ▓   │
│ KNOT    [on_hit] → child: [spark][ring][—]                    │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │
│───────────────────────────────────────────────────────────────│  loops the cast every 2 s          │
│ Damage   9.7 ×3     Oil 12     Cooldown 0.35 s   Reach 480    │                                     │
│ Status   Burn 1.9/s ×3 s       Light 26 amber                  │  Damage per oil  2.43  ▲ vs slot 1 │
│ Knot     Spark Ring  4.2 on hit (max 3)  child oil 7 when fired │  Oil per second (spam) 34/s         │
│ Notes    Split + Seek: bolts pick different targets           │  ! over your regen (6/s)            │
└──────────────────────────────────────── Save · Clear · Rename · Copy code · Paste code · Close ───┘
```

### 16.1 Rules

- Illegal choices are shown dimmed, with the reason on hover (`shared/tooltip.js`): "Heavy and Swift cannot share a
  wick."
- The **preview room** is a 160 × 90 cell mini-sim running the **real** cell code and the real spell code (§20):
  a target dummy (100 HP, all resists 0), a water pool, a wood post, an oil puddle and an ice block, reset every
  loop. The preview never lies.
- Every number is live, compared against the wick in the same slot before editing (▲ green / ▼ red).
- **Damage per oil** and **oil per second when spammed** are always shown; if oil/s exceeds regen, a warning names
  the regen number. In the dark (Act 4+) the warning says "no regen here".
- Changed-meaning notes appear only for split, bounce, echo and volatile.
- A dry Tide wick (§3.3) shows its drop icon; a mastered wick has a gold border (§9.4).

### 16.2 Naming

A new wick gets a plain default name: `<Flame> <Shape>`, or `<Flame> <Shape> of the <word>` with 2+ charms (the
word from its first charm: split "Choir", bounce "Gutter", heavy "Anvil", swift "Sparrow", linger "Mourner", seek
"Moth", echo "Twins", volatile "Powderkeg"). Players can rename (24 characters).

**Odile's names** follow **08's dish-name rule** (the name is made by that rule; her comment comes from 01's
`spell_taste` pool through the intent `odile_names_wick`). She offers it **any time you visit `shop_wick`, free**, for
any wick; you may keep or discard it. Named wicks fill the Journal's **Wick Book** page (02).

### 16.3 Wick codes (B15)

A wick exports as a short text line to copy and paste: `LF1:` followed by the wick hash (§19.2), for example
`LF1:ember:bolt:seek+split:on_hit:spark:ring:-`. Pasting a code checks it with the builder's own rules: unknown ids,
strands you do not own, illegal pairs or too many charms for your slots are refused with the usual reason. The
Daily share line carries the code (09).

---

## 17. Balance rules and the balance simulator

### 17.1 Design rules the numbers must obey

1. **Tap efficiency band.** For every legal wick in an act's pool, damage per oil against the standard targets must
   lie within **0.67× – 1.5×** of that act's median. Above 1.5× is flagged. Below 0.67× is flagged as **dead only if
   its utility score (rule 8) is also below 0.67× of the utility median**.
2. **Control costs damage.** Rime, Tide and Bile wicks may sit below the median on damage; their control value
   (seconds of enemy action lost per oil) is scored separately and must sit within 0.67–1.5× of the control median.
3. **Sustain.** No wick may be castable forever at 0 net oil against one target at the act's base regen (the sim
   checks it; Shade drain is included).
4. **Burst is not free.** Overcharge at c = 2.0 must stay ≤ 0.95× the tap damage per oil (it is 0.90×).
5. **Knot budget.** A wick with a knot must not exceed 1.35× the damage per oil of the same wick without it on the
   pack target.
6. **Self-harm.** Combos that hurt the caster (electrified, volatile, gutter) are scored with a 20% "you also got
   hit" tax when the bot stands inside them.
7. **Charm ladder.** Every one of the 8 charms must be in the top half of picks for at least 2 of the 8 shapes.
8. **Utility counts.** Each wick gets a **utility score** from the physics set (§17.2): cells changed (weighted:
   broken 1.0, melted/frozen/burned 0.5, wetted 0.1), water cells made or moved (×0.5), fires started or put out
   (×2 each), machines and doors worked (×20 each). A Tide Ring that throws a pool is not "dead".
9. **Uptime, not stand-still.** Held and standing shapes are scored per second of **uptime on a target**, not
   against a dummy that never moves: beam at **80%** uptime (a moving target), tether at **25%** (enemies path
   around it; one crossing tick per 0.5 s).

### 17.2 The simulator (`tools/sim-wicks.mjs`)

A headless Node script with no DOM that imports the **same** compiler and instance code the game uses (§20) and,
for the physics set, the **real** cell code (`js/world`), not a stub (R79).

**Enumeration**: for each act 1–6, every legal wick from that act's pool: 7 flames × 8 shapes × charm sets of up to
3 from 8 (1 + 8 + 28 + 56 = 93 sets before §6.3 and §7 filtering) ≈ **3,000 legal wicks** at Act 6. With `--knots`:
each wick × 2 triggers × a fixed list of 16 common children, sampled 5% by default.

**Target setups** (10 simulated seconds each; the bot aims perfectly and casts whenever off cooldown and oil allows,
starting full, regen = the act's base):

| Setup id | What | Measures |
|---|---|---|
| `single` | one 1,000,000 HP dummy at 120 cells, resist 0, armour 0 | raw damage per oil, DPS |
| `pack` | 5 dummies 24 cells apart at 100–200 cells, 150 HP each, respawning | area value, chain |
| `armoured` | one dummy with armour 60 and resist 25 to the tested flame | armour and resist cost |
| `soaked_pool` | 3 dummies soaked in a 60 × 12 water pool | combos: electrified, freeze, steam |
| `close` | 3 dummies rushing the bot at 40 cells/s from 150 cells | arc, ring, rune value; knockback |
| `physics` | a **160 × 90** room with a 60 × 12 pool, an oil slick and a wood wall, on the real cell code | utility score |

**Outputs** to `research/wick-report.md` and `.json`: per act the median damage per oil (per setup), the top 20 and
bottom 20, every flagged and every dead wick with its recipe; per charm the pick share in the top half; per flame and
shape the medians; the control table; the utility table; the sustain check (net oil ≥ 0 over 10 s on `single` is a
hard fail).

**CLI**: `node tools/sim-wicks.mjs --act 4 --setup pack --top 50 --knots --seed 1`. Same seed, same report. Target
under 60 s for all acts without knots.

**Test gate**: `tests/unit/wick-balance.test.js` runs acts 1–6 without knots and fails on any flagged wick that is not
in `balance.json` → `spells.allowFlags` (wick hashes, each with a written reason).

### 17.3 The shapes at level 1 (the check R37 asked for)

Ember (power 12), level 1, no charms, one target:

| Shape | Damage | Oil | Damage per oil | vs median (1.56) | Note |
|---|---|---|---|---|---|
| bolt | 12.0 | 8 | 1.50 | 0.96× | |
| arc | 13.2 | 8 | 1.65 | 1.06× | plus projectile knock-back |
| lob | 15.6 | 10 | 1.56 | 1.00× | area |
| beam | 36.0 per s | 20 per s | 1.80 (1.44 at 80% uptime) | 0.92× at uptime | |
| ring | 15.6 | 10 | 1.56 | 1.00× | area, pushes |
| rune | 21.6 | 12 | 1.80 | 1.15× | must be stepped on |
| wave | 15.0 | 10 | 1.50 | 0.96× | area along the floor |
| tether | 3.6 per tick | 15 + 12 upkeep | 0.80 at 25% uptime | 0.51× | a utility shape: the rope is the point (utility score) |

### 17.4 Tuning knobs (`data/balance.json` → `spells`; shape in 10)

| Knob | Value |
|---|---|
| level scale per level | 0.04 |
| overcharge | max oil ×2.0, fill 1.2 s, tap threshold 0.18 s, exponent 0.7, max bonus 0.8, safe line 1.40, gutter max 0.60, self-damage 0.40, lockout 1.5 s, full hold 0.8 s (mastered 2.0 s) |
| burn-in | thresholds per track 0 / 200 / 600 / 1,500 / 3,500; +0.03 per level per track |
| charm damage clamp | 0.35 – 1.80 |
| charm oil clamp | 2.50 |
| knot | power 0.60, oil 0.50, children per instance 3, children per cast 12, depth 1 |
| global cast gap | 0.10 s |
| tether | tick gap per enemy 0.5 s, upkeep 1 oil/s, default life 12 s |
| sim uptime | beam 0.80, tether 0.25 |
| max spell lights | 64 |
| allow flags | [] |

---

## 18. Example builds (10)

Recipes read `flame + shape [charms] {knot → child}`. All use only ship parts. "Class" is who it suits (04).

| # | Name | Recipe | How it plays | Class |
|---|---|---|---|---|
| 1 | **The Plain Lamp** | ember + bolt | the starter: reliable, burns things, lights the way | any |
| 2 | **Choir Needles** | ember + bolt [split, seek] | three homing bolts; burn stacks spread across a pack | Lamplighter |
| 4 | **Kettle** | ember + lob [heavy, volatile] | lob into a flooded room for a steam burst; digs through wax walls | Tinker |
| 5 | **Pool Party** | spark + lob [linger] | lob into water that enemies stand in; the water stays live | Sluicewarden |
| 6 | **Tide & Current** | tide + wave, then spark + bolt in another slot | soak a group, then one Spark bolt chains through them ×1.5 | Sluicewarden |
| 8 | **Minefield** | spark + rune [split, linger] | 3 runes a cast, each leaving a shocking field: hold a corridor | Tinker |
| 11 | **Acid Rain** | bile + lob [split, linger] | three acid lobs; pools that strip armour for your pole | Chimneysweep |
| 19 | **Firewalk** | ember + wave [linger] | a burning trail along the floor that follows slopes; great in wax chapels | Lamplighter |
| 20 | **Dark Crossing** | shade + tether [heavy] | an umbral rope you climb unseen by the Unlit | Moth Oracle, Chimneysweep |
| 22 | **Powder Monkey** | ember + bolt [volatile, split, echo] | six small bursts from one cast: expensive, loud, digs | Tinker |

The numbers keep their v1 build numbers so notes and tests can refer to them; the other 16 are parked.

---

## 19. Data: which values live where

The files, their field names and their shapes are **10's** (10 §5). This page owns the values in:

| File | Holds (values from) |
|---|---|
| `data/flames.json` | §3.1 and §3.2 (power, oil ×, colour, light, flicker, status, tether kind and life, gutter effect, the dry-Tide lesson node) |
| `data/shapes.json` | §5.1 (mult, oil, cooldown, cast time, speed, gravity, size, lifetime, light, dig, reach, max out, tick rate, tether upkeep and tick gap) |
| `data/charms.json` | §6.1, the ✗ pairs of §6.3, the ✗ cells of §7 (`notOn`), the changed meanings of §7 (`byShape`) |
| `data/statuses.json` | §4 |
| `data/knots.json` | §8 |
| `data/reactions.json` | §12.2, one row per non-"—" cell |
| `data/combos.json` | §13 |
| `data/balance.json` → `spells` | §17.4 |

### 19.1 A wick in the save

A saved wick holds its slot, id, name, flame, shape, charms, mastered flag, knot (trigger + child flame, shape,
charm) and a Guild-braided lock flag. Burn-in is saved **per track** (`flame` and `shape` oil totals), apart from the
wicks, so it survives re-braids. Field shapes are 10's.

### 19.2 The wick hash

`flame:shape:charms(sorted, joined by +):knotTrigger:childFlame:childShape:childCharm`, with `-` for an empty part,
e.g. `ember:bolt:seek+split:on_hit:spark:ring:-`. It keys the compiled-plan cache, the balance allow list, the meter
and the wick code (§16.3).

---

## 20. Code: the compiled spell plan

The design is canon (R61): **compile once, run lookups**. 10 §3.5 lists the files.

- **Compile.** `compileWick(wick, data, hero, opts)` is a pure function: flame + shape + charms + burn-in tracks +
  overcharge + the character's stats → a flat **cast plan** of numbers: damage, oil, per-second flag, cooldown, cast
  time, speed, gravity, size, lifetime, length, reach, tick rate, max out, arm time, dig, knock, count and spread
  (split), bounces, seek turn rate, linger seconds, volatile radius, echo delay and power, light (radius, intensity,
  negative flag, flicker), burn levels, and the derived damage per second and per oil for the builder. The same
  function feeds the game, the builder preview and the balance sim. `validateWick()` returns the refusal reason
  string or null.
- **Cache.** Plans are cached by the wick hash + `statsVersion`, which bumps whenever level, attributes, gear or board
  change (04 §5).
- **Cast.** The caster step handles slots, oil (regen and the dark rule come from 04 §5), cooldowns, the global gap,
  hold-to-charge, the safe line, the gutter roll and lockout (§9).
- **Instances.** One handler per shape moves each instance and fires its events: **spawn, tick, hit enemy, hit cell,
  bounce, end**. Charm effects are hooks on those events reading the plan (bounce count, seek turn, linger field at
  end, volatile burst at end, echo re-cast after its delay, knots on hit/kill). Moves are sub-stepped so a 320
  cells/s bolt never skips a cell (step ≤ 2 cells).
- **World writes** go only through the world's cell API (`setCell`-style calls in the reaction code), never straight
  into typed arrays, so dirty-chunk tracking stays right (06).
- **Randomness** comes from the seeded `spell` stream, so the Daily and the balance sim reproduce.
- **Caps**: 512 live instances, 64 linger fields, 3 runes and 2 tethers per caster; past the instance cap the oldest
  non-rune instance is recycled.

### 20.1 Meter wiring

Every damage, heal and status record goes to the run's meter with `source` = the caster, `via: '<wickId>'` (or
`knot:`, `combo:`, `gutter:`, `dot:burn`), `viaName` = the wick's name, and `dtype` = the flame's meter type. The
Ledger (02) therefore shows each wick as a source, as canon asks.

---

## 21. Tests

(10 owns the test file list; these are the checks this page's rules need.)

| Check | Kind | What it proves |
|---|---|---|
| wick compile (`tests/unit/wick.test.js`, built) | node | the §2.6 worked example gives 9.71 / 12 / 0.35; every flame × shape compiles; clamps; each "!" rule of §6.3 and §7 has a case |
| wick legality | node | the compiler refuses every ✗ in §6.3 and §7 and accepts every ✔; knot depth 2 is always refused; dry Tide makes no water cells |
| spell data | node | every non-"—" cell of §12.2 has a reactions row; every combo references real ids and names a built product (material, flag or zone); status ids match §4 exactly |
| overcharge | node | the §9.1 curve and §9.2 gutter tables match the formulas; a mastered wick never gutters; no charge before `a2_n06` |
| burn-in | node | the 200 / 600 / 1,500 / 3,500 thresholds; oil counts toward both tracks; a child trains its own tracks |
| wick balance | node | the sim finds no un-allowed flags (utility and uptime rules applied) |
| knobs | node | moving each `balance.json` `spells` knob to an odd value changes the compiled plan (dead-knob guard) |
| spells in the world | Playwright | in the test room: an Ember lob on water makes steam; a Rime lob freezes a pool you can stand on; Spark in water hurts the player; a tether rope is climbable; Bile dissolves a brick wall; a Gleam hit on water leaves a healing field |

---

## 22. Cheaper fallbacks

| Expensive thing | Fallback if the frame budget (00 §13) is blown |
|---|---|
| Electrified water flood-fill over big bodies | cap at 600 cells (already), then compute once per 0.5 s tick, not per hit |
| Burning oil spread over a big slick | spread by chunk (8 × 8 cells), not by cell; per-cell flicker only on screen |
| 64 dynamic spell lights | drop to 32 and merge harder; beams use 1 light per 24 cells |
| Gleam afterglow | already per CPU-grid tile (1/8 resolution) |
| Preview mini-sim in the builder | a pre-recorded loop per shape with the flame colour swapped |
| Seek steering with many split instances | retarget only every 4th tick |
| Knot budget of 12 children per cast | 6 children |

---

## 23. v2 changes

The v1 "Proposed canon changes" are settled:

- Relic strands (v1 proposal 1): **parked** with the other 12 relic strands (REVIEW parked list).
- Dimmed and Numbed (proposal 2): **kept**, in the one status table (§4); the v1 product materials are **not**
  materials: they map onto the 36 built ones (§12, R60).
- Overcharge in Act 1 room 3 (proposal 3): **rejected**; overcharge arrives at `a2_n06` (R16, R35).
- Knot depth 2 (proposal 4): **parked**; depth 1 only (R44).

What changed on this page:

- **R16, R17** §9: input is hold `cast` (no modifier key); unlock `a2_n06` with gutter on; safe line 1.40, +0.10 from
  `ll_b4` only (steady and "mastery steps" gone); the hold-past-full extra rolls are gone (the wick fires itself);
  §9.4 mastery = one wick, no gutter, 2.0 s hold, chosen at `a6_n02`, moved at any lamp-post.
- **R20** §4 is the one status table: 14 statuses incl. `numbed`, `thawing`, `dazzled` (new), `dimmed`,
  `staggered`, `knocked_out`; `wet` merged into `soaked`; 03's numbers win.
- **R21** §14.1: `weak2` (−100) and `heal` allowed; percent everywhere; bosses immune/heal to ≤ 2 flames.
- **R27** §15.2 is now one paragraph linking 09's strand table.
- **R28** §3.3: the dry Tide rule.
- **R35** §15.1 slots table rebuilt from 00 §6.2 (slot 2 `a1_n03`, charm slot 1 `a2_n06`, slot 3 + charm slot 2
  `a3_n02`, knot slot `a4_n02`, slot 4 `a5_n02`, charm slot 3 + mastery `a6_n02`; no overcharge in Act 1).
- **R37** §5.1: ring ×1.30 / 10 oil; arc ×1.10 / 8 oil; beam 0.30 per tick / 20 oil/s; wave ×1.25; tether one tick
  per enemy per 0.5 s, 1 oil/s upkeep, 12 s life. §17: utility score, uptime model, the level-1 shape check (§17.3).
- **R38** §10: burn-in is two tracks (flame, shape), +3% per level, 200 / 600 / 1,500 / 3,500 oil; Strand Dust
  seasons one track.
- **R44** §6–§8, §13: 8 charms; changed meanings only for split, bounce, echo, volatile; knots `on_hit` and
  `on_kill`, depth 1; the 8 combos, each with a built product (`blessed_water` is a 20 s healing zone; `mud_trap`
  turns `mud` to `dirt` with Frozen enemies; `glassblow` goes through `molten_glass`).
- **R60** §12: the material reference and the full matrix are rebuilt for the **36 built materials** (old names
  mapped; lampstone = `PINNED`).
- **R61** §20: the compile-once design is canon, described as built; files listed by 10.
- **R79, R80** §17.2 adds the `physics` set on the real cell code; §8.2: turret shots never trigger knots.
- **R25, B15** §16.2 naming links 08's dish-name rule, any visit, free, no burn-in gate; §16.3 wick codes.
- **B4** §9.3: a Shade gutter puts the lantern out under the last-drop relight rule (07).
- **R4** §19: JSON shapes moved to 10; this page keeps values.
- §18: 10 example builds that use only ship parts.
- Numbers changed in the data files to match: `shapes.json` (arc, ring, beam, wave, tether), `charms.json` (`notOn`
  lists, changed meanings), `statuses.json` (the 14 statuses), `flames.json` (tether kinds, gutter effects, dry Tide).
- Build notes for M6–M7 (engine code, not changed by this edit): burn-in thresholds in `js/spells/wick.js`; `heal`
  resist in `js/rpg/damage.js`; the tether upkeep; `js/rpg/status.js` still raises the parked `thermal_crack` /
  `cracked` combo, which should come out.

---

## Parked (v2)

Nothing below ships. Each block is the v1 text as it was, under the finding that cut it, with what replaced it.

### Formula

**Parked by R38: the v1 worked example (single burn-in level per core).** Replaced by: §2.6 (two tracks).

**(v1) 2.6 Worked example**

*Ember Bolt with Split + Seek, character level 8, Wick attribute 12, no gear, burn-in level 2.*

| Step | Value |
|---|---|
| Ember power | 12 |
| × bolt mult 1.00 | 12 |
| × split 0.55 (per bolt) × seek 0.90 | 5.94 |
| × castScale (1 + 0.04×7) × (1 + 0.02×12) = 1.28 × 1.24 = 1.587 | 9.43 |
| × burn-in L2 1.06 | **9.99 per bolt, 3 bolts** |
| Oil: 8 × 1.0 × split 1.30 × seek 1.15 | 11.96 → **12 oil** |
| Cooldown: 0.35 × 1 × 1 | **0.35 s** |
| Burn per stack: 20% of 9.99 per second | 2.00/s for 3 s |


### Flames

**Parked by R30, R60: the v1 flame tables (Act 1 Spark, Ferrywitch and void-cell mentions).** Replaced by: §3.1–§3.2.

**(v1) 3.1 Flame numbers**

| id | Power | Oil × | Status | Light colour | Light × | Light intensity | Resist key | Unlock (canon) |
|---|---|---|---|---|---|---|---|---|
| `ember` | 12 | 1.00 | burn | `#ff8a2a` | 1.10 | 1.00 | `ember` | start |
| `rime` | 10 | 1.00 | chill → freeze | `#6fe3ff` | 1.00 | 0.85 | `rime` | Act 1 |
| `spark` | 11 | 1.10 | shock + chain | `#fff27a` | 1.20 (flickers) | 1.10 | `spark` | Act 1 |
| `bile` | 8 | 0.90 | corrode | `#8dff4a` | 0.80 | 0.70 | `bile` | Act 2 |
| `gleam` | 10 | 1.00 | radiance | `#ffe6b0` | 1.50 | 1.25 | `gleam` | start (Lamplighter) / Act 1 |
| `tide` | 8 | 0.90 | soak + knockback | `#3f7bff` | 0.70 | 0.60 | `tide` | Act 3 |
| `shade` | 13 | 1.25 | drain | `#b25cff` (rim only) | −0.80 (darkens) | 0.50 rim | `shade` | Act 4 |

Why these numbers: Ember is the yardstick. Rime and Tide pay for their control with less damage. Bile is cheap and
weak up front but strips armour for the rest of the party (and your melee). Shade is the strongest and priciest, and
costs you light in an act where light is life.

**(v1) 3.2 What each flame does besides damage**

| Flame | On hit (enemy) | On the world | Tether version (§5.9) |
|---|---|---|---|
| Ember | +1 burn stack | ignites flammable cells, boils water, melts wax/ice | **Fuse rope**: burns for 6 s then snaps; +50% crossing damage |
| Rime | +1 chill stack (5 = freeze) | freezes water, puts out fire, frosts surfaces (slippery) | **Ice span**: rigid, walkable on top, not climbable, lasts 20 s |
| Spark | shock, chains to 2 more | electrifies water and metal, powers machines | **Live wire**: powers a machine at either end while it exists |
| Bile | +1 corrode stack | dissolves metal/brick/bone, poisons water | **Gut-vine**: sticky, climbable, slows enemies crossing it 40% |
| Gleam | radiance (×2 vs Unlit, heals allies) | lights cells (afterglow 8 s), blesses water | **Light rope**: climbable, lights its whole length, heals allies on it 3/s |
| Tide | soak + knockback | makes water cells, pushes loose cells, puts out fire | **Stream**: a rope of flowing water you swim up |
| Shade | drain (heal + oil), ignores armour | eats light, turns soft cells to ash, makes void cells (Act 6) | **Umbral line**: climbable, you are unseen by Unlit while on it |


### Statuses

**Parked by R20: the v1 status table.** Replaced by: §4, the one table (14 statuses).

All statuses are listed with the exact numbers the code uses. "Hit damage" means the final `taken` of the hit
that applied the stack (after resist and armour), so resisted hits make weaker statuses.

| Status (id) | From | Stacks | Per stack | Tick | Duration | Special rules |
|---|---|---|---|---|---|---|
| **Burn** (`burn`) | Ember | max 5 (heavy adds 2 per hit) | 20% of the applying hit's damage **per second** | every 0.5 s | 3.0 s, refreshed for all stacks on a new stack | Full → oldest stack replaced if new is stronger. **Soaked** targets cannot burn and lose all burn stacks. Burning enemies set flammable cells they touch alight (1 cell per 0.25 s). |
| **Chill** (`chill`) | Rime | max 5 | −10% move speed, −10% attack speed | — | 4.0 s | At 5 stacks (3 if Soaked) → **Frozen**. |
| **Frozen** (`frozen`) | 5 chill | — | cannot move or act | — | 1.5 s standard, 1.0 s elite, bosses never freeze (they get *Numbed*: −50% speed 2 s) | Then **Thawing**: chill-immune for 4 s. Frozen targets take **Shatter** (§13). Frozen enemies in water become a solid block you can stand on. |
| **Shocked** (`shocked`) | Spark | 1 | takes +15% damage from every source | — | 2.0 s | A shocked target in metal armour (tag `metal`) is also stunned 0.3 s, once per 3 s. |
| **Chain** (not a status) | Spark hit | — | jumps to the nearest un-hit enemy within 48 cells | — | instant (0.05 s per jump, visible arc) | 2 jumps (vast +1, split: each bolt chains separately). Each jump deals 70% of the previous hit. Chain can jump to the caster only through water (§13.3). |
| **Corrode** (`corrode`) | Bile | max 6 | −8 armour, −5 to every resist, and a DoT of 10% of hit damage/s | every 1.0 s | 6.0 s refreshed | Corrode on a shield-bearer breaks the shield at 4 stacks (tag `shield`). |
| **Radiance** (`radiant`) | Gleam | 1 | reveals the target (drawn lit through darkness), Unlit take ×2 Gleam damage and **Seared**: cannot regen or hide | — | 5.0 s | Gleam hitting an **ally** (Ferrywitch oarsmen, turrets, escort NPCs, co-op later) heals 60% of the hit instead of damaging. |
| **Soaked** (`soaked`) | Tide, standing in water ≥ 8 cells deep, rain in Act 1–5 open-sky rooms does **not** soak | 1 | removes burn and blocks new burn; Spark ×1.5 vs them; freeze at 3 chill | — | 5.0 s (refreshed while in water) | Knockback is separate: impulse 140 cells/s × (1 − kbResist), heavy doubles it. |
| **Drained** (`drained`) | Shade | 1 | −15% damage dealt; target's own light is removed | — | 3.0 s | The caster heals **6%** of each Shade hit and regains **4%** as oil (siphon charm adds on top). |
| **Dimmed** (`dimmed`) | Shade ring/beam on the *player's* area | — | your lantern radius −30% | — | while inside | Only affects the player, shown on the HUD (it is the price of Shade). |

Status caps: at most 6 different statuses on one enemy at once. Status durations are ×0.5 on bosses and elites
with the `steadfast` tag (05-BESTIARY-BOSSES.md defines who has it). Statuses are recorded to the meter as
`kind: 'status'` records and their ticks as `via: 'dot:burn'` etc. (`meters/README.md`).


### Shapes

**Parked by R37: the v1 shape numbers and the v1 tether text (30 s life, 5 ticks/s to anything crossing).** Replaced by: §5.1 and §5.9.

**(v1) 5.1 Shape numbers**

| id | Mult | Oil | Cooldown | Cast time | Speed (cells/s) | Size | Lifetime | Light radius | Hits | Dig |
|---|---|---|---|---|---|---|---|---|---|---|
| `bolt` | 1.00 | 8 | 0.35 s | 0 ms | 320 | radius 2 (a 5×5 blob) | 1.2 s (reach 384) | 26 | first enemy or solid cell | 0 |
| `arc` | 1.40 | 6 | 0.50 s | 80 ms | — | radius 22, 150° sweep | 0.15 s | 34 (flash) | every enemy in the sweep once | 0 |
| `lob` | 1.30 | 10 | 0.70 s | 120 ms | 220 at aim angle, gravity 600 | burst radius 14 | fuse on impact or 2.5 s | 22 in flight, 40 burst | everything in the burst | 1 |
| `beam` | 0.45 per tick, 10 ticks/s | 18 **per second** | 0.30 s after release | 150 ms warm-up | instant | length 140, width 3 | while held, max 4 s | 18 along its length | every enemy on the line, each tick | 0 (1 on wax/ice) |
| `ring` | 0.90 | 14 | 1.20 s | 100 ms | expands 0 → 48 radius in 0.40 s | ring 4 cells thick | 0.40 s | 48 at peak | every enemy the edge passes | 0 |
| `rune` | 1.80 | 12 | 1.00 s | 200 ms | placed on the first surface within 80 cells along the aim | 12 wide × 4 tall trigger | arms in 0.5 s, lasts 20 s, max 3 runes out | 10 idle, 44 when it fires | enemies stepping on it (burst radius 16) | 1 |
| `wave` | 1.10 | 10 | 0.80 s | 60 ms | 150 along the ground | 8 long × 12 tall | 1.6 s (reach 240) | 24 | every enemy it passes once | 0 |
| `tether` | 0.30 per tick, 5 ticks/s to anything crossing | 15 | 2.00 s | 150 ms | instant, up to 120 cells | line width 1, anchors 2×2 | 30 s (flame-dependent, §3.2), max 2 tethers | 12 along its length | enemies crossing the line | 0 |

**(v1) 5.9 Tether (`tether`)**

The tether is the spell that is also a tool: **it makes a climbable rope**.

- **Cast 1**: fires an invisible probe along the aim up to 120 cells. It sticks to the first solid cell of hardness
  ≥ 1 (anchor A). If nothing is hit in 120 cells, the cast fizzles and refunds 100% of its oil.
- **Anchor B**: the nearest solid cell within 8 cells of the player's feet or hands at cast time. If there is none
  (you are in mid-air), B is the player: you are **attached** and swing from A exactly like a grapple rope
  (`07-TRAVERSAL-PUZZLES.md` covers rope physics). Pressing the cast key again while attached drops you and pins
  B to your position in the air if a solid is within 8 cells, otherwise the tether ends.
- The line is a rope entity (a chain of 4-cell verlet segments, same code as the grapple rope). Tethers between two
  solid anchors are **taut** (no sag above 10%). Climb with up/down at 40 cells/s; jump off like any rope.
- Damage: 0.30 power per tick at 5 ticks per second to any enemy whose body crosses the line, and the flame's status.
  Enemies that cannot fly treat an Ember/Spark/Bile tether as a wall they avoid if they can path around it (AI in page 05).
- Lifetime and extra behaviour by flame — see §3.2. Default 30 s. Max 2 tethers per character; a 3rd removes the oldest.
- If either anchor cell is destroyed, the tether snaps (the rope falls as loose rope cells, 1 per 4 cells of length).
- Tether does not count as a "hit" for Knot `on_hit` more than once per enemy per second.


### Charms

**Parked by R44: the v1 charm section: 12 charms including pierce, vast, siphon and steady, their stacking and conflict rules.** Replaced by: §6 (8 charms). Pierce, vast, siphon and steady are parked.

**(v1) 6. Charms (12)**

**(v1) 6.1 Charm numbers**

"Mult" rows multiply the matching value of the wick. "—" means 1.00 (no change).

| id | Name | What it does | Dmg × | Oil × | Cooldown × | Speed × | Size × | Life × | Other numbers | Unlock act (matches 08 §10) |
|---|---|---|---|---|---|---|---|---|---|---|
| `split` | Split | 3 instances fanned ±12° (arc/ring: 3 thinner echoes) | 0.55 each | 1.30 | — | — | 0.80 | — | 5 instances for relic variant (§15.4) | 2 |
| `bounce` | Bounce | rebounds off solids and enemies | 0.85 per bounce (compounding) | 1.15 | — | — | — | +0.5 s per bounce left | 2 bounces; enemy bounce picks the nearest other enemy within 60 cells | 2 |
| `pierce` | Pierce | passes through enemies | 0.90 each enemy after the first (compounding) | 1.20 | — | — | — | — | up to 3 enemies; with `heavy` also through 1 cell of hardness ≤ 2 | 3 |
| `linger` | Linger | leaves a field where it ends | field: 25% of hit damage per second | 1.25 | — | — | — | field 3.0 s | field is the burst/impact radius (bolt: 6) and applies the status each second | 3 |
| `heavy` | Heavy | slow, hard-hitting, digs | 1.50 | 1.30 | 1.25 | 0.60 | 1.20 | — | knockback ×2, dig +1, burn/chill/corrode stacks +1 | 2 |
| `swift` | Swift | fast and cheap to repeat | 0.85 | — | 0.70 | 1.60 | — | — | cast time ×0.5 | 2 |
| `seek` | Seek | homes on the nearest enemy | 0.90 | 1.15 | — | — | — | 1.25 | turn rate 240°/s, acquire cone 90° and 90 cells, retargets once | 3 |
| `vast` | Vast | bigger in every way | — | 1.40 | 1.15 | — | 1.60 | — | light radius ×1.5, chain jumps +1, field size ×1.6 | 4 |
| `siphon` | Siphon | pays you back | 0.90 | 1.10 | — | — | — | — | 8% of damage dealt → oil, 4% → health; max 30% of the cast's oil back per cast | 4 |
| `echo` | Echo | the spell casts itself again | — | 1.35 | 1.10 | — | — | — | a free copy 0.35 s later from the same place and aim, at 60% power; the copy does not echo | 5 |
| `volatile` | Volatile | explodes at the end | — | 1.20 | — | — | — | — | end burst radius 16, 60% damage, dig 2; hurts you for 25% if you are inside it | 5 |
| `steady` | Steady | rewards standing your ground | — | — | — | — | — | — | +20% damage if you have not moved for 0.3 s; overcharge safe line +0.1 (§9); cast cannot be interrupted by hits; bolt/beam spread 0 | 4 |

**(v1) 6.2 Stacking rules**

1. **One of each.** A wick cannot hold the same charm twice. (Relic variants count as the same id.)
2. **Multipliers multiply.** Damage, oil, cooldown, speed, size and lifetime multipliers all multiply together
   (`Π` in §2). No additive stacking inside a wick.
3. **Order does not matter** except for Echo and Split, which are resolved in a fixed order: Split first (makes N
   instances), then Echo (copies the whole cast, all N instances, once).
4. **Per-instance effects** (bounce, pierce, seek, linger, volatile) apply to every instance, including split copies
   and the echo copy.
5. **Resource-return caps.** Siphon and Shade's drain add together but the oil returned by one cast is capped at 30%
   of its oil cost (siphon's cap) + Shade's 4% which is uncapped.
6. **Soft cap on total damage multiplier from charms**: the product of charm damage multipliers is clamped to
   **[0.35, 1.80]**. (Heavy + steady standing still = 1.5 × 1.2 = 1.80, the ceiling.)
7. **Oil multiplier ceiling**: the product of charm oil multipliers is clamped to **2.50**.

**(v1) 6.3 Charm × charm conflict table**

✔ = works as written. ✗ = not allowed (the builder refuses and says why). **!** = allowed with the special rule noted.

| | split | bounce | pierce | linger | heavy | swift | seek | vast | siphon | echo | volatile | steady |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **split** | — | ✔ | ✔ | ! a | ✔ | ✔ | ! b | ✔ | ✔ | ! c | ! a | ✔ |
| **bounce** | ✔ | — | ! d | ✔ | ✔ | ✔ | ! e | ✔ | ✔ | ✔ | ! f | ✔ |
| **pierce** | ✔ | ! d | — | ✔ | ! g | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **linger** | ! a | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ | ! a | ! h | ✔ |
| **heavy** | ✔ | ✔ | ! g | ✔ | — | **✗** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **swift** | ✔ | ✔ | ✔ | ✔ | **✗** | — | ✔ | ✔ | ✔ | ✔ | ✔ | **✗** |
| **seek** | ! b | ! e | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ | ✔ |
| **vast** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ✔ | ✔ | ✔ | ✔ |
| **siphon** | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | ! i | ✔ | ✔ |
| **echo** | ! c | ✔ | ✔ | ! a | ✔ | ✔ | ✔ | ✔ | ! i | — | ✔ | ✔ |
| **volatile** | ! a | ! f | ✔ | ! h | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | **✗** |
| **steady** | ✔ | ✔ | ✔ | ✔ | ✔ | **✗** | ✔ | ✔ | ✔ | ✔ | **✗** | — |

Special rules:

- **a. Field cap.** At most 4 linger fields and 4 volatile bursts from one cast (split + echo would otherwise make 6).
  Fields from the same wick in the same place do not stack damage: a target in two of your fields takes only the
  stronger.
- **b. Split + seek.** Split instances pick **different** targets if there are enough; otherwise they share.
- **c. Split + echo.** The echo copies all three split instances, each at 60%: total 3×0.55 + 3×0.55×0.60 = 2.64×.
  This is intended to be strong and expensive (oil ×1.755).
- **d. Bounce + pierce.** Pierce is used up first on enemies; bounces happen only on solids and when pierce runs out.
- **e. Bounce + seek.** After a bounce the instance re-acquires a target (counts as its one retarget).
- **f. Bounce + volatile.** The volatile burst happens only at the end of life, not at each bounce.
- **g. Heavy + pierce.** Also passes through 1 cell of hardness ≤ 2 (wood, wax, dirt, ice, glass, bone).
- **h. Linger + volatile.** The burst happens first, then the field is left in the burst radius (radius 16, not 6).
- **i. Echo + siphon.** The echo copy returns oil too, but the 30% cap counts both together.
- **✗ Heavy + swift**: opposites. **✗ Swift + steady**: steady wants you still. **✗ Volatile + steady**: a
  volatile wick is by nature unsteady — also stops the "safe line + volatile" pairing being best in slot.

**Parked by R44: the v1 charm × shape table and its 12 changed meanings.** Replaced by: §7 (changed meanings only for split, bounce, echo, volatile).

**(v1) 7. Which charm works on which shape, and conflicts**

Not every charm means something on every shape. ✔ = normal. **✗** = cannot be braided. ! = changed meaning, below.

| Charm \ Shape | bolt | arc | lob | beam | ring | rune | wave | tether |
|---|---|---|---|---|---|---|---|---|
| `split` | ✔ 3 bolts ±12° | ! 1 | ✔ 3 lobs, angles −10/0/+10° | ! 2 | ! 3 | ! 4 | ! 5 | **✗** |
| `bounce` | ✔ | **✗** | ✔ (bounces instead of bursting, bursts on the last) | ! 6 | **✗** | **✗** | ! 7 | **✗** |
| `pierce` | ✔ | **✗** (already hits all) | ✔ passes enemies, bursts on ground | **✗** (already) | **✗** | **✗** | **✗** (already) | **✗** |
| `linger` | ✔ | ✔ field on the sweep edge | ✔ | ✔ burning line 3 s | ✔ field ring | ✔ field on fire | ✔ trail | ✔ doubles tether life |
| `heavy` | ✔ | ✔ | ✔ | ✔ (−40% turn speed) | ✔ | ✔ | ✔ | ✔ (tether survives 1 anchor loss) |
| `swift` | ✔ | ✔ | ✔ | ! 8 | ✔ | ✔ arms in 0.2 s | ✔ | ✔ |
| `seek` | ✔ | **✗** | ✔ (steers while falling, 120°/s) | ! 9 | **✗** | ! 10 | **✗** | **✗** |
| `vast` | ✔ | ✔ | ✔ | ✔ width 5 | ✔ radius 77 | ✔ | ✔ height 19 | ✔ reach 190 |
| `siphon` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `echo` | ✔ | ✔ | ✔ | **✗** | ✔ | ! 11 | ✔ | **✗** |
| `volatile` | ✔ | **✗** | ✔ (bigger burst: +16 radius on top of 14 → one burst radius 22) | ! 12 | ✔ at full size | ✔ | ✔ at end | ✔ both anchors burst when it ends |
| `steady` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

Changed meanings:

1. **Split arc**: three sweeps at 0°, +30°, −30° from the aim, each 90° wide.
2. **Split beam**: the beam forks into 3 thinner beams (width 1) at ±8°, each 0.55 power per tick.
3. **Split ring**: 3 rings expanding one after another 0.1 s apart (each 0.55).
4. **Split rune**: places 3 runes 14 cells apart along the surface; counts against the 3-rune cap.
5. **Split wave**: 3 waves, one forward, one backward, one forward delayed 0.2 s.
6. **Bounce beam**: the beam reflects off the first solid it hits once (up to 140 cells total length), 85% after the bounce.
7. **Bounce wave**: at a wall it turns around instead of breaking (twice).
8. **Swift beam**: warm-up ×0.5 and walk speed while beaming 70% instead of 40%; damage per tick still ×0.85.
9. **Seek beam**: the beam end bends up to 25° toward the nearest enemy.
10. **Seek rune**: the rune's trigger box grows to 32 wide and it launches a bolt of its power at the first enemy in 60 cells.
11. **Echo rune**: the rune fires twice (0.35 s apart, second at 60%).
12. **Volatile beam**: on release, the far end of the beam bursts (radius 16, 60% of one second of beam damage).


### Knots

**Parked by R44: the v1 knots: on_timer, on_land, depth 2 (mo_c7, knot_twicetied).** Replaced by: §8 (on_hit, on_kill, depth 1).

**(v1) 8. Knots (Act 4+)**

A Knot ties a **child wick** to the main wick. When the trigger happens, the child fires from the trigger point.

**(v1) 8.1 Triggers**

| id | Name | Fires when | Where the child spawns | Aim of the child | Caps |
|---|---|---|---|---|---|
| `on_hit` | Hitknot | an instance hits an enemy | the hit point | continues the parent's direction (arc/ring: away from the caster) | max 1 per instance per 0.25 s, max 3 per cast |
| `on_kill` | Deathknot | an instance's damage kills an enemy (incl. its burn/corrode ticks within 3 s) | the enemy's centre | toward the nearest other enemy within 120 cells, else straight up | max 4 per cast |
| `on_timer` | Clockknot | every 0.5 s while an instance lives (from 0.5 s) | the instance's position | the parent's current direction | max 4 per cast; runes: every 1.0 s while armed, max 6 |
| `on_land` | Groundknot | an instance ends on a solid or liquid cell (bursts, breaks, or lifetime ends while touching ground) | the landing cell + 2 cells up | up along the surface normal; wave/ground shapes run along the surface | max 1 per instance |

**(v1) 8.2 The child wick**

- The child is braided in the Knot slot in the builder: **Flame + Shape + at most 1 Charm**, from strands you own.
- Child power = its own formula × **0.60**. Child oil = its own oil cost × **0.50**, paid **when it fires** from your
  pool. If you do not have the oil, it does not fire (a small grey puff, no sound spam: `ui.fizzle` at most every 0.5 s).
- The child shares the parent's burn-in level (it has no burn-in of its own) and never overcharges.
- The child cannot have Echo or Split (the builder hides them in the child's charm row). It may have any other charm.
- Children never trigger Knots of their own. **Recursion limit: depth 1** (a child is always a leaf). The Moth
  Oracle capstone `mo_c7` and the relic knot `knot_twicetied` raise it to depth 2 (the child may have one knot whose
  grandchild is at 0.60 × 0.60 = 0.36 power and 0.25 oil). Depth 3 is never possible; the compiler asserts it.
- A single cast may spawn at most **12 child instances** in total (all triggers together). A spent budget shows as a
  small knot icon crossed out over the parent for the meter tooltip.
- Children count as a separate meter source: `via: 'knot:<parentWickId>'`, name "Ember Bolt ↳ Spark Ring".

**(v1) 8.3 Knot numbers per trigger**

| Trigger | Child power extra | Child oil extra | Notes |
|---|---|---|---|
| on_hit | × 1.00 | × 1.00 | the common one |
| on_kill | × 1.30 | × 0.80 | rewards finishing; chains packs |
| on_timer | × 0.80 | × 1.00 | a turret-like drip; best on slow long-lived shapes (lob, rune, beam) |
| on_land | × 1.10 | × 0.90 | turns lobs/bolts into delivery for runes, rings and waves |

Final child power = base child formula × 0.60 × trigger extra.


### Overcharge

**Parked by R16, R17: the v1 overcharge input (R modifier), hold-past-full rolls, the safe-line bonuses and the charm-slot mastery.** Replaced by: §9 (hold cast, a2_n06, one mastered wick).

Hold the `overcharge` modifier (`R`, 02-CONTROLS-UI.md §2.2) and hold `cast` to pour in more oil; release `cast` to fire. The lantern visibly swells and the charge ring around
the player fills.

Holding past full (c = 2.00) keeps the spell at 2.00 for up to 0.8 s more; each 0.25 s there is an extra gutter roll
at the full-charge chance (so do not sit on it).

Without `R` held, `cast` always taps (c = 1.00). Holding does not stop cooldowns elsewhere. Beam and tether do
not overcharge (beam's "hold" is its fire button); the builder shows "no overcharge" on them.

**(v1) 9.2 The safe line and guttering**

- **Safe line** = 1.40 (+0.10 with `steady`, +0.10 with the Lamplighter skill node `ll_b4`, +0.05 per Act-6 "Mastery"
  step, max 1.70).

**(v1) 9.4 Act 6 Overcharge mastery (canon)**

At the start of Act 6 the player picks **one charm slot on one wick** to be **mastered** (the slot glows gold in the
builder). A mastered wick has **no gutter chance at all** — any c up to 2.00 is safe — and its full-charge hold
limit rises from 0.8 s to 2.0 s. The mastery can be moved to another wick at any Lamp shrine for free. The
`steady` charm on a mastered wick instead gives +10% overcharge power (1.80 → 1.98 max).


### Burn-in

**Parked by R38: v1 burn-in per core (7,000 oil to level 5).** Replaced by: §10 (two tracks, 3,500 per track).

**(v1) 10. Burn-in (wick levels)**

A wick levels from 1 to 5 with **oil spent through it** (a fair measure of use across cheap and expensive wicks).

| Level | Oil spent to reach | Power × | Light radius × | Light intensity × | Look |
|---|---|---|---|---|---|
| 1 | 0 | 1.00 | 1.00 | 1.00 | plain |
| 2 | 400 | 1.06 | 1.04 | 1.10 | slightly brighter core |
| 3 | 1,200 | 1.12 | 1.08 | 1.20 | + trailing embers of the flame colour |
| 4 | 3,000 | 1.18 | 1.12 | 1.30 | + the lantern on the pole gains a coloured glass pane |
| 5 | 7,000 | 1.24 | 1.16 | 1.40 | + the wick's name gets a gold border and Odile names it (§16.4) |

Rules:

- Burn-in belongs to the **core** (Flame + Shape). Changing charms or knot keeps it. Changing the flame or shape
  starts a different core with its own saved burn-in (nothing is lost; switching back restores it).
- Child wicks in knots add their oil to the parent's core.
- Oil spent on a gutter counts.
- Duplicate strands become `strand_dust` (08-ITEMS-SHOPS.md §10). Odile "seasons" a wick with it: +25% of the oil
  needed for the next level, max 2 per wick per act (08 §18.4). The Ferry can move one core's burn-in to another
  (`ferry_burn_in_move`, 08).
- In Endless and Daily, burn-in is per run and starts at level 1 (Daily fixed class/wick), except for the Guild-mark
  unlock "Old Habits" (page 09) which starts every core at level 2.


### Materials

**Parked by R60: the v1 material reference, product materials, matrix and dig rules (flesh, slag, gravel, frost, void, poison/blessed/black water, lampstone).** Replaced by: §12 for the 36 built materials.

**(v1) 12.1 Material reference**

The cell simulation owns materials (`06-PHYSICS-RENDER.md`). The spell system needs these properties of each:

| Material (id) | Kind | Hardness | Flammable | Melts / freezes | Conducts | Notes for spells |
|---|---|---|---|---|---|---|
| stone (`stone`) | solid | 4 | no | — | no | the default wall |
| brick (`brick`) | solid | 3 | no | — | no | city walls; bile eats it |
| wood (`wood`) | solid | 2 | yes, burns 4 s → ash | — | no | planks, beams, doors |
| wax (`wax`) | solid | 1 | yes, slow (8 s) | melts at heat → molten wax (liquid) → cools back to wax in 6 s | no | Act 1 everywhere |
| dirt / silt (`dirt`, `silt`) | powder (dirt stays put, silt flows when wet) | 1 | no | — | no | silt + water → mud (slow) |
| sand (`sand`) | powder | 0 | no | heat 3 s → glass | no | falls |
| water (`water`) | liquid | — | no | freezes → ice; boils → steam | **yes** | |
| oil (`oil`) | liquid (floats on water) | — | yes, very (burns 6 s, spreads) | — | no | lamp-oil springs |
| steam (`steam`) | gas (rises) | — | no | cools → water after 5 s (1% per tick chance after that) | weak | lifts the player |
| ice (`ice`) | solid, slippery | 2 | no | melts → water | no | frozen waterfalls = ladders |
| glass (`glass`) | solid, see-through | 2 | no | — | no | shatters into sharp shards (hurt 2/s to walk on) |
| metal (`metal`) | solid | 5 | no | — | **yes** | grates, pipes, machines |
| moss (`moss`) | solid surface growth | 1 | yes, fast (1 s) | — | no | glows faintly green in Act 4 |
| ash (`ash`) | powder, light | 0 | no | — | no | from burnt things; blown by wind/rings |
| rope (`rope`) | solid strand | 1 | yes (2 s, then falls) | — | no | grapple ropes, bridges |
| flesh (`flesh`) | the cells of corpses and of fleshy enemy bodies | 1 | smoulders | — | yes (wet) | Ferrywitch raises from corpses in water |
| bone (`bone`) | solid | 2 | no | — | no | skeletons, ossuary walls |

Products that spells create (also materials in page 06): `fire` (burning cell state, not a material), `molten_wax`,
`mud`, `poison_water` (green, hurts 3/s to things in it), `blessed_water` (gold, see §13), `frost` (a 1-cell
slippery coat on a solid surface), `void` (Act 6 Shade only: an empty cell nothing can enter for 4 s), `slag`
(dissolved metal/brick, powder, hardness 0, falls), `glass_shard`, `black_water` (Shade in water, see §13).

**(v1) 12.2 The matrix**

Read a row as "this Flame hits cells of this material". "Radius" = the impact/burst/sweep radius of the shape.
All chances are **per cell per hit** unless stated. Everything here is also in `data/reactions.json` (§19.5).

| Material | Ember | Rime | Spark | Bile | Gleam | Tide | Shade |
|---|---|---|---|---|---|---|---|
| **stone** | scorch mark (cosmetic, 20 s) | frost coat on the surface (slippery, 12 s) | nothing | etch mark, no damage | lights it (afterglow) | wets it (sheen 10 s) | darkens it (cosmetic) |
| **brick** | scorch mark | frost coat | nothing | **dissolves**: 35% of brick cells in radius → slag | afterglow | wets | darkens |
| **wood** | **ignites** 60% per cell; fire spreads to touching wood 8%/tick-group (every 0.25 s); burns 4 s → ash | frost coat; burning wood is put out | ignites 15% (sparks) | softens: −1 hardness for 10 s (heavy can dig it) | nothing | puts out fire; wet wood can't ignite for 10 s | **rots** 25% → ash |
| **wax** | **melts** 100% → molten wax (flows, hurts 4/s while molten, cools to wax in 6 s); 20% ignite instead | hardens molten wax to wax at once; frost on solid | melts 20% | nothing | nothing | cools molten wax to wax at once | nothing |
| **dirt / silt** | dries silt (stops it flowing, 20 s); dig as shape allows | freezes mud/silt solid (hardness 2) for 15 s | nothing | nothing | nothing | dirt → mud (slow 50%), silt → flows | nothing |
| **sand** | heats: sand held under Ember for 3 s total (beam, linger) → **glass**; bolts alone: 10% glass | nothing | 5% → glass (fulgurite) | nothing | nothing | wet sand: stops falling for 15 s (packs, walkable) | nothing |
| **water** | **boils**: 30% of water cells in radius → steam (beam: 6 cells/tick); ≥ 20 cells boiled by one cast in 0.5 s → steam burst (§13.1) | **freezes**: all water cells in radius → ice; surface only for bolts (3 deep), full for lob/rune/ring | **electrifies** the connected body (§13.3) | 50% → poison water | **blesses** 30% → blessed water | **adds** water: bolt 6 cells, lob 40, ring 60, wave 30, beam 4/tick | 30% → black water (§13) |
| **oil** | **ignites** — the whole connected slick burns over 1.5 s spreading 60 cells/s; burning oil cell 8 dmg/s, burns 6 s | nothing; puts out burning oil | ignites 100% | thins: oil → poison water 20% | nothing | puts out burning oil only if covered (tide adds water that sinks under oil — it does **not** put it out unless the oil is on a solid floor) | nothing |
| **steam** | reheats: steam life +3 s | **condenses** 100% → water droplets (falls) | charges steam 3 s: anything in it takes 3/s spark (weak conductor) | → poison steam (hurts 2/s, 4 s) | nothing | condenses 50% → water | nothing |
| **ice** | **melts** 100% in radius → water | thickens: adds ice 2 cells around existing ice | nothing | etches: −1 hardness 10 s | lights through it (ice glows, afterglow ×2) | nothing | nothing |
| **glass** | nothing (hot glass: hurts 3/s to touch 4 s) | 20% crack; heavy/volatile → shards | nothing | nothing | glass **focuses**: light passing through glass is ×1.5 intensity (a lens) | nothing | nothing |
| **metal** | heats 5 s: touching it hurts 6/s | frost coat, slippery | **conducts**: current travels through connected metal up to 300 cells; enemies touching it take 50% of hit damage + shocked; machines on it power up | **corrodes**: 20% → slag; grates open, locks break | reflects: bolts of light (Gleam bolt) bounce once off metal for free | nothing | nothing |
| **moss** | ignites 100% (burns 1 s, fast spread 30%) | frosts (moss stops glowing 20 s) | nothing | kills 50% → dirt | **grows**: 1 moss cell next to each lit moss cell, max 20 per cast (soft floor/rope-grip surfaces) | wet moss: can't ignite 10 s | withers 100% → ash |
| **ash** | nothing | nothing | nothing | nothing | nothing | ash + water → mud | scatters (blown 4 cells) |
| **rope** | ignites 100% → burns 2 s then the rope snaps | frosts: slippery (climb 50% speed) 10 s | nothing | weakens: snaps under the next load | nothing | nothing | rots after 3 s → snaps |
| **flesh** (corpses, fleshy bodies) | cooks: corpse smoulders 5 s; corpse can't be raised (Ferrywitch) | freezes the corpse: it becomes a solid block (hardness 2) for 20 s — a platform | twitches: corpse jumps 10 cells (cosmetic, can knock a lever) | dissolves the corpse in 4 s → poison water pool | consecrates: corpse can't rise as Unlit (page 05 "Risen") | washes: moves the corpse with the water | **empowers**: corpse becomes a Shade husk that Ferrywitch raises at +30% health |
| **bone** | nothing | nothing | nothing | dissolves 25% → ash | **burns Unlit bone** (bone walls in Act 4 marked `unlit_bone` crumble 100%) | nothing | nothing |

Enemy bodies: enemies are **entities** (sprites with a cell-mask hitbox), not cells, for speed. Only corpses become
cells (`flesh`/`bone`, per the enemy's `corpse` field in page 05). The "flesh" column is therefore what happens to
corpses, and statuses (§4) are what happens to live enemies.

**(v1) 12.3 Dig and breaking**

- Each shape has a dig value (§5.1); heavy +1; volatile burst dig 2; lob/rune burst dig 1; steam burst dig 3.
- A burst with dig *d* breaks every cell in its radius with hardness ≤ *d*. Broken cells become **debris** of their
  material (sand → sand, wood → wood debris falls as loose cells, brick → slag, stone → gravel = sand-like powder,
  ice → water + ice shards).
- Max cells changed by one hit: 400 (radius 16 is ~800 cells; the outer ring gets a probability falloff of 50%).
- The world has **indestructible** cells (`bedrock`, `lampstone`) that nothing breaks; puzzles rely on them.


### Combos

**Parked by R44: the v1 combo table (20 combos); combos 6–16 and 19 (void rift, thermal crack, scald, toxic smoke, conductor, brittle, static frost, black water, sunfire, undertow, floodspark, grease fire) are parked.** Replaced by: §13 (8 combos).

**(v1) 13. Flame-meets-flame combos**

A combo happens when a flame hits something that is carrying another flame's effect (a status, or a cell product).
All combos are data rows in `data/combos.json` (§19.6). "Hit" = the triggering hit's damage after resist.

| # | Combo (id) | Needs | Trigger | Result | Numbers |
|---|---|---|---|---|---|
| 1 | **Steam burst** (`steam_burst`) | water | Ember boils ≥ 20 water cells within 0.5 s from one cast (or a lob bursting under water) | an explosion of steam | radius 20, damage 2.0× the hit, knockback 220 cells/s outward, dig 3, then all boiled cells become steam that **lifts** the player (steam column: upward 70 cells/s while inside) |
| 2 | **Shatter** (`shatter`) | Frozen target | any non-Rime hit, or melee | ends Frozen, big hit | +50% damage on that hit (×2.0 if heavy or melee heavy), 6 ice shards fly out, 30% of the hit each to others within 24 cells |
| 3 | **Electrified water** (`electrified`) | a water body | Spark hits water | everything in the connected water body takes damage | 60% of the hit every 0.5 s for 2.0 s, to every entity touching that water — **you too** (your resist applies). Body capped at 600 cells: beyond that, only cells within 150 cells of the hit conduct. Soaked targets take ×1.5. |
| 4 | **Burning slick** (`burning_slick`) | oil cells | Ember or Spark | the connected slick burns | spreads 60 cells/s, each burning oil cell 8 dmg/s, 6 s; oil floating on water burns on the surface (the water beneath is safe to swim in) |
| 5 | **Blessed water** (`blessed_water`) | water | Gleam | 30% of cells in radius → blessed water | blessed water: heals the player 4/s while in it, burns Unlit 6/s, lasts 20 s then reverts. Rime on blessed water → **holy ice** (hardness 3, glows). |
| 6 | **Void rift** (`void_rift`) | a Shade field (linger/rune/beam) | Gleam hits it (or the reverse) | a rift | pulls enemies and loose cells toward its centre 80 cells/s within radius 40 for 2.0 s, 25% of the hit per second to those inside; then collapses (radius 12 burst, 1.0× hit). Player is pulled at 30 cells/s. |
| 7 | **Thermal crack** (`thermal_crack`) | a target with Burn and Chill at once | applying the second of the two | **Cracked** | both statuses removed; Cracked: +25% damage taken, armour −20, for 4 s. Stone/brick cells with frost that get Ember: 30% crack (become gravel). |
| 8 | **Scald** (`scald`) | Soaked + Burning attempt (Ember on soaked) | Ember hit on soaked | burn is blocked but steam puffs | +30% damage on that hit as `ember`, 4 steam cells around the target, soaked removed |
| 9 | **Toxic smoke** (`toxic_smoke`) | poison water / corroded cells / Bile field | Ember | poison gas | a cloud radius 16, 4 s, 3 dmg/s to all (you too), rises slowly; blocks sight of enemies (they lose track) |
| 10 | **Conductor** (`conductor`) | metal cells | Spark | current in the metal (§12.2) | any enemy touching the network: 50% of hit + shocked; lever/machine on the network: activates |
| 11 | **Brittle** (`brittle`) | Corroded target | Rime freezes it | frozen corroded target | Shatter on it deals ×2.5 instead of ×1.5; corroded ice cells break at dig 0 |
| 12 | **Static frost** (`static_frost`) | Chilled target (≥ 3 stacks) | Spark | crit | the Spark hit is an automatic critical hit; chain jumps +1 |
| 13 | **Black water** (`black_water`) | water | Shade | 30% → black water | black water: no light passes through or reflects; things in it are hidden from Unlit and from you; drains 2 oil/s from the player while in it; Gleam turns it back (and triggers a small **void rift**, radius 20) |
| 14 | **Sunfire** (`sunfire`) | Burning target | Gleam | holy burn | all burn stacks now also count as radiance ×2 vs Unlit; Unlit that die while burning leave no corpse (can't rise) |
| 15 | **Undertow** (`undertow`) | Soaked target | Shade | drag | target pulled 60 cells/s toward the caster for 0.5 s |
| 16 | **Floodspark** (`floodspark`) | a Tide instance in flight | Spark instance meets it (touch) | the Tide instance becomes a moving electrified water body | +100% of the spark hit spread over everything the tide instance touches; very strong, very rare |
| 17 | **Glassblow** (`glassblow`) | sand | Ember beam/linger 3 s | glass (§12.2) | a Rime hit on hot glass → **shatter glass** (shards, 3 dmg/s area, 6 s) |
| 18 | **Mud trap** (`mud_trap`) | dirt/silt + water | Rime | frozen mud | mud cells with an enemy in them freeze it in place 2 s (as Frozen, bosses Numbed) |
| 19 | **Grease fire** (`grease_fire`) | molten wax | Ember | wax fire | molten wax burns like oil at half the rate (4 dmg/s, 8 s) — Mother Tallow's arena (page 05) |
| 20 | **Rime-lock** (`rime_lock`) | a tether of another flame | Rime hit on it | the tether turns into an ice span (keeps its remaining life) | the only way to make a walkable bridge from a climbable rope |

Combos never chain into themselves within 1.0 s (a steam burst cannot set off another steam burst from its own
steam). All combos are meter sources: `via: 'combo:<id>'`, credited to whoever cast the triggering hit.


### Resist

**Parked by R21: the v1 resist floor rule.** Replaced by: §14.1 (weak2 and heal allowed; bosses immune or heal to at most 2 flames).

- Floors: no flame is below −50 on a normal enemy, and bosses are never `immune` to more than 2 flames.


### Strands and slots

**Parked by R35: the v1 slots table (overcharge in Act 1).** Replaced by: §15.1.

**(v1) 15.1 Slots by progress (canon in 00-OVERVIEW §6)**

| When | Wick slots | Charm slots per wick | Knot slot | Overcharge |
|---|---|---|---|---|
| Start | 1 (holds the class's first starting wick; the second is ready-braided for slot 2, page 04 §6.2) | 0 | — | none (the `R` modifier is not bound yet) |
| Act 1 room 3 (Wick builder lesson) | 2 | 0 | — | **overcharge unlocked** (02 §2.2); the gutter roll is off until Act 2 mid, so Act 1 overcharge is always safe |
| Act 2 mid | 2 | 1 | — | gutter on |
| Act 3 start | 3 | 2 | — | — |
| Act 4 start | 3 | 2 | 1 per wick | — |
| Act 5 start | 4 | 2 | 1 | — |
| Act 6 start | 4 | 3 | 1 | mastery (§9.4) |

Class starting wicks (page 04) that already have more strands than the current slots allow keep them — they are
"Guild-braided" and locked until the slot count catches up (you cannot edit their extra charm, only remove it).
The builder is available at **any Lamp shrine and any rest point**; outside those, wicks can be swapped between
slots but not re-braided.

**Parked by R27: the v1 strand source table.** Replaced by: 09 §6.0 (linked from §15.2).

**(v1) 15.2 Where strands come from**

Prices, drop chances and the item ids (`strand_flame_*`, `strand_shape_*`, `strand_charm_*`) are owned by
08-ITEMS-SHOPS.md §10. This table fixes **which act's pool** each strand belongs to and the guaranteed way to get it.

| Act | Guaranteed on the main path | Shop `shop_wick` (Odile) also sells | Boss reward | Other |
|---|---|---|---|---|
| 1 | `ember` + `bolt` (start), `rime` (Wax Stair lesson room), `spark` (the dead lamp-lift puzzle), shape `arc` (Act 1 room 3 lesson) | `lob`, `ring`, `gleam` (if not Lamplighter) | Mother Tallow → pick 1 of `wave` / `lob` / `ring` | — |
| 2 | `bile` (Gutter cistern), `tether` (the Rope Lesson with the grapple), charm `split` (charm-slot lesson) | `bounce`, `swift`, `heavy`, `rune`, `wave` | Saint Gnaw → pick 1 of the Act 2 charms you do not own | — |
| 3 | `tide` (the Sluice lesson), charm `linger` | `pierce`, `seek`, `beam` | Sluicemaw → `beam` if not owned, else a charm of choice | Drowned Market: relic `split_choir` (§15.4) |
| 4 | `shade` (Moth Nave approach); **all four knots** as story unlocks: `on_hit` + `on_timer` in the Knot lesson room, `on_land` and `on_kill` on the main path (knots are never items, 08 §10) | `steady`, `vast`, `siphon` | Lampless Widow → a relic of choice (§15.4) | Drowned Market: relic `knot_twicetied` |
| 5 | charm `echo` (Bellwell lesson), relic strands in bell vaults | `volatile`, any missing strand | Bellfather → `volatile` if not owned, else 1 relic | Bell Tithe: cursed variants (§15.4) |
| 6 | 2 relic strands in secrets | everything still missing | — | — |

Rules:

- Every canon strand is **guaranteed** reachable (main path or shop) by the end of its act. Secrets hold only
  duplicates and relics.
- Enemy drops follow 08 §10 (rare, act-gated). A duplicate becomes `strand_dust`.
- **Endless / Daily**: you start with the class wicks only; strands drop from chests (1 per 3 floors) and from the
  floor-10/20/30… bosses. The pool widens by depth using the same act gates.

**Parked by the parked list (REVIEW §c): relic strands, including the Bell Tithe's cursed ones.** Replaced by: nothing; the 8 base charms only.

**(v1) 15.4 Relic strands (new names, not canon ids)**

Relics are **variants** of canon charms/knots. They count as the base id for conflicts and one-of-each.

| id | Variant of | Change |
|---|---|---|
| `split_choir` | split | 5 instances at ±20°, 0.40 each |
| `bounce_gutter` | bounce | 4 bounces, 0.92 each, only off solids |
| `pierce_needle` | pierce | unlimited enemies, 0.95 each, speed ×1.2, size ×0.6 |
| `linger_tallow` | linger | field is molten wax (hurts 4/s, slows 40%) + the flame's field |
| `heavy_anchor` | heavy | ×1.8 damage, speed ×0.4, dig +2 |
| `seek_moth` | seek | turn rate 480°/s, retargets unlimited, dmg ×0.80 |
| `vast_bell` | vast | size ×2.0, oil ×1.6, adds a stagger 0.4 s |
| `siphon_lampless` | siphon | 15% oil back, cap 50%, no health back |
| `echo_twin` | echo | copy at 80% but 0.8 s later |
| `knot_twicetied` | any knot | allows depth 2 (§8.2) on that wick only |
| `cursed_greed` (Bell Tithe) | siphon | 25% oil back uncapped, but you take 5% of your damage dealt |
| `cursed_haste` (Bell Tithe) | swift | cooldown ×0.5, but every cast costs 2 health |


### Builder

**Parked by R25: the v1 naming rule (Odile names at burn-in 5).** Replaced by: §16.2 (08's dish-name rule, any visit, free).

**(v1) 16.2 Naming**

The default name is generated: `<Flame> <Shape>` + ` of the <noun>` if 2+ charms, from a word table per charm
(split → "Choir", seek → "Moth", heavy → "Anvil", swift → "Sparrow", vast → "Bell", echo → "Twins", linger →
"Mourner", volatile → "Powderkeg", pierce → "Needle", bounce → "Gutter", siphon → "Leech", steady → "Watch").
Players can rename (24 characters). At burn-in 5, if you visit `shop_wick`, Odile "tastes" the wick and gives it a
name through Lingo (`lingo/data/packs/lanternfall.json` intent `odile_names_wick`) — the player may keep or discard it.


### Balance

**Parked by R37, R44, R79: the v1 simulator enumeration (12 charms, 4 knots, a cell-world stub) and the v1 knob block.** Replaced by: §17.2–§17.4.

**(v1) 17.2 The simulator (`tools/sim-wicks.mjs`)**

Headless Node script, no DOM, imports the same `js/spells/compile.js` and `js/spells/program.js` the game uses (with
a tiny cell-world stub that supports the four target setups).

**Inputs**: `data/flames.json`, `shapes.json`, `charms.json`, `knots.json`, `combos.json`, `data/balance.json`
(`spells` block), and a list of act pools from §15.

**Enumeration**: for each act 1–6, every legal wick from that act's pool:
7 flames × 8 shapes × (1 + 12 + 66 + 220 charm sets, filtered by §6.3 and §7) ≈ **9,500 legal wicks** at Act 6
before knots. Knotted wicks: each wick × 4 triggers × a fixed child list of 16 common children (sample, not all),
~600,000 — run with `--knots` only, sampled 5% by default.

**Target setups** (each run for 10 simulated seconds, bot aims perfectly, casts whenever off cooldown and oil
allows, starting with full oil, regen = the act's baseline in `balance.json`):

| Setup id | What | Measures |
|---|---|---|
| `single` | one 1,000,000 HP dummy at 120 cells, resist 0, armour 0 | raw damage per oil, DPS |
| `pack` | 5 dummies 24 cells apart at 100–200 cells, 150 HP each, respawning | area value, chain, pierce |
| `armoured` | one dummy armour 60, resist 25 to the tested flame | how armour/resist hurt it |
| `soaked_pool` | 3 dummies standing in a 60×12 water pool, soaked | combos: electrified, freeze, steam |
| `close` | 3 dummies rushing the bot at 40 cells/s from 150 cells | arc/ring/rune value, knockback |

**Outputs** to `research/wick-report.md` and `research/wick-report.json`:

- per act: median damage per oil (per setup), the top 20 and bottom 20 wicks, every wick **> 1.5× median** (flag) and
  **< 0.67× median** (dead) — with its full recipe and numbers;
- per charm: pick share among the top half, average multiplier effect;
- per flame and shape: medians;
- control score table (seconds of lost enemy action per oil);
- sustain check (any wick with net oil ≥ 0 over 10 s on `single` is a hard fail).

**CLI**: `node tools/sim-wicks.mjs --act 4 --setup pack --top 50 --knots --seed 1`. Deterministic (same seed = same
report). Runtime target: < 60 s for all acts without knots on one core.

**Test gate**: `tests/wick-balance.test.js` runs the sim for acts 1–6 without knots and fails if a wick is flagged
that is not in `data/balance.json` → `spells.allowFlags` (a list of wick hashes with a written reason). New flags
must be fixed or explicitly allowed.

**(v1) 17.3 Tuning knobs (`data/balance.json` → `spells`)**

```json
"spells": {
  "levelScalePerLevel": 0.04,
  "overcharge": { "maxOil": 2.0, "fillSeconds": 1.2, "exponent": 0.7, "maxBonus": 0.8, "safeLine": 1.4, "gutterMax": 0.6, "selfDamage": 0.4, "lockout": 1.5 },
  "burnIn": { "thresholds": [0, 400, 1200, 3000, 7000], "powerPerLevel": 0.06 },
  "charmDamageClamp": [0.35, 1.8],
  "charmOilClamp": 2.5,
  "knot": { "power": 0.6, "oil": 0.5, "maxChildrenPerCast": 12, "maxDepth": 1 },
  "globalCastGap": 0.1,
  "maxSpellLights": 64,
  "allowFlags": []
}
```


### Example builds

**Parked by R30, R44: the 16 v1 builds that use parked charms, knots, combos or classes (rows 3, 7, 9, 10, 12–18, 21, 23–26).** Replaced by: §18 keeps builds 1, 2, 4, 5, 6, 8, 11, 19, 20, 22.

| # | Name | Recipe | How it plays | Class |
|---|---|---|---|---|
| 3 | **Frost Ladder** | rime + lob [vast] | freezes whole waterfalls and pools into climbable ice | Sluicewarden |
| 7 | **Bell of Frost** | rime + ring [vast, steady] | a huge standing nova that freezes everything around you; shatter with melee | Bellringer |
| 9 | **Leech Line** | shade + beam [siphon] | a violet beam that pays its own oil back on big targets | Drowned Knight |
| 10 | **Holy Tether** | gleam + tether [linger] | a 60 s light rope: a climbable, healing, lit path through the dark | Moth Oracle |
| 12 | **Gutter Ricochet** | spark + bolt [bounce, pierce, swift] | fast pinball bolts down narrow sewer tunnels | Chimneysweep |
| 13 | **The Anvil** | ember + arc [heavy, steady] | point-blank 1.40 × 1.50 × 1.20 sweep that reflects projectiles | Drowned Knight |
| 14 | **Moth-Seeker** | gleam + bolt [seek, pierce] {on_kill → gleam + ring} | hunts Unlit in the dark; each kill flashes a healing nova | Moth Oracle |
| 15 | **Chain Reactor** | ember + lob {on_land → ember + rune} | every lob leaves a fire trap where it lands | Tinker |
| 16 | **Clockwork Candle** | ember + rune [vast] {on_timer → spark + bolt} | a rune that shoots a spark bolt every second while it waits | Tinker |
| 17 | **Undertow** | tide + beam [heavy] then shade + bolt | push a group into the pool, then drag one back with shade (undertow combo) | Ferrywitch |
| 18 | **Brittle Bones** | bile + wave [vast] then rime + ring | corrode a line, freeze them, shatter at ×2.5 | Bellringer |
| 21 | **Twin Bells** | spark + ring [echo, vast] | two chaining novas; stuns metal bell constructs twice | Bellringer |
| 23 | **Floodgate Keeper** | tide + rune [vast] | runes that dump 60 cells of water when stepped on: put out fires, wash enemies off ledges | Sluicewarden |
| 24 | **Sun Lance** | gleam + beam [steady, vast] (mastered) | a 5-wide holy beam from a planted stance, the Act 6 finisher | Lamplighter |
| 25 | **Oarsmen's Wake** | shade + wave {on_kill → tide + bolt} | kills in water become corpses you raise; wave carries on | Ferrywitch |
| 26 | **Leech Swarm** | bile + bolt [split_choir, siphon] | five weak corroding bolts that each pay back oil | any Act 3+ |

(Build 18 shows the builder's refusal in action: pierce is not allowed on wave, so the recipe uses vast.)


### Data and code

**Parked by R4: the v1 JSON shapes for flames, shapes, charms, knots, reactions, combos, a saved wick and the Strand Case.** Replaced by: 10 §5 owns shapes; §19 lists which values live where.

**(v1) 19. Data: JSON files and schemas**

All in `prototypes/lanternfall/data/`. Page 10 owns the file layout; these are the shapes.

**(v1) 19.1 `flames.json`**

```json
{
  "schema": 1,
  "flames": [
    {
      "id": "ember", "name": "Ember", "power": 12, "oilMult": 1.0,
      "colour": "#ff8a2a", "lightMult": 1.1, "lightIntensity": 1.0,
      "flicker": { "amp": 0.12, "hz": 8, "mode": "sine" },
      "status": { "id": "burn", "stacks": 1, "maxStacks": 5, "perStackPct": 0.20, "tick": 0.5, "duration": 3.0 },
      "tether": { "kind": "fuse", "life": 6, "crossDamageMult": 1.5, "climbable": true },
      "overchargeGutter": "fire_at_feet",
      "sfx": { "launch": "ember.launch", "travel": "ember.travel", "impact": "ember.impact" },
      "unlockAct": 0
    }
  ]
}
```

**(v1) 19.2 `shapes.json`**

```json
{ "schema": 1, "shapes": [
  { "id": "bolt", "name": "Bolt", "mult": 1.0, "oil": 8, "perSecond": false,
    "cooldown": 0.35, "castTime": 0, "speed": 320, "gravity": 0, "size": 2, "lifetime": 1.2,
    "light": 26, "dig": 0, "hits": "first", "overcharge": true,
    "allowedCharms": ["split","bounce","pierce","linger","heavy","swift","seek","vast","siphon","echo","volatile","steady"],
    "charmOverrides": {} }
] }
```

`charmOverrides` holds the "changed meaning" rows of §7 as data, e.g.
`"split": { "pattern": "fork", "count": 3, "angles": [-8, 0, 8], "width": 1 }` for beam.

**(v1) 19.3 `charms.json`**

```json
{ "schema": 1, "charms": [
  { "id": "split", "name": "Split", "base": "split", "relic": false,
    "dmgMult": 0.55, "oilMult": 1.3, "cdMult": 1, "speedMult": 1, "sizeMult": 0.8, "lifeMult": 1,
    "params": { "count": 3, "spreadDeg": 12 },
    "conflicts": [], "unlockAct": 2, "nameWord": "Choir" }
] }
```

`conflicts` lists hard ✗ pairs (heavy↔swift, swift↔steady, volatile↔steady). Special "!" rules are in code, named by
id in `compile.js`, each with a unit test.

**(v1) 19.4 `knots.json`**

```json
{ "schema": 1, "knots": [
  { "id": "on_hit", "name": "Hitknot", "powerMult": 1.0, "oilMult": 1.0, "perInstanceGap": 0.25, "maxPerCast": 3, "unlockAct": 4 }
] }
```

**(v1) 19.5 `reactions.json` (flame × material)**

One row per non-empty cell of the §12.2 matrix.

```json
{ "schema": 1, "reactions": [
  { "flame": "ember", "material": "water", "chance": 0.30, "to": "steam",
    "beamPerTick": 6, "comboCheck": "steam_burst", "note": "boils" },
  { "flame": "ember", "material": "wood", "chance": 0.60, "ignite": { "burn": 4.0, "spreadChance": 0.08, "spreadEvery": 0.25, "to": "ash" } },
  { "flame": "rime", "material": "water", "chance": 1.0, "to": "ice", "depthByShape": { "bolt": 3, "default": 999 } },
  { "flame": "spark", "material": "metal", "conduct": { "maxCells": 300, "damagePct": 0.5, "status": "shocked", "powers": true } }
] }
```

Fields: `chance` (per cell per hit), `to` (material id it becomes), `ignite`, `conduct`, `coat` (frost/sheen with a
duration), `hardnessDelta` + `duration`, `grow` (moss), `lightGlow`, `hurtWhileTouching`, `comboCheck` (a combo id
to test after applying).

**(v1) 19.6 `combos.json`**

```json
{ "schema": 1, "combos": [
  { "id": "shatter", "name": "Shatter",
    "needs": { "targetStatus": "frozen" }, "trigger": { "notFlame": "rime", "orMelee": true },
    "effect": { "damageMult": 1.5, "heavyDamageMult": 2.0, "endStatus": "frozen",
                "shards": { "count": 6, "pct": 0.30, "radius": 24 } },
    "selfImmuneSeconds": 1.0 }
] }
```

`needs` may be `targetStatus`, `targetStatusAll` (list), `cellMaterial`, `fieldFlame`, `instanceFlame`;
`trigger` is `flame`, `flames`, `notFlame`, `orMelee`, `shapeIn`, `minCells`.

**(v1) 19.7 A wick (in the save, page 10)**

```json
{
  "slot": 2,
  "id": "w_7f3a",
  "name": "Ember Bolt of the Choir",
  "flame": "ember",
  "shape": "bolt",
  "charms": ["split", "seek"],
  "mastered": false,
  "knot": { "trigger": "on_hit", "child": { "flame": "spark", "shape": "ring", "charm": null } },
  "locked": false
}
```

and the core burn-in table, kept separately so it survives re-braids:

```json
"burnIn": { "ember:bolt": 1850, "rime:lob": 420 }
```

Wick hash (for caching, the balance allow list and the meter): `flame:shape:charms(sorted):knotTrigger:childFlame:childShape:childCharm`,
e.g. `ember:bolt:seek+split:on_hit:spark:ring:-`.

**(v1) 19.8 The Strand Case (in the save)**

```json
"strands": {
  "flames": ["ember","rime","spark","gleam"],
  "shapes": ["bolt","arc","lob","ring"],
  "charms": ["split"],
  "knots": [],
  "relics": []
}
```

**Parked by R61: the v1 file list, SpellProgram typedef, bytecode op table and per-frame notes.** Replaced by: §20 (the compile-once design as built: a flat cast plan, one handler per shape, charm hooks on events). A bytecode is an optional later speed-up.

**(v1) 20. Code: the compiled spell program**

Files (page 10 has the whole tree):

```
js/spells/
  data.js        loads and validates flames/shapes/charms/knots/reactions/combos JSON (throws on unknown ids)
  compile.js     compileWick(wick, stats, data) → SpellProgram  (pure; no DOM, no world)
  program.js     cast(program, caster, aim, charge) → spawns instances; step(dt) runs all instances
  pool.js        typed-array pools for instances, fields, runes, tethers
  status.js      apply/tick statuses on entities
  reactions.js   applyFlameToCells(world, flame, x, y, radius, dig, shapeId) using reactions.json
  combos.js      checkCombos(event) using combos.json
  light.js       pushSpellLights(lightBuffer) each frame (merge to 64)
  builder-ui.js  the Wick builder screen + preview mini-sim
tools/sim-wicks.mjs
```

**(v1) 20.1 SpellProgram (the compiled shape)**

Compiling does all multiplication once, so the per-frame code is only lookups.

```js
/** @typedef {Object} SpellProgram
 *  @property {string} hash            wick hash (§19.7)
 *  @property {string} flame, shape
 *  @property {number} damage          per hit, final before target (§2.1 without target terms)
 *  @property {number} oil             per cast (or per second for beam)
 *  @property {boolean} perSecond
 *  @property {number} cooldown, castTime, speed, gravity, size, lifetime, dig
 *  @property {number} count           instances per cast (split)
 *  @property {number[]} anglesDeg     spread per instance
 *  @property {Object} light           { radius, intensity, colour: [r,g,b], negative: bool, flicker }
 *  @property {Object} status          { id, stacks, perStackPct, tick, duration } | null
 *  @property {Uint8Array} ops         bytecode for events (below)
 *  @property {Float32Array} args      numeric arguments for ops
 *  @property {SpellProgram|null} child  knot child (compiled with the 0.6 / 0.5 factors)
 *  @property {Object} knot            { trigger, gap, maxPerCast, powerMult }
 *  @property {Object} echo            { delay: 0.35, power: 0.6 } | null
 *  @property {boolean} overcharge     allowed?
 */
```

**(v1) 20.2 Events and ops**

Each instance runs a tiny list of ops on each event. Events: `SPAWN`, `TICK`, `HIT_ENEMY`, `HIT_CELL`, `BOUNCE`,
`END`. Op codes (one byte each, with args in the `args` array):

| Op | Args | Effect |
|---|---|---|
| `DAMAGE` | mult | deal `program.damage × mult` to the hit entity (through §14) |
| `STATUS` | stacksBonus | apply the flame's status |
| `KNOCK` | cellsPerSec | knockback impulse |
| `REACT` | radius, dig | `reactions.applyFlameToCells` |
| `BURST` | radius, mult, dig | area damage + react |
| `FIELD` | radius, pct, seconds | spawn a linger field |
| `BOUNCE` | count, mult | reflect the velocity, decrement |
| `PIERCE` | count, mult | continue instead of dying, decrement |
| `SEEK` | turnDegPerSec, range | steer (on TICK) |
| `CHAIN` | jumps, falloff, range | spark chain |
| `CHILD` | trigger id | fire the knot child if budget allows |
| `SIPHON` | oilPct, hpPct, capPct | return resources |
| `LIGHT_FLASH` | radius, seconds | end flash |
| `DIE` | — | free the instance |

Example compiled ops for "ember + lob [heavy, volatile] {on_land → ember + rune}":

```
SPAWN:     —
TICK:      —
HIT_ENEMY: BURST(14×1.2, 1.0, dig 2) STATUS(+1) KNOCK(280) LIGHT_FLASH(40, .25) END→
HIT_CELL:  BURST(...) ... CHILD(on_land)
END:       BURST(16, 0.6, dig 2)   ; volatile
           DIE
```

**(v1) 20.3 Per-frame evaluation**

- `pool.js` keeps instances in struct-of-arrays typed arrays (x, y, vx, vy, life, programIndex, bouncesLeft,
  pierceLeft, targetId, flags) with a cap of **512 instances**, **64 fields**, **3 runes and 2 tethers per caster**.
  Over the cap, the oldest non-rune instance is recycled.
- `step(dt)` for each live instance: move (sub-stepped so a 320 cells/s bolt never skips a cell: step length ≤ 2
  cells, using a DDA line walk over the cell grid), test cells along the path for solids, test the entity grid (a
  32-cell spatial hash) for enemies, fire events and run their ops.
- Statuses tick in `status.js` at their own tick rates using an accumulator per status.
- Reactions write into the cell world through `world.setCell()` only, never directly into typed arrays from spell code,
  so the sim's dirty-chunk tracking stays correct (page 06).
- Compiled programs are cached by `hash + statsVersion`; `statsVersion` increments whenever level, attributes or gear
  change.
- Everything is deterministic given the run seed (random rolls from `shared/ui.js` seeded rng, one stream for spells),
  so the Daily and the balance sim reproduce.

