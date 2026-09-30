# Class: Pyromancer (`pyromancer`)

> *"Everyone warms their hands at a fire. I am the one who decides when it stops."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 15.
**Status:** v0.1 draft, 2026-09-29. Documentation only — nothing is built.

### How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | Spell power: the caster's damage base (page 05 owns the formula; in Farhold a non-physical hit is `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). "140% SP" = 1.4 × that base. |
| **WD** | Weapon damage — only the staff/wand basic attack uses it. |
| **Mana cost** | % of maximum mana. |
| **Heat** | the class gauge, 0–100 (§2). |
| **Burn** | Wildmarch's fire damage-over-time (reuse Farhold status `burn`); each spell names its own per-second value and length. Burns from the same pyromancer refresh, they do not stack, unless a talent says so. |
| **GCD** | 1.0 s global cooldown after any spell (proposed; page 05). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A fire-caster who runs hot on purpose. Every spell raises the pyromancer's own Heat; at the top the caster **overheats**, becomes briefly terrifying, then must **vent** it all in one blast. |
| Role | **Damage** (ranged, area-heavy) |
| Armour | Cloth |
| Weapons | Staff, wand, sceptre (+ orb/tome focus off-hand — reuse Farhold `js/foci.js`). Starter: **Charred Staff** (reuse base `staff`). |
| Primary attribute | INT |
| Resource | **Mana** + the **Heat** gauge |
| Companion | **Ember Familiar** from Calling II (reuse Farhold pet `ember_familiar`) |
| Playstyle | Build Heat with cheap spells, ride the Kindled and Searing bands for bonus damage, choose *when* to Overheat (big damage, self-burn) and *where* to Vent (a knock-back nova). Burns everywhere, then Backdraft cashes them in. |

---

## 2. Class mechanic: **Heat**

### 2.1 The gauge

Heat is **0–100**. Fire spells add Heat (each spell lists its amount). Heat falls **2 per second** if you
have not cast for 3 s in combat, and **10 per second** after 3 s out of combat.

| Band | Heat | Effect | Gauge colour |
|---|---|---|---|
| **Smoulder** | 0–39 | none | dull red |
| **Kindled** | 40–79 | +10% fire damage | orange |
| **Searing** | 80–99 | +20% fire damage, every bolt gains a 2 m splash at 50% | yellow-white |
| **Overheat** | 100 | lasts **8 s**: +30% fire damage, casts 25% faster, Heat locked at 100, **you Burn for 2% max health per second** (removed by Calling III). At the end you **Vent** automatically. | white, flickering |

**Vent** — a nova of **200% SP × (Heat / 100)** in a **6 m** circle around you, knocks enemies back
3 m (not bosses), sets Heat to 0 and gives **Banked Coals** for 4 s (spells cost 30% less mana and add
no Heat). From Calling I you may Vent by hand at any Heat with the class key.

### 2.2 UI

* A **vertical thermometer** at the right of the mana bar, 100 notches, with tick marks at 40 / 80 / 100
  and the band name printed beside it. At Overheat the whole bar flickers and the screen edges gain a
  2-pixel heat shimmer (setting `set.graphics.heat_shimmer`, default on — page 04).
* The pyromancer's Chibi 2 body shows the band: Kindled — ember motes rise from the hands; Searing —
  the hood's trim glows; Overheat — flames lick from the shoulders (`STATUS_FX.burn` aura on self).
  Others can read your Heat by looking at you.
* Sound: a low furnace hum that rises in pitch with Heat; a kettle-like whistle at 95+.

### 2.3 Class key (`Z`, proposed — page 02 owns keys)

* **`Z`** — **Vent** (from Calling I). 10 s cooldown, off GCD.
* **`Shift+Z`** — **Feed the Familiar** (from Calling II): moves up to **30 Heat** into the Ember
  Familiar (§2.5).

### 2.4 The calling quests (page 14 owns text; ids proposed)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_pyromancer_calling_kiln_oath` | **The Kiln Oath** | Hearthvale — the Brightwater potter's kiln; keep a fire burning through a rainstorm scene by casting on four braziers in turn | the **Kindled** and **Searing** bands (before this, Heat only leads to Overheat) and manual **Vent** on `Z` |
| 20 | `q_pyromancer_calling_ember_familiar` | **The Ember that Follows** | Sunscar — rescue a dying fire spirit from a glass tomb and carry it out before it gutters (a timed escort where your Heat keeps it alive) | the **Ember Familiar** and **Feed the Familiar** |
| 40 | `q_pyromancer_calling_heart_furnace` | **The Heart of the Furnace** | Frostmantle — walk into a glacier with no fire allowed, and survive by holding Overheat for 60 s total across the climb | Overheat no longer burns you; it gives a **4 m burning aura** (30% SP per second) instead · a **Vent at 100 Heat is a Supernova**: 12 m, 400% SP |

### 2.5 The Ember Familiar (reuse: Farhold `js/pets.js` pet `ember_familiar`)

* A floating flame body (`creature` type `elemental`, size 0.5, fire colours) that follows 3 m behind
  your shoulder. Does **not** count against follower slots (page 07) — it is the class mechanic.
* Attacks your target every **2 s** for **40% SP** fire. Cannot be targeted by enemies; boss room-wide
  effects snuff it for 10 s.
* **Feed the Familiar:** moving Heat into it makes it grow; on your next spell hit it dives at the target
  and **explodes for 4% SP per Heat fed** (120% SP at 30) in a 4 m circle, then reforms after 6 s.
  This is how a pyromancer "sheds" Heat without venting.

### 2.6 JSON shape

```json
{
  "id": "pyromancer",
  "heat": { "max": 100, "bands": { "kindled": 40, "searing": 80, "overheat": 100 },
            "decayInCombat": 2, "decayOutOfCombat": 10, "idleSeconds": 3,
            "overheat": { "seconds": 8, "damage": 0.3, "haste": 0.25, "selfBurnPct": 2 },
            "vent": { "radius": 6, "sp": 2.0, "knockback": 3, "cooldown": 10, "banked": { "seconds": 4, "costCut": 0.3 } } },
  "familiar": { "pet": "ember_familiar", "every": 2, "sp": 0.4, "feedMax": 30, "spPerHeat": 0.04 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Cost | CD | Cast | Range | Shape | Heat | Does |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `pyromancer_cinder_dart` | Cinder Dart | 2% | — | 1.2 s | 30 m | bolt | +8 | 140% SP + Burn 4 s |
| 4 | `pyromancer_kindling_ring` | Kindling Ring | 5% | 8 s | instant | self | 6 m ring | +12 | 90% SP, push, interrupt |
| 10 | `pyromancer_slagpool` | Slagpool | 7% | 12 s | instant | 30 m | ground 4 m, 8 s | +15 | 400% SP over 8 s, slow |
| 18 | `pyromancer_pyre_lance` | Pyre Lance | 6% | 6 s | charge 0.3–2 s | 40 m | line 1.5 m wide | +5 → +25 | 180 → 420% SP, pierces |
| 28 | `pyromancer_backdraft` | Backdraft | 8% | 20 s | instant | 25 m | every burning enemy | −20 | cashes in all Burns ×1.5 |
| 40 | `pyromancer_crown_of_suns` | Crown of Suns | 18% | 90 s | 2.0 s | 30 m | ground 8 m | +30 | 3 suns × 250% SP (5 in Overheat) |

### 3.2 Details

**`pyromancer_cinder_dart` — Cinder Dart** · slot 1 · 2% mana · no cooldown · 1.2 s cast · 30 m bolt · **+8 Heat**
* **140% SP** fire and **Burn 4 s at 15% SP per second** (60% SP).
* Looks: `projectile` fire (cone body, flame + ember trail), `impact` fire with a scorch mark.
  Sound: a match-strike on cast, a whump on hit.

**`pyromancer_kindling_ring` — Kindling Ring** · slot 4 · 5% mana · 8 s · instant · **6 m** ring around you · **+12 Heat**
* **90% SP** fire to everything within 6 m, pushes them **3 m** out (not elites/bosses).
* **Interrupts** the cast of every **non-boss** enemy hit (the pyromancer's only interrupt).
* Looks: `aoe` fire in a ring — a wall of flame 1 m high expanding from your feet over 0.3 s.
  Sound: a sharp *fwoomp*.

**`pyromancer_slagpool` — Slagpool** · slot 10 · 7% mana · 12 s · instant · ground within 30 m · **4 m** circle for **8 s** · **+15 Heat**
* **25% SP every 0.5 s** (400% SP over 8 s) to enemies standing in it; they are **Slowed 30%**.
* Burning enemies inside have their Burn refreshed every second.
* Looks: bubbling orange-black molten ground (`storm` fire at radius 4, cinders rising), a crust that
  cracks as it cools in the last second. Sound: slow lava bubbling loop.

**`pyromancer_pyre_lance` — Pyre Lance** · slot 18 · 6% mana · 6 s · **charge**: hold 0.3–2.0 s, release to fire · line **40 m × 1.5 m**, pierces everything
* Damage grows with charge: **180% SP** at 0.3 s → **420% SP** at 2.0 s (linear). Heat **+5 → +25**.
* A full charge also Burns everything hit for 5 s at 20% SP per second.
* Looks: a white-hot lance (`projectile` fire, `shape: 'cone'` stretched, speed 40, no arc); a charge
  glow grows in the staff tip (reuse Farhold `STAFF_CHARGE` meter). Sound: rising roar while held,
  a crack like a whip on release.

**`pyromancer_backdraft` — Backdraft** · slot 28 · 8% mana · 20 s · instant · every burning enemy within **25 m** · **−20 Heat**
* Each burning enemy instantly takes **its remaining Burn damage × 1.5** and the Burn ends; each explodes
  for **60% SP** in a 3 m circle.
* You regain **5% mana per enemy** detonated (max 20%).
* Looks: every Burn aura collapses inward, then bursts (`impact` fire, crit style). Sound: a sucking
  inhale then a string of pops.

**`pyromancer_crown_of_suns` — Crown of Suns** · slot 40 · 18% mana · 90 s · 2.0 s cast · ground within 30 m · **8 m** area · **+30 Heat**
* **Three suns** fall 0.6 s apart onto points inside the area (aimed at the most enemies), each
  **250% SP** in a 4 m circle. Leaves **slag** for 6 s over the area: 20% SP per second.
* **Cast during Overheat:** instant, and **five** suns.
* Looks: a ring of three small suns appears 15 m above the area (the "crown"), each drops as a
  `projectile` fire with `arc: 0` and `impact` fire at scale 2. Sound: rising choir-like hum,
  three deep impacts.

---

## 4. Alternate spells — the Overheat bar

While **Overheat** lasts (8 s), four spells change (the bar icons flip to white-hot versions):

| Normal | Overheat version | id | Change |
|---|---|---|---|
| Cinder Dart | **Solar Dart** | `pyromancer_solar_dart` | instant, 3 darts in a 20° fan, each 100% SP |
| Kindling Ring | **Wildfire Ring** | `pyromancer_wildfire_ring` | 10 m, 150% SP, leaves a burning ring 4 s |
| Slagpool | **Magma Surge** | `pyromancer_magma_surge` | the pool **travels** 12 m toward your aim over its duration |
| Pyre Lance | **Sunspear** | `pyromancer_sunspear` | always fully charged, instant |

Backdraft and Crown of Suns do not change (Crown gets its 5 suns instead).

---

## 5. Rotation / how it plays

### 5.1 Solo
Cinder Dart ×3 into a pack (Kindled), Slagpool at their feet, Kindling Ring as they reach you, Vent
when they are around you. Single elite: Pyre Lance at full charge, Darts to Searing, let Overheat come,
Solar Darts, Vent.

### 5.2 Dungeon
Packs: Slagpool → Darts on the pack → Backdraft once everything burns. Keep Kindling Ring for a
caster add you must interrupt. Your **Vent is a knock-back** — do not Vent into a tank's stacked pack
(talent `pyromancer_kindling_ring_t2a` "Inward Flame" pulls instead of pushes).

### 5.3 Raid
Plan **Overheat around mechanics**: Overheat costs 16% of your health over 8 s (until 40) — tell the
healers, or Overheat only in quiet phases. Crown of Suns during Overheat is the class's biggest burst.
Feeding the Familiar before a movement phase keeps Heat without casting.

### 5.4 Boss mechanics

| Mechanic | Pyromancer answer |
|---|---|
| **Danger zone** | Slagpool/Crown are placed, not channelled — you are free to move. Pyre Lance's charge **cancels** if you roll; a half charge still fires. |
| **Void zone** | Magma Surge can be steered away from a void zone. |
| **Soak** | Overheat self-burn + a soak can kill you before 40; Vent first. |
| **Adds** | Kindling Ring interrupts add casts; Backdraft wipes a burning add wave. |
| **Fire-resistant bosses** | Some bosses (page 13, especially `r04_ember_court`) resist fire 50%. Answers: `leg_coldflame_circlet`, and talent tier 4 "Blue Flame" on Cinder Dart. |
| **Line of sight** | Crown of Suns needs sight of the ground point; Backdraft does **not** (it follows the Burn). |

---

## 6. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Cinder Dart | 1 | **Twin Cinders** — two darts in a 10° fan, each 75% | **Ember Seeker** — the dart homes on its target | **Quick Match** — cast 1.2 → 0.8 s, damage −15% |
| Cinder Dart | 2 | **Spreading Flame** — when the Burn ends, it jumps to the nearest enemy within 6 m | **Hot Coal** — the dart leaves a 2 m burning patch 3 s | **Stoking** — +8 → +14 Heat per dart |
| Cinder Dart | 3 | **Kindled Chain** — in Kindled or hotter, the dart chains once (70%) | **Ember Stacks** — Burns from Cinder Dart stack up to 3 | — |
| Cinder Dart | 4 | **Blue Flame** — your darts ignore 50% of fire resistance | **Firefly** — every 5th dart becomes a slow orbiting ember that strikes the nearest enemy 4 times at 50% | — |
| Kindling Ring | 1 | **Wide Ring** — 6 → 9 m | **Flame Step** — you blink 6 m backwards as it goes off | — |
| Kindling Ring | 2 | **Inward Flame** — pulls enemies 3 m **in** instead of pushing | **Firewall** — leaves a 1 m flame wall on the ring's edge 4 s (enemies crossing take 60% SP) | **Silencing Heat** — interrupted enemies are Silenced 3 s |
| Kindling Ring | 3 | **Cooling Ring** — sets Heat −15 instead of +12 | **Double Ring** — a second ring 1 s later for 60% | — |
| Kindling Ring | 4 | **Halo** — the ring stays around you for 6 s, pulsing 40% SP each second | **Thrown Ring** — cast at a ground point within 25 m instead of on yourself | — |
| Slagpool | 1 | **Deep Slag** — lasts 8 → 12 s | **Wide Slag** — 4 → 6 m, damage −20% | — |
| Slagpool | 2 | **Sticky** — slow 30 → 60% | **Eruption** — when it ends, it erupts for 150% SP | **Slag Walk** — you gain +30% move while standing in your own slag |
| Slagpool | 3 | **Tar Pit** — a Kindling Ring cast into the pool sets it ablaze: damage ×2 for the rest of its time | **Twin Pools** — 2 charges | — |
| Slagpool | 4 | **Lava Tide** — the pool grows 0.5 m per second | **Obsidian** — when it ends it leaves a 1.5 m-high obsidian wall around its edge for 6 s (blocks enemy projectiles) | — |
| Pyre Lance | 1 | **Flash Lance** — max charge 2.0 → 1.2 s, top damage 420 → 340% | **Long Lance** — 40 → 60 m | — |
| Pyre Lance | 2 | **Splitting Lance** — on hitting the first enemy it splits into 3 lances in a 30° fan (each 50%) | **Molten Trail** — the line burns 4 s (25% SP/s) | — |
| Pyre Lance | 3 | **Walking Charge** — you can move at 60% speed while charging | **Overcharge** — holding past 2 s for 1 more second adds +30%, but costs 5% health | — |
| Pyre Lance | 4 | **Sunlance** — at full charge the line is 4 m wide | **Heatsink** — a full charge **removes** 20 Heat instead of adding 25 | — |
| Backdraft | 1 | **Hungry Back** — also consumes Slagpools, each exploding for 200% SP | **Short Fuse** — cooldown 20 → 12 s, multiplier ×1.5 → ×1.2 | — |
| Backdraft | 2 | **Chain Draft** — each explosion re-Burns enemies it hits (4 s) | **Draft Shield** — each enemy detonated gives you a 6% max health shield | — |
| Backdraft | 3 | **Reflux** — instead of ending the Burns, doubles their remaining time | **Heat Draw** — sets Heat **+20** instead of −20 | — |
| Backdraft | 4 | **Firestorm** — explosions are 3 → 6 m | **Phoenix Draft** — if 5+ enemies are detonated, the cooldown resets once | — |
| Crown of Suns | 1 | **Tighter Crown** — area 8 → 4 m, all suns on one point | **Scattered Crown** — area 8 → 16 m, 5 suns at 150% | — |
| Crown of Suns | 2 | **Cinder Crown** — each sun Burns 5 s at 25% SP/s | **Guiding Crown** — suns follow the enemy with the most health | — |
| Crown of Suns | 3 | **Solar Flare** — the first sun blinds non-boss enemies 3 s | **Crown of Coals** — the suns stay as 3 m burning rocks for 10 s | — |
| Crown of Suns | 4 | **Eclipse Crown** — one black sun at 900% SP | **Forever Noon** — casting it at 100 Heat extends Overheat by 4 s | — |

---

## 7. Class sets

Cloth pieces (head, chest, hands, legs, feet) + a staff, wand or focus.

### 7.1 `set_pyromancer_kilnwarden_robes` — Kilnwarden Robes (levelling, 19–24)

Drops from `d05_glass_tombs` (head, hands, wand `it_kilnwarden_wand`) and `d06_sandsworn_vault`
(chest, legs, feet); Heroic at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Cinder Dart in the Searing band always crits | Cinder Dart |
| 4 | Slagpool's first second counts as a Vent for the Familiar's feed (grants 10 Heat to the Familiar) | Slagpool, Familiar |
| 6 | Vent leaves a 6 m Slagpool at your feet | Vent (mechanic) |

### 7.2 `set_pyromancer_sunforged_raiment` — Sunforged Raiment (endgame)

Drops from `r05_veilspire` (level 60, 20 players), bosses 1–6.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Pyre Lance at full charge adds **+1 s** to Overheat when it hits | Pyre Lance |
| 4 | Backdraft counts each enemy detonated as **+5 Heat** (turning it into a Heat builder) | Backdraft |
| 6 | Overheat lasts 8 → 14 s; Crown of Suns during Overheat drops **7** suns | Overheat, Crown of Suns |

---

## 8. Legendaries and uniques

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_bellows_heart` | Bellows Heart | necklace | Vent sets Heat to **50** instead of 0, and Banked Coals lasts 4 → 8 s | final boss of `d04_bellows_keep` (Heroic/Mythic+) |
| `leg_coldflame_circlet` | Coldflame Circlet | head, cloth | Your fire turns blue: fire damage **ignores 50% fire resistance**, and against "fire-immune" enemies you deal 60% instead of 0 | `r04_ember_court` boss 3 |
| `leg_phoenix_quill` | Phoenix Quill | wand | Once per **180 s**, when you die, you rise after 2 s at **40% health** in Overheat; the rise is a 10 m Vent for 300% SP | Emberthrone world boss |
| `leg_kiln_of_the_first_forge` | Kiln of the First Forge | off-hand focus (orb) | The Ember Familiar holds up to **100 Heat**; while it holds 60+, it throws a Cinder Dart copy every 3 s | final boss of `d13_cindergate` (Heroic/Mythic+) |
| `leg_ashen_sun_staff` | Staff of the Ashen Sun | staff | Crown of Suns drops **one extra sun per 25 Heat** you have when you cast it (up to +4) | `r05_veilspire` secret boss |

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_tinderbox_wand` | Tinderbox | wand | +6 INT, +6% spell power | Wand bolts add **+3 Heat** | `d02_drowned_mill` final boss |
| `uq_smouldering_slippers` | Smouldering Slippers | feet, cloth | +6 INT, +8% move | Walking leaves a burning trail (reuse `ember_stride` footfalls) — 20% SP/s, 2 s — only while Kindled or hotter | `d05_glass_tombs` sub-boss |
| `uq_ember_censer` | The Ember Censer | off-hand focus (reuse `foci.js` `relic` model, Chibi 2 decor `ember_censer`) | +8 INT, +12 mana | Overheat's self-burn heals you instead for its first 4 s | Sunscar world boss |
| `uq_slagglass_bangle` | Slagglass Bangle | ring | +6 INT, +4% crit | Slagpool can be placed **under yourself** and you take no damage from it; enemies meleeing you take double | `d09_warmasters_pit` final boss |

---

## 9. Voice and barks

`voiceFor({ role: 'pyromancer', gender, seed })` (reuse `ROLE_VOICES.pyromancer`: pitch 0.52, tone 0.6,
speed 0.55). At Overheat, the voice gains a **rough +0.25** and a crackle effect (voice-lab `fx.js`,
reuse) — you can hear a pyromancer running hot.

| Moment | Lines (Lingo pool `pyromancer_*`) |
|---|---|
| Cast | "Burn." · "Catch." · "Warm enough?" |
| Crit | "Now it's a fire!" · "Ha! Ash!" |
| Overheat | "Too hot — **perfect**." · "Stand back!" |
| Vent | "Out! Everything out!" |
| Low health | "I'm guttering…" · "Someone mend me, I'm burning up!" |
| Crown of Suns | "Look up." |

---

## 10. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Fire visuals | `spellfx.js` `fire` projectile/impact/aoe/storm | every spell |
| Charge meter | Farhold `js/weapons.js` `STAFF_CHARGE`, `.charge-meter` | Pyre Lance |
| Falling suns | Farhold `meteor` ("Fallstone") timing | Crown of Suns |
| Burning trail | Farhold R25 `ember_stride` + `spellfx.footfall` | Smouldering Slippers |
| Familiar | Farhold `js/pets.js` `ember_familiar` (already the pyromancer's pet) | Calling II |
| Outfit | `class-outfits.json` `pyromancer` (hood, trim_robe, ember_censer) | as is |
| Emberveil ideas | `flame_lance` → Pyre Lance, `ignite` → Slagpool, `pyroclasm` → Backdraft, `meteor` → Crown of Suns | ideas only |
| Not used | Farhold pyromancer skills `firebolt`, `fire_wall`, `thunderclap`, `arcane_burst`, `quicken`, `meteor` | replaced |
| New | Heat gauge, Vent, Overheat alternate bar, screen heat shimmer | (new) |
