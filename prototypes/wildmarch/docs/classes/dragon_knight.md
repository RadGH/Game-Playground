# Class: Dragon Knight (`dragon_knight`)

> *"The blood chose the element. I only chose when to let it out."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 14.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role
**Damage**, hybrid role **Tank**, build **melee**, **heavy** armour, resource **Momentum**, mechanic
**Draconic Aspect — fire / ice / storm aspect changes the spells; Dragon Form at 40**, spell slots
1 / 4 / 10 / 18 / 28 / 40, calling quests 6 / 20 / 40, talent tiers 12 / 22 / 32 / 45, cap 60.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the main-hand weapon, before armour (page 05; Farhold `rpg.strike` base). In Dragon Form WD becomes **claw damage** (§4.1). The Dragon Knight scales on WD only; aspect damage is WD dealt as that element. |
| **Momentum** | the class resource (canon). Pool **100**, starts **empty** each fight, builds from basic hits (page 05 owns the base gain) and from **hits taken: +1 per 1% of max health lost** (×1.5 with a shield), drains **10 a second** after 5 s out of combat. The Dragon Knight's own builders: Wyrmfang Strike **+20**, Drakeleap **+10**. Spenders: Breath of the Elders 40, Scalebound 30, Wyrmcoil Sweep 35, Wyrmfall 60. |
| **Wyrmblood** | the class meter, 0–100 (§2.2), filled by spending Momentum. |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** · **Auto-target** (with no valid target, picks the valid enemy closest to your aim point in range) · **Self** · **Ally** · **Ground**. |
| **Tags** | page 05 §Tags. **Aspect tags:** every Dragon Knight spell that deals damage carries the element tag of your **current aspect** — `tag_fire` (Firescale), `tag_ice` (Rimescale) or `tag_lightning` (Thunderscale) — as well as `tag_physical`. The tables write this as **`tag_<aspect>`**. A "+10% Ice damage" bonus therefore applies to the whole kit while you are in Rimescale. |
| **GCD** | 1.0 s global cooldown (canon). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A knight with a dragon's blood in the veins, who picks one of three elder breaths — fire, ice or storm — and at the height of power sheds the armour for scales and becomes the drake. |
| Primary role | **Damage** (two-handed weapon) |
| Hybrid role | **Tank** (one-handed weapon + shield, §5). The off hand decides the role; nothing else has to change. |
| Build | melee |
| Armour | Heavy |
| Weapons | Two-handed sword, two-handed axe, greatsword, greataxe **or** longsword / one-hand axe + shield. Starter: **Squire's Longsword + Kite Shield** (reuse Farhold `startingEquipment` longsword + shield). |
| Primary attribute | STR (CON for tanks) |
| Resource | **Momentum** + the **Wyrmblood** meter |
| Companion | None. At level 40 the knight *is* the dragon. |
| Playstyle | Pick an aspect, stamp it on everything with every swing, fill Wyrmblood by spending Momentum, then burst: Scale Surge (6–39) or Dragon Form (40+). A shield turns the defensive spells into taunts and the knight into a tank. |

---

## 2. Class mechanic: **Draconic Aspect** and **Wyrmblood**

### 2.1 The three aspects

The knight holds **one aspect** at a time. It colours every weapon hit, sets the element tag of every spell
and adds a **rider** (an extra effect) to every spell (§3.3).

| Aspect | id | Colour | Every weapon hit | Rider status | Passive |
|---|---|---|---|---|---|
| **Firescale** (fire) | `aspect_fire` | red-gold | +15% WD as fire | **Burning** 5 s, 20% WD per second (page 05 `burn`) | +10% damage vs burning enemies |
| **Rimescale** (ice) | `aspect_ice` | white-blue | +15% WD as ice | **Chilled** 4 s (page 05 `chill`) | +10% armour |
| **Thunderscale** (storm) | `aspect_storm` | slate + yellow | +15% WD as lightning | **Static Scale** (new) 5 s: the next hit on it chains 60% WD to one more enemy within 6 m | +8% attack speed |

Visuals: the knight's weapon glows its aspect (`spellfx` element `fire` / `ice` / `lightning` trail on every
swing); the `dragon_helm` crest recolours; the tabard (`decor: tabard`) takes the aspect colour.

### 2.2 Wyrmblood meter

* **+1 Wyrmblood per 1 Momentum spent** on a spell. **+5** whenever an aspect rider is applied to an elite
  or boss. Does not drain in combat; drains 2 a second after 10 s out of combat.
* **UI:** a horizontal **serpent-shaped bar** under the Momentum bar — 100 scales that light from tail to
  head in the aspect colour. At 100 the head opens its jaws and glows, with a heartbeat thump (sfx
  `ui_ready`). Page 03 owns placement (`scr_hud`).

### 2.3 Class keys ([page 02](../02-CONTROLS.md) §5.16)

| Key | From | Does |
|---|---|---|
| **`Q`** at 100 Wyrmblood | Calling I (6) | **Scale Surge** — every aspect rider is **doubled** (Burning 40% WD/s, Chilled slows 70%, Static Scale chains to 2), weapon hits +25% as the element, **8 s** |
| **`Q`** at 100 Wyrmblood | Calling III (40) | **Dragon Form** (replaces Scale Surge; §4), 20 s, drains 5 Wyrmblood a second. `Q` again ends it early and keeps what is left |
| **`Shift+1` / `2` / `3`** | Calling I (out of combat) · Calling II (in combat, 20 s cooldown) | **Firescale / Rimescale / Thunderscale** |
| `G` | — | none |

### 2.4 The calling quests (page 14 owns the text; ids per 00 §10)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_dragon_knight_1` | **The First Blood** | Hearthvale — a sealed dragon bone under the Brightwater mill; touch the bone, survive three waves as it tests which element you answer to | Choose your **first aspect**; swap only **out of combat** (a 5 s kneel at any shrine or campfire) · **Wyrmblood** and **Scale Surge** |
| 20 | `q_calling_dragon_knight_2` | **The Three Breaths** | Sunscar — find the three shed scales in the Glass Tombs region (one per aspect); each is a short trial fought in that aspect | All three aspects; **swap in combat** with `Shift+1`–`3`, **20 s cooldown**, off GCD. Swapping releases **Shedding Scales**: a 4 m burst of **150% WD** in the *new* element and 20% damage reduction for 3 s |
| 40 | `q_calling_dragon_knight_3` | **The Wyrmheart** | Frostmantle — a solo fight on a glacier ledge against the dragon ghost whose blood you carry (it uses your aspect against you) | **Dragon Form** |

### 2.5 JSON shape

```json
{
  "id": "dragon_knight",
  "momentum": { "max": 100, "perPctHealthLost": 1, "shieldTakenMult": 1.5, "drainOutOfCombat": 10, "drainAfter": 5 },
  "aspects": ["aspect_fire", "aspect_ice", "aspect_storm"],
  "wyrmblood": { "max": 100, "perMomentumSpent": 1, "perEliteRider": 5, "drainOutOfCombat": 2 },
  "surge": { "seconds": 8, "riderMult": 2, "elementShare": 0.25 },
  "dragonForm": { "creature": { "type": "drake", "size": 2.4 }, "drainPerSecond": 5,
                  "stats": { "maxHpPct": 50, "armourMult": 1.5, "attackEvery": 1.3, "momentumMult": 1.5 } },
  "swap": { "cooldown": 20, "burstWD": 1.5, "radius": 4 },
  "shieldGuard": { "threatMult": 4, "armourPct": 20, "damageDone": -0.2 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | CD | Cast | Target | Shape | Tags | Does |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `dragon_knight_wyrmfang_strike` | Wyrmfang Strike | builds 20 Momentum | 4 s | instant | Auto-target | 3.6 m, 100° arc | `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area` | 150% WD + rider |
| 2 | 4 | `dragon_knight_drakeleap` | Drakeleap | builds 10 Momentum | 12 s | instant | Ground | leap 15 m, 3 m landing circle | `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area` `tag_movement` | 120% WD + aspect landing |
| 3 | 10 | `dragon_knight_elder_breath` | Breath of the Elders | 40 Momentum | 10 s | channel 1.5 s | Auto-target | cone 8 m, 70° | `tag_<aspect>` `tag_spell` `tag_area` `tag_channel` | 300% WD over 5 ticks |
| 4 | 18 | `dragon_knight_scalebound` | Scalebound | 30 Momentum | 30 s | instant, off GCD | Self | self (+8 m taunt with a shield) | `tag_shield` `tag_duration` `tag_aura` | −35% damage taken 6 s |
| 5 | 28 | `dragon_knight_wyrmcoil_sweep` | Wyrmcoil Sweep | 35 Momentum | 12 s | instant | Self | 5 m circle | `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area` | 200% WD, knockback 4 m |
| 6 | 40 | `dragon_knight_wyrmfall` | Wyrmfall | 60 Momentum | 45 s | 1.2 s airborne | Ground | 25 m, 6 m circle | `tag_physical` `tag_<aspect>` `tag_attack` `tag_area` `tag_movement` `tag_duration` | 450% WD + 6 s aspect field |

### 3.2 Details

**1. `dragon_knight_wyrmfang_strike` — Wyrmfang Strike** · level 1 · builds **20 Momentum** · 4 s · instant · **Auto-target** · 3.6 m, 100° arc
* **150% WD** to everything in the arc; applies the aspect rider to the first enemy hit (all enemies hit
  during Scale Surge).
* Tags: `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area`.
* Looks: the weapon trails the aspect element, three fang-shaped slashes (`impact` in aspect element,
  `shadow_claw` sprite recoloured). Sound: a heavy swing + a dragon hiss layered at −12 dB.

**2. `dragon_knight_drakeleap` — Drakeleap** · level 4 · builds **10 Momentum** · 12 s · instant · **Ground** (leap up to **15 m**; with a hard target in range it lands on the target)
* Lands for **120% WD** in a **3 m** circle, then the aspect landing:
  **Fire** — the circle burns 4 s, 30% WD per second · **Ice** — everything hit **Rooted 1.5 s**
  (bosses: Chilled) · **Storm** — everything hit **Stunned 0.75 s** (bosses: break bar +5%).
* Tags: `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area` `tag_movement`.
* Looks: a 0.6 s arc through the air with a wing-shaped trail of the element; `aoe` on landing.
  Sound: whoosh up, a crunch + element sting on landing.

**3. `dragon_knight_elder_breath` — Breath of the Elders** · level 10 · **40 Momentum** · 10 s · channel **1.5 s** (you can turn 90° a second, not move) · **Auto-target** (turns to face it) · cone **8 m, 70°**
* **5 ticks × 60% WD** (300% WD) as the aspect element; each tick re-applies the rider.
* Tags: `tag_<aspect>` `tag_spell` `tag_area` `tag_channel` (a breath is magic, not a weapon swing: it
  does not carry `tag_physical` or `tag_attack`, and life steal does not apply — page 05 §R21 rule).
* Looks: `spellfx.breath({ element, length: 8, arc: 1.22 })` from the helm's mouth guard — fire cone, ice
  shard stream, or a forked lightning fan. Sound: a roar that rises into the element.

**4. `dragon_knight_scalebound` — Scalebound** · level 18 · **30 Momentum** · 30 s · instant, **off GCD** · **Self**
* **6 s: 35% less damage taken**, and **60% resistance** to your current aspect's element.
* **With a shield equipped:** also **taunts** every enemy within **8 m** for 3 s (bosses included —
  page 05 §13.4).
* Tags: `tag_shield` `tag_duration` `tag_aura`.
* Looks: plate scales ripple over the armour (`STATUS_FX.barrier` recoloured to the aspect). Sound: the
  scrape of scales closing.

**5. `dragon_knight_wyrmcoil_sweep` — Wyrmcoil Sweep** · level 28 · **35 Momentum** · 12 s · instant · **Self** · **5 m** circle
* **200% WD** to all, knocked back **4 m** (bosses and elites are not moved), rider on all.
* **With a shield:** threat from this spell ×2 (on top of the Guardian ×4) — the pack pick-up.
* Tags: `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area`.
* Looks: a full 360° spin with a coiling serpent of element around the knight (`vortex` in the aspect
  element, reversed so it throws outward, 0.5 s). Sound: the spin whoosh + a tail-lash crack.

**6. `dragon_knight_wyrmfall` — Wyrmfall** · level 40 · **60 Momentum** · 45 s · you leap **1.2 s** into the air · **Ground** within **25 m** · **6 m** circle
* While airborne (1.2 s) you **cannot be hit by ground effects** (danger/void zones, ground waves). Direct
  hits and room-wide casts still hit you.
* Lands for **450% WD**, then a **6 s aspect field** (6 m): Fire 40% WD per second · Ice slows 50% and
  allies inside take 10% less damage · Storm strikes a random enemy inside every 1 s for 60% WD.
* **+30 Wyrmblood.**
* Tags: `tag_physical` `tag_<aspect>` `tag_attack` `tag_area` `tag_movement` `tag_duration`.
* Looks: the knight rises with spread wing-shapes of light, then falls as a burning / frozen / lightning
  comet (`projectile` from above + `aoe` + a ground ring). Sound: a dragon's scream on the way down, a
  ground-shaking thump (camera shake, reuse Farhold `combat-feel.js`).

### 3.3 Aspect rider table (what each spell does per aspect)

| Spell | Firescale (fire) | Rimescale (ice) | Thunderscale (storm) |
|---|---|---|---|
| Wyrmfang Strike | Burning 5 s | Chilled 4 s | Static Scale |
| Drakeleap | burning circle 4 s | Rooted 1.5 s | Stunned 0.75 s |
| Breath of the Elders | Burning refreshed each tick | each tick +1 Frostbite stack (page 05; at 5 stacks **Frozen** 1.5 s, non-boss) | each tick arcs to 1 extra enemy outside the cone within 4 m |
| Scalebound | attackers take 30% WD fire (once per 0.5 s) | +20% extra armour | 20% chance a hit on you chains 80% WD back |
| Wyrmcoil Sweep | leaves a 5 m burning ring 3 s | knocked-back enemies are Chilled | knocked-back enemies are **Shocked** (page 05, +15% damage taken) 5 s |
| Wyrmfall | 40% WD/s field | slow 50% + allies −10% damage taken | a strike per second |

### 3.4 How it plays

* **Solo:** Drakeleap in, Wyrmfang Strike on cooldown, Wyrmcoil Sweep when three or more are close,
  Breath when Momentum passes 40. **Firescale** for packs (burns while you move on), **Rimescale** when you
  are losing (slows and armour), **Thunderscale** for single big targets (chains to the adds). Scale Surge
  or Dragon Form on the elite of every pull.
* **Dungeon (Damage, two-hander):** Thunderscale on bosses, Firescale for trash. Save Wyrmblood for the
  boss's burn window.
* **Challenge mode and Depth:** Scale Surge / Dragon Form is a personal 8–20 s cooldown timed with the
  party's damage window. The aspect swap (from 20) is a **mechanic tool**: swap to the element a boss's
  next cast uses, then Scalebound for 60% resistance to it (page 12 flags which bosses cast an element).

### 3.5 Boss mechanics

| Mechanic | Dragon Knight answer |
|---|---|
| **Danger zone** | Drakeleap (15 m) out; Wyrmfall's 1.2 s airborne dodges a danger zone that resolves while you are up |
| **Void zone** | Wyrmfall's airborne window **does not** protect from a void zone you land in. Land outside |
| **Soak** | Dragon Form's +50% health and stun immunity make the knight a strong soaker; Scalebound 60% element resistance if the soak is elemental |
| **Moving wave / knockback** | Dragon Form is immune to knockback |
| **Tank swap** | Scalebound's shield taunt picks up a whole pack; Roar of Dominion's −15% boss damage is a swap-safety window |
| **Interrupts** | Drakeleap's storm stun (0.75 s) interrupts a **non-boss** cast. No boss interrupt |

---

## 4. Alternate spells — Dragon Form (Calling III, level 40)

### 4.1 The transformation

| Rule | Value |
|---|---|
| Trigger | `Q` at 100 Wyrmblood. Instant, off GCD. |
| Duration | 20 s (Wyrmblood drains 5 a second); `Q` again ends it early and keeps what is left. |
| Body | Chibi 2 hidden; a **`drake`** creature (reuse `creature-types.js`: horns, spikes, fangs) at **size 2.4** (≈2.6 m long). With the 6-piece Wyrmlord set or `leg_heart_of_the_fire_wyrm` it becomes the winged **`dragon`** type at size 1.6. Colours by aspect: fire `#8a2a2a`/`#e0b070`, ice `#d8ecf8`/`#6aa0d0`, storm `#3a4250`/`#ffe860`. Pre-built at login (avoids the shader-compile stutter). |
| Hitbox | Unchanged — the knight's capsule. Only the drawing grows. |
| Stats | +50% max health (health kept as a %), gear armour ×1.5, **immune to knockback and stun**, Momentum gained ×1.5 |
| Basic attack | Claw strike every **1.3 s**, 3.5 m, 120° arc, **claw damage** = your weapon's damage per second × 1.3 (`tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_basic_attack`) |
| Gear | Weapon and shield hidden. A shield's block value becomes armour. Affixes all work. |
| Tank | If a shield was equipped when you shifted, you keep the **Guardian** state (threat ×4) in Dragon Form. |
| Blocked | No potions, no mounting, no interacting with objects (the `E` prompt reads "Not as a dragon"). |

### 4.2 The Dragon Form bar

Keys `1`–`6` (the bar replaces the spell bar; page 02 §5.16).

| Key | id | Name | Cost | CD | Cast | Target | Shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `dragon_knight_wyrm_rend` | Wyrm Rend | builds 20 Momentum | 3 s | instant | Auto-target | 4 m, 120° arc | `tag_physical` `tag_<aspect>` `tag_attack` `tag_melee` `tag_area` | **200% WD** + rider |
| 2 | `dragon_knight_wyrm_deluge` | Deluge of the Wyrm | 40 Momentum | 10 s | channel 2 s | Auto-target | cone **14 m, 60°** | `tag_<aspect>` `tag_spell` `tag_area` `tag_channel` | **8 ticks × 70% WD** (560% WD) in the aspect element |
| 3 | `dragon_knight_wyrm_tailsmash` | Tailsmash | 20 Momentum | 8 s | instant | Self | **behind** you, 6 m, 120° | `tag_physical` `tag_attack` `tag_melee` `tag_area` | **180% WD**, knockback 6 m (non-boss) — clears adds off the healer |
| 4 | `dragon_knight_wyrm_wingbeat` | Wingbeat | 25 Momentum | 15 s | instant | Self | 8 m ring | `tag_physical` `tag_area` `tag_aura` | **120% WD**, knockback 6 m; allies inside gain +20% move 4 s |
| 5 | `dragon_knight_wyrm_dominion` | Roar of Dominion | 0 | once per Dragon Form | instant | Self | 15 m | `tag_area` `tag_duration` | non-boss enemies **Feared 3 s**; bosses deal **15% less** damage 8 s; allies +10% damage 8 s |
| 6 | `dragon_knight_wyrm_return` | Return to Steel | 0 | — | instant | Self | self, 4 m | `tag_physical` `tag_<aspect>` `tag_area` | ends Dragon Form early; releases a **Shedding Scales** burst (150% WD, 4 m) |

Clips: idle, walk, run, attack (Wyrm Rend), talk (Roar), dead (reuse); **new**: `breath` (head low, jaw open,
2 s loop), `tail_sweep` (0.5 s spin of the hind body), `wing_beat` (dragon type only; the drake rears up and
stamps instead). Sound: the drake's footsteps shake the camera 0.1 s; the Deluge is the class's loudest sound.

---

## 5. The hybrid role — Tank (shield)

The Dragon Knight uses the shared **Role focus** switch in the spellbook (00 §6; out of combat, saved per
Loadout), **tied to its shield**: **Hybrid** queues it as **Tank** in the Dungeon Finder and needs a **shield** in
the off hand (the switch is grey with "Tank needs a shield in the off hand" otherwise). What it changes comes
with the shield: Shield Guard (§5.1) and the shield versions of Scalebound and Wyrmcoil Sweep (§5.2).
**Primary** queues it as Damage. Available from level 1; it becomes a full kit with
Scalebound at 18.

### 5.1 Shield Guard (passive, whenever a shield is equipped)

| Rule | Value |
|---|---|
| Threat | **Guardian** state (page 05 §13.2): all threat **×4** |
| Armour | +20% (Rimescale's +10% stacks on top) |
| Momentum | hits taken build **×1.5** (1.5 per 1% of max health lost) — a tank's bar fills from being hit |
| Damage | −20% (the two-hander's damage is what the Damage role gets) |
| Block | the shield's block chance and value (page 08) |

### 5.2 The tank kit

| Piece | How it tanks |
|---|---|
| Wyrmfang Strike | 100° arc, 4 s: the threat filler that hits the whole pack in front |
| Drakeleap | the opener: into the pack, 3 m of damage, Rimescale roots or Thunderscale stuns the casters |
| Scalebound (shield) | **area taunt** 8 m, 3 s, plus −35% damage taken 6 s and 60% resistance to one element; 30 s |
| Wyrmcoil Sweep (shield) | threat ×2 on a 5 m circle — the pick-up after a taunt |
| Shared **Provoke** (`Z`, page 07, level 10) | the single-target taunt |
| Aspect swap (20) | **Rimescale** for steady physical bosses (+30% armour with the shield), swap to a boss's element before its big cast and Scalebound through it |
| Dragon Form (40) | the big defensive: +50% health, ×1.5 armour, knockback and stun immune for 20 s |
| Talents that help | Wyrmfang t2b **Scale Guard**; Drakeleap t2a **Guardian Leap**; Scalebound t2c **Molten Hide**, t3b **Wyrm Guard**, t4a **Brood Wall**, t4b **Unyielding**; Wyrmcoil t2a **Coil Ward**, t3b **Threatening Coil**; Dragon Form t4b **Iron Wyrm** |
| Gear | shield + longsword or axe; armour, health and CON affixes; a gem in the shield (page 08, armour column) |

### 5.3 Threat and mitigation numbers

Design targets against the warrior (the primary tank) at level 60 (page 05 owns the final maths):

| Per 100 points of raw boss melee | Warrior | Dragon Knight (shield, Rimescale) |
|---|---:|---:|
| Average taken over 30 s | ≈ 55 | ≈ 60 |
| Worst 3-second window | ≈ 70 | ≈ 78 |
| Elemental boss spell, with Scalebound up and the matching aspect | ≈ 70 | ≈ 26 |
| Threat per second (as % of the top damage dealer) | ≈ 330% | ≈ 350% |

**How good it is.** Strong in the **open world, Normal dungeons and Depth up to about 10**, and the best tank
in the game against a single big **elemental** cast. Weaker in **Challenge mode** because Scalebound is its
only short defensive (30 s) and Dragon Form only comes every ~40–60 s of Wyrmblood; back-to-back physical
tank busters between those windows hit harder than on the warrior.

---

## 6. Utility spells

None. The Dragon Knight uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers at 12 / 22 / 32 / 45; a tier opens at the later of its level and the
spell's slot level.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Wyrmfang Strike | 1 | **Twin Fangs** — strikes twice (2 × 90% WD), rider on both | **Long Fang** — becomes a 6 m × 1.5 m thrust line | — |
| Wyrmfang Strike | 2 | **Bloodletting** — +5 Wyrmblood per hit on a target with your rider | **Scale Guard** — each hit gives 5% damage reduction for 4 s, stacks 3 | **Rending** — lowers armour of targets hit 10% for 6 s |
| Wyrmfang Strike | 3 | **Hungry Blade** — resets its cooldown when it kills | **Brood Call** — 20% chance to strike again as a spectral drake head (100% WD) | — |
| Wyrmfang Strike | 4 | **Elder Fang** — during Scale Surge / Dragon Form it has no cooldown | **Tri-Fang** — applies the riders of **all three** aspects at 50% (carries all three element tags) | — |
| Drakeleap | 1 | **Twin Leap** — 2 charges | **Soaring** — range 15 → 25 m | — |
| Drakeleap | 2 | **Guardian Leap** — leap to an **ally** (Ally targeting): they take 30% less damage 4 s | **Crater** — landing radius 3 → 6 m, damage −25% | **Talon Grab** — pulls the target 3 m toward your landing point (non-boss) |
| Drakeleap | 3 | **Aftershock** — a second landing burst 1 s later for 80% WD | **Up and Away** — press again within 3 s to leap back to where you started | — |
| Drakeleap | 4 | **Kingswoop** — the leap path itself deals 100% WD to everything under it | **Scaled Landing** — landing gives Scalebound for 2 s | — |
| Breath of the Elders | 1 | **Long Breath** — 8 → 13 m, cone 70° → 40° | **Wide Breath** — cone 70° → 120°, length 8 → 6 m | **Short Breath** — instant, 3 ticks at 80% (loses `tag_channel`) |
| Breath of the Elders | 2 | **Scorched Earth** — leaves ground of the element under the cone 4 s (fire 25% WD/s, ice slow, storm strikes) | **Inhale** — pulls non-boss enemies 3 m toward you before the first tick | — |
| Breath of the Elders | 3 | **Walking Breath** — you can move at 50% speed while breathing | **Wyrmtongue** — each tick that hits an elite/boss refunds 3 Momentum | — |
| Breath of the Elders | 4 | **Chromatic** — ticks cycle fire → ice → storm, applying each rider in turn | **Endless Maw** — the channel extends 0.3 s per enemy killed during it (max +1.5 s) | — |
| Scalebound | 1 | **Hardened** — 35% → 50% reduction, 6 → 4 s | **Long Scales** — 6 → 10 s, 35% → 25% | — |
| Scalebound | 2 | **Scaled Ally** — also on one ally within 10 m at half strength | **Mirror Scale** — reflects the first spell cast on you back at its caster (non-boss) | **Molten Hide** — with a shield the taunt range 8 → 12 m |
| Scalebound | 3 | **Last Scale** — below 25% health casts itself for free (once per 90 s) | **Wyrm Guard** — damage prevented fills Wyrmblood: 1 per 2% max health prevented | — |
| Scalebound | 4 | **Brood Wall** — becomes a 6 m dome for the party: 20% damage reduction for everyone inside | **Unyielding** — also stun and knockback immunity for its duration | — |
| Wyrmcoil Sweep | 1 | **Double Coil** — spins twice, second at 60% | **Pulling Coil** — pulls non-boss enemies **in** 3 m instead of knocking back | — |
| Wyrmcoil Sweep | 2 | **Coil Ward** — each enemy hit gives a shield of 4% max health (max 20%) (`tag_shield` added) | **Tail Lash** — enemies behind you take +50% | **Scale Shrapnel** — throws 6 scales outward, 10 m, 60% WD each (`tag_ranged` `tag_projectile` added) |
| Wyrmcoil Sweep | 3 | **Sweeping Wind** — travel 6 m forward while spinning | **Threatening Coil** — threat ×2 → ×4 on this spell | — |
| Wyrmcoil Sweep | 4 | **Serpent Ring** — leaves a spinning ring 6 s that repeats 40% WD every 1 s | **Worldcoil** — radius 5 → 9 m, knockback removed | — |
| Wyrmfall | 1 | **Double Fall** — you bounce once, landing a second 3 m circle 8 m further for 200% WD | **Guarded Descent** — land as a shield dome: allies within 6 m take 30% less damage 4 s | — |
| Wyrmfall | 2 | **Lingering Sky** — airborne 1.2 → 2.0 s | **Heavy Fall** — +50% damage, no field | **Dragon's Wake** — the field follows you for its 6 s |
| Wyrmfall | 3 | **Brood Rain** — during the fall, 5 smaller comets strike random enemies within 12 m for 100% WD | **Fall Into Form** — if Wyrmblood reaches 100 from its +30, you land already in Dragon Form | — |
| Wyrmfall | 4 | **Aspect Storm** — the field is all three aspects at once | **Kingsfall** — cooldown 45 → 30 s, damage −20% | — |

### 7.1 Dragon Form talents ("Wyrm" tab; ids `dragon_knight_wyrm_hide_t<tier><a|b|c>`)

A form bar is not one spell, so its talents hang on the form. Tiers 1–3 open together at 40.

| Tier | a | b | c |
|---|---|---|---|
| 1 (12, active from 40) | **Long Blood** — drain 5 → 4 a second (25 s form) | **Broad Wings** — Wingbeat radius 8 → 12 m | — |
| 2 (22) | **Twin Maw** — Wyrm Rend also bites a second enemy within 4 m for 60% | **Hoard Guard** — each enemy killed in form adds 1 s | — |
| 3 (32) | **Deluge Walk** — move at 50% during Deluge of the Wyrm | **Roar Twice** — Roar of Dominion usable twice per form | — |
| 4 (45) | **Sky Wyrm** — the form becomes the winged `dragon` type and Wingbeat lifts you 3 m for 1.5 s (ground effects miss you while up) | **Iron Wyrm** — the form grants 20% damage reduction, Deluge −30% | — |

*(Round 1's "Brood Mother" — two summoned whelps — is gone: no class summons a creature out of nothing, 00 §6.)*

---

## 8. Class sets

Heavy armour pieces (head, chest, hands, legs, feet) + a weapon or shield.

### 8.1 `set_dragon_knight_brood_scale` — Brood-Scale Harness (dungeon set, 31–39)

Drops from `d09_warmasters_pit` bosses (head, hands, feet) and `d10_rimefang_caverns` bosses (chest, legs,
shield `it_broodscale_kite`) on **Normal** at the dungeon's level and on **Challenge** at item level 60; Depth
runs of these dungeons can drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Wyrmfang Strike applies the rider to **every** enemy hit, not only the first | Wyrmfang Strike |
| 4 | Drakeleap's landing refunds **15 Momentum** per enemy hit (max 45) | Drakeleap |
| 6 | Breath of the Elders fires **twice** (a second breath 0.5 s after, 60%) | Breath |

### 8.2 `set_dragon_knight_wyrmlord_plate` — Wyrmlord Plate (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).
*(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aspect swap cooldown 20 → 10 s and the Shedding Scales burst is 150% → 300% WD | the mechanic |
| 4 | Wyrmfall fills Wyrmblood +30 → +60 | Wyrmfall |
| 6 | Dragon Form is the **winged dragon**; Deluge of the Wyrm becomes a **line** you sweep 20 m across the field (you rise 3 m during it) | Dragon Form bar |

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_heart_of_the_fire_wyrm` | Heart of the Fire Wyrm | chest, heavy | Dragon Form lasts **+8 s** and you are the winged dragon; in **Firescale**, Deluge leaves molten ground 6 s (40% WD/s) | `b_slagborn` Slagborn (Kingsfire world boss) |
| `leg_rimefang_greathelm` | Rimefang Greathelm | head, heavy | **Rimescale:** enemies Frozen by your breath shatter for 200% WD in 4 m when struck; Scalebound gives +1 Frostbite stack to everything that hits you | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss) on Challenge, and its Depth end chest |
| `leg_stormcrest_gauntlets` | Stormcrest Gauntlets | hands, heavy | **Thunderscale:** Static Scale chains up to **4** times (each 70%) and each chain adds 1 Wyrmblood | `b_unmoored` The Unmoored (Riftmarch world boss) |
| `leg_triune_scale` | The Triune Scale | necklace | After an aspect swap the **old aspect's rider stays for 8 s** — two aspects at once | the end chest of any dungeon at **Depth 15+** (1.5%) |
| `leg_old_kings_tooth` | The Old King's Tooth | greataxe | Every 5th weapon hit is a **free Breath of the Elders** (3 ticks, no Momentum) | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss) on Challenge |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_whelpscale_buckler` | Whelpscale Buckler | shield | +8 CON, +60 armour | Scalebound's taunt also applies your aspect rider to every taunted enemy | `b_grumvak_kilnbreaker` Warchief Grumvak Kilnbreaker (`d04_bellows_keep` end boss) |
| `uq_cinderhorn_greataxe` | Cinderhorn | greataxe | +10 STR, +6% crit | Wyrmcoil Sweep leaves a 3 s ring of fire, 30% WD/s, in any aspect (`tag_fire` added) | `b_ogra_beastmaster` Ogra the Beastmaster (`d09_warmasters_pit` sub-boss) |
| `uq_drakeleap_sabatons` | Leaping Sabatons | feet, heavy | +8 STR, +8% move | Drakeleap range 15 → 20 m and 1 s of Scalebound on landing | `b_grief_in_iron` Grief-in-Iron (Greyridge world boss) |
| `uq_gilded_wyrmtooth` | Gilded Wyrmtooth | two-handed sword | +12 STR, +10% crit damage | Killing blows add **10 Wyrmblood** | `b_warmaster_drogath` Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

### 9.3 Souls

Both need the wearer to be a **dragon_knight**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_old_wyrm` | Soul of the Old Wyrm | weapon | class: dragon_knight | In **Dragon Form**, every 20 Momentum you spend adds **1 s** to the form (max +6 s), and Roar of Dominion also sets your aspect rider on every enemy it fears. | `b_slagborn` world boss (2%); end chest at **Depth 15+** (1%) |
| `soul_scale_warden` | Soul of the Scale Warden | armour — shield | class: dragon_knight | When **Scalebound** ends with a shield equipped, it releases **Shedding Scales** (150% WD in 4 m, `tag_physical` `tag_<aspect>` `tag_area`) and taunts everything it hits for 2 s. | `b_rimefang` (`d10_rimefang_caverns` end boss) on Challenge (3%); `b_standing_ruin` The Standing Ruin (Frostmantle world boss, 2%) |

---

## 10. Voice and barks

`voiceFor({ role: 'dragon_knight', gender, seed })` (reuse `ROLE_VOICES.dragon_knight`: pitch 0.3, depth 0.85,
rough 0.4). In Dragon Form every bark is replaced by a roar; the voice pitch drops 20% for the one line on
transformation.

| Moment | Lines (Lingo pool `dragon_knight_*`) |
|---|---|
| Aspect: fire / ice / storm | "Burn." · "Be still." · "Hear the sky." |
| Crit | "Scale and steel!" · "Kneel." |
| Scalebound taunt | "Look at me, not them." |
| Low health | "The blood runs thin…" · "Not yet — not like this." |
| Wyrmblood full | "It wakes." |
| Dragon Form | "**I remember wings.**" (then a roar) |
| Wyrmfall | "From above!" |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Drake / dragon bodies | `avatar-3d/js/creature-types.js` `drake`, `dragon` | Dragon Form, recoloured per aspect |
| Breath visuals | `spellfx.breath()` (Farhold R25 `flamethrower`) | Breath of the Elders, Deluge |
| Leap and landing | Farhold `charge` dash timing, `meteor` impact | Drakeleap, Wyrmfall |
| Statuses | page 05 `burn`, `chill`, `frostbite`, `frozen`, `shock` | riders |
| Camera shake / hit-stop | Farhold `js/combat-feel.js` | Wyrmfall, drake footsteps |
| Outfit | `class-outfits.json` `dragon_knight` (dragon_helm, scale_plate, tabard) | recolour per aspect |
| Emberveil 2 prototype ideas | `dragon_claw` → Wyrmfang, `breath_weapon` → Breath of the Elders, `dragon_scales` → Scalebound, `draconic_fury` → Scale Surge | ideas only |
| Not used | Farhold dragon knight skills `power_strike`, `cleave`, `firebolt`, `guard_stance`, `fire_wall`, `meteor` | bespoke replacements |
| New | Wyrmblood meter, aspect keys on `Shift+1`–`3`, Dragon Form bar, clips `breath`, `tail_sweep`, `wing_beat`, status `static_scale`, Shield Guard | (new) |
