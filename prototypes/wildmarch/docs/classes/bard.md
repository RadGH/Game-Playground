# Bard (`bard`)

> *"Keep walking. I'll keep playing. Neither of us stops until the road does."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.2 draft — 2026-09-30 (round 2 applied). Canon: [page 00](../00-OVERVIEW.md) §6 row 7.
Every spell id, talent id, set id and item id on this page is owned here. Formulas and tags are owned by
[page 05](../05-COMBAT.md); boss vocabulary by [page 11](../11-BOSS-MECHANICS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | a share of (weapon damage × (1 + spell power)) — Farhold's rule, applied ONCE inside the strike (reuse: `prototypes/farhold/js/rpg.js` `strike`). Page 05 owns the formula |
| **% spell healing** | the same base, paid as healing |
| **Tempo** | the bard's resource (00 §6): a pool of **100** that starts full. Other Tempo classes refill 25 a second; **the bard refills only 12 a second** and earns the rest by **keeping the beat** (§2.2) |
| **m** | metres. A Chibi 2 character is about 1.2 m tall |
| **GCD** | the 1.0 s global cooldown after a spell (00 §4). The class keys `Q` and `G` are off it |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A travelling musician whose songs are real magic: the tune changes how fast the party moves, how quickly wounds close and how brittle the enemy's armour is |
| Primary role | **Support** (counts as a Damage slot in the Dungeon Finder) |
| Hybrid role | **Healer** — Hearthsong and the healing talents (§5) |
| Build | caster |
| Armour | light |
| Weapons | main hand **dagger** or **wand**; off hand an **instrument** (a focus-style off-hand base, §9) — Lute, Warhorn, Hand Drum |
| Resource | **Tempo** (refilled by keeping the beat) + **Verses** (class mechanic) |
| Companion | none |
| Playstyle | One song is always playing around you. A metronome ticks on your HUD; cast on the tick and you get Tempo back, so a good bard plays in rhythm. Every few seconds of an unbroken song adds a verse; at four verses you can end the song with a **Finale**, a big one-off effect, and start the next song from zero |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `bard`): *Ballad of Valor
gives one hero two turns; Song of Ruin strips all enemy buffs.* Both live on here — Ballad of Valor as
**Standing Ovation** (one ally's cooldowns run double speed) and Song of Ruin as the **Dirge's Finale**
(strips every buff in 20 m).

---

## 2. Class mechanic — Songs, Verses and the Beat (new)

### 2.1 Songs and Verses

1. Three of the bard's six spells are **songs**: `bard_marching_cadence`, `bard_hearthsong`,
   `bard_dirge_of_unmaking`. Casting one starts it; it keeps playing until you start a different song,
   perform its Finale or die. Songs have **no upkeep**: you pay the start cost once.
2. **Only one song plays at a time.** Starting another ends the current one (calling 2 adds an overlap).
3. A playing song is an **aura** — a ring 20 m round the bard (the instrument changes the radius, §9). It
   reaches party members and the bard; the Dirge reaches enemies.
4. Songs play while you move, jump, dodge-roll and cast other spells. Being **stunned, silenced or knocked
   down** pauses the song (no verse gain) but does not end it.
5. **Verses** (0–4; 0–6 after calling 3) build while the same song keeps playing:
   * +1 every **3.0 s** of unbroken play;
   * +1 on each `bard_sharp_note` hit (once per cast);
   * +1 on each `bard_discordant_chord` that hits at least one enemy.
6. Each verse **strengthens the playing song** (numbers in each song's row).
7. **Finale:** press the **class key `Q`** ([page 02](../02-CONTROLS.md) `classKey`) while the playing song has
   **4 or more verses**. The Finale fires, spends every verse and the song ends. Each verse above 4 adds +15% to
   the Finale. No Finale is possible before calling 1.
8. **Next song:** the **second class key `G`** (`classKey2`) switches to the next learned song in the order
   Cadence → Hearthsong → Dirge (same cost as pressing that song's own key).

### 2.2 The Beat (how Tempo refills)

| Rule | Value |
|---|---|
| Pulse | one **beat** every **0.75 s** (80 beats a minute). The instrument sets it: Hand Drum 0.6 s, Lute 0.75 s, Warhorn 0.9 s |
| On the beat | a spell **or a basic attack** started within **±0.15 s** of a pulse is *on the beat* |
| Reward | on the beat: **+8 Tempo** back, and the playing song's timed verse moves **0.5 s** closer |
| Streak | **6 on-beat starts in a row** = **In the Pocket**: Tempo refills **+50%** (18 a second) for 6 s; the ribbon turns gold. An off-beat start breaks the streak |
| Off the beat | no penalty — just no bonus |
| Latency | the server judges the beat from the time the client pressed the key (page 16 netcode note); the window is wide enough for 150 ms ping |
| Accessibility | setting `set.gameplay.bard_beat_cue` (**on** by default; page 04 to add): shows a shrinking ring on the Q/1–6 keys that closes on the beat, plus a soft click. A second setting `set.gameplay.bard_beat_sound` (on/off) toggles the click only |

**What the numbers mean.** A bard casting Sharp Note (20 Tempo) on every second beat spends about 13 Tempo a
second and takes back 12 + 5 = 17: it never runs dry. Off the beat the same bard loses about 1 a second and can
keep going for over a minute; with a song change and a Chord or two in the mix, an off-beat bard runs dry in
about 25 s. **Playing in rhythm is how a bard keeps a full rotation.**

### 2.3 Gauge UI (reuse the HUD resource-bar slot: `prototypes/farhold/js/hud.js`)

| Element | Where | What it shows |
|---|---|---|
| **Tempo bar** | the resource slot | yellow bar 0–100 |
| **Staff ribbon** | directly above the Tempo bar, 220 × 26 px | five horizontal lines (a musical staff). Each verse is a note head that drops onto the staff with a "plink" (`ui.click` pitched up). 4 slots, 6 after calling 3 |
| **Metronome** | a small pendulum at the left end of the ribbon | swings once per beat; flashes white on an on-beat start and gold while In the Pocket; a streak counter "4/6" under it |
| **Song label** | left of the ribbon | the playing song's name in its colour: Cadence **gold** `#e0b040`, Hearthsong **green** `#6ad07a`, Dirge **violet** `#9a60d0` |
| **Verse timer** | a thin line sweeping across the ribbon | progress to the next timed verse (3.0 s) |
| **Finale glow** | the ribbon border | pulses in the song colour once 4 verses are banked. The `Q` slot shows a gold "Finale" badge |
| **Range ring** | on the ground, 20 m | a faint dotted ring in the song colour, visible only to the bard (`set.gameplay.bard_song_ring`, default on — page 04 to add) |
| **Party frames** | page 03 party list | a note icon beside every ally inside the song; greyed when they are out of range |

### 2.4 Calling quests (page 14 owns content)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_calling_bard_1` | **The First Verse** — learn an old walking-song from a blind piper at Brightwater and play it at three farms in one afternoon, in time with the mill wheel | **Verses and Finales** turn on; `Q` (Finale) and `G` (next song) light up. Before this, songs play with no verses. **The Beat** is on from level 1 |
| 20 | `q_calling_bard_2` | **Harmony** — gather three lost stanzas in Anvilgate's taverns, the Glass Tombs echo-hall and a Sandsworn camp | **Overlap:** the song you leave keeps playing for **6 s** at its current verses beside the new one. Switching songs **keeps half your verses** (rounded down) |
| 40 | `q_calling_bard_3` | **The Grand Medley** — conduct the frozen choir of Rimehold's open-air amphitheatre while ice wolves come down the slope | **Max verses 6.** A Finale performed at **6** verses is a **Medley**: the other two songs' Finales also fire at 40% strength |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `bard_sharp_note` | Sharp Note | 20 Tempo | — | 1.0 s | Auto-target | 35 m | bolt | `tag_spell` `tag_arcane` `tag_ranged` `tag_projectile` | 115% spell damage, +1 verse |
| 2 | 4 | `bard_marching_cadence` | Marching Cadence | 30 Tempo | 1.5 s | instant | Self | 20 m aura | song | `tag_spell` `tag_aura` `tag_duration` | party +10% move, +6% attack/cast speed |
| 3 | 10 | `bard_hearthsong` | Hearthsong | 35 Tempo | 1.5 s | instant | Self | 20 m aura | song | `tag_spell` `tag_nature` `tag_aura` `tag_duration` `tag_heal` | party heal 1.0% max health / 2 s (+0.4% per verse) |
| 4 | 18 | `bard_discordant_chord` | Discordant Chord | 25 Tempo | 14 s | instant | Self (cone ahead) | 8 m | cone 70° | `tag_spell` `tag_arcane` `tag_area` | 90% spell damage, interrupt, Dazed |
| 5 | 28 | `bard_dirge_of_unmaking` | Dirge of Unmaking | 35 Tempo | 1.5 s | instant | Self | 20 m aura | song (enemy) | `tag_spell` `tag_arcane` `tag_aura` `tag_duration` `tag_curse` `tag_area` | enemies take +5% damage (+1.5% per verse) |
| 6 | 40 | `bard_standing_ovation` | Standing Ovation | 40 Tempo | 90 s | instant | Ally | 40 m | one ally or self | `tag_spell` `tag_duration` | cooldowns tick ×2, +20% damage and healing, 8 s |

### 3.2 Spell details

#### `bard_sharp_note` — Sharp Note (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 20 Tempo · none (GCD only) |
| Cast | 1.0 s cast time; cannot move while casting (talent `t1b` makes it instant). The *start* is what counts for the beat |
| Targeting | **Auto-target** — your target, or the enemy nearest the aim point within 35 m (talent *Grace Note* adds **Ally**) |
| Range / shape | 35 m bolt, 0.4 m hit radius, 26 m/s, stops on the first enemy |
| Tags | `tag_spell` `tag_arcane` `tag_ranged` `tag_projectile` |
| Effect | **115% spell damage** (arcane) |
| Mechanic | **+1 verse** on hit (once per cast) |
| Visuals | spellfx `projectile` element `arcane`, shape `rune` with a gold tint `#e0b040` — a spinning quaver glyph; `impact` arcane at 0.6 scale |
| Sound | a single plucked lute string (`bard.note`, pitch follows the verse count 1→6 up a scale); impact `spell.arcane.impact` |

#### `bard_marching_cadence` — Marching Cadence (slot 2, level 4) — SONG

| Field | Value |
|---|---|
| Cost / cooldown | 30 Tempo · 1.5 s (between song starts) |
| Cast | instant; plays while moving |
| Targeting | **Self** (aura) |
| Range / shape | aura, 20 m radius round the bard; party members and the bard |
| Tags | `tag_spell` `tag_aura` `tag_duration` |
| Effect | **+10% move speed** and **+6% attack and cast speed**. Each verse adds **+2% move** and **+1.5% attack/cast speed** (4 verses: +18% / +12%) |
| Finale — *Forced March* | every party member in range: **+40% move speed** and **immune to slows, roots and snares for 3 s**, and one free dodge roll (no stamina) usable for 3 s. A dedicated escape from void zones and danger zones |
| Statuses | `haste` (page 05 row, re-tuned to these numbers) on each ally |
| Visuals | gold motes swirl at the bard's feet; allies in range show the `haste` aura; Finale: spellfx `pillar` element `holy`, radius 20, tinted gold, plus the `haste` aura bursting on every ally |
| Sound | a fast drum-and-fife loop `bard.song.cadence` whose tempo matches the beat; Finale `status.haste.apply` + a horn blast |

#### `bard_hearthsong` — Hearthsong (slot 3, level 10) — SONG

| Field | Value |
|---|---|
| Cost / cooldown | 35 Tempo · 1.5 s |
| Cast | instant; plays while moving |
| Targeting | **Self** (aura) |
| Range / shape | aura, 20 m |
| Tags | `tag_spell` `tag_nature` `tag_aura` `tag_duration` `tag_heal` |
| Effect | every 2 s heals each party member in range for **1.0% of their max health**, +**0.4%** per verse (4 verses: 2.6% every 2 s = 1.3% a second) |
| Finale — *Homecoming* | heals every party member in range for **25% of their max health** and gives a **shield of 10% max health for 8 s** (`tag_shield`) |
| Statuses | `regen` (page 05 row, re-tuned) |
| Visuals | green leaf-and-mote swirl (spellfx `heal` at each tick, 0.5 scale, only on allies who were healed); Finale rising motes plus a shield outline |
| Sound | a slow lute ballad loop `bard.song.hearth`; Finale `heal` + a held chord |

#### `bard_discordant_chord` — Discordant Chord (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 25 Tempo · 14 s |
| Cast | instant, usable while moving |
| Targeting | **Self** — a cone in the direction you face (needs no target) |
| Range / shape | cone 8 m long, 70° wide |
| Tags | `tag_spell` `tag_arcane` `tag_area` |
| Effect | **90% spell damage** (arcane) to all enemies in the cone. **Interrupts** any gold-bordered cast (page 05 §12) of every enemy hit |
| Statuses | **Dazed** 3 s on everything hit; non-elite enemies are also **Stunned** 1.5 s |
| Mechanic | +1 verse if it hits anything |
| Visuals | spellfx `breath` element `arcane`, length 8, arc 1.22 rad, ms 250 — drawn as expanding violet rings; `impact` arcane at 0.5 scale on each target |
| Sound | a harsh three-string scrape `bard.chord` + `status.dazed.apply` |

#### `bard_dirge_of_unmaking` — Dirge of Unmaking (slot 5, level 28) — SONG (enemy)

| Field | Value |
|---|---|
| Cost / cooldown | 35 Tempo · 1.5 s |
| Cast | instant |
| Targeting | **Self** (aura that reaches enemies) |
| Range / shape | aura, 20 m; affects **enemies** inside it |
| Tags | `tag_spell` `tag_arcane` `tag_aura` `tag_duration` `tag_curse` `tag_area` |
| Effect | enemies take **+5% damage from all sources**, +**1.5%** per verse (4 verses: +11%). Every **6 s** the Dirge **strips one removable buff** from each enemy in range (the newest). Does not stack with a second bard's Dirge (the higher one wins) |
| Finale — *Last Verse* | **180% spell damage** (arcane) to every enemy in 20 m and **strips every removable buff** from them. A boss's enrage (page 11) is never removable; boss "empower" buffs marked `dispellable` are |
| Statuses | `curse` aura (spellfx), in violet |
| Visuals | slow violet ripples outward every 2 s (spellfx `ring` axis ground, r0 1 → r1 20, 1.2 s); Finale spellfx `vortex` element `shadow`, radius 20, ms 900, then `aoe` arcane on every enemy |
| Sound | minor-key cello drone `bard.song.dirge`; Finale `spell.shadow.impact` layered with a choir cut-off |

#### `bard_standing_ovation` — Standing Ovation (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 40 Tempo · 90 s |
| Cast | instant |
| Targeting | **Ally** — a party member in 40 m (`F2`–`F5` or their frame), or yourself (`F1`) |
| Range / shape | one ally |
| Tags | `tag_spell` `tag_duration` |
| Effect | for **8 s** the target's **spell cooldowns tick twice as fast**, and they deal **+20% damage and healing**. The playing song counts **double** on the target (Hearthsong heals them twice per tick) |
| Rule | one Ovation per target at a time; a second bard's Ovation on the same person refreshes, it does not stack |
| Statuses | `rally` aura in gold on the target |
| Visuals | a spotlight: spellfx `beam` from 12 m above onto the target, radius 1.2, colour `#fff0b0`, life 8 s, opacity 0.35; confetti of `holy_mote` sprites on cast |
| Sound | a fanfare `bard.ovation` + crowd-cheer sweetener |

### 3.3 How it plays

* **Solo (levelling):** Cadence while travelling (or the Road Song utility out of combat). In a fight, Sharp
  Note on every second beat, Chord when enemies close in, switch to Hearthsong if health drops below half,
  Finale *Homecoming* as your "potion". From 28, open packs with the Dirge and end them with *Last Verse*
  (180% on everything is the bard's biggest area hit).
* **Normal dungeon (Support):** hold the **Dirge** on bosses (+11% party damage at 4 verses) and spend its
  Finale when a boss gains an empower buff. Swap to **Cadence** 10 s before a known movement phase so the
  verses are up for *Forced March*. Ovation on the best damage dealer in the boss's vulnerable window. Chord is
  the group's second interrupt.
* **Challenge and Depth:** stand in the middle so 20 m covers melee and ranged. A Medley (calling 3) at 6
  verses gives heal + speed + dispel in one press — call for it before a room-wide attack. Keep the streak:
  In the Pocket is what pays for a Chord *and* a song change in the same ten seconds.

### 3.4 Boss mechanics

| Mechanic | Bard answer |
|---|---|
| **Soak** (orange circle) | can soak like anyone; Hearthsong ticks keep soakers topped up |
| **Void zone** | every song plays while moving; *Forced March* gives the whole party +40% speed and root immunity for 3 s |
| **Danger zone** | no teleport of its own. Talent `bard_marching_cadence_t2a` adds a 6 m dash to the Finale |
| **Interrupt** | Chord interrupts (14 s). Cone — face the caster |
| **Dispel enemy buffs** | Dirge strips one each 6 s; *Last Verse* strips all |
| **Immunities** | none. Talent `bard_hearthsong_t4c` gives a party cheat-death on *Homecoming* |
| **Spread** | songs reach 20 m, so spreading for yellow targeted circles does not break the song for anyone within 20 m |

---

## 4. Alternate spells

None. The bard's bar never swaps. The **Finale** is the class key `Q`, and `G` steps to the next song.
With calling 2's overlap the HUD shows the fading song as a second, thinner ribbon for its 6 s.

---

## 5. The hybrid role — Healer

The bard heals by **keeping Hearthsong playing all fight** and turning its other spells toward allies with
talents. It is a steady, whole-party healer with one big burst (*Homecoming*) and a cheat-death; it is weak at
saving one person from a sudden spike, because it has only one targeted heal (*Grace Note*).

**Role focus** (canon 00 §6): the bard uses the shared **Role focus** switch in the spellbook (out of combat,
saved per Loadout). **Hybrid** queues it as **Healer**; the spells themselves turn into their healer versions
through the talents in §5.2, which a Hybrid Loadout normally takes. **Primary** queues it as Support.

### 5.1 The healer kit

| Spell | As a healer | Numbers |
|---|---|---|
| Hearthsong (song) | always on | 1.3% max health a second to each ally at 4 verses; with *Wide Hearth* 28 m |
| *Homecoming* (Hearthsong's Finale) | the party-wide burst | 25% max health + a 10% shield, every ~12 s of play at 4 verses |
| Sharp Note → **Grace Note** (`bard_sharp_note_t2b`) | the one targeted heal; targeting becomes **Ally** (or Auto-target on an enemy for damage) | 120% spell healing, still +1 verse |
| Discordant Chord → **Soothing Chord** (`bard_discordant_chord_t2d`) | cone heal on allies in front | 110% spell healing to allies in the cone; still interrupts enemies in it |
| Standing Ovation | on the bard itself or the main healer | doubled Hearthsong ticks and +20% healing |
| `bard_hearthsong_t2b` *Cleansing Verse* | the dispel | removes one harmful status per ally every 4th verse |
| `bard_hearthsong_t4c` *Not This Time* | the save | *Homecoming* gives 6 s of cheat-death to every ally |

### 5.2 Talents that turn spells into healer versions

`bard_sharp_note_t2b` *Grace Note* · `bard_discordant_chord_t2d` *Soothing Chord* · `bard_hearthsong_t1a`
*Lullaby of Home* (single-target focus) or `t1b` *Wide Hearth* · `bard_hearthsong_t2a` *Kindling* (overheal →
shield) · `bard_standing_ovation_t1a` *Ensemble* (three healing-boosted allies).

### 5.3 Gear

Spell healing affixes (page 08), a **Lute** off hand (+8% spell healing), the healer set
`set_bard_hearthkeeper` (§8), and the `tag_heal` bonus on relic-type items.

### 5.4 Dungeon Finder and how well it heals

A bard with Hearthsong learned (level 10) and Role focus on **Hybrid** queues as **Healer**.

| Content | Bard healer vs a primary healer (cleric, priest, oracle, druid, shaman) |
|---|---|
| Open world and Normal dungeons | ≈ **75%** of the healing output, **110%** of the party-wide healing — comfortable |
| Depth 1–10 | ≈ **70%**; fine with a careful tank |
| Depth 11+ and Challenge | ≈ **60%** — a boss that spikes one player for 60% of their health in one hit needs a second healer or a primary one |

---

## 6. Utility spells

### `bard_road_song` — Road Song (out of combat, no slot)

| Field | Value |
|---|---|
| Unlocks | level 8 (page 07 lists it on the class line) |
| Cost / cooldown | none · none |
| Cast | instant; a toggle |
| Targeting | **Self** (20 m aura) |
| Effect | party members within 20 m move **+15% faster on foot**. Does not work while mounted, does not stack with a mount or with Marching Cadence, and does not speed up Travel Methods |
| Ends | when the bard or anyone it affects enters combat; resume it by pressing again |
| Tags | `tag_spell` `tag_aura` |
| Looks / sound | a quiet whistled tune `bard.road_song`; a faint gold line of notes trails behind each ally |

---

## 7. Talents

A spell's tiers open at **12 / 22 / 32 / 45**; a tier whose level came before the spell was learned opens the
moment the spell is learned (00 §10). One choice per tier (reuse the one-node-per-tier rule of
`prototypes/farhold/js/skilltalents.js`). Every choice changes what the spell does. **[heal]** marks a choice
written for the Healer role.

### `bard_sharp_note`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_sharp_note_t1a` | Triplet | fires **3 notes** in a 20° fan, each 50% spell damage; still +1 verse per cast |
| 1 | `bard_sharp_note_t1b` | Busking | cast becomes **instant**, 85% spell damage, can be cast while moving |
| 2 | `bard_sharp_note_t2a` | Resonant | on hit, the note rings: **40% spell damage** to enemies within 3 m of the target |
| 2 | `bard_sharp_note_t2b` | Grace Note **[heal]** | may target an **ally**: heals them for **120% spell healing**; still +1 verse (tags: +`tag_heal`) |
| 2 | `bard_sharp_note_t2c` | Off-Key | target is **Dazed** 2 s; no daze on bosses, but bosses take +4% from you for 4 s |
| 3 | `bard_sharp_note_t3a` | Motif | every **4th** note is a **Motif**: it bounces to 2 more targets (70% each; allies if it was a Grace Note) |
| 3 | `bard_sharp_note_t3b` | Double Stop | while at max verses, an on-beat note gives **+12 Tempo** instead of 8 |
| 4 | `bard_sharp_note_t4a` | Refrain | notes that kill a target leave a floating note for 4 s; the next note fired passes through it and splits into 3 |
| 4 | `bard_sharp_note_t4b` | Tempo Rubato | each note shortens the **playing song's verse timer** by 0.5 s (1.0 s if on the beat) |

### `bard_marching_cadence`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_marching_cadence_t1a` | Quickstep | per-verse move bonus doubles (+4%), attack speed bonus removed |
| 1 | `bard_marching_cadence_t1b` | War Drum | per-verse attack/cast speed doubles (+3%), move bonus removed |
| 2 | `bard_marching_cadence_t2a` | Double Time | *Forced March* also **dashes every ally 6 m** in the direction they are moving |
| 2 | `bard_marching_cadence_t2b` | Road Weary | the Cadence also gives allies **+15 stamina a second** (page 05 §3.2) |
| 3 | `bard_marching_cadence_t3a` | Rearguard | allies in range take **8% less damage from behind** |
| 3 | `bard_marching_cadence_t3b` | Stomp | every 3rd verse stamps a 4 m ring that **pushes enemies 2 m** away from the bard |
| 3 | `bard_marching_cadence_t3c` | Second Wind | *Forced March* also gives each ally **20 of their own resource** (Tempo, Momentum) or **60 mana** |
| 4 | `bard_marching_cadence_t4a` | Parade | *Forced March* leaves a 20 m gold trail for 6 s; allies walking on it keep +40% speed |
| 4 | `bard_marching_cadence_t4b` | Unbroken Stride | while the Cadence plays, the first **knockback or knockdown** on each ally every 20 s is ignored |

### `bard_hearthsong`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_hearthsong_t1a` | Lullaby of Home **[heal]** | ticks heal **the lowest-health ally twice** and everyone else not at all |
| 1 | `bard_hearthsong_t1b` | Wide Hearth **[heal]** | radius 20 → **28 m**, heal per tick −20% |
| 2 | `bard_hearthsong_t2a` | Kindling **[heal]** | overhealing becomes a **shield** up to 8% max health (lasts while in range) |
| 2 | `bard_hearthsong_t2b` | Cleansing Verse **[heal]** | every 4th verse **removes one harmful status** (poison, bleed, burn, curse first) from each ally |
| 3 | `bard_hearthsong_t3a` | Homecoming Feast | *Homecoming* also gives every ally **60 mana, or 20 Tempo or Momentum** |
| 3 | `bard_hearthsong_t3b` | Burning Hearth | the Hearthsong also **burns** enemies in 6 m for 20% spell damage per tick (tags: +`tag_fire`) |
| 4 | `bard_hearthsong_t4a` | The Last Song | the Hearthsong **keeps playing 12 s after you die**, and heals continue from your body |
| 4 | `bard_hearthsong_t4b` | Hearth Circle | *Homecoming* plants a 6 m green circle (Beneficial, page 11) for 10 s healing 3% max health a second |
| 4 | `bard_hearthsong_t4c` | Not This Time **[heal]** | *Homecoming* gives every ally **cheat death** for 6 s: the next killing blow leaves them at 1 health (each ally at most once every 3 min) |

### `bard_discordant_chord`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_discordant_chord_t1a` | Wail | shape becomes a **6 m circle around you** instead of a cone |
| 1 | `bard_discordant_chord_t1b` | Long Note | cone becomes a **20 m line, 2 m wide** |
| 2 | `bard_discordant_chord_t2a` | Lullaby | non-elites are put to **Sleep** 5 s instead of stunned (breaks on damage) |
| 2 | `bard_discordant_chord_t2b` | Feedback | an interrupted cast **deals 60% of its damage to its caster** |
| 2 | `bard_discordant_chord_t2c` | Crescendo | hits **+2 verses** instead of 1 |
| 2 | `bard_discordant_chord_t2d` | Soothing Chord **[heal]** | allies in the cone are **healed for 110% spell healing** (tags: +`tag_heal`) |
| 3 | `bard_discordant_chord_t3a` | Clash of Cymbals | knocks enemies **4 m back** |
| 3 | `bard_discordant_chord_t3b` | Silence | interrupted enemies are **Silenced** 3 s |
| 4 | `bard_discordant_chord_t4a` | Stolen Tune | interrupting a spell gives you its element: your next Sharp Note deals that element and +50% |
| 4 | `bard_discordant_chord_t4b` | Encore Chord | the Chord fires a **second time 1.5 s later** at 60% |

### `bard_dirge_of_unmaking`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_dirge_of_unmaking_t1a` | Narrow Dirge | radius 20 → **8 m**, damage-taken bonus per verse doubles (+3%) |
| 1 | `bard_dirge_of_unmaking_t1b` | Funeral March | enemies in range also move **15% slower** |
| 2 | `bard_dirge_of_unmaking_t2a` | Unravel | each stripped buff deals **60% spell damage** to its owner |
| 2 | `bard_dirge_of_unmaking_t2b` | Borrowed Applause | each stripped buff gives the bard **+2% damage for 10 s** (stacks 5) |
| 3 | `bard_dirge_of_unmaking_t3a` | Requiem | enemies that die inside the Dirge give **+1 verse** |
| 3 | `bard_dirge_of_unmaking_t3b` | Brittle Chorus | the damage-taken bonus becomes **armour −8% per verse** instead |
| 4 | `bard_dirge_of_unmaking_t4a` | Last Rites | *Last Verse* deals **+300% spell damage to enemies under 20% health** |
| 4 | `bard_dirge_of_unmaking_t4b` | The Silence After | *Last Verse* **Silences** every enemy hit for 4 s (bosses: interrupts only) |

### `bard_standing_ovation`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_standing_ovation_t1a` | Ensemble | also hits the **2 nearest other allies** at half strength |
| 1 | `bard_standing_ovation_t1b` | Solo | self-only; lasts **12 s** and your songs gain a verse every 1.5 s |
| 2 | `bard_standing_ovation_t2a` | Bravo | when the target lands a critical hit, **1 s** comes off Ovation's cooldown |
| 2 | `bard_standing_ovation_t2b` | Understudy | if the target dies while Ovation is on them, they are **revived at 30% health** after 3 s |
| 3 | `bard_standing_ovation_t3a` | Curtain Call | when Ovation ends, the target's **next spell has no cooldown** |
| 3 | `bard_standing_ovation_t3b` | Spotlight | enemies attacking the target **deal 15% less damage** |
| 4 | `bard_standing_ovation_t4a` | Opening Show | casting Ovation instantly gives you **full verses** on the playing song and starts **In the Pocket** |
| 4 | `bard_standing_ovation_t4b` | Magnum Opus | at the end the target releases **20% of all damage they dealt during Ovation** as a 6 m blast |

---

## 8. Class sets

Pieces: head, shoulders, chest, hands, legs, feet (6). A set is Set rarity (`#2fc4b2`).

### `set_bard_road_troupe` — Regalia of the Road Troupe (level 30, levelling)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Marching Cadence starts with **2 verses** | `bard_marching_cadence` |
| 4 | *Forced March* also gives **+25% damage for 5 s** | `bard_marching_cadence` Finale |
| 6 | Sharp Note fired during Forced March **fires 3 at once** at full damage | `bard_sharp_note` |

Source: every boss of `d07_thornheart` and `d08_moonwell_ruins` (Normal); the chest piece only from the final boss of `d08_moonwell_ruins`.

### `set_bard_mourners_choir` — Vestments of the Mourners' Choir (level 60, support)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Dirge strips a buff every **4 s** instead of 6 | `bard_dirge_of_unmaking` |
| 4 | *Last Verse* **resets Discordant Chord** and the next Chord is a 12 m cone | `bard_dirge_of_unmaking`, `bard_discordant_chord` |
| 6 | while the Dirge plays, **Standing Ovation's target also gets the Dirge's bonus** as extra damage dealt | `bard_standing_ovation` |

Source: bosses of `d15_fire_court` on **Challenge** (one piece per boss, once a week per boss, Monday 06:00).

### `set_bard_hearthkeeper` — The Hearthkeeper's Motley (level 60, healer)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hearthsong ticks every **1.5 s** | `bard_hearthsong` |
| 4 | *Homecoming* spent at 5+ verses also **revives one dead ally** in range at 20% health (the one who died most recently; 120 s cooldown on this bonus) | `bard_hearthsong` |
| 6 | Grace Note on an ally gives them the playing song's effect **doubled** for 6 s | `bard_sharp_note` |

Source: the final boss's chest at **Depth 10 or deeper**, any dungeon ([page 12](../12-DUNGEONS.md)); one piece per chest.

---

## 9. Class legendaries, uniques and souls

### Instrument off-hand bases (new, page 08 to list)

| Base | Song radius | Beat | Extra |
|---|---|---|---|
| **Lute** | 20 m | 0.75 s | +8% spell healing |
| **Warhorn** | 26 m | 0.9 s (slower, easier to hit) | — |
| **Hand Drum** | 16 m | 0.6 s (faster, harder, more Tempo) | verse timer 3.0 → 2.6 s |

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_last_string` | **The Last String** | off hand (Lute) | *One String Left*: while the bard's Tempo is under 20, every start counts as **on the beat** and verses build every **2 s** | final boss of `d11_saltdeep_cathedral` (Challenge), 6% |
| `leg_horn_of_the_gathering` | **Horn of the Gathering** | off hand (Warhorn) | *Call to the Road*: *Forced March* **pulls every ally** within 40 m to your side (a 10 m leap each), then applies | the `cinder_steppe` world boss ([page 13](../13-WORLD-BOSSES.md)), 4% |
| `leg_crown_of_nine_encores` | **Crown of Nine Encores** | head | *Nine Encores*: Standing Ovation can be held on **2 targets**; its cooldown is 90 → 60 s | secret boss `b_ysa_varn_kindled` of `d15_fire_court` (Challenge), 10% |
| `leg_tamsins_metronome` | **Tamsin's Metronome** | amulet | *Perfect Time*: each Finale performed **on the beat** within **1 s** of a boss cast finishing is **+50%** stronger and refunds 2 verses | the final boss's chest at Depth 15+, any dungeon, 1.5% |
| `leg_requiem_for_a_king` | **Requiem for a King** | main hand (dagger) | *Royal Dirge*: the Dirge's damage-taken bonus **doubles on bosses** and *Last Verse* deals +100% to bosses | the `frostmantle` world boss, 4% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_pipers_reed` | **The Piper's Reed** | wand | notes from Sharp Note **pierce** one enemy | `d01_hollow_barrow` final boss `b_hollow_thane` (level 7), 12% |
| `uq_tavern_brawlers_lute` | **Tavern Brawler's Lute** | off hand (Lute) | Discordant Chord **also heals allies** in its cone for 100% spell healing | `d04_bellows_keep` boss `b_the_great_bellows`, 8% |
| `uq_mothers_lullaby` | **Mother's Lullaby** | ring | the first **Sleep** you cause in each fight lasts **10 s** | `d08_moonwell_ruins` final boss, 7% |
| `uq_drum_of_the_fen_dance` | **Drum of the Fen-Dance** | off hand (Hand Drum) | the Cadence gives **+20% jump height** and allies take **no fall damage** in range | `mossfen` rare monsters (page 10), 3% |

### Souls

| id | Name | Socket in | Requirement | Power | Source |
|---|---|---|---|---|---|
| `soul_encore` | **Soul of the Encore** | chest (armour) | **Bard only** | every **Finale** plays **again 2 s later at 50%** strength (Forced March, Homecoming, Last Verse; a Medley's extra Finales do not repeat) | the secret boss `b_the_drowned_moon` of `d08_moonwell_ruins` (Normal or Challenge), 4%; or any monster at 0.02% (great luck) |
| `soul_steady_hand` | **Soul of the Steady Hand** | jewellery (ring or amulet) | **Bard only** | the beat window widens from ±0.15 s to **±0.25 s**, and reaching **In the Pocket** gives **+1 verse** | quest reward: the Whisperwood story chapter's bard version (page 14); or Depth 15+ final chest, 1% |

---

## 10. Voice and barks

Voice (reuse: `shared/voices.js` `voiceFor`): **new row `bard`** proposed — `pitch 0.58, depth 0.45, tone 0.72,
breath 0.22, rough 0.05, speed 0.58, jitter 0.12` (brighter and faster than `mage`). Lines go through Lingo
(reuse: `lingo/`), tagged `class:bard`; the Farhold anti-repeat applies.

| When | Lines |
|---|---|
| Song start | "Pick up your feet!" · "A song for the road." · "Hush now. Listen." |
| In the Pocket | "There's the groove." · "Now we're playing." |
| Finale | "And — the big finish!" · "Everybody, on the last note!" · "Curtain!" |
| Crit | "Now THAT was in tune." · "Hear that?" |
| Interrupt | "Not your turn." · "Off-key, friend." |
| Low health (<30%) | "I'm missing a few verses here!" · "Someone — anyone — help the band!" |
| Ally dies | "No! Play on, play on…" |
| Out of Tempo | "I've lost the beat." |
| Ovation | "Take a bow — you've earned it." |

---

## 11. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `bard.look` (feather cap, doublet, lute held, chained tome) | default look; the Lute becomes a real off-hand model (reuse: `avatar-3d/js/chibi2-gear.js` `lute`) |
| Visual only | Farhold `rally`, `quicken`, `mend`, `curse` skill looks | Ovation, Cadence, Hearthsong, Dirge auras |
| Status auras | `avatar-3d/js/spellfx.js` `STATUS_FX` `haste`, `regen`, `curse`, `dazed`, `sleep`, `silence`, `barrier`, `rally` | status visuals |
| Focus pattern | `prototypes/farhold/js/foci.js` (Grimoire, Orb) | instrument off-hands are foci with `songRadius` and `beat` intrinsics |
| Music timing | `sfx/js/sfx.js` scheduling on the Web Audio clock | the beat pulse and song loops share one clock so the click and the music agree |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | one node per tier; Wildmarch adds tier 4 at 45 and bespoke nodes |
| Dropped | Farhold's bard kit (shadow_lance, warcry, curse, mend, quicken, rally) | all six spells are new |

---

## 12. Round 2 changes

- Resource **Mana → Tempo**; new **Beat** rule refills it (bard base refill 12 a second); songs have no upkeep.
- Hybrid **Healer** section added (talents *Grace Note*, new *Soothing Chord*, healer tags).
- **Road Song** utility added.
- No battle-revive limit: *Understudy* and the Hearthkeeper 4-piece lost their "once per fight" (the 4-piece has its own 120 s cooldown; *Not This Time* keeps a per-ally 3 min limit on cheat-death, which is not a revive).
- Raid, Heroic and Mythic+ sources re-homed; souls added.

| Old | New |
|---|---|
| Mana costs (2–12% mana, 0.4%/s upkeep) | Tempo costs (20–40), no upkeep |
| talent *Road Song* (`bard_marching_cadence_t2b`) | *Road Weary* (the name moved to the utility spell `bard_road_song`) |
| talent *Ember Hearth* (`bard_hearthsong_t3b`) | *Burning Hearth* |
| talent *The Long Night* (`bard_hearthsong_t4a`) | *The Last Song* |
| talent *Hearthstone* (`bard_hearthsong_t4b`) | *Hearth Circle* |
| talent *Not Tonight* (`bard_hearthsong_t4c`) | *Not This Time* |
| *Second Wind* "stamina / Focus / Fury" | "20 Tempo or Momentum, or 60 mana" |
| calling 3 "night performance" | a performance at Rimehold's open-air amphitheatre |
| `q_bard_calling_1/2/3` | `q_calling_bard_1/2/3` |
| sources `r04_ember_court`, `r03_sunken_choir`, `r02_glacier_throne`, Mythic+ | `d15_fire_court` Challenge, `d11_saltdeep_cathedral` Challenge, `frostmantle` world boss, Depth 10+/15+ |

- **Sweep (round 2)**: §5 names the canon Role focus switch (Hybrid = Healer); secret-boss drop sources name
  their bosses (`b_ysa_varn_kindled`, `b_the_drowned_moon`).
