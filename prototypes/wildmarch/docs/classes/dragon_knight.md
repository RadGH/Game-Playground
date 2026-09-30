# Class: Dragon Knight (`dragon_knight`)

> *"The blood chose the element. I only chose when to let it out."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 14.
**Status:** v0.1 draft, 2026-09-29. Documentation only — nothing is built.

### How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the equipped main-hand weapon, before armour (Farhold `rpg.strike` base). In Dragon Form WD becomes **claw damage** (§4.2). |
| **SP** | Spell power (page 05). The Dragon Knight scales on WD only; aspect elemental damage is WD dealt as that element. |
| **Fury** | 0–100. Builds by hitting and being hit, decays 3/s after 5 s out of combat (canon resource). |
| **Wyrmblood** | the class gauge, 0–100 (§2). |
| **GCD** | Global cooldown, **1.0 s** after any spell (proposed; page 05 owns it). |
| **Slot level** | 1 / 4 / 10 / 18 / 28 / 40. Talents 12 / 22 / 32 / 45. Callings 6 / 20 / 40. |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A knight with a dragon's blood in the veins, who picks one of three elder breaths — fire, ice or storm — and at the height of power sheds the armour for scales and becomes the drake. |
| Roles | **Damage** (two-hander) · **Tank** (one-hander + shield). The weapon decides the role; nothing else has to change. |
| Armour | Heavy |
| Weapons | Two-handed sword, two-handed axe, greatsword, greataxe **or** longsword / one-hand axe + shield. Starter: **Squire's Longsword + Kite Shield** (reuse Farhold `startingEquipment` longsword + shield). |
| Primary attribute | STR (CON for tanks) |
| Resource | **Fury** + the **Wyrmblood** gauge |
| Companion | None. At level 40 the knight *is* the dragon. |
| Playstyle | Pick an aspect, stamp it on everything with every swing, fill Wyrmblood by spending Fury, then burst: Scale Surge (6–39) or Dragon Form (40+). A shield turns the two defensive spells into taunts. |

---

## 2. Class mechanic: **Draconic Aspect** and **Wyrmblood**

### 2.1 The three aspects

The knight holds **one aspect** at a time. It colours every weapon hit and adds a **rider** (an extra
effect) to every spell (§3.3 table).

| Aspect | id | Colour | Every weapon hit | Rider status | Passive |
|---|---|---|---|---|---|
| **Emberscale** (fire) | `aspect_fire` | red-gold | +15% WD as fire | **Burn** 5 s, 20% WD per second (reuse Farhold status `burn`) | +10% damage vs burning enemies |
| **Rimescale** (ice) | `aspect_ice` | white-blue | +15% WD as ice | **Chill** 4 s, slowed 45% (reuse `chill`) | +10% armour |
| **Thunderscale** (storm) | `aspect_storm` | slate + yellow | +15% WD as lightning | **Static Scale** (new) 5 s: next hit on it chains 60% WD to one more enemy within 6 m | +8% attack speed |

Visuals: the knight's weapon glows its aspect (`spellfx` element `fire` / `ice` / `lightning` trail on
every swing); the `dragon_helm` crest recolours; the tabard (`decor: tabard`) takes the aspect colour.

### 2.2 Wyrmblood gauge

* **+1 Wyrmblood per 1 Fury spent** on a spell. **+5** whenever an aspect rider is applied to an elite
  or boss. Does not decay in combat; decays 2/s after 10 s out of combat.
* **UI:** a horizontal **serpent-shaped bar** under the Fury bar — 100 scales that light from tail to
  head in the aspect colour. At 100 the head opens its jaws and glows, with a heartbeat thump (sfx
  `ui_ready`). Page 03 owns placement (`scr_hud`).

### 2.3 Spending it — class mechanic key

The class key is **`Z`** (proposed, shared class-mechanic key; page 02 owns it). Aspect choice is
**Shift+Z** (a three-wedge ring).

| From | At 100 Wyrmblood, `Z` does | Duration |
|---|---|---|
| Calling I (6) | **Scale Surge** — every aspect rider is **doubled** (Burn 40% WD/s, Chill 70%, Static Scale chains to 2), weapon hits +25% as the element | 8 s |
| Calling III (40) | **Dragon Form** (replaces Scale Surge) — the knight becomes a drake with its own bar (§4) | 20 s (drains 5 Wyrmblood/s) |

### 2.4 The calling quests (page 14 owns the text; ids proposed)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_dragon_knight_calling_first_blood` | **The First Blood** | Hearthvale — a sealed dragon bone under the Brightwater mill; touch the bone, survive three waves as it tests which element you answer to | Choose your **first aspect**; swap only **out of combat** (5 s kneel at any shrine or campfire) · **Wyrmblood** and **Scale Surge** |
| 20 | `q_dragon_knight_calling_three_breaths` | **The Three Breaths** | Sunscar — find the three shed scales in the Glass Tombs region (one per aspect); each is a short trial fought in that aspect | All three aspects; **swap in combat** with Shift+Z, **20 s cooldown**, off GCD. Swapping releases **Shedding Scales**: a 4 m burst of **150% WD** in the *new* element and 20% damage reduction for 3 s |
| 40 | `q_dragon_knight_calling_wyrmheart` | **The Wyrmheart** | Frostmantle — a solo fight on a glacier ledge against the dragon ghost whose blood you carry (it uses your aspect against you) | **Dragon Form** |

### 2.5 JSON shape

```json
{
  "id": "dragon_knight",
  "aspects": ["aspect_fire", "aspect_ice", "aspect_storm"],
  "wyrmblood": { "max": 100, "perFury": 1, "perEliteRider": 5, "decayOutOfCombat": 2 },
  "surge": { "seconds": 8, "riderMult": 2, "elementShare": 0.25 },
  "dragonForm": { "creature": { "type": "drake", "size": 2.4 }, "drainPerSecond": 5,
                  "stats": { "maxHpPct": 50, "armourMult": 1.5, "attackEvery": 1.3 } },
  "swap": { "cooldown": 20, "burstWD": 1.5, "radius": 4 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Cost | CD | Cast | Range | Shape | Does |
|---|---|---|---|---|---|---|---|---|
| 1 | `dragon_knight_wyrmfang_strike` | Wyrmfang Strike | +20 Fury | 4 s | instant | melee | 3.6 m, 100° arc | 150% WD + rider; the Fury builder |
| 4 | `dragon_knight_drakeleap` | Drakeleap | +10 Fury | 12 s | instant | 15 m | leap, 3 m landing circle | 120% WD + aspect landing effect |
| 10 | `dragon_knight_elder_breath` | Breath of the Elders | 40 Fury | 10 s | channel 1.5 s | 8 m | cone 70° | 300% WD over 5 ticks, aspect element |
| 18 | `dragon_knight_scalebound` | Scalebound | 30 Fury | 30 s | instant, off GCD | self | self (+8 m taunt with a shield) | 35% damage reduction 6 s |
| 28 | `dragon_knight_wyrmcoil_sweep` | Wyrmcoil Sweep | 35 Fury | 12 s | instant | melee | 5 m circle | 200% WD, knock back 4 m |
| 40 | `dragon_knight_wyrmfall` | Wyrmfall | 60 Fury | 45 s | 1.2 s airborne | 25 m | ground, 6 m circle | 450% WD + 6 s aspect field |

### 3.2 Details

**`dragon_knight_wyrmfang_strike` — Wyrmfang Strike** · slot 1 · generates **20 Fury** · 4 s · instant · 3.6 m, 100° arc
* **150% WD** to everything in the arc, applies the aspect rider to the first enemy hit (all enemies
  hit during Scale Surge).
* Looks: the weapon trails the aspect element, three fang-shaped slashes (`impact` in aspect element,
  `shadow_claw` sprite recoloured). Sound: a heavy swing + a dragon hiss layered at −12 dB.

**`dragon_knight_drakeleap` — Drakeleap** · slot 4 · generates **10 Fury** · 12 s · instant · leap up to **15 m** to a ground point or enemy
* Lands for **120% WD** in a **3 m** circle, then the aspect landing:
  **Fire** — the circle burns 4 s, 30% WD per second · **Ice** — everything hit **Rooted 1.5 s**
  (bosses: Chilled) · **Storm** — everything hit **Stunned 0.75 s** (bosses immune).
* Looks: a 0.6 s arc through the air with a wing-shaped trail of the element; `aoe` on landing.
  Sound: whoosh up, a crunch + element sting on landing.

**`dragon_knight_elder_breath` — Breath of the Elders** · slot 10 · **40 Fury** · 10 s · channel **1.5 s** (you can turn 90° per second, not move) · cone **8 m, 70°**
* **5 ticks × 60% WD** (300% WD) as the aspect element; each tick re-applies the rider.
* Looks: `spellfx.breath({ element, length: 8, arc: 1.22 })` from the helm's mouth guard — fire cone,
  ice shard stream, or a forked lightning fan. Sound: a roar that rises into the element (crackle /
  crystal hiss / thunder crack).

**`dragon_knight_scalebound` — Scalebound** · slot 18 · **30 Fury** · 30 s · instant, **off GCD** · self
* **6 s: 35% less damage taken**, and **60% resistance** to your current aspect's element.
* **With a shield equipped:** also **taunts** every enemy within **8 m** for 3 s.
* Looks: plate scales ripple over the armour (`STATUS_FX.barrier` recoloured to the aspect).
  Sound: the scrape of scales closing.

**`dragon_knight_wyrmcoil_sweep` — Wyrmcoil Sweep** · slot 28 · **35 Fury** · 12 s · instant · **5 m** circle
* **200% WD** to all, knocked back **4 m** (bosses and elites are not moved), rider on all.
* Looks: a full 360° spin with a coiling serpent of element around the knight (`vortex` in the aspect
  element, reversed so it throws outward, 0.5 s). Sound: the spin whoosh + a tail-lash crack.

**`dragon_knight_wyrmfall` — Wyrmfall** · slot 40 · **60 Fury** · 45 s · you leap **1.2 s** into the air · target ground within **25 m** · **6 m** circle
* While airborne (1.2 s) you **cannot be hit by ground effects** (danger/void zones, ground waves).
  Direct hits and room-wide casts still hit you.
* Lands for **450% WD**, then a **6 s aspect field** (6 m): Fire 40% WD per second · Ice slows 50% and
  allies inside take 10% less damage · Storm strikes a random enemy inside every 1 s for 60% WD.
* **+30 Wyrmblood.**
* Looks: the knight rises with spread wing-shapes of light, then falls as a burning / frozen /
  lightning comet (`projectile` from above + `aoe` + a ground ring). Sound: a dragon's scream on the
  way down, a ground-shaking thump (camera shake, reuse Farhold `combat-feel.js`).

### 3.3 Aspect rider table (what each spell does per aspect)

| Spell | Emberscale (fire) | Rimescale (ice) | Thunderscale (storm) |
|---|---|---|---|
| Wyrmfang Strike | Burn 5 s | Chill 4 s | Static Scale |
| Drakeleap | burning circle 4 s | root 1.5 s | stun 0.75 s |
| Breath of the Elders | Burn refreshed each tick | each tick +1 Chill stack, at 4 stacks **Frozen** 2 s (non-boss) | each tick arcs to 1 extra enemy outside the cone within 4 m |
| Scalebound | attackers take 30% WD fire (once per 0.5 s) | +20% extra armour | 20% chance a hit on you chains 80% WD back |
| Wyrmcoil Sweep | leaves a 5 m burning ring 3 s | knocked-back enemies are Chilled | knocked-back enemies are Shocked (+10% damage taken from you) 5 s |
| Wyrmfall | 40% WD/s field | slow 50% + ally −10% damage taken | a strike per second |

---

## 4. Alternate spells — Dragon Form (Calling III, level 40)

### 4.1 The transformation

| Rule | Value |
|---|---|
| Trigger | `Z` at 100 Wyrmblood. Instant, off GCD. |
| Duration | 20 s (Wyrmblood drains 5/s); `Z` again ends it early and keeps what is left. |
| Body | Chibi 2 hidden; a **`drake`** creature (reuse `creature-types.js`: horns, spikes, fangs) at **size 2.4** (≈2.6 m long). With the 6-piece Wyrmlord set or `leg_heart_of_the_ember_wyrm` it becomes the winged **`dragon`** type at size 1.6. Colours by aspect: fire `#8a2a2a`/`#e0b070`, ice `#d8ecf8`/`#6aa0d0`, storm `#3a4250`/`#ffe860`. Pre-built at login (avoids the shader stall). |
| Hitbox | Unchanged — the knight's capsule. Only the drawing grows. |
| Stats | +50% max health (health kept as a %), gear armour ×1.5, **immune to knockback and stun**, Fury generation ×1.5 |
| Basic attack | Claw rake every **1.3 s**, 3.5 m, 120° arc, **claw damage** = your weapon's damage per second × 1.3 |
| Gear | Weapon and shield hidden. A shield's block value becomes armour. Affixes all work. |
| Tank | With a shield equipped when you shifted, threat ×2.5 in Dragon Form. |
| Blocked | No potions, no mounting, no interacting with objects (the "E" prompt reads "Not as a dragon"). |

### 4.2 The Dragon Form bar

| Key | id | Name | Cost | CD | Cast | Shape | Effect |
|---|---|---|---|---|---|---|---|
| 1 | `dragon_knight_wyrm_rend` | Wyrm Rend | +20 Fury | 3 s | instant | 4 m, 120° arc | **200% WD** + rider |
| 2 | `dragon_knight_wyrm_deluge` | Deluge of the Wyrm | 40 Fury | 10 s | channel 2 s | cone **14 m, 60°** | **8 ticks × 70% WD** (560% WD) in the aspect element |
| 3 | `dragon_knight_wyrm_tailsmash` | Tailsmash | 20 Fury | 8 s | instant | **behind** you, 6 m, 120° | **180% WD**, knock back 6 m (non-boss) — clears adds off the healer |
| 4 | `dragon_knight_wyrm_wingbeat` | Wingbeat | 25 Fury | 15 s | instant | 8 m ring | **120% WD**, knock back 6 m; allies inside gain +20% move 4 s |
| 5 | `dragon_knight_wyrm_dominion` | Roar of Dominion | 0 | once per Dragon Form | instant | 15 m | non-boss enemies **Feared 3 s**; bosses deal **15% less** damage 8 s; allies +10% damage 8 s |
| 6 | `dragon_knight_wyrm_return` | Return to Steel | 0 | — | instant | self | ends Dragon Form early; releases a **Shedding Scales** burst (150% WD, 4 m) |

Clips: idle, walk, run, attack (Wyrm Rend), talk (Roar), dead (reuse); **new**: `breath` (head low,
jaw open, 2 s loop), `tail_swipe` (0.5 s spin of the hind body), `wing_beat` (dragon type only; drake
rears up and stamps instead).
Sound: the drake's footsteps shake the camera 0.1 s; the Deluge is the class's loudest sound.

---

## 5. Rotation / how it plays

### 5.1 Solo
Drakeleap in, Wyrmfang Strike on cooldown, Wyrmcoil Sweep when three or more are close, Breath when
Fury passes 40. Keep **Emberscale** for packs (burns while you move on), **Rimescale** when you are
losing (slows and armour), **Thunderscale** for single big targets (chains to the adds). Scale Surge
or Dragon Form on the elite of every pull.

### 5.2 Dungeon
* **Tank (shield):** Drakeleap into the pack, Wyrmcoil Sweep to gather threat, Scalebound as the
  area taunt, Rimescale for the armour. Dragon Form on the boss's hardest phase (knockback immunity).
* **Damage (two-hander):** Thunderscale on bosses, Emberscale for trash. Save Wyrmblood for the burn
  phase.

### 5.3 Raid
Scale Surge / Dragon Form is a 20 s personal cooldown timed with the raid's damage window. The aspect
swap (from 20) is a **mechanic tool**: swap to the element a boss's next cast uses, then Scalebound for
60% resistance to it (page 13 flags which bosses cast an element).

### 5.4 Boss mechanics

| Mechanic | Dragon Knight answer |
|---|---|
| **Danger zone** | Drakeleap (15 m) out; Wyrmfall's 1.2 s airborne dodges a danger zone that resolves while you are up. |
| **Void zone** | Wyrmfall's airborne window **does not** protect from a void zone you land in. Land outside. |
| **Soak** | Dragon Form's +50% health and stun immunity make the knight a strong soaker; Scalebound 60% element resistance if the soak is elemental. |
| **Moving wave / knockback** | Dragon Form is immune to knockback. |
| **Tank swap** | Scalebound's shield taunt picks up a whole pack; Roar of Dominion's −15% boss damage is a swap-safety window. |
| **Interrupts** | Drakeleap's storm stun (0.75 s) interrupts a non-boss cast. No boss interrupt (by design — page 11). |

---

## 6. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers at 12 / 22 / 32 / 45.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Wyrmfang Strike | 1 | **Twin Fangs** — strikes twice (2 × 90% WD), rider on both | **Long Fang** — becomes a 6 m × 1.5 m thrust line | — |
| Wyrmfang Strike | 2 | **Bloodletting** — +5 Wyrmblood per hit on a target with your rider | **Scale Guard** — each hit gives 5% damage reduction for 4 s, stacks 3 | **Rending** — lowers armour of targets hit 10% for 6 s |
| Wyrmfang Strike | 3 | **Hungry Blade** — resets its cooldown when it kills | **Brood Call** — 20% chance to strike again as a spectral drake head (100% WD) | — |
| Wyrmfang Strike | 4 | **Elder Fang** — during Scale Surge / Dragon Form it has no cooldown | **Tri-Fang** — applies the riders of **all three** aspects at 50% | — |
| Drakeleap | 1 | **Twin Leap** — 2 charges | **Soaring** — range 15 → 25 m | — |
| Drakeleap | 2 | **Guardian Leap** — leap to an **ally**: they take 30% less damage 4 s | **Crater** — landing radius 3 → 6 m, damage −25% | **Talon Grab** — pulls the target 3 m toward your landing point (non-boss) |
| Drakeleap | 3 | **Aftershock** — a second landing burst 1 s later for 80% WD | **Up and Away** — press again within 3 s to leap back to where you started | — |
| Drakeleap | 4 | **Kingswoop** — the leap path itself deals 100% WD to everything under it | **Scaled Landing** — landing gives Scalebound for 2 s | — |
| Breath of the Elders | 1 | **Long Breath** — 8 → 13 m, cone 70° → 40° | **Wide Breath** — cone 70° → 120°, length 8 → 6 m | **Short Breath** — instant, 3 ticks at 80% |
| Breath of the Elders | 2 | **Scorched Earth** — leaves ground of the element under the cone 4 s (fire 25% WD/s, ice slow, storm strikes) | **Inhale** — pulls enemies 3 m toward you before the first tick | — |
| Breath of the Elders | 3 | **Walking Breath** — you can move at 50% speed while breathing | **Wyrmtongue** — each tick that hits an elite/boss refunds 3 Fury | — |
| Breath of the Elders | 4 | **Chromatic** — ticks cycle fire → ice → storm, applying each rider in turn | **Endless Maw** — channel extends by 0.3 s per enemy killed during it (max +1.5 s) | — |
| Scalebound | 1 | **Hardened** — 35% → 50% reduction, 6 → 4 s | **Long Scales** — 6 → 10 s, 35% → 25% | — |
| Scalebound | 2 | **Scaled Ally** — also on one ally within 10 m at half strength | **Mirror Scale** — reflects the first spell cast on you back at its caster (non-boss) | **Molten Hide** — with a shield the taunt range 8 → 12 m |
| Scalebound | 3 | **Last Scale** — below 25% health casts itself for free (once per 90 s) | **Wyrm Guard** — damage absorbed fills Wyrmblood: 1 per 2% max health prevented | — |
| Scalebound | 4 | **Brood Wall** — becomes a 6 m dome for the group: 20% damage reduction for everyone inside | **Unyielding** — also grants stun and knockback immunity for its duration | — |
| Wyrmcoil Sweep | 1 | **Double Coil** — spins twice, second at 60% | **Pulling Coil** — pulls enemies **in** 3 m instead of knocking back | — |
| Wyrmcoil Sweep | 2 | **Coil Ward** — each enemy hit gives 4% max health shield (max 20%) | **Tail Lash** — enemies behind you take +50% | **Scale Shrapnel** — throws 6 scales outward, 10 m, 60% WD each |
| Wyrmcoil Sweep | 3 | **Sweeping Wind** — travel 6 m forward while spinning | **Threatening Coil** — generates threat ×4 (tank pick) | — |
| Wyrmcoil Sweep | 4 | **Serpent Ring** — leaves a spinning ring 6 s that repeats 40% WD every 1 s | **Worldcoil** — radius 5 → 9 m, knockback removed | — |
| Wyrmfall | 1 | **Double Fall** — you bounce once, landing a second 3 m circle 8 m further for 200% WD | **Guarded Descent** — land as a shield dome: allies within 6 m take 30% less damage 4 s | — |
| Wyrmfall | 2 | **Lingering Sky** — airborne 1.2 → 2.0 s | **Heavy Fall** — +50% damage, no field | **Dragon's Wake** — the field follows you for its 6 s |
| Wyrmfall | 3 | **Brood Rain** — during the fall, 5 smaller comets strike random enemies within 12 m for 100% WD | **Fall Into Form** — if Wyrmblood reaches 100 from its +30, you land already in Dragon Form | — |
| Wyrmfall | 4 | **Aspect Storm** — the field is all three aspects at once | **Kingsfall** — cooldown 45 → 30 s, damage −20% | — |

### 6.1 Dragon Form talents (a "Wyrm" tab; ids `dragon_knight_wyrm_hide_t<tier><a|b|c>`)

| Tier | a | b | c |
|---|---|---|---|
| 1 (12, active from 40) | **Long Blood** — drain 5 → 4/s (25 s form) | **Broad Wings** — Wingbeat radius 8 → 12 m | — |
| 2 (22) | **Brood Mother** — entering Dragon Form summons 2 whelps (`drake` size 0.8) for the duration, each 40% WD | **Hoard Guard** — each enemy killed in form adds 1 s | — |
| 3 (32) | **Deluge Walk** — move at 50% during Deluge of the Wyrm | **Roar Twice** — Roar of Dominion usable twice per form | — |
| 4 (45) | **Sky Wyrm** — the form becomes the winged `dragon` type and Wingbeat lifts you 3 m for 1.5 s (ground effects miss you while up) | **Iron Wyrm** — form grants 20% damage reduction, Deluge −30% | — |

---

## 7. Class sets

Heavy armour pieces (head, chest, hands, legs, feet) + a weapon or shield.

### 7.1 `set_dragon_knight_brood_scale` — Brood-Scale Harness (levelling, 31–39)

Drops from `d09_warmasters_pit` (head, hands, feet) and `d10_rimefang_caverns` (chest, legs, shield
`it_broodscale_kite`); Heroic versions at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wyrmfang Strike applies the rider to **every** enemy hit, not only the first | Wyrmfang Strike |
| 4 | Drakeleap's landing refunds **15 Fury** per enemy hit (max 45) | Drakeleap |
| 6 | Breath of the Elders fires **twice** (a second breath 0.5 s after, 60%) | Breath |

### 7.2 `set_dragon_knight_wyrmlord_plate` — Wyrmlord Plate (endgame)

Drops from `r04_ember_court` (level 60, Normal/Mythic), one piece per boss 1–6.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aspect swap cooldown 20 → 10 s and the Shedding Scales burst is 150% → 300% WD | the mechanic |
| 4 | Wyrmfall fills Wyrmblood +30 → +60 | Wyrmfall |
| 6 | Dragon Form is the **winged dragon**; Deluge of the Wyrm becomes a **line** you sweep 20 m across the field (you rise 3 m during it) | Dragon Form bar |

---

## 8. Legendaries and uniques

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_heart_of_the_ember_wyrm` | Heart of the Ember Wyrm | chest, heavy | Dragon Form lasts **+8 s** and you are the winged dragon; in **Emberscale**, Deluge leaves molten ground 6 s (40% WD/s) | Emberthrone world boss |
| `leg_rimefang_greathelm` | Rimefang Greathelm | head, heavy | **Rimescale:** enemies Frozen by your breath shatter for 200% WD in 4 m when struck; Scalebound gives +1 Chill stack to everything that hits you | final boss of `d10_rimefang_caverns` (Heroic/Mythic+) |
| `leg_stormcrest_gauntlets` | Stormcrest Gauntlets | hands, heavy | **Thunderscale:** Static Scale chains up to **4** times (each 70%) and each chain adds 1 Wyrmblood | `r03_sunken_choir` boss 4 |
| `leg_triune_scale` | The Triune Scale | necklace | After an aspect swap the **old aspect's rider stays for 8 s** — two aspects at once | `r02_glacier_throne` secret boss |
| `leg_old_kings_tooth` | The Old King's Tooth | greataxe | Every 5th weapon hit is a **free Breath of the Elders** (3 ticks, no Fury) | final boss of `d13_cindergate` (Heroic/Mythic+) |

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_whelpscale_buckler` | Whelpscale Buckler | shield | +8 CON, +60 armour | Scalebound's taunt also Chills/Burns/Shocks every taunted enemy | `d04_bellows_keep` final boss |
| `uq_cinderhorn_greataxe` | Cinderhorn | greataxe | +10 STR, +6% crit | Wyrmcoil Sweep leaves a 3 s ring of fire, 30% WD/s, in any aspect | `d09_warmasters_pit` sub-boss |
| `uq_drakeleap_sabatons` | Leaping Sabatons | feet, heavy | +8 STR, +8% move | Drakeleap range 15 → 20 m and 1 s of Scalebound on landing | Greyridge world boss |
| `uq_gilded_wyrmtooth` | Gilded Wyrmtooth | two-handed sword | +12 STR, +10% crit damage | Killing blows add **10 Wyrmblood** | `r01_barrowking` boss 2 |

---

## 9. Voice and barks

`voiceFor({ role: 'dragon_knight', gender, seed })` (reuse `ROLE_VOICES.dragon_knight`: pitch 0.3,
depth 0.85, rough 0.4). In Dragon Form every bark is replaced by a roar; the voice pitch drops 20%
for the one line on transformation.

| Moment | Lines (Lingo pool `dragon_knight_*`) |
|---|---|
| Aspect: fire / ice / storm | "Burn." · "Be still." · "Hear the sky." |
| Crit | "Scale and steel!" · "Kneel." |
| Low health | "The blood runs thin…" · "Not yet — not like this." |
| Wyrmblood full | "It wakes." |
| Dragon Form | "**I remember wings.**" (then a roar) |
| Wyrmfall | "From above!" |

---

## 10. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Drake / dragon bodies | `avatar-3d/js/creature-types.js` `drake`, `dragon` | Dragon Form, recoloured per aspect |
| Breath visuals | `spellfx.breath()` (Farhold R25 `flamethrower`) | Breath of the Elders, Deluge |
| Leap and landing | Farhold `charge` dash timing, `meteor` impact | Drakeleap, Wyrmfall |
| Statuses | Farhold `burn`, `chill`, `shock` | riders |
| Camera shake / hit-stop | Farhold `js/combat-feel.js` | Wyrmfall, drake footsteps |
| Outfit | `class-outfits.json` `dragon_knight` (dragon_helm, scale_plate, tabard) | recolour per aspect |
| Emberveil ideas | `dragon_claw` → Wyrmfang, `breath_weapon` → Breath of the Elders, `dragon_scales` → Scalebound, `draconic_fury` → Scale Surge | ideas only |
| Not used | Farhold dragon knight skills `power_strike`, `cleave`, `firebolt`, `guard_stance`, `fire_wall`, `meteor` | bespoke replacements |
| New | Wyrmblood gauge, aspect ring, Dragon Form bar, clips `breath`, `tail_swipe`, `wing_beat`, status `static_scale` | (new) |
