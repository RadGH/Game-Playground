# Class: Swashbuckler (`swashbuckler`)

> *"If you are going to win, win beautifully. If you are going to lose — well, that is what the cape is for."*

**Page owner:** `06-CLASSES.md` + this file. Canon: [page 00](../00-OVERVIEW.md) §6 row 13.
**Status:** v0.1 draft, 2026-09-29. Documentation only — nothing is built.

### How to read the numbers on this page

| Term | Meaning |
|---|---|
| **WD** | Weapon damage: one average hit of the main-hand weapon, before armour (Farhold `rpg.strike` base). |
| **OH** | Off-hand weapon damage (Farhold `OFFHAND_DAMAGE` = 60% of its own WD, reuse `js/weapons.js`). |
| **Focus** | 0–100, regenerates **12 per second** (canon: fast, small pool). |
| **Flair** | the class gauge, 0–10 stacks (§2). |
| **Flourish** | a spell tagged as a flourish — it builds Flair. Marked ✦ below. |
| **Finisher** | a spell that spends Flair. Marked ◆ below. |
| **GCD** | 1.0 s global cooldown (proposed; page 05). |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A duellist who fights for an audience that is not there. Every flashy move earns **Flair**; Flair turns a finisher into a legend. Nimble, cocky, never where the blow lands. |
| Role | **Damage** (melee, single target with short leaps) |
| Armour | Light |
| Weapons | Rapier, sabre, sword in the main hand; dagger or a second light blade in the off hand (Farhold `weapons: ["sword", "dagger"]`, patterns `rapier` thrust-thrust-lunge 3.3 m, `scimitar`/sabre slash-slash-arc 2.7 m, `dagger` jab-jab-slash 2.0 m). Starter: **Duellist's Rapier + Parrying Dagger**. |
| Primary attribute | DEX |
| Resource | **Focus** + the **Flair** gauge |
| Companion | None. The crowd is imaginary; the applause is not (§2.3). |
| Playstyle | Weave flourishes and perfect dodges to stack Flair, keep the stacks up by never stopping, then spend them in a finisher. The class rewards *style*: rolling through an attack at the last moment is worth more than walking out of it. |

---

## 2. Class mechanic: **Flair**

### 2.1 The gauge

**0–10 Flair** (15 from Calling II). Each stack gives **+2% critical chance** and **+1% move speed**
(so 10 stacks = +20% crit, +10% move).

| Gains Flair | Amount |
|---|---|
| Each flourish (✦) | its own number (§3) |
| **Showstopper dodge** — a dodge roll that passes **through** an enemy attack or telegraph edge within **0.25 s** of it landing | **+2** (once per attack) |
| A parry (En Garde!) | +2 |
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
* A **Showstopper dodge** pops a small gold "✦ Showstopper!" float text over your head and a
  bright chime (setting `set.interface.swash_floaters`, default on).
* The Chibi 2 body shows Flair: 5+ stacks — the coat (`open_coat`) flutters as if in wind; 10 —
  a golden trail follows the blade (spellfx `physical` trail recoloured gold).

### 2.4 The calling quests (page 14 owns text; ids proposed)

| Level | Quest id | Name | Where | Grants |
|---|---|---|---|---|
| 6 | `q_swashbuckler_calling_first_bow` | **The First Bow** | Hearthvale — the Brightwater harvest fair; win a three-round duel in front of the village where points come from style (Showstoppers, parries), not damage | **Grandeur** (finishers at 10 Flair auto-crit) and **Showstopper dodges** |
| 20 | `q_swashbuckler_calling_applause` | **Applause** | Highcourt — duel through the capital's fencing hall ladder, five opponents, each with a telegraphed trick | Flair max **10 → 15**; a Grandeur **refunds 3 Flair**; Showstopper window 0.25 → 0.35 s |
| 40 | `q_swashbuckler_calling_standing_ovation` | **Standing Ovation** | The Drowned Coast — a sword fight across the masts of a sinking ship against a drowned captain (a solo arena with falling rigging as danger zones) | **Curtain Call**: after a Grandeur, **4 s** in which flourishes cost no Focus and build **double** Flair |

### 2.5 JSON shape

```json
{
  "id": "swashbuckler",
  "flair": { "maxByCalling": [10, 15, 15], "critPerStack": 0.02, "movePerStack": 0.01,
             "showstopper": { "window": [0.25, 0.35, 0.35], "gain": 2 },
             "decay": { "afterSeconds": 8, "every": 3 }, "stunLoss": 3 },
  "grandeur": { "at": 10, "alwaysCrit": true, "refund": 3 },
  "curtainCall": { "seconds": 4, "flourishFree": true, "flairMult": 2 }
}
```

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Kind | Cost | CD | Cast | Range | Shape | Does |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `swashbuckler_needle_flurry` | Needle Flurry | ✦ | 20 Focus | GCD | instant | 3.3 m | 40° arc | 3 × 55% WD, +1–2 Flair |
| 4 | `swashbuckler_curtain_cut` | Curtain Cut | ◆ | 30 Focus | 6 s | instant | 3.5 m | one target | 100% WD + 45% per Flair |
| 10 | `swashbuckler_en_garde` | En Garde! | ✦ | 15 Focus | 10 s | 1.2 s stance | self | front 120° | parry → 260% WD counter |
| 18 | `swashbuckler_chandelier_vault` | Chandelier Vault | ✦ | 25 Focus | 14 s | 0.5 s leap | 10 m | 3 m landing circle | 180% WD, +1 per enemy |
| 28 | `swashbuckler_mocking_bow` | Mocking Bow | ✦ | 20 Focus | 25 s | instant | self | 10 m circle | draws non-boss attacks 3 s, +40% dodge |
| 40 | `swashbuckler_grand_finale` | Grand Finale | ◆ | 40 Focus + ≥5 Flair | 60 s | 2.5 s sequence | 12 m | up to 5 enemies | 6 × 120% WD + 400% WD + 60% per Flair |

### 3.2 Details

**`swashbuckler_needle_flurry` — Needle Flurry** ✦ · slot 1 · 20 Focus · no cooldown (GCD) · instant · 3.3 m, 40° arc
* **Three thrusts**, 0.12 s apart, each **55% WD** (165% total) to the first enemy in the arc.
* **+1 Flair**, or **+2** if all three thrusts hit the same target.
* Looks: three bright thrust streaks (`impact` physical, small, silver), the rapier `thrust` clip ×3 at
  1.5× speed. Sound: three quick *tink-tink-tink* rings of steel.

**`swashbuckler_curtain_cut` — Curtain Cut** ◆ · slot 4 · 30 Focus · 6 s · instant · 3.5 m · one target
* **100% WD + 45% WD per Flair** spent (550% at 10, a Grandeur crit on top).
* At **5+ Flair** it also leaves **Bleed 6 s** (8% WD per second per Flair spent).
* Looks: a single wide diagonal slash that leaves a red "curtain" of light hanging in the air for 0.4 s
  (`impact` bleed, stretched). Grandeur: gold confetti + spotlight. Sound: a long *shhhing* of steel,
  a crowd gasp at 10.

**`swashbuckler_en_garde` — En Garde!** ✦ · slot 10 · 15 Focus · 10 s · stance for **1.2 s** · self, front 120°
* **Parries** the next melee hit **or** projectile from the front 120° during the stance: you take no
  damage and **counter for 260% WD** (+2 Flair).
* **Boss attacks** can be parried only if page 11 marks them "parryable" (they flash a gold spark on the
  weapon 0.4 s before landing). A parried boss hit is fully negated but the counter does 130%.
* If nothing is parried, **half the cooldown is refunded**.
* Status on you: `deflect` (reuse `STATUS_FX.deflect`). Looks: blade raised, a silver ring flashes on
  parry (`impact` physical crit). Sound: a bright *clang* and a scrape.

**`swashbuckler_chandelier_vault` — Chandelier Vault** ✦ · slot 18 · 25 Focus · 14 s · 0.5 s leap · to a ground point or enemy within **10 m**
* You flip through the air (**untargetable for 0.4 s** mid-leap — direct hits miss; ground effects you
  land in still hit) and land for **180% WD** in a **3 m** circle with a spin.
* **+1 Flair per enemy hit** (max 3).
* Looks: a somersault with the coat flaring, a silver arc on landing (`aoe` physical). Sound: whoosh,
  a coin-like *ting* per enemy hit.

**`swashbuckler_mocking_bow` — Mocking Bow** ✦ · slot 28 · 20 Focus · 25 s · instant · 10 m circle
* Non-boss enemies within 10 m **must attack you for 3 s** (a short taunt) — for pulling adds off a
  healer, not for tanking.
* You gain **+40% dodge chance for 3 s**; **every attack you dodge gives +1 Flair**.
* **Bosses** are not taunted; you still get the dodge bonus.
* Looks: a deep theatrical bow, hat sweep (an emote clip from Farhold's `CHIBI2_EMOTE_ANIMS`, reuse),
  a ring of mocking gold "!" marks pops over each taunted enemy. Sound: a whistle and a short fanfare.

**`swashbuckler_grand_finale` — Grand Finale** ◆ · slot 40 · 40 Focus + requires **5+ Flair** · 60 s · a **2.5 s** sequence · up to 5 enemies within **12 m**
* You dash between up to **5 enemies**: **6 strikes** spread across them, each **120% WD**, then a final
  pose on the first target: **400% WD + 60% WD per Flair** (1000% at 10, Grandeur crit on top).
* During the 2.0 s of dashes you are **immune to damage**; the final 0.5 s pose is **not** immune.
* Looks: the character blurs between targets (afterimages, the Chibi 2 body drawn 3× at 30% opacity),
  a spotlight beam and a burst of gold petals on the pose. Sound: a rising drumroll, a cymbal crash on
  the final strike, applause if Grandeur.

---

## 4. Alternate spells — the Grandeur versions

At **10+ Flair**, the two finishers flip their bar icons to gold **Grandeur** versions:

| Spell | Grandeur version | id | Change |
|---|---|---|---|
| Curtain Cut | **Final Curtain** | `swashbuckler_final_curtain` | always crits; the curtain of light stays 3 s and enemies passing through it take 80% WD |
| Grand Finale | **Encore** | `swashbuckler_encore` | always crits; after the pose you may press the key again within 2 s for one more dash + pose at 50% |

From Calling III, **Curtain Call** (4 s after a Grandeur) makes the three flourish buttons glow white:
they cost no Focus and give double Flair.

---

## 5. Rotation / how it plays

### 5.1 Solo
Needle Flurry to 4–5 Flair, Curtain Cut to finish a normal enemy. On elites: build to 10 with Flurry,
En Garde! on their telegraphed swing (+2), a Showstopper roll through their slam (+2), then a Grandeur
Curtain Cut. Chandelier Vault to open on a pack.

### 5.2 Dungeon
Stay on the boss's back; Flurry, weave Showstoppers through the tank-facing cone attacks' edges.
Mocking Bow is your "save the healer" button — adds that run to the healer will come to you for 3 s
while the tank picks them up. Grand Finale on packs of 3–5.

### 5.3 Raid
The Swashbuckler's damage depends on **not stopping**: Flair decays out of combat and is lost to stuns,
so learning each boss's stun is part of playing the class. In a movement phase, Showstopper dodges keep
Flair building while other melee lose damage.

### 5.4 Boss mechanics

| Mechanic | Swashbuckler answer |
|---|---|
| **Danger zone** | a dodge roll through the edge as it fills is a **Showstopper** (+2) — the class is paid to leave at the last moment |
| **Void zone** | Chandelier Vault (10 m) out; you still land where you aimed |
| **Parryable boss hits** | page 11 marks them with a gold spark 0.4 s early; En Garde! negates it |
| **Soak** | Grand Finale's 2 s immunity can carry a soak **only if** the pose ends inside — risky, 0.5 s exposed |
| **Adds on healer** | Mocking Bow |
| **Stuns** | −3 Flair; pre-empt with En Garde! or roll |
| **Interrupts** | none. The Swashbuckler is a pure damage duellist |

---

## 6. Talents

Ids `<spellid>_t<tier><a|b|c>`. Tiers 12 / 22 / 32 / 45.

| Spell | Tier | a | b | c |
|---|---|---|---|---|
| Needle Flurry | 1 | **Fourth Needle** — 4 thrusts at 45% | **Fan of Needles** — the arc widens to 90° and each thrust hits a different enemy | — |
| Needle Flurry | 2 | **Pinpoint** — the third thrust on the same target always crits | **Needle Bleed** — each thrust leaves a 3 s bleed (10% WD/s), stacks 3 | **Off-Hand Flurry** — adds 2 off-hand stabs at OH damage |
| Needle Flurry | 3 | **Step Flurry** — you step 2 m forward during it (a gap-closer) | **Backstep Flurry** — you step 2 m back after it | — |
| Needle Flurry | 4 | **Needlework** — at 10 Flair it hits 6 times | **Starlit Needles** — each thrust throws a silver needle 8 m for 30% WD | — |
| Curtain Cut | 1 | **Swift Curtain** — cooldown 6 → 3 s, keeps 2 Flair | **Heavy Curtain** — 45 → 60% per Flair, cooldown 6 → 10 s | — |
| Curtain Cut | 2 | **Draped** — becomes a 5 m, 120° arc that splits the damage | **Bloody Curtain** — the bleed happens at any Flair | **Curtain Rise** — kills refund all spent Flair |
| Curtain Cut | 3 | **Twin Curtain** — the off hand repeats it at 40% 0.3 s later | **Last Act** — +50% on targets below 30% health | — |
| Curtain Cut | 4 | **Velvet Rope** — the curtain stays 3 s as a wall enemies will not cross (non-boss) | **Bow and Exit** — after it, you dash 6 m backwards | — |
| En Garde! | 1 | **Long Guard** — stance 1.2 → 2.5 s, cooldown 10 → 14 s | **Double Parry** — parries 2 hits, counter each at 180% | — |
| En Garde! | 2 | **Disarming** — a countered enemy is Disarmed 3 s (non-boss) | **Riposte Lunge** — the counter is a 6 m lunge line | **Return to Sender** — a parried projectile flies back at its shooter for 200% WD |
| En Garde! | 3 | **Moving Guard** — you can walk at 50% during the stance | **Audience** — a parry gives +4 Flair instead of 2 | — |
| En Garde! | 4 | **Iron Wrist** — any hit you parry that page 11 marks parryable also stuns the boss 0.5 s (once per 30 s) | **Bait** — if the stance ends with nothing parried, you get +3 Flair anyway | — |
| Chandelier Vault | 1 | **Twin Vault** — 2 charges | **Grand Leap** — 10 → 16 m | — |
| Chandelier Vault | 2 | **Boot to the Face** — the first enemy is knocked down 1 s (non-boss) | **Rope Swing** — you can vault to an **ally** and they gain +20% dodge 4 s | — |
| Chandelier Vault | 3 | **Swinging Blade** — you strike everything under your flight path for 80% WD | **Aerial Flourish** — the landing gives 3 Flair flat | **Double Back** — press again within 3 s to vault back to your start |
| Chandelier Vault | 4 | **Chandelier Drop** — a spectral chandelier falls with you: 6 m circle, 300% WD | **Stage Dive** — the vault resets its cooldown on a Grandeur | — |
| Mocking Bow | 1 | **Wide Bow** — 10 → 16 m | **Deep Bow** — 3 → 5 s | — |
| Mocking Bow | 2 | **Heckle** — taunted enemies deal 20% less damage | **Showboat** — dodge +40 → +60% but you move 30% slower | — |
| Mocking Bow | 3 | **Encore Bow** — each dodge during it counters for 60% WD | **Protector's Bow** — an ally within 10 m of you also gains +20% dodge | — |
| Mocking Bow | 4 | **Rotten Tomatoes** — throws a spray at each taunted enemy: 50% WD + blinded 2 s | **Stand-In** — on bosses, taunts for 1.5 s (a real tank swap cover, 60 s internal cooldown) | — |
| Grand Finale | 1 | **Long Finale** — up to 8 enemies, 9 strikes | **Solo Finale** — one enemy only, every strike on it, +30% | — |
| Grand Finale | 2 | **Showstopper Finale** — the pose is also immune | **Bleeding Stage** — every strike leaves a bleed (20% WD/s, 6 s) | — |
| Grand Finale | 3 | **Cheap Seats** — requires 3 Flair instead of 5 | **Standing Room** — the finale's final pose knocks back every enemy within 6 m | — |
| Grand Finale | 4 | **Curtain Call Finale** — Curtain Call lasts 4 → 8 s after it | **Final Bow** — resets Mocking Bow and Chandelier Vault | — |

---

## 7. Class sets

Light armour (head, chest, hands, legs, feet) + a rapier/sabre or off-hand dagger.

### 7.1 `set_swashbuckler_crimson_regalia` — Crimson Regalia (levelling, 25–34)

Drops from `d07_thornheart` (head, hands, off-hand dagger `it_crimson_main_gauche`) and
`d09_warmasters_pit` (chest, legs, feet); Heroic at 60.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Needle Flurry gives +1 extra Flair when it crits | Needle Flurry |
| 4 | En Garde! refunds **all** of its cooldown on a successful parry | En Garde! |
| 6 | Curtain Cut at 10 Flair (Grandeur) leaves **5** Flair instead of 0 | Curtain Cut |

### 7.2 `set_swashbuckler_tidecaptains_finery` — Tidecaptain's Finery (endgame)

Drops from `r03_sunken_choir` (50) and, in Mythic, `r04_ember_court` (60).

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Showstopper dodges give +3 Flair and refund 20 Focus | the mechanic |
| 4 | Chandelier Vault has no Focus cost and its landing counts as a Showstopper | Chandelier Vault |
| 6 | Grand Finale can be cast at **any** Flair, and each Flair above 10 adds a 7th, 8th… strike (up to 11) | Grand Finale |

---

## 8. Legendaries and uniques

| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_gallants_last_word` | The Gallant's Last Word | rapier | Every **Grandeur** leaves an **echo duellist** (a gold Chibi 2 copy of you, 50% opacity) for 6 s that repeats your Needle Flurries at 50% | `r03_sunken_choir` boss 3 |
| `leg_captains_plumed_hat` | Captain's Plumed Hat | head, light | Flair no longer decays out of combat and you **keep 5 Flair** after a stun instead of losing 3 | Drowned Coast world boss |
| `leg_quicksilver_main_gauche` | Quicksilver Main Gauche | off-hand dagger | En Garde! becomes **passive**: every 8 s you automatically parry the next frontal hit (the stance key still works) | final boss of `d11_saltdeep_cathedral` (Heroic/Mythic+) |
| `leg_boots_of_the_last_dance` | Boots of the Last Dance | feet, light | Your dodge roll has **2 charges** and a Showstopper refunds one | `r04_ember_court` boss 4 |
| `leg_encore_signet` | Encore Signet | ring | Grand Finale's cooldown resets once if it kills 3+ enemies (once per 180 s) | `r05_veilspire` secret boss |

| id | Name | Slot / base | Fixed affixes | Power | Drop source |
|---|---|---|---|---|---|
| `uq_duellists_ribbon` | The Duellist's Ribbon | necklace | +6 DEX, +4% crit | Each Flair stack also gives +1% attack speed | `d01_hollow_barrow` final boss (Heroic/Mythic+ only at 60; a level-7 version on Normal) |
| `uq_saltstained_sabre` | Salt-stained Sabre | sabre | +10 DEX, +8% crit damage | Needle Flurry uses the sabre's `slash` instead of thrusts: a 90° arc, each hit to all enemies in it at 40% | `d02_drowned_mill` final boss |
| `uq_parade_gloves` | Parade Gloves | hands, light | +8 DEX, +5% dodge | Mocking Bow gives +2 Flair when cast | Highcourt fencing hall ladder reward (quest `q_swashbuckler_calling_applause`) |
| `uq_red_sash` | Red Sash of the Harbour | legs, light | +8 DEX, +8% move | At 10+ Flair you move +15% extra and leave a red streak behind you | `d11_saltdeep_cathedral` sub-boss |

---

## 9. Voice and barks

`voiceFor({ role: 'swashbuckler', gender, seed })` (reuse `ROLE_VOICES.swashbuckler`: pitch 0.48,
tone 0.7, speed 0.6 — bright and quick). The Swashbuckler is the class with the most barks; the
setting `set.audio.class_barks` (page 04) can halve their frequency.

| Moment | Lines (Lingo pool `swashbuckler_*`) |
|---|---|
| Needle Flurry | "One, two—" · "Keep up!" |
| Showstopper | "Missed me!" · "Too slow, darling." · "Did you see that?" |
| Parry | "Ha! En garde!" · "Predictable." |
| Grandeur | "And for my final trick—!" · "**Bow**, if you can still stand." |
| Mocking Bow | "Over here, you lumbering oaf!" |
| Low health | "A scratch… a large scratch." · "Healer — I'm bleeding on my good coat!" |
| Death | "Worth it…" |

---

## 10. Reuse notes

| Borrowed | From | How |
|---|---|---|
| Weapon patterns | Farhold `js/weapons.js` `rapier`, `scimitar` (sabre), `dagger` patterns + `OFFHAND_DAMAGE` | basic attacks, Needle Flurry, uniques |
| Deflect aura | `spellfx.js` `STATUS_FX.deflect` | En Garde! |
| Emote bow | Farhold `avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS` | Mocking Bow |
| Look | Farhold `data/classes.json` `swashbuckler.look` (open_coat, knife_rig, goatee, rapier). **`class-outfits.json` has no `swashbuckler` entry** — one must be added (new) with an open coat, sash and a plumed hat | caster look |
| Emberveil ideas | `riposte` → En Garde!, `flourish` → Needle Flurry / Flair, `taunt` → Mocking Bow, `grandeur` → Grandeur / Grand Finale | ideas only |
| Not used | Farhold swashbuckler skills `eviscerate`, `charge`, `smoke`, `power_strike`, `whirlwind`, `execute` | replaced |
| New | Flair ribbon UI, Showstopper timing test (a roll's i-frames overlapping an attack's hit frame), parryable marker on boss attacks (page 11), echo-duellist afterimage | (new) |
