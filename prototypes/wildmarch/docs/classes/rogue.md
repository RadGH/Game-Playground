# Rogue — class design (`rogue`)

> *"Everybody owes. I just collect."*

**Status:** v0.1 draft, 2026-09-29. Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00): role **Damage**, **light** armour, resource **Focus**, mechanic **Combo points +
stealth — openers, finishers**, spell slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**,
talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit. The rogue dual-wields; a spell that says "two stabs" uses one hit from
  each hand, and the off hand hits at **60%** (reuse: Farhold `OFFHAND_DAMAGE = 0.60`, `js/weapons.js`) —
  *already included* in the numbers below. Numbers are **final** (Farhold's `effectiveMult` is folded in).
- **Focus**: pool **100**, regenerates fast (page 05; this page assumes **12 a second**).
- **From behind** = your hit lands in the target's rear 100° (reuse: dagger `backstab` trait arc,
  `WEAPON_TRAITS.dagger`). Basic dagger attacks from behind already deal ×2.2 in Farhold; that trait stays.
- **Combo points (CP)** live on the **rogue**, not on the target, so switching targets keeps them.
- Statuses (stun, silence, bleed, poison, blind, snare) are page 05's.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A knife in the dark with a ledger in its pocket. Everything it hits owes it something. |
| Role | **Damage** (melee, burst) |
| Armour | light |
| Weapons | daggers, dual-wielded (reuse: `WEAPON_PATTERNS.dagger` — jab, jab, slash every 0.34 s) |
| Primary attribute | DEX (secondary STR) |
| Resource | **Focus** + **combo points** (0–5, 7 at level 40) |
| Companion | none |
| Starting kit | two daggers, light chest, light boots (reuse: Farhold `classes.json` `rogue`, `offStarter: dagger`) |

**Playstyle in three sentences.** **Builders** add combo points, **finishers** spend all of them for a hit
that grows with each point, and the rogue's rhythm is build-build-spend. From the level 6 calling it can
**stealth** and open a fight with an **ambush** (a stun and three free points), and later slip back into
the dark in the middle of one. The rogue has the most ways to *not be hit* of any damage class — a blinding
cloud, an immune roll, a threat drop — and the most burst when a target is stunned.

**Original hook:** "200% Backstab on stunned targets. Death Mark makes enemies take 50% more damage from all
sources." — kept as Twin Needles (×2 on a stunned target) and Deathwarrant (up to +50% from you; see §3.2
for why it is smaller from everyone else).

---

## 2. Class mechanic — combo points and stealth (new)

### 2.1 Combo points (level 1)

| Rule | Value |
|---|---|
| Cap | **5** (7 from calling 40) |
| Builders | Twin Needles (+2, +3 from behind), Nightfall Ambush (+3), Knife Tumble (+1 per enemy passed, max 3) |
| Finishers | Open the Ledger, Deathwarrant — spend **all** points |
| Lifetime | 12 s after the last point was gained, then all drop |
| Overflow | points past the cap are lost (a talent keeps them) |

### 2.2 Stealth (calling 6)

- **Enter**: the stealth key (page 02; suggest `Q`), only **out of combat**, 1 s to fade.
- While stealthed: **75% move speed**; enemies notice you within **3 m in front / 1.5 m behind** (elites 4 m,
  bosses cannot be approached unseen once the fight has started); breaks when you attack, cast, loot, interact,
  or take direct damage.
- **Openers** (Nightfall Ambush) get their full effect only from stealth.
- **Unseen**: the first 2 s after stealth breaks, your hits cannot be dodged and crit +30%.
- Party members see a stealthed rogue at 40% opacity; enemies see nothing (a faint shimmer at 2 m).

### 2.3 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_rogue_calling_06` "Lights Out in Brightwater" | Brightwater, Hearthvale — recover a stolen ledger from the smugglers under the mill without being seen | **Stealth** and **Unseen** (§2.2) |
| 20 | `q_rogue_calling_20` "The Oasis Debt" | Oasis of Tamar, Sunscar — collect three debts from three people who do not want to pay | **Slip Away**: a mechanic action (key `Shift+Q`), **90 s** cooldown — in combat, drop **all threat** and enter stealth for **3 s** (damage-over-time does not break it; nothing can target you) |
| 40 | `q_rogue_calling_40` "Settling Accounts" | Saltmarch, Drowned Coast — a heist in a drowned counting-house | **The Long Ledger**: cap **7** points; points 6 and 7 count **double** for every finisher (7 points = 9 for damage) |

### 2.4 Gauge and HUD (new; page 03 `hud_combo`)

- **Five coin pips** (seven after calling 40) above the Focus bar, stamped with a small knife. They fill
  left to right; the 6th and 7th are gold-rimmed ("double").
- A 12 s timer line under the pips (flashes at 3 s).
- **Stealth**: the screen edges darken with a soft vignette, the minimap dims, and an eye icon shows how
  close the nearest enemy is to noticing you (closed → half-open → open).
- **Slip Away** cooldown: a small hooded icon beside the pips.
- Tooltip: "4 combo points. Your next finisher spends all of them. They drop 12 s after the last one."

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Focus | Cooldown | Cast | Shape | Headline |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `rogue_twin_needles` | Twin Needles (builder) | 20 | — | instant | melee 2.2 m | 2 stabs = 110% WD, +2 CP (+3 from behind), ×2 on stunned |
| 2 | 4 | `rogue_open_the_ledger` | Open the Ledger (finisher) | 25 | — | instant | melee 2.2 m | 50% + 70% per CP, bleed 2 s per CP |
| 3 | 10 | `rogue_nightfall_ambush` | Nightfall Ambush (opener) | 40 | 20 s outside stealth | instant | teleport behind, 12 m | 300% WD, stun 2 s, +3 CP |
| 4 | 18 | `rogue_ashpowder` | Ashpowder | 30 | 30 s | instant | 6 m circle on you, 6 s | blind 4 s, −50% threat, +30% dodge inside |
| 5 | 28 | `rogue_knife_tumble` | Knife Tumble | 15 | 12 s | instant | 8 m roll | immune 0.4 s, 80% WD to each passed, +1 CP each |
| 6 | 40 | `rogue_deathwarrant` | Deathwarrant (finisher) | 35 | 60 s | instant | one enemy, melee | +10% taken from you per CP, 8 s, then a bill |

### 3.2 Spell details

**1. `rogue_twin_needles` — Twin Needles** (level 1) — builder
- **20 Focus**, no cooldown (only the global cooldown, page 05), melee **2.2 m**, single target.
- Two stabs: **70% WD** (main hand) + **40% WD** (off hand, the 60% rule included) = **110% WD**.
- **+2 CP**, or **+3 CP** from behind.
- Against a **stunned** target: **×2** damage.
- Looks: Chibi 2 `offThrust` then `stab`; two thin `slash` sprites; `spark` on hit.
- Sound: `melee.swing` ×2 quick, `melee.hit` ×2.

**2. `rogue_open_the_ledger` — Open the Ledger** (level 4) — finisher
- **25 Focus**, no cooldown, melee **2.2 m**, single target. Needs **1+ CP**.
- Damage **50% WD + 70% WD per CP** (5 CP = 400%; 7 CP at level 40 = 9 counted = 680%).
- **Bleed** for **2 s per CP** at **15% WD a second** (page 05 bleed; refreshes, does not stack with itself).
- Looks: Chibi 2 `crossSlash`; a red `slash` X on the target, `bleed` drops.
- Sound: `melee.crit` (always the heavy variant) + `status.bleed.apply`; a coin clink per CP spent.

**3. `rogue_nightfall_ambush` — Nightfall Ambush** (level 10) — opener
- **40 Focus**. **From stealth:** no cooldown — teleport behind an enemy within **12 m**, **300% WD**, **stun 2 s**
  (boss: no stun; the hit gets +50% crit damage instead), **+3 CP**.
- **Outside stealth:** usable once every **20 s**: teleport behind within **8 m**, **150% WD**, **+1 CP**, no stun.
  This makes it the rogue's gap-closer.
- Looks: you dissolve into `wisp` + `smoke` sprites (spellfx element `shadow`) and appear behind the target;
  Chibi 2 `stab` from above; `STATUS_FX.stun` stars on the target.
- Sound: `spell.shadow.launch` (whoosh in), `melee.crit`, `status.stun.apply`.

**4. `rogue_ashpowder` — Ashpowder** (level 18)
- **30 Focus**, cooldown **30 s**, instant. A **6 m circle** cloud on you, lasting **6 s**.
- Enemies inside when it bursts are **blinded 4 s** (they miss 50% of attacks); anything that was **casting is
  interrupted**. Your threat on every enemy inside drops **50%**.
- You and allies inside the cloud get **+30% dodge chance** while inside.
- Looks: a grey-orange `smoke` + `puff` cloud (normal blending so it reads in daylight), `STATUS_FX.blind` on
  enemies.
- Sound: a soft thump + hiss (`steam.hiss`), `status.blind.apply`.

**5. `rogue_knife_tumble` — Knife Tumble** (level 28) — **the movement tool**
- **15 Focus**, cooldown **12 s**, instant. Roll **8 m** in the direction you are moving (forward if standing).
- **Immune to all damage for 0.4 s** of the roll (you can roll *through* a danger zone's filling edge or a
  void zone).
- **80% WD** to every enemy you pass through; **+1 CP** per enemy passed (max 3).
- Looks: Chibi 2 `jump` compressed into a roll (new clip `roll` — see reuse notes), `streak` sprites, blades
  flashing (`slash` sprites) at each enemy passed.
- Sound: cloth whoosh (`travel.step.soft` ×2) + `melee.hit` per enemy.

**6. `rogue_deathwarrant` — Deathwarrant** (level 40) — finisher
- **35 Focus**, cooldown **60 s**, melee, single target, needs **1+ CP**. Lasts **8 s**.
- The target takes **+10% damage from you per CP** spent (5 CP = +50%, the original hook; 7 CP = +90% because
  6 and 7 count double) and **+3% from everyone else per CP** (+15% at 5).
- **The bill**: when the warrant ends, the target takes **25% of all the damage you dealt it during the
  warrant** again, as one hit.
- *(design note)* The original "+50% from all sources" would be +50% for twenty raiders; the everyone-else
  share is kept small so one rogue is welcome but not required.
- Looks: a black-and-red `rune_ring` stamped under the target, a floating wax-seal `skull` sprite above it
  (`STATUS_FX.curse` style but red), a big `slash` when the bill lands.
- Sound: `status.marked.apply` + a quill scratch (new), `melee.crit` + coins falling for the bill (`loot.rare`).

### 3.3 Rotation / how it plays

- **Solo:** stealth → Nightfall Ambush (stun, 3 CP) → Twin Needles while it is stunned (×2, and you are
  behind it: +3 CP) → Open the Ledger at 5. Ashpowder when a second enemy joins. Knife Tumble to leave, or to
  pass through a pack for points.
- **Dungeon:** open the boss with an ambush (no stun, +50% crit damage) or use the out-of-stealth ambush to
  get behind. Keep the Ledger's bleed rolling, Deathwarrant on cooldown with 5 CP. Ashpowder interrupts a pack's
  casters and lowers your threat after a big burst. Slip Away (20+) if the tank loses a mob to you.
- **Raid:** stand behind the boss; the loop is Needles → Needles → Ledger, with Deathwarrant lined up for the
  raid's burn phase (all 7 points at 40+). Knife Tumble and Ashpowder are for the mechanics.

### 3.4 Boss mechanics

| Mechanic (page 11) | Rogue |
|---|---|
| Void / danger zones | **Knife Tumble** (0.4 s immunity, 8 m) — roll through, not around. Plus the dodge roll. |
| Frontal cones / cleaves | Rogues fight from behind by design; they are rarely in the cone. |
| Soak (orange) | Counts as one soaker; light armour. Timing Knife Tumble so its 0.4 s immunity covers the moment the soak lands is a skill trick — proposed rule: an immune player still counts toward the pips and takes nothing (page 11 owns it; see the report). |
| Aggro | **Slip Away** (20+) drops all threat; Ashpowder drops 50% on everything inside. |
| Interrupts | Ashpowder interrupts every caster in 6 m (30 s). Talents add a 10 s interrupt (**Pommel Jab**) and a silence (**Garrote**). |
| Adds | Ashpowder blinds them; the out-of-stealth ambush reaches a caster 8 m away. |
| Buffs on the boss | Tier-3 **Pickpocket** (Nightfall Ambush) steals one buff. |
| Stuns | Bosses are stun-immune, so the ×2-on-stunned bonus is for adds and the open world. |

---

## 4. Alternate spells

| When | Slot | Becomes |
|---|---|---|
| Stealthed | 3 | **Nightfall Ambush** at full effect (12 m teleport, 300%, stun, +3 CP, no cooldown). |
| Not stealthed | 3 | **Quick Ambush** (the same spell id with its outside-stealth numbers: 8 m, 150%, +1 CP, 20 s). The icon loses its moon. |

---

## 5. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.

### Twin Needles
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Flurry** — four stabs of 35% WD (two per hand), +2 CP (+3 behind). | **Long Needle** — a thrown needle, 15 m, 110% WD, +1 CP (a ranged builder). | **Hamstring** — the second stab snares 40% for 4 s. |
| 2 (22) | **Pommel Jab** — a third hit (30% WD) that **interrupts**, at most once per 10 s. | **Venom Needles** — each stab adds poison, stacking to 5. | **Opportunist** — any crowd-controlled target (stun, root, blind, snare) counts as "from behind". |
| 3 (32) | **Quick Hands** — every 3rd cast refunds 20 Focus. | **Spare Coin** — a point past the cap is kept as a Spare and added after your next finisher. | **Circling** — each cast shifts you 1.5 m around the target toward its back. |
| 4 (45) | **Sewing Machine** — hold the key: a stab every 0.15 s for 1.2 s (8 × 40% WD), +1 CP every 2 stabs. | **Needle Rain** — each cast also throws a needle at the 2 nearest other enemies for 40% WD. | — |

### Open the Ledger
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Settle Up** — no bleed; +30% damage on the hit instead. | **Compound Interest** — bleed 3 s per CP; each tick hits 10% harder than the last. | **Open Book** — hits every enemy in a 3 m, 80° cone at 60%. |
| 2 (22) | **Paid in Full** — a kill refunds 3 CP. | **Lien** — when the target dies, its bleed jumps to the nearest enemy. | **Commission** — heals you 2% max health per CP. |
| 3 (32) | **Collections** — on a bleeding target, the remaining bleed damage is added to this hit at once and a new bleed starts. | **Kidney Note** — at 5+ CP, stun 1 s (boss: nothing). | **Double Entry** — each CP has a 20% chance not to be spent. |
| 4 (45) | **Foreclosure** — ×2 on a target under 30% health. | **Audit** — the target is **Audited** 6 s: your next Deathwarrant on it counts as 5 CP without spending any. | — |

### Nightfall Ambush
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Garrote** — **silence** 3 s instead of the stun (works on bosses as an interrupt). | **Cheap Shot** — stun 3 s, damage 150%. | **Long Shadow** — teleport reach 20 m from stealth, 12 m outside it. |
| 2 (22) | **Shade** — after the ambush, enemies cannot target you for 2 s. | **Bloodfall** — applies 3 stacked bleeds. | **Double Back** — press again within 3 s to return to where you started. |
| 3 (32) | **Full Purse** — the ambush gives 5 CP. | **Pickpocket** — steals gold (open world) and one buff from the target (it moves to you for its remaining time, or is simply removed if it cannot). | **Night Owl** — the outside-stealth version has full numbers, but a 30 s cooldown. |
| 4 (45) | **Clean Exit** — if the target dies within 5 s, you drop back into stealth. | **Twin Shadow** — also hits (and stuns) one more enemy within 6 m. | — |

### Ashpowder
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Thrown Powder** — placed anywhere within 20 m. | **Choking Powder** — also silences 2 s. | **Wide Powder** — 10 m circle. |
| 2 (22) | **Vanishing Powder** — you enter stealth for 3 s, even in combat. | **Ash Veil** — allies inside also drop 50% threat. | **Deep Ash** — blind 6 s. |
| 3 (32) | **Smoke Wall** — enemy projectiles stop at the cloud's edge. | **Ember Ash** — the cloud burns: 20% WD a second. | **Two Pouches** — 2 charges. |
| 4 (45) | **Night Inside** — while you are inside, Nightfall Ambush works as if you were stealthed. | **Clinging Dust** — the cloud follows you. | — |

### Knife Tumble
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Double Tumble** — 2 charges. | **Back Tumble** — always rolls away from where you face. | **Long Tumble** — 12 m. |
| 2 (22)\* | **Caltrop Trail** — leaves blades on the path for 4 s (bleed). | **Slip Free** — breaks roots and snares. | **Shade Tumble** — ends in 1 s of stealth. |
| 3 (32) | **Behind You** — ends behind the first enemy passed, facing its back. | **Second Breath** — each enemy passed restores 10 Focus. | **Crossing Knives** — throws a knife at every enemy passed for 60% WD. |
| 4 (45) | **Endless Tumble** — a kill within 3 s resets it. | **Vanishing Act** — the immunity lasts 1 s. | — |

\* unlocks at 28: tiers 1–2 open together.

### Deathwarrant
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Open Warrant** — needs no CP: counts as 5 CP but lasts 5 s. | **Two Warrants** — two targets, each at half value. | **Signed in Blood** — also bleeds for the full 8 s. |
| 2 (22)\* | **Bounty** — a kill under the warrant restores all CP and 50 Focus. | **Hunted** — the target cannot stealth or turn invisible and is slowed 20%. | **Wanted Poster** — everyone else's share is +5% per CP (not +3%). |
| 3 (32)\* | **Final Notice** — the bill is 40%. | **Pass It On** — if the target dies, the warrant moves to the nearest enemy with its remaining time. | **Serve Papers** — cast from 25 m. |
| 4 (45) | **Executioner's Due** — if the target is under 20% health when it ends: executed (non-boss) or a 200% WD bill on top (boss). | **Standing Warrant** — lasts 12 s. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 6. Class sets

### `set_rogue_ledgerkeeper` — The Ledgerkeeper's Leathers (dungeon set, item level 60)
Heroic: head `d06_sandsworn_vault` final boss, chest `d11_saltdeep_cathedral` final boss, legs `d09_warmasters_pit`
boss 2, hands `d12_unmade_workshop` boss 3, feet `d10_rimefang_caverns` final boss, necklace
(`it_ledgerkeeper_seal`) `d13_cindergate` final boss.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Twin Needles from behind gives **+4** CP. | Twin Needles |
| 4 | Open the Ledger's bleed makes the target take +5% from your Twin Needles per CP it was cast with. | Open the Ledger, Twin Needles |
| 6 | Every finisher has a 10% chance per CP to give **Slip Away** its cooldown back. | Slip Away, finishers |

### `set_rogue_nightfall` — Shroud of the Long Night (raid set)
`r03_sunken_choir` bosses 2–7, Normal and Mythic; token from `r05_veilspire` boss 6.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Nightfall Ambush outside stealth has a 12 s cooldown. | Nightfall Ambush |
| 4 | Knife Tumble through an enemy's back gives Unseen (2 s, uncatchable crits). | Knife Tumble |
| 6 | Deathwarrant's bill is paid **twice**: at the end and again 3 s later. | Deathwarrant |

---

## 7. Class legendaries and uniques

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_debt_collector` | The Debt Collector | dagger | **Collected** — every finisher adds 10% of its damage to a store; Deathwarrant's bill adds the whole store. | `r04_ember_court` boss 6 |
| `leg_twinfang` | Twinfang | dagger (paired: both hands must be Twinfang halves — one drop gives both) | **Mirrored** — Twin Needles' off-hand stab deals 100% instead of 40%, and from behind counts both stabs as backstabs. | `d11_saltdeep_cathedral` final boss, Heroic / Mythic+ |
| `leg_cloak_of_no_moon` | Cloak of No Moon | light chest | **Moonless** — stealth has no speed penalty, and Slip Away's cooldown is 45 s. | the world boss of `drowned_coast` (page 13) |
| `leg_ashen_tallybag` | The Ashen Tally-Bag | light legs | **Ash Ledger** — every enemy blinded by Ashpowder gives 1 CP (ignores the cap, max 3 over it). | `r02_glacier_throne` boss 4 |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_mill_rats_knuckles` | Mill-Rat Knuckles | light hands | Twin Needles against a snared or rooted target gives +1 CP. | `d02_drowned_mill` final boss |
| `uq_tumblers_anklets` | Tumbler's Anklets | light feet | Knife Tumble's immunity lasts 0.6 s and it goes 10 m. | `d05_glass_tombs` boss 2 |
| `uq_sealed_writ` | The Sealed Writ | ring | Deathwarrant lasts 10 s; everyone else's share is +4% per CP. | `d14_ashen_reliquary` boss 2 |

---

## 8. Voice and barks

- Timbre: `shared/voices.js` role `rogue` (pitch 0.55, breath 0.35, speed 0.60 — quick and breathy).
- Lingo tag `class:rogue`; whispered lines are played at 60% volume while stealthed.

| Moment | Lines |
|---|---|
| Enter stealth | (whisper) "Quiet now." |
| Nightfall Ambush | "Surprise." · "Behind you." |
| Twin Needles from behind | (a small laugh) |
| Open the Ledger | "Paid." · "Settled." |
| Deathwarrant | "Your name's on the list." · "Time to pay." |
| The bill lands | "Interest." |
| Ashpowder | "Can't see me." |
| Slip Away | "I was never here." |
| Critical hit | "Right between." |
| Low health | "Getting hot—" · "Need an exit!" |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Dagger rhythm, backstab arc, off-hand 60% | `prototypes/farhold/js/weapons.js` `WEAPON_PATTERNS.dagger`, `WEAPON_TRAITS.dagger`, `OFFHAND_DAMAGE` | basic attacks and "from behind" |
| Timbre `rogue` | `shared/voices.js` | voice |
| Look (hood, strapped leather, knife rig, `fh_daggers` + `fh_dagger`) | `avatar-3d/data/class-outfits.json` `classes.rogue` | default outfit |
| Clips `stab`, `offThrust`, `crossSlash`, `flurry`, `jump` | `avatar-3d/js/chibi2-motion.js` | spells; a new `roll` clip is needed for Knife Tumble (and is useful for everyone's dodge roll — page 17) |
| Visual ideas of Farhold `eviscerate`, `shadowstep`, `smoke`, `execute` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| `STATUS_FX.stun`, `.blind`, `.bleed`, `.curse`; `smoke`/`wisp` sprites | `avatar-3d/js/spellfx.js`, `assets/data/fx/` | ambush, powder, ledger, warrant |
| Emberveil `backstab`, `poison_blade`, `shadow_step`, `death_mark` | `prototypes/emberveil/data/skills.json` | design ancestry |
| Sound ids | `sfx/data/catalog.json` | as listed; the quill scratch is new |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `combo`, `stealth`, `finisher` | talent cards |
