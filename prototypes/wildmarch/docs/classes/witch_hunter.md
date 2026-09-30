# Witch Hunter (`witch_hunter`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 23.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **WD** = weapon damage: one shot of the crossbow, or one swing of the sword, before armour.
- **Focus**: pool **100**, refills **10 a second** (canon §6).
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- "Magic buff" = an enemy status of kind `buff` whose element is not `physical` (page 05 owns the dispel list).
- "Group" = 5-player party. "Raid group" = your 5 on the raid frame (page 15).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A grim hunter in a black trench coat and wide-brimmed hat who tracks down cultists, witches, demons and the walking dead, builds a case against them, and passes sentence. |
| Role | **Damage** (canon §6). No second role — but it is the class that **breaks enemy magic** for the group. |
| Armour | Medium |
| Weapons | **Crossbow** (ranged build; reuse: `js/weapons.js` `crossbow`, reload 1.25 s, pierces 2 bodies) **or** **sword** + **dagger** off hand (melee build). Farhold starts the class with a shortbow; Wildmarch starts it with a **light crossbow** (`it_light_crossbow`, canon change request: a one-handed hand-crossbow base). |
| Primary attribute | DEX |
| Resource | **Focus** + **Silver** (0–6 charges) + **Evidence** (0–100, kept **per enemy**). |
| Companion | None. |

**Playstyle in three sentences.** The witch hunter hits a target again and again to build **Evidence**
against it; interrupting its spells and stripping its magic builds Evidence fastest. At 100 Evidence the
target is **Condemned**, and the **Verdict** lands for enormous damage. Silver charges empower shots, and
every spell has a second use against magic — purge a buff, silence a caster, shield the group from spells.

---

## 2. Class mechanic — Silver and the Verdict

### 2.1 Silver

| Rule | Value |
|---|---|
| Charges | **3** at level 1 · **4** after `q_witch_hunter_calling_1` (6) · **6** after `q_witch_hunter_calling_2` (20) |
| Refill | 1 charge every **4 s**, in or out of combat |
| Spent by | **Silver Quarrel** (1, automatically, while **Silvered Shots** is on), **Verdict** (3) |
| Toggle | **Silvered Shots** on/off — click the Silver gauge or press `Z` + `1` (the Class Alt key, page 02). Off saves charges for Verdict |
| Not ammunition | Silver is a gauge. Basic crossbow attacks never use it (Farhold has no ammunition anywhere; that stays) |

### 2.2 Evidence and Condemned (from the level-6 calling quest)

| Rule | Value |
|---|---|
| Kept | **per enemy**, per witch hunter (two hunters build separate cases) |
| Gain | any of your spell hits **+8**; a Silvered hit **+15**; each magic buff you purge **+25**; each cast you interrupt **+30** |
| Branded target | all Evidence ×1.5 (Brand of Guilt, §3) |
| Bosses and rare elites | gain at **one third** of the rate |
| Decay | −5 a second after 6 s without one of your hits |
| At 100 | the enemy is **Condemned** for **10 s**: it takes **+10% damage from you**, and **Verdict** can be cast on it |

**Gauge UI** (`hud_class_gauge`, new — add to page 03): six silver bullets in a row under the health bar
(dull grey when empty, bright silver when full; a small toggle lamp at the end shows Silvered Shots on/off).
Evidence is drawn **on the enemy's own target frame** as a thin silver bar under its health, with a
**wax-seal icon** that stamps down when it hits 100 (Condemned). A Condemned enemy also carries a floating
silver noose sigil visible to you only.

### 2.3 Witchsight — the class key

**`witch_hunter_witchsight` — Witchsight** (class key, proposed `R`; from the level-20 calling quest).
- **Cost** 20 Focus · **Cooldown** 30 s · **Cast** instant · **Duration** 10 s · **Range** 30 m around you.
- **Effect** reveals **invisible and stealthed** enemies within 30 m to you **and your group**. Every enemy's
  magic buffs are shown as icons above it, and enemy **casters** are outlined in violet. Hexbreak's range
  becomes 26 m while it is on.
- **Looks like**: the world tints cold grey-blue at the screen edge; revealed enemies glow white.
- **Sound**: a low bell, then a whisper under the music for 10 s.

### 2.4 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_witch_hunter_calling_1` "The First Case" | `npc_inquisitor_kreel`, Brightwater chapel | Question three villagers, find the hex-bag, and track a hedge witch to the Hollow Barrow's entrance | **Evidence / Condemned** (the +10% applies at once; the **Verdict** spell itself opens at level 40), Silver max 4 |
| 20 | `q_witch_hunter_calling_2` "Eyes That See" | Inquisitor Kreel, Oasis of Tamar | Hunt an invisible cult in the Sunscar glass tombs' outer halls using a borrowed lens | **Witchsight**, Silver max 6 |
| 40 | `q_witch_hunter_calling_3` "The Final Verdict" | Inquisitor Kreel, Saltmarch tribunal | Try and sentence a drowned priest: interrupt his three great rites and Verdict him | **Final Verdict** (below) |

Level 1–5 has no Evidence: the class plays as a straight marksman until the first calling quest.

**Final Verdict** (calling 3 rule):
- A Condemned enemy that dies spreads **50 Evidence** to every enemy within 10 m.
- **Silver Reflection**: once every 20 s, the first harmful **single-target magic** spell aimed at you is sent
  back at its caster (never a boss mechanic, page 11).

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `witch_hunter_silver_quarrel` | Silver Quarrel | 20 Focus (+1 Silver) | — | instant | 45 m (30 m thrown) | bolt | 150% WD, +40% Silvered, Evidence |
| 2 | 4 | `witch_hunter_hexbreak` | Hexbreak | 25 Focus | 12 s | instant | 20 m | line 1.5 m wide | 90% WD holy, purge 1 magic buff each |
| 3 | 10 | `witch_hunter_brand_of_guilt` | Brand of Guilt | 20 Focus | 20 s | instant | 40 m | one enemy | Branded 12 s: +6% group damage, Evidence ×1.5 |
| 4 | 18 | `witch_hunter_salt_circle` | Salt Circle | 30 Focus | 45 s | instant | self | ground circle 8 m | allies inside −20% magic damage, 8 s |
| 5 | 28 | `witch_hunter_inquest_leap` | Inquest Leap | 30 Focus | 16 s | instant leap | 14 m | one enemy | 200% WD, **interrupt**, +30 Evidence |
| 6 | 40 | `witch_hunter_verdict` | Verdict | 40 Focus + 3 Silver | 30 s | 0.8 s | 45 m | one Condemned enemy | 900% WD holy |

### 3.2 The spells in full

**`witch_hunter_silver_quarrel` — Silver Quarrel** · slot 1 · level 1
- **Cost** 20 Focus; +1 Silver if Silvered Shots is on · **Cooldown** none (GCD) · **Cast** instant (it does
  not use the crossbow's reload) · **Range** 45 m with a crossbow; **30 m thrown silver knife** with a sword ·
  **Shape** bolt, pierces 1 extra body.
- **Effect** 150% WD. **Silvered**: +40% (210%), and +15 Evidence instead of +8. **+15% damage against
  demons, undead and casters** (page 10 tags `demon`, `undead`, `caster`) — this is the class-wide rule for
  every witch hunter spell.
- **Looks like**: a silver bolt with a thin white trail (spellfx `physical`, `arrow` shape, recoloured silver
  `#d8dce8`); a Silvered bolt adds a pale holy spark trail (`holy_mote`).
- **Sound**: a crossbow thunk (or a knife whistle) and a bright ring of metal on hit.

**`witch_hunter_hexbreak` — Hexbreak** · slot 2 · level 4
- **Cost** 25 Focus · **Cooldown** 12 s · **Cast** instant · **Range** 20 m · **Shape** a line 1.5 m wide.
- **Effect on enemies** 90% WD as holy to everything in the line, and **purges one magic buff** from each
  enemy hit. For each buff purged: **+25 Evidence**, and a **non-boss** enemy is **Silenced** (reuse: spellfx
  status `silence`) for 1.5 s.
- **Effect on an ally** (aim at an ally instead): removes **one curse or magic harmful status** from them (never
  a mechanic status, page 11). No damage.
- **Looks like**: a flat wave of white salt crystals skidding along the ground (spellfx `beam`, holy, width 1.5,
  with `ice_shard` sprites recoloured white); a purged buff shatters off the enemy as glass.
- **Sound**: a sharp hiss of salt and a glass crack per purge.

**`witch_hunter_brand_of_guilt` — Brand of Guilt** · slot 3 · level 10
- **Cost** 20 Focus · **Cooldown** 20 s · **Cast** instant · **Range** 40 m · **Shape** one enemy.
- **Effect** **Branded** (new status) for 12 s: it takes **+6% damage from your group**, every Evidence you
  gain on it is **×1.5**, and it **cannot turn invisible** (revealed if it is). One Brand per witch hunter.
- **Stacking**: Branded from two witch hunters does not stack (+6% once). It is a different status from the
  ranger's marks and the tactician's Designated, and stacks with them.
- **Looks like**: a glowing silver sigil burns into the target's chest and floats over its head (spellfx status
  `marked`, recoloured silver, custom `fx_brand_sigil` sprite).
- **Sound**: a hot-iron hiss.

**`witch_hunter_salt_circle` — Salt Circle** · slot 4 · level 18
- **Cost** 30 Focus · **Cooldown** 45 s · **Cast** instant · **Range** self · **Shape** a ground circle, 8 m radius, at your feet, lasts **8 s** (it stays where you poured it).
- **Effect** allies inside take **20% less non-physical damage** (magic: fire, ice, shadow, arcane, holy,
  lightning, poison, nature). Enemies inside **cannot turn invisible or teleport**. A non-boss enemy that
  starts a cast inside is **Silenced** for 2 s (once per enemy per circle).
- **Boss rules**: the 20% applies to boss magic, **including Void zone ticks**, but **never** to Soaks or to
  anything flagged `unavoidable` (page 11).
- **Group**: everyone who stands in it. **Raid**: everyone who stands in it (it is small; the raid has to stack).
- **Stacking**: two Salt Circles overlapping do not stack (20% once). Stacks with other classes' damage reduction.
- **Looks like**: you pour a white ring of salt around yourself (a new ground decal `fx_salt_ring` with small
  crystal sprites); enemy spell effects that enter it hiss and thin out.
- **Sound**: pouring salt, then a low hum while it holds.

**`witch_hunter_inquest_leap` — Inquest Leap** · slot 5 · level 28
- **Cost** 30 Focus · **Cooldown** 16 s · **Cast** instant · **Range** 14 m · **Shape** one enemy; you leap to it.
- **Effect** 200% WD on landing (a crossbow-butt blow, or a sword cut). **Interrupts** the target's cast if its
  cast bar has a **gold border** (page 11 — interruptible), **bosses included**. A successful interrupt gives
  **+30 Evidence** and **refunds half the cooldown** (8 s). This is the witch hunter's only interrupt.
- **Looks like**: a short arcing leap with a black coat-tail smear, a silver shockwave on landing (spellfx
  `impact`, physical, recoloured silver; a `ring` on the ground).
- **Sound**: a coat snap, a boot landing, and on an interrupt a sharp bell "clang" heard by the group.

**`witch_hunter_verdict` — Verdict** · slot 6 · level 40
- **Cost** 40 Focus + **3 Silver** · **Cooldown** 30 s · **Cast** 0.8 s (you cannot move) · **Range** 45 m (crossbow) or 30 m (thrown) · **Shape** one **Condemned** enemy only; refused on anything else ("Not Condemned").
- **Effect** **900% WD as holy**. Evidence on the target drops to 0. A **non-boss, non-rare** enemy left under
  **20% health** by it dies (**Sentenced**).
- **Looks like**: a single huge silver bolt with a wax seal at its head; on impact a column of white light and a
  seal stamps the ground (spellfx `pillar`, holy; `impact` holy, scale 1.4).
- **Sound**: a heavy crossbow crank, a pause, a gavel strike, the hit.

### 3.3 Rotation — how it plays

**Solo.** Brand the most dangerous enemy (a caster if there is one). Silver Quarrel with Silvered Shots on;
Hexbreak whenever the target has a magic buff (+25 Evidence each); Inquest Leap to interrupt its big spell
(+30). Condemned usually lands in 6–8 casts on a normal enemy. Turn **Silvered Shots off** when you are at 3
Silver and the target is nearly Condemned — you need 3 for Verdict.

**Dungeon (5).** You are the group's **interrupter** and **purger**. Brand the kill target (+6% for the whole
group). Inquest Leap is saved for gold-bordered casts; Hexbreak strips enrage-style magic buffs from trash
and cleanses curses off allies. Salt Circle before a caster pack's volley.

**Raid.** Bosses fill Evidence at one third, so plan **one Verdict per ~45–60 s** on a boss (interrupts
help most). Your raid job: Salt Circle at the stack point for magic-heavy group hits, Hexbreak magic buffs off
the boss and adds, Witchsight on invisible adds, and a place in the **interrupt rotation**.

### 3.4 What the witch hunter gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| Brand of Guilt | +6% damage from the group on one target | same (+6% from the whole raid) | other classes' marks; not a second Brand |
| Hexbreak | purges 1 magic buff per enemy per 12 s; removes 1 curse from an ally | same | — |
| Salt Circle | −20% magic damage, 8 m, 8 s every 45 s | same, for whoever stacks in it | other damage reduction; not a second Salt Circle |
| Inquest Leap | an interrupt every 16 s (8 s after a success) | same | interrupt rotation |
| Witchsight | reveals invisible enemies to the group | to your raid group | — |

### 3.5 Boss mechanics

| Mechanic | What the witch hunter does |
|---|---|
| **Interruptible casts** (gold border) | Inquest Leap interrupts bosses too; a success refunds 8 s. Join the interrupt rotation. |
| **Magic buffs on a boss** | Hexbreak removes one per cast (bosses may carry buffs flagged `mechanic` that cannot be purged; page 11). |
| **Void zone** | Salt Circle takes 20% off void-zone ticks for allies inside it; it does not move, so pour it where the group will be. |
| **Soak / one-shots** | Salt Circle does **nothing** to soaks or `unavoidable` hits. |
| **Invisible adds** | Witchsight reveals them for the group; Brand keeps one revealed for 12 s. |
| **Spell reflection** | Silver Reflection (calling 40) never reflects a boss mechanic. |
| **Immunities** | Silence and Sentenced never work on bosses or rare elites; Evidence fills at one third on them. |

---

## 4. Alternate spells

None. **Silvered Shots** (`Z` + `1`) is a toggle, not a spell bar.

---

## 5. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Silver Quarrel** (`witch_hunter_silver_quarrel`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Scattershot** — 3 quarrels in a 12° fan, 70% each; Silvered applies to all three for 1 Silver | **Heavy Quarrel** — pierces every body in 45 m | **Blessed Tip** — Silvered hits heal you for 5% of the damage |
| 2 (22) | **Quicksilver** — a Silvered hit refunds 10 Focus | **Hollow Point** — a Silvered hit leaves Bleeding (page 05) | — |
| 3 (32) | **Tracking Round** — the quarrel turns up to 30° toward a Branded target | **Salted Bolt** — a Silvered hit also purges one magic buff (no Silence) | — |
| 4 (45) | **Silver Rain** — every 5th cast rains 6 quarrels on a 4 m circle around the target for 60% each | **Case Closed** — hitting a Condemned target refunds 1 Silver | — |

**Hexbreak** (`witch_hunter_hexbreak`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Circle of Breaking** — a 6 m circle around you instead of a line | **Long Hex** — a 32 m line | — |
| 2 (22) | **Two Hexes** — purges 2 buffs per enemy | **Stolen Hex** — the first buff purged is given to **you** for its remaining time (non-boss buffs only) | **Quiet** — Silence lasts 3 s |
| 3 (32) | **Absolution** — on an ally, removes **all** non-mechanic curses and magic statuses and heals 5% max health | **Burning Hex** — each buff purged deals 120% WD holy to that enemy | — |
| 4 (45) | **Hexchain** — purging a buff resets Hexbreak's cooldown (once per 12 s) | **Anathema** — enemies hit cannot gain new magic buffs for 6 s | — |

**Brand of Guilt** (`witch_hunter_brand_of_guilt`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Accomplices** — brands the target and up to 2 enemies within 6 m of it | **Deep Brand** — one target, +10% group damage instead of +6% | — |
| 2 (22) | **Guilt Spreads** — if the Branded target dies, the Brand jumps to the nearest enemy with its time left | **Confession** — the Branded target deals 10% less damage | — |
| 3 (32) | **Hot Iron** — the Brand burns for 40% WD holy a second | **Witness** — every group member's hits on the Branded target also give you +2 Evidence | — |
| 4 (45) | **Presumed Guilty** — the Branded target starts at 30 Evidence | **Seared** — the Branded target cannot be healed by its allies | — |

**Salt Circle** (`witch_hunter_salt_circle`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Thrown Salt** — pour it at your aim point up to 25 m away | **Salt Trail** — the circle moves with you, 6 m radius | — |
| 2 (22) | **Warding Line** — enemies cannot walk into the circle (non-boss) | **Blessed Ground** — allies inside heal 2% max health a second | **Salt Sting** — enemies inside take 30% WD holy a second |
| 3 (32) | **Long Watch** — lasts 14 s | **Iron Salt** — the reduction covers physical damage too, at 10% | — |
| 4 (45) | **Unhallowed Ground** — demons and undead inside are Slowed 50% | **Rite Breaker** — the first non-mechanic enemy spell that lands inside is cancelled completely (once per circle) | — |

**Inquest Leap** (`witch_hunter_inquest_leap`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Two Leaps** — 2 charges | **Backstep** — leap away 12 m from your target instead; still interrupts (with a thrown knife) | — |
| 2 (28) | **Pinning Blow** — the target is Rooted 2 s (non-boss) | **Pursuit** — you gain +30% move speed for 4 s | — |
| 3 (32) | **Tribunal's Reach** — range 22 m | **Arrest** — a successful interrupt also Silences non-boss targets for 4 s | **Leap of Faith** — may target an **ally**: leap to them and give both of you a 10% max health barrier (no interrupt) |
| 4 (45) | **Inquisition** — a successful interrupt fully resets the cooldown (instead of half) | **Crushing Verdict** — landing on a Condemned target casts a free 50% Verdict | — |

**Verdict** (`witch_hunter_verdict`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Mass Sentence** — hits every Condemned enemy within 10 m of the target | **Swift Justice** — instant cast, 750% WD | — |
| 2 (40) | **Mercy** — if it does not kill, the target is Stunned for 2 s (non-boss) | **Hanging Judge** — Sentenced threshold is 30% instead of 20% | — |
| 3 (40) | **Precedent** — Evidence drops to 50 instead of 0 | **Silver Spent** — costs 2 Silver instead of 3 | — |
| 4 (45) | **Appeal Denied** — killing a target with it resets its cooldown | **Public Judgement** — the group deals +10% to the target for 8 s after it | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_witch_hunter_inquisitor` | **The Inquisitor's Coat** | `it_inquisitor_wide_brim`, `it_inquisitor_mantle`, `it_inquisitor_trench`, `it_inquisitor_gloves`, `it_inquisitor_breeches`, `it_inquisitor_boots` | Levels 28–39: bosses of `d08_moonwell_ruins`, `d09_warmasters_pit`, `d10_rimefang_caverns`. Heroic/Mythic+ copies at 60. |
| `set_witch_hunter_silver_writ` | **Garb of the Silver Writ** | `it_silver_writ_hat`, `it_silver_writ_pauldrons`, `it_silver_writ_coat`, `it_silver_writ_gauntlets`, `it_silver_writ_legguards`, `it_silver_writ_boots` | Level 50: `r03_sunken_choir`; level 60: `r05_veilspire`; the coat only from each raid's final boss |

**The Inquisitor's Coat**
- **2 pieces** — Hexbreak's cooldown is 8 s.
- **4 pieces** — Inquest Leap gives +50 Evidence on an interrupt instead of +30.
- **6 pieces** — Verdict refunds 2 Silver if it kills.

**Garb of the Silver Writ**
- **2 pieces** — Silver refills every 3 s.
- **4 pieces** — Brand of Guilt Condemns its target at once if the target is below 30% health (bosses excluded).
- **6 pieces** — Verdict's Evidence need is **70** on bosses and rares (they are Condemned at 70).

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_the_last_confession` | The Last Confession | crossbow | **Last Words** — Verdict's bolt pierces every enemy in a 45 m line; each Condemned one it passes through is hit for the full 900% | `r03_sunken_choir`, final boss (page 13) |
| `leg_saltwrit_longcoat` | The Saltwrit Longcoat | chest | **Walking Circle** — Salt Circle moves with you, is 10 m, and lasts 12 s | `d11_saltdeep_cathedral`, final boss (page 12) |
| `leg_brim_of_the_long_hunt` | Brim of the Long Hunt | head | **Always Watching** — Witchsight is always on within 15 m (the key still gives the full 30 m for 10 s) | world boss of `drowned_coast` (page 13) |
| `leg_nine_silver_nails` | The Nine Silver Nails | ring | **Nine Nails** — Silver max 9; each Silver spent takes 2 s off Verdict's cooldown | `r05_veilspire`, boss 7 (page 13) |
| `uq_tribunal_hand_crossbow` | Hand Crossbow of the Tribunal | crossbow (one-handed) | **Double Writ** — Silver Quarrel fires 2 quarrels at 70% each (1 Silver pays for both) | `d06_sandsworn_vault`, boss 2 |
| `uq_cold_iron_manacles` | Cold-Iron Manacles | hands | **Shackled** — Hexbreak's Silence lasts 3 s | `d08_moonwell_ruins`, boss 1 |
| `uq_gallows_oath` | The Gallows Oath | neck | **Witnessed** — Condemned targets take +10% damage from your **whole group**, not only from you | `d11_saltdeep_cathedral`, boss 2 |

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `witch_hunter` (pitch 0.38, depth 0.6, tone 0.3, breath 0.2, rough 0.2,
speed 0.42, jitter 0.06) — low, flat and cold. Lines are short sentences, spoken like charges being read out.

| When | Lines |
|---|---|
| Brand of Guilt | "You're guilty." · "I know what you are." · "Marked." |
| Condemned | "Condemned." · "The case is closed." |
| Verdict | "Sentence is death." · "By silver." · "Judgement." |
| Interrupt | "Not today, witch." · "Silence." |
| Hexbreak purge | "Your charms won't save you." · "Broken." |
| Critical hit | "True aim." · "Silver finds it." |
| Low health | "Not yet — the case isn't done." · "Cover me!" |
| Seeing a demon or undead | "Unclean." · "Another one for the ledger." |

---

## 9. Reuse notes

- **Looks**: Farhold `classes.json` witch hunter (trench coat, `wide_brim` hat, saber). There is **no** row for
  `witch_hunter` in `avatar-3d/data/class-outfits.json` (the file skips it) — canon change request for the art
  page to add one.
- **Weapons**: crossbow rules (reload, pierce 2) reuse `js/weapons.js` `RANGED.crossbow` and `WEAPON_TRAITS.crossbow`.
- **Effects** (visuals only): Silver Quarrel borrows `aimed_shot`'s projectile; Hexbreak borrows `ice_lance`'s
  beam; Verdict borrows `judgement`'s pillar; Brand borrows the `marked` status aura.
- **Emberveil's witch hunter** (`silver_bolt`, `dispel_curse`, `purge_strike`, `inquisitor_mark`) → Silver
  Quarrel, Hexbreak (ally use), Inquest Leap, Brand of Guilt. The +50% vs demons/undead became +15% class-wide.
- Farhold's witch hunter kit (`aimed_shot`, `sunder`, `curse`, `pinning_shot`, `smoke`, `execute`) is **dropped**.
- **Tech**: Evidence is a map on each enemy keyed by the hunter's id; it must be cleared on the enemy's reset
  (leash) so a boss cannot be pre-loaded before a pull.
