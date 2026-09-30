# Class: Druid (`druid`)

> *"The grove taught me four shapes. It did not say which one I was."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 17.
**Status:** v0.1 draft, 2026-09-29. Documentation only — nothing is built.

### How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the equipped main-hand weapon, before armour. In animal forms WD becomes **claw damage** (§4.1). |
| **SP** | Spell power: the caster's damage/heal base. Page 05 owns the formula. In Farhold a non-physical hit is `WD × mult × (1 + spellPower)` (reuse: `farhold/js/skills.js`); Wildmarch keeps that shape. "120% SP" = 1.2 × that base. |
| **Mana cost** | % of maximum mana, so a cost never goes stale as the pool grows. |
| **Fury / Focus** | absolute points out of 100. |
| **GCD** | Global cooldown: the short lockout after any spell or shift, **1.0 s** (canon, [page 00](../00-OVERVIEW.md) §4). |
| **Slot level** | canon ladder 1 / 4 / 10 / 18 / 28 / 40. Talent tiers 12 / 22 / 32 / 45. Callings 6 / 20 / 40. |

All spell visuals use `avatar-3d/js/spellfx.js` (reuse) — its elements are fire, ice, shadow, holy,
**nature**, arcane, lightning, physical, poison, bleed, true, and its methods are `projectile`, `impact`,
`aoe`, `cast`, `heal`, `revive`, `breath`, `orbitOrb`, `pillar`, `vortex`, `storm`, `footfall`.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A keeper of the old groves who has learned to wear the bodies of four animals. The druid is the only class that changes its whole body and its whole spell bar mid-fight. |
| Roles | **Healer** (caster form) · **Tank** (Bear) · **Damage** (Cat melee, Owl ranged). Queues for any of the three in the group finder; there is no role lock inside a fight. |
| Armour | Medium (reuse: Farhold `armorTier: "medium"`) |
| Weapons | Staff, quarterstaff, sceptre (+ a focus in the off hand with a sceptre). Starter: **Hearthwood Quarterstaff** (reuse base `quarterstaff`). |
| Primary attribute | INT. In Bear and Cat each point of INT also counts as a point of STR for claw damage (§4.1) so one gear set works in every shape. |
| Resource | **Mana** in caster, Owl and Stag forms · **Fury** in Bear · **Focus + combo points** in Cat |
| Companion | None. The forms are the companion. (Farhold's `grove_wolf` pair is not used — see §10.) |
| Playstyle | Heal from range in caster form, drop into Bear the moment a tank dies, slip into Cat to finish an add, lift into Owl for a burst window, and cross a river as a stag. A druid's skill is *knowing when to be what*. |

---

## 2. Class mechanic: **Shapeshift**

### 2.1 What it is

The druid has **five shapes**: caster (the Chibi 2 body) plus **Bear**, **Cat**, **Owl** and **Stag**.
Each shape has its **own six-key spell bar**, its own resource and its own basic attack. Changing shape
swaps the body model, the bar, the resource gauge and the stat block at once.

### 2.2 How shifting works

| Rule | Value |
|---|---|
| Keys ([page 02](../02-CONTROLS.md) §5.16) | **Shift+1** Bear · **Shift+2** Cat · **Shift+3** Owl · **Shift+4** Stag · **Q** tap = back to caster form · **Q** hold = the **Form Ring** (radial menu, 4 wedges; release over a wedge to shift). Pressing the key of the form you are in also returns you to caster. |
| Cost | **4% mana** into an animal form. Returning to caster form is free. |
| Cooldown | Shares the **GCD** (1.0 s). No other cooldown. Calling III (level 40) removes the GCD from shifting. |
| Cast | Instant. Plays a 0.35 s swap (§2.5); you can move during it. |
| Blocked when | Stunned, silenced, feared, dead, mounted, carrying an event object, inside a "no shapes" boss mechanic (page 11 may mark one). |
| Sheds | **Roots and slows** are removed when you enter an animal form (from Calling II, level 20). Stuns are never removed. |
| Carries over | Health **as a percentage** (a Bear gets +40% max health, so 50% health stays 50%) · mana (regenerates at 50% speed in Bear/Cat, full speed in Owl/Stag) · every buff, heal-over-time, debuff and damage-over-time on you · the cooldowns of every other bar (they keep ticking while hidden) · threat on every enemy. |
| Does not carry | Fury (reset to the form's starting value), Focus (starts at 100), combo points (kept for 10 s on the druid — shift out and back within 10 s and they are still there), Moonsong (kept, decays 5/s outside Owl). |
| Casting across bars | Caster spells cannot be cast in an animal form, **except Heartwood Ward** (slot 18), which is castable in every shape. Talents add others (Bear T4 `druid_bear_hide_t4b`). |
| Dying in a form | You die as the animal; the body falls with the creature `dead` clip. On release/revive you return in caster form. |
| Mounting | Mounting is refused in any animal form ("Leave your shape first"). Stag is not a mount — it is slower than a mount (§4.5) but works in combat and in water. |
| Form Ring | Shows only the forms you have unlocked; locked wedges are grey with the calling level (6/20/40). |

### 2.3 Gauges and UI (`scr_hud`, page 03 owns the layout)

* **Form crest** — a round badge left of the spell bar showing the current shape's silhouette
  (leaf / bear paw / cat eye / owl feather / antler). It pulses green for 0.5 s after a shift and shows
  a grey sweep while the GCD runs.
* **Resource bar** under the health bar changes colour and meaning with the form:
  caster/Owl/Stag = blue Mana · Bear = red **Fury** (0–100, 10 notches) · Cat = yellow **Focus**
  (0–100) with **five claw pips** above it for combo points · Owl adds a thin silver **Moonsong** strip
  (0–100) above the mana bar.
* **Spell bar swap** — the six keys slide down and the form's six slide up (0.2 s). A small
  "caster" row stays visible **above** the bar at 60% size so a druid can still watch its caster
  cooldowns while in a form (setting `set.interface.druid_ghost_bar`, default on — page 04).
* **Party frames** show every druid's shape as a tiny icon on the frame, so a raid leader can see
  "our healer is a bear right now".

### 2.4 The calling quests (page 14 owns quest text and ids)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_druid_1` | **The Two Hides** | Hearthvale — the Old Oak above Brightwater; kill nothing, sit with a hibernating bear through a 60 s night scene, then outrun a stag herd | **Bear** form (4 spells) and **Stag** form (Bound, Antler Rush). The Form Ring. |
| 20 | `q_calling_druid_2` | **The Third Hide** | Sunscar — stalk a dune cat across three mesas without being seen (a stealth course; failure restarts the leg, not the quest) | **Cat** form (4 spells) · Stag learns **Riverhart** (swim form) and **Herdbearer** · shifting now **sheds roots and slows** |
| 40 | `q_calling_druid_3` | **The Last Hide** | Frostmantle — climb Rimehold's Owl Spire, then a 3-minute night solo fight against the Spire's frost owl (a mini-boss that teaches reading from above) | **Owl** form (all 6 spells) · shifting leaves the GCD · every entry into an animal form grants **Wild Heart** (§2.6) |

Every calling is announced with the unlock card, a sound and an Unlocks-screen entry (page 00 §11 rule 5).

### 2.5 How the body is swapped (reuse: `avatar-3d/js/creatures.js`)

1. At login, and whenever a new form unlocks, the client **pre-builds** every unlocked form with
   `createCreature(spec)` and keeps them hidden. Building a creature compiles new shaders; doing it on
   the first shift in a fight would stutter (the playground's known three.js shader-recompile stall).
2. On shift: `spellfx.impact({ element: 'nature' })` at the chest + a ring of `leaf` sprites; at
   0.15 s the Chibi 2 actor's `group.visible = false` and the creature's `group.visible = true` at the
   same position and yaw; nameplate, target ring, status auras (`STATUS_FX`) and the carried light
   re-parent to the creature. Held weapon and off-hand are hidden with the Chibi 2 body.
3. Leaving: the reverse, with the creature playing a 0.15 s shrink.
4. **The hitbox never changes.** Every form keeps the druid's own collision capsule (0.4 m radius,
   1.8 m tall), so a big bear is not easier to hit with a telegraph and a small cat cannot slip
   through a gap the druid could not. Only the drawing changes.

| Form | `creature.type` (reuse: `creature-types.js`) | `size` | Plan | Clips used | New clips needed |
|---|---|---|---|---|---|
| Bear | `bear` (1.2 m body, claws) | 1.5 (≈1.8 m long, 1.3 m at the shoulder) | quad | idle, walk, run, attack, talk (roar), dead | `rear_roar` (stands on hind legs, 0.8 s) |
| Cat | `cat` (whiskers, claws, fangs) | 2.7 (≈1.15 m long panther) | quad | idle, walk, run, attack, dead | `prowl` (low crouch walk), `pounce` (0.5 s leap) |
| Owl | `owl` (bat plan, beak, wings) | 2.2 (≈1.75 m wingspan) | bat | idle, fly, attack, dead | `hover` (a slow wing-beat loop 1.2 m above ground) |
| Stag | `deer` (antlers, hooves) | 1.4 | quad | idle, walk, run, attack, dead | `leap` (0.6 s), `swim` (body 0.6 m lower, legs paddling) |
| Riverhart (Stag in deep water) | `deer` with `features: { mane: true }` + blue-green tint | 1.4 | quad | — | `swim` |

**Colours come from the druid**, so every player's bear is their own: `body` = the druid's hair
colour darkened 35%, `belly` = hair colour lightened 20%, `accent` = the outfit's main colour,
`eyes` = the druid's eye colour. `seed` = a hash of the character id. Dyes on the chest piece tint
`accent`. **Legendary/set looks** override these (e.g. Pelt of the First Winter makes the bear white).

### 2.6 Wild Heart (Calling III)

For **6 s after entering any animal form**: +15% damage and healing done, and the first spell cast in
that form costs nothing. Its crest glows gold. Deliberately rewards shifting *into the right form for
the moment*, not staying in one.

### 2.7 JSON shape (page 16 owns the file; this is the class's slice)

```json
{
  "id": "druid",
  "forms": {
    "bear":  { "creature": { "type": "bear", "size": 1.5 }, "resource": "fury",  "unlock": "q_calling_druid_1",  "stats": { "maxHpPct": 40, "armourMult": 2.5, "attackEvery": 1.1 } },
    "cat":   { "creature": { "type": "cat",  "size": 2.7 }, "resource": "focus", "combo": 5, "unlock": "q_calling_druid_2", "stats": { "movePct": 15, "attackEvery": 0.7 } },
    "owl":   { "creature": { "type": "owl",  "size": 2.2 }, "resource": "mana",  "gauge": "moonsong", "unlock": "q_calling_druid_3", "stats": { "spellPowerPct": 15, "physTakenPct": 10 } },
    "stag":  { "creature": { "type": "deer", "size": 1.4 }, "resource": "mana",  "unlock": "q_calling_druid_1",  "stats": { "movePctOut": 45, "movePctIn": 20 } }
  },
  "shift": { "manaPct": 4, "gcd": true, "sheds": ["root", "slow"], "keepCombo": 10 }
}
```

---

## 3. The six caster spells (healing and nature)

### 3.1 At a glance

| Slot | id | Name | Cost | CD | Cast | Range | Shape | Does |
|---|---|---|---|---|---|---|---|---|
| 1 | `druid_seedbloom` | Seedbloom | 3% | — | 1.2 s | 40 m | ally **or** enemy | heal-over-time that blooms / thorn seed that bursts |
| 4 | `druid_bramblegrip` | Bramblegrip | 5% | 15 s | instant | 30 m | ground circle 5 m | damage + root |
| 10 | `druid_greenswell` | Greenswell | 6% | 12 s | 1.5 s | 20 m | moving wave 5 m wide | heals allies it passes, pushes enemies |
| 18 | `druid_heartwood_ward` | Heartwood Ward | 4% | 30 s | instant | 40 m | ally | armour + damage-to-healing; **castable in every form** |
| 28 | `druid_elder_circle` | Circle of the Elder Grove | 8% | 45 s | 2.0 s | 30 m | ground circle 8 m, 12 s | area heal, free shifting inside, roots intruders |
| 40 | `druid_everbloom` | Everbloom | 12% | 150 s | instant | self, 30 m | room heal, 8 s | big heal; every shift during it pulses |

### 3.2 Details

**`druid_seedbloom` — Seedbloom** · slot 1 · 3% mana · no cooldown (GCD) · 1.2 s cast · 40 m · one target (ally or enemy)
* **On an ally (or yourself):** plants a glowing seed. Heals **25% SP every 2 s for 12 s** (150% SP),
  then **blooms** for **120% SP**. One Seedbloom per ally per druid; recasting blooms the old seed
  early at 50% bloom and plants a new one.
* **On an enemy:** plants a **thorn seed**: **20% SP nature every 2 s for 12 s** (120% SP), then bursts
  for **100% SP in a 4 m circle**. If the target dies with the seed on it, the seed jumps to the
  nearest enemy within 8 m with its remaining time.
* Statuses: ally `regen` aura; enemy `thornseed` (new, damage, nature).
* Looks: `projectile` nature (spiral + leaf trail), a sprout mesh on the target's head that grows over
  12 s; bloom = `heal()` + a pink petal burst; burst = `impact` nature, 4 m.
* Sound: a soft wooden *tock* on plant; a two-note chime on bloom; a dry crack on the thorn burst.

**`druid_bramblegrip` — Bramblegrip** · slot 4 · 5% mana · 15 s · instant · 30 m · ground circle **5 m**
* **80% SP** nature to every enemy inside, then **Rooted 3 s** (elites 1.5 s; bosses immune — they are
  **Slowed 20% for 4 s** instead). A root breaks early after the rooted enemy takes damage equal to
  150% SP.
* Statuses: `root` (spellfx `STATUS_FX.root`, vines at the feet), `slow`.
* Looks: `aoe` nature — brambles burst up from the ground ring, then curl around each ankle.
* Sound: creaking wood, a snap of thorns.

**`druid_greenswell` — Greenswell** · slot 10 · 6% mana · 12 s · 1.5 s cast · a wave **20 m long, 5 m wide**, moving at 10 m/s from you in the direction you face
* Every ally the wave passes: **220% SP** heal. Every enemy it passes: **60% SP** nature and pushed
  **2 m** along the wave (bosses are not pushed).
* Looks: a rolling knee-high wave of grass and flowers (`storm` nature driven along a line, leaf motes).
* Sound: rushing wind through tall grass, rising pitch.

**`druid_heartwood_ward` — Heartwood Ward** · slot 18 · 4% mana · 30 s · instant · 40 m · one ally (or self)
* For **8 s**: target's armour **+50%**, and **30% of the damage they take** is paid back to them as
  healing over the next 6 s.
* **The only caster spell castable in every form** (Bear casts it on itself or a friend; the bark
  looks the same on a bear).
* Status: `heartwood` (new, buff). Looks: `STATUS_FX.stoneskin`-style bark plates in brown-green.
* Sound: a deep wooden groan.

**`druid_elder_circle` — Circle of the Elder Grove** · slot 28 · 8% mana · 45 s · 2.0 s cast · 30 m · ground circle **8 m**, lasts **12 s**
* Allies inside: healed **30% SP per second** (360% SP over 12 s).
* **Shifting inside the circle costs no mana and no GCD.** This is the spell's real job: it is where a
  druid swaps from healer to tank and back during a tank-swap mechanic.
* Enemies that enter: **Rooted 2 s**, once per enemy per cast (bosses immune).
* Looks: a ring of 8 standing stones rising 1.5 m with moss (`pillar` nature at each stone), a green
  floor glow. Sound: low wooden drone, birdsong layered in.

**`druid_everbloom` — Everbloom** · slot 40 · 12% mana · 150 s · instant · self-centred, every ally within **30 m**, lasts **8 s**
* Instantly heals every ally **150% SP**, then **60% SP per second for 8 s** (480% SP).
* **Wild Pulse:** every shift you make while Everbloom lasts releases a 15 m pulse that heals
  **120% SP** and adds a form bonus: **Bear** — every enemy in 15 m is taunted 2 s ·
  **Cat** — allies deal +20% damage for 6 s · **Owl** — allies regain 3% mana · **Stag** — allies gain
  +30% move speed for 4 s.
* Looks: a tree of light grows from the druid (8 m tall), petals rain over 30 m (`storm` nature +
  `pillar` holy under the druid). Sound: an orchestral swell; each Wild Pulse a single struck bell.

---

## 4. Alternate spells — the four form bars

### 4.1 Forms and gear (applies to every form)

| Gear rule | Value |
|---|---|
| **Claw damage** | In Bear and Cat your basic attack and every form spell use **claw damage** = your main-hand weapon's **damage per second × the form's attack interval**. A slow staff and a fast sceptre with the same damage per second give the same claws. Bear attacks every **1.1 s**, Cat every **0.7 s**. |
| Attributes | In Bear/Cat, **INT counts as STR** for claw damage. DEX, CON and STR still count normally. |
| Affixes | Every affix keeps working (crit, crit damage, life steal on physical hits, attack speed, elemental damage added to claws as that element). Staff-only weapon **traits** (Farhold `WEAPON_TRAITS.quarterstaff.guard`, charged staff forms) do not apply in a form. |
| Spell power | Owl uses SP normally; Bear and Cat ignore SP except for Heartwood Ward. |
| Armour | Bear: gear armour **×2.5**. Cat and Stag: ×1.0. Owl: ×1.0 and takes **+10% physical damage**. |
| Health | Bear: **+40% max health**. Others unchanged. |
| Weapon look | Hidden. A weapon's element (a fire staff) tints the claw-swipe trail that element. |
| Uniques | A unique weapon's power works in form if it is written as "on hit" or "on kill"; powers that name a staff spell, a wand bolt or a charged attack do not. The tooltip says **"Works in forms"** or **"Caster form only"** under the power (page 08 must add this line). |

### 4.2 Bear form — the tank (Calling I, level 6)

Resource **Fury**: starts at **20** on entry (40 with Wild Heart), **+8 per basic hit**, **+1 per 1% of
max health lost to a hit**, decays 3 per second after 5 s out of combat. Threat from everything a bear
does is **×3**.

| Unlock | id | Name | Cost | CD | Cast | Shape | Effect |
|---|---|---|---|---|---|---|---|
| 6 | `druid_bear_maul` | Maul | generates 15 Fury | GCD | instant | 3.2 m, 90° arc | **140% WD** (claw), threat ×5 |
| 6 | `druid_bear_rending_swipe` | Rending Swipe | 20 Fury | 6 s | instant | 5 m, 180° cone | **90% WD** to all + Bleed 6 s (26% WD/s) |
| 6 | `druid_bear_earthshake_roar` | Earthshake Roar | 0 | 12 s | instant | 10 m circle | **Taunts** every enemy 3 s; they deal **15% less** damage for 8 s (`weaken`) |
| 6 | `druid_bear_ironbark_hide` | Ironbark Hide | 40 Fury | 20 s | instant, off GCD | self | **40% damage reduction for 6 s** |
| 18 | `druid_bear_bruin_rush` | Bruin Rush | 10 Fury | 15 s | instant | charge up to 20 m | 100% WD to target, **stuns 1 s** (non-boss); allies in the path are not moved |
| 28 | `druid_bear_deep_den` | Deep Den | 30 Fury | 90 s | channel up to 3 s | self | heals **30% max health** across the channel; you keep full threat; moving ends it |

Basic attack: a paw swipe 3.0 m, 90° arc, 100% WD, every 1.1 s.
Looks: Maul — `impact` physical + three claw streaks (`shadow_claw` sprite tinted bone white);
Swipe — a 180° arc of claw streaks + `bleed` drops; Roar — the `rear_roar` clip, a dust ring (`aoe`
physical) and a red shout ripple; Ironbark — brown bark plates (`barrier` aura, brown); Bruin Rush —
dust `footfall` every 0.3 s along the path; Deep Den — the bear curls up, `regen` aura, snoring zzz.
Sounds: layered bear growl samples pitched by `seed`; roar is the class's loudest sound (page 17 caps it).

### 4.3 Cat form — melee damage (Calling II, level 20)

Resource **Focus** 100, regenerates **12 per second**. **Combo points** 0–5, built by builders, spent by
finishers; a finisher's power is ×(points / 5). Attacks from **behind** a target (the rear 180°) deal
**+20%**. Move speed **+15%**.

| Unlock | id | Name | Cost | CD | Cast | Shape | Effect |
|---|---|---|---|---|---|---|---|
| 20 | `druid_cat_rake` | Rake | 35 Focus | GCD | instant | 2.6 m, one target | **80% WD** + Bleed **9 s** (35% WD/s) · +1 combo |
| 20 | `druid_cat_clawrip` | Clawrip | 40 Focus | GCD | instant | 2.6 m, one target | **160% WD** · +1 combo (+2 from behind) |
| 20 | `druid_cat_gutting_rend` | Gutting Rend | 25 Focus + all combo | GCD | instant | one target | finisher: Bleed lasting **4 s per combo point** (20 s at 5) for **45% WD per second**; recasting refreshes it, never stacks |
| 20 | `druid_cat_throatbite` | Throatbite | 30 Focus + all combo | GCD | instant | one target | finisher: **120% WD per point** (600% at 5); +50% on targets below 25% health |
| 28 | `druid_cat_prowl` | Prowl | 0 | 10 s (starts on leaving combat) | instant | self | **Stealth**: invisible to non-boss enemies beyond 4 m, move −30%; any attack breaks it; can only begin out of combat |
| 28 | `druid_cat_ambush_spring` | Ambush Spring | 40 Focus | 18 s | instant | leap 12 m, one target | 200% WD, **+2 combo**; from Prowl it also **stuns 2 s** (non-boss) |
| 40 | `druid_cat_ninefold_frenzy` | Ninefold Frenzy | 0 | 90 s | instant, off GCD | self | **12 s**: Focus regen ×2, every builder gives +1 extra combo, cat grows 15% and its eyes burn gold |

Looks: slashes are `shadow_claw` streaks in the druid's `accent` colour; bleeds use `STATUS_FX.bleed`;
Prowl drops the cat's opacity to 30% for others (15% for enemies) with a faint shimmer; Ambush Spring uses the
`pounce` clip. Sounds: hiss on Prowl, a snarl on finishers, soft paw thumps (quiet enough to be heard
only within 10 m — page 17).

### 4.4 Owl form — ranged sky caster (Calling III, level 40)

The owl **hovers 1.2 m above the ground** (visual only — you are still hit by every ground telegraph;
fairness comes first). Resource **Mana** plus **Moonsong** 0–100, built by owl spells, spent by
Moonfall. **+15% spell power**, **+10% physical damage taken**. Basic attack: **Feather Dart**, a bolt
every 1.0 s for 50% SP, 35 m.

| Unlock | id | Name | Cost | CD | Cast | Shape | Effect |
|---|---|---|---|---|---|---|---|
| 40 | `druid_owl_moonquill` | Moonquill | 2% | GCD | 1.0 s | bolt, 35 m | **130% SP** arcane · +10 Moonsong |
| 40 | `druid_owl_talon_gale` | Talon Gale | 4% | 10 s | instant | 10 m cone, 60° | **110% SP** nature, knock back 5 m (not bosses) · +15 Moonsong |
| 40 | `druid_owl_starseed` | Starseed | 5% | 12 s | instant, lands after 1.5 s | ground 35 m, 5 m circle | **200% SP** on landing + starlight ground 6 s at **20% SP/s** · +20 Moonsong |
| 40 | `druid_owl_nightwatch` | Nightwatch | 3% | 30 s | instant | one enemy, 30 m | Reveals stealth within 15 m of the target; target **Marked** 10 s (takes +15% from your spells); your next **3** Moonquills are instant |
| 40 | `druid_owl_silent_flight` | Silent Flight | 3% | 20 s | instant | glide 15 m | you glide 15 m in the direction you move, drop **50% of your threat** on every enemy |
| 40 | `druid_owl_moonfall` | Moonfall | 100 Moonsong | 30 s | channel 3 s | ground, 6 m circle under your target | **600% SP** across the channel (6 ticks of 100%); the owl rises 4 m and screeches |

Looks: Moonquill — `projectile` arcane recoloured silver-white with a feather trail; Starseed — a falling
star (`projectile` holy from 20 m above, `arc 0`), `impact` holy + a silver ring; Moonfall — `pillar`
holy recoloured moon-silver, radius 6 m, 3 s. Sound: soft hoots, a descending whistle on Starseed,
a choir-like hum on Moonfall.

### 4.5 Stag form — travel, swim and leap (Calling I, level 6; more at 20 and 40)

Resource Mana (spells are cheap). **+45% move speed out of combat, +20% in combat.** Entering combat
does not force you out. Basic attack: antler butt 2.5 m, 50% WD, every 1.3 s (it is not a fighting form).

| Unlock | id | Name | Cost | CD | Cast | Shape | Effect |
|---|---|---|---|---|---|---|---|
| 6 | `druid_stag_bound` | Bound | 1% | 8 s | instant | leap 12 m forward, 3 m high | clears gaps and walls up to 3 m; no fall damage for 3 s after |
| 6 | `druid_stag_antler_rush` | Antler Rush | 2% | 15 s | instant | charge 15 m, 2 m wide | first enemy hit: **150% WD** and flung 5 m aside; others in the path pushed 2 m (bosses: 150% WD only) |
| 20 | `druid_stag_riverhart` | Riverhart | passive + toggle | — / 60 s | instant | self / allies 10 m | **Passive:** in deep water the stag becomes the **Riverhart** swim form — swim speed ×2.5, never drowns, can dive 10 m. **Toggle "Ford":** allies within 10 m swim +40% faster for 20 s |
| 20 | `druid_stag_herdbearer` | Herdbearer | 2% | 30 s | instant | self | **Out of combat only** (see QUESTIONS.md C12): one **party member** within 5 m may ride you (they press **E** on the prompt). Passenger cannot attack or cast. Cannot be cast in combat; ends the moment you enter combat, leave Stag, or take a hit over 15% max health |
| 40 | `druid_stag_trackless_path` | Trackless Path | 5% | 180 s | instant | you + party within 20 m | **60 s**: +30% move speed out of combat, and enemies 3+ levels below you ignore you all |

Looks: Bound — `leap` clip, green `footfall` on take-off and landing; Riverhart — blue-green tint,
`swim` clip, bubbles from the mouth; Antler Rush — dust + a green streak; Trackless Path — the party's
footprints glow and fade (`footfall` nature). Sounds: hooves (surface-aware: grass, stone, snow), a
bugle call on Trackless Path.

Mount comparison: Stag is **slower than a mount out of combat** (page 07 owns mount speed: Riding I
at level 10 is +60%), but works in combat, in water and in dungeons where mounts are refused.

---

## 5. Rotation / how it plays

### 5.1 Solo (open world, levels 1–60)

* **1–5:** Seedbloom enemies from range, finish with the quarterstaff. Seedbloom yourself between pulls.
* **6–19:** pull with a thorn Seedbloom, shift to **Bear**, Maul/Rending Swipe the pack, Earthshake
  Roar if more than two hit you; shift out and Seedbloom yourself as it dies. Stag between quests.
* **20–39:** single targets in **Cat** (Rake → Clawrip ×3 → Gutting Rend, Throatbite to finish);
  packs in Bear; Bramblegrip a pack, then Cat the one that matters.
* **40–60:** open with Starseed + Moonquill as Owl while they close, Talon Gale the melee off you,
  Bear for the leftovers, Everbloom only for world bosses.

### 5.2 Dungeon (5 players)

* **Healer:** caster form 90% of the time. Seedbloom the tank, Greenswell the group after an area hit,
  Heartwood Ward on the tank before a big hit. When the tank dies: **Bear** at once (Earthshake Roar
  holds the room for 3 s while someone revives) — a dungeon wipe saved is the druid's signature play.
* **Tank:** Bear. Maul on the boss, Rending Swipe for packs, Ironbark Hide on the boss's big hits,
  Deep Den when healers are out of mana. Heartwood Ward on yourself is your second cooldown.
* **Damage:** Cat for single target, Owl for spread packs (Starseed + Talon Gale), Bramblegrip for
  crowd control on a runner.

### 5.3 Raid (10 / 20)

* A druid healer usually **plants Circle of the Elder Grove** where the raid will stack for the next
  mechanic, because shifting inside it is free — a healer-druid can become the off-tank for a tank
  swap and come back without spending anything.
* **Everbloom + shifting** is a raid cooldown: during 8 s, shift Bear → caster → Owl → caster to fire
  three Wild Pulses (taunt, +mana, heal) on top of the heal-over-time.

### 5.4 Boss mechanics (page 11 vocabulary)

| Mechanic | What a druid does |
|---|---|
| **Danger zone** | Stag's Bound (12 m) is the fastest escape in the class; Bear's Bruin Rush can also leave a zone if an enemy stands outside it. |
| **Void zone** | Greenswell heals everyone still crossing one; Bramblegrip can root adds inside a void zone. |
| **Soak** | Bear is the best soaker (+40% health, ×2.5 armour); Heartwood Ward on a soaker converts 30% of the soak into healing. |
| **Targeted** (yellow) | Silent Flight glides 15 m out of a group in one key. |
| **Tether** | Stag's Bound breaks a distance tether in one press. |
| **Knock-back into a pit** | Stag's no-fall-damage window after Bound and Owl's hover do **not** save you from a pit — page 11 death pits kill every form. |
| **"No shapes" phase** | Some bosses (page 11/13 may flag one, e.g. a silence room) force caster form. The Form Ring shows a red slash. |
| **Interrupts** | The druid has no dedicated interrupt. Bear's Bruin Rush stun and Cat's Ambush Spring stun stop a **non-boss** cast. |

---

## 6. Talents

Talent ids: `<spellid>_t<tier><a|b|c>`. Tiers open at **12 / 22 / 32 / 45**; one pick per tier per spell.
Each changes *what the spell does*.

### 6.1 Caster spells

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Seedbloom | 1 (12) | **Twin Seed** — the seed also plants on the nearest other ally/enemy within 8 m at 50% | **Deep Root** — lasts 18 s instead of 12, bloom unchanged | **Quickseed** — cast becomes instant, heal-over-time −20% |
| Seedbloom | 2 (22) | **Thorned Bloom** — an ally's bloom also deals 80% SP to enemies within 4 m of them | **Pollen** — the bloom heals everyone within 5 m for 40% SP | **Rootbound** — an enemy's thorn burst roots everything it hits 1.5 s |
| Seedbloom | 3 (32) | **Seedbank** — up to 3 seeds on one ally, each its own timer | **Wildgrowth** — when a seed blooms on an ally below 40% health, the bloom is ×2 | — |
| Seedbloom | 4 (45) | **Evergreen** — a seed that would expire on a full-health ally waits (up to 20 s) and blooms the moment they are hit | **Carrion Seed** — a thorn seed jumping on death also leaves a 4 m heal-over-time patch for allies (20% SP/s, 5 s) | **Shapeseed** — you can cast Seedbloom in Owl and Stag forms |
| Bramblegrip | 1 | **Thicket** — radius 5 → 8 m, root 3 → 2 s | **Snaring Line** — becomes a 16 m × 3 m line instead of a circle | — |
| Bramblegrip | 2 | **Strangler** — rooted enemies take 20% SP/s while rooted | **Brambleward** — allies inside the area gain 20% damage reduction for 4 s | **Pull Down** — flying enemies inside are pulled to the ground and can be hit by melee for 6 s |
| Bramblegrip | 3 | **Recurring** — the brambles stay 6 s and re-root anything entering once | **Grasping** — instead of a root, drags every enemy 4 m toward the centre (bosses immune) | — |
| Bramblegrip | 4 | **Old Growth** — a boss inside is **slowed 40%** instead of 20% and loses 10% attack speed for 6 s | **Briar Cage** — the edge becomes a wall: enemies cannot leave for 3 s (non-boss) | **Rooted Stance** — castable in Bear form, and a bear standing in it gains 20 Fury per second |
| Greenswell | 1 | **Riptide** — the wave comes **back** to you after 20 m (hits everything twice, each 60%) | **Broadswell** — wave 5 → 10 m wide, length 20 → 14 m | **Swift** — cast 1.5 s → instant |
| Greenswell | 2 | **Cleansing Swell** — removes one poison/disease/curse from each ally it passes | **Undertow** — enemies are pulled **toward** you 3 m instead of pushed | — |
| Greenswell | 3 | **Tidemark** — allies passed gain a 6 s shield of 60% SP | **Springtime** — each ally healed while below 50% resets 1 s of the cooldown (max 6 s) | **Seedwave** — plants a Seedbloom (heal part only) on the first 3 allies passed |
| Greenswell | 4 | **Verdant Flood** — the wave leaves 6 s of flowering ground along its path, 15% SP/s to allies | **Green Road** — allies passed move +40% for 4 s (a mechanic escape tool) | — |
| Heartwood Ward | 1 | **Graft** — also applies to you at 50% when cast on someone else | **Knotted** — +50% armour becomes 30% damage reduction (better against magic) | — |
| Heartwood Ward | 2 | **Sap Return** — 30% → 50% of damage returned as healing, armour bonus removed | **Splinter** — enemies that hit the target take 40% SP nature (max once per 0.5 s) | **Living Bark** — lasts 8 → 14 s, cooldown 30 → 45 s |
| Heartwood Ward | 3 | **Transplant** — when it ends, any healing still owed jumps to the lowest-health ally in 20 m | **Rootfast** — the target cannot be knocked back, pulled or stunned while it lasts | — |
| Heartwood Ward | 4 | **Ancient Bark** — if the target would die while warded, they drop to 1 health and the ward ends (once per cast) | **Hide & Bark** — cast on yourself in any form, it also gives the form's bonus: Bear +20 Fury, Cat +2 combo, Owl +30 Moonsong | **Grove Guard** — cast on the tank, also taunts nothing but **redirects 20%** of the tank's damage to you |
| Circle of the Elder Grove | 1 | **Wandering Circle** — the circle follows you at walking pace | **Stones of Warding** — the 8 stones block projectiles (each stone is a 1 m pillar) | — |
| Circle of the Elder Grove | 2 | **Fey Ring** — enemies inside take 25% SP/s and deal 10% less damage | **Shift-Song** — every shift inside heals everyone inside for 60% SP | **Wide Ring** — 8 → 12 m, heal −25% |
| Circle of the Elder Grove | 3 | **Druid's Rest** — mana regen ×3 inside for you | **Deep Roots** — allies inside cannot be knocked out of it (knockbacks stop at the edge) | — |
| Circle of the Elder Grove | 4 | **Moonwell** — at night the circle's heal is doubled, and Owl spells cast inside it cost no mana | **Standing Stones** — the circle becomes permanent until recast (cooldown 45 → 90 s, heal −40%) | **Grove Gate** — casting a second circle within 60 s links them: allies can step into one and appear at the other (once each, 3 s cooldown) |
| Everbloom | 1 | **Long Summer** — lasts 8 → 12 s | **Burst of Spring** — the 150% instant heal becomes 300%, heal-over-time −50% | — |
| Everbloom | 2 | **Wild Chorus** — Wild Pulses also go off when a **party druid** shifts (any druid, not only you) | **Heartbloom** — Wild Pulse heals 120% → 200% SP but only once per form | — |
| Everbloom | 3 | **Seedstorm** — plants a Seedbloom (heal) on every ally in range | **Wild Revival** — revives one dead ally in range at 30% health (once per cast) | **Rooted World** — enemies in 30 m are slowed 30% for the duration |
| Everbloom | 4 | **The Green Return** — for its duration every ally's heals received +20% | **Fourfold** — Wild Pulse gives **all four** form bonuses on every shift | — |

### 6.2 Hide talents (form bars)

Forms have their own tiers at the same levels (12/22/32/45), picked on the Talents screen under a
"Hides" tab. A tier is available once its form is unlocked (Owl's first three appear together at 40).
Ids: `druid_<form>_hide_t<tier><a|b|c>` (e.g. `druid_bear_hide_t4b` = Bear's Grace) — a form bar is
not one spell, so its talents hang on the form, not on a spell id.

| Form | Tier | a | b | c |
|---|---|---|---|---|
| Bear | 1 | **Thick Pelt** — +40% → +60% max health, move −10% | **Bloodied Maw** — Maul heals you 4% max health | **Honey Hunt** — Rending Swipe's bleed stacks up to 3 |
| Bear | 2 | **Unmoving** — Earthshake Roar also roots **you** and makes you immune to knockback 6 s | **Den Mother** — Ironbark Hide also covers allies within 6 m at 20% | — |
| Bear | 3 | **Hibernal** — Deep Den heals 30% → 50% and makes you immune to damage for its first 1 s | **Rage of the Wild** — every 20 Fury spent reduces Ironbark's cooldown by 1 s | **Grizzled** — Bruin Rush has 2 charges |
| Bear | 4 | **Old Bear** — below 30% health Maul costs nothing and hits 250% WD | **Bear's Grace** — you can cast **Seedbloom** (ally part) in Bear form for 30 Fury (`druid_bear_hide_t4b`) | — |
| Cat | 1 | **Stalker** — Prowl can be entered in combat once per 60 s | **Tiger's Teeth** — Rake bleed ticks can critically hit | — |
| Cat | 2 | **Bloodscent** — Clawrip on a bleeding target gives +1 extra combo | **Feline Grace** — Ambush Spring resets if the target dies within 3 s | **Shadowpaw** — your attacks from behind build 10 Focus |
| Cat | 3 | **Pack Instinct** — each finisher calls a spectral cat (`cat`, size 1.8, 50% opacity) that attacks for 6 s at 40% WD | **Ninth Life** — Throatbite killing a target returns 3 combo points | — |
| Cat | 4 | **Frenzied Pride** — Ninefold Frenzy also hits a second target for 60% of every attack | **Thousand Cuts** — Gutting Rend's bleed spreads to 2 enemies within 5 m when it ends | — |
| Owl | 1 | **Harvest Moon** — Moonquill cast 1.0 → 1.5 s, damage 130 → 210% SP | **Crescent** — Moonquill fires 3 quills in a 30° fan, each 55% | — |
| Owl | 2 | **Eclipse** — Starseed lands dark: 150% SP but silences non-bosses 3 s | **Falling Sky** — Starseed has 2 charges | **Gale Wing** — Talon Gale is a 360° ring of 8 m |
| Owl | 3 | **Full Moon** — Moonfall costs 60 Moonsong and you can move at half speed during it | **Night Hunter** — at night Moonsong builds ×1.5 | — |
| Owl | 4 | **Stellar Wake** — Silent Flight drops a Starseed where you started | **Hoot of Warning** — Nightwatch's Mark is shared: the whole party deals +8% to the target | — |
| Stag | 1 | **Long Bound** — Bound 12 → 18 m and you glide 3 s after landing | **Sure-Footed** — no slows while in Stag | — |
| Stag | 2 | **Herd Leader** — Herdbearer carries 2 passengers | **Salmon Leap** — Bound works out of water: a Riverhart can leap 8 m onto a bank or up a waterfall | — |
| Stag | 3 | **Hart's Blessing** — Antler Rush heals allies you pass for 60% SP | **Crown of Antlers** — Antler Rush roots the flung enemy 2 s | — |
| Stag | 4 | **White Hart** — Trackless Path also reveals gathering nodes and treasure within 60 m | **Wild Hunt** — Trackless Path works in combat: allies deal +10% damage but lose the "ignored" part | — |

---

## 7. Class sets

Every piece is `medium` armour (head, chest, hands, legs, feet) plus a weapon or off-hand. Bonuses stack
(6 pieces = 2 + 4 + 6 bonuses). Page 09 lists these in its class-set index.

### 7.1 `set_druid_grovekeepers_vestments` — Grovekeeper's Vestments (healer, levelling)

Drops level 25–30: one piece each from the bosses of `d07_thornheart` (head, hands, staff `it_grovekeepers_crook`)
and `d08_moonwell_ruins` (chest, legs, feet); Heroic versions at 60 from the same bosses.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Seedbloom's bloom also plants a new seed at 50% strength (once) | Seedbloom |
| 4 | Greenswell leaves a 3 m heal-over-time patch where it passes each ally (20% SP/s, 4 s) | Greenswell |
| 6 | Circle of the Elder Grove casts **instantly** and each shift inside also blooms every Seedbloom inside | Elder Circle, Seedbloom |

### 7.2 `set_druid_hide_of_many` — Hide of Many (forms, raid)

Drops from `r02_glacier_throne` (level 42, Normal; Mythic at 60): one piece per boss 1–6.
**This set is the forms set** — each bonus changes one form.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | **Bear:** Maul has a 25% chance to reset Rending Swipe; the bear grows white frost-tipped fur | Bear bar |
| 4 | **Cat:** finishers at 5 combo refund 2 combo; the cat gets striped markings | Cat bar |
| 6 | **Owl & Stag:** entering Owl from Stag (or Stag from Owl) is free and grants a 4 s **Skybound** window where Moonquill is instant and Bound is 20 m | Owl + Stag bars |

### 7.3 `set_druid_elderhorn_regalia` — Elderhorn Regalia (endgame, all roles)

Drops from `r04_ember_court` (level 60, Normal/Mythic).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wild Heart (Calling III) lasts 6 → 10 s | the mechanic |
| 4 | Everbloom's cooldown drops 5 s every time you shift (max 60 s per Everbloom) | Everbloom |
| 6 | **Elder Shape:** the first shift after Everbloom turns you into an **Elderhorn** for 15 s — a stag of `elk` type (size 1.8, glowing antlers) that has **both** the Bear bar's Earthshake Roar/Ironbark Hide and the caster's Seedbloom/Greenswell on keys 1–4 | a unique hybrid bar |

---

## 8. Class legendaries and uniques

Legendaries roll normal affixes plus a fixed power (page 08 owns the legendary model).

| id | Name | Slot / base | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_pelt_of_the_first_winter` | Pelt of the First Winter | chest, medium | **Bear:** Maul critical hits give a shield of **10% max health** (8 s, max 30%). Your bear is white. | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss, Heroic/Mythic+) and `b_standing_ruin` The Standing Ruin (Frostmantle world boss) |
| `leg_the_ninth_life` | The Ninth Life | necklace | Once per **120 s**, damage that would kill you in any animal form instead knocks you into caster form at **30% health** and roots every enemy within 6 m for 2 s | `b_pearl_twins` The Pearl Twins (`r03_sunken_choir` boss 5) |
| `leg_seedkeepers_crook` | Seedkeeper's Crook | staff | Seedbloom may be on **3 allies at once** from one cast; a bloom jumps its remaining heal-over-time to the lowest ally within 15 m | `b_oruvel_moon_drinker` Oruvel, That Which Drank the Moon (`d08_moonwell_ruins` end boss, Heroic/Mythic+) |
| `leg_moonfeather_mantle` | Moonfeather Mantle | head, medium | **Owl:** every 40 Moonsong built drops a Starseed on your current target for 100% SP; Moonfall can be channelled while moving at full speed | `b_vaelkyr_emberwing` Vaelkyr, the Emberwing Consort (`r04_ember_court` boss 6) |
| `leg_crown_of_the_long_road` | Crown of the Long Road | head, medium | **Stag:** Herdbearer carries 2; each Bound heals you and your passengers **5% max health**; Trackless Path cooldown 180 → 90 s | `b_hungering_brood` The Hungering Brood (Whisperwood world boss) |
| `leg_heart_of_the_wildwood` | Heart of the Wildwood | ring | Each different form you have entered in the last **20 s** gives **+6%** damage and healing (max +24% with 4 forms) | `b_marchheart` The Marchheart, the Wildmarch Dreaming (`r05_veilspire` secret boss) |

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_thornheart_splinter` | Thornheart Splinter | sceptre | +8 INT, +6% spell power | Bramblegrip's roots deal **30% SP per second** | `b_rakka_bloodbriar` Rakka Bloodbriar (`d07_thornheart` sub-boss) |
| `uq_barkskin_wraps` | Barkskin Wraps | hands, medium | +8 CON, +40 armour | Heartwood Ward's cooldown 30 → 20 s when cast on yourself | `b_foreman_grubnik` Foreman Grubnik (`d03_deepdelve` first sub-boss) |
| `uq_hollow_horn` | Hollow Horn | off-hand focus (reuse: `foci.js` `effigy` model `idol`, new look `horn`) | +6 INT, +10% move | Blowing it (Stag, **Antler Rush**) also pushes every enemy in 8 m back 4 m | rare elite in `sunscar` (page 10 names it) |
| `uq_mossback_greaves` | Mossback Greaves | legs, medium | +10 CON, +5% dodge | In Bear form, standing still for 2 s gives 10% damage reduction (lost on moving) | `b_king_sethar_unshattered` King Sethar the Unshattered (`d05_glass_tombs` end boss) |

---

## 9. Voice and barks

* **Voice:** `voiceFor({ role: 'druid', gender, seed })` (reuse: `shared/voices.js`, pitch 0.52, depth
  0.55, tone 0.55, breath 0.3). In animal forms the voice is **replaced by the creature's sounds** —
  a druid does not talk as a bear; barks become growls/hisses/hoots through `sfx`.
* **Speech:** Lingo speaker with tone tags `calm`, `wild` (reuse: `lingo/`).

| Moment | Caster-form lines (examples; Lingo pool `druid_*`) |
|---|---|
| Cast heal | "Grow." · "Take root." · "The grove remembers you." |
| Critical heal | "Bloom!" · "Spring comes early." |
| Low health | "The roots are thin here…" · "I need to change." |
| Shift to Bear | (growl) — caster line first: "Hide of the bear!" |
| Shift to Cat | "Quiet feet." (then a hiss) |
| Shift to Owl | "Eyes above." (then a hoot) |
| Shift to Stag | "Run with me." (then a bugle) |
| Tank died | "I'll hold them — shifting!" |
| Everbloom | "Everything that grows — wake!" |

---

## 10. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Body models | `avatar-3d/js/creatures.js`, `creature-types.js` types `bear`, `cat`, `owl`, `deer`, `elk` | forms (§2.5); colours from the druid |
| Visual of Seedbloom / Greenswell | Farhold `renew` (holy regen) and `mend` — look only | recoloured nature |
| Bramblegrip visual | Farhold `frost_nova` ring timing (Emberveil's `entangle` idea) | nature brambles instead of ice |
| Bear bleed / claws | Farhold `STATUS_FX.bleed`, `shadow_claw` sprite | tinted |
| Owl Starseed | Farhold `meteor` ("Fallstone") falling-body timing | smaller, silver |
| Stag footfalls | `spellfx.footfall` (Farhold R25 `ember_stride` trail) | nature element |
| Outfit | `avatar-3d/data/class-outfits.json` `druid` (wolf_helm, fur_tunic, herb_satchel, staff_crook) | caster look |
| Voice | `shared/voices.js` `ROLE_VOICES.druid` | as is |
| Not used | Farhold druid skills `poison_dart`, `call_wolf`, `frost_nova`, `stoneskin`, `rally` and pet `grove_wolf` | the forms replace a summoned pet; `grove_wolf` could be a Cat T3 variant later |
| Emberveil ideas | `rejuvenation` → Seedbloom, `entangle` → Bramblegrip, `wild_shape` → the whole mechanic, `natures_wrath` → dropped | ideas only, numbers new |
| New work | creature clips `rear_roar`, `prowl`, `pounce`, `hover`, `leap`, `swim`; form pre-build + swap; Form Ring; per-form resource bars; new statuses `thornseed`, `heartwood` (page 05) | (new) |
