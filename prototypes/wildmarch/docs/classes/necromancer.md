# Necromancer (`necromancer`)

> *"Nothing on a battlefield goes to waste. Least of all you."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 9.
Formulas: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Bestiary: [page 10](../10-BESTIARY.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | share of (weapon damage × (1 + spell power)), applied once (reuse: `prototypes/farhold/js/rpg.js` `strike`) |
| **Mana cost** | share of maximum mana |
| **Corpse** | the body an enemy leaves when it dies (see §2.1) |
| **Thrall** | a raised undead servant that fights for the necromancer (a pet) |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A grave-scholar who treats every fight as a harvest: the dead get up, fight for you, and when they are spent they are thrown at the living as bone and rot |
| Role | **Damage** (pets + area damage over time) |
| Armour | cloth |
| Weapons | **staff**, **wand**, **scepter** (Farhold `fh_scepter` model) + a **focus** off hand with wand/scepter (Effigy fits best — reuse: `prototypes/farhold/js/foci.js` `effigy`) |
| Resource | **Mana** + **corpses** on the ground + **thralls** (class mechanic) |
| Companion | Thralls: up to 2 at level 4, 5 at calling 3 |
| Playstyle | Kill something, raise it, and let your dead do the walking. Corpses are ammunition: you choose whether a body becomes a thrall, a bomb or armour. A necromancer with a field of bodies is the strongest character in the room; one with none is a weak caster, so the class plays for the second half of every fight |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `necromancer`): *Raise Dead
turns corpses into skeleton allies; Death Coil applies Poison AND Bleed.* Here: **Raise Thrall** from
corpses, **Corpse Bloom** (Emberveil's Corpse Explosion, scaling off the corpse's health) and **Rot Tide**
(poison and bleed together).

---

## 2. Class mechanic — Corpses and Thralls (new; pets reuse `prototypes/farhold/js/pets.js`)

### 2.1 Corpses

1. Every enemy that dies leaves a **corpse** for **30 s** (the death animation's body; Farhold enemies already
   stay down — reuse `js/actors.js` `dead` clip).
2. A corpse has a **size** read from the monster's bestiary row (page 10): **small** (under 1.5 m: rats, imps,
   goblins), **medium**, **large** (over 2.5 m: brutes, bears, ogres), and a **ranged** flag (archers, casters).
3. **Bosses leave no usable corpse.** Their adds do. Players' bodies are never corpses.
4. A corpse can be spent **once** (raised, bloomed or eaten by Marrow Armour). Another necromancer can spend
   your corpses: the first to cast wins.
5. **Bone piles**: a thrall that dies or is sacrificed leaves a **small** corpse for 15 s (calling 2).

### 2.2 Thralls (pets)

| Thrall | Raised from | Health | Attack | Notes |
|---|---|---|---|---|
| **Bone Thrall** (`bone_thrall`, reuse) | small or medium corpse | 35% of the necromancer's max health | melee 2 m, **30% spell damage** every 1.5 s | the default |
| **Bone Archer** (`bone_archer`, reuse) | any **ranged** corpse | 25% | 25 m, **35% spell damage** every 2.0 s | stays at 12–20 m from its target |
| **Bone Brute** (new, calling 2) | **large** corpse | 70%, 30% damage reduction | melee 3 m, **45% spell damage** every 2.2 s, 3 m cleave | **taunts** its target every 10 s (holds adds off the necromancer; never taunts a boss in a group with a player tank) |
| **Shambler** (new, from Rot Tide) | any corpse the tide crosses | 20% | melee, 20% every 1.5 s | lasts **10 s**, does **not** count toward the cap |

* **Cap:** 2 thralls at level 4 · **3** at calling 1 · **4** at calling 2 · **5** at calling 3. Raising past the
  cap replaces the oldest thrall. Thralls count toward the class-companion limit, **not** toward party slots
  (page 15 — see canon request 3).
* Thralls **scale with the necromancer's level and gear** (reuse: `prototypes/farhold/js/followers.js`
  `scaleFollower`, with its 75%-of-your-own-swing ceiling).
* Thralls last until killed. They crumble when you **mount, enter a town, zone out or log out**, and the
  Unlocks card teaches "raise them again".

### 2.3 Pet AI (reuse the three-state AI of `prototypes/farhold/js/pets.js`: follow / engage / return)

| State | Behaviour |
|---|---|
| **follow** | stay in slots 2–4 m round the necromancer (archers at 6 m) |
| **engage** | attack the necromancer's target; with no target, anything that hit a party member in the last 5 s |
| **return** | past **40 m** leash, run back at sprint speed and take 30% less damage on the way |

**Telegraphs (new — every pet in Wildmarch uses the same rule; page 11 should adopt it):**

| Telegraph | What thralls do |
|---|---|
| **Danger zone** (red) | leave by the shortest path **0.6 s** after it appears (all stances, including Hold) |
| **Void zone** (purple) | step out after **0.5 s** inside one; on **Hold** they stay unless the zone would kill them in 2 s |
| **Soak** (orange) | **do not count** toward the pips; they avoid the circle |
| **Targeted** (yellow) | if the target is the necromancer, thralls keep **4 m away** from them |
| **Room-wide** | pets take **25%** damage from boss room-wide attacks (so a raid wipe mechanic does not delete your army before you can react) |

### 2.4 Pet commands and the pet bar

Keys ([page 02](../02-CONTROLS.md)): **tap `Q`** (`classKey`) = **Assault**; **hold `Q` 0.25 s** = the **command ring**
(all four commands, pick with the mouse or the stick); **`G`** (`classKey2`) = **Return**. `Ctrl` is never used
(page 02 §10: browsers steal Ctrl+digit). The four commands:

| Key | Command | Effect |
|---|---|---|
| Q tap / ring | **Assault** | every thrall attacks your current target; they deal +15% for 5 s |
| ring | **Hold Here** | thralls run to the point under the cursor and stay there (to guard a doorway or to stand out of a boss's cleave) |
| G / ring | **Return** | thralls come back to your side and stop attacking |
| ring | **Stance** (cycles) | **Aggressive** (engage anything in 20 m) · **Defensive** (engage only what attacks you or them — default) · **Passive** (never engage) |

The pet bar is page 03's **pet/companion gauge** (`hud_gauge`): one portrait per thrall (type icon, health bar,
a small timer for Shamblers) and a "Q: command ring" hint. It becomes the **Colossus bar** while the Bone Colossus
stands (§4).

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Corpse counter** | left of the mana bar | a skull icon + the number of usable corpses within 25 m |
| **Corpse markers** | in the world | a small bone glyph over every usable corpse with a ring that empties over its 30 s; large corpses show a bigger glyph, ranged ones a bow glyph. Setting `set.gameplay.necro_corpse_markers` (on/off, default on — add to page 04) |
| **Thrall frames** | pet bar | as §2.4 |
| **Cap pips** | beside the thrall frames | filled/empty pips for the thrall cap |

### 2.6 Calling quests (ids proposed; page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_necromancer_calling_1` | **The Quiet Field** — the Hearthvale sexton asks you to lay a restless barrow-field to rest… by putting it to work | **Corpses** become visible and spendable (markers, counter), **cap 3**, the **pet bar** and its four commands |
| 20 | `q_necromancer_calling_2` | **The Ossuary Pact** — bargain with the bone-keeper under `d04_bellows_keep` | **cap 4**; large corpses raise **Bone Brutes**; thralls that die **burst for 50% spell damage in 3 m** and leave a bone pile |
| 40 | `q_necromancer_calling_3` | **Lord of the Unquiet** — raise a drowned captain's crew on the Frostmantle shore and hold a pass with them | **cap 5**; **Deathless**: once every 3 min, a killing blow on you kills a thrall instead and leaves you at 30% health; Bone Colossus lasts **+10 s** |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `necromancer_bone_splinter` | Bone Splinter | 2% mana | — | 1.0 s | 35 m | bolt, pierces 1 | 105% spell damage, Bleed |
| 2 | 4 | `necromancer_raise_thrall` | Raise Thrall | 5% mana | 1.5 s | instant (3 s with no corpse) | 25 m | corpse | raises a thrall |
| 3 | 10 | `necromancer_corpse_bloom` | Corpse Bloom | 4% mana | 5 s | instant | 30 m | corpse → 6 m circle | 80% + 6% of corpse's max health, Poison |
| 4 | 18 | `necromancer_marrow_armour` | Marrow Armour | 6% mana | 20 s | instant | 12 m | self | barrier 6% max health per corpse eaten |
| 5 | 28 | `necromancer_rot_tide` | Rot Tide | 10% mana | 20 s | 0.8 s | 22 m | line wave 4 m wide | 150%, Poison + Bleed, corpses rise as Shamblers |
| 6 | 40 | `necromancer_bone_colossus` | Bone Colossus | 15% mana | 120 s | 1.5 s | 20 m | summon | fuses thralls + corpses into a Colossus |

### 3.2 Spell details

#### `necromancer_bone_splinter` — Bone Splinter (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 2% mana · none |
| Cast | 1.0 s |
| Range / shape | bolt, 35 m, 0.35 m radius, 28 m/s; **pierces 1** enemy (hits 2) |
| Effect | **105% spell damage** (physical-shadow: counts as shadow for resistances) |
| Statuses | **Bleed 4 s** (20% spell damage a second) |
| Mechanic | an enemy killed while bleeding from this leaves a **fresh corpse** (glows green, lasts 45 s instead of 30) |
| Visuals | spellfx `projectile` element `bleed`, shape `shards` recoloured bone white `#e8e0c8`; `impact` bleed |
| Sound | a dry crack `necro.splinter` + `spell.bleed.impact` |

#### `necromancer_raise_thrall` — Raise Thrall (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 5% mana · 1.5 s |
| Cast | **instant** on a corpse within 25 m (nearest if none is targeted). **With no corpse:** 3.0 s cast, costs **12% of max health** as well, raises a Bone Thrall "from the soil" |
| Effect | raises the thrall that matches the corpse (§2.2). Past the cap, the oldest thrall crumbles |
| Visuals | spellfx `_converge` shadow claws into the corpse, then `revive` recoloured violet-green; the thrall plays a rise-from-ground clip (new, Chibi 2 motion) |
| Sound | `revive` pitched down + bone rattle `necro.rise` |

Before level 6 the corpse is not required and there is no marker; every raise is "from the soil".

#### `necromancer_corpse_bloom` — Corpse Bloom (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 4% mana · 5 s |
| Cast | instant; target a corpse **or one of your thralls** within 30 m |
| Range / shape | the corpse bursts in a **6 m circle** |
| Effect | **80% spell damage + 6% of the corpse's max health** (capped at **350% spell damage**). A sacrificed thrall bursts for a flat **150%** in 5 m and leaves a bone pile |
| Statuses | **Poison 6 s** (22% spell damage a second) |
| Visuals | spellfx `aoe` element `poison` over 6 m + `_burst` of bone shards (`shards` recoloured); a green-black cloud (spellfx `_puff` × 4) hangs 1 s |
| Sound | wet burst `necro.bloom` + `spell.poison.impact` |

#### `necromancer_marrow_armour` — Marrow Armour (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 6% mana · 20 s |
| Cast | instant |
| Range / shape | self; eats up to **5 corpses within 12 m** |
| Effect | a **barrier of 6% max health per corpse** (max 30%) for **12 s**. If no corpses: each thrall gives **4%** (costing it 20% of its health). While the barrier holds, **30% of damage you take is moved to your thralls** (split evenly) |
| Statuses | `barrier` + `stoneskin` aura recoloured bone |
| Visuals | bones fly from each corpse (spellfx `projectile` `physical` shape `shards`, arc 0.6) and lock round the body as plates |
| Sound | bone clatter `necro.marrow` + `status.barrier.apply` |

#### `necromancer_rot_tide` — Rot Tide (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 10% mana · 20 s |
| Cast | 0.8 s |
| Range / shape | a **wave 4 m wide** that travels **22 m** forward from the necromancer at 10 m/s |
| Effect | **150% spell damage** (poison) to every enemy it passes |
| Statuses | **Poison 8 s** (22%/s) **and Bleed 6 s** (20%/s) together |
| Mechanic | every corpse the wave crosses **rises as a Shambler** (10 s, max 6 at once, not counted toward the cap) |
| Visuals | a rolling ground wave: spellfx `breath` element `poison`, length 22, arc 0.3, drawn low along the ground, plus `footfall` `poison` decals every 2 m; rising shamblers use the thrall rise clip |
| Sound | a rushing grave-mud surge `necro.tide` + `status.poison.apply` |

#### `necromancer_bone_colossus` — Bone Colossus (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 15% mana · 120 s |
| Cast | 1.5 s; needs **at least 1 thrall** |
| Range / shape | eats **every thrall** and up to **5 corpses within 20 m**; the Colossus forms at the necromancer's side |
| Effect | a **Bone Colossus** (3.2 m tall) for **20 s + 2 s per piece eaten** (max 40 s; +10 s after calling 3). Health **150% of the necromancer's max health + 20% per piece**. Melee **3.5 m, 120% spell damage every 2.0 s** in a 90° arc |
| Mechanic | its own bar replaces the pet bar (§4). When it ends it **collapses into 3 large corpses** |
| Visuals | bones stream in (spellfx `_converge`, 1.5 s) and the Colossus is a scaled Chibi 2 skeleton body with extra rib geometry (new look, `bone_colossus`); `sunder` aura on its fists |
| Sound | grinding bone `necro.colossus.form`, footsteps `fragment.crash.medium` |

### 3.3 Rotation / how it plays

* **Solo:** Splinter the first enemy, raise from the soil if you have no corpse, let thralls tank. Every
  kill is a choice: **raise** (below cap) or **bloom** (at cap, or when the pack is grouped). Marrow Armour
  when something reaches you. From 28, open with Rot Tide on the second pack — the first pack's corpses
  rise as Shamblers under the second one.
* **Dungeon (5):** trash is your moment: bloom corpses under the tank's pack for chain explosions. On
  bosses with adds, raise brutes from large adds and put them on **Hold** out of the boss's cleave. On
  bosses with no adds, your thralls are all you have; bring them to cap before the pull, and keep 1–2
  sacrifices ready for Bloom.
* **Raid:** Colossus on the boss's burn phase (it stays out of mechanics poorly — put it on **Stand Guard**
  on adds instead if the boss moves a lot). Coordinate with other necromancers over corpses (the raid UI
  shows who spent them).

### 3.4 Boss mechanics

| Mechanic | Necromancer answer |
|---|---|
| **Soak** | the necromancer can soak; thralls cannot (§2.3). Marrow Armour before a soak |
| **Void / danger zones** | no blink by default; talent `necromancer_raise_thrall_t3a` *Bone Swap* swaps places with a thrall (30 m) |
| **Immunity** | **Deathless** (calling 3) once per 3 min |
| **Adds** | raise them after they die; brutes taunt adds; Colossus *Stand Guard* taunts |
| **Tethers** | talent `necromancer_marrow_armour_t3b` lets a thrall **take a tether** (the thrall is the anchor) |
| **Interrupt** | talent `necromancer_bone_splinter_t2b` *Jawbone* (interrupt, 15 s internal) |

---

## 4. Alternate spells

### 4.1 Thrall commands

The pet bar (§2.4) — Assault, Hold Here, Return, Stance.

### 4.2 Colossus bar (while the Bone Colossus stands)

Uses page 02's form keys **`Shift+1…4`** and page 03's form bar (`hud_formbar`) — the necromancer's bar does
not swap, the form bar appears above it for the Colossus's lifetime. The same four are also on the `Q` ring.

| Key | id | Name | Cooldown | Effect |
|---|---|---|---|---|
| Shift+1 | `necromancer_colossus_crush` | Crushing Fist | 8 s | the Colossus leaps **8 m** to your target and slams a **5 m circle** for **220% spell damage**, **stun 1.5 s** (non-bosses) |
| Shift+2 | `necromancer_colossus_skull_hurl` | Skull Hurl | 6 s | throws its own skull **30 m**, **160%** in a 3 m burst; the Colossus loses 5% health |
| Shift+3 | `necromancer_colossus_stand_guard` | Stand Guard | 15 s | **taunts** everything in 10 m for 4 s and takes **40% less damage** for 6 s |
| Shift+4 | `necromancer_colossus_unmake` | Unmake | — | ends the Colossus now: it bursts for **100% + 3% of its remaining health** in 8 m and leaves its 3 corpses |

---

## 5. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell).

### `necromancer_bone_splinter`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_bone_splinter_t1a` | Splinter Fan | **3 splinters** in a 25° fan, 45% each, no pierce |
| 1 | `necromancer_bone_splinter_t1b` | Marrow Spike | no pierce, **+40%** and Bleed lasts 8 s |
| 2 | `necromancer_bone_splinter_t2a` | Commanding Bone | thralls **switch to the target** you hit and deal +10% to it for 4 s |
| 2 | `necromancer_bone_splinter_t2b` | Jawbone | **interrupts**; 15 s internal cooldown |
| 3 | `necromancer_bone_splinter_t3a` | Harvest | fresh corpses from this spell raise **for free** (no mana) |
| 3 | `necromancer_bone_splinter_t3b` | Ricochet Ribs | after the pierce, the splinter **ricochets to a third target** in 8 m |
| 4 | `necromancer_bone_splinter_t4a` | Chorus of Bones | each thrall **fires a splinter** too (30%) when you cast |
| 4 | `necromancer_bone_splinter_t4b` | Grave Draw | killing a bleeding enemy **refunds 3% mana** and resets Corpse Bloom |

### `necromancer_raise_thrall`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_raise_thrall_t1a` | Mass Raising | raises from **every corpse within 6 m** of the target corpse (up to cap) |
| 1 | `necromancer_raise_thrall_t1b` | Blood Soil | raising with no corpse costs **6% health** and is **instant** |
| 2 | `necromancer_raise_thrall_t2a` | Hollow Guard | thralls take **20% less area damage** |
| 2 | `necromancer_raise_thrall_t2b` | Frenzied Dead | freshly raised thralls attack **50% faster for 6 s** |
| 3 | `necromancer_raise_thrall_t3a` | Bone Swap | cast on **one of your thralls** (30 m) to **swap places** with it (8 s internal cooldown) |
| 3 | `necromancer_raise_thrall_t3b` | Remember the Living | a thrall raised from a corpse **keeps one of that enemy's attacks** (a random special from its bestiary row, used every 12 s) |
| 4 | `necromancer_raise_thrall_t4a` | Legion | cap **+1** |
| 4 | `necromancer_raise_thrall_t4b` | Captain of Bones | the first thrall raised each fight is a **Captain**: +100% health, gives other thralls +15% damage |

### `necromancer_corpse_bloom`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_corpse_bloom_t1a` | Chain Bloom | the burst **sets off one other corpse** within 6 m at 60% |
| 1 | `necromancer_corpse_bloom_t1b` | Shrapnel | shape becomes a **10 m cone** away from you |
| 2 | `necromancer_corpse_bloom_t2a` | Grave Gas | leaves a **6 m poison cloud** (enemy void zone) for 5 s, 25% a second |
| 2 | `necromancer_corpse_bloom_t2b` | Bone Rain | the burst throws **4 bone piles** 4 m out (new small corpses) |
| 3 | `necromancer_corpse_bloom_t3a` | Martyr | a sacrificed thrall bursts for **250%** and heals your other thralls 20% |
| 3 | `necromancer_corpse_bloom_t3b` | Consumption | each enemy hit gives you **2% max health** |
| 4 | `necromancer_corpse_bloom_t4a` | Twin Bloom | **2 charges** |
| 4 | `necromancer_corpse_bloom_t4b` | Heavy Meat | health cap raised to **600%**, large corpses **stun 1 s** |

### `necromancer_marrow_armour`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_marrow_armour_t1a` | Ossuary Plate | per-corpse barrier 6 → **9%**, max 3 corpses |
| 1 | `necromancer_marrow_armour_t1b` | Shared Marrow | also gives each **thrall** a barrier of half the amount |
| 2 | `necromancer_marrow_armour_t2a` | Spiked Ribs | melee attackers take **40% spell damage** per hit |
| 2 | `necromancer_marrow_armour_t2b` | Loan of Flesh | cast on an **ally** in 25 m instead of yourself |
| 3 | `necromancer_marrow_armour_t3a` | Deep Marrow | while it holds, **Raise Thrall has no cooldown** |
| 3 | `necromancer_marrow_armour_t3b` | Anchor Bone | while it holds, a **tether** targeting you is moved to your nearest thrall |
| 4 | `necromancer_marrow_armour_t4a` | Bone Burst | when it ends, remaining barrier **explodes** as damage in 6 m (100% of what is left) |
| 4 | `necromancer_marrow_armour_t4b` | Unyielding | while it holds you **cannot be knocked back** |

### `necromancer_rot_tide`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_rot_tide_t1a` | Ring of Rot | a **ring wave** out from you to 12 m instead of a line |
| 1 | `necromancer_rot_tide_t1b` | Long Tide | range **36 m**, width 3 m |
| 2 | `necromancer_rot_tide_t2a` | Undertow | pulls enemies **3 m back toward you** |
| 2 | `necromancer_rot_tide_t2b` | Graverot | enemies hit take **+15% from thralls** for 8 s |
| 3 | `necromancer_rot_tide_t3a` | Returning Tide | the wave **comes back** to you (hits twice) |
| 3 | `necromancer_rot_tide_t3b` | Stayers | Shamblers last **20 s** and explode on death for 60% |
| 4 | `necromancer_rot_tide_t4a` | Drowned Dead | Shamblers become **full thralls** if you have room under the cap |
| 4 | `necromancer_rot_tide_t4b` | Blight Wake | leaves a **22 m rot line** for 6 s (30% a second, enemies only) |

### `necromancer_bone_colossus`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_bone_colossus_t1a` | Two Giants | **two Colossi** at 60% health and damage each; pieces split between them |
| 1 | `necromancer_bone_colossus_t1b` | Riding Bone | you **ride** the Colossus (you cast from its shoulder; its health is a shield over yours) |
| 2 | `necromancer_bone_colossus_t2a` | Bone Throne | Colossus aura: thralls raised while it stands start at **+50% health** |
| 2 | `necromancer_bone_colossus_t2b` | Reaper's Arm | melee arc becomes **360°** |
| 3 | `necromancer_bone_colossus_t3a` | Feeding Giant | each enemy it kills adds **+2 s** |
| 3 | `necromancer_bone_colossus_t3b` | Warden of Bones | it **counts as a tank** for threat (holds bosses in solo/follower play) |
| 4 | `necromancer_bone_colossus_t4a` | Titan of the Pit | needs no thralls; eats only corpses (min 3) |
| 4 | `necromancer_bone_colossus_t4b` | Last Stand | when it dies it **raises every corpse in 15 m** as Shamblers |

---

## 6. Class sets

### `set_necromancer_sextons_weeds` — The Sexton's Weeds (level 30, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | corpses last **45 s** | all corpse spells |
| 4 | Corpse Bloom raises a **Shambler** from the corpse after it bursts | `necromancer_corpse_bloom` |
| 6 | Raise Thrall on a large corpse also raises a **Bone Archer** (both count toward cap) | `necromancer_raise_thrall` |

Drop: `r01_barrowking` bosses `b_ossuary_warden`, `b_sister_candlemourn`, `b_gravewardens`, `b_rotmaw`, `b_barrowking_hrodric` (one slot each; the sixth piece from the secret boss `b_ninth_heir`).

### `set_necromancer_choir_of_bones` — Regalia of the Choir of Bones (level 60, raid)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Bone Splinter **pierces 2** more | `necromancer_bone_splinter` |
| 4 | Rot Tide's Shamblers **explode for 120%** when they expire | `necromancer_rot_tide` |
| 6 | Bone Colossus costs **no cooldown** if cast with 5 thralls and 5 corpses eaten (max once every 60 s) | `necromancer_bone_colossus` |

Drop: `r03_sunken_choir` bosses (tokens), Normal/Mythic.

### `set_necromancer_marrowlord` — The Marrowlord's Mantle (level 60, Mythic+)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Marrow Armour **raises 1 thrall** for free from its first corpse | `necromancer_marrow_armour` |
| 4 | thralls deal **+3% per corpse** within 20 m (max +30%) | pets |
| 6 | Corpse Bloom on a thrall **does not kill it** (it bursts and rebuilds in 3 s, 10 s internal cooldown per thrall) | `necromancer_corpse_bloom` |

Drop: Mythic+ end chest key 8+.

---

## 7. Class legendaries and uniques

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_barrowkings_rod` | **The Barrowking's Rod** | scepter | *Crown of the Barrow*: thrall cap **+2**; each thrall past 5 is a **Bone Brute** | final boss of `r02_glacier_throne` (the Barrowking's rod was buried with his rival), 5% |
| `leg_osric_mournes_ledger` | **Osric Mourne's Ledger** | off hand (Effigy) | *Every Name Written*: bosses **do** leave a corpse; it can only be **bloomed**, for 350% cap ×3 | secret boss of `r04_ember_court`, 8% |
| `leg_shroud_of_the_drowned_host` | **Shroud of the Drowned Host** | chest | *Tide of Dead*: Rot Tide **leaves no corpse behind unraised** — any corpse in 22 m rises, and Shamblers last 30 s | `drowned_coast` world boss, 4% |
| `leg_the_hundred_hands` | **The Hundred Hands** | gloves | *Many Fists*: Bone Colossus's Crushing Fist has **no cooldown**; each use costs the Colossus 3 s of its time | `r05_veilspire` boss 7, 5% |
| `leg_gravewind_censer` | **Gravewind Censer** | amulet | *Wind of Graves*: every **8 s** a corpse within 20 m blooms by itself at 60% | Mythic+ key 12+ end chest, 1.5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_sextons_spade` | **Sexton's Spade** | staff | Raise Thrall "from the soil" costs **no health** | `d01_hollow_barrow` boss `b_sexton_morrow` (Sexton Abel Morrow), 12% |
| `uq_ring_of_the_quiet_field` | **Ring of the Quiet Field** | ring | Marrow Armour eats corpses from **20 m** | `d06_sandsworn_vault` final boss, 7% |
| `uq_bone_archers_quiver_charm` | **Bone Archer's Charm** | amulet | Bone Archers **pierce** and fire **every 1.5 s** | `d11_saltdeep_cathedral` boss 2, 6% |
| `uq_marsh_mummers_wrap` | **Marsh-Mummer's Wrap** | legs | Shamblers from Rot Tide are **Bone Thralls** that last 20 s | `mossfen` rare elites, 3% |

---

## 8. Voice and barks

Voice: **new row `necromancer`** proposed for `shared/voices.js` — `pitch 0.4, depth 0.62, tone 0.4,
breath 0.45, rough 0.2, speed 0.42, jitter 0.08` (slow, breathy). Lingo tag `class:necromancer`. Thralls only rattle
(no speech; Farhold's beasts-only-snarl rule).

| When | Lines |
|---|---|
| Raise | "Rise. You're not finished." · "Up. There's work." |
| Bloom | "Waste not." · "Back to the soil — loudly." |
| Colossus | "All of you — together now." |
| Crit | "Good. Very good." |
| Low health | "I'd rather not join them yet!" · "Guard me, you useless bones!" |
| Thrall dies | "Another one for the pile." |
| Deathless | "Not today. Someone else paid." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Pets | `prototypes/farhold/js/pets.js` (`bone_thrall`, `bone_archer`, follow/engage/return AI), `js/followers.js` `scaleFollower` | thralls |
| Enemy bodies | `prototypes/farhold/data/enemies.json` rows `bone_thrall`, `bone_archer` | thrall stats as a base, re-costed as % of owner |
| Look | `avatar-3d/data/class-outfits.json` `necromancer` (hood, trim robe, staff_skull, bone charms) | default look |
| Visual only | Farhold `raise_thrall`, `toxic_cloud`, `drain`, `curse` | rise, rot, marrow |
| Scepter model | `avatar-3d/js/chibi2-weapons.js` `fh_scepter` | weapon |
| Dropped | Farhold necromancer kit (shadow_lance, raise_thrall, curse, drain, poison_dart, toxic_cloud) | none used as spells |
