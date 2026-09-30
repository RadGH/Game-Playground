# WILDMARCH — Design Bible, page 12: Dungeons

> *"The door shuts behind you. That is the only rule the dungeon promises to keep."*

**Status:** v0.1 draft — 2026-09-29. Nothing is built. This page owns **dungeon content**: the fourteen
5-player dungeons `d01`–`d14` named on [page 00](00-OVERVIEW.md) §8, their trash, sub-bosses, main bosses,
end bosses, secret bosses and loot, plus the rules every dungeon shares (entry, lockouts, difficulties,
Mythic+ keys and affixes, wipes, checkpoints, followers, tokens, the dungeon journal).

It does **not** own: the telegraph vocabulary and minimum warning times ([page 11](11-BOSS-MECHANICS.md)),
the damage formulas and status list ([page 05](05-COMBAT.md)), item rules and item level
([page 08](08-ITEMS.md)), the set/legendary catalogue ([page 09](09-SETS-LEGENDARIES.md) indexes everything
marked **[D-EXCL]** here), monster families and AI ([page 10](10-BESTIARY.md)), the group finder
([page 15](15-SOCIAL-ONLINE.md)), or the screens ([page 03](03-UI-SCREENS.md)). Where this page needs one of
those, it links and states what it assumes.

---

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Dungeon rules (shared by all fourteen)](#2-dungeon-rules-shared-by-all-fourteen)
3. [The dungeon template](#3-the-dungeon-template)
4. [Mechanic ladder: what each dungeon teaches](#4-mechanic-ladder-what-each-dungeon-teaches)
5. d01 [The Hollow Barrow](#d01--the-hollow-barrow)
6. d02 [The Drowned Mill](#d02--the-drowned-mill)
7. d03 [Deepdelve Mines](#d03--deepdelve-mines)
8. d04 [Bellows Keep](#d04--bellows-keep)
9. d05 [The Glass Tombs](#d05--the-glass-tombs)
10. d06 [Vault of the Sandsworn](#d06--vault-of-the-sandsworn)
11. d07 [Thornheart Hollow](#d07--thornheart-hollow)
12. d08 [Ruins of the Moonwell](#d08--ruins-of-the-moonwell)
13. d09 [The Warmaster's Pit](#d09--the-warmasters-pit)
14. d10 [Rimefang Caverns](#d10--rimefang-caverns)
15. d11 [Saltdeep Cathedral](#d11--saltdeep-cathedral)
16. d12 [The Unmade Workshop](#d12--the-unmade-workshop)
17. d13 [Cindergate Bastion](#d13--cindergate-bastion)
18. d14 [The Ashen Reliquary](#d14--the-ashen-reliquary)
19. [Indexes: monsters, bosses, items, secrets](#19-indexes)
20. [Notes for other pages](#20-notes-for-other-pages)

---

## 1. How to read this page

### 1.1 Units (so a number means the same thing at level 7 and level 60)

Dungeons run at fourteen different levels plus level 60 (Heroic, Mythic+). Writing absolute health and
damage for every one of them would be fifteen tables that drift apart. So this page uses **two units**
that page 05 and page 10 turn into real numbers:

| Unit | Means | Example |
|---|---|---|
| **H** | the health of one **normal-rank** trash monster of the dungeon's level, on Normal (page 10's formula; in Farhold this is the bestiary `hp` compounded by `balance.json` `enemies.perLevel`, 1.13 a level) | a sub-boss of 30 H has thirty trash monsters' worth of health |
| **%HP** | a share of the **maximum health of a Damage-role player** of the dungeon's level, wearing gear of that level, **before** armour and resistances | "35 %HP" hits a mage for about a third of his bar; a tank with 1.6× health and armour loses far less |

A hit of **100 %HP or more** is a **one-shot**. Every one-shot on this page has at least **3.0 s** of
warning (page 11 minimum). A tank's melee numbers are written for the tank: "tank melee 9 %HP" is still in
the Damage-player unit, and a tank's own health and mitigation make it about 3–4% of the tank's bar.

**Forces (F)** is the Mythic+ trash counter. A monster is worth **F = its H** (a 1 H monster is 1 F, a 3 H
elite is 3 F). Each dungeon needs **85%** of the forces in its listed packs, rounded up.

### 1.2 Bodies

Every monster names its body so the builder knows what to draw (reuse: `avatar-3d/js/creature-types.js`,
`avatar-3d/js/chibi2.js`):

- `creature <type> ×<size>` — an avatar-3d creature of that type (`wolf`, `rat`, `spider`, `bat`, `snake`,
  `worm`, `golem`, `titan`, `imp`, `elemental`, `wisp`, `shard`, `wraith`, `horror`, `slime`, `mushroom`,
  `mimic`, `beetle`, `centipede`, `crocodile`, `turtle`, `griffin`, `phoenix`, `frog`, `owl`, `moth`,
  `hyena`, `saber_cat`, `drake`, `dragon`, `boar`, `bear`, `hound`, `cat`, `deer`, `elk`, `horse`, `turret`…),
  scaled by the size factor. New creature types this page needs are listed in §20.
- `chibi2 <race>` — a Chibi 2 humanoid (reuse: `avatar-3d/js/chibi2.js`, races from
  `avatar-3d/js/chibi2-races.js`: human, elf, dwarf, halfling, goblin, orc, giant, undead, beastkin), with
  its outfit/weapon noted where it matters. `×<size>` scales the whole body.

### 1.3 Ability rows

Every boss ability is one table row:

| Column | Holds |
|---|---|
| Ability | name (player-facing, original) |
| Shape / colour | page 11 vocabulary: **danger zone** (red), **void zone** (purple-black), **soak** (orange, N pips), **safe zone** (blue), **targeted** (yellow), **beneficial** (green), **tether** (white); shapes circle / donut / cone / line / cross / wave / checkerboard / room-wide; sizes in metres |
| Warn | seconds from the telegraph appearing to the hit. Normal minimum 1.5 s, Heroic/Mythic+ minimum 1.2 s, one-shots 3.0 s everywhere |
| Damage | %HP, plus statuses (page 05 owns the status list) |
| Counterplay | what the group does about it |

Cast bars: **(i)** = gold border, interruptible; **(u)** = grey, cannot be interrupted.

### 1.4 Marks

- **(reuse: path)** — the thing already exists in the playground; **(new)** — it does not.
- **[D-EXCL]** — a unique or legendary that drops **only** in this dungeon. Page 09 indexes every one.
- **[SECRET]** — drops only from the dungeon's secret boss.

---

## 2. Dungeon rules (shared by all fourteen)

### 2.1 What a dungeon is, in Farhold and in Wildmarch

**In Farhold (reuse: `prototypes/farhold/js/dungeon.js`, `js/dungeon-plan.js`, `data/instances.json`):**
a dungeon is a mouth on the surface (a stone arch, `GATE_ARCHES`) and an interior built on the fly: rooms are
rectangles scattered without overlapping, joined nearest-first into a spanning tree of L-shaped corridors
(every room reachable) plus one or two loops, entrance = the room nearest the middle, boss room = the room
furthest from it. Two merged geometries (floor, walls) plus one instanced sconce mesh make a whole dungeon
three draw calls. There is **no ceiling** — tall walls, a black sky and fog at 70 m read as "inside" and
leave the camera room. Eleven looks (`DUNGEON_LOOKS`: barrow, crypt, cinderworks, hollow, vault, rime,
cave, ruin, hoard, flooded, warren). `createDungeon` takes a `shape` override (rooms, roomSize, corridor,
cellSize, wallHeight, sconceEvery, chestChance) and a `holds` block (boss, quest, prisoner, cache, lore);
`gives` pays once when the boss falls (R27 `sites.take`). The enemy field is paused and rolls more champions
inside (`rankBonus 1.7`).

**In Wildmarch (new):** dungeons are **hand-authored**, not seeded. Each of the fourteen has a fixed layout
(the ASCII maps below), fixed packs, fixed bosses and scripted mechanics, because a boss you learn has to
be the same boss next time. What carries over:

- The **builder**: `dungeon-plan.js`'s room/corridor rectangles become the storage format. A hand-made
  dungeon is a JSON list of rooms `{id, x, z, w, h, kind, look}` and halls `{from, to, bend}`, fed to the
  same mesh builder and wall colliders (reuse: `js/dungeon.js` build path, minus the random scatter).
  The reachability test (`insideLayout`, every room joined) is kept as a data test.
- The **looks** table (reuse: `DUNGEON_LOOKS`) — each dungeon names one or two looks; new looks are listed
  in §20.
- **No ceiling**, tall walls, black sky, close fog (reuse).
- **Chest grades** (reuse: `js/chests.js`: wooden, iron-bound, gilded, warded; warded = legendary floor,
  22% mimic). Dungeon chests never roll mimics except where a room says so.
- **Boss phases** from Farhold's `phases: [{at, modifier, say}]` grow into the full ability script of
  page 11 (new).
- `gives` paid once per lockout (reuse of R27's "pay once" rule, applied per character per lockout).

### 2.2 Entry

| Rule | Value |
|---|---|
| The door | every dungeon has a physical **entrance** in the open world: an arch, cave mouth or gate, with a **Gathering Stone** beside it (new). Walking through the entrance with your party loads the dungeon. A party inside a dungeon is in its own copy (an **instance**: a private copy of the place for your group only). |
| Group finder | queue from anywhere for Normal or Heroic (page 15). A matched group is teleported to the entrance's inside; on leaving, each player returns to where they queued from. Mythic+ is **not** in the group finder — the keyholder's party walks in (or uses the stone). |
| Gathering Stone | right-click: summons a party member who is in the same region and out of combat (costs nothing; 2 players must be at the stone). Also shows the dungeon's journal page. |
| Minimum level | Normal: **band floor − 1** (d01 opens at 4). Heroic: **60** and an average item level at or above the dungeon's Heroic requirement (page 08). Mythic+: 60 + a **Delving Key** for that dungeon. |
| Attunement | none for d01–d13. **d14** needs the quest `q_ashen_reliquary_key` (a relic key from Last Light). Each dungeon's first-time **story quest** is optional; the dungeon can be run without it. |
| Party size | 1–5. Normal accepts 1–5 players and fills empty slots with followers (§2.8). Heroic and Mythic+ need **5 players** — no followers. |
| Role check | the group finder builds 1 Tank, 1 Healer, 3 Damage (Support counts as Damage). A premade party may bring any mix. |
| Instance cap | a player may enter **10 instances an hour** (all dungeons together), to stop reset-farming. The 11th entry says when the next one frees up. |
| Leaving | walk out through the entrance, use the **Leave Dungeon** button on the party frame, or be removed by a vote kick (page 15). A player who leaves mid-run may re-enter the same instance for 10 minutes if the party has not filled the slot. |
| Instance reset | an empty instance resets 30 minutes after the last player leaves. The party leader can reset manually when nobody is inside (Normal/Heroic). |

### 2.3 Difficulties

| | Normal | Heroic | Mythic+ |
|---|---|---|---|
| Level | the dungeon's band (d01 5–7 … d14 58–60) — monsters are **scaled to the party's level inside the band** (a level-5 party meets level-5 d01; a level-9 party still meets level 7) | 60 | 60 |
| Group | 1–5 players + followers | 5 players | 5 players |
| Health | as written (H units) | ×1.5 on level-60 H | Heroic × key scaling (§2.4) |
| Damage | as written (%HP) | ×1.35 | Heroic × key scaling |
| Mechanics | the ones marked Normal | + every row marked **(H)** | + (H) rows + **(M)** rows + weekly affixes |
| Warning times | as written, never under 1.5 s | may drop to 1.2 s (never one-shots) | same as Heroic |
| Timer | none (a run clock is shown for records) | none | yes (§2.4) |
| Enrage timers | soft (the boss grows +10% damage every 30 s after the timer) | hard (the boss wipes the group 20 s after the timer) | hard |
| Secret boss | available | available, stronger | available only if the condition is met **inside the timer**; it does not stop the clock |
| Loot | band item level | Heroic item level (page 08) | by key level (§2.7) |
| Lockout | daily, per boss (§2.6) | daily, per boss | none; end-of-run chest only |

### 2.4 Mythic+ (keys, timer, affixes)

**The key.** A **Delving Key** (`it_delving_key`, new) names one dungeon and a **key level** (2 and up). A
character holds at most one. The first key of the week comes from the first Heroic dungeon completed that
week (level 2, random dungeon). The party leader places the key in the **Keystone Font** inside the
entrance; the doors seal, a 10-second countdown starts, and the timer begins when it reaches zero.

**Scaling.** Key level `k` (k ≥ 2): health and damage = Heroic × `1.10 × 1.08^(k − 2)`.

| Key | ×Heroic | Key | ×Heroic | Key | ×Heroic |
|---|---|---|---|---|---|
| 2 | 1.10 | 8 | 1.75 | 14 | 2.77 |
| 3 | 1.19 | 9 | 1.89 | 15 | 2.99 |
| 4 | 1.28 | 10 | 2.04 | 16 | 3.23 |
| 5 | 1.39 | 11 | 2.20 | 18 | 3.77 |
| 6 | 1.50 | 12 | 2.38 | 20 | 4.39 |
| 7 | 1.62 | 13 | 2.57 | 25 | 6.45 |

**Timer.** Each dungeon has a **par time** (its "run time target" below, Mythic+ row). The run is **timed**
when the end boss dies with forces at 100% before par. Deaths cost **5 s** each on the clock.

| Finish | Key afterwards |
|---|---|
| over par (not timed) | key level −1 (never below 2), new random dungeon |
| timed | +1 |
| timed with ≥ 20% of par left | +2 |
| timed with ≥ 40% of par left | +3 |
| party abandons (all leave, or leader uses **Abandon Key**) | −1 |

**Forces.** Trash kills fill a bar (F values, §1.1). The end boss's chest only opens when forces are at 100%.
Forces beyond 100% do nothing. The secret boss gives 0 F.

**Affixes.** Keys gain affixes as they rise. The set rotates **weekly** (the week's set is announced on the
Keystone Font and the group finder). Numbers are for all monsters unless it says bosses.

| Key | Slot | Rotation (one per week) |
|---|---|---|
| 2+ | **Crown** | alternates weekly: **Heavy Crowns** — bosses +30% health, +15% damage · **Thick Ranks** — non-boss enemies +20% health, +30% damage |
| 4+ | **Tide** (one of five) | see below |
| 7+ | **Omen** (one of six) | see below |
| 10+ | **Both Crowns** | Heavy Crowns and Thick Ranks both apply |
| 14+ | **Season** | the season's affix (v1 season: **Veil-Touched**) |

**Tide affixes (key 4+):**

| id | Name | Effect |
|---|---|---|
| `aff_rallying_cry` | Rallying Cry | when a non-boss enemy dies, enemies within 25 m gain +15% damage and +15% current health, stacking; lasts until they die. Counterplay: pull packs apart, kill them together |
| `aff_last_stand` | Last Stand | non-boss enemies at 30% health gain +50% damage and cannot be stunned, slowed or knocked back. Counterplay: burst them through 30%, crowd control early |
| `aff_seeping` | Seeping Wounds | a non-boss enemy that dies leaves a 4 m **void zone** for 12 s: players inside take 3 %HP every 0.5 s, enemies inside heal 5% a second. Counterplay: tank moves packs off the pools before they die |
| `aff_spite` | Spite | each non-boss death puts one **Spite** stack on every player within 30 m: 1 %HP a second for 4 s, stacks refresh. Counterplay: stagger kills, healer cooldowns on big pulls |
| `aff_thornback` | Thornback | 20% of non-boss enemies (marked by a thorn aura) reflect 30% of damage taken as a 6 m circle hit around themselves every 3 s. Counterplay: stop hitting when the aura flashes (1.5 s warn) |

**Omen affixes (key 7+):**

| id | Name | Effect |
|---|---|---|
| `aff_ground_vents` | Ground Vents | every 20 s in combat, a 3 m red **danger zone** appears under each player; after 2 s it erupts for 30 %HP and a knock-up |
| `aff_rot_wounds` | Rot Wounds | enemy melee hits add a stack: −3% healing received per stack for 8 s, max 30 stacks. Counterplay: tank kiting, defensive cooldowns, one tank swap on bosses |
| `aff_whirling` | Whirling | three 4 m moving **void zones** (grey-purple whirlwinds) wander each room at 3 m/s; touching one knocks you 8 m and does 15 %HP |
| `aff_volatile_seeds` | Volatile Seeds | every 25 s in combat, 2 seed pods (0.3 H each) sprout within 15 m. Unkilled after 8 s, each bursts for 25 %HP room-wide |
| `aff_tremors` | Tremors | every 22 s, a 4 m **targeted** circle on every player; after 2 s it hits for 20 %HP and interrupts any cast of players it touches. Counterplay: spread and time casts |
| `aff_deep_cuts` | Deep Cuts | any hit that takes a player below 90% health applies a bleed of 2 %HP a second until they are healed to full. Counterplay: top people up |

**Season affix (key 14+), v1 "Veil-Touched" (`aff_veil_touched`):** four **Veil Echoes** wait in each dungeon
(one per wing; their spots are part of each dungeon's data, not listed here). An echo is a 6 H elite
copy of one of the dungeon's own bosses with that boss's first ability only. Killing it gives **+4% damage
and healing to the party for the rest of the run** (stacking, max 4). Leaving it alive makes the end boss
open with that ability added every 40 s.

### 2.5 Wipes, respawn and checkpoints

| Rule | Value |
|---|---|
| Death | a dead player's body stays where it fell as a **ghost marker** for 60 s; allies can revive it (page 05 rules). After 60 s — or at once with **Release** — the player respawns at the last **Ember Shrine** reached. |
| Ember Shrine (checkpoint) | a lit brazier-shrine (reuse: `brazierBody` in `js/chests.js`) that lights when the party first walks past it. Every dungeon has one at the entrance and one after each main boss (not after sub-bosses). A shrine also refills health and resource out of combat. |
| During a boss fight | the arena **seals** (a portcullis or thorn wall in the dungeon's look). Released players wait at the shrine; they cannot rejoin until the fight ends. Combat revives: **1 charge per party per boss fight** on Normal/Heroic, plus 1 more every 10 minutes on Mythic+ (charges are shared by every class's revive spell — page 05). |
| Wipe | every player dead (or out of the arena) = a **wipe**. The boss resets to full health, its adds despawn, the doors open after 5 s. Trash already killed **stays dead**; patrols (marked *patrol*) respawn on a wipe only on Normal. |
| Run-back | released players run from the shrine. No monster between the shrine and the next boss door respawns. |
| Boss reset (no wipe) | if the whole party leaves the arena, the boss resets and heals. A boss **cannot be pulled out** of its arena ("leash": it walks back and resets at the door). |
| Mythic+ deaths | each death costs 5 s off the timer (§2.4). |
| Normal "Rekindle" | on Normal only, a party of 1–2 real players gets one free **Rekindle** per boss: at a wipe, the fight pauses 3 s and everyone stands back up at 50% health, boss unchanged. It is a kindness for solo players with followers, not a mechanic. |

### 2.6 Lockouts

**Lockout** = how often a boss will give *you* loot. It is per character, per difficulty.

| Difficulty | Rule |
|---|---|
| Normal | each boss drops loot for you **once per day** (reset 04:00 server time). After that it drops only **Delver's Marks** (§2.9). You can run it as often as you like. |
| Heroic | same, once per day per boss. |
| Mythic+ | no per-boss loot. The end chest pays every run (§2.7); the **Weekly Vault** (page 15/08) pays one extra item based on your best key that week. |
| Secret boss | Normal and Heroic: once per **week** per character (reset Wednesday 07:00, canon 00 §4). Mythic+: always, if the condition is met in time. |
| Quest `gives` | story quest rewards pay once per character, ever. |

A player locked to a boss can still help: the boss drops loot for the players who are not locked.

### 2.7 Loot

**Personal loot.** Each player rolls separately; nobody can take anyone else's drop. What drops is filtered to
the player's **loot specialisation** (a dropdown on the dungeon journal: any of their class's roles, or
"any"). Drops you already own an equal-or-better copy of are rerolled once.

| Source | Normal | Heroic | Mythic+ |
|---|---|---|---|
| Trash | 3% per kill: a band-level Common–Rare | 3%: level-60 Uncommon–Rare | none (forces instead) |
| Sub-boss | 30% chance: one item from its table | 35% | — |
| Main boss | 50% chance: one item | 55% | — |
| End boss | 100%: one item; 25% a second | 100% + 25% | the **end chest**: 2 items per player from any of the dungeon's tables, item level by key |
| Secret boss | 100%: one item from its table, **10% chance of its [SECRET] legendary** | 100%, **15%** legendary | +1 item in the end chest from the secret table, **20%** legendary |
| Chests in the dungeon | per `js/chests.js` grade | same | opened chests add nothing (no time to spend) |

**Legendary and unique rates** inside a boss's table follow page 08. As a rule for this page: a boss's
listed **[D-EXCL] unique** is 1 in 6 of its drops, a **[D-EXCL] legendary** from a main or end boss is
1 in 40 on Normal, 1 in 25 on Heroic, 1 in 15 from a Mythic+ chest at key 10+.

**Class set pieces** (page 06/09 class sets) drop from **Heroic and Mythic+ end bosses** only, as a
**set token** matched to the looter's class (`it_token_<slot>`, new; page 09 owns it). Generic sets named
`set_<snake>` below drop from any boss in their dungeon on every difficulty.

**Mythic+ item level** (page 08 owns the numbers): the end chest's item level climbs with the key to key 10,
then stops; key 10+ only raises the Weekly Vault reward and the legendary chance.

### 2.8 Follower fill (solo and small groups, Normal only)

**In Farhold (reuse: `js/followers.js`, `js/pets.js`):** followers have 3/4/5 slots at levels 1/20/30, ten
mercenary types from a broker, and class companions; `scaleFollower` caps a follower at 75% of the top of the
player's own swing.

**In Wildmarch:** on Normal, every empty party slot is filled at the door by a **dungeon follower** (new):

| Rule | Value |
|---|---|
| Who | the player's own hired followers first (page 07/15), then free **Delver** stand-ins for the missing roles: `npc_delver_shieldbearer` (Tank), `npc_delver_mender` (Healer), `npc_delver_blade` / `npc_delver_bow` (Damage). Class companions (ranger's cat, necromancer's thralls) are *not* party members and do not fill a slot. |
| Power | a stand-in has 85% of a player's health and damage for its level; it uses a fixed 4-spell kit. |
| Mechanics | followers **read telegraphs**: they leave danger zones and void zones, stand in soaks and safe zones, spread from targeted circles and break tethers, with a **0.6 s reaction delay** and **92% reliability** per mechanic (8% of the time they are late by 1 s — enough to take a hit, never enough to one-shot them because their reaction starts at the telegraph). A follower tank taunts on swap mechanics. |
| Interrupts | a follower interrupts the first interruptible cast it can reach, 1 per 12 s. |
| Dialog | followers never pick a dialog reply; the player does. |
| Heroic / Mythic+ | followers are not allowed. |
| Loot | followers never take loot. |
| Secret conditions | every secret boss can be unlocked with followers on Normal, except where a dungeon says "players only". |

### 2.9 Dungeon tokens

**Delver's Marks** (`cur_delve`, new — canon request for the `cur_` prefix **Resolved (00 §10)**; page 08 §17 owns the id, name and caps). The dungeon currency.

| Source | Marks |
|---|---|
| sub-boss kill | 1 |
| main boss kill | 2 |
| end boss kill | 4 (+4 the first run of the day) |
| secret boss kill | 6 |
| locked-out boss (no loot) | +1 extra per kill |
| Heroic | ×2 |
| Mythic+ end chest | 10 + key level |

**Spent at** the **Delve Quartermaster** in each region's hub (`npc_delve_quartermaster_<region>`, page 01) on:

| Buy | Cost |
|---|---|
| any **non-legendary, non-[SECRET]** item from the loot table of a boss you have killed on that difficulty (Normal list / Heroic list) | 40 (Normal) / 80 (Heroic) marks |
| a Heroic generic set piece (`set_<snake>` from a dungeon you finished on Heroic) | 120 |
| rerolling one affix on a dungeon-dropped item (page 08 rules) | 25 |
| **Delving Key** reroll (same level, a random other dungeon) — once a week | 60 |
| a legendary **Ember Residue** shard (page 09 bad-luck protection: 5 shards = choose one [D-EXCL] legendary of a dungeon you finished on Heroic) | 300 |

### 2.10 The dungeon journal (`scr_dungeon_journal`, new — page 03 must list it)

Opened with the **Journal** key → Dungeons tab, from a Gathering Stone, or by clicking a dungeon on the map.

| Tab | What it shows |
|---|---|
| **Overview** | name, region, level band, entrance (map pin + "Track" button), story hook, quest giver, run time target, lockouts left today/this week, your best time and best key |
| **Bosses** | one card per boss in order (sub-bosses indented). Each ability is listed with its icon, shape, colour and warning time. Abilities are **hidden** ("???") until you have **seen** them once in any difficulty; Heroic/Mythic+ rows are separate and hidden until seen on that difficulty. A "Tank / Healer / Damage" filter shows role tips. Boss dialog you have heard is kept in a transcript. |
| **Loot** | every boss's table, filterable by difficulty, class, slot and loot specialisation; [D-EXCL] and [SECRET] items marked; items you own ticked |
| **Map** | the dungeon's map, rooms revealed as you enter them, Ember Shrines, bosses, chests found |
| **Secrets** | one line per dungeon: "???" until the secret boss has been found **by you**. Once found, the unlock condition is written out in full. A hint line ("Something in the barrow is missing its ring") appears after your third clear. |
| **Records** | clears per difficulty, best time, deaths per boss, best Mythic+ key and time, secret kills |
| **Affixes** | this week's Mythic+ affixes with full text |

---

## 3. The dungeon template

Every dungeon section below uses this order. A builder can turn each block into one JSON file
(`data/dungeons/<id>.json`, page 16).

1. **Card** — id, name, region, level band, looks, entrance, quest giver + story quest, run time target
   (Normal / Heroic / Mythic+ par), Ember Shrines, forces needed.
2. **Story hook** — two to four sentences.
3. **Layout** — an ASCII map (wings and rooms, `[B]` boss, `[s]` sub-boss, `(S)` shrine, `?` secret),
   followed by a room list.
4. **Trash** — a monster table (id, name, body, H, abilities with numbers and telegraphs) and a pack list by room.
5. **Sub-bosses** — at least two.
6. **Main bosses** — two to four, then the **end boss**.
7. **Secret boss** — with its unlock condition.
8. **Dialog opportunity** — at least one per dungeon (page 11: a pause where a player picks a reply).
9. **Loot** — per boss; set, [D-EXCL] uniques and legendaries.

Boss block fields:

```json
{
  "id": "b_example",
  "name": "The Example",
  "body": "creature golem ×2.4",
  "rank": "sub | main | end | secret",
  "health": "80 H (Normal), Heroic ×1.5, Mythic+ by key",
  "phases": [{ "at": 1.0, "name": "..." }, { "at": 0.5, "name": "..." }],
  "abilities": [{ "name": "", "shape": "", "colour": "", "warn": 2.0, "damage": "", "counter": "" }],
  "enrage": "6:00 soft (Normal) / hard (Heroic, Mythic+)",
  "dialog": { "pull": "", "abilityLines": {}, "phase": [], "death": "" },
  "heroic": [], "mythic": [],
  "loot": []
}
```

Voice: every boss speaks through Lingo (reuse: `lingo/`) with a formant voice from `shared/voices.js`
(reuse), a speech bubble and a centre-screen banner for the lines marked **(banner)**. A line marked
**⚠** *is* the warning for the ability named beside it and always plays at the moment the telegraph appears.

---

## 4. Mechanic ladder: what each dungeon teaches

The owner asked for early dungeons to be simple and later ones to layer mechanics. This is the budget each
dungeon's bosses are held to on **Normal** (Heroic/Mythic+ add on top).

| Dungeon | Band | New mechanics introduced | Most mechanics active at once on a Normal boss |
|---|---|---|---|
| d01 Hollow Barrow | 5–7 | danger zone, void zone, adds, interrupt (**one per boss**) | 1 (+ melee) |
| d02 Drowned Mill | 9–12 | tether, moving wave, targeted spread | 2 |
| d03 Deepdelve Mines | 13–16 | soak, line of sight, knockback toward edges | 2 |
| d04 Bellows Keep | 16–18 | tank swap (stacking debuff), room-wide with safe zone | 2 |
| d05 Glass Tombs | 19–22 | beams + mirrors, checkerboard, cross | 3 |
| d06 Vault of the Sandsworn | 22–24 | dispel, puzzles under pressure, pushback walls | 3 |
| d07 Thornheart Hollow | 25–28 | spreading DoTs, beneficial zones, root tethers | 3 |
| d08 Moonwell Ruins | 28–30 | donut, light/dark phases, shared-health twins | 3 |
| d09 Warmaster's Pit | 31–34 | add waves, kiting, arena hazards, single combat | 3 |
| d10 Rimefang Caverns | 36–39 | stacking cold + warmth zones, slippery floors, falling hazards | 4 |
| d11 Saltdeep Cathedral | 42–45 | rising water, interrupt rotations, positional bells | 4 |
| d12 Unmade Workshop | 48–51 | portals, gravity flips, mirrored copies | 4 |
| d13 Cindergate Bastion | 54–57 | multi-soaks, overlapping patterns, hard tank swaps | 5 |
| d14 Ashen Reliquary | 58–60 | everything layered; phase-by-phase recaps of earlier dungeons | 5 |

---

## d01 — The Hollow Barrow

### Card

| Field | Value |
|---|---|
| id | `d01_hollow_barrow` |
| Region | Hearthvale (`hearthvale`) |
| Levels | 5–7 (opens at 4) · Heroic 60 · Mythic+ 60 |
| Looks | `barrow` (upper), `crypt` (lower) (reuse: `DUNGEON_LOOKS`) |
| Entrance | **Barrow Hill**, a grass mound in the old orchards 1.2 km north of Brightwater. The doorstone has been rolled aside and a trail of grave dirt runs down to the road. A Gathering Stone stands at the foot of the mound. |
| Quest giver | `npc_warden_hedda_thorne`, Vale Warden sergeant, at the Brightwater watch-house |
| Story quest | `q_the_open_barrow` — "The Open Barrow": close the barrow by putting its lord back to sleep. Reward: 1 Uncommon weapon of your choice, 420 XP (page 14 owns the XP value) |
| Run time target | Normal 15 min · Heroic 18 min · Mythic+ par **24:00** |
| Ember Shrines | Doorstone (entrance) · after Sexton Morrow · after Mother Ossel |
| Forces needed | 85% of packs (≈ 62 F) |
| Tutorial | yes: every boss teaches **one** mechanic, and the journal pops a one-line tip the first time each is seen ("Red ground: leave before it fills.") |

### Story hook

Brightwater's churchyard woke up empty. The graves were not dug out — they were dug *up*, from below, and the
trail leads to Barrow Hill, where the doorstone has stood shut for four hundred years. A halfling grave-robber
named Pell opened it to steal the **Thane's ring**, and the Hollow Thane has woken to take back what is his —
starting with the valley's dead. Sergeant Hedda Thorne wants the barrow shut before the harvest fair.

### Layout

```
                              ? Sleeper's Niche  (secret, under the bier)
                                      |
      [s2] Lantern Loft ======== [B3] THANE'S HALL (end)
             |                         |
             |                    Bier Stair
             |                         |
       Ossuary Walk ============ (S3) Ossuary Gate
             |
        [B2] Bone Pit
             |
            (S2)
             |
   [B1] Sexton's Yard ------ Rat Warren [s1]   (side room, optional)
             |
         Grave Row
             |
      (S1) Doorstone  <-- entrance
```

| Room | Size (m) | Look | Holds |
|---|---|---|---|
| Doorstone | 14×10 | barrow | Ember Shrine S1, Gathering Stone inside, Keystone Font |
| Grave Row | 10×34 (long hall) | barrow | packs 1–3, open graves along both walls |
| Sexton's Yard | 24×24 | barrow | B1 Sexton Morrow |
| Rat Warren | 16×14, low | warren | s1 Warren Queen Skritch; wooden + iron-bound chest |
| Bone Pit | 26×26, sunken 3 m | crypt | B2 Mother Ossel; S2 at its far door |
| Ossuary Walk | 8×40 | crypt | packs 4–6; the **Horn Cup** behind a loose skull (see Secret) |
| Ossuary Gate | 12×12 | crypt | S3 |
| Lantern Loft | 18×14, raised 2 m | crypt | s2 Pell the Lantern Thief |
| Bier Stair | 6×18 | crypt | pack 7 (the Thane's honour guard) |
| Thane's Hall | 30×30 | crypt | B3 the Hollow Thane; the stone bier |
| Sleeper's Niche | 22×22 | crypt, older stone | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_undead_barrow_shambler` | Barrow Shambler | chibi2 undead, grave rags, bare hands | 1 | **Grasp** melee 5 %HP every 2.2 s. Walks 2.4 m/s. |
| `m_undead_barrow_bowman` | Barrow Bowman | chibi2 undead, short bow | 0.8 | **Grave Arrow** 6 %HP at 25 m every 2.5 s. **Aimed Shot**: a thin red **line** 1 m × 25 m to one player, 2.0 s, 14 %HP. Step sideways. |
| `m_beast_cairn_rat` | Cairn Rat | creature rat ×1.6 | 0.3 | **Nip** 2 %HP every 1.2 s. Packs of 5–8. Area spells kill them in a pass. |
| `m_undead_grave_hound` | Grave Hound | creature hound ×1.3, bone-plated | 1 | **Pounce**: crouches 1.0 s (hound flashes white), leaps up to 8 m at a player, 8 %HP + knocked down 1 s. |
| `m_undead_bone_mender` | Bone Mender | chibi2 undead, robe, bone staff | 0.8 | **Knit Bones** (i) 2.5 s cast: heals an ally 30% of its health. The first interruptible cast the game shows you — the tip line appears. |
| `m_humanoid_grave_robber` | Grave Robber | chibi2 human, hood, shovel | 1 | **Throw Dirt**: 6 m cone, 1.5 s, blinds 2 s (misses 50% of attacks). At 30% health runs for the next room to fetch help (stop him: slow, stun, kill). |
| `m_undead_barrow_guard` | Barrow Guard (elite) | chibi2 undead ×1.3, round shield, hand axe | 3 | **Shield Wall**: takes 70% less damage from the front for 4 s every 15 s (shield glows). **Overhead Chop**: 90° cone 5 m, 1.5 s, 15 %HP. Hit it from behind while the shield is up. |
| `m_beast_tomb_moth` | Tomb Moth | creature moth ×1.3, grey | 0.5 | **Dust Shed**: on death leaves a 3 m **void zone** for 8 s, 2 %HP every 0.5 s. A gentle preview of B2's mechanic. |

**Packs by room** (Normal; Heroic/Mythic+ the same bodies at level 60):

| # | Room | Pack |
|---|---|---|
| 1 | Grave Row, first third | 3 Barrow Shamblers + 1 Bone Mender |
| 2 | Grave Row, middle | 6 Cairn Rats + 2 Grave Robbers |
| 3 | Grave Row, far end | 1 Barrow Guard + 2 Barrow Bowmen |
| — | Grave Row *patrol* | 2 Grave Hounds walking the hall, 40 s loop |
| 4 | Ossuary Walk, entry | 4 Tomb Moths + 2 Barrow Shamblers |
| 5 | Ossuary Walk, middle | 2 Bone Menders + 1 Barrow Guard |
| 6 | Ossuary Walk, end | 3 Barrow Bowmen on a ledge (3 m up) + 3 Barrow Shamblers below |
| 7 | Bier Stair | **Honour guard**: 2 Barrow Guards + 1 Grave Hound named **Grip** (1.5 H, wears the **Hound's Collar** — see Secret) |
| — | Rat Warren | 2 packs of 6 Cairn Rats before s1 |

### Sub-bosses

#### s1 · `b_warren_queen_skritch` — Warren Queen Skritch

| Field | Value |
|---|---|
| Body | creature rat ×3.6, patchy grey, a crown of teeth |
| Health | 22 H |
| Where | Rat Warren (optional side room) |
| Teaches | **adds** — kill the small things, area spells matter |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Gnaw | melee on tank | — | 7 %HP every 2 s | — |
| Call the Litter | 4 wall holes glow orange-brown | 2.0 s | 5 Cairn Rats (0.3 H) pour out every 15 s | area damage at the holes; the tank picks up the queen, damage clears rats |

**Dialog:** pull — *squealing, no words*. The journal: "A rat the size of a pony. The litter never stops coming."
**Enrage:** 4:00 soft. **Heroic:** a rat that reaches a player climbs on and adds 2 %HP a second until shaken off (dodge roll). **Mythic+:** holes open 2 at a time from 50%.
**Loot:** `it_warren_gnawed_belt` (light waist), `it_skritchs_tooth` (dagger), `uq_crown_of_teeth` **[D-EXCL]** — helm, light: +6% attack speed; each kill within 10 s grants +2% movement speed, stacking to 10%.

#### s2 · `b_pell_lantern_thief` — Pell, the Lantern Thief

| Field | Value |
|---|---|
| Body | chibi2 halfling, patched cloak, hooded lantern, two daggers |
| Health | 18 H |
| Where | Lantern Loft |
| Teaches | **interacting with the room** (relight sconces) and the first **dialog opportunity** |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Quick Knives | melee | — | 2 × 4 %HP every 1.6 s | — |
| **Snuff** | room-wide darkness (the three sconces gutter out) | 2.0 s ("Lights out!") | Loft goes dark for up to 12 s; Pell is visible only by her lantern; every 2 s she throws **Dirty Knife** at a random player, 9 %HP | any player uses a sconce (hold **E** 1.0 s) to relight it; each lit sconce cuts the dark by 4 s. All three = light returns at once |

**Dialog:** pull — "Finders keepers, dead folk don't count!" · Snuff ⚠ — "Lights out!" · 50% — "You're not wardens. Wardens are slower."
**Dialog opportunity — "Pell's bargain"** (at 20% health she drops to her knees; combat pauses up to 20 s; any player can answer, the first answer counts):

| Reply | Result |
|---|---|
| "Give back the ring and go." | Pell hands over the **Thane's Ring** (quest item `it_thanes_ring`, see Secret) and flees. She drops no loot, but her strongbox in the loft opens (iron-bound grade). |
| "You'll hang in Brightwater." | Fight resumes. She drops normal loot. The ring falls into a crack in the floor and is **lost for this run**. |
| (no reply in 20 s) | as "hang". |

**Enrage:** 4:00 soft. **Heroic:** Snuff lasts up to 18 s and sconces need 2.0 s to relight. **Mythic+:** she drops a caltrop **void zone** (2 m, 10 s, 2 %HP every 0.5 s) where she stands each time she throws a knife.
**Loot:** `it_pells_patched_cloak` (back), `it_loft_knife` (dagger), `uq_pells_hooded_lantern` **[D-EXCL]** — light slot: +20% light radius; while you stand in darkness (outside every light source) your critical hit chance is +5%.

### Main bosses

#### B1 · `b_sexton_morrow` — Sexton Abel Morrow

| Field | Value |
|---|---|
| Body | chibi2 undead ×1.5, leather apron, iron spade |
| Health | 55 H |
| Phases | 100–50% · 50–0% (Grave Dig hits two players at once) |
| Teaches | **danger zone** (red, grows in from the edge — leave before it fills) |
| Enrage | 5:00 (soft Normal, hard Heroic/Mythic+) |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Spade Swing | melee on tank | — | 9 %HP every 2.4 s | — |
| **Grave Dig** | **danger zone**, 5 m circle under a random player (from 50%: two players), fills edge-in | 3.0 s | 45 %HP + knocked down 1.5 s; leaves an open grave (hole, 3 m) for 20 s that you must walk round | walk out of the red |

**Dialog:** pull — "Another one for the ground. Hold still." · Grave Dig ⚠ — "Dig here." / "This one's yours." · 50% (banner) — "Two plots. Same price." · death — "The ground... is... full."
**Heroic (H):** holes left by Grave Dig are **void zones** (2 %HP every 0.5 s) for 20 s. **Burial**: every 30 s he grabs the tank (1.5 s warn, wind-up with the spade raised) and buries them to the waist — rooted 4 s, a second player must click the tank (hold E 1 s) to dig them out.
**Mythic+ (M):** Grave Dig fills in 2.2 s, never below 1.2 s; three targets below 25%.
**Loot:** `it_sextons_spade` (two-handed mace), `it_grave_mud_boots` (medium feet), `set_barrowwarden` piece (chest), `uq_morrows_ledger` **[D-EXCL]** — off-hand focus: each enemy you kill adds a **Plot** (max 5); your next area spell deals +6% damage per Plot and spends them.

#### B2 · `b_mother_ossel` — Mother Ossel

| Field | Value |
|---|---|
| Body | chibi2 undead ×1.6, hunched, robe sewn from finger bones, bone needle |
| Health | 65 H |
| Phases | single phase; the arena fills as the fight goes on |
| Teaches | **void zone** (purple-black, persists, damages every 0.5 s) — **move the boss, not yourself into it** |
| Enrage | 5:30 |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Needle Jab | melee on tank | — | 8 %HP every 2.2 s | — |
| **Marrow Rot** | lobs a bone at a random player's spot; lands as a 4 m **void zone** for 40 s | 1.8 s (small yellow landing ring) | 4 %HP every 0.5 s while inside | step off. The tank drags Ossel slowly round the pit's edge so the rot lands in a line, not on top of the group |

Every 10 s one Marrow Rot. After ~4:00 the pit is mostly rot — that is the soft enrage showing itself.
**Dialog:** pull — "Such good bones. I'll keep them for you." · Marrow Rot ⚠ — "A little something for the floor." · 30% — "Stitch, stitch, stitch..." · death — "Unpick me gently..."
**Heroic (H):** **Bone Stitch** (i) 2.5 s cast every 25 s: a **tether** from Ossel to the furthest player; if it completes, that player is pulled 10 m toward her. Interrupt it.
**Mythic+ (M):** rot pools grow 0.5 m every 10 s.
**Loot:** `it_bonestitch_gloves` (cloth hands), `it_ossel_needle` (wand), `set_barrowwarden` piece (hands), `uq_ossels_thimble` **[D-EXCL]** — ring: +4% maximum health; when an ally within 20 m falls below 30% health, your next heal on them is +25% (10 s cooldown).

#### END · `b_hollow_thane` — The Hollow Thane (Ulvar Grimbarrow)

| Field | Value |
|---|---|
| Body | chibi2 undead ×2.0, iron crown, rusted scale coat, greataxe |
| Health | 105 H |
| Phases | 100–35% · 35–0% ("The Thane stands up straight": +15% attack speed) |
| Teaches | **interrupt** (gold-bordered cast bar) and **frontal cleave** (tank faces the boss away) |
| Enrage | 6:00 |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Axe | melee on tank | — | 11 %HP every 2.6 s | — |
| **Barrow Call** (i) | 3.0 s cast, gold border | 3.0 s | if it finishes, 3 Barrow Shamblers claw out of the floor around the group | **interrupt it** (any interrupt, stun or knockback). Every 20 s. |
| Thane's Cleave | 100° **danger zone** cone, 7 m, in front | 1.8 s | 30 %HP | nobody but the tank stands in front |

**Dialog:** pull (banner) — "Who opens my door? Who counts my rings?" · Barrow Call ⚠ — "Rise, my hearth-men!" · Cleave ⚠ — "Kneel!" · 35% (banner) — "I was a king before your valley had a name!" · death — "Close the door... behind you..."
**Heroic (H):** **Thane's Due** — at 70% and 35% he takes a **soak** stance: an orange circle with **3 pips** 5 m wide on the floor for 4 s; fewer than 3 players inside and it hits everyone for 50 %HP. Barrow Call cast drops to 2.0 s.
**Mythic+ (M):** risen shamblers explode on death (2 m, 1.5 s, 12 %HP).
**After the kill:** the stone bier in the hall centre becomes usable (see Secret).
**Loot:** `it_grimbarrow_greataxe` (two-handed axe), `it_hearthmens_scale` (heavy chest), `it_barrow_signet` (ring), `set_barrowwarden` pieces (helm, legs), `uq_thanes_ring_of_rest` **[D-EXCL]** — ring: +5% all damage; killing an enemy heals you 2% of your maximum health. `leg_hollow_crown` **[D-EXCL]** — helm legendary: every 25 s your next damaging spell raises a **Hearth-man** (a barrow shambler ally with 30% of your health, 10 s) at the target.

### Secret boss — `b_first_sleeper` — The First Sleeper

**Unlock (collect + dialog):** place **three grave goods** on the Hollow Thane's bier after he dies:

1. **The Thane's Ring** (`it_thanes_ring`) — only from Pell's bargain ("Give back the ring and go"). Kill her and it is lost.
2. **The Hound's Collar** (`it_hounds_collar`) — dropped by **Grip**, the named Grave Hound in the Bier Stair honour guard (100%).
3. **The Horn Cup** (`it_horn_cup`) — behind a loose skull in the **Ossuary Walk** wall, halfway down, left side. The skull only glints when a light source (torch, lantern, light spell) is within 6 m.

Hold **E** at the bier with all three in the party's bags. The bier sinks; a stair opens to the **Sleeper's Niche**.
Journal hint (after 3 clears): *"The Thane went into the ground with a ring, a cup and a hound. He came out with none of them."*

| Field | Value |
|---|---|
| Body | chibi2 giant (undead skin) ×1.6, peat-brown shroud, antler crown, stone maul |
| Health | 140 H |
| Phases | 100–60% · 60–25% · 25–0% |
| Teaches | the **exam**: all four d01 lessons at once, plus a gentle first **soak** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Maul | all | melee on tank | — | 12 %HP every 2.8 s | — |
| Peat Dig | all | **danger zone** 5 m under 1 player (2 from P2) | 3.0 s | 45 %HP | leave |
| Old Rot | P2+ | 4 m **void zone**, 30 s | 1.8 s | 4 %HP / 0.5 s | move |
| Wake the Barrow (i) | all | 3.0 s cast | 3.0 s | 4 shamblers if not interrupted | interrupt; every 18 s |
| **Sleeper's Breath** | P3 | orange **soak**, 6 m, **2 pips**, placed on the far side of the room | 4.0 s | 40 %HP to everyone if fewer than 2 players inside; split between soakers otherwise (15 %HP each for 2) | two players run in |

**Dialog:** pull (banner) — "You woke the little king. Now you have woken me." · Breath ⚠ — "Breathe with me, or not at all." · 25% — "The valley grew on my back. I only want it back." · death — "Sleep... is kinder... than you."
**Heroic (H):** Peat Dig leaves holes as void zones; Breath needs 3 pips. **Mythic+ (M):** Wake the Barrow raises 2 Grave Hounds instead of shamblers.
**Loot:** `it_antler_crown` (medium helm), `it_sleepers_maul` (two-handed mace), `uq_peat_black_shroud` **[D-EXCL]** — back: +8% maximum health; standing still for 2 s gives a barrier of 5% maximum health (refreshes every 6 s). **`leg_first_sleepers_shroud` [SECRET] [D-EXCL]** — chest legendary (any armour type, takes the wearer's): when you would die, you instead fall asleep for 3 s at 1 health, immune to damage, then wake with 25% health (once every 3 minutes).

### Set dropped here

`set_barrowwarden` — Barrowwarden's Rest (4 pieces: chest, hands, helm, legs; medium armour; drops from B1, B2, END). Bonus text is page 09's; brief: 2 = +10% damage against undead, 4 = a killing blow on undead heals 4% of max health.

---

## d02 — The Drowned Mill

### Card

| Field | Value |
|---|---|
| id | `d02_drowned_mill` |
| Region | Mossfen (`mossfen`) |
| Levels | 9–12 (opens at 8) · Heroic 60 · Mythic+ 60 |
| Looks | `flooded` (mill and millrace), `ruin` (drowned stilt village) (reuse) |
| Entrance | **Grist's Mill**, half sunk where the Brackwater Cut meets the open fen, 2 km east of Reedhollow. The great wheel still turns though no water drives it. Walk down the wet stair beside the wheel. |
| Quest giver | `npc_marra_stillwater`, Fenfolk ferrywoman, Reedhollow landing |
| Story quest | `q_the_millers_debt` — "The Miller's Debt": find out why the fen is rising and stop the wheel |
| Run time target | Normal 18 min · Heroic 20 min · Mythic+ par **27:00** |
| Ember Shrines | Wet Stair (entrance) · after Old Croak · after Wren Grist |
| Forces needed | ≈ 70 F |
| New lessons | **tether**, **moving wave**, **targeted spread** |

### Story hook

Tobiah Grist dammed the fen to turn his wheel faster and sell flour to Highcourt. The dam broke in a spring
storm and drowned the stilt village of Low Wicket — and his own wife, Wren. The mill sank with them. Now the
wheel turns by night, the water in Reedhollow rises an inch a week, and the Fenfolk say something in the
millpond is *collecting*. Marra Stillwater wants the wheel stopped before Reedhollow is the next Low Wicket.

### Layout

```
                                   ? Millpond Deep (secret, under the sluice)
                                         |
                               [sluice gates 1 2 3]
                                         |
      [s2] Lock House ============ [B3] THE WHEELHOUSE (end)
            |                            |
            |                     Gear Loft
       Flooded Lane                      |
            |                     (S3) Grain Store
    [B2] Low Wicket Chapel ==============|
            |
           (S2)
            |
     [B1] Croak's Pond ------- Leech Cistern [s1]  (side, optional)
            |
        Millrace Tunnel (water to the knee)
            |
      (S1) Wet Stair  <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Wet Stair | 12×10 | S1, Keystone Font |
| Millrace Tunnel | 6×48, knee water (−10% move speed) | packs 1–3; eel channels on both sides |
| Croak's Pond | 28×28, lily pads over deep water (edges) | B1 Old Croak |
| Leech Cistern | 16×16, waist water | s1 Bloatleech Matron; iron-bound chest |
| Low Wicket Chapel | 26×20, a drowned chapel on stilts | B2 Wren Grist; S2 at the door |
| Flooded Lane | 10×40 of stilt houses (walkways, gaps you can fall through into water: −25% speed, 4 s to climb out) | packs 4–6 |
| Lock House | 18×14 | s2 Old Pike |
| Grain Store | 14×14 | S3, pack 7 |
| Gear Loft | 8×22, raised walkway | pack 8 |
| The Wheelhouse | 30×30, the wheel's axle across the north wall | END the Grindwheel; the three sluice levers along the east wall |
| Millpond Deep | 32×32, open water ring round a silt island | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_undead_drowned_millhand` | Drowned Millhand | chibi2 undead, waterlogged smock, sack hook | 1 | **Sack Hook**: white **tether** line to a player 10 m away, 1.5 s, pulls 5 m and 5 %HP. Melee 5 %HP. |
| `m_beast_fen_leech` | Fen Leech | creature worm ×0.5, pale green | 0.4 | **Latch**: jumps on a player (2 m), drains 2 %HP a second and heals itself; knocked off by a dodge roll or any hit on it. |
| `m_beast_bog_croaker` | Bog Croaker | creature frog ×1.7 | 1 | **Tongue Lash**: red line 1.5 m × 8 m, 1.5 s, 7 %HP + pulled 3 m. **Burst Belly**: on death, a 3 m **void zone** of bile for 6 s, 2 %HP / 0.5 s. |
| `m_aberration_bog_slime` | Bog Slime | creature slime ×1.3, peat brown | 1.5 | **Engulf** melee 6 %HP + slow 20% 3 s. At 50% **splits** into 2 Slimelings (0.4 H each). |
| `m_humanoid_fen_poacher` | Fen Poacher | chibi2 human, reed hat, crossbow | 1 | **Net Shot**: yellow **targeted** 3 m circle on a player, 2.0 s, roots everyone inside 2 s. Spread. |
| `m_elemental_marsh_lure` | Marsh Lure | creature wisp ×1.0, sickly green-white | 0.6 | **Will-o'-Lure** (i) 2.0 s: charms one player to walk toward the lure for 2.5 s (off ledges into water). Interrupt. |
| `m_beast_reed_serpent` | Reed Serpent | creature snake ×1.5 | 1 | **Coil Strike** 8 %HP + poison 1 %HP a second for 6 s. |
| `m_beast_fen_eel` | Fen Eel | creature snake ×1.0, eel-blue, stays in channels | 0.5 | **Spark Bite** at anyone within 3 m of a channel, 6 %HP, jumps to 1 more player within 5 m. Kill from range or keep off the edge. |
| `m_construct_millstone_roller` | Millstone Roller (elite) | creature golem ×1.5 hugging a millstone | 3 | **Roll**: red **line** 3 m × 20 m, 2.0 s, 25 %HP + knocked aside 5 m. **Grind** melee 10 %HP. |

| # | Room | Pack |
|---|---|---|
| 1 | Millrace Tunnel, mouth | 3 Drowned Millhands + 4 Fen Leeches |
| 2 | Millrace, bend | 2 Bog Croakers + 1 Marsh Lure (on a ledge above deep water) |
| 3 | Millrace, sluice | 1 Millstone Roller + 2 Drowned Millhands; 2 Fen Eels in the channels |
| 4 | Flooded Lane, first house | 3 Fen Poachers + 1 Reed Serpent |
| 5 | Flooded Lane, walkway | 2 Bog Slimes + 1 Marsh Lure |
| 6 | Flooded Lane, far house | 1 Millstone Roller + 2 Fen Poachers + 2 Reed Serpents |
| 7 | Grain Store | 4 Drowned Millhands + 6 Fen Leeches (in the sacks: they burst out when a player comes within 6 m) |
| 8 | Gear Loft | 2 Bog Croakers + 2 Fen Poachers on the walkway |
| — | *patrol* Millrace | 1 Millstone Roller rolling end to end every 50 s — its Roll line shows 2 s early down the whole tunnel |

### Sub-bosses

#### s1 · `b_bloatleech_matron` — The Bloatleech Matron

Body: creature worm ×2.8, swollen pale green, lamprey mouth. Health 24 H. Leech Cistern (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Sucker Bite | melee on tank | — | 8 %HP every 2.2 s | — |
| Brood Latch | 3 Fen Leeches leap onto 3 random players | 1.5 s (leeches rear up) | 2 %HP a second each | dodge roll or hit the leech off |
| **Swell** (i) | 2.5 s cast | 2.5 s | heals the Matron 8% for every leech still attached | knock the leeches off, then interrupt |

**Dialog:** — (gurgling). **Heroic:** Brood Latch is 5 leeches. **Mythic+:** leeches not removed in 6 s burrow in and become a 4 %HP-a-second poison (dispellable, page 05).
**Loot:** `it_leechhide_bracers` (light wrists), `it_matron_fang` (dagger), `uq_bloodgorged_band` **[D-EXCL]** — ring: 2% of your damage heals you; doubled while you are below 40% health.

#### s2 · `b_old_pike_sluicewarden` — Old Pike, the Sluicewarden

Body: chibi2 undead human ×1.3, lockkeeper's coat, 3 m iron-shod pole. Health 26 H. Lock House. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Pole Sweep | 180° **danger zone** cone, 5 m, in front | 1.8 s | 20 %HP + knockback 4 m | stay behind or beside him |
| **Open the Sluice** | **moving wave**: a 2 m-thick red wall of water crosses the room from the north wall at 5 m/s; one 4 m **gap** (blue edge) in it | 2.0 s (lever thrown, water hisses) | 25 %HP + knocked 6 m | stand in the gap's lane as it passes; or dodge-roll through the wall (a roll's immunity frames cover it) |

**Dialog:** pull — "Lock's shut. Nobody through without a toll." · Sluice ⚠ — "Mind the water!" · death — "Should've... opened it... that night."
**Heroic:** two waves, the second from the east wall 2 s after the first. **Mythic+:** the gap moves 2 m sideways as the wave travels.
**Loot:** `it_lockkeepers_coat` (medium chest), `it_iron_shod_pole` (polearm), `uq_sluicewardens_key` **[D-EXCL]** — neck: after you dodge roll, your next attack within 2 s deals +25% damage and knocks back 3 m.

### Main bosses

#### B1 · `b_old_croak` — Old Croak

| Field | Value |
|---|---|
| Body | creature frog ×4.2, mottled black-green, a heron's bill jammed in her jaw |
| Health | 58 H |
| Phases | 100–50% · 50–0% (Belly Flop every 15 s instead of 22 s) |
| Teaches | **tether** (white line: break it by distance) |
| Enrage | 5:00 |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Snap | melee on tank | — | 10 %HP every 2.4 s | — |
| **Tongue** | white **tether** from Croak to a random non-tank player | 2.5 s | if the player is still within 16 m when it ends: **swallowed** — 4 s inside her, 6 %HP a second, then spat out 8 m | run away until the line snaps (it goes red at 14 m and breaks at 16 m) |
| Belly Flop | leaps onto a player's position: yellow **targeted** 6 m circle | 2.5 s | 30 %HP to everyone in it | the target moves away from the group; everyone else steps out |

**Dialog:** — (croaks; the journal quotes a Fenfolk rhyme: *"Old Croak's mouth is wider than your running."*)
**Heroic:** a swallowed player takes the damage and Croak **heals 5%** unless the group deals 3% of her health while the player is inside (her belly glows). **Mythic+:** Tongue picks two players.
**Loot:** `it_croakskin_boots` (light feet), `it_heron_bill_spear` (spear), `set_fenwader` piece (legs), `uq_wider_than_running` **[D-EXCL]** — belt: +8% movement speed; after you break a tether or leave a danger zone, +15% more for 3 s.

#### B2 · `b_wren_grist` — Wren Grist, the Miller's Wife

| Field | Value |
|---|---|
| Body | chibi2 human ×1.4 with a **drowned** ghost look (translucent blue-green, hair floating as if underwater — new material flag `ghost_water`, §20), a sodden shawl |
| Health | 66 H |
| Phases | 100–30% · **30%: dialog opportunity** · 30–0% (if the fight continues) |
| Teaches | **moving wave** (ring) and **targeted spread** |
| Enrage | 5:30 |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Cold Hands | melee on tank | — | 9 %HP + slow 10% | — |
| **Weeping Tide** | **moving wave**: a red ring 2 m thick that grows out from her at 6 m/s to the walls | 2.0 s ("She weeps.") | 22 %HP + knocked back | dodge-roll through the ring as it reaches you, or stand on the chapel's two raised pews (the ring passes under) |
| **Drowning Grief** | yellow **targeted** 5 m circles on 2 players | 2.5 s | 25 %HP to everyone inside a circle (overlapping = both) | the two marked players move apart and away from the group |
| Low Wicket's Dead | from 60%, 2 Drowned Millhands every 30 s | 1.5 s (water bubbles) | — | tank picks up, damage kills |

**Dialog:** pull (banner) — "Is it morning? Tobiah said he'd be home by morning." · Weeping Tide ⚠ — "The water's coming in again..." · Grief ⚠ — "Hold my hand. Don't let go." · 60% — "The children were on the stilts. Did anyone get the children?"

**Dialog opportunity — "Why did he do it?"** (at 30% she stops, combat pauses up to 25 s):

| Reply | Result |
|---|---|
| "He dammed the fen to sell more flour." (the truth — the story quest's letters, found in the Grain Store and Lock House, say so) | Wren goes still. "Then I'll stop waiting." She fades, the fight **ends** (counts as a kill, full loot), and she leaves **Wren's Lullaby** (`it_wrens_lullaby`, a scrap of song: *"one for the lark, three for the heron, two for the pike that sleeps"*) — needed for the Secret. |
| "It was an accident. He loved you." | "Then where is he?" The fight resumes at 30% with Weeping Tide every 12 s. Normal loot, no lullaby. |
| "Rest now." | as "accident". |

**Death line** (if fought down): "I'll wait a little longer..."
**Heroic:** Drowning Grief marks 3 players; Weeping Tide leaves a 1 m **void zone** ring where it stopped at the wall for 10 s. **Mythic+:** the pews sink after two uses each.
**Loot:** `it_sodden_shawl` (back), `it_wicket_prayer_beads` (neck), `set_fenwader` piece (chest), `uq_wrens_wedding_ring` **[D-EXCL]** — ring: when an ally within 20 m drops below 35% health, you both gain a barrier of 8% of your maximum health (30 s cooldown).

#### END · `b_the_grindwheel` — The Grindwheel

| Field | Value |
|---|---|
| Body | creature golem ×3.2 in the mill's own machinery: a millstone for a chest, gear-wheel shoulders, sack-cloth over iron (new feature flag `millstone_core`, §20) |
| Health | 105 H |
| Phases | 100–50% · 50–0% ("The sluice opens": the room's floor floods to the knee, −10% move, and Open Sluice waves join) |
| Enrage | 6:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Cog Fist | all | melee on tank | — | 12 %HP every 2.6 s | — |
| **Grind** | all | room-wide pull toward the boss (3 m/s) for 5 s + a 7 m red **danger zone** under the boss | 2.5 s | 12 %HP a second inside the red | walk outward against the pull; movement speed boosts help |
| **Belt Chains** | all | white **tethers** between 2 pairs of players | 2.0 s | 6 %HP a second to both while within 12 m of each other | the pair moves apart past 12 m; the line snaps |
| Flour Burst | all | yellow **targeted** 4 m circle on 1 player | 2.0 s | 20 %HP + blind 2 s to all inside | spread |
| Open the Sluice | P2 | **moving wave** across the room (as Old Pike's, one gap) | 2.0 s | 25 %HP | gap or roll |

**Dialog:** (the Grindwheel has no voice; the **millpond** speaks — a wet whisper, voice timbre `drowned` §20) pull — "Grist owes. The wheel collects." · Grind ⚠ — "Into the stones." · 50% (banner) — "Open the sluice. Let the fen pay." · death — "The debt... is not paid..."
**Heroic:** Belt Chains ties 2 pairs and chains the fifth player to the boss (that one must stay within 6 m of it or take 6 %HP a second); Grind pull 4 m/s. **Mythic+:** Flour Burst clouds stay as 4 m **void zones** for 15 s.
**Loot:** `it_millwrights_hammer` (one-handed mace), `it_gearwheel_pauldrons` (heavy shoulders), `set_fenwader` pieces (helm, feet), `it_wheel_axle_staff` (staff), `uq_grist_ledger_of_debts` **[D-EXCL]** — off-hand focus: enemies you damage owe a **Debt** (max 10 stacks per enemy); when that enemy dies, you heal 1% of your maximum health per stack. `leg_millwrights_bargain` **[D-EXCL]** — gloves legendary: every 3rd spell cast costs no resource but deals 20% of its damage to you as a debt paid over 3 s.

### Secret boss — `b_the_tithe_below` — The Tithe Below

**Unlock (dialog + puzzle):** earn **Wren's Lullaby** by telling her the truth (B2 dialog), kill the Grindwheel, then
within **60 s** throw the Wheelhouse's three **sluice levers** in the lullaby's order: *lark = 1, heron = 3,
pike = 2* → levers **1, 3, 2**. Wrong order: the levers jam until the next run. Right order: the millpond
drains to the Millpond Deep and the island rises.
Journal hint: *"Wren sang her children to sleep. Somebody else was listening."*

| Field | Value |
|---|---|
| Body | creature horror ×3.4, silt-brown, nine eyes, tentacles hung with coins and mill tokens |
| Health | 150 H |
| Phases | 100–65% · 65–30% · 30–0% ("The ledger closes") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Lash | all | melee on tank, 2 tentacles | — | 2 × 7 %HP every 2.4 s | — |
| **Collect** | all | a yellow **targeted** coin mark on 2 players (4 m) | 3.0 s | 30 %HP to all inside; **stacks** a Debt on the target (+10% damage taken for 20 s) | spread; the healer watches Debt stacks |
| Undertow | all | **moving wave** inward: a ring from the walls to the island, 5 m/s | 2.0 s | 20 %HP + pulled 4 m | roll through the ring |
| Silt | P2+ | 5 m **void zone** under the tank every 15 s, lasts 45 s | 1.5 s | 4 %HP / 0.5 s | tank moves the boss round the island |
| **Drowned Coins** | P3 | orange **soak**, 5 m, **2 pips**, one each side of the island | 4.0 s | 45 %HP to all if a soak has fewer than 2 players; soakers take 15 %HP each | split 2 + 2 (tank stays) |

**Dialog:** pull (banner) — "Grist signed. You signed too, when you came down." · Collect ⚠ — "Your turn to pay." · 30% (banner) — "Every mill, every wheel, every coin — mine." · death — "Somebody... always... signs."
**Heroic:** Collect marks 3; Drowned Coins needs 3 pips each (tank must soak one). **Mythic+:** Undertow twice, 2 s apart.
**Loot:** `it_coin_hung_girdle` (medium waist), `it_ninefold_eye` (off-hand orb), `uq_silt_lords_tithe` **[D-EXCL]** — ring: 5% of gold you pick up is kept as **Tithe** (max 500); spend it with a click to heal to full out of combat. **`leg_ledger_of_the_deep` [SECRET] [D-EXCL]** — neck legendary: each time an enemy hits you, it gains a **Debt**; at 5 Debts your next hit on it deals +200% damage and clears them.

### Set dropped here

`set_fenwader` — Fenwader's Tack (4 pieces: legs, chest, helm, feet; light armour). Brief: 2 = +20% movement in water and mud, 4 = breaking a tether or leaving a void zone gives +10% damage for 5 s.

---

## d03 — Deepdelve Mines

### Card

| Field | Value |
|---|---|
| id | `d03_deepdelve` |
| Region | Greyridge Highlands (`greyridge`) |
| Levels | 13–16 (opens at 12) · Heroic 60 · Mythic+ 60 |
| Looks | `mine` (new: timber props, rails, lanterns on hooks — §20), `cave` (deep seam) |
| Entrance | **Shaft Seven headframe** on the Greyridge quarry terraces, 3 km north of Anvilgate. A cage lift goes down; the lift is the loading door. |
| Quest giver | `npc_foreman_dagna_coalbright`, Deepforge Clans mine foreman, Anvilgate's Lift Square |
| Story quest | `q_the_seventh_shaft` — "The Seventh Shaft": drive out the Sootwick Gang and find the four miners still down there |
| Run time target | Normal 20 min · Heroic 22 min · Mythic+ par **29:00** |
| Ember Shrines | Lift Foot · after Nix Candlejaw · after Warden Seven |
| Forces needed | ≈ 78 F |
| New lessons | **soak**, **line of sight** (hide behind a pillar), **knockback toward an edge** |

### Story hook

The Deepforge Clans broke into a hollow under Shaft Seven and found it was not empty. A great worm came up
through the floor, the dwarves ran, and the **Sootwick Gang** of goblins moved into the abandoned workings to
strip them. Four miners never came up. Dagna Coalbright wants them found — alive if they can be — and the
Gang's ringleader, Nix Candlejaw, taught a lesson about whose mine it is.

### Layout

```
                               ? The Seventh Seam (secret; sealed wall opens if all 4 miners rescued)
                                       |
   [miner 4] -- Worm Hollow  [B3] STONEGULLET'S GULLET (end)
                                       |
                              Collapse Gallery -- [miner 3]
                                       |
   [s2] Beetle Drift ===== (S3) Pumphouse
                                       |
                              [B2] Warden's Vault (pit in the middle)
                                       |
                                     (S2)
                                       |
   [miner 2] -- Cart Junction ==== [B1] Candlejaw's Den
                    |
   [s1] Foreman's Cut        Sootwick Camp (big room, 3 packs)
                    |                  |
   [miner 1] ---- Rail Tunnel ---------'
                    |
               (S1) Lift Foot  <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Lift Foot | 12×12 | S1, Keystone Font, a mine cart that rides the Rail Tunnel (optional fast way back after a wipe) |
| Rail Tunnel | 7×52 with rails | packs 1–2; **miner 1** behind a rubble pile in a side alcove |
| Sootwick Camp | 30×24 | packs 3–5 (goblin tents, cookfire) |
| Foreman's Cut | 18×16 | s1 Foreman Grubnik |
| Cart Junction | 16×16, four rail spurs | pack 6; **miner 2** down the west spur |
| Candlejaw's Den | 26×22, powder kegs everywhere | B1 Nix Candlejaw |
| Warden's Vault | 30×30, 8 m-wide shaft in the centre, 4 ore pillars | B2 Warden Seven; S2 before it |
| Pumphouse | 14×14 | S3, pack 7 |
| Beetle Drift | 20×18, low | s2 Rattlejaw (optional) |
| Collapse Gallery | 9×44, ceiling cracked | packs 8–9; **miner 3** at the far end, under a fallen prop |
| Worm Hollow | 20×20 side cave | pack 10; **miner 4** in a worm-cast bubble |
| Stonegullet's Gullet | 36×36 round cave, 6 worm holes in the floor | END Stonegullet; sealed wall on the north side |
| The Seventh Seam | 34×28, walls of raw ore | secret boss |

**The miners.** Each is behind an obstacle: hold **E** for 3 s to free them (rubble, fallen prop, worm-cast).
Starting the 3 s wakes a small pack (2–3 trash) that attacks the freer. A freed miner walks to the Lift Foot
by himself and is counted on the party frame ("Miners freed: 2/4").

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_goblin_sootwick_digger` | Sootwick Digger | chibi2 goblin, pick, soot-black helmet with a candle | 1 | **Pick Flurry** 3 × 3 %HP over 1.5 s. |
| `m_goblin_sootwick_lampjack` | Sootwick Lampjack | chibi2 goblin, lantern on a pole | 0.8 | **Lamp Bomb**: yellow **targeted** 3 m circle, 2.0 s, 12 %HP + burn 1 %HP a second for 4 s. |
| `m_goblin_sootwick_slingshot` | Sootwick Slingshot | chibi2 goblin, sling | 0.8 | **Pebble** 5 %HP at 30 m; **Ricochet** off a wall to a second player. |
| `m_goblin_sootwick_hexer` | Sootwick Soot-Hexer | chibi2 goblin, bone rattle, face painted white | 0.8 | **Soot Hex** (i) 2.0 s: curse, −20% damage dealt for 10 s (dispellable). **Smoke Pot**: 5 m grey cloud, blinds inside 2 s. |
| `m_goblin_sootwick_brute` | Sootwick Brute (elite) | chibi2 goblin ×1.9, pit-prop club | 3 | **Prop Swing**: 120° red cone 6 m, 1.8 s, 22 %HP + knockback 5 m (toward walls — or the shaft in B2's room). |
| `m_beast_tunnel_beetle` | Tunnel Beetle | creature beetle ×1.5, rust-brown | 1.2 | **Shell Up**: 60% less damage for 3 s when hit from the front (shell glows). **Burrow Rush**: red line 2 m × 12 m, 1.5 s, 12 %HP. |
| `m_beast_rock_centipede` | Rock Centipede | creature centipede ×1.6 | 1 | **Venom Bite** 6 %HP + poison 1.5 %HP a second for 6 s. |
| `m_beast_shaft_bat` | Shaft Bat | creature bat ×1.3 | 0.3 | swarms of 6–8; **Screech** interrupts casts within 4 m once per swarm per 12 s. |
| `m_elemental_firedamp` | Firedamp Pocket | creature wisp ×1.2, dull orange, does not move | 0.5 | harmless until hit by **fire**: then after 1.5 s it bursts in a 6 m circle for 35 %HP to **players and enemies**. Lure goblins next to it. |
| `m_aberration_gravelmaw_grub` | Gravelmaw Grub | creature worm ×0.7, grey | 0.4 | **Gnaw** 3 %HP; comes in fours; Stonegullet's young. |

| # | Room | Pack |
|---|---|---|
| 1 | Rail Tunnel, near | 3 Sootwick Diggers + 1 Lampjack |
| 2 | Rail Tunnel, far | 1 Sootwick Brute + 2 Slingshots; 1 Firedamp Pocket in the ceiling |
| 3 | Sootwick Camp, west | 4 Diggers + 1 Soot-Hexer |
| 4 | Sootwick Camp, fire | 2 Lampjacks + 2 Slingshots + 1 Brute |
| 5 | Sootwick Camp, east | 2 Soot-Hexers + 3 Diggers; 2 Firedamp Pockets |
| 6 | Cart Junction | 1 Brute + 2 Lampjacks + 6 Shaft Bats |
| 7 | Pumphouse | 3 Tunnel Beetles |
| 8 | Collapse Gallery, entry | 2 Rock Centipedes + 4 Gravelmaw Grubs |
| 9 | Collapse Gallery, far | 2 Tunnel Beetles + 1 Rock Centipede; ceiling drops 3 m red circles every 8 s while fighting (1.8 s, 15 %HP) |
| 10 | Worm Hollow | 8 Gravelmaw Grubs + 2 Rock Centipedes |
| — | miner guards | freeing each miner wakes 2–3 of the local trash |

### Sub-bosses

#### s1 · `b_foreman_grubnik` — Foreman Grubnik

Body: chibi2 goblin ×1.5, foreman's bowler hat with three candles, a whip and a ledger. Health 24 H. Enrage 4:30.
Comes with 3 Sootwick Diggers that do not count as a pack.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Whip Crack | 60° red cone 8 m | 1.5 s | 14 %HP | step out of the front |
| **Work Faster!** (i) | 2.0 s cast | 2.0 s | his diggers gain +40% attack speed for 12 s (dispellable, "enrage" type, page 05) | interrupt, or purge the buff, or kill the diggers first |

**Dialog:** pull — "Oi! Nobody's on break!" · Work Faster ⚠ — "Faster, you lazy lumps!" · death — "Put... it in the ledger..."
**Heroic:** a new digger joins every 25 s. **Mythic+:** Whip Crack also pulls the target 4 m toward him.
**Loot:** `it_foremans_bowler` (light helm), `it_tally_whip` (whip, one-handed), `uq_grubniks_ledger` **[D-EXCL]** — off-hand focus: each time an ally you buffed lands a critical hit, you gain 1% haste (max 10%, 8 s).

#### s2 · `b_rattlejaw` — Rattlejaw

Body: creature beetle ×3.4, iron-grey shell with ore glinting in the seams. Health 26 H. Beetle Drift (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Mandibles | melee on tank | — | 10 %HP | — |
| **Burrow** | vanishes, then a red **danger zone** 5 m grows under a random player | 3.0 s | 40 %HP + knock-up 1.5 s | leave the red; it erupts there |
| Shell Charge | red line 3 m × 20 m | 2.0 s | 25 %HP + knockback | step aside |

**Heroic:** Burrow chains twice. **Mythic+:** each eruption leaves 3 grubs.
**Loot:** `it_ore_seam_carapace` (heavy chest), `it_rattlejaw_mandible` (axe), `uq_rattlejaws_shell` **[D-EXCL]** — off-hand shield: when you take a hit from the front, 10% chance to gain **Shell** (−30% damage taken, 3 s).

### Main bosses

#### B1 · `b_nix_candlejaw` — Nix Candlejaw, the Sootwick Ringleader

| Field | Value |
|---|---|
| Body | chibi2 goblin ×1.7, helmet ringed with lit candles (wax dripping), a blunderbuss, 2 bodyguards (Sootwick Brutes, 3 H each, "Lug" and "Mugg") |
| Health | 60 H |
| Phases | 100–40% · 40–0% (lights every keg fuse at once — see Kegfall) |
| Teaches | **soak** (orange circle with pips: enough people inside or everyone gets hit) |
| Enrage | 5:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Blunderbuss | all | 30° cone 10 m on the tank | 1.2 s | 12 %HP | — |
| **Powder Keg** | all | a keg rolls to a spot: orange **soak** 4 m, **3 pips** | 4.0 s (fuse sparks, pips shown) | 90 %HP to everyone in the room if fewer than 3 inside; split among soakers otherwise (3 soakers: 22 %HP each) | three players stand in. Every 25 s |
| Candle Bomb | all | yellow **targeted** 3 m on 1 player | 2.0 s | 15 %HP + burn | spread |
| **Kegfall** | P2 | 3 kegs at once: two soaks (2 pips each) and one red **danger zone** 8 m | 4.0 s | as above; the danger zone 50 %HP | split 2/2, tank stays on Nix, nobody in the red |

**Dialog opportunity — "The toll"** (on the first approach, Nix calls from a keg pile before the pull; any player can answer):

| Reply | Result |
|---|---|
| "Here's your toll." (30 gold from the answering player) | Lug and Mugg pocket the gold and **walk off**. Nix fights alone. Loot unchanged. |
| "Your candles are coming out." | normal fight with both bodyguards. |
| *(Rogue, Swashbuckler or Scavenger only)* "Cut me in on the dwarf vault and I'll cut you in." | Lug and Mugg turn on Nix for the first 30 s (they deal 10% of his health), then leave. Journal records a class line. |

**Dialog:** pull — "Candles lit, lads! Light 'em up!" · Powder Keg ⚠ — "Hug the barrel, heroes! Go on!" · Kegfall ⚠ (banner) — "ALL of 'em!" · death — "Who... blew out... my candles..."
**Heroic:** Powder Keg needs 4 pips; Candle Bomb on 2 players. **Mythic+:** a missed keg leaves a 6 m burning **void zone** for 20 s.
**Loot:** `it_candlejaw_blunderbuss` (ranged, gun-type — page 08 check), `it_wax_crusted_helm` (medium helm), `set_deepdelver` piece (chest), `uq_ringleaders_candles` **[D-EXCL]** — helm: your area spells leave a 2 m burning patch for 3 s (6% of the spell's damage per second).

#### B2 · `b_warden_seven` — Warden Seven

| Field | Value |
|---|---|
| Body | creature golem ×2.8, dwarf-built iron and stone, a drill for a right arm, a clan rune glowing red on its chest |
| Health | 72 H |
| Phases | 100–50% · 50–0% (two pillars crumble — fewer places to hide) |
| Teaches | **line of sight** (hide behind a pillar) and **knockback toward an edge** |
| Enrage | 6:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Drill Arm | all | melee on tank | — | 12 %HP | — |
| **Seismic Pulse** (u) | all | room-wide, grey cast bar 3.5 s, the four ore pillars flash **blue** on the side away from the Warden | 3.5 s | 110 %HP (one-shot) to anyone the Warden can see | break line of sight: stand behind an ore pillar. Every 35 s |
| **Drill Charge** | all | red line 4 m × 18 m aimed across the central shaft | 2.0 s | 20 %HP + knockback 10 m in the line's direction | stand so the line does not push you toward the shaft; if you fall, you land in the Pumphouse sump with 4 Gravelmaw Grubs and climb back in ~20 s (the arena stays open to fallers) |
| Clan Rune | P2 | a 6 m **beneficial** green circle appears for 8 s every 30 s | 1.5 s | +30% damage to whoever stands in it | the damage dealers use it |

**Dialog** (clan-rune voice, dwarvish formal): pull — "INTRUDER. SHAFT SEVEN IS CLOSED." · Pulse ⚠ (banner) — "ALL HANDS — CLEAR THE FACE." · 50% — "STRUCTURAL FAILURE. CONTINUING." · death — "Shift... ended."
**Heroic:** Seismic Pulse leaves the pillar that shielded the most players cracked (it breaks at the next Pulse). **Mythic+:** Drill Charge twice in a row, 1.5 s apart.
**Loot:** `it_warden_drill_bit` (two-handed spear), `it_runebound_greaves` (heavy legs), `set_deepdelver` piece (shoulders), `uq_seventh_shift_rune` **[D-EXCL]** — neck: when you break line of sight to an enemy casting at you, you gain a barrier of 6% of your maximum health (10 s cooldown).

#### END · `b_stonegullet` — Stonegullet

| Field | Value |
|---|---|
| Body | creature worm ×5.5, grey-brown plated, maw lined with ore teeth |
| Health | 110 H |
| Phases | 100–60% (surface) · 60–30% (burrowing: moves hole to hole) · 30–0% (cave-in) |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Crush | all | melee on tank | — | 13 %HP | — |
| Gravel Spew | all | 70° red cone 14 m | 2.0 s | 30 %HP + slow 30% 3 s | only the tank in front |
| **Breach** | P2 | vanishes; red **danger zone** 7 m over one of the 6 holes (the one nearest the most players) | 3.0 s | 60 %HP + knock-up | leave that hole |
| **Swallowed Stone** | P1, P3 | orange **soak** 5 m, **2 pips** (Normal) | 4.0 s | 80 %HP to all if unsoaked; 25 %HP each for 2 | two players stand in |
| Cave-In | P3 | 3 red circles 3 m where rocks fall, every 6 s | 1.8 s | 25 %HP | move |
| Grub Brood | P2 | 4 Gravelmaw Grubs from a random hole | 1.5 s | — | cleave them down |

**Dialog:** none (a worm). The miners, if freed, shout from the Lift Foot over party chat: "It hates light! Keep your torches up!" (flavour: torches in the arena reduce Gravel Spew's slow to 15%).
**Heroic:** soaks need 3 pips; Breach targets two holes. **Mythic+:** a soak that is fully soaked still leaves a 3 m **void zone** of gravel for 20 s.
**Loot:** `it_gullet_tooth_maul` (two-handed mace), `it_orebelly_girdle` (heavy waist), `it_deep_seam_ring` (ring), `set_deepdelver` pieces (helm, legs), `uq_stonegullets_gizzard_stone` **[D-EXCL]** — trinket: use: swallow the stone, −40% damage taken for 4 s and immune to knockback (90 s cooldown). `leg_worm_king_mandible` **[D-EXCL]** — weapon legendary (two-handed axe or mace, takes the looter's preferred type): your heavy attacks bore into the ground and erupt under the target 1 s later for 60% weapon damage in a 3 m circle.

### Secret boss — `b_the_unmined` — The Unmined

**Unlock (rescue):** free **all four miners** (Rail Tunnel alcove, Cart Junction west spur, Collapse Gallery far end,
Worm Hollow) **before** Stonegullet dies. After the kill, the four miners come down to the Gullet, set charges and
blow the sealed north wall ("We heard it singing behind that wall for a month.").
Journal hint: *"Four miners went down Shaft Seven. The mountain only gave three kinds of thing back."*

| Field | Value |
|---|---|
| Body | creature titan ×2.2 made of raw ore — iron-grey body, gold and copper veins, a heart of glowing crystal (new colour set `ore_titan`) |
| Health | 150 H |
| Phases | 100–70% · 70–35% · 35–0% ("The seam wakes") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Ore Fist | all | melee on tank | — | 14 %HP | — |
| Vein Burst | all | red **cross** (two 3 m × 30 m lines) centred on the boss, rotates 45° each cast | 2.5 s | 35 %HP | stand between the arms |
| Singing Seam (u) | all | room-wide, 3.5 s; the seam's ore pillars flash blue | 3.5 s | 100 %HP to anyone in sight | line of sight behind a pillar |
| Mother Lode | P2+ | orange **soak** 5 m, **3 pips** | 4.0 s | 90 %HP to all if unsoaked | three players |
| Tremor Step | P3 | the boss stomps: knockback 12 m from it | 2.0 s | 15 %HP | stand with a wall at your back, not the open shaft |

**Dialog:** pull (banner, a deep ringing voice) — "Little diggers. You have been eating me for a thousand years." · Singing Seam ⚠ — "Hear me sing." · death — "Take what you broke. It was always yours to take."
**Heroic:** Vein Burst leaves the arms as void zones for 6 s. **Mythic+:** Mother Lode needs 4 pips.
**Loot:** `it_crystal_heart_shard` (off-hand orb), `it_ore_veined_gauntlets` (heavy hands), `uq_goldvein_signet` **[D-EXCL]** — ring: +10% gold found; your critical hits have a 5% chance to drop a shard worth 5–30 gold. **`leg_heart_of_the_unmined` [SECRET] [D-EXCL]** — chest legendary: every 10 s standing still in combat grows a stone skin: −5% damage taken per stack (max 4); moving 5 m clears it.

### Set dropped here

`set_deepdelver` — Deepdelver's Harness (4 pieces: chest, shoulders, helm, legs; heavy armour). Brief: 2 = +15% resistance to knockback distance, 4 = while you stand in a soak you take 20% less damage from it.

---

## d04 — Bellows Keep

### Card

| Field | Value |
|---|---|
| id | `d04_bellows_keep` |
| Region | Greyridge Highlands (`greyridge`) |
| Levels | 16–18 (opens at 15) · Heroic 60 · Mythic+ 60 |
| Looks | `cinderworks` (reuse) for the foundry, `crypt` for the keep's old halls |
| Entrance | **Bellows Keep gate**, cut into the cliff above the Kilnwater gorge 5 km east of Anvilgate, reached over a chain bridge. The gate stands open, war-banners of the Ashtusk Horde hung over the clan runes. |
| Quest giver | `npc_thane_orla_bellamund`, exiled keep-thane, at the Anvilgate Moot Hall |
| Story quest | `q_the_bellows_breathe` — "The Bellows Breathe": retake the keep and put out the fire the orcs have chained in the Great Bellows |
| Run time target | Normal 22 min · Heroic 24 min · Mythic+ par **30:00** |
| Ember Shrines | Gatehouse · after Forgemaster Ghorza · after the Great Bellows |
| Forces needed | ≈ 84 F |
| New lessons | **tank swap** (a stacking debuff on the tank, cleared by handing the boss over or by a room object), **room-wide hit with safe zones** |

### Story hook

Bellows Keep was the Deepforge Clans' great foundry: a fortress built around a furnace so hot it was fed by
a bound fire spirit breathing through a set of iron bellows the size of a house. The **Ashtusk Horde** took it
in a single night, and their warchief, Grumvak Kilnbreaker, has the dwarves' own smiths in chains forging orc
steel. Thane Orla Bellamund wants her keep back — and the smiths out alive.

> **Open (reconciliation pass):** the Ashtusk Horde's band is **26–40** (page 10 §9.5, owner per 00 §10), but this
> dungeon is 16–18. Either the keep is taken by a far-flung Ashtusk vanguard (an exception page 10 would have to
> list) or its garrison becomes another band (the Sootwick Gang holds Greyridge 10–18). Not decided here.

### Layout

```
          ? The Cold Forge (secret: reach & kill the Great Bellows within 12:00 of the first pull)
                       |
   [B3] KILNBREAKER'S THRONE (end) ======= Rampart Walk
                       |                       |
                  (S3) Quench Hall        [s2] Slag Pools
                       |
            [B2] THE GREAT BELLOWS
                       |
                     (S2)
                       |
      Smiths' Pens --- [B1] Ghorza's Forge Floor
          |                    |
     [s1] Tong Room ---- Anvil Gallery
                               |
                        Barracks Court
                               |
                     (S1) Gatehouse <-- entrance (chain bridge outside)
```

| Room | Size (m) | Holds |
|---|---|---|
| Gatehouse | 16×12 | S1, Keystone Font; the **Heat Gauge** (a brass dial by the door; see Secret) |
| Barracks Court | 32×28 | packs 1–3 |
| Anvil Gallery | 10×40, anvils in a row | packs 4–5 |
| Tong Room | 18×16 | s1 Grukk & Zagga |
| Smiths' Pens | 20×14, 6 chained smiths (non-hostile) | pack 6; free the smiths (see below) |
| Ghorza's Forge Floor | 28×28, 2 quench troughs | B1 Forgemaster Ghorza |
| The Great Bellows | 34×30; the bellows fill the north wall; 4 dwarf ward-stones | B2 the Great Bellows; S2 at the door |
| Quench Hall | 16×24 | S3, pack 7 |
| Slag Pools | 22×22, glowing pools | s2 Slagmaw (optional) |
| Rampart Walk | 6×50 open-air wall top | packs 8–9 |
| Kilnbreaker's Throne | 32×32 | END Grumvak |
| The Cold Forge | 28×28, frost on the anvils | secret boss |

**Chained smiths** (`npc_chained_smith`, 6 in the Smiths' Pens, 2 in the Anvil Gallery): hold **E** 1.5 s to break
a chain. Each freed smith gives the party **Smith's Edge** (+2% damage, stacking, whole run) and walks out.
Free all 8 → the Throne's four war-anvils are sabotaged: Grumvak's **Anvil Rain** drops one fewer anvil.

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_orc_ashtusk_raider` | Ashtusk Raider | chibi2 orc, hide armour, two axes | 1 | **Double Chop** 2 × 5 %HP. **Howl**: +15% attack speed to orcs within 10 m, 8 s. |
| `m_orc_ashtusk_spearman` | Ashtusk Spearman | chibi2 orc, long spear, round shield | 1.2 | **Impale**: red line 2 m × 7 m, 1.5 s, 14 %HP + bleed 1 %HP a second 6 s. |
| `m_orc_ashtusk_bonecaller` | Ashtusk Bonecaller | chibi2 orc, bone mask, rattle staff | 0.9 | **Mend Flesh** (i) 2.5 s: heals an orc 35%. **Bone Hex**: 3 m **void zone** of bone splinters under a player, 10 s, 3 %HP / 0.5 s. |
| `m_orc_ashtusk_forgebrute` | Ashtusk Forgebrute (elite) | chibi2 orc ×1.8, smith's apron, sledge | 3.5 | **Hot Iron**: stacks **Seared** on its target (+8% fire damage taken, 12 s, max 5). **Sledge Slam**: 5 m red circle around itself, 2.0 s, 25 %HP. |
| `m_beast_forge_hound` | Forge Hound | creature hound ×1.4, ember-coated | 1 | **Ember Bite** 6 %HP + burn 1 %HP a second 4 s. On death, 2 m fire patch 4 s. |
| `m_fiend_slag_imp` | Slag Imp | creature imp ×1.0, dripping molten | 0.5 | **Slag Spit** 5 %HP at 20 m. Comes in threes. |
| `m_elemental_cinder_spawn` | Cinder Spawn | creature elemental ×0.8, fire | 0.8 | **Flare**: 1.5 s, 4 m circle around itself, 12 %HP. Grows +20% size and damage every 10 s alive. |
| `m_construct_anvil_sentinel` | Anvil Sentinel (elite) | creature golem ×2.0, anvil-headed dwarf construct in orc chains | 3 | **Anvil Drop**: yellow **targeted** 4 m on a player, 2.5 s, 30 %HP. **Chained**: breaks free at 50% and gains +30% damage. |
| `m_orc_ashtusk_whipmaster` | Ashtusk Whipmaster | chibi2 orc, whip, keys on belt | 1 | **Lash** 60° cone 7 m, 1.5 s, 10 %HP. Drops a **Pen Key** (frees one smith instantly, no channel). |

| # | Room | Pack |
|---|---|---|
| 1 | Barracks Court, bunks | 3 Raiders + 1 Bonecaller |
| 2 | Barracks Court, drill yard | 2 Spearmen + 2 Raiders + 3 Forge Hounds |
| 3 | Barracks Court, armoury door | 1 Forgebrute + 1 Bonecaller |
| 4 | Anvil Gallery, near | 1 Anvil Sentinel + 3 Slag Imps; 2 chained smiths |
| 5 | Anvil Gallery, far | 2 Spearmen + 1 Whipmaster + 1 Bonecaller |
| 6 | Smiths' Pens | 2 Whipmasters + 2 Raiders |
| 7 | Quench Hall | 1 Forgebrute + 2 Cinder Spawns + 3 Slag Imps |
| 8 | Rampart Walk, near | 3 Spearmen + 1 Bonecaller (wind: −10% ranged accuracy toward the valley side) |
| 9 | Rampart Walk, far | 2 Forgebrutes (elite pair) |
| — | *patrol* Barracks → Anvil Gallery | 2 Forge Hounds + 1 Whipmaster, 60 s loop |

### Sub-bosses

#### s1 · `b_grukk_and_zagga` — Grukk and Zagga, the Tongsmen

Bodies: two chibi2 orcs ×1.5, one with long tongs (Grukk), one with a hammer (Zagga). **Shared health** 26 H (one bar, two
bodies — a lesson for d08). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Tong Grab (Grukk) | white **tether** to a player, 2.0 s; if unbroken (stay within 10 m), the player is held in front of Zagga | 2.0 s | held 2 s, then Zagga's next swing hits them | break it by distance |
| Hammer Home (Zagga) | 3 m red circle in front | 1.8 s | 30 %HP (60 %HP to a held player) | out of the circle |

**Dialog:** Grukk — "Hold 'im still!" · Zagga — "Hittin' now!" · death — "Told you... hold 'im..."
**Heroic:** both abilities on independent timers (overlap). **Mythic+:** at 30% the shared bar splits into two bars for the rest of the fight; kill both within 10 s of each other or the survivor heals back to 30% and gains +25% damage.
**Loot:** `it_tongsmans_apron` (medium chest), `it_zaggas_hammer` (one-handed mace), `uq_matched_tongs` **[D-EXCL]** — gloves: when you and a party member hit the same target within 1 s, both hits deal +8%.

#### s2 · `b_slagmaw` — Slagmaw

Body: creature elemental ×2.6, molten slag with a crust (orange/black palette). Health 28 H. Slag Pools (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Molten Fist | melee | — | 12 %HP + burn | — |
| Slag Wave | **moving wave** outward from the pools, ring, 5 m/s | 2.0 s | 25 %HP | roll through |
| Crust Over | at 66% and 33%: armour +80% for 10 s | 1.5 s | — | a **cold** or **water** spell (ice/frost element) or dragging it into a pool's cool edge (a **beneficial** blue-green ring) breaks the crust |

**Loot:** `it_slag_crust_greaves` (heavy legs), `it_quenched_blade` (sword), `uq_slag_heart_ember` **[D-EXCL]** — trinket: your fire hits have a 10% chance to leave a 2 m slag pool for 4 s (8% of the hit per second).

### Main bosses

#### B1 · `b_forgemaster_ghorza` — Forgemaster Ghorza

| Field | Value |
|---|---|
| Body | chibi2 orc ×1.9, female, leather smith's apron over chain, a glowing branding iron and a war hammer |
| Health | 68 H |
| Phases | 100–50% · 50–0% (heats the whole floor: the quench troughs start to steam and only give 1 use each) |
| Teaches | **tank swap** (stacking debuff on the tank) |
| Enrage | 6:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Hammer | all | melee on tank | — | 12 %HP | — |
| **Searing Brand** | all | applied to her current target with every 3rd swing; a red brand icon stacks on the tank's frame | — | +15% fire damage taken per stack, 25 s, max 8 | at **4 stacks**: on Normal, the tank steps into a **quench trough** (green **beneficial** 3 m circle) for 1.5 s to clear all stacks while a second player (any class with a taunt, or a follower tank) holds her 5 s; on Heroic the troughs are gone and a **real tank swap** is needed |
| **Slag Pour** | all | yellow **targeted** 4 m on 2 non-tanks | 2.5 s | 20 %HP; leaves a 4 m **void zone** of slag for 30 s (4 %HP / 0.5 s) | drop them at the room edge |
| Quench Steam | P2 | each trough used puffs a 6 m steam cloud for 4 s | — | blinds everyone inside 2 s | use the trough, then walk out |

**Dialog:** pull — "Fresh ore! Get 'em on the anvil!" · Brand ⚠ — "Hold still. It only hurts forever." · 50% (banner) — "Stoke it hotter!" · death — "The steel... wasn't ready..."
**Heroic:** Brand max 10, no troughs, swap at 3–4; Slag Pour on 3 players. **Mythic+:** her target at 6+ stacks takes a **Branded Blast**: 8 m red circle around the tank, 2.0 s, 40 %HP to everyone near.
**Loot:** `it_ghorzas_branding_iron` (one-handed mace), `it_forgemasters_apron` (medium chest), `set_kilnbreaker_iron` piece (hands), `uq_orc_steel_pauldrons` **[D-EXCL]** — heavy shoulders: taunting an enemy gives you −15% damage taken from it for 6 s.

#### B2 · `b_the_great_bellows` — The Great Bellows (and Imbrasa, the chained flame)

| Field | Value |
|---|---|
| Body | a stationary construct: the bellows fill the north wall (new prop `great_bellows`, §20); the **target** is **Imbrasa**, a creature elemental ×3.2 (fire) chained in the bellows' mouth |
| Health | 78 H (Imbrasa) |
| Phases | 100–66% · 66–33% · 33–0% (each phase the bellows pump faster: Bellow Blast every 40 s → 32 s → 25 s) |
| Teaches | **room-wide hit + safe zones** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Lick of Flame | all | Imbrasa's melee on the tank; tank stands at the chains | — | 11 %HP + burn | — |
| **Bellow Blast** (u) | all | room-wide fire; **2 blue safe zones** (4 m) light up at 2 of the 4 dwarf ward-stones | 4.0 s | 120 %HP (one-shot) outside a safe zone | run to a lit ward-stone. Different pair each time |
| Spark Rain | all | 5 red circles 3 m at random | 1.8 s | 18 %HP | move |
| Cinder Spawns | P2+ | 2 Cinder Spawns (0.8 H) every 30 s, growing | 1.5 s | — | kill before they grow 3 times |

**Dialog:** Imbrasa speaks (a crackling female voice): pull (banner) — "They feed me iron and ask for fire. Let me give you some." · Bellow Blast ⚠ (banner) — "BREATHE IN." · 33% — "Break the chains, or burn with me." · death — "Cold... at last..."
**Heroic:** only **one** safe zone per Blast from phase 2, 5 m wide (the whole group packs in). **Mythic+:** Spark Rain follows players (circles appear where they stood 1 s ago).
**Loot:** `it_bellows_leather_gloves` (light hands), `it_imbrasas_chain` (neck), `set_kilnbreaker_iron` piece (chest), `uq_chained_flame_link` **[D-EXCL]** — ring: fire spells cost 8% less; if you are hit by a room-wide attack, your next fire spell deals +30%.

#### END · `b_grumvak_kilnbreaker` — Warchief Grumvak Kilnbreaker

| Field | Value |
|---|---|
| Body | chibi2 orc ×2.3, tusks capped in dwarf gold, a greataxe forged in the keep, Ashtusk banner on his back |
| Health | 120 H |
| Phases | 100–65% · 65–30% (war-anvils fire) · 30–0% ("Kilnbreaker!": +20% damage, calls the last guards) |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Kilnaxe | all | melee on tank; applies **Cleft Armour** (−8% armour per stack, 20 s, max 6) | — | 14 %HP | tank swap on Heroic at 4; on Normal a follower tank or a Damage player with a taunt takes 5 s |
| Whirling Axe | all | 8 m red circle around him | 2.5 s | 35 %HP | everyone but the tank out; the tank takes it with a cooldown (or leaves too) |
| **Anvil Rain** | P2+ | 4 yellow **targeted** 4 m circles (3 if all smiths freed) | 3.0 s | 40 %HP each | spread across the room |
| **Kiln Blast** (u) | P2+ | room-wide; blue **safe zones** under the 2 quench cisterns | 4.0 s | 110 %HP | cisterns |
| War Horn | P3 | 3 Ashtusk Raiders + 1 Bonecaller run in | 1.5 s | — | Bonecaller first (interrupt Mend Flesh) |

**Dialog:** pull (banner) — "The stunties built it. We FEED it." · Anvil Rain ⚠ — "Catch!" · Kiln Blast ⚠ (banner) — "Open the kiln!" · 30% (banner) — "Ashtusk! To me!" · death — "The Horde... remembers... this keep..."
**Heroic:** Kiln Blast's safe zones shrink from 5 m to 3 m over the cast. **Mythic+:** Whirling Axe moves toward the healer at 2 m/s.
**Loot:** `it_kilnbreaker_greataxe` (two-handed axe), `it_ashtusk_war_banner` (back), `it_dwarf_gold_tuskcaps` (neck), `set_kilnbreaker_iron` pieces (helm, legs), `uq_throne_of_the_keep_signet` **[D-EXCL]** — ring: +6% damage to enemies stronger than you (elite, boss). `leg_kilnbreakers_oath` **[D-EXCL]** — two-handed axe legendary: every 4th hit on the same target applies **Cleft** (−5% armour, max 5); at 5, your next hit deals +150% and clears it.

### Secret boss — `b_bellamund_the_cold_smith` — Harrow Bellamund, the Cold Smith

**Unlock (time limit):** the **Heat Gauge** by the Gatehouse starts when the party first pulls anything in the Barracks
Court. Kill **the Great Bellows within 12:00** of that pull (Heroic/Mythic+: 10:00). The furnace never reaches
full heat; after Grumvak dies, the Throne's back wall is cold enough to walk through (it frosts over) into the
Cold Forge, where the keep's founder has been waiting, bound as a warden spirit. The gauge shows the time on
the party frame.
Journal hint: *"The keep runs hotter every minute you spend in it. The old thane did his best work cold."*

| Field | Value |
|---|---|
| Body | chibi2 dwarf ×1.9, a ghost of frost-blue light (material `ghost_frost`, §20), smith's hammer and tongs |
| Health | 155 H |
| Phases | 100–60% · 60–25% · 25–0% ("The last strike") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Cold Hammer | all | melee on tank; stacks **Brittle** (+10% physical damage taken, max 6) | — | 13 %HP | tank swap at 4 (Heroic); a frost-bench **beneficial** zone clears stacks on Normal |
| Quench | all | 3 red lines 3 m × 26 m (anvil to wall) in a fan | 2.5 s | 35 %HP + slow | between the lines |
| Tempering (u) | all | room-wide cold; **blue safe zones** at the 2 forges he did **not** stand at last | 4.0 s | 110 %HP | read which forges |
| Hammer-and-Anvil | P2+ | orange **soak** 4 m, **3 pips** at the great anvil | 4.0 s | 90 %HP to all if short | three players |
| The Last Strike | P3 | 1 player tethered (white) to the anvil; must stay within 6 m or the tether snaps and **he** takes 10% of his health | 2.5 s | 3 %HP a second while tethered | this tether you **keep** until 10 s pass — breaking it early heals nobody; keeping it gives the party +15% damage (the old thane's approval) |

**Dialog opportunity — "The Thane's test"** (on pull he asks): "Who holds the keep now?" · "Thane Orla Bellamund." → he fights at −10% health ("She took it back. Good."). · "We do." → normal. · "The orcs." → +10% health.
**Dialog:** Tempering ⚠ (banner) — "Iron learns from cold." · death — "Tell Orla... the keep is hers. The fire, too."
**Loot:** `it_frostforged_tongs` (off-hand), `it_cold_smith_apron` (heavy chest), `uq_bellamund_hammerhand` **[D-EXCL]** — gloves: your every 5th hit on an enemy applies **Brittle** (+4% physical damage taken, max 5). **`leg_the_cold_anvil` [SECRET] [D-EXCL]** — off-hand (shield) legendary: blocking an attack stores 30% of it; your next attack within 5 s releases the stored amount as frost damage in a 4 m circle.

### Set dropped here

`set_kilnbreaker_iron` — Kilnbreaker's Iron (4 pieces: hands, chest, helm, legs; heavy armour). Brief: 2 = +10% fire resistance, 4 = when a stacking debuff on you is cleared, gain a barrier of 3% max health per stack cleared.

---

## d05 — The Glass Tombs

### Card

| Field | Value |
|---|---|
| id | `d05_glass_tombs` |
| Region | Sunscar Barrens (`sunscar`) |
| Levels | 19–22 (opens at 18) · Heroic 60 · Mythic+ 60 |
| Looks | `glass_tomb` (new: sand-gold floor, walls of smoky fused glass, sun-shafts from roof slots — §20), `crypt` |
| Entrance | the **Glass Field**, 4 km south-west of the Oasis of Tamar, where old lightning fused the dunes; a doorway of green glass in the flank of Kings' Mesa |
| Quest giver | `npc_lightkeeper_oren_sael`, Sandsworn keeper of the Tamar sun-lamps |
| Story quest | `q_the_unshattered_king` — "The Unshattered King": close the tombs the Dunecutters cracked, before the Glass Kings walk into Tamar |
| Run time target | Normal 24 min · Heroic 25 min · Mythic+ par **31:00** |
| Ember Shrines | Outer Seal · after the Glassblower · after Queen Ammarel |
| Forces needed | ≈ 88 F |
| New lessons | **beams and mirrors** (a light beam you redirect or block), **checkerboard floor**, **cross** |

### Story hook

The Glass Kings of old Sunscar had themselves sealed in glass at death so they would "be seen forever". Their
tombs lay shut for eleven centuries until the **Dunecutters**, a robber band, cracked the Outer Seal. Sunlight
fell on glass for the first time since the burial — and the kings woke up looking for their subjects. Lightkeeper
Oren says three caravans have already walked into the mesa and not come out.

### Layout

```
                          ? The Sun Door (secret: aim the Hall of Mirrors beam at it)
                                   |
      [B3] SETHAR'S SUN VAULT (end) ===== Hall of Mirrors (4 mirror stands)
                   |
            (S3) Embalmers' Walk
                   |
  [s2] Robbers' Gallery ===== [B2] AMMAREL'S COURT (checker floor)
                                   |
                                 (S2)
                                   |
      Brood Cellar [s1] ---- [B1] THE BLOWING HOUSE
                                   |
                          Antechamber (lore tablet)
                                   |
                          Hall of Attendants
                                   |
                       (S1) Outer Seal  <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Outer Seal | 14×14 | S1, Keystone Font, the cracked seal |
| Hall of Attendants | 10×46 | packs 1–3; sun-shafts: standing in one = +10% damage taken from beams |
| Antechamber | 16×16 | pack 4; **lore tablet** "The Path of the Seventh Light" (a drawing of 4 mirrors and angles — the Secret's answer) |
| The Blowing House | 28×24, glass furnaces | B1 the Glassblower |
| Brood Cellar | 18×18, sand floor | s1 the Gilded Brood-Mother (optional) |
| Ammarel's Court | 30×30, 6×6 tile floor (5 m tiles) | B2 Queen Ammarel |
| Robbers' Gallery | 12×36, a Dunecutter camp inside a tomb gallery | packs 5–6, s2 Saffa Knifewind at the end |
| Embalmers' Walk | 10×30 | S3, packs 7–8 |
| Hall of Mirrors | 20×20, 4 rotatable mirror stands, one sun-slot in the roof | pack 9 |
| Sethar's Sun Vault | 34×34, 4 standing mirrors at the corners, sun-slot above the throne | END King Sethar |
| The Sun Door | 30×30, all-glass room | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_undead_glass_mummy` | Glass-Wrapped Dead | chibi2 undead, linen wraps studded with glass | 1.2 | **Shard Wrap** melee 6 %HP; on death bursts shards in a 3 m circle (1.5 s, 10 %HP). |
| `m_undead_tomb_attendant` | Tomb Attendant | chibi2 undead, gold collar, oil jar | 0.9 | **Anoint** (i) 2.5 s: heals an ally 30% and gives it +20% damage 10 s. |
| `m_undead_sun_priest_husk` | Sun-Priest Husk | chibi2 undead, sun-disc headdress | 1 | **Sunflare** (i) 2.0 s: yellow **targeted** 4 m, 16 %HP + blind 2 s. |
| `m_construct_glass_sentinel` | Glass Sentinel (elite) | creature golem ×1.8, clear glass with a gold core | 3.5 | **Refract**: red line 2 m × 22 m from its chest, 2.0 s, 25 %HP. Takes 50% less damage from light/holy. |
| `m_elemental_prism_shard` | Prism Shard | creature shard ×1.3, clear with rainbow edges | 0.6 | **Prism Beam**: thin red line 1 m × 18 m, 1.5 s, 12 %HP. |
| `m_beast_dune_scarab` | Dune Scarab | creature beetle ×0.8, gold | 0.3 | swarms of 8; **Nibble** 2 %HP. |
| `m_beast_glasstail_skitterer` | Glasstail Skitterer | creature spider ×1.3, sand colour, glass-tipped tail (new feature `stinger`, §20) | 1 | **Sting** 8 %HP + poison 1.5 %HP a second 6 s (dispellable). |
| `m_humanoid_dunecutter_cutthroat` | Dunecutter Cutthroat | chibi2 human, desert wraps, curved knives | 1 | **Blind Sand**: 5 m cone, 1.5 s, blind 2 s; **Backstab** +100% from behind. |
| `m_humanoid_dunecutter_sandcaller` | Dunecutter Sandcaller | chibi2 human, veil, staff | 0.9 | **Sand Lash** 30° cone 10 m, 1.5 s, 12 %HP; **Grit Storm** 5 m **void zone** 12 s, 3 %HP / 0.5 s. |
| `m_beast_tomb_asp` | Tomb Asp | creature snake ×1.8, gold and black | 1 | **Spit**: 8 m line, 1.2 s, blind 3 s. |

| # | Room | Pack |
|---|---|---|
| 1 | Hall of Attendants, near | 3 Glass-Wrapped Dead + 1 Tomb Attendant |
| 2 | Hall of Attendants, middle | 2 Prism Shards + 1 Glass Sentinel |
| 3 | Hall of Attendants, far | 2 Sun-Priest Husks + 2 Glass-Wrapped Dead + 8 Dune Scarabs |
| 4 | Antechamber | 2 Tomb Asps + 2 Glasstail Skitterers |
| 5 | Robbers' Gallery, camp | 3 Cutthroats + 1 Sandcaller |
| 6 | Robbers' Gallery, loot pile | 2 Sandcallers + 2 Cutthroats (they flee to s2 at 30%) |
| 7 | Embalmers' Walk, near | 2 Tomb Attendants + 2 Glass-Wrapped Dead + 1 Sun-Priest Husk |
| 8 | Embalmers' Walk, far | 1 Glass Sentinel + 2 Prism Shards |
| 9 | Hall of Mirrors | 2 Glass Sentinels (elite pair) |

### Sub-bosses

#### s1 · `b_gilded_brood_mother` — The Gilded Brood-Mother

Body: creature beetle ×3.6, burnished gold. Health 28 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Mandible | melee | — | 11 %HP | — |
| Brood Burst | 10 Dune Scarabs from the sand | 1.5 s (sand boils) | — | area damage |
| **Gilded Carapace** | every 20 s, 6 s: reflects 50% of spell damage back at the caster (gold shimmer) | 1.5 s | — | casters stop, melee keep hitting |

**Loot:** `it_gilded_chitin_vest` (light chest), `it_scarab_clasp` (neck), `uq_brood_mothers_gilt` **[D-EXCL]** — trinket: +8% damage against enemies with a damage-reflect aura; you take no reflected damage for 3 s after using a dodge roll.

#### s2 · `b_saffa_knifewind` — Saffa Knifewind, Dunecutter Chief

Body: chibi2 human (woman) ×1.4, red desert wraps, a pair of hooked knives and a bandolier of smoke pots. Health 28 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Hooked Knives | melee, applies bleed 1 %HP a second 6 s | — | 9 %HP | — |
| **Knife Fan** | 5 red lines 1 m × 16 m in a 90° fan | 1.8 s | 18 %HP each | stand between lines or behind her |
| Smoke Pot | 6 m grey cloud, she vanishes 3 s and reappears behind a random player | 1.5 s | next hit +100% | face-check: the healer keeps the marked player topped |
| Tripwire | 3 red **lines** 1 m × 10 m placed as traps, last 30 s, trigger when crossed | 1.5 s | 20 %HP + root 2 s | step over them only with a dodge roll |

**Dialog opportunity — "Share the loot"** (at 25%): "Half the tomb's gold is yours if you walk away!" · "Deal." → she runs, dropping `it_dunecutter_share` (a bag worth 60 gold per player) and **no** gear. · "No." → fight on.
**Loot:** `it_hooked_knife` (dagger), `it_knifewind_wraps` (light legs), `uq_saffas_bandolier` **[D-EXCL]** — waist: after you dodge roll, drop a smoke pot: allies inside (4 m, 3 s) are 30% harder to hit.

### Main bosses

#### B1 · `b_orrun_the_glassblower` — Orrun, the Glassblower

| Field | Value |
|---|---|
| Body | chibi2 undead ×1.7, leather apron, glassblower's pipe with a glowing gob of glass on the end |
| Health | 72 H |
| Phases | 100–50% · 50–0% (two sun-slots open: two beams) |
| Teaches | **beams and mirrors** |
| Enrage | 6:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Pipe Swing | all | melee on tank | — | 12 %HP | — |
| **Sunlance** | all | a sun-slot in the roof throws a beam down onto the floor that runs as a red **line** 2 m wide across the room; it **bounces** off every glass mirror in its path. The beam's full bounced path is drawn 2 s ahead | 2.0 s, then persists 8 s | 8 %HP every 0.5 s in the beam | stay off the drawn path. Kill or step behind a mirror to change the path |
| **Blow Mirror** | all | he blows a **glass mirror** (a 0.6 H construct, 2 m wide) and sets it on the floor, angled at the group | 1.5 s | — | break mirrors that bounce the beam into the group; keep ones that bounce it into him (**the beam hurts him too**: 2% of his health a second) |
| Molten Gob | all | lobbed at a player: 3 m **void zone** of molten glass, 20 s | 1.8 s | 4 %HP / 0.5 s | move |

**Dialog:** pull — "Hold still. I need something to look through." · Sunlance ⚠ — "Let there be light." · Blow Mirror ⚠ — "Another pane." · death — "Clear... at last..."
**Heroic:** mirrors are 1.2 H; the beam lasts 12 s. **Mythic+:** Molten Gob pools cool into glass mirrors after 20 s (more bounces).
**Loot:** `it_glassblowers_pipe` (staff), `it_furnace_apron` (medium chest), `set_sunglass_regalia` piece (hands), `uq_orruns_first_pane` **[D-EXCL]** — off-hand: 20% of beam and line damage you take is reflected at the nearest enemy.

#### B2 · `b_queen_ammarel` — Queen Ammarel of the Second Glass

| Field | Value |
|---|---|
| Body | chibi2 undead (woman) ×1.9 in a gown of glass scales, a tall sun-crown, a hand mirror |
| Health | 80 H |
| Phases | 100–60% · 60–25% (dialog opportunity at 60%) · 25–0% |
| Teaches | **checkerboard** (half the floor tiles light at once) and **cross** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Glass Slap | all | melee on tank | — | 12 %HP | — |
| **Court Dance** | all | **checkerboard**: every other 5 m floor tile goes red | 2.5 s | 45 %HP on a red tile | stand on an unlit tile. Every 20 s; from P3 it flips once (the other half 2 s later) — step once |
| **Sun-Crown** | P2+ | red **cross** 4 m × 30 m arms centred on her | 2.0 s | 35 %HP | stand in the corners of the cross |
| Vanity | all | yellow **targeted** 4 m on the player **furthest** from her | 2.0 s | 20 %HP + charmed 2 s (walks toward her) | the furthest player stays clear of others |

**Dialog opportunity — "Am I still beautiful?"** (at 60% she lifts her hand mirror; combat pauses up to 20 s):

| Reply | Result |
|---|---|
| "As the day you were sealed." | she smiles; **skips phase 2** (jumps to 25%-mode at her current health; no Sun-Crown until 25%) |
| "You're dust in a glass dress." | +15% damage for the rest of the fight |
| "Look for yourself." *(needs `uq_orruns_first_pane` equipped by any player, or a Mirror from B1 carried — pick up a broken mirror shard in the Blowing House, `it_mirror_shard`)* | she looks — and **cracks**: loses 10% of her health, Court Dance slowed to every 30 s |

**Dialog:** pull (banner) — "Kneel for your queen. The floor will tell you where." · Court Dance ⚠ — "Dance with me!" · Sun-Crown ⚠ — "Bow to the four corners." · death — "Don't... look at me..."
**Heroic:** Court Dance's safe tiles shrink by one (an unlit tile also goes red at random). **Mythic+:** the flip happens 1.5 s after the first half.
**Loot:** `it_glass_scale_gown` (cloth chest), `it_ammarels_hand_mirror` (off-hand), `set_sunglass_regalia` piece (helm), `uq_second_glass_crown` **[D-EXCL]** — helm: +6% movement speed; while you stand still for 1 s, +6% damage (lost when you move).

#### END · `b_king_sethar_unshattered` — King Sethar the Unshattered

| Field | Value |
|---|---|
| Body | chibi2 undead ×2.4 in plate of glass over gold, a glass sword 3 m long, a sun-slot above his throne |
| Health | 125 H |
| Phases | 100–70% · 70–40% (armour **shatters** into 4 Shard Guards) · 40–0% ("Unshattered": the 4 corner mirrors wake) |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Glass Sword | all | melee, 150° cleave in front | 1.2 s | 16 %HP (tank), 30 %HP to others in front | face away |
| **King's Light** | all | Sunlance from the throne slot, bouncing off the **4 corner mirrors** (which he turns 45° each cast; their new angles show 2 s ahead) | 2.5 s, then 10 s | 8 %HP / 0.5 s | read the drawn path |
| **Tile Decree** | all | checkerboard (as Ammarel) | 2.5 s | 45 %HP | unlit tiles |
| Shatter | P2 | armour bursts: 4 Shard Guards (2 H each, `m_construct_shard_guard`) | 2.0 s (cracks spread) | 15 %HP burst 6 m | kill guards; each guard killed in a beam dies at once |
| **Royal Cross** | P3 | red **cross** + checkerboard at the same time (the cross's arms run along tile rows) | 3.0 s | 45 %HP | find an unlit tile off the arms (there are always 4) |

**Dialog:** pull (banner) — "Who let the sun in? Who dares SEE me?" · King's Light ⚠ — "My light, my law." · Tile Decree ⚠ — "Stand where your king allows." · 70% (banner) — "Crack me, then. I have more glass." · 40% (banner) — "I AM UNSHATTERED!" · death — "Dark... it was so... dark..."
**Heroic:** Royal Cross's cross rotates 45° 1 s before landing (shown). **Mythic+:** Shard Guards reflect beams (they are mirrors too).
**Loot:** `it_glass_greatsword` (two-handed sword), `it_sunplate_pauldrons` (heavy shoulders), `it_kings_sun_disc` (neck), `set_sunglass_regalia` pieces (chest, legs), `uq_unshattered_vambraces` **[D-EXCL]** — heavy wrists: when an enemy hit would take more than 30% of your health, it takes 10% less (5 s cooldown). `leg_the_eleventh_century` **[D-EXCL]** — off-hand (focus or shield) legendary: every 12 s your next beam-, line- or cone-shaped spell bounces once off an invisible mirror at the end of its range and travels back.

### Secret boss — `b_ithar_the_unseen` — Prince Ithar, the Unseen

**Unlock (hidden puzzle):** in the **Hall of Mirrors**, the roof slot throws a beam onto the floor. Turn the 4 mirror stands
(hold **E**: rotate 45° per use) so the beam bounces through all four and ends on the sealed **Sun Door** in the east wall.
The answer is drawn on the **Antechamber lore tablet** (the angles are shown as arrows). Stands only turn out of combat.
It can be done any time before or after King Sethar; the door opens after Sethar dies.
Journal hint: *"Seven Glass Kings are carved on the outer seal. Six tombs were found."*

| Field | Value |
|---|---|
| Body | chibi2 elf-slender undead ×2.0, **invisible except where light touches him** (material `seen_in_light`, §20: drawn only inside beams and light radii; a faint shimmer elsewhere) |
| Health | 150 H |
| Phases | 100–60% · 60–30% · 30–0% |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Unseen Cut | all | melee on tank | — | 14 %HP | — |
| **Bring the Light** | all | the party carries **4 Sun Lamps** (pick-ups at the door; carrying slows 10%) — where a lamp's 5 m light touches him, he is visible and takes +100% damage; outside it he takes −50% | — | — | lamp carriers stay near him and near the tank |
| Snuff the Lamps | all | targets a lamp carrier: yellow **targeted** 4 m | 2.5 s | 25 %HP + the lamp goes dark 8 s | carrier leaves the group, others cover |
| Mirror Step | all | vanishes; reappears at a random mirror, casting **Glassrain**: 6 m red circle at that mirror | 2.0 s | 40 %HP | leave the mirror |
| Checker Night | P2+ | checkerboard where the safe tiles are **only the lit ones** (under lamps) | 3.0 s | 55 %HP | lamp carriers spread to light safe tiles |
| Seventh Cross | P3 | red **cross** that moves with him | 2.5 s | 40 %HP | corners |

**Dialog:** pull (banner, whisper) — "My brother kept the light. I kept everything else." · Snuff ⚠ — "Close your eyes." · death — "Now... you've seen me..."
**Loot:** `it_unseen_princes_wraps` (light chest), `it_lamp_of_tamar` (light slot), `uq_seventh_kings_signet` **[D-EXCL]** — ring: +8% damage while you are inside any light radius; +8% dodge chance while you are outside one. **`leg_the_unseen_prince` [SECRET] [D-EXCL]** — back (cloak) legendary: after 3 s without taking damage you become **unseen** (enemies further than 8 m lose you); your first attack from unseen deals +60%.

### Set dropped here

`set_sunglass_regalia` — Sunglass Regalia (4 pieces: hands, helm, chest, legs; cloth). Brief: 2 = +10% light radius and +5% holy damage, 4 = standing in a beneficial zone doubles its effect on you.

---

## d06 — Vault of the Sandsworn

### Card

| Field | Value |
|---|---|
| id | `d06_sandsworn_vault` |
| Region | Sunscar Barrens (`sunscar`) |
| Levels | 22–24 (opens at 21) · Heroic 60 · Mythic+ 60 |
| Looks | `vault` (reuse; recoloured sand-gold, §20 `vault_sand`), `hoard` for the treasury |
| Entrance | **the Dry Well** in the Oasis of Tamar's old quarter: a spiral stair inside a well that has not held water in 300 years |
| Quest giver | `npc_vaultkeeper_hadim_sar`, Sandsworn vaultkeeper, the Oasis Treasury |
| Story quest | `q_the_vault_wakes` — "The Vault Wakes": the Dunecutters tunnelled into the vault and woke its wardens; stop both |
| Run time target | Normal 25 min · Heroic 26 min · Mythic+ par **32:00** |
| Ember Shrines | Well Foot · after the Scales of Tamar · after Qassar |
| Forces needed | ≈ 92 F |
| New lessons | **dispel** (remove a curse from an ally), **puzzles under pressure** (plates, weights, levers mid-fight), **pushback walls** |

### Story hook

The Sandsworn keep their oath-gold, their charters and their founder under the oasis, in a vault that defends
itself. Qassar the Silver-Tongued — the brains behind the Dunecutters — dug in from the dunes. His robbers
tripped the **vault wardens**, and the wardens do not tell a thief from a Sandsworn. Now the oasis's founding oath
is in Qassar's hands and the wardens are waking the Sand Sovereign, who was bound to guard the vault and never
to leave it.

### Layout

```
                  ? Founder's Crypt (secret: riddle door + hidden lever under the Coffer)
                             |
     [B3] SOVEREIGN'S HALL (end)    Riddle Face (stone face in the wall)
                             |
                     (S3) Oathroom
                             |
  [s2] Hask's Tunnel ==== [B2] QASSAR'S COUNTING ROOM
                             |
                           (S2)
                             |
    Treasury [s1] ---- [B1] HALL OF THE SCALES
                             |
                      Warden Gallery (moving walls)
                             |
                        Charter Stacks
                             |
                   (S1) Well Foot  <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Well Foot | 12×12 | S1, Keystone Font |
| Charter Stacks | 26×20, shelves | packs 1–2 |
| Warden Gallery | 10×50; 3 **pushing walls** slide across it on a 12 s cycle (red floor stripe 2 s before each) | packs 3–4 |
| Hall of the Scales | 30×26, two great weighing pans (8 m) in the floor | B1 the Scales of Tamar |
| Treasury | 20×20, coin heaps | s1 the Coffer That Counts (optional); a warded chest (never a mimic here) |
| Qassar's Counting Room | 28×24 | B2 Qassar; S2 at the door |
| Hask's Tunnel | 6×40, dug sand tunnel | packs 5–6, s2 Hask (optional) |
| Oathroom | 14×18 | S3, pack 7 |
| Sovereign's Hall | 36×36, four sand-falls from the roof | END the Sand Sovereign; the **Riddle Face** in the north wall |
| Founder's Crypt | 24×24 | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_construct_vault_warden` | Vault Warden (elite) | creature golem ×2.0, brass and sandstone, key-shaped head | 3.5 | **Lockdown**: 6 m red circle, 2.0 s, 20 %HP + rooted 2 s. **Seal**: +50% armour when another warden is within 10 m. |
| `m_construct_brass_scarab` | Brass Scarab | creature beetle ×1.0, brass (construct) | 0.4 | **Drill** 4 %HP; in groups of 6; explode on death 2 m, 1 s, 6 %HP. |
| `m_elemental_sand_wraith` | Sand Wraith | creature wraith ×1.3, sand-coloured, dissolving hem | 1 | **Scour** 20° cone 8 m, 1.5 s, 12 %HP. Physical damage −30% against it. |
| `m_elemental_dust_devil` | Dust Devil | creature elemental ×1.0, whirl of sand (new `whirl` variant, §20) | 0.8 | moves on its own at 3 m/s as a 3 m **void zone**, 3 %HP / 0.5 s, knockback 4 m on touch. |
| `m_humanoid_dunecutter_tunneler` | Dunecutter Tunneler | chibi2 human, goggles, shovel | 1 | **Undermine**: 4 m red circle, 2.0 s, 14 %HP + knocked down. |
| `m_humanoid_dunecutter_hexblade` | Dunecutter Hexblade | chibi2 human, silver-inlaid scimitar | 1 | **Silver Curse**: a **curse** on a player — −30% healing received, 12 s (**dispel** it). Melee 7 %HP. |
| `m_humanoid_dunecutter_sandcaller` | Dunecutter Sandcaller | (as d05) | 0.9 | as d05 |
| `m_beast_vault_asp` | Vault Asp | creature snake ×1.6, black and gold bands | 1 | **Coil**: roots a player 2 s; **Venom** 1.5 %HP a second 8 s (dispellable poison). |
| `m_aberration_coin_mimic` | Coin Mimic | creature mimic ×1.1, coin-heap shape | 1.5 | disguised as a coin pile; wakes when looted: **Gulp** 18 %HP + holds the player 2 s. (The only mimics are these, and they glint green on a second look — a light spell reveals them.) |

| # | Room | Pack |
|---|---|---|
| 1 | Charter Stacks, west | 2 Vault Wardens (elite pair — pull one away from the other) |
| 2 | Charter Stacks, east | 3 Tunnelers + 1 Hexblade + 6 Brass Scarabs |
| 3 | Warden Gallery, near | 2 Sand Wraiths + 2 Dust Devils |
| 4 | Warden Gallery, far | 1 Vault Warden + 2 Hexblades |
| 5 | Hask's Tunnel, near | 3 Tunnelers + 1 Sandcaller |
| 6 | Hask's Tunnel, far | 2 Vault Asps + 2 Hexblades |
| 7 | Oathroom | 1 Vault Warden + 2 Sand Wraiths + 2 Coin Mimics (among 5 coin piles) |

### Sub-bosses

#### s1 · `b_coffer_that_counts` — The Coffer That Counts

Body: creature mimic ×2.8, a brass-bound strongbox with a tongue of coins. Health 30 H. Treasury (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Lid Snap | melee | — | 12 %HP | — |
| **Tally** | counts the gold each player carries; a yellow **targeted** 4 m circle on the richest | 2.5 s | 10 %HP + 2 %HP per 100 gold carried (cap 40 %HP) | the rich one spreads; nobody drops gold (you can't) |
| Coin Spray | 60° cone 12 m | 1.8 s | 18 %HP | out of the front |

**Dialog:** it counts aloud (numbers; a tinny voice). **After the kill:** it sat on a floor plate — a **hidden lever** (see Secret) is now reachable.
**Loot:** `it_counting_house_gloves` (light hands), `it_brassbound_buckler` (shield), `uq_the_coffers_tongue` **[D-EXCL]** — neck: +12% gold found; enemies that die within 3 s of your hit drop 10% more gold.

#### s2 · `b_hask_the_tunneler` — Hask the Tunneler

Body: chibi2 human ×1.5, huge goggles, a sand-auger. Health 28 H. Hask's Tunnel (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Auger | melee | — | 12 %HP | — |
| **Cave the Tunnel** | a red **moving wave** of falling sand runs down the 6 m tunnel from one end at 4 m/s | 2.0 s | 30 %HP + buried 2 s | dig into one of the 3 side alcoves (blue **safe zones**) as it passes |
| Blasting Charge | orange **soak** 3 m, **2 pips** | 3.5 s | 60 %HP to all if short | two players |

**Loot:** `it_sand_auger` (two-handed spear), `it_tunnel_goggles` (medium helm), `uq_hasks_lucky_shovel` **[D-EXCL]** — off-hand: dodge roll distance +2 m; rolling through a wave or wall gives +10% haste 3 s.

### Main bosses

#### B1 · `b_scales_of_tamar` — The Scales of Tamar

| Field | Value |
|---|---|
| Body | a construct: two 8 m bronze pans in the floor and a 7 m **beam** above with a **Sandsworn face** at the pivot (new prop `great_scales`, §20); the target is the face (hittable from either pan) |
| Health | 78 H |
| Phases | 100–50% · 50–0% (the scales tip faster; tolerance ±1) |
| Teaches | **puzzle under pressure** and **dispel** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Weigh the Guilty** | all | every 20 s the scales tip toward the heavier pan. Each player weighs 1 (**2** with a **Guilt** curse). The pans must be **within ±2** (P2: ±1) when the gong sounds | 4.0 s (gong rings, pans glow red on the heavy side) | a tipped scale sends a **room-wide** shock: 50 %HP to everyone, knockback | split the group across the pans by weight; a healer **dispels Guilt** to change someone's weight |
| **Guilt** | all | a **curse** on 1–2 players (purple chain icon) | — | weight 2, −10% damage | dispel (magic/curse dispel, page 05) — or keep it on purpose to balance |
| Beam Sweep | all | the beam swings low across one pan: red line 3 m × 8 m | 2.0 s | 30 %HP | step to the pan's rim |
| Sand Sentence | P2 | 2 Sand Wraiths drop onto the lighter pan | 1.5 s | — | kill (they count as weight 1 each!) |

**Dialog** (the face speaks, calm and formal): pull (banner) — "The vault weighs all who enter. Stand where your weight is true." · Weigh ⚠ — "The scales are called." · death — "Weighed... and found... sufficient."
**Heroic:** tolerance ±1 from the start; Guilt on 3 players. **Mythic+:** the pans swap sides (left becomes right) every other call.
**Loot:** `it_balance_keepers_mantle` (medium shoulders), `it_bronze_pan_shield` (shield), `set_oathkeeper_bronze` piece (chest), `uq_true_weight` **[D-EXCL]** — waist: while at least one ally stands within 10 m on each side of you (left and right), you deal +8% damage and take 5% less.

#### B2 · `b_qassar_silver_tongued` — Qassar the Silver-Tongued

| Field | Value |
|---|---|
| Body | chibi2 human ×1.6, silver-trimmed robes, a scroll case (the stolen Oath) at his hip, a silver rod |
| Health | 82 H |
| Phases | 100–60% · 60–30% (splits into 3 **Silver Echoes**, only one real) · 30–0% |
| Teaches | **dispel** under pressure and **pushback walls** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Silver Rod | all | melee | — | 11 %HP | — |
| **Silver Tongue** (i) | all | 2.5 s cast on a player: **charm** — the player attacks the party for 6 s | 2.5 s | the charmed player's own damage | interrupt; or **dispel** the charm |
| **Bribed Curse** | all | a curse on 2 players: they take +50% damage, 15 s | — | — | dispel within 5 s or a 6 m burst hits around them (20 %HP) |
| **Sand Wall** | all | a 3 m-thick red wall slides across the room from one side at 3 m/s; a gap (blue) 5 m wide somewhere in it | 2.0 s | 25 %HP + pushed with the wall | move to the gap |
| Silver Echoes | P2 | 3 copies; the real one's shadow **points at the sun-slot** (the others' shadows point elsewhere) | — | echoes die in 1 hit but each hit on an echo gives Qassar +5% damage | hit only the real one |

**Dialog opportunity — "Everyone has a price"** (at pull): "Fifty gold each and I'll forget you were here." · pay (50 gold each, all players must accept; a vote box) → he laughs, takes it, and **fights anyway** at −15% health ("I said I'd *forget*."). · refuse → normal. · *(Sandsworn reputation Honoured or above, page 07)* "The Sandsworn don't pay thieves." → the wardens join **you**: 2 Vault Wardens fight on your side for the fight.
**Dialog:** Silver Tongue ⚠ — "Surely we can come to an arrangement." · Sand Wall ⚠ — "Mind the wall, friend." · 60% (banner) — "Which one of me did you trust?" · death — "The Oath... was worth... more than you..."
**Heroic:** Silver Tongue cannot be dispelled (interrupt only). **Mythic+:** two Sand Walls from opposite sides, gaps offset.
**Loot:** `it_silver_rod_of_qassar` (wand), `it_silver_trimmed_robes` (cloth chest), `set_oathkeeper_bronze` piece (hands), `uq_the_stolen_oath` **[D-EXCL]** — trinket: use: dispel all curses from yourself and an ally within 20 m (60 s cooldown); passive +5% healing received.

#### END · `b_the_sand_sovereign` — The Sand Sovereign

| Field | Value |
|---|---|
| Body | creature elemental ×3.8, a torso of whirling sand from the waist up, arms of sandstone, a crown of bronze keys (a sand palette of `elemental`; new variant `sand`, §20) |
| Health | 128 H |
| Phases | 100–70% · 70–35% (the four sand-falls become **sandstorms**) · 35–0% ("The binding breaks") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Sandstone Fist | all | melee | — | 15 %HP | — |
| **Binding Curse** | all | curse on 1 player: **rooted**, 3 %HP a second; spreads to 1 ally within 5 m every 3 s | — | — | dispel it early, or the rooted player's neighbours step away |
| **Dune Wall** | all | 2 pushing walls from two sides (**P3**: three) | 2.0 s | 25 %HP + pushed into the sand-fall (a 4 m **void zone**, 5 %HP / 0.5 s) | gaps |
| Storm Eye | P2 | room-wide sandstorm (u), 3.5 s; **line of sight** behind the 4 bronze key-pillars | 3.5 s | 90 %HP | hide |
| **Oath of Binding** | P3 | orange **soak** 5 m, **4 pips** at his feet | 4.0 s | 100 %HP to all if short (one-shot) | four players (the tank + 3) |
| Dust Devils | P2+ | 2 Dust Devils every 25 s | 1.5 s | — | kite away from the group |

**Dialog:** pull (banner, a vast dry voice) — "Thieves and oath-keepers. The vault cannot tell you apart, and nor can I." · Dune Wall ⚠ — "The desert moves." · Storm Eye ⚠ (banner) — "Close your eyes, little ones." · 35% (banner) — "The oath is broken. I am free to bury you." · death — "Bind me... again. Please."
**Heroic:** Oath of Binding needs 5 pips (everyone). **Mythic+:** Binding Curse cannot be dispelled for its first 3 s.
**Loot:** `it_key_crown_of_the_sovereign` (medium helm), `it_sandstone_greatmaul` (two-handed mace), `it_bronze_key_ring` (ring), `set_oathkeeper_bronze` pieces (helm, legs), `uq_sovereigns_binding` **[D-EXCL]** — wrists: dispelling a curse from an ally gives both of you +10% damage for 6 s. `leg_the_unbound_dune` **[D-EXCL]** — boots legendary: every 10 s your next dodge roll leaves a 6 m-long **sand wall** behind you for 4 s that blocks enemy projectiles and pushes enemies 3 m.

### Secret boss — `b_tamar_the_first` — Tamar the First

**Unlock (riddle + hidden lever):** (1) kill the Coffer That Counts and pull the **hidden lever** it was sitting on (Treasury floor
plate, hold **E** 2 s; a click echoes through the vault). (2) After the Sand Sovereign dies, the **Riddle Face** in the north wall
asks one riddle (random from 6). A player picks one of 3 answers (dialog box); wrong → the face closes until the next run.

| Riddle (example set) | Right answer |
|---|---|
| "I am kept by giving me away. What am I?" | "An oath." |
| "Weigh me and I am nothing; lose me and you are nothing. What am I?" | "Your name." |
| "The more I dry, the wetter I am." | "A towel." |
| "I have no gold, yet all your gold is in me." | "A vault." |
| "The oasis drinks me, the desert eats me, the Sandsworn swear on me." | "Water." |
| "I was first in, and will be last out." | "The founder." |

Journal hint: *"The Coffer sits on something. The face in the wall wants to talk."*

| Field | Value |
|---|---|
| Body | chibi2 human ×2.0, mummified in gold wraps, a staff topped with a bronze water-drop |
| Health | 160 H |
| Phases | 100–65% · 65–30% · 30–0% ("The first oath") |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Staff | all | melee | — | 15 %HP | — |
| **Oath-Weight** | all | the scales mechanic again — 2 small pans (4 m) appear; ±1 | 4.0 s | 60 %HP room-wide if tipped | balance |
| Dry Wind | all | red **moving wave**, a wall of sand, with a gap | 2.0 s | 25 %HP | gap |
| **Water of Tamar** | all | a **beneficial** green pool 4 m appears for 6 s; standing in it **removes all curses** | 1.5 s | — | cursed players walk in (it is the dispel for classes without one) |
| Founder's Curse | P2+ | curse on 3 players: −50% healing, 20 s; spreads 6 m on dispel | — | — | move the cursed player away before dispelling, or use the Water |
| First Oath | P3 | orange **soak**, 5 pips | 4.0 s | 110 %HP to all if short | everyone in |

**Dialog:** pull (banner) — "You answered. Then you know what is owed." · Oath-Weight ⚠ — "Weigh yourselves." · death — "Keep it... better than we did..."
**Loot:** `it_founders_water_staff` (staff), `it_gold_wrapped_sandals` (light feet), `uq_first_oath_signet` **[D-EXCL]** — ring: +6% healing done; your heals remove one curse. **`leg_water_of_tamar` [SECRET] [D-EXCL]** — neck legendary: every 20 s, the next ally you heal below 40% health gets a 4 m **beneficial** pool under them for 5 s: +10% healing received and curse immunity.

### Set dropped here

`set_oathkeeper_bronze` — Oathkeeper's Bronze (4 pieces: chest, hands, helm, legs; medium armour). Brief: 2 = +10% curse resistance, 4 = when you are dispelled, gain +15% haste for 5 s.

---

## d07 — Thornheart Hollow

### Card

| Field | Value |
|---|---|
| id | `d07_thornheart` |
| Region | Whisperwood (`whisperwood`) |
| Levels | 25–28 (opens at 24) · Heroic 60 · Mythic+ 60 |
| Looks | `hollow` (reuse) with a blight tint (§20 `hollow_blight`: grey-violet moss, black thorns) |
| Entrance | **the Blackened Oak**, 3 km west of Silverbough: a great oak gone grey, its roots split open into a hollow wide enough to ride into |
| Quest giver | `npc_moonwell_warden_sefa_lin`, Moonwell Circle warden, Silverbough's Root Terrace |
| Story quest | `q_the_thorned_heart` — "The Thorned Heart": find why the forest's thorns are growing toward Silverbough |
| Run time target | Normal 26 min · Heroic 27 min · Mythic+ par **33:00** |
| Ember Shrines | Root Gate · after the Sporefather · after Orenn Thornbound |
| Forces needed | ≈ 96 F |
| New lessons | **spreading damage-over-time** (a DoT that jumps to nearby allies), **beneficial zones** (green: stand in for a buff/heal), **root tethers** |

### Story hook

Under the Blackened Oak lives **Wyllow**, a grove spirit the Moonwell Circle has tended for a thousand years. A
blight seed fell into her heart — nobody knows from where — and her thorns grew wild. The **Thornmane Packs**
moved in and now worship the thorns, feeding them. Warden Sefa Lin will not let the party kill Wyllow if there is
another way. There might be. There are also six **Saplings** in the hollow — Wyllow's young — and the Circle would
very much like them alive.

### Layout

```
                     ? The Gall Pit (secret: Wyllow spared + all 6 Saplings alive)
                              |
               [B3] THE HEART CHAMBER (end)
                              |
                       (S3) Moonroot Pool
                              |
  [s2] Packlord's Den ==== [B2] THE THORN ALTAR
                              |
                            (S2)
                              |
  [s1] Silkrot Nest ---- [B1] SPORE GARDEN
                              |
                        Briar Maze (thorn walls)
                              |
                        Rootway
                              |
                   (S1) Root Gate  <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Root Gate | 12×12 | S1, Keystone Font; Sapling 1 |
| Rootway | 8×44 | packs 1–2 |
| Briar Maze | 30×30 of 3 m thorn hedges (touching a hedge: 2 %HP + slow 20%) | packs 3–5; Sapling 2 |
| Spore Garden | 28×28, 4 clean springs | B1 the Sporefather; Sapling 3 |
| Silkrot Nest | 20×20, webbed | s1 the Silkrot Matriarch (optional) |
| The Thorn Altar | 26×26, Thornmane totems | B2 Orenn Thornbound; S2 at its door; Sapling 4 |
| Packlord's Den | 18×18 | s2 Rakka Bloodbriar (optional); Sapling 5 |
| Moonroot Pool | 14×14 | S3, pack 6 |
| The Heart Chamber | 34×34, a great heartwood in the centre, 4 moonroot pools at the edge | END Wyllow; Sapling 6 |
| The Gall Pit | 26×26, the blight's own root knot | secret boss |

**Saplings** (`npc_wyllow_sapling`, 6): knee-high tree-children (creature mushroom ×0.7 re-skinned as a sapling, §20),
non-hostile, 1 H each. **Players' area damage hurts them.** Clicking one (hold E 1 s) sends it to hide in the nearest
root for the rest of the run. A Sapling that dies wilts with a sound; the party frame counts "Saplings: 6/6".

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_beastkin_thornmane_mauler` | Thornmane Mauler | chibi2 beastkin (wolf-headed), thorn-wrapped arms | 1.2 | **Rend** 2 × 5 %HP + bleed 1 %HP a second 6 s. |
| `m_beastkin_thornmane_prowler` | Thornmane Prowler | chibi2 beastkin, lean, bone knives | 1 | **Pounce** from stealth: 12 %HP + knockdown 1 s. |
| `m_beastkin_thornmane_moonseer` | Thornmane Moonseer | chibi2 beastkin, antler headdress, thorn staff | 0.9 | **Thornbind** (i) 2.0 s: roots a player 4 s with a white **tether** to the ground (breaks when a teammate hits the root, 0.3 H). **Blight Mend** (i): heal 30%. |
| `m_beast_bramble_wolf` | Bramble Wolf | creature wolf ×1.4, thorns grown through the fur | 1 | **Thorn Coat**: melee attackers take 2 %HP per hit. **Bite** 6 %HP. |
| `m_beast_silkrot_spider` | Silkrot Spider | creature spider ×1.4, grey-violet | 1 | **Web Spit**: yellow **targeted** 3 m, 1.5 s, slow 50% 4 s. **Rot Bite**: **spreading** poison — 1 %HP a second; every 4 s jumps to 1 ally within 4 m. |
| `m_aberration_blight_sporecap` | Blight Sporecap | creature mushroom ×1.3, violet with grey spots | 0.8 | **Spore Puff**: 4 m cloud, 1.5 s, 3 %HP / 0.5 s for 6 s; the cloud **spreads** a Spore DoT to anyone passing through. |
| `m_aberration_strangle_vine` | Strangle Vine | creature snake ×2.4, green-black, rooted (does not move) | 1.2 | **Lash** 8 m reach, 10 %HP; **Constrict**: pulls a player in over 2 s (white **tether**) unless the vine is hit for 20% of its health. |
| `m_elemental_blight_wisp` | Blight Wisp | creature wisp ×1.1, sick green | 0.5 | explodes on death: 4 m **void zone**, 12 s, 3 %HP / 0.5 s. |
| `m_beast_carrion_moth` | Carrion Moth | creature moth ×1.6, brown | 0.6 | **Dust Wing**: blinds 2 s in a 5 m cone. |

| # | Room | Pack |
|---|---|---|
| 1 | Rootway, near | 3 Thornmane Maulers + 1 Moonseer |
| 2 | Rootway, far | 2 Bramble Wolves + 2 Prowlers (in stealth: shimmer visible at 10 m) |
| 3 | Briar Maze, north | 3 Blight Sporecaps + 2 Strangle Vines |
| 4 | Briar Maze, centre | 2 Maulers + 1 Moonseer + 2 Bramble Wolves |
| 5 | Briar Maze, south | 4 Silkrot Spiders + 4 Blight Wisps |
| 6 | Moonroot Pool | 2 Moonseers + 2 Maulers + 2 Carrion Moths |
| — | *patrol* Briar Maze | 1 Mauler + 2 Bramble Wolves, 45 s loop |

### Sub-bosses

#### s1 · `b_silkrot_matriarch` — The Silkrot Matriarch

Body: creature spider ×3.6, grey-violet, a blight-flower on her back. Health 32 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Fang | melee + Rot Bite (spreading poison) | — | 11 %HP | spread 4 m apart or the poison jumps |
| **Web Line** | white **tether** from a wall to a player, 4 s; if unbroken the player is cocooned 3 s (take 5 %HP a second) | 2.0 s | — | an ally hits the web line (0.5 H) or the player moves 18 m |
| Brood | 4 Silkrot Spiders from the ceiling | 1.5 s | — | cleave |

**Loot:** `it_silkrot_wraps` (cloth legs), `it_matriarch_fang` (dagger), `uq_web_of_the_matriarch` **[D-EXCL]** — back: your damage-over-time effects jump to 1 more enemy within 5 m when the target dies.

#### s2 · `b_rakka_bloodbriar` — Rakka Bloodbriar

Body: chibi2 beastkin ×1.8, packlord's thorn crown, a great briar-flail. Health 32 H. With 2 Bramble Wolves. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Briar Flail | 360° red circle 6 m | 2.0 s | 25 %HP + bleed | everyone out but the tank |
| **Blood Scent** | marks a player (red **marked** status): wolves and Rakka focus them 8 s | — | — | the tank taunts the wolves; the marked player kites |
| Howl of the Pack | +25% damage for each wolf alive, 10 s | 1.5 s | — | kill wolves first |

**Loot:** `it_packlords_thorn_crown` (medium helm), `it_bloodbriar_flail` (two-handed flail — page 08 check), `uq_scent_of_blood` **[D-EXCL]** — gloves: +10% damage against **marked** enemies; your critical hits mark the target for 4 s.

### Main bosses

#### B1 · `b_the_sporefather` — The Sporefather

| Field | Value |
|---|---|
| Body | creature mushroom ×4.2, violet cap with grey plates, a beard of hanging roots |
| Health | 84 H |
| Phases | 100–50% · 50–0% (two springs dry up) |
| Teaches | **spreading DoT** and **beneficial zones** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Cap Slam | all | melee on tank, 4 m | 1.2 s | 14 %HP | — |
| **Rot Spores** | all | a **spreading** DoT on 2 players: 2 %HP a second, 20 s; every 3 s it jumps to every ally within 6 m | — | as it spreads | infected players stay 6 m apart and walk to a spring |
| **Clean Spring** | all | 4 green **beneficial** 3 m zones at the springs, always on; standing in one for 2 s **cleanses** Rot Spores and heals 3 %HP a second | — | — | use them; P2 only 2 springs remain |
| Spore Burst | all | 5 m red circle on a random spring | 2.0 s | 30 %HP | the burst blocks that spring for 10 s — go to another |
| Mycelium | P2 | 3 Blight Sporecaps grow every 30 s | 1.5 s | — | kill them before they puff |

**Dialog** (a slow, creaking voice): pull — "Grow... with us..." · Rot Spores ⚠ — "Share... the gift..." · death — "Compost... is... a kind of... life..."
**Heroic:** springs cleanse after 3 s; Rot Spores on 3 players. **Mythic+:** a spring used 3 times rots into a **void zone** for 20 s.
**Loot:** `it_sporefather_cap` (cloth helm), `it_rootbeard_cord` (waist), `set_thornwarden_bark` piece (legs), `uq_mycelial_ring` **[D-EXCL]** — ring: your damage-over-time effects tick 10% faster; when one of them jumps, it heals you 1% of max health.

#### B2 · `b_orenn_thornbound` — Orenn Thornbound, the Moonseer

| Field | Value |
|---|---|
| Body | chibi2 beastkin ×2.0, grey-furred, antler headdress grown through with thorns, a staff of living briar |
| Health | 88 H |
| Phases | 100–60% · 60–30% (thorn totems) · 30–0% ("The thorn answers") |
| Teaches | **root tethers** (white lines that hold you to the ground) |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Briar Staff | all | melee | — | 12 %HP | — |
| **Rootchain** | all | white **tethers** from the ground to 2 players: rooted; 3 %HP a second | 1.5 s | as listed | a **different** player breaks a tether by standing on its root (hold E 0.5 s) — it cannot be broken by the rooted player |
| **Thornlink** | P2+ | white **tether** between 2 players: while **more than 10 m** apart, both take 5 %HP a second — this one you **keep close** | 2.0 s | — | the pair walks together (the opposite of d02's rule; the line glows green when they're close enough) |
| Thorn Totems | P2 | 3 totems (1.5 H) that heal Orenn 2% a second each | 1.5 s | — | kill totems |
| Moonseer's Curse | all | yellow **targeted** 5 m on 1 player | 2.5 s | 25 %HP + roots everyone inside 2 s | spread |

**Dialog opportunity — "The Moonseer's doubt"** (at 30%): "The thorn spoke to me... Did it lie?" · "It lied. Wyllow is dying." → Orenn **stops**; the fight ends as a win; he gives `it_orenns_moon_charm` which lets the party **reach Wyllow's mind** in the end fight (one of the two conditions for sparing her, see END). · "The thorn will die with you." → fight on, loot as normal, no charm.
**Dialog:** pull (banner) — "The Heart is growing. Kneel and be planted." · Rootchain ⚠ — "Hold them, roots." · Thornlink ⚠ — "Walk together, or bleed apart." · death — "The moon... is dark... here..."
**Heroic:** Rootchain on 3; totems 2.5 H. **Mythic+:** each broken Rootchain drops a 3 m bramble **void zone** for 10 s.
**Loot:** `it_briar_staff_of_the_seer` (staff), `it_thornbound_antlers` (medium helm), `set_thornwarden_bark` piece (chest), `uq_thornlink_band` **[D-EXCL]** — ring: when an ally within 8 m takes a hit over 20% of their health, you take 10% of it instead and they take 10% less.

#### END · `b_wyllow_blighted_heart` — Wyllow, the Blighted Heart

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.8 made of bark and leaves (new material `bark_skin`, §20), grey-violet blight veins, rooted to the heartwood by thorn cables |
| Health | 132 H |
| Phases | 100–70% · 70–40% (the blight spreads: 4 Blight Seeds on the heartwood) · 40–0% (**dialog**: kill her or cleanse her) |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Thornlash | all | 90° red cone 8 m | 1.8 s | 18 %HP (tank) / 30 %HP (others) | face away |
| **Blight Bloom** | all | a **spreading** DoT (as Rot Spores) on 2 players | — | 2 %HP a second | moonroot pools (green **beneficial**, the 4 edge pools) cleanse |
| **Root Snare** | all | white **tethers** on 2 players (as Rootchain) | 1.5 s | 3 %HP a second | a teammate breaks the root |
| Blight Seeds | P2 | 4 seeds (2 H each) on the heartwood; each alive gives Wyllow +10% damage | — | — | kill seeds — **carefully**: any area damage near Sapling 6 hurts it |
| Thorn Forest | P2+ | 6 red circles 4 m sprout, then become 4 m thorn thickets (**void zones**) for 20 s | 2.0 s | 30 %HP, then 4 %HP / 0.5 s | move; don't get boxed in |
| **Heartwood Pulse** | P3 (if fought) | room-wide (u) 4 s; **safe zones** = the moonroot pools | 4.0 s | 100 %HP | pools |

**The choice (at 40%)** — she sinks to her knees, the blight veins pulse; combat pauses up to 25 s:

| Reply | Result |
|---|---|
| "End it." | she fights on to 0% (P3 as above). Normal loot. |
| "We'll burn the blight, not you." *(needs `it_orenns_moon_charm` from B2's dialog)* | **Cleanse phase** (40% → 0% becomes a new bar, "Blight"): Wyllow stops attacking; 6 **Blight Knots** (3 H each) appear on her thorn cables and must be killed; healers must **heal Wyllow** (her bar is shown green, 0 → 100%) while the knots pulse room-wide 8 %HP every 3 s. Ends when all knots die and Wyllow is above 60% health. She lives, thanks the party, and gives the **same loot** plus `it_heartwood_seed`. |
| (no charm) "We'll burn the blight, not you." | "I can't hear you over the thorns..." — as "End it". |

**Dialog:** pull (banner, two voices over each other — hers and the blight's) — "Help me— / GROW." · Blight Bloom ⚠ — "It spreads... / SHARE IT." · Thorn Forest ⚠ — "Run— / STAY." · death — "Tell Sefa... the moon was... pretty..." · cleansed — "I can hear the forest again."
**Heroic:** cleanse needs Wyllow above 80%. **Mythic+:** Blight Knots respawn once if not all killed within 10 s of each other.
**Loot:** `it_heartwood_bow` (bow), `it_blighted_bark_mantle` (medium shoulders), `it_moonroot_band` (ring), `set_thornwarden_bark` pieces (helm, hands), `uq_wyllows_last_leaf` **[D-EXCL]** — neck: +8% healing done; your heals on an ally with a damage-over-time effect heal +20% more. `leg_blightbreaker` **[D-EXCL]** — gloves legendary: dispelling or cleansing a damage-over-time effect from an ally turns it around: it ticks on the nearest enemy instead, at 200%.

### Secret boss — `b_gall_sovereign` — The Gall Sovereign

**Unlock (dialog + mercy):** **cleanse Wyllow** (her 40% choice, which needs Orenn's moon charm) **and** keep **all 6 Saplings alive**
to the end. The cleansed Wyllow opens her roots: the Gall Pit below the heartwood, where the blight seed itself has grown.
Journal hint: *"Wyllow was the heart of the grove. Something else was the heart of the blight."*

| Field | Value |
|---|---|
| Body | creature horror ×3.4, a swollen violet-black gall with root-tentacles and a seed husk for a head |
| Health | 165 H |
| Phases | 100–65% · 65–30% · 30–0% ("Germinate") |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Gall Lash | all | 2 tentacles on the tank | — | 2 × 8 %HP | — |
| **Everblight** | all | spreading DoT on 3 players, jumps every 2 s within 6 m | — | 2.5 %HP a second | Wyllow (an ally NPC here, at the pit's edge) raises one green **beneficial** 4 m pool every 15 s — the only cleanse |
| Rootcage | all | white **tethers** on 2 players (break by teammate) | 1.5 s | 4 %HP a second | break |
| Seedfall | P2+ | checkerboard of 4 m cells, one colour red | 2.5 s | 45 %HP | unlit cells |
| **Germinate** | P3 | orange **soak** 5 m, **3 pips**, twice at once, opposite sides | 4.0 s | 100 %HP to all if either is short | split 3 / 2 + a cooldown |

**Dialog:** pull (banner, the blight's voice alone) — "She was a pot. You are a field." · Everblight ⚠ — "Share it." · death — "Something... will... fall again..."
**Loot:** `it_gall_husk_helm` (heavy helm), `it_everblight_scythe` (two-handed polearm), `uq_seed_of_the_sovereign` **[D-EXCL]** — trinket: use: plant a seed at a target; after 3 s it bursts in a 5 m spreading DoT (40% spell power a second, 8 s), 60 s cooldown. **`leg_wyllows_gratitude` [SECRET] [D-EXCL]** — off-hand focus legendary: every 15 s, the next ally you heal gets a 3 m **beneficial** root-pool under them for 6 s that cleanses one damage-over-time effect a second.

### Set dropped here

`set_thornwarden_bark` — Thornwarden's Bark (4 pieces: legs, chest, helm, hands; medium armour). Brief: 2 = +15% resistance to poison and bleed, 4 = standing in a beneficial zone gives your hits +10% damage.

---

## d08 — Ruins of the Moonwell

### Card

| Field | Value |
|---|---|
| id | `d08_moonwell_ruins` |
| Region | Whisperwood (`whisperwood`) |
| Levels | 28–30 (opens at 27) · Heroic 60 · Mythic+ 60 |
| Looks | `ruin` (reuse) with silver-white trim (§20 `ruin_moon`), a pale blue fog |
| Entrance | **Lirath Isle** in Mirrorlake, 5 km north of Silverbough: a white stair out of the water to a broken moonwell dome. A moonlit ferry from Silverbough takes you there (page 01). |
| Quest giver | `npc_moonsinger_aethe_varn`, Moonwell Circle singer, Silverbough |
| Story quest | `q_the_cracked_well` — "The Cracked Well": find what drank the old moonwell dry |
| Run time target | Normal 27 min · Heroic 28 min · Mythic+ par **34:00** |
| Ember Shrines | White Stair · after the Twin Wardens · after Archmage Ilvandor |
| Forces needed | ≈ 100 F |
| New lessons | **donut** (the safe hole in the middle), **light/dark phases** (the Moon Clock), **shared-health twins** |

### The Moon Clock (dungeon-wide, new)

A silver dial over every boss frame and in the corner of the HUD cycles **Moonlit (45 s) → Moonless (45 s)**, always,
from the moment the party enters. In **Moonlit** monsters of the well (wisps, sentinels) are stronger (+20% damage) and
**Moonless** monsters (horrors, eyes) weaker; in **Moonless** it reverses. Bosses change abilities by phase of the clock.
Moonshards (see Secret) are only visible in Moonless.

### Story hook

The elves of Lirath built a well that held moonlight like water. When it cracked six hundred years ago, the elves left and
the Circle sealed the isle. Now the lake glows at the wrong times and the fish swim upside down. Moonsinger Aethe has
heard singing from the isle that is not an elf's. Something came up through the crack and drank the moon, and it is
still thirsty.

### Layout

```
                          ? The Drowned Moon (secret: 5 moonshards + end boss killed in Moonlit, Heroic/Normal any)
                                    |
                [B3] THE WELL'S THROAT (end)
                                    |
                          (S3) Stargazers' Terrace
                                    |
  [s2] Huntress' Gallery ==== [B2] THE ARCHMAGE'S STUDY
                                    |
                                  (S2)
                                    |
      Owlry [s1] ---------- [B1] SUN-AND-MOON COURT
                                    |
                          Hall of Reflections
                                    |
                          Silver Colonnade
                                    |
                     (S1) White Stair <-- entrance (ferry dock)
```

| Room | Size (m) | Holds |
|---|---|---|
| White Stair | 14×10 | S1, Keystone Font |
| Silver Colonnade | 10×48, open to the sky | packs 1–2; moonshard 1 (on a toppled column top) |
| Hall of Reflections | 24×24, a still pool floor | packs 3–4; moonshard 2 (under the water, only in Moonless) |
| Sun-and-Moon Court | 30×30, a gold half and a silver half | B1 the Twin Wardens |
| Owlry | 18×18, tall | s1 Gloamwing (optional); moonshard 3 in a nest |
| The Archmage's Study | 26×24, bookcases, a star-map floor | B2 Ilvandor; S2 before it |
| Huntress' Gallery | 12×40 | packs 5–6; s2 Caelith at the end; moonshard 4 behind her target dummy |
| Stargazers' Terrace | 16×16 | S3, pack 7; moonshard 5 in the telescope's eyepiece |
| The Well's Throat | 36×36 round, the cracked well in the middle (a pit, 10 m) | END Oruvel |
| The Drowned Moon | 34×34, under the well, underwater-looking (no swimming; a water-light shader) | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_undead_moonwell_sentinel` | Moonwell Sentinel (elite) | chibi2 elf ghost ×1.6, silver plate, glaive (material `ghost_silver`, §20) | 3.5 | **Glaive Arc**: 180° red cone 6 m, 2.0 s, 25 %HP. **Moonward** (Moonlit only): +40% armour. |
| `m_undead_pale_huntress` | Pale Huntress | chibi2 elf ghost, longbow | 1 | **Silver Arrow**: red line 1 m × 30 m, 2.0 s, 18 %HP. |
| `m_undead_weeping_acolyte` | Weeping Acolyte | chibi2 elf ghost, robes | 0.9 | **Mourning Hymn** (i) 3.0 s: all enemies within 20 m heal 20%. |
| `m_elemental_moon_wisp` | Moon Wisp | creature wisp ×1.2, silver-white | 0.5 | **Moonbeam**: 1.5 s, 3 m red circle on a player, 12 %HP. Moonlit: casts twice. |
| `m_beast_silverwing_owl` | Silverwing Owl | creature owl ×1.8, white | 1 | **Dive**: 1.2 s swoop at a player, 10 %HP + knocked down. |
| `m_beast_lamp_moth` | Moonmoth | creature moth ×1.5, pale blue | 0.5 | swarms of 4; **Dazzle** 2 s blind in 4 m. |
| `m_aberration_starless_eye` | Starless Eye | creature horror ×0.9, one great eye, few tentacles | 0.8 | **Gaze**: a white **tether** to a player for 3 s; if unbroken (line of sight), 20 %HP + silence 2 s. Moonless: gaze twice as long. |
| `m_aberration_well_drinker` | Well-Drinker | creature horror ×1.6, silver-veined black | 1.8 | **Drink Light**: a 5 m **donut** (safe hole at its feet), 2.0 s, 20 %HP outside the hole — get **close**. |
| `m_elemental_moonshard_cluster` | Moonshard Cluster | creature shard ×1.2, silver | 0.7 | **Shatter**: on death 3 m, 1.5 s, 12 %HP. |

| # | Room | Pack |
|---|---|---|
| 1 | Silver Colonnade, near | 2 Pale Huntresses + 2 Moon Wisps + 1 Weeping Acolyte |
| 2 | Silver Colonnade, far | 1 Moonwell Sentinel + 4 Moonmoths |
| 3 | Hall of Reflections, rim | 2 Starless Eyes + 1 Well-Drinker |
| 4 | Hall of Reflections, pool | 3 Moonshard Clusters + 2 Moon Wisps + 1 Weeping Acolyte |
| 5 | Huntress' Gallery, near | 3 Pale Huntresses + 2 Silverwing Owls |
| 6 | Huntress' Gallery, far | 1 Moonwell Sentinel + 1 Weeping Acolyte + 1 Well-Drinker |
| 7 | Stargazers' Terrace | 2 Well-Drinkers + 2 Starless Eyes |

### Sub-bosses

#### s1 · `b_gloamwing` — Gloamwing

Body: creature moth ×4.0, dusk-blue wings with two eye-spots. Health 32 H. Owlry (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Wing Buffet | 90° cone 7 m | 1.5 s | 15 %HP + knockback | — |
| **Drawn to Light** | Moonlit: she flies to the brightest player (most light: torches, light spells) and **Dust Storms** there: 6 m red circle | 2.0 s | 30 %HP | that player douses their light / moves off; others step out |
| Moonmoths | Moonless: 6 Moonmoths | 1.5 s | — | cleave |

**Loot:** `it_gloamwing_mantle` (cloth shoulders), `it_eye_spot_charm` (neck), `uq_dusk_scale_cloak` **[D-EXCL]** — back: +10% dodge chance while you have no light source of your own.

#### s2 · `b_caelith_pale_huntress` — Caelith, the Pale Huntress

Body: chibi2 elf ghost (woman) ×1.7, longbow of moon-silver, a ghostly owl companion. Health 32 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Arrow | ranged on tank | — | 10 %HP | — |
| **Huntress's Mark** | **marked** on 1 player 6 s, then **Moonshot**: red line from Caelith through the marked player, 1 m × 40 m | 3.0 s | 60 %HP to everyone on the line | the marked player moves so nobody is between them and her, or behind them |
| Owl Dive | Silverwing Owl add dives the healer | 1.5 s | 12 %HP | kill the owl (2 H) |

**Loot:** `it_moonsilver_longbow` (bow), `it_huntress_quiver` (quiver — page 08), `uq_caeliths_last_arrow` **[D-EXCL]** — quiver: every 20 s, your next ranged attack pierces through every enemy in a 30 m line.

### Main bosses

#### B1 · `b_twin_wardens` — Sael and Nerith, the Twin Wardens

| Field | Value |
|---|---|
| Body | two chibi2 elf ghosts ×1.9: **Sael** in gold (sun half of the court), **Nerith** in silver (moon half) |
| Health | **shared** 96 H (one bar, two bodies) |
| Phases | 100–50% · 50–0% (they switch halves every Moon Clock turn) |
| Teaches | **shared-health twins** (keep them even) and the Moon Clock |
| Enrage | 6:30 |

**The twin rule:** damage to either lowers the shared bar, but if one twin has taken **more than 10%** more of the shared
damage than the other, the less-hurt twin gains **Resentment** (+10% damage a stack, every 3 s). The frame shows both
twins' shares as two pips on the bar.

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Sun Blade (Sael) | all | melee, gold | — | 13 %HP | a tank on each or both side by side (they must stand **within 8 m** of each other or both gain +30% damage — **tether**-like white line between them shows range) |
| Moon Blade (Nerith) | all | melee, silver | — | 13 %HP | — |
| **Dawn** (Sael, Moonlit) | Moonlit | gold half of the court goes red, room-half **danger zone** | 3.0 s | 60 %HP | be on the silver half |
| **Dusk** (Nerith, Moonless) | Moonless | silver half goes red | 3.0 s | 60 %HP | be on the gold half |
| Eclipse | P2 | a 12 m **donut** centred on each twin (safe hole 4 m at their feet) | 2.5 s | 40 %HP outside the holes | stack on either twin (split the party 3/2) |

**Dialog:** Sael — "The sun keeps the door." Nerith — "The moon keeps the key." · Dawn ⚠ (banner) — "Morning." · Dusk ⚠ (banner) — "Evening." · Eclipse ⚠ — "Come close, children." · death — "Together... then..."
**Heroic:** Resentment at 5%. **Mythic+:** Eclipse's holes shrink to 3 m.
**Loot:** `it_sunwarden_blade` / `it_moonwarden_blade` (one-handed swords; a matched pair), `set_moonsilver_vigil` piece (legs), `uq_twin_bond_band` **[D-EXCL]** — ring: +6% damage while an ally is within 5 m of you; if that ally also wears this ring, both of you gain +6% more.

#### B2 · `b_archmage_ilvandor` — Archmage Ilvandor

| Field | Value |
|---|---|
| Body | chibi2 elf ghost ×1.9, star-map robes, a floating ring of books |
| Health | 100 H |
| Phases | 100–66% · 66–33% · 33–0% (each phase adds a spell; he is trying to **repair the well** and fights the party because they are "in the diagram") |
| Teaches | **donut** |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Arcane Tap | all | ranged on tank | — | 12 %HP | — |
| **Moonfall** | all | a 16 m **donut** on the room centre, safe hole 5 m | 2.5 s | 45 %HP outside the hole | everyone into the middle |
| **Starfall** (Moonless) | all | reverse: 5 m red circle in the middle + 8 small red circles 2 m outside | 2.5 s | 45 %HP / 20 %HP | **leave** the middle — Moonlit: Moonfall, Moonless: Starfall. Watch the clock |
| Diagram Lines | P2+ | 3 red lines 2 m × 26 m along the star-map's constellations | 2.0 s | 30 %HP | step off the constellation lines (always drawn faintly on the floor) |
| Book Swarm | P3 | 4 flying tomes (0.8 H) cast **Silence** (i) 2.0 s each | 2.0 s | silences 4 s | interrupt / kill |

**Dialog opportunity — "The diagram"** (at pull he asks, without looking up): "Are you the variable I was missing?" · "Yes." → he treats the party as part of the spell: **Diagram Lines never target** the player who answered. · "No, we're here to stop you." → normal. · *(Chronomancer, Mage or Oracle)* "Your constant is wrong: the moon moves." → he pauses 10 s to recalculate; the fight starts at 90%.
**Dialog:** Moonfall ⚠ (banner) — "Into the well, all of you!" · Starfall ⚠ (banner) — "Out! Out of the well!" · death — "The sum... never... closed..."
**Heroic:** the clock flips 5 s **during** a cast once per phase (the donut becomes Starfall mid-cast: 1.5 s to react). **Mythic+:** Diagram Lines and Moonfall overlap.
**Loot:** `it_star_map_robes` (cloth chest), `it_floating_codex` (off-hand focus), `set_moonsilver_vigil` piece (helm), `uq_ilvandors_constant` **[D-EXCL]** — neck: your spells cost 5% less; every 5th spell costs nothing.

#### END · `b_oruvel_moon_drinker` — Oruvel, That Which Drank the Moon

| Field | Value |
|---|---|
| Body | creature horror ×4.0, black with silver veins, a mouth that is a hole of starlight, rising out of the cracked well |
| Health | 140 H |
| Phases | 100–65% · 65–30% (it drinks the room's light: the arena darkens) · 30–0% ("Thirst") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Tentacle Slam | all | melee | — | 16 %HP | — |
| **Drink the Moon** (Moonlit) | all | 18 m **donut** (safe hole 5 m at the well's lip under it) | 2.5 s | 50 %HP outside | stack at the lip |
| **Spit the Stars** (Moonless) | all | 10 yellow **targeted** 3 m circles on random spots + one on each player | 2.5 s | 25 %HP each | spread |
| Starless Eyes | all | 2 Starless Eyes every 30 s | 1.5 s | gaze tethers | kill or break line of sight |
| **Thirst** | P3 | a 5 m **void zone** of darkness under each player every 20 s (lasts 30 s) | 1.5 s | 4 %HP / 0.5 s | move to open floor |
| Swallow the Light | P2+ | the room's light shrinks; players' torches and light spells are the only light | — | — | light users stay spread to keep the floor visible |

**Dialog:** pull (banner, a whisper from everywhere) — "Thirsty. So thirsty." · Drink ⚠ — "Come to the edge. Drink with me." · Spit ⚠ — "Too bright. Too bright!" · 30% (banner) — "MORE." · death — "The moon... tasted... of..."
**Heroic:** Drink and Spit both happen in the same Moon Clock turn at the flip. **Mythic+:** Thirst pools grow 0.5 m every 5 s.
**Loot:** `it_silver_veined_staff` (staff), `it_starlight_maw_cowl` (light helm), `it_well_rim_ring` (ring), `set_moonsilver_vigil` pieces (chest, hands), `uq_moon_drinkers_tooth` **[D-EXCL]** — dagger: your hits in darkness (outside every light radius) deal +10% and heal 1% of damage dealt. `leg_the_thirst` **[D-EXCL]** — neck legendary: killing an enemy drinks its light: +3% damage for 10 s (max 10 stacks); at 10 stacks your next spell is a 10 m **donut** around you for 150% spell power.

### Secret boss — `b_the_drowned_moon` — The Drowned Moon

**Unlock (collect + timing):** pick up all **5 moonshards** (Colonnade column top, Hall pool bottom in Moonless, Owlry nest,
Huntress' target dummy, the telescope eyepiece — **each is only visible during Moonless**), then land the **killing blow on
Oruvel during Moonlit**. The shards fly into the well and the moon Oruvel drank comes back up — as something else.
Journal hint: *"Five pieces of the moon hide in the dark. Put it back while it's shining."*

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.6, a woman made of pale moonlight with water flowing off her (material `moonwater`, §20), no weapon |
| Health | 170 H |
| Phases | 100–66% (Waxing) · 66–33% (Full) · 33–0% (Waning) — the **Moon Clock stops** and her phases replace it |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Tide Touch | all | melee | — | 15 %HP | — |
| **Waxing Donut** | P1 | 20 m **donut**, safe hole 6 m; the hole **moves** 4 m once during the cast | 3.0 s | 55 %HP | follow the hole |
| Crescent | all | two red **crescent** cones (160°, 10 m) front and back | 2.0 s | 40 %HP | stand at her sides |
| **Full Moon** | P2 | room-wide (u) 4 s, **safe zones**: 3 blue 3 m rings where the moonshards landed | 4.0 s | 110 %HP | reach a ring (they rotate each cast) |
| Tidelink | P2+ | white **tether** pairs (keep within 8 m — green when close) | 2.0 s | 5 %HP a second if apart | pairs stay close |
| **Waning** | P3 | checkerboard + Crescent together | 3.0 s | 50 %HP / 40 %HP | unlit tiles at her sides |

**Dialog:** pull (banner) — "You put me back. I have been down there so long I forgot which way was up." · Full Moon ⚠ (banner) — "Look at me." · death — "Tell the elves... I'm home." (She does not die: she rises out of the dome; the loot chest is left where she stood.)
**Loot:** `it_moonwater_veil` (cloth helm), `it_tidelink_bracers` (cloth wrists), `uq_crescent_of_lirath` **[D-EXCL]** — off-hand: your cone and donut spells deal +12% damage. **`leg_the_moon_returned` [SECRET] [D-EXCL]** — ring legendary: you carry a personal Moon Clock (45 s / 45 s): Moonlit +12% healing done, Moonless +12% damage done; the ring glows to show which.

### Set dropped here

`set_moonsilver_vigil` — Moonsilver Vigil (4 pieces: legs, helm, chest, hands; cloth). Brief: 2 = +8% damage at night (world clock) and during Moonless, 4 = standing inside a donut's safe hole gives a barrier of 10% max health.

---

## d09 — The Warmaster's Pit

### Card

| Field | Value |
|---|---|
| id | `d09_warmasters_pit` |
| Region | Cinder Steppe (`cinder_steppe`) |
| Levels | 31–34 (opens at 30) · Heroic 60 · Mythic+ 60 |
| Looks | `warren` (reuse) for the pens, **arena** (new `pit_arena`: packed ash sand, bone-stake ring, tiered stands full of cheering orcs — §20) |
| Entrance | **the Ash Bowl**, a crater ringed with bone stakes 6 km north of Fort Ashfall; the Pit is dug into its floor. Drums can be heard from the fort. |
| Quest giver | `npc_captain_ren_harrowgate`, commander of Fort Ashfall |
| Story quest | `q_into_the_pit` — "Into the Pit": the Horde is making captured soldiers fight for sport. Get them out, and put the Warmaster down in his own sand |
| Run time target | Normal 28 min · Heroic 29 min · Mythic+ par **35:00** |
| Ember Shrines | Pen Gate · after Round One · after Round Two |
| Forces needed | ≈ 104 F |
| New lessons | **add waves**, **kiting** (keep a monster chasing you away from the group), **arena hazards**, **single combat** |

### The Crowd (dungeon-wide, new)

The three **Pit Rounds** (B1, B2, END) are fought in the arena in front of a crowd. A **Favour** bar (0–100, starts 50) sits
under the boss frame:

| Favour moves | By |
|---|---|
| a player dodge-rolls through a danger zone or telegraph | +2 |
| an add wave cleared within 15 s | +8 |
| a player dies | −15 |
| a player takes a hit from a red telegraph | −3 |
| nothing happens for 20 s | −5 ("Boring!") |

| Favour | The crowd throws |
|---|---|
| 70+ | a **Hunk of Meat** every 15 s: a green **beneficial** 2 m spot, pick up = heal 20 %HP + 10% damage 10 s |
| 30–69 | nothing |
| below 30 | **Rocks**: 3 red circles 3 m every 10 s, 1.5 s, 15 %HP |

### Story hook

Warmaster Drogath Ashmane rules the Cinder Steppe's war camps by one law: the strong fight, the weak watch. Every
week his Pit takes in captives — Fort Ashfall soldiers, Stonehide giants, beasts off the steppe — and sends out
corpses. Captain Harrowgate has lost eleven soldiers to it. He wants them freed and the Warmaster beaten in front
of his own Horde, because that is the only thing the Horde will believe.

### Layout

```
                             ? The Champions' Hall (secret: all 3 Rounds with 0 deaths)
                                      |
                    [B3] ROUND THREE: THE WARMASTER (arena floor)
                                      |
                              (S3) Warriors' Tunnel
                                      |
    Moat Cellar [s2] ==== [B2] ROUND TWO: THE RAZORBACK (arena floor)
                                      |
                                    (S2)
                                      |
    Beast Pens [s1] ==== [B1] ROUND ONE: THE CHAINED GIANT (arena floor)
                                      |
                              Prisoner Cages (free the captives)
                                      |
                              Holding Pens
                                      |
                       (S1) Pen Gate <-- entrance
```

The **arena floor** is one room (40×40, bone-stake ring, stands on all sides, two portcullises) used by all three Rounds;
the party is sent back to the tunnels between Rounds.

| Room | Size (m) | Holds |
|---|---|---|
| Pen Gate | 12×12 | S1, Keystone Font |
| Holding Pens | 30×20, cages | packs 1–3 |
| Prisoner Cages | 24×16 | pack 4; 8 **captives** (`npc_ashfall_captive`) — free each (hold E 1.5 s): +1% party damage each, and **Brannoc** in B1 recognises it |
| Beast Pens | 22×22 | s1 Ogra the Beastmaster (optional) |
| Moat Cellar | 20×20, water moat round a platform | s2 the Moatmother (optional) |
| Warriors' Tunnel | 8×30 | S3, pack 5 |
| Arena floor | 40×40 | B1, B2, END |
| The Champions' Hall | 30×30, trophies of every champion | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_orc_pit_fighter` | Pit Fighter | chibi2 orc, net and trident or axe and buckler | 1.2 | **Net Throw**: yellow **targeted** 3 m, 1.5 s, root 2 s. Melee 7 %HP. |
| `m_orc_blood_drummer` | Blood Drummer | chibi2 orc, war drum on its back | 1 | **War Beat**: +20% attack speed to all orcs within 20 m while drumming; **interrupt** stops it for 10 s (channel, gold border). |
| `m_orc_ashtusk_beastmaster` | Beast-Handler | chibi2 orc, goad and whip | 1 | **Goad**: a beast within 15 m gains +30% damage and speed 8 s (dispellable). |
| `m_beast_pit_hyena` | Pit Hyena | creature hyena ×1.4 | 0.8 | packs of 4; **Hamstring**: slow 30% 4 s. |
| `m_beast_war_boar` | War Boar | creature boar ×2.2, iron tusk caps | 2 | **Gore Charge**: red line 3 m × 18 m, 1.8 s, 25 %HP + knockback. |
| `m_beast_pit_saber` | Pit Saber | creature saber_cat ×1.6, scarred | 1.5 | **Fixate**: picks a non-tank, chases it 8 s (red **marked**): **kite** it; if it reaches the player, 20 %HP + bleed. |
| `m_beast_moat_croc` | Moat Crocodile | creature crocodile ×1.8 | 1.5 | **Drag**: grabs a player within 3 m of water, pulls them in: 6 %HP a second until hit for 10% of its health. |
| `m_giant_chained_brute` | Chained Brute (elite) | chibi2 giant ×1.2 in chains (a captive gone mad) | 4 | **Chain Swing**: 360° red circle 8 m, 2.5 s, 30 %HP. **Break Chains** at 50%: +30% speed. |
| `m_goblin_pit_bookmaker` | Pit Bookmaker | chibi2 goblin, ledger, a bag of caltrops | 0.6 | **Caltrops**: 3 m **void zone**, 15 s, 2 %HP / 0.5 s + slow. Runs to ring a gong (brings the next pack) — kill him first. |

| # | Room | Pack |
|---|---|---|
| 1 | Holding Pens, west | 3 Pit Fighters + 1 Blood Drummer |
| 2 | Holding Pens, middle | 1 Beast-Handler + 4 Pit Hyenas + 1 Pit Saber |
| 3 | Holding Pens, east | 1 Chained Brute + 2 Pit Bookmakers |
| 4 | Prisoner Cages | 2 Pit Fighters + 2 War Boars + 1 Beast-Handler |
| 5 | Warriors' Tunnel | 2 Blood Drummers + 3 Pit Fighters + 1 Chained Brute |

### Sub-bosses

#### s1 · `b_ogra_beastmaster` — Ogra the Beastmaster

Body: chibi2 orc (woman) ×1.7, bone goad, a necklace of claws. Health 34 H. Comes with 1 War Boar and 2 Pit Sabers. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Goad Strike | melee | — | 12 %HP | — |
| **Loose the Pack** | 4 Pit Hyenas every 25 s | 1.5 s (gate rattle) | — | area damage |
| **Sic 'Em** | a Pit Saber **fixates** a player (as the trash ability) for 10 s | — | 25 %HP if caught | kite in a circle round the pens |

**Loot:** `it_claw_necklace` (neck), `it_bone_goad` (one-handed spear), `uq_ogras_whistle` **[D-EXCL]** — trinket: use: every enemy beast within 15 m attacks the nearest other enemy for 5 s (90 s cooldown).

#### s2 · `b_the_moatmother` — The Moatmother

Body: creature crocodile ×3.8, scarred, a spear-head stuck in her back. Health 36 H. Moat Cellar (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Jaws | melee | — | 15 %HP | — |
| **Death Roll** | grabs the tank and rolls into the moat: 4 s, 8 %HP a second | 2.0 s | 32 %HP total | a second player pulls the spear-head (hold E 1 s on her back) to make her let go |
| Tail Sweep | 180° red cone behind her, 7 m | 1.5 s | 20 %HP + knocked into the moat | don't stand behind |

**Loot:** `it_moatmother_hide` (medium chest), `it_old_spear_head` (dagger), `uq_death_roll_bracers` **[D-EXCL]** — wrists: when you are held or stunned, gain a barrier of 10% max health (20 s cooldown).

### Main bosses

#### B1 · `b_brannoc_the_chained` — Round One: Brannoc the Chained

| Field | Value |
|---|---|
| Body | chibi2 giant ×1.8 (Stonehide), iron collar chained to the arena's centre post (18 m chain), stone knuckles |
| Health | 100 H |
| Phases | 100–50% · 50–0% (the handlers send in hyena waves) |
| Teaches | **add waves**; the chain is a **tether** the whole room can see |
| Enrage | 6:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Knuckle | all | melee | — | 16 %HP | — |
| **Chain Arc** | all | the chain sweeps: a red **ring** 3 m wide at 10–13 m from the post, 270° | 2.0 s | 30 %HP + knocked down | be inside 10 m or outside 13 m |
| Ground Stomp | all | 8 m red circle around him | 2.5 s | 35 %HP | step out (he can't follow past his chain) |
| Handler Waves | P2 | 4 Pit Hyenas + 1 Beast-Handler every 30 s from a portcullis | 1.5 s | — | damage kills the handler first (his Goad buffs the wave) |

**Dialog opportunity — "The captive"** (at 25%; only if **all 8 captives** were freed): Brannoc drops to one knee. "You freed the little soldiers. Why?" · "Because nobody should be in chains." → **Brannoc yields.** The Round counts as won; the crowd boos (Favour −20). In **Round Three** Brannoc breaks his chain and fights beside the party for 30 s (he deals 5% of the Warmaster's health). · "Get up and fight." → he does. Normal.
**Dialog:** pull (banner) — "They say if I kill five of you, they let me go." · Stomp ⚠ — "Down!" · death — "Tell the mountain... I tried."
**Heroic:** Chain Arc has a second ring 16–19 m. **Mythic+:** hyena waves every 20 s.
**Loot:** `it_stone_knuckles` (fist weapon), `it_giants_iron_collar` (neck), `set_pitchampion_leathers` piece (legs), `uq_broken_chain` **[D-EXCL]** — wrists: when a movement-stopping effect ends on you, gain +25% move speed and +10% damage for 3 s.

#### B2 · `b_razorback_rider_krunn` — Round Two: Krunn and Razorback

| Field | Value |
|---|---|
| Body | chibi2 orc ×1.6 riding **Razorback**, a creature boar ×3.4 in iron barding (new: mounted boss rig, §20) |
| Health | Krunn 50 H + Razorback 60 H (separate bars) |
| Phases | mounted (until Razorback dies **or** Krunn falls below 50%) · dismounted (both fight separately; the survivor enrages +25%) |
| Teaches | **kiting** and arena hazards |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Lance | mounted | melee | — | 14 %HP | — |
| **Gore Run** | mounted | red **line** 4 m × whole arena at a player | 2.0 s | 40 %HP + knockback | step aside; if he hits a **bone stake** (the ring's stakes are marked), he is **stunned 4 s** and takes +50% damage — bait him into one |
| **Fixate** (Razorback) | dismounted | Razorback fixates a player 10 s | — | 35 %HP if it reaches them | **kite**; the crowd throws **meat** it will stop to eat if Favour is 70+ |
| Spear Toss (Krunn) | dismounted | yellow **targeted** 4 m on 2 players | 2.0 s | 25 %HP | spread |
| Caltrop Rain | all | bookmakers throw 4 caltrop **void zones** | 1.5 s | 2 %HP / 0.5 s + slow | keep the kite path clear |

**Dialog:** Krunn — pull: "Hoo-ah! Razorback's hungry!" · Gore Run ⚠ — "Charge!" · dismount (banner) — "Down, boy— no, UP, boy!" · death — "Razorback... run..."
**Heroic:** Gore Run twice in a row; if both miss the stakes the second leaves a trail of fire **void zone**. **Mythic+:** kill the two within 15 s of each other or the survivor heals 20%.
**Loot:** `it_razorback_barding_pauldrons` (heavy shoulders), `it_krunns_lance` (polearm), `set_pitchampion_leathers` piece (chest), `uq_bait_and_stake` **[D-EXCL]** — boots: an enemy that is fixated on you or chasing you takes +10% damage from your allies.

#### END · `b_warmaster_drogath` — Round Three: Warmaster Drogath Ashmane

| Field | Value |
|---|---|
| Body | chibi2 orc ×2.4, grey mane braided with ash, a pair of cleavers, a war-banner cape |
| Health | 150 H |
| Phases | 100–70% (**single combat** or full fight) · 70–35% (the Horde piles in) · 35–0% ("Blood for the Pit") |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Twin Cleavers | all | melee, 2 hits, **Deep Wound** stack (−5% healing received, max 8) | — | 2 × 9 %HP | tank swap at 5 on Heroic; a follower/Damage taunt for 5 s on Normal |
| **Ash Whirl** | all | 10 m red circle around him, then a moving whirl (4 m **void zone**) that chases the furthest player for 8 s | 2.5 s | 35 %HP, then 4 %HP / 0.5 s | out; the furthest player kites it |
| War Horn | P2 | 3 Pit Fighters + 1 Blood Drummer + 2 Pit Hyenas every 35 s | 1.5 s | — | interrupt the drummer |
| **Warmaster's Challenge** | P2+ | **marks** 1 player: a 12 m blue **ring** appears round the two of them — the rest of the party is pushed out and cannot enter for 10 s | 2.0 s | the duel | the marked player survives 10 s (the healer can heal through the ring) |
| **Blood for the Pit** | P3 | orange **soak** 5 m, **3 pips**, and a **danger zone** 8 m around him at once | 4.0 s | 90 %HP to all if short / 50 %HP in the red | three soak away from him |

**Dialog opportunity — "Single combat"** (on pull): "Send me your champion. Or all of you — and the Pit will laugh." · **The party picks a champion** (a vote box; followers can't be chosen) → **Phase 1 becomes a duel**: the champion fights Drogath alone in a 12 m ring (his damage −40% in the duel, abilities: Twin Cleavers, Ash Whirl only) while the others fight a Horde wave outside. If the champion brings him to 70% **without dying**: Favour +40, Drogath says "...The Pit has spoken," and **Phase 2 is skipped** (he goes straight to Phase 3 at 70%). If the champion dies, the rest pour in at the Warmaster's current health (Favour −30). · "All of us." → full fight, normal.
**Dialog:** Ash Whirl ⚠ — "Dance!" · Challenge ⚠ (banner) — "You! Face me!" · Blood ⚠ (banner) — "BLOOD FOR THE PIT!" · death — "Good... a good death... in the sand..."
**Heroic:** Challenge ring shrinks to 8 m; Blood for the Pit needs 4 pips. **Mythic+:** Deep Wound max 12; Ash Whirl chases for 12 s.
**Loot:** `it_ashmane_cleaver` (one-handed axe, 2 drop as a pair), `it_warmasters_banner_cape` (back), `it_pit_victor_band` (ring), `set_pitchampion_leathers` pieces (helm, hands), `uq_favour_of_the_crowd` **[D-EXCL]** — neck: each dodge roll through a danger zone gives **Favour** (+2% damage per stack, 10 s, max 5). `leg_ashmanes_twin_cleavers` **[D-EXCL]** — one-handed axe legendary (a pair: equipping one in each hand counts as one legendary): every 3rd hit with the off-hand cleaver throws it: a 12 m line, 80% weapon damage, returns to your hand.

### Secret boss — `b_old_gnash_undefeated` — Old Gnash, the Undefeated

**Unlock (no-deaths):** win **all three Pit Rounds with no player deaths** (the Horde counts; the portcullis to the Champions' Hall opens and a
herald cries "The Pit has a new champion — if they can beat the old one!"). Followers count: a follower dying breaks it too.
Journal hint: *"The Pit only honours champions who never fell."*

| Field | Value |
|---|---|
| Body | chibi2 orc ×2.2, very old, one tusk, scars over scars, a club made from a war-rhino's horn — and a **hunting cat** of 30 years' service (creature saber_cat ×2.0, "Tallow") |
| Health | Gnash 130 H + Tallow 40 H |
| Phases | 100–60% · 60–25% (Tallow joins) · 25–0% ("One last fight") |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Horn Club | all | melee + Deep Wound | — | 18 %HP | tank swap at 5 (Heroic) |
| **Old Tricks** | all | a random earlier Round's ability: Chain Arc ring, Gore Run line, or Ash Whirl | as the original | as the original | recognise it |
| Veteran's Roar | all | room-wide (u) 3 s: everyone **feared** 2 s unless inside the blue **safe zone** he stands in (a 6 m ring at his own feet — get close) | 3.0 s | fear | stack on him |
| Tallow's Pounce | P2+ | Tallow fixates the healer | — | 30 %HP if caught | kite; the tank taunts Tallow |
| **One Last Fight** | P3 | orange **soak**, 4 pips, while he swings a 360° 6 m red circle | 4.0 s | 100 %HP if short / 40 %HP in the red | soak at the edge of the red ring |

**Dialog:** pull (banner) — "Forty years. Nobody's put me down. You'll do, maybe." · Roar ⚠ — "Come here and say that!" · death — "Hah. HAH. Look after Tallow." (Tallow, if alive, sits down and does not fight.)
**Loot:** `it_rhino_horn_club` (two-handed mace), `it_forty_scars_harness` (medium chest), `uq_tallows_collar` **[D-EXCL]** — neck: your companion or pet takes 20% less damage and deals +10%. **`leg_the_undefeated` [SECRET] [D-EXCL]** — waist (belt) legendary: the first time each fight you would drop below 20% health, you instead heal to 50% and gain +20% damage for 8 s.

### Set dropped here

`set_pitchampion_leathers` — Pit Champion's Leathers (4 pieces: legs, chest, helm, hands; light armour). Brief: 2 = +10% damage while an enemy is fixated on you, 4 = dodge rolling through an attack refunds 50% of the roll's cooldown.

---

## d10 — Rimefang Caverns

### Card

| Field | Value |
|---|---|
| id | `d10_rimefang_caverns` |
| Region | Frostmantle (`frostmantle`) |
| Levels | 36–39 (opens at 35) · Heroic 60 · Mythic+ 60 |
| Looks | `rime` (reuse) and `cave` with ice |
| Entrance | **the Fang Mouth**, 4 km up the Rimefang Glacier from Rimehold: a cave in the ice shaped like an open jaw, icicle teeth 6 m long |
| Quest giver | `npc_warden_kaija_frostmere`, Frost Warden captain, Rimehold |
| Story quest | `q_the_fang_in_the_ice` — "The Fang in the Ice": the Stonehide are waking a rime wyrm under the glacier to crack Rimehold's wall |
| Run time target | Normal 30 min · Heroic 30 min · Mythic+ par **36:00** |
| Ember Shrines | Fang Mouth · after Skarr Icebreaker · after Rimeweaver Seidra |
| Forces needed | ≈ 108 F |
| New lessons | **stacking cold** with **warmth zones**, **slippery floors**, **falling hazards** |

### Cold (dungeon-wide, new)

Every **8 s** in combat, each player outside warmth gains a **Chill** stack: −3% move and cast speed per stack. At **10 stacks**:
**Frozen** 3 s (stunned), stacks reset to 5. **Warmth** = the green **beneficial** 5 m circle round a lit **brazier**, a warmth
spell (page 05/classes), or a fire spell's burning patch: −1 stack a second while inside. There are **4 braziers** (see Secret)
along the route; bosses have their own warmth sources.

**Ice floors** (pale blue sheen): movement keeps momentum — 0.8 s to stop, turning is slower, dodge rolls go 50% further.

### Story hook

The **Stonehide Clans** worship Rimefang, a rime wyrm asleep in the glacier's heart since the last great winter. Their
frostsayer Seidra has found the song to wake it; their chieftain, Skarr Icebreaker, means to ride the wyrm down the
glacier through Rimehold's wall. Captain Kaija Frostmere has sent two patrols in. One came back.

### Layout

```
                          ? The Mother's Nest (secret: all 4 braziers still lit at the end)
                                   |
                     [B3] THE WYRM'S BED (end)
                                   |
                           (S3) Frozen Falls   [brazier 4]
                                   |
  [s2] Frostsayer Shrine ===== [B2] THE SINGING ICE
                                   |
                                 (S2)  [brazier 3]
                                   |
   Bear Den [s1] ====== [B1] ICEBREAKER'S CAMP
                                   |
                           Glass Glacier (ice floor)   [brazier 2]
                                   |
                           Icicle Hall (falling ice)
                                   |
                     (S1) Fang Mouth <-- entrance      [brazier 1]
```

| Room | Size (m) | Holds |
|---|---|---|
| Fang Mouth | 14×12 | S1, Keystone Font, brazier 1 |
| Icicle Hall | 10×50; icicles fall every 6 s: 3 m red circles, 1.8 s, 20 %HP | packs 1–2 |
| Glass Glacier | 30×30 **ice floor**, crevasse edges (fall = 25 %HP + climb back 10 s) | packs 3–4, brazier 2 |
| Icebreaker's Camp | 32×28, hide tents | B1 Skarr |
| Bear Den | 18×18 | s1 Old Whitemaw (optional) |
| The Singing Ice | 30×30, ice pillars that hum | B2 Seidra; S2 + brazier 3 before it |
| Frostsayer Shrine | 16×16 | s2 Yrsa (optional) |
| Frozen Falls | 14×24, a frozen waterfall | S3, brazier 4, pack 5 |
| The Wyrm's Bed | 40×40, ice floor round a rock island | END Rimefang |
| The Mother's Nest | 34×34 | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_giant_stonehide_icebreaker` | Stonehide Icebreaker (elite) | chibi2 giant, ice-crusted hide, a pick of blue stone | 4 | **Break the Ice**: 6 m red circle, 2.0 s, 25 %HP + makes the floor there **ice** for 20 s. |
| `m_giant_stonehide_frostsayer` | Stonehide Frostsayer | chibi2 giant (woman), rune-bones | 1.5 | **Frost Chant** (i) 2.5 s: +3 Chill to every player within 20 m. **Rime Ward** on an ally: absorbs 20% of its health. |
| `m_giant_stonehide_hurler` | Stonehide Hurler | chibi2 giant, sling of ice boulders | 1.5 | **Boulder**: yellow **targeted** 4 m, 2.0 s, 25 %HP. |
| `m_beast_frost_stalker` | Frost Stalker | creature saber_cat ×1.6, white, blue stripes | 1.2 | stealthed until 8 m; **Pounce** 15 %HP + slow. |
| `m_beast_rime_bear` | Rime Bear | creature bear ×1.8, white-blue | 2 | **Maul** 12 %HP; **Roar**: 6 m, 1.5 s, +2 Chill. |
| `m_dragonkin_rime_whelp` | Rime Whelp | creature drake ×1.2, white | 1 | **Frost Breath**: 45° cone 8 m, 1.5 s, 12 %HP + 2 Chill. |
| `m_elemental_frost_shard` | Frost Shard | creature shard ×1.3, blue-white | 0.7 | **Rime Nova**: on death, 4 m, 1.2 s, 10 %HP + 2 Chill. |
| `m_elemental_snow_wraith` | Snow Wraith | creature wraith ×1.4, white | 1 | **Whiteout**: a 6 m **void zone** of blizzard that follows it, 2 %HP / 0.5 s + 1 Chill a second. |
| `m_beast_ice_worm` | Ice Borer | creature worm ×1.8, white | 1.3 | **Burrow Up**: 4 m red circle under a player, 2.0 s, 20 %HP + knock-up. |

| # | Room | Pack |
|---|---|---|
| 1 | Icicle Hall, near | 3 Rime Whelps + 1 Frostsayer |
| 2 | Icicle Hall, far | 1 Icebreaker + 2 Hurlers |
| 3 | Glass Glacier, north | 2 Frost Stalkers + 2 Rime Bears |
| 4 | Glass Glacier, south | 2 Snow Wraiths + 3 Frost Shards + 1 Frostsayer |
| 5 | Frozen Falls | 1 Icebreaker + 2 Ice Borers + 2 Frost Shards |
| — | *patrol* Glass Glacier | 2 Rime Bears, 50 s loop |

### Sub-bosses

#### s1 · `b_old_whitemaw` — Old Whitemaw

Body: creature bear ×3.6, yellow-white, frost on the muzzle. Health 38 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Maul | melee | — | 16 %HP | — |
| **Den Collapse** | 5 red circles 3 m (falling ice) | 1.8 s | 25 %HP | move |
| Hibernate | at 50%: curls up, heals 2% a second for 10 s, takes −50% damage — **unless** someone is standing in warmth right next to him (the den's brazier-coals, a beneficial zone) and **fire damage** hits him (he wakes angry, no heal) | 2.0 s | — | fire at him from the coals |

**Loot:** `it_whitemaw_pelt` (medium back), `it_frosted_bear_claw` (fist weapon), `uq_hibernation_charm` **[D-EXCL]** — trinket: use: heal 30% of your maximum health over 6 s; you cannot move during it (120 s cooldown).

#### s2 · `b_frostsayer_yrsa` — Frostsayer Yrsa

Body: chibi2 giant (woman) ×1.6, rune-bone circlet, a staff hung with ice bells. Health 36 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Ice Bolt | ranged | — | 12 %HP | — |
| **Bell Hymn** (i) | 3.0 s: +4 Chill to everyone | 3.0 s | — | interrupt |
| Frost Circle | a 10 m **donut**, safe hole at her feet | 2.5 s | 35 %HP | get in close |

**Loot:** `it_ice_bell_staff` (staff), `it_rune_bone_circlet` (cloth helm), `uq_yrsas_bell` **[D-EXCL]** — off-hand: your interrupts also remove 2 stacks of any stacking debuff from allies within 10 m.

### Main bosses

#### B1 · `b_skarr_icebreaker` — Skarr Icebreaker

| Field | Value |
|---|---|
| Body | chibi2 giant ×2.2, Stonehide chieftain, horned ice helm, a two-handed maul of glacier-blue stone |
| Health | 118 H |
| Phases | 100–50% · 50–0% (the whole camp floor becomes ice) |
| Teaches | **slippery floors** and **falling hazards** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Glacier Maul | all | melee | — | 18 %HP | — |
| **Shatter the Floor** | all | 3 red circles 6 m turn the floor to **ice** (20 s) and a **cross** of cracks 2 m × 20 m from each | 2.5 s | 30 %HP | step off the cross lines; you will **slide** on the ice after |
| **Icicle Storm** | all | 12 red circles 3 m | 2.0 s | 25 %HP each | move — on ice, move early |
| Brazier Kick | all | kicks the camp's brazier (the only warmth) across the room | 1.5 s | — | the group follows the warmth |
| Charge | P2 | red line 4 m × 30 m, on the ice he slides 8 m past the end | 2.0 s | 35 %HP + knockback | aside |

**Dialog:** pull (banner) — "Rimehold's wall will break. Your heads first." · Shatter ⚠ — "Ground breaks!" · Icicle ⚠ — "Look up, little ones!" · death — "Seidra... sing it... louder..."
**Heroic:** Brazier Kick puts the brazier out for 10 s. **Mythic+:** Icicle Storm hits 16.
**Loot:** `it_glacierstone_maul` (two-handed mace), `it_horned_ice_helm` (heavy helm), `set_rimewarden_furs` piece (legs), `uq_icebreakers_cleats` **[D-EXCL]** — feet: immune to slipping on ice; +10% move speed on snow and ice.

#### B2 · `b_rimeweaver_seidra` — Rimeweaver Seidra

| Field | Value |
|---|---|
| Body | chibi2 giant (woman) ×2.0, a cloak of frozen feathers, eyes white, humming |
| Health | 124 H |
| Phases | 100–66% · 66–33% · 33–0% ("The Song") |
| Teaches | **stacking cold** and fighting over the warmth |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Frost Touch | all | melee, +1 Chill | — | 14 %HP | — |
| **Singing Pillar** | all | a hum: one of 4 ice pillars glows; if it finishes its song (8 s), +4 Chill to all | — | — | break the singing pillar (3 H) |
| **Snuff** | all | puts out the room's **warmth braziers** one at a time (3 in the room) | 2.0 s | — | a player relights it (hold E 1.5 s) — Chill climbs while it's out |
| **Frozen Heart** | P2+ | yellow **targeted** 5 m on 2 players: after 3 s they **freeze** 4 s and anyone within 5 m gains +3 Chill | 3.0 s | 20 %HP | the marked two go to a brazier (warmth halves the freeze) |
| **The Song** | P3 | room-wide (u) 5 s, **safe zones** = the lit braziers' warmth | 5.0 s | 100 %HP + Frozen | keep the braziers lit, stack in them |

**Dialog:** pull (banner) — "Listen. The ice is singing. It's singing your names." · Snuff ⚠ — "Hush, little fire." · Song ⚠ (banner) — "Wake, Rimefang. WAKE." · death — "The song... is sung... he wakes anyway..."
**Heroic:** 2 pillars sing at once in P3. **Mythic+:** relighting takes 2.5 s.
**Loot:** `it_frozen_feather_cloak` (back), `it_rimeweaver_staff` (staff), `set_rimewarden_furs` piece (chest), `uq_song_of_the_rime` **[D-EXCL]** — neck: you are immune to the first Chill-type slow each fight; your frost spells add −10% move speed to enemies (stacking 3).

#### END · `b_rimefang` — Rimefang

| Field | Value |
|---|---|
| Body | creature dragon ×3.6, white-blue, icicle spines, frost-mist breath, wings torn (it cannot fly: it climbs the rock island) |
| Health | 165 H |
| Phases | 100–70% (ground) · 70–40% (on the island: breath from above) · 40–0% (the glacier cracks) |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Rime Claw | all | melee + **Frostbite** stack (−5% healing, max 8) | — | 16 %HP | tank swap at 4 (Heroic) |
| Tail Swipe | all | 180° red cone behind, 9 m, + knockback onto the ice | 1.5 s | 25 %HP | beside it |
| **Frost Breath** | P1, P3 | 60° red cone 20 m, sweeps 90° left to right | 2.5 s | 12 %HP / 0.5 s + 2 Chill a second | move with the sweep |
| **Hoarfrost Bombard** | P2 | from the island: yellow **targeted** 5 m on 3 players and 2 orange **soaks** (2 pips) | 3.0 s | 30 %HP / 80 %HP if short | spread, soak |
| Whelps | P2 | 4 Rime Whelps; each dead whelp leaves a 3 m slippery ice patch for 15 s | 1.5 s | — | kill them away from the group's path |
| **Glacier Crack** | P3 | the floor splits into 4 ice floes; a red **line** 3 m wide along a crack | 3.0 s | 110 %HP (one-shot: into the crevasse) | stay off the drawn crack |
| Cold | all | Chill rules; the room has 2 **fire vents** (beneficial warmth) that go out after each Glacier Crack and relight after 20 s | — | — | — |

**Dialog** (Rimefang growls; **Seidra's echo** speaks for it): pull (banner) — "Who woke me? ...You did. Then you are breakfast." · Breath ⚠ — (a long inhale; banner "Rimefang draws breath!") · Glacier Crack ⚠ (banner) — "The glacier breaks!" · death — (a roar that cracks the far wall — see Secret)
**Heroic:** Frost Breath sweeps both ways. **Mythic+:** Glacier Crack twice, 3 s apart.
**Loot:** `it_rimefang_spine_spear` (spear), `it_wyrmscale_rime_plate` (heavy chest), `it_frost_mist_amulet` (neck), `set_rimewarden_furs` pieces (helm, hands), `uq_rimefang_heartscale` **[D-EXCL]** — heavy chest: +20% cold resistance; 10% of cold damage you take is added to your next hit. `leg_breath_of_the_glacier` **[D-EXCL]** — staff/wand legendary: your frost spells leave a 3 m ice floor patch for 6 s: enemies on it are slowed 30% and take +10% damage from you.

### Secret boss — `b_old_mother_rime` — Old Mother Rime

**Unlock (keep the fires):** all **4 route braziers** (Fang Mouth, Glass Glacier, before the Singing Ice, Frozen Falls) must be **lit
when Rimefang dies**. They burn down over **6 minutes** each; relight with **Firewood** (`it_firewood`, dropped by the Stonehide
trash, 60%; a player can hold 5) at the brazier (hold E 1 s). Snow Wraiths walking past one put it out. Any brazier out at the kill
= no secret. The four fires "wake the mountain's memory" and Rimefang's death-roar opens the Nest.
Journal hint: *"The Frost Wardens say every rime wyrm has a mother, and she hates the cold."*

| Field | Value |
|---|---|
| Body | creature dragon ×4.4, ancient, grey-white with blue ice grown into her scales, blind (milky eyes) |
| Health | 180 H |
| Phases | 100–65% · 65–30% · 30–0% ("Last winter") |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Ancient Claw | all | melee + Frostbite | — | 18 %HP | tank swap |
| **Blind Hunt** | all | she hunts by **sound**: the player who used the most abilities in the last 5 s is **targeted** (yellow 6 m) | 2.5 s | 40 %HP | casters slow down; the targeted player moves out |
| **Winter's Memory** | all | room-wide cold: +1 Chill every 2 s for 10 s; the 4 brazier-spirits (small green 3 m **beneficial** zones that drift around the room at 1 m/s) keep you warm | — | — | follow the drifting warmth |
| Ice Age | P2+ | checkerboard of ice (slippery) and red (danger) cells | 3.0 s | 50 %HP on red | stop on a safe cell — on ice, stop early |
| **Last Winter** | P3 | orange **soak** 6 m, **5 pips** (everyone) — then Frost Breath at whoever was **not** in it | 4.0 s | 120 %HP if short (one-shot) | everyone in |

**Dialog:** pull (banner, old, slow) — "My son was loud. You are loud too." · Blind Hunt ⚠ — "I hear you." · Last Winter ⚠ (banner) — "Huddle, little warm things." · death — "Warm... it was... warm..."
**Loot:** `it_blind_mothers_scale` (heavy shoulders), `it_nest_warmed_gloves` (medium hands), `uq_the_quiet_step` **[D-EXCL]** — feet: enemies more than 15 m away do not notice you unless you attack. **`leg_mothers_last_winter` [SECRET] [D-EXCL]** — chest legendary: you carry a 4 m **warmth** aura (allies inside lose 1 Chill-type stack a second and heal 1% a second); every 30 s it flares, healing allies inside 10% of their max health.

### Set dropped here

`set_rimewarden_furs` — Rimewarden's Furs (4 pieces: legs, chest, helm, hands; medium armour). Brief: 2 = +20% resistance to Chill and slows, 4 = while standing in warmth or any beneficial zone, +10% damage and healing done.

---

## d11 — Saltdeep Cathedral

### Card

| Field | Value |
|---|---|
| id | `d11_saltdeep_cathedral` |
| Region | The Drowned Coast (`drowned_coast`) |
| Levels | 42–45 (opens at 41) · Heroic 60 · Mythic+ 60 |
| Looks | `flooded` (reuse) with cathedral stone (§20 `flooded_cathedral`: salt-white stone, barnacles, stained glass lit green from the sea) |
| Entrance | **the Bell Tower** of old Saltdeep, sticking out of the sea 3 km off Saltmarch; a causeway is dry for 20 minutes in every hour of the day clock (low tide; any time with a Saltmarch boat, page 01). Enter through the belfry and go **down**. |
| Quest giver | `npc_sister_maren_saltwhistle`, Saltmarch's last priestess |
| Story quest | `q_the_bell_under_the_sea` — "The Bell Under the Sea": the drowned bell of Saltdeep rings at night and the dead walk up the beach each time. Silence it |
| Run time target | Normal 32 min · Heroic 32 min · Mythic+ par **37:00** |
| Ember Shrines | Belfry · after Deacon Mourne · after the Choir of Brine |
| Forces needed | ≈ 112 F |
| New lessons | **rising water**, **interrupt rotation** (casts too frequent for one interrupter), **positional bells** (stand at the right bell) |

### The Tide (dungeon-wide, new)

A **Tide Gauge** (HUD) rises and falls on a **90 s** cycle in the flooded rooms: **Low (30 s)** → **Rising (15 s)** → **High (30 s)** →
**Falling (15 s)**. At High, the floor of a flooded room is under 1.5 m of water: players **swim** (−40% move speed, no dodge
roll, casting allowed) and take **Drowning** 3 %HP a second after 10 s under unless inside an **air pocket** (blue **safe zone**
bubbles along the walls). The Drowned are **stronger** at High (+20% damage) and weaker at Low. Some hymn pages (Secret)
can only be reached at Low.

### Story hook

A century ago the cliffs under Saltdeep gave way in a storm and the town went into the sea, cathedral and all. Bishop Aldwine
rang the great bell to call the town into the cathedral for shelter — and the cathedral went down with all of them inside.
Now the Drowned under the Coast gather to the bell, and every time it rings, they walk up Saltmarch's beach. Sister Maren thinks
the bishop is still ringing it.

### Layout

```
                                   ? The Tidewife's Font (secret: 3 hymn pages + the Bishop confesses)
                                             |
                     [B3] THE DROWNED ALTAR (end; 3 bells)
                                             |
                                   (S3) Chapter House
                                             |
  [s2] Crab Crypts ======== [B2] THE CHOIR LOFT (council)
                                             |
                                           (S2)
                                             |
  [s1] Bell Shaft ======= [B1] THE SUNKEN NAVE (tidal)
                                             |
                                   Cloister (tidal)
                                             |
                                   Spiral Stair (down)
                                             |
                            (S1) Belfry <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Belfry | 14×14, open to the sky | S1, Keystone Font; **hymn page 1** at the very top of the belfry ladder (climb, hold E) |
| Spiral Stair | 8×8 × 3 turns | pack 1 |
| Cloister | 30×30 round a drowned garden, **tidal** | packs 2–4 |
| The Sunken Nave | 24×44, pews, **tidal** | B1 Deacon Mourne; **hymn page 2** under the 7th pew on the left, reachable at **Low** tide only |
| Bell Shaft | 12×12, 20 m deep | s1 Hobb the Bellringer (optional) |
| The Choir Loft | 26×20, raised, dry | B2 the Choir of Brine; S2 before it |
| Crab Crypts | 20×24, **tidal** | s2 the Saltshell Matron (optional) |
| Chapter House | 16×16 | S3, pack 5; **hymn page 3** in the confessional (a booth: sit, hold E 3 s — a voice whispers) |
| The Drowned Altar | 36×36, three bells (Low, Middle, High) hung at three sides, **tidal** | END Bishop Aldwine |
| The Tidewife's Font | 30×30, a font of seawater the size of a pond | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_undead_drowned_parishioner` | Drowned Parishioner | chibi2 undead (human), Sunday clothes rotted, barnacles | 1 | **Clutch** 7 %HP; **Pull Under** (High tide only): holds a swimming player 2 s under, +2 s Drowning. |
| `m_undead_brine_chorister` | Brine Chorister | chibi2 undead, choir robe, a mouth that leaks seawater | 1 | **Hymn of the Deep** (i) 2.0 s: +25% damage to all Drowned within 20 m for 10 s. Cast every 6 s — **interrupt rotation**. |
| `m_undead_barnacled_templar` | Barnacled Templar (elite) | chibi2 undead ×1.5, plate crusted in barnacles, a greatsword | 4 | **Tidebreaker**: 120° red cone 8 m, 2.0 s, 30 %HP + knockback. **Shell**: −50% damage from the front. |
| `m_undead_bellringer_ghoul` | Bellringer Ghoul | chibi2 undead, hunched, hand-bell | 0.8 | **Toll**: 8 m circle, 1.5 s, 10 %HP + silence 2 s. |
| `m_beast_saltshell_crab` | Saltshell Crab | creature beetle ×1.5 re-skinned as a crab (new `crab` type, §20) | 1.2 | **Pincer** 10 %HP + disarm 2 s. Sidesteps behind the tank. |
| `m_beast_deep_eel` | Deep Eel | creature snake ×2.2, pale | 1 | only in water; **Shock** chains to 2 players within 6 m, 8 %HP each. |
| `m_aberration_lantern_gulper` | Lantern Gulper | creature frog ×2.2, deep-sea colours, a glowing lure on a stalk (new feature `lure`, §20) | 1.8 | **Lure**: its light charms the nearest player to walk to it 2 s; **Gulp** 25 %HP. Kill the lure (0.3 H) to stop both. |
| `m_elemental_brine_elemental` | Brine Elemental | creature elemental ×1.5, seawater | 1.5 | **Undertow**: 6 m circle pull toward it over 2 s, then 12 %HP. |
| `m_aberration_drowned_lamprey` | Salt Lamprey | creature worm ×0.8, grey | 0.4 | latches (as d02's leech), 3 %HP a second. |

| # | Room | Pack |
|---|---|---|
| 1 | Spiral Stair | 3 Parishioners + 1 Bellringer Ghoul |
| 2 | Cloister, west walk | 2 Brine Choristers + 3 Parishioners |
| 3 | Cloister, garden | 1 Barnacled Templar + 2 Saltshell Crabs + 4 Salt Lampreys |
| 4 | Cloister, east walk | 2 Lantern Gulpers + 2 Deep Eels (in the garden pool) |
| 5 | Chapter House | 1 Barnacled Templar + 2 Brine Choristers + 1 Brine Elemental |
| — | *patrol* Cloister | 2 Bellringer Ghouls, ringing (a sound cue) 40 s loop |

### Sub-bosses

#### s1 · `b_hobb_the_bellringer` — Hobb the Bellringer

Body: chibi2 undead ×1.6, hunchback, a hand-bell in each hand, rope burns on both wrists. Health 40 H. Bell Shaft (optional; a 12 m round platform over a 20 m drop). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Bell Bash | melee | — | 14 %HP | — |
| **Two-Bell Toll** | he rings the **left** or **right** bell: the platform's **opposite** half goes red (a half-circle **danger zone**) | 2.5 s | 45 %HP + knockback toward the edge | stand on the side of the bell he rang (the lesson for B3's bells) |
| Rope Swing | swings on the bell rope: red line across the platform | 2.0 s | 25 %HP | aside |

**Loot:** `it_bell_rope_wraps` (light wrists), `it_hobbs_hand_bell` (off-hand), `uq_ringers_earplugs` **[D-EXCL]** — helm: immune to silence; +10% resistance to room-wide damage.

#### s2 · `b_saltshell_matron` — The Saltshell Matron

Body: creature crab (new) ×4.0, barnacle-crusted, one giant claw. Health 42 H. Crab Crypts (tidal). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Great Claw | melee + disarm 3 s | — | 16 %HP | — |
| **Brood Tide** | at each High tide, 6 Saltshell Crabs | 1.5 s | — | kill at Low tide before High |
| **Shell Up** | while the room is at Low tide: −80% damage taken | — | — | burn her during High (swimming, no roll — careful) |

**Loot:** `it_barnacle_carapace` (heavy chest), `it_giant_claw_gauntlet` (fist weapon), `uq_matrons_pearl` **[D-EXCL]** — neck: while swimming you move 40% faster and take no Drowning for 20 s.

### Main bosses

#### B1 · `b_deacon_mourne` — Deacon Mourne

| Field | Value |
|---|---|
| Body | chibi2 undead ×1.9, deacon's vestments heavy with water, a censer that trails black ink in the water |
| Health | 130 H |
| Phases | 100–50% · 50–0% (the Nave floods: every High tide lasts 45 s) |
| Teaches | **interrupt rotation** and **rising water** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Censer Swing | all | melee | — | 16 %HP | — |
| **Litany** (i) | all | a 2.5 s cast **every 5 s**; each completed Litany gives him a stack: +8% damage, stacking, whole fight | 2.5 s | — | the group rotates interrupts (most interrupts have 12–15 s cooldowns — page 05; two to three interrupters needed). A numbered order can be set on the party frame (**Interrupt Order**, new UI, page 03) |
| **Ink Cloud** | all | a 6 m **void zone** of black ink where he stands, drifts with the tide | 1.5 s | 4 %HP / 0.5 s + blind | tank drags him out |
| **Drowning Sermon** | all | at each **High**, he targets the 2 players furthest from any air pocket: yellow 4 m | 2.0 s | 25 %HP + +3 s Drowning | stay near air pockets at High |
| Parishioners | P2 | 4 Drowned Parishioners rise each High | 1.5 s | — | area damage at High |

**Dialog:** pull (banner) — "Late for the service. The bishop will be so disappointed." · Litany ⚠ — "In the name of the deep..." · Ink ⚠ — "Let us pray in the dark." · death — "Amen... amen..."
**Heroic:** Litany every 4 s. **Mythic+:** an un-interrupted Litany also heals him 3%.
**Loot:** `it_ink_censer` (off-hand), `it_waterlogged_vestments` (cloth chest), `set_tidebound_vestments` piece (legs), `uq_deacons_litany` **[D-EXCL]** — neck: your interrupt's cooldown is reduced by 3 s each time you interrupt successfully.

#### B2 · `b_choir_of_brine` — The Choir of Brine (Alto, Tenor, Bass)

| Field | Value |
|---|---|
| Body | three chibi2 undead choristers ×1.7 on the loft's three stalls; Alto (woman, high), Tenor, Bass (huge, ×2.0) |
| Health | 3 × 48 H (separate bars) |
| Phases | a **council** fight: one singer leads at a time (the **lead** glows blue-green); when one dies, the others gain its song |
| Teaches | interrupt rotation across **three** casters, and choosing a kill order |
| Enrage | 7:30 |

| Singer | Lead ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Alto | **High Note** (i) 2.0 s | room-wide, silences 3 s | 2.0 s | 15 %HP | interrupt |
| Alto | Shatter Glass | 4 red circles 4 m where stained glass falls | 2.0 s | 30 %HP | move |
| Tenor | **Refrain** (i) 2.5 s | heals the other two 15% | 2.5 s | — | interrupt |
| Tenor | Tidal Line | red **line** 4 m × 26 m (a wave of seawater across the loft) | 2.0 s | 30 %HP + knockback | aside |
| Bass | **Deep Chord** (u) 4.0 s | room-wide; **safe zone** = blue 4 m ring round the **Alto** (her voice cancels his) | 4.0 s | 80 %HP | stand by the Alto (so killing Alto first removes the safe zone — **kill order matters**) |
| Bass | Resonance | orange **soak** 4 m, 3 pips | 4.0 s | 90 %HP if short | three in |
| all | **Harmony** | if two singers are within 5% health of each other, both gain +20% damage | — | — | stagger their health |

**Dialog:** Alto — "Sing with us!" · Tenor — "Again, from the top." · Bass — "Loooow..." · Deep Chord ⚠ (banner) — "ALL TOGETHER NOW." · a singer dies — the others: "...a part is missing." · last death — "Silence... at last."
**Recommended order** (journal tip, unlocks after first kill): Tenor → Bass → Alto.
**Heroic:** the lead changes every 20 s instead of 30 s. **Mythic+:** Harmony at 10%.
**Loot:** `it_choir_robe_of_brine` (cloth chest), `it_tuning_fork_wand` (wand), `set_tidebound_vestments` piece (hands), `uq_the_missing_part` **[D-EXCL]** — ring: when an ally near you dies, you gain their role's bonus for 10 s (+15% damage, or +15% healing, or −15% damage taken).

#### END · `b_bishop_aldwine` — Bishop Aldwine, the Drowned

| Field | Value |
|---|---|
| Body | chibi2 undead ×2.4, a mitre crusted with coral, robes floating as if underwater, a crozier ending in a bell-clapper |
| Health | 175 H |
| Phases | 100–70% · 70–40% (the bells ring on their own) · 40–20% · **20%: dialog** · 20–0% |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Crozier | all | melee + **Salt Sore** (−5% healing, max 10) | — | 18 %HP | tank swap at 5 (Heroic) |
| **Call to Worship** | all | he names a bell: "**Low**" / "**Middle**" / "**High**" — only the area under that bell (a blue 8 m **safe zone**) is safe | 3.5 s (banner with the bell's name, the bell swings) | 100 %HP (one-shot) elsewhere | run to the named bell |
| **Tide of Souls** | all | the Tide Gauge jumps straight to High for 20 s | 2.0 s | swimming, Drowning | air pockets |
| Litany | all | (i) as Deacon Mourne, every 6 s | 2.5 s | stacks | rotate |
| **False Bell** | P2+ | he names one bell but a **different** bell swings — the **swinging bell** is the safe one (the voice lies, the bell doesn't) | 3.5 s | 100 %HP | trust the bell |
| Drowned Congregation | P3 | 6 Parishioners + 1 Chorister each High | 1.5 s | — | cleave, interrupt |

**Dialog opportunity — "Confession"** (at 20% he kneels at the altar; combat pauses up to 30 s):

| Reply | Result |
|---|---|
| "You rang the bell that called them in to drown." *(only offered if the party carries all **3 hymn pages** — the pages are his own diary)* | "...Yes. I heard the cliffs going. I rang it anyway. I wanted a full church." He sets down the crozier and dies (a kill, full loot). The font behind the altar begins to rise: see Secret. |
| "Your town is waiting on the beach for you." | he screams; the fight resumes at 20% with Call to Worship every 15 s. |
| "Pray." | as above. |

**Dialog:** pull (banner) — "The service has begun. Doors are closed." · Call ⚠ (banner) — "To the **Low** bell!" (etc.) · False Bell — says one, the bell rings another · Tide ⚠ — "Let the sea in." · death (fought) — "Ring... for me..."
**Heroic:** Call to Worship safe zones 6 m. **Mythic+:** False Bell from the start.
**Loot:** `it_coral_mitre` (cloth helm), `it_bell_clapper_crozier` (staff), `it_saltdeep_rosary` (neck), `set_tidebound_vestments` pieces (chest, helm), `uq_the_full_church` **[D-EXCL]** — trinket: use: every ally within 15 m gains +10% damage for 10 s, +2% more for each ally beyond 2 (90 s cooldown). `leg_bell_of_saltdeep` **[D-EXCL]** — off-hand legendary: every 20 s you ring a bell: allies within 10 m gain a barrier of 8% max health and enemies within 10 m are silenced 2 s.

### Secret boss — `b_the_tidewife` — The Tidewife

**Unlock (collect + dialog):** carry all **3 hymn pages** (Belfry top; under the 7th left pew in the Nave at **Low** tide; the
Chapter House confessional) and choose the **confession** reply at the Bishop's 20%. The font behind the altar rises into the
**Tidewife's Font**. (The Tidewife is what the Drowned pray to; she is the first glimpse of what waits in `r03_sunken_choir`.)
Journal hint: *"The bishop kept a diary. It's in three pieces, and one is under the water — except when it isn't."*

| Field | Value |
|---|---|
| Body | chibi2 human ×3.0, woman of seawater (material `seawater_body`, §20), hair as kelp, a crown of drowned bells |
| Health | 190 H |
| Phases | 100–65% · 65–30% · 30–0% ("High water") |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Wave Slap | all | melee + Salt Sore | — | 18 %HP | tank swap |
| **Her Own Tide** | all | the Font's water rises and falls every 45 s (Low/High); at High only **3 air pockets** exist | — | Drowning | share pockets |
| Undertow Ring | all | **moving wave** inward from the walls | 2.0 s | 25 %HP + pulled 5 m | roll through (or swim over at High) |
| **Bells of the Drowned** | all | three bells on her crown: she rings one; its **matching** quarter of the room is safe (Low/Middle/High sound cues + colours) | 3.5 s | 100 %HP | hear and go |
| Kelp Snare | P2+ | white **tethers** from the floor to 2 players; a teammate breaks | 1.5 s | 4 %HP a second + Drowning | break |
| **High Water** | P3 | orange **soak** 6 m, **4 pips**, placed **under** the High tide water line (soakers swim) | 4.0 s | 110 %HP if short | four in, air pockets after |

**Dialog:** pull (banner) — "He gave me a whole town. What will you give me?" · Bells ⚠ — "Which bell calls you home?" · death — "The sea... keeps... what it's given..." *(she sinks, she does not die — a line for r03)*
**Loot:** `it_kelp_crown` (light helm), `it_tidewife_bangle` (wrists), `uq_what_the_sea_keeps` **[D-EXCL]** — ring: when you would take a hit over 40% of your health, 20% of it is taken over 4 s instead (30 s cooldown). **`leg_heart_of_the_tidewife` [SECRET] [D-EXCL]** — chest legendary: you breathe water (no Drowning), swim at full speed, and your spells cast while swimming deal +15%.

### Set dropped here

`set_tidebound_vestments` — Tidebound Vestments (4 pieces: legs, hands, chest, helm; cloth). Brief: 2 = your interrupts' cooldowns are 2 s shorter, 4 = a successful interrupt gives the whole party +5% damage for 6 s.

---

## d12 — The Unmade Workshop

### Card

| Field | Value |
|---|---|
| id | `d12_unmade_workshop` |
| Region | The Riftmarch (`riftmarch`) |
| Levels | 48–51 (opens at 47) · Heroic 60 · Mythic+ 60 |
| Looks | `vault` (reuse; violet rift light) and **workshop** (new `rift_workshop`: brass, benches, half-built machines hanging from chains, rooms that float apart with void between — §20) |
| Entrance | **Oddrin's Island**, a floating stone chained to the ground 2 km east of Waystone Camp; a waystone lift carries you up (the lift is the door) |
| Quest giver | `npc_riftwatch_archivist_toma_quill`, Waystone Camp |
| Story quest | `q_the_unfinished` — "The Unfinished": the rift in the Riftmarch started in one room. Find it |
| Run time target | Normal 33 min · Heroic 33 min · Mythic+ par **38:00** |
| Ember Shrines | Lift Landing · after the Gravity Engine · after the Mirror Apprentices |
| Forces needed | ≈ 116 F |
| New lessons | **portals** (step in one, come out another), **gravity flips** (the floor you stand on changes), **mirrored copies** (copies of the players) |

### Story hook

Vell Oddrin, master artificer of Highcourt, wanted to build a machine that could **unmake** things — take a sword back to ore,
a ruin back to a wall, a death back to a life. The first time he switched it on, it unmade the land around his workshop into the
Riftmarch, and the workshop floated away. Archivist Toma Quill has one of his letters: "It works. It just doesn't stop." Oddrin is
still up there, still working. So are his machines. And somewhere on his bench is the one thing he never finished.

### Layout

The workshop is **islands** joined by **portals** (violet rings, 3 m) — step in and you arrive at the paired ring. Rooms float;
the "halls" between them are portals, not corridors.

```
                     ? The Finishing Bench (secret: the 4 automaton parts assembled)
                                  |
             [B3] THE UNMAKING ROOM (end) — portals on all four walls
                                  |
                        (S3) Drafting Room
                                  |
  [s2] Lens Grinding Room <~portal~> [B2] THE MIRROR GALLERY
                                  |
                                (S2)
                                  |
  [s1] Cog Foundry <~portal~> [B1] THE GRAVITY ENGINE (a room with two floors, ceiling and ground)
                                  |
                        Scrap Yard (floating debris)
                                  |
                        Assembly Line (conveyor)
                                  |
                  (S1) Lift Landing <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| Lift Landing | 14×12 | S1, Keystone Font |
| Assembly Line | 12×50, a conveyor floor (moves you 2 m/s toward a press: red **line** 4 m wide every 10 s, 1.5 s, 40 %HP) | packs 1–2 |
| Scrap Yard | 30×30 of floating platforms 2–4 m apart (jump; falling = 20 %HP, back at the room start) | packs 3–4 |
| The Gravity Engine | 30×30 × 16 m tall: the **ceiling is a second floor** | B1 |
| Cog Foundry | 20×20 | s1 the Cogheart Warden (optional); drops the **Cogheart** |
| The Mirror Gallery | 28×28, mirrored walls | B2; S2 before it |
| Lens Grinding Room | 18×16 | s2 Mira Lensgrinder (optional); drops the **Rift Lens** |
| Drafting Room | 16×20 | S3, pack 5; blueprints on the walls (the Secret's instructions) |
| The Unmaking Room | 40×40, a great machine in the centre | END Oddrin |
| The Finishing Bench | 30×30 | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_construct_half_made_golem` | Half-Made Golem (elite) | creature golem ×2.0, one arm missing, wires trailing, violet core | 4 | **Unfinished Swing**: 90° red cone 7 m, 2.0 s, 30 %HP. **Rebuild**: at 30%, grabs scrap and heals 20% unless interrupted (i) 3.0 s. |
| `m_construct_clockwork_hound` | Clockwork Hound | creature hound ×1.4, brass plates, key in its back | 1 | **Wind-Up**: 2 s (key spins), then a 12 m dash line, 18 %HP. |
| `m_construct_brass_sentry` | Brass Sentry | creature turret ×1.3 | 1.2 | **Burst**: red line 1 m × 25 m, 1.5 s, 3 × 6 %HP. Stationary; deploys where the Tinker-trained Oddrin put it. |
| `m_construct_scrap_swarm` | Scrap Swarm | creature beetle ×0.7, bolts and springs | 0.4 | swarms of 8; **Nibble** 3 %HP; **Magnetise**: 4 near a player pull them together 2 m. |
| `m_aberration_rift_tatter` | Rift Tatter | creature wraith ×1.5, violet-black, edges flickering | 1.2 | **Blink**: teleports behind a player; **Unmake**: 12 %HP + −10% max health for 10 s (stacks 3). |
| `m_elemental_rift_shard` | Rift Shard | creature shard ×1.4, violet | 0.8 | **Tear**: opens a 2 m portal under a player: 1.5 s, they drop through and land 10 m away at a random spot. |
| `m_aberration_unmade_thing` | Unmade Thing | creature horror ×1.6, half-constructed: brass ribs, tentacles | 2 | **Grasp** 12 %HP + root 2 s; **Undoing**: 6 m **void zone** where it dies, 20 s. |
| `m_construct_mirror_mannequin` | Mirror Mannequin | chibi2 human ×1.2, mirror-glass skin, no face | 1.2 | **Copy**: copies the last ability a player used on it, once (the ability's shape and damage, at 50%). |
| `m_humanoid_riftwatch_deserter` | Riftwatch Deserter | chibi2 human (any), Riftwatch coat, rift staff | 1 | **Rift Bolt** 12 %HP; **Blink Away** when a melee attacker reaches it. |

| # | Room | Pack |
|---|---|---|
| 1 | Assembly Line, near | 2 Half-Made Golems (they come down the conveyor to you) |
| 2 | Assembly Line, far | 3 Clockwork Hounds + 2 Brass Sentries |
| 3 | Scrap Yard, west platforms | 16 Scrap Swarm (2 swarms) + 2 Rift Tatters |
| 4 | Scrap Yard, east platforms | 2 Rift Shards + 1 Unmade Thing + 2 Riftwatch Deserters |
| 5 | Drafting Room | 3 Mirror Mannequins + 1 Half-Made Golem + 1 Unmade Thing |

### Sub-bosses

#### s1 · `b_cogheart_warden` — The Cogheart Warden

Body: creature golem ×2.8, a great spinning cog for a chest (visible), brass. Health 46 H. Cog Foundry (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Piston Fist | melee | — | 18 %HP | — |
| **Spin Up** | the cog spins faster every 10 s: +10% attack speed a stack | — | — | a player stands on the foundry's **brake plate** (hold E 2 s) to reset it — the brake plate is under a red **danger zone** drop every 20 s |
| Cog Toss | red line 3 m × 20 m, the cog rolls and **bounces** off one wall | 2.0 s | 30 %HP | read the bounce |

**Drops (100%):** **the Cogheart** (`it_automaton_cogheart`, secret part 1). **Loot:** `it_brass_piston_gauntlets` (heavy hands), `it_cog_shield` (shield), `uq_perpetual_cog` **[D-EXCL]** — trinket: every 10 s in combat, +2% attack speed (max 10%); lost after 5 s out of combat.

#### s2 · `b_mira_lensgrinder` — Mira Lensgrinder

Body: chibi2 halfling ×1.6 (Oddrin's apprentice), goggles with six lenses, a lens-staff. Health 44 H. Lens Grinding Room (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Focus Beam | red line 1 m × 30 m that **tracks** the tank slowly (turns 30°/s) for 4 s | 1.5 s | 6 %HP / 0.5 s | others stay out of its sweep |
| **Portal Lens** | opens 2 portals; she fires Focus Beams **through** them (a beam enters one ring and leaves the other) | 2.0 s | as above | watch both ends |
| Magnify | yellow **targeted** 5 m on 1 player | 2.0 s | 30 %HP | spread |

**Dialog opportunity — "The apprentice"** (at 40%): "He's not *evil*. He just can't stop. Will you stop him — or will you *finish* him?" · "We'll stop him." → she gives up the **Rift Lens** and leaves (no gear loot). · "We'll finish him." → fight on; the lens drops at 100% anyway.
**Drops (100%):** **the Rift Lens** (`it_automaton_rift_lens`, secret part 2). **Loot:** `it_six_lens_goggles` (cloth helm), `it_lens_staff` (staff), `uq_through_the_lens` **[D-EXCL]** — off-hand: your line-shaped spells go 50% further.

### Main bosses

#### B1 · `b_the_gravity_engine` — The Gravity Engine

| Field | Value |
|---|---|
| Body | a construct: a brass sphere 5 m wide in the room's middle, hanging from nothing, with four arms (new model `gravity_engine`, §20) |
| Health | 140 H |
| Phases | 100–66% · 66–33% · 33–0% (flips come faster: 30 s → 22 s → 15 s) |
| Teaches | **gravity flips** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Arm Sweep | all | a 180° red half-circle 8 m on the side facing the tank | 1.8 s | 25 %HP | beside |
| **Invert** | all | gravity flips: everyone falls **up** to the ceiling floor (or back down). The room's hazards on the **other** floor are shown on the **near** floor as ghost outlines 3 s ahead | 3.0 s | the fall: 10 %HP; landing in a hazard: as that hazard | read where you'll land; stand under a clear spot |
| Scrap Rain | all | 6 red circles 4 m on the **floor you are not on** — they become hazards when you flip | 2.0 s | 30 %HP | see Invert |
| **Mass Shift** | P2+ | only **half** the room flips (a blue line splits it): players on the flipping half go up, the rest stay | 3.0 s | — | the group decides: stay together on one half |
| Magnet Pull | all | 2 players **tethered** (white) to the sphere, pulled 3 m/s toward it for 4 s | 2.0 s | 30 %HP if they reach it | walk away; tethers snap at 16 m |

**Dialog** (Oddrin over a speaking-tube, cheerful): pull — "Oh! Visitors! Mind the floor, it's — well, it's *both* floors." · Invert ⚠ (banner) — "Up we go!" · Mass Shift ⚠ — "Halfsies!" · death — "Well, that one needs recalibrating."
**Heroic:** flips every 20 s from the start. **Mythic+:** Scrap Rain also hits the floor you are on.
**Drops (100%):** **the Brass Hand** (`it_automaton_brass_hand`, secret part 3). **Loot:** `it_gravity_boots` (heavy feet), `it_engine_arm_cleaver` (two-handed axe), `set_unmakers_apron` piece (legs), `uq_upside_down_charm` **[D-EXCL]** — neck: fall damage is ignored; after a fall or a knock-up, +20% damage for 4 s.

#### B2 · `b_mirror_apprentices` — The Mirror Apprentices

| Field | Value |
|---|---|
| Body | one Mirror Mannequin ×1.8 named **Seven**, and — during the fight — **copies of each player** (a mirror-glass Chibi 2 wearing the player's own look and weapon) |
| Health | Seven 120 H; each copy 12 H |
| Phases | 100–60% · 60–25% (copies every 30 s) · 25–0% ("All of you") |
| Teaches | **mirrored copies** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Glass Palm | all | melee | — | 16 %HP | — |
| **Reflect You** | all | a copy of **one** player steps out of a mirror wall; it uses that player's **first three spells** at 50% power | 2.0 s | per spell | the copy takes **double** damage from its original player — the original kills their own copy |
| Mirror Walk | all | Seven steps into a mirror and out of another; the mirror he left **cracks** and throws a red **cone** 8 m 60° | 2.0 s | 30 %HP | watch the mirrors |
| **Reflect Everyone** | P3 | a copy of **every** player at once + Seven casts **Shatter** (u) 6 s: room-wide 100 %HP unless all copies are dead | 6.0 s | one-shot | each player kills their own copy (fast) |
| Swap | P2+ | two players swap places with their copies (a white **tether** shows who swaps with what, 2 s) | 2.0 s | — | don't lose track of which is you — the real one has a nameplate |

**Dialog** (Seven, in Oddrin's voice but flat): pull — "Master says I am the seventh try. You are the first." · Reflect ⚠ — "Look at yourself." · Shatter ⚠ (banner) — "Break everything." · death — "Seven... was not... right either."
**Heroic:** copies use 4 spells. **Mythic+:** copies use the player's **current talents** too.
**Drops (100%):** **the Voice Box** (`it_automaton_voice_box`, secret part 4). **Loot:** `it_mirror_glass_mask` (medium helm), `it_seventh_try_blade` (sword), `set_unmakers_apron` piece (chest), `uq_look_at_yourself` **[D-EXCL]** — ring: your first damaging spell each fight is cast twice (the second at 40%).

#### END · `b_oddrin_the_unmaker` — Vell Oddrin, the Unmaker

| Field | Value |
|---|---|
| Body | chibi2 human ×1.8, old, wild hair, a harness of brass arms (four extra), the **Unmaking Engine** behind him (a 12 m machine, new model `unmaking_engine`, §20) |
| Health | 190 H |
| Phases | 100–70% (lecture) · 70–40% (the Engine runs: the room unmakes) · 40–0% ("Unmake yourself") |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Brass Arms | all | melee, 4 hits | — | 4 × 5 %HP | — |
| **Portal Net** | all | opens 4 portals (walls); his **Rift Bolts** (a red line) go in one and out a random other — every line's exit is drawn 2 s ahead | 2.0 s | 30 %HP | read the exits |
| **Invert** | P2+ | gravity flip, as B1 | 3.0 s | fall + hazards | as B1 |
| **Unmake the Floor** | P2+ | a checkerboard of floor tiles is **unmade** (becomes void — falling in = 50 %HP and back to the entrance edge) for 10 s | 3.0 s | — | stand on the remaining tiles |
| Reflect | all | 1 player copy (as B2) every 40 s | 2.0 s | — | original kills own copy |
| **Unmake Yourself** | P3 | on 2 players: a debuff **Unmaking** that removes 10% of max health every 2 s for 10 s; **cured** by standing in a **portal** (it sends you through and resets you) | — | as said | into a portal |
| **The Last Switch** | P3 | orange **soak** 6 m, **5 pips**, at the Engine's switch | 5.0 s | 120 %HP (one-shot) if short | everyone in — and it switches the Engine **off** at 0% |

**Dialog:** pull (banner) — "No, no, no — don't touch that. Or do! It's all coming apart anyway." · Portal Net ⚠ — "In one door, out another!" · Unmake ⚠ (banner) — "Let's see what you were made of." · death — "Did it... stop? ...Oh. Good."
**Heroic:** Portal Net has 6 portals. **Mythic+:** Unmake the Floor and Invert together once per phase.
**Loot:** `it_brass_arm_harness` (medium chest — 4 extra arms, cosmetic), `it_unmakers_rod` (wand), `it_rift_shard_ring` (ring), `set_unmakers_apron` pieces (helm, hands), `uq_oddrins_last_letter` **[D-EXCL]** — trinket: use: step through a portal to a point 20 m ahead (like a teleport), leaving a return portal for 6 s (45 s cooldown). `leg_the_unmaking` **[D-EXCL]** — two-handed legendary (staff or weapon, looter's type): every 30 s your next hit **unmakes** the target's defences: −30% armour and resistances for 8 s (bosses: −15%).

### Secret boss — `b_the_finished_thing` — The Finished Thing

**Unlock (assemble):** carry all four **automaton parts** — the **Cogheart** (s1), the **Rift Lens** (s2), the **Brass Hand** (B1), the
**Voice Box** (B2) — and after Oddrin dies, fit them at the **Finishing Bench** (a portal opens in the Unmaking Room). The
blueprints in the Drafting Room show the order: **Hand, Heart, Lens, Voice** (hold E 2 s each; wrong order = the part pops out,
try again; there is no fail). Skipping either sub-boss makes this impossible.
Journal hint: *"Oddrin never finished one thing. The pieces are lying around his workshop, and his machines are guarding them."*

| Field | Value |
|---|---|
| Body | chibi2 human-shaped **automaton** ×2.6, brass and violet crystal, one hand of brass, a lens eye, a cog heart you can see turning (new colour set `automaton`) |
| Health | 200 H |
| Phases | 100–70% · 70–35% · 35–0% ("Finished") — each phase it **uses one part more** |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Brass Hand | all | melee + grabs the tank 2 s | — | 20 %HP | tank swap on Heroic when grabbed |
| **Cogheart Pulse** | all | a **moving wave** ring from it, 6 m/s, with a 4 m gap that turns like a cog | 2.0 s | 30 %HP | follow the gap |
| **Lens Eye** | P2+ | Focus Beam that goes **through portals** (4 in the room) | 2.0 s | 8 %HP / 0.5 s | read exits |
| **Voice** | P3 | it speaks with **your** voices: calls a player's name — that player is **targeted** (yellow 6 m) and must go stand in a portal before 3 s | 3.0 s | 60 %HP to everyone within 6 m of them if they don't | through a portal |
| **Finished** | P3 | Invert + Unmake the Floor + a soak (4 pips) in sequence, 4 s apart | 3.0 s each | as each | the recap |

**Dialog:** pull (banner, a voice built from Oddrin's recordings) — "Hello. I was going to be a door. Then a sword. Then a son. I am all of them." · Voice ⚠ — "*<player name>*." · death — "Thank you... for finishing me."
**Loot:** `it_automaton_plating` (heavy chest), `it_violet_lens_eye` (off-hand orb), `uq_cogheart` **[D-EXCL]** — neck: +4% haste; every 20th hit you land winds you up: +20% haste for 4 s. **`leg_the_finished_thing` [SECRET] [D-EXCL]** — trinket legendary: use: build a **brass double** of yourself for 12 s that copies your abilities at 40% power (120 s cooldown).

### Set dropped here

`set_unmakers_apron` — The Unmaker's Apron (4 pieces: legs, chest, helm, hands; medium armour). Brief: 2 = +10% damage for 4 s after you take a portal or are moved by a flip/knockback, 4 = your dodge roll can pass through one enemy telegraph without being hit once every 20 s (shown as a violet charge).

---

## d13 — Cindergate Bastion

### Card

| Field | Value |
|---|---|
| id | `d13_cindergate` |
| Region | The Emberthrone (`emberthrone`) |
| Levels | 54–57 (opens at 53) · Heroic 60 · Mythic+ 60 |
| Looks | `cinderworks` (reuse) and **bastion** (new `ember_bastion`: black basalt walls, red-glass arrow slits, chains, lava channels — §20) |
| Entrance | **the Cindergate**, the fortress across the Ashfall Pass 5 km north of Last Light. Last Light's siege line is dug in before it; the party goes in through a breach the sappers opened. |
| Quest giver | `npc_marshal_idra_vance`, Marshal of Last Light |
| Story quest | `q_break_the_cindergate` — "Break the Cindergate": open the gate from inside so Last Light's army can march on the Ember Court |
| Run time target | Normal 35 min · Heroic 35 min · Mythic+ par **39:00** |
| Ember Shrines | the Breach · after Gatekeeper Varrow · after the Slag Colossus |
| Forces needed | ≈ 120 F |
| New lessons | **multi-soaks** (several soaks at once, the group must split right), **overlapping patterns**, **hard tank swaps** (a debuff that kills the tank if not swapped) |

### Story hook

The **Ember Legion** holds the only pass into the Emberthrone with a fortress called the Cindergate. Marshal Idra Vance has thrown
Last Light's army at its walls for a month. Her sappers finally opened a breach in the undercroft, and the last knight who went through
it — Ser Aldric Moor, carrying the **Standard of Last Light** — did not come out. The gate's mechanism is at the top of the bastion,
guarded by the Lord Castellan himself. Open it, and the Ember Court is next.

### Layout

```
                        ? The Gate's Heart (secret: carry the Standard of Last Light to the Castellan and plant it)
                                     |
                 [B4] THE GATE MECHANISM (end; top of the bastion)
                                     |
                              (S3) Chain Room
                                     |
   [s2] Pyre Chapel ====== [B3] THE MUSTER HALL (Commander)
                                     |
                           [B2] THE SLAG WORKS (Colossus)
                                     |
                                   (S2)
                                     |
   [s1] Ballista Walk ===== [B1] THE INNER GATE (Varrow)
                                     |
                           Barracks of Ash
                                     |
                           Undercroft (Ser Aldric's body + the Standard)
                                     |
                      (S1) the Breach <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| the Breach | 12×12, rubble | S1, Keystone Font |
| Undercroft | 20×40, lava channels (2 m wide, **void zones**: 8 %HP / 0.5 s) | packs 1–2; **Ser Aldric's body** with the **Standard** (see Secret) |
| Barracks of Ash | 30×30 | packs 3–4 |
| The Inner Gate | 30×24, a portcullis in the middle | B1 Varrow |
| Ballista Walk | 8×50, wall-top, 3 siege ballistas | s1 Torven (optional) |
| The Slag Works | 34×30, lava channels in a grid | B2 the Slag Colossus; S2 before it |
| The Muster Hall | 32×32 | B3 Commander Kaelis |
| Pyre Chapel | 18×20 | s2 Ilsabet (optional) |
| Chain Room | 14×14, the gate chains | S3, pack 5 |
| The Gate Mechanism | 40×36, great wheel and chains, open to the sky and the red glow of the Emberthrone | END Lord Castellan Vorhane |
| The Gate's Heart | 30×30, inside the gate's furnace core | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_ember_legionnaire` | Ember Legionnaire | chibi2 human, black plate with red-glass inlay, tower shield, short sword | 1.5 | **Shield Wall**: packs of 3+ legionnaires side by side take −40% damage from the front. **Stab** 10 %HP. |
| `m_ember_arbalest` | Ember Arbalest | chibi2 human, heavy crossbow | 1.2 | **Bolt**: red line 1 m × 35 m, 2.0 s, 30 %HP. |
| `m_ember_pyre_priest` | Pyre Priest | chibi2 human, ash-grey robes, a brazier-staff | 1.2 | **Pyre Blessing** (i) 2.5 s: +30% damage and a fire shield (reflects 10%) on an ally, 15 s (dispellable). **Immolate**: 1 player, 3 %HP a second 10 s, **spreading** 4 m. |
| `m_ember_knight_captain` | Ember Knight-Captain (elite) | chibi2 human ×1.5, great helm, flame-edged greatsword | 4.5 | **Burning Sweep**: 180° red cone 8 m, 2.0 s, 35 %HP. **Rally**: all legionnaires within 15 m +20% damage. |
| `m_fiend_cinder_imp` | Cinder Imp | creature imp ×1.1 | 0.5 | groups of 4; **Firebolt** 8 %HP; **Blink** away when hit twice. |
| `m_fiend_ashhound` | Ashhound | creature hound ×1.8, black with lava cracks | 1.5 | **Scorch Bite** 12 %HP + burn; on death a 3 m fire **void zone** 8 s. |
| `m_elemental_magma_elemental` | Magma Elemental | creature elemental ×1.8, lava | 2 | **Eruption**: 3 red circles 3 m round a player, 2.0 s, 25 %HP. Takes −50% fire damage. |
| `m_fiend_gate_brute` | Gate Brute (elite) | creature titan ×1.5, fiendish, chains wrapped round the arms | 5 | **Chain Lash**: 12 m line, 2.0 s, 35 %HP + pull 5 m. **Ground Pound**: 8 m circle, 2.5 s, 40 %HP. |
| `m_construct_legion_ballista` | Legion Ballista | creature turret ×1.6 (a ballista on wheels) | 1.5 | **Siege Bolt**: red line 3 m × 50 m, 3.0 s, 70 %HP + knockback. |

| # | Room | Pack |
|---|---|---|
| 1 | Undercroft, near | 4 Legionnaires (shield wall) + 1 Pyre Priest |
| 2 | Undercroft, far | 2 Ashhounds + 4 Cinder Imps + 1 Magma Elemental |
| 3 | Barracks of Ash, bunks | 1 Knight-Captain + 3 Legionnaires + 2 Arbalests |
| 4 | Barracks of Ash, forge | 1 Gate Brute + 2 Pyre Priests |
| 5 | Chain Room | 1 Knight-Captain + 1 Gate Brute + 1 Pyre Priest (the hardest pack in the game before d14; pull the brute away) |
| — | *patrol* Barracks ↔ Inner Gate | 3 Legionnaires + 1 Arbalest, 50 s loop |

### Sub-bosses

#### s1 · `b_torven_ballista_master` — Torven, the Ballista Master

Body: chibi2 human ×1.6, siege-engineer's leathers, a hand crank. Health 52 H. Ballista Walk (optional; he crews 3 ballistas). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Crank Swing | melee | — | 18 %HP | — |
| **Three Bolts** | the 3 ballistas fire red lines 3 m × 50 m down the wall walk at once, one after another 1 s apart | 3.0 s | 70 %HP each | the gaps between the lines move — step twice |
| Loader | 2 Legionnaires every 30 s reload a ballista (kill them before they reach it, or a 4th bolt joins) | — | — | kill loaders |

**Loot:** `it_siege_crank` (one-handed mace), `it_engineers_leathers` (light chest), `uq_torvens_sighting_lens` **[D-EXCL]** — neck: +15% damage with line-shaped attacks against targets more than 20 m away.

#### s2 · `b_pyre_priestess_ilsabet` — Pyre Priestess Ilsabet

Body: chibi2 human (woman) ×1.7, ash-white robes, a burning censer on a chain. Health 50 H. Pyre Chapel (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Censer Chain | 10 m reach | — | 16 %HP | — |
| **Immolation Chain** | **spreading** DoT on 2 players (as Pyre Priests), 4 m | — | 4 %HP a second | the two spread far; the healer dispels one at a time (each dispel jumps it once more unless the target is alone) |
| **Pyre** | orange **soak** 4 m, 2 pips **and** a red 6 m **danger zone** on her, at once | 3.5 s | 90 %HP if short / 45 %HP in the red | 2 soak, rest out |

**Dialog opportunity — "Doubt"** (at 30%): "The Ember King promised us we would not burn. Does he lie?" · "He lies. Come to Last Light." → she stops, burns her own vestments and walks out (**no loot**, but the whole party gets **Pyre-Proof**: −15% fire damage taken for the rest of the run). · "Burn, then." → fight on.
**Loot:** `it_pyre_censer` (off-hand), `it_ash_white_robes` (cloth chest), `uq_ilsabets_doubt` **[D-EXCL]** — ring: −10% fire damage taken; your dispels also give the target a barrier of 5% max health.

### Main bosses

#### B1 · `b_gatekeeper_varrow` — Gatekeeper Varrow

| Field | Value |
|---|---|
| Body | chibi2 human ×2.2, plate welded shut, a key-shaped greataxe, the inner portcullis chain wound round his arm |
| Health | 160 H |
| Phases | 100–60% · 60–25% (the portcullis drops: the room splits in two halves joined by a 4 m gap) · 25–0% |
| Teaches | **multi-soaks** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Key Axe | all | melee | — | 20 %HP | — |
| **Three Locks** | all | **three** orange **soaks** at once: 1 pip, 2 pips, 2 pips (numbers shown), 4 m each, far apart | 4.0 s | any short: 80 %HP to everyone | split 1 / 2 / 2 (the tank takes the 1) |
| **Portcullis** | P2 | the gate drops: the room is two halves; soaks now appear 2 on one side, 1 on the other | 3.0 s (chain rattles) | 110 %HP if under it | read which side needs who |
| Key Turn | all | a red **cross** from him, then rotates 45° and hits again | 2.0 + 1.5 s | 35 %HP each | corners, then step |
| Gate Guard | P3 | 2 Legionnaires every 20 s | 1.5 s | — | cleave |

**Dialog:** pull (banner) — "No one comes through this gate. I am the lock." · Three Locks ⚠ (banner) — "Three locks. Three keys. Choose." · Portcullis ⚠ — "Down it comes!" · death — "The gate... is still... locked..."
**Heroic:** soaks are 2 / 2 / 1 + a 4th of 0 pips that is a **danger zone** (don't soak that one). **Mythic+:** Key Turn and Three Locks overlap.
**Loot:** `it_key_shaped_greataxe` (two-handed axe), `it_welded_plate_helm` (heavy helm), `set_emberbane_plate` piece (legs), `uq_varrows_key` **[D-EXCL]** — trinket: while you stand in a soak, allies in the same soak take 10% less from it.

#### B2 · `b_slag_colossus` — The Slag Colossus

| Field | Value |
|---|---|
| Body | creature titan ×3.2, cooling slag over a lava core, riveted legion armour plates |
| Health | 175 H |
| Phases | 100–50% · 50–0% (the plates fall: it hits harder, moves faster) |
| Teaches | **hard tank swaps** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Molten Grip** | all | melee on tank + **Molten** stack: 1 %HP a second **per stack**, 30 s, never falls off by itself; at **6 stacks** the tank **erupts** (8 m circle, 100 %HP to everyone near, and the tank dies) | — | 18 %HP + stacks | **swap tanks** at 3–4 stacks. Stacks fall off only when the tank stops being hit for 12 s. On **Normal**, the Slag Works' **quench channel** (a green **beneficial** strip) clears stacks; a follower tank or a Damage player with a taunt holds for 6 s. On Heroic/Mythic+ there is no quench: two tanks, or a Damage-with-taunt class (fighter, demon hunter, dragon knight, runesmith, druid bear, knight). |
| **Slag Flood** | all | the grid's lava channels overflow: a red **checkerboard** of 6 m cells | 2.5 s | 50 %HP | unlit cells |
| Rivet Burst | all | 8 yellow **targeted** 3 m circles, 1 per player + 3 random | 2.0 s | 25 %HP | spread |
| Cooling Crust | P1 | at 75% and 55%: −70% damage taken 10 s unless hit by frost (ice element) or pushed into a quench channel | 1.5 s | — | frost / knockback |
| **Collapse** | P2 | slag rains: 3 red circles 6 m **overlapping** a Slag Flood | 3.0 s | 60 %HP | the one cell outside both |

**Dialog** (none; a hiss of steam; the legion's engineers shout from the balcony): "Keep it hot!" · "Flood the channels!" (⚠ Slag Flood) · death — the engineers: "It's cooling! Run!"
**Heroic:** eruption at 5 stacks. **Mythic+:** eruption at 4 stacks; swaps at 2.
**Loot:** `it_slag_riveted_plate` (heavy chest), `it_colossus_core_fragment` (off-hand orb), `set_emberbane_plate` piece (shoulders), `uq_quench_seal` **[D-EXCL]** — belt: when a stacking debuff on you would reach its maximum, remove it and gain −20% damage taken for 4 s (60 s cooldown).

#### B3 · `b_commander_kaelis` — Commander Kaelis Ashfell

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.0 (a turncoat Moonwell elf in legion plate), twin flame-sabres, a red cloak |
| Health | 170 H |
| Phases | 100–65% · 65–30% (musters the legion) · 30–0% ("Last Stand of the Legion") |
| Teaches | **overlapping patterns** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Sabre Dance | all | melee, 4 hits + **Scorched** (−3% armour, max 10) | — | 4 × 6 %HP | tank swap at 6 (Heroic) |
| **Crossfire** | all | 2 Arbalests on the balcony fire red lines 1 m × 35 m in an **X** across the hall; at the same time Kaelis's **Blade Wave** (moving wave, 5 m/s from her, a gap) | 2.5 s + 2.0 s | 30 %HP each | find the gap that is not on the X |
| **Muster** | P2 | a line of 6 Legionnaires in shield wall marches across the hall (a **moving wall**, 2 m/s): touching it = 20 %HP + pushed | 2.0 s | — | go round the ends or kill a hole in it (the wall has 2 H per legionnaire) |
| Fire Order | P2+ | 3 **targeted** yellow circles 5 m + 1 soak (3 pips) | 3.0 s | 30 %HP / 90 %HP if short | spread and soak at once |
| **Last Stand** | P3 | room-wide (u) 4 s; **safe zone**: behind the Legionnaires' shields (blue arcs 3 m behind each surviving legionnaire) — keep 2 alive on purpose | 4.0 s | 110 %HP | a real choice: leave shields standing |

**Dialog opportunity — "The turncoat"** (at pull, only if a player is an **Elf**): "Sister of the Moonwell. Come over — the Ember King keeps his promises." · "The moon keeps better ones." → she hesitates: −10% health. · "What did he promise you?" → "That I'd never be cold." Fight normally; her death line changes. · (no elf) no dialog.
**Dialog:** Crossfire ⚠ — "Archers, cross!" · Muster ⚠ (banner) — "LEGION, ADVANCE!" · Last Stand ⚠ (banner) — "Shields up! Hold them!" · death — "Cold... he said... never cold..."
**Heroic:** Muster walls from both ends. **Mythic+:** Fire Order and Crossfire in the same 3 s.
**Loot:** `it_flame_sabre` (one-handed sword, pair), `it_turncoats_cloak` (back), `set_emberbane_plate` piece (hands), `uq_never_cold` **[D-EXCL]** — heavy wrists: immune to Chill and freeze; +15% fire damage taken (a real trade, marked in red on the tooltip).

#### END · `b_castellan_vorhane` — Lord Castellan Vorhane

| Field | Value |
|---|---|
| Body | chibi2 human ×2.6, ornate black plate with a furnace in the chest (glowing grille), a flaming tower-shield and a war-pick |
| Health | 220 H |
| Phases | 100–70% · 70–45% (the gate wheel turns: the floor rotates slowly, 6°/s) · 45–20% · 20–0% ("The Gate Falls") |
| Enrage | 8:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| War-Pick | all | melee + **Pierced** stack (+10% damage taken from him per stack, max 10) | — | 20 %HP | **hard tank swap at 4** (Heroic/Mythic+); Normal: a quench grate by the wheel clears it |
| **Furnace Heart** | all | his chest opens: a 60° red cone 25 m | 2.5 s | 60 %HP + burn | behind or beside |
| **Garrison Soak** | all | 2 orange soaks (3 pips and 2 pips) at opposite ends + a yellow **targeted** on the healer | 4.0 s | 100 %HP if short | split 3/2; the healer runs from both |
| Wheel Turn | P2+ | the floor rotates; every telegraph **rotates with it** (they are painted on the floor) | — | — | move with the floor |
| **Chain Snap** | P3 | 4 gate chains snap and whip: 4 red lines 2 m × 36 m that sweep 90° | 2.5 s | 50 %HP | stand where no chain sweeps (the chain anchors glow) |
| **The Gate Falls** | P4 | every ability at once on a 20 s loop, the room-wide **Ember Tide** (u) 5 s every 40 s — **safe zone** = the 2 blue rings of the gate's quench cisterns, which **move** with the wheel | 5.0 s | 120 %HP | the finale |

**Dialog:** pull (banner) — "Last Light sends its last. How fitting." · Furnace ⚠ — "Feel the fire that keeps this gate." · Garrison ⚠ — "Hold the line! Both ends!" · Chain Snap ⚠ (banner) — "Cut them loose!" · Gate Falls (banner) — "If the gate falls, it falls on YOU." · death — "The King... will... burn you... at his court..."
**After the kill:** the gate opens; Last Light's army horns sound (a world state for `r04_ember_court`, page 13).
**Heroic:** Garrison Soak needs 3/3; the tank swap at 3. **Mythic+:** Chain Snap sweeps both ways.
**Loot:** `it_flaming_tower_shield` (shield), `it_castellan_war_pick` (one-handed axe/pick), `it_furnace_grille_plate` (heavy chest), `set_emberbane_plate` pieces (helm, chest), `uq_gate_key_of_the_ember` **[D-EXCL]** — trinket: use: you and 4 nearest allies take −20% damage for 6 s (120 s cooldown). `leg_the_cindergate` **[D-EXCL]** — shield legendary: every block builds **Heat** (max 10); at 10 your next hit releases the Furnace Heart: a 60° cone 12 m for 300% weapon damage.

### Secret boss — `b_first_flame_of_the_gate` — The First Flame of the Gate

**Unlock (carry):** pick up the **Standard of Last Light** (`it_standard_of_last_light`) from Ser Aldric's body in the Undercroft and
**carry it to the Castellan**. The carrier moves 15% slower, cannot dodge roll, and takes +10% damage. If the carrier dies,
the standard falls and **burns in 10 s** unless another player picks it up. Pass it (drop + pick up) any time. The standard must be
**held** (not in a bag — it cannot be bagged) when the Castellan dies. Plant it in the Gate Mechanism (hold E 3 s): the gate's furnace
core opens.
Journal hint: *"Ser Aldric went in with the standard. The gate should see it again."*

| Field | Value |
|---|---|
| Body | creature elemental ×4.2, a pillar of white-gold fire with a crowned head (the flame that was lit when the gate was forged) |
| Health | 230 H |
| Phases | 100–65% · 65–30% · 30–0% ("Kindle") |
| Enrage | 9:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Flame Lash | all | melee + Pierced | — | 22 %HP | hard swap at 4 |
| **The Standard** | all | the planted standard is a blue **safe zone** 5 m for any room-wide; the flame **moves** the standard once per phase (a white **tether** from flame to standard, 3 s) | — | — | re-plant it (carrier: hold E 2 s) |
| Kindling | all | 3 soaks (2/2/1) + 3 targeted | 4.0 s | 100 %HP short / 30 %HP | split |
| Ember Tide | all | room-wide (u) 5 s | 5.0 s | 120 %HP | the standard |
| **Kindle** | P3 | the room is a checkerboard that **flips twice** while a cross rotates | 3.0 s | 60 %HP | the capstone pattern |

**Dialog:** pull (banner) — "A banner? Here? No one has carried a banner into me in six hundred years." · death — "Carry it... through... then."
**Loot:** `it_white_gold_crown` (medium helm), `it_first_flame_brand` (one-handed sword), `uq_banner_of_last_light` **[D-EXCL]** — back: allies within 10 m take 5% less damage; you take 5% more. **`leg_the_first_flame` [SECRET] [D-EXCL]** — two-handed legendary (the looter's type): your attacks set a **Kindling** mark; at 5 marks the enemy bursts into a 6 m white fire for 200% weapon damage and the fire spreads the marks to everything it hits.

### Set dropped here

`set_emberbane_plate` — Emberbane Plate (5 pieces: legs, shoulders, hands, helm, chest; heavy armour). Brief: 2 = +15% fire resistance, 4 = when you take a tank-swap debuff stack, gain a barrier of 2% max health per stack you carry, 5 = soaking with 2+ allies gives the soak −15% damage for everyone in it.

---

## d14 — The Ashen Reliquary

### Card

| Field | Value |
|---|---|
| id | `d14_ashen_reliquary` |
| Region | The Emberthrone (`emberthrone`) |
| Levels | 58–60 (opens at 58) · Heroic 60 · Mythic+ 60 |
| Looks | **reliquary** (new `ash_reliquary`: grey ash floors, obsidian pillars, gold reliquary niches, ember motes in the air — §20), `hoard` for the treasury |
| Entrance | **the Reliquary Steps**, inside the Emberthrone caldera, 8 km north-west of Last Light: an obsidian stair down into the caldera wall, sealed by a relic door |
| Attunement | `q_ashen_reliquary_key` — "The Relic Key", from `npc_keeper_oswin_ashlow` in Last Light: 5 steps across the Emberthrone (page 14 owns the steps); opens the relic door for that character |
| Quest giver | `npc_keeper_oswin_ashlow` |
| Story quest | `q_the_kings_reliquary` — "The King's Reliquary": the Ember King keeps his power in relics. Break the relics before the Ember Court |
| Run time target | Normal 38 min · Heroic 38 min · Mythic+ par **40:00** |
| Ember Shrines | the Relic Door · after the Custodian · after High Ashpriest Morvaine · after Ashwing |
| Forces needed | ≈ 126 F |
| Lessons | **everything, layered**: each main boss recaps two earlier dungeons' lessons at once |

### The Seals (dungeon-wide, new)

Five **Reliquary Seals** (gold-and-ember reliquaries) stand in the dungeon (one per wing, marked on the map as "?" until found).
Each is a 3 H object guarded by a pack; **breaking** it (a 2 s channel after its guards die) gives the party **+3% damage and healing**
for the run and strips one ability from the Ember Herald (END) — each seal lists which. All 5 = one part of the Secret.

### Story hook

The Ember King does not keep his power in himself. He keeps it in **relics** — bones, crowns, hearts of the kings and heroes he burned —
in a reliquary sunk in the caldera wall, tended by ash priests who have never seen daylight. Keeper Oswin of Last Light spent forty years
stealing the key. Break the relics, and the Ember King walks into his own court weaker than he has been in a thousand years. His Herald,
Sarn Veydrec, is waiting in the Reliquary to make sure you don't.

### Layout

```
                                 ? The First Ember (secret: 5 seals broken + no deaths + the Herald's parley refused)
                                            |
                       [B4] THE HERALD'S NAVE (end)
                                            |
                                  (S4) Ashfall Stair
                                            |
      [seal 5] Phoenix Roost [s2]  == [B3] THE CINDER DOME (Ashwing)
                                            |
                                          (S3)
                                            |
      [seal 4] Scriptorium [s1] ==== [B2] THE ASH ALTAR (Morvaine)
                                            |
                                          (S2)
                                            |
      [seal 3] Bone Gallery ======== [B1] THE CUSTODIAN'S VAULT
                                            |
      [seal 2] Censer Walk ---------- Hall of Urns   [seal 1]
                                            |
                              (S1) the Relic Door <-- entrance
```

| Room | Size (m) | Holds |
|---|---|---|
| the Relic Door | 14×14 | S1, Keystone Font |
| Hall of Urns | 30×30 | packs 1–2, **seal 1** (strips *Herald's Command* adds) |
| Censer Walk | 10×40, swinging censers (a red line swings across every 5 s: 1.5 s, 25 %HP) | pack 3, **seal 2** (strips *Ember Tithe*) |
| The Custodian's Vault | 32×32 | B1 the Relic Custodian |
| Bone Gallery | 12×44 | packs 4–5, **seal 3** (strips *Crown of Ash* phase) |
| The Ash Altar | 30×30 | B2 Morvaine; S2 before it |
| Scriptorium | 20×20 | s1 the Ash Scribe (optional), **seal 4** (strips *Burning Word*) |
| The Cinder Dome | 36×36, open to a shaft of red sky | B3 Ashwing; S3 before it |
| Phoenix Roost | 20×20, a nest of embers | s2 Emberbrood (optional), **seal 5** (strips *Rebirth*) |
| Ashfall Stair | 10×30, ash falls like snow | S4, pack 6 |
| The Herald's Nave | 42×42 | END Sarn Veydrec |
| The First Ember | 34×34 | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_humanoid_ash_priest` | Ash Priest | chibi2 human, grey skin, eyes sewn shut, a bone censer | 1.3 | **Ash Hymn** (i) 2.5 s: heals allies 25%; **Blind Faith**: can't be blinded or charmed. |
| `m_humanoid_ash_zealot` | Ash Zealot | chibi2 human, ash-smeared, two burning sickles | 1.5 | **Self-Immolate** at 25%: runs at the nearest player, 3 m burst after 2 s, 40 %HP. Kill or stun. |
| `m_undead_ash_wraith` | Ash Wraith | creature wraith ×1.6, grey ash, ember eyes | 1.5 | **Smother**: white **tether** to a player 3 s, silence + 5 %HP a second; break by distance (14 m). |
| `m_construct_relic_golem` | Relic Golem (elite) | creature golem ×2.4, obsidian with a gold reliquary chest | 5 | **Relic Slam**: 8 m circle, 2.5 s, 40 %HP. **Relic Ward**: soaks the next 20% of its health in damage every 20 s (gold shield). |
| `m_fiend_ember_imp_cantor` | Ember Cantor | creature imp ×1.3, with a tiny bell | 0.8 | **Chant**: +15% haste to fiends within 15 m (dispellable, stacking 3). |
| `m_beast_ash_phoenixling` | Phoenixling | creature phoenix ×1.0 | 0.7 | **Rekindle**: rises once after death at 50% unless its ash pile is stood on for 1 s. |
| `m_undead_burned_hero` | Burned Hero (elite) | chibi2 (any race) undead ×1.6 in burned plate — relics of heroes the King burned; each wears a random old dungeon set's look | 4 | **Old Technique**: uses one of: Grave Dig (d01), Tongue tether (d02), Powder Keg soak (d03), Court Dance checkerboard (d05) — shown by the icon over its head. |
| `m_elemental_cinder_sprite` | Cinder Sprite | creature elemental ×0.8 | 0.5 | **Flare** 3 m, 1.2 s, 12 %HP; grows as d04's Cinder Spawn. |
| `m_aberration_reliquary_mimic` | Reliquary Mimic | creature mimic ×1.8, a gold reliquary | 3 | disguised as a seal's decoy (2 per seal room, only 1 real seal): **Gulp** 30 %HP. A light spell or 3 s of looking (hover) reveals it. |

| # | Room | Pack |
|---|---|---|
| 1 | Hall of Urns, west | 3 Ash Priests + 2 Ash Zealots |
| 2 | Hall of Urns, east (seal 1 guards) | 1 Relic Golem + 2 Ash Wraiths + 1 Reliquary Mimic |
| 3 | Censer Walk (seal 2 guards) | 2 Burned Heroes + 3 Ember Cantors |
| 4 | Bone Gallery, near | 3 Ash Wraiths + 2 Ash Priests |
| 5 | Bone Gallery, far (seal 3 guards) | 1 Relic Golem + 1 Burned Hero + 1 Reliquary Mimic |
| 6 | Ashfall Stair | 2 Relic Golems (elite pair) + 4 Phoenixlings |
| — | Scriptorium (seal 4 guards) | 3 Ash Priests + 1 Burned Hero |
| — | Phoenix Roost (seal 5 guards) | 6 Phoenixlings + 4 Cinder Sprites |

### Sub-bosses

#### s1 · `b_the_ash_scribe` — The Ash Scribe

Body: chibi2 human ×1.8, grey, a quill of bone as long as a spear, a book of burned names. Health 60 H. Scriptorium (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Quill Stab | melee | — | 20 %HP | — |
| **Write Your Name** | writes a player's name in the book: that player gets a **tether** to the book (a reliquary lectern); at 8 s the name **burns** (60 %HP) unless the player breaks the tether (18 m) **or** an ally interrupts the Scribe (i) | 2.5 s cast (i) | 60 %HP | interrupt or run |
| Ink of Ash | 3 **void zones** 4 m, 30 s | 1.5 s | 5 %HP / 0.5 s | move |

**Loot:** `it_bone_quill` (spear), `it_book_of_burned_names` (off-hand focus), `uq_unwritten` **[D-EXCL]** — neck: once every 60 s, a hit that would kill you is written off: you take none of it and gain 2 s of immunity to that attacker.

#### s2 · `b_emberbrood` — Emberbrood

Body: creature phoenix ×3.6, red-gold, a nest of embers under her. Health 64 H. Phoenix Roost (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Talon Dive | red line 3 m × 20 m | 1.8 s | 30 %HP | aside |
| Hatch | 3 Phoenixlings every 20 s | 1.5 s | — | kill, stand on the ash |
| **Rebirth** | at 0% she becomes an **egg** (10 H) for 10 s; if not broken, she reborns at 40% | — | — | burst the egg |

**Loot:** `it_phoenix_down_mantle` (cloth shoulders), `it_ember_nest_ring` (ring), `uq_twice_born` **[D-EXCL]** — chest (any type): once per fight, when you would die, become an egg for 3 s (immune), then hatch at 30% health.

### Main bosses

#### B1 · `b_relic_custodian` — The Relic Custodian

| Field | Value |
|---|---|
| Body | creature golem ×3.4, obsidian and gold, four reliquary doors in its body that open (each holds a relic that powers one ability) |
| Health | 200 H |
| Phases | 100–75% · 75–50% · 50–25% · 25–0% — each phase **one reliquary door opens** and adds its ability |
| Recaps | **d03** (soak + line of sight) and **d04** (tank swap + room-wide with safe zone) |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Relic Fist | all | melee + **Relic Brand** (+12% damage taken per stack, max 10) | — | 22 %HP | tank swap at 4 (Heroic); Normal: a follower/Damage taunt |
| **Miner's Heart** (door 1) | P1+ | orange soak 5 m, 3 pips | 4.0 s | 100 %HP if short | three in |
| **Seven's Pulse** (door 2) | P2+ | room-wide (u) 3.5 s; **line of sight** behind 4 reliquary pillars | 3.5 s | 110 %HP | hide |
| **Bellows' Breath** (door 3) | P3+ | room-wide (u) 4 s; **safe zones**: 2 of 4 blue rings | 4.0 s | 120 %HP | the lit two |
| **All Doors** (door 4) | P4 | a soak and a Pulse in the same 4 s: soak **behind** a pillar (the soak spawns in a pillar's shadow) | 4.0 s | as each | both at once |

**Dialog** (a grinding voice from the reliquaries): pull (banner) — "Relics are not touched. Relics are kept." · each door (banner) — "Open the first." / "...the second." / "...the third." / "ALL." · death — "Kept... no longer..."
**Heroic:** swap at 3; all doors open 10% earlier. **Mythic+:** Relic Brand max 6 — at 6 the tank dies (as d13's Molten).
**Loot:** `it_obsidian_reliquary_plate` (heavy chest), `it_custodian_doorkey` (neck), `set_reliquary_ash` piece (legs), `uq_four_doors` **[D-EXCL]** — trinket: every 15 s your next spell gets a random one of: +30% damage, −50% cost, instant cast, +50% area.

#### B2 · `b_high_ashpriest_morvaine` — High Ashpriest Morvaine

| Field | Value |
|---|---|
| Body | chibi2 human ×2.2, very tall and thin, grey robes, eyes sewn shut with gold wire, a staff topped with a burning skull |
| Health | 205 H |
| Phases | 100–66% · 66–33% (the altar ignites) · 33–0% ("Burn the Unbelievers") |
| Recaps | **d06** (dispel + curses) and **d11** (interrupt rotation + positional) |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Skull Staff | all | melee | — | 18 %HP | — |
| **Ash Litany** (i) | all | 2.0 s, **every 4 s**, stacks +8% damage | 2.0 s | — | rotate 3 interrupters |
| **Mark of Ash** | all | curse on 3 players: at 10 s they burst 8 m for 50 %HP; **dispelling** it early makes it jump to the nearest ally (as d13) — unless that player stands **alone** | — | — | cursed players go alone, then dispel |
| **Four Braziers** | P2+ | he names a brazier (N/E/S/W): only a blue 6 m ring by it is safe from **Pyre** (u) 4 s — but in P3 he names the **wrong** one and the brazier that **flares** is right (as d11's False Bell) | 4.0 s | 120 %HP | trust the flare |
| Zealots | P3 | 2 Ash Zealots every 25 s (Self-Immolate) | 1.5 s | 40 %HP | stun, kill |

**Dialog:** pull (banner) — "The King sees you. I have no eyes, and I see you too." · Litany ⚠ — "Ash to ash..." · Braziers ⚠ (banner) — "The **north** fire forgives!" (etc.) · death — "I... see... nothing..."
**Heroic:** Litany every 3.5 s; Mark on 4. **Mythic+:** a jumped Mark keeps its timer.
**Loot:** `it_burning_skull_staff` (staff), `it_gold_wire_blindfold` (cloth helm — blinds nothing, looks like it), `set_reliquary_ash` piece (hands), `uq_eyes_sewn_shut` **[D-EXCL]** — helm: immune to blind; +10% damage for 5 s after you interrupt.

#### B3 · `b_ashwing` — Ashwing, the Reliquary Phoenix

| Field | Value |
|---|---|
| Body | creature phoenix ×5.0, grey-white ash with ember wing-edges (the King's first burned relic, reborn) |
| Health | 215 H (+ **Rebirth**) |
| Phases | 100–60% (grounded) · 60–20% (**airborne**: circles the dome, attacks from above) · 20–0% · **0%: Rebirth** (an ash egg, 20 H, 12 s; if it hatches, she returns at 40%) |
| Recaps | **d05** (beams + checkerboard) and **d10** (warmth — here **coolness** — stacks + falling hazards) |
| Enrage | 8:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Talon | P1, P3 | melee | — | 22 %HP | — |
| **Heat** (dungeon-wide in this room) | all | every 6 s outside shade +1 **Scorch** stack (−3% healing received per stack; at 10: 50 %HP and reset to 5); **shade** = the green **beneficial** shadows of 4 reliquary pillars, which move as the red sky-shaft moves | — | — | stay in shade when you can |
| **Sunbeam** | all | the sky-shaft becomes a beam (red **line** 4 m) that bounces off 4 gold reliquary mirrors | 2.5 s | 10 %HP / 0.5 s | read the path |
| **Ember Checker** | P2 | from the air: checkerboard of red cells, flips once | 3.0 s + 2.0 s | 55 %HP | unlit → step |
| Feather Fall | P2 | 8 red circles 4 m (burning feathers) | 1.8 s | 30 %HP | move |
| **Rebirth** | 0% | an egg; burst it in 12 s | — | — | — |

**Dialog** (none; a keening cry that is the warning for Ember Checker; the Herald's voice echoes from the Nave): "My King's first flame. Mind your eyes."
**Heroic:** the egg has 30 H. **Mythic+:** Scorch at 8 stacks.
**Loot:** `it_ashwing_feather_cloak` (back), `it_ember_edge_glaive` (polearm), `set_reliquary_ash` piece (helm), `uq_first_burned_feather` **[D-EXCL]** — neck: +10% fire damage; 5% of fire damage you deal heals the lowest-health ally within 20 m.

#### END · `b_sarn_veydrec_herald` — Sarn Veydrec, Herald of the Ember King

| Field | Value |
|---|---|
| Body | chibi2 human ×2.6, gilded black armour, a burning herald's staff with a banner of the Ember King, a mask of gold with no mouth (his voice comes from the banner) |
| Health | 260 H |
| Phases | 100–75% · 75–50% · 50–25% (**Crown of Ash** — skipped if seal 3 is broken) · 25–0% ("In the King's Name") |
| Recaps | every earlier lesson; seals strip parts (see §The Seals) |
| Enrage | 9:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay | Seal that strips it |
|---|---|---|---|---|---|---|
| Herald's Staff | all | melee + **Tithe** (+10% damage taken per stack, max 10) | — | 24 %HP | hard tank swap at 4 | — |
| **Herald's Command** | all | 4 Burned Heroes (each with an Old Technique) over the fight | 1.5 s | — | kill fast | seal 1 |
| **Ember Tithe** | all | a white **tether** from each player to the Herald: 1 %HP a second while within 20 m of him; **ranged** stay far, **melee** rotate | — | — | — | seal 2 |
| **Proclamation** | all | 3 soaks (3/1/1) + 2 targeted + the d05 **cross** | 4.0 s | 100 %HP short / 30 / 45 %HP | split and dodge | — |
| **Crown of Ash** | P3 | a darkness phase (as d08's Oruvel): light only from players; Thirst **void zones** + a **donut** every 20 s | 2.5 s | 50 %HP | — | seal 3 (phase skipped: he goes 50% → P4) |
| **Burning Word** (i) | all | 3.0 s: fears the party 3 s | 3.0 s | — | interrupt | seal 4 |
| **Rebirth** | P4 | at 0% he rises once at 15% | — | — | burst again | seal 5 |
| **In the King's Name** | P4 | room-wide **Ember Tide** (u) 5 s every 30 s; **safe zone** = the 5 **broken seals'** ghost-lights (a blue ring for each broken seal — fewer seals, fewer safe spots, **0 seals = 1 ring at the door**) | 5.0 s | 130 %HP | stand in a seal's light |

**Dialog opportunity — "The King's offer"** (at 75% he lowers his staff; combat pauses up to 30 s):

| Reply | Result |
|---|---|
| "Tell him we're coming." | he laughs: the fight goes on. **Needed for the Secret.** |
| "What does he offer?" | "A place at his court. Kneel, and walk in the front door." — sub-choice: **"We kneel."** → the Herald leaves; the dungeon **ends** with a **reduced** reward (the end chest has 1 item instead of 1+25%, no legendary chance) and the character gets the title *"Kneeler"* (removable by finishing `r04_ember_court` — page 13); **"Never."** → fight on (counts as refusing). |
| (silence) | fight on (counts as refusing). |

**Dialog:** pull (banner) — "Keeper Oswin's little thieves. The King knew you would come; he let you." · Proclamation ⚠ (banner) — "Hear the King's decree!" · Crown ⚠ (banner) — "Kneel in the dark." · Burning Word ⚠ — "BOW." · Rebirth — "The King's word does not die." · In the King's Name ⚠ (banner) — "IN THE KING'S NAME!" · death — "He... is... still... burning..."
**Heroic:** swap at 3; Proclamation adds a 4th soak (2). **Mythic+:** In the King's Name every 25 s.
**Loot:** `it_heralds_burning_staff` (staff), `it_gold_mouthless_mask` (medium helm), `it_ember_king_seal_ring` (ring), `it_gilded_black_plate` (heavy chest), `set_reliquary_ash` pieces (chest, shoulders), `uq_the_kings_decree` **[D-EXCL]** — trinket: use: every enemy within 20 m is stunned 1.5 s (bosses: interrupted); 120 s cooldown. `leg_herald_of_ashes` **[D-EXCL]** — off-hand (banner/focus) legendary: carry a banner that plants itself when you stand still 2 s: allies within 8 m deal +8% damage and take 8% less; it moves with you when you walk away. `leg_reliquary_heart` **[D-EXCL]** — neck legendary: each relic-type buff you receive (dungeon seals, raid relics, world buffs) is 50% stronger.

### Secret boss — `b_ashmother_veyra` — Ashmother Veyra, Keeper of the First Ember

**Unlock (three conditions):** (1) all **5 Reliquary Seals** broken; (2) **no player deaths** from the first pull to the Herald's death
(followers on Normal count); (3) at the Herald's 75% offer, **refuse** ("Tell him we're coming" / "Never" / silence). The Herald's banner
falls, burns, and opens a stair to the First Ember.
Journal hint: *"The King keeps relics of everyone he burned. Who kept the relic of the first fire?"*

| Field | Value |
|---|---|
| Body | chibi2 dwarf ×2.8, an old woman of living ash and ember light (material `living_ash`, §20), a smith's apron, carrying a lantern with a single flame inside (the First Ember) |
| Health | 280 H |
| Phases | 100–80% (d01–d04 recap) · 80–60% (d05–d08) · 60–40% (d09–d11) · 40–20% (d12–d13) · 20–0% ("The First Ember") |
| Enrage | 10:00 |

| Phase | Abilities (every number as its original, at level 60 Heroic-equivalent on Normal) |
|---|---|
| 100–80% | **Grave Dig** danger zones on 2 (d01) + **Tongue** tether (d02) + **Powder Keg** soak 3 pips (d03) + **Bellow Blast** room-wide with 2 safe zones (d04) |
| 80–60% | **King's Light** beam with mirrors (d05) + **Weigh the Guilty** scales ±1 (d06) + **Everblight** spreading DoT with a green cleansing pool (d07) + **Moon Clock** donut/star flip (d08) |
| 60–40% | **Warmaster's Challenge** duel ring (d09) + **Chill** stacks with drifting warmth (d10) + **Call to Worship** named bells, with lies (d11) |
| 40–20% | **Invert** gravity (d12) + **Molten** stacks, eruption at 5 — hard tank swap (d13) + **Three Locks** soaks 1/2/2 (d13) |
| 20–0% | **The First Ember**: the lantern opens; one ability from each earlier phase fires in turn every 6 s, and a room-wide **Ember Tide** (u) 5 s every 30 s whose **safe zone** is **her lantern's light** (a 6 m blue ring that she carries — stay close to the boss) |

**Dialog:** pull (banner, warm and tired) — "You walked every road to get here. Let me see if you remember them." · each phase (banner) — "Do you remember the barrow?" / "...the moon?" / "...the pit?" / "...the workshop?" · The First Ember (banner) — "This is the fire he stole. Take it back." · death — "Good. Now go and put him out." (She does not die: she gives the party the First Ember — a quest item that grants an **advantage in `r04_ember_court`**, page 13.)
**Loot:** `it_first_ember_lantern` (light slot), `it_ashmothers_apron` (medium chest), `uq_remember_the_roads` **[D-EXCL]** — neck: +2% damage for each different d01–d14 dungeon you have finished on Heroic (max +28%). **`leg_the_first_ember` [SECRET] [D-EXCL]** — light slot legendary: your light radius is +50%; allies inside your light take 10% less damage from room-wide attacks, and once every 3 minutes a room-wide attack that would kill an ally in your light leaves them at 1 health.

### Set dropped here

`set_reliquary_ash` — Reliquary Ash (6 pieces: legs, hands, helm, chest, shoulders, + a **Heroic-only** waist from the Quartermaster; any armour type — takes the looter's). Brief: 2 = +5% damage and healing inside dungeons and raids, 4 = +1 combat-revive charge for your party per boss fight (does not stack between players), 6 = the first time each boss fight you would be one-shot, survive at 1 health.

---

## 19. Indexes

Generated from the sections above (a data test should regenerate and compare, page 16).

### 19.1 Dungeon summary

| Dungeon | Band | Sub-bosses | Main bosses | End boss | Secret boss | Secret condition (short) |
|---|---|---|---|---|---|---|
| d01 | 5–7 | `b_warren_queen_skritch`, `b_pell_lantern_thief` | `b_sexton_morrow`, `b_mother_ossel` | `b_hollow_thane` | `b_first_sleeper` | return the Thane's ring (spare Pell), the Hound's Collar and the Horn Cup to the bier |
| d02 | 9–12 | `b_bloatleech_matron`, `b_old_pike_sluicewarden` | `b_old_croak`, `b_wren_grist` | `b_the_grindwheel` | `b_the_tithe_below` | tell Wren the truth; sluice levers 1-3-2 within 60 s |
| d03 | 13–16 | `b_foreman_grubnik`, `b_rattlejaw` | `b_nix_candlejaw`, `b_warden_seven` | `b_stonegullet` | `b_the_unmined` | free all 4 trapped miners before the end boss dies |
| d04 | 16–18 | `b_grukk_and_zagga`, `b_slagmaw` | `b_forgemaster_ghorza`, `b_the_great_bellows` | `b_grumvak_kilnbreaker` | `b_bellamund_the_cold_smith` | kill the Great Bellows within 12:00 of the first pull |
| d05 | 19–22 | `b_gilded_brood_mother`, `b_saffa_knifewind` | `b_orrun_the_glassblower`, `b_queen_ammarel` | `b_king_sethar_unshattered` | `b_ithar_the_unseen` | aim the Hall of Mirrors beam at the Sun Door |
| d06 | 22–24 | `b_coffer_that_counts`, `b_hask_the_tunneler` | `b_scales_of_tamar`, `b_qassar_silver_tongued` | `b_the_sand_sovereign` | `b_tamar_the_first` | pull the lever under the Coffer; answer the Riddle Face |
| d07 | 25–28 | `b_silkrot_matriarch`, `b_rakka_bloodbriar` | `b_the_sporefather`, `b_orenn_thornbound` | `b_wyllow_blighted_heart` | `b_gall_sovereign` | cleanse Wyllow (needs Orenn's charm) and keep all 6 Saplings alive |
| d08 | 28–30 | `b_gloamwing`, `b_caelith_pale_huntress` | `b_twin_wardens`, `b_archmage_ilvandor` | `b_oruvel_moon_drinker` | `b_the_drowned_moon` | collect 5 moonshards (Moonless only); kill Oruvel in Moonlit |
| d09 | 31–34 | `b_ogra_beastmaster`, `b_the_moatmother` | `b_brannoc_the_chained`, `b_razorback_rider_krunn` | `b_warmaster_drogath` | `b_old_gnash_undefeated` | win all three Pit Rounds with no deaths |
| d10 | 36–39 | `b_old_whitemaw`, `b_frostsayer_yrsa` | `b_skarr_icebreaker`, `b_rimeweaver_seidra` | `b_rimefang` | `b_old_mother_rime` | all 4 route braziers lit when Rimefang dies |
| d11 | 42–45 | `b_hobb_the_bellringer`, `b_saltshell_matron` | `b_deacon_mourne`, `b_choir_of_brine` | `b_bishop_aldwine` | `b_the_tidewife` | carry 3 hymn pages; Bishop confesses |
| d12 | 48–51 | `b_cogheart_warden`, `b_mira_lensgrinder` | `b_the_gravity_engine`, `b_mirror_apprentices` | `b_oddrin_the_unmaker` | `b_the_finished_thing` | assemble the automaton from 4 parts (Hand, Heart, Lens, Voice) |
| d13 | 54–57 | `b_torven_ballista_master`, `b_pyre_priestess_ilsabet` | `b_gatekeeper_varrow`, `b_slag_colossus`, `b_commander_kaelis` | `b_castellan_vorhane` | `b_first_flame_of_the_gate` | carry the Standard of Last Light to the Castellan and plant it |
| d14 | 58–60 | `b_the_ash_scribe`, `b_emberbrood` | `b_relic_custodian`, `b_high_ashpriest_morvaine`, `b_ashwing` | `b_sarn_veydrec_herald` | `b_ashmother_veyra` | 5 seals broken + no deaths + refuse the Herald's offer |

### 19.2 Every boss (86)

| id | Name | Rank | Dungeon |
|---|---|---|---|
| `b_warren_queen_skritch` | Warren Queen Skritch | sub | d01 |
| `b_pell_lantern_thief` | Pell, the Lantern Thief | sub | d01 |
| `b_sexton_morrow` | Sexton Abel Morrow | main | d01 |
| `b_mother_ossel` | Mother Ossel | main | d01 |
| `b_hollow_thane` | The Hollow Thane (Ulvar Grimbarrow) | end | d01 |
| `b_first_sleeper` | The First Sleeper | secret | d01 |
| `b_bloatleech_matron` | The Bloatleech Matron | sub | d02 |
| `b_old_pike_sluicewarden` | Old Pike, the Sluicewarden | sub | d02 |
| `b_old_croak` | Old Croak | main | d02 |
| `b_wren_grist` | Wren Grist, the Miller's Wife | main | d02 |
| `b_the_grindwheel` | The Grindwheel | end | d02 |
| `b_the_tithe_below` | The Tithe Below | secret | d02 |
| `b_foreman_grubnik` | Foreman Grubnik | sub | d03 |
| `b_rattlejaw` | Rattlejaw | sub | d03 |
| `b_nix_candlejaw` | Nix Candlejaw, the Sootwick Ringleader | main | d03 |
| `b_warden_seven` | Warden Seven | main | d03 |
| `b_stonegullet` | Stonegullet | end | d03 |
| `b_the_unmined` | The Unmined | secret | d03 |
| `b_grukk_and_zagga` | Grukk and Zagga, the Tongsmen | sub | d04 |
| `b_slagmaw` | Slagmaw | sub | d04 |
| `b_forgemaster_ghorza` | Forgemaster Ghorza | main | d04 |
| `b_the_great_bellows` | The Great Bellows (and Imbrasa, the chained flame) | main | d04 |
| `b_grumvak_kilnbreaker` | Warchief Grumvak Kilnbreaker | end | d04 |
| `b_bellamund_the_cold_smith` | Harrow Bellamund, the Cold Smith | secret | d04 |
| `b_gilded_brood_mother` | The Gilded Brood-Mother | sub | d05 |
| `b_saffa_knifewind` | Saffa Knifewind, Dunecutter Chief | sub | d05 |
| `b_orrun_the_glassblower` | Orrun, the Glassblower | main | d05 |
| `b_queen_ammarel` | Queen Ammarel of the Second Glass | main | d05 |
| `b_king_sethar_unshattered` | King Sethar the Unshattered | end | d05 |
| `b_ithar_the_unseen` | Prince Ithar, the Unseen | secret | d05 |
| `b_coffer_that_counts` | The Coffer That Counts | sub | d06 |
| `b_hask_the_tunneler` | Hask the Tunneler | sub | d06 |
| `b_scales_of_tamar` | The Scales of Tamar | main | d06 |
| `b_qassar_silver_tongued` | Qassar the Silver-Tongued | main | d06 |
| `b_the_sand_sovereign` | The Sand Sovereign | end | d06 |
| `b_tamar_the_first` | Tamar the First | secret | d06 |
| `b_silkrot_matriarch` | The Silkrot Matriarch | sub | d07 |
| `b_rakka_bloodbriar` | Rakka Bloodbriar | sub | d07 |
| `b_the_sporefather` | The Sporefather | main | d07 |
| `b_orenn_thornbound` | Orenn Thornbound, the Moonseer | main | d07 |
| `b_wyllow_blighted_heart` | Wyllow, the Blighted Heart | end | d07 |
| `b_gall_sovereign` | The Gall Sovereign | secret | d07 |
| `b_gloamwing` | Gloamwing | sub | d08 |
| `b_caelith_pale_huntress` | Caelith, the Pale Huntress | sub | d08 |
| `b_twin_wardens` | Sael and Nerith, the Twin Wardens | main | d08 |
| `b_archmage_ilvandor` | Archmage Ilvandor | main | d08 |
| `b_oruvel_moon_drinker` | Oruvel, That Which Drank the Moon | end | d08 |
| `b_the_drowned_moon` | The Drowned Moon | secret | d08 |
| `b_ogra_beastmaster` | Ogra the Beastmaster | sub | d09 |
| `b_the_moatmother` | The Moatmother | sub | d09 |
| `b_brannoc_the_chained` | Round One: Brannoc the Chained | main | d09 |
| `b_razorback_rider_krunn` | Round Two: Krunn and Razorback | main | d09 |
| `b_warmaster_drogath` | Round Three: Warmaster Drogath Ashmane | end | d09 |
| `b_old_gnash_undefeated` | Old Gnash, the Undefeated | secret | d09 |
| `b_old_whitemaw` | Old Whitemaw | sub | d10 |
| `b_frostsayer_yrsa` | Frostsayer Yrsa | sub | d10 |
| `b_skarr_icebreaker` | Skarr Icebreaker | main | d10 |
| `b_rimeweaver_seidra` | Rimeweaver Seidra | main | d10 |
| `b_rimefang` | Rimefang | end | d10 |
| `b_old_mother_rime` | Old Mother Rime | secret | d10 |
| `b_hobb_the_bellringer` | Hobb the Bellringer | sub | d11 |
| `b_saltshell_matron` | The Saltshell Matron | sub | d11 |
| `b_deacon_mourne` | Deacon Mourne | main | d11 |
| `b_choir_of_brine` | The Choir of Brine (Alto, Tenor, Bass) | main | d11 |
| `b_bishop_aldwine` | Bishop Aldwine, the Drowned | end | d11 |
| `b_the_tidewife` | The Tidewife | secret | d11 |
| `b_cogheart_warden` | The Cogheart Warden | sub | d12 |
| `b_mira_lensgrinder` | Mira Lensgrinder | sub | d12 |
| `b_the_gravity_engine` | The Gravity Engine | main | d12 |
| `b_mirror_apprentices` | The Mirror Apprentices | main | d12 |
| `b_oddrin_the_unmaker` | Vell Oddrin, the Unmaker | end | d12 |
| `b_the_finished_thing` | The Finished Thing | secret | d12 |
| `b_torven_ballista_master` | Torven, the Ballista Master | sub | d13 |
| `b_pyre_priestess_ilsabet` | Pyre Priestess Ilsabet | sub | d13 |
| `b_gatekeeper_varrow` | Gatekeeper Varrow | main | d13 |
| `b_slag_colossus` | The Slag Colossus | main | d13 |
| `b_commander_kaelis` | Commander Kaelis Ashfell | main | d13 |
| `b_castellan_vorhane` | Lord Castellan Vorhane | end | d13 |
| `b_first_flame_of_the_gate` | The First Flame of the Gate | secret | d13 |
| `b_the_ash_scribe` | The Ash Scribe | sub | d14 |
| `b_emberbrood` | Emberbrood | sub | d14 |
| `b_relic_custodian` | The Relic Custodian | main | d14 |
| `b_high_ashpriest_morvaine` | High Ashpriest Morvaine | main | d14 |
| `b_ashwing` | Ashwing, the Reliquary Phoenix | main | d14 |
| `b_sarn_veydrec_herald` | Sarn Veydrec, Herald of the Ember King | end | d14 |
| `b_ashmother_veyra` | Ashmother Veyra, Keeper of the First Ember | secret | d14 |

### 19.3 Every dungeon monster (127 rows, 126 distinct — the Sandcaller is listed in d05 and d06; page 10 owns the families and AI — these ids are new unless marked)

| id | Name | Body | H | First seen |
|---|---|---|---|---|
| `m_undead_barrow_shambler` | Barrow Shambler | chibi2 undead, grave rags, bare hands | 1 | d01 |
| `m_undead_barrow_bowman` | Barrow Bowman | chibi2 undead, short bow | 0.8 | d01 |
| `m_beast_cairn_rat` | Cairn Rat | creature rat ×1.6 | 0.3 | d01 |
| `m_undead_grave_hound` | Grave Hound | creature hound ×1.3, bone-plated | 1 | d01 |
| `m_undead_bone_mender` | Bone Mender | chibi2 undead, robe, bone staff | 0.8 | d01 |
| `m_humanoid_grave_robber` | Grave Robber | chibi2 human, hood, shovel | 1 | d01 |
| `m_undead_barrow_guard` | Barrow Guard (elite) | chibi2 undead ×1.3, round shield, hand axe | 3 | d01 |
| `m_beast_tomb_moth` | Tomb Moth | creature moth ×1.3, grey | 0.5 | d01 |
| `m_undead_drowned_millhand` | Drowned Millhand | chibi2 undead, waterlogged smock, sack hook | 1 | d02 |
| `m_beast_fen_leech` | Fen Leech | creature worm ×0.5, pale green | 0.4 | d02 |
| `m_beast_bog_croaker` | Bog Croaker | creature frog ×1.7 | 1 | d02 |
| `m_aberration_bog_slime` | Bog Slime | creature slime ×1.3, peat brown | 1.5 | d02 |
| `m_humanoid_fen_poacher` | Fen Poacher | chibi2 human, reed hat, crossbow | 1 | d02 |
| `m_elemental_marsh_lure` | Marsh Lure | creature wisp ×1.0, sickly green-white | 0.6 | d02 |
| `m_beast_reed_serpent` | Reed Serpent | creature snake ×1.5 | 1 | d02 |
| `m_beast_fen_eel` | Fen Eel | creature snake ×1.0, eel-blue, stays in channels | 0.5 | d02 |
| `m_construct_millstone_roller` | Millstone Roller (elite) | creature golem ×1.5 hugging a millstone | 3 | d02 |
| `m_goblin_sootwick_digger` | Sootwick Digger | chibi2 goblin, pick, soot-black helmet with a candle | 1 | d03 |
| `m_goblin_sootwick_lampjack` | Sootwick Lampjack | chibi2 goblin, lantern on a pole | 0.8 | d03 |
| `m_goblin_sootwick_slingshot` | Sootwick Slingshot | chibi2 goblin, sling | 0.8 | d03 |
| `m_goblin_sootwick_hexer` | Sootwick Soot-Hexer | chibi2 goblin, bone rattle, face painted white | 0.8 | d03 |
| `m_goblin_sootwick_brute` | Sootwick Brute (elite) | chibi2 goblin ×1.9, pit-prop club | 3 | d03 |
| `m_beast_tunnel_beetle` | Tunnel Beetle | creature beetle ×1.5, rust-brown | 1.2 | d03 |
| `m_beast_rock_centipede` | Rock Centipede | creature centipede ×1.6 | 1 | d03 |
| `m_beast_shaft_bat` | Shaft Bat | creature bat ×1.3 | 0.3 | d03 |
| `m_elemental_firedamp` | Firedamp Pocket | creature wisp ×1.2, dull orange, does not move | 0.5 | d03 |
| `m_aberration_gravelmaw_grub` | Gravelmaw Grub | creature worm ×0.7, grey | 0.4 | d03 |
| `m_orc_ashtusk_raider` | Ashtusk Raider | chibi2 orc, hide armour, two axes | 1 | d04 |
| `m_orc_ashtusk_spearman` | Ashtusk Spearman | chibi2 orc, long spear, round shield | 1.2 | d04 |
| `m_orc_ashtusk_bonecaller` | Ashtusk Bonecaller | chibi2 orc, bone mask, rattle staff | 0.9 | d04 |
| `m_orc_ashtusk_forgebrute` | Ashtusk Forgebrute (elite) | chibi2 orc ×1.8, smith's apron, sledge | 3.5 | d04 |
| `m_beast_forge_hound` | Forge Hound | creature hound ×1.4, ember-coated | 1 | d04 |
| `m_fiend_slag_imp` | Slag Imp | creature imp ×1.0, dripping molten | 0.5 | d04 |
| `m_elemental_cinder_spawn` | Cinder Spawn | creature elemental ×0.8, fire | 0.8 | d04 |
| `m_construct_anvil_sentinel` | Anvil Sentinel (elite) | creature golem ×2.0, anvil-headed dwarf construct in orc chains | 3 | d04 |
| `m_orc_ashtusk_whipmaster` | Ashtusk Whipmaster | chibi2 orc, whip, keys on belt | 1 | d04 |
| `m_undead_glass_mummy` | Glass-Wrapped Dead | chibi2 undead, linen wraps studded with glass | 1.2 | d05 |
| `m_undead_tomb_attendant` | Tomb Attendant | chibi2 undead, gold collar, oil jar | 0.9 | d05 |
| `m_undead_sun_priest_husk` | Sun-Priest Husk | chibi2 undead, sun-disc headdress | 1 | d05 |
| `m_construct_glass_sentinel` | Glass Sentinel (elite) | creature golem ×1.8, clear glass with a gold core | 3.5 | d05 |
| `m_elemental_prism_shard` | Prism Shard | creature shard ×1.3, clear with rainbow edges | 0.6 | d05 |
| `m_beast_dune_scarab` | Dune Scarab | creature beetle ×0.8, gold | 0.3 | d05 |
| `m_beast_glasstail_skitterer` | Glasstail Skitterer | creature spider ×1.3, sand colour, glass-tipped tail (new feature `stinger`, §20) | 1 | d05 |
| `m_humanoid_dunecutter_cutthroat` | Dunecutter Cutthroat | chibi2 human, desert wraps, curved knives | 1 | d05 |
| `m_humanoid_dunecutter_sandcaller` | Dunecutter Sandcaller | chibi2 human, veil, staff | 0.9 | d05 |
| `m_beast_tomb_asp` | Tomb Asp | creature snake ×1.8, gold and black | 1 | d05 |
| `m_construct_vault_warden` | Vault Warden (elite) | creature golem ×2.0, brass and sandstone, key-shaped head | 3.5 | d06 |
| `m_construct_brass_scarab` | Brass Scarab | creature beetle ×1.0, brass (construct) | 0.4 | d06 |
| `m_elemental_sand_wraith` | Sand Wraith | creature wraith ×1.3, sand-coloured, dissolving hem | 1 | d06 |
| `m_elemental_dust_devil` | Dust Devil | creature elemental ×1.0, whirl of sand (new `whirl` variant, §20) | 0.8 | d06 |
| `m_humanoid_dunecutter_tunneler` | Dunecutter Tunneler | chibi2 human, goggles, shovel | 1 | d06 |
| `m_humanoid_dunecutter_hexblade` | Dunecutter Hexblade | chibi2 human, silver-inlaid scimitar | 1 | d06 |
| `m_humanoid_dunecutter_sandcaller` | Dunecutter Sandcaller | (as d05) | 0.9 | d06 |
| `m_beast_vault_asp` | Vault Asp | creature snake ×1.6, black and gold bands | 1 | d06 |
| `m_aberration_coin_mimic` | Coin Mimic | creature mimic ×1.1, coin-heap shape | 1.5 | d06 |
| `m_beastkin_thornmane_mauler` | Thornmane Mauler | chibi2 beastkin (wolf-headed), thorn-wrapped arms | 1.2 | d07 |
| `m_beastkin_thornmane_prowler` | Thornmane Prowler | chibi2 beastkin, lean, bone knives | 1 | d07 |
| `m_beastkin_thornmane_moonseer` | Thornmane Moonseer | chibi2 beastkin, antler headdress, thorn staff | 0.9 | d07 |
| `m_beast_bramble_wolf` | Bramble Wolf | creature wolf ×1.4, thorns grown through the fur | 1 | d07 |
| `m_beast_silkrot_spider` | Silkrot Spider | creature spider ×1.4, grey-violet | 1 | d07 |
| `m_aberration_blight_sporecap` | Blight Sporecap | creature mushroom ×1.3, violet with grey spots | 0.8 | d07 |
| `m_aberration_strangle_vine` | Strangle Vine | creature snake ×2.4, green-black, rooted (does not move) | 1.2 | d07 |
| `m_elemental_blight_wisp` | Blight Wisp | creature wisp ×1.1, sick green | 0.5 | d07 |
| `m_beast_carrion_moth` | Carrion Moth | creature moth ×1.6, brown | 0.6 | d07 |
| `m_undead_moonwell_sentinel` | Moonwell Sentinel (elite) | chibi2 elf ghost ×1.6, silver plate, glaive (material `ghost_silver`, §20) | 3.5 | d08 |
| `m_undead_pale_huntress` | Pale Huntress | chibi2 elf ghost, longbow | 1 | d08 |
| `m_undead_weeping_acolyte` | Weeping Acolyte | chibi2 elf ghost, robes | 0.9 | d08 |
| `m_elemental_moon_wisp` | Moon Wisp | creature wisp ×1.2, silver-white | 0.5 | d08 |
| `m_beast_silverwing_owl` | Silverwing Owl | creature owl ×1.8, white | 1 | d08 |
| `m_beast_lamp_moth` | Moonmoth | creature moth ×1.5, pale blue | 0.5 | d08 |
| `m_aberration_starless_eye` | Starless Eye | creature horror ×0.9, one great eye, few tentacles | 0.8 | d08 |
| `m_aberration_well_drinker` | Well-Drinker | creature horror ×1.6, silver-veined black | 1.8 | d08 |
| `m_elemental_moonshard_cluster` | Moonshard Cluster | creature shard ×1.2, silver | 0.7 | d08 |
| `m_orc_pit_fighter` | Pit Fighter | chibi2 orc, net and trident or axe and buckler | 1.2 | d09 |
| `m_orc_blood_drummer` | Blood Drummer | chibi2 orc, war drum on its back | 1 | d09 |
| `m_orc_ashtusk_beastmaster` | Beast-Handler | chibi2 orc, goad and whip | 1 | d09 |
| `m_beast_pit_hyena` | Pit Hyena | creature hyena ×1.4 | 0.8 | d09 |
| `m_beast_war_boar` | War Boar | creature boar ×2.2, iron tusk caps | 2 | d09 |
| `m_beast_pit_saber` | Pit Saber | creature saber_cat ×1.6, scarred | 1.5 | d09 |
| `m_beast_moat_croc` | Moat Crocodile | creature crocodile ×1.8 | 1.5 | d09 |
| `m_giant_chained_brute` | Chained Brute (elite) | chibi2 giant ×1.2 in chains (a captive gone mad) | 4 | d09 |
| `m_goblin_pit_bookmaker` | Pit Bookmaker | chibi2 goblin, ledger, a bag of caltrops | 0.6 | d09 |
| `m_giant_stonehide_icebreaker` | Stonehide Icebreaker (elite) | chibi2 giant, ice-crusted hide, a pick of blue stone | 4 | d10 |
| `m_giant_stonehide_frostsayer` | Stonehide Frostsayer | chibi2 giant (woman), rune-bones | 1.5 | d10 |
| `m_giant_stonehide_hurler` | Stonehide Hurler | chibi2 giant, sling of ice boulders | 1.5 | d10 |
| `m_beast_frost_stalker` | Frost Stalker | creature saber_cat ×1.6, white, blue stripes | 1.2 | d10 |
| `m_beast_rime_bear` | Rime Bear | creature bear ×1.8, white-blue | 2 | d10 |
| `m_dragonkin_rime_whelp` | Rime Whelp | creature drake ×1.2, white | 1 | d10 |
| `m_elemental_frost_shard` | Frost Shard | creature shard ×1.3, blue-white | 0.7 | d10 |
| `m_elemental_snow_wraith` | Snow Wraith | creature wraith ×1.4, white | 1 | d10 |
| `m_beast_ice_worm` | Ice Borer | creature worm ×1.8, white | 1.3 | d10 |
| `m_undead_drowned_parishioner` | Drowned Parishioner | chibi2 undead (human), Sunday clothes rotted, barnacles | 1 | d11 |
| `m_undead_brine_chorister` | Brine Chorister | chibi2 undead, choir robe, a mouth that leaks seawater | 1 | d11 |
| `m_undead_barnacled_templar` | Barnacled Templar (elite) | chibi2 undead ×1.5, plate crusted in barnacles, a greatsword | 4 | d11 |
| `m_undead_bellringer_ghoul` | Bellringer Ghoul | chibi2 undead, hunched, hand-bell | 0.8 | d11 |
| `m_beast_saltshell_crab` | Saltshell Crab | creature beetle ×1.5 re-skinned as a crab (new `crab` type, §20) | 1.2 | d11 |
| `m_beast_deep_eel` | Deep Eel | creature snake ×2.2, pale | 1 | d11 |
| `m_aberration_lantern_gulper` | Lantern Gulper | creature frog ×2.2, deep-sea colours, a glowing lure on a stalk (new feature `lure`, §20) | 1.8 | d11 |
| `m_elemental_brine_elemental` | Brine Elemental | creature elemental ×1.5, seawater | 1.5 | d11 |
| `m_aberration_drowned_lamprey` | Salt Lamprey | creature worm ×0.8, grey | 0.4 | d11 |
| `m_construct_half_made_golem` | Half-Made Golem (elite) | creature golem ×2.0, one arm missing, wires trailing, violet core | 4 | d12 |
| `m_construct_clockwork_hound` | Clockwork Hound | creature hound ×1.4, brass plates, key in its back | 1 | d12 |
| `m_construct_brass_sentry` | Brass Sentry | creature turret ×1.3 | 1.2 | d12 |
| `m_construct_scrap_swarm` | Scrap Swarm | creature beetle ×0.7, bolts and springs | 0.4 | d12 |
| `m_aberration_rift_tatter` | Rift Tatter | creature wraith ×1.5, violet-black, edges flickering | 1.2 | d12 |
| `m_elemental_rift_shard` | Rift Shard | creature shard ×1.4, violet | 0.8 | d12 |
| `m_aberration_unmade_thing` | Unmade Thing | creature horror ×1.6, half-constructed: brass ribs, tentacles | 2 | d12 |
| `m_construct_mirror_mannequin` | Mirror Mannequin | chibi2 human ×1.2, mirror-glass skin, no face | 1.2 | d12 |
| `m_humanoid_riftwatch_deserter` | Riftwatch Deserter | chibi2 human (any), Riftwatch coat, rift staff | 1 | d12 |
| `m_ember_legionnaire` | Ember Legionnaire | chibi2 human, black plate with red-glass inlay, tower shield, short sword | 1.5 | d13 |
| `m_ember_arbalest` | Ember Arbalest | chibi2 human, heavy crossbow | 1.2 | d13 |
| `m_ember_pyre_priest` | Pyre Priest | chibi2 human, ash-grey robes, a brazier-staff | 1.2 | d13 |
| `m_ember_knight_captain` | Ember Knight-Captain (elite) | chibi2 human ×1.5, great helm, flame-edged greatsword | 4.5 | d13 |
| `m_fiend_cinder_imp` | Cinder Imp | creature imp ×1.1 | 0.5 | d13 |
| `m_fiend_ashhound` | Ashhound | creature hound ×1.8, black with lava cracks | 1.5 | d13 |
| `m_elemental_magma_elemental` | Magma Elemental | creature elemental ×1.8, lava | 2 | d13 |
| `m_fiend_gate_brute` | Gate Brute (elite) | creature titan ×1.5, fiendish, chains wrapped round the arms | 5 | d13 |
| `m_construct_legion_ballista` | Legion Ballista | creature turret ×1.6 (a ballista on wheels) | 1.5 | d13 |
| `m_humanoid_ash_priest` | Ash Priest | chibi2 human, grey skin, eyes sewn shut, a bone censer | 1.3 | d14 |
| `m_humanoid_ash_zealot` | Ash Zealot | chibi2 human, ash-smeared, two burning sickles | 1.5 | d14 |
| `m_undead_ash_wraith` | Ash Wraith | creature wraith ×1.6, grey ash, ember eyes | 1.5 | d14 |
| `m_construct_relic_golem` | Relic Golem (elite) | creature golem ×2.4, obsidian with a gold reliquary chest | 5 | d14 |
| `m_fiend_ember_imp_cantor` | Ember Cantor | creature imp ×1.3, with a tiny bell | 0.8 | d14 |
| `m_beast_ash_phoenixling` | Phoenixling | creature phoenix ×1.0 | 0.7 | d14 |
| `m_undead_burned_hero` | Burned Hero (elite) | chibi2 (any race) undead ×1.6 in burned plate — relics of heroes the King burned; each wears a random old dungeon set's look | 4 | d14 |
| `m_elemental_cinder_sprite` | Cinder Sprite | creature elemental ×0.8 | 0.5 | d14 |
| `m_aberration_reliquary_mimic` | Reliquary Mimic | creature mimic ×1.8, a gold reliquary | 3 | d14 |

Boss adds that are not in a trash table: `m_construct_shard_guard` (d05 King Sethar's Shard Guards, 2 H, creature shard ×1.6, melee 10 %HP; dies at once inside a beam). Named trash: **Grip** (d01, a Grave Hound with a collar), **Lug** and **Mugg** (d03, Sootwick Brutes).

### 19.4 Dungeon-exclusive uniques and legendaries (for page 09) — 115 items

Every item below is **[D-EXCL]**. `secret` = **[SECRET]** legendary from the secret boss.

| id | Kind | Slot / type | Drops from | Dungeon |
|---|---|---|---|---|
| `uq_crown_of_teeth` | unique | helm, light | `b_warren_queen_skritch` | d01 |
| `uq_pells_hooded_lantern` | unique | light slot | `b_pell_lantern_thief` | d01 |
| `uq_morrows_ledger` | unique | off-hand focus | `b_sexton_morrow` | d01 |
| `uq_ossels_thimble` | unique | ring | `b_mother_ossel` | d01 |
| `uq_thanes_ring_of_rest` | unique | ring | `b_hollow_thane` | d01 |
| `leg_hollow_crown` | legendary | helm legendary | `b_hollow_thane` | d01 |
| `uq_peat_black_shroud` | unique | back | `b_first_sleeper` | d01 |
| `leg_first_sleepers_shroud` | secret | chest legendary (any armour type, takes the wearer's) | `b_first_sleeper` | d01 |
| `uq_bloodgorged_band` | unique | ring | `b_bloatleech_matron` | d02 |
| `uq_sluicewardens_key` | unique | neck | `b_old_pike_sluicewarden` | d02 |
| `uq_wider_than_running` | unique | belt | `b_old_croak` | d02 |
| `uq_wrens_wedding_ring` | unique | ring | `b_wren_grist` | d02 |
| `uq_grist_ledger_of_debts` | unique | off-hand focus | `b_the_grindwheel` | d02 |
| `leg_millwrights_bargain` | legendary | gloves legendary | `b_the_grindwheel` | d02 |
| `uq_silt_lords_tithe` | unique | ring | `b_the_tithe_below` | d02 |
| `leg_ledger_of_the_deep` | secret | neck legendary | `b_the_tithe_below` | d02 |
| `uq_grubniks_ledger` | unique | off-hand focus | `b_foreman_grubnik` | d03 |
| `uq_rattlejaws_shell` | unique | off-hand shield | `b_rattlejaw` | d03 |
| `uq_ringleaders_candles` | unique | helm | `b_nix_candlejaw` | d03 |
| `uq_seventh_shift_rune` | unique | neck | `b_warden_seven` | d03 |
| `uq_stonegullets_gizzard_stone` | unique | trinket | `b_stonegullet` | d03 |
| `leg_worm_king_mandible` | legendary | weapon legendary (two-handed axe or mace, takes the looter's preferred type) | `b_stonegullet` | d03 |
| `uq_goldvein_signet` | unique | ring | `b_the_unmined` | d03 |
| `leg_heart_of_the_unmined` | secret | chest legendary | `b_the_unmined` | d03 |
| `uq_matched_tongs` | unique | gloves | `b_grukk_and_zagga` | d04 |
| `uq_slag_heart_ember` | unique | trinket | `b_slagmaw` | d04 |
| `uq_orc_steel_pauldrons` | unique | heavy shoulders | `b_forgemaster_ghorza` | d04 |
| `uq_chained_flame_link` | unique | ring | `b_the_great_bellows` | d04 |
| `uq_throne_of_the_keep_signet` | unique | ring | `b_grumvak_kilnbreaker` | d04 |
| `leg_kilnbreakers_oath` | legendary | two-handed axe legendary | `b_grumvak_kilnbreaker` | d04 |
| `uq_bellamund_hammerhand` | unique | gloves | `b_bellamund_the_cold_smith` | d04 |
| `leg_the_cold_anvil` | secret | off-hand (shield) legendary | `b_bellamund_the_cold_smith` | d04 |
| `uq_brood_mothers_gilt` | unique | trinket | `b_gilded_brood_mother` | d05 |
| `uq_saffas_bandolier` | unique | waist | `b_saffa_knifewind` | d05 |
| `uq_orruns_first_pane` | unique | off-hand | `b_orrun_the_glassblower` | d05 |
| `uq_second_glass_crown` | unique | helm | `b_queen_ammarel` | d05 |
| `uq_unshattered_vambraces` | unique | heavy wrists | `b_king_sethar_unshattered` | d05 |
| `leg_the_eleventh_century` | legendary | off-hand (focus or shield) legendary | `b_king_sethar_unshattered` | d05 |
| `uq_seventh_kings_signet` | unique | ring | `b_ithar_the_unseen` | d05 |
| `leg_the_unseen_prince` | secret | cloak legendary | `b_ithar_the_unseen` | d05 |
| `uq_the_coffers_tongue` | unique | neck | `b_coffer_that_counts` | d06 |
| `uq_hasks_lucky_shovel` | unique | off-hand | `b_hask_the_tunneler` | d06 |
| `uq_true_weight` | unique | waist | `b_scales_of_tamar` | d06 |
| `uq_the_stolen_oath` | unique | trinket | `b_qassar_silver_tongued` | d06 |
| `uq_sovereigns_binding` | unique | wrists | `b_the_sand_sovereign` | d06 |
| `leg_the_unbound_dune` | legendary | boots legendary | `b_the_sand_sovereign` | d06 |
| `uq_first_oath_signet` | unique | ring | `b_tamar_the_first` | d06 |
| `leg_water_of_tamar` | secret | neck legendary | `b_tamar_the_first` | d06 |
| `uq_web_of_the_matriarch` | unique | back | `b_silkrot_matriarch` | d07 |
| `uq_scent_of_blood` | unique | gloves | `b_rakka_bloodbriar` | d07 |
| `uq_mycelial_ring` | unique | ring | `b_the_sporefather` | d07 |
| `uq_thornlink_band` | unique | ring | `b_orenn_thornbound` | d07 |
| `uq_wyllows_last_leaf` | unique | neck | `b_wyllow_blighted_heart` | d07 |
| `leg_blightbreaker` | legendary | gloves legendary | `b_wyllow_blighted_heart` | d07 |
| `uq_seed_of_the_sovereign` | unique | trinket | `b_gall_sovereign` | d07 |
| `leg_wyllows_gratitude` | secret | off-hand focus legendary | `b_gall_sovereign` | d07 |
| `uq_dusk_scale_cloak` | unique | back | `b_gloamwing` | d08 |
| `uq_caeliths_last_arrow` | unique | quiver | `b_caelith_pale_huntress` | d08 |
| `uq_twin_bond_band` | unique | ring | `b_twin_wardens` | d08 |
| `uq_ilvandors_constant` | unique | neck | `b_archmage_ilvandor` | d08 |
| `uq_moon_drinkers_tooth` | unique | dagger | `b_oruvel_moon_drinker` | d08 |
| `leg_the_thirst` | legendary | neck legendary | `b_oruvel_moon_drinker` | d08 |
| `uq_crescent_of_lirath` | unique | off-hand | `b_the_drowned_moon` | d08 |
| `leg_the_moon_returned` | secret | ring legendary | `b_the_drowned_moon` | d08 |
| `uq_ogras_whistle` | unique | trinket | `b_ogra_beastmaster` | d09 |
| `uq_death_roll_bracers` | unique | wrists | `b_the_moatmother` | d09 |
| `uq_broken_chain` | unique | wrists | `b_brannoc_the_chained` | d09 |
| `uq_bait_and_stake` | unique | boots | `b_razorback_rider_krunn` | d09 |
| `uq_favour_of_the_crowd` | unique | neck | `b_warmaster_drogath` | d09 |
| `leg_ashmanes_twin_cleavers` | legendary | one-handed axe legendary (a pair | `b_warmaster_drogath` | d09 |
| `uq_tallows_collar` | unique | neck | `b_old_gnash_undefeated` | d09 |
| `leg_the_undefeated` | secret | belt legendary | `b_old_gnash_undefeated` | d09 |
| `uq_hibernation_charm` | unique | trinket | `b_old_whitemaw` | d10 |
| `uq_yrsas_bell` | unique | off-hand | `b_frostsayer_yrsa` | d10 |
| `uq_icebreakers_cleats` | unique | feet | `b_skarr_icebreaker` | d10 |
| `uq_song_of_the_rime` | unique | neck | `b_rimeweaver_seidra` | d10 |
| `uq_rimefang_heartscale` | unique | heavy chest | `b_rimefang` | d10 |
| `leg_breath_of_the_glacier` | legendary | staff/wand legendary | `b_rimefang` | d10 |
| `uq_the_quiet_step` | unique | feet | `b_old_mother_rime` | d10 |
| `leg_mothers_last_winter` | secret | chest legendary | `b_old_mother_rime` | d10 |
| `uq_ringers_earplugs` | unique | helm | `b_hobb_the_bellringer` | d11 |
| `uq_matrons_pearl` | unique | neck | `b_saltshell_matron` | d11 |
| `uq_deacons_litany` | unique | neck | `b_deacon_mourne` | d11 |
| `uq_the_missing_part` | unique | ring | `b_choir_of_brine` | d11 |
| `uq_the_full_church` | unique | trinket | `b_bishop_aldwine` | d11 |
| `leg_bell_of_saltdeep` | legendary | off-hand legendary | `b_bishop_aldwine` | d11 |
| `uq_what_the_sea_keeps` | unique | ring | `b_the_tidewife` | d11 |
| `leg_heart_of_the_tidewife` | secret | chest legendary | `b_the_tidewife` | d11 |
| `uq_perpetual_cog` | unique | trinket | `b_cogheart_warden` | d12 |
| `uq_through_the_lens` | unique | off-hand | `b_mira_lensgrinder` | d12 |
| `uq_upside_down_charm` | unique | neck | `b_the_gravity_engine` | d12 |
| `uq_look_at_yourself` | unique | ring | `b_mirror_apprentices` | d12 |
| `uq_oddrins_last_letter` | unique | trinket | `b_oddrin_the_unmaker` | d12 |
| `leg_the_unmaking` | legendary | two-handed legendary (staff or weapon, looter's type) | `b_oddrin_the_unmaker` | d12 |
| `uq_cogheart` | unique | neck | `b_the_finished_thing` | d12 |
| `leg_the_finished_thing` | secret | trinket legendary | `b_the_finished_thing` | d12 |
| `uq_torvens_sighting_lens` | unique | neck | `b_torven_ballista_master` | d13 |
| `uq_ilsabets_doubt` | unique | ring | `b_pyre_priestess_ilsabet` | d13 |
| `uq_varrows_key` | unique | trinket | `b_gatekeeper_varrow` | d13 |
| `uq_quench_seal` | unique | belt | `b_slag_colossus` | d13 |
| `uq_never_cold` | unique | heavy wrists | `b_commander_kaelis` | d13 |
| `uq_gate_key_of_the_ember` | unique | trinket | `b_castellan_vorhane` | d13 |
| `leg_the_cindergate` | legendary | shield legendary | `b_castellan_vorhane` | d13 |
| `uq_banner_of_last_light` | unique | back | `b_first_flame_of_the_gate` | d13 |
| `leg_the_first_flame` | secret | two-handed legendary (the looter's type) | `b_first_flame_of_the_gate` | d13 |
| `uq_unwritten` | unique | neck | `b_the_ash_scribe` | d14 |
| `uq_twice_born` | unique | chest (any type) | `b_emberbrood` | d14 |
| `uq_four_doors` | unique | trinket | `b_relic_custodian` | d14 |
| `uq_eyes_sewn_shut` | unique | helm | `b_high_ashpriest_morvaine` | d14 |
| `uq_first_burned_feather` | unique | neck | `b_ashwing` | d14 |
| `uq_the_kings_decree` | unique | trinket | `b_sarn_veydrec_herald` | d14 |
| `leg_herald_of_ashes` | legendary | off-hand (banner/focus) legendary | `b_sarn_veydrec_herald` | d14 |
| `leg_reliquary_heart` | legendary | neck legendary | `b_sarn_veydrec_herald` | d14 |
| `uq_remember_the_roads` | unique | neck | `b_ashmother_veyra` | d14 |
| `leg_the_first_ember` | secret | light slot legendary | `b_ashmother_veyra` | d14 |

### 19.5 Generic sets (page 09 writes the bonuses; the briefs above are the intent)

| Set | Dungeon | Armour | Pieces |
|---|---|---|---|
| `set_barrowwarden` | d01 | medium | 4 |
| `set_fenwader` | d02 | light | 4 |
| `set_deepdelver` | d03 | heavy | 4 |
| `set_kilnbreaker_iron` | d04 | heavy | 4 |
| `set_sunglass_regalia` | d05 | cloth | 4 |
| `set_oathkeeper_bronze` | d06 | medium | 4 |
| `set_thornwarden_bark` | d07 | medium | 4 |
| `set_moonsilver_vigil` | d08 | cloth | 4 |
| `set_pitchampion_leathers` | d09 | light | 4 |
| `set_rimewarden_furs` | d10 | medium | 4 |
| `set_tidebound_vestments` | d11 | cloth | 4 |
| `set_unmakers_apron` | d12 | medium | 4 |
| `set_emberbane_plate` | d13 | heavy | 5 |
| `set_reliquary_ash` | d14 | any (takes the looter's) | 6 |

### 19.6 Quest items and keys (not gear)

| id | What | Where |
|---|---|---|
| `it_delving_key` | Mythic+ key (§2.4) | first Heroic of the week; end of every key run |
| `it_token_<slot>` | class set token (page 09) | Heroic/Mythic+ end bosses |
| `it_thanes_ring`, `it_hounds_collar`, `it_horn_cup` | d01 grave goods | Pell's bargain, Grip, Ossuary Walk skull |
| `it_wrens_lullaby` | d02 lever order | Wren's truth reply |
| `it_mirror_shard` | d05 Ammarel's "Look for yourself" | Blowing House floor |
| `it_dunecutter_share` | d05 gold bag | Saffa's bargain |
| `it_orenns_moon_charm` | d07 cleanse Wyllow | Orenn's doubt reply |
| `it_heartwood_seed` | d07 keepsake (housing/cosmetic — page 08) | cleansed Wyllow |
| `it_firewood` | d10 brazier fuel | Stonehide trash (60%) |
| `it_automaton_cogheart`, `it_automaton_rift_lens`, `it_automaton_brass_hand`, `it_automaton_voice_box` | d12 secret parts | s1, s2, B1, B2 (100%) |
| `it_standard_of_last_light` | d13 carried standard (cannot be bagged) | Ser Aldric's body, Undercroft |
| `it_first_ember_lantern` | d14 secret reward and r04 advantage | Ashmother Veyra |

---

## 20. Notes for other pages

### 20.1 New art this page needs (page 17)

| Kind | id / name | Used by |
|---|---|---|
| Dungeon look | `mine` (timber props, rails, hook lanterns) | d03 |
| Dungeon look | `glass_tomb` (sand-gold floor, smoky fused glass, roof sun-slots) | d05 |
| Dungeon look | `vault_sand` (vault recoloured sand-gold) | d06 |
| Dungeon look | `hollow_blight` (grey-violet moss, black thorns) | d07 |
| Dungeon look | `ruin_moon` (silver-white trim, pale blue fog) | d08 |
| Dungeon look | `pit_arena` (ash sand, bone stakes, tiered stands with a crowd) | d09 |
| Dungeon look | `flooded_cathedral` (salt-white stone, barnacles, green-lit glass) | d11 |
| Dungeon look | `rift_workshop` (brass, benches, floating islands, void between) | d12 |
| Dungeon look | `ember_bastion` (basalt, red-glass slits, lava channels) | d13 |
| Dungeon look | `ash_reliquary` (grey ash, obsidian, gold niches, ember motes) | d14 |
| Creature type | `crab` (spider plan, two claws, flat shell) | d11 |
| Creature variant | elemental `sand`, `whirl` (a moving sand/air funnel) | d06 |
| Creature feature | `stinger` (tail with a glass tip) | d05 |
| Creature feature | `lure` (a glowing stalk on the head) | d11 |
| Creature feature | `millstone_core` (golem chest as a millstone) | d02 |
| Colour sets | `ore_titan`, `automaton` | d03, d12 |
| Materials | `ghost_water`, `ghost_frost`, `ghost_silver`, `seen_in_light` (visible only inside light), `moonwater`, `bark_skin`, `seawater_body`, `living_ash` | d02, d04, d08, d05, d08, d07, d11, d14 |
| Props / models | `great_bellows`, `great_scales`, `gravity_engine`, `unmaking_engine`, sapling (mushroom re-skin), mirror stands, sun-slots, sluice levers, 3 bells, relic seals | various |
| Rig | a **mounted boss** (Chibi 2 rider on a creature, dismount at a phase) | d09 Krunn |
| Voice timbres | `drowned` (wet whisper) and an automaton voice built from another voice's clips | d02, d12 |

### 20.2 Screens and HUD pieces (page 03) and keys (page 02)

- `scr_dungeon_journal` (§2.10) with seven tabs; opened by the **Journal** key → Dungeons tab.
- Party frame additions: **Interrupt Order** (numbers 1–5 the leader assigns; the next person in order sees a gold border on their interrupt button), dungeon counters ("Miners freed 2/4", "Saplings 6/6", "Seals 3/5"), the **Heat Gauge** timer (d04).
- Dungeon-wide gauges: **Favour** bar (d09), **Moon Clock** (d08), **Tide Gauge** (d11), **Chill** stacks (d10), **Scorch** stacks (d14).
- **Dialog opportunity** box: a centre panel with 2–3 replies, a timer bar (20–30 s), the name of the player who answered; **vote box** variant for "all must accept" (d06 bribe, d09 champion).
- Mythic+: timer, forces bar, affix icons, death counter (+5 s each), **Keystone Font** window.

### 20.3 Rules other pages must carry

| Page | Needs |
|---|---|
| 05 Combat | combat-revive **charges** (1 per boss fight; +1 per 10 min on Mythic+); dispel types (magic, curse, poison) since d06/d07/d13 lean on them; the **charm** status (d06, d02, d05); **swimming** (d11: −40% speed, no roll, Drowning) |
| 07 Progression | Sandsworn **Honoured** reputation (d06 dialog); the **Kneeler** title (d14) |
| 08 Items | item level by difficulty and key; **flail**, **gun/blunderbuss**, **quiver**, **fist weapon**, **banner off-hand** as bases if they don't exist; the reroll-at-Quartermaster rule; `it_heartwood_seed` as a keepsake |
| 09 Sets & legendaries | every row of §19.4 and §19.5; set tokens `it_token_<slot>`; **Ember Residue** bad-luck shards |
| 10 Bestiary | the 127 dungeon monster ids in §19.3 (126 table rows plus `m_construct_shard_guard`; the Dunecutter Sandcaller appears in d05 and d06) (all new ids; reused bodies); the families `beastkin`, `goblin`, `orc`, `giant` used as id prefixes for warband members (reuse: Farhold `data/warbands.json` Sootwick/Ashtusk/Thornmane/Stonehide) |
| 11 Boss mechanics | the mechanics first used here: **moving wall with a gap**, **checkerboard flip**, **lying announcer** (False Bell — the voice says one thing, the telegraph says the truth; the telegraph always wins), **kept tether** (green when close enough), **shared-health twins**, **copies of players**, **gravity flip with ghost outlines** |
| 13 Raids | d11's Tidewife sets up `r03_sunken_choir`; d13's gate opening and d14's First Ember give advantages in `r04_ember_court` |
| 14 Quests | 14 story quests `q_the_open_barrow` … `q_the_kings_reliquary`, the attunement `q_ashen_reliquary_key` |
| 15 Social | group finder for Normal/Heroic; Mythic+ Weekly Vault; vote kick; 10 instances an hour |
| 16 Tech | `data/dungeons/<id>.json` per dungeon (rooms, halls, packs, bosses); reachability test from `dungeon-plan.js`; a test that regenerates §19 and fails on drift |
| 01 World | the 14 entrances and the NPCs `npc_warden_hedda_thorne`, `npc_marra_stillwater`, `npc_foreman_dagna_coalbright`, `npc_thane_orla_bellamund`, `npc_lightkeeper_oren_sael`, `npc_vaultkeeper_hadim_sar`, `npc_moonwell_warden_sefa_lin`, `npc_moonsinger_aethe_varn`, `npc_captain_ren_harrowgate`, `npc_warden_kaija_frostmere`, `npc_sister_maren_saltwhistle`, `npc_riftwatch_archivist_toma_quill`, `npc_marshal_idra_vance`, `npc_keeper_oswin_ashlow`, `npc_delve_quartermaster_<region>`, the Delver followers |
