# Scavenger (`scavenger`)

> *"One man's rubbish is my ammunition, my armour, and — if the dice are kind — my retirement."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 12.
Formulas: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Items and salvage: [page 08](../08-ITEMS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% weapon damage** | share of the held weapon's damage roll (reuse: `prototypes/farhold/js/rpg.js` `strike`); page 05 owns it |
| **Focus** | pool 100, regenerates **12 a second** (the rate the other Focus classes assume; page 05 owns it) |
| **Junk** | the scavenger's second resource: pieces of rubbish carried in **the Pack** (§2) |

**Naming rule.** The Tinker's second resource is called **Scrap** ([tinker](tinker.md)). To keep the two
classes apart the scavenger's is always **Junk**, and the scavenger never builds turrets or gadgets that
act on their own — junk is thrown, blown up or stacked into a wall, and that is all.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A road-rat who has never paid full price for anything. Everything on the battlefield is a weapon if you are not proud: pot lids, horseshoes, broken gears, a cracked bell. And now and then something in the pile *shines* |
| Role | **Damage** (melee with thrown and area tricks) |
| Armour | light |
| Weapons | any **one-handed** weapon: **dagger, sword, hammer, javelin** (Farhold's list; reuse `fh_javelin`, cleaver look) — no shield; the off hand is always free for throwing |
| Resource | **Focus** + **Junk** in **the Pack** (0–10 → 20) |
| Companion | none |
| Playstyle | Hit things with whatever is in your hand, and pick up what falls off them. Junk is ammunition: one piece for a toss, three for a bomb, four for a wall. Your big finisher is a gamble — **Big Score** rolls anywhere from 60% to 540% — and every piece of junk you feed it cuts the chance of a bad roll |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `scavenger`): *Lucky Strike
inflicts random statuses; Big Score is a high-variance gamble — crit huge or whiff; Thrown Junk; Makeshift Bomb.*
All four live on: **Lucky Swing**, **Big Score**, **Junk Toss** and **Pack Bomb**.

---

## 2. Class mechanic — The Pack (new)

### 2.1 Where junk comes from

| Source | Junk |
|---|---|
| any weapon hit | **15%** chance of +1 (max 1 a second) |
| `scavenger_lucky_swing` status proc | +1 |
| an enemy dies | drops **1–2 junk pickups** on the ground (elites 4) |
| a **boss** loses each 10% of its health | **2 pickups** fall near it |
| a breakable prop (crate, barrel, cart — reuse Farhold `js/props.js` breakables) | 2 |
| `scavenger_rummage` | 3 on its commonest roll |

**Pickups** are small glinting heaps (a random mesh from a junk set: pot, horseshoe, gear, bell, bottle,
boot). They are picked up automatically within **3 m**, last **20 s**, and only the scavenger who caused them
sees them (no fighting over junk in a group). Two scavengers in a party each see their own.

### 2.2 The Pack

1. Holds **10** junk (15 after calling 2, 20 after calling 3). Junk **stays** in the pack between fights and
   through death (it is junk; nobody takes it).
2. **Shinies:** each pickup has a **3%** chance to be a **Shiny** instead (5% after calling 2). You hold at most
   **1** Shiny (2 after calling 2). A Shiny is spent only by **Big Score** (a guaranteed top roll) or by the
   `leg_grits_lucky_penny` legendary.
3. **Overloaded** (calling 3): at a full pack you deal **+10% damage** and move **5% slower**.

### 2.3 Class keys ([page 02](../02-CONTROLS.md))

| Key | From | Action |
|---|---|---|
| `Q` (`classKey`) | calling 1 | **Scrounge** — every junk pickup within **10 m** flies to you, and you find **+1 junk** in your pockets. Cooldown 12 s |
| `G` (`classKey2`) | calling 3 | **Junk Avalanche** — dump the whole pack in a **12 m, 60° cone**: **25% weapon damage per piece of junk** to each enemy (a full 20-piece pack: 500%), knockback 3 m. Cooldown 30 s. Needs 10+ junk |

### 2.4 Salvager's Eye (passive, calling 1)

* Salvaging an item at a crafting bench (`scr_craft_bench`, page 08 salvage) gives **+20% materials**.
* Vendors pay **+25%** for grey (Common "junk") items.
* Out of combat, `scavenger_rummage` on a fresh enemy corpse finds **20–40% of that enemy's gold drop** again
  (once per corpse; gold only, never items, so it cannot duplicate loot).

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Pack counter** | page 03's stack-counter gauge (`hud_gauge`) | a satchel icon with the junk count "7/10"; the satchel bulges at 50% and 100% |
| **Junk costs** | on spell slots | a small "1 / 3 / 4" junk badge in the bottom-left of Junk Toss, Pack Bomb and Barricade; red when you do not have it |
| **Shiny slot** | right of the satchel | 1–2 coin slots that glint gold when full |
| **Big Score floor** | over Big Score's slot | the current worst roll ("min 180%") so you can see what feeding it junk does |
| **Pickups** | in the world | glinting heaps with a small sparkle; a Shiny glints gold and chimes (`coin`) |

### 2.6 Calling quests (ids proposed; page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_scavenger_calling_1` | **Pack Rat** — Brightwater's rag-and-bone woman lends you her old pack if you clear the rats from her yard and bring back 20 useful things from the river | **The Pack** (junk pickups, the counter), **Scrounge** on `Q`, **Salvager's Eye**. Before this, Junk Toss throws a rock and Pack Bomb cannot be learned early |
| 20 | `q_scavenger_calling_2` | **Magpie's Knack** — win back a stolen Shiny from a Sandsworn gambling den with loaded dice (a dialog + dice mini-game reusing Farhold's d20 popup, `js/ui.js` `skillCheckPopup`) | pack **15**; Shinies **5%**, hold **2**; each junk spent has a **10%** chance to come straight back |
| 40 | `q_scavenger_calling_3` | **The Hoard** — loot an orc war camp's midden in the Cinder Steppe and carry it out before the warband wakes | pack **20**; **Overloaded**; **Junk Avalanche** on `G` |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `scavenger_lucky_swing` | Lucky Swing | 15 Focus | — | instant | 3 m | arc 100° | 120% weapon, 30% random status |
| 2 | 4 | `scavenger_junk_toss` | Junk Toss | 20 Focus + 1 junk | 3 s (2 charges) | instant | 25 m | bolt | 140% weapon, 20% stun 1 s |
| 3 | 10 | `scavenger_pack_bomb` | Pack Bomb | 30 Focus + 3 junk | 12 s | instant (1.0 s fuse) | 20 m lob | ground circle 5 m | 170% weapon fire, Burn, knockback |
| 4 | 18 | `scavenger_rigged_barricade` | Rigged Barricade | 20 Focus + 4 junk | 25 s | 0.5 s | 8 m | wall 4 m × 1.6 m | blocks projectiles, pathing and sight, 20 s |
| 5 | 28 | `scavenger_rummage` | Rummage | 10 Focus | 30 s | channel 1.5 s | self | self | d20 roll: junk, heal, buff, caltrops, a Shiny |
| 6 | 40 | `scavenger_big_score` | Big Score | 40 Focus + up to 5 junk | 20 s | 0.6 s wind-up | 4 m | melee, one target | 300% ± 80% (60–540%); junk raises the floor |

### 3.2 Spell details

#### `scavenger_lucky_swing` — Lucky Swing (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 15 Focus · none (GCD) |
| Cast | instant, a real three-part swing (reuse: Farhold's wind-up / damage / recovery, `js/weapons.js`) |
| Range / shape | arc **100°**, **3 m**, or the weapon's own reach and arc if larger (Farhold rule) |
| Effect | **120% weapon damage** to everything in the arc |
| Statuses | **30%** chance per enemy hit of one random status: **Poison 6 s** (20% weapon/s) · **Bleed 6 s** (20% weapon/s) · **Dazed 2 s** (non-elites are stunned 1 s instead) |
| Mechanic | each status proc **+1 junk** |
| Visuals | the weapon swing (Farhold `melee.swing` clip for the held family); a tiny four-leaf clover sprite (new `fx` sprite `clover`, 64×64) pops over a target when a status lands, then that status's `STATUS_FX` aura |
| Sound | `melee.swing`, `melee.hit`; proc: a "ting" (`coin` pitched up) + the status's `status.*.apply` |

#### `scavenger_junk_toss` — Junk Toss (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Focus + **1 junk** · 3 s, **2 charges** |
| Cast | instant, usable while moving |
| Range / shape | bolt 25 m, 0.4 m radius, 20 m/s, arcs slightly |
| Effect | **140% weapon damage**; **20%** chance to **stun 1 s** (non-bosses) |
| No junk | throws a rock: **70%**, no stun (and before calling 1 this is all it does) |
| Visuals | spellfx `projectile` element `physical` with a random junk mesh as the head (pot, horseshoe, gear, bottle, boot, bell — six small new props), spinning; `impact` physical + `_burst` of debris |
| Sound | the matching clatter (`fragment.crash.small`; the bell rings, the bottle smashes) |

#### `scavenger_pack_bomb` — Pack Bomb (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 30 Focus + **3 junk** · 12 s |
| Cast | instant lob, lands where you aim within 20 m |
| Range / shape | **5 m circle**; **1.0 s fuse** after landing. Your own bomb shows a faint orange outline to your party (not a page 11 telegraph colour — allies are not hurt) |
| Effect | **170% weapon damage** as fire; enemies are **knocked 2 m** away from the centre |
| Statuses | **Burn 4 s** (20% weapon/s) |
| Visuals | a lumpy sack with a fizzing fuse (new prop `pack_bomb`); spellfx `aoe` element `fire` radius 5 + `_burst` of junk shrapnel + `_puff` smoke |
| Sound | fuse hiss `scavenger.fuse` → `spell.fire.impact` + `fragment.crash.medium` |

#### `scavenger_rigged_barricade` — Rigged Barricade (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Focus + **4 junk** · 25 s |
| Cast | 0.5 s; placed **8 m** ahead, facing you (a ghost shows where it will stand, reuse Farhold's build ghost) |
| Shape | a wall **4 m wide, 1.6 m tall, 0.6 m deep** |
| Health / time | **30% of the scavenger's max health**, **20 s**; one per scavenger (a new one removes the old) |
| Effect | **blocks enemy projectiles** and **enemy movement** (they path round or break it); **blocks line of sight** for boss line-of-sight casts ("hide behind something") for anyone standing directly behind it (up to 4 m wide of cover). Allies' own shots pass over it |
| Visuals | a stacked heap of cart wheels, a door and barrels (new prop `junk_barricade`, three damage states: whole / cracked / leaning); breaks with `fragment.crash.large` |
| Sound | hammering `scavenger.build` (0.5 s) then a thud |

#### `scavenger_rummage` — Rummage (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | 10 Focus · 30 s |
| Cast | **channel 1.5 s**; you can walk at 50% while rummaging |
| Range / shape | self |
| Effect | rolls a **d20** (shown with Farhold's animated d20, reuse `js/ui.js` `skillCheckPopup`, small, over your head): |

| Roll | Chance | Result |
|---|---|---|
| 1–6 | 30% | **+3 junk** |
| 7–10 | 20% | **heal 20% max health** |
| 11–13 | 15% | a random tonic: **Haste 8 s** (+20% attack and move) / **Mending 10 s** (2% max health a second) / **barrier 15% max health 8 s** |
| 14–16 | 15% | **caltrops**: a 6 m circle round you, enemies in it slowed 50% and take 10% weapon a second, 8 s |
| 17–19 | 15% | **Sparkpowder**: your next 3 weapon hits add Burn 4 s |
| 20 | 5% | a **Shiny** (if you are already full, +5 junk instead) |

Out of combat on a fresh corpse: Salvager's Eye gold (§2.4). Sound: rummaging clatter `scavenger.rummage` + the d20 roll.

#### `scavenger_big_score` — Big Score (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 40 Focus + **up to 5 junk** (spends whatever you have, up to 5) · 20 s |
| Cast | 0.6 s wind-up (a big overhead swing), then the hit |
| Range / shape | melee **4 m**, one target |
| Effect | **300% weapon damage ± 80%**: a flat random roll from **60% to 540%**. Each junk spent **raises the floor by 40%** (5 junk: 260%–540%). A roll in the top 10% **always crits** |
| Shiny | if you hold a Shiny it is spent: the roll is **540% and a crit**, no junk spent |
| Visuals | a three-reel "tumbler" of coin, skull and clover symbols spins over your head for the 0.6 s (new HUD-in-world sprite) and stops on the result: all coins = top roll, gold flash + `_burst` of coin sprites; a low roll = a sad puff of dust |
| Sound | a ratchet spin `scavenger.tumbler`; top roll: `loot.legendary` jingle; low roll: a trombone-ish "wah" (formant synth, `voice-lab`) |

### 3.3 Rotation / how it plays

* **Solo:** Lucky Swing to build junk and statuses, Junk Toss as a ranged pull and finisher, Pack Bomb on a
  group. Break every crate you pass — junk is free ammunition. Rummage when hurt (a 20% heal is half the table's
  second-best roll; a d20 is not a healer, so carry potions). Big Score with 5 junk on an elite.
* **Dungeon (5):** junk rains from the boss every 10% — you will usually have a full pack. Pack Bomb on trash,
  Big Score on cooldown on the boss with 3–5 junk (floor 180–260%). The Barricade is the group's portable
  pillar: learn which bosses have line-of-sight casts (page 11) and drop it before the cast.
* **Raid:** steady melee damage with a high-variance spike. Save Shinies for the boss's vulnerable phase.
  Junk Avalanche (calling 3) on add waves. Tell the raid leader you can bring cover — a Barricade handles one
  line-of-sight check every 25 s.

### 3.4 Boss mechanics

| Mechanic | Scavenger answer |
|---|---|
| **Soak** | can soak; Rummage's barrier/heal rolls help but are not reliable |
| **Line of sight** | **Rigged Barricade** is cover for up to 4 m of allies behind it |
| **Projectile barrages** | Barricade blocks enemy projectiles from the far side |
| **Void / danger zones** | no blink by default; talent `scavenger_pack_bomb_t1b` *Blast Jump* throws you 10 m |
| **Interrupt** | talent `scavenger_junk_toss_t2a` *Pot Lid* makes Junk Toss interrupt (10 s internal) |
| **Adds** | Pack Bomb knockback, caltrops from Rummage, Junk Avalanche |
| **Immunity** | none |

---

## 4. Alternate spells

None. `Q` (Scrounge) and `G` (Junk Avalanche) are class keys, not spells.

---

## 5. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open when a later spell is learned).

### `scavenger_lucky_swing`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_lucky_swing_t1a` | Wild Swing | arc becomes **360°**, 90% weapon |
| 1 | `scavenger_lucky_swing_t1b` | Loaded Swing | one target, **+50%**, status chance **60%** |
| 2 | `scavenger_lucky_swing_t2a` | Rattled Pockets | every hit (not only procs) gives junk at **25%** |
| 2 | `scavenger_lucky_swing_t2b` | Loaded Dice | the random status is always the one the target **does not have yet** |
| 2 | `scavenger_lucky_swing_t2c` | Rusty Edge | adds **Sunder** (armour −15%, 6 s) to the status table |
| 3 | `scavenger_lucky_swing_t3a` | Hat Trick | landing **3 different statuses** on one enemy makes it **take +20% from you** for 8 s |
| 3 | `scavenger_lucky_swing_t3b` | Pickpocket | a proc on an elite steals **a potion charge's worth**: heal 5% max health |
| 4 | `scavenger_lucky_swing_t4a` | Lucky Streak | each proc gives **+5% status chance** until a swing procs nothing (max +30%) |
| 4 | `scavenger_lucky_swing_t4b` | Swing for the Fences | every 5th swing is a **free Big Score at 50%** (junk not spent) |

### `scavenger_junk_toss`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_junk_toss_t1a` | Handful | throws **3 pieces** in a 20° fan for 1 junk, 60% each |
| 1 | `scavenger_junk_toss_t1b` | Anvil | 2 junk: **+80%**, stun chance **50%** |
| 2 | `scavenger_junk_toss_t2a` | Pot Lid | **interrupts** (10 s internal cooldown) |
| 2 | `scavenger_junk_toss_t2b` | Ricochet Kettle | **bounces** to 2 more enemies at 60% |
| 3 | `scavenger_junk_toss_t3a` | Recycler | junk that hits drops as a **pickup** where it lands (50% chance) |
| 3 | `scavenger_junk_toss_t3b` | Third Pocket | **3 charges** |
| 4 | `scavenger_junk_toss_t4a` | Bell Toll | a thrown bell **Dazes every enemy in 6 m** of the target for 2 s (every 3rd toss) |
| 4 | `scavenger_junk_toss_t4b` | Hail of Junk | at a full pack the toss **throws 5 pieces for 1 junk** |

### `scavenger_pack_bomb`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_pack_bomb_t1a` | Cluster | splits into **3 small bombs** (3 m, 80% each) around the aim point |
| 1 | `scavenger_pack_bomb_t1b` | Blast Jump | aim at your own feet: **you are thrown 10 m** in the direction you face, unharmed (the bomb still hurts enemies) — the class's escape |
| 2 | `scavenger_pack_bomb_t2a` | Nail Bomb | adds **Bleed 6 s** instead of Burn |
| 2 | `scavenger_pack_bomb_t2b` | Smoke Bomb | leaves a **6 m smoke cloud** for 5 s: enemies inside **miss 30%** of ranged attacks |
| 3 | `scavenger_pack_bomb_t3a` | Sticky Fuse | sticks to the **first enemy** it hits and goes off on it (+40%) |
| 3 | `scavenger_pack_bomb_t3b` | Fireworks | enemies killed by it **drop 2 extra** junk pickups |
| 4 | `scavenger_pack_bomb_t4a` | Chain of Sacks | **2 charges**, cost 2 junk |
| 4 | `scavenger_pack_bomb_t4b` | Big Bang | at 10+ junk, costs **6 junk**: 8 m, **300%**, knockback 5 m |

### `scavenger_rigged_barricade`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_rigged_barricade_t1a` | Ring of Crates | a **ring of 4 short walls** round you (3 m radius, gaps at the corners), 12 s |
| 1 | `scavenger_rigged_barricade_t1b` | Long Fence | **8 m wide**, 1.2 m tall |
| 2 | `scavenger_rigged_barricade_t2a` | Spiked | enemies hitting it take **30% weapon** a hit |
| 2 | `scavenger_rigged_barricade_t2b` | Rigged to Blow | press the spell again to **detonate** it: **200%** in a 5 m line in front |
| 3 | `scavenger_rigged_barricade_t3a` | Vault | pressing jump next to it **vaults you 6 m** over it |
| 3 | `scavenger_rigged_barricade_t3b` | Scrounger's Stash | when it expires it **returns 2 junk** |
| 4 | `scavenger_rigged_barricade_t4a` | Mirror Door | projectiles it blocks are **thrown back** at their shooter (50% damage) |
| 4 | `scavenger_rigged_barricade_t4b` | Two Doors | **2 barricades** at once |

### `scavenger_rummage`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_rummage_t1a` | Quick Hands | **instant**, cooldown 36 s |
| 1 | `scavenger_rummage_t1b` | Deep Pockets | roll **2d20, keep the higher** |
| 2 | `scavenger_rummage_t2a` | Share the Haul | tonics and heals also land on **2 nearby allies** |
| 2 | `scavenger_rummage_t2b` | Field Kitchen | 7–10 heals **30%** and clears one poison or bleed |
| 3 | `scavenger_rummage_t3a` | Known Pile | you choose **one** result band before rolling; if the roll lands in it, the effect is doubled |
| 3 | `scavenger_rummage_t3b` | Throwaway | roll 1–6 also **throws** the 3 junk as a free Junk Toss volley |
| 4 | `scavenger_rummage_t4a` | Natural Twenty | the Shiny band is **18–20** (15%) |
| 4 | `scavenger_rummage_t4b` | Bottomless | each roll also **resets Junk Toss** charges |

### `scavenger_big_score`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_big_score_t1a` | Long Shot | **thrown**: 20 m bolt, same roll, −20% |
| 1 | `scavenger_big_score_t1b` | Safe Bet | range **200–400%**, junk raises the floor 30% each |
| 2 | `scavenger_big_score_t2a` | Double or Nothing | a roll under 150% **refunds the cooldown** |
| 2 | `scavenger_big_score_t2b` | Share the Pot | a top roll (crit) gives the **party +10% damage** for 6 s |
| 3 | `scavenger_big_score_t3a` | Jackpot Spill | a top roll **spills 5 junk pickups** and gives 5 Focus each |
| 3 | `scavenger_big_score_t3b` | House Edge | each junk spent also adds **+2% crit damage** to the hit (max +10%) |
| 4 | `scavenger_big_score_t4a` | All In | spends **every** junk in the pack (up to 20): floor **+40% per piece**, capped at 540% |
| 4 | `scavenger_big_score_t4b` | Second Chance | if the roll is under 200%, **roll again** and keep the higher (once per cast) |

---

## 6. Class sets

### `set_scavenger_ragpickers_rig` — The Rag-Picker's Rig (level 32, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | pickups are collected from **6 m** | mechanic |
| 4 | Junk Toss **costs no junk** 30% of the time | `scavenger_junk_toss` |
| 6 | Pack Bomb **refunds 1 junk per enemy hit** (max 3) | `scavenger_pack_bomb` |

Drop: `d08_moonwell_ruins` and `d09_warmasters_pit` bosses (Normal/Heroic).

### `set_scavenger_magpie_crown` — Regalia of the Magpie King (level 60, raid)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Shiny chance **+3%** | mechanic |
| 4 | Big Score's **top 20%** of rolls crit (was 10%) | `scavenger_big_score` |
| 6 | spending a Shiny on Big Score **hits twice** (second hit 50%) | `scavenger_big_score` |

Drop: `r05_veilspire` bosses (tokens), Normal/Mythic.

### `set_scavenger_wreckers_harness` — The Wrecker's Harness (level 60, Mythic+)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Barricade health **+20%** of max health | `scavenger_rigged_barricade` |
| 4 | Rummage's result band 14–16 also **drops a Barricade** for free | `scavenger_rummage` |
| 6 | a Barricade that is **destroyed** by enemies explodes for **250%** in 6 m | `scavenger_rigged_barricade` |

Drop: Mythic+ end chest key 8+.

---

## 7. Class legendaries and uniques

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_bottomless_sack` | **The Bottomless Sack** | belt | *No Bottom*: the pack holds **40**, and junk spells cost **1 less junk** (minimum 1) | secret boss of `r04_ember_court`, 8% |
| `leg_grits_lucky_penny` | **Grit's Lucky Penny** | amulet | *Heads I Win*: hold **3 Shinies**; a Shiny can be spent on **any** spell to make it crit and cost no junk | `sunscar` world boss, 4% |
| `leg_the_jackpot_cleaver` | **The Jackpot Cleaver** | sword (cleaver) | *Three of a Kind*: Big Score rolls **three times** and keeps the best | final boss of `r05_veilspire` Mythic, 6% |
| `leg_door_of_the_last_inn` | **Door of the Last Inn** | shoulders | *Last Orders*: Rigged Barricade **heals allies behind it 2% max health a second** and lasts **40 s** | `r03_sunken_choir` boss 4, 5% |
| `leg_magpies_eye` | **The Magpie's Eye** | ring | *Something Glinting*: every **10th** pickup is a Shiny | Mythic+ key 12+ end chest, 1.5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_rusty_horseshoe` | **The Rusty Horseshoe** | ring | Lucky Swing's status chance is **40%** | `d01_hollow_barrow` sub-boss `b_warren_queen_skritch`, 12% |
| `uq_mudlarks_gloves` | **Mudlark's Gloves** | hands | pickups in **water** are worth double; you pick up from 5 m | `d02_drowned_mill` boss `b_old_croak`, 8% |
| `uq_bellows_apron` | **Bellows-Keep Apron** | chest | Pack Bomb's fuse is **0.3 s** | `d04_bellows_keep` boss `b_forgemaster_ghorza`, 7% |
| `uq_cracked_dice` | **Cracked Dice** | amulet | Rummage rolls of **1** become **20** | `cinder_steppe` rare elites, 3% |

---

## 8. Voice and barks

Voice: **new row `scavenger`** proposed for `shared/voices.js` — `pitch 0.54, depth 0.5, tone 0.5, breath 0.3,
rough 0.28, speed 0.62, jitter 0.14` (quick, a little rough). Lingo tag `class:scavenger`; uses Farhold's
verbal-tic system (`lingo/` tics) with a default tic of counting ("…that's seven, eight…").

| When | Lines |
|---|---|
| Pickup / Shiny | "Ooh, that's mine." · "Shiny! Don't look at it, it's shy." |
| Junk Toss | "Catch!" · "Have a kettle!" |
| Pack Bomb | "Fire in the sack!" |
| Big Score top roll | "JACKPOT!" · "Retirement fund, here I come!" |
| Big Score low roll | "…Double or nothing?" · "The house always wins. Rotten house." |
| Barricade | "Behind the door! Everyone!" |
| Low health | "I'm not worth robbing, I swear!" · "Somebody — anything — a potion!" |
| Full pack | "Pack's full. Heavy, but full." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `scavenger.look` (spiky hair, wraps, ragged trousers, cleaver, belt lantern) | default look; the pack is a new back `decor` item (`junk_pack`) |
| Weapons | `avatar-3d/js/chibi2-weapons.js` `fh_javelin`, the cleaver held part | weapons |
| d20 popup | `prototypes/farhold/js/ui.js` `skillCheckPopup`, `skillcheck.css` | Rummage roll, calling-2 dice game |
| Breakable props | `prototypes/farhold/js/props.js` harvest ledger | crates and barrels that drop junk |
| Build ghost | `prototypes/farhold/js/build.js` ghost (green/red placement preview) | Barricade placement |
| Salvage | Farhold's recycled-gear crafting (`js/craft.js`) | Salvager's Eye bonus |
| Visual only | Farhold `rain_of_arrows` (lob arc), `smoke`, `guard_stance` | bomb, smoke bomb, barricade stance |
| Dropped | Farhold scavenger kit (aimed_shot, poison_dart, guard_stance, mend, smoke, rain_of_arrows) | none used as spells |
