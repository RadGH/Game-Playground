# WILDMARCH — Design Bible, page 05: Combat

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Owns:** every combat formula, **the tag list and
the tag rule** ([§22](#22-tags)), Tab targeting and the spell targeting kinds as combat rules
([§2](#2-aiming-and-targeting)), the numbers of the three resources ([§18.3](#183-resources-mana-momentum-tempo)),
the status list, crowd control and diminishing returns, threat, healing and absorb rules, death and revive,
durability, regeneration, group and level scaling of enemies, friendly duels.
**Reads from:** [page 00](00-OVERVIEW.md) (canon), [page 02](02-CONTROLS.md) (keys, targeting keys),
[page 06](06-CLASSES.md) (spell rules, hybrid roles), [page 07](07-PROGRESSION.md) (attributes, levels),
[page 08](08-ITEMS.md) (item bases, affixes, quivers), [page 11](11-BOSS-MECHANICS.md) (telegraphs, boss rules),
[page 12](12-DUNGEONS.md) (Challenge mode and Depth), [page 15](15-SOCIAL-ONLINE.md) (duel invites).

**Round 2 in one paragraph.** Wildmarch uses **Tab targeting**: one hard target that never changes by itself,
and every spell is *Needs target*, *Auto-target*, *Ground* or *Self*. Every skill, basic attack, item and affix
carries **tags**, and a bonus applies only to a skill that has **every** tag the bonus names. The three
resources are **Mana, Momentum and Tempo**. There is **no limit on in-combat revives**, **no night** (always
daylight), and the only player-versus-player fighting is the **friendly duel**. Everything is tuned for groups
of at most **5**; only world bosses scale past that. Dungeon difficulties are **Normal** and **Challenge**, with
**Depth** as a separate dial (page 12).

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
21. [Duels](#21-duels)
22. [Tags](#22-tags)
23. [Online rules that touch combat](#23-online-rules-that-touch-combat)
24. [What changed from Farhold, in one table](#24-what-changed-from-farhold-in-one-table)
25. [Data shapes](#25-data-shapes)
26. [Open questions](#26-open-questions)

---

## 1. Combat at a glance

Wildmarch is a **third-person action RPG with Tab targeting**: you pick one enemy (or ally) as your target
and it stays your target until **you** change it; basic attacks and area spells land where you face and aim,
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
| Champion pack member (blue name, one shared affix) | 2.6× health, 1.35× damage each (Farhold ranks) | A blue pack is a real fight for one player |
| Rare (yellow name, 2–3 affixes, with minions) | 4.5× health, 1.6× damage | A solo player needs cooldowns or a follower |
| Greater rarity (Giant, Flaming, Electrified, Frozen… on top of any rank) | page 10 owns the numbers; default ×1.8 health, ×1.2 damage per greater rarity | A spike you plan for, usually one monster |

---

## 2. Aiming and targeting

Canon 00 §12.1 W8: **Tab targeting, closer to the classic MMO model.** The owner's complaint about Farhold is
the fix: Farhold's target frame often showed **the wrong enemy's** health bar, because it followed whatever was
nearest or was hit last. In Wildmarch the frame shows **one hard target** and only the player changes it.
Page 02 owns the keys; this section owns the rules.

### 2.1 Camera and aim point `(reuse: js/player.js, js/main.js aim())`

- **Over-the-shoulder camera**, shoulder offset 0.85 m, lift 0.25 m (Farhold `balance.player.shoulderOffset`,
  `cameraLift`). Shoulder side swaps with a key ([page 02](02-CONTROLS.md)). Setting: `set.controls.shoulder` (Left / Right).
- A small **aim point** (a dot) sits at screen centre. What it points at is decided by a ray from the camera
  (Farhold R16 made `aim()` a 3D hitscan from the camera; Wildmarch keeps it). The aim point is used for
  basic attacks, Auto-target spells with no target ([§2.4](#24-the-spell-targeting-kinds)) and Ground spells.
- **The character turns to face its target** (or the aim point, with no target) when an attack or spell starts,
  never while idle, so you can run one way and look another.

### 2.2 The hard target `(new)`

| Rule | Value |
|---|---|
| How many | **one** at a time, enemy **or** friendly (yourself included) |
| Shown as | a ring on the ground under it (red enemy, green friendly), a bracket over its nameplate, and the **target frame** (health, cast bar, statuses, your threat %, its target — page 03) |
| **Changes only when you change it** | `Tab` / `Shift+Tab` (next / previous enemy), clicking a body or a nameplate, `F1` (yourself), `F2`–`F5` (party members, or clicking their party frames), `/target <name>`, the "assist" key (take your target's target), `Esc` (clear). **Nothing else changes it**: not an enemy getting closer, not an enemy hitting you, not your pet's target, not a new pull |
| When it dies | the frame shows the corpse for 1.5 s, then clears. It does **not** jump to another enemy (setting `set.combat.retargetOnDeath`: Off (default) / Next enemy in front — for players who want it) |
| When it goes away | beyond **60 m** the frame clears; out of line of sight it stays (greyed) — you keep your target behind a pillar |
| Tab order | the first press takes the enemy **nearest the aim point**; each further press cycles outward by distance within **40 m** and a **90° cone** in front (page 02 / page 04 own the range and cone); only enemies in line of sight; bodies already in combat with your group first. `Shift+Tab` goes back |
| Friendly targets | clicking an ally or its frame, `F1`–`F5`. A friendly hard target does not stop your basic attacks — they go at the enemy you face |
| Mouse-over | with `set.combat.mouseoverCast` On, a spell cast while the cursor is over a unit frame or a body goes to that unit **without** changing your hard target (healers use it on party frames). Default Off |
| Camera | with `set.combat.lockCamera` on, the camera keeps the hard target on screen (accessibility option; off by default) |

### 2.3 Basic attacks and the target

Basic attacks never need a target (a wand's or staff's included, although those also carry the Spell tag, §22.4):

| Attack | Rule |
|---|---|
| Melee basic attack | swings along your facing. If your **hard target** is inside **1.5 × the strike's reach** and within **60°** of your facing, the character turns onto it for the swing (720°/s). With no hard target, the aim-assist setting may turn you onto the enemy nearest the aim point within the same reach and **25°** |
| Ranged basic attack (bows, crossbows, firelock, javelin, thrown knives, wand) | flies at your **hard target** if it is an enemy in range and within 60° of your facing; otherwise at whatever the aim-point ray hits (within **0.6 m** of a body counts as aimed at it; the projectile curves up to 3° to meet it) |

Setting `set.combat.aimAssist`: Off / Melee only (default) / Melee and ranged. It never sets or changes the hard target.

### 2.4 The spell targeting kinds

`(new — canon W8)`

Every spell names **one** targeting kind on its class page (template 00 §5, the "targeting" field). These are
the only five:

| Kind (card text) | Data id | Used for | What happens when you press it |
|---|---|---|---|
| **Needs target** | `target` | single-target finishers, interrupts, debuffs, anything that must land on one chosen enemy | Casts on your hard target if it is a valid **enemy** in range and in line of sight. Otherwise it **refuses** and spends nothing: "No target." / "Out of range." / "Out of sight." / "Not a valid target." |
| **Needs target (ally)** | `ally` | heals, buffs, shields, dispels, revives | Casts on your hard target (or the mouse-over unit) if it is a valid **friendly** unit — you, a party member, a follower or a pet. With an enemy or nothing targeted it **refuses** ("No friendly target."). Healers target themselves with `F1`. Setting `set.combat.allySelfFallback`: Off (default) / On — On casts on yourself instead of refusing |
| **Auto-target** | `auto` | most damage spells, projectiles, chains, gap closers | Casts on your hard target if it is a valid enemy in range. **If you have no valid target**, it picks **the valid enemy closest to where you are aiming** (nearest to the aim-point ray, measured at the enemy's distance) within the spell's range and line of sight, and casts on it. With `set.combat.autoTargetSets` On (default) that enemy **becomes** your hard target; Off leaves your target empty. Nothing in range → "No target in range." |
| **Ground** | `ground` | circles on the ground, walls, traps, rods | A reticle follows the aim point out to the spell's range; click (or press again) to place. `set.combat.quickcastGround` places it at once on the aim point. With `set.combat.groundAtTarget` On, it drops at your hard target's feet instead |
| **Self** | `self` | cones, lines and circles from your own body, stances, auras, self-buffs | Needs nothing; the shape starts at you along your facing |

**Rules for class writers:**

- A cone, line or circle "from you" is **Self**, never Auto-target. A dash that travels to an enemy is
  **Auto-target**; a dash in the direction you face is **Self**.
- A spell that **must** land on one chosen body is **Needs target**; a spell that should still fire in a panic is
  **Auto-target**. Every heal on one ally is **Needs target (ally)** — never Auto-target (the owner: healing
  spells should require a distinct target).
- A group heal around you is **Self**; a heal circle you place is **Ground**.
- **Global cooldown 1.0 s** (canon; [page 06 §6](06-CLASSES.md#6-the-global-cooldown)). A refused spell does
  not start the GCD.

### 2.5 Range, line of sight, facing

- **Range** is measured from the edge of your body (radius 0.45 m, Farhold `bodyRadius`) to the edge of the
  target's body. A spell with range 30 m works on a large boss whose centre is 34 m away.
- **Line of sight**: a target-shape spell, a heal and a ranged basic attack need an unblocked line from
  your chest (1.4 m up) to any of three points on the target (feet, chest, head). Refusal: "Out of sight."
- **Facing**: cones, lines and melee strikes aim along your facing; target spells do not need facing (the
  character turns for you).

### 2.6 Friendly fire

None. Nothing a player does hurts another player or their followers, except in a duel ([§21](#21-duels))
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
| Sabre / scimitar | 1 | slash · slash · arc | 2.7 | 1.5 | 0.46 | 105 | ×1.00 | **Flow**: connect twice and the third strike costs 0.35× its clock; Rhythm |
| Sword | 1 | slash · slash · arc | 2.8 | 1.4 | 0.58 | 120 | ×1.00 | Guard 8%; **Rhythm** +8% per consecutive connecting strike, max +16% (Farhold called this trait "Momentum"; renamed so it never clashes with the resource) |
| Longsword | 1 | slash · slash · overhead | 3.0 | 1.5 | 0.64 | 130 | ×1.00 | Guard 8%; Rhythm |
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
| **repeat** | every melee weapon, crossbow, hand crossbow, firelock, javelin, throwing knives, wand | …swings/shoots/casts on the weapon's clock. Nothing builds. |
| **charge** | bow (all three), staff | …builds power; releasing fires. At the ceiling the weapon releases itself, so holding gives a stream of full-power shots. |

### 4.4 Dual wielding and two-handers `(reuse: js/weapons.js handPlans, offhandRefusal, OFFHAND_DAMAGE)`

- **Everyone may dual wield** two one-handed weapons (canon keeps Farhold's rule). The off hand runs **its
  own pattern on its own clock**, rolls **its own dice** (Farhold R14) and hits for **60%** (`OFFHAND_DAMAGE`).
  The off hand may only wind up while the main hand is recovering.
- A **two-handed weapon** empties the off hand, except: a **quiver** stays with a bow (Farhold R22), and the
  Doubled Grasp capstone allows two two-handers ([page 07 §Perk forest](07-PROGRESSION.md#perk-forest)).
- Bows need both hands to draw and cannot go in the off hand.

### 4.5 Ranged weapons `(reuse: js/weapons.js RANGED, drawPower)`

| Weapon | How it fires | Timing | Power | Range | Splash on impact | Pierces |
|---|---|---|---|---:|---:|---:|
| Shortbow | draw | nock 0.28 s → full 0.75 s; shakes after 1.4 s | 0.55× → 1.40× | 38 m | 0.9 m (half damage at the rim) | 1 |
| Bow | draw | nock 0.35 s → full 0.95 s; shakes after 1.6 s | 0.55× → 1.60× | 46 m | 0.9 m | 1 |
| Longbow | draw | nock 0.40 s → full 1.10 s; shakes after 1.8 s | 0.55× → 1.75× | 54 m | 0.9 m | 2 |
| Crossbow | reload | one bolt, then 1.25 s reload you cannot attack through | 1.80× | 50 m | 0.9 m | 2 |
| **Hand crossbow** `(new)` | repeat, one-handed | one bolt every 0.55 s; may be dual-wielded or paired with a dagger | 0.75× | 32 m | 0.6 m | 0 |
| **Firelock** (gun) `(new)` | reload | one shot, then 1.6 s reload; a 0.25 s muzzle delay you can see | 2.10× | 44 m | 0.6 m | 1 |
| Javelin | throw | 0.75 s | 1.15× | 28 m | 1.4 m | 0 |
| **Throwing knives** `(new)` | repeat, one-handed | one knife every 0.45 s; may be paired with a dagger (the off hand throws on its own clock) | 0.70× | 24 m | 0.3 m | 0 |

The three `(new)` families exist because canon 00 §6 gives classes hand crossbows (demon hunter, rogue),
guns (tinker) and thrown weapons (scavenger, rogue). Page 08 owns their bases and item levels.

Past the shake point a drawn bow loses 3% power per extra second held, floored at 50% (Farhold `decay`).
A release before the nock keeps drawing to the nock and fires the 0.55× shot (Farhold's "nothing you
pressed is thrown away"). **There is no ammunition** (Farhold R16).

**Quivers** (canon 00 §12.3; page 08 owns the items) are the off hand of a bow or crossbow and work like
Farhold's off-hand foci: a **damage stat-stick** (flat and % damage lines that apply to the whole character,
by tag — [§22](#22-tags)). Some quivers also roll **one basic-attack effect** (fire arrows, exploding arrows,
multi-shot…). A quiver effect only ever touches a hit tagged **Basic Attack** — your own basic attacks and
class spells that carry that tag ([§22.4](#224-which-tags-a-basic-attack-and-a-quiver-effect-carry)).

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
fire has Flame Cone, Cinder Nova (Farhold's "Ember Nova", renamed), Flame Wave, Exploding Fireball; ice Rime Cone, Frost Nova, Shard Volley;
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

**Focus** (off-hand item: grimoire, orb, reliquary, effigy — Farhold R25 `js/foci.js`; "focus" here is the
item, not a resource) — worn, not swung; a stat-stick for casters, as a quiver is for bows; page 08.

### 4.7 What basic attacks give back `(new)`

The full resource rules are in [§18.3](#183-resources-mana-momentum-tempo); this is the basic-attack part.

| Resource | From a connecting basic attack |
|---|---|
| **Momentum** | main hand: `round(7 × the weapon's seconds per strike)`, minimum 2 (dagger 2, sword 4, greatsword 7, crossbow 9); off hand half that; a pattern finisher (arc, slam, lunge, a last overhead) ×2 |
| **Tempo** | nothing (Tempo refills on its own in about 4 s) |
| **Mana** | nothing, except wands and staves: +0.5% of max mana per connecting bolt or cast (at most once per 0.5 s); and the witch hunter's class rule **Silver Tithe**: +1% of max mana per crossbow basic-attack hit ([classes/witch_hunter.md](classes/witch_hunter.md)) |

Class mechanics may add their own (e.g. a rogue's **Wound** opened by a basic hit from a blind spot) — the
class file says so.

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
WD_min/max = ( weaponDice_min/max × LevelTerm + FlatDamage ) × AttrScale

LevelTerm  = 1 + 0.05 × (level − 1)          Farhold: 1 + 0.11 × (level − 1)
AttrScale  = 1 + 0.01 × weaponAttribute      Farhold: 0.03 per point
             weaponAttribute = STR for heavy weapons, DEX for light and ranged, INT for magic weapons
FlatDamage = sum of "+N damage" affixes and perk nodes (added AFTER the level term, Farhold R14)
```

**Spell Power (SP)** — what magical spells, heals and shields are a share of `(new)`:

```
SP = ( spellDice_mid × LevelTerm + FlatSpell ) × (1 + 0.01 × INT)

spellDice  = the main-hand weapon's dice × 1.0 for a magic weapon (wand, staff, sceptre),
             × 0.8 for anything else (a paladin's mace still powers a paladin's spells)
             + the off-hand focus's spell dice if one is worn (page 08)
FlatSpell  = sum of "+N spell damage" affixes
```

SP is a **single number** (the midpoint); spells roll ±10% around it.

**Where the "+N% damage" lines went (round 2).** Round 1 folded every "+N% damage" into WD and Farhold's
`spellPower` into SP. With tags, a percentage bonus depends on **which skill** is hitting ("+20% damage with
Area Spells" helps a Blizzard and not a Fireball), so it cannot live in a number the character sheet computes
once. Every percentage bonus is now a **tag bonus** added up per hit at step 2b of §6.2
([§22.3](#223-how-tag-bonuses-stack)). An old untagged "+10% damage" is simply a tag bonus that names no tags,
and Farhold's `spellPower` becomes "+N% damage with Spells". It is applied **once, at step 2b**, and never
again: `rpg.strike`'s `if (element !== 'physical') amount *= 1 + spellPower` line does **not** exist in
Wildmarch, and a test must fail if any tag bonus is counted in two places. The character sheet still shows
WD and SP, plus a **"with your spells"** readout per spell (page 03) that includes the matching tag bonuses.

### 6.2 One hit, in order

Every hit — basic attack, spell, follower, trap, boss mechanic — runs this list, in this order, in **one
function** (`strike()`, reuse of `js/rpg.js strike` with the changes marked).

| Step | What happens | Formula / rule | Farhold |
|---:|---|---|---|
| 0 | **Can it miss?** | Target is rolling (i-frames) → **no effect**. Target is a player with passive dodge → `rng < min(35%, dodge)` → "Dodged", no damage. Enemies never dodge. Boss telegraphs skip this step. | Same dodge roll; i-frames new |
| 1 | **Roll the base** | Weapon hit or physical spell: uniform roll in `[WD_min, WD_max]`. Magical spell, heal or shield: `SP × uniform(0.9, 1.1)`. | Same, SP new |
| 2 | **× the coefficient** | Basic attack: strike damage share × family damage × hand share (1.0 main, 0.60 off) × draw/charge power. Spell: the % written on the class page (e.g. 140% WD). DoT tick: the tick's share of its total. | Same (`multiplier`) |
| 2b | **× tag bonuses** | `× (1 + sum of every damage bonus whose tags this hit has ALL of)` — one additive bucket per hit ([§22.3](#223-how-tag-bonuses-stack)). Element bonuses count only for the part of the hit in that element | new (replaces Damage% and spellPower) |
| 3 | **× position and weapon traits** | Backstab ×2.2 (dagger, rear 100°); Rhythm ×1.08/×1.16 (sword, sabre); Brace ×1.25/×1.35 (spear/polearm vs a body that closed on you this second); Far Shot capstone (×0.75 under 4 m, up to ×1.5 at 46 m) | Same (`js/actors.js strike`) |
| 4 | **+ flat on-hit, × gear conditionals** | `(amount + flatOnHit) × product(gear dmgOut hooks)` — "vs undead", "vs burning", execute, etc. (`js/effects.js dmgOut`) | Same |
| 5 | **× the attacker's statuses** | `× (1 + sum of damage buffs) × (1 − sum of dealLess, cap 60%)` — Might, Rallied, Weakened… | Same (`outgoingFrom`), cap was 80% |
| 6 | **Critical?** | `rng < critChance` (+ gear critBonus; Riposte forces it). Crit: `× (1 + critDamage)`. [§7](#7-critical-hits) | Same |
| 7 | **× the target's statuses** | `× (1 + sum of takeMore, cap +50%) × (1 − sum of resist buffs, cap 60%)` — Shocked, Marked, Cursed, Guarded… | Same (`incomingFrom`); caps new |
| 8 | **Level gap** | `× gapFactor` — [§19.4](#194-the-level-gap) | new |
| 9 | **Mitigation** | Physical: armour ([§8](#8-armour)). Magical: the element's resistance ([§9](#9-elements-and-resistances)). True damage (a few boss mechanics): none. | Formula changed |
| 10 | **Flat reductions** | `× (1 − resistAll%)` then `× product(defender's gear dmgIn hooks)`, floored so at least **25%** of step 9's result remains | Same floor |
| 11 | **Duel** | Player vs player in a friendly duel (or their pets): `× 0.65` ([§21](#21-duels)) | new |
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
| Every "+N% damage" / tag bonus (incl. the old Damage% and SpellDamage%) | step 2b | WD, SP, step 4, step 5 |
| Slot level and cooldown value of a spell | **the number printed on the class page** (the design budget, [page 06 §Spell budget](06-CLASSES.md#8-the-spell-power-budget)) | at run time — Farhold's `effectiveMult` is a *design tool* in Wildmarch, not a runtime multiplier |
| Status buffs/debuffs on the attacker | step 5 | the class spell's number |
| Status debuffs on the target | step 7 | step 5 |
| Crit | step 6 | DoT ticks (they do not crit unless a talent says so) |
| Duel | step 11 | anywhere else |

### 6.4 Worked example (level 30)

A level-30 fighter, greatsword `WD 150–186` (midpoint 168), third strike of the pattern (overhead), with
"+10% damage with Melee Attacks" on a ring and "+8% Physical damage" from a perk, a +12% "vs beasts" gear
conditional, under **Might (+20%)**, into a **Shocked** (+15%) even-level wolf with 25% physical mitigation,
no crit. The overhead is tagged *Attack, Basic Attack, Melee, Area, Physical*, so both tag bonuses apply:

```
168 (mid roll)
× 1.75 (overhead) × 1.20 (greatsword family)   = 352.8
× 1.18 (tag bonuses: 10% + 8%, added)            = 416.3
× 1.12 (gear conditional)                        = 466.3
× 1.20 (Might)                                   = 559.5
× 1.15 (Shocked)                                 = 643.4
× 1.00 (level gap: even)                         = 643.4
× 0.75 (armour 220 vs K(30) = 660 → 25%)         = 483
→ 483 damage. The wolf has 1,585 health: four overheads.
```

A level-30 mage casting **Fireball**, written as "210% SP as fire", tagged *Spell, Ranged, Projectile, Fire*,
with SP 172. The mage wears a ruby in the staff ("+15% Fire damage"), has "+10% damage with Spells" from a
perk, and the staff's unique line "+20% damage with **Area Spells**" — which does **not** apply, because
Fireball has no Area tag (its splash does not make it an area spell, [§22.2](#222-the-rule-a-bonus-needs-every-tag-it-names)).
Into an enemy with 20% fire resistance, crit (critDamage +50%):

```
172 × 1.04 (roll) × 2.10 = 375.7  × 1.25 (tags: 15% + 10%) = 469.6
× 1.5 (crit) = 704.4  × 0.80 (resist) = 564 → 564 damage.
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
| **Bleed** | a Bleed dispel, a Bandage (out of combat), any single heal of 30%+ of max HP | Bleeding, Hemorrhage, Festering |
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
| `festering` | Festering | −50% healing received | 8 s | 1 | Bleed | `fa-bandage` | new (round 1 called it "Wounded"; renamed because the rogue's **Wounded** is a different thing, §10.8) |
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
| `hidden` | Hidden | enemies notice you at 25% of their range; broken by attacking, casting, taking damage. Only a few class spells and consumables grant it (the rogue has **no** stealth — canon W29) | until broken | 1 | — | `fa-user-secret` | Farhold `stealth` stat (a notice-range multiplier); renamed from "Stealthed" in round 2; not called "Unseen" because an **Unseen hit** is the rogue's rule, §13.7 |
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
and the caps in §10.7. **Round 2:** the class files are being rewritten at the same time as this page (new
systems for rogue, druid, shaman, warlock, demon hunter, mage). Rows marked *(re-check)* belong to a rebuilt
class and must be re-synced with its file once it lands; a class file that adds a status adds a row here.
Every class status also carries tags when it deals damage or heals (its ticks carry the applying spell's tags
plus *Over Time*, [§22.4](#224-which-tags-a-basic-attack-and-a-quiver-effect-carry)).

| Status | Kind | Short rule (see the defining page) | Defined by |
|---|---|---|---|
| `thornseed` | enemy DoT (nature) | ticks nature damage, bursts in a 4 m circle; jumps to the nearest enemy within 8 m if the target dies | [classes/druid.md](classes/druid.md) |
| `torn` Torn | enemy DoT (physical, stacks) | the druid's Wolf-form bleed: 12% claw damage a second per stack, 6 s, 3 stacks (5 with a talent); a **Bleed** for dispels; icon `fa-teeth`. Ticks carry Attack, Physical, Over Time | [classes/druid.md](classes/druid.md) |
| `heartwood` | ally buff | armour + damage-to-healing (Heartwood Ward) | [classes/druid.md](classes/druid.md) |
| `static_scale` | enemy debuff | next hit on it chains 60% WD to one more enemy within 6 m, 5 s | [classes/dragon_knight.md](classes/dragon_knight.md) |
| `hellsight` | self buff | +20% crit, immune to Blind, Confuse, Fear and Charm, 8 s *(re-check: the demon hunter was rebuilt around Demonsight and traps, W27; may be retired)* | [classes/demon_hunter.md](classes/demon_hunter.md) |
| `pact` | self buff | DoTs tick ×2 and +30%, 12 s *(re-check: the warlock was rebuilt around Tithes and Bind Demon, W32)* | [classes/warlock.md](classes/warlock.md) |
| `blight` Blight | enemy DoT (shadow) | the warlock's slot-1 curse: 20% SP on hit + 150% SP over 12 s; spreads when the target dies; a **Curse** for dispels (§10.2). Tags Spell, Shadow, Curse, Over Time | [classes/warlock.md](classes/warlock.md) |
| `hunters_brand` Hunter's Brand | enemy debuff (stacks) | +5% damage taken from the demon hunter, stacks to 3, 10 s; consumed by the demon hunter's finisher | [classes/demon_hunter.md](classes/demon_hunter.md) |
| `unmasked` Unmasked | enemy debuff (Demons only) | +10% damage taken from the party, 10 s; cannot turn invisible, phase, teleport or burrow; a disguised demon drops its disguise | [classes/demon_hunter.md](classes/demon_hunter.md) |
| `rattled` Rattled | enemy debuff | +6% damage taken from all sources, 8 s (+10% with the scavenger's 6-piece set); counts toward the +50% "takes more" cap | [classes/scavenger.md](classes/scavenger.md) |
| `wounded` Wounded | enemy debuff (stacks, per rogue) | the rogue's **Wounds**: each Unseen hit (§13.7) opens 1; +3% damage taken **from that rogue** per Wound, cap 5 (8 from calling III), 15 s refreshed; spent by the rogue's finishers. Not the healing debuff (that is `festering`, §10.5) | [classes/rogue.md](classes/rogue.md) §2.3 |
| `sapped` Sapped | enemy debuff (stacks) | rogue coating: −4% damage dealt per stack, 3 stacks, 8 s; half on a boss. Tags Poison, Curse | [classes/rogue.md](classes/rogue.md) |
| `numbed` Numbed | enemy debuff | rogue coating: casts 20% slower (boss 10%), an interrupt on it locks the school 2 s longer, 8 s. Tags Poison, Curse | [classes/rogue.md](classes/rogue.md) |
| `laid_open` Laid Open | enemy debuff | +8% damage taken from the rogue's party, 6 s (a rogue support talent); counts toward the +50% "takes more" cap | [classes/rogue.md](classes/rogue.md) |
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
| Vowed | ally link | the Knight's Vow of Protection target | [classes/knight.md](classes/knight.md) |
| Reproached | enemy debuff | deals 8% less damage to anyone but the Knight, 6 s | [classes/knight.md](classes/knight.md) |
| Intercept | ally buff | the next hit is taken by the Knight, 4 s | [classes/knight.md](classes/knight.md) |
| Oathbound | self buff | heals 20% of the damage it prevented when it ends | [classes/knight.md](classes/knight.md) |
| Guard Broken | boss debuff | takes 15% more for 4 s (Fighter talent Guard Break, in place of the stun) | [classes/fighter.md](classes/fighter.md) |
| Between Steps | self | untargetable, takes no damage | [classes/monk.md](classes/monk.md) |
| Twilight | self buff | both balance sides' bonuses at full, 8 s | [classes/priest.md](classes/priest.md) |
| Runeforged | ally buff | granted by the Runesmith's circle, 10 s | [classes/runesmith.md](classes/runesmith.md) |
| `shrouded` Shrouded (was "Veiled") | self | the Shadow Dancer's state; works as `hidden` (§10.6) unless the class file says more — renamed in round 2 (no "veil" in names, and not "Unseen", which is the rogue's hit type) | [classes/shadow_dancer.md](classes/shadow_dancer.md) |
| `revealed` Revealed (was `unveiled` Unveiled, 00 §12.4) | enemy debuff | +12% damage from you, 8 s (the Shadow Dancer's debuff; not the Tactician's Exposed) | [classes/shadow_dancer.md](classes/shadow_dancer.md) |
| Tagged | enemy debuff | your Devices prefer it, 6 s | [classes/tinker.md](classes/tinker.md) |
| Broken | boss | break bar full (§11.4) | page 05 / [page 11 §12.2](11-BOSS-MECHANICS.md) |
| Wrath | boss buff (stacks) | soft enrage: +10% damage every 30 s | [page 11 §13](11-BOSS-MECHANICS.md) |
| Sunder (boss stack) | tank debuff (stacks) | +15% boss melee taken per stack, 30 s — **not** the same as `sunder` (§10.5) | [page 11 §26.10](11-BOSS-MECHANICS.md) `mech_sundering_blow` |
| Standing in void | player | shown while inside a void zone | [page 11 §3](11-BOSS-MECHANICS.md) |
| Deepening Cold / Cold | player gauge | a group meter to 100; at 100 **Frozen** | [page 11 §26.10](11-BOSS-MECHANICS.md) (first written for raid r02, now parked in [WISHLIST.md](WISHLIST.md); reused in 5-player dungeons per page 12) |
| Warmth | zone buff | −10 Cold a second while inside | as above |
| Seared | player debuff (stacks) | +8% fire damage taken per stack, 12 s, max 5 | [page 12](12-DUNGEONS.md) d04 |

**Name clashes — Resolved (00 §10, §12.4):** one name, one meaning. The Witch Hunter's mark is `silver_branded`
**Silver-Branded** (the generic `branded` in §10.5 keeps its name), and the Shadow Dancer's debuff is `revealed`
**Revealed** (+12% from you, 8 s; the Tactician's Exposed keeps its name). The class files under `classes/`
must use these names.

---

## 11. Crowd control and diminishing returns

### 11.1 Categories `(new)`

| Category | Statuses | Bosses | Elites (dungeon trash) | Champions / rares | Players in a duel |
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
- **Interrupting** a gold-bordered cast needs a spell tagged **Interrupt** (`tag_interrupt`, class pages), a **Silence**, a
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
| A player in a **Guardian** state (tank stance/form/mechanic — class pages say which; hybrid tanks get it from their tank loadout, [page 06 §3.3](06-CLASSES.md#33-hybrid-roles)) | ×4 |
| Anyone else | ×1 |
| A follower that is a tank (Shield Warden mercenary — page 06) or a pet set to its tank behaviour (a warlock's bound demon, a ranger's tamed bear…) | ×3 |
| Any other follower, pet or controlled body | ×0.5 |
| An illusion or decoy (mage decoy images, enchanter illusions, shadow dancer clones) | as its spell says — decoys are built to pull attention |
| Threat-reducing talents / "Fade"-type spells | as written on the class page |

### 13.3 Who it attacks — the swap rule

The current target keeps aggro until someone passes it by:

- **110%** of the current target's threat, if they are within **6 m** of the enemy (melee range);
- **130%** otherwise.

Normal monsters in the open world also keep Farhold's "body in the way" rule as a **path** rule: if their
path to the target is blocked by another hostile body for 1.5 s, they swing at the body in the way (bosses
and elites never do).

### 13.4 Taunt

- A **taunt** (class spells tagged **Taunt**, and the shared **Provoke** (renamed from "Challenge" in round 2 so it never clashes with Challenge mode) — page 07's ladder, level 10, the 13 classes whose primary or hybrid role is Tank; **Resolved (00 §10)**) sets the taunter's
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

| Enemy rank | Notice range | Social aggro (allies that join when it is hit) |
|---|---:|---:|
| Normal | 18 m (Farhold default 26 m; lowered because the online world is denser) | 10 m |
| Champion pack | 22 m | the whole pack |
| Rare (and its minions) | 24 m | the rare and its minions |
| Dungeon elite | 14 m (packs are linked instead: pull one, pull the pack) | whole pack |
| Boss | by encounter (page 11) | — |

A "smaller notice range" stat (Farhold's `stealth`) multiplies notice range by `1 − value` (floor 25%,
Farhold rule). There is no night, so notice range never changes with the time of day, and dark-looking places
(caves, crypts, graveyards) use the same numbers as anywhere else.
An enemy three or more levels **below** you (grey or green) does not notice you at all unless you hit it.

### 13.7 View cones and Unseen hits `(new — for the rogue's Blind Spots, canon W29)`

Every monster has a **view cone** — a wedge in front of its body — which is a **combat** rule, separate from
the notice range above. Its width and length come from the monster's family (humanoids 120° / 25 m, beasts
110°, undead 90°, insects 200°, all-seeing 360°, bosses 150° — [classes/rogue.md §2.1](classes/rogue.md) owns
the table until page 10 adopts it as a column). In a fight the body, and so the cone, **turns toward its current
target** (the top of its threat table) at its turn rate, so a monster held by a tank looks at the tank.

A hit is **Unseen** if, **when it lands**, any of these is true: the attacker is outside the target's cone
(**blind spot**); the target has not noticed the attacker and has not been hit by it yet (**unnoticed** —
first hit only); the attacker stands **3 m or more above** the target's feet and 8 m or more away
(**elevated**; flyers and all-seeing monsters ignore this); or the target is **Blinded** (no cone at all).
Area hits check each target on its own. **Only a class mechanic reads "Unseen"** — today the rogue's Wounds and
tempo refund; a hit being Unseen changes no number by itself. Players have no view cone (a player's back is
not a weakness). The dagger's **Backstab** trait (§4.1) stays a separate rule: rear 100° of the target,
whoever is looking.

### 13.8 What you see `(new; screens on page 03)`

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
     × (1 + sum of healing tag bonuses)         every "+N% healing" whose tags the heal has ALL of (§22.3)
     × crit ? 1.5 : 1
     × (1 + HealingReceived% − reductions)      target: Festering −50%, Withered −20%; floor 25%
     × duel ? 0.70 : 1
```

Examples of healing tag bonuses: "+10% healing" (no tags — every heal), "+15% healing with Over Time
effects" (HoTs only), "+12% healing with Area Spells". Shields use their own stat, "+N% shield strength",
with the same tag rule.

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
| Waking Draught | revives a dead ally at 35% HP, in or out of combat (a 2 s use, interrupted by damage), or yourself if you die while it is on your belt and it is off cooldown | 10 min |
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
| **Rise here** (Waking Draught on your belt and off cooldown) | anywhere, in or out of combat | you get up at 35% HP with **Rising**; draught spent |

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
| Class revive spell | the classes whose page gives one (tagged **Revive**, targeting **Needs target (ally)**) | as written; typical 50–100% HP |
| **Battle revive** (in combat) | the classes whose page gives one | as written |
| Waking Draught | anyone, in or out of combat | 35% HP |

**No limit on in-combat revives** (canon W21). There are no group revive charges anywhere — not in Normal,
Challenge mode, any Depth or world bosses. What keeps a battle revive precious is its own cost:

| Rule | Value |
|---|---|
| Cooldown of a class battle revive | **5 min** (page 06's budget table); a class file may not go below 3 min |
| Cast | 2.0 s cast time (interruptible by the healer being hit hard, pushback rules of §12), or a 1.5 s channel |
| Revived at | the class page's amount, typically **50–60%** HP and 20% mana, with **Rising** (5 s: cannot be damaged, cannot attack) |
| Stacked revives on one body | a player revived in the last **10 s** cannot be revived again (stops two healers wasting cooldowns on the same body) |
| Accept | the dead player must accept (a prompt with a 30 s timer; auto-accept setting `set.combat.autoAcceptRevive`, default On in a group) |

**Mass resurrection does not exist** (canon W35; parked in [WISHLIST.md](WISHLIST.md)). Every revive is one
body at a time.

### 16.5 Instances

- Releasing inside a dungeon puts your spirit at the **instance entrance**; you rise at the
  entrance at full HP/mana (no Shaken, no extra durability loss).
- While the group is in a boss fight, the boss room's door is sealed: a released player waits at the
  entrance until the fight ends (win or wipe).
- A wipe (everyone dead) resets the boss (page 11) and everyone may release.

### 16.6 Newcomer mercy (levels 1–9)

Releasing puts you at the shrine at **full health** with no Shaken, no durability loss and no cost. The first
death also shows a one-time card explaining shrines and the corpse run.

### 16.7 Followers and pets

No class **summons** a pet out of thin air (canon 00 §6). What falls at 0 HP, and how it comes back:

| Body | At 0 HP | Comes back |
|---|---|---|
| **Follower** (hired mercenary) | falls | gets up on its own **14 s** after you leave combat (Farhold `pets.reviveSeconds`), at 50% HP. In a dungeon, only between encounters |
| **Tamed beast** (ranger) or **bound demon** (warlock) — permanent pets | falls and **stays down** | only through the class's **revive ritual**, a utility spell that uses no slot, out of combat ([page 06 §11](06-CLASSES.md#11-utility-spells)); or an in-combat revive spell that targets allies also works on it |
| **Controlled body** (necromancer's Control Undead, enchanter's Charm) — temporary | the control ends and the body is dead (an undead crumbles; a charmed enemy dies) | never — control another |
| Deployables, illusions, decoys, sentries | destroyed | recast the spell |

**Pets versus boss mechanics (canon 00 §10; page 11 §12.3 owns the rule).** Tamed, bound and controlled pets
take **no party slot**, leave a **danger zone 0.6 s** after it appears and a **void zone after 0.5 s** in one,
**never count toward a soak**, and take **25% damage from room-wide hits**. **Followers** are different: they
take a party slot, **do** count toward soaks and take full damage from mechanics.

---

## 17. Durability and repair

`(new — Farhold has no durability)`

| Rule | Value |
|---|---|
| Durability per item | 100 points (weapons, off-hands, armour; not rings, necklaces, the tool, mounts) |
| On death | −10% of max on every **equipped** item (none at levels 1–9, none in a duel, none on a wipe past the third in the same boss fight within 30 min) |
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
| Momentum | built, never regenerated ([§18.3](#183-resources-mana-momentum-tempo)) | drains to 0 | new |
| Tempo | 25 a second (full in 4 s) | 25 a second | new |
| Class mechanic counters | the class file | the class file | new |
| Stamina | 25 a second after 0.8 s | 50 a second | new |
| Barrier | 0 (unless an effect) | 8% of barrier size a second | same |
| Follower / pet health | its own regen | 3% a second | same idea |

### 18.3 Resources: Mana, Momentum, Tempo

`(new — Farhold had only mana)` Canon 00 §6 fixes the three resources; every class spends exactly one.
**This section owns their numbers.** [Page 06 §4](06-CLASSES.md#4-resources) owns what each resource means for
class design (typical costs, which classes, how a class mechanic may bend the rules).

| | **Mana** | **Momentum** | **Tempo** |
|---|---|---|---|
| Idea | a big pool that refills slowly — spend it carefully | starts empty, **builds** as you hit and as you are hit, drains away out of combat — spend it on the big moves | a small pool that **refills fast** — spend it constantly |
| Pool | **1,000** + 2 per INT + gear "+mana" lines | **100** (fixed; a class mechanic may raise it to 120) | **100** (fixed) |
| Starts a fight | full (whatever you had) | **0** (whatever is left from the last fight) | full |
| Refills by itself | in combat **1%** of max a second + `mpRegen`; out of combat 4% a second, drinking 6% | **never** | **25 a second, always** (in or out of combat) — an empty bar is full again in **4 s**; × (1 + haste%) |
| Built by | wand and staff basic hits (+0.5% of max per hit, once per 0.5 s); the witch hunter's Silver Tithe (+1% per crossbow basic hit); mana-return spells and talents | see "Momentum gains" below | a class mechanic may refund Tempo (the bard's beat) |
| Lost by | spending | spending; the drain below | spending |
| Drain | none | in combat: after **4 s** with no hit dealt and no hit taken, **−5 a second**; out of combat: **−10 a second** after 2 s | none |
| Typical spell costs | filler 40–80 · big spell 150–250 · heal 60–200 · long cooldown 0–100 | builders 0 (and build) · spenders 20–60 · a finisher 40–100 | filler 20–30 · strong spell 40–60 · nothing above 75 |
| Colour on the HUD (page 03) | blue `#4a8cff` | red-orange `#e0602a` | gold `#f2c94c` |

**Momentum gains** (every source adds; the bar caps at its pool and extra is lost unless a class mechanic banks it):

| Source | Momentum |
|---|---:|
| Basic attack hit, main hand | `round(7 × the weapon's seconds per strike)`, min 2 (≈ **7 a second** from basic attacks, whatever the weapon) |
| Basic attack hit, off hand | half the main-hand value |
| Pattern finisher (arc, slam, lunge, a last overhead) | ×2 of the above |
| Taking damage | **+1 per 1% of your max HP** taken (after mitigation, before absorbs), at most **+15 from one hit** |
| Blocking, parrying or rolling through a hit | +5 |
| A spell that says "builds N Momentum" | N (the class page) |
| **Casting** (Momentum casters — the pyromancer) | each spell cast that is not a spender builds the Momentum written on it; typical 8–15 per cast. Canon: the pyromancer's **Heat** *is* its Momentum bar |

Design check: a Momentum melee class gets ~7 a second from swings plus ~3 a second from being hit while
tanking, so it can afford one 40-point spender every ~4–5 s; a Momentum class that stops fighting loses its
bar in ~20 s. A Tempo class can keep spending ~25 a second — a 25-point filler every GCD, or a 50-point spell every
other GCD — and a full bar lets it burst two strong spells back to back before it has to slow down. A Mana class runs
dry in ~90 s of full-rate spending without its class tools (page 06 §4).

**Resources in forms and stances**: a form or stance never switches you to another resource unless the class
file says so (none do in round 2). **Showing it**: a spell you cannot afford greys out with the reason on hover
("Not enough Momentum: 40 needed, 25 held.").

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
| Champion (a member of a blue champion pack) | 2.6 | 1.35 | 1.4 | 2.4 | ×0.70 | open world (random, common) and placed in dungeons — page 10 | same numbers |
| Rare (yellow name, 2–3 affixes, own minions) | 4.5 | 1.6 | 1.7 | 4.5 | ×0.50 | as above — page 10 | same numbers |
| Elite (dungeon trash) | 3.0 | 1.5 | 1.2 | 2.0 | ×0.40 | dungeons, world-boss adds | new |
| Mini-boss (event, stronghold) | 10 | 1.8 | 1.3 | 8 | ×0.25 | events, strongholds | new |
| Dungeon boss (5) | 40 (Normal) | 2.2 (on the tank) | 1.3 | 20 | ×0.25 | page 12 | Farhold `boss` placed by hand |
| Dungeon boss, **Challenge** (level 60) | 55 | 2.6 (on the tank) | 1.4 | — (level 60: no XP) | ×0.25 | page 12 | new |
| World boss | 60 per contributing player, capped at 40 players | 2.4 | 1.4 | 30 (first kill of each world boss each week, [page 07](07-PROGRESSION.md)) | ×0.25 | page 13 | Farhold `data/worldbosses.json` |

**Monster rarities** (canon 00 §12.3; page 10 owns the lists and frequencies): a **champion pack** is a whole
group of Champion-rank monsters with blue names sharing **one** affix; a **Rare** has a yellow name, 2–3 affixes
and a pack of Normal minions; a **greater rarity** (Giant, Flaming, Electrified, Frozen…) sits on top of any
rank with the default multipliers in §1 until page 10 sets its own. **Depth** multiplies all of the above
(page 12 owns the Depth table). Pages 10–13 may override any row; these are the defaults a monster is written
against.

### 19.6 Level sync in dungeons `(new)`

A player above a **Normal** dungeon's band who enters it through the group finder is **synced down** to the
band's top level; gear is treated as item level `bandTop + 3` at most. Entering directly (not through the
finder) with a party is not synced (so friends can help friends), but the loot and XP then follow the grey
rule. **Challenge mode** is level 60 only. **Depth** raises the dungeon's own level (3 per depth, up to 60,
then harder past 60 — canon W3); a player above a Depth run's level is synced to it the same way. Page 12 owns
Depth.

---

## 20. How damage scales in groups

**Everything scales to at most 5 players** (canon W39, rule 9). The only exception is **world bosses**.

- **Normal enemies do not scale** with the number of attackers. Three players on one wolf kill it in a third
  of the time; that is the point of grouping.
- **Champion packs, rares, greater-rarity monsters and event mini-bosses in the open world** scale with the
  number of **players** who have damaged or healed against them in the last 10 s (followers count as a
  quarter each): health × `(1 + 0.75 × (N − 1))`, damage × `(1 + 0.10 × (N − 1))`, **N capped at 5** — a sixth
  player joining makes it no tougher.
- **World bosses** (the one exception): health = 60 × normal × players tagged, recalculated once a second while
  the fight is fresh (first 30 s), then locked; damage flat (page 13 owns the rest).
- **Dungeons are tuned for a full group of 5** on Normal, Challenge and every Depth, and **do not** scale down.
  A Normal dungeon is soloable because **followers fill the empty slots** (canon pillar 6).
- **Followers** have their damage capped at 75% of the top of their owner's weapon swing (Farhold R22
  `FOLLOWER_SHARE_CAP`), scale with the owner's level, and in a group of players each follower counts
  against the group size (5 bodies in a 5-player dungeon: 3 players may bring 2 followers).
- **Loot tagging** (page 08/15 own the details): everyone who dealt or healed at least 3% of the enemy's
  health gets their own roll (personal loot); XP splits per [page 07](07-PROGRESSION.md#group-xp).

---

## 21. Duels

`(new)` Canon W1: **friendly duels are the only player-versus-player fighting in v2.** Team battles, ranked
matches, open-world flagging and any player-versus-player rewards are parked in [WISHLIST.md](WISHLIST.md). Page 15 owns the invite and the
duel screen; these are the combat rules.

| Rule | Value |
|---|---|
| Who | two players, both level **10+** (page 07's ladder), invited by right-click → Duel; the other must accept |
| Where | anywhere **outside** towns, hubs and dungeons; a 40 m flag is planted between the two, leaving it for 5 s forfeits |
| Start | a 3 s countdown; both are set to full health and resources are left as they are |
| End | the first to reach **1 HP** loses (nobody dies); a forfeit; or 5 minutes (a draw) |
| After | both are healed to their health before the duel; cooldowns are **not** reset |
| Stakes | **none**: no gold, no items, no XP, no ranking, no durability loss |
| Others | nobody else can hit, heal or buff either duellist; each duellist's own pets may fight; followers stand aside |
| Damage to the other player (and their pets) | ×0.65 (step 11 of §6.2) |
| Healing and absorbs on a duellist | ×0.70 |
| Crit damage | base crit ×1.25 instead of ×1.5 |
| Crowd control | full DR (§11.2); any single CC capped at **4 s** (sleep/fear 6 s) |
| Knockback | ×0.60 distance; stagger max 0.4 s per hit |
| Passive dodge | halved (cap 17.5%) — rolls still fully work |
| Hit-stop | never on the victim's screen; attacker's screen only |

---

## 22. Tags

`(new — canon 00 §12.3: "every skill, basic attack, item and affix carries tags"; this page owns the list and the rule)`

*(reference)* The idea is Path of Exile's gem tags; the names, the list and the rules below are our own.

A **tag** is a short word that says what a skill **is**: what element it deals, whether it is a weapon attack
or a spell, how it reaches its target, and what it leaves behind. Tags exist so that **bonuses can name the
kind of skill they help** — "+10% Ice damage", "+20% damage with Area Spells", "+15% healing with Over Time
effects" — and so that the spell card, the item card and the tooltip all speak the same small vocabulary.

### 22.1 The tag list

Every tag has an id `tag_<name>`, a display name (shown on cards in small caps, in this order), and one line of
meaning. **This is the complete list.** A page that needs a new tag asks for it here first.

**Element tags** — what the damage (or healing) is. A hit's element tags come from its damage type (§9):

| id | Tag | Meaning |
|---|---|---|
| `tag_physical` | Physical | deals physical damage (resisted by armour) |
| `tag_fire` | Fire | deals fire damage |
| `tag_ice` | Ice | deals ice damage |
| `tag_lightning` | Lightning | deals lightning damage |
| `tag_poison` | Poison | deals poison damage |
| `tag_nature` | Nature | deals nature damage, or heals with living growth (druid, shaman, ranger) |
| `tag_shadow` | Shadow | deals shadow damage, or drains |
| `tag_holy` | Holy | deals holy damage, or heals with holy light |
| `tag_arcane` | Arcane | deals arcane damage (ignores half of resistances) |

A heal carries an element tag only if its class page says it heals *as* that element (the priest's light,
the druid's growth); most heals carry none. **True** damage (boss mechanics only) has no tag and nothing can
raise it.

**Kind tags** — every skill has **exactly one** of Attack or Spell:

| id | Tag | Meaning |
|---|---|---|
| `tag_attack` | Attack | uses **Weapon Damage** (WD) — a swing, a shot, a throw, a weapon technique |
| `tag_spell` | Spell | uses **Spell Power** (SP) — magic, heals, shields, curses. Wand and staff basic attacks carry it too, but keep WD as their base (§22.4) |
| `tag_basic_attack` | Basic Attack | a basic weapon attack, or a class spell that **fires your equipped weapon's own basic attack** (e.g. a volley of three normal arrows). Only these hits get **quiver effects** and other "basic attacks only" powers (§22.4). Always found together with Attack |

**Delivery tags** — how it reaches the target:

| id | Tag | Meaning |
|---|---|---|
| `tag_melee` | Melee | lands within weapon reach of your body (≤ 6 m) |
| `tag_ranged` | Ranged | lands beyond reach: a shot, a thrown weapon, a bolt of magic, a spell cast at a distance |
| `tag_projectile` | Projectile | travels through the air as an object that can be dodged, blocked by terrain or pierce bodies |
| `tag_area` | Area | its **main shape** hits everything in a space: cone, line, circle, ring, ground. A projectile's impact **splash does not** make it Area; a chain is not Area |
| `tag_chain` | Chain | jumps from its first target to more targets |
| `tag_channel` | Channel | keeps working while you hold still and keep casting (§12) |

**Effect tags** — what it does or leaves behind:

| id | Tag | Meaning |
|---|---|---|
| `tag_over_time` | Over Time | damage or healing that **ticks** (a DoT or HoT). The ticks carry this tag; the first hit of the spell does not, unless the spell is only ticks |
| `tag_duration` | Duration | leaves something that lasts: a ground field, a wall, a buff or debuff with a timer (a bonus to "duration" of Duration skills lengthens it) |
| `tag_heal` | Heal | restores health |
| `tag_shield` | Shield | grants an absorb (§15) |
| `tag_control` | Control | applies crowd control: stun, freeze, root, sleep, fear, knock, silence, disarm, charm (§11) |
| `tag_curse` | Curse | a debuff that removes by a Curse dispel (§10.2); most warlock, witch-hunter-purgeable and hex spells |
| `tag_aura` | Aura | a lasting effect centred on you that touches allies or enemies near you (paladin Oath auras, bard songs, banners) |
| `tag_movement` | Movement | moves you: dash, leap, teleport, swap places, pull yourself |
| `tag_trap` | Trap | placed on the ground and triggered when an enemy steps on or near it |
| `tag_deployable` | Deployable | places an object that acts on its own: a sentry, a lightning rod, a rune, a banner, a junk barricade, a decoy |
| `tag_minion` | Minion | done **by** or **to** your tamed, bound or controlled pet (a pet's own attacks carry it too). The card may read "Minion" or, in prose, "pet" — they mean the same tag |
| `tag_finisher` | Finisher | spends your class mechanic's built-up stacks (Wounds, Flair, Resonance, Breath, Static…) for a bigger effect |

**Utility tags** — for filters, cooldown bonuses and rules; gear rarely gives damage to these:

| id | Tag | Meaning |
|---|---|---|
| `tag_interrupt` | Interrupt | stops a gold-bordered cast (§12) |
| `tag_dispel` | Dispel | removes a status from an ally or a buff from an enemy (§10.2) |
| `tag_taunt` | Taunt | forces an enemy to attack you (§13.4) |
| `tag_revive` | Revive | brings a dead ally or pet back (§16.4) |
| `tag_travel` | Travel | a travel utility spell (portal, retrace, guiding call — page 20) |

**Target tags are different.** Monsters carry **family tags** — Beast, Undead, Demon, Humanoid, Construct,
Elemental, Spirit, Giant, Boss… (page 10 owns the list) — which describe the **target**, not the skill. Bonuses
that read them are written "vs Undead", "vs Demons" and are **conditionals** (step 4 of §6.2), not tag
bonuses. The necromancer's Control Undead and the warlock's Bind Demon read family tags (page 06 §10).

### 22.2 The rule: a bonus needs every tag it names

A **tag bonus** names a stat, a value and zero or more tags. It applies to a hit **only if the hit has every one
of the named tags.** The words on the card list the tags joined by spaces:

| Bonus on an item | Tags it names | Applies to | Does not apply to |
|---|---|---|---|
| +10% Ice damage | Ice | Blizzard (Ice, Area, Spell, Duration), Frost Arrow's ice part | a physical sword swing |
| +20% damage with **Area Spells** | Area + Spell | Blizzard, a flame cone | Fireball (Spell, Projectile — no Area), Whirlwind (Area, but an Attack) |
| +15% damage with **Melee Attacks** | Melee + Attack | every sword swing, Shield Bash | a melee-range spell like Hallowed Ground (Spell) |
| +12% damage with **Fire Projectiles** | Fire + Projectile | Fireball, a quiver's fire arrow | a flame cone |
| +8% damage (no tags) | — | **every** damaging hit | — |
| +15% healing with **Over Time** effects | Over Time | HoT ticks | a direct heal |
| +25% duration of **Curses** | Curse | how long your curses last | a slow from a Control spell that is not a Curse |

Mixed-element hits: a skill that deals two elements (e.g. "120% WD as physical plus 30% WD as fire") is two
**parts**. Every non-element tag is shared by both parts; each **element** tag applies only to its own part. A
"+10% Fire damage" bonus raises only the 30% fire part.

A bonus that names **two elements** ("+10% Fire and Ice damage") is written as **two bonuses** in the data
(one per element), so the "every tag" rule never asks a hit to be fire *and* ice at once.

### 22.3 How tag bonuses stack

1. **Group by stat.** Every tag bonus is one of these stats: damage, healing, shield strength, crit chance,
   crit damage, area size, duration, cast speed, cooldown recovery, resource cost, projectile speed.
2. **Within a stat, add.** For one hit, sum every bonus of that stat whose tags the hit has **all** of — from
   gear, gems, jewels, gadgets, perks, talents, set 2-piece lines and buffs that say "+N%". One bucket.
   Example: +10% (no tags) + 15% Melee Attacks + 8% Physical = **+33%**, applied as ×1.33.
3. **Where it sits.** The damage bucket is **step 2b** of §6.2 — after the coefficient, before gear
   conditionals, statuses, crit, mitigation. The healing bucket is the second line of §14.1. Crit chance
   bonuses add to crit chance at step 6; area size multiplies the shape's radius or length; duration multiplies
   the status or field's time; cast speed and cooldown recovery add to the haste and cooldown-reduction stats
   **for that skill only** (their caps in §10.7 and page 06 §6 still apply to the total); resource cost
   reduces the cost (floor 50% of the written cost).
4. **Multipliers are separate.** A legendary power, a soul, a set 4/6-piece power or a status that says
   "**×1.2** damage" (a multiplier, not a "+N%") is applied at its own step (gear conditionals at step 4,
   statuses at steps 5 and 7) and **multiplies** the result. Cards always write a multiplier with "×" and a
   bonus with "+", so the player can tell them apart.
5. **Caps.** No cap on the damage bucket itself (each affix has its own roll range on page 08); a sanity check
   in the simulator flags any character above **+400%** in one bucket. Crit chance keeps its 60% cap,
   cooldown reduction its 50%, haste its +30%.
6. **Negative tag bonuses** (a curse on you, a cursed item's drawback) go into the same bucket; the bucket never
   goes below ×0.25.

### 22.4 Which tags a basic attack and a quiver effect carry

**Basic attacks** carry, automatically:

| Weapon | Tags |
|---|---|
| Any melee weapon strike | Attack · Basic Attack · Melee · Physical (or the weapon's element, e.g. a branded or elemental weapon, a sceptre's element) · **Area** on the strikes whose main shape is wide — sweep, cleave, arc, slam, and every strike of a greatsword (§4.1) |
| Bow, crossbow, hand crossbow, firelock | Attack · Basic Attack · Ranged · Projectile · Physical |
| Javelin, throwing knives | Attack · Basic Attack · Ranged · Projectile · Physical |
| Wand | Attack · Basic Attack · **Spell** · Ranged · Projectile · the wand's element · **Chain** for a chaining wand |
| Staff (charge attack) | Attack · Basic Attack · **Spell** · Ranged · the staff's element · **Area** for cone, nova, wave, ground and field forms (§4.6); **Channel** for the full-charge jet |
| Fists | Attack · Basic Attack · Melee · Physical |

Wand and staff basic attacks carry **both** `tag_basic_attack` and `tag_spell` (decided in the round-2 sweep).
Their base is still WD (with INT as the weapon attribute), but "+N% damage with Spells" **does** raise them, and
so does anything else that reads the Spell tag. That way a caster's gear keeps paying off between spells.
They still never need a target (§2.3) and still count as basic attacks for quivers and resources.

**Quiver effects** (page 08 owns the list and numbers) touch **only** hits tagged Basic Attack. The added part
carries the Basic Attack hit's tags **plus** the effect's own:

| Quiver effect (examples) | What it adds | Extra tags on the added part |
|---|---|---|
| Fire arrows | +N% of the hit as fire damage, 20% chance to Burn | Fire (the fire part only); the Burning ticks add Over Time |
| Exploding arrows | the arrow bursts in a 2.5 m circle for N% | **Area** (the burst only) |
| Multi-shot | 1 in 4 shots fires 2 extra arrows at 50% each, ±10° | none new |
| Seeking fletching | arrows curve up to 12° onto the nearest enemy | none new |
| Frost-tipped | +N% as ice, applies Frostbite | Ice (the ice part) |

A class spell may carry **Basic Attack** only if it **fires your equipped weapon's own basic attack** (same
projectile, same WD share, same on-hit effects) — for example a ranger volley that looses three normal arrows.
Such a spell gets quiver effects. It does **not** gain resources as a basic attack (the spell states its own
gains), and it stays on the global cooldown like any spell.

**Other things that carry tags:**

| Thing | Its tags |
|---|---|
| A class spell | written on its class page, **every spell, every version** (a druid form's version has its own tags) — page 06 §7.4 |
| A DoT or HoT from a spell | the spell's tags + **Over Time** (and minus Area/Projectile/Chain — the ticks do not travel) |
| A pet's attack | Attack or Spell as it uses, its delivery, its element + **Minion** |
| A trap or deployable's hit | the placing spell's tags (Trap / Deployable included) |
| An item | the tags of the bonuses it grants are shown on its card (page 08 draws them) |
| An affix | `tags: [...]` in its data row (page 08); an affix with no tags applies to everything |

### 22.5 Data shape

A skill's tags (on every spell row, page 06 §20; on every basic-attack row in `data/weapons.json`):

```json
{ "id": "mage_blizzard", "tags": ["tag_spell", "tag_ice", "tag_area", "tag_duration"],
  "targeting": "ground",
  "parts": [ { "element": "ice", "of": "sp", "coefficient": 0.45, "ticks": 8 } ] }
```

A tag bonus (on an affix, gem, jewel, gadget, perk node, talent, set line or buff):

```json
{ "stat": "damage", "value": 0.20, "tags": ["tag_area", "tag_spell"] }
```

```json
{ "stat": "damage", "value": 0.10, "tags": ["tag_ice"] }
{ "stat": "healing", "value": 0.15, "tags": ["tag_over_time"] }
{ "stat": "damage", "value": 0.08, "tags": [] }
```

The tag list itself (`data/tags.json`, page 16 owns the file name):

```json
{ "tag_area": { "name": "Area", "group": "delivery", "order": 12,
                "meaning": "Its main shape hits everything in a space: cone, line, circle, ring, ground." } }
```

**The one function.** `tagBonus(hit, stat)` = the sum of every active bonus of `stat` whose `tags` are all in
`hit.tags` (with element tags matched per part). It is called at step 2b (damage), §14.1 (healing) and the
other places in §22.3, and **nowhere else**. Tests (page 16):

- a bonus naming Area + Spell raises a hit with both, and not a hit with only one of them;
- a bonus with no tags raises every hit;
- a two-element hit's fire bonus raises only its fire part;
- a quiver effect never fires on a hit without Basic Attack;
- **move a tag bonus's value to an odd number (e.g. 0.137) and check the damage changes by exactly that** —
  the round-22 lesson that comparing the file to a constant passes against an orphan rule.

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
| CC | stagger only, 1 DR rule | 8 categories, 18 s DR, boss break bar | groups and duels |
| Threat | 5-s attention + body-in-the-way | full threat table, tank ×4, taunt, swap 110/130% | tanks and healers |
| Heals | self heals, regen buff, life steal | SP-based heals, HoTs, smart heals, overheal | healer role |
| Absorbs | barrier stat | barrier + spell shields, soonest-first, 100% cap | shield healers |
| Death | respawn full, −10% gold | release/corpse run/shrine revive, durability, **no limit on battle revives**, no gold loss | online game; canon W21 |
| Status numbers | tuned for one player | group-tuned (Shocked 30→15%, Might 30→20%, Guarded 45→30%…) and capped | five players stack them |
| Night | 47% of a 15-min day, torch in a light slot, spawn swap near towns | **none — always daylight**; dark places are film-set dark (page 17) | canon §12.3 |
| PvP | none | **friendly duels only** (§21) | canon W1 |
| Targeting | whatever the crosshair / nearest enemy was (the frame often showed the wrong enemy) | **Tab targeting**: one hard target only the player changes; spells are Needs target / Auto-target / Ground / Self | canon W8 |
| Resources | mana only | Mana, Momentum, Tempo (§18.3) | canon W28 |
| Bonuses | one damage % bucket, spell power squared by accident | **tags** and one tag-bonus bucket per hit (§22) | canon §12.3 |
| Pets | companions rise 14 s after combat; summons | no summons; tamed/bound pets revived by a ritual, controlled bodies temporary | canon W32 |

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
  "id": "m_beast_grey_wolf", "baseHealth": 58, "baseHit": [5, 8], "attackEvery": 1.5,
  "armourShare": 0.25, "resist": { "ice": 0.2, "fire": -0.1 },
  "notice": 18, "social": 10, "rank": "normal",
  "family": ["beast"], "viewCone": { "width": 110, "length": 20, "turnRate": 300 },
  "telegraphs": ["lunge_line_4m"], "statusOnHit": { "id": "bleed", "chance": 0.2 }
}
```

**Tags and tag bonuses**: [§22.5](#225-data-shape). **A spell's targeting kind** is one of
`"target" | "ally" | "auto" | "ground" | "self"` ([§2.4](#24-the-spell-targeting-kinds)).

**The resource knobs** (`data/balance.json`, `resources` block):

```json
{
  "resources": {
    "mana":     { "base": 1000, "perInt": 2, "regenInCombat": 0.01, "regenOutOfCombat": 0.04, "regenDrinking": 0.06 },
    "momentum": { "pool": 100, "perStrikeSecond": 7, "minPerHit": 2, "offhandShare": 0.5, "finisherMult": 2,
                  "perPctHpTaken": 1, "maxFromOneHit": 15, "onAvoid": 5,
                  "idleSeconds": 4, "idleDrain": 5, "outOfCombatDelay": 2, "outOfCombatDrain": 10 },
    "tempo":    { "pool": 100, "regen": 25, "hasteScales": true }
  }
}
```

**A combat event** (server → client, feeds the log and meters; reuse of the `meters/` record):

```json
{ "t": 1234.56, "src": "p:Wren", "dst": "m:m_beast_grey_wolf#88", "via": "ranger_aimed_shot",
  "kind": "damage", "element": "physical", "amount": 409, "crit": false,
  "mitigated": 136, "blocked": 0, "absorbed": 0, "overkill": 0, "threat": 409 }
```

---

## 26. Open questions

(Also in `QUESTIONS.md`.)

1. **Death cost.** This page removes Farhold's 10% gold loss and uses durability + time. Is that the feel you
   want, or do you want a gold cost back?
2. **Heavy armour move penalty** of 5% — keep, or none at all?
3. **Arcane ignoring half of resistances** makes arcane classes strong into resistant bosses. Keep?
4. **Heals refuse without a friendly target** (canon W8). The setting `set.combat.allySelfFallback` lets a
   player choose "cast on me instead"; it defaults Off. Should it default On for new players (levels 1–9)?
5. **Auto-target sets your target** by default (`set.combat.autoTargetSets` On). Recommendation: keep On —
   the frame then always shows what your spells are hitting.
6. **Tag bonus bucket has no hard cap** (only a simulator warning at +400%). Recommendation: keep it uncapped
   and control power through affix ranges on page 08; a cap would make the last few items feel worthless.
7. **Tempo at 100 / 25 a second** (set in round 2) makes a Tempo class's throughput 25 a second
   against Momentum's ~7–10. Spell costs on the class pages must be written against those rates (Tempo
   filler 20–30, Momentum spender 20–60); flagging so the class files and the budget on page 06 agree.

*(Resolved and removed: the dodge key — `F`, 00 §10; held block on right mouse — page 02.)*
