# Class: Druid (`druid`)

> *"The grove taught me four shapes. Every one of them knows the same six things — in its own way."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 17.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6, §12.1 W30):
primary role **Healer**, hybrid roles **Tank** and **Damage**, build **caster / melee**, **medium** armour,
resource **Mana**, mechanic **Shapeshift — Bear, Wolf and Heron forms transform each of the six spells into a
different spell (one bar, four versions)**, utility **Heron's Flight**, spell slots 1 / 4 / 10 / 18 / 28 / 40,
calling quests 6 / 20 / 40, talent tiers 12 / 22 / 32 / 45, cap 60.

**Round 2 redesign (W30).** Round 1's druid had five shapes (caster, Bear, Cat, Owl, Stag), each with its own
separate spell bar and its own resource. That is gone. The druid now has **one bar of six spells**; each form
**turns every spell into a different spell** — 6 slots × 4 versions = **24 spells**. All borrowed names (and
the Cat, Owl and Stag forms) are removed; see the change list in the round-2 report.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the main-hand weapon, before armour. In Bear and Wolf form WD becomes **claw damage** (§2.4). |
| **SP** | Spell power: the caster's damage and heal base (page 05 owns the formula; Farhold shape `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). "120% SP" = 1.2 × that base. |
| **Mana** | the class resource in **every** form (canon). Costs are **% of maximum mana**. Bear and Wolf also **earn** mana back (§2.3). There is no second resource and nothing to build up and spend besides mana. |
| **Slot** | one of the six keys `1`–`6`. A slot holds four versions of a spell, one per form. |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** · **Auto-target** (no valid target → the valid enemy closest to your aim point in range) · **Self** · **Ally** (`F1` yourself, `F2`–`F5`) · **Ground**. Heals **need** a friendly target. |
| **Tags** | page 05 §Tags. Nature spells carry `tag_nature` `tag_spell`; claw attacks carry `tag_physical` `tag_attack` `tag_melee`. |
| **GCD** | 1.0 s global cooldown (canon). |

All spell visuals use `avatar-3d/js/spellfx.js` (reuse): elements fire, ice, shadow, holy, **nature**, arcane,
lightning, physical, poison, bleed, true; methods `projectile`, `impact`, `aoe`, `cast`, `heal`, `revive`,
`breath`, `orbitOrb`, `pillar`, `vortex`, `storm`, `footfall`.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A keeper of the old groves who has learned to wear three animal bodies — the grey **Heron** of the still water, the **Bear** of the high caves, the **Wolf** of the snow. The druid's six gifts stay the same six; each body speaks them differently. |
| Primary role | **Healer** — Grove form and, above all, **Heron** form |
| Hybrid roles | **Tank** (Bear, from 20) and **Damage** (Grove caster until 40, then **Wolf** melee) — §5 |
| Build | caster (Grove, Heron) / melee (Bear, Wolf) |
| Armour | Medium (reuse: Farhold `armorTier: "medium"`) |
| Weapons | Staff, quarterstaff, sceptre (+ a focus in the off hand with a sceptre). Starter: **Hearthwood Quarterstaff** (reuse base `quarterstaff`). |
| Primary attribute | INT. In Bear and Wolf, INT also counts as STR for claw damage (§2.4), so one set of gear works in every shape. |
| Resource | **Mana** |
| Companion | None. The forms are the companion. |
| Playstyle | Heal from the water as a Heron, drop into Bear the moment the tank dies, run an add down as the Wolf, and stand in your own body to root and seed. Because a slot's cooldown is **shared by all four of its versions**, every shift is a choice: using the Bear's Stonepelt means the Heron's Still Water is on cooldown too. |

---

## 2. Class mechanic: **Shapeshift**

### 2.1 The four forms

| Form | Key | Unlocks | Role | Body |
|---|---|---|---|---|
| **Grove** (the druid's own body) | `Q` tap (or the key of the form you are in) | level 1 | nature caster: light heals, roots, thorns | Chibi 2 |
| **Heron** | `Shift+1` | Calling I (6) | healer | a grey heron, 1.6 m tall |
| **Bear** | `Shift+2` | Calling II (20) | tank | a brown bear, 1.8 m long |
| **Wolf** | `Shift+3` | Calling III (40) | melee damage | a grey wolf, 1.5 m long |

`Q` **held** opens the **Form Ring** (a radial menu; release over a wedge to shift). `Shift+4` does nothing for
the druid. (Page 02 §5.16 must change the druid row from Bear/Cat/Owl/Stag to **1 Heron · 2 Bear · 3 Wolf**.)

### 2.2 How shifting works

| Rule | Value |
|---|---|
| Cost | **3% mana** into an animal form. Returning to Grove is free. |
| Cooldown | shares the **GCD**. Calling III (40) takes shifting off the GCD. |
| Cast | Instant. Plays a 0.35 s swap (§2.6); you can move during it. |
| Blocked when | stunned, silenced, feared, dead, mounted, carrying an event object, or inside a boss mechanic page 11 marks "no shapes". |
| Sheds | from Calling II, entering an animal form removes **roots and slows**. Stuns are never removed. |
| **The bar** | the six keys stay the six keys. On shift, each slot's icon turns into that form's version (§3.1). |
| **Shared cooldowns** | **each slot has one cooldown**, shared by its four versions. Casting the Bear's slot-4 spell starts slot 4's cooldown in every form, at the **length of the version you cast**. Shifting never resets or skips a cooldown. |
| Unlock of a version | a version is on the bar when **both** its slot level (1/4/10/18/28/40) **and** its form are unlocked. An empty version shows its lock level. |
| Carries over | health **as a percentage**, mana, every buff, heal-over-time, debuff and damage-over-time on you, threat on every enemy, your hard target. |
| Dying in a form | you die as the animal (creature `dead` clip); on revive or release you return as Grove. |
| Mounting | refused in any animal form ("Leave your shape first"). |

### 2.3 Form stats

| Form | Stats | Mana | Basic attack |
|---|---|---|---|
| **Grove** | none | normal regeneration | the staff's own attack (Farhold quarterstaff pattern) |
| **Heron** | **+20% healing done**, −15% damage done, takes **+10% physical damage**; wades shallow water (up to 1 m) at full speed | **+25% mana regeneration** | **Water Flick**: a 25 m bolt every 1.2 s for 40% SP nature (`tag_nature` `tag_spell` `tag_projectile` `tag_basic_attack`) |
| **Bear** | **+40% max health**, gear armour **×2.5**, **Guardian** state (threat ×4, page 05 §13.2) | regains **0.5% mana per 1% of max health lost** | paw strike 3.0 m, 90° arc, 100% claw damage, every **1.1 s** (`tag_physical` `tag_attack` `tag_melee` `tag_basic_attack`) |
| **Wolf** | **+15% move speed**; hits from **behind** (the target's rear 180°) **+20%** | regains **0.6% mana per basic-attack hit** | bite 2.4 m, one target, 100% claw damage, every **0.7 s** (`tag_physical` `tag_attack` `tag_melee` `tag_basic_attack`) |

### 2.4 Claws and gear (Bear and Wolf)

| Gear rule | Value |
|---|---|
| **Claw damage** | your main-hand weapon's **damage per second × the form's attack interval** (Bear 1.1 s, Wolf 0.7 s). A slow staff and a fast sceptre with the same damage per second give the same claws. |
| Attributes | INT counts as STR for claw damage. DEX, CON and STR still count normally. |
| Affixes | every affix keeps working (crit, crit damage, life steal on physical hits, attack speed, elemental damage added to claws as that element). Staff-only weapon **traits** (Farhold `WEAPON_TRAITS.quarterstaff.guard`, charged staff forms) do not apply in a form. |
| Spell power | Bear and Wolf ignore SP except where a spell says "SP". |
| Weapon look | hidden. A weapon's element (a fire staff) tints the claw trail that element. |
| Uniques | a unique weapon's power works in form if it says "on hit" or "on kill"; powers that name a staff spell, a wand bolt or a charged attack do not. The tooltip says **"Works in forms"** or **"Grove form only"** under the power (page 08 must add this line). |

### 2.5 UI (`scr_hud`, page 03 owns the layout)

* **Form crest** — a round badge left of the spell bar with the current shape's silhouette (leaf / heron /
  bear paw / wolf head). It pulses green for 0.5 s after a shift and shows a grey sweep while the GCD runs.
* **The bar** — on shift each icon flips over (0.2 s) to the new version. A **slot cooldown** sweep is drawn on
  the slot, not the icon, so it stays in place through the flip.
* **Form peek** — while the Form Ring is open (`Q` held), the bar previews the form under the pointer: every
  icon shows that form's version and its lock level, so you can check what a shift will give you before you
  make it. Hovering a slot's tooltip always lists all four versions (setting `set.interface.druid_form_peek`,
  default on — page 04).
* **Party frames** show every druid's shape as a tiny icon, so the group can see "our healer is a bear now".

### 2.6 How the body is swapped (reuse: `avatar-3d/js/creatures.js`)

1. At login, and whenever a new form unlocks, the client **pre-builds** every unlocked form with
   `createCreature(spec)` and keeps them hidden (building a creature compiles new shaders; doing it on the
   first shift in a fight would stutter — the playground's known three.js shader-recompile stall).
2. On shift: `spellfx.impact({ element: 'nature' })` at the chest + a ring of leaf sprites; at 0.15 s the
   Chibi 2 actor's `group.visible = false` and the creature's `group.visible = true` at the same position and
   yaw; nameplate, target ring and status auras (`STATUS_FX`) re-parent to the creature. The weapon is hidden
   with the Chibi 2 body.
3. Leaving: the reverse, with the creature playing a 0.15 s shrink.
4. **The hitbox never changes.** Every form keeps the druid's own collision capsule (0.4 m radius, 1.8 m tall),
   so a big bear is not easier to hit with a telegraph. Only the drawing changes.

| Form | `creature.type` (reuse: `creature-types.js`) | `size` | Plan | Clips used | New clips needed |
|---|---|---|---|---|---|
| Heron | `owl` with long-legged parameters (the same retune the `it_mount_still_water_heron` mount uses, page 13) — grey `#8a929a`, white neck, black crest | 2.0 | bat | idle, walk, attack, dead | `wade` (slow high-stepping walk), `dip` (beak into the water, 0.5 s), `wingspread` (0.6 s) |
| Bear | `bear` (claws) | 1.5 (≈1.8 m long) | quad | idle, walk, run, attack, talk (roar), dead | `rear_roar` (stands on hind legs, 0.8 s), `curl` (Deep Den) |
| Wolf | `wolf` (fangs) | 1.6 (≈1.5 m long) | quad | idle, walk, run, attack, dead | `pounce` (0.5 s leap), `circle` (a tight run around a target) |

**Colours come from the druid**, so every player's animals are their own: `body` = the druid's hair colour
darkened 35%, `belly` = hair colour lightened 20%, `accent` = the outfit's main colour, `eyes` = the druid's eye
colour, `seed` = a hash of the character id (the Heron keeps its grey body and takes `accent` on its crest).
Dyes on the chest piece tint `accent`. **Legendary and set looks** override these (e.g. Pelt of the First
Winter makes the bear white).

### 2.7 The calling quests (page 14 owns quest text and ids)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_druid_1` | **The Still Water** | Hearthvale — the flooded water-meadow below Brightwater; heal five hurt animals caught by the spring flood while a grey heron watches, then follow it upstream to the Old Oak | **Heron** form (`Shift+1`) and the Form Ring |
| 20 | `q_calling_druid_2` | **The Second Hide** | Greyridge Highlands — a cave bear is trapped under the quarry by a Sootwick rockfall; hold the tunnel against three waves of diggers while it claws its way out | **Bear** form (`Shift+2`); shifting sheds **roots and slows** |
| 40 | `q_calling_druid_3` | **The Last Hide** | Frostmantle — run with a white wolf pack across the glacier and bring down a rime elk with them (a 3-minute chase with crevasses as danger zones) | **Wolf** form (`Shift+3`); shifting leaves the GCD; **Wild Heart** (§2.8) |

Every calling is announced with the unlock card, a sound and an Unlocks-screen entry (page 00 §11 rule 5).

### 2.8 Wild Heart (Calling III)

For **6 s after entering any animal form**: +15% damage and healing done, and the first spell cast in that
form costs no mana. The crest glows gold. It rewards shifting *into the right form for the moment*.

### 2.9 JSON shape (page 16 owns the file; this is the class's slice)

```json
{
  "id": "druid",
  "forms": {
    "grove": { "key": null, "unlock": null },
    "heron": { "key": "form1", "creature": { "type": "owl", "size": 2.0, "legs": "long" }, "unlock": "q_calling_druid_1",
               "stats": { "healingPct": 20, "damagePct": -15, "physTakenPct": 10, "manaRegenPct": 25 } },
    "bear":  { "key": "form2", "creature": { "type": "bear", "size": 1.5 }, "unlock": "q_calling_druid_2",
               "stats": { "maxHpPct": 40, "armourMult": 2.5, "guardian": true, "attackEvery": 1.1, "manaPerPctLost": 0.5 } },
    "wolf":  { "key": "form3", "creature": { "type": "wolf", "size": 1.6 }, "unlock": "q_calling_druid_3",
               "stats": { "movePct": 15, "behindPct": 20, "attackEvery": 0.7, "manaPerHit": 0.6 } }
  },
  "shift": { "manaPct": 3, "gcdUntil": "q_calling_druid_3", "sheds": ["root", "slow"], "shedFrom": "q_calling_druid_2" },
  "slots": [
    { "slot": 1, "level": 1,  "grove": "druid_seedbloom",       "heron": "druid_heron_stillwater_touch", "bear": "druid_bear_heavy_paw",        "wolf": "druid_wolf_snapping_bite" },
    { "slot": 2, "level": 4,  "grove": "druid_bramblegrip",     "heron": "druid_heron_reedbed",          "bear": "druid_bear_rending_sweep",    "wolf": "druid_wolf_leaping_snap" },
    { "slot": 3, "level": 10, "grove": "druid_greenswell",      "heron": "druid_heron_wingwash",         "bear": "druid_bear_earthshake_roar",  "wolf": "druid_wolf_howl_of_the_hunt" },
    { "slot": 4, "level": 18, "grove": "druid_heartwood_ward",  "heron": "druid_heron_still_water",      "bear": "druid_bear_stonepelt",        "wolf": "druid_wolf_slip_the_snare" },
    { "slot": 5, "level": 28, "grove": "druid_elder_circle",    "heron": "druid_heron_mirror_pool",      "bear": "druid_bear_deep_den",         "wolf": "druid_wolf_circling_frenzy" },
    { "slot": 6, "level": 40, "grove": "druid_everbloom",       "heron": "druid_heron_springflood",      "bear": "druid_bear_old_bear_wakes",   "wolf": "druid_wolf_killing_bite" }
  ],
  "sharedSlotCooldown": true,
  "wildHeart": { "seconds": 6, "bonusPct": 15, "firstSpellFree": true }
}
```

---

## 3. The six spells

### 3.1 The grid — every slot in every form

| Slot (level) | Grove | Heron (6) | Bear (20) | Wolf (40) |
|---|---|---|---|---|
| **1** (1) — the steady spell | **Seedbloom**: seed that heals an ally or bursts on an enemy | **Stillwater Touch**: big direct heal | **Heavy Paw**: threat strike | **Snapping Bite**: two bites, stacking Torn |
| **2** (4) — control | **Bramblegrip**: ground root | **Reedbed**: healing ground that slows enemies | **Rending Sweep**: 180° bleed sweep | **Leaping Snap**: 12 m leap, Dazes |
| **3** (10) — the group spell | **Greenswell**: wave that heals allies, pushes enemies | **Wingwash**: cone heal + poison cleanse | **Earthshake Roar**: area taunt + Weakened | **Howl of the Hunt**: party damage buff, marks the prey |
| **4** (18) — protection | **Heartwood Ward**: armour + damage-to-healing on an ally | **Still Water**: absorb bubble on an ally | **Stonepelt**: −40% damage taken | **Slip the Snare**: break roots, dodge, sprint |
| **5** (28) — the big area | **Circle of the Elder Grove**: heal ring where shifting is free | **Mirror Pool**: heal pool that catches falling allies | **Deep Den**: channelled self-heal | **Circling Frenzy**: six strikes around the prey |
| **6** (40) — the capstone | **Everbloom**: party heal; each shift pulses | **Springflood**: channelled party flood-heal | **The Old Bear Wakes**: +30% health, unshakable | **Killing Bite**: execute that eats Torn |

### 3.2 Grove versions (the druid's own body)

| Slot | id | Name | Cost | CD | Cast | Target | Range / shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `druid_seedbloom` | Seedbloom | 3% | — | 1.2 s | Needs target (ally **or** enemy) | 40 m, one target | `tag_nature` `tag_spell` `tag_duration` (+ `tag_heal` on an ally, + `tag_area` for the burst) | ally: heal 150% SP over 12 s, then bloom 120% SP · enemy: 120% SP over 12 s, then burst 100% SP in 4 m |
| 2 | `druid_bramblegrip` | Bramblegrip | 5% | 15 s | instant | Ground | 30 m, 5 m circle | `tag_nature` `tag_spell` `tag_area` `tag_duration` | 80% SP + Rooted 3 s |
| 3 | `druid_greenswell` | Greenswell | 6% | 12 s | 1.5 s | Self (a wave the way you face) | 20 m × 5 m wave, 10 m/s | `tag_nature` `tag_spell` `tag_area` `tag_heal` | allies healed 220% SP; enemies 60% SP + pushed 2 m |
| 4 | `druid_heartwood_ward` | Heartwood Ward | 4% | 30 s | instant | Needs target (ally) | 40 m | `tag_nature` `tag_spell` `tag_heal` `tag_duration` | 8 s: armour +50%, 30% of damage taken healed back over 6 s |
| 5 | `druid_elder_circle` | Circle of the Elder Grove | 8% | 45 s | 2.0 s | Ground | 30 m, 8 m circle, 12 s | `tag_nature` `tag_spell` `tag_area` `tag_duration` `tag_heal` | allies healed 30% SP a second; shifting inside is free; enemies entering Rooted 2 s |
| 6 | `druid_everbloom` | Everbloom | 12% | 150 s | instant | Self | every ally within 30 m, 8 s | `tag_nature` `tag_spell` `tag_area` `tag_heal` `tag_duration` | 150% SP at once + 60% SP a second; each shift fires a Wild Pulse |

**1. Seedbloom** — **On an ally (or yourself):** plants a glowing seed that heals **25% SP every 2 s for 12 s**
(150% SP), then **blooms** for **120% SP**. One Seedbloom per ally per druid; recasting blooms the old seed early
at 50% and plants a new one. **On an enemy:** a **thorn seed** — **20% SP nature every 2 s for 12 s** (120% SP),
then bursts for **100% SP in a 4 m circle**; if the target dies with it on, the seed jumps to the nearest enemy
within 8 m with its remaining time. Statuses: ally `regen` aura; enemy `thornseed` (new, nature damage).
Looks: `projectile` nature (spiral + leaf trail), a sprout on the target's head that grows over 12 s; bloom =
`heal()` + a pink petal burst; burst = `impact` nature, 4 m. Sound: a soft wooden *tock*; a two-note chime on
bloom; a dry crack on the thorn burst.

**2. Bramblegrip** — **80% SP** nature to every enemy inside, then **Rooted 3 s** (elites 1.5 s; bosses are
**Chilled** instead — page 05 slow, 4 s). A root breaks early once the rooted enemy has taken damage equal to
150% SP. Looks: `aoe` nature — brambles burst from the ground and curl around each ankle (`STATUS_FX.root`).
Sound: creaking wood, a snap of thorns.

**3. Greenswell** — a knee-high wave of grass and flowers rolls **20 m** from you. Every ally it passes: **220%
SP** heal. Every enemy: **60% SP** nature and pushed **2 m** along the wave (bosses are not pushed). Looks:
`storm` nature driven along a line, leaf motes. Sound: rushing wind through tall grass, rising pitch.

**4. Heartwood Ward** — for **8 s**: target's armour **+50%**, and **30% of the damage they take** is paid back
as healing over the next 6 s. Status `heartwood` (new, buff). Looks: bark plates in brown-green
(`STATUS_FX.stoneskin`-style). Sound: a deep wooden groan.

**5. Circle of the Elder Grove** — allies inside are healed **30% SP a second** (360% SP over 12 s). **Shifting
inside the circle costs no mana and no GCD** — this is where a druid swaps between healer and tank during a tank
swap. Enemies that enter are **Rooted 2 s**, once per enemy per cast (bosses immune). Looks: a ring of 8 standing
stones rising 1.5 m with moss (`pillar` nature at each stone), a green floor glow. Sound: a low wooden drone
with birdsong.

**6. Everbloom** — heals every ally within 30 m **150% SP** at once, then **60% SP a second for 8 s** (480% SP).
**Wild Pulse:** every shift you make while it lasts releases a 15 m pulse that heals **120% SP** and adds the
bonus of the form you **enter**: **Grove** — allies +20% move speed 4 s · **Heron** — allies regain 3% mana ·
**Bear** — every enemy in 15 m is Taunted 2 s · **Wolf** — allies deal +20% damage 6 s. Looks: a tree of light
grows from the druid (8 m tall), petals rain over 30 m (`storm` nature + `pillar` holy). Sound: an orchestral
swell; each Wild Pulse a single struck bell.

---

## 4. Alternate spells — the form versions

### 4.1 Heron versions (healer; Calling I, level 6)

| Slot | id | Name | Cost | CD | Cast | Target | Range / shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `druid_heron_stillwater_touch` | Stillwater Touch | 3% | — | 1.5 s | Needs target (ally) | 40 m | `tag_nature` `tag_spell` `tag_heal` | heals **260% SP**; if the ally carries your Seedbloom it **blooms at once** (120% SP) and a fresh seed is planted |
| 2 | `druid_heron_reedbed` | Reedbed | 6% | 18 s | instant | Ground | 30 m, 6 m circle, 10 s | `tag_nature` `tag_spell` `tag_area` `tag_duration` `tag_heal` | allies inside healed **20% SP a second** (200% SP); enemies inside **Chilled** (slowed) while they stand in it |
| 3 | `druid_heron_wingwash` | Wingwash | 7% | 12 s | instant | Self (a cone the way you face) | 12 m, 70° cone | `tag_nature` `tag_spell` `tag_area` `tag_heal` | every ally in the cone healed **180% SP** and cleansed of one Poisoned, Venom or Rot |
| 4 | `druid_heron_still_water` | Still Water | 5% | 30 s | instant | Needs target (ally) | 40 m | `tag_nature` `tag_spell` `tag_shield` `tag_duration` | absorbs **250% SP** for 10 s; while it holds the ally cannot be knocked back or pulled |
| 5 | `druid_heron_mirror_pool` | Mirror Pool | 9% | 45 s | 1.5 s | Ground | 30 m, 8 m circle, 12 s | `tag_nature` `tag_spell` `tag_area` `tag_duration` `tag_heal` | allies inside healed **25% SP a second** (300% SP); the **first** time each ally inside drops below 30% health they are healed **200% SP** at once |
| 6 | `druid_heron_springflood` | Springflood | 14% | 150 s | channel 4 s | Self | every ally within 30 m | `tag_nature` `tag_spell` `tag_area` `tag_heal` `tag_channel` | heals every ally **80% SP every 0.5 s** (640% SP); you can turn but not move |

Looks and sounds (Heron):
* **Stillwater Touch** — the heron dips its beak (`dip` clip); a ring of water ripples out on the ally
  (`heal()` recoloured blue-green). Sound: a single water drop, then a low chime.
* **Reedbed** — reeds rise knee-high over a sheet of shallow water (`aoe` nature + a flat water decal); enemies
  wade. Sound: rustling reeds, lapping water loop.
* **Wingwash** — the heron spreads its wings (`wingspread`) and throws a fan of spray (`breath` nature,
  recoloured water-blue). Sound: a wet whoosh.
* **Still Water** — a clear bubble with a still surface around the ally (`STATUS_FX.barrier` recoloured
  blue-grey). Sound: a hollow glassy *plink*.
* **Mirror Pool** — a round pool that reflects the sky (a mirror-bright decal); a caught ally flashes white
  as the save lands. Sound: a deep bell under water.
* **Springflood** — water rises around the heron and spreads across the ground to every ally (`storm` nature,
  blue), petals floating on it. Sound: a rising river, birdsong at the peak.

### 4.2 Bear versions (tank; Calling II, level 20)

| Slot | id | Name | Cost | CD | Cast | Target | Range / shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `druid_bear_heavy_paw` | Heavy Paw | 1% | — | instant | Auto-target | 3.2 m, 90° arc | `tag_physical` `tag_attack` `tag_melee` `tag_area` | **140% claw**; threat from this hit **×2** (on top of Guardian ×4) |
| 2 | `druid_bear_rending_sweep` | Rending Sweep | 3% | 6 s | instant | Self (front) | 5 m, 180° | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_duration` | **90% claw** to all + **Bleeding** 6 s (26% claw a second) |
| 3 | `druid_bear_earthshake_roar` | Earthshake Roar | 0% | 12 s | instant | Self | 10 m circle | `tag_area` `tag_duration` | **Taunts** every enemy 3 s (bosses included, page 05 §13.4); they are **Weakened** (page 05, −25% damage) for 4 s |
| 4 | `druid_bear_stonepelt` | Stonepelt | 0% | 20 s | instant, off GCD | Self | self | `tag_duration` | **40% less damage taken for 6 s** |
| 5 | `druid_bear_deep_den` | Deep Den | 0% | 90 s | channel up to 3 s | Self | self | `tag_heal` `tag_channel` | heals **30% of max health** across the channel; you keep full threat; moving ends it |
| 6 | `druid_bear_old_bear_wakes` | The Old Bear Wakes | 0% | 150 s | instant, off GCD | Self | self, 12 s | `tag_heal` `tag_duration` | **+30% max health** (the new health is filled), **immune to knockback and stun**, every hit you take heals you **1% max health** (max 3 a second) |

Looks and sounds (Bear):
* **Heavy Paw** — `impact` physical + three claw streaks (`shadow_claw` sprite tinted bone white). Sound: a
  thud and a growl pitched by `seed`.
* **Rending Sweep** — a 180° arc of claw streaks, `bleed` drops. Sound: a tearing sweep of claws.
* **Earthshake Roar** — the `rear_roar` clip, a dust ring (`aoe` physical) and a red shout ripple. The roar is
  the class's loudest sound (page 17 caps it).
* **Stonepelt** — grey stone plates close over the fur (`STATUS_FX.stoneskin`). Sound: grinding rock.
* **Deep Den** — the bear curls up (`curl` clip), a `regen` aura, slow deep breathing.
* **The Old Bear Wakes** — the bear grows 15%, its fur greys at the muzzle, a mossy aura (`pillar` nature, low).
  Sound: an old, rumbling roar with an echo.

### 4.3 Wolf versions (melee damage; Calling III, level 40)

**Torn** (new status, page 05 should add it): a bleed from wolf bites — **12% claw damage a second per stack**,
**6 s**, up to **3 stacks** (5 with a talent), dispel: Bleed, icon `fa-teeth`.

| Slot | id | Name | Cost | CD | Cast | Target | Range / shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `druid_wolf_snapping_bite` | Snapping Bite | 1% | — | instant | Auto-target | 2.6 m, one target | `tag_physical` `tag_attack` `tag_melee` `tag_duration` | **2 bites × 70% claw**, each adds **1 Torn** |
| 2 | `druid_wolf_leaping_snap` | Leaping Snap | 3% | 10 s | instant | Auto-target | leap up to 12 m to the target | `tag_physical` `tag_attack` `tag_melee` `tag_movement` | **150% claw** on landing; target **Dazed** 3 s (page 05, −50% move) |
| 3 | `druid_wolf_howl_of_the_hunt` | Howl of the Hunt | 2% | 20 s | instant | Self | 20 m | `tag_nature` `tag_spell` `tag_area` `tag_aura` `tag_duration` | 8 s: you **+20% attack speed**; the party within 20 m **+8% damage**; your hard target is **Hunted** (+10% damage from you) |
| 4 | `druid_wolf_slip_the_snare` | Slip the Snare | 0% | 20 s | instant, off GCD | Self | self | `tag_movement` `tag_duration` | removes **roots and slows**; 3 s of **+40% dodge** and **+50% move speed** |
| 5 | `druid_wolf_circling_frenzy` | Circling Frenzy | 4% | 20 s | 2 s sequence | Auto-target | the target + enemies within 3 m of it | `tag_physical` `tag_attack` `tag_melee` `tag_area` | the wolf circles its prey: **6 strikes × 70% claw** on the target (enemies within 3 m take 50% of each), every strike adds 1 Torn |
| 6 | `druid_wolf_killing_bite` | Killing Bite | 5% | 30 s | instant | Needs target | 2.6 m | `tag_physical` `tag_attack` `tag_melee` | **600% claw**, **+60% claw per Torn stack** it consumes, **+50%** on targets below 30% health; a kill refunds half the cooldown |

Looks and sounds (Wolf):
* **Snapping Bite** — two quick lunges, red bite marks (`impact` bleed, small). Sound: two snaps.
* **Leaping Snap** — the `pounce` clip, a grey streak (`footfall` physical on take-off and landing). Sound: a
  snarl and a thump.
* **Howl of the Hunt** — head up, a silver sound-ring (`aoe` nature recoloured silver) and a red eye glyph on the
  Hunted target. Sound: a long howl (one per druid — they layer if two wolves howl).
* **Slip the Snare** — roots snap, a blur trail for 3 s. Sound: a yelp and fast paws.
* **Circling Frenzy** — the `circle` clip: the wolf runs a tight ring around the target with claw streaks each
  pass. Sound: a growl rising to a snarl.
* **Killing Bite** — a lunge to the throat, `impact` bleed crit, the Torn icons burst. Sound: a heavy crunch.

### 4.4 How it plays

* **Solo, 1–5:** Seedbloom enemies from range, finish with the quarterstaff; Seedbloom yourself (`F1`) between
  pulls.
* **Solo, 6–19:** thorn Seedbloom + Bramblegrip on the pack, Greenswell to push them off; Heron to top yourself
  up (Stillwater Touch) after a hard pull.
* **Solo, 20–39:** pull with a thorn seed, shift to **Bear**, Heavy Paw / Rending Sweep the pack, Earthshake
  Roar if more than two are on you; shift to Heron and Stillwater Touch yourself as it dies.
* **Solo, 40–60:** **Wolf** for single targets (Snapping Bite → Circling Frenzy → Killing Bite), Bear for big
  packs, Heron between fights.
* **Dungeon (Healer):** Heron 90% of the time — Stillwater Touch on the tank, Wingwash the group after an area
  hit, Still Water before a big hit, Reedbed under the melee. When the tank dies: **Bear** at once (Earthshake
  Roar holds the room for 3 s while someone revives) — but remember slot 3 is now on cooldown for Wingwash too.
* **Challenge mode and Depth:** plant **Circle of the Elder Grove** where the party will stack, because shifting
  inside it is free: a healer-druid can become the off-tank for a tank swap and come back without spending
  anything. **Everbloom + shifting** is a party cooldown: during its 8 s, shift Heron → Bear → Grove → Wolf to fire
  four Wild Pulses (mana, taunt, speed, damage) on top of the heal.

### 4.5 Boss mechanics (page 11 vocabulary)

| Mechanic | What a druid does |
|---|---|
| **Danger zone** | Wolf's Leaping Snap (12 m, needs an enemy outside) or Slip the Snare's +50% move; a Heron just walks — plan earlier |
| **Void zone** | Greenswell and Springflood heal everyone still crossing one; Bramblegrip roots adds inside one |
| **Soak** | Bear is the best soaker (+40% health, ×2.5 armour); Heartwood Ward on a soaker turns 30% of the soak into healing; Still Water absorbs 250% SP of it |
| **Targeted** (yellow) | Still Water on the target; a Wolf druid Slips the Snare out of the group |
| **Knock-back into a pit** | Still Water makes the ally immune to knock-back while it holds |
| **"No shapes" phase** | some bosses force Grove form (page 11/12 may flag one). The Form Ring shows a red slash |
| **Interrupts** | no dedicated interrupt. Wolf talent Leaping Snap t3c **Throat Leap** interrupts a non-boss cast |

---

## 5. The hybrid roles

The druid can queue as **Healer** (from level 6, Heron), **Tank** (from level 20, Bear) or **Damage** (any
level: Grove until 40, Wolf from 40). There is no role lock inside a fight, but the **shared slot cooldowns** mean
a druid that tanks is not also healing: the Bear's defensives spend the Heron's heals.

**Role focus** (canon 00 §6): the druid uses the shared **Role focus** switch in the spellbook (out of combat,
saved per Loadout), **tied to its forms**. **Primary** queues it as **Healer** (Heron from level 6); **Hybrid**
asks for one of its two hybrid roles — **Tank** (Bear, from level 20) or **Damage** (Grove, Wolf from 40) — and
queues it as that. The switch changes only the queue role; the four versions of each spell come from the form
the druid is in, and every form stays open in any focus.

### 5.1 Tank — Bear

| Piece | How it tanks |
|---|---|
| Guardian | threat ×4 in Bear form (page 05 §13.2); Heavy Paw doubles its own hit's threat |
| Heavy Paw / Rending Sweep | single-target and 180° threat, the Sweep's bleed keeps a pack on you |
| Earthshake Roar | **area taunt** 10 m, 3 s, bosses included, and −25% damage from them for 4 s; 12 s |
| Shared **Provoke** (`Z`, page 07, level 10) | the single-target taunt |
| Stonepelt | −40% for 6 s every 20 s — a short defensive for every tank buster |
| Deep Den / The Old Bear Wakes | a 30% self-heal every 90 s; a 12 s wall every 150 s |
| Mana | the bear earns mana from being hit (0.5% per 1% health lost), so the bar is always ready |
| Talents that help | Heavy Paw t1b **Bloodied Maw**; Rending Sweep t4b **Thorned Hide**; Roar t1b **Long Roar**, t3b **Rallying Roar**, t4b **Den Roar**; Stonepelt t1b **Hardened Pelt**, t3b **Stonewalled**; Deep Den t1b **Hibernal**; Old Bear t4b **Undying Bear** |
| Gear | the same INT gear works (INT counts as STR for claws); prefer armour and CON |

| Per 100 points of raw boss melee (level 60) | Warrior | Druid (Bear) |
|---|---:|---:|
| Average taken over 30 s | ≈ 55 | ≈ 58 |
| Worst 3-second window | ≈ 70 | ≈ 74 |
| Threat per second (as % of the top damage dealer) | ≈ 330% | ≈ 310% |

**How good it is.** A very sturdy bear for the **open world, Normal dungeons and Depth up to about 10**: huge
health, a defensive every 20 s, a self-heal. In **Challenge mode** it has **no interrupt** and every Bear
defensive puts a healing slot on cooldown, so a druid who tanked a phase cannot also rescue the healer in the
next; a Challenge party with a bear tank needs a second interrupter.

### 5.2 Damage — Grove (1–39) and Wolf (40+)

| Piece | How it deals damage |
|---|---|
| Grove (1–39) | thorn Seedbloom on every enemy, Bramblegrip, Greenswell — a ranged nature caster that also roots; about **80%** of a dedicated caster's damage |
| Wolf (40+) | Snapping Bite keeps 3 Torn up, Circling Frenzy for small packs, **Killing Bite** eats the Torn for up to 780% claw; about **95%** of the rogue's single-target damage |
| Howl of the Hunt | +8% party damage and a +10% personal mark every 20 s |
| Everbloom (Grove) | entering Wolf during it gives the party +20% damage for 6 s |
| Talents that help | Snapping Bite t1c **Deep Fangs**, t3c **Pack Tactics**; Leaping Snap t4c **Pack Leap**; Howl t3c **Hunted Down**; Frenzy t3c **Spinning Wolf**; Killing Bite t2c **Bloodtrail**, t4c **Pack Leader** |

**How good it is.** Solid everywhere up to Normal and moderate Depth; weaker in Challenge mode because the Wolf
has only one real escape (Slip the Snare) and every movement phase costs it the Torn stacks.

---

## 6. Utility spells

### 6.1 `druid_herons_flight` — Heron's Flight (00 §6; numbers from page 20 §16.4)

| Field | Value |
|---|---|
| Unlocks | **level 12** (when waystones and Travel Methods open, page 07), with Heron form known |
| Uses a slot | no — it is on the **spellbook's Utility tab** (`K`), draggable to any spare bar key |
| Cost | none |
| Targeting | **Self** |
| Cast | **3 s** (the druid takes Heron form), then an **8 s** flight scene; out of combat, open world and towns only (not inside a dungeon or a world-boss arena during its fight); moving or taking damage cancels the cast |
| Target | **any waystone the druid has discovered** — town or landmark — picked in `scr_teleport_picker`; never a dungeon, never an undiscovered place |
| Who | **the druid alone** (party members are not carried — the Oracle's Guiding Call and the Mage's Portal are the group tools; in a party the druid can go first and anchor a Scroll of Calling, page 20 §17) |
| Cooldown | **20 minutes** (shares nothing with the Recall Stone) |
| Travel | the Heron lifts, the camera follows it up and fades; the druid lands at the waystone as the Heron, then shifts back |
| Tags | `tag_movement` (for completeness; no damage) |
| Looks / sound | `wingspread` clip, a column of feathers (`pillar` nature, grey); a heron's cry and wingbeats |

No other utility spells. The druid also uses scrolls and the Recall Stone (page 20). *(Round 1's Stag form —
Herdbearer, Riverhart, Trackless Path — is gone with the Stag.)*

---

## 7. Talents

Talent ids hang on the **slot's Grove spell id**: `druid_<grove spell>_t<tier><a|b|c>` (e.g.
`druid_heartwood_ward_t2b` = Den Mother). Tiers open at **12 / 22 / 32 / 45**; one pick per tier per slot. Each
tier offers three choices built the same way: **a** changes the **Grove and Heron** versions (healing),
**b** changes the **Bear** version, **c** changes the **Wolf** version — so a talent build *is* a choice of roles.
A talent for a form you have not unlocked yet can still be picked; it shows "Works from level 20/40".

| Slot | Tier | a — Grove / Heron | b — Bear | c — Wolf |
|---|---|---|---|---|
| 1 | 1 (12) | **Twin Seed** — Seedbloom also plants on the nearest other ally/enemy within 8 m at 50%; Stillwater Touch also heals a second ally within 8 m for 40% | **Bloodied Maw** — Heavy Paw heals you 3% of max health | **Deep Fangs** — Torn stacks to 5 |
| 1 | 2 (22) | **Pollen** — a bloom heals everyone within 5 m of the target for 40% SP | **Heavy Hunter** — Heavy Paw's arc 90° → 180° | **Hamstring Bite** — the second bite Dazes 2 s (non-boss) |
| 1 | 3 (32) | **Wildgrowth** — a bloom or Stillwater Touch on an ally below 40% health heals ×2 | **Old Bear** — below 30% health Heavy Paw costs nothing and hits 250% claw | **Pack Tactics** — Snapping Bite from behind bites 3 times |
| 1 | 4 (45) | **Evergreen** — a seed that would expire on a full-health ally waits up to 20 s and blooms the moment they are hit | **Crushing Paw** — every 4th Heavy Paw applies Sundered (page 05, −10% armour, max 3) | **Frenzied Jaws** — Snapping Bite has a 20% chance to end the GCD at once |
| 2 | 1 | **Thicket** — Bramblegrip 5 → 8 m (root 3 → 2 s); Reedbed 6 → 9 m | **Wide Sweep** — Rending Sweep becomes a 360° circle | **Long Leap** — Leaping Snap 12 → 20 m |
| 2 | 2 | **Strangler** — Bramblegrip's rooted enemies take 20% SP a second; enemies in Reedbed take 15% SP a second | **Deep Wound** — Rending Sweep's Bleeding stacks to 3 | **Pounce Back** — press again within 3 s to leap back to where you started |
| 2 | 3 | **Brambleward** — allies inside Bramblegrip or Reedbed take 15% less damage | **Rooting Sweep** — Rending Sweep Roots non-boss enemies 1 s | **Throat Leap** — Leaping Snap interrupts a non-boss cast and adds 2 Torn |
| 2 | 4 | **Briar Cage** — Bramblegrip's edge is a wall for 3 s (non-boss enemies cannot leave); allies in Reedbed cannot be knocked out of it | **Thorned Hide** — for 4 s after Rending Sweep, attackers take 30% claw | **Pack Leap** — Leaping Snap has 2 charges |
| 3 | 1 | **Riptide** — Greenswell comes back to you (every target twice, each 60%); Wingwash's cone 70° → 120° | **Long Roar** — Earthshake Roar's taunt 3 → 5 s | **Long Howl** — Howl lasts 8 → 12 s |
| 3 | 2 | **Cleansing Swell** — Greenswell removes one poison or curse from each ally it passes; Wingwash removes two | **Unmoving** — the Roar also makes you immune to knock-back for 6 s | **Blood Howl** — the Howl also heals the party 3% of max health |
| 3 | 3 | **Tidemark** — allies healed by Greenswell or Wingwash gain a 6 s shield of 60% SP (`tag_shield` added) | **Rallying Roar** — each enemy taunted gives you a shield of 3% max health (max 30%) | **Hunted Down** — the Hunted target also takes +10% from the whole party |
| 3 | 4 | **Green Road** — allies healed gain +40% move for 4 s | **Den Roar** — allies within 10 m take 10% less damage for 6 s | **Alpha** — the Howl resets Leaping Snap |
| 4 | 1 | **Graft** — Heartwood Ward and Still Water also land on you at 50% when cast on someone else | **Hardened Pelt** — Stonepelt 40 → 55%, 6 → 4 s | **Slippery** — Slip the Snare's dodge 40 → 60% |
| 4 | 2 | **Sap Return** — Heartwood Ward returns 30 → 50% (no armour bonus); Still Water's unused absorb heals the ally when it ends | **Den Mother** — Stonepelt also covers allies within 6 m at 20% | **Vanishing Trail** — Slip the Snare drops 50% of your threat on every enemy |
| 4 | 3 | **Transplant** — when either ends, anything it still owed jumps to the lowest-health ally within 20 m | **Stonewalled** — Stonepelt also makes you immune to stun and knock-back | **Second Wind** — Slip the Snare heals you 10% of max health |
| 4 | 4 | **Ancient Bark** — if the target would die while Heartwood Ward or Still Water is on them, they drop to 1 health instead and it ends (once per cast) | **Stubborn Hide** — every hit taken during Stonepelt takes 0.5 s off slot 4's cooldown (max 8 s) | **Shadow Run** — the first attack after Slip the Snare always crits |
| 5 | 1 | **Wide Ring** — Circle and Mirror Pool 8 → 12 m, healing −25% | **Hibernal** — Deep Den heals 30 → 50% and you take no damage in its first 1 s | **Longer Frenzy** — Circling Frenzy 6 → 9 strikes |
| 5 | 2 | **Shift-Song** — every shift inside the Circle heals everyone inside 60% SP; Mirror Pool catches each ally twice | **Den Guard** — during Deep Den, allies within 6 m take 15% less damage | **Blood Frenzy** — each Frenzy strike on a Torn target heals you 1% of max health |
| 5 | 3 | **Deep Roots** — allies inside the Circle or the Pool cannot be knocked out of it | **Short Rest** — Deep Den's cooldown 90 → 60 s, healing −20% | **Spinning Wolf** — Frenzy strikes every enemy within 4 m at full damage |
| 5 | 4 | **Grove Gate** — a second Circle (or Pool) within 60 s links them: allies step into one and appear at the other (once each, 3 s cooldown) | **Mountain Sleep** — Deep Den can be channelled while moving at 30% speed | **Blood in the Snow** — Frenzy leaves a 4 m patch for 5 s; enemies in it take +10% from you |
| 6 | 1 | **Long Summer** — Everbloom 8 → 12 s; Springflood 4 → 5 s | **Long Waking** — The Old Bear Wakes 12 → 18 s | **Clean Kill** — Killing Bite's cooldown 30 → 20 s, damage −20% |
| 6 | 2 | **Heartbloom** — Wild Pulse heals 120 → 200% SP but only once per form per Everbloom | **Old Bear's Roar** — The Old Bear Wakes also taunts everything within 10 m for 3 s | **Bloodtrail** — Killing Bite's bonus per Torn 60 → 80% |
| 6 | 3 | **Wild Revival** — Everbloom or Springflood also revives one dead ally in range at 30% health (once per cast) | **Unbroken** — during The Old Bear Wakes, healing received +20% | **Finisher** — Killing Bite's bonus below 30% health becomes below 40% |
| 6 | 4 | **Fourfold** — every Wild Pulse gives **all four** form bonuses | **Undying Bear** — if you would die during The Old Bear Wakes, you drop to 1 health instead and it ends | **Pack Leader** — a Killing Bite that kills gives the party +10% damage for 8 s |

---

## 8. Class sets

Every piece is `medium` armour (head, chest, hands, legs, feet) plus a weapon or off-hand. Bonuses stack
(6 pieces = 2 + 4 + 6 bonuses). Page 09 lists these in its class-set index.

### 8.1 `set_druid_grovekeepers_vestments` — Grovekeeper's Vestments (healer dungeon set, 25–30)

Drops from `d07_thornheart` bosses (head, hands, staff `it_grovekeepers_crook`) and `d08_moonwell_ruins` bosses
(chest, legs, feet) on **Normal** at the dungeon's level and on **Challenge** at item level 60; Depth runs can drop
it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | A bloom (Seedbloom or Stillwater Touch's bloom) plants a new seed at 50% strength (once) | slot 1 |
| 4 | Greenswell and Wingwash leave a 3 m healing patch where they touch each ally (20% SP a second, 4 s) | slot 3 |
| 6 | Circle of the Elder Grove and Mirror Pool cast **instantly**; each shift inside the Circle blooms every Seedbloom inside | slot 5, slot 1 |

### 8.2 `set_druid_hide_of_many` — Hide of Many (forms dungeon set, 36–45)

Drops from `d10_rimefang_caverns` bosses (head, hands, feet) and `d11_saltdeep_cathedral` bosses (chest, legs,
sceptre `it_many_hides_sceptre`) on **Normal** and on **Challenge** at item level 60. *(Round 1 dropped this set in
a raid; raids are in `WISHLIST.md`.)* **This is the forms set** — each bonus changes one form.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | **Bear:** Heavy Paw has a 25% chance to reset slot 2 (Rending Sweep); the bear grows white frost-tipped fur | Bear |
| 4 | **Wolf:** a Killing Bite on a target with 3+ Torn refunds half of slot 6's cooldown; the wolf gets dark stripes | Wolf |
| 6 | **Heron:** entering Heron from Bear or Wolf gives 4 s of **Skybound**: Stillwater Touch is instant and costs nothing | Heron |

### 8.3 `set_druid_elderhorn_regalia` — Elderhorn Regalia (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wild Heart (Calling III) lasts 6 → 10 s | the mechanic |
| 4 | Everbloom's slot cooldown drops 5 s every time you shift (max 60 s per Everbloom) | slot 6 |
| 6 | **Elder Shape:** the first shift after Everbloom turns you into an **Elderhorn** for 15 s — an `elk` (size 1.8, glowing antlers) whose slots 1–3 cast their **Heron** versions and slots 4–6 their **Bear** versions, with the Bear's Guardian state and half its health and armour bonus | a unique hybrid bar |

---

## 9. Class legendaries, uniques and souls

Legendaries roll normal affixes plus a fixed power (page 08 owns the legendary model).

### 9.1 Legendaries

| id | Name | Slot / base | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_pelt_of_the_first_winter` | Pelt of the First Winter | chest, medium | **Bear:** Heavy Paw critical hits give a shield of **10% max health** (8 s, max 30%). Your bear is white. | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss) on Challenge, and `b_standing_ruin` The Standing Ruin (Frostmantle world boss) |
| `leg_the_ninth_life` | The Ninth Life | necklace | Once per **120 s**, damage that would kill you in Bear or Wolf form instead drops you into Grove form at **30% health** and roots every enemy within 6 m for 2 s | `b_choir_of_brine` The Choir of Brine (`d11_saltdeep_cathedral` main boss) on Challenge |
| `leg_seedkeepers_crook` | Seedkeeper's Crook | staff | Seedbloom lands on **3 allies at once** from one cast; a bloom jumps its remaining heal-over-time to the lowest-health ally within 15 m | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss) on Challenge, and its Depth end chest |
| `leg_heronfeather_mantle` | Heronfeather Mantle | head, medium | **Heron:** every 5th Stillwater Touch is instant and also casts a free Wingwash centred on the target; Springflood can be channelled while walking at 50% speed | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_fang_of_the_long_hunt` | Fang of the Long Hunt | ring | **Wolf:** a Killing Bite that kills resets slot 6 completely and puts 3 Torn on the nearest enemy within 10 m | `b_hungering_brood` The Hungering Brood (Whisperwood world boss) |
| `leg_heart_of_the_wildwood` | Heart of the Wildwood | ring | Each **different** form (Grove included) you have been in during the last **20 s** gives **+6%** damage and healing (max +24% with all four) | the end chest of any dungeon at **Depth 15+** (1.5%) |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_thornheart_splinter` | Thornheart Splinter | sceptre | +8 INT, +6% spell power | Bramblegrip's roots deal **30% SP a second** | `b_rakka_bloodbriar` Rakka Bloodbriar (`d07_thornheart` sub-boss) |
| `uq_oakhide_wraps` | Oakhide Wraps | hands, medium | +8 CON, +40 armour | Slot 4's cooldown is 10 s shorter when you cast its Grove or Bear version on yourself | `b_foreman_grubnik` Foreman Grubnik (`d03_shaft_seven` sub-boss) |
| `uq_hollow_horn` | Hollow Horn | off-hand focus (reuse: `foci.js` `effigy` model `idol`, new look `horn`) | +6 INT, +10% move | **Wolf:** Howl of the Hunt reaches 20 → 40 m and Dazes non-boss enemies within 8 m for 2 s | rare elite in `sunscar` (page 10 names it) |
| `uq_mossback_greaves` | Mossback Greaves | legs, medium | +10 CON, +5% dodge | In Bear form, standing still for 2 s gives 10% damage reduction (lost on moving) | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss) |

### 9.3 Souls

Both need the wearer to be a **druid**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_turning_season` | Soul of the Turning Season | jewellery — ring | class: druid | Every shift heals you **and** the lowest-health ally within 20 m for **60% SP** (once every 4 s) (`tag_nature` `tag_heal`). | `b_oruvel_moon_drinker` (`d08_moonwell_ruins` end boss) on Challenge (3%); `b_hungering_brood` world boss (2%) |
| `soul_grove_mother` | Soul of the Grove Mother | armour — chest | class: druid | In **Bear** form, **20%** of the damage you take is paid to the lowest-health ally within 20 m as healing — a tank that heals the party it protects. | end chest at **Depth 15+** (1%); `b_standing_ruin` world boss (2%) |

---

## 10. Voice and barks

* **Voice:** `voiceFor({ role: 'druid', gender, seed })` (reuse: `shared/voices.js`, pitch 0.52, depth 0.55,
  tone 0.55, breath 0.3). In animal forms the voice is **replaced by the creature's sounds** — a druid does not
  talk as a bear; barks become croaks, growls and howls through `sfx`.
* **Speech:** Lingo speaker with tone tags `calm`, `wild` (reuse: `lingo/`).

| Moment | Lines (examples; Lingo pool `druid_*`) |
|---|---|
| Cast heal (Grove) | "Grow." · "Take root." · "The grove remembers you." |
| Critical heal | "Bloom!" · "Spring comes early." |
| Low health | "The roots are thin here…" · "I need to change." |
| Shift to Heron | "Still water." (then a heron's croak) |
| Shift to Bear | "Hide of the bear!" (then a growl) |
| Shift to Wolf | "Run with me." (then a short howl) |
| Tank died | "I'll hold them — shifting!" |
| Heron's Flight | "Wings, carry me home." |
| Everbloom | "Everything that grows — wake!" |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Body models | `avatar-3d/js/creatures.js`, `creature-types.js` types `bear`, `wolf`, `owl` (retuned long-legged for the Heron), `elk` | forms (§2.6); colours from the druid |
| Visual of Seedbloom / Greenswell / Stillwater Touch | Farhold `renew` (holy regen) and `mend` — look only | recoloured nature / water |
| Bramblegrip visual | Farhold `frost_nova` ring timing | nature brambles instead of ice |
| Bear bleed / claws, Wolf bites | Farhold `STATUS_FX.bleed`, `shadow_claw` sprite | tinted |
| Footfalls | `spellfx.footfall` (Farhold R25 trail) | Wolf leaps, nature element |
| Outfit | `avatar-3d/data/class-outfits.json` `druid` (wolf_helm, fur_tunic, herb_satchel, staff_crook) | Grove look |
| Voice | `shared/voices.js` `ROLE_VOICES.druid` | as is |
| Not used | Farhold druid skills `poison_dart`, `call_wolf`, `frost_nova`, `stoneskin`, `rally` and pet `grove_wolf`; round 1's Cat, Owl and Stag forms | the forms replace a summoned pet |
| Emberveil 2 prototype ideas | `rejuvenation` → Seedbloom, `entangle` → Bramblegrip, `wild_shape` → the whole mechanic | ideas only, numbers new |
| New work | the one-bar / four-version slot system with shared slot cooldowns; creature clips `wade`, `dip`, `wingspread`, `rear_roar`, `curl`, `pounce`, `circle`; form pre-build + swap; Form Ring; form peek; new statuses `thornseed`, `heartwood`, `torn` (page 05); Heron's Flight | (new) |
