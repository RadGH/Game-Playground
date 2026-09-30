# Demon Hunter (`demon_hunter`)

> *"I carry every one of them. Every friend who fell. And when it's heavy enough, I let it out."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 11.
Formulas: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Bestiary tags: [page 10](../10-BESTIARY.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% weapon damage** | a share of the held weapon's damage roll (reuse: `prototypes/farhold/js/rpg.js` `strike`); page 05 owns it |
| **Fury** | 0–100. Built by hitting and being hit, decays out of combat (canon §6) |
| **Vengeance** | 0–100, the class gauge (§2) |
| **i-frames** | "invulnerable frames": a short window in which nothing can damage you (the dodge roll has them) |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A hunter of the things that come through the Rift, marked by what they hunt. Every death they witness sits in them as Vengeance, and when it is full they let the demon out |
| Role | **Damage** (primary), **Tank** (secondary — the Bastion form) |
| Armour | light |
| Weapons | **crossbow** (two-handed) **or two daggers** (dual wield). With daggers, the ranged spells throw hand-knives (range −15 m) |
| Resource | **Fury** + **Vengeance** |
| Companion | none (Farhold's `dire_companion` is dropped, §9) |
| Playstyle | A fast ranged/melee hybrid that builds Fury with bolts and spends it on glaives and binding chains. Vengeance fills slowly from kills, damage taken and fallen friends; at 100 you choose — **Reckoning**, one enormous shot, or **Demon Form**, 15–20 s as a winged horror with a new spell bar |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `demon_hunter`): *+50%
damage vs demons; Vengeance stacks from fallen allies then unleashes a burst; Glaive Toss; Fel Sight.*
Here: **Hunter's Oath** (+20% vs demonic enemies — scaled for real time), **Vengeance → Reckoning**,
**Glaive Arc** and **Hellsight**.

---

## 2. Class mechanic — Vengeance and Demon Form (new)

### 2.1 Fury (canon resource)

| Source | Fury |
|---|---|
| `demon_hunter_brand_bolt` | +12 |
| any basic weapon hit | +4 |
| taking a hit | +2 (max 10 a second) |
| out of combat | −4 a second after 5 s |

### 2.2 Vengeance (0–100)

| Source | Vengeance |
|---|---|
| you kill a normal enemy | +3 |
| you kill an elite / champion | +10 |
| a boss you are fighting loses 10% health | +5 |
| you lose health | +1 per 2% of max health lost |
| a **party member dies** within 40 m | **+25** |
| a party member drops under 20% health within 40 m | +5 (once per ally per 10 s) |
| Bastion form set (§2.4), each hit taken | +1 extra |

`G` (`classKey2`) is unused by the demon hunter; in Demon Form, `Q` again **ends the form early** (no refund).

Vengeance **does not decay** in combat; out of combat it drains **2 a second after 15 s**.

**Spend it** one of two ways:
* **Reckoning** (`demon_hunter_reckoning`, slot 6, level 40): needs 30+, spends all as one shot.
* **Demon Form** (class key **`Q`**, [page 02](../02-CONTROLS.md) `classKey`; also `Shift+1`, the single button on page 03's form bar): needs **100**, spends all.

### 2.3 Hunter's Oath (passive, level 1)

**+20% damage** to enemies with the `demonic` tag (page 10 should tag: rift-spawn of `riftmarch`, the Ember
Legion's fiends in `emberthrone`, imps, anything summoned by an enemy warlock). While **Hellsight** is up the
bonus is **+30%**.

### 2.4 Demon Form

| | Lesser (calling 1) | Full (calling 2) | Unchained (calling 3) |
|---|---|---|---|
| Duration | 8 s | 15 s | 20 s, killing blows **+1 s** each (max +10) |
| Bar | slots 1 and 4 swap (Rend, Devour); others greyed | slots 1, 2, 4, 5 swap | all six swap |
| On entry | — | knocks back enemies in 5 m | also **heals 20%** max health |

**Two variants** (chosen on the Spellbook, `scr_sheet_spells`, a "Form" toggle — only out of combat; page 03 to add it):

| | **Ravager** (Damage) | **Bastion** (Tank) |
|---|---|---|
| In form | +25% damage, +30% move speed, basic attack becomes claws (3 m, 100% weapon every 0.9 s) | +100% armour, +30% max health (while in form), 20% less damage taken, form spells make **×3 threat** |
| Out of form | — | +15% armour, Vengeance +1 per hit taken, Hellsight also gives **25% damage reduction** |
| Slot 3 in form | Wing Sweep | Iron Wings (§4) |

The body: a Chibi 2 body scaled ×1.25 with dark red skin, horns (new `demon_horns` hat part), bat wings
(new `extras` part — reuse the creature `bat` wing mesh from `avatar-3d/js/creatures.js`), glowing eyes
(`eyes: glow`, already in the Farhold look).

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Fury bar** | the resource slot | red-orange bar 0–100 |
| **Vengeance sigil** | a round gauge left of the Fury bar, 72 px | a horned sigil that fills from the bottom in dark crimson; tick marks at 30 (Reckoning) and 100 (Demon Form); at 100 the sigil burns and the `Q` key badge appears |
| **Fallen marker** | on the sigil | when a party member dies, their portrait flashes on the sigil with "+25" |
| **Form timer** | around the sigil in form | a ring that empties; each killing blow adds a notch (calling 3) |
| **Bar swap** | spell bar | swapped slots turn crimson with a wing icon; greyed slots show a lock |

### 2.6 Calling quests (ids proposed; page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_demon_hunter_calling_1` | **The Mark** — a dying Riftwatch hunter at Brightwater passes you his mark and his last target, an imp in `d01_hollow_barrow` | **Vengeance**, **Hunter's Oath**, **Lesser Demon Form** (8 s, 2 spells) |
| 20 | `q_demon_hunter_calling_2` | **Name the Beast** — learn the name of the demon inside you from a Sandsworn tomb-reader and fight it alone | **Full Demon Form** (15 s, 4 spells), the **Ravager / Bastion** choice, Tumbling Shot **2 charges** |
| 40 | `q_demon_hunter_calling_3` | **Unchained** — track a rift-lord across Frostmantle and let the demon finish it | **Unchained Form** (20 s + kills, all 6 spells, heal on entry) |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `demon_hunter_brand_bolt` | Brand Bolt | +12 Fury | — | instant | 40 m (25 daggers) | bolt | 130% weapon, Hunter's Brand |
| 2 | 4 | `demon_hunter_glaive_arc` | Glaive Arc | 25 Fury | 8 s | instant | 15 m out and back | line 2 m wide | 90% each pass, Bleed |
| 3 | 10 | `demon_hunter_tumbling_shot` | Tumbling Shot | 15 Fury | 10 s (1–2 charges) | instant | 8 m move | dash + 2 bolts | 2 × 80%, 0.4 s i-frames |
| 4 | 18 | `demon_hunter_hellsight` | Hellsight | 30 Fury | 45 s | instant | self (40 m sight) | self | +20% crit, immunities, reveal |
| 5 | 28 | `demon_hunter_chain_of_binding` | Chain of Binding | 20 Fury | 16 s | instant | 25 m | target + tether | taunt 6 s, pull 6 m, tether |
| 6 | 40 | `demon_hunter_reckoning` | Reckoning | all Vengeance (30+) | 45 s | 0.8 s | 30 m | line 2 m wide | 200% + 4.5% per Vengeance |

### 3.2 Spell details

#### `demon_hunter_brand_bolt` — Brand Bolt (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | **generates 12 Fury** · none (GCD) |
| Cast | instant, usable while moving |
| Range / shape | bolt 40 m (crossbow) or 25 m (thrown knife with daggers), 0.3 m radius, 45 m/s |
| Effect | **130% weapon damage** (physical) |
| Statuses | **Hunter's Brand**: the target takes **+5% damage from you**, stacks to 3, 10 s (spellfx `marked`, red) |
| Visuals | spellfx `projectile` element `physical` shape `arrow` with a crimson trail (`bleed` colour); knives use the Farhold thrown-dagger head |
| Sound | crossbow thunk `spell.physical.launch` + `status.marked.apply` on the 3rd stack |

#### `demon_hunter_glaive_arc` — Glaive Arc (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 25 Fury · 8 s |
| Cast | instant |
| Range / shape | a glaive flies **15 m** straight out and returns to you along the same line; **2 m wide** |
| Effect | **90% weapon damage** on the way out and again on the way back |
| Statuses | **Bleed 6 s** (20% weapon damage a second) |
| Mechanic | hitting **3+ enemies** refunds **10 Fury** |
| Visuals | spinning four-bladed glaive (new held-prop mesh `dh_glaive`, reuse spellfx `projectile` with a custom head), `bleed` impacts |
| Sound | a whirring blade loop `dh.glaive` + `spell.bleed.impact` |

#### `demon_hunter_tumbling_shot` — Tumbling Shot (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 15 Fury · 10 s; **1 charge** (2 after calling 2) |
| Cast | instant |
| Range / shape | a flip **8 m** in the direction held (backwards if none); fires **2 bolts** at the nearest enemy in 30 m during the flip |
| Effect | **80% weapon damage** each bolt; **0.4 s of i-frames** at the start of the flip |
| Visuals | a Chibi 2 backflip clip (new `flip_back`, reuse the dodge-roll root motion), two `projectile` physical bolts |
| Sound | cloth whoosh `travel.step.soft` + two `spell.physical.launch` |

#### `demon_hunter_hellsight` — Hellsight (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 30 Fury · 45 s |
| Cast | instant; **not** usable while stunned, but usable while feared, blinded or charmed (it breaks them) |
| Range / shape | self; reveals within **40 m** |
| Effect | **8 s**: +20% critical chance; **immune to Blind, Confuse, Fear and Charm**; reveals stealthed and invisible enemies within 40 m (to the whole party); Hunter's Oath rises to +30% |
| Bastion | also **25% less damage taken** |
| Statuses | new self-status `hellsight` (eyes glow, screen edge tinted crimson for the DH only) |
| Visuals | the Chibi 2 `glow` eyes brighten, a crimson `ring` pulse 40 m (axis ground, life 0.8), revealed enemies get a red outline |
| Sound | a low heartbeat thud + `status.marked.apply` |

#### `demon_hunter_chain_of_binding` — Chain of Binding (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Fury · 16 s |
| Cast | instant |
| Range / shape | one enemy in 25 m |
| Effect | **taunts** the target for **6 s** and **pulls it 6 m** toward you (not bosses or elites over 3 m tall). A **white tether** (page 11) links you for 8 s while you stay within **15 m**: the target takes **+10% from you** and deals **15% less damage to anyone but you** |
| Break | the tether snaps if you move more than 15 m apart |
| Visuals | spellfx `arc` chain: segs 14, width 0.07, colour `#c02020`, jitter 0.05 (a taut chain, not lightning); pull uses the Farhold knockback maths in reverse (reuse: `js/combat-feel.js`) |
| Sound | chain rattle `dh.chain` + `rope.creak` on the pull |

#### `demon_hunter_reckoning` — Reckoning (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | **all Vengeance** (needs 30+) · 45 s |
| Cast | 0.8 s; cannot be used in Demon Form |
| Range / shape | a piercing line **30 m long, 2 m wide** |
| Effect | **200% weapon damage + 4.5% per Vengeance point** (at 100: 650%) to everything on the line; Hunter's Brand stacks on each target are consumed for **+15% each** |
| Visuals | one bolt wreathed in the faces of the fallen: spellfx `breath` element `shadow` length 30 arc 0.08 recoloured crimson, plus `wisp` sprites; a white flash on each target |
| Sound | a charged crossbow crack `dh.reckoning` + a whispered chorus |

### 3.3 Rotation / how it plays

* **Solo:** Brand Bolt ×2–3 → Glaive Arc through the pack → Tumbling Shot when something reaches you.
  Vengeance builds from kills; at 100 go Demon Form for a whole pack, or hold for Reckoning on an elite.
* **Dungeon, Damage (Ravager):** keep Brand stacks on the boss, Glaive on adds, Chain to peel an add off
  the healer. Save Demon Form for the boss's last 30% (and the Vengeance from a party death — the class
  turns a bad moment into a comeback).
* **Dungeon, Tank (Bastion):** Chain the caster adds in, Hellsight for the big hit (25% reduction),
  Demon Form as the long defensive cooldown (+100% armour, +30% health for 15–20 s) with Dread Roar to
  pick up every add.
* **Raid:** as Damage, one Reckoning every 45 s at 30–60 Vengeance is steadier than waiting for 100; in
  a fight with deaths, Vengeance swells — go Form. As an off-tank, Chain + Bastion handles add duty.

### 3.4 Boss mechanics

| Mechanic | Demon Hunter answer |
|---|---|
| **Soak** | yes; Bastion is an excellent soaker (Hellsight 25% reduction, Form +30% health) |
| **Void / danger zones** | **Tumbling Shot** (8 m, i-frames 0.4 s, 2 charges); in form **Ashen Wings** flies 4 s **immune to ground effects** |
| **Mind effects** | **Hellsight** — immune to Blind, Confuse, Fear, Charm for 8 s; breaks them if already applied |
| **Stealthed adds** | Hellsight reveals them for the party |
| **Tank swap** | Chain of Binding taunts at 25 m |
| **Tether** | Chain *makes* a white tether (15 m) — do not confuse with the boss's; the HUD draws yours thinner and red-edged |
| **Interrupt** | talent `demon_hunter_brand_bolt_t2b` *Pinning Bolt* interrupts (12 s internal) |

---

## 4. Alternate spells — Demon Form bar

| Slot | Unlocked | id | Name | Cooldown | Effect |
|---|---|---|---|---|---|
| 1 | calling 1 | `demon_hunter_form_rend` | Rend | — | claws a **120° arc 3.5 m**: **180% weapon**, Bleed 5 s; +8 Fury |
| 2 | calling 2 | `demon_hunter_form_ashen_leap` | Ashen Leap | 8 s | leap to a point **15 m** away, slam a **6 m circle** for **200%**, knock non-elites up 1 s |
| 3 | calling 3 | `demon_hunter_form_wing_sweep` | Wing Sweep (Ravager) | 10 s | **360°, 5 m**: **150%**, knockback 4 m |
| 3 | calling 3 | `demon_hunter_form_iron_wings` | Iron Wings (Bastion) | 10 s | wings fold round you for **6 s**: **40% less damage**, reflect **20%** of melee damage |
| 4 | calling 1 | `demon_hunter_form_devour` | Devour | 12 s | bite one enemy **3 m**: **300%**, heal **10% max health**; a kill adds +2 s of form |
| 5 | calling 2 | `demon_hunter_form_dread_roar` | Dread Roar | 20 s | **taunts every enemy in 12 m** for 4 s (Bastion 6 s; attackers deal 15% less); non-elites are **feared 3 s** |
| 6 | calling 3 | `demon_hunter_form_ashen_wings` | Ashen Wings | 30 s | **fly for 4 s** at 12 m/s, **immune to ground effects** (void zones, danger zones on the floor, pools, waves along the ground) but not room-wide or air attacks; landing slam **120% in 4 m** |

Visuals: form spells use spellfx `fire` recoloured crimson/black (`#c02020` / `#2a0a0a`), `footfall` fire decals
while walking in form, `pillar` shadow on entry. Sound: a demonic roar on entry (`dh.form.enter`), heavier
footsteps (`fragment.crash.small`).

---

## 5. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open on learning a later spell). Demon Form spells have no
talents of their own; talents on the six spells may change them (noted).

### `demon_hunter_brand_bolt`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_brand_bolt_t1a` | Twin Bolts | fires **2 bolts** at 2 targets, 75% each, +8 Fury each |
| 1 | `demon_hunter_brand_bolt_t1b` | Heavy Quarrel | **+40%**, **pierces** 1 |
| 2 | `demon_hunter_brand_bolt_t2a` | Deep Brand | Hunter's Brand stacks to **5** |
| 2 | `demon_hunter_brand_bolt_t2b` | Pinning Bolt | **interrupts** a gold-bordered cast (12 s internal) |
| 3 | `demon_hunter_brand_bolt_t3a` | Brand of the Fallen | a branded enemy that dies gives **+5 Vengeance** |
| 3 | `demon_hunter_brand_bolt_t3b` | Ricochet Quarrel | bounces to **1 more** enemy in 10 m at 60% |
| 4 | `demon_hunter_brand_bolt_t4a` | Hellfire Bolts | in Demon Form, Rend's slot 1 is replaced by **Hellfire Bolt** (the bolt, fire, 220%) — a ranged form |
| 4 | `demon_hunter_brand_bolt_t4b` | Marked for Death | at 3+ Brand stacks, your **critical hits add +3 Vengeance** |

### `demon_hunter_glaive_arc`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_glaive_arc_t1a` | Boomerang Ring | the glaive **circles you** at 6 m for 2 s instead of flying out |
| 1 | `demon_hunter_glaive_arc_t1b` | Long Throw | **25 m** out and back |
| 2 | `demon_hunter_glaive_arc_t2a` | Hooked Blade | on the return, enemies are **pulled 3 m** toward you |
| 2 | `demon_hunter_glaive_arc_t2b` | Serrated | Bleed stacks to **3** |
| 3 | `demon_hunter_glaive_arc_t3a` | Twin Glaives | **two glaives** at ±20° |
| 3 | `demon_hunter_glaive_arc_t3b` | Catch | catching the glaive **resets** Tumbling Shot's cooldown |
| 4 | `demon_hunter_glaive_arc_t4a` | Hanging Blade | the glaive **stops at the far end for 2 s** spinning (4 m circle, 60% a hit every 0.5 s) |
| 4 | `demon_hunter_glaive_arc_t4b` | Fel Glaive | usable in Demon Form (slot 2 stays Glaive Arc instead of Ashen Leap), **+50%** in form |

### `demon_hunter_tumbling_shot`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_tumbling_shot_t1a` | Forward Roll | flips **toward** the target and fires point-blank (+30%) |
| 1 | `demon_hunter_tumbling_shot_t1b` | Long Leap | **14 m**, 1 bolt |
| 2 | `demon_hunter_tumbling_shot_t2a` | Caltrop Wake | leaves **caltrops** where you started (4 m, −50% move, 4 s) |
| 2 | `demon_hunter_tumbling_shot_t2b` | Smoke Flip | enemies lose track of you: **drops threat** by 30% (Ravager) |
| 3 | `demon_hunter_tumbling_shot_t3a` | Hunter's Rhythm | each bolt adds **+1 Brand stack** |
| 3 | `demon_hunter_tumbling_shot_t3b` | Evasion | i-frames **0.4 → 0.8 s** |
| 4 | `demon_hunter_tumbling_shot_t4a` | Winged Flip | in Demon Form the flip is a **wing-beat** (12 m, knockback 3 m at the start point) |
| 4 | `demon_hunter_tumbling_shot_t4b` | Third Charge | **3 charges** |

### `demon_hunter_hellsight`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_hellsight_t1a` | Shared Sight | the **party** in 20 m also gets the immunity to Blind and Fear (not Confuse/Charm) |
| 1 | `demon_hunter_hellsight_t1b` | Predator's Eye | lasts **12 s**, crit bonus +10% |
| 2 | `demon_hunter_hellsight_t2a` | Weak Point | the next hit on each enemy while it lasts **critically hits** |
| 2 | `demon_hunter_hellsight_t2b` | Hate Engine | while it lasts, Vengeance gains are **doubled** |
| 3 | `demon_hunter_hellsight_t3a` | Unmasking | revealed enemies take **+15% from the party** for 6 s |
| 3 | `demon_hunter_hellsight_t3b` | Warden's Stare | Bastion: enemies looking at you **deal 10% less** |
| 4 | `demon_hunter_hellsight_t4a` | Inner Demon | using it at 70+ Vengeance **enters Demon Form** at 70 |
| 4 | `demon_hunter_hellsight_t4b` | Foresight of the Hunted | while up, **danger zones** targeting you show **0.5 s earlier** (only on your screen) |

### `demon_hunter_chain_of_binding`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_chain_of_binding_t1a` | Chain Lash | the chain **hits up to 3** enemies in a 25 m line, taunts all |
| 1 | `demon_hunter_chain_of_binding_t1b` | Grappling Chain | aim at terrain or a large enemy to **pull yourself 20 m** instead (a mobility spell) |
| 2 | `demon_hunter_chain_of_binding_t2a` | Anchor | the tethered target is **rooted 2 s** on arrival |
| 2 | `demon_hunter_chain_of_binding_t2b` | Chain Leech | while tethered, **heal 1% max health a second** |
| 3 | `demon_hunter_chain_of_binding_t3a` | Rift Chain | tethered target's buffs are **stripped** one per 2 s |
| 3 | `demon_hunter_chain_of_binding_t3b` | Pair of Chains | **2 charges** |
| 4 | `demon_hunter_chain_of_binding_t4a` | Hell's Leash | in Demon Form, Dread Roar **chains** every enemy it taunts (all tethered 8 s) |
| 4 | `demon_hunter_chain_of_binding_t4b` | Snap | breaking the tether on purpose (moving past 15 m) **deals 200%** to the target |

### `demon_hunter_reckoning`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `demon_hunter_reckoning_t1a` | Spread Reckoning | a **40° cone 20 m** instead of a line |
| 1 | `demon_hunter_reckoning_t1b` | Partial Payment | spends only **up to 50 Vengeance**; cooldown 25 s |
| 2 | `demon_hunter_reckoning_t2a` | Remembered | each **party death this fight** adds **+30%** |
| 2 | `demon_hunter_reckoning_t2b` | Echoing Guilt | leaves a **crimson line** for 6 s: enemies on it take 25% a second |
| 3 | `demon_hunter_reckoning_t3a` | Absolution | heals the **party in 15 m** for 20% of damage dealt |
| 3 | `demon_hunter_reckoning_t3b` | Rekindled | killing an elite with it refunds **30 Vengeance** |
| 4 | `demon_hunter_reckoning_t4a` | Last Rite of the Hunt | usable **once in Demon Form**, ending it early for **+100%** |
| 4 | `demon_hunter_reckoning_t4b` | Endless Grudge | spends all but **20 Vengeance** |

---

## 6. Class sets

### `set_demon_hunter_riftwatch_leathers` — Riftwatch Leathers (level 38, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Glaive Arc **brands** every enemy it hits (1 stack) | `demon_hunter_glaive_arc` |
| 4 | Tumbling Shot's bolts **pierce** | `demon_hunter_tumbling_shot` |
| 6 | Vengeance from kills **doubled** | mechanic |

Drop: `d10_rimefang_caverns` and `d11_saltdeep_cathedral` bosses (Normal/Heroic).

### `set_demon_hunter_hellborne` — Hellborne Harness (level 60, raid, Ravager)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Demon Form lasts **+4 s** | Demon Form |
| 4 | Ashen Leap **resets** when Devour kills | `demon_hunter_form_ashen_leap`, `demon_hunter_form_devour` |
| 6 | leaving Demon Form **fires a free Reckoning** at 50 Vengeance worth | `demon_hunter_reckoning` |

Drop: `r05_veilspire` bosses (tokens), Normal/Mythic.

### `set_demon_hunter_chainwarden` — Mail of the Chainwarden (level 60, raid, Bastion)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Chain of Binding cooldown **16 → 10 s** | `demon_hunter_chain_of_binding` |
| 4 | while tethered, **you take 10% less** damage from the tethered enemy | `demon_hunter_chain_of_binding` |
| 6 | Iron Wings also **taunts** everything in 8 m and lasts 8 s | `demon_hunter_form_iron_wings` |

Drop: `r04_ember_court` bosses (tokens), Normal/Mythic.

---

## 7. Class legendaries and uniques

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_kael_sorrowends_debt` | **Kael Sorrowend's Debt** | amulet | *Owed Blood*: each **party death** fills Vengeance to **100** at once | secret boss of `r03_sunken_choir`, 8% |
| `leg_the_riftlords_horns` | **The Rift-Lord's Horns** | head | *Crowned Horror*: Demon Form can be entered at **70 Vengeance** and lasts **+6 s** | `riftmarch` world boss, 4% |
| `leg_glaive_of_the_long_night` | **Glaive of the Long Night** | off hand (dagger) | *Endless Orbit*: Glaive Arc **never returns**; it orbits you at 6 m for **8 s**, hitting every 0.5 s for 50% | final boss of `d13_cindergate` Mythic+ 10+, 2% |
| `leg_heartseeker_arbalest` | **Heartseeker Arbalest** | crossbow | *Heartshot*: Reckoning at 100 Vengeance **always crits** and **chains** to 2 more enemies at 60% | final boss of `r05_veilspire` Mythic, 6% |
| `leg_chains_of_the_warden_below` | **Chains of the Warden Below** | belt | *Twin Tether*: Chain of Binding tethers **2 targets**; each counts as taunted | `r04_ember_court` boss 3, 5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_imp_catchers_charm` | **Imp-Catcher's Charm** | ring | Hunter's Oath is **+35%** vs imps and small demonic enemies | `d01_hollow_barrow` final boss `b_hollow_thane`, 12% |
| `uq_scarred_crossbow` | **The Scarred Crossbow** | crossbow | Brand Bolt **+6 Fury** (18 total) | `d05_glass_tombs` final boss, 7% |
| `uq_mourning_scarf` | **Mourning Scarf** | shoulders | allies dropping under 20% give **+10 Vengeance** instead of 5 | `d08_moonwell_ruins` boss 2, 7% |
| `uq_ash_walker_boots` | **Ash-Walker Boots** | feet | Tumbling Shot **leaves no footprint**: void zones do not damage you for 1 s after landing | `emberthrone` rare elites, 3% |

---

## 8. Voice and barks

Voice: **new row `demon_hunter`** proposed for `shared/voices.js` — `pitch 0.36, depth 0.7, tone 0.42,
breath 0.3, rough 0.3, speed 0.52, jitter 0.08` (rough, low). In Demon Form the voice is pitched down
0.12 and `rough` +0.3 (reuse the voice-lab effects chain, `voice-lab/js/fx.js`). Lingo tag `class:demon_hunter`.

| When | Lines |
|---|---|
| Brand | "Marked." · "You're mine now." |
| Ally dies | "I'll carry you." · "Another name to answer for." |
| Demon Form | "Let it OUT." · "You wanted a monster? Here." |
| Reckoning | "For every one of them!" · "Reckoning!" |
| Crit | "Clean." |
| Low health | "Not yet — I'm not full yet!" · "Hold on, the thing in me's still hungry." |
| Demonic enemy spotted | "I can smell the Rift on that one." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `demon_hunter.look` (buzz cut, glowing eyes, strapped leather, scar, scarf) | default look |
| Wings | `avatar-3d/js/creatures.js` bat body plan wing mesh | Demon Form wings |
| Visual only | Farhold `aimed_shot`, `multi_shot`, `shadowstep`, `pinning_shot`, `execute` | bolt, tumbling, chain, reckoning timings |
| Combat feel | `prototypes/farhold/js/combat-feel.js` (knockback, hit-stop) | pull, sweep, leap |
| Dropped | Farhold `dire_companion` pet; Farhold DH kit (aimed_shot, shadowstep, multi_shot, curse, pinning_shot, execute) | the class's power is the form, not a pet |
