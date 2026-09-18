# Farhold — Town & World Expansion

The plan for turning settlements from "twenty building types scattered along radial spokes" into
places that feel built by somebody, and for filling the ground between them.

**Where we are now.** `js/town-plan.js` is 89 lines: a table of 20 building types
(`BUILDING_INFO`), a `wantsFor(size)` list, a `streetPlan()` that fires 2–6 straight-ish spokes out
of a central square, and `footprintOf()`. `js/features.js` `buildSettlement()` walks that plan and
drops instanced meshes. Every town on every world uses the same twenty models, the same spokes and
the same palette.

**What is wrong with it, in the user's words.** Houses sit on roads. Roofs do not line up with
walls. Alleyway roads clip beneath the surface texture. All the towns look and feel the same, and
they do not feel natural. Landmarks are "a couple of random models thrown on top of a coordinate
location". Gates are rotated ninety degrees and do not reach the walls. Roads between cities weave
back and forth instead of merging.

**The shape of the fix.** Three ideas carry most of this document:

1. **A plot is the unit, not a building.** Nothing is placed at a coordinate any more. The generator
   cuts the enclosed area into *plots*, each plot gets a *lot* with a street frontage, and a
   building is fitted **inside** its lot. A house cannot sit on a road because a road is not a plot.
2. **A building is a kit, not a model.** Footprint → storeys → roof → trim → colour, assembled from
   parts. Twenty models become thousands of buildings, and a roof lines up with its walls because
   the roof is generated *from* the wall rectangle rather than placed near it.
3. **A culture is a parameter set.** Human, elf, dwarf, undead and the rest are not new codebases;
   they are different part tables, palettes, plot rules and street grammars over the same generator.

**Tuning happens outside the game.** `playground/proctown/` (section 2) is a standalone experiment
that imports the same planner and renders it to a canvas with every knob exposed. Farhold imports
the planner from there, so tuning the experiment tunes the game.

---

## 1. The town plan: from spokes to a real layout

The current radial spokes are why every town reads the same and why buildings land on streets.
Replace the whole placement step.

| # | Item | Recommendation |
|---|---|---|
| 1.1 | Replace `streetPlan()` spokes with a **street graph** | Nodes and edges, not headings and lengths. Everything downstream consumes the graph. |
| 1.2 | **Seed the graph from approach roads** | The inter-town roads that already reach the settlement become its main streets. A town points at its neighbours. |
| 1.3 | **Street hierarchy**: highway → main → lane → alley | Four widths, four surfaces, four rules about what may front onto them. |
| 1.4 | **Block subdivision** | Recursively split each enclosed block by its longest axis until blocks are plot-sized. This is the single biggest win. |
| 1.5 | **Plots carry frontage** | Each plot records which edge touches a street. Buildings face that edge; doors are never on a blank side. |
| 1.6 | **Setback per street class** | Houses on a lane sit tight to the kerb; halls on a main street set back to leave a forecourt. |
| 1.7 | **No building outside its plot — enforced** | Fit the footprint inside the plot rectangle or drop to a smaller base. A test asserts zero building-street overlap. |
| 1.8 | **Plot-fill pass** | Leftover plot area becomes yards, gardens, pens, woodpiles, washing lines — the clutter that makes a town look lived in. |
| 1.9 | **Organic vs planned street grammar** | Two generators: grown (irregular, curved, medieval) and planned (grid, orthogonal). Culture picks. |
| 1.10 | **Terrain-aware streets** | Streets follow contours and switchback on slope instead of running straight up a hill. |
| 1.11 | **A real central space** | A market square, green, or plaza as an actual polygon that blocks building, not just an empty radius. |
| 1.12 | **Districts** | Tag blocks: craft, residential, market, civic, poor. Building selection reads the tag. |
| 1.13 | **Density falls with distance** | Tight in the centre, loose at the edge, farm plots beyond the wall. |
| 1.14 | **The wall follows the plan** | Build the wall around the finished plan's hull rather than at a fixed radius. |
| 1.15 | **Gates where roads meet the wall** | A gate exists because a road crosses the wall line — which also fixes the gate rotation bug (section 5). |
| 1.16 | **River and coast awareness** | A town on water gets quays, a waterfront street, and bridges at real crossings. |
| 1.17 | **Deterministic from `(worldSeed, nodeId)`** | Same town every visit, nothing stored. |
| 1.18 | **Plan is pure, no Three.js** | Lives in the planner module so `node --test` can check it. |
| 1.19 | **Plan cached per settlement** | Generate once on approach, reuse. |
| 1.20 | **Debug overlay** | Draw plots, frontages, districts and street classes as coloured polygons on request. |

---

## 2. `playground/proctown/` — the tuning experiment

A standalone playground experiment so towns can be tuned without discovering them in game.

| # | Item | Recommendation |
|---|---|---|
| 2.1 | **New experiment folder** | `proctown/` with `index.html`, `README.md`, `js/`, `data/`, `tests/` per playground convention. |
| 2.2 | **The planner is the shared module** | `proctown/js/townplan.js` is the one true planner. Farhold imports it. Tuning here tunes the game. |
| 2.3 | **2D canvas renderer first** | Plots, streets, buildings as polygons. Fast to read, fast to iterate. |
| 2.4 | **3D preview second** | The same plan through Farhold's builder, in an orbit camera. |
| 2.5 | **Seed box + reroll** | Type a seed, or step through seeds with arrow keys. |
| 2.6 | **Every knob exposed** | Size, culture, density, terrain slope, river, wealth, age, street grammar. |
| 2.7 | **Side-by-side compare** | Four seeds at once, to catch sameness immediately. |
| 2.8 | **Culture switcher** | Flip a town between human/elf/dwarf/undead and watch it re-plan. |
| 2.9 | **Overlay toggles** | Plots, frontage arrows, districts, street class, collision footprints. |
| 2.10 | **Batch sameness report** | Generate 200 towns, report distribution of shapes/buildings/colours. Numbers, not vibes. |
| 2.11 | **Overlap validator** | Flags any building intersecting a street or another building. Should read zero. |
| 2.12 | **Walkability check** | Flood-fill from each gate; every door must be reachable. |
| 2.13 | **Export a plan as JSON** | Paste into a bug report or a test fixture. |
| 2.14 | **Import a plan** | Reproduce a reported town exactly. |
| 2.15 | **Building kit gallery** | Every base × roof × material, on one page. |
| 2.16 | **Palette editor** | Tune culture palettes live, export JSON. |
| 2.17 | **Performance readout** | Instance count, draw calls, triangles per town. |
| 2.18 | **Node tests on the planner** | Determinism, no overlap, reachability, size scaling. |
| 2.19 | **Playground integration** | Card on `playground/index.html`, row in `CLAUDE.md`, line in `~/claude/docs/playground.md`. |
| 2.20 | **Farhold regression guard** | A test that Farhold's import and the experiment's own use produce identical plans for a seed. |

---

## 3. The building kit: parts, variety and colour

Twenty fixed models is the root cause of "all the towns look and feel the same".

| # | Item | Recommendation |
|---|---|---|
| 3.1 | **Buildings assemble from parts** | `{ footprint, storeys, roof, door, windows, trim, chimney, colour }`. |
| 3.2 | **Roof is generated from the wall rectangle** | Fixes "roofs don't line up with walls" permanently — the roof cannot be misaligned because it is derived. |
| 3.3 | **Roof types** | Gable, hip, half-hip, gambrel, mansard, flat, domed, conical, sawtooth, pagoda, turf, tent. |
| 3.4 | **Roof materials** | Thatch, slate, clay tile, wood shingle, turf, lead, canvas, bone. |
| 3.5 | **Wall materials** | Timber frame, wattle-and-daub, cut stone, rubble, brick, log, plaster, carved trunk, fungal chitin. |
| 3.6 | **Storey mixing** | Stone ground floor, timber upper. Jettied upper storeys that overhang the street. |
| 3.7 | **Palette per culture per region** | Colour comes from local materials, so a region reads as one place. |
| 3.8 | **Weathering by wealth and age** | Poor districts get patched roofs and leaning walls; rich get paint and glazing. |
| 3.9 | **Door and window grammar** | Placement follows frontage and storey, not random scatter. |
| 3.10 | **Signage on trade buildings** | A hanging sign with a glyph — anvil, loaf, tankard. Reads at a distance. |
| 3.11 | **Chimneys, smoke and light** | Smoke by day, warm window light at night. The cheapest "lived in" signal there is. |
| 3.12 | **Attached outbuildings** | Lean-tos, porches, stairs, balconies, cellar doors. |
| 3.13 | **Fences, hedges, garden walls** | Plot boundaries you can see. |
| 3.14 | **Street clutter** | Barrels, crates, carts, troughs, woodpiles, market awnings, lanterns. |
| 3.15 | **At least 12 house bases** | Long, square, L, courtyard, tower-house, row, round, stilted, dug-in, terraced, hall, stacked. |
| 3.16 | **Bigger civic buildings** | Guildhall, courthouse, bathhouse, library, theatre, mint, prison, lighthouse. |
| 3.17 | **Outdoor stalls as a first-class thing** | Cheap awning + table + goods, placed in squares and along main streets. The user asked for these specifically. |
| 3.18 | **LOD per building** | Full kit near, box-and-roof far, instanced impostor beyond. |
| 3.19 | **Instance budget honoured** | Keep `BUILDING_INFO.cap` discipline — one InstancedMesh per part type. |
| 3.20 | **Part gallery test** | Render every combination headless; fail on NaN geometry or a roof that misses its walls. |

---

## 4. Streets, alleys, squares and surfaces

| # | Item | Recommendation |
|---|---|---|
| 4.1 | **Street surfaces are meshes on the terrain, not decals** | Fixes "alleyway roads clip beneath the surface texture". |
| 4.2 | **Conform to terrain, with a skirt** | Sample the ground along the strip and drop a skirt at the edges so no gap shows on a slope. |
| 4.3 | **Flatten the ground under a street** | Small terrain deformation so the street is a street, not a ribbon over lumps. |
| 4.4 | **Street materials per class and culture** | Cobble, flag, gravel, dirt, boardwalk, mosaic, bone, fungal mat. |
| 4.5 | **Kerbs and gutters** | A lip where street meets plot; reads as construction. |
| 4.6 | **Junction geometry** | Proper corner fills so two streets do not X through each other. |
| 4.7 | **Squares as polygons** | Paved area, well or monument at the centre, stalls around the edge. |
| 4.8 | **Steps and ramps on slope** | A street that must climb gets stairs, not a ski jump. |
| 4.9 | **Alleys are narrow and irregular** | Between blocks, dim, good for thieves and shortcuts. |
| 4.10 | **Street lighting at night** | Lanterns on posts and brackets; the town glows from outside. |
| 4.11 | **Bridges where a street crosses water** | Real geometry with deck, rail and supports. |
| 4.12 | **Drainage and puddles in wet weather** | Ties into the weather system. |
| 4.13 | **Wear paths** | Where lanes meet, the ground is worn bare. |
| 4.14 | **Streets are walkable — collision correct** | No invisible lips to trip on. |
| 4.15 | **NPC pathing uses the street graph** | People walk streets, not through walls or across plots. |
| 4.16 | **Named streets** | Name Forge generates them; used in directions and quests. |
| 4.17 | **Market days** | The square fills with stalls on some days, empties on others. |
| 4.18 | **Street noise and ambience** | Tie `sfx/` ambience to district type. |
| 4.19 | **Street furniture placed by rule** | Wells at junctions, troughs near stables, notice boards at gates. |
| 4.20 | **Overlap test** | No street polygon may intersect a building footprint. Fails the build if it does. |

---

## 5. Walls, gates and defences

Includes the reported gate bug.

| # | Item | Recommendation |
|---|---|---|
| 5.1 | **Fix gate rotation** | Gates are rotated 90° exactly like walls used to be. Orient from the wall segment's tangent, the same fix walls got. |
| 5.2 | **Gates meet the wall flush** | Generate the gate to fill the wall gap exactly, so there is no daylight at the joins. |
| 5.3 | **The gate opening is OPEN** | The player must walk through the middle. Collision only on the jambs and towers. |
| 5.4 | **Guards posted outside the gate** | Two, facing out, with idle behaviour. |
| 5.5 | **Gate doors that animate** | Shut at night, open at dawn; the player can still pass. |
| 5.6 | **Wall follows the plan hull** | Not a circle at a fixed radius. |
| 5.7 | **Wall types by culture and wealth** | Palisade, earth rampart, rubble, cut stone, carved rock, bone, living hedge. |
| 5.8 | **Towers at corners and intervals** | Placed by wall geometry, not scattered. |
| 5.9 | **Wall walk and stairs** | A rampart the player can climb and walk. |
| 5.10 | **Gatehouse as a real structure** | Passage, portcullis, murder holes, rooms above. |
| 5.11 | **Barbicans on cities** | An outer work in front of the main gate. |
| 5.12 | **Moats and ditches where terrain allows** | With a bridge or causeway at the gate. |
| 5.13 | **Multiple gates on big cities** | One per approach road. |
| 5.14 | **Postern gates** | Small back doors, useful for quests. |
| 5.15 | **Unwalled settlements get a boundary** | Hedge, fence, ditch, boundary stones — so "entering" is still a real event (needed for waypoints). |
| 5.16 | **Watchtowers outside the wall** | On roads, with a line of sight back to town. |
| 5.17 | **Siege damage as a state** | A town that lost a war has breached walls and repairs. |
| 5.18 | **Gate tolls tie into factions** | Standing decides whether you pay. |
| 5.19 | **Guard reaction to standing** | Hostile factions refuse entry or attack. |
| 5.20 | **Test: every gate is passable** | Walk a capsule through each gate headless; fail if blocked. |

---

## 6. Racial and cultural cities

Not new code — new parameter sets over the same generator. World type and region decide which.

### Human — *the baseline: timber, thatch and compromise*
Organic grown streets, irregular blocks, jettied upper storeys overhanging the lane. Timber frame
with wattle-and-daub infill, thatch on the poor buildings and clay tile on the rich. Warm browns,
cream plaster, red-brown roofs. **Cornerstones:** a market square with a stone cross, a timbered
guildhall with a bell tower, a stone-and-mortar curtain wall with square towers, a gatehouse with a
portcullis. Cities sprawl and patch themselves; nothing is symmetrical.

### Elf — *grown, not built*
Streets follow the land exactly; almost no straight lines. Buildings are carved into or grown around
living trunks, with long curved eaves and tall narrow windows. Pale timber, silver bark, verdigris
copper, leaf greens. Roofs are shingled in overlapping leaf-shaped scales. **Cornerstones:** a
canopy hall spanning several trunks, spiral stairs around living trees, bridges between upper
storeys so the town has a second level, a boundary of living hedge and standing stones rather than a
wall. Light comes from hanging glass lamps.

### Dwarf — *cut, square and permanent*
Planned orthogonal grid, everything on axis, heavy setbacks. Cut stone and iron, no timber where
stone will do. Deep greys, iron black, brass and gold trim, banded colour courses. Buildings are
squat, wide, and built to outlast. **Cornerstones:** a great gate cut into a hillside as the real
entrance, above-ground blockhouses with flat lead roofs, a forge hall with permanent smoke and
glow, stepped terraces with stairs instead of ramps, a rampart of massive dressed blocks. Streets
are flagged and drained.

### Undead — *a town that is still standing out of habit*
The street plan of a human town that died, with plots collapsed and re-used. Bone, rotted timber,
cracked plaster, iron cages. Bruised purples, bone white, verdigris, sick green light. Roofs are
half-fallen; some buildings are scaffolds of bone. **Cornerstones:** a necropolis of tomb rows on a
grid, a bone-spire at the centre, a wall of stacked cages and fused bone, gates hung with chains,
braziers with green flame instead of lanterns. Nothing is repaired, everything is occupied.

### Orc — *built fast, from what was to hand*
Sprawling, no plan, blocks that grew by accretion. Rough timber, hide, scavenged stone and salvaged
metal. Soot black, blood red, raw iron. **Cornerstones:** a war-hall of stacked timber and hide, a
totem field of trophy poles at the entrance, pit fires, a palisade of sharpened trunks with skull
caps, arenas.

### Halfling / smallfolk — *dug in and comfortable*
Dense, low, curved lanes. Round doors, turf roofs, houses dug into banks. Greens, ochres, painted
doors. **Cornerstones:** a burrow row cut into a hillside, a communal bakehouse and brewery, a
green with a party tree, no wall at all — just hedge and gate.

### Desert / nomad — *shade is the architecture*
Tight shaded alleys, flat roofs used as living space, courtyards. Mud brick, plaster, canvas.
Sand, white, indigo, terracotta. **Cornerstones:** a covered bazaar, a stepped well, wind-catcher
towers, a caravanserai at the gate.

| # | Item | Recommendation |
|---|---|---|
| 6.1 | **`data/cultures.json`** | One record per culture: palette, part tables, street grammar, plot rules, wall type, cornerstones. |
| 6.2 | **Culture chosen by world + region** | Biome, faction and Name Forge race already exist — read them. |
| 6.3 | **Seven cultures at minimum** | Human, elf, dwarf, undead, orc, halfling, desert. |
| 6.4 | **Each culture gets ≥3 unique bases** | Not recolours — different silhouettes. |
| 6.5 | **Each gets a cornerstone building** | The thing you recognise the culture by from the hill. |
| 6.6 | **Each gets its own wall and gate** | Palisade vs cut stone vs living hedge vs bone. |
| 6.7 | **Each gets its own street surface** | Cobble / root-path / flag / bone. |
| 6.8 | **Each gets a distinct night look** | Lantern colour, window glow, brazier flame. |
| 6.9 | **Culture drives NPC appearance** | Matches the race already in `js/town.js`. |
| 6.10 | **Culture drives shop stock** | Dwarves sell armour; elves sell bows; undead sell nothing pleasant. |
| 6.11 | **Mixed settlements** | A border town with two cultures in different districts. |
| 6.12 | **Ruined variants** | Every culture needs an abandoned version for landmarks. |
| 6.13 | **Culture-specific ambience** | Forge ring, wind chimes, chanting. |
| 6.14 | **Culture affects street grammar** | Grown vs planned vs terraced vs sprawl. |
| 6.15 | **Culture affects density and height** | Dwarves build squat; elves build tall and thin. |
| 6.16 | **Greeting and naming conventions** | Name Forge already has per-race languages — use for street and building names. |
| 6.17 | **Faction banners and heraldry** | Colours on walls and gates from `data/factions.json`. |
| 6.18 | **A culture reads correctly at a distance** | Silhouette test from 500 m. |
| 6.19 | **No third-party IP** | Original names, original aesthetics. |
| 6.20 | **Gallery page in `proctown/`** | One town per culture, side by side. |

---

## 7. Enemy structures: camps, forts and castles

| # | Item | Recommendation |
|---|---|---|
| 7.1 | **Bandit camp as a site type** | Tents, fire, palisade, lookout, picketed horses, loot pile. |
| 7.2 | **Every bandit camp has a chest** | The user asked specifically. Rarity scales with camp size. |
| 7.3 | **Every camp has a named boss** | Name Forge name, champion modifiers, a real reason to clear it. |
| 7.4 | **Camps tie into quests** | Clearing one closes a job; the job generator already binds to real things. |
| 7.5 | **Camps respawn or are taken over** | A cleared camp becomes ruins, then someone else moves in. |
| 7.6 | **Fort: a real defensible structure** | Walls, a gate, towers, a keep, a garrison, a courtyard. |
| 7.7 | **Castle: the big one** | Curtain wall, barbican, keep, great hall, courtyard, dungeon below. |
| 7.8 | **Castles connect to dungeons** | The existing `js/dungeon.js` interior system hangs off the keep. |
| 7.9 | **Watchtowers on roads** | Small, fast to generate, held by whoever holds the zone. |
| 7.10 | **Siege camps** | Outside a contested town, tied to The Territory's holder. |
| 7.11 | **Cave mouths and mine entrances** | Dungeon entrances with real approach geometry. |
| 7.12 | **Cult sites** | Standing stones, altar, braziers, robed enemies, a ritual in progress. |
| 7.13 | **Beast lairs** | Bone fields, nests, a den mouth, a giant occupant. |
| 7.14 | **Structures are faction-owned** | Reads from `data/factions.json`; standing decides reaction. |
| 7.15 | **Prisoners to free** | Cages with NPCs; freeing them earns standing and a follower. |
| 7.16 | **Enemy structures are placed by the world, not scattered** | On roads, at passes, overlooking valleys — where a real garrison would go. |
| 7.17 | **Garrison scales with zone level** | And with how strongly the faction holds the zone. |
| 7.18 | **Interiors for the big ones** | Keep and cult site at least. |
| 7.19 | **Visible from distance** | A castle should be a landmark you navigate by. |
| 7.20 | **Marked on the map when discovered** | With an icon per type. |

---

## 8. Landmarks and points of interest with a purpose

The user: landmarks are "a couple of random models thrown on top of a coordinate location", and
"there should be a purpose for going to every point of interest".

| # | Item | Recommendation |
|---|---|---|
| 8.1 | **Every POI has a reward hook** | Quest, prisoner, chest, lore, shortcut, buff, or a merchant. No empty visits. |
| 8.2 | **Landmarks get real geometry** | A composed set piece with approach, centre and surroundings — not three props. |
| 8.3 | **Scale up** | A landmark should be visible from the next ridge. |
| 8.4 | **Ruined settlements** | Reuse the town generator with a ruin pass — instant variety, no new models. |
| 8.5 | **Standing stone circles** | With a mechanic: a buff, a puzzle, or a teleport. |
| 8.6 | **Battlefields** | Bones, broken weapons, a lootable cache, a ghost encounter. |
| 8.7 | **Bridges as landmarks** | Great spans over gorges, with a toll or a guard. |
| 8.8 | **Statues and monuments** | Faction-themed, with lore and a small buff. |
| 8.9 | **Shrines** | Rest, revive, or a blessing — ties to the revive rule. |
| 8.10 | **Abandoned mines** | Dungeon entrance plus surface structures. |
| 8.11 | **Lighthouses and beacons** | Lightable; reveals map area. |
| 8.12 | **Hermits and hedge-wizards** | A single NPC with a unique service. |
| 8.13 | **Crashed ships / fallen stars** | Ties to the space layer; rare materials. |
| 8.14 | **Natural wonders** | Geysers, crystal fields, sinkholes, waterfalls. |
| 8.15 | **Farmsteads and outlying buildings** | The transition between wilderness and town. |
| 8.16 | **Graveyards outside towns** | Undead at night. |
| 8.17 | **Every POI type gets a map icon** | Distinct silhouette. |
| 8.18 | **POI density tuned per zone** | Enough to find, not so many they are noise. |
| 8.19 | **Discovery is rewarded** | XP and a journal line on first arrival. |
| 8.20 | **Test: no POI without a purpose** | A table-driven test that every POI type has a reward hook. |

---

## 9. Roads, bridges and traffic between towns

| # | Item | Recommendation |
|---|---|---|
| 9.1 | **Road hierarchy** | Highway, road, track, path. Width, surface and priority per class. |
| 9.2 | **Roads MERGE rather than weave** | The reported bug. When two roads run within a merge distance, snap the lower-class one onto the higher-class one and share the corridor. |
| 9.3 | **Merge at junctions, not gradually** | Two roads meet at a node and continue as one; no parallel weaving. |
| 9.4 | **Corridor reservation** | Once a road claims a corridor, no other road may run inside it without joining. |
| 9.5 | **Roads have collision** | The reported bug — you walk through them. Surface must be walkable geometry. |
| 9.6 | **Road surface conforms to terrain** | With a skirt, as with streets. |
| 9.7 | **Bridges are real, not paper** | Reported: "the road surface is paper thin and looks off" over rivers. Deck thickness, supports, rails, abutments. |
| 9.8 | **Bridge type by span and culture** | Log, plank, stone arch, multi-arch, rope, carved. |
| 9.9 | **Fords where a bridge is not warranted** | Shallow crossing, slows you, no bridge. |
| 9.10 | **Terrain flattened under roads** | No more ribbons over lumps. |
| 9.11 | **Switchbacks on steep ground** | Rather than straight up the hill. |
| 9.12 | **Milestones and signposts** | Distance and direction to the next town; readable. |
| 9.13 | **Roadside shrines, wells, rest stops** | Small, frequent, give the road rhythm. |
| 9.14 | **Wandering merchants on the roads** | With a pack animal and stock; buy and sell in the field. |
| 9.15 | **Traders and caravans between towns** | `js/caravans.js` exists — give it visible bodies and vehicles. |
| 9.16 | **Patrols on roads** | `js/patrols.js` exists — same treatment. |
| 9.17 | **Random road events** | Ambush, broken cart, refugee, duel, funeral procession. |
| 9.18 | **Toll gates on highways** | Faction-owned, standing decides the price. |
| 9.19 | **Roads visibly busier near cities** | Traffic density scales with settlement size. |
| 9.20 | **Test: no two roads within merge distance running parallel** | Fails the build if they weave. |

---

## 10. Waypoints, fast travel and the map

| # | Item | Recommendation |
|---|---|---|
| 10.1 | **One waypoint design, everywhere** | A round concrete pad with arcane sigildry cut into it, **identical on every world and in every culture**. Dark and inert until activated; the sigils light when it is. It is not a local monument — it is one network, and it must read as one thing. |
| 10.2 | **Activated by ENTERING the town** | Crossing the boundary is enough. No need to walk to it. The pad lights up wherever it is standing. |
| 10.3 | **Always present, even before activation** | Diablo 2 rules, as requested. Shown greyed on the map. |
| 10.4 | **Click a waypoint on the map to travel** | Between activated waypoints only. **You arrive standing on the sigil**, never beside it or above it. |
| 10.5 | **Keep "Go here" for debugging** | The user considers it cheating but wants it retained. Mark it as a debug tool. |
| 10.6 | **Waypoints saved per world** | Part of the save, like the map's learned region names. |
| 10.7 | **Travel costs time** | In-game hours pass; it is fast travel, not teleportation. |
| 10.8 | **Travel is blocked in combat** | And underground. |
| 10.9 | **A travel animation or screen** | Not an instant cut. The sigils spin up, the light rises, and you are gone. |
| 10.10 | **Waypoint list in the journal** | With zone, level band and the faction holding it. |
| 10.11 | **Towns and cities ONLY** | No waypoint at a bandit camp, fort, cult site, ruin or any other hostile landmark. A waypoint is somewhere safe you can always get back to; putting one in a camp you have to fight through defeats the point. Player-built bases are the one exception — see `BUILDING_EXPANSION.md`. |
| 10.12 | **Waypoints on the minimap** | With a rim arrow when off screen. |
| 10.13 | **Map shows discovered POIs** | With their purpose as a hover line. |
| 10.14 | **Map filter by type** | Towns, POIs, enemy structures, waypoints. |
| 10.15 | **"Copy Location" on the map** | Requested — seed, planet, biome, x, z, altitude. |
| 10.16 | **Map legend covers every icon** | Nothing unexplained. |
| 10.17 | **Route preview** | Draw the road route between two points. |
| 10.18 | **Distance and travel-time readout** | On hover. |
| 10.19 | **The Town Portal** | Travelling to a waypoint opens a **portal at that waypoint back to where you just were**. Step through it to return. Opening a new one closes any existing portal, so there is never more than one. Full design in `BUILDING_EXPANSION.md`. |
| 10.20 | **Test: every settlement has exactly one reachable waypoint** | And entering the boundary activates it. |

---

## Order of work

Each phase leaves the game playable.

1. **Section 2** — stand up `proctown/` with the planner extracted. Nothing visible changes in game.
2. **Section 1** — replace spokes with the plot generator inside `proctown/`, tuned there.
3. **Section 4 + 3** — street meshes and the building kit. This is where towns stop looking the same.
4. **Section 5** — walls and gates, including the rotation bug.
5. **Section 6** — cultures, one parameter set at a time.
6. **Section 9** — road hierarchy, merging, collision and real bridges.
7. **Section 7 + 8** — enemy structures and POI purpose.
8. **Section 10** — waypoints and the map.

## Tests this must not break

`npm run test:unit` (1117 node tests) and `npx playwright test prototypes/farhold/tests/`
(108 page tests). New tests required: planner determinism, zero building-street overlap, gate
passability, every POI has a purpose, no two roads weaving, every settlement has one waypoint.
