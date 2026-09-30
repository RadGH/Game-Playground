# Monk (`monk`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 21.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one hit of the equipped weapon (a staff, or hand wraps — §1). Monk **heals** are
  also written in % WD: a monk's healing scales with the same weapon it fights with.
- **Focus**: pool **100**, refills **10 a second** (canon §6). **Chi**: the class gauge (§2).
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- A melee shape reaches its printed distance or as far as the weapon swings, whichever is longer (reuse:
  Farhold `js/skills.js` `describeSkill`).
- "Group" = 5-player party. "Raid group" = your 5 on the raid frame (page 15).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A barefoot fighter in an orange gi whose hands are faster than a blade — and who can turn the same strikes into healing. |
| Role | **Damage** · can also **Healer** (canon §6). The choice is the **Way** (§2.3), picked at level 20. |
| Armour | Cloth |
| Weapons | **Quarterstaff** (reuse: `js/weapons.js` `quarterstaff`, jab–sweep–jab–sweep, 3.5 m), or **hand wraps** — a new two-hand "weapon" that is the bare-fist pattern (reuse: `js/weapons.js` unarmed row, `['jab']`) with a real item level and affixes — a real weapon type `wraps` on page 08. **Resolved (00 §10)** — see QUESTIONS.md C14. |
| Primary attribute | DEX |
| Resource | **Focus** + **Chi** (0–6) + **Flow** (0–5). |
| Companion | None. |

**Playstyle in three sentences.** The monk fights up close with fast strikes that build **Chi**, and spends
Chi on techniques that hit far harder or heal. It is rewarded for **variety**: never casting the same spell
twice in a row builds **Flow**, which makes every technique stronger and the monk faster. At 20 it chooses
a **Way** — the Storm Fist for damage or the Still Water for healing — and the same six spells change to suit.

---

## 2. Class mechanic — Chi, Flow and the Ways

### 2.1 Chi

| Rule | Value |
|---|---|
| Orbs | **4** at level 1 · **5** after `q_calling_monk_1` (6) · **6** after `q_calling_monk_2` (20) |
| Gain | spells list their Chi gain; **basic attacks** give +1 Chi on the **last** strike of the weapon's pattern (the 4th staff strike or every 3rd wraps jab) |
| Out of combat | 1 orb fades every 3 s after 6 s out of combat |
| Spent by | River Step (optional), Still Breath, Mountain Palm, Seven Stars Kata |

### 2.2 Flow (from the level-6 calling quest)

- Casting a spell **different** from your previous spell gives **+1 Flow** (max 5).
- Each Flow stack: **+4% damage and healing**, **+3% move speed**.
- Casting the **same spell twice in a row**, or going **4 s** in combat without casting a spell, resets Flow to 0.
- Basic attacks neither build nor break Flow.

**Gauge UI** (`hud_class_gauge`, new — add to page 03): a row of Chi orbs (warm orange pearls) under the
health bar, and above them a **lotus of five petals** that open one by one with Flow. At 5 Flow the lotus
glows white. The previous spell's icon sits faded in the lotus's centre so you know what not to press next.

### 2.3 The Ways (from the level-20 calling quest)

Choose one at the `npc_master_stillwater` shrine, with **`Shift+1`** (Storm Fist) / **`Shift+2`** (Still Water) —
page 02 §5.16 — or from the class gauge's right-click menu (kept as an alternative), **out of
combat**. Changing is free, 10 s to meditate (you sit; any damage cancels). Your group-finder role follows
the Way: Storm Fist = Damage, Still Water = Healer.

| id | Way | Rule | What it changes |
|---|---|---|---|
| `monk_way_storm_fist` | **Way of the Storm Fist** | +10% critical chance; each critical hit refunds 5 Focus | The "Storm Fist" line in each spell below |
| `monk_way_still_water` | **Way of the Still Water** | **Wellspring**: 50% of the damage your spells deal heals the most injured ally within 20 m (a new ally each hit); your healing is +25%, your damage −20% | The "Still Water" line in each spell below |

Before level 20 the monk has neither rider: the spells work as written in their plain line.

### 2.4 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_monk_1` "The Hundred Steps" | `npc_master_stillwater`, the orchard shrine in Hearthvale | Climb the shrine steps while a sparring partner attacks; land 10 techniques without repeating one | **Flow**, Chi max 5 |
| 20 | `q_calling_monk_2` "Two Rivers" | Master Stillwater, the Greyridge monastery | Win a sparring bout using only damage, then carry a wounded pilgrim down the mountain keeping them alive with strikes | **The Ways**, Chi max 6 |
| 40 | `q_calling_monk_3` "The Empty Hand" | Master Stillwater, a peak above Rimehold | Fight your master's spirit with no weapon equipped | **Perfect Form** (below) |

**Perfect Form** (calling 3 rule): when you have **5 Flow and full Chi**, your next technique is
**Transcendent**: it costs no Chi and counts as if you spent full Chi, and its visual turns white-gold.
Internal cooldown 20 s.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `monk_rising_palm` | Rising Palm | 15 Focus | — | instant | melee 3 m | 60° arc | 140% WD, +1 Chi, Staggered |
| 2 | 4 | `monk_hundred_petals` | Hundred Petals | 30 Focus | 10 s | 1.6 s channel | melee 3.2 m | 90° arc | 8 × 35% WD, +2 Chi |
| 3 | 10 | `monk_river_step` | River Step | 20 Focus (+0–3 Chi) | 12 s | instant dash | 12 m | dash, 2 m path | 120% WD +40% per Chi, trail |
| 4 | 18 | `monk_still_breath` | Still Breath | all Chi (min 1) | 20 s | up to 2 s channel | self + allies 12 m | self/allies | 6% max health per Chi, cleanse |
| 5 | 28 | `monk_mountain_palm` | Mountain Palm | 25 Focus + all Chi (min 1) | 8 s | instant | melee 3 m | one enemy | 180% WD + 90% per Chi, Sundered |
| 6 | 40 | `monk_seven_stars` | Seven Stars Kata | 40 Focus + 3 Chi | 90 s | instant | 12 m | up to 7 enemies | 7 × 220% WD, untargetable 1.4 s |

### 3.2 The spells in full

**`monk_rising_palm` — Rising Palm** · slot 1 · level 1
- **Cost** 15 Focus · **Cooldown** none (GCD only) · **Cast** instant · **Range** melee 3 m · **Shape** 60° arc.
- **Effect** 140% WD. **+1 Chi.** Non-boss enemies are **Staggered** (reuse: Farhold's stagger from
  `js/combat-feel.js`, with diminishing returns) for 0.6 s.
- **Storm Fist**: a critical hit gives +2 Chi instead of +1. **Still Water**: Wellspring heals for 70% of the damage instead of 50%.
- **Looks like**: an upward open-palm strike; a white air ring bursts at the target's chest (spellfx `ring`,
  axis vertical, physical colour).
- **Sound**: a sharp cloth snap and a hollow thump.

**`monk_hundred_petals` — Hundred Petals** · slot 2 · level 4
- **Cost** 30 Focus · **Cooldown** 10 s · **Cast** 1.6 s channel, you move at 50% · **Range** melee 3.2 m · **Shape** 90° arc.
- **Effect** 8 strikes, each 35% WD (280% total) to everything in the arc. **+2 Chi** when the channel ends
  (+1 if it was cut short after 4 strikes).
- **Storm Fist**: each critical strike adds a 9th strike. **Still Water**: every strike throws a petal that
  heals the most injured ally within 20 m for 30% WD (240% WD over the channel).
- **Looks like**: a blur of fists; orange-pink petals burst from each hit (spellfx `nature` impact,
  recoloured `#f0a0a0`, leaf sprites).
- **Sound**: eight quick thuds, rising in pitch.

**`monk_river_step` — River Step** · slot 3 · level 10
- **Cost** 20 Focus, and you may spend **0–3 Chi** (it spends up to 3 if you have them; hold the key to spend 0) · **Cooldown** 12 s · **Cast** instant dash · **Range** 12 m · **Shape** dash, hits within 2 m of the path.
- **Effect** 120% WD **+40% per Chi spent** (up to 240%) to everything on the path. The dash counts as a
  **dodge** for its 0.3 s (the same protection as the roll, page 05). Leaves a **Current** on the ground for
  4 s: allies walking it gain +30% move speed.
- **Storm Fist**: each Chi spent also resets 1 s of Hundred Petals' cooldown. **Still Water**: allies who
  cross the Current heal 4% of max health (once each per cast).
- **Looks like**: a streak of blue-white water behind you (spellfx `ice` trail, recoloured to water blue,
  `footfall` along the path).
- **Sound**: a rush of water and one splash on arrival.

**`monk_still_breath` — Still Breath** · slot 4 · level 18
- **Cost** all Chi (at least 1) · **Cooldown** 20 s · **Cast** channel up to 2 s, you move at 50%; the heal lands when the channel ends or is released · **Range** self, and allies within 12 m · **Shape** self + the 2 most injured allies.
- **Effect** you heal **6% of max health per Chi spent**; the 2 most injured allies within 12 m heal 4% per
  Chi. Removes one **poison, bleed or burn** per Chi from each target (never mechanic statuses, page 11).
- **Storm Fist**: self only, 8% per Chi, and refills 40 Focus. **Still Water**: up to **5** allies within
  **20 m**, 6% per Chi each.
- **Looks like**: you settle into a stance; slow blue rings breathe outward from you (spellfx `heal`, colour
  `#9ad8ff`) and a thin line of light reaches each ally healed.
- **Sound**: one long exhale, a soft singing bowl.

**`monk_mountain_palm` — Mountain Palm** · slot 5 · level 28
- **Cost** 25 Focus + all Chi (at least 1) · **Cooldown** 8 s · **Cast** instant · **Range** melee 3 m · **Shape** the first enemy in front of you.
- **Effect** 180% WD **+90% WD per Chi** (6 Chi = 720%). The target is **Sundered** (reuse: spellfx status
  `sunder`; page 05 owns the number — proposed −20% armour for 8 s). At 5+ Chi, a non-boss target is knocked
  back 6 m.
- **Storm Fist**: at 6 Chi, the blow always crits. **Still Water**: the blow's damage heals the 3 most injured
  allies within 20 m for 30% of it each (Wellspring does not also apply to this hit).
- **Looks like**: a slow, heavy palm; a mountain-shaped shockwave of grey stone dust bursts behind the target
  (spellfx `impact`, physical, scale 1.6, ground crack decal).
- **Sound**: a deep drum and a rockfall.

**`monk_seven_stars` — Seven Stars Kata** · slot 6 · level 40
- **Cost** 40 Focus + 3 Chi · **Cooldown** 90 s · **Cast** instant · **Range** enemies within 12 m · **Shape** up to 7 strikes.
- **Effect** you blink between up to **7 enemies** within 12 m (if fewer, the same enemy can be struck up to 3
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
back). Rising Palm → Rising Palm resets it. Keep a Chi in reserve for **Still Breath** when you drop low.

**Dungeon as Storm Fist.** Build to 6 Chi with Rising Palm and Hundred Petals, spend on Mountain Palm. River
Step with Chi is your pack damage. Seven Stars on packs of 5+ or to dodge a boss's big targeted hit.

**Dungeon as Still Water (healer).** You heal by fighting: stay in melee, keep hitting. Hundred Petals is your
main group heal (240% WD split across the most injured), Still Breath at 5–6 Chi is your big heal, Mountain
Palm's heal-on-hit is your tank heal. Seven Stars is your group emergency heal.

**Raid.** Storm Fist is a strong single-target melee damage dealer that can also run between groups with River
Step. Still Water is a **melee healer**: best on melee-heavy fights, weak when the raid is spread at range
(Wellspring only reaches 20 m).

### 3.4 What the monk gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| River Step's Current | +30% move speed trail every 12 s | same, anyone who walks it | other move buffs: strongest wins |
| Mountain Palm's Sundered | −20% armour on one target | same | Sundered from other sources: one only |
| Still Water healing (Healer) | Wellspring (50% of damage) + ~6% × 5 per Still Breath + 21% group heal per 90 s | same, 20 m reach limits it to one area | other healers normally |
| Cleanses | poison/bleed/burn, up to 6 per Still Breath | same | — |

### 3.5 Boss mechanics

| Mechanic | What the monk does |
|---|---|
| **Danger zone** | River Step counts as a dodge for 0.3 s; Seven Stars is 1.4 s of untargetability. |
| **Void zone** | River Step out; it does not protect you once you land inside another one. |
| **Soak** | Be present: Seven Stars makes you **absent** from a soak, so never kata during one. |
| **Targeted** | Seven Stars dodges one targeted hit if timed in its last 1.4 s. |
| **Interrupts** | The monk has **no interrupt**. Rising Palm's Stagger is non-boss only. |
| **Immunities** | Knockback on Mountain Palm is non-boss. Bosses take the damage and Sundered only. |
| **Dispels** | Still Breath removes poison/bleed/burn (damage-over-time), never a mechanic debuff. |

---

## 4. Alternate spells

None. The **Ways** (§2.3) change what each spell does instead of swapping the bar.

---

## 5. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Rising Palm** (`monk_rising_palm`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Crane Kick** — becomes a jumping kick that reaches 5 m in a line | **Twin Palms** — two strikes at 80%, +1 Chi each | **Open Palm** — the arc becomes a 3 m circle around you, 100% WD |
| 2 (22) | **Launch** — Stagger becomes a 1 s knock-up (non-boss); the next hit on it +30% | **Rooted Palm** — the target is Rooted for 1.5 s instead of Staggered | — |
| 3 (32) | **Echo Palm** — the strike repeats 1 s later on the same target for 50% | **Deflecting Palm** — for 1 s after casting, the next projectile aimed at you is knocked away | — |
| 4 (45) | **First Form** — casting it after any other spell never breaks Flow even if it repeats | **Palm of Plenty** — +2 Chi on a Staggered target | — |

**Hundred Petals** (`monk_hundred_petals`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Whirling Petals** — hits all around you (3.2 m circle) instead of an arc | **Petal Storm** — 12 strikes over 2.4 s at 30% | — |
| 2 (22) | **Thorned Petals** — each strike applies a Bleed stack (page 05) | **Drifting Petals** — you move at full speed while channelling | **Petal Shield** — each strike gives you a 1% max health barrier (up to 12%) |
| 3 (32) | **Last Petal** — the final strike is a 150% WD burst in a 5 m circle | **Scattered Petals** — becomes a 10 m cone of thrown petals at range (still 8 strikes) | — |
| 4 (45) | **Garden** — leaves a 6 m petal field for 6 s: allies inside regain 2% max health a second | **Hundred Hands** — every strike that crits gives +1 Chi (max 3 per cast) | — |

**River Step** (`monk_river_step`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Two Rivers** — 2 charges | **Upstream** — dash backward (away from where you face) instead, 12 m | — |
| 2 (22) | **Ford** — may be cast on an **ally**: dash to them; both of you gain +20% move for 4 s | **Undertow** — enemies on the path are pulled 3 m along with you | — |
| 3 (32) | **Flood Current** — the Current is 4 m wide and slows enemies in it 30% | **River Returns** — cast again within 3 s to dash back to where you started (free) | **Whitewater** — each Chi spent adds 2 m of range |
| 4 (45) | **Delta** — the dash splits: 3 short dashes to 3 enemies within 12 m, each at full damage | **Still Pool** — where you land, a 4 m pool for 4 s: you take 20% less damage inside it | — |

**Still Breath** (`monk_still_breath`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Held Breath** — becomes a heal over time: the same total over 6 s, and you keep full movement | **Deep Breath** — the channel may last 4 s; each full second channelled adds +2% per Chi | — |
| 2 (22) | **Shared Breath** — allies healed also get +20 Focus/Fury or 5% mana | **Breath of Iron** — also 30% less damage taken for 4 s after it lands (self only) | — |
| 3 (32) | **Breath Between Blows** — can be cast without Chi at a flat 10% max health, 30 s cooldown when used that way | **Exhale** — the heal also deals the same amount as damage to enemies within 5 m | **Purifying Breath** — cleanses **any** non-mechanic harmful status, not only damage-over-time |
| 4 (45) | **Second Wind** — if you are below 25% health, the cost is 0 Chi and it counts as full Chi (once per 60 s) | **Tide Breath** — reaches every group member within 40 m | — |

**Mountain Palm** (`monk_mountain_palm`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Avalanche** — hits a 4 m cone instead of one enemy (full damage to the first, 50% to the rest) | **Fault Line** — the shockwave runs 10 m forward in a 2 m line | — |
| 2 (28) | **Stone Hand** — the target is Stunned (non-boss) for 0.5 s per Chi | **Weight of the Mountain** — Sundered stacks twice (−40% armour) | — |
| 3 (32) | **Aftershock** — 2 s later a second shock hits for 50% of the first | **Mountain Guard** — you gain a barrier of 5% max health per Chi spent | — |
| 4 (45) | **Summit** — at 6 Chi the palm also refunds 3 Chi | **Moving Mountain** — becomes a charged move: hold up to 1.5 s to add 60% WD per 0.5 s held | — |

**Seven Stars Kata** (`monk_seven_stars`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Constellation** — each target struck is left with a star that explodes 2 s later for 100% WD in 3 m | **One Star** — strikes one enemy 7 times at 260% | — |
| 2 (40) | **Starfall Step** — you end the kata at the last enemy struck instead of returning | **Guiding Stars** — allies gain +10% damage for 8 s after it | — |
| 3 (40) | **Eight Stars** — +1 strike, and the range is 18 m | **Star Shield** — you and the group gain a barrier of 8% max health when it ends | **Silent Stars** — each strike interrupts a **non-boss** cast | 
| 4 (45) | **Endless Kata** — each enemy killed during the kata cuts its cooldown by 10 s | **Heaven's Form** — during the kata, Perfect Form's internal cooldown resets | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_monk_storm_fist` | **Wraps of the Storm Fist** | `it_storm_fist_headband`, `it_storm_fist_shoulderwraps`, `it_storm_fist_gi`, `it_storm_fist_handwraps`, `it_storm_fist_trousers`, `it_storm_fist_footwraps` | Levels 25–34: bosses of `d07_thornheart`, `d08_moonwell_ruins`, `d09_warmasters_pit`. Heroic/Mythic+ copies at 60. |
| `set_monk_still_water` | **Robes of the Still Water** | `it_still_water_circlet`, `it_still_water_mantle`, `it_still_water_robe`, `it_still_water_gloves`, `it_still_water_sash_leggings`, `it_still_water_sandals` | Level 42: `r02_glacier_throne` (all bosses); level 60 copies from `r04_ember_court` |

**Wraps of the Storm Fist**
- **2 pieces** — Rising Palm gives +1 Chi more on its first cast after River Step.
- **4 pieces** — Mountain Palm at full Chi also hits every enemy within 5 m for 50% of its damage.
- **6 pieces** — Seven Stars Kata's cooldown is 60 s and it gives full Chi when it ends.

**Robes of the Still Water**
- **2 pieces** — Wellspring heals **two** allies per hit (split evenly).
- **4 pieces** — Still Breath always reaches 5 allies, even in the Storm Fist Way.
- **6 pieces** — at 5 Flow, Hundred Petals' petals heal for double.

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_lotus_of_unbroken_flow` | Lotus of Unbroken Flow | neck | **Unbroken** — Flow max 8; the first repeated spell in any 10 s does not break it | `b_three_petitioners` The Three Petitioners (`r04_ember_court` boss 3, page 13) |
| `leg_mountains_own_wraps` | The Mountain's Own Wraps | weapon, wraps | **The Mountain Answers** — Mountain Palm at 6 Chi sends a 6 m shockwave around the target for 150% WD | world boss `b_grief_in_iron` Grief-in-Iron (`greyridge`, page 13) — rolled at item level for your level; re-rolls at 60 on Heroic kills |
| `leg_sandals_of_the_eighth_star` | Sandals of the Eighth Star | feet | **Eighth Star** — Seven Stars Kata strikes 9 times; each kill during it gives 1 Chi | `b_curator` The Curator (`r05_veilspire` boss 6, page 13) |
| `leg_ring_of_the_quiet_tide` | Ring of the Quiet Tide | ring | **Quiet Tide** — Still Breath lands at once (no channel), and healing past full health becomes a barrier for 6 s | `b_castellan_vorhane` Lord Castellan Vorhane (`d13_cindergate` end boss, page 12) |
| `uq_iron_knuckle_wraps` | Iron-Knuckle Wraps | weapon, wraps | **Knuckle Down** — a critical Rising Palm gives +1 Chi | `b_warden_seven` Warden Seven (`d03_deepdelve` B2) |
| `uq_crane_stance_sash` | Crane-Stance Sash | legs | **One Leg** — River Step has 2 charges | `b_orrun_the_glassblower` Orrun, the Glassblower (`d05_glass_tombs` B1) |
| `uq_bell_of_the_temple` | Bell of the Mountain Temple | neck | **Bell Note** — at full Chi, Focus refills 50% faster | `b_grumvak_kilnbreaker` Warchief Grumvak Kilnbreaker (`d04_bellows_keep` end boss) |

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `monk` (pitch 0.45, depth 0.55, tone 0.6, breath 0.25, rough 0.05, speed
0.4, jitter 0.06) — calm and breathy, speaks slowly between very fast actions. Monk barks are short.

| When | Lines |
|---|---|
| Full Chi | "Ready." · "Full." |
| 5 Flow | "Like water." · "Now it moves." |
| Mountain Palm (6 Chi) | "Stand still." · "Be the mountain." |
| Still Breath | (an exhale, then) "Breathe." · "Let it go." |
| Seven Stars | "Seven." · "Count them." |
| Critical hit | "There." · "Clean." |
| Low health | "Steady … steady." · "My form is breaking!" |
| Healing an ally (Still Water) | "Stay with me." · "Your breath is mine." |

---

## 9. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `monk` (gi, baggy trousers, wraps, bead necklace). No held item
  in the portrait; the hand wraps need a Chibi 2 part (`wraps` on the hand bones; the weapon type is settled by QUESTIONS.md C14, the art part is still to build).
- **Effects** (visuals only): Rising Palm's air ring and Mountain Palm's stone dust borrow `power_strike`'s and
  Farhold's `slam` strike visuals; Hundred Petals borrows the `repeats` machinery from Flamethrower
  (`data/skills.json` `repeats`/`repeatEvery`) for its 8 hits; Seven Stars borrows `arc` lines from the
  lightning effects.
- **Animation**: Chibi 2 has 14 combat clips in `avatar-3d/js/chibi2-motion.js`; the monk needs unarmed jab,
  palm, kick and a kata blink (new clips in their own opt-in list, like `CHIBI2_MELEE_ANIMS`).
- **Emberveil's monk** (`palm_strike`, `flurry`, `inner_focus`, `monk_shadow_step`) → Rising Palm, Hundred
  Petals, Still Breath, River Step. Ids and names changed; the "shadow step" idea is dropped (the rogue family owns shadow).
- Farhold's monk kit (`power_strike`, `charge`, `quicken`, `whirlwind`, `stoneskin`, `execute`) is **dropped**.
