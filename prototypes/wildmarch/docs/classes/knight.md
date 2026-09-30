# Knight (`knight`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 24.
> Status: v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one swing of the equipped main-hand weapon, before armour.
- **Momentum** ([page 06](../06-CLASSES.md) §Resources owns it): a pool of **100** that starts at **0**. It
  builds **+4** per main-hand basic-attack hit, **+2** per off-hand hit, **+8** on a pattern finisher, **+1 per
  1% of your max health** you lose to a hit, and by spells that say "builds N". It drains **5 a second**,
  starting 5 s after combat ends. Knight spells cost 10–30; the builder (Reproach) costs nothing.
- **Threat** (how much an enemy wants to attack you; page 05 owns the table): "threat ×3" means the hit counts
  three times its damage toward the enemy's threat list.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- "Group" = the party of up to 5.
- **Targeting kinds** (00 §12.1 W8): **Needs target** will not cast without a valid target; **Auto-target**
  uses your target, or picks the valid enemy nearest your aim point; **Ground**; **Self**; **Ally** uses your
  friendly target (`F1` yourself, `F2`–`F5` party members, or a follower).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A sworn protector in blue surcoat and plate: a shield on one arm, a banner planted behind the line, and a vow to one person that they will not fall while the knight stands. |
| Primary role | **Tank** |
| Hybrid role | **Support** — the banner's colours and a Vow that makes one ally fearless (§5) |
| Build | Melee |
| Armour | Heavy |
| Weapons | **Sword** or **hammer**, one-handed, with a **shield** (reuse: `js/weapons.js` `sword`, `longsword`, `hammer`; Farhold `classes.json` knight `shield: true`). A knight may use a two-handed sword, but its tank passive needs a shield. |
| Primary attribute | STR |
| Resource | **Momentum** + the **Vow** and the **Banner** (§2) |
| Companion | None. The knight's companion is whoever it has sworn to protect. |

**Playstyle in three sentences.** The knight holds enemies with a shield, a rebuke and a thrown gauntlet, and it
takes a share of the damage meant for one sworn ally through its **Vow of Protection**. It plants a
**banner** where the group fights; from 20 the banner's colour decides whether it hardens, strengthens or
heals the people around it. Its signature moments are stepping in front of a blow meant for someone else,
and a last oath that will not let it fall.

---

## 2. Class mechanic — the Vow and the Banner

### 2.1 Shield Oath (always on in Tank focus)

With a **shield** equipped and **Tank** role focus: your damage generates **threat ×2**, and you take **10% less
damage**. This is the knight's **Guardian** state (page 05 §Threat) and tank passive. Without a shield, or in
Support focus, Shield Oath does nothing (§5 says what Support focus gives instead).

### 2.2 Vow of Protection — the class key

**`knight_vow_of_protection` — Vow of Protection** (class key **`Q`**, page 02; from `q_calling_knight_1`, level 6).
- **Cost** none · **Cooldown** 5 s to change who you are sworn to · **Cast** instant · **Range** 30 m.
- **Targeting** Needs target (a friendly target: `F2`–`F5`, a party frame, or a follower; not yourself) ·
  **Tags** `tag_spell`, `tag_duration`.
- The ally becomes **Sworn** (new status) until you swear to someone else, die, or leave the fight for 30 s:
  **25%** of the damage they take is **moved to you**, then reduced by **your** armour and damage reduction.
- **Safety**: while you are below **20%** of your max health, nothing is moved (the Vow pauses; its chain dims).
  Damage flagged `unavoidable` or `mechanic` (page 11) is never moved — a soak share, a doom debuff and a
  one-shot stay with the person they hit.
- **Range**: past **40 m** the Vow pauses and resumes when you are back in range.
- **One knight per ally**: an ally can be sworn to only one knight at a time.
- In **Support** focus the Vow also makes the ally **Fearless** (§5.2).
- **Looks like**: a thin **gold chain** of light from your shield to the ally (never white — white lines are
  boss tethers, page 11), and a small gold shield icon on their nameplate. When damage moves, a gold pulse
  runs down the chain toward you.
- **Sound**: a chain rattle when sworn; a soft metallic "tink" on each moved hit (volume scaled by size).

### 2.3 The Banner

Planted by the spell **Raise the Standard** (§3, level 10). Until level 20 it is the **Standard of Bastion** in
Tank focus and the **Standard of Valor** in Support focus; after `q_calling_knight_2` you choose its colour (§4).

| Rule | Value |
|---|---|
| Aura | **12 m** around the banner (16 m in Support focus) |
| Who | every group member and follower inside it (at most the party of 5, plus followers) |
| Duration | 30 s |
| Health | 25% of your max health; non-boss enemies attack it only when nothing else is in reach; dies at once in a Void zone |
| Soaks | the banner is not a player and never counts toward a soak |
| Stacking | two knights' banners of the **same** colour: one counts. Different colours: both count, within page 06's buff families |

### 2.4 Gauge UI

`hud_class_gauge` (page 03): the Momentum bar (deep red) sits under the health bar. To its right a
**shield-shaped slot** shows the Vowed ally's portrait, name and a thin health bar; the chain icon beside it
lights when damage is being moved and greys when the Vow is paused (with the reason on hover: "Out of range",
"You are below 20%"). A small **pennant** above the Momentum bar shows the banner's colour and its 30 s draining.

### 2.5 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_knight_1` "The Oath of the Shield" | `npc_dame_vaunt`, Brightwater keep | Escort a Vale watch courier (the Wardens) through Hearthvale while bandits ambush; the courier must finish above half health | **Vow of Protection** |
| 20 | `q_calling_knight_2` "Colours of the Order" | Dame Vaunt, Highcourt chapter house | Recover three lost standards (one each from Greyridge, Sunscar and Highcourt's catacombs) | **Banner colours** (all three), the colour switch |
| 40 | `q_calling_knight_3` "Oathsworn" | Dame Vaunt, Rimehold wall | Hold the Rimehold gate beside your banner while two sworn villagers are attacked; neither may die | **Oathsworn** (below) |

**Oathsworn** (calling 3 rule): the Vow can bind **two** allies (swear the second with **`G`**, the second
class key, page 02); while you stand within your banner's aura, the Vow moves **40%** instead of 25%; and your
banner **cannot be destroyed**.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `knight_reproach` | Reproach | builds 12 Momentum | — | instant | Auto-target | melee 3 m | 90° arc | `tag_attack` `tag_physical` `tag_melee` `tag_area` | 130% WD, threat ×3, Reproached 6 s |
| 2 | 4 | `knight_gauntlet` | Gauntlet | 10 Momentum | 8 s | instant | Needs target | 25 m | one enemy | `tag_spell` `tag_ranged` `tag_duration` | taunt 3 s, top of threat +10% |
| 3 | 10 | `knight_raise_the_standard` | Raise the Standard | 30 Momentum | 30 s | instant | Self | at your feet | banner, 12 m aura | `tag_spell` `tag_aura` `tag_area` `tag_duration` | banner for 30 s (colour §4) |
| 4 | 18 | `knight_line_of_shields` | Line of Shields | 20 Momentum | 40 s | channel up to 6 s | Self | self | 120° wall, 6 m | `tag_spell` `tag_channel` `tag_shield` `tag_area` | −40% frontal damage for you and allies behind; blocks projectiles |
| 5 | 28 | `knight_valiant_charge` | Valiant Charge | 15 Momentum | 15 s | instant dash | Needs target (enemy or ally) | 18 m | to a target | `tag_attack` `tag_physical` `tag_melee` `tag_movement` | enemy: 180% WD + taunt 2 s · ally: intercept next hit |
| 6 | 40 | `knight_unyielding_oath` | Unyielding Oath | none | 180 s | instant | Self | self | self | `tag_spell` `tag_shield` `tag_duration` | −50% damage 10 s, cannot fall below 1 health for 6 s |

### 3.2 The spells in full

**`knight_reproach` — Reproach** · slot 1 · level 1
- **Cost** none; **builds 12 Momentum** if it hits · **Cooldown** none (GCD) · **Cast** instant · **Range** melee 3 m · **Shape** 90° arc.
- **Targeting** Auto-target · **Tags** `tag_attack`, `tag_physical`, `tag_melee`, `tag_area`.
- **Effect** 130% WD with **threat ×3** (×6 with Shield Oath). The first enemy hit is **Reproached** (new status)
  for 6 s: it deals **8% less damage to anyone except you**.
- **Looks like**: a short shield-edge shove followed by a cut; a blue-white spark flash on the shield face
  (spellfx `impact`, physical, recoloured `#8fb0ff`; the `block` status sprite flashes once).
- **Sound**: a heavy shield clang.

**`knight_gauntlet` — Gauntlet** · slot 2 · level 4
- **Cost** 10 Momentum · **Cooldown** 8 s · **Cast** instant · **Range** 25 m · **Shape** one enemy.
- **Targeting** Needs target (enemy) · **Tags** `tag_spell`, `tag_ranged`, `tag_duration`.
- **Effect** **taunt** for 3 s: the enemy must attack you, and you are put at the top of its threat list +10%
  (page 05 taunt rule). Works on **bosses** (it is the knight's tank-swap tool). Bosses that are immune to taunt
  are marked as such on pages 11–13.
- In **Support** focus it becomes **Called Out** instead (§5.2).
- **Looks like**: you point your sword; a gold gauntlet emblem flies to the enemy and hangs over its head
  (spellfx `marked` status, recoloured gold, for 3 s).
- **Sound**: a gauntlet thrown to the floor; your voice line (§10).

**`knight_raise_the_standard` — Raise the Standard** · slot 3 · level 10
- **Cost** 30 Momentum · **Cooldown** 30 s · **Cast** instant · **Range** planted at your feet · **Shape** a banner with a 12 m aura, 30 s.
- **Targeting** Self · **Tags** `tag_spell`, `tag_aura`, `tag_area`, `tag_duration`.
- **Effect** plants your banner of the chosen colour (§4). Before level 20 it is the **Standard of Bastion**
  (Tank focus: allies within 12 m take **6% less damage** and you generate **+20% threat**) or the **Standard
  of Valor** (Support focus). One banner per knight; casting again moves it.
- **Looks like**: a tall blue banner on a spear-pole driven into the ground (a new prop, `prop_knight_banner`,
  colour from the knight's `surcoat` colour), a faint ring on the ground in the banner's colour
  (spellfx `ring`, life = banner duration, low opacity).
- **Sound**: the pole striking stone, then a cloth flap loop.

**`knight_line_of_shields` — Line of Shields** · slot 4 · level 18
- **Cost** 20 Momentum · **Cooldown** 40 s · **Cast** channel, up to 6 s; release the key to end it · **Range** self · **Shape** a 120° wall in front of you, and the space 6 m behind you.
- **Targeting** Self · **Tags** `tag_spell`, `tag_channel`, `tag_shield`, `tag_area`.
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
- **Cost** 15 Momentum · **Cooldown** 15 s · **Cast** instant dash · **Range** 18 m · **Shape** to an enemy **or** an ally.
- **Targeting** Needs target — your current target decides: an enemy target charges the enemy, a friendly
  target (`F2`–`F5`, a follower) charges to the ally · **Tags** `tag_attack`, `tag_physical`, `tag_melee`, `tag_movement`.
- **On an enemy** 180% WD on arrival and 60% WD to anything within 2 m of your path; the target is **Staggered**
  for 1 s (non-boss) and **taunted for 2 s** (bosses included; not in Support focus).
- **On an ally** you arrive at their side and **Intercept** (new status on them, 4 s): the **next hit** they
  would take — a normal attack **or a single-target boss ability not flagged `mechanic`** (a "tank buster"
  counts) — hits **you** instead, with your own reduction. Useful for a tank swap and to save a healer.
- **Looks like**: a blue-gold streak with a pennant trail (spellfx `projectile` physical along your path, holy
  `holy_mote` trail); on an ally, a gold shield outline stands between them and the enemy.
- **Sound**: armoured footfalls, a war shout, the hit or a shield slam.

**`knight_unyielding_oath` — Unyielding Oath** · slot 6 · level 40
- **Cost** none · **Cooldown** 180 s · **Cast** instant, usable while Stunned · **Range** self.
- **Targeting** Self · **Tags** `tag_spell`, `tag_shield`, `tag_duration`.
- **Effect** for **10 s** you take **50% less damage**. For the **first 6 s** you **cannot drop below 1 health**
  (**Oathbound**, new status). When it ends, you heal **20% of all the damage it prevented**.
- **Limits**: Oathbound does **not** apply to hits flagged `unavoidable`, to a boss **enrage**, or to falling
  out of the world. The Vow keeps moving damage to you during it (that is the point); the 20% pause rule still
  applies once Oathbound ends.
- **Looks like**: your armour flashes white-gold; a ring of standing shield-shapes circles you (spellfx
  `pillar`, holy, radius 2; status `barrier` recoloured gold for 10 s).
- **Sound**: a deep bell, your oath line (§10), and a heartbeat under the music while Oathbound lasts.

### 3.3 Rotation — how it plays

**Solo.** Reproach is your filler and Momentum engine. Raise the Standard where you stand to fight; throw the
Gauntlet at the enemy that runs past you toward your followers. Valiant Charge onto the next pack. Swear your
Vow to your toughest follower (followers are allies too) so its health lasts longer. Unyielding Oath is your
"I made a mistake" button.

**Dungeon (tank).** Pull with **Valiant Charge**, Reproach the pack (threat ×6 with a shield), plant the
**Bastion** banner. Throw the **Gauntlet** at anything that turns to the healer. Swear the **Vow to the healer**
(they take the loose hits). **Line of Shields** facing a caster pack's volley, with the group behind you.
**Unyielding Oath** for the boss's heaviest phase. If the dungeon has a tank swap and a second tank-capable
player, **Valiant Charge + Intercept** the other tank to eat a tank-buster, then throw the Gauntlet.

**Dungeon (support).** See §5.4.

### 3.4 What the knight gives a group (5)

| Gives | Group of 5 | Stacks with |
|---|---|---|
| Banner — Bastion | 6% less damage taken (`group_defence`) | other damage reduction; not a second Bastion |
| Banner — Valor | +5% damage (`group_damage`) | group-buff cap (page 05); not a second Valor |
| Banner — Mercy | +8% healing received, 0.5% max health a second (`group_healing`) | not a second Mercy |
| Vow | 25% (40% at the banner from 40) of one ally's damage moved to you; 1 ally (2 from 40) | healers; not a second knight's Vow on the same ally |
| Line of Shields | −40% frontal damage for all behind you, 6 s every 40 s | other reductions |
| Reproached | −8% damage from one enemy to others | Weakened (page 05): the stronger applies |

### 3.5 Threat and defensive tools (tank summary)

| Tool | What | Every |
|---|---|---|
| Shield Oath | threat ×2, −10% damage | always (shield, Tank focus) |
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
| **Soak** | Line of Shields tier 3 **Share the Weight**: while channelling, the knight takes **50% less damage from a soak it stands in**. The knight still counts as **one** player. Nothing counts as an extra body for a soak: pets, class companions, banners and talents never do (00 §10). |
| **Room-wide hits** | Face the boss with Line of Shields; everyone within 6 m behind you takes 40% less. |
| **Targeted** | Intercept only works on single-target hits, never on Targeted circles (they are `mechanic`). |
| **Void zone** | Your banner dies in a void zone; replant it (move it by casting again). |
| **One-shots** | Unyielding Oath does not save you from `unavoidable` hits or enrage. |
| **Interrupts** | The knight has **no interrupt**; Valiant Charge's Stagger is non-boss only. |
| **Immunities** | Taunt-immune bosses (listed on pages 12–13) ignore Gauntlet and Valiant Charge's taunt. |

---

## 4. Alternate spells — Banner colours

From `q_calling_knight_2` (level 20). Press **`Shift+1`–`3`** (page 02: 1 Bastion · 2 Valor · 3 Mercy) to choose
the colour; if a banner is standing it changes colour in place (10 s lockout between changes). **Raise the
Standard** plants the chosen colour.

| Key (`Shift+`) | id | Banner | Aura (12 m; 16 m in Support focus) | Cloth |
|---|---|---|---|---|
| 1 | `knight_banner_bastion` | **Standard of Bastion** | allies take 6% less damage; you generate +20% threat | blue, a tower |
| 2 | `knight_banner_valor` | **Standard of Valor** | allies deal +5% damage | red, a raised sword |
| 3 | `knight_banner_mercy` | **Standard of Mercy** | allies receive +8% healing and heal 0.5% of max health a second | white, an open hand |

---

## 5. The hybrid role — Support (`(new)`)

The Support knight stops holding enemies and starts **making its allies braver**: the banner grows, the Vow
makes one ally fearless instead of only sheltering them, and the Gauntlet points the whole group at the enemy
it names. It is tuned for the open world, Normal dungeons and moderate Depth; in Challenge mode a primary
Support brings more.

### 5.1 What Support focus turns on

The knight uses the shared **Role focus** switch in the spellbook (canon 00 §6; saved per Loadout): **Primary** is
the page's "Tank focus" and **Hybrid** is its "Support focus", and the Dungeon Finder queues it as that role. The
switch is **tied to the shield** — Tank focus's Shield Oath needs one (§2.1) — and to the banner, whose default
standard follows the focus (§2.3). Choosing **Support** (free, 5 s cast, out of combat) gives the shared
**Herald** passive (+10% to the strength of buffs and debuffs you apply) and these class changes:

| Change | Rule |
|---|---|
| Shield Oath | off (no ×2 threat, no 10% reduction) |
| Banner | aura **16 m** instead of 12 m; before level 20 it plants **Valor** (+5% damage) |
| Vow of Protection | moves **15%** instead of 25%, and the ally is **Fearless** (§5.2) |
| Gauntlet | becomes **Called Out** (§5.2) — no taunt |
| Valiant Charge | no taunt on an enemy; on an ally, Intercept also grants **+20% move speed** for 4 s |
| Unyielding Oath | also gives every ally within 12 m **20% less damage for 6 s** (the tier-4a talent's effect, for free) |

### 5.2 The Support versions

- **Fearless** (status on the Vowed ally, `tag_duration`): **+8% damage** and **immune to Fear** (non-mechanic)
  while sworn. The chain turns red-gold. Buff family `sworn_valour` (one per ally).
- **`knight_called_out` — Called Out** (Gauntlet in Support focus) · 10 Momentum · 8 s cooldown · **Needs target**
  (enemy) · 25 m · **Tags** `tag_spell`, `tag_ranged`, `tag_duration`, `tag_curse`. The enemy is **Called Out**
  for 8 s: it takes **+6% damage from your group** and deals **8% less damage to anyone but you**. It does not
  taunt. Does not stack with the tactician's Designated (the stronger applies).

### 5.3 What a Support knight brings, in numbers

| Source | Value for a group of 5 |
|---|---|
| Valor banner (16 m) with Herald | +5.5% damage for everyone in it |
| Fearless | +8.8% damage for one ally, plus 15% of their incoming damage moved to you |
| Called Out | +6.6% damage from the group to one enemy, 8 s of every 8 s |
| Line of Shields | −40% frontal damage for everyone behind you, 6 s every 40 s |
| Unyielding Oath | −20% damage for the group for 6 s every 180 s |

### 5.4 How a Support knight plays a boss

Swear the Vow to the top damage dealer (Fearless). Plant **Valor** where the group stands. Keep **Called Out**
on the boss (it lasts as long as its cooldown). Use **Line of Shields** facing the boss for every room-wide hit,
and **Valiant Charge** onto a player caught in a telegraph to take the next hit for them. Talents that lean
Support: Gauntlet t2a **Accepted**, Raise the Standard t2c **Two Colours**, t3a **Standard of Refuge**, Unyielding
Oath t4a **Oath of the Order**. Set: **Bannerlord's Harness** 4-piece. Soul: `soul_bannerlords_heart`.

---

## 6. Utility spells

None. The knight travels by scrolls, the Recall Stone and Travel Methods like everyone else
([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Reproach** (`knight_reproach`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Reproach** — a 3.5 m circle around you | **Shield Throw** — becomes a thrown shield that hits 3 enemies within 20 m (bouncing) and returns (adds `tag_ranged`, `tag_projectile`) | **Pommel Strike** — one target, 180% WD, Reproached lasts 10 s |
| 2 (22) | **Reproach the Wicked** — +30% damage against demons and undead, and they are Reproached for 12% | **Iron Answer** — Reproach gives a barrier of 3% of max health (up to 12%) | — |
| 3 (32) | **Shield Slam** — every 3rd Reproach Stuns a non-boss target for 1 s | **Counter-Reproach** — after you block, the next Reproach builds 24 Momentum | — |
| 4 (45) | **Vowed Blow** — hitting an enemy that is attacking your Vowed ally heals the ally 3% max health | **Reproach of Kings** — Reproached also reduces the enemy's attack speed 15% | — |

**Gauntlet** (`knight_gauntlet`; the same talents apply to Called Out, with "taunted" read as "Called Out")
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Gauntlet to All** — taunts every enemy within 10 m of you (not ranged; 12 s cooldown) | **Drag to Me** — pulls a non-boss target 8 m toward you | — |
| 2 (22) | **Accepted** — while the target is taunted, it takes +10% damage from your group | **Fearless Stand** — you take 10% less damage from the taunted target | — |
| 3 (32) | **Standing Gauntlet** — cast on your banner: for 6 s every enemy within 12 m of the banner is taunted to you | **Last Word** — if the taunted target attacks anyone else in the next 6 s, it is Stunned 1 s (non-boss) | — |
| 4 (45) | **Duel** — you and the target deal +15% to each other; others take 15% less from it, 8 s | **Ringing Gauntlet** — also removes one Snare or Root from you | — |

**Raise the Standard** (`knight_raise_the_standard`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Carried Standard** — the banner rides on your back instead of being planted; aura 8 m | **Thrown Standard** — plant it up to 25 m away (becomes Ground targeting) | — |
| 2 (22) | **Rallying Plant** — planting removes one Snare, Root or Slow from every ally in the aura | **Rooted Standard** — allies in the aura cannot be knocked back (non-mechanic) | **Two Colours** — the banner carries two colours at 70% each (choose both with two `Shift+1`–`3` presses) |
| 3 (32) | **Standard of Refuge** — an ally in the aura who drops below 20% health gets a 15% max health barrier (once per ally per plant) | **Standard of Wrath** — enemies in the aura take 20% WD holy a second (adds `tag_holy`) | — |
| 4 (45) | **Held Ground** — while you stand in the aura you cannot be knocked back and your Momentum does not drain | **Banner of the Order** — the aura grows by 6 m and lasts 40 s | — |

**Line of Shields** (`knight_line_of_shields`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Shield Circle** — a full 360° guard around you, 25% reduction, 5 m | **Forward Line** — you move at full speed while channelling | — |
| 2 (22) | **Reflecting Line** — blocked projectiles fly back at their shooter for 100% of their damage | **Shield Bash Line** — releasing the channel shoves every enemy in front 4 m back and deals 120% WD | — |
| 3 (32) | **Share the Weight** — while channelling, you take **50% less damage from a soak** you stand in (you still count as one player; pets and talents never add bodies to a soak) | **Hold Them** — non-boss enemies cannot pass through the line | — |
| 4 (45) | **Wall of the Order** — allies within 6 m behind you are also immune to knockback | **Tireless Line** — 10 s channel; costs 5 Momentum a second after the 6th | — |

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
| 1 (40) | **Shared Oath** — your Vowed ally gets the same 50% reduction (not the 1-health floor) | **Oath of Iron** — 15 s long, 40% reduction, no health floor | — |
| 2 (40) | **Rising Oath** — Momentum is filled to 100 and your hits generate threat ×2 more for its duration | **Answering Oath** — 25% of the prevented damage is dealt back to your attackers | — |
| 3 (40) | **Oath Renewed** — if the health floor saved you, the cooldown is cut by 60 s | **Standing Oath** — it also plants a banner of your current colour at your feet (free) | — |
| 4 (45) | **Oath of the Order** — every ally within 12 m takes 20% less damage for 6 s (in Support focus: 30%) | **Second Oath** — 2 charges, 240 s each | — |

---

## 8. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_knight_vowkeeper` | **Plate of the Vowkeeper** | `it_vowkeeper_greathelm`, `it_vowkeeper_pauldrons`, `it_vowkeeper_breastplate`, `it_vowkeeper_gauntlets`, `it_vowkeeper_greaves`, `it_vowkeeper_sabatons` | Levels 13–22: bosses of `d03_shaft_seven`, `d04_bellows_keep`, `d05_glass_tombs` on Normal. Level-60 copies from the same bosses in **Challenge** mode |
| `set_knight_bannerlord` | **Bannerlord's Harness** | `it_bannerlord_crested_helm`, `it_bannerlord_spaulders`, `it_bannerlord_hauberk`, `it_bannerlord_warfists`, `it_bannerlord_legplates`, `it_bannerlord_warboots` | Level 42–45: bosses of `d11_saltdeep_cathedral` on Normal. Level 60: **Challenge**-mode bosses of `d13_cindergate`, `d14_ashen_reliquary`, `d15_fire_court`, `d16_the_spire`, and Depth end chests from Depth 10 up. The hauberk only from Kaedros, the Fire King (`b_fire_king_kaedros`, `d15_fire_court` end boss), or as a Blacksmithing recipe (page 19) learned from that boss |

**Plate of the Vowkeeper**
- **2 pieces** — Vow of Protection moves 30% instead of 25% (40% at the banner from Oathsworn is unchanged).
- **4 pieces** — each hit moved by the Vow builds +2 Momentum.
- **6 pieces** — Valiant Charge on your Vowed ally has no cooldown once every 30 s.

**Bannerlord's Harness**
- **2 pieces** — Raise the Standard's banner lasts 45 s.
- **4 pieces** — Line of Shields also applies your banner's aura to everyone behind you, wherever the banner is.
- **6 pieces** — Unyielding Oath plants your banner at your feet, and its cooldown is 120 s while you stand at the banner.

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_aegis_of_the_unbroken_vow` | Aegis of the Unbroken Vow | shield | **Unbroken Vow** — the Vow moves 35%, and every 2% of your max health moved builds 1 Momentum | `b_slagborn` Slagborn (world boss, [page 13](../13-WORLD-BOSSES.md)) |
| `leg_hammer_of_the_marching_banner` | Hammer of the Marching Banner | hammer | **Marching Standard** — your banner is carried on your back (8 m aura) and never needs replanting; Raise the Standard instead refreshes it and pulses its effect ×2 for 5 s | `b_kennelmaster_varro` Kennelmaster Varro, with Scorch and Soot (`d15_fire_court` sub-boss) |
| `leg_helm_of_the_sworn_sentinel` | Helm of the Sworn Sentinel | head | **Sentinel's Call** — Gauntlet taunts every enemy within 8 m of its target; cooldown 6 s | `b_standing_ruin` The Standing Ruin (`frostmantle` world boss, page 13) |
| `leg_gauntlets_of_the_intercessor` | Gauntlets of the Intercessor | hands | **Intercessor** — Intercept takes the next 2 hits and gives the ally 20% less damage for 4 s | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss, page 12) |
| `uq_squires_first_shield` | The Squire's First Shield | shield | **Keen Squire** — Reproach builds 18 Momentum instead of 12 | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss; a level-60 copy in Challenge mode) |
| `uq_pennant_of_brightwater` | Pennant of Brightwater | neck | **Long Watch** — your banner lasts 45 s | `b_wren_grist` Wren Grist, the Miller's Wife (`d02_drowned_mill` boss 2) |
| `uq_oathbreakers_greaves` | The Oathbreaker's Greaves | legs | **Broken Promise** — Unyielding Oath's cooldown is 150 s but it lasts 8 s and its health floor 4 s | `b_warmaster_drogath` Round Three: Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |

### 9.2 Souls

Souls sit in a **Soul socket** (page 08 §Sockets); page 09 catalogues them.

| id | Name | Socket in | Requirement | Behaviour | Source |
|---|---|---|---|---|---|
| `soul_oathkeeper` | Soul of the Oathkeeper | shield | Knight | **A new effect**: when your Vowed ally would take a killing blow that is not `unavoidable`, the Vow moves **100%** of that hit to you instead of 25%. Once per 60 s | `b_castellan_vorhane` (`d13_cindergate`), Challenge mode, 4%; any Depth 15+ end chest, 0.5% |
| `soul_bannerlords_heart` | Soul of the Bannerlord's Heart | chest | Knight | **A spell changes**: Raise the Standard also hangs a **small pennant on your Vowed ally**; it carries a copy of your banner's aura at 50% strength (6 m) wherever they go, for the banner's duration | `b_carrion_crown` (world boss), 2%; `b_the_great_bellows` (page 12), Challenge mode, 4% |

---

## 10. Voice and barks

**Voice**: reuse `shared/voices.js` `knight` (pitch 0.36, depth 0.72, tone 0.55, breath 0.1, rough 0.15, speed
0.45, jitter 0.06) — firm, deep, measured.

| When | Lines |
|---|---|
| Gauntlet | "Face me!" · "Your fight is with me." · "Here, coward!" |
| Called Out | "That one. Bring it down!" · "You — I name you." |
| Vow sworn | "I stand for you." · "On my honour — you will not fall." |
| Banner planted | "Here we hold!" · "To the standard!" · (Mercy) "Rest easy, I have you." |
| Intercept | "Behind me!" · "Not them — me." |
| Unyielding Oath | "I will not fall!" · "By my oath!" |
| Critical hit | "For the Order!" · "Yield!" |
| Low health | "Hold … hold!" · "I need healing, now!" |
| Vowed ally dies | "I failed my oath …" · "Forgive me." |

---

## 11. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `knight` (plate helm, surcoat, greaves, cape, pauldrons);
  Farhold `classes.json` knight (`kite_shield` off hand, sword). The banner prop is new (page 17).
- **Effects** (visuals only): Reproach borrows `shield_bash`'s swing and the `block` status; Valiant Charge
  borrows `charge`'s dash; Unyielding Oath borrows the `pillar` effect and `barrier` status; Line of Shields
  builds on the `block` aura.
- **The earlier knight** in the Emberveil 2 prototype (`knight_shield_bash`, `knight_taunt`, `knight_holy_strike`,
  `rally`) → Reproach, Gauntlet, Reproach tier 2a (holy bonus vs demons/undead), banner colours. Ids and names
  changed; that prototype's `rally` is not reused (it is shared with other classes there).
- Farhold's knight kit (`shield_bash`, `guard_stance`, `power_strike`, `sunder`, `stoneskin`, `execute`) is **dropped**.
- **Tech**: the Vow is a server-side damage split applied **after** the ally's own reductions and **before** the
  knight's; page 05 should show it in the damage order list.

---

## 12. Round 2 changes

*(reference — a Claude-facing change log. Old names, including banned ones, are listed here only so they can be found and removed elsewhere; none of them is used in play.)*

- **Resource**: Fury → **Momentum** (numbers from 00 §6 / page 06; "gives N" → "builds N").
- **Hybrid role added**: **Support** — Fearless Vow, Called Out, a 16 m banner, a group Oath (§5).
- **Soak rule** (QUESTIONS.md C3): the Line of Shields tier-3 talent "Bearer of Two" → **Share the Weight**: 50% less
  soak damage to the knight; the knight counts as one player; pets, banners and talents never add a body.
- **Renamed**: "Last Stand Standard" (banned name) → **Standard of Refuge**; "Oath of Fury" → **Rising Oath**;
  Gauntlet t2b "Fearless" → **Fearless Stand** (Fearless is now the Support status); "Banner of the Order" no
  longer mentions raid allies (now +6 m and 40 s).
- **New**: `knight_called_out`, status Fearless, souls `soul_oathkeeper` and `soul_bannerlords_heart`.
- **Removed**: raid rotation, raid column, "up to 10 allies"; Heroic/Mythic+ copies.
- **Re-sourced**: Bannerlord's Harness r02/r04 → d11 Normal + Challenge d13–d16 + Depth 10+ (+ a Blacksmithing recipe
  for the hauberk); Aegis `b_barrowking_hrodric` (r01) → `b_slagborn`; Hammer r04 → `d15_fire_court`;
  `b_ember_king_kaedros` → `b_fire_king_kaedros`.
- **Sweep (round 2)**: §5.1 now names the canon Role focus switch (Primary = Tank focus, Hybrid = Support focus;
  tied to the shield and the banner); "a challenge" in the playstyle line → "a thrown gauntlet" (the shared
  taunt is **Provoke**); `leg_hammer_of_the_marching_banner` source note tidied; "gauntlet sigil" → "gauntlet emblem".
