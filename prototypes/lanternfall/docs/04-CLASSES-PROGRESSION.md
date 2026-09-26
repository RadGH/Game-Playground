# LANTERNFALL — page 04: Classes and progression

> **One line:** the 8 classes (stats, movement, melee frame data, passive, starting wicks, class ability, a
> 24-node skill board each), the five attributes and their formulas, derived stats, the XP curve, respec,
> unlock-challenge tracking and difficulty.

Canon (class ids, roles, starting kit, unlock challenges, attribute names, +3/+1 per level, cap 30) comes from
`00-OVERVIEW.md` §7 and §9. Spell numbers are in `03-SPELLS.md`; weapons and gear in `08-ITEMS-SHOPS.md` §5;
keys and screens in `02-CONTROLS-UI.md`; enemy poise, tiers and XP values in `05-BESTIARY-BOSSES.md` §2.

## Contents

1. [Words used on this page](#1-words-used-on-this-page)
2. [The shared body (every class)](#2-the-shared-body-every-class)
3. [Melee: shared rules](#3-melee-shared-rules)
4. [Attributes](#4-attributes)
5. [Derived stats](#5-derived-stats)
6. [Classes at a glance](#6-classes-at-a-glance)
7. [Skill boards: shared rules](#7-skill-boards-shared-rules)
8. [Lamplighter](#8-lamplighter-lamplighter)
9. [Sluicewarden](#9-sluicewarden-sluicewarden)
10. [Tinker](#10-tinker-tinker)
11. [Ferrywitch](#11-ferrywitch-ferrywitch)
12. [Bellringer](#12-bellringer-bellringer)
13. [Drowned Knight](#13-drowned-knight-drowned_knight)
14. [Moth Oracle](#14-moth-oracle-moth_oracle)
15. [Chimneysweep](#15-chimneysweep-chimneysweep)
16. [Unlock challenges: tracking rules](#16-unlock-challenges-tracking-rules)
17. [Levels and XP](#17-levels-and-xp)
18. [Respec](#18-respec)
19. [Difficulty and progression](#19-difficulty-and-progression)
20. [Recommended builds per class](#20-recommended-builds-per-class)
21. [Data: JSON files and schemas](#21-data-json-files-and-schemas)
22. [Code and tests](#22-code-and-tests)
23. [Proposed canon changes](#23-proposed-canon-changes)

---

## 1. Words used on this page

| Word | Meaning |
|---|---|
| **Effective points** | An attribute's value after its soft cap is applied (§4.2). All formulas use effective points. |
| **Soft cap** | A point count after which each extra point is worth less (half, then a quarter). There is no hard cap. |
| **Frame data** | How long each part of an attack lasts, in milliseconds: **startup** (wind-up, before it can hit), **active** (the window it hits in), **recovery** (after, when you cannot act). |
| **Poise** | A stagger meter. Hits fill an enemy's poise; when full it staggers (05 §5.1). The player has poise too (§5). |
| **Cancel** | Ending an attack's recovery early by doing something else (a dodge, a jump). Each move says what cancels it. |
| **Node** | One square on the skill board. Some nodes have **ranks** (can be bought up to 3 times). |
| **Capstone** | The big node at the bottom of each branch. You may own only one capstone at a time. |
| **Class ability** | The class-unique action on its own key (`class_ability`, proposed `Y` / gamepad `LB`, §23). |
| **Area level** | The level of the room you are in (05 §2.3). XP from kills scales with it. |

---

## 2. The shared body (every class)

These are the numbers every class starts from; each class section lists only its differences.
Scale (brief): 1 cell = 1 art pixel, player 6 × 12 cells, gravity 900 cells/s², 60 fps fixed step.

| Thing | Base value | Notes |
|---|---|---|
| Walk | 60 cells/s | crouch-walk 30 (02 §2.1) |
| Run | 95 cells/s | acceleration 0 → run in 0.12 s on ground, 0.25 s in air |
| Jump | apex 34 cells (hold 0.22 s), hop apex 18 | take-off speed 247 cells/s; coyote time 90 ms; jump buffer 110 ms |
| Air control | 80% of ground acceleration | |
| Max fall speed | 420 cells/s | fall damage from 120 cells of drop: 10% max health per 20 cells over 120 |
| Dodge (`Q`) | 44 cells in 0.28 s; invulnerable 0–180 ms; 0.6 s recovery before the next dodge | can be used in the air once per airtime; cancels melee recovery and cast time (cast oil refunded) |
| Climb (rope/ladder) | 40 cells/s up, 60 down | 02 §2.1 |
| Swim (Act 3+) | 45 cells/s, kick +40 cells/s up (0.5 s cooldown) | |
| Breath | 12 s, then 8% max health per second | 01, 07 §2.10 |
| Carry (plank kit) | 6 planks + 1 per 4 Might | Tinker ×2; building rules in 07 |
| Tonic capacity | 3 + 1 per 5 Might (effective) | tonic numbers in 08 §9.2 |
| Lantern | the equipped lantern's radius and dark burn (08 §5.1) | |
| Health | `60 + 8 × Nerve + 6 × (level − 1)` | +6 per level (02's level-up banner) |
| Oil | `75 + 5 × Draught + 4 × (level − 1)` | +4 per level |
| Oil regen | `3.0 + 0.1 × Draught` per second | always on; ×difficulty (§19) |
| Oil from melee | **+1.5 oil per enemy hit by a melee swing** (max 3 enemies per swing) | the pole feeds the lantern: melee is the sustain, wicks are the burst |
| Invulnerability after being hit | 600 ms (flashing) | not after void-zone ticks (those tick every 0.5 s) |

---

## 3. Melee: shared rules

- **Controls**: `pole` (mouse right) tap = light combo; hold 0.35 s = heavy (02 §2.2). In the air, tap = air
  attack; `S` + tap in the air = plunge.
- **Light combo**: 3 hits. The next press is accepted from the start of the current hit's active window to
  **300 ms** into its recovery (buffer 150 ms). If no press, the combo resets after the recovery.
- **Damage**: `weaponRoll × move% × meleeMult × crit`, where `weaponRoll` is the weapon's damage range (08 §5.2)
  and `meleeMult = 1 + 0.02 × Might_eff + gear%`. Melee damage type is `physical` (armour applies, 03 §14).
- **The weapon's swing time** (08 §5.2) is the **total** length of combo hit 1; every class table below adds up to
  that number for hit 1. Attack speed bonuses shorten startup and recovery, never active frames.
- **Cancels**: any melee move's recovery can be cancelled by dodge after 60% of the recovery has passed, and by
  jump on the ground after 80%. Casting a wick cancels nothing (you must finish the swing).
- **Hitboxes** are rectangles in front of the player's centre, sizes in cells as `width × height`, placed from the
  front edge of the body.
- **Knockback** in cells/s (the weapon's value, 08 §5.2, × move multiplier). **Poise damage** per hit to enemies
  (05 §5.1).
- **Non-lethal heavy.** A fully charged heavy against a target tagged `subduable` (cultists, thieves, some
  humans — 05) cannot take it below 1 HP; at 1 HP it is **knocked out** and stays down for the room. This is the
  "pole's non-lethal charge" of 01 (the Bell Tithe's prices watch for it, 08 §16).
- **Pogo**: a plunge that hits an enemy or a breakable bounces the player up 24 cells and restores the air dodge.
- Melee hits apply **Shatter** to Frozen targets (03 §13 #2): light ×1.5, heavy ×2.0.
- Melee hits the cell world: heavy hits break cells of hardness ≤ 1 in the hitbox (wax, moss, dirt, ash, sand,
  rope); light hits do not. Some classes change this.

Frame-data columns in the class sections: **Move · Startup / Active / Recovery (ms) · Damage (% of weapon roll)
· Hitbox (cells) · Knockback × · Poise · Notes.**

---

## 4. Attributes

### 4.1 What one point gives

| Attribute | Per effective point | Soft cap |
|---|---|---|
| **Might** | +2% melee damage · +1 knockback (cells/s) on melee and spells · +1% crit damage · tonic capacity +1 per 5 · plank carry +1 per 4 | 20 |
| **Wick** | +2% spell power (`wickBonus` in 03 §2.1) · +1% status potency (burn/corrode DoT, chill/soak/radiance durations) | 25 |
| **Draught** | +5 max oil · +0.1 oil regen per second · −1% lantern dark burn (Act 4+, max −30%) | 20 |
| **Nerve** | +8 max health · +2% stagger resistance (player poise, §5) · +0.5 to every flame resist (max +15 from Nerve) | 25 |
| **Knack** | +0.3% crit chance · +1% build speed · +1% interact speed (levers, sluice wheels, trap disarm, lock picking) · +1% loot find | 20 |

### 4.2 Soft caps

```
eff(points, cap) = min(points, cap)
                 + 0.50 × clamp(points − cap,     0, cap)
                 + 0.25 × max(points − 2 × cap,   0)
```

Example: Wick 40 with cap 25 → 25 + 0.5 × 15 = **32.5** effective → spell power +65%.
The Attributes screen (02 §16.2) shows the effective value next to the raw one once a cap is passed, and the
`[+]` button's tooltip says "this point is worth 50%".

### 4.3 Points

- Every class starts with **25 points** spread by the class (§6). Nothing is free to place at level 1.
- **+3 attribute points per level** (canon). Levels 2–30 give 87 → 112 total at level 30.
- Endless beyond 30: +2 per level (§17.3).
- A point placed is permanent until a respec (§18). Points can be staged and undone on the screen before Confirm
  (02 §16.2).

---

## 5. Derived stats

Every stat the game reads, its formula, and where it comes from. All live in `js/stats.js` `derive(character)`,
recomputed when level, attributes, gear, meals, blessings or board nodes change (it bumps `statsVersion`, which
recompiles wicks, 03 §20.3). Every one has a tooltip that lists its sources (02 §16.2).

| Stat (id) | Formula | Typical L1 → L30 |
|---|---|---|
| `maxHealth` | `(60 + 8·Nerve_eff + 6·(L−1)) × classHp + gearFlat` then `× (1 + gear%)` | 100 → ~380 before gear |
| `maxOil` | `(75 + 5·Draught_eff + 4·(L−1)) × classOil + gearFlat` | 100 → ~250 |
| `oilRegen` | `(3.0 + 0.1·Draught_eff) × (1 + gear%) × difficulty` | 3.5 → ~5.5 /s |
| `oilOnMelee` | 1.5 per enemy hit (max 3 per swing) + class/board | 1.5 |
| `armour` | class base + gear (08 §3); `taken × 100/(100+armour)` | 0–15 → ~240 |
| `resist.<flame>` (7) + `resist.physical` | class + 0.5·Nerve_eff (max +15) + gear + board; cap +75 (Sluicewarden `sw_a7`: Tide +85) | 0 → 30–50 |
| `critChance` | `5% + 0.3%·Knack_eff + gear + board` | 5% → 12–20% |
| `critMult` | `1.50 + 0.01·Might_eff + gear` | 1.55 → 1.8 |
| `meleeMult` | `1 + 0.02·Might_eff + gear%` | 1.10 → 1.6 |
| `spellMult` (`wickBonus`) | `0.02·Wick_eff` (+ gear `wick_power_pct`, lantern) | +10% → +70% |
| `statusPotency` | `1 + 0.01·Wick_eff` | |
| `levelScale` | `1 + 0.04·(L−1)` for spells (03 §2.1); melee uses the weapon's item level instead | 1.00 → 2.16 |
| `castSpeed` | `1 + gear` (shortens cast time and cooldowns, 03 §2.3) | |
| `walk`, `run` | class value × `(1 + move_speed%)` | 60/95 |
| `jumpApex` | class value + boots `jump_height` | 34 |
| `airJumps` | 0 (Chimneysweep 1, +1 from `cs_c4`) | |
| `dodgeDistance`, `dodgeIframes` | class table (§6) | 44 / 180 ms |
| `poise` (player) | `30 + 2·Nerve_eff`; enemy hits add their `poiseDamage` (05); full = staggered 400 ms; resets after 2 s without hits | 40 → 80 |
| `staggerResist` | `2%·Nerve_eff + gear` (reduces poise damage taken, max 60%) | 10% → 50% |
| `knockbackTaken` | `1 − kbResist` (class/board/gear) | |
| `breath` | 12 s + gear `breath` + class | 12 |
| `swim` | 45 × class × gear | |
| `climb` | 40 × (1 + rope_speed%) | |
| `ropeSwingForce` | 1.0 × class × board | |
| `buildSpeed` | `1 + 0.01·Knack_eff + gear` × class | |
| `interactSpeed` | `1 + 0.01·Knack_eff` | |
| `lootFind` | `0.01·Knack_eff + gear loot_find` | |
| `lightRadius` | lantern radius × (1 + light_radius%) | 64 |
| `darkBurn` | lantern dark burn × (1 − 0.01·Draught_eff, max −30%) × board | 1.0 /s |
| `lifeSteal` | class + weapon implicit + board (as % of damage dealt; spells count at half) | 0 |
| `tonicCap` | `3 + floor(Might_eff / 5)` | 4 |
| `plankCap` | `6 + floor(Might_eff / 4)` × class | 7 |

---

## 6. Classes at a glance

### 6.1 Base numbers

Attributes are the starting 25-point spread: **Might / Wick / Draught / Nerve / Knack**.

| Class | M/W/D/N/K | Health × | Oil × | Armour | Walk / Run | Jump apex | Dodge | Resist (base) | Weapon (08 §5.2) | Lantern (08 §5.1) |
|---|---|---|---|---|---|---|---|---|---|---|
| Lamplighter | 5/7/6/4/3 | ×1.00 | ×1.20 (lantern) | 0 | 60 / 95 | 34 | roll 44 cells, 180 ms | gleam +10 | `wpn_pole` | `lantern_guild` |
| Sluicewarden | 6/4/4/8/3 | ×1.10 | ×1.00 | 5 (+10 lantern) | 55 / 85 | 30 | **Brace** (block, §9) | tide +25, rime +10, spark −15 | `wpn_hookstaff` + bulwark shield | `lantern_hook` |
| Tinker | 4/5/5/4/7 | ×1.00 | ×1.00 | 0 | 60 / 90 | 32 | roll 40 cells, 160 ms | spark +15 | `wpn_wrench` | `lantern_wrench` |
| Ferrywitch | 3/7/6/4/5 | ×0.95 | ×1.10 | 0 | 58 / 92 | 32 | **Glide** 52 cells over water surfaces, 180 ms | tide +15, shade +15 | `wpn_oarstaff` | `lantern_tin` |
| Bellringer | 7/5/4/6/3 | ×1.05 | ×1.00 | 5 | 55 / 88 | 30 | roll 40 cells, 160 ms; tolls on landing (§12) | spark +15, physical +10 | `wpn_handbell` | `lantern_tin` |
| Drowned Knight | 7/4/3/8/3 | ×1.15 | ×0.90 | 10 | 57 / 88 | 30 | **Sink-step** 36 cells, 200 ms | tide +25, shade +10, ember +10, spark −25 | `wpn_anchor` | `lantern_tin` |
| Moth Oracle | 3/7/5/4/6 | ×0.95 | ×1.05 | 0 | 62 / 97 | 34 | **Flutter** 48 cells in any of 8 directions, 200 ms | gleam +15, shade +15 | `wpn_mothlamp_rod` | `lantern_moth` |
| Chimneysweep | 5/4/4/4/8 | ×0.85 | ×1.00 | 0 | 64 / 105 | 38 + double jump | roll 50 cells, 180 ms, can cancel into wall-run | ember +15 | `wpn_brushspear` | `lantern_tin` |

Weapons that 08 lists with "Req act 2+" (e.g. `wpn_oarstaff`) are **starting items for their own class** at
item level 1 regardless of the drop gate.

### 6.2 Starting wicks

Canon for the first three; the others are this page's choice. A starting wick **grants the strands in it** (so a
Sluicewarden owns `tide` from the start even though the Tide strand is otherwise an Act 3 unlock). Wick slot 1
holds the first wick; the second is ready-braided and drops into slot 2 when it opens (Act 1 room 3, 03 §15.1).

| Class | Slot 1 | Slot 2 | Why |
|---|---|---|---|
| Lamplighter | **Ember Bolt** (`ember`+`bolt`) | **Gleam Ring** (`gleam`+`ring`) | canon: a ranged poke and a close panic button that heals |
| Sluicewarden | **Tide Wave** (`tide`+`wave`) | **Rime Arc** (`rime`+`arc`) | canon: push them into water, then freeze them in it |
| Tinker | **Spark Rune** (`spark`+`rune`) | **Ember Lob** (`ember`+`lob`) | canon: traps and grenades |
| Ferrywitch | **Tide Bolt** (`tide`+`bolt`) | **Bile Lob** (`bile`+`lob`) | soak and knock enemies into water; acid pools make corpses in water |
| Bellringer | **Spark Ring** (`spark`+`ring`) | **Rime Wave** (`rime`+`wave`) | area control: stun and slow what comes at you |
| Drowned Knight | **Tide Arc** (`tide`+`arc`) | **Bile Bolt** (`bile`+`bolt`) | a close sweep that knocks back, and armour stripping for the anchor |
| Moth Oracle | **Gleam Bolt** (`gleam`+`bolt`) | **Rime Rune** (`rime`+`rune`) | light at range; a trap to hold an Unlit still while you mark it |
| Chimneysweep | **Ember Arc** (`ember`+`arc`) | **Spark Tether** (`spark`+`tether`) | rope master: a live-wire rope from the first minute |

### 6.3 Classes and the world (building, ropes, water)

| Class | Building (07) | Ropes & grapple (07) | Water |
|---|---|---|---|
| Lamplighter | normal (build speed ×1.0) | normal | normal |
| Sluicewarden | braces hold +25% weight | grapple pull-in ×0.8 (heavy) | walks through water at full speed; not moved by currents; turns sluice wheels 2× fast; Floodwall holds water |
| Tinker | build ×1.5 speed, planks cost 1 less scrap, carry ×2, dismantle own builds for full refund, turrets | normal | normal; turrets short out if submerged (Spark turret shocks the water instead) |
| Ferrywitch | ×0.8 build speed | normal | Glide dodge on water surfaces; breath 24 s; raises corpses in water |
| Bellringer | ×1.0; can **ring** a placed plank (melee) to shake loose cells above it | normal | normal; tolls carry through water (radius ×1.5 underwater) |
| Drowned Knight | ×0.8 | grapple range −20% (heavy armour) | **never drowns**; sinks instead of floating; walks the bottom at full speed; swims up only 30 cells/s |
| Moth Oracle | ×1.0 | normal; can glide (hold jump in air: fall ≤ 60 cells/s) | normal |
| Chimneysweep | ×1.2 | rope swing force ×1.25, climb ×1.5, grapple range +20%, can wall-run (0.6 s, up to 40 cells) | normal |

---

## 7. Skill boards: shared rules

### 7.1 Layout

Every board is a grid of **5 columns (A–E) × 7 rows**, 24 nodes, in three branches:

```
Row 1                 [C1]                          root
Row 2           [B2]  [C2]  [D2]
Row 3     [A3]  [B3]  [C3]  [D3]  [E3]
Row 4     [A4]  [B4]  [C4]  [D4]  [E4]
Row 5     [A5]  [B5]  [C5]  [D5]  [E5]
Row 6           [B6]        [D6]
Row 7     (A7)        (C7)        (E7)              capstones  ✦
          └ left ┘  └ centre ┘  └ right ┘
```

- **Left branch** = columns A–B, **centre** = C, **right** = D–E. Each class names its branches.
- Node id = `<class prefix>_<column><row>` in lower case, e.g. `ll_b4`. Prefixes: `ll` Lamplighter,
  `sw` Sluicewarden, `tk` Tinker, `fw` Ferrywitch, `br` Bellringer, `dk` Drowned Knight, `mo` Moth Oracle,
  `cs` Chimneysweep.
- **Prerequisites** (the same for every board; the class tables repeat them in the "Needs" column):
  C1 → B2, C2, D2. B2 → A3, B3. C2 → C3. D2 → D3, E3. Then every node needs the node **directly above** it
  (A3 → A4 → A5 → A7; B3 → B4 → B5 → B6; C3 → C4 → C5 → C7; D3 → D4 → D5 → D6; E3 → E4 → E5 → E7).
  B6 and D6 are side nodes with no children.
- **Capstones** (row 7) also need **8 points spent in that branch** (left capstone A7: columns A–B; centre C7:
  column C plus C1; right E7: D–E).

### 7.2 Costs and ranks

| Row | Cost per rank | Ranks |
|---|---|---|
| 1–3 | 1 | numeric nodes up to 3 ranks, special nodes 1 |
| 4–5 | 2 | numeric up to 3, special 1 |
| 6 | 2 | 1 |
| 7 (capstone) | 3 | 1 |

- A node needs **one rank** of its prerequisite, not all ranks.
- **One capstone at a time.** Buying a second capstone is refused ("You carry Lanternheart. Respec at the Ferry
  to change it."). Capstones are the class's three "ways to play".
- **Skill points**: +1 per level (canon: 29 by level 30) + **1 per Great Lamp relit** (6) = **35** in the campaign.
  A full board costs ~70, so a character fills about half of it. Endless: +1 skill point every 3 levels past 30.
- Board text on the screen is **generated from the node's numbers** (02 §16.1), so the tables below are the data.

### 7.3 Effect kinds

Every node effect is one of these kinds in `data/boards.json` (§21.3), so code handles a short list:
`stat` (adds to a derived stat), `flameMult` (per-flame damage %), `shapeMult`, `status` (changes a status
number), `ability` (changes the class ability's numbers), `move` (changes one melee move), `rule` (a named
hook in code: e.g. `ll_fresh_wick`), `unlock` (an action or build part). `rule` nodes each have a unit test.

---

## 8. Lamplighter (`lamplighter`)

*Balanced caster-duelist. The Guild's own. A pole that feeds the lantern, a lantern that feeds the pole.*

### 8.1 Body and passive

- Base numbers in §6.1. Oil ×1.20 comes from the Guild Pole-Lantern's implicit (08 §5.1), so the bonus follows
  the lantern; the passive below does not.
- **Passive — Fresh Wick** (`ll_fresh_wick`): the first wick cast after **3.0 s** without casting costs **0 oil**
  (the icon on the oil bar glows gold when ready). Overcharge extra oil is still paid (only the base cost is free).
- **Oil from melee**: 2.5 per enemy hit instead of 1.5.

### 8.2 Melee — Lamplighter's Pole (swing 420 ms, reach 18)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Jab | 110 / 60 / 250 | 100% | 18 × 6 at chest | 1.0 | 8 | fast poke |
| Light 2 — Sweep | 130 / 70 / 260 | 110% | 18 × 14 arc | 1.0 | 8 | hits low and high |
| Light 3 — Lantern Crack | 180 / 80 / 340 | 160% | 20 × 14 | 2.3 | 18 | the lantern flares: ignites flammable cells it touches (as Ember, 03 §12) |
| Heavy — Guild Swing | charge 350 + 120 / 90 / 380 | 250% | 22 × 16 | 3.3 | 35 | non-lethal vs `subduable`; breaks hardness ≤ 1 cells |
| Air — Hook Swing | 90 / 60 / 200 | 90% | 18 × 10 | 1.0 | 6 | can be done twice per airtime |
| Plunge — Pole Vault | 120 / until landing / 220 | 180% | 10 × 8 below | 2.0 | 20 | falls 300 cells/s; pogo 24 cells |
| Running — Charge Poke | 90 / 100 / 300 | 130% | 20 × 6 | 2.0 | 14 | tap while running; carries 20 cells of momentum |

### 8.3 Class ability — Beacon (`ability_beacon`)

Plant a ghost of your lantern-flame on the spot (ground or wall within 24 cells).

| Number | Value |
|---|---|
| Oil / cooldown | 20 oil / 30 s |
| Duration | 12 s |
| Light | radius 80, colour of your selected wick's flame, intensity 1.2 |
| Inside it | your wicks +15% power; your oil regen ×2; enemies inside are revealed (drawn lit, 03 §4 radiance look) |
| Unlit (Act 4) | they will not enter the radius for its first 3 s (they flinch), then attack the beacon (HP 60 + 10/level) |
| World | counts as a lit sconce for light-sensitive doors (03 §11.4) |

### 8.4 Skill board — branches: **Wickcraft** (left) · **Guild** (centre) · **Pole** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `ll_c1` | Guild Oath | 1 | 1 | — | +10 max oil, +5% spell power |
| `ll_b2` | Trimmed Wick | 1 | 3 | c1 | wick oil cost −4% |
| `ll_c2` | Oil Habit | 1 | 3 | c1 | +8 max oil |
| `ll_d2` | Pole Drill | 1 | 3 | c1 | light combo +6% damage |
| `ll_a3` | Hot Ember | 1 | 1 | b2 | burn max stacks 5 → 6 |
| `ll_b3` | Quick Braid | 1 | 3 | b2 | wick cooldowns −4% |
| `ll_c3` | Wide Lantern | 1 | 3 | c2 | lantern light radius +8% |
| `ll_d3` | Riposte | 1 | 1 | d2 | Light 2 (Sweep) reflects enemy projectiles of size ≤ 3 like the `arc` shape (03 §5.3) |
| `ll_e3` | Vaulter | 1 | 1 | d2 | plunge pogo +12 cells and +20% plunge damage |
| `ll_a4` | Kindling | 2 | 3 | a3 | Ember hits on burning targets +6% damage |
| `ll_b4` | Guild Temper | 2 | 1 | b3 | overcharge safe line +0.10 (03 §9.2) |
| `ll_c4` | Fresher Wick | 2 | 1 | c3 | Fresh Wick recharges in 2.0 s instead of 3.0 s |
| `ll_d4` | Flare Crack | 2 | 1 | d3 | Heavy releases a burst of your selected wick's flame, radius 12, 60% of that wick's power, 0 oil (cooldown 4 s) |
| `ll_e4` | Long Pole | 2 | 2 | e3 | pole reach +2 cells |
| `ll_a5` | Lampfire | 2 | 3 | a4 | burn tick damage +8% |
| `ll_b5` | Deep Draught | 2 | 3 | b4 | oil regen +5% |
| `ll_c5` | Beacon Keeper | 2 | 1 | c4 | Beacon lasts 18 s, radius 110 |
| `ll_d5` | Spellblade | 2 | 1 | d4 | each pole hit takes 0.10 s off all wick cooldowns (max 0.3 s per swing) |
| `ll_e5` | Guard Stance | 2 | 1 | e4 | while charging a heavy, frontal damage taken −40% |
| `ll_b6` | Burn-in Scholar | 2 | 1 | b5 | burn-in oil gain +25% (03 §10) |
| `ll_d6` | Momentum | 2 | 1 | d5 | Light 3 restores 4 oil on hit |
| `ll_a7` ✦ | **Lanternheart** | 3 | 1 | a5 + 8 in left | once every 20 s, a cast released past the safe line **cannot gutter** and gets +20% power |
| `ll_c7` ✦ | **Sixfold Light** | 3 | 1 | c5 + 8 in centre | Beacon heals you 3% max health per second, and your wicks cost 25% less inside it |
| `ll_e7` ✦ | **Lamp-Pole Master** | 3 | 1 | e5 + 8 in right | Light 3 also casts your selected wick for free at 50% power (cooldown 2 s, no overcharge) |

---

## 9. Sluicewarden (`sluicewarden`)

*Tank and water control. A hook-staff, a bulwark shield, and the patience of a lock-keeper.*

### 9.1 Body and passive

- Heavier: walk 55, run 85, jump 30. Health ×1.10, armour 5 + 10 (Hook-Staff Lamp implicit).
- **Dodge is replaced by Brace**: hold `dodge` (`Q`) to raise the bulwark shield. Frontal damage −70%, frontal
  knockback −80%, walk 50%, no run. **Perfect block**: a hit landing within **150 ms** of raising it is blocked
  100% and deals 20 poise to the attacker (melee attackers only). Tap `Q` = **shield step** 20 cells, invulnerable
  0–120 ms. Blocking a hit costs 2 oil (the shield is oiled leather), not stamina.
- **Passive — Lock-keeper** (`sw_lockkeeper`): walks through water at full speed; not moved by currents or
  undertow; sluice wheels turn 2× fast; +25 Tide resist (in the table).
- The shield also blocks **void-zone** projectiles but never ground void zones.

### 9.2 Melee — Hook-Staff (swing 480 ms, reach 20)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Gaff | 130 / 60 / 290 | 100% | 20 × 6 | 1.0 | 10 | implicit: pulls small enemies 12 cells toward you (08) |
| Light 2 — Staff Sweep | 150 / 80 / 300 | 110% | 20 × 16 arc | 1.2 | 10 | |
| Light 3 — Shield Bash | 160 / 70 / 380 | 140% | 12 × 12 | 2.5 | 30 | shield-first: frontal damage −70% during startup and active |
| Heavy — Sluice Hook | charge 350 + 150 / 100 / 420 | 230% | 24 × 10 | pull | 30 | hooks and **drags** the target 30 cells toward you (small/standard; heavy with `sw_e7`); non-lethal vs `subduable` |
| Air — Hook Down | 110 / 60 / 220 | 90% | 20 × 10 below-front | 1.0 | 8 | catches ledges: if the hitbox touches a solid corner, you hang on it |
| Plunge — Anchor Drop | 150 / until landing / 300 | 160% | 14 × 8 | 2.0 | 25 | on water: a splash ring radius 20 that soaks (03 §4) |
| Braced Bash (block + `pole`) | 90 / 60 / 300 | 80% | 10 × 12 | 2.0 | 20 | usable while bracing; `sw_d6` makes it stagger |

### 9.3 Class ability — Floodwall (`ability_floodwall`)

Slam the staff: a wall of packed silt rises in front of you.

| Number | Value |
|---|---|
| Oil / cooldown | 20 oil / 14 s |
| Size | 4 cells thick × 24 tall, 8 cells in front of you, rises in 0.25 s (pushes anything on top up) |
| Material | `silt` packed to hardness 2 (03 §12.1); holds water back; blocks projectiles; enemies can break it (HP 120 + 12/level) |
| Duration | 15 s, then slumps into loose silt |
| Tricks | wall off a flood, make a step to climb, block a corridor while runes do the work, trap water to freeze |

### 9.4 Skill board — **Tidecaller** (left) · **Warden** (centre) · **Hook** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `sw_c1` | Warden's Oath | 1 | 1 | — | +15 max health, +5 armour |
| `sw_b2` | Wet Hands | 1 | 3 | c1 | Tide and Rime damage +5% |
| `sw_c2` | Brace Up | 1 | 3 | c1 | +4 armour |
| `sw_d2` | Hook Reach | 1 | 2 | c1 | hook-staff reach +2 |
| `sw_a3` | Undertow | 1 | 3 | b2 | Tide knockback +10% |
| `sw_b3` | Cold Water | 1 | 1 | b2 | Frozen needs 4 chill stacks (2 if Soaked) |
| `sw_c3` | Shield Wall | 1 | 2 | c2 | Brace frontal reduction +5% (70 → 80%) |
| `sw_d3` | Haul | 1 | 1 | d2 | Gaff pull works on standard enemies |
| `sw_e3` | Wader | 1 | 3 | d2 | swim speed +8% |
| `sw_a4` | High Tide | 2 | 2 | a3 | your Tide spells make +25% water cells |
| `sw_b4` | Hard Frost | 2 | 2 | b3 | Frozen lasts +0.25 s |
| `sw_c4` | Perfect Seal | 2 | 1 | c3 | perfect-block window 150 → 220 ms |
| `sw_d4` | Gaff Throw | 2 | 1 | d3 | Heavy can be released early to **throw** the hook 60 cells (pulls the target, or you to a wall) |
| `sw_e4` | Sluicehand | 2 | 1 | e3 | levers and wheels 50% faster; you can turn a wheel while bracing |
| `sw_a5` | Riptide | 2 | 3 | a4 | Soaked enemies take +5% from all your damage |
| `sw_b5` | Ice Mason | 2 | 1 | b4 | ice you make is hardness 3 and melts 50% slower |
| `sw_c5` | Floodwall II | 2 | 1 | c4 | Floodwall 36 tall, lasts 25 s, HP ×1.5 |
| `sw_d5` | Drag Under | 2 | 1 | d4 | hooked enemies become Soaked |
| `sw_e5` | Deep Lungs | 2 | 2 | e4 | breath +4 s |
| `sw_b6` | Reservoir | 2 | 1 | b5 | standing in water ≥ 8 cells deep: oil regen +40% |
| `sw_d6` | Bulwark Bash | 2 | 1 | d5 | Braced Bash deals 40 poise (staggers standard enemies) |
| `sw_a7` ✦ | **Tidewright** | 3 | 1 | a5 + 8 in left | Tide resist cap 85; your Tide hits heal you 5% of their damage while you stand in water |
| `sw_c7` ✦ | **Unbreaking Dam** | 3 | 1 | c5 + 8 in centre | while bracing you cannot be staggered and reflect 30% of blocked damage to the attacker |
| `sw_e7` ✦ | **Leviathan's Hook** | 3 | 1 | e5 + 8 in right | hook drags heavies and elites; a dragged target takes the heavy hit again at 150% on arrival |

---

## 10. Tinker (`tinker`)

*Builder, traps, turrets. The Scrapwright's favourite customer.*

### 10.1 Body and passive

- Walk 60, run 90, jump 32. Dodge 40 cells, invulnerable 160 ms.
- **Passive — Scrap Sense** (`tk_scrap_sense`): build speed ×1.5; planks and braces cost 1 less scrap (min 0);
  plank carry ×2; dismantle any of your builds (hold `interact` 0.4 s) for a full refund; sees the load on every
  plank (a colour tint: white fine, yellow stressed, red about to fail — 07).
- Wrench implicit (08): hitting your own construct repairs it 8 HP.

### 10.2 Melee — Tinker's Wrench (swing 360 ms, reach 14)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Tap | 90 / 50 / 220 | 100% | 14 × 6 | 0.8 | 6 | |
| Light 2 — Twist | 100 / 60 / 230 | 105% | 14 × 10 | 0.8 | 6 | |
| Light 3 — Spanner Clout | 150 / 70 / 320 | 170% | 16 × 12 | 2.0 | 18 | on a machine: jolts it (counts as 1 s of power) |
| Heavy — Overhand | charge 350 + 120 / 80 / 360 | 240% | 16 × 14 | 2.5 | 30 | non-lethal vs `subduable`; breaks hardness ≤ 2 cells (the Tinker knows where to hit) |
| Air — Flip | 80 / 50 / 200 | 85% | 14 × 10 | 0.8 | 5 | |
| Plunge — Hammer Drop | 120 / until landing / 260 | 170% | 12 × 8 | 2.0 | 20 | driving a plunge onto your own plank **nails** it (+50% hold) |
| Repair (on own build) | 100 / 50 / 200 | — | 14 × 12 | — | — | +8 HP to a turret/plank, +16 with `tk_e5` |

### 10.3 Class ability — Turret (`ability_turret`)

Deploy a small tripod turret at your feet (or on a plank). 08's `gad_turret_ember` gadget uses these stats.

| Number | Value |
|---|---|
| Cost / cooldown | 15 oil + 3 scrap / 8 s |
| Max out | 2 (3 with `tk_c5`); a new one past the cap removes the oldest |
| Health | 60 + 8 × level; armour 20 |
| Fires | the **flame of your slot-1 wick** as a bolt (03 §5.2 numbers), power 0.5 × that flame's base, every 0.8 s, range 160, turns 180°/s |
| Duration | 40 s, or until destroyed |
| Water | submerged turrets short out (a Spark turret instead electrifies the water once, 03 §13 #3) |
| Threat | enemies treat a turret as a target (05 §4 attack tokens) |

### 10.4 Skill board — **Sparkwright** (left) · **Engineer** (centre) · **Carpenter** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `tk_c1` | Spare Parts | 1 | 1 | — | turret health +20% |
| `tk_b2` | Wiring | 1 | 3 | c1 | Spark damage +5% |
| `tk_c2` | Toolbelt | 1 | 3 | c1 | plank carry +2, +1 gadget charge (08 §18.3) |
| `tk_d2` | Quick Hammer | 1 | 3 | c1 | build speed +10% |
| `tk_a3` | Hair Trigger | 1 | 1 | b2 | runes arm in 0.25 s |
| `tk_b3` | Rune Satchel | 1 | 1 | b2 | max runes 3 → 4 |
| `tk_c3` | Oiled Gears | 1 | 3 | c2 | turret fire rate +8% |
| `tk_d3` | Braces | 1 | 2 | d2 | planks hold +25% weight; support span +2 cells (07) |
| `tk_e3` | Salvage | 1 | 1 | d2 | dismantling returns +1 scrap per piece |
| `tk_a4` | Overcoil | 2 | 1 | a3 | Spark chain +1 jump |
| `tk_b4` | Floating Runes | 2 | 1 | b3 | runes can be placed on water surfaces (they bob) |
| `tk_c4` | Selector Switch | 2 | 1 | c3 | turrets fire your **selected** wick's flame and, if it is bolt/lob/ring, its shape |
| `tk_d4` | Iron Braces | 2 | 1 | d3 | unlocks the `brace_iron` build part: hardness 5, conducts Spark (03 §12.2 metal) |
| `tk_e4` | Double Repair | 2 | 1 | e3 | wrench repair 8 → 16 |
| `tk_a5` | Capacitor | 2 | 1 | a4 | a Spark Rune that fires powers any machine it touches for 10 s |
| `tk_b5` | Trap Engineer | 2 | 3 | b4 | rune damage +8% |
| `tk_c5` | Twin Turrets | 2 | 1 | c4 | max turrets 2 → 3 |
| `tk_d5` | Scaffold | 2 | 1 | d4 | unlocks `ladder_kit`: 3 planks as a ladder in one placement |
| `tk_e5` | Quick Deploy | 2 | 1 | e4 | turret cooldown 8 → 5 s |
| `tk_b6` | Detonator | 2 | 1 | b5 | hitting your own rune with melee detonates it at +50% power |
| `tk_d6` | Pulleys | 2 | 1 | d5 | unlocks the `pulley_lift` build part (2 rope + 1 `gear_bronze`, lifts 80 cells) |
| `tk_a7` ✦ | **Storm Engine** | 3 | 1 | a5 + 8 in left | every rune detonation also fires a free Spark Bolt at 60% at the nearest enemy |
| `tk_c7` ✦ | **Walking Turret** | 3 | 1 | c5 + 8 in centre | your newest turret follows you (60 cells/s along the ground, hops 16 cells) and never times out |
| `tk_e7` ✦ | **Master Builder** | 3 | 1 | e5 + 8 in right | planks cost no scrap; your builds have +100% health; you can build in the air (build-mode ghost placed mid-jump) |

---

## 11. Ferrywitch (`ferrywitch`)

*Summoner of the drowned dead. Unlock: defeat the Sluicemaw without leaving the water for more than 10 s at a time.*

### 11.1 Body and passive

- Walk 58, run 92, jump 32. Health ×0.95, oil ×1.10.
- **Dodge is Glide**: 44 cells on land; on a water surface she skims **52 cells** and ends standing on the water
  for 0.4 s (can jump from it). Invulnerable 0–180 ms.
- **Passive — Cold Blood** (`fw_cold_blood`): breath 24 s; each living Oarsman gives +4% spell power.
- Corpses: an enemy that dies with its centre in water ≥ **8 cells** deep leaves a **raisable corpse** (glowing
  violet ripple) for 20 s. The Oar-Staff implicit (08) makes even tiny enemies leave one.

### 11.2 Melee — Oar-Staff (swing 470 ms, reach 22)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Pole Stroke | 120 / 70 / 280 | 100% | 22 × 6 | 1.0 | 8 | |
| Light 2 — Back Stroke | 130 / 80 / 290 | 110% | 22 × 10 front + 10 × 10 behind | 1.0 | 8 | hits behind too |
| Light 3 — Feather | 170 / 90 / 360 | 150% | 24 × 14 arc | 1.8 | 16 | on water: throws a splash (soaks, 03 §4) |
| Heavy — Deep Stroke | charge 350 + 150 / 100 / 400 | 230% | 26 × 12 | 2.5 | 28 | pushes a wave of water 12 cells ahead if you stand in water; non-lethal vs `subduable` |
| Air — Scull | 100 / 60 / 220 | 90% | 22 × 10 | 1.0 | 6 | |
| Plunge — Mooring Post | 140 / until landing / 280 | 160% | 12 × 8 | 1.5 | 20 | pinned enemy: rooted 0.5 s |
| On-water — Paddle Sweep | 110 / 80 / 260 | 120% | 26 × 8 at water level | 1.5 | 10 | replaces Light 1 while gliding |

### 11.3 Class ability — Raise Oarsman (`ability_raise`)

Target the nearest raisable corpse within 80 cells (or the one under the aim). It rises as an **Oarsman**.

| Number | Value |
|---|---|
| Oil / cooldown | 12 oil / 4 s |
| Max Oarsmen | 3 (4 with `fw_a4`, 5 with `fw_a7`) |
| Health | 40% of the corpse's max health, minimum 30 |
| Damage | oar swing `8 + 2 × level` physical, every 0.9 s, reach 16; +15% with `wpn_oarstaff_black` |
| Speed | swim 70 cells/s; on land 50% speed and loses 5% max health per second |
| Duration | 60 s |
| AI | follows at 30 cells; attacks your target (last enemy you hit) else the nearest; **pulls** small enemies into water |
| Look | a drowned rower, grey-green, with your selected flame's colour in its eyes |
| Meter | Oarsmen are a source (`via: 'summon:oarsman'`) under the player |

### 11.4 Skill board — **Crew** (left) · **Ferry** (centre) · **Oar** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `fw_c1` | Toll of the Ferry | 1 | 1 | — | Oarsman health +15% |
| `fw_b2` | Fetch | 1 | 3 | c1 | Oarsman damage +6% |
| `fw_c2` | Grave Tithe | 1 | 3 | c1 | raising heals you 5 health |
| `fw_d2` | Oar Drill | 1 | 3 | c1 | oar combo +6% damage |
| `fw_a3` | Long Shift | 1 | 2 | b2 | Oarsman duration +15 s |
| `fw_b3` | Boarding Hooks | 1 | 1 | b2 | Oarsmen grab an enemy and drag it into water (1 s, standard or smaller) |
| `fw_c3` | Deep Current | 1 | 1 | c2 | corpses rise from water ≥ 4 cells deep (was 8) |
| `fw_d3` | Paddle | 1 | 3 | d2 | swim speed +8% |
| `fw_e3` | Rowing Stroke | 1 | 1 | d2 | Heavy's wave: 20 cells, knockback 120 |
| `fw_a4` | Crewed | 2 | 1 | a3 | max Oarsmen +1 (4) |
| `fw_b4` | Land Legs | 2 | 1 | b3 | Oarsmen on land lose 2%/s (was 5%) |
| `fw_c4` | Cold Blood II | 2 | 1 | c3 | breath 36 s; underwater cast time −30% |
| `fw_d4` | Oar Parry | 2 | 1 | d3 | the first 150 ms of Heavy's charge parries a melee hit (0 damage, attacker +30 poise) |
| `fw_e4` | Ferryman's Due | 2 | 2 | e3 | oar kills in water restore 3 oil |
| `fw_a5` | Drowned Chorus | 2 | 2 | a4 | Cold Blood's spell power per Oarsman +1% |
| `fw_b5` | Shade Crew | 2 | 1 | b4 | Oarsmen raised from Shade-empowered corpses (03 §12.2 flesh) deal Shade damage and have +30% health |
| `fw_c5` | Wake | 2 | 1 | c4 | an Oarsman that expires or dies bursts as a Tide Ring at 50% of your Tide Ring power |
| `fw_d5` | Riverbed Walk | 2 | 1 | d4 | walk on the bottom at 80% speed (instead of swimming) |
| `fw_e5` | Last Stroke | 2 | 2 | e4 | Light 3 on a Soaked target +15% |
| `fw_b6` | Charon's Coin | 2 | 1 | b5 | raising costs 8 oil |
| `fw_d6` | Dead Weight | 2 | 1 | d5 | every enemy you kill in water leaves a corpse regardless of depth |
| `fw_a7` ✦ | **Admiral of the Drowned** | 3 | 1 | a5 + 8 in left | max Oarsmen 5; Oarsmen have no timer (they last until killed or the room ends) |
| `fw_c7` ✦ | **Black Ferry** | 3 | 1 | c5 + 8 in centre | once per 60 s, lethal damage turns you into a ghost boat for 4 s (invulnerable, 50 cells/s, passes enemies) then you return at 30% health |
| `fw_e7` ✦ | **Oar of the Deep** | 3 | 1 | e5 + 8 in right | oar hits on an enemy in water chain to the next enemy in the same water body (up to 3, 70% each, like Spark chain) |

---

## 12. Bellringer (`bellringer`)

*Sound, stagger, area control. Unlock: ring all 12 Silent Bells hidden across Acts 1–4.*

### 12.1 Body and passive

- Walk 55, run 88, jump 30. Health ×1.05, armour 5.
- **Passive — Toll** (`br_toll`): every **4th hit you land** (melee or spell, any target) **tolls**: a sound pulse,
  radius 32 around the target, 25 poise to every enemy in it, 20% of that hit as physical damage. Canon "spells can
  carry a toll": the toll counter is shown as 4 pips under the health bar. A toll through water has ×1.5 radius.
- Dodge 40 cells, invulnerable 160 ms; landing from a dodge in the air tolls (free, once per 4 s).
- Standing next to a big bell (07) and hitting it = a Great Toll with no oil cost (once per bell per room).

### 12.2 Melee — Hand-Bell and Maul (swing 560 ms, reach 16)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Clang | 160 / 70 / 330 | 100% | 16 × 10 | 1.2 | 14 | implicit 15% stagger on hit (08) |
| Light 2 — Backhand Bell | 150 / 70 / 330 | 100% | 16 × 12 | 1.2 | 14 | the hand-bell rings: +1 toll pip |
| Light 3 — Overhead Maul | 220 / 90 / 420 | 200% | 18 × 16 | 2.5 | 35 | shakes loose cells of hardness ≤ 1 in a 10-cell radius above the hit |
| Heavy — Tolling Blow | charge 400 + 180 / 100 / 480 | 280% | 20 × 18 | 3.0 | 50 | always tolls; non-lethal vs `subduable` |
| Air — Swinging Bell | 120 / 70 / 260 | 90% | 16 × 12 | 1.2 | 10 | |
| Plunge — Ground Knell | 180 / until landing / 360 | 200% | 24 × 8 (both sides) | 2.0 | 30 | tolls on landing |
| Ring (on a plank) | 150 / 70 / 300 | — | 16 × 10 | — | — | shakes loose the cells above a plank you built (07) |

### 12.3 Class ability — Great Toll (`ability_great_toll`)

| Number | Value |
|---|---|
| Oil / cooldown | 20 oil / 18 s |
| Area | sound wave radius 80 around you (×1.5 underwater), expands in 0.3 s |
| Effect | 60 poise to every enemy (staggers standards and most heavies); 0.6 s stun to fodder/standard; 15 physical damage + 3 × level |
| World | cells of hardness ≤ 1 on **ceilings** within the radius fall (rubble); enemy projectiles in the radius drop |
| Tolled spells | your next **3** casts carry a toll: +25% radius on bursts/rings/runes, and each hit tolls (bypassing the 4-hit counter) |
| Sound | `lf.class.great_toll` (sfx), and every Silent Bell in the room hums |

### 12.4 Skill board — **Knell** (left) · **Bell** (centre) · **Maul** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `br_c1` | Clear Note | 1 | 1 | — | toll radius +6 |
| `br_b2` | Resonant Wick | 1 | 1 | c1 | toll every **3rd** hit instead of every 4th |
| `br_c2` | Sturdy Frame | 1 | 3 | c1 | +8 max health |
| `br_d2` | Heavy Hands | 1 | 3 | c1 | maul damage +5% |
| `br_a3` | Ringing Spells | 1 | 3 | b2 | tolled spells +5% damage |
| `br_b3` | Echo Chamber | 1 | 1 | b2 | your Echo charm copy is 70% instead of 60% (03 §6.1) |
| `br_c3` | Deafening | 1 | 1 | c2 | tolls stun fodder 0.4 s |
| `br_d3` | Ringing Blow | 1 | 1 | d2 | Light 3 always tolls |
| `br_e3` | Shake Loose | 1 | 1 | d2 | Heavy on a wall or ceiling drops loose cells in radius 10 |
| `br_a4` | Carrying Note | 2 | 1 | a3 | tolls travel along connected metal up to 120 cells (hits enemies touching it) |
| `br_b4` | Harmonics | 2 | 1 | b3 | two tolls within 1 s of each other make a **double toll** (radius ×2, poise ×2) |
| `br_c4` | Great Toll II | 2 | 1 | c3 | Great Toll cooldown 18 → 14 s |
| `br_d4` | Bellmaker's Grip | 2 | 1 | d3 | heavy charge time −25% |
| `br_e4` | Quake Step | 2 | 1 | e3 | plunge landing radius +12 |
| `br_a5` | Knell | 2 | 3 | a4 | enemies staggered by your tolls take +7% spell damage for 2 s |
| `br_b5` | Tuned Bronze | 2 | 2 | b4 | Spark vs `metal`-tagged enemies +10% |
| `br_c5` | Unmoved | 2 | 1 | c4 | stagger resist +30%; knockback taken −50% |
| `br_d5` | Crusher | 2 | 3 | d4 | maul vs staggered enemies +8% |
| `br_e5` | Rubble Maker | 2 | 1 | e4 | falling cells you shook loose deal +50% (05 §6) |
| `br_b6` | Silent Step | 2 | 1 | b5 | while Great Toll is on cooldown, tolls do not wake sleeping enemies and your crit chance is +10% |
| `br_d6` | Anvil Chorus | 2 | 1 | d5 | each maul hit on a staggered enemy extends its stagger 0.2 s (max +0.6 s per stagger) |
| `br_a7` ✦ | **The Twelfth Bell** | 3 | 1 | a5 + 8 in left | Great Toll also casts your selected wick in 8 directions at 50% (bolt/lob/wave; other shapes cast once at 100%) |
| `br_c7` ✦ | **Bellfather's Voice** | 3 | 1 | c5 + 8 in centre | Great Toll flips gravity for enemies in the radius for 1.5 s: they fall up, then down, taking fall damage (05 §6) |
| `br_e7` ✦ | **Tower Maul** | 3 | 1 | e5 + 8 in right | a fully charged Heavy also sends a physical `wave` both ways along the ground (03 §5.8 numbers, 200% of the heavy's damage) |

---

## 13. Drowned Knight (`drowned_knight`)

*Lifesteal bruiser who breathes water. Unlock: die 3 times underwater, then clear an act without dying.*

### 13.1 Body and passive

- Walk 57, run 88, jump 30. Health ×1.15, oil ×0.90, armour 10.
- **Passive — Drowned** (`dk_drowned`): never drowns (breath infinite); sinks instead of floating (40 cells/s);
  walks the bottom at full walk speed; swims up only 30 cells/s (kick +25); **life steal 5%** of melee damage and
  2.5% of spell damage (the weapon's implicit adds to this). Spark resist −25 (the wet armour).
- **Dodge is Sink-step**: 36 cells, invulnerable 0–200 ms; underwater it has no slowdown.

### 13.2 Melee — Anchor-Blade (swing 540 ms, reach 20)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Fluke Cut | 150 / 70 / 320 | 100% | 20 × 8 | 1.2 | 14 | |
| Light 2 — Chain Swing | 160 / 90 / 320 | 115% | 20 × 16 arc | 1.2 | 14 | |
| Light 3 — Keel Crush | 220 / 90 / 420 | 190% | 20 × 16 | 2.5 | 32 | underwater: no drag penalty |
| Heavy — Anchor Fall | charge 380 + 170 / 100 / 460 | 270% | 22 × 18 | 3.0 | 45 | non-lethal vs `subduable`; breaks hardness ≤ 2 |
| Air — Chain Arc | 120 / 80 / 260 | 95% | 22 × 12 | 1.2 | 10 | |
| Plunge — Sinker | 150 / until landing / 320 | 210% | 16 × 10 | 2.0 | 30 | falls 360 cells/s through water too |
| Underwater Light (any) | as above | +10% | as above | ×0.8 | as above | the Knight fights best below |

### 13.3 Class ability — Undertow Chain (`ability_undertow_chain`)

Throw the anchor on its chain.

| Number | Value |
|---|---|
| Oil / cooldown | 10 oil / 7 s |
| Range | 90 cells, flies 400 cells/s |
| On a fodder/standard enemy | yanks it to you (arrives in 0.25 s), 150% melee damage, lifesteal ×2 for 3 s |
| On a heavy, elite, boss, or solid cell | yanks **you** to it at 300 cells/s (a grapple), lifesteal ×2 for 3 s |
| Underwater | range ×1.3, no slowdown |
| Misses | returns; 50% cooldown |

### 13.4 Skill board — **Abyss** (left) · **Oath** (centre) · **Anchor** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `dk_c1` | Brine Blood | 1 | 1 | — | life steal +1% |
| `dk_b2` | Sunken Wick | 1 | 3 | c1 | spells cast while underwater +5% damage |
| `dk_c2` | Rust and Brine | 1 | 3 | c1 | +3 armour and +3 Tide resist |
| `dk_d2` | Chainwork | 1 | 3 | c1 | anchor combo +5% |
| `dk_a3` | Leech Tide | 1 | 1 | b2 | the Siphon charm also returns +2% as health |
| `dk_b3` | Pressure | 1 | 1 | b2 | underwater cast time −30% |
| `dk_c3` | Oathbound | 1 | 3 | c2 | +12 max health |
| `dk_d3` | Long Chain | 1 | 1 | d2 | Undertow Chain range 90 → 120 |
| `dk_e3` | Keel | 1 | 2 | d2 | knockback taken −15% |
| `dk_a4` | Drowned Flame | 2 | 1 | a3 | your Ember works underwater at 50% power and each hit makes a small steam burst (radius 8) |
| `dk_b4` | Hungry Deep | 2 | 1 | b3 | life steal ×2 against Soaked targets |
| `dk_c4` | Second Breath | 2 | 1 | c3 | below 25% health, life steal ×2 |
| `dk_d4` | Anchor Sweep | 2 | 1 | d3 | Heavy becomes a 360° spin, radius 24 |
| `dk_e4` | Sinker's Burst | 2 | 1 | e3 | Plunge that lands underwater bursts as a Tide Ring at 80% |
| `dk_a5` | Vampiric Shade | 2 | 2 | a4 | Shade drain heal 6% → +2% per rank (03 §4) |
| `dk_b5` | Abyssal Lungs | 2 | 2 | b4 | in water, oil regen +15% |
| `dk_c5` | Brine Barrier | 2 | 1 | c4 | life steal past full health becomes a barrier up to 20% max health (decays 2%/s) |
| `dk_d5` | Reel | 2 | 1 | d4 | Undertow Chain cooldown 7 → 5 s |
| `dk_e5` | Wreck | 2 | 1 | e4 | anchor hits on Frozen enemies Shatter at ×2.5 |
| `dk_b6` | Pale Oath | 2 | 1 | b5 | +15 Tide and Shade resist |
| `dk_d6` | Drag Anchor | 2 | 1 | d5 | yanked enemies are stunned 0.5 s on arrival |
| `dk_a7` ✦ | **Maw of the Deep** | 3 | 1 | a5 + 8 in left | your Shade hits underwater always trigger Undertow (03 §13 #15), and heal +4% more |
| `dk_c7` ✦ | **The Knight Who Would Not Drown** | 3 | 1 | c5 + 8 in centre | once per room, lethal damage leaves you at 1 health and gives 3 s of 50% life steal |
| `dk_e7` ✦ | **Anchor of Ages** | 3 | 1 | e5 + 8 in right | Undertow Chain throws two anchors (±10°); a yanked enemy is crushed for 250% and staggered |

---

## 14. Moth Oracle (`moth_oracle`)

*Light-sight, crits in darkness, marks. Unlock: clear Blackwater (Act 4) without your lantern ever going out.*

### 14.1 Body and passive

- Walk 62, run 97, jump 34. Health ×0.95, oil ×1.05. Glide: hold `jump` in the air → max fall 60 cells/s.
- **Dodge is Flutter**: 48 cells in any of 8 directions (aim), invulnerable 0–200 ms, once in the air.
- **Passive — Moth-sight** (`mo_moth_sight`): sees in darkness 40 cells beyond her light (the Moth-Lamp implicit,
  drawn as a grey-violet outline of terrain and enemies); **+25% crit chance** against targets standing in darkness
  (light at their centre < 0.3, 06); every hit **marks** the target for 5 s — marked targets take +10% damage from
  you and are outlined for her through walls within 120 cells.
- The Moth-Rod implicit (08): +10% crit chance on marked targets.

### 14.2 Melee — Moth-Rod (swing 380 ms, reach 16)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Flick | 90 / 50 / 240 | 100% | 16 × 6 | 0.6 | 5 | marks |
| Light 2 — Wingbeat | 100 / 60 / 240 | 100% | 16 × 12 | 0.6 | 5 | |
| Light 3 — Dust Lash | 140 / 80 / 300 | 150% | 20 × 12 | 1.0 | 10 | puffs moth dust: marked targets hit by it are Revealed 5 s (03 radiance look) |
| Heavy — Pin | charge 350 + 100 / 60 / 340 | 260% | 18 × 4 (thin, long) | 1.0 | 20 | guaranteed crit on a marked target; non-lethal vs `subduable` |
| Air — Flutter Strike | 80 / 60 / 200 | 90% | 16 × 10 | 0.6 | 5 | cancels into Flutter on hit |
| Plunge — Dive | 100 / until landing / 220 | 150% | 10 × 8 | 1.0 | 12 | pogo 30 cells |
| Backstab (hit from behind an unaware enemy) | as Light 1 | 250% | as Light 1 | 0.6 | 20 | "unaware" = not in its `alert` state (05 §3) |

### 14.3 Class ability — Foresight (`ability_foresight`)

Release a cloud of moths.

| Number | Value |
|---|---|
| Oil / cooldown | 15 oil / 20 s |
| Area | every enemy within 120 cells (through walls) |
| Effect | marks them for 8 s; they are drawn outlined through darkness; their next attack's telegraph lights **200 ms earlier** (the telegraph itself is not longer, you just see it sooner) |
| Secrets | breakable walls and hidden Silent Bells within 120 cells shimmer for 8 s |
| Unlit (Act 4) | Foresight moths **do not** give off light, so they do not draw the Unlit |

### 14.4 Skill board — **Seer** (left) · **Moth** (centre) · **Rod** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `mo_c1` | Dust Wings | 1 | 1 | — | mark duration +2 s |
| `mo_b2` | Moonlit | 1 | 3 | c1 | Gleam damage +5% |
| `mo_c2` | Night Adapted | 1 | 3 | c1 | lantern dark burn −8% |
| `mo_d2` | Keen Eyes | 1 | 3 | c1 | crit chance +1% |
| `mo_a3` | Afterglow | 1 | 2 | b2 | Gleam afterglow +3 s (03 §11.1) |
| `mo_b3` | Phototaxis | 1 | 1 | b2 | the Seek charm turns +50% faster on your wicks |
| `mo_c3` | Many Eyes | 1 | 1 | c2 | Foresight radius 160 |
| `mo_d3` | Night Blade | 1 | 3 | d2 | rod hits on targets in darkness +5% |
| `mo_e3` | Silent Wings | 1 | 1 | d2 | glide max fall 60 → 40 cells/s |
| `mo_a4` | Searing Light | 2 | 1 | a3 | Radiance lasts +3 s; Gleam vs Unlit ×2.3 (was ×2) |
| `mo_b4` | Lantern Eater | 2 | 1 | b3 | your Shade spells do not Dim you (03 §4) |
| `mo_c4` | Omen | 2 | 1 | c3 | marked enemies' telegraphs light 150 ms earlier (all the time, not only after Foresight) |
| `mo_d4` | Moth Kiss | 2 | 3 | d3 | crit damage +8% |
| `mo_e4` | Dustveil | 2 | 1 | e3 | after a Flutter, 1.5 s unseen by the Unlit |
| `mo_a5` | Halo | 2 | 1 | a4 | Gleam heals on allies +50%; Gleam Ring heals you 60% of its base damage (was 40%) |
| `mo_b5` | Wick-Reader | 2 | 1 | b4 | the Wick builder shows each wick's damage per oil against the last enemy type you fought |
| `mo_c5` | Knotweaver | 2 | 1 | c4 | knot child power 0.60 → 0.70 (03 §8.2) |
| `mo_d5` | Unseen Blade | 2 | 1 | d4 | Backstab ×2 crit (5.0× total with base crit) |
| `mo_e5` | Moth Step | 2 | 1 | e4 | Flutter +8 cells and usable twice per airtime |
| `mo_b6` | Thousand Eyes | 2 | 1 | b5 | breakable walls and secrets within 60 cells are always outlined |
| `mo_d6` | Dark Harvest | 2 | 1 | d5 | crits on targets in darkness restore 3 oil |
| `mo_a7` ✦ | **Sunmoth** | 3 | 1 | a5 + 8 in left | Gleam afterglow cells burn the Unlit 5/s and anything Radiant standing in them |
| `mo_c7` ✦ | **Twice-Tied** | 3 | 1 | c5 + 8 in centre | knot recursion depth 2 on all your wicks (03 §8.2: the grandchild at 0.36 power, 0.25 oil) |
| `mo_e7` ✦ | **Eclipse** | 3 | 1 | e5 + 8 in right | against targets in darkness your crit chance is doubled, and every crit refreshes marks on enemies within 40 cells |

---

## 15. Chimneysweep (`chimneysweep`)

*Agile skirmisher, rope master. Unlock: swing 2,000 m on ropes in one run, or finish the Rope Gauntlet.*

### 15.1 Body and passive

- Walk 64, run 105, jump apex 38, **double jump** (second jump apex 26). Health ×0.85.
- **Wall-run**: running into a wall while airborne runs up it for 0.6 s (40 cells), then a wall-jump (off-wall
  kick 120 cells/s + jump) is available; wall-jumps work on any wall.
- Dodge 50 cells, invulnerable 180 ms; a dodge into a wall cancels into wall-run.
- **Passive — Rigger** (`cs_rigger`): rope swing force ×1.25, climb ×1.5, grapple range +20% (150 → 180), and
  releasing a rope at the bottom of a swing gives +15% launch speed. +15 Ember resist (soot).
- Brush-Spear implicit (08): +10% damage while on a rope.

### 15.2 Melee — Brush-Spear (swing 340 ms, reach 24)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Thrust | 80 / 50 / 210 | 100% | 24 × 4 | 0.8 | 5 | long and thin |
| Light 2 — Brush Sweep | 90 / 60 / 220 | 95% | 20 × 12 arc | 0.8 | 5 | sweeps ash, sand and soot cells 4 cells away |
| Light 3 — Flue Lunge | 110 / 80 / 280 | 150% | 28 × 6 | 1.5 | 12 | moves you 16 cells forward |
| Heavy — Chimney Pole | charge 350 + 90 / 80 / 320 | 230% | 26 × 6 | 2.0 | 22 | launches a light enemy upward (juggle); non-lethal vs `subduable` |
| Air — Spin | 70 / 90 / 180 | 80% | 20 × 20 around | 0.8 | 5 | can be done 3 times per airtime |
| Plunge — Chimney Drop | 90 / until landing / 180 | 160% | 8 × 8 | 1.2 | 14 | pogo 30 cells and resets the double jump |
| Rope — Swing Strike (attacking while swinging) | 70 / 60 / 180 | 120% | 20 × 10 | 1.8 | 10 | uses swing speed: +1% damage per 5 cells/s of swing speed over 100 |

### 15.3 Class ability — Flue Dash (`ability_flue_dash`)

| Number | Value |
|---|---|
| Oil / charges | 5 oil per dash / 2 charges, each recharges in 4 s |
| Move | 60 cells in any of 8 directions in 0.15 s; invulnerable 0–150 ms (i-frames: a window where you cannot be hit) |
| Damage | passes through enemies, 120% weapon damage to each |
| Resets | refreshes the double jump and wall-run |
| World | can pass through 1-cell-thick rope, cloth and ash; not through solids |

### 15.4 Skill board — **Soot** (left) · **Rigger** (centre) · **Spear** (right)

| Id | Name | Cost | Ranks | Needs | Effect (per rank) |
|---|---|---|---|---|---|
| `cs_c1` | Rigger's Knot | 1 | 1 | — | rope climb +25% |
| `cs_b2` | Soot Wick | 1 | 3 | c1 | Ember damage +5% |
| `cs_c2` | Sure Grip | 1 | 3 | c1 | grapple reel-in and rope climb +8% |
| `cs_d2` | Brush Flurry | 1 | 3 | c1 | melee attack speed +4% |
| `cs_a3` | Flue Fire | 1 | 1 | b2 | fire you start spreads through wood 2× faster |
| `cs_b3` | Chimney Draft | 1 | 1 | b2 | fire you start makes an updraft above it (lifts you 50 cells/s, like steam) |
| `cs_c3` | Swing Momentum | 1 | 3 | c2 | rope release launch +7% |
| `cs_d3` | Wall Kick | 1 | 1 | d2 | wall-jumps +8 cells higher |
| `cs_e3` | Light Feet | 1 | 2 | d2 | fall damage starts 20 cells later |
| `cs_a4` | Cinders | 2 | 1 | a3 | burning enemies spread 1 burn stack per second to enemies touching them |
| `cs_b4` | Spark Line | 2 | 1 | b3 | your tethers reach +50% (120 → 180) |
| `cs_c4` | Triple Jump | 2 | 1 | c3 | +1 air jump |
| `cs_d4` | Rope Strike | 2 | 2 | d3 | Swing Strike +15% |
| `cs_e4` | Long Run | 2 | 1 | e3 | wall-run 0.6 → 1.0 s |
| `cs_a5` | Soot Cloud | 2 | 1 | a4 | Flue Dash leaves an ash cloud (radius 12, 3 s) that makes enemies lose track of you for 1 s |
| `cs_b5` | Tightrope | 2 | 1 | b4 | you can stand and walk on top of any rope or tether |
| `cs_c5` | Grapple Master | 2 | 1 | c4 | grapple range +40 and it re-fires with no cooldown |
| `cs_d5` | Vault | 2 | 1 | d4 | a plunge pogo also restores the air dodge and one Flue Dash charge |
| `cs_e5` | Extra Flue | 2 | 1 | e4 | Flue Dash 3 charges |
| `cs_b6` | Hot Brush | 2 | 1 | b5 | spear hits apply 1 burn stack (03 §4, 20% of the hit per second) |
| `cs_d6` | Rooftop Runner | 2 | 2 | d5 | run speed +5% |
| `cs_a7` ✦ | **Chimney Fire** | 3 | 1 | a5 + 8 in left | one Ember wick cast per rope swing is free (resets when you grab a new rope) |
| `cs_c7` ✦ | **Spider-Sweep** | 3 | 1 | c5 + 8 in centre | tethers cost 0 oil, last until replaced, and you may have 3 |
| `cs_e7` ✦ | **Soot Devil** | 3 | 1 | e5 + 8 in right | Flue Dash deals 250% and a kill during a dash refunds its charge |

---

## 16. Unlock challenges: tracking rules

### 16.1 Where progress lives

- Challenge progress is **profile-wide** (the profile save, not a slot: `profile.challenges`, page 10), so it counts
  across every save slot, and a class once unlocked stays unlocked for every save.
- Counters match 02 §9.1 by name. The Guild Hall's Challenges page and the class-select panel show the lines.
- Tracking hooks listen on the game event bus (`js/events.js`, page 10). Each rule below names the events.
- **Trials** (09) that unlock a class count the same as the campaign route.
- Unlocking plays a Guild bell, shows a banner "A new Lamplighter answers the call: <Class>", and the class
  becomes selectable at the next **new game**. There is no mid-save class swap (the board, kit and challenge
  history stay coherent). Endless, Boss Rush and Trials can pick it immediately.

### 16.2 Ferrywitch — "Defeat the Sluicemaw without leaving the water for more than 10 s at a time"

| Rule | Detail |
|---|---|
| Events | `boss_start{id:'boss_sluicemaw'}`, `player_water_enter`, `player_water_exit`, `boss_defeated`, `player_died`, `boss_reset` |
| "In the water" | at least 50% of the player's 72 body cells are water cells (swimming or wading ≥ 6 cells deep). Standing on a Frozen enemy or ice does **not** count. |
| Timer | a dry timer starts at `player_water_exit` and stops at `player_water_enter`; the fight's **max dry stretch** is the largest value. The fight starts dry-timer 0 at `boss_start` even if you start on land (the arena entrance), but the timer only begins after the intro cutscene ends. |
| Drained arena | when the Sluicemaw drains the arena (05) and no water ≥ 6 deep exists anywhere in the arena, the dry timer is **paused** (you cannot be blamed for no water). A 0.5 s grace after the water returns. |
| Pass | `boss_defeated` with max dry stretch ≤ 10.0 s. Boss Rush counts. |
| Counters | `ch_ferry_best_dry` = lowest max-dry among Sluicemaw wins; `sluicemaw_wins` |

### 16.3 Bellringer — "Ring all 12 Silent Bells hidden across Acts 1–4"

| Rule | Detail |
|---|---|
| Events | `silent_bell_rung{bellId}` (01 §4 lists the 12, 09 §3 their rooms) |
| Ringing | hit the bell with melee, a spell, or a Great Toll; some need a `key_silent_bell` clapper (08 §12.2) |
| Persistence | the set of rung bell ids is profile-wide: ringing 5 in one save and 7 in another unlocks |
| Pass | `silent_bells` holds all 12 ids |

### 16.4 Drowned Knight — "Die 3 times underwater and then clear an act without dying"

| Rule | Detail |
|---|---|
| Events | `player_died{underwater}`, `act_started{act}`, `act_cleared{act}` (the Great Lamp relit), `player_died` |
| Underwater death | the player's head cell is in water at the moment of death (drowning or not) |
| Step 1 | `ch_knight_drownings` counts to 3 (profile-wide, across slots) → `ch_knight_armed = true` |
| Step 2 | after arming, any act **started after** arming and cleared with 0 deaths in that act on that slot → pass. An act in progress at the moment of arming does not count (its start was before arming). Reloading a lamp-post save does not erase a death (deaths are written immediately). |
| Endless | a floor range of 10 floors with 0 deaths counts as "an act" for step 2 |
| Counters | `ch_knight_drownings`, `ch_knight_armed`, `ch_knight_clean_act` |

### 16.5 Moth Oracle — "Clear Blackwater (Act 4) without your lantern ever going out"

| Rule | Detail |
|---|---|
| Events | `act_started{act:4}`, `lantern_out{cause}`, `act_cleared{act:4}` |
| Lantern out | oil reaches 0 while the lantern is lit; a gutter with Shade (03 §9.3); any enemy effect that snuffs it; drowning with a lantern that is not waterproof. **Hooding** (02 `hood`) is **not** "out" — it is dimmed on purpose. |
| The Widow | the Lampless Widow's scripted snuff (05) **counts** unless relit within 2.0 s (tonic, a spell cast, or `interact` at a sconce). This keeps the challenge honest but possible. |
| Pass | `act_cleared{act:4}` with 0 `lantern_out` events since `act_started{act:4}` in that slot |
| Counters | `ch_moth_best_outs` (fewest outs among Act 4 clears) |

### 16.6 Chimneysweep — "Swing 2,000 m on ropes in one run, or finish the Rope Gauntlet"

| Rule | Detail |
|---|---|
| Measure | path length travelled by the player's centre **while attached** to a grapple rope, any rope, tether or chain, plus the flight after a rope release until landing or re-grabbing. 1 m = 8 cells (02 §9.1), so 2,000 m = 16,000 cells. |
| Anti-cheese | movement under 20 cells/s does not count (no dangling-and-wiggling); climbing up/down a rope counts at 50% |
| "One run" | one save slot from new game on; deaths do not reset it (02 §9.1) |
| Or | `trial_complete{id:'trial_rope_gauntlet'}` (01 `a1_sweeps_loft`) |
| Counters | `ch_sweep_best_rope_m` (best across slots), `trial_rope_gauntlet` |

---

## 17. Levels and XP

### 17.1 XP to next level (campaign, levels 1–30)

`need(L) = round10(60 × L^1.6 + 40 × L)` for L = 1…29.

| Level | XP to next | Total XP at this level | | Level | XP to next | Total XP at this level |
|---|---|---|---|---|---|---|
| 1 | 100 | 0 | | 16 | 5,710 | 33,480 |
| 2 | 260 | 100 | | 17 | 6,260 | 39,190 |
| 3 | 470 | 360 | | 18 | 6,840 | 45,450 |
| 4 | 710 | 830 | | 19 | 7,430 | 52,290 |
| 5 | 990 | 1,540 | | 20 | 8,040 | 59,720 |
| 6 | 1,290 | 2,530 | | 21 | 8,670 | 67,760 |
| 7 | 1,630 | 3,820 | | 22 | 9,310 | 76,430 |
| 8 | 1,990 | 5,450 | | 23 | 9,980 | 85,740 |
| 9 | 2,380 | 7,440 | | 24 | 10,650 | 95,720 |
| 10 | 2,790 | 9,820 | | 25 | 11,350 | 106,370 |
| 11 | 3,220 | 12,610 | | 26 | 12,060 | 117,720 |
| 12 | 3,680 | 15,830 | | 27 | 12,780 | 129,780 |
| 13 | 4,150 | 19,510 | | 28 | 13,530 | 142,560 |
| 14 | 4,650 | 23,660 | | 29 | 14,280 | 156,090 |
| 15 | 5,170 | 28,310 | | **30** | cap (campaign) | **170,370** |

### 17.2 XP sources

| Source | XP | Notes |
|---|---|---|
| Kill | tier value × area level (05 §2.2): fodder 2, standard 5, heavy 12, elite ×3 of base, miniboss 60, boss 200 | e.g. a standard at area level 12 = 60 XP |
| Kill, grey | if the area level is **5+ below** your level: ×0.25; 8+ below: 0 | stops farming Act 1 at level 20 |
| Kill, above you | +10% per area level above yours, max +50% | |
| First clear of a room | 10 × area level | once per room per slot |
| Lesson room | 25 × area level | once |
| Secret found | 15 × area level | |
| Silent Bell rung | 50 × area level | |
| Quest / NPC job (01) | listed per quest; default 40 × area level | |
| Great Lamp relit | **one full level's worth** of XP at your current level (`need(L)`) — the big one | once per act |
| Trial cleared | 30 × your level (first clear only) | |
| Endless | kill XP as above; each floor cleared 20 × area level | |
| Difficulty | ×1.10 on Lampless (02 §10.1) | |
| Wick burn-in | none — burn-in is separate (03 §10) | |

### 17.3 Pacing targets (checked by the sim, §22)

| End of | Level (normal play, main path + some secrets) |
|---|---|
| Act 1 | 6 |
| Act 2 | 11 |
| Act 3 | 16 |
| Act 4 | 21 |
| Act 5 | 25 |
| Act 6 (final boss) | 29–30 |

These sit at the top of each act's area level band (05 §2.1) so the player is at or slightly above the enemies.
The balance sim may move `need(L)` coefficients (`balance.json` `progression.xp`) but must keep these targets ±1.

### 17.4 Beyond 30 (Endless only)

```
need(L) for L ≥ 30 = round10(14,280 × 1.06 ^ (L − 29))
```

| Level | 30 | 35 | 40 | 50 | 60 |
|---|---|---|---|---|---|
| XP to next | 15,140 | 20,260 | 27,110 | 48,550 | 86,940 |

Per level above 30: **+2 attribute points**, +6 health, +4 oil; **+1 skill point every 3 levels**. Campaign saves
stay capped at 30; XP past the cap is banked as Guild marks (1 mark per 5,000 XP).

---

## 18. Respec

- **Free undo** of staged points while the Attributes or Skills screen is open (02 §16.1–2).
- **The Ferry** (Old Wenna, `shop_ferry`, from Act 2) sells respecs — prices in 08 (`ferry_respec_points`,
  `ferry_respec_skills`, `ferry_respec_full`), payable in pennies **or max health** (canon quirk).
- **Once per act, free**: the first respec of each kind in each act costs nothing (a Guild stipend). The Ferry
  shows "The Guild pays this one" on it.
- Attribute respec returns every point placed since level 1 **except the class's starting 25**.
- Skill respec returns all skill points; capstones may be changed only through a respec.
- Wicks are never respecced: re-braiding is free at any lamp-post (03 §15.1).
- Endless / Daily: a respec shrine appears every 10 floors, free once.
- A "max health" payment lowers `maxHealth` permanently for that save by the listed amount; the number is shown
  in red and needs a 1 s hold (02 §9.2 shop).

---

## 19. Difficulty and progression

02-CONTROLS-UI.md §10.1 owns the difficulty table (Wick-lit / Lamplighter / Lampless, plus **Iron Wick** one-life).
05 §2.4 proposes a four-step version; until 00 settles it (see §23), the player side reads **02's** table. What
difficulty changes on this page's systems:

| Knob on this page | Wick-lit (`easy`) | Lamplighter (`normal`) | Lampless (`hard`) |
|---|---|---|---|
| XP gained | ×1.00 | ×1.00 | ×1.10 |
| Oil regen (§5) | ×1.30 | ×1.00 | ×0.85 |
| Wick oil cost | ×0.85 | ×1.00 | ×1.10 |
| Player poise | ×1.25 | ×1.00 | ×0.90 |
| Dodge invulnerability | +40 ms | — | −20 ms (never under 120 ms) |
| Perfect-block / parry windows | +60 ms | — | −30 ms |
| Unlock challenges | count | count | count (Iron Wick too) |
| Respec free-per-act | yes | yes | yes |
| Skill points, attribute points, level cap | same | same | same |

Rule: difficulty **never** changes what a character is (points, board, level). It changes only the world and the
margins, so a build can move between difficulties.

---

## 20. Recommended builds per class

Attribute targets are "at level 30" (112 points total). Board picks list the order to buy. Wick recipes use 03's
names (03 §18 has 26 more).

### 20.1 Lamplighter

| Build | Attributes (M/W/D/N/K) | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Guild Standard** (starter) | 14/35/28/25/10 | c1 → b2 ×3 → b3 ×3 → a3 → a4 ×3 → b4 → a5 ×3 → ll_a7 (25 points), then c2 ×3 | Ember Bolt [split, seek]; Gleam Ring [vast]; Spark Lob [linger]; Rime Arc | overcharge a big bolt, ring when rushed |
| **Pole-and-Lantern** | 28/25/20/28/11 | c1 → d2 ×3 → d3 → d4 → d5 → ll_e7 | Ember Arc [heavy, steady]; Gleam Ring; Spark Bolt [pierce] | melee first, free wick casts on combo enders |
| **Beacon Keeper** | 12/30/30/30/10 | c1 → c2 ×3 → c3 → c4 → c5 → ll_c7 | Gleam Beam [steady, vast]; Tide Wave; Ember Rune | plant, fight inside the light |

### 20.2 Sluicewarden

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Lock-keeper** (starter) | 22/18/20/40/12 | c1 → c2 ×3 → c3 ×2 → c4 → c5 → sw_c7 | Tide Wave; Rime Arc; Spark Bolt | brace, perfect block, freeze in water |
| **Floodcaller** | 12/34/26/30/10 | c1 → b2 ×3 → a3 → a4 → a5 → sw_a7 | Tide Lob [vast]; Rime Lob [vast]; Spark Lob [linger] | flood the room, freeze or shock it |
| **Hookmaster** | 30/16/18/36/12 | c1 → d2 ×2 → d3 → d4 → d5 → sw_e7 | Rime Arc [heavy]; Bile Bolt [split] | drag one enemy at a time into the pit |

### 20.3 Tinker

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Workshop** (starter) | 12/28/24/24/24 | c1 → c2 → c3 ×3 → c4 → c5 → tk_c7 | Spark Rune [split]; Ember Lob [heavy, volatile]; Rime Wave | turrets hold, you build the high ground |
| **Minelayer** | 10/34/26/22/20 | c1 → b2 ×3 → b3 → b4 → b5 → tk_a7 | Spark Rune [vast, linger]; Ember Rune {on_timer → spark bolt} | corridors of traps |
| **Scaffolder** | 16/24/22/24/26 | c1 → d2 ×3 → d3 → d4 → d5 → tk_e7 | Ember Lob; Tide Rune [vast] | builds everywhere; best Floodgate (waves) class |

### 20.4 Ferrywitch

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Admiral** (starter) | 8/34/30/26/14 | c1 → b2 ×3 → a3 → a4 → a5 → fw_a7 | Tide Bolt; Bile Lob; Shade Wave {on_kill → tide bolt} | a crew of five does the fighting |
| **Black Ferry** | 10/30/28/32/12 | c1 → c2 ×3 → c3 → c4 → c5 → fw_c7 | Shade Beam [siphon]; Tide Ring | hard to kill, drains and pulls |
| **Oar of the Deep** | 26/22/22/30/12 | c1 → d2 ×3 → d3 → d4 → d5 → fw_e7 | Tide Wave; Spark Lob [linger] | melee in flooded rooms, chaining through water |

### 20.5 Bellringer

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Carillon** (starter) | 20/28/20/32/12 | c1 → b2 → a3 ×3 → a4 → a5 → br_a7 | Spark Ring [echo, vast]; Rime Wave; Ember Bolt [split] | toll, then a spray of wicks in every direction |
| **Stagger Lock** | 30/16/18/36/12 | c1 → d2 ×3 → d3 → d4 → d5 → br_e7 | Rime Ring [steady, vast]; Bile Bolt | nothing gets to act |
| **Bell-Wright** | 18/26/20/34/14 | c1 → c2 ×3 → c3 → c4 → c5 → br_c7 | Spark Ring; Ember Lob [heavy] | gravity flips and rubble do the damage |

### 20.6 Drowned Knight

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Anchor Knight** (starter) | 32/14/14/40/12 | c1 → d2 ×3 → d3 → d4 → d5 → dk_e7 | Tide Arc; Bile Bolt; Rime Arc [heavy] | pull, crush, steal life |
| **Abyssal** | 16/32/20/34/10 | c1 → b2 ×3 → a3 → a4 → a5 → dk_a7 | Shade Beam [siphon]; Shade Bolt [seek]; Tide Wave | a drain caster who fights from under the water |
| **Unsinkable** | 24/18/16/44/10 | c1 → c2 ×3 → c3 ×3 → c4 → c5 → dk_c7 | Tide Arc [heavy]; Gleam Ring | the tank that does not die |

### 20.7 Moth Oracle

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Night Hunter** (starter) | 14/28/22/22/26 | c1 → d2 ×3 → d3 ×3 → d4 → d5 → mo_e7 | Gleam Bolt [seek, pierce]; Rime Rune; Shade Tether | hunts in the dark, crits and marks |
| **Sunmoth** | 8/38/26/26/14 | c1 → b2 ×3 → a3 → a4 → a5 → mo_a7 | Gleam Beam [steady]; Gleam Tether [linger]; Gleam Ring | burns the Unlit out of whole rooms |
| **Knotweaver** | 8/36/30/24/14 | c1 → c2 → c3 → c4 → c5 → mo_c7 | Spark Bolt {on_hit → ember rune [linger] {on_timer → spark bolt}} (depth 2 from Twice-Tied) | combo engine; the most "build the spell" class |

### 20.8 Chimneysweep

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Rooftop** (starter) | 24/20/20/24/24 | c1 → c2 ×3 → c3 ×3 → c4 → c5 → cs_c7 | Ember Arc; Spark Tether; Bile Lob [split] | never touches the floor |
| **Soot Devil** | 28/18/20/26/20 | c1 → d2 ×3 → d3 → d4 → d5 → cs_e7 | Ember Arc [heavy]; Spark Bolt [bounce, swift] | dash through packs, reset on kills |
| **Chimney Fire** | 14/32/22/24/20 | c1 → b2 ×3 → a3 → a4 → a5 → cs_a7 | Ember Bolt [split]; Ember Wave [linger]; Spark Tether | free fire from the swing |

---

## 21. Data: JSON files and schemas

All in `prototypes/lanternfall/data/`. Page 10 owns the layout.

### 21.1 `classes.json`

```json
{
  "schema": 1,
  "classes": [
    {
      "id": "lamplighter",
      "name": "Lamplighter",
      "blurb": "The Guild's own. A pole that feeds the lantern, a lantern that feeds the pole.",
      "role": "balanced caster-duelist",
      "unlock": { "default": true },
      "attributes": { "might": 5, "wick": 7, "draught": 6, "nerve": 4, "knack": 3 },
      "mult": { "health": 1.0, "oil": 1.0 },
      "armour": 0,
      "resist": { "gleam": 10 },
      "move": { "walk": 60, "run": 95, "jumpApex": 34, "airJumps": 0, "wallRun": 0 },
      "dodge": { "kind": "roll", "distance": 44, "duration": 0.28, "iframes": 0.18, "recovery": 0.6 },
      "oilOnMelee": 2.5,
      "weapon": "wpn_pole",
      "lantern": "lantern_guild",
      "startWicks": [
        { "flame": "ember", "shape": "bolt", "charms": [] },
        { "flame": "gleam", "shape": "ring", "charms": [] }
      ],
      "passive": "ll_fresh_wick",
      "ability": "ability_beacon",
      "moveset": "moves_pole",
      "board": "board_lamplighter",
      "world": { "buildSpeed": 1.0, "ropeForce": 1.0, "breath": 12, "swim": 1.0 }
    }
  ]
}
```

`unlock` for a locked class: `{ "challenge": "ch_ferrywitch" }` (§21.5).

### 21.2 `movesets.json`

```json
{ "schema": 1, "movesets": [
  { "id": "moves_pole", "weaponFamily": "pole",
    "moves": [
      { "id": "light1", "name": "Jab", "startup": 110, "active": 60, "recovery": 250, "dmg": 1.0,
        "hitbox": { "w": 18, "h": 6, "y": -6 }, "kb": 1.0, "poise": 8, "tags": [] },
      { "id": "light3", "name": "Lantern Crack", "startup": 180, "active": 80, "recovery": 340, "dmg": 1.6,
        "hitbox": { "w": 20, "h": 14, "y": -7 }, "kb": 2.3, "poise": 18, "tags": ["ignites"] },
      { "id": "heavy", "name": "Guild Swing", "charge": 350, "startup": 120, "active": 90, "recovery": 380,
        "dmg": 2.5, "hitbox": { "w": 22, "h": 16 }, "kb": 3.3, "poise": 35, "dig": 1, "tags": ["nonlethal"] }
    ],
    "comboWindow": 300, "buffer": 150 }
] }
```

### 21.3 `boards.json`

```json
{ "schema": 1, "boards": [
  { "id": "board_lamplighter", "branches": { "left": "Wickcraft", "centre": "Guild", "right": "Pole" },
    "nodes": [
      { "id": "ll_c1", "name": "Guild Oath", "col": "C", "row": 1, "cost": 1, "ranks": 1, "needs": [],
        "effects": [ { "kind": "stat", "stat": "maxOilFlat", "value": 10 }, { "kind": "stat", "stat": "spellPct", "value": 0.05 } ] },
      { "id": "ll_b4", "name": "Guild Temper", "col": "B", "row": 4, "cost": 2, "ranks": 1, "needs": ["ll_b3"],
        "effects": [ { "kind": "stat", "stat": "overchargeSafeLine", "value": 0.10 } ] },
      { "id": "ll_a7", "name": "Lanternheart", "col": "A", "row": 7, "cost": 3, "ranks": 1, "capstone": true,
        "needs": ["ll_a5"], "branchPoints": 8,
        "effects": [ { "kind": "rule", "rule": "ll_lanternheart", "params": { "cooldown": 20, "power": 0.2 } } ] }
    ] }
] }
```

A validation test checks every board has exactly 24 nodes in the §7.1 grid, the §7.1 prerequisite pattern, three
capstones, and that every `rule` id exists in `js/board-rules.js`.

### 21.4 `abilities.json`

```json
{ "schema": 1, "abilities": [
  { "id": "ability_beacon", "name": "Beacon", "oil": 20, "cooldown": 30,
    "params": { "duration": 12, "radius": 80, "spellPct": 0.15, "regenMult": 2, "hpBase": 60, "hpPerLevel": 10 } },
  { "id": "ability_turret", "name": "Turret", "oil": 15, "scrap": 3, "cooldown": 8,
    "params": { "max": 2, "hpBase": 60, "hpPerLevel": 8, "armour": 20, "powerMult": 0.5, "interval": 0.8, "range": 160, "duration": 40 } }
] }
```

### 21.5 `challenges.json`

```json
{ "schema": 1, "challenges": [
  { "id": "ch_ferrywitch", "unlocks": "ferrywitch",
    "kind": "boss_condition", "boss": "boss_sluicemaw",
    "measure": "maxDrySeconds", "pass": { "lte": 10.0 },
    "inWaterRule": { "bodyShare": 0.5, "minDepth": 6 }, "pauseWhenNoWater": true, "graceAfterWater": 0.5,
    "counters": ["ch_ferry_best_dry", "sluicemaw_wins"] },
  { "id": "ch_chimneysweep", "unlocks": "chimneysweep",
    "kind": "any", "of": [
      { "kind": "run_total", "measure": "ropeMetres", "pass": { "gte": 2000 }, "cellsPerMetre": 8, "minSpeed": 20, "climbWeight": 0.5 },
      { "kind": "trial", "trial": "trial_rope_gauntlet" } ],
    "counters": ["ch_sweep_best_rope_m", "trial_rope_gauntlet"] }
] }
```

### 21.6 In the save

```json
"character": {
  "class": "lamplighter", "level": 9, "xp": 8120,
  "attributes": { "might": 11, "wick": 17, "draught": 12, "nerve": 11, "knack": 6 },
  "unspent": { "attributes": 0, "skills": 1 },
  "board": { "ll_c1": 1, "ll_b2": 3, "ll_b3": 2 },
  "respecs": { "act2": { "points": true, "skills": false } },
  "maxHealthPaid": 0
}
```

`profile.challenges` holds the counters of §16 (page 10 owns the profile file).

### 21.7 `balance.json` → `progression`

```json
"progression": {
  "xp": { "a": 60, "exp": 1.6, "b": 40, "round": 10, "endlessGrowth": 1.06 },
  "perLevel": { "attributes": 3, "skills": 1, "health": 6, "oil": 4, "endlessAttributes": 2, "endlessSkillEvery": 3 },
  "softCaps": { "might": 20, "wick": 25, "draught": 20, "nerve": 25, "knack": 20 },
  "perPoint": {
    "might":   { "meleePct": 0.02, "knockback": 1, "critDmg": 0.01 },
    "wick":    { "spellPct": 0.02, "statusPct": 0.01 },
    "draught": { "oil": 5, "regen": 0.1, "darkBurnPct": -0.01 },
    "nerve":   { "health": 8, "staggerResist": 0.02, "resistAll": 0.5 },
    "knack":   { "crit": 0.003, "build": 0.01, "interact": 0.01, "loot": 0.01 }
  },
  "base": { "health": 60, "oil": 75, "regen": 3.0, "crit": 0.05, "critMult": 1.5, "poise": 30, "oilOnMelee": 1.5 },
  "greyKill": { "below5": 0.25, "below8": 0 },
  "skillPointsPerLamp": 1
}
```

---

## 22. Code and tests

Files: `js/stats.js` (`derive()`), `js/classes.js` (load + apply a class), `js/melee.js` (runs a moveset:
state machine idle → startup → active → recovery, combo window, buffer, cancels, hitbox tests against the
entity spatial hash, cell breaking through `world.setCell`), `js/abilities.js` (one small module per ability
under `js/abilities/`), `js/board.js` (buy/refund/validate), `js/board-rules.js` (the `rule` hooks),
`js/challenges.js` (event listeners → profile counters), `js/xp.js`.

| Test | Kind | Checks |
|---|---|---|
| `tests/stats.test.js` | node | §4 formulas and soft cap: Wick 40 → 32.5 effective; L1 Nerve 5 health 100; Draught 15 regen 4.5 |
| `tests/xp.test.js` | node | the §17.1 table from the formula; endless values in §17.4; grey-kill rule |
| `tests/boards.test.js` | node | 8 boards × 24 nodes, grid positions, prerequisites, 3 capstones each, one-capstone rule, costs total, every `rule` exists |
| `tests/movesets.test.js` | node | each class's Light 1 total = weapon swing ms (08 §5.2); no active window 0 |
| `tests/challenges.test.js` | node | fed event scripts: Ferrywitch dry timer with a drained arena passes at 9.9 s and fails at 10.1 s; Drowned Knight arming mid-act does not count that act; Chimneysweep slow wiggle does not count; Moth Widow snuff relit in 1.9 s passes |
| `tests/balance-knobs.test.js` | node | moving each `progression` knob to an odd value changes `derive()` output (dead-knob guard) |
| `tests/classes.spec.js` | Playwright | each class spawns in the test room, does its 3-hit combo on a dummy, uses its ability, and its starting wicks cast |
| `tools/sim-progression.mjs` | tool | bot plays each act's main path at normal (reusing 05's spawn tables + 08 loot) and reports level at each act end against §17.3 |

---

## 23. Proposed canon changes

1. **A `class_ability` key.** 02 has no key for the class ability (F is grapple). Proposal: keyboard `Y`, gamepad
   `LB`. 02 §2.2 should add the row.
2. **Class-specific dodges.** 02 says "page 04 owns the exact window per class"; this page also replaces the roll
   for four classes (Sluicewarden Brace, Ferrywitch Glide, Drowned Knight Sink-step, Moth Oracle Flutter).
3. **Difficulty count.** 02 has three modes (`easy`/`normal`/`hard` + Iron Wick); 05 §2.4 has four
   (`lamplit`/`normal`/`guttering`/`drowned`). This page follows 02. 00 should pick one list.
4. **Skill points from Great Lamps** (+1 each, 35 total) — an addition to canon §9's "+1 skill point per level".
5. **Oil from melee** (+1.5 per hit) — makes the pole the sustain and wicks the burst; 03's balance sim assumes it.
6. **Starting wicks grant their strands** (a Sluicewarden owns `tide` from the start). Canon §8 lists Tide as an
   Act 3 unlock; this is the class exception.
7. Starting wicks for the five challenge classes (§6.2) are new; canon only fixes the first three.
