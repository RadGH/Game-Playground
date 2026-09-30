# Mage (`mage`)

> *"Magic is a sum. I simply carry the ones."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied). Canon: [page 00](../00-OVERVIEW.md) §6 row 8.
Formulas, threat and tags: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Travel: [page 20](../20-TRAVEL.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | a share of (weapon damage × (1 + spell power)), applied once inside the strike (reuse: `prototypes/farhold/js/rpg.js` `strike`). Page 05 owns it |
| **Mana** | page 06 §4.1: a pool of **1,000** + 2 per INT + gear. Costs on this page are **flat numbers** ("45 mana") and do not change with level. In-combat regen 1% of max a second |
| **GCD** | the 1.0 s global cooldown after a spell (00 §4). Class keys `Q`, `G` and `Shift+1` are off it |
| **Guardian state** | a tank state that multiplies all threat by **×4** (page 05 §13.2). The mage's is **Wardweaving** (§5) |

**Element rule.** The mage is the **arcane** class: every mage spell is `arcane` (violet `#a060e0`, spellfx
`helix` projectiles and glyph rings) **except Fireball**, which the owner kept (W34). Fireball is the mage's
only fire spell; it has no Heat and shares nothing with the Pyromancer's kit (different id, shape and numbers).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who treats spellcraft as geometry: every small spell adds a floating rune to a ring around the mage's head, and the big spells spend the ring. The same ring, turned outward, becomes a wall |
| Primary role | **Damage** (ranged, area and single target) |
| Hybrid role | **Tank** — wards that absorb, a ring that deflects, and **Stand-ins** (decoy images of the mage) that pull enemies off the group (§5) |
| Build | caster |
| Armour | cloth |
| Weapons | **staff** (two-handed) or **wand** + a **focus** off hand (reuse: `prototypes/farhold/js/foci.js` Grimoire, Seer's Orb) |
| Resource | **Mana** + **Resonance** (class mechanic, 0–4, 5 after calling 3) |
| Companion | none. Stand-ins are spell effects that last a few seconds, not pets |
| Playstyle | Build Resonance with cheap, quick spells, then spend it all on one big hitter at the right moment. More Resonance makes every spell hit harder but costs more mana, so you are always choosing between one more build and spending now. As a tank, the same ring becomes damage reduction and the spenders become shields and taunts |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `mage`): *"Arcane Surge:
400% INT"* and *Magic Missile's three bolts* — here as **Collapsing Star** (the capstone spender), the
**Overflow** state (calling 3) and Fireball's *Volley* talent.

---

## 2. Class mechanic — Resonance (new)

### 2.1 Rules

1. **Resonance**: 0–4 (0–5 after calling 3).
2. **Builders** add Resonance: `mage_fireball` +1 (on cast, so a miss still builds), `mage_skip` +1,
   `mage_orrery` +1 per 3 mote hits (max 1 a second), `mage_runic_ward` +1 per hit it absorbs (max 1 a second).
   In **Wardweaving** (§5) a deflected hit also gives +1 (max 1 a second).
3. **Each Resonance held** gives **+8% damage** to every mage spell and makes **builders cost +15% mana**
   (at 4: +32% damage, builders cost +60%).
4. **Spenders** use all Resonance: `mage_prism_lance`, `mage_collapsing_star`. Their per-Resonance bonus is in
   their row and is *on top of* the +8% per Resonance held.
5. Resonance **fades** one at a time, one every 2 s, starting **10 s** after the last build.
6. Before calling 1 there is no gauge: spells deal their base numbers and nothing builds.
7. **Class key `Q` — Stasis** (from calling 1; [page 02](../02-CONTROLS.md) `classKey`): freezes the fade timer
   for **15 s** (cooldown 30 s). After calling 3, pressing `Q` at **5 Resonance** enters **Overflow** instead.
8. **Class key `G` — Unweave** (from calling 1; `classKey2`): the mage's interrupt — see §2.2.
9. **`Shift+1` — Wardweaving** (from calling 1): the tank state, a toggle (§5).

### 2.2 Unweave (class key `G`)

| Field | Value |
|---|---|
| id | `mage_unweave` (a class-key spell; no slot, no talents) |
| Cost / cooldown | 60 mana · 24 s; off the GCD, usable while casting (it cancels your cast) |
| Targeting | **Needs target** (enemy) |
| Range | 30 m, line of sight |
| Tags | `tag_spell` `tag_arcane` |
| Effect | **interrupts** a gold-bordered cast (page 05 §12) and **removes one magic buff** (the newest). An interrupted caster cannot cast that spell for 4 s. On a boss it adds 15% to the break bar instead of interrupting a grey (uninterruptible) cast |
| Visuals | a violet thread pulls out of the target's hands and snaps (spellfx `arc` width 0.05, jitter 0.3, life 0.25) |
| Sound | a torn-cloth rip `mage.unweave` |

### 2.3 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Rune ring** | a circle of 4 (5) slots around a small star icon, left of the mana bar, 64 px | each Resonance is a violet glyph (`glyph_a/b/c` sprites from spellfx) that lights up; the ring spins faster as it fills |
| **Fade timer** | the ring's outer edge | a thin arc that empties over the 10 s before Resonance starts fading |
| **In the world** | around the mage's head | the same glyphs orbit the character at 0.5 m (spellfx `status` `enchant`, recoloured), so the party can see your Resonance |
| **Cost preview** | mana bar | builders' extra cost at the current Resonance is shown as a darker slice |
| **Wardweaving** | ring | the glyphs turn outward and pale blue `#9cc8ff`; a shield icon and the current damage reduction ("−18%") sit in the ring's centre |
| **Overflow** (calling 3) | ring | turns white-gold and the mage floats 0.3 m |

### 2.4 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_mage_1` | **The Carried Ones** — the Brightwater schoolmistress sets three "sums": light three waystones in order against a time limit, then hold a ward over her schoolroom while wisps batter it | **Resonance** turns on (gauge, +8% per Resonance, spenders' bonuses), **Stasis** on `Q`, **Unweave** on `G`, and **Wardweaving** on `Shift+1` |
| 20 | `q_calling_mage_2` | **Standing Wave** — recover a tuning rod from `d05_glass_tombs` and re-tune the Tamar oasis ward | spending **4+ Resonance refunds 60 mana**; Resonance **does not fade while channelling**; Wardweaving's per-Resonance reduction rises from 5% to **6%** |
| 40 | `q_calling_mage_3` | **Overflow** — survive a runaway arcane engine under Rimehold for 90 s by feeding it Resonance | **max 5 Resonance**; at 5, pressing `Q` enters **Overflow** (8 s, once per 60 s): +20% move speed, and the next spender **cannot be interrupted** and **costs no mana**. In Wardweaving, Overflow instead makes the mage **deflect every hit** for 3 s |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `mage_fireball` | Fireball | 45 mana | — | 1.5 s | Auto-target | 40 m | bolt + 3 m splash | `tag_spell` `tag_fire` `tag_ranged` `tag_projectile` `tag_area` | 140% spell damage, 40% splash, Burning; +1 Resonance |
| 2 | 4 | `mage_skip` | Skip | 30 mana | 12 s | instant | Self | 12 m | teleport (self) | `tag_spell` `tag_arcane` `tag_movement` `tag_area` | teleport; the spot you left bursts for 60% in 4 m; +1 Resonance |
| 3 | 10 | `mage_prism_lance` | Prism Lance | 90 mana | 6 s | channel 2 s | Auto-target | 30 m | beam 1.2 m wide | `tag_spell` `tag_arcane` `tag_ranged` `tag_channel` `tag_area` | 4 × 55% spell damage, +20% per Resonance spent |
| 4 | 18 | `mage_runic_ward` | Runic Ward | 70 mana | 24 s | instant | Self | self | self | `tag_spell` `tag_arcane` `tag_shield` `tag_duration` `tag_area` | barrier 25% max health, 8 s; breaks into a 4 m pulse |
| 5 | 28 | `mage_orrery` | Orrery | 110 mana | 18 s | instant | Ground | 35 m | ground circle 6 m | `tag_spell` `tag_arcane` `tag_area` `tag_duration` | 3 orbiting motes, 40% per touch, 10 s |
| 6 | 40 | `mage_collapsing_star` | Collapsing Star | 200 mana | 45 s | 2.5 s cast | Ground | 35 m | 7 m pull, 5 m blast | `tag_spell` `tag_arcane` `tag_area` | 450% spell damage, +60% per Resonance spent |

### 3.2 Spell details

#### `mage_fireball` — Fireball (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 45 mana (+15% per Resonance held) · none |
| Cast | 1.5 s; movable while casting at 50% speed after calling 2 |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point within 40 m |
| Range / shape | bolt, 40 m, 0.45 m radius, 26 m/s, stops on the first enemy; bursts in a **3 m** circle |
| Tags | `tag_spell` `tag_fire` `tag_ranged` `tag_projectile` `tag_area` |
| Effect | **140% spell damage** (fire) to the target; **40%** to other enemies in the 3 m burst |
| Statuses | **Burning** on the target (page 05 `burn`: 40% of the hit as fire over 4 s) |
| Mechanic | **+1 Resonance** on cast |
| Visuals | spellfx `projectile` element `fire` with a violet core (accent `#a060e0`) so a mage's fireball never reads as a Pyromancer's; `aoe` fire 3 m on impact |
| Sound | `spell.fire.launch` + `spell.fire.impact`, with a thin glass chime on top (`mage.chime`) |

#### `mage_skip` — Skip (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 30 mana · 12 s; **1 use** (2 with the talent) |
| Cast | instant; usable while casting (cancels the cast) and while rooted (breaks the root) |
| Targeting | **Self** |
| Range / shape | teleports the mage **12 m** in the direction of movement (backwards if standing still); stops at a wall |
| Tags | `tag_spell` `tag_arcane` `tag_movement` `tag_area` |
| Effect | the spot you left **folds shut 1.0 s later**: **60% spell damage** in a 4 m circle |
| Mechanic | **+1 Resonance** |
| Visuals | the mage shrinks into a violet line (spellfx `beam` narrow 0.1, life 0.15) and unfolds at the target; a spellfx `aoe` arcane ring at the old spot 1 s later |
| Sound | paper-fold snap `mage.fold` + `spell.arcane.impact` |

#### `mage_prism_lance` — Prism Lance (slot 3, level 10) — SPENDER

| Field | Value |
|---|---|
| Cost / cooldown | 90 mana · 6 s |
| Cast | **channel 2.0 s**, 4 ticks (one each 0.5 s); cannot move (talents change) |
| Targeting | **Auto-target** — the beam is aimed at your target, or at the enemy nearest the aim point |
| Range / shape | beam 30 m long, 1.2 m wide, **pierces** everything on the line |
| Tags | `tag_spell` `tag_arcane` `tag_ranged` `tag_channel` `tag_area` |
| Effect | **55% spell damage per tick** to every enemy on the beam, **+20% per Resonance spent** (4: 4 × 99%, plus the +32% held bonus at the moment the channel starts) |
| Mechanic | **spends all Resonance** when the channel starts |
| Statuses | **Marked** (page 05: +15% damage taken, 8 s) on targets hit by the last tick |
| Visuals | a white beam that splits into violet/blue/gold bands at the far end (spellfx `beam` rotated horizontal + three `arc` lines jittered 0.05); `impact` arcane on each tick |
| Sound | glassy hum `mage.prism` rising in pitch per tick |

#### `mage_runic_ward` — Runic Ward (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 70 mana · 24 s |
| Cast | instant; usable while casting |
| Targeting | **Self** (talent *Shared Ward* makes it **Ally**) |
| Range / shape | self |
| Tags | `tag_spell` `tag_arcane` `tag_shield` `tag_duration` `tag_area` |
| Effect | a **barrier absorbing 25% of max health** for 8 s. When it breaks (or expires), it pulses **80% spell damage** in 4 m and **knocks enemies 3 m back** |
| Mechanic | **+1 Resonance per hit absorbed** (max 1 a second) |
| Statuses | a spell shield (page 05 §15) |
| Visuals | four spinning glyph rings (spellfx `ring` axis vertical, glyph sprites) around the body; break = `aoe` arcane + `ring` r0 0.5 → r1 4 |
| Sound | `status.barrier.apply`; break: glass shatter `fragment.crash.small` + `spell.arcane.impact` |

#### `mage_orrery` — Orrery (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 110 mana (+15% per Resonance held — it is a builder) · 18 s |
| Cast | instant |
| Targeting | **Ground**, 35 m |
| Range / shape | a **6 m circle**; three motes orbit its edge at 1 revolution per 2 s for **10 s** |
| Tags | `tag_spell` `tag_arcane` `tag_area` `tag_duration` |
| Effect | each mote deals **40% spell damage** to every enemy it touches (0.8 m mote radius), max once per enemy per mote each 0.5 s |
| Mechanic | **+1 Resonance per 3 mote hits** (max 1 a second) |
| Visuals | a ground rune disc (spellfx `decal` `glyph_b`, size 12, life 10) with three arcane `helix` heads orbiting at 1.2 m |
| Sound | a ticking clockwork loop `mage.orrery` + `spell.arcane.impact` at 50% volume on touch |

#### `mage_collapsing_star` — Collapsing Star (slot 6, level 40) — SPENDER

| Field | Value |
|---|---|
| Cost / cooldown | 200 mana · 45 s |
| Cast | **2.5 s** cast time |
| Targeting | **Ground**, 35 m |
| Range / shape | a star appears at the point and hangs **1.0 s**: it **pulls** every enemy in **7 m** 4 m toward the centre (bosses and elites are not moved), then implodes in a **5 m** circle |
| Tags | `tag_spell` `tag_arcane` `tag_area` |
| Effect | **450% spell damage**, **+60% per Resonance spent** (4: 690% plus the held bonus) |
| Mechanic | **spends all Resonance**; at 4+ also **refunds 200 mana** |
| Statuses | **Marked** 8 s, **Dazed** 2 s |
| Visuals | spellfx `vortex` element `arcane`, radius 7, ms 1000, then a white flash and `aoe` arcane over the 5 m circle; the star is a `glyph_a` decal standing upright, spinning |
| Sound | rising drone `mage.star.charge` then a deep implosion (`spell.arcane.impact` pitched down 40%) |

### 3.3 How it plays

* **Solo:** Fireball ×3–4 → Prism Lance down a line of enemies → Fireball again. Skip away from melee (the
  fold damages whoever followed you). Ward before a pack reaches you — it builds Resonance while it holds.
  With no healer, Wardweaving plus a Stand-in lets the mage hold a big pull on its own.
* **Normal dungeon (Damage):** drop the **Orrery** on the tank's pack, Fireball to 4 Resonance,
  **Collapsing Star** (it groups the pack for the tank too). Bosses: Fireball → 4 Resonance → Lance → repeat;
  Star on cooldown in a burn phase. Keep Skip for the boss's danger zone and Unweave for its gold casts.
* **Challenge and Depth:** hold Resonance through a "boss moves / becomes immune" phase (it fades after 10 s,
  so build late), then Star the moment the boss is open. Overflow (calling 3) makes the next spender
  uninterruptible — save it for bosses that knock you back mid-cast.

### 3.4 Boss mechanics

| Mechanic | Mage answer |
|---|---|
| **Soak** | can soak; pre-cast Runic Ward (25% max health barrier) and the soak hit **builds Resonance** |
| **Void zone / danger zone** | **Skip** (12 m, 2 uses with talent); breaks roots |
| **Immunity** | talent `mage_skip_t4a` *Unwritten*: **0.5 s immune** to all damage on arrival |
| **Interrupt** | **Unweave** (`G`, 24 s) |
| **Dispel enemy buffs** | Unweave removes one magic buff |
| **Adds** | Collapsing Star's pull groups adds; Orrery shreds them; as tank, Stand-ins hold them (§5) |
| **Knockbacks** | Overflow (calling 3) makes a spender uninterruptible |
| **Projectile barrages** | talent `mage_runic_ward_t2a` *Reflection*; in Wardweaving, Prism Wall blocks them (§4) |

---

## 4. Alternate spells — Wardweaving versions

While **Wardweaving** is on (§5), four of the six spells change into their tank versions. The bar keeps the
same keys; the icon gains a pale-blue shield corner. Fireball and Orrery do not change (their tank versions
are talents, §7).

| Slot | Normal spell | In Wardweaving | Targeting | Tags | Effect in Wardweaving |
|---|---|---|---|---|---|
| 2 | Skip | **Stand-in Step** (`mage_skip_standin`) | Self | `tag_spell` `tag_arcane` `tag_movement` `tag_minion` `tag_duration` | teleports 12 m as Skip; instead of the fold burst, leaves a **Stand-in** at the old spot for **6 s** (see §5.3) |
| 3 | Prism Lance | **Prism Wall** (`mage_prism_wall`) | Ground | `tag_spell` `tag_arcane` `tag_area` `tag_duration` `tag_shield` | spends all Resonance; raises a **wall of light 10 m long, 3 m high** for **4 s + 1 s per Resonance spent** that **blocks enemy projectiles** and beams passing through it (not ground effects). Enemies that walk through take 60% spell damage and are Marked. Cost 90 mana, cooldown 12 s |
| 4 | Runic Ward | **Bastion Ward** (`mage_bastion_ward`) | Self | `tag_spell` `tag_arcane` `tag_shield` `tag_duration` | barrier **35% of max health** for 10 s; cooldown **16 s**; **every spender** cast while it holds refills it by 8% of max health; no break pulse |
| 6 | Collapsing Star | **Gravity Well** (`mage_gravity_well`) | Ground (within 12 m of you) | `tag_spell` `tag_arcane` `tag_area` | spends all Resonance; the star pulls as normal, deals **200% spell damage**, **taunts** every enemy in 7 m for **4 s** (bosses included — counts as a taunt, page 05 §13.4), and gives the mage a barrier of **4% of max health per enemy pulled** (max 24%). Cooldown 30 s |

---

## 5. The hybrid role — Tank

The owner's example (W7): *a mage who tanks by creating shields, deflecting damage and distracting enemies*.

**Role focus** (canon 00 §6): the mage uses the shared **Role focus** switch in the spellbook (out of combat,
saved per Loadout). **Hybrid** queues it as **Tank** (from calling 1); **Primary** queues it as Damage. The switch
is **tied to Wardweaving** (§5.1), the form key that actually turns the tank kit on: Hybrid focus is what the
Dungeon Finder reads, Wardweaving is what changes the spells, threat and defences in the fight.
The mage tanks by **absorbing** (wards), **deflecting** (the rune ring turned outward) and **distracting**
(Stand-ins that enemies attack instead of the group). It has no block and no heavy armour; its health pool
is small and its shields do the work, so a healer's job is to keep the mage's health full *between* ward
refreshes rather than to out-heal a steady stream of hits.

### 5.1 Wardweaving (the Guardian state)

| Field | Value |
|---|---|
| id / key | `mage_wardweaving` · `Shift+1` (form key, [page 02](../02-CONTROLS.md)); unlocks at calling 1 (level 6) |
| Switching | toggle; 1.0 s to switch, off the GCD; at most once every 5 s; can be toggled in combat |
| Threat | **×4** on everything (page 05 §13.2 Guardian state) |
| Health | **+25% max health** |
| Armour | cloth armour **×2.5** (reaches about a medium-armour wearer's value) |
| Resonance becomes defence | each Resonance held gives **5% damage reduction** (6% after calling 2): 4 → 20–24%, 5 → 30% |
| Deflect | **12% chance, +3% per Resonance held** (max 27% at 5) that an incoming hit **deflects**: a melee hit deals **0**, a projectile is **sent back** at its shooter for 50% of its damage. Area hits and damage over time cannot be deflected. A deflect gives **+1 Resonance** (max 1 a second) |
| Resonance fade | slowed: starts **15 s** after the last build (was 10 s) |
| Damage | −25% spell damage dealt (threat is multiplied after this) |
| Spells | four spells change (§4) |
| Dungeon Finder | a mage with calling 1 and Role focus on **Hybrid** queues as **Tank** |
| HUD | the ring turns pale blue with a shield (§2.3); nameplate threat colours invert (page 05 §13.7) |

### 5.2 Holding threat

| Tool | What it does |
|---|---|
| **Provoke** (the shared taunt, level 10, page 07) | sets threat to 110% of the top, Taunted 3 s |
| **Gravity Well** (§4, slot 6, level 40) | area taunt in 7 m, 4 s |
| **Fireball** in Wardweaving | its splash is the mage's "hit everything" tool: 140% + 40% splash × 4 threat |
| **Orrery** | 10 s of area damage across a 6 m circle keeps a pack on the mage |
| **Stand-ins** (§5.3) | pull loose enemies off healers |
| **Unweave** | interrupts a caster add that would otherwise stay back and cast |

### 5.3 Stand-ins (decoy images)

A **Stand-in** is a translucent copy of the mage (the mage's Chibi 2 look at 60% opacity with a violet
edge) that enemies attack instead of the group. It is a spell effect, not a pet: it takes no party slot, does
not move and cannot be healed.

| Property | Value |
|---|---|
| Made by | Stand-in Step (§4), talent `mage_skip_t3a` *Stand-in*, `mage_orrery_t3c` *Crowd of Stand-ins*, the soul `soul_mirrored_self` |
| Health | **15% of the mage's max health** (as a shield: damage past it ends it) |
| Lasts | 6 s (Stand-in Step), 3–4 s from other sources |
| Threat | on appearing, it **taunts up to 3 non-boss enemies within 8 m** that are **not** already attacking the mage, for its whole life |
| Bosses | a boss is never pulled by a Stand-in (it is not a real taunt on bosses) |
| Ending | when it ends, the enemies it held return to their threat table — which, in Wardweaving, normally puts them back on the mage |
| Boss mechanics | Stand-ins do not count toward soaks and ignore void zones (they do not move) |

### 5.4 Talents that turn spells into their tank versions

These tier choices exist for every mage; they are written for Wardweaving and marked **[tank]** in §7.

| Spell | Talent | What it does as a tank |
|---|---|---|
| Fireball | `mage_fireball_t2c` *Lure* [tank] | Fireball's burst **taunts** non-boss enemies hit for 2 s (not a real taunt on bosses) |
| Skip | `mage_skip_t3a` *Stand-in* [tank] | normal Skip also leaves a 3 s Stand-in (outside Wardweaving too) |
| Runic Ward | `mage_runic_ward_t1a` *Shared Ward* | cast the ward on an **ally** (to cover a healer caught by adds) |
| Runic Ward | `mage_runic_ward_t2a` *Reflection* [tank] | absorbed **projectiles are reflected** for 100% of their damage |
| Orrery | `mage_orrery_t2c` *Warding Orbit* [tank] | motes **intercept enemy projectiles** that cross the circle (each mote stops one every 2 s) |
| Orrery | `mage_orrery_t3c` *Crowd of Stand-ins* [tank] | when it ends, each mote becomes a 3 s Stand-in |
| Collapsing Star | `mage_collapsing_star_t3c` *Heavy Sky* [tank] | Gravity Well's taunt lasts **6 s** and bosses pulled toward it are Marked |
| Prism Lance | `mage_prism_lance_t2d` *Refracting Wall* [tank] | Prism Wall **reflects** projectiles it blocks for 50% |

### 5.5 Gear

Stamina and armour matter more than spell power: CON (health), "+% max health", "+% shield strength",
"+% deflect" affixes (page 08), and the tank set `set_mage_warded_scholar` (§8). A **Seer's Orb** focus with
the shield tag bonus (`tag_shield`) makes every ward stronger.

### 5.6 How well it tanks

Hybrid roles are tuned for the open world, Normal dungeons and moderate Depth (00 §6).

| Content | Mage tank vs a primary tank (warrior/paladin/knight) |
|---|---|
| Open world, solo with followers | ≈ **100%** — Stand-ins and wards are made for loose pulls |
| Normal dungeons | ≈ **90%** of the survivability, **110%** of the area threat (Fireball splash, Orrery, Gravity Well) |
| Depth 1–10 | ≈ **85%** |
| Depth 11+ and Challenge | ≈ **70%** — the mage has no block, and a hard physical hit that lands between ward refreshes takes a big bite. Possible with a practised healer; not the default |

Weak points, on purpose: sustained heavy physical hits (bosses that swing every 1.5 s for 20% of max health),
damage over time (cannot be deflected), and a ward on cooldown during a tank-swap mechanic.

---

## 6. Utility spells

### `mage_portal` — Portal (travel, out of combat, no slot)

Opens a gate the party can step through to a **town waystone the mage has discovered** (00 §6, W9). The numbers
are [page 20](../20-TRAVEL.md) §16.1's; this table repeats them:

| Field | Value (page 20 §16.1) |
|---|---|
| Unlocks | **level 12**, with waystones and Travel Methods (page 07) |
| Targeting | **Self** (the gate opens at your feet) |
| Cost / cooldown | no mana, no reagent · **15 min** cooldown |
| Cast | **10 s**, out of combat, open world and towns only (not inside a dungeon or a world-boss arena during its fight); moving or taking damage cancels it |
| Where to | any **town waystone the mage has discovered** (never a dungeon or a wild landmark), picked in `scr_teleport_picker` before the cast starts |
| The gate | stands **60 s**; the mage and **party members only** (up to **5 people**, followers included) step through with `E`; it closes after 60 s or when 5 have passed. One gate per mage at a time |
| Discovery | anyone arriving **discovers that waystone and town (and its station)** — this is how a mage brings friends to places they have not walked to (00 W9) |
| Looks | a 2.5 m upright ring of turning glyphs (spellfx `vortex` element `arcane`, vertical) |
| Sound | `ambience.portal` loop, a glass chime as each person passes |

No other utility spells.

---

## 7. Talents

Tiers open at **12 / 22 / 32 / 45** (a tier before the spell's own level opens when the spell is learned).
**[tank]** marks a choice written for Wardweaving (§5.4); it works outside it too unless it says otherwise.

### `mage_fireball`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_fireball_t1a` | Volley | fires **3 fireballs** at 3 different enemies within 15 m of the target, 50% each, no splash; still +1 Resonance |
| 1 | `mage_fireball_t1b` | Arcane Dart | becomes an **instant arcane dart**: 90% spell damage, no splash, no Burning (tags: `tag_arcane` replaces `tag_fire`, −`tag_area`) |
| 2 | `mage_fireball_t2a` | Seeker | the bolt **homes** onto the nearest enemy within 6 m of its path |
| 2 | `mage_fireball_t2b` | Wide Burst | splash **3 → 5 m**, splash damage 40 → **60%** |
| 2 | `mage_fireball_t2c` | Lure **[tank]** | the burst **taunts** non-boss enemies hit for 2 s |
| 3 | `mage_fireball_t3a` | Carry the One | a critical hit gives **+2 Resonance** |
| 3 | `mage_fireball_t3b` | Remainder | at max Resonance, a Fireball **refunds its cost** and fires a second one for free |
| 4 | `mage_fireball_t4a` | Proof | every 5th Fireball **splits on impact** into 4 shards (40% each) in a 5 m cross |
| 4 | `mage_fireball_t4b` | Long Division | deals **+3% per metre** beyond 20 m (max +60%) |

### `mage_skip`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_skip_t1a` | Double Skip | **2 uses** stored |
| 1 | `mage_skip_t1b` | Long Skip | distance 12 → **20 m**, 1 use |
| 2 | `mage_skip_t2a` | Crease | the fold leaves a **6 m slowing field** (−40% move) for 4 s |
| 2 | `mage_skip_t2b` | Swap | aim at an **ally in 20 m** to swap places with them (pulls a friend out of a void zone; targeting becomes **Ally**) |
| 3 | `mage_skip_t3a` | Stand-in **[tank]** | a **Stand-in** stays at the old spot for 3 s (§5.3) |
| 3 | `mage_skip_t3b` | Refold | if you Skip back into the old spot within 3 s, the fold hits **three times** |
| 4 | `mage_skip_t4a` | Unwritten | **0.5 s immune** to all damage on arrival |
| 4 | `mage_skip_t4b` | Skip Together | carries **allies within 3 m** with you |

### `mage_prism_lance`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_prism_lance_t1a` | Walking Beam | can **move at 60%** while channelling |
| 1 | `mage_prism_lance_t1b` | Split Spectrum | **three beams** in a 30° fan, each 45% per tick |
| 2 | `mage_prism_lance_t2a` | Refraction | when the beam hits a wall or pillar it **bounces once** (another 20 m) |
| 2 | `mage_prism_lance_t2b` | Dispersal | enemies killed by the beam burst for 80% in 3 m |
| 2 | `mage_prism_lance_t2c` | Severing Beam | the first tick **interrupts** (shares Unweave's 24 s cooldown) |
| 2 | `mage_prism_lance_t2d` | Refracting Wall **[tank]** | Prism Wall **reflects** the projectiles it blocks for 50% |
| 3 | `mage_prism_lance_t3a` | Sweep | the beam **follows your aim** (turn rate 60°/s) |
| 3 | `mage_prism_lance_t3b` | Focal Point | the whole channel hits **only the first target** for +80% |
| 4 | `mage_prism_lance_t4a` | White Light | at 4+ Resonance the Lance becomes **4 m wide** and lasts 3 s (Prism Wall: **20 m** long) |
| 4 | `mage_prism_lance_t4b` | Prismatic Wake | the beam leaves a **30 m line** on the ground for 5 s (40% a second to enemies) |

### `mage_runic_ward`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_runic_ward_t1a` | Shared Ward | cast on an **ally** in 30 m (absorbs 25% of *their* max health); targeting becomes **Ally** |
| 1 | `mage_runic_ward_t1b` | Bastion Glyph | 40% max health barrier, no break pulse |
| 2 | `mage_runic_ward_t2a` | Reflection **[tank]** | absorbed **projectiles are reflected** at their shooter for 100% of their damage |
| 2 | `mage_runic_ward_t2b` | Mana Sink | 20% of absorbed damage is **returned as mana** |
| 3 | `mage_runic_ward_t3a` | Implode | the break pulse **pulls** enemies in instead of pushing |
| 3 | `mage_runic_ward_t3b` | Cold Logic | while the ward holds, **spells cannot be interrupted** |
| 4 | `mage_runic_ward_t4a` | Glyph Prison | the break pulse **roots** enemies for 3 s |
| 4 | `mage_runic_ward_t4b` | Second Proof | when it breaks, a second ward of **10%** forms instantly (once per cast) |

### `mage_orrery`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_orrery_t1a` | Heliocentric | the Orrery **follows you**, centred on the mage, 5 m radius (the tank's usual pick) |
| 1 | `mage_orrery_t1b` | Five Bodies | **5 motes**, each 30% |
| 2 | `mage_orrery_t2a` | Eclipse | when two motes cross (twice a revolution) they blast **120%** at the crossing point |
| 2 | `mage_orrery_t2b` | Gravity | enemies inside the circle are **slowed 30%** |
| 2 | `mage_orrery_t2c` | Warding Orbit **[tank]** | motes **intercept enemy projectiles** that cross the circle (each mote stops one every 2 s) |
| 3 | `mage_orrery_t3a` | Retrograde | motes reverse direction every 2 s and **hit twice as often** |
| 3 | `mage_orrery_t3b` | Launch | when it ends, each mote **flies at the nearest enemy** for 150% |
| 3 | `mage_orrery_t3c` | Crowd of Stand-ins **[tank]** | when it ends, each mote becomes a **3 s Stand-in** where it stood |
| 4 | `mage_orrery_t4a` | Grand Orrery | radius **10 m**, lasts **15 s** |
| 4 | `mage_orrery_t4b` | Star Chart | casting a spender inside it **resets** its duration to 10 s |

### `mage_collapsing_star`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `mage_collapsing_star_t1a` | Quick Collapse | cast **1.5 s**, 380% base |
| 1 | `mage_collapsing_star_t1b` | Binary Star | **two stars** 6 m apart, 260% each (they overlap in the middle) |
| 2 | `mage_collapsing_star_t2a` | Event Horizon | pull radius **12 m**, pull strength 6 m |
| 2 | `mage_collapsing_star_t2b` | Stellar Remnant | leaves a **4 m void** (a void zone for enemies only, 10 s) dealing 30% a second |
| 3 | `mage_collapsing_star_t3a` | Supernova | if it kills 3+ enemies, **cooldown −20 s** |
| 3 | `mage_collapsing_star_t3b` | Gravitic Lens | allies' spells passing through the star's 7 m circle in the 1 s hang **deal +25%** |
| 3 | `mage_collapsing_star_t3c` | Heavy Sky **[tank]** | Gravity Well's taunt lasts **6 s**; bosses in it are Marked |
| 4 | `mage_collapsing_star_t4a` | Zero Point | the star **gives the Resonance back** 3 s after it lands (once per cast) |
| 4 | `mage_collapsing_star_t4b` | Heavens Fall | the star **follows the targeted enemy** during the 1 s hang (single-target boss version, +40%) |

---

## 8. Class sets

### `set_mage_sumwrights_robes` — Sumwright's Robes (level 34, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Fireball has a **20% chance to build 2 Resonance** | `mage_fireball` |
| 4 | Prism Lance with **4 Resonance** also fires its beam **backwards** at 50% | `mage_prism_lance` |
| 6 | Skip **resets** whenever you spend 4+ Resonance | `mage_skip` |

Source: bosses of `d09_warmasters_pit` (Normal); chest piece from the `cinder_steppe` world boss ([page 13](../13-WORLD-BOSSES.md)).

### `set_mage_starwright` — Vestments of the Starwright (level 60, damage)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Orrery motes build Resonance faster: **+1 per 2 hits** (was per 3) | `mage_orrery` |
| 4 | Collapsing Star **drops an Orrery** at its centre for free | `mage_collapsing_star`, `mage_orrery` |
| 6 | spending **5 Resonance** on Collapsing Star makes it land **twice** (second at 50%, 1 s later) | `mage_collapsing_star` |

Source: bosses of `d16_the_spire` on **Challenge** (one piece per boss, once a week per boss, Monday 06:00).

### `set_mage_warded_scholar` — Garb of the Warded Scholar (level 60, tank)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Runic Ward and Bastion Ward absorb **+10% max health** | `mage_runic_ward`, `mage_bastion_ward` |
| 4 | a **deflected** hit refreshes Bastion Ward by 3% of max health | Wardweaving, `mage_bastion_ward` |
| 6 | Gravity Well leaves a **Stand-in** on every enemy it taunted's far side (up to 3, 4 s) and resets Prism Wall | `mage_gravity_well`, `mage_prism_wall` |

Source: the final boss's chest at **Depth 10 or deeper** ([page 12](../12-DUNGEONS.md)), any dungeon; one piece per chest.

---

## 9. Class legendaries, uniques and souls

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_unfinished_proof` | **The Unfinished Proof** | off hand (Grimoire) | *Q.E.D.*: max Resonance **+2** (6, or 7 with calling 3); each Resonance above 4 gives **+12%** instead of 8% | secret boss `b_marchheart` of `d16_the_spire` (Challenge), 8% |
| `leg_orbit_of_edric_vane` | **Orbit of Edric Vane** | staff | *Perpetual Motion*: the **Orrery never ends** while you stand inside it; recasting moves it | final boss of `d12_unmade_workshop` at Depth 10+, 2% |
| `leg_foldspace_slippers` | **Foldspace Slippers** | feet | *Here and There*: Skip has **3 uses** and each leaves a fold that deals **200%** instead of 60% | the `riftmarch` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_heart_of_a_dead_star` | **Heart of a Dead Star** | amulet | *Stellar Core*: Collapsing Star's cooldown is **30 s** and its 7 m pull also **pulls elites** | final boss of `d15_fire_court` (Challenge), 6% |
| `leg_prism_of_the_first_sum` | **Prism of the First Sum** | off hand (Seer's Orb) | *Full Spectrum*: Prism Lance **splits into a beam per enemy** within 15 m of the first target (max 5), each at full damage, while you have 4+ Resonance | the `drowned_coast` world boss, 5% |
| `leg_the_understudys_mask` | **The Understudy's Mask** | head | *Full Cast*: in Wardweaving, you keep **one Stand-in** at your side at all times (re-forms 5 s after it ends); it copies your Fireball at 30% | final boss of `d14_ashen_reliquary` (Challenge), 6% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_apprentices_abacus` | **Apprentice's Abacus** | off hand | Resonance fades after **20 s** instead of 10 | `d02_drowned_mill` final boss `b_the_grindwheel`, 10% |
| `uq_glassblowers_rod` | **Glassblower's Rod** | wand | Prism Lance **pierces walls** (not doors) | `d05_glass_tombs` boss 2, 7% |
| `uq_ward_ring_of_anvilgate` | **Ward-Ring of Anvilgate** | ring | Runic Ward's break pulse is **3 m larger** and **stuns non-elites 1 s** | `d03_shaft_seven` final boss `b_stonegullet`, 8% |
| `uq_star_chart_cloak` | **Star-Chart Cloak** | shoulders | while an Orrery exists, **Skip costs no mana** | `whisperwood` rare monsters (page 10), 3% |
| `uq_tutors_patience` | **Tutor's Patience** | chest | Wardweaving's deflect chance **+5%**; a deflected projectile returns for 100% | `d10_rimefang_caverns` final boss, 7% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_mirrored_self` | **Soul of the Mirrored Self** | chest (armour) | **Mage only** | every **Skip** leaves a 3 s **Stand-in** (§5.3) at the old spot; in Wardweaving the Stand-in also **copies your next Fireball** at 50% | the secret boss `b_the_tidewife` of `d11_saltdeep_cathedral` (Normal or Challenge), 4%; or any monster at 0.02% (great luck) |
| `soul_three_suns` | **Soul of Three Suns** | weapon | **Mage only** | at **4+ Resonance**, Fireball **splits in flight** into three fireballs (the target and the 2 nearest enemies within 12 m), each at **70%** with its own splash; still builds 1 Resonance | quest reward: the Riftmarch story chapter that ends at `d12_unmade_workshop` (page 14), Mage version of the reward; or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice: reuse `shared/voices.js` role **`mage`** (`pitch 0.5, depth 0.5, tone 0.65, breath 0.2, rough 0.05, speed 0.48`). Lingo tag `class:mage`.

| When | Lines |
|---|---|
| Resonance full | "The sum is ready." · "Carry the four…" |
| Spender | "Solve for zero." · "And — collapse." |
| Fireball | "Old-fashioned, but it works." |
| Crit | "Elegant." · "Precisely as calculated." |
| Skip | "Not there. Here." |
| Wardweaving on | "Stand behind the working." · "I'll hold the line — on paper and in fact." |
| Stand-in | "Hit that one. It's me, near enough." |
| Unweave | "That spell was badly written." |
| Low health | "The numbers are turning against me!" · "I need a wall — any wall!" |
| Out of mana | "My reserves are spent." |
| Interrupted | "You broke my proof!" |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `avatar-3d/data/class-outfits.json` `mage` (hood, trim robe, staff_orb, scroll case) | default look |
| Stand-in look | the player's own Chibi 2 body, 60% opacity + violet rim (a material variant, not a new model) | Stand-ins |
| Visual only | Farhold `arcane_burst` (ground), `shadow_lance` (bolt), `storm_orbs` (orbit logic), `firebolt` (Fireball arc) | Collapsing Star, Fireball, Orrery drawing |
| spellfx | `projectile`/`impact`/`aoe` `arcane` and `fire`, `vortex`, `beam`, `ring`, `decal` glyph sprites | every spell |
| Foci | `prototypes/farhold/js/foci.js` Grimoire / Seer's Orb | off-hand bases for the legendaries |
| Threat | page 05 §13 threat table and Guardian multiplier | Wardweaving, Stand-ins |
| Dropped | Farhold mage kit (frost_nova, arcane_burst, ice_lance, fire_wall, meteor) and Emberveil's blizzard | ice/storm belong to other classes; Fireball is the one fire spell kept |

---

## 12. Round 2 changes

- New **hybrid Tank** role: Wardweaving (Guardian state on `Shift+1`), four tank spell versions (§4), Stand-ins, [tank] talents, a tank set and legendary.
- **Fireball** added as slot 1 (W34); the old Arcane Dart survives as Fireball's tier-1 talent.
- **Unweave** is now a class key (`G`), not a talent.
- **Portal** travel utility added; its numbers are page 20 §16.1's (10 s cast, 60 s gate, 5 people, 15 min cooldown, level 12).
- Raid, Heroic and Mythic+ sources re-homed to Challenge, Depth and world bosses; a soul pair added.

| Old | New |
|---|---|
| Arcane Charges (`charges`) | **Resonance** |
| Critical Mass (calling 3 state) / "Arcane Surge" hook | **Overflow** |
| calling 2 "Resonance" | **Standing Wave** |
| `mage_fold_step` Fold Step | `mage_skip` **Skip** (talents `mage_fold_step_t*` → `mage_skip_t*`; Double Fold → Double Skip, Long Fold → Long Skip, Folding Party → Skip Together) |
| `mage_arcane_dart` Arcane Dart (slot 1) | `mage_fireball` **Fireball**; Arcane Dart is `mage_fireball_t1b` |
| talent Counterspell Dart / Unravel | class key **Unweave** (`mage_unweave`) |
| talent Afterimage (decoy) | **Stand-in** (`mage_skip_t3a`) |
| `q_mage_calling_1/2/3` | `q_calling_mage_1/2/3` (00 §10) |
| sources `r05_veilspire`, `r04_ember_court`, `r03_sunken_choir`, Mythic+ | `d16_the_spire` / `d15_fire_court` Challenge, `drowned_coast` world boss, Depth 10+ |
| soul `soul_second_self` (clashed with the chronomancer's) | `soul_mirrored_self` |
| `d03_deepdelve` | `d03_shaft_seven` |
| shared taunt "Challenge" | **Provoke** |

- **Sweep (round 2)**: Portal numbers set to page 20 §16.1; §5 names the canon Role focus switch (tied to
  Wardweaving); secret-boss drop sources name their bosses (`b_marchheart`, `b_the_tidewife`).
