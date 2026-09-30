# Bard (`bard`)

> *"Keep walking. I'll keep playing. Neither of us stops until the road does."*

**Page owner:** `06-CLASSES.md` + this file. **Status:** v0.1 draft, 2026-09-29. Canon: [page 00](../00-OVERVIEW.md) §6 row 7.
Every spell id, talent id, set id and item id on this page is owned here. Formulas are owned by
[page 05](../05-COMBAT.md); boss vocabulary by [page 11](../11-BOSS-MECHANICS.md).

### Units used on this page

| Term | Meaning |
|---|---|
| **% spell damage** | a share of (weapon damage × (1 + spell power)) — Farhold's rule, applied ONCE inside the strike (reuse: `prototypes/farhold/js/rpg.js` `strike`; the R22 "one multiplier, two owners" fix). Page 05 owns the formula. |
| **% spell healing** | the same base, paid as healing |
| **Mana cost** | a share of the bard's maximum mana ("4% mana") so costs stay the same at every level |
| **m** | metres. A Chibi 2 character is about 1.2 m tall |
| **GCD** | "global recovery": the 1.0 s pause after an instant spell before the next spell can start. Page 05 decides whether it exists; numbers here assume 1.0 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A travelling musician whose songs are real magic: the tune changes how fast the party walks, how quickly wounds close and how brittle the enemy's armour is |
| Role | **Support** (primary), **Healer** (secondary — Hearthsong + the Hearthkeeper talents) |
| Armour | light |
| Weapons | main hand **dagger** or **wand**; off hand an **instrument** (new focus-style off-hand base, see §7) — Lute, Warhorn, Hand Drum. Farhold's classes.json gave `dagger`, `wand`; the instrument is new |
| Resource | **Mana** + the **Verse** gauge (class mechanic) |
| Companion | none |
| Playstyle | One song is always playing around you. Every few seconds of an unbroken song adds a verse; at four verses you can end the song with a **Finale**, a big one-off effect, and start the next song from zero. You choose what the party needs this minute — speed, healing or a weaker enemy — and time the finale to the boss's big moment |

**Hook carried from Emberveil** (reuse: `prototypes/emberveil/data/classes.json` `bard`): *Ballad of Valor
gives one hero two turns; Song of Ruin strips all enemy buffs.* Both live on here — Ballad of Valor as
**Standing Ovation** (one ally's cooldowns run double speed) and Song of Ruin as the **Dirge's Finale**
(strips every buff in 20 m).

---

## 2. Class mechanic — Songs and Verses (new)

### 2.1 Rules

1. Three of the bard's six spells are **songs**: `bard_marching_cadence`, `bard_hearthsong`,
   `bard_dirge_of_unmaking`. Casting one starts it; it keeps playing until you start a different song,
   perform its Finale, die, or run out of mana.
2. **Only one song plays at a time.** Starting another ends the current one (see calling 2 for the overlap).
3. A playing song is an **aura** — a ring 20 m round the bard (the radius grows with the instrument, §7).
   It reaches party members and the bard; enemy-side songs (the Dirge) reach enemies.
4. A song costs its start cost once, then **0.4% mana a second** while it plays. At 0 mana it stops.
5. Songs play while you move, jump, dodge-roll and cast other spells. Being **stunned, silenced or knocked
   down** pauses the song (no verse gain) but does not end it.
6. **Verses** (0–4; 0–6 after calling 3) build while the same song keeps playing:
   * +1 every **3.0 s** of unbroken play;
   * +1 on each `bard_sharp_note` hit (once per cast);
   * +1 on each `bard_discordant_chord` that hits at least one enemy.
7. Each verse **strengthens the playing song** (the per-verse numbers are in each song's row).
8. **Finale:** press the **class key `Q`** ([page 02](../02-CONTROLS.md) `classKey`) while the playing song has
   **4 or more verses**. The Finale fires, spends every verse and the song ends. Each verse above 4 adds +15% to the Finale.
   No Finale is possible before calling 1.
9. **Next song:** the **second class key `G`** (`classKey2`) switches to the next learned song in the order
   Cadence → Hearthsong → Dirge (same cost and rules as pressing that song's own spell key).

### 2.2 Gauge UI (reuse the HUD resource-bar slot: `prototypes/farhold/js/hud.js`)

| Element | Where | What it shows |
|---|---|---|
| **Staff ribbon** | directly above the mana bar, 220 × 26 px | five horizontal lines (a musical staff). Each verse is a note head that drops onto the staff with a "plink" (`ui.click` pitched up). 4 slots, 6 after calling 3 |
| **Song label** | left end of the ribbon | the playing song's name in its colour: Cadence **gold** `#e0b040`, Hearthsong **green** `#6ad07a`, Dirge **violet** `#9a60d0` |
| **Verse timer** | a thin line sweeping across the ribbon | progress to the next timed verse (3.0 s) |
| **Finale glow** | the ribbon border | pulses in the song colour once 4 verses are banked. The `Q` slot shows a gold "Finale" badge |
| **Range ring** | on the ground, 20 m | a faint dotted ring in the song colour, visible only to the bard (setting `set.gameplay.bard_song_ring`, default on — add to page 04) |
| **Party frames** | page 03 party list | a note icon beside every ally inside the song; greyed when they are out of range |

### 2.3 Calling quests (page 14 owns quest content; ids proposed here)

| Level | Quest id | Name | What it grants |
|---|---|---|---|
| 6 | `q_bard_calling_1` | **The First Verse** — learn an old walking-song from a blind piper at Brightwater and play it at three farms before dusk | **Verses and Finales** turn on; `Q` (Finale) and `G` (next song) light up. Before this, songs play with no verses (the 4-level-spell Cadence works but cannot build) |
| 20 | `q_bard_calling_2` | **Harmony** — gather three lost stanzas in Anvilgate's taverns, the Glass Tombs echo-hall and a Sandsworn camp | **Overlap:** the song you leave keeps playing for **6 s** at its current verses beside the new one (two auras for 6 s). Switching songs **keeps half your verses** (rounded down) |
| 40 | `q_bard_calling_3` | **The Grand Medley** — conduct the frozen choir of Rimehold in a night performance while wolves attack | **Max verses 6.** A Finale performed at **6** verses is a **Medley**: the other two songs' Finales also fire at 40% strength |

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `bard_sharp_note` | Sharp Note | 2% mana | — | 1.0 s | 35 m | bolt | 115% spell damage, +1 verse |
| 2 | 4 | `bard_marching_cadence` | Marching Cadence | 6% + 0.4%/s | 1.5 s | instant | self, 20 m aura | song | party +10% move, +6% attack/cast speed |
| 3 | 10 | `bard_hearthsong` | Hearthsong | 8% + 0.4%/s | 1.5 s | instant | self, 20 m aura | song | party heal 1.0% max health / 2 s (+0.4% per verse) |
| 4 | 18 | `bard_discordant_chord` | Discordant Chord | 5% mana | 14 s | instant | 8 m | cone 70° | 90% spell damage, interrupt, Dazed |
| 5 | 28 | `bard_dirge_of_unmaking` | Dirge of Unmaking | 8% + 0.4%/s | 1.5 s | instant | self, 20 m aura | song (enemy) | enemies take +5% damage (+1.5% per verse) |
| 6 | 40 | `bard_standing_ovation` | Standing Ovation | 12% mana | 90 s | instant | 40 m | one ally or self | cooldowns tick ×2, +20% damage and healing, 8 s |

### 3.2 Spell details

#### `bard_sharp_note` — Sharp Note (slot 1, level 1)

| Field | Value |
|---|---|
| Cost / cooldown | 2% mana · none (GCD only) |
| Cast | 1.0 s cast time; cannot move while casting (talent `t1b` makes it instant) |
| Range / shape | 35 m bolt, 0.4 m hit radius, flies at 26 m/s, stops on first enemy |
| Effect | **115% spell damage** (arcane) |
| Mechanic | **+1 verse** on hit (once per cast) |
| Visuals | spellfx `projectile` element `arcane`, shape overridden to `rune` with a gold tint `#e0b040` — a spinning quaver glyph; `impact` arcane at 0.6 scale |
| Sound | a single plucked lute string (new sfx `bard.note`, pitch follows the current verse count 1→6 up a scale); impact `spell.arcane.impact` |

#### `bard_marching_cadence` — Marching Cadence (slot 2, level 4) — SONG

| Field | Value |
|---|---|
| Cost / cooldown | 6% mana to start, 0.4% mana a second · 1.5 s (between song starts) |
| Cast | instant; plays while moving |
| Range / shape | aura, 20 m radius round the bard; party members and the bard |
| Effect | **+10% move speed** and **+6% attack and cast speed**. Each verse adds **+2% move** and **+1.5% attack/cast speed** (4 verses: +18% / +12%) |
| Finale — *Forced March* | every party member in range: **+40% move speed** and **immune to slows, roots and snares for 3 s**, and one free dodge roll (no stamina) usable for 3 s. A dedicated escape from void zones and danger zones |
| Statuses | `haste` (Farhold row, re-tuned to these numbers) on each ally |
| Visuals | gold motes swirl at the bard's feet; allies in range show the `haste` status aura from `STATUS_FX`; Finale: spellfx `pillar` element `holy`, radius 20, tinted gold, plus the `haste` aura bursting on every ally |
| Sound | a fast drum-and-fife loop (new loop `bard.song.cadence`, 120 bpm); Finale `status.haste.apply` + a horn blast |

#### `bard_hearthsong` — Hearthsong (slot 3, level 10) — SONG

| Field | Value |
|---|---|
| Cost / cooldown | 8% mana to start, 0.4% mana a second · 1.5 s |
| Cast | instant; plays while moving |
| Range / shape | aura, 20 m |
| Effect | every 2 s heals each party member in range for **1.0% of their max health**, +**0.4%** per verse (4 verses: 2.6% every 2 s = 1.3%/s) |
| Finale — *Homecoming* | heals every party member in range for **25% of their max health** and gives a **barrier of 10% max health for 8 s** |
| Statuses | `regen` aura (Farhold `regen` row, re-tuned) |
| Visuals | green leaf-and-mote swirl (spellfx `heal` at each tick, 0.5 scale, only on allies who were healed); Finale `revive`-style rising motes without the revive, plus `barrier` status aura |
| Sound | a slow lute ballad loop `bard.song.hearth` (72 bpm); Finale `heal` + a held chord |

#### `bard_discordant_chord` — Discordant Chord (slot 4, level 18)

| Field | Value |
|---|---|
| Cost / cooldown | 5% mana · 14 s |
| Cast | instant, usable while moving |
| Range / shape | cone 8 m long, 70° wide, in front of the bard |
| Effect | **90% spell damage** (arcane) to all enemies in the cone. **Interrupts** any gold-bordered cast (page 11) of every enemy hit |
| Statuses | **Dazed 3 s** (spellfx `dazed`; −30% attack and cast speed) on everything hit; non-elite enemies are also **stunned 1.5 s** |
| Mechanic | +1 verse if it hits anything |
| Visuals | spellfx `breath` element `arcane`, length 8, arc 1.22 rad, ms 250 — drawn as expanding violet rings instead of flame (ring particles); `impact` arcane at 0.5 scale on each target |
| Sound | a harsh three-string scrape `bard.chord` + `status.dazed.apply` |

#### `bard_dirge_of_unmaking` — Dirge of Unmaking (slot 5, level 28) — SONG (enemy)

| Field | Value |
|---|---|
| Cost / cooldown | 8% mana to start, 0.4% mana a second · 1.5 s |
| Cast | instant |
| Range / shape | aura, 20 m; affects **enemies** inside it |
| Effect | enemies take **+5% damage from all sources**, +**1.5%** per verse (4 verses: +11%). Every **6 s** the Dirge **strips one removable buff** from each enemy in range (the newest one). Does not stack with a second bard's Dirge (the higher one wins) |
| Finale — *Last Verse* | **180% spell damage** (arcane) to every enemy in 20 m and **strips every removable buff** from them. Bosses' enrage (page 11) is never removable; boss "empower" buffs marked `dispellable` are |
| Statuses | `curse` aura (spellfx), shown in violet |
| Visuals | slow violet ripples outward from the bard every 2 s (spellfx `ring` axis ground, r0 1 → r1 20, 1.2 s); Finale spellfx `vortex` element `shadow`, radius 20, ms 900, then `aoe` arcane on every enemy |
| Sound | minor-key cello drone `bard.song.dirge`; Finale `spell.shadow.impact` layered with a choir cut-off |

#### `bard_standing_ovation` — Standing Ovation (slot 6, level 40)

| Field | Value |
|---|---|
| Cost / cooldown | 12% mana · 90 s |
| Cast | instant; target an ally in 40 m (or yourself if no ally is targeted) |
| Effect | for **8 s** the target's **spell cooldowns tick twice as fast**, and they deal **+20% damage and healing**. The bard's current song counts **double** on the target (e.g. Hearthsong heals them twice per tick) |
| Rule | one Ovation per target at a time; a second bard's Ovation on the same person refreshes, it does not stack |
| Statuses | `rally` aura (spellfx) in gold on the target |
| Visuals | a spotlight: spellfx `beam` from 12 m above onto the target, radius 1.2, colour `#fff0b0`, life 8 s, opacity 0.35; confetti of `holy_mote` sprites on cast |
| Sound | a fanfare `bard.ovation` + crowd-cheer sweetener |

### 3.3 Rotation / how it plays

* **Solo (levelling):** Cadence while travelling (move speed). In a fight, Sharp Note to build, Chord when
  enemies close in, switch to Hearthsong if health drops below half, Finale *Homecoming* as your "potion".
  From 28, open packs with the Dirge and end them with *Last Verse* (180% on everything is the bard's
  biggest AoE).
* **Dungeon (5):** as Support, hold the **Dirge** on bosses (+11% party damage at 4 verses) and spend
  its Finale when a boss gains an empower buff. Swap to **Cadence** 10 s before a known movement phase so
  the verses are up for *Forced March*. As Healer, Hearthsong all fight, Finale on the big party-wide hit,
  Ovation on the main healer or yourself during burst healing. Chord is the group's second interrupt.
* **Raid (10/20):** position in the middle so 20 m covers both melee and ranged. One bard per group of 5
  is the target; two bards on the same song waste the second Dirge. Save Ovation for the raid's damage
  window (boss "vulnerable" phases, page 11). A Medley (calling 3) at 6 verses gives heal + speed + dispel
  in one press — raid leaders should call for it before a room-wide attack.

### 3.4 Boss mechanics

| Mechanic | Bard answer |
|---|---|
| **Soak** (orange circle) | can soak like anyone; Hearthsong ticks keep soakers topped up |
| **Void zone** | every song plays while moving; *Forced March* gives the whole party +40% speed and root immunity for 3 s |
| **Danger zone** | no teleport of its own. Talent `bard_marching_cadence_t2a` adds a 6 m dash to the Finale |
| **Interrupt** | Chord interrupts (14 s). Cone — face the caster |
| **Dispel enemy buffs** | Dirge strips one each 6 s; *Last Verse* strips all |
| **Immunities** | none. Talent `bard_hearthsong_t4c` gives a one-time party cheat-death |
| **Tether / spread** | songs reach 20 m, so spreading for yellow targeted circles does not break the song for anyone within 20 m |

---

## 4. Alternate spells

None. The bard's bar never swaps. The **Finale** is the class key `Q`, and `G` steps to the next song.
With calling 2's overlap the HUD shows the fading song as a second, thinner ribbon for its 6 s.

---

## 5. Talents

A spell's talent tiers open at levels **12 / 22 / 32 / 45**; a tier whose level came before the spell was
learned opens the moment the spell is learned (see canon request 2). One choice per tier (reuse the
one-node-per-tier rule of `prototypes/farhold/js/skilltalents.js`). Every choice changes what the spell does.

### `bard_sharp_note`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_sharp_note_t1a` | Triplet | fires **3 notes** in a 20° fan, each 50% spell damage; still +1 verse per cast |
| 1 | `bard_sharp_note_t1b` | Busking | cast becomes **instant**, 85% spell damage, can be cast while moving |
| 2 | `bard_sharp_note_t2a` | Resonant | on hit, the note rings: **40% spell damage** to enemies within 3 m of the target |
| 2 | `bard_sharp_note_t2b` | Grace Note | if it hits an **ally** instead (aim at a friend), heals them for 120% spell healing; still +1 verse |
| 2 | `bard_sharp_note_t2c` | Off-Key | target is **Dazed 2 s**; no daze on bosses, but bosses take +4% from you for 4 s |
| 3 | `bard_sharp_note_t3a` | Motif | every **4th** note is a **Motif**: it bounces to 2 more enemies (70% each) |
| 3 | `bard_sharp_note_t3b` | Double Stop | while at max verses, a note gives **4% mana back** instead of a verse |
| 4 | `bard_sharp_note_t4a` | Refrain | notes that kill a target leave a floating note for 4 s; the next note fired passes through it and splits into 3 |
| 4 | `bard_sharp_note_t4b` | Tempo Rubato | each note shortens the **playing song's verse timer** by 0.5 s |

### `bard_marching_cadence`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_marching_cadence_t1a` | Quickstep | per-verse move bonus doubles (+4%), attack speed bonus removed |
| 1 | `bard_marching_cadence_t1b` | War Drum | per-verse attack/cast speed doubles (+3%), move bonus removed |
| 2 | `bard_marching_cadence_t2a` | Double Time | *Forced March* also **dashes every ally 6 m** in the direction they are moving |
| 2 | `bard_marching_cadence_t2b` | Road Song | out of combat the song costs **no mana** and mounts ride +10% faster in range |
| 3 | `bard_marching_cadence_t3a` | Rearguard | allies in range take **8% less damage from behind** |
| 3 | `bard_marching_cadence_t3b` | Stomp | every 3rd verse stamps a 4 m ring that **pushes enemies 2 m** away from the bard |
| 3 | `bard_marching_cadence_t3c` | Second Wind | *Forced March* also **restores 20 stamina / Focus / Fury** (each ally's own resource) |
| 4 | `bard_marching_cadence_t4a` | Parade | *Forced March* leaves a 20 m gold trail for 6 s; allies walking on it keep +40% speed |
| 4 | `bard_marching_cadence_t4b` | Unbroken Stride | while the Cadence plays, the first **knockback or knockdown** on each ally every 20 s is ignored |

### `bard_hearthsong`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_hearthsong_t1a` | Lullaby of Home | ticks heal **the lowest-health ally twice** and everyone else not at all |
| 1 | `bard_hearthsong_t1b` | Wide Hearth | radius 20 → **28 m**, heal per tick −20% |
| 2 | `bard_hearthsong_t2a` | Kindling | overhealing becomes a **barrier** up to 8% max health (lasts while in range) |
| 2 | `bard_hearthsong_t2b` | Cleansing Verse | every 4th verse **removes one harmful status** (poison, bleed, burn, curse first) from each ally |
| 3 | `bard_hearthsong_t3a` | Homecoming Feast | *Homecoming* also **restores 10% mana** to every ally |
| 3 | `bard_hearthsong_t3b` | Ember Hearth | the Hearthsong also **burns** enemies in 6 m for 20% spell damage per tick |
| 4 | `bard_hearthsong_t4a` | The Long Night | the Hearthsong **keeps playing 12 s after you die**, and heals continue from your body |
| 4 | `bard_hearthsong_t4b` | Hearthstone | *Homecoming* plants a 6 m green circle (Beneficial, page 11) for 10 s healing 3% max health a second |
| 4 | `bard_hearthsong_t4c` | Not Tonight | *Homecoming* gives every ally **cheat death** for 6 s: the next killing blow leaves them at 1 health (once per ally per 3 min) |

### `bard_discordant_chord`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_discordant_chord_t1a` | Wail | shape becomes a **6 m circle around you** instead of a cone |
| 1 | `bard_discordant_chord_t1b` | Long Note | cone becomes a **20 m line, 2 m wide** |
| 2 | `bard_discordant_chord_t2a` | Lullaby | non-elites are put to **Sleep 5 s** instead of stunned (breaks on damage) |
| 2 | `bard_discordant_chord_t2b` | Feedback | an interrupted cast **deals 60% of its damage to its caster** |
| 2 | `bard_discordant_chord_t2c` | Crescendo | hits **+2 verses** instead of 1 |
| 3 | `bard_discordant_chord_t3a` | Clash of Cymbals | knocks enemies **4 m back** |
| 3 | `bard_discordant_chord_t3b` | Silence | interrupted enemies are **Silenced 3 s** (spellfx `silence`) |
| 4 | `bard_discordant_chord_t4a` | Stolen Tune | interrupting a spell gives you its school: your next Sharp Note deals that element and +50% |
| 4 | `bard_discordant_chord_t4b` | Encore Chord | the Chord fires a **second time 1.5 s later** at 60% |

### `bard_dirge_of_unmaking`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_dirge_of_unmaking_t1a` | Focused Dirge | radius 20 → **8 m**, damage-taken bonus per verse doubles (+3%) |
| 1 | `bard_dirge_of_unmaking_t1b` | Funeral March | enemies in range also move **15% slower** |
| 2 | `bard_dirge_of_unmaking_t2a` | Unravel | each stripped buff deals **60% spell damage** to its owner |
| 2 | `bard_dirge_of_unmaking_t2b` | Borrowed Glory | each stripped buff gives the bard **+2% damage for 10 s** (stacks 5) |
| 3 | `bard_dirge_of_unmaking_t3a` | Requiem | enemies that die inside the Dirge give **+1 verse** |
| 3 | `bard_dirge_of_unmaking_t3b` | Brittle Chorus | the damage-taken bonus becomes **armour −8% per verse** instead (physical classes) |
| 4 | `bard_dirge_of_unmaking_t4a` | Last Rites | *Last Verse* deals **+300% spell damage to enemies under 20% health** |
| 4 | `bard_dirge_of_unmaking_t4b` | The Silence After | *Last Verse* **Silences** every enemy hit for 4 s (bosses: interrupts only) |

### `bard_standing_ovation`

| Tier | id | Name | Effect |
|---|---|---|---|
| 1 | `bard_standing_ovation_t1a` | Ensemble | also hits the **2 nearest other allies** at half strength |
| 1 | `bard_standing_ovation_t1b` | Solo | self-only; lasts **12 s** and your songs gain a verse every 1.5 s |
| 2 | `bard_standing_ovation_t2a` | Bravo | when the target lands a critical hit, **1 s** comes off Ovation's cooldown |
| 2 | `bard_standing_ovation_t2b` | Understudy | if the target dies while Ovation is on them, they are **revived at 30% health** after 3 s (once per fight) |
| 3 | `bard_standing_ovation_t3a` | Curtain Call | when Ovation ends, the target's **next spell has no cooldown** |
| 3 | `bard_standing_ovation_t3b` | Spotlight | enemies attacking the target **deal 15% less damage** |
| 4 | `bard_standing_ovation_t4a` | Opening Night | casting Ovation instantly gives you **full verses** on the playing song |
| 4 | `bard_standing_ovation_t4b` | Magnum Opus | the target's **Finale-like** burst: at the end they release 20% of all damage they dealt during Ovation as a 6 m blast |

---

## 6. Class sets

Pieces: head, shoulders, chest, hands, legs, feet (6). A set is Set rarity (Farhold colour).

### `set_bard_road_troupe` — Regalia of the Road Troupe (level 30, levelling set)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Marching Cadence starts with **2 verses** | `bard_marching_cadence` |
| 4 | *Forced March* also gives **+25% damage for 5 s** | `bard_marching_cadence` Finale |
| 6 | Sharp Note fired during Forced March **fires 3 at once** at full damage | `bard_sharp_note` |

Drop: every boss of `d07_thornheart` and `d08_moonwell_ruins` (Normal and Heroic); chest piece only from the final boss of `d08_moonwell_ruins`.

### `set_bard_mourners_choir` — Vestments of the Mourners' Choir (level 60, raid)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Dirge strips a buff every **4 s** instead of 6 | `bard_dirge_of_unmaking` |
| 4 | *Last Verse* **resets Discordant Chord** and the next Chord is a 12 m cone | `bard_dirge_of_unmaking`, `bard_discordant_chord` |
| 6 | while the Dirge plays, **Standing Ovation's target also gets the Dirge's bonus** as extra damage dealt | `bard_standing_ovation` |

Drop: `r04_ember_court` (Normal and Mythic), one piece per boss 1–6; tokens trade in at the raid's vendor.

### `set_bard_hearthkeeper` — The Hearthkeeper's Motley (level 60, Mythic+ / healer)

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hearthsong ticks every **1.5 s** | `bard_hearthsong` |
| 4 | *Homecoming* spent at 5+ verses also **resurrects one dead ally** at 20% health (once per fight) | `bard_hearthsong` |
| 6 | Grace Note / Sharp Note on an ally gives them **+1 verse worth of the playing song** doubled for 6 s | `bard_sharp_note` |

Drop: the end chest of any Mythic+ dungeon at key level 8+ (page 12).

---

## 7. Class legendaries and uniques

### Instrument off-hand bases (new, page 08 to list)

| Base | Song radius | Extra |
|---|---|---|
| **Lute** | 20 m | +8% spell healing |
| **Warhorn** | 26 m | songs cost +0.1% mana a second more |
| **Hand Drum** | 16 m | verse timer 3.0 → 2.6 s |

### Legendaries

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `leg_the_last_string` | **The Last String** | off hand (Lute) | *One String Left*: when the bard's mana is under 20%, songs cost **no mana** and verses build every **2 s** | final boss of `r03_sunken_choir` (Normal 5%, Mythic 8%) |
| `leg_horn_of_the_gathering` | **Horn of the Gathering** | off hand (Warhorn) | *Call to the Road*: *Forced March* **pulls every ally** within 40 m to your side (a 10 m leap each), then applies | the `cinder_steppe` world boss (page 13), 4% |
| `leg_crown_of_nine_encores` | **Crown of Nine Encores** | head | *Nine Encores*: Standing Ovation can be held on **2 targets**; its cooldown is 90 → 60 s | secret boss of `r04_ember_court`, 10% |
| `leg_tamsins_metronome` | **Tamsin's Metronome** | amulet | *Perfect Time*: each Finale performed within **1 s** of a boss cast finishing (any cast bar) is **+50%** stronger and refunds 2 verses | Mythic+ key 12+ end chest, any dungeon, 1.5% |
| `leg_requiem_for_a_king` | **Requiem for a King** | main hand (dagger) | *Royal Dirge*: the Dirge's damage-taken bonus **doubles on bosses** and *Last Verse* deals +100% to bosses | `r02_glacier_throne` secret boss, 6% |

### Uniques

| id | Name | Slot | Power | Source |
|---|---|---|---|---|
| `uq_pipers_reed` | **The Piper's Reed** | wand | notes from Sharp Note **pierce** one enemy | `d01_hollow_barrow` final boss `b_hollow_thane` (level 7), 12% |
| `uq_tavern_brawlers_lute` | **Tavern Brawler's Lute** | off hand (Lute) | Discordant Chord **also heals allies** in its cone for 100% spell healing | `d04_bellows_keep` boss `b_the_great_bellows`, 8% |
| `uq_mothers_lullaby` | **Mother's Lullaby** | ring | the first **Sleep** you cause each fight lasts **10 s** | `d08_moonwell_ruins` final boss, 7% |
| `uq_drum_of_the_fen_dance` | **Drum of the Fen-Dance** | off hand (Hand Drum) | the Cadence gives **+20% jump height** and allies take **no fall damage** in range | `mossfen` rare elites (page 10), 3% |

---

## 8. Voice and barks

Voice (reuse: `shared/voices.js` `voiceFor`): **new row `bard`** proposed — `pitch 0.58, depth 0.45, tone 0.72,
breath 0.22, rough 0.05, speed 0.58, jitter 0.12` (brighter and faster than `mage`). Lines go through Lingo
(reuse: `lingo/`), tagged `class:bard`; the Farhold anti-repeat applies. Examples (player-facing, original):

| When | Lines |
|---|---|
| Song start | "Pick up your feet!" · "A song for the road." · "Hush now. Listen." |
| Finale | "And — the big finish!" · "Everybody, on the last note!" · "Curtain!" |
| Crit | "Now THAT was in tune." · "Hear that?" |
| Interrupt | "Not your turn." · "Off-key, friend." |
| Low health (<30%) | "I'm missing a few verses here!" · "Someone — anyone — help the band!" |
| Ally dies | "No! Play on, play on…" |
| Out of mana | "My fingers are numb." |
| Ovation | "Take a bow — you've earned it." |

---

## 9. Reuse notes

| Borrowed | From | Used for |
|---|---|---|
| Look | `prototypes/farhold/data/classes.json` `bard.look` (feather cap, doublet, lute held, chained tome) | default look; the Lute becomes a real off-hand model (reuse: `avatar-3d/js/chibi2-gear.js` `lute`) |
| Visual only | Farhold `rally`, `quicken`, `mend`, `curse` skill looks | Ovation, Cadence, Hearthsong, Dirge auras |
| Status auras | `avatar-3d/js/spellfx.js` `STATUS_FX` `haste`, `regen`, `curse`, `dazed`, `sleep`, `silence`, `barrier`, `rally` | status visuals |
| Focus pattern | `prototypes/farhold/js/foci.js` (Grimoire, Orb) | instrument off-hands are foci with `songRadius` intrinsics |
| Talent engine | `prototypes/farhold/js/skilltalents.js` | one node per tier; Wildmarch adds tier 4 at 45 and bespoke nodes |
| Dropped | Farhold's bard kit (shadow_lance, warcry, curse, mend, quicken, rally) | none of those spells are used; all six spells are new |
