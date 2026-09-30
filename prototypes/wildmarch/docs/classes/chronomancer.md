# Chronomancer (`chronomancer`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 20.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **SP** = spell power (page 05). For a staff or wand user, 100% SP is about one hit of the equipped weapon at the same item level.
- **Mana** costs are a **percentage of maximum mana**, so they stay meaningful at every level. Mana regenerates slowly (canon §6); page 05 owns the rate.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- Area damage falls off toward the rim as in Farhold (reuse: `js/actors.js` `strikeArea`).
- "Group" = 5-player party. "Raid group" = your 5 on the raid frame (page 15).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who has learned to take a few seconds back. Violet robes, a gold rune halo, an hourglass that never runs out. |
| Role | **Support** · can also **Damage** (canon §6). Both come from the same six spells; talents lean one way or the other. |
| Armour | Cloth |
| Weapons | **Staff** (two-handed) or **wand** + an off-hand focus (reuse: `js/weapons.js`, `js/foci.js`). New off-hand focus base: **hourglass** (`it_hourglass`, canon change request). |
| Primary attribute | INT |
| Resource | **Mana** + the class gauge **Sand** (0–100). |
| Companion | None. The chronomancer's "companion" is its own **Ghost** (§2). |

**Playstyle in three sentences.** The chronomancer slows the enemy and speeds its friends, and it is always
followed by a faint copy of itself running five seconds behind — its **Ghost**. Every spell pours **Sand**
into an hourglass, and the Sand buys time back: jump back to your Ghost, restore an ally to how they were
four seconds ago, or stop a whole pack of enemies dead. It is the class for players who like to fix a mistake
a moment after it happened — within firm limits (§2.4).

---

## 2. Class mechanic — the Timeline

### 2.1 The Ghost

From the level-6 calling quest, the game records the chronomancer's **position, facing, health and mana**
10 times a second and keeps the last **5 seconds**. The oldest point is drawn as the **Ghost**: a
translucent violet copy of your character walking your path 5 s late.

- The Ghost is visible to **you and your group** (others see nothing, to keep raids readable).
- Standing still for 5 s stacks the Ghost onto you and it fades out; moving makes it reappear.
- If the Ghost is standing inside a **Danger zone, Void zone or any red/purple telegraph**, it is outlined
  **red** — a warning that Recall would put you there.
- Setting: `set.gameplay.chrono_ghost_opacity` (0–100%, default 45%) — add to page 04.

### 2.2 Sand (the gauge)

| Rule | Value |
|---|---|
| Range | 0–100 |
| Gain | each spell lists its Sand gain; **+2 a second** while any enemy within 40 m is under one of your slows |
| Out of combat | drains 5 a second after 8 s out of combat |
| Spent by | **Recall** (class key), **Unwind**, **Stilled Moment**, **Cast from the Past** (the alternate bar) |

**Gauge UI** (`hud_class_gauge`, new — add to page 03): a small hourglass beside the health orb. The lower
bulb fills with gold sand as Sand rises; the tick marks at 30/40/60 show what each spender needs. Under it,
a thin **scrub line** shows your health 5 s ago as a violet notch on your health bar, so you can see at a
glance what Recall would give back.

### 2.3 Recall — the class key

**`chronomancer_recall` — Recall** (class mechanic key, proposed `R`; page 02 owns the binding).
- **Cost** 30 Sand · **Cooldown** 30 s · **Cast** instant, usable while casting (cancels the cast).
- You **snap to your Ghost**: its position and facing. Your **health** becomes the Ghost's health *if that is
  higher*, but Recall restores **at most 30% of max health** (20% in Mythic raids). Your **mana** likewise,
  at most 15%. Harmful statuses you gained **in the last 5 s** are removed **unless** they are flagged as a
  boss mechanic (§2.4).
- **Looks like**: you dissolve into violet sand that streams back along your path to the Ghost and reforms
  (spellfx `arcane` projectile along the recorded path, ms 200; `cast` flash at both ends).
- **Sound**: a reversed chime, a sand hiss.

### 2.4 The limits — rewind against one-shot mechanics

These rules are **firm** and apply to Recall, Unwind and anything a talent or item adds:

1. **Dead is dead.** Nothing on this page works on a dead character. No time spell revives. (Revive rules: page 05.)
2. **No invulnerability.** Recall moves you instantly and gives **no** protection. A telegraph resolves on
   positions at the moment it lands; if you Recall out of a Danger zone before it fills, you dodged it (like a
   roll). If your Ghost is inside the same zone, you die there.
3. **Room-wide hits** (page 11) cannot be escaped by Recall — the room includes your Ghost.
4. **Mechanic statuses stay.** Any status a boss applies as part of a mechanic (page 11 flag `mechanic: true` —
   stacking debuffs, doom timers, soak marks, "Targeted" circles, tethers) is **never** removed by a time spell.
5. **Soak counts are locked** 0.5 s before a soak lands (page 11). Recalling out after that does not lower the count.
6. **One restore per window.** A character restored by any chronomancer's Unwind or Recall is **Out of Time**
   (new status) for 30 s and cannot be restored again by Unwind (Recall still moves you, but restores no health).
7. **Health cap.** No time spell restores more than 35% of max health in one use (Recall 30%, Unwind 35%).
8. **Enrage timers never pause**, whatever the spell.

### 2.5 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_chronomancer_calling_1` "A Crack in the Hourglass" | `npc_archivist_hourne`, Brightwater mill-house | Find three "stopped moments" in Hearthvale (frozen scenes) and step through each to see what happened | **The Ghost**, **Sand**, **Recall** |
| 20 | `q_chronomancer_calling_2` "Yesterday's Road" | Archivist Hourne, Highcourt library | Chase your own Ghost through a timed trial in the library stacks, casting from the past to open locks you walked past | **Cast from the Past** (the alternate bar, §4) |
| 40 | `q_chronomancer_calling_3` "The Paradox" | Archivist Hourne, the Riftmarch edge (Waystone Camp) | Duel a future version of yourself that casts your spells 5 s *before* you | **Paradox Echo** (below) |

**Paradox Echo** (calling 3 rule): every **damage or healing** spell you cast is cast again by your Ghost,
**5 s later, from where the Ghost stands**, at **35%** of its effect. It never echoes Recall, Borrowed Minutes,
Unwind or Stilled Moment. Echoes cost nothing and give no Sand.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `chronomancer_second_hand` | Second Hand | 3% mana | — | 1.2 s | 36 m | bolt | 120% SP arcane, Lagging, +8 Sand |
| 2 | 4 | `chronomancer_borrowed_minutes` | Borrowed Minutes | 5% mana | 20 s | instant | 36 m | one ally (not self) | +20% speed, cooldowns 20% faster, 8 s, +15 Sand |
| 3 | 10 | `chronomancer_sandfall` | Sandfall | 8% mana | 18 s | 1.0 s | 30 m | ground circle 7 m | Slow 40%, casts 30% slower, 8 s |
| 4 | 18 | `chronomancer_unwind` | Unwind | 6% mana + 40 Sand | 25 s | instant | 36 m | ally or self | health back to 4 s ago (cap 35%) |
| 5 | 28 | `chronomancer_echoing_hour` | Echoing Hour | 7% mana | 12 s | 1.5 s | 34 m | ground circle 5 m | 220% SP now, 110% SP 3 s later |
| 6 | 40 | `chronomancer_stilled_moment` | Stilled Moment | 10% mana + 60 Sand | 180 s | 1.5 s channel | self | dome 14 m | stops non-boss enemies 4 s |

### 3.2 The spells in full

**`chronomancer_second_hand` — Second Hand** · slot 1 · level 1
- **Cost** 3% mana · **Cooldown** none · **Cast** 1.2 s · **Range** 36 m · **Shape** bolt, 1.2 m splash.
- **Effect** 120% SP as arcane. Applies **Lagging** (new status): −6% move speed and −6% attack/cast speed per
  stack, up to **3 stacks**, 6 s, refreshed by each hit. Bosses take the cast-speed part only, at −3% a stack.
- **+8 Sand** per hit.
- **Looks like**: a spinning gold clock hand inside a violet helix (spellfx `arcane`, shape `helix`, with a
  gold `arcane_shard` trail); Lagging shows as the `slow` aura in violet.
- **Sound**: a single tick-tock, then a glassy chime on hit.

**`chronomancer_borrowed_minutes` — Borrowed Minutes** · slot 2 · level 4
- **Cost** 5% mana · **Cooldown** 20 s · **Cast** instant · **Range** 36 m · **Shape** one ally, **not yourself** (Emberveil's rule, kept).
- **Effect** **Hurried** (new status) for 8 s: +20% attack and cast speed, +20% move speed, and the ally's
  cooldowns recover 20% faster.
- **Stacking**: one Borrowed Minutes per target (a second chronomancer's refreshes it). It is a **haste buff**: with
  the tactician's Double-Time Drill and any other haste, the total is capped at page 05's haste cap (proposed +30%).
- **+15 Sand**.
- **Looks like**: the ally is ringed by three orbiting gold clock numerals (spellfx `orbitOrb`, arcane,
  recoloured gold) and carries the `haste` aura.
- **Sound**: a clock spring winding up fast.

**`chronomancer_sandfall` — Sandfall** · slot 3 · level 10
- **Cost** 8% mana · **Cooldown** 18 s · **Cast** 1.0 s · **Range** 30 m · **Shape** ground circle, 7 m radius, lasts 8 s.
- **Effect** enemies inside are **Slowed 40%** and their **cast bars fill 30% slower**. They take 20% SP arcane
  a second. **Bosses**: move slow 20%, cast slow 15%. Allies inside gain +10% move speed.
- **+2 Sand a second** from the slow rule (§2.2) while anything is inside.
- **Looks like**: a slow fall of gold sand in a column (spellfx `storm`, element `arcane`, recoloured gold)
  over a ground ring marked like a clock face.
- **Sound**: a steady sand hiss, low and soft, that stops dead when it ends.

**`chronomancer_unwind` — Unwind** · slot 4 · level 18
- **Cost** 6% mana + **40 Sand** · **Cooldown** 25 s · **Cast** instant · **Range** 36 m · **Shape** one ally or yourself.
- **Effect** the target's health is set to what it was **4 s ago**, if that was higher — at most **+35% of max
  health**. Harmful statuses gained in those 4 s are removed, except **mechanic** statuses (§2.4 rule 4).
  The target becomes **Out of Time** for 30 s (cannot be Unwound again by anyone).
- **Looks like**: the ally's wounds "run backwards" — red damage numbers float up and back **into** them in
  reverse, then a gold ring closes on them (spellfx `heal`, colour `#d8b040`).
- **Sound**: the ally's last hit sound, played in reverse, then a chime.

**`chronomancer_echoing_hour` — Echoing Hour** · slot 5 · level 28
- **Cost** 7% mana · **Cooldown** 12 s · **Cast** 1.5 s · **Range** 34 m · **Shape** ground circle, 5 m radius.
- **Effect** 220% SP arcane at once. **3 s later**, in the same spot, it strikes again for 110% SP. An enemy
  hit by **both** is **Out of Step** (new status) for 5 s: its next hit taken is +15%, and the second strike
  **interrupts** it if it is a non-boss enemy casting (bosses: no interrupt).
- **+15 Sand**.
- **Looks like**: a clock-face rune slams down (spellfx `impact`, arcane), leaves a faint gold outline on the
  ground for 3 s (a visible countdown), then slams again.
- **Sound**: a bell strike, a 3 s ticking, the same bell again one note lower.

**`chronomancer_stilled_moment` — Stilled Moment** · slot 6 · level 40
- **Cost** 10% mana + **60 Sand** · **Cooldown** 180 s · **Cast** 1.5 s channel (cannot move) · **Range** self · **Shape** dome, 14 m radius, lasts **4 s**.
- **Effect** non-boss enemies inside are **Stopped** (new status): they cannot move, attack or cast; damage
  they take is **stored** and dealt at the end **+25%**. Enemy projectiles entering the dome stop in the air
  and drop when it ends. Allies inside act normally.
- **Bosses** instead become **Chrono-locked** (new status): their current cast bar **pauses for 2 s** (1 s on
  Mythic) and they are Slowed 30% for the rest of the 4 s. A boss that was Chrono-locked **cannot be
  Chrono-locked again for 90 s by anyone**. Casts flagged `unstoppable` (page 11) are never paused. Enrage
  timers never pause.
- **Looks like**: colour drains from everything inside the dome to grey-violet, falling leaves and particles
  freeze in place, a huge faint clock face turns once on the dome's surface (spellfx `vortex`, arcane, ms 4000,
  with a new "desaturate" screen post-effect inside the dome — see [page 17](../17-ART-AUDIO.md)).
- **Sound**: all world sound inside the dome cuts to a low hum; a single heartbeat at the end, then the
  stored damage lands in one crack.

### 3.3 Rotation — how it plays

**Solo.** Second Hand is the filler and your Sand engine. Drop **Sandfall** on a pack and fight at its edge;
use **Echoing Hour** so the second strike lands while they are slowed. Your defence is **Recall**: take a hit,
walk away, and if it went wrong, Recall to 5 s ago. **Unwind yourself** when Recall is on cooldown.

**Dungeon (5).** Cast Borrowed Minutes on the top damage dealer on cooldown (every 20 s). **Sandfall** on the trash pack
the tank is holding — the cast slow is the best trash defence you have. Save 40 Sand for **Unwind** on the
tank after a big hit. On bosses, **Stilled Moment** the adds, or Chrono-lock the boss to buy the group 2 s
before a big cast.

**Raid (10/20).** You bring the biggest single-target buff (**Borrowed Minutes**), one of the two ways to delay a
boss cast (**Chrono-lock**, once per 90 s across the whole raid — agree who uses it), and an emergency heal
that does not care how much healing the target has already had (**Unwind**). Coordinate Chrono-lock in the
raid plan: it is best used on a soak or targeted cast so slow players have 2 s more to get into place.

### 3.4 What the chronomancer gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| Borrowed Minutes | +20% haste/move + cooldowns 20% faster on **one** ally, 8 s every 20 s (40% uptime) | same, one ally | other classes' haste, to the haste cap; never a second Borrowed Minutes |
| Sandfall | 40% slow, 30% cast slow on trash; 15% cast slow on a boss | same | other slows use the strongest (page 05 slow rule) |
| Unwind | an emergency heal up to 35%, every 25 s | same | healers; Out of Time lock is raid-wide |
| Chrono-lock | a 2 s pause of a boss cast, once per 90 s per boss | same (1 s in Mythic) | **not** with another chronomancer's Chrono-lock |
| Stilled Moment | 4 s of total control over trash | same | — |

### 3.5 Boss mechanics

| Mechanic | What the chronomancer does |
|---|---|
| **Danger zone** | Recall out if your Ghost is outside (its outline is not red). |
| **Void zone** | Sandfall does nothing to a void zone; Recall out of one if you drifted in. |
| **Soak** | Chrono-lock the boss 0.5 s before the soak's cast ends so late players can arrive. Recall out after the soak lands, never before. |
| **Targeted** | Recall is a free spread: walk to a clear spot 5 s early and Recall back after. |
| **One-shot casts** | Chrono-lock gives the raid 2 s more to reach a Safe zone. It does **not** make the hit survivable. |
| **Tethers** | Recall is refused while Tethered (rule 4). |
| **Adds** | Stilled Moment on the add pack, then release everything into the stored damage. |
| **Interrupts** | Echoing Hour's second strike interrupts non-boss casts only. Chronomancer has no boss interrupt. |

---

## 4. Alternate spells — Cast from the Past

From the level-20 calling quest. Hold the **Class Alt key** (proposed `Z`, shared with every class that has an
alternate bar; page 02 owns) and press a spell key: the spell is cast **from your Ghost** — from where you
stood 5 s ago, facing the way you faced then. Costs the spell's normal cost **+10 Sand**. The six slots show
the same icons with a violet "past" border while `Z` is held.

| Slot | Past version | What changes |
|---|---|---|
| 1 | `chronomancer_second_hand_past` | Fired from the Ghost; if it hits the target's **back**, +30% |
| 2 | `chronomancer_borrowed_minutes_past` | May target **yourself** (normally forbidden) |
| 3 | `chronomancer_sandfall_past` | Centred on the Ghost instead of the aim point (drops a slow where you were) |
| 4 | `chronomancer_unwind_past` | Restores to **5 s ago** instead of 4; self only |
| 5 | `chronomancer_echoing_hour_past` | The first strike lands where you aimed **5 s ago** (a delayed trap) |
| 6 | `chronomancer_stilled_moment_past` | The dome is centred on the Ghost; you can move during the channel |

The Ghost's line of sight is checked, not yours: casting from behind a pillar you walked past is allowed.

---

## 5. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets that tier when it unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Second Hand** (`chronomancer_second_hand`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Minute and Hour** — fires two hands, one fast (80%) and one slow that lands 1 s later (80%) | **Ticking Round** — the bolt pierces up to 3 enemies | **Hour Hand** — cast time 2.0 s, 200% SP, applies all 3 Lagging stacks at once |
| 2 (22) | **Borrowed Second** — each hit takes 1 s off Borrowed Minutes's cooldown | **Tempo Theft** — at 3 Lagging stacks, the target's lost speed is given to you as haste (up to +9%) | — |
| 3 (32) | **Rewound Bolt** — the bolt returns to you after hitting, striking again on the way back for 50% | **Brittle Moment** — at 3 stacks, the target is Stopped for 1 s (non-boss, once per 10 s per target) | — |
| 4 (45) | **Clockwork Volley** — casting it 3 times in a row makes the 4th instant and fires 3 bolts | **Lost Hours** — Lagging also makes the target's damage-over-time on your allies tick 30% slower | — |

**Borrowed Minutes** (`chronomancer_borrowed_minutes`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Shared Hour** — also affects one more ally within 8 m of the target at half strength | **Surge** — 4 s long, but +40% attack/cast speed | — |
| 2 (22) | **Borrowed Strength** — the target also deals +8% damage | **Borrowed Breath** — the target regains 10% of its resource at the start | **Head Start** — the target's next spell has no cast time |
| 3 (32) | **Rolling Time** — when it ends, it jumps to the ally nearest the target for 4 s | **Undoing** — the target's current cooldown with the most time left is cut by 5 s | — |
| 4 (45) | **Time Debt** — +30% haste (not capped for its duration), but the target is Lagging for 4 s afterwards | **Perfect Tempo** — while the target is Hurried, you gain 3 Sand a second | — |

**Sandfall** (`chronomancer_sandfall`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Sinking Sand** — enemies inside are pulled 1 m a second toward the middle | **Sand Wall** — becomes a 16 m by 2 m line instead of a circle | — |
| 2 (22) | **Timeless Ground** — allies inside do not lose buff time (buffs pause) | **Erosion** — each second inside strips 5% armour, to −25% | **Dust Storm** — enemies inside have a 20% chance to miss with ranged attacks |
| 3 (32) | **Moving Dune** — the circle follows the first enemy it hit | **Grain by Grain** — ticks 40% SP a second instead of 20% | — |
| 4 (45) | **Hourglass Turned** — when it ends, it flips: allies inside are Hurried for 3 s | **Quicksand** — non-boss enemies that stay 4 s are Rooted for 2 s | — |

**Unwind** (`chronomancer_unwind`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Wide Unwind** — affects the target and everyone within 6 m at half strength (cap 17%) | **Deep Unwind** — looks back 6 s instead of 4 (cap unchanged) | — |
| 2 (22) | **Stitch** — also restores the target's resource to what it was 4 s ago | **Hold the Moment** — if the target would drop below 10% health in the next 3 s, Unwind triggers on its own instead (still costs Sand) | — |
| 3 (32) | **Reverse the Blow** — 30% of the health restored is dealt as arcane to the enemy that did most of that damage | **Short Debt** — Out of Time lasts 15 s instead of 30 (only from your Unwind) | **Clean Slate** — also removes one non-mechanic harmful status gained up to 10 s ago |
| 4 (45) | **Return Trip** — the target is also moved back to where it stood 4 s ago | **Timeline Anchor** — the target gets a barrier equal to the health restored, for 4 s | — |

**Echoing Hour** (`chronomancer_echoing_hour`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Three Bells** — strikes three times: 180%, 90%, 90% at 0, 3 and 6 s | **Wandering Echo** — the second strike lands on the enemy nearest the first spot, wherever it went | — |
| 2 (28) | **Echo Chamber** — Out of Step enemies spread it to enemies within 4 m | **Silent Bell** — the second strike also silences non-boss enemies for 2 s | — |
| 3 (32) | **Resounding Bell** — every Echoing Hour you have on the ground at once adds +20% to the others' second strike | **Mercy Bell** — the second strike heals allies in the circle for 100% SP instead of damaging | — |
| 4 (45) | **Last Echo** — the second strike deals 220% (same as the first) | **Time Fracture** — enemies hit by both are Lagging at 3 stacks for 6 s | — |

**Stilled Moment** (`chronomancer_stilled_moment`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Held Breath** — 6 s instead of 4, dome 10 m | **Pocket of Time** — the dome is placed at your aim point (30 m) instead of on you | — |
| 2 (40) | **Stored Fury** — stored damage is released at +50% instead of +25% | **Mercy Stop** — allies inside heal 3% max health a second | — |
| 3 (40) | **Moving Moment** — the dome moves with you | **Unfreeze One** — one enemy (your target) is left out of the stop and takes +25% damage from everything while the rest are frozen | — |
| 4 (45) | **After Image** — when it ends, all enemies inside are Lagging at 3 stacks | **Stolen Seconds** — refunds 30 Sand for every non-boss enemy that dies inside it | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_chronomancer_hourwright` | **Vestments of the Hourwright** | `it_hourwright_hood`, `it_hourwright_mantle`, `it_hourwright_robe`, `it_hourwright_gloves`, `it_hourwright_leggings`, `it_hourwright_slippers` | Levels 42–57: bosses of `d11_saltdeep_cathedral`, `d12_unmade_workshop`, `d13_cindergate` (one piece per boss, class-weighted). Heroic/Mythic+ copies at 60. |
| `set_chronomancer_last_second` | **Robes of the Last Second** | `it_last_second_cowl`, `it_last_second_spaulders`, `it_last_second_robe`, `it_last_second_handwraps`, `it_last_second_trousers`, `it_last_second_sandals` | Level 50–60: `r03_sunken_choir` (Normal and Mythic); robe only from the final boss |

**Vestments of the Hourwright**
- **2 pieces** — Second Hand grants +12 Sand instead of +8.
- **4 pieces** — Recall leaves a **Sandfall** where you left, for 4 s.
- **6 pieces** — Unwind costs 25 Sand and has 2 charges.

**Robes of the Last Second**
- **2 pieces** — Echoing Hour's second strike happens after 2 s instead of 3.
- **4 pieces** — Borrowed Minutes also grants the target +10% damage (does not stack with tier 2a; the bigger wins).
- **6 pieces** — Stilled Moment's cooldown is 120 s, and your Paradox Echo is 50% instead of 35%.

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_ferrymans_hourglass` | The Ferryman's Hourglass | off hand, hourglass focus | **Two Crossings** — Recall has 2 charges (30 s each) and costs 20 Sand | `r03_sunken_choir`, boss 4 (page 13) |
| `leg_the_unwound_spring` | The Unwound Spring | staff | **Twelve Strikes** — during Stilled Moment, Second Hand has no cast time and costs nothing | `r05_veilspire`, boss 8 (page 13) |
| `leg_band_of_the_long_afternoon` | Band of the Long Afternoon | ring | **Long Afternoon** — Borrowed Minutes lasts 12 s and splits: 2 allies at 15% each | world boss of `riftmarch` (page 13) |
| `leg_mantle_of_yesterday` | Mantle of Yesterday | shoulders | **Yesterday's Road** — your Ghost runs **8 s** behind instead of 5 (Recall and Cast from the Past look 8 s back; the 30% health cap is unchanged) | `d14_ashen_reliquary`, final boss (page 12) |
| `uq_sundial_wand` | The Sundial Wand | wand | **Noon Shadow** — Lagging stacks to 5 | `d07_thornheart`, boss 2 |
| `uq_waterclock_slippers` | Waterclock Slippers | feet | **Running Water** — after Recall, +40% move speed for 3 s | `d10_rimefang_caverns`, final boss |
| `uq_pendulum_amulet` | The Pendulum | neck | **Swing Back** — every 30 Sand you spend heals you for 5% of max health | `d05_glass_tombs`, final boss |

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `chronomancer` (pitch 0.48, depth 0.55, tone 0.6, breath 0.2, rough 0.05,
speed 0.45, jitter 0.08) — calm, precise, a little amused. For Recall and the past bar the line is played
through a short reverse-reverb (sfx chain, [page 17](../17-ART-AUDIO.md)).

| When | Lines |
|---|---|
| Borrowed Minutes | "Take a few of mine." · "Faster." · "You have more time than you think." |
| Sandfall | "Slow down." · "Every grain." |
| Unwind | "That didn't happen." · "Let's try that again." · "Back you go." |
| Recall | "Not like that." · "Once more." |
| Stilled Moment | "Hold." · "Everything — stop." · "Now, where were we?" |
| Critical hit | "Right on time." · "To the second." |
| Low health | "I'm running out of time!" · "Too late, too late —" |
| Ghost in a telegraph (warning) | "My past is standing in the fire." |

---

## 9. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `chronomancer` (hood, trim robe, rune halo); Farhold's
  portrait holds an **hourglass** (`classes.json` look `held: hourglass`) — the art exists, the item does not.
- **Effects** (visuals only): Second Hand uses the `arcane` helix; Sandfall uses `storm` recoloured; Stilled
  Moment uses `vortex`; Borrowed Minutes uses `orbitOrb` (the Storm Orbs effect). The **Ghost** is new: a second
  Chibi 2 body with a translucent violet material, driven by the recorded positions. It must share the
  player's skinned mesh (reuse: `avatar-3d/js/chibi2.js` clone path) to stay inside the draw-call budget.
- **Emberveil's chronomancer** (`haste`, `slow_time`, `rewind`, `time_stop`) → Borrowed Minutes, Sandfall,
  Unwind, Stilled Moment. The names are changed so no id is shared with Emberveil or with another class.
- Farhold's chronomancer kit (`arcane_burst`, `quicken`, `ice_lance`, `frost_nova`, `smoke`, `meteor`) is
  **dropped**: every one is another class's borrowed skill.
- **Tech note for [page 16](../16-TECH.md)**: the 5 s recording is 50 samples of position/facing/health/mana
  (about 1 KB per chronomancer); the server must own it, not the client, or Recall becomes a cheat.
