# Monk (`monk`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 21.
> Status: v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one hit of the equipped weapon (a quarterstaff, or hand wraps — §1). Monk **heals** are
  also written in % WD: a monk's healing scales with the same weapon it fights with.
- **Tempo** ([page 06](../06-CLASSES.md) §Resources owns it): pool **100**, starts full, refills **25 a second**
  in or out of combat (a full bar in 4 s), × (1 + haste). Monk spells cost 25–60 Tempo; Rising Palm on every
  global cooldown costs exactly what refills, so anything else you cast is paid for out of the pool.
- **Breath**: the class gauge (§2), 4–6 orbs. (It was called Chi before round 2.)
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- A melee shape reaches its printed distance or as far as the weapon swings, whichever is longer (reuse:
  Farhold `js/skills.js` `describeSkill`).
- "Group" = the party of up to 5.
- **Targeting kinds** (00 §12.1 W8): **Needs target** will not cast without a valid target; **Auto-target**
  uses your target, or picks the valid enemy nearest your aim point; **Ground**; **Self**; **Ally** uses your
  friendly target (`F1` yourself, `F2`–`F5` party members).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A barefoot fighter in an orange gi whose hands are faster than a blade — and who can turn the same strikes into healing. |
| Primary role | **Damage** — the **Way of the Storm Fist** (§2.3) |
| Hybrid role | **Healer** — the **Way of the Still Water**: heals by fighting (§5) |
| Build | Melee |
| Armour | Cloth |
| Weapons | **Quarterstaff** (reuse: `js/weapons.js` `quarterstaff`, jab–sweep–jab–sweep, 3.5 m), or **hand wraps** — a two-hand "weapon" that is the bare-fist pattern (reuse: `js/weapons.js` unarmed row, `['jab']`) with a real item level and affixes — weapon type `wraps` on page 08 (QUESTIONS.md C14, resolved). |
| Primary attribute | DEX |
| Resource | **Tempo** + **Breath** (0–6) + **Flow** (0–5) |
| Companion | None. |

**Playstyle in three sentences.** The monk fights up close with fast strikes that build **Breath**, and
spends Breath on techniques that hit far harder or heal. It is rewarded for **variety**: never casting the
same spell twice in a row builds **Flow**, which makes every technique stronger and the monk faster. At 20 it
chooses a **Way** — the Storm Fist for damage or the Still Water for healing — and the same six spells change
to suit.

---

## 2. Class mechanic — Breath, Flow and the Ways

### 2.1 Breath

| Rule | Value |
|---|---|
| Orbs | **4** at level 1 · **5** after `q_calling_monk_1` (6) · **6** after `q_calling_monk_2` (20) |
| Gain | spells list their Breath gain; **basic attacks** give +1 Breath on the **last** strike of the weapon's pattern (the 4th staff strike or every 3rd wraps jab) |
| Out of combat | 1 orb fades every 3 s after 6 s out of combat |
| Spent by | River Step (optional), Lotus Rest, Mountain Palm, Seven Stars Kata |

### 2.2 Flow (from the level-6 calling quest)

- Casting a spell **different** from your previous spell gives **+1 Flow** (max 5).
- Each Flow stack: **+4% damage and healing**, **+3% move speed**.
- Casting the **same spell twice in a row**, or going **4 s** in combat without casting a spell, resets Flow to 0.
- Basic attacks neither build nor break Flow.

**Gauge UI** (`hud_class_gauge`, page 03): a row of Breath orbs (warm orange pearls that swell and settle like
a slow breath) under the health bar, and above them a **lotus of five petals** that open one by one with Flow.
At 5 Flow the lotus glows white. The previous spell's icon sits faded in the lotus's centre so you know what not
to press next. In the Still Water Way a small portrait of your **Kept** ally (§5.2) sits to the right.

### 2.3 The Ways (from the level-20 calling quest)

The Way is tied to the canon **Role focus** switch (00 §6; saved per Loadout): **Primary (Damage)** is the Storm
Fist, **Hybrid (Healer)** is the Still Water. Change it at any shrine or out of combat with **`Shift+1`** (Storm Fist) / **`Shift+2`**
(Still Water) (page 02, forms and stances) — a 10 s meditation (you sit; any damage cancels) that also switches
your role focus and your Dungeon Finder role.

| id | Way | Rule | What it changes |
|---|---|---|---|
| `monk_way_storm_fist` | **Way of the Storm Fist** | +10% critical chance; each critical hit refunds 8 Tempo | The "Storm Fist" line in each spell below |
| `monk_way_still_water` | **Way of the Still Water** | **Wellspring**: 50% of the damage your spells deal heals an ally within 20 m — your **Kept** ally first if they are below 90% health, otherwise the most injured (a new ally each hit); your healing is +25%, your damage −20% | The "Still Water" line in each spell below |

**Before level 20** the monk has no Way rider: the spells work as written in their plain line. A monk below 20
in **Healer** focus has the **Novice's Wellspring** (§5.1).

### 2.4 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_monk_1` "The Hundred Steps" | `npc_master_stillwater`, the orchard shrine in Hearthvale | Climb the shrine steps while a sparring partner attacks; land 10 techniques without repeating one | **Flow**, Breath max 5, the **Novice's Wellspring** |
| 20 | `q_calling_monk_2` "Two Rivers" | Master Stillwater, the Greyridge monastery | Win a sparring bout using only damage, then carry a wounded pilgrim down the mountain keeping them alive with strikes | **The Ways**, Breath max 6 |
| 40 | `q_calling_monk_3` "The Empty Hand" | Master Stillwater, a peak above Rimehold | Fight your master's spirit with no weapon equipped | **Perfect Form** (below) |

**Perfect Form** (calling 3 rule): when you have **5 Flow and full Breath**, your next technique is
**Transcendent**: it costs no Breath and counts as if you spent full Breath, and its visual turns white-gold.
Internal cooldown 20 s.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `monk_rising_palm` | Rising Palm | 25 Tempo | — | instant | Auto-target | melee 3 m | 60° arc | `tag_attack` `tag_physical` `tag_melee` | 140% WD, +1 Breath, Staggered |
| 2 | 4 | `monk_hundred_petals` | Hundred Petals | 40 Tempo | 10 s | 1.6 s channel | Auto-target | melee 3.2 m | 90° arc | `tag_attack` `tag_physical` `tag_melee` `tag_area` `tag_channel` | 8 × 35% WD, +2 Breath |
| 3 | 10 | `monk_river_step` | River Step | 30 Tempo (+0–3 Breath) | 12 s | instant dash | Auto-target | 12 m | dash, 2 m path | `tag_attack` `tag_physical` `tag_melee` `tag_movement` | 120% WD +40% per Breath, trail |
| 4 | 18 | `monk_lotus_rest` | Lotus Rest | all Breath (min 1) | 20 s | up to 2 s channel | Self | self + allies 12 m | self/allies | `tag_spell` `tag_heal` `tag_channel` | 6% max health per Breath, cleanse |
| 5 | 28 | `monk_mountain_palm` | Mountain Palm | 35 Tempo + all Breath (min 1) | 8 s | instant | Needs target | melee 3 m | one enemy | `tag_attack` `tag_physical` `tag_melee` | 180% WD + 90% per Breath, Sundered |
| 6 | 40 | `monk_seven_stars` | Seven Stars Kata | 60 Tempo + 3 Breath | 90 s | instant | Self | 12 m | up to 7 enemies | `tag_attack` `tag_physical` `tag_melee` `tag_area` `tag_movement` | 7 × 220% WD, untargetable 1.4 s |

In the Still Water Way every spell that heals also carries `tag_heal`.

### 3.2 The spells in full

**`monk_rising_palm` — Rising Palm** · slot 1 · level 1
- **Cost** 25 Tempo · **Cooldown** none (GCD only) · **Cast** instant · **Range** melee 3 m · **Shape** 60° arc.
- **Targeting** Auto-target · **Tags** `tag_attack`, `tag_physical`, `tag_melee`.
- **Effect** 140% WD. **+1 Breath.** Non-boss enemies are **Staggered** (reuse: Farhold's stagger from
  `js/combat-feel.js`, with diminishing returns) for 0.6 s.
- **Storm Fist**: a critical hit gives +2 Breath instead of +1. **Still Water**: Wellspring heals for 70% of the damage instead of 50%.
- **Looks like**: an upward open-palm strike; a white air ring bursts at the target's chest (spellfx `ring`,
  axis vertical, physical colour).
- **Sound**: a sharp cloth snap and a hollow thump.

**`monk_hundred_petals` — Hundred Petals** · slot 2 · level 4
- **Cost** 40 Tempo · **Cooldown** 10 s · **Cast** 1.6 s channel, you move at 50% · **Range** melee 3.2 m · **Shape** 90° arc.
- **Targeting** Auto-target (you turn to face it) · **Tags** `tag_attack`, `tag_physical`, `tag_melee`, `tag_area`, `tag_channel`.
- **Effect** 8 strikes, each 35% WD (280% total) to everything in the arc. **+2 Breath** when the channel ends
  (+1 if it was cut short after 4 strikes).
- **Storm Fist**: each critical strike adds a 9th strike. **Still Water**: every strike throws a petal that
  heals your Kept ally, or the most injured ally within 20 m, for 30% WD (240% WD over the channel).
- **Looks like**: a blur of fists; orange-pink petals burst from each hit (spellfx `nature` impact,
  recoloured `#f0a0a0`, leaf sprites).
- **Sound**: eight quick thuds, rising in pitch.

**`monk_river_step` — River Step** · slot 3 · level 10
- **Cost** 30 Tempo, and you may spend **0–3 Breath** (it spends up to 3 if you have them; hold the key to spend 0) · **Cooldown** 12 s · **Cast** instant dash · **Range** 12 m · **Shape** dash, hits within 2 m of the path.
- **Targeting** Auto-target (with no enemy in range, you dash 12 m toward your aim point) · **Tags** `tag_attack`, `tag_physical`, `tag_melee`, `tag_movement`.
- **Effect** 120% WD **+40% per Breath spent** (up to 240%) to everything on the path. The dash counts as a
  **dodge** for its 0.3 s (the same protection as the roll, page 05). Leaves a **Current** on the ground for
  4 s: allies walking it gain +30% move speed.
- **Storm Fist**: each Breath spent also resets 1 s of Hundred Petals' cooldown. **Still Water**: allies who
  cross the Current heal 4% of max health (once each per cast).
- **Looks like**: a streak of blue-white water behind you (spellfx `ice` trail, recoloured to water blue,
  `footfall` along the path).
- **Sound**: a rush of water and one splash on arrival.

**`monk_lotus_rest` — Lotus Rest** · slot 4 · level 18 *(was Still Breath)*
- **Cost** all Breath (at least 1) · **Cooldown** 20 s · **Cast** channel up to 2 s, you move at 50%; the heal lands when the channel ends or is released · **Range** self, and allies within 12 m · **Shape** self + the 2 most injured allies.
- **Targeting** Self · **Tags** `tag_spell`, `tag_heal`, `tag_channel`.
- **Effect** you heal **6% of max health per Breath spent**; the 2 most injured allies within 12 m heal 4% per
  Breath. Removes one **poison, bleed or burn** per Breath from each target (never mechanic statuses, page 11).
- **Storm Fist**: self only, 8% per Breath, and refills 40 Tempo. **Still Water**: up to **5** allies within
  **20 m** (your Kept ally always included), 6% per Breath each.
- **Looks like**: you settle into a stance; slow blue rings breathe outward from you (spellfx `heal`, colour
  `#9ad8ff`) and a thin line of light reaches each ally healed.
- **Sound**: one long exhale, a soft singing bowl.

**`monk_mountain_palm` — Mountain Palm** · slot 5 · level 28
- **Cost** 35 Tempo + all Breath (at least 1) · **Cooldown** 8 s · **Cast** instant · **Range** melee 3 m · **Shape** your target.
- **Targeting** Needs target (a single-target finisher, 00 W8) · **Tags** `tag_attack`, `tag_physical`, `tag_melee`.
- **Effect** 180% WD **+90% WD per Breath** (6 Breath = 720%). The target is **Sundered** (reuse: spellfx status
  `sunder`; page 05 owns the number — proposed −20% armour for 8 s). At 5+ Breath, a non-boss target is knocked
  back 6 m.
- **Storm Fist**: at 6 Breath, the blow always crits. **Still Water**: the blow's damage heals your Kept ally
  for 45% of it, and the 2 most injured other allies within 20 m for 20% each (Wellspring does not also apply
  to this hit).
- **Looks like**: a slow, heavy palm; a mountain-shaped shockwave of grey stone dust bursts behind the target
  (spellfx `impact`, physical, scale 1.6, ground crack decal).
- **Sound**: a deep drum and a rockfall.

**`monk_seven_stars` — Seven Stars Kata** · slot 6 · level 40
- **Cost** 60 Tempo + 3 Breath · **Cooldown** 90 s · **Cast** instant · **Range** enemies within 12 m · **Shape** up to 7 strikes.
- **Targeting** Self (it picks the enemies within 12 m itself, your target first) · **Tags** `tag_attack`, `tag_physical`, `tag_melee`, `tag_area`, `tag_movement`.
- **Effect** you flash between up to **7 enemies** within 12 m (if fewer, the same enemy can be struck up to 3
  times), **220% WD** each, then return to where you started. For the **1.4 s** of the kata you are
  **Between Steps** (new status): untargetable, and you take no damage.
- **Storm Fist**: 9 strikes instead of 7. **Still Water**: each strike heals every group member for 3% of max
  health (21% over the kata).
- **Limits (boss rules)**: Between Steps avoids targeted attacks and Danger/Void zones while it lasts, but you
  **do not count** as present in a **Soak**, and **room-wide** hits flagged `unavoidable` (page 11) still hit
  you. Refused while **Rooted or Tethered**. It cannot move you across an arena barrier.
- **Looks like**: seven gold star-points flash over the targets (spellfx `holy` flash), you vanish in a white
  streak between them (spellfx `arc` lines connecting each strike), and the stars fade in the order struck.
- **Sound**: seven bright bell strikes, one per hit, rising to a chord.

### 3.3 Rotation — how it plays

**Solo.** Flow only breaks on the *same spell twice in a row*, so weave: Rising Palm → Hundred Petals →
Rising Palm → River Step → Rising Palm → Mountain Palm builds 5 Flow (Rising Palm repeats, but never back to
back). Rising Palm → Rising Palm resets it. Keep a Breath in reserve for **Lotus Rest** when you drop low.

**Dungeon as Storm Fist.** Build to 6 Breath with Rising Palm and Hundred Petals, spend on Mountain Palm. River
Step with Breath is your pack damage. Seven Stars on packs of 5+ or to dodge a boss's big targeted hit.

**Dungeon as Still Water (healer).** See §5.3.

### 3.4 What the monk gives a group (5)

| Gives | Group of 5 | Stacks with |
|---|---|---|
| River Step's Current | +30% move speed trail every 12 s | other move buffs: strongest wins |
| Mountain Palm's Sundered | −20% armour on one target | Sundered from other sources: one only |
| Still Water healing (Healer) | Wellspring (50% of damage) + ~6% × 5 per Lotus Rest + 21% group heal per 90 s | other healers normally |
| Cleanses | poison/bleed/burn, up to 6 per Lotus Rest | — |

### 3.5 Boss mechanics

| Mechanic | What the monk does |
|---|---|
| **Danger zone** | River Step counts as a dodge for 0.3 s; Seven Stars is 1.4 s of untargetability. |
| **Void zone** | River Step out; it does not protect you once you land inside another one. |
| **Soak** | Be present: Seven Stars makes you **absent** from a soak, so never kata during one. |
| **Targeted** | Seven Stars dodges one targeted hit if timed in its last 1.4 s. |
| **Interrupts** | The monk has **no interrupt** unless it takes Seven Stars t3c. Rising Palm's Stagger is non-boss only. |
| **Immunities** | Knockback on Mountain Palm is non-boss. Bosses take the damage and Sundered only. |
| **Dispels** | Lotus Rest removes poison/bleed/burn (damage-over-time), never a mechanic debuff. |

---

## 4. Alternate spells

None. The **Ways** (§2.3) change what each spell does instead of swapping the bar.

---

## 5. The hybrid role — Healer (the Still Water)

The Still Water monk is a **melee healer**: it stays in melee range, keeps hitting, and its hits heal. It is
tuned for the open world, Normal dungeons and Depth up to about 10. In Challenge mode it is weaker than a
primary healer when the group has to spread past 20 m, because Wellspring and most of its heals only reach
20 m, and it has no single big "save one ally now" heal beyond Mountain Palm.

### 5.1 What Healer focus turns on

Setting the canon **Role focus** switch (00 §6) to **Hybrid (Healer)** — from level 20 the same as taking the Still Water
Way (§2.3; the two are tied) — makes the Dungeon Finder queue you as Healer, gives the shared **Mender** passive (+10% healing done;
the mana part does nothing for a Tempo class) and:

| Level | What you have |
|---|---|
| 6–19 | **Novice's Wellspring**: 30% of the damage your spells deal heals the most injured ally within 15 m; your damage −10%. No spell riders |
| 20+ | the full **Way of the Still Water** (§2.3) and every spell's Still Water line, plus **Kept** (§5.2) |

### 5.2 Kept — healing one ally while you fight another

Tab targeting gives you one hard target, and a melee healer's target is an enemy. So the Still Water monk
chooses a **Kept** ally without changing that target:

- **`monk_keep`** — hold **`G`** (the second class key) and press **`F1`–`F5`** (or click a party frame) to make
  that ally **Kept**. No cost, no GCD, 1 s cooldown. **Targeting** Ally · **Tags** `tag_spell`.
- Wellspring and every Still Water heal go to the Kept ally **first** while they are below 90% health;
  otherwise they fall back to the most injured ally in range.
- A thin blue thread runs from you to the Kept ally (never white — white is a boss tether, page 11).
- Usually the Kept ally is the tank.

### 5.3 How a Still Water monk heals a dungeon

Keep the tank. Stay in melee and keep casting different spells (Flow is +20% healing at 5). **Hundred Petals**
is your main group heal (240% WD over the channel), **Lotus Rest** at 5–6 Breath is your big group heal,
**Mountain Palm** is your tank heal (45% of a 720% WD blow at 6 Breath), River Step's Current is a moving heal
when the group has to run, and **Seven Stars** is your group emergency heal (21% to everyone) with 1.4 s of
safety for you.

### 5.4 Numbers against the budget

At level 40 with 5 Flow, a Still Water monk's healing per second is about **85% of a primary healer's** on a
fight where the group stays within 20 m (page 06 §Healing budget), and about **55%** when half the group is
past 20 m. Talents that lean Healer: Hundred Petals t4a **Garden**, Lotus Rest t2a **Shared Rest** and t4b
**Tide Rest**, Seven Stars t3b **Star Shield**. Set: **Robes of the Still Water**. Soul: `soul_still_pond`.

---

## 6. Utility spells

None. The monk travels by scrolls, the Recall Stone and Travel Methods like everyone else
([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Rising Palm** (`monk_rising_palm`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Crane Kick** — becomes a jumping kick that reaches 5 m in a line | **Twin Palms** — two strikes at 80%, +1 Breath each | **Open Palm** — the arc becomes a 3 m circle around you, 100% WD (adds `tag_area`) |
| 2 (22) | **Launch** — Stagger becomes a 1 s knock-up (non-boss); the next hit on it +30% | **Rooted Palm** — the target is Rooted for 1.5 s instead of Staggered | — |
| 3 (32) | **Echo Palm** — the strike repeats 1 s later on the same target for 50% | **Deflecting Palm** — for 1 s after casting, the next projectile aimed at you is knocked away | — |
| 4 (45) | **First Form** — casting it after any other spell never breaks Flow even if it repeats | **Palm of Plenty** — +2 Breath on a Staggered target | — |

**Hundred Petals** (`monk_hundred_petals`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Whirling Petals** — hits all around you (3.2 m circle) instead of an arc | **Petal Storm** — 12 strikes over 2.4 s at 30% | — |
| 2 (22) | **Thorned Petals** — each strike applies a Bleed stack (page 05) | **Drifting Petals** — you move at full speed while channelling | **Petal Shield** — each strike gives you a 1% max health barrier (up to 12%) (adds `tag_shield`) |
| 3 (32) | **Last Petal** — the final strike is a 150% WD burst in a 5 m circle | **Scattered Petals** — becomes a 10 m cone of thrown petals at range (still 8 strikes; adds `tag_ranged`) | — |
| 4 (45) | **Garden** — leaves a 6 m petal field for 6 s: allies inside regain 2% max health a second | **Hundred Hands** — every strike that crits gives +1 Breath (max 3 per cast) | — |

**River Step** (`monk_river_step`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Two Rivers** — 2 charges | **Upstream** — dash backward (away from where you face) instead, 12 m | — |
| 2 (22) | **Ford** — may be cast on an **ally** (your friendly target or `F2`–`F5`): dash to them; both of you gain +20% move for 4 s | **Undertow** — enemies on the path are pulled 3 m along with you | — |
| 3 (32) | **Flood Current** — the Current is 4 m wide and slows enemies in it 30% | **River Returns** — cast again within 3 s to dash back to where you started (free) | **Whitewater** — each Breath spent adds 2 m of range |
| 4 (45) | **Delta** — the dash splits: 3 short dashes to 3 enemies within 12 m, each at full damage | **Still Pool** — where you land, a 4 m pool for 4 s: you take 20% less damage inside it | — |

**Lotus Rest** (`monk_lotus_rest`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Slow Mending** — becomes a heal over time: the same total over 6 s, and you keep full movement (adds `tag_duration`) | **Long Rest** — the channel may last 4 s; each full second channelled adds +2% per Breath | — |
| 2 (22) | **Shared Rest** — allies healed also get +20 Tempo, +15 Momentum or 5% mana | **Iron Rest** — also 30% less damage taken for 4 s after it lands (self only) | — |
| 3 (32) | **Rest Between Blows** — can be cast without Breath at a flat 10% max health, 30 s cooldown when used that way | **Exhale** — the heal also deals the same amount as damage to enemies within 5 m | **Purifying Rest** — cleanses **any** non-mechanic harmful status, not only damage-over-time |
| 4 (45) | **Second Wind** — if you are below 25% health, the cost is 0 Breath and it counts as full Breath (once per 60 s) | **Tide Rest** — reaches every group member within 40 m | — |

**Mountain Palm** (`monk_mountain_palm`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Avalanche** — hits a 4 m cone instead of one enemy (full damage to the first, 50% to the rest; becomes Auto-target) | **Fault Line** — the shockwave runs 10 m forward in a 2 m line | — |
| 2 (28) | **Stone Hand** — the target is Stunned (non-boss) for 0.5 s per Breath | **Weight of the Mountain** — Sundered stacks twice (−40% armour) | — |
| 3 (32) | **Aftershock** — 2 s later a second shock hits for 50% of the first | **Mountain Guard** — you gain a barrier of 5% max health per Breath spent | — |
| 4 (45) | **Summit** — at 6 Breath the palm also refunds 3 Breath | **Moving Mountain** — becomes a charged move: hold up to 1.5 s to add 60% WD per 0.5 s held | — |

**Seven Stars Kata** (`monk_seven_stars`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Constellation** — each target struck is left with a star that explodes 2 s later for 100% WD in 3 m | **One Star** — strikes one enemy 7 times at 260% | — |
| 2 (40) | **Last Star Stands** — you end the kata at the last enemy struck instead of returning | **Guiding Stars** — allies gain +10% damage for 8 s after it | — |
| 3 (40) | **Eight Stars** — +1 strike, and the range is 18 m | **Star Shield** — you and the group gain a barrier of 8% max health when it ends | **Silent Stars** — each strike interrupts a **non-boss** cast |
| 4 (45) | **Endless Kata** — each enemy killed during the kata cuts its cooldown by 10 s | **Heaven's Form** — during the kata, Perfect Form's internal cooldown resets | — |

---

## 8. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_monk_storm_fist` | **Wraps of the Storm Fist** | `it_storm_fist_headband`, `it_storm_fist_shoulderwraps`, `it_storm_fist_gi`, `it_storm_fist_handwraps`, `it_storm_fist_trousers`, `it_storm_fist_footwraps` | Levels 25–34: bosses of `d07_thornheart`, `d08_moonwell_ruins`, `d09_warmasters_pit` on Normal. Level-60 copies from the same bosses in **Challenge** mode |
| `set_monk_still_water` | **Robes of the Still Water** | `it_still_water_circlet`, `it_still_water_mantle`, `it_still_water_robe`, `it_still_water_gloves`, `it_still_water_sash_leggings`, `it_still_water_sandals` | Levels 36–45: bosses of `d10_rimefang_caverns` and `d11_saltdeep_cathedral` on Normal. Level 60: **Challenge**-mode bosses of `d13_cindergate`–`d16_the_spire` and Depth end chests from Depth 10 up; the robe is also a Tailoring recipe (page 19) |

**Wraps of the Storm Fist**
- **2 pieces** — Rising Palm gives +1 Breath more on its first cast after River Step.
- **4 pieces** — Mountain Palm at full Breath also hits every enemy within 5 m for 50% of its damage.
- **6 pieces** — Seven Stars Kata's cooldown is 60 s and it gives full Breath when it ends.

**Robes of the Still Water**
- **2 pieces** — Wellspring heals **two** allies per hit (split evenly; the Kept ally is always one of them).
- **4 pieces** — Lotus Rest always reaches 5 allies, even in the Storm Fist Way.
- **6 pieces** — at 5 Flow, Hundred Petals' petals heal for double.

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_lotus_of_unbroken_flow` | Lotus of Unbroken Flow | neck | **Unbroken** — Flow max 8; the first repeated spell in any 10 s does not break it | `b_three_petitioners` The Three Petitioners (`d15_fire_court`, was r04) |
| `leg_mountains_own_wraps` | The Mountain's Own Wraps | weapon, wraps | **The Mountain Answers** — Mountain Palm at 6 Breath sends a 6 m shockwave around the target for 150% WD | world boss `b_grief_in_iron` Grief in Iron (`greyridge`, [page 13](../13-WORLD-BOSSES.md)) — rolled at your level |
| `leg_sandals_of_the_eighth_star` | Sandals of the Eighth Star | feet | **Eighth Star** — Seven Stars Kata strikes 9 times; each kill during it gives 1 Breath | `d16_the_spire` end chest (was the r05 Curator), Challenge mode; Depth 15+ end chests |
| `leg_ring_of_the_quiet_tide` | Ring of the Quiet Tide | ring | **Quiet Tide** — Lotus Rest lands at once (no channel), and healing past full health becomes a barrier for 6 s | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss, page 12) |
| `uq_iron_knuckle_wraps` | Iron-Knuckle Wraps | weapon, wraps | **Knuckle Down** — a critical Rising Palm gives +1 Breath | `b_warden_seven` Warden Seven (`d03_shaft_seven` B2) |
| `uq_crane_stance_sash` | Crane-Stance Sash | legs | **One Leg** — River Step has 2 charges | `b_orrun_the_glassblower` Orrun, the Glassblower (`d05_glass_tombs` B1) |
| `uq_bell_of_the_temple` | Bell of the Mountain Temple | neck | **Bell Note** — at full Breath, Tempo refills 50% faster | `b_grumvak_kilnbreaker` Warchief Grumvak Kilnbreaker (`d04_bellows_keep` end boss) |

### 9.2 Souls

Souls sit in a **Soul socket** (page 08 §Sockets); page 09 catalogues them.

| id | Name | Socket in | Requirement | Behaviour | Source |
|---|---|---|---|---|---|
| `soul_returning_breath` | Soul of the Returning Breath | weapon (quarterstaff or wraps) | Monk | **A chance to apply**: each Breath you spend has a **15%** chance to come back 2 s later (the orb drifts back to the gauge) | `b_the_unmined` (page 12), Challenge mode, 4%; Depth 15+ end chests, 0.5% |
| `soul_still_pond` | Soul of the Still Pond | neck or ring | Monk, Still Water Way | **A spell changes**: Lotus Rest leaves a **still pond** (6 m, 6 s) where you stood: allies inside heal 2% of max health a second and cannot be knocked back by non-mechanic effects | `b_sallow_king` The Sallow King (world boss, page 13), 2% |

---

## 10. Voice and barks

**Voice**: reuse `shared/voices.js` `monk` (pitch 0.45, depth 0.55, tone 0.6, breath 0.25, rough 0.05, speed
0.4, jitter 0.06) — calm and breathy, speaks slowly between very fast actions. Monk barks are short.

| When | Lines |
|---|---|
| Full Breath | "Ready." · "Full." |
| 5 Flow | "Like water." · "Now it moves." |
| Mountain Palm (6 Breath) | "Stand still." · "Be the mountain." |
| Lotus Rest | (an exhale, then) "Breathe." · "Let it go." |
| Seven Stars | "Seven." · "Count them." |
| Critical hit | "There." · "Clean." |
| Low health | "Steady … steady." · "My form is breaking!" |
| Healing an ally (Still Water) | "Stay with me." · "Your breath is mine." |
| Kept ally set | "I have you." · "Stay close." |

---

## 11. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `monk` (gi, baggy trousers, wraps, bead necklace). No held item
  in the portrait; the hand wraps need a Chibi 2 part (`wraps` on the hand bones; the weapon type is settled by
  QUESTIONS.md C14, the art part is still to build).
- **Effects** (visuals only): Rising Palm's air ring and Mountain Palm's stone dust borrow `power_strike`'s and
  Farhold's `slam` strike visuals; Hundred Petals borrows the `repeats` machinery from Flamethrower
  (`data/skills.json` `repeats`/`repeatEvery`) for its 8 hits; Seven Stars borrows `arc` lines from the
  lightning effects.
- **Animation**: Chibi 2 has 14 combat clips in `avatar-3d/js/chibi2-motion.js`; the monk needs unarmed jab,
  palm, kick and a kata flash (new clips in their own opt-in list, like `CHIBI2_MELEE_ANIMS`).
- **The earlier monk** in the Emberveil 2 prototype (`palm_strike`, `flurry`, `inner_focus`, `monk_shadow_step`)
  → Rising Palm, Hundred Petals, Lotus Rest, River Step. Ids and names changed; the "shadow step" idea is dropped
  (the rogue family owns shadow).
- Farhold's monk kit (`power_strike`, `charge`, `quicken`, `whirlwind`, `stoneskin`, `execute`) is **dropped**.

---

## 12. Round 2 changes

*(reference — a Claude-facing change log. Old names, including banned ones, are listed here only so they can be found and removed elsewhere; none of them is used in play.)*

- **Chi → Breath** everywhere (W33): the gauge, every cost, gain and talent text. **Focus → Tempo** (costs raised
  for the 25/s refill: Rising Palm 15 → 25, Hundred Petals 30 → 40, River Step 20 → 30, Mountain Palm 25 → 35,
  Seven Stars 40 → 60; Storm Fist crit refund 5 → 8).
- **Renamed** (so "Breath" means only the gauge): `monk_still_breath` Still Breath → `monk_lotus_rest` **Lotus Rest**;
  its talents Held Breath → **Slow Mending**, Deep Breath → **Long Rest**, Shared Breath → **Shared Rest**, Breath of
  Iron → **Iron Rest**, Breath Between Blows → **Rest Between Blows**, Purifying Breath → **Purifying Rest**, Tide
  Breath → **Tide Rest**; Seven Stars t2a Starfall Step → **Last Star Stands** (too close to a banned name).
- **Hybrid role written up** (§5): the Way now follows role focus; **Novice's Wellspring** for Healer focus before
  20; **Kept** (`monk_keep`, `G` + `F1`–`F5`) so a melee healer can keep an enemy target and still heal the tank.
- **New**: souls `soul_returning_breath`, `soul_still_pond`.
- **Removed**: the raid rotation and raid column; Heroic/Mythic+ copies; "re-rolls at 60 on Heroic kills".
- **Re-sourced**: Still Water set r02/r04 → d10/d11 Normal + Challenge d13–d16 + Depth 10+ (+ a Tailoring recipe);
  Lotus of Unbroken Flow r04 → `d15_fire_court`; Sandals r05 → `d16_the_spire` + Depth 15+.
