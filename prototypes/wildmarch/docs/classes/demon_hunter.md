# Demon Hunter (`demon_hunter`)

> *"Everyone else sees a stranger in a grey coat. I see what's wearing him."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied — class rebuilt, W27). Canon: [page 00](../00-OVERVIEW.md) §6 row 11.
Formulas and tags: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Monster tags: [page 10](../10-BESTIARY.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% weapon damage** | a share of the held weapon's damage roll (reuse: `prototypes/farhold/js/rpg.js` `strike`); page 05 owns it |
| **Momentum** | 0–100, starts at 0 (00 §6). Builds as you hit and as you are hit; drains **5 a second** out of combat after 5 s. Base gains (page 06): a basic-attack hit +4 (off hand +2); +1 per 1% of max health taken as damage. Demon hunter extras below |
| **Demon** | a monster with the page 10 tag **Demon** (the `demon` family, Riftmarch rift-spawn, imps, anything a cult caster calls) |
| **Trap** | a device the hunter throws onto the ground; it arms, waits and fires on the first enemy that steps in (`tag_trap`) |

**Momentum for this class**

| Source | Momentum |
|---|---|
| Hunter's Bolt | **+12** per cast |
| a hand-crossbow or dagger basic-attack hit | +4 (off-hand hit +2) — page 05 §4.7 |
| any hit during a **Weak Point** (§2.3) | **+10** extra (max once per 0.5 s) |
| a trap triggering | **+8** |
| damage taken | +1 per 1% of max health |
| out of combat | −5 a second after 5 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A hunter trained by the Riftwatch to use a narrow, cold magic for one job: **finding** demons — however they hide, whoever they are wearing — and **killing** them where they are weakest. Light armour, hand crossbows, knives and a belt of traps |
| Primary role | **Damage** (ranged and close; strongest against demons) |
| Hybrid role | **none** (00 §6 row 11). It brings group utility instead (§5) |
| Build | ranged + melee: bolts at 30 m, knives close. Every spell says which weapon it uses |
| Armour | light |
| Weapons | **hand crossbows** (one, or one in each hand), **daggers** (one or two), **throwing knives**. A hand crossbow in the main hand and a dagger in the off hand is the classic pairing |
| Resource | **Momentum** |
| Companion | none |
| Playstyle | Walk into a room and see what is really there. Lay traps where the fight will go, pin the target with a bolt, and wait for its **Weak Point** to open — every hit in that window is a critical hit. Against demons everything is stronger: the hunter's magic makes them visible, stops them slipping away, and finishes them with a banishing shot |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `demon_hunter`): *+50% damage
vs demons; a sight that sees the unseen.* Here: **Hunter's Oath** (+25% vs Demons — scaled for real time),
**Demonsight** and **Unmask**. The old gauge, demon form and party-death fuel are gone (W27).

---

## 2. Class mechanic — Demonsight and Traps (new)

### 2.1 Hunter's Oath (passive, level 1)

* **+25% damage to Demons.**
* A Demon that is **Unmasked** (§3.2) takes another **+10%** from you.
* A Demon standing in one of your traps' effects **cannot turn invisible, phase, teleport or burrow**.
* Against everything else the hunter is balanced as an ordinary ranged damage class: its base numbers do not
  assume the bonus. In Kingsfire and the Riftmarch, and in dungeons full of demons (`d12_unmade_workshop`,
  `d13_cindergate`, `d15_fire_court`), it is the strongest damage class on the list by about 20%.

### 2.2 Demonsight (passive, grows by calling)

| Level | Range | What you see |
|---|---|---|
| 1 | 20 m | Demons show a red outline **through walls** and a red pip on the minimap |
| calling 1 (6) | 30 m | also **hidden and invisible** enemies of any kind, outlined in pale red; the illusions of enemy casters show as hollow outlines |
| calling 2 (20) | 40 m | **party members within 30 m** of you see everything you reveal |
| calling 3 (40) | 50 m | Demons **disguised** as something else (a cult demon wearing a villager, page 10 "wearing" demons) show their true outline; quest NPCs that are secretly demons (page 14) flag on sight |

Revealing is not a debuff: a revealed enemy is simply drawn and targetable. The `hidden` status is page 05's (§10.6).

### 2.3 Weak Points (calling 1)

1. On a **Demon, elite, champion, rare or boss** you are targeting, a **Weak Point** opens every **6 s** and stays
   open **2 s** (2.5 s after calling 2; on Demons every **4 s** after calling 3).
2. It shows as a bright red eye on a body part (spellfx `decal` `eye` sprite, parented to a bone — the chest on a
   humanoid, the head on a beast) and as a red eye on the **target frame**, with a short rising "tick" 0.5 s
   before it opens (`dh.weakpoint.warn`) and a click when it opens.
3. **Every hit you land while it is open is a critical hit** and builds **+10 Momentum**.
4. Only **your** target has a Weak Point for you. Calling 2 adds **Called Shot**: party members' hits on that target
   during the window get **+20% critical chance**.
5. Setting `set.gameplay.dh_weakpoint_sound` (on/off, default on — page 04 to add).

### 2.4 Traps

| Rule | Value |
|---|---|
| Placing | thrown onto the ground within **25 m** (Ground targeting); it lands in 0.4 s and **arms 0.5 s** later |
| Trigger | the first enemy that steps within **1.5 m** (not critters, not allies) |
| Lasting | **30 s** armed, then it folds away |
| Most at once | **2** · **3** at calling 2 · **4** at calling 3. A new trap over the limit folds the oldest |
| On a Demon | +50% trap damage and effect durations (on top of Hunter's Oath) |
| Seen by | you and your party (a faint amber outline, not a page 11 telegraph colour); enemies do not see them |
| Bosses | a boss walking over a trap sets it off; control effects add to its break bar instead (page 05 §11.4) |
| Class key `Q` — **Spring** (calling 1) | fires **every armed trap you own** at once, wherever they are, as if triggered. Cooldown 10 s |
| Class key `G` | unused |

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Momentum bar** | the resource slot | red bar 0–100 |
| **Trap tray** | a row of 2–4 small trap icons left of the bar | each lit icon is an armed trap, with a ring for its 30 s; greyed when folded |
| **Weak Point eye** | on the target frame | closed → a warning flicker → open (red, with a 2 s countdown ring) |
| **Demonsight** | world and minimap | outlines and pips (§2.2); a tiny eye badge on your frame when calling 2's party sharing is on |

### 2.6 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_demon_hunter_1` | **The Lens** — a wounded Riftwatch hunter at Brightwater gives you her lens and her last target: an imp wearing the reeve of a Hearthvale farm | **Demonsight 30 m**, **Weak Points**, **Spring** on `Q` |
| 20 | `q_calling_demon_hunter_2` | **What the Tombs Keep** — learn to read the true outline of a thing from a Sandsworn tomb-reader, then find the demon hiding among the Glass Tombs' dead | **Demonsight 40 m** shared with the party, Weak Point window **2.5 s**, **Called Shot**, **3 traps**, Vault **2 charges** |
| 40 | `q_calling_demon_hunter_3` | **The Long Hunt** — follow a demon that crossed from a Riftmarch tear down through Frostmantle, wearing a new face in every town | **Demonsight 50 m** (disguises), Weak Points on Demons **every 4 s**, **4 traps** |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `demon_hunter_hunters_bolt` | Hunter's Bolt | builds 12 | — | instant | Auto-target | 30 m (knife 20 m) | bolt | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_basic_attack` | 130% weapon, Hunter's Brand |
| 2 | 4 | `demon_hunter_snare_trap` | Snare Trap | 20 Momentum | 6 s (2 charges) | instant | Ground | 25 m | trap, 1.5 m trigger | `tag_attack` `tag_physical` `tag_trap` `tag_duration` | 80% weapon, Rooted 3 s |
| 3 | 10 | `demon_hunter_vault` | Vault | 15 Momentum | 10 s (1–2 charges) | instant | Self | 8 m move | leap + 2 bolts | `tag_attack` `tag_physical` `tag_movement` `tag_ranged` `tag_projectile` | 2 × 80%, 0.4 s i-frames |
| 4 | 18 | `demon_hunter_unmask` | Unmask | 30 Momentum | 40 s | instant | Self | 40 m pulse | self | `tag_spell` `tag_arcane` `tag_area` `tag_duration` | reveals all, Unmasked 10 s, mind immunity 6 s |
| 5 | 28 | `demon_hunter_grinder_trap` | Grinder Trap | 40 Momentum | 12 s | instant | Ground | 25 m | trap, 4 m circle | `tag_attack` `tag_physical` `tag_trap` `tag_area` `tag_duration` | 50% every 0.5 s for 6 s, Bleeding, drag in |
| 6 | 40 | `demon_hunter_banishing_shot` | Banishing Shot | 30–60 Momentum | 30 s | 0.8 s | Auto-target | 35 m | line 2 m wide | `tag_attack` `tag_physical` `tag_arcane` `tag_ranged` `tag_projectile` `tag_area` | 200% + 5% per Momentum; banishes weakened demons |

### 3.2 Spell details

#### `demon_hunter_hunters_bolt` — Hunter's Bolt (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | **builds 12 Momentum** · none (GCD) |
| Cast | instant, usable while moving |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point in range |
| Range / shape | hand crossbow: bolt **30 m**, 0.3 m radius, 45 m/s. Daggers only: a **thrown knife**, 20 m. Two hand crossbows: two bolts at 65% each (same total, two chances to hit a Weak Point) |
| Tags | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_basic_attack` (it counts as a basic attack for quivers and quiver-like effects, 00 §12.3) |
| Effect | **130% weapon damage** (physical) |
| Statuses | **Hunter's Brand**: the target takes **+5% damage from you**, stacks to 3, 10 s (class status; a small red hook glyph) |
| Visuals | spellfx `projectile` element `physical` shape `arrow` scaled 0.6 (a short bolt) with a crimson trail; the knife uses the Farhold thrown-dagger head |
| Sound | a sharp hand-crossbow snap `dh.bolt` + `status.marked.apply` on the 3rd stack |

#### `demon_hunter_snare_trap` — Snare Trap (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Momentum · 6 s, **2 charges** |
| Cast | instant throw |
| Targeting | **Ground**, 25 m |
| Range / shape | a trap with a 1.5 m trigger; arms 0.5 s after landing; 30 s |
| Tags | `tag_attack` `tag_physical` `tag_trap` `tag_duration` |
| Effect | the jaws snap: **80% weapon damage** and a **Hunter's Brand** stack |
| Statuses | **Rooted** 3 s (Demons **5 s** and cannot phase or teleport) |
| Visuals | a toothed iron ring with red runes (new prop `dh_snare`); on trigger it springs up round the legs and chains to the ground (spellfx `arc` short, `#c02020`) |
| Sound | a heavy iron clack `dh.snare` + chain rattle |

#### `demon_hunter_vault` — Vault (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 15 Momentum · 10 s; **1 charge** (2 after calling 2) |
| Cast | instant |
| Targeting | **Self** (the shots pick the nearest enemy in 30 m) |
| Range / shape | a flip **8 m** in the direction held (backwards if none); fires **2 bolts** (or throws 2 knives) during the flip |
| Tags | `tag_attack` `tag_physical` `tag_movement` `tag_ranged` `tag_projectile` |
| Effect | **80% weapon damage** each; **0.4 s of i-frames** ("invulnerable frames": nothing can damage you) at the start |
| Visuals | a Chibi 2 backflip clip (new `flip_back`, reuse the dodge-roll root motion), two short bolts |
| Sound | cloth whoosh `travel.step.soft` + two `dh.bolt` |

#### `demon_hunter_unmask` — Unmask (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 30 Momentum · 40 s |
| Cast | instant; usable while Feared, Charmed, Blinded or Confused (it breaks them), not while Stunned |
| Targeting | **Self** — a pulse round you |
| Range / shape | **40 m** circle |
| Tags | `tag_spell` `tag_arcane` `tag_area` `tag_duration` |
| Effect | every hidden or invisible enemy in 40 m is **revealed for 10 s to the whole party**. Every **Demon** in range is **Unmasked** for 10 s: it takes **+10% damage from the party**, cannot turn invisible, phase, teleport or burrow, and a disguised demon drops its disguise. **Your target's Weak Point opens at once** |
| Self | immune to **Fear, Charm, Confuse and Blind** for **6 s** |
| Statuses | `unmasked` (class debuff, a cracked-mask icon) |
| Visuals | a crimson `ring` pulse r0 1 → r1 40 along the ground (life 0.8); revealed enemies flash white, then keep a red outline; the hunter's eyes glow (Chibi 2 `eyes: glow`) |
| Sound | a low bell-and-heartbeat `dh.unmask` |

#### `demon_hunter_grinder_trap` — Grinder Trap (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 40 Momentum · 12 s |
| Cast | instant throw |
| Targeting | **Ground**, 25 m |
| Range / shape | a trap with a 1.5 m trigger; when it fires, spinning blades cover a **4 m circle** for **6 s** |
| Tags | `tag_attack` `tag_physical` `tag_trap` `tag_area` `tag_duration` |
| Effect | **50% weapon damage every 0.5 s** to every enemy in the circle (12 hits = 600% over 6 s if it stays in) |
| Statuses | **Bleeding**; enemies inside are **dragged 1 m a second** toward the centre (not bosses or elites) |
| Visuals | a squat drum with folded blades (new prop `dh_grinder`) that pops up and spins (spellfx `ring` axis ground, `slash` sprites orbiting at 0.4 m) |
| Sound | a rising saw-whine loop `dh.grinder` |

#### `demon_hunter_banishing_shot` — Banishing Shot (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | spends **30–60 Momentum** (all you have, up to 60; needs 30) · 30 s |
| Cast | 0.8 s |
| Targeting | **Auto-target** — aimed at your target, or the enemy nearest the aim point |
| Range / shape | a piercing line **35 m long, 2 m wide** |
| Tags | `tag_attack` `tag_physical` `tag_arcane` `tag_ranged` `tag_projectile` `tag_area` |
| Effect | **200% weapon damage + 5% per Momentum spent** (60: 500%) to everything on the line; each Hunter's Brand stack on a target is consumed for **+15%**. Against **Demons: +50%**, and a **non-boss Demon left under 20% health is banished** — it dies at once, leaving no corpse. A **boss** tagged Demon instead has its break bar filled by **20%** |
| Visuals | a heavy bolt wrapped in pale fire: spellfx `breath` element `holy` length 35 arc 0.08 recoloured white-crimson; a banished demon folds inward into a crack of light (spellfx `vortex` small, 0.4 s) |
| Sound | a charged crossbow crack `dh.banish` + a falling hiss on each banish |

### 3.3 How it plays

* **Solo:** Unmask as you enter a demon camp to see every hidden imp. Snare the first enemy that comes, Hunter's
  Bolt to 30+ Momentum, Grinder Trap where the pack will run, Vault when something reaches you. Save the Banishing
  Shot for the moment a demon drops near 25% — it will not get up.
* **Normal dungeon:** pre-place Snares at the tank's pull spot; the pack runs into them. On a boss, keep Hunter's
  Brand at 3, pace your Hunter's Bolts so the big hits land inside the Weak Point window, and Spring every trap at
  once on the add wave.
* **Challenge and Depth:** the Weak Point rhythm is the damage: a hunter who lands Vault and Banishing Shot inside
  windows does about 30% more than one who does not. Call your Weak Points (calling 2's Called Shot) so the party
  bursts with you.

### 3.4 Boss mechanics

| Mechanic | Demon Hunter answer |
|---|---|
| **Soak** | can soak like anyone; no special reduction |
| **Void / danger zones** | **Vault** (8 m, i-frames 0.4 s, 2 charges) |
| **Mind effects** | **Unmask** — immune to Fear, Charm, Confuse and Blind for 6 s, and breaks them |
| **Hidden or invisible adds** | Demonsight and Unmask reveal them to the party |
| **A boss that teleports or phases** | if it is a Demon, a trap under it or Unmask stops it |
| **Adds** | Grinder Trap drags and shreds; Snare roots; Spring fires every trap at once |
| **Interrupt** | talent `demon_hunter_hunters_bolt_t2b` *Pinning Bolt* (12 s internal cooldown) |

---

## 4. Alternate spells

None. The Demon Hunter has no form, stance or gauge (W27). `Q` (Spring) is a class key, not a spell.

---

## 5. The hybrid role

**None** — canon (00 §6 row 11) makes the Demon Hunter a **Damage-only** class, so it cannot queue as anything
else; the shared **Role focus** switch in its spellbook (00 §6) offers only **Primary**. What it brings to a
group instead:

| Utility | Numbers |
|---|---|
| **Sight** | hidden and invisible enemies revealed to the party (calling 2, 30 m; Unmask 40 m for 10 s) |
| **Called Shot** | party +20% crit chance on the hunter's target during each Weak Point (calling 2) |
| **Unmask** | +10% party damage on Demons for 10 s; stops demons phasing or teleporting |
| **Control** | Snare roots (3 s, Demons 5 s), Grinder drag, Spring on demand |
| **Interrupt** | *Pinning Bolt* talent |

---

## 6. Utility spells

### `demon_hunter_hunters_sense` — Hunter's Sense (out of combat, no slot)

| Field | Value |
|---|---|
| Unlocks | calling 1 (level 6) |
| Cost / cooldown | none · 2 min |
| Cast | 1.5 s, out of combat |
| Targeting | **Self** |
| Effect | for **60 s**, marks on your minimap and map every **Demon**, **rare monster**, **champion pack** and **hidden cache** (page 14 secret chests) within **150 m**; a Demon also shows the direction it is facing |
| Tags | `tag_spell` `tag_arcane` |
| Looks / sound | the hunter kneels and touches the lens to one eye; a faint crimson ripple runs out along the ground; `dh.sense` |

Travel: scrolls, Travel Methods and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell).

### `demon_hunter_hunters_bolt`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_hunters_bolt_t1a` | Twin Bolts | fires at **2 targets**, 75% each, +8 Momentum each |
| 1 | `demon_hunter_hunters_bolt_t1b` | Heavy Quarrel | **+40%**, **pierces** 1 |
| 2 | `demon_hunter_hunters_bolt_t2a` | Deep Brand | Hunter's Brand stacks to **5** |
| 2 | `demon_hunter_hunters_bolt_t2b` | Pinning Bolt | **interrupts** a gold-bordered cast (12 s internal cooldown) |
| 3 | `demon_hunter_hunters_bolt_t3a` | Knife Hand | with a dagger in either hand, every 3rd cast is a **point-blank knife flurry** (3 m, 3 × 70%, +6 Momentum) instead of a bolt (tags: +`tag_melee` +`tag_area`) |
| 3 | `demon_hunter_hunters_bolt_t3b` | Ricochet Quarrel | bounces to **1 more** enemy in 10 m at 60% |
| 4 | `demon_hunter_hunters_bolt_t4a` | Hallowed Tips | against **Demons** the bolt deals **+30%** and spreads Hunter's Brand to Demons within 5 m |
| 4 | `demon_hunter_hunters_bolt_t4b` | Patient Eye | a bolt that lands inside a Weak Point **refreshes the window by 0.5 s** (max +1 s per window) |

### `demon_hunter_snare_trap`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_snare_trap_t1a` | Wide Jaws | trigger radius **3 m**; roots **every** enemy in it |
| 1 | `demon_hunter_snare_trap_t1b` | Barbed Jaws | +80% damage and **Bleeding**; root 2 s |
| 2 | `demon_hunter_snare_trap_t2a` | Chain Anchor | the snared enemy is **tethered** to the trap (white tether, page 11, 6 m) for 6 s after the root ends |
| 2 | `demon_hunter_snare_trap_t2b` | Tripwire | throw two traps at once, **linked by a wire 8 m long**: the first enemy to cross the wire sets off both |
| 3 | `demon_hunter_snare_trap_t3a` | Opening | a snared target's **Weak Point opens** at once (once per target every 10 s) |
| 3 | `demon_hunter_snare_trap_t3b` | Third Charge | **3 charges** |
| 4 | `demon_hunter_snare_trap_t4a` | Holy Iron | a snared **Demon** takes **10% of its max health** (bosses: 3%) over the root |
| 4 | `demon_hunter_snare_trap_t4b` | Quick Set | traps **arm instantly** and can be thrown **30 m** |

### `demon_hunter_vault`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_vault_t1a` | Knife Dance | vault **forward through** up to 3 enemies, slashing each for 120% weapon (daggers) or shooting point-blank (+30%) (tags: +`tag_melee`) |
| 1 | `demon_hunter_vault_t1b` | Long Leap | **14 m**, 1 bolt |
| 2 | `demon_hunter_vault_t2a` | Caltrop Wake | leaves **caltrops** where you started (4 m, −50% move, 4 s) (tags: +`tag_trap`) |
| 2 | `demon_hunter_vault_t2b` | Slip Away | enemies lose track of you: **−30% threat** on everything you have hit |
| 3 | `demon_hunter_vault_t3a` | Drop a Snare | a free **Snare Trap** is left where you started (counts toward the trap limit) |
| 3 | `demon_hunter_vault_t3b` | Evasion | i-frames **0.4 → 0.8 s** |
| 4 | `demon_hunter_vault_t4a` | Hunter's Rhythm | each bolt adds **+1 Hunter's Brand** and a Vault inside a Weak Point refunds its charge |
| 4 | `demon_hunter_vault_t4b` | Third Charge | **3 charges** |

### `demon_hunter_unmask`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_unmask_t1a` | Shared Nerve | the **party** within 20 m also gets the immunity to Fear and Blind (not Charm or Confuse) |
| 1 | `demon_hunter_unmask_t1b` | Long Look | Unmasked lasts **15 s**, cooldown 50 s |
| 2 | `demon_hunter_unmask_t2a` | Laid Bare | every enemy hit (not only Demons) takes **+5% from the party** for 10 s |
| 2 | `demon_hunter_unmask_t2b` | Hunter's Harvest | each Demon Unmasked gives **+8 Momentum** (max +40) |
| 3 | `demon_hunter_unmask_t3a` | Open Wounds | while Unmasked, a Demon's Weak Point opens **every 3 s** for you |
| 3 | `demon_hunter_unmask_t3b` | Ward of the Lens | you take **15% less damage from Demons** for 10 s |
| 4 | `demon_hunter_unmask_t4a` | Stripped | Unmask also **removes one magic buff** from every enemy in range |
| 4 | `demon_hunter_unmask_t4b` | Early Warning | while Unmasked enemies live, **danger zones targeting you show 0.5 s earlier** (on your screen only) |

### `demon_hunter_grinder_trap`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_grinder_trap_t1a` | Wide Blades | circle **6 m**, 35% a hit |
| 1 | `demon_hunter_grinder_trap_t1b` | Hungry Blades | circle 3 m, **80% a hit**, no drag |
| 2 | `demon_hunter_grinder_trap_t2a` | Undertow | drag **2 m a second** |
| 2 | `demon_hunter_grinder_trap_t2b` | Serrated | Bleeding **stacks to 3** |
| 3 | `demon_hunter_grinder_trap_t3a` | Rolling Grinder | the grinder **rolls toward the nearest enemy** at 3 m/s while it spins |
| 3 | `demon_hunter_grinder_trap_t3b` | Scrap Return | when it ends it refunds **15 Momentum** |
| 4 | `demon_hunter_grinder_trap_t4a` | Pit Jaws | Demons inside are **Rooted** for the whole 6 s |
| 4 | `demon_hunter_grinder_trap_t4b` | Twin Grinders | **2 charges** |

### `demon_hunter_banishing_shot`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_banishing_shot_t1a` | Spread Shot | a **40° cone 20 m** instead of a line |
| 1 | `demon_hunter_banishing_shot_t1b` | Quick Draw | spends **exactly 30** Momentum; cooldown 18 s |
| 2 | `demon_hunter_banishing_shot_t2a` | Deep Banishing | the banish threshold is **30%** instead of 20% |
| 2 | `demon_hunter_banishing_shot_t2b` | Burning Line | leaves a **crimson line** for 6 s: enemies on it take 25% a second |
| 3 | `demon_hunter_banishing_shot_t3a` | Exorcism | each banish **heals the party within 15 m** for 5% of their max health |
| 3 | `demon_hunter_banishing_shot_t3b` | Rekindled | each banish refunds **20 Momentum** and 10 s of cooldown |
| 4 | `demon_hunter_banishing_shot_t4a` | Point of Weakness | cast inside a Weak Point, the shot **cannot miss, pierces everything** and deals **+50%** |
| 4 | `demon_hunter_banishing_shot_t4b` | Seal the Tear | the line leaves **Snare Traps** every 8 m along it (up to your limit) |

---

## 8. Class sets

### `set_demon_hunter_riftwatch_leathers` — Riftwatch Leathers (level 38, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hunter's Bolt against a Rooted target **builds +6 more** Momentum | `demon_hunter_hunters_bolt` |
| 4 | Vault's bolts **pierce** | `demon_hunter_vault` |
| 6 | traps last **45 s** and you may have **1 more** | traps |

Source: bosses of `d10_rimefang_caverns` and `d11_saltdeep_cathedral` (Normal).

### `set_demon_hunter_banishers_coat` — The Banisher's Coat (level 60)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Weak Points last **+0.5 s** | Weak Points |
| 4 | Banishing Shot **resets** when it banishes a Demon (once per 15 s) | `demon_hunter_banishing_shot` |
| 6 | Unmask also **opens a Weak Point on every Demon** in range for 3 s (for you and, with Called Shot, the party) | `demon_hunter_unmask` |

Source: bosses of `d15_fire_court` on **Challenge** (one piece per boss, once a week per boss, Monday 06:00).

### `set_demon_hunter_trapwrights_harness` — The Trapwright's Harness (level 60, crafted)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Spring's cooldown **10 → 6 s** | Spring |
| 4 | a trap that triggers **re-arms once** 2 s later | traps |
| 6 | Grinder Trap **triggers every armed Snare** within 10 m of it when it fires | `demon_hunter_grinder_trap`, `demon_hunter_snare_trap` |

Source: recipe — Leatherworking 275 ([page 19](../19-PROFESSIONS.md)); the recipe drops from `d13_cindergate` bosses (Normal or Challenge). Reagents: `it_demon_horn`, `it_brimstone` and Riftmarch `it_rift_shard` (page 10).

---

## 9. Class legendaries, uniques and souls

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_lens_of_kael_sorrowend` | **The Lens of Kael Sorrowend** | head | *Never Looks Away*: Weak Points open **every 3 s** on Demons and every 5 s on other targets | secret boss `b_marchheart` of `d16_the_spire` (Challenge), 8% |
| `leg_mercy_and_doubt` | **Mercy and Doubt** | off hand (hand crossbow) | *A Pair*: with two hand crossbows, Hunter's Bolt fires **both at full damage** (2 × 130%) and builds 18 | the `kingsfire` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_jaw_of_the_pit` | **Jaw of the Pit** | belt | *Never Lets Go*: the Grinder Trap **attaches to the first enemy it catches** and follows it for its 6 s (bosses included) | final boss of `d13_cindergate` (Challenge), 6% |
| `leg_banishers_writ` | **The Banisher's Writ** | amulet | *By Right*: Banishing Shot banishes non-boss Demons under **35%** health, and each banish refunds **30 Momentum** | final boss of `d15_fire_court` (Challenge), 6% |
| `leg_snarewright_gloves` | **Snarewright Gloves** | gloves | *Chain Reaction*: when any of your traps triggers, **every other armed trap within 8 m** triggers too | the final boss's chest at Depth 10+, any dungeon, 2% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_imp_catchers_charm` | **Imp-Catcher's Charm** | ring | Hunter's Oath is **+35%** vs imps and other small Demons | `d01_hollow_barrow` final boss `b_hollow_thane`, 12% |
| `uq_scarred_hand_crossbow` | **The Scarred Hand Crossbow** | hand crossbow | Hunter's Bolt **builds +6 more** (18 total) | `d05_glass_tombs` final boss, 7% |
| `uq_watchers_scarf` | **Watcher's Scarf** | shoulders | Demonsight **+10 m**; revealed enemies stay revealed 3 s after leaving it | `d08_moonwell_ruins` boss 2, 7% |
| `uq_ash_walker_boots` | **Ash-Walker Boots** | feet | after Vault lands, **void zones do not damage you for 1 s** | `kingsfire` rare monsters (page 10), 3% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_hunters_eye` | **Soul of the Hunter's Eye** | weapon | **Demon Hunter only** | Weak Points also open on **normal** enemies (every 8 s), and each hit you land in a Weak Point **throws a free knife** at another enemy within 10 m for 60% weapon damage | the secret boss `b_the_finished_thing` of `d12_unmade_workshop` (Normal or Challenge), 4%; or any Demon at 0.02% (great luck) |
| `soul_iron_patience` | **Soul of Iron Patience** | jewellery (ring or amulet) | **Demon Hunter only** | a trap that has waited armed for **10 s or more** deals **+100%** and its root or drag lasts twice as long | quest reward: the Riftmarch story chapter's demon-hunter version (page 14); or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice: **new row `demon_hunter`** proposed for `shared/voices.js` — `pitch 0.36, depth 0.7, tone 0.42,
breath 0.3, rough 0.3, speed 0.52, jitter 0.08` (rough, low, unhurried). Lingo tag `class:demon_hunter`.

| When | Lines |
|---|---|
| Unmask | "Show me your real face." · "There you are." |
| Demon spotted | "That one's not what it's wearing." · "I can see you." |
| Trap set | "Step there. Go on." · "Mind your feet." |
| Weak Point | "Now." · "There — right there." |
| Banish | "Back where you came from." · "Gone. For good." |
| Crit | "Clean." |
| Low health | "Not yet — it's still breathing!" · "I need a minute and a wall." |
| Ally Charmed by a demon | "Wake up — that voice isn't yours!" |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `demon_hunter.look` (buzz cut, glowing eyes, strapped leather, scar, scarf); add a monocle-lens `hat` part (new, `dh_lens`) and a trap belt `decor` | default look |
| Weapons | `avatar-3d/js/chibi2-weapons.js` crossbow (scaled 0.6 as a hand crossbow, new `fh_hand_crossbow`), daggers | weapons |
| Visual only | Farhold `aimed_shot`, `pinning_shot`, `shadowstep`, `multi_shot` | bolt, snare, vault timings |
| Combat feel | `prototypes/farhold/js/combat-feel.js` (knockback, hit-stop) | drag, snare, banish |
| Trap props | Farhold `js/build.js` ghost (placement preview) | trap placement preview |
| Reveal | page 05's `hidden` status (§10.6); the Chibi 2 outline shader used for Demonsight | outlines through walls |
| Dropped | the whole v0.1 kit: Fury, Vengeance, Demon Form, Bastion tank, form bar, wings, Glaive Arc, Hellsight, Chain of Binding, Reckoning; Farhold `dire_companion` | W27 |

---

## 12. Round 2 changes

The class was **rebuilt** (W27): it now uses magic to **find and kill demons**, fights with **hand crossbows,
daggers and traps**, and has **no gauge, no demon form and no Vengeance**. Resource: Momentum. Damage only (the
old Bastion tank variant is gone).

| Old (v0.1) | New |
|---|---|
| Fury | **Momentum** |
| Vengeance gauge, fed by party deaths | removed |
| Demon Form (Ravager / Bastion), form bar, all `demon_hunter_form_*` spells | removed |
| `demon_hunter_brand_bolt` Brand Bolt | `demon_hunter_hunters_bolt` **Hunter's Bolt** (Hunter's Brand kept) |
| `demon_hunter_glaive_arc` Glaive Arc | removed → `demon_hunter_snare_trap` **Snare Trap** |
| `demon_hunter_tumbling_shot` Tumbling Shot | `demon_hunter_vault` **Vault** |
| `demon_hunter_hellsight` Hellsight | `demon_hunter_unmask` **Unmask** + passive **Demonsight** |
| `demon_hunter_chain_of_binding` Chain of Binding | removed → `demon_hunter_grinder_trap` **Grinder Trap** (the chain survives as the *Chain Anchor* talent) |
| `demon_hunter_reckoning` Reckoning | `demon_hunter_banishing_shot` **Banishing Shot** |
| Hunter's Oath +20% (`demonic` tag) | Hunter's Oath **+25%** (monster tag **Demon**) |
| sets Hellborne Harness, Chainwarden (raid) | **Banisher's Coat** (`d15_fire_court` Challenge), **Trapwright's Harness** (crafted) |
| legendaries (Owed Blood, Rift-Lord's Horns, Glaive of the Long Night, Heartseeker Arbalest, Chains of the Warden Below) | Lens of Kael Sorrowend, Mercy and Doubt, Jaw of the Pit, Banisher's Writ, Snarewright Gloves |
| `uq_scarred_crossbow`, `uq_mourning_scarf` | `uq_scarred_hand_crossbow`, `uq_watchers_scarf` |
| `q_demon_hunter_calling_1/2/3` | `q_calling_demon_hunter_1/2/3` |

- **Sweep (round 2)**: "stealthed" enemies → **hidden** (page 05 `hidden` status); §5 says the Role focus switch
  offers only Primary; secret-boss drop sources name their bosses (`b_marchheart`, `b_the_finished_thing`).
