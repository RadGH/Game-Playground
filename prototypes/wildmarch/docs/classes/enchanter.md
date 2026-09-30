# Enchanter — class 30

> *"You don't want to hurt them. You want to sit down. There — isn't that better?"*

**Role:** Support · **Armour:** light · **Resource:** Mana + **Will** (the charm's hold) · **Primary attribute:** INT (CON second)
Owner of this file: every `enchanter_*` spell, talent, set, legendary and unique, and the **Charm** rules. Template: [page 00 §5](../00-OVERVIEW.md).
Status rules (sleep, stun, diminishing returns) are owned by [page 05](../05-COMBAT.md); monster ranks and families by [page 10](../10-BESTIARY.md).

### Numbers used on this page

| Term | Meaning |
|---|---|
| **SP** | spell power (page 05) |
| Mana cost | % of base maximum Mana |
| **Sleep** | the target stands still and does nothing until the time runs out **or it takes any damage** (DoTs too) |
| **Charm** | the enemy fights for you for a time (§2) |
| **Will** | 0–100, how long a charm holds; drains every second |
| DR | diminishing returns: the same control effect on the same target within 18 s lasts 50%, then 25%, then it is immune for 18 s (page 05) |
| GCD | 1.0 s, can be hasted to 0.75 s |

---

## 1. Identity

| | |
|---|---|
| Fantasy | A mind-mage who wins fights before they start. Enemies fall asleep, turn on each other, or walk over and fight for the Enchanter. The Enchanter picks which fights happen and when. |
| Role | Support (counts as a Damage slot in the group finder, page 00 §4). Crowd control, haste buffs, a borrowed monster. |
| Armour | light (high-collar robe, circlet, shoulder cape, rune bracers) |
| Weapons | staff, or wand + focus (Effigy / Seer's Orb, `(reuse: farhold/js/foci.js)`) |
| Resource | Mana |
| Companion | whatever it has charmed (§2). No permanent pet. (Farhold's `bound_imp` is dropped: the charm replaces it.) |
| Playstyle | 1) Put the dangerous enemies to sleep before the pull. 2) Charm the best of the rest and fight with its abilities on your **borrowed bar**. 3) Haste your allies and lock the whole pack with Crown of Strings when it goes wrong. |

Starting kit: Novice's Staff, light robe, light boots, circlet (cosmetic), 1 spell (`enchanter_needling_whisper`).

---

## 2. Class mechanic — Charm

### 2.1 The Charm ability

| | |
|---|---|
| id | `enchanter_charm` (class ability, not a slot spell; class key `Z`, proposed — page 02 owns keys) |
| Unlocked | Calling 6 |
| Cast | 2.0 s, 25 m, line of sight, 4% Mana, 10 s cooldown after a charm ends |
| Effect | The target becomes your **charmed** ally until Will reaches 0. Its threat list is wiped; its old friends now attack it. |
| Cap | 1 charmed enemy (2 at Calling 40) |
| Look | Violet strings drop from above onto the target's wrists and head (spellfx `arcane` ribbon + STATUS_FX `enchant` ring); its eyes glow violet; a violet ring under its feet for as long as it is yours. |
| Sound | a music-box phrase (three notes) on success; a snapped-string twang when it breaks |

### 2.2 What can and cannot be charmed

| Enemy (rank per page 10) | Charmable? | Will drain per second | Hold at full Will | Notes |
|---|---|---|---|---|
| Normal (open world, dungeon trash) | yes, from Calling 6, if its level ≤ yours + 2 | 1.1 | ~90 s | |
| **Champion** (elite with modifiers) | yes, from **Calling 20** | 2.2 | ~45 s | keeps its champion modifiers and aura; aura now helps *your* group |
| **Rare** (named rare elite) | yes, from **Calling 40** | 3.3 | ~30 s | once per rare per 10 min; its loot still drops when it dies later |
| Warband leader / standard-bearer | no | — | — | leaders are "command" units (page 10) |
| Sub-boss, dungeon boss, secret boss, raid boss, world boss, event boss | **never** | — | — | Hush and Seed of Discord have boss versions instead (§3) |
| Families tagged `mindless` (constructs, oozes, elementals, animated objects — page 10 owns the tag) | **never** | — | — | the cast fails with "It has no mind to bend." |
| Enemies with the champion modifier **Iron-Willed** | never | — | — | page 10 |
| Other players, players' pets/followers | **never** (PvP: see §2.5) | — | — | |
| Mythic+ dungeon trash | yes | +50% drain | — | keeps the timer fair |

**Will:** starts at 100. Drains per second by rank (table). When the charmed creature **loses health**, Will drops by half the percentage lost (loses 20% of its health → −10 Will). Bright Glamour on it: +20 Will (once per 12 s).
**At 25 Will** its portrait flashes red and a string-creak sound plays; **at 0** the strings snap: it is **Dazed** 2 s (stands still) and then fights you again with threat on the Enchanter.
**Release** (press the class key while you have a charm): with Will ≥ 30 the creature falls **asleep for 10 s** (so you can walk away); below 30 it just snaps. Calling 40: Release becomes **Snap** (§2.4).
**Balance rule:** a charmed creature deals **70%** of its normal damage and takes normal damage. It does not level with you. It cannot enter a raid or dungeon boss room once the boss is pulled — it waits at the door (the door's arena wall, page 11).

### 2.3 The borrowed bar

When you charm something, a **second bar** slides up above your spell bar (`scr_hud_borrowed_bar`, page 03):

| Part | What it shows |
|---|---|
| Portrait | the creature's face in a violet frame; a **Will ring** around it draining clockwise, number in the middle |
| Slots **Alt+1 / Alt+2 / Alt+3** (proposed) | the first three abilities from its page-10 ability list, with their own cooldowns; they cost you nothing. Blank if it has fewer. |
| **Alt+4** | stance toggle: **Attack my target** (default) / **Guard me** (attacks whatever attacks you) |
| **Alt+5** | **Hold here**: it walks to the crosshair point and stays |
| Health bar | under the portrait |

Example borrowed bars (page 10 owns the real kits):

| Charmed | Alt+1 | Alt+2 | Alt+3 |
|---|---|---|---|
| a marsh stalker (normal, Mossfen) | Lunge | Rending Bite (bleed) | — |
| an orc war-drummer (normal, Cinder Steppe) | Drum Strike | War Rhythm (+10% haste to your group!) | Stomp |
| a frost champion with **Vampiric** modifier | its kit | its kit | its kit + its aura now heals *your* group |

Other players see the charmed creature's nameplate in green with "(charmed by *name*)" and the Will number (Calling 20).

### 2.4 Calling quests

| Level | Quest id | Summary | Grants |
|---|---|---|---|
| 1 | — | — | Spells only. No charm. |
| 6 | `q_enchanter_calling_strings` | Hearthvale: a puppet-maker in Brightwater has lost her marionettes to a pack of fen-dogs; "borrow" one fen-dog (a scripted charm) and use it to lead you to their den, then fight beside it. | **Charm** (normal enemies), the **borrowed bar**, the Will gauge. |
| 20 | `q_enchanter_calling_court` | Whisperwood: a moonwell dryad offers a bargain — win three "courtesies" at a fey court (a dialog opportunity: flatter, riddle or command), then charm the court's champion to fight its own queen's guard. | **Champions** can be charmed; allies see Will on the nameplate; borrowed abilities hit 20% harder (70% → 84% damage). |
| 40 | `q_enchanter_calling_crown` | Riftmarch: the floating stones hold a sleeping Rift-Warden; keep it asleep (Hush every 20 s) while charming five rift beasts in a row to carry its crown out. | **Rares** can be charmed; **2 charms** at once; **Snap**: releasing a charm deals `Will × 4% SP` psychic damage in 6 m around it (100 Will = 400% SP) and Dazes enemies there 2 s. |

---

## 3. The six spells

### 3.1 At a glance

| Slot | id | Name | Lvl | Cost | CD | Cast | Range | Shape | Main number |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `enchanter_needling_whisper` | Needling Whisper | 1 | 1.5% Mana | — | 1.2 s | 34 m | bolt | 110% SP + Unsettled |
| 2 | `enchanter_hush` | Hush | 4 | 3% Mana | 6 s (bosses 20 s) | 1.5 s | 30 m | single target | Sleep 20 s / boss: interrupt + silence 2 s |
| 3 | `enchanter_bright_glamour` | Bright Glamour | 10 | 4% Mana | 12 s | instant | 40 m | ally (max 2) | +20% attack/cast speed, +10% move, 12 s |
| 4 | `enchanter_somnolent_tide` | Somnolent Tide | 18 | 8% Mana | 40 s | 1.5 s | 30 m | ground, 7 m drifting mist, 6 s | mass Sleep 12 s |
| 5 | `enchanter_seed_of_discord` | Seed of Discord | 28 | 6% Mana | 25 s | 1.0 s | 30 m | single target | Maddened 8 s / boss: +10% damage taken 6 s |
| 6 | `enchanter_crown_of_strings` | Crown of Strings | 40 | 10% Mana | 120 s | instant | self | 12 m circle | Enthralled 6 s, +15% ally damage 10 s |

### 3.2 Details

**`enchanter_needling_whisper` — Needling Whisper** (slot 1, level 1) `(new)`
- 1.5% Mana · no cooldown · 1.2 s cast · 34 m · bolt (1 m splash).
- **110% SP** psychic (arcane) damage and **Unsettled** 6 s: the target deals 5% less damage per stack (max 3 stacks = 15%).
- Look: a thin violet thread whips out and flicks the target's head (spellfx `arcane` helix, very thin); a small "?" (STATUS_FX `confused` sprite) blinks on hit. Sound: a whispered syllable (formant voice, breath 0.8) + a thread whip.

**`enchanter_hush` — Hush** (slot 2, level 4) `(new)`
- 3% Mana · 6 s · 1.5 s cast · 30 m · single target.
- **Non-boss:** Asleep for **20 s** (champions 8 s, rares 4 s; PvP 4 s). Any damage wakes it. DR applies.
- **Boss / immune target:** instead **interrupts** the current cast (works on gold-bordered cast bars) and **silences** 2 s. This use has a **20 s** cooldown (the button shows a boss icon when your target is a boss).
- Look: violet motes settle on the target's head, "zzz" (STATUS_FX `sleep`); on a boss, a finger-to-lips glyph over its head (STATUS_FX `silence`). Sound: a two-note lullaby hum.

**`enchanter_bright_glamour` — Bright Glamour** (slot 3, level 10) `(new)` — support
- 4% Mana · 12 s · instant · 40 m · ally (or yourself, or your charmed creature). **Max 2 glamoured allies**; a 3rd removes the oldest.
- For 12 s: **+20% attack and cast speed**, +10% move speed. On a charmed creature also **+20 Will** (once per 12 s).
- Look: a shimmer of violet-gold sparkles that orbits the ally (STATUS_FX `haste` recoloured violet + `enchant`). Sound: a harp glissando.

**`enchanter_somnolent_tide` — Somnolent Tide** (slot 4, level 18) `(new)`
- 8% Mana · 40 s · 1.5 s cast · ground up to 30 m · a 7 m violet mist that **drifts 1 m/s** in the direction you face while casting, for 6 s.
- Non-boss enemies that stay inside for **1.5 s in a row** fall **Asleep for 12 s** (champions 5 s; rares are immune; DR applies).
- Bosses inside: their cast bars fill 10% slower while inside.
- The mist does **not** pull: sleeping enemies do not call their friends (the one thing sleep does that damage does not).
- Look: a low rolling violet fog with slow sparkles (spellfx `arcane` ground disc + smoke). Sound: a soft chorus "ahh" and wind.

**`enchanter_seed_of_discord` — Seed of Discord** (slot 5, level 28) `(new)`
- 6% Mana · 25 s · 1.0 s cast · 30 m · single target.
- **Non-boss:** **Maddened** 8 s (champions 4 s, rares 3 s): its threat list is wiped, it attacks the nearest other enemy, and enemies it hits fight back at it. Damage does not break it.
- **Boss:** **Distracted** 6 s — takes 10% more damage from your group, and its next targeted (yellow) mechanic within the 6 s picks from the players farthest from the boss (so melee are spared).
- Look: a tiny violet seed that sprouts thorny strings around the target's head; red eyes. Sound: a detuned string plucked twice.

**`enchanter_crown_of_strings` — Crown of Strings** (slot 6, level 40) `(new)` — emergency / big cooldown
- 10% Mana · 120 s · instant · 12 m circle around you.
- **Non-boss enemies:** **Enthralled** 6 s — they stand, do nothing, and damage does **not** break it (this is the "the pull went wrong" button). Does not count for DR.
- **Bosses:** 30% slower movement and attacks, and +15% damage taken for 8 s.
- **Allies inside:** +15% damage for 10 s. **Your charmed creature(s):** Will set to 100.
- Look: a huge circle of violet strings falls from a crown of light above you and ties every enemy; they hang like marionettes (a Chibi 2 "puppet" idle pose). Sound: a music box winding, then a single held note.

---

## 4. Alternate spells

| Trigger | Replaces | Becomes | Numbers |
|---|---|---|---|
| You have a charmed creature | Needling Whisper | **Puppet's Cue** `enchanter_puppets_cue` | instant, 90% SP to your target **and** your charmed creature uses its Alt+1 ability at once (ignores its cooldown once per 10 s) |
| Target is asleep (Hush / Tide) | Hush | **Deepen Dream** `enchanter_deepen_dream` | the sleeping target's sleep resets to full and it will not wake from the **first** hit (next hit wakes it); 3% Mana, 6 s |
| The borrowed bar | — | the creature's own abilities (§2.3) | on Alt+1..5 |

---

## 5. Talents (tiers at 12 / 22 / 32 / 45)

### Needling Whisper
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_needling_whisper_t1a` | Twin Thread | Two threads at two targets, 70% each. |
| 12 | `enchanter_needling_whisper_t1b` | Soft Voice | Castable while moving at 60% speed; does not wake sleeping targets (and deals 0 to them). |
| 22 | `enchanter_needling_whisper_t2a` | Nagging Doubt | At 3 stacks of Unsettled the target also misses 15% of attacks. |
| 22 | `enchanter_needling_whisper_t2b` | Mind Burn | Against a caster, burns 5% of its mana; interrupts non-boss casts. |
| 32 | `enchanter_needling_whisper_t3a` | Thread to the Puppet | Each hit adds +3 Will to your charm. |
| 32 | `enchanter_needling_whisper_t3b` | Whisper Chain | Jumps to 2 more enemies within 8 m at 50%. |
| 45 | `enchanter_needling_whisper_t4a` | Echo Chamber | Unsettled stacks to 6 (30%). |
| 45 | `enchanter_needling_whisper_t4b` | Last Word | Enemies below 20% health take triple damage from it and are Dazed 1 s. |

### Hush
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_hush_t1a` | Hush Pair | Sleeps the target and 1 more enemy within 5 m. |
| 12 | `enchanter_hush_t1b` | Quick Hush | Instant; 12 s cooldown. |
| 22 | `enchanter_hush_t2a` | Unwind a Mind | Cast on an **ally**: breaks any charm, fear or mind-control on them (boss mechanics included) — 30 s cooldown for that use. |
| 22 | `enchanter_hush_t2b` | Heavy Lids | Sleeping targets take 30% more from the first hit that wakes them. |
| 32 | `enchanter_hush_t3a` | Lingering Dream | When the target wakes, it is slowed 40% for 4 s. |
| 32 | `enchanter_hush_t3b` | Boss Lullaby | The boss version's cooldown is 14 s. |
| 45 | `enchanter_hush_t4a` | Nightmare | When the sleep ends by itself, the target takes 300% SP psychic. |
| 45 | `enchanter_hush_t4b` | Sleepwalker | The sleeping target walks slowly (1 m/s) to a point you choose within 15 m (pull it out of a pack). |

### Bright Glamour
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_bright_glamour_t1a` | Glamour of Three | Max 3 allies. |
| 12 | `enchanter_bright_glamour_t1b` | Group Glamour | Hits every ally within 10 m of the target at 50% strength (no max). |
| 22 | `enchanter_bright_glamour_t2a` | Mirror Image | The glamoured ally leaves a mirror image that draws the next non-boss attack (1 per cast). |
| 22 | `enchanter_bright_glamour_t2b` | Clear Mind | Also removes one magic slow or silence. |
| 32 | `enchanter_bright_glamour_t3a` | Rising Glamour | The buff grows +2% every second (to +44% at 12 s). |
| 32 | `enchanter_bright_glamour_t3b` | Spellweaver's Gift | The ally's spells cost 20% less during it. |
| 45 | `enchanter_bright_glamour_t4a` | Enduring Glamour | 20 s duration, 12 s cooldown (two can overlap per ally). |
| 45 | `enchanter_bright_glamour_t4b` | Puppet's Poise | On a charmed creature: it takes 30% less damage and its Will does not drain for 6 s. |

### Somnolent Tide
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_somnolent_tide_t1a` | Still Water | The mist does not drift; 9 m; 8 s. |
| 12 | `enchanter_somnolent_tide_t1b` | Riptide | Drifts at 3 m/s in a line 18 m long. |
| 22 | `enchanter_somnolent_tide_t2a` | Quick Doze | Falls asleep after 0.8 s inside. |
| 22 | `enchanter_somnolent_tide_t2b` | Drowned Dreams | Sleeping enemies inside take 20% SP psychic every 2 s — **without waking** (the one damage that doesn't). |
| 32 | `enchanter_somnolent_tide_t3a` | Dreamcatcher | Enemy projectiles that fly through the mist are destroyed (not boss). |
| 32 | `enchanter_somnolent_tide_t3b` | Sleepy Champion | Champions sleep 10 s. |
| 45 | `enchanter_somnolent_tide_t4a` | Long Tide | The mist lasts 12 s. |
| 45 | `enchanter_somnolent_tide_t4b` | Dream Harvest | Every enemy that falls asleep gives you 1% Mana and your charm +5 Will. |

### Seed of Discord
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_seed_of_discord_t1a` | Spreading Seed | When the Maddened enemy kills something, the seed jumps to the nearest enemy (4 s). |
| 12 | `enchanter_seed_of_discord_t1b` | Two Seeds | 2 charges. |
| 22 | `enchanter_seed_of_discord_t2a` | Bitter Fruit | The Maddened enemy deals +50% damage to its friends. |
| 22 | `enchanter_seed_of_discord_t2b` | Scattering | Instead of fighting, all enemies within 8 m of the target flee in fear for 4 s (non-boss). |
| 32 | `enchanter_seed_of_discord_t3a` | Grudge | Enemies it damaged attack it for 4 s after it ends. |
| 32 | `enchanter_seed_of_discord_t3b` | Boss Doubt | Boss version also makes the boss's cast bar 15% slower for 6 s. |
| 45 | `enchanter_seed_of_discord_t4a` | Civil War | Maddens 3 enemies within 10 m at once, each attacks one of the others. |
| 45 | `enchanter_seed_of_discord_t4b` | Seed to Charm | When Maddened ends on a charmable enemy, it is charmed for free at 50 Will. |

### Crown of Strings
| Tier | id | Name | What it does |
|---|---|---|---|
| 12 | `enchanter_crown_of_strings_t1a` | Thrown Crown | Ground target up to 30 m. |
| 12 | `enchanter_crown_of_strings_t1b` | Tight Strings | 8 m, but 9 s Enthrall. |
| 22 | `enchanter_crown_of_strings_t2a` | Marionette Dance | Enthralled enemies walk to the centre of the circle (bunching them for area damage). |
| 22 | `enchanter_crown_of_strings_t2b` | Sheltering Crown | Allies inside also get a barrier of 15% max health. |
| 32 | `enchanter_crown_of_strings_t3a` | Puppet Court | Every Enthralled normal enemy counts as charmed for the 6 s: it attacks your target at 50%. |
| 32 | `enchanter_crown_of_strings_t3b` | Cut Strings | When Enthrall ends, 150% SP psychic to each. |
| 45 | `enchanter_crown_of_strings_t4a` | Regent | Cooldown 90 s. |
| 45 | `enchanter_crown_of_strings_t4b` | The Long Performance | Enthrall lasts until the first enemy is damaged **by a player** + 2 s, max 15 s. |

---

## 6. Rotation / how it plays

- **Solo:** Charm the strongest normal in a pack, Hush the second, fight the rest with your charmed creature and Needling Whisper. Glamour yourself or the pet. Release it to sleep before Will runs out, charm a fresh one.
- **Dungeon:** before every pull, Hush the caster or healer of the pack (sleeping enemies do not join). Charm a champion when you have Calling 20 — its aura now works for you. Glamour the tank and top damage player. Somnolent Tide on adds; Crown when the tank loses control.
- **Raid:** the Enchanter is the group's interrupt-and-control specialist: the boss version of Hush is a 20 s interrupt, Seed of Discord steers a boss's targeted mechanic, Unwind a Mind frees allies from boss mind control. Charms work only on trash and adds (never across the boss door).

## 7. Boss mechanics

| Mechanic | Enchanter answer |
|---|---|
| Gold-bordered (interruptible) casts | Hush (boss version) 20 s / 14 s with Boss Lullaby. |
| Adds | Somnolent Tide, Crown; charm the add that heals the boss (if charmable). |
| A charmed add and soaks | a charmed creature on **Hold here** **counts as one player** in a soak circle. |
| Boss mind control / charm on a player | Unwind a Mind (Hush t2a). |
| Targeted (yellow) circles | Seed of Discord's boss version moves the next one to far-away players. |
| Boss immune to control | every spell has a boss version: interrupt, Distracted, slow + damage taken. The Enchanter never has a dead button on a boss. |
| Charm across the boss door | the charmed creature waits outside (§2.2) — charms are for trash and add waves. |
| Enrage timers | Glamour on the top two damage dealers, Crown for the +15%. |

---

## 8. Class sets

### `set_enchanter_dreamweavers_raiment` — Dreamweaver's Raiment (levels 25–30)
Drops: `d07_thornheart`, `d08_moonwell_ruins` bosses (Normal, 15%); complete on Heroic.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Hush lasts 30 s on normal enemies. | `enchanter_hush` |
| 4 | Somnolent Tide's mist is 9 m wide. | `enchanter_somnolent_tide` |
| 6 | Enemies that wake up from your sleep are Unsettled at 3 stacks. | Needling Whisper / sleeps |

### `set_enchanter_marionettists_finery` — The Marionettist's Finery (level 60)
Drops: `r04_ember_court` bosses, token system; 6th piece Mythic only.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Will drains 25% slower. | Charm |
| 4 | Your charmed creature's borrowed abilities have 30% shorter cooldowns. | borrowed bar |
| 6 | Crown of Strings charms one Enthralled normal enemy for free (lowest health one) when it ends. | `enchanter_crown_of_strings`, Charm |

### `set_enchanter_veilsilk_vestments` — Veilsilk Vestments (level 60, Mythic+)
Drops: `d09`–`d14` Mythic+ end chest at key 8+.

| Pieces | Bonus | Changes |
|---|---|---|
| 2 | Bright Glamour's speed bonus is +25%. | `enchanter_bright_glamour` |
| 4 | Seed of Discord's cooldown drops by 5 s every time Hush interrupts a boss. | `enchanter_seed_of_discord`, `enchanter_hush` |
| 6 | Mythic+ trash no longer drains Will 50% faster. | Charm |

---

## 9. Legendaries and uniques

| id | Name | Slot | Power (numbers) | Drop source |
|---|---|---|---|---|
| `leg_puppeteers_crossbar` | The Puppeteer's Crossbar | off hand (Effigy) | 2 charms from Calling 20 (3 at Calling 40). | `r04_ember_court` secret boss |
| `leg_music_box_of_the_drowned_queen` | Music Box of the Drowned Queen | neck | Hush hits 3 targets within 6 m of the first. | `r03_sunken_choir` boss 6 (Mythic 6%) |
| `leg_circlet_of_quiet_hours` | Circlet of Quiet Hours | head | Sleeping enemies do not wake from **area** damage (only single-target hits wake them). | `d08_moonwell_ruins` Heroic/Mythic+ final boss (4%) |
| `leg_stringcutter_staff` | Stringcutter Staff | staff | Snap (Calling 40 release) needs no Calling and deals `Will × 6% SP`. | Riftmarch world boss (weekly 6%) |
| `leg_borrowed_crown` | The Borrowed Crown | head | Charmed champions keep **all** their champion modifiers at 100% and their aura is doubled in size. | `r05_veilspire` boss 9 (Mythic 5%) |
| `uq_lullaby_wand` | Lullaby Wand | wand | Needling Whisper puts non-bosses at 3 Unsettled stacks to sleep for 4 s. | `d02_drowned_mill` final boss (Normal 12%) |
| `uq_fen_dog_collar` | Fen-Dog Collar | waist | Charmed beasts (page 10 `beast` family) drain Will 40% slower. | `d02_drowned_mill` boss 1 |
| `uq_courtiers_gloves` | Courtier's Gloves | hands | Bright Glamour also grants +8% crit chance. | `d06_sandsworn_vault` final boss |

---

## 10. Voice and barks

- Timbre: `voiceFor({ role: 'support', gender, seed })`, soft, sing-song (intonation 1.4), slow word gap; sleep lines are hummed (the formant engine's vowel-only mode). `(reuse: shared/voices.js)`

| Event | Lines |
|---|---|
| Hush | "Shh." · "Rest now." · "Sleep, little thing." |
| Charm | "You're with me now." · "Come, walk with me." |
| Charm about to break (25 Will) | "Its mind is slipping!" · "It's waking up!" |
| Charm breaks | "Oh. Oh no. Run." |
| Seed of Discord | "Isn't *he* the one you hate?" |
| Crown of Strings | "Everyone. Be. Still." |
| Crit | "Lovely." |
| Low health | "Someone hold them — I can't!" |
| Out of Mana | "My head's empty." |

---

## 11. Reuse notes

| Wildmarch piece | Borrowed from | Notes |
|---|---|---|
| Charm strings | spellfx `arcane` ribbon + STATUS_FX `enchant` | new string mesh |
| Sleep / silence / confused | STATUS_FX `sleep`, `silence`, `confused` (`avatar-3d/js/spellfx.js`) | as is |
| Charmed creature AI | Farhold pet/companion code (`js/pets.js` follow/attack, `js/followers.js`) running a **monster's** kit | enemy flips side; threat table wiped (page 05) |
| Borrowed bar | Farhold skill bar UI (`js/skills.js` `createSkillBar`) second instance | new frame |
| Somnolent Tide | Farhold `toxic_cloud` ground pulse engine | drifts |
| Crown pose | Chibi 2 idle clip with arms raised (new "puppet" pose in `chibi2-motion.js`) | small art task |
| Outfit | `class-outfits.json` `enchanter` (circlet, high-collar robe, shoulder cape) | |
| Emberveil ideas | `lullaby`, `mind_charm`, `mass_drowse`, `arcane_jolt` | reborn as Hush, Charm, Somnolent Tide, Nightmare talent |
