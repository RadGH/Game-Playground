# LANTERNFALL — page 04: Classes and progression

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> **One line:** the 5 classes (3 open, 2 unlocked: stats, class movement, melee frame data, passive, starting
> wicks, class ability, a 12-node skill board each), the five attributes and their formulas, derived stats, the
> player's hurt rules, XP and levels, respec, class switching and the two unlock challenges.

Canon (class ids, roles, starting wicks, unlock challenges, attribute names, +3/+1 per level, cap 30) comes from
`00-OVERVIEW.md` §6, §7 and §9. This page **owns** (00 §3): classes, movesets and melee frame data, class movement
traits, class abilities, attributes, derived stats, boards, XP and levels, respec rules, unlock challenges, and the
player's hurt / hit-stop / contact rules. It links to 03 for spells and statuses, 07 for movement numbers
(`data/movement.json`), 08 for items and prices, 05 for monster values, 02 for keys, screens and the difficulty
table, and 10 for file shapes.

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
11. [(parked) Ferrywitch](#11-parked-ferrywitch)
12. [(parked) Bellringer](#12-parked-bellringer)
13. [(parked) Drowned Knight](#13-parked-drowned-knight)
14. [Moth Oracle](#14-moth-oracle-moth_oracle)
15. [Chimneysweep](#15-chimneysweep-chimneysweep)
16. [Unlock challenges: tracking rules](#16-unlock-challenges-tracking-rules)
17. [Levels and XP](#17-levels-and-xp)
18. [Respec](#18-respec)
19. [Difficulty](#19-difficulty)
20. [Recommended builds per class](#20-recommended-builds-per-class)
21. [Data: which values live where](#21-data-which-values-live-where)
22. [Code and tests](#22-code-and-tests)
23. [v2 changes](#23-v2-changes)
24. [Parked (v2)](#parked-v2)

(Sections 11–13 keep their numbers as one-line stubs so links from other pages still land.)

---

## 1. Words used on this page

| Word | Meaning |
|---|---|
| **Effective points** | An attribute's value after its soft cap (§4.2). All formulas use effective points. |
| **Soft cap** | A point count after which each extra point is worth less (half, then a quarter). There is no hard cap. |
| **Frame data** | How long each part of an attack lasts, in milliseconds: **startup** (wind-up, before it can hit), **active** (the window it hits in), **recovery** (after, when you cannot act). |
| **Poise** | A stagger meter. Hits fill it; when full the owner is **Staggered** (03 §4). Monsters' poise sizes are 05's; the player's is §5. |
| **I-frames** | Invulnerability frames: a short window where hits do not land. |
| **Hit-stop** | A freeze of a few sim ticks on a big hit so it *feels* big (§2.2). |
| **Cancel** | Ending an attack's recovery early by doing something else (a dodge, a jump). |
| **Node** | One entry on the skill board. Some nodes have **ranks** (can be bought up to 3 times). |
| **Tier** | A node's place in its branch: tier 1, tier 2, tier 3, capstone (§7). |
| **Capstone** | The last node of a branch. You may own only one capstone at a time. |
| **Class ability** | The class's own action on the `class_ability` key (02 owns the key). Unlocked at the Act 1 relight. |
| **Area level** | The level of the room you are in (05). XP from kills scales with it. |

---

## 2. The shared body (every class)

### 2.1 Body and resources

These are the numbers every class starts from; each class section lists only its differences.

| Thing | Value | Notes |
|---|---|---|
| Movement | **07 owns it** (`data/movement.json`): walk 60, run 95, jump apex 34, coyote time **0.10 s**, jump buffer **0.12 s**, auto ledge-grab, slide, drop-through, climb, swim, breath 12 s | Everyone wall-slides and **wall-jumps** from the start (07). Class multipliers in §6.1. |
| Fall damage | 07's rule: safe fall **160 cells**, then **5%** max health per 20 cells over, **cap 60%**, never lethal | monsters use 05's own rule |
| Dodge (roll) | 44 cells in 0.28 s; i-frames 0–180 ms; 0.6 s before the next dodge | **from the start**. Once per airtime in the air. Cancels melee recovery (after 60% of it) and cast time (cast oil refunded). Classes with a different dodge: §6.1. |
| Health | `60 + 8 × Nerve + 6 × (level − 1)` | +6 per level |
| Oil | `75 + 5 × Draught + 4 × (level − 1)` | +4 per level |
| Oil regen | `3.0 + 0.1 × Draught` per second | **0 while the `ambientTier` is `dark`** (from Act 4); × the difficulty multiplier (02) |
| Lantern in the dark | the lantern burns **2.5 oil/s** base (lantern items 2.0–3.0, 08), −1% per Draught point (max −30%), **×0.25 while hooded** | only while `ambientTier` is `dark` (Act 4+). `ambientTier` leaves out your own lantern (00 §13). |
| Last drop | at 0 oil in the dark the lantern gutters out | relight at a lamp-post, a lit `lamp_socket`, or by striking any burning cell with the pole (07) |
| Guild flask | 2 charges × 40 oil; a belt item | refills only at lamp-posts (08) |
| Oil from melee | **+1.5 oil per enemy hit by a pole swing** (max 3 enemies per swing) | the pole feeds the lantern: melee is the sustain, wicks are the burst. Lamplighter 2.5. |
| Carry | tonic capacity `3 + 1 per 5 Might`; plank capacity `6 + 1 per 4 Might` | building rules in 07 |

**What the body can do, and when** (00 §6.2): walk, run, jump, wall-jump, ledge-grab, dodge roll, the pole light
combo and air attack from the start; pole **heavy, plunge and pogo** from the Drip Gallery (`a1_n06`); the **class
ability** at the Act 1 relight; the **skill board** in Act 2 (skill points bank until then, §7.2).

### 2.2 Getting hit, contact and hit-stop (the one table)

| Rule | Value |
|---|---|
| Enemy bodies | **Enemies do not block the player.** You pass through an enemy's body; enemies separate softly from each other (05). |
| Contact damage | **Only from attacks tagged `contact`** (05). Touching an enemy otherwise does nothing. |
| I-frames after a hit | **600 ms**, the sprite flashes. Void-zone ticks, DoT ticks and fall damage neither grant i-frames nor are stopped by them. |
| Hurt state | **0.2 s at 30% control** (you can steer a little; `movement.json` `knock`) |
| Knockback | from the attack (05), × (1 − your knockback resist) |
| Wall stagger | knocked into a wall faster than **160 cells/s**: **Staggered 0.3 s** (03 §4) |
| Player poise | `30 + 2 × Nerve_eff` (§5). Enemy hits add their poise damage (05); full → **Staggered 0.4 s**; poise empties, and refills 2 s after the last hit |
| Hit-stop | **2 ticks** on a pole heavy that connects and on any crit (dealt or taken); **4 ticks** on a boss poise break; **0** on DoT ticks and light hits. Hit-stop pauses entities, spells and the cell sim; rain, audio and UI keep going. Stops in the same tick do not add; at most 4 ticks in any 0.25 s. |
| Perfect dodge | a dodge started **within the last 100 ms** before a hit that its i-frames then absorb: the rain streaks freeze for **0.2 s** with a rim flash (06 draws it). **No stat bonus.** |
| Grabs | 05's grabs end on their own in 1.5 s; a dodge, an Ember hit or a pole hit frees you early. No button-mashing anywhere. |

---

## 3. Melee: shared rules

- **Controls** (keys in 02): `pole` tap = light combo; hold 0.35 s = heavy. In the air, tap = air attack; down +
  tap in the air = plunge.
- **When**: light combo and air attack from the start; heavy, plunge and pogo from the Drip Gallery (`a1_n06`).
- **Light combo**: 3 hits. The next press is accepted from the start of the current hit's active window to
  **300 ms** into its recovery (buffer 150 ms). With no press, the combo resets after the recovery.
- **Damage**: `weaponRoll × move% × meleeMult × crit`, where `weaponRoll` is the weapon's damage range (08) and
  `meleeMult = 1 + 0.02 × Might_eff + gear%`. Melee damage is `physical` (armour applies, 03 §14).
- **The weapon's swing time** is the **total** length of combo hit 1; each class table below adds up to that number
  for hit 1. Attack-speed bonuses shorten startup and recovery, never active frames.
- **Off-class weapon**: a weapon 08 files under another class deals **−20%** damage in your hands.
- **Cancels**: any melee recovery can be cancelled by a dodge after 60% of it has passed, and by a jump on the ground
  after 80%. Casting a wick cancels nothing (you finish the swing).
- **Hitboxes** are rectangles in front of the player's centre (`width × height` cells), placed from the front edge
  of the body.
- **Knockback** in cells/s (the weapon's value × the move's multiplier). **Poise damage** per hit feeds the
  enemy's poise (05).
- **Non-lethal heavy.** A **fully charged** heavy against a target tagged **`subduable`** (this page owns the tag;
  05 puts it on cultists, thieves and other people) cannot take it below 1 HP: at 1 HP it is **Knocked out**
  (03 §4): down for the room, full kill XP, and it counts toward the Kindling flag `knell_spared` (01).
- **Pogo**: a plunge that hits an enemy or a breakable bounces you up **24 cells** and restores the air dodge.
- Melee hits apply **Shatter** to Frozen targets (03 §13): light ×1.5, heavy ×2.0.
- Melee hits the cell world: heavy hits break cells of hardness ≤ 1 in the hitbox (03 §12.1); light hits do not.
  Some classes change this.
- Striking any burning cell with the pole relights a guttered lantern (the last-drop rule, 07).

Frame-data columns in the class sections: **Move · Startup / Active / Recovery (ms) · Damage (% of weapon roll)
· Hitbox (cells) · Knockback × · Poise · Notes.**

---

## 4. Attributes

### 4.1 What one point gives

| Attribute | Per effective point | Soft cap |
|---|---|---|
| **Might** | +2% melee damage · +1 knockback (cells/s) on melee and spells · +1% crit damage · tonic capacity +1 per 5 · plank capacity +1 per 4 | 20 |
| **Wick** | +2% spell power (`wickBonus` in 03 §2.1) · +1% status potency (burn/corrode DoT, chill/soak/radiance durations) | 25 |
| **Draught** | +5 max oil · +0.1 oil regen per second · −1% lantern dark burn (Act 4+, max −30%) | 20 |
| **Nerve** | +8 max health · +2% stagger resistance (player poise, §5) · +0.5 to every flame resist (max +15 from Nerve) | 25 |
| **Knack** | +0.3% crit chance · +1% build speed · +1% interact speed (levers, sluice wheels, valves, trap disarm) · +1% loot find | 20 |

### 4.2 Soft caps

```
eff(points, cap) = min(points, cap)
                 + 0.50 × clamp(points − cap,     0, cap)
                 + 0.25 × max(points − 2 × cap,   0)
```

Example: Wick 40 with cap 25 → 25 + 0.5 × 15 = **32.5** effective → spell power +65%. The Attributes screen (02)
shows the effective value beside the raw one once a cap is passed, and the `[+]` tooltip says "this point is worth
50%".

### 4.3 Points

- Every class starts with **25 points** spread by the class (§6.1). Nothing is free to place at level 1.
- **+3 attribute points per level** (canon). Levels 2–30 give 87 → 112 total at level 30.
- **Act 1 level-ups give attribute points only**; skill points bank until the board opens in Act 2 (§7.2), and the
  level-up popup says so (02).
- The Long Descent beyond 30: +2 attribute points per level (§17.4).
- A point placed is permanent until a respec (§18) or a class switch (§6.4). Points can be staged and undone on the
  screen before Confirm (02).

---

## 5. Derived stats

Every stat the game reads, its formula, and its sources. They are recomputed whenever level, attributes, gear,
meals or board nodes change; that bumps `statsVersion`, which recompiles wicks (03 §20). Every stat has a tooltip
listing its sources (02).

| Stat (id) | Formula | Typical L1 → L30 |
|---|---|---|
| `maxHealth` | `(60 + 8·Nerve_eff + 6·(L−1)) × classHp + gearFlat`, then `× (1 + gear%)` | 78–136 by class → ~380 before gear |
| `maxOil` | `(75 + 5·Draught_eff + 4·(L−1)) × classOil + gearFlat` | 95–126 → ~250 |
| `oilRegen` | `(3.0 + 0.1·Draught_eff) × (1 + gear%) × difficulty`; **0 while `ambientTier` is `dark`** | 3.4–3.6 → ~5.5 /s |
| `oilOnMelee` | 1.5 per enemy hit (max 3 per swing) + class/board | 1.5 (Lamplighter 2.5) |
| `armour` | class base + gear (08); `taken × 100 / (100 + armour)` | 0–15 → ~240 |
| `resist.<flame>` (7) + `resist.physical` | class + 0.5·Nerve_eff (max +15) + gear + board; cap +75 (Sluicewarden `sw_a7`: Tide +85) | 0 → 30–50 |
| `critChance` | `5% + 0.3%·Knack_eff + gear + board` | 5% → 12–20% |
| `critMult` | `1.50 + 0.01·Might_eff + gear` | 1.55 → 1.8 |
| `meleeMult` | `1 + 0.02·Might_eff + gear%` | 1.10 → 1.6 |
| `spellMult` (`wickBonus`) | `0.02·Wick_eff` + gear spell % + lantern | +8% → +70% |
| `statusPotency` | `1 + 0.01·Wick_eff` | |
| `levelScale` | `1 + 0.04·(L−1)` for spells (03 §2.1); melee uses the weapon's item level instead | 1.00 → 2.16 |
| `castSpeed` | `1 + gear` (shortens cast time and cooldowns, 03 §2.3) | |
| `walk`, `run` | 07's value × class multiplier (§6.1) × `(1 + move_speed%)` | 60 / 95 |
| `jumpApex` | 07's value adjusted by class (§6.1) + boots `jump_height` | 34 |
| `airJumps` | 0 (Chimneysweep 1) | |
| `dodgeDistance`, `dodgeIframes` | class table (§6.1) | 44 / 180 ms |
| `poise` (player) | `30 + 2·Nerve_eff`; full = Staggered 0.4 s; refills 2 s after the last hit | 38–46 → 80 |
| `staggerResist` | `2%·Nerve_eff + gear` (cuts poise damage taken, max 60%) | 8% → 50% |
| `knockbackTaken` | `1 − kbResist` (class/board/gear) | |
| `breath` | 07's 12 s + gear `breath` + class | 12 |
| `swim` | 07's swim speed × class × gear | |
| `climb` | 07's climb speed × (1 + rope_speed%) × class | |
| `ropeSwingForce` | 1.0 × class × board | |
| `buildSpeed` | `1 + 0.01·Knack_eff + gear` × class | |
| `interactSpeed` | `1 + 0.01·Knack_eff` | |
| `lootFind` | `0.01·Knack_eff + gear loot_find` | |
| `lightRadius` | **the lantern item's radius × (1 + light_radius%)**; 06 then scales it by the oil percentage in Act 4+ | per lantern (08) |
| `darkBurn` | lantern item burn (2.0–3.0, base 2.5) × (1 − 0.01·Draught_eff, max −30%) × board × (hooded ? 0.25 : 1); applies only while `ambientTier` is `dark` | 2.5 → ~1.8 /s |
| `lifeSteal` | weapon implicit + board (as % of damage dealt; spells count at half) | 0 |
| `tonicCap` | `3 + floor(Might_eff / 5)` | 4 |
| `plankCap` | `(6 + floor(Might_eff / 4))` × class | 7 |

---

## 6. Classes at a glance

Three are open from the start (Lamplighter, Sluicewarden, Tinker); two unlock by challenge (Chimneysweep, Moth
Oracle, §16). Ferrywitch, Bellringer and Drowned Knight are parked (R30).

### 6.1 Base numbers

Attributes are the starting 25-point spread: **Might / Wick / Draught / Nerve / Knack**. Movement columns are this
class's values over 07's shared numbers (this page owns class movement; 07 §2.16 is gone).

| Class | M/W/D/N/K | Health × | Oil × | Armour | Walk / Run | Jump apex | Dodge | Resist (base) | Weapon (08) | Lantern (08) |
|---|---|---|---|---|---|---|---|---|---|---|
| Lamplighter | 5/7/6/4/3 | ×1.00 | ×1.20 (from the lantern) | 0 | 60 / 95 | 34 | roll 44 cells, i-frames 180 ms | gleam +10 | `wpn_pole` | `lantern_guild` |
| Sluicewarden | 6/4/4/8/3 | ×1.10 | ×1.00 | 5 (+10 lantern) | 55 / 85 | 30 | **Brace** + shield step (§9.1) | tide +25, rime +10, spark −15 | `wpn_hookstaff` + bulwark shield | `lantern_hook` |
| Tinker | 4/5/5/4/7 | ×1.00 | ×1.00 | 0 | 60 / 90 | 32 | roll 40 cells, i-frames 160 ms | spark +15 | `wpn_wrench` | `lantern_wrench` |
| Moth Oracle | 3/7/5/4/6 | ×0.95 | ×1.05 | 0 | 62 / 97 | 34 + glide | **Flutter** 48 cells in any of 8 directions, i-frames 200 ms | gleam +15, shade +15 | `wpn_mothlamp_rod` | `lantern_moth` |
| Chimneysweep | 5/4/4/4/8 | ×0.85 | ×1.00 | 0 | 64 / 105 | 38 + double jump (26) | roll 50 cells, i-frames 180 ms; can cancel into wall-run | ember +15 | `wpn_brushspear` | `lantern_tin` |

A class's own weapon is its starting item at item level 1 whatever 08's drop gate says.

### 6.2 Starting wicks

Canon (00 §7). **Every class also owns the `ember` and `bolt` strands from the start**, and a starting wick
**grants the strands in it**. Wick slot 1 holds the first wick; the second waits, ready-braided, and drops into slot 2
when it opens at the Candlemarket (`a1_n03`, 03 §15.1).

| Class | Slot 1 | Slot 2 | Why |
|---|---|---|---|
| Lamplighter | **Ember Bolt** (`ember`+`bolt`) | **Gleam Ring** (`gleam`+`ring`) | a ranged poke, and a close panic button that heals |
| Sluicewarden | **Rime Wave** (`rime`+`wave`) | **Tide Arc** (`tide`+`arc`), **dry** until the Act 3 Tide lesson (03 §3.3) | freeze a line, then shove them with water that is already there |
| Tinker | **Spark Rune** (`spark`+`rune`) | **Ember Lob** (`ember`+`lob`) | traps and grenades |
| Moth Oracle | **Gleam Bolt** (`gleam`+`bolt`) | **Rime Rune** (`rime`+`rune`) | light at range; a trap to hold an Unlit still while you mark it |
| Chimneysweep | **Ember Arc** (`ember`+`arc`) | **Spark Tether** (`spark`+`tether`) | rope master: a live-wire rope from the first minute |

So the Tinker owns `spark` and the Lamplighter `gleam` long before those flames arrive for everyone; that is the
class exception to 00 §6.2. The Sluicewarden's `tide` is the dry exception (03 §3.3).

### 6.3 Classes and the world (building, ropes, water)

| Class | Building (07) | Ropes & grapple (07) | Water |
|---|---|---|---|
| Lamplighter | normal (build speed ×1.0) | normal | normal |
| Sluicewarden | braces hold +25% weight | grapple pull-in ×0.8 (heavy) | walks through water at full speed; not pushed by current zones (06); turns sluice wheels and valves 2× fast; Floodwall holds water back |
| Tinker | build ×1.5 speed, planks cost 1 less scrap, plank capacity ×2, dismantle own builds for a full refund, turrets | normal | normal; a submerged turret shorts out (a Spark turret electrifies the water once instead) |
| Moth Oracle | ×1.0 | normal; glides (hold `jump` in the air: fall ≤ 60 cells/s) | normal |
| Chimneysweep | ×1.2 | rope swing force ×1.25, climb ×1.5, grapple range +20% over 07's; **wall-run** 0.6 s, up to 40 cells | normal |

### 6.4 Taking up a new class ("Answer the call")

When a challenge (§16) unlocks a class mid-campaign, the **lamp-post of the next act hub** offers **"Answer the
call"** (a lamp-post menu entry, 02). It can be taken there, in a new game, or at once in the modes (09). Taking it:

- **Level and XP** stay the same.
- **Attributes** reset to the new class's 25-point spread (§6.1) **plus (level − 1) × 3 unspent points** to place.
- **Skill points** are all refunded; the old board is cleared and the new class's board is used.
- **Strands and wicks** are kept (the wicks stay in their slots), and the new class's **two starting wicks** are
  granted (their strands too).
- **Gear** is kept. The old class's weapon becomes an off-class weapon (−20% damage, §3); the new class's starting
  weapon is added to the satchel.
- The class ability becomes the new class's (it stays unlocked if the Crown Lamp is relit).
- It is free, can be done once per unlock at that hub, and is logged in the Journal. Switching back later uses the
  same entry at any later act hub.

### 6.5 Class abilities

Each class has one ability on the `class_ability` key, **unlocked when the Crown Lamp is relit** (end of Act 1,
`cs_relight_crown`, 01). Its numbers are in the class section (§8.3, §9.3, §10.3, §14.3, §15.3).

---

## 7. Skill boards: shared rules

### 7.1 Layout

Every board has **12 nodes in three branches of four**. Each branch is a short ladder:

```
            left branch        centre branch       right branch
tier 1        [T1]                [T1]                [T1]
tier 2        [T2]                [T2]                [T2]
tier 3        [T3]                [T3]                [T3]
capstone      (✦)                 (✦)                 (✦)
```

- **Needs**: tier 2 needs one rank of tier 1; tier 3 needs tier 2; the **capstone needs tier 2 and 5 points spent in
  its branch** (so tier 3 is optional on the way down: 1 + 2 × 2 = 5 also reaches it).
- Each class names its branches. Node ids keep their v1 names (for example `ll_b4`); the letters no longer mean a
  grid position. Prefixes: `ll` Lamplighter, `sw` Sluicewarden, `tk` Tinker, `mo` Moth Oracle, `cs` Chimneysweep.
- Board text on screen is **generated from the node's numbers** (02), so the class tables below are the data.

### 7.2 Costs, ranks and points

| Tier | Cost per rank | Ranks |
|---|---|---|
| 1 | 1 | up to 3 (a special node: 1) |
| 2 | 2 | up to 3 (a special node: 1) |
| 3 | 3 | 1 |
| Capstone | 4 | 1 |

- **One capstone at a time.** Buying a second is refused ("You carry Lanternheart. Respec at the Ferry to change
  it."). The three capstones are the class's three ways to play.
- **The board opens in Act 2.** Skill points: **+1 per level from level 2** (banked through Act 1) **+ 1 per Great
  Lamp relit** (the Crown Lamp included) = **35** by level 30 in the campaign. A new Act 2 player arrives with
  about 6 banked.
- A full board costs 48 (16 per branch with every rank bought), so a character fills about three-quarters of it.
- The Long Descent: +1 skill point every 3 levels past 30.

### 7.3 Effect kinds

Every node effect is one of these kinds, so code handles a short list: `stat` (adds to a derived stat), `flameMult`
(per-flame damage %), `shapeMult`, `status` (changes a status number from 03 §4 for your hits), `ability` (changes
the class ability's numbers), `move` (changes one melee move), `rule` (a named hook in code, e.g.
`ll_lanternheart`), `unlock` (an action or build part). Each `rule` node has a unit test.

---

## 8. Lamplighter (`lamplighter`)

*Balanced caster-duelist. The Guild's own. A pole that feeds the lantern, a lantern that feeds the pole.*

### 8.1 Body and passive

- Base numbers in §6.1. Oil ×1.20 comes from the Guild lantern's implicit (08), so the bonus follows the lantern.
- **Passive — Fresh Wick** (`ll_fresh_wick`): the first wick cast after **3.0 s** without casting costs **0 oil**
  (the icon on the oil bar glows gold when ready). Overcharge's extra oil is still paid (only the base cost is free).
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
| Light | radius 80, colour of your selected wick's flame, intensity 1.2 (`bright`) |
| Inside it | your wicks +15% power; your oil regen ×2; enemies inside are revealed (drawn lit, like Radiant) |
| The dark (Act 4) | the Beacon is **not your lantern**, so it counts toward `ambientTier`: inside it the dark rules stop (regen runs, ×2) |
| Unlit | they will not enter the radius for its first 3 s (they flinch), then attack the Beacon (HP 60 + 10/level) |
| World | counts as light on a `light_door`'s eye and relights a guttered lantern if you touch it (last-drop rule) |

### 8.4 Skill board — **Wickcraft** (left) · **Guild** (centre) · **Pole** (right)

| Id | Name | Branch · tier | Cost | Ranks | Effect (per rank) |
|---|---|---|---|---|---|
| `ll_b2` | Trimmed Wick | Wickcraft · 1 | 1 | 3 | wick oil cost −4% |
| `ll_b3` | Quick Braid | Wickcraft · 2 | 2 | 3 | wick cooldowns −4% |
| `ll_b4` | Guild Temper | Wickcraft · 3 | 3 | 1 | overcharge safe line +0.10 (03 §9.2) |
| `ll_a7` ✦ | **Lanternheart** | Wickcraft · capstone | 4 | 1 | once every 20 s, a cast released past the safe line **cannot gutter** and gets +20% power |
| `ll_c2` | Oil Habit | Guild · 1 | 1 | 3 | +8 max oil |
| `ll_c3` | Wide Lantern | Guild · 2 | 2 | 3 | lantern light radius +8% |
| `ll_c5` | Beacon Keeper | Guild · 3 | 3 | 1 | Beacon lasts 18 s, radius 110 |
| `ll_c7` ✦ | **Sixfold Light** | Guild · capstone | 4 | 1 | Beacon heals you 3% max health per second, and your wicks cost 25% less inside it |
| `ll_d2` | Pole Drill | Pole · 1 | 1 | 3 | light combo +6% damage |
| `ll_d4` | Flare Crack | Pole · 2 | 2 | 1 | Heavy releases a burst of your selected wick's flame, radius 12, 60% of that wick's power, 0 oil (cooldown 4 s) |
| `ll_d5` | Spellblade | Pole · 3 | 3 | 1 | each pole hit takes 0.10 s off all wick cooldowns (max 0.3 s per swing) |
| `ll_e7` ✦ | **Lamp-Pole Master** | Pole · capstone | 4 | 1 | Light 3 also casts your selected wick for free at 50% power (cooldown 2 s, no overcharge) |

---

## 9. Sluicewarden (`sluicewarden`)

*Tank and water control. A hook-staff, a bulwark shield, and the patience of a lock-keeper.*

### 9.1 Body and passive

- Heavier: walk 55, run 85, jump apex 30. Health ×1.10, armour 5 + 10 (the Hook-Staff lantern's implicit, 08).
- **Dodge is replaced by Brace**: hold `dodge` to raise the bulwark shield. Frontal damage −70%, frontal knockback
  −80%, walk 50%, no run. **Perfect block**: a hit landing within **150 ms** of raising it is blocked 100% and deals
  20 poise to the attacker (melee attackers only). **Tap** `dodge` = **shield step**: 20 cells, i-frames 0–120 ms
  (this is the Sluicewarden's "roll" for the perfect-dodge rule, §2.2). Blocking a hit costs 2 oil.
- **Passive — Lock-keeper** (`sw_lockkeeper`): walks through water at full speed; not pushed by current zones (06);
  sluice wheels and valves turn 2× fast; +25 Tide resist (in §6.1).
- The shield also blocks void-zone **projectiles**, never ground void zones.

### 9.2 Melee — Hook-Staff (swing 480 ms, reach 20)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Gaff | 130 / 60 / 290 | 100% | 20 × 6 | 1.0 | 10 | implicit: pulls small enemies 12 cells toward you (08) |
| Light 2 — Staff Sweep | 150 / 80 / 300 | 110% | 20 × 16 arc | 1.2 | 10 | |
| Light 3 — Shield Bash | 160 / 70 / 380 | 140% | 12 × 12 | 2.5 | 30 | shield-first: frontal damage −70% during startup and active |
| Heavy — Sluice Hook | charge 350 + 150 / 100 / 420 | 230% | 24 × 10 | pull | 30 | hooks and **drags** the target 30 cells toward you (small/standard; heavies too with `sw_e7`); non-lethal vs `subduable` |
| Air — Hook Down | 110 / 60 / 220 | 90% | 20 × 10 below-front | 1.0 | 8 | if the hitbox touches a solid corner, you hang on it |
| Plunge — Anchor Drop | 150 / until landing / 300 | 160% | 14 × 8 | 2.0 | 25 | on water: a splash ring radius 20 that soaks (03 §4); pogo 24 cells |
| Braced Bash (brace + `pole`) | 90 / 60 / 300 | 80% | 10 × 12 | 2.0 | 20 | usable while bracing |

### 9.3 Class ability — Floodwall (`ability_floodwall`)

Slam the staff: a wall of packed silt rises in front of you.

| Number | Value |
|---|---|
| Oil / cooldown | 20 oil / 14 s |
| Size | 4 cells thick × 24 tall, 8 cells in front of you, rises in 0.25 s (pushes anything on top up) |
| Material | `silt` cells flagged `BUILT`, held still as one piece while the wall stands (dig 2 breaks it); holds water back; blocks projectiles; enemies break it by damage (HP 120 + 12/level) |
| Duration | 15 s, then it slumps into loose silt |
| Rules | never in a hub (`sanctuary`); refuses to place if it would seal you in (07); a Floodwall cell change is not saved (00 §13) |
| Tricks | wall off a flood, make a step to climb, block a corridor while runes work, trap water to freeze |

### 9.4 Skill board — **Tidecaller** (left) · **Warden** (centre) · **Hook** (right)

| Id | Name | Branch · tier | Cost | Ranks | Effect (per rank) |
|---|---|---|---|---|---|
| `sw_b2` | Wet Hands | Tidecaller · 1 | 1 | 3 | Tide and Rime damage +5% |
| `sw_a5` | Riptide | Tidecaller · 2 | 2 | 3 | Soaked enemies take +5% from all your damage |
| `sw_b3` | Cold Water | Tidecaller · 3 | 3 | 1 | your Rime freezes at 4 chill stacks (2 if Soaked) instead of 03 §4's 5 (3) |
| `sw_a7` ✦ | **Tidewright** | Tidecaller · capstone | 4 | 1 | Tide resist cap 85; your Tide hits heal you 5% of their damage while you stand in water |
| `sw_c2` | Brace Up | Warden · 1 | 1 | 3 | +4 armour |
| `sw_c4` | Perfect Seal | Warden · 2 | 2 | 1 | perfect-block window 150 → 220 ms |
| `sw_c5` | Floodwall II | Warden · 3 | 3 | 1 | Floodwall 36 tall, lasts 25 s, HP ×1.5 |
| `sw_c7` ✦ | **Unbreaking Dam** | Warden · capstone | 4 | 1 | while bracing you cannot be staggered, and 30% of blocked damage goes back to the attacker |
| `sw_d2` | Hook Reach | Hook · 1 | 1 | 2 | hook-staff reach +2 |
| `sw_d4` | Gaff Throw | Hook · 2 | 2 | 1 | Heavy can be released early to **throw** the hook 60 cells (pulls the target, or you to a wall) |
| `sw_d5` | Drag Under | Hook · 3 | 3 | 1 | hooked enemies become Soaked |
| `sw_e7` ✦ | **Leviathan's Hook** | Hook · capstone | 4 | 1 | the hook drags heavies and elites; a dragged target takes the heavy hit again at 150% on arrival |

---

## 10. Tinker (`tinker`)

*Builder, traps, turrets. Crane's favourite customer.*

### 10.1 Body and passive

- Walk 60, run 90, jump apex 32. Dodge 40 cells, i-frames 160 ms.
- **Passive — Scrap Sense** (`tk_scrap_sense`): build speed ×1.5; planks and braces cost 1 less scrap (min 0); plank
  capacity ×2; dismantle any of your builds (hold `interact` 0.4 s) for a full refund; sees the load on every plank
  (white fine, yellow stressed, red about to fail, 07).
- The Tinker's two build parts, `bp_turret_1` and `bp_spikes`, are in 07's part list.
- Wrench implicit (08): hitting your own construct repairs it 8 HP.

### 10.2 Melee — Tinker's Wrench (swing 360 ms, reach 14)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Tap | 90 / 50 / 220 | 100% | 14 × 6 | 0.8 | 6 | |
| Light 2 — Twist | 100 / 60 / 230 | 105% | 14 × 10 | 0.8 | 6 | |
| Light 3 — Spanner Clout | 150 / 70 / 320 | 170% | 16 × 12 | 2.0 | 18 | on a machine: jolts it (counts as 1 s of power) |
| Heavy — Overhand | charge 350 + 120 / 80 / 360 | 240% | 16 × 14 | 2.5 | 30 | non-lethal vs `subduable`; breaks hardness ≤ 2 cells (the Tinker knows where to hit) |
| Air — Flip | 80 / 50 / 200 | 85% | 14 × 10 | 0.8 | 5 | |
| Plunge — Hammer Drop | 120 / until landing / 260 | 170% | 12 × 8 | 2.0 | 20 | pogo 24 cells; driving a plunge onto your own plank **nails** it (+50% hold) |
| Repair (on own build) | 100 / 50 / 200 | — | 14 × 12 | — | — | +8 HP to a turret or plank |

### 10.3 Class ability — Turret (`ability_turret`)

Deploy a small tripod turret at your feet (or on a plank).

| Number | Value |
|---|---|
| Cost / cooldown | 15 oil + 3 scrap / 8 s |
| Max out | 2 (3 with `tk_c5`); a new one past the cap removes the oldest |
| Health | 60 + 8 × level; armour 20 |
| Fires | the **flame of your slot-1 wick** as a bolt (03 §5.2 numbers), power 0.5 × that flame's base, every 0.8 s, range 160, turns 180°/s. **Turret shots never trigger knots** (03 §8.2). |
| Duration | 40 s, or until destroyed |
| Water | a submerged turret shorts out (a Spark turret electrifies the water once instead, 03 §13) |
| Threat | enemies treat a turret as a target (05 attack tokens) |
| Allies | Gleam heals a turret instead of hurting it (03 §4 Radiant) |

### 10.4 Skill board — **Sparkwright** (left) · **Engineer** (centre) · **Carpenter** (right)

| Id | Name | Branch · tier | Cost | Ranks | Effect (per rank) |
|---|---|---|---|---|---|
| `tk_b2` | Wiring | Sparkwright · 1 | 1 | 3 | Spark damage +5% |
| `tk_b5` | Trap Engineer | Sparkwright · 2 | 2 | 3 | rune damage +8% |
| `tk_hijack` | **Hijack** | Sparkwright · 3 | 3 | 1 | pole-hit a trap (any `trap_*`, 07) to **take its trigger for 20 s**: while you hold it, `class_ability` fires that trap once instead of deploying a turret (the trap's own reload applies; traps hit anything, enemies included). One trap at a time; the trap glows your flame's colour while held. |
| `tk_a7` ✦ | **Storm Engine** | Sparkwright · capstone | 4 | 1 | every rune detonation and every hijacked trap firing also fires a free Spark Bolt at 60% at the nearest enemy |
| `tk_c3` | Oiled Gears | Engineer · 1 | 1 | 3 | turret fire rate +8% |
| `tk_c4` | Selector Switch | Engineer · 2 | 2 | 1 | turrets fire your **selected** wick's flame and, if it is a bolt, lob or ring, its shape |
| `tk_c5` | Twin Turrets | Engineer · 3 | 3 | 1 | max turrets 2 → 3 |
| `tk_c7` ✦ | **Walking Turret** | Engineer · capstone | 4 | 1 | your newest turret follows you (60 cells/s along the ground, hops 16 cells) and never times out |
| `tk_d2` | Quick Hammer | Carpenter · 1 | 1 | 3 | build speed +10% |
| `tk_d3` | Braces | Carpenter · 2 | 2 | 2 | planks hold +25% weight; support span +2 cells (07) |
| `tk_d5` | Scaffold | Carpenter · 3 | 3 | 1 | place 3 `bp_ladder` pieces as one ladder in one placement (from Act 2, when ladders unlock, 07) |
| `tk_e7` ✦ | **Master Builder** | Carpenter · capstone | 4 | 1 | planks cost no scrap; your builds have +100% health; you can build in the air (the build ghost placed mid-jump) |

---

## 11. (parked) Ferrywitch

Parked by R30 (ship 3 + 2 classes). The full v1 section is in **Parked (v2)** at the end of this page.

## 12. (parked) Bellringer

Parked by R30. The full v1 section is in **Parked (v2)**.

## 13. (parked) Drowned Knight

Parked by R30. The full v1 section is in **Parked (v2)**.

---

## 14. Moth Oracle (`moth_oracle`)

*Light-sight, crits in darkness, marks. Unlock: clear Blackwater (Act 4) without your lantern going out, or bronze in
the Hooded Crossing trial (§16.5).*

### 14.1 Body and passive

- Walk 62, run 97, jump apex 34. Health ×0.95, oil ×1.05. **Glide**: hold `jump` in the air → fall at most 60
  cells/s.
- **Dodge is Flutter**: 48 cells in any of 8 directions (aim), i-frames 0–200 ms, once in the air.
- **Passive — Moth-sight** (`mo_moth_sight`): sees in darkness 40 cells beyond her light (drawn as a grey-violet
  outline of terrain and enemies); **+25% crit chance** against targets whose `lightTier` is `dark` (06 tiers); every
  hit **marks** the target for 5 s — marked targets take +10% damage from you and are outlined for her through walls
  within 120 cells.
- The Moth-Rod implicit (08): +10% crit chance on marked targets.

### 14.2 Melee — Moth-Rod (swing 380 ms, reach 16)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Flick | 90 / 50 / 240 | 100% | 16 × 6 | 0.6 | 5 | marks |
| Light 2 — Wingbeat | 100 / 60 / 240 | 100% | 16 × 12 | 0.6 | 5 | |
| Light 3 — Dust Lash | 140 / 80 / 300 | 150% | 20 × 12 | 1.0 | 10 | puffs moth dust: marked targets hit by it are revealed 5 s (drawn like Radiant) |
| Heavy — Pin | charge 350 + 100 / 60 / 340 | 260% | 18 × 4 (thin, long) | 1.0 | 20 | guaranteed crit on a marked target; non-lethal vs `subduable` |
| Air — Flutter Strike | 80 / 60 / 200 | 90% | 16 × 10 | 0.6 | 5 | cancels into Flutter on hit |
| Plunge — Dive | 100 / until landing / 220 | 150% | 10 × 8 | 1.0 | 12 | pogo 24 cells |
| Backstab (hit from behind an unaware enemy) | as Light 1 | 250% | as Light 1 | 0.6 | 20 | "unaware" = not in its alert state (05) |

### 14.3 Class ability — Foresight (`ability_foresight`)

Release a cloud of moths.

| Number | Value |
|---|---|
| Oil / cooldown | 15 oil / 20 s |
| Area | every enemy within 120 cells (through walls) |
| Effect | marks them for 8 s; they are drawn outlined through darkness; their next attack's telegraph lights **200 ms earlier** (the telegraph is not longer; you just see it sooner) |
| Secrets | breakable walls within 120 cells shimmer for 8 s |
| Unlit (Act 4) | Foresight moths give off **no** light, so they do not draw the Unlit |

### 14.4 Skill board — **Seer** (left) · **Moth** (centre) · **Rod** (right)

| Id | Name | Branch · tier | Cost | Ranks | Effect (per rank) |
|---|---|---|---|---|---|
| `mo_b2` | Moonlit | Seer · 1 | 1 | 3 | Gleam damage +5% |
| `mo_a3` | Afterglow | Seer · 2 | 2 | 2 | Gleam afterglow +3 s (03 §11.1) |
| `mo_a4` | Searing Light | Seer · 3 | 3 | 1 | Radiant lasts +3 s; Gleam vs the Unlit ×2.3 (was ×2) |
| `mo_a7` ✦ | **Sunmoth** | Seer · capstone | 4 | 1 | Gleam afterglow tiles burn the Unlit 5/s, and anything Radiant standing in them |
| `mo_c2` | Night Adapted | Moth · 1 | 1 | 3 | lantern dark burn −8% |
| `mo_c4` | Omen | Moth · 2 | 2 | 1 | marked enemies' telegraphs light 150 ms earlier, all the time |
| `mo_c5` | Knotweaver | Moth · 3 | 3 | 1 | knot child power 0.60 → 0.70 (03 §8.2) |
| `mo_c7` ✦ | **Twice-Tied** | Moth · capstone | 4 | 1 | your knot children fire at **0.80** power, and each instance may spawn **6** children instead of 3 (the 12-per-cast budget still holds; depth stays 1) |
| `mo_d2` | Keen Eyes | Rod · 1 | 1 | 3 | crit chance +1% |
| `mo_d4` | Moth Kiss | Rod · 2 | 2 | 3 | crit damage +8% |
| `mo_d5` | Unseen Blade | Rod · 3 | 3 | 1 | Backstab crits ×2 (5.0× total with the base crit) |
| `mo_e7` ✦ | **Eclipse** | Rod · capstone | 4 | 1 | against targets in the `dark` tier your crit chance is doubled, and every crit refreshes marks on enemies within 40 cells |

---

## 15. Chimneysweep (`chimneysweep`)

*Agile skirmisher, rope master. Unlock: swing 2,000 m on ropes in one save, or bronze in the Rope Gauntlet trial
(§16.6).*

### 15.1 Body and passive

- Walk 64, run 105, jump apex 38, **double jump** (second jump apex 26). Health ×0.85.
- **Wall-run** (the Chimneysweep's own; everyone else only wall-jumps, 07): running into a wall while airborne runs
  up it for **0.6 s (up to 40 cells)**, then the normal wall-jump is available.
- Dodge 50 cells, i-frames 180 ms; a dodge into a wall cancels into wall-run.
- **Passive — Rigger** (`cs_rigger`): rope swing force ×1.25, climb ×1.5, grapple range +20% over 07's, and letting go
  of a rope at the bottom of a swing gives +15% launch speed. +15 Ember resist (soot).
- Brush-Spear implicit (08): +10% damage while on a rope.

### 15.2 Melee — Brush-Spear (swing 340 ms, reach 24)

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Thrust | 80 / 50 / 210 | 100% | 24 × 4 | 0.8 | 5 | long and thin |
| Light 2 — Brush Sweep | 90 / 60 / 220 | 95% | 20 × 12 arc | 0.8 | 5 | sweeps `ash` and `sand` cells 4 cells away |
| Light 3 — Flue Lunge | 110 / 80 / 280 | 150% | 28 × 6 | 1.5 | 12 | moves you 16 cells forward |
| Heavy — Chimney Pole | charge 350 + 90 / 80 / 320 | 230% | 26 × 6 | 2.0 | 22 | launches a light enemy upward; non-lethal vs `subduable` |
| Air — Spin | 70 / 90 / 180 | 80% | 20 × 20 around | 0.8 | 5 | can be done 3 times per airtime |
| Plunge — Chimney Drop | 90 / until landing / 180 | 160% | 8 × 8 | 1.2 | 14 | pogo 24 cells and resets the double jump |
| Rope — Swing Strike (attacking while swinging) | 70 / 60 / 180 | 120% | 20 × 10 | 1.8 | 10 | +1% damage per 5 cells/s of swing speed over 100 |

### 15.3 Class ability — Flue Dash (`ability_flue_dash`)

| Number | Value |
|---|---|
| Oil / charges | 5 oil per dash / 2 charges, each recharges in 4 s |
| Move | 60 cells in any of 8 directions in 0.15 s; i-frames 0–150 ms |
| Damage | passes through enemies, 120% weapon damage to each |
| Resets | refreshes the double jump and the wall-run |
| World | passes through 1-cell-thick `rope`, `web` and `ash`; never through solids |

### 15.4 Skill board — **Soot** (left) · **Rigger** (centre) · **Spear** (right)

| Id | Name | Branch · tier | Cost | Ranks | Effect (per rank) |
|---|---|---|---|---|---|
| `cs_b2` | Soot Wick | Soot · 1 | 1 | 3 | Ember damage +5% |
| `cs_b3` | Chimney Draft | Soot · 2 | 2 | 1 | fire you start makes an updraft above it (lifts you 50 cells/s, like steam) |
| `cs_b6` | Hot Brush | Soot · 3 | 3 | 1 | spear hits apply 1 burn stack (03 §4) |
| `cs_a7` ✦ | **Chimney Fire** | Soot · capstone | 4 | 1 | one Ember wick cast per rope swing is free (resets when you grab a new rope) |
| `cs_c2` | Sure Grip | Rigger · 1 | 1 | 3 | grapple reel-in and rope climb +8% |
| `cs_c3` | Swing Momentum | Rigger · 2 | 2 | 3 | rope release launch +7% |
| `cs_c5` | Grapple Master | Rigger · 3 | 3 | 1 | grapple range +40 cells and it re-fires with no cooldown |
| `cs_c7` ✦ | **Spider-Sweep** | Rigger · capstone | 4 | 1 | your tethers cost 0 oil (cast and upkeep), last until replaced, and you may have 3 |
| `cs_d2` | Brush Flurry | Spear · 1 | 1 | 3 | melee attack speed +4% |
| `cs_d4` | Rope Strike | Spear · 2 | 2 | 2 | Swing Strike +15% |
| `cs_d5` | Vault | Spear · 3 | 3 | 1 | a plunge pogo also restores the air dodge and one Flue Dash charge |
| `cs_e7` ✦ | **Soot Devil** | Spear · capstone | 4 | 1 | Flue Dash deals 250%, and a kill during a dash refunds its charge |

---

## 16. Unlock challenges: tracking rules

### 16.1 Where progress lives

- Challenge progress is **profile-wide** (the profile save, not a slot; 10 owns the file), so it counts across every
  save slot, and a class once unlocked stays unlocked everywhere.
- Counter names match the class-select cards (02), which show progress for the two locked classes only.
- Tracking listens on the game event bus. Each rule below names its events.
- Each class has a **trial alternative** (09): **bronze** in its trial unlocks it too. Medal thresholds are 09's.
- Unlocking plays a Guild bell and shows a banner "A new Lamplighter answers the call: <Class>". The class can then be
  taken up at the **next act hub's lamp-post** ("Answer the call", §6.4), in a new game, or at once in the modes.

### 16.2–16.4 (parked)

The Ferrywitch, Bellringer and Drowned Knight challenges are parked with their classes (R30); text in Parked (v2).

### 16.5 Moth Oracle — "Clear Blackwater (Act 4) without your lantern going out", or bronze in `trial_hooded_crossing`

| Rule | Detail |
|---|---|
| Events | `act_started{act:4}`, `lantern_out{cause}`, `act_cleared{act:4}` (the Deep Lamp relit), `trial_medal{id, medal}` |
| Lantern out | the **last drop** (oil reaches 0 in the dark, 07); a **Shade gutter** (03 §9.3); any enemy effect that snuffs it; drowning with a lantern that is not waterproof (08) |
| Not "out" | **hooding** (you dimmed it on purpose); **the Lampless Widow's scripted snuff never counts** (05's exemption), however long it lasts |
| Pass (campaign) | `act_cleared{act:4}` with 0 `lantern_out` events since `act_started{act:4}` in that slot |
| Pass (trial) | bronze or better in `trial_hooded_crossing` (its door is at `a4_n04`, 09) |
| Counters | `ch_moth_best_outs` (fewest outs among Act 4 clears), `trial_hooded_crossing` |

### 16.6 Chimneysweep — "Swing 2,000 m on ropes in one save", or bronze in `trial_rope_gauntlet`

| Rule | Detail |
|---|---|
| Measure | path length of the player's centre **while attached** to the grapple, any rope, tether or chain, plus the flight after a rope release until landing or re-grabbing. **1 m = 8 cells, so 2,000 m = 16,000 cells.** |
| Anti-cheese | movement under 20 cells/s does not count (no dangling and wiggling); climbing up or down a rope counts at 50% |
| "One save" | one save slot from new game on; deaths do not reset it |
| Pass (trial) | bronze or better in `trial_rope_gauntlet` (its door is at `a2_n04`, 09) |
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
| Kill | tier value × area level (05): fodder 2, standard 5, heavy 12, elite ×3 of base, miniboss 60, boss 200 | e.g. a standard at area level 12 = 60 XP |
| Knock-out | as a kill | 03 §4 `knocked_out` |
| **Trap or world kill** | **+50%** on the kill's XP | the kill is credited to **"The Hollow"** in the Ledger; the Narrator remarks the first time (B6) |
| Kill, grey | area level **5+ below** your level: ×0.25; 8+ below: 0 | stops farming |
| Kill, above you | +10% per area level above yours, max +50% | |
| First clear of a room | 10 × area level | once per room per slot |
| Lesson room | 25 × area level | once |
| Secret found | 15 × area level | |
| Quest / NPC job (01) | listed per quest; default 40 × area level | |
| Great Lamp relit | **one full level's worth** at your current level (`need(L)`) | once per act |
| Trial cleared | 30 × your level (first clear only) | |
| Long Descent | kill XP as above; each depth cleared 20 × area level | |
| Difficulty | the XP multiplier in 02's difficulty table | |
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

These sit at the top of each act's area-level band (05), so the player is at or slightly above the enemies. The
balance sim may move `need(L)`'s coefficients (`balance.json` `progression`) but must keep these targets ±1.

### 17.4 Beyond 30 (the Long Descent only)

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

- **Free undo** of staged points while the Attributes or Skills screen is open (02).
- **The Ferry** (`shop_ferry`, `npc_wenna`, from the Act 2 dock) sells respecs of attributes, skills or both; the
  prices and item ids are 08's. Payable in pennies **or max health**.
- **Max-health payments** are a debt: the total is **capped at 20% of your max health**, and it is **refunded in full
  at each Great Lamp relit** (00 §14). The Ferry screen shows the cap and "refunded at the next Great Lamp" (02).
- **Once per act, free**: the first respec of each kind in each act costs nothing (a Guild stipend). The Ferry shows
  "The Guild pays this one".
- An attribute respec returns every point placed since level 1 **except the class's starting 25**.
- A skill respec returns all skill points; capstones can only be changed through a respec.
- Wicks are never respecced: re-braiding is free at any lamp-post (03 §15.1).
- A class switch (§6.4) resets attributes and skills as it says, for free.
- The Long Descent: a free respec at the lamp-post every 10 depths.

---

## 19. Difficulty

**02 owns the difficulty table** (`data/difficulty.json`): `wicklit`, `lamplighter` (default), `lampless`, and the
**Iron Wick** one-life toggle. The Act 1 grace (00 §6.2) applies on top. This page's systems read these rows of it:

| Knob (row in 02's table) | Read by |
|---|---|
| XP gained × | §17.2 |
| Oil regen × | §5 `oilRegen` |
| Wick oil cost × | 03 §2.2 (through the cast step) |
| Player poise × | §5 `poise` |
| Dodge i-frames ± ms (never under 120 ms) | §2.1, §6.1 |
| Perfect-block / parry window ± ms | §9.1 |

Rule: difficulty **never** changes what a character is (points, board, level, unlocks). Unlock challenges count on
every difficulty, Iron Wick too, so a build can move between difficulties.

---

## 20. Recommended builds per class

Attribute targets are "at level 30" (112 points). Board paths list the buying order within the 35 campaign points.
Wicks use only ship strands (03 §6–§8; charm slots 3 by Act 6).

### 20.1 Lamplighter

| Build | Attributes (M/W/D/N/K) | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Guild Standard** (starter) | 14/35/28/25/10 | b2 ×3 → b3 ×3 → b4 → ll_a7 (16), then c2 ×3 → c3 ×3 → c5 (12), then d2 ×3 | Ember Bolt [split, seek]; Gleam Ring [linger]; Spark Lob [linger]; Rime Arc | overcharge a big bolt, ring when rushed |
| **Pole-and-Lantern** | 28/25/20/28/11 | d2 ×3 → d4 → d5 → ll_e7 (12), then b2 ×3 → b3 ×3 (9), then c2 ×3 → c3 (5) | Ember Arc [heavy]; Gleam Ring; Spark Bolt [bounce] | melee first, free wick casts on combo enders |
| **Beacon Keeper** | 12/30/30/30/10 | c2 ×3 → c3 ×3 → c5 → ll_c7 (16), then b2 ×3 → b3 ×3 (9) | Gleam Beam [heavy]; Tide Wave; Ember Rune [linger] | plant the light, fight inside it |

### 20.2 Sluicewarden

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Lock-keeper** (starter) | 22/18/20/40/12 | c2 ×3 → c4 → c5 → sw_c7 (12), then d2 ×2 → d4 → d5 (7) | Tide Wave; Rime Arc; Spark Bolt | brace, perfect block, freeze them in water |
| **Floodcaller** | 12/34/26/30/10 | b2 ×3 → a5 ×3 → b3 → sw_a7 (16) | Tide Lob [heavy]; Rime Lob [split]; Spark Lob [linger] | flood the room, then freeze or shock it |
| **Hookmaster** | 30/16/18/36/12 | d2 ×2 → d4 → d5 → sw_e7 (11) | Rime Arc [heavy]; Bile Bolt [split] | drag one enemy at a time into the pit |

### 20.3 Tinker

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Workshop** (starter) | 12/28/24/24/24 | c3 ×3 → c4 → c5 → tk_c7 (12), then d2 ×3 → d3 ×2 (7) | Spark Rune [split]; Ember Lob [heavy, volatile]; Rime Wave | turrets hold; you build the high ground |
| **Trapwright** | 10/34/26/22/20 | b2 ×3 → b5 ×3 → tk_hijack → tk_a7 (16) | Spark Rune [linger, echo]; Ember Rune [split]; Tide Wave | lure them onto traps, then fire the traps yourself |
| **Scaffolder** | 16/24/22/24/26 | d2 ×3 → d3 ×2 → d5 → tk_e7 (14) | Ember Lob; Tide Rune [split] | builds everywhere; the best Floodgate class |

### 20.4 Moth Oracle

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Night Hunter** (starter) | 14/28/22/22/26 | d2 ×3 → d4 ×3 → d5 → mo_e7 (16) | Gleam Bolt [seek, bounce]; Rime Rune; Shade Tether | hunts in the dark, crits and marks |
| **Sunmoth** | 8/38/26/26/14 | b2 ×3 → a3 ×2 → a4 → mo_a7 (14) | Gleam Beam [heavy]; Gleam Ring [linger]; Gleam Bolt | burns the Unlit out of whole rooms |
| **Knotweaver** | 8/36/30/24/14 | c2 ×3 → c4 → c5 → mo_c7 (12) | Spark Bolt [split] {on_hit → ember rune [linger]}; Gleam Lob {on_kill → gleam ring} | a combo engine: the most "build the spell" class |

### 20.5 Chimneysweep

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Rooftop** (starter) | 24/20/20/24/24 | c2 ×3 → c3 ×3 → c5 → cs_c7 (16) | Ember Arc; Spark Tether; Bile Lob [split] | never touches the floor |
| **Soot Devil** | 28/18/20/26/20 | d2 ×3 → d4 ×2 → d5 → cs_e7 (14) | Ember Arc [heavy]; Spark Bolt [bounce, swift] | dash through packs, reset on kills |
| **Chimney Fire** | 14/32/22/24/20 | b2 ×3 → b3 → b6 → cs_a7 (12) | Ember Bolt [split]; Ember Wave [linger]; Spark Tether | free fire from the swing |

---

## 21. Data: which values live where

File names and field shapes are **10's** (10 §5). This page owns the values in:

| File | Holds (values from) |
|---|---|
| `data/classes.json` | §6.1–§6.3 per class, the movesets (§8.2 … §15.2 frame data), the class abilities (§8.3 … §15.3), passives |
| `data/boards.json` | the five 12-node boards (§8.4 … §15.4) and §7's tier costs and needs |
| `data/progression.json` | §4 (per-point values, soft caps), §5 base numbers, §17 XP curve and sources |
| `data/challenges.json` | §16.5, §16.6 |
| `data/balance.json` → `progression` | the tuning knobs below |

**`progression` knobs** (values; shape in 10):

| Knob | Value |
|---|---|
| XP curve | a 60, exponent 1.6, b 40, round to 10; Long Descent growth 1.06 per level |
| per level | attributes 3, skills 1 (from level 2; banked in Act 1), health 6, oil 4; beyond 30: attributes 2, a skill point every 3 levels |
| skill points per Great Lamp | 1 |
| soft caps | Might 20, Wick 25, Draught 20, Nerve 25, Knack 20 |
| per point | Might: melee +2%, knockback +1, crit damage +1% · Wick: spell +2%, status +1% · Draught: oil +5, regen +0.1, dark burn −1% · Nerve: health +8, stagger resist +2%, resist +0.5 · Knack: crit +0.3%, build +1%, interact +1%, loot +1% |
| base | health 60, oil 75, regen 3.0, crit 5%, crit ×1.5, poise 30, oil on melee 1.5 |
| dark | regen 0, lantern burn 2.5 (items 2.0–3.0), Draught cut max 30%, hooded ×0.25 |
| hurt | i-frames 0.6 s, hurt 0.2 s at 0.3 control, wall stagger 160 cells/s for 0.3 s, player stagger 0.4 s, poise refill after 2 s |
| hit-stop ticks | heavy/crit 2, boss poise break 4, DoT 0 |
| grey kill | 5 below ×0.25, 8 below ×0 |
| trap kill XP | ×1.5 |
| off-class weapon | ×0.80 |

A saved character holds class, level, XP, attributes, unspent points, board ranks, respecs used per act, the
max-health debt and its class-switch history; the shape is 10's.

---

## 22. Code and tests

The module list is 10's (10 §3). What this page's modules do: derive stats; load and apply a class; run a moveset
(idle → startup → active → recovery, combo window, buffer, cancels, hitbox tests, cell breaking through the world's
cell API); one small module per class ability; buy / refund / validate board nodes; the `rule` hooks; challenge
listeners writing profile counters; XP.

| Check | Kind | What it proves |
|---|---|---|
| stats | node | §4 formulas and soft cap: Wick 40 → 32.5 effective; L1 Nerve 5 health 100; Draught 15 regen 4.5; regen 0 in the `dark` ambient tier; dark burn 2.5 × Draught cut × hood |
| xp | node | the §17.1 table from the formula; §17.4 values; grey-kill rule; trap kills ×1.5 credited to "The Hollow"; knock-outs pay as kills |
| boards | node | 5 boards × 12 nodes, 3 branches × 4 tiers, tier costs 1/2/3/4, capstone needs tier 2 + 5 branch points, one capstone at a time, every `rule` exists, `tk_hijack` present |
| hurt rules | node | i-frames 600 ms; DoT and void-zone ticks ignore them; wall stagger at 161 cells/s but not at 159; hit-stop 2 / 4 / 0 ticks; perfect dodge only inside the last 100 ms |
| movesets | node | each class's Light 1 total = its weapon's swing time (08); no active window of 0; pogo 24 cells |
| class switch | node | level and gear kept; attributes = new spread + (level − 1) × 3 unspent; skill points refunded; both new starting wicks granted; off-class weapon −20% |
| challenges | node | fed event scripts: the Widow's snuff never counts; hooding never counts; a Shade gutter counts; bronze in each trial unlocks; slow rope wiggle does not count |
| knobs | node | moving each `progression` knob to an odd value changes `derive()` (dead-knob guard) |
| classes in play | Playwright | each class spawns in the test room, does its 3-hit combo on a dummy, uses its ability, and its starting wicks cast |
| `tools/sim-progression.mjs` | tool | a bot plays each act's main path (05 spawns + 08 loot) and reports the level at each act end against §17.3 |

---

## 23. v2 changes

The v1 "Proposed canon changes" are settled:

- `class_ability` key (v1 proposal 1): **decided by 02** — `R` / tap LB (R18).
- Class-specific dodges (proposal 2): **kept** for the Sluicewarden (Brace + shield step) and Moth Oracle (Flutter);
  the other two were parked classes.
- Difficulty count (proposal 3): **three** — `wicklit` / `lamplighter` / `lampless` + Iron Wick; the table is 02's
  (R15).
- Skill points from Great Lamps (proposal 4): **accepted** (35 by level 30).
- Oil from melee (proposal 5): **accepted** (R36 keeps it: the pole is the skill answer to the dark).
- Starting wicks grant their strands (proposal 6): **accepted**, with the Sluicewarden's Tide **dry** until Act 3
  (R28).
- Starting wicks for the challenge classes (proposal 7): kept for Chimneysweep and Moth Oracle (00 §7).

What changed on this page:

- **R30** five classes; Ferrywitch, Bellringer, Drowned Knight (sections, challenges, builds, board nodes) parked;
  §6.4 adds the class switch ("Answer the call" at the next act hub).
- **R7, R35** §7: boards are 12 nodes (three branches of four), tier costs 1 / 2 / 3 / 4, capstone needs 5 branch
  points; each class keeps 12 of its 24 (the three capstones kept); board opens in Act 2; skill points bank from
  level 2. **B7** Tinker `tk_hijack`.
- **R28** Sluicewarden starts with Rime Wave / Tide Arc (dry until Act 3); every class owns `ember` + `bolt`;
  class abilities unlock at the Act 1 relight.
- **R29** §16.5: the 2 s Widow rule and its test are gone; her snuff never counts; hooding is not "out"; bronze in
  `trial_hooded_crossing` also unlocks.
- **R52** §16.6: 2,000 m = 16,000 cells; bronze in `trial_rope_gauntlet` also unlocks (door `a2_n04`).
- **R55, R56, R57** this page owns melee frame data, `subduable` and pogo 24; class movement lives here (07 §2.16
  deleted); everyone wall-jumps, the Chimneysweep adds wall-run.
- **R54** §2.1 movement rows link to 07 / `movement.json` (coyote 0.10 s, buffer 0.12 s, fall rule 160 / 5% per 20 /
  cap 60%).
- **R36** regen 0 in the dark; dark lantern burn 2.5 oil/s (items 2.0–3.0), Draught −1%/pt (max −30%), hooded ×0.25;
  the Guild flask; melee +1.5 oil kept.
- **R83, R84, R85, B21** §2.2: the one hurt / contact / hit-stop table, and the perfect-dodge rain freeze.
- **R35** dodge from the start; heavy + plunge/pogo from `a1_n06`; Act 1 level-ups give attribute points only.
- **R15** §19 links 02's table (ids `wicklit` / `lamplighter` / `lampless`); the v1 values are parked below as the
  suggested rows.
- **R75** §18: Ferry max-health debt capped at 20%, refunded at each Great Lamp.
- **B6** §17.2: trap and world kills +50% XP, Ledger source "The Hollow".
- **R4** §21: JSON shapes go to 10; values stay here.
- §5: no hood slot; `lightRadius` = lantern item × (1 + light%), 06 applies the oil %; Might's carry = tonic and
  plank capacity.
- §20: builds for the five classes, ship strands only.
- Build notes (other owners' files, not changed here): `data/movement.json` has `knock.wallStagger` 200 (this page:
  160) and `pogo.v` 220 (≈ 27 cells; 24 cells needs ≈ 208); 07 should align them.

---

## Parked (v2)

Nothing below ships. Each block is the v1 text as it was, under the finding that cut it, with what replaced it.

### Shared body and melee

**Parked by R54, R36, R53, R84: the v1 shared-body table (its own movement numbers, fall damage from 120 cells, always-on oil regen).** Replaced by: §2.1 (movement links to 07 / movement.json; dark rules) and §2.2 (the one hurt table).

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

**Parked by R31, R39: the Bell Tithe reference in the non-lethal heavy rule.** Replaced by: §3 (knock-outs count toward `knell_spared`, 01).

- **Non-lethal heavy.** A fully charged heavy against a target tagged `subduable` (cultists, thieves, some
  humans — 05) cannot take it below 1 HP; at 1 HP it is **knocked out** and stays down for the room. This is the
  "pole's non-lethal charge" of 01 (the Bell Tithe's prices watch for it, 08 §16).


### Classes at a glance

**Parked by R30: the rows for the three parked classes in the base-numbers, starting-wick and world tables.** Replaced by: §6.1–§6.3 (five classes).

| Class | M/W/D/N/K | Health × | Oil × | Armour | Walk / Run | Jump apex | Dodge | Resist (base) | Weapon (08 §5.2) | Lantern (08 §5.1) |
|---|---|---|---|---|---|---|---|---|---|---|
| Ferrywitch | 3/7/6/4/5 | ×0.95 | ×1.10 | 0 | 58 / 92 | 32 | **Glide** 52 cells over water surfaces, 180 ms | tide +15, shade +15 | `wpn_oarstaff` | `lantern_tin` |
| Bellringer | 7/5/4/6/3 | ×1.05 | ×1.00 | 5 | 55 / 88 | 30 | roll 40 cells, 160 ms; tolls on landing (§12) | spark +15, physical +10 | `wpn_handbell` | `lantern_tin` |
| Drowned Knight | 7/4/3/8/3 | ×1.15 | ×0.90 | 10 | 57 / 88 | 30 | **Sink-step** 36 cells, 200 ms | tide +25, shade +10, ember +10, spark −25 | `wpn_anchor` | `lantern_tin` |

| Class | Slot 1 | Slot 2 | Why |
|---|---|---|---|
| Ferrywitch | **Tide Bolt** (`tide`+`bolt`) | **Bile Lob** (`bile`+`lob`) | soak and knock enemies into water; acid pools make corpses in water |
| Bellringer | **Spark Ring** (`spark`+`ring`) | **Rime Wave** (`rime`+`wave`) | area control: stun and slow what comes at you |
| Drowned Knight | **Tide Arc** (`tide`+`arc`) | **Bile Bolt** (`bile`+`bolt`) | a close sweep that knocks back, and armour stripping for the anchor |

| Class | Building (07) | Ropes & grapple (07) | Water |
|---|---|---|---|
| Ferrywitch | ×0.8 build speed | normal | Glide dodge on water surfaces; breath 24 s; raises corpses in water |
| Bellringer | ×1.0; can **ring** a placed plank (melee) to shake loose cells above it | normal | normal; tolls carry through water (radius ×1.5 underwater) |
| Drowned Knight | ×0.8 | grapple range −20% (heavy armour) | **never drowns**; sinks instead of floating; walks the bottom at full speed; swims up only 30 cells/s |

**Parked by R28: the v1 Sluicewarden starting wicks (Tide Wave + Rime Arc, a wet Tide from minute one) and the strand-grant paragraph.** Replaced by: §6.2 (Rime Wave + a dry Tide Arc; 03 §3.3).

Canon for the first three; the others are this page's choice. A starting wick **grants the strands in it** (so a
Sluicewarden owns `tide` from the start even though the Tide strand is otherwise an Act 3 unlock). Wick slot 1
holds the first wick; the second is ready-braided and drops into slot 2 when it opens (Act 1 room 3, 03 §15.1).

| Class | Slot 1 | Slot 2 | Why |
|---|---|---|---|
| Sluicewarden | **Tide Wave** (`tide`+`wave`) | **Rime Arc** (`rime`+`arc`) | canon: push them into water, then freeze them in it |


### Skill boards

**Parked by R7, R35: the v1 24-node board layout, costs and ranks.** Replaced by: §7 (12 nodes: three branches of four).

**(v1) 7.1 Layout**

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

**(v1) 7.2 Costs and ranks**

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

**(v1) 7.3 Effect kinds**

Every node effect is one of these kinds in `data/boards.json` (§21.3), so code handles a short list:
`stat` (adds to a derived stat), `flameMult` (per-flame damage %), `shapeMult`, `status` (changes a status
number), `ability` (changes the class ability's numbers), `move` (changes one melee move), `rule` (a named
hook in code: e.g. `ll_fresh_wick`), `unlock` (an action or build part). `rule` nodes each have a unit test.

**Parked by R7: the v1 Lamplighter board (24 nodes); the 12 cut are ll_c1, ll_a3, ll_d3, ll_e3, ll_a4, ll_c4, ll_e4, ll_a5, ll_b5, ll_e5, ll_b6, ll_d6.** Replaced by: §8.4.

**(v1) 8.4 Skill board — branches: **Wickcraft** (left) · **Guild** (centre) · **Pole** (right)**

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

**Parked by R7: the v1 Sluicewarden board; the 12 cut are sw_c1, sw_a3, sw_c3, sw_d3, sw_e3, sw_a4, sw_b4, sw_e4, sw_b5, sw_e5, sw_b6, sw_d6.** Replaced by: §9.4.

**(v1) 9.4 Skill board — **Tidecaller** (left) · **Warden** (centre) · **Hook** (right)**

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

**Parked by R7, B7: the v1 Tinker board; the 13 cut are tk_c1, tk_c2, tk_a3, tk_b3, tk_e3, tk_a4, tk_b4, tk_d4, tk_e4, tk_a5, tk_e5, tk_b6, tk_d6 (Hijack took the 12th place).** Replaced by: §10.4.

**(v1) 10.4 Skill board — **Sparkwright** (left) · **Engineer** (centre) · **Carpenter** (right)**

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

**Parked by R7, R44: the v1 Moth Oracle board; the 12 cut are mo_c1, mo_b3, mo_c3, mo_d3, mo_e3, mo_b4, mo_e4, mo_a5, mo_b5, mo_e5, mo_b6, mo_d6; mo_c7 Twice-Tied (knot depth 2) was rewritten because depth 2 is parked.** Replaced by: §14.4.

**(v1) 14.4 Skill board — **Seer** (left) · **Moth** (centre) · **Rod** (right)**

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

**Parked by R7: the v1 Chimneysweep board; the 12 cut are cs_c1, cs_a3, cs_d3, cs_e3, cs_a4 (now a base rule, burning panic B12), cs_b4, cs_c4, cs_e4, cs_a5, cs_b5, cs_e5, cs_d6.** Replaced by: §15.4.

**(v1) 15.4 Skill board — **Soot** (left) · **Rigger** (centre) · **Spear** (right)**

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


### Class details

**Parked by R46: the v1 Moth-sight darkness threshold (light < 0.3) and the Silent Bells line in Foresight.** Replaced by: §14.1 (the `dark` tier) and §14.3.

- **Passive — Moth-sight** (`mo_moth_sight`): sees in darkness 40 cells beyond her light (the Moth-Lamp implicit,
  drawn as a grey-violet outline of terrain and enemies); **+25% crit chance** against targets standing in darkness
  (light at their centre < 0.3, 06); every hit **marks** the target for 5 s — marked targets take +10% damage from
  you and are outlined for her through walls within 120 cells.
| Secrets | breakable walls and hidden Silent Bells within 120 cells shimmer for 8 s |

**Parked by R57: the v1 Chimneysweep wall-jump wording.** Replaced by: §15.1 (everyone wall-jumps; wall-run is the Chimneysweep's).

- **Wall-run**: running into a wall while airborne runs up it for 0.6 s (40 cells), then a wall-jump (off-wall
  kick 120 cells/s + jump) is available; wall-jumps work on any wall.

**Parked by R31, R32: the v1 Tinker turret gadget reference.** Replaced by: §10.3 (gadgets are parked in 08).

Deploy a small tripod turret at your feet (or on a plank). 08's `gad_turret_ember` gadget uses these stats.


### Parked classes

**Parked by R30: Ferrywitch, Bellringer and Drowned Knight (bodies, passives, movesets, abilities, 24-node boards).** Replaced by: nothing; five classes ship. Sections 11–13 keep one-line stubs.

**(v1) 11. Ferrywitch (`ferrywitch`)**

*Summoner of the drowned dead. Unlock: defeat the Sluicemaw without leaving the water for more than 10 s at a time.*

**(v1) 11.1 Body and passive**

- Walk 58, run 92, jump 32. Health ×0.95, oil ×1.10.
- **Dodge is Glide**: 44 cells on land; on a water surface she skims **52 cells** and ends standing on the water
  for 0.4 s (can jump from it). Invulnerable 0–180 ms.
- **Passive — Cold Blood** (`fw_cold_blood`): breath 24 s; each living Oarsman gives +4% spell power.
- Corpses: an enemy that dies with its centre in water ≥ **8 cells** deep leaves a **raisable corpse** (glowing
  violet ripple) for 20 s. The Oar-Staff implicit (08) makes even tiny enemies leave one.

**(v1) 11.2 Melee — Oar-Staff (swing 470 ms, reach 22)**

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Pole Stroke | 120 / 70 / 280 | 100% | 22 × 6 | 1.0 | 8 | |
| Light 2 — Back Stroke | 130 / 80 / 290 | 110% | 22 × 10 front + 10 × 10 behind | 1.0 | 8 | hits behind too |
| Light 3 — Feather | 170 / 90 / 360 | 150% | 24 × 14 arc | 1.8 | 16 | on water: throws a splash (soaks, 03 §4) |
| Heavy — Deep Stroke | charge 350 + 150 / 100 / 400 | 230% | 26 × 12 | 2.5 | 28 | pushes a wave of water 12 cells ahead if you stand in water; non-lethal vs `subduable` |
| Air — Scull | 100 / 60 / 220 | 90% | 22 × 10 | 1.0 | 6 | |
| Plunge — Mooring Post | 140 / until landing / 280 | 160% | 12 × 8 | 1.5 | 20 | pinned enemy: rooted 0.5 s |
| On-water — Paddle Sweep | 110 / 80 / 260 | 120% | 26 × 8 at water level | 1.5 | 10 | replaces Light 1 while gliding |

**(v1) 11.3 Class ability — Raise Oarsman (`ability_raise`)**

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

**(v1) 11.4 Skill board — **Crew** (left) · **Ferry** (centre) · **Oar** (right)**

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

**(v1) 12. Bellringer (`bellringer`)**

*Sound, stagger, area control. Unlock: ring all 12 Silent Bells hidden across Acts 1–4.*

**(v1) 12.1 Body and passive**

- Walk 55, run 88, jump 30. Health ×1.05, armour 5.
- **Passive — Toll** (`br_toll`): every **4th hit you land** (melee or spell, any target) **tolls**: a sound pulse,
  radius 32 around the target, 25 poise to every enemy in it, 20% of that hit as physical damage. Canon "spells can
  carry a toll": the toll counter is shown as 4 pips under the health bar. A toll through water has ×1.5 radius.
- Dodge 40 cells, invulnerable 160 ms; landing from a dodge in the air tolls (free, once per 4 s).
- Standing next to a big bell (07) and hitting it = a Great Toll with no oil cost (once per bell per room).

**(v1) 12.2 Melee — Hand-Bell and Maul (swing 560 ms, reach 16)**

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Clang | 160 / 70 / 330 | 100% | 16 × 10 | 1.2 | 14 | implicit 15% stagger on hit (08) |
| Light 2 — Backhand Bell | 150 / 70 / 330 | 100% | 16 × 12 | 1.2 | 14 | the hand-bell rings: +1 toll pip |
| Light 3 — Overhead Maul | 220 / 90 / 420 | 200% | 18 × 16 | 2.5 | 35 | shakes loose cells of hardness ≤ 1 in a 10-cell radius above the hit |
| Heavy — Tolling Blow | charge 400 + 180 / 100 / 480 | 280% | 20 × 18 | 3.0 | 50 | always tolls; non-lethal vs `subduable` |
| Air — Swinging Bell | 120 / 70 / 260 | 90% | 16 × 12 | 1.2 | 10 | |
| Plunge — Ground Knell | 180 / until landing / 360 | 200% | 24 × 8 (both sides) | 2.0 | 30 | tolls on landing |
| Ring (on a plank) | 150 / 70 / 300 | — | 16 × 10 | — | — | shakes loose the cells above a plank you built (07) |

**(v1) 12.3 Class ability — Great Toll (`ability_great_toll`)**

| Number | Value |
|---|---|
| Oil / cooldown | 20 oil / 18 s |
| Area | sound wave radius 80 around you (×1.5 underwater), expands in 0.3 s |
| Effect | 60 poise to every enemy (staggers standards and most heavies); 0.6 s stun to fodder/standard; 15 physical damage + 3 × level |
| World | cells of hardness ≤ 1 on **ceilings** within the radius fall (rubble); enemy projectiles in the radius drop |
| Tolled spells | your next **3** casts carry a toll: +25% radius on bursts/rings/runes, and each hit tolls (bypassing the 4-hit counter) |
| Sound | `lf.class.great_toll` (sfx), and every Silent Bell in the room hums |

**(v1) 12.4 Skill board — **Knell** (left) · **Bell** (centre) · **Maul** (right)**

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

**(v1) 13. Drowned Knight (`drowned_knight`)**

*Lifesteal bruiser who breathes water. Unlock: die 3 times underwater, then clear an act without dying.*

**(v1) 13.1 Body and passive**

- Walk 57, run 88, jump 30. Health ×1.15, oil ×0.90, armour 10.
- **Passive — Drowned** (`dk_drowned`): never drowns (breath infinite); sinks instead of floating (40 cells/s);
  walks the bottom at full walk speed; swims up only 30 cells/s (kick +25); **life steal 5%** of melee damage and
  2.5% of spell damage (the weapon's implicit adds to this). Spark resist −25 (the wet armour).
- **Dodge is Sink-step**: 36 cells, invulnerable 0–200 ms; underwater it has no slowdown.

**(v1) 13.2 Melee — Anchor-Blade (swing 540 ms, reach 20)**

| Move | S / A / R (ms) | Damage | Hitbox | KB × | Poise | Notes |
|---|---|---|---|---|---|---|
| Light 1 — Fluke Cut | 150 / 70 / 320 | 100% | 20 × 8 | 1.2 | 14 | |
| Light 2 — Chain Swing | 160 / 90 / 320 | 115% | 20 × 16 arc | 1.2 | 14 | |
| Light 3 — Keel Crush | 220 / 90 / 420 | 190% | 20 × 16 | 2.5 | 32 | underwater: no drag penalty |
| Heavy — Anchor Fall | charge 380 + 170 / 100 / 460 | 270% | 22 × 18 | 3.0 | 45 | non-lethal vs `subduable`; breaks hardness ≤ 2 |
| Air — Chain Arc | 120 / 80 / 260 | 95% | 22 × 12 | 1.2 | 10 | |
| Plunge — Sinker | 150 / until landing / 320 | 210% | 16 × 10 | 2.0 | 30 | falls 360 cells/s through water too |
| Underwater Light (any) | as above | +10% | as above | ×0.8 | as above | the Knight fights best below |

**(v1) 13.3 Class ability — Undertow Chain (`ability_undertow_chain`)**

Throw the anchor on its chain.

| Number | Value |
|---|---|
| Oil / cooldown | 10 oil / 7 s |
| Range | 90 cells, flies 400 cells/s |
| On a fodder/standard enemy | yanks it to you (arrives in 0.25 s), 150% melee damage, lifesteal ×2 for 3 s |
| On a heavy, elite, boss, or solid cell | yanks **you** to it at 300 cells/s (a grapple), lifesteal ×2 for 3 s |
| Underwater | range ×1.3, no slowdown |
| Misses | returns; 50% cooldown |

**(v1) 13.4 Skill board — **Abyss** (left) · **Oath** (centre) · **Anchor** (right)**

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


### Unlock challenges

**Parked by R30: the v1 progress rules (a new class only in a new game, no mid-save switch).** Replaced by: §16.1 and the class switch, §6.4.

**(v1) 16.1 Where progress lives**

- Challenge progress is **profile-wide** (the profile save, not a slot: `profile.challenges`, page 10), so it counts
  across every save slot, and a class once unlocked stays unlocked for every save.
- Counters match 02 §9.1 by name. The Guild Hall's Challenges page and the class-select panel show the lines.
- Tracking hooks listen on the game event bus (`js/events.js`, page 10). Each rule below names the events.
- **Trials** (09) that unlock a class count the same as the campaign route.
- Unlocking plays a Guild bell, shows a banner "A new Lamplighter answers the call: <Class>", and the class
  becomes selectable at the next **new game**. There is no mid-save class swap (the board, kit and challenge
  history stay coherent). Endless, Boss Rush and Trials can pick it immediately.

**Parked by R30, R69: the Ferrywitch, Bellringer and Drowned Knight challenges.** Replaced by: nothing (classes parked).

**(v1) 16.2 Ferrywitch — "Defeat the Sluicemaw without leaving the water for more than 10 s at a time"**

| Rule | Detail |
|---|---|
| Events | `boss_start{id:'boss_sluicemaw'}`, `player_water_enter`, `player_water_exit`, `boss_defeated`, `player_died`, `boss_reset` |
| "In the water" | at least 50% of the player's 72 body cells are water cells (swimming or wading ≥ 6 cells deep). Standing on a Frozen enemy or ice does **not** count. |
| Timer | a dry timer starts at `player_water_exit` and stops at `player_water_enter`; the fight's **max dry stretch** is the largest value. The fight starts dry-timer 0 at `boss_start` even if you start on land (the arena entrance), but the timer only begins after the intro cutscene ends. |
| Drained arena | when the Sluicemaw drains the arena (05) and no water ≥ 6 deep exists anywhere in the arena, the dry timer is **paused** (you cannot be blamed for no water). A 0.5 s grace after the water returns. |
| Pass | `boss_defeated` with max dry stretch ≤ 10.0 s. Boss Rush counts. |
| Counters | `ch_ferry_best_dry` = lowest max-dry among Sluicemaw wins; `sluicemaw_wins` |

**(v1) 16.3 Bellringer — "Ring all 12 Silent Bells hidden across Acts 1–4"**

| Rule | Detail |
|---|---|
| Events | `silent_bell_rung{bellId}` (01 §4 lists the 12, 09 §3 their rooms) |
| Ringing | hit the bell with melee, a spell, or a Great Toll; some need a `key_silent_bell` clapper (08 §12.2) |
| Persistence | the set of rung bell ids is profile-wide: ringing 5 in one save and 7 in another unlocks |
| Pass | `silent_bells` holds all 12 ids |

**(v1) 16.4 Drowned Knight — "Die 3 times underwater and then clear an act without dying"**

| Rule | Detail |
|---|---|
| Events | `player_died{underwater}`, `act_started{act}`, `act_cleared{act}` (the Great Lamp relit), `player_died` |
| Underwater death | the player's head cell is in water at the moment of death (drowning or not) |
| Step 1 | `ch_knight_drownings` counts to 3 (profile-wide, across slots) → `ch_knight_armed = true` |
| Step 2 | after arming, any act **started after** arming and cleared with 0 deaths in that act on that slot → pass. An act in progress at the moment of arming does not count (its start was before arming). Reloading a lamp-post save does not erase a death (deaths are written immediately). |
| Endless | a floor range of 10 floors with 0 deaths counts as "an act" for step 2 |
| Counters | `ch_knight_drownings`, `ch_knight_armed`, `ch_knight_clean_act` |

**Parked by R29: the v1 Widow 2 s relight rule.** Replaced by: §16.5 (the snuff never counts).

| Rule | Detail |
|---|---|
| The Widow | the Lampless Widow's scripted snuff (05) **counts** unless relit within 2.0 s (tonic, a spell cast, or `interact` at a sconce). This keeps the challenge honest but possible. |

**Parked by R34, R52: the v1 Rope Gauntlet alternative (a1_sweeps_loft, a finish).** Replaced by: §16.6 (bronze, door `a2_n04`).

| Rule | Detail |
|---|---|
| Or | `trial_complete{id:'trial_rope_gauntlet'}` (01 `a1_sweeps_loft`) |


### XP and respec

**Parked by R30, R69: the Silent Bell XP row.** Replaced by: nothing (Silent Bells parked).

| Source | XP | Notes |
|---|---|---|
| Silent Bell rung | 50 × area level | |

**Parked by R90: the Long Descent respec shrine.** Replaced by: §18 (a lamp-post respec every 10 depths).

- Endless / Daily: a respec shrine appears every 10 floors, free once.


### Difficulty

**Parked by R15: the v1 difficulty table on this page (easy / normal / hard ids). 02 owns the table now; these values are this page's suggestion for 02's rows.** Replaced by: §19 (links 02's table, lists the rows this page reads).

**(v1) 19. Difficulty and progression**

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


### Builds

**Parked by R30, R44: the v1 recommended builds (eight classes; wicks with parked charms and knots, 24-node board paths).** Replaced by: §20.

**(v1) 20. Recommended builds per class**

Attribute targets are "at level 30" (112 points total). Board picks list the order to buy. Wick recipes use 03's
names (03 §18 has 26 more).

**(v1) 20.1 Lamplighter**

| Build | Attributes (M/W/D/N/K) | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Guild Standard** (starter) | 14/35/28/25/10 | c1 → b2 ×3 → b3 ×3 → a3 → a4 ×3 → b4 → a5 ×3 → ll_a7 (25 points), then c2 ×3 | Ember Bolt [split, seek]; Gleam Ring [vast]; Spark Lob [linger]; Rime Arc | overcharge a big bolt, ring when rushed |
| **Pole-and-Lantern** | 28/25/20/28/11 | c1 → d2 ×3 → d3 → d4 → d5 → ll_e7 | Ember Arc [heavy, steady]; Gleam Ring; Spark Bolt [pierce] | melee first, free wick casts on combo enders |
| **Beacon Keeper** | 12/30/30/30/10 | c1 → c2 ×3 → c3 → c4 → c5 → ll_c7 | Gleam Beam [steady, vast]; Tide Wave; Ember Rune | plant, fight inside the light |

**(v1) 20.2 Sluicewarden**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Lock-keeper** (starter) | 22/18/20/40/12 | c1 → c2 ×3 → c3 ×2 → c4 → c5 → sw_c7 | Tide Wave; Rime Arc; Spark Bolt | brace, perfect block, freeze in water |
| **Floodcaller** | 12/34/26/30/10 | c1 → b2 ×3 → a3 → a4 → a5 → sw_a7 | Tide Lob [vast]; Rime Lob [vast]; Spark Lob [linger] | flood the room, freeze or shock it |
| **Hookmaster** | 30/16/18/36/12 | c1 → d2 ×2 → d3 → d4 → d5 → sw_e7 | Rime Arc [heavy]; Bile Bolt [split] | drag one enemy at a time into the pit |

**(v1) 20.3 Tinker**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Workshop** (starter) | 12/28/24/24/24 | c1 → c2 → c3 ×3 → c4 → c5 → tk_c7 | Spark Rune [split]; Ember Lob [heavy, volatile]; Rime Wave | turrets hold, you build the high ground |
| **Minelayer** | 10/34/26/22/20 | c1 → b2 ×3 → b3 → b4 → b5 → tk_a7 | Spark Rune [vast, linger]; Ember Rune {on_timer → spark bolt} | corridors of traps |
| **Scaffolder** | 16/24/22/24/26 | c1 → d2 ×3 → d3 → d4 → d5 → tk_e7 | Ember Lob; Tide Rune [vast] | builds everywhere; best Floodgate (waves) class |

**(v1) 20.4 Ferrywitch**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Admiral** (starter) | 8/34/30/26/14 | c1 → b2 ×3 → a3 → a4 → a5 → fw_a7 | Tide Bolt; Bile Lob; Shade Wave {on_kill → tide bolt} | a crew of five does the fighting |
| **Black Ferry** | 10/30/28/32/12 | c1 → c2 ×3 → c3 → c4 → c5 → fw_c7 | Shade Beam [siphon]; Tide Ring | hard to kill, drains and pulls |
| **Oar of the Deep** | 26/22/22/30/12 | c1 → d2 ×3 → d3 → d4 → d5 → fw_e7 | Tide Wave; Spark Lob [linger] | melee in flooded rooms, chaining through water |

**(v1) 20.5 Bellringer**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Carillon** (starter) | 20/28/20/32/12 | c1 → b2 → a3 ×3 → a4 → a5 → br_a7 | Spark Ring [echo, vast]; Rime Wave; Ember Bolt [split] | toll, then a spray of wicks in every direction |
| **Stagger Lock** | 30/16/18/36/12 | c1 → d2 ×3 → d3 → d4 → d5 → br_e7 | Rime Ring [steady, vast]; Bile Bolt | nothing gets to act |
| **Bell-Wright** | 18/26/20/34/14 | c1 → c2 ×3 → c3 → c4 → c5 → br_c7 | Spark Ring; Ember Lob [heavy] | gravity flips and rubble do the damage |

**(v1) 20.6 Drowned Knight**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Anchor Knight** (starter) | 32/14/14/40/12 | c1 → d2 ×3 → d3 → d4 → d5 → dk_e7 | Tide Arc; Bile Bolt; Rime Arc [heavy] | pull, crush, steal life |
| **Abyssal** | 16/32/20/34/10 | c1 → b2 ×3 → a3 → a4 → a5 → dk_a7 | Shade Beam [siphon]; Shade Bolt [seek]; Tide Wave | a drain caster who fights from under the water |
| **Unsinkable** | 24/18/16/44/10 | c1 → c2 ×3 → c3 ×3 → c4 → c5 → dk_c7 | Tide Arc [heavy]; Gleam Ring | the tank that does not die |

**(v1) 20.7 Moth Oracle**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Night Hunter** (starter) | 14/28/22/22/26 | c1 → d2 ×3 → d3 ×3 → d4 → d5 → mo_e7 | Gleam Bolt [seek, pierce]; Rime Rune; Shade Tether | hunts in the dark, crits and marks |
| **Sunmoth** | 8/38/26/26/14 | c1 → b2 ×3 → a3 → a4 → a5 → mo_a7 | Gleam Beam [steady]; Gleam Tether [linger]; Gleam Ring | burns the Unlit out of whole rooms |
| **Knotweaver** | 8/36/30/24/14 | c1 → c2 → c3 → c4 → c5 → mo_c7 | Spark Bolt {on_hit → ember rune [linger] {on_timer → spark bolt}} (depth 2 from Twice-Tied) | combo engine; the most "build the spell" class |

**(v1) 20.8 Chimneysweep**

| Build | Attributes | Board path | Wicks | Plays like |
|---|---|---|---|---|
| **Rooftop** (starter) | 24/20/20/24/24 | c1 → c2 ×3 → c3 ×3 → c4 → c5 → cs_c7 | Ember Arc; Spark Tether; Bile Lob [split] | never touches the floor |
| **Soot Devil** | 28/18/20/26/20 | c1 → d2 ×3 → d3 → d4 → d5 → cs_e7 | Ember Arc [heavy]; Spark Bolt [bounce, swift] | dash through packs, reset on kills |
| **Chimney Fire** | 14/32/22/24/20 | c1 → b2 ×3 → a3 → a4 → a5 → cs_a7 | Ember Bolt [split]; Ember Wave [linger]; Spark Tether | free fire from the swing |



### Data and code

**Parked by R4: the v1 JSON shapes (classes, movesets, boards, abilities, challenges, save, balance progression) and the v1 file list.** Replaced by: 10 §5 owns shapes and 10 §3 the modules; §21 lists the values, §22 the checks.

**(v1) 21. Data: JSON files and schemas**

All in `prototypes/lanternfall/data/`. Page 10 owns the layout.

**(v1) 21.1 `classes.json`**

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

**(v1) 21.2 `movesets.json`**

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

**(v1) 21.3 `boards.json`**

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

**(v1) 21.4 `abilities.json`**

```json
{ "schema": 1, "abilities": [
  { "id": "ability_beacon", "name": "Beacon", "oil": 20, "cooldown": 30,
    "params": { "duration": 12, "radius": 80, "spellPct": 0.15, "regenMult": 2, "hpBase": 60, "hpPerLevel": 10 } },
  { "id": "ability_turret", "name": "Turret", "oil": 15, "scrap": 3, "cooldown": 8,
    "params": { "max": 2, "hpBase": 60, "hpPerLevel": 8, "armour": 20, "powerMult": 0.5, "interval": 0.8, "range": 160, "duration": 40 } }
] }
```

**(v1) 21.5 `challenges.json`**

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

**(v1) 21.6 In the save**

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

**(v1) 21.7 `balance.json` → `progression`**

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

Files: `js/stats.js` (`derive()`), `js/classes.js` (load + apply a class), `js/melee.js` (runs a moveset:
state machine idle → startup → active → recovery, combo window, buffer, cancels, hitbox tests against the
entity spatial hash, cell breaking through `world.setCell`), `js/abilities.js` (one small module per ability
under `js/abilities/`), `js/board.js` (buy/refund/validate), `js/board-rules.js` (the `rule` hooks),
`js/challenges.js` (event listeners → profile counters), `js/xp.js`.

