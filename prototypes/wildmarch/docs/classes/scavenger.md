# Scavenger (`scavenger`)

> *"One man's rubbish is my ammunition, my armour, and — if the dice are kind — my retirement."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied). Canon: [page 00](../00-OVERVIEW.md) §6 row 12.
Formulas and tags: [page 05](../05-COMBAT.md). Boss vocabulary: [page 11](../11-BOSS-MECHANICS.md). Items and salvage: [page 08](../08-ITEMS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% weapon damage** | share of the held weapon's damage roll (reuse: `prototypes/farhold/js/rpg.js` `strike`); page 05 owns it |
| **Momentum** | 0–100, starts at 0 (00 §6). Builds as you hit and as you are hit; drains **5 a second** out of combat after 5 s. Scavenger gains below |
| **Junk** | the scavenger's second resource: pieces of rubbish carried in **the Pack** (§2) |

**Momentum for this class**

| Source | Momentum |
|---|---|
| a thrown basic-attack hit | **+5** (page 05 gives +4 for a basic hit; thrown weapons are slower, so +5) |
| Lucky Throw | **+10** per cast |
| Junk Toss (a junk hit) | **+8** per hit |
| Rummage | **+15** |
| damage taken | +1 per 1% of max health |
| out of combat | −5 a second after 5 s |

**Naming rule.** The Tinker's second resource is **Scrap** ([tinker](tinker.md)). The scavenger's is always
**Junk**, and the scavenger never builds turrets or Devices (the Tinker's deployables) that act on their own — junk is thrown, blown up or
stacked into a wall, and that is all.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A road-rat who has never paid full price for anything. Everything on the battlefield is something to throw if you are not proud: pot lids, horseshoes, broken gears, a cracked bell. And now and then something in the pile *shines* |
| Primary role | **Damage** (ranged, thrown, with area tricks) |
| Hybrid role | **Support** — **Quartermaster**: shares the haul, hands out tonics and Shinies, rattles enemies and builds cover (§5). Counts as a Damage slot in the Dungeon Finder |
| Build | ranged (thrown) |
| Armour | light |
| Weapons | main hand a **thrown** weapon: **javelins, throwing axes, throwing knives, slings** (reuse `fh_javelin`). Off hand: a **satchel** (a stat-stick off hand for thrown weapons, like a quiver for bows — page 08 to add) or nothing |
| Resource | **Momentum** + **Junk** in **the Pack** (0–10 → 20) |
| Companion | none |
| Playstyle | Throw whatever is in your hand, and pick up what falls off the things you hit. Junk is ammunition: one piece for a toss, three for a bomb, four for a wall. Your big finisher is a gamble — **Big Score** rolls anywhere from 60% to 540% — and every piece of junk you feed it cuts the chance of a bad roll |

**Basic attack.** A thrown weapon is a pattern like any other (page 05 §4.5): **throw · throw · heavy throw**,
reach **25 m** (knives 20 m, javelins 30 m, slings 28 m), the weapon comes back to hand (it is a stack of throwing
weapons, not one). The third throw is the pattern finisher.

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `scavenger`): *Lucky Strike
inflicts random statuses; Big Score is a high-variance gamble — crit huge or whiff; Thrown Junk; Makeshift Bomb.*
All four live on: **Lucky Throw**, **Big Score**, **Junk Toss** and **Pack Bomb**.

---

## 2. Class mechanic — The Pack (new)

### 2.1 Where junk comes from

| Source | Junk |
|---|---|
| any weapon hit | **15%** chance of +1 (max 1 a second) |
| `scavenger_lucky_throw` status proc | +1 |
| an enemy dies | drops **1–2 junk pickups** on the ground (elites 4) |
| a **boss** loses each 10% of its health | **2 pickups** fall near it |
| a breakable prop (crate, barrel, cart — reuse Farhold `js/props.js` breakables) | 2 |
| `scavenger_rummage` | 3 on its commonest roll |

**Pickups** are small glinting heaps (a random mesh from a junk set: pot, horseshoe, gear, bell, bottle, boot).
They are picked up automatically within **3 m**, last **20 s**, and only the scavenger who caused them sees them.
Two scavengers in a party each see their own.

### 2.2 The Pack

1. Holds **10** junk (15 after calling 2, 20 after calling 3). Junk **stays** in the pack between fights and
   through death.
2. **Shinies:** each pickup has a **3%** chance to be a **Shiny** instead (5% after calling 2). You hold at most
   **1** Shiny (2 after calling 2). A Shiny is spent by **Big Score** (a guaranteed top roll), by **Tip Jar**
   (hand it to an ally, §5) or by the `leg_grits_lucky_penny` legendary.
3. **Overloaded** (calling 3): at a full pack you deal **+10% damage** and move **5% slower**.

### 2.3 Class keys ([page 02](../02-CONTROLS.md))

| Key | From | Action |
|---|---|---|
| `Q` (`classKey`) | calling 1 | **Scrounge** — every junk pickup within **10 m** flies to you, and you find **+1 junk** in your pockets. Cooldown 12 s |
| `G` (`classKey2`) | calling 3 | **Junk Avalanche** — hurl the whole pack in a **15 m, 60° cone**: **25% weapon damage per piece of junk** to each enemy (a full 20-piece pack: 500%), knockback 3 m. Cooldown 30 s. Needs 10+ junk. Tags `tag_attack` `tag_physical` `tag_ranged` `tag_area` |
| `Shift+1` | calling 1 | **Quartermaster** — the support state (§5) |

### 2.4 Salvager's Eye (passive, calling 1)

* Salvaging an item at a crafting bench (page 08 salvage, [page 19](../19-PROFESSIONS.md)) gives **+20% materials**.
* Vendors pay **+25%** for Common "junk" items.
* Out of combat, `scavenger_rummage` on a fresh enemy corpse finds **20–40% of that enemy's gold drop** again
  (once per corpse; gold only, never items, so it cannot duplicate loot).

### 2.5 Gauge UI

| Element | Where | What it shows |
|---|---|---|
| **Momentum bar** | the resource slot | red bar 0–100 |
| **Pack counter** | page 03's stack-counter gauge (`hud_gauge`) | a satchel icon with the junk count "7/10"; the satchel bulges at 50% and 100% |
| **Junk costs** | on spell slots | a small "1 / 3 / 4" junk badge on Junk Toss, Pack Bomb and Barricade; red when you do not have it |
| **Shiny slot** | right of the satchel | 1–2 coin slots that glint gold when full |
| **Big Score floor** | over Big Score's slot | the current worst roll ("min 180%") so you can see what feeding it junk does |
| **Pickups** | in the world | glinting heaps with a small sparkle; a Shiny glints gold and chimes (`coin`) |

### 2.6 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_scavenger_1` | **Pack Rat** — Brightwater's rag-and-bone woman lends you her old pack if you clear the rats from her yard and bring back 20 useful things from the river | **The Pack** (junk pickups, the counter), **Scrounge** on `Q`, **Salvager's Eye**, **Quartermaster** on `Shift+1`. Before this, Junk Toss throws a rock |
| 20 | `q_calling_scavenger_2` | **Magpie's Knack** — win back a stolen Shiny from a Sandsworn gambling den with loaded dice (a dialog + dice mini-game reusing Farhold's d20 popup, `js/ui.js` `skillCheckPopup`) | pack **15**; Shinies **5%**, hold **2**; each junk spent has a **10%** chance to come straight back |
| 40 | `q_calling_scavenger_3` | **The Hoard** — loot an Ashtusk war camp's midden in the Cinder Steppe and carry it out before the warband notices | pack **20**; **Overloaded**; **Junk Avalanche** on `G` |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `scavenger_lucky_throw` | Lucky Throw | builds 10 | — | instant | Auto-target | weapon (20–30 m) | thrown bolt | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_basic_attack` | 120% weapon, 30% random status |
| 2 | 4 | `scavenger_junk_toss` | Junk Toss | 1 junk (builds 8) | 3 s (2 charges) | instant | Auto-target | 25 m | lob, 2 m splash | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_area` | 140% weapon, 20% stun 1 s |
| 3 | 10 | `scavenger_pack_bomb` | Pack Bomb | 30 Momentum + 3 junk | 12 s | instant (1.0 s fuse) | Ground | 25 m lob | circle 5 m | `tag_attack` `tag_fire` `tag_ranged` `tag_area` | 170% weapon fire, Burning, knockback |
| 4 | 18 | `scavenger_rigged_barricade` | Rigged Barricade | 20 Momentum + 4 junk | 25 s | 0.5 s | Ground | 12 m | wall 4 m × 1.6 m | `tag_attack` `tag_physical` `tag_duration` `tag_shield` | blocks projectiles, pathing and sight, 20 s |
| 5 | 28 | `scavenger_rummage` | Rummage | none (builds 15) | 30 s | channel 1.5 s | Self | self | self | `tag_attack` `tag_physical` `tag_duration` | d20 roll: junk, heal, tonic, caltrops, a Shiny |
| 6 | 40 | `scavenger_big_score` | Big Score | 40 Momentum + up to 5 junk | 20 s | 0.6 s wind-up | Needs target | 25 m | thrown, one target | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` | 300% ± 80% (60–540%); junk raises the floor |

### 3.2 Spell details

#### `scavenger_lucky_throw` — Lucky Throw (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | **builds 10 Momentum** · none (GCD) |
| Cast | instant, usable while moving; a real throw with wind-up/release (reuse: Farhold's three-part swing timing, `js/weapons.js`) |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point within the weapon's reach |
| Range / shape | a thrown copy of your weapon: reach as the weapon (knives 20 m, axes 25 m, slings 28 m, javelins 30 m), 0.4 m radius, 28 m/s; javelins **pierce 1** |
| Tags | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_basic_attack` (counts as a basic attack for satchel and quiver-type effects) |
| Effect | **120% weapon damage** |
| Statuses | **30%** chance of one random status: **Poisoned** · **Bleeding** · **Dazed** 2 s (non-elites are Stunned 1 s instead) |
| Mechanic | each status proc **+1 junk** |
| Visuals | the weapon's own throw (javelin arc, spinning axe, fanned knives, sling whirl); a tiny four-leaf clover sprite (new `fx` sprite `clover`, 64×64) pops over a target when a status lands, then that status's `STATUS_FX` aura |
| Sound | `ranged.throw`, `melee.hit`; proc: a "ting" (`coin` pitched up) + the status's `status.*.apply` |

#### `scavenger_junk_toss` — Junk Toss (slot 2, level 4)

| Field | Value |
|---|---|
| Cost / cooldown | **1 junk** (builds **8 Momentum** on a hit) · 3 s, **2 charges** |
| Cast | instant, usable while moving |
| Targeting | **Auto-target** |
| Range / shape | a lob, 25 m, lands on the target and splashes debris in **2 m** |
| Tags | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_area` |
| Effect | **140% weapon damage** to the target, 50% to others in 2 m; **20%** chance to **Stun 1 s** (non-bosses) |
| No junk | throws a rock: **70%**, no stun, no splash, builds 4 (and before calling 1 this is all it does) |
| Visuals | spellfx `projectile` element `physical` with a random junk mesh as the head (pot, horseshoe, gear, bottle, boot, bell — six small new props), spinning; `impact` physical + `_burst` of debris |
| Sound | the matching clatter (`fragment.crash.small`; the bell rings, the bottle smashes) |

#### `scavenger_pack_bomb` — Pack Bomb (slot 3, level 10)

| Field | Value |
|---|---|
| Cost / cooldown | 30 Momentum + **3 junk** · 12 s |
| Cast | instant lob |
| Targeting | **Ground**, 25 m |
| Range / shape | **5 m circle**; **1.0 s fuse** after landing. Your own bomb shows a faint orange outline to your party (not a page 11 telegraph colour — allies are not hurt) |
| Tags | `tag_attack` `tag_fire` `tag_ranged` `tag_area` |
| Effect | **170% weapon damage** as fire; enemies are **knocked 2 m** from the centre |
| Statuses | **Burning** |
| Visuals | a lumpy sack with a fizzing fuse (new prop `pack_bomb`); spellfx `aoe` element `fire` radius 5 + `_burst` of junk shrapnel + `_puff` smoke |
| Sound | fuse hiss `scavenger.fuse` → `spell.fire.impact` + `fragment.crash.medium` |

#### `scavenger_rigged_barricade` — Rigged Barricade (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Momentum + **4 junk** · 25 s |
| Cast | 0.5 s; a ghost shows where it will stand (reuse Farhold's build ghost), facing you |
| Targeting | **Ground**, up to 12 m (you throw the heap and it unfolds) |
| Shape | a wall **4 m wide, 1.6 m tall, 0.6 m deep** |
| Tags | `tag_attack` `tag_physical` `tag_duration` `tag_shield` |
| Health / time | **30% of the scavenger's max health**, **20 s**; one per scavenger (a new one removes the old) |
| Effect | **blocks enemy projectiles** and **enemy movement** (they path round or break it); **blocks line of sight** for boss line-of-sight casts for anyone standing directly behind it (up to 4 m wide of cover). Allies' own throws and spells pass over it |
| Visuals | a stacked heap of cart wheels, a door and barrels (new prop `junk_barricade`, three damage states); breaks with `fragment.crash.large` |
| Sound | hammering `scavenger.build` (0.5 s) then a thud |

#### `scavenger_rummage` — Rummage (slot 5, level 28)

| Field | Value |
|---|---|
| Cost / cooldown | none (**builds 15 Momentum**) · 30 s |
| Cast | **channel 1.5 s**; you can walk at 50% while rummaging |
| Targeting | **Self** |
| Tags | `tag_attack` `tag_physical` `tag_duration` |
| Effect | rolls a **d20** (Farhold's animated d20, reuse `js/ui.js` `skillCheckPopup`, small, over your head): |

| Roll | Chance | Result |
|---|---|---|
| 1–6 | 30% | **+3 junk** |
| 7–10 | 20% | **heal 20% max health** |
| 11–13 | 15% | a random tonic: **Hastened** 8 s / **Mending** 10 s / **shield 15% max health** 8 s |
| 14–16 | 15% | **caltrops**: a 6 m circle round you, enemies in it slowed 50% and take 10% weapon a second, 8 s (`tag_trap`) |
| 17–19 | 15% | **Sparkpowder**: your next 3 weapon hits add Burning |
| 20 | 5% | a **Shiny** (if you are already full, +5 junk instead) |

Out of combat on a fresh corpse: Salvager's Eye gold (§2.4). Sound: rummaging clatter `scavenger.rummage` + the d20 roll.

#### `scavenger_big_score` — Big Score (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 40 Momentum + **up to 5 junk** (spends whatever you have, up to 5) · 20 s |
| Cast | 0.6 s wind-up (a big overhead throw), then the release |
| Targeting | **Needs target** — one enemy |
| Range / shape | thrown, **25 m**, one target |
| Tags | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` |
| Effect | **300% weapon damage ± 80%**: a flat random roll from **60% to 540%**. Each junk spent **raises the floor by 40%** (5 junk: 260%–540%). A roll in the top 10% **always crits** |
| Shiny | if you hold a Shiny it is spent: the roll is **540% and a crit**, no junk spent |
| Visuals | a three-reel "tumbler" of coin, skull and clover symbols spins over your head for the 0.6 s (new world-space sprite) and stops on the result: all coins = top roll, gold flash + `_burst` of coin sprites; a low roll = a sad puff of dust |
| Sound | a ratchet spin `scavenger.tumbler`; top roll: `loot.legendary` jingle; low roll: a trombone-ish "wah" (formant synth, `voice-lab`) |

### 3.3 How it plays

* **Solo:** Lucky Throw to build Momentum, junk and statuses; Junk Toss to turn junk into Momentum; Pack Bomb on a
  group. Break every crate you pass — junk is free ammunition. Rummage when hurt (a d20 is not a healer, so carry
  potions). Big Score with 5 junk on an elite.
* **Normal dungeon:** junk rains from the boss every 10% — you will usually have a full pack. Pack Bomb on trash,
  Big Score on cooldown on the boss with 3–5 junk (floor 180–260%). The Barricade is the group's portable pillar:
  learn which bosses have line-of-sight casts (page 11) and drop it before the cast.
* **Challenge and Depth:** steady ranged damage with a high-variance spike. Save Shinies for the boss's vulnerable
  phase (or hand one to the best damage dealer, §5). Junk Avalanche (calling 3) on add waves.

### 3.4 Boss mechanics

| Mechanic | Scavenger answer |
|---|---|
| **Soak** | can soak; Rummage's shield/heal rolls help but are not reliable |
| **Line of sight** | **Rigged Barricade** is cover for up to 4 m of allies behind it |
| **Projectile barrages** | the Barricade blocks enemy projectiles from the far side |
| **Void / danger zones** | no teleport by default; talent `scavenger_pack_bomb_t1b` *Blast Jump* throws you 10 m |
| **Interrupt** | talent `scavenger_junk_toss_t2a` *Pot Lid* makes Junk Toss interrupt (10 s internal cooldown) |
| **Adds** | Pack Bomb knockback, caltrops from Rummage, Junk Avalanche |

---

## 4. Alternate spells — Quartermaster versions

While **Quartermaster** is on (§5), three spells change. Same keys; the icons gain a green satchel corner.

| Slot | Normal | In Quartermaster | Targeting | Tags | Effect |
|---|---|---|---|---|---|
| 1 | Lucky Throw | **Rattling Throw** (`scavenger_rattling_throw`) | Auto-target | `tag_attack` `tag_physical` `tag_ranged` `tag_projectile` `tag_basic_attack` `tag_curse` | 100% weapon; the random status table becomes **Rattled** (the target takes **+6% damage from all sources**, 8 s) · **Sundered** (armour −15%, 6 s) · **Dazed**. Still +1 junk per proc |
| 4 | Rigged Barricade | **Supply Barricade** (`scavenger_supply_barricade`) | Ground | `tag_attack` `tag_physical` `tag_duration` `tag_shield` `tag_heal` | as the Barricade, and allies within 4 m behind it **heal 1.5% max health a second** and deal **+8% damage** (cover bonus) |
| 5 | Rummage | **Share the Haul** (`scavenger_share_the_haul`) | Self (20 m) | `tag_attack` `tag_physical` `tag_duration` | the same d20, but every result lands on **every party member within 20 m** at 60% (heal 12%, tonics 60% strength, caltrops round the lowest-health ally instead of you); a 20 gives a Shiny **to an ally** (Tip Jar, §5) |

---

## 5. The hybrid role — Support

The scavenger supports by **sharing what it finds**: tonics, heals and Shinies go to the party, its throws leave
enemies **Rattled**, and its barricade becomes cover you want to stand behind. Support counts as a Damage slot in
the Dungeon Finder (00 §4), so a support scavenger still deals most of its damage.

### 5.1 Quartermaster (the support state)

| Field | Value |
|---|---|
| id / key | `scavenger_quartermaster` · `Shift+1` (form key); unlocks at calling 1 (level 6) |
| Switching | toggle; 1.0 s, off the GCD; at most once every 5 s |
| Damage | **−15%** damage dealt |
| **Tip Jar** | a **Shiny** can be handed to a party member: target them (**Ally**) and press `Q` (Scrounge is replaced in Quartermaster). Their **next spell** within 15 s is a **critical hit and costs nothing** |
| **Care Package** | every **10 junk** you pick up, the ally with the lowest resource (by share of their pool) within 30 m gets **+20 Momentum or Tempo, or 60 mana** |
| Rattled | the three spell versions (§4) |
| Role focus | tied to the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout): setting it to **Hybrid (Support)** turns Quartermaster on when you leave combat and makes the Dungeon Finder queue you as **Support** (a Damage slot); **Primary (Damage)** turns it off. The `Shift+1` toggle still flips Quartermaster mid-fight without changing your queued role |

### 5.2 Talents that turn spells toward support

Marked **[support]** in §7: `scavenger_lucky_throw_t2c` *Rusty Edge* (Sunder into the table outside Quartermaster
too) · `scavenger_junk_toss_t4a` *Bell Toll* (area Daze) · `scavenger_pack_bomb_t2b` *Smoke Bomb* (enemies miss) ·
`scavenger_rummage_t2a` *Pass It Round* (tonics to 2 allies, outside Quartermaster) · `scavenger_big_score_t2b`
*Share the Pot* (party +10% damage on a top roll).

### 5.3 How well it supports

| Content | Scavenger support vs a primary support (bard, tactician, enchanter) |
|---|---|
| Open world and Normal dungeons | ≈ **85%** of the party benefit — Rattled (+6%) plus tonics, Shinies and cover |
| Depth 1–10 | ≈ **80%** |
| Depth 11+ and Challenge | ≈ **65%** — its gifts are random (a d20) and a primary support's are not |

---

## 6. Utility spells

### `scavenger_field_repair` — Field Repair (out of combat, no slot)

| Field | Value |
|---|---|
| Unlocks | calling 1 (level 6) |
| Cost / cooldown | **5 junk** · 5 min |
| Cast | 3 s channel, out of combat; any damage cancels it |
| Targeting | **Self** (10 m) |
| Effect | repairs the equipped gear of **every party member within 10 m** by **15% durability** (page 05 §17) |
| Tags | `tag_attack` `tag_physical` |
| Looks / sound | the scavenger sits on an upturned bucket hammering at a borrowed boot; `scavenger.build` at half speed |

Travel: scrolls, Travel Methods and the Recall Stone ([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers open at **12 / 22 / 32 / 45** (earlier tiers open when a later spell is learned). **[support]** marks a
choice written for Quartermaster.

### `scavenger_lucky_throw`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_lucky_throw_t1a` | Fan of Junk | throws at **3 enemies** in a 30° fan, 70% each; each rolls its own status |
| 1 | `scavenger_lucky_throw_t1b` | Loaded Throw | one target, **+50%**, status chance **60%** |
| 2 | `scavenger_lucky_throw_t2a` | Rattled Pockets | every hit (not only procs) gives junk at **25%** |
| 2 | `scavenger_lucky_throw_t2b` | Loaded Dice | the random status is always one the target **does not have yet** |
| 2 | `scavenger_lucky_throw_t2c` | Rusty Edge **[support]** | adds **Sundered** (armour −15%, 6 s) to the status table |
| 3 | `scavenger_lucky_throw_t3a` | Hat Trick | landing **3 different statuses** on one enemy makes it **take +20% from you** for 8 s |
| 3 | `scavenger_lucky_throw_t3b` | Pickpocket | a proc on an elite **steals a potion's worth**: heal 5% max health |
| 4 | `scavenger_lucky_throw_t4a` | Lucky Streak | each proc gives **+5% status chance** until a throw procs nothing (max +30%) |
| 4 | `scavenger_lucky_throw_t4b` | Swing for the Fences | every 5th throw is a **free Big Score at 50%** (no junk spent) |

### `scavenger_junk_toss`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_junk_toss_t1a` | Handful | throws **3 pieces** in a 20° fan for 1 junk, 60% each |
| 1 | `scavenger_junk_toss_t1b` | Anvil | 2 junk: **+80%**, stun chance **50%** |
| 2 | `scavenger_junk_toss_t2a` | Pot Lid | **interrupts** (10 s internal cooldown) |
| 2 | `scavenger_junk_toss_t2b` | Ricochet Kettle | **bounces** to 2 more enemies at 60% |
| 3 | `scavenger_junk_toss_t3a` | Recycler | junk that hits drops as a **pickup** where it lands (50% chance) |
| 3 | `scavenger_junk_toss_t3b` | Third Pocket | **3 charges** |
| 4 | `scavenger_junk_toss_t4a` | Bell Toll **[support]** | every 3rd toss is a bell: it **Dazes every enemy within 6 m** of the target for 2 s |
| 4 | `scavenger_junk_toss_t4b` | Hail of Junk | at a full pack the toss **throws 5 pieces for 1 junk** |

### `scavenger_pack_bomb`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_pack_bomb_t1a` | Cluster | splits into **3 small bombs** (3 m, 80% each) around the aim point |
| 1 | `scavenger_pack_bomb_t1b` | Blast Jump | aim at your own feet: **you are thrown 10 m** in the direction you face, unharmed (the bomb still hurts enemies) — the class's escape (tags: +`tag_movement`) |
| 2 | `scavenger_pack_bomb_t2a` | Nail Bomb | **Bleeding** instead of Burning (tags: `tag_physical` replaces `tag_fire`) |
| 2 | `scavenger_pack_bomb_t2b` | Smoke Bomb **[support]** | leaves a **6 m smoke cloud** for 5 s: enemies inside **miss 30%** of ranged attacks |
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
| 2 | `scavenger_rigged_barricade_t2b` | Rigged to Blow | press the spell again to **detonate** it: **200%** in a 5 m line in front (tags: +`tag_area`) |
| 3 | `scavenger_rigged_barricade_t3a` | Vault | pressing jump next to it **vaults you 6 m** over it |
| 3 | `scavenger_rigged_barricade_t3b` | Scrounger's Stash | when it expires it **returns 2 junk** |
| 4 | `scavenger_rigged_barricade_t4a` | Mirror Door | projectiles it blocks are **thrown back** at their shooter (50% damage) |
| 4 | `scavenger_rigged_barricade_t4b` | Two Doors | **2 barricades** at once |

### `scavenger_rummage`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_rummage_t1a` | Quick Hands | **instant**, cooldown 36 s |
| 1 | `scavenger_rummage_t1b` | Deep Pockets | roll **2d20, keep the higher** |
| 2 | `scavenger_rummage_t2a` | Pass It Round **[support]** | tonics and heals also land on **2 nearby allies** |
| 2 | `scavenger_rummage_t2b` | Field Kitchen | 7–10 heals **30%** and clears one poison or bleed |
| 3 | `scavenger_rummage_t3a` | Known Pile | you choose **one** result band before rolling; if the roll lands in it, the effect is doubled |
| 3 | `scavenger_rummage_t3b` | Throwaway | roll 1–6 also **throws** the 3 junk as a free Junk Toss volley |
| 4 | `scavenger_rummage_t4a` | Natural Twenty | the Shiny band is **18–20** (15%) |
| 4 | `scavenger_rummage_t4b` | Bottomless | each roll also **resets Junk Toss** charges |

### `scavenger_big_score`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `scavenger_big_score_t1a` | Long Shot | range **40 m**, −20% |
| 1 | `scavenger_big_score_t1b` | Safe Bet | range of rolls **200–400%**, junk raises the floor 30% each |
| 2 | `scavenger_big_score_t2a` | Double or Nothing | a roll under 150% **refunds the cooldown** |
| 2 | `scavenger_big_score_t2b` | Share the Pot **[support]** | a top roll (crit) gives the **party +10% damage** for 6 s |
| 3 | `scavenger_big_score_t3a` | Jackpot Spill | a top roll **spills 5 junk pickups** and gives 5 Momentum each |
| 3 | `scavenger_big_score_t3b` | House Edge | each junk spent also adds **+2% crit damage** to the hit (max +10%) |
| 4 | `scavenger_big_score_t4a` | All In | spends **every** junk in the pack (up to 20): floor **+40% per piece**, capped at 540% |
| 4 | `scavenger_big_score_t4b` | Second Chance | if the roll is under 200%, **roll again** and keep the higher (once per cast) |

---

## 8. Class sets

### `set_scavenger_ragpickers_rig` — The Rag-Picker's Rig (level 32, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | pickups are collected from **6 m** | mechanic |
| 4 | Junk Toss **costs no junk** 30% of the time | `scavenger_junk_toss` |
| 6 | Pack Bomb **refunds 1 junk per enemy hit** (max 3) | `scavenger_pack_bomb` |

Source: bosses of `d08_moonwell_ruins` and `d09_warmasters_pit` (Normal).

### `set_scavenger_magpie_crown` — Regalia of the Magpie King (level 60, damage)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Shiny chance **+3%** | mechanic |
| 4 | Big Score's **top 20%** of rolls crit (was 10%) | `scavenger_big_score` |
| 6 | spending a Shiny on Big Score **hits twice** (second hit 50%) | `scavenger_big_score` |

Source: bosses of `d16_the_spire` on **Challenge** (one piece per boss, once a week per boss, Monday 06:00).

### `set_scavenger_wreckers_harness` — The Wrecker's Harness (level 60, support)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Barricade health **+20%** of max health | `scavenger_rigged_barricade` |
| 4 | Rummage's result band 14–16 also **drops a Barricade** for free | `scavenger_rummage` |
| 6 | Rattled is **+10%** instead of +6%, and a Barricade **destroyed** by enemies explodes for **250%** in 6 m | `scavenger_rattling_throw`, `scavenger_rigged_barricade` |

Source: the final boss's chest at **Depth 10 or deeper**, any dungeon ([page 12](../12-DUNGEONS.md)).

---

## 9. Class legendaries, uniques and souls

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_bottomless_sack` | **The Bottomless Sack** | off hand (satchel) | *No Bottom*: the pack holds **40**, and junk spells cost **1 less junk** (minimum 1) | secret boss of `d15_fire_court` (Challenge), 8% |
| `leg_grits_lucky_penny` | **Grit's Lucky Penny** | amulet | *Heads I Win*: hold **3 Shinies**; a Shiny can be spent on **any** spell to make it crit and cost no junk | the `sunscar` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_the_jackpot_javelin` | **The Jackpot Javelin** | javelin | *Three of a Kind*: Big Score rolls **three times** and keeps the best | final boss of `d16_the_spire` (Challenge), 6% |
| `leg_door_of_the_last_inn` | **Door of the Last Inn** | shoulders | *Last Orders*: Rigged Barricade **heals allies behind it 2% max health a second** and lasts **40 s** | the `drowned_coast` world boss, 5% |
| `leg_magpies_eye` | **The Magpie's Eye** | ring | *Something Glinting*: every **10th** pickup is a Shiny | the final boss's chest at Depth 15+, any dungeon, 1.5% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_rusty_horseshoe` | **The Rusty Horseshoe** | ring | Lucky Throw's status chance is **40%** | `d01_hollow_barrow` sub-boss `b_warren_queen_skritch`, 12% |
| `uq_mudlarks_gloves` | **Mudlark's Gloves** | hands | pickups in **water** are worth double; you pick up from 5 m | `d02_drowned_mill` boss `b_old_croak`, 8% |
| `uq_bellows_apron` | **Bellows-Keep Apron** | chest | Pack Bomb's fuse is **0.3 s** | `d04_bellows_keep` boss `b_forgemaster_ghorza`, 7% |
| `uq_cracked_dice` | **Cracked Dice** | amulet | Rummage rolls of **1** become **20** | `cinder_steppe` rare monsters (page 10), 3% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_ricochet_kettle` | **Soul of the Ricochet Kettle** | weapon | **Scavenger only** | Junk Toss **bounces to 2 more enemies** within 8 m at 70%, and each bounce has a **30% chance to drop a pickup** where it hits | the secret boss of `d04_bellows_keep` (Normal or Challenge), 5%; or any monster at 0.02% (great luck) |
| `soul_second_pocket` | **Soul of the Second Pocket** | waist (armour) | **Scavenger only** | hold **1 extra Shiny**; spending a Shiny (on Big Score or through Tip Jar) also gives the **whole party +15% damage for 8 s** | quest reward: the Sunscar story chapter's scavenger version (page 14); or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice: **new row `scavenger`** proposed for `shared/voices.js` — `pitch 0.54, depth 0.5, tone 0.5, breath 0.3,
rough 0.28, speed 0.62, jitter 0.14` (quick, a little rough). Lingo tag `class:scavenger`; uses Farhold's
verbal-tic system (`lingo/` tics) with a default tic of counting ("…that's seven, eight…").

| When | Lines |
|---|---|
| Pickup / Shiny | "Ooh, that's mine." · "Shiny! Don't look at it, it's shy." |
| Junk Toss | "Catch!" · "Have a kettle!" |
| Pack Bomb | "Fire in the sack!" |
| Tip Jar | "Here — you'll know what to do with it." |
| Big Score top roll | "JACKPOT!" · "Retirement fund, here I come!" |
| Big Score low roll | "…Double or nothing?" · "The house always wins. Rotten house." |
| Barricade | "Behind the door! Everyone!" |
| Low health | "I'm not worth robbing, I swear!" · "Somebody — anything — a potion!" |
| Full pack | "Pack's full. Heavy, but full." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `scavenger.look` (spiky hair, wraps, ragged trousers) — the belt lantern is swapped for a **belt of dented pots and a kettle** (no lights in v2) | default look; the pack is a new back `decor` item (`junk_pack`) |
| Weapons | `avatar-3d/js/chibi2-weapons.js` `fh_javelin`; new throwing-axe and sling held parts | weapons |
| Thrown pattern | Farhold `js/weapons.js` `RANGED` + `STRIKES` (page 05 §4.5) | the throw · throw · heavy throw basic attack |
| d20 popup | `prototypes/farhold/js/ui.js` `skillCheckPopup`, `skillcheck.css` | Rummage roll, calling-2 dice game |
| Breakable props | `prototypes/farhold/js/props.js` harvest ledger | crates and barrels that drop junk |
| Build ghost | `prototypes/farhold/js/build.js` ghost (placement preview) | Barricade placement |
| Salvage | Farhold's recycled-gear crafting (`js/craft.js`) | Salvager's Eye bonus |
| Visual only | Farhold `rain_of_arrows` (lob arc), `smoke`, `guard_stance` | bomb, smoke bomb, barricade |
| Dropped | Farhold scavenger kit (aimed_shot, poison_dart, guard_stance, mend, smoke, rain_of_arrows) | none used as spells |

---

## 12. Round 2 changes

- **Build: melee → ranged (thrown)**; weapons are javelins, throwing axes, throwing knives and slings, with a new **satchel** off hand.
- **Resource: Focus → Momentum**; Junk Toss and Rummage now *build* Momentum, the big junk spells spend it.
- New hybrid **Support** role: Quartermaster (`Shift+1`), three support spell versions, Tip Jar, Care Package, [support] talents, a support set.
- **Field Repair** utility added. Raid, Heroic and Mythic+ sources re-homed; souls added.

| Old | New |
|---|---|
| `scavenger_lucky_swing` Lucky Swing (melee arc) | `scavenger_lucky_throw` **Lucky Throw** (talents `_lucky_swing_t*` → `_lucky_throw_t*`; Wild Swing → Fan of Junk, Loaded Swing → Loaded Throw) |
| Focus costs | Momentum costs / builds |
| Big Score (melee 4 m) | Big Score (thrown 25 m); talent *Long Shot* now extends range to 40 m |
| `leg_the_jackpot_cleaver` (sword) | `leg_the_jackpot_javelin` (javelin) |
| `leg_the_bottomless_sack` (belt) | same id, now the satchel off hand |
| look: belt lantern | belt of pots and a kettle |
| `q_scavenger_calling_1/2/3` | `q_calling_scavenger_1/2/3` |
| sources `r03_sunken_choir`, `r04_ember_court`, `r05_veilspire`, Mythic+ | `drowned_coast` world boss, `d15_fire_court` / `d16_the_spire` Challenge, Depth 10+/15+ |
