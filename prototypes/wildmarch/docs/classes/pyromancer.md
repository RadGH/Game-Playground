# Class: Pyromancer (`pyromancer`)

> *"Everyone warms their hands at a fire. I am the one who decides when it stops — and who it mends."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 15.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role
**Damage**, hybrid role **Healer**, build **caster**, **cloth** armour, resource **Momentum** (the class's
Momentum is called **Heat** — the game's only Momentum caster; no mana bar), mechanic **Heat — casting builds heat; high
heat empowers, venting releases it; cauterizing flames heal allies**, spell slots 1 / 4 / 10 / 18 / 28 / 40,
calling quests 6 / 20 / 40, talent tiers 12 / 22 / 32 / 45, cap 60.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | Spell power: the caster's damage and heal base (page 05 owns the formula; Farhold shape `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). "140% SP" = 1.4 × that base. |
| **WD** | Weapon damage — only the staff/wand basic attack uses it. |
| **Heat** | the class resource — **Momentum** under the pyromancer's own name. **0–100, starts empty** each fight. It **builds**: from builder spells (each lists its amount), **+1 per critical hit** you land (damage or heal, max 3 a second), and **+1 per 2% of max health you lose**. It is **spent** by the spender spells (each lists its cost). It **drains 3 a second** after 3 s in combat without casting, and **10 a second** after 3 s out of combat. **The pyromancer has no mana bar.** |
| **Bands** | how hot you are (§2.1). High Heat makes every fire spell stronger but costs you. |
| **Cautery** | the pyromancer's healing: a spell cast on an **ally** (or yourself) becomes its Cautery version (§2.3). |
| **Burning** | page 05 status `burn`; each spell names its own per-second value and length. Burns from the same pyromancer refresh; they do not stack unless a talent says so. |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** · **Auto-target** (no valid target → the valid enemy closest to your aim point in range) · **Self** · **Ally** (`F1`–`F5`) · **Ground**. |
| **Tags** | page 05 §Tags. Every pyromancer spell carries `tag_fire` and `tag_spell`; heals add `tag_heal`. |
| **GCD** | 1.0 s global cooldown (canon). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A fire-caster who runs hot on purpose. Every spell raises the pyromancer's own Heat; at the top the caster **overheats**, becomes briefly terrifying, then must **vent** it all in one blast. The same fire that burns an enemy can close a wound: a pyromancer **cauterizes** allies. |
| Primary role | **Damage** (ranged, area-heavy) |
| Hybrid role | **Healer** — the **Hearthkeeper** (§5): cauterizing fire that heals allies and burns out poisons and bleeds. An unexpected crossbreed on purpose (00 §6). |
| Build | caster |
| Armour | Cloth |
| Weapons | Staff, wand, sceptre (+ a focus off-hand — reuse Farhold `js/foci.js`). Starter: **Charred Staff** (reuse base `staff`). |
| Primary attribute | INT |
| Resource | **Momentum (Heat); no mana bar** |
| Companion | None. (Round 1's fire familiar is gone — no class summons a creature out of nothing, 00 §6.) |
| Playstyle | Build Heat with cheap builders, ride the Kindled and Searing bands for bonus power, spend Heat on the big spells, and choose *when* to Overheat (big power, self-burn) and *where* to Vent (a knock-back nova). Burns everywhere, then Backdraft cashes them in. Point the same spells at a friend and they heal. |

---

## 2. Class mechanic: **Heat**

### 2.1 The bands

| Band | Heat | Effect | Bar colour |
|---|---|---|---|
| **Smoulder** | 0–39 | none | dull red |
| **Kindled** | 40–79 | +10% fire damage **and** healing | orange |
| **Searing** | 80–99 | +20% fire damage and healing; every bolt gains a 2 m splash at 50% (a Cautery bolt splashes heal); **you take +10% damage** (running hot) | yellow-white |
| **Overheat** | 100 | lasts **8 s** (10 s from Calling II): +30% fire damage and healing, casts 25% faster, **spenders cost no Heat** (Heat is locked at 100), **you Burn for 2% of max health a second** (removed at Calling III). When it ends you **Vent** automatically. | white, flickering |

### 2.2 Vent (class key `Q`)

* **Vent** (Calling I, `Q`, 10 s cooldown, off GCD): a nova of **200% SP × (Heat / 100)** fire in a **6 m**
  circle around you; enemies are knocked back 3 m (not elites/bosses); Heat drops to **0**; you gain
  **Banked Coals** for 4 s (builders give ×1.5 Heat, so the next climb is quick).
* **Warm Vent** (Calling II): the same nova also **heals every ally in 8 m for 150% SP × (Heat / 100)**.
  In Hearthkeeper (§5) the knock-back is off so it never scatters a tank's pack.
* **Controlled Burn** (Calling II): **hold `Q` 0.5 s at 80+ Heat** to start Overheat on purpose.
* **Supernova** (Calling III): a Vent at 100 Heat is 12 m and **400% SP** (heals allies **250% SP** as a Warm Vent).

### 2.3 Cautery — how fire heals

The pyromancer's healing is not a second bar and not a stance. **The target decides:**

* A spell that takes a target (Cinder Dart, and its Overheat version) cast on a **friendly** target (`F1`
  yourself, `F2`–`F5`, or clicking an ally) becomes its **Cautery** version (§4.2) — a heal that also burns
  out **one** Bleeding, Poisoned, Venom, Hemorrhage or Burning status.
* Area and ground spells (Kindling Ring, Slagpool, Pyre Lance, Backdraft, Crown of Suns) **always** heal the
  allies they touch and damage the enemies — the numbers are in each spell.
* Heals **build Heat** exactly like damage does, and the bands boost heals like damage.
* The **Hearthkeeper** toggle (`G`, §5) trades damage for healing when you queue as a healer.

### 2.4 UI

* A **vertical thermometer** where other casters have a mana bar, 100 notches, with tick marks at 40 / 80 /
  100 and the band name beside it. At Overheat the whole bar flickers and the screen edges gain a 2-pixel
  heat shimmer (setting `set.graphics.heat_shimmer`, default on — page 04). In Hearthkeeper a small green
  hearth icon sits on top of the thermometer.
* The Chibi 2 body shows the band: Kindled — sparks rise from the hands; Searing — the hood's trim glows;
  Overheat — flames lick from the shoulders (`STATUS_FX.burn` aura on self). Others can read your Heat by
  looking at you.
* Sound: a low furnace hum that rises in pitch with Heat; a kettle-like whistle at 95+.

### 2.5 Class keys ([page 02](../02-CONTROLS.md) §5.16)

| Key | From | Does |
|---|---|---|
| `Q` tap | Calling I (6) | **Vent** |
| `Q` hold 0.5 s | Calling II (20) | **Controlled Burn** (80+ Heat → Overheat) |
| `G` | Calling I (6) | **Hearthkeeper** on / off (§5) — replaces round 1's "Feed the Familiar" |

### 2.6 The calling quests (page 14 owns text; ids per 00 §10)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_pyromancer_1` | **The Kiln Oath** | Hearthvale — the Brightwater potter's kiln; keep a fire burning through a rainstorm by casting on four braziers in turn, then close the wounds of three quarry workers the potter's kiln-master brings in (cast Cinder Dart on them) | the **Kindled** and **Searing** bands (before this, Heat only leads to Overheat), **Vent** on `Q`, **Hearthkeeper** on `G` |
| 20 | `q_calling_pyromancer_2` | **The Kept Flame** | Sunscar — a caravan's guards are poisoned in a canyon of glass tombs; keep them alive to the oasis with fire alone while the canyon's scorpions strike | **Warm Vent** and **Controlled Burn**; Overheat 8 → 10 s |
| 40 | `q_calling_pyromancer_3` | **The Heart of the Furnace** | Frostmantle — walk into a glacier where fire gutters, and survive by holding Overheat for 60 s total across the climb | Overheat no longer burns you; it gives a **4 m burning aura** (30% SP a second to enemies; in Hearthkeeper it also heals allies within 6 m for 20% SP a second) · **Supernova** |

### 2.7 JSON shape

```json
{
  "id": "pyromancer",
  "heat": { "max": 100, "start": 0, "perCrit": 1, "perPctHealthLost": 0.5,
            "bands": { "kindled": 40, "searing": 80, "overheat": 100 },
            "bandBonus": { "kindled": 0.10, "searing": 0.20, "overheat": 0.30 }, "searingTakenMore": 0.10,
            "drainInCombat": 3, "drainOutOfCombat": 10, "idleSeconds": 3,
            "overheat": { "secondsByCalling": [8, 10, 10], "haste": 0.25, "selfBurnPct": 2, "spendersFree": true },
            "vent": { "radius": 6, "sp": 2.0, "knockback": 3, "cooldown": 10,
                      "warmHealSp": 1.5, "warmRadius": 8, "banked": { "seconds": 4, "heatMult": 1.5 },
                      "supernova": { "radius": 12, "sp": 4.0, "healSp": 2.5 } } },
  "cautery": { "cleanse": ["bleed", "poison", "venom", "hemorrhage", "burn"], "count": 1 },
  "hearthkeeper": { "healingDone": 0.40, "damageDone": -0.30, "ventKnockback": false }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Heat | CD | Cast | Target | Shape | Tags | Does |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `pyromancer_cinder_dart` | Cinder Dart | builds 10 | — | 1.2 s | Auto-target (enemy) · Needs target (ally → Cautery) | 30 m bolt | `tag_fire` `tag_spell` `tag_projectile` `tag_duration` (+ `tag_heal` on an ally) | 140% SP + Burning; on an ally heals 150% SP |
| 2 | 4 | `pyromancer_kindling_ring` | Kindling Ring | builds 12 | 8 s | instant | Self | 6 m ring | `tag_fire` `tag_spell` `tag_area` `tag_heal` | 90% SP, push, interrupt; allies healed 60% SP |
| 3 | 10 | `pyromancer_slagpool` | Slagpool | builds 15 | 12 s | instant | Ground (30 m) | 4 m circle, 8 s | `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal` | 400% SP over 8 s + slow; allies healed 192% SP |
| 4 | 18 | `pyromancer_pyre_lance` | Pyre Lance | spends 20 → 40 | 6 s | charge 0.3–2 s | Auto-target | line 40 m × 1.5 m | `tag_fire` `tag_spell` `tag_projectile` `tag_heal` | 180 → 420% SP, pierces; allies in the line healed 100 → 240% SP |
| 5 | 28 | `pyromancer_backdraft` | Backdraft | spends 25 | 20 s | instant | Self | every burning enemy and every ally with a damage-over-time within 25 m | `tag_fire` `tag_spell` `tag_area` `tag_heal` | cashes in Burns ×1.5; burns out allies' DoTs and heals them |
| 6 | 40 | `pyromancer_crown_of_suns` | Crown of Suns | spends 50 (free in Overheat) | 90 s | 2.0 s (instant in Overheat) | Ground (30 m) | 8 m area | `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal` | 3 suns × 250% SP (5 in Overheat); suns heal allies 150% SP |

### 3.2 Details

**1. `pyromancer_cinder_dart` — Cinder Dart** · level 1 · **builds 10 Heat** · no cooldown (GCD) · 1.2 s cast · 30 m bolt
* Targeting: **Auto-target** on enemies. With a **friendly** hard target it is **Cauterizing Dart** (§4.2),
  which **Needs target**.
* **140% SP** fire and **Burning 4 s at 15% SP per second** (60% SP).
* Tags: `tag_fire` `tag_spell` `tag_projectile` `tag_duration`.
* Looks: `projectile` fire (cone body, flame + spark trail), `impact` fire with a scorch mark. Sound: a
  match-strike on cast, a whump on hit.

**2. `pyromancer_kindling_ring` — Kindling Ring** · level 4 · **builds 12 Heat** · 8 s · instant · **Self** · **6 m** ring around you
* **90% SP** fire to every enemy within 6 m, pushes them **3 m** out (not elites/bosses).
* **Interrupts** the cast of every **non-boss** enemy hit (the pyromancer's only interrupt).
* **Allies** within 6 m are healed **60% SP** (the warmth of the ring).
* Tags: `tag_fire` `tag_spell` `tag_area` `tag_heal`.
* Looks: `aoe` fire in a ring — a wall of flame 1 m high expanding from your feet over 0.3 s; allies it
  passes flash gold. Sound: a sharp *fwoomp*.

**3. `pyromancer_slagpool` — Slagpool** · level 10 · **builds 15 Heat** · 12 s · instant · **Ground** within 30 m · **4 m** circle for **8 s**
* Enemies inside: **25% SP every 0.5 s** (400% SP over 8 s) and **Slowed 30%**. Burning enemies inside have
  their Burning refreshed every second.
* **Allies** inside: healed **12% SP every 0.5 s** (192% SP over 8 s), and slows on them are removed while
  they stand in it.
* Tags: `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal`.
* Looks: bubbling orange-black molten ground (`storm` fire at radius 4, cinders rising) with a warm gold rim
  where allies stand; a crust cracks as it cools in the last second. Sound: slow lava bubbling loop.

**4. `pyromancer_pyre_lance` — Pyre Lance** · level 18 · **spends 20 Heat** (0.3 s charge) → **40 Heat** (full) · 6 s · **charge**: hold 0.3–2.0 s, release · **Auto-target** (aims the line at your target or the enemy nearest your aim point) · line **40 m × 1.5 m**, pierces everything
* Damage grows with charge: **180% SP** at 0.3 s → **420% SP** at 2.0 s (linear).
* A full charge also Burns every enemy hit for 5 s at 20% SP per second.
* **Allies** the lance passes through are healed **100% → 240% SP** (same charge scale) and lose one
  Bleeding/Poisoned status.
* Tags: `tag_fire` `tag_spell` `tag_projectile` `tag_heal`.
* Looks: a white-hot lance (`projectile` fire, `shape: 'cone'` stretched, speed 40, no arc); a charge glow
  grows in the staff tip (reuse Farhold `STAFF_CHARGE` meter). Sound: rising roar while held, a crack like a
  whip on release.

**5. `pyromancer_backdraft` — Backdraft** · level 28 · **spends 25 Heat** · 20 s · instant · **Self** · everything within **25 m**
* **Enemies:** each burning enemy takes **its remaining Burning damage × 1.5** at once and the Burn ends; each
  explodes for **60% SP** in a 3 m circle. **+3 Heat** back per enemy detonated (max 15).
* **Allies (cautery):** every ally with a damage-over-time on them (Bleeding, Poisoned, Venom, Burning,
  Hemorrhage, Rot, Withered) has it **burned out**, and is healed **150% of the damage it had left**.
* Does **not** need line of sight (it follows the Burn).
* Tags: `tag_fire` `tag_spell` `tag_area` `tag_heal`.
* Looks: every Burn aura collapses inward, then bursts (`impact` fire, crit style); on allies the DoT icon
  flares white and vanishes. Sound: a sucking inhale then a string of pops.

**6. `pyromancer_crown_of_suns` — Crown of Suns** · level 40 · **spends 50 Heat** · 90 s · 2.0 s cast · **Ground** within 30 m · **8 m** area
* **Three suns** fall 0.6 s apart onto points inside the area (aimed at the most enemies), each **250% SP**
  in a 4 m circle. Leaves **slag** for 6 s over the area: enemies take 20% SP a second, allies are healed
  **15% SP a second**.
* Each sun also heals every ally within its 4 m for **150% SP**.
* **Cast during Overheat:** instant, free, and **five** suns.
* Tags: `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal`.
* Looks: a ring of three small suns appears 15 m above the area (the "crown"), each drops as a `projectile`
  fire with `arc: 0` and `impact` fire at scale 2. Sound: rising choir-like hum, three deep impacts.

### 3.3 How it plays

* **Solo:** Cinder Dart ×3 into a pack (Kindled), Slagpool at their feet, Kindling Ring as they reach you,
  Vent when they are around you. Single elite: build with Darts to Searing, Pyre Lance at full charge, let
  Overheat come, Solar Darts, Vent. Between pulls, a Cinder Dart on yourself (`F1`) closes your own wounds.
* **Dungeon (Damage):** packs: Slagpool → Darts → Backdraft once everything burns (Backdraft also cleans the
  party's bleeds). Keep Kindling Ring for a caster add you must interrupt. Your **Vent is a knock-back** — do
  not Vent into a tank's stacked pack (talent Kindling Ring t2a **Inward Flame** pulls instead).
* **Challenge mode and Depth:** Heat starts at 0 every pull, so the first 6–8 s are weak — open with builders
  and time Overheat with the boss's damage window. Searing's +10% damage taken is real: drop out of it with a
  Vent before a room-wide hit.

### 3.4 Boss mechanics

| Mechanic | Pyromancer answer |
|---|---|
| **Danger zone** | Slagpool/Crown are placed, not channelled — you are free to move. Pyre Lance's charge **cancels** if you roll; a half charge still fires |
| **Void zone** | Magma Surge (Overheat) can be steered away from a void zone |
| **Soak** | Overheat self-burn + a soak can kill you before 40; Vent first |
| **Room-wide hit** | a Warm Vent (20+) right after it lands heals everyone within 8 m |
| **Damage-over-time on the party** | Backdraft burns out every DoT in 25 m and heals what was left of it |
| **Adds** | Kindling Ring interrupts add casts; Backdraft wipes a burning add wave |
| **Fire-resistant bosses** | some bosses (page 12, especially `d15_fire_court`) resist fire 50%. Answers: `leg_coldflame_circlet`, and Cinder Dart t4a **Blue Flame** |
| **Line of sight** | Crown of Suns needs sight of the ground point; Backdraft does **not** |

---

## 4. Alternate spells

### 4.1 The Overheat versions

While **Overheat** lasts, four spells change (the bar icons flip to white-hot versions):

| Normal | Overheat version | id | Target | Tags | Change |
|---|---|---|---|---|---|
| Cinder Dart | **Solar Dart** | `pyromancer_solar_dart` | Auto-target (enemy) · Needs target (ally) | `tag_fire` `tag_spell` `tag_projectile` (+ `tag_heal`) | instant, 3 darts in a 20° fan, each 100% SP; **on an ally** all three heal the target, 70% SP each, and cleanse one DoT |
| Kindling Ring | **Wildfire Ring** | `pyromancer_wildfire_ring` | Self | `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal` | 10 m, 150% SP, leaves a burning ring 4 s; allies inside healed 100% SP |
| Slagpool | **Magma Surge** | `pyromancer_magma_surge` | Ground | `tag_fire` `tag_spell` `tag_area` `tag_duration` `tag_heal` | the pool **travels** 12 m toward your aim over its duration |
| Pyre Lance | **Sunspear** | `pyromancer_sunspear` | Auto-target | `tag_fire` `tag_spell` `tag_projectile` `tag_heal` | always fully charged, instant, free |

Backdraft and Crown of Suns do not change (Crown gets its 5 suns and costs nothing).

### 4.2 The Cautery version (a friendly target)

| Normal | Cautery version | id | Target | Tags | Effect |
|---|---|---|---|---|---|
| Cinder Dart | **Cauterizing Dart** | `pyromancer_cauterizing_dart` | Needs target (ally or yourself) | `tag_fire` `tag_spell` `tag_projectile` `tag_heal` `tag_duration` | **builds 10 Heat** · 1.2 s cast · 30 m · heals **150% SP**, removes one Bleeding / Poisoned / Venom / Hemorrhage / Burning, then **Cauterized** 4 s: heals **10% SP a second** (40% SP). Looks: the dart flies gold-orange and seals the wound with a bright line (`heal()` + a short `impact` fire, no scorch). Sound: a hiss like a hot iron, then a soft chime. |

---

## 5. The hybrid role — Healer (the Hearthkeeper)

The pyromancer uses the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout), tied to
the **Hearthkeeper** toggle: setting Role focus to **Hybrid (Healer)** (from Calling I, level 6) turns
Hearthkeeper on whenever you leave combat and makes the Dungeon Finder queue you as **Healer**; **Primary (Damage)**
turns it off. `G` still flips Hearthkeeper mid-fight without changing your queued role.

### 5.1 Hearthkeeper (`G`, toggle)

| Rule | Value |
|---|---|
| Toggle | `G`, off the GCD, 1.5 s cooldown. Shown as a green hearth on the thermometer. |
| Healing | **+40% healing done** |
| Damage | **−30% damage done** |
| Vent | no knock-back (so it never scatters the tank's pack); Warm Vent from Calling II |
| Heat | unchanged: heals build Heat like damage, and the bands boost heals |
| Overheat (Calling III) | the 4 m burning aura also heals allies within 6 m for 20% SP a second |

### 5.2 The healing kit

| Piece | What it does for the party |
|---|---|
| Cauterizing Dart | the main single-target heal: 150% SP + 40% SP over 4 s, cleanses one DoT, builds 10 Heat; no cooldown |
| Kindling Ring | a small area heal (60% SP) on 8 s that also interrupts the casters and pushes melee off the healer |
| Slagpool | a heal zone: 192% SP over 8 s to allies standing in it; put it under the melee |
| Pyre Lance | a line heal through the stacked party: 100 → 240% SP, spends 20–40 Heat |
| Backdraft | the dispel: burns out every DoT on the party within 25 m and heals what was left ×1.5 |
| Warm Vent (20) | the emergency area heal: up to 150% SP in 8 m (250% as a Supernova at 40) — and resets Heat |
| Crown of Suns | the big cooldown: three to five suns that each heal 150% SP around them, plus the slag's 15% SP a second |
| Solar Dart (Overheat) | 3 × 70% SP instant on one ally — the tank-saver during Overheat |
| Talents that help | Cinder Dart t1a **Twin Cinders**, t3c **Branding Iron**; Kindling Ring t3c **Hearth Ring**; Slagpool t3c **Warm Springs**; Pyre Lance t2c **Lifeline**; Backdraft t2b **Draft Shield**; Crown of Suns t2c **Dawn Crown** |
| Gear | the same INT / spell power / crit gear; +healing affixes; a focus with `tag_heal` bonuses (page 08) |

### 5.3 How good it is

Design targets against the cleric (the primary healer) at level 60 (page 05 owns the final maths):

| | Cleric | Pyromancer (Hearthkeeper) |
|---|---:|---:|
| Sustained single-target healing per second (Heat in Kindled/Searing) | 100 | ≈ 85 |
| Burst in the 10 s of Overheat | 100 | ≈ 130 |
| First 6 s of a pull (Heat still low) | 100 | ≈ 60 |
| Dispels | 1 target, 8 s | every ally in 25 m, 20 s (Backdraft) |

**How good it is.** Very good in the **open world, Normal dungeons and Depth up to about 10**: trash packs
keep Heat high, Slagpool and Kindling Ring heal the party while hurting the pack, and Backdraft makes
poison-and-bleed dungeons easy. In **Challenge mode** it falls behind: every pull starts cold, Searing makes
the pyromancer itself take 10% more damage, and there is no single "save the tank now" cooldown outside
Overheat, so a Challenge party with a pyromancer healer should bring a second source of emergency healing.

---

## 6. Utility spells

None. The pyromancer uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45; a tier opens at the later of its level and the
spell's slot level. A talent that changes a spell changes its Cautery and Overheat versions the same way
unless it says otherwise.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Cinder Dart | 1 | **Twin Cinders** — two darts in a 10° fan, each 75%; on an ally, the second dart heals the lowest-health ally within 10 m of them | **Spark Seeker** — the dart homes on its target | **Quick Match** — cast 1.2 → 0.8 s, damage and healing −15% |
| Cinder Dart | 2 | **Spreading Flame** — when the Burn ends, it jumps to the nearest enemy within 6 m | **Hot Coal** — the dart leaves a 2 m burning patch 3 s | **Stoking** — +10 → +16 Heat per dart |
| Cinder Dart | 3 | **Kindled Chain** — in Kindled or hotter, the dart chains once (70%) | **Coal Stacks** — Burns from Cinder Dart stack up to 3 | **Branding Iron** — Cauterized heals 10 → 20% SP a second and the ally cannot gain Bleeding while it lasts |
| Cinder Dart | 4 | **Blue Flame** — your darts ignore 50% of fire resistance | **Firefly** — every 5th dart becomes a slow orbiting spark that strikes the nearest enemy (or heals the lowest ally, in Hearthkeeper) 4 times at 50% | — |
| Kindling Ring | 1 | **Wide Ring** — 6 → 9 m | **Flame Step** — you leap 6 m backwards as it goes off (`tag_movement` added) | — |
| Kindling Ring | 2 | **Inward Flame** — pulls enemies 3 m **in** instead of pushing | **Firewall** — leaves a 1 m flame wall on the ring's edge 4 s (enemies crossing take 60% SP) | **Silencing Heat** — interrupted enemies are Silenced 3 s |
| Kindling Ring | 3 | **Cooling Ring** — sets Heat −15 instead of +12 | **Double Ring** — a second ring 1 s later for 60% | **Hearth Ring** — allies inside are healed 60 → 140% SP; no push |
| Kindling Ring | 4 | **Halo** — the ring stays around you for 6 s, pulsing 40% SP each second (`tag_aura` `tag_duration` added) | **Thrown Ring** — cast at a ground point within 25 m instead of on yourself (Ground targeting) | — |
| Slagpool | 1 | **Deep Slag** — lasts 8 → 12 s | **Wide Slag** — 4 → 6 m, damage and healing −20% | — |
| Slagpool | 2 | **Sticky** — slow 30 → 60% | **Eruption** — when it ends, it erupts for 150% SP | **Slag Walk** — you gain +30% move while standing in your own slag |
| Slagpool | 3 | **Tar Pit** — a Kindling Ring cast into the pool sets it ablaze: damage ×2 for the rest of its time | **Twin Pools** — 2 charges | **Warm Springs** — each second, allies inside lose one Poisoned or Venom stack |
| Slagpool | 4 | **Lava Tide** — the pool grows 0.5 m a second | **Obsidian** — when it ends it leaves a 1.5 m-high obsidian wall around its edge for 6 s (blocks enemy projectiles) | — |
| Pyre Lance | 1 | **Flash Lance** — max charge 2.0 → 1.2 s, top damage 420 → 340% | **Long Lance** — 40 → 60 m | — |
| Pyre Lance | 2 | **Splitting Lance** — on hitting the first enemy it splits into 3 lances in a 30° fan (each 50%) | **Molten Trail** — the line burns 4 s (25% SP/s) | **Lifeline** — the lance stops at the **first ally** it reaches and heals them double (a single-target heal; Needs target when your target is an ally) |
| Pyre Lance | 3 | **Walking Charge** — you can move at 60% speed while charging | **Overcharge** — holding past 2 s for 1 more second adds +30%, but costs 5% health | — |
| Pyre Lance | 4 | **Sunlance** — at full charge the line is 4 m wide | **Heatsink** — a full charge spends 40 → 70 Heat and deals and heals +30% (a controlled way to dump Heat short of Overheat) | — |
| Backdraft | 1 | **Hungry Back** — also consumes Slagpools, each exploding for 200% SP | **Short Fuse** — cooldown 20 → 12 s, multiplier ×1.5 → ×1.2 | — |
| Backdraft | 2 | **Chain Draft** — each explosion re-Burns enemies it hits (4 s) | **Draft Shield** — each enemy detonated or ally cleansed gives that ally (or you) a shield of 6% max health (`tag_shield` added) | — |
| Backdraft | 3 | **Reflux** — instead of ending the Burns, doubles their remaining time | **Heat Draw** — costs nothing and gives **+20 Heat** instead of spending 25 | — |
| Backdraft | 4 | **Firestorm** — explosions are 3 → 6 m | **Phoenix Draft** — if 5+ enemies are detonated, the cooldown resets once | — |
| Crown of Suns | 1 | **Tighter Crown** — area 8 → 4 m, all suns on one point | **Scattered Crown** — area 8 → 16 m, 5 suns at 150% | — |
| Crown of Suns | 2 | **Cinder Crown** — each sun Burns 5 s at 25% SP/s | **Guiding Crown** — suns follow the enemy with the most health | **Dawn Crown** — the suns land on the three lowest-health allies in the area and heal them 250% SP (their damage around them is unchanged) |
| Crown of Suns | 3 | **Solar Flare** — the first sun Blinds non-boss enemies 3 s | **Crown of Coals** — the suns stay as 3 m burning rocks for 10 s | — |
| Crown of Suns | 4 | **Eclipse Crown** — one black sun at 900% SP | **Forever Noon** — casting it at 100 Heat extends Overheat by 4 s | — |

---

## 8. Class sets

Cloth pieces (head, chest, hands, legs, feet) + a staff, wand or focus.

### 8.1 `set_pyromancer_kilnwarden_robes` — Kilnwarden Robes (dungeon set, 19–24)

Drops from `d05_glass_tombs` bosses (head, hands, wand `it_kilnwarden_wand`) and `d06_sandsworn_vault` bosses
(chest, legs, feet) on **Normal** at the dungeon's level and on **Challenge** at item level 60; Depth runs can
drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Cinder Dart (and Cauterizing Dart) in the Searing band always crits | Cinder Dart |
| 4 | Slagpool heals allies 50% more, and its first second gives +10 Heat | Slagpool |
| 6 | Vent leaves a 6 m Slagpool at your feet | Vent (mechanic) |

### 8.2 `set_pyromancer_sunforged_raiment` — Sunforged Raiment (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).
*(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Pyre Lance at full charge adds **+1 s** to Overheat when it hits an enemy or heals an ally | Pyre Lance |
| 4 | Backdraft gives **+5 Heat** per enemy detonated or ally cleansed instead of +3 (no cap) | Backdraft |
| 6 | Overheat lasts 10 → 14 s; Crown of Suns during Overheat drops **7** suns | Overheat, Crown of Suns |

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_bellows_heart` | Bellows Heart | necklace | Vent sets Heat to **50** instead of 0, and Banked Coals lasts 4 → 8 s | `b_grumvak_kilnbreaker` Warchief Grumvak Kilnbreaker (`d04_bellows_keep` end boss) on Challenge, and its Depth end chest |
| `leg_coldflame_circlet` | Coldflame Circlet | head, cloth | Your fire turns blue: fire damage **ignores 50% fire resistance**, and against fire-immune enemies you deal 60% instead of 0 | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_phoenix_quill` | Phoenix Quill | wand | Once per **180 s**, when you die, you rise after 2 s at **40% health** in Overheat; the rise is a 10 m Vent for 300% SP that also heals allies in it for 200% SP | `b_slagborn` Slagborn (Kingsfire world boss) |
| `leg_kiln_of_the_first_forge` | Kiln of the First Forge | off-hand focus (orb) | **Overhealing becomes Heat:** every 2% of an ally's max health you overheal gives 1 Heat (max 10 a second), and while you are in Overheat your Cautery heals leave a 3 s Cauterized on every ally within 4 m of the target | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss) on Challenge |
| `leg_ashen_sun_staff` | Staff of the Ashen Sun | staff | Crown of Suns drops **one extra sun per 25 Heat** you have when you cast it (up to +4) | the end chest of any dungeon at **Depth 15+** (1.5%) |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_tinderbox_wand` | Tinderbox | wand | +6 INT, +6% spell power | Wand bolts (basic attacks) add **+3 Heat** | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss) |
| `uq_smouldering_slippers` | Smouldering Slippers | feet, cloth | +6 INT, +8% move | Walking leaves a burning trail (reuse Farhold `ember_stride` footfalls) — 20% SP/s, 2 s — only while Kindled or hotter | `b_saffa_knifewind` Saffa Knifewind (`d05_glass_tombs` sub-boss) |
| `uq_ash_censer` | The Ash Censer | off-hand focus (reuse `foci.js` `relic` model, Chibi 2 decor censer) | +8 INT, +6% healing | Overheat's self-burn heals you instead for its first 4 s | `b_glass_wyrm` The Glass Wyrm (Sunscar world boss) |
| `uq_slagglass_bangle` | Slagglass Bangle | ring | +6 INT, +4% crit | Slagpool can be placed **under yourself** and you take no damage from it; enemies meleeing you inside it take double | `b_warmaster_drogath` Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

### 9.3 Souls

Both need the wearer to be a **pyromancer**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_banked_furnace` | Soul of the Banked Furnace | armour — chest | class: pyromancer | In **Hearthkeeper**, an ally you heal while you are Searing or Overheated gains **Kiln Warmth** for 6 s: the next damage-over-time tick on them is cancelled and heals them for that amount instead (once per 6 s per ally). | `b_the_sand_sovereign` The Sand Sovereign (`d06_sandsworn_vault` end boss) on Challenge (3%); `b_glass_wyrm` world boss (2%) |
| `soul_last_cinder` | Soul of the Last Cinder | weapon | class: pyromancer | When Overheat ends, its automatic Vent leaves you at **40 Heat** instead of 0 and Banked Coals lasts 8 s. | `b_slagborn` world boss (2%); end chest at **Depth 15+** (1%) |

---

## 10. Voice and barks

`voiceFor({ role: 'pyromancer', gender, seed })` (reuse `ROLE_VOICES.pyromancer`: pitch 0.52, tone 0.6,
speed 0.55). At Overheat the voice gains **rough +0.25** and a crackle effect (voice-lab `fx.js`, reuse) — you
can hear a pyromancer running hot.

| Moment | Lines (Lingo pool `pyromancer_*`) |
|---|---|
| Cast | "Burn." · "Catch." · "Warm enough?" |
| Cauterizing Dart | "Hold still — this stings." · "Sealed." · "Better a scar than a grave." |
| Crit | "Now it's a fire!" · "Ha! Ash!" |
| Overheat | "Too hot — **perfect**." · "Stand back!" |
| Vent | "Out! Everything out!" |
| Warm Vent | "Everyone — close to the fire!" |
| Low health | "I'm guttering…" · "Someone mend me, I'm burning up!" |
| Crown of Suns | "Look up." |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Fire visuals | `spellfx.js` `fire` projectile/impact/aoe/storm; `heal()` recoloured gold-orange | every spell, the Cautery look |
| Charge meter | Farhold `js/weapons.js` `STAFF_CHARGE`, `.charge-meter` | Pyre Lance |
| Falling suns | Farhold `meteor` ("Fallstone") timing | Crown of Suns |
| Burning trail | Farhold R25 `ember_stride` + `spellfx.footfall` (Farhold ids, kept as file references) | Smouldering Slippers |
| Outfit | `class-outfits.json` `pyromancer` (hood, trim_robe, censer decor) | as is |
| Emberveil 2 prototype ideas | `flame_lance` → Pyre Lance, `ignite` → Slagpool, `pyroclasm` → Backdraft, `meteor` → Crown of Suns | ideas only |
| Not used | Farhold pyromancer skills `firebolt`, `fire_wall`, `thunderclap`, `arcane_burst`, `quicken`, `meteor`; Farhold pet `ember_familiar` (round 1 used it; the fire familiar is removed) | replaced |
| New | Heat as a Momentum bar (no mana), bands that boost heals, Vent / Warm Vent / Supernova, Overheat alternate bar, Cautery (friendly-target version of a spell), Hearthkeeper toggle, screen heat shimmer | (new) |
