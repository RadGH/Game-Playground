# Shaman (`shaman`)

> Class file for [page 06](../06-CLASSES.md). Canon: [page 00](../00-OVERVIEW.md) §6 row 22.
> Status: v0.1 draft, 2026-09-29. Nothing is built.

**How to read the numbers on this page** (formulas belong to [page 05](../05-COMBAT.md)):

- **SP** = spell power (page 05). For a staff or sceptre user, 100% SP is about one hit of the equipped weapon at the same item level.
- **Mana** costs are a **percentage of maximum mana**. Mana regenerates slowly (canon §6); page 05 owns the rate.
- **GCD** (global cooldown, the short lock after any spell): **1.0 s**, lowered by haste to 0.75 s.
- Area damage falls off toward the rim as in Farhold (reuse: `js/actors.js` `strikeArea`).
- "Group" = 5-player party. "Raid group" = your 5 on the raid frame (page 15).

---

## 1. Identity

| | |
|---|---|
| Fantasy | A spirit-speaker in hide and bone who plants carved totems in the ground and lets the old spirits fight and heal through them. |
| Role | **Healer** · can also **Damage** (canon §6). Which one is decided by the totems you plant and the talents you take; no switch. |
| Armour | Medium |
| Weapons | **Staff** (two-handed) or **sceptre** + an off-hand focus (reuse: `js/weapons.js` `quarterstaff`, `scepter`; `js/foci.js`). Farhold's look carries a `staff_totem` — the art exists. |
| Primary attribute | INT |
| Resource | **Mana** + the **totem board** (four slots). |
| Companion | **Spirit Bear** from level 1 (reuse: `js/pets.js` `CLASS_PETS.shaman` → `spirit_bear`, verb "calls up"; `data/enemies.json` row `spirit_bear`). It takes **no** party slot — a class companion, not a follower (00 §10). |

**Playstyle in three sentences.** The shaman fights from a small camp of totems: one each of earth, water,
fire and air, planted where the fight will be, each doing its job for a minute. Its spells are stronger when
the matching totem is standing — a bolt forks when fire is up, a heal jumps further when water is up — so
the shaman is always thinking about where the fight is going next. When the fight moves, it pulls its whole
camp along with **Totemic Recall**, and at 40 it can call the spirits themselves out of the totems.

---

## 2. Class mechanic — the four totems

### 2.1 Totem rules

| Rule | Value |
|---|---|
| Slots | **Earth** and **Water** from `q_calling_shaman_1` (level 6); **Fire** and **Air** from `q_calling_shaman_2` (level 20) |
| One per slot | Placing a totem replaces the one in that slot |
| Choices | Two totems per slot (§4); you choose which one each key places |
| Placing | **`Shift+1`–`4`** (page 02 §5.16): Earth, Water, Fire, Air. It lands at your aim point up to **20 m** away, or at your feet if you press the key **twice within 0.4 s** |
| Cost / cooldown | **4% mana** each, **15 s** cooldown per slot after placing, on the GCD |
| Duration | **60 s** |
| Health | **15%** of the shaman's max health; they take **50%** damage from boss area attacks and die at once inside a **Void zone** |
| Enemy interest | Non-boss enemies attack a totem only if nothing else is within their reach (page 10 AI) |
| Stacking | Two shamans' totems **of the same id** do not stack (the stronger counts). Different ids stack. |

**Gauge UI** (`hud_class_gauge`, new — add to page 03): a small diamond of four totem icons around a spirit
glyph — Air at the top, Fire right, Earth bottom, Water left. Each has a draining ring for its 60 s and a thin
health bar under it; a slot not unlocked is a grey stub. When all four stand within 12 m of you, the glyph in
the middle lights up (Circle of Four, §2.3). Totems also show as small icons on the minimap.

### 2.2 Totemic Recall — the class key

**`shaman_totemic_recall` — Totemic Recall** (class key **`Q`**, page 02 §5.16).
- **Cost** none · **Cooldown** 20 s · **Cast** instant.
- Every totem you have planted **flies to your feet** and is replanted there, keeping its remaining time.
- **Looks like**: each totem pulls out of the ground and streaks to you as a spirit-blue wisp (spellfx
  `projectile`, element `nature`, recoloured `#80c8e0`), landing in a small diamond around you.
- **Sound**: a wooden rattle, a rush of wind.

### 2.3 The three calling quests

| Level | Quest id (page 14 owns the text) | Given by | What you do | What it grants |
|---|---|---|---|---|
| 6 | `q_calling_shaman_1` "Roots and Rivers" | `npc_elder_bonechant`, a stilt hut in Mossfen (Reedhollow) | Carve an earth totem from a fen-oak and a water totem from a drowned stone; plant them at two shrines and hold each for a minute | **Earth** and **Water** slots, **Totemic Recall** |
| 20 | `q_calling_shaman_2` "The Four Winds" | Elder Bonechant, the Sunscar mesas | Climb a mesa in a sandstorm, light a fire totem on top and catch the wind with an air totem | **Fire** and **Air** slots |
| 40 | `q_calling_shaman_3` "The Old Ones Answer" | Elder Bonechant's spirit, Frostmantle ice cave | Stand in a circle of all four totems while ancestor spirits test you one by one | **Circle of Four** (below) |

**Circle of Four** (calling 3 rule): while **all four** of your totems are within **12 m** of you, your spells deal
and heal **+12%**, and each totem pulses 25% faster. It stops the moment any totem is out of reach or dies.

---

## 3. The six spells

### 3.1 At a glance

| Slot | Level | id | Name | Cost | Cooldown | Cast | Range | Shape | Main effect (+ with its totem) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `shaman_ancestor_bolt` | Ancestor Bolt | 2% mana | — | 1.5 s | 38 m | bolt | 140% SP lightning (Fire: forks) |
| 2 | 4 | `shaman_riverspirit` | Riverspirit | 5% mana | — | 1.5 s | 40 m | chain heal, 3 allies | 220 / 160 / 120% SP (Water: 4th jump) |
| 3 | 10 | `shaman_stonecall` | Stonecall | 6% mana | 14 s | 1.0 s | 30 m | ground circle 5 m | 180% SP nature, Rooted 2 s (Earth: second ring) |
| 4 | 18 | `shaman_totemic_surge` | Totemic Surge | 5% mana | 45 s | instant | self | all your totems | totem effects ×2, pulse 50% faster, 8 s |
| 5 | 28 | `shaman_kinward` | Kinward | 12% mana | 90 s | instant | 25 m | group / 10 allies | barrier 300% SP, 8 s (Earth: +25%) |
| 6 | 40 | `shaman_ancestral_host` | Ancestral Host | 15% mana | 180 s | 1.5 s | self | four spirits | 15 s of spirits at your totems |

### 3.2 The spells in full

**`shaman_ancestor_bolt` — Ancestor Bolt** · slot 1 · level 1
- **Cost** 2% mana · **Cooldown** none · **Cast** 1.5 s · **Range** 38 m · **Shape** bolt, 1.5 m splash.
- **Effect** 140% SP as lightning. **With a Fire totem standing**: the bolt forks to a second enemy within 8 m
  for 50%.
- **Looks like**: a pale spirit-blue bolt with a ghostly animal skull at its head (spellfx `lightning`, recoloured
  `#80c8e0`, `skull` sprite at the tip).
- **Sound**: a low throat-singing hum on the cast, a crack on hit.

**`shaman_riverspirit` — Riverspirit** · slot 2 · level 4
- **Cost** 5% mana · **Cooldown** none · **Cast** 1.5 s · **Range** 40 m to the first ally · **Shape** jumps up to 12 m between allies, to **3** allies (never the same one twice).
- **Effect** heals **220% SP**, then **160%**, then **120%**. Each jump goes to the most injured ally in reach.
  **With a Water totem standing**: a 4th jump for 90%.
- **Looks like**: a translucent river-fish of blue light leaping from ally to ally (spellfx `heal`, colour
  `#9ad8ff`; a new small `fx_spirit_fish` sprite along an arced path).
- **Sound**: a splash per jump, rising in pitch.

**`shaman_stonecall` — Stonecall** · slot 3 · level 10
- **Cost** 6% mana · **Cooldown** 14 s · **Cast** 1.0 s · **Range** 30 m · **Shape** ground circle, 5 m radius.
- **Effect** stone spikes burst up for **180% SP** as nature. Non-boss enemies are **Rooted** (reuse: spellfx
  status `root`) for 2 s; bosses are Slowed 20% for 2 s. **With an Earth totem within 12 m of the spot**: a
  second ring of spikes 1 s later (8 m radius, 90% SP) knocks non-boss enemies up for 0.8 s.
- **Looks like**: a ring of grey-brown stone fangs (spellfx `impact`, nature, ground crack decal, new stone
  spike mesh from the `highdef-3d/js/kit/rocks.js` kit scaled down).
- **Sound**: a ground rumble, then a stone crunch.

**`shaman_totemic_surge` — Totemic Surge** · slot 4 · level 18
- **Cost** 5% mana · **Cooldown** 45 s · **Cast** instant · **Range** self · **Shape** every totem you have planted, wherever it is.
- **Effect** for **8 s** every one of your totems has its effect **doubled** and pulses **50% faster**. The
  Spirit Bear roars: +20% damage for 8 s.
- **Stacking**: does not stack with **Ancestral Host** (Host's own boost replaces it).
- **Looks like**: each totem's carved face lights up and a column of its element's colour shoots up from it
  (spellfx `pillar`, one per totem, element matching the slot: earth = `nature`, water = `ice`, fire = `fire`,
  air = `lightning`).
- **Sound**: four drum beats, one per totem, then a chant.

**`shaman_kinward` — Kinward** · slot 5 · level 28
- **Cost** 12% mana · **Cooldown** 90 s · **Cast** instant · **Range** 25 m · **Shape** every ally in range.
- **Effect** a barrier equal to **300% SP** on each ally for **8 s**. **With an Earth totem standing**: +25%
  (375% SP).
- **Group**: all 5 in range. **Raid**: up to **10** allies — your raid group first, then the 5 most injured.
- **Stacking**: a second Kinward refreshes, never adds. It stacks with other classes' barriers (page 05 barrier rules).
- **Looks like**: a ring of faint ancestor faces circles each ally for a moment, then settles as a translucent
  bark-brown shell (spellfx status `barrier`, recoloured `#a07850`).
- **Sound**: a chorus of low voices, one breath long.

**`shaman_ancestral_host` — Ancestral Host** · slot 6 · level 40
- **Cost** 15% mana · **Cooldown** 180 s · **Cast** 1.5 s · **Range** self · **Shape** summons, for **15 s**, one spirit at each of your planted totems.
- **Effect** each spirit exists only if its totem is standing:

| Spirit | At | Does, every 1.5 s for 15 s |
|---|---|---|
| **Stone Bear** (your Spirit Bear, grown) | Earth totem | Taunts non-boss enemies within 8 m of it (page 05 taunt) and takes 30% less damage |
| **Tide Heron** | Water totem | Heals the most injured ally within 25 m for 90% SP |
| **Ember Wolf** | Fire totem | Leaps at an enemy within 25 m for 70% SP fire + Burning |
| **Gale Hawk** | Air totem | Gives the ally nearest to it +10% haste for 3 s (haste cap applies) |

  Your totems' effects are **doubled** while the Host is out (replaces Surge; they do not stack).
- **Followers**: the Heron, Wolf and Hawk do **not** take follower slots (they are spell effects, like
  Farhold's "summon" kind but uncapped for their 15 s). **Resolved (00 §10)**: summons take no party slot.
- **Looks like**: each spirit is a translucent blue-white animal with a slow flame of its element's colour
  (Chibi 2 creature bodies from `avatar-3d/js/creatures.js` — bear, heron from the `owl` bird plan, wolf, hawk
  — with a spirit material).
- **Sound**: four animal calls in turn, then a sustained chant under the music for 15 s.

### 3.3 Rotation — how it plays

**Solo (Damage lean).** Fire totem (Emberbrand) and Earth (Tremor) on the pack; Stonecall to root them in
reach of the totems; Ancestor Bolt (forking) as the filler; the Spirit Bear holds attention. Water (Springwell)
keeps you topped up. **Totemic Recall** when you move to the next pack instead of paying to replant.

**Dungeon (Healer).** Before the pull: Water (Springwell) and Earth (Stoneward) where the tank will stand, Air
(Gale) with the damage dealers. **Riverspirit** is your main heal; it is best when the group is stacked within
12 m. **Totemic Surge** doubles Springwell and Stoneward for a big-damage moment. **Kinward** before a known
group-wide hit.

**Raid (Healer).** Your value is the totems (§3.4) and Kinward. Put totems where the raid **will** stand after
the next movement, not where it stands now. On movement-heavy fights, spend Recall freely (20 s).

### 3.4 What the shaman gives a group and a raid

| Gives | 5-player group | 20-player raid | Stacks with |
|---|---|---|---|
| Stoneward (earth) | 8% less damage taken, allies within 12 m | same, 12 m (plant it on the raid's stack spot) | other damage-reduction auras; not a second Stoneward |
| Tidemark (water) | +8% healing received, +0.5% mana/s | same, 20 m | not a second Tidemark |
| Hearthflame (fire) | +5% damage | same, 20 m | a group buff under page 05's group-buff cap |
| Gale (air) | +10% move, +5% haste | same, 20 m | haste cap |
| Stormward (air) | pulls one single-target spell every 10 s off an ally | same | — |
| Kinward | 300–375% SP barrier on all 5, every 90 s | up to 10 allies | other barriers |
| Healing | Riverspirit chains; Springwell | same | — |

A raid with two shamans should agree slots: one runs Stoneward + Hearthflame, the other Tremor + Tidemark.

### 3.5 Boss mechanics

| Mechanic | What the shaman does |
|---|---|
| **Void zone** | A totem in a void zone dies at once. Recall before the zone reaches it. |
| **Soak** | Plant Stoneward inside the soak circle: −8% damage for everyone soaking. Totems, the Spirit Bear and the Host's spirits **never count** toward a soak's pips (00 §10, QUESTIONS.md C3). |
| **Targeted** | **Stormward** grounds **single-target** spells only; a **Targeted** circle mechanic (page 11 flag `mechanic`) is never grounded. |
| **Movement phases** | Totemic Recall every 20 s; the totems keep their time. |
| **Adds** | Ancestral Host's Stone Bear taunts non-boss adds for 15 s. Stonecall roots them. |
| **Sleep / confuse** | Tremor Totem (earth, §4) wakes allies from **non-mechanic** sleep and confusion every 2 s. |
| **Interrupts** | The shaman has **no interrupt**. |
| **Immunities** | Bosses cannot be Rooted (Stonecall slows them 20% instead) and are not taunted by the Stone Bear. |

---

## 4. Alternate spells — the totems

Press `Shift+1`–`4` to plant the slot's current choice (twice within 0.4 s = at your feet). **Change a slot's choice** with
the **`G`** totem choice ring (on the GCD, free), or on the Spellbook's Totem tab (`scr_spellbook`, page 03).

| Slot | id | Totem | Effect (while standing, 60 s) |
|---|---|---|---|
| Earth (1) | `shaman_totem_stoneward` | **Stoneward Totem** | Allies within 12 m take **8% less damage** |
| Earth (1) | `shaman_totem_tremor` | **Tremor Totem** | Every 2 s: 30% SP nature to enemies within 8 m and Slowed 30% for 1 s; wakes allies within 20 m from non-mechanic Asleep/Confused |
| Water (2) | `shaman_totem_springwell` | **Springwell Totem** | Every 2 s: heals the 2 most injured allies within 20 m for **35% SP** |
| Water (2) | `shaman_totem_tidemark` | **Tidemark Totem** | Allies within 20 m regain **0.5% max mana a second** (Focus/Fury users: 1 a second) and receive **+8% healing** |
| Fire (3) | `shaman_totem_emberbrand` | **Emberbrand Totem** | Every 1.5 s: a fire bolt at an enemy within 25 m for **50% SP** fire + Burning (page 05) |
| Fire (3) | `shaman_totem_hearthflame` | **Hearthflame Totem** | Allies within 20 m deal **+5% damage** |
| Air (4) | `shaman_totem_gale` | **Gale Totem** | Allies within 20 m: **+10% move speed**, **+5% haste** |
| Air (4) | `shaman_totem_stormward` | **Stormward Totem** | Every 10 s: the next harmful **single-target** spell cast at an ally within 20 m is pulled into the totem (never a boss mechanic) |

Totems look like carved wooden posts with a painted face, one design per element (new props — the
`highdef-3d` kit's wood materials; page 17). Each carries its element's small looping particle on top.

---

## 5. Talents

Tiers at **12, 22, 32, 45**. A spell unlocked later than a tier gets it when the spell unlocks. One pick per
tier; retraining at the Unbinder (reuse: Farhold `js/retrain.js`).

**Ancestor Bolt** (`shaman_ancestor_bolt`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Spirit Chain** — jumps to 3 enemies within 8 m (100 / 70 / 50%) whether or not a Fire totem stands | **Ancestor's Weight** — 2.5 s cast, 260% SP, Slowed 30% for 3 s | — |
| 2 (22) | **Totem Relay** — the bolt passes through one of your totems on the way, gaining +25% | **Healing Current** — 30% of its damage heals the most injured ally within 20 m | — |
| 3 (32) | **Storm Omen** — each hit reduces Stonecall's cooldown by 2 s | **Echo of the Old** — 20% chance a second bolt follows for free | **Shocking Word** — Shocked (page 05) for 5 s |
| 4 (45) | **Ancestor's Voice** — while Circle of Four is on, it has no cast time | **Stormbound** — each cast in a row within 3 s adds +10% (up to +40%) | — |

**Riverspirit** (`shaman_riverspirit`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Downstream** — jumps to the nearest ally instead of the most injured, but 5 jumps | **Deep Water** — only 1 target, 480% SP | — |
| 2 (22) | **Riverbed** — each ally healed gets a 4 s heal over time for 30% of the heal | **Flooding** — healing past full health jumps on as an extra jump | **Cleansing Stream** — removes one poison or disease from each ally healed |
| 3 (32) | **Totem Spring** — if it jumps within 12 m of your Water totem, the totem pulses at once | **Swift River** — 1.0 s cast | — |
| 4 (45) | **Rapids** — every 3rd Riverspirit is instant and cannot be interrupted | **Returning Tide** — the final jump comes back to the first ally for 100% | — |

**Stonecall** (`shaman_stonecall`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (12) | **Stone Line** — a 16 m by 3 m line from you instead of a circle | **Stone Circle** — the spikes form a 7 m ring wall for 4 s: non-boss enemies cannot cross it | — |
| 2 (22) | **Standing Stones** — the spikes stay for 6 s; enemies touching them take 25% SP a second | **Earth's Grip** — the root lasts 4 s but breaks on damage (non-boss) | — |
| 3 (32) | **Stoneskin Rite** — allies within 5 m of the spot gain Stoneskin (reuse: Farhold `stoneskin` status) for 6 s | **Shatter** — Rooted enemies that are hit shatter the root for 60% SP | — |
| 4 (45) | **Mountain's Call** — casting it also plants an Earth totem there for free (keeps your chosen Earth totem) | **Quake** — 3 waves, 1 s apart, 120% SP each | — |

**Totemic Surge** (`shaman_totemic_surge`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (18) | **Rooted Surge** — lasts 12 s but only surges totems within 20 m of you | **Wild Surge** — 4 s, effects ×3 | — |
| 2 (22) | **Bear's Share** — the Spirit Bear heals 20% of its max health and taunts non-boss enemies within 8 m | **Renewal** — also refreshes every totem's duration to 60 s | — |
| 3 (32) | **Spirit Burst** — when the surge ends, each totem bursts for 100% SP of its element around it | **Surge of Life** — every totem heals allies within 8 m for 50% SP when it starts | **Grounded Surge** — Stormward grounds a spell every 2 s during it |
| 4 (45) | **Unbroken Circle** — totems cannot be destroyed during it | **Channelled Surge** — you may re-cast within 8 s to end it early and refund 20 s of cooldown per second left | — |

**Kinward** (`shaman_kinward`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (28) | **Kin Circle** — becomes a 10 m ground circle for 10 s: allies inside get the barrier refreshed every 2 s at 40% | **Ancestor's Wrath** — when a barrier breaks, it strikes the attacker for 80% SP | — |
| 2 (28) | **Long Memory** — 16 s instead of 8 | **Rooted Kin** — allies with the barrier cannot be knocked back | — |
| 3 (32) | **Blood of the Tribe** — also heals 5% max health when it lands | **Spirit Armour** — the barrier also reduces magic damage taken by 10% while it holds | — |
| 4 (45) | **Last Ward** — an ally whose barrier is broken by a killing blow survives at 1 health (once per ally per cast; never against `unavoidable` mechanics) | **Everkin** — reaches 15 allies in a raid | — |

**Ancestral Host** (`shaman_ancestral_host`)
| Tier | a | b | c |
|---|---|---|---|
| 1 (40) | **Stay a While** — 25 s instead of 15 | **Hurried Spirits** — 8 s but the spirits act every 0.75 s | — |
| 2 (40) | **Great Heron** — the Heron heals 2 allies each time | **Great Wolf** — the Wolf's leap hits all enemies within 3 m | **Great Hawk** — the Hawk's haste goes to 3 allies |
| 3 (40) | **Spirits Walk** — the spirits follow you instead of standing at the totems (totems still needed to call them) | **Host Unbound** — spirits appear even for slots with no totem | — |
| 4 (45) | **Ancestors' Blessing** — when the Host leaves, every ally within 25 m gets Kinward at 50% | **Return of the Old** — the cooldown drops by 5 s for every enemy the Wolf kills | — |

---

## 6. Class sets

| Set id | Name | Pieces (6) | Where from |
|---|---|---|---|
| `set_shaman_spiritcaller` | **Spiritcaller's Hides** | `it_spiritcaller_headdress`, `it_spiritcaller_pauldrons`, `it_spiritcaller_vest`, `it_spiritcaller_gauntlets`, `it_spiritcaller_legwraps`, `it_spiritcaller_moccasins` | Levels 19–28: bosses of `d05_glass_tombs`, `d06_sandsworn_vault`, `d07_thornheart`. Heroic/Mythic+ copies at 60. |
| `set_shaman_old_bones` | **Regalia of the Old Bones** | `it_old_bones_skullcap`, `it_old_bones_mantle`, `it_old_bones_hauberk`, `it_old_bones_grips`, `it_old_bones_greaves`, `it_old_bones_treads` | Level 30: `r01_barrowking`; level 42: `r02_glacier_throne`; the hauberk only from each raid's final boss (`b_barrowking_hrodric` The Barrowking, Hrodric Ninefold, `r01_barrowking` boss 5; `b_queen_ysmere` Queen Ysmere of the Glacier Throne, `r02_glacier_throne` boss 6) |

**Spiritcaller's Hides**
- **2 pieces** — Riverspirit jumps once more (4, or 5 with a Water totem).
- **4 pieces** — Totemic Recall also resets every slot's placing cooldown.
- **6 pieces** — Totemic Surge lasts 12 s and its cooldown is 30 s.

**Regalia of the Old Bones**
- **2 pieces** — your totems have double health.
- **4 pieces** — Stonecall plants a free **Tremor Totem** for 10 s at the spot (does not replace your Earth totem).
- **6 pieces** — Ancestral Host calls a **fifth spirit**, a Bone Elk, which gives every ally within 20 m a 10%
  max health barrier every 3 s.

---

## 7. Class legendaries and uniques

| id | Name | Slot | Power (named) | Drop source |
|---|---|---|---|---|
| `leg_bonechant_staff` | Bonechant, the Singing Staff | staff | **Circuit of the Old** — Ancestor Bolt passes through every one of your totems on its way (+20% for each) before it strikes | `b_whiteout` The Whiteout (`r02_glacier_throne` boss 3, page 13) |
| `leg_headdress_of_four_winds` | Headdress of the Four Winds | head | **Two Winds** — you may plant **both** totems of one slot (you choose the slot in the Spellbook) | `b_ember_king_kaedros` Kaedros, the Ember King (`r04_ember_court` boss 8, page 13) |
| `leg_riverstone_torc` | The Riverstone Torc | neck | **River Never Ends** — Riverspirit jumps 6 times; healing past full on the last jump becomes a barrier | world boss `b_hungering_brood` The Hungering Brood (`whisperwood`, page 13) |
| `leg_pelt_of_the_great_bear` | Pelt of the Great Bear | chest | **Great Bear** — the Spirit Bear has double health and taunts non-boss enemies attacking you; when it dies it leaves a Stoneward Totem for 20 s | `b_rimefang` Rimefang (`d10_rimefang_caverns` end boss, page 12) |
| `uq_rattle_of_ember_teeth` | Rattle of Ember Teeth | sceptre | **Hot Teeth** — Emberbrand's bolts apply 2 Burning stacks | `b_warmaster_drogath` Round Three: Warmaster Drogath Ashmane (`d09_warmasters_pit` end boss) |
| `uq_tide_mothers_bracers` | Tide-Mother's Bracers | hands | **Wide Spring** — Springwell heals 3 allies each pulse | `b_the_grindwheel` The Grindwheel (`d02_drowned_mill` end boss) (rolls to your level up to 60 on Heroic) |
| `uq_windborne_moccasins` | Windborne Moccasins | feet | **Light Camp** — Totemic Recall's cooldown is 10 s | `b_the_sand_sovereign` The Sand Sovereign (`d06_sandsworn_vault` end boss) |

---

## 8. Voice and barks

**Voice**: reuse `shared/voices.js` `shaman` (pitch 0.45, depth 0.6, tone 0.45, breath 0.3, rough 0.25, speed
0.42, jitter 0.1) — low, rough-edged, unhurried. Totem lines are spoken to the spirits, not to the group.

| When | Lines |
|---|---|
| Planting a totem | "Stand here, old one." · "Watch this ground." · "Burn." (fire) · "Carry us." (air) |
| Totemic Recall | "Come. We move." · "Up, all of you." |
| Totemic Surge | "Wake!" · "All of you — now!" |
| Kinward | "Our dead keep us." · "The kin stand with you." |
| Ancestral Host | "Grandmothers. Grandfathers. Come." |
| Critical hit | "The spirits are angry." · "They heard." |
| Low health | "The spirits are thin here —" · "I need the water!" |
| Totem destroyed | "They broke it." · "Another one gone." |

---

## 9. Reuse notes

- **Looks**: Farhold `classes.json` shaman look (tunic, `staff_totem` held); class-outfits.json `shaman` has only
  the `bone_headdress` hat — the rest of its outfit row is missing (canon change request for the art page — see QUESTIONS.md G4).
- **Companion**: `spirit_bear` (reuse: `js/pets.js` `CLASS_PETS.shaman`, enemies.json row), scaled by the follower
  rules (reuse: `js/followers.js` `scaleFollower`, share cap 0.75).
- **Effects** (visuals only): Ancestor Bolt borrows the `chain_bolt` lightning; Riverspirit borrows `renew`'s heal
  glow; Stonecall's spikes borrow the rock kit; Surge borrows `judgement`'s `pillar`.
- **Emberveil's shaman** (`spirit_bolt`, `healing_totem`, `chain_lightning_spirit`, `ancestral_shield`) → Ancestor
  Bolt, Springwell Totem, Ancestor Bolt tier 1a, Kinward. Ids and names changed.
- Farhold's shaman kit (`chain_bolt`, `call_spirit`, `renew`, `thunderclap`, `stoneskin`, `rally`) is **dropped**.
- **Tech note**: totems are server-owned bodies with health; 4 per shaman, 16 in a 20-player raid with four
  shamans — well inside the actor budget, but they must be low-draw props (one merged mesh each).
