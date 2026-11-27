# Brainstorm 2026-11-27 — regions with travel points, the Old Graveyard + Catacombs, XP, maps

Owner (2026-11-27, after the gear round went live): "continue adding to Oathwild new regions, separated by travel
points and loading screens, rather than one big open world … each zone can have a specific level bracket without
worrying about dangerous borders … I am reminded of never winter nights 2 … Each region should use its own procedural
generation tools and be reusable … a graveyard map with catacombs underground, wide open spaces with tall columns like
lotr movie with that goblins and trolls … current map 1-5, graveyard 3-8 … quests available when you travel to the
graveyard map before actually entering the graveyard … spooky with fog … gravestones procedural placement … easter eggs
where you can loot certain open graves and sometimes have to fight a skeleton or named mob … take especially care with
the catacomb system so we can reuse the dungeon system later (Thousandvale's: aggro through walls, walking outside the
walls into void, and more) … indoor scenes should be spacious, giving room for the camera and rotation … bump up the
XP gains at low level … like WoW … improve the map and minimap: quest waypoints, a better quest tracker that shows the
region, the 'map' is a list of places sorted by level that explains how to get there … one waypoint to the graveyard
zone but multiple entrances … plan other zones from the models we have … fal models very small (goblins teeny)."

Done already (commit 18003e57, goes live with the next publish): **XP** (5+ levels below = 0; each level below −20%;
each level above +8.3% up to the +25% cap at 3+; your own level 1-6 ×2.2 / 2.0 / 1.75 / 1.5 / 1.3 / 1.15; every party
helper gets the full XP, a high friend may carry a low one) and **monster sizes** (goblins 1.0 → 1.75-1.8 m, warchief
2.1, bear 1.9, cat / wolf / boar 1.25-1.3, thornling 1.6, imp 1.4; druid shapes match).

---

## 1. Regions (the NWN2 model)

| Call | Why |
|---|---|
| A **world** (the thing you host and join by code) holds several **regions**; each region is its own map with its own level bracket, loaded when you enter it. Players of one world can be in different regions at once. | NWN2-style areas: brackets stay clean, no dangerous borders, each map can be dense |
| Regions are **shared** inside the world (everyone in the Graveyard sees each other); no per-party copies | A world is ≤ 10 friends; copies add cost and confusion |
| **Travel points** at a map's edge (a road gate, a cave mouth, a stair) — walk into it → "Travel to the Old Graveyard?" (Travel / Cancel) → loading screen → you arrive at the matching point | No accidental travel; phones get a clear button |
| **Loading screen**: a painted picture of the region (Codex art), its name, level range, one line of lore, a tip, and a real progress bar (map built, models loaded, shaders warmed) — never a frozen frame | Rule 57-style: no frozen screens; it hides the build |
| **Party travel**: you travel alone; the travel window lists friends already there; a friend's name on the map has "Go to" (travels to the entrance nearest them) | Simple, no vote dialogs |
| Each region is **made by a generator** (`js/world/regions/<kind>.js`) from a small data file (`data/regions/<id>.json`: seed, size, bracket, theme, travel points, quests). Generator kinds are reusable: `wilds` (today's terrain maker), `graveyard`, `dungeon` (catacombs), later `fen`, `quarry`… A new region of an existing kind = a new data file. | "its own procedural generation tools and reusable" |
| Server: one hosted world = one room with **an area sim per region** (`server/areas.js`), each with its own ground, monsters, camps and snapshot stream; a player belongs to one area; travel moves the player between area sims (state kept: health, cooldowns, buffs). Areas with nobody in them sleep (no ticks) and wake when someone arrives. | The arena already runs a second map in its own room; this generalises it inside one room |
| Client: `place.js` grows from world ↔ arena to any region id (the same refill swap); a region's built map is cached so going back is quick | Builds on what works |
| Saves: the world save keeps per-region state (chests, opened graves, quest objects) under the region id; the hero remembers region + spot | — |

**Current map → Brightwater Vale, levels 1-5** (owner). BUILT: every level on the map remapped (the Vale 1-3, the Wilds
3-5), quest XP ×0.3 and kill XP ×0.35 so the whole story ends round level 6; the Barrow King stays (see §2). Planned
first (not done): the Thornmere half's 5-10 content moving to the Graveyard / Catacombs; Thornmere's camps are re-levelled 3-5 with its beasts,
goblins and the bridge troll; the main-story quests that pointed at barrows point at the Graveyard instead. The map
itself stays (owner 2026-11-26: keep the hand-made regions).

## 2. The Old Graveyard (region, levels 3-8)

Name: **Ashfield** (the region), **the Old Graveyard** (the walled cemetery), **the Catacombs** (below). Plain names
(banned-names.md).

**Layout** (generator `graveyard`, about 360 × 360 m):
- **Ashfield Crossing** (the arrival, safe): a small hamlet at the road's end — a gravedigger's hut, a chapel with a
  priest, a lantern-lit inn, a shrine (respawn), a vendor. **Quests start here before you ever step in the cemetery**
  (owner): the priest (the dead are rising — clear the chapel yard, find the sexton), the gravedigger (bring back three
  family rings from named graves = the easter-egg graves), a widow (her husband's grave was robbed — a named grave
  robber), a hunter (ghouls taking sheep — the outer fields). Level 3-5 quests here, 6-8 inside.
- **The Old Graveyard**: a big walled cemetery on rolling ground in fog, 4 quarters (Paupers' Field, Old Families,
  the Chapel Yard, the Mausoleum Hill) with a crypt gate on the hill. Iron fences, a ruined chapel, dead trees (big —
  rule: trees 10-15× a person), crows, candles on a few graves, wisps of ground fog (no wisp CREATURES — rule 72).
- **Two catacomb entrances** (owner: one waypoint, several entrances): the Mausoleum Hill crypt (main) and a collapsed
  grave in the Paupers' Field (a shortcut down that opens after quest 2). One **waypoint** (a lantern post) at Ashfield
  Crossing.
- **Fog + spook**: thick ground fog (the weather system's fog with a low height band), a cold blue-green grade, distant
  bells, wind in dead branches, a crow that lifts off when you come near, lanterns that gutter. Night-lean light all day.

**Gravestones — procedural placement** (`js/world/regions/graves.js`, pure, reusable for any cemetery):
- Plots on a **grid per quarter** that bends with the ground and the paths (rows follow the quarter's long axis, a
  little jitter, rows broken by paths, trees and tombs); each quarter has its own **style mix** (Paupers': wooden
  crosses + plain slabs, leaning, sunk; Old Families: tall headstones, obelisks, iron-railed family plots; Chapel Yard:
  table tombs, angels; Hill: mausoleums). Lean, sink, moss and broken tops are rolled per stone (seeded).
- Kit: stones from the House Kit's painted stone atlas + a few made-to-order Kenney/Quaternius CC0 graveyard pieces
  if they exist in `playground/assets` (check first), otherwise built from boxes with bevels and the painted atlas.
  Drawn instanced (thousands of stones, one draw per kind).
- **Every stone has a name and dates** (Name Forge: per-race names) shown when you look at it up close — cheap charm,
  and the easter-egg graves are found by name.

**Open graves (easter eggs)**: ~1 in 60 plots is an **open grave** (a dug hole with a mound and a spade). Use it →
loot window. Seeded per grave: 70% a small cache (gold, a ring, an old weapon), 20% **a skeleton climbs out** (a fight,
then the loot), 8% **a named dead** (a unique named undead with a better drop — "Old Tom Harrow, Grave Robber"), 2% a
**family ring** for the gravedigger's quest. Per player (individual loot), refills after a long time. A few **named
graves** are fixed (story ones), the rest are rolled.

**Monsters** (3-8): skeletons (warrior, archer — Model Library Meshy), zombies (Model Library), hollowborn, barrow
ghouls, wraith knights (fal), cultists at the chapel, crows (critter), grave rats; named: the grave robber, the sexton
(gone wrong), **changed while building:** the Barrow King stays the Vale's final boss (his story is wired to the Seal-Stones; at
level 5 now, and his ending points the hero to Ashfield) — the Catacombs' end boss is a new one, **the Deep King**. The Model Library's Meshy mobs get used here — the
owner said to remind when Oathwild is worked on: **skeleton_warrior, skeleton_archer, zombie, cultist, goblin_guard,
goblin_shaman, ogre, orc_warrior** are ready.

## 3. The Catacombs — a reusable dungeon system (the careful part)

The owner's picture: **wide open spaces with tall columns** (the Moria halls) with goblins and trolls (a goblin warren
broke into the deep catacombs), and the dead above. Levels 6-8.

**One module family, reusable for every future dungeon** (`js/world/dungeon/`, pure):

| Part | What | Fixes Thousandvale's |
|---|---|---|
| `plan.js` | Seeded plan on a **2 m tile grid**: rooms (kinds: hall, pillared hall, crypt, ossuary, chapel, goblin den, troll pit, boss hall), corridors (≥ 6 m wide — spacious, owner), stairs between levels as ramps inside ONE space (no side-by-side floors with void between) | void gaps, tight rooms |
| **Spacious rule** | every walkable tile has ≥ 4 m of open floor around the camera line: rooms ≥ 16 m, halls 30-60 m with **columns 2-3 m thick, 14-24 m tall**, ceilings 10-24 m (vaulted), corridors 6-8 m wide, 6+ m high; checked by a test (camera boom of 6 m never clips the ceiling or a wall from any floor tile at any yaw) | camera pulled in |
| `walk.js` | The **walk grid** = the ONE truth for where feet go: player, monsters, pets, knockbacks, spawns, loot all ask it. A move is **swept** in steps ≤ 0.5 m (half a tile); a body that ends up off the grid (knockback, lag, bad spawn) is **snapped back to the nearest walkable tile** — never "already blocked, so free to move" | walking into the void |
| `sight.js` | **Line of sight** on the grid (DDA through tiles + column circles) with a cache; **aggro needs sight AND a path of ≤ N steps**; pack mates join only if THEY can see the fight; shots stop at walls (and show the hit) | aggro through walls |
| `path.js` | A* on the walk grid (cached flow fields per target room); monsters lose interest and walk home when the path is long; never teleport home | teleport patches |
| `encounters.js` | Packs placed on **open tiles** in a room, spread out; elite / named / boss rooms; a goblin warren side wing; a troll in a pillared hall; patrols along corridors | packs on walls |
| `features.js` | Levers + gates (gate shut = wall in the walk grid; a test that the boss can't be reached while it is shut), secret doors, ossuary walls, sarcophagi (lootable, sometimes a skeleton), collapsed floors, a bridge over a chasm (the chasm is NOT walkable; a ledge test) | — |
| Draw (`js/client/render/dungeon-draw.js`) | Floors, walls, **ceilings** (vaulted), **columns** (instanced, painted stone atlas), torches + braziers (the shared light pool), drifting dust, deep fog in the halls, darkness beyond the torch light (the halls feel huge), wall pieces only where they touch floor, merged by kind (few draw calls) | no ceiling |
| Camera | Indoors: the boom shortens smoothly against the ceiling / walls (sphere cast on the grid + ceiling height), never pops; spacious rooms keep it long | — |
| Entering | The catacombs are a **region of kind `dungeon`** (its own area sim), entered from the graveyard's two entrances; inside, stairs between levels; an exit by the boss and back at the entrances | — |

**Catacombs plan (first build):** Level 1 *The Ossuary* (crypts + ossuary halls, skeletons, zombies, 6), level 2 *The
Pillared Deep* (the big column halls, goblin warren side wing, a troll in the deep hall, 7), level 3 *The Barrow
Throne* (the Barrow King, 8). Seeded once per world (the same for everyone in that world), so it can be learned.

## 4. Maps, waypoints, quest tracker

- **Map (M) = "Places"**: a list of every place you know of — regions, towns, waypoints, dungeons — each row: name,
  level range (coloured vs your level), region, how far / how to get there ("Travel from Brightwater Vale's east road
  gate" / "Waypoint: Ashfield Crossing — unlocked"), Travel button when a waypoint is unlocked. Sort by level, by
  distance, by name; filter: all / unlocked / quests here. A small picture per region (its loading art).
  The current drawn map of the region you stand in stays as a tab ("This region").
- **Waypoints**: a lantern post per town / region hub; touching it unlocks it; Travel from any waypoint or the Places
  list to any unlocked one (small gold cost, not in a fight). One in Ashfield Crossing; the Vale keeps its towns'.
- **Quest waypoints**: the tracked quest's next goal has a marker — on the minimap (a gold diamond, an arrow on the rim
  when outside it), on the region map, and a floating marker in the world at its spot (fades near). When the goal is in
  another region, the marker points to the travel point / waypoint that leads there ("→ Old Graveyard via the east
  road").
- **Quest tracker** (right side): up to 3 tracked quests, each: name, **region**, the current step with counts
  ("Skeletons 3/8"), distance; tap one → it becomes the marked one; colour by level.

## 5. Other zones to plan (from the models we have)

| Zone | Levels | Kind | Monsters (models we have) |
|---|---|---|---|
| **Saltmere Fen** — a drowned marsh with stilt villages | 6-9 | `fen` | lizardfolk (Model Library), bog lurker, marsh hag, fen harpy, drowned brute, water elemental (fal) |
| **Greystone Quarry** — terraced open-pit quarry and mine tunnels (a `dungeon` reuse) | 7-10 | `quarry` + `dungeon` | stone golem, earth elemental, minotaur, hill ogre, orc grunts (fal), ogre + orc warrior (Model Library) |
| **Lantern Abbey** — a fortified hilltop abbey of a fallen order | 9-12 | `stronghold` | lantern guards, kiln monks, zealots, silver knights, lantern priest (fal Wyrmroad set), fire elemental; bosses Isolde / Aldric |
| **Goblin Warrens** — the warren from the Catacombs' side wing, its own dungeon | 5-8 | `dungeon` (cave theme) | goblins (fal + Model Library guard/shaman), goblin warchief, trolls, cave bats |
| **Dragonback Cliffs** — wind-swept cliffs, rope bridges, eyries | 11-14 | `cliffs` | drakes, air elementals, harpies, winged imps (fal) |
| **Bandit Hills** — a road through hills with bandit forts | 4-7 | `wilds` reuse | bandits, bounty hunters, crossbowmen, bandit chief (fal), bandit + archer (Model Library) |

Levels above 10 need the level cap raised (round 1 cap 10; the game's plan is 30) — a later round.

## 6. Order of work

1. ✅ XP + monster sizes (done).
2. Regions core: server areas, travel points, loading screen, client place swap for any region, saves (tests: travel
   through the real server, two players in two regions, save/reload in a region).
3. Places map + waypoints + quest markers + tracker (with region).
4. The Vale → 1-5 (re-level Thornmere, move the undead + barrow story to the Graveyard).
5. Graveyard generator + gravestones + open graves + Ashfield Crossing quests + fog look.
6. Dungeon system (plan / walk / sight / path / encounters / features / draw / camera) + the Catacombs; then aggro by
   sight + the walk grid also used outdoors where it helps.
7. Balance (sim per bracket), tests, the walk, What's new, publish.

Decided without asking (veto any): shared regions, travel alone, Ashfield / Old Graveyard / Catacombs names, the
catacombs seeded per world, open-grave odds, Codex art for loading screens, other zones as a plan only.
