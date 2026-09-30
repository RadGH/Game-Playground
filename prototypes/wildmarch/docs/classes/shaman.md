# Shaman (`shaman`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 22, §12.1 W31.
> Status: v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built.
> **Round 2 rebuilt this class from scratch** (W31): totems are gone entirely. The shaman is now a caster of
> **storm, folklore and animals** — it tells the old tales of the storm-beasts and they answer. See §12 for
> what was removed.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **SP** = spell power (page 05). For a staff or sceptre user, 100% SP is about one hit of the equipped weapon at the same item level.
- **Mana** ([page 06](../06-CLASSES.md) §Resources owns it): pool **1,000** + 2 per INT + gear. Refills **1% of max a
  second** in combat and 4% out of combat. Shaman costs: filler 50–60, heals 60–150, big spells 200–250. A shaman
  healing at full pace runs dry in about 90 s without the Rain Crane's mana rider (§2.3) and lasts a boss fight with it.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- Area damage and healing fall off toward the rim as in Farhold (reuse: `js/actors.js` `strikeArea`).
- "Group" = the party of up to 5.
- **Targeting kinds** (00 §12.1 W8): **Needs target** will not cast without a valid target; **Auto-target**
  uses your target, or picks the valid enemy nearest your aim point; **Ground**; **Self**; **Ally** uses your
  friendly target (`F1` yourself, `F2`–`F5` party members), otherwise yourself.

---

## 1. Identity

| | |
|---|---|
| Fantasy | A weather-worn teller of old tales in oilskin and feathers, with a hide drum at the hip. When the shaman tells the tale of a storm-beast — the Thunder Ox, the Rain Crane, the Wind Hare — the sky remembers it and the beast comes striding out of the clouds. |
| Primary role | **Healer** — rain and wind healing |
| Hybrid role | **Damage** — hail and thunder (§5) |
| Build | Caster |
| Armour | Medium |
| Weapons | **Staff** (two-handed) or **sceptre** + an off-hand **focus** or **shield** (reuse: `js/weapons.js` `quarterstaff`, `scepter`; `js/foci.js`). The off-hand focus look for this class is a **hide drum** (new art, page 17). |
| Primary attribute | INT |
| Resource | **Mana** + **Storm Tales** (§2): the beast that rides your spells, and the cycle toward the Great Storm |
| Companion | **None.** The storm-beasts are parts of the shaman's spells, not pets: they have no health, cannot be targeted, take no party slot and never count toward a soak (00 §6, §10). |

**Playstyle in three sentences.** The shaman heals with rain and wind and strikes with thunder and hail, and
between spells it **tells a tale** (`Shift+1`–`3`): the Thunder Ox, the Rain Crane or the Wind Hare comes out of
the sky, does one thing, and then **rides** the shaman's next few spells, changing what each of them does. The
art of the class is choosing which beast rides next — the Ox makes spells hit, the Crane makes them mend, the
Hare makes them spread. Tell all three tales in one cycle and the **Great Storm** is ready: for a few seconds
all three beasts ride every spell at once.

**How it differs from its neighbours.** The **Stormcaller** is a pure lightning zoner: Static charges that chain
between enemies and lightning rods driven into the ground. The **Druid** changes its own body. The shaman does
neither — it has no charges, no ground objects and no forms; its trick is the **rider** that the last tale leaves
on its spells.

---

## 2. Class mechanic — Storm Tales

### 2.1 The three tales

Each tale is a class action on the form/stance keys (page 02: `Shift+1`–`4`; the shaman uses three). Telling
one is **instant**, on the GCD, costs **60 mana**, and has its **own 10 s cooldown**. The beast appears for about
2 s (its **entrance**), then fades into the clouds overhead and **rides** your next spells (§2.2).

| Key | id | Tale | Entrance (what the beast does when it arrives) | Targeting · Tags | Rider (§2.2) in one line |
|---|---|---|---|---|---|
| `Shift+1` | `shaman_tale_thunder_ox` | **The Thunder Ox** — "the ox whose hooves are the thunder" | The Ox stamps down on your enemy target: **100% SP lightning** in a 5 m circle, non-boss enemies **Staggered** 0.5 s | Auto-target (30 m) · `tag_spell` `tag_lightning` `tag_area` | spells **hit harder** (+ lightning) |
| `Shift+2` | `shaman_tale_rain_crane` | **The Rain Crane** — "the crane who carries the rain in her bill" | The Crane lands beside your friendly target (or you) and shakes out a shower: allies within 6 m heal **120% SP** and each loses **one magic harmful status** (the shaman's magic dispel; never a mechanic status) | Ally (40 m) · `tag_spell` `tag_nature` `tag_heal` | spells **mend** (+ healing, mana back) |
| `Shift+3` | `shaman_tale_wind_hare` | **The Wind Hare** — "the hare who outran the wind and was made its herald" | The Hare runs a ring round you: allies within 15 m gain **+20% move speed for 4 s** and heal **40% SP** | Self · `tag_spell` `tag_nature` `tag_heal` `tag_movement` | spells **spread** (jump, widen, carry) |

The beasts are **visual parts of the spell** (like a projectile): no body, no health, not targetable, not a
companion, never in a soak's count, never hit by anything.

### 2.2 The rider

- The **last beast told rides your next spells**: the next **2** spells after `q_calling_shaman_1`, the next
  **3** after `q_calling_shaman_2`, and always for at most **12 s**. Telling another tale replaces the rider.
- Every one of the six spells says what each rider adds (§3.2, the **Ox / Crane / Hare** lines). A tale itself
  never uses up a rider.
- **Shared rider rule (all spells)**: while the **Rain Crane** rides, each spell cast also returns **2% of max mana**.
- From `q_calling_shaman_3` the **Old Telling** keeps the **previous** rider too, at **half strength** (so two
  beasts ride at once; the older one's effects are halved).

### 2.3 The cycle and the Great Storm (from the level-20 calling quest)

- A **cycle** is telling all three tales, **each once, in any order, without repeating one** — Ox, Crane, Hare or
  Hare, Ox, Crane, and so on. Repeating a tale before the cycle is complete restarts the cycle from that tale.
  The cycle also restarts if **30 s** pass without a tale.
- When a cycle completes, the **Great Storm is ready** for **20 s**: press **`Q`** (the class key) to call it.
- **`shaman_great_storm` — The Great Storm** · cost none · instant, off the GCD · **Targeting** Self · **Tags**
  `tag_spell`, `tag_lightning`, `tag_nature`, `tag_area`, `tag_aura`, `tag_duration`, `tag_heal`.
  - For **12 s** (16 s from calling 3) the sky over a **25 m** circle around you turns storm-dark (it moves with you).
  - **All three beasts ride every spell** you cast, at full strength, and your spells do not use up riders.
  - **Rain**: every ally in the circle heals **1.5% of max health a second**.
  - **Thunder**: every 1 s, a bolt strikes one enemy in the circle (your target first) for **60% SP lightning**.
  - **Wind**: allies in the circle have **+15% move speed**.
  - **Lockout**: once it ends, the Great Storm cannot be readied again for **90 s** ("the sky is spent"); tales still
    work and still ride, but the cycle ring stays grey until the lockout passes.
  - From calling 3, when the storm breaks, **one dead ally** in the circle (the one who fell most recently) gets up
    at **30% health** — the shaman's in-combat revive (no limit beyond the 90 s lockout, 00 W21).
  - **Group buff family** `great_storm`: two shamans' storms in one place do not stack; the stronger counts.

### 2.4 Gauge UI

`hud_class_gauge` (page 03): a round **hide drum** under the health bar.

- Around the drum's rim sit three painted figures: the **Ox** (left, gold-white), the **Crane** (top, rain-blue),
  the **Hare** (right, wind-green). Each shows its 10 s cooldown as a sweep.
- The **rider** is painted in the drum's centre, with small pips underneath for the spells it has left (2 or 3)
  and a thin ring for its 12 s. From calling 3 the previous rider sits faded behind it.
- A **cycle ring** round the whole drum has three arcs, one per beast; each arc fills in the beast's colour when
  that tale is told in the current cycle. A repeat empties the ring with a soft drum-thump.
- When the cycle completes, the drum glows storm-grey, lightning flickers round it, and a prompt reads
  **"Q — The Great Storm"** with a 20 s bar. During the lockout the ring is grey with a 90 s sweep.
- Sounds: each tale starts with one drum stroke and the first words of the tale in the shaman's voice (§10).

### 2.5 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_shaman_1` "The Crane and the Ox" | `npc_elder_bonechant`, a teller of old tales in a stilt hut at Reedhollow (Mossfen) | Hear the two tales at the village fire, then walk to the crane's pool and the ox's hill in the fen and tell each tale there while the beast tests you (heal a drowning fisher in the Crane's rain; survive the Ox's stamp) | the **Thunder Ox** and **Rain Crane** tales; riders last **2** spells |
| 20 | `q_calling_shaman_2` "The Hare Who Outran the Wind" | Elder Bonechant, the Sunscar mesas | Race the wind across five mesa tops and tell the third tale where the hare stopped | the **Wind Hare** tale; riders last **3** spells; **the cycle and the Great Storm** |
| 40 | `q_calling_shaman_3` "The Storm Remembers" | Elder Bonechant, the storm peak above Rimehold | Tell the whole cycle three times on the peak while the three beasts, in their oldest shapes, test you in turn | **The Old Telling**: two riders (the older at half), the Great Storm lasts 16 s, and it raises one fallen ally when it breaks |

Before level 6 the shaman has no tales: the six spells work as written in their plain line.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Targeting | Range | Shape | Tags | Main effect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `shaman_skycrack` | Sky-Crack | 50 mana | — | 1.5 s | Auto-target | 38 m | bolt from the sky | `tag_spell` `tag_lightning` | 140% SP lightning |
| 2 | 4 | `shaman_rainsong` | Rainsong | 90 mana | — | 1.5 s | Needs target (ally) | 40 m | one ally | `tag_spell` `tag_nature` `tag_heal` | heal 280% SP |
| 3 | 10 | `shaman_cranes_rain` | Crane's Rain | 150 mana | 12 s | 1.0 s | Ground | 35 m | ground circle 8 m, 6 s | `tag_spell` `tag_nature` `tag_heal` `tag_area` `tag_duration` | 55% SP heal a second to allies inside |
| 4 | 18 | `shaman_hares_wind` | Hare's Wind | 120 mana | 30 s | instant | Self | 25 m | every ally in 25 m | `tag_spell` `tag_nature` `tag_heal` `tag_movement` `tag_duration` | +25% move, 30% SP heal a second, 6 s |
| 5 | 28 | `shaman_yoke_of_the_ox` | Yoke of the Ox | 110 mana | 20 s | instant | Needs target (ally) | 40 m | one ally | `tag_spell` `tag_lightning` `tag_shield` `tag_duration` | barrier 360% SP + 15% less damage, 10 s |
| 6 | 40 | `shaman_stampede` | Stampede of the Storm | 250 mana | 120 s | 2.0 s | Ground (a direction) | 40 m | line 40 m × 10 m | `tag_spell` `tag_lightning` `tag_nature` `tag_area` `tag_heal` `tag_movement` | 400% SP to enemies and 400% SP heal to allies on the line |

### 3.2 The spells in full

**`shaman_skycrack` — Sky-Crack** · slot 1 · level 1
- **Cost** 50 mana · **Cooldown** none · **Cast** 1.5 s · **Range** 38 m · **Shape** a bolt straight down onto the target, 1.5 m splash.
- **Targeting** Auto-target · **Tags** `tag_spell`, `tag_lightning`.
- **Effect** **140% SP lightning** — "the sky cracks where the Ox once stepped".
- **Ox**: +40% damage (196% SP) and the target is Staggered 0.5 s (non-boss). **Crane**: 40% of the damage heals
  the most injured ally within 20 m. **Hare**: the bolt forks to 2 more enemies within 10 m for 60% each.
- **Looks like**: a thin jagged bolt from a small cloud that forms over the target (spellfx `lightning`, bolt line;
  a hoof-shaped scorch decal where it lands).
- **Sound**: a low hum on the cast, a dry crack on hit.

**`shaman_rainsong` — Rainsong** · slot 2 · level 4
- **Cost** 90 mana · **Cooldown** none · **Cast** 1.5 s · **Range** 40 m · **Shape** one ally.
- **Targeting** Needs target (a friendly target: `F1` yourself, `F2`–`F5`, a party frame; 00 W8 — heals need a
  target) · **Tags** `tag_spell`, `tag_nature`, `tag_heal`.
- **Effect** heals **280% SP**.
- **Ox**: the ally is **Thunder-Hided** for 6 s — the next melee attacker to hit them takes 100% SP lightning.
  **Crane**: also heals **90% SP over 6 s** (**Soaked**, a heal over time; adds `tag_duration`). **Hare**: the
  heal jumps to **1 more ally** within 12 m (the most injured) for 50%.
- **Looks like**: a short soft rain falls only on the ally, and a faint song-line of blue notes runs from you to
  them (spellfx `heal`, colour `#9ad8ff`, rain streak sprites).
- **Sound**: a hummed three-note phrase and rain on leaves.

**`shaman_cranes_rain` — Crane's Rain** · slot 3 · level 10
- **Cost** 150 mana · **Cooldown** 12 s · **Cast** 1.0 s · **Range** 35 m · **Shape** ground circle, 8 m radius, lasts **6 s** (it stays where it falls).
- **Targeting** Ground · **Tags** `tag_spell`, `tag_nature`, `tag_heal`, `tag_area`, `tag_duration`.
- **Effect** allies inside heal **55% SP a second** (330% SP over 6 s).
- **Ox**: enemies inside take **40% SP lightning a second** (adds `tag_lightning`). **Crane**: radius 12 m.
  **Hare**: the rain **follows you** (a moving circle centred on you) instead of staying on the ground.
- **Looks like**: a grey crane glides over and the cloud it leaves behind rains on the circle (spellfx `heal`
  ground ring, rain particles; a crane silhouette crosses the cloud once).
- **Sound**: one crane call, then steady rain for 6 s.

**`shaman_hares_wind` — Hare's Wind** · slot 4 · level 18
- **Cost** 120 mana · **Cooldown** 30 s · **Cast** instant · **Range** every ally within 25 m of you · **Shape** self-centred.
- **Targeting** Self · **Tags** `tag_spell`, `tag_nature`, `tag_heal`, `tag_movement`, `tag_duration`.
- **Effect** allies gain **Windborne** for **6 s**: **+25% move speed** and they heal **30% SP a second**
  (180% SP over 6 s). Group buff family `group_speed` (the strongest move buff wins).
- **Ox**: also removes one **Slow, Snare or Root** from each ally (non-mechanic). **Crane**: 45% SP a second.
  **Hare**: lasts **10 s**.
- **Looks like**: a green-white hare streaks round the group and a spiral of wind and leaves follows each ally
  (spellfx `haste` aura recoloured wind-green, leaf sprites).
- **Sound**: a rush of wind and a light patter of running feet.

**`shaman_yoke_of_the_ox` — Yoke of the Ox** · slot 5 · level 28
- **Cost** 110 mana · **Cooldown** 20 s · **Cast** instant · **Range** 40 m · **Shape** one ally.
- **Targeting** Needs target (ally) · **Tags** `tag_spell`, `tag_lightning`, `tag_shield`, `tag_duration`.
- **Effect** for **10 s** the Ox's yoke rests on the ally: a **barrier of 360% SP** and **15% less damage taken**.
  If the barrier breaks, the Ox stamps once around them: **150% SP lightning** in 5 m.
- **Ox**: barrier +30% (468% SP). **Crane**: if the barrier is still up when it ends, what is left heals the ally.
  **Hare**: a second copy at **50%** goes to the most injured other ally within 20 m.
- **Looks like**: a translucent gold-white ox yoke settles across the ally's shoulders and a faint ox shape stands
  behind them (spellfx `barrier` status recoloured `#f0e6c0`).
- **Sound**: a deep lowing call and a wooden knock.

**`shaman_stampede` — Stampede of the Storm** · slot 6 · level 40
- **Cost** 250 mana · **Cooldown** 120 s · **Cast** 2.0 s · **Range** starts at you and runs **40 m** toward your aim point · **Shape** a line 10 m wide.
- **Targeting** Ground (the aim point sets the direction) · **Tags** `tag_spell`, `tag_lightning`, `tag_nature`,
  `tag_area`, `tag_heal`, `tag_movement`.
- **Effect** the whole herd of the storm — oxen, cranes and hares made of cloud and rain — runs down the line in
  1.5 s. Enemies on it take **400% SP lightning** and non-boss enemies are **Knocked Down** 1 s. Allies on it heal
  **400% SP** and gain +20% move speed for 4 s.
- **Ox**: damage +30%. **Crane**: heal +30%, and every ally it crosses is **Soaked** (90% SP over 6 s). **Hare**:
  the herd **turns and runs back** along the line at 50%.
- **Limits**: bosses are not knocked down (the break bar fills instead, page 11).
- **Looks like**: a rolling wall of cloud with animal shapes inside it, rain and small lightning forks along its
  front (a new effect, `fx_storm_herd`, built from spellfx `lightning` forks, rain particles and Chibi 2 creature
  silhouettes with a cloud material).
- **Sound**: thunder that rolls from one end of the line to the other, hoofbeats and wingbeats under it.

### 3.3 Rotation — how it plays

**Healing a dungeon (Healer focus).** Before the pull, tell the **Crane** (her rider gives mana back and adds heals
over time). Keep **Rainsong** on the tank; drop **Crane's Rain** where the group stands; answer a hit on the group
with **Hare's Wind**; **Yoke** the tank before a big single hit. Tell the tales in a cycle whenever the moment
allows — **Ox** before a big damage phase so your heals carry thunder, **Hare** when the group spreads — and save the
**Great Storm** for the fight's worst 12 s. **Stampede** is a group heal you aim through the group.

**Solo.** Tell the **Ox**, then **Sky-Crack** twice (it rides both); **Crane** when you need to top up (Sky-Crack's
Crane rider heals you); **Yoke** yourself (`F1`) before a big enemy hits.

**Dungeon as Damage.** See §5.

### 3.4 What the shaman gives a group (5)

| Gives | Group of 5 | Stacks with |
|---|---|---|
| Healing | Rainsong, Crane's Rain, Hare's Wind, Yoke, Stampede | other healers normally |
| Hare's Wind | +25% move speed for 6 s every 30 s (`group_speed`) | the strongest move buff wins |
| The Great Storm | 1.5% max health a second, +15% move, extra riders, 12–16 s every ~90 s | not a second Great Storm |
| Magic dispel | the Rain Crane's entrance removes 1 magic harmful status from each ally within 6 m, every 10 s | — |
| Battle revive | from 40: one ally when the Great Storm breaks (every ~90 s) | other classes' revives |
| Yoke of the Ox | 360% SP barrier + 15% less damage on one ally every 20 s | other barriers (page 05 barrier rules) |

### 3.5 Boss mechanics

| Mechanic | What the shaman does |
|---|---|
| **Void zone** | Crane's Rain stays where it falls; take the Hare rider (the rain follows you) when the group must keep moving. |
| **Soak** | Crane's Rain or the Great Storm on the soak circle heals the soakers. The storm-beasts **never count** toward a soak (00 §10). |
| **Danger zone** | Hare's Wind (+25% speed) gets the group out; the Ox rider on Hare's Wind also clears a Slow. |
| **Tank buster** | Yoke of the Ox on the tank just before it. |
| **Room-wide hits** | Call the Great Storm just before a room-wide hit, or Stampede through the group right after it. |
| **Magic debuffs** | The Rain Crane's entrance removes one per ally within 6 m (never a mechanic status). |
| **Interrupts** | The shaman has **no interrupt**. |
| **Immunities** | Bosses are not Staggered or Knocked Down (the break bar fills instead). |

---

## 4. Alternate spells

None as a separate bar. The **riders** (§2.2) change every spell, and the hybrid Damage focus changes two spells
(§5.2).

---

## 5. The hybrid role — Damage (hail and thunder)

The Damage shaman keeps the same tales and the same bar, but two of its heals turn into weapons of the storm:
**hail** for single targets and packs, and the Ox's **thunder** on top. It is tuned for the open world, Normal
dungeons and Depth up to about 10; in Challenge mode it is weaker than a primary damage caster because its
biggest damage cooldown (Stampede) is on 120 s and half of every Great Storm goes to healing nobody needs.

### 5.1 What Damage focus turns on

Setting the canon **Role focus** switch (00 §6: in the spellbook, out of combat only, saved per Loadout; page 06
§Role focus) to **Hybrid** queues the shaman as **Damage** in the Dungeon Finder, gives the shared **Striker** passive (+5% damage) and:

| Change | Rule |
|---|---|
| Damage and healing | your damage spells deal **+25%**; your healing is **−40%** |
| Rainsong | becomes **Hailsong** (§5.2) |
| Crane's Rain | becomes **Hailstorm** (§5.2) |
| Crane rider | while the Crane rides a damage spell, 40% of its damage heals the most injured ally within 20 m (the same as Sky-Crack's) |
| The Great Storm | its thunder strikes **twice** a second; its rain heals 0.75% a second |

### 5.2 The Damage versions

- **`shaman_hailsong` — Hailsong** (Rainsong in Damage focus) · 90 mana · 1.5 s cast · 40 m · **Auto-target** ·
  **Tags** `tag_spell`, `tag_ice`, `tag_projectile`. Hurls a fist of hail: **260% SP ice**, Slowed 30% for 3 s.
  **Ox** +40% damage; **Crane** 40% of the damage heals an ally; **Hare** the hail bursts on a 4 m circle for 50%.
- **`shaman_hailstorm` — Hailstorm** (Crane's Rain in Damage focus) · 150 mana · 12 s cooldown · 1.0 s cast · 35 m ·
  **Ground** · **Tags** `tag_spell`, `tag_ice`, `tag_area`, `tag_duration`. An 8 m circle for 6 s: enemies inside
  take **55% SP ice a second** and are Slowed 20%. **Ox** thunder strikes inside every 1.5 s for 60% SP lightning;
  **Crane** allies inside heal 20% SP a second; **Hare** the circle follows your target.

### 5.3 How a Damage shaman plays

Tell the **Ox**, **Hailsong**, **Sky-Crack**, **Sky-Crack** (three spells ride). Tell the **Hare** before a pack and
drop **Hailstorm** on it (it follows the target), then **Sky-Crack** forks. Tell the **Crane** to finish the cycle
and call the **Great Storm** with the pack or the boss at low health; **Stampede** through the pack during the
storm (all three riders: +30% damage, the herd runs back).

### 5.4 Numbers against the budget

At level 40 a Damage shaman does about **85% of a primary damage caster's** damage on a long single-target fight
(page 06 §Damage budget), and about **95%** on packs (Hailstorm, Hare-ridden Sky-Crack, Stampede). Talents that
lean Damage: Sky-Crack t1a **Twin Hooves**, t3c **Rolling Thunder**; Crane's Rain t2c **Hard Rain**; Stampede
t2a **Endless Herd**. Set: **Regalia of the Great Storm** 4-piece. Soul: `soul_ox_thunder_stride`.

---

## 6. Utility spells

None. The shaman travels by scrolls, the Recall Stone and Travel Methods like everyone else
([page 20](../20-TRAVEL.md)).

---

## 7. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`). The talents of Rainsong and Crane's Rain also
apply to Hailsong and Hailstorm, read in their damage sense ("heal" → "damage").

**Sky-Crack** (`shaman_skycrack`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Twin Hooves** — two bolts land 0.3 s apart on the target, 80% each | **Long Crack** — 2.5 s cast, 260% SP, the target is Slowed 30% for 3 s | — |
| 2 (22) | **Crane's Answer** — 25% of the damage always heals the most injured ally within 20 m, whatever rides | **Hare's Fork** — the bolt always forks to 1 more enemy for 50% | — |
| 3 (32) | **Storm Omen** — each hit takes 1 s off every tale's cooldown | **Told Twice** — 20% chance a second bolt follows for free | **Rolling Thunder** — each Sky-Crack within 3 s of the last adds +10% (up to +40%) |
| 4 (45) | **The Ox Never Tires** — while the Ox rides, Sky-Crack does not use up the rider | **Cloudbreak** — a critical Sky-Crack readies the Great Storm's cycle one step (counts as the missing tale that is off cooldown first); once per 30 s | — |

**Rainsong** (`shaman_rainsong`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Downpour** — only the target, 460% SP, 2.0 s cast | **Drizzle** — 1.0 s cast, 190% SP | — |
| 2 (22) | **Cleansing Rain** — also removes one poison or disease | **Rain on Rain** — healing past full health becomes a barrier for 6 s | **Long Song** — Soaked (the Crane rider) always applies, whatever rides |
| 3 (32) | **Swift Song** — every 3rd Rainsong is instant | **Kin Song** — the heal also touches you for 30% if you are not the target | — |
| 4 (45) | **Returning Rain** — the Hare's jump comes back to the first ally for 60% | **Storm-Blessed** — a Rainsong cast during the Great Storm heals every ally in the storm for 40% of its amount | — |

**Crane's Rain** (`shaman_cranes_rain`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Wide Wings** — radius 11 m, 45% SP a second | **Stooping Crane** — radius 5 m, 80% SP a second | — |
| 2 (22) | **Standing Water** — the rain lasts 10 s | **Crane's Pool** — allies inside regain 1% of max mana a second (5 Tempo / 4 Momentum a second for others) | **Hard Rain** — enemies inside take 25% SP a second as ice, whatever rides (adds `tag_ice`) |
| 3 (32) | **Two Clouds** — 2 charges | **Rain on the Move** — the circle drifts toward the most injured ally at 3 m a second | — |
| 4 (45) | **Monsoon** — when it ends, the whole circle heals once more for 150% SP | **Crane Stays** — the first ally to drop below 30% inside it is healed at once for 200% SP (once per cast) | — |

**Hare's Wind** (`shaman_hares_wind`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Tailwind** — +40% move speed, 4 s | **Still Air** — no speed; 50% SP heal a second instead | — |
| 2 (22) | **Leaping Hare** — you also leap 12 m toward your aim point (adds `tag_movement` to you as a dash) | **Loose Leaves** — allies are also immune to knockback (non-mechanic) while Windborne | — |
| 3 (32) | **Every Hare Runs** — 2 charges | **Wind Shear** — enemies within 8 m of you are pushed 4 m back (non-boss) | **Gust of Mercy** — the ally with the least health gets double the healing |
| 4 (45) | **Herald of the Wind** — casting it tells the **Wind Hare** tale for free (no cooldown used; counts for the cycle) | **Long Run** — every ally who ends Windborne above 90% health has 2 s taken off your tale cooldowns (up to 6 s) | — |

**Yoke of the Ox** (`shaman_yoke_of_the_ox`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Heavy Yoke** — 540% SP barrier, 30 s cooldown | **Light Yoke** — 240% SP barrier, 10 s cooldown | — |
| 2 (28) | **Rooted Ox** — the ally cannot be knocked back or pulled (non-mechanic) while yoked | **Ox's Anger** — the thunder stamp when it breaks is 300% SP and Staggers (non-boss) | — |
| 3 (32) | **Yoke of Two** — the Hare's 50% copy always happens, whatever rides | **Patient Ox** — lasts 16 s | — |
| 4 (45) | **Unbroken Yoke** — a killing blow on a yoked ally that is not `unavoidable` leaves them at 1 health instead (once per cast) | **Pulling Together** — while yoked, the ally deals +8% damage | — |

**Stampede of the Storm** (`shaman_stampede`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Wide Herd** — the line is 16 m wide | **Narrow Run** — the line is 5 m wide but 60 m long, and deals and heals +25% | — |
| 2 (40) | **Endless Herd** — the herd runs twice (back along the line at 50%) whatever rides | **Herd of Cranes** — allies on the line are also Soaked (90% SP over 6 s) whatever rides | — |
| 3 (40) | **Ride With Them** — you run with the herd to the end of the line (adds `tag_movement` to you) | **Storm-Called** — casting it during the Great Storm adds 4 s to the storm | **Trampled** — enemies on the line take 15% more damage from you for 8 s |
| 4 (45) | **All the Old Tales** — casting it tells all three tales at once (riders and the cycle; tale cooldowns are not used) | **Quick Herd** — instant cast, 90 s cooldown | — |

---

## 8. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_shaman_storyteller` | **The Storyteller's Oilskins** | `it_storyteller_feathered_hood`, `it_storyteller_capelet`, `it_storyteller_oilskin`, `it_storyteller_drumgloves`, `it_storyteller_leggings`, `it_storyteller_walking_boots` | Levels 19–28: bosses of `d05_glass_tombs`, `d06_sandsworn_vault`, `d07_thornheart` on Normal. Level-60 copies from the same bosses in **Challenge** mode |
| `set_shaman_great_storm` | **Regalia of the Great Storm** | `it_great_storm_horned_crown`, `it_great_storm_mantle`, `it_great_storm_hauberk`, `it_great_storm_grips`, `it_great_storm_greaves`, `it_great_storm_treads` | Levels 36–45: bosses of `d10_rimefang_caverns` and `d11_saltdeep_cathedral` on Normal. Level 60: **Challenge**-mode bosses of `d13_cindergate`–`d16_the_spire` and Depth end chests from Depth 10 up; the hauberk is also a Leatherworking recipe (page 19) learned from `b_rimefang` |

**The Storyteller's Oilskins**
- **2 pieces** — riders last **1 spell longer**.
- **4 pieces** — telling a tale that completes a cycle refunds its 60 mana and takes 5 s off the other two tales' cooldowns.
- **6 pieces** — Crane's Rain always carries the Crane rider at 50%, whatever rides.

**Regalia of the Great Storm**
- **2 pieces** — the Great Storm lasts 4 s longer.
- **4 pieces** — the Great Storm's lockout is **60 s** instead of 90 s. In Damage focus, its thunder bolts also Stagger (non-boss).
- **6 pieces** — during the Great Storm, each spell you cast calls a small storm-beast of the matching kind that
  repeats the spell's rider effect once more at 50%.

---

## 9. Class legendaries, uniques and souls

### 9.1 Legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_staff_of_the_long_telling` | Staff of the Long Telling | staff | **Long Telling** — riders last **5** spells and 20 s | `d16_the_spire` end boss (was r05), Challenge mode; Depth 15+ end chests |
| `leg_headdress_of_three_skies` | Headdress of Three Skies | head | **Three Skies** — the Great Storm's lockout is 60 s, and its thunder strikes twice a second | `b_fire_king_kaedros` Kaedros, the Fire King (`d15_fire_court` end boss, Challenge mode) |
| `leg_riverstone_torc` | The Riverstone Torc | neck | **River Never Ends** — while the Crane rides, Rainsong jumps to **3** more allies at 50% (as if the Hare rode too) | world boss `b_hungering_brood` The Hungering Brood (`whisperwood`, [page 13](../13-WORLD-BOSSES.md)) |
| `leg_ox_hide_mantle` | The Ox-Hide Mantle | shoulders | **The Ox Stands Over You** — Yoke of the Ox can rest on two allies at once, and the thunder stamp when one breaks is doubled | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss, page 12) |
| `uq_rattle_of_storm_teeth` | Rattle of Storm Teeth | sceptre | **Loud Teeth** — the Thunder Ox's entrance stamp is 8 m and Staggers for 1 s | `b_warmaster_drogath` Round Three: Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |
| `uq_tide_mothers_bracers` | Tide-Mother's Bracers | hands | **Wide Rain** — Crane's Rain's circle is 11 m | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss; a level-60 copy in Challenge mode) |
| `uq_windborne_moccasins` | Windborne Moccasins | feet | **Light Foot** — the Wind Hare tale's cooldown is 6 s | `b_the_sand_sovereign` The Sand Sovereign (`d06_sandsworn_vault` end boss) |

### 9.2 Souls

Souls sit in a **Soul socket** (page 08 §Sockets); page 09 catalogues them.

| id | Name | Socket in | Requirement | Behaviour | Source |
|---|---|---|---|---|---|
| `soul_crane_who_stayed` | Soul of the Crane Who Stayed | neck or ring | Shaman | **A chance to apply**: each Rainsong has a **15%** chance to tell the **Rain Crane** tale for free (her entrance, rider and cycle step; no cooldown used) | `b_sallow_king` The Sallow King (world boss, page 13), 2%; `b_the_tidewife` (page 12), Challenge mode, 4% |
| `soul_ox_thunder_stride` | Soul of the Ox's Thunder Stride | weapon (staff or sceptre) | Shaman | **A spell changes**: while the Ox rides, Sky-Crack (and Hailsong) become a **line of three hoof-strikes** walking 12 m forward from the target, each at 100% of the spell | `b_standing_ruin` The Standing Ruin (world boss, page 13), 2%; Depth 15+ end chests, 0.5% |

---

## 10. Voice and barks

**Voice**: reuse `shared/voices.js` `shaman` (pitch 0.45, depth 0.6, tone 0.45, breath 0.3, rough 0.25, speed
0.42, jitter 0.1) — low, rough-edged, unhurried: a storyteller's voice. Tale lines are the **first words of the
tale**, spoken to the sky, not to the group; the Narrator voice (reuse: Emberveil 2's `narrate`) never speaks them.

| When | Lines (Lingo picks one, no repeat inside ~20 fights) |
|---|---|
| Thunder Ox tale | "Once, the Ox walked the sky…" · "Hear the hooves." · "Old Ox — come down." |
| Rain Crane tale | "Once, the Crane carried the rain…" · "Grey wings, grey water." · "Crane — bring it." |
| Wind Hare tale | "Once, the Hare outran the wind…" · "Run, little herald." · "Hare — carry us." |
| Great Storm | "And when all three came together — the sky broke open." · "Now the whole tale!" |
| Stampede | "The herd remembers!" · "Run, all of you!" |
| Yoke of the Ox | "The Ox stands over you." · "Hold still — let him carry it." |
| Critical hit | "The sky heard that." · "Old thunder." |
| Low health | "The tale's not finished —" · "Rain, I need rain!" |
| An ally revived by the storm | "Up. The story isn't over." |

---

## 11. Reuse notes

- **Looks**: Farhold `classes.json` shaman look (tunic); class-outfits.json `shaman` has only the `bone_headdress`
  hat — the rest of its outfit row is missing (QUESTIONS.md G4). Round 2 changes the look from hide and bone to
  **oilskin, feathers and a hide drum**; the old held `staff_totem` is not used (no totems).
- **Storm-beasts**: built from Chibi 2 creature bodies in `avatar-3d/js/creatures.js` — **ox** from the quad plan
  (the `boar`/`bear` proportions with horns), **crane** from the bird plan (`owl` retuned long-legged), **hare**
  from the quad plan (`rat`/`cat` scaled with long ears) — with a new **cloud material** (grey-white, soft edges,
  small lightning forks inside). They are spell effects: spawned by the effect system, no AI, no collision.
- **Effects** (visuals only; every spell above is new): Sky-Crack borrows the `chain_bolt` lightning line; Rainsong
  borrows `renew`'s heal glow; Crane's Rain borrows the ground `heal` ring; Yoke borrows the `barrier` status;
  Hare's Wind borrows the `haste` aura; the Great Storm reuses Farhold's **GPU rain** (`js/rain.js`) and **one
  shared wind** (`js/wind.js`) locally over the 25 m circle, and a darkening of the sky colour there only (the world
  stays daylight, 00 §4).
- **Sound**: tales start with a hide-drum stroke (new sfx ids `sfx_shaman_drum_ox`, `_crane`, `_hare`); thunder and
  rain from the sfx catalogue (reuse: `sfx/data/catalog.json` lightning and ambience ids).
- **The earlier shaman** in the Emberveil 2 prototype (`spirit_bolt`, `healing_totem`, `chain_lightning_spirit`,
  `ancestral_shield`) is **not** reused beyond the idea of a chain heal (Rainsong's Hare rider).
- Farhold's shaman kit (`chain_bolt`, `call_spirit`, `renew`, `thunderclap`, `stoneskin`, `rally`) and its
  `spirit_bear` class pet are **dropped** (00 §6: no class summons a pet out of thin air).

---

## 12. Round 2 changes

*(reference — a Claude-facing change log. Old names, including banned ones, are listed here only so they can be found and removed elsewhere; none of them is used in play.)*

**Removed entirely (W31, 00 §6):** the totem board and every totem; the Spirit Bear companion (a summoned pet);
Circle of Four; Kinward's raid reach. Old ids and what replaced them:

| Old id | Old name | Replacement |
|---|---|---|
| `shaman_totemic_recall` | Totemic Recall (class key `Q`) | `Q` now calls **The Great Storm** (`shaman_great_storm`) |
| `shaman_totem_stoneward`, `shaman_totem_tremor` | Earth totems (`Shift+1`) | `Shift+1` tells **The Thunder Ox** (`shaman_tale_thunder_ox`) |
| `shaman_totem_springwell`, `shaman_totem_tidemark` | Water totems (`Shift+2`) | `Shift+2` tells **The Rain Crane** (`shaman_tale_rain_crane`) |
| `shaman_totem_emberbrand`, `shaman_totem_hearthflame` | Fire totems (`Shift+3`) | `Shift+3` tells **The Wind Hare** (`shaman_tale_wind_hare`) |
| `shaman_totem_gale`, `shaman_totem_stormward` | Air totems (`Shift+4`) | — (`Shift+4` unused) |
| `shaman_ancestor_bolt` | Ancestor Bolt | `shaman_skycrack` **Sky-Crack** |
| `shaman_riverspirit` | Riverspirit | `shaman_rainsong` **Rainsong** |
| `shaman_stonecall` | Stonecall | `shaman_cranes_rain` **Crane's Rain** |
| `shaman_totemic_surge` | Totemic Surge | `shaman_hares_wind` **Hare's Wind** |
| `shaman_kinward` | Kinward | `shaman_yoke_of_the_ox` **Yoke of the Ox** |
| `shaman_ancestral_host` | Ancestral Host | `shaman_stampede` **Stampede of the Storm** |
| `set_shaman_spiritcaller` | Spiritcaller's Hides | `set_shaman_storyteller` **The Storyteller's Oilskins** |
| `set_shaman_old_bones` | Regalia of the Old Bones (r01/r02) | `set_shaman_great_storm` **Regalia of the Great Storm** (d10/d11 Normal, Challenge d13–d16, Depth 10+, a Leatherworking recipe) |
| `leg_bonechant_staff` | Bonechant, the Singing Staff (r02) | `leg_staff_of_the_long_telling` (d16 Challenge, Depth 15+) |
| `leg_headdress_of_four_winds` | Headdress of the Four Winds (r04, Ember King) | `leg_headdress_of_three_skies` (`b_fire_king_kaedros`, d15) |
| `leg_pelt_of_the_great_bear` | Pelt of the Great Bear | `leg_ox_hide_mantle` (same source) |
| `uq_rattle_of_ember_teeth` | Rattle of Ember Teeth ("ember" name) | `uq_rattle_of_storm_teeth` **Rattle of Storm Teeth** |

**New**: the rider rule, the cycle and the Great Storm; the Damage hybrid's Hailsong and Hailstorm; a magic dispel
(the Crane's entrance) and an in-combat revive (the Great Storm from 40); souls `soul_crane_who_stayed` and
`soul_ox_thunder_stride`. **Kept**: `leg_riverstone_torc`, `uq_tide_mothers_bracers`, `uq_windborne_moccasins` (new
powers), the voice, the calling-quest ids and `npc_elder_bonechant` (now a teller of tales).

**Round 2 sweep**: the Rain Heron became the **Rain Crane** (so it is never confused with the druid's Heron
form): `shaman_tale_rain_heron` → `shaman_tale_rain_crane`, `shaman_herons_rain` → `shaman_cranes_rain`
(Crane's Rain), `soul_heron_who_stayed` → `soul_crane_who_stayed`, and every talent or line that said heron.
