# Paladin — class design (`paladin`)

> *"I swore something this morning. Watch me keep it."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Follows the class template in
[page 00 §5](../00-OVERVIEW.md#5-the-spell-ladder-and-the-class-template).
Canon facts used (page 00 §6): primary role **Tank**, hybrid role **Healer**, build **melee**, **medium**
armour, resource **Mana**, mechanic **Oaths — a sworn vow per fight changes auras and spell riders**, spell
slots **1 / 4 / 10 / 18 / 28 / 40**, calling quests **6 / 20 / 40**, talent tiers **12 / 22 / 32 / 45**, cap **60**.

## How to read the numbers on this page

- **% WD** = percent of one weapon hit; **% SP** = percent of spell power (page 05 owns both). Numbers are
  **final** (Farhold's `effectiveMult` is folded in, never applied again).
- **Mana**: the pool size comes from INT (page 05 / page 07); base regeneration is page 05's. Costs here
  are written as **% of max mana**, so they mean the same thing at level 5 and level 60. The paladin's own
  mana gains are listed in §2.5.
- The paladin mixes both scales: its **holy damage** uses % WD (it is a swing), its **heals and barriers** use
  % SP or % of the paladin's max health. How much of a paladin's spell power comes from STR is a question
  for page 05 (see the round-1 canon request); Farhold's psalter gives +12% spell power (reuse:
  `prototypes/farhold/js/foci.js` `psalter`).
- **Rider** = what a spell gains from the oath you swore. Statuses (taunt, stun, snare, burn, weaken) are
  page 05's. "Undead/demon" = monster tags from page 10.
- **Targeting** follows page 00 §12.1 W8: **Needs target** (will not cast without a valid target — heals and
  barriers need an ally or yourself: `F1` self, `F2`–`F5` party, or click a frame), **Auto-target** (with no
  valid target it picks the valid enemy closest to your aim point in range), **Ground**, **Self**.
- **Tags** are page 05's list (§Tags); bonuses like "+10% holy damage" read them.

---

## 1. Identity

| Field | Value |
|---|---|
| Fantasy | A holy knight bound by the promise they made before the fight. Keep the promise and the light answers. |
| Primary role | **Tank** (Oath of Keeping) — fully tuned for all content, Challenge mode included |
| Hybrid role | **Healer** (Oath of Mercy) — the same six spells, played for their heals (§5) |
| Build | melee |
| Armour | medium |
| Weapons | one-handed sword, sceptre; shield **or** a holy book focus in the off hand (reuse: `WEAPON_PATTERNS.sword`, `.scepter`; focus `psalter`) |
| Primary attribute | STR (secondary INT) |
| Resource | **Mana** + the **Sanctity** ring (level 6) |
| Companion | none |
| Starting kit | sword, psalter, medium chest, medium helm (reuse: Farhold `classes.json` `paladin`) |

**Playstyle in three sentences.** Before a fight the paladin **swears an oath**, which sets an aura on the
group and a **rider** on every paladin spell — the same six spells tank under Keeping and heal under Mercy.
Each oath has a **vow** (hold every enemy's attention; let nobody fall; burn the unholy) and keeping it
fills **Sanctity**; a full ring makes the next spell **Fulfilled** (rider doubled, free). Breaking the vow
drains the ring, so a paladin plays the fight *and* the promise.

**Original hook:** "Holy Strike crits vs demons. A big heal keeps allies alive. Holy ground sustains long
fights." — kept as Oathbound Strike (always crits demons), **Wave of Mending** and **Hallowed Ground**.

---

## 2. Class mechanic — Oaths (new)

### 2.1 The three oaths

| Oath | Unlock | Aura (15 m, whole party, always on) | Vow — what builds Sanctity | What breaks it |
|---|---|---|---|---|
| **Keeping** (tank) | level 1 | allies take **5% less damage** | **+2 Sanctity/s** while you hold top threat on every enemy in combat within 30 m | an enemy attacks an ally for 3 s in a row: **−20** |
| **Mercy** (healer) | level 1 | allies receive **+8% healing** | **+1 Sanctity per 1%** of an ally's max health you heal (overheal does not count) | an ally dies: **−50** |
| **Dawnfire** (damage, solo) | calling 20 | allies' attacks deal **+5%** as extra holy damage | **+1 per 1%** of an undead/demon's max health you deal, +5 per any kill | you take a hit of 20%+ max health: **−15** |

- **Swearing** is the utility spell `paladin_swear_oath` (§6): a 1 s cast out of combat from the oath wheel
  (the oath wheel opens from the spellbook, or on **`Shift+1` Keeping / `Shift+2` Mercy / `Shift+3` Dawnfire** — page 00 §10's form/stance keys; page 02 owns them). The oath stays until you swear another. You cannot change oath in combat
  until calling 20.
- One paladin's auras do not stack with another paladin's copy of the same aura (a party with two Keeping
  paladins gets 5%, not 10%).
- **Role focus is tied to the oath** (the canon Role focus switch, 00 §6): swearing **Keeping** sets Role focus to
  **Primary (Tank)**, swearing **Mercy** sets it to **Hybrid (Healer)**, and flipping the switch in the spellbook
  swears the matching oath. **Dawnfire** is a solo oath and leaves Role focus where it was. The Dungeon Finder
  queues you as your Role focus and asks you to swear the matching oath before the dungeon starts (page 15).

### 2.2 Sanctity and "Fulfilled" (calling 6)

- Ring **0–100**, starts each fight at 0, drains 5/s out of combat.
- At **100** the ring turns gold and your **next paladin spell is Fulfilled**: its **rider is doubled**
  (every number in the rider ×2), it costs **no mana**, and it gets a gold version of its effect. Sanctity
  drops to 0.
- A Fulfilled **Wave of Mending** cast on a **dead ally** revives them at **40% health** — the paladin's
  in-combat revive. It is limited only by filling Sanctity again (there is no per-fight revive limit;
  page 00 W21).

### 2.3 Calling quests (page 14 owns the text)

| Level | Quest id | Where | Grants |
|---|---|---|---|
| 6 | `q_calling_paladin_1` "The First Vow" | the chapel at Brightwater, Hearthvale | the **Sanctity** ring and **Fulfilled** spells |
| 20 | `q_calling_paladin_2` "Dawn over the Glass" | the Glass Tombs road, Sunscar — escort a priest of the Quiet Wake through a tomb field while the dead rise in waves | **Oath of Dawnfire**, and **Recant**: change oath in combat once per fight (1 s cast, loses all Sanctity, 30 s lockout) |
| 40 | `q_calling_paladin_3` "Two Promises" | Saltmarch, the Drowned Coast — hold a chapel against the Drowned while its priest dies | **Twin Oath**: swear **two** oaths at once. Both auras and both riders apply at **70%**; both vows feed one Sanctity ring |

### 2.4 HUD (new; page 03 `hud_oath`)

- A **round seal** left of the mana bar showing the current oath's symbol (shield / open hand / sunrise).
- The seal's rim is the **Sanctity** ring, filling clockwise. At 100 the seal glows gold and the next
  spell icon gets a gold border ("Fulfilled").
- A vow-break shows a red crack across the seal for 1 s and the amount lost (`−50`).
- Twin Oath: two half-seals side by side sharing one rim.
- Tooltip: the oath name, its aura, its vow in one line ("Keep every enemy on you: +2 a second. Lose 20 each
  time one hits an ally for 3 seconds.") and the riders of all six spells.
- The paladin's cape and tabard pick up the oath colour (Keeping steel-blue, Mercy white-green, Dawnfire
  gold-orange) via `dressAs` colour overrides (reuse: `avatar-3d/js/class-outfits.js`).

### 2.5 Mana — the paladin's own gains and spends

| Source | Mana |
|---|---|
| Base regeneration | page 05's rate (in and out of combat) |
| Oathbound Strike hit (any oath) | **+1%** per enemy hit, max +3% per swing |
| A hit you take of 3%+ of your max health (Keeping only) | **+0.5%** |
| A Fulfilled spell | costs **0** |
| Most expensive button | Covenant of the Unbroken, 20% |

A Keeping tank is close to mana-neutral while being hit; a Mercy healer lives on the base regeneration and
the Oathbound refund, so a Mercy paladin who never swings runs dry in about 90 s of steady healing.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Mana | Cooldown | Cast | Target | Shape | Tags | Headline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `paladin_oathbound_strike` | Oathbound Strike | 3% | 5 s | instant | Auto-target | 3 m cone, 70° | `tag_holy` `tag_attack` `tag_melee` `tag_area` | 130% WD holy, ×2 vs undead/demon + rider |
| 2 | 4 | `paladin_wave_of_mending` | Wave of Mending | 6% | 6 s | instant | Needs target (ally or self) | ally, 30 m, then a 6 m ripple | `tag_holy` `tag_spell` `tag_heal` | heal 240% SP, ripple 40% to 2 more, remove 1 debuff + rider |
| 3 | 10 | `paladin_hallowed_ground` | Hallowed Ground | 10% | 18 s | instant | Self | 7 m circle on you, 10 s | `tag_holy` `tag_spell` `tag_area` `tag_duration` `tag_heal` | 25% WD/s to enemies, 1.2% max health/s to allies |
| 4 | 18 | `paladin_aegis_of_the_vow` | Aegis of the Vow | 8% | 20 s | instant | Needs target (ally or self) | ally, 30 m | `tag_holy` `tag_spell` `tag_shield` | barrier = 25% of *your* max health, 8 s |
| 5 | 28 | `paladin_dawnspear` | Dawnspear | 8% | 12 s | 1.0 s cast | Auto-target | 20 × 2 m line | `tag_holy` `tag_spell` `tag_ranged` `tag_area` | 200% WD holy, pierces + rider |
| 6 | 40 | `paladin_covenant` | Covenant of the Unbroken | 20% | 180 s | instant | Self | 15 m circle on you, 10 s | `tag_holy` `tag_spell` `tag_aura` `tag_area` `tag_duration` | allies −15% damage + rider (the group cooldown) |

### 3.2 Spell details (each with its three riders)

**1. `paladin_oathbound_strike` — Oathbound Strike** (level 1)
- **3% mana**, cooldown **5 s**, instant, melee cone **3 m, 70°**. **130% WD holy**. **×2 against undead and
  demons**, and it **always crits a demon**. Refunds 1% mana per enemy hit (max 3%).
- Targeting: **Auto-target** — with a hard target in range you turn to face it; without one it swings at the
  valid enemy nearest your aim point within 3 m.
- Tags: `tag_holy`, `tag_attack`, `tag_melee`, `tag_area`.
- Riders — **Keeping:** taunt the main target 3 s, threat ×3. **Mercy:** the lowest-health ally within 20 m
  is healed for **80% of the damage dealt**. **Dawnfire:** a **4 m** burst of holy fire around the target,
  **50% WD** and burn (page 05, holy-coloured, 5 s).
- Looks: Chibi 2 `overhead`; spellfx `impact` element `holy` (rune + motes); Dawnfire adds a `pillar`
  (radius 1.5 m, 300 ms).
- Sound: `melee.hit` + `spell.holy.impact`.

**2. `paladin_wave_of_mending` — Wave of Mending** (level 4) — **the main heal** (was Hands of Mercy)
- **6% mana**, cooldown **6 s**, instant, **one ally or yourself within 30 m**.
- Heals the target **240% SP** and removes **one** Poison, Curse or Magic debuff (the paladin's
  dispel; types per page 05 §10.2). Then the heal **washes outward**: a ripple from the target heals the **2 lowest-health allies within
  6 m of them** for **40%** of that amount (no dispel on the ripple).
- Targeting: **Needs target** — an ally or yourself (`F1`, `F2`–`F5`, click a frame). It will not cast on an
  enemy target; with an enemy targeted and **Self-cast fallback** on (page 04), it heals you.
- Tags: `tag_holy`, `tag_spell`, `tag_heal`.
- Riders — **Keeping:** on yourself, also a barrier of **10% max health** for 6 s. **Mercy:** **2 charges**,
  **+30% healing** and the ripple reaches **3** allies. **Dawnfire:** you are healed for **30%** of the
  main amount too.
- Fulfilled on a **dead** ally: revive at 40% health (§2.2).
- Looks: Chibi 2 `castPoint`; a white-gold wave of light rolls from the paladin to the target (spellfx
  `beam`, low, 0.25 s), spellfx `heal` on the target, then a gold `ring` spreads 6 m from their feet and
  thin arcs jump to the ripple targets.
- Sound: `heal`, then a soft rushing-water swell (`spell.water.travel` pitched up) for the ripple.

**3. `paladin_hallowed_ground` — Hallowed Ground** (level 10) — **group heal-over-time + tank damage**
- **10% mana**, cooldown **18 s**, instant, a **7 m circle centred where you stand**, lasts **10 s** (it stays
  put when you move).
- Enemies inside take **25% WD holy every 1 s**; allies inside heal **1.2% max health every 1 s**.
- Targeting: **Self** (drops at your feet). Talent **Thrown Ground** makes it **Ground**.
- Tags: `tag_holy`, `tag_spell`, `tag_area`, `tag_duration`, `tag_heal`.
- Riders — **Keeping:** enemies inside deal **10% less**, ticks make threat ×2. **Mercy:** healing ×2 and
  radius **9 m**. **Dawnfire:** undead/demons inside are snared 40% and take ×1.5.
- Looks: a gold `rune_ring` ground disc 7 m with rising `holy_mote` particles; enemies inside get a faint
  gold rim.
- Sound: `spell.holy.launch` then a soft choir-like hum (`status.regen.tick` every 1 s).

**4. `paladin_aegis_of_the_vow` — Aegis of the Vow** (level 18) — **the emergency shield**
- **8% mana**, cooldown **20 s**, instant, **one ally or yourself within 30 m**.
- Barrier worth **25% of the paladin's max health**, 8 s. When it breaks or expires it **pushes** enemies
  within 4 m of the target back 4 m.
- Targeting: **Needs target** (ally or self).
- Tags: `tag_holy`, `tag_spell`, `tag_shield`.
- Riders — **Keeping:** every enemy that hits the shielded ally is taunted to you for 3 s. **Mercy:** when the
  barrier breaks, the ally heals **15% of their max health**. **Dawnfire:** the barrier reflects **30%** of what
  it absorbs as holy damage.
- Looks: spellfx `STATUS_FX.barrier` recoloured gold, a `shield_ring` that cracks as it depletes.
- Sound: `status.barrier.apply`; a bright chime on break.

**5. `paladin_dawnspear` — Dawnspear** (level 28)
- **8% mana**, cooldown **12 s**, **1.0 s cast** (you can turn but not walk), a **line 20 m × 2 m**. **200% WD
  holy** to every enemy on it (pierces all).
- Targeting: **Auto-target** — aimed at your hard target; with none, at the valid enemy nearest your aim
  point within 20 m; with no enemy in range it fires straight ahead.
- Tags: `tag_holy`, `tag_spell`, `tag_ranged`, `tag_area`.
- Riders — **Keeping:** everything hit is taunted 3 s (the ranged pull). **Mercy:** allies standing in the
  line are healed **150% SP**. **Dawnfire:** undead/demons hit are **stunned 1.5 s** (boss: interrupted).
- Looks: Chibi 2 `castPoint` then `thrust`; spellfx `beam` (radius 0.35, gold) laid flat along the line,
  `holy_mote` sparks along its length.
- Sound: `spell.holy.launch` + `spell.holy.travel` (fast), `spell.holy.impact` on each hit.

**6. `paladin_covenant` — Covenant of the Unbroken** (level 40) — **the big cooldown**
- **20% mana**, cooldown **180 s**, instant, a **15 m circle that follows you**, **10 s**.
- Base: allies inside take **15% less damage**.
- Targeting: **Self**.
- Tags: `tag_holy`, `tag_spell`, `tag_aura`, `tag_area`, `tag_duration`.
- Riders — **Keeping** (tank cooldown): **40% of the damage** allies inside take is moved onto you, and you
  take **40% less damage**. **Mercy** (healer emergency): allies inside **cannot drop below 1 health for the
  first 4 s**; when the covenant ends, each ally inside heals **20% of max health**. **Dawnfire:** a holy nova
  on cast, **350% WD** in 15 m, and allies' hits deal +10% extra holy for the duration.
- Looks: a huge gold `rune_ring` dome (ring + vertical `pillar`, radius 15 m, low opacity); thin gold threads
  from each ally to the paladin under Keeping.
- Sound: `bell.toll` + `spell.holy.impact`; `revive` stinger under Mercy.

### 3.3 Rotation / how it plays

- **Solo:** Dawnfire from 20 (Keeping before that). Hallowed Ground where you will fight, Oathbound Strike on
  cooldown, Dawnspear to pull, Wave of Mending on yourself (`F1`) when under 60%, Aegis on yourself before an
  elite's big hit.
- **Dungeon tank (Keeping):** Dawnspear or Oathbound Strike to pull, drop Hallowed Ground under the pack (10%
  less damage + threat), Oathbound Strike taunts the stray, Aegis on yourself for the tank buster or on the
  healer when adds reach them (the Keeping rider taunts them off). Covenant for a boss's burn phase.
- **Challenge mode tank:** the same, with Aegis held for the tank buster rather than spent on adds, and
  Keeping Covenant saved for the phase where the whole group is taking room-wide damage (it moves 40% of it
  onto you at −40%). Twin Oath (40+) Keeping + Mercy is the "tank who also heals" build for a weak healer.
- **Dungeon healer (Mercy):** see §5.

### 3.4 Boss mechanics

| Mechanic (page 11) | Paladin |
|---|---|
| Soak (orange) | Aegis on a soaker absorbs 25% of the paladin's max health of it; Keeping Covenant takes 40% of every soaker's hit. |
| Tank buster | Aegis on self, Covenant under Keeping. |
| Tank swap | the Keeping riders taunt (Oathbound Strike, Dawnspear); the shared **Provoke** (page 07, level 10) is the dedicated single-target taunt. |
| Room-wide damage | Mercy Covenant (cannot drop below 1 health for 4 s) is the group's "stop the wipe" button. |
| Dispel | Wave of Mending removes one Poison / Curse / Magic debuff every 6 s (two with Mercy's charges). |
| Void / danger zones | Slow class: Dawnspear's cast roots walking. Movement only from the tier-1 **Dawnstride** talent and the dodge roll. |
| Undead/demon bosses | Oathbound ×2 and always crits demons; Dawnfire Dawnspear stuns (interrupts a boss). |
| Revive | Fulfilled Wave of Mending on a dead ally (in combat, as often as the ring fills), the tier-4 **Past the Threshold** talent, plus page 05's normal out-of-combat revive. No per-fight limit. |
| Interrupt | Dawnfire Dawnspear on undead/demons only; tier-2 **Rebuke** (Oathbound Strike) interrupts anything. |

---

## 4. Alternate spells

None — oaths change riders, not the bar. Twin Oath (40+) applies two riders at 70% each. The seal and
colours change with the oath (§2.4).

---

## 5. The hybrid role — Healer (Oath of Mercy)

**How:** set the canon **Role focus** switch (00 §6; spellbook, out of combat, saved per Loadout) to **Hybrid** —
which is the same as swearing **Mercy** (§2.1; the two are tied). What it changes: the Keeping riders (taunts,
threat ×3) and the Keeping aura give way to the Mercy riders and aura, Sanctity is built by healing instead of by
holding threat, and the Dungeon Finder queues you as Healer. Every spell keeps its slot and its base numbers; the
Mercy riders turn the bar into a healer's bar:

| Spell | Under Mercy it is… |
|---|---|
| Wave of Mending | the main heal: 2 charges, 240% SP +30% = **312% SP**, ripple to 3 allies at 40% |
| Hallowed Ground | the group heal: **2.4% max health/s** in a 9 m circle for 10 s (24% total per ally standing in it) |
| Aegis of the Vow | the pre-shield: 25% of your max health, then a 15% max-health heal when it breaks |
| Oathbound Strike | a heal you swing: 80% of the damage dealt goes to the lowest ally within 20 m, and it refunds mana |
| Dawnspear | a line heal: 150% SP to every ally in the 20 m line |
| Covenant | the emergency: nobody inside drops below 1 health for 4 s, then 20% max-health heal to all |

**Talents that lean healer:** Wave of Mending t1b **Lingering Wave**, t2c **Consoling Wave**, t3b **Last
Wave**; Hallowed Ground t1a **Walking Ground** (so the circle follows you to the tank) and t2c **Sunwell**;
Dawnspear t2b **Lance of Mercy**; Covenant t4a **Final Covenant**.

**Gear:** a psalter or other focus in the off hand instead of a shield (+spell power), INT and healing affixes,
`tag_heal` bonuses; the **Oathkeeper's Harness** 6-piece (Hallowed Ground carries both riders) makes the
tank-healer Twin Oath build work before 40's Twin Oath lands.

**How well:** a Mercy paladin's healing over a 3-minute boss fight is about **80%** of a Cleric's (the
primary healer) and its single-target burst is about **110%** of it (Wave + Aegis + Fulfilled Wave). That is
enough for the **open world, every Normal dungeon and Depth up to about 10**. In **Challenge mode** it falls
behind for two concrete reasons: its only strong group heal (Hallowed Ground) is a **fixed 9 m circle on an
18 s cooldown**, and Challenge bosses spread the party with Targeted (yellow) circles and danger zones so the
group is rarely inside it; and a Mercy paladin who stops swinging runs out of mana in about 90 s (§2.5),
while Challenge fights make melee uptime on a boss unreliable. Challenge groups should expect a Mercy paladin
to heal *with* a second healer-ish hybrid or to play Twin Oath as a tank.

---

## 6. Utility spells

| id | Name | Cast | Effect |
|---|---|---|---|
| `paladin_swear_oath` | Swear Oath | 1 s, out of combat, no slot, no mana | opens the oath wheel (`Shift+1`–`3` swear one directly); picks Keeping, Mercy or (20+) Dawnfire; after calling 40, two of them (Twin Oath). Tags: `tag_holy`, `tag_aura`. |

No travel spell (page 00 §6 gives those to four other classes).

---

## 7. Talents

Id = spell id + `_t<tier><letter>`. A tier opens at its level or when the spell unlocks, whichever is later.

### Oathbound Strike
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Hammer of Vows** — becomes a thrown sceptre/sword-light, 20 m, same numbers (adds `tag_ranged` `tag_projectile`, loses `tag_melee`). | **Twofold Strike** — two swings, 2 × 75% WD; the rider fires on the second. | **Wide Strike** — 5 m, 140° cone. |
| 2 (22) | **Rebuke** — interrupts (locks the spell 3 s); 2 s extra cooldown. | **Sanctified Blade** — for 6 s after, your basic attacks deal +20% as holy. | **Light's Tithe** — each hit restores a further 0.5% mana. |
| 3 (32) | **Unmasking** — also reveals hidden or invisible enemies in 10 m and marks them 6 s. | **Kindled Vow** — gives +8 Sanctity per enemy hit. | **Judged** — the target takes 10% more from holy damage for 8 s. |
| 4 (45) | **Descending Light** — a column of light falls on the target 0.8 s later for another 100% WD. | **Oath Echo** — the rider also fires on the second-nearest enemy. | — |

### Wave of Mending
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Long Wave** — range 40 m and the ripple reaches 10 m. | **Lingering Wave** — half the heal lands now, the other 60% over 6 s. | **Cleansing Wave** — removes **all** removable debuffs from the main target. |
| 2 (22) | **Swift Wave** — cooldown 4 s. | **Wave of Iron** — every ally it heals (ripple too) takes 10% less damage for 5 s. | **Consoling Wave** — overhealing becomes a barrier (max 10% of their health). |
| 3 (32) | **Keeping Wave** — casting it on an ally taunts that ally's attackers to you for 2 s. | **Last Wave** — ×2 on an ally below 25% health. | **Returning Wave** — the ripple always includes you. |
| 4 (45) | **Past the Threshold** — may target a dead ally without Sanctity: 3 s cast, revive at 30% health; puts Wave of Mending on a 30 s cooldown. No per-fight limit. | **Full Measure** — a full heal to 100% on the main target; costs all your remaining mana and puts the spell on a 120 s cooldown. | — |

### Hallowed Ground
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Walking Ground** — the circle follows you. | **Thrown Ground** — targeting becomes **Ground**, placed anywhere within 30 m. | **Narrow Ground** — 4 m, but every number ×1.6. |
| 2 (22) | **Rooted Ground** — the first time an enemy enters, it is rooted 1.5 s. | **Pure Ground** — allies inside are immune to Poison-type statuses (page 05 §10.2). | **Sunwell** — allies inside regain 0.5% mana per second. |
| 3 (32) | **Growing Ground** — radius +1 m each second (max 12 m). | **Sanctified Blades** — allies inside deal +8% as holy. | **Warding Ground** — each ally entering gets a barrier of 5% max health (once per cast). |
| 4 (45) | **Last Light** — when it ends, it bursts for 150% WD to enemies and 5% max-health heal to allies. | **Twin Grounds** — 2 charges. | — |

### Aegis of the Vow
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Twin Aegis** — also shields a second ally at half strength (the lowest-health ally within 10 m of the target). | **Moving Aegis** — you dash to the ally (up to 20 m) as you cast it (adds `tag_movement`). | **Deep Aegis** — 35% of your max health, but 5 s. |
| 2 (22) | **Answering Aegis** — the push becomes a 1 s stun (boss: no effect). | **Sheltering Aegis** — the ally is immune to knockback while it holds. | **Purging Aegis** — cast removes one debuff. |
| 3 (32) | **Mirror Aegis** — you also get a barrier of half the size. | **Returning Aegis** — whatever is left when it expires returns 50% as mana. | **Sacred Aegis** — while it holds, the ally cannot be crit. |
| 4 (45) | **Aegis of the Martyr** — cast on an ally below 20% health: they cannot die for 3 s; cooldown +20 s. | **Spread Aegis** — shields every ally in a 6 m circle at 40% strength (adds `tag_area`). | — |

### Dawnspear
| Tier | a | b | c |
|---|---|---|---|
| 1 (12)\* | **Dawnstride** — you ride the spear: dash to its end (20 m), immune to damage 0.3 s (adds `tag_movement`). | **Instant Dawn** — no cast time, 14 m. | **Fan of Dawn** — three spears in a 30° fan, 70% each. |
| 2 (22)\* | **Blinding Dawn** — enemies hit are blinded 3 s (miss 50%). | **Lance of Mercy** — heals allies on it for 150% SP whatever your oath. | **Burning Dawn** — leaves a 6 s holy fire line, 20% WD a second (adds `tag_duration`). |
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

## 8. Class sets

### `set_paladin_oathkeeper` — Oathkeeper's Harness (levelling set)
Drops on **Normal** at the dungeon's own level and on **Challenge** at item level 60: head `d07_thornheart`
final boss, chest `d08_moonwell_ruins` final boss, legs `d11_saltdeep_cathedral` boss 3, hands `d05_glass_tombs`
final boss, feet `d06_sandsworn_vault` boss 2, off hand (tome `it_oathkeeper_psalter`) `d14_ashen_reliquary`
boss 3.
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Sanctity builds 25% faster under every oath. | the ring |
| 4 | A Fulfilled spell also fires **the rider of your other oath** (the last one you swore) at 50%. | all six |
| 6 | Hallowed Ground carries **both** Keeping and Mercy riders at once, whatever your oath. | Hallowed Ground |

### `set_paladin_dawnwarden` — Regalia of the Dawnwarden (endgame set; was the raid set)
Raids are gone (page 00 W6), so the set has a new source: **Challenge-mode `d15_fire_court` and
`d16_the_spire` bosses** (one piece per boss, six bosses across the two, once a week each per the Challenge
loot limit) and the **end chest of any dungeon at Depth 10 or deeper** (8% chance of a piece you do not own).
| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Aegis of the Vow has 2 charges. | Aegis |
| 4 | Dawnspear's cast is instant while Covenant is up, and it fires from every ally inside the covenant at 30%. | Dawnspear, Covenant |
| 6 | Covenant's cooldown drops 10 s every time you finish a vow (reach 100 Sanctity). | Covenant |

---

## 9. Class legendaries, uniques and souls

### Legendaries
| id | Name | Slot / base | Power | Drop source |
|---|---|---|---|---|
| `leg_the_kept_promise` | The Kept Promise | one-handed sword | **Promise Kept** — Sanctity no longer resets on Fulfilled; instead it drops to 50. | `d15_fire_court` final boss, Challenge mode |
| `leg_sceptre_of_first_light` | Sceptre of First Light | sceptre | **First Light** — Hallowed Ground's first tick heals allies inside for 15% max health and hits enemies for 150% WD. | `d08_moonwell_ruins` final boss, Challenge mode or Depth 5+ |
| `leg_the_martyrs_tabard` | The Martyr's Tabard | medium chest | **Willing Martyr** — Keeping Covenant moves 60% of damage onto you (not 40%), and you heal for 10% of the damage moved. | the world boss of `drowned_coast` (page 13) |
| `leg_vowbreaker_hymnal` | Hymnal of the Broken Vow | off hand (tome) | **Penance** — breaking a vow no longer drains Sanctity; it fires a holy nova of 100% WD per 10 Sanctity it would have cost. | end chest of any dungeon at **Depth 15+** (paladin-only roll) |

### Uniques
| id | Name | Slot | Power | Drop source |
|---|---|---|---|---|
| `uq_seal_of_the_first_vow` | Seal of the First Vow | ring | You may change oath once in combat before calling 20 (no Sanctity loss). | `d01_hollow_barrow` final boss |
| `uq_dawnspear_greaves` | Dawnward Greaves | medium legs | Dawnspear's cast is 0.5 s and it is 26 m long. | `d05_glass_tombs` boss 2 |
| `uq_consoling_gauntlets` | Consoling Gauntlets | medium hands | Wave of Mending on a target with an Aegis refreshes the Aegis to full. | `d09_warmasters_pit` boss 3 |

### Souls (page 08 §Sockets; page 09 catalogue)
| id | Name | Socket | Requirement | Effect | Source |
|---|---|---|---|---|---|
| `soul_rising_tide` | Soul of the Rising Tide | weapon | class: paladin | **Wave of Mending changes:** the ripple no longer stops at the first ring — it jumps **up to 4 times**, each jump to the lowest-health ally within 6 m of the last one not yet healed, at 40% → 30% → 20% → 10% of the main heal. | `d11_saltdeep_cathedral` final boss (Normal 1%, Challenge 4%) |
| `soul_sworn_ground` | Soul of Sworn Ground | chest | class: paladin | **New behaviour:** each time a spell becomes **Fulfilled**, a 4 m Hallowed Ground (5 s, the current oath's rider, no mana) forms under the paladin. At most one at a time. | **Challenge-mode `d13_cindergate` final boss, 3%**, and Depth 10+ end chests, 0.5% |

---

## 10. Voice and barks

- Timbre: `shared/voices.js` role `paladin` (pitch 0.42, tone 0.65, rough 0.05 — clear, warm, even).
- Lingo tag `class:paladin`, plus the oath as a context tag (`oath:keeping` etc.) so lines match the vow.

| Moment | Lines |
|---|---|
| Swear Keeping | "Eyes on me. I swear it." |
| Swear Mercy | "No one falls today." |
| Swear Dawnfire | "The dead stay dead." |
| Oathbound Strike | "By the vow!" · "Kneel." |
| Wave of Mending | "Stand up." · "I have you." · "Breathe." |
| Aegis | "Behind the light!" |
| Covenant | "We hold together!" |
| Fulfilled | "Kept." · "It is done as I swore." |
| Vow broken | "…Forgive me." |
| Low health | "The light is thin here…" |
| Ally revived | "Not yet. You're not done." |
| Undead seen | "Rest. I'll help you." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Timbre `paladin` | `shared/voices.js` | voice |
| Look (great helm, gold-trimmed plate, white cape, tabard, `fh_sword`, `book`) | `avatar-3d/data/class-outfits.json` `classes.paladin` | default outfit; oath recolours via `dressAs` |
| Psalter focus | `prototypes/farhold/js/foci.js` `FOCUS_BASES.psalter` | off hand |
| Visual ideas of Farhold `consecrate`, `judgement`, `renew`, `rally` | `prototypes/farhold/data/skills.json` | effects only — ids/names/numbers new |
| spellfx `pillar`, `heal`, `revive`, `beam`, `ring`, `STATUS_FX.barrier` | `avatar-3d/js/spellfx.js` | Dawnspear, Wave of Mending, Covenant, Aegis |
| Clips `overhead`, `castPoint`, `thrust`, `pray`, `castBook` | `avatar-3d/js/chibi2-motion.js` | spells; `pray` for swearing an oath |
| Emberveil 2's paladin skills (`holy_strike`, `divine_shield`, and its big-heal and holy-ground skills) | `prototypes/emberveil/data/skills.json` | design ancestry only (source file ids, not Wildmarch names) |
| Sound ids | `sfx/data/catalog.json` | as listed |
| Talent engine | `prototypes/farhold/js/skilltalents.js`; new mod keys `rider`, `oath`, `redirect`, `revive`, `ripple` | talent cards |
