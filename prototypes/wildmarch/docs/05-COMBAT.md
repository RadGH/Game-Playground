# WILDMARCH — Design Bible, page 05: Combat

**Status:** v0.1 draft — 2026-09-29. **Owns:** every combat formula, the status list, crowd control and
diminishing returns, threat, healing and absorb rules, death and revive, durability, regeneration,
group and level scaling of enemies, PvP combat rules, night danger.
**Reads from:** [page 00](00-OVERVIEW.md) (canon), [page 06](06-CLASSES.md) (resources, spell rules),
[page 07](07-PROGRESSION.md) (attributes, levels), [page 08](08-ITEMS.md) (item bases, affixes),
[page 11](11-BOSS-MECHANICS.md) (telegraphs, boss rules), [page 15](15-SOCIAL-ONLINE.md) (PvP queues, flagging).

Everything below is written the same way: **how it works in Farhold today** (with the file it lives in),
then **what Wildmarch changes**, marked `(reuse: path)` or `(new)`. Farhold paths are relative to
`prototypes/farhold/`.

---

## Contents

1. [Combat at a glance](#1-combat-at-a-glance)
2. [Aiming and targeting](#2-aiming-and-targeting)
3. [Movement in a fight: sprint, dodge roll, jump, block, parry](#3-movement-in-a-fight-sprint-dodge-roll-jump-block-parry)
4. [Basic attacks: the weapon patterns](#4-basic-attacks-the-weapon-patterns)
5. [What a hit feels like](#5-what-a-hit-feels-like)
6. [The damage formula, step by step](#6-the-damage-formula-step-by-step)
7. [Critical hits](#7-critical-hits)
8. [Armour](#8-armour)
9. [Elements and resistances](#9-elements-and-resistances)
10. [Status effects: the full list](#10-status-effects-the-full-list)
11. [Crowd control and diminishing returns](#11-crowd-control-and-diminishing-returns)
12. [Cast bars and interrupts](#12-cast-bars-and-interrupts)
13. [Threat and aggro](#13-threat-and-aggro)
14. [Healing and overhealing](#14-healing-and-overhealing)
15. [Absorbs](#15-absorbs)
16. [Death, revive, corpse run, release](#16-death-revive-corpse-run-release)
17. [Durability and repair](#17-durability-and-repair)
18. [Combat state and regeneration](#18-combat-state-and-regeneration)
19. [How enemies scale to level](#19-how-enemies-scale-to-level)
20. [How damage scales in groups](#20-how-damage-scales-in-groups)
21. [PvP combat rules](#21-pvp-combat-rules)
22. [Night danger](#22-night-danger)
23. [Online rules that touch combat](#23-online-rules-that-touch-combat)
24. [What changed from Farhold, in one table](#24-what-changed-from-farhold-in-one-table)
25. [Data shapes](#25-data-shapes)
26. [Open questions](#26-open-questions)

---

## 1. Combat at a glance

Wildmarch is a **third-person action RPG**: you aim with the camera, attacks land where they are aimed,
and you avoid damage by moving, rolling, blocking and parrying rather than by a hidden avoidance roll.
Numbers still matter — armour, resistances, crits and statuses are all real — but a player who reads the
telegraph and rolls out takes **zero** damage from it however bad their gear is.

The loop of one fight:

1. **Notice.** An enemy notices you inside its notice range ([§13.6](#136-noticing-pulling-and-social-aggro)).
2. **Open.** You hit it with a basic attack (the weapon's pattern, [§4](#4-basic-attacks-the-weapon-patterns)) or a spell ([page 06](06-CLASSES.md)).
3. **Trade.** Its attacks are telegraphed ([page 11](11-BOSS-MECHANICS.md)): a wind-up on the body for normal
   monsters, ground shapes for heavy ones. You dodge, block, parry or tank it.
4. **Resolve.** Every hit runs the one damage formula ([§6](#6-the-damage-formula-step-by-step)). Statuses
   tick once a second ([§10](#10-status-effects-the-full-list)).
5. **Finish.** A kill pays XP ([page 07](07-PROGRESSION.md)), loot ([page 08](08-ITEMS.md)) and restores
   whatever "on kill" stats you carry.
6. **Recover.** Five seconds after the last hostile event you leave combat and regenerate fast ([§18](#18-combat-state-and-regeneration)).

**Design targets** (the numbers the simulator must hold; see [§19](#19-how-enemies-scale-to-level)):

| Target | Value | Why |
|---|---|---|
| Time to kill a normal even-level enemy, solo, level-appropriate gear | **4.5 s** (band 3.5–6 s) at every level 1–60 | A fight should be long enough to dodge one attack, short enough to chain packs |
| Hits a normal enemy needs to kill an even-level cloth wearer who never dodges | **~21 hits (~33 s)** at every level | You can make mistakes against one normal enemy; three at once is a real fight |
| Same, heavy-armour tank | **~48 hits (~77 s)** | A tank can hold a pack while the group kills it |
| Champion (1 modifier) | 2.6× health, 1.35× damage (Farhold ranks) | "Kill the glowing one" is a mini-fight |
| Rare (2 modifiers + name) | 4.5× health, 1.6× damage | A solo player needs cooldowns or a follower |

---

## 2. Aiming and targeting

### 2.1 Camera and crosshair `(reuse: js/player.js, js/main.js aim())`

- **Over-the-shoulder camera**, shoulder offset 0.85 m, lift 0.25 m (Farhold `balance.player.shoulderOffset`,
  `cameraLift`). Shoulder side swaps with a key ([page 02](02-CONTROLS.md)). Setting: `set.controls.shoulder` (Left / Right).
- A **crosshair** sits at screen centre. What it points at is decided by a ray from the camera
  (Farhold R16 made `aim()` a 3D hitscan from the camera; Wildmarch keeps it).
- **The character turns to face the crosshair** when an attack starts, never while idle, so you can run
  one way and look another.

### 2.2 Soft lock (aim assist) `(new)`

Melee is forgiving; ranged is not.

| Attack | Soft lock rule |
|---|---|
| Melee basic attack or melee spell | If an enemy is within **1.5 × the strike's reach** and within **25°** of the camera's forward line, the character snaps its facing onto that enemy for the swing (turn rate 720°/s). The nearest wins; an enemy you have **hard-locked** always wins. |
| Ranged basic attack (bow, crossbow, javelin, wand) | The projectile flies at whatever the crosshair ray hits. If the ray passes within **0.6 m** of an enemy's body inside the weapon's range, it counts as aimed at that enemy (projectile curves up to 3° to meet it). |
| Target-shape spell (`shape: target`) | Needs a target: the hard-locked enemy, else the enemy under the crosshair (0.6 m tolerance), else the refusal "No target." |
| Ally-shape spell | Hard-locked ally, else ally under the crosshair, else **yourself** (so a healer never casts into nothing). |
| Ground-shape spell | A ground reticle follows the crosshair out to the spell's range; the spell lands where the reticle is. Quick-cast option places it instantly (`set.combat.quickcastGround`). |

Setting `set.combat.aimAssist`: Off / Melee only (default) / Melee and ranged.

### 2.3 Hard lock (Tab target) `(new)`

- **Tab** cycles hostile targets in front of you, nearest first, within 40 m (Farhold `field.target(maxDistance = 40)`).
  **Shift+Tab** cycles backwards. **F1–F5** select party members ([page 02](02-CONTROLS.md) owns keys).
- A hard-locked target shows a **red target ring** on the ground and the **target frame** (health, cast
  bar, statuses, threat %).
- With `set.combat.lockCamera` on, the camera also turns to keep the locked target on screen (accessibility option; off by default).
- A lock breaks when the target dies, goes out of 50 m, or is out of line of sight for 4 s.

### 2.4 Range, line of sight, facing

- **Range** is measured from the edge of your body (radius 0.45 m, Farhold `bodyRadius`) to the edge of the
  target's body. A spell with range 30 m works on a large boss whose centre is 34 m away.
- **Line of sight**: a target-shape spell, a heal and a ranged basic attack need an unblocked line from
  your chest (1.4 m up) to any of three points on the target (feet, chest, head). Refusal: "Out of sight."
- **Facing**: cones, lines and melee strikes aim along your facing; target spells do not need facing (the
  character turns for you).

### 2.5 Friendly fire

None. Nothing a player does hurts another player or their followers, except in PvP ([§21](#21-pvp-combat-rules))
and except mechanics that a boss turns against the group (page 11, e.g. a charm that makes a player's attacks hit allies).

---

## 3. Movement in a fight: sprint, dodge roll, jump, block, parry

### 3.1 Speeds `(reuse: data/balance.json player block)`

| Movement | Speed | Source |
|---|---|---|
| Jog (default movement) | 5.4 m/s | Farhold `moveSpeed 5.4` |
| Walk (toggle) | 2.4 m/s | new |
| Backpedal | 3.8 m/s (70% of jog) | new |
| **Sprint** (unlock level 2, [page 07](07-PROGRESSION.md#unlock-sprint)) | 8.1 m/s (×1.5) | Farhold's run was ×2.1 (11.3 m/s); Wildmarch lowers it because mounts carry the long distances |
| While winding up a swing | 55% of current speed | Farhold `COMBAT_FEEL.windCommitSpeed` |
| While charging a staff | 60% | Farhold `STAFF_CHARGE.moveWhile` |
| While casting a spell with a cast time | 0 — moving cancels the cast (unless the spell or a talent says "castable while moving") | new |
| While channelling | 0 unless the spell says otherwise | new |
| While holding block | 50% | new |
| Swim | 2.7 m/s | Farhold `swimSpeed` |
| Mounted | [page 07 §Mounts](07-PROGRESSION.md#unlock-riding-i) | |

Heavy armour slows you by **5%** (all four heavy slots worn); nothing else does. Farhold slowed you by
`armour / 400` up to 20%, which punished armour you could not choose to skip — replaced.

### 3.2 Stamina `(new)`

One bar, **100 points**, shown as a thin green arc beside the crosshair that fades out when full.

| Use | Cost |
|---|---|
| Sprint | 12 a second in combat, 4 a second out of combat |
| Dodge roll | 30 |
| Blocking a hit (held block) | `damage blocked ÷ your max HP × 100`, minimum 5 |
| Parry (successful) | 0 — a parry refunds the 10 spent on raising the guard |
| Raising the guard (press block) | 10 |
| Jump | 0 |

Regeneration: **25 a second** once you have not spent any for **0.8 s**; 50 a second out of combat.
At 0 you are **Winded** (status, [§10](#10-status-effects-the-full-list)): no sprint, no roll, no block until
the bar is back to 30.

### 3.3 The dodge roll `(new — unlock level 5 by quest, page 07)`

| Property | Value |
|---|---|
| Key | Dodge: **F** (page 02's table, canon 00 §10); double-tap a direction if `set.controls.doubleTapDodge` is on |
| Direction | The direction you are pressing, relative to the camera; standing still rolls **backwards** |
| Distance | 4.0 m over 0.45 s |
| **Invulnerable window ("i-frames")** | 0.30 s, from 0.05 s to 0.35 s into the roll. Any hit, projectile or ground effect that lands in the window does nothing at all — statuses included |
| Recovery | 0.15 s at the end in which you cannot attack or roll again |
| Cost | 30 stamina |
| Cancels | Any basic attack wind-up, any cast, any channel (the spell is not spent) |
| Can't roll while | Rooted, Stunned, Frozen, Asleep, Feared, Knocked Down (except the get-up roll below), mounted, swimming |
| Get-up roll | While Knocked Down, pressing Dodge after 0.5 s stands you up as a roll (no i-frames) |
| Heavy armour | Roll distance 3.4 m (−15%), same i-frames |
| Talents/perks that touch it | The Light Step perk arm (`dodge`, `movePct`), Riposte ("dodge a hit → next swing is a guaranteed critical" — in Wildmarch a **roll through a hit** counts as a dodge) |

**Passive dodge** is the old Farhold stat (`derived.dodge`, `js/rpg.js strike`): a chance for an incoming hit
to miss you outright. It stays, capped at **35%** (Farhold's strike cap), and **never applies to boss
telegraphs** (page 11) — a red danger zone is left, not dodged by a dice roll.

### 3.4 Jump `(reuse: js/player.js)`

Jump speed 6.4 m/s (Farhold). You can attack in the air (the strike lands when the swing does). Landing
from more than 6 m deals falling damage: 10% of max HP per metre above 6, never below 1 HP unless the fall
is over 20 m.

### 3.5 Block and parry `(new; Farhold had only a passive block chance)`

Farhold's block is a **passive chance** (`derived.blockChance`) that removes a flat `blockPower` from a hit
(`js/rpg.js strike`), plus the `guard` trait on weapons that parry (sword 8%, rapier 10%, quarterstaff 12%…).
Wildmarch keeps that roll under the name **Guard chance** and adds an **active** block you hold.

| Action | Needs | What it does |
|---|---|---|
| **Hold block** (right mouse by default when a shield is in the off hand) | A shield | A 120° frontal arc. Every hit from inside it is reduced by the shield's **Block %** (a shield stat: buckler 40%, heater 60%, tower 75% — page 08). Costs stamina per hit (§3.2). You move at 50% and cannot attack while holding. |
| **Parry** (press block within **0.20 s** before a melee hit lands) | Any melee weapon, or a shield | The hit does **0**. A normal/champion/rare/elite attacker is Staggered 0.8 s; a boss adds to its **break bar** instead ([§11.4](#114-bosses-the-break-bar); page 11 §12.2). Arms Riposte. Projectiles cannot be parried except by a class spell that says so. |
| **Guard chance** (passive, reuse) | Weapon guard trait, shield, gear, perks | When you are **not** holding block, a hit has this chance to be blocked for **Block Power** (flat). Cap 65% (Farhold `block_chance` cap). |

Two-handed weapons with a `guard` trait (greatsword 6%, halberd 6%, quarterstaff 12%) parry but cannot
hold-block. Bows, crossbows, wands and staves cannot parry.

---

## 4. Basic attacks: the weapon patterns

Basic attacks are **shared by everyone**, cost nothing, are **not on the global cooldown**, and are not
spells (canon, page 00 §5). What makes them different is the weapon.

### 4.1 A weapon is a pattern `(reuse: js/weapons.js WEAPON_PATTERNS, STRIKES)`

Every melee weapon walks a short sequence of **strike shapes**. Each press (or each swing while the
button is held) does the next strike; stopping for longer than the weapon's `every` + 0.4 s resets
to the first. The pattern is drawn on the item card as glyphs.

**Strike shapes** (Farhold `STRIKES`, unchanged numbers):

| Shape | Glyph | Reach × | Arc × | Damage share | Wind × | Splash (m) | Knockback (m) | Stagger (s) | Hit-stop (ms) | Shake | Armour pierce | Step forward (m) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| jab | · | 0.78 | 0.55 | 0.65 | 0.50 | 0.3 | 0.15 | 0 | 35 | 0.10 | 0 | 0 |
| slash | ⟋ | 1.00 | 1.00 | 1.00 | 1.00 | 1.0 | 0.35 | 0 | 55 | 0.20 | 0 | 0 |
| thrust | ⟶ | 1.55 | 0.35 | 1.20 | 0.90 | 0.4 | 0.55 | 0 | 55 | 0.18 | 25% | 0.3 |
| sweep | ◡ | 1.10 | 2.10 | 0.95 | 1.15 | 1.7 | 0.60 | 0.18 | 70 | 0.30 | 0 | 0 |
| cleave | ⤲ | 1.25 | 1.55 | 1.35 | 1.30 | 1.8 | 0.75 | 0.15 | 85 | 0.35 | 0 | 0 |
| overhead | ⟱ | 1.15 | 0.85 | 1.75 | 1.55 | 1.3 | 1.10 | 0.35 | 110 | 0.55 | 10% | 0 |
| arc (sword finisher) | ◟ | 1.10 | 2.30 | 1.45 | 1.25 | 1.6 | 0.70 | 0.20 | 80 | 0.35 | 0 | 0.6 |
| slam (hammer finisher) | ▼ | 1.00 | 1.20 | 2.25 | 1.85 | 2.6 | 2.20 | 0.65 | 150 | 0.90 | 20% | 0 |
| lunge (point finisher) | ⇢ | 1.80 | 0.30 | 1.35 | 1.05 | 0.3 | 0.40 | 0 | 60 | 0.22 | 40% | 1.4 |
| shot (ranged) | → | 1 | 1 | 1 | 1 | 0.9 | 0.30 | 0 | 55 | 0.18 | 0 | 0 |

**Weapon families** (Farhold `WEAPON_PATTERNS` + `WEAPON_TRAITS` + `FAMILY_WIND`; reach in metres, arc in
radians, `every` in seconds per strike before haste):

| Family | Hands | Pattern | Reach | Arc | Every | Wind-up (ms) | Family damage | Traits |
|---|---|---|---:|---:|---:|---:|---:|---|
| Dagger | 1 | jab · jab · slash | 2.0 | 1.1 | 0.34 | 70 | ×0.80 | **Backstab ×2.2** from the rear 100°, and the backstab applies Bleeding |
| Rapier | 1 | thrust · thrust · lunge | 3.3 | 0.7 | 0.52 | 95 | ×1.00 | Guard 10%; thrust pierces 25%, lunge 40% of armour |
| Spear | 1 | thrust · thrust · sweep | 4.0 | 0.8 | 0.66 | 140 | ×1.00 | **Pierce line** 2 bodies (thrust is a 0.9 m-wide line, 6.2 m long); Brace +25%; guard 5% — keeps the shield |
| Sabre / scimitar | 1 | slash · slash · arc | 2.7 | 1.5 | 0.46 | 105 | ×1.00 | **Flow**: connect twice and the third strike costs 0.35× its clock; Momentum |
| Sword | 1 | slash · slash · arc | 2.8 | 1.4 | 0.58 | 120 | ×1.00 | Guard 8%; **Momentum** +8% per consecutive connecting strike, max +16% |
| Longsword | 1 | slash · slash · overhead | 3.0 | 1.5 | 0.64 | 130 | ×1.00 | Guard 8%; Momentum |
| Axe | 1 | cleave · slash · cleave | 2.6 | 1.3 | 0.68 | 200 | ×1.00 | Cleave applies **Bleeding** |
| Mace | 1 | overhead · slash · slam | 2.4 | 1.1 | 0.62 | 180 | ×1.00 | **Armour break** 5% per hit |
| Hammer | 1 | overhead · sweep · slam | 2.5 | 1.2 | 0.66 | 260 | ×1.00 | Armour break 7% per hit |
| Warhammer | 1 | overhead · overhead · slam | 2.6 | 1.1 | 0.76 | 275 | ×1.00 | Armour break 7% |
| Battleaxe | 1 | cleave · slash · cleave | 2.8 | 1.5 | 0.82 | 210 | ×1.00 | Bleeding on cleave |
| Sceptre | 1 | overhead · slash | 2.5 | 1.1 | 0.64 | 170 | ×1.00 | Armour break 4%; swings carry the sceptre's element |
| Greatsword / two-handed sword | 2 | sweep · overhead · arc | 4.2 / 3.9 | 2.1 / 2.0 | 0.96 / 0.88 | 330 / 320 | **×1.20** | Guard 6%; every strike is an area strike |
| Greataxe (two-handed axe) | 2 | cleave · cleave · slam | 3.6 | 1.9 | 0.94 | 340 | ×1.20 | Bleeding; armour break 5% |
| Halberd / polearm | 2 | thrust · sweep · overhead | 4.8 | 1.7 | 1.00 | 300 | ×1.20 | **Pierce line** 3 bodies, 7.4 m; Brace +35%; guard 6% |
| Quarterstaff | 2 | jab · sweep · jab · sweep | 3.5 | 1.6 | 0.48 | 110 | ×1.00 | Guard 12%; **physical** (never a caster weapon — Farhold R17/R18) |
| Fists (nothing held) | — | jab | 2.4 × 0.78 | 1.2 × 0.55 | 0.46 | 80 | dice 1–3 | — |

Anything not in the table falls back on its category (Farhold `CATEGORY_PATTERNS`): light `slash · thrust`,
heavy `slash · overhead`. An unlisted two-hander gets reach ×1.18, arc ×1.25, every ×1.2 and damage ×1.20.

### 4.2 The three-part swing `(reuse: js/weapons.js swingTiming, js/player.js)`

Every strike is **wind-up → damage lands → recovery**:

- **Wind-up** = family wind-up × strike wind ×, in milliseconds. You are committed: you turn at 35% and
  walk at 55%. A **dodge roll cancels a wind-up** (the strike is lost, the pattern does not advance).
- **Damage lands** on one frame.
- **Recovery** = 45% of the wind-up. A press during recovery is **buffered for 0.18 s** (Farhold
  `inputBufferSeconds`) and fires the moment recovery ends.
- **The invariant** (Farhold has a test for it): wind-up + recovery come **out of** `every`, never on top
  of it, and together never take more than 90% of it. Attack speed (haste) shrinks all three together.

### 4.3 Hold to repeat, or hold to charge `(reuse: js/weapons.js INPUT_MODES)`

Every weapon obeys exactly one of two rules:

| Mode | Weapons | Holding the attack button… |
|---|---|---|
| **repeat** | every melee weapon, crossbow, javelin, wand | …swings/shoots/casts on the weapon's clock. Nothing builds. |
| **charge** | bow (all three), staff | …builds power; releasing fires. At the ceiling the weapon releases itself, so holding gives a stream of full-power shots. |

### 4.4 Dual wielding and two-handers `(reuse: js/weapons.js handPlans, offhandRefusal, OFFHAND_DAMAGE)`

- **Everyone may dual wield** two one-handed weapons (canon keeps Farhold's rule). The off hand runs **its
  own pattern on its own clock**, rolls **its own dice** (Farhold R14) and hits for **60%** (`OFFHAND_DAMAGE`).
  The off hand may only wind up while the main hand is recovering.
- A **two-handed weapon** empties the off hand, except: a **quiver** stays with a bow (Farhold R22), and the
  Doubled Grasp keystone allows two two-handers ([page 07 §Perk forest](07-PROGRESSION.md#perk-forest)).
- Bows need both hands to draw and cannot go in the off hand.

### 4.5 Ranged weapons `(reuse: js/weapons.js RANGED, drawPower)`

| Weapon | How it fires | Timing | Power | Range | Splash on impact | Pierces |
|---|---|---|---|---:|---:|---:|
| Shortbow | draw | nock 0.28 s → full 0.75 s; shakes after 1.4 s | 0.55× → 1.40× | 38 m | 0.9 m (half damage at the rim) | 1 |
| Bow | draw | nock 0.35 s → full 0.95 s; shakes after 1.6 s | 0.55× → 1.60× | 46 m | 0.9 m | 1 |
| Longbow | draw | nock 0.40 s → full 1.10 s; shakes after 1.8 s | 0.55× → 1.75× | 54 m | 0.9 m | 2 |
| Crossbow | reload | one bolt, then 1.25 s reload you cannot attack through | 1.80× | 50 m | 0.9 m | 2 |
| Javelin | throw | 0.75 s | 1.15× | 28 m | 1.4 m | 0 |

Past the shake point a drawn bow loses 3% power per extra second held, floored at 50% (Farhold `decay`).
A release before the nock keeps drawing to the nock and fires the 0.55× shot (Farhold's "nothing you
pressed is thrown away"). **There is no ammunition** (Farhold R16); a quiver is gear that adds arrow
damage and arrow behaviours (page 08).

### 4.6 Wands, staves and sceptres `(reuse: js/weapons.js WAND_BEHAVIOURS, STAFF_SPELLS, STAFF_CHARGE)`

**Wand** — a repeat-mode ranged caster: one bolt of the wand's element per swing clock (category *magic*,
every 0.60 s), range 34 m. Each wand rolls one behaviour, fixed for that item:

| Behaviour | What the bolt does | Projectiles | Damage × | Splash |
|---|---|---:|---:|---:|
| true-flying | single fast bolt | 1 | 1.00 | 1.3 m |
| bursting | bursts on impact | 1 | 0.95 | 3.2 m |
| splitting | three bolts in a fan (±9°) | 3 | 0.55 each | 1.1 m |
| chaining | jumps from the first target to 2 more within 8 m | 1 | 0.80 | 1.2 m |
| seeking | turns onto any enemy within 6 m of its path | 1 | 0.90 | 1.3 m |
| heavy | one slow bolt (34 m/s) | 1 | 1.45 | 2.6 m |

**Staff** — a charge-mode caster: its "attack" is a shaped spell of its element (Farhold `STAFF_SPELLS`:
fire has Flame Cone, Ember Nova, Flame Wave, Exploding Fireball; ice Rime Cone, Frost Nova, Shard Volley;
lightning Arc Lash, Storm Nova, Thunderline; poison Spore Cloud, Creeping Blight, Bile Flask; arcane Arc
Burst, Star Shot, Rift Cone; shadow Gutter Cone, Creeping Dark, Black Pulse; holy Dawnburst, Searing
Light, Sunlance). Each staff carries one, fixed for that item.

| Charge held | Damage × | Area × | Mana |
|---|---:|---:|---|
| Tap (released before 0.35 s) | 0.60 | 0.8 | 0 |
| 0.35 s | 0.60 | 0.7 | 4 a second while held |
| 1.40 s (full) | 1.00 | 1.0 | 〃 |
| 2.60 s (maximum, releases itself) | 1.60 | 2.0 | 〃 |

A hit worth more than 25% of your max HP knocks you out of the charge. You move at 60% while charging.
At full charge the shape changes kind (Farhold `CHARGED_FORMS`): a cone becomes a 5-tick jet, a nova a dome
that shoves everything 2.4 m out, a wave a wall that stands 3 s, ground a field that stays 4 s, a lob an
aimed mortar, a chain jumps 5 times instead of 3. **Wildmarch builds all six** (Farhold wrote them down and
never built them — page 18 milestone).

**Sceptre** — a one-handed melee pattern (overhead · slash) whose swings carry the sceptre's element.

**Focus** (off-hand grimoire, orb, reliquary, effigy — Farhold R25 `js/foci.js`) — worn, not swung;
page 08.

### 4.7 What basic attacks give back `(new)`

| Resource ([page 06 §Resources](06-CLASSES.md#4-resources)) | From a connecting basic attack |
|---|---|
| Fury | +4 per main-hand hit, +2 per off-hand hit, +8 on a pattern finisher (arc, slam, lunge, overhead-as-last-strike); +1 per 1% of your max HP taken as damage |
| Focus | nothing (Focus regenerates on its own) |
| Mana | nothing, except wands and staves: +0.5% of max mana per connecting bolt or cast (at most once per 0.5 s) |

Class mechanics may add their own (e.g. a rogue's combo point from a basic hit) — the class file says so.

---

## 5. What a hit feels like

`(reuse: js/combat-feel.js, data/balance.json player.combat)` — every number here is Farhold's, kept as is.

| Effect | Rule |
|---|---|
| **Hit-stop** | The world runs at 0.05× speed for the strike's hit-stop (35–150 ms), easing back over 40 ms. ×1.6 on a critical, ×2.2 on a kill, capped at 260 ms. Only one at a time; a longer one replaces a shorter one. The camera and the mouse never freeze. |
| **Screen shake** | Camera *position* only, never rotation: `shake × 0.035 m`, ×1.5 on a crit, capped at 0.12 m, decaying over 0.18 s at 38 Hz, 70% along the direction of the blow. |
| **Knockback** | The strike's metres, eased over 0.18 s. Resisted by rank: champion ×0.70, rare ×0.50, elite ×0.40, boss ×0.25; a hovering body ×1.25. A body pushed into a wall takes **1.5% of its own max HP** instead of moving. |
| **Stagger** | The target cannot walk **or swing** (its attack timer is held) for the strike's stagger seconds. Diminishing returns on the same body inside 6 s: 100% → 60% → 30% → 0%. |
| **Recoil** | The struck body is nudged 8 cm along the blow and eases back over 120 ms. |
| **Weight** | The wind-up of §4.2. |

**Online rule** `(new)`: hit-stop and shake are **client-side only** — the server never pauses. Knockback
and stagger are server-authoritative. Hit-stop is shown only for hits **you** land or take; another
player's hits never freeze your screen. Settings: `set.gameplay.hitStop` (On), `set.gameplay.screenShake`
(On), `set.gameplay.damageNumbers` (On) — page 04.

---

## 6. The damage formula, step by step

### 6.1 The two power numbers `(Farhold: one; Wildmarch: two)`

Farhold has **one** power number, `derived.damage` (a range), and every skill is "% weapon damage"
(`js/rpg.js derive`, `js/skills.js use`). Non-physical damage was then multiplied by `1 + spellPower` inside
`rpg.strike` — and before round 22 **also** inside `skills.use`, which squared it (Consecrate hitting for
500 against a basic attack's 7; see `RPG.md` Round 22 and the "one multiplier, two owners" memory note).

Wildmarch keeps the weapon number and adds a second, so the canon template's "% of weapon damage or %
of spell power" is exact:

**Weapon Damage (WD)** — what basic attacks and physical spells are a share of `(reuse: js/rpg.js derive, rescaled)`:

```
WD_min/max = ( weaponDice_min/max × LevelTerm + FlatDamage ) × AttrScale × (1 + Damage%)

LevelTerm  = 1 + 0.05 × (level − 1)          Farhold: 1 + 0.11 × (level − 1)
AttrScale  = 1 + 0.01 × weaponAttribute      Farhold: 0.03 per point
             weaponAttribute = STR for heavy weapons, DEX for light and ranged, INT for magic weapons
FlatDamage = sum of "+N damage" affixes and perk nodes (added AFTER the level term, Farhold R14)
Damage%    = sum of every "+N% damage" from perks, talents and gear (one additive bucket)
```

**Spell Power (SP)** — what magical spells, heals and shields are a share of `(new)`:

```
SP = ( spellDice_mid × LevelTerm + FlatSpell ) × (1 + 0.01 × INT) × (1 + SpellDamage%)

spellDice  = the main-hand weapon's dice × 1.0 for a magic weapon (wand, staff, sceptre),
             × 0.8 for anything else (a paladin's mace still powers a paladin's spells)
             + the off-hand focus's spell dice if one is worn (page 08)
FlatSpell  = sum of "+N spell damage" affixes
SpellDamage% = Farhold's `spellPower` stat, restated as a percentage; gear cap +150% (Farhold AFFIX_CAP)
```

SP is a **single number** (the midpoint); spells roll ±10% around it. It is applied **once, here**, and
never again. `rpg.strike`'s `if (element !== 'physical') amount *= 1 + spellPower` line does **not**
exist in Wildmarch. A test must fail if any spell's damage is multiplied by `SpellDamage%` in two places.

### 6.2 One hit, in order

Every hit — basic attack, spell, follower, trap, boss mechanic — runs this list, in this order, in **one
function** (`strike()`, reuse of `js/rpg.js strike` with the changes marked).

| Step | What happens | Formula / rule | Farhold |
|---:|---|---|---|
| 0 | **Can it miss?** | Target is rolling (i-frames) → **no effect**. Target is a player with passive dodge → `rng < min(35%, dodge)` → "Dodged", no damage. Enemies never dodge. Boss telegraphs skip this step. | Same dodge roll; i-frames new |
| 1 | **Roll the base** | Weapon hit or physical spell: uniform roll in `[WD_min, WD_max]`. Magical spell, heal or shield: `SP × uniform(0.9, 1.1)`. | Same, SP new |
| 2 | **× the coefficient** | Basic attack: strike damage share × family damage × hand share (1.0 main, 0.60 off) × draw/charge power. Spell: the % written on the class page (e.g. 140% WD). DoT tick: the tick's share of its total. | Same (`multiplier`) |
| 3 | **× position and weapon traits** | Backstab ×2.2 (dagger, rear 100°); Momentum ×1.08/×1.16 (sword, sabre); Brace ×1.25/×1.35 (spear/polearm vs a body that closed on you this second); Far Shot keystone (×0.75 under 4 m, up to ×1.5 at 46 m) | Same (`js/actors.js strike`) |
| 4 | **+ flat on-hit, × gear conditionals** | `(amount + flatOnHit) × product(gear dmgOut hooks)` — "vs undead", "vs burning", execute, etc. (`js/effects.js dmgOut`) | Same |
| 5 | **× the attacker's statuses** | `× (1 + sum of damage buffs) × (1 − sum of dealLess, cap 60%)` — Might, Rallied, Weakened… | Same (`outgoingFrom`), cap was 80% |
| 6 | **Critical?** | `rng < critChance` (+ gear critBonus; Riposte forces it). Crit: `× (1 + critDamage)`. [§7](#7-critical-hits) | Same |
| 7 | **× the target's statuses** | `× (1 + sum of takeMore, cap +50%) × (1 − sum of resist buffs, cap 60%)` — Shocked, Marked, Cursed, Guarded… | Same (`incomingFrom`); caps new |
| 8 | **Level gap** | `× gapFactor` — [§19.4](#194-the-level-gap) | new |
| 9 | **Mitigation** | Physical: armour ([§8](#8-armour)). Magical: the element's resistance ([§9](#9-elements-and-resistances)). True damage (a few boss mechanics): none. | Formula changed |
| 10 | **Flat reductions** | `× (1 − resistAll%)` then `× product(defender's gear dmgIn hooks)`, floored so at least **25%** of step 9's result remains | Same floor |
| 11 | **PvP** | Player vs player (or their pets): `× 0.65` ([§21](#21-pvp-combat-rules)) | new |
| 12 | **Block** | Held block from the front: `× (1 − Block%)`. Else Guard chance: `− Block Power` (flat). Parry: → 0. | Passive block only |
| 13 | **Round** | `max(1, round(amount))`; a fully blocked or parried hit may be 0 | Same |
| 14 | **Absorbs** | Shields and barrier take it first, soonest-to-expire first ([§15](#15-absorbs)) | Barrier only |
| 15 | **Health** | `hp −= amount`. If that would kill a **player**, cheat-death effects get one look (`fx.preLethal`) | Same |
| 16 | **After the hit** | Life steal (physical weapon hits only, never spells/wands/staves), mana steal, thorns (reflects a share to the attacker), on-hit and on-crit procs (a proc never starts another proc), talent riders (sunder, leech, cauterise, brand), threat ([§13](#13-threat-and-aggro)) | Same (R21 life-steal rule) |

### 6.3 One owner for every multiplier

Farhold's worst bugs were a factor applied twice (spell power, squared) or zero times (War Cry did
nothing to swings until R18). This table is the rule: **each factor is applied in exactly one step**, and
the tests assert it.

| Factor | Applied at | Never at |
|---|---|---|
| Level term | WD / SP | a spell's own coefficient |
| Attribute scale | WD / SP | spells, heals (already inside SP) |
| Damage% / SpellDamage% | WD / SP | step 4, step 5 |
| Slot level and cooldown value of a spell | **the number printed on the class page** (the design budget, [page 06 §Spell budget](06-CLASSES.md#8-the-spell-power-budget)) | at run time — Farhold's `effectiveMult` is a *design tool* in Wildmarch, not a runtime multiplier |
| Status buffs/debuffs on the attacker | step 5 | the class spell's number |
| Status debuffs on the target | step 7 | step 5 |
| Crit | step 6 | DoT ticks (they do not crit unless a talent says so) |
| PvP | step 11 | anywhere else |

### 6.4 Worked example (level 30)

A level-30 fighter, greatsword `WD 150–186` (midpoint 168), third strike of the pattern (overhead), with a
+12% "vs beasts" gear conditional, under **Might (+20%)**, into a **Shocked** (+15%) even-level wolf with
25% physical mitigation, no crit:

```
168 (mid roll)
× 1.75 (overhead) × 1.20 (greatsword family)   = 352.8
× 1.12 (gear conditional)                        = 395.1
× 1.20 (Might)                                   = 474.1
× 1.15 (Shocked)                                 = 545.3
× 1.00 (level gap: even)                         = 545.3
× 0.75 (armour 220 vs K(30) = 660 → 25%)         = 409
→ 409 damage. The wolf has 1,585 health: four overheads.
```

A level-30 mage casting a spell written as "210% SP as fire" with SP 172, into an enemy with 20% fire
resistance, crit (critDamage +50%):

```
172 × 1.04 (roll) × 2.10 = 375.7  × 1.5 (crit) = 563.5  × 0.80 (resist) = 451 → 451 damage.
```

---

## 7. Critical hits

`(reuse: js/rpg.js strike, js/affixes.js AFFIX_CAP)`

| Property | Value | Farhold |
|---|---|---|
| Base crit chance | 5% | 5% |
| From DEX | +0.06% per point | +0.2% per point (Wildmarch hands out far more DEX, [page 07 §Attributes](07-PROGRESSION.md#attributes)) |
| From gear, perks, talents | as written | same |
| Cap | 60% | 60% |
| Base crit damage | +50% (×1.5) | same |
| Cap | +250% (×3.5) | same |
| Spells | crit on the same chance | same |
| Heals and shields | crit on the same chance for ×1.5 (critDamage does **not** raise heal crits) | new |
| DoT and HoT ticks | never crit (a talent may say otherwise) | new — Farhold ticks never rolled |
| Enemies | normal/champion/rare: 3% for ×1.5. Elites and bosses: **0%** — their damage is predictable | Farhold 3% for everything |
| Riposte (perk) | after you dodge-roll through a hit, parry or block, your next basic attack is a guaranteed crit | same (Farhold armed it on passive dodge/block) |

Feel: a crit number is 1.4× larger, gold, and adds ×1.6 hit-stop and ×1.5 shake (§5).

---

## 8. Armour

### 8.1 Farhold's rule, and why it changes

Farhold: `damage × 100 / (100 + armour)` (`js/rpg.js strike`). A flat constant of 100 means 100 armour is
50% at level 1 and still 50% at level 50 — while Farhold's enemy armour grew with the health curve
(`def.armor × 1.13^(level−1)`), so a level-50 enemy's 800–3,200 armour let a player through only 3–11% of
their damage. Wildmarch makes the constant **grow with the attacker's level**, so "50% reduction" means
the same thing at every level.

### 8.2 The formula `(new)`

```
effectiveArmour = armour × (1 − sunder) × (1 − pierce)      sunder ≤ 55%, pierce ≤ 85%
reduction       = effectiveArmour / (effectiveArmour + K(attackerLevel))
K(level)        = 60 + 20 × level
reduction cap   = 75%
```

| Attacker level | K | Armour for 25% | 50% | 75% (cap) |
|---:|---:|---:|---:|---:|
| 1 | 80 | 27 | 80 | 240 |
| 10 | 260 | 87 | 260 | 780 |
| 20 | 460 | 153 | 460 | 1,380 |
| 30 | 660 | 220 | 660 | 1,980 |
| 40 | 860 | 287 | 860 | 2,580 |
| 50 | 1,060 | 353 | 1,060 | 3,180 |
| 60 | 1,260 | 420 | 1,260 | 3,780 |

**Design targets for a full set of level-appropriate armour** (page 08 sets item armour values to hit these
against an even-level attacker): cloth **15%**, light **25%**, medium **35%**, heavy **50%**; a shield adds
**+5 points** of reduction. Tank talents, the Held Line perk arm and tank mechanics push a tank to ~60–66%.

**Enemy armour** is written as a **share** at even level (page 10 per family): casters/spirits 10%,
beasts/skirmishers 25%, brutes 40%, constructs/armoured 55%. The game stores it as
`armour = K(level) × share / (1 − share)`.

### 8.3 Getting through armour

| Source | Effect | Reuse |
|---|---|---|
| Thrust / lunge / overhead / slam strike shapes | ignore 25% / 40% / 10% / 20% of armour | `STRIKES.pen` |
| **Sunder** (hammer/mace/warhammer/greataxe/sceptre hits) | −4…7% of the target's *current* armour per hit, 8 s, stacking to −55% | `js/actors.js sunder` |
| Shattering talent / Sunder perk | permanent −10 / −8 armour — **Wildmarch changes both to −4% / −3% of base armour per hit, lasting the fight** (a flat number is worthless at level 60) | `js/skilltalents.js`, `js/perks.js` |
| `cond_critArmorPen` affix | crits ignore up to 75% | `js/affixes.js` |

---

## 9. Elements and resistances

### 9.1 The damage types

| Type | Resisted by | Its status (when a source "applies its element") | Colour | Farhold |
|---|---|---|---|---|
| Physical | Armour | Bleeding (edged), Sundered (blunt) | steel `#b9c2cc` | same |
| Fire | Fire resistance | Burning | `#ff8a40` | same |
| Ice | Ice resistance | Chilled | `#9fd8ff` | same |
| Lightning | Lightning resistance | Shocked | `#ffe86a` | same |
| Poison | Poison resistance | Poisoned | `#9ede6a` | same |
| Nature | Nature resistance | Snared | `#6fbf5a` | Farhold used `nature` only for web — promoted to a full type for druid/shaman/ranger `(new)` |
| Shadow | Shadow resistance | Cursed (or Withered) | `#c090ff` | same |
| Holy | Holy resistance | none by default (holy is the healers' element) | `#ffe6a0` | same |
| Arcane | **half** of every resistance (ignores 50%) | none — its trade is hitting hardest | `#b8a0ff` | same idea ("raw force — no status") |
| True | nothing | none — boss mechanics only | white | new |

### 9.2 The formula `(new)`

Farhold has one `magicResist` stat that reduces every non-physical type by `100/(100 + mres)`.
Wildmarch has one resistance per element **plus** Farhold's all-element stat under the name **Magic
Resistance**, using the same K as armour:

```
resist(element) = elementResist + magicResistance
reduction       = resist / (resist + K(attackerLevel))      cap 75%
arcane: resist is halved first
```

**Players** get resistance from gear (affixes, page 08), perks (The Deep Study `magicResist` nodes, The Held
Line), buffs and consumables. **Enemies** have a resistance profile by family (page 10): e.g. fire
elementals 75% fire / −25% ice (a negative resistance **increases** damage, floor −50%), undead 40% shadow /
−25% holy.

---

## 10. Status effects: the full list

### 10.1 How every status works `(reuse: js/skills.js applyStatus, tickStatuses)`

- A status lives on a body as `{ id, remaining, power, stacks, source }`.
- **Damage and healing over time tick once a second** (Farhold `TICK_EVERY = 1` — a second's worth arrives
  at once so the number is readable), plus a final partial tick for the leftover when it runs out.
- **Snapshot**: a DoT's damage per tick is fixed when it is applied (the attacker's power at that moment).
  Haste does not speed ticks.
- **Refresh**: applying the same status again sets the timer to the **longer** of the two and keeps the
  **stronger** power (Farhold: "refreshing beats stacking"). Progress (a ramp's step, metres walked, damage
  stored for Doom) is kept.
- **Stacking statuses** say so (`stackMax`); each new stack refreshes all stacks.
- **One copy per attacker per status** on a target — two players' Burnings are two Burnings, each ticking.
  The *takeMore* debuffs (Shocked, Marked, Cursed, Branded, Silver-Branded, Quarry) are the exception: the **strongest one of
  each id** counts, whoever applied it, and all of them together are capped at **+50% damage taken**.
- A **generic** status applied by an item, affix or weapon trait uses the default magnitude below; a class
  spell always states its own numbers on the class page, which win.
- The status's look is one of the 23 status auras in `avatar-3d/js/spellfx.js` (reuse), pulsing on each tick.
- **DoT total rule** (player-facing text, Farhold `WORDING.md` rule 2): always "N fire damage over 4 s", never
  a per-second figure.
- Farhold's `STATUS_POWER_SHARE = 0.35` (R21b) was the share of a skill's hit that a status carried. In
  Wildmarch a generic status states its total as a share of the applying hit directly (the table below), so
  there is no hidden constant.

### 10.2 Dispel types `(new)`

| Dispel type | Removed by | Examples |
|---|---|---|
| **Magic** | a Magic dispel (class spells), the Cleansing Draught | Burning, Chilled, Shocked, Marked, Frozen, Asleep, Feared, Silenced, Snared, Rooted (magical) |
| **Curse** | a Curse dispel | Cursed, Withered, Doom |
| **Poison** | a Poison dispel, Antivenom | Poisoned, Venom, Rot |
| **Bleed** | a Bleed dispel, a Bandage (out of combat), any single heal of 30%+ of max HP | Bleeding, Hemorrhage, Wounded |
| **Enrage** | an Enrage dispel (enemy buffs only) | Frenzy on an enemy, boss Enrage (page 11) |
| **Physical** | not dispellable; wait it out or break it (§11) | Stunned, Knocked Down, Staggered, Sundered, Disarmed, Taunted |
| — (buff) | a Purge (removes one Magic buff from an enemy) | Might, Guarded, Hastened on enemies |

Special: **Burning** also ends when you are submerged 0.8 m or more in water.

### 10.3 Damage over time

| id | Name | Effect (default, as a share of the applying hit) | Duration | Stacks | Dispel | Icon (Font Awesome) | Reuse |
|---|---|---|---:|---:|---|---|---|
| `burn` | Burning | 40% as fire damage over 4 s | 4 s | 1 | Magic, water | `fa-fire` | Farhold `burn` (0.3/s × 5 s) |
| `poison` | Poisoned | 48% as poison damage over 8 s | 8 s | 1 | Poison | `fa-flask-round-poison` | Farhold `poison` |
| `bleed` | Bleeding | 36% as physical damage over 6 s | 6 s | 1 | Bleed | `fa-droplet` | Farhold `bleed` |
| `venom` | Venom | 20% as poison damage over 6 s **per stack** | 6 s | 5 | Poison | `fa-spider` | Farhold R23 `venom` |
| `kindling` | Kindling | fire damage starting at 8% of the hit a second, +4% more each second it burns, up to 24% a second | 5 s | 1 | Magic, water | `fa-fire-flame-curved` | Farhold R23 `kindling` |
| `hemorrhage` | Hemorrhage | 50% as physical damage over 5 s, +10% for every metre the target walks, up to +150% | 5 s | 1 | Bleed | `fa-heart-crack` | Farhold R23 |
| `rot` | Rot | 60% as poison damage over 6 s; if the target dies while rotting, Rot jumps to every enemy within 6 m | 6 s | 1 | Poison | `fa-biohazard` | Farhold R23 |
| `doom` | Doom | stores all damage its caster deals to the target; when it ends, deals 40% of the stored amount again as shadow damage | 4 s | 1 | Curse | `fa-hourglass-end` | Farhold R23 |
| `wither` | Withered | 30% as shadow damage over 6 s, and −20% healing received | 6 s | 1 | Curse | `fa-leaf` (grey) | Farhold names it on shadow staves but never defined it `(new definition)` |

### 10.4 Movement and control

| id | Name | Effect | Duration (default) | Stacks | Dispel | CC category ([§11](#11-crowd-control-and-diminishing-returns)) | Icon | Reuse |
|---|---|---|---:|---:|---|---|---|---|
| `chill` | Chilled | −45% move speed, −15% attack and cast speed | 4 s | 1 | Magic | Slow (no DR) | `fa-snowflake` | Farhold `chill`; the attack-speed half is new |
| `frostbite` | Frostbite | −8% move speed per stack; at 5 stacks becomes Frozen and the stacks clear | 5 s | 5 | Magic | Slow | `fa-temperature-low` | Farhold R23 |
| `frozen` | Frozen | cannot move or act | 1.5 s | 1 | Magic | Stun | `fa-cube` (ice) | Farhold R23 (move only) — Wildmarch also stops actions |
| `web` | Snared | −80% move speed | 3 s | 1 | Magic | Slow | `fa-circle-nodes` | Farhold `web` |
| `root` | Rooted | cannot move; can turn, attack and cast | 3 s | 1 | Magic | Root | `fa-tree` | new |
| `stun` | Stunned | cannot move, turn, attack or cast | 1.5 s (max 4 s) | 1 | Physical | Stun | `fa-star` (circling) | new (Farhold drew a `stun` aura for stagger) |
| `stagger` | Staggered | cannot walk or swing; attack timer held | strike's value (0.15–0.65 s) | 1 | Physical | its own DR (§5) | — (recoil pose) | Farhold `js/combat-feel.js staggerFor` |
| `knockdown` | Knocked Down | prone; cannot act; a dodge after 0.5 s stands you up | 1.2 s | 1 | Physical | Incapacitate | `fa-person-falling` | new |
| `knockback` | (displacement) | pushed N metres over 0.18 s; wall slam 1.5% max HP | instant | — | — | Knockback | — | Farhold `pushFor` |
| `pull` | (displacement) | pulled N metres toward a point | instant | — | — | Knockback | — | Farhold R25 Void Rift `pull` |
| `fear` | Feared | runs directly away from the source; breaks after taking 30% of max HP | 4 s | 1 | Magic | Incapacitate | `fa-ghost` | new |
| `sleep` | Asleep | cannot act; **any damage wakes it** | 8 s | 1 | Magic | Incapacitate | `fa-moon` | new |
| `charm` | Charmed | fights for the charmer; the charmer's threat rules apply | per spell (enchanter) | 1 | Magic | Incapacitate | `fa-heart` | new |
| `silence` | Silenced | cannot cast spells; basic attacks still work; interrupts the current cast | 3 s | 1 | Magic | Silence | `fa-comment-slash` | new |
| `disarm` | Disarmed | no basic attacks; spells that say "weapon" refuse | 4 s | 1 | Physical | Disarm | `fa-hand` | new |
| `taunted` | Taunted | must attack the taunter | 3 s | 1 | Physical | none (bosses included, [§13.4](#134-taunt)) | `fa-bullhorn` | new |
| `dazed` | Dazed | −50% move speed; hit while mounted (replaces Farhold's 28% throw) | 3 s | 1 | Physical | Slow | `fa-face-dizzy` | Farhold `mountThrowChance` |
| `blind` | Blinded | misses **50%** of its attacks (a boss's blind on a player may also white out the screen, page 13) | 2–4 s (per source) | 1 | Magic | — (no DR) | `fa-eye-slash` | new — used by classes (cleric, rogue, swashbuckler) and pages 10/12/13 |
| `knockup` | Knocked Up | thrown into the air: cannot act; a short Knocked Down in the air | 0.5–1.5 s (per source) | 1 | Physical | Incapacitate (shares DR with Knocked Down) | `fa-person-falling` | new — pages 10/11/12 |
| `confused` | Confused | movement controls reversed | 3–5 s (per source) | 1 | Magic | Incapacitate | `fa-shuffle` | new — enchanter, page 13 |
| `untargetable` | Untargetable | cannot be targeted or hit by anything, area effects included; cannot attack | per source | 1 | — | — | `fa-ghost` (faded) | new — cleric, monk (Between Steps), pages 13 |
| `winded` | Winded | stamina at 0: no sprint, roll or block until stamina reaches 30 | until 30 stamina | 1 | — | — | `fa-lungs` | new |

### 10.5 Debuffs

| id | Name | Effect | Duration | Stacks | Dispel | Icon | Reuse |
|---|---|---|---:|---:|---|---|---|
| `shock` | Shocked | takes **+15%** damage from every source | 5 s | 1 | Magic | `fa-bolt` | Farhold 30% — halved because in a group five players apply it |
| `marked` | Marked | takes +15% damage | 8 s | 1 | Magic | `fa-crosshairs` | Farhold `marked` |
| `curse` | Cursed | takes +20% damage, −15% move speed | 8 s | 1 | Curse | `fa-skull` | Farhold 25% |
| `quarry` | Quarry | takes +15% damage (the perk talent; first hit only) | 8 s | 1 | Magic | `fa-bullseye` | Farhold perk `mark` |
| `branded` | Branded | takes +20% damage (the Branding talent) | 6 s | 1 | Magic | `fa-stamp` | Farhold talent `brand` |
| `weaken` | Weakened | deals −25% damage | 7 s | 1 | Curse | `fa-arrow-down` | Farhold 35% |
| `sunder` | Sundered | −N% of current armour per hit, to −55% | 8 s | stacks by value | Physical | `fa-shield-halved` | Farhold `js/actors.js sunder` |
| `wounded` | Wounded | −50% healing received | 8 s | 1 | Bleed | `fa-bandage` | new |
| `broken` | Broken | a boss whose break bar filled: cannot act, current cast cancelled, takes +25% damage (page 11 §12.2 calls this state Broken) | 4 s | 1 | — | `fa-burst` | new ([§11.4](#114-bosses-the-break-bar)); was `exposed` — renamed so it does not clash with the Tactician's Exposed |
| `shaken` | Shaken | −25% damage and healing done (revived at a shrine) | 3 min (levels 10–19), 5 min (20+) | 1 | — (cannot be removed) | `fa-heart-pulse` | new ([§16](#16-death-revive-corpse-run-release)) |

### 10.6 Buffs

Class buffs are written on the class pages. These are the **generic** buffs that items, potions, shrines,
set bonuses and followers apply (Farhold `data/skills.json statuses`, re-tuned for groups):

| id | Name | Effect | Duration | Stacks | Dispel (by enemies) | Icon | Reuse |
|---|---|---|---:|---:|---|---|---|
| `might` | Might | +20% damage | 12 s | 1 | Magic | `fa-hand-fist` | Farhold +30% |
| `guard` | Guarded | −30% damage taken | 8 s | 1 | Magic | `fa-shield` | Farhold −45% |
| `haste` | Hastened | +25% attack and cast speed, +20% move speed | 10 s | 1 | Magic | `fa-forward` | Farhold +45% / +30% |
| `stoneskin` | Stoneskin | +30% armour | 14 s | 1 | Magic | `fa-mountain` | Farhold +60 flat |
| `regen` | Mending | heals 25% of max HP over 10 s | 10 s | 1 | Magic | `fa-leaf` | Farhold 2.5%/s |
| `rally` | Rallied | +10% damage, −10% damage taken | 8 s | 1 | Magic | `fa-flag` | Farhold +20% / −15% |
| `frenzy` | Frenzy | +8% attack speed, +4% move speed per stack | 6 s | 5 | Enrage | `fa-fire-flame-simple` | Farhold R23 |
| `evading` | Evading | the dodge roll's i-frames | 0.30 s | — | — | — | new |
| `stealth` | Stealthed | enemies notice you at 25% of their range; broken by attacking, casting, taking damage | until broken | 1 | — | `fa-user-secret` | Farhold `stealth` stat (a notice-range multiplier) |
| `well_fed` | Well Fed | food: the food's stat (page 08) | 30 min | 1 | — | `fa-drumstick-bite` | new |
| `barrier` | Barrier | an absorb ([§15](#15-absorbs)) | until spent / expiry | — | Magic | `fa-circle-half-stroke` | Farhold `barrier` stat |
| `guardian` | Guardian | a tank state: ×4 threat ([§13](#13-threat-and-aggro)); class pages say what grants it | while active | 1 | — | `fa-shield-heart` | new |
| `rising` | Rising | just revived: cannot be damaged, cannot attack | 5 s (ends early if you attack) | 1 | — | `fa-sun` | new |

### 10.7 Caps and floors

| What | Cap / floor |
|---|---|
| Total "takes more" on one target | +50% |
| Total damage-taken reduction from buffs | 60% |
| Total "deals less" on one attacker | 60% |
| Total slow | 80% (Snared alone may reach it); Frozen/Rooted/Stunned are not slows |
| Healing-received reduction | 75% |
| Attack and cast speed (haste) | **+30%** from all sources together (reconciliation pass; was +60%) — GCD floor 0.77 s (1.0 s ÷ 1.3) |
| Group buffs to damage dealt | **+30%** from all group buffs together (songs, auras, banners, Orders, Drilled, Might, Rallied…) |

**Stacking rule for buffs.** Two buffs **with the same name** never stack — the stronger one counts and the other
waits underneath (it takes over if the stronger one ends first). **Different** buffs stack with each other up to
the caps above. A class's own self-buffs (forms, stances, Heat, Flair…) are not group buffs and do not count
toward the +30% group-buff cap, but they do count toward the haste cap.

### 10.8 Class and boss statuses `(index; reconciliation pass)`

Statuses that a class page or a boss page defines. **The defining page owns the numbers**; this index exists so
every status id is listed once on page 05, and they all follow §10.1 (ticks, refresh, one copy per attacker)
and the caps in §10.7.

| Status | Kind | Short rule (see the defining page) | Defined by |
|---|---|---|---|
| `thornseed` | enemy DoT (nature) | ticks nature damage, bursts in a 4 m circle; jumps to the nearest enemy within 8 m if the target dies | [classes/druid.md](classes/druid.md) |
| `heartwood` | ally buff | armour + damage-to-healing (Heartwood Ward) | [classes/druid.md](classes/druid.md) |
| `static_scale` | enemy debuff | next hit on it chains 60% WD to one more enemy within 6 m, 5 s | [classes/dragon_knight.md](classes/dragon_knight.md) |
| `hellsight` | self buff | +20% crit, immune to Blind, Confuse, Fear and Charm, 8 s | [classes/demon_hunter.md](classes/demon_hunter.md) |
| `pact` | self buff | Soul Pact: DoTs tick ×2 and +30%, 12 s | [classes/warlock.md](classes/warlock.md) |
| Exposed | enemy debuff | next hit from anyone but the Tactician +25%, 6 s | [classes/tactician.md](classes/tactician.md) |
| Outflanked | enemy debuff | +20% from side/behind, cannot turn quickly, 8 s | [classes/tactician.md](classes/tactician.md) |
| Braced | ally buff | 30% less damage, 3 s | [classes/tactician.md](classes/tactician.md) |
| Designated | enemy debuff | +8% damage from the group, 10 s | [classes/tactician.md](classes/tactician.md) |
| Drilled | ally buff (group) | +10% attack and cast speed | [classes/tactician.md](classes/tactician.md) |
| Seized the Hour | ally buff (group) | 8 s + 2 s per pip over 3 | [classes/tactician.md](classes/tactician.md) |
| Lagging | enemy debuff (stacks) | −6% move and −6% attack/cast speed per stack | [classes/chronomancer.md](classes/chronomancer.md) |
| Hurried | ally buff | +20% attack and cast speed, +20% move, 8 s (counts toward the haste cap) | [classes/chronomancer.md](classes/chronomancer.md) |
| Out of Step | enemy debuff | next hit taken +15%, 5 s | [classes/chronomancer.md](classes/chronomancer.md) |
| Out of Time | ally lock | cannot be restored by Unwind again for 30 s | [classes/chronomancer.md](classes/chronomancer.md) |
| Stopped | enemy control (non-boss) | cannot move, attack or cast | [classes/chronomancer.md](classes/chronomancer.md) |
| Chrono-locked | boss | current cast bar paused 2 s; shares the 90 s cast-pause lockout (page 11 §12.3) | [classes/chronomancer.md](classes/chronomancer.md) |
| `silver_branded` Silver-Branded | enemy debuff | +6% damage from the group, 12 s (the Witch Hunter's mark; not the generic `branded`) | [classes/witch_hunter.md](classes/witch_hunter.md) |
| Condemned | enemy debuff | +10% damage from you, 10 s | [classes/witch_hunter.md](classes/witch_hunter.md) |
| Sworn | ally link | the Knight's Vow of Protection target | [classes/knight.md](classes/knight.md) |
| Reproached | enemy debuff | deals 8% less damage to anyone but the Knight, 6 s | [classes/knight.md](classes/knight.md) |
| Intercept | ally buff | the next hit is taken by the Knight, 4 s | [classes/knight.md](classes/knight.md) |
| Oathbound | self buff | heals 20% of the damage it prevented when it ends | [classes/knight.md](classes/knight.md) |
| Guard Broken | boss debuff | takes 15% more for 4 s (Fighter talent Guard Break, in place of the stun) | [classes/fighter.md](classes/fighter.md) |
| Between Steps | self | untargetable, takes no damage | [classes/monk.md](classes/monk.md) |
| Twilight | self buff | both balance sides' bonuses at full, 8 s | [classes/priest.md](classes/priest.md) |
| Runeforged | ally buff | granted by the Runesmith's circle, 10 s | [classes/runesmith.md](classes/runesmith.md) |
| Veiled | self | stealth (as `stealth`, §10.6) | [classes/shadow_dancer.md](classes/shadow_dancer.md) |
| `unveiled` Unveiled | enemy debuff | +12% damage from you, 8 s (the Shadow Dancer's *Open Wound* debuff; not the Tactician's Exposed) | [classes/shadow_dancer.md](classes/shadow_dancer.md) |
| Tagged | enemy debuff | your gadgets prefer it, 6 s | [classes/tinker.md](classes/tinker.md) |
| Broken | boss | break bar full (§11.4) | page 05 / [page 11 §12.2](11-BOSS-MECHANICS.md) |
| Wrath | boss buff (stacks) | soft enrage: +10% damage every 30 s | [page 11 §13](11-BOSS-MECHANICS.md) |
| Sunder (boss stack) | tank debuff (stacks) | +15% boss melee taken per stack, 30 s — **not** the same as `sunder` (§10.5) | [page 11 §26.10](11-BOSS-MECHANICS.md) `mech_sundering_blow` |
| Standing in void | player | shown while inside a void zone | [page 11 §3](11-BOSS-MECHANICS.md) |
| Deepening Cold / Cold | player gauge | a group meter to 100; at 100 **Frozen** | [page 11 §26.10](11-BOSS-MECHANICS.md), [page 13](13-RAIDS-WORLD-BOSSES.md) r02 |
| Warmth | zone buff | −10 Cold a second while inside | [page 13](13-RAIDS-WORLD-BOSSES.md) r02 |
| Seared | player debuff (stacks) | +8% fire damage taken per stack, 12 s, max 5 | [page 12](12-DUNGEONS.md) d04 |

**Name clashes — Resolved (00 §10):** one name, one meaning. The Witch Hunter's mark is `silver_branded`
**Silver-Branded** (the generic `branded` in §10.5 keeps its name), and the Shadow Dancer's *Open Wound* debuff
is `unveiled` **Unveiled** (+12% from you, 8 s; the Tactician's Exposed keeps its name). The class files under
`classes/` must use these names.

---

## 11. Crowd control and diminishing returns

### 11.1 Categories `(new)`

| Category | Statuses | Bosses | Elites (dungeon trash) | Champions / rares | Players in PvP |
|---|---|---|---|---|---|
| Stun | Stunned, Frozen | immune (break bar instead) | yes, max 2 s | yes | yes, max 4 s |
| Incapacitate | Asleep, Feared, Charmed, Knocked Down | immune (break bar) | yes (Charmed: no) | yes | yes |
| Root | Rooted | immune (break bar) | yes | yes | yes |
| Silence | Silenced | interrupt only (no lockout beyond 3 s) | yes | yes | yes |
| Disarm | Disarmed | immune (break bar) | yes | yes | yes |
| Knockback | knockback, pull | ×0.25 distance | ×0.40 | ×0.70 / ×0.50 | ×0.60 |
| Slow | Chilled, Snared, Frostbite, Dazed, Cursed's slow | capped at 30% | capped at 50% | full | full |
| Stagger | Staggered | break bar only | DR per §5 | DR per §5 | DR per §5, max 0.4 s |

### 11.2 Diminishing returns

Farhold has DR on stagger only (100/60/30/0 within 6 s). Wildmarch adds a **per-category** DR for real CC:

| Application within 18 s of the first | Duration |
|---|---:|
| 1st | 100% |
| 2nd | 50% |
| 3rd | 25% |
| 4th | immune until 18 s pass with no application |

The 18-second window restarts on every application. DR is tracked per target, per category, across all
attackers. The target frame shows a small grey "DR" pip on the status icon when the next one will be shortened.

### 11.3 Breaking crowd control

- **Asleep** breaks on any damage. **Feared** breaks after 30% of max HP taken. **Charmed** breaks after 50% of the charmed body's max HP taken (enchanter spells may change this).
- **Rooted** (magical roots) breaks after the target takes 20% of max HP.
- A **dodge roll** is blocked by every CC in the table except Slow and Knockback.

### 11.4 Bosses: the break bar

`(new; shared with page 11 — page 11 §12.2 owns the numbers)`

**Canon (00 §10): bosses ignore stun, knockdown, root and disarm; control fills a break bar instead.** They also
ignore sleep, fear and charm (the Incapacitate row above). Warlords count as bosses. Elites, champions and
rares are **not** bosses: they take crowd control with the caps in §11.1 and the DR in §11.2.

Every crowd-control attempt on a boss, every hit worth ≥ 3% of its health and every interrupt adds to a
**break bar** under the boss frame (reuse: Farhold `js/combat-feel.js` stagger with diminishing returns):

| Thing | Break added |
|---|---:|
| stun / sleep / fear / charm attempt | 12% of the bar |
| root / slow / knock | 6% |
| a hit ≥ 3% of the boss's health | 4% |
| an interrupt | 10% |

The bar drains 5% a second when nothing adds to it. **Full → Broken** (status `broken`, §10.5): the boss stops
for 4 s, its current cast is cancelled (lethal casts already shown still resolve) and it takes **+25% damage**;
then it is immune to break for 30 s (bar greyed). Page 11 says which bosses need a break to stop a mechanic
and which lock the bar during phases. *(Was: a "poise bar" with its own fill table — replaced to match page 11,
reconciliation pass.)*

---

## 12. Cast bars and interrupts

`(new; page 11 owns the boss cast bar's look)`

- Any cast longer than 0.5 s shows a **cast bar** over the caster (enemies: over their nameplate and on the
  target frame; you: above your skill bar).
- **Grey bar** = cannot be interrupted. **Gold border** = interruptible (page 11 vocabulary).
- **Interrupting** a gold-bordered cast needs a spell tagged `interrupt` (class pages), a **Silence**, a
  parry of the cast's opening swing, or a stagger ≥ 0.35 s on a non-boss. The cast is lost and the caster is
  **locked out of that element's spells for 3 s**.
- **Your own casts**: taking damage pushes a cast back by 0.25 s, at most twice per cast (not channels).
  Moving, rolling or jumping cancels a cast-time spell (the spell is not spent, the cooldown does not start).
  A cast finishes if you are **out of range** when it completes → refusal "Out of range", nothing spent.

---

## 13. Threat and aggro

### 13.1 Farhold today `(reuse: js/actors.js aimOf, taunt; R22)`

Farhold has **no threat table**. An enemy picks its target with two rules: (1) something that hit it in the
last **5 s** (`THREAT_SECONDS`) and is within **16 m** (`THREAT_LEASH`) holds its attention; (2) otherwise the
nearest companion within its reach + 1.6 m (`THREAT_BLOCK`) and closer than the player; (3) otherwise the
player. It was built so pets would be noticed ("enemies seem to just ignore my pets") and it is enough for
one player and some followers. It is not enough for five players, a tank and a healer.

### 13.2 Wildmarch: the threat table `(new)`

Every enemy keeps a **threat table**: a number per player, follower and pet that has done something to it
or near it. It attacks whoever is on top, subject to the swap rule.

| Event | Threat |
|---|---|
| Damage dealt to the enemy | 1 per point |
| Healing done (effective only, not overhealing) | 0.5 per point, split evenly among every enemy that has the healed target on its table |
| Absorb shield consumed | 0.5 per point absorbed, credited to the shield's caster, split as above |
| Dispel / cleanse on an ally | 30 × your level, split as above |
| Applying a debuff or CC that does no damage | 20 × your level to that enemy |
| Buffing an ally | 0 |
| First to damage (the pull) | +10% of the enemy's max HP as threat, once |
| Body pull (walking inside its notice range) | 1 threat — enough to be on the table |

**Multipliers** (multiply everything above):

| Who | Multiplier |
|---|---:|
| A player in a **Guardian** state (tank stance/form/mechanic — class pages say which) | ×4 |
| Anyone else | ×1 |
| A follower that is a tank (Shield Warden mercenary, a tank companion — page 06) | ×3 |
| Any other follower or class pet | ×0.5 |
| Threat-reducing talents / "Fade"-type spells | as written on the class page |

### 13.3 Who it attacks — the swap rule

The current target keeps aggro until someone passes it by:

- **110%** of the current target's threat, if they are within **6 m** of the enemy (melee range);
- **130%** otherwise.

Normal monsters in the open world also keep Farhold's "body in the way" rule as a **path** rule: if their
path to the target is blocked by another hostile body for 1.5 s, they swing at the body in the way (bosses
and elites never do).

### 13.4 Taunt

- A **taunt** (class spells, and the shared **Challenge** — page 07's ladder, level 10, tank-capable classes; **Resolved (00 §10)**) sets the taunter's
  threat to **110% of the current top** and applies **Taunted** for 3 s: the enemy must attack the taunter.
- Taunts always work on bosses; **no DR**. A boss that is taunted while already Taunted by another tank
  switches (the tank swap, page 11).
- An enemy immune to taunt is marked with a crossed-bullhorn icon (page 11 uses it for "fixate" mechanics).

### 13.5 Leashing and evade

| Enemy | Resets when… |
|---|---|
| Open-world normal/champion/rare | dragged **60 m** from where it was pulled, or unable to reach its target for **6 s** |
| Dungeon trash | **80 m**, or unreachable for 8 s |
| Boss | leaves its arena (page 11), or every player on its table is dead or out of the arena |

A resetting enemy runs home **Evading** (takes no damage), heals to full and clears its table and statuses.

### 13.6 Noticing, pulling and social aggro

| Enemy rank | Notice range (day) | Social aggro (allies that join when it is hit) |
|---|---:|---:|
| Normal | 18 m (Farhold default 26 m; lowered because the online world is denser) | 10 m |
| Champion | 22 m | 12 m |
| Rare | 24 m | 12 m |
| Dungeon elite | 14 m (packs are linked instead: pull one, pull the pack) | whole pack |
| Boss | by encounter (page 11) | — |

Stealth multiplies notice range by `1 − stealth` (floor 25%, Farhold rule). Night changes it ([§22](#22-night-danger)).
An enemy three or more levels **below** you (grey or green) does not notice you at all unless you hit it.

### 13.7 What you see `(new; screens on page 03)`

- **Nameplate threat glow**: none (below 70% of the top), **amber** (70–100%: you are about to pull it), **red**
  (you have it). For a player in a Guardian state the colours invert: red means you have **lost** it.
- **Target frame**: your threat as a % of the top, and the name of who is on top.
- **Threat meter** panel `scr_threat_meter` (group-wide list for the current target, bars by %), built on the
  playground's damage-meter component `(reuse: meters/js/meter-ui.js)`.
- The **damage meter** `scr_damage_meter` `(reuse: meters/)`: damage, healing, taken, absorbs, statuses, deaths, per fight or per session.

---

## 14. Healing and overhealing

`(mostly new — Farhold healing is Mend (a share of your own max HP), Renew/regen buff, life steal and potions)`

### 14.1 The heal formula

```
heal = SP × coefficient (class page) × uniform(0.9, 1.1)
     × (1 + HealingDone%)                       healer's gear, perks, talents, buffs
     × crit ? 1.5 : 1
     × (1 + HealingReceived% − reductions)      target: Wounded −50%, Withered −20%; floor 25%
     × PvP ? 0.70 : 1
```

A heal never exceeds the target's missing health — the rest is **overhealing**.

### 14.2 Kinds of heal

| Kind | Rule |
|---|---|
| Direct | lands on cast completion (or instantly) |
| Heal over time (HoT) | ticks every 1 s, snapshot at application; re-applying extends it up to **130%** of its base duration (unlike DoTs, so a healer is not punished for refreshing early) |
| Smart heal | "heals the N most-injured allies within R m" — picks by lowest **percentage** health, ties to nearest |
| Area heal | every ally in the shape, no cap unless the spell says one |
| Self heal | life steal (physical weapon hits only — Farhold R21), hpOnKill, class self-heals |
| Leech (talent) | a share of the skill's damage heals you — spells included, because a talent is a choice |

### 14.3 Overhealing

- Shown on the damage meter as a separate pale bar and on combat text as a grey number in brackets.
- Generates **no** threat.
- Class mechanics that use it (the cleric's **Devotion** banks overheal into a shield, canon) are the only
  way it is worth anything.

### 14.4 Shared healing items `(numbers owned here; items on page 08)`

| Item | Effect | Cooldown |
|---|---|---|
| Health potion (tiers by level) | restores **35%** of max HP instantly | shared **potion cooldown 60 s** |
| Mana potion | restores **35%** of max mana | shared potion cooldown |
| Waking Draught | revives a dead ally at 35% HP (out of combat), or yourself if you die while it is on your belt and it is off cooldown (in dungeons: only out of combat) | 10 min |
| Bandage | out of combat: heals 40% over 8 s, clears Bleed | 30 s |
| Food / drink | out of combat: 6% HP / mana a second while eating (max 20 s), then Well Fed | — |

The **potion belt** (unlock level 3, [page 07](07-PROGRESSION.md#unlock-potion-belt)) holds up to four consumables on keys: 2 slots at level 3, 4 at level 16; the waist item adds charges per slot, not slots ([page 08 §16.1](08-ITEMS.md#161-the-potion-belt)).

---

## 15. Absorbs

`(reuse: js/rpg.js barrier; new: spell shields and the order)`

- **Barrier** (Farhold `derived.barrier`): a second, temporary health bar from gear and perks (The Held Line
  "+40 barrier"). It refills **8% of its size a second** out of combat (Farhold), never in combat unless an
  effect says so. In Wildmarch, perk barrier values scale with level like every flat perk node ([page 07](07-PROGRESSION.md#perk-forest)).
- **Shields** from spells and items: `{ amount, expires, source }`, drawn as a white-gold outline on the health bar.
- **Order**: damage is taken by the absorb that **expires soonest**, then the next, then health. Barrier
  (which never expires) is last.
- **Cap**: all absorbs together may not exceed **100% of max HP**; anything past that is discarded on application.
- A shield that is fully used shows "Shield broken" in combat text. What an absorb soaked is on the meter under Absorbs.
- **Nothing takes damage from your mana** (Farhold rule: "a mana shield read as every enemy draining you").

---

## 16. Death, revive, corpse run, release

### 16.1 Farhold today `(reuse: js/main.js respawn)`

In Farhold, at 0 HP you wake at the spawn point with full health and mana (R22), lose **10% of your gold**,
and the field clears. A landmark's "revive once a day" charge lets you get up where you fell instead.
Emberveil had a real revive rule (healer, draught, shrine, town cleric) with a `revive` memory.

### 16.2 Wildmarch: the dead state `(new)`

At 0 HP (after cheat-death effects), you are **Dead**:

- Your body stays where it fell, with a marker on the map and compass.
- Enemies drop you from their tables. Your followers keep fighting for 10 s, then flee to you.
- The **death panel** `scr_death` opens after 2 s with three buttons:

| Button | Available | Result |
|---|---|---|
| **Wait for a revive** | always | stay dead; an ally's revive spell or Waking Draught brings you back where you fell ([§16.4](#164-being-revived)) |
| **Release** | always | you become a **spirit** at the nearest **Shrine of Returning** ([§16.3](#163-release-and-the-corpse-run)) |
| **Rise here** (Waking Draught on your belt and off cooldown) | open world, or out of combat in instances | you get up at 35% HP; draught spent |

- **Auto-release** after 6 minutes dead (so nobody is stuck).
- **No gold is lost** (Farhold's 10% purse cost is removed — in an online game it punishes the player who
  can least afford it and feeds nothing). The cost of dying is time, durability and, if you pay to skip the
  walk, the Shaken debuff.

### 16.3 Release and the corpse run

- **Shrines of Returning**: in every town and at roadside shrines no more than **1,500 m** apart along roads
  (page 01 places them).
- As a spirit: 1.5× jog speed, pass through monsters (they ignore you), cannot interact, fight, mount or
  talk. The world is desaturated.
- Reach **30 m** of your body and press **Rise** → you get up at **50% HP and mana** with **Rising** (5 s
  of immunity that ends if you attack).
- Or, at the shrine, pay the **Shrine Keeper** to **rise at the shrine**: cost **level × 5 gold** (page 08 may
  retune), you get up at full HP/mana with **Shaken** (−25% damage and healing done, 3 min at levels 10–19,
  5 min at 20+), and equipped items lose an **extra 15%** durability.

### 16.4 Being revived

| Revive | Who | Result |
|---|---|---|
| Out-of-combat revive | the shared **Tend the Fallen** verb (page 07's day-one kit; **Resolved (00 §10)**): hold Interact on the body for 8 s, out of combat | 35% HP/mana, Rising |
| Class revive spell | healer classes (class pages) | as written; typical 50–100% HP |
| **Battle revive** (in combat) | the classes whose page gives one | as written; limited by charges in instances |
| Waking Draught | anyone | 35% HP |

**Battle-revive charges** in instances (shared by the whole group, across all classes):

| Content | Charges |
|---|---|
| 5-player dungeon (Normal/Heroic) | 1 per boss encounter; unlimited on trash |
| Mythic+ | 1 at the start, +1 every 10 min, max 3 |
| 10-player raid | 2 per boss encounter |
| 20-player raid | 3 per boss encounter |
| World boss | unlimited (open world) |

### 16.5 Instances

- Releasing inside a dungeon or raid puts your spirit at the **instance entrance**; you rise at the
  entrance at full HP/mana (no Shaken, no extra durability loss).
- While the group is in a boss fight, the boss room's door is sealed: a released player waits at the
  entrance until the fight ends (win or wipe).
- A wipe (everyone dead) resets the boss (page 11) and everyone may release.

### 16.6 Newcomer mercy (levels 1–9)

Releasing puts you at the shrine at **full health** with no Shaken, no durability loss and no cost. The first
death also shows a one-time card explaining shrines and the corpse run.

### 16.7 Followers and pets

A follower or pet at 0 HP falls (it is not dead forever). It gets up on its own **14 s** after you leave
combat (Farhold `pets.reviveSeconds`), at 50% HP. A summoned creature simply vanishes and can be summoned
again. In instances, a fallen follower rises only between encounters.

**Pets and summons versus boss mechanics (canon 00 §10; page 11 §12.3 owns the rule).** Class pets and
summons take **no party slot**, leave a **danger zone 0.6 s** after it appears and a **void zone after 0.5 s**
in one, **never count toward a soak**, and take **25% damage from room-wide hits**. **Followers** are
different: they take a party slot, **do** count toward soaks and take full damage from mechanics.

---

## 17. Durability and repair

`(new — Farhold has no durability)`

| Rule | Value |
|---|---|
| Durability per item | 100 points (weapons, off-hands, armour; not rings, necklaces, lights, mounts) |
| On death | −10% of max on every **equipped** item (none at levels 1–9, none in PvP, none on a wipe past the third in the same boss fight within 30 min) |
| Rising at the shrine for gold | a further −15% |
| At 0 | the item is **Broken**: it gives no stats, no armour, no set bonus; a broken weapon swings as fists |
| Warning | at 25% the paper-doll slot turns yellow; at 10% red, and a HUD icon appears |
| Repair | any smith or general vendor, and at every Shrine of Returning; cost = item sell price × 0.25 × share lost |
| Field Repair Kit | consumable, restores 50% to everything equipped, usable out of combat (page 08) |
| Guild repairs | page 15 |

---

## 18. Combat state and regeneration

### 18.1 In and out of combat

You are **in combat** from the moment you deal damage to, take damage from, or are on the threat table of
a hostile, until **5 seconds** after none of those is true. In combat you cannot mount, eat, drink, bandage,
use a waystone, change talents or equipment in the armour slots (weapons may be swapped), or log out safely.
The HUD shows crossed swords by the portrait.

### 18.2 Regeneration

| Pool | In combat | Out of combat (after 5 s) | Farhold |
|---|---|---|---|
| Health | `hpRegen` stat only (gear, perks) — default **0** | **2% of max a second** + `hpRegen`; eating ×3 (6%) | `outOfCombatRegen 0.015` + `hpRegen 0.9` |
| Mana | 1% of max a second + `mpRegen` | 4% a second; drinking 6% | `mpRegen 1` flat |
| Fury / Focus / class gauges | [page 06 §Resources](06-CLASSES.md#4-resources) | page 06 | new |
| Stamina | 25 a second after 0.8 s | 50 a second | new |
| Barrier | 0 (unless an effect) | 8% of barrier size a second | same |
| Follower / pet health | its own regen | 3% a second | same idea |

---

## 19. How enemies scale to level

### 19.1 Farhold today `(reuse: js/rpg.js makeEnemy, data/balance.json enemies)`

Farhold scales an enemy **exponentially** from its level-1 base: health `× 1.13^(level−1)`, damage
`× 1.085^(level−1)`, XP `× 1.09^(level−1)`, armour with the health curve. That fits Farhold, where a
character's power comes mostly from the weapon's level term.

### 19.2 Wildmarch: polynomial curves that track the player `(new)`

In Wildmarch the player's power is the product of three things that each grow in a straight line — the
level term (+5% a level), the item level of the gear (+6% a level, page 08) and the attributes handed out
each level — so it grows like a **power of the level**, not an exponent. The enemy curves are fitted to it,
which keeps the time-to-kill and hits-to-die targets of §1 flat from 1 to 60:

```
enemy health (normal, level L) = baseHealth × (1 + 0.09 × (L − 1)) ^ 2.5      reference base 64
enemy damage per hit           = baseHit    × (1 + 0.30 × (L − 1))            reference base 6.5
enemy armour                   = K(L) × armourShare / (1 − armourShare)      §8.2
enemy XP                       = page 07 (× 1.04 per level)
enemy gold                     = baseGold   × (1 + 0.07 × (L − 1)) ^ 1.5
```

Each monster in page 10 has its own base health, base hit, attack interval and armour share; the numbers
above are the **reference monster** (a "skirmisher": 64 health, 6.5 a hit every 1.6 s, 25% armour).

### 19.3 The benchmark table

Reference player: one-handed sword, full level-appropriate Uncommon/Rare gear, no talents counted beyond
their average; "solo sustained DPS" includes an average spell rotation (+40%) and crits. Reference enemy as
above. **The simulator (page 16, a Wildmarch version of `tools/sim-emberveil.mjs`) must reproduce these
within ±15% or the curves are retuned.**

| Level | Weapon damage WD (avg hit) | Solo sustained DPS | Normal enemy HP | Normal enemy hit | Time to kill | Cloth HP | Hits to die, cloth | Heavy tank HP | Hits to die, tank | Armour constant K |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 19 | 64 | 6 | 4.4 s | 114 | 21 (33 s) | 148 | 46 (73 s) | 80 |
| 5 | 17 | 42 | 138 | 14 | 4.4 s | 250 | 21 (33 s) | 336 | 47 (75 s) | 160 |
| 10 | 33 | 83 | 282 | 24 | 4.5 s | 420 | 21 (33 s) | 570 | 47 (76 s) | 260 |
| 15 | 55 | 139 | 491 | 34 | 4.7 s | 590 | 21 (33 s) | 805 | 48 (76 s) | 360 |
| 20 | 84 | 214 | 774 | 44 | 4.8 s | 760 | 21 (33 s) | 1,040 | 48 (76 s) | 460 |
| 25 | 121 | 311 | 1,136 | 53 | 4.9 s | 930 | 21 (33 s) | 1,274 | 48 (76 s) | 560 |
| 30 | 168 | 433 | 1,585 | 63 | 4.9 s | 1,100 | 21 (33 s) | 1,509 | 48 (77 s) | 660 |
| 35 | 224 | 584 | 2,126 | 73 | 4.8 s | 1,270 | 21 (33 s) | 1,743 | 48 (77 s) | 760 |
| 40 | 293 | 768 | 2,765 | 83 | 4.8 s | 1,440 | 21 (33 s) | 1,978 | 48 (77 s) | 860 |
| 45 | 374 | 988 | 3,507 | 92 | 4.7 s | 1,610 | 21 (33 s) | 2,213 | 48 (77 s) | 960 |
| 50 | 469 | 1,250 | 4,357 | 102 | 4.6 s | 1,780 | 21 (33 s) | 2,447 | 48 (77 s) | 1,060 |
| 55 | 579 | 1,557 | 5,320 | 112 | 4.6 s | 1,950 | 21 (33 s) | 2,682 | 48 (77 s) | 1,160 |
| 60 | 707 | 1,914 | 6,401 | 122 | 4.5 s | 2,120 | 21 (33 s) | 2,916 | 48 (77 s) | 1,260 |

(Assumptions: reference weapon dice 4–8 at item level 1, +6% per item level; primary attribute 15 at level 1,
+2 a level from levelling and +2.2 a level from gear; CON as [page 07](07-PROGRESSION.md#attributes); enemy
mitigation 25%; cloth mitigation 15%, heavy 50%; heavy armour +15% max HP.)

### 19.4 The level gap

`(new)`


Farhold relied on the separate health and damage curves to make a higher-level enemy tough. With polynomial
curves one level is a smaller step, so Wildmarch adds an explicit gap factor (step 8 of §6.2):

| Enemy level − your level | Your damage to it | Its damage to you | Con colour (Farhold `zoneTone`) |
|---:|---:|---:|---|
| −5 or lower | +20% | −20% | grey (trivial; no XP, [page 07](07-PROGRESSION.md#kill-xp-and-the-grey-level-rule)) |
| −4 … −3 | +8% / +4% | −8% / −4% | green (easy) |
| −2 … +2 | 0 | 0 | white / yellow (even) |
| +3 | −6% | +6% | orange (hard) |
| +4 | −12% | +12% | orange |
| +5 | −18% | +18% | red (deadly) |
| +6 | −24% | +24% | red |
| +7 or higher | −30% | +30% | red with a skull |

### 19.5 Ranks

| Rank | Health × | Damage × | Armour × | XP × | Knockback taken | Where | Farhold |
|---|---:|---:|---:|---:|---:|---|---|
| Normal | 1 | 1 | 1 | 1 | ×1.0 | everywhere | same |
| Champion (1 modifier, glow) | 2.6 | 1.35 | 1.4 | 2.4 | ×0.70 | 11% of open-world spawns | same |
| Rare (2 modifiers, own name) | 4.5 | 1.6 | 1.7 | 4.5 | ×0.50 | 3% of open-world spawns | same |
| Elite (dungeon/raid trash) | 3.0 | 1.5 | 1.2 | 2.0 | ×0.40 | instances, world-boss adds | new |
| Mini-boss (event, stronghold) | 10 | 1.8 | 1.3 | 8 | ×0.25 | events, strongholds | new |
| Dungeon boss (5) | 40 (Normal) | 2.2 (on the tank) | 1.3 | 20 | ×0.25 | page 12 | Farhold `boss` placed by hand |
| Raid boss (10 / 20) | 180 / 340 | 2.6 | 1.4 | 20 below level 60 (first kill per boss per week, [page 07](07-PROGRESSION.md#events-discovery-dungeons-raids)); renown only at 60 | ×0.25 | page 13 | new |
| World boss | 60 per contributing player, capped at 40 players | 2.4 | 1.4 | 30 (once a day) | ×0.25 | page 13 | Farhold `data/worldbosses.json` |

Pages 11–13 may override any boss row; these are the defaults a boss is written against.

### 19.6 Level sync in dungeons `(new)`

A player above a **Normal** dungeon's band who enters it through the group finder is **synced down** to the
band's top level; gear is treated as item level `bandTop + 3` at most. Entering directly (not through the
finder) with a party is not synced (so friends can help friends), but the loot and XP then follow the grey
rule. Heroic and Mythic+ are level 60 only.

---

## 20. How damage scales in groups

- **Normal enemies do not scale** with the number of attackers. Three players on one wolf kill it in a third
  of the time; that is the point of grouping.
- **Champions, rares, event mini-bosses in the open world** scale with the number of **players** who have
  damaged or healed against them in the last 10 s (followers count as a quarter each): health × `(1 + 0.75 ×
  (N − 1))`, damage × `(1 + 0.10 × (N − 1))`, N capped at 5.
- **World bosses**: health = 60 × normal × players tagged, recalculated once a second while the fight is
  fresh (first 30 s), then locked; damage flat (page 13 owns the rest).
- **Dungeons and raids are tuned for a full group** (5, 10 or 20) and **do not** scale down. A Normal
  dungeon is soloable because **followers fill the empty slots** (canon pillar 6).
- **Followers** have their damage capped at 75% of the top of their owner's weapon swing (Farhold R22
  `FOLLOWER_SHARE_CAP`), scale with the owner's level, and in a group of players each follower counts
  against the group size (5 bodies in a 5-player dungeon: 3 players may bring 2 followers).
- **Loot tagging** (page 08/15 own the details): everyone who dealt or healed at least 3% of the enemy's
  health gets their own roll (personal loot); XP splits per [page 07](07-PROGRESSION.md#group-xp).

---

## 21. PvP combat rules

`(new — page 15 owns queues, flagging, zones and rewards; these are the combat numbers)`

| Rule | Value |
|---|---|
| Player damage to players (and their pets/followers) | ×0.65 |
| Healing on players in PvP combat | ×0.70 |
| Absorbs on players in PvP combat | ×0.70 |
| Crit damage vs players | halved: base crit ×1.25 instead of ×1.5 |
| Crowd control | full DR (§11.2); any single CC capped at **4 s** (sleep/fear 6 s) |
| Knockback | ×0.60 distance |
| Stagger | max 0.4 s per hit, DR as §5 |
| Hit-stop | never on the victim's screen; attacker's screen only |
| Passive dodge vs players | halved (cap 17.5%) — rolls still fully work |
| Followers | allowed in open-world PvP at ×0.5 damage; **not** allowed in arenas or battlegrounds (class pets that ARE the class mechanic are allowed at ×0.65 damage) |
| Level brackets (battlegrounds) | 20–29, 30–39, 40–49, 50–59, 60. Everyone is raised to the **top** of the bracket: stats computed as that level; gear treated as item level ≤ bracket top + 2 |
| Arenas | level 60, gear item level normalised to a PvP value per slot (page 15) |
| Duels | anywhere outside towns, from level 10; end at 1 HP; no durability loss |
| Death in PvP | no durability loss; battlegrounds release to the team's graveyard with a 15 s wave timer (page 15) |

---

## 22. Night danger

Canon: a day is 60 real minutes, **45 day / 15 night** (page 00). Farhold's night was dayFraction < 0.25 or
> 0.78 of a 900 s day (47% of the time dark), with a torch carried in the **light** slot, an ambient floor of
0.16 so night is dark but playable, and the `nightSpawn` family swap near towns (R27).

Wildmarch night rules `(new unless marked)`:

| Rule | Value |
|---|---|
| Spawn budget | ×1.30 more enemies alive around you |
| Night families | 25% of spawns come from the region's night list (undead, shades, dire beasts — page 10) `(reuse idea: balance.gates.nightSpawnShare)` |
| Champion chance | ×1.5 (11% → 16.5%) |
| Enemy damage | +10% |
| Notice range | ×1.25 while your light is lit; ×0.80 with no light — but you see only as far as the moon lets you (≈16 m) |
| Night-only rares | each region has 2–3 rares that only spawn at night (page 10) |
| Rewards | **+20% kill XP** and **+15% magic find** at night |
| Safe ground | within 150 m of a town's lamps, none of the above applies |
| Light | Farhold's torch (34 m, `balance.light.torch`) in the light slot; L toggles it `(reuse: js/light.js)` |
| The hint | at night with the light off, one log line: "Press L to light your torch." (Farhold R17) |

---

## 23. Online rules that touch combat

Page 16 owns netcode; these are the combat-specific rules the server must enforce.

| Rule | Value |
|---|---|
| Authority | the **server** decides every hit, heal, status and death. The client predicts its own swings, rolls and movement and draws them at once. |
| Lag allowance for i-frames | the server rewinds the roller by up to **120 ms** when judging whether a hit landed inside i-frames |
| Projectiles | server-simulated; the client draws a predicted projectile and corrects it |
| Ground telegraphs | the server sends them with the **full** warning time (page 11 minimums); the client never shortens them |
| Tick rate for statuses | 1 s, server-side |
| Combat log | every hit/heal/absorb/status/death is a server event, fed to the meters and the log |

---

## 24. What changed from Farhold, in one table

| System | Farhold | Wildmarch | Why |
|---|---|---|---|
| Power numbers | one (weapon damage), spell power as a strike-time multiplier | two: WD and SP, each applied once | canon's "% WD or % SP"; kills the squared-spell-power class of bug |
| Level term | +11% a level on the weapon dice | +5% a level, plus item level +6% | gear matters again; old weapons fall behind |
| Attribute scaling | 3% per point | 1% per point (far more points) | attributes grow every level (page 07) |
| Enemy curves | exponential (1.13 / 1.085 / 1.09) | polynomial, fitted to flat TTK | Wildmarch's player power is polynomial |
| Armour | `100 / (100 + A)` | `A / (A + 60 + 20 × attackerLevel)`, cap 75% | the same armour means the same thing at every level |
| Resistances | one `magicResist` | one per element + Magic Resistance | enemies have elemental profiles |
| Avoidance | passive dodge only | dodge roll with i-frames, active block, parry, passive dodge (capped, not vs telegraphs) | action combat |
| Stamina | none | 100-point bar | sprint/roll/block cost |
| CC | stagger only, 1 DR rule | 8 categories, 18 s DR, boss break bar | groups and PvP |
| Threat | 5-s attention + body-in-the-way | full threat table, tank ×4, taunt, swap 110/130% | tanks and healers |
| Heals | self heals, regen buff, life steal | SP-based heals, HoTs, smart heals, overheal | healer role |
| Absorbs | barrier stat | barrier + spell shields, soonest-first, 100% cap | shield healers |
| Death | respawn full, −10% gold | release/corpse run/shrine revive, durability, battle revive charges, no gold loss | online game |
| Status numbers | tuned for one player | group-tuned (Shocked 30→15%, Might 30→20%, Guarded 45→30%…) and capped | five players stack them |
| Night | 47% of a 15-min day, spawn swap near towns | 25% of a 60-min day, more and harder enemies, better rewards | canon day |
| PvP | none | full rules §21 | online |

---

## 25. Data shapes

Page 16 owns file names; these are the shapes this page needs. All JSON, all data-first.

**A status** (`data/statuses.json`, reuse of Farhold's `data/skills.json statuses` block, extended):

```json
{
  "burn": {
    "name": "Burning", "kind": "damage", "element": "fire",
    "totalShare": 0.40, "seconds": 4, "tick": 1,
    "stackMax": 1, "refresh": "longer-stronger",
    "dispel": "magic", "endsInWater": true,
    "cc": null, "icon": "fa-fire", "aura": "burn"
  },
  "sleep": {
    "name": "Asleep", "kind": "control", "element": "arcane",
    "seconds": 8, "cc": "incapacitate", "breaksOnDamage": 0,
    "dispel": "magic", "icon": "fa-moon", "aura": "sleep"
  }
}
```

**A strike shape and a weapon family**: exactly Farhold's `STRIKES` and `WEAPON_PATTERNS` / `WEAPON_TRAITS` /
`FAMILY_WIND` / `RANGED` tables, moved from code into `data/weapons.json` so they can be tuned without code.

**An enemy's combat block** (page 10 fills one per monster):

```json
{
  "id": "m_wolf_grey_prowler", "baseHealth": 58, "baseHit": [5, 8], "attackEvery": 1.5,
  "armourShare": 0.25, "resist": { "ice": 0.2, "fire": -0.1 },
  "notice": 18, "social": 10, "rank": "normal",
  "telegraphs": ["lunge_line_4m"], "statusOnHit": { "id": "bleed", "chance": 0.2 }
}
```

**A combat event** (server → client, feeds the log and meters; reuse of the `meters/` record):

```json
{ "t": 1234.56, "src": "p:Wren", "dst": "m:m_wolf_grey_prowler#88", "via": "ranger_aimed_shot",
  "kind": "damage", "element": "physical", "amount": 409, "crit": false,
  "mitigated": 136, "blocked": 0, "absorbed": 0, "overkill": 0, "threat": 409 }
```

---

## 26. Open questions

(Also in `QUESTIONS.md` when that page exists.)

1. **Dodge key.** Farhold uses Space for jump. Should dodge be its own key (suggested Left Ctrl) or should
   Space become dodge and jump move? Recommendation: own key, double-tap option. **Resolved (00 §10):** dodge is
   its own key, `F`; Space stays jump.
2. **Death cost.** This page removes Farhold's 10% gold loss and uses durability + time. Is that the feel you
   want, or do you want a gold cost back?
3. **Heavy armour move penalty** of 5% — keep, or none at all?
4. **Held block on a mouse button** conflicts with right-mouse camera drag if that is kept. Page 02 decides;
   recommendation: right mouse = block when a shield is worn, camera drag moves to middle mouse. **Resolved
   (00 §10 — page 02's table):** right mouse (hold) is `secondary`, which is block when a shield is worn.
5. **Arcane ignoring half of resistances** makes arcane classes strong into resistant bosses. Keep?
