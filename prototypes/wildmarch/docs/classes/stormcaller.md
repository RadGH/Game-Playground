# Class: Stormcaller (`stormcaller`)

> *"Lightning never strikes twice? Then you have not met me."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 16.
**Status:** v0.1 draft, 2026-09-29. Documentation only — nothing is built.

### How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | Spell power (page 05 owns the formula; Farhold shape `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). |
| **Mana cost** | % of maximum mana. |
| **Static** | a stack the Stormcaller puts on enemies, 0–5 per enemy (§2.1). |
| **Chain / jump** | a hit that leaps from one target to the next nearest within the stated distance; each jump takes the stated share. |
| **GCD** | 1.0 s global cooldown (canon, [page 00](../00-OVERVIEW.md) §4). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A storm-mage who charges the air around enemies until it breaks, and nails **Stormrods** into the ground to fence the field with lightning. |
| Role | **Damage** (ranged, chain and zone control) |
| Armour | Cloth |
| Weapons | Staff, wand (+ orb/tome focus — reuse Farhold `js/foci.js`). Starter: **Copper-bound Wand** (reuse base `wand`, Emberveil start also gives an `orb`). |
| Primary attribute | INT |
| Resource | **Mana** + **Static** stacks on enemies + **Stormrods** on the ground |
| Companion | None (Farhold's `storm_familiar` is used only as a talent, §6) |
| Playstyle | Spread Static with chains, plant rods to shape where enemies can walk, then break the sky: Skybreak consumes every stack at once. Rods double as relays for chains and as teleport anchors for escaping mechanics. |

---

## 2. Class mechanic: **Static** and **Stormrods**

### 2.1 Static (on enemies)

* Every lightning hit from the Stormcaller adds **1 Static** to the enemy hit (max **5**). Static lasts
  **8 s**, refreshed by each new stack.
* Each Static stack makes the enemy take **+2% lightning damage from you** (+10% at 5).
* Shown as **1–5 small blue-white sparks orbiting the enemy's head** (spellfx `orbitOrb` lightning,
  size 0.08) and as pips on the target frame.
* Other Stormcallers' Static is **separate** (each caster sees and spends their own).

### 2.2 Stormrods (on the ground)

Planted with the **class key `Q`** ([page 02](../02-CONTROLS.md) §5.16) at a ground point within **25 m**.

| Property | Value |
|---|---|
| Body | a 1.8 m iron-and-copper rod with a glass tip that glows (new prop; storm_rods decor from `class-outfits.json` gives the look) |
| Lasts | 30 s, or until you plant one more than your maximum (the oldest is removed) |
| Charges | Planting uses a charge; a charge returns every **8 s** |
| Max rods | 2 (Calling I) → 3 (Calling II) → 4 (Calling III) |
| **Fence** | any two of your rods within **15 m** of each other are joined by a crackling **blue-yellow arc** (deliberately *not* white, which page 11 reserves for tethers). An enemy touching a fence takes **30% SP every 0.5 s** and gains 1 Static per second |
| **Relay** | a chain jump may pass **through** a rod: the rod counts as a hop that costs nothing and adds 10 m to the next jump's reach |
| **Anchor** | Squall Step (slot 4) can target one of your rods up to 30 m away |
| Health | enemies do not attack rods; boss room-wide effects and void zones destroy rods inside them |

### 2.3 UI

* Above the mana bar: **rod charges** as 2–4 small rod icons (filled = ready, a sweep shows the 8 s
  return). Each planted rod shows its remaining seconds on the icon.
* On the ground: rods have a 25 m range ring while you hold `Q` (a placement preview; release plants that also draws
  the fences that would form).
* Sound: a low electrical hum near rods (3D sound, 10 m), a spark-crack whenever a fence hits something.

### 2.4 The calling quests (page 14 owns text and ids)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_stormcaller_1` | **The First Rod** | Hearthvale — a lightning-struck oak on the ridge; carry its iron spike to the smith through a storm while bolts target you (a dodge course) | **Stormrods** (2 max) and fences |
| 20 | `q_calling_stormcaller_2` | **The Eye of the Storm** | Sunscar — stand in the eye of a sandstorm and hold three rods up for 90 s against waves | 3 rods · a **closed triangle** of fences becomes the **Eye of the Storm**: allies inside gain **+15% cast and attack speed** |
| 40 | `q_calling_stormcaller_3` | **The Sky that Answers** | Frostmantle — call lightning onto the peak of Rimehold's bell tower and ride the strike (a solo fight vs a storm elemental) | 4 rods · **Overcharge**: an enemy reaching 5 Static **discharges on its own** for **150% SP** and chains 4 times (80% each, 8 m); stacks reset to 0 |

### 2.5 JSON shape

```json
{
  "id": "stormcaller",
  "static": { "max": 5, "seconds": 8, "takeMorePerStack": 0.02 },
  "rods": { "range": 25, "seconds": 30, "recharge": 8, "maxByCalling": [2, 3, 4],
            "fence": { "maxGap": 15, "spPerHalfSecond": 0.3 }, "relayBonus": 10 },
  "eye": { "haste": 0.15 },
  "overcharge": { "sp": 1.5, "chains": 4, "falloff": 0.8, "jump": 8 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Cost | CD | Cast | Range | Shape | Does |
|---|---|---|---|---|---|---|---|---|
| 1 | `stormcaller_forked_spark` | Forked Spark | 2% | — | 1.0 s | 30 m | bolt + 2 jumps (8 m) | 110% SP, jumps 70% |
| 4 | `stormcaller_squall_step` | Squall Step | 4% | 12 s | instant | 12 m (30 m to a rod) | blink line 2 m wide | 80% SP along the path |
| 10 | `stormcaller_thunderhead` | Thunderhead | 6% | 15 s | instant | 30 m | ground cloud 5 m, 10 s | a strike per second, 70% SP |
| 18 | `stormcaller_galvanic_tether` | Galvanic Tether | 5% | 18 s | instant | 25 m | enemy ↔ rod line, 6 s | 40% SP/s; crossing 60%; snap 250% |
| 28 | `stormcaller_skybreak` | Skybreak | 7% | 20 s | instant | 30 m | every enemy with Static | 60% SP per stack, consumes |
| 40 | `stormcaller_stormcrowned` | Stormcrowned | 15% | 120 s | instant | self | 15 s transformation | sky bolts on every spell, rods fire |

### 3.2 Details

**`stormcaller_forked_spark` — Forked Spark** · slot 1 · 2% mana · no cooldown · 1.0 s cast · 30 m
* **110% SP** lightning to the target, then **jumps twice** to the next nearest enemies within **8 m**
  for **70%** each. +1 Static on everything hit.
* Looks: `projectile` lightning (instant bolt, speed 40) with the jagged line for each jump.
  Sound: a sharp crack, each jump a smaller crack.

**`stormcaller_squall_step` — Squall Step** · slot 4 · 4% mana · 12 s · instant
* You become a bolt and **blink 12 m** in the direction you move (or face). Everything along a
  **2 m-wide** path takes **80% SP** and +1 Static.
* **Can target one of your Stormrods up to 30 m away** — you arrive at the rod.
* Looks: the body flashes to a white-blue line, `impact` lightning at both ends. Sound: thunder clap.

**`stormcaller_thunderhead` — Thunderhead** · slot 10 · 6% mana · 15 s · instant · ground within 30 m · **5 m** cloud for **10 s**
* Strikes a random enemy under it **every 1 s** for **70% SP** (+1 Static). Prefers enemies with the
  fewest stacks (spreads Static).
* **With a rod under it:** every 2 s the cloud also strikes the rod, which pulses **50% SP in 4 m**.
* Looks: `spellfx.storm({ element: 'lightning', radius: 5, ms: 10000 })` — a dark cloud with strikes.
  Sound: rolling thunder loop.

**`stormcaller_galvanic_tether` — Galvanic Tether** · slot 18 · 5% mana · 18 s · instant · enemy within 25 m
* Links the enemy to **your nearest rod** (to **you** if you have none) for **6 s**.
* The tethered enemy takes **40% SP per second**. Any other enemy crossing the line takes **60% SP**
  (once per second each). +1 Static per second on everything it touches.
* If the tethered enemy moves more than **20 m** from its anchor, the line **snaps**: **250% SP** and
  **Stunned 1 s** (bosses: no stun).
* Looks: a thick crackling rope, blue-yellow (not white — page 11 tether colour). Sound: a buzzing
  hum; a snap like a breaking cable.

**`stormcaller_skybreak` — Skybreak** · slot 28 · 7% mana · 20 s · instant · every enemy within **30 m** with your Static
* Each takes **60% SP per Static stack** (300% at 5), and the stacks are consumed.
* Enemies consumed at **5 stacks** are **Stunned 1.5 s** (bosses: instead **Shocked 6 s**, +10% damage
  taken from all sources).
* Looks: a bolt from the sky onto every affected enemy at once (`projectile` lightning from 25 m up,
  `impact` crit style). Sound: one giant thunderclap, then the echo.

**`stormcaller_stormcrowned` — Stormcrowned** · slot 40 · 15% mana · 120 s · instant · self · **15 s**
* You rise **1 m** (visual — ground effects still hit you) with a crown of arcs.
* **Every spell you cast** also calls a sky bolt onto its target: **150% SP**.
* **Every rod fires** at the nearest enemy within 12 m **once per second**: **60% SP**.
* **+20% move speed.**
* Looks: `orbitOrb` lightning ×6 circling the head, `storm` lightning on your position (small),
  arcs between you and every rod. Sound: a building hum and continuous distant thunder.

---

## 4. Alternate spells — rods change spells

The Stormcaller has no second bar. Instead, **rods change what each spell does** when it involves one:

| Spell | Near / through a rod |
|---|---|
| Forked Spark | a jump may relay through a rod (+10 m reach, no damage loss) |
| Squall Step | can arrive at a rod up to 30 m away |
| Thunderhead | strikes a rod under it every 2 s → 4 m pulse |
| Galvanic Tether | anchors to the nearest rod |
| Skybreak | each rod also fires one bolt at the nearest enemy (100% SP) |
| Stormcrowned | rods fire every second |

---

## 5. Rotation / how it plays

### 5.1 Solo
Plant two rods across the path the pack will take, Forked Spark to pull, let them walk through the
fence, Thunderhead on them, Skybreak when most have 3+ Static. Squall Step away when they reach you.

### 5.2 Dungeon
Rods behind the tank's pack (a fence along the pack's back stops runners); Thunderhead on the pack;
Galvanic Tether on a caster add so the tank does not have to chase it. Skybreak stuns the whole pack at
5 stacks — a pack-wide interrupt every 20 s.

### 5.3 Raid
Rods are a **raid tool**: in a spread mechanic, plant one in each safe spot so Squall Step can reach it
later. A closed triangle (Eye of the Storm, from 20) around the melee gives them +15% speed. Save
Stormcrowned for the boss's damage phase; it scales with rods, so plant all four first.

### 5.4 Boss mechanics

| Mechanic | Stormcaller answer |
|---|---|
| **Danger zone** | Squall Step 12 m, or **to a pre-planted rod 30 m away** — the longest escape among the casters. |
| **Void zone** | Void zones destroy rods inside them — plant outside. |
| **Moving wave** | A fence does not stop a boss wave; rods caught in it are destroyed. |
| **Adds** | Fences and Skybreak are the class's add answers; Galvanic Tether pins a runner. |
| **Tether mechanic (white)** | A boss tether and a Galvanic Tether never share a colour. |
| **Interrupts** | No boss interrupt. Skybreak at 5 stacks stuns every non-boss caster. |

---

## 6. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Forked Spark | 1 | **Wide Fork** — 2 → 4 jumps, each 70 → 55% | **Heavy Spark** — no jumps, 200% SP, +2 Static | **Snap Cast** — cast 1.0 → 0.6 s |
| Forked Spark | 2 | **Return Arc** — the last jump returns to the first target (70%) | **Static Seed** — targets hit have Static lasting 8 → 14 s | — |
| Forked Spark | 3 | **Ground Strike** — each jump also hits a 2 m circle at the target | **Stack Seeker** — jumps prefer enemies with the **most** Static | — |
| Forked Spark | 4 | **Endless Fork** — a jump onto a 5-Static enemy doesn't count against the jump limit | **Storm Familiar** — every 4th Spark calls Farhold's `storm_familiar` for 8 s (it throws 50% SP sparks every 1.5 s) | — |
| Squall Step | 1 | **Twin Step** — 2 charges | **Long Squall** — 12 → 20 m | — |
| Squall Step | 2 | **Afterimage** — leaves a rod at your starting point (does not use a charge; 10 s) | **Charged Arrival** — 3 m burst at the arrival point, 120% SP | — |
| Squall Step | 3 | **Grounding** — you take 30% less damage for 3 s after | **Swap** — targeting a rod swaps the rod to where you stood | — |
| Squall Step | 4 | **Ally Step** — can target an ally; you both swap places | **Stormwalk** — the path leaves a 6 s fence line | — |
| Thunderhead | 1 | **Wide Cloud** — 5 → 8 m, 1 s → 1.3 s strikes | **Low Cloud** — strikes every 0.6 s, 60% | — |
| Thunderhead | 2 | **Drifting** — the cloud follows your target at walking speed | **Downpour** — rain inside slows enemies 25% | **Cloud Link** — a second cloud can exist at once |
| Thunderhead | 3 | **Conductor** — a strike on a 5-Static enemy splits to 3 nearby | **Soaked** — enemies under it get Static at 2 per strike | — |
| Thunderhead | 4 | **Supercell** — when it ends, all its strikes land at once (5 × 70% on random enemies) | **Rodcloud** — the cloud centres on one of your rods and moves with it if you replant | — |
| Galvanic Tether | 1 | **Short Line** — snap at 12 m, stun 2 s | **Long Line** — 6 → 10 s | — |
| Galvanic Tether | 2 | **Two Lines** — tethers two enemies to the same rod | **Reel** — the line drags the enemy 2 m per second toward the rod (non-boss) | — |
| Galvanic Tether | 3 | **Arc Web** — the tethered enemy's line also fences to every other rod within 15 m | **Grounded** — a tethered enemy's attacks deal 20% less | — |
| Galvanic Tether | 4 | **Lightning Leash** — tether an **ally** to a rod: they take 20% less damage and anything that hits them takes 60% SP | **Breakpoint** — the snap chains 4 times at 80% | — |
| Skybreak | 1 | **Clean Break** — stacks are consumed, but each enemy keeps 2 | **Deep Break** — 60 → 80% per stack, range 30 → 15 m | — |
| Skybreak | 2 | **Shatterstorm** — enemies killed by it explode 3 m for 100% SP | **Heavens' Reward** — you regain 1% mana per stack consumed | — |
| Skybreak | 3 | **Storm Sermon** — the strike leaves a 4 m electrified patch for 4 s at each 5-stack enemy | **Weather Front** — becomes a 30 m × 8 m line in front of you, but ignores stack count (fixed 250%) | — |
| Skybreak | 4 | **Eye Break** — enemies inside your Eye of the Storm take double | **Reset** — at least 3 five-stack enemies consumed resets Thunderhead | — |
| Stormcrowned | 1 | **Longer Crown** — 15 → 20 s | **Instant Crown** — every spell is instant for the first 5 s | — |
| Stormcrowned | 2 | **Crown of Rods** — gain 2 extra rods for its duration | **Eye in the Sky** — your party within 20 m gains +10% haste | — |
| Stormcrowned | 3 | **Stormshield** — attackers in melee take 80% SP (once per second each) | **Rider on the Wind** — Squall Step has no cooldown while crowned | — |
| Stormcrowned | 4 | **Final Thunder** — ends with a Skybreak at double | **Living Storm** — Static on enemies never expires while crowned | — |

---

## 7. Class sets

Cloth pieces (head, chest, hands, legs, feet) + a staff, wand or focus.

### 7.1 `set_stormcaller_galewrights_robes` — Galewright's Robes (levelling, 42–51)

Drops from `d11_saltdeep_cathedral` (head, hands, feet) and `d12_unmade_workshop` (chest, legs,
staff `it_galewright_staff`); Heroic at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Forked Spark jumps can hit the **same** enemy twice if no one else is in range | Forked Spark |
| 4 | Rods last 30 → 45 s and fences reach 15 → 20 m | the mechanic |
| 6 | Galvanic Tether's snap resets Squall Step and grants a rod charge | Tether, Squall Step |

### 7.2 `set_stormcaller_eye_of_the_tempest` — Eye of the Tempest (endgame)

Drops from `r05_veilspire` (level 60, 20 players).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Skybreak also strikes **every rod**, which releases a 5 m burst of 150% SP | Skybreak |
| 4 | Thunderhead strikes twice per second while inside your Eye of the Storm | Thunderhead |
| 6 | Stormcrowned makes every **fence** a wall enemies cannot cross (non-boss) and doubles fence damage | Stormcrowned, fences |

---

## 8. Legendaries and uniques

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_conductors_spire` | The Conductor's Spire | staff | Rods max **+1**, and fences join **every** pair of rods regardless of distance | `b_abbess_marenne` Abbess Marenne of the Deep Choir (`r03_sunken_choir` boss 6) |
| `leg_crown_of_a_hundred_bolts` | Crown of a Hundred Bolts | head, cloth | Forked Spark jumps **without limit** among enemies with 3+ Static (each jump still 70%, stops below 10% of the first hit) | `b_unmoored` The Unmoored (Riftmarch world boss) |
| `leg_skyanchor_boots` | Sky-Anchor Boots | feet, cloth | Squall Step has **2 charges** and plants a rod at the arrival point (free, 10 s) | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss, Heroic/Mythic+) |
| `leg_thunderwell_orb` | Thunderwell | off-hand focus (orb) | Overcharge discharges also add **1 Static** to every enemy within 8 m of the discharge — chain reactions | `b_castellan_brandt` Lord Castellan Aurel Brandt (`r04_ember_court` boss 5) |
| `leg_stormglass_heart` | Stormglass Heart | necklace | Standing inside your Eye of the Storm, every 5th spell is free and instant | `b_council_of_cold` The Council of Cold (`r02_glacier_throne` boss 5) |

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_copperwire_wand` | Copperwire | wand | +6 INT, +6% spell power | Wand bolts add 1 Static | `b_stonegullet` Stonegullet (`d03_deepdelve` end boss) |
| `uq_rainslick_cowl` | Rainslick Cowl | head, cloth | +8 INT, +8% magic resist | +15% move while it rains (page 01 weather) and Thunderhead lasts 10 → 16 s in rain | Mossfen rare elite (page 10 names it) |
| `uq_thunderjar` | The Thunderjar | off-hand focus (reuse `foci.js` `relic` model) | +8 INT, +12 mana | Planting a rod releases a 4 m burst of 100% SP | `b_gloamwing` Gloamwing (`d08_moonwell_ruins` sub-boss) |
| `uq_lodestone_ring` | Lodestone Ring | ring | +6 INT, +4% crit | Enemies with 5 Static are pulled 1 m per second toward your nearest rod | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss) |

---

## 9. Voice and barks

`voiceFor({ role: 'stormcaller', gender, seed })` (reuse `ROLE_VOICES.stormcaller`: pitch 0.48,
breath 0.3, speed 0.6). While Stormcrowned the voice gets a faint crackle (voice-lab `fx.js`, reuse).

| Moment | Lines (Lingo pool `stormcaller_*`) |
|---|---|
| Cast | "Arc!" · "Jump." · "Feel that?" |
| Plant rod | "Stand here." · "Hold this." |
| Crit | "Thunder!" · "Struck!" |
| Skybreak | "Sky — **break**!" |
| Low health | "The storm's spent…" · "Need cover — now!" |
| Stormcrowned | "Crown me, sky." |

---

## 10. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Lightning visuals | `spellfx.js` `lightning`, `storm()`, `orbitOrb()` | every spell, Static sparks |
| Chain maths | Farhold talent `chain` / `cascade` (`chains`, `chainFalloff` in `js/skilltalents.js`) | Forked Spark, Overcharge |
| Pet | Farhold `storm_familiar` | a tier-4 talent only |
| Wand behaviour | Farhold `WAND_BEHAVIOURS` `seeking` etc. — unchanged basic wand attacks | basic attack |
| Outfit | `class-outfits.json` `stormcaller` (hood, trim_robe, storm_rods) | as is; rods reuse the `storm_rods` look scaled to 1.8 m |
| Emberveil ideas | `chain_lightning` → Forked Spark, `static_field` → Static, `thunder_ring` → fences, `tempest` → Stormcrowned | ideas only |
| Not used | Farhold stormcaller skills `chain_bolt`, `frost_nova`, `storm_beam`, `thunderclap`, `quicken`, `meteor` | replaced |
| New | Stormrod prop + fence line, Static stacks, rod UI, Eye of the Storm triangle test | (new) |
