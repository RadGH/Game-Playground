# Class: Swashbuckler (`swashbuckler`)

> *"If you are going to win, win beautifully. If you are going to lose — well, that is what the cape is for."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 13.
**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only — nothing is built.
Follows the class template in [page 00 §5](../00-OVERVIEW.md). Canon facts used (page 00 §6): primary role
**Damage**, hybrid role **Tank**, build **melee**, **light** armour, resource **Tempo**, mechanic **Flair —
stacks from flourishes, released by Grandeur; parry-and-riposte tanking**, spell slots 1 / 4 / 10 / 18 / 28 / 40,
calling quests 6 / 20 / 40, talent tiers 12 / 22 / 32 / 45, cap 60.

## How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the main-hand weapon, before armour (page 05 owns the formula; Farhold `rpg.strike` base). |
| **OH** | Off-hand weapon damage (Farhold `OFFHAND_DAMAGE` = 60% of its own WD, reuse `js/weapons.js`). |
| **Tempo** | the class resource (canon: a small pool that refills fast). Pool **100**, refills **25 per second** (a full bar in 4 s), in and out of combat. Costs are absolute points. Spending faster than 25 a second (spamming Needle Flurry) drains it by about 10 a second, so a swashbuckler can spam for about 10 s before waiting on the bar. |
| **Flair** | the class mechanic, 0–10 stacks (15 from Calling II) (§2). |
| **Flourish** ✦ | a spell that builds Flair. |
| **Finisher** ◆ | a spell that spends Flair. |
| **Targeting** | page 02 / 00 §12.1 W8: **Needs target** = will not cast without a valid hard target · **Auto-target** = with no valid target, picks the valid enemy closest to your aim point in range · **Self** · **Ally** (a party member or yourself, `F1`–`F5`) · **Ground**. |
| **Tags** | page 05 §Tags owns the list. A bonus to a tag applies to every spell carrying it ("+10% Melee Attack damage" needs both `tag_melee` and `tag_attack`). |
| **GCD** | 1.0 s global cooldown (canon). |

Statuses (bleed, disarm, knockdown, blind, taunted, stagger) are page 05's list. Bosses ignore stun,
knockdown and disarm (their break bar fills instead, page 05 §11.4).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A duellist who fights for an audience that is not there. Every flashy move earns **Flair**; Flair turns a finisher into a legend. Nimble, cocky, never where the blow lands. |
| Primary role | **Damage** (melee, single target with short leaps) |
| Hybrid role | **Tank** — **Riposte Guard** (§5): an evasion tank who parries, dodges and ripostes instead of blocking. |
| Build | melee |
| Armour | Light |
| Weapons | Rapier, sabre or sword in the main hand; a dagger, second light blade or (tank) a **buckler** in the off hand (Farhold `weapons: ["sword", "dagger"]`; patterns `rapier` thrust-thrust-lunge 3.3 m, `scimitar`/sabre slash-slash-arc 2.7 m, `dagger` jab-jab-slash 2.0 m). Starter: **Duellist's Rapier + Parrying Dagger**. |
| Primary attribute | DEX |
| Resource | **Tempo** + **Flair** stacks |
| Companion | None. The crowd is imaginary; the applause is not (§2.3). |
| Playstyle | Weave flourishes and last-moment dodges to stack Flair, keep the stacks up by never stopping, then spend them in a finisher. The class rewards style: rolling through an attack at the last moment is worth more than walking out of it. As a tank, the same habits hold the enemy: every parry and dodge is a stack of Flair and a riposte. |

---

## 2. Class mechanic: **Flair**

### 2.1 The stacks

**0–10 Flair** (15 from Calling II). Each stack gives **+2% critical chance** and **+1% move speed**
(10 stacks = +20% crit, +10% move). In Riposte Guard each stack gives **+1% dodge chance** instead of the
crit (§5).

| Gains Flair | Amount |
|---|---|
| Each flourish (✦) | its own number (§3) |
| **Showstopper dodge** — a dodge roll that passes **through** an enemy attack or a telegraph edge within **0.25 s** of it landing | **+2** (once per attack) |
| A parry (En Garde!, or a Riposte Guard parry) | +2 (En Garde!) · +1 (Guard, max once per 0.5 s) |
| A dodged attack in Riposte Guard | +1 (max once per 0.5 s, shared with the parry gain) |
| A critical hit with a basic attack | +1 (max once per 2 s) |

| Loses Flair | Amount |
|---|---|
| A finisher (◆) | all of it (unless the spell says otherwise) |
| Out of combat for 8 s | −1 every 3 s |
| Being **stunned** or **knocked down** | −3 ("the crowd groans") |

### 2.2 Grandeur (Calling I)

When a finisher is cast at **10 Flair** (or more), it becomes a **Grandeur**: it **always critically
hits**, its visual doubles (gold confetti burst, a spotlight beam on you for 1 s), and the crowd roars
(sound only). Grandeur is not a separate spell — it is what a finisher *is* at full Flair.

### 2.3 UI

* **A ribbon of 10 gold feather pips** under the health bar (15 at Calling II; the extra five are
  crimson). Each lights with a small "ting". At 10 the ribbon becomes a **spotlight icon** that glows
  and a faint crowd murmur plays (volume setting `set.audio.swash_crowd`, default 50 — page 04).
* The **Tempo** bar sits under the ribbon (pale gold, 100 notches, 10 marked).
* A **Showstopper dodge** pops a small gold "✦ Showstopper!" float text over your head and a bright chime
  (setting `set.interface.swash_floaters`, default on).
* In **Riposte Guard** the ribbon turns steel-blue and a **Poise** row of 5 small shield pips appears
  above it (§5).
* The Chibi 2 body shows Flair: 5+ stacks — the coat (`open_coat`) flutters as if in wind; 10 — a golden
  trail follows the blade (spellfx `physical` trail recoloured gold).

### 2.4 Class key

* **`Q`** — **Riposte Guard** on/off (from Calling I, level 6; §5). Off the GCD, 1.5 s cooldown.
  (Page 02 §5.16 listed the swashbuckler with no class key; this is a change request for page 02.)
* **`G`** — none. **`Shift+1`–`4`** — none.

### 2.5 The calling quests (page 14 owns text; ids per 00 §10)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_calling_swashbuckler_1` | **The First Bow** | Hearthvale — the Brightwater harvest fair; win a three-round duel in front of the village where points come from style (Showstoppers, parries), not damage | **Grandeur** (finishers at 10 Flair always crit), **Showstopper dodges**, and **Riposte Guard** on `Q` |
| 20 | `q_calling_swashbuckler_2` | **Applause** | Highcourt — duel through the capital's fencing hall ladder, five opponents, each with a telegraphed trick | Flair max **10 → 15**; a Grandeur **refunds 3 Flair**; Showstopper window 0.25 → 0.35 s; Riposte Guard parry chance 15 → 20% |
| 40 | `q_calling_swashbuckler_3` | **Standing Ovation** | The Drowned Coast — a sword fight across the masts of a sinking ship against a drowned captain (a solo instance with falling rigging as danger zones) | **Curtain Call**: after a Grandeur, **4 s** in which flourishes cost no Tempo and build **double** Flair; in Riposte Guard, Curtain Call instead makes every attack on you a parry for 2 s |

### 2.6 JSON shape

```json
{
  "id": "swashbuckler",
  "tempo": { "max": 100, "regenPerSecond": 25 },
  "flair": { "maxByCalling": [10, 15, 15], "critPerStack": 0.02, "movePerStack": 0.01,
             "showstopper": { "window": [0.25, 0.35, 0.35], "gain": 2 },
             "decay": { "afterSeconds": 8, "every": 3 }, "stunLoss": 3 },
  "grandeur": { "at": 10, "alwaysCrit": true, "refund": 3 },
  "curtainCall": { "seconds": 4, "flourishFree": true, "flairMult": 2, "guardAllParrySeconds": 2 },
  "riposteGuard": { "threatMult": 4, "dodge": 0.20, "parryByCalling": [0.15, 0.20, 0.20],
                    "dodgePerFlair": 0.01, "avoidCap": 0.60, "riposteWD": 0.6,
                    "poise": { "max": 5, "perStack": 0.04, "seconds": 6 },
                    "damageDone": -0.15, "tempoRegenMult": 1.2, "bravuraHealPerFlair": 0.03 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Kind | Cost | CD | Cast | Target | Shape | Tags | Does |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `swashbuckler_needle_flurry` | Needle Flurry | ✦ | 35 Tempo | GCD | instant | Auto-target | 3.3 m, 40° arc | `tag_physical` `tag_attack` `tag_melee` | 3 × 55% WD, +1–2 Flair |
| 2 | 4 | `swashbuckler_curtain_cut` | Curtain Cut | ◆ | 40 Tempo | 6 s | instant | Needs target | one enemy, 3.5 m | `tag_physical` `tag_attack` `tag_melee` `tag_duration` | 100% WD + 45% per Flair |
| 3 | 10 | `swashbuckler_en_garde` | En Garde! | ✦ | 20 Tempo | 10 s | 1.2 s stance | Self | front 120° | `tag_physical` `tag_attack` `tag_melee` | parry → 260% WD counter |
| 4 | 18 | `swashbuckler_chandelier_vault` | Chandelier Vault | ✦ | 30 Tempo | 14 s | 0.5 s leap | Ground | 10 m leap, 3 m landing circle | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement` | 180% WD, +1 Flair per enemy |
| 5 | 28 | `swashbuckler_mocking_bow` | Mocking Bow | ✦ | 30 Tempo | 25 s | instant | Self | 10 m circle | `tag_area` `tag_duration` | non-boss enemies attack you 3 s; +40% dodge |
| 6 | 40 | `swashbuckler_grand_finale` | Grand Finale | ◆ | 50 Tempo + ≥5 Flair | 60 s | 2.5 s sequence | Auto-target | up to 5 enemies within 12 m | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement` | 6 × 120% WD + 400% WD + 60% per Flair |

### 3.2 Details

**1. `swashbuckler_needle_flurry` — Needle Flurry** ✦ · level 1 · 35 Tempo · no cooldown (GCD) · instant · 3.3 m, 40° arc
* Targeting: **Auto-target** — thrusts at your hard target if it is in reach, otherwise the enemy nearest
  your aim point within 3.3 m.
* **Three thrusts**, 0.12 s apart, each **55% WD** (165% total) to the first enemy in the arc.
* **+1 Flair**, or **+2** if all three thrusts hit the same target.
* Tags: `tag_physical` `tag_attack` `tag_melee`.
* Looks: three bright thrust streaks (`impact` physical, small, silver), the rapier `thrust` clip ×3 at
  1.5× speed. Sound: three quick *tink-tink-tink* rings of steel.

**2. `swashbuckler_curtain_cut` — Curtain Cut** ◆ · level 4 · 40 Tempo · 6 s · instant · **Needs target** · 3.5 m
* **100% WD + 45% WD per Flair** spent (550% at 10, a Grandeur crit on top).
* At **5+ Flair** it also leaves **Bleed 6 s** (8% WD per second per Flair spent).
* **In Riposte Guard — Bravura:** a Grandeur Curtain Cut also heals you **3% of max health per Flair
  spent** (30% at 10).
* Tags: `tag_physical` `tag_attack` `tag_melee` `tag_duration`.
* Looks: a single wide diagonal slash that leaves a red "curtain" of light hanging in the air for 0.4 s
  (`impact` bleed, stretched). Grandeur: gold confetti + spotlight. Sound: a long *shhhing* of steel,
  a crowd gasp at 10.

**3. `swashbuckler_en_garde` — En Garde!** ✦ · level 10 · 20 Tempo · 10 s · stance for **1.2 s** · **Self** · front 120°
* **Parries** the next melee hit **or** projectile from the front 120° during the stance: you take no
  damage and **counter for 260% WD** (+2 Flair).
* **Boss attacks** can be parried only if page 11 marks them "parryable" (a gold spark flashes on the
  weapon 0.4 s before landing). A parried boss hit is fully negated, the counter does 130%, and the boss's
  break bar fills 10%.
* If nothing is parried, **half the cooldown is refunded**.
* Tags: `tag_physical` `tag_attack` `tag_melee` (the counter).
* Status on you: `deflect` (reuse `STATUS_FX.deflect`). Looks: blade raised, a silver ring flashes on
  parry (`impact` physical crit). Sound: a bright *clang* and a scrape.

**4. `swashbuckler_chandelier_vault` — Chandelier Vault** ✦ · level 18 · 30 Tempo · 14 s · 0.5 s leap · **Ground** (within 10 m; with a hard target in range it lands beside the target)
* You flip through the air (**untargetable for 0.4 s** mid-leap — direct hits miss; ground effects you
  land in still hit) and land for **180% WD** in a **3 m** circle with a spin.
* **+1 Flair per enemy hit** (max 3).
* Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement`.
* Looks: a somersault with the coat flaring, a silver arc on landing (`aoe` physical). Sound: whoosh,
  a coin-like *ting* per enemy hit.

**5. `swashbuckler_mocking_bow` — Mocking Bow** ✦ · level 28 · 30 Tempo · 25 s · instant · **Self** · 10 m circle
* Non-boss enemies within 10 m **must attack you for 3 s** (Taunted).
* You gain **+40% dodge chance for 3 s**; **every attack you dodge gives +1 Flair**.
* **Bosses** are not taunted unless you are in **Riposte Guard**, where Mocking Bow is a real area taunt
  (every enemy in 10 m, bosses included, Taunted 3 s — page 05 §13.4). Out of Guard you still get the dodge.
* Tags: `tag_area` `tag_duration`.
* Looks: a deep theatrical bow, hat sweep (an emote clip from Farhold's `CHIBI2_EMOTE_ANIMS`, reuse),
  a ring of mocking gold "!" marks pops over each taunted enemy. Sound: a whistle and a short fanfare.

**6. `swashbuckler_grand_finale` — Grand Finale** ◆ · level 40 · 50 Tempo + requires **5+ Flair** · 60 s · a **2.5 s** sequence · **Auto-target** · up to 5 enemies within **12 m**
* You dash between up to **5 enemies** (your hard target first): **6 strikes** spread across them, each
  **120% WD**, then a final pose on the first target: **400% WD + 60% WD per Flair** (1000% at 10,
  Grandeur crit on top).
* During the 2.0 s of dashes you are **immune to damage**; the final 0.5 s pose is **not** immune.
* Tags: `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement`.
* Looks: the character blurs between targets (afterimages, the Chibi 2 body drawn 3× at 30% opacity),
  a spotlight beam and a burst of gold petals on the pose. Sound: a rising drumroll, a cymbal crash on
  the final strike, applause if Grandeur.

### 3.3 How it plays

* **Solo:** Needle Flurry to 4–5 Flair, Curtain Cut to finish a normal enemy. On elites: build to 10 with
  Flurry, En Garde! on their telegraphed swing (+2), a Showstopper roll through their slam (+2), then a
  Grandeur Curtain Cut. Chandelier Vault to open on a pack. A hard elite that keeps hitting you: switch to
  Riposte Guard and duel it slowly.
* **Dungeon (Damage):** stay on the boss's back; Flurry, and weave Showstoppers through the edges of the
  tank-facing cone attacks. Mocking Bow is your "save the healer" button — adds that run to the healer
  come to you for 3 s while the tank picks them up. Grand Finale on packs of 3–5.
* **Challenge mode and Depth:** the damage depends on **not stopping**: Flair decays out of combat and is
  lost to stuns, so learning each boss's stun is part of the class. In a movement phase, Showstopper
  dodges keep Flair building while other melee lose damage.

### 3.4 Boss mechanics

| Mechanic | Swashbuckler answer |
|---|---|
| **Danger zone** | a dodge roll through the edge as it fills is a **Showstopper** (+2) — the class is paid to leave at the last moment |
| **Void zone** | Chandelier Vault (10 m) out |
| **Parryable boss hits** | page 11 marks them with a gold spark 0.4 s early; En Garde! negates it and fills the break bar 10% |
| **Soak** | Grand Finale's 2 s immunity can carry a soak **only if** the pose ends inside — risky, 0.5 s exposed |
| **Adds on the healer** | Mocking Bow |
| **Stuns** | −3 Flair; pre-empt with En Garde! or roll |
| **Interrupts** | none. En Garde!'s parry of a boss's opening swing counts as an interrupt only where page 05 §11 allows it |

---

## 4. Alternate spells — the Grandeur versions

At **10+ Flair**, the two finishers flip their bar icons to gold **Grandeur** versions:

| Spell | Grandeur version | id | Target | Tags | Change |
|---|---|---|---|---|---|
| Curtain Cut | **Final Curtain** | `swashbuckler_final_curtain` | Needs target | `tag_physical` `tag_attack` `tag_melee` `tag_duration` `tag_area` | always crits; the curtain of light stays 3 s and enemies passing through it take 80% WD |
| Grand Finale | **Encore** | `swashbuckler_encore` | Auto-target | `tag_physical` `tag_attack` `tag_melee` `tag_area` `tag_movement` | always crits; after the pose you may press the key again within 2 s for one more dash + pose at 50% |

From Calling III, **Curtain Call** (4 s after a Grandeur) makes the three flourish buttons glow white: they
cost no Tempo and give double Flair.

---

## 5. The hybrid role — Tank (Riposte Guard)

**Role focus.** The swashbuckler uses the canon **Role focus** switch (00 §6: in the spellbook, out of combat
only, saved per Loadout), tied to its off hand: **Hybrid** can be set once **Riposte Guard** is unlocked
(Calling I, level 6) **and** a parrying dagger (any dagger) or a buckler is in the off hand (otherwise the switch
is grey with "Tank needs a parrying dagger or buckler in the off hand"). With Hybrid set the Dungeon Finder queues it
as **Tank**; in the fight, the tank state itself is the **Riposte Guard** toggle (§5.1). It tanks by **not being hit**:
dodges and parries instead of armour and blocks, smoothed out by **Poise**. *(Reference: an "evasion tank" in
the classic MMO sense.)*

### 5.1 Riposte Guard (`Q`, toggle)

| Rule | Value |
|---|---|
| Toggle | `Q`, off the GCD, 1.5 s cooldown. Stays on until you press it again or die. Shown as a steel-blue ribbon. |
| Threat | **Guardian** state: all your threat **×4** (page 05 §13.2). Ripostes deal threat ×2 on top. |
| Dodge | **+20% dodge chance** against melee and physical ranged attacks, **+1% per Flair stack** (instead of +2% crit). |
| Parry | **15% chance** (20% from Calling II) to parry a **melee** attack from your front 180°. A parried hit does **0**. |
| Avoidance cap | dodge + parry together cannot pass **60%**. |
| What cannot be avoided by chance | spells, area attacks, boss **named abilities** (anything with a cast bar or a telegraph), and anything page 11 marks "unavoidable". Only En Garde! (parryable hits), the dodge roll and Chandelier Vault stop those. |
| **Riposte** | every parry answers at once for **60% WD** (`tag_physical` `tag_attack` `tag_melee` `tag_basic_attack` — quiver and basic-attack effects apply). |
| **Poise** | every dodged or parried attack gives **1 Poise** (max **5**, 6 s, refreshed): **−4% damage taken per stack** (−20% at 5). This is what keeps an evasion tank from being all-or-nothing: a run of dodges makes the hits that do land smaller. |
| Flair | each dodge or parry gives +1 Flair (max once per 0.5 s). |
| Cost | your damage done **−15%**. Tempo refills **30 a second** instead of 25 so you can afford defensive spells. |
| Bravura | a Grandeur Curtain Cut heals you **3% max health per Flair spent** (§3.2). |
| Curtain Call (Calling III) | in Guard, the 4 s after a Grandeur becomes 2 s in which **every** attack on you (named abilities included, not room-wide) is a parry. |

### 5.2 The tank kit

| Piece | How it tanks |
|---|---|
| Needle Flurry | the threat filler; 3 hits = 3 chances for on-hit threat affixes |
| Mocking Bow (in Guard) | **area taunt**, bosses included, 3 s, plus +40% dodge; 25 s |
| Shared **Provoke** (`Z`, page 07, level 10) | the single-target taunt every tank-capable class gets |
| En Garde! | the "tank buster" answer: fully negates one parryable boss hit every 10 s |
| Chandelier Vault | 0.4 s untargetable — dodges one unparryable direct hit if timed |
| Curtain Cut (Bravura) | a 30% self-heal every time Flair reaches 10 |
| Talents that help | En Garde! t1b **Double Parry**, t2c **Return to Sender**, t4a **Iron Wrist**; Mocking Bow t2c **Crowd Pleaser**, t3b **Protector's Bow**; Curtain Cut t2c **Curtain Rise**; Chandelier Vault t2a **Boot to the Face** |
| Gear | a buckler or parrying dagger; dodge, health and DEX affixes; a gem in the buckler (page 08, armour column) |

### 5.3 Threat and mitigation numbers

Design targets against the warrior (the primary tank) under a steady boss melee rotation at level 60
(page 05 reference characters; page 05 owns the final maths):

| Per 100 points of raw boss melee | Warrior (heavy + Bulwark) | Swashbuckler (light + Riposte Guard) |
|---|---:|---:|
| Average taken over 30 s | ≈ 55 | ≈ 62 |
| Worst 3-second window (unlucky run) | ≈ 70 | ≈ 105 |
| Best 3-second window (lucky run) | ≈ 45 | ≈ 15 |
| Threat per second (as % of the group's top damage dealer's damage) | ≈ 330% | ≈ 300% |

**How good it is.** Plenty for the **open world, Normal dungeons and Depth up to about 10**: packs of
melee trash are where an evasion tank shines (many small hits, many dodges, Poise stays at 5). In
**Challenge mode** the swashbuckler struggles with **magic tank busters and room-wide pressure** (chance
avoidance does nothing against them) and the worst windows are spikier than a heavy tank's; a Challenge
party with a swashbuckler tank needs a healer who reacts fast and should expect to lean on En Garde! for
every parryable buster.

---

## 6. Utility spells

None. The swashbuckler uses scrolls and the Recall Stone (page 20).

---

## 7. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45; a tier opens at the later of its level and the
spell's slot level.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Needle Flurry | 1 | **Fourth Needle** — 4 thrusts at 45% | **Fan of Needles** — the arc widens to 90° and each thrust hits a different enemy | — |
| Needle Flurry | 2 | **Pinpoint** — the third thrust on the same target always crits | **Needle Bleed** — each thrust leaves a 3 s bleed (10% WD/s), stacks 3 | **Off-Hand Flurry** — adds 2 off-hand stabs at OH damage |
| Needle Flurry | 3 | **Step Flurry** — you step 2 m forward during it (a gap-closer) | **Backstep Flurry** — you step 2 m back after it | — |
| Needle Flurry | 4 | **Needlework** — at 10 Flair it hits 6 times | **Steel Needles** — each thrust also throws a steel needle 8 m for 30% WD (`tag_ranged` `tag_projectile` added) | — |
| Curtain Cut | 1 | **Swift Curtain** — cooldown 6 → 3 s, keeps 2 Flair | **Heavy Curtain** — 45 → 60% per Flair, cooldown 6 → 10 s | — |
| Curtain Cut | 2 | **Draped** — becomes a 5 m, 120° arc that splits the damage (`tag_area` added) | **Bloody Curtain** — the bleed happens at any Flair | **Curtain Rise** — kills refund all spent Flair; in Riposte Guard, Bravura also works below 10 Flair at half rate |
| Curtain Cut | 3 | **Twin Curtain** — the off hand repeats it at 40% 0.3 s later | **Last Act** — +50% on targets below 30% health | — |
| Curtain Cut | 4 | **Velvet Rope** — the curtain stays 3 s as a wall non-boss enemies will not cross | **Bow and Exit** — after it, you dash 6 m backwards | — |
| En Garde! | 1 | **Long Guard** — stance 1.2 → 2.5 s, cooldown 10 → 14 s | **Double Parry** — parries 2 hits, counter each at 180% | — |
| En Garde! | 2 | **Disarming** — a countered non-boss enemy is Disarmed 3 s | **Riposte Lunge** — the counter is a 6 m lunge line | **Return to Sender** — a parried projectile or single-target spell flies back at its caster for 200% WD |
| En Garde! | 3 | **Moving Guard** — you can walk at 50% during the stance | **Audience** — a parry gives +4 Flair instead of 2 | — |
| En Garde! | 4 | **Iron Wrist** — a parried boss hit fills its break bar 10 → 25% (once per 30 s) | **Bait** — if the stance ends with nothing parried, you get +3 Flair anyway | — |
| Chandelier Vault | 1 | **Twin Vault** — 2 charges | **Grand Leap** — 10 → 16 m | — |
| Chandelier Vault | 2 | **Boot to the Face** — the first non-boss enemy hit is knocked down 1 s | **Rope Swing** — you can vault to an **ally** (Ally targeting) and they gain +20% dodge 4 s | — |
| Chandelier Vault | 3 | **Swinging Blade** — you strike everything under your arc through the air for 80% WD | **Aerial Flourish** — the landing gives 3 Flair flat | **Double Back** — press again within 3 s to vault back to your start |
| Chandelier Vault | 4 | **Chandelier Drop** — a spectral chandelier falls with you: 6 m circle, 300% WD | **Stage Dive** — the vault resets its cooldown on a Grandeur | — |
| Mocking Bow | 1 | **Wide Bow** — 10 → 16 m | **Deep Bow** — 3 → 5 s | — |
| Mocking Bow | 2 | **Heckle** — taunted enemies deal 20% less damage | **Showboat** — dodge +40 → +60% but you move 30% slower | **Crowd Pleaser** — in Riposte Guard it lasts 5 s and every attack you avoid during it heals you 2% max health |
| Mocking Bow | 3 | **Encore Bow** — each dodge during it counters for 60% WD | **Protector's Bow** — every ally within 10 m of you also gains +20% dodge | — |
| Mocking Bow | 4 | **Rotten Tomatoes** — throws a spray at each taunted enemy: 50% WD + Blinded 2 s | **Exit, Pursued** — when it ends, the next attack each taunted non-boss enemy makes on you is dodged automatically | — |
| Grand Finale | 1 | **Long Finale** — up to 8 enemies, 9 strikes | **Solo Finale** — one enemy only, every strike on it, +30% | — |
| Grand Finale | 2 | **Showstopper Finale** — the pose is also immune | **Bleeding Stage** — every strike leaves a bleed (20% WD/s, 6 s) (`tag_duration` added) | — |
| Grand Finale | 3 | **Cheap Seats** — requires 3 Flair instead of 5 | **Standing Room** — the final pose knocks back every non-boss enemy within 6 m | — |
| Grand Finale | 4 | **Curtain Call Finale** — Curtain Call lasts 4 → 8 s after it | **Final Bow** — resets Mocking Bow and Chandelier Vault | — |

*(Round 1's "Stand-In" boss-taunt talent is gone: Mocking Bow is a real area taunt in Riposte Guard now.)*

---

## 8. Class sets

Light armour (head, chest, hands, legs, feet) + a rapier/sabre or off-hand dagger.

### 8.1 `set_swashbuckler_crimson_regalia` — Crimson Regalia (dungeon set, 25–34)

Drops from `d07_thornheart` bosses (head, hands, off-hand dagger `it_crimson_main_gauche`) and
`d09_warmasters_pit` bosses (chest, legs, feet) on **Normal** at the dungeon's level, and on **Challenge**
at item level 60; Depth runs of these dungeons can drop it too (page 12).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Needle Flurry gives +1 extra Flair when it crits | Needle Flurry |
| 4 | En Garde! refunds **all** of its cooldown on a successful parry | En Garde! |
| 6 | Curtain Cut at 10 Flair (Grandeur) leaves **5** Flair instead of 0 | Curtain Cut |

### 8.2 `set_swashbuckler_tidecaptains_finery` — Tidecaptain's Finery (endgame set)

Item level 60. Drops from **Challenge-mode `d15_fire_court` and `d16_the_spire` bosses** (one piece per boss;
page 12 names which boss drops which piece) and from the **end chest of any dungeon at Depth 10 or deeper**
(one random piece, 8%). *(Was a raid set; raids are in `WISHLIST.md`.)*

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Showstopper dodges give +3 Flair and refund 20 Tempo | the mechanic |
| 4 | Chandelier Vault costs no Tempo and its landing counts as a Showstopper | Chandelier Vault |
| 6 | Grand Finale can be cast at **any** Flair, and each Flair above 10 adds a 7th, 8th… strike (up to 11) | Grand Finale |

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_gallants_last_word` | The Gallant's Last Word | rapier | Every **Grandeur** leaves an **echo duellist** (a gold afterimage of you, 50% opacity, not a pet — it cannot be hit and takes no slot) for 6 s that repeats your Needle Flurries at 50% | `b_choir_of_brine` The Choir of Brine (`d11_saltdeep_cathedral` main boss) on Challenge |
| `leg_captains_plumed_hat` | Captain's Plumed Hat | head, light | Flair no longer decays out of combat and you **keep 5 Flair** after a stun instead of losing 3 | `b_sallow_king` The Sallow King (Drowned Coast world boss) |
| `leg_quicksilver_main_gauche` | Quicksilver Main Gauche | off-hand dagger | En Garde! becomes **passive**: every 8 s you automatically parry the next frontal hit (the stance key still works) | `b_bishop_aldwine` Bishop Aldwine, the Drowned (`d11_saltdeep_cathedral` end boss) on Challenge, and its Depth end chest |
| `leg_boots_of_the_last_dance` | Boots of the Last Dance | feet, light | Your dodge roll has **2 charges** and a Showstopper refunds one | a Challenge-mode `d15_fire_court` boss (page 12 names which) |
| `leg_encore_signet` | Encore Signet | ring | Grand Finale's cooldown resets once if it kills 3+ enemies (once per 180 s) | the end chest of any dungeon at **Depth 15+** (1.5%) |

### 9.2 Uniques

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_duellists_ribbon` | The Duellist's Ribbon | necklace | +6 DEX, +4% crit | Each Flair stack also gives +1% attack speed | `b_hollow_thane` The Hollow Thane (`d01_hollow_barrow` end boss) — Normal at its level; Challenge and Depth at 60 |
| `uq_saltstained_sabre` | Salt-stained Sabre | sabre | +10 DEX, +8% crit damage | Needle Flurry uses the sabre's `slash` instead of thrusts: a 90° arc, each hit to all enemies in it at 40% (`tag_area` added) | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss) |
| `uq_parade_gloves` | Parade Gloves | hands, light | +8 DEX, +5% dodge | Mocking Bow gives +2 Flair when cast | quest reward, `q_calling_swashbuckler_2` |
| `uq_red_sash` | Red Sash of the Harbour | legs, light | +8 DEX, +8% move | At 10+ Flair you move +15% extra and leave a red streak behind you | `b_hobb_the_bellringer` Hobb the Bellringer (`d11_saltdeep_cathedral` sub-boss) |
| `uq_harbour_buckler` | Harbour Buckler | off hand, buckler | +8 CON, +5% dodge | In Riposte Guard, a parry also staggers the attacker 0.4 s (non-boss) | `b_saltshell_matron` The Saltshell Matron (`d11_saltdeep_cathedral` sub-boss) |

### 9.3 Souls

A soul goes in a Soul socket (page 08) and adds a behaviour. Both need the wearer to be a **swashbuckler**.

| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_last_bow` | Soul of the Last Bow | armour — chest | class: swashbuckler | In **Riposte Guard**, when Poise reaches 5 your next parry is a **Showstopper Riposte**: **250% WD**, the attacker is Taunted 3 s, +3 Flair (once per 8 s) (`tag_physical` `tag_attack` `tag_melee`). | `b_warmaster_drogath` (`d09_warmasters_pit` end boss) on Challenge (3%); `b_sallow_king` world boss (2%) |
| `soul_spotlight` | Soul of the Spotlight | jewellery — necklace | class: swashbuckler | A Grandeur puts **Spotlight** on its target for 6 s: every party member gains **+8% critical chance** against it. | end chest at **Depth 15+** (1%); `b_glass_wyrm` The Glass Wyrm (Sunscar world boss, 2%) |

---

## 10. Voice and barks

`voiceFor({ role: 'swashbuckler', gender, seed })` (reuse `ROLE_VOICES.swashbuckler`: pitch 0.48,
tone 0.7, speed 0.6 — bright and quick). The Swashbuckler is the class with the most barks; the setting
`set.audio.class_barks` (page 04) can halve their frequency.

| Moment | Lines (Lingo pool `swashbuckler_*`) |
|---|---|
| Needle Flurry | "One, two—" · "Keep up!" |
| Showstopper | "Missed me!" · "Too slow, darling." · "Did you see that?" |
| Parry | "Ha! En garde!" · "Predictable." |
| Riposte Guard on | "Come on, then. All of you." · "I'll take this dance." |
| Grandeur | "And for my final trick—!" · "**Bow**, if you can still stand." |
| Mocking Bow | "Over here, you lumbering oaf!" |
| Low health | "A scratch… a large scratch." · "Healer — I'm bleeding on my good coat!" |
| Death | "Worth it…" |

---

## 11. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Weapon patterns | Farhold `js/weapons.js` `rapier`, `scimitar` (sabre), `dagger` patterns + `OFFHAND_DAMAGE` | basic attacks, Needle Flurry, uniques |
| Deflect aura | `spellfx.js` `STATUS_FX.deflect` | En Garde!, Riposte Guard parries |
| Emote bow | `avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS` | Mocking Bow |
| Parry clip, hit-stop | `chibi2-motion.js` `parry`; Farhold `js/combat-feel.js` | Riposte Guard |
| Look | Farhold `data/classes.json` `swashbuckler.look` (open_coat, knife_rig, goatee, rapier). **`class-outfits.json` has no `swashbuckler` entry** — one must be added (new) with an open coat, sash and a plumed hat; a buckler model is needed for the tank look (new; the Chibi 2 round shield scaled 0.6) | caster look |
| Emberveil 2 prototype ideas | `riposte` → En Garde! / Riposte Guard, `flourish` → Needle Flurry / Flair, `taunt` → Mocking Bow, `grandeur` → Grandeur / Grand Finale | ideas only |
| Not used | Farhold swashbuckler skills `eviscerate`, `charge`, `smoke`, `power_strike`, `whirlwind`, `execute` | replaced |
| New | Flair ribbon UI, Tempo bar, Showstopper timing test (a roll's dodge frames overlapping an attack's hit frame), Riposte Guard (chance avoidance, Poise), parryable marker on boss attacks (page 11), echo-duellist afterimage | (new) |
