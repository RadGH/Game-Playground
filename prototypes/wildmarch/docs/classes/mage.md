# Mage (`mage`)

> *"Magic is a sum. I simply carry the ones."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 8.
Formulas: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | a share of (weapon damage × (1 + spell power)), applied once inside the strike (reuse: `prototypes/farhold/js/rpg.js` `strike`). Page 05 owns it |
| **Mana cost** | a share of maximum mana |
| **GCD** | 1.0 s global recovery after an instant spell (assumed; page 05 decides) |

**Element rule.** The Pyromancer owns fire and the Stormcaller owns lightning (page 00 §6). The Mage is
the **arcane** class: every mage spell is `arcane` (violet `#a060e0`, spellfx `helix` projectiles and glyph
rings). Emberveil's fire and frost ideas (Fireball, Blizzard) are *not* carried over, so no spell here
looks like another class's.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who treats spellcraft as geometry: every small spell adds a floating rune to a ring around the mage's head, and the big spells spend the ring |
| Role | **Damage** only (ranged, area and single target) |
| Armour | cloth |
| Weapons | **staff** (two-handed) or **wand** + a **focus** off hand (reuse: `prototypes/farhold/js/foci.js` Grimoire, Seer's Orb) |
| Resource | **Mana** + **Arcane Charges** (class mechanic) |
| Companion | none |
| Playstyle | Build charges with cheap, quick spells, then spend them all on one big hitter at the right moment. More charges make every spell hit harder but cost more, so you are always choosing between one more build and spending now. A blink and a self-ward keep the mage alive at range |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `mage`): *"Arcane Surge:
400% INT"* and *Magic Missile's three bolts* — here as **Collapsing Star** (the capstone spender) and the
Arcane Dart builder.

---

## 2. Class mechanic — Arcane Charges (new)

### 2.1 Rules

1. **Arcane Charges**: 0–4 (0–5 after calling 3).
2. **Builders** add charges: `mage_arcane_dart` +1, `mage_fold_step` +1, `mage_orrery` +1 per 3 hits,
   `mage_runic_ward` +1 per hit it absorbs (max 1 a second).
3. **Each charge held** gives **+8% arcane damage** to every mage spell and makes **builders cost +25% mana**
   (at 4 charges: +32% damage, builders cost double).
4. **Spenders** use every charge: `mage_prism_lance`, `mage_collapsing_star`. Their per-charge bonus is
   listed in their row and is *on top of* the +8% per charge.
5. Charges **fade** one at a time, one every 2 s, starting **10 s** after the last build.
6. Before calling 1 there is no gauge: spells simply deal their base numbers.
7. **Class key `Q` — Stasis** (from calling 1; [page 02](../02-CONTROLS.md) `classKey`): freezes the fade timer
   for **15 s** (cooldown 30 s). After calling 3, pressing `Q` at **5 charges** enters **Critical Mass** instead.
   `G` (`classKey2`) is unused by the mage.

### 2.2 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Rune ring** | a circle of 4 (5) slots around a small star icon, left of the mana bar, 64 px | each charge is a violet glyph (`glyph_a/b/c` sprites from spellfx) that lights up; the ring spins faster as it fills |
| **Fade timer** | the ring's outer edge | a thin arc that empties over the 10 s before charges start fading |
| **In the world** | around the mage's head | the same glyphs orbit the character at 0.5 m (spellfx `status` `enchant`, recoloured), so party members can see your charges |
| **Cost preview** | mana bar | builders' extra cost at the current charge count is shown as a darker slice |
| **Critical Mass** (calling 3) | ring | turns white-gold and the mage floats 0.3 m |

### 2.3 Calling quests (ids proposed; page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_mage_calling_1` | **The Carried Ones** — the Brightwater schoolmistress sets three "sums": light three waystones in order under a time limit | **Arcane Charges** turn on (gauge, +8%/charge, spenders' bonuses) and **Stasis** on `Q` |
| 20 | `q_mage_calling_2` | **Resonance** — recover a tuning rod from `d05_glass_tombs` and re-tune the Tamar oasis ward | spending **4+ charges refunds 6% mana**; charges **do not fade while channelling** |
| 40 | `q_mage_calling_3` | **Critical Mass** — survive a runaway arcane engine under Rimehold for 90 s by feeding it charges | **max 5 charges**; at 5, pressing `Q` enters **Critical Mass** (8 s, once per 60 s): +20% move speed, and the next spender **cannot be interrupted** and **costs no mana** |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `mage_arcane_dart` | Arcane Dart | 2% mana | — | 1.0 s | 40 m | bolt | 115% spell damage, +1 charge |
| 2 | 4 | `mage_fold_step` | Fold Step | 3% mana | 12 s | instant | 12 m | blink (self) | teleport; the spot you left bursts for 60% in 4 m |
| 3 | 10 | `mage_prism_lance` | Prism Lance | 6% mana | 6 s | channel 2 s | 30 m | beam 1.2 m wide | 4 × 55% spell damage, +20% per charge spent |
| 4 | 18 | `mage_runic_ward` | Runic Ward | 5% mana | 24 s | instant | self | self | barrier 25% max health, 8 s; breaks into a 4 m pulse |
| 5 | 28 | `mage_orrery` | Orrery | 8% mana | 18 s | instant | 35 m | ground circle 6 m | 3 orbiting motes, 40% per touch, 10 s |
| 6 | 40 | `mage_collapsing_star` | Collapsing Star | 14% mana | 45 s | 2.5 s cast | 35 m | ground circle 7 m pull, 5 m blast | 450% spell damage, +60% per charge |

### 3.2 Spell details

#### `mage_arcane_dart` — Arcane Dart (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 2% mana (+25% per charge held) · none |
| Cast | 1.0 s; movable while casting at 50% speed after calling 2 |
| Range / shape | bolt, 40 m, 0.35 m radius, 30 m/s, stops on first enemy |
| Effect | **115% spell damage** (arcane) |
| Mechanic | **+1 charge** on cast (not on hit — a miss still builds) |
| Visuals | spellfx `projectile` element `arcane` shape `helix`; the new charge flies from the impact back to the ring |
| Sound | `spell.arcane.launch` (short), `spell.arcane.impact` |

#### `mage_fold_step` — Fold Step (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 3% mana · 12 s; **2 uses** stored after talent or calling (base 1) |
| Cast | instant; usable while casting (cancels the cast) and while rooted (breaks the root) |
| Range / shape | teleports the mage **12 m** in the direction of movement (backwards if standing still); cannot pass through walls (stops at the wall) |
| Effect | the spot you left **folds shut 1.0 s later**: **60% spell damage** in a 4 m circle |
| Mechanic | **+1 charge** |
| Statuses | none (talents add) |
| Visuals | the mage shrinks into a violet line (spellfx `beam` narrow 0.1, life 0.15) and unfolds at the target; a spellfx `aoe` arcane ring at the old spot 1 s later |
| Sound | paper-fold snap `mage.fold` + `spell.arcane.impact` |

#### `mage_prism_lance` — Prism Lance (slot 3, level 10) — SPENDER

| Field | Value |
|---|---|
| Cost / cooldown | 6% mana · 6 s |
| Cast | **channel 2.0 s**, 4 ticks (one each 0.5 s); cannot move (talents change) |
| Range / shape | beam 30 m long, 1.2 m wide, **pierces** everything on the line |
| Effect | **55% spell damage per tick** to every enemy on the beam, **+20% per charge spent** (4 charges: 4 × 99% plus the +32% held bonus at the moment the channel starts) |
| Mechanic | **spends all charges** when the channel starts |
| Statuses | `marked` (Farhold row: +15% damage taken, 8 s) on targets hit by the last tick |
| Visuals | a white beam that splits into violet/blue/gold bands at the far end (spellfx `beam` rotated horizontal + three `arc` lines jittered 0.05); `impact` arcane on each tick |
| Sound | glassy hum `mage.prism` rising in pitch per tick |

#### `mage_runic_ward` — Runic Ward (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 5% mana · 24 s |
| Cast | instant; usable while casting |
| Range / shape | self |
| Effect | a **barrier absorbing 25% of max health** for 8 s. When it breaks (or expires), it pulses **80% spell damage** in 4 m and **knocks enemies 3 m back** |
| Mechanic | **+1 charge per hit absorbed** (max 1 a second) |
| Statuses | `barrier` (spellfx) |
| Visuals | four spinning glyph rings (spellfx `ring` axis vertical, glyph sprites) around the body; break = `aoe` arcane + `ring` r0 0.5 → r1 4 |
| Sound | `status.barrier.apply`; break: glass shatter `fragment.crash.small` + `spell.arcane.impact` |

#### `mage_orrery` — Orrery (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 8% mana (+25% per charge held — it is a builder) · 18 s |
| Cast | instant, ground-targeted, 35 m |
| Range / shape | a **6 m circle**; three motes orbit its edge at 1 revolution per 2 s for **10 s** |
| Effect | each mote deals **40% spell damage** to every enemy it touches (0.8 m mote radius), max once per enemy per mote each 0.5 s |
| Mechanic | **+1 charge per 3 mote hits** (max 1 per second) |
| Statuses | none |
| Visuals | a ground rune disc (spellfx `decal` `glyph_b`, size 12, life 10) with three arcane `helix` heads orbiting at 1.2 m height |
| Sound | a ticking clockwork loop `mage.orrery` + `spell.arcane.impact` at 50% volume on touch |

#### `mage_collapsing_star` — Collapsing Star (slot 6, level 40) — SPENDER

| Field | Value |
|---|---|
| Cost / cooldown | 14% mana · 45 s |
| Cast | **2.5 s** cast time, ground-targeted, 35 m |
| Range / shape | a star appears at the target and hangs **1.0 s**: it **pulls** every enemy in **7 m** 4 m toward the centre (bosses and elites are not moved), then implodes in a **5 m** circle |
| Effect | **450% spell damage**, **+60% per charge spent** (4 charges: 690% plus the held bonus) |
| Mechanic | **spends all charges**; at 4+ charges also **refunds 20% mana** |
| Statuses | `marked` 8 s, **Dazed 2 s** |
| Visuals | spellfx `vortex` element `arcane`, radius 7, ms 1000, then a white flash and `aoe` arcane over the 5 m circle; the star is a `glyph_a` decal standing upright, spinning |
| Sound | rising drone `mage.star.charge` then a deep implosion (`spell.arcane.impact` pitched down 40%) |

### 3.3 Rotation / how it plays

* **Solo:** Dart ×3–4 → Prism Lance on a line of enemies → Dart again. Fold Step away from melee (the
  fold damages whoever followed you). Ward before a pack reaches you — it charges you up while it holds.
* **Dungeon (5):** pull: drop the **Orrery** on the tank's pack, Dart to 4 charges, **Collapsing Star**
  (it groups the pack for the tank too). Bosses: Dart → 4 charges → Lance → repeat; Star on cooldown
  in a burn phase. Keep one Fold Step for the boss's danger zone.
* **Raid:** the mage is a steady ranged damage dealer with a big burst every 45 s. Hold charges through
  a "boss moves / becomes immune" phase (charges fade after 10 s, so build late), then Star the moment
  the boss becomes vulnerable. At calling 3, Critical Mass makes the next spender uninterruptible —
  save it for bosses that knock you back mid-cast.

### 3.4 Boss mechanics

| Mechanic | Mage answer |
|---|---|
| **Soak** | can soak; pre-cast Runic Ward (25% max health barrier) and the soak hit **builds a charge** |
| **Void zone / danger zone** | **Fold Step** (12 m, 2 uses with talent); breaks roots |
| **Immunity** | talent `mage_fold_step_t4a` *Unwritten*: **0.5 s immune** to all damage after the blink — can "dodge through" one room-wide hit |
| **Interrupt** | talent `mage_arcane_dart_t2b` *Counterspell Dart* (interrupt, 12 s internal cooldown) |
| **Dispel enemy buffs** | talent `mage_arcane_dart_t2c` *Unravel* removes one magic buff |
| **Adds** | Collapsing Star's pull groups adds; Orrery shreds them |
| **Knockbacks** | Critical Mass (calling 3) makes a spender uninterruptible |

---

## 4. Alternate spells

None. The rune ring is the only extra UI.

---

## 5. Talents

Tiers open at **12 / 22 / 32 / 45** (a tier before the spell's own level opens when the spell is learned).

### `mage_arcane_dart`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_arcane_dart_t1a` | Volley | fires **3 darts** at 3 different enemies in 15 m of the target, 45% each; still 1 charge |
| 1 | `mage_arcane_dart_t1b` | Snap Cast | **instant**, 90% spell damage |
| 2 | `mage_arcane_dart_t2a` | Seeker | darts **home** onto the nearest enemy within 6 m of the aim point |
| 2 | `mage_arcane_dart_t2b` | Counterspell Dart | **interrupts** a gold-bordered cast; 12 s internal cooldown on the interrupt |
| 2 | `mage_arcane_dart_t2c` | Unravel | removes **one magic buff** from the target (8 s internal cooldown) |
| 3 | `mage_arcane_dart_t3a` | Carry the One | a critical hit gives **+2 charges** |
| 3 | `mage_arcane_dart_t3b` | Remainder | at max charges, a dart **refunds its cost** and fires a second dart for free |
| 4 | `mage_arcane_dart_t4a` | Proof | every 5th dart **splits on impact** into 4 shards (40% each) in a 5 m cross |
| 4 | `mage_arcane_dart_t4b` | Long Division | darts deal **+3% per metre** beyond 20 m (max +60%) |

### `mage_fold_step`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_fold_step_t1a` | Double Fold | **2 uses** stored (calling not needed) |
| 1 | `mage_fold_step_t1b` | Long Fold | distance 12 → **20 m**, 1 use |
| 2 | `mage_fold_step_t2a` | Crease | the fold leaves a **6 m slowing field** (−40% move) for 4 s |
| 2 | `mage_fold_step_t2b` | Swap | aim at an **ally in 20 m** to swap places with them (pulls a friend out of a void zone) |
| 3 | `mage_fold_step_t3a` | Afterimage | a decoy stays at the old spot for 3 s; enemies not yet hit by you attack it |
| 3 | `mage_fold_step_t3b` | Refold | if you blink back into the old spot within 3 s, the fold hits **three times** |
| 4 | `mage_fold_step_t4a` | Unwritten | **0.5 s immune** to all damage on arrival |
| 4 | `mage_fold_step_t4b` | Folding Party | blink carries **allies within 3 m** with you |

### `mage_prism_lance`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_prism_lance_t1a` | Walking Beam | can **move at 60%** while channelling |
| 1 | `mage_prism_lance_t1b` | Split Spectrum | **three beams** in a 30° fan, each 45% per tick |
| 2 | `mage_prism_lance_t2a` | Refraction | when the beam hits a wall or pillar it **bounces once** (another 20 m) |
| 2 | `mage_prism_lance_t2b` | Dispersal | enemies killed by the beam burst for 80% in 3 m |
| 2 | `mage_prism_lance_t2c` | Severing Beam | the first tick **interrupts** |
| 3 | `mage_prism_lance_t3a` | Sweep | the beam **follows your aim** (turn rate 60°/s) |
| 3 | `mage_prism_lance_t3b` | Focal Point | the whole channel hits **only the first target** for +80% |
| 4 | `mage_prism_lance_t4a` | White Light | at 4+ charges the Lance becomes **4 m wide** and lasts 3 s |
| 4 | `mage_prism_lance_t4b` | Prismatic Wake | the beam leaves a **30 m line** on the ground for 5 s (40% a second to enemies) |

### `mage_runic_ward`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_runic_ward_t1a` | Shared Ward | cast on an **ally** in 30 m (absorbs 25% of *their* max health) |
| 1 | `mage_runic_ward_t1b` | Bastion Glyph | 40% max health barrier, no break pulse |
| 2 | `mage_runic_ward_t2a` | Reflection | absorbed **projectiles are reflected** at their shooter for 100% of their damage |
| 2 | `mage_runic_ward_t2b` | Mana Sink | 20% of absorbed damage is **returned as mana** |
| 3 | `mage_runic_ward_t3a` | Implode | the break pulse **pulls** enemies in instead of pushing |
| 3 | `mage_runic_ward_t3b` | Cold Logic | while the ward holds, **spells cannot be interrupted** |
| 4 | `mage_runic_ward_t4a` | Glyph Prison | the break pulse **roots** enemies for 3 s |
| 4 | `mage_runic_ward_t4b` | Second Proof | when it breaks, a second ward of **10%** forms instantly (once per cast) |

### `mage_orrery`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_orrery_t1a` | Heliocentric | the Orrery **follows you**, centred on the mage, 5 m radius |
| 1 | `mage_orrery_t1b` | Five Bodies | **5 motes**, each 30% |
| 2 | `mage_orrery_t2a` | Eclipse | when two motes cross (twice a revolution) they blast **120%** at the crossing point |
| 2 | `mage_orrery_t2b` | Gravity | enemies inside the circle are **slowed 30%** |
| 3 | `mage_orrery_t3a` | Retrograde | motes reverse direction every 2 s and **hit twice as often** |
| 3 | `mage_orrery_t3b` | Launch | when it ends, each mote **flies at the nearest enemy** for 150% |
| 4 | `mage_orrery_t4a` | Grand Orrery | radius **10 m**, lasts **15 s** |
| 4 | `mage_orrery_t4b` | Star Chart | casting a spender inside it **resets** its duration to 10 s |

### `mage_collapsing_star`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_collapsing_star_t1a` | Quick Collapse | cast **1.5 s**, 380% base |
| 1 | `mage_collapsing_star_t1b` | Binary Star | **two stars** 6 m apart, 260% each (they overlap in the middle) |
| 2 | `mage_collapsing_star_t2a` | Event Horizon | pull radius **12 m**, pull strength 6 m |
| 2 | `mage_collapsing_star_t2b` | Stellar Remnant | leaves a **4 m void** (enemy void zone, 10 s) dealing 30% a second to enemies only |
| 3 | `mage_collapsing_star_t3a` | Supernova | if it kills 3+ enemies, **cooldown −20 s** |
| 3 | `mage_collapsing_star_t3b` | Gravitic Lens | allies' spells passing through the star's 7 m circle in the 1 s hang **deal +25%** |
| 4 | `mage_collapsing_star_t4a` | Zero Point | the star **grants the charges back** 3 s after it lands (once per cast) |
| 4 | `mage_collapsing_star_t4b` | Heavens Fall | the star **follows the targeted enemy** during the 1 s hang (single-target boss version, +40%) |

---

## 6. Class sets

### `set_mage_sumwrights_robes` — Sumwright's Robes (level 34, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Arcane Dart has a **20% chance to build 2 charges** | `mage_arcane_dart` |
| 4 | Prism Lance with **4 charges** also fires its beam **backwards** at 50% | `mage_prism_lance` |
| 6 | Fold Step **resets** whenever you spend 4+ charges | `mage_fold_step` |

Drop: bosses of `d09_warmasters_pit` (Normal, Heroic); chest from the `cinder_steppe` world boss.

### `set_mage_starwright` — Vestments of the Starwright (level 60, raid)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Orrery motes build charges faster: **+1 charge per 2 hits** (was per 3) | `mage_orrery` |
| 4 | Collapsing Star **drops an Orrery** at its centre for free | `mage_collapsing_star`, `mage_orrery` |
| 6 | spending **5 charges** on Collapsing Star makes it land **twice** (second at 50%, 1 s later) | `mage_collapsing_star` |

Drop: `r05_veilspire` bosses 1–8 (tokens), Normal/Mythic.

### `set_mage_warded_scholar` — Garb of the Warded Scholar (level 60, Mythic+)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Runic Ward absorbs **+10% max health** | `mage_runic_ward` |
| 4 | while Runic Ward holds, Prism Lance **costs no mana** | `mage_prism_lance` |
| 6 | Runic Ward's break pulse **gives 2 charges** and resets Prism Lance | `mage_runic_ward`, `mage_prism_lance` |

Drop: Mythic+ end chest key 8+.

---

## 7. Class legendaries and uniques

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_unfinished_proof` | **The Unfinished Proof** | off hand (Grimoire) | *Q.E.D.*: max charges **+2** (6, or 7 with calling 3); each charge above 4 gives **+12%** instead of 8% | secret boss of `r05_veilspire`, 8% |
| `leg_orbit_of_edric_vane` | **Orbit of Edric Vane** | staff | *Perpetual Motion*: the **Orrery never ends** while you stand inside it; recasting moves it | final boss of `d12_unmade_workshop` Mythic+ 10+, 2% |
| `leg_foldspace_slippers` | **Foldspace Slippers** | feet | *Here and There*: Fold Step has **3 uses** and each blink leaves a fold that deals **200%** instead of 60% | the `riftmarch` world boss, 4% |
| `leg_heart_of_a_dead_star` | **Heart of a Dead Star** | amulet | *Stellar Core*: Collapsing Star's cooldown is **30 s** and its 7 m pull also **pulls elites** | final boss of `r04_ember_court` Mythic, 6% |
| `leg_prism_of_the_first_sum` | **Prism of the First Sum** | off hand (Seer's Orb) | *Full Spectrum*: Prism Lance **splits into a beam per enemy** within 15 m of the first target (max 5), each at full damage, while you have 4+ charges | `r03_sunken_choir` boss 5, 5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_apprentices_abacus` | **Apprentice's Abacus** | off hand | charges fade after **20 s** instead of 10 | `d02_drowned_mill` final boss `b_the_grindwheel`, 10% |
| `uq_glassblowers_rod` | **Glassblower's Rod** | wand | Prism Lance **pierces walls** (not doors) | `d05_glass_tombs` boss 2, 7% |
| `uq_ward_ring_of_anvilgate` | **Ward-Ring of Anvilgate** | ring | Runic Ward's break pulse is **3 m larger** and **stuns non-elites 1 s** | `d03_deepdelve` final boss `b_stonegullet`, 8% |
| `uq_star_chart_cloak` | **Star-Chart Cloak** | shoulders | while an Orrery exists, **Fold Step costs no mana** | `whisperwood` rare elites, 3% |

---

## 8. Voice and barks

Voice: reuse `shared/voices.js` role **`mage`** (`pitch 0.5, depth 0.5, tone 0.65, breath 0.2, rough 0.05, speed 0.48`). Lingo tag `class:mage`.

| When | Lines |
|---|---|
| Charges full | "The sum is ready." · "Carry the four…" |
| Spender | "Solve for zero." · "And — collapse." |
| Crit | "Elegant." · "Precisely as calculated." |
| Blink | "Not there. Here." |
| Low health | "The numbers are turning against me!" · "I need a wall — any wall!" |
| Out of mana | "My reserves are spent." |
| Interrupted | "You broke my proof!" |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `avatar-3d/data/class-outfits.json` `mage` (hood, trim robe, staff_orb, scroll case) | default look |
| Visual only | Farhold `arcane_burst` (ground), `shadow_lance` (bolt), `storm_orbs` (orbit logic) | Collapsing Star, Arcane Dart, Orrery drawing |
| spellfx | `projectile`/`impact`/`aoe` `arcane`, `vortex`, `beam`, `ring`, `decal` glyph sprites | every spell |
| Foci | `prototypes/farhold/js/foci.js` Grimoire / Seer's Orb | off-hand bases for the legendaries |
| Dropped | Farhold mage kit (firebolt, frost_nova, arcane_burst, ice_lance, fire_wall, meteor) and Emberveil's fireball/blizzard | fire belongs to the Pyromancer, ice/storm to the Stormcaller |
