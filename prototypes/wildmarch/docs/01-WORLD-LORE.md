# WILDMARCH — Design Bible, page 01: the world, its history and its people

> *"The Lampbearer carried one fire up one mountain. We have been paying for it ever since."*
> — carved over the door of the Lantern House chapterhouse, Highcourt

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Documentation only; nothing is built.
**Owns:** region content, sub-zone ids, town ids, landmark ids, NPC ids, faction details (the seven
player factions and their chapters), story beats, where roads and Travel Method stations stand,
weather and music mood per region, how dark places are lit, and the NPC voice/tone guide.
**Reads from canon ([page 00](00-OVERVIEW.md)):** region ids, level bands, hub towns, holders, dungeon
ids, races, the seven factions (00 §12.2), always-daylight (00 §4). Nothing on this page changes those;
where this page wants a change it is listed in §15 *Canon change requests*.

**Round 2 in one paragraph:** the Veil is now **the Mend**; Emberthrone is **Kingsfire**, Veilspire Isle is
**Spire Isle**, the Ember King is **the Fire King**; the story ends in two **5-player dungeons** (d15 The
Fire Court, d16 The Spire) instead of raids; there is **no night** (dark places are film-set dark, §11);
there are **seven player factions** with chapters instead of twenty-odd regional ones (§6); flight paths
and skyways are gone — **Travel Methods** (page 20) run on the roads, rivers and seas (§10); the
hearth-bind and homeward stone are replaced by the **Recall Stone** bound at a town waystone.

Links: combat [page 05](05-COMBAT.md) · progression and the unlock ladder
[page 07](07-PROGRESSION.md) · monsters [page 10](10-BESTIARY.md) · dungeons [page 12](12-DUNGEONS.md)
· world bosses [page 13](13-WORLD-BOSSES.md) · quests, the main story chain and events
[page 14](14-QUESTS-EVENTS.md) · art, music, voices and lighting [page 17](17-ART-AUDIO.md) · tech
[page 16](16-TECH.md) · professions [page 19](19-PROFESSIONS.md) · travel [page 20](20-TRAVEL.md) ·
parked ideas [WISHLIST.md](WISHLIST.md).

---

## Contents

1. [How the continent is made](#1-how-the-continent-is-made) (a decision for the owner)
2. [Geography, south to north](#2-geography-south-to-north) + the ASCII map
3. [History](#3-history) — a dated timeline
4. [The central conflict: the Mend and the Fire King](#4-the-central-conflict-the-mend-and-the-fire-king)
5. [The main story in beats](#5-the-main-story-in-beats) (the quest-by-quest chain is on page 14)
6. [Factions](#6-factions) — the seven player factions, their chapters, rivals and enemies
7. [Playable races, homelands and starting towns](#7-playable-races-homelands-and-starting-towns)
8. [The regions](#8-the-regions) — all eleven, in depth
9. [Highcourt, the capital](#9-highcourt-the-capital)
10. [The travel network](#10-the-travel-network)
11. [Light and weather by region](#11-light-and-weather-by-region)
12. [Voice and tone guide for NPCs](#12-voice-and-tone-guide-for-npcs)
13. [Id conventions used on this page](#13-id-conventions-used-on-this-page)
14. [Reuse map](#14-reuse-map)
15. [Canon change requests and open questions](#15-canon-change-requests-and-open-questions)

---

## 1. How the continent is made

Wildmarch is **one continent that every player shares**, so the map must be the same for everybody
and must put the regions in the canon order (south safe → north burnt). Farhold's worlds come out of
**World Forge** (`worldgen/`, reuse) from a seed; nothing in Farhold is placed by hand. Three ways to
make Wildmarch's continent:

| Option | How | Good | Bad |
|---|---|---|---|
| **A. Hand-authored** | An artist paints a heightmap, rivers, region borders and every town by hand | Total control; every view can be composed | Months of art time; loses World Forge's erosion, rivers, biome maths and road A*; nothing to re-roll when a region needs moving |
| **B. Fixed seed, untouched** | Pick the World Forge seed whose output looks closest, ship it | Free; same pipeline as Farhold; tiny data (the seed + knobs) | Cannot promise south→north order, Highcourt between regions 2 and 3, a coast for the Drowned Coast, an island for Spire Isle — a seed is found, not designed |
| **C. Fixed seed, then hand-edited** *(recommended)* | Generate with World Forge from a fixed seed and fixed knobs, then apply a small **overrides file** on top: region borders painted per cell, towns and landmarks pinned, some roads forced, a few height stamps (the Spire, Highcourt's hill, the Kingsfire caldera) | Keeps erosion, rivers, biomes, roads and naming for free; the parts the story needs are guaranteed; the overrides file is a few hundred lines of JSON that a human can read and a test can check | Two sources of truth (seed + overrides); an upgrade to World Forge can move the untouched parts — so the knobs **and the World Forge version** are pinned |

**Recommendation: C.** Concretely *(new, sits on reuse: `worldgen/js/world.js`)*:

```json
// data/world/continent.json — the recipe
{
  "worldgen": { "version": "pinned-2026-09-29", "seed": 40001, "method": "pangea",
                "width": 64, "height": 96, "metresPerCell": 250,
                "landmasses": 1, "seaLevel": 0.42, "thermalErosion": 4 },
  "stamps":   [ { "id": "stamp_spire_isle", "x": 32, "y": 4, "radius": 5, "raiseTo": 0.98 },
                { "id": "stamp_highcourt_hill", "x": 30, "y": 66, "radius": 2, "raiseTo": 0.62 } ],
  "regions":  "data/world/region-paint.png",      // one colour per region id, 64x96, painted by hand
  "pins":     "data/world/pins.json",             // every town_ / lm_ / dungeon mouth, by cell + metre offset
  "roads":    "data/world/forced-roads.json"      // the Kingsroad and the Saltroad are forced; the rest is A*
}
```

- **Size.** 64 × 96 cells at **250 m a cell** = a continent about **16 km wide and 24 km tall**, plus
  the Pale Sea to the north. (Farhold uses 640 m a cell over a whole planet; Wildmarch is a continent,
  so the cell is smaller and the map is hand-sized.) Walking Brightwater → Last Light on the Kingsroad
  is about **31 km, 96 minutes on foot** at Farhold's 5.4 m/s walk — long enough to feel like a
  journey, short enough that no one walks it twice by choice. The Kingsroad's wagon and strider
  lines (Travel Methods, page 20) cover it in a fraction of that.
- **Tests** *(new)*: every pin is on land and on its painted region; every hub is joined to Highcourt
  by road; each region's median ground height and biome mix match its row in §8; the overrides file
  loads against the pinned World Forge version with zero warnings.
- **The same map for everybody** means the map is built once at server start (or shipped pre-built as
  World Forge's `toJSON` output, about 1.3 MB) — not generated per player. Page 16 owns the choice.

> **Question for the owner (Q1-01):** hand-authored, fixed seed, or fixed seed + hand edits? This page
> assumes **C** throughout; nothing below depends on it except the recipe block above.

---

## 2. Geography, south to north

The Wildmarch is a single long continent, **warm and green in the south, cold in the north-west,
drowned in the north-east, and burnt at the top**. A player's journey is a walk north: every border
crossed is a harder country.

- **The Hearthsea** washes the south coast. Calm, shallow, full of fishing boats.
- **The Wend** is the spine river. It rises in the Greyridge snowfields, runs south past Highcourt,
  through the middle of Hearthvale and out into the Hearthsea at Brightwater. Its sister river, the
  **Slowwater**, leaves it at Highcourt and dies into the peat of Mossfen instead of reaching the sea.
- **The Greyridge** is a broken line of highlands across the middle of the continent — the old wall
  between the soft south and the hard north. The **Kettle Pass** is the one easy way through.
- West of the Greyridge the ground dries into the **Sunscar**: red mesas, a sea of dunes, and flats of
  black glass where something burned the sand four hundred years ago.
- East of the Greyridge the **Whisperwood** covers the hills down to the eastern cliffs: old trees,
  moonwells, and roads that do not always go where they went yesterday.
- North of the Greyridge the land opens into the **Cinder Steppe**, a grass sea going grey with ash
  as it climbs toward the volcanoes.
- The far north splits three ways: the **Frostmantle** peaks and glaciers in the north-west, the
  **Drowned Coast** of cliffs and a sunken city in the north-east, and between them the **Riftmarch**,
  where the ground has come loose and floats.
- At the very top, the **Kingsfire**: a ring of volcanoes around a caldera, where the Fire King sits.
- Beyond the north cliffs, across eight kilometres of the grey **Pale Sea**, is **Spire Isle**:
  one mountain, and on it the Spire, the place the Mend is pinned to the world.

### The map

North is up. Numbers are region numbers from canon §7; `*` is a hub town; `#` a dungeon mouth;
`W` a world boss site; `=` the Kingsroad; `-` other roads; `~` water; `^` mountains. Every road on
this map also carries a Travel Method line (§10, page 20). Distances are rough (1 character ≈ 250 m
across, ≈ 500 m down).

```
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   THE PALE SEA   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
                     ~            .------------------------.                ~
                     ~            |  [11] SPIRE ISLE 60    |  # d16 Spire   ~
                     ~            |   * Spire Landing      |                ~
                     ~            '-----------+------------'                ~
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|~ ship from Saltmarch ~ ~ ~ ~ ~ ~
 ^^^^^^^^^^^^^^^^^^^^^^^^^.-------------------+-------------------.~~~~~~~~~~~~~
 ^ [7] FROSTMANTLE 34-42  |  [10] KINGSFIRE 52-60                 |  [8] THE    ~
 ^  * Rimehold            |   * Last Light     # d13  # d14       |  DROWNED    ~
 ^  # d10 Rimefang        |   W Slagborn       # d15 Fire Court   |  COAST      ~
 ^  (sealed: Throne Ice)  +===================+===================+  40-48      ~
 ^  W Standing Ruin       |  [9] THE RIFTMARCH 46-54              |  * Saltmarch~
 ^                        |   * Waystone Camp   # d12             |  # d11      ~
 ^^^^^^^^^^^^^^^^^^^^^^^^^+   W The Unmoored                      |             ~
                          +===================+===================+  W Sallow   ~
                          |  [6] CINDER STEPPE 28-36               |    King     ~
                          |   * Fort Ashfall   # d09               '------------~
                          |   W Carrion Crown                            ~~~~~~~~
 .------------------------+===================+=====================.~~~~~~~~~~~
 | [4] SUNSCAR BARRENS    |  [3] GREYRIDGE HIGHLANDS 10-18        | [5] WHISPER-~
 |     16-24              |   * Anvilgate    # d03  # d04         | WOOD 22-30  ~
 |  * Oasis of Tamar      |   W Grief-in-Iron                     | * Silver-   ~
 |  # d05  # d06          |   ^^^^ Kettle Pass ^^^^               |   bough     ~
 |  W Glass Wyrm   -------+-------------------+------------------ | # d07 # d08 ~
 '------------------------+     HIGHCOURT *  (capital)            | W Hungering ~
                          |   (sealed catacomb door) \ Slowwater  | Brood       ~
                          +===================+========\==========+------------~
                          |  [1] HEARTHVALE 1-6 |  [2] MOSSFEN 5-12             ~
                          |   * Brightwater     |   * Reedhollow                ~
                          |   # d01 Barrow      |   # d02 Drowned Mill          ~
                          '--------Wend---------+-------------------------------~
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   THE HEARTHSEA   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
```

The two **sealed** doors (the Highcourt catacomb door and the Throne Ice) are where the parked raids
*Crypt of the Barrowking* and *The Glacier Throne* would go (`WISHLIST.md`). In v2 they are scenery
with a line of lore; nothing opens them.

### Region footprint table

| # | id | Size (km, W × N) | Ground height (m above the sea) | Biome mix (World Forge families) | Borders |
|---|---|---|---|---|---|
| 1 | `hearthvale` | 4.0 × 3.0 | 0 – 140 | farmland 55%, woodland 25%, downs 15%, river 5% | Hearthsea (S), Mossfen (E), Highcourt (N) |
| 2 | `mossfen` | 4.5 × 3.0 | −2 – 30 | wetland 70%, reed 15%, wet woodland 15% | Hearthvale (W), Highcourt (NW), Whisperwood (N, cliffs only) |
| — | `highcourt` | 1.0 × 1.0 city + 3.0 × 1.5 crownlands | 40 – 110 | farmland, city | Hearthvale, Mossfen, Greyridge |
| 3 | `greyridge` | 5.0 × 4.0 | 150 – 900 | highland 50%, mountain 30%, moor 20% | Highcourt (S), Sunscar (W), Whisperwood (E), Cinder Steppe (N) |
| 4 | `sunscar` | 5.0 × 5.0 | 80 – 520 | desert 60%, mesa 25%, glass flats 15% (aura biome) | Greyridge (E), Cinder Steppe (NE) |
| 5 | `whisperwood` | 4.5 × 5.0 | 60 – 380 | ancient wood 70%, glade 20%, fey aura 10% | Greyridge (W), Mossfen (S), Drowned Coast (N, cliffs) |
| 6 | `cinder_steppe` | 8.0 × 3.5 | 200 – 600 | grassland 55%, ash grassland 35%, badlands 10% | Greyridge (S), Frostmantle (NW), Riftmarch (N), Drowned Coast (NE) |
| 7 | `frostmantle` | 5.0 × 6.0 | 400 – 2,400 | tundra 40%, glacier 30%, peaks 30% | Cinder Steppe (SE), Riftmarch (E) |
| 8 | `drowned_coast` | 4.0 × 6.0 | −30 – 180 | coast 45%, cliffs 25%, drowned ruin 30% (cursed aura) | Cinder Steppe (SW), Riftmarch (W), Pale Sea (N) |
| 9 | `riftmarch` | 7.0 × 3.0 | 300 – 700 (+ islands floating 20–140 m above) | broken land 50%, floating stone 30%, void aura 20% | Cinder Steppe (S), Kingsfire (N) |
| 10 | `kingsfire` | 7.0 × 3.0 | 400 – 1,600 | volcanic 60%, obsidian 25%, caldera 15% | Riftmarch (S), Pale Sea (N) |
| 11 | `spire_isle` | 3.0 × 3.0 island | 0 – 1,900 (the Spire) | inverted wood 30%, strand 30%, spire rock 40% (Mend aura) | Pale Sea all round |

---

## 3. History

Years are counted **AS — After the Sealing**. The game starts in **400 AS**. Everything before the
Sealing is **BS**. There is **no in-game clock**: the Wildmarch is always in daylight (canon 00 §4), so
the game has no hours, days or moon phases to track. **Seasonal events** (page 14) follow the
**real-world calendar**.

| Year | Event | What is left of it in the game |
|---|---|---|
| Before time | **The Unmade.** Under and around the world is a place of raw stuff that has not decided what to be — no shape, no death, no names. The first peoples call it *the Unmade*. | Riftmarch's floating stone, the Unmoored (world boss), the Unwoven (d16's final boss) |
| ~1,400 BS | **The Kindling.** Elves wake at the moonwells of the Whisperwood; dwarves cut the first hall under the Greyridge; humans and halflings farm the south. Each people keeps a sacred fire or water. | Moonwells (Whisperwood), Anvilgate's First Forge, the First Waystone in Brightwater |
| ~600 BS | **The Sandsworn kings** rule the Sunscar from glass-roofed cities, burying their dead with their breath bottled beside them. | Glass Tombs (d05), Vault of the Sandsworn (d06) |
| 62 – 1 BS | **The Tearing and the Hollowing War.** The world's skin tears at the northern mountain on the island now called Spire Isle. The Unmade pours in: things with no fixed shape, **the Riftborn**; dead that will not lie down. The four peoples fight together for the first time. The Sunscar burns to glass. | The glass flats, the barrow downs, the oldest ghosts |
| 0 AS | **The Sealing.** **Ysolde the Lampbearer**, a halfling lamp-keeper from Brightwater, carries the First Flame from the First Waystone up the mountain, walks into the tear and binds it shut with her own life. What she leaves behind is **the Mend**: a skin of woven light across the tear, pinned to the Spire by the flame she carried, now called the **Everflame**. **Saelith**, an elf of the Moonwell Circle who climbed with her, stays to guard the Spire; elves live long, and he is still there. | The First Waystone, Ysolde's Well, the empty Lampbearer's Seat in Highcourt |
| 3 AS | **The Crown Assembly** is founded at Highcourt: the four peoples swear the **Covenant of the Lamp** to keep the Everflame fed. The **Order of the Flame** is founded to tend it; its master is the **Flame Warden**, who lives in the fortress-temple on the northern caldera — Kingsfire. | Highcourt; Kingsfire's temple halls (d14, d15) |
| 112 AS | The last Sandsworn king, **the Sallow King**, refuses to be buried and is sealed alive in his tomb. | The Sallow Court in the Hushed Valley (Sunscar); the Sallow King himself is the Drowned Coast world boss (`b_sallow_king`, page 13) |
| 204 – 211 AS | **The Barrowking's War.** A Greyridge king, **Hrodric Ninefold** (`b_barrowking_hrodric`), finds a way to hold his dead soldiers in their bodies. He marches south, is beaten under the walls of Highcourt, and is entombed in the catacombs under the city — his barrow-roads run back north under the ridge. | The sealed catacomb door under Highcourt (the Crypt of the Barrowking is a parked raid, `WISHLIST.md`); the Hollow Barrow (d01) is one of his outposts |
| 287 AS | **The Dimming.** One of the three great moonwells of the Whisperwood goes dark. The elves withdraw into Silverbough. | Ruins of the Moonwell (d08) |
| 312 AS | The Deepforge Clans open **Bellows Keep**, the great forge-fortress over the Kettle Pass. | Bellows Keep (d04) |
| 351 AS | **The Ashtusk crossing.** Orc clans, driven south by cold and something they will not name, cross the Frostmantle and settle the Cinder Steppe by force. | Ashtusk war camps; the Warmaster's Pit (d09) |
| 372 AS | **The Drowning of Old Saltmarch.** In a single day the sea rises over the lower city. The cathedral choir was singing when it went under — and has not stopped. The dead who rise from the water are **the Drowned**. | Saltdeep Cathedral (d11); the Choir Deeps trench |
| 388 AS | **The Fire King.** Flame Warden **Maelor Varn** refuses the Assembly's summons, crowns himself **Kaedros**, King of Kingsfire (as a boss: `b_fire_king_kaedros`, d15), and closes the northern roads. The Order of the Flame splits: the ones who follow him become the **Kindled**. | The Kingsfire Legion; the Kindled lieutenants |
| 396 AS | **The Riftmarch breaks.** The land between the Steppe and Kingsfire lifts off its roots. The **Riftwatch** is founded at Waystone Camp to watch it. | The Riftmarch; the Unmade Workshop (d12) |
| 399 AS | The Kingsfire Legion's first war-bands reach the Cinder Steppe. **Fort Ashfall** is rebuilt as the Crown's northern wall. The Mend is seen to flicker from the north cliffs. | Fort Ashfall |
| **400 AS** | **Now.** The barrows in Hearthvale are waking. The Wardens call for every hand that can hold a sword. The player is one of them. | Game start (page 14 §Prologue) |

### What the peoples believe *(for NPC speech)*

- **Humans** swear by the Lamp — "Lamp keep you", "by the Lamp". They tell children that Ysolde still
  walks the roads with an unlit lantern, looking for the fire she gave away.
- **Halflings** are proud that the Lampbearer was one of theirs and are tired of being told so by
  humans. They put a lit candle in every window for the Feast of the Lamp (page 14 §Seasonal).
- **Dwarves** swear by the First Forge. They believe the Everflame was lit from a dwarf coal and say
  so at every opportunity.
- **Elves** do not swear. They say the Mend was not made by Ysolde but *borrowed* from the moonwells,
  and that the Dimming of 287 AS was the moonwells taking some of it back.

---

## 4. The central conflict: the Mend and the Fire King

### The Mend

- **What it is.** A skin of woven light stretched over a four-hundred-year-old wound in the world.
  On one side, the Wildmarch; on the other, the Unmade. The Mend is **pinned** at the Spire by the
  Everflame. Wherever the Mend is thin, the Unmade leaks: stone floats, the dead stand up, beasts come
  back wrong, people dream the same dream.
- **How you see it.** From anywhere north of the Greyridge, in daylight: a faint band of shifting,
  pearl-coloured light across the northern sky, like a heat shimmer that has colour in it (the
  **tear-light**). The further north, the brighter and the more torn. In game it is a sky layer
  (page 17) drawn over the day sky, whose strength is the region's **Tear pressure** (0–1):
  Hearthvale 0.05 · Mossfen 0.08 · Greyridge 0.12 · Sunscar 0.18 · Whisperwood 0.22 · Cinder Steppe
  0.35 · Frostmantle 0.45 · Drowned Coast 0.55 · Riftmarch 0.80 · Kingsfire 0.70 · Spire Isle 1.00.
- **What Tear pressure does in the game** *(new; numbers owned here, effects owned by pages 05/10/12/14)*:
  1. **Weather.** The Tearstorm share of a region's weather roll is at least its §11 table value, and
     during a story-driven Mend event (page 14) it rises to `table value + pressure × 20` percentage points.
  2. **Rifts.** Every Tearstorm rolls a rift event (`ev_rift_opening`, page 14, 50%); rift events only
     fire where pressure ≥ 0.3.
  3. **Greater rarities.** In the open world, the chance that a rolled Rare or Champion pack also gets a
     **greater rarity** (Giant, Flaming, Electrified… page 10) is multiplied by `1 + pressure` — so the
     north throws up more of them than Hearthvale does. Page 10 owns the base chance.
  4. **Depth.** Depth modifiers in dungeons (page 12) are written as the Tear pressing on the place;
     nothing here sets their numbers.
  (There is no night, so nothing in this list depends on the time of day.)
- **Why it is failing.** Ysolde's binding does not need the Everflame to be *fed* — it needs the
  Everflame to be **held**. For four hundred years the Order of the Flame believed the flame had to be
  fed with lives (the **Kindling rite**: a volunteer walks into the flame once a generation). That
  belief was wrong, and Maelor Varn found out.

### The Fire King — Maelor Varn

- **Who he was.** The fourteenth Flame Warden. A careful, gentle scholar; the best keeper the Order had
  in a century. In 381 AS his daughter **Ysa Varn** volunteered for the Kindling rite and walked into
  the Everflame. He found the Order's oldest records while grieving her and learned the rite had never
  been needed.
- **What he wants.** He has learned something worse: the Everflame is not only a pin, it is a
  **door-key**. Whoever holds it can open the Mend a little and draw the Unmade through — raw
  unshaped stuff that can be made into anything, including a daughter who never died. He means to
  open the Mend wide enough to **remake the Wildmarch without death**, and he believes the price
  (everything as it is now) is worth paying.
- **What he is doing.** He has taken the Everflame's heart out of the Spire and carried it to
  Kingsfire — the **Heartflame** (`it_heartflame` once the player carries it). The Spire's flame now
  burns on what is left, which is why the Mend flickers. Each rift, each drowned bell, each floating
  island is the Mend giving way where the King pulls at it. His **Kingsfire Legion**
  (`fac_kingsfire_legion`: the Kindled, human soldiers in black-glass armour, fire-binders, and the
  drakes of the caldera) holds the north while he works.
- **What he is not.** Not cruel for its own sake. He speaks to the player several times across the
  story (visions, a projection at Fort Ashfall, a parley in the Fire Court) and every time he makes
  the same honest offer: *stand aside, and nobody you love will ever die again.* His fight in **d15 The
  Fire Court** (page 12 owns it) has a **dialog opportunity** where the group can answer him.
- **Voice.** `voiceFor({ role: 'elder', gender: 'm' })` pitched down 0.1; slow; never raises his voice;
  never uses an exclamation mark.

### The endgame: Spire Isle

- The Fire King dies in **d15 The Fire Court**, a 5-player dungeon at the heart of the Kingsfire caldera
  (page 12 owns the fight; Normal is finishable with followers, canon pillar 6). With him goes the hand
  holding the Heartflame, and the Mend — which had been braced against his pull for twelve years —
  **snaps back and tears** at its pin. The player carries the Heartflame to the Spire (story quest) and
  finds the Spire already breached and its warden, **Saelith**, wounded at the brazier.
- **The Unwoven** (`b_unwoven`, the final boss of **d16 The Spire**; page 12 owns the fight) is the first
  thing that came through the Tearing in 62 BS — the thing Ysolde actually fought. It has no fixed
  shape; it wears pieces of everything the group has killed on the way up (its phases borrow
  mechanics from earlier bosses, re-tuned for five).
- **Spire Isle** is the level-60 zone: the Spire Landing camp, open-world work holding the breach
  (dynamic events, page 14 — no daily quests), the **d16 The Spire** dungeon (the story's epilogue),
  and the story's last choice (page 14, `q_ms_the_last_lamp`). At the empty brazier, Ysolde's Echo
  offers two ways to pin the Mend again:
  - **Relight the Lamp** — set the Heartflame back in the brazier. The Everflame burns as before.
    Title *the Lampbearer's Heir*; the Spire's flame is gold on your client.
  - **Take the Lamp's place** — hold the Heartflame and let the Echo bind *you* into the Mend, as she
    was; she is freed and you carry a spark of it. Title *the Held Flame*; the Spire's flame is white
    on your client, and your character gets a faint white shimmer on the hands (a cosmetic effect
    that can be hidden in the wardrobe).
  **Both choices produce the same shared world state** (the Mend is sealed; the breach events on the
  island continue) so an online world stays one world. The only lasting differences are cosmetic: the
  title, the flame colour, and which of two epilogue scenes plays (see Q1-04).

> *(reference)* The shape — a grieving guardian turned villain, a seal failing, a final dungeon behind a
> sealed door — is a familiar genre spine. Every name, place and specific is original.

---

## 5. The main story in beats

The main story is called **"The Lamp Goes North"**. Twelve chapters plus a prologue, one per region,
each ending at that region's last dungeon or a story instance. **Every chapter-ending dungeon is a
5-player dungeon** that can be finished on Normal with followers. A dungeon only shows in the
**Dungeon Finder** once the character has discovered its entrance (canon 00 §8), so each chapter walks
the player to its dungeon's door first. Page 14 has every quest id, giver, objective and reward; this
is the shape.

| Ch | Title | Region | Levels | Beat | Ends at |
|---|---|---|---|---|---|
| P | **Stick and Satchel** | Hearthvale | 1–3 | The player signs the Warden muster at the First Waystone in Brightwater (or at Oakhollow, §7), learns to fight, and meets Iris Vael of the Lantern House, who is measuring why the barrows woke. | The first barrow-dead killed at Harrow Watch |
| 1 | **The Barrow Wakes** | Hearthvale | 3–7 | The Sootwick goblins are robbing the barrows; the dead come up behind them. Something in the Hollow Barrow is calling them. Iris finds a Kindled mark burned into the barrow door — the Fire King's people were here first. | d01 The Hollow Barrow — its boss carries a letter in a hand nobody knows |
| 2 | **Lights in the Fen** | Mossfen | 6–11 | Lights over the marsh lead people into the water; the Mire Sisters are drowning villagers "to feed the lamp". The Drowned Mill is grinding bones. First sighting of a **Drowned** — the dead of the far north-east have walked here underground. | d02 The Drowned Mill |
| 3 | **The Crown Assembly** | Highcourt | 10–12 | The player walks the Fen Causeway to Highcourt with Iris's findings. The four seats argue; the Lampbearer's Seat is empty. A projection of the Fire King appears in the hall — his first offer. The Assembly sends the player north through the Kettle Pass. | A council scene; while the player is in Highcourt the bank, mail and Trading Post (11), waystones and **Travel Methods** (12) open (page 07 ladder) |
| 4 | **Deepforge** | Greyridge | 12–18 | The Deepforge Clans' mines have broken into an old Barrowking road; the Deepworn are coming up changed. Bellows Keep has stopped answering. The Kindled are buying dwarf steel for the Legion. | d03 Shaft Seven Mines, d04 Bellows Keep |
| 5 | **Glass and Breath** | Sunscar | 17–24 | The Sandsworn (a Quiet Wake chapter) guard the only true account of the Tearing, bottled in the breath-jars of their kings. The player must enter the Glass Tombs to read it. The account: the Everflame is a key. | d05 The Glass Tombs, d06 Vault of the Sandsworn |
| 6 | **The Dimming** | Whisperwood | 22–30 | A second moonwell is going dark. The Moonwell Circle (a Greenhand chapter) blames the Fire King, correctly: he is drawing on the wells to strengthen his pull. The Thornmane packs are running mad. | d07 Thornheart Hollow, d08 Ruins of the Moonwell |
| 7 | **Ashfall** | Cinder Steppe | 28–36 | The Kingsfire Legion marches south with the Ashtusk Warhost as its spear. Fort Ashfall is besieged. An Ashtusk defector, Ghara, says the orcs were driven south by the Legion, not by cold. | Story instance *The Siege of Fort Ashfall* + d09 The Warmaster's Pit |
| 8 | **Rime** | Frostmantle | 34–42 | The Wardens' Rime watch holds the western road to Kingsfire. The Stonehide giants are coming down off the peaks: something under the Throne Ice is waking, and the King wants it awake. | d10 Rimefang Caverns |
| 9 | **The Drowned Bell** | Drowned Coast | 40–48 | The Sunken Choir's song is a signal — every verse pulls the Mend thinner. The Drowned are digging toward the north cliffs. | d11 Saltdeep Cathedral |
| 10 | **Unmade** | Riftmarch | 46–54 | The Riftwatch (a Lantern House chapter) shows the player what the Mend looks like from underneath. In the Unmade Workshop, the King's artificers are building bodies for the Unmade to wear. Iris is taken. | d12 The Unmade Workshop |
| 11 | **Last Light** | Kingsfire | 52–60 | The last camp before the caldera. The player breaks Cindergate Bastion, frees Iris from the Ashen Reliquary and learns Ysa Varn's story. The King's final offer on the causeway. Then the throne room. | d13 Cindergate Bastion, d14 The Ashen Reliquary, then **d15 The Fire Court** — the Fire King Kaedros (`b_fire_king_kaedros`); the main story's climax |
| 12 | **The Spire** | Spire Isle | 60 | The Mend tears. The player carries the Heartflame across the Pale Sea to the Spire and finds Saelith wounded at the empty brazier. The Unwoven. | **d16 The Spire** (the epilogue), then `q_ms_the_last_lamp` |

**Recurring cast** (ids in §8): **Iris Vael** (`npc_iris_vael`, Lantern House scholar, the player's
guide through every chapter), **Garrick Holt** (`npc_garrick_holt`, a retired Warden who turns up at
the worst moments with a sword), **Ollin** (`npc_ollin_courier`, the courier who brings calling
letters), **Maelor Varn** (`npc_maelor_varn`, the Fire King, crowned **Kaedros** — as a projection until
Ch 11; the d15 boss is `b_fire_king_kaedros`), **Ysolde's Echo** (`npc_ysoldes_echo`, a light that
speaks at each moonwell, waystone and the Spire from Ch 6 on), and **Saelith** (`npc_saelith`, the elf
who has guarded the Spire since the Sealing; met in Ch 12).

---

## 6. Factions

Wildmarch reuses Farhold's faction machinery — standing −100…+100, rivals feel a third of every deed,
grip on a zone, patrols, caravans (reuse: `prototypes/farhold/js/factions.js`, `js/territory.js`,
`js/patrols.js`, `js/caravans.js`, `data/factions.json` deeds). What changes in round 2 (canon 00 §12.2,
ruling W12): **fewer factions with further reach.** Farhold's problem was a faction that lived in one
low-level zone on one island, so a level-40 player had no reason to care about it. Wildmarch has
**seven player factions**, and **every one of them is met in the first twelve levels and is still there
at 60**. Each is made of **chapters** — local groups with their own town, faces and quests — so the
faction you helped in Mossfen at level 8 is the same faction whose chapter you meet in the Drowned Coast
at 44, and your standing carries over. Page 07 owns the reputation tiers, their ranges and the reward
table; this page owns who the factions are, where their chapters stand and who they hate.

### 6.1 How standing works (reuse, with round-2 changes)

- **One standing per faction**, not per chapter. A deed for the Fenfolk in Mossfen and a deed for the
  Moonwell Circle in Whisperwood both move `fac_greenhand`.
- **Tiers** are page 07's seven names (canon W22): **Hunted, Disliked, Known, Welcome, Trusted, Kindred,
  Sworn**. Page 07 owns the ranges, the price changes and the rewards at each tier.
- **Rivals:** a deed for a faction moves its **rival** by −⅓ of the same amount (reuse: Farhold's
  "a deed for one is a third of a deed against their rivals"). Each player faction has **at most one**
  rival (§6.3), so nobody can be liked by everybody, but nobody is pulled in five directions either.
- **Enemy factions** (§6.4) are always hostile; standing with them only goes down and has no rewards.
- **Floor:** a player can never reach **Hunted** with a player faction through PvE deeds alone; the
  floor from rival losses and board-job abandons is the bottom of **Disliked**, so no one locks
  themselves out of a hub town.
- **Quartermasters.** Every faction has a **quartermaster** (`RV` in the settlement tables) in each of
  its chapter towns. Every quartermaster sells the faction's whole catalogue — it does not matter which
  chapter you buy from. The catalogue scales: gear is sold **at your level, up to 60** (so a faction
  earned at 10 still sells you level-60 gear at 60), plus **jewels**, **gadget recipes** (page 19) and
  **one faction mount**. Page 08 owns prices and items; page 07 owns which tier opens what.
- **Reputation gain** is one of the seven magic-find stats (canon 00 §12.3); page 08 owns the maths.

### 6.2 The seven player factions

| id | Faction | What they want | Chapters (old factions folded in) | Where you meet them, low → high | Quartermasters (`RV`) | Rival | Enemy factions they fight |
|---|---|---|---|---|---|---|---|
| `fac_wardens` | **The Wardens** | Roads safe, borders held | **Vale watch** (old Vale Wardens) · **the Waystone keepers** (tend every waystone on the continent) · **Rime watch** (old Frost Wardens) · **Spire watch** (the Wardens' post on Spire Isle) | Brightwater and Harrow Watch (1–6) → every waystone (from 12) → Rimehold and Icefall Camp (34–42) → Spire Landing (60) | Brightwater, Highcourt (Warden's Yard), Rimehold, Spire Landing | — (the Wardens have no rival) | Sootwick Gang, Stonehide Clans, Riftborn |
| `fac_crown_assembly` | **The Crown Assembly** | The realm kept together; the Lampbearer's Seat filled | **Highcourt** (the Assembly and the crownlands) · **the fort garrisons** (Redmesa Post, Fort Ashfall, Ashfall Watch, Last Light, Cinderwatch) · **Ghara's Free Tusks** (Ashtusk defectors who swore to the Assembly for land, from Ch 7) | Highcourt (10–14) → Redmesa Post (17–20) → Fort Ashfall and Ghara's Camp (28–36) → Last Light and Cinderwatch (52–60) | Highcourt (Crown Ward), Fort Ashfall, Ghara's Camp, Last Light | the Greenhand (forts and roads cut the forests and take the grain) | Ashtusk Warhost, Kingsfire Legion |
| `fac_deepforge_clans` | **The Deepforge Clans** | Their deep roads back; dwarf steel not sold north | **Anvilgate** (the Thane's hall and the First Forge) · **the Stone Count** (the Clans' toll-keepers on the passes and bridges) · **Hollowpeak** (the lodge under the Giants' Stair) · **the Kingsfire forges** (dwarf smiths who went north to arm the resistance) | Wend Bridge toll (Hearthvale, 3) → Anvilgate, Cutstone, Stonebridge (10–18) → Hollowpeak Lodge (36–41) → Last Light forge (52–60) | Anvilgate, Stonebridge, Hollowpeak Lodge, Last Light | the Cutwater (tolls against free passage) | Stonehide Clans, Unburied Legion (the barrow-roads under their mines), Kingsfire Legion |
| `fac_greenhand` | **The Greenhand** | Everyone fed; the wild kept whole | **Farmers and herders** (Hearthvale farms, Oakhollow, the Tallgrass herders) · **the Fenfolk** (Mossfen) · **the Moonwell Circle** (Whisperwood) · **the Ashgrowers** (farmers growing food on ash ground at Kiln Hollow for Last Light, from Ch 11) | Oakhollow and Millbrook (1–6) → Reedhollow (5–12) → Silverbough (22–30) → Tallgrass (28–36) → Kiln Hollow (54–60) | Oakhollow, Reedhollow, Silverbough, Tallgrass, Kiln Hollow | the Crown Assembly | Thornmane Packs, Sootwick Gang, Ashtusk Warhost (they burn the herds) |
| `fac_lantern_house` | **The Lantern House** | Every old thing catalogued; the Tear measured; the truth of the Sealing | **the scholars** (Lantern Row, Highcourt; Iris Vael's house) · **the Longsight** (mapmakers and surveyors) · **the Riftwatch** (Waystone Camp) | Iris Vael in the prologue (1) → Lantern Row, Highcourt (10+) → Redmesa and the Glass Flats digs (17–22) → Waystone Camp and Shardfall Post (46–54) → Spire Landing (60) | Highcourt (Lantern Row), Waystone Camp, Shardfall Post, Spire Landing | the Quiet Wake (the House opens what the Wake seals) | Threadcutters, Riftborn |
| `fac_cutwater` | **The Cutwater** | Free rivers and seas; no tolls | **the river boatmen** (Slowwater and Wend) · **the barge lines** (they run the river and sea Travel Methods, page 20) · **the Saltbound** (divers and wreckers of the Drowned Coast) | Stillwater Landing and Peatmoor (5–12) → Highcourt Low Wharf (10–14) → Thistlemere ferry (24) → Saltmarch and Brinehollow (40–48) → the ship to Spire Isle (60) | Stillwater Landing, Highcourt (Low Wharf), Saltmarch, Brinehollow | the Deepforge Clans | the Drowned, Threadcutters (their wreckers) |
| `fac_quiet_wake` | **The Quiet Wake** | The dead kept down; the tombs kept shut | **the graveyard keepers** (every chapel and graveyard; the Highcourt Undercroft) · **the Sandsworn** (the tomb guardians of the Sunscar) · **the Saltmarch bell-keepers** (Drowned Coast) · **the Reliquary watch** (keepers of the old Order's dead in the Kingsfire caldera, from Ch 11) | Harrow Watch and the barrow downs (5–6) → Reedhollow chapel barge (8) → Highcourt Undercroft, Highcairn (10–17) → Oasis of Tamar and Dunehold (16–24) → Saltmarch (40–48) → Last Light (57–60) | Harrow Watch, Highcourt (Temple Rise), Oasis of Tamar, Dunehold, Saltmarch | the Lantern House | Unburied Legion, the Drowned |

**Canon check** (00 §7 "Held by" column, repeated in each region below): Hearthvale — Wardens (Vale
watch) · Mossfen — Greenhand (the Fenfolk) · Highcourt — Crown Assembly · Greyridge — Deepforge Clans ·
Sunscar — Quiet Wake (the Sandsworn) · Whisperwood — Greenhand (the Moonwell Circle) · Cinder Steppe —
contested (Crown Assembly vs the Ashtusk Warhost) · Frostmantle — Wardens (Rime watch) · Drowned Coast —
contested (the Cutwater vs the Drowned) · Riftmarch — Lantern House (the Riftwatch) · Kingsfire —
contested (the Kingsfire Legion holds all but Last Light and Cinderwatch) · Spire Isle — nobody.

**Why each faction still matters at 60:** the quartermaster catalogue is level-scaled to 60; every
faction has a chapter in a level-52+ place (Wardens and Lantern House at Spire Landing, Crown, Deepforge,
Greenhand and Quiet Wake at Last Light or Kiln Hollow, the Cutwater on the Spire Isle ship); and each
faction's top tier (Sworn) unlocks something that is only useful at 60 (page 07).

### 6.3 Relations at a glance

`·` neutral, `+` friendly (deeds do not spill over; flavour and shared camps only), `−` **rival** (a deed
for one costs a third with the other).

| | Wardens | Crown | Deepforge | Greenhand | Lantern | Cutwater | Quiet Wake |
|---|---|---|---|---|---|---|---|
| **Wardens** | | + | · | + | · | · | + |
| **Crown Assembly** | + | | + | **−** | + | · | · |
| **Deepforge Clans** | · | + | | · | · | **−** | · |
| **Greenhand** | + | **−** | · | | · | + | · |
| **Lantern House** | · | + | · | · | | · | **−** |
| **Cutwater** | · | · | **−** | + | · | | · |
| **Quiet Wake** | + | · | · | · | **−** | · | |

Why the rivals: the **Crown** cuts timber for its forts and takes grain for its garrisons, and the
**Greenhand** pays for both; the **Deepforge Clans'** Stone Count tolls the bridges and passes the
**Cutwater** want free; the **Lantern House** digs up and catalogues what the **Quiet Wake** buried on
purpose (a museum in Highcourt still displays three Sandsworn breath-jars looted in 140 AS). Arguments
*inside* a faction are flavour, not standing: the Moonwell Circle and the Hartsrest woodcutters are both
Greenhand and still argue about every tree.

### 6.4 Enemy and neutral factions

Enemy factions are always hostile; standing only goes down (canon 00 §12.2). The warbands use page
10's level bands.

| id | Name | Kind | Where (levels) | What they want | Who fights them hardest |
|---|---|---|---|---|---|
| `fac_sootwick` | The Sootwick Gang | goblin warband | Hearthvale, Mossfen, Greyridge (2–18) | Anything left on a road | Wardens, Greenhand |
| `fac_unburied` | The Unburied Legion | undead warband | Hearthvale downs edges, Greyridge moors, Sunscar tomb edges (12–24) | To keep marching | Quiet Wake, Deepforge Clans |
| `fac_thornmane` | The Thornmane Packs | beastkin warband | Sunscar mesas, Whisperwood (20–32) | Their hunting ground back | Greenhand |
| `fac_ashtusk` | The Ashtusk Warhost | orc warband | Sunscar scouts, Cinder Steppe, Frostmantle southern passes (26–40) | Land that is not on fire | Crown Assembly, Greenhand |
| `fac_stonehide` | The Stonehide Clans | giant warband | Frostmantle, Drowned Coast cliffs (34–50) | The peaks, and everything below them | Wardens, Deepforge Clans |
| `fac_kingsfire_legion` | The Kingsfire Legion | the Fire King's army (warband) | Kingsfire; war-bands south to the Steppe and Frostmantle (50–60; Kindled agents appear in story quests from Ch 1) | The Mend opened | every player faction |
| `fac_the_drowned` | The Drowned | undead | Drowned Coast, some of Mossfen | The Choir's song finished | Quiet Wake, Cutwater |
| `fac_threadcutters` | The Threadcutters | cult | cells everywhere, strongest in the Riftmarch; the Mire Sisters of Mossfen are a cell | To be remade by the Unmade (they cut the threads of the Mend) | Lantern House, Cutwater |
| `fac_riftborn` | The Riftborn | aberrations | Riftmarch, Spire Isle, any rift | nothing a person can name | Wardens, Lantern House |
| `fac_deepworn` | The Deepworn | **neutral** (starts Disliked, can be raised to Known; no quartermaster) | Greyridge deep mines | To go deeper; to be left alone down there | — |

**Warband levels** are page 10's (canon 00 §10): Sootwick 2–18, Unburied 12–24, Thornmane 20–32,
Ashtusk Warhost 26–40, Stonehide 34–50, Kingsfire Legion 50–60. Where a warband shows up in each
region is page 10's *warband presence* line; the region sections below follow it. The **Ashtusk defector
arc** (Ch 7) does not raise Ashtusk standing (an enemy faction's standing only goes down): Ghara's
defectors **leave** the Warhost and become the Crown Assembly's **Free Tusks** chapter, so their camp is a
Crown camp with orcs in it.

### 6.5 Old faction ids → round-2 ids

For every page and data file that still uses a round-1 id:

| Old id (round 1) | Now |
|---|---|
| `fac_vale_wardens`, `fac_frost_wardens` | `fac_wardens` (Vale watch, Rime watch) |
| `fac_fenfolk`, `fac_moonwell_circle` | `fac_greenhand` (the Fenfolk, the Moonwell Circle) |
| `fac_sandsworn` | `fac_quiet_wake` (the Sandsworn) |
| `fac_riftwatch`, `fac_longsight` | `fac_lantern_house` (the Riftwatch, the Longsight) |
| `fac_stone_count` | `fac_deepforge_clans` (the Stone Count) |
| `fac_saltbound` | `fac_cutwater` (the Saltbound) |
| `fac_ember_legion` | `fac_kingsfire_legion` |
| `fac_unwoven` (the cult) | `fac_threadcutters` (canon 00 §10) |
| the Spire Accord (joint reputation) | removed — Spire Landing has Wardens and Lantern House quartermasters |

Chapter ids *(proposed, §15)*: `chp_<snake>` — `chp_vale_watch`, `chp_waystone_keepers`,
`chp_rime_watch`, `chp_spire_watch`, `chp_highcourt`, `chp_fort_garrisons`, `chp_free_tusks`,
`chp_anvilgate`, `chp_stone_count`, `chp_hollowpeak`, `chp_kingsfire_forges`, `chp_farmers_herders`,
`chp_fenfolk`, `chp_moonwell_circle`, `chp_ashgrowers`, `chp_scholars`, `chp_longsight`,
`chp_riftwatch`, `chp_river_boatmen`, `chp_barge_lines`, `chp_saltbound`, `chp_graveyard_keepers`,
`chp_sandsworn`, `chp_bell_keepers`, `chp_reliquary_watch`. A chapter id is only a label for towns,
NPCs and quest text; standing is always stored on the faction.

---

## 7. Playable races, homelands and starting towns

Four playable races (canon §4), all Farhold's Chibi 2 body presets (reuse:
`prototypes/farhold/js/bodypresets.js`). **There is one player faction** (canon W25): every race is on
the same side and can party, trade and quest with every other. Race changes the first scene's greeting,
a starting cosmetic, a racial homeland you are welcomed in, and a small racial perk (page 07 owns perks).

**Starting towns.** The character creator offers **two starting towns**, both in Hearthvale (1–6), and
**any race may pick either**:

| Starting town | id | Default for | First three quests | Joins the shared story at |
|---|---|---|---|---|
| **Brightwater** | `town_brightwater` | Human, Dwarf, Elf | Warden muster at the First Waystone (page 14 P.1–P.3) | P.4 (escort Iris Vael's cart on the south road) |
| **Oakhollow** | `town_oakhollow` | Halfling | the Hearth Speaker's muster at the burrow gate (page 14 P.1b–P.3b) | P.4 — Oakhollow is 1.1 km west of Brightwater on the same south road |

Both openings are the same length (about 20 minutes to P.4), teach the same things in the same order,
and end on the same road, so friends who picked different towns meet at P.4 without a detour. Dwarf and
elf homelands (Anvilgate at 10–18, Silverbough at 22–30) are too far up the level ladder to start in;
they are **homelands**, welcomed on arrival.

| Race | Body preset | Homeland (town id) | Why they are in Hearthvale | Starting cosmetic | Homeland welcome | Voice baseline |
|---|---|---|---|---|---|---|
| **Human** | `human` | Hearthvale + Highcourt (`town_brightwater`) | They live here | Warden's grey hood | The Crown's quartermaster in Highcourt gives a free bag at level 10 | `villager` jitter 0.15 |
| **Halfling** | `halfling` | Oakhollow burrows in Hearthvale (`town_oakhollow`) | Lampbearer's kin; every halfling walks the Lamp Road once | a brass lamp charm (hip; decoration, gives no light) | Oakhollow's Hearth Speaker gives a pie that restores 100% health once per real day (cosmetic buff icon) | `villager` pitch +0.12, speed +0.05 |
| **Dwarf** | `dwarf` | Anvilgate, Greyridge (`town_anvilgate`) | Sent south by their clan to "learn how the soft folk fight" | a clan braid-ring | Anvilgate's First Forge rebrands one weapon's look free (cosmetic) | `warrior`-ish depth +0.1 |
| **Elf** | `elf` | Silverbough, Whisperwood (`town_silverbough`) | Watching the Mend from the south, as the Moonwell Circle asked | a leaf-silver circlet | Silverbough's moonwell pool gives a free wardrobe appearance (a moonwell-blue dye) | `mage`-ish tone +0.1, speed −0.05 |

The five **enemy races** (Orc, Goblin, Giant, Undead, Beastkin) are Farhold's Chibi 2 warband races
(reuse: `avatar-3d/js/chibi2-races.js`, `data/warbands.json`) and appear only as enemies — except Ghara
and her Free Tusks (§8.6), orcs you can talk to and trade with.

---

## 8. The regions

Every region below follows the same pattern:

- **At a glance** — id, levels, hub, holder, size, culture of its towns (a proctown culture, reuse:
  `proctown/js/townplan.js` `CULTURES`), music mood, Tear pressure.
- **Sub-zones** — each with its own level band (`sz_<snake>`). The map's level overlay (reuse:
  Farhold `js/zones.js` bands) draws these, not the whole region.
- **Settlements** — `town_<snake>`, kind, size (proctown size 1–6), services.
- **Landmarks** — `lm_<snake>`, reusing a Farhold landmark kind where one fits
  (`prototypes/farhold/data/landmarks.json`: wayshrine, standing_stones, watchtower, gibbet,
  burnt_farm, collapsed_mine, ferry_landing, toll_bridge, hunting_blind, cairn_field, beacon,
  sunken_wreck, forge_fire, broken_road).
- **NPC cast** — `npc_<snake>`, role, where, voice role (`shared/voices.js`), what they do.
- **Factions present and enemies by family** — families are Farhold's eight (beast, undead,
  construct, fiend, elemental, aberration, dragonkin, humanoid) plus the warbands. Named monsters are
  examples; **page 10 owns every monster id**.
- **Dungeon entrances and world boss site** — ids from canon; content on pages 12 and 13. A dungeon
  entrance is a place in the world you must **discover** (walk up to it, or arrive by a teleport) before
  the Dungeon Finder lists that dungeon (canon 00 §8). World boss names here are page 13's (they reuse
  Farhold's `data/worldbosses.json` names where they fit); page 13 owns them.
- **Dark places** — graveyards, crypts, caves and mines in the region and how they are lit (§11).
- **Weather** — percent chance each weather state is rolled (§11) (reuse: `worldgen/js/weather.js` states;
  `ionstorm` is renamed **Tearstorm** for Wildmarch).
- **Music** — mood, instruments, tempo, key. Page 17 owns the actual tracks.

Service codes used in the settlement tables:
`WS` waystone (binds the Recall Stone; teleports arrive here, §10.3) · `IN` inn
(rest, rumours, a minstrel) · `SM` smith (repair, sell weapons/armour) · `GM` general merchant ·
`RG` reagents/consumables · `ST` stable (a stablemaster: mounts, and rangers' tamed beasts, §10.4) ·
`TM` **Travel Method station** (§10.2, page 20) · `FY` a station that is a quay or harbour (barge and
ship lines) ·
`BX` banker's box (bank access) · `MB` mailbox · `NB` notice board (jobs) · `BR` mercenary broker
(followers) · `UB` Unbinder (retraining) · `GA` gambler (sealed crates) · `CH` chapel (revive point,
curse removal) · `TR` trainer (spell talents explained; class training is Highcourt only) ·
`BN` crafting bench (reuse: Farhold `js/craft.js`; profession stations are page 19's) · `RV` faction
quartermaster (the faction and chapter are named in brackets).

---

### 8.1 Hearthvale — `hearthvale`

| At a glance | |
|---|---|
| Levels | 1–6 |
| Hub | Brightwater (`town_brightwater`) |
| Held by | `fac_wardens` — the **Vale watch** chapter |
| Size | 4.0 × 3.0 km; the Wend runs north→south down the middle into the Hearthsea |
| Town culture | `human` (timber, thatch, jettied upper storeys); Oakhollow `halfling` |
| Tear pressure | 0.05 (the tear-light is not visible from here) |
| Music | Pastoral: lute, recorder, fiddle drone; 84 BPM; major key. In caves and crypts: solo harp, low strings, 60 BPM |
| Feel | Golden fields, orchards, a slow river with mills on it, hedgerows. The barrow downs to the east are the first wrong thing you see — grey grass, standing stones, crows. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_brightwater_fields` | Brightwater Fields | 1–2 | Wheat and barley around the hub; field rats, crows, a boar or two. The tutorial ground. |
| `sz_old_orchards` | The Old Orchards | 2–3 | West bank; apple and pear orchards gone half wild; orchard wasps, foxes, Sootwick scavengers stealing fruit carts. Oakhollow's burrows. |
| `sz_wend_banks` | The Wend Banks | 3–4 | The river, Millbrook's mill, two fords and the toll bridge. River crabs, the **Hedge Knives** bandits on the east road. |
| `sz_southwood` | The Southwood | 4–5 | Old oak wood in the south-west down to the sea cliffs; wolves, spiders, a Sootwick camp (warband stronghold, tier 1). |
| `sz_barrow_downs` | The Barrow Downs | 5–6 | Chalk downs east of the river; forty barrows; the first undead. Harrow Watch outpost. **d01 The Hollow Barrow.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_brightwater` | Brightwater | hub town, walled (palisade), river port on the Hearthsea | 4 | human | WS IN SM GM RG ST(mounts from 10; ranger beasts from 6) TM(from 12) FY(Wend barge) BX MB NB BR CH TR BN RV(Wardens, Vale watch); the First Waystone; the Warden drill yard; **starting town** |
| `town_oakhollow` | Oakhollow | halfling burrow village, hedge boundary | 2 | halfling | WS IN GM MB NB RV(Greenhand, farmers and herders); halfling homeland; **starting town** (§7) |
| `town_millbrook` | Millbrook | river hamlet with a mill | 2 | human | IN GM NB |
| `town_harrow_watch` | Harrow Watch | Warden outpost on the downs, wooden tower + stockade | 1 | human | WS GM NB CH RV(Quiet Wake, graveyard keepers) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_first_waystone` | The First Waystone | wayshrine (special) | The first waystone on the continent, in Brightwater's square; where Ysolde lit her lamp. **Bindable** (§10.3); every new Brightwater character's Recall Stone starts bound here. |
| `lm_oakhollow_waystone` | The Burrow Gate Waystone | wayshrine | Oakhollow's waystone, beside the burrow gate. **Bindable** (§10.3); every new Oakhollow character's Recall Stone starts bound here. |
| `lm_ysoldes_well` | Ysolde's Well | wayshrine | A stone well with a lamp niche; drinking gives *Lampwater* (+5% XP for 30 min, once per real day). |
| `lm_calling_stones` | The Calling Stones | standing_stones | Thirty worn stones, one carved for each class; where every **first calling quest** (level 6) ends. |
| `lm_old_mill_wheel` | The Old Wheel | broken_road | A washed-out mill race on the east road; repairing it (a Millbrook side quest) shortens the road by 300 m for everyone for a day (world state, page 14 events). |
| `lm_harrow_beacon` | Harrow Beacon | beacon | Lighting it calls the Warden patrol; used by the *Barrow Rising* event (page 14). |
| `lm_southwood_gibbet` | The Southwood Gibbet | gibbet | Names the Hedge Knives' leader and starts his bounty. |
| `lm_barrow_cairns` | The Forty Barrows | cairn_field | Digging a cairn gives a rare item and starts the *Restless Dead* incident in the downs for 3 real hours. |
| `lm_toll_bridge_wend` | Wend Bridge | toll_bridge | 1 gold toll, collected by the Stone Count (Deepforge Clans); ford upstream is free and has river crabs. |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_odile_marsh` | Warden-Captain Odile Marsh | Wardens commander (Vale watch) | Brightwater drill yard | `warrior` f | Prologue + Ch 1 giver; the muster; the Dungeon Finder and dungeon journal (`q_hv_the_barrow_bell`, level 6) |
| `npc_bram_fenwick` | Elder Bram Fenwick | town elder | Brightwater hall | `elder` m | Side quests; the town's worries |
| `npc_hesk` | Drillmaster Hesk | Warden drillmaster | Brightwater drill yard | `fighter` m | **Dodge roll lesson** (`q_hv_fall_and_rise`, level 5; page 07 names this giver `npc_hv_drillmaster_corran`), combat dummies |
| `npc_sister_wren` | Sister Wren | chapel keeper | Brightwater chapel | `cleric` f | Revive point, curse removal, the perk-forest introduction |
| `npc_marta_coll` | Marta Coll | general merchant | Brightwater market | `merchant` f | Shop, buyback |
| `npc_dunmore` | Dunmore | smith | Brightwater forge | `brute` m | Repairs; sells a starter harvesting tool (Harvesting and your crafting profession open at 9 in Reedhollow, `q_mf_the_right_tool` and `q_mf_what_the_fen_gives_back`; page 19) |
| `npc_ned_barrow` | Ned Barrow | mercenary broker | the Lamp and Ladder inn | `villager` m | Hires followers once you have a slot (the first slot comes at 8 from `npc_mf_broker_wendel` in Reedhollow) |
| `npc_hv_runner_tamsin` | Tamsin | Brightwater's message runner | Brightwater square | `villager` f | **Sprint** (`q_hv_the_long_field`, level 2; page 07) |
| `npc_hv_herbwife_orla` | Orla | the orchard herbwife | the Old Orchards | `villager` f | **Potion belt** (`q_hv_the_herbwifes_basket`, level 3; page 07) |
| `npc_hv_innkeeper_bram` | Bram | innkeeper of the Lamp and Ladder | the Lamp and Ladder | `merchant` m | **Recall Stone** (`q_hv_a_bed_by_the_fire`, level 7; page 07): hands you `it_recall_stone` and walks you to the First Waystone to bind it |
| `npc_iris_vael` | Iris Vael | Lantern House scholar | arrives in Brightwater in the prologue; travels | `mage` f | Main story guide, every chapter *(reuse name: Emberveil)* |
| `npc_garrick_holt` | Garrick Holt | retired Warden | Harrow Watch | `warrior` m | Ch 1; turns up again in Ch 4, 7, 11 *(reuse name: Emberveil)* |
| `npc_pip_underbough` | Pip Underbough | Hearth Speaker of Oakhollow | Oakhollow | `elder` f pitch +0.12 | Oakhollow's opening (page 14 P.1b–P.3b); halfling homeland welcome; orchard side quests |
| `npc_tansy_miller` | Tansy Miller | the Millbrook miller | Millbrook | `villager` f | Side quests; the Old Wheel |
| `npc_ollin_courier` | Ollin | courier of the Hall of Callings | anywhere on a road | `rogue` m | Brings the level-6 calling letter; reappears for 20 and 40 |
| `npc_hollis_crane` | Hollis Crane | leader of the Hedge Knives | the Southwood (enemy, rare) | `brute` m | Bounty target |

**Factions present:** `fac_wardens` (holder, Vale watch, grip 0.9) · `fac_greenhand` (farmers and
herders: Oakhollow, Millbrook) · `fac_lantern_house` (Iris Vael, the scholars) · `fac_quiet_wake`
(graveyard keepers at Harrow Watch and the downs) · `fac_deepforge_clans` (the Stone Count's one bridge).
Hostile: `fac_sootwick`; Kindled agents (`fac_kingsfire_legion`, story only); the Hedge Knives (a local
humanoid bandit band, not a faction — no standing).

**Enemies by family:** beast (field rats, crows, boars, orchard wasps, wolves, spiders, river crabs) ·
humanoid (Hedge Knives bandits) · goblin warband (Sootwick scavengers, hexers, cutpurses) · undead
(barrow stragglers, barrow wights in the downs only). **Rare elites:** *Bramblecoat*, a thorn-grown
boar the size of a cart (level 5, reuse name: Farhold world boss tier 1, demoted to rare elite) ·
*Hollis Crane* (level 5). **No world boss** (canon: world bosses from region 3 up).

**Dungeon:** `d01_hollow_barrow` — the biggest barrow on the downs, its doorstone lying flat (reuse:
Farhold setpiece `inst_doorstone_barrow`). Entrance at the downs' east edge, 400 m from Harrow Watch.

**Dark places:** the Barrow Downs sit under a permanent low grey overcast (a local sky, page 17) that
makes them read as dusk while the fields are in full sun; the barrows inside are crypts, lit by
grave-candles in wall niches and pale blue barrow-moss (§11). **Restless Dead** (the incident, page 14)
doubles undead spawns on the downs, and field rats within 200 m of an opened barrow become *Barrow Rats*
(undead variant) while it runs.

---

### 8.2 Mossfen — `mossfen`

| At a glance | |
|---|---|
| Levels | 5–12 |
| Hub | Reedhollow (`town_reedhollow`) |
| Held by | `fac_greenhand` — the **Fenfolk** chapter |
| Size | 4.5 × 3.0 km, east of Hearthvale; the Slowwater winds through it and never reaches the sea |
| Town culture | **`fen`** *(new proctown culture: halfling street grammar + the `stilted` house base, boardwalk streets, reed roofs, no wall — see §15)* |
| Tear pressure | 0.08 |
| Music | Reed pipes, frame drum, a bowed psaltery; 72 BPM; Dorian mode. In caves and crypts: the drum stops, frogs and a single low flute |
| Feel | Grey-green water, boardwalks, stilt houses, peat cuttings, will-o-lights. Fog most mornings. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_reedhollow_shallows` | Reedhollow Shallows | 5–7 | Knee-deep water round the hub; bog frogs, leech swarms, marsh wolves. |
| `sz_peat_cuts` | The Peat Cuts | 7–9 | Cut peat banks, drying racks, a Sootwick camp raiding the cutters. |
| `sz_lantern_marsh` | The Lantern Marsh | 8–10 | Deep marsh lit by false lights; the **Mire Sisters** (humanoid casters) drown travellers here. |
| `sz_drowned_mill_reach` | Drowned Mill Reach | 9–12 | A flooded village round a mill that still turns underwater. **d02 The Drowned Mill.** First Drowned. |
| `sz_hagsbog` | Hagsbog | 10–12 | The north marsh under the Whisperwood cliffs; the Mire Sisters' coven ring under the Whisperwood cliffs. |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_reedhollow` | Reedhollow | hub, stilt town on boardwalks | 4 | fen | WS IN SM GM RG ST TM(from 12) FY BX MB NB BR CH TR BN RV(Greenhand, the Fenfolk); the profession stations of the south (page 19) |
| `town_peatmoor` | Peatmoor | peat-cutters' village | 2 | fen | WS IN GM NB |
| `town_stillwater_landing` | Stillwater Landing | ferry post on the Slowwater, Cutwater ground | 1 | human | WS FY GM NB RV(Cutwater, river boatmen) |
| `town_ninewillow` | Ninewillow | hamlet on an island of nine trees | 1 | halfling | WS IN NB |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_stillwater_ferry` | Stillwater Ferry | ferry_landing | The Wend barge's stop (`tm_barge_wend`, a scheduled Travel Method from 12, page 20) |
| `lm_sunken_shrine` | The Sunken Shrine | wayshrine | Half underwater; rest; revives a fallen follower (no limit) |
| `lm_lamp_posts` | The Lamp Posts | beacon | Twelve posts on the causeway; lighting all twelve while a fog bank is in banishes the false lights for 1 real hour (event hook) |
| `lm_hagsbog_ring` | The Hag Ring | standing_stones | Puzzle: turn the six stones so their carvings face the sun; +1 perk point (once per character; reuse Farhold `perkPoint`) |
| `lm_peat_wreck` | The Peat Barge | sunken_wreck | Dive loot; the Cutwater want the cargo back |
| `lm_drowned_bell` | The Drowned Bell | gibbet (variant) | A bell on a post in the water that rings on its own; ringing it on purpose spawns a Drowned champion |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_mother_ilse` | Mother Ilse | Fen-Speaker, leader of the Fenfolk | Reedhollow long hall | `elder` f | Ch 2 giver |
| `npc_corwin_reed` | Corwin Reed | ferryman, Cutwater | Stillwater Landing | `rogue` m | The Stillwater station-master's deputy; smuggling side quests |
| `npc_mf_broker_wendel` | Wendel | mercenary broker | Reedhollow | `merchant` m | **First follower slot** (`q_mf_coin_for_a_blade`, level 8; page 07) |
| `npc_mf_scrapwright_mabli` | Mabli the Scrapwright | salvager and profession-master of Reedhollow (was `npc_mf_scrapwright_hesk`, renamed to end the clash with Drillmaster Hesk) | Reedhollow | `brute` f | **Salvage and choosing a crafting profession** (`q_mf_what_the_fen_gives_back`, level 9; page 19) |
| `npc_brother_aldo` | Brother Aldo | Quiet Wake grave-tender | Reedhollow chapel barge | `cleric` m | Drowned dead side quests; revive point |
| `npc_neve_hollis` | Neve Hollis | herbalist (hedge-witch wanderer kind) | edge of the Lantern Marsh | `mage` f | **Harvesting** (`q_mf_the_right_tool`, level 9; page 19): gives your first harvesting tool; gathering side quests |
| `npc_tobin_brack` | Tobin Brack | the drowned miller's son | Drowned Mill Reach | `child` m | Ch 2; the reason to enter d02 |
| `npc_saskia_venn` | Saskia Venn | Cutwater smuggler captain | Peatmoor | `rogue` f | Cutwater side line |
| `npc_old_gammer_tull` | Old Gammer Tull | eldest of the Mire Sisters (enemy, rare) | Hagsbog | `cultist` f | Bounty target; talks before the fight |

**Factions present:** `fac_greenhand` (holder, the Fenfolk, grip 0.8) · `fac_cutwater` (river
boatmen at Stillwater Landing, Saskia Venn's smugglers at Peatmoor) · `fac_quiet_wake` (Brother Aldo's
chapel barge). Hostile: `fac_sootwick`, the Mire Sisters (a cell of `fac_threadcutters`), the first
`fac_the_drowned`.

**Enemies by family:** beast (bog frogs, mire gators, leech swarms, marsh wolves, heron-kings) ·
humanoid (Mire Sisters) · goblin (Sootwick) · undead (drowned dead, bog-bodies) · elemental (will-o-lights,
harmless until you follow one). **Rare elite:** *The Reedmother*, a heron-and-reed thing 5 m tall
(level 11, reuse name: Farhold world boss tier 1).

**Dungeon:** `d02_drowned_mill` — a mill whose wheel still turns under the water (reuse name + layout:
Farhold instance `drowned_mill`, setpiece `inst_drowned_mill`).

**Dark places:** the Lantern Marsh is the region's gloom — a fog bank sits on it 60% of the time
(its own weather roll), the light goes grey-green and the will-o-lights glow through it. While the fog is
in, will-o-lights double and following one for 20 m spawns a Mire Sister ambush of 3. The Drowned Mill's
flooded cellars are lit by glowing peat-fungus on the beams (§11).

---

### 8.3 Greyridge Highlands — `greyridge`

| At a glance | |
|---|---|
| Levels | 10–18 |
| Hub | Anvilgate (`town_anvilgate`) |
| Held by | `fac_deepforge_clans` — the **Anvilgate** chapter |
| Size | 5.0 × 4.0 km; broken highland running east–west; the Kettle Pass in the south, the Bellows Heights in the north |
| Town culture | `dwarf` (cut stone, flat lead roofs, terraces); Kettle Pass and Stonebridge `human` |
| Tear pressure | 0.12 (the tear-light is first visible from the Bellows Heights) |
| Music | Low brass, male chant, anvil-strike percussion; 90 BPM; natural minor. In caves and crypts: a single horn and wind |
| Feel | Slate, heather, quarries cut in terraces, rail lines, smoke from Bellows Keep on the skyline. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_kettle_pass` | The Kettle Pass | 10–12 | The one road north from Highcourt; waystation; ridge rams, Sootwick raiders, the Stone Count's tolls. |
| `sz_cutstone_quarries` | Cutstone Quarries | 12–14 | Terraced quarries; stone constructs gone rogue, rock lizards, a Sootwick warren. |
| `sz_shaft_seven_slopes` | Shaft Seven Slopes (was Deepdelve Slopes; "delve" is banned) | 13–16 | Mine heads and rail lines; the Deepworn coming up. **d03 Shaft Seven Mines.** |
| `sz_highcairn_moors` | Highcairn Moors | 14–17 | High moor of cairns and old barrow-roads; the Unburied Legion's first ranks. |
| `sz_bellows_heights` | Bellows Heights | 16–18 | The fortress-forge over the north road; smoke, slag, silence. **d04 Bellows Keep.** **World boss site.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_anvilgate` | Anvilgate | hub, a great gate cut into the hillside with blockhouses outside | 5 | dwarf | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Deepforge Clans, Anvilgate); dwarf homeland; the First Forge (weapon branding, reuse Farhold `brand`) |
| `town_kettle_pass` | Kettle Pass Waystation | walled waystation on the pass | 2 | human | WS IN GM ST TM NB (a Kingsroad coaching stop) |
| `town_cutstone` | Cutstone | quarry town | 3 | dwarf | IN SM GM NB BN |
| `town_highcairn` | Highcairn | moor village inside a ring of cairns | 2 | human | WS IN NB CH |
| `town_stonebridge` | Stonebridge | toll town on a three-arch bridge, Stone Count seat | 2 | human | WS GM NB RV(Deepforge Clans, the Stone Count) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_kettle_watchtower` | Kettle Watchtower | watchtower | Reveals the region map |
| `lm_first_forge_fire` | The Hill Forge | forge_fire | A crafting bench outside town |
| `lm_old_rail_collapse` | The Old Seam | collapsed_mine | Dig out over three visits → a hidden instance, *the Old Seam* (reuse: Farhold instance `slumped_adit`) |
| `lm_highcairn_stones` | The Nine Cairns | standing_stones | Puzzle; +1 perk point (once per character) |
| `lm_stonebridge_toll` | Stonebridge | toll_bridge | 3 gold; the Stone Count (Deepforge Clans) |
| `lm_ironmuster_field` | The Ironmuster | (world boss arena, reuse: Farhold setpiece `boss_ironmuster`) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_hilda_ironbraid` | Thane Hilda Ironbraid | Deepforge Thane of Anvilgate | Anvilgate throne hall | `warrior` f depth +0.1 | Ch 4 giver |
| `npc_bodric_ashlock` | Forgemaster Bodric Ashlock | master of the First Forge | Anvilgate | `brute` m | Branding; Bellows Keep quests; **the upgrade bench** (`q_gr_the_second_hammer`, level 16; page 07 names this giver `npc_gr_forgemaster_brunhild`) |
| `npc_gruna_pickett` | Gruna Pickett | mine guide (was `npc_gruna_delver`; "Delver" is a banned word) | Shaft Seven Slopes | `villager` f | Ch 4; d03 lead-in |
| `npc_jessup_cole` | Quarrymaster Jessup Cole | quarry boss | Cutstone | `merchant` m | Side quests |
| `npc_count_ambrose_penn` | Count Ambrose Penn | Stone Count of Stonebridge | Stonebridge | `elder` m | Deepforge Clans side line (the Stone Count chapter); tolls |
| `npc_moira_cairnwife` | Moira the Cairnwife | Quiet Wake keeper of the cairns | Highcairn | `cleric` f | Unburied side quests |
| `npc_kell_ironjaw` | Kell Ironjaw | Deepworn speaker (neutral-hostile) | deep in Shaft Seven Slopes | `undead` m (hollow) | The Deepworn standing (neutral; raised to Known at most) |

**Factions present:** `fac_deepforge_clans` (holder, Anvilgate and the Stone Count, grip 0.75) ·
`fac_crown_assembly` (the Kettle Pass garrison) · `fac_quiet_wake` (Moira the Cairnwife at Highcairn) ·
`fac_deepworn` (neutral). Hostile: `fac_sootwick`, `fac_unburied`, Kindled buyers
(`fac_kingsfire_legion`, only in Ch 4 quests).

**Enemies by family:** construct (quarry constructs, rune sentinels, bellows golems) · beast (ridge
rams, cave bears, rock lizards, crag eagles) · goblin (Sootwick sappers) · aberration (Deepworn
diggers, Deepworn speakers) · undead (Unburied footmen, barrow-road wights). **Rare elites:**
*Gravel-Tusk*, a stone-crusted boar (level 15, reuse name: Farhold world boss tier 1).

**Dungeons:** `d03_shaft_seven` (mine head in Shaft Seven Slopes) · `d04_bellows_keep` (the fortress on
the Bellows Heights; its gate faces the north road).

**Sealed:** the barrow-roads run from under Highcourt north beneath the ridge to the Highcairn Moors,
and a stone door at `lm_highcairn_stones` is their northern end. It stays shut in v2 (the Crypt of the
Barrowking is a parked raid, `WISHLIST.md`); the Nine Cairns puzzle is solved beside it and the
Cairnwife tells its story.

**Dark places:** Shaft Seven's mine heads and the Old Seam are lit by miners' lamps on every prop and by
veins of pale-green **glowcap fungus** where the Deepworn have dug (§11); Bellows Keep's halls glow from
its banked forges.

**World boss site:** `wb_site_ironmuster` on the Bellows Heights — **Grief-in-Iron** (page 13)
(`b_grief_in_iron`, a runic war-engine the Deepforge built and could not stop; level 21; reuse name:
Farhold world boss tier 2).

---

### 8.4 Sunscar Barrens — `sunscar`

| At a glance | |
|---|---|
| Levels | 16–24 |
| Hub | Oasis of Tamar (`town_oasis_of_tamar`) |
| Held by | `fac_quiet_wake` — the **Sandsworn** chapter |
| Size | 5.0 × 5.0 km, west of the Greyridge |
| Town culture | `desert` (mud brick, flat roofs, courtyards, wind-catchers, a covered bazaar) |
| Tear pressure | 0.18 |
| Music | Oud, frame drum, hand claps, a low drone; 96 BPM; Phrygian mode. In caves and crypts: drone and wind chimes only |
| Feel | Red mesas, white salt pans, black glass flats that ring when walked on, heat haze over everything, cold wind in the slot canyons. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_tamar_oasis` | Tamar Oasis | 16–18 | Palms, gardens and the hub; sand vipers, scavenging Dune Fennec packs (`m_sand_dune_fennec`, page 10). |
| `sz_redmesa` | The Redmesa | 17–20 | Mesas and slot canyons; stone scorpions, mesa raptors, an Ashtusk scouting camp. |
| `sz_glass_flats` | The Glass Flats | 19–22 | A plain of black glass; glass constructs, glass-burned dead. **d05 The Glass Tombs.** **World boss site** (the Shattered Pan, south of the Tombs). |
| `sz_dune_sea` | The Dune Sea | 20–24 | Moving dunes; sand wyrms (snake body) surface under the player; buried ruins uncovered by sandstorms. |
| `sz_hushed_valley` | The Hushed Valley | 22–24 | The valley of kings' tombs; the Sallow Court. **d06 Vault of the Sandsworn.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_oasis_of_tamar` | Oasis of Tamar | hub, a walled oasis town round a stepped well | 5 | desert | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Quiet Wake, the Sandsworn); covered bazaar with a gambler (GA) |
| `town_saltwell` | Saltwell | salt-pan camp | 2 | desert | IN GM NB |
| `town_redmesa_post` | Redmesa Post | Crown trading post on a mesa top | 2 | human | WS GM ST NB; a Crown garrison (no quartermaster) and a Lantern House dig office |
| `town_dunehold` | Dunehold Caravanserai | caravanserai at the edge of the Dune Sea | 3 | desert | WS IN GM ST TM NB RV(Quiet Wake, the Sandsworn); the Longshank line's station (`tm_longshank_dune_sea`) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_stepped_well` | The Stepped Well | wayshrine | **Bindable** (§10.3). Rest; cures *Heatstroke* (Sunscar-only status, page 05) |
| `lm_mesa_watch` | Mesa Watch | watchtower | Reveals the region |
| `lm_glass_scar` | The Glass Scar | cairn_field (variant) | Where the Sunscar burned in the Hollowing War; digging turns up breath-jars (quest items) and starts *Restless Dead* |
| `lm_buried_gate` | The Buried Gate | collapsed_mine (variant) | Uncovered only during a sandstorm event; an instance (reuse: Farhold `sealed_strongroom`) |
| `lm_breath_museum_site` | The Emptied Tomb | burnt_farm (variant) | The tomb the Crown looted in 140 AS; side quest to return the jars |
| `lm_sallow_throne` | The Sallow Throne | cairn_field (variant) | The Sallow Court's empty seat in the Hushed Valley; the Sallow Herald keeps it |
| `lm_shattered_pan` | The Shattered Pan | (world boss arena) | World boss site, a salt flat south of the Glass Tombs (page 13) |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_idris_kaan` | Sandspeaker Idris Kaan | speaker of the Sandsworn | Tamar, the well court | `elder` m | Ch 5 giver |
| `npc_zelde_marrach` | Zelde Marrach | caravan master | Dunehold | `merchant` f | Escort and caravan quests; **Riding II** (`q_ss_the_sand_runners`, level 20; page 07 names this giver `npc_ss_caravan_master_idris` in Tamar) |
| `npc_nahir_tombwarden` | Nahir | tomb-warden | the Hushed Valley | `cleric` m | d05/d06 lead-in |
| `npc_orsa_glassblower` | Orsa | glassblower | Tamar bazaar | `villager` f | Glass-flat side quests; cosmetic glass charms |
| `npc_captain_dray_holloway` | Captain Dray Holloway | Crown factor at Redmesa Post | Redmesa Post | `fighter` m | Crown-vs-Quiet-Wake side line (the Crown's dig) |
| `npc_sallow_herald` | The Sallow Herald | voice of the Sallow Court (enemy) | the Hushed Valley | `undead` m | Taunts; the Court's warning bell |

**Factions present:** `fac_quiet_wake` (holder, the Sandsworn, grip 0.7) · `fac_crown_assembly`
(Redmesa Post garrison) · `fac_lantern_house` (the Longsight's dig office at Redmesa Post; the Glass
Flats digs). Hostile: `fac_thornmane` (on the mesas, 20+), `fac_unburied` (at the tomb edges, 19–24;
page 10), `fac_ashtusk` scouts, the Sallow Court (undead, the Sallow King's old court, not a faction).

**Enemies by family:** beast (sand vipers, stone scorpions, mesa raptors, sand wyrms, vultures) ·
beastkin warband (Thornmane jackal-kin, on the mesas from 20) · construct (glass constructs, jar-guardians) · undead (sallow
mummies, glass-burned dead) · elemental (dust devils, glass shards) · orc (Ashtusk scouts).

**Dungeons:** `d05_glass_tombs` (Glass Flats) · `d06_sandsworn_vault` (Hushed Valley).

**World boss site:** `wb_site_shattered_pan` at `lm_shattered_pan` in the Glass Flats — **The Glass
Wyrm** (`b_glass_wyrm`, a sand-worm plated in glass; level 27; page 13).

**Weather rule:** Sunscar is the only region with *Heatstroke* (in clear or fair weather, outside
shade: −1% max health a minute, max −20%; shade is any roof, canyon wall, palm or the Stepped Well;
page 05). Sandstorms stop it.

**Dark places:** the Glass Tombs and the Vault of the Sandsworn are lit by sunlight let down through
glass skylights and bounced off polished bronze mirrors, so their halls are amber-dark with hard shafts of
light (§11); the slot canyons of the Redmesa are deep shade at any hour.

---

### 8.5 Whisperwood — `whisperwood`

| At a glance | |
|---|---|
| Levels | 22–30 |
| Hub | Silverbough (`town_silverbough`) |
| Held by | `fac_greenhand` — the **Moonwell Circle** chapter |
| Size | 4.5 × 5.0 km, east of the Greyridge, north of Mossfen (the Mossfen–Whisperwood border is a 40 m cliff with one stair, the **Rootstair**) |
| Town culture | `elf` (grown, curved eaves, bridges between trunks, living hedge boundary); Hartsrest `human` |
| Tear pressure | 0.22 |
| Music | Harp, glass harmonica, female choir without words; 70 BPM; Lydian mode. In caves and crypts: choir only, very quiet |
| Feel | Trees 60 m tall, silver bark, moonwells glowing blue under the canopy shade, paths that shift (a path's side branches reroll every real hour). |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_silverbough_eaves` | Silverbough Eaves | 22–24 | The hub's outer wood; deer, owls, the first Thornmane packs. |
| `sz_moonwell_glades` | The Moonwell Glades | 24–27 | The two lit moonwells and their glades; fey wisps, spirit stags. |
| `sz_thornheart` | Thornheart | 25–28 | A briar forest grown round a rotten heart-tree; Rotbloom plants. **d07 Thornheart Hollow.** |
| `sz_fey_crossing` | The Fey Crossing | 26–29 | Where the wood touches the Mend; mushrooms, shard-wisps, a stone circle that moves. **World boss site.** |
| `sz_hollow_roots` | The Hollow Roots | 28–30 | The dark moonwell's glade; dead trees, the Dimming. **d08 Ruins of the Moonwell.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_silverbough` | Silverbough | hub, a canopy city built round and between trunks, two levels | 5 | elf | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Greenhand, the Moonwell Circle); elf homeland |
| `town_moonfall_glade` | Moonfall Glade | glade shrine-village at a moonwell | 2 | elf | WS IN NB CH |
| `town_thistlemere` | Thistlemere | lake village | 2 | elf | WS IN GM FY NB RV(Cutwater, the Thistlemere ferry) |
| `town_hartsrest` | Hartsrest | human woodcutters' camp cutting timber for the Crown's forts | 2 | human | WS GM NB BN |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_eastmoon_well` | The Eastmoon Well | wayshrine (special) | Lit moonwell; rest; **bindable** (§10.3); Ysolde's Echo first speaks here (Ch 6) |
| `lm_westmoon_well` | The Westmoon Well | wayshrine (special) | Going dark during Ch 6; restored at chapter end, then **bindable** (§10.3) |
| `lm_hunting_blind_harts` | Hart's Blind | hunting_blind | Calls a champion spirit stag |
| `lm_walking_circle` | The Walking Circle | standing_stones | The circle is somewhere else every real hour (one of 5 spots); finding and solving it: +1 perk point once |
| `lm_rootstair` | The Rootstair | broken_road | The stair up from Mossfen; repaired in a side quest (world state) |
| `lm_brood_hollow` | Brood Hollow | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_aelith_moonward` | Circle-Keeper Aelith Moonward | head of the Moonwell Circle | Silverbough, the Circle's hall | `cleric` f tone +0.1 | Ch 6 giver |
| `npc_sorrel_ashwood` | Ranger-Captain Sorrel Ashwood | captain of the Silverbough rangers | Silverbough Eaves | `ranger` m | Thornmane quests |
| `npc_hobb_woodcutter` | Hobb | woodcutter foreman under Crown contract (was `npc_hobb_greenhand`) | Hartsrest | `villager` m | Crown-vs-Greenhand side line (`q_ww_hartsrest_dispute`) |
| `npc_ysoldes_echo` | Ysolde's Echo | a light that speaks | every moonwell, later waystones and the Spire | `narrator` pitch +0.2 | Story voice from Ch 6 on |
| `npc_thane_of_thorns` | The Heartrot | the rotten heart-tree's voice (enemy) | Thornheart | `demon` (slowed) | d07 lead-in taunts |
| `npc_greyfang` | Greyfang | a Thornmane packmother who can still talk | the Fey Crossing | `brute` f | The "cure, not kill" side line |
| `npc_ww_glamourist_eluned` | Eluned | glamourist | Silverbough | `mage` f | **The wardrobe** (`q_ww_the_moonwell_mirror`, level 25; page 07) |

**Factions present:** `fac_greenhand` (holder, the Moonwell Circle, grip 0.65) · `fac_crown_assembly`
(Hartsrest's timber contract) · `fac_cutwater` (the Thistlemere ferry). Hostile: `fac_thornmane`
(strongest here), `fac_threadcutters` (a cell in the Hollow Roots), the Rotbloom (plant creatures, no
faction).

**Dark places:** the canopy is so thick that the forest floor is in deep green shade everywhere; the
moonwells glow blue, the silver bark catches it, and bioluminescent moss and pale lanternflowers line
every path (§11). The Hollow Roots are the dark heart: dead trees, grey light, and the dark moonwell.

**Enemies by family:** beastkin warband (Thornmane packs: runners, howlers, packlords) · beast
(spiders, wolves, giant owls, stags) · elemental (Rotbloom treants, thornlings, fey wisps) ·
aberration (shard-wisps from the Mend) · humanoid (Threadcutter cultists).

**Dungeons:** `d07_thornheart` (Thornheart) · `d08_moonwell_ruins` (Hollow Roots).

**World boss site:** `wb_site_brood_hollow` in the Fey Crossing — **The Hungering Brood** (page 13)
(`b_hungering_brood`, a spider-queen and her endless young; level 33; reuse name: Farhold world boss
tier 2).

---

### 8.6 Cinder Steppe — `cinder_steppe`

| At a glance | |
|---|---|
| Levels | 28–36 |
| Hub | Fort Ashfall (`town_fort_ashfall`) |
| Held by | **contested** — `fac_crown_assembly` (the fort garrisons chapter) holds the fort (grip 0.5), the `fac_ashtusk` Warhost holds the east (warband grip 0.8) |
| Size | 8.0 × 3.5 km, the widest region: the whole middle of the continent north of the Greyridge |
| Town culture | Fort Ashfall `human` military; Tallgrass `human`; Ghara's Camp `orc` |
| Tear pressure | 0.35 (the tear-light is a clear band across the northern sky) |
| Music | War drums, low horns, throat singing, distorted fiddle; 104 BPM; minor. In caves and crypts: fire crackling, one horn, wind |
| Feel | Endless grass going grey toward the north, black burn-scars, orc trophy poles, smoke columns, the volcanoes on the horizon. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_ashfall_marches` | The Ashfall Marches | 28–30 | Grass round the fort; ash hyenas, Ashtusk outriders. |
| `sz_blackgrass` | Blackgrass | 30–32 | Burnt grassland; fire elementals, the Tallgrass herders under attack. |
| `sz_warmasters_ground` | The Warmaster's Ground | 31–34 | The Ashtusk fighting pits and their main camp. **d09 The Warmaster's Pit.** |
| `sz_charred_barrows` | The Charred Barrows | 33–36 | Burnt barrow-field; Burnt Wanderers rising out of the ash (page 10). **World boss site.** |
| `sz_ashtusk_holds` | The Ashtusk Holds | 34–36 | The Warhost's war camps (warband strongholds tier 3); the first Kingsfire Legion camp. |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_fort_ashfall` | Fort Ashfall | hub, a stone fort with a curtain wall, barbican and siege damage | 4 | human | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Crown Assembly, fort garrisons) |
| `town_tallgrass` | Tallgrass | herders' tent town (moves: 3 spots, one per real day) | 2 | human | IN GM NB RV(Greenhand, farmers and herders) |
| `town_ghara_camp` | Ghara's Camp | the Free Tusks' camp — Ashtusk defectors sworn to the Crown; opens after Ch 7 quest `q_ms_the_defector` | 2 | orc | WS GM NB RV(Crown Assembly, the Free Tusks — orc-made weapons and a war-boar mount) |
| `town_ashfall_watch` | Ashfall Watch | Crown watchtower outpost on the north road | 1 | human | WS NB |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_steppe_beacon_chain` | The Beacon Chain | beacon ×5 | Five beacons north to south; lighting all five in 10 min calls a Crown cavalry sweep (event) |
| `lm_trophy_field` | The Trophy Field | gibbet (variant) | Orc trophy poles; names the local warlord |
| `lm_ash_forge` | The Burnt Smithy | forge_fire | Crafting bench |
| `lm_charred_cairns` | The Charred Cairns | cairn_field | Rare loot; *Restless Dead* |
| `lm_carrion_mound` | The Carrion Mound | (world boss arena, reuse: Farhold `boss_bonefield`) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_rhosyn_tarn` | Commander Rhosyn Tarn | Crown commander of Fort Ashfall | the keep | `knight` f | Ch 7 giver; the siege |
| `npc_bex_quartermaster` | Bex | quartermaster | Fort Ashfall | `merchant` f | Supply quests; Crown Assembly quartermaster |
| `npc_ghara` | Ghara Two-Tusks | chief of the Free Tusks (Ashtusk defectors) | Ghara's Camp | `brute` f | Ch 7 ally; orc side line (Crown Assembly standing) |
| `npc_olwen_herdmother` | Herdmother Olwen | Tallgrass herders' elder | Tallgrass | `elder` f | Greenhand side line |
| `npc_kestrel` | Kestrel | Crown scout | anywhere on the steppe | `ranger` m | Scouting quests |
| `npc_torvak_overchief` | Torvak, the Ashtusk Overchief | warlord (enemy) | the Ashtusk Holds | `brute` m | Warband warlord, fought as `b_ashtusk_overchief` (page 10; reuse: Farhold `ashtusk_overchief`); Ch 7 target |
| `npc_cs_runewright_gorsa` | Gorsa | runewright of the fort's forge | Fort Ashfall | `brute` f | **The upgrade bench, second voice** (`q_cs_brands_in_the_ash`, level 34; page 07) |

**Factions present:** `fac_crown_assembly` (the fort garrisons at Fort Ashfall and Ashfall Watch; the
Free Tusks at Ghara's Camp) · `fac_greenhand` (the Tallgrass herders). Hostile: `fac_ashtusk` (the
Warhost), `fac_kingsfire_legion` (from level 33).

**Dark places:** the Charred Barrows lie under a standing ash cloud that turns the sun orange and the
light low and brown; burning grass and the Warmaster's Pit's fire-bowls light the ground (§11).

**Enemies by family:** orc warband (Ashtusk raiders, archers, shamans, war-chiefs, the Overchief) ·
beast (ash hyenas, steppe lions, carrion birds) · elemental (fire elementals, cinder wisps) · dragonkin
(war drakes ridden by Legion outriders, from 33) · undead (Burnt Wanderers) · humanoid (Kingsfire
Legion scouts).

**Dungeon:** `d09_warmasters_pit`.

**World boss site:** `wb_site_carrion_mound` in the Charred Barrows — **The Carrion Crown** (page 13)
(`b_carrion_crown`, a vast carrion bird wearing a dead king's crown; level 39; reuse name: Farhold
world boss tier 4).

---

### 8.7 Frostmantle — `frostmantle`

| At a glance | |
|---|---|
| Levels | 34–42 |
| Hub | Rimehold (`town_rimehold`) |
| Held by | `fac_wardens` — the **Rime watch** chapter |
| Size | 5.0 × 6.0 km, the north-west; the western road to Kingsfire runs up its eastern edge |
| Town culture | `human` northern variant (timber longhouses, turf roofs, stone plinths) — a proctown palette, not a new culture; Rimehold's inner keep `dwarf` |
| Tear pressure | 0.45 |
| Music | Low strings, bowed lyre, deep male choir, war horns; 66 BPM; Aeolian. In caves and crypts: wind, creaking ice, a lone voice |
| Feel | Tundra, glaciers, blue ice caves, giants' stairs cut into the peaks, the tear-light bright and close over the snow. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_rimehold_valley` | Rimehold Valley | 34–36 | The hub's valley; frost wolves, snow elk, Ashtusk raiders from the southern passes (page 10). |
| `sz_whitecairn_tundra` | Whitecairn Tundra | 35–38 | Flat tundra; mammoth-kin (beast), trappers' camps. |
| `sz_rimefang_glacier` | Rimefang Glacier | 36–39 | Ice caves and crevasses; ice elementals. **d10 Rimefang Caverns.** |
| `sz_stonehide_peaks` | The Stonehide Peaks | 38–41 | Giant country; stone stairs, giant holds (warband strongholds tier 3–4). **World boss site.** |
| `sz_throne_ice` | The Throne Ice | 40–42 | The highest glacier; the sleeping throne under the ice; a sealed door (the Glacier Throne is a parked raid, `WISHLIST.md`). |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_rimehold` | Rimehold | hub, a walled longhouse town round a dwarf-built keep | 5 | human (north) | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Wardens, Rime watch) |
| `town_whitecairn` | Whitecairn | trappers' village | 2 | human (north) | WS IN GM NB |
| `town_icefall_camp` | Icefall Camp | glacier camp of the Rime watch | 1 | human (north) | WS GM NB |
| `town_hollowpeak_lodge` | Hollowpeak Lodge | lodge under the giant stairs | 2 | dwarf | WS IN SM NB BN RV(Deepforge Clans, Hollowpeak) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_giants_stair` | The Giants' Stair | broken_road | A stair of 3 m steps; repair a side ramp → faster route up for everyone (world state) |
| `lm_rime_beacon` | Rime Beacon | beacon | Calls a Rime watch patrol |
| `lm_frozen_wreck` | The Ice-Bound Longship | sunken_wreck (variant) | Frozen in a lake; loot |
| `lm_aurora_stones` | The Aurora Stones | standing_stones | Named for the lights the old sagas saw here; now the tear-light plays over them. Puzzle; +1 perk point once |
| `lm_ruin_field` | The Ruin Field | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_hallveig_rime` | Frost-Warden Hallveig Rime | lord of Rimehold | Rimehold keep | `warrior` f | Ch 8 giver; Rime watch side line |
| `npc_aske_trapper` | Aske | trapper and guide | Whitecairn | `ranger` m | Hunting quests |
| `npc_lorekeeper_ymma` | Lorekeeper Ymma | keeper of the sagas | Rimehold longhouse | `bard` f | The saga of the Throne Ice (story 8.8); lore quests |
| `npc_dagny_stairwarden` | Dagny | warden of the Giants' Stair | Hollowpeak Lodge | `fighter` f | Giant quests |
| `npc_ulmar_peakspeaker` | Ulmar | a giant who talks (Stonehide, neutral in one quest) | the Stonehide Peaks | `brute` m depth +0.2 | Side line: the giants were driven down too |
| `npc_hroth_peak_king` | Hroth, the Stonehide Peak-King | warlord (enemy) | the Stonehide Peaks | `brute` m | Warband warlord, fought as `b_stonehide_peakking` (page 10; reuse: Farhold `stonehide_peakking`) |

**Factions present:** `fac_wardens` (holder, the Rime watch, grip 0.7) · `fac_deepforge_clans`
(Hollowpeak Lodge). Hostile: `fac_stonehide`, `fac_ashtusk` (raiders on the southern passes, to 40),
`fac_kingsfire_legion` (the western road).

**Dark places:** Rimefang's ice caves are lit by the ice itself — daylight carried down through the
glacier turns the caverns bright blue, with glowing frost-lichen in the deep parts (§11). Blizzards cut
sight but never darken the screen below the film-set floor.

**Enemies by family:** giant warband (Stonehide: stone-throwers, shield-giants, frost shamans) · beast
(frost wolves, snow elk, mammoth-kin, ice bears) · elemental (ice elementals, blizzard spirits) ·
undead (Rimebound Dead, page 10) · dragonkin (a rime drake nesting cliff).

**Dungeon:** `d10_rimefang_caverns`. The sealed door in the Throne Ice is scenery in v2.

**World boss site:** `wb_site_ruin_field` in the Stonehide Peaks — **The Standing Ruin** (page 13)
(`b_standing_ruin`, a colossus built of a fallen giant hold; level 45; reuse name: Farhold world boss
tier 4).

**Weather rule:** Frostmantle is the only region with *Frostbite* (blizzard weather, outside shelter
and not near a fire: −1% move speed a minute, max −20%; page 05).

---

### 8.8 The Drowned Coast — `drowned_coast`

| At a glance | |
|---|---|
| Levels | 40–48 |
| Hub | Saltmarch (`town_saltmarch`) |
| Held by | **contested** — `fac_cutwater` (the **Saltbound** chapter) holds the upper town and cliffs (grip 0.55), `fac_the_drowned` hold the sunken quarter |
| Size | 4.0 × 6.0 km along the north-east coast |
| Town culture | `human` harbour (stone quays, slate roofs, lighthouse); the sunken quarter is a `human` town under water, ruined |
| Tear pressure | 0.55 |
| Music | Sea-shanty rhythm slowed to a dirge, church organ heard from under water, bells; 76 BPM; minor. In caves and crypts: bells, waves, a choir that is slightly out of tune |
| Feel | Cliffs, grey sea, fog banks, a drowned cathedral whose spire sticks out of the bay, bells ringing under the waves. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_saltmarch_cliffs` | Saltmarch Cliffs | 40–42 | The hub and its cliffs; gulls, cliff crabs, Drowned climbing the rocks at high tide. |
| `sz_wreckers_shore` | Wreckers' Shore | 42–45 | Wreck-strewn beach; the Saltbound (Cutwater) divers, sea serpents in the shallows. |
| `sz_sunken_quarter` | The Sunken Quarter | 42–45 | Old Saltmarch under 2–6 m of water; the Drowned. **d11 Saltdeep Cathedral.** |
| `sz_brinehollow_flats` | Brinehollow Flats | 44–47 | Tidal flats; the tide goes out for 10 real minutes every hour and uncovers loot and a path. **World boss site.** |
| `sz_choir_deeps` | The Choir Deeps | 46–48 | The trench off the cathedral; the song is loudest; the choir itself sings at the bottom, out of reach (the Sunken Choir is a parked raid, `WISHLIST.md`). |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_saltmarch` | Saltmarch | hub, walled harbour upper town | 5 | human | WS IN SM GM RG ST TM FY BX MB NB BR UB CH TR BN RV(Cutwater, the Saltbound) RV(Quiet Wake, the bell-keepers); **the ship to Spire Isle** (level 60, §10); a **Trading Post branch** (the Salt Exchange) |
| `town_gullrock` | Gullrock | fishing village on a sea stack | 2 | human | WS IN GM NB |
| `town_lampwick_point` | Lampwick Point | lighthouse and keeper's houses | 1 | human | WS NB CH |
| `town_brinehollow` | Brinehollow | wreckers' village on the flats | 2 | human | WS IN GM FY NB RV(Cutwater, the Saltbound) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_lampwick_light` | The Lampwick Light | watchtower | Reveals the region; relighting it is a Ch 9 quest |
| `lm_cathedral_spire` | The Cathedral Spire | sunken_wreck (variant) | The spire above water; dive loot, d11 lead-in |
| `lm_bell_buoys` | The Bell Buoys | beacon (variant) | Silencing all five for 5 min weakens the Drowned in the region by 10% for 1 real hour |
| `lm_wreckers_cairns` | The Wreckers' Graves | cairn_field | Loot, *Restless Dead* (Drowned variant) |
| `lm_brine_pool` | The Brine Pool | (world boss arena) | World boss site, uncovered at low tide only |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_ottavia_brine` | Harbourmistress Ottavia Brine | ruler of Saltmarch | the harbour hall | `merchant` f | Ch 9 giver |
| `npc_amos_keeper` | Amos | lighthouse keeper | Lampwick Point | `elder` m | Ch 9; lore of the Drowning; the Choir's verses |
| `npc_mara_diver` | Mara Deepwater | Saltbound (Cutwater) diver | Wreckers' Shore | `rogue` f | Diving quests |
| `npc_hale_marrow` | Captain Hale Marrow | ship captain | Saltmarch harbour | `swashbuckler`-ish `fighter` m | Captain of *the Lamp's Wake*, the ship to Spire Isle (level 60; `tm_ship_pale_sea`, page 20; §10.6) |
| `npc_dc_tidewright_morwen` | Morwen | tidewright, tamer of sea-mounts | Saltmarch harbour | `ranger` f | **Riding III** (`q_dc_the_tide_steed`, level 40; page 07) |
| `npc_cantor_selwyn` | Cantor Selwyn | the Drowned choir-master (enemy) | the Choir Deeps | `undead` m | Taunts from the trench; heard in d11 |
| `npc_brother_aldo` | Brother Aldo | (moves here in Ch 9) | Saltmarch chapel | `cleric` m | Returning character from Mossfen |

**Factions present:** `fac_cutwater` (holder of the upper town, the Saltbound, grip 0.55; Brinehollow)
· `fac_quiet_wake` (the Saltmarch bell-keepers, Brother Aldo). Hostile: `fac_the_drowned` (strongest
here), `fac_stonehide` (on the cliffs, 44–48; page 10), `fac_threadcutters` (the wreckers).

**Dark places:** fog banks roll in off the grey sea (20% of weather rolls) and the Sunken Quarter is
green-dark under 2–6 m of water; the drowned streets are lit by glowing kelp, phosphor-bright jellyfish
and the cathedral's still-burning candles under the water (§11). Saltdeep Cathedral's nave is lit by
its own drowned rose window, which glows like stained glass with the sun behind it.

**Enemies by family:** undead (the Drowned: bell-ringers, choristers, anchor-knights, bloated dead) ·
beast (cliff crabs, sea serpents, giant eels, gulls) · aberration (tide-horrors from the Choir Deeps) ·
humanoid (Threadcutter wreckers).

**Dungeon:** `d11_saltdeep_cathedral`.

**World boss site:** `wb_site_brine_pool` on Brinehollow Flats — **The Sallow King** (`b_sallow_king`,
page 13: the last Sandsworn king's wraith, on a tidal causeway that floods as he fights; level 51;
reuse name: Farhold world boss tier 3).

**Tide rule:** Brinehollow Flats and the Sunken Quarter have a tide: 50 real minutes high, 10 real
minutes low, on the hour. Low tide uncovers paths, 6 loot caches and the world boss arena.

---

### 8.9 The Riftmarch — `riftmarch`

| At a glance | |
|---|---|
| Levels | 46–54 |
| Hub | Waystone Camp (`town_waystone_camp`) |
| Held by | `fac_lantern_house` — the **Riftwatch** chapter |
| Size | 7.0 × 3.0 km of broken ground, plus ~40 floating islands 20–140 m up |
| Town culture | Waystone Camp: `human` military camp built round a ring of salvaged waystones; the Quiet Orchard: `halfling`, frozen in time |
| Tear pressure | 0.80 |
| Music | Glass harmonica, reversed piano, sub-bass drone, irregular metre (7/8); 80 BPM; whole-tone scale. In caves and crypts: near-silence, chimes, a heartbeat |
| Feel | Ground torn loose and hanging in the air, waterfalls falling up, stone that hums, the Mend overhead close enough to see its weave. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_waystone_rise` | Waystone Rise | 46–48 | The hub's ridge; riftlings, Threadcutter cultists. |
| `sz_floating_isles` | The Floating Isles | 48–51 | Islands joined by chains, rope bridges and **rift-jumps** (glyph pads that throw you 30 m). **d12 The Unmade Workshop** is on the largest island. |
| `sz_shardfall` | Shardfall | 50–52 | Where the islands drop their stones; crystal fields; shard constructs. |
| `sz_unwritten_fields` | The Unwritten Fields | 52–54 | Ground that has not finished becoming ground; Riftborn at full strength. **World boss site.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_waystone_camp` | Waystone Camp | hub, a walled camp | 4 | human | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Lantern House, the Riftwatch); the station for the **flyer line to the high islands** (one of the few places a Travel Method flies, because there is no ground to drive on; page 20) |
| `town_anchor_hill` | Anchor Hill | village chained to the ground so it will not float | 2 | human | WS IN GM NB |
| `town_shardfall_post` | Shardfall Post | Longsight survey office on an island | 1 | human | WS TM GM NB RV(Lantern House, the Longsight) |
| `town_quiet_orchard` | The Quiet Orchard | a halfling farm where time stopped in 396 AS; its people are still mid-step | 1 | halfling | WS NB (quest hub only) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_rift_anchor` | The Great Anchor | watchtower (variant) | A chain tower; climbing it reveals the region |
| `lm_upfall` | The Upfall | broken_road (variant) | A waterfall falling up; ride it to the high islands |
| `lm_weave_window` | The Weave Window | standing_stones | Where the Mend is close enough to touch; puzzle, +1 perk point once |
| `lm_unfinished_ground` | The Half-Made Plain | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_cassia_dorne` | Riftwarden Cassia Dorne | head of the Riftwatch | Waystone Camp | `knight` f | Ch 10 giver |
| `npc_benedek_artificer` | Benedek | Riftwatch artificer (a tinker) | Waystone Camp | `villager` m | Rift-jump and gadget quests |
| `npc_little_wynn` | Wynn | a halfling girl, the only moving person in the Quiet Orchard | the Quiet Orchard | `child` f | The Quiet Orchard side line |
| `npc_master_ferrant` | Master Ferrant | the King's chief artificer (enemy) | the Unmade Workshop | `mage` m | d12 boss herald |
| `npc_iris_vael` | Iris Vael | (taken in Ch 10) | — | — | — |

**Factions present:** `fac_lantern_house` (holder, the Riftwatch, grip 0.6; the Longsight at Shardfall
Post) · `fac_wardens` (the Waystone keepers, who salvaged the camp's ring of stones). Hostile:
`fac_riftborn`, `fac_threadcutters` (strongest here), `fac_kingsfire_legion`.

**Dark places:** the Unwritten Fields sit in the shadow of the islands overhead; the light there is
patchy and violet, and the half-made ground glows faintly along its seams (§11). The Unmade Workshop is
lit by its own furnaces and by glowing shard-crystal.

**Enemies by family:** aberration (Riftborn: riftlings, half-made, weave-eaters) · construct (the
Workshop's bodies, shard constructs) · humanoid (Threadcutters, Kingsfire Legion artificers) · elemental (void
wisps, gravity knots).

**Dungeon:** `d12_unmade_workshop`.

**World boss site:** `wb_site_half_made_plain` in the Unwritten Fields — **The Unmoored** (`b_unmoored`,
page 13: a horror circled by orbiting stones; level 57; new name).

**Movement rule:** rift-jump pads (`lm_` not needed; they are terrain) throw a player 30 m along a
drawn arc; no fall damage on landing; mounts dismount on use.

---

### 8.10 Kingsfire — `kingsfire`

| At a glance | |
|---|---|
| Levels | 52–60 |
| Hub | Last Light (`town_last_light`) |
| Held by | **contested** — `fac_kingsfire_legion` holds everything except Last Light, Cinderwatch and (after Ch 11) Kiln Hollow |
| Size | 7.0 × 3.0 km; a ring of volcanoes round the caldera; the Fire Court sits on the caldera's inner island |
| Town culture | Last Light: `human` camp dug into rock; the Legion's fortresses: `undead`-palette black glass (a proctown palette, not a new culture) |
| Tear pressure | 0.70 (the King holds it back here — lower than the Riftmarch) |
| Music | Full orchestra, low choir in an invented tongue, taiko-like drums, the King's leitmotif (four notes, falling); 110 BPM; harmonic minor. In caves and crypts: the leitmotif on a single cello |
| Feel | Black glass, rivers of lava, a sky tinted red-orange by the ash (bright, not dark), ash falling like snow, the Heartflame visible as a red star over the caldera even in daylight. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_last_light_ridge` | Last Light Ridge | 52–54 | The resistance camp's ridge; Legion patrols, magma hounds. |
| `sz_obsidian_fields` | The Obsidian Fields | 54–57 | Black glass plain; fire elementals, drakes. **World boss site.** |
| `sz_cindergate_approach` | Cindergate Approach | 54–57 | The Legion's gate road. **d13 Cindergate Bastion.** |
| `sz_reliquary_caldera` | The Reliquary Caldera | 57–60 | Inside the volcano ring; temple halls of the old Order. **d14 The Ashen Reliquary.** |
| `sz_fire_court_steps` | The Fire Court Steps | 60 | The causeway to the caldera island. **d15 The Fire Court entrance** — discovered when the story walks you here in Ch 11 (11.9). |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_last_light` | Last Light | hub, a resistance camp dug into a ridge | 4 | human | WS IN SM GM RG ST TM BX MB NB BR UB CH TR BN RV(Crown Assembly, fort garrisons) RV(Deepforge Clans, the Kingsfire forges) RV(Quiet Wake, the Reliquary watch) |
| `town_cinderwatch` | Cinderwatch | a captured Legion watch-fort | 2 | human | WS GM NB (Crown garrison) |
| `town_kiln_hollow` | Kiln Hollow | an old Order kiln-village, abandoned; after `q_ms_kiln_hollow` the Greenhand's **Ashgrowers** farm the ash ground here for Last Light | 1 | human | WS NB RV(Greenhand, the Ashgrowers) (after the quest) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_the_red_star` | The Red Star | (sky landmark) | The Heartflame over the caldera; brighter as the story advances (per player) |
| `lm_order_forge` | The Order's Forge | forge_fire | Crafting bench; top-tier recipes |
| `lm_ash_beacon` | The Last Beacon | beacon | Calls a resistance strike team |
| `lm_slag_pit` | The Slagpit | (world boss arena, reuse: Farhold `boss_slagpit`) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_marshal_ansel_crane` | Marshal Ansel Crane | commander of Last Light | Last Light | `knight` m | Ch 11 giver; the Fire Court (story 11.10, d15); **Challenge mode** (`q_kf_the_harder_road`, level 60; page 14 §7) |
| `npc_kf_depthwarden_orrin` | Depthwarden Orrin (was Keywarden, then Deepwarden Orrin) | keeps the Order's old record of how deep each dungeon goes | Last Light | `elder` m | **Depth past level 60** (`q_kf_the_deep_road`, level 60; page 12 owns Depth) |
| `npc_kf_skywright_aveline` | Aveline | skywright, breaker of winged mounts | Last Light | `ranger` f | **Riding IV — flying**: the Kingsfire story chain `q_sky_1` … `q_sky_5` (level 60, after the Fire Court; no reputation or dungeon gates; page 14 §7) |
| `npc_brother_caddoc` | Brother Caddoc | a defector from the Order of the Flame | Last Light | `priest` m | Ch 11: tells Ysa Varn's story |
| `npc_forgewright_sallis` | Sallis | forge-mistress of the resistance | Last Light | `brute` f | Deepforge Clans quartermaster (the Kingsfire forges); top-tier profession recipes (page 19) |
| `npc_maelor_varn` | Maelor Varn, crowned Kaedros, the Fire King | the antagonist | the Fire Court (projections elsewhere) | `elder` m, pitch −0.1 | Ch 3, 7, 11 projections; d15's final boss `b_fire_king_kaedros` (page 12) |
| `npc_ysa_varn` | Ysa Varn | the King's daughter, a memory | visions in Ch 11 | `child`→`villager` f | The reason |
| `npc_the_kindled_three` | The Kindled Three (Lord Castellan Vorhane `b_castellan_vorhane`, Sarn Veydrec, Herald of the Fire King `b_sarn_veydrec_herald`, and Lord Castellan Aurel Brandt, who was a raid boss and appears in v2 only as a name in the story — his fight is parked in `WISHLIST.md`) | the King's lieutenants (enemies) | d13, d14, d15 | `demon`, `cultist`, `warrior` | Bosses; page 12 owns the fights |

**Factions present:** `fac_crown_assembly` (the fort garrisons at Last Light and Cinderwatch) ·
`fac_deepforge_clans` (the Kingsfire forges, Sallis) · `fac_quiet_wake` (the Reliquary watch) ·
`fac_greenhand` (the Ashgrowers at Kiln Hollow, after Ch 11) · `fac_lantern_house` (Iris and Brother
Caddoc's records). Hostile: `fac_kingsfire_legion` (grip 0.9), Ashtusk loyalists (Legion auxiliaries,
counted as `fac_kingsfire_legion` — the Warhost's own band ends at 40), `fac_threadcutters`.

**Dark places:** none is truly dark — the lava lights everything from below. The Reliquary's temple
halls are lit by channels of lava under grates in the floor and by the old Order's everburning
braziers (§11).

**Enemies by family:** humanoid (Kingsfire Legion: legionnaires, flamebinders, glass-knights, Kindled
priests) · fiend (flame fiends summoned through the thin Mend) · elemental (magma hounds, lava
elementals, cinder storms) · dragonkin (caldera drakes, the King's wyrm-riders).

**Dungeons:** `d13_cindergate` · `d14_ashen_reliquary` · **`d15_fire_court`** (the main story's climax, 5 players, page 12).

**World boss site:** `wb_site_slagpit` in the Obsidian Fields — **Slagborn** (page 13) (`b_slagborn`,
a giant of slag that eats the lava round it; level 60 elite; reuse name: Farhold world boss tier 3).

---

### 8.11 Spire Isle — `spire_isle`

| At a glance | |
|---|---|
| Levels | 60 |
| Hub | the Spire Landing (`town_spire_landing`) |
| Held by | nobody — the Wardens' **Spire watch** and the **Lantern House** (the Riftwatch and the scholars) keep a joint camp |
| Size | 3.0 × 3.0 km island, one mountain 1,900 m high, the Spire on its top |
| Town culture | a camp of tents and salvaged waystones; the Spire itself is its own art set (page 17) |
| Tear pressure | 1.00 |
| Music | Solo voice, strings in harmonics, a slow version of the Hearthvale theme in a minor key; 60 BPM. At the Spire: the Hearthvale theme in the original major key, only after the story's end |
| Feel | A beach of grey glass, a forest growing upside down from floating roots, the Mend a wall of light you can walk up to. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_spire_landing` | The Spire Landing | 60 | The camp and the harbour. |
| `sz_shattered_strand` | The Shattered Strand | 60 | Glass beach; Riftborn washing ashore; the breach events (page 14). |
| `sz_shiftwood` | The Shiftwood | 60 | An inverted forest; things from the Unmade wearing the shapes of Wildmarch animals. |
| `sz_spire_foot` | The Spire Foot | 60 | The climb; **d16 The Spire entrance** — discovered in Ch 12 (12.4). |

**Settlements:** `town_spire_landing` — size 3 camp — WS IN SM GM RG ST FY BX MB NB BR UB CH BN
RV(Wardens, Spire watch) RV(Lantern House, the Riftwatch); the landing for *the Lamp's Wake* (§10.6).

**Landmarks:** `lm_the_mend_wall` (touch it: a lore vision per story chapter completed) · `lm_ysoldes_steps`
(the path the Lampbearer climbed; a one-time pilgrimage side quest) · `lm_the_broken_pin` (the empty
Everflame brazier at the Spire's foot, until the story ends).

**NPC cast:** `npc_iris_vael` (returns, now a scholar of the Mend in her own right) · `npc_ysoldes_echo`
(full form here) · `npc_saelith` (Saelith, the elf who has guarded the Spire since 0 AS; wounded at the
brazier when the player arrives, `mage` m, tone +0.1, speed −0.1; story 12.4–12.6) · `npc_cassia_dorne` ·
`npc_hale_marrow` (ship) · `npc_quartermaster_wend` (Lantern House quartermaster, `merchant` m) ·
`npc_si_spirewarden_isaure` (Spirewarden Isaure, `knight` f — commander of the Wardens' Spire watch and
its quartermaster; gives the breach side quests).

**Factions present:** `fac_wardens` (Spire watch) · `fac_lantern_house` (the Riftwatch and the scholars)
· `fac_cutwater` (the ship's crew). Hostile: `fac_riftborn`, the last cell of `fac_threadcutters`.

**Enemies:** aberration (Riftborn at full strength) · things wearing borrowed shapes (every family —
Shiftwood mimics of earlier regions' beasts, page 10) · the last Threadcutter cell.

**Dark places:** the Shiftwood's upside-down canopy hangs over the ground and shades it; the roots
glow white where they touch the Mend (§11). The Spire's inside (d16) is lit by the Mend itself.

**Dungeon:** **`d16_the_spire`** (the story's epilogue, 5 players, page 12). **World boss:** none by
canon. (Page 13's event bosses have their own sites: the Midwinter Stag on the frozen lake at
Rimehold, the Tearstorm Herald in whichever region a Tearstorm opens — page 13 §Seasonal.)

---

## 9. Highcourt, the capital

| At a glance | |
|---|---|
| id | `highcourt` (a region id in canon; the city is `town_highcourt`) |
| Levels | any; sits between Mossfen/Hearthvale and the Greyridge |
| Held by | `fac_crown_assembly` |
| Size | the walled city is 1.0 × 1.0 km on a hill at the fork of the Wend and the Slowwater; the crownlands round it are 3.0 × 1.5 km of farms (level 8–12 wildlife, no warbands) |
| Culture | `human`, planned grid inside the walls (proctown `human` with jitter 0.1 — the one planned human town), grown suburbs outside |
| Walls | cut-stone curtain wall, 11 towers, **three gates**: the **South Gate** (Kingsroad from Brightwater), the **Fen Gate** (Slowwater road from Mossfen), the **North Gate** (Kettle Pass road). Gates never shut (respawn city rule, reuse: Farhold M4 `gateVerdict`). |
| Music | A brass fanfare motif, harpsichord, bustle; 100 BPM; major. In the Undercroft: a low organ drone and dripping water |

**First arrival:** Ch 3 (`q_ms_the_south_gate`, level 10), on foot up the Fen Causeway from Mossfen. A
player may walk in earlier; services work at any level, but the **bank, mail and Trading Post** open
together at 11 (`q_hc_keys_to_the_city`), **Travel Methods** and waystone teleports at 12, and the
**guild charter** at 15 (page 07 owns the ladder; page 14 §7 has the quests).

**Why there is no portal court any more:** round 1 had a hall of free portals from Highcourt to every
hub. Round 2 (canon W9, page 20 §14) gives casters the job of carrying people — the Mage's **Portal**,
the Oracle's **Guiding Call**, the Chronomancer's **Retrace** — and gives everyone else Travel Methods,
scrolls and the Recall Stone. A free portal to every hub would make all of that pointless, so the old
Portal Court is now the **Waykeepers' Hall**: Highcourt's largest waystone, the waykeepers' scroll and
stone counter, and the Waywarden who unlocks Travel Methods at 12.

### Districts

| # | District | id | Where | What is there |
|---|---|---|---|---|
| 1 | **Crown Ward** | `hc_crown_ward` | the hilltop | The **Assembly Hall** (four seats + the empty Lampbearer's Seat), the Lord Protector's residence, the Crown Assembly quartermaster (RV Crown Assembly, Highcourt chapter) |
| 2 | **Coinhall** | `hc_coinhall` | east of the hilltop | The **Bank**, the **Trading Post** (the player market, canon W14), the **Mailhouse** |
| 3 | **Guild Row** | `hc_guild_row` | north-east | The **Guild Registrar**, the Charter Hall (guild banks and guild halls' doors, page 15), banner-maker (guild tabards), the **profession guildhalls** (a trainer for each of the seven crafting professions and for Harvesting, page 19) |
| 4 | **Hall of Callings** | `hc_hall_of_callings` | north | **Thirty class trainers**, the **Unbinder** (retraining, reuse: Farhold `js/retrain.js`), a talent tutor, practice dummies |
| 5 | **Lamplit Market** | `hc_lamplit_market` | centre, the big square | General goods, weapons, armour, reagents, a **gambler** (sealed crates, reuse: Farhold `gambler` role), cosmetics, dyes, companion-pet vendor, a scroll-seller (teleport scrolls, page 20) |
| 6 | **Temple Rise** | `hc_temple_rise` | west slope | Chapel of the Lamp (revive point, curse removal), the Quiet Wake house (the catacombs' keepers; RV Quiet Wake, graveyard keepers) |
| 7 | **Waykeepers' Hall** | `hc_waykeepers_hall` (was `hc_portal_court`) | inside the North Gate | Highcourt's great waystone (Recall Stone bind point; where teleports arrive), the waykeepers (`npc_waykeeper_highcourt`: Scrolls of Passage, Portal Stones, Scrolls of Calling), Waywarden Liss (**Travel Methods**, `q_hc_the_waywardens_oath`, 12), the timetable board for every line on the continent (page 20); the North Gate station is outside its door |
| 8 | **Warden's Yard** | `hc_wardens_yard` | inside the South Gate | Barracks (RV Wardens, the Waystone keepers), the **duel ring** (friendly duels only, page 15), training dummies with a damage meter (reuse: `meters/`), the **mercenary broker** |
| 9 | **Stable Gate** | `hc_stable_gate` | outside the South Gate | Stables (**mount quest**, §10.4) and the **South Gate station** (`tms_hc_south_gate`: the Kingsroad wagons to Brightwater, the Crown Ring carriage) |
| 10 | **Low Wharf** | `hc_low_wharf` | on the Slowwater under the Fen Gate | The **Low Wharf station** (`tms_hc_low_wharf`: the Wend barge, a scheduled Travel Method), the Cutwater's river office (RV Cutwater, river boatmen) |
| 11 | **The Undercroft** | `hc_undercroft` | under Temple Rise | The catacombs; the Quiet Wake's gate; **the Barrowking's sealed door** (scenery in v2 — the Crypt of the Barrowking is a parked raid, `WISHLIST.md`) |
| 12 | **Lantern Row** | `hc_lantern_row` | south-west | The Lantern House chapterhouse (library, lore collection, RV Lantern House, the scholars), the Longsight map office |
| 13 | **The Crown and Candle** | `hc_inn` | Lamplit Market | The city inn: rest, a minstrel (rumours) |

### Services, with the people who run them

| Service | NPC id | Name | District | Voice | Details (owner page) |
|---|---|---|---|---|---|
| Bank | `npc_ottoline_crane` | Ottoline Crane, Keeper of the Vaults | Coinhall | `merchant` f | Personal bank (tabs, slots, costs on page 08); guild bank page 15. `BX` boxes in every hub reach the same vault |
| Trading Post | `npc_fitch_marrow` | Fitch Marrow, Master of the Trading Post | Coinhall | `merchant` m | Buy/sell listings (page 15). Branch: the Salt Exchange in Saltmarch |
| Mail | `npc_posy_quill` | Posy Quill | Coinhall | `villager` f | Mail (page 15); mailboxes in every hub |
| Guild registrar | `npc_melisande_hart` | Registrar Melisande Hart | Guild Row | `elder` f | Found a guild (fee and signatures on page 15), rename, tabard. Guild charter `q_hc_a_name_on_the_rolls` (level 15; page 07 names this giver `npc_hc_registrar_pell`) |
| Waykeeper | `npc_waykeeper_highcourt` | Corra, Waykeeper of Highcourt (replaces the roost-keeper `npc_tamsin_roost`) | Waykeepers' Hall | `merchant` f | Sells Scrolls of Passage, Portal Stones and Scrolls of Calling (page 20 §17); binds your Recall Stone |
| Stablemaster | `npc_oswin_stablemaster` | Oswin | Stable Gate | `villager` m | Riding I `q_hc_saddle_and_bridle` (level 10; page 07 names this giver `npc_hc_stablemaster_oda`); buys/sells mounts |
| Bargemaster | `npc_jory_barge` | Jory | Low Wharf | `rogue` m | River barge and punt lines (Cutwater) |
| Mercenary broker | `npc_captain_aldous_fenn` | Captain Aldous Fenn | Warden's Yard | `fighter` m | Followers (reuse: Farhold `js/followers.js`, `data/mercenaries.json`) |
| Unbinder | `npc_the_unbinder` | Sethra the Unbinder | Hall of Callings | `mage` f | Retraining from level 12 (reuse: Farhold `js/retrain.js`); **Second Loadout** `q_hc_two_minds_one_will` (level 30). Page 07 names this NPC `npc_hc_unbinder_mott` |
| Duel-ring master | `npc_brakka_duelmaster` (was `npc_brakka_arena`) | Brakka | Warden's Yard | `brute` f | Friendly duels (from 10, page 15) and the practice-ring side quest `q_hc_practice_ring`. No arenas or battlegrounds (canon W1) |
| Lore-keeper | `npc_archivist_pell` | Archivist Pell | Lantern Row | `elder` m | Lore book, relic hand-ins (`fac_lantern_house`) |
| Chapel | `npc_mother_superior_ada` | Mother Ada | Temple Rise | `cleric` f | Revive point, curse removal |
| Catacomb warden | `npc_warden_of_bones` | Hesper, Warden of Bones | Undercroft | `undead`-ish `cleric` m | Quiet Wake side quests in the Undercroft; tells the Barrowking's story at the sealed door (story 3.3) |
| Herald | `npc_hc_herald_aldous` | Herald Aldous | South Gate | `elder` m | Bank, mail and Trading Post `q_hc_keys_to_the_city` (level 11; page 07) |
| Waywarden | `npc_hc_waywarden_liss` | Waywarden Liss | Waykeepers' Hall | `mage` f | **Travel Methods and waystone teleports** `q_hc_the_waywardens_oath` (level 12; page 14 §7, page 20 §5); a Wardens (Waystone keepers) officer |
| Shieldmaster | `npc_hc_shieldmaster_varr` | Shieldmaster Varr | Warden's Yard barracks | `warrior` m | **Provoke** (the shared taunt), `q_hc_hold_the_line` (level 10, tank-capable classes; page 07) |
| Lord Protector | `npc_lord_protector_edmund_vale` | Lord Protector Edmund Vale | Crown Ward | `knight` m | Ch 3 giver; chair of the Assembly |
| Elf envoy | `npc_envoy_liriel` | Envoy Liriel Moonward | Crown Ward | `mage` f | Assembly seat (the elves; a Moonwell Circle elder) |
| Dwarf envoy | `npc_envoy_brannoc` | Envoy Brannoc Ironbraid | Crown Ward | `warrior` m | Assembly seat (the Deepforge Clans) |
| Halfling speaker | `npc_speaker_merrit` | Hearth Speaker Merrit Underbough | Crown Ward | `elder` m pitch +0.12 | Assembly seat (the southern shires) |


### The Hall of Callings — thirty trainers

Every class trainer stands in the Hall of Callings. They **explain** spells and talents (spells come
from levels, talents from talent points — page 07), give the **level-20 and level-40 calling quests**,
and sell the class's cosmetic tabard. The level-6 calling quest comes by courier (page 14). Voice role
= the class's own voice from `shared/voices.js`.

| Class | Trainer id | Name |
|---|---|---|
| warrior | `npc_trainer_warrior` | Master-at-Arms Tove Harlan |
| fighter | `npc_trainer_fighter` | Duras Kell |
| paladin | `npc_trainer_paladin` | Dame Seraphine Oakes |
| ranger | `npc_trainer_ranger` | Wyll Thornby (and his cat, Soot) |
| rogue | `npc_trainer_rogue` | Nettle |
| cleric | `npc_trainer_cleric` | Father Anselm Crowe |
| bard | `npc_trainer_bard` | Lark Pennyweather |
| mage | `npc_trainer_mage` | Magister Idony Strand |
| necromancer | `npc_trainer_necromancer` | Corvin Ashgrave |
| warlock | `npc_trainer_warlock` | Seldra Quill |
| demon_hunter | `npc_trainer_demon_hunter` | Kasimir Dray |
| scavenger | `npc_trainer_scavenger` | Old Rook |
| swashbuckler | `npc_trainer_swashbuckler` | Captain Lucan Dare |
| dragon_knight | `npc_trainer_dragon_knight` | Ser Aldith Vyrne |
| pyromancer | `npc_trainer_pyromancer` | Hessa Kindlewright |
| stormcaller | `npc_trainer_stormcaller` | Orlo Gallowmere |
| druid | `npc_trainer_druid` | Aelwen Moss |
| oracle | `npc_trainer_oracle` | Sybel Farrow |
| tactician | `npc_trainer_tactician` | Marshal Edric Vane |
| chronomancer | `npc_trainer_chronomancer` | Timmon Everly |
| monk | `npc_trainer_monk` | Brother Olan |
| shaman | `npc_trainer_shaman` | Grandmother Uda |
| witch_hunter | `npc_trainer_witch_hunter` | Inquisitor Maren Blackwood |
| knight | `npc_trainer_knight` | Ser Godric Lannet |
| sorcerer | `npc_trainer_sorcerer` | Zephrine Wilde |
| runesmith | `npc_trainer_runesmith` | Durma Coalbrow |
| shadow_dancer | `npc_trainer_shadow_dancer` | Sable Merrow |
| tinker | `npc_trainer_tinker` | Nib Tallowgear |
| priest | `npc_trainer_priest` | High Priest Aurelian Dawes |
| enchanter | `npc_trainer_enchanter` | Liora Glass |

---

## 10. The travel network

**Page 20 ([`20-TRAVEL.md`](20-TRAVEL.md)) owns every travel rule and number** — speeds, fares,
cooldowns, the Travel Method lines (`tm_*`) and stations (`tms_*`), timetables, waystones, the Recall
Stone, teleport spells and scrolls, discovery. This section keeps only what is geography: the named
roads, which towns hold a station, which landmarks can bind the Recall Stone, and where the stables are.
There are **no flight paths, no skyways and no personal boats** (canon W15; page 20 §3.3).

### 10.1 Roads

World Forge's road network (reuse: `worldgen/js/roads.js`, Farhold `js/roadplan.js`, `ROAD_CLASS`
widths, switchbacks `js/road-fold.js`, bridges `js/bridge-plan.js`, signposts `js/roadside.js`) with
**six named roads** forced by the overrides file (§1). Page 20 §9 lists the wagon, trail and Longshank
lines that run on them.

| Road | Class | Route | Length |
|---|---|---|---|
| **The Kingsroad** | highway | Brightwater → Millbrook → Highcourt South Gate → North Gate → Kettle Pass → Anvilgate → Fort Ashfall → Waystone Camp → Last Light | ~31 km |
| **The Saltroad** | road | Fort Ashfall → east across the Steppe → Saltmarch | ~9 km |
| **The Sunroad** | road | Kettle Pass → west → Redmesa Post → Oasis of Tamar | ~6 km |
| **The Moonroad** | road | Anvilgate → east → Hartsrest → Silverbough (and the Rootstair down to Reedhollow) | ~7 km |
| **The Rimeroad** | road | Fort Ashfall → north-west → Rimehold | ~7 km |
| **The Fen Causeway** | road | Brightwater → Reedhollow → Highcourt Fen Gate | ~6 km |
| Trails | trail | A* between every other town and landmark | — |

Road pace bonus: **walking ×1.15, riding ×1.25** on any road (reuse: Farhold R27 M7, applied once).
Roads show milestones every 500 m and a signpost at every junction naming the next town each way.

### 10.2 Stations

A **Travel Method station** (`TM` in §8's settlement tables; `FY` marks a station that is a quay or
harbour) stands inside the town, so entering the town discovers it. **Every settlement in §8 has one
except Highcairn and the Quiet Orchard**, plus four outside towns (the Thistlemere east jetty, the High
Islands landing and others; page 20 §10 has the full list with `tms_*` ids and the lines each serves).
Each station has one station-master (proposed id `npc_stationmaster_<station>`, page 20) and a
departure board. Highcourt has four: the South Gate, the Fen Gate, the Low Wharf and the North Gate. The
**Longshank** — a giant, stilt-legged grazing beast carrying a roofed howdah — is a creature of Mossfen
and the Sunscar, where its lines wade straight across marsh and dunes. The **Deepway** rail line runs
under the Greyridge from Stonebridge to Hollowpeak Lodge (a Deepforge Clans line).

### 10.3 Waystones and the Recall Stone

Every town marked `WS` has a waystone (reuse: Farhold `js/waypoints.js`), lit for you when you enter the
town. Per page 20 §14, a waystone is **a destination, not a travel menu**: it is where the Recall Stone
binds and where teleports (Scrolls of Passage, Portal Stones, the Mage's Portal, the Druid's Heron's
Flight) arrive. Hub waystones have a **waykeeper** (proposed `npc_waykeeper_<town>`) who sells scrolls
and stones. The Wardens' **Waystone keepers** chapter tends them all (§6).

**The Recall Stone** (`it_recall_stone`, canon W24; page 20 §15) binds at **any lit town waystone** or at
a landmark this page marks **`bindable`**. A landmark may be `bindable` only if it is inside a town
boundary, or is a wayshrine with an NPC keeper and no hostile spawn within 80 m. Never a dungeon
entrance, a wild landmark, a world boss site or a warband camp.

| Bindable landmark | Region | Why it qualifies |
|---|---|---|
| `lm_first_waystone` | Hearthvale (Brightwater's square) | inside Brightwater; every Brightwater starter's stone begins bound here |
| `lm_oakhollow_waystone` | Hearthvale (Oakhollow) | inside Oakhollow; every Oakhollow starter's stone begins bound here |
| `lm_stepped_well` | Sunscar (Oasis of Tamar) | inside Tamar |
| `lm_eastmoon_well` | Whisperwood | a lit moonwell kept by the Moonwell Circle, no hostile spawn within 80 m (bindable once lit in Ch 6) |
| `lm_westmoon_well` | Whisperwood | the same, once relit at the end of Ch 6 (story 6.10) |
| `lm_sunken_shrine` | Mossfen | **not** bindable (no keeper; the marsh spawns within 80 m) |

Oakhollow starters' Recall Stones begin bound to Oakhollow's town waystone (§7) — a request to page 20,
whose table says every stone starts at the First Waystone.

### 10.4 Mounts and stables

Page 20 §4 owns the riding ranks (I at 10, II at 20, III at 40, IV flying at 60 through the Kingsfire
story chain `q_sky_1..5`) and page 08 the mount catalogue. This page places the **stables**: every hub
town and Highcourt has a **stablemaster** (`ST`) who sells and stores mounts and, for rangers, stables,
swaps, renames and revives tamed beasts (classes/ranger.md §2.7).

| Town | Stablemaster (proposed id) | Name |
|---|---|---|
| Brightwater | `npc_stablemaster_brightwater` | Hob Tanner |
| Reedhollow | `npc_stablemaster_reedhollow` | Wenna Stilt (keeps frogs and marsh ponies on a floating pen) |
| Highcourt (Stable Gate) | `npc_oswin_stablemaster` | Oswin (gives Riding I, `q_hc_saddle_and_bridle`) |
| Anvilgate | `npc_stablemaster_anvilgate` | Brakk Stonehoof |
| Oasis of Tamar | `npc_stablemaster_tamar` | Samira Dune |
| Silverbough | `npc_stablemaster_silverbough` | Faelan Hartwood |
| Fort Ashfall | `npc_stablemaster_fort_ashfall` | Corporal Dunn |
| Rimehold | `npc_stablemaster_rimehold` | Sigrun Elkhand |
| Saltmarch | `npc_stablemaster_saltmarch` | Old Pell Harrow |
| Waystone Camp | `npc_stablemaster_waystone_camp` | Tovi Chain |
| Last Light | `npc_stablemaster_last_light` | Mags Cinder |
| Spire Landing | `npc_stablemaster_spire_landing` | Ansa Reed |

Every stablemaster uses `voiceFor({ role: 'villager' })` with the region's adjustment (§12).

### 10.5 Class teleports and scrolls

Casters carry people (canon 00 §6, W9; page 20 §16–17): the Mage's **Portal**, the Oracle's **Guiding
Call**, the Chronomancer's **Retrace** and the Druid's **Heron's Flight**; everyone else buys Scrolls of
Passage, Portal Stones and Scrolls of Calling from waykeepers. A dungeon entrance reached by a teleport
counts as discovered for the Dungeon Finder (page 20 §18: within 40 m of the door on foot, within 60 m by
teleport).

### 10.6 The Pale Sea

The ship to Spire Isle (`tm_ship_pale_sea`, page 20) is the only way there until the Spire Landing
waystone is lit; its first crossing is story quest 12.2 on *the Lamp's Wake*. Nobody swims or rows the
Pale Sea: the Pale current turns swimmers back 1.5 km out (page 20 §3.2).

---

## 11. Light and weather by region

### 11.1 Always daylight

**There is no day/night cycle** (canon 00 §4, §12.3). The sun never sets. There is no in-game clock, no
moon, no night spawns, no light slot, no torch key, and nothing in the game is timed to "night". Each
region has **one fixed sun position and light colour** (a late-morning sun in Hearthvale, a hard white
noon in the Sunscar, a low gold sun in Frostmantle, a red-orange ash-filtered sun in Kingsfire); page 17
owns the lighting rigs. Weather (§11.3) changes the light — overcast, fog, ash — but never below the
**readability floor** below.

### 11.2 Film-set dark places

Some places must *look* dark: graveyards, crypts, caves, mines, the deep forest, drowned streets. They
are **film-set dark** (the owner's "Hollywood dark"): the colour grade is dark and blue-grey or
green-grey, the contrast is high, and there is always **enough ambient light to see every enemy, every
telegraph and every edge clearly**. Three rules:

1. **Readability floor.** Every telegraph (page 11), every enemy outline and every walkable edge must be
   readable at the darkest spot of a dark place. Page 17 owns the number (a minimum scene brightness and
   a minimum contrast for telegraph colours).
2. **Every dark place has a visible light source that explains its light** — nothing glows for no
   reason. Caves are lit by **glowing fungi, lava and glowing plants**; crypts by candles, braziers and
   grave-moss; drowned places by glowing kelp and sea-life.
3. **No player light is needed.** A character never carries a torch or lantern to see (lanterns exist
   only as cosmetics).

| Region | Dark place | How it is lit |
|---|---|---|
| Hearthvale | the Barrow Downs; d01 The Hollow Barrow | a local grey overcast over the downs; inside, grave-candles in wall niches and pale blue **barrow-moss** |
| Mossfen | the Lantern Marsh; d02 The Drowned Mill | fog bank and will-o-lights; glowing **peat-fungus** on the mill's beams |
| Highcourt | the Undercroft | lamp-niches kept lit by the Quiet Wake; grave-moss |
| Greyridge | d03 Shaft Seven Mines; the Old Seam; d04 Bellows Keep | miners' lamps on every prop; veins of pale-green **glowcap fungus**; banked forges |
| Sunscar | d05 The Glass Tombs; d06 Vault of the Sandsworn; slot canyons | sunlight let down through glass skylights and bounced off bronze mirrors — amber dark with hard shafts of light |
| Whisperwood | the forest floor; the Hollow Roots; d07, d08 | canopy shade; blue moonwell glow, **bioluminescent moss** and pale **lanternflowers** on every path |
| Cinder Steppe | the Charred Barrows; d09 The Warmaster's Pit | an ash cloud turns the sun orange and low; burning grass; fire-bowls |
| Frostmantle | d10 Rimefang Caverns | daylight carried through the glacier (bright blue ice); **frost-lichen** that glows in the deep parts |
| Drowned Coast | the Sunken Quarter; d11 Saltdeep Cathedral | green-dark water; **glowing kelp**, phosphor jellyfish, candles still burning under water; the drowned rose window lit from behind |
| Riftmarch | the Unwritten Fields; d12 The Unmade Workshop | island shadow, violet patchy light; the half-made ground glows along its seams; furnaces and **shard-crystal** |
| Kingsfire | d13, d14, d15 | **lava** under floor grates and in channels; the Order's everburning braziers |
| Spire Isle | the Shiftwood; d16 The Spire | the upside-down canopy's shade; white-glowing roots where they touch the Mend; inside the Spire, the Mend itself |

### 11.3 Weather

Each region rolls a new state every **12–20 real minutes** from its table, crossfading over 60 s (reuse:
`worldgen/js/weather.js` `WeatherClock`). Numbers are percent chances per roll. `Tearstorm` = World
Forge's `ionstorm` renamed (lightning 1, a violet tint over the day sky; each one rolls a rift event,
§4). `firestorm` is Kingsfire's burning-ash storm. **Weather effects on play** (page 05 owns): rain −10%
fire damage / +10% lightning damage; fog cuts enemy aggro range 30% and yours 30%; sandstorm and
blizzard cut sight to 25 m; ashfall −5% healing received; Tearstorm +10% arcane/void damage for
everyone. No weather darkens the screen below the readability floor (§11.2).

| Region | clear | fair | cloudy | overcast | drizzle | rain | storm | fog | snow | blizzard | sandstorm | ashfall | firestorm | Tearstorm |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hearthvale | 30 | 30 | 15 | 5 | 10 | 5 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mossfen | 3 | 12 | 10 | 20 | 20 | 15 | 5 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| Highcourt | 25 | 30 | 15 | 10 | 10 | 5 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| Greyridge | 15 | 20 | 20 | 15 | 10 | 10 | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Sunscar | 55 | 20 | 5 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 16 | 0 | 0 | 2 |
| Whisperwood | 15 | 20 | 15 | 10 | 15 | 10 | 5 | 8 | 0 | 0 | 0 | 0 | 0 | 2 |
| Cinder Steppe | 15 | 20 | 15 | 10 | 0 | 5 | 5 | 0 | 0 | 0 | 0 | 20 | 6 | 4 |
| Frostmantle | 15 | 10 | 10 | 15 | 0 | 0 | 0 | 5 | 25 | 15 | 0 | 0 | 0 | 5 |
| Drowned Coast | 5 | 10 | 10 | 20 | 15 | 15 | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 5 |
| Riftmarch | 10 | 15 | 15 | 15 | 5 | 5 | 5 | 10 | 0 | 0 | 0 | 0 | 0 | 20 |
| Kingsfire | 5 | 5 | 10 | 10 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 35 | 25 | 5 |
| Spire Isle | 5 | 5 | 10 | 15 | 5 | 5 | 10 | 15 | 0 | 0 | 0 | 0 | 0 | 30 |

(Each row sums to 100. The Tearstorm column is a floor; §4's Tear-pressure rule adds to it during
story-driven Mend events on page 14.) Two sub-zones roll their own: the **Lantern Marsh** has fog 60% of
the time, and the **Barrow Downs** keep a local grey overcast whatever Hearthvale rolls.

**Dungeons** have no weather unless page 12 says so.

---

## 12. Voice and tone guide for NPCs

The Wildmarch is **dark but warm**: things are bad, people are tired, and they still make jokes and
feed strangers. Nobody speaks like a fantasy novel. Everybody speaks like someone with a job.

### Rules for every line an NPC says

1. **Plain words, short sentences.** "The barrows woke up three days ago." not "Lo, the ancient
   barrows have stirred from their slumber."
2. **No exclamation marks.** Ever. (Farhold's events schema already bans them.) Urgency comes from what
   is said, not punctuation. Boss lines are the one exception allowed by page 11 — and even there,
   prefer none.
3. **Numbers where a player needs them.** A quest giver says "six of them" and "the mill past the
   second bridge", not "a few" and "over yonder". The quest text follows Farhold's `WORDING.md`:
   magnitude and place, never a feeling.
4. **Nobody explains the controls.** The HUD does that. NPCs never say "press E".
5. **Nobody knows they are in a game.** No "adventurer, level up". An NPC calls the player by their
   name, race or class ("you, the one with the hunting cat").
6. **The player is not the chosen one.** Everybody is at the muster. The player is the one who kept
   going. NPCs are grateful for work done, not in awe.
7. **Every NPC wants something.** Even a vendor's idle line should be about their own day.
8. **Humour is dry and small.** One joke per quest at most, never at the expense of the dead.
9. **Villains are honest.** The Fire King, the Kindled, the Sallow King and the Choir believe they are
   right and say why in one sentence.
10. **Original names only.** No names from other games or books in any line (canon §11 rule 1, banned list §12.5).

### How lines are made

- **Quest text** is hand-written per quest (page 14) and spoken through **Lingo** (reuse:
  `lingo/js/lingo.js`) so the speaker's traits, tics and formality apply on top — a gruff smith says
  "Hn." before the same sentence a scholar opens with "Consider:" (reuse: `conversations/`
  `expandVariants` openers/closers).
- **Idle and ambient lines** are Lingo intents (`greet`, `farewell`, `observe`, `fear`, `plan`) with
  **scene awareness** (reuse: `lingo/js/context.js`: place tags, threats, danger) — a Brightwater
  farmer greets differently when the barrows are up (page 14 incident `restless_dead`).
- **Memory and relations** (reuse: `lingo/js/memory.js`, `lingo/js/relations.js`): named NPCs remember
  what the player did for them (a finished quest is a memory of importance 0.6; a rescue 0.9) and
  mention it for 7 real days.
- **Rumours** (reuse: `prototypes/farhold/js/rumours.js`) are the only lines that describe another
  region: innkeepers and minstrels say one line about a neighbouring region, built from its live state.
- **Names** for unnamed NPCs, streets, rares and camps come from **Name Forge** (reuse: `namegen/`)
  with the language of the region's culture: human (Common) south and Steppe, halfling (Hearthspeech)
  Oakhollow/Mossfen villages, dwarf (Dwarvish) Greyridge, elf (Elvish) Whisperwood, orc (Orcish)
  Ashtusk, giant (Giantish) Stonehide, goblin (Gobble) Sootwick, undead (Gravespeech) the Drowned and
  the Unburied. Named cast members above are fixed, not generated.

### Voices

Every NPC speaks through our formant engine (reuse: `shared/voices.js` `voiceFor({ role, gender, seed })`,
seed = a hash of the npc id so the voice never changes). Role column in §8 names the base.

| Group | Voice role | Adjustment |
|---|---|---|
| Hearthvale / Highcourt humans | `villager`, `merchant`, `elder` | none |
| Halflings | same | pitch +0.12, speed +0.05 |
| Dwarves | same | depth +0.1, rough +0.1 |
| Elves | same | tone +0.1, speed −0.05, breath +0.05 |
| Frostmantle northerners | same | depth +0.05, speed −0.05 |
| Sunscar Sandsworn | same | breath +0.1 |
| Orcs (Ghara's Camp) | `brute` | rough +0.15 |
| The Drowned | `undead` | a bubbling effect (voice-lab fx chain, page 17) |
| Ysolde's Echo | `narrator` | pitch +0.2, reverb |
| The Fire King | `elder` | pitch −0.1, speed −0.05, never jittered |
| The Narrator (scene text, italic) | `narrator` | reuse: Emberveil `js/talk.js` `narrate` |

### Region voice notes

| Region | How people talk | Example line |
|---|---|---|
| Hearthvale | Farmers. Weather, harvest, the Wardens. Proud and a bit slow to trust. | "Three days now the dogs won't go past the downs. Dogs know." |
| Mossfen | Quiet, careful, superstitious. Never say the name of the Drowned. | "Don't follow the lights. Whatever you've lost, it isn't out there." |
| Highcourt | Busy, political, a little snobbish; everyone has an opinion on the Assembly. | "Four seats and not one of them will say the word *war*." |
| Greyridge | Dwarves: blunt, formal about craft, rude about everything else. | "Good steel. Wrong hands. Sit down." |
| Sunscar | Courteous, ceremonial, careful about the dead. Everything is a guest-right. | "Drink first. Then tell me why you walk on my grandfather's roof." |
| Whisperwood | Elves: patient, indirect, answer a question with a question. | "You ask why the well went dark. Ask instead who drank from it." |
| Cinder Steppe | Soldiers and herders: tired, gallows humour, short. | "Wall holds, we eat. Wall falls, we don't. Simple sums." |
| Frostmantle | Few words, saga cadence, respect earned in deeds. | "You came up the stair alone. Sit by the fire. Say nothing yet." |
| Drowned Coast | Sailors: bleak jokes, bargains, bells. | "When the bells ring under the water, you go inside. Nobody asks why twice." |
| Riftmarch | Scholars and soldiers who have seen too much; clipped and precise. | "Stand on the stone that hums. The ones that don't, don't trust." |
| Kingsfire | Resistance: grim, no time, loyal. | "Everyone here has buried someone. Pick up a shovel or a sword." |
| Spire Isle | Awed, quiet, a camp at the end of the world. | "Listen. That's the Mend. It sounds like a held breath." |

---

## 13. Id conventions used on this page

The brief fixes spells, talents, items, sets, legendaries, uniques, monsters, bosses, quests, NPCs,
screens and settings. This page adds the following, all **proposed** (see §15):

| Thing | Pattern | Example |
|---|---|---|
| Region | canon §7 | `hearthvale` |
| Sub-zone | `sz_<snake>` | `sz_barrow_downs` |
| Settlement | `town_<snake>` | `town_brightwater` |
| Highcourt district | `hc_<snake>` | `hc_coinhall` |
| Landmark | `lm_<snake>` | `lm_first_waystone` |
| World boss site | `wb_site_<snake>` | `wb_site_ironmuster` |
| Faction | `fac_<snake>` | `fac_wardens` |
| Faction chapter | `chp_<snake>` (a label only; standing lives on the faction, §6.5) | `chp_vale_watch` |
| Travel Method line | `tm_<snake>` (canon prefix; page 20 owns the ids) | `tm_kingsroad_wagons` |
| NPC | `npc_<snake>` (brief) | `npc_iris_vael` |
| Class trainer | `npc_trainer_<class>` | `npc_trainer_mage` |

### Every hub, at a glance

| Region | Hub id | Waystone | Inn | Travel Method stations (page 20) | Stablemaster | Quartermasters (faction, chapter) |
|---|---|---|---|---|---|---|
| hearthvale | `town_brightwater` | yes (`lm_first_waystone`) | the Lamp and Ladder | `tms_brightwater_yard`, `tms_brightwater_quay` | `npc_stablemaster_brightwater` | Wardens (Vale watch) |
| mossfen | `town_reedhollow` | yes | the Dry Plank | `tms_reedhollow` | `npc_stablemaster_reedhollow` | Greenhand (the Fenfolk) |
| highcourt | `town_highcourt` | yes (the Waykeepers' Hall) | the Crown and Candle | `tms_hc_south_gate`, `tms_hc_fen_gate`, `tms_hc_low_wharf`, `tms_hc_north_gate` | `npc_oswin_stablemaster` | Crown Assembly · Wardens · Lantern House · Cutwater · Quiet Wake |
| greyridge | `town_anvilgate` | yes | the Anvil's Rest | `tms_anvilgate` (wagons + the Deepway) | `npc_stablemaster_anvilgate` | Deepforge Clans (Anvilgate) |
| sunscar | `town_oasis_of_tamar` | yes | the House of Shade | `tms_oasis_of_tamar` (wagons + Longshanks) | `npc_stablemaster_tamar` | Quiet Wake (the Sandsworn) |
| whisperwood | `town_silverbough` | yes | the Bough Hall | `tms_silverbough` | `npc_stablemaster_silverbough` | Greenhand (the Moonwell Circle) |
| cinder_steppe | `town_fort_ashfall` | yes | the Mess | `tms_fort_ashfall` (the network's great junction) | `npc_stablemaster_fort_ashfall` | Crown Assembly (fort garrisons) |
| frostmantle | `town_rimehold` | yes | the Long Fire | `tms_rimehold` | `npc_stablemaster_rimehold` | Wardens (Rime watch) |
| drowned_coast | `town_saltmarch` | yes | the Bell and Anchor | `tms_saltmarch_yard`, `tms_saltmarch_harbour` | `npc_stablemaster_saltmarch` | Cutwater (the Saltbound) · Quiet Wake (bell-keepers) |
| riftmarch | `town_waystone_camp` | yes | the Anchored Mug | `tms_waystone_camp` (wagons + kite baskets) | `npc_stablemaster_waystone_camp` | Lantern House (the Riftwatch) |
| kingsfire | `town_last_light` | yes | the Banked Coal | `tms_last_light` (war wagons + kite baskets) | `npc_stablemaster_last_light` | Crown Assembly · Deepforge Clans · Quiet Wake |
| spire_isle | `town_spire_landing` | yes | the Held Breath | `tms_spire_landing` (the Pale Sea ship) | `npc_stablemaster_spire_landing` | Wardens (Spire watch) · Lantern House |

---

## 14. Reuse map

| What | Wildmarch use | Reuse path |
|---|---|---|
| World generation | the continent (option C) | `worldgen/js/world.js`, `regions.js`, `nodes.js`, `roads.js`, `local.js` |
| Weather | per-region tables | `worldgen/js/weather.js` (`ionstorm` → Tearstorm) |
| Town layout | every settlement | `proctown/js/townplan.js`, `buildkit.js`; Farhold `js/town-plan.js` |
| Cultures | human, halfling, dwarf, elf, desert, orc, undead palettes; **new `fen`** | `proctown` `CULTURES` |
| Level bands on the map | sub-zone bands | Farhold `js/zones.js` (bands fixed per sub-zone instead of computed from hops) |
| Factions, standing, grip | §6 | Farhold `js/factions.js`, `js/territory.js`, `data/factions.json` |
| Warbands | 5 enemy races | Farhold `js/warbands.js`, `data/warbands.json` (levels rescaled) |
| Landmarks | `lm_*` kinds | Farhold `data/landmarks.json`, `data/setpieces.json`, `js/sites.js` |
| World boss arenas | `wb_site_*` | Farhold `data/setpieces.json` `boss_*` layouts |
| Waystones | Recall Stone binds, teleport arrivals (page 20 §14) | Farhold `js/waypoints.js`, `js/waylight.js` |
| Class teleports | Mage Portal's exit/anchor pair (page 20) | Farhold `js/portal.js` |
| Mounts, Travel Method vehicles | travel (page 20 owns the list) | Farhold `js/gear.js`, `js/boat.js` (hull style for barges and ships), `data/vehicles.json`; `avatar-3d/js/vehicles.js` (wagons, coaches, sleds) + creature bodies (the Longshank is a new `creature-types.js` type) |
| Roads | network | Farhold `js/roadplan.js`, `js/road-fold.js`, `js/bridge-plan.js`, `js/roadside.js` |
| Gates, guards | town gates | Farhold R27 M4 (`js/town.js` `gateVerdict`) |
| Dark-place lighting | film-set dark (§11.2): fungi, lava, glowing plants, candles as placed light sources | ideas from Farhold `js/light.js` (point lights with pushed-out falloff) and `js/nightlights.js` (placed lamps); no player light |
| NPC roles | vendors, broker, unbinder, gambler | Farhold `js/town.js` `ROLES` |
| Speech | all NPC lines | `lingo/`, `conversations/`, Farhold `js/speech.js`, `js/rumours.js` |
| Names | generated NPCs, rares, streets | `namegen/` |
| Voices | every NPC | `shared/voices.js` |
| Enemy races | orc/goblin/giant/undead/beastkin | `avatar-3d/js/chibi2-races.js` |
| Body presets | four playable races | Farhold `js/bodypresets.js` |

**New for Wildmarch (not in any playground module):** the fixed continent recipe + overrides file;
Tear pressure; the `fen` town culture; tides; heatstroke and frostbite; the Pale Sea current; region
weather tables; the seven-faction chapter model (§6); the film-set dark lighting table (§11.2); the
list of stations, bindable landmarks and stablemasters (§10; rules on page 20).

---

## 15. Canon change requests and open questions

### Canon change requests (for page 00; not applied here)

1. **Add id patterns** `sz_`, `town_`, `hc_`, `wb_site_` and the new **`chp_`** (faction chapter) to
   00 §10's prefix list. (`lm_`, `fac_`, `tm_` are already there.)
2. **Region 11 hub id** `town_spire_landing` and **Highcourt as `town_highcourt`** in addition to region
   id `highcourt`, so quest and waystone data can name the city like any other town.
3. **Two starting towns** (§7): Brightwater and Oakhollow, both Hearthvale, any race. Canon W25 says
   players may "choose different starting locations"; 00 §4 should name the two towns.
4. **Highcourt's portal court is gone** (§9): 00 §3 lists no Highcourt portals and W9 gives teleports to
   casters and scrolls; this page turned the district into the **Waykeepers' Hall** (page 20 §14). If the
   owner wants hub portals back, page 20 should own them.
5. **Tear pressure multiplies greater-rarity chances** in the open world (§4, rule 3). Page 10 owns the
   base chance; 00 §12.3 could mention that the north rolls more of them.
6. ~~The taunt called "Challenge"~~ — **resolved:** canon renamed it **Provoke** (00 §10).

**Resolved by round 2** (kept here so nobody reopens them): the Fire King's past (Maelor Varn, crowned
Kaedros — 00 §10), the cult's name (the Threadcutters, `fac_threadcutters`; `b_unwoven` is only the
d16 boss), the Spire's warden (Saelith, now in §3 and §8.11), the non-raid story ending (d15 and d16 are
5-player dungeons), warband bands (page 10's), world boss names (page 13's).

### Still open from round 1

- **The Barrowking's past.** Page 13 (round 1) had a king buried under the hill before Highcourt was built;
  this page has the 204–211 AS war. His raid is parked, so this only matters for lore text.
- **The Sallow King** is the Drowned Coast world boss (page 13) but §3 buries him in a Sunscar tomb; the
  bridge used here: his wraith walked north under the sea with the Drowned. Page 13 should confirm.
- **Warbands outside page 10's bands on this page:** Ashtusk scouts in the Redmesa (17–20). (Kingsfire's
  Ashtusk loyalists are now counted as Kingsfire Legion auxiliaries, §8.10.)
- **Name clashes** with page 07's givers: two Aldous (`npc_captain_aldous_fenn`, `npc_hc_herald_aldous`),
  two Brams (`npc_bram_fenwick`, `npc_hv_innkeeper_bram`), and page 07's unused
  `npc_dc_choirkeeper_selwyn` vs this page's enemy `npc_cantor_selwyn`. **Fixed this round:** the Hesk
  clash (the scrapwright is now `npc_mf_scrapwright_mabli`) and the Tamsin clash (the roost-keeper
  `npc_tamsin_roost` is gone; Corra is now Highcourt's waykeeper, `npc_waykeeper_highcourt`).

### Questions for the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1-01 | How is the continent made? | A hand-authored · B fixed seed · C fixed seed + hand edits | **C** (§1) |
| Q1-02 | Continent size | 16 × 24 km (this page) · 8 × 12 km (denser, 25 min end to end) · 32 × 48 km (Farhold-scale) | **16 × 24 km** — about 96 min on foot end to end, 15 min on a tier-2 mount, less on the Kingsroad wagons and the Deepway |
| Q1-03 | Starting towns | one (Brightwater) · two in Hearthvale, any race (this page) · one per race homeland with its own 1–6 area | **Two in Hearthvale** — it answers "choose different starting locations" (W25) without splitting a small online population across four starting zones |
| Q1-04 | The ending choice: does it change the shared world? | cosmetic-only (this page) · per-player phasing · server-wide vote | **Cosmetic-only**; phasing doubles art and bugs |
| Q1-05 | The Fire King's motive (a dead daughter) — keep, or darker/lighter? | keep · make him a pure conqueror · make him right | **Keep** — an honest villain gives the dialog opportunity in d15 something to argue about |
| Q1-06 | Reuse Emberveil's Iris Vael and Garrick as names? | reuse · new names | **Reuse** — same author, same tone, a nod for anyone who played both (the prototype's name is only in these notes, never in the game) |
| Q1-07 | Faction chapters late in the game: this page invented three (the Greenhand's **Ashgrowers** at Kiln Hollow, the Quiet Wake's **Reliquary watch**, the Deepforge **Kingsfire forges**) so that all seven factions have a level-52+ town. Keep? | keep · drop them and rely on level-scaled quartermasters alone | **Keep** — a faction you only visit at 10 feels like a starter faction even if its shop scales |
| Q1-08 | Ghara's orcs: a Crown Assembly chapter (the **Free Tusks**, this page) or their own small faction? | Crown chapter · an eighth faction · no reputation at all | **Crown chapter** — canon fixes seven factions, and enemy-faction standing only goes down |
