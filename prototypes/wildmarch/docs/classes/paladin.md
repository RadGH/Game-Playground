# Paladin — class design (`paladin`)

> *"I swore something this morning. Watch me keep it."*

**Status:** v0.1 draft, 2026-09-29. Follows the class template in [page 00 §5](../00-OVERVIEW.md).
Canon facts used (page 00): role **Tank** (can also **Healer**), **medium** armour, resource **Mana**,
mechanic **Oaths — a sworn vow per fight changes auras and spell riders**, spell slots **1 / 4 / 10 / 18 / 28 / 40**,
calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit; **% SP** = percent of spell power (page 05 owns both). Numbers are
  **final** (Farhold's `effectiveMult` is folded in, never applied again).
- **Mana** costs are written as **% of max mana**, so they mean the same thing at level 5 and level 60.
- The paladin is a hybrid: its **holy damage** uses % WD (it is a swing), its **heals and barriers** use
  % SP or % of the paladin's max health. How much of a paladin's spell power comes from STR is a question
  for page 05 (see the report's canon requests); Farhold's psalter gives +12% spell power (reuse:
  `prototypes/farhold/js/foci.js` `psalter`).
- **Rider** = what a spell gains from the oath you swore. Statuses (taunt, stun, snare, burn, weaken) are
  page 05's. "Undead/demon" = monster tags from page 10.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A holy knight bound by the promise they made before the fight. Keep the promise and the light answers. |
| Role | **Tank** (Oath of Keeping) or **Healer** (Oath of Mercy). Oath of Dawnfire (level 20) is for soloing and undead/demon fights. |
| Armour | medium |
| Weapons | one-handed sword, sceptre; shield **or** a holy book focus in the off hand (reuse: `WEAPON_PATTERNS.sword`, `.scepter`; focus `psalter`) |
| Primary attribute | STR (secondary INT) |
| Resource | **Mana** + the **Sanctity** gauge (level 6) |
| Companion | none |
| Starting kit | sword, psalter, medium chest, medium helm (reuse: Farhold `classes.json` `paladin`) |

**Playstyle in three sentences.** Before a fight the paladin **swears an oath**, which sets an aura on the
group and a **rider** on every paladin spell — the same six spells tank under Keeping and heal under Mercy.
Each oath has a **vow** (hold every enemy's attention; let nobody fall; burn the unholy) and keeping it
fills **Sanctity**; a full gauge makes the next spell **Fulfilled** (rider doubled, free). Breaking the vow
drains the gauge, so a paladin plays the fight *and* the promise.

**Original hook:** "Holy Strike crits vs demons. Lay on Hands keeps allies alive. Consecration sustains long
fights." — kept as Oathbound Strike (always crits demons), Hands of Mercy and Hallowed Ground.

---

## 2. Class mechanic — Oaths (new)

### 2.1 The three oaths

| Oath | Unlock | Aura (15 m, whole party, always on) | Vow — what builds Sanctity | What breaks it |
|---|---|---|---|---|
| **Keeping** (tank) | level 1 | allies take **5% less damage** | **+2 Sanctity/s** while you hold top threat on every enemy in combat within 30 m | an enemy attacks an ally for 3 s in a row: **−20** |
| **Mercy** (healer) | level 1 | allies receive **+8% healing** | **+1 Sanctity per 1%** of an ally's max health you heal (overheal does not count) | an ally dies: **−50** |
| **Dawnfire** (damage) | calling 20 | allies' attacks deal **+5%** as extra holy damage | **+1 per 1%** of an undead/demon's max health you deal, +5 per any kill | you take a hit of 20%+ max health: **−15** |

- **Swearing**: a 1 s cast out of combat, from the oath wheel (default key `V`, page 02). The oath stays
  until you swear another. You cannot change oath in combat until calling 20.
- One paladin's auras do not stack with another paladin's copy of the same aura (a party with two Keeping
  paladins gets 5%, not 10%).

### 2.2 Sanctity and "Fulfilled" (calling 6)

- Gauge **0–100**, starts each fight at 0, drains 5/s out of combat.
- At **100** the gauge turns gold and your **next paladin spell is Fulfilled**: its **rider is doubled**
  (every number in the rider ×2), it costs **no mana**, and it gets a gold version of its effect. Sanctity
  drops to 0.
- A Fulfilled **Hands of Mercy** cast on a **dead ally** revives them at **40% health** (the paladin's
  in-combat resurrection; §3.4).

### 2.3 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_paladin_calling_06` "The First Vow" | the chapel at Brightwater, Hearthvale | the **Sanctity** gauge and **Fulfilled** spells |
| 20 | `q_paladin_calling_20` "Dawn over the Glass" | the Glass Tombs road, Sunscar — escort a priest through a night of risen dead | **Oath of Dawnfire**, and **Recant**: change oath in combat once per fight (1 s cast, loses all Sanctity, 30 s lockout) |
| 40 | `q_paladin_calling_40` "Two Promises" | Saltmarch, the Drowned Coast — hold a chapel against the Drowned while its priest dies | **Twin Oath**: swear **two** oaths at once. Both auras and both riders apply at **70%**; both vows feed one Sanctity gauge |

### 2.4 Gauge and HUD (new; page 03 `hud_oath`)

- A **round seal** left of the mana bar showing the current oath's symbol (shield / open hand / sunrise).
- The seal's rim is the **Sanctity** ring, filling clockwise. At 100 the seal glows gold and the next
  spell icon gets a gold border ("Fulfilled").
- A vow-break shows a red crack across the seal for 1 s and the amount lost (`−50`).
- Twin Oath: two half-seals side by side sharing one rim.
- Tooltip: the oath name, its aura, its vow in one line ("Keep every enemy on you: +2 a second. Lose 20 each
  time one hits an ally for 3 seconds.") and the riders of all six spells.
- The paladin's cape and tabard pick up the oath colour (Keeping steel-blue, Mercy white-green, Dawnfire
  gold-orange) via `dressAs` colour overrides (reuse: `avatar-3d/js/class-outfits.js`).

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Mana | Cooldown | Cast | Shape | Headline |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `paladin_oathbound_strike` | Oathbound Strike | 3% | 5 s | instant | 3 m cone, 70° | 130% WD holy, ×2 vs undead/demon + rider |
| 2 | 4 | `paladin_hands_of_mercy` | Hands of Mercy | 6% | 6 s | instant | one ally, 30 m | heal 260% SP, remove 1 debuff + rider |
| 3 | 10 | `paladin_hallowed_ground` | Hallowed Ground | 10% | 18 s | instant | 7 m circle on you, 10 s | 25% WD/s to enemies, 1.2% max health/s to allies |
| 4 | 18 | `paladin_aegis_of_the_vow` | Aegis of the Vow | 8% | 20 s | instant | one ally, 30 m | barrier = 25% of *your* max health, 8 s |
| 5 | 28 | `paladin_dawnspear` | Dawnspear | 8% | 12 s | 1.0 s cast | 20 × 2 m line | 200% WD holy, pierces + rider |
| 6 | 40 | `paladin_covenant` | Covenant of the Unbroken | 20% | 180 s | instant | 15 m circle on you, 10 s | allies −15% damage + rider (the raid cooldown) |

### 3.2 Spell details (each with its three riders)

**1. `paladin_oathbound_strike` — Oathbound Strike** (level 1)
- **3% mana**, cooldown **5 s**, instant, melee cone **3 m, 70°**. **130% WD holy**. **×2 against undead and
  demons**, and it **always crits a demon**.
- Riders — **Keeping:** taunt the main target 3 s, threat ×3. **Mercy:** the lowest-health ally within 20 m
  is healed for **80% of the damage dealt**. **Dawnfire:** a **4 m** burst of holy fire around the target,
  **50% WD** and burn (page 05, holy-coloured, 5 s).
- Looks: Chibi 2 `overhead`; spellfx `impact` element `holy` (rune + motes); Dawnfire adds a `pillar`
  (radius 1.5 m, 300 ms).
- Sound: `melee.hit` + `spell.holy.impact`.

**2. `paladin_hands_of_mercy` — Hands of Mercy** (level 4) — **single-target heal**
- **6% mana**, cooldown **6 s**, instant, **one ally or yourself within 30 m**.
- Heals **260% SP** and removes **one** poison, curse, disease or magic debuff (the paladin's dispel).
- Riders — **Keeping:** on yourself, also a barrier of **10% max health** for 6 s. **Mercy:** **2 charges**
  and **+30% healing**. **Dawnfire:** you are healed for **30%** of the amount too.
- Fulfilled on a **dead** ally: revive at 40% health (§2.2).
- Looks: Chibi 2 `castPoint`; spellfx `heal` on the target (colour white-gold), a `holy_rune` decal at
  their feet.
- Sound: `heal`.

**3. `paladin_hallowed_ground` — Hallowed Ground** (level 10) — **group heal-over-time + tank damage**
- **10% mana**, cooldown **18 s**, instant, a **7 m circle centred where you stand**, lasts **10 s** (it stays
  put when you move).
- Enemies inside take **25% WD holy every 1 s**; allies inside heal **1.2% max health every 1 s**.
- Riders — **Keeping:** enemies inside deal **10% less**, ticks make threat ×2. **Mercy:** healing ×2 and
  radius **9 m**. **Dawnfire:** undead/demons inside are snared 40% and take ×1.5.
- Looks: a gold `rune_ring` ground disc 7 m with rising `holy_mote` particles; enemies inside get a faint
  gold rim.
- Sound: `spell.holy.launch` then a soft choir-like hum (`status.regen.tick` every 1 s).

**4. `paladin_aegis_of_the_vow` — Aegis of the Vow** (level 18) — **the emergency shield**
- **8% mana**, cooldown **20 s**, instant, **one ally or yourself within 30 m**.
- Barrier worth **25% of the paladin's max health**, 8 s. When it breaks or expires it **pushes** enemies
  within 4 m of the target back 4 m.
- Riders — **Keeping:** every enemy that hits the shielded ally is taunted to you for 3 s. **Mercy:** when the
  barrier breaks, the ally heals **15% of their max health**. **Dawnfire:** the barrier reflects **30%** of what
  it absorbs as holy damage.
- Looks: spellfx `STATUS_FX.barrier` recoloured gold, a `shield_ring` that cracks as it depletes.
- Sound: `status.barrier.apply`; a bright chime on break.

**5. `paladin_dawnspear` — Dawnspear** (level 28)
- **8% mana**, cooldown **12 s**, **1.0 s cast** (you can turn but not walk), a **line 20 m × 2 m**. **200% WD
  holy** to every enemy on it (pierces all).
- Riders — **Keeping:** everything hit is taunted 3 s (the ranged pull). **Mercy:** allies standing in the
  line are healed **150% SP**. **Dawnfire:** undead/demons hit are **stunned 1.5 s** (boss: interrupted).
- Looks: Chibi 2 `castPoint` then `thrust`; spellfx `beam` (radius 0.35, gold) laid flat along the line,
  `holy_mote` sparks along its length.
- Sound: `spell.holy.launch` + `spell.holy.travel` (fast), `spell.holy.impact` on each hit.

**6. `paladin_covenant` — Covenant of the Unbroken** (level 40) — **the big cooldown**
- **20% mana**, cooldown **180 s**, instant, a **15 m circle that follows you**, **10 s**.
- Base: allies inside take **15% less damage**.
- Riders — **Keeping** (tank cooldown): **40% of the damage** allies inside take is moved onto you, and you
  take **40% less damage**. **Mercy** (healer emergency): allies inside **cannot drop below 1 health for the
  first 4 s**; when the covenant ends, each ally inside heals **20% of max health**. **Dawnfire:** a holy nova
  on cast, **350% WD** in 15 m, and allies' hits deal +10% extra holy for the duration.
- Looks: a huge gold `rune_ring` dome (ring + vertical `pillar`, radius 15 m, low opacity); thin gold threads
  from each ally to the paladin under Keeping.
- Sound: `bell.toll` + `spell.holy.impact`; `revive` stinger under Mercy.

### 3.3 Rotation / how it plays

- **Solo:** Dawnfire from 20 (Keeping before that). Hallowed Ground where you will fight, Oathbound Strike on
  cooldown, Dawnspear to pull, Hands of Mercy on yourself when under 60%, Aegis on yourself before an elite's
  big hit.
- **Dungeon tank (Keeping):** Dawnspear or Oathbound Strike to pull, drop Hallowed Ground under the pack (10%
  less damage + threat), Oathbound Strike taunts the stray, Aegis on yourself for the tank buster or on the
  healer when adds reach them (Keeping rider taunts them off). Covenant for a boss's burn phase.
- **Dungeon healer (Mercy):** Hallowed Ground under the tank, Hands of Mercy (2 charges) on whoever drops,
  Oathbound Strike when topped (it heals the lowest), Aegis before a known big hit, Covenant for the wipe
  moment. A full Sanctity gauge is held for a Fulfilled Hands of Mercy (double heal, or a revive).
- **Raid:** tank paladins swap with Keeping's Oathbound taunt and absorb the raid's damage with Keeping
  Covenant. Healer paladins are **tank and emergency** healers: Aegis + Fulfilled Hands of Mercy. Twin Oath
  (40+) Keeping+Mercy is the "off-tank who also heals" build.

### 3.4 Boss mechanics

| Mechanic (page 11) | Paladin |
|---|---|
| Soak (orange) | Aegis on a soaker absorbs 25% of the paladin's max health of it; Keeping Covenant takes 40% of every soaker's hit. |
| Tank buster | Aegis on self (Keeping taunts nothing new here — use it for the barrier), Covenant under Keeping. |
| Raid-wide damage | Mercy Covenant (cannot drop below 1 health for 4 s) is the raid's "stop the wipe" button. |
| Dispel | Hands of Mercy removes one poison/curse/disease/magic debuff every 6 s (two with Mercy's charges). |
| Void / danger zones | Slow class: Dawnspear's cast roots walking. Movement only from the tier-1 **Dawnstride** talent and the dodge roll. |
| Undead/demon bosses | Oathbound ×2 and always crits demons; Dawnfire Dawnspear stuns (interrupts a boss). |
| Resurrection | Fulfilled Hands of Mercy on a dead ally (in combat), plus page 05's normal out-of-combat revive. |
| Interrupt | Dawnfire Dawnspear on undead/demons only; tier-2 **Rebuke** (Oathbound Strike) interrupts anything. |

---

## 4. Alternate spells

None — oaths change riders, not the bar. Twin Oath (40+) applies two riders at 70% each. The seal and
colours change with the oath (§2.4).

---

## 5. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.

### Oathbound Strike
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Hammer of Vows** — becomes a thrown sceptre/sword-light, 20 m, same numbers. | **Twofold Strike** — two swings, 2 × 75% WD; the rider fires on the second. | **Wide Strike** — 5 m, 140° cone. |
| 2 (22) | **Rebuke** — interrupts (locks the spell 3 s); 2 s extra cooldown. | **Sanctified Blade** — for 6 s after, your basic attacks deal +20% as holy. | **Light's Tithe** — each hit restores 0.5% mana. |
| 3 (32) | **Unmasking** — also reveals stealthed or invisible enemies in 10 m and marks them 6 s. | **Kindled Vow** — gives +8 Sanctity per enemy hit. | **Judged** — the target takes 10% more from holy damage for 8 s. |
| 4 (45) | **Descending Light** — a column of light falls on the target 0.8 s later for another 100% WD. | **Oath Echo** — the rider also fires on the second-nearest enemy. | — |

### Hands of Mercy
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Reaching Hands** — range 40 m and it bounces to a second ally for 50%. | **Lingering Hands** — half the heal lands now, the other 60% over 6 s. | **Cleansing Hands** — removes **all** removable debuffs. |
| 2 (22) | **Swift Hands** — cooldown 4 s. | **Hands of Iron** — the healed ally takes 10% less damage for 5 s. | **Consoling Hands** — overhealing becomes a barrier (max 10% of their health). |
| 3 (32) | **Hands of Keeping** — casting it on an ally taunts that ally's attackers to you for 2 s. | **Last Hands** — ×2 on an ally below 25% health. | **Shared Hands** — you are healed for the same amount. |
| 4 (45) | **Beyond the Veil** — may target a dead ally without Sanctity: 3 s cast, revive at 30%, once per 10 minutes. | **Laying On** — once per 5 minutes, a full heal to 100% (costs all your mana). | — |

### Hallowed Ground
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Walking Ground** — the circle follows you. | **Thrown Ground** — placed anywhere within 30 m. | **Narrow Ground** — 4 m, but every number ×1.6. |
| 2 (22) | **Rooted Ground** — the first time an enemy enters, it is rooted 1.5 s. | **Pure Ground** — allies inside are immune to poison and disease. | **Sunwell** — allies inside regain 0.5% mana per second. |
| 3 (32) | **Growing Ground** — radius +1 m each second (max 12 m). | **Consecrated Blades** — allies inside deal +8% as holy. | **Warding Ground** — each ally entering gets a barrier of 5% max health (once per cast). |
| 4 (45) | **Last Light** — when it ends, it bursts for 150% WD to enemies and 5% max-health heal to allies. | **Twin Grounds** — 2 charges. | — |

### Aegis of the Vow
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Twin Aegis** — also shields a second ally at half strength. | **Moving Aegis** — you dash to the ally (up to 20 m) as you cast it. | **Deep Aegis** — 35% of your max health, but 5 s. |
| 2 (22) | **Answering Aegis** — the push becomes a 1 s stun (boss: no effect). | **Sheltering Aegis** — the ally is immune to knockback while it holds. | **Purging Aegis** — cast removes one debuff. |
| 3 (32) | **Mirror Aegis** — you also get a barrier of half the size. | **Returning Aegis** — whatever is left when it expires returns 50% as mana. | **Sacred Aegis** — while it holds, the ally cannot be crit. |
| 4 (45) | **Aegis of the Martyr** — cast on an ally below 20% health: they cannot die for 3 s; cooldown +20 s. | **Spread Aegis** — shields every ally in a 6 m circle at 40% strength. | — |

### Dawnspear
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Dawnstride** — you ride the spear: dash to its end (20 m), immune to damage 0.3 s. | **Instant Dawn** — no cast time, 14 m. | **Fan of Dawn** — three spears in a 30° fan, 70% each. |
| 2 (22)\* | **Blinding Dawn** — enemies hit are blinded 3 s (miss 50%). | **Lance of Mercy** — heals allies on it for 150% SP whatever your oath. | **Burning Dawn** — leaves a 6 s holy fire line, 20% WD a second. |
| 3 (32) | **Pull of Dawn** — enemies hit are dragged 5 m toward you. | **Standing Spear** — the spear stays 4 s as a wall of light enemy projectiles cannot cross. | **Sundered Dark** — strips one buff from each enemy hit. |
| 4 (45) | **High Noon** — at full Sanctity it becomes a 6 m-wide beam. | **Second Dawn** — fires again 1 s later from where it ended, back toward you. | — |

\* unlocks at 28: tiers 1–2 open together.

### Covenant of the Unbroken
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Wide Covenant** — 22 m. | **Planted Covenant** — stays where cast; you are free to leave it. | **Short Covenant** — 6 s, cooldown 120 s. |
| 2 (22)\* | **Covenant of Swiftness** — allies inside move 20% faster. | **Covenant of Voices** — allies inside are immune to silence and fear. | **Unbroken Line** — allies inside cannot be knocked back. |
| 3 (32)\* | **Shared Sanctity** — every ally inside who takes a hit gives +1 Sanctity. | **Covenant Renewed** — each ally death inside refunds 30 s of cooldown. | **Blessed Ground** — leaves Hallowed Ground (10 s) under you when it ends. |
| 4 (45) | **Final Covenant** — when it ends, every ally revived during it or who dropped below 10% is healed to 50%. | **Covenant of Stars** — its base damage reduction is 25%. | — |

\* unlocks at 40: tiers 1–3 open together.

---

## 6. Class sets

### `set_paladin_oathkeeper` — Oathkeeper's Harness (dungeon set, item level 60)
Heroic: head `d07_thornheart` final boss, chest `d08_moonwell_ruins` final boss, legs `d11_saltdeep_cathedral`
boss 3, hands `d05_glass_tombs` final boss, feet `d06_sandsworn_vault` boss 2, off hand (tome
`it_oathkeeper_psalter`) `d14_ashen_reliquary` boss 3. (Heroic runs of lower dungeons are item level 60.)
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Sanctity builds 25% faster under every oath. | the gauge |
| 4 | A Fulfilled spell also fires **the rider of your other oath** (the last one you swore) at 50%. | all six |
| 6 | Hallowed Ground carries **both** Keeping and Mercy riders at once, whatever your oath. | Hallowed Ground |

### `set_paladin_dawnwarden` — Regalia of the Dawnwarden (raid set)
`r04_ember_court` bosses 1, 3, 4, 6, 7 and the secret boss (one piece each), Normal and Mythic; token from
`r05_veilspire` boss 7.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aegis of the Vow has 2 charges. | Aegis |
| 4 | Dawnspear's cast is instant while Covenant is up, and it fires from every ally inside the covenant at 30%. | Dawnspear, Covenant |
| 6 | Covenant's cooldown drops 10 s every time you finish a vow (reach 100 Sanctity). | Covenant |

---

## 7. Class legendaries and uniques

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_kept_promise` | The Kept Promise | one-handed sword | **Promise Kept** — Sanctity no longer resets on Fulfilled; instead it drops to 50. | `r04_ember_court` final boss (boss 8) |
| `leg_sceptre_of_first_light` | Sceptre of First Light | sceptre | **First Light** — Hallowed Ground's first tick heals allies inside for 15% max health and hits enemies for 150% WD. | `d08_moonwell_ruins` final boss, Heroic / Mythic+ |
| `leg_the_martyrs_tabard` | The Martyr's Tabard | medium chest | **Willing Martyr** — Keeping Covenant moves 60% of damage onto you (not 40%), and you heal for 10% of the damage moved. | `r03_sunken_choir` boss 7 (final) |
| `leg_vowbreaker_hymnal` | Hymnal of the Broken Vow | off hand (tome) | **Penance** — breaking a vow no longer drains Sanctity; it fires a holy nova of 100% WD per 10 Sanctity it would have cost. | `r01_barrowking` secret boss |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_seal_of_the_first_vow` | Seal of the First Vow | ring | You may change oath once in combat before calling 20 (no Sanctity loss). | `d01_hollow_barrow` final boss |
| `uq_dawnspear_greaves` | Dawnward Greaves | medium legs | Dawnspear's cast is 0.5 s and it is 26 m long. | `d05_glass_tombs` boss 2 |
| `uq_consoling_gauntlets` | Consoling Gauntlets | medium hands | Hands of Mercy on a target with an Aegis refreshes the Aegis to full. | `d09_warmasters_pit` boss 3 |

---

## 8. Voice and barks

- Timbre: `shared/voices.js` role `paladin` (pitch 0.42, tone 0.65, rough 0.05 — clear, warm, even).
- Lingo tag `class:paladin`, plus the oath as a context tag (`oath:keeping` etc.) so lines match the vow.

| Moment | Lines |
|---|---|
| Swear Keeping | "Eyes on me. I swear it." |
| Swear Mercy | "No one falls today." |
| Swear Dawnfire | "The dead stay dead." |
| Oathbound Strike | "By the vow!" · "Kneel." |
| Hands of Mercy | "Stand up." · "I have you." |
| Aegis | "Behind the light!" |
| Covenant | "We hold together!" |
| Fulfilled | "Kept." · "It is done as I swore." |
| Vow broken | "…Forgive me." |
| Low health | "The light is thin here…" |
| Ally revived | "Not yet. You're not done." |
| Undead seen | "Rest. I'll help you." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Timbre `paladin` | `shared/voices.js` | voice |
| Look (great helm, gold-trimmed plate, white cape, tabard, `fh_sword`, `book`) | `avatar-3d/data/class-outfits.json` `classes.paladin` | default outfit; oath recolours via `dressAs` |
| Psalter focus | `prototypes/farhold/js/foci.js` `FOCUS_BASES.psalter` | off hand |
| Visual ideas of Farhold `consecrate`, `judgement`, `renew`, `rally` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| spellfx `pillar`, `heal`, `revive`, `beam`, `STATUS_FX.barrier` | `avatar-3d/js/spellfx.js` | Dawnspear, Hands, Covenant, Aegis |
| Clips `overhead`, `castPoint`, `thrust`, `pray`, `castBook` | `avatar-3d/js/chibi2-motion.js` | spells; `pray` for swearing an oath |
| Emberveil `holy_strike`, `lay_on_hands`, `divine_shield`, `consecration` | `prototypes/emberveil/data/skills.json` | design ancestry |
| Sound ids | `sfx/data/catalog.json` | as listed |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `rider`, `oath`, `redirect`, `revive` | talent cards |
