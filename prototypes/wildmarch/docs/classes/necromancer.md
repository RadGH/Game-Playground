# Necromancer (`necromancer`)

> *"Nothing on a battlefield goes to waste. Least of all you."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied). Canon: [page 00](../00-OVERVIEW.md) §6 row 9.
Formulas, crowd control and tags: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Bestiary and monster tags: [page 10](../10-BESTIARY.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | share of (weapon damage × (1 + spell power)), applied once (reuse: `prototypes/farhold/js/rpg.js` `strike`) |
| **% spell healing** | the same base, paid as healing |
| **Mana** | page 06 §4.1: a pool of **1,000** + 2 per INT + gear. Costs are **flat** ("80 mana"). In-combat regen 1% of max a second |
| **Corpse** | the body an enemy leaves when it dies (§2.1) |
| **Controlled body** | an enemy the necromancer controls for a time through **Control Undead** — either a **raised** corpse or a **seized** living undead (§2.2). Temporary, like mind control. There is no other way to get one |
| **Undead** | a monster with the page 10 tag **Undead** (the `undead` family, the drowned **dead** of the `drowned` family — not its crocodiles, shellbacks, slimes, gulls or horrors —, the Unburied warband, every skeleton, ghost and wight; page 10 §3.1) |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A grave-scholar who treats every fight as a harvest: the fresh dead get up and fight for a while, the restless dead are turned against their own side, and what is left is thrown at the living as bone and rot |
| Primary role | **Damage** (controlled bodies + area damage over time) |
| Hybrid role | **Healer** — the **Life Thread** state turns damage into healing and corpses into splints (§5) |
| Build | caster |
| Armour | cloth |
| Weapons | **staff**, **wand**, **sceptre** (Farhold `fh_scepter` model) + a **focus** off hand with wand/sceptre (Effigy fits best — reuse: `prototypes/farhold/js/foci.js` `effigy`) |
| Resource | **Mana** + **corpses** on the ground (class mechanic) |
| Companion | controlled bodies: up to 2 at level 4, 5 at calling 3. All temporary |
| Playstyle | Kill something and raise it for half a minute, or reach into a living skeleton and turn it on its friends. Corpses are ammunition: you choose whether a body becomes a fighter, a bomb or armour. A necromancer with a field of bodies is the strongest character in the room; one with none is a modest caster, so the class plays for the second half of every fight |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `necromancer`): *Raise Dead
turns corpses into skeleton allies; Death Coil applies Poison AND Bleed.* Here: **Control Undead** on corpses,
**Corpse Bloom** (Emberveil's Corpse Explosion, scaling off the corpse's health) and **Rot Tide** (poison and
bleed together).

---

## 2. Class mechanic — Corpses and Control Undead (new; body AI reuses `prototypes/farhold/js/pets.js`)

### 2.1 Corpses

1. Every enemy that dies leaves a **corpse** for **30 s** (the death animation's body; Farhold enemies already
   stay down — reuse `js/actors.js` `dead` clip).
2. A corpse has a **size** read from the monster's bestiary row (page 10): **small** (under 1.5 m: rats, imps,
   goblins), **medium**, **large** (over 2.5 m: brutes, bears, ogres), a **ranged** flag (archers, casters) and
   whether it is **Undead**.
3. **Bosses leave no usable corpse.** Their adds do. Players' bodies are never corpses.
4. A corpse can be spent **once** (raised, bloomed or eaten by Marrow Armour). Another necromancer can spend
   your corpses: the first to cast wins.
5. **Undead corpses** (a skeleton that falls apart, a wight that stops moving) **can be bloomed or eaten** but
   **never raised** — the dead have already been raised once.
6. **Bone piles**: a raised body that ends or dies leaves a **small** bone pile for 15 s (calling 2). A bone pile
   counts as an **Undead** corpse: bloom or eat it, never raise it.
7. **Ripe** corpses: a corpse crossed by Rot Tide is **Ripe** for 15 s (§3.2).

### 2.2 Control Undead — the only way to get a controlled body

`necromancer_control_undead` (slot 2, §3.2) has **two** valid kinds of target and one forbidden one:

| Target | Result | Duration | Limits |
|---|---|---|---|
| **A corpse that is not Undead** | it **rises** as a **raised** body (kind by size, below) and fights for you | **small 30 s · medium 25 s · large 20 s** (+50% on a Ripe corpse) | the corpse is used up; when time runs out the body crumbles into a bone pile |
| **A living enemy tagged Undead** | you **seize** it: it fights for you **with its own abilities** | **12 s** normal · **8 s** champion or elite · **6 s** rare | not a boss, not tagged `command`, level ≤ yours + 2; shares diminishing returns with Charm (page 05 §11, Incapacitate). When time runs out it turns hostile again with the health it has left and **you on top of its threat table**; if it ends under **25% health** it collapses and leaves a bone pile instead |
| **An Undead corpse** | **refused** — "That one has already been raised once." | — | the cast does not start and costs nothing |

**Raised body kinds** (a raised body **is** the dead monster's own body, dressed in grave-light; stats below
replace its bestiary stats so a raised ogre and a raised wolf are both balanced):

| Kind | Raised from | Health | Attack | Notes |
|---|---|---|---|---|
| **Bone Thrall** (`bone_thrall`, reuse) | small or medium corpse (and large before calling 2) | 35% of the necromancer's max health | melee 2 m, **30% spell damage** every 1.5 s | the default |
| **Bone Archer** (`bone_archer`, reuse) | any **ranged** corpse | 25% | 25 m, **35% spell damage** every 2.0 s | stays 12–20 m from its target |
| **Bone Brute** (new, calling 2) | **large** corpse | 70%, 30% damage reduction | melee 3 m, **45% spell damage** every 2.2 s, 3 m cleave | **taunts** its target every 10 s (holds adds off the necromancer; never taunts a boss while a player is in a Guardian state) |

**Seized undead** keep their own bestiary health, damage and abilities (a seized Wrapped Dead still curses, a
seized Drowned Bellringer still calls adds — for you), scaled by the pet rules below so a seized elite is not
stronger than the necromancer's own swing ×0.75 (reuse: `prototypes/farhold/js/followers.js` `scaleFollower`).

* **Cap:** 2 controlled bodies at level 4 · **3** at calling 1 · **4** at calling 2 · **5** at calling 3. Raised and
  seized bodies share the cap. Controlling past the cap ends the oldest body at once.
* Controlled bodies take **no party slot** (00 §6 Pets). They end early when you **mount, enter a town, zone out
  or log out**.
* Where it shines: barrows, the Drowned Coast, the Unburied warband's lands — full of living undead to seize and
  non-undead cultists and beasts to raise. Where there are only undead corpses (a crypt already cleared), the
  necromancer blooms and eats them instead.

### 2.3 Body AI and boss mechanics

AI reuses the three states of `prototypes/farhold/js/pets.js`: **follow** (2–4 m slots, archers 6 m) ·
**engage** (your target, or whatever hit a party member in the last 5 s) · **return** (past a 40 m leash).
Controlled bodies obey the **pet rules** of 00 §10 and page 11: they leave a danger zone **0.6 s** after it
appears and a void zone after **0.5 s** in one, never count toward a soak, and take **25%** damage from
room-wide hits.

### 2.4 Commands and the pet bar

Keys ([page 02](../02-CONTROLS.md)): **tap `Q`** (`classKey`) = **Assault**; **hold `Q` 0.25 s** = the **command
ring** (all four commands, pick with the mouse or the stick); **`G`** (`classKey2`) = **Return**. No `Ctrl` keys.

| Key | Command | Effect |
|---|---|---|
| Q tap / ring | **Assault** | every controlled body attacks your current target; they deal +15% for 5 s |
| ring | **Hold Here** | bodies run to the point under the cursor and stay there (to guard a doorway or stand out of a boss's cleave) |
| G / ring | **Return** | bodies come back to your side and stop attacking |
| ring | **Stance** (cycles) | **Aggressive** (engage anything in 20 m) · **Defensive** (engage only what attacks you or them — default) · **Passive** (never engage) |

The pet bar is page 03's **pet/companion gauge** (`hud_gauge`): one portrait per body (kind icon, health bar,
and a **time-left ring** — every body is temporary), and a "Q: command ring" hint. It becomes the **Colossus
bar** while the Bone Colossus stands (§4).

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Corpse counter** | left of the mana bar | a skull icon + the number of usable corpses within 25 m, split "raisable / bone" (e.g. "3 / 2") |
| **Corpse markers** | in the world | a small bone glyph over every usable corpse with a ring that empties over its 30 s; large corpses show a bigger glyph, ranged ones a bow glyph, **Undead corpses a grey crossed glyph** (bloom or eat only), Ripe corpses glow green. Setting `set.gameplay.necro_corpse_markers` (on/off, default on — page 04 to add) |
| **Seizable marker** | nameplates | a small violet hand on living Undead enemies you can seize (level and rank allow it) |
| **Body frames** | pet bar | as §2.4 |
| **Cap pips** | beside the frames | filled/empty pips for the cap |
| **Life Thread** | player frame | a green-black thread icon while the healer state is on (§5) |

### 2.6 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_necromancer_1` | **The Quiet Field** — the Hearthvale sexton asks you to lay a restless barrow-field to rest… by turning its walking dead on each other | **Corpses** become visible (markers, counter), **cap 3**, the **pet bar** and its four commands, and **Life Thread** on `Shift+1` |
| 20 | `q_calling_necromancer_2` | **The Ossuary Pact** — bargain with the bone-keeper under `d04_bellows_keep` | **cap 4**; large corpses raise **Bone Brutes**; controlled bodies that die **burst for 50% spell damage in 3 m** and leave a bone pile |
| 40 | `q_calling_necromancer_3` | **Lord of the Unquiet** — seize a drowned captain's crew on the Frostmantle shore and hold a pass with them | **cap 5**; **Deathless**: once every 3 min, a killing blow on you ends a controlled body instead and leaves you at 30% health; Bone Colossus lasts **+10 s** |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `necromancer_bone_splinter` | Bone Splinter | 40 mana | — | 1.0 s | Auto-target | 35 m | bolt, pierces 1 | `tag_spell` `tag_shadow` `tag_physical` `tag_ranged` `tag_projectile` | 105% spell damage, Bleeding |
| 2 | 4 | `necromancer_control_undead` | Control Undead | 80 mana | 2 s | 1.0 s | Needs target | 25 m | corpse or Undead enemy | `tag_spell` `tag_shadow` `tag_minion` `tag_duration` | raises a corpse or seizes a living Undead, for a time |
| 3 | 10 | `necromancer_corpse_bloom` | Corpse Bloom | 60 mana | 5 s | instant | Needs target | 30 m | corpse → 6 m circle | `tag_spell` `tag_poison` `tag_area` | 80% + 6% of corpse's max health, Poisoned |
| 4 | 18 | `necromancer_marrow_armour` | Marrow Armour | 80 mana | 20 s | instant | Self | 12 m | self | `tag_spell` `tag_physical` `tag_shield` `tag_duration` | shield 6% max health per corpse eaten |
| 5 | 28 | `necromancer_rot_tide` | Rot Tide | 150 mana | 20 s | 0.8 s | Self (line ahead) | 22 m | wave 4 m wide | `tag_spell` `tag_poison` `tag_area` `tag_duration` | 150%, Poisoned + Bleeding; corpses become Ripe |
| 6 | 40 | `necromancer_bone_colossus` | Bone Colossus | 200 mana | 120 s | 1.5 s | Self | 20 m | fusion | `tag_spell` `tag_physical` `tag_minion` `tag_duration` | fuses controlled bodies + corpses into a Colossus |

### 3.2 Spell details

#### `necromancer_bone_splinter` — Bone Splinter (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 40 mana · none |
| Cast | 1.0 s |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point within 35 m |
| Range / shape | bolt, 35 m, 0.35 m radius, 28 m/s; **pierces 1** enemy (hits 2) |
| Tags | `tag_spell` `tag_shadow` `tag_physical` `tag_ranged` `tag_projectile` |
| Effect | **105% spell damage** (bone: counts as **shadow** for resistances; bonuses to physical also apply) |
| Statuses | **Bleeding** (page 05 `bleed`, 36% of the hit over 6 s) |
| Mechanic | an enemy killed while bleeding from this leaves a **fresh corpse** (glows green, lasts 45 s instead of 30) |
| Visuals | spellfx `projectile` element `bleed`, shape `shards` recoloured bone white `#e8e0c8`; `impact` bleed |
| Sound | a dry crack `necro.splinter` + `spell.bleed.impact` |

#### `necromancer_control_undead` — Control Undead (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 80 mana · 2 s. A **seize** (living target) also starts a separate **15 s** cooldown on seizing |
| Cast | 1.0 s |
| Targeting | **Needs target** — a corpse (click it, or `Tab` cycles corpses while the spell is readied) or a living enemy tagged Undead. With no valid target it will not cast; an Undead corpse is refused (§2.2) |
| Range / shape | one corpse or one enemy in 25 m, line of sight |
| Tags | `tag_spell` `tag_shadow` `tag_minion` `tag_duration` |
| Effect | **corpse (not Undead):** raises it as a Bone Thrall / Archer / Brute for 30 / 25 / 20 s by size. **Living Undead:** seizes it for 12 s (elite/champion 8 s, rare 6 s). Details and limits: §2.2 |
| Statuses | `charm` on a seized enemy (page 05; a violet hand over its head) |
| Before calling 1 | the cap is 2 and there is no marker, but the rules are the same |
| Visuals | spellfx `_converge` shadow claws into the target, then `revive` recoloured violet-green; a raised body plays a rise-from-ground clip (new, Chibi 2 motion); a seized one gets violet eyes and a chain of light to the necromancer's hand |
| Sound | `revive` pitched down + bone rattle `necro.rise`; a seize adds a cold whisper `necro.seize` |

#### `necromancer_corpse_bloom` — Corpse Bloom (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 60 mana · 5 s |
| Cast | instant |
| Targeting | **Needs target** — a corpse, a bone pile **or one of your controlled bodies** within 30 m |
| Range / shape | the corpse bursts in a **6 m circle** (8 m if Ripe) |
| Tags | `tag_spell` `tag_poison` `tag_area` |
| Effect | **80% spell damage + 6% of the corpse's max health** (capped at **350% spell damage**; Ripe: +50%). A sacrificed controlled body bursts for a flat **150%** in 5 m and leaves a bone pile; a seized enemy sacrificed this way **dies** |
| Statuses | **Poisoned** (page 05 `poison`, 48% of the hit over 8 s) |
| Visuals | spellfx `aoe` element `poison` over 6 m + `_burst` of bone shards; a green-black cloud (spellfx `_puff` × 4) hangs 1 s |
| Sound | wet burst `necro.bloom` + `spell.poison.impact` |

#### `necromancer_marrow_armour` — Marrow Armour (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 80 mana · 20 s |
| Cast | instant |
| Targeting | **Self** (Life Thread version is **Ally**, §4.3) |
| Range / shape | self; eats up to **5 corpses within 12 m** (any kind, Undead included) |
| Tags | `tag_spell` `tag_physical` `tag_shield` `tag_duration` |
| Effect | a **shield of 6% max health per corpse** (max 30%) for **12 s**. With no corpses, each controlled body gives **4%** (costing it 20% of its health). While the shield holds, **30% of damage you take is moved to your controlled bodies** (split evenly) |
| Statuses | a spell shield (page 05 §15) + `stoneskin` look recoloured bone |
| Visuals | bones fly from each corpse (spellfx `projectile` `physical` shape `shards`, arc 0.6) and lock round the body as plates |
| Sound | bone clatter `necro.marrow` + `status.barrier.apply` |

#### `necromancer_rot_tide` — Rot Tide (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 150 mana · 20 s |
| Cast | 0.8 s |
| Targeting | **Self** — a wave in the direction you face |
| Range / shape | a **wave 4 m wide** that travels **22 m** forward at 10 m/s |
| Tags | `tag_spell` `tag_poison` `tag_area` `tag_duration` |
| Effect | **150% spell damage** (poison) to every enemy it passes |
| Statuses | **Poisoned** and **Bleeding** together |
| Mechanic | every corpse the wave crosses becomes **Ripe** for 15 s: Corpse Bloom on it deals +50% in 8 m, and Control Undead on it lasts +50% |
| Visuals | a rolling ground wave: spellfx `breath` element `poison`, length 22, arc 0.3, drawn low, plus `footfall` `poison` decals every 2 m; Ripe corpses swell and glow green |
| Sound | a rushing grave-mud surge `necro.tide` + `status.poison.apply` |

#### `necromancer_bone_colossus` — Bone Colossus (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 200 mana · 120 s |
| Cast | 1.5 s; needs **at least 1 controlled body** |
| Targeting | **Self** — forms at your side |
| Range / shape | eats **every controlled body** (seized enemies die into it) and up to **5 corpses within 20 m** |
| Tags | `tag_spell` `tag_physical` `tag_minion` `tag_duration` |
| Effect | a **Bone Colossus** (3.2 m tall) — itself a controlled body that takes the whole cap — for **20 s + 2 s per piece eaten** (max 40 s; +10 s after calling 3). Health **150% of the necromancer's max health + 20% per piece**. Melee **3.5 m, 120% spell damage every 2.0 s** in a 90° arc |
| Mechanic | its own bar replaces the pet bar (§4.2). When it ends it **collapses into 3 large bone piles** (bloom or eat; never raise) |
| Visuals | bones stream in (spellfx `_converge`, 1.5 s); the Colossus is a scaled Chibi 2 skeleton body with extra rib geometry (new look, `bone_colossus`); `sunder` aura on its fists |
| Sound | grinding bone `necro.colossus.form`, footsteps `fragment.crash.medium` |

### 3.3 How it plays

* **Solo:** Splinter the first enemy; the moment something non-undead dies, raise it. In a barrow, seize the
  biggest skeleton and let it fight its friends. Every kill is a choice: **raise** (below cap) or **bloom** (at
  cap, or when the pack is grouped). Marrow Armour when something reaches you. From 28, open with Rot Tide over
  the first pack's corpses: they turn Ripe for a big bloom or a long raise.
* **Normal dungeon:** trash is your moment — bloom corpses under the tank's pack for chain explosions. On bosses
  with adds, raise Brutes from large adds and put them on **Hold** out of the boss's cleave; seize undead adds
  that would otherwise heal the boss.
* **Challenge and Depth:** bodies are temporary, so time them: raise just before the burn phase, Colossus at the
  start of it. On a boss with no adds and no corpses, the necromancer is a Bone Splinter and Rot Tide caster
  with Marrow Armour eating bone piles — plan the corpses the trash left in the boss room.

### 3.4 Boss mechanics

| Mechanic | Necromancer answer |
|---|---|
| **Soak** | the necromancer can soak; bodies cannot (§2.3). Marrow Armour before a soak |
| **Void / danger zones** | no teleport by default; talent `necromancer_control_undead_t3a` *Bone Swap* swaps places with a body (30 m) |
| **Immunity** | **Deathless** (calling 3) once every 3 min |
| **Adds** | raise them after they die, seize undead adds while they live; Brutes taunt adds; Colossus *Stand Guard* taunts |
| **Tethers** | talent `necromancer_marrow_armour_t3b` lets a body **take a tether** |
| **Interrupt** | talent `necromancer_bone_splinter_t2b` *Jawbone* (interrupt, 15 s internal cooldown) |
| **Healing checks** | Life Thread (§5) |

---

## 4. Alternate spells

### 4.1 Body commands

The pet bar (§2.4) — Assault, Hold Here, Return, Stance.

### 4.2 Colossus bar (while the Bone Colossus stands)

Uses page 02's form keys **`Shift+1…4`** and page 03's form bar (`hud_formbar`). While the Colossus stands,
`Shift+1` is the Colossus's (Life Thread cannot be toggled until it ends). The same four are also on the `Q` ring.

| Key | id | Name | Cooldown | Targeting | Tags | Effect |
|---|---|---|---|---|---|---|
| Shift+1 | `necromancer_colossus_crush` | Crushing Fist | 8 s | Auto-target | `tag_attack` `tag_physical` `tag_melee` `tag_area` `tag_minion` | the Colossus leaps **8 m** to your target and slams a **5 m circle** for **220% spell damage**, **Stunned** 1.5 s (non-bosses) |
| Shift+2 | `necromancer_colossus_skull_hurl` | Skull Hurl | 6 s | Auto-target | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_minion` | throws its own skull **30 m**, **160%** in a 3 m burst; the Colossus loses 5% health |
| Shift+3 | `necromancer_colossus_stand_guard` | Stand Guard | 15 s | Self | `tag_minion` `tag_area` | **taunts** everything in 10 m for 4 s and takes **40% less damage** for 6 s |
| Shift+4 | `necromancer_colossus_unmake` | Unmake | — | Self | `tag_physical` `tag_area` `tag_minion` | ends the Colossus now: it bursts for **100% + 3% of its remaining health** in 8 m and leaves its 3 bone piles |

### 4.3 Life Thread versions (healer state, §5)

While **Life Thread** is on, three spells change. Same keys; the icons gain a green corner.

| Slot | Normal | In Life Thread | Targeting | Tags | Effect |
|---|---|---|---|---|---|
| 3 | Corpse Bloom | **Mending Bloom** (`necromancer_mending_bloom`) | Needs target (a corpse or bone pile) | `tag_spell` `tag_poison` `tag_heal` `tag_area` | the corpse bursts into green-bone motes: allies in **8 m** are healed for **90% spell healing + 3% of the corpse's max health** (cap 250%), enemies take half the normal poison burst. 60 mana, 5 s |
| 4 | Marrow Armour | **Bone Splints** (`necromancer_bone_splints`) | **Ally** (30 m) | `tag_spell` `tag_physical` `tag_shield` `tag_duration` | eats up to 5 corpses within 12 m **of the ally** and locks the bones round them: a shield of **5% of *their* max health per corpse** (max 25%) for 12 s; while it holds, 20% of damage they take moves to your controlled bodies. 80 mana, 15 s |
| 5 | Rot Tide | **Grave Tide** (`necromancer_grave_tide`) | Self (line ahead) | `tag_spell` `tag_poison` `tag_heal` `tag_area` | the same wave: enemies take **100%** and are Poisoned; **allies** it passes are healed for **120% spell healing** and have one poison or bleed removed. Corpses still turn Ripe. 150 mana, 20 s |

---

## 5. The hybrid role — Healer

The necromancer heals by **drawing life out of enemies and passing it to allies** (the life thread) and by
**mending allies with the bones of the dead** (splints and blooms). It heals most when enemies are dying around
it — the reverse of most healers — and is thinnest on a single boss with nothing else in the room.

### 5.1 Life Thread (the healer state)

| Field | Value |
|---|---|
| id / key | `necromancer_life_thread` · `Shift+1` (form key); unlocks at calling 1 (level 6) |
| Switching | toggle; 1.0 s, off the GCD; at most once every 5 s |
| **Transfer** | **35%** of all damage you deal with shadow and poison spells (Bone Splinter, blooms, Rot Tide, poisons, bleeds from your spells) **heals the lowest-health ally** (by percentage) within 30 m — a "smart heal" (page 05 §14.2). Shown as a green-black thread from the victim, through you, to the ally |
| Controlled bodies | their damage transfers at **15%** |
| Damage | −20% damage dealt (the transfer is taken after this) |
| Spells | three change (§4.3) |
| Healing threat | page 05 §13.2 as normal |
| Role focus | tied to the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout): setting it to **Hybrid (Healer)** turns Life Thread on when you leave combat and makes the Dungeon Finder queue you as **Healer** (from calling 1); **Primary (Damage)** turns it off. The `Shift+1` toggle still flips Life Thread mid-fight without changing your queued role |

### 5.2 Talents that turn spells toward healing

| Talent | What it does as a healer |
|---|---|
| `necromancer_bone_splinter_t2c` *Marrow Graft* | a Bone Splinter that pierces an **ally** on its way (aim through them) splints them: shield 8% of their max health, 6 s |
| `necromancer_control_undead_t2c` *Bone Nurse* | raised bodies (not seized ones) heal the lowest ally within 15 m for 20% spell healing each attack instead of dealing damage |
| `necromancer_corpse_bloom_t3b` *Consumption* | each enemy hit by a bloom heals you and the lowest ally 2% max health |
| `necromancer_marrow_armour_t2b` *Loan of Flesh* | Marrow Armour can be cast on an ally outside Life Thread too |
| `necromancer_rot_tide_t2c` *Life for Life* | Grave Tide's heal +40%; normal Rot Tide heals allies it passes for 40% |

### 5.3 Gear

Spell healing and spell power (the transfer scales with damage), a **Reliquary** or **Effigy** focus, and the
healer set `set_necromancer_marrowlord` (§8).

### 5.4 How well it heals

| Content | Necromancer healer vs a primary healer |
|---|---|
| Open world and Normal dungeon trash | ≈ **90%** — corpses everywhere, the transfer runs hot |
| Normal dungeon bosses | ≈ **75%**; less on a boss with no adds (no corpses) |
| Depth 1–10 | ≈ **70%** |
| Depth 11+ and Challenge | ≈ **60%**; its heals depend on dealing damage and on corpses, so a phase where the party must stop attacking starves it |

---

## 6. Utility spells

None. The necromancer travels by scroll, Recall Stone and Travel Methods ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell). **[heal]** marks a choice
written for the Healer role.

### `necromancer_bone_splinter`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_bone_splinter_t1a` | Splinter Fan | **3 splinters** in a 25° fan, 45% each, no pierce |
| 1 | `necromancer_bone_splinter_t1b` | Marrow Spike | no pierce, **+40%**, Bleeding lasts 8 s |
| 2 | `necromancer_bone_splinter_t2a` | Commanding Bone | controlled bodies **switch to the target** you hit and deal +10% to it for 4 s |
| 2 | `necromancer_bone_splinter_t2b` | Jawbone | **interrupts**; 15 s internal cooldown |
| 2 | `necromancer_bone_splinter_t2c` | Marrow Graft **[heal]** | passes through allies and **splints** them: shield 8% of their max health for 6 s (tags: +`tag_shield`) |
| 3 | `necromancer_bone_splinter_t3a` | Harvest | fresh corpses from this spell are raised **for free** (no mana) |
| 3 | `necromancer_bone_splinter_t3b` | Ricochet Ribs | after the pierce, the splinter **ricochets to a third target** in 8 m |
| 4 | `necromancer_bone_splinter_t4a` | Chorus of Bones | each controlled body **fires a splinter** too (30%) when you cast |
| 4 | `necromancer_bone_splinter_t4b` | Grave Draw | killing a bleeding enemy **refunds 30 mana** and resets Corpse Bloom |

### `necromancer_control_undead`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_control_undead_t1a` | Mass Raising | on a corpse: also raises every **other raisable corpse within 6 m** (up to the cap) |
| 1 | `necromancer_control_undead_t1b` | Iron Grip | seizes last **+50%** (18 / 12 / 9 s) |
| 2 | `necromancer_control_undead_t2a` | Hollow Guard | controlled bodies take **20% less area damage** |
| 2 | `necromancer_control_undead_t2b` | Frenzied Dead | freshly controlled bodies attack **50% faster for 6 s** |
| 2 | `necromancer_control_undead_t2c` | Bone Nurse **[heal]** | raised bodies heal the lowest ally within 15 m for **20% spell healing** per attack instead of attacking (tags: +`tag_heal`) |
| 3 | `necromancer_control_undead_t3a` | Bone Swap | cast on **one of your bodies** (30 m) to **swap places** with it (8 s internal cooldown) |
| 3 | `necromancer_control_undead_t3b` | Remember the Living | a raised body **keeps one of that enemy's attacks** (a random special from its bestiary row, used every 12 s) |
| 4 | `necromancer_control_undead_t4a` | Legion | cap **+1** |
| 4 | `necromancer_control_undead_t4b` | Captain of Bones | the first body controlled each fight is a **Captain**: +100% health, +10 s, gives other bodies +15% damage |

### `necromancer_corpse_bloom`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_corpse_bloom_t1a` | Chain Bloom | the burst **sets off one other corpse** within 6 m at 60% |
| 1 | `necromancer_corpse_bloom_t1b` | Shrapnel | shape becomes a **10 m cone** away from you |
| 2 | `necromancer_corpse_bloom_t2a` | Grave Gas | leaves a **6 m poison cloud** (a void zone for enemies only) for 5 s, 25% a second |
| 2 | `necromancer_corpse_bloom_t2b` | Bone Rain | the burst throws **4 bone piles** 4 m out |
| 3 | `necromancer_corpse_bloom_t3a` | Martyr | a sacrificed body bursts for **250%** and heals your other bodies 20% |
| 3 | `necromancer_corpse_bloom_t3b` | Consumption **[heal]** | each enemy hit heals **you and the lowest-health ally** in 30 m for **2% max health** |
| 4 | `necromancer_corpse_bloom_t4a` | Twin Bloom | **2 charges** |
| 4 | `necromancer_corpse_bloom_t4b` | Heavy Meat | health cap raised to **600%**, large corpses **stun 1 s** |

### `necromancer_marrow_armour`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_marrow_armour_t1a` | Ossuary Plate | per-corpse shield 6 → **9%**, max 3 corpses |
| 1 | `necromancer_marrow_armour_t1b` | Shared Marrow | also gives each **controlled body** a shield of half the amount |
| 2 | `necromancer_marrow_armour_t2a` | Spiked Ribs | melee attackers take **40% spell damage** per hit |
| 2 | `necromancer_marrow_armour_t2b` | Loan of Flesh **[heal]** | cast on an **ally** in 25 m instead of yourself (targeting becomes **Ally**) |
| 3 | `necromancer_marrow_armour_t3a` | Deep Marrow | while it holds, **Control Undead has no cooldown** (the seize cooldown still applies) |
| 3 | `necromancer_marrow_armour_t3b` | Anchor Bone | while it holds, a **tether** targeting you is moved to your nearest body |
| 4 | `necromancer_marrow_armour_t4a` | Bone Burst | when it ends, the remaining shield **explodes** as damage in 6 m (100% of what is left) |
| 4 | `necromancer_marrow_armour_t4b` | Unyielding | while it holds you **cannot be knocked back** |

### `necromancer_rot_tide`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_rot_tide_t1a` | Ring of Rot | a **ring wave** out from you to 12 m instead of a line |
| 1 | `necromancer_rot_tide_t1b` | Long Tide | range **36 m**, width 3 m |
| 2 | `necromancer_rot_tide_t2a` | Undertow | pulls enemies **3 m back toward you** |
| 2 | `necromancer_rot_tide_t2b` | Graverot | enemies hit take **+15% from controlled bodies** for 8 s |
| 2 | `necromancer_rot_tide_t2c` | Life for Life **[heal]** | Grave Tide heals **+40%**; normal Rot Tide heals allies it passes for **40% spell healing** |
| 3 | `necromancer_rot_tide_t3a` | Returning Tide | the wave **comes back** to you (hits twice) |
| 3 | `necromancer_rot_tide_t3b` | Overripe | Ripe corpses last **30 s** and burst on their own for 60% when they expire |
| 4 | `necromancer_rot_tide_t4a` | Fresh Dead | enemies **killed** by the wave leave a corpse that is **already raised** as a Bone Thrall (if you have room under the cap) |
| 4 | `necromancer_rot_tide_t4b` | Rot Wake | leaves a **22 m rot line** for 6 s (30% a second, enemies only) |

### `necromancer_bone_colossus`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `necromancer_bone_colossus_t1a` | Two Giants | **two Colossi** at 60% health and damage each; pieces split between them |
| 1 | `necromancer_bone_colossus_t1b` | Riding Bone | you **ride** the Colossus (you cast from its shoulder; its health is a shield over yours) |
| 2 | `necromancer_bone_colossus_t2a` | Bone Throne | while it stands, bodies you control start at **+50% health** |
| 2 | `necromancer_bone_colossus_t2b` | Reaper's Arm | melee arc becomes **360°** |
| 3 | `necromancer_bone_colossus_t3a` | Feeding Giant | each enemy it kills adds **+2 s** |
| 3 | `necromancer_bone_colossus_t3b` | Warden of Bones | it **counts as a tank follower** for threat (×3, page 05 §13.2) — holds bosses in solo play |
| 4 | `necromancer_bone_colossus_t4a` | Titan of the Pit | needs no controlled body; eats only corpses (min 3) |
| 4 | `necromancer_bone_colossus_t4b` | Final Harvest | when it dies, every **raisable corpse within 15 m** is raised as a Bone Thrall (up to the cap, normal durations) |

---

## 8. Class sets

### `set_necromancer_sextons_weeds` — The Sexton's Weeds (level 30, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | corpses last **45 s** | all corpse spells |
| 4 | Corpse Bloom on a Ripe corpse **raises a Bone Thrall** from it after it bursts (if under the cap) | `necromancer_corpse_bloom` |
| 6 | Control Undead on a large corpse also raises a **Bone Archer** beside the Brute (both count toward the cap) | `necromancer_control_undead` |

Source: bosses of `d08_moonwell_ruins` and `d09_warmasters_pit` (Normal); the chest piece from the `whisperwood` world boss ([page 13](../13-WORLD-BOSSES.md)).

### `set_necromancer_choir_of_bones` — Regalia of the Choir of Bones (level 60, damage)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Bone Splinter **pierces 2** more | `necromancer_bone_splinter` |
| 4 | a raised body **explodes for 120%** when its time runs out | `necromancer_control_undead` |
| 6 | Bone Colossus has **no cooldown** if cast with 5 bodies and 5 corpses eaten (at most once every 60 s) | `necromancer_bone_colossus` |

Source: bosses of `d11_saltdeep_cathedral` on **Challenge** (one piece per boss, once a week per boss).

### `set_necromancer_marrowlord` — The Marrowlord's Mantle (level 60, healer)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Mending Bloom radius **8 → 11 m** | `necromancer_mending_bloom` |
| 4 | Life Thread's transfer **35 → 45%** | Life Thread |
| 6 | Bone Splints **also raises** a Bone Thrall beside the ally from the first corpse eaten, which taunts anything attacking that ally | `necromancer_bone_splints` |

Source: the final boss's chest at **Depth 10 or deeper**, any dungeon ([page 12](../12-DUNGEONS.md)).

---

## 9. Class legendaries, uniques and souls

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_barrowkings_rod` | **The Barrowking's Rod** | sceptre | *Crown of the Barrow*: cap **+2**; each body past 5 is raised as a **Bone Brute** whatever its size | final boss of `d14_ashen_reliquary` (Challenge), 5% |
| `leg_osric_mournes_ledger` | **Osric Mourne's Ledger** | off hand (Effigy) | *Every Name Written*: bosses **do** leave a corpse; it can only be **bloomed**, with the 350% cap ×3 | secret boss of `d15_fire_court` (Challenge), 8% |
| `leg_shroud_of_the_drowned_host` | **Shroud of the Drowned Host** | chest | *Tide of Dead*: seizing a living Undead **also seizes every Undead within 6 m** of it (up to the cap, same duration) | the `drowned_coast` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_the_hundred_hands` | **The Hundred Hands** | gloves | *Many Fists*: Bone Colossus's Crushing Fist has **no cooldown**; each use costs the Colossus 3 s of its time | boss 4 of `d16_the_spire` (Challenge), 5% |
| `leg_gravewind_censer` | **Gravewind Censer** | amulet | *Wind of Graves*: every **8 s** a corpse within 20 m blooms by itself at 60% (Mending Bloom while in Life Thread) | the final boss's chest at Depth 15+, 1.5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_sextons_spade` | **Sexton's Spade** | staff | Control Undead on a corpse costs **no mana** | `d01_hollow_barrow` boss `b_sexton_morrow` (Sexton Abel Morrow), 12% |
| `uq_ring_of_the_quiet_field` | **Ring of the Quiet Field** | ring | Marrow Armour and Bone Splints eat corpses from **20 m** | `d06_sandsworn_vault` final boss, 7% |
| `uq_bone_archers_charm` | **Bone Archer's Charm** | amulet | Bone Archers **pierce** and fire **every 1.5 s** | `d11_saltdeep_cathedral` boss 2, 6% |
| `uq_marsh_mummers_wrap` | **Marsh-Mummer's Wrap** | legs | Rot Tide's Ripe corpses raise **+100%** longer instead of +50% | `mossfen` rare monsters (page 10), 3% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_the_unquiet_hand` | **Soul of the Unquiet Hand** | weapon | **Necromancer only** | **seizes** last **+50%**, and a seized enemy that ends under **40%** health (was 25%) collapses into a bone pile instead of turning on you | the secret boss of `d01_hollow_barrow` (Normal or Challenge), 5%; or any Undead monster at 0.02% (great luck) |
| `soul_bone_mender` | **Soul of the Bone Mender** | jewellery (ring or amulet) | **Necromancer only** | every corpse within 30 m that **expires unused** heals the lowest-health ally in 30 m for **4% of their max health** (8% if you are in Life Thread) | quest reward: the Quiet Wake's Drowned Coast chapter, necromancer version (page 14); or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice: **new row `necromancer`** proposed for `shared/voices.js` — `pitch 0.4, depth 0.62, tone 0.4,
breath 0.45, rough 0.2, speed 0.42, jitter 0.08` (slow, breathy). Lingo tag `class:necromancer`. Bodies only rattle
(no speech; Farhold's beasts-only-snarl rule).

| When | Lines |
|---|---|
| Raise | "Rise. You're not finished." · "Up. There's work." |
| Seize | "You're mine for a little while." · "Turn around. Your friends are that way." |
| Refused (Undead corpse) | "That one has already been raised once." |
| Bloom | "Waste not." · "Back to the soil — loudly." |
| Life Thread on | "Your life, their life. It all goes somewhere." |
| Colossus | "All of you — together now." |
| Crit | "Good. Very good." |
| Low health | "I'd rather not join them yet!" · "Guard me, you useless bones!" |
| Body ends | "Time's up. Rest." |
| Deathless | "Not today. Someone else paid." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Pet AI | `prototypes/farhold/js/pets.js` (`bone_thrall`, `bone_archer`, follow/engage/return AI), `js/followers.js` `scaleFollower` | raised and seized bodies |
| Enemy bodies | `prototypes/farhold/data/enemies.json` rows `bone_thrall`, `bone_archer` | raised-body stats as a base, re-costed as % of the owner |
| Charm | page 05 `charm` status and the Enchanter's Charm rules ([classes/enchanter.md](enchanter.md)) | seizing living Undead |
| Look | `avatar-3d/data/class-outfits.json` `necromancer` (hood, trim robe, staff_skull, bone charms) | default look |
| Visual only | Farhold `raise_thrall`, `toxic_cloud`, `drain`, `curse` | rise, rot, marrow, the life thread |
| Sceptre model | `avatar-3d/js/chibi2-weapons.js` `fh_scepter` | weapon |
| Dropped | Farhold necromancer kit (shadow_lance, raise_thrall, curse, drain, poison_dart, toxic_cloud) | none used as spells |

---

## 12. Round 2 changes

- **Thralls come only from Control Undead** (W32): slot 2 is now Control Undead — raise a corpse that is not Undead, or seize a living Undead enemy, both for a time. Raising "from the soil" (from nothing) is gone; Undead corpses can be bloomed or eaten but never raised.
- **Shamblers removed** from Rot Tide; corpses it crosses become **Ripe** instead.
- Bone Colossus now fuses **controlled** bodies (it is itself a temporary controlled body).
- New hybrid **Healer** role: Life Thread (`Shift+1`), three Life Thread spell versions, [heal] talents, a healer set.
- Mana costs are flat numbers (page 06 §4.1). Raid, Heroic and Mythic+ sources re-homed; souls added.

| Old | New |
|---|---|
| `necromancer_raise_thrall` Raise Thrall | `necromancer_control_undead` **Control Undead** (talents `_raise_thrall_t*` → `_control_undead_t*`) |
| "Thrall" (permanent pet) | **controlled body** (raised or seized, temporary) |
| talent *Blood Soil* (raise from nothing) | *Iron Grip* (longer seizes) |
| talents *Stayers*, *Drowned Dead* (Shamblers) | *Overripe*, *Fresh Dead* |
| talent *Blight Wake* | *Rot Wake* (Blight is the warlock's spell) |
| talent *Last Stand* (banned name) | *Final Harvest* |
| unique `uq_bone_archers_quiver_charm` | `uq_bone_archers_charm` |
| `q_necromancer_calling_1/2/3` | `q_calling_necromancer_1/2/3` |
| sources `r01_barrowking`, `r02_glacier_throne`, `r03_sunken_choir`, `r04_ember_court`, `r05_veilspire`, Mythic+ | Normal dungeons + `whisperwood` world boss, `d14_ashen_reliquary`, `d11_saltdeep_cathedral`, `d15_fire_court`, `d16_the_spire` (Challenge), Depth 10+/15+ |
