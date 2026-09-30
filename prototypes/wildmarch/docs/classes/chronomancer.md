# Chronomancer (`chronomancer`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 20.
> Status: v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **SP** = spell power (page 05). For a staff or wand user, 100% SP is about one hit of the equipped weapon at the same item level.
- **Mana** (page 06 §Resources owns the numbers): a pool of **1,000** + 2 per INT + gear. It refills **1% of max a
  second** in combat and **4%** out of combat. Costs on this page are flat numbers: filler 40–80, big spell
  150–250, heal 60–200.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- Area damage and healing fall off toward the rim as in Farhold (reuse: `js/actors.js` `strikeArea`).
- "Group" = the party of 5.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A scholar who has learned to take a few seconds back. Violet robes, a gold rune halo, an hourglass that never runs out. |
| Primary role | **Support** — haste on allies, slows and stops on enemies, pauses on boss casts. |
| Hybrid role | **Healer** — turns the hourglass over (§4.1) and heals by **rewinding** allies' health to what it was a few seconds ago (§5). Queues as Healer in the Dungeon Finder. |
| Build | Caster |
| Armour | Cloth |
| Weapons | **Staff** (two-handed) or **wand** + an off-hand focus (reuse: `js/weapons.js`, `js/foci.js`). New off-hand focus base: **hourglass** (`it_hourglass`, canon change request). |
| Primary attribute | INT |
| Resource | **Mana** + the class gauge **Sand** (0–100). |
| Companion | None. The chronomancer's "companion" is its own **Ghost** (§2). |

**Playstyle in three sentences.** The chronomancer slows the enemy and speeds its friends, and it is always
followed by a faint copy of itself running five seconds behind — its **Ghost**. Every spell pours **Sand**
into an hourglass, and the Sand buys time back: jump back to your Ghost, set an ally's health back to what it
was four seconds ago, or stop a whole pack of enemies dead. Turn the hourglass over and three of the six spells
become heals that give allies back the health they just lost, which makes the chronomancer a healer that is
strongest right after a big hit and weakest against slow, steady damage.

---

## 2. Class mechanic — the Timeline

### 2.1 The Ghost

From the level-6 calling quest, the game records the chronomancer's **position, facing, health and mana**
10 times a second and keeps the last **5 seconds**. The oldest point is drawn as the **Ghost**: a
translucent violet copy of your character walking your path 5 s late.

- The Ghost is visible to **you and your group** (other players see nothing, so crowded towns and world bosses stay readable).
- Standing still for 5 s stacks the Ghost onto you and it fades out; moving makes it reappear.
- If the Ghost is standing inside a **Danger zone, Void zone or any red/purple telegraph**, it is outlined
  **red** — a warning that Recall would put you there.
- The Ghost is not a body: it never counts toward a **Soak**, cannot be hit and holds no threat.
- Setting: `set.gameplay.chrono_ghost_opacity` (0–100%, default 45%) — add to page 04.

### 2.2 Sand (the gauge)

| Rule | Value |
|---|---|
| Range | 0–100 |
| Gain | each spell lists its Sand gain; **+2 a second** while any enemy within 40 m is under one of your slows |
| Out of combat | drains 5 a second after 8 s out of combat |
| Spent by | **Recall** (class key), **Unwind**, **Stilled Moment**, **Cast from the Past** (§4.2) |

**Gauge UI** (`hud_class_gauge`, new — add to page 03): a small hourglass beside the health orb. The lower
bulb fills with gold sand as Sand rises; tick marks at 30/40/60 show what each spender needs. While the
hourglass is turned **Backward** (§4.1) the glass is drawn upside down and the sand is pale blue.

### 2.3 The Ledger — every ally's recent health (new)

The Timeline does not only record the chronomancer. From level 6, the server keeps the **last 8 seconds of
health** for every member of the chronomancer's group (10 samples a second; followers included, class
companions of other players included).

- **Rewindable health** = how much higher a character's health was **4 s ago** than it is now (0 if it is
  higher now). It is the number every "rewind" effect on this page reads.
- **On the party frames** (page 03, `hud_party_frames`) the chronomancer — and only the chronomancer — sees
  each member's Rewindable health as a **violet segment** after the end of their health bar, like a shadow of
  the health they just lost. It shrinks as the 4 s window slides past the hit.
- **On your own health bar** the same violet segment shows what Recall would give back.
- Rewinds never raise health above the value it had 4 s ago, and never revive (§2.5 rule 1).

### 2.4 Recall — the class key

**`chronomancer_recall` — Recall** (the class key, **`Q`**; page 02 owns the binding).
- **Cost** 30 Sand · **Cooldown** 30 s · **Cast** instant, usable while casting (cancels the cast) ·
  **Targeting** Self · **Tags** `tag_spell`, `tag_arcane`, `tag_movement`.
- You **snap to your Ghost**: its position and facing. Your **health** becomes the Ghost's health *if that is
  higher*, but Recall restores **at most 30% of max health**. Your **mana** likewise, at most 15% (150 on a
  1,000 pool). Harmful statuses you gained **in the last 5 s** are removed **unless** they are flagged as a
  boss mechanic (§2.5).
- **Looks like**: you dissolve into violet sand that streams back along your path to the Ghost and reforms
  (spellfx `arcane` projectile along the recorded path, ms 200; `cast` flash at both ends).
- **Sound**: a reversed chime, a sand hiss.

### 2.5 The limits — rewind against one-shot mechanics

These rules are **firm** and apply to Recall, Unwind, every Backward spell and anything a talent, soul or item adds:

1. **Dead is dead.** Nothing on this page works on a dead character. No time spell revives. (Revive rules: page 05.)
2. **No invulnerability.** Recall moves you instantly and gives **no** protection. A telegraph resolves on
   positions at the moment it lands; if you Recall out of a Danger zone before it fills, you dodged it (like a
   roll). If your Ghost is inside the same zone, you die there.
3. **Room-wide hits** (page 11) cannot be escaped by Recall — the room includes your Ghost.
4. **Mechanic statuses stay.** Any status a boss applies as part of a mechanic (page 11 flag `mechanic: true` —
   stacking debuffs, doom timers, soak marks, "Targeted" circles, tethers) is **never** removed by a time spell.
5. **Soak counts are locked** 0.5 s before a soak lands (page 11). Recalling out after that does not lower the count.
6. **One big restore per window.** A character restored by any chronomancer's **Unwind** or Recall is **Out of
   Time** (new status) for 30 s and cannot be restored again by Unwind (Recall still moves you, but restores no
   health). Out of Time does **not** block the Backward heals (§4.1) — they are smaller and read the Ledger.
7. **Health cap.** No single time spell restores more than 35% of max health in one use (Recall 30%, Unwind 35%,
   Hand Back and Hour of Return are capped by Rewindable health and their own SP numbers).
8. **Enrage timers never pause**, whatever the spell.

### 2.6 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_chronomancer_1` "A Crack in the Hourglass" | `npc_archivist_hourne`, Brightwater mill-house | Find three "stopped moments" in Hearthvale (frozen scenes) and step through each to see what happened; in the last one, rewind a wounded miller before the scene ends | **The Ghost**, **Sand**, **Recall**, **the Ledger** and **Turn the Glass** (the Backward heals, §4.1) |
| 20 | `q_calling_chronomancer_2` "Yesterday's Road" | Archivist Hourne, Highcourt library | Chase your own Ghost through a timed trial in the library stacks, casting from the past to open locks you walked past | **Cast from the Past** (§4.2) |
| 40 | `q_calling_chronomancer_3` "The Paradox" | Archivist Hourne, the Riftmarch edge (Waystone Camp) | Duel a future version of yourself that casts your spells 5 s *before* you | **Paradox Echo** (below) |

**Paradox Echo** (calling 3 rule): every **damage or healing** spell you cast is cast again by your Ghost,
**5 s later, from where the Ghost stands**, at **35%** of its effect. It never echoes Recall, Borrowed Minutes,
Unwind or Stilled Moment. Echoes cost nothing and give no Sand. An echoed Hand Back reads the target's
Rewindable health at the moment the echo lands.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `chronomancer_second_hand` | Second Hand | 50 mana | — | 1.2 s | Auto-target | 36 m | bolt | `tag_spell` `tag_arcane` `tag_ranged` `tag_projectile` `tag_duration` | 120% SP arcane, Lagging, +8 Sand |
| 2 | 4 | `chronomancer_borrowed_minutes` | Borrowed Minutes | 60 mana | 20 s | instant | Needs target (an ally, not you) | 36 m | one ally | `tag_spell` `tag_arcane` `tag_duration` | +20% speed, cooldowns 20% faster, 8 s, +15 Sand |
| 3 | 10 | `chronomancer_sandfall` | Sandfall | 110 mana | 18 s | 1.0 s | Ground | 30 m | ground circle 7 m | `tag_spell` `tag_arcane` `tag_area` `tag_duration` | Slow 40%, casts 30% slower, 8 s |
| 4 | 18 | `chronomancer_unwind` | Unwind | 90 mana + 40 Sand | 25 s | instant | Needs target (friendly; `F1` self) | 36 m | one ally or self | `tag_spell` `tag_arcane` `tag_heal` | health back to 4 s ago (cap 35%) |
| 5 | 28 | `chronomancer_echoing_hour` | Echoing Hour | 160 mana | 12 s | 1.5 s | Ground | 34 m | ground circle 5 m | `tag_spell` `tag_arcane` `tag_area` | 220% SP now, 110% SP 3 s later |
| 6 | 40 | `chronomancer_stilled_moment` | Stilled Moment | 200 mana + 60 Sand | 180 s | 1.5 s channel | Self | self | dome 14 m | `tag_spell` `tag_arcane` `tag_area` `tag_channel` `tag_duration` | stops non-boss enemies 4 s |

Slots 1, 3 and 5 have a **Backward** version (§4.1) used by the Healer hybrid.

### 3.2 The spells in full

**`chronomancer_second_hand` — Second Hand** · slot 1 · level 1
- **Cost** 50 mana · **Cooldown** none · **Cast** 1.2 s · **Range** 36 m · **Shape** bolt, 1.2 m splash.
- **Targeting** Auto-target · **Tags** `tag_spell`, `tag_arcane`, `tag_ranged`, `tag_projectile`, `tag_duration`.
- **Effect** 120% SP as arcane. Applies **Lagging** (new status): −6% move speed and −6% attack/cast speed per
  stack, up to **3 stacks**, 6 s, refreshed by each hit. Bosses take the cast-speed part only, at −3% a stack.
- **+8 Sand** per hit.
- **Looks like**: a spinning gold clock hand inside a violet helix (spellfx `arcane`, shape `helix`, with a
  gold `arcane_shard` trail); Lagging shows as the `slow` aura in violet.
- **Sound**: a single tick-tock, then a glassy chime on hit.

**`chronomancer_borrowed_minutes` — Borrowed Minutes** · slot 2 · level 4
- **Cost** 60 mana · **Cooldown** 20 s · **Cast** instant · **Range** 36 m · **Shape** one ally, **not yourself** (Emberveil's rule, kept).
- **Targeting** Needs target — a friendly target other than you (`F2`–`F5` or click a party frame); with no valid target it does not cast.
- **Tags** `tag_spell`, `tag_arcane`, `tag_duration`.
- **Effect** **Hurried** (new status) for 8 s: +20% attack and cast speed, +20% move speed, and the ally's
  cooldowns recover 20% faster.
- **Stacking**: one Borrowed Minutes per target (a second chronomancer's refreshes it). It is a **haste buff**: with
  the tactician's Double-Time Drill and any other haste, the total is capped at page 05's haste cap (proposed +30%).
- **+15 Sand**.
- **Looks like**: the ally is ringed by three orbiting gold clock numerals (spellfx `orbitOrb`, arcane,
  recoloured gold) and carries the `haste` aura.
- **Sound**: a clock spring winding up fast.

**`chronomancer_sandfall` — Sandfall** · slot 3 · level 10
- **Cost** 110 mana · **Cooldown** 18 s · **Cast** 1.0 s · **Range** 30 m · **Shape** ground circle, 7 m radius, lasts 8 s.
- **Targeting** Ground · **Tags** `tag_spell`, `tag_arcane`, `tag_area`, `tag_duration`.
- **Effect** enemies inside are **Slowed 40%** and their **cast bars fill 30% slower**. They take 20% SP arcane
  a second. **Bosses**: move slow 20%, cast slow 15%. Allies inside gain +10% move speed.
- **+2 Sand a second** from the slow rule (§2.2) while anything is inside.
- **Looks like**: a slow fall of gold sand in a column (spellfx `storm`, element `arcane`, recoloured gold)
  over a ground ring marked like a clock face.
- **Sound**: a steady sand hiss, low and soft, that stops dead when it ends.

**`chronomancer_unwind` — Unwind** · slot 4 · level 18
- **Cost** 90 mana + **40 Sand** · **Cooldown** 25 s · **Cast** instant · **Range** 36 m · **Shape** one ally or yourself.
- **Targeting** Needs target — a friendly target; `F1` for yourself · **Tags** `tag_spell`, `tag_arcane`, `tag_heal`.
- **Effect** the target's health is set to what it was **4 s ago**, if that was higher — at most **+35% of max
  health**. Harmful statuses gained in those 4 s are removed, except **mechanic** statuses (§2.5 rule 4).
  The target becomes **Out of Time** for 30 s (cannot be Unwound again by anyone).
- The same in both hourglass directions; it is the chronomancer's emergency heal in either role.
- **Looks like**: the ally's wounds "run backwards" — red damage numbers float up and back **into** them in
  reverse, then a gold ring closes on them (spellfx `heal`, colour `#d8b040`).
- **Sound**: the ally's last hit sound, played in reverse, then a chime.

**`chronomancer_echoing_hour` — Echoing Hour** · slot 5 · level 28
- **Cost** 160 mana · **Cooldown** 12 s · **Cast** 1.5 s · **Range** 34 m · **Shape** ground circle, 5 m radius.
- **Targeting** Ground · **Tags** `tag_spell`, `tag_arcane`, `tag_area`.
- **Effect** 220% SP arcane at once. **3 s later**, in the same spot, it strikes again for 110% SP. An enemy
  hit by **both** is **Out of Step** (new status) for 5 s: its next hit taken is +15%, and the second strike
  **interrupts** it if it is a non-boss enemy casting (bosses: no interrupt).
- **+15 Sand**.
- **Looks like**: a clock-face rune slams down (spellfx `impact`, arcane), leaves a faint gold outline on the
  ground for 3 s (a visible countdown), then slams again.
- **Sound**: a bell strike, a 3 s ticking, the same bell again one note lower.

**`chronomancer_stilled_moment` — Stilled Moment** · slot 6 · level 40
- **Cost** 200 mana + **60 Sand** · **Cooldown** 180 s · **Cast** 1.5 s channel (cannot move) · **Range** self · **Shape** dome, 14 m radius, lasts **4 s**.
- **Targeting** Self · **Tags** `tag_spell`, `tag_arcane`, `tag_area`, `tag_channel`, `tag_duration`.
- **Effect** non-boss enemies inside are **Stopped** (new status): they cannot move, attack or cast; damage
  they take is **stored** and dealt at the end **+25%**. Enemy projectiles entering the dome stop in the air
  and drop when it ends. Allies inside act normally.
- **Bosses** instead become **Chrono-locked** (new status): their current cast bar **pauses for 2 s** (1 s in
  Challenge mode) and they are Slowed 30% for the rest of the 4 s. A boss that was Chrono-locked **cannot be
  Chrono-locked again for 90 s by anyone** (this is page 11's shared 90 s boss-cast-pause lockout). Casts
  flagged `unstoppable` (page 11) are never paused. Enrage timers never pause.
- **Looks like**: colour drains from everything inside the dome to grey-violet, falling leaves and particles
  freeze in place, a huge faint clock face turns once on the dome's surface (spellfx `vortex`, arcane, ms 4000,
  with a new "desaturate" screen post-effect inside the dome — see [page 17](../17-ART-AUDIO.md)).
- **Sound**: all world sound inside the dome cuts to a low hum; a single heartbeat at the end, then the
  stored damage lands in one crack.

### 3.3 Rotation — how it plays (Support)

**Solo.** Second Hand is the filler and your Sand engine. Drop **Sandfall** on a pack and fight at its edge;
use **Echoing Hour** so the second strike lands while they are slowed. Your defence is **Recall**: take a hit,
walk away, and if it went wrong, Recall to 5 s ago. **Unwind yourself** (`F1`) when Recall is on cooldown.

**Dungeon (5).** Cast Borrowed Minutes on the top damage dealer on cooldown (every 20 s). **Sandfall** on the
trash pack the tank is holding — the cast slow is the best trash defence you have. Save 40 Sand for **Unwind**
on the tank after a big hit. On bosses, **Stilled Moment** the adds, or Chrono-lock the boss to buy the group
2 s before a big cast.

### 3.4 What the chronomancer gives a group (5)

| Gives | Amount | Stacks with |
|---|---|---|
| Borrowed Minutes | +20% haste/move + cooldowns 20% faster on **one** ally, 8 s every 20 s (40% uptime) | other classes' haste, to the haste cap; never a second Borrowed Minutes |
| Sandfall | 40% slow, 30% cast slow on trash; 15% cast slow on a boss | other slows use the strongest (page 05 slow rule) |
| Unwind | an emergency heal up to 35%, every 25 s | healers; the Out of Time lock is shared by every chronomancer |
| Chrono-lock | a 2 s pause of a boss cast (1 s in Challenge mode), once per 90 s per boss | **not** with any other class's boss-cast pause (page 11 lockout) |
| Stilled Moment | 4 s of total control over trash | — |

### 3.5 Boss mechanics

| Mechanic | What the chronomancer does |
|---|---|
| **Danger zone** | Recall out if your Ghost is outside (its outline is not red). |
| **Void zone** | Sandfall does nothing to a void zone; Recall out of one if you drifted in. Backward: Hand Back the player who stood in it too long. |
| **Soak** | Chrono-lock the boss 0.5 s before the soak's cast ends so late players can arrive. Recall out after the soak lands, never before. The Ghost never counts toward a soak. Backward: Hour of Return on the soak spot replays the soak's damage as healing 3 s later. |
| **Targeted** | Recall is a free spread: walk to a clear spot 5 s early and Recall back after. |
| **One-shot casts** | Chrono-lock gives the group 2 s more to reach a Safe zone. It does **not** make the hit survivable. |
| **Tethers** | Recall is refused while Tethered (rule 4). |
| **Adds** | Stilled Moment on the add pack, then release everything into the stored damage. |
| **Interrupts** | Echoing Hour's second strike interrupts non-boss casts only. Chronomancer has no boss interrupt. |

---

## 4. Alternate spells

### 4.1 Turn the Glass — Forward and Backward (the Healer versions)

From the level-6 calling quest the chronomancer has two **hourglass directions**, chosen with the stance keys:
**`Shift+1` Forward** (the spells in §3, Support) and **`Shift+2` Backward** (three spells become heals).
Swapping is **free out of combat**; in combat it takes a **1.0 s** cast and has a **10 s** lockout. The
direction is saved per loadout. Slots 2, 4 and 6 are the same in both directions.

| Slot | Backward id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Effect |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `chronomancer_hand_back` | **Hand Back** | 70 mana | — | 1.5 s | Needs target (friendly; `F1` self) | 36 m | one ally | `tag_spell` `tag_arcane` `tag_heal` | Heals **100% SP** + **25% of the target's Rewindable health** (capped at 150% SP extra). +8 Sand |
| 3 | `chronomancer_stillwater` | **Stillwater** | 150 mana | 18 s | 1.0 s | Ground | 30 m | ground circle 7 m, 8 s | `tag_spell` `tag_arcane` `tag_area` `tag_heal` `tag_duration` | Allies inside heal **25% SP a second** and are **Late-Struck** (new status): every hit they take arrives **2 s late and 20% smaller** (mechanic hits and room-wide hits arrive on time at full size). +2 Sand a second while an ally inside is Late-Struck |
| 5 | `chronomancer_hour_of_return` | **Hour of Return** | 180 mana | 12 s | 1.5 s | Ground | 34 m | ground circle 6 m | `tag_spell` `tag_arcane` `tag_area` `tag_heal` | Heals allies inside **180% SP** at once. **3 s later** a second chime heals each ally still inside for **60% of the damage they took in those 3 s** (a replay), up to **200% SP** each. +15 Sand |

- **Hand Back — looks like**: a gold clock hand spins **anticlockwise** around the ally and violet numbers
  flow back into them (spellfx `heal`, arcane helix reversed). **Sound**: a tick-tock played backwards.
- **Stillwater — looks like**: a still pool of pale-blue sand that does not fall (spellfx `storm`, arcane,
  frozen in place, recoloured `#9ad8ff`); hits on allies inside show as a grey "pending" number that turns red
  when it lands 2 s later. **Sound**: a low water-clock drip, one drip a second.
- **Hour of Return — looks like**: the same clock-face rune as Echoing Hour in pale gold, with the hands turning
  back; the second chime draws each ally's lost-health numbers back up out of the ground. **Sound**: a bell,
  3 s of reversed ticking, the bell again one note **higher**.
- Talents on slots 1, 3 and 5 apply to both versions unless marked *(Forward)* or *(Backward)*.

### 4.2 Cast from the Past

From the level-20 calling quest. Hold the **second class key `G`** and press a spell key: the spell is cast
**from your Ghost** — from where you stood 5 s ago, facing the way you faced then. Costs the spell's normal
cost **+10 Sand**. The six slots show the same icons with a violet "past" border while `G` is held. Works in
both directions; the Backward row uses the Backward spells.

| Slot | Past version | What changes |
|---|---|---|
| 1 | `chronomancer_second_hand_past` | Fired from the Ghost; if it hits the target's **back**, +30%. (Backward: `chronomancer_hand_back_past` — no cast time, heals 70%) |
| 2 | `chronomancer_borrowed_minutes_past` | May target **yourself** (normally forbidden) |
| 3 | `chronomancer_sandfall_past` | Centred on the Ghost instead of the aim point (drops a slow — or a Stillwater — where you were) |
| 4 | `chronomancer_unwind_past` | Restores to **5 s ago** instead of 4; self only |
| 5 | `chronomancer_echoing_hour_past` | The first strike lands where you aimed **5 s ago** (a delayed trap). Backward: the heal lands where your group stood 5 s ago — useful after a knockback |
| 6 | `chronomancer_stilled_moment_past` | The dome is centred on the Ghost; you can move during the channel |

The Ghost's line of sight is checked, not yours: casting from behind a pillar you walked past is allowed.

---

## 5. The hybrid role — Healer by rewinding (new)

**How it works.** A Backward chronomancer heals mostly by **giving back damage that just happened**. Every
Backward heal reads the Ledger (§2.3): Hand Back is a steady small heal with a bonus sized by the target's
Rewindable health, Hour of Return replays recent damage as healing, Stillwater spreads damage out so the other
two catch it, and Unwind is the once-per-30-s big save.

**Role focus** (canon 00 §6): the chronomancer uses the shared **Role focus** switch in the spellbook (out of
combat, saved per Loadout), **tied to its hourglass direction** (§4.1): **Hybrid** sets **Backward** — slots 1,
3 and 5 become their healing versions — and queues it as **Healer**; **Primary** sets **Forward** and queues it
as Support. The stance keys (`Shift+1`/`Shift+2`, §4.1) can still flip the direction mid-fight; the Dungeon
Finder role follows the switch.

**Rotation (Backward, 5-player dungeon).**
1. Before the pull: **Stillwater** where the tank will stand. Borrowed Minutes on the tank (more parries and
   faster defensive cooldowns) or on the top damage dealer when the tank is safe.
2. Right after a spike on the tank: **Hand Back** while the violet segment on their frame is still long (the
   bonus is 25% of it). Waiting 4 s loses the bonus — the segment slides away.
3. Before a room-wide hit or a soak: **Hour of Return** on the group's stack point, so the replay chime lands
   3 s after the hit.
4. A near-death: **Unwind** (35% cap, then Out of Time 30 s). A second near-death in 30 s: Hand Back and Recall
   yourself if it is you.
5. Sand pays for Unwind and Recall; the Backward spells give the same Sand as their Forward twins.

**Healing budget** (page 06 §8.2 formula, Healer ×1.0 for heals; hybrid heals are set at about **85%** of a
primary healer's budget, then the Rewindable bonus is the chronomancer's own edge):

| Spell | Budget | Written |
|---|---|---|
| Hand Back (slot 1, 1.5 s cast, no cooldown) | (0.55 + 1.5) × 1.00 × 1.5 × 0.85 ≈ 261% SP over its cast → per-cast share | **100% SP + 25% Rewindable** (≈ 160% SP on a freshly hit tank) |
| Stillwater (slot 3, 18 s) | (1 × 2.12 + 1.0) × 1.23 × 0.55 × 1.5 × 0.85 ≈ 269% SP per ally | **25% SP a second × 8 s = 200% SP** + the Late-Struck delay |
| Hour of Return (slot 5, 12 s) | (1 × 1.64 + 1.5) × 1.69 × 0.60 × 1.5 × 0.85 ≈ 406% SP per ally | **180% SP + replay up to 200% SP** |

**How well it works** (00 §6 hybrid rule):

| Content | Verdict |
|---|---|
| Open world, solo or with followers | Strong — Recall + Unwind + Hand Back keep you and a follower alive easily |
| Normal dungeons | Full healer. Burst damage (a big hit, then a pause) is its best case |
| Depth up to about 10 | Works; needs the tank to use cooldowns on long steady-damage pulls |
| Challenge mode and deep Depth | Allowed to be weaker: steady damage over many seconds (bleeds, auras) leaves little Rewindable health, and it has no big group heal on slot 6. Pair with a primary healer or a strong self-healing tank |

**Talents that lean Healer** (§7): Second Hand 2c *Given Back*, Sandfall 1c *Deep Water*, Unwind 1a *Wide
Unwind* and 4b *Timeline Anchor*, Echoing Hour 3b *Long Replay*, Stilled Moment 2b *Mercy Stop*.
**Gear that leans Healer**: the 2- and 6-piece of **Robes of the Last Second** (§8), the **Pendulum** (§9),
and the soul **Soul of the Backward Hour** (§9). Healing affixes (page 08) apply to every spell tagged `tag_heal`.

---

## 6. Utility spells

### `chronomancer_retrace` — Retrace (travel, no slot)

Returns the party to **a spot one of them stood on in the last 10 minutes** (00 §6). [Page 20](../20-TRAVEL.md)
§16.2 owns the numbers; this table repeats them:

| Rule | Value |
|---|---|
| Learned | automatically at **level 12** (with waystones and Travel Methods, page 07); a short lesson from `npc_archivist_hourne` explains it once |
| Targeting | **Self** (and the party near you) |
| Cost / cooldown | no mana, no reagent · **10 min** cooldown |
| What it records | every **10 s**, the position of every party member (and the chronomancer) — up to **60 marks each** (the last 10 minutes). Marks inside dungeons and world-boss arenas are not recorded; marks are kept only while the party exists |
| Cast | pick a mark on the timeline, then a **3 s** cast; moving or taking damage cancels it |
| Who comes | the chronomancer and every party member within **30 m** who stays inside the **green ring** shown for the 3 s cast (stepping out = staying behind) |
| Arrival | at the chosen mark (± 2 m) |
| Limits | out of combat; open world and towns only (not inside a dungeon, not in a world-boss arena during its fight) |
| Discovery | anything the recorded member had discovered **within 60 m** of that mark (a waystone, station, dungeon entrance) is discovered for everyone who arrives — the way a chronomancer brings friends to an entrance they walked past (00 §12.1 W9) |

**The Retrace timeline** (`scr_retrace_timeline`, page 20 §19.1): a strip of 60 marks per party member, each
with the place name and how long ago ("Marcus — Mossfen ford, 6 min ago"); hovering a mark shows it on the
region map as a pin on that member's dotted trail, drawn in their party colour.
**Looks like**: the party dissolves into violet sand that streams off along the trail line; they reform at the
point with a gold ring. **Sound**: a long reversed chime.

(The chronomancer has no other utility spell. Everyone also has scrolls and the Recall Stone, page 20.)

---

## 7. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets that tier when it unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`). Talents on slots 1, 3 and 5 apply to both
hourglass directions unless marked.

**Second Hand / Hand Back** (`chronomancer_second_hand`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Minute and Hour** — fires two hands, one fast (80%) and one slow that lands 1 s later (80%); Backward: heals twice at 60% each | **Ticking Round** *(Forward)* — the bolt pierces up to 3 enemies | **Hour Hand** — cast time 2.0 s, 200% SP, applies all 3 Lagging stacks at once; Backward: heals 170% SP + 25% Rewindable |
| 2 (22) | **Borrowed Second** — each cast takes 1 s off Borrowed Minutes's cooldown | **Tempo Theft** *(Forward)* — at 3 Lagging stacks, the target's lost speed is given to you as haste (up to +9%) | **Given Back** *(Backward)* — Hand Back returns 40% of Rewindable health instead of 25% |
| 3 (32) | **Rewound Bolt** — the bolt returns to you after hitting, striking again on the way back for 50%; Backward: bounces to a second ally for 50% | **Brittle Moment** *(Forward)* — at 3 stacks, the target is Stopped for 1 s (non-boss, once per 10 s per target) | — |
| 4 (45) | **Clockwork Volley** — casting it 3 times in a row makes the 4th instant and fires 3 bolts (Backward: 3 heals on the 3 lowest allies) | **Lost Hours** *(Forward)* — Lagging also makes the target's damage-over-time on your allies tick 30% slower | — |

**Borrowed Minutes** (`chronomancer_borrowed_minutes`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Shared Hour** — also affects one more ally within 8 m of the target at half strength | **Surge** — 4 s long, but +40% attack/cast speed | — |
| 2 (22) | **Borrowed Strength** — the target also deals +8% damage | **Borrowed Breath** — the target regains 10% of its resource at the start | **Head Start** — the target's next spell has no cast time |
| 3 (32) | **Rolling Time** — when it ends, it jumps to the ally nearest the target for 4 s | **Undoing** — the target's current cooldown with the most time left is cut by 5 s | — |
| 4 (45) | **Time Debt** — +30% haste (not capped for its duration), but the target is Lagging for 4 s afterwards | **Perfect Tempo** — while the target is Hurried, you gain 3 Sand a second | — |

**Sandfall / Stillwater** (`chronomancer_sandfall`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Sinking Sand** *(Forward)* — enemies inside are pulled 1 m a second toward the middle | **Sand Wall** — becomes a 16 m by 2 m line instead of a circle | **Deep Water** *(Backward)* — Late-Struck delays hits 3 s instead of 2, and they arrive 25% smaller |
| 2 (22) | **Timeless Ground** — allies inside do not lose buff time (buffs pause) | **Erosion** *(Forward)* — each second inside strips 5% armour, to −25% | **Dust Storm** *(Forward)* — enemies inside have a 20% chance to miss with ranged attacks |
| 3 (32) | **Moving Dune** — the circle follows the first enemy it hit (Backward: the first ally it healed) | **Grain by Grain** — ticks 40% SP a second instead of 20% (Backward: heals 35% SP a second instead of 25%) | — |
| 4 (45) | **Hourglass Turned** — when it ends, it flips: allies inside are Hurried for 3 s | **Quicksand** *(Forward)* — non-boss enemies that stay 4 s are Rooted for 2 s | — |

**Unwind** (`chronomancer_unwind`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Wide Unwind** — affects the target and everyone within 6 m at half strength (cap 17%) | **Deep Unwind** — looks back 6 s instead of 4 (cap unchanged) | — |
| 2 (22) | **Stitch** — also restores the target's resource to what it was 4 s ago | **Hold the Moment** — if the target would drop below 10% health in the next 3 s, Unwind triggers on its own instead (still costs Sand) | — |
| 3 (32) | **Reverse the Blow** — 30% of the health restored is dealt as arcane to the enemy that did most of that damage | **Short Debt** — Out of Time lasts 15 s instead of 30 (only from your Unwind) | **Clean Slate** — also removes one non-mechanic harmful status gained up to 10 s ago |
| 4 (45) | **Return Trip** — the target is also moved back to where it stood 4 s ago | **Timeline Anchor** — the target gets a barrier equal to the health restored, for 4 s | — |

**Echoing Hour / Hour of Return** (`chronomancer_echoing_hour`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Three Bells** — strikes three times: 180%, 90%, 90% at 0, 3 and 6 s (Backward: 150% SP now, two replays at 3 s and 6 s at 45% each) | **Wandering Echo** *(Forward)* — the second strike lands on the enemy nearest the first spot, wherever it went | — |
| 2 (28) | **Echo Chamber** *(Forward)* — Out of Step enemies spread it to enemies within 4 m | **Silent Bell** *(Forward)* — the second strike also silences non-boss enemies for 2 s | **Carried Chime** *(Backward)* — the replay follows each ally who was inside, wherever they went |
| 3 (32) | **Resounding Bell** — every Echoing Hour you have on the ground at once adds +20% to the others' second strike | **Long Replay** *(Backward)* — the replay counts 5 s of damage instead of 3 and caps at 260% SP | — |
| 4 (45) | **Last Echo** *(Forward)* — the second strike deals 220% (same as the first) | **Time Fracture** *(Forward)* — enemies hit by both are Lagging at 3 stacks for 6 s | **Full Return** *(Backward)* — the replay returns 80% of the damage instead of 60% |

**Stilled Moment** (`chronomancer_stilled_moment`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Held Breath** — 6 s instead of 4, dome 10 m | **Pocket of Time** — the dome is placed at your aim point (30 m, Ground) instead of on you | — |
| 2 (40) | **Stored Force** — stored damage is released at +50% instead of +25% | **Mercy Stop** — allies inside heal 3% max health a second | — |
| 3 (40) | **Moving Moment** — the dome moves with you | **Unfreeze One** — one enemy (your target) is left out of the stop and takes +25% damage from everything while the rest are frozen | — |
| 4 (45) | **After Image** — when it ends, all enemies inside are Lagging at 3 stacks | **Stolen Seconds** — refunds 30 Sand for every non-boss enemy that dies inside it | — |

---

## 8. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_chronomancer_hourwright` | **Vestments of the Hourwright** | `it_hourwright_hood`, `it_hourwright_mantle`, `it_hourwright_robe`, `it_hourwright_gloves`, `it_hourwright_leggings`, `it_hourwright_slippers` | Levels 42–57: Normal bosses of `d11_saltdeep_cathedral`, `d12_unmade_workshop`, `d13_cindergate` (one piece per boss, class-weighted). Level-60 copies from the same bosses in Challenge mode |
| `set_chronomancer_last_second` | **Robes of the Last Second** | `it_last_second_cowl`, `it_last_second_spaulders`, `it_last_second_robe`, `it_last_second_handwraps`, `it_last_second_trousers`, `it_last_second_sandals` | Level 60: Challenge-mode bosses of `d13_cindergate` through `d16_the_spire` and Depth 10+ end chests; the robe only from `d16_the_spire`'s final boss (Challenge) or a Tailoring recipe (page 19) that needs a soul-grade reagent from Depth 15+ |

**Vestments of the Hourwright**
- **2 pieces** — Second Hand and Hand Back grant +12 Sand instead of +8.
- **4 pieces** — Recall leaves a **Sandfall** (Forward) or **Stillwater** (Backward) where you left, for 4 s.
- **6 pieces** — Unwind costs 25 Sand and has 2 charges.

**Robes of the Last Second**
- **2 pieces** — Echoing Hour's second strike and Hour of Return's replay happen after 2 s instead of 3.
- **4 pieces** — Borrowed Minutes also grants the target +10% damage (does not stack with tier 2a; the bigger wins).
- **6 pieces** — Stilled Moment's cooldown is 120 s, and your Paradox Echo is 50% instead of 35%.

---

## 9. Class legendaries, uniques and souls

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_ferrymans_hourglass` | The Ferryman's Hourglass | off hand, hourglass focus | **Two Crossings** — Recall has 2 charges (30 s each) and costs 20 Sand | world boss `b_sallow_king` (page 13) |
| `leg_the_unwound_spring` | The Unwound Spring | staff | **Twelve Strikes** — during Stilled Moment, Second Hand and Hand Back have no cast time and cost nothing | `d16_the_spire`, final boss, Challenge mode (page 12) |
| `leg_band_of_the_long_afternoon` | Band of the Long Afternoon | ring | **Long Afternoon** — Borrowed Minutes lasts 12 s and splits: 2 allies at 15% each | world boss of `riftmarch` (page 13) |
| `leg_mantle_of_yesterday` | Mantle of Yesterday | shoulders | **Yesterday's Road** — your Ghost runs **8 s** behind instead of 5 (Recall and Cast from the Past look 8 s back; the 30% health cap is unchanged) | `d14_ashen_reliquary`, final boss (page 12) |
| `uq_sundial_wand` | The Sundial Wand | wand | **Noon Shadow** — Lagging stacks to 5 | `d07_thornheart`, boss 2 |
| `uq_waterclock_slippers` | Waterclock Slippers | feet | **Running Water** — after Recall, +40% move speed for 3 s | `d10_rimefang_caverns`, final boss |
| `uq_pendulum_amulet` | The Pendulum | neck | **Swing Back** — every 30 Sand you spend heals you for 5% of max health; Backward, it heals the lowest-health ally within 30 m instead | `d05_glass_tombs`, final boss |

**Souls** (page 08 owns sockets; page 09 catalogues souls):

| id | Name | Socket in | Requirement | Behaviour | Source |
|---|---|---|---|---|---|
| `soul_backward_hour` | Soul of the Backward Hour | weapon (staff or wand) | Chronomancer | *A spell changes*: **Unwind** no longer makes the target Out of Time; instead it also casts a free **Hand Back** (Backward version, no Sand) on the lowest-health ally within 20 m. The 35% cap still applies | `b_oddrin_the_unmaker`, `d12_unmade_workshop` end boss, Challenge mode (about 1 in 40 kills) |
| `soul_second_self` | Soul of the Second Self | jewellery (neck or ring) | Chronomancer | *A chance to apply an effect*: **15%** chance when you cast a slot-1 spell that your Ghost casts it too, at once, from where it stands, at 100% (the echo costs nothing and does not count toward Paradox Echo) | world boss `b_standing_ruin` (page 13), or a Depth 15+ end chest (rare roll) |

---

## 10. Voice and barks

**Voice**: reuse `shared/voices.js` `chronomancer` (pitch 0.48, depth 0.55, tone 0.6, breath 0.2, rough 0.05,
speed 0.45, jitter 0.08) — calm, precise, a little amused. For Recall, Retrace and the past bar the line is
played through a short reverse-reverb (sfx chain, [page 17](../17-ART-AUDIO.md)).

| When | Lines |
|---|---|
| Borrowed Minutes | "Take a few of mine." · "Faster." · "You have more time than you think." |
| Sandfall | "Slow down." · "Every grain." |
| Unwind | "That didn't happen." · "Let's try that again." · "Back you go." |
| Hand Back / Hour of Return | "Have it back." · "You were whole a moment ago." · "Undo that." |
| Turn the Glass (Backward) | "The other way, then." |
| Recall | "Not like that." · "Once more." |
| Retrace | "We've been here before." · "Follow the sand." |
| Stilled Moment | "Hold." · "Everything — stop." · "Now, where were we?" |
| Critical hit / critical heal | "Right on time." · "To the second." |
| Low health | "I'm running out of time!" · "Too late, too late —" |
| Ghost in a telegraph (warning) | "My past is standing in the fire." |

---

## 11. Reuse notes

- **Looks**: `avatar-3d/data/class-outfits.json` `chronomancer` (hood, trim robe, rune halo); Farhold's
  portrait holds an **hourglass** (`classes.json` look `held: hourglass`) — the art exists, the item does not.
- **Effects** (visuals only): Second Hand uses the `arcane` helix; Sandfall and Stillwater use `storm`
  recoloured; Stilled Moment uses `vortex`; Borrowed Minutes uses `orbitOrb` (the Storm Orbs effect); the
  Backward heals use `heal` with arcane colours. The **Ghost** is new: a second Chibi 2 body with a translucent
  violet material, driven by the recorded positions. It must share the player's skinned mesh (reuse:
  `avatar-3d/js/chibi2.js` clone path) to stay inside the draw-call budget.
- **Party-frame segment** for the Ledger: page 03's party frames draw an extra coloured segment; the same
  element can serve any future "recent damage" display (new).
- **Emberveil's chronomancer** (`haste`, `slow_time`, `rewind`, `time_stop`) → Borrowed Minutes, Sandfall,
  Unwind, Stilled Moment. The names are changed so no id is shared with that prototype or with another class.
- Farhold's chronomancer kit (`arcane_burst`, `quicken`, `ice_lance`, `frost_nova`, `smoke`, `meteor`) is
  **dropped**: every one is another class's borrowed skill.
- **Tech note for [page 16](../16-TECH.md)**: the 5 s recording is 50 samples of position/facing/health/mana
  (about 1 KB per chronomancer); the Ledger adds 80 health samples per group member (about 2 KB per group); the
  Retrace trails are 60 marks per member (one every 10 s, page 20 §16.2). The server must own all three, not the client, or Recall, the
  rewinds and Retrace become cheats.

---

## 12. Round 2 changes

*(reference — a Claude-facing change log. Old names, including banned ones, are listed here only so they can be found and removed elsewhere; none of them is used in play.)*

- **Added**: Hybrid role **Healer** (§5) — the Ledger (§2.3), Turn the Glass with three Backward heals
  (`chronomancer_hand_back`, `chronomancer_stillwater`, `chronomancer_hour_of_return`, §4.1), Late-Struck status,
  healer talents; utility spell **Retrace** (`chronomancer_retrace`, §6) with the Retrace timeline; two souls.
- **Changed**: mana costs from % of max to flat numbers on the 1,000 pool; targeting + tags on every spell;
  class key Recall `R` → **`Q`**; Cast from the Past `Z` → hold **`G`**; calling quest ids
  `q_chronomancer_calling_N` → `q_calling_chronomancer_N` (00 §10); Chrono-lock uses page 11's shared 90 s lockout.
- **Removed**: raid rotation and raid columns, Mythic caps (Recall 20%, Chrono-lock 1 s → Challenge mode 1 s),
  raid drop sources (r03/r05 → world boss / d16 / Depth), Heroic/Mythic+ set copies (→ Challenge mode).
- **Renamed**: talent "Stored Fury" → **Stored Force**; talent "Mercy Bell" (Echoing Hour 3b) folded into the
  Backward spell Hour of Return and replaced by **Long Replay**.
- **Sweep (round 2)**: Retrace numbers set to page 20 §16.2 (10 min cooldown, 3 s cast, marks every 10 s, green
  ring instead of an accept prompt, 60 m discovery; `scr_retrace_map` → `scr_retrace_timeline`); Role focus
  wording in §5.
