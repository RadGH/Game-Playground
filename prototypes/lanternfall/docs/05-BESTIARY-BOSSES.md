# LANTERNFALL — page 05: Bestiary and Bosses

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> Every monster that ships in Vessmere (30 regular foes, 8 elite modifiers, 3 minibosses, 6 bosses): how each one
> thinks, moves, attacks, telegraphs, dies and drops, plus the shared rules for spawning, aggro, group tactics,
> lures, traps, scaling and boss camera zones. Cut v1 monsters and attacks are kept in **Parked (v2)** at the end.

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Shared rules: numbers, tiers and scaling](#2-shared-rules-numbers-tiers-and-scaling)
3. [The AI model (state machine, senses, budget)](#3-the-ai-model)
4. [Group tactics, aggro and leash](#4-group-tactics-aggro-and-leash)
5. [How status effects change behaviour](#5-how-status-effects-change-behaviour)
6. [Physics rules every monster obeys](#6-physics-rules-every-monster-obeys) (6.2 traps, lures and burning panic)
7. [Spawning rules](#7-spawning-rules)
8. [Telegraphs and void zones (the readable-danger contract)](#8-telegraphs-and-void-zones)
9. [Act 1 — Lanterncrown & the Wax Stair](#9-act-1--lanterncrown--the-wax-stair)
10. [Act 2 — The Gutterways](#10-act-2--the-gutterways)
11. [Act 3 — The Sluice Ward](#11-act-3--the-sluice-ward)
12. [Act 4 — Blackwater](#12-act-4--blackwater)
13. [Act 5 — The Bellwell](#13-act-5--the-bellwell)
14. [Act 6 — The Cloudroot](#14-act-6--the-cloudroot)
15. [The Unlit (darkness hunters)](#15-the-unlit)
16. [The Knell (bell-cult humans)](#16-the-knell-bell-cult-humans)
17. [Elite and champion modifiers](#17-elite-and-champion-modifiers)
18. [Minibosses (Acts 2–4)](#18-minibosses)
    - [Boss rules shared by all six](#boss-rules-shared-by-all-six) (attack budget, camzones, grabs)
19. [Boss 1 — Mother Tallow](#19-boss-1--mother-tallow)
20. [Boss 2 — Saint Gnaw of the Rat Choir](#20-boss-2--saint-gnaw-of-the-rat-choir)
21. [Boss 3 — The Sluicemaw](#21-boss-3--the-sluicemaw)
22. [Boss 4 — The Lampless Widow](#22-boss-4--the-lampless-widow)
23. [Boss 5 — The Bellfather](#23-boss-5--the-bellfather)
24. [Boss 6 — Ossery Vane, the Cloudwarden](#24-boss-6--ossery-vane-the-cloudwarden)
25. [Speech: when monsters and bosses talk](#25-speech-when-monsters-and-bosses-talk)
26. [Sound ids](#26-sound-ids)
27. [Data format (link to 10)](#27-data-format)
28. [Tests and tools](#28-tests-and-tools)
29. [Build order and cheaper fallbacks](#29-build-order-and-cheaper-fallbacks)
30. [Applied in v2 (v2 changes)](#30-applied-in-v2-v2-changes)
31. [Parked (v2)](#parked-v2)

---

## 1. How to read this page

Every regular monster has two table rows (a **stat row** and a **resistance row**, grouped per act) and one
**entry** with these fields:

| Field | Meaning |
|---|---|
| **id** | snake_case id used in `data/enemies.json`, spawn tables, the Ledger (`meters/`) and Lingo tags. The 30 ids are 00 §10's, verbatim |
| **Size** | width × height in cells (1 cell = 1 art pixel; 8 cells = 1 m). The player is 6 × 12 |
| **HP** | health at the act's **base level** on Lamplighter difficulty (see §2 for scaling) |
| **Dmg** | damage of the main hit at base level, Lamplighter. Other attacks are listed in the entry |
| **Spd** | top ground / air / swim speed in cells/s. Player speeds are 07's (`data/movement.json`) |
| **Move** | one of `walker`, `crawler`, `swimmer`, `flyer`, `burrower`, `ceiling`, `rope_climber` (see §3.5) |
| **Tier** | `fodder`, `standard`, `heavy`, `elite`, `miniboss`, `boss`. The tier is the input to the act's loot table (08 §14) and sets the attack-token cost (§4) |
| **Resistances** | one **percent** per flame: `ember rime spark bile gleam tide shade`, in 03 §14.1's model. Range −100 … +100: `0` normal, `+50` takes 50% less, `-50` takes 50% more, `-100` = `weak2` (double damage), `+100` = immune. The word `heal` means the flame heals it instead (allowed by 03, R21). Bosses are immune to at most 2 flames |
| **Armour** | `armoured (n)` means **armour = 10 × n** in 03 §14.1's formula (`100 / (100 + armour)`); Shade ignores it. "Bile melts the armour" always means 03's corrode rule (each `corrode` stack removes 8 armour) |
| **AI** | a small state machine: states and the trigger that moves between them |
| **Attacks** | name, telegraph (what lights up, how long in ms), damage, reach |
| **Physics** | what the cell world does to it and what it does to the cell world (materials are 06's 36) |
| **Drops** | loot table id (08 §14) + penny range; `scrap` or `lamp_oil` extras where listed |
| **Look** | pixel-art notes: palette, silhouette, and the light it gives off. **Eyes are always lit** (a 1–2 cell emissive dot drawn after the darkness pass, 06). Art formats (ASCII sprites, part rigs) are 06 §25's |
| **Voice** | `babble`, `none`, or a Lingo bark pool; voice roles and bark limits are 01's |

Physical damage (pole swings, falling cells, crushing) is the damage type `physical` (the key `js/rpg/damage.js`
uses) and is listed only where a monster resists it (`Armour` field).

---

## 2. Shared rules: numbers, tiers and scaling

### 2.1 Player reference numbers (so monster numbers make sense)

These are assumptions from 04-CLASSES-PROGRESSION.md and 03-SPELLS.md; if those pages change them,
re-derive the monster numbers with the tool in §28 rather than editing every row by hand.

| Act | Area level | Player max HP (Lamplighter build) | Player damage per second, sustained | Starter wick hit (Ember Bolt) |
|---|---|---|---|---|
| 1 | 1–5 | 100–140 | 22 | 14 |
| 2 | 5–10 | 140–190 | 38 | 22 |
| 3 | 10–15 | 190–240 | 55 | 30 |
| 4 | 15–20 | 240–290 | 72 | 40 |
| 5 | 20–25 | 290–340 | 90 | 50 |
| 6 | 25–30 | 340–400 | 110 | 60 |

### 2.2 Time-to-kill and damage targets per tier

Every stat row in §9–16 was set from this table. The balance tool (§28) fails the build if a monster
drifts more than 30% from its tier's band. The XP column is the value 04 §17.2 multiplies (trap and world kills
get +50% there, B6).

| Tier | Kill time for the act's sustained DPS | One hit on the player (% of max HP) | Attack-token cost (§4) | XP (× area level) |
|---|---|---|---|---|
| `fodder` | 0.3–1 s (1–2 bolts) | 4–7% | 0 (swarm) or 1 | 2 |
| `standard` | 1.5–3 s | 8–12% | 1 | 5 |
| `heavy` | 4–8 s | 15–25% | 2 | 12 |
| `elite` (a standard or heavy with modifiers, §17) | 8–20 s | as base +25% | base +1 | ×3 of base |
| `miniboss` | 45–90 s | 20–30% on big hits | whole room | 60 |
| `boss` | 3–6 min including downtime (Tallow: 1.5–3 min) | 25–45% on big hits | whole room | 200 |

### 2.3 Act and level scaling

A monster lives in the act(s) listed. When it appears later than its home act (the bestiary reuses some
foes, and the Long Descent reuses all of them), it scales from its **base level** to the room's **area level**:

```
hp(L)     = baseHP  × 1.12 ^ (L − baseLevel)
damage(L) = baseDmg × 1.09 ^ (L − baseLevel)
armour(L) = baseArmour + 1 × (L − baseLevel)      // flat, 03 §14.1's armour formula
speed     = unchanged (speed never scales; difficulty changes it, 02 §10.1)
```

Base level per act: act1 = 2, act2 = 7, act3 = 12, act4 = 17, act5 = 22, act6 = 27. The Unlit and the
Knell have base level 15 and 7 respectively and scale everywhere they appear.

**Act 1 grace (B1).** In Act 1, on **every** difficulty, every monster and boss telegraph wind-up is ×1.25 and the
player's melee attack-token pool is **1** (ranged tokens as the difficulty sets). This sits on top of 02's
difficulty table. Wind-ups in this page's tables are the base values before the grace; the 250 ms floor (§8) is
applied last.

### 2.4 Difficulty

The difficulty ids are `wicklit`, `lamplighter` (default) and `lampless`, plus the one-life **Iron Wick** toggle.
Every enemy-side multiplier (health, damage, speed, telegraph length, attack tokens, elite chance, enrage, void zone
damage) is in **02 §10.1's table** (`data/difficulty.json`); this page does not restate it. Boss-only notes:

- **Mother Tallow's third phase** runs only on `lampless` and in Boss Rush (§19.7, R42).
- Telegraph wind-ups never go under **250 ms** on any difficulty for any attack; void zones always keep their full
  warm-up (§8).
- Where 02's table says bosses do not enrage (`wicklit`), the enrage timers in §19–24 are ignored.

(The v1 `drowned` difficulty and every "Drowned only" boss attack are in Parked (v2).)

### 2.5 Floodgate and Long Descent scaling

09 owns both modes; the monster side is:

- **Floodgate** (`waves`, 15 waves): enemy **area level = player level + floor(wave / 5)**. Each wave draws only
  from the spawn tables (§7.3) of acts the profile has reached (R43).
- **The Long Descent** (`endless`): area level rises by 1 every 2 floors with no cap; above level 30 HP uses
  `1.10 ^ ΔL` and damage `1.06 ^ ΔL` so it stays survivable into the 60s; one elite modifier is added to every 5th
  spawn group above level 35, two above level 45.

---

## 3. The AI model

### 3.1 One state machine for everyone

Every monster runs the same small state machine; an entry only lists the states it uses and its own
triggers. States:

| State | What it does | Leaves when |
|---|---|---|
| `idle` | stands or hangs still, plays idle anim, eyes glow dim (40%) | notices the player (§3.2) → `alert`; timer (3–8 s random) → `patrol` if it has a route; a lure (§6.2) → `lured` |
| `patrol` | walks a route (authored points or ±N cells from its anchor), pauses 1–2 s at each end | notices → `alert`; a lure → `lured` |
| `alert` | stops, faces the noise/sight, eyes brighten to 100%, plays its "notice" sound and bark, then moves to the last known player spot | reaction time over (per monster, 200–700 ms) and has sight → `attack`; reached last known spot with no sight for 4 s → `search` |
| `search` | wanders ±60 cells around the last known spot for 6 s | notices → `alert`; a lure → `lured`; timer → `return` |
| `lured` | paths toward a lure for 4 s (§6.2) | notices the player → `alert`; timer → `search` at the lure |
| `attack` | moves to its preferred range and uses attacks (each attack has its own range, cooldown and weight) | loses sight 4 s → `search`; HP below its `fleeAt` → `flee`; burning → `panic` (§6.2); leash broken → `return` |
| `flee` | runs away from the player (or toward water, dark, its hole — per monster) | healed / cornered / timer → `attack` |
| `panic` | a burning monster runs (§6.2) | burn ends → `attack` or `search` |
| `return` | walks back to its anchor, heals 10% max HP per second, cannot be re-aggroed for 1 s | reached anchor → `idle` |
| `stagger` | forced by poise break (§5.1) or a status; no actions | timer |
| `dead` | death anim, drops loot, leaves a corpse (§6.1) | — |

Attacks inside `attack` are picked by weight among the ones whose **range** and **cooldown** allow it. A
chosen attack runs: **wind-up** (the telegraph, can be interrupted by stagger), **active** (the hit
frames), **recovery** (the punish window, always ≥ 250 ms for anything that deals ≥ 15% of player max HP).

### 3.2 Senses

**Sight.** A monster sees the player if the player is inside its sight range and a line from its eye cell to
the player's chest cell passes through no solid cell (water is see-through; `smoke` and `steam` cells cut the
range by 50%). Sight range is scaled by how lit the player is, read from 06 §14.7's CPU light grid (the gameplay
truth):

```
effectiveSight = sightRange × clamp(lightAtPlayer, 0.30, 1.0)      // lightAtPlayer 0..1 from the CPU light grid
```

So a player standing in a `dark` corner with the lantern hooded (Act 4) is seen at 30% range. The Unlit use
the reverse rule, keyed to light **tiers** (§15.1). A monster facing away has a 120° blind cone behind it; inside it,
sight range is ×0.4.

**Hearing.** Noise events are posted to a list by the game; every awake monster within the radius hears
it (radius halves if the straight line crosses 8+ solid cells):

| Noise event | Radius (cells) |
|---|---|
| player walks | 0 (silent) |
| player runs | 40 |
| player lands from > 30 cells fall | 60 |
| player jumps into water / swims fast | 50 |
| pole hit on enemy or wall | 70 |
| wick cast | 90 (overcharged: 140) |
| explosion (volatile charm, oil fire, bomb) | 200 — a **loud noise** for the lure rule (§6.2) |
| lever / door / sluice gate | 80 / 100 / 160 |
| cell collapse > 50 cells | 120 |
| a bell ringing (Act 5 `bell` interactable, a clapperling's death ring) | 400 — a **loud noise** for the lure rule |

Hearing moves a monster to `alert` facing the source but it only enters `attack` once it has sight.

**Smell** (only `smell: true` monsters: rats, hounds, the Unlit creeper and Gloamhound): they track the player's
path through the last 3 s of footprints even without sight, at 70% speed. Water breaks the trail.

**Lures** (thrown lights and loud noises) are §6.2's lure rule. Monsters tagged `curious` (rats, pigeons, hounds,
fry, clapperlings, Gloamhounds) follow a lure even while in `attack`; every other monster in `attack` ignores it
unless it holds no attack token.

### 3.3 Reaction time

The delay from `alert` to the first attack. Fodder 200 ms, standard 350 ms, heavy 500 ms, Unlit 150 ms,
Knell 400 ms. Difficulty does not change it (02 §10.1 changes wind-ups instead).

### 3.4 The AI budget

The simulation runs at 60 fixed steps per second on the single main thread (00 §13: AI + spells + ropes ≤ 3 ms p95
per frame). AI "thinking" is not done every step:

| Job | How often | Budget |
|---|---|---|
| **Move/physics** of each monster body | every step (it is just a body in the cell world) | part of the physics budget, 06 |
| **Think** (state machine, attack choice, sense checks) | 10 times/s per monster, monsters spread across 6 buckets so ~1/6 think on any step | **≤ 1.2 ms per step** for all thinking |
| **Sight line checks** | only during think; max **24 line checks per step** total; a monster that could not get one this step reuses last result | inside the 1.2 ms |
| **Path finding** | a **flow field** per room (a grid of arrows toward the player, on a coarse 4×4-cell nav grid) rebuilt at most every 0.5 s and only when the player moved ≥ 8 cells; shared by every walker/crawler in the room | ≤ 2 ms, spread over up to 4 steps |
| **Awake radius** | monsters farther than 1 screen (480 cells) horizontally or 300 vertically from the camera **sleep**: no think, no physics, pinned in place | — |
| **Active cap** | at most **40 thinking monsters**; beyond that, the farthest ones sleep. Swarm members (rats, fry, mites) count as 0.25 | — |

If a step's AI time goes over 1.2 ms, remaining buckets defer to the next step (a monster never skips more
than 2 thinks in a row; the perf spec in §28 checks it).

### 3.5 Movement types

| Type | Moves how | Path finding | Notes |
|---|---|---|---|
| `walker` | on its feet, gravity, can step up 3 cells, jumps gaps ≤ 24 cells and ledges ≤ 20 cells | room flow field | drowns if it cannot swim (§6) |
| `crawler` | clings to floor **and walls**; turns corners of solid cells; low profile | flow field + wall-following | falls if its surface is destroyed |
| `swimmer` | only inside water (cells, or the level of a height-field flood, 06 §8.9); leaves water by flopping (1 cell/s, takes 5% max HP/s) | steering inside the water body | water drained = stranded (big punish window) |
| `flyer` | ignores gravity; steering with 5 whisker rays against solids | steering (no grid) | rain pushes flyers down 4 cells/s outdoors |
| `burrower` | tunnels through diggable cells (`dirt`, `sand`, `silt`, `rubble`, `wax`, `brick` at half speed); cannot cross `stone` or `metal` | straight line with detours | leaves a tunnel of air cells behind it (terrain change!) |
| `ceiling` | hangs from the underside of solids; drops, then becomes a walker or climbs back up a wall | wall-following | drops when the player passes under it within ±8 cells |
| `rope_climber` | walks ropes, chains, tethers and bell-ropes as a graph; jumps rope to rope ≤ 30 cells | graph search over the room's rope list | can **cut** a rope segment the player is on (see entries) |

---

## 4. Group tactics, aggro and leash

### 4.1 Attack tokens (so crowds stay fair)

The player holds a pool of **melee tokens** and **ranged tokens**; the counts per difficulty are 02 §10.1's, and in
Act 1 the melee pool is 1 on every difficulty (§2.3). A monster must hold a token to start a wind-up; it gives the
token back when its recovery ends. A monster without a token **circles** at 40–70 cells (walkers pace, flyers
orbit, swimmers loop) and may still block, dodge and reposition. Token cost comes from the tier (§2.2). Fodder
swarms with cost 0 (rats, fry, mites) instead obey a swarm cap: at most **6 swarm members** may be in contact range
at once.

### 4.2 Roles

Each monster has a `role` that sets where it stands while waiting:

| Role | Stands | Special |
|---|---|---|
| `rusher` | closest; grabs melee tokens first | — |
| `flanker` | tries to get behind the player (other side from the nearest rusher) | +20% damage from behind |
| `ranged` | 120–200 cells, prefers higher ground, keeps line of sight | steps back 30 cells if the player closes to < 40 |
| `support` | behind the rushers | buffs, heals, rings bells; pack targets it last for tokens |
| `swarm` | flocks (separation 4 cells, cohesion toward pack centre, aim at player) | swarm cap |
| `ambusher` | hidden (ceiling, water, burrow, dark) until triggered | first hit +50% damage if player had not seen it |
| `hunter` | Unlit only: follows darkness, not rooms (§15) | ignores leash |

### 4.3 Pack alert

When one pack member enters `alert` it shouts (bark + sound); every member of the **same pack** within
120 cells enters `alert` toward the player. Different packs do not share alerts (a loud noise can still reach them
through hearing, §3.2).

### 4.4 Focus fire and cooperation rules

- Ranged monsters do not shoot through allies; they side-step 16 cells to clear a line.
- Support monsters pick the ally with the lowest HP% for heals; buffs go on the ally holding a melee token.
- Swarms **retreat as one** for 1.5 s when 50% of the swarm dies inside 2 s ("scatter"), then return.
- Monsters never deliberately stand in a void zone they made; they will stand in the player's (they are
  not immune unless the entry says so). This makes luring enemies into your own rune/linger zones a strategy.

### 4.5 Aggro and leash

- **Aggro target** is the player (single-player game). The Tinker's turret (04) draws aggro by **threat**: each point
  of damage dealt = 1 threat; a monster swaps target when another source has 130% of the current target's threat
  inside its sight. Player threat ×1.5 if the player is the closest thing.
- **Leash**: each monster has an **anchor** (its spawn point). If it is more than 320 cells from its anchor,
  or it has followed the player out of its room, it enters `return`. Exceptions: the Unlit (never leash),
  flyers (leash 480), bosses and minibosses (cannot leave their arena; the arena doors shut).
- **Room transitions**: normal monsters do not follow through a room exit. The Unlit and anything with
  `mod_relentless` (§17) do, by **06 §19.5's transition rule**: they arrive at the entry 1.5 s after the player,
  with a sound cue (R86).
- **Reset**: a monster that returns heals fully over time; a boss that resets (player died) heals at once
  and resets its phase.

---

## 5. How status effects change behaviour

Statuses (ids, stacks, durations, damage, every number) are **03 §4's** (R20). This table lists only what each one
does to the **AI** — its behaviour, not its numbers. Canon ids: `burn`, `chill`, `frozen`, `numbed`, `thawing`,
`shocked`, `corrode`, `radiant`, `soaked`, `drained`, `dazzled`, `dimmed` (player only), `staggered`, `knocked_out`.

| Status | AI reaction |
|---|---|
| `burn` | tagged `fears_fire` → `flee` toward the nearest water within 120 cells (it jumps in, which puts the fire out and may drown non-swimmers); every other burning monster enters `panic` (§6.2). Wax and tallow monsters (tag `wax`) instead get a **melting frenzy**: +15% speed and they lose 10% HP/s. Burning monsters light their surroundings (light radius 20, amber) |
| `chill` | the AI stretches its own wind-ups and recoveries by the slow 03 gives; a monster at the freeze threshold stops choosing new attacks |
| `frozen` | no think at all; a swimmer frozen in water is **locked** in the ice until it breaks (the ice cell rule, 06) |
| `numbed` | bosses and minibosses get this instead of `frozen` (03): they keep thinking but pick only their slowest attack |
| `thawing` | none (the AI ignores it) |
| `shocked` | interrupts a wind-up if the monster is not `armoured`; sight −30% for the status's length |
| `corrode` | an `armoured` monster whose armour reaches 0 loses its **poise bonus** and any front guard, and can be staggered by normal hits |
| `radiant` | the monster is drawn lit through darkness; an Unlit hit by Gleam also gets `dazzled` |
| `dazzled` | Unlit: `flee` into the nearest `dark` cell and cannot attack for the status's length. Others are not affected |
| `soaked` | the monster avoids stepping into spark-lit water; `fears_fire` monsters stop fleeing (they are safe). Flyers soaked by Tide drop 30 cells |
| `drained` | the monster's own glow goes out (not its eyes); support monsters cannot buff while drained |
| `staggered` | enters `stagger` for its tier's stagger time (§5.1); drops its token |
| `knocked_out` | `subduable` monsters (the Knell) at 1 HP from a non-lethal heavy (04): they lie down for the room and count as knocked out, not killed (§16.1) |

Tag **`steadfast`** (03 §4 halves status durations on it): every boss, every miniboss, and elites with
`mod_ironhide`.

### 5.1 Poise and stagger

Every monster has **poise** (a stagger meter). Each hit adds `poiseDamage` (pole hits and the `heavy` charm
deal most, 03/04). When the meter fills, the monster staggers; the meter empties after 3 s without a hit.

| Tier | Poise | Stagger time | Stagger immunity after |
|---|---|---|---|
| fodder | 10 | 600 ms | 0 |
| standard | 30 | 700 ms | 1 s |
| heavy | 80 | 900 ms | 3 s |
| elite | ×1.5 base | same | +1 s |
| miniboss | 250 | 1.2 s ("break": all attacks cancelled) | 12 s |
| boss | 400 (phase 1) → 600 (final phase) | 1.5 s "break" and takes +25% damage during it | 20 s |

---

## 6. Physics rules every monster obeys

These are defaults; entries list exceptions. The material rules themselves live in 06 (36 materials, `data/materials.json`).

| Situation | Default rule |
|---|---|
| **The player's body** | monsters never block the player; only attacks marked `contact` deal contact damage (04 §2 owns the player side, R83) |
| **Other monsters** | **soft separation**: two monster bodies that overlap push apart at up to 40 cells/s (swarm members 20); nothing ever gets stuck inside another body |
| **Water** (non-swimmer, head under water) | holds breath 4 s, then takes 8% max HP/s (drowning). Walkers sink at 30 cells/s and walk the bottom at 40% speed. Tag `floats` (wax, fat, oil, bloated things) rise to the surface instead and bob there helpless (−80% speed) |
| **Fire cells** | touching `fire` applies `burn`; `flammable` monsters take ×1.5 ember and spread fire to cells they touch |
| **Falling cells** (collapsing `stone`, `sand`, `rubble`, `ice`, `wax`) | each falling solid cell that lands on a monster deals `physical` damage = 1 per cell × fall speed/100, capped per step at 25% max HP; ≥ 40 cells in one step also staggers. Swarm and fodder are simply **crushed** (killed) by ≥ 20 cells. A crush counts as a trap/world kill (§6.2) |
| **Knockback into walls** | a knockback that stops against a solid cell at > 120 cells/s deals 5% max HP `physical` and staggers fodder/standard |
| **Falling** | fall damage above 60 cells of fall: 1% max HP per 4 cells above 60 (flyers, ceiling, crawlers immune). The player's fall rule is 07's |
| **Oil** | `oil` floats on water; a monster that walks through oil is **oil-coated** for 8 s (a body flag, not a status): ember hits on it deal +50% and it becomes a fire source when it burns |
| **Steam** | `steam` cells hurt and blind by 06's rule; monsters inside lose 50% sight |
| **Ice** | walkers on `ice` slide: acceleration ×0.3, stopping distance ×3 |
| **Electrified water** | anything touching water charged by spark takes the spark hit (03 combo `electrified`). `spark_immune_wet` monsters (eels) are not hurt |
| **Diggable terrain** | burrowers and `digs` monsters remove cells (turn them to air or `rubble`). Every removed cell is a real change in the world and may drop the ceiling above |
| **Gravity bands** (Act 5, 06 §10.7) | bodies inside a flipped band fall the other way; walkers that land on a ceiling keep walking upside down. Flyers ignore it. Hanging `ceiling` monsters **fall up** out of a reversed band (a free kill if the space is open) |
| **Light** | every monster has `glow` (its light radius and colour, 0 for many) and `eyes` (always drawn lit, 1–2 cells, colour listed). The eyes do not light the world, they just read in the dark |

### 6.1 Corpses

A corpse is the monster's body as a physics body (06's fragment bodies) that stays 20 s. It floats (fat, wax) or
sinks (armoured). It counts as solid for 1 s after death so a pole-knocked corpse can crush a fodder monster.
Wax-bodied corpses (tag `wax`) **turn into `wax` cells** where they lie — permanent terrain for the room's visit
(diggable, flammable; raw cells reset on re-entry, 00 §13). Act 1 plays with this. A **burning** corpse sets
flammable cells it falls on alight (B12).

### 6.2 Traps, lures and burning panic (R51, B5, B12)

**Traps hurt monsters.** Every trap in 07 §8 hits anything in it, monsters included, with the damage 07 lists (the
Tinker's Hijack node, 04, can fire one on purpose). A monster killed by a trap, a crush, a fall, drowning,
electrified water or any other part of the world is a **trap kill**: +50% XP (04 §17.2) and the Ledger source
"The Hollow" (10). Rooms tagged `trap` (2–3 per act from Act 2, 07) place their monsters on or near the trap's path.

**The lure rule (B5).** Any monster within **120 cells** of a **thrown light** (a lit crate, a lantern post, a
`bp_lantern_post`, a lingering fire, an ember lob burning on the ground) or a **loud noise** (§3.2: explosions,
bells, a cell collapse) enters `lured` and paths toward it for **4 s**, then searches there. Rules:

- Only monsters in `idle`, `patrol` or `search` are lured, plus `curious` monsters in any state and monsters in
  `attack` that hold no token (§3.2).
- A monster lured to a point it cannot reach waits at the nearest reachable cell.
- **The Unlit are pushed, not pulled, by light**: a thrown light makes them path away from it; a loud noise lures
  them like anyone else.
- Moths (`lampeater`) already go to the brightest light (§12.2); for them a thrown light is a lure of 8 s.
- Bosses and minibosses are never lured.

**Burning panic (B12).** A monster with `burn` that is not `fears_fire` (those flee to water, §5) and not wax
(melting frenzy, §5) enters `panic`: it runs away from the player at full speed along its flow field, does not
attack, and every monster whose body it touches gets **1 `burn` stack per second** of contact (03's stack rules).
Panic ends when the burn ends. Heavies and above never panic. A burning corpse ignites what it falls on (§6.1).

---

## 7. Spawning rules

### 7.1 Placement

Rooms are authored (10 §6 room format, as built); fight nodes may use room kits (09, 10). **Enemies are placed at
room load** (R86): every regular monster exists, asleep or idle, before the player can see it. Sources:

1. **Placed spawns** in the room file (10 §6 owns the field shape): enemy id, position, pack letter, optional
   patrol points.
2. **Spawn points with a budget**: resolved **at room load** from the act's spawn table (§7.3) until the budget is
   spent. Costs: fodder 1, standard 2, heavy 4, swarm of 6 = 3.
3. **Hatches** (rat holes, eel grates, moth nests): a destructible object that releases 1 group every N seconds
   while the player is within 200 cells, until destroyed (HP listed on the object in 07). Max 3 living groups per
   hatch. **A hatch plays its 500 ms warning sound before each release.**
4. **Ambushes**: a scripted group that appears on a trigger (a plate, a door, a darkness spawn of the Unlit §15.3).
   Every ambush plays a **500 ms sound** before the first body appears.
5. **Scripted waves** (boss arenas, Floodgate): 09 owns the wave lists.

Only 3 and 4 spawn after room load. Placed monsters that were killed stay dead for the save (00 §13; a Rekindle
does not bring them back).

### 7.2 Hard rules

- A later spawn (hatch, ambush) never appears inside the camera view or within 64 cells of the player, and always
  after its 500 ms sound.
- Never spawn inside a relit Great Lamp's radius (the whole district after the Lamp is relit halves all spawn
  budgets and removes Unlit darkness spawns there).
- Never spawn inside solid cells, deep water (for non-swimmers), or a void zone.
- Lesson rooms, hubs (sanctuaries) and Rekindle posts never spawn anything.
- A room's total spawn budget: Act 1: 6–12, Act 2: 10–16, Act 3: 12–18, Act 4: 12–20, Act 5: 14–22,
  Act 6: 16–24. Arena rooms may exceed it with waves.

### 7.3 Spawn tables per act (weights)

Re-weighted to the 30 ship monsters (R7). `(×6)` = a swarm group of that size.

| Act | Table id | Entries (id: weight) |
|---|---|---|
| 1 | `sp_act1` | wax_mite 35, soot_pigeon 25, dripling 25, tallow_hound 15 |
| 2 | `sp_act2` | gutter_rat (×6) 30, rat_chorister 12, rope_scuttler 15, fatberg 8, wax_mite 5, tallow_hound 5, knell_novice 17, knell_hookman 8 |
| 3 | `sp_act3` | maw_fry (×6) 25, sluice_eel 18, sluice_crab 18, drowned_lockkeeper 10, gutter_rat (×6) 7, knell_novice 10, knell_hookman 5, knell_lampbreaker 7 |
| 4 | `sp_act4` | oilback 20, lampeater 20, sluice_eel 10, gutter_rat (×6) 8, knell_novice 12, knell_hookman 10, knell_lampbreaker 20 (+ the Unlit by §15.3) |
| 5 | `sp_act5` | clapperling 25, tumbler 15, echo_bat 18, bronze_sentinel 7, rope_scuttler 5, knell_novice 8, knell_hookman 7, knell_lampbreaker 7, knell_maulbearer 8 |
| 6 | `sp_act6` | stormgull 20, rainwraith 18, rootgnarl 15, hailstone_golem 7, echo_bat 8, lampeater 7, oilback 5, sluice_crab 5, knell_lampbreaker 8, knell_maulbearer 7 |
| any (Act 4+) | `sp_unlit` | unlit_creeper 40, unlit_hound (×3) 30, unlit_stalker 15, unlit_wickthief 15 |

### 7.4 Elite rolls

Each spawn **group** (not each monster) rolls the difficulty's elite chance (02 §10.1). On a hit, the group's
highest-tier member becomes an **elite** with 1 modifier (a **champion** = 2 modifiers where 02's table says so, and
in the Long Descent, §17). Act 1 never rolls elites before `a1_n04`. Swarm members can never be elite; the swarm's
"leader" (the first spawned) can.

---

## 8. Telegraphs and void zones

The readable-danger pillar (00 §2.5) as rules the code enforces:

1. **Every attack that can deal ≥ 5% player max HP has a telegraph** with a lit part: a glow on the monster
   (eyes flare, a limb glows, a mouth lights; part rigs can glow per part, 06 §25) **and** for area attacks a
   ground/air marker drawn in the unlit overlay pass so it shows in total darkness (06 §16.8).
2. **Telegraph colours**: the attack's element colour (flame colours from 00 §8); physical attacks use
   **bone white `#e8e2d0`**; grabs use **red `#ff3b30`**; unblockable attacks add a 2-cell **red rim pulse**.
3. **Minimum telegraph**: 250 ms on any difficulty, after every multiplier (§2.4). Boss "big" attacks ≥ 700 ms on
   Lamplighter. Act 1 grace ×1.25 (§2.3).
4. **Every telegraph has a sound** (§26) that starts at wind-up; the sound pans with the source.
5. **Void zones** (patches that hurt while you stand in them) are drawn with a **lit rim** 1–2 cells wide in
   their rim colour, pulsing at 2 Hz, and a translucent fill. Each zone has a **warm-up** (rim only, no damage)
   of at least 500 ms before it does damage, and a fade (rim dims over the last 500 ms).
6. Void zone damage is **per second, applied in 4 ticks per second**, never on the entry frame.
7. Zones are data (field shape in 10 §5.11). Values per zone: shape (`circle`, `rect`, `column`, `pool`, `ring`,
   `band`), size, warm-up ms, duration ms, damage per second, element, rim colour, what it follows (`none`,
   `floor`, `water_surface`, `gravity`) and slow 0–1. `pool` zones follow the floor and fill low spots like a liquid
   (they are real liquid cells, e.g. `molten_wax`, tagged `void`); `band` zones span the arena horizontally.
8. **Grabs** (any attack drawn with the red grab colour that holds the player) end on their own after **1.5 s**; a
   dodge, an Ember hit on the grabber or a pole hit on it frees the player early. **No grab asks for button
   mashing** (R73).

---
## 9. Act 1 — Lanterncrown & the Wax Stair

The chandlers' quarter: vats, wax-caked stairs, pigeon lofts, candle shrines. Everything here is **wax,
tallow or soot**, so Ember is strong but also dangerous (`wax` burns and melts into `molten_wax` void pools). Act 1
is easy on purpose: long telegraphs (the Act 1 grace, §2.3), few ranged enemies, no swarms larger than 4, no elites
before `a1_n04`.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `wax_mite` | Wax Mite | 5×4 | 10 | 5 | 50 | crawler | fodder | swarm |
| `soot_pigeon` | Soot Pigeon | 6×5 | 12 | 6 | 110 air | flyer | fodder | rusher |
| `dripling` | Dripling | 7×12 | 30 | 10 | 40 | walker | standard | rusher |
| `tallow_hound` | Tallow Hound | 14×9 | 55 | 13 | 85 (lunge 220) | walker | standard | flanker |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `wax_mite` | -50 | 0 | 0 | 0 | 0 | 0 | 0 | flammable, floats, wax, curious |
| `soot_pigeon` | 0 | 0 | -25 | 0 | 0 | -25 | 0 | fears_fire, curious |
| `dripling` | `heal` for the first 3 s of a burn, then 0 (see entry) | -50 | 0 | 0 | 0 | -100 (doused = dies) | 0 | flammable, floats, wax |
| `tallow_hound` | -25 | 0 | 0 | 0 | 0 | 0 | 0 | flammable, floats, smell, fears_fire, curious |

### 9.1 Wax Mite (`wax_mite`) — Acts 1–2 (Long Descent all)
- **AI:** `idle` in groups of 3–5 on wax surfaces → `alert` on sight 80 / hearing → `attack`: crawl straight at
  the player along floor/walls, bite on contact. Never flees.
- **Attacks:** *Nip* — `contact` bite, telegraph: mandibles glow amber, 250 ms; 5 dmg; reach 2 cells.
- **Physics:** floats; burns up instantly (ember kills it and the burning mite spreads fire to the `wax` it sits
  on — the classic "don't burn the floor you are standing on" lesson). Crushed by 20 falling cells.
- **Drops:** `lt_act1` (fodder); 0–1 pennies.
- **Look:** a 5×4 beetle of pale cream wax (`#d8cfae`, shadow `#8c8266`) with a black wick-stub on its back;
  eyes 1 cell **amber** `#ffb347`. No glow.
- **Voice:** none (skitter sfx `lf.enemy.skitter`).

### 9.2 Soot Pigeon (`soot_pigeon`) — Act 1 (Long Descent all)
- **AI:** `idle` perched on ledges in flocks of 2–4 → `alert` on sight 140 or any cast within 90 → `attack`:
  circles above at 50–80 cells, then dives → after the dive climbs back up (3 s) → dives again. `flee` at 30%
  HP back to its perch; `fears_fire` (burning → flees in a straight line and trails `smoke`).
- **Attacks:** *Dive* — telegraph: pigeon stops in the air, flares its wings, a bone-white streak line is drawn
  from it to the player's position, **500 ms**; flies the line at 220 cells/s; 6 dmg + knockback 80; misses
  hit the ground and stun it 800 ms (punish).
- **Physics:** rain pushes it down; `soaked` → falls to the floor for 1.5 s and hops (free hits).
- **Drops:** `lt_act1` (fodder); 1 penny.
- **Look:** charcoal-grey bird (`#2c2f36`, highlight `#4b5260`), soot puff trail 1 cell; eyes 1 cell **orange** `#ff7a2a`.
- **Voice:** `babble` (bird coo preset, pitch 0.8), plays on `alert`.

### 9.3 Dripling (`dripling`) — Act 1 (Long Descent all)
- **AI:** `idle` standing in candle-shrines like a candle (the flame on its head is lit) → `alert` on sight 120 →
  `attack`: shuffles at the player, uses *Drip Lash* at range ≤ 18, *Candle Toss* at 40–100 → `flee` never.
  Special: while **burning** it is in melting frenzy (§5) and loses 10% HP/s; ember hits **heal** it only for
  the first 3 s of burning (it "drinks the flame"), then burn damage applies normally. Teach: douse it (Tide,
  the Sluicewarden's dry Tide, or a bucket) or chill it (Rime).
- **Attacks:**
  - *Drip Lash* — head flame flares tall, **400 ms**; swings a wax arm; 10 dmg; reach 18.
  - *Candle Toss* — flame swells yellow-white and its arm glows, **600 ms**; lobs a wax glob (lob arc, 150
    cells/s); 8 dmg on hit; lands as a 6-cell **`molten_wax`** puddle (void zone `vz_molten_wax_small`: pool 6×2,
    warm-up 500 ms, 3 s, 6 dps ember, rim amber `#ff8a2a`, then hardens to `wax`).
- **Physics:** floats; any water on its head flame kills it at once (flame goes out → collapses into a
  wax heap). Its corpse turns into a 7×6 `wax` mound (climbable, burnable).
- **Drops:** `lt_act1` (standard); 1–3 pennies.
- **Look:** a candle that grew legs — ivory body with drips (`#e9e0c4`, drips `#c9bd95`), black wick, a
  4-cell flame on top that lights radius 24 **amber**; eyes are two holes that glow **amber** in the wax.
- **Voice:** `babble` (hissing, pitch 0.6), on `alert` and death (a "fsss").

### 9.4 Tallow Hound (`tallow_hound`) — Acts 1–2 (Long Descent all)
- **AI:** packs of 2–3. `patrol` → `alert` on sight 160, hearing, or **smell** (§3.2) → `attack`: circles at
  60 cells (flanker), picks a side behind the player, uses *Lunge*; after a lunge it retreats 40 cells →
  `flee` at 25% HP toward the nearest water (it is `fears_fire` when burning).
- **Attacks:**
  - *Lunge* — crouches, back wax cracks and glows amber, **550 ms**; leaps 70 cells at 220 cells/s; 13 dmg +
    knockback 100. Misses slide 20 cells (punish 600 ms).
  - *Snap* — at ≤ 12 cells, jaw glows bone white **300 ms**; 9 dmg.
- **Physics:** floats; flammable; ember sets it burning and it runs for water (you can see the packs panic).
- **Drops:** `lt_act1` (standard); 2–4 pennies.
- **Look:** a lean dog shape of greyish tallow (`#b9ab88`, dark `#6f644c`), exposed wick-spine along the back,
  drips from the jaw; eyes 2 cells **orange-red** `#ff5a1f`.
- **Voice:** Narrator `beast_snarl` log line on first sight (01's pool); growl sfx `lf.enemy.growl`.

---

## 10. Act 2 — The Gutterways

Sewers, drains, rope-hung service tunnels, rat shrines. **Swarms** arrive (rats), **ropes** matter (rope
scuttlers cut them), **traps become weapons** (the Lockhouse lesson `a2_n03`, §6.2) and the first Knell appear.
**After the Gutter Lamp is relit**, rats avoid `lit` cells (their flow field treats `lit` as costing ×8, like the
Unlit) — the relit district is visibly cleaner.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `gutter_rat` | Gutter Rat | 6×4 | 9 | 5 | 80 | crawler | fodder | swarm |
| `rat_chorister` | Rat Chorister | 7×10 | 40 | 8 | 45 | walker | standard | support |
| `rope_scuttler` | Rope Scuttler | 8×6 | 30 | 9 | 70 on ropes | rope_climber | standard | flanker |
| `fatberg` | Fatberg | 22×14 | 220 | 22 | 18 | crawler | heavy | rusher |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `gutter_rat` | 0 | 0 | 0 | +50 | 0 | 0 | 0 | swims, smell, fears_fire, curious |
| `rat_chorister` | 0 | 0 | -25 | +50 | -25 | 0 | 0 | smell |
| `rope_scuttler` | -25 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `fatberg` | -75 (explodes, see entry) | +25 | 0 | -25 | 0 | 0 | 0 | flammable, floats, slow |

### 10.1 Gutter Rat (`gutter_rat`) — Acts 2–4 (Long Descent all)
- **AI:** always a swarm of 4–8 from a rat hole hatch or placed. `idle` scurrying in circles → `alert` sight 100,
  hearing, **smell** → `attack`: swarm flocking at the player, bite on contact → **scatter** (§4.4) → return.
  `fears_fire`: a burning rat runs to water and may carry fire into `oil` (a nice accident).
- **Attacks:** *Bite* — `contact`, teeth glint bone white **250 ms**; 5 dmg.
- **Physics:** swims (40 cells/s on the surface); crushed by 20 falling cells; electrified water kills them in
  one tick (spark in a flooded sewer is the swarm answer).
- **Drops:** `lt_act2` (fodder) at 50% rate (swarms would flood you otherwise); 0–1 pennies.
- **Look:** 6×4, wet brown-grey (`#4a4038`, belly `#6e6154`), pink tail 3 cells `#b07a7a`; eyes 1 cell **red** `#ff3b30`.
- **Voice:** `babble` (squeak preset); the swarm plays one shared squeal on `alert` (not per rat).

### 10.2 Rat Chorister (`rat_chorister`) — Act 2 (Long Descent all)
- **AI:** a man-sized rat in a torn choir robe. `idle` among rat swarms → `alert` → `attack` (support): stays
  behind its swarm at 60–100 cells and *Sings*; if no rats are alive it *Summons*; if the player closes to
  < 30 it swings its censer and backs off → `flee` at 30% HP toward a rat hole (and gets +20 HP if it reaches it).
- **Attacks / abilities:**
  - *Hymn of Teeth* — mouth glows **sickly yellow** `#e8d24a`, its robe lights with notes, **1000 ms**
    (interruptible by any hit ≥ 8 dmg or spark); all rats within 120 cells get +30% speed and +30% damage for
    6 s (their eyes turn yellow). Cooldown 10 s.
  - *Summon the Pews* — chants 1500 ms (interruptible) after a 500 ms squeal from the hatch; 4 rats come out of
    the nearest hatch. Cooldown 15 s.
  - *Censer Swing* — censer glows bone white **450 ms**; 8 dmg + knockback; leaves a 12-cell `smoke` puff
    (blocks sight).
- **Physics:** normal; steps out of electrified water.
- **Drops:** `lt_act2` (standard); 3–6 pennies.
- **Look:** 7×10 hunched rat in a grey-white robe (`#9a9489`), censer brass `#b08a3c` with a tiny amber
  glow (radius 8); eyes 2 cells **yellow** `#e8d24a`.
- **Voice:** `babble` squeak-chant; the hymn is a babble-sung melody (babble engine, syllables mode).

### 10.3 Rope Scuttler (`rope_scuttler`) — Acts 2, 5 (Long Descent all)
- **AI:** rope_climber (spider-legged rat). `patrol` along the room's ropes → `alert` on sight 140 or when
  the player grabs a rope in its graph → `attack`: races along ropes toward the player; if the player is on a
  rope, goes for **Cut** first; if the player is on the ground, drops on them from above → `flee` at 30% up the
  highest rope.
- **Attacks:**
  - *Cut* — reaches a rope segment within 40 cells of the player's hold, its forelegs glow **red** (grab colour)
    and the rope segment it will cut **flashes red** for **900 ms**, then cuts it (the rope falls, you drop
    unless you re-grapple). 0 dmg; the lesson is re-grappling.
  - *Pounce* — body flares bone white **450 ms**; drops from its rope onto the player; 9 dmg.
- **Physics:** ember on a rope it stands on burns the `rope` (and it falls: 30 dmg to itself from the fall on
  most drops). Tether shape ropes (03) are ropes too — it will cut yours.
- **Drops:** `lt_act2` (standard); 2–4 pennies.
- **Look:** 8×6 rat with 8 thin legs, grey fur `#5b5249`, legs black; eyes 4 small cells **red** in a row.
- **Voice:** `babble` (chitter).

### 10.4 Fatberg (`fatberg`) — Act 2 (Long Descent all)
- **AI:** a crawling mass of congealed gutter fat. `patrol` very slowly along sewer floors → `alert` 90 →
  `attack`: rolls at the player, absorbs rats it touches (+20 HP each) → never flees, never panics.
- **Attacks:**
  - *Engulf* — body bulges and glows **red** (grab) **800 ms**; rolls 30 cells forward; on hit: 22 dmg and the
    player is held inside for **1.5 s** at most (§8 rule 8: a dodge, an Ember hit or a pole hit frees you early; no
    mashing, R73).
  - *Grease Slick* — passive: leaves a 2-cell trail of `oil` cells (slippery, and **flammable**).
- **Physics / the trick:** ember makes it **explode** after a 1.5 s fuse (it swells, cracks glow amber,
  `lf.enemy.fuse` sizzles): 40 ember damage in a 36-cell radius to **everything**, including other monsters
  and the player, and sets its oil trail on fire. Floats; in water it becomes an island you can stand on.
- **Drops:** `lt_act2` (heavy); 6–12 pennies.
- **Look:** 22×14 lumpy grey-yellow blob (`#a39c7a`, `#6d6752`), bits of debris (a boot, bottles) in it; eyes
  3 tiny **green** dots `#8dff4a` scattered on it.
- **Voice:** none; gurgle sfx.

---

## 11. Act 3 — The Sluice Ward

Locks, canals, reservoirs, pump houses. **Water is terrain**: sluice gates flood and drain rooms (07), and big
bodies are height-field water (06 §8.9) — swimmers follow the level. Many monsters are swimmers that are deadly
while the room is flooded and helpless when it drains. Spark in water is strong but hits you too.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `maw_fry` | Maw Fry | 6×3 | 12 | 6 | 120 swim | swimmer | fodder | swarm |
| `sluice_eel` | Sluice Eel | 18×4 | 60 | 14 | 110 swim | swimmer | standard | ambusher |
| `sluice_crab` | Sluice Crab | 14×8 | 110 | 18 | 55 | walker (+ swims slowly) | standard | rusher |
| `drowned_lockkeeper` | Drowned Lockkeeper | 8×14 | 170 | 22 | 45 / 60 swim | walker (swims) | heavy | support |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `maw_fry` | 0 | -50 | -50 | 0 | 0 | +50 | 0 | swimmer, stranded out of water, curious |
| `sluice_eel` | +50 in water | -25 | +100 while wet (`spark_immune_wet`) | 0 | 0 | +50 | 0 | swimmer, charges water |
| `sluice_crab` | 0 | 0 | -50 | -50 | 0 | +50 | 0 | armoured front (4), weak back |
| `drowned_lockkeeper` | 0 | 0 | -25 | 0 | -25 | +50 | +25 | armoured (2), breathes water |

### 11.1 Maw Fry (`maw_fry`) — Act 3 (Long Descent all)
- **AI:** the Sluicemaw's young, schools of 6–10. `idle` circling in water → player enters water or stands
  within 20 cells of the edge → `attack`: school darts at the player, nips, darts away → out of water: flop
  helplessly (stranded, −5% HP/s).
- **Attacks:** *Nip* — `contact`, body flashes silver-white **250 ms**; 6 dmg; *Leap* — at the surface edge,
  400 ms, jumps out at a player standing within 20 cells of the water, 6 dmg, then is stranded.
- **Physics:** draining the room strands the whole school (free kills); freezing water (rime) locks them.
- **Drops:** `lt_act3` (fodder) at 50% rate.
- **Look:** 6×3 silver-green fish (`#9fb7a8`) with oversized jaws; eyes 1 cell **pale green** `#baffc9`.
- **Voice:** none.

### 11.2 Sluice Eel (`sluice_eel`) — Acts 3–4 (Long Descent all)
- **AI:** hides in grates/pipes (ambusher). `idle` in a pipe mouth, only its eye lit → player in its water body
  → `attack`: *Coil Strike*; every 8 s **charges the water** → `flee` into its pipe at 30% HP (heals 5%/s there).
- **Attacks:**
  - *Coil Strike* — body lights up in pale yellow stripes **500 ms**; lunges 50 cells; 14 dmg.
  - *Charge the Water* — its stripes pulse brighter and brighter, **1200 ms**, and the water body's surface
    gets a **flickering white-yellow rim** (void zone `vz_charged_water`: the connected water body's surface up to
    600 cells area, warm-up 1200 ms (the telegraph itself), 2 s, 18 dps spark, rim `#fff27a`). Get out of the water.
- **Physics:** immune to spark while wet (it *is* the battery); when its water is drained it is `stranded`
  and loses spark immunity (spark −50 while stranded).
- **Drops:** `lt_act3` (standard); 3–6 pennies.
- **Look:** 18×4 black eel `#141c22` with 6 pale-yellow stripes that glow `#fff27a` when charging; eyes 1 cell **white**.
- **Voice:** none; electric hum sfx rising during the charge.

### 11.3 Sluice Crab (`sluice_crab`) — Acts 3, 6
- **AI:** walks sideways (of course). `patrol` → `alert` 100 → `attack`: keeps its armoured front toward the
  player, *Pincer*, *Bury*; if flipped it is helpless → `flee` never.
- **Attacks:**
  - *Pincer* — the big claw glows bone white **500 ms**; 18 dmg, reach 16.
  - *Bury* — in `sand`/`silt` only: 800 ms digging (sand fountains), it hides under 4 cells of sand; next attack
    is *Burst Up* (the sand above it trembles and glows amber 600 ms; 16 dmg).
- **Physics / weak points:** its front (armour 40, "armoured front (4)") blocks all damage from the front below 10
  per hit; the back takes ×1.5. A **knockback from below** (a Tide wave under it, a lob exploding beneath it, a
  trap, a falling crate) **flips it**: 4 s on its back, takes ×2 damage. Bile corrodes the shell (§1 Armour).
- **Drops:** `lt_act3` (standard); 15% `scrap`; 3–7 pennies.
- **Look:** 14×8 rust-orange crab (`#a3502a`) with a barnacled sluice-plate for a shell (grey `#5d6468`);
  eyes on stalks, 2 cells **orange**.
- **Voice:** none; click sfx.

### 11.4 Drowned Lockkeeper (`drowned_lockkeeper`) — Act 3
- **AI:** a dead keeper who still works the locks. Every lockkeeper is linked in the room data to 1–2 sluice
  levers (07). `patrol` between its levers → `alert` sight 140 → `attack`: if the player is in a dry area where
  flooding would favour its eels, it runs to a lever and **floods** the room; if the player is swimming, it
  **drains** it to strand them near its crabs (the AI picks whichever the room data marks as "bad for the
  player") → melee otherwise → `flee` never; while it is working a lever it is *committed* (punishable).
- **Attacks:**
  - *Pull the Lever* — walks to the lever, both hands glow **deep blue** `#3f7bff`, the lever flashes and a
    horn sounds (`lf.world.sluice_horn`), **1500 ms**; the room floods or drains (07 timing). Kill it or stagger
    it during the pull to cancel. Cooldown 20 s.
  - *Hook Swipe* — lock-hook glows bone white **550 ms**; 22 dmg, reach 22, pulls the player 16 cells.
  - *Lamp Toss* (only if the player is in water) — **700 ms**; throws a dead lamp (lob) 16 dmg.
- **Physics:** breathes water; sinks; walks the bottom at full speed.
- **Drops:** `lt_act3` (heavy); 100% `key_lockhouse` if the room marks it as the lock-holder (a door inside the
  room, 07; 08 §12.2); 8–14 pennies.
- **Look:** 8×14 bloated figure in a keeper's oilskin (`#39443e`), brass keys at its belt catching light,
  hook-pole; eyes 2 cells **blue-white** `#9fc4ff`; a hanging lamp with a dead wick.
- **Voice:** Lingo `enemy_opener` tag `undead` (bubble gargle fx); voice role per 01.

---

## 12. Act 4 — Blackwater

Flooded black-oil quarters, drowned chapels, moth nests. **Darkness and the oil economy** arrive (03, 06 §14.7):
in the `dark` ambient tier your lantern burns oil and oil regen stops, and most monsters here either **eat light**
or **use oil**. The Unlit (§15) hunt here in earnest.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `oilback` | Oilback | 10×5 | 50 | 12 | 45 / 70 swim | crawler (floats) | standard | ambusher |
| `lampeater` | Lamp-Eater Moth | 9×7 | 45 | 10 | 90 air | flyer | standard | flanker |

(The four Unlit counted in Act 4's roster by 00 §10 are in §15.)

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `oilback` | -100 (see entry) | 0 | 0 | 0 | 0 | +25 | 0 | floats, oil |
| `lampeater` | -50 | 0 | 0 | 0 | -50 | 0 | +50 | flammable, drawn to light |

### 12.1 Oilback (`oilback`) — Acts 4, 6
- **AI:** a beetle whose back is a sac of black lamp-oil. `idle` floating on water like a slick → `alert` 90 →
  `attack`: *Oil Spray*, then retreats → `flee` at 40% HP by diving (it can hold its breath forever).
- **Attacks:**
  - *Oil Spray* — its sac swells and its spout glows **dull amber** `#b56a1a` **600 ms**; sprays a 40-cell cone
    of real **`oil` cells**: 12 `physical` dmg; oil that lands on the player burns if an Ember lights it (06's
    oil rules).
  - It is also a walking trap: designers place it near torches; it swims into fire and ignites its own slick
    (no attack, no telegraph — the fire is the telegraph).
- **Physics:** killing it with ember makes it **burst into burning oil** (a 30-cell pool of `oil`, lit): great
  if it sits on water near enemies, terrible if you are standing in its spray. Killing it without fire leaves
  a pool of **unlit oil**.
- **Drops:** `lt_act4` (standard); 100% `lamp_oil` ×1; 3–6 pennies.
- **Look:** 10×5 beetle, shiny black-brown (`#1a120c`) with a rainbow oil sheen (shader sheen), spout brass;
  eyes 2 cells **amber**.
- **Voice:** none.

### 12.2 Lamp-Eater Moth (`lampeater`) — Acts 4, 6
- **AI:** flies to the **brightest light within 200 cells** (a thrown light holds it 8 s, §6.2), and it **eats**
  it. `idle` circling a light → `attack`: lands on your lantern pole and *Drinks* → `flee` when hit by Gleam.
- **Attacks:**
  - *Drink the Light* — it lands on the lantern (wings glow **red** at the edges **500 ms** before it lands). It
    does **not** hold the player: while attached it drains **4 oil/s** and your light radius shrinks 40%. Shake it
    off with a pole swing, any Gleam wick or a dodge. It detaches after 5 s fat and slow (half speed, 2 s).
  - *Dust Burst* — wings flare **400 ms**; a 30-cell puff of dust: −30% light radius for 4 s.
- **Physics:** burns; drawn to lingering fire (bait). A moth that drank ≥ 10 oil **glows** (radius 20) and
  bursts into an oil fire when killed with ember.
- **Drops:** `lt_act4` (standard); 3–5 pennies; drinks refunded as a small `lamp_oil` (half of what it drank).
- **Look:** 9×7 grey-black moth (`#2a2730`), furry, eye-spots on its wings **dead** until it has fed (then
  glow the colour of the light it ate); eyes 2 cells **pale violet** `#d7b8ff`.
- **Voice:** `babble` whisper (volume 0.35); when it drinks, a slurp sfx.

---

## 13. Act 5 — The Bellwell

A vertical shaft of bell towers and belfries on chains. **Gravity bands** flip local gravity (06 §10.7, 07), and
**bells shake terrain loose**. Many monsters here make sound: hearing (§3.2) and the lure rule (§6.2) matter.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `clapperling` | Clapperling | 6×6 | 45 | 14 | 70 | walker | fodder | rusher |
| `tumbler` | Tumbler | 8×8 | 70 | 18 | 80 air | flyer | standard | flanker |
| `echo_bat` | Echo Bat | 7×5 | 40 | 12 | 130 air | flyer | fodder | ranged |
| `bronze_sentinel` | Bronze Sentinel | 14×22 | 480 | 40 | 35 | walker | heavy | rusher |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `clapperling` | +25 | 0 | -50 | -50 | 0 | 0 | 0 | armoured (2), metal, construct, curious |
| `tumbler` | 0 | 0 | 0 | 0 | 0 | 0 | -25 | gravity-bound |
| `echo_bat` | 0 | 0 | -25 | 0 | -50 | -25 | 0 | — |
| `bronze_sentinel` | +50 | +25 | -50 | -50 | 0 | +25 | 0 | armoured (6), metal, construct |

### 13.1 Clapperling (`clapperling`) — Act 5 (Long Descent all)
- **AI:** a small walking bell with a clapper for a leg. Groups of 2–4. `idle` swaying (each sway makes a
  small ding: noise 60) → `alert` 110 → `attack`: hops at you and *Clangs* → on death it **rings** (noise 400: a
  loud noise that lures and alerts the area, §6.2).
- **Attacks:**
  - *Clang* — the bell mouth glows bone white **400 ms**; hops and rams; 14 dmg + stagger 300 ms.
  - *Toll Burst* — only if 3+ clapperlings are within 40 cells: all ring together, the air ripples with a
    **pale bronze** ring `#d9a95a` **700 ms**; 50-cell shockwave, 10 dmg, and **loosens cells**: any cracked
    terrain (06's `cracked` flag) within 50 cells falls.
- **Physics:** metal (spark -50, conducts). Stuffing its mouth — a Rime hit, or a lob that lands `molten_wax` in
  it — **mutes** it (cannot Toll Burst or death-ring).
- **Drops:** `lt_act5` (fodder); 20% `scrap`; 1–3 pennies.
- **Look:** 6×6 dull bronze bell (`#8a6a34`, highlight `#c99a50`) with one iron leg; eyes 2 cells **bronze-gold**
  `#ffc86b` peeking from inside the mouth.
- **Voice:** none (dings are its voice).

### 13.2 Tumbler (`tumbler`) — Act 5 (Long Descent all)
- **AI:** a hollow bronze sphere-thing with its own tiny gravity lantern inside. `patrol` in the air → `alert`
  140 → `attack`: *Local Flip* around the player, then rams → `flee` never.
- **Attacks:**
  - *Local Flip* — its core glows **cyan-violet** `#8a7bff` and a 40×40 box snapped to 8-cell rows is drawn around
    the player in the same colour **900 ms**; gravity in that box inverts for 3 s (a temporary `gravity_band`, 06
    §10.7: the player falls up). The box is lit and visible. Cooldown 10 s.
  - *Ram* — spins up, body glows bone white **500 ms**; 18 dmg.
- **Physics:** stays where its own gravity puts it (flyer).
- **Drops:** `lt_act5` (standard); 30% `scrap`; 3–6 pennies.
- **Look:** 8×8 perforated bronze ball, violet light leaking from the holes (radius 14, `#8a7bff`); eyes are two
  holes glowing brighter violet.
- **Voice:** none; humming sfx that pitch-shifts when it flips gravity.

### 13.3 Echo Bat (`echo_bat`) — Acts 5–6
- **AI:** hangs in belfries. `idle` → noise ≥ 60 within 200 → `attack`: circles at 100–160 cells, *Ping*s the
  player to **mark** them, then the flock dives. They **hear**, they do not see: sight range 0.
- **Attacks:**
  - *Ping* — its ears glow **pale white-blue** `#cfe8ff` **400 ms**; a visible sound ring travels to the player.
    On hit, every monster within 300 cells knows where the player is for 4 s (an AI effect owned here, not a
    status; shown as a pale ring on the player).
  - *Dive Bite* — **450 ms** bone white wing flare; 12 dmg.
- **Physics:** hates bells: any bell ringing within 150 cells **stuns** it 2 s and it falls.
- **Drops:** `lt_act5` (fodder); 1–2 pennies.
- **Look:** 7×5 bat, membrane wings dusky rose `#5a3a44`, huge ears; eyes 1 cell **white**.
- **Voice:** `babble` (very high chirp) on each Ping.

### 13.4 Bronze Sentinel (`bronze_sentinel`) — Act 5
- **AI:** a temple guardian automaton with a gong for a shield. `idle` guarding a door or bell → `alert` 150 →
  `attack`: always faces the player with the gong (front blocks all spells < 40 dmg, and the gong **reflects**
  `bolt` shapes back), *Gong Bash*, *Resonance* → never flees.
- **Attacks:**
  - *Gong Bash* — lifts the gong, rim glows bone white **700 ms**; 40 dmg, knockback 160.
  - *Resonance* — strikes its own gong: the gong glows **pale bronze** and a ring grows on the floor **1000 ms**;
    60-cell shockwave (18 dmg), **loosens cracked terrain** like a bell, and **flips any gravity lantern** in
    range. Cooldown 12 s.
  - *Stomp* — if the player is behind it: foot glows **600 ms**; 26 dmg in 20 cells.
- **Physics:** metal (spark -50; electrified water stuns it 2 s); bile corrodes the gong (after 6 corrode stacks'
  worth of hits the gong **cracks** and stops reflecting); it is too heavy for gravity flips (it stays down). A
  gravity band that puts it on a ceiling makes it **fall** 60+ cells when it flips back: 150 `physical`
  self-damage (a trap kill if it dies, §6.2).
- **Drops:** `lt_act5` (heavy); 50% `scrap` ×2; 16–24 pennies.
- **Look:** 14×22 green-patinated bronze (`#4f7a67`, highlights `#9cc9a8`), the gong a disc of brighter bronze;
  eyes a visor slit glowing **bronze-gold**.
- **Voice:** none; grinding gears sfx.

---

## 14. Act 6 — The Cloudroot

The climb up the root of bound cloud. **The Rain stops** mid-act (`cs_rain_stops`, after the Storm's Eye `a6_n06`,
00 §12): every held body of water falls. Monsters here are made of **weather**: rain, cloud, hail, lightning. They
change in the rooms after the Rain stops (`a6_n07`–`a6_n09`), listed as **After the Rain**.

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|
| `stormgull` | Stormgull | 10×6 | 90 | 24 | 150 air | flyer | fodder | rusher |
| `rainwraith` | Rainwraith | 8×14 | 170 | 28 | 70 air | flyer | standard | flanker |
| `rootgnarl` | Rootgnarl | 12×10 | 240 | 32 | 50 | ceiling / walker | standard | ambusher |
| `hailstone_golem` | Hailstone Golem | 18×24 | 720 | 55 | 30 | walker | heavy | rusher |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `stormgull` | 0 | 0 | `heal` in rain, +100 after the Rain | 0 | 0 | -25 | 0 | — |
| `rainwraith` | -50 (steam, see entry) | -50 (see entry) | 0 | +75 | 0 | `heal` | 0 | made of water |
| `rootgnarl` | -50 | +25 | 0 | -25 | 0 | 0 | 0 | flammable, digs |
| `hailstone_golem` | -75 (After the Rain: -100) | +100 | 0 | 0 | 0 | 0 | +25 | armoured (5), ice |

### 14.1 Stormgull (`stormgull`) — Act 6
- **AI:** flocks of 2–3 riding the updraft. `patrol` wheeling → `alert` 200 → `attack`: *Lightning Dive*, then
  climbs → `flee` never.
- **Attacks:** *Lightning Dive* — the gull **charges**: its wing edges glow white-yellow `#fff27a` and a dashed
  line to the player is drawn **600 ms**; dives at 260 cells/s; 24 spark dmg; if it hits water it charges the
  water (a small `vz_charged_water`, 1 s). Misses stun it 700 ms.
- **Physics:** it drinks lightning: spark **heals** it while it rains. **After the Rain:** no storm to ride:
  speed −30%, spark only immune, no more charge on water.
- **Drops:** `lt_act6` (fodder); 2–4 pennies.
- **Look:** 10×6 white-grey gull (`#d7dde3`) with black wing tips, crackle of light on the wing edges; eyes 1
  cell **yellow**.
- **Voice:** `babble` (gull cry preset).

### 14.2 Rainwraith (`rainwraith`) — Act 6
- **AI:** a shape of falling rain with a face. `idle` drifting in the rain → `alert` 160 → `attack`: *Downpour*,
  *Rain Lash*; it can **pass through** 1–4-cell-thick walls by raining through them (it turns into falling
  water cells for 600 ms) → `flee` never.
- **Attacks:**
  - *Rain Lash* — arms turn into streams, glow **deep blue** **500 ms**; 28 dmg, reach 24, knockback.
  - *Downpour* — it rises above the player, the rain below it turns **bright blue** in a 20-wide column **900 ms**;
    void zone `vz_downpour`: column 20×(to the floor), warm-up 900 ms, 3 s, 16 dps tide, rim `#3f7bff`; the column
    floods the floor below with real water.
- **Physics / trick:** ember turns its body to **steam** (it becomes a `steam` cloud for 2 s: immune, but the
  steam hurts anything else near it); **Rime freezes it** into an 8×14 `ice` statue (a solid you can stand on; it
  shatters in 3 s or on any ≥ 40 hit with ×3 damage). Tide heals it. **After the Rain:** it can no longer reform:
  its HP −40%, it cannot pass through walls.
- **Drops:** `lt_act6` (standard); 5–9 pennies.
- **Look:** 8×14 translucent streaks of blue-grey rain (a particle-drawn body, `#8fb0c9`) around a pale face;
  eyes 2 cells **cold white-blue** `#cfe8ff`.
- **Voice:** `babble` whisper + reverb fx.

### 14.3 Rootgnarl (`rootgnarl`) — Act 6
- **AI:** a knot of Cloudroot wood that crawls on the root's underside. `idle` as part of the root (looks like
  bark, eyes shut — **the eyes are lit but narrow slits**) → player within 50 → `attack`: drops, *Root Spear*,
  then burrows into the root wood → surfaces elsewhere.
- **Attacks:**
  - *Root Spear* — the wood under the player's feet cracks and glows **pale green** `#9adf8a` in a 6-cell
    circle **700 ms**; a spike erupts 24 cells tall; 32 dmg. The spike stays 6 s as terrain.
  - *Bark Shard Burst* — body glows **600 ms**; 5 shards in a fan, 12 dmg each.
- **Physics:** digs through root wood (`wood` and `cloudstuff` cells); flammable (ember -50; a burning gnarl sets
  the root wood around it on fire, which the Rain puts out while it rains — **After the Rain**, fires on the
  Cloudroot spread).
- **Drops:** `lt_act6` (standard); 20% `scrap`; 5–10 pennies.
- **Look:** 12×10 gnarled grey-white wood (`#bfc4c0`, shadow `#6e7470`) veined with faint cloud-light; eyes
  2 cells **pale green**.
- **Voice:** none; creak sfx.

### 14.4 Hailstone Golem (`hailstone_golem`) — Act 6
- **AI:** a lump of packed hail and ice. `idle` → `alert` 120 → `attack`: *Hail Fist*, *Frost Stamp* → at 30%
  it cracks and gets faster → never flees.
- **Attacks:**
  - *Hail Fist* — arm glows cyan `#6fe3ff` **800 ms**; 55 dmg; applies 2 `chill` stacks.
  - *Frost Stamp* — lifts a foot, a cyan ring glows on the floor **1100 ms**; stamp: 30 dmg in 40 cells and
    **freezes water** within 60 cells. A player standing in that water is held in the ice for 1.5 s at most (§8
    rule 8: dodge, Ember or pole hit frees early; no mashing).
  - *Shed Hail* (passive when hit by ember) — melts off 4 hail chunks that roll (8 dmg each).
- **Physics:** made of `ice` cells: ember melts it and it **turns into water** as it melts (it floods the
  floor under it); immune to rime. Crushing it with falling rock works (ice is brittle: falling-cell damage ×2).
  **After the Rain:** melting is faster (ember -100).
- **Drops:** `lt_act6` (heavy); 20–30 pennies.
- **Look:** 18×24 blocky pale-blue ice (`#b7d6e6`, facets `#e8f6ff`), stones and a shield frozen inside; eyes
  2 cells **cyan**, a faint cyan glow (radius 18).
- **Voice:** none; cracking-ice sfx.

---
## 15. The Unlit

The things that came up out of the dark water. They are not tied to one act: they appear wherever the
**light is low**, starting properly in Act 4 (a single scripted Creeper appears in Act 3's last room, the Spillway
`a3_n07`, as a warning). They are the enemy that makes the oil economy (03, 06 §14.7) matter.

### 15.1 Rules that make the Unlit different

Every light reading below is a **tier** from 06 §14.7's CPU light grid (`dark` < 0.2, `dim` 0.2–0.5, `lit` ≥ 0.5,
`bright` ≥ 0.8), R46.

1. **Reverse sight.** An Unlit sees the player at its full sight range only when the player's **`lightTier`** is
   `dark`; otherwise it sees the player only within **24 cells**. So a lit lantern is a shield — until the oil runs
   out.
2. **Light hurts them.** Every Unlit takes its `lightBurn` damage per second while it stands in a `lit` (or
   `bright`) cell. Gleam hits apply `dazzled` (03 §4: it flees to the dark) on top of the damage.
3. **They hunt across rooms.** No leash; they follow the player through room exits by 06 §19.5's transition rule
   (the `hunter` role). Their flow field treats `lit` cells as costing **×8**, so they route through the dark when
   they can.
4. **Their eyes are the only thing you see.** Their bodies are drawn in the darkness colour with a
   1-cell rim of `#10131a`; the eyes are always lit (pale, no colour: `#e6ecff`), and their attack telegraphs
   use **negative light**: the area around the attacker gets darker (a visible hole in the ambient light) plus a
   pale rim — readable in total darkness because the rim is drawn in the unlit overlay pass.
5. **They dissolve in bright light.** An Unlit standing in `bright` light for **3 s** dissolves (counts as a kill).
6. **They cannot enter a relit district's Great Lamp radius** and never spawn there.
7. **Thrown lights push them away**; loud noises lure them (§6.2).

### 15.2 Roster

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role | lightBurn/s |
|---|---|---|---|---|---|---|---|---|---|
| `unlit_creeper` | Creeper | 10×5 | 90 | 18 | 70 (dark) / 20 (lit) | crawler | standard | hunter | 15 |
| `unlit_hound` | Gloamhound | 12×8 | 70 | 16 | 120 | walker | fodder | hunter (pack of 3) | 20 |
| `unlit_stalker` | Stalker | 8×18 | 200 | 34 | 90 (only when unseen) | walker | heavy | hunter | 10 |
| `unlit_wickthief` | Wick-Thief | 6×10 | 60 | 0 (steals) | 150 | walker | standard | flanker | 30 |

| id | ember | rime | spark | bile | gleam | tide | shade | tags |
|---|---|---|---|---|---|---|---|---|
| `unlit_creeper` | -25 | 0 | 0 | 0 | -100 | 0 | `heal` | smell, unlit |
| `unlit_hound` | -25 | 0 | 0 | 0 | -100 | 0 | `heal` | smell, curious, unlit |
| `unlit_stalker` | 0 | 0 | 0 | 0 | -75 | 0 | +100 | unlit |
| `unlit_wickthief` | 0 | 0 | 0 | 0 | -100 | 0 | +50 | unlit |

(`unlit` is the tag `js/rpg/damage.js` reads for Gleam's ×2 against them, 03 §4 `radiant`.) All Unlit drop from
`lt_unlit` (08 §14) plus the listed extras.

### 15.3 Darkness spawning

Every 2 s the director checks the player's surroundings:

```
darkness   = fraction of light-grid tiles within 120 cells of the player whose tier is `dark`
lanternOut = player's oil == 0 or lantern hooded
if act >= 4 and darkness > 0.6 and unlitAlive < cap:
    pressure += (darkness - 0.6) * 10 * (lanternOut ? 3 : 1)      // per check
if pressure >= 10: spawn one group from sp_unlit at a dark spot 140–220 cells away, out of view; pressure = 0
```

Cap: 2 groups alive (`lamplighter`), 1 (`wicklit`), 3 (`lampless`). A darkness spawn is an **ambush** (§7.1): it is
heralded by a **distant low whisper** (`lf.unlit.whisper`, panned toward the spawn) that starts 1 s (never less than
500 ms) before the bodies arrive — the sound is the telegraph. Relit districts never spawn them; nor do hubs,
Rekindle posts or `sanctuary` zones (07).

### 15.4 Entries

**Creeper (`unlit_creeper`)** — Acts 4–6 (Long Descent all)
- **AI:** `idle` in dark corners → player in `dark` within 200 (or smell) → `attack`: crawls on walls and
  ceilings to get above the player, drops → in `lit` cells it slows to 20 and turns back toward darkness (`flee`).
- **Attacks:** *Drop Bite* — a pale ring and a darker hole open on the ceiling above the player **500 ms**;
  drops, 18 dmg + 1 `chill` stack. *Drag* — a pull, not a hold (red rim + dark hole **600 ms**): pulls the player
  30 cells toward darkness.
- **Physics:** normal crawler; burns in oil fire (and the fire's light hurts it twice).
- **Drops:** `lt_unlit`.
- **Look:** a flat, many-legged shadow; body `#07080b`, rim `#10131a`; eyes 2 cells pale white.
- **Voice:** `babble` whisper (reversed syllables, volume 0.4).

**Gloamhound (`unlit_hound`)** — Acts 4–6
- **AI:** packs of 3; `smell`; circle the edge of your light radius (they stay exactly 4 cells outside it — the
  player sees their eyes pacing the rim of the lantern light: the Act 4 signature image) → the moment the
  light radius shrinks or flickers, they lunge in.
- **Attacks:** *Rim Lunge* — dark hole + pale rim at its feet **450 ms**, lunges 60 cells, 16 dmg.
- **Physics:** fears fire (runs from burning cells).
- **Drops:** `lt_unlit`.
- **Look:** lean dog shape of darkness, eyes 2 cells pale, a faint pale drool line.
- **Voice:** growl sfx pitched down; Narrator `beast_snarl` log line on first meeting.

**Stalker (`unlit_stalker`)** — Acts 4–6
- **AI:** tall and thin. It only moves while it is **not in the player's facing direction or not lit**: if the player
  faces it and it stands in the lantern's `lit` area, it freezes (`idle`, takes no `physical` damage but does take
  Gleam). Otherwise it closes at 90 cells/s → *Reap* → vanishes into darkness (moves to a `dark` cell 100 cells away,
  with the negative-light rim showing where) after each hit.
- **Attacks:** *Reap* — its arms rise with a pale rim and a dark hole **700 ms**; a 30-cell arc, 34 dmg, and your
  lantern **flickers** (−50% radius for 2 s).
- **Physics:** cannot swim (walks along the bottom); falling cells crush it normally.
- **Drops:** `lt_unlit`.
- **Look:** 8×18, stick-thin shadow with a long head; eyes 2 cells pale, set very high.
- **Voice:** none — **it is silent**; its only sound is the dark-hole telegraph hum `lf.unlit.hole`.

**Wick-Thief (`unlit_wickthief`)** — Acts 4–6
- **AI:** small and fast. `alert` → `attack`: dashes in from darkness, *Snatches*, then **flees** into darkness
  with what it took → if killed within 8 s it drops the stolen thing. If it escapes (reaches 400 cells), it is
  gone with it.
- **Attacks:** *Snatch* — red rim + dark hole on the player **400 ms**; a touch, not a hold; steals **20 oil**, or
  if the player carries any, one `lamp_oil` from the belt. No damage. It never takes a Guild flask charge.
- **Physics:** Gleam kills it almost at once (weak2 + 30 lightBurn).
- **Drops:** `lt_unlit` + what it stole.
- **Look:** 6×10 child-sized shadow; carries a stolen light (it glows the colour of your wick for 8 s — so you
  can chase it in the dark: the one Unlit that is easy to see).
- **Voice:** `babble` giggle, pitch high.

---

## 16. The Knell (bell-cult humans)

The **Knell** believe the Rain is a mercy and the last bell of Vessmere will toll the city into the dark
water for good. They appear from Act 2, grow common in Acts 4–5, and are **people**: they talk, flee, and
sometimes surrender. Deacon Marl (`npc_marl`, 01) is the one Knell who deals with you.

### 16.1 Rules that make the Knell different

1. **They talk.** Every Knell barks through Lingo (§25): openers, taunts, hurt, flee, kill lines, with the
   `cultist` and `knell` tags; bark limits are 01's.
2. **Surrender.** A Knell Novice or Lampbreaker below 25% HP with no Knell ally within 150 cells has a 40%
   chance to **surrender** (kneels, drops its bell, `combat_flee` bark). Surrenders can happen from Act 2.
   - **Sparing** it (walking away out of its room, or pressing `interact` to "let it go") or **knocking it out**
     (all four Knell are `subduable`: a non-lethal heavy, 04, leaves them `knocked_out`) adds **1 toward the
     Kindling flag `knell_spared`** (10 in all sets it; 01 owns the flag; R2).
   - Attacking a surrendered Knell kills it and counts nothing.
3. **They use the world.** They pull levers, ring bells, douse lamps and cut ropes on purpose.

### 16.2 Roster

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role | Acts |
|---|---|---|---|---|---|---|---|---|---|
| `knell_novice` | Knell Novice | 6×12 | 40 | 9 | 60 | walker | fodder | rusher | 2–5 |
| `knell_hookman` | Knell Hookman | 6×12 | 70 | 12 | 65 (ropes 90) | rope_climber / walker | standard | flanker | 2–5 |
| `knell_lampbreaker` | Lampbreaker | 6×12 | 60 | 10 | 75 | walker | standard | support | 3–6 |
| `knell_maulbearer` | Maulbearer | 9×14 | 220 | 30 | 45 | walker | heavy | rusher | 5–6 |

HP/Dmg above are at the Knell base level 7 (§2.3) and scale by area level.

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `knell_novice` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | human, subduable |
| `knell_hookman` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | human, subduable |
| `knell_lampbreaker` | +25 | 0 | 0 | 0 | 0 | +50 | 0 | human, oilskin, subduable |
| `knell_maulbearer` | 0 | +25 | -25 | -25 | 0 | 0 | 0 | human, armoured (4, bronze), subduable |

All Knell drop from `lt_knell` (08 §14; the Maulbearer rolls it twice).

### 16.3 Entries

**Knell Novice (`knell_novice`)**
- **AI:** groups of 2–4 with a hand-bell each. `patrol` → `alert` 140 (rings its hand-bell: noise 120) → `attack`
  rusher → `flee` at 25% if alone (surrender rule).
- **Attacks:** *Bell Swing* — hand-bell glows bone white **400 ms**, 9 dmg. *Knife Lunge* — **550 ms**, 30-cell
  dash, 12 dmg.
- **Physics:** human: drowns, burns (panics, §6.2), crushed normally.
- **Look:** 6×12, grey sackcloth robe (`#57524a`), a bronze hand-bell, face half-covered by a wet cloth; eyes 2
  cells **bronze** (they paint their eyelids with bell-bronze dust that glows faintly — a cult mark).
- **Voice:** Lingo `enemy_opener`/`combat_taunt`/`combat_hurt`/`combat_flee`, tags `cultist`,`knell`; voice role
  per 01, seeded per spawn.

**Knell Hookman (`knell_hookman`)**
- **AI:** carries a grapple of its own. On rope maps it acts as a rope_climber; else a walker. `attack`: pulls the
  player **off ledges** and **cuts ropes** like a Rope Scuttler.
- **Attacks:** *Gaff Pull* — its hook glows **red** **600 ms**; a line 100 cells long: on hit pulls the player 50
  cells toward it (over edges, into water) — a pull, not a hold. *Cut Line* — as `rope_scuttler` Cut (900 ms red
  rope flash).
- **Look:** oilskin coat, rope coils, hooked gaff; eyes bronze.
- **Voice:** as Novice.

**Lampbreaker (`knell_lampbreaker`)**
- **AI:** the saboteur. Its target is **lights**, not you: it runs to placed lamps, lit torches, lamp-posts' side
  lamps and lanterns you placed (`bp_lantern_post`) in the room, and **douses** them with a bucket of black water.
  It avoids fighting (keeps 100 cells). `flee` at 50% (then the surrender rule). It never touches a Rekindle post
  or a Great Lamp.
- **Attacks:** *Douse* — bucket glows deep blue **700 ms**; a splash of water cells (20 cells wide) that puts
  out fires and lamps; if it hits the player: 10 dmg, `soaked` (03), and your lantern loses 10 oil. *Oil Pot*
  (Act 4+) — **800 ms**: throws a pot of `oil` (lob; an 8×2 unlit oil patch — the Knell's answer to your fire).
- **Physics:** oilskin: tide +50. It carries 30 cells of water in its bucket: kill it with Ember and the bucket
  boils into `steam` (a steam burst).
- **Look:** heavy oilskin (`#2f3a33`), leather bucket; eyes bronze.
- **Voice:** as Novice; its douse line uses 01's Knell pool.

**Maulbearer (`knell_maulbearer`)**
- **AI:** heavy rusher in bell-bronze plate. Walks through small wood/plank structures (breaks `bp_plank`,
  `bp_brace` and `bp_crate` you built, 07).
- **Attacks:** *Tolling Maul* — maul head glows bone white **850 ms**; 30 dmg in 26×12 in front, knockdown;
  loosens cracked cells in 30. *Charge* — **700 ms** stamping, runs 80 cells, 22 dmg, breaks planks in the way.
- **Physics:** armoured bronze: bile melts the plate (§1 Armour); sinks in water fast (it drowns in 4 s + the
  normal rate: shove it into deep water — a trap kill, §6.2).
- **Look:** 9×14, bell-shaped helm, patinated plate (`#5c6e5a`); eyes bronze through the helm slit.
- **Voice:** Lingo tags `cultist`,`knell`,`knight`; voice role per 01 (`brute`).

---

## 17. Elite and champion modifiers

An **elite** has 1 modifier, a **champion** 2 (where 02 §10.1's difficulty table says so, and in the Long
Descent, §2.5). Elites get +60% HP, +25% damage, tier's poise ×1.5, and a lit **name plate** built by Name Forge
(`namegen/`, the "person" pattern for the Knell, the "beast epithet" pattern for monsters: e.g. *Grisk the
Tallow-Hearted*). Every modifier has a visible **aura colour** (a 1-cell outline around the monster plus drifting
motes in that colour) and its own icon on the name plate. Modifiers never break the telegraph rules. The 8 ship
modifiers (00 §10):

| id | Name | Aura | Effect | Not allowed on |
|---|---|---|---|---|
| `mod_wickfed` | Wickfed | amber | its attacks leave 6-cell burning patches (void zone `vz_elite_fire`: pool 6×2, warm-up 500, 3 s, 5% max HP/s ember, rim `#ff8a2a`); immune to `burn` | wax monsters (they would melt) |
| `mod_rimebound` | Rimebound | cyan | hits add 1 `chill` stack; on death freezes water in 60 cells | swimmers |
| `mod_stormcalled` | Stormcalled | yellow | every 6 s: a 14-cell lightning circle at the player (telegraph 1000 ms, 20% of its hit dmg); electrifies water | — |
| `mod_blighted` | Blighted | green | leaves a trail of bile pools (void zone `vz_bile_trail`: pool 4×1 of `bile` cells, warm-up 500, 4 s, 3% max HP/s bile, rim `#8dff4a`) that apply `corrode` | flyers |
| `mod_ironhide` | Ironhide | bone white | +3 armour steps (+30 armour), cannot be staggered by hits < 20 poise, knockback immune, `steadfast` | fodder |
| `mod_swift` | Swift | pale | +35% move and attack speed (telegraphs not shortened below 250 ms) | heavy |
| `mod_splitting` | Splitting | red | on death splits into 2 copies at 30% HP without modifiers (once) | swarm, heavy |
| `mod_relentless` | Relentless | dark red | never leashes, follows through room exits (06 §19.5's rule, §4.5), +20% speed when out of sight | placed ambushers |

Rules: a champion never combines `mod_swift` + `mod_stormcalled` (too punishing). An elite adds 1 roll of its
act's table at tier `elite` to its pack's drops (08 §14).

---

## 18. Minibosses

Three minibosses ship (00 §10), each in a fixed `elite`-type node of its act map (09): the Sewer-King at `a2_n07`
the Crank Room, the Drowned Lockmaster at `a3_n06` the Three-Lock House, the Lamp-Eater Matriarch at `a4_n07` the
Wick Loft. Minibosses use one phase change at 50% HP, have one void zone each, and a soft enrage at 4 minutes
(+25% damage, then +25% every 30 s). They drop from `lt_miniboss` (08 §14): the Sewer-King pennies and a rare
chest, the other two their relic (08 §7) and pennies. No miniboss drops a key (no 09 edge needs one). Speech is
Narrator lines or line ids in 01 §6.5 (§25). Their arenas use the `lock` camzone (the arena held still
on screen), and they follow the shared grab rule (§8 rule 8).

### 18.1 The Sewer-King (`mb_sewer_king`) — Act 2, the Crank Room (`a2_n07`)
- **What:** a rat the size of a cart (36×20) wearing a crown made from a grate crank. **HP 2100.** Walker + swims.
- **Arena:** 240×120 sewer junction, a central grate over flowing sludge (`mud` over `water`), 4 rat holes
  (hatches, HP 80 each), ropes across the ceiling. The room is tagged `trap`.
- **Attacks:**
  - *Crown Charge* — scrapes its feet, crown glows bone white **900 ms**; charges across the arena, 28 dmg,
    breaks planks.
  - *Summon Court* — squeals **1200 ms** (all 4 rat holes glow red, and each plays the hatch sound): each living
    hole releases 3 rats. Destroying holes stops this.
  - *Sludge Heave* — **1000 ms**, the grate glows sickly green: sludge wave 60 wide; leaves `vz_sludge`.
  - *Rope Drop* (≤ 50%) — it climbs onto the ceiling ropes (rope_climber) and drops on the player: red rim on the
    landing spot, **700 ms**; 24 dmg.
- **Void zone:** `vz_sludge` — pool 40×3 on the floor, warm-up 700 ms, 8 s, 8 dps bile, slows 30%, rim green `#8dff4a`.
- **The grate drop — taught as a trap kill.** The grate is a lever-worked trap prefab (07). Pulling the lever while
  it stands on the grate drops it into the sludge channel: it takes 10% of its max HP as a **trap hit** (Ledger
  source "The Hollow", §6.2) and is stuck 5 s (+50% damage taken). Rats on the grate when it drops die as trap kills.
  The lever resets in 20 s. The first time, the Narrator reads the first-trap-kill line (01). This is the Act 2
  follow-up to the Lockhouse lesson (`a2_n03`).
- **Tricks:** Ember on its fat-slick fur makes it burn and panic to the sludge (bosses and minibosses do not use
  §6.2's panic; this is its own scripted 3 s run).
- **Drops:** `lt_miniboss` — pennies and one `lt_chest_rare` roll (08 §14).
- **Lines:** Narrator `named_beast` pool (01); its squeals are babble.
- **Look:** mangy grey-brown, crown rusted iron, eyes 3 cells red.

### 18.2 The Drowned Lockmaster (`mb_lockmaster`) — Act 3, the Three-Lock House (`a3_n06`)
- **What:** the drowned head of the lockkeepers, 10×16, with a long lock-hook. **HP 3000.** Walker, swims.
- **Arena:** a 3-level lock chamber (3 basins stacked like steps, each with a gate and a lever; 07's sluice rules;
  each basin a height-field body, 06 §8.9).
- **Attacks:** *Hook Pull* — hook glows bone white **600 ms**; 22 dmg, pulls the player 16 cells. *Open the Gates* —
  **1500 ms** (all three levers glow blue, horn sounds): water rushes down one basin level (a real flood).
  *Lamp Sink* — **800 ms**, throws a heavy lamp that sinks and, if it lands lit, electrifies the basin
  (`vz_charged_water`, 2 s).
- **Void zone:** charged basins (`vz_charged_water`, as the Sluice Eel's).
- **Tricks:** you can pull the levers too: stranding him in a drained basin makes him flop (6 s, ×1.5 damage).
  Rime freezes a basin surface (he cannot rise through it).
- **Phase at 50%:** calls 4 Sluice Eels into the basins (an ambush with its 500 ms sound).
- **Drops:** `lt_miniboss` — `relic_mb_act3` (Floodgate Seal, 08 §7) and pennies.
- **Lines:** line ids `bl_lockmaster_open`, `bl_lockmaster_p2` (to be added to 01 §6.5; v1 draft text in Parked).
- **Look:** keeper's oilskin, lock keys like a skirt, eyes blue-white.

### 18.3 The Lamp-Eater Matriarch (`mb_lampeater_mother`) — Act 4, the Wick Loft (`a4_n07`)
- **What:** a huge moth (40×30) that has eaten a whole district's lamps; its wings glow with stolen colours.
  **HP 3800.** Flyer.
- **Arena:** 260×160 attic loft in total darkness (the floor 0.08 still shows terrain), 6 unlit Guild lamps on posts
  (lightable with any flame).
- **Attacks:**
  - *Drink the Room* — flies to a lit lamp, wings glow with that lamp's colour **1000 ms**, eats it (the lamp
    goes out) and heals 5% HP.
  - *Wing Gale* — wings flare **800 ms**; a 100-cell wide gust pushes the player 60 cells and cuts light radius
    50% for 3 s.
  - *Scale Fall* (≤ 50%) — **900 ms**, her body sheds glowing scales: 10 scale motes drift down; each landing
    makes `vz_moth_scale`.
- **Void zone:** `vz_moth_scale` — circle r 6, warm-up 600, 5 s, 10 dps shade, drains 2 oil/s, rim violet.
- **Tricks:** she always goes for the brightest lamp: lighting 3 lamps at once draws her. A lamp lit with **Ember
  over spilled `oil`** under it becomes a trap that burns her (×2 damage, 3 s fall to the floor; a trap hit, §6.2).
- **Drops:** `lt_miniboss` — `relic_mb_act4` (Lamp-Eater's Lung, 08 §7) and pennies.
- **Lines:** babble (high whisper) + Narrator.
- **Look:** dusty wings with 6 eye-spots each glowing a different flame colour; eyes violet.

---

## Boss rules shared by all six

- **Arena lock:** entering the arena shuts the door behind (a portcullis of the act's material). The door
  reopens on victory or on the player's death. Bosses never leave the arena.
- **Health bar:** a full-width bar with the boss name and **phase notches** (02 §11.8). Minibosses get a smaller bar.
- **Attack budget:** **≤ 7 distinct attacks per boss** (Mother Tallow **5** in the campaign, +2 in her Lampless /
  Boss Rush third phase), **Ossery ≤ 9**. An attack that returns in a later phase with a changed count or speed is
  still one attack. Every boss keeps **≥ 1 void zone**. (Total ≈ 44 telegraphed boss attacks; the rest are parked.)
- **Phase transitions:** at each threshold the boss becomes **invulnerable** for the transition (1.5–4 s,
  listed per boss), all its void zones fade, and **the player gets 20% of max HP back** (00 §10). The player keeps
  control throughout. If the transition changes the arena, the camera **cuts** to wide view for the transition and
  cuts back when it ends (never a zoom; R72); wide-camzone arenas are already wide.
- **Grabs:** every boss grab follows §8 rule 8 (≤ 1.5 s, dodge / Ember / pole frees early, no mashing).
- **Act 1 grace:** Mother Tallow's wind-ups get the ×1.25 of §2.3 on every difficulty.
- **Poise break (§5.1):** 400 poise in phase 1, 500 in phase 2, 600 in phase 3+; a break is a 1.5 s stagger with
  +25% damage taken, then 20 s immunity.
- **Enrage:** a soft enrage timer per boss (listed). At the timer the boss gets +30% damage and +20% attack
  speed, then +10% damage every 30 s. 02 §10.1 says which difficulties skip enrage.
- **Reset:** if the player dies, the boss resets fully. Boss Rush (09) uses the same fights with a clock.
- **Speech:** line ids from 01 §6.5 (`bl_<boss>_open`, one per phase, `bl_<boss>_death`), with Lingo
  `boss_opener` / `boss_phase` repeats on retries. Voices are 01 §6.4's (R22).
- **Loot:** `lt_boss_actN` (08 §14): the act's Great Wick, the boss relic (none for Ossery), pennies, gear.
- **Music:** each boss has a **pulse layer in the score** (10), one step per phase; its telegraph sfx ids stay (§26).

### Camzones (R89)

The camera rule for each arena (06 §19 owns the camera; this table picks the mode). `lock` = the arena held still in
the normal 480 × 270 view; `wide` = 640 × 360 wide view, entered by a cut on arena entry.

| Boss | Node | Arena size (cells) | Camzone |
|---|---|---|---|
| Mother Tallow | `a1_n08` the Tallow Chapel | 320 × 180 | `lock` |
| Saint Gnaw | `a2_n08` the Gutter Cathedral | 360 × 220 | `lock` |
| The Sluicemaw | `a3_n08` the Great Reservoir | 440 × 240 | `wide` |
| The Lampless Widow | `a4_n08` the Moth Nave | 360 × 220 | `lock` |
| The Bellfather | `a5_n07` the Bellwell Bottom | 300 × 380 | `wide` + vertical follow |
| Ossery Vane | `a6_n06` the Storm's Eye / `a6_n09` the Dry Eye (arena `a6_storm_eye`) | 400 × 260 | `wide` |

Attack tables below list **telegraph visual**, **audio id** (§26), **wind-up in ms (Lamplighter, before the Act 1
grace)**, **damage (base, Lamplighter)**, and notes. Damage numbers are for the player reference in §2.1.

---
## 19. Boss 1 — Mother Tallow

| Field | Value |
|---|---|
| id | `boss_tallow` |
| Where | the Tallow Chapel, `a1_n08` (room 1 is the antechamber lamp-post and Seld's choice, 01) |
| Size | 56 × 88 cells at full HP (she **shrinks** as she melts, see Gimmick) |
| HP | **1,500** (Lamplighter, level 5) in the campaign on `wicklit` and `lamplighter`. The full three-phase version (`lampless` and Boss Rush) has **2,400** |
| Phases | **Campaign:** P1 100–50% "The Vigil", P2 50–0% "The Melting". **Full version:** P1 100–66%, P2 66–33%, P3 33–0% "The Guttering" |
| Move | walker (P1 stationary at the altar, P2 slow walk 20 cells/s, P3 crawl 35 cells/s) |
| Resist | ember `heal` for the first 2 s of any burn, then -25; rime -25; spark 0; bile 0; gleam 0; tide -50 (only the Sluicewarden's dry Tide reaches her in Act 1); shade 0 |
| Attacks | 5 in the campaign (Tallow Palm, Drip Volley, Wick Lash, Hymn of Wax, Wax Tide) + 2 in P3 (Flare, Gutter Rush) |
| Camzone | `lock` |
| Enrage | 6:00 |
| Voice / lines | 01 §6.4 (voice) and 01 §6.5's boss lines (`bl_tallow_*`) |
| Kindling | finishing her with Rime or Tide (after asking Seld) sets `tallow_cooled` (01) |

### 19.1 Gimmick: she melts

Mother Tallow is a giant candle-woman whose head is a wick-flame (light radius 90, amber, the arena's main
light). **Her body is made of real `wax` cells** (06 §25 Tallow's wax body). Every 5% of HP she loses, 2 rows of
cells at her base melt and flow away as **`molten_wax`** that runs downhill and **hardens into `wax`** after 6 s.
So the arena floor changes all fight: molten wax is a void zone while it is liquid, and hardened wax is new
terrain (ledges, ramps, walls). By the end she is about half her height and the chapel floor is lumpy with the
ledges she made.

- **Ember** makes her melt **faster** (each ember hit melts 1 extra row) and so creates more pools: more
  danger, more terrain. It deals damage normally after the first 2 s of each burn (she "drinks" the first bit).
- **Rime** hardens molten wax **instantly** where it hits (turns a void pool into safe floor) and chills her.
- **Spark** on her chandelier chains (P3 only) is the fast route (see P3).
- **Gleam** heals the player normally; no special effect on her.

### 19.2 Arena

```
 x→ 0                                                                                 320
 y  ┌──────────────────────────────────────────────────────────────────────────────────┐
 0  │   ~~ rain through broken roof ~~        ~~ rain ~~                  ~~ rain ~~    │
    │        [C]                 chandelier chain (C) x3 — P3 only                [C]    │
 40 │                                   ▲ (her flame, radius 90)                       │
    │   ┌────┐                        ┌───────┐                          ┌────┐        │
 70 │   │ledge│  wooden gallery 60w  │ ALTAR │     wooden gallery 60w   │ledge│        │
    │   └────┘═══════════════        │ TALLOW│        ═══════════════   └────┘        │
110 │                               └───────┘                                          │
    │  pews  pews  pews            (altar dais 80w)              pews  pews  pews     │
150 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│  stone floor
    │  ╲drain╱ (sluice grate, wax runs here)                        ╲drain╱             │
180 └──────────────────────────────────────────────────────────────────────────────────┘
      door (entry, shuts)
```
- Floor `stone` at y 150; floor slopes 2 cells toward the drains at x 20 and x 300 (molten wax flows there).
- Two `wood` galleries (y 70, 60 cells wide each) reachable by pews → ledges; **they burn** if ember hits them.
- Pews are `wood` (flammable) 20×8 blocks.
- Three chandelier chains hang from the roof (used in P3 only; in the campaign they stay out of reach as decor).
- Rain drips through the roof in 3 columns: rain cools molten wax (any wax under a rain column hardens in 2 s
  instead of 6).

### 19.3 Phase 1 — "The Vigil" (campaign 100–50%; full version 100–66%)

She stays at the altar, facing the player, towering. Attack loop: pick by weight every 2.2 s.

| Attack | Telegraph (visual) | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Tallow Palm** | her raised hand glows amber from inside, a 30×10 amber rectangle lights on the floor where it will land | `lf.boss.tallow.palm` | 1000 ms | 30 | slam; leaves 2 molten pools either side (`vz_tallow_pool`) |
| **Drip Volley** | her shoulders drip; 5 amber dots appear on the floor where drops will land | `lf.boss.tallow.drip` | 900 ms | 12 per drop | drops land in order 150 ms apart; each makes a `vz_tallow_pool` |
| **Wick Lash** | her head flame stretches sideways, an amber streak line drawn at head height across 120 cells | `lf.boss.tallow.lash` | 800 ms | 22 + `burn` | crouch or jump over; lines at head or ankle height (the line shows which) |
| **Hymn of Wax** | her mouth glows, her hem bulges and glows amber | `lf.boss.tallow.hymn` | 1200 ms | — | P1: 4 `wax_mite` crawl out of her hem (max 8 alive). P2: she plucks candles from her hair instead — 2 `dripling` (max 3 alive) |

**Void zone `vz_tallow_pool`:** shape `pool` (`molten_wax` cells that flow downhill), starting size 16×3 cells,
warm-up 500 ms, lasts until it hardens (6 s, 2 s under rain, instantly under rime), 15 dps ember (scaled), slows
40%, rim **amber `#ff8a2a`** pulsing 2 Hz. After hardening: solid `wax` terrain (walkable, burnable, diggable).

**Movement:** none (she turns to face). The player's job: stay off the pools, climb her own hardened wax.

### 19.4 Transition 1 → 2 (at 50%; full version 66%) — 2.5 s

Her flame gutters low (arena goes dim to 40%), she rips herself off the altar, the altar cracks and **the
dais floods with molten wax** (an 80×4 pool on the dais). The camera cuts to wide view for the 2.5 s and back.
Phase line (01). Player regains 20% HP.

### 19.5 Phase 2 — "The Melting" (campaign 50–0%; full version 66–33%)

She walks toward the player (20 cells/s) and drips constantly: every 1.5 s a small pool (8×2) at her feet.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| Tallow Palm | as P1 | `lf.boss.tallow.palm` | 900 ms | 32 | |
| **Wax Tide** | she kneels, her whole hem glows, an amber line races along the floor to both walls marking the wave height (6 cells) | `lf.boss.tallow.tide` | **1800 ms** (R42) | 26 + `burn` | a real wave of molten wax 6 cells tall runs to both walls at 90 cells/s; jump onto pews, galleries or hardened wax; it leaves a 2-cell `vz_tallow_pool` film that hardens in 6 s |
| Hymn of Wax | as P1 (driplings) | `lf.boss.tallow.hymn` | 1100 ms | — | |
| Wick Lash | as P1 | | 700 ms | 24 | |
| Drip Volley | as P1 | | 900 ms | 12 per drop | |

In the campaign this is the last phase: at 0% go to §19.8.

### 19.6 Transition 2 → 3 (full version only, at 33%) — 3 s

She collapses to half height with a roar (the arena light flares **white** then drops to her flame only), the
three chandelier chains drop from the roof into reach, and the drains clog (molten wax now pools instead of
draining). The camera cuts to wide and back. Phase line (01).

### 19.7 Phase 3 — "The Guttering" (33–0%) — **Lampless and Boss Rush only**

She crawls fast (35 cells/s) and her flame is huge (radius 130). She keeps Tallow Palm, Drip Volley (8 drops, 14
each) and Wax Tide, and adds her last two attacks:

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Flare** | her flame shrinks to a point and turns white-hot, an amber ring lights on the floor around her, radius 60 | `lf.boss.tallow.flare` | 1200 ms | 34 + `burn` | nova; the ring shows the edge; also ignites pews and galleries in range |
| **Gutter Rush** | her hem glows bone white and a floor band marks her path (120 cells, 12 tall) | `lf.boss.tallow.rush` | 1000 ms | 30 | she crawls the band at 140 cells/s; leaves a `vz_tallow_pool` film along it; stuck 1.2 s at the end (punish) |

**The chains:** each of the 3 chains is `metal`. **Spark on a chain** while she is under it makes it glow
white-yellow for 500 ms, then drops its chandelier: 150 damage and a 3 s stagger (a trap hit, §6.2). Ember on a
chain melts it (slower, 4 s). Each chain works once.

### 19.8 Death

Her flame goes out (the arena is dark for 1.5 s — the only moment the arena is fully dark; the floor 0.08 and every
pool's rim still show), her body hardens into a wax statue that stays for the visit (a prefab on re-entry), and from
the statue's heart the **Crown Wick** (`great_wick_act1`) glows amber. Narrator line (01).

### 19.9 Enrage (6:00)

Her flame turns white; every 10 s a free *Wax Tide*; molten wax takes 12 s to harden.

### 19.10 Loot

`lt_boss_act1` (08 §14): `great_wick_act1`, `relic_tallow_heart`, pennies, gear (common in Act 1).

---

## 20. Boss 2 — Saint Gnaw of the Rat Choir

| Field | Value |
|---|---|
| id | `boss_gnaw` |
| Where | the Gutter Cathedral, `a2_n08` |
| Size | 24 × 40 (a rat standing upright in a rotted saint's cope and mitre, holding a baton-crozier) |
| HP | 4200 (level 10) |
| Phases | P1 100–66% "Introit", P2 66–33% "Chorale", P3 33–0% "Requiem" |
| Move | P1: stays on the high pulpit; P2: rope_climber between lofts (100 cells/s on ropes); P3: walker on the floor (70) |
| Resist | ember 0; rime 0; spark -25; bile +50; gleam -25; tide 0; shade 0 |
| Attacks | 7: Verse: Procession, Baton Bolt, Plague Censer, Rope Gnaw, Crozier Dive, Held Note, Requiem Swarm |
| Camzone | `lock` |
| Enrage | 7:00 |
| Voice / lines | 01 §6.4 (babble + the choir, subtitled) and 01 §6.5's boss lines (`bl_gnaw_*`) |

### 20.1 Gimmick: he conducts

Saint Gnaw does not fight alone: he **conducts the choir** — rat swarms that move in visible **ribbons**
(a flowing column of 20–40 `gutter_rat` drawn as one flock) along paths he points at with his baton. The
choir's **song** is the timer: every 8 s he conducts a new "verse" (a ribbon attack). The arena is built for
**rope swinging** (Act 2's verb): the floor is where the rats are, the ropes are where you are safe.

Choir rats in a ribbon are a single group (one AI, 1 token): they cannot be killed one by one; the ribbon has
its own HP (200) and **disperses** when it runs out; killing the ribbon cancels that verse. Spark on a ribbon
that crosses water kills it instantly.

### 20.2 Arena

```
 x→ 0                                                                                        360
 y  ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 0  │   rope anchors ●          ●          ●          ●          ●          ●   (6, grapple)     │
    │      │ rope 80   │         ╲  ╳ chain chandelier ╳  ╱         │ rope 80   │               │
 40 │   ┌──┴──┐                         ┌──────┐                           ┌──┴──┐              │
    │   │LOFT │ choir loft L 50w        │PULPIT│ (Gnaw P1, 30w, y 60)      │LOFT │ choir loft R │
 70 │   └─────┘                         └──┬───┘                           └─────┘              │
    │        ~organ pipes (4, breakable)~   │ pulpit stair                                        │
120 │   ╔═══════╗          ╔════════╗       │           ╔════════╗          ╔═══════╗           │
    │   ║ pew   ║          ║  pew   ║                   ║  pew   ║          ║ pew   ║  (wood)   │
170 │ ░░░░░░░░░░░░░░░░░░░░░░ plague water (2–10 deep, bile-green, 360w) ░░░░░░░░░░░░░░░░░░░░░░ │
    │ ▓▓▓▓▓▓▓ stone floor ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
220 └──────────────────────────────────────────────────────────────────────────────────────────┘
     rat holes (hatches, HP 120): at x 10, x 120, x 240, x 350 on the floor line
```
- 6 grapple anchors in the roof (y 0), ropes hang 80 cells. Two choir lofts (y 60–70) and the pulpit.
- Pews (`wood`, 40×10) stick out of the plague water as islands.
- The floor is flooded with **plague water**: a 2–10-cell layer of `bile` cells (06's bile rules: standing in it
  applies `corrode`, 03). Rime freezes it solid for a while (03's reactions).
- 4 organ pipes (`metal`, 8×40, HP 150 each) along the back wall: see P3.

### 20.3 Phase 1 — "Introit" (100–66%)

Gnaw stays on the pulpit, conducting. Every 8 s a **verse**; between verses he casts on his own.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Verse: Procession** | his baton points; a **red dotted path** lights along the floor from one rat hole to another | `lf.boss.gnaw.verse` + choir chord 1 | 1200 ms | 8 per 0.5 s in contact | a ribbon runs the path at 90 cells/s for 4 s. Get on a rope/pew |
| **Baton Bolt** | baton tip glows sickly yellow `#e8d24a` | `lf.boss.gnaw.bolt` | 600 ms | 18 | a bolt, 220 cells/s, at the player; 3 in a row, 300 ms apart |
| **Plague Censer** | censer glows green, 3 green target circles (r 10) appear | `lf.boss.gnaw.censer` | 1000 ms | 14 on hit | lobs; each makes `vz_plague_puddle` |

**Void zone `vz_plague_puddle`:** `pool` 20×3 of `bile` (spreads on water surfaces as a floating slick 30×1),
warm-up 700 ms, 8 s, 10 dps bile + `corrode`, rim **acid green `#8dff4a`**.

**Movement:** none. Hitting him on the pulpit needs line of sight from a rope or loft.

### 20.4 Transition 1 → 2 (66%) — 3 s

He strikes the pulpit with his crozier; the chandelier chain snaps and the chandelier crashes into the plague
water (making a new metal island at the centre). The whole choir sings one loud chord (screen shakes 4 cells).
He leaps onto a rope. Phase line (01).

### 20.5 Phase 2 — "Chorale" (66–33%)

He moves along the ropes like a rope_climber (100 cells/s), jumping between lofts. Verses every 7 s.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| Verse: Procession | as P1, now 2 paths at once | | 1100 ms | 9/0.5 s | |
| **Rope Gnaw** | he bites the rope the player is on: **the rope segment flashes red** from his mouth to the player's hands | `lf.boss.gnaw.gnaw` | 1000 ms | 0 (you fall) | as Rope Scuttler Cut; the rope regrows in 10 s (rats weave it) |
| **Crozier Dive** | he drops from a rope; his landing spot lights as a bone-white circle r 16 | `lf.boss.gnaw.dive` | 800 ms | 26 | lands on floor/loft; stays 2 s (punish) then climbs back up |
| Plague Censer | as P1, 4 circles | | 900 ms | 16 | |

### 20.6 Transition 2 → 3 (33%) — 3.5 s

The choir falls silent. Gnaw drops to the floor and the plague water **rises 10 cells** (pews go under, only
lofts, the chandelier island and ropes remain dry). He tears off his cope: on his back is the **Hymn-Lung**, a
swollen air sac that feeds the choir. The camera cuts to wide and back. Phase line (01).

### 20.7 Phase 3 — "Requiem" (33–0%)

He wades on the floor (70 cells/s, not slowed by the plague water). The choir is now **all around** him.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Held Note** | he inhales: the Hymn-Lung swells and glows yellow, a **cone** of yellow light (60° × 150 cells) sweeps from his mouth | `lf.boss.gnaw.held` | 1200 ms | 16 dps for 3 s in the cone | the cone turns slowly (30°/s) toward the player. **The weak point is open during it** (below) |
| **Requiem Swarm** | every rat hole glows red at once, 4 red paths light toward the player | `lf.boss.gnaw.requiem` | 1600 ms | 12/0.5 s | 4 small ribbons converge on the player's position; get high |
| Crozier Dive | from lofts only | | 800 ms | 28 | |
| Baton Bolt | as P1 | | 600 ms | 20 | |

**The weak point (Hymn-Lung).** During *Held Note*, the Lung **glows for the whole 3 s** with a small gold marker
over it. Hits on his back (the Hymn-Lung hitbox, 10×10) deal ×2.5 damage; **3 hits** during one Held Note **burst
the note**: the choir chokes, he is stunned 5 s and all ribbons disperse. The first Held Note gets a Narrator hint
line (01).

**Organ pipes:** spark on an organ pipe makes it howl for 2 s: every ribbon within 100 cells scatters (disperses).
Each pipe works twice.

### 20.8 Death

The choir sings one last broken chord and the rats **scatter** into every hole. Gnaw falls into the plague
water; the water drains through a cracked grate, revealing the **Gutter Wick** (`great_wick_act2`) in his
crozier's head.

### 20.9 Enrage (7:00)

Verses every 4 s; the plague water rises 2 cells every 20 s.

### 20.10 Loot

`lt_boss_act2` (08 §14): `great_wick_act2`, `relic_choir_bone`, pennies, gear.

---
## 21. Boss 3 — The Sluicemaw

| Field | Value |
|---|---|
| id | `boss_sluicemaw` |
| Where | the Great Reservoir, `a3_n08` |
| Size | 120 × 40 (a colossal armoured pike with a sluice-gate jaw) |
| HP | 6500 (level 15) |
| Phases | P1 100–66% "High Water", P2 66–33% "Undertow", P3 33–0% "The Maw Opens" |
| Move | swimmer 140 cells/s in water; stranded when drained: flops (12 cells/s) |
| Resist | ember +50 in water / -25 stranded; rime -25; spark -50 (in water only); bile 0; gleam 0; tide +100; shade 0; armoured (4, scales) |
| Attacks | 7: Breach, Gate Ram, Spawn Fry, Flop Slam, Whirlpool, Swallow, Tidal Heave |
| Camzone | `wide` |
| Enrage | 8:00 |
| Voice / lines | none (a beast); the Narrator speaks for it (01 §6.5's boss lines, `bl_sluicemaw_*`, and `named_beast`) |

### 21.1 Gimmick: the flood cycle

The reservoir **floods and drains on a cycle** through two great sluice gates in the floor. The reservoir is
**height-field water** (06 §8.9): one level for the arena with a thin band of real water cells (≤ 8 rows) at the
surface, so the scene stays under the 60,000 awake-liquid-cell cap (00 §13). Swimmers, breath and soaking read the
level. The cycle on Lamplighter:

| Step | Duration | Water level | Sluicemaw |
|---|---|---|---|
| Flooded | 20 s | y 60 (arena 75% full) | swims; lunges; strong |
| Draining | 8 s | falls to y 200 | follows the water down |
| Drained | 12 s | y 200 (a 10-deep channel remains in the trench) | **stranded** in the trench: flops, takes +50% damage, can be staggered easily (poise ×0.5) |
| Filling | 8 s | rises to y 60 | wakes, swims up |

**Levers:** two sluice levers on high ledges (L at x 30, R at x 410). Pulling one takes **1500 ms** (07's lever rule)
and **skips the cycle to Draining** (if flooded) or **Filling** (if drained). Each lever has a 30 s cooldown. The
Sluicemaw knows: when the player is at a lever it prioritises *Gate Ram* at that ledge.

### 21.2 Arena

```
 x→ 0                                                                                                   440
 y  ┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
 0  │  rain                                   rain                                   rain                │
 20 │ ┌LEVER L┐                                                                                ┌LEVER R┐ │
    │ │ ledge │═══ catwalk 80w (iron) ═══                         ═══ catwalk 80w (iron) ═══    │ ledge │ │
 60 │~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ FLOOD LINE (y 60) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
    │        ┌──┐                    ┌──────────┐                    ┌──┐                               │
100 │        │P1│ pillar top 20w     │ PUMPHOUSE │ roof 60w          │P2│ pillar top 20w                │
    │        │  │                    │  (stone)  │                   │  │                               │
150 │        │  │      ┌─┐           └──────────┘        ┌─┐        │  │                               │
    │        │  │      │ │ lamp posts (iron, 2)          │ │        │  │                               │
200 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ reservoir floor ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
    │       ╲______________________ TRENCH (160w, 40 deep) ____________________________╱                 │
240 │        [GATE A]                                                          [GATE B]  (floor sluices)│
    └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 21.3 Phase 1 — "High Water" (100–66%)

| Attack | Telegraph | Audio id | Wind-up | Damage | State |
|---|---|---|---|---|---|
| **Breach** | a ring of bubbles and a **white-rimmed circle** r 24 on the surface over where it will rise; the water there bulges | `lf.boss.maw.breach` | 1100 ms | 40 + knockup 100 | flooded; it leaps out of the water in an arc (30–60 cells high) and dives back |
| **Gate Ram** | its jaw-gate glows bone white; a line from it to the target ledge/catwalk is drawn | `lf.boss.maw.ram` | 1300 ms | 45 | flooded; rams a ledge/catwalk; if it hits a catwalk it **breaks 20 cells** of it (real cells) |
| **Spawn Fry** | its gill slits glow pale green | `lf.boss.maw.fry` | 1000 ms | — | 8 `maw_fry` (max 16) |
| **Flop Slam** | its body lifts, bone-white rectangle 60×12 on the trench floor either side | `lf.boss.maw.flop` | 900 ms | 30 | drained only |

**Movement:** figure-eights under the surface; at least one Breach per flooded cycle, targeted at the player.

### 21.4 Transition 1 → 2 (66%) — 3 s

It rams Gate A from inside: the gate breaks. Water **spins**: from now on the flooded state has a permanent
current (a `current` zone over the whole reservoir, clockwise, 60 cells/s, 06 §8.10) and **draining takes 12 s
instead of 8** (one gate left). The camera shakes. Narrator line (01).

### 21.5 Phase 2 — "Undertow" (66–33%)

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| Breach | as P1, 2 in a row | | 1000 ms | 42 | |
| **Whirlpool** | a blue spiral lights on the surface, r 50 | `lf.boss.maw.whirl` | 1400 ms | 14 dps inside (void zone) | `vz_whirlpool`; pulls toward the centre at 40 cells/s |
| Gate Ram | as P1 | | 1200 ms | 48 | |
| Flop Slam | as P1 | | 800 ms | 32 | drained |

**Void zone `vz_whirlpool`:** `circle` r 50 on the water surface and 40 cells down, warm-up 1400 ms, 6 s,
14 dps tide + pull (a local `current` zone), rim **deep blue `#3f7bff`**. Rime on the whirlpool **freezes it** into
a spinning ice disc (a platform) for 8 s.

### 21.6 Transition 2 → 3 (33%) — 4 s

The reservoir drains down to the trench (both gates open, whatever the cycle), the Sluicemaw is stranded, and it
**opens its gate-jaw**: the jaw becomes a 30×20 cavern with a glowing gullet. It roars; the Hollow's rain
**pours in** through the ceiling as 3 waterfalls. The new cycle: the arena refills **only from the waterfalls**
(slow, 30 s to half height), and draining is by the levers only.

### 21.7 Phase 3 — "The Maw Opens" (33–0%)

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Swallow** | its gullet lights **red** (grab), the pull area (a 100-cell cone in front of the mouth) glows with red rim streaks toward the mouth | `lf.boss.maw.inhale` | 1500 ms | 30 on swallow | inhale pulls at 60 cells/s for 2 s; if swallowed the player is inside for **1.5 s** at most (§8 rule 8) taking 10 dps, and **every hit on the gullet from inside** deals ×3 damage; a dodge, Ember or pole hit spits you out early, 80 cells |
| **Tidal Heave** | the whole water surface glows with a blue rim at the height it will reach | `lf.boss.maw.heave` | 1600 ms | 30 + knockback | a wave crosses the arena at the rim's height (needs water ≥ 30 deep) |
| Breach | as P2 | | 1000 ms | 46 | |
| Spawn Fry | gills glow | | 1000 ms | — | 12 fry |
| Flop Slam | as P1 | | 800 ms | 34 | drained |

### 21.8 What helps (material interactions)

| You do | What happens |
|---|---|
| **Rime on the water** while it is under the surface | the surface freezes (a layer 4 cells thick over the frozen area); it is **trapped** under ice until it Breaches through (it takes 200 dmg and is stunned 3 s). The ice is also a floor for you |
| **Rime on a whirlpool** | freezes it into a platform (8 s) |
| **Spark into the water** | +50% on it (−50 resist) — but you are hurt too if you touch the water, and fry die |
| **Ember on the water** | boils a patch into steam: a **steam column** rises and lifts the player (07's steam lift) — a way up to the levers when the catwalks are broken |
| **Pulling levers** | skips the cycle (above); stranding it early = damage window |
| **Tide** (wet from this act) | pushes water: you can pile water against one side to strand its tail |
| **Iron lamp posts** | lit with spark while it is next to them: 60 dmg and 1 s stun (a trap hit, §6.2) |

### 21.9 Death

It thrashes once and goes still in the trench; the rain waterfalls slow to a trickle. The **Sluice Wick**
(`great_wick_act3`) glows in its opened jaw (you walk into the jaw to take it).

### 21.10 Enrage (8:00)

The cycle stops in **Flooded** permanently.

### 21.11 Loot

`lt_boss_act3` (08 §14): `great_wick_act3`, `relic_maw_tooth`, 5 pearls, pennies, gear.

---

## 22. Boss 4 — The Lampless Widow

| Field | Value |
|---|---|
| id | `boss_widow` |
| Where | the Moth Nave, `a4_n08` (antechamber = the Nave Steps) |
| Size | 80 × 60 (a moth-spider: eight long legs, a furred moth body, two vast ragged wings folded like a cloak) |
| HP | 8200 (level 20) |
| Phases | P1 100–66% "The Veil", P2 66–33% "Eclipse", P3 33–0% "Hunger" |
| Move | P1 ceiling (on her web, 90 cells/s); P2 flyer (silent, 70); P3 walker/crawler on floor and walls (110) |
| Resist | ember -25 (her wings burn); rime 0; spark 0; bile 0; gleam -50; tide 0; shade `heal`; armoured (2) |
| Attacks | 7: Silk Line, Dust Wings, Devour the Light, Swoop, Snuff Wave, Call the Unlit, Cocoon |
| Camzone | `lock` |
| Enrage | 9:00 |
| Voice / lines | stolen voices, 01 §6.4; 01 §6.5's boss lines (`bl_widow_*`) |
| Kindling | finishing her with Gleam (the Mothwife asks) sets `widow_mercy` (01) |

### 22.1 Gimmick: she eats light

The Widow **eats light**. On arena entry she snuffs your lantern (it goes out, 0 light, oil untouched — your
lantern cannot be relit inside the Nave until she dies). The fight is lit by:

1. **Your spells.** Every wick you cast is a moving light (03). In this arena only, every wick impact leaves an
   **afterglow**: a 12-cell light of its flame colour that fades over 3 s (normally 0.5 s).
2. **Eight lamp sconces** on the walls (iron, unlit). Any flame lights one for 20 s (Ember/Gleam: 30 s). She
   eats lit sconces (*Devour the Light*).
3. **Her own eyes and telegraphs** — always lit (the pillar-5 rule): her 8 eyes are **pale violet-white**, and
   every telegraph has a rim.
4. **The room floor:** ambient never below 0.08 (00 §13), so terrain is dimly visible as silhouettes.

She heals **1% max HP per second** while the light at her body is in the **`dark` tier** during P2 and P3; she
cannot heal while a spell or a sconce puts her in `dim` or brighter. Gleam deals +50% and makes her **flinch**: she
flies to the darkest corner for 2 s (a scripted boss reaction; `dazzled` itself is Unlit-only).

**Moth Oracle unlock:** the snuff on entry **never counts** as your lantern going out (a scripted exemption, R29;
04 owns the challenge).

### 22.2 Arena

```
 x→ 0                                                                                      360
 y  ┌──────────────────────────────────────────────────────────────────────────────────────┐
 0  │╲╲╲╲╲╲╲╲╲╲╲╲╲╲ WEB CANOPY (web cells, 20 thick, burnable) ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱│
 30 │   S1            S2                  (stained glass, black)            S3           S4 │  S = sconce
    │   ┃                      web strands (climbable, burnable)                         ┃   │
 70 │ ┌───┐      ╲    │    ╱          ┌─────────┐          ╲    │    ╱             ┌───┐ │
    │ │bal│       ╲   │   ╱           │ ROSE    │           ╲   │   ╱              │bal│ │  balconies 40w
110 │ └───┘                            │ WINDOW  │                                   └───┘ │
    │   S5                             │ (glass) │                                   S6    │
150 │        ┌──────┐                   └─────────┘                 ┌──────┐              │
    │        │ pew  │   S7                                    S8    │ pew  │              │
200 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ nave floor (stone, puddled oil) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
    │   oil pools (black oil on floor puddles, flammable): x 60, x 180, x 300 (each 30×2)    │
220 └──────────────────────────────────────────────────────────────────────────────────────┘
```
- The canopy is **`web` cells** (burnable, in 4×4 tiles, §29). Burning it **removes her P1 hiding place** in that
  section (burnt canopy does not regrow) and drops burning web bits (a fire hazard).
- The rose window (`glass`, 60×60): in P3 it can be broken (see P3).
- Three `oil` pools on the floor: ignite them for a big 8 s light (and a fire void for everyone).

### 22.3 Phase 1 — "The Veil" (100–66%)

She moves inside the canopy, above, only her 8 eyes visible. She attacks from above.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Silk Line** | a thin **pale violet line** is drawn from the canopy to the floor at the player's position | `lf.boss.widow.line` | 900 ms | 30 | she drops down the line and bites, then climbs back (2 s on the line: punish) |
| **Dust Wings** | her wings open in the canopy, dusty pale-violet motes swirl in a 80×40 area below | `lf.boss.widow.dust` | 1000 ms | 8 dps | `vz_moth_dust` below her |
| **Devour the Light** (one sconce) | she crawls to a lit sconce: the sconce's light **bends toward her** (the light map shows a streak) | `lf.boss.widow.devour` | 1500 ms | — | puts out that sconce and heals her 3%. Interrupt with 80 poise, Gleam, or by burning the web she crawls on |

**Void zone `vz_moth_dust`:** `rect` 80×40 (falls to the floor), warm-up 1000 ms, 5 s, 8 dps shade + your
spells' afterglow in the zone fades 3× faster, rim **pale violet `#d7b8ff`**.

### 22.4 Transition 1 → 2 (66%) — 3 s

She tears out of the canopy and **spreads her wings across the whole Nave**: every light in the room — sconces,
afterglows, even oil fire — goes out with a sound like a breath drawn in. For 3 s the only lit things are her 8
eyes, the player's eyes and every rim (the floor 0.08 holds). Phase line (01). The Unlit **Gloamhounds** (§15)
arrive: 3 of them, with the whisper sound first.

### 22.5 Phase 2 — "Eclipse" (66–33%)

She flies silently (70 cells/s) through the dark, heals in darkness (1%/s). Sconces can be lit again. Your spell
afterglows are 3 s (as §22.1). The dark is the enemy: keep her lit.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Swoop** | a **violet-rimmed dark wedge** (negative light, like the Unlit) opens along her flight line | `lf.boss.widow.swoop` | 900 ms | 36 | she crosses the arena along the line |
| **Snuff Wave** | her wings fold in; a violet ring spreads from her | `lf.boss.widow.snuff` | 1200 ms | 16 | ring r 120, 6 cells thick; **puts out every light it crosses** (sconces, afterglows) |
| **Call the Unlit** | her eyes pulse three times | `lf.boss.widow.call` | 1500 ms | — | 2 Gloamhounds (max 4), each with the ambush whisper |
| Dust Wings | as P1, from the air | | 1000 ms | 8 dps | |

### 22.6 Transition 2 → 3 (33%) — 3 s

She crashes to the floor, wings torn (if the player burned the canopy, fewer tears — cosmetic). She screams
(`lf.boss.widow.scream`, screen shake 6), and **every sconce lights itself violet** (her stolen light bursting out
of her). They stay violet: they light the arena at 0.4 (`dim`), but violet light **heals her** if she stands within
30 cells of a violet sconce. Put them out (Tide, a pole hit, or relight them with any other flame, which turns them
normal). The camera cuts to wide and back. Phase line (01).

### 22.7 Phase 3 — "Hunger" (33–0%)

She hunts on the floor and walls (110 cells/s), and she **pulls spell light toward her**: bolts and lobs within
60 cells curve into her mouth. **In P3 she takes +25% damage from `bolt` and `lob` wicks** (R41: a positive counter).
Lingering shapes (`beam`, `ring`, `rune`) hit her normally and **never heal her**.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| Swoop (floor) | the same violet-rimmed dark wedge, now along the floor or up a wall ahead of her | `lf.boss.widow.swoop` | 800 ms | 40 | runs 160 cells |
| **Cocoon** | spinnerets glow red (grab), red rim | `lf.boss.widow.cocoon` | 1000 ms | 14 dps while wrapped | wrapped for **1.5 s** at most; a dodge, an Ember hit or a pole hit frees you early (R73) |
| **Devour the Light** (all lights) | her body opens (mouth glows violet), every light in the room bends toward her | `lf.boss.widow.devour` | 2000 ms (interruptible by 150 poise or 2 Gleam hits) | — | if not interrupted: every light out, she heals 8%, the player's afterglows are gone; used at 25% and 10% |
| Snuff Wave | as P2 | | 1000 ms | 18 | |

**The rose window:** 3 heavy hits (or one `heavy`-charm lob, or a bomb) shatter it: **grey storm light**
floods the Nave at 0.5 (`lit`) for the rest of the fight (the Rain's grey sky). She cannot heal in it and takes
+15% damage. It is a **one-time** choice; it also lets the rain in (the floor gets wet: spark bonus).

### 22.8 What helps

| You do | What happens |
|---|---|
| Light sconces (any flame) | light 20–30 s; denies her dark healing within 60 cells; she spends time devouring them in P1 |
| Ignite floor oil pools | 8 s of strong amber light (and a fire zone — she avoids fire in P3, +50% ember while she burns) |
| Burn the canopy (P1) | removes her hiding places; burning web falls: fire hazard |
| Gleam wicks | +50% damage and she flinches to the darkest corner (predictable positioning) |
| Bolt and lob wicks (P3) | +25% damage |
| Break the rose window (P3) | permanent grey light; no dark-heal; +15% damage taken |
| **Moth Oracle** class | sees in darkness (04): her body is visible, not just her eyes |

### 22.9 Death

She tries to *Devour* one last time and chokes on it: all the light she has eaten **bursts out** of her in every
flame colour at once (a 2 s full-screen colour bloom — the prettiest moment of Act 4), and the **Deep Wick**
(`great_wick_act4`) falls, glowing. Your lantern relights by itself. Narrator line (01).

### 22.10 Enrage (9:00)

All sconces go out permanently; she heals 2%/s in darkness.

### 22.11 Loot

`lt_boss_act4` (08 §14): `great_wick_act4`, `relic_widow_veil`, pennies, gear.

---
## 23. Boss 5 — The Bellfather

| Field | Value |
|---|---|
| id | `boss_bellfather` |
| Where | the Bellwell Bottom, `a5_n07` |
| Size | 90 × 110 (a giant bronze bell with an iron frame body, two chain arms ending in clappers, and a face cast on the bell's waist) |
| HP | 11000 (level 25) |
| Phases | P1 100–66% "Matins", P2 66–33% "The Swing", P3 33–0% "The Last Knell" |
| Move | P1 walker on the shaft floor (25 cells/s); P2 hangs on 4 chains and swings (pendulum); P3 climbs the shaft walls |
| Resist | ember +50; rime +25; spark -50 (metal); bile -50 (corrodes bronze); gleam 0; tide +25; shade 0; armoured (6) |
| Attacks | 7: Toll, Clapper Swing, Ground Knell, Clapperling Brood, Pendulum, Shake the Well, The Last Knell |
| Camzone | `wide` + vertical follow |
| Enrage | 10:00 |
| Voice / lines | 01 §6.4 (tolls and one word per phase) and 01 §6.5's boss lines (`bl_bellfather_*`) |

### 23.1 Gimmick: tolls flip gravity in bands

Every **toll** of the Bellfather flips gravity inside horizontal **bands** of the shaft (06 §10.7 gravity bands:
they move bodies, fragments, particles and rain; cells inside a flipped band are held). Bands snap to 8-cell rows.
Inside a flipped band, you (and monsters, loose bodies, rain) fall the other way. Bands last until the next toll
that names them. The shaft is tall: the whole fight is **vertical**.

**Readability rule (R41):** every band's **state is on screen for at least 700 ms before it acts**. A band that is
about to flip is drawn with a lit rim on its top and bottom edges and faint arrows showing the new "down" for the
whole wind-up (≥ 1,400 ms here), and the **band indicator** on both screen edges (02 HUD) always shows all four bands'
current and next state — so a band that is off screen is never a surprise.

Tolls also **shake loose** every cell flagged `cracked` within the band (06): cracked stone falls (in the band's
current direction!) — crush damage to anyone underneath (including him).

### 23.2 Arena

```
 x→ 0                               300
 y  ┌──────────────────────────────────┐ 0      top of the shaft (sealed grate, P3 exit)
    │▓ cracked ceiling ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
    │  ●──chain anchor──●  (4 anchors)  │ 40
    │ ┌─┐   BAND 4 (y 40–120)     ┌─┐  │
    │ │L│  ledge 30w     ledge 30w│L│  │ 100   L = gravity lantern (player can flip locally, 07)
    │ └─┘                         └─┘  │
    │-------- BAND 3 (y 120–200) ------│
    │   ┌────┐   rope   rope   ┌────┐  │ 170   rope: bell-ropes, climbable
    │   │ledge│   ║      ║     │ledge│  │
    │-------- BAND 2 (y 200–280) ------│
    │ cracked  ▒▒▒▒         ▒▒▒▒ cracked│ 240   ▒ cracked stone ledges (fall when tolled)
    │-------- BAND 1 (y 280–360) ------│
    │                                  │
    │          BELLFATHER (P1)         │ 330
    │▓▓▓▓▓▓▓▓▓▓ shaft floor ▓▓▓▓▓▓▓▓▓▓▓│ 360
    │  flooded sump (water 20 deep)    │ 380
    └──────────────────────────────────┘
```
- 300 wide × 380 tall. The camera is in **wide view** (640 × 360) and follows the player vertically, so almost the
  whole shaft is on screen at once; the band indicator covers the rest.
- 4 bands (numbered from the bottom). 2 gravity lanterns the player can use on the side ledges (07).
- Bell-ropes hang from the chain anchors to y 300.

### 23.3 Phase 1 — "Matins" (100–66%)

He walks the shaft floor. Tolls every 9 s flip one band.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Toll** | his face's mouth glows **pale bronze** `#d9a95a`; the chosen band's edges light with a **cyan-violet rim `#8a7bff`** and arrows; the edge indicator marks it | `lf.boss.bell.toll` | 1400 ms | 12 (shock) to all in the band | flips the band; loosens cracked cells in it |
| **Clapper Swing** | a chain arm lifts, its clapper glows bone white, a 70-cell arc drawn | `lf.boss.bell.clapper` | 1000 ms | 48 | |
| **Ground Knell** | he lifts off the floor, a bronze ring on the floor, r 90 | `lf.boss.bell.knell` | 1300 ms | 36 + launch 100 | shockwave along the floor; jump it or be on a ledge; leaves `vz_resonance` |
| **Clapperling Brood** | the inside of his bell glows | `lf.boss.bell.brood` | 1200 ms | — | 3 `clapperling` walk out (max 6) |

**Void zone `vz_resonance`:** after each Ground Knell, the floor rings: `band` full width × 6 cells from the floor,
warm-up 600 ms, 3 s, 12 dps (`physical`), rim **pale bronze**. Stand on a ledge, a rope, or on a flipped ceiling.

### 23.4 Transition 1 → 2 (66%) — 3.5 s

He hooks both chain arms onto the 4 chain anchors and **hauls himself up** into the middle of the shaft. The floor
floods from the sump (water rises to y 340, a 20-deep pool — electrify-able). Band 1 flips permanently while he
climbs (its rim and indicator show it for the whole 3.5 s). Phase line (01).

### 23.5 Phase 2 — "The Swing" (66–33%)

He hangs on 4 chains and swings as a pendulum across the shaft (period 6 s, amplitude 100 cells), bands 2–3.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Pendulum** | his swing path lights as a **bone-white arc** across the shaft | `lf.boss.bell.pendulum` | 1200 ms | 55 | his body is the hit; the arc shows where it passes |
| Toll (double) | 2 bands rim at once | `lf.boss.bell.toll` ×2 | 1600 ms | 12 each | flips 2 bands |
| **Shake the Well** | every cracked cell in the shaft glows bronze | `lf.boss.bell.shake` | 1800 ms | crush (§6) | every cracked cell falls in its band's direction |
| Clapper Swing | as P1, from the chains | | 1000 ms | 48 | |

**The chains:** each chain has 800 HP (bile ×2, ember ×1.5 on the anchor links). Breaking one chain makes his
swing lopsided (the Pendulum arc changes; the telegraph shows it) and deals 400 to him; breaking **two** drops
him to the floor: he takes 300 fall damage and the transition to P3 begins early (at whatever HP, P2 attacks stop).

### 23.6 Transition 2 → 3 (33% or 2 chains broken) — 4 s

He falls, cracks along his waist (a glowing crack of molten bronze light down his face), and lands in the flooded
floor: steam blasts up. Then he **grips the shaft walls** with his chain arms and begins to climb. Phase line (01).
The top grate (y 0) cracks open: rubble starts falling every 3 s in the top 2 bands (each fall spot rimmed 700 ms).

### 23.7 Phase 3 — "The Last Knell" (33–0%)

He climbs the shaft (30 cells/s) toward the top, and **the whole shaft flips every 8 s** (all bands at once),
telegraphed. The player chases him up (or rides the flips). At the top he rings the final knell unless stopped:
the **soft enrage of this phase**.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| Toll (all bands, the Great Flip) | the rims of all 4 bands light together, arrows reverse; a **2 s** countdown ring on both edge indicators | `lf.boss.bell.greatflip` | 2000 ms | — | the whole shaft's gravity flips |
| Clapper Swing | as P1 | | 900 ms | 52 | |
| Shake the Well | as P2, only his band and the one above | | 1400 ms | crush | |
| **The Last Knell** | when he reaches y 40: his whole body glows bronze, the screen edges pulse bronze | `lf.boss.bell.final` | 6000 ms (interruptible by breaking him: 600 poise, or dealing 8% HP) | 70% of the player's max HP | if it completes it deals the damage and he drops back down to y 200 to climb again |

**Void zone `vz_crack_light`:** his crack drips molten bronze (passive, not an attack): `pool` 10×2 on whatever
surface is "down", warm-up 500 ms, 4 s, 16 dps ember, rim **molten bronze `#ffb14a`**.

### 23.8 What helps

| You do | What happens |
|---|---|
| **Gravity lanterns** (the 2 in the arena, or yours) | flip your own local gravity to reach ledges, stand on a band's ceiling out of Ground Knell |
| **Tolling him with his own falling cells** | cracked cells falling on him deal crush damage (the 25%-per-step cap applies, so ~2.5 k per big slab; a trap hit, §6.2) |
| **Bile** | corrodes the bronze (§1 Armour); ×2 on chains |
| **Spark in the flooded floor** (P2) | he is not in the water; clapperlings are (they die). Spark on his chains while wet: 1 s stun |
| **Wax or rime on his mouth** (the Clapperling trick) | a Rime hit, or a lob that lands `molten_wax`, into his mouth while it glows (Toll wind-up) **mutes** that Toll (cancels it). 3 uses before his heat melts it out |

### 23.9 Death

He cracks in half at the top of the shaft; both halves fall past the player (a spectacle, not a hazard: they fall in
a lit, telegraphed channel) and ring one final time at the bottom — all 4 bands reset to normal gravity. The **Bell
Wick** (`great_wick_act5`) hangs where his clapper was.

### 23.10 Enrage (10:00)

Tolls every 4 s (each still shows its band ≥ 700 ms first); P3 climb speed ×2.

### 23.11 Loot

`lt_boss_act5` (08 §14): `great_wick_act5`, `relic_bell_clapper`, pennies, gear.

---

## 24. Boss 6 — Ossery Vane, the Cloudwarden

| Field | Value |
|---|---|
| id | `boss_ossery` |
| Where | arena **`a6_storm_eye`** (the Storm's Eye), at the top of the Cloudroot. P1–P3 at node `a6_n06` **The Storm's Eye** (in the rain); P4 at node `a6_n09` **The Dry Eye** (the same arena, dry, platform crumbling) (00 §12, R1) |
| Size | 10 × 18 (a tall, thin, grey-bearded human in a coat stitched from raincloud) — plus **the Loom**, a 120×80 frame of bound cloud behind him that is part of the fight |
| HP | 16000 total (level 30): P1 100–75%, P2 75–50%, P3 50–25% (at `a6_n06`); P4 25–10% (at `a6_n09`), then the choice |
| Phases | P1 "The Warden's Court", P2 "The Binding", P3 "Stormeye", P4 "The Dry Eye" |
| Move | P1 walker (70) + short rain-steps; P2 walker; P3 flyer (120, rides the storm); P4 walker, desperate (95) |
| Resist | ember 0 (P4: -25); rime 0; spark +50 (P4: 0); bile 0; gleam 0; tide +50 (P4: -25); shade 0; armoured (3). In P1–P3 he also has the **Rain Mantle** (below) |
| Attacks | 9: Rain Spear, Vane Sweep, Downpour, Rain-Step, Loom Pull, Chain Lightning, Eye of the Storm, Stormdive, Last Cloud |
| Camzone | `wide` |
| Enrage | P1–P3: 9:00; P4: 3:00 |
| Voice / lines | 01 §6.4 (the only boss with memories of the player) and 01 §6.5's boss lines (`bl_ossery_*`); Lingo tag `ossery` for repeats |

### 24.1 Gimmick: he controls the rain

Ossery Vane is the man who bound the sky. In this fight the **rain is his weapon**:

- **Rain Mantle (P1–P3): 40%.** While rain falls on him, a barrier absorbs **40%** of damage (R41). Rain over him is
  visible as brighter streaks with a pale blue shimmer on his coat (the mantle's tell).
- **Counter-hits drop it.** Any **Ember, Rime or Shade** hit on him (or on the rain directly above him) **drops the
  mantle for 5 s** (the shimmer goes out and a small ring on his bar counts the 5 s down). Ember turns the rain over
  him to steam, Rime to hail, Shade drinks it — three different looks, one rule. Tide does nothing (it is rain).
- **Cover.** The arena has **cover** (the Loom's shadow, the broken bell-canopy, root arches) where no rain falls:
  while he stands under cover he has no mantle.
- **Borrowed colour (replaces v1's wick-steal).** Every 12 s his hand glows the **colour of your selected wick's
  flame** for 800 ms and a thin line of that colour runs from your lantern to him. His **next attack** is drawn in
  that colour and deals that flame's element. Nothing is taken from you — it is a telegraph, not a theft (R41).
- **Rain direction** is a variable he changes (`down`, `slant_left`, `slant_right`, `up` in P3). Slanted rain pushes
  the player 20 cells/s sideways; in P3 it makes bolts drift 10 cells/s.
- **The Rain stops between P3 and P4** (§24.8): the Loom breaks, the cloudroot's lakes fall, and P4 is fought dry.

### 24.2 Arena (`a6_storm_eye`)

```
 x→ 0                                                                                               400
 y  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 0  │  ☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁ THE BOUND SKY (cloud ceiling; at the Dry Eye: torn open) ☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁☁ │
    │                         ┌──────────────── THE LOOM (120×80) ────────────────┐                     │
 40 │    rain                 │  threads of cloud: 5 Loom Threads (T1..T5)         │         rain        │
    │                         │  T1      T2      T3      T4      T5                 │                     │
 90 │  ┌─────┐                └───┬──────┬───────┬───────┬──────┬────────────────┘       ┌─────┐       │
    │  │arch │  (cover)            ║      ║       ║       ║      ║  (threads hang to y 150) │arch │ cover │
130 │  │ L   │                                                                               │  R  │       │
    │  └─────┘       ┌───────┐                                             ┌───────┐        └─────┘       │
160 │               │canopy │ broken bell canopy (cover, 50w)              │ root  │ root arch (cover)   │
    │               └───────┘                                              └───────┘                     │
200 │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ Warden's platform (root wood + flagstones) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
    │  ▒▒ held water: cloud-cisterns under the platform (emptied in the Falling Flood) ▒▒             │
260 └───────────────────────────────────────────── the Hollow, a mile down ─────────────────────────────┘
```
- The platform is 400 wide; its edges drop into the Hollow (falling off = respawn at the edge with 15% max HP damage).
- **Cover** (no rain beneath): arch L (x 20–60), arch R (x 340–380), the bell canopy (x 90–140), the root arch (x 270–320).
- **The Loom** hangs above the middle with 5 **Loom Threads** (T1–T5), each a column of bound cloud 8 wide reaching
  down to y 150. They are targets (P2).
- The arena is authored once; the Dry Eye loads the same room with the rain off, the Loom gone, the sky torn open
  and the crumble script on (09 owns the node; 06 the dry palette).

### 24.3 Phase 1 — "The Warden's Court" (100–75%)

He fights as a duelist with a weather-vane staff. He **rain-steps**: every 6 s he can dissolve into rain and reform
anywhere rain is falling.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Rain Spear** | he raises the staff; 3 **bright blue streak lines** appear in the rain, angled at the player | `lf.boss.vane.spear` | 900 ms | 34 each | 3 spears of hardened rain fall along the lines, 150 ms apart |
| **Vane Sweep** | staff's weathercock glows bone white, 50-cell arc | `lf.boss.vane.sweep` | 700 ms | 40 | |
| **Downpour** | a column of rain turns bright blue, 30 wide | `lf.boss.vane.downpour` | 1100 ms | 18 dps | `vz_downpour_boss` |
| **Rain-Step** | a column of rain 10 wide turns bright pale-blue at the arrival point | `lf.boss.vane.step` | 600 ms | — | teleport |

**Void zone `vz_downpour_boss`:** `column` 30 × full height, warm-up 1100 ms, 4 s, 18 dps tide, knocks the player
down (no jumping inside), rim **deep blue `#3f7bff`**.

### 24.4 Transition 1 → 2 (75%) — 3 s

He plants the staff; the Loom above him lights up, its 5 threads **pull taut** and glow pale blue. The rain turns
**slanted** (direction flips every 20 s, each flip shown 1 s ahead by the streaks turning). Phase line (01).

### 24.5 Phase 2 — "The Binding" (75–50%)

He stays near the centre, drawing power from the Loom. **While any Loom Thread is intact, he regenerates 0.5% HP/s**
(the mantle stays 40%). Each thread has 900 HP; threads only take damage from **flame** damage (not pole hits) and
each thread is weak to one flame, shown by its colour: T1 amber (ember ×2), T2 cyan (rime ×2), T3 yellow (spark ×2),
T4 green (bile ×2), T5 violet (shade ×2). Cutting a thread makes it snap (the cloud unravels into a harmless puff)
and stuns him 2 s.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Chain Lightning** | the Loom crackles, yellow target circles r 14 on 3 spots near the player | `lf.boss.vane.lightning` | 1000 ms | 38 | `soaked` players take spark's bonus (03) |
| Rain Spear | as P1, 5 spears | | 900 ms | 36 | |
| **Loom Pull** | a thread glows bright, a blue arrow band toward the thread | `lf.boss.vane.pull` | 1200 ms | — | a `current` zone pulls the player 60 cells toward a thread (and under it: the thread base is `vz_thread_base`) |
| Vane Sweep | as P1 | | 700 ms | 42 | |

**Void zone `vz_thread_base`:** `circle` r 12 under every intact thread, on for all of P2 (warm-up only when the phase
starts), 20 dps tide, rim **pale blue `#9fc4ff`**.

### 24.6 Transition 2 → 3 (50%) — 4 s

He tears the Loom down on himself and **rides the storm**: the cloud ceiling lowers 30 cells, lightning flickers, the
rain turns to **upward** gusts in two columns (steam lifts, 07: the player can ride them), and he rises into the air.
The arena is already in wide view, so the camera does not change. Phase line (01).

### 24.7 Phase 3 — "Stormeye" (50–25%)

He flies (120 cells/s) in a figure-eight above the platform. Rain direction changes every 10 s (telegraphed by an
arrow on the HUD edge and the streaks turning 1 s before). The platform starts losing flagstones (cracked cells fall
into the Hollow every 15 s at marked spots — **pale grey rims** mark the doomed cells for 1500 ms).

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Eye of the Storm** | a **ring** of pale blue rim, r 80, centred on the player; the inside is calm (no rain), the ring edge is the danger | `lf.boss.vane.eye` | 1400 ms | 26 dps on the ring | `vz_storm_ring` |
| **Stormdive** | he stops in the air, a white-yellow streak line to the player | `lf.boss.vane.dive` | 900 ms | 50 | dives; lands 1.5 s (punish; no mantle while on the ground under cover) |
| Chain Lightning | as P2, 4 circles | | 1000 ms | 40 | |
| Rain Spear | as P1, falling along the slant | | 900 ms | 36 | |

**Void zone `vz_storm_ring`:** `ring` r 80, 8 cells thick, fixed at the player's position at the moment of cast,
warm-up 1400 ms, 5 s, 26 dps spark, rim **white-yellow `#fff27a`**, the inside is calm (a safe zone the player sees
clearly).

**Grounding him:** Stormdive's landing is the main damage window. Also: a `tether`-shape wick between two points he
flies through **snags** him (he drops 2 s). A Rime hit on him while he is in rain drops the mantle (the counter-hit
rule) **and** freezes the rain on his coat: he drops 1 s (once per 15 s).

### 24.8 Hand-off at 25% — to `cs_rain_stops` and the Falling Flood

There is **no in-arena cinematic** (R1). When P3 ends at 25%:

1. The fight ends as **won** for the checkpoint (00 §12 step 8: from now on a death in `a6_n07`–`a6_n09` restarts
   at the top of `a6_n07`). Ossery clutches the failing Loom as the binding breaks; the platform empties of rain.
2. **`cs_rain_stops`** plays (01 owns it, ≤ 12 s): drops hang, fall, silence; the root lets go of every lake it holds;
   control returns **mid-fall**.
3. **`a6_n07` The Falling Flood** (3 forced rooms, height-field water, 09 and 06 own them) and **`a6_n08` The Dry
   Root** (2 rooms) follow. Act 6 monsters there are in their **After the Rain** state (§14).
4. P4 begins on arrival at `a6_n09`.

### 24.9 Phase 4 — "The Dry Eye" (25–10%, at `a6_n09`)

The same arena, dry, the sky torn open. No rain, no mantle, no Loom. He is an old man with a staff and what is left of
the storm in him — desperate, fast, hitting hard. The platform is breaking up: every 20 s one section (a 60-wide slab,
marked with a pale grey rim for 2000 ms) **falls into the Hollow**. The platform shrinks from 400 wide toward a
minimum of 160 (it stops there).

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Last Cloud** | he pulls a cloud out of his coat, a grey rim circle r 40 at the player | `lf.boss.vane.lastcloud` | 1200 ms | 20 dps | `vz_last_cloud` — the last cloud in the world |
| Vane Sweep (three) | three quick sweeps, each with its own 400 ms bone-white arc | `lf.boss.vane.sweep` | 3 × 400 ms | 30 each | a combo |
| Chain Lightning (dry) | staff glows white-yellow, a zig-zag line drawn from him to the player | `lf.boss.vane.lightning` | 800 ms | 44 | no water bonus now |
| Stormdive (leap) | he crouches, a white-yellow landing circle r 16 | `lf.boss.vane.dive` | 900 ms | 46 | a leap, not a flight |

**Void zone `vz_last_cloud`:** `circle` r 40, warm-up 1200 ms, 6 s, 20 dps rime, sight −50% inside, rim **pale
grey-white `#e0e6ee`** (the only zone drawn in grey: the last of the weather).

### 24.10 What helps (all phases)

| You do | What happens |
|---|---|
| Fight him **under cover** (arches, canopy) | no rain on him → no Rain Mantle (P1–P3) |
| **Ember, Rime or Shade** hits | drop the mantle for 5 s (P1–P3) |
| Cut Loom Threads with the matching flame (P2) | stops his regen; 2 s stun each |
| **Tether** wick across his flight path (P3) | snags and drops him 2 s |
| Watch the borrowed colour | his next attack uses your selected flame's element: switch to a flame you resist before it lands |
| After the Rain (P4) | ember and tide deal +25%; spark no longer resisted |

### 24.11 At 10%: the choice (no death branch)

At **10% health** in P4 the fight **freezes** into 01 §11.2's three prompts you walk to (00 §12 step 7): **Take the
flame** (always) → Ending C; **Hold the tether** (needs `knows_keeper_rule`, reached by grapple) → Ending B; **Ask
him to let go** (always shown; succeeds only with `kindling ≥ 5` and `knows_keeper_rule`) → Ending A; on failure
Ossery answers with a fixed line and the prompt greys out. The Plea and the kill branch of v1 are parked. 01 owns
everything that happens next; the `lt_boss_act6` payout (08 §14: `great_wick_act6`, pennies, no relic) is granted
when any prompt is taken.

### 24.12 Enrage

P1–P3 (at `a6_n06`): the standard enrage at 9:00 (the mantle does not change). P4: after 3:00 the platform falls every
8 s instead of 20 (it still stops at 160).

### 24.13 Boss Rush

Boss Rush (09) runs P1–P3 and a short P4 in one arena load: at 25% the rain cuts out in place (no cutscene, no
Falling Flood), the crumble script starts, and the fight ends at 10% with a win instead of the choice.

---

## 25. Speech: when monsters and bosses talk

01 owns every line, pool, tag, voice and bark limit (R22, R24, R63). This page only says **which AI moment fires
which intent** (Lingo `enemy_opener` etc.); the numbers of how often are 01's bark table.

| Moment | Intent (Lingo) | Who |
|---|---|---|
| a talking enemy enters `alert` | `enemy_opener` | the Knell, the Drowned Lockkeeper |
| lands a hit / player takes a big hit | `combat_taunt` | same |
| takes a big hit (≥ 20% its HP) | `combat_hurt` | same |
| enters `flee` / surrenders | `combat_flee` | the Knell (always on surrender) |
| kills the player | `combat_kill` | any talking enemy nearby |
| a beast is noticed (first of its kind in the act) | `beast_snarl` (Narrator log) / `named_beast` for the Sewer-King and the Sluicemaw | Narrator |
| boss or miniboss first entry, each phase, death | line ids `bl_<boss>_open` / `bl_<boss>_p1`…`p4` / `bl_<boss>_death` from 01 §6.5 (Ossery: `bl_ossery_freeze`, `bl_ossery_refuse`, `bl_ossery_kill` instead of a death line); retries draw from `boss_opener` / `boss_phase` with the boss tag | bosses, `mb_lockmaster` |
| first trap kill, first Held Note, a named elite appears | Narrator lines (01) | Narrator |

Monster voice kinds (`babble`, `none`, a pool) are listed per entry; roles, seeds and fx are 01's and the voice
bridge is 10 §10.2's. v1's per-boss line texts are kept in Parked (v2) for 01 to draw from.

---

## 26. Sound ids

The `sfx/` catalog (118 ids) covers generic sounds. Lanternfall adds its own ids under `lf.*` through its sfx bridge
(file and shape: 10 §10.4), each with a **fallback** to an existing catalog id so a missing recipe never goes silent.

| New id pattern | Used for | Fallback id |
|---|---|---|
| `lf.enemy.skitter` / `growl` / `chain` / `burrow` / `fuse` / `hatch` | regular monster movement and tells; `hatch` is the 500 ms hatch/ambush warning (§7) | `travel.step.soft` / `death.beast` / `melee.swing` / `ambience.cave` / `status.burn.apply` / `ui.open` |
| `lf.unlit.whisper` / `lf.unlit.hole` | Unlit spawn herald, dark-hole telegraph | `ambience.void` / `spell.shadow.launch` |
| `lf.world.sluice_horn` | lever pulls | `ui.open` (pitched down) |
| `lf.boss.tallow.*` (palm, drip, lash, hymn, tide, flare, rush) | Mother Tallow | `spell.fire.*`, `melee.hit` |
| `lf.boss.gnaw.*` (verse, bolt, censer, gnaw, dive, held, requiem) | Saint Gnaw | `spell.poison.*`, `melee.swing` |
| `lf.boss.maw.*` (breach, ram, fry, flop, whirl, inhale, heave) | Sluicemaw | `spell.ice.impact`, `melee.hit` |
| `lf.boss.widow.*` (line, dust, devour, swoop, snuff, call, cocoon, scream) | the Widow | `spell.shadow.*` |
| `lf.boss.bell.*` (toll, clapper, knell, brood, pendulum, shake, greatflip, final) | the Bellfather | `status.stun.apply`, `melee.hit` |
| `lf.boss.vane.*` (spear, sweep, downpour, step, lightning, pull, eye, dive, lastcloud) | Ossery Vane | `spell.lightning.*`, `spell.ice.*` |

Every telegraph sound starts at wind-up start and is panned by the source's screen x (sfx `play(id, { pan })`).
Telegraph sounds are in the `sfx` bus. **Music:** each boss has a pulse layer in the score (10 §10, `score.json`),
one step per phase and silence when the Rain stops; there are no per-boss ambience loops.

---

## 27. Data format

File names and field shapes are **10's** (R4): `enemies.json` (10 §5.10), `bosses.json` (10 §5.11, minibosses in the
same file with `miniboss: true`), `elite-mods.json` and `spawn-tables.json` (10 §5.0 manifest). **The values stay on
this page**: stat and resist rows (§9–16), attacks and telegraphs (entries), poise (§5.1), spawn tables (§7.3), elite
modifiers (§17), boss phases, attack tables, void zones and camzones (§18–24). Resist values are percent with `heal`
allowed (§1); attack ids are the snake_case of the attack names here; the damage type key is `physical`. The v1 JSON
examples are in Parked (v2) (moved to 10).

---

## 28. Tests and tools

10 §9 names the files; this page says what they must check.

| Check | What it asserts |
|---|---|
| enemy data (node) | exactly the 30 ids of 00 §10; every field present; every drop table exists in 08 §14; every sfx id exists or has a fallback; every resist key is one of the 7 flames, each value in −100…+100 or `heal`; every attack that can deal ≥ 5% player max HP (per §2.1 for its act) has a telegraph with `windup ≥ 250` and a colour; no grab holds longer than 1.5 s; no attack asks for mashing |
| enemy balance (node) | for each enemy: time-to-kill at its act's DPS and hit-% of player HP fall inside its tier band (§2.2) ±30% |
| boss data (node) | phase thresholds cover 1 → 0 with no gaps (Ossery: 1 → 0.10 then the choice; Tallow's campaign table has 2 phases and her full table 3); **≤ 7 distinct attacks per boss (Tallow ≤ 5 without P3), Ossery ≤ 9**; every boss has ≥ 1 void zone; every zone has warm-up ≥ 500 and a rim colour; every big attack ≥ 700 ms on Lamplighter; every boss has a camzone; bosses immune to ≤ 2 flames; no "drowned" rows |
| AI budget (Playwright) | spawn 40 thinking monsters + 3 swarms in a benchmark room; AI think time ≤ 1.2 ms/step p95 over 10 s; no monster skips > 2 thinks in a row |
| spawning (Playwright) | every placed monster exists on the room's first frame; hatches and ambushes play their sound ≥ 500 ms before the first body; nothing spawns in view |
| lures, traps, panic (node) | a thrown light within 120 cells moves an idle monster for 4 s; the Unlit move away from it; a trap kill writes a Ledger record with source "The Hollow"; a burning monster touching another gives it 1 burn stack per second |
| dark telegraphs (Playwright) | ambient at the 0.08 floor, trigger each boss attack via a debug hook, screenshot: the telegraph pixels and band rims must be above a luminance threshold (the readable-danger rule) |
| per boss (Playwright) | a scripted bot (debug god mode) walks each boss through all phases via `window.lanternfall.debug.setBossHp()`; asserts transitions fire, the camera cuts (never zooms), zones spawn and clear, loot drops; Ossery's P3 end hands off to `cs_rain_stops` and P4 freezes at 10% |
| `tools/sim-bestiary.mjs` | headless: for each enemy × player level, simulated fights with the reference wick loadouts from 03; prints TTK, damage taken, and flags outliers (the "1.5× median" rule of the verdict, applied to monsters) |

Debug hooks (behind `?debug=1`, 10 §11.6): `spawn(id, x, y, {elite: [...mods]})`, `setBossHp(fraction)`,
`freezeAI()`, `showSenses()` (draws sight cones, hearing rings, flow field arrows, lures), `showTokens()`.

---

## 29. Build order and cheaper fallbacks

**Build order:** the milestone plan is REVIEW §d (M6 builds the AI core with 3 test monsters, the telegraph and
void-zone system and the lure rule; each act's content milestone adds its roster, miniboss and boss). Start with
`wax_mite` (crawler swarm), `dripling` (walker + lob + zone) and `soot_pigeon` (flyer).

| Expensive thing | Why | Cheaper fallback |
|---|---|---|
| Mother Tallow's body as real wax cells melting | a 56×88 cell body in the sim | draw her from part rigs (06 §25); spawn `molten_wax` cells from her base on each 5% HP step; shrink the rig with a clip rect |
| Swarm ribbons (Saint Gnaw: 20–40 rats) | many bodies | a ribbon is **one** AI object drawing N sprites along a path with jitter; only the ribbon collides |
| The Sluicemaw's reservoir flood/drain | 440×180 cells of water | already the plan: **height-field water** (06 §8.9), only the surface band, waterfalls and splashes are cells |
| Burrowing (none of the 30 ship monsters burrows through open ground; rootgnarl digs root wood) | many cell edits | dig on a coarser 2×2 grid; cap 60 cells changed per step |
| Web canopy (Widow) as burnable cells | many flammable cells | web in 4×4 tiles, each tile burns as a unit |
| The Bellfather's gravity bands | many bodies changing gravity | gravity is per-band, not per-cell (06 §10.7): each body reads its band's sign once per step |
| Negative light (the Unlit, the Widow's Swoop) | light-map subtraction | a dark sprite multiplied over the light map |
| 40 thinking monsters | CPU | lower cap to 24 on devices that fail the perf spec (10's auto quality) |

---
## 30. Applied in v2 (v2 changes)

**The v1 "Proposed canon changes", as v2 decided them:**

1. The bell-cult is **the Knell** (`knell_*`) — adopted in 00 §10; 4 Knell ship (R7).
2. Difficulty ids are **`wicklit` / `lamplighter` / `lampless`** + Iron Wick; the table is 02 §10.1 (R15). `drowned` parked.
3. Area levels per act 1–5 / 5–10 / 10–15 / 15–20 / 20–25 / 25–30 — kept (§2.1).
4. Minibosses: **3** ship — the Sewer-King, **the Drowned Lockmaster** (renamed; no clash with Cantor Ebb), the
   Lamp-Eater Matriarch; the Wickwright, the Carillon and the Rootwarden are parked (R7).
5. Ossery's Plea and the `mercy` counter are **deleted**: at 10% the fight freezes into 01 §11.2's choice; sparing or
   knocking out Knell counts toward the Kindling flag `knell_spared` (R2).
6. The Widow's entry snuff never counts against the Moth Oracle unlock — adopted (R29; 04 owns the challenge).
7. Status names: 03 §4 owns every status and number (R20). `wet` → `soaked`; `marked`, `gnawed`, `plague`,
   `webbed`, `oiled` are no longer statuses (the Echo Bat's ping is an AI effect, plague water applies `corrode`,
   oil on a body is a physics flag, the rest are parked).

**Every change on this page, with its finding:**

- **R7** roster = 00 §10's 30 ids; spawn tables (§7.3) re-weighted; Knell = novice, hookman (Act 2+), lampbreaker
  (Act 3+), maulbearer (Act 5+); Unlit = creeper, hound, stalker, wickthief; 21 monsters, 6 elite modifiers and
  3 minibosses parked.
- **R7** minibosses: Sewer-King kept (+ the grate drop taught as a trap kill), §18.3 renamed **The Drowned
  Lockmaster** (`mb_lockmaster`), Lamp-Eater Matriarch kept; drops = relic (08 §7) + pennies, the Sewer-King pennies
  + a rare chest; no keys (no 09 edge needs one).
- **R42** Tallow: campaign = P1 + P2, **1,500 HP**, no grab, no Last Pour, Wax Tide telegraph **1,800 ms**; P3
  labelled "Lampless and Boss Rush only" (full version 2,400 HP).
- **R41** Widow P3: no healing from beam/ring/rune; **+25% from bolt and lob**. Ossery: Rain Mantle **40%**, dropped
  for **5 s** by any Ember/Rime/Shade counter-hit; wick-steal replaced by "copies your selected flame's colour (and
  element) for his next attack". Bellfather: wide view + vertical follow; every band's state on screen ≥ 700 ms.
- **R1, R2** Ossery: P1–P3 in arena `a6_storm_eye` at `a6_n06`; §24.8 is the hand-off to `cs_rain_stops` (01) and the
  Falling Flood chain (09), no in-arena cinematic; P4 at `a6_n09` The Dry Eye; Plea and death branch deleted, 10%
  freezes into the choice. "The Warden's Loom" as a place name → the Storm's Eye (the Loom stays as the object).
- **R2** Knell surrender: sparing or knocking out counts toward `knell_spared`; no `mercy` counter.
- **R20** §5 lists only AI reactions to statuses, numbers link to 03; `wet` → `soaked`; `steadfast` defined.
- **R21** resist tables in percent, `weak2` (−100) and `heal` allowed; `IMM` → +100; bosses immune to ≤ 2 flames.
- **R22** boss "Lines" sections replaced by line ids from 01 §6.5 (`bl_*`); voices link 01 §6.4. v1 text parked.
- **R15** §2.4 links 02's table; keeps only boss notes (Tallow P3 on `lampless`); `drowned` and every "Drowned only"
  row parked.
- **R43** Floodgate: area level = player level + floor(wave / 5); roster from acts reached.
- **R46** the Unlit and Moth Oracle references use tiers: Unlit see the player at full range only in `dark`, else 24
  cells; `lightBurn` in `lit`; dissolve after 3 s in `bright`; path cost ×8 through `lit`. Rats avoid `lit` once the
  Gutter Lamp is relit. The Widow's dark-heal reads the `dark` tier.
- **R51, B5, B12** new §6.2: traps hurt monsters (trap kills: +50% XP, Ledger "The Hollow"); the lure rule; burning
  panic. New AI states `lured` and `panic` (§3.1).
- **R72, R89** transitions cut to wide view (never zoom); per-boss **camzone** column and table.
- **R73** grabs end in 1.5 s, dodge / Ember / pole frees early, no mashing (Fatberg Engulf, Widow Cocoon, Sluicemaw
  Swallow, Hailstone freeze); Tallow Embrace parked.
- **R83, R86** §6 soft separation between enemies, no body-blocking of the player; §7 enemies placed at room load,
  only hatches and ambushes spawn later with a 500 ms sound; the Unlit and `mod_relentless` follow through exits by
  06 §19.5.
- **B1** §2.3 Act 1 grace: wind-ups ×1.25, 1 melee token, every difficulty.
- **Attack budget**: ≤ 7 distinct attacks per boss (Tallow 5 in the campaign + 2 in P3), Ossery ≤ 9; every boss keeps
  ≥ 1 void zone; the cut attacks are parked. Tallow's P3 gains *Gutter Rush* (new) because both old P3 extras
  (Embrace, Last Pour) are parked; Gnaw's Hymn-Lung weak point now always glows (the `choir_score` item is parked).
- §17 elite modifiers: the 8 of 00 §10; `mod_ironhide` is `steadfast`.
- §18.6 Rootwarden's "lever route" line parked with the Rootwarden.
- Music: "each boss has a pulse layer in the score (10)"; per-boss ambience beds removed; sfx ids stay (trimmed to
  ship attacks; `lf.enemy.hatch` and `lf.boss.tallow.rush` added).
- §27 data format → link 10 (R4); values stay here; v1 JSON parked.
- Engine facts: damage type `physical` (as `js/rpg/damage.js`); armour steps = ×10 armour in 03's formula; only the
  36 built materials (no `flesh`, `tar` or `fog` cells: corpses are bodies, tar → `oil`, fog → zones); big water is
  height-field water (06 §8.9); gravity lanterns → gravity bands (06 §10.7).
- Monster drops = the act table (08 §14) + pennies; material extras only `scrap` and `lamp_oil` (R32; v1 monster
  materials and strand drops parked, 09 owns strand sources, R27).

---
## Parked (v2)

Everything cut from v1 is kept here as it was written, grouped by subject. Each block names the finding that cut it and what (if anything) replaced it. Bring the list up when the ship scope is done (00 §17, REVIEW §c).

### Parked by R7: 21 regular monsters

Replaced by: the 30-monster roster of 00 §10 (spawn weights redistributed in §7.3). The v1 act tables had these rows (Normal = today's `lamplighter`; `IMM`/`HEAL` = today's +100/`heal`):

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role |
|---|---|---|---|---|---|---|---|---|


| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `waxwing` | Waxwing Moth | 5×4 | 8 | 4 | 70 air | flyer | fodder | swarm |
| `lamp_mimic` | Lamp Mimic | 8×24 | 60 | 18 | 30 | ceiling (a post) | standard | ambusher |
| `chandler_husk` | Chandler Husk | 10×16 | 120 | 20 | 32 | walker | heavy | rusher |
| `waxwing` | -100 | 0 | 0 | 0 | 0 | 0 | 0 | flammable, drawn to light |
| `lamp_mimic` | +50 | 0 | -50 | 0 | 0 | 0 | 0 | armoured (2), metal |
| `chandler_husk` | -25 | +25 | 0 | -25 | 0 | 0 | 0 | armoured (3, wax crust), wax |
| `bloat_leech` | Bloat Leech | 8×5 | 35 | 6/s latch | 25 | ceiling | standard | ambusher |
| `pipe_worm` | Pipe Worm | 4×20 (5 segments) | 70 | 14 | 55 in dirt | burrower | standard | ambusher |
| `rat_king` | Rat King | 16×12 | 180 | 18 | 40 | walker | heavy | rusher |
| `bloat_leech` | -25 | -25 | -50 | +50 | 0 | 0 | 0 | swims, floats when dead |
| `pipe_worm` | 0 | -25 | 0 | 0 | 0 | +25 | 0 | digs |
| `rat_king` | 0 | 0 | -25 | +50 | 0 | 0 | 0 | swims, smell, splits |
| `bloat_toad` | Bloat Toad | 12×9 | 80 | 16 | 50 (hop 140) | walker | standard | rusher |
| `kelpwraith` | Kelpwraith | 6×30 | 90 | 12/s grab | 0 (anchored) | ceiling (rooted in floor of water) | standard | ambusher |
| `gate_warden` | Sluice Gate Warden | 16×20 | 320 | 30 | 30 | walker | heavy | rusher |
| `bloat_toad` | 0 | -25 | -25 | +25 | 0 | HEAL (swells) | 0 | swims, floats |
| `kelpwraith` | -75 | 0 | -25 | 0 | 0 | +50 | 0 | flammable when drained |
| `gate_warden` | +25 | 0 | -50 | -25 | 0 | IMM | 0 | armoured (5), construct, metal |
| `blackwater_angler` | Blackwater Angler | 20×12 | 220 | 30 | 100 swim | swimmer | heavy | ambusher |
| `silkling` | Silkling | 8×6 | 35 | 10 | 75 | ceiling | fodder | swarm |
| `hollow_lamplighter` | Hollow Lamplighter | 6×12 | 130 | 20 | 60 | walker | standard | ranged |
| `tarbody` | Tarbody | 20×10 | 300 | 28 | 22 | crawler | heavy | rusher |
| `blackwater_angler` | +50 in water | -25 | -50 | 0 | -25 | +50 | +25 | swimmer |
| `silkling` | -75 | 0 | 0 | 0 | 0 | 0 | +25 | web |
| `hollow_lamplighter` | 0 | 0 | 0 | 0 | -50 | 0 | +75 | undead |
| `tarbody` | -50 (ignites, see entry) | +50 | 0 | -25 | 0 | +25 | 0 | sticky, oil |
| `rope_ringer` | Rope-Ringer | 7×12 | 110 | 22 | 90 on ropes | rope_climber | standard | support |
| `tollworm` | Tollworm | 5×28 (7 segments) | 240 | 30 | 70 in rubble | burrower | heavy | ambusher |
| `rope_ringer` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `tollworm` | 0 | -25 | 0 | 0 | 0 | 0 | +25 | digs, armoured head (3) |
| `cloud_bloat` | Cloud Bloat | 18×16 | 300 | 20 | 25 air | flyer | heavy | support |
| `vane_herald` | Vane Herald | 7×13 | 260 | 30 | 60 | walker | standard | ranged |
| `cloud_bloat` | -25 | 0 | -50 | +50 | 0 | 0 | 0 | floats, fog |
| `vane_herald` | 0 | 0 | 0 | 0 | 0 | +50 | -25 | armoured (3) |

#### 9.4 Waxwing Moth (`waxwing`) — Act 1, 4 (Endless all)
- **AI:** drawn to **the brightest light within 160 cells** (usually your lantern). `idle` → flutters around
  lamps → `attack` flocks of 3–6 bump into you → when a spell light brighter than your lantern appears (a
  lingering ember, a gleam ring) the whole flock switches to it for 2 s (so you can bait them into fire).
- **Attacks:** *Flutter* — contact; telegraph: wings go bright for **250 ms**; 4 dmg. *Dusting* — on death it
  leaves a puff of moth dust that reduces your light radius by 20% for 2 s (stacks 3).
- **Physics:** burns instantly (ember -100); rain knocks it down; a drowned moth is gone.
- **Drops:** `lt_act1_fodder`; 15% `moth_dust`.
- **Look:** 5×4, dusty tan wings (`#b8a67c`), eye-spots on the wings that glow **faint gold** `#ffe6b0`; eyes
  1 cell gold.
- **Voice:** `babble` (fluttering whisper, very high pitch, volume 0.3).

#### 9.6 Lamp Mimic (`lamp_mimic`) — Act 1, 2, 4
- **AI:** looks like a dead street lamp (a post). `idle` (inert, eyes dark — the **only** exception to lit eyes is
  that its eyes are the lamp glass, which glows a faint **sickly green** `#7dff9a` when the player is within
  60 cells: the tell) → player within 24 cells → `attack`: the lamp head drops on a chain → after 3 attacks
  it uproots and hops (30 cells/s) → `idle` again if the player leaves 200 cells.
- **Attacks:**
  - *Lamp Drop* — lamp glass goes green-bright and the chain rattles (`lf.enemy.chain`), **650 ms**; the head
    drops straight down 24 cells; 18 dmg, stagger player.
  - *Swing* — chain glows bone white **500 ms**; the head swings in a 40-cell arc; 14 dmg.
- **Physics:** metal: electrified water conducts through it; immune to falling-cell stagger; bile corrodes
  armour. Sparking it (spark -50) makes it flash and stun itself 1 s.
- **Drops:** `lt_act1_standard`; 50% `scrap` ×2; 25% `spark_coil`; 3–6 pennies.
- **Look:** an iron lamp post 8×24, flaking black paint `#1d2126`, rust `#6b3b22`; lamp head a 6×6 cage of
  green-tinted glass.
- **Voice:** none; creak sfx.

#### 9.7 Chandler Husk (`chandler_husk`) — Act 1 (Endless all)
- **AI:** a dead chandler encased in wax armour. `patrol` slowly → `alert` sight 120 → `attack`: walks at you,
  *Ladle Slam* at melee, *Wax Hurl* at 50–140 → `flee` never. When its crust is broken (armour 0 from bile, or
  3 pole hits on the back) it becomes `exposed`: −30% HP of damage resisted, +40% speed, attacks faster.
- **Attacks:**
  - *Ladle Slam* — raises a huge ladle, ladle rim glows amber, **800 ms**; slams in front (24×12 area); 20 dmg;
    splashes 3 molten-wax pools (`vz_molten_wax_small`).
  - *Wax Hurl* — ladle glows, **700 ms**; throws a wax bolus (lob); 14 dmg; bolus sticks to walls and hardens
    into a 6×6 ledge (it builds terrain you can use).
- **Physics:** heavy: does not float (sinks), walks the bottom; wax crust melts under ember (armour −1 per 2 s
  burning); crushed only by 60+ cells.
- **Drops:** `lt_act1_heavy`; 100% `wax_lump` ×2; 10% an extra `fine` weapon roll (charm strands only drop
  from Act 2, since Charms unlock there); 6–10 pennies.
- **Look:** a hunched person-shape 10×16 in thick yellow-cream wax (`#e6d9a8`), the ladle copper `#b87333`,
  a face visible under the wax like a shadow; eyes 2 cells **amber**, and a small candle stuck in its
  shoulder (radius 16 light).
- **Voice:** Lingo `enemy_opener` with tag `undead` (formant, role `undead`, pitch low), muffled by a low-pass (voice-lab fx `muffle`).

#### 10.3 Bloat Leech (`bloat_leech`) — Acts 2–3
- **AI:** hangs on sewer ceilings (ceiling type) or floats in water. `idle` → player passes beneath within
  ±8 cells → `attack`: drops; on contact **latches** onto the player → if it misses, it inches toward the
  player (25) or swims (60) → `flee` never.
- **Attacks:** *Latch* — body swells and its mouth ring glows **red** (grab) **400 ms** before dropping; on hit
  it attaches: 6 dmg/s and heals itself for the same, and slows the player 20%, until removed by: pole hit,
  any ember damage, jumping into water and back out (it lets go in water after 1 s), or 4 s passing.
- **Physics:** spark in water it is in = double damage; ember makes it pop off (immediately detaches).
  Swollen leeches (latched ≥ 3 s) **burst** on death: 2-cell blood splash, nothing else.
- **Drops:** `lt_act2_standard`; 20% `gutter_fat`; 1–3 pennies.
- **Look:** 8×5 glossy black-green slug (`#1f2a22`, sheen `#3e5a45`), the mouth ring pale pink; eyes 2×1
  cells **pale red**.
- **Voice:** none (wet sucking sfx).

#### 10.5 Pipe Worm (`pipe_worm`) — Acts 2–3, 5 (Endless all)
- **AI:** burrower in dirt, sludge-silt and brick. `idle` underground (a faint rumble and a line of trembling
  cells in the terrain marks where it is — the lit tell is **two amber eye dots** moving through the ground,
  drawn through the terrain) → player within 120 cells → `attack`: follows under the player, erupts → dives
  back → surfaces again 2–3 s later.
- **Attacks:**
  - *Erupt* — the ground above it cracks and glows **amber** in a 10-cell circle for **700 ms**; bursts up; 14
    dmg + knockup 60; it stays out 1.2 s (punish).
  - *Silt Spit* — while surfaced, mouth glows, **400 ms**; spits a silt glob (bolt, 180 cells/s), 8 dmg,
    leaves a 3×3 patch of silt (sticky: −30% speed).
- **Physics:** digs tunnels (air cells) as it moves — it can open shortcuts **and** collapse ledges you stand
  on. Cannot pass stone/metal, so stone floors are safe. Rime freezes the dirt it is in (it is stuck 2 s).
  Tide floods its tunnels: it surfaces and flops.
- **Drops:** `lt_act2_standard`; 20% `drowned_bone`; 2–5 pennies.
- **Look:** 4 cells thick, 5 ring segments of mud-pink `#8a5a5a` with brass-coloured bristles; eyes 2 cells amber.
- **Voice:** none; rumble sfx `lf.enemy.burrow` loops while it moves (panned — the audio tell).

#### 10.7 Rat King (`rat_king`) — Act 2 (Endless all)
- **AI:** seven rats knotted by their tails into one body. `idle` → `alert` sight 120 → `attack`: shambles
  at you, *Tangle Slam*, *Squall* → at 50% and 25% HP it **sheds** 2 rats that become `gutter_rat` swarm
  members → on death splits into 4 rats.
- **Attacks:**
  - *Tangle Slam* — the whole knot rears up, eyes all turn bone white **650 ms**; slams 20×10 in front; 18 dmg.
  - *Squall* — mouths open, **900 ms**, all red eyes pulse; screams: 60-cell ring that knocks the player back
    and alerts every rat in the room.
- **Physics:** swims. Electrified water hurts it but also the rats it sheds.
- **Drops:** `lt_act2_heavy`; 100% `rat_tail` ×2; 5% `strand_charm_split`; 6–10 pennies.
- **Look:** 16×12 writhing mound of brown rats (animated as 7 sub-sprites), tails braided in the middle
  `#b07a7a`; 14 eye cells **red**.
- **Voice:** `babble` chorus (7 layered squeaks, one voice seed each).

#### 11.3 Bloat Toad (`bloat_toad`) — Act 3 (Endless all)
- **AI:** `idle` sitting at the waterline → `alert` sight 110 → `attack`: hops at the player; *Tongue* at range;
  if standing in water it *Gulps* to swell → never flees; on death it **bursts**.
- **Attacks:**
  - *Tongue* — throat glows pink **450 ms**; a tongue line to 70 cells; 10 dmg and pulls the player 30 cells in.
  - *Belly Flop* — crouches, underside glows bone white **600 ms**; hops 60 cells and lands; 16 dmg in 20×6.
  - *Gulp* — in water, swells over 1 s (+40 HP, +2 cells size). A swollen toad's burst (below) is bigger.
- **Physics:** tide heals it (it swells). On death it bursts into **water cells** (40, or 120 if swollen) — this
  can flood a dry pit, fill a basin for a puzzle, or put out a fire. Rime on a swollen toad freezes it into
  an **ice block** that stays as terrain for 20 s (a stepping stone).
- **Drops:** `lt_act3_standard`; 30% `gutter_fat`; 2–5 pennies.
- **Look:** 12×9 warty olive toad (`#5e6b3a`, belly `#a8a36a`); throat sac glows faint pink when it gulps;
  eyes 2 cells **gold**.
- **Voice:** `babble` (deep croak preset).

#### 11.5 Kelpwraith (`kelpwraith`) — Acts 3–4
- **AI:** a rooted strand of drowned weed with a face. `idle` swaying (anchored to the bottom of a water body;
  in a drained room it hangs limp from the floor) → player within 40 cells → `attack`: grabs → never moves.
- **Attacks:** *Strangle* — its fronds glow **red** from root to tip **700 ms**; grabs within 40 cells, holds
  the player 2 s: 12 dmg/s, and pulls them underwater (breath runs down). Break with any hit ≥ 20 or ember.
- **Physics:** in a drained room it is dry weed: **flammable** (ember -75 → burns up in 2 s, lighting the
  room). Rime freezes it solid (breaks with one pole hit, instant kill).
- **Drops:** `lt_act3_standard`; 25% `drowned_bone`; 2–4 pennies.
- **Look:** 6×30 ribbon of dark kelp (`#223a2c`) with a pale face near the top (`#c7d3c4`); eyes 2 cells
  **teal** `#4fe3c1`; tiny bioluminescent specks along it (radius 6, teal).
- **Voice:** Lingo `combat_taunt` whispered (voice role `undead`, breath 0.9), rarely (20% on grab).

#### 11.7 Sluice Gate Warden (`gate_warden`) — Act 3 (Endless all)
- **AI:** a construct built out of an iron sluice gate on legs. `idle` blocking a channel → `alert` 120 →
  `attack`: advances, *Gate Slam*, *Floodwall* → never flees. Pushes water ahead of it as it walks (it is a wall).
- **Attacks:**
  - *Gate Slam* — its whole gate body tips forward, rivets glow bone white **900 ms**; slams 30×10; 30 dmg;
    knockdown.
  - *Floodwall* — the valve wheel on its chest spins and glows deep blue **1200 ms**; releases a wave of water
    along the floor (a real 60-cell wide wave of water cells, 12 cells tall) that knocks the player back and
    floods low ground. Cooldown 12 s.
- **Physics:** metal: spark -50, and electrified water through it stuns it 2 s; bile melts rivets (armour −1/tick,
  at 0 it collapses 3 s). Immune to tide. Its wreck is a gate you can use as a ledge.
- **Drops:** `lt_act3_heavy`; 100% `scrap` ×4; 40% `spark_coil`; 10–16 pennies.
- **Look:** 16×20 riveted iron plate (`#3b4248`, rust `#7a4228`), valve wheel brass; eyes: two round inspection
  ports that glow **blue** `#3f7bff`.
- **Voice:** none; groaning metal sfx.

#### 12.3 Blackwater Angler (`blackwater_angler`) — Acts 4, 6
- **AI:** a huge fish that fakes a lantern. Its lure is a **warm amber light** on a stalk, hung above the water
  surface where the player might think it is a lamp or an oil cache. `idle` deep, lure at the surface →
  player within 30 cells of the lure → `attack`: *Snap* up through the surface → back down → *Lure Swap*
  moves the lure elsewhere → `flee` never.
- **Attacks:**
  - *Rising Snap* — the tell is honest: the lure **flickers and turns red** `#ff3b30`, and a ring of bubbles
    rises in a 30-cell circle, **800 ms**; jaws rise out of the water in that circle; 30 dmg, drags the player
    under if they are within 10 cells of the jaws' centre (breath matters).
  - *Tail Wake* — underwater only, body glows faintly **1000 ms**; pushes a current 80 cells: pushes swimmers.
- **Physics:** freezing the surface (rime) traps it below; a Rising Snap into ice takes 60 dmg and stuns it
  3 s. Spark in its water body -50. Its lure, cut with any hit ≥ 30 (lure HP 30), becomes a **lootable
  lantern-light** item (08: `lure_bulb`, a light trinket).
- **Drops:** `lt_act4_heavy`; 50% `pike_scale` ×2; 20% `lure_bulb`; 5% pearls ×1; 10–18 pennies.
- **Look:** 20×12 black fish (`#0c1014`) with needle teeth (`#dcd6c0`); lure a 2×2 amber bulb (light radius
  30, amber `#ffb347`); eyes 2 cells **milky white** (tiny, lit).
- **Voice:** none; deep bubble sfx under the water.

#### 12.4 Silkling (`silkling`) — Act 4 (Endless all)
- **AI:** the Lampless Widow's young. Groups of 3–6 on ceilings. `idle` → player below within ±30 cells →
  `attack`: drop on silk lines, bite, climb back → spin webs between walls.
- **Attacks:**
  - *Silk Drop* — the silk line glints bone white **350 ms**; drops; 10 dmg.
  - *Web* — spins for 800 ms (body glows pale violet): creates 10×10 **web cells** (a material: slows
    anything inside 70%, blocks projectiles of `bolt` shape, **flammable**, and it absorbs light: a web patch
    darkens the cells behind it).
- **Physics:** webs are real cells: ember burns them (and anything nearby). Webs across a shaft can be
  **walked on** for 1 s before they tear.
- **Drops:** `lt_act4_fodder`; 30% `widow_silk`.
- **Look:** 8×6 pale spider (`#c9c1d6`) with a moth-fur body; eyes 6 tiny cells **violet** `#b25cff`.
- **Voice:** `babble` (clicks, high).

#### 12.5 Hollow Lamplighter (`hollow_lamplighter`) — Acts 4, 6
- **AI:** a dead member of the Lamplighters' Guild who kept working after dying, now with a **Shade lantern**
  (violet light that darkens). `patrol` between dead lamps it "tends" (it snuffs any lamp you lit on its
  route) → `alert` 180 → `attack` (ranged): keeps 120–200 cells, casts shade wicks → `flee` from gleam.
- **Attacks:**
  - *Shade Bolt* — its lantern flares violet **500 ms**; bolt 200 cells/s; 20 dmg shade (ignores armour) and
    `dimmed` on the player (your light radius −30% 4 s).
  - *Snuff* — lantern goes dark, a violet ring spreads from it, **900 ms**; a 60-cell ring (void zone
    `vz_snuff_ring`: ring 60 radius 6 thick, warm-up 900 ms, 1.5 s, 10 dps shade, rim violet `#b25cff`) that
    also **puts out every placed light** it touches (torches, lamps, lingering ember).
  - *Pole Sweep* — if the player is within 20: pole glows bone white **450 ms**; 14 dmg.
- **Physics:** normal walker; sinks; drowns (it is dead but still coughs — it takes 50% drowning damage).
- **Drops:** `lt_act4_standard`; 25% `unlit_ash`; 10% `strand_flame_shade` (only if Shade not owned yet;
  otherwise `strand_charm_*` roll 5%); 5–9 pennies.
- **Look:** a Guild uniform like the player's but ragged and grey-green (`#3a4640`), the pole lantern shows
  violet light (radius 36, `#b25cff`, and it **subtracts** light around its edge in the light buffer — the only
  enemy with a negative light); eyes 2 cells **violet**.
- **Voice:** Lingo `enemy_opener` with new tag `hollow_guild` (lines about the Guild, oil, "you're late"),
  voice role `undead`.

#### 12.6 Tarbody (`tarbody`) — Act 4 (Endless all)
- **AI:** a living heap of pitch and oil sludge. `patrol` slowly → `alert` 100 → `attack`: rolls over the
  player, spits tar → never flees.
- **Attacks:**
  - *Tar Spit* — mouth-crack glows **dull amber** **600 ms**; lob 12 dmg; leaves a 6×2 **tar** patch (sticky:
    −60% speed and no jumping while inside; flammable).
  - *Roll Over* — body tips forward and every crack glows **red** (it is a grab) **900 ms**; rolls 40 cells;
    28 dmg, and the player is stuck 1 s.
- **Physics / trick:** ember **ignites** it: it burns for 8 s, takes 20 dmg/s, but its attacks set everything
  alight and its tar patches become burning void pools. Rime makes it **brittle** (armour 0, falls to pieces
  on a 40-dmg hit). Floats.
- **Drops:** `lt_act4_heavy`; 100% `lamp_oil` ×2; 50% `gutter_fat`; 10–16 pennies.
- **Look:** 20×10 glistening black mound (`#0d0b09` with oil sheen), pebbles and bones sticking out; eyes 4
  cells **amber**, deep in the tar.
- **Voice:** none; sucking sfx.

#### 13.4 Rope-Ringer (`rope_ringer`) — Acts 5–6
- **AI:** a hooded, long-armed creature that lives on the bell-ropes. rope_climber. `patrol` hanging on ropes
  → `alert` 160 → `attack` (support): climbs to the nearest bell-rope and **rings a bell** (map-authored bells)
  → if the player reaches its rope, it swings away and kicks → `flee` up the rope at 30%.
- **Attacks / abilities:**
  - *Ring the Bell* — pulls a bell-rope: the rope glows **bronze** and the bell above lights **1200 ms**; the
    bell tolls: a room-wide effect set by the bell (07): shakes loose cracked ceiling cells in the bell's
    **lit shake zone** (its footprint on the floor below is drawn with a bronze rim), or flips a gravity band
    if the bell is a gravity bell. Cooldown 14 s.
  - *Swing Kick* — body glows bone white **500 ms**; swings on its rope, 22 dmg + knockback 140 (off ledges!).
- **Physics:** cutting its rope (ember burns ropes; any `arc` shape cuts) drops it (fall damage) and it
  becomes a slow walker.
- **Drops:** `lt_act5_standard`; 30% `bell_bronze`; 15% `cult_ribbon`; 4–8 pennies.
- **Look:** 7×12 with arms to its knees, sackcloth hood (`#4d4538`), bare grey hands; eyes 2 cells **bronze**.
- **Voice:** `babble` (low hum-chant).

#### 13.5 Tollworm (`tollworm`) — Act 5 (Endless all)
- **AI:** a giant burrower that lives in rubble piles. It is drawn by **bell tolls**: every toll (noise 400)
  within 400 cells brings it to that spot. `idle` asleep → toll / heavy noise → `attack`: surfaces near the
  sound, *Breach*, *Grind* → dives.
- **Attacks:**
  - *Breach* — the ground glows **amber** in a 16-cell circle and the rubble shivers **900 ms**; breaches; 30
    dmg; knocks the player up 80.
  - *Grind* — while surfaced, its ringed mouth glows **red** **700 ms**; swallow-grab within 14 cells: 12 dmg/s for
    2 s, then spits the player out 60 cells.
- **Physics:** digs tunnels; cannot pass bronze or stone; a bell dropped on it (bells can be cut down, 07) deals
  200 phys. Rime on its surfaced head freezes it in place 3 s.
- **Drops:** `lt_act5_heavy`; 50% `drowned_bone` ×2; 20% `bell_bronze`; 12–20 pennies.
- **Look:** 5 cells thick, 7 segments of grey-brown hide (`#5f574b`) with bronze bell-shaped head plates;
  eyes 2 cells **amber**.
- **Voice:** none; rumble sfx with a bell ring layered on surfacing.

#### 14.4 Cloud Bloat (`cloud_bloat`) — Act 6
- **AI:** a floating bag of fog. `patrol` drifting → `alert` 140 → `attack` (support): hides allies in fog,
  *Hail Pellets*; when hit it vents → on death bursts into a large fog cloud.
- **Attacks / abilities:**
  - *Fog Vent* — body swells, glows pale grey **800 ms**; releases 40×30 cells of **fog** (fog cells: block
    sight, halve light radius; monsters inside get +30% dodge). Cooldown 10 s.
  - *Hail Pellets* — underside glows cyan **600 ms**; drops 8 hail pellets in a 30-cell area, 8 dmg each.
- **Physics:** ember burns off the fog (fog cells evaporate in fire). Spark -50 (it is a storm cloud). On death
  releases 80×60 fog + rain for 5 s. **After the Rain:** its fog is thin (half size, half duration).
- **Drops:** `lt_act6_heavy`; 100% `cloud_wisp` ×2; 10–15 pennies.
- **Look:** 18×16 grey cloud-sac (`#9aa3ab`) with veins of dark blue; eyes 3 cells **cyan** `#6fe3ff`.
- **Voice:** `babble` (low moan).

#### 14.5 Vane Herald (`vane_herald`) — Act 6
- **AI:** one of Ossery Vane's sworn servants (human, masked, robed in stitched raincloth). `patrol` → `alert`
  180 → `attack` (ranged): keeps 120–220 cells, *Call Lightning*, *Weather Ward* on allies → at 30% HP they
  do not flee: they **kneel and call a storm** (*Last Rite*).
- **Attacks / abilities:**
  - *Call Lightning* — raises a vane-staff, the staff tip glows white-yellow and a **target circle of 14 cells**
    lights on the ground at the player's feet **1000 ms**; lightning strikes it: 30 spark, and electrifies any
    water it touches.
  - *Weather Ward* — staff glows blue **800 ms**; one ally within 100 gets a rain barrier: absorbs 60 dmg, 8 s.
  - *Last Rite* — at 30% HP, kneels, **2000 ms** channel (a rising blue light column over it); if not
    interrupted: 4 lightning circles at random spots near the player (each with the normal 1000 ms telegraph).
- **Physics:** normal human; drowns; **After the Rain:** Call Lightning becomes *Dry Strike* (no water bonus).
- **Drops:** `lt_act6_standard`; 30% `cult_ribbon`; 10% `strand_charm_*`; 6–12 pennies.
- **Look:** 7×13 masked figure, raincloth robe in dark slate (`#2d3440`) with stitched silver weather sigils,
  a vane-staff topped with a spinning weathercock; eyes behind the mask 2 cells **cold white**.
- **Voice:** Lingo `enemy_opener` tag `cultist` + pack tag `herald` (lines about the sky, the Warden, the
  drought), voice role `priest`.

**The Unlit — Shroud and Deepmaw** (v1 §15.2 rows and §15.4 entries):

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role | lightBurn/s |
|---|---|---|---|---|---|---|---|---|---|
| `unlit_shroud` | Shroud | 16×16 | 150 | 12/s | 40 air | flyer | standard | support | 25 |
| `unlit_deepmaw` | Deepmaw | 20×12 (mouth in a wall) | 260 | 45 | 0 | ceiling (wall-bound) | heavy | ambusher | 5 |

| id | ember | rime | spark | bile | gleam | tide | shade | tags |
|---|---|---|---|---|---|---|---|---|
| `unlit_shroud` | -50 | 0 | -25 | 0 | -150 | 0 | HEAL | snuffs lights |
| `unlit_deepmaw` | 0 | +25 | 0 | 0 | -50 | 0 | IMM | — |

**Shroud (`unlit_shroud`)** — Acts 4–6
- **AI:** a drifting sheet of darkness. `attack` (support): drifts over **light sources** (torches, placed
  lamps, lingering spells, your lantern) and smothers them, making darkness for its pack.
- **Attacks:** *Smother* — drapes over a light: a pale rim contracts around the light **1000 ms**; the light is
  put out (placed lights destroyed; your lantern loses 15 oil and goes out for 2 s). If it smothers the
  player: 12 dmg/s while overlapping.
- **Physics:** fire burns holes in it (−50 ember); gleam (−150) shreds it.
- **Drops:** `lt_unlit`; 30% `moth_dust`.
- **Look:** 16×16 ragged cloth of darkness with a pale hem rim; eyes 2 cells pale in the middle.
- **Voice:** `babble` breath.

**Deepmaw (`unlit_deepmaw`)** — Acts 4–5 (placed only)
- **AI:** a mouth in a wall or floor of a dark shaft. `idle` (only its eyes, 6 of them, lit) → player within 40
  cells in darkness → `attack`: *Bite* → cannot move. Lighting its spot with ≥ 0.6 light for 3 s makes it
  withdraw (the wall closes) for 20 s.
- **Attacks:** *Bite* — the wall around it darkens and a pale ring of teeth appears **800 ms**; 45 dmg in a
  20×12 box. *Inhale* — pale rim streaks toward it **1000 ms**; pulls the player 40 cells toward it.
- **Drops:** `lt_unlit` as heavy; `unlit_ash` 3.
- **Look:** a black mouth-shape in the stone, 6 pale eyes above it.
- **Voice:** deep breath sfx.

v1 `sp_unlit` weights: unlit_creeper 30, unlit_hound (×3) 20, unlit_stalker 15, unlit_shroud 15, unlit_deepmaw 10 (placed), unlit_wickthief 10.

**The Knell — Cantor and Tollkeeper** (v1 §16.2 rows and §16.3 entries; the Tollkeeper's recall bell and the `lf_knell_order` intent go with it):

| id | Name | Size | HP | Dmg | Spd | Move | Tier | Role | Acts |
|---|---|---|---|---|---|---|---|---|---|
| `knell_cantor` | Knell Cantor | 6×13 | 90 | 14 | 55 | walker | standard | support | 4–6 |
| `knell_tollkeeper` | Tollkeeper | 7×14 | 260 | 26 | 60 | walker | heavy (leader) | support | 5–6 |

| id | ember | rime | spark | bile | gleam | tide | shade | Armour / tags |
|---|---|---|---|---|---|---|---|---|
| `knell_cantor` | 0 | 0 | -25 | 0 | 0 | 0 | +25 | human |
| `knell_tollkeeper` | +25 | +25 | 0 | -25 | +25 | 0 | 0 | human, armoured (3) |

**Knell Cantor (`knell_cantor`)**
- **AI:** support. Stays 100–160 cells back, sings. In Act 5 it also works **gravity lanterns** (flips a
  placed one near the player, 07).
- **Abilities:** *Knell-Song* — **1200 ms** channel (mouth and bell glow **pale bronze** `#d9a95a`; interruptible):
  all Knell within 120 get +25% damage and +25 poise for 8 s. *Toll Down* (Act 5) — **1000 ms**, bronze ring on
  the target lantern: flips it. *Dirge Bolt* — **600 ms**, bolt 180 cells/s, 14 shade dmg.
- **Look:** long grey robe with bronze bells sewn along the hem (they jingle as it walks: noise 30 — you can
  hear Cantors coming); eyes bronze.
- **Voice:** Lingo tags `cultist`,`knell`; voice role `priest`; the song is a babble-sung melody.

**Tollkeeper (`knell_tollkeeper`)**
- **AI:** the squad leader. Rings the **recall bell** on alert (§16.1). Stays in the middle of its squad. When it
  dies, every Knell in the room gets `shaken`: −25% damage and they flee at 50% HP instead of 25%.
- **Attacks:** *Hooked Bell* — a bell on a chain, glows bone white **600 ms**; swings a 40-cell arc, 26 dmg.
  *Command* — **800 ms** (raises its bell, bronze light): the nearest Knell's next attack comes instantly (no
  wind-up) — the only exception to telegraphs, and so the Command itself is the telegraph (the target Knell's
  eyes flash red for its whole 800 ms).
- **Look:** 7×14, grey robe over bronze scale, a big bell on a chain; eyes bronze, a bronze halo-bell badge
  that glows (radius 12).
- **Voice:** role `tactician`; Lingo tags `cultist`,`knell`; plus order barks (new intent `lf_knell_order`).

v1 Knell rule 2 (recall bell): "**Recall bell.** When one Knell enters `alert`, if a Tollkeeper is alive in the room it rings the recall bell: all Knell within 300 cells converge (noise 300, Knell only)." — and the §3.2 hearing row "a Knell Tollkeeper's recall bell | 300 (only Knell hear it as \"come here\")". v1 §4.3 ended "unless they are both Knell (the Knell use the recall bell, §16)".

v1 spawn tables (all six acts, before R7's re-weighting):

| Act | Table id | Entries (id: weight) |
|---|---|---|
| 1 | `sp_act1` | wax_mite 30, soot_pigeon 20, dripling 20, waxwing 15, tallow_hound 10, lamp_mimic 3 (placed only), chandler_husk 5 |
| 2 | `sp_act2` | gutter_rat (×6 swarm) 25, rat_chorister 10, bloat_leech 15, rope_scuttler 10, pipe_worm 10, fatberg 5, rat_king 5, knell_novice 15, knell_hookman 5 |
| 3 | `sp_act3` | maw_fry (×6) 20, sluice_eel 15, bloat_toad 15, sluice_crab 15, kelpwraith 8, drowned_lockkeeper 7, gate_warden 5, knell_novice 10, knell_lampbreaker 5 |
| 4 | `sp_act4` | oilback 15, lampeater 15, blackwater_angler 8, silkling 20, hollow_lamplighter 12, tarbody 6, knell_cantor 6, knell_maulbearer 6, knell_lampbreaker 12 (+ Unlit by §15.3) |
| 5 | `sp_act5` | clapperling 25, tumbler 15, bronze_sentinel 6, rope_ringer 12, echo_bat 15, tollworm 7, knell_cantor 8, knell_maulbearer 7, knell_tollkeeper 5 |
| 6 | `sp_act6` | rainwraith 15, rootgnarl 12, stormgull 18, cloud_bloat 10, vane_herald 12, hailstone_golem 5, knell_tollkeeper 5, echo_bat 8, lampeater 8, rope_ringer 7 |
| any | `sp_unlit` | unlit_creeper 30, unlit_hound (×3) 20, unlit_stalker 15, unlit_shroud 15, unlit_deepmaw 10 (placed), unlit_wickthief 10 |

v1 monster-specific drops (parked by R32 with crafting and by R27, which moved strand sources to 09): every entry listed extras such as `wax_lump`, `gutter_fat`, `soot_feather`, `rat_tail`, `cult_ribbon`, `drowned_bone`, `pike_scale`, `sluice_eel_skin`, `spark_coil`, `moth_dust`, `unlit_ash`, `bell_bronze`, `cloud_wisp`, `tumbler_core` (a one-use throwable gravity lantern), `lure_bulb`, `strand_charm_split` / `strand_charm_steady` / `strand_flame_shade` / `strand_charm_*` rolls, and "10% `fine`+ weapon" rolls; loot tables were per act and tier (`lt_act1_fodder` … `lt_act6_heavy`, `lt_actN_miniboss`, `lt_actN_boss`, `lt_cult`). Kept only: `scrap`, `lamp_oil`; tables per 08 §14. The v1 gutter-rat bite applied `gnawed` (−5% max HP for 5 s, stacks 3) at 20%.

### Parked by R7: 6 elite modifiers

Replaced by: the 8 modifiers of §17.

| id | Name | Aura | Effect | Not allowed on |
|---|---|---|---|---|
| `mod_haloed` | Haloed | gold | heals nearby allies 3% max HP/s within 60 cells; immune to gleam | Unlit |
| `mod_tidecaller` | Tidecaller | deep blue | every 8 s drops 60 water cells on the player's position (500 ms blue drip telegraph) | — |
| `mod_umbral` | Umbral | violet | light radius around it −60% (it drinks light); its attacks drain 5 oil | — |
| `mod_bellstruck` | Bellstruck | bronze | every hit it takes rings (noise 120); at 50% HP tolls: 40-cell stagger ring (700 ms bronze telegraph) | — |
| `mod_mirrored` | Mirrored | silver | reflects the first `bolt` wick every 5 s back at the caster (a silver flash on its body 150 ms before it reflects shows it is ready) | — |
| `mod_vampiric` | Leechborn | crimson | heals 25% of damage dealt; attacking it with bile stops the heal 4 s | — |

v1 rule: "champions never combine `mod_swift` + `mod_stormcalled`, nor `mod_ironhide` + `mod_mirrored` (too punishing)."

### Parked by R7: minibosses the Wickwright, the Carillon, the Rootwarden

Replaced by: no miniboss in Acts 1, 5 and 6. The Rootwarden's "lever route" (the Rain stopping mid-fight) goes with it (R1). v1 intro: "One per act, in a fixed arena on the act map (09 places them). Each guards the act's key (08 §12.2) and drops its relic (08 §7.2: 60% on first kill, 10% after). Minibosses use phases at 50% HP only, have one void zone each, and a soft enrage at 4 minutes (+25% damage, then +25% every 30 s). Loot table: `lt_actN_miniboss`. Each has a Lingo opener (`boss_opener` with its own tag) and a bespoke line."

#### 18.1 The Wickwright (`mb_wickwright`) — Act 1, the Dipping Hall
- **What:** a dead master chandler fused to his dipping frame: a 30×28 figure hanging from a rack of 12 candles
  on chains over two wax vats. **HP 900.** Walks along a ceiling rail (ceiling mover, 40 cells/s).
- **Arena:** 200×110 hall, two wax vats (void pools while molten) 40 wide each, three wooden platforms between.
- **Attacks:**
  - *Candle Rain* — the candles on his rack glow bright amber **900 ms**; 6 candles drop along his path (each a
    6×2 molten-wax pool on landing: `vz_molten_wax_small`), 12 dmg on direct hit.
  - *Dip* — he lowers the rack into a vat **1200 ms** (rack glows, vat bubbles); pulls up: flings 3 lobs of wax
    (14 dmg each) that harden into ledges.
  - *Snuffer* (at ≤ 50%) — his long snuffer glows **red** **800 ms**; grabs and "snuffs" the player: 20 dmg and
    your lantern is out for 3 s.
- **Void zone:** `vz_vat` — the vats, 40×10 each, always on while lit: 15 dps ember, rim amber. **Rime freezes
  a vat** for 12 s (it becomes floor).
- **Tricks:** ember on his chains melts them: each chain melted drops 2 candles (fewer Candle Rain candles);
  3 chains melted drop him to the floor for 6 s (+50% damage taken).
- **Phase at 50%:** the rack catches fire: Candle Rain comes every 6 s instead of 10.
- **Drops:** `lt_act1_miniboss` (`key_chapel`, `relic_mb_act1` The Wickwright's Snuffer).
- **Lines:** opener *"Hold still. You'll dip beautifully."*; phase *"More wax! More!"*; death *"...the wick... was never straight..."*
- **Look:** grey-brown leather apron, a face of cracked tallow, eyes 2 cells amber, 12 candle flames (radius 20 each).

#### 18.5 The Carillon (`mb_carillon`) — Act 5, the Belfry Crown
- **What:** a construct of 6 bells hung on a spinning iron frame (48×40), each bell a separate hit-box (HP 700
  each, **total 4200**). Stationary centre; its frame rotates.
- **Arena:** a round belfry 220×180, 4 gravity lanterns on the walls (07), cracked ceiling.
- **Attacks:** each bell rings in a **sequence** shown by its glow (the sequence is the telegraph: 400 ms per bell):
  - Low bells: *Ground Toll* — a 60-cell ring on the floor (bronze rim, 900 ms), 24 dmg.
  - High bells: *Gravity Toll* — flips gravity in a **band** 40 cells tall across the arena (band rim cyan-violet
    `#8a7bff` for **1000 ms**, then flipped for 4 s).
  - Cracked bell (the 6th): *Ceiling Toll* — the cracked ceiling above a marked zone glows bronze **1200 ms**,
    then falls (real falling cells, crush damage).
- **Void zone:** `vz_toll_band` — band full width × 12 tall, warm-up 800, 1.5 s, 14 dps (phys), rim bronze.
- **Tricks:** muting a bell (wax, tar or rime, see Clapperling) removes its attacks; flipped gravity lets you
  reach the high bells.
- **Phase at 50%:** frame spins twice as fast and plays 2 bells at once.
- **Drops:** `lt_act5_miniboss` (`key_bellwell`, `relic_mb_act5` Upturned Chime).
- **Lines:** none spoken; each bell has a pitch; the Narrator reads *"The Carillon plays for no congregation."*
- **Look:** green bronze bells, black iron frame; each bell's mouth has 2 bronze-gold eyes.

#### 18.6 The Rootwarden (`mb_rootwarden`) — Act 6, the Knotted Gate
- **What:** a knot of Cloudroot wood and storm (32×44) grown around a Guild gate. **HP 5200.** Stationary body,
  with 4 root arms (HP 600 each; destroying one removes its attacks).
- **Arena:** 240×200 vertical chamber inside the root, rain pouring from above (before the Rain stops), platforms
  of root wood.
- **Attacks:** *Root Spear* barrage (like Rootgnarl, 3 at once, 700 ms each); *Arm Sweep* — an arm glows pale
  green **900 ms**, sweeps a platform (30 dmg); *Stormheart* — its core glows white-yellow **1500 ms**: 5
  lightning circles (1000 ms each).
- **Void zone:** `vz_storm_sap` — pool on platforms 20×2, warm-up 600, 6 s, 12 dps spark, rim yellow.
- **Tricks:** its root wood burns — **but only after the Rain stops** (the story trigger may happen during this
  fight if the player takes the Rain-stop lever route; 09). Before that, ember on its core only stuns 1 s.
- **Phase at 50%:** all remaining arms regrow 300 HP once.
- **Drops:** `lt_act6_miniboss` (`key_cloudroot`, `relic_mb_act6` Rootwoven Band).
- **Lines:** opener (voice role `druid`, deep): *"The sky grows down. You will not climb it."*
- **Look:** pale grey-white root wood with glowing cloud veins, a Guild gate half-swallowed; eyes 2 cells pale green.

v1 Sewer-King drop line: "**Drops:** `lt_act2_miniboss` (`key_grate`, `relic_mb_act2` Sewer-King's Signet)."; v1 Lockmaster (then "Lockmaster Ebb") drop: "**Drops:** `lt_act3_miniboss` (`key_reservoir`, `relic_mb_act3` Floodgate Seal)."; Matriarch: "**Drops:** `lt_act4_miniboss` (`relic_mb_act4` Lamp-Eater's Lung, a `seal_shard`).".

### Parked by R15: the v1 four-step difficulty table and `drowned`

Replaced by: 02 §10.1 (`wicklit` / `lamplighter` / `lampless` + Iron Wick).

Four difficulty settings (names proposed in §30; 02-CONTROLS-UI.md owns the menu):

| id | Name | Enemy HP | Enemy damage | Enemy speed | Telegraph length | Attack tokens (§4) | Elite chance per pack | Notes |
|---|---|---|---|---|---|---|---|---|
| `lamplit` | Lamplit (story) | ×0.7 | ×0.6 | ×0.9 | ×1.3 | 1 melee / 2 ranged | 0% | bosses skip their enrage |
| `normal` | Lamplighter | ×1.0 | ×1.0 | ×1.0 | ×1.0 | 2 / 3 | 8% | the numbers on this page |
| `guttering` | Guttering | ×1.35 | ×1.3 | ×1.08 | ×0.9 | 3 / 4 | 18% | elites get 2 modifiers (champions) from act 2 |
| `drowned` | Drowned | ×1.8 | ×1.6 | ×1.15 | ×0.8 | 3 / 5 | 30% | one extra boss attack per phase (listed per boss as "Drowned only") |

Telegraph length never goes under **250 ms** on any difficulty for any attack. Void zones always keep their
full warm-up (the rim lights before the zone hurts, §8).

v1 reaction-time line: "`lamplit` adds 200 ms; `drowned` subtracts 100 ms (never below 150 ms)." v1 transition heal: "(Lamplit: 40%, Drowned: 0%)". v1 Unlit cap: "2 groups alive (Normal), 1 (Lamplit), 3 (Guttering / Drowned)". v1 Waves scaling: "area level rises by 1 … every 3 waves (Waves)" (replaced by R43).

#### "Drowned only" boss attacks (parked by R15 with the difficulty)

- **Mother Tallow:** P2 adds **Choir of Tapers**: 6 candles in the arena light one after another (400 ms each, amber) and fire a `bolt` of wax (12 dmg) at the player in that order.
- **Saint Gnaw:** P1 adds **Antiphon**: two ribbons from opposite lofts in mirror paths, 1400 ms.
- **The Sluicemaw:** P2's current doubles (120 cells/s), and Breach leaves a `vz_charged_water` for 2 s.
- **The Lampless Widow:** P1 *Silk Line* comes as 2 lines at once, 400 ms apart.
- **The Bellfather:** P2 *Pendulum* leaves a `vz_resonance` along its arc for 2 s.
- **Ossery Vane:** Each phase adds one: P1 Rain-Step cooldown 3 s; P2 Bind the Wick steals **two** wick slots; P3 Eye of the Storm casts two rings; P4 Falling Water from both sides at once.

### Parked by the boss attack budget (R7 ship scope, R42, R73, R41, R2): cut boss attacks

Replaced by: the ≤ 7 (Ossery ≤ 9) attacks per boss in §19–24. v1 rows as written:

**Mother Tallow** (R42: no grab and no Last Pour in the campaign; R73: no mashing — kept as data for later). Her P2 *Candle Children* is now the P2 form of *Hymn of Wax*.

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Candle Children** | she plucks candles from her hair (3 small flames rise and glow) | `lf.boss.tallow.children` | 1100 ms | — | 2 `dripling` (max 3 alive) |
| **Embrace** | she reaches, both arms glow **red** (grab), red rim pulse on her | `lf.boss.tallow.grab` | 900 ms | 18/s for 2 s | grab; mash to escape; she melts 2 rows while holding (her own heat) |
| **Last Pour** | she rears up, the entire floor edge glows amber at the level the wax will rise to (10 cells) | `lf.boss.tallow.pour` | 1800 ms | 20 dps while in it | she pours herself out: the floor fills with molten wax 10 cells deep for 5 s (`vz_tallow_flood`); stand on hardened wax, pews, galleries or chains. Every Last Pour costs her 5% HP. Used at 25% and 12% |
| Embrace | as P2 | | 800 ms | 20/s | |

**Void zone `vz_tallow_flood`:** `band` full arena width × 10 cells from the floor, warm-up 1800 ms (the telegraph),
5 s, 20 dps ember, slows 60%, rim **bright amber `#ffb347`**.

v1 Tallow table: HP 2400 for all difficulties; phases 100–66 / 66–33 / 33–0 on every difficulty; transition 1→2 "Camera zooms out 10%" (R72: now a cut).

**Saint Gnaw:**

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Verse: Ascension** | baton up; the ropes he names **flash red** at the base | `lf.boss.gnaw.verse` + chord 2 | 1400 ms | 10 per tick | a ribbon climbs 2 ropes to the top; if you're on one, jump to another |
| **Verse: The Round** | the ribbon's path lights as a **loop** around the arena (floor → wall → loft → rope) | `lf.boss.gnaw.round` + chord 3 | 1500 ms | 10/0.5 s | the ribbon circles for 6 s; its path passes through one rope anchor — that anchor flashes red (cut if it reaches it) |
| **Tolling Hymn** | his whole cope glows yellow, notes of light spin up | `lf.boss.gnaw.hymn` | 1500 ms (interruptible by 60 poise or spark) | — | all ribbons +40% speed/damage 8 s |
| **Tail Lash** | his tail glows bone white, 40-cell arc drawn | `lf.boss.gnaw.tail` | 700 ms | 28 | |

v1 weak point: "Normally the Lung glows only for the first 500 ms of the note (hard to read). **If the player has read `choir_score` (08 §12.3)**, the Lung glows for the whole 3 s, a small gold marker hangs over it, and the Narrator says *"The score marks the breath before the last verse."* on the first Held Note." (the `choir_score` item is parked with 08's quest items; the Lung now always glows). v1 plague water applied `plague`: 2% max HP/s (now `bile` cells and `corrode`).

**The Sluicemaw:**

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Undertow Sweep** | its tail glows pale blue under the water; a blue arrow band shows the current direction across the arena | `lf.boss.maw.sweep` | 1000 ms | 12 + current | flooded; current pushes swimmers 120 cells/s for 2 s |
| **Spout** | its head rises at the surface, mouth glows blue | `lf.boss.maw.spout` | 1100 ms | 24 | a column of water (tide) aimed at the catwalks: knocks the player off |
| **Thrash** | drained: its whole body glows bone white | `lf.boss.maw.thrash` | 1200 ms | 20 per hit, 3 hits | flops across the trench; get out of the trench or onto a pillar |

v1 Swallow: 50 on swallow, the player inside for 3 s (R73: now 1.5 s). v1 §21.13: "**Ferrywitch unlock** (00 §7): the game tracks the longest stretch out of water during this fight; ≤ 10 s passes." (the Ferrywitch is parked, R30).

**The Lampless Widow** (the `silkling` is parked with Brood Drop):

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Brood Drop** | 4 pale egg sacs glow in the canopy | `lf.boss.widow.brood` | 1200 ms | — | 4 `silkling` (max 8). Burning the canopy above them kills them before they drop |
| **Web Shot** | spinnerets glow pale white | `lf.boss.widow.web` | 700 ms | 10 + webbed | a bolt of web: webbed = cannot jump, −60% speed 2 s (ember burns it off at once) |
| **Shade Kiss** | she lands on a wall, abdomen glows violet | `lf.boss.widow.kiss` | 1100 ms | 12 dps | spits 3 `vz_shade_pool` at the player |
| **Eight-Leg Rush** | her 8 eyes flare, bone-white lines along the floor ahead of her (the path) | `lf.boss.widow.rush` | 800 ms | 40 | runs 160 cells across the floor or up a wall |
| Web Shot | as P2, 3 at once in a fan | | 700 ms | 12 | |

**Void zone `vz_shade_pool`:** `pool` 24×2, warm-up 800 ms, 6 s, 12 dps shade, **drains light**: your spells
in the pool do not leave afterglow; rim **violet `#b25cff`** — the pool is darker than darkness, rim is the
only thing drawn.

v1 P3 rule: "She hunts on the floor and walls (110 cells/s), and she **eats spell light**: any wick light within 60 cells of her is pulled into her (bolts curve toward her mouth: they still hit, but she heals 25% of the damage from any wick whose shape is `beam`, `ring` or `rune` — the lingering ones). Bolts, lobs and arcs are the answer." (R41: replaced by +25% from bolt and lob). v1 Cocoon: "wrapped: mash to escape; ember or an ally breaks it at once" (R73). v1 *Eat the Sconce* is now the one-sconce form of *Devour the Light*.

**The Bellfather:**

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Brass Rain** | his crown glows, bronze dots on the floor below the ceiling where shards will fall | `lf.boss.bell.brass` | 1100 ms | 14 each | 10 shards of broken bell-bronze fall (in each band's current gravity direction!) |
| **Chain Lash** | a chain glows, line drawn | `lf.boss.bell.chain` | 900 ms | 30 | lashes a ledge; breaks planks |
| **Cracked Toll** | the crack on his face glows bright bronze, a cone of bronze light (90°, 150 cells) points down (or up) the shaft | `lf.boss.bell.crack` | 1200 ms | 40 | a sound cone; stagger |
| **Rubble Shrug** | his top rim glows | `lf.boss.bell.shrug` | 1000 ms | crush | shakes loose a 60×10 slab above him that falls (in current gravity) |

v1 "What helps" row: "| **Bellringer** class toll | a Bellringer toll during his Toll wind-up **counters** it: the band does not flip and he staggers |" (the Bellringer is parked, R30). v1 arena note: "the camera follows the player vertically with a 270-cell view (so the player never sees the whole shaft)" (R41: wide view now).

**Ossery Vane** (R41 replaced Bind the Wick with the borrowed colour; R2 deleted the Plea; R1 moved the Rain stopping out of the arena):

| Attack | Telegraph | Audio id | Wind-up | Damage | Notes |
|---|---|---|---|---|---|
| **Cloudwall** | a vertical **pale grey rim** rectangle (8×80) lights on the platform | `lf.boss.vane.wall` | 1000 ms | 20 on spawn | a wall of cloud that blocks projectiles and movement for 6 s (fog cells; ember burns it away in 1 s) |
| **Bind the Wick** | his hand glows the colour of **your currently selected wick's flame**, a thin line of that colour from your lantern to him | `lf.boss.vane.bind` | 1500 ms | — | he **steals that wick** for 10 s (its slot is greyed out); he then casts it back at you twice (same shape, 1.2× damage, with the normal wick telegraph of that shape). Interrupt with 150 poise or by switching wick before it lands (the steal takes the wick selected at the end of the wind-up) |
| **Tide Lash** | staff glows deep blue, a wave line along the floor | `lf.boss.vane.tide` | 1000 ms | 30 + knockback 160 | toward the edge! |
| **Hailfall** | cyan dots on the platform, 12 of them | `lf.boss.vane.hail` | 1000 ms | 16 each | |
| **Bolt Barrage** | staff tip glows yellow | `lf.boss.vane.barrage` | 700 ms | 18 × 6 | 6 lightning bolts in a spread, 120 ms apart |
| **Bind the Wick** | as P2 | | 1400 ms | — | |
| **Dry Lightning** | staff glows white-yellow, a zig-zag line drawn from him to the player | `lf.boss.vane.dry` | 800 ms | 44 | no water bonus now |
| **Warden's Fury** | three quick sweeps, each with its own 400 ms bone-white arc | `lf.boss.vane.fury` | 3 × 400 ms | 30 each | combo |
| **Falling Water** | a waterfall edge near the player glows blue, the area it will sweep drawn | `lf.boss.vane.falls` | 1500 ms | 36 + pushes toward the edge | he bends one of the falling streams across the platform |
| **Plea** (at 10%) | he lowers the staff (no glow, no attack) | — | 3000 ms | — | a 3 s window where he speaks the plea line; hitting him ends it; waiting lets him finish (story flag for 01's ending) |

v1 Rain Mantle: "- **Rain Mantle (P1–P3):** while he stands in rain, he has a barrier that absorbs 60% of damage. The arena has **cover** (the Loom's shadow, the broken bell-canopy, root arches) where no rain falls. Lure him out of the rain, or remove the rain over him (below). Rain over him is visible as brighter streaks with a pale blue shimmer on his coat (the mantle's tell). - **Rain direction** is a variable he changes (`down`, `slant_left`, `slant_right`, `up` in P3). Rain direction also pushes the player: 20 cells/s sideways in slanted rain, and in P3 it affects your projectiles (bolts drift 10 cells/s). - **Ways to break the mantle over him:** Ember makes a 30-cell **steam umbrella** over the impact point for 4 s (rain becomes steam there: no mantle). Rime freezes a patch of rain into falling hail for 3 s (no mantle; hail hurts both of you, 4 dmg/s). Shade *drinks* the rain in a 20-cell radius for 3 s. Tide does nothing (it is rain)." and in P2 "While any Loom Thread is intact, he regenerates 0.5% HP/s and his mantle is 80%". v1 enrage: "In P1–P3 the mantle becomes 90% and permanent even under cover".

#### v1 §24.8 — the in-arena Rain Stops cinematic (parked by R1)

Replaced by: the hand-off to `cs_rain_stops` (01) and the Falling Flood chain (09), §24.8.

#### 24.8 Transition 3 → 4 (25%) — "The Rain Stops" — 8 s cinematic (control locked for 3 s, then kept)

This is the game's centre-piece moment (01 story beat, 06 render effect).

1. (0–1 s) He screams at the Loom; the cloud ceiling **tears open** — a strip of pale real sky, the first in forty years.
2. (1–3 s, control locked) The Rain **stops**. Every rain particle in the air falls one last time; the sound of rain
   (the ambience bed the player has heard the entire game) **cuts to silence**. The palette shifts warm (06).
3. (3–5 s) The three cloud-cisterns under the platform burst: **all the held water of the Cloudroot falls** past the
   platform into the Hollow — huge waterfalls on both platform edges (real water cells for the near ones; background
   shader for the far ones, §29 fallback).
4. (5–8 s) He falls to the platform, his Rain Mantle gone, his coat dry and grey. `boss_phase` bespoke: the last
   conversation starts (lines alternate with attacks).

#### v1 §24.11 — Death, and the `mercy` counter (parked by R2)

Replaced by: the freeze into 01 §11.2's choice at 10% (§24.11) and the Kindling flag `knell_spared` (§16.1).

#### 24.11 Death

He sits down on the edge of the broken platform, looking at the open sky, and speaks his last line (bespoke; varies with
the `mercy` counter and `vane_journal` pages collected, 01). The **Sky Wick** (`great_wick_act6`) is his staff's
weathercock. The ending sequence (01) begins when the player takes it.

v1 §16.1 rule 3: "3. **Surrender.** A Knell Novice or Lampbreaker below 25% HP with no Knell ally within 150 cells has a 40% chance to **surrender** (kneels, drops its bell, `combat_flee` bark). Sparing it (walking away, or pressing interact to "let it go") does **not** count as a Tithe kill and gives +1 to a hidden `mercy` counter used by 01-WORLD-STORY.md. Attacking a surrendered Knell counts as a kill."

v1 §24.15: "`lt_act6_boss`: `great_wick_act6`, `relic_vane_quill`, pennies, gear. First kill also grants the Guild marks listed in 08 §13.3." (R32: Ossery has no relic.)

### Parked by R22: boss and miniboss line texts

Replaced by: line ids from 01's boss lines table (01 owns every line). The v1 drafts, for 01 to draw from:

#### 19.11 Lines

- First opener (bespoke): *"Another little wick. Come here, child. Let Mother straighten you."*
- Phase 2 (bespoke): *"You are making me run. Everything runs, in the end."*
- Phase 3 (bespoke): *"I kept this chapel lit for forty years. I will not go out for you."*
- Player dies: *"Hush now. Wax remembers the shape of you."*
- Death: *"...so dark... who will... keep the vigil..."*
- Repeat openers / phase lines: Lingo `boss_opener` / `boss_phase` with tags `tallow`, plus 6 new pack lines each
  in `lingo/data/packs/lanternfall.json` (tone: motherly, smothering).

#### 20.11 Lines

- Opener (bespoke): *"Rise, my little congregation! A pilgrim has come to be eaten!"*
- Phase 2: *"Sing up! SING UP! I cannot hear the dark!"*
- Phase 3: *"Requiem, then. For you. I wrote it years ago."*
- Death: *"The choir... goes on... without... me..."*
- Pool tags: `gnaw`; tone: pompous, sing-song, preacher.

#### 21.12 Lines (Narrator)

- Opener: *"Something vast turns over in the Great Reservoir. The sluice gates groan."*
- Phase 2: *"The Sluicemaw breaks a gate with its skull. The water begins to spin."*
- Phase 3: *"Its jaw is a gate. The gate is open."*
- Death: *"The Reservoir is quiet. For the first time in forty years, nothing moves beneath it."*

#### 22.12 Lines

- Opener (bespoke, whisper): *"Such a bright little thing. Put it out for me. Put it out."*
- Phase 2: *"There. Now we are both blind. Only one of us minds."*
- Phase 3: *"Give it back. All of it. Every colour."*
- Player's lantern goes out in P2 (first time, bespoke): *"Mm. Amber. You taste of Lanterncrown."*
- Death: *"...so bright... it hurts... it was always... supposed to hurt..."*
- Pool tag `widow`: tone hungry, intimate, whispering.

#### 23.12 Lines

- Opener (bespoke): *"CHILD OF THE GUILD. HEAR ME. ALL THINGS FALL. I ONLY RING THE HOUR."* (toll)
- Phase 2: *"UP IS A HABIT. BREAK IT."* (toll)
- Phase 3: *"THE LAST HOUR. THE LAST HOUR. THE LAST HOUR."* (toll, toll, toll)
- Death: *"...the hour... has... passed..."* (a cracked, off-key toll)
- Pool tag `bellfather`: tone: vast, slow, capitals in text (UI renders his lines in small caps).

#### 24.14 Lines (bespoke; Lingo tag `ossery` for repeats)

- Opener (first time): *"The Guild sent a child. Of course they did. They always spent children on the weather."*
- P2: *"You want it to stop? I wanted it to START. Forty years ago the fields were dust. I held the sky for them."*
- P3: *"Come up, then. Come up where the storm is honest."*
- P4 (after the Rain stops): *"...listen. Do you hear that? Nothing. I had forgotten what nothing sounded like."*
- Per-attack (15%): Bind the Wick *"That's a pretty little flame. I'll borrow it."*; Stormdive *"Down!"*; Falling Water
  *"Forty years of rain. Where did you think it would go?"*
- Plea (10%): *"Let me watch it a little longer. The sky. Just a little longer."*
- Death (mercy ≥ 3): *"Light them, then. All of them. Tell them I was sorry."*; (mercy < 3): *"Light them. It changes
  nothing. Somebody will always want rain."*
- Player dies: *"Rest. It will rain on you, too, for a while."*

Miniboss drafts: Drowned Lockmaster opener *"Locks are for keeping. You are for keeping."*, phase *"Open them all!"*. v1 boss voice rows (now 01 §6.4): Tallow `elder` f pitch 0.35; Gnaw `priest` pitch 0.72; Widow `oracle` f; Bellfather `dragon` pitch 0.12; Ossery `sorcerer` m pitch 0.4.

### Parked by R22, R24, R63: v1 §25 speech tables

Replaced by: §25 (which AI moment fires which intent) and 01 (pools, tags, voices, limits).

#### 25.1 Which pool, when

| Moment | Intent (Lingo) | Who | Chance / cooldown |
|---|---|---|---|
| a talking enemy enters `alert` | `enemy_opener` | Knell, Hollow Lamplighter, Chandler Husk, Drowned Lockkeeper, Vane Herald | 60%, and max one opener per 6 s in the room |
| lands a hit / player takes big hit | `combat_taunt` | same | 20%, room cooldown 8 s |
| takes a big hit (≥ 20% its HP) | `combat_hurt` | same | 30% |
| enters `flee` / surrenders | `combat_flee` | Knell | 100% on surrender |
| kills the player | `combat_kill` | any talking enemy nearby | 100%, one line |
| beast notices you (first of its kind in the act) | `beast_snarl` (Narrator log) / `named_beast` for minibosses | Narrator | once per type per act |
| boss first entry / phase | `boss_opener` / `boss_phase` | bosses | always; bespoke on first ever entry |
| Knell Tollkeeper orders | `lf_knell_order` (new) | Tollkeeper | on each *Command* |
| Lampbreaker douses a light | `lf_lampbreaker_douse` (new) | Lampbreaker | 50% |
| Hollow Lamplighter opener | `enemy_opener` tag `hollow_guild` (new lines) | Hollow Lamplighter | 60% |

#### 25.2 Tags

A speaker turns on its own tag and zeroes the rest (the Emberveil `talk.js` pattern: `speech.tagWeights`).
New tags in the pack `lingo/data/packs/lanternfall.json`: `knell`, `hollow_guild`, `herald`, `tallow`, `gnaw`,
`widow`, `bellfather`, `ossery`. Existing tags reused: `cultist`, `undead`, `void`, `knight`.

Pack lines to write (minimum): `enemy_opener` 12 per new tag; `combat_taunt` 8 per new enemy tag; `boss_opener` 6 and
`boss_phase` 6 per boss tag; `lf_knell_order` 10; `lf_lampbreaker_douse` 8. All original text; dark, rain-soaked tone.
Lexicon entries for every enemy id (sg/pl, `creature` or `person` type, a `pron.respell` for invented words: e.g.
Sluicemaw `SLOOS-maw`, Ossery `OSS-uh-ree`, Knell `nel`) so Lingo can say "three Gloamhounds".

#### 25.3 Voices

`shared/voices.js` `voiceFor({ role, gender, seed })` with the role listed per entry; seed = the monster's spawn id so
each Knell sounds different. Babble voices use voice-lab's babble engine with the preset named per entry (`creature`,
`monster babble`, `fairy babble` for moths). Bosses have fixed voice JSON in `data/bosses.json` (not seeded). Speech is
shown as a small bubble over the speaker (02) and in the log; the Narrator's lines are italic in the log only.

#### 25.4 Speech budget

At most 2 voiced lines playing at once; babble at most 4 at once; the swarm shares one voice.

### Parked by the music rule (00 §13) and the attack budget: v1 §26 extras

v1: "boss loops (`lf.boss.<id>.bed`) in `ambience`" and "each boss has an ambience bed (sfx `ambience.*` from sfx/ plus a Lanternfall loop)"; replaced by the boss pulse layer in the score (10). v1 sound ids for cut attacks: `lf.boss.tallow.children`/`grab`/`pour`; `lf.boss.gnaw.round`/`hymn`/`tail`; `lf.boss.maw.sweep`/`spout`/`thrash`; `lf.boss.widow.brood`/`eat`/`web`/`kiss`/`rush`; `lf.boss.bell.brass`/`chain`/`crack`/`shrug`; `lf.boss.vane.wall`/`bind`/`tide`/`hail`/`barrage`/`dry`/`fury`/`falls`. v1 named the sfx file `prototypes/lanternfall/data/sfx-extra.json` (10 names it now).

### Moved to 10 by R4: v1 §27 JSON examples

Replaced by: 10 §5.10–5.11 (shapes); the values stay on this page.

#### 27.1 `data/enemies.json`

```json
{
  "schema": 1,
  "enemies": [
    {
      "id": "tallow_hound",
      "name": "Tallow Hound",
      "acts": [1, 2],
      "baseLevel": 2,
      "tier": "standard",
      "role": "flanker",
      "size": [14, 9],
      "hp": 55, "armour": 0, "poise": 30,
      "move": { "type": "walker", "speed": 85, "jump": 24, "swim": false },
      "resist": { "ember": -25, "rime": 0, "spark": 0, "bile": 0, "gleam": 0, "tide": 0, "shade": 0 },
      "tags": ["flammable", "floats", "smell", "fears_fire", "curious"],
      "senses": { "sight": 160, "reaction": 350, "smell": true },
      "ai": {
        "states": ["patrol", "alert", "attack", "search", "flee", "return"],
        "fleeAt": 0.25, "fleeTo": "water",
        "packAlert": 120
      },
      "attacks": [
        { "id": "lunge", "range": [30, 70], "cooldown": 3.0, "weight": 3,
          "windup": 550, "active": 320, "recovery": 600,
          "telegraph": { "glow": "back", "color": "#ff8a2a", "sfx": "lf.enemy.growl" },
          "damage": 13, "type": "phys", "knockback": 100, "move": { "dash": 70, "speed": 220 } },
        { "id": "snap", "range": [0, 12], "cooldown": 1.2, "weight": 2,
          "windup": 300, "active": 100, "recovery": 350,
          "telegraph": { "glow": "jaw", "color": "#e8e2d0" }, "damage": 9, "type": "phys" }
      ],
      "physics": { "floats": true, "flammable": true, "drownRate": 0.08 },
      "drops": { "table": "lt_act1_standard", "extra": [["wax_lump", 0.4, 1], ["gutter_fat", 0.3, 1]], "pennies": [2, 4] },
      "look": { "sprite": "tallow_hound", "palette": ["#b9ab88", "#6f644c"], "eyes": { "color": "#ff5a1f", "cells": 2 }, "glow": null },
      "voice": { "kind": "sfx", "notice": "lf.enemy.growl", "narrate": "beast_snarl" }
    }
  ]
}
```

#### 27.2 `data/bosses.json` (one entry per boss; minibosses in the same file with `"miniboss": true`)

```json
{
  "id": "boss_tallow", "name": "Mother Tallow", "act": 1, "level": 5, "hp": 2400,
  "enrage": 360,
  "phases": [
    { "id": "vigil", "from": 1.00, "to": 0.66, "move": "static",
      "attacks": ["palm", "drip_volley", "wick_lash", "hymn_of_wax"], "pick": { "every": 2.2 } },
    { "id": "melting", "from": 0.66, "to": 0.33, "move": { "type": "walker", "speed": 20 },
      "attacks": ["palm", "wax_tide", "candle_children", "embrace", "wick_lash"],
      "transition": { "ms": 2500, "script": "tallow_rip_altar", "healPlayer": 0.2 } },
    { "id": "guttering", "from": 0.33, "to": 0, "move": { "type": "walker", "speed": 35 },
      "attacks": ["flare", "last_pour", "embrace", "drip_volley"],
      "transition": { "ms": 3000, "script": "tallow_collapse", "healPlayer": 0.2 } }
  ],
  "attacks": {
    "palm": { "windup": 1000, "damage": 30, "telegraph": { "glow": "hand", "color": "#ff8a2a", "floor": { "shape": "rect", "size": [30, 10] }, "sfx": "lf.boss.tallow.palm" }, "spawnsZone": "vz_tallow_pool" }
  },
  "zones": {
    "vz_tallow_pool": { "shape": "pool", "size": [16, 3], "warmup": 500, "duration": 6000, "dps": 15, "element": "ember", "rim": "#ff8a2a", "slow": 0.4, "hardensTo": "wax" }
  },
  "lines": { "tag": "tallow", "opener": "Another little wick. Come here, child. Let Mother straighten you.", "phases": ["...", "..."], "death": "...", "playerDeath": "..." },
  "voice": { "engine": "formant", "role": "elder", "gender": "f", "pitch": 0.35, "breath": 0.6 },
  "loot": "lt_act1_boss"
}
```

Attack ids per boss are the snake_case of the attack names in §19–24. Void zones use the §8 shape.

#### 27.3 `data/elite-mods.json`, `data/spawn-tables.json`

`elite-mods.json`: the §17 table as `{ id, name, aura, effect: {…numbers}, exclude: [tags] }`.
`spawn-tables.json`: the §7.3 table plus `sp_unlit`, with `{ id, entries: [[enemyId, weight, groupSize]] }`.

### Parked with the Ferrywitch, the Tinker gadget and other cut content (R30, R32)

- v1 §3.1 `dead` state: "leaves a corpse cell group for 20 s (the Ferrywitch raises from these, 04)". v1 §6.1: "Corpses are body-shaped groups of `flesh` cells … The Ferrywitch raises Oarsmen from corpses lying in water (04)." (No `flesh` material exists; corpses are bodies now.)
- v1 §3.2 **Curious**: "**Curious** (only `curious: true` monsters: rats, pigeons, hounds, fry, clapperlings, Gloamhounds): a moving, noisy lure object (the Scrapwright's Rattletrap gadget, 08 §18.3; a thrown bell; a wind-up toy) within 120 cells pulls them out of `idle`/`patrol`/`search` into following it for 4 s. Monsters already in `attack` ignore it unless they have no attack token." (replaced by the lure rule, §6.2).
- v1 §3.2 hearing row: "a bell ringing (Act 5, Bellringer toll) | 400".
- v1 §4.5: "Summons, turrets (Tinker) and Oarsmen (Ferrywitch) draw aggro by **threat**".
- v1 §16 intro: the Knell "are the enemies the **Bell Tithe** counts (08 §16.7: every Knell kill raises Deacon Marl's prices)", and "Each kill increments the Bell Tithe count (08 §16.7)." (the Bell Tithe is parked with 08's shops, R31).
- v1 §15.1 thresholds: "light at the player < 0.35", "light ≥ 0.6", "fully lit (≥ 0.8) for 3 s dissolves into `unlit_ash`", "cells with light < 0.5" (R46: tiers now).
- v1 §29 build order (steps 1–4) and the Ossery P4 waterfall fallback ("near waterfalls as cells capped at 2,000 particles; far ones as a shader layer") — the falling water now belongs to the Falling Flood (06 §8.9, 09).

### Parked: v1 §30 "Proposed canon changes"

Resolved in §30 "Applied in v2". Original text:

These are additions or clarifications for 00-OVERVIEW.md; nothing canon was renamed.

1. **The bell-cult is named "the Knell"** (ids `knell_*`). 00 mentions bell-cultists only through the Bell Tithe.
2. **Difficulty ids and names:** `lamplit` (Lamplit), `normal` (Lamplighter), `guttering` (Guttering), `drowned`
   (Drowned). 02-CONTROLS-UI.md should use these in the menu.
3. **Area levels per act**: act1 1–5, act2 5–10, act3 10–15, act4 15–20, act5 20–25, act6 25–30 (fits the level cap 30).
4. **Minibosses are named**: the Wickwright, the Sewer-King, Lockmaster Ebb, the Lamp-Eater Matriarch, the Carillon, the
   Rootwarden (08's miniboss relic names match them).
5. **Ossery Vane has a Plea at 10% in phase 4** that feeds the ending (01), and a `mercy` counter from sparing Knell who
   surrender (§16.1) — 01 should confirm the ending uses it.
6. **The Widow snuffing your lantern on arena entry does not break the Moth Oracle unlock** (00 §7 says "without your
   lantern ever going out"); a scripted exemption is the only fair reading.
7. New status names used here that 03-SPELLS.md should own the numbers for: `wet` (tide; matches 08: spark +50%, ember
   −30%, removes burning; this page adds knockback ×1.5 on wet monsters), `marked`, `gnawed`, `plague`, `webbed`,
   `oiled`, `dazzled`, `dimmed`, `chilled`/`frozen`, `shocked`, `corroded`.
