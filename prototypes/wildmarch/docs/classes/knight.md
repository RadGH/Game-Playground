# Knight (`knight`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 24.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one swing of the equipped main-hand weapon, before armour.
- **Fury**: pool **100**. Builds **+4 per hit you land**, **+3 per hit you take** (and +1 per 5% of max health
  lost in one hit), and some spells give more. Decays 3 a second after 5 s out of combat (canon §6).
- **Threat** (how much an enemy wants to attack you; page 05 owns the table): "threat ×3" means the hit counts
  three times its damage toward the enemy's threat list.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- "Group" = 5-player party. "Raid group" = your 5 on the raid frame (page 15).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A sworn protector in blue surcoat and plate: a shield on one arm, a banner planted behind the line, and a vow to one person that they will not fall while the knight stands. |
| Role | **Tank** · can also **Support** (canon §6). The Support side is the banner and the Vow. |
| Armour | Heavy |
| Weapons | **Sword** or **hammer**, one-handed, with a **shield** (reuse: `js/weapons.js` `sword`, `longsword`, `hammer`; Farhold `classes.json` knight `shield: true`). A knight may use a two-handed sword, but its tank passive needs a shield. |
| Primary attribute | STR |
| Resource | **Fury** + the **Vow** and the **Banner** (§2). |
| Companion | None. The knight's companion is whoever it has sworn to protect. |

**Playstyle in three sentences.** The knight holds enemies with a shield, a rebuke and a challenge, and it
takes a share of the damage meant for one sworn ally through its **Vow of Protection**. It plants a
**banner** where the group fights; from 20 the banner's colour decides whether it hardens, strengthens or
heals the people around it. Its signature moments are stepping in front of a blow meant for someone else,
and a last oath that will not let it fall.

---

## 2. Class mechanic — the Vow and the Banner

### 2.1 Shield Oath (always on)

With a **shield** equipped: your damage generates **threat ×2**, and you take **10% less damage**. Without a
shield these two do nothing (the knight can play as damage with a two-hander, but it is not a tank then).
This is the knight's tank passive; page 05 owns how it compares with the other tanks.

### 2.2 Vow of Protection — the class key

**`knight_vow_of_protection` — Vow of Protection** (class key **`Q`**, page 02 §5.16; from `q_calling_knight_1`, level 6).
- **Cost** none · **Cooldown** 5 s to change who you are sworn to · **Cast** instant · **Range** 30 m.
- The ally becomes **Sworn** (new status) until you swear to someone else, die, or leave the fight for 30 s:
  **25%** of the damage they take is **moved to you**, then reduced by **your** armour and damage reduction.
- **Safety**: while you are below **20%** of your max health, nothing is moved (the Vow pauses; its chain dims).
  Damage flagged `unavoidable` or `mechanic` (page 11) is never moved — a soak share, a doom debuff and a
  one-shot stay with the person they hit.
- **Range**: past **40 m** the Vow pauses and resumes when you are back in range.
- **One knight per ally**: an ally can be sworn to only one knight at a time.
- **Looks like**: a thin **gold chain** of light from your shield to the ally (never white — white lines are
  boss tethers, page 11), and a small gold shield icon on their nameplate. When damage moves, a gold pulse
  runs down the chain toward you.
- **Sound**: a chain rattle when sworn; a soft metallic "tink" on each moved hit (volume scaled by size).

### 2.3 The Banner

Planted by the spell **Raise the Standard** (§3, level 10). Until level 20 it is always the **Standard of
Bastion**; after `q_calling_knight_2` you choose its colour (§4).

| Rule | Value |
|---|---|
| Aura | **12 m** around the banner |
| Who | the group (5), or up to **10 allies** in a raid (your raid group first, then nearest) |
| Duration | 30 s |
| Health | 25% of your max health; non-boss enemies attack it only when nothing else is in reach; dies at once in a Void zone |
| Stacking | two knights' banners of the **same** colour: one counts. Different colours: both count |

### 2.4 Gauge UI

`hud_class_gauge` (new — add to page 03): the Fury bar (deep red) sits under the health bar. To its right a
**shield-shaped slot** shows the Sworn ally's portrait, name and a thin health bar; the chain icon beside it
lights when damage is being moved and greys when the Vow is paused (with the reason on hover: "Out of range",
"You are below 20%"). A small **pennant** above the Fury bar shows the banner's colour and its 30 s draining.

### 2.5 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_knight_1` "The Oath of the Shield" | `npc_dame_vaunt`, Brightwater keep | Escort a Vale Warden courier through Hearthvale while bandits ambush; the courier must finish above half health | **Vow of Protection** |
| 20 | `q_calling_knight_2` "Colours of the Order" | Dame Vaunt, Highcourt chapter house | Recover three lost standards (one each from Greyridge, Sunscar and Highcourt's catacombs) | **Banner colours** (Valor, Mercy), the colour switch |
| 40 | `q_calling_knight_3` "Oathsworn" | Dame Vaunt, Rimehold wall | Hold the Rimehold gate beside your banner while two sworn villagers are attacked; neither may die | **Oathsworn** (below) |

**Oathsworn** (calling 3 rule): the Vow can bind **two** allies (swear the second with **`G`**, page 02 §5.16); while you
stand within your banner's 12 m, the Vow moves **40%** instead of 25%; and your banner **cannot be destroyed**.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `knight_reproach` | Reproach | +12 Fury (builder) | — | instant | melee 3 m | 90° arc | 130% WD, threat ×3, Reproached 6 s |
| 2 | 4 | `knight_gauntlet` | Gauntlet | 10 Fury | 8 s | instant | 25 m | one enemy | taunt 3 s, top of threat +10% |
| 3 | 10 | `knight_raise_the_standard` | Raise the Standard | 30 Fury | 30 s | instant | self | banner, 12 m aura | banner for 30 s (colour §4) |
| 4 | 18 | `knight_line_of_shields` | Line of Shields | 20 Fury | 40 s | channel up to 6 s | self | 120° wall, 6 m | −40% frontal damage for you and allies behind; blocks projectiles |
| 5 | 28 | `knight_valiant_charge` | Valiant Charge | 15 Fury | 15 s | instant dash | 18 m | enemy or ally | enemy: 180% WD + taunt 2 s · ally: intercept next hit |
| 6 | 40 | `knight_unyielding_oath` | Unyielding Oath | none | 180 s | instant | self | self | −50% damage 10 s, cannot fall below 1 health for 6 s |

### 3.2 The spells in full

**`knight_reproach` — Reproach** · slot 1 · level 1
- **Cost** none; **gives +12 Fury** if it hits · **Cooldown** none (GCD) · **Cast** instant · **Range** melee 3 m · **Shape** 90° arc.
- **Effect** 130% WD with **threat ×3** (×6 with Shield Oath). The first enemy hit is **Reproached** (new status)
  for 6 s: it deals **8% less damage to anyone except you**.
- **Looks like**: a short shield-edge shove followed by a cut; a blue-white spark flash on the shield face
  (spellfx `impact`, physical, recoloured `#8fb0ff`; the `block` status sprite flashes once).
- **Sound**: a heavy shield clang.

**`knight_gauntlet` — Gauntlet** · slot 2 · level 4
- **Cost** 10 Fury · **Cooldown** 8 s · **Cast** instant · **Range** 25 m · **Shape** one enemy.
- **Effect** **taunt** for 3 s: the enemy must attack you, and you are put at the top of its threat list +10%
  (page 05 taunt rule). Works on **bosses** (it is the knight's tank-swap tool). Bosses that are immune to taunt
  are marked as such on page 11/13.
- **Looks like**: you point your sword; a gold gauntlet sigil flies to the enemy and hangs over its head
  (spellfx `marked` status, recoloured gold, for 3 s).
- **Sound**: a gauntlet thrown to the floor; your voice line (§8).

**`knight_raise_the_standard` — Raise the Standard** · slot 3 · level 10
- **Cost** 30 Fury · **Cooldown** 30 s · **Cast** instant · **Range** planted at your feet · **Shape** a banner with a 12 m aura, 30 s.
- **Effect** plants your banner of the chosen colour (§4). Before level 20 it is always **Standard of Bastion**:
  allies within 12 m take **6% less damage** and you generate **+20% threat**. One banner per knight; casting
  again moves it.
- **Looks like**: a tall blue banner on a spear-pole driven into the ground (a new prop, `prop_knight_banner`,
  colour from the knight's `surcoat` colour), a faint 12 m ring on the ground in the banner's colour
  (spellfx `ring`, life = banner duration, low opacity).
- **Sound**: the pole striking stone, then a cloth flap loop.

**`knight_line_of_shields` — Line of Shields** · slot 4 · level 18
- **Cost** 20 Fury · **Cooldown** 40 s · **Cast** channel, up to 6 s; release the key to end it · **Range** self · **Shape** a 120° wall in front of you, and the space 6 m behind you.
- **Effect** you raise your shield: damage coming **from the front 120°** is reduced **40%** for you and for
  every ally standing within **6 m behind you**. Enemy **projectiles** that cross the line are **blocked**
  (non-mechanic ones). You move at 40% speed and can turn. Without a shield the reduction is 25% and nothing
  is blocked.
- **Boss rules**: a room-wide hit comes "from the boss", so if you face the boss the group behind you gets the
  40%. `unavoidable` hits are not reduced.
- **Looks like**: a translucent blue wall of overlapping shield shapes arcs in front of you (spellfx status
  `block` scaled into a wide arc, new mesh `fx_shield_line`); blocked projectiles spark and drop.
- **Sound**: a clash as the shields lock, then a low hum; each block is a ringing clang.

**`knight_valiant_charge` — Valiant Charge** · slot 5 · level 28
- **Cost** 15 Fury · **Cooldown** 15 s · **Cast** instant dash · **Range** 18 m · **Shape** to an enemy **or** an ally.
- **On an enemy** 180% WD on arrival and 60% WD to anything within 2 m of your path; the target is **Staggered**
  for 1 s (non-boss) and **taunted for 2 s** (bosses included).
- **On an ally** you arrive at their side and **Intercept** (new status on them, 4 s): the **next hit** they
  would take — a normal attack **or a single-target boss ability not flagged `mechanic`** (a "tank buster"
  counts) — hits **you** instead, with your own reduction. Useful for a tank swap and to save a healer.
- **Looks like**: a blue-gold streak with a pennant trail (spellfx `projectile` physical along your path, holy
  `holy_mote` trail); on an ally, a gold shield outline stands between them and the enemy.
- **Sound**: armoured footfalls, a war shout, the hit or a shield slam.

**`knight_unyielding_oath` — Unyielding Oath** · slot 6 · level 40
- **Cost** none · **Cooldown** 180 s · **Cast** instant, usable while Stunned · **Range** self.
- **Effect** for **10 s** you take **50% less damage**. For the **first 6 s** you **cannot drop below 1 health**
  (**Oathbound**, new status). When it ends, you heal **20% of all the damage it prevented**.
- **Limits**: Oathbound does **not** apply to hits flagged `unavoidable`, to a boss **enrage**, or to falling
  out of the world. The Vow keeps moving damage to you during it (that is the point); the 20% pause rule still
  applies once Oathbound ends.
- **Looks like**: your armour flashes white-gold; a ring of standing shield-shapes circles you (spellfx
  `pillar`, holy, radius 2; status `barrier` recoloured gold for 10 s).
- **Sound**: a deep bell, your oath line (§8), and a heartbeat under the music while Oathbound lasts.

### 3.3 Rotation — how it plays

**Solo.** Reproach is your filler and Fury engine. Raise the Standard where you stand to fight; throw the Gauntlet at the
enemy that runs past you toward your followers. Valiant Charge onto the next pack. Swear your Vow to your
toughest follower (followers are allies too) so its health lasts longer. Unyielding Oath is your "I made a
mistake" button.

**Dungeon (tank).** Pull with **Valiant Charge**, Reproach the pack (threat ×6 with a shield), plant the
**Bastion** banner. Throw the **Gauntlet** at anything that turns to the healer. Swear the **Vow to the healer** (they take
the loose hits). **Line of Shields** facing a caster pack's volley, with the group behind you. **Unyielding
Oath** for the boss's heaviest phase.

**Raid (tank or off-tank).** Tank swap: throw the **Gauntlet** at the boss when the other tank calls it. Off-tank: Vow on the
main tank, **Valiant Charge + Intercept** the main tank to eat a tank-buster, then throw the Gauntlet. Raid support:
**Mercy** or **Valor** banner at the raid's stack point; **Line of Shields** facing the boss for a room-wide cast.

### 3.4 What the knight gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| Banner — Bastion | 6% less damage taken | up to 10 allies in 12 m | other damage reduction; not a second Bastion |
| Banner — Valor | +5% damage | up to 10 allies | group-buff cap (page 05); not a second Valor |
| Banner — Mercy | +8% healing received, 0.5% max health a second | up to 10 allies | not a second Mercy |
| Vow | 25% (40% at the banner from 40) of one ally's damage moved to you | 1 ally (2 from 40) | healers; not a second knight's Vow on the same ally |
| Line of Shields | −40% frontal damage for all behind you, 6 s every 40 s | as many as fit in 6 m behind you | other reductions |
| Reproached | −8% damage from one enemy to others | same | Weakened (page 05): the stronger applies |

### 3.5 Threat and defensive tools (tank summary)

| Tool | What | Every |
|---|---|---|
| Shield Oath | threat ×2, −10% damage | always (shield) |
| Reproach | threat ×3 per hit (×6 total) | GCD |
| Gauntlet | 3 s taunt + top of threat | 8 s |
| Valiant Charge | 2 s taunt on arrival | 15 s |
| Bastion banner | +20% threat, −6% damage | 30 s |
| Line of Shields | −40% frontal, 6 s | 40 s |
| **Unyielding Oath** | −50%, cannot fall below 1 for 6 s (big defensive) | 180 s |

### 3.6 Boss mechanics

| Mechanic | What the knight does |
|---|---|
| **Tank swap** | Gauntlet (8 s cooldown) or Valiant Charge on the boss; Intercept on the other tank to take the next tank-buster during the swap. |
| **Soak** | Line of Shields tier 3 **Bearer of Two**: while channelling you take **50% less damage from soaks**. You count as one player like everyone else (pets, summons and mines never count; 00 §10, QUESTIONS.md C3). |
| **Room-wide hits** | Face the boss with Line of Shields; everyone within 6 m behind you takes 40% less. |
| **Targeted** | Intercept only works on single-target hits, never on Targeted circles (they are `mechanic`). |
| **Void zone** | Your banner dies in a void zone; replant it (move it by casting again). |
| **One-shots** | Unyielding Oath does not save you from `unavoidable` hits or enrage. |
| **Interrupts** | The knight has **no interrupt**; Valiant Charge's Stagger is non-boss only. |
| **Immunities** | Taunt-immune bosses (listed on page 13) ignore Gauntlet and Valiant Charge's taunt. |

---

## 4. Alternate spells — Banner colours

From `q_calling_knight_2` (level 20). Press **`Shift+1`–`3`** (page 02 §5.16: 1 Bastion · 2 Valor · 3 Mercy) to choose the
colour; if a banner is standing it changes colour in place (10 s lockout between changes). **Raise the
Standard** plants the chosen colour.

| Key (`Shift+`) | id | Banner | Aura (12 m) | Cloth |
|---|---|---|---|---|
| 1 | `knight_banner_bastion` | **Standard of Bastion** | allies take 6% less damage; you generate +20% threat | blue, a tower |
| 2 | `knight_banner_valor` | **Standard of Valor** | allies deal +5% damage | red, a raised sword |
| 3 | `knight_banner_mercy` | **Standard of Mercy** | allies receive +8% healing and heal 0.5% of max health a second | white, an open hand |

---

## 5. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Reproach** (`knight_reproach`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Reproach** — a 3.5 m circle around you | **Shield Throw** — becomes a thrown shield that hits 3 enemies within 20 m (bouncing) and returns | **Pommel Strike** — one target, 180% WD, Reproached lasts 10 s |
| 2 (22) | **Reproach the Wicked** — +30% damage against demons and undead, and they are Reproached for 12% | **Iron Answer** — Reproach gives a barrier of 3% of max health (up to 12%) | — |
| 3 (32) | **Shield Slam** — every 3rd Reproach Stuns a non-boss target for 1 s | **Counter-Reproach** — after you block, the next Reproach is free and gives +24 Fury | — |
| 4 (45) | **Sworn Blow** — hitting an enemy that is attacking your Sworn ally heals the ally 3% max health | **Reproach of Kings** — Reproached also reduces the enemy's attack speed 15% | — |

**Gauntlet** (`knight_gauntlet`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Gauntlet to All** — taunts every enemy within 10 m of you (not ranged; 12 s cooldown) | **Drag to Me** — pulls a non-boss target 8 m toward you | — |
| 2 (22) | **Accepted** — while the target is taunted, it takes +10% damage from your group | **Fearless** — you take 10% less damage from the taunted target | — |
| 3 (32) | **Standing Gauntlet** — cast on your banner: for 6 s every enemy within 12 m of the banner is taunted to you | **Last Word** — if the taunted target attacks anyone else in the next 6 s, it is Stunned 1 s (non-boss) | — |
| 4 (45) | **Duel** — you and the target deal +15% to each other; others take 15% less from it, 8 s | **Ringing Gauntlet** — also removes one Snare or Root from you | — |

**Raise the Standard** (`knight_raise_the_standard`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Carried Standard** — the banner rides on your back instead of being planted; aura 8 m | **Thrown Standard** — plant it up to 25 m away | — |
| 2 (22) | **Rallying Plant** — planting removes one Snare, Root or Slow from every ally in 12 m | **Rooted Standard** — allies in the aura cannot be knocked back (non-mechanic) | **Two Colours** — the banner carries two colours at 70% each (choose both with two `Shift+1`–`3` presses) |
| 3 (32) | **Last Stand Standard** — an ally in the aura who drops below 20% health gets a 15% max health barrier (once per ally per plant) | **Standard of Wrath** — enemies in the aura take 20% WD holy a second | — |
| 4 (45) | **Held Ground** — while you stand in the aura you cannot be knocked back and your Fury decays at 0 | **Banner of the Order** — the aura reaches 18 m and 15 raid allies | — |

**Line of Shields** (`knight_line_of_shields`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Shield Circle** — a full 360° guard around you, 25% reduction, 5 m | **Forward Line** — you move at full speed while channelling | — |
| 2 (22) | **Reflecting Line** — blocked projectiles fly back at their shooter for 100% of their damage | **Shield Bash Line** — releasing the channel shoves every enemy in front 4 m back and deals 120% WD | — |
| 3 (32) | **Bearer of Two** — while channelling you take **50% less damage from soaks** (you still count as one player; QUESTIONS.md C3) | **Hold Them** — non-boss enemies cannot pass through the line | — |
| 4 (45) | **Wall of the Order** — allies within 6 m behind you are also immune to knockback | **Tireless Line** — 10 s channel; costs 5 Fury a second after the 6th | — |

**Valiant Charge** (`knight_valiant_charge`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Two Charges** — 2 charges | **Crashing Charge** — arriving deals 120% WD in a 4 m circle and taunts all non-boss enemies in it for 2 s | — |
| 2 (28) | **Swift Oath** — charging an ally also swears your Vow to them for free | **Shield Bearer's Leap** — you leap instead of dash (over enemies and low walls) | — |
| 3 (32) | **Twofold Intercept** — Intercept takes the next **2** hits | **Retribution** — the attack you intercept is answered at once for 150% WD | **Longer Reach** — 26 m |
| 4 (45) | **Guardian's Path** — every ally you pass through gains a 10% max health barrier | **Rescue** — on an ally: carry them 6 m with you out of where they stood (refused if they are Rooted/Tethered by a mechanic) | — |

**Unyielding Oath** (`knight_unyielding_oath`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Shared Oath** — your Sworn ally gets the same 50% reduction (not the 1-health floor) | **Oath of Iron** — 15 s long, 40% reduction, no health floor | — |
| 2 (40) | **Oath of Fury** — Fury is refilled to 100 and your hits generate threat ×2 more for its duration | **Answering Oath** — 25% of the prevented damage is dealt back to your attackers | — |
| 3 (40) | **Oath Renewed** — if the health floor saved you, the cooldown is cut by 60 s | **Standing Oath** — it also plants a Bastion banner at your feet (free) | — |
| 4 (45) | **Oath of the Order** — every ally within 12 m takes 20% less damage for 6 s | **Second Oath** — 2 charges, 240 s each | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_knight_vowkeeper` | **Plate of the Vowkeeper** | `it_vowkeeper_greathelm`, `it_vowkeeper_pauldrons`, `it_vowkeeper_breastplate`, `it_vowkeeper_gauntlets`, `it_vowkeeper_greaves`, `it_vowkeeper_sabatons` | Levels 13–22: bosses of `d03_deepdelve`, `d04_bellows_keep`, `d05_glass_tombs`. Heroic/Mythic+ copies at 60. |
| `set_knight_bannerlord` | **Bannerlord's Harness** | `it_bannerlord_crested_helm`, `it_bannerlord_spaulders`, `it_bannerlord_hauberk`, `it_bannerlord_warfists`, `it_bannerlord_legplates`, `it_bannerlord_warboots` | Level 42: `r02_glacier_throne`; level 60: `r04_ember_court`; the hauberk only from each raid's final boss (`b_queen_ysmere` Queen Ysmere of the Glacier Throne; `b_ember_king_kaedros` Kaedros, the Ember King) |

**Plate of the Vowkeeper**
- **2 pieces** — Vow of Protection moves 30% instead of 25% (40% at the banner from Oathsworn is unchanged).
- **4 pieces** — each hit moved by the Vow gives +2 Fury.
- **6 pieces** — Valiant Charge on your Sworn ally has no cooldown once every 30 s.

**Bannerlord's Harness**
- **2 pieces** — Raise the Standard's banner lasts 45 s.
- **4 pieces** — Line of Shields also applies your banner's aura to everyone behind you, wherever the banner is.
- **6 pieces** — Unyielding Oath plants your banner at your feet, and its cooldown is 120 s while you stand at the banner.

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_aegis_of_the_unbroken_vow` | Aegis of the Unbroken Vow | shield | **Unbroken Vow** — the Vow moves 35%, and every 2% of your max health moved gives 1 Fury | `b_barrowking_hrodric` The Barrowking, Hrodric Ninefold (`r01_barrowking` end boss, page 13) |
| `leg_hammer_of_the_marching_banner` | Hammer of the Marching Banner | hammer | **Marching Standard** — your banner is carried on your back (8 m aura) and never needs replanting; Raise the Standard instead refreshes it and pulses its effect ×2 for 5 s | `b_kennelmaster_varro` Kennelmaster Varro, with Scorch and Soot (`r04_ember_court` boss 2, page 13) |
| `leg_helm_of_the_sworn_sentinel` | Helm of the Sworn Sentinel | head | **Sentinel's Call** — Gauntlet taunts every enemy within 8 m of its target; cooldown 6 s | `b_standing_ruin` The Standing Ruin (`frostmantle` world boss, page 13 §8) |
| `leg_gauntlets_of_the_intercessor` | Gauntlets of the Intercessor | hands | **Intercessor** — Intercept takes the next 2 hits and gives the ally 20% less damage for 4 s | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss, page 12) |
| `uq_squires_first_shield` | The Squire's First Shield | shield | **Keen Squire** — Reproach gives +18 Fury instead of +12 | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss; scales on Heroic) |
| `uq_pennant_of_brightwater` | Pennant of Brightwater | neck | **Long Watch** — your banner lasts 45 s | `b_wren_grist` Wren Grist, the Miller's Wife (`d02_drowned_mill` boss 2) |
| `uq_oathbreakers_greaves` | The Oathbreaker's Greaves | legs | **Broken Promise** — Unyielding Oath's cooldown is 150 s but it lasts 8 s and its health floor 4 s | `b_warmaster_drogath` Round Three: Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `knight` (pitch 0.36, depth 0.72, tone 0.55, breath 0.1, rough 0.15, speed
0.45, jitter 0.06) — firm, deep, measured.

| When | Lines |
|---|---|
| Gauntlet | "Face me!" · "Your fight is with me." · "Here, coward!" |
| Vow sworn | "I stand for you." · "On my honour — you will not fall." |
| Banner planted | "Here we hold!" · "To the standard!" · (Mercy) "Rest easy, I have you." |
| Intercept | "Behind me!" · "Not them — me." |
| Unyielding Oath | "I will not fall!" · "By my oath!" |
| Critical hit | "For the Order!" · "Yield!" |
| Low health | "Hold … hold!" · "I need healing, now!" |
| Sworn ally dies | "I failed my oath …" · "Forgive me." |

---

## 9. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `knight` (plate helm, surcoat, greaves, cape, pauldrons);
  Farhold `classes.json` knight (`kite_shield` off hand, sword). The banner prop is new (page 17).
- **Effects** (visuals only): Reproach borrows `shield_bash`'s swing and the `block` status; Valiant Charge
  borrows `charge`'s dash; Unyielding Oath borrows the `pillar` effect and `barrier` status; Line of Shields
  builds on the `block` aura.
- **Emberveil's knight** (`knight_shield_bash`, `knight_taunt`, `knight_holy_strike`, `rally`) → Reproach,
  Gauntlet, Reproach tier 2a (holy bonus vs demons/undead), banner colours. Ids and names changed; Emberveil's
  `rally` is not reused (it is shared with other classes there).
- Farhold's knight kit (`shield_bash`, `guard_stance`, `power_strike`, `sunder`, `stoneskin`, `execute`) is **dropped**.
- **Tech**: the Vow is a server-side damage split applied **after** the ally's own reductions and **before** the
  knight's; page 05 should show it in the damage order list.
