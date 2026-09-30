# WILDMARCH — Design Bible, page 01: the world, its history and its people

> *"The Lampbearer carried one fire up one mountain. We have been paying for it ever since."*
> — carved over the door of the Lantern House chapterhouse, Highcourt

**Status:** v0.1 draft — 2026-09-29. Documentation only; nothing is built.
**Owns:** region content, sub-zone ids, town ids, landmark ids, NPC ids, faction ids, story beats, the
travel network, weather and music mood per region, and the NPC voice/tone guide.
**Reads from canon ([page 00](00-OVERVIEW.md)):** region ids, level bands, hub towns, holders, dungeon
and raid ids, races, day length. Nothing on this page changes those; where this page wants a change it
is listed in §15 *Canon change requests*.

Links: combat and night danger [page 05](05-COMBAT.md) · progression and the unlock ladder
[page 07](07-PROGRESSION.md) · monsters [page 10](10-BESTIARY.md) · dungeons [page 12](12-DUNGEONS.md)
· raids and world bosses [page 13](13-RAIDS-WORLD-BOSSES.md) · quests, the main story chain and events
[page 14](14-QUESTS-EVENTS.md) · art, music and voices [page 17](17-ART-AUDIO.md) · tech [page 16](16-TECH.md).

---

## Contents

1. [How the continent is made](#1-how-the-continent-is-made) (a decision for the owner)
2. [Geography, south to north](#2-geography-south-to-north) + the ASCII map
3. [History](#3-history) — a dated timeline
4. [The central conflict: the Veil and the Ember King](#4-the-central-conflict-the-veil-and-the-ember-king)
5. [The main story in beats](#5-the-main-story-in-beats) (the quest-by-quest chain is on page 14)
6. [Factions](#6-factions) — ids, what they want, how they feel about each other
7. [Playable races and their homelands](#7-playable-races-and-their-homelands)
8. [The regions](#8-the-regions) — all eleven, in depth
9. [Highcourt, the capital](#9-highcourt-the-capital)
10. [The travel network](#10-the-travel-network)
11. [Day, night and weather by region](#11-day-night-and-weather-by-region)
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
| **B. Fixed seed, untouched** | Pick the World Forge seed whose output looks closest, ship it | Free; same pipeline as Farhold; tiny data (the seed + knobs) | Cannot promise south→north order, Highcourt between regions 2 and 3, a coast for the Drowned Coast, an island for Veilspire — a seed is found, not designed |
| **C. Fixed seed, then hand-edited** *(recommended)* | Generate with World Forge from a fixed seed and fixed knobs, then apply a small **overrides file** on top: region borders painted per cell, towns and landmarks pinned, some roads forced, a few height stamps (the Spire, Highcourt's hill, the Emberthrone caldera) | Keeps erosion, rivers, biomes, roads and naming for free; the parts the story needs are guaranteed; the overrides file is a few hundred lines of JSON that a human can read and a test can check | Two sources of truth (seed + overrides); an upgrade to World Forge can move the untouched parts — so the knobs **and the World Forge version** are pinned |

**Recommendation: C.** Concretely *(new, sits on reuse: `worldgen/js/world.js`)*:

```json
// data/world/continent.json — the recipe
{
  "worldgen": { "version": "pinned-2026-09-29", "seed": 40001, "method": "pangea",
                "width": 64, "height": 96, "metresPerCell": 250,
                "landmasses": 1, "seaLevel": 0.42, "thermalErosion": 4 },
  "stamps":   [ { "id": "stamp_veilspire", "x": 32, "y": 4, "radius": 5, "raiseTo": 0.98 },
                { "id": "stamp_highcourt_hill", "x": 30, "y": 66, "radius": 2, "raiseTo": 0.62 } ],
  "regions":  "data/world/region-paint.png",      // one colour per region id, 64x96, painted by hand
  "pins":     "data/world/pins.json",             // every town_ / lm_ / dungeon / raid mouth, by cell + metre offset
  "roads":    "data/world/forced-roads.json"      // the Kingsroad and the Saltroad are forced; the rest is A*
}
```

- **Size.** 64 × 96 cells at **250 m a cell** = a continent about **16 km wide and 24 km tall**, plus
  the Veil Sea to the north. (Farhold uses 640 m a cell over a whole planet; Wildmarch is a continent,
  so the cell is smaller and the map is hand-sized.) Walking Brightwater → Last Light on the Kingsroad
  is about **31 km, 96 minutes on foot** at Farhold's 5.4 m/s walk — long enough to feel like a
  journey, short enough that no one walks it twice by choice.
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
- At the very top, the **Emberthrone**: a ring of volcanoes around a caldera, where the Ember King sits.
- Beyond the north cliffs, across eight kilometres of the grey **Veil Sea**, is **Veilspire Isle**:
  one mountain, and on it the Spire, the place the Veil is pinned to the world.

### The map

North is up. Numbers are region numbers from canon §7; `*` is a hub town; `#` a dungeon mouth;
`R` a raid door; `W` a world boss site; `=` the Kingsroad; `-` other roads; `~` water; `^` mountains.
Distances are rough (1 character ≈ 250 m across, ≈ 500 m down).

```
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   THE VEIL SEA   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
                     ~            .------------------------.                ~
                     ~            |  [11] VEILSPIRE ISLE 60 |  R r05        ~
                     ~            |   * Spire Landing       |               ~
                     ~            '-----------+------------'                ~
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~|~ ship from Saltmarch ~ ~ ~ ~ ~ ~
 ^^^^^^^^^^^^^^^^^^^^^^^^^.-------------------+-------------------.~~~~~~~~~~~~~
 ^ [7] FROSTMANTLE 34-42  |  [10] THE EMBERTHRONE 52-60          |  [8] THE    ~
 ^  * Rimehold            |   * Last Light     # d13  # d14       |  DROWNED    ~
 ^  # d10 Rimefang        |   W Slagborn       R r04 Ember Court  |  COAST      ~
 ^  R r02 Glacier Throne  +===================+===================+  40-48      ~
 ^  W Standing Ruin       |  [9] THE RIFTMARCH 46-54              |  * Saltmarch~
 ^                        |   * Waystone Camp   # d12             |  # d11      ~
 ^^^^^^^^^^^^^^^^^^^^^^^^^+   W The Unmoored                      |  R r03      ~
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
 '------------------------+     HIGHCOURT *  (capital)  R r01     | W Hungering ~
                          |        (catacombs door)   \ Slowwater | Brood       ~
                          +===================+========\==========+------------~
                          |  [1] HEARTHVALE 1-6 |  [2] MOSSFEN 5-12             ~
                          |   * Brightwater     |   * Reedhollow                ~
                          |   # d01 Barrow      |   # d02 Drowned Mill          ~
                          '--------Wend---------+-------------------------------~
                     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~   THE HEARTHSEA   ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
```

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
| 8 | `drowned_coast` | 4.0 × 6.0 | −30 – 180 | coast 45%, cliffs 25%, drowned ruin 30% (cursed aura) | Cinder Steppe (SW), Riftmarch (W), Veil Sea (N) |
| 9 | `riftmarch` | 7.0 × 3.0 | 300 – 700 (+ islands floating 20–140 m above) | broken land 50%, floating stone 30%, void aura 20% | Cinder Steppe (S), Emberthrone (N) |
| 10 | `emberthrone` | 7.0 × 3.0 | 400 – 1,600 | volcanic 60%, obsidian 25%, caldera 15% | Riftmarch (S), Veil Sea (N) |
| 11 | `veilspire` | 3.0 × 3.0 island | 0 – 1,900 (the Spire) | inverted wood 30%, strand 30%, spire rock 40% (Veil aura) | Veil Sea all round |

---

## 3. History

Years are counted **AS — After the Sealing**. The game starts in **400 AS**. Everything before the
Sealing is **BS**. The in-game calendar has four seasons of 90 in-game days (one in-game day = one
real hour, so the world's year turns every 15 real days; it only tints weather and foliage).
**Seasonal events** (page 14) follow the **real-world calendar**, not this one.

| Year | Event | What is left of it in the game |
|---|---|---|
| Before time | **The Unmade.** Under and around the world is a place of raw stuff that has not decided what to be — no shape, no death, no names. The first peoples call it *the Unmade*. | Riftmarch's floating stone, the Unmoored (world boss), the Unwoven (r05) |
| ~1,400 BS | **The Kindling.** Elves wake at the moonwells of the Whisperwood; dwarves cut the first hall under the Greyridge; humans and halflings farm the south. Each people keeps a sacred fire or water. | Moonwells (Whisperwood), Anvilgate's First Forge, the Hearthstone in Brightwater |
| ~600 BS | **The Sandsworn kings** rule the Sunscar from glass-roofed cities, burying their dead with their breath bottled beside them. | Glass Tombs (d05), Vault of the Sandsworn (d06) |
| 62 – 1 BS | **The Tearing and the Hollowing War.** The world's skin tears at the northern mountain now called Veilspire. The Unmade pours in: things with no fixed shape, **the Riftborn**; dead that will not lie down. The four peoples fight together for the first time. The Sunscar burns to glass. | The glass flats, the barrow downs, the oldest ghosts |
| 0 AS | **The Sealing.** **Ysolde the Lampbearer**, a halfling lamp-keeper from Brightwater, carries the Hearthfire from the Hearthstone up the mountain, walks into the tear and binds it shut with her own life. What she leaves behind is **the Veil**: a skin of woven light across the tear, pinned to the Spire by the flame she carried, now called the **Everflame**. | The Hearthstone, Ysolde's Well, the empty Lampbearer's Seat in Highcourt |
| 3 AS | **The Crown Assembly** is founded at Highcourt: the four peoples swear the **Covenant of the Lamp** to keep the Everflame fed. The **Order of the Ember** is founded to tend it; its master is the **Ember Warden**, who lives in the fortress-temple on the northern caldera — the Emberthrone. | Highcourt; the Emberthrone's temple halls (d14, r04) |
| 112 AS | The last Sandsworn king, **the Sallow King**, refuses to be buried and is sealed alive in his tomb. | The Sallow Court in the Hushed Valley (Sunscar); the Sallow King himself is the Drowned Coast world boss (`b_sallow_king`, page 13 §8.5.6) |
| 204 – 211 AS | **The Barrowking's War.** A Greyridge king, **Hrodric Ninefold** (`b_barrowking_hrodric`, page 13), finds a way to hold his dead soldiers in their bodies. He marches south, is beaten under the walls of Highcourt, and is entombed in the catacombs under the city — his barrow-roads run back north under the ridge. | Crypt of the Barrowking (r01); the Hollow Barrow (d01) is one of his outposts |
| 287 AS | **The Dimming.** One of the three great moonwells of the Whisperwood goes dark. The elves withdraw into Silverbough. | Ruins of the Moonwell (d08) |
| 312 AS | The Deepforge Clans open **Bellows Keep**, the great forge-fortress over the Kettle Pass. | Bellows Keep (d04) |
| 351 AS | **The Ashtusk crossing.** Orc clans, driven south by cold and something they will not name, cross the Frostmantle and settle the Cinder Steppe by force. | Ashtusk war camps; the Warmaster's Pit (d09) |
| 372 AS | **The Drowning of Old Saltmarch.** In one night the sea rises over the lower city. The cathedral choir was singing when it went under — and has not stopped. The dead who rise from the water are **the Drowned**. | Saltdeep Cathedral (d11), the Sunken Choir (r03) |
| 388 AS | **The Ember King.** Ember Warden **Maelor Varn** refuses the Assembly's summons, crowns himself **Kaedros**, King of the Emberthrone (the name page 13's raid uses: `b_ember_king_kaedros`), and closes the northern roads. The Order of the Ember splits: the ones who follow him become the **Kindled**. | The Ember Legion; the Kindled lieutenants |
| 396 AS | **The Riftmarch breaks.** The land between the Steppe and the Emberthrone lifts off its roots. The **Riftwatch** is founded at Waystone Camp to watch it. | The Riftmarch; the Unmade Workshop (d12) |
| 399 AS | The Ember Legion's first raids reach the Cinder Steppe. **Fort Ashfall** is rebuilt as the Crown's northern wall. The Veil is seen to flicker from the north cliffs. | Fort Ashfall |
| **400 AS** | **Now.** The barrows in Hearthvale are waking. The Wardens call for every hand that can hold a torch. The player is one of them. | Game start (page 14 §Prologue) |

### What the peoples believe *(for NPC speech)*

- **Humans** swear by the Lamp — "Lamp keep you", "by the Lamp". They tell children that Ysolde still
  walks the roads at night with an unlit lantern, looking for the fire she gave away.
- **Halflings** are proud that the Lampbearer was one of theirs and are tired of being told so by
  humans. They keep a lit candle in every window on the Night of the Lamp (page 14 §Seasonal).
- **Dwarves** swear by the First Forge. They believe the Everflame was lit from a dwarf coal and say
  so at every opportunity.
- **Elves** do not swear. They say the Veil was not made by Ysolde but *borrowed* from the moonwells,
  and that the Dimming of 287 AS was the moonwells taking some of it back.

---

## 4. The central conflict: the Veil and the Ember King

### The Veil

- **What it is.** A skin of woven light stretched over a four-hundred-year-old wound in the world.
  On one side, the Wildmarch; on the other, the Unmade. The Veil is **pinned** at Veilspire by the
  Everflame. Wherever the Veil is thin, the Unmade leaks: stone floats, the dead stand up, beasts come
  back wrong, people dream the same dream.
- **How you see it.** From anywhere north of the Greyridge on a clear night: a faint band of shifting
  light across the northern sky (the **Veil-light**). The further north, the brighter and the more
  torn. In game it is a sky layer (page 17) whose brightness is the region's **Veil pressure** (0–1):
  Hearthvale 0.05 · Mossfen 0.08 · Greyridge 0.12 · Sunscar 0.18 · Whisperwood 0.22 · Cinder Steppe
  0.35 · Frostmantle 0.45 · Drowned Coast 0.55 · Riftmarch 0.80 · Emberthrone 0.70 · Veilspire 1.00.
- **What Veil pressure does in the game** *(new; numbers owned here, effects owned by pages 05/10)*:
  the chance a night spawn is a Veil-touched variant = pressure × 20%; the Veilstorm share of §11's weather table
  rises with pressure, and every Veilstorm also rolls a rift event (page 14); rift events (page 14) only fire where pressure ≥ 0.3.
- **Why it is failing.** Ysolde's binding does not need the Everflame to be *fed* — it needs the
  Everflame to be **held**. For four hundred years the Order of the Ember believed the flame had to be
  fed with lives (the **Kindling rite**: a volunteer walks into the flame once a generation). That
  belief was wrong, and Maelor Varn found out.

### The Ember King — Maelor Varn

- **Who he was.** The fourteenth Ember Warden. A careful, gentle scholar; the best keeper the Order had
  in a century. In 381 AS his daughter **Ysa Varn** volunteered for the Kindling rite and walked into
  the Everflame. He found the Order's oldest records while grieving her and learned the rite had never
  been needed.
- **What he wants.** He has learned something worse: the Everflame is not only a pin, it is a
  **door-key**. Whoever holds it can open the Veil a little and draw the Unmade through — raw
  unshaped stuff that can be made into anything, including a daughter who never died. He means to
  open the Veil wide enough to **remake the Wildmarch without death**, and he believes the price
  (everything as it is now) is worth paying.
- **What he is doing.** He has taken the Everflame's heart out of the Spire and carried it to the
  Emberthrone — the **Ember Heart**. The Spire's flame now burns on what is left, which is why the Veil
  flickers. Each rift, each drowned bell, each floating island is the Veil giving way where the King
  pulls at it. His **Ember Legion** (the Kindled, human soldiers in black-glass armour, fire-binders,
  and the drakes of the caldera) holds the north while he works.
- **What he is not.** Not cruel for its own sake. He speaks to the player several times across the
  story (visions, a projection at Fort Ashfall, a parley in the Ember Court) and every time he makes
  the same honest offer: *stand aside, and nobody you love will ever die again.* Page 13's Ember Court
  fight has a **dialog opportunity** where the group can answer him.
- **Voice.** `voiceFor({ role: 'elder', gender: 'm' })` pitched down 0.1; slow; never raises his voice;
  never uses an exclamation mark.

### The endgame: Veilspire

- The Ember King dies in **the Ember Court** (r04). With him goes the hand holding the Ember Heart,
  and the Veil — which had been braced against his pull for twelve years — **snaps back and tears**
  at its pin. The player returns the Ember Heart to the Spire (story quest) and finds the Spire already
  breached.
- **The Unwoven** (`b_unwoven`, r05's final boss; page 13 owns the fight) is the first thing
  that came through the Tearing in 62 BS — the thing Ysolde actually fought. It has no fixed shape; in
  the raid it wears pieces of everything the players have killed on the way up (its phases borrow
  mechanics from earlier bosses).
- **Veilspire Isle** is the level-60 zone: the Spire Landing camp, daily work holding the breach, the
  20-player **Veilspire** raid (r05), and the story's last choice (page 14, `q_ms_the_last_lamp`).
  At the empty brazier, Ysolde's Echo offers two ways to pin the Veil again:
  - **Relight the Lamp** — set the Ember Heart back in the brazier. The Everflame burns as before.
    Title *the Lampbearer's Heir*; the Spire's flame is gold on your client.
  - **Take the Lamp's place** — hold the Ember Heart and let the Echo bind *you* into the Veil, as she
    was; she is freed and you carry a spark of it. Title *the Held Flame*; the Spire's flame is white
    on your client, and your character's torch burns white.
  **Both choices produce the same shared world state** (the Veil is sealed; Veilspire dailies continue)
  so an online world stays one world. The only lasting differences are cosmetic: the title, the flame
  colour, and which of two epilogue scenes plays (see Q1-04).

> *(reference)* The shape — a grieving guardian turned villain, a seal failing, a final raid behind a
> sealed door — is a familiar genre spine. Every name, place and specific is original.

---

## 5. The main story in beats

The main story is called **"The Lamp Goes North"**. Twelve chapters plus a prologue, one per region,
each ending at that region's last dungeon or a story instance. Page 14 has every quest id, giver,
objective and reward; this is the shape.

| Ch | Title | Region | Levels | Beat | Ends at |
|---|---|---|---|---|---|
| P | **Torch and Stick** | Hearthvale | 1–3 | The player signs the Warden muster at Brightwater, learns to fight, and meets Iris Vael of the Lantern House, who is measuring why the barrows woke. | The first barrow-dead killed at Harrow Watch |
| 1 | **The Barrow Wakes** | Hearthvale | 3–7 | The Sootwick goblins are robbing the barrows; the dead come up behind them. Something in the Hollow Barrow is calling them. Iris finds a Kindled sigil burned into the barrow door — the Ember King's people were here first. | d01 The Hollow Barrow — its boss carries a letter in a hand nobody knows |
| 2 | **Lights in the Fen** | Mossfen | 6–11 | Lights over the marsh lead people into the water; the Mire Sisters are drowning villagers "to feed the lamp". The Drowned Mill is grinding bones. First sighting of a **Drowned** — the dead of the far north-east have walked here underground. | d02 The Drowned Mill |
| 3 | **The Crown Assembly** | Highcourt | 10–12 | The player carries Iris's findings to the Assembly. The four seats argue; the Lampbearer's Seat is empty. A projection of the Ember King appears in the hall — his first offer. The Assembly sends the player north through the Kettle Pass. | A council scene; while the player is in Highcourt the bank, mail and market (11), waystones and portals (12) open (page 07 ladder) |
| 4 | **Deepforge** | Greyridge | 12–18 | The Deepforge Clans' mines have broken into an old Barrowking road; the Deepworn are coming up changed. Bellows Keep has stopped answering. The Kindled are buying dwarf steel for the Legion. | d03 Deepdelve Mines, d04 Bellows Keep |
| 5 | **Glass and Breath** | Sunscar | 17–24 | The Sandsworn guard the only true account of the Tearing, bottled in the breath-jars of their kings. The player must enter the Glass Tombs to read it. The account: the Everflame is a key. | d05 The Glass Tombs, d06 Vault of the Sandsworn |
| 6 | **The Dimming** | Whisperwood | 22–30 | A second moonwell is going dark. The Moonwell Circle blames the Ember King, correctly: he is drawing on the wells to strengthen his pull. The Thornmane packs are running mad. | d07 Thornheart Hollow, d08 Ruins of the Moonwell |
| I | **Interlude: The Barrowking** | Highcourt | 30 | The Barrowking stirs under Highcourt, woken by the Veil's flicker. Optional for the story; required for the raid (attunement). | r01 Crypt of the Barrowking |
| 7 | **Ashfall** | Cinder Steppe | 28–36 | The Ember Legion marches south with the Ashtusk Horde as its spear. Fort Ashfall is besieged. An Ashtusk defector, Ghara, says the orcs were driven south by the Legion, not by cold. | Story instance *The Siege of Fort Ashfall* + d09 The Warmaster's Pit |
| 8 | **Rime** | Frostmantle | 34–42 | The Frost Wardens hold the western road to the Emberthrone. The Stonehide giants are coming down off the peaks: the Glacier Throne's sleeper is waking. | d10 Rimefang Caverns; r02 attunement |
| 9 | **The Drowned Bell** | Drowned Coast | 40–48 | The Sunken Choir's song is a signal — every verse pulls the Veil thinner. The Drowned are digging toward the north cliffs. | d11 Saltdeep Cathedral; r03 attunement |
| 10 | **Unmade** | Riftmarch | 46–54 | The Riftwatch shows the player what the Veil looks like from underneath. In the Unmade Workshop, the King's artificers are building bodies for the Unmade to wear. Iris is taken. | d12 The Unmade Workshop |
| 11 | **Last Light** | Emberthrone | 52–60 | The last camp before the caldera. The player breaks Cindergate Bastion, frees Iris from the Ashen Reliquary and learns Ysa Varn's story. The King's final offer. | d13, d14, then the Ember King (r04 **or** the story instance *The King's Last Word*, see page 14) |
| 12 | **The Spire** | Veilspire | 60 | The Veil tears. The player carries the Ember Heart to the Spire. The Unwoven. | r05 Veilspire; `q_ms_the_last_lamp` |

**Recurring cast** (ids in §8): **Iris Vael** (`npc_iris_vael`, Lantern House scholar, the player's
guide through every chapter), **Garrick Holt** (`npc_garrick_holt`, a retired Warden who turns up at
the worst moments with a sword), **Ollin** (`npc_ollin_courier`, the courier who brings calling
letters), **Maelor Varn** (`npc_maelor_varn`, the Ember King, crowned **Kaedros** — as a projection until Ch 11; the raid boss is `b_ember_king_kaedros`), and
**Ysolde's Echo** (`npc_ysoldes_echo`, a light that speaks at each moonwell, waystone and the Spire
from Ch 6 on).

---

## 6. Factions

Wildmarch reuses Farhold's faction machinery — standing −100…+100, the five bands, rivals feel a third
of every deed, grip on a zone, patrols, caravans (reuse: `prototypes/farhold/js/factions.js`,
`js/territory.js`, `js/patrols.js`, `js/caravans.js`, `data/factions.json` bands and deeds). What
changes: the factions are **fixed and named for the Wildmarch** instead of scored onto a random
world, and each region has a **fixed holder** (canon §7). Page 07 owns the reputation screen and the
reward table; this page owns who the factions are.

### Standing bands (reuse, unchanged)

| Band | Range | Effect |
|---|---|---|
| Hunted | −100…−60 | Their guards and patrols attack on sight; their towns' gates shut to you |
| Disliked | −59…−20 | +40% prices, no quests from them, patrols challenge you |
| Known | −19…+19 | Default. List prices, ordinary quests |
| Trusted | +20…+59 | −15% prices, their patrols join your fights within 40 m, rank-1 reward |
| Sworn | +60…+100 | −30% prices, their stronghold vendor opens, rank-2 reward |

**Online change:** a player can never be Hunted by a hub town's holder through PvE deeds alone — the
floor from PvE deeds is −59 (Disliked), so no one locks themselves out of a hub. (Robbing caravans of
a hub's holder is still possible; it bottoms out at Disliked.)

### The factions

Kind: **H** = region holder (friendly), **G** = guild/trade faction (friendly, no land), **E** = enemy
(always hostile, standing cannot be raised), **N** = neutral-hostile (starts Disliked, can be raised).

| id | Name | Kind | Home | What they want | Rivals (a deed for one costs a third with these) | Reuse |
|---|---|---|---|---|---|---|
| `fac_vale_wardens` | The Vale Wardens | H | Hearthvale | Roads safe, barrows shut, harvest in | `fac_sootwick` (E) | reuse shape: Farhold `wardens_reach` |
| `fac_fenfolk` | The Fenfolk | H | Mossfen | To be left alone; their drowned kin put to rest | `fac_cutwater` (small, −⅙ not −⅓) | new |
| `fac_crown_assembly` | The Crown Assembly | H | Highcourt | The Covenant kept; the Lampbearer's Seat filled | `fac_ember_legion` (E) | new |
| `fac_deepforge_clans` | The Deepforge Clans | H | Greyridge | Their deep roads back; steel not sold north | `fac_stone_count`, `fac_deepworn` | new (absorbs Farhold `emberwrights` role: weapon branding) |
| `fac_sandsworn` | The Sandsworn | H | Sunscar | The tombs kept shut and their dead respected | `fac_longsight` (map the tombs = trespass) | new |
| `fac_moonwell_circle` | The Moonwell Circle | H | Whisperwood | The wells relit; the Thornmane cured, not killed | `fac_greenhand` (the woodcutters) | new |
| `fac_frost_wardens` | The Frost Wardens | H | Frostmantle | The western road held; the giants kept on the peaks | `fac_stonehide` (E) | new |
| `fac_riftwatch` | The Riftwatch | H | Riftmarch | The rifts measured, then closed | `fac_unwoven` (E) | new |
| `fac_greenhand` | The Greenhand | G | Hearthvale, Mossfen, Steppe herds | Everyone fed | `fac_ashtusk` (E), `fac_moonwell_circle` | reuse: Farhold `greenhand` |
| `fac_lantern_house` | The Lantern House | G | Highcourt chapterhouse | Every old thing catalogued; the truth of the Sealing | `fac_unwoven` | reuse: Farhold `lantern_house` |
| `fac_cutwater` | The Cutwater | G | Mossfen, Highcourt Low Wharf, Saltmarch | Free rivers, no tolls | `fac_stone_count`, `fac_saltbound` | reuse: Farhold `cutwater` |
| `fac_stone_count` | The Stone Count | G | Greyridge passes and bridges | Everything has a toll | `fac_cutwater`, `fac_deepforge_clans` | reuse: Farhold `stonecount` |
| `fac_quiet_wake` | The Quiet Wake | G | Every graveyard; Highcourt catacombs | The dead kept down | `fac_unburied` (E), `fac_the_drowned` (E) | reuse: Farhold `quiet_wake` |
| `fac_saltbound` | The Saltbound | G | Drowned Coast | The wrecks and the shore | `fac_cutwater` | reuse: Farhold `saltbound` |
| `fac_longsight` | The Longsight | G | Everywhere; Riftmarch office | Every place on a map | `fac_sandsworn` | reuse: Farhold `longsight` |
| `fac_ember_legion` | The Ember Legion | E | Emberthrone (warband levels 50–60, page 10); raids south to the Steppe | The Veil opened | all H factions | new (fills Farhold `ashen_pact`'s role) |
| `fac_the_drowned` | The Drowned | E | Drowned Coast, some of Mossfen | The Choir's song finished | `fac_quiet_wake`, `fac_saltbound` | new |
| `fac_unwoven` | The Unwoven | E | cult cells everywhere, strongest in Riftmarch | To be remade by the Unmade | `fac_riftwatch`, `fac_lantern_house` | new (Emberveil's Veil cult, renamed) |
| `fac_riftborn` | The Riftborn | E | Riftmarch, Veilspire, any rift | nothing a person can name | everyone | reuse role: Farhold `hollowed` |
| `fac_deepworn` | The Deepworn | N | Greyridge deep mines | To go deeper; to be left alone down there | `fac_deepforge_clans`, `fac_lantern_house` | reuse: Farhold `deepworn` |
| `fac_sootwick` | The Sootwick Gang | E | goblin warband, levels 2–18 | Anything left on a road | Vale Wardens, Fenfolk, Greenhand | reuse: Farhold warband `sootwick` |
| `fac_thornmane` | The Thornmane Packs | E | beastkin warband, levels 20–32 | Their hunting ground back | Moonwell Circle, Sandsworn | reuse: `thornmane` |
| `fac_unburied` | The Unburied Legion | E | undead warband, levels 12–24 | To keep marching | Quiet Wake, Frost Wardens | reuse: `unburied` |
| `fac_ashtusk` | The Ashtusk Horde | E | orc warband, levels 26–40 | Land that is not on fire | Greenhand, Crown Assembly | reuse: `ashtusk` |
| `fac_stonehide` | The Stonehide Clans | E | giant warband, levels 34–50 | The peaks, and everything below them | Frost Wardens | reuse: `stonehide` |

**Warband levels are rescaled for Wildmarch** (Farhold: Sootwick 1–16, Ashtusk 5–24, Thornmane 9–28,
Unburied 14–36, Stonehide 20–50). The table above uses page 10's bands (00 §10): Sootwick 2–18,
Unburied 12–24, Thornmane 20–32, Ashtusk 26–40, Stonehide 34–50, Ember Legion 50–60. Where a warband
shows up in each region is page 10's *warband presence* line; the region sections below follow it. The
**Ashtusk defector arc** (Ch 7) lets a player raise `fac_ashtusk` from Hunted to Known for one camp,
**Ghara's Camp** in the Cinder Steppe (§8.6) — the one warband door that opens.

### Relations at a glance

`+` allied, `·` neutral, `−` rival (deeds cost a third), `X` at war (kill on sight).

| | Wardens | Fenfolk | Crown | Deepforge | Sandsworn | Moonwell | Frost W. | Riftwatch | Legion |
|---|---|---|---|---|---|---|---|---|---|
| **Vale Wardens** | | + | + | · | · | · | + | · | X |
| **Fenfolk** | + | | · | · | · | + | · | · | X |
| **Crown Assembly** | + | · | | + | − | · | + | + | X |
| **Deepforge Clans** | · | · | + | | · | − | + | · | X |
| **Sandsworn** | · | · | − | · | | · | · | · | X |
| **Moonwell Circle** | · | + | · | − | · | | · | + | X |
| **Frost Wardens** | + | · | + | + | · | · | | · | X |
| **Riftwatch** | · | · | + | · | · | + | · | | X |

Why the odd ones: the **Sandsworn** resent the Crown for looting their tombs in 140 AS (a museum in
Highcourt still displays three breath-jars); the **Moonwell Circle** and the **Deepforge Clans** have
argued for 300 years over which of them lit the Everflame.

---

## 7. Playable races and their homelands

Four playable races (canon §4), all Farhold's Chibi 2 body presets (reuse:
`prototypes/farhold/js/bodypresets.js`). **Every character starts in Brightwater** (canon §1): the
Vale Wardens' muster at the Hearthstone is where every new adventurer on the continent signs up — the
game's opening line says so. Race changes the first scene's greeting, a starting cosmetic, a racial
homeland you are welcomed in, and a small racial perk (page 07 owns perks).

| Race | Body preset | Homeland (town id) | Why they are in Brightwater | Starting cosmetic | Homeland welcome | Voice baseline |
|---|---|---|---|---|---|---|
| **Human** | `human` | Hearthvale + Highcourt (`town_brightwater`) | They live here | Warden's grey hood | The Crown's quartermaster in Highcourt gives a free bag at level 10 | `villager` jitter 0.15 |
| **Halfling** | `halfling` | Oakhollow burrows in Hearthvale (`town_oakhollow`) | Lampbearer's kin; every halfling walks the Lamp Road once | a brass lamp charm (hip) | Oakhollow's Hearth Speaker gives a pie that restores 100% health once a day (cosmetic buff icon) | `villager` pitch +0.12, speed +0.05 |
| **Dwarf** | `dwarf` | Anvilgate, Greyridge (`town_anvilgate`) | Sent south by their clan to "learn how the soft folk fight" | a clan braid-ring | Anvilgate's First Forge rebrands one weapon's look free (cosmetic) | `warrior`-ish depth +0.1 |
| **Elf** | `elf` | Silverbough, Whisperwood (`town_silverbough`) | Watching the Veil from the south, as the Circle asked | a leaf-silver circlet | Silverbough opens its moonwell pool: a 2-hour rested bonus | `mage`-ish tone +0.1, speed −0.05 |

The five **enemy races** (Orc, Goblin, Giant, Undead, Beastkin) are Farhold's Chibi 2 warband races
(reuse: `avatar-3d/js/chibi2-races.js`, `data/warbands.json`) and appear only as enemies — except Ghara
and her camp (§8.6), which are orcs you can talk to.

---

## 8. The regions

Every region below follows the same pattern:

- **At a glance** — id, levels, hub, holder, size, culture of its towns (a proctown culture, reuse:
  `proctown/js/townplan.js` `CULTURES`), music mood, Veil pressure.
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
- **Dungeon / raid entrances and world boss site** — ids from canon; content on pages 12 and 13.
  World boss names here are page 13's (§8.5; they reuse Farhold's `data/worldbosses.json` names where
  they fit); page 13 owns them.
- **Weather** — percent chance each weather state is rolled (reuse: `worldgen/js/weather.js` states;
  `ionstorm` is renamed **Veilstorm** for Wildmarch).
- **Music** — mood, instruments, tempo, key. Page 17 owns the actual tracks.

Service codes used in the settlement tables:
`WS` waystone · `IN` inn (rest, hearth-bind) · `SM` smith (repair, sell weapons/armour) ·
`GM` general merchant · `RG` reagents/consumables · `ST` stable · `SK` skyway roost · `FY` ferry/boat ·
`BX` banker's box (bank access) · `MB` mailbox · `NB` notice board (jobs) · `BR` mercenary broker
(followers) · `UB` Unbinder (retraining) · `GA` gambler (sealed crates) · `CH` chapel (revive point,
curse removal) · `TR` trainer (spell talents explained; class training is Highcourt only) ·
`BN` crafting bench (reuse: Farhold `js/craft.js`) · `RV` reputation vendor.

---

### 8.1 Hearthvale — `hearthvale`

| At a glance | |
|---|---|
| Levels | 1–6 |
| Hub | Brightwater (`town_brightwater`) |
| Held by | `fac_vale_wardens` |
| Size | 4.0 × 3.0 km; the Wend runs north→south down the middle into the Hearthsea |
| Town culture | `human` (timber, thatch, jettied upper storeys); Oakhollow `halfling` |
| Veil pressure | 0.05 (the Veil-light is not visible from here) |
| Music | Pastoral: lute, recorder, fiddle drone; 84 BPM; major key. Night: solo harp, low strings, 60 BPM |
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
| `town_brightwater` | Brightwater | hub town, walled (palisade), river port on the Hearthsea | 4 | human | WS IN SM GM RG ST(no mounts until 10) BX MB NB BR CH TR BN; the Hearthstone; the Warden drill yard |
| `town_oakhollow` | Oakhollow | halfling burrow village, hedge boundary | 2 | halfling | WS IN GM MB NB RV(halfling homeland) |
| `town_millbrook` | Millbrook | river hamlet with a mill | 2 | human | IN GM NB |
| `town_harrow_watch` | Harrow Watch | Warden outpost on the downs, wooden tower + stockade | 1 | human | WS GM NB CH |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_hearthstone` | The Hearthstone | wayshrine (special) | The first waystone on the continent, in Brightwater's square; where Ysolde lit her lamp. Hearth-bind point for new characters. |
| `lm_ysoldes_well` | Ysolde's Well | wayshrine | A stone well with a lamp niche; drinking gives *Lampwater* (+5% XP for 30 min, once a day). |
| `lm_calling_stones` | The Calling Stones | standing_stones | Thirty worn stones, one carved for each class; where every **first calling quest** (level 6) ends. |
| `lm_old_mill_wheel` | The Old Wheel | broken_road | A washed-out mill race on the east road; repairing it (a Millbrook side quest) shortens the road by 300 m for everyone for a day (world state, page 14 events). |
| `lm_harrow_beacon` | Harrow Beacon | beacon | Lighting it calls the Warden patrol; used by the *Barrow Night* event. |
| `lm_southwood_gibbet` | The Southwood Gibbet | gibbet | Names the Hedge Knives' leader and starts his bounty. |
| `lm_barrow_cairns` | The Forty Barrows | cairn_field | Digging a cairn gives a rare item and starts the *Restless Dead* incident in the downs for 3 real hours. |
| `lm_toll_bridge_wend` | Wend Bridge | toll_bridge | 2 copper toll, Stone Count; ford upstream is free and has river crabs. |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_odile_marsh` | Warden-Captain Odile Marsh | Vale Wardens commander | Brightwater drill yard | `warrior` f | Prologue + Ch 1 giver; the muster; group finder and dungeon journal (`q_hv_the_barrow_bell`, level 6) |
| `npc_bram_fenwick` | Elder Bram Fenwick | town elder | Brightwater hall | `elder` m | Side quests; the town's worries |
| `npc_hesk` | Drillmaster Hesk | Warden drillmaster | Brightwater drill yard | `fighter` m | **Dodge roll lesson** (`q_hv_fall_and_rise`, level 5; page 07 names this giver `npc_hv_drillmaster_corran`), combat dummies |
| `npc_sister_wren` | Sister Wren | chapel keeper | Brightwater chapel | `cleric` f | Revive point, curse removal, the perk-forest introduction |
| `npc_marta_coll` | Marta Coll | general merchant | Brightwater market | `merchant` f | Shop, buyback |
| `npc_dunmore` | Dunmore | smith | Brightwater forge | `brute` m | Repairs; the forge (salvage and forging open at 9 in Reedhollow, `q_mf_what_the_fen_gives_back`) |
| `npc_ned_barrow` | Ned Barrow | mercenary broker | the Lamp and Ladder inn | `villager` m | Hires followers once you have a slot (the first slot comes at 8 from `npc_mf_broker_wendel` in Reedhollow) |
| `npc_hv_runner_tamsin` | Tamsin | Brightwater's message runner | Brightwater square | `villager` f | **Sprint** (`q_hv_the_long_field`, level 2; page 07) |
| `npc_hv_herbwife_orla` | Orla | the orchard herbwife | the Old Orchards | `villager` f | **Potion belt** (`q_hv_the_herbwifes_basket`, level 3; page 07) |
| `npc_hv_innkeeper_bram` | Bram | innkeeper of the Lamp and Ladder | the Lamp and Ladder | `merchant` m | **Homeward Stone** (`q_hv_a_bed_by_the_fire`, level 7; page 07) |
| `npc_iris_vael` | Iris Vael | Lantern House scholar | arrives in Brightwater in the prologue; travels | `mage` f | Main story guide, every chapter *(reuse name: Emberveil)* |
| `npc_garrick_holt` | Garrick Holt | retired Warden | Harrow Watch | `warrior` m | Ch 1; turns up again in Ch 4, 7, 11 *(reuse name: Emberveil)* |
| `npc_pip_underbough` | Pip Underbough | Hearth Speaker of Oakhollow | Oakhollow | `elder` f pitch +0.12 | Halfling homeland welcome; orchard side quests |
| `npc_tansy_miller` | Tansy Miller | the Millbrook miller | Millbrook | `villager` f | Side quests; the Old Wheel |
| `npc_ollin_courier` | Ollin | courier of the Hall of Callings | anywhere on a road | `rogue` m | Brings the level-6 calling letter; reappears for 20 and 40 |
| `npc_hollis_crane` | Hollis Crane | leader of the Hedge Knives | the Southwood (enemy, rare) | `brute` m | Bounty target |

**Factions present:** `fac_vale_wardens` (holder, grip 0.9), `fac_greenhand`, `fac_lantern_house`,
`fac_stone_count` (one bridge), `fac_quiet_wake` (downs). Hostile: `fac_sootwick`, the Hedge Knives
(a local humanoid bandit band, not a faction — no standing).

**Enemies by family:** beast (field rats, crows, boars, orchard wasps, wolves, spiders, river crabs) ·
humanoid (Hedge Knives bandits) · goblin warband (Sootwick scavengers, hexers, cutpurses) · undead
(barrow stragglers, barrow wights in the downs only). **Rare elites:** *Bramblecoat*, a thorn-grown
boar the size of a cart (level 5, reuse name: Farhold world boss tier 1, demoted to rare elite) ·
*Hollis Crane* (level 5). **No world boss** (canon: world bosses from region 3 up).

**Dungeon:** `d01_hollow_barrow` — the biggest barrow on the downs, its doorstone lying flat (reuse:
Farhold setpiece `inst_doorstone_barrow`). Entrance at the downs' east edge, 400 m from Harrow Watch.

**Night:** the downs double their undead spawns; field rats become *Barrow Rats* (undead variant) within
200 m of any barrow.

---

### 8.2 Mossfen — `mossfen`

| At a glance | |
|---|---|
| Levels | 5–12 |
| Hub | Reedhollow (`town_reedhollow`) |
| Held by | `fac_fenfolk` |
| Size | 4.5 × 3.0 km, east of Hearthvale; the Slowwater winds through it and never reaches the sea |
| Town culture | **`fen`** *(new proctown culture: halfling street grammar + the `stilted` house base, boardwalk streets, reed roofs, no wall — see §15)* |
| Veil pressure | 0.08 |
| Music | Reed pipes, frame drum, a bowed psaltery; 72 BPM; Dorian mode. Night: the drum stops, frogs and a single low flute |
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
| `town_reedhollow` | Reedhollow | hub, stilt town on boardwalks | 4 | fen | WS IN SM GM RG FY BX MB NB BR CH TR BN |
| `town_peatmoor` | Peatmoor | peat-cutters' village | 2 | fen | IN GM NB |
| `town_stillwater_landing` | Stillwater Landing | ferry post on the Slowwater, Cutwater ground | 1 | human | FY GM NB RV(Cutwater) |
| `town_ninewillow` | Ninewillow | hamlet on an island of nine trees | 1 | halfling | WS IN NB |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_stillwater_ferry` | Stillwater Ferry | ferry_landing | The punt to Highcourt's Low Wharf; `q_unlock_boats` |
| `lm_sunken_shrine` | The Sunken Shrine | wayshrine | Half underwater; rest, revive a follower once a day |
| `lm_lamp_posts` | The Lamp Posts | beacon | Twelve posts on the causeway; lighting all twelve at dusk banishes the false lights for 1 real hour (event hook) |
| `lm_hagsbog_ring` | The Hag Ring | standing_stones | Puzzle: turn the six stones so their carvings face the moon; +1 perk point (once per character; reuse Farhold `perkPoint`) |
| `lm_peat_wreck` | The Peat Barge | sunken_wreck | Dive loot; the Cutwater want the cargo back |
| `lm_drowned_bell` | The Drowned Bell | gibbet (variant) | A bell on a post in the water that rings on its own; ringing it on purpose spawns a Drowned champion |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_mother_ilse` | Mother Ilse | Fen-Speaker, leader of the Fenfolk | Reedhollow long hall | `elder` f | Ch 2 giver |
| `npc_corwin_reed` | Corwin Reed | ferryman, Cutwater | Stillwater Landing | `rogue` m | Boats (`q_unlock_boats`, level 9); smuggling side quests |
| `npc_mf_broker_wendel` | Wendel | mercenary broker | Reedhollow | `merchant` m | **First follower slot** (`q_mf_coin_for_a_blade`, level 8; page 07) |
| `npc_mf_scrapwright_hesk` | Hesk the Scrapwright | salvager and forge-hand | Reedhollow | `brute` m | **Salvage and the forge** (`q_mf_what_the_fen_gives_back`, level 9; page 07). *Name clashes with Drillmaster Hesk — see §15* |
| `npc_brother_aldo` | Brother Aldo | Quiet Wake grave-tender | Reedhollow chapel barge | `cleric` m | Drowned dead side quests; revive point |
| `npc_neve_hollis` | Neve Hollis | herbalist (hedge-witch wanderer kind) | edge of the Lantern Marsh | `mage` f | Gathering quests, temporary blessings |
| `npc_tobin_brack` | Tobin Brack | the drowned miller's son | Drowned Mill Reach | `child` m | Ch 2; the reason to enter d02 |
| `npc_saskia_venn` | Saskia Venn | Cutwater smuggler captain | Peatmoor | `rogue` f | Cutwater reputation line |
| `npc_old_gammer_tull` | Old Gammer Tull | eldest of the Mire Sisters (enemy, rare) | Hagsbog | `cultist` f | Bounty target; talks before the fight |

**Factions present:** `fac_fenfolk` (holder, 0.8), `fac_cutwater`, `fac_quiet_wake`, `fac_greenhand`.
Hostile: `fac_sootwick`, the Mire Sisters (local cult band, members of `fac_unwoven`), first
`fac_the_drowned`.

**Enemies by family:** beast (bog frogs, mire gators, leech swarms, marsh wolves, heron-kings) ·
humanoid (Mire Sisters) · goblin (Sootwick) · undead (drowned dead, bog-bodies) · elemental (will-o-lights,
harmless until you follow one). **Rare elite:** *The Reedmother*, a heron-and-reed thing 5 m tall
(level 11, reuse name: Farhold world boss tier 1).

**Dungeon:** `d02_drowned_mill` — a mill whose wheel still turns under the water (reuse name + layout:
Farhold instance `drowned_mill`, setpiece `inst_drowned_mill`).

**Night:** will-o-lights double; following one for 20 m spawns a Mire Sister ambush of 3.

---

### 8.3 Greyridge Highlands — `greyridge`

| At a glance | |
|---|---|
| Levels | 10–18 |
| Hub | Anvilgate (`town_anvilgate`) |
| Held by | `fac_deepforge_clans` |
| Size | 5.0 × 4.0 km; broken highland running east–west; the Kettle Pass in the south, the Bellows Heights in the north |
| Town culture | `dwarf` (cut stone, flat lead roofs, terraces); Kettle Pass and Stonebridge `human` |
| Veil pressure | 0.12 (the Veil-light is first visible from the Bellows Heights) |
| Music | Low brass, male chant, anvil-strike percussion; 90 BPM; natural minor. Night: a single horn and wind |
| Feel | Slate, heather, quarries cut in terraces, rail lines, smoke from Bellows Keep on the skyline. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_kettle_pass` | The Kettle Pass | 10–12 | The one road north from Highcourt; waystation; ridge rams, Sootwick raiders, Stone Count tolls. |
| `sz_cutstone_quarries` | Cutstone Quarries | 12–14 | Terraced quarries; stone constructs gone rogue, rock lizards, a Sootwick warren. |
| `sz_deepdelve_slopes` | Deepdelve Slopes | 13–16 | Mine heads and rail lines; the Deepworn coming up. **d03 Deepdelve Mines.** |
| `sz_highcairn_moors` | Highcairn Moors | 14–17 | High moor of cairns and old barrow-roads; the Unburied Legion's first ranks. |
| `sz_bellows_heights` | Bellows Heights | 16–18 | The fortress-forge over the north road; smoke, slag, silence. **d04 Bellows Keep.** **World boss site.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_anvilgate` | Anvilgate | hub, a great gate cut into the hillside with blockhouses outside | 5 | dwarf | WS IN SM GM RG ST SK(from 25) BX MB NB BR UB CH TR BN RV(dwarf homeland); the First Forge (weapon branding, reuse Farhold `brand`) |
| `town_kettle_pass` | Kettle Pass Waystation | walled waystation on the pass | 2 | human | WS IN GM ST NB |
| `town_cutstone` | Cutstone | quarry town | 3 | dwarf | IN SM GM NB BN |
| `town_highcairn` | Highcairn | moor village inside a ring of cairns | 2 | human | WS IN NB CH |
| `town_stonebridge` | Stonebridge | toll town on a three-arch bridge, Stone Count seat | 2 | human | GM NB RV(Stone Count) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_kettle_watchtower` | Kettle Watchtower | watchtower | Reveals the region map |
| `lm_first_forge_fire` | The Hill Forge | forge_fire | A crafting bench outside town |
| `lm_old_rail_collapse` | The Old Seam | collapsed_mine | Dig out over three visits → a hidden instance, *the Old Seam* (reuse: Farhold instance `slumped_adit`) |
| `lm_highcairn_stones` | The Nine Cairns | standing_stones | Puzzle; +1 perk point (once per character) |
| `lm_stonebridge_toll` | Stonebridge | toll_bridge | 8 copper; Stone Count |
| `lm_ironmuster_field` | The Ironmuster | (world boss arena, reuse: Farhold setpiece `boss_ironmuster`) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_hilda_ironbraid` | Thane Hilda Ironbraid | Deepforge Thane of Anvilgate | Anvilgate throne hall | `warrior` f depth +0.1 | Ch 4 giver |
| `npc_bodric_ashlock` | Forgemaster Bodric Ashlock | master of the First Forge | Anvilgate | `brute` m | Branding; Bellows Keep quests; **the upgrade bench** (`q_gr_the_second_hammer`, level 16; page 07 names this giver `npc_gr_forgemaster_brunhild`) |
| `npc_gruna_delver` | Gruna the Delver | mine guide | Deepdelve Slopes | `villager` f | Ch 4; d03 lead-in |
| `npc_jessup_cole` | Quarrymaster Jessup Cole | quarry boss | Cutstone | `merchant` m | Side quests |
| `npc_count_ambrose_penn` | Count Ambrose Penn | Stone Count of Stonebridge | Stonebridge | `elder` m | Stone Count line; tolls |
| `npc_moira_cairnwife` | Moira the Cairnwife | Quiet Wake keeper of the cairns | Highcairn | `cleric` f | Unburied side quests |
| `npc_kell_ironjaw` | Kell Ironjaw | Deepworn speaker (neutral-hostile) | deep in Deepdelve Slopes | `undead` m (hollow) | The Deepworn reputation door |

**Factions present:** `fac_deepforge_clans` (holder, 0.75), `fac_stone_count`, `fac_quiet_wake`,
`fac_deepworn` (N). Hostile: `fac_sootwick`, `fac_unburied`, Kindled buyers (`fac_ember_legion`,
only in Ch 4 quests).

**Enemies by family:** construct (quarry constructs, rune sentinels, bellows golems) · beast (ridge
rams, cave bears, rock lizards, crag eagles) · goblin (Sootwick sappers) · aberration (Deepworn
diggers, Deepworn speakers) · undead (Unburied footmen, barrow-road wights). **Rare elites:**
*Gravel-Tusk*, a stone-crusted boar (level 15, reuse name: Farhold world boss tier 1).

**Dungeons:** `d03_deepdelve` (mine head in Deepdelve Slopes) · `d04_bellows_keep` (the fortress on
the Bellows Heights; its gate faces the north road).

**Raid:** `r01_barrowking` — canon: region Greyridge, **entrance in the Highcourt catacombs** (§9). The
barrow-roads run from under Highcourt north beneath the ridge; the raid's last rooms are physically
under the Highcairn Moors, and a sealed door at `lm_highcairn_stones` is its back entrance (opens after
the first kill, as a shortcut out).

**World boss site:** `wb_site_ironmuster` on the Bellows Heights — **Grief-in-Iron** (page 13 §8.5.1)
(`b_grief_in_iron`, a runic war-engine the Deepforge built and could not stop; level 21; reuse name:
Farhold world boss tier 2).

---

### 8.4 Sunscar Barrens — `sunscar`

| At a glance | |
|---|---|
| Levels | 16–24 |
| Hub | Oasis of Tamar (`town_oasis_of_tamar`) |
| Held by | `fac_sandsworn` |
| Size | 5.0 × 5.0 km, west of the Greyridge |
| Town culture | `desert` (mud brick, flat roofs, courtyards, wind-catchers, a covered bazaar) |
| Veil pressure | 0.18 |
| Music | Oud, frame drum, hand claps, a low drone; 96 BPM; Phrygian mode. Night: drone and wind chimes only |
| Feel | Red mesas, white salt pans, black glass flats that ring when walked on, heat haze by day, very cold at night. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_tamar_oasis` | Tamar Oasis | 16–18 | Palms, gardens and the hub; sand vipers, scavenging Ember Fennec packs (page 10). |
| `sz_redmesa` | The Redmesa | 17–20 | Mesas and slot canyons; stone scorpions, mesa raptors, an Ashtusk scouting camp. |
| `sz_glass_flats` | The Glass Flats | 19–22 | A plain of black glass; glass constructs, glass-burned dead. **d05 The Glass Tombs.** **World boss site** (the Shattered Pan, south of the Tombs). |
| `sz_dune_sea` | The Dune Sea | 20–24 | Moving dunes; sand wyrms (snake body) surface under the player; buried ruins uncovered by sandstorms. |
| `sz_hushed_valley` | The Hushed Valley | 22–24 | The valley of kings' tombs; the Sallow Court. **d06 Vault of the Sandsworn.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_oasis_of_tamar` | Oasis of Tamar | hub, a walled oasis town round a stepped well | 5 | desert | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN; covered bazaar with a gambler (GA) |
| `town_saltwell` | Saltwell | salt-pan camp | 2 | desert | IN GM NB |
| `town_redmesa_post` | Redmesa Post | Crown trading post on a mesa top | 2 | human | WS GM ST NB |
| `town_dunehold` | Dunehold Caravanserai | caravanserai at the edge of the Dune Sea | 3 | desert | WS IN GM ST NB RV(Sandsworn) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_stepped_well` | The Stepped Well | wayshrine | Rest; cures *Heatstroke* (Sunscar-only daytime status, page 05) |
| `lm_mesa_watch` | Mesa Watch | watchtower | Reveals the region |
| `lm_glass_scar` | The Glass Scar | cairn_field (variant) | Where the Sunscar burned in the Hollowing War; digging turns up breath-jars (quest items) and starts *Restless Dead* |
| `lm_buried_gate` | The Buried Gate | collapsed_mine (variant) | Uncovered only during a sandstorm event; an instance (reuse: Farhold `sealed_strongroom`) |
| `lm_breath_museum_site` | The Emptied Tomb | burnt_farm (variant) | The tomb the Crown looted in 140 AS; side quest to return the jars |
| `lm_sallow_throne` | The Sallow Throne | cairn_field (variant) | The Sallow Court's empty seat in the Hushed Valley; the Sallow Herald keeps it |
| `lm_shattered_pan` | The Shattered Pan | (world boss arena) | World boss site, a salt flat south of the Glass Tombs (page 13 §8.5.2) |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_idris_kaan` | Sandspeaker Idris Kaan | speaker of the Sandsworn | Tamar, the well court | `elder` m | Ch 5 giver |
| `npc_zelde_marrach` | Zelde Marrach | caravan master | Dunehold | `merchant` f | Escort and caravan quests; **Riding II** (`q_ss_the_sand_runners`, level 20; page 07 names this giver `npc_ss_caravan_master_idris` in Tamar) |
| `npc_nahir_tombwarden` | Nahir | tomb-warden | the Hushed Valley | `cleric` m | d05/d06 lead-in |
| `npc_orsa_glassblower` | Orsa | glassblower | Tamar bazaar | `villager` f | Glass-flat side quests; cosmetic glass charms |
| `npc_captain_dray_holloway` | Captain Dray Holloway | Crown factor at Redmesa Post | Redmesa Post | `fighter` m | Crown-vs-Sandsworn side line |
| `npc_sallow_herald` | The Sallow Herald | voice of the Sallow Court (enemy) | the Hushed Valley | `undead` m | Taunts; the Court's warning bell |

**Factions present:** `fac_sandsworn` (holder, 0.7), `fac_crown_assembly` (Redmesa Post only),
`fac_longsight`. Hostile: `fac_thornmane` (on the mesas, 20+), `fac_unburied` (at the tomb edges,
19–24; page 10), `fac_ashtusk` scouts, the Sallow Court (undead, the Sallow King's old court, not a
faction).

**Enemies by family:** beast (sand vipers, stone scorpions, mesa raptors, sand wyrms, vultures) ·
beastkin warband (Thornmane jackal-kin, on the mesas from 20) · construct (glass constructs, jar-guardians) · undead (sallow
mummies, glass-burned dead) · elemental (dust devils, glass shards) · orc (Ashtusk scouts).

**Dungeons:** `d05_glass_tombs` (Glass Flats) · `d06_sandsworn_vault` (Hushed Valley).

**World boss site:** `wb_site_shattered_pan` at `lm_shattered_pan` in the Glass Flats — **The Glass
Wyrm** (`b_glass_wyrm`, a sand-worm plated in glass; level 27; page 13 §8.5.2).

**Weather rule:** Sunscar is the only region with *Heatstroke* by day (clear/fair weather, 12:00–16:00
game time, outside shade: −1% max health a minute, max −20%; page 05).

---

### 8.5 Whisperwood — `whisperwood`

| At a glance | |
|---|---|
| Levels | 22–30 |
| Hub | Silverbough (`town_silverbough`) |
| Held by | `fac_moonwell_circle` |
| Size | 4.5 × 5.0 km, east of the Greyridge, north of Mossfen (the Mossfen–Whisperwood border is a 40 m cliff with one stair, the **Rootstair**) |
| Town culture | `elf` (grown, curved eaves, bridges between trunks, living hedge boundary); Hartsrest `human` |
| Veil pressure | 0.22 |
| Music | Harp, glass harmonica, female choir without words; 70 BPM; Lydian mode. Night: choir only, very quiet |
| Feel | Trees 60 m tall, silver bark, moonwells glowing blue at night, paths that shift (a path's side branches reroll every real hour). |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_silverbough_eaves` | Silverbough Eaves | 22–24 | The hub's outer wood; deer, owls, the first Thornmane packs. |
| `sz_moonwell_glades` | The Moonwell Glades | 24–27 | The two lit moonwells and their glades; fey wisps, spirit stags. |
| `sz_thornheart` | Thornheart | 25–28 | A briar forest grown round a rotten heart-tree; Rotbloom plants. **d07 Thornheart Hollow.** |
| `sz_fey_crossing` | The Fey Crossing | 26–29 | Where the wood touches the Veil; mushrooms, shard-wisps, a stone circle that moves. **World boss site.** |
| `sz_hollow_roots` | The Hollow Roots | 28–30 | The dark moonwell's glade; dead trees, the Dimming. **d08 Ruins of the Moonwell.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_silverbough` | Silverbough | hub, a canopy city built round and between trunks, two levels | 5 | elf | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN RV(elf homeland) |
| `town_moonfall_glade` | Moonfall Glade | glade shrine-village at a moonwell | 2 | elf | WS IN NB CH |
| `town_thistlemere` | Thistlemere | lake village | 2 | elf | IN GM FY NB |
| `town_hartsrest` | Hartsrest | human woodcutters' camp (Greenhand) | 2 | human | WS GM NB BN RV(Greenhand) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_eastmoon_well` | The Eastmoon Well | wayshrine (special) | Lit moonwell; rest; Ysolde's Echo first speaks here (Ch 6) |
| `lm_westmoon_well` | The Westmoon Well | wayshrine (special) | Going dark during Ch 6; restored at chapter end |
| `lm_hunting_blind_harts` | Hart's Blind | hunting_blind | Calls a champion spirit stag |
| `lm_walking_circle` | The Walking Circle | standing_stones | The circle is somewhere else every real hour (one of 5 spots); finding and solving it: +1 perk point once |
| `lm_rootstair` | The Rootstair | broken_road | The stair up from Mossfen; repaired in a side quest (world state) |
| `lm_brood_hollow` | Brood Hollow | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_aelith_moonward` | Circle-Keeper Aelith Moonward | head of the Moonwell Circle | Silverbough, the Circle's hall | `cleric` f tone +0.1 | Ch 6 giver |
| `npc_sorrel_ashwood` | Ranger-Captain Sorrel Ashwood | captain of the Silverbough rangers | Silverbough Eaves | `ranger` m | Thornmane quests |
| `npc_hobb_greenhand` | Hobb | woodcutter foreman | Hartsrest | `villager` m | Greenhand vs Circle side line |
| `npc_ysoldes_echo` | Ysolde's Echo | a light that speaks | every moonwell, later waystones and the Spire | `narrator` pitch +0.2 | Story voice from Ch 6 on |
| `npc_thane_of_thorns` | The Heartrot | the rotten heart-tree's voice (enemy) | Thornheart | `demon` (slowed) | d07 lead-in taunts |
| `npc_greyfang` | Greyfang | a Thornmane packmother who can still talk | the Fey Crossing | `brute` f | The "cure, not kill" side line |
| `npc_ww_glamourist_eluned` | Eluned | glamourist | Silverbough | `mage` f | **The wardrobe** (`q_ww_the_moonwell_mirror`, level 25; page 07) |

**Factions present:** `fac_moonwell_circle` (holder, 0.65), `fac_greenhand` (Hartsrest). Hostile:
`fac_thornmane` (strongest here), `fac_unwoven` (a cell in the Hollow Roots), the Rotbloom (plant
creatures, no faction).

**Enemies by family:** beastkin warband (Thornmane packs: runners, howlers, packlords) · beast
(spiders, wolves, giant owls, stags) · elemental (Rotbloom treants, thornlings, fey wisps) ·
aberration (shard-wisps from the Veil) · humanoid (Unwoven cultists).

**Dungeons:** `d07_thornheart` (Thornheart) · `d08_moonwell_ruins` (Hollow Roots).

**World boss site:** `wb_site_brood_hollow` in the Fey Crossing — **The Hungering Brood** (page 13 §8.5.3)
(`b_hungering_brood`, a spider-queen and her endless young; level 33; reuse name: Farhold world boss
tier 2).

---

### 8.6 Cinder Steppe — `cinder_steppe`

| At a glance | |
|---|---|
| Levels | 28–36 |
| Hub | Fort Ashfall (`town_fort_ashfall`) |
| Held by | **contested** — `fac_crown_assembly` holds the fort (grip 0.5), `fac_ashtusk` holds the east (warband grip 0.8) |
| Size | 8.0 × 3.5 km, the widest region: the whole middle of the continent north of the Greyridge |
| Town culture | Fort Ashfall `human` military; Tallgrass `human`; Ghara's Camp `orc` |
| Veil pressure | 0.35 (the Veil-light is a clear band every night) |
| Music | War drums, low horns, throat singing, distorted fiddle; 104 BPM; minor. Night: embers crackling, one horn, wind |
| Feel | Endless grass going grey toward the north, black burn-scars, orc trophy poles, smoke columns, the volcanoes on the horizon. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_ashfall_marches` | The Ashfall Marches | 28–30 | Grass round the fort; ash hyenas, Ashtusk outriders. |
| `sz_blackgrass` | Blackgrass | 30–32 | Burnt grassland; fire elementals, the Tallgrass herders under attack. |
| `sz_warmasters_ground` | The Warmaster's Ground | 31–34 | The Ashtusk fighting pits and their main camp. **d09 The Warmaster's Pit.** |
| `sz_charred_barrows` | The Charred Barrows | 33–36 | Burnt barrow-field; Burnt Wanderers rising at night (page 10). **World boss site.** |
| `sz_ashtusk_holds` | The Ashtusk Holds | 34–36 | The Horde's war camps (warband strongholds tier 3); the first Ember Legion camp. |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_fort_ashfall` | Fort Ashfall | hub, a stone fort with a curtain wall, barbican and siege damage | 4 | human | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN RV(Crown) |
| `town_tallgrass` | Tallgrass | herders' tent town (moves: 3 spots, one per real day) | 2 | human | IN GM NB RV(Greenhand) |
| `town_ghara_camp` | Ghara's Camp | an Ashtusk defectors' camp; opens after Ch 7 quest `q_ms_the_defector` | 2 | orc | WS GM NB RV(Ashtusk, the only one) |
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
| `npc_bex_quartermaster` | Bex | quartermaster | Fort Ashfall | `merchant` f | Supply quests; Crown reputation vendor |
| `npc_ghara` | Ghara Two-Tusks | Ashtusk defector chief | Ghara's Camp | `brute` f | Ch 7 ally; orc side line |
| `npc_olwen_herdmother` | Herdmother Olwen | Tallgrass herders' elder | Tallgrass | `elder` f | Greenhand line |
| `npc_kestrel` | Kestrel | Crown scout | anywhere on the steppe | `ranger` m | Scouting quests |
| `npc_torvak_overchief` | Torvak, the Ashtusk Overchief | warlord (enemy) | the Ashtusk Holds | `brute` m | Warband warlord, fought as `b_ashtusk_overchief` (page 10; reuse: Farhold `ashtusk_overchief`); Ch 7 target |
| `npc_cs_runewright_gorsa` | Gorsa | runewright of the fort's forge | Fort Ashfall | `brute` f | **The upgrade bench, second voice** (`q_cs_brands_in_the_ash`, level 34; page 07) |

**Factions present:** `fac_crown_assembly` (fort), `fac_greenhand` (Tallgrass), `fac_ashtusk` (hostile
except Ghara's Camp). Hostile: `fac_ashtusk`, `fac_ember_legion` (from level 33).

**Enemies by family:** orc warband (Ashtusk raiders, archers, shamans, war-chiefs, the Overchief) ·
beast (ash hyenas, steppe lions, carrion birds) · elemental (fire elementals, cinder wisps) · dragonkin
(war drakes ridden by Legion outriders, from 33) · undead (Burnt Wanderers) · humanoid (Ember
Legion scouts).

**Dungeon:** `d09_warmasters_pit`.

**World boss site:** `wb_site_carrion_mound` in the Charred Barrows — **The Carrion Crown** (page 13 §8.5.4)
(`b_carrion_crown`, a vast carrion bird wearing a dead king's crown; level 39; reuse name: Farhold
world boss tier 4).

---

### 8.7 Frostmantle — `frostmantle`

| At a glance | |
|---|---|
| Levels | 34–42 |
| Hub | Rimehold (`town_rimehold`) |
| Held by | `fac_frost_wardens` |
| Size | 5.0 × 6.0 km, the north-west; the western road to the Emberthrone runs up its eastern edge |
| Town culture | `human` northern variant (timber longhouses, turf roofs, stone plinths) — a proctown palette, not a new culture; Rimehold's inner keep `dwarf` |
| Veil pressure | 0.45 |
| Music | Low strings, bowed lyre, deep male choir, war horns; 66 BPM; Aeolian. Night: wind, creaking ice, a lone voice |
| Feel | Tundra, glaciers, blue ice caves, giants' stairs cut into the peaks, the aurora mixing with the Veil-light. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_rimehold_valley` | Rimehold Valley | 34–36 | The hub's valley; frost wolves, snow elk, Ashtusk raiders from the southern passes (page 10). |
| `sz_whitecairn_tundra` | Whitecairn Tundra | 35–38 | Flat tundra; mammoth-kin (beast), trappers' camps. |
| `sz_rimefang_glacier` | Rimefang Glacier | 36–39 | Ice caves and crevasses; ice elementals. **d10 Rimefang Caverns.** |
| `sz_stonehide_peaks` | The Stonehide Peaks | 38–41 | Giant country; stone stairs, giant holds (warband strongholds tier 3–4). **World boss site.** |
| `sz_throne_ice` | The Throne Ice | 40–42 | The highest glacier; the sleeping throne under the ice. **r02 The Glacier Throne entrance.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_rimehold` | Rimehold | hub, a walled longhouse town round a dwarf-built keep | 5 | human (north) | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN RV(Frost Wardens) |
| `town_whitecairn` | Whitecairn | trappers' village | 2 | human (north) | WS IN GM NB |
| `town_icefall_camp` | Icefall Camp | glacier camp of the Frost Wardens | 1 | human (north) | WS GM NB |
| `town_hollowpeak_lodge` | Hollowpeak Lodge | lodge under the giant stairs | 2 | dwarf | IN SM NB BN |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_giants_stair` | The Giants' Stair | broken_road | A stair of 3 m steps; repair a side ramp → faster route up for everyone (world state) |
| `lm_rime_beacon` | Rime Beacon | beacon | Calls a Frost Warden patrol |
| `lm_frozen_wreck` | The Ice-Bound Longship | sunken_wreck (variant) | Frozen in a lake; loot |
| `lm_aurora_stones` | The Aurora Stones | standing_stones | +1 perk point once |
| `lm_ruin_field` | The Ruin Field | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_hallveig_rime` | Frost-Warden Hallveig Rime | lord of Rimehold | Rimehold keep | `warrior` f | Ch 8 giver; raid unlock `q_fm_frost_under_the_throne` (level 42; page 07 names this giver `npc_fm_frost_warden_hakon`) |
| `npc_aske_trapper` | Aske | trapper and guide | Whitecairn | `ranger` m | Hunting quests |
| `npc_lorekeeper_ymma` | Lorekeeper Ymma | keeper of the sagas | Rimehold longhouse | `bard` f | r02 attunement lore |
| `npc_dagny_stairwarden` | Dagny | warden of the Giants' Stair | Hollowpeak Lodge | `fighter` f | Giant quests |
| `npc_ulmar_peakspeaker` | Ulmar | a giant who talks (Stonehide, neutral in one quest) | the Stonehide Peaks | `brute` m depth +0.2 | Side line: the giants were driven down too |
| `npc_hroth_peak_king` | Hroth, the Stonehide Peak-King | warlord (enemy) | the Stonehide Peaks | `brute` m | Warband warlord, fought as `b_stonehide_peakking` (page 10; reuse: Farhold `stonehide_peakking`) |

**Factions present:** `fac_frost_wardens` (holder, 0.7), `fac_deepforge_clans` (Hollowpeak). Hostile:
`fac_stonehide`, `fac_ashtusk` (raiders on the southern passes, to 40), `fac_ember_legion` (the western road).

**Enemies by family:** giant warband (Stonehide: stone-throwers, shield-giants, frost shamans) · beast
(frost wolves, snow elk, mammoth-kin, ice bears) · elemental (ice elementals, blizzard spirits) ·
undead (Rimebound Dead, page 10) · dragonkin (a rime drake roost).

**Dungeon:** `d10_rimefang_caverns`. **Raid:** `r02_glacier_throne`, door in the Throne Ice.

**World boss site:** `wb_site_ruin_field` in the Stonehide Peaks — **The Standing Ruin** (page 13 §8.5.5)
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
| Held by | **contested** — `fac_saltbound` holds the upper town and cliffs (grip 0.55), `fac_the_drowned` hold the sunken quarter |
| Size | 4.0 × 6.0 km along the north-east coast |
| Town culture | `human` harbour (stone quays, slate roofs, lighthouse); the sunken quarter is a `human` town under water, ruined |
| Veil pressure | 0.55 |
| Music | Sea-shanty rhythm slowed to a dirge, church organ heard from under water, bells; 76 BPM; minor. Night: bells, waves, a choir that is slightly out of tune |
| Feel | Cliffs, grey sea, fog banks, a drowned cathedral whose spire sticks out of the bay, bells ringing under the waves. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_saltmarch_cliffs` | Saltmarch Cliffs | 40–42 | The hub and its cliffs; gulls, cliff crabs, Drowned climbing the rocks at night. |
| `sz_wreckers_shore` | Wreckers' Shore | 42–45 | Wreck-strewn beach; the Saltbound divers, sea serpents in the shallows. |
| `sz_sunken_quarter` | The Sunken Quarter | 42–45 | Old Saltmarch under 2–6 m of water; the Drowned. **d11 Saltdeep Cathedral.** |
| `sz_brinehollow_flats` | Brinehollow Flats | 44–47 | Tidal flats; the tide goes out for 10 real minutes every hour and uncovers loot and a path. **World boss site.** |
| `sz_choir_deeps` | The Choir Deeps | 46–48 | The trench off the cathedral; the song is loudest. **r03 The Sunken Choir entrance.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_saltmarch` | Saltmarch | hub, walled harbour upper town | 5 | human | WS IN SM GM RG ST SK FY BX MB NB BR UB CH TR BN RV(Saltbound); **the ship to Veilspire** (level 60, §10); a second **auction house branch** (the Salt Exchange) |
| `town_gullrock` | Gullrock | fishing village on a sea stack | 2 | human | WS IN GM NB |
| `town_lampwick_point` | Lampwick Point | lighthouse and keeper's houses | 1 | human | WS NB CH |
| `town_brinehollow` | Brinehollow | wreckers' village on the flats | 2 | human | IN GM FY NB RV(Cutwater) |

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
| `npc_amos_keeper` | Amos | lighthouse keeper | Lampwick Point | `elder` m | Ch 9; lore of the Drowning; raid unlock `q_dc_the_choir_calls` (level 50; page 07 names this giver `npc_dc_choirkeeper_selwyn`) |
| `npc_mara_diver` | Mara Deepwater | Saltbound diver | Wreckers' Shore | `rogue` f | Diving quests |
| `npc_hale_marrow` | Captain Hale Marrow | ship captain | Saltmarch harbour | `swashbuckler`-ish `fighter` m | The Veilspire ship (level 60) |
| `npc_dc_tidewright_morwen` | Morwen | tidewright, tamer of sea-mounts | Saltmarch harbour | `ranger` f | **Riding III** (`q_dc_the_tide_steed`, level 40; page 07) |
| `npc_cantor_selwyn` | Cantor Selwyn | the Drowned choir-master (enemy) | the Choir Deeps | `undead` m | r03 herald |
| `npc_brother_aldo` | Brother Aldo | (moves here in Ch 9) | Saltmarch chapel | `cleric` m | Returning character from Mossfen |

**Factions present:** `fac_saltbound` (0.55), `fac_cutwater` (Brinehollow), `fac_quiet_wake`. Hostile:
`fac_the_drowned` (strongest here), `fac_stonehide` (on the cliffs, 44–48; page 10), `fac_unwoven`.

**Enemies by family:** undead (the Drowned: bell-ringers, choristers, anchor-knights, bloated dead) ·
beast (cliff crabs, sea serpents, giant eels, gulls) · aberration (tide-horrors from the Choir Deeps) ·
humanoid (Unwoven wreckers).

**Dungeon:** `d11_saltdeep_cathedral`. **Raid:** `r03_sunken_choir`.

**World boss site:** `wb_site_brine_pool` on Brinehollow Flats — **The Sallow King** (`b_sallow_king`,
page 13 §8.5.6: the last Sandsworn king's wraith, on a tidal causeway that floods as he fights; level 51;
reuse name: Farhold world boss tier 3).

**Tide rule:** Brinehollow Flats and the Sunken Quarter have a tide: 50 real minutes high, 10 real
minutes low, on the hour. Low tide uncovers paths, 6 loot caches and the world boss arena.

---

### 8.9 The Riftmarch — `riftmarch`

| At a glance | |
|---|---|
| Levels | 46–54 |
| Hub | Waystone Camp (`town_waystone_camp`) |
| Held by | `fac_riftwatch` |
| Size | 7.0 × 3.0 km of broken ground, plus ~40 floating islands 20–140 m up |
| Town culture | Waystone Camp: `human` military camp built round a ring of salvaged waystones; the Quiet Orchard: `halfling`, frozen in time |
| Veil pressure | 0.80 |
| Music | Glass harmonica, reversed piano, sub-bass drone, irregular metre (7/8); 80 BPM; whole-tone scale. Night: near-silence, chimes, a heartbeat |
| Feel | Ground torn loose and hanging in the air, waterfalls falling up, stone that hums, the Veil overhead close enough to see its weave. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_waystone_rise` | Waystone Rise | 46–48 | The hub's ridge; riftlings, Unwoven cultists. |
| `sz_floating_isles` | The Floating Isles | 48–51 | Islands joined by chains, rope bridges and **rift-jumps** (glyph pads that throw you 30 m). **d12 The Unmade Workshop** is on the largest island. |
| `sz_shardfall` | Shardfall | 50–52 | Where the islands drop their stones; crystal fields; shard constructs. |
| `sz_unwritten_fields` | The Unwritten Fields | 52–54 | Ground that has not finished becoming ground; Riftborn at full strength. **World boss site.** |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_waystone_camp` | Waystone Camp | hub, a walled camp | 4 | human | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN RV(Riftwatch) |
| `town_anchor_hill` | Anchor Hill | village chained to the ground so it will not float | 2 | human | WS IN GM NB |
| `town_shardfall_post` | Shardfall Post | Longsight survey office on an island | 1 | human | SK GM NB RV(Longsight) |
| `town_quiet_orchard` | The Quiet Orchard | a halfling farm where time stopped in 396 AS; its people are still mid-step | 1 | halfling | WS NB (quest hub only) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_rift_anchor` | The Great Anchor | watchtower (variant) | A chain tower; climbing it reveals the region |
| `lm_upfall` | The Upfall | broken_road (variant) | A waterfall falling up; ride it to the high islands |
| `lm_weave_window` | The Weave Window | standing_stones | Where the Veil is close enough to touch; puzzle, +1 perk point once |
| `lm_unfinished_ground` | The Half-Made Plain | (world boss arena) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_cassia_dorne` | Riftwarden Cassia Dorne | head of the Riftwatch | Waystone Camp | `knight` f | Ch 10 giver |
| `npc_benedek_artificer` | Benedek | Riftwatch artificer (a tinker) | Waystone Camp | `villager` m | Rift-jump and gadget quests |
| `npc_little_wynn` | Wynn | a halfling girl, the only moving person in the Quiet Orchard | the Quiet Orchard | `child` f | The Quiet Orchard side line |
| `npc_master_ferrant` | Master Ferrant | the King's chief artificer (enemy) | the Unmade Workshop | `mage` m | d12 boss herald |
| `npc_iris_vael` | Iris Vael | (taken in Ch 10) | — | — | — |

**Factions present:** `fac_riftwatch` (0.6), `fac_longsight`, `fac_lantern_house`. Hostile:
`fac_riftborn`, `fac_unwoven` (strongest here), `fac_ember_legion`.

**Enemies by family:** aberration (Riftborn: riftlings, half-made, weave-eaters) · construct (the
Workshop's bodies, shard constructs) · humanoid (Unwoven, Ember Legion artificers) · elemental (void
wisps, gravity knots).

**Dungeon:** `d12_unmade_workshop`.

**World boss site:** `wb_site_half_made_plain` in the Unwritten Fields — **The Unmoored** (`b_unmoored`,
page 13 §8.5.7: a horror circled by orbiting stones; level 57; new name).

**Movement rule:** rift-jump pads (`lm_` not needed; they are terrain) throw a player 30 m along a
drawn arc; no fall damage on landing; mounts dismount on use.

---

### 8.10 The Emberthrone — `emberthrone`

| At a glance | |
|---|---|
| Levels | 52–60 |
| Hub | Last Light (`town_last_light`) |
| Held by | **contested** — `fac_ember_legion` holds everything except Last Light and Cinderwatch |
| Size | 7.0 × 3.0 km; a ring of volcanoes round the caldera; the Ember Court sits on the caldera's inner island |
| Town culture | Last Light: `human` camp dug into rock; the Legion's fortresses: `undead`-palette black glass (a proctown palette, not a new culture) |
| Veil pressure | 0.70 (the King holds it back here — lower than the Riftmarch) |
| Music | Full orchestra, low choir in an invented tongue, taiko-like drums, the King's leitmotif (four notes, falling); 110 BPM; harmonic minor. Night: the leitmotif on a single cello |
| Feel | Black glass, rivers of lava, red sky, ash falling like snow, the Ember Heart visible as a red star over the caldera. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_last_light_ridge` | Last Light Ridge | 52–54 | The resistance camp's ridge; Legion patrols, magma hounds. |
| `sz_obsidian_fields` | The Obsidian Fields | 54–57 | Black glass plain; fire elementals, drakes. **World boss site.** |
| `sz_cindergate_approach` | Cindergate Approach | 54–57 | The Legion's gate road. **d13 Cindergate Bastion.** |
| `sz_reliquary_caldera` | The Reliquary Caldera | 57–60 | Inside the volcano ring; temple halls of the old Order. **d14 The Ashen Reliquary.** |
| `sz_ember_court_steps` | The Ember Court Steps | 60 | The causeway to the caldera island. **r04 The Ember Court entrance** + the story instance door. |

**Settlements**

| id | Name | Kind | Size | Culture | Services |
|---|---|---|---|---|---|
| `town_last_light` | Last Light | hub, a resistance camp dug into a ridge | 4 | human | WS IN SM GM RG ST SK BX MB NB BR UB CH TR BN RV(Crown, Lantern House) |
| `town_cinderwatch` | Cinderwatch | a captured Legion watch-fort | 2 | human | WS GM NB |
| `town_kiln_hollow` | Kiln Hollow | an old Order kiln-village, abandoned; becomes a camp after `q_ms_kiln_hollow` | 1 | human | WS NB (after the quest) |

**Landmarks**

| id | Name | Kind (reuse) | What you do |
|---|---|---|---|
| `lm_the_red_star` | The Red Star | (sky landmark) | The Ember Heart over the caldera; brighter as the story advances (per player) |
| `lm_order_forge` | The Order's Forge | forge_fire | Crafting bench; top-tier recipes |
| `lm_ash_beacon` | The Last Beacon | beacon | Calls a resistance strike team |
| `lm_slag_pit` | The Slagpit | (world boss arena, reuse: Farhold `boss_slagpit`) | World boss site |

**NPC cast**

| id | Name | Role | Where | Voice role | Does |
|---|---|---|---|---|---|
| `npc_marshal_ansel_crane` | Marshal Ansel Crane | commander of Last Light | Last Light | `knight` m | Ch 11 giver; Heroic dungeons (`q_el_the_heroic_road`) and the Ember Court raid (`q_el_the_ember_court_gates`), level 60 (page 07 names this giver `npc_el_marshal_ysolde`) |
| `npc_el_keywarden_orrin` | Keywarden Orrin | keeper of the keystones | Last Light | `elder` m | **Mythic+** (`q_el_the_keystone_vow`, level 60; page 07) |
| `npc_el_skywright_aveline` | Aveline | skywright, breaker of winged mounts | Last Light | `ranger` f | **Riding IV — flying**, the chain `q_sky_1` … `q_sky_5` (level 60; page 07) |
| `npc_brother_caddoc` | Brother Caddoc | a defector from the Order of the Ember | Last Light | `priest` m | Ch 11: tells Ysa Varn's story |
| `npc_emberwright_sallis` | Sallis | forge-mistress of the resistance | Last Light | `brute` f | Top-tier crafting |
| `npc_maelor_varn` | Maelor Varn, crowned Kaedros, the Ember King | the antagonist | the Ember Court (projections elsewhere) | `elder` m, pitch −0.1 | Ch 3, 7, 11 projections; r04's final boss `b_ember_king_kaedros` (page 13) |
| `npc_ysa_varn` | Ysa Varn | the King's daughter, a memory | visions in Ch 11 | `child`→`villager` f | The reason |
| `npc_the_kindled_three` | The Kindled Three (Lord Castellan Vorhane `b_castellan_vorhane`, Sarn Veydrec, Herald of the Ember King `b_sarn_veydrec_herald`, Lord Castellan Aurel Brandt `b_castellan_brandt`) | the King's lieutenants (enemies) | d13, d14, r04 | `demon`, `cultist`, `warrior` | Bosses; page 12/13 own the fights |

**Factions present:** `fac_crown_assembly` + `fac_lantern_house` (Last Light only). Hostile:
`fac_ember_legion` (grip 0.9), `fac_ashtusk` loyalists, `fac_unwoven`.

**Enemies by family:** humanoid (Ember Legion: legionnaires, flamebinders, glass-knights, Kindled
priests) · fiend (ember fiends summoned through the thin Veil) · elemental (magma hounds, lava
elementals, cinder storms) · dragonkin (caldera drakes, the King's wyrm-riders).

**Dungeons:** `d13_cindergate` · `d14_ashen_reliquary`. **Raid:** `r04_ember_court`.

**World boss site:** `wb_site_slagpit` in the Obsidian Fields — **Slagborn** (page 13 §8.5.8) (`b_slagborn`,
a giant of slag that eats the lava round it; level 60 elite; reuse name: Farhold world boss tier 3).

---

### 8.11 Veilspire Isle — `veilspire`

| At a glance | |
|---|---|
| Levels | 60 |
| Hub | the Spire Landing (`town_spire_landing`) |
| Held by | nobody — the Crown, the Riftwatch and the Lantern House keep a joint camp |
| Size | 3.0 × 3.0 km island, one mountain 1,900 m high, the Spire on its top |
| Town culture | a camp of tents and salvaged waystones; the Spire itself is its own art set (page 17) |
| Veil pressure | 1.00 |
| Music | Solo voice, strings in harmonics, a slow version of the Hearthvale theme in a minor key; 60 BPM. At the Spire: the Hearthvale theme in the original major key, only after the story's end |
| Feel | A beach of grey glass, a forest growing upside down from floating roots, the Veil a wall of light you can walk up to. |

**Sub-zones**

| id | Name | Levels | What is there |
|---|---|---|---|
| `sz_spire_landing` | The Spire Landing | 60 | The camp and the harbour. |
| `sz_shattered_strand` | The Shattered Strand | 60 | Glass beach; Riftborn washing ashore; daily quests. |
| `sz_veilwood` | The Veilwood | 60 | An inverted forest; things from the Unmade wearing the shapes of Wildmarch animals. |
| `sz_spire_foot` | The Spire Foot | 60 | The climb; **r05 Veilspire entrance.** |

**Settlements:** `town_spire_landing` — size 3 camp — WS IN SM GM RG FY BX MB NB BR UB CH BN RV(the
Spire Accord, a joint reputation of Crown + Riftwatch + Lantern House; page 07).

**Landmarks:** `lm_the_veil_wall` (touch it: a lore vision per story chapter completed) · `lm_ysoldes_steps`
(the path the Lampbearer climbed; a daily pilgrimage quest) · `lm_the_broken_pin` (the empty
Everflame brazier at the Spire's foot, until the story ends).

**NPC cast:** `npc_iris_vael` (returns, now a Veil scholar in her own right) · `npc_ysoldes_echo`
(full form here) · `npc_cassia_dorne` · `npc_hale_marrow` (ship) · `npc_quartermaster_wend` (Spire
Accord vendor, `merchant` m) · `npc_vs_veilwarden_isaure` (Veilwarden Isaure, `knight` f — the
Veilspire raid unlock `q_vs_beyond_the_veil`, level 60; page 07).

**Enemies:** aberration (Riftborn at full strength) · things wearing borrowed shapes (every family —
Veilwood mimics of earlier regions' beasts, page 10) · the last cell of the Unwoven cult (`fac_unwoven`).

**Raid:** `r05_veilspire`. **World boss:** none by canon; seasonal world bosses may use the Shattered
Strand (page 13, page 14 §Seasonal).

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
| Music | A brass fanfare motif, harpsichord, bustle; 100 BPM; major. Night: a lute in a tavern, bells on the hour |

**First arrival:** Ch 3 (`q_ms_the_south_gate`, level 10). A player may walk in earlier; services work
at any level, but the **bank, mail and market** (auction house) open together at 11
(`q_hc_keys_to_the_city`), **waystones** and the **portal court** at 12, and the **guild charter** at 15
(page 07 owns the ladder; page 14 §7 has the quests).

### Districts

| # | District | id | Where | What is there |
|---|---|---|---|---|
| 1 | **Crown Ward** | `hc_crown_ward` | the hilltop | The **Assembly Hall** (four seats + the empty Lampbearer's Seat), the Lord Protector's residence, the Crown quartermaster (RV Crown) |
| 2 | **Coinhall** | `hc_coinhall` | east of the hilltop | The **Bank**, the **Exchange** (auction house), the **Mailhouse**, the money-changer |
| 3 | **Guild Row** | `hc_guild_row` | north-east | The **Guild Registrar**, the Charter Hall (guild banks and guild halls' doors, page 15), banner-maker (guild tabards) |
| 4 | **Hall of Callings** | `hc_hall_of_callings` | north | **Thirty class trainers**, the **Unbinder** (retraining, reuse: Farhold `js/retrain.js`), a talent tutor, practice dummies |
| 5 | **Lamplit Market** | `hc_lamplit_market` | centre, the big square | General goods, weapons, armour, reagents, a **gambler** (sealed crates, reuse: Farhold `gambler` role), cosmetics, dyes, pets |
| 6 | **Temple Rise** | `hc_temple_rise` | west slope | Chapel of the Lamp (revive point, curse removal), the Quiet Wake house (the catacombs' keepers) |
| 7 | **Portal Court** | `hc_portal_court` | inside the North Gate | **Portal stones** to every attuned hub (§10) |
| 8 | **Warden's Yard** | `hc_wardens_yard` | inside the South Gate | Barracks, the **arena** and duel ring (page 15 PvP), training dummies with a damage meter (reuse: `meters/`), the **mercenary broker** |
| 9 | **Stable Gate** | `hc_stable_gate` | outside the South Gate | Stables (**mount quest**, §10), the **skyway roost** on the gate tower |
| 10 | **Low Wharf** | `hc_low_wharf` | on the Slowwater under the Fen Gate | River barges to Mossfen and Brightwater (§10), Cutwater's river office |
| 11 | **The Undercroft** | `hc_undercroft` | under Temple Rise | The catacombs; the Quiet Wake's gate; **the door to `r01_barrowking`** |
| 12 | **Lantern Row** | `hc_lantern_row` | south-west | The Lantern House chapterhouse (library, lore collection, relic vendor), the Longsight map office |
| 13 | **The Crown and Candle** | `hc_inn` | Lamplit Market | The city inn: rest, hearth-bind, a minstrel (rumours) |

### Services, with the people who run them

| Service | NPC id | Name | District | Voice | Details (owner page) |
|---|---|---|---|---|---|
| Bank | `npc_ottoline_crane` | Ottoline Crane, Keeper of the Vaults | Coinhall | `merchant` f | Personal bank (tabs, slots, costs on page 08); guild bank page 15. `BX` boxes in every hub reach the same vault |
| Auction house | `npc_fitch_marrow` | Fitch Marrow, Master of the Exchange | Coinhall | `merchant` m | Buy/sell listings (page 15). Branch: the Salt Exchange in Saltmarch |
| Mail | `npc_posy_quill` | Posy Quill | Coinhall | `villager` f | Mail (page 15); mailboxes in every hub |
| Guild registrar | `npc_melisande_hart` | Registrar Melisande Hart | Guild Row | `elder` f | Found a guild (fee and signatures on page 15), rename, tabard. Guild charter `q_hc_a_name_on_the_rolls` (level 15; page 07 names this giver `npc_hc_registrar_pell`) |
| Portal warden | `npc_ysra_portalwarden` | Ysra | Portal Court | `mage` f | Portals (§10) |
| Stablemaster | `npc_oswin_stablemaster` | Oswin | Stable Gate | `villager` m | Riding I `q_hc_saddle_and_bridle` (level 10; page 07 names this giver `npc_hc_stablemaster_oda`); buys/sells mounts |
| Roost-keeper | `npc_tamsin_roost` | Tamsin | Stable Gate tower | `ranger` f | Skyways `q_unlock_skyways` |
| Bargemaster | `npc_jory_barge` | Jory | Low Wharf | `rogue` m | River barges |
| Mercenary broker | `npc_captain_aldous_fenn` | Captain Aldous Fenn | Warden's Yard | `fighter` m | Followers (reuse: Farhold `js/followers.js`, `data/mercenaries.json`) |
| Unbinder | `npc_the_unbinder` | Sethra the Unbinder | Hall of Callings | `mage` f | Retraining from level 12 (reuse: Farhold `js/retrain.js`); dual spec `q_hc_two_minds_one_will` (level 30). Page 07 names this NPC `npc_hc_unbinder_mott` |
| Arena master | `npc_brakka_arena` | Brakka | Warden's Yard | `brute` f | Arena, duels (page 15); battlegrounds and war mode `q_hc_the_proving_yard` (level 20; page 07 names this giver `npc_hc_yardmaster_kell`) |
| Lore-keeper | `npc_archivist_pell` | Archivist Pell | Lantern Row | `elder` m | Lore book, relic hand-ins (`fac_lantern_house`) |
| Chapel | `npc_mother_superior_ada` | Mother Ada | Temple Rise | `cleric` f | Revive point, curse removal |
| Catacomb warden | `npc_warden_of_bones` | Hesper, Warden of Bones | Undercroft | `undead`-ish `cleric` m | r01 attunement giver; raid unlock `q_hc_the_barrowkings_seal` (level 30; page 07 names this giver `npc_hc_high_warden_ottilie`) |
| Herald | `npc_hc_herald_aldous` | Herald Aldous | South Gate | `elder` m | Bank, mail and market `q_hc_keys_to_the_city` (level 11; page 07) |
| Waywarden | `npc_hc_waywarden_liss` | Waywarden Liss | the waystone, South Gate square | `mage` f | Waystones `q_hc_the_waywardens_oath` (level 12; page 07) |
| Shieldmaster | `npc_hc_shieldmaster_varr` | Shieldmaster Varr | Warden's Yard barracks | `warrior` m | Challenge `q_hc_hold_the_line` (level 10, tank-capable classes; page 07) |
| Lord Protector | `npc_lord_protector_edmund_vale` | Lord Protector Edmund Vale | Crown Ward | `knight` m | Ch 3 giver; chair of the Assembly |
| Elf envoy | `npc_envoy_liriel` | Envoy Liriel Moonward | Crown Ward | `mage` f | Assembly seat (Moonwell Circle) |
| Dwarf envoy | `npc_envoy_brannoc` | Envoy Brannoc Ironbraid | Crown Ward | `warrior` m | Assembly seat (Deepforge Clans) |
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

Six ways to cross the continent, unlocked in order (page 07 owns the level ladder; the quests are on
page 14). Speeds are Farhold's: walk 5.4 m/s, sprint 11.3 m/s, swim 2.7 m/s (reuse:
`prototypes/farhold/js/player.js`).

### 10.1 Roads

World Forge's road network (reuse: `worldgen/js/roads.js`, Farhold `js/roadplan.js`, `ROAD_CLASS`
widths, switchbacks `js/road-fold.js`, bridges `js/bridge-plan.js`, signposts `js/roadside.js`) with
**two forced roads** from the overrides file:

| Road | Class | Route | Length |
|---|---|---|---|
| **The Kingsroad** | highway | Brightwater → Highcourt South Gate → North Gate → Kettle Pass → Anvilgate → Fort Ashfall → Waystone Camp → Last Light | ~31 km |
| **The Saltroad** | road | Fort Ashfall → east across the Steppe → Saltmarch | ~9 km |
| **The Sunroad** | road | Kettle Pass → west → Oasis of Tamar | ~6 km |
| **The Moonroad** | road | Anvilgate → east → Silverbough (and the Rootstair down to Reedhollow) | ~7 km |
| **The Rimeroad** | road | Fort Ashfall → north-west → Rimehold | ~7 km |
| **The Fen Causeway** | road | Brightwater → Reedhollow → Highcourt Fen Gate | ~6 km |
| Trails | trail | A* between every other town and landmark | — |

Road pace bonus: **walking ×1.15, riding ×1.25** on any road (reuse: Farhold R27 M7, applied once).
Roads show milestones every 500 m and a signpost at every junction naming the next town each way.

### 10.2 Waystones (fast travel)

A **waystone** is Farhold's waypoint pad renamed (reuse: `prototypes/farhold/js/waypoints.js`): one
design everywhere — a round stone floor with a ring of sigils — dark until you **enter the town's
boundary**, then lit for you forever. Every town marked `WS` in §8 has one; so do a few landmarks.

| Rule | Value |
|---|---|
| Unlock | `q_hc_the_waywardens_oath` (level 12, Highcourt; page 07's ladder, quest on page 14). Before it, waystones light up but cannot be used. |
| Use | Stand on any lit waystone, press `E`, pick a destination from the map (or the list). |
| Cost | **1 silver × the destination's region number** (Hearthvale 1s … Emberthrone 10s); free to your hearth-bound town. |
| Time | A **5 s channel** (interrupted by damage), then a 1.5 s fade. Farhold's "costs time" rule is kept as the channel. |
| Combat | Cannot start in combat. |
| Hearth-bind | Any inn (`IN`) sets your **hearth**. The **Homeward Stone** (`it_homeward_stone`, a belt item, not a spell; from `q_hv_a_bed_by_the_fire` at level 7, page 07) returns you to your hearth: 10 s channel, 30 min cooldown, free. |
| Group | A party member can **summon** at a waystone: two players at a lit waystone channel for 10 s to pull a third party member who has that waystone lit. |

### 10.3 Portals (Highcourt)

`hc_portal_court` holds eleven portal stones, one per region hub. A portal to a hub opens for you once
you have **lit that hub's waystone**. Free, instant (2 s fade), one-way into the hub; every hub has a
return portal to Highcourt. Unlock: `q_unlock_portals` (level 12). Purpose: Highcourt is the social
centre, and portals make it the easiest place to be. (reuse: Farhold `js/portal.js` for the
exit/anchor pair logic.)

### 10.4 Mounts

| Rule | Value |
|---|---|
| Unlock | `q_hc_saddle_and_bridle` (level 10, Highcourt Stable Gate): the Stablemaster gives the first mount (page 07 owns the riding ladder) |
| Speed | Riding I (level 10): **+60% move speed**, i.e. 8.6 m/s on open ground, 10.8 m/s on a road. Riding II (`q_ss_the_sand_runners`, level 20): **+100%**, 10.8 m/s, 13.5 m/s on a road |
| Swim and leap | Riding III (`q_dc_the_tide_steed`, level 40): a mount swims on the surface at +80% and leaps 6 m while galloping |
| Flying | Riding IV (the chain `q_sky_1` … `q_sky_5`, level 60, `npc_el_skywright_aveline` in Last Light): every winged mount **flies**, +150% (13.5 m/s). Before 60, winged mounts run and glide (canon 00 §10) |
| Mounting | 1.5 s cast, broken by damage. Dismount on attack, on taking damage over 5% of max health, on entering water deeper than 1.2 m (until Riding III), on using a rift-jump |
| Items | Mounts are items (reuse: Farhold `js/gear.js` mount slot, rarity affects looks and a small extra: Rare +5%, Epic +10% speed on roads) |
| Indoors | No mounts in dungeons, raids, Highcourt's inner districts (the Crown Ward and Coinhall) |

### 10.5 Skyways (flight paths)

**Gale kites** — giant grey birds with a rider's saddle (a Chibi 2 creature, `float`/bird body plan,
page 17) — fly fixed routes between **roosts** (`SK` in the tables). Unlock `q_unlock_skyways` (level
25, Highcourt Stable Gate tower). A route opens when you have visited both roosts. Speed 22 m/s along
a fixed curve; you can look around but not steer; you can bail out over water only. This is not
flying: free flight is Riding IV at 60 (§10.4). Cost: **2 silver
per 1 km** flown. Roosts: Highcourt, Anvilgate (from 25), Oasis of Tamar, Silverbough, Fort Ashfall,
Rimehold, Saltmarch, Waystone Camp, Shardfall Post, Last Light. No roost in Hearthvale or Mossfen (you
have waystones by then; the skyways are for the big north).

### 10.6 Boats

| Boat | From → To | Unlock | Time | Cost |
|---|---|---|---|---|
| Stillwater punt | Stillwater Landing ↔ Highcourt Low Wharf | `q_unlock_boats` (level 9) | 90 s ride (a real trip, you stand on deck) | 5 copper |
| Wend barge | Highcourt Low Wharf ↔ Brightwater quay | level 9 | 120 s | 5 copper |
| Thistlemere ferry | across the lake in Whisperwood | — | 40 s | free |
| Brinehollow skiff | Brinehollow ↔ Gullrock | — | 60 s | 1 silver |
| **The Lamp's Wake** | Saltmarch ↔ Spire Landing (Veilspire) | `q_ms_across_the_veil_sea` (level 60, main story Ch 12) | 150 s; **the only way to Veilspire** until you have lit the Spire Landing waystone | free |

**Swimming and rowing:** any player may also take a personal boat (reuse: Farhold `js/boat.js`, raft /
skiff / cutter; auto-equipped in deep water) from level 9. The Veil Sea is **not** crossable by
personal boat (the Veil current turns you back at 2 km out, with a warning at 1.5 km).

---

## 11. Day, night and weather by region

**Day:** 60 real minutes — **45 minutes of day** (game 06:00–20:00) and **15 of night** (20:00–06:00),
canon. Dawn and dusk are 3 real minutes each (inside the day). Night is darker and more dangerous
(page 05 owns the numbers: spawn density, elite chance, night-only enemies). Every region shares one
clock (the server's). Night light: a torch or lantern in the off-hand or on the belt (reuse: Farhold
`js/light.js`); town streets are lamp-lit (reuse: `js/nightlights.js`).

**The moon** has an 8-day cycle (8 real hours); a full moon (1 night in 8) raises the Thornmane and
the Moonwell events' chances (page 14).

**Weather:** each region rolls a new state every **12–20 real minutes** from its table, crossfading
over 60 s (reuse: `worldgen/js/weather.js` `WeatherClock`). Numbers are percent chances per roll.
`Veilstorm` = World Forge's `ionstorm` renamed (lightning 1, violet tint; spawns Veil-touched enemies
and a rift event roll, page 14). **Weather effects on play** (page 05 owns): rain −10% fire damage /
+10% lightning damage; fog cuts enemy aggro range 30% and yours 30%; sandstorm and blizzard cut sight
to 25 m; ashfall −5% healing received; Veilstorm +10% arcane/void damage for everyone.

| Region | clear | fair | cloudy | overcast | drizzle | rain | storm | fog | snow | blizzard | sandstorm | ashfall | emberstorm | Veilstorm |
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
| Emberthrone | 5 | 5 | 10 | 10 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 35 | 25 | 5 |
| Veilspire | 5 | 5 | 10 | 15 | 5 | 5 | 10 | 15 | 0 | 0 | 0 | 0 | 0 | 30 |

(Each row sums to 100. The Veilstorm column is a floor; §4's Veil-pressure rule can add to it during
story-driven Veil events on page 14.)

**Dungeons and raids** have no weather unless their page says so (the Glacier Throne has a scripted
blizzard phase, page 13).

---

## 12. Voice and tone guide for NPCs

The Wildmarch is **dark but warm**: things are bad, people are tired, and they still make jokes and
feed strangers. Nobody speaks like a fantasy novel. Everybody speaks like someone with a job.

### Rules for every line an NPC says

1. **Plain words, short sentences.** "The barrows woke up three nights ago." not "Lo, the ancient
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
9. **Villains are honest.** The Ember King, the Kindled, the Sallow King and the Choir believe they are
   right and say why in one sentence.
10. **Original names only.** No names from other games or books in any line (canon §10).

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
| The Ember King | `elder` | pitch −0.1, speed −0.05, never jittered |
| The Narrator (scene text, italic) | `narrator` | reuse: Emberveil `js/talk.js` `narrate` |

### Region voice notes

| Region | How people talk | Example line |
|---|---|---|
| Hearthvale | Farmers. Weather, harvest, the Wardens. Proud and a bit slow to trust. | "Three nights now the dogs won't go past the downs. Dogs know." |
| Mossfen | Quiet, careful, superstitious. Never say the name of the Drowned. | "Don't follow the lights. Whatever you've lost, it isn't out there." |
| Highcourt | Busy, political, a little snobbish; everyone has an opinion on the Assembly. | "Four seats and not one of them will say the word *war*." |
| Greyridge | Dwarves: blunt, formal about craft, rude about everything else. | "Good steel. Wrong hands. Sit down." |
| Sunscar | Courteous, ceremonial, careful about the dead. Everything is a guest-right. | "Drink first. Then tell me why you walk on my grandfather's roof." |
| Whisperwood | Elves: patient, indirect, answer a question with a question. | "You ask why the well went dark. Ask instead who drank from it." |
| Cinder Steppe | Soldiers and herders: tired, gallows humour, short. | "Wall holds, we eat. Wall falls, we don't. Simple sums." |
| Frostmantle | Few words, saga cadence, respect earned in deeds. | "You came up the stair alone. Sit by the fire. Say nothing yet." |
| Drowned Coast | Sailors: bleak jokes, bargains, bells. | "When the bells ring under the water, you go inside. Nobody asks why twice." |
| Riftmarch | Scholars and soldiers who have seen too much; clipped and precise. | "Stand on the stone that hums. The ones that don't, don't trust." |
| Emberthrone | Resistance: grim, no time, loyal. | "Everyone here has buried someone. Pick up a shovel or a sword." |
| Veilspire | Awed, quiet, a camp at the end of the world. | "Listen. That's the Veil. It sounds like a held breath." |

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
| Landmark | `lm_<snake>` | `lm_hearthstone` |
| World boss site | `wb_site_<snake>` | `wb_site_ironmuster` |
| Faction | `fac_<snake>` | `fac_vale_wardens` |
| NPC | `npc_<snake>` (brief) | `npc_iris_vael` |
| Class trainer | `npc_trainer_<class>` | `npc_trainer_mage` |

### Every hub, at a glance

| Region | Hub id | Waystone | Inn | Roost | Boat | Rep vendor |
|---|---|---|---|---|---|---|
| hearthvale | `town_brightwater` | yes | the Lamp and Ladder | — | Wend barge | Vale Wardens |
| mossfen | `town_reedhollow` | yes | the Dry Plank | — | punt (Stillwater) | Fenfolk |
| highcourt | `town_highcourt` | yes (South Gate square) | the Crown and Candle | yes | Low Wharf | Crown Assembly |
| greyridge | `town_anvilgate` | yes | the Anvil's Rest | yes (25) | — | Deepforge Clans |
| sunscar | `town_oasis_of_tamar` | yes | the House of Shade | yes | — | Sandsworn |
| whisperwood | `town_silverbough` | yes | the Bough Hall | yes | Thistlemere ferry | Moonwell Circle |
| cinder_steppe | `town_fort_ashfall` | yes | the Mess | yes | — | Crown Assembly |
| frostmantle | `town_rimehold` | yes | the Long Fire | yes | — | Frost Wardens |
| drowned_coast | `town_saltmarch` | yes | the Bell and Anchor | yes | the Lamp's Wake | Saltbound |
| riftmarch | `town_waystone_camp` | yes | the Anchored Mug | yes | — | Riftwatch |
| emberthrone | `town_last_light` | yes | the Ember-Out | yes | — | Crown / Lantern House |
| veilspire | `town_spire_landing` | yes | the Held Breath | — | the Lamp's Wake | Spire Accord |

---

## 14. Reuse map

| What | Wildmarch use | Reuse path |
|---|---|---|
| World generation | the continent (option C) | `worldgen/js/world.js`, `regions.js`, `nodes.js`, `roads.js`, `local.js` |
| Weather | per-region tables | `worldgen/js/weather.js` (`ionstorm` → Veilstorm) |
| Town layout | every settlement | `proctown/js/townplan.js`, `buildkit.js`; Farhold `js/town-plan.js` |
| Cultures | human, halfling, dwarf, elf, desert, orc, undead palettes; **new `fen`** | `proctown` `CULTURES` |
| Level bands on the map | sub-zone bands | Farhold `js/zones.js` (bands fixed per sub-zone instead of computed from hops) |
| Factions, standing, grip | §6 | Farhold `js/factions.js`, `js/territory.js`, `data/factions.json` |
| Warbands | 5 enemy races | Farhold `js/warbands.js`, `data/warbands.json` (levels rescaled) |
| Landmarks | `lm_*` kinds | Farhold `data/landmarks.json`, `data/setpieces.json`, `js/sites.js` |
| World boss arenas | `wb_site_*` | Farhold `data/setpieces.json` `boss_*` layouts |
| Waystones | fast travel | Farhold `js/waypoints.js`, `js/waylight.js` |
| Portals | Highcourt | Farhold `js/portal.js` |
| Mounts, boats | travel | Farhold `js/gear.js`, `js/boat.js`, `data/vehicles.json` |
| Roads | network | Farhold `js/roadplan.js`, `js/road-fold.js`, `js/bridge-plan.js`, `js/roadside.js` |
| Gates, guards | town gates | Farhold R27 M4 (`js/town.js` `gateVerdict`) |
| Night lights | torches, town lamps | Farhold `js/light.js`, `js/nightlights.js` |
| NPC roles | vendors, broker, unbinder, gambler | Farhold `js/town.js` `ROLES` |
| Speech | all NPC lines | `lingo/`, `conversations/`, Farhold `js/speech.js`, `js/rumours.js` |
| Names | generated NPCs, rares, streets | `namegen/` |
| Voices | every NPC | `shared/voices.js` |
| Enemy races | orc/goblin/giant/undead/beastkin | `avatar-3d/js/chibi2-races.js` |
| Body presets | four playable races | Farhold `js/bodypresets.js` |

**New for Wildmarch (not in any playground module):** the fixed continent recipe + overrides file;
Veil pressure; the `fen` town culture; tides; heatstroke and frostbite; skyways (gale kites); the
Veil Sea current; the Spire Accord reputation; region weather tables.

---

## 15. Canon change requests and open questions

### Canon change requests (for page 00; not applied here)

1. **Add id patterns** `sz_`, `town_`, `lm_`, `fac_`, `wb_site_`, `hc_` to the brief's id conventions
   (§13). Today the brief does not name them and every page will invent its own.
2. ~~**Warband level ranges** for Wildmarch: Sootwick 1–16, Thornmane 9–30, Unburied 14–48, Ashtusk
   24–40, Stonehide 34–50 (Farhold's were different). Page 10 should confirm.~~ **Resolved (00 §10):**
   page 10's bands — Sootwick 2–18, Unburied 12–24, Thornmane 20–32, Ashtusk 26–40, Stonehide 34–50,
   Ember Legion 50–60.
3. ~~**World boss names** (page 13 owns): Grief-in-Iron (Greyridge, 20), The Sallow King (Sunscar, 26),
   The Hungering Brood (Whisperwood, 32), The Carrion Crown (Cinder Steppe, 38), The Standing Ruin
   (Frostmantle, 44), Mother Brine (Drowned Coast, 50), The Unfinished (Riftmarch, 56), Slagborn
   (Emberthrone, 60). If page 13 picks others, this page's §8 site rows are the only thing to update.~~
   **Resolved (page 13 §8.5, reconciliation pass):** Grief-in-Iron (Greyridge, 21), The Glass Wyrm
   (Sunscar, 27), The Hungering Brood (Whisperwood, 33), The Carrion Crown (Cinder Steppe, 39), The
   Standing Ruin (Frostmantle, 45), The Sallow King (Drowned Coast, 51), The Unmoored (Riftmarch, 57),
   Slagborn (Emberthrone, 60). §8's site rows and the map now use them.
7. **Open after the reconciliation pass (not settled by 00 §10):**
   - **The Ember King.** Page 13 calls him **Kaedros** (`b_ember_king_kaedros`) with a different past
     (the last king before the Assembly, voted out, who sealed his son Prince Aurel in a kiln). This page
     keeps Maelor Varn's story and bridges the name: Maelor **crowned himself Kaedros** (§3). The owner
     should pick one past.
   - **The Barrowking.** Renamed to page 13's **Hrodric Ninefold**; page 13's past (a king buried under
     the hill before Highcourt was built) differs from §3's 204–211 AS war.
   - **The Unwoven.** r05's final boss is page 13's `b_unwoven`, which shares its name with the cult
     `fac_unwoven`; page 13's Veilspire lore (an elven nail through the Veil, warden Saelith) differs
     from §4 (Ysolde's Everflame pins the Veil).
   - **The Sallow King** is page 13's Drowned Coast world boss, but §3 buries him in a Sunscar tomb.
   - **Warbands outside page 10's bands still on this page:** Ashtusk scouts in the Redmesa (17–20) and
     Ashtusk loyalists in the Emberthrone (52–60).
   - **Name clashes from page 07's givers:** two Hesks (`npc_hesk`, `npc_mf_scrapwright_hesk`), two
     Aldous (`npc_captain_aldous_fenn`, `npc_hc_herald_aldous`), two Brams (`npc_bram_fenwick`,
     `npc_hv_innkeeper_bram`), two Tamsins (`npc_tamsin_roost`, `npc_hv_runner_tamsin`), and page 07's
     unused `npc_dc_choirkeeper_selwyn` vs this page's enemy `npc_cantor_selwyn`.
4. **Region 11 hub name:** canon says "the Spire Landing"; this page uses id `town_spire_landing`.
5. **Highcourt as `town_highcourt`** in addition to region id `highcourt`, so quest and waystone data
   can name the city like any other town.
6. **The Ember King's final fight has a non-raid story path** (the *King's Last Word* story instance,
   page 14) so a solo player can finish the main story — canon pillar 6 says open world is soloable
   but raids expect groups; the main story ending inside a raid would break pillar 6.

### Questions for the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1-01 | How is the continent made? | A hand-authored · B fixed seed · C fixed seed + hand edits | **C** (§1) |
| Q1-02 | Continent size | 16 × 24 km (this page) · 8 × 12 km (denser, 25 min end to end) · 32 × 48 km (Farhold-scale) | **16 × 24 km** — about 96 min on foot end to end, 15 min on a tier-2 mount |
| Q1-03 | Do all races start in Brightwater? | yes (canon wording) · each race starts in its homeland with a 1–6 area there | **Yes** — one starting zone keeps the population together in an online game; race homelands are welcomes, not starts |
| Q1-04 | The ending choice: does it change the shared world? | cosmetic-only (this page) · per-player phasing · server-wide vote | **Cosmetic-only**; phasing doubles art and bugs |
| Q1-05 | The Ember King's name and his motive (a dead daughter) — keep, or darker/lighter? | keep · make him a pure conqueror · make him right | **Keep** — an honest villain gives the dialog opportunity in r04 something to argue about |
| Q1-06 | Reuse Emberveil's Iris Vael and Garrick as names? | reuse · new names | **Reuse** — same author, same tone, a nod for anyone who played both |
