# WILDMARCH — Design Bible, page 12: Dungeons

> *"The door shuts behind you. That is the only rule the dungeon promises to keep."*

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built. This page owns **dungeon content**:
the sixteen 5-player dungeons `d01`–`d16` named on [page 00](00-OVERVIEW.md) §8, their trash, sub-bosses, main
bosses, end bosses, secret bosses and loot, plus the rules every dungeon shares: entry and the **Dungeon Finder**,
the two difficulties (**Normal** and **Challenge**), **Depth**, wipes and checkpoints, loot, followers, the
**rarity slots** where champion packs and rares are placed, and the dungeon journal.

Round 2 in one paragraph: Heroic is now **Challenge**; Mythic+ (keys, timer, weekly affixes, forces) is gone and
**Depth** (§2.4) replaces it; the dungeon currency is gone (gold only); dungeons are open (no attunement) and show
in the Dungeon Finder once you have **discovered** their entrance; the two story raids r04 and r05 are rebuilt as
five-player dungeons **d15 The Fire Court** and **d16 The Spire**, and six of the best mechanics of raids r01–r03
live on as Challenge rows of existing bosses (§2.11). There is no night: dark places are film-set dark (§2.12).

It does **not** own: the telegraph vocabulary and minimum warning times ([page 11](11-BOSS-MECHANICS.md)),
the damage formulas, tags and status list ([page 05](05-COMBAT.md)), item rules, item level, sockets and magic
find ([page 08](08-ITEMS.md)), the set/legendary/soul catalogue ([page 09](09-SETS-LEGENDARIES.md) indexes
everything marked **[D-EXCL]** here), monster families, AI and the **monster rarity** tables
([page 10](10-BESTIARY.md)), the queue itself ([page 15](15-SOCIAL-ONLINE.md)), teleports and travel
([page 20](20-TRAVEL.md)), world bosses ([page 13](13-WORLD-BOSSES.md)) or the screens
([page 03](03-UI-SCREENS.md)). Where this page needs one of those, it links and states what it assumes.

---

## Contents

1. [How to read this page](#1-how-to-read-this-page)
2. [Dungeon rules (shared by all sixteen)](#2-dungeon-rules-shared-by-all-sixteen)
   — incl. [2.3 Dungeon Finder](#23-the-dungeon-finder-and-discovery), [2.4 Depth](#24-depth),
   [2.9 Rarity slots](#29-rarity-slots-where-champion-packs-and-rares-are-placed),
   [2.11 Raid-style mechanics for five](#211-raid-style-mechanics-tuned-for-five)
3. [The dungeon template](#3-the-dungeon-template)
4. [Mechanic ladder: what each dungeon teaches](#4-mechanic-ladder-what-each-dungeon-teaches)
5. d01 [The Hollow Barrow](#d01--the-hollow-barrow)
6. d02 [The Drowned Mill](#d02--the-drowned-mill)
7. d03 [Shaft Seven Mines](#d03--shaft-seven-mines)
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
19. d15 [The Fire Court](#d15--the-fire-court)
20. d16 [The Spire](#d16--the-spire)
21. [Indexes: monsters, bosses, items, secrets](#21-indexes)
22. [Notes for other pages](#22-notes-for-other-pages)

---

## 1. How to read this page

### 1.1 Units (so a number means the same thing at level 7 and level 60)

Dungeons run at fourteen different band levels, at level 60 (Challenge and the end-game dungeons d14–d16), and
at any level in between through Depth. Writing absolute health and damage for every one of them would be tables
that drift apart. So this page uses **two units** that page 05 and page 10 turn into real numbers:

| Unit | Means | Example |
|---|---|---|
| **H** | the health of one **normal-rank** trash monster of the dungeon's level, on Normal (page 10's formula; in Farhold this is the bestiary `hp` compounded by `balance.json` `enemies.perLevel`, 1.13 a level) | a sub-boss of 30 H has thirty trash monsters' worth of health |
| **%HP** | a share of the **maximum health of a Damage-role player** of the dungeon's level, wearing gear of that level, **before** armour and resistances | "35 %HP" hits a mage for about a third of his bar; a tank with 1.6× health and armour loses far less |

A hit of **100 %HP or more** is a **one-shot**. Every one-shot on this page has at least **3.0 s** of
warning (page 11 minimum). A tank's melee numbers are written for the tank: "tank melee 9 %HP" is still in
the Damage-player unit, and a tank's own health and mitigation make it about 3–4% of the tank's bar.
Challenge and Depth multiply these numbers (§2.3, §2.4); **any ability that a multiplier pushes to 100 %HP or
more automatically gets the 3.0 s one-shot warning** — the minimum rule always wins over the listed warning.

### 1.2 Bodies

Every monster names its body so the builder knows what to draw (reuse: `avatar-3d/js/creature-types.js`,
`avatar-3d/js/chibi2.js`):

- `creature <type> ×<size>` — an avatar-3d creature of that type (`wolf`, `rat`, `spider`, `bat`, `snake`,
  `worm`, `golem`, `titan`, `imp`, `elemental`, `wisp`, `shard`, `wraith`, `horror`, `slime`, `mushroom`,
  `mimic`, `beetle`, `centipede`, `crocodile`, `turtle`, `griffin`, `phoenix`, `frog`, `owl`, `moth`,
  `hyena`, `saber_cat`, `drake`, `dragon`, `boar`, `bear`, `hound`, `cat`, `deer`, `elk`, `horse`, `turret`…),
  scaled by the size factor. New creature types this page needs are listed in §22. **Size floor:** a creature
  size below ×1.4 on this page is a *relative* size (a small one of its kind); the builder draws it at **×1.4**
  whatever the number says (page 10 §1.2 and test 3: nothing knee-high).
- `chibi2 <race>` — a Chibi 2 humanoid (reuse: `avatar-3d/js/chibi2.js`, races from
  `avatar-3d/js/chibi2-races.js`: human, elf, dwarf, halfling, goblin, orc, giant, undead, beastkin), with
  its outfit/weapon noted where it matters. `×<size>` scales the whole body.

### 1.3 Ability rows

Every boss ability is one table row:

| Column | Holds |
|---|---|
| Ability | name (player-facing, original) |
| Shape / colour | page 11 vocabulary: **danger zone** (red), **void zone** (purple-black), **soak** (orange, N pips), **safe zone** (blue), **targeted** (yellow), **beneficial** (green), **tether** (white); shapes circle / donut / cone / line / cross / wave / checkerboard / room-wide; sizes in metres |
| Warn | seconds from the telegraph appearing to the hit. The floors are page 11 §4.1's, by how hard the hit is: Normal 1.5 / 1.8 / 2.0 s (light / heavy / severe), Challenge 1.2 / 1.5 / 1.7 s, one-shots 3.0 s everywhere; d01–d02 on Normal ×1.25. **Depth never lowers a floor** — a Depth run uses its difficulty's row |
| Damage | %HP, plus statuses (page 05 owns the status list) |
| Counterplay | what the group does about it |

Cast bars: **(i)** = gold border, interruptible; **(u)** = grey, cannot be interrupted.

Under each boss, extra lines add to the table on harder settings:

- **Challenge:** — rows that apply on Challenge (on top of everything on Normal).
- **Deep tuning:** — a harder version of one of the boss's own mechanics, from **Depth tier II** (Deep 6+, §2.4)
  on either difficulty. It never shortens a warning and never makes a hit lethal.
- **Depth list** (page 11 §22.2) — three mechanics from page 11's library (§26), numbered ① ② ③. At **tier II** the
  boss gains ①; at **tier IV** it also gains ② **or** ③ (which one is picked by the dungeon and depth, the same way
  as Tear modifiers, so a given depth is always the same fight). They are never lethal, never a second soak on top of
  an existing soak, and they obey page 11's reading budget (at most 3 new telegraphs in the window).
- **Challenge (from rNN):** — a Challenge row lifted from one of the shelved raid designs and re-tuned for five
  (§2.11). The source is named so the raid version in `WISHLIST.md` can be compared.

### 1.4 Marks

- **(reuse: path)** — the thing already exists in the playground; **(new)** — it does not.
- **[D-EXCL]** — a unique, legendary or soul that drops **only** in this dungeon. Page 09 indexes every one.
- **[SECRET]** — drops only from the dungeon's secret boss.

---

## 2. Dungeon rules (shared by all sixteen)

### 2.1 What a dungeon is, in Farhold and in Wildmarch

**In Farhold (reuse: `prototypes/farhold/js/dungeon.js`, `js/dungeon-plan.js`, `data/instances.json`):**
a dungeon is a mouth on the surface (a stone arch, `GATE_ARCHES`) and an interior built on the fly: rooms are
rectangles scattered without overlapping, joined nearest-first into a spanning tree of L-shaped corridors
(every room reachable) plus one or two loops, entrance = the room nearest the middle, boss room = the room
furthest from it. Two merged geometries (floor, walls) plus one instanced sconce mesh make a whole dungeon
three draw calls. There is **no ceiling** — tall walls, a dark sky and fog at 70 m read as "inside" and
leave the camera room. Eleven looks (`DUNGEON_LOOKS`: barrow, crypt, cinderworks, hollow, vault, rime,
cave, ruin, hoard, flooded, warren). `createDungeon` takes a `shape` override (rooms, roomSize, corridor,
cellSize, wallHeight, sconceEvery, chestChance) and a `holds` block (boss, quest, prisoner, cache, lore);
`gives` pays once when the boss falls (R27 `sites.take`). The enemy field is paused and rolls more champions
inside (`rankBonus 1.7`).

**In Wildmarch (new):** dungeons are **hand-authored**, not seeded. Each of the sixteen has a fixed layout
(the ASCII maps below), fixed packs, fixed bosses and scripted mechanics, because a boss you learn has to
be the same boss next time. What carries over:

- The **builder**: `dungeon-plan.js`'s room/corridor rectangles become the storage format. A hand-made
  dungeon is a JSON list of rooms `{id, x, z, w, h, kind, look}` and halls `{from, to, bend}`, fed to the
  same mesh builder and wall colliders (reuse: `js/dungeon.js` build path, minus the random scatter).
  The reachability test (`insideLayout`, every room joined) is kept as a data test.
- The **looks** table (reuse: `DUNGEON_LOOKS`) — each dungeon names one or two looks; new looks are listed
  in §22.
- **No ceiling**, tall walls, a dark sky and close fog (reuse) — lit the film-set way (§2.12).
- **Chest grades** (reuse: `js/chests.js`: wooden, iron-bound, gilded, warded; warded = legendary floor,
  22% mimic). Dungeon chests never roll mimics except where a room or a Depth modifier says so.
- **Boss phases** from Farhold's `phases: [{at, modifier, say}]` grow into the full ability script of
  page 11 (new).
- **Champions inside** (reuse of `rankBonus`): replaced by **placed rarity slots** (§2.9), so a dungeon's
  champion packs and rares are where the designer put them, not wherever the dice fell.
- `gives` paid once per character, ever (reuse of R27's "pay once" rule) for story-quest rewards.

### 2.2 Entry

| Rule | Value |
|---|---|
| The door | every dungeon has a physical **entrance** in the open world: an arch, cave mouth or gate, with a **Gathering Stone** beside it (new). Walking through the entrance with your party loads the dungeon. A party inside a dungeon is in its own copy (an **instance**: a private copy of the place for your group only). |
| Open | every dungeon is **open**: no key, no attunement quest, no item needed at the door. Each dungeon's first-time **story quest** is optional; the dungeon can be run without it. |
| Discovery | the dungeon appears in the Dungeon Finder only after **you** have discovered its entrance (§2.3). Walking in through the door always works, discovered or not — the door counts as discovering it. |
| Gathering Stone | right-click: summons a party member who is in the same region and out of combat (costs nothing; 2 players must be at the stone). It also shows the dungeon's journal page and is where the leader sets the **difficulty** and **Depth** for a walk-in run. |
| Minimum level | Normal: **band floor − 1** (d01 opens at 4; d15 and d16 at 60). Challenge: **60** and an average equipped item level of **55 or more** (page 08). Depth: 60 for Challenge Depth; Normal Depth follows Normal's minimum (§2.4). |
| Party size | 1–5. Normal (and Normal Depth to Deep 5) accepts 1–5 players and fills empty slots with followers (§2.8). **Challenge** needs **5 players** — no followers. |
| Role check | the Dungeon Finder builds 1 Tank, 1 Healer, 3 Damage (Support counts as Damage; a hybrid may queue as its hybrid role, page 00 §6). A premade party may bring any mix. |
| Instance cap | a player may enter **10 instances an hour** (all dungeons together), to stop reset-farming. The 11th entry says when the next one frees up. |
| Leaving | walk out through the entrance, use the **Leave Dungeon** button on the party frame, or be removed by a vote kick (page 15). A player who leaves mid-run may re-enter the same instance for 10 minutes if the party has not filled the slot. |
| Instance reset | an empty instance resets 30 minutes after the last player leaves. The party leader can reset it manually when nobody is inside. |

### 2.3 The Dungeon Finder and discovery

The **Dungeon Finder** (`scr_dungeon_finder`, page 03; the queue rules are page 15's) lists **only the dungeons
you have discovered**. This is the owner's rule (00 §12.1 W9): you cannot queue for a place you have never found.

| Rule | Value |
|---|---|
| What counts as discovering | (1) walking within **30 m** of the entrance or its Gathering Stone (a chime, a card "Dungeon discovered: The Hollow Barrow", and the entrance pin appears on your map); (2) **arriving there by a teleport** — a Mage's **Portal**, an Oracle's **Guiding Call** (the assisted teleport that pulls one party member to the oracle), a Chronomancer's **Retrace**, a scroll, or a Travel Method stop that sits at the entrance (page 20 owns the list; page 00 §6). Arriving by teleport counts **only for the player who arrived**. |
| Per character | discovery is stored per character. A party leader cannot queue the group for a dungeon only the leader has found — each queued player must have discovered it. |
| Walk-in | a premade party that walks through the door never needs the Finder; anyone who walks in has discovered it by doing so. |
| Why it matters | it gives casters a job: a Mage who has found the Fire Court can open a Portal and bring four friends to its door, and now all five can queue for it. That is on purpose. |
| What the Finder offers | **Normal** (any discovered dungeon whose band you are in or above), **Challenge** (level 60, item level 55+), **Normal Depth** and **Challenge Depth** (only depths you have unlocked for that dungeon, §2.4). "Random Normal" picks among discovered dungeons in your band. |
| Matched group | teleported to the inside of the entrance; on leaving, each player returns to where they queued from. |
| The d14 relic door | **open**. Keeper Oswin's old "relic key" quest is gone; the door stands broken off its hinges (§d14). |

### 2.4 Depth

**Depth** is the dial that makes a dungeon you have already beaten worth coming back to. It replaces the old
Mythic+ keys: there is **no timer, no key item and no weekly rotation**. Page 12 owns every number here; page 10
owns the monster side (the extra rarity slots, enemy types and abilities each tier brings: page 10 §7.9 *Depth: the monster side*); page 11 owns the boss-mechanic rule (§22.2); page 08
owns how magic find is applied.

#### 2.4.1 Unlocking

| Rule | Value |
|---|---|
| First unlock | **Normal Depth 1** opens for a dungeon when you have killed its **end boss on Normal** once. **Challenge Depth 1** opens when you have killed its end boss on Challenge once. |
| Going deeper | killing the end boss at Depth *d* unlocks Depth *d + 1* for that dungeon and that difficulty, for every player in the party **who had Depth *d* unlocked** (you cannot skip depths by being carried). |
| Shortcut for level 60 | a level-60 character who has cleared a dungeon on Normal may start at its **level-60 depth** (see below) without climbing the rising depths first. |
| Who picks | the party leader, at the Gathering Stone or in the Finder, from the depths **the leader** has unlocked. |
| Losing depth | never. Failing a run (wiping out, leaving) costs nothing but time. |
| Where it shows | the Dungeon Finder, the Gathering Stone, the party frame (a **Depth badge**: the number, the tier as roman numerals, and one icon per Tear modifier) and the journal's Records tab (deepest depth per dungeon per difficulty). |

#### 2.4.2 Rising: the dungeon's level climbs to 60

On **Normal**, each depth raises the dungeon's level by **3**, from the top of its band, until it reaches **60**:

`level(d) = min(60, bandTop + 3 × d)`

The **level-60 depth** of a dungeon is the first depth where that formula reaches 60:
`D60 = ceil((60 − bandTop) / 3)`. Depths below it are **rising depths**; depths past it are **Deep** depths,
counted from 1: **Deep k = d − D60**.

| Dungeon | Band top | Rising depths (level at each) | Level-60 depth (D60) | Deepest depth (D60 + 30) |
|---|---|---|---|---|
| d01 | 7 | 1–17 (10, 13 … 58) | 18 | 48 |
| d02 | 12 | 1–15 | 16 | 46 |
| d03 | 16 | 1–14 | 15 | 45 |
| d04 | 18 | 1–13 | 14 | 44 |
| d05 | 22 | 1–12 | 13 | 43 |
| d06 | 24 | 1–11 | 12 | 42 |
| d07 | 28 | 1–10 | 11 | 41 |
| d08 | 30 | 1–9 | 10 | 40 |
| d09 | 34 | 1–8 | 9 | 39 |
| d10 | 39 | 1–6 | 7 | 37 |
| d11 | 45 | 1–4 | 5 | 35 |
| d12 | 51 | 1–2 | 3 | 33 |
| d13 | 57 | — | 1 | 31 |
| d14, d15, d16 | 60 | — | 0 (Depth 1 is Deep 1) | 30 |

While rising, a depth is **Normal at a higher level** plus a little more of everything:

| Rising rule | Value |
|---|---|
| Monsters | the dungeon's own bodies and bosses at `level(d)`, Normal numbers (H and %HP are relative, so nothing else changes) |
| Pack size | **+1 member** in every pack from rising depth 5, **+2** from rising depth 10 (added members are copies of the pack's cheapest member) |
| Champion packs | **+1 champion pack slot per 5 rising depths** (max +3), placed on the dungeon's rarity-slot rooms (§2.9) |
| Rares | the rare slot's rare gains **+1 affix** from rising depth 10 |
| Loot | as Normal, **item level = `level(d)`** — rising depths are a way to level through a dungeon you like, and to get gear at your level from it |
| Followers | allowed (§2.8) |
| XP | as Normal at `level(d)`; page 07 owns the numbers |
| Minimum level | `level(d)` − 3 (a rising depth never runs below the party's level: a party above `level(d)` meets `level(d)`) |

A **Challenge** run is already level 60, so **Challenge Depth starts at Deep 1**: Challenge Depth *d* = Deep *d* on
Challenge numbers.

#### 2.4.3 Deep: past level 60, every depth is substantially harder

Past the level-60 depth, the dungeon's level stays 60 and **health and damage climb** with every Deep depth. The
multipliers stack on top of the difficulty's own (Normal ×1, Challenge ×1.5 health / ×1.35 damage):

`health × 1.05^k` · `damage × 1.03^k` · packs grow by tier

| Deep k | Health ×(Normal) | Damage ×(Normal) | Health ×(Challenge) | Damage ×(Challenge) | Extra pack members | Tier |
|---|---|---|---|---|---|---|
| 0 (level-60 depth) | 1.00 | 1.00 | — | — | the rising bonus, if the dungeon had rising depths | — |
| 1 | 1.05 | 1.03 | 1.58 | 1.39 | +1 | I |
| 5 | 1.28 | 1.16 | 1.91 | 1.56 | +1 | I |
| 10 | 1.63 | 1.34 | 2.44 | 1.81 | +2 | II |
| 15 | 2.08 | 1.56 | 3.12 | 2.10 | +2 | III |
| 20 | 2.65 | 1.81 | 3.98 | 2.44 | +3 | IV |
| 25 | 3.39 | 2.09 | 5.08 | 2.83 | +3 | V |
| 30 (deepest) | 4.32 | 2.43 | 6.48 | 3.28 | +4 | VI |

(At Deep 0 the rising pack bonus is still in force; from Deep 1 the Deep column replaces it.)

**Why 30 Deep depths, and no more.** Gear stops at item level 60 (canon 00 §4), so a character's power past 60
comes only from better rolls, sockets (gems, jewels, souls, gadgets), special rarities and legendaries — about
**×3 to ×3.5** from fresh level-60 gear to a finished character (page 08's estimate). At Challenge Deep 30 a boss
has ×6.5 health against a finished group's ×3.5 damage, which puts a d14 end boss at roughly 9–10 minutes — the
longest fight this page allows before its hard enrage. And at ×3.28 damage almost every red telegraph on the page
is a one-shot with a 3.0 s warning; any deeper and fights stop being "read it and react" and become "memorise
everything or die", which breaks pillar 3 (readable danger). Thirty Deep depths is also enough ladder: at one run
a day, a group climbs about a tier a week.

**Rules at every Deep depth:**

| Rule | Value |
|---|---|
| Warning times | the floors of the difficulty the run uses (page 11 §4.1) — **Depth never lowers a floor**; the 3.0 s one-shot rule applies to anything a multiplier pushed to 100 %HP |
| Enrage timers | **hard** from Deep 1 on both difficulties (the boss wipes the group 20 s after the timer) |
| Boss rows | **Deep tuning** and Depth list ① join at **Tier II** (Deep 6+); Depth list ②/③ at **Tier IV** (Deep 16+) |
| Followers | Normal Depth: allowed to **Deep 5** (Tier I). Deeper, and all of Challenge Depth: players only |
| Secret bosses | available at every depth if their condition is met; they get the same multipliers and tier additions |
| Dialog opportunities | unchanged (a reply that skips a phase still skips it) |
| Checkpoints and wipes | as §2.5 |

#### 2.4.4 Depth tiers (every 5 depths)

Every 5 Deep depths is a **tier**. A tier adds more and tougher enemies, **new enemy types** and **new enemy
abilities**. Page 10 owns the monster side (§7.9 *Depth: the monster side*: the extra rarity slots per tier, and per
family a **Depth ability I**, a **Depth type** monster, a **Depth ability II** and a **Depth warden**); page 11 owns the
boss-mechanic rule (§22.2). This table puts them together and adds page 12's own parts (pack size, Tear modifiers,
the Tear phase). Page 10 names its tiers 1–5; page 12's roman numerals are the same tiers.

| Tier | Deep | More enemies (page 12) | Tougher enemies (page 10 §7.9.1) | New enemy types (page 10 §7.9.2) | New enemy abilities | Tear modifiers (§2.4.5) |
|---|---|---|---|---|---|---|
| **I** | 1–5 | +1 member per pack | +1 champion slot; rares roll 3 affixes; Giant and the elements unlocked | — | — | 0 |
| **II** | 6–10 | +2 members per pack | +2 champion, +1 rare, +1 greater slot; +1 minion per rare | — | every normal trash monster of a family gains its **Depth ability I**; every boss gains **Deep tuning** and **Depth list ①** | 1 |
| **III** | 11–15 | +2; one extra pack per wing | +2 champion, +1 rare, +2 greater slots; up to 2 greater rarities on one monster | the family's **Depth type** joins its packs (1 per pack) | — | 1 |
| **IV** | 16–20 | +3 | +3 champion, +2 rare, +2 greater (one a `greater_pack`); champion packs 2 affixes | — | every member gains **Depth ability II**; every boss gains **Depth list ② or ③** | 2 |
| **V** | 21–25 | +3; the extra pack per wing is an elite pack | +3 champion, +2 rare, +3 greater (one a `greater_pack`); up to 3 greater rarities on one monster | the **Depth warden** of the dungeon's **main family** (named on each card) waits in one room | end and secret bosses gain a **Tear phase** at 30%: one of the depth's Tear modifiers turns on at double strength for the rest of the fight | 2 |
| **VI** | 26–30 | +4 | tier V's slots again **plus one of each** (champion, rare, greater) | a **second Depth warden** in another room | — (the boss lists are complete at IV) | 3 |

Rising depths (below level 60) use none of this table; they have their own lighter rule in §2.4.2.

#### 2.4.5 Tear modifiers (the Mend is thin in deep places)

Deep in a dungeon, the Mend — the woven light over the Tear (page 01) — is thin, and the Tear leaks through. Each
Deep depth carries **0–3 Tear modifiers** (by tier, above). **Which** modifiers a depth carries is fixed by the
dungeon and the depth (a seeded pick: the same input always gives the same output), so "d07 Depth 24" always has
the same two modifiers and a group can learn it. There is **no weekly rotation**. The Depth badge shows each
modifier's icon; hovering it gives the text below.

| id | Modifier | What happens | Counterplay |
|---|---|---|---|
| `dmod_tearstorm_pockets` | **Tearstorm Pockets** | two 4 m pockets of Tearstorm (violet lightning, a **void zone**) drift along the walls of every room at 1.5 m/s. Inside: 3 %HP every 0.5 s and your spells cost 25% more; **enemies** inside gain +20% attack speed | pull packs away from the pockets; do not fight in a corridor a pocket is coming down |
| `dmod_shiftwood_mimics` | **Shiftwood Mimics** | in each wing, one chest, one lever and one piece of furniture are **Shiftwood mimics** (page 10: Tear-wood wearing the shape of an object, 3 H elite, **Splinter Grab** 18 %HP + held 2 s). They wake when touched or when a fight comes within 8 m | look twice: hovering an object for 2 s shows a faint violet wood-grain on a mimic. Kill it before using the real thing |
| `dmod_floating_stone` | **Floating Stone** | every 30 s in combat, three 4 m floor discs lift 3 m for 8 s (a red ring warns 2.0 s before). Anyone on a disc is lifted with it; melee cannot reach between floor and disc; falling off costs 10 %HP. Ground telegraphs on the floor do not reach a raised disc, and the other way round | a free dodge for whoever is on a disc — and a lost tank if the boss is lifted away from him |
| `dmod_thin_mend` | **Thin Mend** | every 45 s a **rift** (a 3 m white tear) opens somewhere in the room for 10 s. Within 6 m of it: +15% damage dealt, and **Rift Drain** 1 %HP a second that no heal removes until you step out | a choice: damage players stand near it for burst windows, healers stay away |
| `dmod_borrowed_shapes` | **Borrowed Shapes** | one pack per wing is Riftborn wearing that pack's shapes (the same bodies, drawn grey-violet). Each splits into two 0.4 H copies when it dies | area damage; do not pull it with another pack |
| `dmod_tear_glass` | **Tear-Glass Rain** | every 12 s in combat, three 3 m red circles of falling tear-glass (1.8 s, 12 %HP); the glass stays for 20 s as a 3 m patch that slows 30% | move early; do not stack patches under the tank |
| `dmod_lying_voices` | **Lying Voices** | 1 in 4 boss **warning lines** names the wrong thing ("The left will burn!" when the right will). **The ground telegraph never lies** | read the floor, not the banner |
| `dmod_unmade_echoes` | **Unmade Echoes** | an elite or champion that dies leaves a grey 3 m circle for 3 s; if nobody stands in it, the monster rises again at 30% health | one player steps in each circle |
| `dmod_loose_time` | **Loose Time** | every 40 s in combat, every player is put back where they stood 4 s ago (a faint afterimage marks the spot 2 s before) | stand somewhere safe 4 s before the jump; the jump never moves you into a wall |
| `dmod_tear_pressure` | **Tear Pressure** | every 20 s of a fight, all enemies gain +4% damage (stacks, clears when combat ends) — a soft enrage on every pull | kill fast; do not pull three packs at once |

A boss room's modifiers apply to the boss fight too, except **Shiftwood Mimics** and **Borrowed Shapes** (trash
only). The end-and-secret-boss **Tear phase** (Tier V) turns one of the depth's modifiers on at double strength
from 30% (double pockets, discs every 15 s, rifts every 22 s, and so on).

#### 2.4.6 Depth rewards

Depth pays through the normal boss drops (with Depth's bonuses) **and** through the **Depth Cache**: a chest that
appears in the end boss's room after the kill **every run**, for every player (personal loot; it has no weekly
limit — the 10-instances-an-hour cap is the only brake). Item level is **never above 60**: rising depths drop
item level `level(d)`, every Deep depth drops item level 60.

Rewards read a **reward depth R**: on Normal, **R = Deep k**; on Challenge, **R = Deep k + 10** (a Challenge run
at Deep 1 pays like Normal Deep 11). R tops out at **40** (Challenge Deep 30).

| R | Cache items (per player) | Rarity floor | Rare / Epic / Unique / Set / Legendary odds per cache item | Jewel in the cache | Soul in the cache | Special rarity on each item (page 08) | Bonus magic find for the whole run (item rarity / item quantity / gold find) |
|---|---|---|---|---|---|---|---|
| 0 (rising or level-60 depth) | 1 | Rare | 60 / 30 / 5 / 5 / 0 % | 5% (Uncommon) | — | 0.2% | +0 / +0 / +0 |
| 5 | 1 | Rare | 55 / 33 / 6 / 5.5 / 0.5 % | 10% | 0.5% | 0.5% | +10% / +5% / +10% |
| 10 | 2 | Rare | 45 / 38 / 8 / 7.5 / 1.5 % | 15% | 1% | 1% | +20% / +10% / +20% |
| 15 | 2 | Rare | 35 / 44 / 10 / 9 / 2 % | 20% (Rare possible) | 1.5% | 1.5% | +30% / +15% / +30% |
| 20 | 2 | Epic | — / 72 / 13 / 12 / 3 % | 25% | 2% | 2% | +40% / +20% / +40% |
| 25 | 3 | Epic | — / 67 / 15 / 14 / 4 % | 30% (Unique possible) | 3% | 2.5% | +50% / +25% / +50% |
| 30 | 3 | Epic | — / 62 / 17 / 16 / 5 % | 35% | 4% | 3% | +60% / +30% / +60% |
| 35 | 3 | Epic | — / 58 / 18 / 18 / 6 % | 40% | 5% | 3.5% | +70% / +35% / +70% |
| 40 (deepest) | 4 | Epic | — / 54 / 19 / 20 / 7 % | 50% | 6% | 4% | +80% / +40% / +80% |

Between rows, values rise in a straight line. Cache items are picked from the whole dungeon's loot tables
(any boss), filtered to your loot specialisation (§2.7). The legendary column can give the dungeon's **[D-EXCL]**
legendaries **including the [SECRET] one** (at a quarter of the listed chance), so a group that cannot meet a
secret condition still has a slow road to its prize. From **Deep 10**, every Depth Cache rolls an extra **8%** for a **class set token**
(`it_token_<slot>`, page 09) of one of your class's endgame sets that names this dungeon (or any dungeon d13–d16) as a source. From **R 15**, the cache can also hold the class legendaries and uniques that the class files mark "Depth 15+". Magic find from gear adds on top of the run's
bonus (page 08 owns how the stats stack and their caps). **Greater-rarity monsters** drop the matching special
rarity more often (an Electrified monster → Electrified items, page 08/10), which is one more reason to go deep.

**Boss drops at Depth:** Normal Depth bosses drop every run (Normal's rule) with the run's bonus magic find;
Challenge Depth bosses share the **Challenge weekly lock** (a boss you have already looted this week on Challenge
drops nothing for you — the Depth Cache still pays).

#### 2.4.7 Depth with followers (solo and small groups)

Normal Depth accepts followers (§2.8) through **Deep 5** so a solo player can keep climbing while levelling and
into the first Deep tier. Followers read telegraphs with their normal 0.6 s delay; at Deep, their reliability drops
from 92% to **88%** (they are not built for Tear modifiers). Past Deep 5 the Finder will not add followers and the
Gathering Stone will not accept a party with one.

### 2.5 Wipes, respawn and checkpoints

| Rule | Value |
|---|---|
| Death | a dead player's body stays where it fell as a **ghost marker** for 60 s; allies can revive it (page 05 rules; there is **no limit** on revives in combat, 00 §12.1 W21). After 60 s — or at once with **Release** — the player respawns at the last **Brazier Shrine** reached. |
| Brazier Shrine (checkpoint) | a lit brazier-shrine (reuse: `brazierBody` in `js/chests.js`) that lights when the party first walks past it. Every dungeon has one at the entrance and one after each main boss (not after sub-bosses). A shrine also refills health and resource out of combat. |
| During a boss fight | the arena **seals** (a portcullis or thorn wall in the dungeon's look). Released players wait at the shrine; they cannot rejoin until the fight ends. |
| Wipe | every player dead (or out of the arena) = a **wipe**. The boss resets to full health, its adds despawn, the doors open after 5 s. Trash already killed **stays dead**; patrols (marked *patrol*) respawn on a wipe only on Normal. |
| Run-back | released players run from the shrine. No monster between the shrine and the next boss door respawns. |
| Boss reset (no wipe) | if the whole party leaves the arena, the boss resets and heals. A boss **cannot be pulled out** of its arena ("leash": it walks back and resets at the door). |
| Normal "Rekindle" | on Normal (not Depth) only, a party of 1–2 real players gets one free **Rekindle** per boss: at a wipe, the fight pauses 3 s and everyone stands back up at 50% health, boss unchanged. It is a kindness for solo players with followers, not a mechanic. |

### 2.6 Loot limits

How often a boss gives **you** loot. It is per character, per difficulty. The weekly reset is **Monday 06:00**
server time (canon 00 §4).

| Difficulty | Rule |
|---|---|
| Normal (and Normal Depth) | every boss rolls loot for you **every run** — no loot limit. The 10-instances-an-hour cap is the only brake. |
| Challenge (and Challenge Depth) | each boss drops loot for you **once per week** (Monday 06:00). After that it drops only gold. You can run it as often as you like. The **Depth Cache** is not limited. |
| Secret boss | as its difficulty: every run on Normal, once a week on Challenge. |
| Story quest `gives` | pays once per character, ever. |

A player locked to a Challenge boss can still help: the boss drops loot for the players who are not locked.

### 2.7 Loot

**Personal loot, gold only, tradeable.** Each player rolls separately; nobody can take anyone else's drop. Every
item is **tradeable** — it can be traded, mailed, sold on the Trading Post or given away (canon 00 §12.1 W18);
only quest items (marked "Quest item") cannot. What drops is filtered to the player's **loot specialisation** (a
dropdown on the dungeon journal: any of their class's roles, or "any"). Drops you already own an equal-or-better
copy of are rerolled once. **Gold is the only coin** (canon 00 §4): there is no dungeon currency, no marks, no
tokens that buy things — bosses drop items and gold; page 08 owns the gold amounts.

**Magic find.** Every drop reads the looter's **item quantity** and **item rarity** stats, and every gold drop
reads **gold find** (canon 00 §12.3; page 08 owns the rule and the caps). Depth adds a run-wide bonus on top
(§2.4.6).

**Item level.** Normal drops the dungeon's band level (the level the monsters were scaled to); Challenge and every
Deep depth drop **item level 60**. There is no item level above 60 and no special "touched" tier (00 §12.1 W17).

| Source | Normal | Challenge |
|---|---|---|
| Trash | 3% per kill: a band-level Common–Rare | 3%: level-60 Uncommon–Rare |
| Sub-boss | 30% chance: one item from its table | 35% (weekly lock) |
| Main boss | 50% chance: one item | 55% (weekly lock) |
| End boss | 100%: one item; 25% a second | 100% + 25% (weekly lock) |
| Secret boss | 100%: one item from its table, **10% chance of its [SECRET] legendary** | 100%, **15%** legendary (weekly lock) |
| Chests in the dungeon | per `js/chests.js` grade | same |
| Depth | + the Depth Cache (§2.4.6) | + the Depth Cache |

**Legendary, unique and soul rates** inside a boss's table follow page 08. As a rule for this page: a boss's
listed **[D-EXCL] unique** is 1 in 6 of its drops, a **[D-EXCL] legendary** from a main or end boss is
1 in 40 on Normal and 1 in 25 on Challenge, and a **[D-EXCL] soul** (a socketable, canon 00 §12.3) is **4%** per
player per kill on Normal and **8%** on Challenge from the boss that lists it. Bad-luck protection for legendaries
is page 08's (it never uses a currency).

**Class set pieces** (page 06/09 class sets): the class endgame sets (the ones that used to come from raids) drop as
**set tokens** matched to the looter's class (`it_token_<slot>`, new; page 09 owns it — a token is an item, not a currency)
from the **Challenge** bosses of **d15 and d16** (one slot per boss, listed under each dungeon's *Set dropped here*), and an
**8%** roll in the **Depth Cache from Deep 10**. Class sets that the class files source to "Challenge d13–d16" also drop from
d13's and d14's Challenge end bosses (a token for any slot, 20% per player per week). Generic sets named `set_<snake>` below drop from any boss in their dungeon on every difficulty.

**Generic uniques with a dungeon source** (page 09 §4.2): some of page 09's headline uniques list a dungeon's
bosses as an extra source (6% per player per boss, shared with that boss's other listed uniques; e.g.
`uq_nettlepin` from d01). That roll is **on top of** the boss's own line on this page; page 09 owns which
unique names which dungeon.

**Class items with a dungeon source** (the class files): each class file lists its own uniques, legendaries and
souls with a source such as "`d02_drowned_mill` final boss `b_the_grindwheel`, 10%" (e.g. the warlock's
`uq_marsh_hermits_contract`). **The class file's source line is the rule**: that item is added to that boss's
table **for a looter of that class only**, at the stated chance, on top of this page's line, and it is not
repeated in the per-boss loot lines here (about 250 such items across the 30 classes). A class file's boss id must
be one of this page's (§21.2).

Where a dungeon had a generic set from both pages, **this page's set is the one that
drops** (page 09 §3.32 retires its duplicates: `set_millrace`, `set_glasswrights_regalia`, `set_thornstalker`,
`set_moonwell_vestments`, `set_pitfighters_harness`, `set_saltchoir_raiment`, `set_cindergate_bulwark`).

**Re-slotted items (round 2).** Canon has **15 equipment slots** and no trinket, wrist or light slot (00 §4). Every
item this page had filed as a *trinket* is now a **[D-EXCL] soul** (`soul_<snake>`, a socketable with a new
behaviour; its old "use:" button became an automatic trigger), and every *wrists* item moved to hands, waist or
another slot. The light-slot items moved too. The full old → new list is in §21.4.

### 2.8 Follower fill (solo and small groups, Normal only)

**In Farhold (reuse: `js/followers.js`, `js/pets.js`):** followers have 3/4/5 slots at levels 1/20/30, ten
mercenary types from a broker, and class companions; `scaleFollower` caps a follower at 75% of the top of the
player's own swing.

**In Wildmarch:** on Normal (and Normal Depth to Deep 5), every empty party slot is filled at the door by a
**dungeon follower** (new):

| Rule | Value |
|---|---|
| Who | the player's own hired followers first (page 07/15), then free **Wayfarer** stand-ins for the missing roles: `npc_wayfarer_shieldbearer` (Tank), `npc_wayfarer_mender` (Healer), `npc_wayfarer_blade` / `npc_wayfarer_bow` (Damage). Class companions (a ranger's tamed beast, a warlock's bound demon, a necromancer's controlled undead) are *not* party members and do not fill a slot. |
| Power | a stand-in has 85% of a player's health and damage for its level; it uses a fixed 4-spell kit. |
| Mechanics | followers **read telegraphs**: they leave danger zones and void zones, stand in soaks and safe zones, spread from targeted circles and break tethers, with a **0.6 s reaction delay** and **92% reliability** per mechanic (88% at Deep; 8% of the time they are late by 1 s — enough to take a hit, never enough to one-shot them because their reaction starts at the telegraph). A follower tank taunts on swap mechanics. Followers **do** count toward soaks (unlike class pets, 00 §10). |
| Interrupts | a follower interrupts the first interruptible cast it can reach, 1 per 12 s. |
| Dialog | followers never pick a dialog reply; the player does. |
| Challenge / Depth past Deep 5 | followers are not allowed. |
| Loot | followers never take loot. |
| Secret conditions | every secret boss can be unlocked with followers on Normal, except where a dungeon says "players only". |

### 2.9 Rarity slots (where champion packs and rares are placed)

Page 10 owns the **monster rarities** — champion packs (blue names, one shared affix), rares (yellow name, affixes and
minions), the **greater rarities** layered on top (Giant, Flaming, Electrified, Frozen…) — their affix tables, the
**slot kinds** and the **per-run budget** (page 10 §7.8). This page owns **where** the slots are.

In the open world rarities are rolled at random. **In dungeons they are placed on purpose**: each dungeon card lists
its rarity slots by room (and, where a room has several packs, the candidate packs). **Which** pack of the candidates,
which affixes, which greater rarity and which name are rolled when the run starts (seeded per run, the same for the
whole party). So a group knows "there will be a champion pack in the Grave Row" but not which pack, nor what it does.
The dungeon map shows a pip on each slot room (blue champion, yellow rare, orange greater).

| Slot kind (page 10 id) | Card mark | Normal d01–d04 | Normal d05–d16 | Challenge |
|---|---|---|---|---|
| Champion slot (`champion`) | **C** | the card's two **C** rooms | the two **C** rooms | the two **C** rooms + the **C+** room |
| Rare slot (`rare`) | **R** | the **R** room | the **R** room | the **R** room + the **R+** room |
| Greater slot (`greater`) — one lone greater carrier in the pack | **G** | — | the **G** room | the **G** room |
| Wild slot (`wild`) — rolls as the open world does for the band | **W** | — | — | the **W** room |
| Greater pack slot (`greater_pack`) | — | — | — | only through Depth tiers IV+ (page 10 §7.9.1) |
| Depth | — | page 10 §7.9.1's extra slots per tier go to the card's **C / R / G** rooms first, then to the listed **Depth rooms** | | |

**Placement rules** (page 10 §7.8, checked by a data test): never a slot in a boss room or within 20 m of a boss arena's
door; at most one rare slot per room; on Normal a greater slot is never in the same room as a rare slot; a slot's carrier
counts toward the room's pack size, not on top of it. Bosses, named trash (Grip, Lug and Mugg…) and puzzle objects
never roll a rarity. Placed rarities add loot as page 10's rank table says (page 08).

**Main family.** Each card also names the dungeon's **main family** (page 10's 18 families) — the family whose
**Depth warden** appears at tier V — and every family its packs use.

### 2.10 The dungeon journal (`scr_dungeon_journal`, new — page 03 must list it)

Opened with **Shift+J** (page 02), from a Gathering Stone, or by clicking a dungeon on the map. A dungeon you have
not discovered shows as a locked silhouette with its region name only.

| Tab | What it shows |
|---|---|
| **Overview** | name, region, level band, entrance (map pin + "Track" button), story hook, quest giver, run time target, your Challenge bosses looted this week, your best time, your deepest Depth |
| **Bosses** | one card per boss in order (sub-bosses indented). **Every ability is visible from the start** (readable danger beats discovery, 00 §10), with its icon, shape, colour and warning time; Challenge and Deep rows are listed under their own headers. A "Tank / Healer / Damage" filter shows role tips. Boss dialog you have heard is kept in a transcript. |
| **Loot** | every boss's table, filterable by difficulty, class, slot and loot specialisation; [D-EXCL] and [SECRET] items marked; items you own ticked; souls listed with their socket requirement |
| **Map** | the dungeon's map, rooms revealed as you enter them, Brazier Shrines, bosses, chests found, rarity-slot rooms marked |
| **Secrets** | one line per dungeon: "???" until the secret boss has been found **by you**. Once found, the unlock condition is written out in full. A hint line ("Something in the barrow is missing its ring") appears after your third clear. |
| **Depth** | the depths you have unlocked on each difficulty; for the selected depth: the level, the multipliers, the tier, its Tear modifiers with full text, and the reward depth R |
| **Records** | clears per difficulty, best time (a record, not a timer), deaths per boss, deepest Depth per difficulty, secret kills |

### 2.11 Raid-style mechanics, tuned for five

Raids are parked in `WISHLIST.md` (00 §9). Their **mechanics** are kept — in dungeons, for at most five players.
The rules every raid-born mechanic on this page follows:

| Raid habit | Five-player rule |
|---|---|
| Soaks of 5–10 pips | soaks need **1–3** pips. A **"everyone in" soak (4–5 pips)** is allowed once per fight as a named finale, and never at the same time as another soak |
| Two tanks, tank swaps | **one tank** and a **tank handoff** (page 11 §16) instead of a swap: the boss's stacking debuff has three answers — a 6 s **handoff** to anyone with a taunt (a hybrid tank, a tank follower), a **Brace** defensive timed for the threshold hit, or a **Cleansing Pool**. On Normal the stack caps one below the threshold. Every tank-stack mechanic in d15–d16 has a room object that works as its Cleansing Pool (a trough, a grate, a shade); on Challenge the object is gone or slower, so the handoff or the Brace is needed. Older rows on this page that still say "handoff at N" mean this rule |
| Two tanks on two targets | never. Paired bosses share one tank (they stand together) or one of the pair is **kited** by a Damage player |
| Big add waves | at most **4 adds** at once on Normal, **6** on Challenge |
| Split raid (realms, rooms, duels) | splits are **2 / 3** (or 1 / 4 for a duel). A split side always has a way to heal itself (a beneficial zone or the split lasts ≤ 20 s) |
| Player objects (ballistae, cannons, levers) | worked by **1–2** players, never more |
| Role soaks ("the tanks' circle, the healers' circle") | one circle per **role present**; a missing role's circle never appears |
| "Lethal" raid hits | become **one-shots with 3.0 s warning**, never a hidden or unavoidable kill |

**Mechanics lifted from the shelved raids r01–r03** (the raid versions stay in `WISHLIST.md`). Each is a Challenge
row on an existing boss, marked **Challenge (from rNN)**:

| Raid mechanic (source) | Now on | What changed for five |
|---|---|---|
| **Polarity** — every player is Sun or Moon; hitting your own colour's twin heals it (r03 *The Pearl Twins*) | d08 B1 **Sael and Nerith** | 3 / 2 split, the tank has no colour; colour soaks of 2 pips |
| **Unnamed** — a player who cannot be healed unless someone stands in their green ring (r01 *The Ninth Heir*) | d05 END **King Sethar** | one target at a time, 5 s, and the ring is 4 m (one helper) |
| **Body-block beam** — a beam at the healer that a second player steps into to halve (r02 *Council of Cold*, Glacial Beam) | d10 B2 **Rimeweaver Seidra** | one beam, 4 s, the blocker takes half and gains 2 Chill |
| **Song lanes** — sung notes; the lane of the last note is safe (r03 *The Drowned Cantor*) | d11 B2 **The Choir of Brine** | 3 lanes (not 5), 3-note phrases, the Alto sings them |
| **Unsaid** — a gold-bordered cast you must **not** interrupt (r03 *The Unsung*) | d11 B1 **Deacon Mourne** | one Unsaid per minute, clearly voiced ("Let me finish."), 4.0 s |
| **Echo** — your position 8 s ago lights red (r03 *The Unsung*) | d12 B2 **The Mirror Apprentices** | every 15 s, 3 m circles, 2.0 s warning |

The two story raids **r04 The Ember Court** and **r05 Veilspire** became whole dungeons: **d15 The Fire Court** and
**d16 The Spire** (below), with their best bosses rebuilt under these rules.

### 2.12 Dark places are film-set dark

Wildmarch is always daytime (canon 00 §4). A crypt, a mine, a sunken cathedral or a cave **looks** dark — deep
colours, strong shadows, a black sky over the roofless walls — but ambient light keeps every floor, telegraph and
enemy readable, like a night scene in a film that was shot in daylight. Caves are lit by **glowing fungi, lava,
luminous plants and crystal**; crypts by braziers, grave-candles and pale grave-moss; flooded rooms by green light
through water. No mechanic on this page depends on the player carrying light, and nothing is hidden by darkness.
Page 17 owns the lighting rules; each dungeon's look (§22) names its light sources.

---

## 3. The dungeon template

Every dungeon section below uses this order. A builder can turn each block into one JSON file
(`data/dungeons/<id>.json`, page 16).

1. **Card** — id, name, region, level band (and D60 for Depth), looks and light sources, entrance, quest giver +
   story quest, run time target (Normal / Challenge; a record, never a timer), Brazier Shrines, **rarity slots**.
2. **Story hook** — two to four sentences.
3. **Layout** — an ASCII map (wings and rooms, `[B]` boss, `[s]` sub-boss, `(S)` shrine, `?` secret),
   followed by a room list.
4. **Trash** — a monster table (id, name, body, H, abilities with numbers and telegraphs) and a pack list by room.
5. **Sub-bosses** — at least two.
6. **Main bosses** — two to four, then the **end boss**.
7. **Secret boss** — with its unlock condition.
8. **Dialog opportunity** — at least one per dungeon (page 11: a pause where the party picks a reply; in a group
   the party votes and a tie goes to the leader, 00 §10).
9. **Loot** — per boss; set, [D-EXCL] uniques, souls and legendaries.

Boss block fields:

```json
{
  "id": "b_example",
  "name": "The Example",
  "body": "creature golem ×2.4",
  "rank": "sub | main | end | secret",
  "health": "80 H (Normal); Challenge ×1.5; Depth by §2.4",
  "phases": [{ "at": 1.0, "name": "..." }, { "at": 0.5, "name": "..." }],
  "abilities": [{ "name": "", "shape": "", "colour": "", "warn": 2.0, "damage": "", "counter": "" }],
  "enrage": "6:00 soft (Normal) / hard (Challenge, Deep)",
  "dialog": { "pull": "", "abilityLines": {}, "phase": [], "death": "" },
  "challenge": [], "deep": [], "challengeFromRaid": { "source": "r03 The Pearl Twins", "rows": [] },
  "loot": []
}
```

Voice: every boss speaks through Lingo (reuse: `lingo/`) with a formant voice from `shared/voices.js`
(reuse), a speech bubble and a centre-screen banner for the lines marked **(banner)**. A line marked
**⚠** *is* the warning for the ability named beside it and always plays at the moment the telegraph appears.

---

## 4. Mechanic ladder: what each dungeon teaches

The owner asked for early dungeons to be simple and later ones to layer mechanics. This is the budget each
dungeon's bosses are held to on **Normal** (Challenge and Deep rows add on top).

| Dungeon | Band | New mechanics introduced | Most mechanics active at once on a Normal boss |
|---|---|---|---|
| d01 Hollow Barrow | 5–7 | danger zone, void zone, adds, interrupt (**one per boss**) | 1 (+ melee) |
| d02 Drowned Mill | 9–12 | tether, moving wave, targeted spread | 2 |
| d03 Shaft Seven Mines | 13–16 | soak, line of sight, knockback toward edges | 2 |
| d04 Bellows Keep | 16–18 | tank handoff (stacking debuff, page 11 §16), room-wide with safe zone | 2 |
| d05 Glass Tombs | 19–22 | beams + mirrors, checkerboard, cross | 3 |
| d06 Vault of the Sandsworn | 22–24 | dispel, puzzles under pressure, pushback walls | 3 |
| d07 Thornheart Hollow | 25–28 | spreading DoTs, beneficial zones, root tethers | 3 |
| d08 Moonwell Ruins | 28–30 | donut, silver/dark phases of the well, shared-health twins | 3 |
| d09 Warmaster's Pit | 31–34 | add waves, kiting, arena hazards, single combat | 3 |
| d10 Rimefang Caverns | 36–39 | stacking cold + warmth zones, slippery floors, falling hazards | 4 |
| d11 Saltdeep Cathedral | 42–45 | rising water, interrupt rotations, positional bells | 4 |
| d12 Unmade Workshop | 48–51 | portals, gravity flips, mirrored copies | 4 |
| d13 Cindergate Bastion | 54–57 | multi-soaks, overlapping patterns, hard tank handoffs | 5 |
| d14 Ashen Reliquary | 58–60 | everything layered; phase-by-phase recaps of earlier dungeons | 5 |
| d15 The Fire Court | 60 | a boss you must stop walking, an allied boss you choose, choices that carry forward (Court Favour), player-worked ballistae, a boss that changes body | 5 |
| d16 The Spire | 60 | two realms at once (the party splits 2/3), time rewinds, copies of the party's own classes, a boss you must answer rather than kill | 5 |

---

## d01 — The Hollow Barrow

### Card

| Field | Value |
|---|---|
| id | `d01_hollow_barrow` |
| Region | Hearthvale (`hearthvale`) |
| Levels | 5–7 (opens at 4) · Challenge 60 · Depth 1–48 (level 60 at Depth 18; §2.4) |
| Looks | `barrow` (upper), `crypt` (lower) (reuse: `DUNGEON_LOOKS`) |
| Entrance | **Barrow Hill**, a grass mound in the old orchards 1.2 km north of Brightwater. The doorstone has been rolled aside and a trail of grave dirt runs down to the road. A Gathering Stone stands at the foot of the mound. |
| Quest giver | `npc_warden_hedda_thorne`, Vale Warden sergeant, at the Brightwater watch-house |
| Story quest | `q_the_open_barrow` — "The Open Barrow": close the barrow by putting its lord back to sleep. Reward: 1 Uncommon weapon of your choice, 420 XP (page 14 owns the XP value) |
| Run time target | Normal 15 min · Challenge 18 min (no timer; the journal records your best time) |
| Brazier Shrines | Doorstone (entrance) · after Sexton Morrow · after Mother Ossel |
| Rarity slots (§2.9) | **C** Grave Row (pack 1 or 2) · **C** Ossuary Walk (pack 4 or 6) · **R** Ossuary Walk (the Barrow Guard of pack 5) · *Challenge:* **C+** Rat Warren (either rat pack) · **R+** Grave Row (the Barrow Guard of pack 3) · **G** Rat Warren (the other rat pack) · **W** the Grave Row patrol · *Depth rooms:* Grave Row, Ossuary Walk. Grip never rolls. |
| Main family (page 10) | **undead** (Depth warden) · also beast, folk |
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
| Doorstone | 14×10 | barrow | Brazier Shrine S1, Gathering Stone inside |
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
| `m_folk_grave_robber` | Grave Robber | chibi2 human, hood, shovel | 1 | **Throw Dirt**: 6 m cone, 1.5 s, blinds 2 s (misses 50% of attacks). At 30% health runs for the next room to fetch help (stop him: slow, stun, kill). |
| `m_undead_barrow_guard` | Barrow Guard (elite) | chibi2 undead ×1.3, round shield, hand axe | 3 | **Shield Wall**: takes 70% less damage from the front for 4 s every 15 s (shield glows). **Overhead Chop**: 90° cone 5 m, 1.5 s, 15 %HP. Hit it from behind while the shield is up. |
| `m_beast_tomb_moth` | Tomb Moth | creature moth ×1.3, grey | 0.5 | **Dust Shed**: on death leaves a 3 m **void zone** for 8 s, 2 %HP every 0.5 s. A gentle preview of B2's mechanic. |

**Packs by room** (Normal; Challenge the same bodies at level 60):

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
**Enrage:** 4:00 soft. **Challenge:** a rat that reaches a player climbs on and adds 2 %HP a second until shaken off (dodge roll). **Deep tuning:** holes open 2 at a time from 50%.
**Depth list** (page 11 §22.2): ① `mech_add_swarm` a fifth hole opens: 5 more Cairn Rats every 20 s · ② `mech_void_growing` a nest of rot 3 m that grows 0.5 m every 5 s · ③ `mech_fixate_chase` one rat fixates the healer (6 %HP a bite).
**Loot:** `it_warren_gnawed_belt` (light waist), `it_skritchs_tooth` (dagger), `uq_crown_of_teeth` **[D-EXCL]** — helm, light: +6% attack speed; each kill within 10 s grants +2% movement speed, stacking to 10%.

#### s2 · `b_pell_lantern_thief` — Pell, the Lantern Thief

| Field | Value |
|---|---|
| Body | chibi2 halfling, patched cloak, hooded lantern, two daggers |
| Health | 18 H |
| Where | Lantern Loft |
| Teaches | **interacting with the room** (kick over smoke pots) and the first **dialog opportunity** |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Quick Knives | melee | — | 2 × 4 %HP every 1.6 s | — |
| **Smoke Pots** | she lights the loft's three smoke pots: a grey haze 1 m deep lies on the floor (the room stays fully visible — the haze is a floor effect, not darkness) | 2.0 s ("Smoke 'em out!") | for up to 12 s Pell **cannot be targeted** (Tab skips her, spells aimed at her have no target) and every 2 s she throws **Dirty Knife** at a random player, 9 %HP | any player kicks over a pot (hold **E** 1.0 s); each pot kicked cuts 4 s. All three = the smoke clears at once |

**Dialog:** pull — "Finders keepers, dead folk don't count!" · Smoke Pots ⚠ — "Smoke 'em out!" · 50% — "You're not wardens. Wardens are slower."
**Dialog opportunity — "Pell's bargain"** (at 20% health she drops to her knees; combat pauses up to 20 s; the party votes, a tie goes to the leader — page 11):

| Reply | Result |
|---|---|
| "Give back the ring and go." | Pell hands over the **Thane's Ring** (quest item `it_thanes_ring`, see Secret) and flees. She drops no loot, but her strongbox in the loft opens (iron-bound grade). |
| "You'll hang in Brightwater." | Fight resumes. She drops normal loot. The ring falls into a crack in the floor and is **lost for this run**. |
| (no reply in 20 s) | as "hang". |

**Enrage:** 4:00 soft. **Challenge:** Smoke Pots last up to 18 s and a pot needs 2.0 s to kick over. **Deep tuning:** she drops a caltrop **void zone** (2 m, 10 s, 2 %HP every 0.5 s) where she stands each time she throws a knife.
**Depth list** (page 11 §22.2): ① `mech_spread_mark` Knife Toss: yellow 5 m on 2 players, 20 %HP · ② `mech_arrow_pin` Pinning Knife: a 25 m line, 15 %HP + root 1 s · ③ `mech_swap_places` Switcheroo: two players swap places (2.5 s).
**Loot:** `it_pells_patched_cloak` (back), `it_loft_knife` (dagger), `uq_pells_quiet_hood` **[D-EXCL]** — head, light armour (was `uq_pells_hooded_lantern`, a light-slot item): hits from outside an enemy's view (behind or on its flank) have +5% critical hit chance; +10% movement speed for 3 s after you open a chest.

### Main bosses

#### B1 · `b_sexton_morrow` — Sexton Abel Morrow

| Field | Value |
|---|---|
| Body | chibi2 undead ×1.5, leather apron, iron spade |
| Health | 55 H |
| Phases | 100–50% · 50–0% (Grave Dig hits two players at once) |
| Teaches | **danger zone** (red, grows in from the edge — leave before it fills) |
| Enrage | 5:00 (soft Normal, hard Challenge) |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Spade Swing | melee on tank | — | 9 %HP every 2.4 s | — |
| **Grave Dig** | **danger zone**, 5 m circle under a random player (from 50%: two players), fills edge-in | 3.0 s | 45 %HP + knocked down 1.5 s; leaves an open grave (hole, 3 m) for 20 s that you must walk round | walk out of the red |

**Dialog:** pull — "Another one for the ground. Hold still." · Grave Dig ⚠ — "Dig here." / "This one's yours." · 50% (banner) — "Two plots. Same price." · death — "The ground... is... full."
**Challenge:** holes left by Grave Dig are **void zones** (2 %HP every 0.5 s) for 20 s. **Burial**: every 30 s he grabs the tank (1.5 s warn, wind-up with the spade raised) and buries them to the waist — rooted 4 s, a second player must click the tank (hold E 1 s) to dig them out.
**Deep tuning:** Grave Dig marks three players below 25%.
**Depth list** (page 11 §22.2): ① `mech_void_pool` grave mud: 4 m pools, 30 s, 2 %HP / 0.5 s · ② `mech_add_wave` 2 Barrow Shamblers climb from the open graves · ③ `mech_slam_circle` Spade Slam: red 4 m behind the tank, 25 %HP.
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
**Challenge:** **Bone Stitch** (i) 2.5 s cast every 25 s: a **tether** from Ossel to the furthest player; if it completes, that player is pulled 10 m toward her. Interrupt it.
**Deep tuning:** rot pools grow 0.5 m every 10 s.
**Depth list** (page 11 §22.2): ① `mech_tether_break` Stitch Thread between 2 players, break at 15 m · ② `mech_curse_spread` Bone Itch: 2 %HP a second, spreads within 5 m (dispellable) · ③ `mech_add_swarm` 6 bone needles skitter at players (4 %HP each).
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
**Challenge:** **Thane's Due** — at 70% and 35% he takes a **soak** stance: an orange circle with **3 pips** 5 m wide on the floor for 4 s; fewer than 3 players inside and it hits everyone for 50 %HP. Barrow Call cast drops to 2.0 s.
**Deep tuning:** risen shamblers explode on death (2 m, 1.5 s, 12 %HP).
**After the kill:** the stone bier in the hall centre becomes usable (see Secret).
**Depth list** (page 11 §22.2): ① `mech_shockwave_ring` Barrow Cry: a thin ring with one gap, 25 %HP · ② `mech_add_shieldbearer` 2 hearth-men with shields: he takes −50% while they live · ③ `mech_heal_self` Drink from the Horn (i): heals him 10%.
**Loot:** `it_grimbarrow_greataxe` (two-handed axe), `it_hearthmens_scale` (heavy chest), `it_barrow_signet` (ring), `set_barrowwarden` pieces (helm, legs), `uq_thanes_ring_of_rest` **[D-EXCL]** — ring: +5% all damage; killing an enemy heals you 2% of your maximum health. `leg_hollow_crown` **[D-EXCL]** — helm legendary: every 25 s your next damaging spell raises a **Hearth-man** (a barrow shambler ally with 30% of your health, 10 s) at the target.

### Secret boss — `b_first_sleeper` — The First Sleeper

**Unlock (collect + dialog):** place **three grave goods** on the Hollow Thane's bier after he dies:

1. **The Thane's Ring** (`it_thanes_ring`) — only from Pell's bargain ("Give back the ring and go"). Kill her and it is lost.
2. **The Hound's Collar** (`it_hounds_collar`) — dropped by **Grip**, the named Grave Hound in the Bier Stair honour guard (100%).
3. **The Horn Cup** (`it_horn_cup`) — behind a loose skull in the **Ossuary Walk** wall, halfway down, left side. The skull only glints when a player stands within 4 m of it and looks at it for 1 s (the hover highlight).

Hold **E** at the bier with all three in the party's bags. The bier sinks; a stair opens to the **Sleeper's Niche**.
Journal hint (after 3 clears): *"The Thane went into the ground with a ring, a cup and a hound. He came out with none of them."*

| Field | Value |
|---|---|
| Body | chibi2 giant (undead skin) ×1.6, peat-brown shroud, antler crown, stone hammer |
| Health | 140 H |
| Phases | 100–60% · 60–25% · 25–0% |
| Teaches | the **exam**: all four d01 lessons at once, plus a gentle first **soak** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Peat Hammer | all | melee on tank | — | 12 %HP every 2.8 s | — |
| Peat Dig | all | **danger zone** 5 m under 1 player (2 from P2) | 3.0 s | 45 %HP | leave |
| Old Rot | P2+ | 4 m **void zone**, 30 s | 1.8 s | 4 %HP / 0.5 s | move |
| Wake the Barrow (i) | all | 3.0 s cast | 3.0 s | 4 shamblers if not interrupted | interrupt; every 18 s |
| **Sleeper's Breath** | P3 | orange **soak**, 6 m, **2 pips**, placed on the far side of the room | 4.0 s | 40 %HP to everyone if fewer than 2 players inside; split between soakers otherwise (15 %HP each for 2) | two players run in |

**Dialog:** pull (banner) — "You woke the little king. Now you have woken me." · Breath ⚠ — "Breathe with me, or not at all." · 25% — "The valley grew on my back. I only want it back." · death — "Sleep... is kinder... than you."
**Challenge:** Peat Dig leaves holes as void zones; Breath needs 3 pips. **Deep tuning:** Wake the Barrow raises 2 Grave Hounds instead of shamblers.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` 3 peat boulders roll across the niche, 30 %HP · ② `mech_pull_in` Deep Breath In: pull 2 m/s for 3 s · ③ `mech_blight_cloud` peat smoke: a 5 m cloud drifting 2 m/s, 3 %HP / 0.5 s.
**Loot:** `it_antler_crown` (medium helm), `it_sleepers_hammer` (two-handed mace), `uq_peat_black_shroud` **[D-EXCL]** — back: +8% maximum health; standing still for 2 s gives a barrier of 5% maximum health (refreshes every 6 s). **`leg_first_sleepers_shroud` [SECRET] [D-EXCL]** — chest legendary (any armour type, takes the wearer's): when you would die, you instead fall asleep for 3 s at 1 health, immune to damage, then wake with 25% health (once every 3 minutes).

### Set dropped here

`set_barrowwarden` — Barrowwarden's Rest (4 pieces: chest, hands, helm, legs; medium armour; drops from B1, B2, END). Bonus text is page 09's; brief: 2 = +10% damage against undead, 4 = a killing blow on undead heals 4% of max health.

---

## d02 — The Drowned Mill

### Card

| Field | Value |
|---|---|
| id | `d02_drowned_mill` |
| Region | Mossfen (`mossfen`) |
| Levels | 9–12 (opens at 8) · Challenge 60 · Depth 1–46 (level 60 at Depth 16; §2.4) |
| Looks | `flooded` (mill and millrace), `ruin` (drowned stilt village) (reuse) |
| Entrance | **Grist's Mill**, half sunk where the Brackwater Cut meets the open fen, 2 km east of Reedhollow. The great wheel still turns though no water drives it. Walk down the wet stair beside the wheel. |
| Quest giver | `npc_marra_stillwater`, Fenfolk ferrywoman, Reedhollow landing |
| Story quest | `q_the_millers_debt` — "The Miller's Debt": find out why the fen is rising and stop the wheel |
| Run time target | Normal 18 min · Challenge 20 min (no timer; the journal records your best time) |
| Brazier Shrines | Wet Stair (entrance) · after Old Croak · after Wren Grist |
| Rarity slots (§2.9) | **C** Millrace Tunnel (pack 1 or 2) · **C** Flooded Lane (pack 4 or 5) · **R** Flooded Lane (the Millstone Roller of pack 6) · *Challenge:* **C+** Gear Loft (8) · **G** Grain Store (7) · **R+** Millrace Tunnel (the Millstone Roller of pack 3) · **W** the Millrace patrol · *Depth rooms:* Millrace Tunnel, Flooded Lane, Grain Store |
| Main family (page 10) | **fen** · also drowned, beast, folk, construct |
| New lessons | **tether**, **moving wave**, **targeted spread** |

### Story hook

Tobiah Grist dammed the fen to turn his wheel faster and sell flour to Highcourt. The dam broke in a spring
storm and drowned the stilt village of Low Wicket — and his own wife, Wren. The mill sank with them. Now the
wheel turns with no water to drive it, the water in Reedhollow rises an inch a week, and the Fenfolk say something in the
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
| Wet Stair | 12×10 | S1 |
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
| `m_fen_bog_slime` | Bog Slime | creature slime ×1.3, peat brown | 1.5 | **Engulf** melee 6 %HP + slow 20% 3 s. At 50% **splits** into 2 Slimelings (0.4 H each). |
| `m_folk_fen_poacher` | Fen Poacher | chibi2 human, reed hat, crossbow | 1 | **Net Shot**: yellow **targeted** 3 m circle on a player, 2.0 s, roots everyone inside 2 s. Spread. |
| `m_fen_marsh_lure` | Marsh Lure | creature wisp ×1.0, sickly green-white | 0.6 | **Will-o'-Lure** (i) 2.0 s: charms one player to walk toward the lure for 2.5 s (off ledges into water). Interrupt. |
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

**Dialog:** — (gurgling). **Challenge:** Brood Latch is 5 leeches. **Deep tuning:** leeches not removed in 6 s burrow in and become a 4 %HP-a-second poison (dispellable, page 05).
**Depth list** (page 11 §22.2): ① `mech_void_pool` leech slime 4 m, 30 s · ② `mech_fixate_chase` a Fen Leech fixates the healer · ③ `mech_add_swarm` 6 Fen Leeches.
**Loot:** `it_leechhide_gloves` (light hands), `it_matron_fang` (dagger), `uq_bloodgorged_band` **[D-EXCL]** — ring: 2% of your damage heals you; doubled while you are below 40% health.

#### s2 · `b_old_pike_sluicewarden` — Old Pike, the Sluicewarden

Body: chibi2 undead human ×1.3, lockkeeper's coat, 3 m iron-shod pole. Health 26 H. Lock House. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Pole Sweep | 180° **danger zone** cone, 5 m, in front | 1.8 s | 20 %HP + knockback 4 m | stay behind or beside him |
| **Open the Sluice** | **moving wave**: a 2 m-thick red wall of water crosses the room from the north wall at 5 m/s; one 4 m **gap** (blue edge) in it | 2.0 s (lever thrown, water hisses) | 25 %HP + knocked 6 m | stand in the gap's lane as it passes; or dodge-roll through the wall (a roll's immunity frames cover it) |

**Dialog:** pull — "Lock's shut. Nobody through without a toll." · Sluice ⚠ — "Mind the water!" · death — "Should've... opened it... that spring."
**Challenge:** two waves, the second from the east wall 2 s after the first. **Deep tuning:** the gap moves 2 m sideways as the wave travels.
**Depth list** (page 11 §22.2): ① `mech_charge_line` Pole Vault: a 16 m line, 25 %HP · ② `mech_undertow_pool` the sluice drain: 6 m pull for 10 s · ③ `mech_knockback_nova` Pole Spin: 8 m knockback, 15 %HP.
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
**Challenge:** a swallowed player takes the damage and Croak **heals 5%** unless the group deals 3% of her health while the player is inside (her belly glows). **Deep tuning:** Tongue picks two players.
**Depth list** (page 11 §22.2): ① `mech_undertow_pool` a whirl in the pond, 6 m · ② `mech_add_swarm` 6 froglets (0.3 H) · ③ `mech_hurl_player` Tongue Fling: a player is thrown 12 m, 15 %HP.
**Loot:** `it_croakskin_boots` (light feet), `it_heron_bill_spear` (spear), `set_fenwader` piece (legs), `uq_wider_than_running` **[D-EXCL]** — belt: +8% movement speed; after you break a tether or leave a danger zone, +15% more for 3 s.

#### B2 · `b_wren_grist` — Wren Grist, the Miller's Wife

| Field | Value |
|---|---|
| Body | chibi2 human ×1.4 with a **drowned** ghost look (translucent blue-green, hair floating as if underwater — new material flag `ghost_water`, §22), a sodden shawl |
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
**Challenge:** Drowning Grief marks 3 players; Weeping Tide leaves a 1 m **void zone** ring where it stopped at the wall for 10 s. **Deep tuning:** the pews sink after two uses each.
**Depth list** (page 11 §22.2): ① `mech_tether_keep` Hold My Hand: two players stay within 8 m for 10 s · ② `mech_void_growing` a spreading pool of cold water · ③ `mech_silence_pulse` Hush: no spells for 3 s.
**Loot:** `it_sodden_shawl` (back), `it_wicket_prayer_beads` (neck), `set_fenwader` piece (chest), `uq_wrens_wedding_ring` **[D-EXCL]** — ring: when an ally within 20 m drops below 35% health, you both gain a barrier of 8% of your maximum health (30 s cooldown).

#### END · `b_the_grindwheel` — The Grindwheel

| Field | Value |
|---|---|
| Body | creature golem ×3.2 in the mill's own machinery: a millstone for a chest, gear-wheel shoulders, sack-cloth over iron (new feature flag `millstone_core`, §22) |
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

**Dialog:** (the Grindwheel has no voice; the **millpond** speaks — a wet whisper, voice timbre `drowned` §22) pull — "Grist owes. The wheel collects." · Grind ⚠ — "Into the stones." · 50% (banner) — "Open the sluice. Let the fen pay." · death — "The debt... is not paid..."
**Challenge:** Belt Chains ties 2 pairs and chains the fifth player to the boss (that one must stay within 6 m of it or take 6 %HP a second); Grind pull 4 m/s. **Deep tuning:** Flour Burst clouds stay as 4 m **void zones** for 15 s.
**Depth list** (page 11 §22.2): ① `mech_rotating_beam` a belt-arm sweeping 25 m × 2 m at 30°/s · ② `mech_rolling_boulders` 3 millstones roll (3 m lanes), 30 %HP · ③ `mech_spark_runner` gear sparks running along the floor.
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
**Challenge:** Collect marks 3; Drowned Coins needs 3 pips each (tank must soak one). **Deep tuning:** Undertow twice, 2 s apart.
**Depth list** (page 11 §22.2): ① `mech_mark_of_prey` Owed: the target takes +25% from it for 10 s · ② `mech_add_swarm` 6 coin crabs · ③ `mech_purge_buffs` Collect Interest: removes one buff from everyone.
**Loot:** `it_coin_hung_girdle` (medium waist), `it_ninefold_eye` (off-hand orb), `uq_silt_lords_tithe` **[D-EXCL]** — ring: 5% of gold you pick up is kept as **Tithe** (max 500); spend it with a click to heal to full out of combat. **`leg_ledger_of_the_deep` [SECRET] [D-EXCL]** — neck legendary: each time an enemy hits you, it gains a **Debt**; at 5 Debts your next hit on it deals +200% damage and clears them.

### Set dropped here

`set_fenwader` — Fenwader's Tack (4 pieces: legs, chest, helm, feet; light armour). Brief: 2 = +20% movement in water and mud, 4 = breaking a tether or leaving a void zone gives +10% damage for 5 s.

---

## d03 — Shaft Seven Mines

### Card

| Field | Value |
|---|---|
| id | `d03_shaft_seven` (was `d03_deepdelve`; "delve" is banned) |
| Region | Greyridge Highlands (`greyridge`) |
| Levels | 13–16 (opens at 12) · Challenge 60 · Depth 1–45 (level 60 at Depth 15; §2.4) |
| Looks | `mine` (new: timber props, rails, hook lanterns and **glowing ore seams** — §22), `cave` (deep seam, lit by blue cave-fungus) |
| Entrance | **Shaft Seven headframe** on the Greyridge quarry terraces (`sz_shaft_seven_slopes`, page 01), 3 km north of Anvilgate. A cage lift goes down; the lift is the loading door. |
| Quest giver | `npc_foreman_dagna_coalbright`, Deepforge Clans mine foreman, Anvilgate's Lift Square |
| Story quest | `q_the_seventh_shaft` — "The Seventh Shaft": drive out the Sootwick Gang and find the four miners still down there |
| Run time target | Normal 20 min · Challenge 22 min (no timer; the journal records your best time) |
| Brazier Shrines | Lift Foot · after Nix Candlejaw · after Warden Seven |
| Rarity slots (§2.9) | **C** Sootwick Camp (pack 3 or 5) · **C** Collapse Gallery (pack 8 or 9) · **R** Cart Junction (the Brute of pack 6) · *Challenge:* **C+** Rail Tunnel (pack 1) · **R+** Sootwick Camp (the Brute of pack 4) · **G** Worm Hollow (10) · **W** Rail Tunnel (pack 2) · *Depth rooms:* Rail Tunnel, Sootwick Camp, Collapse Gallery. Lug and Mugg never roll. |
| Main family (page 10) | **goblin** · also beast |
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
| Lift Foot | 12×12 | S1, a mine cart that rides the Rail Tunnel (optional fast way back after a wipe) |
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
| `m_construct_firedamp` | Firedamp Pocket | creature wisp ×1.2, dull orange, does not move | 0.5 | harmless until hit by **fire**: then after 1.5 s it bursts in a 6 m circle for 35 %HP to **players and enemies**. Lure goblins next to it. |
| `m_beast_gravelmaw_grub` | Gravelmaw Grub | creature worm ×0.7, grey | 0.4 | **Gnaw** 3 %HP; comes in fours; Stonegullet's young. |

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
**Challenge:** a new digger joins every 25 s. **Deep tuning:** Whip Crack also pulls the target 4 m toward him.
**Depth list** (page 11 §22.2): ① `mech_spread_mark` Ledger Mark: yellow 5 m on 2 players, 20 %HP · ② `mech_charge_line` Foreman's Rush: an 18 m line, 25 %HP · ③ `mech_add_bombers` 2 Sootwick bombers run at the group.
**Loot:** `it_foremans_bowler` (light helm), `it_tally_whip` (whip, one-handed), `uq_grubniks_ledger` **[D-EXCL]** — off-hand focus: each time an ally you buffed lands a critical hit, you gain 1% haste (max 10%, 8 s).

#### s2 · `b_rattlejaw` — Rattlejaw

Body: creature beetle ×3.4, iron-grey shell with ore glinting in the seams. Health 26 H. Beetle Drift (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Mandibles | melee on tank | — | 10 %HP | — |
| **Burrow** | vanishes, then a red **danger zone** 5 m grows under a random player | 3.0 s | 40 %HP + knock-up 1.5 s | leave the red; it erupts there |
| Shell Charge | red line 3 m × 20 m | 2.0 s | 25 %HP + knockback | step aside |

**Challenge:** Burrow chains twice. **Deep tuning:** each eruption leaves 3 grubs.
**Depth list** (page 11 §22.2): ① `mech_ground_spikes` a tunnel ridge grows toward a player, 25 %HP · ② `mech_add_swarm` 6 Gravelmaw Grubs · ③ `mech_launch` Upheaval: red 4 m, knock-up, 20 %HP.
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

**Dialog opportunity — "The toll"** (on the first approach, Nix calls from a keg pile before the pull; the party votes, a tie goes to the leader — page 11):

| Reply | Result |
|---|---|
| "Here's your toll." (30 gold from the party leader) | Lug and Mugg pocket the gold and **walk off**. Nix fights alone. Loot unchanged. |
| "Your candles are coming out." | normal fight with both bodyguards. |
| *(Rogue, Swashbuckler or Scavenger only)* "Cut me in on the dwarf vault and I'll cut you in." | Lug and Mugg turn on Nix for the first 30 s (they deal 10% of his health), then leave. Journal records a class line. |

**Dialog:** pull — "Candles lit, lads! Light 'em up!" · Powder Keg ⚠ — "Hug the barrel, heroes! Go on!" · Kegfall ⚠ (banner) — "ALL of 'em!" · death — "Who... blew out... my candles..."
**Challenge:** Powder Keg needs 4 pips; Candle Bomb on 2 players. **Deep tuning:** a missed keg leaves a 6 m burning **void zone** for 20 s.
**Depth list** (page 11 §22.2): ① `mech_add_bombers` 2 Sootwick bombers run at the group · ② `mech_trail_fire` a lit fuse trail behind each rolling keg · ③ `mech_meteor_rain` Candle Hail: 6 red circles 3 m, 15 %HP.
**Loot:** `it_candlejaw_blunderbuss` (ranged, gun-type — page 08 check), `it_wax_crusted_helm` (medium helm), `set_deepshaft_harness` piece (chest), `uq_ringleaders_candles` **[D-EXCL]** — helm: your area spells leave a 2 m burning patch for 3 s (6% of the spell's damage per second).

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
**Challenge:** Seismic Pulse leaves the pillar that shielded the most players cracked (it breaks at the next Pulse). **Deep tuning:** Drill Charge twice in a row, each with its own 2.0 s warning.
**Depth list** (page 11 §22.2): ① `mech_ground_spikes` Drill Line toward a player, 25 %HP · ② `mech_rotating_beam` the clan rune's beam sweeps 25 m at 30°/s · ③ `mech_knockback_nova` Piston Burst: 8 m, 15 %HP + knockback.
**Loot:** `it_warden_drill_bit` (two-handed spear), `it_runebound_greaves` (heavy legs), `set_deepshaft_harness` piece (shoulders), `uq_seventh_shift_rune` **[D-EXCL]** — neck: when you break line of sight to an enemy casting at you, you gain a barrier of 6% of your maximum health (10 s cooldown).

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

**Dialog:** none (a worm). The miners, if freed, shout from the Lift Foot over party chat: "Blow the pump horn! It hates the horn!" (the **pump horn** by the Gullet door: any player holds **E** 1 s once per fight; for 20 s Gravel Spew's slow drops to 15%).
**Challenge:** soaks need 3 pips; Breach targets two holes. **Deep tuning:** a soak that is fully soaked still leaves a 3 m **void zone** of gravel for 20 s.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` 3 ore boulders, 30 %HP · ② `mech_pull_in` Gullet Draw: pull 2 m/s for 3 s · ③ `mech_meteor_rain` cave-in stones in P1 as well.
**Loot:** `it_gullet_tooth_hammer` (two-handed mace), `it_orebelly_girdle` (heavy waist), `it_deep_seam_ring` (ring), `set_deepshaft_harness` pieces (helm, legs), `soul_stonegullets_gizzard` **[D-EXCL]** — soul (armour socket: chest; was the trinket `uq_stonegullets_gizzard_stone`): when a hit takes you below 35% health you swallow the stone: −40% damage taken and immune to knockback for 4 s (90 s cooldown). `leg_worm_king_mandible` **[D-EXCL]** — weapon legendary (two-handed axe or mace, takes the looter's preferred type): your heavy attacks bore into the ground and erupt under the target 1 s later for 60% weapon damage in a 3 m circle.

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
**Challenge:** Vein Burst leaves the arms as void zones for 6 s. **Deep tuning:** Mother Lode's circle shrinks from 5 m to 4 m.
**Depth list** (page 11 §22.2): ① `mech_chain_lightning` Ore Spark: marks 3, jumps within 8 m, 20 %HP a jump · ② `mech_weak_point` the crystal heart opens: +50% damage there, 10 s · ③ `mech_rolling_boulders` 3 ore boulders.
**Loot:** `it_crystal_heart_shard` (off-hand orb), `it_ore_veined_gauntlets` (heavy hands), `uq_goldvein_signet` **[D-EXCL]** — ring: +10% gold found; your critical hits have a 5% chance to drop a shard worth 5–30 gold. **`leg_heart_of_the_unmined` [SECRET] [D-EXCL]** — chest legendary: every 10 s standing still in combat grows a stone skin: −5% damage taken per stack (max 4); moving 5 m clears it.

### Set dropped here

`set_deepshaft_harness` — Deepshaft Harness (4 pieces: chest, shoulders, helm, legs; heavy armour). Brief: 2 = +15% resistance to knockback distance, 4 = while you stand in a soak you take 20% less damage from it.

---

## d04 — Bellows Keep

### Card

| Field | Value |
|---|---|
| id | `d04_bellows_keep` |
| Region | Greyridge Highlands (`greyridge`) |
| Levels | 16–18 (opens at 15) · Challenge 60 · Depth 1–44 (level 60 at Depth 14; §2.4) |
| Looks | `cinderworks` (reuse) for the foundry, `crypt` for the keep's old halls |
| Entrance | **Bellows Keep gate**, cut into the cliff above the Kilnwater gorge 5 km east of Anvilgate, reached over a chain bridge. The gate stands open, war-banners of the Ashtusk Warhost hung over the clan runes. |
| Quest giver | `npc_thane_orla_bellamund`, exiled keep-thane, at the Anvilgate Moot Hall |
| Story quest | `q_the_bellows_breathe` — "The Bellows Breathe": retake the keep and put out the fire the orcs have chained in the Great Bellows |
| Run time target | Normal 22 min · Challenge 24 min (no timer; the journal records your best time) |
| Brazier Shrines | Gatehouse · after Forgemaster Ghorza · after the Great Bellows |
| Rarity slots (§2.9) | **C** Barracks Court (pack 1 or 2) · **C** Rampart Walk (pack 8) · **R** Anvil Gallery (the Anvil Sentinel of pack 4 or the Whipmaster of pack 5) · *Challenge:* **C+** Smiths' Pens (6) · **R+** Rampart Walk (a Forgebrute of pack 9) · **G** Quench Hall (7) · **W** Barracks Court (pack 3) · *Depth rooms:* Barracks Court, Anvil Gallery, Rampart Walk |
| Main family (page 10) | **orc** · also beast, demon, construct |
| New lessons | **tank handoff** (a stacking debuff on the tank, cleared by handing the boss over or by a room object), **room-wide hit with safe zones** |

### Story hook

Bellows Keep was the Deepforge Clans' great foundry: a fortress built around a furnace so hot it was fed by
a bound fire spirit breathing through a set of iron bellows the size of a house. The **Ashtusk Warhost** took it
in a single day, and their warchief, Grumvak Kilnbreaker, has the dwarves' own smiths in chains forging orc
steel. Thane Orla Bellamund wants her keep back — and the smiths out alive.

> **Decided (round 2):** the Ashtusk Warhost's band is **26–40** (page 10 §9.5) and this dungeon is 16–18. The keep is held
> by the Warhost's **vanguard** — raiders the Kingsfire Legion drove south years ahead of the main host (page 01's Ch 7 beat:
> "the orcs were driven south by the Legion"). Their bodies and names are the Warhost's, scaled to the dungeon's band. Page 10
> should list this vanguard as the one exception to the band.

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
| Gatehouse | 16×12 | S1; the **Heat Gauge** (a brass dial by the door; see Secret) |
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
| `m_orc_ashtusk_cutthroat` | Ashtusk Cutthroat | chibi2 orc, hide armour, two axes | 1 | **Double Chop** 2 × 5 %HP. **Howl**: +15% attack speed to orcs within 10 m, 8 s. |
| `m_orc_ashtusk_spearman` | Ashtusk Spearman | chibi2 orc, long spear, round shield | 1.2 | **Impale**: red line 2 m × 7 m, 1.5 s, 14 %HP + bleed 1 %HP a second 6 s. |
| `m_orc_ashtusk_bonecaller` | Ashtusk Bonecaller | chibi2 orc, bone mask, rattle staff | 0.9 | **Mend Flesh** (i) 2.5 s: heals an orc 35%. **Bone Hex**: 3 m **void zone** of bone splinters under a player, 10 s, 3 %HP / 0.5 s. |
| `m_orc_ashtusk_forgebrute` | Ashtusk Forgebrute (elite) | chibi2 orc ×1.8, smith's apron, sledge | 3.5 | **Hot Iron**: stacks **Seared** on its target (+8% fire damage taken, 12 s, max 5). **Sledge Slam**: 5 m red circle around itself, 2.0 s, 25 %HP. |
| `m_beast_forge_hound` | Forge Hound | creature hound ×1.4, cinder-coated | 1 | **Cinder Bite** 6 %HP + burn 1 %HP a second 4 s. On death, 2 m fire patch 4 s. |
| `m_demon_slag_imp` | Slag Imp | creature imp ×1.0, dripping molten | 0.5 | **Slag Spit** 5 %HP at 20 m. Comes in threes. |
| `m_kingsfire_cinder_spawn` | Cinder Spawn | creature elemental ×0.8, fire | 0.8 | **Flare**: 1.5 s, 4 m circle around itself, 12 %HP. Grows +20% size and damage every 10 s alive. |
| `m_construct_anvil_sentinel` | Anvil Sentinel (elite) | creature golem ×2.0, anvil-headed dwarf construct in orc chains | 3 | **Anvil Drop**: yellow **targeted** 4 m on a player, 2.5 s, 30 %HP. **Chained**: breaks free at 50% and gains +30% damage. |
| `m_orc_ashtusk_whipmaster` | Ashtusk Whipmaster | chibi2 orc, whip, keys on belt | 1 | **Lash** 60° cone 7 m, 1.5 s, 10 %HP. Drops a **Pen Key** (frees one smith instantly, no channel). |

| # | Room | Pack |
|---|---|---|
| 1 | Barracks Court, bunks | 3 Cutthroats + 1 Bonecaller |
| 2 | Barracks Court, drill yard | 2 Spearmen + 2 Cutthroats + 3 Forge Hounds |
| 3 | Barracks Court, armoury door | 1 Forgebrute + 1 Bonecaller |
| 4 | Anvil Gallery, near | 1 Anvil Sentinel + 3 Slag Imps; 2 chained smiths |
| 5 | Anvil Gallery, far | 2 Spearmen + 1 Whipmaster + 1 Bonecaller |
| 6 | Smiths' Pens | 2 Whipmasters + 2 Cutthroats |
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
**Challenge:** both abilities on independent timers (overlap). **Deep tuning:** at 30% the shared bar splits into two bars for the rest of the fight; kill both within 10 s of each other or the survivor heals back to 30% and gains +25% damage.
**Depth list** (page 11 §22.2): ① `mech_hurl_player` Grukk throws a held player 12 m · ② `mech_slam_circle` Anvil Drop: red 4 m, 30 %HP · ③ `mech_tether_share` Chained Pair: two players share damage for 10 s.
**Loot:** `it_tongsmans_apron` (medium chest), `it_zaggas_hammer` (one-handed mace), `uq_matched_tongs` **[D-EXCL]** — gloves: when you and a party member hit the same target within 1 s, both hits deal +8%.

#### s2 · `b_slagmaw` — Slagmaw

Body: creature elemental ×2.6, molten slag with a crust (orange/black palette). Health 28 H. Slag Pools (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Molten Fist | melee | — | 12 %HP + burn | — |
| Slag Wave | **moving wave** outward from the pools, ring, 5 m/s | 2.0 s | 25 %HP | roll through |
| Crust Over | at 66% and 33%: armour +80% for 10 s | 1.5 s | — | a **cold** or **water** spell (ice/frost element) or dragging it into a pool's cool edge (a **beneficial** blue-green ring) breaks the crust |

**Depth list** (page 11 §22.2): ① `mech_void_growing` a spreading slag pool · ② `mech_spark_runner` molten sparks · ③ `mech_eruption_pillars` slag bubbles under every player, 3 m, 20 %HP.
**Loot:** `it_slag_crust_greaves` (heavy legs), `it_quenched_blade` (sword), `soul_slag_heart` **[D-EXCL]** — soul (weapon socket; was the trinket `uq_slag_heart_ember`): your hits tagged Fire have a 10% chance to leave a 2 m slag pool for 4 s (8% of the hit per second).

### Main bosses

#### B1 · `b_forgemaster_ghorza` — Forgemaster Ghorza

| Field | Value |
|---|---|
| Body | chibi2 orc ×1.9, female, leather smith's apron over chain, a glowing branding iron and a war hammer |
| Health | 68 H |
| Phases | 100–50% · 50–0% (heats the whole floor: the quench troughs start to steam and only give 1 use each) |
| Teaches | **tank handoff** (stacking debuff on the tank) |
| Enrage | 6:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Hammer | all | melee on tank | — | 12 %HP | — |
| **Searing Brand** | all | applied to her current target with every 3rd swing; a red brand icon stacks on the tank's frame | — | +15% fire damage taken per stack, 25 s, max 8 | at **4 stacks**: on Normal, the tank steps into a **quench trough** (green **beneficial** 3 m circle) for 1.5 s to clear all stacks while a second player (any class with a taunt, or a follower tank) holds her 5 s; on Challenge the troughs are gone and a **real tank handoff** is needed (§2.11) |
| **Slag Pour** | all | yellow **targeted** 4 m on 2 non-tanks | 2.5 s | 20 %HP; leaves a 4 m **void zone** of slag for 30 s (4 %HP / 0.5 s) | drop them at the room edge |
| Quench Steam | P2 | each trough used puffs a 6 m steam cloud for 4 s | — | blinds everyone inside 2 s | use the trough, then walk out |

**Dialog:** pull — "Fresh ore! Get 'em on the anvil!" · Brand ⚠ — "Hold still. It only hurts forever." · 50% (banner) — "Stoke it hotter!" · death — "The steel... wasn't ready..."
**Challenge:** Brand max 10, no troughs, handoff at 3–4; Slag Pour on 3 players. **Deep tuning:** her target at 6+ stacks takes a **Branded Blast**: 8 m red circle around the tank, 2.0 s, 40 %HP to everyone near.
**Depth list** (page 11 §22.2): ① `mech_drop_puddle` Hot Drip: a marked non-tank drops 3 m slag every 3 s for 12 s · ② `mech_add_wave` 2 Ashtusk Cutthroats · ③ `mech_charge_line` Forge Rush: an 18 m line, 25 %HP.
**Loot:** `it_ghorzas_branding_iron` (one-handed mace), `it_forgemasters_apron` (medium chest), `set_kilnbreaker_iron` piece (hands), `uq_orc_steel_pauldrons` **[D-EXCL]** — heavy shoulders: taunting an enemy gives you −15% damage taken from it for 6 s.

#### B2 · `b_the_great_bellows` — The Great Bellows (and Imbrasa, the chained flame)

| Field | Value |
|---|---|
| Body | a stationary construct: the bellows fill the north wall (new prop `great_bellows`, §22); the **target** is **Imbrasa**, a creature elemental ×3.2 (fire) chained in the bellows' mouth |
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
**Challenge:** only **one** safe zone per Blast from phase 2, 5 m wide (the whole group packs in). **Deep tuning:** Spark Rain follows players (circles appear where they stood 1 s ago).
**Depth list** (page 11 §22.2): ① `mech_wind_push` Bellows Gust: the room is pushed 6 m toward the south wall · ② `mech_void_line_wall` a firewall 16 m × 2 m for 10 s · ③ `mech_spark_runner` sparks from the chains.
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
| Kilnaxe | all | melee on tank; applies **Cleft Armour** (−8% armour per stack, 20 s, max 6) | — | 14 %HP | tank handoff on Challenge at 4; on Normal a follower tank or a Damage player with a taunt takes 5 s |
| Whirling Axe | all | 8 m red circle around him | 2.5 s | 35 %HP | everyone but the tank out; the tank takes it with a cooldown (or leaves too) |
| **Anvil Rain** | P2+ | 4 yellow **targeted** 4 m circles (3 if all smiths freed) | 3.0 s | 40 %HP each | spread across the room |
| **Kiln Blast** (u) | P2+ | room-wide; blue **safe zones** under the 2 quench cisterns | 4.0 s | 110 %HP | cisterns |
| War Horn | P3 | 3 Ashtusk Cutthroats + 1 Bonecaller run in | 1.5 s | — | Bonecaller first (interrupt Mend Flesh) |

**Dialog:** pull (banner) — "The stunties built it. We FEED it." · Anvil Rain ⚠ — "Catch!" · Kiln Blast ⚠ (banner) — "Open the kiln!" · 30% (banner) — "Ashtusk! To me!" · death — "The Warhost... remembers... this keep..."
**Challenge:** Kiln Blast's safe zones shrink from 5 m to 3 m over the cast. **Deep tuning:** Whirling Axe moves toward the healer at 2 m/s.
**Depth list** (page 11 §22.2): ① `mech_charge_line` Warchief's Charge: 20 m, 30 %HP · ② `mech_add_shieldbearer` 2 shield-bearers: −50% damage to him while they live · ③ `mech_mark_of_prey` Kilnbreaker's Mark.
**Loot:** `it_kilnbreaker_greataxe` (two-handed axe), `it_ashtusk_war_banner` (back), `it_dwarf_gold_tuskcaps` (neck), `set_kilnbreaker_iron` pieces (helm, legs), `uq_throne_of_the_keep_signet` **[D-EXCL]** — ring: +6% damage to enemies stronger than you (elite, boss). `leg_kilnbreakers_oath` **[D-EXCL]** — two-handed axe legendary: every 4th hit on the same target applies **Cleft** (−5% armour, max 5); at 5, your next hit deals +150% and clears it.

### Secret boss — `b_bellamund_the_cold_smith` — Harrow Bellamund, the Cold Smith

**Unlock (time limit):** the **Heat Gauge** by the Gatehouse starts when the party first pulls anything in the Barracks
Court. Kill **the Great Bellows within 12:00** of that pull (Challenge: 10:00). The furnace never reaches
full heat; after Grumvak dies, the Throne's back wall is cold enough to walk through (it frosts over) into the
Cold Forge, where the keep's founder has been waiting, bound as a warden spirit. The gauge shows the time on
the party frame.
Journal hint: *"The keep runs hotter every minute you spend in it. The old thane did his best work cold."*

| Field | Value |
|---|---|
| Body | chibi2 dwarf ×1.9, a ghost of frost-blue light (material `ghost_frost`, §22), smith's hammer and tongs |
| Health | 155 H |
| Phases | 100–60% · 60–25% · 25–0% ("The last strike") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Cold Hammer | all | melee on tank; stacks **Brittle** (+10% physical damage taken, max 6) | — | 13 %HP | tank handoff at 4 (Challenge); a frost-bench **beneficial** zone clears stacks on Normal |
| Quench | all | 3 red lines 3 m × 26 m (anvil to wall) in a fan | 2.5 s | 35 %HP + slow | between the lines |
| Tempering (u) | all | room-wide cold; **blue safe zones** at the 2 forges he did **not** stand at last | 4.0 s | 110 %HP | read which forges |
| Hammer-and-Anvil | P2+ | orange **soak** 4 m, **3 pips** at the great anvil | 4.0 s | 90 %HP to all if short | three players |
| The Last Strike | P3 | 1 player tethered (white) to the anvil; must stay within 6 m or the tether snaps and **he** takes 10% of his health | 2.5 s | 3 %HP a second while tethered | this tether you **keep** until 10 s pass — breaking it early heals nobody; keeping it gives the party +15% damage (the old thane's approval) |

**Dialog opportunity — "The Thane's test"** (on pull he asks): "Who holds the keep now?" · "Thane Orla Bellamund." → he fights at −10% health ("She took it back. Good."). · "We do." → normal. · "The orcs." → +10% health.
**Dialog:** Tempering ⚠ (banner) — "Iron learns from cold." · death — "Tell Orla... the keep is hers. The fire, too."
**Depth list** (page 11 §22.2): ① `mech_encase_mark` Cold Iron: yellow 3 m, encased 2 s · ② `mech_rotating_cross` a turning quench cross, 30 %HP · ③ `mech_slam_circle` Anvil Blow: red 4 m, 30 %HP.
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
| Levels | 19–22 (opens at 18) · Challenge 60 · Depth 1–43 (level 60 at Depth 13; §2.4) |
| Looks | `glass_tomb` (new: sand-gold floor, walls of smoky fused glass, sun-shafts from roof slots — §22), `crypt` |
| Entrance | the **Glass Field**, 4 km south-west of the Oasis of Tamar, where old lightning fused the dunes; a doorway of green glass in the flank of Kings' Mesa |
| Quest giver | `npc_lightkeeper_oren_sael`, Sandsworn keeper of the Tamar sun-lamps |
| Story quest | `q_the_unshattered_king` — "The Unshattered King": close the tombs the Dunecutters cracked, before the Glass Kings walk into Tamar |
| Run time target | Normal 24 min · Challenge 25 min (no timer; the journal records your best time) |
| Brazier Shrines | Outer Seal · after the Glassblower · after Queen Ammarel |
| Rarity slots (§2.9) | **C** Hall of Attendants (pack 1 or 2) · **C** Embalmers' Walk (pack 7) · **R** Robbers' Gallery (a Cutthroat or Sandcaller of pack 5 or 6) · **G** Antechamber (4) · *Challenge:* **C+** Robbers' Gallery (the pack that did not get the rare) · **R+** Embalmers' Walk (the Glass Sentinel of pack 8) · **W** Hall of Attendants (pack 3) · *Depth rooms:* Hall of Attendants, Robbers' Gallery, Embalmers' Walk |
| Main family (page 10) | **undead** · also sand, construct, folk, beast |
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
| Outer Seal | 14×14 | S1, the cracked seal |
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
| `m_sand_prism_shard` | Prism Shard | creature shard ×1.3, clear with rainbow edges | 0.6 | **Prism Beam**: thin red line 1 m × 18 m, 1.5 s, 12 %HP. |
| `m_beast_dune_scarab` | Dune Scarab | creature beetle ×0.8, gold | 0.3 | swarms of 8; **Nibble** 2 %HP. |
| `m_beast_glasstail_skitterer` | Glasstail Skitterer | creature spider ×1.3, sand colour, glass-tipped tail (new feature `stinger`, §22) | 1 | **Sting** 8 %HP + poison 1.5 %HP a second 6 s (dispellable). |
| `m_folk_dunecutter_cutthroat` | Dunecutter Cutthroat | chibi2 human, desert wraps, curved knives | 1 | **Blind Sand**: 5 m cone, 1.5 s, blind 2 s; **Backstab** +100% from behind. |
| `m_folk_dunecutter_sandcaller` | Dunecutter Sandcaller | chibi2 human, face-wrap, staff | 0.9 | **Sand Lash** 30° cone 10 m, 1.5 s, 12 %HP; **Grit Storm** 5 m **void zone** 12 s, 3 %HP / 0.5 s. |
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

**Depth list** (page 11 §22.2): ① `mech_add_swarm` 8 Dune Scarabs · ② `mech_void_pool` gilt resin 4 m, slows 30% · ③ `mech_spread_mark` Sting: yellow 5 m on 2, 20 %HP.
**Loot:** `it_gilded_chitin_vest` (light chest), `it_scarab_clasp` (neck), `soul_brood_mothers_gilt` **[D-EXCL]** — soul (any armour socket; was the trinket `uq_brood_mothers_gilt`): +8% damage against enemies with a damage-reflect aura; you take no reflected damage for 3 s after a dodge roll.

#### s2 · `b_saffa_knifewind` — Saffa Knifewind, Dunecutter Chief

Body: chibi2 human (woman) ×1.4, red desert wraps, a pair of hooked knives and a bandolier of smoke pots. Health 28 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Hooked Knives | melee, applies bleed 1 %HP a second 6 s | — | 9 %HP | — |
| **Knife Fan** | 5 red lines 1 m × 16 m in a 90° fan | 1.8 s | 18 %HP each | stand between lines or behind her |
| Smoke Pot | 6 m grey cloud, she vanishes 3 s and reappears behind a random player | 1.5 s | next hit +100% | face-check: the healer keeps the marked player topped |
| Tripwire | 3 red **lines** 1 m × 10 m placed as traps, last 30 s, trigger when crossed | 1.5 s | 20 %HP + root 2 s | step over them only with a dodge roll |

**Dialog opportunity — "Share the loot"** (at 25%): "Half the tomb's gold is yours if you walk away!" · "Deal." → she runs, dropping `it_dunecutter_share` (a bag worth 60 gold per player) and **no** gear. · "No." → fight on.
**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Knife Pin: a 25 m line, root 1 s · ② `mech_swap_places` Sleight: two players swap places · ③ `mech_mark_of_prey` Marked for the Knife.
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
**Challenge:** mirrors are 1.2 H; the beam lasts 12 s. **Deep tuning:** Molten Gob pools cool into glass mirrors after 20 s (more bounces).
**Depth list** (page 11 §22.2): ① `mech_rotating_beam` a second sun-slot beam rotates 30°/s · ② `mech_spread_mark` Hot Glass: yellow 5 m on 2, 20 %HP · ③ `mech_slam_circle` Pipe Slam: red 4 m, 25 %HP.
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
**Challenge:** Court Dance's safe tiles shrink by one (an unlit tile also goes red at random). **Deep tuning:** the floor flips twice (a third set lights 2 s after the second, each with its full warning).
**Depth list** (page 11 §22.2): ① `mech_gaze` Look at Me: turn away or be dazed 3 s · ② `mech_swap_places` Change Partners: two players swap mid-dance · ③ `mech_spark_runner` glass beads skitter on the tiles.
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
**Challenge:** Royal Cross's cross rotates 45° 1 s before landing (shown).
**Challenge (from r01 *The Ninth Heir*, "Unnamed"):** **Erased from the Glass** — every 25 s one non-tank player's name fades from the party frame (1.5 s warning: the name flickers and a 4 m green ring draws round them); for **5 s** they **cannot be healed** and take 2 %HP a second. While **any other player** stands inside the green ring, the erased player can be healed and takes 30% less damage. Counterplay: a named buddy steps in (never the tank); do not let it land on a player who is also on a Tile Decree edge. (The raid version erased two players for 6 s and needed a third to cover; for five it is one player, one helper.)
**Deep tuning:** Shard Guards reflect beams (they are mirrors too).
**Depth list** (page 11 §22.2): ① `mech_charge_line` King's Stride: a 20 m line, 30 %HP · ② `mech_shockwave_ring` Glass Ring with one gap, 25 %HP · ③ `mech_mark_of_prey` Royal Displeasure.
**Loot:** `it_glass_greatsword` (two-handed sword), `it_sunplate_pauldrons` (heavy shoulders), `it_kings_sun_disc` (neck), `set_sunglass_regalia` pieces (chest, legs), `uq_unshattered_gauntlets` **[D-EXCL]** — heavy hands (was `uq_unshattered_vambraces`, wrists): when an enemy hit would take more than 30% of your health, it takes 10% less (5 s cooldown). `leg_the_eleventh_century` **[D-EXCL]** — off-hand (focus or shield) legendary: every 12 s your next beam-, line- or cone-shaped spell bounces once off an invisible mirror at the end of its range and travels back.

### Secret boss — `b_ithar_the_unseen` — Prince Ithar, the Unseen

**Unlock (hidden puzzle):** in the **Hall of Mirrors**, the roof slot throws a beam onto the floor. Turn the 4 mirror stands
(hold **E**: rotate 45° per use) so the beam bounces through all four and ends on the sealed **Sun Door** in the east wall.
The answer is drawn on the **Antechamber lore tablet** (the angles are shown as arrows). Stands only turn out of combat.
It can be done any time before or after King Sethar; the door opens after Sethar dies.
Journal hint: *"Seven Glass Kings are carved on the outer seal. Six tombs were found."*

| Field | Value |
|---|---|
| Body | chibi2 elf-slender undead ×2.0, drawn as a **heat-shimmer outline** everywhere (always visible, always Tab-targetable) and **fully drawn** only inside a sun-patch (material `seen_in_sun`, §22) |
| Health | 150 H |
| Phases | 100–60% · 60–30% · 30–0% |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Unseen Cut | all | melee on tank | — | 14 %HP | — |
| **Bring the Sun** | all | the party carries **3 Sun Mirrors** (hand mirrors, pick-ups at the door; carrying slows 10%). Each throws a 5 m **sun-patch** (a bright gold circle on the floor, **beneficial** colour) from the room's roof slots — where a sun-patch touches him, he is fully drawn and takes +100% damage; outside he takes −50% | — | — | mirror carriers stay near him and near the tank |
| Cloud the Mirrors | all | targets a mirror carrier: yellow **targeted** 4 m | 2.5 s | 25 %HP + that mirror is fogged 8 s (no sun-patch) | carrier leaves the group, others cover |
| Mirror Step | all | vanishes; reappears at a random mirror, casting **Glassrain**: 6 m red circle at that mirror | 2.0 s | 40 %HP | leave the mirror |
| Checker of Glare | P2+ | checkerboard where the safe tiles are **only the ones a sun-patch touches** | 3.0 s | 55 %HP | mirror carriers spread to cover safe tiles |
| Seventh Cross | P3 | red **cross** that moves with him | 2.5 s | 40 %HP | corners |

**Dialog:** pull (banner, whisper) — "My brother kept the light. I kept everything else." · Cloud the Mirrors ⚠ — "Close your eyes." · death — "Now... you've seen me..."
**Depth list** (page 11 §22.2): ① `mech_swap_places` Mirror Swap · ② `mech_arrow_pin` Unseen Shot: a 30 m line, root 1 s · ③ `mech_gaze` Do Not Look: dazed 3 s.
**Loot:** `it_unseen_princes_wraps` (light chest), `it_sun_mirror_of_tamar` (off-hand focus; was `it_lamp_of_tamar`, light slot), `uq_seventh_kings_signet` **[D-EXCL]** — ring: +8% damage while you stand in a beneficial zone, a sun-shaft or a sun-patch; +8% dodge chance while you do not. **`leg_the_unseen_prince` [SECRET] [D-EXCL]** — back (cloak) legendary: after 3 s without taking damage you become **unseen** (enemies further than 8 m lose you); your first attack from unseen deals +60%. Mount `it_mount_dune_sabrecat` (Dune Sabrecat, a sand-gold sabre cat; page 08 §24.3, also a Quiet Wake *Kindred* reward) **20%** per player.

### Set dropped here

`set_sunglass_regalia` — Sunglass Regalia (4 pieces: hands, helm, chest, legs; cloth). Brief: 2 = +5% holy and fire damage, 4 = standing in a beneficial zone doubles its effect on you.

---

## d06 — Vault of the Sandsworn

### Card

| Field | Value |
|---|---|
| id | `d06_sandsworn_vault` |
| Region | Sunscar Barrens (`sunscar`) |
| Levels | 22–24 (opens at 21) · Challenge 60 · Depth 1–42 (level 60 at Depth 12; §2.4) |
| Looks | `vault` (reuse; recoloured sand-gold, §22 `vault_sand`), `hoard` for the treasury |
| Entrance | **the Dry Well** in the Oasis of Tamar's old quarter: a spiral stair inside a well that has not held water in 300 years |
| Quest giver | `npc_vaultkeeper_hadim_sar`, Sandsworn vaultkeeper, the Oasis Treasury |
| Story quest | `q_the_vault_wakes` — "The Vault Wakes": the Dunecutters tunnelled into the vault and woke its wardens; stop both |
| Run time target | Normal 25 min · Challenge 26 min (no timer; the journal records your best time) |
| Brazier Shrines | Well Foot · after the Scales of Tamar · after Qassar |
| Rarity slots (§2.9) | **C** Charter Stacks (pack 2) · **C** Hask's Tunnel (pack 5) · **R** Warden Gallery (the Vault Warden of pack 4 or a Sand Wraith of pack 3) · **G** Oathroom (7; never a Coin Mimic) · *Challenge:* **C+** Warden Gallery (the pack that did not get the rare) · **R+** Charter Stacks (a Vault Warden of pack 1) · **W** Hask's Tunnel (pack 6) · *Depth rooms:* Charter Stacks, Warden Gallery, Hask's Tunnel |
| Main family (page 10) | **construct** · also sand, folk, beast |
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
| Well Foot | 12×12 | S1 |
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
| `m_sand_sand_wraith` | Sand Wraith | creature wraith ×1.3, sand-coloured, dissolving hem | 1 | **Scour** 20° cone 8 m, 1.5 s, 12 %HP. Physical damage −30% against it. |
| `m_sand_dust_devil` | Dust Devil | creature elemental ×1.0, whirl of sand (new `whirl` variant, §22) | 0.8 | moves on its own at 3 m/s as a 3 m **void zone**, 3 %HP / 0.5 s, knockback 4 m on touch. |
| `m_folk_dunecutter_tunneler` | Dunecutter Tunneler | chibi2 human, goggles, shovel | 1 | **Undermine**: 4 m red circle, 2.0 s, 14 %HP + knocked down. |
| `m_folk_dunecutter_hexblade` | Dunecutter Hexblade | chibi2 human, silver-inlaid scimitar | 1 | **Silver Curse**: a **curse** on a player — −30% healing received, 12 s (**dispel** it). Melee 7 %HP. |
| `m_folk_dunecutter_sandcaller` | Dunecutter Sandcaller | (as d05) | 0.9 | as d05 |
| `m_beast_vault_asp` | Vault Asp | creature snake ×1.6, black and gold bands | 1 | **Coil**: roots a player 2 s; **Venom** 1.5 %HP a second 8 s (dispellable poison). |
| `m_sand_coin_mimic` | Coin Mimic | creature mimic ×1.1, coin-heap shape | 1.5 | disguised as a coin pile; wakes when looted: **Gulp** 18 %HP + holds the player 2 s. (The only mimics are these, and they glint green on a second look — hover a coin pile for 2 s to see it.) |

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
**Depth list** (page 11 §22.2): ① `mech_spark_runner` rolling coins · ② `mech_fixate_chase` a Coin Mimic chases the richest player · ③ `mech_void_pool` spilled coins 4 m, slows 30%.
**Loot:** `it_counting_house_gloves` (light hands), `it_brassbound_buckler` (shield), `uq_the_coffers_tongue` **[D-EXCL]** — neck: +12% gold found; enemies that die within 3 s of your hit drop 10% more gold.

#### s2 · `b_hask_the_tunneler` — Hask the Tunneler

Body: chibi2 human ×1.5, huge goggles, a sand-auger. Health 28 H. Hask's Tunnel (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Auger | melee | — | 12 %HP | — |
| **Cave the Tunnel** | a red **moving wave** of falling sand runs down the 6 m tunnel from one end at 4 m/s | 2.0 s | 30 %HP + buried 2 s | dig into one of the 3 side alcoves (blue **safe zones**) as it passes |
| Blasting Charge | orange **soak** 3 m, **2 pips** | 3.5 s | 60 %HP to all if short | two players |

**Depth list** (page 11 §22.2): ① `mech_ground_spikes` Auger Line toward a player · ② `mech_rolling_boulders` 3 sandstone blocks down the tunnel · ③ `mech_launch` Undermine: red 4 m, knock-up.
**Loot:** `it_sand_auger` (two-handed spear), `it_tunnel_goggles` (medium helm), `uq_hasks_lucky_shovel` **[D-EXCL]** — off-hand: dodge roll distance +2 m; rolling through a wave or wall gives +10% haste 3 s.

### Main bosses

#### B1 · `b_scales_of_tamar` — The Scales of Tamar

| Field | Value |
|---|---|
| Body | a construct: two 8 m bronze pans in the floor and a 7 m **beam** above with a **Sandsworn face** at the pivot (new prop `great_scales`, §22); the target is the face (hittable from either pan) |
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
**Challenge:** tolerance ±1 from the start; Guilt on 3 players. **Deep tuning:** the pans swap sides (left becomes right) every other call.
**Depth list** (page 11 §22.2): ① `mech_add_swarm` 6 Brass Scarabs · ② `mech_silence_pulse` Hush of the Vault: 3 s · ③ `mech_tether_share` Balanced Pair: two players share damage 10 s.
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

**Dialog opportunity — "Everyone has a price"** (at pull): "Fifty gold each and I'll forget you were here." · pay (50 gold each, all players must accept; a vote box) → he laughs, takes it, and **fights anyway** at −15% health ("I said I'd *forget*."). · refuse → normal. · *(**Trusted** or better with the Quiet Wake, whose Sandsworn chapter keeps this vault — page 07)* "The Sandsworn don't pay thieves." → the wardens join **you**: 2 Vault Wardens fight on your side for the fight.
**Dialog:** Silver Tongue ⚠ — "Surely we can come to an arrangement." · Sand Wall ⚠ — "Mind the wall, friend." · 60% (banner) — "Which one of me did you trust?" · death — "The Oath... was worth... more than you..."
**Challenge:** Silver Tongue cannot be dispelled (interrupt only). **Deep tuning:** two Sand Walls from opposite sides, gaps offset.
**Depth list** (page 11 §22.2): ① `mech_dispel_punish` Silver Hex: dispel it and a red 6 m burst follows · ② `mech_add_wave` 2 Dunecutter Hexblades · ③ `mech_purge_buffs` Fine Print: removes one buff from everyone.
**Loot:** `it_silver_rod_of_qassar` (wand), `it_silver_trimmed_robes` (cloth chest), `set_oathkeeper_bronze` piece (hands), `soul_the_stolen_oath` **[D-EXCL]** — soul (jewellery socket; was the trinket `uq_the_stolen_oath`): once every 60 s, the first curse placed on you or on an ally within 20 m is removed the moment it lands; +5% healing received.

#### END · `b_the_sand_sovereign` — The Sand Sovereign

| Field | Value |
|---|---|
| Body | creature elemental ×3.8, a torso of whirling sand from the waist up, arms of sandstone, a crown of bronze keys (a sand palette of `elemental`; new variant `sand`, §22) |
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
**Challenge:** Oath of Binding needs 5 pips (everyone). **Deep tuning:** Binding Curse cannot be dispelled for its first 3 s.
**Depth list** (page 11 §22.2): ① `mech_blight_cloud` a drifting sand cloud 5 m · ② `mech_wind_push` Desert Wind toward a sand-fall · ③ `mech_encase_mark` Sand Coffin: yellow 3 m, encased 2 s.
**Loot:** `it_key_crown_of_the_sovereign` (medium helm), `it_sandstone_greathammer` (two-handed mace), `it_bronze_key_ring` (ring), `set_oathkeeper_bronze` pieces (helm, legs), `uq_sovereigns_binding` **[D-EXCL]** — waist (was wrists): dispelling a curse from an ally gives both of you +10% damage for 6 s. `leg_the_unbound_dune` **[D-EXCL]** — boots legendary: every 10 s your next dodge roll leaves a 6 m-long **sand wall** behind you for 4 s that blocks enemy projectiles and pushes enemies 3 m.

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
**Depth list** (page 11 §22.2): ① `mech_undertow_pool` the dry well's pull, 6 m · ② `mech_tether_keep` Oath-Bound: two players within 8 m for 10 s · ③ `mech_meteor_rain` falling bronze keys, 6 circles 3 m.
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
| Levels | 25–28 (opens at 24) · Challenge 60 · Depth 1–41 (level 60 at Depth 11; §2.4) |
| Looks | `hollow` (reuse) with a blight tint (§22 `hollow_blight`: grey-violet moss, black thorns) |
| Entrance | **the Blackened Oak**, 3 km west of Silverbough: a great oak gone grey, its roots split open into a hollow wide enough to ride into |
| Quest giver | `npc_moonwell_warden_sefa_lin`, Moonwell Circle warden, Silverbough's Root Terrace |
| Story quest | `q_the_thorned_heart` — "The Thorned Heart": find why the forest's thorns are growing toward Silverbough |
| Run time target | Normal 26 min · Challenge 27 min (no timer; the journal records your best time) |
| Brazier Shrines | Root Gate · after the Sporefather · after Orenn Thornbound |
| Rarity slots (§2.9) | **C** Rootway (pack 1) · **C** Briar Maze (pack 3 or 5) · **R** Briar Maze (a Ravager of pack 4) · **G** Moonroot Pool (6) · *Challenge:* **C+** the Briar Maze patrol · **R+** Rootway (a Bramble Wolf of pack 2) · **W** Briar Maze (the pack that did not get the champion) · *Depth rooms:* Rootway, Briar Maze. Area rarities (a Giant's stomp, a Flaming burst) hurt Saplings like players' area damage does. |
| Main family (page 10) | **beastkin** · also beast, fen, fae |
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
| Root Gate | 12×12 | S1; Sapling 1 |
| Rootway | 8×44 | packs 1–2 |
| Briar Maze | 30×30 of 3 m thorn hedges (touching a hedge: 2 %HP + slow 20%) | packs 3–5; Sapling 2 |
| Spore Garden | 28×28, 4 clean springs | B1 the Sporefather; Sapling 3 |
| Silkrot Nest | 20×20, webbed | s1 the Silkrot Matriarch (optional) |
| The Thorn Altar | 26×26, Thornmane totems | B2 Orenn Thornbound; S2 at its door; Sapling 4 |
| Packlord's Den | 18×18 | s2 Rakka Bloodbriar (optional); Sapling 5 |
| Moonroot Pool | 14×14 | S3, pack 6 |
| The Heart Chamber | 34×34, a great heartwood in the centre, 4 moonroot pools at the edge | END Wyllow; Sapling 6 |
| The Gall Pit | 26×26, the blight's own root knot | secret boss |

**Saplings** (`npc_wyllow_sapling`, 6): knee-high tree-children (creature mushroom ×0.7 re-skinned as a sapling, §22),
non-hostile, 1 H each. **Players' area damage hurts them.** Clicking one (hold E 1 s) sends it to hide in the nearest
root for the rest of the run. A Sapling that dies wilts with a sound; the party frame counts "Saplings: 6/6".

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_beastkin_thornmane_ravager` | Thornmane Ravager | chibi2 beastkin (wolf-headed), thorn-wrapped arms | 1.2 | **Rend** 2 × 5 %HP + bleed 1 %HP a second 6 s. |
| `m_beastkin_thornmane_skulker` | Thornmane Skulker | chibi2 beastkin, lean, bone knives | 1 | **Pounce** from hiding (it waits unseen until 10 m): 12 %HP + knockdown 1 s. |
| `m_beastkin_thornmane_moonseer` | Thornmane Moonseer | chibi2 beastkin, antler headdress, thorn staff | 0.9 | **Thornbind** (i) 2.0 s: roots a player 4 s with a white **tether** to the ground (breaks when a teammate hits the root, 0.3 H). **Blight Mend** (i): heal 30%. |
| `m_beast_bramble_wolf` | Bramble Wolf | creature wolf ×1.4, thorns grown through the fur | 1 | **Thorn Coat**: melee attackers take 2 %HP per hit. **Bite** 6 %HP. |
| `m_beast_silkrot_spider` | Silkrot Spider | creature spider ×1.4, grey-violet | 1 | **Web Spit**: yellow **targeted** 3 m, 1.5 s, slow 50% 4 s. **Rot Bite**: **spreading** poison — 1 %HP a second; every 4 s jumps to 1 ally within 4 m. |
| `m_fae_blight_sporecap` | Blight Sporecap | creature mushroom ×1.3, violet with grey spots | 0.8 | **Spore Puff**: 4 m cloud, 1.5 s, 3 %HP / 0.5 s for 6 s; the cloud **spreads** a Spore DoT to anyone passing through. |
| `m_fae_strangle_vine` | Strangle Vine | creature snake ×2.4, green-black, rooted (does not move) | 1.2 | **Lash** 8 m reach, 10 %HP; **Constrict**: pulls a player in over 2 s (white **tether**) unless the vine is hit for 20% of its health. |
| `m_fae_blight_wisp` | Blight Wisp | creature wisp ×1.1, sick green | 0.5 | explodes on death: 4 m **void zone**, 12 s, 3 %HP / 0.5 s. |
| `m_beast_carrion_moth` | Carrion Moth | creature moth ×1.6, brown | 0.6 | **Dust Wing**: blinds 2 s in a 5 m cone. |

| # | Room | Pack |
|---|---|---|
| 1 | Rootway, near | 3 Thornmane Ravagers + 1 Moonseer |
| 2 | Rootway, far | 2 Bramble Wolves + 2 Skulkers (hidden: a shimmer shows at 10 m) |
| 3 | Briar Maze, north | 3 Blight Sporecaps + 2 Strangle Vines |
| 4 | Briar Maze, centre | 2 Ravagers + 1 Moonseer + 2 Bramble Wolves |
| 5 | Briar Maze, south | 4 Silkrot Spiders + 4 Blight Wisps |
| 6 | Moonroot Pool | 2 Moonseers + 2 Ravagers + 2 Carrion Moths |
| — | *patrol* Briar Maze | 1 Ravager + 2 Bramble Wolves, 45 s loop |

### Sub-bosses

#### s1 · `b_silkrot_matriarch` — The Silkrot Matriarch

Body: creature spider ×3.6, grey-violet, a blight-flower on her back. Health 32 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Fang | melee + Rot Bite (spreading poison) | — | 11 %HP | spread 4 m apart or the poison jumps |
| **Web Line** | white **tether** from a wall to a player, 4 s; if unbroken the player is cocooned 3 s (take 5 %HP a second) | 2.0 s | — | an ally hits the web line (0.5 H) or the player moves 18 m |
| Brood | 4 Silkrot Spiders from the ceiling | 1.5 s | — | cleave |

**Depth list** (page 11 §22.2): ① `mech_void_growing` a spreading web patch (slows 40%) · ② `mech_fixate_chase` a Silkrot Spider fixates the healer · ③ `mech_spread_mark` Venom Spit: yellow 5 m on 2.
**Loot:** `it_silkrot_wraps` (cloth legs), `it_matriarch_fang` (dagger), `uq_web_of_the_matriarch` **[D-EXCL]** — back: your damage-over-time effects jump to 1 more enemy within 5 m when the target dies.

#### s2 · `b_rakka_bloodbriar` — Rakka Bloodbriar

Body: chibi2 beastkin ×1.8, packlord's thorn crown, a great briar-flail. Health 32 H. With 2 Bramble Wolves. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Briar Flail | 360° red circle 6 m | 2.0 s | 25 %HP + bleed | everyone out but the tank |
| **Blood Scent** | marks a player (red **marked** status): wolves and Rakka focus them 8 s | — | — | the tank taunts the wolves; the marked player kites |
| Howl of the Pack | +25% damage for each wolf alive, 10 s | 1.5 s | — | kill wolves first |

**Depth list** (page 11 §22.2): ① `mech_charge_line` Packlord's Rush: 20 m, 25 %HP · ② `mech_add_wave` 2 Bramble Wolves · ③ `mech_trail_fire` a thorn trail behind him (bleed ticks).
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
**Challenge:** springs cleanse after 3 s; Rot Spores on 3 players. **Deep tuning:** a spring used 3 times rots into a **void zone** for 20 s.
**Depth list** (page 11 §22.2): ① `mech_blight_cloud` a spore cloud drifting 2 m/s · ② `mech_add_swarm` 6 sporelings · ③ `mech_heal_self` Take Root (i): heals him 10%.
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
**Challenge:** Rootchain on 3; totems 2.5 H. **Deep tuning:** each broken Rootchain drops a 3 m bramble **void zone** for 10 s.
**Depth list** (page 11 §22.2): ① `mech_tether_cross` Tangled Roots: 2 pairs; the lines must not cross · ② `mech_spread_mark` Moon Thorns: yellow 5 m on 2 · ③ `mech_silence_pulse` Hush of the Grove: 3 s.
**Loot:** `it_briar_staff_of_the_seer` (staff), `it_thornbound_antlers` (medium helm), `set_thornwarden_bark` piece (chest), `uq_thornlink_band` **[D-EXCL]** — ring: when an ally within 8 m takes a hit over 20% of their health, you take 10% of it instead and they take 10% less.

#### END · `b_wyllow_blighted_heart` — Wyllow, the Blighted Heart

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.8 made of bark and leaves (new material `bark_skin`, §22), grey-violet blight veins, rooted to the heartwood by thorn cables |
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
**Challenge:** cleanse needs Wyllow above 80%. **Deep tuning:** Blight Knots respawn once if not all killed within 10 s of each other.
**Depth list** (page 11 §22.2): ① `mech_rotating_beam` a blight vine sweeping 25 m at 30°/s · ② `mech_add_swarm` 6 Blight Wisps · ③ `mech_ground_spikes` a thorn line toward a player.
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
**Depth list** (page 11 §22.2): ① `mech_blight_cloud` a drifting blight cloud · ② `mech_ground_spikes` a root spike line · ③ `mech_add_swarm` 6 gall-grubs.
**Loot:** `it_gall_husk_helm` (heavy helm), `it_everblight_scythe` (two-handed polearm), `soul_seed_of_the_sovereign` **[D-EXCL]** — soul (weapon socket, casters; was the trinket `uq_seed_of_the_sovereign`): every 60 s your next damaging spell also plants a seed on its target; 3 s later it bursts into a 5 m spreading damage-over-time (40% spell power a second, 8 s). **`leg_wyllows_gratitude` [SECRET] [D-EXCL]** — off-hand focus legendary: every 15 s, the next ally you heal gets a 3 m **beneficial** root-pool under them for 6 s that cleanses one damage-over-time effect a second.

### Set dropped here

`set_thornwarden_bark` — Thornwarden's Bark (4 pieces: legs, chest, helm, hands; medium armour). Brief: 2 = +15% resistance to poison and bleed, 4 = standing in a beneficial zone gives your hits +10% damage.

---

## d08 — Ruins of the Moonwell

### Card

| Field | Value |
|---|---|
| id | `d08_moonwell_ruins` |
| Region | Whisperwood (`whisperwood`) |
| Levels | 28–30 (opens at 27) · Challenge 60 · Depth 1–40 (level 60 at Depth 10; §2.4) |
| Looks | `ruin` (reuse) with silver-white trim (§22 `ruin_moon`), a pale blue fog; lit by the well's own silver glow in the floor cracks |
| Entrance | **Lirath Isle** in Mirrorlake, 5 km north of Silverbough: a white stair out of the water to a broken moonwell dome. A white-sailed ferry from Silverbough takes you there (a Travel Method stop at the stair, page 20 — arriving on it discovers the dungeon). |
| Quest giver | `npc_moonsinger_aethe_varn`, Moonwell Circle singer, Silverbough |
| Story quest | `q_the_cracked_well` — "The Cracked Well": find what drank the old moonwell dry |
| Run time target | Normal 27 min · Challenge 28 min (no timer; the journal records your best time) |
| Brazier Shrines | White Stair · after the Twin Wardens · after Archmage Ilvandor |
| Rarity slots (§2.9) | **C** Silver Colonnade (pack 1) · **C** Huntress' Gallery (pack 5 or 6) · **R** Hall of Reflections (the Well-Drinker of pack 3) · **G** Stargazers' Terrace (7) · *Challenge:* **C+** Hall of Reflections (pack 4) · **R+** Silver Colonnade (the Sentinel of pack 2) · **W** Huntress' Gallery (the pack that did not get the champion) · *Depth rooms:* Silver Colonnade, Hall of Reflections, Huntress' Gallery |
| Main family (page 10) | **fae** · also undead, rift, beast |
| New lessons | **donut** (the safe hole in the middle), **silver/dark phases of the well** (the Moon Clock), **shared-health twins** |

### The Moon Clock (dungeon-wide, new)

A silver dial over every boss frame and in the corner of the HUD cycles **Moonlit (45 s) → Moonless (45 s)**, always,
from the moment the party enters. In **Moonlit** monsters of the well (wisps, sentinels) are stronger (+20% damage) and
**Moonless** monsters (horrors, eyes) weaker; in **Moonless** it reverses. Bosses change abilities by phase of the clock. The clock is **the well's glow**, not the sky — the sky over the roofless ruin stays day. In Moonless the silver floor-cracks dim to blue; every floor, telegraph and enemy stays readable (§2.12).
Moonshards (see Secret) are only visible in Moonless.

### Story hook

The elves of Lirath built a well that held moonlight like water. When it cracked six hundred years ago, the elves left and
the Circle sealed the isle. Now the lake glows at the wrong times and the fish swim upside down. Moonsinger Aethe has
heard singing from the isle that is not an elf's. Something came up through the crack and drank the moon, and it is
still thirsty.

### Layout

```
                          ? The Drowned Moon (secret: 5 moonshards + end boss killed in Moonlit, either difficulty)
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
| White Stair | 14×10 | S1 |
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
| `m_undead_moonwell_sentinel` | Moonwell Sentinel (elite) | chibi2 elf ghost ×1.6, silver plate, glaive (material `ghost_silver`, §22) | 3.5 | **Glaive Arc**: 180° red cone 6 m, 2.0 s, 25 %HP. **Moonward** (Moonlit only): +40% armour. |
| `m_undead_pale_huntress` | Pale Huntress | chibi2 elf ghost, longbow | 1 | **Silver Arrow**: red line 1 m × 30 m, 2.0 s, 18 %HP. |
| `m_undead_weeping_acolyte` | Weeping Acolyte | chibi2 elf ghost, robes | 0.9 | **Mourning Hymn** (i) 3.0 s: all enemies within 20 m heal 20%. |
| `m_fae_moon_wisp` | Moon Wisp | creature wisp ×1.2, silver-white | 0.5 | **Moonbeam**: 1.5 s, 3 m red circle on a player, 12 %HP. Moonlit: casts twice. |
| `m_beast_silverwing_owl` | Silverwing Owl | creature owl ×1.8, white | 1 | **Dive**: 1.2 s swoop at a player, 10 %HP + knocked down. |
| `m_beast_lamp_moth` | Moonmoth | creature moth ×1.5, pale blue | 0.5 | swarms of 4; **Dazzle** 2 s blind in 4 m. |
| `m_fae_starless_eye` | Starless Eye | creature horror ×0.9, one great eye, few tentacles | 0.8 | **Gaze**: a white **tether** to a player for 3 s; if unbroken (line of sight), 20 %HP + silence 2 s. Moonless: gaze twice as long. |
| `m_fae_well_drinker` | Well-Drinker | creature horror ×1.6, silver-veined black | 1.8 | **Drink Light**: a 5 m **donut** (safe hole at its feet), 2.0 s, 20 %HP outside the hole — get **close**. |
| `m_fae_moonshard_cluster` | Moonshard Cluster | creature shard ×1.2, silver | 0.7 | **Shatter**: on death 3 m, 1.5 s, 12 %HP. |

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
| **Drawn to Glow** | Moonlit: she flies to the player who cast the **most spells in the last 5 s** (their hands glow silver as the count builds) and **Dust Storms** there: 6 m red circle | 2.0 s | 30 %HP | that player stops casting and moves off; others step out |
| Moonmoths | Moonless: 6 Moonmoths | 1.5 s | — | cleave |

**Depth list** (page 11 §22.2): ① `mech_wind_push` Wingbeat: pushed 6 m · ② `mech_spread_mark` Dust Mark: yellow 5 m on 2 · ③ `mech_blight_cloud` a drifting dust cloud.
**Loot:** `it_gloamwing_mantle` (cloth shoulders), `it_eye_spot_charm` (neck), `uq_dusk_scale_cloak` **[D-EXCL]** — back: +10% dodge chance while you have not cast a spell in the last 3 s.

#### s2 · `b_caelith_pale_huntress` — Caelith, the Pale Huntress

Body: chibi2 elf ghost (woman) ×1.7, longbow of moon-silver, a ghostly owl companion. Health 32 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Arrow | ranged on tank | — | 10 %HP | — |
| **Huntress's Mark** | **marked** on 1 player 6 s, then **Moonshot**: red line from Caelith through the marked player, 1 m × 40 m | 3.0 s | 60 %HP to everyone on the line | the marked player moves so nobody is between them and her, or behind them |
| Owl Dive | Silverwing Owl add dives the healer | 1.5 s | 12 %HP | kill the owl (2 H) |

**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Pinning Arrow: 30 m line, root 1 s · ② `mech_fixate_chase` the owl fixates a caster · ③ `mech_mark_of_prey` Hunter's Mark.
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
| Sun Blade (Sael) | all | melee, gold | — | 13 %HP | the one tank holds both side by side (they must stand **within 8 m** of each other or both gain +30% damage — a **tether**-like white line between them shows range) |
| Moon Blade (Nerith) | all | melee, silver | — | 13 %HP | — |
| **Dawn** (Sael, Moonlit) | Moonlit | gold half of the court goes red, room-half **danger zone** | 3.0 s | 60 %HP | be on the silver half |
| **Dusk** (Nerith, Moonless) | Moonless | silver half goes red | 3.0 s | 60 %HP | be on the gold half |
| Eclipse | P2 | a 12 m **donut** centred on each twin (safe hole 4 m at their feet) | 2.5 s | 40 %HP outside the holes | stack on either twin (split the party 3/2) |

**Dialog:** Sael — "The sun keeps the door." Nerith — "The moon keeps the key." · Dawn ⚠ (banner) — "Morning." · Dusk ⚠ (banner) — "Evening." · Eclipse ⚠ — "Come close, children." · death — "Together... then..."
**Challenge:** Resentment at 5%.
**Challenge (from r03 *The Pearl Twins*, "Polarity"):** at the pull every non-tank player is given **Sun** (gold ring at their feet) or **Moon** (silver ring) — 2 Sun, 2 Moon; the tank has none. Damage you deal to **your own colour's twin** (Sun → Sael, Moon → Nerith) **heals** it for half; to the other twin it deals +30%. Every 30 s **Luster**: two orange **soaks**, 4 m, **2 pips** each, one gold-rimmed and one silver-rimmed (3.0 s) — soak the one that matches your colour; a wrong-colour soaker makes it burst for 40 %HP on everyone inside. At 50% **Invert**: a white tether between one Sun and one Moon player for 5 s, then they swap colours. (The raid version gave twenty players polarity and 6-pip soaks; here it is four players and two 2-pip soaks.)
**Deep tuning:** Eclipse's holes shrink to 3 m.
**Depth list** (page 11 §22.2): ① `mech_tether_keep` Twin Bond: two players within 8 m for 10 s · ② `mech_rotating_cross` Sun-and-Moon Cross, turning · ③ `mech_echo_repeat` Eclipse echoes once, 1.5 s later.
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
| **Star Scatter** (Moonless) | all | reverse: 5 m red circle in the middle + 8 small red circles 2 m outside | 2.5 s | 45 %HP / 20 %HP | **leave** the middle — Moonlit: Moonfall, Moonless: Star Scatter. Watch the clock |
| Diagram Lines | P2+ | 3 red lines 2 m × 26 m along the star-map's constellations | 2.0 s | 30 %HP | step off the constellation lines (always drawn faintly on the floor) |
| Book Swarm | P3 | 4 flying tomes (0.8 H) cast **Silence** (i) 2.0 s each | 2.0 s | silences 4 s | interrupt / kill |

**Dialog opportunity — "The diagram"** (at pull he asks, without looking up): "Are you the variable I was missing?" · "Yes." → he treats the party as part of the spell: **Diagram Lines never target** the player who answered. · "No, we're here to stop you." → normal. · *(Chronomancer, Mage or Oracle)* "Your constant is wrong: the moon moves." → he pauses 10 s to recalculate; the fight starts at 90%.
**Dialog:** Moonfall ⚠ (banner) — "Into the well, all of you!" · Star Scatter ⚠ (banner) — "Out! Out of the well!" · death — "The sum... never... closed..."
**Challenge:** the clock flips 5 s **during** a cast once per phase (the donut becomes Star Scatter mid-cast: 1.5 s to react). **Deep tuning:** Diagram Lines and Moonfall overlap.
**Depth list** (page 11 §22.2): ① `mech_silence_pulse` Silence the Room: 3 s · ② `mech_null_field` a 10 m star-map circle where no spell can be cast, 10 s · ③ `mech_chain_lightning` Arcane Spark: marks 3, jumps within 8 m.
**Loot:** `it_star_map_robes` (cloth chest), `it_floating_codex` (off-hand focus), `set_moonsilver_vigil` piece (helm), `uq_ilvandors_constant` **[D-EXCL]** — neck: your spells cost 5% less; every 5th spell costs nothing.

#### END · `b_oruvel_moon_drinker` — Oruvel, That Which Drank the Moon

| Field | Value |
|---|---|
| Body | creature horror ×4.0, black with silver veins, a mouth that is a hole of starlight, rising out of the cracked well |
| Health | 140 H |
| Phases | 100–65% · 65–30% (it drinks the well's glow: silver moon-pools rise and it wants them) · 30–0% ("Thirst") |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Tentacle Slam | all | melee | — | 16 %HP | — |
| **Drink the Moon** (Moonlit) | all | 18 m **donut** (safe hole 5 m at the well's lip under it) | 2.5 s | 50 %HP outside | stack at the lip |
| **Spit the Stars** (Moonless) | all | 10 yellow **targeted** 3 m circles on random spots + one on each player | 2.5 s | 25 %HP each | spread |
| Starless Eyes | all | 2 Starless Eyes every 30 s | 1.5 s | gaze tethers | kill or break line of sight |
| **Thirst** | P3 | a 5 m black **void zone** under each player every 20 s (lasts 30 s) | 1.5 s | 4 %HP / 0.5 s | move to open floor |
| Drink the Glow | P2+ | every 25 s, 4 silver **moon-pools** (green **beneficial** 3 m circles) well up at the room's edge for 10 s. Each pool still standing when they fade is drunk: Oruvel gains +5% damage per pool for the rest of the fight | 1.5 s | — | players stand in the pools (3 s each) to drink them first — each heals the drinker 10% |

**Dialog:** pull (banner, a whisper from everywhere) — "Thirsty. So thirsty." · Drink ⚠ — "Come to the edge. Drink with me." · Spit ⚠ — "Too bright. Too bright!" · 30% (banner) — "MORE." · death — "The moon... tasted... of..."
**Challenge:** Drink and Spit both happen in the same Moon Clock turn at the flip. **Deep tuning:** Thirst pools grow 0.5 m every 5 s.
**Depth list** (page 11 §22.2): ① `mech_pull_in` Thirsty Draw: pull 2 m/s for 3 s · ② `mech_gaze` Starless Stare: dazed 3 s · ③ `mech_void_growing` a spreading black pool.
**Loot:** `it_silver_veined_staff` (staff), `it_starlight_maw_cowl` (light helm), `it_well_rim_ring` (ring), `set_moonsilver_vigil` pieces (chest, hands), `uq_moon_drinkers_tooth` **[D-EXCL]** — dagger: your hits on an enemy that stands in a void zone deal +10% and heal you for 1% of the damage dealt. `leg_the_thirst` **[D-EXCL]** — neck legendary: killing an enemy drinks its glow: +3% damage for 10 s (max 10 stacks); at 10 stacks your next spell is a 10 m **donut** around you for 150% spell power.

### Secret boss — `b_the_drowned_moon` — The Drowned Moon

**Unlock (collect + timing):** pick up all **5 moonshards** (Colonnade column top, Hall pool bottom in Moonless, Owlry nest,
Huntress' target dummy, the telescope eyepiece — **each is only visible during Moonless**), then land the **killing blow on
Oruvel during Moonlit**. The shards fly into the well and the moon Oruvel drank comes back up — as something else.
Journal hint: *"Five pieces of the moon hide while the well is dim. Put it back while it's shining."*

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.6, a woman made of pale moonlight with water flowing off her (material `moonwater`, §22), no weapon |
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
**Depth list** (page 11 §22.2): ① `mech_undertow_pool` a tide pull 6 m · ② `mech_echo_repeat` Crescent echoes 1.5 s later · ③ `mech_shockwave_ring` a moon-ring with one gap.
**Loot:** `it_moonwater_hood` (cloth helm), `it_tidelink_gloves` (cloth hands), `uq_crescent_of_lirath` **[D-EXCL]** — off-hand: your cone and donut spells deal +12% damage. **`leg_the_moon_returned` [SECRET] [D-EXCL]** — ring legendary: you carry a personal Moon Clock (45 s / 45 s): Moonlit +12% healing done, Moonless +12% damage done; the ring glows to show which.

### Set dropped here

`set_moonsilver_vigil` — Moonsilver Vigil (4 pieces: legs, helm, chest, hands; cloth). Brief: 2 = +8% damage during Moonless and +8% healing during Moonlit (d08's Moon Clock; outside d08, +4% damage while you stand in any beneficial zone), 4 = standing inside a donut's safe hole gives a barrier of 10% max health.

---

## d09 — The Warmaster's Pit

### Card

| Field | Value |
|---|---|
| id | `d09_warmasters_pit` |
| Region | Cinder Steppe (`cinder_steppe`) |
| Levels | 31–34 (opens at 30) · Challenge 60 · Depth 1–39 (level 60 at Depth 9; §2.4) |
| Looks | `warren` (reuse) for the pens, **arena** (new `pit_arena`: packed ash sand, bone-stake ring, tiered stands full of cheering orcs — §22) |
| Entrance | **the Ash Bowl**, a crater ringed with bone stakes 6 km north of Fort Ashfall; the Pit is dug into its floor. Drums can be heard from the fort. |
| Quest giver | `npc_captain_ren_harrowgate`, commander of Fort Ashfall |
| Story quest | `q_into_the_pit` — "Into the Pit": the Ashtusk Warhost is making captured soldiers fight for sport. Get them out, and put the Warmaster down in his own sand |
| Run time target | Normal 28 min · Challenge 29 min (no timer; the journal records your best time) |
| Brazier Shrines | Pen Gate · after Round One · after Round Two |
| Rarity slots (§2.9) | **C** Holding Pens (pack 1) · **C** Prisoner Cages (4) · **R** Holding Pens (the Chained Brute of pack 3) · **G** Warriors' Tunnel (5) · *Challenge:* **C+** Holding Pens (pack 2) · **R+** Warriors' Tunnel (its Chained Brute) · **W** a fourth Holding Pens pack of 3 Pit Hyenas (Challenge only) · *Depth rooms:* Holding Pens, Prisoner Cages |
| Main family (page 10) | **orc** · also beast, giant, goblin |
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
of his own Warhost, because that is the only thing the Warhost will believe.

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
| Pen Gate | 12×12 | S1 |
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

**Depth list** (page 11 §22.2): ① `mech_mark_of_prey` Sic 'Em Mark: +25% from her beasts · ② `mech_trample_path` a war boar's bending charge path · ③ `mech_charge_line` Goad Rush: 18 m.
**Loot:** `it_claw_necklace` (neck), `it_bone_goad` (one-handed spear), `soul_ogras_whistle` **[D-EXCL]** — soul (jewellery socket; was the trinket `uq_ogras_whistle`): the first time each fight an enemy tagged Beast hits you, every enemy beast within 15 m attacks the nearest other enemy for 5 s (90 s cooldown).

#### s2 · `b_the_moatmother` — The Moatmother

Body: creature crocodile ×3.8, scarred, a spear-head stuck in her back. Health 36 H. Moat Cellar (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Jaws | melee | — | 15 %HP | — |
| **Death Roll** | grabs the tank and rolls into the moat: 4 s, 8 %HP a second | 2.0 s | 32 %HP total | a second player pulls the spear-head (hold E 1 s on her back) to make her let go |
| Tail Sweep | 180° red cone behind her, 7 m | 1.5 s | 20 %HP + knocked into the moat | don't stand behind |

**Depth list** (page 11 §22.2): ① `mech_undertow_pool` the moat's pull, 6 m · ② `mech_add_swarm` 6 moat hatchlings · ③ `mech_void_pool` moat slime 4 m.
**Loot:** `it_moatmother_hide` (medium chest), `it_old_spear_head` (dagger), `uq_death_roll_girdle` **[D-EXCL]** — waist (was `uq_death_roll_bracers`, wrists): when you are held or stunned, gain a barrier of 10% max health (20 s cooldown).

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
**Challenge:** Chain Arc has a second ring 16–19 m. **Deep tuning:** hyena waves every 20 s.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` the crowd rolls 3 stones in · ② `mech_knockback_nova` Shake the Chain: 8 m knockback · ③ `mech_hurl_player` Throw: a player is thrown 12 m (never out of the ring).
**Loot:** `it_stone_knuckles` (fist weapon), `it_giants_iron_collar` (neck), `set_pitchampion_leathers` piece (legs), `uq_broken_chain` **[D-EXCL]** — neck (was wrists; a length of broken chain on a cord): when a movement-stopping effect ends on you, gain +25% move speed and +10% damage for 3 s.

#### B2 · `b_razorback_rider_krunn` — Round Two: Krunn and Razorback

| Field | Value |
|---|---|
| Body | chibi2 orc ×1.6 riding **Razorback**, a creature boar ×3.4 in iron barding (new: mounted boss rig, §22) |
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
**Challenge:** Gore Run twice in a row; if both miss the stakes the second leaves a trail of fire **void zone**. **Deep tuning:** kill the two within 15 s of each other or the survivor heals 20%.
**Depth list** (page 11 §22.2): ① `mech_trample_path` Razorback's bending charge · ② `mech_arrow_pin` Spear Pin: 30 m line, root 1 s · ③ `mech_add_wave` 2 Pit Fighters.
**Loot:** `it_razorback_barding_pauldrons` (heavy shoulders), `it_krunns_lance` (polearm), `set_pitchampion_leathers` piece (chest), `uq_bait_and_stake` **[D-EXCL]** — boots: an enemy that is fixated on you or chasing you takes +10% damage from your allies.

#### END · `b_warmaster_drogath` — Round Three: Warmaster Drogath Ashmane

| Field | Value |
|---|---|
| Body | chibi2 orc ×2.4, grey mane braided with ash, a pair of cleavers, a war-banner cape |
| Health | 150 H |
| Phases | 100–70% (**single combat** or full fight) · 70–35% (the Warhost piles in) · 35–0% ("Blood for the Pit") |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Twin Cleavers | all | melee, 2 hits, **Deep Wound** stack (−5% healing received, max 8) | — | 2 × 9 %HP | tank handoff at 5 on Challenge; a follower/Damage taunt for 5 s on Normal |
| **Ash Whirl** | all | 10 m red circle around him, then a moving whirl (4 m **void zone**) that chases the furthest player for 8 s | 2.5 s | 35 %HP, then 4 %HP / 0.5 s | out; the furthest player kites it |
| War Horn | P2 | 3 Pit Fighters + 1 Blood Drummer + 2 Pit Hyenas every 35 s | 1.5 s | — | interrupt the drummer |
| **Warmaster's Challenge** | P2+ | **marks** 1 player: a 12 m blue **ring** appears round the two of them — the rest of the party is pushed out and cannot enter for 10 s | 2.0 s | the duel | the marked player survives 10 s (the healer can heal through the ring) |
| **Blood for the Pit** | P3 | orange **soak** 5 m, **3 pips**, and a **danger zone** 8 m around him at once | 4.0 s | 90 %HP to all if short / 50 %HP in the red | three soak away from him |

**Dialog opportunity — "Single combat"** (on pull): "Send me your champion. Or all of you — and the Pit will laugh." · **The party picks a champion** (a vote box; followers can't be chosen) → **Phase 1 becomes a duel**: the champion fights Drogath alone in a 12 m ring (his damage −40% in the duel, abilities: Twin Cleavers, Ash Whirl only) while the others fight a Warhost wave outside. If the champion brings him to 70% **without dying**: Favour +40, Drogath says "...The Pit has spoken," and **Phase 2 is skipped** (he goes straight to Phase 3 at 70%). If the champion dies, the rest pour in at the Warmaster's current health (Favour −30). · "All of us." → full fight, normal.
**Dialog:** Ash Whirl ⚠ — "Dance!" · Challenge ⚠ (banner) — "You! Face me!" · Blood ⚠ (banner) — "BLOOD FOR THE PIT!" · death — "Good... a good death... in the sand..."
**Challenge:** Challenge ring shrinks to 8 m; Blood for the Pit needs 4 pips. **Deep tuning:** Deep Wound max 12; Ash Whirl chases for 12 s.
**Depth list** (page 11 §22.2): ① `mech_hurl_player` Pit Throw: 12 m · ② `mech_rotating_cross` a turning cleaver cross, 30 %HP · ③ `mech_mark_of_prey` Warmaster's Mark.
**Loot:** `it_ashmane_cleaver` (one-handed axe, 2 drop as a pair), `it_warmasters_banner_cape` (back), `it_pit_victor_band` (ring), `set_pitchampion_leathers` pieces (helm, hands), `uq_favour_of_the_crowd` **[D-EXCL]** — neck: each dodge roll through a danger zone gives **Favour** (+2% damage per stack, 10 s, max 5). `leg_ashmanes_twin_cleavers` **[D-EXCL]** — one-handed axe legendary (a pair: equipping one in each hand counts as one legendary): every 3rd hit with the off-hand cleaver throws it: a 12 m line, 80% weapon damage, returns to your hand.

**Depth Cache extra (d09 only):** from reward depth **R 10**, each Depth Cache here also rolls **1%** per player for the mount `it_mount_warhound` (Warmaster's Hound, an iron-collared war hound; page 08 §24.3).

### Secret boss — `b_old_gnash_undefeated` — Old Gnash, the Undefeated

**Unlock (no-deaths):** win **all three Pit Rounds with no player deaths** (the Warhost counts; the portcullis to the Champions' Hall opens and a
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
| Horn Club | all | melee + Deep Wound | — | 18 %HP | tank handoff at 5 (Challenge) |
| **Old Tricks** | all | a random earlier Round's ability: Chain Arc ring, Gore Run line, or Ash Whirl | as the original | as the original | recognise it |
| Veteran's Roar | all | room-wide (u) 3 s: everyone **feared** 2 s unless inside the blue **safe zone** he stands in (a 6 m ring at his own feet — get close) | 3.0 s | fear | stack on him |
| Tallow's Pounce | P2+ | Tallow fixates the healer | — | 30 %HP if caught | kite; the tank taunts Tallow |
| **One Last Fight** | P3 | orange **soak**, 4 pips, while he swings a 360° 6 m red circle | 4.0 s | 100 %HP if short / 40 %HP in the red | soak at the edge of the red ring |

**Dialog:** pull (banner) — "Forty years. Nobody's put me down. You'll do, maybe." · Roar ⚠ — "Come here and say that!" · death — "Hah. HAH. Look after Tallow." (Tallow, if alive, sits down and does not fight.)
**Depth list** (page 11 §22.2): ① `mech_fixate_chase` a second old cat fixates a caster · ② `mech_charge_line` Old Charge: 20 m · ③ `mech_shockwave_ring` Veteran's Roar ring with one gap.
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
| Levels | 36–39 (opens at 35) · Challenge 60 · Depth 1–37 (level 60 at Depth 7; §2.4) |
| Looks | `rime` (reuse) and `cave` with ice |
| Entrance | **the Fang Mouth**, 4 km up the Rimefang Glacier from Rimehold: a cave in the ice shaped like an open jaw, icicle teeth 6 m long |
| Quest giver | `npc_warden_kaija_frostmere`, Frost Warden captain, Rimehold |
| Story quest | `q_the_fang_in_the_ice` — "The Fang in the Ice": the Stonehide are waking a rime wyrm under the glacier to crack Rimehold's wall |
| Run time target | Normal 30 min · Challenge 30 min (no timer; the journal records your best time) |
| Brazier Shrines | Fang Mouth · after Skarr Icebreaker · after Rimeweaver Seidra |
| Rarity slots (§2.9) | **C** Icicle Hall (pack 1) · **C** Glass Glacier (pack 3 or 4) · **R** the Glass Glacier patrol (one Rime Bear) · **G** Frozen Falls (5) · *Challenge:* **C+** Glass Glacier (the pack that did not get the champion) · **R+** Icicle Hall (the Icebreaker of pack 2) · **W** Icicle Hall (pack 2's other members) · *Depth rooms:* Icicle Hall, Glass Glacier |
| Main family (page 10) | **giant** · also beast, frost, dragon |
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
| Fang Mouth | 14×12 | S1, brazier 1 |
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
| `m_beast_frost_stalker` | Frost Stalker | creature saber_cat ×1.6, white, blue stripes | 1.2 | hidden (unseen) until 8 m; **Pounce** 15 %HP + slow. |
| `m_beast_rime_bear` | Rime Bear | creature bear ×1.8, white-blue | 2 | **Crushing Paw** 12 %HP; **Roar**: 6 m, 1.5 s, +2 Chill. |
| `m_dragon_rime_whelp` | Rime Whelp | creature drake ×1.2, white | 1 | **Frost Breath**: 45° cone 8 m, 1.5 s, 12 %HP + 2 Chill. |
| `m_frost_frost_shard` | Frost Shard | creature shard ×1.3, blue-white | 0.7 | **Rime Nova**: on death, 4 m, 1.2 s, 10 %HP + 2 Chill. |
| `m_frost_snow_wraith` | Snow Wraith | creature wraith ×1.4, white | 1 | **Whiteout**: a 6 m **void zone** of blizzard that follows it, 2 %HP / 0.5 s + 1 Chill a second. |
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
| Crushing Paw | melee | — | 16 %HP | — |
| **Den Collapse** | 5 red circles 3 m (falling ice) | 1.8 s | 25 %HP | move |
| Hibernate | at 50%: curls up, heals 2% a second for 10 s, takes −50% damage — **unless** someone is standing in warmth right next to him (the den's brazier-coals, a beneficial zone) and **fire damage** hits him (he wakes angry, no heal) | 2.0 s | — | fire at him from the coals |

**Depth list** (page 11 §22.2): ① `mech_knockback_nova` Waking Roar: 8 m knockback · ② `mech_fixate_chase` a bear cub fixates a caster · ③ `mech_encase_mark` Frost Hug: yellow 3 m, encased 2 s.
**Loot:** `it_whitemaw_pelt` (medium back), `it_frosted_bear_claw` (fist weapon), `soul_hibernation` **[D-EXCL]** — soul (armour socket: chest or legs; was the trinket `uq_hibernation_charm`): when a hit takes you below 30% health, you curl up and heal 30% of your maximum health over 6 s, unable to move (a dodge roll cancels it; 120 s cooldown).

#### s2 · `b_frostsayer_yrsa` — Frostsayer Yrsa

Body: chibi2 giant (woman) ×1.6, rune-bone circlet, a staff hung with ice bells. Health 36 H. Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Ice Bolt | ranged | — | 12 %HP | — |
| **Bell Hymn** (i) | 3.0 s: +4 Chill to everyone | 3.0 s | — | interrupt |
| Frost Circle | a 10 m **donut**, safe hole at her feet | 2.5 s | 35 %HP | get in close |

**Depth list** (page 11 §22.2): ① `mech_encase_mark` Ice Bell: encased 2 s · ② `mech_silence_pulse` Bell Hush: 3 s · ③ `mech_rotating_beam` a frost beam sweeping 25 m.
**Loot:** `it_ice_bell_staff` (staff), `it_rune_bone_circlet` (cloth helm), `uq_yrsas_bell` **[D-EXCL]** — off-hand: your interrupts also remove 2 stacks of any stacking debuff from allies within 10 m.

### Main bosses

#### B1 · `b_skarr_icebreaker` — Skarr Icebreaker

| Field | Value |
|---|---|
| Body | chibi2 giant ×2.2, Stonehide chieftain, horned ice helm, a two-handed hammer of glacier-blue stone |
| Health | 118 H |
| Phases | 100–50% · 50–0% (the whole camp floor becomes ice) |
| Teaches | **slippery floors** and **falling hazards** |
| Enrage | 7:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Glacier Hammer | all | melee | — | 18 %HP | — |
| **Shatter the Floor** | all | 3 red circles 6 m turn the floor to **ice** (20 s) and a **cross** of cracks 2 m × 20 m from each | 2.5 s | 30 %HP | step off the cross lines; you will **slide** on the ice after |
| **Icicle Storm** | all | 12 red circles 3 m | 2.0 s | 25 %HP each | move — on ice, move early |
| Brazier Kick | all | kicks the camp's brazier (the only warmth) across the room | 1.5 s | — | the group follows the warmth |
| Charge | P2 | red line 4 m × 30 m, on the ice he slides 8 m past the end | 2.0 s | 35 %HP + knockback | aside |

**Dialog:** pull (banner) — "Rimehold's wall will break. Your heads first." · Shatter ⚠ — "Ground breaks!" · Icicle ⚠ — "Look up, little ones!" · death — "Seidra... sing it... louder..."
**Challenge:** Brazier Kick puts the brazier out for 10 s. **Deep tuning:** Icicle Storm hits 16.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` 3 ice boulders · ② `mech_hurl_player` Icebreaker's Throw: 12 m, onto ice · ③ `mech_encase_mark` Frozen Grip: encased 2 s.
**Loot:** `it_glacierstone_hammer` (two-handed mace), `it_horned_ice_helm` (heavy helm), `set_rimewarden_furs` piece (legs), `uq_icebreakers_cleats` **[D-EXCL]** — feet: immune to slipping on ice; +10% move speed on snow and ice.

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
**Challenge:** 2 pillars sing at once in P3.
**Challenge (from r02 *The Council of Cold*, "Glacial Beam"):** **Rime Beam** — every 35 s a white line is drawn from Seidra to the **healer** for 3.0 s, then a frost beam fires along it for 4 s: 8 %HP a second and +1 Chill a second to the healer. A second player who **steps into the beam** between them takes **half** (4 %HP a second) and the healer takes nothing — but the blocker gains 2 Chill. The line is always drawn before it fires. Counterplay: one named blocker (a Damage player with a defensive, or the tank if Seidra is facing away), standing next to a lit brazier. (The raid version needed a tank to body-block a 6 s beam on a healer among twenty; here it is one beam, 4 s, any blocker.)
**Deep tuning:** relighting takes 2.5 s.
**Depth list** (page 11 §22.2): ① `mech_encase_mark` Rime Cage: encased 2 s · ② `mech_add_swarm` 6 Frost Shards · ③ `mech_silence_pulse` Held Breath: 3 s.
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
| Rime Claw | all | melee + **Frostbite** stack (−5% healing, max 8) | — | 16 %HP | tank handoff at 4 (Challenge) |
| Tail Sweep | all | 180° red cone behind, 9 m, + knockback onto the ice | 1.5 s | 25 %HP | beside it |
| **Frost Breath** | P1, P3 | 60° red cone 20 m, sweeps 90° left to right | 2.5 s | 12 %HP / 0.5 s + 2 Chill a second | move with the sweep |
| **Hoarfrost Bombard** | P2 | from the island: yellow **targeted** 5 m on 3 players and 2 orange **soaks** (2 pips) | 3.0 s | 30 %HP / 80 %HP if short | spread, soak |
| Whelps | P2 | 4 Rime Whelps; each dead whelp leaves a 3 m slippery ice patch for 15 s | 1.5 s | — | kill them away from the group's path |
| **Glacier Crack** | P3 | the floor splits into 4 ice floes; a red **line** 3 m wide along a crack | 3.0 s | 110 %HP (one-shot: into the crevasse) | stay off the drawn crack |
| Cold | all | Chill rules; the room has 2 **fire vents** (beneficial warmth) that go out after each Glacier Crack and relight after 20 s | — | — | — |

**Dialog** (Rimefang growls; **Seidra's echo** speaks for it): pull (banner) — "Who woke me? ...You did. Then you are breakfast." · Breath ⚠ — (a long inhale; banner "Rimefang draws breath!") · Glacier Crack ⚠ (banner) — "The glacier breaks!" · death — (a roar that cracks the far wall — see Secret)
**Challenge:** Frost Breath sweeps both ways. **Deep tuning:** Glacier Crack's line is 4 m wide instead of 3 m.
**Depth list** (page 11 §22.2): ① `mech_wind_push` Wing Gale: pushed 6 m across the ice · ② `mech_encase_mark` Hoar Cage: encased 2 s · ③ `mech_rolling_boulders` ice chunks roll off the island.
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
| Ancient Claw | all | melee + Frostbite | — | 18 %HP | tank handoff |
| **Blind Hunt** | all | she hunts by **sound**: the player who used the most abilities in the last 5 s is **targeted** (yellow 6 m) | 2.5 s | 40 %HP | casters slow down; the targeted player moves out |
| **Winter's Memory** | all | room-wide cold: +1 Chill every 2 s for 10 s; the 4 brazier-spirits (small green 3 m **beneficial** zones that drift around the room at 1 m/s) keep you warm | — | — | follow the drifting warmth |
| Ice Age | P2+ | checkerboard of ice (slippery) and red (danger) cells | 3.0 s | 50 %HP on red | stop on a safe cell — on ice, stop early |
| **Last Winter** | P3 | orange **soak** 6 m, **5 pips** (everyone) — then Frost Breath at whoever was **not** in it | 4.0 s | 120 %HP if short (one-shot) | everyone in |

**Dialog:** pull (banner, old, slow) — "My son was loud. You are loud too." · Blind Hunt ⚠ — "I hear you." · Last Winter ⚠ (banner) — "Huddle, little warm things." · death — "Warm... it was... warm..."
**Depth list** (page 11 §22.2): ① `mech_rotating_beam` Cold Breath sweeping 25 m · ② `mech_wind_push` Winter Wind · ③ `mech_encase_mark` Ice Nest: encased 2 s.
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
| Levels | 42–45 (opens at 41) · Challenge 60 · Depth 1–35 (level 60 at Depth 5; §2.4) |
| Looks | `flooded` (reuse) with cathedral stone (§22 `flooded_cathedral`: salt-white stone, barnacles, stained glass lit green from the sea, glowing sea-anemones along the waterline) |
| Entrance | **the Bell Tower** of old Saltdeep, sticking out of the sea 3 km off Saltmarch; a causeway is dry for 20 minutes in every hour of server time (low tide; any time with the Saltmarch boat, a Travel Method stop at the tower, page 20). Enter through the belfry and go **down**. |
| Quest giver | `npc_sister_maren_saltwhistle`, Saltmarch's last priestess |
| Story quest | `q_the_bell_under_the_sea` — "The Bell Under the Sea": the drowned bell of Saltdeep rings on the hour and the dead walk up the beach each time. Silence it |
| Run time target | Normal 32 min · Challenge 32 min (no timer; the journal records your best time) |
| Brazier Shrines | Belfry · after Deacon Mourne · after the Choir of Brine |
| Rarity slots (§2.9) | **C** Cloister (pack 2 or 4) · **C** Spiral Stair (1) · **R** Cloister garden (the Barnacled Templar of pack 3) · **G** Chapter House (5) · *Challenge:* **C+** the Cloister patrol · **R+** Chapter House (its Barnacled Templar) · **W** Cloister (the pack that did not get the champion) · *Depth rooms:* Spiral Stair, Cloister |
| Main family (page 10) | **drowned** · also undead, beast |
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
| Belfry | 14×14, open to the sky | S1; **hymn page 1** at the very top of the belfry ladder (climb, hold E) |
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
| `m_beast_saltshell_crab` | Saltshell Crab | creature beetle ×1.5 re-skinned as a crab (new `crab` type, §22) | 1.2 | **Pincer** 10 %HP + disarm 2 s. Sidesteps behind the tank. |
| `m_beast_deep_eel` | Deep Eel | creature snake ×2.2, pale | 1 | only in water; **Shock** chains to 2 players within 6 m, 8 %HP each. |
| `m_drowned_lantern_gulper` | Lantern Gulper | creature frog ×2.2, deep-sea colours, a glowing lure on a stalk (new feature `lure`, §22) | 1.8 | **Lure**: its light charms the nearest player to walk to it 2 s; **Gulp** 25 %HP. Kill the lure (0.3 H) to stop both. |
| `m_drowned_brine_elemental` | Brine Elemental | creature elemental ×1.5, seawater | 1.5 | **Undertow**: 6 m circle pull toward it over 2 s, then 12 %HP. |
| `m_drowned_salt_lamprey` | Salt Lamprey | creature worm ×0.8, grey | 0.4 | latches (as d02's leech), 3 %HP a second. |

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

**Depth list** (page 11 §22.2): ① `mech_silence_pulse` Great Clang: 3 s · ② `mech_knockback_nova` Bell Shock: 8 m (never off the platform — the edge has a rail at Depth) · ③ `mech_swap_places` Wrong Rope: two players swap.
**Loot:** `it_bell_rope_wraps` (light hands), `it_hobbs_hand_bell` (off-hand), `uq_ringers_earplugs` **[D-EXCL]** — helm: immune to silence; +10% resistance to room-wide damage.

#### s2 · `b_saltshell_matron` — The Saltshell Matron

Body: creature crab (new) ×4.0, barnacle-crusted, one giant claw. Health 42 H. Crab Crypts (tidal). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Great Claw | melee + disarm 3 s | — | 16 %HP | — |
| **Brood Tide** | at each High tide, 6 Saltshell Crabs | 1.5 s | — | kill at Low tide before High |
| **Shell Up** | while the room is at Low tide: −80% damage taken | — | — | burn her during High (swimming, no roll — careful) |

**Depth list** (page 11 §22.2): ① `mech_add_swarm` 6 Saltshell hatchlings · ② `mech_grab_hold` Claw Grip: held 2 s · ③ `mech_undertow_pool` a crypt drain 6 m.
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
**Challenge:** Litany every 4 s.
**Challenge (from r03 *The Unsung*, "Unsaid"):** **Last Rites** (i) — once a minute Mourne casts a 4.0 s gold-bordered cast that looks like a Litany but is voiced differently: *"Let me finish."* It must **not** be interrupted: if it completes it only heals him 2%, but interrupting it **silences the whole party for 5 s** (and the next Litany lands on silenced interrupters). The cast bar shows a small open hand instead of the Litany's book. Counterplay: the interrupt order skips it; the caller says "hold". (The raid version was the whole encounter's rule; here it is one cast a minute inside an interrupt-rotation fight, which is exactly where holding back is hard.)
**Deep tuning:** an un-interrupted Litany also heals him 3%.
**Depth list** (page 11 §22.2): ① `mech_void_growing` the ink spreads 0.5 m every 5 s · ② `mech_add_wave` 2 Drowned Parishioners · ③ `mech_dispel_punish` Sin of the Deep: dispel it and a red 6 m burst follows.
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
**Challenge:** the lead changes every 20 s instead of 30 s.
**Challenge (from r03 *The Drowned Cantor*, "Phrase"):** **Alto's Phrase** — while the Alto leads, the loft floor is marked in **3 lanes** (painted stripes, always visible). Every 25 s she sings **3 notes**; each shows over her head as a symbol and colour for 1 s (wave / bell / gull). When the phrase ends, the lane of the **last note** turns blue (**safe zone**) and the other two turn red (2.0 s), 45 %HP. From 50% she conducts: a gold glow on her **left** hand means the **first** note's lane is safe instead. (The raid version had 5 lanes and 4-note phrases for twenty; here it is 3 lanes, 3 notes, and only while the Alto leads.)
**Deep tuning:** Harmony at 10%.
**Depth list** (page 11 §22.2): ① `mech_shockwave_ring` a ring of sound with one gap · ② `mech_silence_pulse` Rest: 3 s of silence · ③ `mech_chain_lightning` Harmonics: marks 3, jumps within 8 m.
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
| Crozier | all | melee + **Salt Sore** (−5% healing, max 10) | — | 18 %HP | tank handoff at 5 (Challenge) |
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
**Challenge:** Call to Worship safe zones 6 m. **Deep tuning:** False Bell from the start.
**Depth list** (page 11 §22.2): ① `mech_undertow_pool` a tide pull at the altar, 6 m · ② `mech_curse_spread` Salt Curse: spreads within 5 m (dispellable) · ③ `mech_add_swarm` 6 Salt Lampreys.
**Loot:** `it_coral_mitre` (cloth helm), `it_bell_clapper_crozier` (staff), `it_saltdeep_rosary` (neck), `set_tidebound_vestments` pieces (chest, helm), `soul_the_full_church` **[D-EXCL]** — soul (jewellery socket, Support and Healer builds; was the trinket `uq_the_full_church`): when a boss fight starts and again at each boss phase change, every ally within 15 m gains +10% damage for 10 s, +2% more for each ally beyond 2 (90 s cooldown). `leg_bell_of_saltdeep` **[D-EXCL]** — off-hand legendary: every 20 s you ring a bell: allies within 10 m gain a barrier of 8% max health and enemies within 10 m are silenced 2 s.

### Secret boss — `b_the_tidewife` — The Tidewife

**Unlock (collect + dialog):** carry all **3 hymn pages** (Belfry top; under the 7th left pew in the Nave at **Low** tide; the
Chapter House confessional) and choose the **confession** reply at the Bishop's 20%. The font behind the altar rises into the
**Tidewife's Font**. (The Tidewife is what the Drowned pray to. She sinks rather than dies — a thread page 14 may pick up later; the old raid it pointed at is in `WISHLIST.md`.)
Journal hint: *"The bishop kept a diary. It's in three pieces, and one is under the water — except when it isn't."*

| Field | Value |
|---|---|
| Body | chibi2 human ×3.0, woman of seawater (material `seawater_body`, §22), hair as kelp, a crown of drowned bells |
| Health | 190 H |
| Phases | 100–65% · 65–30% · 30–0% ("High water") |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Wave Slap | all | melee + Salt Sore | — | 18 %HP | tank handoff |
| **Her Own Tide** | all | the Font's water rises and falls every 45 s (Low/High); at High only **3 air pockets** exist | — | Drowning | share pockets |
| Undertow Ring | all | **moving wave** inward from the walls | 2.0 s | 25 %HP + pulled 5 m | roll through (or swim over at High) |
| **Bells of the Drowned** | all | three bells on her crown: she rings one; its **matching** quarter of the room is safe (Low/Middle/High sound cues + colours) | 3.5 s | 100 %HP | hear and go |
| Kelp Snare | P2+ | white **tethers** from the floor to 2 players; a teammate breaks | 1.5 s | 4 %HP a second + Drowning | break |
| **High Water** | P3 | orange **soak** 6 m, **4 pips**, placed **under** the High tide water line (soakers swim) | 4.0 s | 110 %HP if short | four in, air pockets after |

**Dialog:** pull (banner) — "He gave me a whole town. What will you give me?" · Bells ⚠ — "Which bell calls you home?" · death — "The sea... keeps... what it's given..." *(she sinks, she does not die)*
**Depth list** (page 11 §22.2): ① `mech_rotating_beam` a tide jet sweeping 25 m · ② `mech_undertow_pool` a whirl 6 m · ③ `mech_add_swarm` 6 Salt Lampreys.
**Loot:** `it_kelp_crown` (light helm), `it_tidewife_band` (ring), `uq_what_the_sea_keeps` **[D-EXCL]** — ring: when you would take a hit over 40% of your health, 20% of it is taken over 4 s instead (30 s cooldown). **`leg_heart_of_the_tidewife` [SECRET] [D-EXCL]** — chest legendary: you breathe water (no Drowning), swim at full speed, and your spells cast while swimming deal +15%.

### Set dropped here

`set_tidebound_vestments` — Tidebound Vestments (4 pieces: legs, hands, chest, helm; cloth). Brief: 2 = your interrupts' cooldowns are 2 s shorter, 4 = a successful interrupt gives the whole party +5% damage for 6 s.

---

## d12 — The Unmade Workshop

### Card

| Field | Value |
|---|---|
| id | `d12_unmade_workshop` |
| Region | The Riftmarch (`riftmarch`) |
| Levels | 48–51 (opens at 47) · Challenge 60 · Depth 1–33 (level 60 at Depth 3; §2.4) |
| Looks | `vault` (reuse; violet rift light) and **workshop** (new `rift_workshop`: brass, benches, half-built machines hanging from chains, rooms that float apart with void between — §22) |
| Entrance | **Oddrin's Island**, a floating stone chained to the ground 2 km east of Waystone Camp; a waystone lift carries you up (the lift is the door) |
| Quest giver | `npc_riftwatch_archivist_toma_quill`, Waystone Camp |
| Story quest | `q_the_unfinished` — "The Unfinished": the rift in the Riftmarch started in one room. Find it |
| Run time target | Normal 33 min · Challenge 33 min (no timer; the journal records your best time) |
| Brazier Shrines | Lift Landing · after the Gravity Engine · after the Mirror Apprentices |
| Rarity slots (§2.9) | **C** Assembly Line (pack 2) · **C** Scrap Yard (pack 3) · **R** Scrap Yard (the Unmade Thing of pack 4) · **G** Drafting Room (5) · *Challenge:* **C+** Assembly Line (pack 1) · **R+** Assembly Line (a Half-Made Golem of pack 1) · **W** the Scrap Yard's west platforms (a wild pack of 6 Scrap Swarm, Challenge only) · *Depth rooms:* Assembly Line, Scrap Yard |
| Main family (page 10) | **construct** · also rift, folk |
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
| Lift Landing | 14×12 | S1 |
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
| `m_rift_rift_tatter` | Rift Tatter | creature wraith ×1.5, violet-black, edges flickering | 1.2 | **Rift Step**: teleports behind a player; **Unmake**: 12 %HP + −10% max health for 10 s (stacks 3). |
| `m_rift_rift_shard` | Rift Shard | creature shard ×1.4, violet | 0.8 | **Tear**: opens a 2 m portal under a player: 1.5 s, they drop through and land 10 m away at a random spot. |
| `m_rift_unmade_thing` | Unmade Thing | creature horror ×1.6, half-constructed: brass ribs, tentacles | 2 | **Grasp** 12 %HP + root 2 s; **Undoing**: 6 m **void zone** where it dies, 20 s. |
| `m_construct_mirror_mannequin` | Mirror Mannequin | chibi2 human ×1.2, mirror-glass skin, no face | 1.2 | **Copy**: copies the last ability a player used on it, once (the ability's shape and damage, at 50%). |
| `m_folk_riftwatch_deserter` | Riftwatch Deserter | chibi2 human (any), Riftwatch coat, rift staff | 1 | **Rift Bolt** 12 %HP; **Step Away** (teleports 10 m) when a melee attacker reaches it. |

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

**Depth list** (page 11 §22.2): ① `mech_spark_runner` cog sparks · ② `mech_rotating_beam` a piston arm sweeping 25 m · ③ `mech_ground_spikes` a rivet line toward a player.
**Drops (100%):** **the Cogheart** (`it_automaton_cogheart`, secret part 1). **Loot:** `it_brass_piston_gauntlets` (heavy hands), `it_cog_shield` (shield), `soul_perpetual_cog` **[D-EXCL]** — soul (weapon socket; was the trinket `uq_perpetual_cog`): every 10 s in combat, +2% attack speed (max 10%); lost after 5 s out of combat.

#### s2 · `b_mira_lensgrinder` — Mira Lensgrinder

Body: chibi2 halfling ×1.6 (Oddrin's apprentice), goggles with six lenses, a lens-staff. Health 44 H. Lens Grinding Room (optional). Enrage 4:30.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Focus Beam | red line 1 m × 30 m that **tracks** the tank slowly (turns 30°/s) for 4 s | 1.5 s | 6 %HP / 0.5 s | others stay out of its sweep |
| **Portal Lens** | opens 2 portals; she fires Focus Beams **through** them (a beam enters one ring and leaves the other) | 2.0 s | as above | watch both ends |
| Magnify | yellow **targeted** 5 m on 1 player | 2.0 s | 30 %HP | spread |

**Dialog opportunity — "The apprentice"** (at 40%): "He's not *evil*. He just can't stop. Will you stop him — or will you *finish* him?" · "We'll stop him." → she gives up the **Rift Lens** and leaves (no gear loot). · "We'll finish him." → fight on; the lens drops at 100% anyway.
**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Pin Beam: 30 m, root 1 s · ② `mech_null_field` Dead Lens: a 10 m circle, no spells, 10 s · ③ `mech_swap_places` Lens Swap through two portals.
**Drops (100%):** **the Rift Lens** (`it_automaton_rift_lens`, secret part 2). **Loot:** `it_six_lens_goggles` (cloth helm), `it_lens_staff` (staff), `uq_through_the_lens` **[D-EXCL]** — off-hand: your line-shaped spells go 50% further.

### Main bosses

#### B1 · `b_the_gravity_engine` — The Gravity Engine

| Field | Value |
|---|---|
| Body | a construct: a brass sphere 5 m wide in the room's middle, hanging from nothing, with four arms (new model `gravity_engine`, §22) |
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
**Challenge:** flips every 20 s from the start. **Deep tuning:** Scrap Rain also hits the floor you are on.
**Depth list** (page 11 §22.2): ① `mech_launch` Gravity Well: red 4 m, launched up 3 m · ② `mech_pull_in` Mass Pull: 2 m/s for 3 s · ③ `mech_spark_runner` loose ball-bearings.
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
**Challenge:** copies use 4 spells.
**Challenge (from r03 *The Unsung*, "Echo"):** **Glass Memory** — every 15 s the mirrored walls show where each player stood **8 s ago**, and that spot lights as a red 3 m **danger zone** (2.0 s warning; the old you is drawn in the glass). 30 %HP. Counterplay: keep moving in a loop and never come back to a spot inside 8 s; combined with Reflect You it means the player killing their own copy must not stand still. (The raid version ran every 10–15 s for twenty players in a silent room; here the room keeps its sound and the circles are small.)
**Deep tuning:** copies use the player's **current talents** too.
**Depth list** (page 11 §22.2): ① `mech_swap_places` Wrong Glass: two players swap · ② `mech_gaze` Look Away: dazed 3 s · ③ `mech_spread_mark` Shards: yellow 5 m on 2.
**Drops (100%):** **the Voice Box** (`it_automaton_voice_box`, secret part 4). **Loot:** `it_mirror_glass_mask` (medium helm), `it_seventh_try_blade` (sword), `set_unmakers_apron` piece (chest), `uq_look_at_yourself` **[D-EXCL]** — ring: your first damaging spell each fight is cast twice (the second at 40%).

#### END · `b_oddrin_the_unmaker` — Vell Oddrin, the Unmaker

| Field | Value |
|---|---|
| Body | chibi2 human ×1.8, old, wild hair, a harness of brass arms (four extra), the **Unmaking Engine** behind him (a 12 m machine, new model `unmaking_engine`, §22) |
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
**Challenge:** Portal Net has 6 portals. **Deep tuning:** Unmake the Floor and Invert together once per phase.
**Depth list** (page 11 §22.2): ① `mech_swap_places` Transposition · ② `mech_null_field` Unmade Ground: no spells in 10 m, 10 s · ③ `mech_add_wave` 2 Half-Made Golems.
**Loot:** `it_brass_arm_harness` (medium chest — 4 extra arms, cosmetic), `it_unmakers_rod` (wand), `it_rift_shard_ring` (ring), `set_unmakers_apron` pieces (helm, hands), `soul_oddrins_last_letter` **[D-EXCL]** — soul (armour socket: feet; was the trinket `uq_oddrins_last_letter`): once every 45 s your dodge roll becomes a step through a portal to a point 20 m ahead, leaving a return portal for 6 s. `leg_the_unmaking` **[D-EXCL]** — two-handed legendary (staff or weapon, looter's type): every 30 s your next hit **unmakes** the target's defences: −30% armour and resistances for 8 s (bosses: −15%).

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
| Brass Hand | all | melee + grabs the tank 2 s | — | 20 %HP | tank handoff on Challenge when grabbed |
| **Cogheart Pulse** | all | a **moving wave** ring from it, 6 m/s, with a 4 m gap that turns like a cog | 2.0 s | 30 %HP | follow the gap |
| **Lens Eye** | P2+ | Focus Beam that goes **through portals** (4 in the room) | 2.0 s | 8 %HP / 0.5 s | read exits |
| **Voice** | P3 | it speaks with **your** voices: calls a player's name — that player is **targeted** (yellow 6 m) and must go stand in a portal before 3 s | 3.0 s | 60 %HP to everyone within 6 m of them if they don't | through a portal |
| **Finished** | P3 | Invert + Unmake the Floor + a soak (4 pips) in sequence, 4 s apart | 3.0 s each | as each | the recap |

**Dialog:** pull (banner, a voice built from Oddrin's recordings) — "Hello. I was going to be a door. Then a sword. Then a son. I am all of them." · Voice ⚠ — "*<player name>*." · death — "Thank you... for finishing me."
**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Lens Bolt: 30 m, root 1 s · ② `mech_null_field` Silent Heart: 10 m, 10 s · ③ `mech_echo_repeat` its Cogheart Pulse repeats 1.5 s later.
**Loot:** `it_automaton_plating` (heavy chest), `it_violet_lens_eye` (off-hand orb), `uq_cogheart` **[D-EXCL]** — neck: +4% haste; every 20th hit you land winds you up: +20% haste for 4 s. **`leg_the_finished_thing` [SECRET] [D-EXCL]** — hands legendary (was a trinket): every 120 s, the first time you use your slot-6 spell a **brass double** of you steps out for 12 s and copies your abilities at 40% power.

### Set dropped here

`set_unmakers_apron` — The Unmaker's Apron (4 pieces: legs, chest, helm, hands; medium armour). Brief: 2 = +10% damage for 4 s after you take a portal or are moved by a flip/knockback, 4 = your dodge roll can pass through one enemy telegraph without being hit once every 20 s (shown as a violet charge).

---

## d13 — Cindergate Bastion

### Card

| Field | Value |
|---|---|
| id | `d13_cindergate` |
| Region | Kingsfire (`kingsfire`) |
| Levels | 54–57 (opens at 53) · Challenge 60 · Depth 1–31 (level 60 at Depth 1; §2.4) |
| Looks | `cinderworks` (reuse) and **bastion** (new `kingsfire_bastion`: black basalt walls, red-glass arrow slits, chains, lava channels — §22) |
| Entrance | **the Cindergate**, the fortress across the Ashfall Pass 5 km north of Last Light. Last Light's siege line is dug in before it; the party goes in through a breach the sappers opened. |
| Quest giver | `npc_marshal_idra_vance`, Marshal of Last Light |
| Story quest | `q_break_the_cindergate` — "Break the Cindergate": open the gate from inside so Last Light's army can march on the Fire Court (d15) |
| Run time target | Normal 35 min · Challenge 35 min (no timer; the journal records your best time) |
| Brazier Shrines | the Breach · after Gatekeeper Varrow · after the Slag Colossus |
| Rarity slots (§2.9) | **C** Undercroft (pack 1) · **C** Barracks of Ash (pack 3) · **R** Barracks of Ash (the Gate Brute of pack 4) · **G** Undercroft (pack 2) · *Challenge:* **C+** the Barracks patrol · **R+** Undercroft (the Magma Elemental of pack 2) · **W** Ballista Walk's approach (a wild pack of 3 Legionnaires, Challenge only) · *Depth rooms:* Undercroft, Barracks of Ash. The Chain Room pack (5) never gets a slot. |
| Main family (page 10) | **kingsfire** · also demon, construct |
| New lessons | **multi-soaks** (several soaks at once, the group must split right), **overlapping patterns**, **hard tank handoffs** (a debuff that kills the tank if not swapped) |

### Story hook

The **Kingsfire Legion** holds the only pass into Kingsfire with a fortress called the Cindergate. Marshal Idra Vance has thrown
Last Light's army at its walls for a month. Her sappers finally opened a breach in the undercroft, and the last knight who went through
it — Ser Aldric Moor, carrying the **Standard of Last Light** — did not come out. The gate's mechanism is at the top of the bastion,
guarded by the Lord Castellan himself. Open it, and the Fire Court is next.

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
| the Breach | 12×12, rubble | S1 |
| Undercroft | 20×40, lava channels (2 m wide, **void zones**: 8 %HP / 0.5 s) | packs 1–2; **Ser Aldric's body** with the **Standard** (see Secret) |
| Barracks of Ash | 30×30 | packs 3–4 |
| The Inner Gate | 30×24, a portcullis in the middle | B1 Varrow |
| Ballista Walk | 8×50, wall-top, 3 siege ballistas | s1 Torven (optional) |
| The Slag Works | 34×30, lava channels in a grid | B2 the Slag Colossus; S2 before it |
| The Muster Hall | 32×32 | B3 Commander Kaelis |
| Pyre Chapel | 18×20 | s2 Ilsabet (optional) |
| Chain Room | 14×14, the gate chains | S3, pack 5 |
| The Gate Mechanism | 40×36, great wheel and chains, open to the sky and the red glow of Kingsfire | END Lord Castellan Vorhane |
| The Gate's Heart | 30×30, inside the gate's furnace core | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_kingsfire_legionnaire` | Kingsfire Legionnaire | chibi2 human, black plate with red-glass inlay, tower shield, short sword | 1.5 | **Shield Wall**: packs of 3+ legionnaires side by side take −40% damage from the front. **Stab** 10 %HP. |
| `m_kingsfire_arbalest` | Kingsfire Arbalest | chibi2 human, heavy crossbow | 1.2 | **Bolt**: red line 1 m × 35 m, 2.0 s, 30 %HP. |
| `m_kingsfire_pyre_priest` | Pyre Priest | chibi2 human, ash-grey robes, a brazier-staff | 1.2 | **Pyre Blessing** (i) 2.5 s: +30% damage and a fire shield (reflects 10%) on an ally, 15 s (dispellable). **Immolate**: 1 player, 3 %HP a second 10 s, **spreading** 4 m. |
| `m_kingsfire_knight_captain` | Kingsfire Knight-Captain (elite) | chibi2 human ×1.5, great helm, flame-edged greatsword | 4.5 | **Burning Sweep**: 180° red cone 8 m, 2.0 s, 35 %HP. **Rally**: all legionnaires within 15 m +20% damage. |
| `m_kingsfire_cinder_imp` | Cinder Imp | creature imp ×1.1 | 0.5 | groups of 4; **Firebolt** 8 %HP; **Hop** 8 m away when hit twice. |
| `m_demon_slagback_hound` | Slagback Hound | creature hound ×1.8, black with lava cracks | 1.5 | **Scorch Bite** 12 %HP + burn; on death a 3 m fire **void zone** 8 s. |
| `m_kingsfire_magma_elemental` | Magma Elemental | creature elemental ×1.8, lava | 2 | **Eruption**: 3 red circles 3 m round a player, 2.0 s, 25 %HP. Takes −50% fire damage. |
| `m_demon_gate_brute` | Gate Brute (elite) | creature titan ×1.5, fiendish, chains wrapped round the arms | 5 | **Chain Lash**: 12 m line, 2.0 s, 35 %HP + pull 5 m. **Ground Pound**: 8 m circle, 2.5 s, 40 %HP. |
| `m_construct_legion_ballista` | Legion Ballista | creature turret ×1.6 (a ballista on wheels) | 1.5 | **Siege Bolt**: red line 3 m × 50 m, 3.0 s, 70 %HP + knockback. |

| # | Room | Pack |
|---|---|---|
| 1 | Undercroft, near | 4 Legionnaires (shield wall) + 1 Pyre Priest |
| 2 | Undercroft, far | 2 Slagback Hounds + 4 Cinder Imps + 1 Magma Elemental |
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

**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Sighting Bolt: 30 m, root 1 s · ② `mech_add_wave` 2 Legionnaires · ③ `mech_meteor_rain` a mortar volley, 6 circles 3 m.
**Loot:** `it_siege_crank` (one-handed mace), `it_engineers_leathers` (light chest), `uq_torvens_sighting_lens` **[D-EXCL]** — neck: +15% damage with line-shaped attacks against targets more than 20 m away.

#### s2 · `b_pyre_priestess_ilsabet` — Pyre Priestess Ilsabet

Body: chibi2 human (woman) ×1.7, ash-white robes, a burning censer on a chain. Health 50 H. Pyre Chapel (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Censer Chain | 10 m reach | — | 16 %HP | — |
| **Immolation Chain** | **spreading** DoT on 2 players (as Pyre Priests), 4 m | — | 4 %HP a second | the two spread far; the healer dispels one at a time (each dispel jumps it once more unless the target is alone) |
| **Pyre** | orange **soak** 4 m, 2 pips **and** a red 6 m **danger zone** on her, at once | 3.5 s | 90 %HP if short / 45 %HP in the red | 2 soak, rest out |

**Dialog opportunity — "Doubt"** (at 30%): "The Fire King promised us we would not burn. Does he lie?" · "He lies. Come to Last Light." → she stops, burns her own vestments and walks out (**no loot**, but the whole party gets **Pyre-Proof**: −15% fire damage taken for the rest of the run). · "Burn, then." → fight on.
**Depth list** (page 11 §22.2): ① `mech_trail_fire` she walks a burning trail · ② `mech_dispel_punish` Pyre Hex: dispel it and a red 6 m burst follows · ③ `mech_meteor_rain` falling cinders.
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
**Challenge:** soaks are 2 / 2 / 1 + a 4th of 0 pips that is a **danger zone** (don't soak that one). **Deep tuning:** Key Turn and Three Locks overlap.
**Depth list** (page 11 §22.2): ① `mech_charge_line` Gate Rush: 20 m, 30 %HP · ② `mech_add_shieldbearer` 2 shield-bearers · ③ `mech_ground_spikes` a chain line toward a player.
**Loot:** `it_key_shaped_greataxe` (two-handed axe), `it_welded_plate_helm` (heavy helm), `set_firebreaker_plate` piece (legs), `soul_varrows_key` **[D-EXCL]** — soul (any armour socket; was the trinket `uq_varrows_key`): while you stand in a soak, allies in the same soak take 10% less from it.

#### B2 · `b_slag_colossus` — The Slag Colossus

| Field | Value |
|---|---|
| Body | creature titan ×3.2, cooling slag over a lava core, riveted legion armour plates |
| Health | 175 H |
| Phases | 100–50% · 50–0% (the plates fall: it hits harder, moves faster) |
| Teaches | **hard tank handoffs** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Molten Grip** | all | melee on tank + **Molten** stack: 1 %HP a second **per stack**, 30 s, never falls off by itself; at **6 stacks** the tank **erupts** (8 m circle, 100 %HP to everyone near, and the tank dies) | — | 18 %HP + stacks | **tank handoff** (page 11 §16) at 3–4 stacks. Stacks fall off only when the tank stops being hit for 12 s. On **Normal** the stack caps at 5 (never the eruption, page 11 §16) and the Slag Works' **quench channel** (a green **beneficial** strip, this boss's Cleansing Pool) clears stacks. On Challenge there is no quench: one of page 11's three answers — a 6 s **handoff** to anyone with a taunt (a hybrid tank, a tank follower is not allowed on Challenge), a **Brace** defensive timed for the 5th stack, or the boss's own Cleansing Pool every 45 s at the arena edge. |
| **Slag Flood** | all | the grid's lava channels overflow: a red **checkerboard** of 6 m cells | 2.5 s | 50 %HP | unlit cells |
| Rivet Burst | all | 8 yellow **targeted** 3 m circles, 1 per player + 3 random | 2.0 s | 25 %HP | spread |
| Cooling Crust | P1 | at 75% and 55%: −70% damage taken 10 s unless hit by frost (ice element) or pushed into a quench channel | 1.5 s | — | frost / knockback |
| **Collapse** | P2 | slag rains: 3 red circles 6 m **overlapping** a Slag Flood | 3.0 s | 60 %HP | the one cell outside both |

**Dialog** (none; a hiss of steam; the legion's engineers shout from the balcony): "Keep it hot!" · "Flood the channels!" (⚠ Slag Flood) · death — the engineers: "It's cooling! Run!"
**Challenge:** eruption at 5 stacks. **Deep tuning:** Molten ticks 1.5 %HP a second per stack.
**Depth list** (page 11 §22.2): ① `mech_eruption_pillars` slag under every player, 3 m, 20 %HP · ② `mech_trail_fire` a molten trail behind it · ③ `mech_rolling_boulders` 3 slag boulders.
**Loot:** `it_slag_riveted_plate` (heavy chest), `it_colossus_core_fragment` (off-hand orb), `set_firebreaker_plate` piece (shoulders), `uq_quench_seal` **[D-EXCL]** — belt: when a stacking debuff on you would reach its maximum, remove it and gain −20% damage taken for 4 s (60 s cooldown).

#### B3 · `b_commander_kaelis` — Commander Kaelis Ashfell

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.0 (a turncoat Moonwell elf in legion plate), twin flame-sabres, a red cloak |
| Health | 170 H |
| Phases | 100–65% · 65–30% (musters the legion) · 30–0% ("The Legion Holds") |
| Teaches | **overlapping patterns** |
| Enrage | 7:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Sabre Dance | all | melee, 4 hits + **Scorched** (−3% armour, max 10) | — | 4 × 6 %HP | tank handoff at 6 (Challenge) |
| **Crossfire** | all | 2 Arbalests on the balcony fire red lines 1 m × 35 m in an **X** across the hall; at the same time Kaelis's **Blade Wave** (moving wave, 5 m/s from her, a gap) | 2.5 s + 2.0 s | 30 %HP each | find the gap that is not on the X |
| **Muster** | P2 | a line of 6 Legionnaires in shield wall marches across the hall (a **moving wall**, 2 m/s): touching it = 20 %HP + pushed | 2.0 s | — | go round the ends or kill a hole in it (the wall has 2 H per legionnaire) |
| Fire Order | P2+ | 3 **targeted** yellow circles 5 m + 1 soak (3 pips) | 3.0 s | 30 %HP / 90 %HP if short | spread and soak at once |
| **Hold the Line** | P3 | room-wide (u) 4 s; **safe zone**: behind the Legionnaires' shields (blue arcs 3 m behind each surviving legionnaire) — keep 2 alive on purpose | 4.0 s | 110 %HP | a real choice: leave shields standing |

**Dialog opportunity — "The turncoat"** (at pull, only if a player is an **Elf**): "Sister of the Moonwell. Come over — the Fire King keeps his promises." · "The moon keeps better ones." → she hesitates: −10% health. · "What did he promise you?" → "That I'd never be cold." Fight normally; her death line changes. · (no elf) no dialog.
**Dialog:** Crossfire ⚠ — "Archers, cross!" · Muster ⚠ (banner) — "LEGION, ADVANCE!" · Hold the Line ⚠ (banner) — "Shields up! Hold them!" · death — "Cold... he said... never cold..."
**Challenge:** Muster walls from both ends. **Deep tuning:** Fire Order and Crossfire in the same 3 s.
**Depth list** (page 11 §22.2): ① `mech_arrow_pin` Arbalest Pin: 30 m, root 1 s · ② `mech_trail_fire` a burning trail behind her dash · ③ `mech_mark_of_prey` Commander's Mark.
**Loot:** `it_flame_sabre` (one-handed sword, pair), `it_turncoats_cloak` (back), `set_firebreaker_plate` piece (hands), `uq_never_cold` **[D-EXCL]** — heavy hands (was wrists): immune to Chill and freeze; +15% fire damage taken (a real trade, marked in red on the tooltip).

#### END · `b_castellan_vorhane` — Lord Castellan Vorhane

| Field | Value |
|---|---|
| Body | chibi2 human ×2.6, ornate black plate with a furnace in the chest (glowing grille), a flaming tower-shield and a war-pick |
| Health | 220 H |
| Phases | 100–70% · 70–45% (the gate wheel turns: the floor rotates slowly, 6°/s) · 45–20% · 20–0% ("The Gate Falls") |
| Enrage | 8:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| War-Pick | all | melee + **Pierced** stack (+10% damage taken from him per stack, max 10) | — | 20 %HP | **hard tank handoff at 4** (Challenge); Normal: a quench grate by the wheel clears it |
| **Furnace Heart** | all | his chest opens: a 60° red cone 25 m | 2.5 s | 60 %HP + burn | behind or beside |
| **Garrison Soak** | all | 2 orange soaks (3 pips and 2 pips) at opposite ends + a yellow **targeted** on the healer | 4.0 s | 100 %HP if short | split 3/2; the healer runs from both |
| Wheel Turn | P2+ | the floor rotates; every telegraph **rotates with it** (they are painted on the floor) | — | — | move with the floor |
| **Chain Snap** | P3 | 4 gate chains snap and whip: 4 red lines 2 m × 36 m that sweep 90° | 2.5 s | 50 %HP | stand where no chain sweeps (the chain anchors glow) |
| **The Gate Falls** | P4 | every ability at once on a 20 s loop, the room-wide **Flood of Fire** (u) 5 s every 40 s — **safe zone** = the 2 blue rings of the gate's quench cisterns, which **move** with the wheel | 5.0 s | 120 %HP | the finale |

**Dialog:** pull (banner) — "Last Light sends its last. How fitting." · Furnace ⚠ — "Feel the fire that keeps this gate." · Garrison ⚠ — "Hold the line! Both ends!" · Chain Snap ⚠ (banner) — "Cut them loose!" · Gate Falls (banner) — "If the gate falls, it falls on YOU." · death — "The King... will... burn you... at his court..."
**After the kill:** the gate opens; Last Light's army horns sound (story state for your character: the Fire Court's gate road opens and Last Light's army camps before it — page 14; a character who has killed the Castellan gets **Last Light's Muster** in d15, §d15).
**Challenge:** Garrison Soak needs 3/3; the tank handoff at 3. **Deep tuning:** Chain Snap sweeps both ways.
**Depth list** (page 11 §22.2): ① `mech_void_line_wall` a firewall 16 m × 2 m on the wheel · ② `mech_arrow_pin` Gate Bolt: 30 m, root 1 s · ③ `mech_add_wave` 2 Legionnaires.
**Loot:** `it_flaming_tower_shield` (shield), `it_castellan_war_pick` (one-handed axe/pick), `it_furnace_grille_plate` (heavy chest), `set_firebreaker_plate` pieces (helm, chest), `soul_gate_key` **[D-EXCL]** — soul (armour socket: shield or chest; was the trinket `uq_gate_key_of_the_ember`): when a single hit takes more than 30% of your health, you and the 4 nearest allies take −20% damage for 6 s (120 s cooldown). `leg_the_cindergate` **[D-EXCL]** — shield legendary: every block builds **Heat** (max 10); at 10 your next hit releases the Furnace Heart: a 60° cone 12 m for 300% weapon damage.

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
| Flame Lash | all | melee + Pierced | — | 22 %HP | hard handoff at 4 |
| **The Standard** | all | the planted standard is a blue **safe zone** 5 m for any room-wide; the flame **moves** the standard once per phase (a white **tether** from flame to standard, 3 s) | — | — | re-plant it (carrier: hold E 2 s) |
| Kindling | all | 3 soaks (2/2/1) + 3 targeted | 4.0 s | 100 %HP short / 30 %HP | split |
| Flood of Fire | all | room-wide (u) 5 s | 5.0 s | 120 %HP | the standard |
| **Kindle** | P3 | the room is a checkerboard that **flips twice** while a cross rotates | 3.0 s | 60 %HP | the capstone pattern |

**Dialog:** pull (banner) — "A banner? Here? No one has carried a banner into me in six hundred years." · death — "Carry it... through... then."
**Depth list** (page 11 §22.2): ① `mech_trail_fire` flame trails as it moves · ② `mech_spark_runner` white sparks · ③ `mech_void_ring_wall` a ring of fire at 18 m for the phase.
**Loot:** `it_white_gold_crown` (medium helm), `it_first_flame_brand` (one-handed sword), `uq_banner_of_last_light` **[D-EXCL]** — back: allies within 10 m take 5% less damage; you take 5% more. **`leg_the_first_flame` [SECRET] [D-EXCL]** — two-handed legendary (the looter's type): your attacks set a **Kindling** mark; at 5 marks the enemy bursts into a 6 m white fire for 200% weapon damage and the fire spreads the marks to everything it hits.

### Set dropped here

`set_firebreaker_plate` — Firebreaker Plate (5 pieces: legs, shoulders, hands, helm, chest; heavy armour). Brief: 2 = +15% fire resistance, 4 = when you take a tank-swap debuff stack, gain a barrier of 2% max health per stack you carry, 5 = soaking with 2+ allies gives the soak −15% damage for everyone in it.

---

## d14 — The Ashen Reliquary

### Card

| Field | Value |
|---|---|
| id | `d14_ashen_reliquary` |
| Region | Kingsfire (`kingsfire`) |
| Levels | 58–60 (opens at 58) · Challenge 60 · Depth 1–30 (every depth is Deep; §2.4) |
| Looks | **reliquary** (new `ash_reliquary`: grey ash floors, obsidian pillars, gold reliquary niches, spark motes in the air, lit by lava seams in the walls — §22), `hoard` for the treasury |
| Entrance | **the Reliquary Steps**, inside Kingsfire caldera, 8 km north-west of Last Light: an obsidian stair down into the caldera wall. The relic door has been torn off its hinges by Legion sappers moving relics out; it stands open |
| Quest giver | `npc_keeper_oswin_ashlow` |
| Story quest | `q_the_kings_reliquary` — "The King's Reliquary": the Fire King keeps his power in relics. Break the relics before the Fire Court (d15) |
| Run time target | Normal 38 min · Challenge 38 min (no timer; the journal records your best time) |
| Brazier Shrines | the Relic Door · after the Custodian · after High Ashpriest Morvaine · after Ashwing |
| Rarity slots (§2.9) | **C** Hall of Urns (pack 1) · **C** Bone Gallery (pack 4) · **R** Censer Walk (a Burned Hero of pack 3) · **G** Hall of Urns (pack 2) · *Challenge:* **C+** Bone Gallery (pack 5) · **R+** Hall of Urns (the Relic Golem of pack 2) · **W** Ashfall Stair (pack 6, which stands 25 m from the Nave door) · *Depth rooms:* Hall of Urns, Bone Gallery. Reliquary Mimics and seal decoys never roll. |
| Main family (page 10) | **kingsfire** · also undead, construct, folk, demon, dragon |
| Lessons | **everything, layered**: each main boss recaps two earlier dungeons' lessons at once |

### The Seals (dungeon-wide, new)

Five **Reliquary Seals** (gold-and-glass reliquaries) stand in the dungeon (one per wing, marked on the map as "?" until found).
Each is a 3 H object guarded by a pack; **breaking** it (a 2 s channel after its guards die) gives the party **+3% damage and healing**
for the run and strips one ability from the Herald (END) — each seal lists which. All 5 = one part of the Secret.

### Story hook

The Fire King does not keep his power in himself. He keeps it in **relics** — bones, crowns, hearts of the kings and heroes he burned —
in a reliquary sunk in the caldera wall, tended by ash priests who never climb to the surface. Keeper Oswin of Last Light spent forty years
learning its halls; now the Legion's own sappers have broken the door to carry relics north, and Oswin wants in before they finish. Break the relics, and the Fire King walks into his own court weaker than he has been since he crowned himself. His Herald,
Sarn Veydrec, is waiting in the Reliquary to make sure you don't.

### Layout

```
                                 ? The First Fire (secret: 5 seals broken + no deaths + the Herald's parley refused)
                                            |
                       [B4] THE HERALD'S NAVE (end)
                                            |
                                  (S4) Ashfall Stair
                                            |
      [seal 5] Phoenix Nest [s2]  == [B3] THE CINDER DOME (Ashwing)
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
| the Relic Door | 14×14 | S1 |
| Hall of Urns | 30×30 | packs 1–2, **seal 1** (strips *Herald's Command* adds) |
| Censer Walk | 10×40, swinging censers (a red line swings across every 5 s: 1.5 s, 25 %HP) | pack 3, **seal 2** (strips *Fire Tithe*) |
| The Custodian's Vault | 32×32 | B1 the Relic Custodian |
| Bone Gallery | 12×44 | packs 4–5, **seal 3** (strips *Crown of Ash* phase) |
| The Ash Altar | 30×30 | B2 Morvaine; S2 before it |
| Scriptorium | 20×20 | s1 the Ash Scribe (optional), **seal 4** (strips *Burning Word*) |
| The Cinder Dome | 36×36, open to a shaft of red sky | B3 Ashwing; S3 before it |
| Phoenix Nest | 20×20, a nest of glowing coals | s2 Cinderbrood (optional), **seal 5** (strips *Rebirth*) |
| Ashfall Stair | 10×30, ash falls like snow | S4, pack 6 |
| The Herald's Nave | 42×42 | END Sarn Veydrec |
| The First Fire | 34×34 | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_kingsfire_ash_priest` | Ash Priest | chibi2 human, grey skin, eyes sewn shut, a bone censer | 1.3 | **Ash Hymn** (i) 2.5 s: heals allies 25%; **Blind Faith**: can't be blinded or charmed. |
| `m_kingsfire_ash_zealot` | Ash Zealot | chibi2 human, ash-smeared, two burning sickles | 1.5 | **Self-Immolate** at 25%: runs at the nearest player, 3 m burst after 2 s, 40 %HP. Kill or stun. |
| `m_undead_ash_wraith` | Ash Wraith | creature wraith ×1.6, grey ash, coal-red eyes | 1.5 | **Smother**: white **tether** to a player 3 s, silence + 5 %HP a second; break by distance (14 m). |
| `m_construct_relic_golem` | Relic Golem (elite) | creature golem ×2.4, obsidian with a gold reliquary chest | 5 | **Relic Slam**: 8 m circle, 2.5 s, 40 %HP. **Relic Ward**: soaks the next 20% of its health in damage every 20 s (gold shield). |
| `m_demon_cinder_cantor` | Cinder Cantor | creature imp ×1.3, with a tiny bell | 0.8 | **Chant**: +15% haste to fiends within 15 m (dispellable, stacking 3). |
| `m_beast_ash_phoenixling` | Phoenixling | creature phoenix ×1.0 | 0.7 | **Rekindle**: rises once after death at 50% unless its ash pile is stood on for 1 s. |
| `m_undead_burned_hero` | Burned Hero (elite) | chibi2 (any race) undead ×1.6 in burned plate — relics of heroes the King burned; each wears a random old dungeon set's look | 4 | **Old Technique**: uses one of: Grave Dig (d01), Tongue tether (d02), Powder Keg soak (d03), Court Dance checkerboard (d05) — shown by the icon over its head. |
| `m_kingsfire_cinder_sprite` | Cinder Sprite | creature elemental ×0.8 | 0.5 | **Flare** 3 m, 1.2 s, 12 %HP; grows as d04's Cinder Spawn. |
| `m_kingsfire_reliquary_mimic` | Reliquary Mimic | creature mimic ×1.8, a gold reliquary | 3 | disguised as a seal's decoy (2 per seal room, only 1 real seal): **Gulp** 30 %HP. 3 s of looking (hover) reveals it. |

| # | Room | Pack |
|---|---|---|
| 1 | Hall of Urns, west | 3 Ash Priests + 2 Ash Zealots |
| 2 | Hall of Urns, east (seal 1 guards) | 1 Relic Golem + 2 Ash Wraiths + 1 Reliquary Mimic |
| 3 | Censer Walk (seal 2 guards) | 2 Burned Heroes + 3 Cinder Cantors |
| 4 | Bone Gallery, near | 3 Ash Wraiths + 2 Ash Priests |
| 5 | Bone Gallery, far (seal 3 guards) | 1 Relic Golem + 1 Burned Hero + 1 Reliquary Mimic |
| 6 | Ashfall Stair | 2 Relic Golems (elite pair) + 4 Phoenixlings |
| — | Scriptorium (seal 4 guards) | 3 Ash Priests + 1 Burned Hero |
| — | Phoenix Nest (seal 5 guards) | 6 Phoenixlings + 4 Cinder Sprites |

### Sub-bosses

#### s1 · `b_the_ash_scribe` — The Ash Scribe

Body: chibi2 human ×1.8, grey, a quill of bone as long as a spear, a book of burned names. Health 60 H. Scriptorium (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Quill Stab | melee | — | 20 %HP | — |
| **Write Your Name** | writes a player's name in the book: that player gets a **tether** to the book (a reliquary lectern); at 8 s the name **burns** (60 %HP) unless the player breaks the tether (18 m) **or** an ally interrupts the Scribe (i) | 2.5 s cast (i) | 60 %HP | interrupt or run |
| Ink of Ash | 3 **void zones** 4 m, 30 s | 1.5 s | 5 %HP / 0.5 s | move |

**Depth list** (page 11 §22.2): ① `mech_silence_pulse` Blotted: 3 s · ② `mech_dispel_punish` Burned Name: dispel it and a red 6 m burst follows · ③ `mech_add_swarm` 6 flying pages.
**Loot:** `it_bone_quill` (spear), `it_book_of_burned_names` (off-hand focus), `uq_unwritten` **[D-EXCL]** — neck: once every 60 s, a hit that would kill you is written off: you take none of it and gain 2 s of immunity to that attacker.

#### s2 · `b_cinderbrood` — Cinderbrood

Body: creature phoenix ×3.6, red-gold, a nest of glowing coals under her. Health 64 H. Phoenix Nest (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Talon Dive | red line 3 m × 20 m | 1.8 s | 30 %HP | aside |
| Hatch | 3 Phoenixlings every 20 s | 1.5 s | — | kill, stand on the ash |
| **Rebirth** | at 0% she becomes an **egg** (10 H) for 10 s; if not broken, she reborns at 40% | — | — | burst the egg |

**Depth list** (page 11 §22.2): ① `mech_meteor_rain` falling coals, 6 circles 3 m · ② `mech_trail_fire` a burning dive trail · ③ `mech_add_swarm` 6 Phoenixlings.
**Loot:** `it_phoenix_down_mantle` (cloth shoulders), `it_coal_nest_ring` (ring), `uq_twice_born` **[D-EXCL]** — chest (any type): once per fight, when you would die, become an egg for 3 s (immune), then hatch at 30% health.

### Main bosses

#### B1 · `b_relic_custodian` — The Relic Custodian

| Field | Value |
|---|---|
| Body | creature golem ×3.4, obsidian and gold, four reliquary doors in its body that open (each holds a relic that powers one ability) |
| Health | 200 H |
| Phases | 100–75% · 75–50% · 50–25% · 25–0% — each phase **one reliquary door opens** and adds its ability |
| Recaps | **d03** (soak + line of sight) and **d04** (tank handoff + room-wide with safe zone) |
| Enrage | 8:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Relic Fist | all | melee + **Relic Brand** (+12% damage taken per stack, max 10) | — | 22 %HP | tank handoff at 4 (Challenge); Normal: a follower/Damage taunt |
| **Miner's Heart** (door 1) | P1+ | orange soak 5 m, 3 pips | 4.0 s | 100 %HP if short | three in |
| **Seven's Pulse** (door 2) | P2+ | room-wide (u) 3.5 s; **line of sight** behind 4 reliquary pillars | 3.5 s | 110 %HP | hide |
| **Bellows' Breath** (door 3) | P3+ | room-wide (u) 4 s; **safe zones**: 2 of 4 blue rings | 4.0 s | 120 %HP | the lit two |
| **All Doors** (door 4) | P4 | a soak and a Pulse in the same 4 s: soak **behind** a pillar (the soak spawns in a pillar's shadow) | 4.0 s | as each | both at once |

**Dialog** (a grinding voice from the reliquaries): pull (banner) — "Relics are not touched. Relics are kept." · each door (banner) — "Open the first." / "...the second." / "...the third." / "ALL." · death — "Kept... no longer..."
**Challenge:** handoff at 3; all doors open 10% earlier. **Deep tuning:** Relic Brand stacks last 5 s longer.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` 3 reliquary urns roll · ② `mech_gaze` Relic Stare: dazed 3 s · ③ `mech_null_field` Sealed Door: no spells in 10 m, 10 s.
**Loot:** `it_obsidian_reliquary_plate` (heavy chest), `it_custodian_doorkey` (neck), `set_reliquary_ash` piece (legs), `soul_four_doors` **[D-EXCL]** — soul (weapon socket, casters; was the trinket `uq_four_doors`): every 15 s your next spell gets a random one of: +30% damage, −50% cost, instant cast, +50% area.

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
**Challenge:** Litany every 3.5 s; Mark on 4. **Deep tuning:** a jumped Mark keeps its timer.
**Depth list** (page 11 §22.2): ① `mech_silence_pulse` Blind Faith: 3 s · ② `mech_add_bombers` 2 Ash Zealots run at the group · ③ `mech_void_growing` spreading ash.
**Loot:** `it_burning_skull_staff` (staff), `it_gold_wire_blindfold` (cloth helm — blinds nothing, looks like it), `set_reliquary_ash` piece (hands), `uq_eyes_sewn_shut` **[D-EXCL]** — helm: immune to blind; +10% damage for 5 s after you interrupt.

#### B3 · `b_ashwing` — Ashwing, the Reliquary Phoenix

| Field | Value |
|---|---|
| Body | creature phoenix ×5.0, grey-white ash with fire-red wing-edges (the King's first burned relic, reborn) |
| Health | 215 H (+ **Rebirth**) |
| Phases | 100–60% (grounded) · 60–20% (**airborne**: circles the dome, attacks from above) · 20–0% · **0%: Rebirth** (an ash egg, 20 H, 12 s; if it hatches, she returns at 40%) |
| Recaps | **d05** (beams + checkerboard) and **d10** (warmth — here **coolness** — stacks + falling hazards) |
| Enrage | 8:30 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Talon | P1, P3 | melee | — | 22 %HP | — |
| **Heat** (dungeon-wide in this room) | all | every 6 s outside shade +1 **Scorch** stack (−3% healing received per stack; at 10: 50 %HP and reset to 5); **shade** = the green **beneficial** shadows of 4 reliquary pillars, which move as the red sky-shaft moves | — | — | stay in shade when you can |
| **Sunbeam** | all | the sky-shaft becomes a beam (red **line** 4 m) that bounces off 4 gold reliquary mirrors | 2.5 s | 10 %HP / 0.5 s | read the path |
| **Cinder Checker** | P2 | from the air: checkerboard of red cells, flips once | 3.0 s + 2.0 s | 55 %HP | unlit → step |
| Feather Fall | P2 | 8 red circles 4 m (burning feathers) | 1.8 s | 30 %HP | move |
| **Rebirth** | 0% | an egg; burst it in 12 s | — | — | — |

**Dialog** (none; a keening cry that is the warning for Cinder Checker; the Herald's voice echoes from the Nave): "My King's first flame. Mind your eyes."
**Challenge:** the egg has 30 H. **Deep tuning:** Scorch at 8 stacks.
**Depth list** (page 11 §22.2): ① `mech_wind_push` Wing Gale · ② `mech_trail_fire` a burning dive trail · ③ `mech_spark_runner` feather sparks.
**Loot:** `it_ashwing_feather_cloak` (back), `it_flame_edge_glaive` (polearm), `set_reliquary_ash` piece (helm), `uq_first_burned_feather` **[D-EXCL]** — neck: +10% fire damage; 5% of fire damage you deal heals the lowest-health ally within 20 m.

#### END · `b_sarn_veydrec_herald` — Sarn Veydrec, Herald of the Fire King

| Field | Value |
|---|---|
| Body | chibi2 human ×2.6, gilded black armour, a burning herald's staff with a banner of the Fire King, a mask of gold with no mouth (his voice comes from the banner) |
| Health | 260 H |
| Phases | 100–75% · 75–50% · 50–25% (**Crown of Ash** — skipped if seal 3 is broken) · 25–0% ("In the King's Name") |
| Recaps | every earlier lesson; seals strip parts (see §The Seals) |
| Enrage | 9:00 |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay | Seal that strips it |
|---|---|---|---|---|---|---|
| Herald's Staff | all | melee + **Tithe** (+10% damage taken per stack, max 10) | — | 24 %HP | hard tank handoff at 4 | — |
| **Herald's Command** | all | 4 Burned Heroes (each with an Old Technique) over the fight | 1.5 s | — | kill fast | seal 1 |
| **Fire Tithe** | all | a white **tether** from each player to the Herald: 1 %HP a second while within 20 m of him; **ranged** stay far, **melee** rotate | — | — | — | seal 2 |
| **Proclamation** | all | 3 soaks (3/1/1) + 2 targeted + the d05 **cross** | 4.0 s | 100 %HP short / 30 / 45 %HP | split and dodge | — |
| **Crown of Ash** | P3 | an ash-fall phase (as d08's Oruvel): grey ash falls, the floor greys but stays readable; Thirst-style **void zones** under each player every 20 s + a **donut** every 20 s | 2.5 s | 50 %HP | — | seal 3 (phase skipped: he goes 50% → P4) |
| **Burning Word** (i) | all | 3.0 s: fears the party 3 s | 3.0 s | — | interrupt | seal 4 |
| **Rebirth** | P4 | at 0% he rises once at 15% | — | — | burst again | seal 5 |
| **In the King's Name** | P4 | room-wide **Flood of Fire** (u) 5 s every 30 s; **safe zone** = the 5 **broken seals'** ghost-lights (a blue ring for each broken seal — fewer seals, fewer safe spots, **0 seals = 1 ring at the door**) | 5.0 s | 130 %HP | stand in a seal's light |

**Dialog opportunity — "The King's offer"** (at 75% he lowers his staff; combat pauses up to 30 s):

| Reply | Result |
|---|---|
| "Tell him we're coming." | he laughs: the fight goes on. **Needed for the Secret.** |
| "What does he offer?" | "A place at his court. Kneel, and walk in the front door." — sub-choice: **"We kneel."** → the Herald leaves; the dungeon **ends** with a **reduced** reward (the end chest has 1 item instead of 1+25%, no legendary chance) and the character gets the title *"Kneeler"* (removed when you kill the Fire King in d15 The Fire Court); **"Never."** → fight on (counts as refusing). |
| (silence) | fight on (counts as refusing). |

**Dialog:** pull (banner) — "Keeper Oswin's little thieves. The King knew you would come; he let you." · Proclamation ⚠ (banner) — "Hear the King's decree!" · Crown ⚠ (banner) — "Kneel in the ash." · Burning Word ⚠ — "BOW." · Rebirth — "The King's word does not die." · In the King's Name ⚠ (banner) — "IN THE KING'S NAME!" · death — "He... is... still... burning..."
**Challenge:** handoff at 3; Proclamation adds a 4th soak (2). **Deep tuning:** In the King's Name every 25 s.
**Depth list** (page 11 §22.2): ① `mech_add_shieldbearer` 2 banner-bearers: −50% damage to him while they live · ② `mech_null_field` Silence of the Court: 10 m, 10 s · ③ `mech_mark_of_prey` The King's Displeasure.
**Loot:** `it_heralds_burning_staff` (staff), `it_gold_mouthless_mask` (medium helm), `it_fire_king_seal_ring` (ring), `it_gilded_black_plate` (heavy chest), `set_reliquary_ash` pieces (chest, shoulders), `soul_the_kings_decree` **[D-EXCL]** — soul (jewellery socket; was the trinket `uq_the_kings_decree`): once every 120 s, your interrupt also stuns every enemy within 20 m for 1.5 s (bosses: interrupted only). `leg_herald_of_ashes` **[D-EXCL]** — off-hand (banner/focus) legendary: carry a banner that plants itself when you stand still 2 s: allies within 8 m deal +8% damage and take 8% less; it moves with you when you walk away. `leg_reliquary_heart` **[D-EXCL]** — neck legendary: each relic-type buff you receive (dungeon seals, the Fire Court's Favour help, world-boss buffs) is 50% stronger.

### Secret boss — `b_ashmother_veyra` — Ashmother Veyra, Keeper of the Oldest Coal

**Unlock (three conditions):** (1) all **5 Reliquary Seals** broken; (2) **no player deaths** from the first pull to the Herald's death
(followers on Normal count); (3) at the Herald's 75% offer, **refuse** ("Tell him we're coming" / "Never" / silence). The Herald's banner
falls, burns, and opens a stair to the Hearth Below.
Journal hint: *"The King keeps relics of everyone he burned. Who kept the relic of the first fire?"*

| Field | Value |
|---|---|
| Body | chibi2 dwarf ×2.8, an old woman of living ash lit from inside by coal-light (material `living_ash`, §22), a smith's apron, carrying an iron cage with a single coal in it (the Oldest Coal) |
| Health | 280 H |
| Phases | 100–80% (d01–d04 recap) · 80–60% (d05–d08) · 60–40% (d09–d11) · 40–20% (d12–d13) · 20–0% ("The Oldest Coal") |
| Enrage | 10:00 |

| Phase | Abilities (every number as its original, at level-60 Challenge strength on Normal) |
|---|---|
| 100–80% | **Grave Dig** danger zones on 2 (d01) + **Tongue** tether (d02) + **Powder Keg** soak 3 pips (d03) + **Bellow Blast** room-wide with 2 safe zones (d04) |
| 80–60% | **King's Light** beam with mirrors (d05) + **Weigh the Guilty** scales ±1 (d06) + **Everblight** spreading DoT with a green cleansing pool (d07) + **Moon Clock** donut/star flip (d08) |
| 60–40% | **Warmaster's Challenge** duel ring (d09) + **Chill** stacks with drifting warmth (d10) + **Call to Worship** named bells, with lies (d11) |
| 40–20% | **Invert** gravity (d12) + **Molten** stacks, eruption at 5 — hard tank handoff (d13) + **Three Locks** soaks 1/2/2 (d13) |
| 20–0% | **The Oldest Coal**: the cage opens; one ability from each earlier phase fires in turn every 6 s, and a room-wide **Flood of Fire** (u) 5 s every 30 s whose **safe zone** is **the ring round her coal** (a 6 m blue ring that she carries — stay close to the boss) |

**Dialog:** pull (banner, warm and tired) — "You walked every road to get here. Let me see if you remember them." · each phase (banner) — "Do you remember the barrow?" / "...the moon?" / "...the pit?" / "...the workshop?" · The Oldest Coal (banner) — "This is the fire he stole from. Take it back." · death — "Good. Now go and put him out." (She does not die: she gives each player **the Oldest Coal** (`it_the_oldest_coal`, Quest item) — carried into d15 The Fire Court it grants **the Oldest Coal's** help there, §d15.)
**Depth list** (page 11 §22.2): ① `mech_echo_repeat` each recalled ability repeats once, 1.5 s later · ② `mech_void_ring_wall` a ring of coal-fire at 18 m for the phase · ③ `mech_spark_runner` coal sparks.
**Loot:** `it_ashmothers_coal_cage` (off-hand focus; was `it_first_ember_lantern`, light slot), `it_ashmothers_apron` (medium chest), `uq_remember_the_roads` **[D-EXCL]** — neck: +2% damage for each different d01–d16 dungeon you have finished on Challenge (max +32%). **`leg_the_oldest_coal` [SECRET] [D-EXCL]** — neck legendary (was `leg_the_first_ember`, light slot): you carry a 10 m ring of coal-warmth (a faint gold ring on the floor round you): allies inside it take 10% less damage from room-wide attacks, and once every 3 minutes a room-wide attack that would kill an ally inside it leaves them at 1 health.

### Set dropped here

`set_reliquary_ash` — Reliquary Ash (6 pieces: legs, hands, helm, chest, shoulders, + a **Challenge-only** waist that the Herald drops on Challenge; any armour type — takes the looter's). Brief: 2 = +5% damage and healing inside dungeons, 4 = allies you revive come back with 60% health instead of page 05's normal amount, 6 = the first time each boss fight you would be one-shot, survive at 1 health.

---

## d15 — The Fire Court

*(Rebuilt for five from the shelved 10/20-player raid r04 "The Ember Court"; the raid version is in `WISHLIST.md`.
Of its eight bosses, five came across — Cinderjaw, the Three Petitioners, Forge-Queen Hesta, Vaelkyr and the King —
plus the Kennelmaster as a sub-boss and the secret in the kiln. Every soak, add wave and tank rule follows §2.11.)*

### Card

| Field | Value |
|---|---|
| id | `d15_fire_court` |
| Region | Kingsfire (`kingsfire`) |
| Levels | 60 (opens at 60) · Challenge 60 · Depth 1–30 (every depth is Deep; §2.4) |
| Looks | **fire court** (new `fire_court`: a palace of black glass and gilt inside the caldera; lava channels in the floors and a lava moat round the throne — the lava is the light; fire-bowls on every pillar — §22), `cinderworks` (reuse) for the Royal Forge |
| Entrance | **the Cinder Stair**, switchbacks up the inner wall of the caldera 6 km north of Last Light, to the palace gate. Discovered by climbing to the gate, or by arriving at it by teleport (§2.3). Before the Castellan of d13 has fallen for your character, the story has the stair guarded by Legion patrols (open-world elites, page 10); the door itself is never locked. |
| Quest giver | `npc_marshal_ansel_crane`, Last Light's field marshal |
| Story quest | page 14's main-story quest **"The Fire King"** (Ch 11, was `q_ms_the_ember_king`): kill Kaedros and bring back the **Heartflame** (`it_heartflame`, the heart of the Everflame he carried here — Quest item). The main story's climax. Page 14 also offers the story instance `si_kings_last_word` for players who want the ending without the dungeon |
| Run time target | Normal 42 min · Challenge 45 min (no timer; the journal records your best time) |
| Brazier Shrines | the Palace Gate · after Cinderjaw · after the Three Petitioners · after whichever of Hesta and Vaelkyr falls second · the Ash Gallery's end |
| Rarity slots (§2.9) | **C** Outer Ward (pack 1 or 2) · **C** Ash Gallery (pack 7) · **R** Royal Forge yard (the Magma Salamander of pack 5) · **G** Eyrie crater stair (pack 6) · *Challenge:* **C+** Outer Ward (pack 3) · **R+** Ash Gallery (a Poisoner Courtier of pack 8) · **W** the Outer Ward patrol · *Depth rooms:* Outer Ward, Ash Gallery. Court Guards never roll a rarity (they are the King's own); the Throne Approach pack (9) never gets a slot. |
| Main family (page 10) | **kingsfire** (Depth warden: the Brand-General) · also folk, construct, demon, beast, dragon |
| New lessons | a boss you must **stop walking** (staggers), an **allied boss you choose**, **choices that carry forward** (Court Favour), **player-worked ballistae**, a boss that **changes body** mid-fight |

### Court Favour (dungeon-wide, new)

The court is three noble houses who serve the King and hate each other: **Ash** (the King's wife Lady Sabeth Varn and the
mourners — grief, shields), **Iron** (Chancellor Dorrin's clerks and constructs — order) and **Flame** (Flame-Priest Oruk's
fire-binders — fire, cleansing). Choices in the dungeon give **Favour** to one house; the party frame shows three small
banners with numbers. Whichever house has the **most Favour when the King is pulled** sends help in the King fight. Ties go
to Ash. Favour is per run.

| Choice | Where | Favour |
|---|---|---|
| Free the kennel pups, or leave them caged | after s1 Kennelmaster Varro | free: Ash +1 · leave: Iron +1 |
| Which Petitioner you stand with | B2 the Three Petitioners | the chosen house +3 |
| Spare Hesta's apprentice | B3 Forge-Queen Hesta, dialog | spare: Iron +1 · refuse: Flame +1 |
| Return the Consort's egg, or smash it | after B4 Vaelkyr | return: Ash +1 · smash: Flame +1 |

**Carried in from earlier dungeons** (per character; each counts if **any** player in the party has it):

| Carry-in | From | Help in the King fight |
|---|---|---|
| **Last Light's Muster** | having killed d13's Lord Castellan Vorhane | Last Light's archers line the throne-hall rim: once per phase they shoot down every Legion add of **Legion Muster** the moment it arrives |
| **The Oldest Coal** (`it_the_oldest_coal`) | d14's secret boss, Ashmother Veyra | in P4 *Last Light*, the room-wide grows +10% per cast instead of +15% |

### Story hook

Maelor Varn was the fourteenth Flame Warden, the gentlest keeper the Order ever had, until his daughter **Ysa** walked into
the Everflame for a rite that was never needed. He crowned himself **Kaedros**, carried the Everflame's heart out of the Spire
to this caldera, and began to pull the Mend open to remake the Wildmarch **without death** — so that nobody would ever lose a
daughter again. His court still petitions him every morning; his wife Sabeth still asks, politely, for Ysa back. Marshal Crane
has the army of Last Light at the foot of the Cinder Stair. The party goes up first.

### Layout

```
                                  ? THE HEART KILN (secret: Ysa's Ribbon + the Kiln Key Fragment + the King's reply)
                                           |
                             [B5] THE FIRE THRONE (end; lava moat)
                                           |
                               Throne Approach (pack 9)
                                           |
                        (S5) end of the Ash Gallery  [s2] Lady Ivrette
                                           |
                                   Ash Gallery (packs 7–8)
                                           |
                                         (S4)
                          ┌────────────────┴────────────────┐
                 [B3] THE ROYAL FORGE              [B4] THE EYRIE CRATER
                   (pack 5 before it)                (pack 6 before it)
                          └────────────────┬────────────────┘   (B3 and B4 in either order; both needed)
                                         (S3)
                                           |
                             [B2] THE PETITION HALL (3 daises)
                                           |
                                         (S2)
                                           |
         Kennels [s1] ======== Outer Ward (packs 1–4)
                                           |
                             [B1] THE GATE ROAD (Cinderjaw walks it)
                                           |
                           (S1) the Palace Gate <-- entrance (top of the Cinder Stair)
```

| Room | Size (m) | Holds |
|---|---|---|
| the Palace Gate | 16×14 | S1 |
| The Gate Road | 12×90, a straight paved road to the inner gate, walls both sides | B1 Cinderjaw (the road is the arena) |
| Outer Ward | 36×30, a courtyard of black glass | packs 1–4 |
| Kennels | 30 m round sunken pit, 6 cages on the rim | s1 Kennelmaster Varro (optional) |
| The Petition Hall | 60×20, three daises (west Ash, middle Iron, east Flame) | B2 the Three Petitioners; S2 at its door |
| The Royal Forge | 40×30, **four lava channels** (3 m wide) running east–west, iron bridges at fixed points | B3 Hesta; pack 5 in the forge yard before it |
| The Eyrie Crater | 50 m round, open to the sky, 4 broken pillars (cover), **2 harpoon ballistae** on the rim | B4 Vaelkyr; pack 6 on the crater stair |
| Ash Gallery | 14×60, lined with pyres | packs 7–8; s2 Lady Ivrette at the far end (optional) |
| Throne Approach | 12×24 | pack 9 |
| The Fire Throne | 50 m round, floor of **cinder tiles** (5 m hexes), a lava moat round the edge (falling in = 50 %HP and out at the stair) | END Kaedros |
| The Heart Kiln | 30 m dome behind the throne; 6 vents in the floor; the walls glow | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_kingsfire_legionnaire` | Kingsfire Legionnaire | (as d13) | 1.5 | as d13: **Shield Wall** in lines of 3+, **Stab** 10 %HP |
| `m_kingsfire_arbalest` | Kingsfire Arbalest | (as d13) | 1.2 | as d13: **Bolt** red line 1 m × 35 m, 2.0 s, 30 %HP |
| `m_kingsfire_pyrecaller` | Legion Pyrecaller | chibi2 orc (an Ashtusk loyalist), fire-binder's robes | 1.2 | **Pyre** (i) 2.5 s: 8 m red circle, 30 %HP. **Ignite Ally**: a Legionnaire's weapon burns, +30% damage (magic **dispel**). |
| `m_kingsfire_court_courtier` | Poisoner Courtier | chibi2 elf, silk court coat, `top_hat` | 1 | **Gift**: a curse on the healer, 3 %HP a second 10 s (curse **dispel**). **Slip Away** at 50%: untargetable 3 s and reappears 10 m away. |
| `m_kingsfire_court_guard` | Court Guard (elite) | chibi2 human ×1.5, gilded `great_helm`, halberd | 5 | **Halberd Sweep**: 180° red cone 8 m, 2.0 s, 35 %HP. **Hold the Door**: immune to knockback; taunts the nearest non-tank if its tank is more than 10 m away. |
| `m_construct_forged_legionnaire` | Forged Legionnaire | creature golem ×1.8, black iron, orange eyes | 2 | **Forge Heat**: 6 m aura, 2 %HP a second. **Quench Weakness**: takes +50% from Ice- and Water-tagged damage. |
| `m_construct_obsidian_sentinel` | Obsidian Sentinel (elite) | creature golem ×2.6, obsidian, lava seams | 5.5 | **Obsidian Shards**: 3 yellow **targeted** 5 m circles, 2.0 s, 25 %HP. **Reflect**: while its shield glows (4 s in every 15 s), 30% of spell damage comes back at the caster. |
| `m_kingsfire_cinder_elemental` | Cinder Elemental | creature elemental ×2.4, fire | 2 | **Flare** at 30%: 10 m red circle, 2.0 s, 40 %HP; leaves a 10 m **void zone** 10 s. |
| `m_kingsfire_living_cinder` | Living Cinder | creature wisp ×1.0, orange | 0.2 | swarms of 6; **Kindle**: explodes on touching a player, 8 %HP. |
| `m_kingsfire_cinder_imp` | Cinder Imp | (as d13) | 0.5 | as d13 |
| `m_beast_ash_hound` | Ash Hound | creature hound ×1.8, charcoal with coal-red eyes | 1.2 | **Fixate** a random player 8 s; **Scorched Bite** 10 %HP + burn 1 %HP a second 4 s. |
| `m_beast_magma_salamander` | Magma Salamander | creature crocodile ×2.0, dark red with lava seams | 2.2 | **Lava Wallow**: untargetable in a lava channel for 4 s. **Spit**: 6 m **void zone**, 15 s, 3 %HP / 0.5 s. |
| `m_dragon_fire_whelp` | Fire Whelp | creature drake ×1.2, red-gold | 0.8 | **Whelp Breath**: 30° cone 8 m, 1.5 s, 14 %HP; flies. |
| `m_dragon_firewing_drake` | Firewing Drake (elite) | creature drake ×2.6, wings on | 5 | **Wing Gust**: knockback 8 m. **Cinder Breath**: 60° cone 14 m, 2.0 s, 40 %HP. |

| # | Room | Pack |
|---|---|---|
| 1 | Outer Ward, gate side | 3 Legionnaires (shield wall) + 1 Pyrecaller |
| 2 | Outer Ward, well | 2 Ash Hounds + 3 Cinder Imps |
| 3 | Outer Ward, far wall | 1 Obsidian Sentinel + 2 Arbalests (on the wall walk, 4 m up) |
| 4 | Petition Hall doors | 1 Court Guard + 2 Poisoner Courtiers |
| 5 | Royal Forge yard | 2 Forged Legionnaires + 1 Magma Salamander |
| 6 | Eyrie crater stair | 1 Firewing Drake + 3 Fire Whelps |
| 7 | Ash Gallery, near | 2 Cinder Elementals + 6 Living Cinders |
| 8 | Ash Gallery, far | 2 Poisoner Courtiers + 2 Legionnaires + 1 Pyrecaller |
| 9 | Throne Approach | 2 Court Guards + 1 Obsidian Sentinel (the hardest pack in the game; pull the Sentinel away from the guards) |
| — | *patrol* Outer Ward | 2 Ash Hounds + 1 Legionnaire, 50 s loop |

### Sub-bosses

#### s1 · `b_kennelmaster_varro` — Kennelmaster Varro, with Scorch and Soot

Bodies: Varro chibi2 orc ×1.6, bone headdress, leather apron, a whip (new held part `fh_whip` — add it to
`avatar-3d/js/chibi2-weapon-ids.js`; until then `fh_sabre`); **Scorch** creature hound ×3.2, flame-orange (`burn` aura);
**Soot** creature hound ×3.2, black, trailing smoke. Health Varro 60 H, each hound 30 H. Kennels (optional). Enrage 5:00.

**Pack rule (re-tuned for one tank):** the tank holds **Varro and Scorch** together. **Soot** fixates a random non-tank for
8 s at a time and is **kited**. If Scorch and Soot come within **10 m** of each other, both gain **Pack Frenzy** (+30% damage,
stacking every 5 s). Kill the hounds first; when Varro dies any surviving hound gains +30% speed.

| Ability | Source | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Maw | Scorch, Soot | melee | — | 14 %HP | — |
| Fire Trail | Scorch | Scorch leaves a 2 m burning **void zone** trail wherever it runs, 20 s | — | 3 %HP / 0.5 s | the tank walks it in a tight circle at one edge |
| Smoke | Soot | 8 m grey smoke cloud round Soot every 30 s, 12 s: inside, you miss 50% of attacks | 1.5 s | — | the kiter drags Soot out of its own smoke |
| **Brand** | Varro | a player is **Branded** (marked aura): **both** hounds fixate them for 6 s | 2.0 s | 20 %HP a bite | the branded player runs **between** the hounds' paths, not away from both — keep them apart |
| **Whip Crack** (i) | Varro | 2.0 s cast: both hounds leap to him (merging the pack) | 2.0 s | — | interrupt |
| Kennel Doors | Varro | 2 cages open: 2 Ash Hounds | 3.0 s (the cage rattles) | as trash | area damage |

After the kill the party can **free the pups** (hold E at the 6 cages: Ash +1) or leave them (Iron +1).
**Dialog:** pull — "Hungry, my darlings? So hungry." · Brand ⚠ — "Fetch, darlings — THAT one!" · Whip Crack ⚠ — "Heel!" (the hint to interrupt) · death — "Run... run, darlings..."
**Challenge:** Brand marks **two** players, one per hound. **Deep tuning:** Pack Frenzy range 15 m.
**Depth list** (page 11 §22.2): ① `mech_trail_fire` Soot leaves a smoke trail too · ② `mech_add_swarm` 6 kennel pups (hostile until freed) · ③ `mech_mark_of_prey` Varro's Mark.
**Loot:** `it_kennel_whip` (whip, one-handed), `it_houndmaster_jerkin` (medium chest), `it_scorch_collar` (neck), `uq_varros_leash` **[D-EXCL]** — hands: your tamed beast, bound demon or controlled undead moves and attacks 15% faster and fixates your target for 4 s after you hit it. Mount `it_mount_ash_hound` (creature hound ×2.2, coal-red eyes) 2% per player.

#### s2 · `b_lady_ivrette` — Lady Ivrette, the Court Poisoner (new)

Body: chibi2 elf ×1.7 (woman), silk court gown, a fan of black lacquer, a ring of tiny vials. Health 70 H. Ash Gallery end (optional). Enrage 5:00.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Fan Cut | melee | — | 16 %HP | — |
| **Gift of the House** | a curse on 2 players: 3 %HP a second for 12 s; **dispelling** it early makes it jump to the nearest ally — unless that player stands 8 m from everyone | — | — | the cursed walk out, then dispel |
| **Toast** | 5 goblets appear on the gallery table; after 8 s any not drunk burst for 20 %HP each, room-wide. Drinking one (hold E 1 s) gives the drinker a random effect: +20% damage 10 s, or a 12 %HP poison | 2.0 s (a bell rings) | 20 %HP a goblet | drink them — the tank and healer drink last |
| Slip Away | at 60% and 30%: untargetable 3 s, reappears at a pyre; the pyre flares a 6 m red circle | 2.0 s | 30 %HP | leave the pyre she stands at |

**Dialog:** pull — "Guests. How rare. Do sit." · Toast ⚠ — "A toast — to the King's long life." · death — "Tell Sabeth... I only... poisoned the ones she asked..."
**Challenge:** Gift of the House on 3 players. **Deep tuning:** a goblet's poison is 18 %HP.
**Depth list** (page 11 §22.2): ① `mech_dispel_punish` Bitter Dregs: dispel it and a red 6 m burst follows · ② `mech_blight_cloud` a drifting perfume cloud · ③ `mech_swap_places` Change Seats.
**Loot:** `it_lacquer_fan` (off-hand focus), `it_court_silks` (cloth chest), `uq_ivrettes_gift` **[D-EXCL]** — ring: enemies with one of your damage-over-time effects on them receive 20% less healing.

### Main bosses

#### B1 · `b_cinderjaw` — Cinderjaw, the Gate That Walks

| Field | Value |
|---|---|
| Body | creature titan ×4.8, obsidian body, lava seams, a portcullis grille for a jaw, eyes of molten gold |
| Health | 220 H |
| Phases | 100–50% · 50–25% (**Grind Forward**) · 25–0% (**Grind Forward** again) |
| Teaches | a boss you must **stop walking**: staggers matter more than damage |
| Enrage | **the inner gate**: he walks the 90 m Gate Road at 0.25 m/s toward it (about 6:00). If he reaches it: *Gate Shut*, a one-shot on everyone (3.0 s warning — the gate chains rattle) |

**The stagger rule (new):** Cinderjaw is a door, not a boss, so the break-bar rule (00 §10) does not apply to him. **Every
interrupt, stun or knockback on him pushes him back 1.5 m** (each player can push once every 3 s; the push shows as a white
arrow on the road). Damage alone does not stop him. A party of five with ordinary kits has about 1 push every 2 s between them,
which is roughly what holds him still; the rest is damage.

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Twin Hammers** | all | his left fist on the tank, and his right fist on a yellow **targeted** 4 m circle on the non-tank nearest the tank | 1.8 s | 20 %HP (tank) / 25 %HP (circle) | everyone else stands at least 8 m from the tank |
| **Portcullis** | all | a red line 30 m × 4 m across the road, then a **burning grille wall** stands there 20 s (blocks movement) | 2.0 s | 50 %HP under it | do not be under it; do not get cut off behind it |
| **Magma Vent** | all | 3 circles 5 m under random players, then **void zones** for as long as he lives | 1.5 s | 4 %HP / 0.5 s | drop them **behind** him — he walks away from them |
| **Gatehouse Heat** | all | orange **soak** 6 m, **3 pips**, directly in front of him | 3.0 s | 90 %HP split; short: 40 %HP room-wide and **he steps forward 5 m** | three players soak in front of him |
| Grind Forward | P2, P3 | at 50% and 25% he speeds up to 0.4 m/s for 20 s | 2.0 s (a grinding roar) | — | save staggers for these |

**Dialog** (the Narrator; he is a gate): pull — *"The gate unhooks itself from the wall and steps forward."* · Grind ⚠ — *"It leans into the road."* · death — *"It falls across the road, and becomes a bridge."*
**Challenge:** **Molten Jaw** — every 30 s his jaw opens: a 60° red cone 20 m in front, 2.0 s, 45 %HP; the Gatehouse Heat soak is in front of him too, so soakers must time it (soak after the jaw). **Deep tuning:** Portcullis walls stand 30 s.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` 3 rubble blocks roll down the road toward the party · ② `mech_add_shieldbearer` 2 gate wardens: −50% damage to him while they live · ③ `mech_spark_runner` sparks along the lava seams
**Loot:** `it_obsidian_gate_hammer` (two-handed mace), `it_portcullis_greaves` (heavy legs), `it_lava_seam_wand` (wand), `set_kingsfire_regalia` piece (hands), `uq_cinderjaw_grille` **[D-EXCL]** — shield: blocking a hit pushes the attacker back 1.5 m (bosses: 0.5 m, 5 s cooldown).

#### B2 · `b_three_petitioners` — The Three Petitioners

| Field | Value |
|---|---|
| Body | `b_petitioner_sabeth` **Lady Sabeth Varn of the House of Ash** (chibi2 elf ×1.7, grey mourning gown, a black mourning **hood**, held orb); `b_petitioner_dorrin` **Chancellor Dorrin of the House of Iron** (chibi2 dwarf ×1.7, gilded `great_helm`, hammer + tower shield); `b_petitioner_oruk` **Flame-Priest Oruk of the House of Flame** (chibi2 orc ×1.7, bone headdress, staff) |
| Health | 120 H **each hostile** (two hostile = 240 H); all three hostile: 110 H each (330 H) |
| Phases | one; hostile petitioners must die **within 20 s of each other** (the last one standing gains +10% damage every 10 s after the first dies) |
| Teaches | an **allied boss you choose**, and choosing what that costs you |
| Enrage | 7:30 — *Contempt of Court* |

**Dialog opportunity — "Choose a house"** (at the pull — this is how the fight starts; the party votes, page 11). The three turn
to the party. Sabeth: *"You have come to petition the King. So have we. Stand with me and I will see you heard."* Dorrin:
*"The court needs order. Stand with Iron."* Oruk: *"The fire cleans. Stand with Flame."*

| Reply | Result |
|---|---|
| *Say nothing.* | **all three** fight (110 H each), no Favour — the hardest version |
| "We stand with Ash." | Sabeth fights **with** the party (an allied NPC: every 15 s she shields a random player for 20% of their maximum health); Dorrin and Oruk fight. Ash +3 |
| "We stand with Iron." | Dorrin holds one hostile for the tank (20 s at a time, then it returns); Sabeth and Oruk fight. Iron +3 |
| "We stand with Flame." | Oruk burns adds and removes one void zone every 10 s; Sabeth and Dorrin fight. Flame +3 |

The allied petitioner **can die** (it has 60 H; the hostiles aim 20% of their attacks at it). If it dies, its house loses the 3
Favour. **If Ash stood with you and Sabeth lives,** she presses **Ysa's Ribbon** (`it_ysas_ribbon`, Quest item) into a
player's hand after the fight: *"If you see him — if you see her — give it back."* (half of the Secret).

**One tank:** the tank holds both hostile petitioners side by side; they do not have to be split.

| Ability | Petitioner | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Widow's Shroud** | Sabeth | a 6 m **void zone** of grey ash that follows the targeted player for 6 s | 1.5 s | 4 %HP / 0.5 s | the target runs a line away from the group |
| **Grief** (i) | Sabeth | 3.0 s cast: 2 players fall **asleep** 6 s (a hit wakes them) | 3.0 s | — | interrupt |
| Mourning Ward | Sabeth | a shield on another petitioner absorbing 8% of its health | — | — | magic **dispel** |
| **Iron Decree** | Dorrin | orange **soak** 5 m, **2 pips** | 3.0 s | 70 %HP split | two soak |
| Shield Bash | Dorrin | melee + **Dazed** (−10% attack speed, stacks, 20 s) | — | 16 %HP | the tank clears Dazed by stepping through the **iron grate** at the hall's middle (1.5 s); Challenge: hand off for 6 s |
| **Order of Arrest** | Dorrin | a white chain from Dorrin to a player: they cannot move more than 12 m from him for 10 s | 1.8 s | — | fine alone — deadly with Purging Fire; call it |
| **Purging Fire** | Oruk | red **cross** 40 m × 5 m centred on Oruk | 2.0 s | 40 %HP | step into a diagonal |
| Rite of Cinders | Oruk | 2 Living Cinders per cast (never more than 4 alive) | 2.0 s | as trash | area damage |
| Cleanse | Oruk | every 45 s removes all buffs from the party (not debuffs) | 2.0 s | 10 %HP | re-buff after |

**Dialog:** each on a teammate's death — Sabeth *"Another widow's weed."*, Dorrin *"Order is kept."*, Oruk *"Ash to ash."* · last hostile's death — *"Take your petition to the King, then. He burns them unread."*
**Challenge:** Grief sleeps 3 players; the Iron Decree soak needs 3 pips. **Deep tuning:** Purging Fire rotates 45° after it lands and hits again, with its own 2.0 s warning.
**Depth list** (page 11 §22.2): ① `mech_curse_spread` Court Gossip: spreads within 5 m (dispellable) · ② `mech_add_wave` 2 Court Guards · ③ `mech_silence_pulse` Order in Court: 3 s.
**Loot:** `it_sabeths_mourning_hood` (cloth helm), `it_dorrins_seal_shield` (shield), `it_oruks_rite_staff` (staff), `set_kingsfire_regalia` piece (chest), `uq_petition_of_the_three_houses` **[D-EXCL]** — neck: when a fight starts you receive one of Ash (a 10% shield), Iron (+10% armour) or Flame (+8% damage) at random for that fight.

#### B3 · `b_forgequeen_hesta` — Forge-Queen Hesta

| Field | Value |
|---|---|
| Body | chibi2 dwarf ×2.0, black-iron `rune_helm`, a hammer with a glowing rune, leather apron, a rune halo |
| Health | 240 H |
| Phases | 100–60% · 60–30% · 30–0% (**Anneal** at 60% and 30%) |
| Teaches | **three rune types at once**: spread, stack, hold a distance |
| Enrage | 8:00 — *Pour*: every channel floods |

**Arena:** the Royal Forge, 40×30 m, cut by **four lava channels** (3 m wide) running east–west; iron bridges cross them at fixed
points. A **quench trough** stands by the great anvil (a green **beneficial** 3 m strip).

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Hammerfall | all | melee + 4 m splash + **Forge-Marked** (+10% fire damage taken, stacks, 25 s) | — | 20 %HP | at 4 stacks the tank steps into the **quench trough** for 1.5 s (clears all). On Challenge the trough is dry: a 6 s hand-off (§2.11) |
| **Open the Sluices** | all | 2 channels overflow: each becomes a red band 10 m wide (the channel + 3.5 m each side) for 8 s | 2.0 s | 40 %HP + 5 %HP / 0.5 s inside | stand between overflowing channels; the pattern changes every 20 s |
| **Rune of Fire** | all | a flame rune over 2 players: yellow **targeted** 6 m | 2.0 s | 25 %HP to all inside | spread |
| **Rune of Iron** | all | an anvil rune over 1 player: orange **soak** 5 m, **3 pips** round them | 3.0 s | 90 %HP split | stack on the iron-rune player |
| **Rune of Binding** | P2+ | a chain rune on 2 players: a white **tether** that must stay **between 6 m and 16 m** long for 8 s (it turns red at the limits) | 1.8 s | too short or too long: 8 %HP a second each | hold the distance |
| Forged Legion | P2+ | 2 Forged Legionnaires from the moulds | 3.0 s | as trash | kill them **inside an overflowing band** (they take +100% there, and they ignore damage-over-time) |
| **Anneal** | 60%, 30% | room-wide | 3.0 s | 15 %HP + **every rune on the party detonates at once** | be in position for all three rune types at the same time |

**Dialog opportunity — "The apprentice"** (at 30%; the party votes). A young dwarf runs out of the moulds and throws himself in
front of her: *"Please — she makes their swords because he has her clan in the kiln! Please!"* Hesta: *"Get back, Tobbin!"*

| Reply | Result |
|---|---|
| *Say nothing.* | the apprentice is knocked aside; the fight goes on |
| "Step aside, boy. We'll free your clan." | Hesta stops for 8 s: *"...Then do it fast."* She fights on at −20% damage. Iron +1. She drops the **Kiln Key Fragment** (`it_kiln_key_fragment`, Quest item) — half of the Secret |
| "Your clan chose the King." | Hesta gains +20% damage. Flame +1 |

**Dialog:** pull — "Out of my forge!" · Sluices ⚠ — "Let it run!" · runes ⚠ — "Hold still. I'm writing on you." · Anneal ⚠ (banner) — "Now — all of it holds, or all of it breaks!" · death — "Tobbin... the clan..."
**Challenge:** Rune of Fire on 3 players; Rune of Iron needs 3 pips from phase 1 and a 4th rune — **Rune of Ash** (skull icon): the target must stand in an overflowing band for 1 s to clear it, or it bursts for 40 %HP on everyone. **Deep tuning:** 3 channels overflow at once.
**Depth list** (page 11 §22.2): ① `mech_spark_runner` forge sparks along the channels · ② `mech_drop_puddle` Molten Rune: a marked player drops 3 m slag every 3 s for 12 s · ③ `mech_knockback_nova` Anvil Ring: 8 m knockback (toward the channels).
**Loot:** `it_royal_forge_hammer` (two-handed mace), `it_rune_etched_gauntlets` (heavy hands), `it_sluice_boots` (light feet), `set_kingsfire_regalia` piece (legs), `uq_hestas_apprentice_hammer` **[D-EXCL]** "Tobbin's Hammer" — one-handed mace (8% drop; 25% if the apprentice was spared): every 4th hit inscribes a rune on the target; the 5th hit detonates it for 150% weapon damage in 4 m.

#### B4 · `b_vaelkyr_firewing` — Vaelkyr, the Firewing Consort

| Field | Value |
|---|---|
| Body | creature dragon ×5.5, deep red, belly of pale gold, dark accents, gold eyes; a `burn` aura on the wings |
| Health | 250 H |
| Phases | 100–70% *Ground* · 70–40% *Air* · 40–0% *Grounded* (a wing torn; both sets of abilities) |
| Teaches | **player-worked objects**: two ballistae bring a flying boss down |
| Enrage | 9:00 — *Sky Burns* |

| Ability | Phase | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Rend | P1, P3 | melee + **Seared** (1 %HP a second per stack, 20 s) | — | 22 %HP | at 3 stacks the tank steps behind a broken pillar into its **shade** (green 3 m) for 1.5 s to clear them; Challenge: hand off |
| Tail Lash | P1, P3 | 90° red cone 18 m **behind** her | 1.8 s | 40 %HP + knockback | never behind her |
| **Cinder Breath** | P1, P3 | 60° red cone 30 m in front | 2.0 s | 50 %HP | the tank turns her to the wall; everyone at her sides |
| **Deep Breath** | P2 | she flies across the crater breathing: a red band 20 m wide from rim to rim | **3.0 s** | **one-shot** | get out of the band — its edges are drawn from the start of the warning |
| Fireball Rain | P2 | yellow **targeted** 5 m on 3 players; each landing leaves a 5 m fire **void zone** (40 s) | 1.8 s | 25 %HP + 4 %HP / 0.5 s | spread and drop the patches at the rim |
| Whelps | P2 | 4 Fire Whelps | 3.0 s | as trash | area damage |
| **Harpoon** (players) | P2 | **2 ballistae** on the rim (interact 3 s to fire): each hit takes 2% of her health; **both within 10 s** pull her down for 8 s (*Grounded*, +50% damage taken) | — | — | **2 players** on the ballistae; she burns one every 30 s (a 5 s repair, hold E) |
| **Crater Collapse** | P3 | room-wide wing-beat of fire | 3.0 s | 45 %HP | stand behind a broken pillar (**line of sight**) |

After she dies her **egg** lies in the nest: return it (Ash +1) or smash it (Flame +1; smashing gives each player a cosmetic
`it_firewing_eggshell_helm`).
**Dialog:** pull — "My King sleeps poorly. You will not wake him." · Deep Breath ⚠ (banner) — "Nothing under my wings survives!" · grounded — "Chains — on ME?" · death — "Kaedros... I... burned for you."
**Challenge:** **Flame Walls** in P3 — 2 walls of fire sweep the crater (a **moving wave**, 5 m/s, each with a 5 m blue gap). **Deep tuning:** Fireball Rain on 4 players.
**Depth list** (page 11 §22.2): ① `mech_wind_push` Wing Gale · ② `mech_trail_fire` a burning dive trail · ③ `mech_add_swarm` 6 more Fire Whelps (never more than 6 alive).
**Loot:** `it_dragonbone_bow` (bow), `it_firewing_scale_mail` (medium chest), `it_whelp_tooth_daggers` (dagger), `set_kingsfire_regalia` piece (feet), `leg_firewing_pinion` **[D-EXCL]** — two-handed staff or bow legendary (was `leg_emberwing_pinion`): every 3rd cast sends a Deep Breath line 25 m × 4 m for 350% weapon or spell damage. Mount `it_mount_firewing_whelp` (a young creature dragon ×1.4; runs and glides, and flies once the owner has the level-60 flying unlock, page 07) 1% per player.

#### END · `b_fire_king_kaedros` — Kaedros, the Fire King (Maelor Varn)

| Field | Value |
|---|---|
| Body | P1–P2: chibi2 human ×2.4, a gold crown set with coals, a burning greatsword, a cape of red and gold, a rune halo of fire. P3: he sits and the throne closes over him → creature titan ×5.5, dark stone, a molten belly, eyes of pale gold, a blazing core |
| Health | 340 H |
| Phases | P1 100–70% *The Court Assembled* · P2 70–40% *The Burning Hall* · P3 40–10% *The King Unmade* · P4 10–0% *Last Light* |
| Enrage | 12:00 — *The Last Light Goes Out*: a room-wide one-shot every 5 s (3.0 s warning each) |
| Voice | slow, never raised, **never an exclamation mark** (page 01) |

**Arena:** the Fire Throne, 50 m round; a lava moat round the edge; a floor of **cinder tiles** (5 m hexes). Two **quench
cisterns** (green 3 m strips) sit at the foot of the throne.

**Favour help** (from the house with the most Favour): **Ash** — Sabeth shields the whole party for 25% of maximum health once
per phase (*"Down, all of you — behind me."*); **Iron** — Dorrin's two iron golems hold the King's adds in P2; **Flame** — Oruk's
fire makes the cinder tiles harmless for 20 s once per phase.

**P1 — The Court Assembled (100–70%)**

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Kingsfire Blade | melee, 5 m splash + **Crownburn** (fire damage taken +15%, stacks, 30 s) | — | 26 %HP | at 3 stacks the tank steps into a **quench cistern** for 1.5 s; Challenge: hand off |
| **Royal Decree** | yellow **targeted** 8 m on 2 players; where it lands a tile turns to **lava** (a **void zone**, 4 %HP / 0.5 s) for the rest of the fight | 2.0 s | 30 %HP | spread **to the edge** so the lava does not take the middle |
| Court of Flame | 2 Court Guards rise from the floor | 3.0 s | as trash | the tank collects them; kill before P2 |
| Crown Heat | room-wide every 20 s | 2.0 s | 15 %HP | heal |

**P2 — The Burning Hall (70–40%)**

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| **Cinder Tiles** | half the hex tiles (a honeycomb **checkerboard**) glow red; flips every 10 s | 1.8 s | 45 %HP | stand on unlit tiles |
| Legion Muster | 1 Pyrecaller + 2 Legionnaires | 3.0 s | as trash | interrupt the Pyrecaller |
| **Tax of Ash** | 2 orange **soaks** 6 m, **2 pips** each | 3.0 s | 90 %HP split each; short: 40 %HP room-wide and he heals 3% | two pairs soak (the tank does not) |
| **Firebrand** | a white line between him and the farthest player: 8 %HP a second to them for 10 s; if they come **within 10 m** of another player it jumps to that player | 1.8 s | 8 %HP / s | the target stays alone; the healer keeps them up |

**P3 — The King Unmade (40–10%).** The throne closes over him; he becomes the titan.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Throne Fist | melee, 8 m splash + knockback 6 m (toward the moat if careless) | — | 30 %HP | the tank keeps his back to the middle |
| **Molten Crown** | red **donut** from 10 m to 35 m round him; safe inside 10 m | 2.5 s | 60 %HP | in close |
| **Eruption** | 4 red circles 8 m | **3.0 s** | **one-shot** | out |
| **Pull of the Kiln** | the whole party is pulled toward him at 2 m/s for 4 s | 2.0 s | — | walk out; Molten Crown follows the pull every other time — watch the order |
| **Fire Wake** | rings of fire rolling out from him (**moving wave**), one blue 8 m gap each | 2.0 s | 40 %HP | through the gap |

**P4 — Last Light (10–0%).** His crown burns white. Every 6 s **Light of Last Light**: room-wide 12 %HP, +15% each cast. Every
lava tile turns back to cinder (safe). The party has about 40 s to finish him.

**Dialog opportunity — "The King's offer"** (at 40%, before the throne closes; the party votes). *"The Assembly voted me out of
my own kingdom. I voted myself back in. Kneel, and nobody you love will ever die again."*

| Reply | Result |
|---|---|
| *Say nothing.* | P3 |
| "We kneel." (every player must use the kneel emote within 10 s) | he does **not** close the throne for 20 s — a free 20 s of P2 damage — but he takes 10% less damage for the rest of the fight |
| "Last Light keeps its own lamps." | P3 as written; +1 item for every player |
| *(the party carries **Ysa's Ribbon** and the **Kiln Key Fragment**)* "Ysa sends her ribbon back." | he stops: *"...Ysa."* For 6 s he is **stunned** (free damage) and his P4 Light starts 20% lower. On his death the throne cracks and the Heart Kiln opens: the Secret |

**Dialog:** pull (banner) — *"The court is in session. You are the accused."* · Decree ⚠ — *"By my word, this ground burns."* · Tax ⚠ — *"Pay the tax of ash."* · P3 (banner) — *"Throne. Take me up."* · Eruption ⚠ (banner) — *"The mountain answers its king."* · P4 (banner) — *"Last Light. There is only one light, and it is mine."* · death — *"Ysa... it was... for you..."*
**Challenge:** Tax of Ash needs 3 pips each (the tank soaks one); Royal Decree on 3 players. **Deep tuning:** Cinder Tiles flip every 8 s (each flip keeps its full warning); Eruption is 5 circles.
**Depth list** (page 11 §22.2): ① `mech_add_shieldbearer` 2 court shield-bearers: −50% damage to him while they live · ② `mech_mark_of_prey` The King's Regard · ③ `mech_void_line_wall` a firewall 16 m × 2 m across the tiles.
**After the kill:** the **Heartflame** (`it_heartflame`, page 14's quest item) lies on the throne; every player may take it. The main story goes on to Spire Isle and d16.
**Loot:** `it_kingsfire_greatsword` (two-handed sword), `it_fire_throne_plate` (heavy chest), `it_royal_decree_wand` (wand), `it_crown_heat_ring` (ring), `set_kingsfire_regalia` pieces (head, neck), `soul_the_kings_offer` **[D-EXCL]** — soul (jewellery socket): once per fight, when an ally within 20 m would die, they are left at 1 health instead and you lose 20% of your maximum health. `leg_crown_of_kaedros` **[D-EXCL]** — head legendary: your hits tagged Fire leave a burning 4 m tile under the target for 6 s (30% of the hit a second to enemies on it). Mount `it_mount_fire_throne_titan` (a small walking throne on titan legs, creature titan ×1.0 with a chair — a joke) 2% per player.

### Secret boss — `b_ysa_varn_kindled` — Ysa Varn, the Kindled Child

**Unlock (choices carried through the whole dungeon):** (1) stand with **Ash** at the Three Petitioners and keep Sabeth alive
through that fight — she gives **Ysa's Ribbon**; (2) at Hesta's 30%, "Step aside, boy" — she drops the **Kiln Key Fragment**;
(3) at the King's 40%, "Ysa sends her ribbon back"; (4) kill the King. The throne cracks; the Heart Kiln opens behind it.
Journal hint: *"Every morning Sabeth asks the King for their daughter. He always says no. Someone should ask him differently."*

| Field | Value |
|---|---|
| Body | chibi2 human ×1.6, a girl of fourteen made of **clear glass with fire inside** (`burn` aura + `glow`), a circlet of cooled slag, no weapon — she fights with her hands and the kiln |
| Health | 360 H |
| Phases | 100–50% · 50–20% · 20–10% · **10%: dialog** |
| Enrage | 10:00 — *Fired*: the kiln door shuts (a one-shot with 3.0 s warning) |
| Twist | **Sabeth** follows the party in. She does not fight; she **kneels at the door** and must not die (she has 40 H; some of Ysa's attacks aim at her). If she dies, the fight **fails** (a wipe) |

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Glass Hands | melee + **Shards** (a bleed, 1 %HP a second per stack) | — | 24 %HP | at 3 stacks the tank steps over a cooled **vent** (green while cold) for 1.5 s; Challenge: hand off |
| **Vent** | 3 of the 6 vents flare: red 7 m circles | 2.0 s | 50 %HP | out |
| **Molten Glass** | a 5 m **void zone** under 2 players; after 30 s each cools into a **glass wall** (blocks movement and line of sight) | 1.5 s | 5 %HP / 0.5 s | drop them in a ring round the edge, never across the door |
| **Anneal** | orange **soak** 6 m on her, **3 pips** | 3.0 s | 90 %HP split; on a full soak her glass turns **Brittle** for 10 s: +100% damage taken. Short: 40 %HP room-wide | three soak |
| **Cry for Mother** | a line of fire from Ysa to Sabeth, drawn white for 3 s | 3.0 s | 25% of Sabeth's health, or 30 %HP split between the players standing in the line | **2 players** step into the line |
| Kiln Heat | room-wide every 10 s, +5% each (soft enrage) | — | 6 %HP | — |
| **Shatter** | at 50% and 20%: 3 players get yellow 6 m circles; glass walls inside them shatter into shards (a 4 m red zone round each wall, 2.0 s, 30 %HP) | 2.0 s | 25 %HP + walls | the targets move away from glass walls |

**Dialog opportunity — "Mother"** (at 10%). Sabeth stands: *"Ysa. Ysa, it's me. You can stop."* Ysa: *"Mother? It's so hot,
Mother. Father said it would stop soon."* (The party votes.)

| Reply | Result |
|---|---|
| *Say nothing.* | the fight ends normally at 0% |
| "Let her through." (the party stops all damage for 10 s) | Sabeth walks to her and the fight ends **as a win at 10%**: Ysa cools, smiles, and crumbles to warm sand. Title *"Who Opened the Kiln"*. Full loot |
| "Stand back, my lady." | fight to 0%; +1 item; Sabeth weeps |

**Dialog:** pull — *"Is it morning? Father said it would be morning soon."* · Anneal ⚠ — *"Make it stop being so hot!"* · Cry ⚠ (banner) — *"MOTHER!"* · death (reply 1 or 3) — *"...cool..."*
**Challenge:** Anneal needs 3 pips and two players for Cry for Mother become three. **Deep tuning:** Molten Glass under 3 players.
**Depth list** (page 11 §22.2): ① `mech_spark_runner` glass beads skitter · ② `mech_echo_repeat` a Vent flares again 1.5 s later · ③ `mech_gaze` Don't Look at Me: dazed 3 s.
**Loot:** `it_kiln_glass_gloves` (cloth hands), `it_kiln_door_shield` (shield), cosmetic `it_glass_circlet` (30%), mount `it_mount_glass_charger` (a glass-and-fire horse) 2% per player. `uq_ysas_ribbon_band` **[D-EXCL]** — ring: when an ally within 20 m drops below 30% health, your next heal or shield on them is +30% (10 s cooldown). **`leg_kiln_heart` [SECRET] [D-EXCL]** — off-hand focus or shield legendary: every 15 s your next heal or damaging spell is doubled and turns the target to glass for 2 s (enemies take +30% damage; allies are immune to damage).

### Set dropped here

`set_kingsfire_regalia` — Kingsfire Regalia (6 pieces: hands, chest, legs, feet, head, neck; any armour type — takes the looter's;
drops from B1–END). Brief (page 09 writes it): 2 = +8% damage to enemies above 80% health, 4 = killing an add refunds 15% of
your longest cooldown, 6 = every 20 s your next hit brands the target: it takes +10% damage from the whole party for 6 s.


**Class endgame sets** (the sets the class files moved here from the old raids; page 09 indexes them). On **Challenge**, each
boss below gives every player, once a week (the Challenge lock, Monday 06:00), a **35%** chance at a **class set token**
(`it_token_<slot>`) for its slot; the token becomes that slot's piece of whichever of **your class's** sets names this dungeon
as its source (if two do, you choose). Sub-bosses give none. From **Deep 10**, this dungeon's Depth Cache adds an **8%** roll
for one of these tokens (§2.4.6).

Cinderjaw → **hands** · the Three Petitioners → **chest** · Forge-Queen Hesta → **legs** · Vaelkyr → **feet** · Kaedros → **head** and **shoulders** · Ysa Varn (secret) → a token for **any slot** you choose.

---

## d16 — The Spire

*(Rebuilt for five from the shelved 20-player raid r05 "Veilspire"; the raid version is in `WISHLIST.md`. Of its ten
bosses, five came across — the Threshold, the Horologe, the Mirror Court, Saelith and the Unwoven — plus Grey and Greyer
and the Many-Mouthed as sub-bosses and the Marchheart as the secret. The two-realm rule now splits the party **2 / 3**,
never 10 / 10. Every soak, add wave and tank rule follows §2.11.)*

### Card

| Field | Value |
|---|---|
| id | `d16_the_spire` |
| Region | Spire Isle (`spire_isle`) |
| Levels | 60 (opens at 60) · Challenge 60 · Depth 1–30 (every depth is Deep; §2.4) |
| Looks | **spire** (new `spire_root` / `spire_halls` / `spire_crown`: pale stone threaded with white light where the Mend shows through the walls like water through ice; the Mend's own light fills every room — §22). Each room also exists as its **Underside** (below) |
| Entrance | **the Spire Foot** (`sz_spire_foot`), the spire's broken root above the Spire Landing. Discovered by climbing to the root door or by teleport (§2.3). Spire Isle itself is reached by the ship from Saltmarch (page 20) |
| Quest giver | `npc_ysoldes_echo`, at the empty brazier (`lm_the_broken_pin`) |
| Story quest | page 14's main-story quest **"The Unwoven"** (Ch 12, was `q_ms_veilspire`): carry the Heartflame up the Spire and kill the Unwoven; the story's last choice (page 14, "The Last Lamp") follows at the brazier. The epilogue. Page 14 also offers the story instance `si_the_lamps_climb` |
| Run time target | Normal 45 min · Challenge 48 min (no timer; the journal records your best time) |
| Brazier Shrines | the Root Door · after the Threshold · after the Horologe · after the Mirror Court · after Saelith (the shrines here are white braziers that burn without fuel) |
| Rarity slots (§2.9) | **C** the Root Stair (pack 1 or 2) · **C** the Halls (pack 5 or 6) · **R** the Gallery (the Spire Sentinel of pack 7) · **G** the Crown Stair (pack 9) · *Challenge:* **C+** the Halls (the pack that did not get the champion) · **R+** the Root Stair (the Threshold Warden of pack 3) · **W** the Gallery (pack 8) · *Depth rooms:* the Root Stair, the Halls, the Gallery. Rarities here are drawn in grey-violet Tear colours and can **cross realms** (a champion pack's affix works on both sides) |
| Main family (page 10) | **tear** (Depth warden: the Mendbreaker) · also rift, construct, folk, beast |
| New lessons | **two realms at once** (the party splits **2 / 3**), **time rewinds**, **copies of the party's own classes**, a boss you must **answer** rather than kill |

### The Underside (dungeon-wide, new)

Every room of the Spire exists twice: the **Waking** (normal colours) and the **Underside** — the same room seen from
beneath the Mend: drained to grey-blue, everything outlined in white. **Rifts** (standing tears of white light, 3 m, in fixed
spots) move you to the other realm in 1 s. (This was the raid's "Veil realm"; renamed with the Mend, 00 §12.4.)

| Rule | In the Waking | In the Underside |
|---|---|---|
| What you see | the Waking; Underside players are faint ghosts | the Underside; Waking players are faint ghosts; **Underside-only** telegraphs (marked so on this page) are visible |
| Damage from the other realm | none | none |
| Health drain | none | **Rift Drain**: 1% of maximum health a second |
| Healing | as normal | Waking players cannot heal across. The Underside has its own healing: **mend-threads** — green **beneficial** 3 m circles, two per room, restoring 4% a second — so a side without a healer can still hold (§2.11) |
| Time limit | — | **40 s**, then you are thrown out with **Rift Sickness** (cannot cross again for 20 s; 15 %HP) |
| Boss health | shared between realms unless a boss says otherwise | shared |
| Split | the usual split is **3 Waking / 2 Underside**; the party frame shows a small white eye on Underside players | |

### Story hook

When the Fire King died, the hand that had been pulling the Mend open let go all at once, and the Mend **snapped back and
tore** at its pin. The Heartflame is home, but the Spire is already breached. Up through the tear comes **the Unwoven** — the
first thing that ever came through the Tear, the thing the Lampbearer bound four hundred years ago — pulling the threads of
the world out through the nail. Saelith, who has guarded the Spire since, will not let anyone past who cannot tell her why.
Ysolde's Echo waits at the empty brazier for someone to finish it.

### Layout

```
                          ? THE DREAMING MARCH (secret: every player carries a Hearthvale Coal + Saelith's and the Unwoven's replies)
                                            |
                          [B5] THE LOOM BEYOND (end; inside the Underside; floating stones)
                                            |
                                          (S5)
                                            |
                          [B4] THE WARDEN'S NAIL (the top of the spire)
                                            |
                              the Crown Stair (pack 9)
                                            |
        The Throat [s2] ===== the Gallery (packs 7–8)
                                            |
                                          (S4)
                                            |
                          [B3] THE MIRROR COURT (five mirrors)
                                            |
                              the Halls (packs 5–6)
                                            |
                                          (S3)
                                            |
                          [B2] THE CLOCK ROOM (the Horologe)
                                            |
                                          (S2)
                                            |
     Kennel of Mist [s1] ===== [B1] THE THRESHOLD (4 rifts)
                                            |
                              the Root Stair (packs 1–4)
                                            |
                          (S1) the Root Door <-- entrance (the Spire Foot)
```

| Room | Size (m) | Holds |
|---|---|---|
| the Root Door | 16×14 | S1 |
| the Root Stair | 12×60, a spiral ramp inside the root | packs 1–4 |
| The Threshold | 40 m round, 4 rifts at the compass points | B1 |
| Kennel of Mist | 30 m round, 2 rifts | s1 Grey and Greyer (optional) |
| The Clock Room | 40 m round, painted as a **clock face of 12 segments** | B2 the Horologe; S2 before it |
| the Halls | 14×50 | packs 5–6 |
| The Mirror Court | 40×40, five tall mirrors on the walls, 2 rifts | B3; S3 before it |
| the Gallery | 12×44 | packs 7–8 |
| The Throat | 36 m round pit, mouths in the walls | s2 the Many-Mouthed (optional) |
| the Crown Stair | 10×30, open to the sky | pack 9 |
| The Warden's Nail | 36 m round, the top of the spire; half the floor is a permanent rift | B4 Saelith; S4 before it |
| The Loom Beyond | inside the Underside: one 44 m platform that breaks into 5 floating stones | END the Unwoven; S5 before it |
| The Dreaming March | 80 m round: the whole continent in miniature — green valley at the south edge, volcano at the north, each region a wedge | secret boss |

### Trash

| id | Name | Body | H | Abilities |
|---|---|---|---|---|
| `m_tear_rift_shade` | Rift Shade | creature wraith ×1.6, grey-blue, white outline | 1.5 | exists in **both** realms (one body each, shared health); only damageable in the realm where its eyes glow (swaps every 8 s). **Grasp** 14 %HP + pulled 3 m toward the nearest rift. |
| `m_tear_rift_stalker` | Rift Stalker | creature saber_cat ×2.0, translucent white | 2 | **Pounce from Beneath**: attacks from the Underside into the Waking — the Underside-only warning (a white paw print) shows 2.0 s before; Waking players see a faint shimmer. 30 %HP. |
| `m_construct_threshold_warden` | Threshold Warden (elite) | creature golem ×2.6, pale stone with white seams | 5 | **Seal**: 12 m red **donut**, 2.0 s, 40 %HP. **Anchor**: immune unless someone in the Underside strikes its twin there. |
| `m_construct_clockwork_sentry` | Clockwork Sentry | creature turret ×2.0, brass | 1.5 | **Tick**: a red line 30 m × 2 m that sweeps 90° over 3 s, 25 %HP. |
| `m_construct_escapement` | Escapement | creature golem ×1.6, brass gears | 1.2 | **Rewind** (i) 3.0 s: every enemy within 20 m goes back to its health of 5 s ago. |
| `m_folk_spire_sentinel` | Spire Sentinel (elite) | chibi2 elf ×1.5, silver `plate_helm`, glaive, white cape (Saelith's wardens) | 5 | **Nail Sweep**: 180° red cone 10 m, 2.0 s, 40 %HP. **Warden's Oath**: −50% damage taken while another sentinel lives within 15 m. |
| `m_folk_spire_seer` | Spire Seer | chibi2 elf, hood, orb | 1.5 | **Foretell** (i) 2.5 s: marks the party — +30% damage taken for 20 s. |
| `m_beast_moth_of_memory` | Memory Moth | creature moth ×1.4, white wings with eyes | 0.3 | swarms of 4; **Forget**: removes your most recent buff. |
| `m_tear_the_mouth` | Mouth | creature worm ×2.4, open maw, dark violet | 2 | **Bite**: red 5 m at its head, 2.0 s, 40 %HP. **Whisper**: a warning line that is always a lie. |
| `m_rift_rift_shard` | Rift Shard | (as d12) | 0.8 | as d12, and **Opening**: where it dies a 3 m rift stands for 20 s. |
| `m_tear_loom_spider` | Loom Spider | creature spider ×2.4, white, grey legs | 2.5 | **Thread**: a white **tether** that pulls a player toward the platform's edge at 2 m/s; breaks at 15 m. |
| `m_tear_loose_thread` | Loose Thread | creature wisp ×1.4, trailing white threads | 0.5 | **Unravel**: on death, a random player's biggest buff is removed. |

| # | Room | Pack |
|---|---|---|
| 1 | Root Stair, first turn | 3 Rift Shades + 1 Spire Seer |
| 2 | Root Stair, second turn | 2 Rift Stalkers + 4 Memory Moths |
| 3 | Root Stair, third turn | 1 Threshold Warden + 2 Rift Shades (its twin in the Underside: 2 players cross to strike it) |
| 4 | Root Stair, top | 2 Clockwork Sentries + 2 Escapements |
| 5 | the Halls, near | 2 Spire Sentinels (elite pair — pull one away) |
| 6 | the Halls, far | 3 Rift Shards + 2 Rift Shades + 1 Spire Seer |
| 7 | the Gallery, near | 1 Spire Sentinel + 2 Rift Stalkers |
| 8 | the Gallery, far | 4 Memory Moths + 3 Loose Threads + 1 Spire Seer |
| 9 | the Crown Stair | 2 Loom Spiders + 3 Loose Threads (at the stair's edge: a fall is 30 %HP and back to its foot) |

### Sub-bosses

#### s1 · `b_grey_and_greyer` — Grey and Greyer, the Rift Hounds

Bodies: `b_rifthound_grey` creature dire_wolf ×4.0, grey (lives in the Waking); `b_rifthound_greyer` the same, darker, white
outline (lives in the Underside). Health 45 H each; they must die **within 10 s of each other** or the survivor heals to 40%.
Kennel of Mist (optional). Enrage 5:30.

**Rule (re-tuned for five):** every **30 s** the hounds **swap realms** (a howl, 3.0 s warning). A hound can only be hurt from
its own realm. The **tank and two others** stay with one hound; **two players** follow the other through the rifts — and on
each swap the two teams swap sides too (the tank always follows the hound it holds). The Underside hound is **kited**, not
tanked (§2.11): it fixates one of its two players.

| Ability | Hound | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Maw | both | melee + **Scent** (+5% damage taken from hounds, stacks) | — | 18 %HP | the stacks fall off when you cross a rift |
| **Mist Lunge** | Grey | red line 30 m × 5 m | 2.0 s | 35 %HP | sidestep |
| Grey Howl | Greyer | Underside-wide | 2.0 s | 15 %HP; Rift Drain doubles for 10 s | the Underside pair uses a mend-thread |
| **Paired Scent** | both | a white **tether** between one player in each realm; they must stand **on the same spot** (within 3 m, across realms) for 6 s | 1.8 s | apart: 6 %HP a second each | the two find each other's ghost and stand together |

**Dialog** (the Narrator): pull — *"Two shapes in the mist, and they are the same shape."* · swap ⚠ — *"They howl, and change sides."* · death — *"The mist goes quiet on both sides."*
**Challenge:** swaps every 20 s. **Deep tuning:** Mist Lunge fires twice, each with its own 2.0 s warning.
**Depth list** (page 11 §22.2): ① `mech_fixate_chase` a mist pup fixates the healer · ② `mech_trail_fire` a frost-mist trail behind Grey · ③ `mech_swap_places` Scent Swap: two players swap places.
**Loot:** `it_mistfang_glaive` (polearm), `it_greyhide_jerkin` (medium chest), `uq_grey_collar` **[D-EXCL]** — neck: your tamed beast, bound demon or controlled undead can cross rifts with you and deals +15% damage. Mount `it_mount_rifthound` (a translucent grey dire wolf that trails mist; was `it_mount_veilhound`) 2% per player.

#### s2 · `b_many_mouthed` — The Many-Mouthed

Body: creature horror ×6.0, deep violet, twelve eyes (nine open), eight tentacles, mouths all over it. Health 90 H. The Throat
(optional). Enrage 5:30.

**Rule — the voices lie.** It speaks through many mouths, and **one in three of its warning lines is a lie** (it says "left"
when the telegraph is on the right). **The ground telegraph never lies.** On Normal a lying banner carries a small ✕ in its
corner; on Challenge it carries nothing.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Chew | melee + **Digested** (−5% maximum health, stacks, until it dies) | — | 22 %HP | tank handoff at 4 (page 11 §16); a green **bile pool** by the wall is its Cleansing Pool |
| **Left Mouth, Right Mouth** | half the pit (left or right of its facing) goes red | 2.0 s | 55 %HP | go where the **ground** says; the voice may lie |
| **Swallow** | 1 player is swallowed into the **Stomach** (an Underside room, 16 m): acid **void zones** and a **Gullet Knot** (8 H) they must destroy in 20 s to be spat out; two mend-threads in the stomach | 2.0 s | acid 4 %HP / 0.5 s | the swallowed player kills the knot alone; a second player may follow through the maw's rift to help |
| Mouths | 2 Mouths rise from the grates | 3.0 s | as trash | kill them; their Whisper is always a lie |
| **Babble** (i) | five mouths cast at once — **five cast bars**; only one is real (its mouth glows gold) | 3.0 s | 40 %HP room-wide if the real one finishes | interrupt the gold mouth, not the loudest |
| **Hunger** | orange **soak** 6 m, **3 pips**, at its main maw | 3.0 s | 90 %HP split | soak — the maw is where it lies about Left and Right most |

**Dialog:** pull — *"Hello. Hello. Hello. We are so glad you came."* · Left/Right ⚠ — *"The LEFT will eat!"* (a lie one time in three) · Babble ⚠ — *"Listen to me — no, ME —"* · death — *"...we... we... we..."*
**Challenge:** no ✕ on lying banners. **Deep tuning:** one in two lines lies.
**Depth list** (page 11 §22.2): ① `mech_pull_in` Swallowing Breath: pull 2 m/s for 3 s · ② `mech_add_swarm` 6 tongues crawl from the grates · ③ `mech_gaze` Twelve Eyes: dazed 3 s.
**Loot:** `it_toothed_daggers` (dagger), `it_throat_lining_robe` (cloth chest), `uq_mouth_that_speaks_true` **[D-EXCL]** — head: warning lines that lie are marked for you (✕) even on Challenge.

### Main bosses

#### B1 · `b_threshold` — The Threshold

| Field | Value |
|---|---|
| Body | creature shard ×5.5, pale white-violet, a slowly turning door-shaped crystal |
| Health | 230 H |
| Phases | 100–50% · 50–0% (two of the four rifts close) |
| Teaches | **two realms at once**: the party splits 3 / 2 |
| Enrage | 8:00 — *Door Closed*: everyone is trapped in whichever realm they stand in (a one-shot with 3.0 s warning) |

**Rule:** in the Waking it is a door, in the Underside a doorkeeper. It is **invulnerable in both realms unless at least 2
players are in the Underside.**

| Ability | Realm | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| Lintel Strike | Waking | melee + **Doorstruck** (+12% damage taken from it, stacks) | — | 24 %HP | the tank crosses a rift and back (a 2 s trip) to clear the stacks — this boss's Cleansing Pool; on Challenge the stacks survive one crossing, so a handoff or a Brace (page 11 §16) is needed |
| Warden Strike | Underside | melee on the nearest Underside player | — | 14 %HP | the Underside pair holds it between them |
| **Slam Shut** | Waking | red **cross** 40 m × 6 m | 2.0 s | 45 %HP | diagonals |
| **Keyhole** | Underside (*Underside-only*) | red 8 m circle in the Underside — **and the same spot** becomes a **void zone** in the Waking 5 s later (40 s, 4 %HP / 0.5 s) | 2.0 s | 40 %HP | the Underside pair drops it at the wall; the Waking team sees the void appear and avoids it |
| **Doorway** | Waking | orange **soak** 5 m, **2 pips**, on a rift | 3.0 s | 70 %HP split | soak it — and **the two soakers are moved into the Underside**, and the two who were there come out: this is the rotation (plan it before Rift Sickness at 40 s) |
| Draft | both | room-wide, both realms | 2.5 s | 15 %HP | heal (each side its own: the Underside pair uses mend-threads) |

**Dialog** (a voice from both sides at once): pull — *"You have a key. Keys are for leaving."* · Slam Shut ⚠ — *"Shut."* · Doorway ⚠ — *"Step through."* · death — *"Open. ...Open."*
**Challenge:** from 50%, **3** players must be in the Underside for it to be hurt (the Waking team is the tank and one more). **Deep tuning:** Keyhole fires twice, each with its own warning.
**Depth list** (page 11 §22.2): ① `mech_swap_places` Wrong Side: one Waking and one Underside player swap realms · ② `mech_spark_runner` door-sparks along the floor seams · ③ `mech_tether_break` Doorchain: two players, break at 15 m.
**Loot:** `it_lintel_greatshield` (shield), `it_doorkeepers_wand` (wand), `it_rift_step_boots` (light feet), `set_spirewoven` piece (hands), `uq_threshold_lodestone` **[D-EXCL]** — ring (was `uq_threshold_keystone`): crossing a rift, or a dodge roll, gives +8% damage for 4 s.

#### B2 · `b_horologe` — The Horologe

| Field | Value |
|---|---|
| Body | creature golem ×5.0, brass and glass, a clock face in its chest, gears turning, pale-blue eyes |
| Health | 250 H |
| Phases | 100–50% · 50–0% (**Stopped Time** at 50%) |
| Teaches | **time**: rewinds, counting, a hand that sweeps the floor |
| Enrage | 9:00 — *The Last Hour*: the hand stops on every segment (a one-shot with 3.0 s warning) |

**Arena:** a 40 m round floor painted as a **clock face of 12 segments**; the Horologe stands in the middle; the **hour hand**
(a beam) sweeps the floor.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| **Pendulum** | melee on the tank every 3 s; every 4th swing the back-swing lands **behind** it: a red 4 m circle 10 m on the far side from the tank | 1.8 s (the pendulum pauses at the top) | 22 %HP (tank) / 45 %HP (back-swing) | nobody stands behind the Horologe; the tank keeps it facing one way — re-tuned from the raid's two-tank pendulum |
| **Hour Hand** | a beam from the centre to the edge, always drawn red, sweeping clockwise one segment per 5 s | always on | **one-shot** to non-tanks, 40 %HP to the tank | stay ahead of it: everyone steps one segment every 5 s |
| **Strike the Hour** | it chimes N times (1–12); segment N lights red | chimes 3 s + 2.0 s | 45 %HP | count the chimes (the number also shows over its head) and leave segment N |
| **Rewind** | every player is put back where they stood **5 s ago** (a faint afterimage marks the spot 2 s before) | 2.0 s | — | stand somewhere safe 5 s before — it happens at 25 s past every minute of the fight (the clock shows it) |
| Tick / Tock | a **checkerboard** of segments: odd segments red on *tick*, even on *tock*, every 3 s for 12 s | 1.8 s each | 30 %HP | step one segment every 3 s |
| Escapements | 2 Escapements (never more than 2 alive) | 3.0 s | as trash | interrupt their Rewind (it heals the Horologe) |
| **Stopped Time** | at 50%: time stops for everyone **not** in an orange 8 m circle (**3 pips**) for 6 s; stopped players take 40% of their maximum health when time resumes | 3.0 s | — | three players soak; the other two use defensives |

**Dialog:** pull — *"You are early."* · Strike ⚠ — *"The hour is..."* then the chimes · Rewind ⚠ — *"Again."* · death — *"...you are... late."*
**Challenge:** the hour hand sweeps **anticlockwise** after 50%. **Deep tuning:** the hand moves one segment per 4.5 s.
**Depth list** (page 11 §22.2): ① `mech_echo_repeat` Strike the Hour rings again 1.5 s later on the opposite segment · ② `mech_spark_runner` loose gear-teeth · ③ `mech_silence_pulse` Tick of Silence: 3 s.
**Loot:** `it_escapement_greataxe` (two-handed axe), `it_brass_gear_gauntlets` (heavy hands), `it_chronometer_orb` (off-hand focus), `set_spirewoven` piece (shoulders), `leg_horologe_mainspring` **[D-EXCL]** — ring legendary: once every 60 s, press dodge twice quickly to rewind yourself to where you were 4 s ago, with the health you had. `uq_horologe_pocketwatch` **[D-EXCL]** — neck: your cooldowns tick 5% faster; every 12th second your next ability that second is +20%.

#### B3 · `b_mirror_court` — The Mirror Court

| Field | Value |
|---|---|
| Body | five **Reflections** step out of the five mirrors — **one copy of each party member's class** (a follower's reflection copies the follower's kit). Bodies: that class's Chibi 2 outfit on a glass-grey body, white outline, ×1.5. Ids: `b_mirror_reflection_<class>` |
| Health | 55 H each (five = 275 H) |
| Phases | none; when a Reflection dies, the **other four gain its class mechanic** (page 06) for the rest of the fight |
| Teaches | **copies of your own party** — the fight is built from the class files |
| Enrage | 8:30 — *Perfect Copy* |

**The framework** (the exact abilities depend on who is in the party — five boss kits built from page 06's class files):

| Rule | Value |
|---|---|
| Spells | each Reflection casts **its class's six spells** (page 06) at boss scale: **150%** of the class's number for that spell at level 60 (the raid used 250% for twenty players) |
| Telegraphs | every Reflection spell draws a page 11 telegraph with its real shape (a mage's bolt draws a yellow line to its target 1.5 s ahead), even if the player's own version is instant |
| Heals | a healer Reflection heals the others at 120% — interrupt or kill it first |
| Tank Reflection | taunts players and forces the tank to taunt back |
| Class mechanic | a Reflection uses its class mechanic as a boss ability (a druid's shapeshift becomes a phase; a warlock's bound demon becomes an add; a necromancer's corpses become adds) |
| Every Reflection | **Shatter**: a red 6 m circle round it on death, 2.0 s, 30 %HP · **Mimicry**: 3 s after a player of its class casts a spell, it casts the same spell at that player |
| Your Own Face | the Reflection of your class deals +50% to you and takes +50% from you — each player should kill their own |

| Ability (the Court itself) | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Silvered | room-wide every 45 s | 2.0 s | 15 %HP | heal |
| **Behind the Glass** | one Reflection steps into the Underside for 20 s, immune in the Waking | — | — | its own player and one more follow it through a rift |

**Dialog** (in the voice of each class's own barks, page 06, pitched down): pull — *"We have been watching you practise."* · a Reflection dies — *"That one was always the weakest."* · death — *"...Is that what we look like?"*
**Challenge:** Reflections cast at 170%, and Behind the Glass takes two Reflections at once. **Deep tuning:** Mimicry fires 2 s after the player's cast instead of 3 s (its own telegraph keeps its full warning).
**Depth list** (page 11 §22.2): ① `mech_swap_places` Wrong Reflection: a player swaps places with a Reflection · ② `mech_gaze` Look Away: dazed 3 s · ③ `mech_spread_mark` Glass Shards: yellow 5 m on 2.
**Loot:** `it_silvered_rapier` (sword), `it_glass_court_robe` (cloth chest), `it_reflecting_bow` (bow), `set_spirewoven` piece (legs), `uq_mirror_of_the_court` **[D-EXCL]** — off-hand focus: once every 45 s your next spell is cast a second time by a mirror of you at 40%.

#### B4 · `b_saelith_spirewarden` — Saelith, the Spirewarden

| Field | Value |
|---|---|
| Body | chibi2 elf ×2.0, a silver circlet with a white stone, a staff with a thread-spindle head, robes of white and violet, a white rune halo (was `b_saelith_veilwarden`) |
| Health | 260 H |
| Phases | 100–20% · **20%: dialog** |
| Teaches | a boss you must **answer**: she fights to test the party, and the fight ends in a dialog |
| Enrage | 9:00 — *Wardenfall*: the Mend opens (a one-shot with 3.0 s warning) |

**Arena:** the Warden's Nail, the top of the spire, 36 m round; the Mend presses up through the floor — **half the floor is a
permanent rift** (standing on it is being in the Underside).

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Warden's Staff | melee + **Tested** (+10% damage taken from her, stacks) | — | 24 %HP | tank handoff at 4 (page 11 §16); a white **thread-pool** by the brazier is her Cleansing Pool |
| **Weave** | white lines between **every pair** of players within 8 m of each other; any line that crosses a red zone when it fires hurts both | 2.0 s | 25 %HP per crossing | spread into a pattern where no two lines cross a zone |
| **Unweave** | 4 red lines 36 m × 4 m, rotating 45° over 4 s (a **turning cross**) | 2.0 s | 50 %HP | walk with the rotation in a gap |
| **The Question** | one orange circle per **role present** — Tank (1 pip), Healer (1 pip), Damage and Support (the rest, 2–3 pips) — each marked with its role icon (a missing role's circle never appears) | 3.0 s | 90 %HP split per circle; the wrong role in a circle: double damage | each role soaks its own circle |
| **Warden's Sight** | she shows each mechanic in the Underside **5 s** before it happens in the Waking | — | — | one player stands on the rift half as a scout and calls it |
| Hold the Nail | room-wide every 45 s | 2.0 s | 20 %HP | heal |

**Dialog opportunity — "Why should I let you through?"** (at 20%; the fight stops; the party votes). *"I have held this door four
hundred years. It is not enough. Tell me why I should let you through, and not simply close it on us all."*

| Reply | Result |
|---|---|
| *Say nothing.* | she fights to 0% and dies; the Unwoven fight has **no** Warden help |
| "Because we are going to close it from the other side." | she lowers her staff: the fight ends as a **win** (full loot). She **joins** the Unwoven fight (once in P2 and once in P3 she stops Rift Drain for the Underside side for 20 s) |
| "Because you can't stop us." | she fights on to 0% at +20% damage; +1 item for every player |
| *(every player carries a **Hearthvale Coal**, below)* "We carry the first fire of the March." | she kneels: *"Then the land is still dreaming. Wake it."* A win as reply 2, she joins as reply 2, **and** the Secret's first half is done |

**Dialog:** pull — *"Turn back. This is the only warning I give."* · Weave ⚠ — *"Every thread connects."* · Question ⚠ — *"Answer, each of you, in your own way."* · death (reply 1 or 3) — *"Close... the door..."*
**Challenge:** The Question's damage circles need their full pips even if a role is short (a Support may stand in for a missing Healer — the circle accepts either). **Deep tuning:** Unweave rotates 60° instead of 45°.
**Depth list** (page 11 §22.2): ① `mech_tether_cross` Tangled Threads: 2 pairs, the lines must not cross · ② `mech_null_field` a 10 m circle where no spell can be cast, 10 s · ③ `mech_purge_buffs` Unpick: removes one buff from everyone.
**Loot:** `it_wardens_glaive` (polearm), `it_nail_keepers_robe` (cloth chest), `it_spirewarden_circlet` (light head; was `it_moonwell_circlet`), `set_spirewoven` piece (chest), `uq_saelith_spindle` **[D-EXCL]** — staff (15% of her drops; 35% if she was answered with reply 2 or 4): your area spells draw white threads between allies inside them; linked allies share 10% of damage taken, evenly.

#### END · `b_unwoven` — The Unwoven

| Field | Value |
|---|---|
| Body | P1: creature horror ×7.0 made of **unravelled threads** (white, violet, near-black, pale eyes); P3: a storm of threads (creature wraith ×8, many tatters); P4: only its **loom** remains (a structure, not a body) |
| Health | 380 H |
| Phases | P1 100–75% *The Knot* · P2 75–50% *Two Sides* · P3 50–20% *Unravelling* · **20%: dialog** · P4 20–0% *The Thread* |
| Enrage | 13:00 — *Unmade*: the platforms fall (a one-shot with 3.0 s warning) |

**Arena:** the Loom Beyond, **inside the Underside** — so there is no Rift Drain here. Instead the **Waking** is the risky side:
a rift here leads back to a Waking copy of the platform for 20 s at a time (same drain and limit rules, reversed).

**P1 — The Knot (100–75%)**, on one 44 m platform.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Unmaking Touch | melee + **Unravelled** (−5% maximum health, 60 s, stacks) | — | 26 %HP | tank handoff at 3 (page 11 §16); the **mend-threads** are its Cleansing Pool (1 stack a second) |
| **Loose Ends** | white threads from it to 3 players, pulling at 2 m/s | 1.8 s | a player who reaches it: 60 %HP and knocked back 10 m | walk away for 8 s; the threads snap |
| **Knot** | 2 orange **soaks** 5 m, **2 pips** each, at opposite corners | 3.0 s | 70 %HP split each | two pairs (the tank stays) |
| Fray | 4 purple-black **void zones** 5 m, 60 s | 1.5 s | 5 %HP / 0.5 s | drop at the edge |
| Unwind | room-wide every 30 s | 2.0 s | 20 %HP | heal |

**P2 — Two Sides (75–50%).** It splits: **the Weft** (on this platform) and **the Warp** (in the Waking copy) share health. The
party splits **3 / 2**: the tank, the healer and one more on the Weft; two players on the Warp, with the Warp side's
mend-threads for healing (§2.11).

| Ability | Side | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|---|
| **Weft Cross** | Weft | red **cross** 44 m × 6 m | 2.0 s | 50 %HP | diagonals |
| **Warp Rings** | Warp | rings rolling out from the Warp (**moving wave**), one blue gap | 2.0 s | 40 %HP | through the gap |
| **Across** | both | every red zone on one side appears on the **other** side 3 s later, at the same spot | +3 s | as the source | each side calls its zones to the other (voice or party chat) |
| Rejoin | both | if the two halves' health differs by more than 5%, the stronger heals to match | — | — | balance damage |

**P3 — Unravelling (50–20%).** The platform breaks into **5 floating stones** (12 m each). It becomes a storm of threads that
moves between the stones.

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| **Pull a Thread** | one stone (white outline) unravels and falls in 6 s | 6.0 s | a fall: 50 %HP and back to the S5 edge | step to a neighbouring stone (gaps are 3 m; a thread bridge closes one to 1.5 m) |
| Thread Bridge | green **beneficial** threads join two stones for 10 s (walkable) | — | — | cross on them |
| **Checker of Stones** | 2 of the 5 stones light red | 1.8 s | 55 %HP | be on an unlit stone |
| **Tangle** | white lines between 2 pairs of players; each pair must be on **different** stones | 1.8 s | same stone: 10 %HP a second each | split the pairs |
| Everything Frays | +5% damage every 20 s (soft enrage) | — | — | push |

**Saelith's help** (if she joined): once in P2 and once in P3 she stops Rift Drain for the Waking side for 20 s (*"Hold,
children. I have the door."*).

**Dialog opportunity — "Let go"** (at 20%, before the Thread; always offered; the party votes). The threads form a face: *"You
are made of me. Everything is made of me, one strand wide. Let go, and rest."*

| Reply | Result |
|---|---|
| *Say nothing.* | P4 |
| "No." | P4, and the party gets **Resolve of the March** (+10% damage, P4 only) |
| *(the Secret's first half is done at Saelith, and every player carries a Hearthvale Coal)* "The March is dreaming. We are the dream, and we are waking up." | the Loom **burns** from the coals: P4 skips its first Cut; on the Unwoven's death the whole Underside lights up — the Secret |

**P4 — The Thread (20–0%).** The storm pulls into the **Loom** (a structure on the centre stone). Every player is given one
**Thread** (a white tether from them to the loom).

| Ability | Shape / colour | Warn | Damage | Counterplay |
|---|---|---|---|---|
| Weave the World Back (players) | the Loom takes damage only from players whose Thread is **tight** (standing 12–16 m from it; the tether glows gold when tight) | — | — | stand in the ring 12–16 m from the loom |
| **Snarl** | 3 red cones 40° from the loom, rotating | 2.0 s | 50 %HP | move round the ring with them, thread tight |
| **Cut** | 2 players' threads are cut: they must touch the loom (walk in) within 6 s to re-tie, crossing the snarl cones | 2.0 s | not re-tied: they fall out of the platform (50 %HP and back to the edge after 5 s) | the cut players go in on a gap and come back out |
| Last Unwinding | room-wide every 10 s | 1.5 s | 15 %HP, +20% each | the final burn |

**Dialog:** pull — *"Ah. The last knots."* · Loose Ends ⚠ — *"Come apart. It doesn't hurt."* · P2 — *"Two of me. Two of you. Twice the unmaking."* · P3 (banner) — *"The floor is only a story you told yourselves."* · Cut ⚠ — *"Snip."* · death — *"...woven... again..."*
**Challenge:** P2's Across mirrors after 2 s instead of 3; P3 has 4 stones; P4's Cut hits 3 players. **Deep tuning:** Fray places 5 zones.
**Depth list** (page 11 §22.2): ① `mech_tether_share` Shared Strand: two players share damage for 10 s · ② `mech_spark_runner` loose ends running along the stones · ③ `mech_purge_buffs` Unpick the Weave: removes one buff from everyone.
**Loot:** `it_loom_breaker_axe` (two-handed axe), `it_thread_of_the_world` (ring), `it_unmade_plate` (heavy chest), `it_weft_and_warp_bow` (bow), `set_spirewoven` pieces (head, feet), `leg_unwoven_spindle` **[D-EXCL]** — off-hand focus or shield legendary: every 10 s your next hit ties the target to up to 3 nearby enemies with threads for 6 s; 40% of damage dealt to any of them is dealt to all.

### Secret boss — `b_marchheart` — The Marchheart, the Wildmarch Dreaming

**Unlock:**
1. **Every player** in the party carries a **Hearthvale Coal** (`it_hearthvale_coal`, Quest item; was the "Hearthvale Ember"):
   the prize of page 14's longest quest, **"The Long Carry"** (proposed id `q_the_long_carry`; page 14 owns it): starting at
   Brightwater's hearth in Hearthvale, carry a live coal to a shrine in **each of the eleven regions** (a region with a world
   boss, page 13: the shrine opens after that world boss is killed once; Hearthvale, Mossfen and Spire Isle, which have none:
   after a named rare of the region, page 10) and back to the Spire. It echoes the pitch: *everyone starts with a small fire to carry.*
2. At Saelith, the reply "We carry the first fire of the March."
3. At the Unwoven, the reply "The March is dreaming..." — then kill it.

The Underside lights up; a door made of every region's colours opens onto the **Dreaming March**.
Journal hint: *"The land has been asleep the whole time. Something that is asleep can be woken, if you bring it a little of
every place it dreamed."*

| Field | Value |
|---|---|
| Body | creature titan ×8, a giant made of the continent: legs of Hearthvale green, a body of Greyridge stone and Sunscar sand, arms of Whisperwood bark and Frostmantle ice, a head of Kingsfire's glowing rock with Riftmarch stones orbiting it, warm pale-gold eyes |
| Health | 400 H |
| Phases | ten region phases of 10% each, then the finale (below) |
| Rule | **It is not evil — it is waking up, and it does not know you are there.** Its attacks are the land's: each phase moves the fight to one region's wedge and uses that region's **world boss** signature mechanic (page 13), re-tuned for five |
| Enrage | 13:00 — *The Dream Ends* (a one-shot with 3.0 s warning) |

| Phase (health) | Region wedge | Borrowed from (page 13's world boss) | Five-player version |
|---|---|---|---|
| 100–90% | Hearthvale / Mossfen | the Harvest Effigy (`b_harvest_effigy`, seasonal — these regions have no regional world boss) | **Harvest Ring**: a red **donut** 4–14 m, then a **soak** 2 pips |
| 90–80% | Greyridge | Grief-in-Iron (`b_grief_in_iron`) | **Ironmuster**: a red **cross** + iron-plate stacks on the tank (handoff at 3; a quarry pool is the Cleansing Pool) |
| 80–70% | Sunscar | the Glass Wyrm (`b_glass_wyrm`) | **Glass Storm**: burrow lines + glass **void zones** |
| 70–60% | Whisperwood | the Hungering Brood (`b_hungering_brood`) | **Brood Web**: a white tether pair + 2 egg adds |
| 60–50% | Cinder Steppe | the Carrion Crown (`b_carrion_crown`) | **Carrion Circles**: dive lines + circling shadows (yellow targeted) |
| 50–40% | Frostmantle | the Standing Ruin (`b_standing_ruin`) | **Stone-fall**: blockers fall; a **line-of-sight** roar |
| 40–30% | Drowned Coast | the Sallow King (`b_sallow_king`) | **Sallow Tide**: rising water + a curse to dispel |
| 30–20% | Riftmarch | the Unmoored (`b_unmoored`) | **Unmoored**: floating platforms + one gravity flip |
| 20–10% | Kingsfire | Slagborn (`b_slagborn`) | **Slag Rain**: lava **void zones** + a soak 3 pips |
| 10–0% | **all of it** | — | **The March Wakes**: the party must stand on the wedge of the region named in the banner every 8 s (a blue **safe zone** that moves round the continent); room-wide 10 %HP every 5 s, +10% each |

(Page 13 owns these bosses and their mechanics; this table only borrows one signature mechanic from each.)

**Dialog opportunity — "Was it a good dream?"** (at 10%; the party votes). The giant stops and looks down, for the first time
seeing people: *"...Small ones. Were you in my dream? Was it a good dream?"*

| Reply | Result |
|---|---|
| *Say nothing.* | the last 10% as written; it lies down by itself at 0% — *"Then I will dream a little longer."* |
| "It was a good dream." | it smiles; the last 10% is skipped and the fight ends as a win. Title *"Dreamkeeper"* |
| "It was a hard one. We stayed anyway." | as reply 2, and every player gets `it_marchheart_seed` (a keepsake: a potted seedling that grows a tiny copy of the region you last levelled in; housing itself is in `WISHLIST.md`) |

**Dialog** (the deepest voice in the game, slow, warm): pull — *"...Mm. Something is warm in my hand."* · each region change (banner) — *"Now it is {region}. I remember {region}."* · The March Wakes (banner) — *"Everywhere at once — oh, it's so big."* · end — *"Sleep well, small ones. I'll keep dreaming you."*
**Challenge:** from 90% each region's mechanic keeps running into the next phase (two at once). **Deep tuning:** The March Wakes calls a new wedge every 7 s.
**Depth list** (page 11 §22.2): ① `mech_rolling_boulders` foothills roll down the wedges · ② `mech_wind_push` the continent's weather sweeps across · ③ `mech_echo_repeat` each region's mechanic repeats once, 1.5 s later.
**Loot:** `leg_heart_of_the_march` **[SECRET] [D-EXCL]** — neck legendary (was `leg_first_torch`, a light-slot item), **guaranteed once per account** (the only guaranteed legendary in the game; tradeable like everything else, but the guarantee is per account): every ability you use is 2% stronger for each region of the Wildmarch you have fully explored (max +22% for all eleven). `leg_dream_of_the_march` **[SECRET] [D-EXCL]** — any weapon type (chosen from your class's list when it drops), one player per kill: every 30 s you gain a region's blessing in turn — Hearthvale (heal 10%), Mossfen (your hits poison), Greyridge (+20% armour), Sunscar (+15% haste), Whisperwood (regeneration), Cinder Steppe (+15% damage), Frostmantle (your hits freeze 0.5 s), Drowned Coast (5% life steal), Riftmarch (your dodge roll teleports), Kingsfire (+30% critical damage), Spire Isle (+10% to all of the above) — each lasts 30 s. Also `it_continent_shard_staff` (staff), `it_every_road_boots` (feet, any armour type — takes the looter's), mount `it_mount_marchheart_colossus` (a small walking land-giant in the continent's colours) 2% per player, title *"Dreamkeeper"*.

### Set dropped here

`set_spirewoven` — Spirewoven Raiment (6 pieces: hands, shoulders, legs, chest, head, feet; any armour type — takes the looter's;
was `set_veilwoven`). Brief (page 09 writes it): 2 = +5% damage and healing, +10% to enemies in the other realm while you are in
the Underside, 4 = your first ability after crossing a rift deals +40%, 6 = once every 90 s, when you would die, you slip into the
Underside for 4 s (untargetable, healing 25% a second) and step back out.


**Class endgame sets** (the sets the class files moved here from the old raids; page 09 indexes them). On **Challenge**, each
boss below gives every player, once a week (the Challenge lock, Monday 06:00), a **35%** chance at a **class set token**
(`it_token_<slot>`) for its slot; the token becomes that slot's piece of whichever of **your class's** sets names this dungeon
as its source (if two do, you choose). Sub-bosses give none. From **Deep 10**, this dungeon's Depth Cache adds an **8%** roll
for one of these tokens (§2.4.6).

the Threshold → **hands** · the Horologe → **shoulders** · the Mirror Court → **legs** · Saelith → **chest** · the Unwoven → **head** and **feet** · the Marchheart (secret) → a token for **any slot** you choose.

---

## 21. Indexes

Generated from the sections above (a data test should regenerate and compare, page 16).

### 21.1 Dungeon summary

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
| d14 | 58–60 | `b_the_ash_scribe`, `b_cinderbrood` | `b_relic_custodian`, `b_high_ashpriest_morvaine`, `b_ashwing` | `b_sarn_veydrec_herald` | `b_ashmother_veyra` | 5 seals broken + no deaths + refuse the Herald's offer |
| d15 | 60 | `b_kennelmaster_varro`, `b_lady_ivrette` | `b_cinderjaw`, `b_three_petitioners`, `b_forgequeen_hesta`, `b_vaelkyr_firewing` | `b_fire_king_kaedros` | `b_ysa_varn_kindled` | stand with Ash and keep Sabeth alive (Ysa's Ribbon); spare Hesta's apprentice (Kiln Key Fragment); "Ysa sends her ribbon back" to the King |
| d16 | 60 | `b_grey_and_greyer`, `b_many_mouthed` | `b_threshold`, `b_horologe`, `b_mirror_court`, `b_saelith_spirewarden` | `b_unwoven` | `b_marchheart` | every player carries a Hearthvale Coal; the right replies to Saelith and to the Unwoven |

### 21.2 Every boss (102 encounters; component ids of shared-health and paired bosses listed with them)

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
| `b_cinderbrood` | Cinderbrood | sub | d14 |
| `b_relic_custodian` | The Relic Custodian | main | d14 |
| `b_high_ashpriest_morvaine` | High Ashpriest Morvaine | main | d14 |
| `b_ashwing` | Ashwing, the Reliquary Phoenix | main | d14 |
| `b_sarn_veydrec_herald` | Sarn Veydrec, Herald of the Fire King | end | d14 |
| `b_ashmother_veyra` | Ashmother Veyra, Keeper of the Oldest Coal | secret | d14 |
| `b_kennelmaster_varro` | Kennelmaster Varro, with Scorch and Soot (`b_hound_scorch`, `b_hound_soot`) | sub | d15 |
| `b_lady_ivrette` | Lady Ivrette, the Court Poisoner | sub | d15 |
| `b_cinderjaw` | Cinderjaw, the Gate That Walks | main | d15 |
| `b_three_petitioners` | The Three Petitioners (`b_petitioner_sabeth`, `b_petitioner_dorrin`, `b_petitioner_oruk`) | main | d15 |
| `b_forgequeen_hesta` | Forge-Queen Hesta | main | d15 |
| `b_vaelkyr_firewing` | Vaelkyr, the Firewing Consort | main | d15 |
| `b_fire_king_kaedros` | Kaedros, the Fire King (Maelor Varn) | end | d15 |
| `b_ysa_varn_kindled` | Ysa Varn, the Kindled Child | secret | d15 |
| `b_grey_and_greyer` | Grey and Greyer, the Rift Hounds (`b_rifthound_grey`, `b_rifthound_greyer`) | sub | d16 |
| `b_many_mouthed` | The Many-Mouthed | sub | d16 |
| `b_threshold` | The Threshold | main | d16 |
| `b_horologe` | The Horologe | main | d16 |
| `b_mirror_court` | The Mirror Court (`b_mirror_reflection_<class>`, one per party member) | main | d16 |
| `b_saelith_spirewarden` | Saelith, the Spirewarden | main | d16 |
| `b_unwoven` | The Unwoven | end | d16 |
| `b_marchheart` | The Marchheart, the Wildmarch Dreaming | secret | d16 |

### 21.3 Every dungeon monster (149 rows, 148 distinct — the Sandcaller is listed in d05 and d06; d15 and d16 reuse d13's Legionnaire, Arbalest and Cinder Imp and d12's Rift Shard without a new row; page 10 owns the families and AI; every id now uses one of page 10's 18 families — §21.7 lists the old `m_humanoid_*`/`m_aberration_*`/`m_elemental_*`/`m_fiend_*`/`m_dragonkin_*` ids)

| id | Name | Body | H | First seen |
|---|---|---|---|---|
| `m_undead_barrow_shambler` | Barrow Shambler | chibi2 undead, grave rags, bare hands | 1 | d01 |
| `m_undead_barrow_bowman` | Barrow Bowman | chibi2 undead, short bow | 0.8 | d01 |
| `m_beast_cairn_rat` | Cairn Rat | creature rat ×1.6 | 0.3 | d01 |
| `m_undead_grave_hound` | Grave Hound | creature hound ×1.3, bone-plated | 1 | d01 |
| `m_undead_bone_mender` | Bone Mender | chibi2 undead, robe, bone staff | 0.8 | d01 |
| `m_folk_grave_robber` | Grave Robber | chibi2 human, hood, shovel | 1 | d01 |
| `m_undead_barrow_guard` | Barrow Guard (elite) | chibi2 undead ×1.3, round shield, hand axe | 3 | d01 |
| `m_beast_tomb_moth` | Tomb Moth | creature moth ×1.3, grey | 0.5 | d01 |
| `m_undead_drowned_millhand` | Drowned Millhand | chibi2 undead, waterlogged smock, sack hook | 1 | d02 |
| `m_beast_fen_leech` | Fen Leech | creature worm ×0.5, pale green | 0.4 | d02 |
| `m_beast_bog_croaker` | Bog Croaker | creature frog ×1.7 | 1 | d02 |
| `m_fen_bog_slime` | Bog Slime | creature slime ×1.3, peat brown | 1.5 | d02 |
| `m_folk_fen_poacher` | Fen Poacher | chibi2 human, reed hat, crossbow | 1 | d02 |
| `m_fen_marsh_lure` | Marsh Lure | creature wisp ×1.0, sickly green-white | 0.6 | d02 |
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
| `m_construct_firedamp` | Firedamp Pocket | creature wisp ×1.2, dull orange, does not move | 0.5 | d03 |
| `m_beast_gravelmaw_grub` | Gravelmaw Grub | creature worm ×0.7, grey | 0.4 | d03 |
| `m_orc_ashtusk_cutthroat` | Ashtusk Cutthroat | chibi2 orc, hide armour, two axes | 1 | d04 |
| `m_orc_ashtusk_spearman` | Ashtusk Spearman | chibi2 orc, long spear, round shield | 1.2 | d04 |
| `m_orc_ashtusk_bonecaller` | Ashtusk Bonecaller | chibi2 orc, bone mask, rattle staff | 0.9 | d04 |
| `m_orc_ashtusk_forgebrute` | Ashtusk Forgebrute (elite) | chibi2 orc ×1.8, smith's apron, sledge | 3.5 | d04 |
| `m_beast_forge_hound` | Forge Hound | creature hound ×1.4, cinder-coated | 1 | d04 |
| `m_demon_slag_imp` | Slag Imp | creature imp ×1.0, dripping molten | 0.5 | d04 |
| `m_kingsfire_cinder_spawn` | Cinder Spawn | creature elemental ×0.8, fire | 0.8 | d04 |
| `m_construct_anvil_sentinel` | Anvil Sentinel (elite) | creature golem ×2.0, anvil-headed dwarf construct in orc chains | 3 | d04 |
| `m_orc_ashtusk_whipmaster` | Ashtusk Whipmaster | chibi2 orc, whip, keys on belt | 1 | d04 |
| `m_undead_glass_mummy` | Glass-Wrapped Dead | chibi2 undead, linen wraps studded with glass | 1.2 | d05 |
| `m_undead_tomb_attendant` | Tomb Attendant | chibi2 undead, gold collar, oil jar | 0.9 | d05 |
| `m_undead_sun_priest_husk` | Sun-Priest Husk | chibi2 undead, sun-disc headdress | 1 | d05 |
| `m_construct_glass_sentinel` | Glass Sentinel (elite) | creature golem ×1.8, clear glass with a gold core | 3.5 | d05 |
| `m_sand_prism_shard` | Prism Shard | creature shard ×1.3, clear with rainbow edges | 0.6 | d05 |
| `m_beast_dune_scarab` | Dune Scarab | creature beetle ×0.8, gold | 0.3 | d05 |
| `m_beast_glasstail_skitterer` | Glasstail Skitterer | creature spider ×1.3, sand colour, glass-tipped tail (new feature `stinger`, §22) | 1 | d05 |
| `m_folk_dunecutter_cutthroat` | Dunecutter Cutthroat | chibi2 human, desert wraps, curved knives | 1 | d05 |
| `m_folk_dunecutter_sandcaller` | Dunecutter Sandcaller | chibi2 human, face-wrap, staff | 0.9 | d05 |
| `m_beast_tomb_asp` | Tomb Asp | creature snake ×1.8, gold and black | 1 | d05 |
| `m_construct_vault_warden` | Vault Warden (elite) | creature golem ×2.0, brass and sandstone, key-shaped head | 3.5 | d06 |
| `m_construct_brass_scarab` | Brass Scarab | creature beetle ×1.0, brass (construct) | 0.4 | d06 |
| `m_sand_sand_wraith` | Sand Wraith | creature wraith ×1.3, sand-coloured, dissolving hem | 1 | d06 |
| `m_sand_dust_devil` | Dust Devil | creature elemental ×1.0, whirl of sand (new `whirl` variant, §22) | 0.8 | d06 |
| `m_folk_dunecutter_tunneler` | Dunecutter Tunneler | chibi2 human, goggles, shovel | 1 | d06 |
| `m_folk_dunecutter_hexblade` | Dunecutter Hexblade | chibi2 human, silver-inlaid scimitar | 1 | d06 |
| `m_folk_dunecutter_sandcaller` | Dunecutter Sandcaller | (as d05) | 0.9 | d06 |
| `m_beast_vault_asp` | Vault Asp | creature snake ×1.6, black and gold bands | 1 | d06 |
| `m_sand_coin_mimic` | Coin Mimic | creature mimic ×1.1, coin-heap shape | 1.5 | d06 |
| `m_beastkin_thornmane_ravager` | Thornmane Ravager | chibi2 beastkin (wolf-headed), thorn-wrapped arms | 1.2 | d07 |
| `m_beastkin_thornmane_skulker` | Thornmane Skulker | chibi2 beastkin, lean, bone knives | 1 | d07 |
| `m_beastkin_thornmane_moonseer` | Thornmane Moonseer | chibi2 beastkin, antler headdress, thorn staff | 0.9 | d07 |
| `m_beast_bramble_wolf` | Bramble Wolf | creature wolf ×1.4, thorns grown through the fur | 1 | d07 |
| `m_beast_silkrot_spider` | Silkrot Spider | creature spider ×1.4, grey-violet | 1 | d07 |
| `m_fae_blight_sporecap` | Blight Sporecap | creature mushroom ×1.3, violet with grey spots | 0.8 | d07 |
| `m_fae_strangle_vine` | Strangle Vine | creature snake ×2.4, green-black, rooted (does not move) | 1.2 | d07 |
| `m_fae_blight_wisp` | Blight Wisp | creature wisp ×1.1, sick green | 0.5 | d07 |
| `m_beast_carrion_moth` | Carrion Moth | creature moth ×1.6, brown | 0.6 | d07 |
| `m_undead_moonwell_sentinel` | Moonwell Sentinel (elite) | chibi2 elf ghost ×1.6, silver plate, glaive (material `ghost_silver`, §22) | 3.5 | d08 |
| `m_undead_pale_huntress` | Pale Huntress | chibi2 elf ghost, longbow | 1 | d08 |
| `m_undead_weeping_acolyte` | Weeping Acolyte | chibi2 elf ghost, robes | 0.9 | d08 |
| `m_fae_moon_wisp` | Moon Wisp | creature wisp ×1.2, silver-white | 0.5 | d08 |
| `m_beast_silverwing_owl` | Silverwing Owl | creature owl ×1.8, white | 1 | d08 |
| `m_beast_lamp_moth` | Moonmoth | creature moth ×1.5, pale blue | 0.5 | d08 |
| `m_fae_starless_eye` | Starless Eye | creature horror ×0.9, one great eye, few tentacles | 0.8 | d08 |
| `m_fae_well_drinker` | Well-Drinker | creature horror ×1.6, silver-veined black | 1.8 | d08 |
| `m_fae_moonshard_cluster` | Moonshard Cluster | creature shard ×1.2, silver | 0.7 | d08 |
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
| `m_dragon_rime_whelp` | Rime Whelp | creature drake ×1.2, white | 1 | d10 |
| `m_frost_frost_shard` | Frost Shard | creature shard ×1.3, blue-white | 0.7 | d10 |
| `m_frost_snow_wraith` | Snow Wraith | creature wraith ×1.4, white | 1 | d10 |
| `m_beast_ice_worm` | Ice Borer | creature worm ×1.8, white | 1.3 | d10 |
| `m_undead_drowned_parishioner` | Drowned Parishioner | chibi2 undead (human), Sunday clothes rotted, barnacles | 1 | d11 |
| `m_undead_brine_chorister` | Brine Chorister | chibi2 undead, choir robe, a mouth that leaks seawater | 1 | d11 |
| `m_undead_barnacled_templar` | Barnacled Templar (elite) | chibi2 undead ×1.5, plate crusted in barnacles, a greatsword | 4 | d11 |
| `m_undead_bellringer_ghoul` | Bellringer Ghoul | chibi2 undead, hunched, hand-bell | 0.8 | d11 |
| `m_beast_saltshell_crab` | Saltshell Crab | creature beetle ×1.5 re-skinned as a crab (new `crab` type, §22) | 1.2 | d11 |
| `m_beast_deep_eel` | Deep Eel | creature snake ×2.2, pale | 1 | d11 |
| `m_drowned_lantern_gulper` | Lantern Gulper | creature frog ×2.2, deep-sea colours, a glowing lure on a stalk (new feature `lure`, §22) | 1.8 | d11 |
| `m_drowned_brine_elemental` | Brine Elemental | creature elemental ×1.5, seawater | 1.5 | d11 |
| `m_drowned_salt_lamprey` | Salt Lamprey | creature worm ×0.8, grey | 0.4 | d11 |
| `m_construct_half_made_golem` | Half-Made Golem (elite) | creature golem ×2.0, one arm missing, wires trailing, violet core | 4 | d12 |
| `m_construct_clockwork_hound` | Clockwork Hound | creature hound ×1.4, brass plates, key in its back | 1 | d12 |
| `m_construct_brass_sentry` | Brass Sentry | creature turret ×1.3 | 1.2 | d12 |
| `m_construct_scrap_swarm` | Scrap Swarm | creature beetle ×0.7, bolts and springs | 0.4 | d12 |
| `m_rift_rift_tatter` | Rift Tatter | creature wraith ×1.5, violet-black, edges flickering | 1.2 | d12 |
| `m_rift_rift_shard` | Rift Shard | creature shard ×1.4, violet | 0.8 | d12 |
| `m_rift_unmade_thing` | Unmade Thing | creature horror ×1.6, half-constructed: brass ribs, tentacles | 2 | d12 |
| `m_construct_mirror_mannequin` | Mirror Mannequin | chibi2 human ×1.2, mirror-glass skin, no face | 1.2 | d12 |
| `m_folk_riftwatch_deserter` | Riftwatch Deserter | chibi2 human (any), Riftwatch coat, rift staff | 1 | d12 |
| `m_kingsfire_legionnaire` | Kingsfire Legionnaire | chibi2 human, black plate with red-glass inlay, tower shield, short sword | 1.5 | d13 |
| `m_kingsfire_arbalest` | Kingsfire Arbalest | chibi2 human, heavy crossbow | 1.2 | d13 |
| `m_kingsfire_pyre_priest` | Pyre Priest | chibi2 human, ash-grey robes, a brazier-staff | 1.2 | d13 |
| `m_kingsfire_knight_captain` | Kingsfire Knight-Captain (elite) | chibi2 human ×1.5, great helm, flame-edged greatsword | 4.5 | d13 |
| `m_kingsfire_cinder_imp` | Cinder Imp | creature imp ×1.1 | 0.5 | d13 |
| `m_demon_slagback_hound` | Slagback Hound | creature hound ×1.8, black with lava cracks | 1.5 | d13 |
| `m_kingsfire_magma_elemental` | Magma Elemental | creature elemental ×1.8, lava | 2 | d13 |
| `m_demon_gate_brute` | Gate Brute (elite) | creature titan ×1.5, fiendish, chains wrapped round the arms | 5 | d13 |
| `m_construct_legion_ballista` | Legion Ballista | creature turret ×1.6 (a ballista on wheels) | 1.5 | d13 |
| `m_kingsfire_ash_priest` | Ash Priest | chibi2 human, grey skin, eyes sewn shut, a bone censer | 1.3 | d14 |
| `m_kingsfire_ash_zealot` | Ash Zealot | chibi2 human, ash-smeared, two burning sickles | 1.5 | d14 |
| `m_undead_ash_wraith` | Ash Wraith | creature wraith ×1.6, grey ash, coal-red eyes | 1.5 | d14 |
| `m_construct_relic_golem` | Relic Golem (elite) | creature golem ×2.4, obsidian with a gold reliquary chest | 5 | d14 |
| `m_demon_cinder_cantor` | Cinder Cantor | creature imp ×1.3, with a tiny bell | 0.8 | d14 |
| `m_beast_ash_phoenixling` | Phoenixling | creature phoenix ×1.0 | 0.7 | d14 |
| `m_undead_burned_hero` | Burned Hero (elite) | chibi2 (any race) undead ×1.6 in burned plate — relics of heroes the King burned; each wears a random old dungeon set's look | 4 | d14 |
| `m_kingsfire_cinder_sprite` | Cinder Sprite | creature elemental ×0.8 | 0.5 | d14 |
| `m_kingsfire_reliquary_mimic` | Reliquary Mimic | creature mimic ×1.8, a gold reliquary | 3 | d14 |
| `m_kingsfire_pyrecaller` | Legion Pyrecaller | chibi2 orc, fire-binder's robes | 1.2 | d15 |
| `m_kingsfire_court_courtier` | Poisoner Courtier | chibi2 elf, silk court coat, `top_hat` | 1 | d15 |
| `m_kingsfire_court_guard` | Court Guard (elite) | chibi2 human ×1.5, gilded `great_helm`, halberd | 5 | d15 |
| `m_construct_forged_legionnaire` | Forged Legionnaire | creature golem ×1.8, black iron | 2 | d15 |
| `m_construct_obsidian_sentinel` | Obsidian Sentinel (elite) | creature golem ×2.6, obsidian, lava seams | 5.5 | d15 |
| `m_kingsfire_cinder_elemental` | Cinder Elemental | creature elemental ×2.4, fire | 2 | d15 |
| `m_kingsfire_living_cinder` | Living Cinder | creature wisp ×1.0, orange | 0.2 | d15 |
| `m_beast_ash_hound` | Ash Hound | creature hound ×1.8, charcoal | 1.2 | d15 |
| `m_beast_magma_salamander` | Magma Salamander | creature crocodile ×2.0, lava seams | 2.2 | d15 |
| `m_dragon_fire_whelp` | Fire Whelp | creature drake ×1.2, red-gold | 0.8 | d15 |
| `m_dragon_firewing_drake` | Firewing Drake (elite) | creature drake ×2.6, wings | 5 | d15 |
| `m_tear_rift_shade` | Rift Shade | creature wraith ×1.6, grey-blue, white outline | 1.5 | d16 |
| `m_tear_rift_stalker` | Rift Stalker | creature saber_cat ×2.0, translucent white | 2 | d16 |
| `m_construct_threshold_warden` | Threshold Warden (elite) | creature golem ×2.6, pale stone | 5 | d16 |
| `m_construct_clockwork_sentry` | Clockwork Sentry | creature turret ×2.0, brass | 1.5 | d16 |
| `m_construct_escapement` | Escapement | creature golem ×1.6, brass gears | 1.2 | d16 |
| `m_folk_spire_sentinel` | Spire Sentinel (elite) | chibi2 elf ×1.5, silver helm, glaive | 5 | d16 |
| `m_folk_spire_seer` | Spire Seer | chibi2 elf, hood, orb | 1.5 | d16 |
| `m_beast_moth_of_memory` | Memory Moth | creature moth ×1.4, white | 0.3 | d16 |
| `m_tear_the_mouth` | Mouth | creature worm ×2.4, open maw | 2 | d16 |
| `m_tear_loom_spider` | Loom Spider | creature spider ×2.4, white | 2.5 | d16 |
| `m_tear_loose_thread` | Loose Thread | creature wisp ×1.4, white threads | 0.5 | d16 |

Boss adds that are not in a trash table: `m_construct_shard_guard` (d05 King Sethar's Shard Guards, 2 H, creature shard ×1.6, melee 10 %HP; dies at once inside a beam). Named trash: **Grip** (d01, a Grave Hound with a collar), **Lug** and **Mugg** (d03, Sootwick Brutes). d15 boss adds: Varro's **Scorch** and **Soot** (`b_hound_scorch`, `b_hound_soot`); d16: the **Gullet Knot** (8 H object in the Many-Mouthed's stomach) and **Mouths**. Depth adds each family's Depth type and Depth warden (page 10 §7.9.2).

### 21.4 Dungeon-exclusive uniques and legendaries (for page 09) — 135 items (84 uniques, 15 souls, 36 legendaries — 17 of them [SECRET])

Every item below is **[D-EXCL]**. `secret` = **[SECRET]** legendary from the secret boss.

| id | Kind | Slot / type | Drops from | Dungeon |
|---|---|---|---|---|
| `uq_crown_of_teeth` | unique | helm, light | `b_warren_queen_skritch` | d01 |
| `uq_pells_quiet_hood` | unique | head, light | `b_pell_lantern_thief` | d01 |
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
| `soul_stonegullets_gizzard` | soul | armour socket: chest | `b_stonegullet` | d03 |
| `leg_worm_king_mandible` | legendary | weapon legendary (two-handed axe or mace, takes the looter's preferred type) | `b_stonegullet` | d03 |
| `uq_goldvein_signet` | unique | ring | `b_the_unmined` | d03 |
| `leg_heart_of_the_unmined` | secret | chest legendary | `b_the_unmined` | d03 |
| `uq_matched_tongs` | unique | gloves | `b_grukk_and_zagga` | d04 |
| `soul_slag_heart` | soul | weapon socket | `b_slagmaw` | d04 |
| `uq_orc_steel_pauldrons` | unique | heavy shoulders | `b_forgemaster_ghorza` | d04 |
| `uq_chained_flame_link` | unique | ring | `b_the_great_bellows` | d04 |
| `uq_throne_of_the_keep_signet` | unique | ring | `b_grumvak_kilnbreaker` | d04 |
| `leg_kilnbreakers_oath` | legendary | two-handed axe legendary | `b_grumvak_kilnbreaker` | d04 |
| `uq_bellamund_hammerhand` | unique | gloves | `b_bellamund_the_cold_smith` | d04 |
| `leg_the_cold_anvil` | secret | off-hand (shield) legendary | `b_bellamund_the_cold_smith` | d04 |
| `soul_brood_mothers_gilt` | soul | any armour socket | `b_gilded_brood_mother` | d05 |
| `uq_saffas_bandolier` | unique | waist | `b_saffa_knifewind` | d05 |
| `uq_orruns_first_pane` | unique | off-hand | `b_orrun_the_glassblower` | d05 |
| `uq_second_glass_crown` | unique | helm | `b_queen_ammarel` | d05 |
| `uq_unshattered_gauntlets` | unique | heavy hands | `b_king_sethar_unshattered` | d05 |
| `leg_the_eleventh_century` | legendary | off-hand (focus or shield) legendary | `b_king_sethar_unshattered` | d05 |
| `uq_seventh_kings_signet` | unique | ring | `b_ithar_the_unseen` | d05 |
| `leg_the_unseen_prince` | secret | cloak legendary | `b_ithar_the_unseen` | d05 |
| `uq_the_coffers_tongue` | unique | neck | `b_coffer_that_counts` | d06 |
| `uq_hasks_lucky_shovel` | unique | off-hand | `b_hask_the_tunneler` | d06 |
| `uq_true_weight` | unique | waist | `b_scales_of_tamar` | d06 |
| `soul_the_stolen_oath` | soul | jewellery socket | `b_qassar_silver_tongued` | d06 |
| `uq_sovereigns_binding` | unique | waist | `b_the_sand_sovereign` | d06 |
| `leg_the_unbound_dune` | legendary | boots legendary | `b_the_sand_sovereign` | d06 |
| `uq_first_oath_signet` | unique | ring | `b_tamar_the_first` | d06 |
| `leg_water_of_tamar` | secret | neck legendary | `b_tamar_the_first` | d06 |
| `uq_web_of_the_matriarch` | unique | back | `b_silkrot_matriarch` | d07 |
| `uq_scent_of_blood` | unique | gloves | `b_rakka_bloodbriar` | d07 |
| `uq_mycelial_ring` | unique | ring | `b_the_sporefather` | d07 |
| `uq_thornlink_band` | unique | ring | `b_orenn_thornbound` | d07 |
| `uq_wyllows_last_leaf` | unique | neck | `b_wyllow_blighted_heart` | d07 |
| `leg_blightbreaker` | legendary | gloves legendary | `b_wyllow_blighted_heart` | d07 |
| `soul_seed_of_the_sovereign` | soul | weapon socket (casters) | `b_gall_sovereign` | d07 |
| `leg_wyllows_gratitude` | secret | off-hand focus legendary | `b_gall_sovereign` | d07 |
| `uq_dusk_scale_cloak` | unique | back | `b_gloamwing` | d08 |
| `uq_caeliths_last_arrow` | unique | quiver | `b_caelith_pale_huntress` | d08 |
| `uq_twin_bond_band` | unique | ring | `b_twin_wardens` | d08 |
| `uq_ilvandors_constant` | unique | neck | `b_archmage_ilvandor` | d08 |
| `uq_moon_drinkers_tooth` | unique | dagger | `b_oruvel_moon_drinker` | d08 |
| `leg_the_thirst` | legendary | neck legendary | `b_oruvel_moon_drinker` | d08 |
| `uq_crescent_of_lirath` | unique | off-hand | `b_the_drowned_moon` | d08 |
| `leg_the_moon_returned` | secret | ring legendary | `b_the_drowned_moon` | d08 |
| `soul_ogras_whistle` | soul | jewellery socket | `b_ogra_beastmaster` | d09 |
| `uq_death_roll_girdle` | unique | waist | `b_the_moatmother` | d09 |
| `uq_broken_chain` | unique | neck | `b_brannoc_the_chained` | d09 |
| `uq_bait_and_stake` | unique | boots | `b_razorback_rider_krunn` | d09 |
| `uq_favour_of_the_crowd` | unique | neck | `b_warmaster_drogath` | d09 |
| `leg_ashmanes_twin_cleavers` | legendary | one-handed axe legendary (a pair | `b_warmaster_drogath` | d09 |
| `uq_tallows_collar` | unique | neck | `b_old_gnash_undefeated` | d09 |
| `leg_the_undefeated` | secret | belt legendary | `b_old_gnash_undefeated` | d09 |
| `soul_hibernation` | soul | armour socket: chest or legs | `b_old_whitemaw` | d10 |
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
| `soul_the_full_church` | soul | jewellery socket (Support, Healer) | `b_bishop_aldwine` | d11 |
| `leg_bell_of_saltdeep` | legendary | off-hand legendary | `b_bishop_aldwine` | d11 |
| `uq_what_the_sea_keeps` | unique | ring | `b_the_tidewife` | d11 |
| `leg_heart_of_the_tidewife` | secret | chest legendary | `b_the_tidewife` | d11 |
| `soul_perpetual_cog` | soul | weapon socket | `b_cogheart_warden` | d12 |
| `uq_through_the_lens` | unique | off-hand | `b_mira_lensgrinder` | d12 |
| `uq_upside_down_charm` | unique | neck | `b_the_gravity_engine` | d12 |
| `uq_look_at_yourself` | unique | ring | `b_mirror_apprentices` | d12 |
| `soul_oddrins_last_letter` | soul | armour socket: feet | `b_oddrin_the_unmaker` | d12 |
| `leg_the_unmaking` | legendary | two-handed legendary (staff or weapon, looter's type) | `b_oddrin_the_unmaker` | d12 |
| `uq_cogheart` | unique | neck | `b_the_finished_thing` | d12 |
| `leg_the_finished_thing` | secret | hands legendary | `b_the_finished_thing` | d12 |
| `uq_torvens_sighting_lens` | unique | neck | `b_torven_ballista_master` | d13 |
| `uq_ilsabets_doubt` | unique | ring | `b_pyre_priestess_ilsabet` | d13 |
| `soul_varrows_key` | soul | any armour socket | `b_gatekeeper_varrow` | d13 |
| `uq_quench_seal` | unique | belt | `b_slag_colossus` | d13 |
| `uq_never_cold` | unique | heavy hands | `b_commander_kaelis` | d13 |
| `soul_gate_key` | soul | armour socket: shield or chest | `b_castellan_vorhane` | d13 |
| `leg_the_cindergate` | legendary | shield legendary | `b_castellan_vorhane` | d13 |
| `uq_banner_of_last_light` | unique | back | `b_first_flame_of_the_gate` | d13 |
| `leg_the_first_flame` | secret | two-handed legendary (the looter's type) | `b_first_flame_of_the_gate` | d13 |
| `uq_unwritten` | unique | neck | `b_the_ash_scribe` | d14 |
| `uq_twice_born` | unique | chest (any type) | `b_cinderbrood` | d14 |
| `soul_four_doors` | soul | weapon socket (casters) | `b_relic_custodian` | d14 |
| `uq_eyes_sewn_shut` | unique | helm | `b_high_ashpriest_morvaine` | d14 |
| `uq_first_burned_feather` | unique | neck | `b_ashwing` | d14 |
| `soul_the_kings_decree` | soul | jewellery socket | `b_sarn_veydrec_herald` | d14 |
| `leg_herald_of_ashes` | legendary | off-hand (banner/focus) legendary | `b_sarn_veydrec_herald` | d14 |
| `leg_reliquary_heart` | legendary | neck legendary | `b_sarn_veydrec_herald` | d14 |
| `uq_remember_the_roads` | unique | neck | `b_ashmother_veyra` | d14 |
| `leg_the_oldest_coal` | secret | neck legendary | `b_ashmother_veyra` | d14 |
| `uq_varros_leash` | unique | hands | `b_kennelmaster_varro` | d15 |
| `uq_ivrettes_gift` | unique | ring | `b_lady_ivrette` | d15 |
| `uq_cinderjaw_grille` | unique | shield | `b_cinderjaw` | d15 |
| `uq_petition_of_the_three_houses` | unique | neck | `b_three_petitioners` | d15 |
| `uq_hestas_apprentice_hammer` | unique | one-handed mace ("Tobbin's Hammer") | `b_forgequeen_hesta` | d15 |
| `leg_firewing_pinion` | legendary | two-handed staff or bow legendary | `b_vaelkyr_firewing` | d15 |
| `soul_the_kings_offer` | soul | jewellery socket | `b_fire_king_kaedros` | d15 |
| `leg_crown_of_kaedros` | legendary | head legendary | `b_fire_king_kaedros` | d15 |
| `uq_ysas_ribbon_band` | unique | ring | `b_ysa_varn_kindled` | d15 |
| `leg_kiln_heart` | secret | off-hand focus or shield legendary | `b_ysa_varn_kindled` | d15 |
| `uq_grey_collar` | unique | neck | `b_grey_and_greyer` | d16 |
| `uq_mouth_that_speaks_true` | unique | head | `b_many_mouthed` | d16 |
| `uq_threshold_lodestone` | unique | ring | `b_threshold` | d16 |
| `leg_horologe_mainspring` | legendary | ring legendary | `b_horologe` | d16 |
| `uq_horologe_pocketwatch` | unique | neck | `b_horologe` | d16 |
| `uq_mirror_of_the_court` | unique | off-hand focus | `b_mirror_court` | d16 |
| `uq_saelith_spindle` | unique | staff | `b_saelith_spirewarden` | d16 |
| `leg_unwoven_spindle` | legendary | off-hand focus or shield legendary | `b_unwoven` | d16 |
| `leg_heart_of_the_march` | secret | neck legendary (guaranteed once per account) | `b_marchheart` | d16 |
| `leg_dream_of_the_march` | secret | any weapon type legendary | `b_marchheart` | d16 |

### 21.5 Generic sets (page 09 writes the bonuses; the briefs above are the intent)

| Set | Dungeon | Armour | Pieces |
|---|---|---|---|
| `set_barrowwarden` | d01 | medium | 4 |
| `set_fenwader` | d02 | light | 4 |
| `set_deepshaft_harness` | d03 | heavy | 4 |
| `set_kilnbreaker_iron` | d04 | heavy | 4 |
| `set_sunglass_regalia` | d05 | cloth | 4 |
| `set_oathkeeper_bronze` | d06 | medium | 4 |
| `set_thornwarden_bark` | d07 | medium | 4 |
| `set_moonsilver_vigil` | d08 | cloth | 4 |
| `set_pitchampion_leathers` | d09 | light | 4 |
| `set_rimewarden_furs` | d10 | medium | 4 |
| `set_tidebound_vestments` | d11 | cloth | 4 |
| `set_unmakers_apron` | d12 | medium | 4 |
| `set_firebreaker_plate` | d13 | heavy | 5 |
| `set_reliquary_ash` | d14 | any (takes the looter's) | 6 |
| `set_kingsfire_regalia` | d15 | any (takes the looter's) | 6 |
| `set_spirewoven` | d16 | any (takes the looter's) | 6 |

Class endgame sets (the class files' own sets) drop as tokens from d15/d16 Challenge bosses and the Depth Cache (§2.7,
§d15 and §d16 *Set dropped here*); page 09 indexes them.

### 21.6 Quest items (not gear)

Every item here is a **Quest item** (it cannot be traded; canon 00 §12.1 W18). There are **no keys** and no key items.

| id | What | Where |
|---|---|---|
| `it_token_<slot>` | class set token (page 09) — gear, tradeable, listed here for completeness | d15/d16 Challenge bosses; d13/d14 Challenge end bosses; Depth Cache from Deep 10 |
| `it_thanes_ring`, `it_hounds_collar`, `it_horn_cup` | d01 grave goods | Pell's bargain, Grip, Ossuary Walk skull |
| `it_wrens_lullaby` | d02 lever order | Wren's truth reply |
| `it_mirror_shard` | d05 Ammarel's "Look for yourself" | Blowing House floor |
| `it_dunecutter_share` | d05 gold bag (opens into gold) | Saffa's bargain |
| `it_orenns_moon_charm` | d07 cleanse Wyllow | Orenn's doubt reply |
| `it_heartwood_seed` | d07 keepsake (cosmetic — page 08) | cleansed Wyllow |
| `it_firewood` | d10 brazier fuel | Stonehide trash (60%) |
| `it_automaton_cogheart`, `it_automaton_rift_lens`, `it_automaton_brass_hand`, `it_automaton_voice_box` | d12 secret parts | s1, s2, B1, B2 (100%) |
| `it_standard_of_last_light` | d13 carried standard (cannot be bagged) | Ser Aldric's body, Undercroft |
| `it_the_oldest_coal` | d14 secret reward; a carry-in for d15 (was `it_first_ember_lantern`'s quest role) | Ashmother Veyra |
| `it_ysas_ribbon` | d15 secret, half 1 | Sabeth, after the Petitioners (Ash allied, Sabeth alive) |
| `it_kiln_key_fragment` | d15 secret, half 2 | Forge-Queen Hesta's dialog |
| `it_heartflame` | the main story's Heartflame (page 14 owns it) | the Fire Throne, after Kaedros |
| `it_hearthvale_coal` | d16 secret: every player must carry one (was the "Hearthvale Ember") | page 14's "The Long Carry" |

### 21.7 Round 2 renames on this page (old → new)

| Old | New | Why |
|---|---|---|
| the 48 dungeon monster ids with the old prefixes `m_humanoid_*`, `m_aberration_*`, `m_elemental_*`, `m_fiend_*`, `m_dragonkin_*` (e.g. `m_humanoid_grave_robber`, `m_aberration_bog_slime`, `m_fiend_cinder_imp`, `m_fiend_ashhound` Ashhound, `m_elemental_rift_shard`, `m_dragonkin_fire_whelp`) | page 10's 18 families: `humanoid` → `folk` (or `kingsfire` for the Fire King's court and cult), `aberration`/`elemental` → the region's family (`fen`, `sand`, `fae`, `frost`, `drowned`, `rift`, `kingsfire`, `construct`, `beast`), `fiend` → `demon`, `dragonkin` → `dragon`. Two merge into page 10's open-world rows (`m_fen_bog_slime`, `m_kingsfire_cinder_imp`); the Ashhound becomes the **Slagback Hound** `m_demon_slagback_hound` (page 10 has an Ash Hound, `m_demon_ash_hound`, and page 08 an `it_mount_ash_hound`); the Salt Lamprey's id follows its name (`m_drowned_salt_lamprey`). Every §21.3 row shows the new id | page 10 §3/§13: an id's middle must be a page 10 family (consistency sweep) |
| `m_beastkin_thornmane_prowler` Thornmane Prowler | `m_beastkin_thornmane_skulker` Thornmane Skulker (page 10's id) | "Prowl" is banned |
| Heroic / Mythic+ rows | **Challenge:** / **Deep tuning:** + **Depth list** | W3, W4 |
| Ember Shrine (checkpoint) | **Brazier Shrine** | "ember" |
| `d03_deepdelve` "Deepdelve Mines" (and the zone `sz_deepdelve_slopes`) | `d03_shaft_seven` "Shaft Seven Mines" (`sz_shaft_seven_slopes`, page 01) | "delve" is banned (`_SWEEP_R2` §2) |
| `set_deepdelver` "Deepdelver's Harness" | `set_deepshaft_harness` "Deepshaft Harness" | "Delver" is banned |
| `npc_delver_shieldbearer` / `_mender` / `_blade` / `_bow` | `npc_wayfarer_shieldbearer` / `_mender` / `_blade` / `_bow` | same |
| `set_emberbane_plate` "Emberbane Plate" | `set_firebreaker_plate` "Firebreaker Plate" | "ember" |
| `ember_bastion` (look) | `kingsfire_bastion` | "ember" |
| `m_ember_legionnaire`, `m_ember_arbalest`, `m_ember_pyre_priest`, `m_ember_knight_captain` | `m_kingsfire_legionnaire` (Kingsfire Legionnaire), `m_kingsfire_arbalest` (Kingsfire Arbalest), `m_kingsfire_pyre_priest`, `m_kingsfire_knight_captain` (Kingsfire Knight-Captain) | page 10's family `kingsfire` |
| Forge Hound's **Ember Bite** | **Cinder Bite** | "ember" |
| Ember Tide (d13, d14 room-wide) | **Flood of Fire** | "ember" |
| `b_emberbrood` Emberbrood | `b_cinderbrood` Cinderbrood | "ember" |
| `m_fiend_ember_imp_cantor` Ember Cantor | `m_demon_cinder_cantor` Cinder Cantor | "ember" |
| Ember Checker, Ember Tithe | Cinder Checker, Fire Tithe | "ember" |
| `it_ember_nest_ring`, `it_ember_edge_glaive`, `it_ember_king_seal_ring` | `it_coal_nest_ring`, `it_flame_edge_glaive`, `it_fire_king_seal_ring` | "ember" |
| Ashmother Veyra, Keeper of the First Ember; the room "The First Ember" | Keeper of the **Oldest Coal**; the room "The Hearth Below" | "ember" |
| `it_first_ember_lantern` (light slot) | `it_ashmothers_coal_cage` (**off-hand focus**) + the quest item `it_the_oldest_coal` | light slot gone; "ember" |
| `leg_the_first_ember` (light-slot legendary) | `leg_the_oldest_coal` (**neck** legendary) | same |
| `uq_pells_hooded_lantern` (light slot) | `uq_pells_quiet_hood` (**head**, light armour) | light slot gone |
| `it_lamp_of_tamar` (light slot) | `it_sun_mirror_of_tamar` (**off-hand focus**) | light slot gone |
| `leg_first_torch` (r05, light slot) | `leg_heart_of_the_march` (**neck**) | light slot gone |
| d05 Ithar's Sun Lamps / Snuff the Lamps / Checker Night; material `seen_in_light` | Sun Mirrors / Cloud the Mirrors / Checker of Glare; `seen_in_sun` | no darkness mechanics |
| d01 Pell's **Snuff** (darkness) | **Smoke Pots** | no darkness mechanics |
| d08 Gloamwing's Drawn to Light; Oruvel's Swallow the Light | Drawn to Glow; Drink the Glow | same |
| d08 Archmage's **Starfall** | **Star Scatter** | banned name |
| `it_sleepers_maul`, `it_gullet_tooth_maul`, `it_sandstone_greatmaul`, `it_glacierstone_maul`, `it_obsidian_gate_maul`; `m_beastkin_thornmane_mauler`; `m_orc_ashtusk_raider`; room Phoenix Roost | `it_sleepers_hammer`, `it_gullet_tooth_hammer`, `it_sandstone_greathammer`, `it_glacierstone_hammer`, `it_obsidian_gate_hammer`; `m_beastkin_thornmane_ravager` (page 10's id); `m_orc_ashtusk_cutthroat` (page 10's id); Phoenix Nest | "maul", "raid", "roost" are on the banned list |
| Maul (d01 secret, d10 bear), Glacier Maul, Tail Swipe, Blink (d12, d13), Last Stand (d13) | Peat Hammer, Crushing Paw, Glacier Hammer, Tail Sweep, Rift Step / Step Away / Hop, Hold the Line | banned names |
| trinkets (14) | **souls** `soul_<snake>` (see §21.4) | no trinket slot |
| wrist items (`it_leechhide_bracers`, `uq_unshattered_vambraces`, `uq_death_roll_bracers`, `it_tidelink_bracers`, `it_tidewife_bangle`, …) | hands / waist / neck / ring (`it_leechhide_gloves`, `uq_unshattered_gauntlets`, `uq_death_roll_girdle`, `it_tidelink_gloves`, `it_tidewife_band`) | no wrist slot |
| `it_moonwater_veil` | `it_moonwater_hood` | "veil" |
| Dunecutter Sandcaller's "veil" | face-wrap | "veil" |
| r04 `b_ember_king_kaedros`, `b_vaelkyr_emberwing`, `leg_emberwing_pinion`, `it_mount_emberwing_whelp`, `set_emberlord_regalia`, `m_ember_pyrecaller`, `m_dragonkin_emberwing_drake` | `b_fire_king_kaedros`, `b_vaelkyr_firewing`, `leg_firewing_pinion`, `it_mount_firewing_whelp`, `set_kingsfire_regalia`, `m_kingsfire_pyrecaller`, `m_dragon_firewing_drake` | "ember" |
| r04 Prince Aurel, the Heir in the Kiln (`b_heir_in_the_kiln`) | **Ysa Varn, the Kindled Child** (`b_ysa_varn_kindled`) | page 01's canon: the King lost a **daughter** |
| r05 Veil realm, Veil Rifts, Veil Drain, Veil Sickness, `b_veilhound_*`, `b_saelith_veilwarden`, `set_veilwoven`, `it_mount_veilhound`, `m_*_veil_*`, `uq_threshold_keystone` | the **Underside**, rifts, Rift Drain, Rift Sickness, `b_rifthound_*`, `b_saelith_spirewarden`, `set_spirewoven`, `it_mount_rifthound`, `m_tear_*` / `m_folk_spire_*`, `uq_threshold_lodestone` | "veil"; "keystone" is banned |
| r05 Hearthvale Ember (`it_hearthvale_ember`), `q_the_last_ember` | Hearthvale Coal (`it_hearthvale_coal`), "The Long Carry" (`q_the_long_carry`, proposed) | "ember" |

---

## 22. Notes for other pages

### 22.1 New art this page needs (page 17)

Every look below is **film-set dark** where it is underground (§2.12): the light source is part of the look.

| Kind | id / name | Used by |
|---|---|---|
| Dungeon look | `mine` (timber props, rails, hook lanterns, **glowing ore seams**, blue cave-fungus) | d03 |
| Dungeon look | `glass_tomb` (sand-gold floor, smoky fused glass, roof sun-slots) | d05 |
| Dungeon look | `vault_sand` (vault recoloured sand-gold, lamp-oil troughs along the walls) | d06 |
| Dungeon look | `hollow_blight` (grey-violet moss, black thorns, **glowing blight-flowers** and moonroot pools) | d07 |
| Dungeon look | `ruin_moon` (silver-white trim, pale blue fog, the well's silver glow in floor cracks) | d08 |
| Dungeon look | `pit_arena` (ash sand, bone stakes, tiered stands with a crowd) | d09 |
| Dungeon look | `rime` / `cave` with ice (reuse) lit by **blue ice-glow** and the braziers | d10 |
| Dungeon look | `flooded_cathedral` (salt-white stone, barnacles, green-lit glass, glowing sea-anemones) | d11 |
| Dungeon look | `rift_workshop` (brass, benches, floating islands, void between, violet rift light) | d12 |
| Dungeon look | `kingsfire_bastion` (basalt, red-glass slits, **lava channels** as the light) | d13 |
| Dungeon look | `ash_reliquary` (grey ash, obsidian, gold niches, spark motes, lava seams) | d14 |
| Dungeon look | `fire_court` (black glass and gilt, lava channels and moat, fire-bowls) | d15 |
| Dungeon look | `spire_root` / `spire_halls` / `spire_crown` + the **Underside** variant of each (drained grey-blue, white outlines) | d16 |
| Creature type | `crab` (spider plan, two claws, flat shell) | d11 |
| Creature variant | elemental `sand`, `whirl` (a moving sand/air funnel) | d06 |
| Creature feature | `stinger` (tail with a glass tip) | d05 |
| Creature feature | `lure` (a glowing stalk on the head) | d11 |
| Creature feature | `millstone_core` (golem chest as a millstone) | d02 |
| Colour sets | `ore_titan`, `automaton` | d03, d12 |
| Materials | `ghost_water`, `ghost_frost`, `ghost_silver`, `seen_in_sun` (fully drawn only inside a sun-patch; a heat-shimmer outline elsewhere), `moonwater`, `bark_skin`, `seawater_body`, `living_ash`, **clear glass with fire inside** (d15 secret) | d02, d04, d08, d05, d08, d07, d11, d14, d15 |
| Props / models | `great_bellows`, `great_scales`, `gravity_engine`, `unmaking_engine`, sapling (mushroom re-skin), mirror stands, sun-slots, sun mirrors, sluice levers, 3 bells, relic seals, smoke pots, the pump horn; **d15**: the Gate Road portcullis, 2 harpoon ballistae, cinder-tile floor, the Heart Kiln; **d16**: rifts, the clock-face floor, five tall mirrors, the Loom, floating stones, the Dreaming March (the continent in miniature) | various |
| Rig | a **mounted boss** (Chibi 2 rider on a creature, dismount at a phase) | d09 Krunn |
| Rig | a boss that **changes body** mid-fight (Chibi 2 King → titan in the throne) | d15 Kaedros |
| Voice timbres | `drowned` (wet whisper), an automaton voice built from another voice's clips, the Marchheart (the deepest voice in the game), Kaedros (page 01: slow, never raised) | d02, d12, d16, d15 |

### 22.2 Screens and HUD pieces (page 03) and keys (page 02)

- `scr_dungeon_journal` (§2.10) with seven tabs (Overview, Bosses, Loot, Map, Secrets, **Depth**, Records); opened with **Shift+J**.
- `scr_dungeon_finder` (§2.3): only discovered dungeons; Normal / Challenge / Normal Depth / Challenge Depth; a depth picker limited to your unlocked depths.
- A **"Dungeon discovered"** card (§2.3) and the entrance pin on the map.
- **Depth badge** on the party frame and the Gathering Stone: depth number, tier (roman), one icon per Tear modifier (hover = text).
- **Depth Cache** chest in the end boss's room (§2.4.6).
- Party frame additions: **Interrupt Order** (numbers 1–5 the leader assigns; the next person in order sees a gold border on their interrupt button), dungeon counters ("Miners freed 2/4", "Saplings 6/6", "Seals 3/5"), the **Heat Gauge** timer (d04), **Court Favour** banners (d15), the **Underside** eye icon (d16).
- Dungeon-wide gauges: **Favour** bar (d09), **Moon Clock** (d08), **Tide Gauge** (d11), **Chill** stacks (d10), **Scorch** stacks (d14).
- **Dialog opportunity** box: a centre panel with 2–4 replies and a timer bar (20–30 s); in a group it is a **vote** (a tie goes to the leader, page 11); a "kneel emote" check for d15's "We kneel".
- Rarity-slot pips on the dungeon map (page 10 §7.8).

### 22.3 Rules other pages must carry

| Page | Needs |
|---|---|
| 01 World | the 16 entrances; the NPCs `npc_warden_hedda_thorne`, `npc_marra_stillwater`, `npc_foreman_dagna_coalbright`, `npc_thane_orla_bellamund`, `npc_lightkeeper_oren_sael`, `npc_vaultkeeper_hadim_sar`, `npc_moonwell_warden_sefa_lin`, `npc_moonsinger_aethe_varn`, `npc_captain_ren_harrowgate`, `npc_warden_kaija_frostmere`, `npc_sister_maren_saltwhistle`, `npc_riftwatch_archivist_toma_quill`, `npc_marshal_idra_vance`, `npc_keeper_oswin_ashlow`, `npc_marshal_ansel_crane`, `npc_ysoldes_echo`, the Wayfarer stand-ins; **new for d15**: Lady **Sabeth Varn** (Maelor's wife, Ysa's mother), Chancellor Dorrin, Flame-Priest Oruk, Tobbin (Hesta's apprentice); d14's relic door is broken open by Legion sappers |
| 05 Combat | dispel types (magic, curse, poison) since d06/d07/d13 lean on them; the **charm** status (d06, d02, d05); **swimming** (d11: −40% speed, no roll, Drowning); **no limit on in-combat revives**; the **stagger push** rule of d15's Cinderjaw (an exception to the break bar) |
| 07 Progression | the Quiet Wake's **Trusted** tier (d06 dialog); titles *Kneeler* (d14), *Who Opened the Kiln* (d15), *Dreamkeeper* (d16) |
| 08 Items | item level by difficulty (Normal = band; Challenge and Deep = 60; rising depths = the depth's level); **flail**, **gun/blunderbuss**, **quiver**, **fist weapon**, **whip**, **banner off-hand** as bases if they don't exist; the **souls** of §21.4 and their socket requirements; the Depth Cache and its magic-find bonus (§2.4.6); legendary bad-luck protection without a currency; `it_heartwood_seed` and `it_marchheart_seed` as keepsakes |
| 09 Sets & legendaries | every row of §21.4 and §21.5; set tokens `it_token_<slot>`; which d15/d16 boss drops which class-set slot (§d15, §d16) |
| 10 Bestiary | the 148 dungeon monster ids in §21.3 (all new ids; reused bodies); each dungeon's **main family** (cards) for its Depth warden; the **Ashtusk vanguard** exception in d04; §7.9's tier numbers match §2.4.4's (page 12 adds a tier VI for Deep 26–30); the Shiftwood mimic and Riftborn used by Tear modifiers (§2.4.5) |
| 11 Boss mechanics | the mechanics first used here: **moving wall with a gap**, **checkerboard flip**, **lying announcer** (the voice says one thing, the telegraph says the truth), **kept tether**, **shared-health twins**, **copies of players**, **gravity flip with ghost outlines**, **stagger-pushed boss** (d15), **two realms** (d16); every boss's **Depth list** uses only §26 ids |
| 13 World bosses | the Marchheart (d16 secret) borrows one signature mechanic from each regional world boss and the Harvest Effigy; the Hearthvale Coal quest's shrines open after each world boss is killed once |
| 14 Quests | 14 dungeon story quests `q_the_open_barrow` … `q_the_kings_reliquary` (the d14 relic-key attunement quest is **gone**); d15 = the main story's "The Fire King", d16 = "The Unwoven"; **"The Long Carry"** (`q_the_long_carry`, proposed) for the Hearthvale Coal |
| 15 Social | the Dungeon Finder shows only discovered dungeons (§2.3); Normal, Challenge and Depth queues; vote kick; 10 instances an hour. No weekly vault, no currency |
| 16 Tech | `data/dungeons/<id>.json` per dungeon (rooms, halls, packs, bosses, rarity slots, Depth list); `data/depth.json` (the §2.4 tables, Tear modifiers, reward table); per-character `discoveredDungeons` and `depthUnlocked[dungeon][difficulty]`; reachability test from `dungeon-plan.js`; a test that regenerates §21 and fails on drift; a test that every Depth-list id exists in page 11 §26 and none is lethal |
| 20 Travel | which Travel Method stops sit at dungeon entrances (they count as discovery, §2.3): d08's ferry, d11's Saltmarch boat, the Spire Isle ship |
