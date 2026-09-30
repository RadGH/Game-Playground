# Class: Stormcaller (`stormcaller`)

> *"Lightning never strikes twice? Then you have not met me."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 16.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role
**Damage**, hybrid role **Support**, build **caster**, **cloth** armour, resource **Mana**, mechanic **Static —
charges that chain between charged enemies; lightning rods driven into the ground (not totems)**, spell slots
1 / 4 / 10 / 18 / 28 / 40, calling quests 6 / 20 / 40, talent tiers 12 / 22 / 32 / 45, cap 60.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **SP** | Spell power (page 05 owns the formula; Farhold shape `WD × mult × (1 + spellPower)`, reuse `farhold/js/skills.js`). |
| **Mana** | the class resource (canon: a big pool that refills slowly; page 05 owns pool size and regeneration). Costs are **% of maximum mana**, so a cost never goes stale as the pool grows. |
| **Static** | a stack the Stormcaller puts on enemies, 0–5 per enemy (§2.1). |
| **Chain / jump** | a hit that leaps from one target to the next nearest within the stated distance; each jump takes the stated share. |
| **Rod** | a **lightning rod** the Stormcaller drives into the ground (§2.2). A rod is a prop, not a creature and not a totem: it has no health, does nothing on its own and cannot be attacked. |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** · **Auto-target** (no valid target → the valid enemy closest to your aim point in range) · **Self** · **Ally** (`F1`–`F5`) · **Ground**. |
| **Tags** | page 05 §Tags. Every Stormcaller damage spell carries `tag_lightning` and `tag_spell`. |
| **GCD** | 1.0 s global cooldown (canon). |

**Not the shaman.** The shaman (canon row 22) calls storm-beasts out of old folk tales. The Stormcaller has
no animals, no tales and no totems: it is a storm engineer — iron rods, charge counts and chain arithmetic.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A storm-mage who charges the air around enemies until it breaks, and drives iron **lightning rods** into the ground to fence the field with lightning. |
| Primary role | **Damage** (ranged, chain and zone control) |
| Hybrid role | **Support** — the party's **conductor** (§5): hastes allies through a charged ally (the Conduit), shields them from spells with grounded rods, and pins adds with fences |
| Build | caster |
| Armour | Cloth |
| Weapons | Staff, wand (+ orb/tome focus — reuse Farhold `js/foci.js`). Starter: **Iron-bound Wand** (reuse base `wand`). |
| Primary attribute | INT |
| Resource | **Mana** + **Static** stacks on enemies + **lightning rods** on the ground |
| Companion | None. |
| Playstyle | Spread Static with chains, plant rods to shape where enemies can walk, then break the sky: Skybreak consumes every stack at once. Rods double as relays for chains and as anchors for escaping mechanics. In a group, one ally becomes the Conduit and the whole kit starts feeding them speed. |

---

## 2. Class mechanic: **Static** and **lightning rods**

### 2.1 Static (on enemies)

* Every lightning hit from the Stormcaller adds **1 Static** to the enemy hit (max **5**). Static lasts
  **8 s**, refreshed by each new stack.
* Each Static stack makes the enemy take **+2% lightning damage from you** (+10% at 5).
* Shown as **1–5 small blue-white sparks orbiting the enemy's head** (spellfx `orbitOrb` lightning, size
  0.08) and as pips on the target frame.
* Other Stormcallers' Static is **separate** (each caster sees and spends their own).

### 2.2 Lightning rods (on the ground)

Planted with the **class key `Q`** ([page 02](../02-CONTROLS.md) §5.16) at a ground point within **25 m**.

| Property | Value |
|---|---|
| Body | a 1.8 m iron rod with a glass tip that glows (new prop; the `storm_rods` decor from `class-outfits.json` gives the look) |
| Lasts | 30 s, or until you plant one more than your maximum (the oldest is removed) |
| Charges | planting uses a charge; a charge returns every **8 s** |
| Max rods | 2 (Calling I) → 3 (Calling II) → 4 (Calling III) |
| **Fence** | any two of your rods within **15 m** of each other are joined by a crackling **blue-yellow arc** (deliberately *not* white, which page 11 reserves for tethers). An enemy touching a fence takes **30% SP every 0.5 s** and gains 1 Static a second (`tag_lightning` `tag_spell` `tag_area` `tag_duration`) |
| **Relay** | a chain jump may pass **through** a rod: the rod counts as a hop that costs nothing and adds 10 m to the next jump's reach |
| **Anchor** | Squall Step (slot 2) can target one of your rods up to 30 m away |
| **Grounding** | allies within **5 m** of a rod take **8% less damage from spells** (the rod drinks some of it) — the support half of the rods (§5) |
| Removal | enemies do not attack rods; boss room-wide effects and void zones destroy rods inside them |

### 2.3 UI

* Above the mana bar: **rod charges** as 2–4 small rod icons (filled = ready, a sweep shows the 8 s return).
  Each planted rod shows its remaining seconds on the icon.
* Holding `Q` shows a 25 m placement preview, including the fences that would form; releasing plants.
* The **Conduit** ally (§5) has a small blue-yellow bolt on their party frame.
* Sound: a low electrical hum near rods (3D sound, 10 m), a spark-crack whenever a fence hits something.

### 2.4 Class keys ([page 02](../02-CONTROLS.md) §5.16)

| Key | From | Does |
|---|---|---|
| `Q` (hold = preview, release = plant) | Calling I (6) | plant a **lightning rod** |
| `G` | Calling I (6) | **Conduit** on your friendly target (§5.1); press with no friendly target to clear it. *(New — page 02 listed no `G` for the Stormcaller.)* |

### 2.5 The calling quests (page 14 owns text; ids per 00 §10)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_stormcaller_1` | **The First Rod** | Hearthvale — a lightning-struck oak on the ridge; carry its iron spike to the smith through a storm while bolts target you (a dodge course), then help the smith's apprentice climb the mill roof while you keep the strikes off her | **lightning rods** (2 max), fences, and the **Conduit** |
| 20 | `q_calling_stormcaller_2` | **The Eye of the Storm** | Sunscar — stand in the eye of a sandstorm and hold three rods up for 90 s against waves | 3 rods · a **closed triangle** of fences becomes the **Eye of the Storm**: allies inside gain **+15% cast and attack speed** |
| 40 | `q_calling_stormcaller_3` | **The Sky that Answers** | Frostmantle — call lightning onto the peak of Rimehold's bell tower and ride the strike (a solo fight against a storm elemental) | 4 rods · **Overcharge**: an enemy reaching 5 Static **discharges on its own** for **150% SP** and chains 4 times (80% each, 8 m); its stacks reset to 0 |

### 2.6 JSON shape

```json
{
  "id": "stormcaller",
  "static": { "max": 5, "seconds": 8, "takeMorePerStack": 0.02 },
  "rods": { "range": 25, "seconds": 30, "recharge": 8, "maxByCalling": [2, 3, 4],
            "fence": { "maxGap": 15, "spPerHalfSecond": 0.3 }, "relayBonus": 10,
            "grounding": { "radius": 5, "spellTakenLess": 0.08 } },
  "conduit": { "range": 40, "staticPerSecond": 1, "relay": true, "galvanized": { "haste": 0.15, "seconds": 6 } },
  "eye": { "haste": 0.15 },
  "overcharge": { "sp": 1.5, "chains": 4, "falloff": 0.8, "jump": 8 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | CD | Cast | Target | Shape | Tags | Does |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `stormcaller_forked_spark` | Forked Spark | 2% | — | 1.0 s | Auto-target | bolt 30 m + 2 jumps (8 m) | `tag_lightning` `tag_spell` `tag_projectile` | 110% SP, jumps 70% |
| 2 | 4 | `stormcaller_squall_step` | Squall Step | 4% | 12 s | instant | Ground (12 m; 30 m to a rod) | flash line 2 m wide | `tag_lightning` `tag_spell` `tag_movement` `tag_area` | 80% SP along the path |
| 3 | 10 | `stormcaller_thunderhead` | Thunderhead | 6% | 15 s | instant | Ground (30 m) | cloud 5 m, 10 s | `tag_lightning` `tag_spell` `tag_area` `tag_duration` | a strike a second, 70% SP |
| 4 | 18 | `stormcaller_galvanic_tether` | Galvanic Tether | 5% | 18 s | instant | Needs target | enemy ↔ rod line, 6 s | `tag_lightning` `tag_spell` `tag_duration` | 40% SP/s; crossing 60%; snap 250% |
| 5 | 28 | `stormcaller_skybreak` | Skybreak | 7% | 20 s | instant | Self | every enemy within 30 m with your Static | `tag_lightning` `tag_spell` `tag_area` | 60% SP per stack, consumes |
| 6 | 40 | `stormcaller_stormcrowned` | Stormcrowned | 15% | 120 s | instant | Self | 15 s transformation | `tag_lightning` `tag_spell` `tag_aura` `tag_duration` | a sky bolt on every spell; rods fire |

### 3.2 Details

**1. `stormcaller_forked_spark` — Forked Spark** · level 1 · 2% mana · no cooldown · 1.0 s cast · **Auto-target** · 30 m
* **110% SP** lightning to the target, then **jumps twice** to the next nearest enemies within **8 m** for
  **70%** each. +1 Static on everything hit. A jump may relay through a rod or the Conduit ally (§2.2, §5).
* Tags: `tag_lightning` `tag_spell` `tag_projectile`.
* Looks: `projectile` lightning (instant bolt, speed 40) with the jagged line for each jump. Sound: a sharp
  crack, each jump a smaller crack.

**2. `stormcaller_squall_step` — Squall Step** · level 4 · 4% mana · 12 s · instant · **Ground**
* You become a bolt and **flash 12 m** toward the aimed point (or the way you move). Every enemy along a
  **2 m-wide** path takes **80% SP** and +1 Static.
* **Can target one of your rods up to 30 m away** — you arrive at the rod.
* Tags: `tag_lightning` `tag_spell` `tag_movement` `tag_area`.
* Looks: the body flashes to a white-blue line, `impact` lightning at both ends. Sound: thunder clap.

**3. `stormcaller_thunderhead` — Thunderhead** · level 10 · 6% mana · 15 s · instant · **Ground** within 30 m · **5 m** cloud for **10 s**
* Strikes a random enemy under it **every 1 s** for **70% SP** (+1 Static). Prefers enemies with the fewest
  stacks (spreads Static).
* **With a rod under it:** every 2 s the cloud also strikes the rod, which pulses **50% SP in 4 m**.
* Tags: `tag_lightning` `tag_spell` `tag_area` `tag_duration`.
* Looks: `spellfx.storm({ element: 'lightning', radius: 5, ms: 10000 })` — a dark cloud with strikes.
  Sound: rolling thunder loop.

**4. `stormcaller_galvanic_tether` — Galvanic Tether** · level 18 · 5% mana · 18 s · instant · **Needs target** (enemy) · 25 m
* Links the enemy to **your nearest rod** (to **you** if you have none) for **6 s**.
* The tethered enemy takes **40% SP a second**. Any other enemy crossing the line takes **60% SP** (once a
  second each). +1 Static a second on everything it touches.
* If the tethered enemy moves more than **20 m** from its anchor, the line **snaps**: **250% SP** and
  **Stunned 1 s** (bosses: break bar +10%).
* Tags: `tag_lightning` `tag_spell` `tag_duration`.
* Looks: a thick crackling rope, blue-yellow (not white — page 11 tether colour). Sound: a buzzing hum; a
  snap like a breaking cable.

**5. `stormcaller_skybreak` — Skybreak** · level 28 · 7% mana · 20 s · instant · **Self** · every enemy within **30 m** with your Static
* Each takes **60% SP per Static stack** (300% at 5), and the stacks are consumed.
* Enemies consumed at **5 stacks** are **Stunned 1.5 s** (bosses: instead **Shocked** 6 s — page 05, +15%
  damage taken from every source).
* Tags: `tag_lightning` `tag_spell` `tag_area`.
* Looks: a bolt from the sky onto every affected enemy at once (`projectile` lightning from 25 m up, `impact`
  crit style). Sound: one giant thunderclap, then the echo.

**6. `stormcaller_stormcrowned` — Stormcrowned** · level 40 · 15% mana · 120 s · instant · **Self** · **15 s**
* You rise **1 m** (visual — ground effects still hit you) with a crown of arcs.
* **Every spell you cast** also calls a sky bolt onto its target: **150% SP**.
* **Every rod fires** at the nearest enemy within 12 m **once a second**: **60% SP**.
* **+20% move speed.**
* Tags: `tag_lightning` `tag_spell` `tag_aura` `tag_duration`.
* Looks: `orbitOrb` lightning ×6 circling the head, `storm` lightning on your position (small), arcs between
  you and every rod. Sound: a building hum and continuous distant thunder.

### 3.3 How it plays

* **Solo:** plant two rods across the path the pack will take, Forked Spark to pull, let them walk through
  the fence, Thunderhead on them, Skybreak when most have 3+ Static. Squall Step away when they reach you.
* **Dungeon (Damage):** rods behind the tank's pack (a fence along the pack's back stops runners);
  Thunderhead on the pack; Galvanic Tether on a caster add so the tank does not have to chase it. Skybreak
  stuns the whole pack at 5 stacks — a pack-wide interrupt every 20 s.
* **Challenge mode and Depth:** rods are a **positioning tool**: in a spread mechanic, plant one in each safe
  spot so Squall Step can reach it later. A closed triangle (Eye of the Storm, from 20) around the melee gives
  them +15% speed. Save Stormcrowned for the boss's damage window; it scales with rods, so plant all four first.

### 3.4 Boss mechanics

| Mechanic | Stormcaller answer |
|---|---|
| **Danger zone** | Squall Step 12 m, or **to a pre-planted rod 30 m away** — the longest escape among the casters |
| **Void zone** | void zones destroy rods inside them — plant outside |
| **Moving wave** | a fence does not stop a boss wave; rods caught in it are destroyed |
| **Room-wide spell** | the party stacks on a rod: Grounding takes 8% off |
| **Adds** | fences and Skybreak are the class's add answers; Galvanic Tether pins a runner |
| **Tether mechanic (white)** | a boss tether and a Galvanic Tether never share a colour |
| **Interrupts** | no boss interrupt. Skybreak at 5 stacks stuns every non-boss caster |

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

## 5. The hybrid role — Support (the conductor)

**Role focus.** The Stormcaller uses the canon **Role focus** switch (00 §6: in the spellbook, out of combat
only, saved per Loadout; available from Calling I, level 6). Set to **Hybrid**, the Dungeon Finder queues it as
**Support** (a Damage slot, canon §4). The switch changes no spell: the **Conduit** (§5.1) and the rods'
Grounding are part of the class in either focus, and the support build is the talent picks in §5.2. Its support
is **speed and safety for the party**, paid for by some of its own damage (§5.3).

### 5.1 The Conduit (`G`)

| Rule | Value |
|---|---|
| Cast | `G` on your friendly target (`F2`–`F5` or a click on their frame). **Ally** targeting, 40 m. Off the GCD, 10 s cooldown, 2% mana. One Conduit at a time; it lasts until you pick another, clear it, or either of you dies. |
| Static | the Conduit's hits (weapon or spell) add **1 of your Static** to the enemy they hit, at most once a second per enemy. A melee Conduit keeps the boss at 5 Static for you. |
| Relay | your chains can jump **through** the Conduit like a rod (no damage loss, +10 m reach). |
| **Galvanized** | every time you consume Static with **Skybreak**, or an **Overcharge** fires (40), the Conduit gains **+15% attack and cast speed for 6 s**. |
| Look | a thin blue-yellow thread runs from you to the Conduit for 0.5 s every time Static passes; the Conduit's weapon crackles. |

### 5.2 The support kit

| Piece | What it does for the party |
|---|---|
| Conduit + Skybreak | **Galvanized**: +15% haste on your best damage dealer for 6 s of every 20 s (more with Overcharge at 40) |
| Rods — Grounding | allies within 5 m of a rod take **8% less spell damage**; plant one where the party stacks |
| Eye of the Storm (20) | a triangle of three rods gives everyone inside **+15% cast and attack speed** |
| Fences + Galvanic Tether | add control: runners are fenced or leashed, casters are stunned by a 5-stack Skybreak |
| Squall Step t4a **Ally Step** | swap places with an ally in danger |
| Galvanic Tether t4a **Lightning Leash** | tether an **ally** to a rod: −20% damage taken, attackers are shocked |
| Stormcrowned t2b **Eye in the Sky** | the party within 20 m gains +10% haste for 15 s |
| Thunderhead t2b **Downpour** | enemies under the cloud are slowed 25% |
| Talents to take | the ones above, plus Skybreak t2b **Heavens' Reward** (mana) and Forked Spark t2b **Static Seed** (Static lasts longer, so Galvanized comes more often) |

### 5.3 How good it is

In a support build the Stormcaller does about **75%** of its damage-build damage and adds, on average over a
fight, about **+6% damage to the Conduit** (Galvanized uptime ≈ 35–50%), **+15% haste inside the Eye** for the
melee, **8% spell mitigation** on the rod stack point and a pack-wide stun every 20 s. That is strong in the
**open world, Normal dungeons and Depth up to about 10**, where add control matters most. In **Challenge
mode**, bosses move the fight often and destroy rods with room-wide casts, so the Eye and Grounding are up less
of the time; a dedicated support (bard, tactician) gives more there.

---

## 6. Utility spells

None. The Stormcaller uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45; a tier opens at the later of its level and the
spell's slot level.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Forked Spark | 1 | **Wide Fork** — 2 → 4 jumps, each 70 → 55% | **Heavy Spark** — no jumps, 200% SP, +2 Static | **Snap Cast** — cast 1.0 → 0.6 s |
| Forked Spark | 2 | **Return Arc** — the last jump returns to the first target (70%) | **Static Seed** — targets hit have Static lasting 8 → 14 s | — |
| Forked Spark | 3 | **Ground Strike** — each jump also hits a 2 m circle at the target (`tag_area` added) | **Stack Seeker** — jumps prefer enemies with the **most** Static | — |
| Forked Spark | 4 | **Endless Fork** — a jump onto a 5-Static enemy doesn't count against the jump limit | **Ball Lightning** — every 4th Spark leaves a crackling ball at the target for 8 s that throws a 50% SP spark at the nearest enemy every 1.5 s (a spell effect, not a creature) | — |
| Squall Step | 1 | **Twin Step** — 2 charges | **Long Squall** — 12 → 20 m | — |
| Squall Step | 2 | **Afterimage** — leaves a rod at your starting point (does not use a charge; 10 s) | **Charged Arrival** — 3 m burst at the arrival point, 120% SP | — |
| Squall Step | 3 | **Grounding Step** — you take 30% less damage for 3 s after | **Swap** — targeting a rod swaps the rod to where you stood | — |
| Squall Step | 4 | **Ally Step** — can target an ally (Ally targeting); you swap places | **Stormwalk** — the path leaves a 6 s fence line | — |
| Thunderhead | 1 | **Wide Cloud** — 5 → 8 m, strikes every 1 → 1.3 s | **Low Cloud** — strikes every 0.6 s, 60% | — |
| Thunderhead | 2 | **Drifting** — the cloud follows your target at walking speed | **Downpour** — rain inside slows enemies 25% | **Cloud Link** — a second cloud can exist at once |
| Thunderhead | 3 | **Conductor** — a strike on a 5-Static enemy splits to 3 nearby | **Soaked** — enemies under it get Static at 2 per strike | — |
| Thunderhead | 4 | **Supercell** — when it ends, all its strikes land at once (5 × 70% on random enemies) | **Rodcloud** — the cloud centres on one of your rods and moves with it if you replant | — |
| Galvanic Tether | 1 | **Short Line** — snap at 12 m, stun 2 s | **Long Line** — 6 → 10 s | — |
| Galvanic Tether | 2 | **Two Lines** — tethers two enemies to the same rod | **Reel** — the line drags the enemy 2 m a second toward the rod (non-boss) | — |
| Galvanic Tether | 3 | **Arc Web** — the tethered enemy's line also fences to every other rod within 15 m | **Grounded** — a tethered enemy's attacks deal 20% less | — |
| Galvanic Tether | 4 | **Lightning Leash** — tether an **ally** to a rod (Ally targeting): they take 20% less damage and anything that hits them takes 60% SP | **Breakpoint** — the snap chains 4 times at 80% | — |
| Skybreak | 1 | **Clean Break** — stacks are consumed, but each enemy keeps 2 | **Deep Break** — 60 → 80% per stack, range 30 → 15 m | — |
| Skybreak | 2 | **Shatterstorm** — enemies killed by it explode 3 m for 100% SP | **Heavens' Reward** — you regain 1% mana per stack consumed | — |
| Skybreak | 3 | **Storm Sermon** — the strike leaves a 4 m electrified patch for 4 s at each 5-stack enemy (`tag_duration` added) | **Weather Front** — becomes a 30 m × 8 m line in front of you that ignores stack count (fixed 250%) | — |
| Skybreak | 4 | **Eye Break** — enemies inside your Eye of the Storm take double | **Reset** — consuming at least three 5-stack enemies resets Thunderhead | — |
| Stormcrowned | 1 | **Longer Crown** — 15 → 20 s | **Instant Crown** — every spell is instant for the first 5 s | — |
| Stormcrowned | 2 | **Crown of Rods** — gain 2 extra rods for its duration | **Eye in the Sky** — your party within 20 m gains +10% haste | — |
| Stormcrowned | 3 | **Stormshield** — attackers in melee take 80% SP (once a second each) | **Rider on the Wind** — Squall Step has no cooldown while crowned | — |
| Stormcrowned | 4 | **Final Thunder** — ends with a Skybreak at double | **Living Storm** — Static on enemies never expires while crowned | — |

*(Round 1's "Storm Familiar" talent — a summoned pet — is now **Ball Lightning**, a spell effect: no class
summons a creature out of nothing, 00 §6.)*

---

## 8. Class sets

Cloth pieces (head, chest, hands, legs, feet) + a staff, wand or focus.

### 8.1 `set_stormcaller_galewrights_robes` — Galewright's Robes (dungeon set, 42–51)

Drops from `d11_saltdeep_cathedral` bosses (head, hands, feet) and `d12_unmade_workshop` bosses (chest, legs,
staff `it_galewright_staff`) on **Normal** at the dungeon's level and on **Challenge** at item level 60; Depth
runs can drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Forked Spark jumps can hit the **same** enemy twice if no one else is in range | Forked Spark |
| 4 | Rods last 30 → 45 s and fences reach 15 → 20 m | the mechanic |
| 6 | Galvanic Tether's snap resets Squall Step and grants a rod charge | Tether, Squall Step |

### 8.2 `set_stormcaller_eye_of_the_tempest` — Eye of the Tempest (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which) and from the **end chest of any dungeon at Depth 10 or deeper** (one random piece, 8%).
*(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Skybreak also strikes **every rod**, which releases a 5 m burst of 150% SP | Skybreak |
| 4 | Thunderhead strikes twice a second while inside your Eye of the Storm | Thunderhead |
| 6 | Stormcrowned makes every **fence** a wall non-boss enemies cannot cross and doubles fence damage | Stormcrowned, fences |

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_conductors_spire` | The Conductor's Spire | staff | Rods max **+1**, and fences join **every** pair of rods regardless of distance | `b_the_gravity_engine` The Gravity Engine (`d12_unmade_workshop` main boss) on Challenge |
| `leg_crown_of_a_hundred_bolts` | Crown of a Hundred Bolts | head, cloth | Forked Spark jumps **without limit** among enemies with 3+ Static (each jump still 70%; stops below 10% of the first hit) | `b_unmoored` The Unmoored (Riftmarch world boss) |
| `leg_skyanchor_boots` | Sky-Anchor Boots | feet, cloth | Squall Step has **2 charges** and plants a rod at the arrival point (free, 10 s) | `b_oddrin_the_unmaker` Vell Oddrin, the Unmaker (`d12_unmade_workshop` end boss) on Challenge, and its Depth end chest |
| `leg_thunderwell_orb` | Thunderwell | off-hand focus (orb) | Overcharge discharges also add **1 Static** to every enemy within 8 m of the discharge — chain reactions | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_stormglass_heart` | Stormglass Heart | necklace | Standing inside your Eye of the Storm, every 5th spell is free and instant | the end chest of any dungeon at **Depth 15+** (1.5%) |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_coilwire_wand` | Coilwire | wand | +6 INT, +6% spell power | Wand bolts (basic attacks) add 1 Static | `b_stonegullet` Stonegullet (`d03_shaft_seven` end boss) |
| `uq_rainslick_cowl` | Rainslick Cowl | head, cloth | +8 INT, +8% magic resist | +15% move while it rains (page 01 weather) and Thunderhead lasts 10 → 16 s in rain | Mossfen rare elite (page 10 names it) |
| `uq_thunderjar` | The Thunderjar | off-hand focus (reuse `foci.js` `relic` model) | +8 INT, +12 mana | Planting a rod releases a 4 m burst of 100% SP | `b_gloamwing` Gloamwing (`d08_moonwell_ruins` sub-boss) |
| `uq_lodestone_ring` | Lodestone Ring | ring | +6 INT, +4% crit | Non-boss enemies with 5 Static are pulled 1 m a second toward your nearest rod | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss) |

### 9.3 Souls

Both need the wearer to be a **stormcaller**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_grounding_rod` | Soul of the Grounding Rod | armour — legs | class: stormcaller | Each of your rods **catches** the first enemy spell projectile aimed at an ally within 5 m of it (the projectile strikes the rod instead and is lost; once per rod every 10 s). | `b_the_gravity_engine` (`d12_unmade_workshop` main boss) on Challenge (3%); `b_unmoored` world boss (2%) |
| `soul_forked_sky` | Soul of the Forked Sky | weapon | class: stormcaller | The last jump of each Forked Spark returns to you as a **Charge** (max 5). At 5 Charges your next Skybreak costs nothing and deals +30%; the Conduit is Galvanized for 10 s instead of 6. | end chest at **Depth 15+** (1%); `b_carrion_crown` The Carrion Crown (Cinder Steppe world boss, 2%) |

---

## 10. Voice and barks

`voiceFor({ role: 'stormcaller', gender, seed })` (reuse `ROLE_VOICES.stormcaller`: pitch 0.48, breath 0.3,
speed 0.6). While Stormcrowned the voice gets a faint crackle (voice-lab `fx.js`, reuse).

| Moment | Lines (Lingo pool `stormcaller_*`) |
|---|---|
| Cast | "Arc!" · "Jump." · "Feel that?" |
| Plant rod | "Stand here." · "Hold this." |
| Conduit set | "{name} — you're carrying the charge." · "Hit hard, {name}. I'll do the rest." |
| Crit | "Thunder!" · "Struck!" |
| Skybreak | "Sky — **break**!" |
| Low health | "The storm's spent…" · "Need cover — now!" |
| Stormcrowned | "Crown me, sky." |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Lightning visuals | `spellfx.js` `lightning`, `storm()`, `orbitOrb()` | every spell, Static sparks |
| Chain maths | Farhold talent `chain` / `cascade` (`chains`, `chainFalloff` in `js/skilltalents.js`) | Forked Spark, Overcharge, Conduit relay |
| Wand behaviour | Farhold `WAND_BEHAVIOURS` — unchanged basic wand attacks | basic attack |
| Outfit | `class-outfits.json` `stormcaller` (hood, trim_robe, storm_rods) | as is; rods reuse the `storm_rods` look scaled to 1.8 m |
| Emberveil 2 prototype ideas | `chain_lightning` → Forked Spark, `static_field` → Static, `thunder_ring` → fences, `tempest` → Stormcrowned | ideas only |
| Not used | Farhold stormcaller skills `chain_bolt`, `frost_nova`, `storm_beam`, `thunderclap`, `quicken`, `meteor`; Farhold pet `storm_familiar` | replaced |
| New | lightning rod prop + fence line, Grounding, the Conduit, Static stacks, rod UI, Eye of the Storm triangle test, Ball Lightning | (new) |
