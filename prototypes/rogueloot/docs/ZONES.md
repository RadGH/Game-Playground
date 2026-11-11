# Rogueloot — Act 1 zones (design)

Written by Fable, 2026-11-10, for PLAN §0 rulings 4, 6, 14, 15, 16, 22, 25, 32–34, 37. The data is `data/acts.json`
(the world map) and `data/zones/*.json` (the hand-made zones, the format is the header of `js/world/zone.js`); this
page is the *why*. Plain language. North is up on screen (-z), east is +x, one unit is a metre, a hero walks 4.6 m/s.

Built so far: the town **Brightwater**, **Saltgrass Shore** (levels 1–3) and **Windmill Fields** (levels 3–5). The
rest of the act is laid out on the map with levels, links and story gates, and `built: false`.

## The act map

```
                       Sunken Ruins (17-18) ─── Gravewatch Hills (18-20) ─── [Deep Catacomb 19-20, act boss]
                      /                                    
        Highcairn Pass (13-15) ─── Redcliff Heights (15-17) ─── [Warband Mine 16-17]
             |
  [Elder Roots 12] ─ Elderglade (9-11) ─── Mirefen (11-13) ─── [Mire Crypt 14]
                            \               /
   [Thornwood Hollow 7] ─ Thornwood (5-7) ─ King's Road (7-9) ─ [Old Barrow 9-10]
                               |
   [Tidecaves 3-4] ─ Saltgrass Shore (1-3) ─ Windmill Fields (3-5) ─ [Mill Cellars 5]
                               |
                          BRIGHTWATER (town)
```

PoE-style: the town sits at the bottom of the map screen and the act climbs to the top right. Every zone has a town
portal that opens on a story gate (`portalAfter` in acts.json): the shore is open from the start; the fields open
when you reach the shore's beach gate; Thornwood opens after Gristmaul in the Mill Cellars; the King's Road after
Mother Thrum; Elderglade and the Old Barrow after the road; Mirefen after Ildreth; the Pass after Sister Vennel;
Redcliff after the Pass; the Sunken Ruins after Warlord Ruhk; Gravewatch after the ruins. Dungeons are entered from
an `entrance` marker inside their zone and have no portal of their own. Waypoints inside zones are the fast travel
(ruling 33); one waypoint per zone, mid-zone, so a session always starts with a short walk to the next fight.

**Main quest (12 steps, one per gate):** Crabs on the Landing → The Beach Gate → Under the Headland (Clatterjaw) →
The Miller's Cellar (Gristmaul) → The Brood Below (Mother Thrum) → Toll Road → The Hall of Records (Reeve Oswin) →
The Wilted Verse (Ildreth) → The Drowned Bell (Sister Vennel) → Over the Pass → The Black Stag (Ruhk) → The Sealed
Lord (Harrowmund). Each zone also carries one `quest` marker for a side errand (Old Pincer's pool, the beach gate, the
burned farmstead, the warband camp) so the elder has something to hand out before the main step is done.

**Pacing budget (ruling 37, ~30 min a level):** a zone's main road is 420–480 m with a fight every 25–35 m and quiet
stretches at the waypoint and the landmarks; side trips add about as much again. Spawn levels climb across the
band — the shore is 1 at the hamlet, 2 around the waypoint, 3 at the headland and the gate — so a player who walks the
road meets each level in order and a player who detours meets it early.

## Brightwater (the town, 120 × 120 m)

A harbour town on a sandy coast; the sea is the whole south edge. Everything a player needs is within 45 m of the
plaza, and nothing spawns.

- **Plaza** (cobble circle, 0,0): the `start` marker, the **waypoint** stone north of it, a well, torches, the
  **Elder Maudry Tern** (quests) by the well, and **Old Wendel Ashby — Trainer** (specs and respecs, ruling 10) at the
  three standing stones on the plaza's north-east edge.
- **Portal plaza** (north, cobble circle under the palisade): ten `portal_ring` props on one arc from west over north
  to east, in act order (Saltgrass Shore on the west end, Gravewatch Hills on the east), a banner between each pair,
  torches, a small stone in the middle. Each `portal` marker is 2.8 m inside its ring so a player walks *into* the
  ring. They read as one plaza because they share the cobble and the arc.
- **Market** (east): three tents with crates and barrels, a cart, banners. **Maren Tidewell — Vendor** (buy / sell),
  **Bram Oddkettle — Potions**, **Lucky Pell — Gambler** at the cart.
- **West street**: **Tamsin Ironwright — Crafter** at a house with a forge fire out front; **Hollis Keep — Stash** at
  the house across the road (a `stash` marker beside the npc).
- **Mercenary hall** (north-west yard with a watchtower, banners, a tent, a fenced yard): **Captain Idra Vane —
  Mercenaries** (ruling 31).
- **Houses** on both streets and the north-east lane, three huts, fences, a haystack and a well on the farm side.
- **Docks** (south): three docks over the water, crates, barrels, a log, torches, palms along the sand, reeds and
  pebbles at the water line.
- **Palisade** along the three landward sides with watchtowers at two corners — the town is a frontier stockade,
  which is the whole mood of the concept art.

## Saltgrass Shore (levels 1–3, 300 × 300 m, table `saltgrass_shore`, theme `shore`)

The sea runs down the whole west side with a long beach; grassland and dunes inland; a creek crosses from the east
hills to the sea; the north-west is a rocky headland with the lighthouse ruin on it and the tidecaves under it; the
north-east is a pine wood. The warband's beach gate and the exit to the fields are in the north-east corner, as far
from the start as the zone allows.

Walked from start to exit:

1. **Saltgrass Landing** (south): the `start` and the exit back to town are on the road at the beach. Two huts, a
   campfire, fences, a cart, a dock out on the water, a crate chest (level 1). The first two crab packs are on the
   beach either side of the hamlet (level 1) and a pair of gullhawks patrols the south beach. Quiet enough to learn
   the controls; the packs are off the road so nothing jumps a fresh character at the start.
2. **The creek ford** (~60 m): the creek cuts the beach and the meadow; the only crossing is the ford where the road
   passes, with a plank bridge on it. One pack at level 1 before the bridge and a level-2 pack after it mark the
   step up. Everything west of the creek on the beach (the tidepools) is reached from the road, not along the sand —
   a deliberate choke so the tidepools are a *side trip* and not something you stumble through at level 1.
3. **The tidepools** (west, a side lane off the road at the waypoint's south bend): four pools in wet sand with
   rocks and reeds, two crab packs (1 and 2), **Old Pincer's pool** (a fixed crab pack with `rare: "old_pincer"` so
   the rare has one spot, per the bestiary), and a level-2 chest between the pools that the rare guards.
4. **The waypoint clearing** (mid-zone, 0,6): a dirt ring with four torches, a signpost, the waypoint. No spawn
   within 25 m. From here three ways: the road north, the side lane west to the cave, the lane east to the shrine.
5. **The wreck** (west beach, level 2): hull ribs made of logs, a broken dock, crates, barrels, bones. A snapper
   pack on the sand and a crate chest in the cargo. The north-beach gullhawk pair patrols past it.
6. **The dune shrine** (east, level 2): a ring of standing stones on a dune with a cairn, gullhawks nesting (two
   packs — the gullhawk pack has `minLevel 2`, so this is the first flyer fight), a chest in the ring. The third
   gull patrol circles the dunes south of the creek.
7. **The tidecaves** (north-west, level 3): the lane from the waypoint climbs under the headland cliff to the
   `cave_mouth` and the `entrance` marker (to `tidecaves`). The **brinewife** pack (the first caster, `minLevel 3`)
   stands on the rocks beside it, so a player meets an interruptible cast right before the dungeon that teaches it.
8. **The lighthouse ruin** (the headland, level 3): the only way up is the lane from the cave mouth — the headland's
   east face is a cliff wall. A ring of broken pillars, an arch, walls, a torch still lit, bones, and the zone's
   **locked chest** with two level-3 packs on the hill. Optional, highest-risk spot, and it looks over the whole beach.
9. **The road north** (level 3): three packs spaced along the bends, one more in the pine wood to the east where a
   crate hides behind the trees.
10. **The beach gate** (north-east, level 3): two palisade runs with the road through the gap, a watchtower, tents,
    a campfire, banners, a cart. Two **warband** packs (raiders have `minLevel 2`, so the level-3 markers always roll
    them when the table picks the warband row) and a chest in the camp. The `quest` marker "The Beach Gate" is here.
    The `exit` to Windmill Fields is 20 m past the gate.

Numbers: 29 spawns (26 packs, 3 gullhawk patrols with routes; the shore's table has no swarm row, so no swarm markers
— see "For the programmer"), 7 chests (3 crates, 3 chests, 1 locked), 128 hand-placed props + 16 scatter rules (~870
props after scatter), 7 surfaces of road, 3 cliffs, sea + creek + 4 pools, 9 hills/ridges.

## Windmill Fields (levels 3–5, 320 × 320 m, table `windmill_fields`, theme `meadow`)

Farmland in a shallow bowl with a windmill on the hill in the middle; a stream runs down the east half into a pond;
woods on three corners; the cart track enters at the south-west corner from the shore and leaves at the north-east
corner for Thornwood. Every farm has a fenced field, haystacks, a scarecrow and something that is wrong with it.

Walked from start to exit:

1. **The south-west gate** (start): a dirt turnaround with a signpost, a cart and torches; the exit back to the shore
   just behind. Two level-3 packs stand off the track in the first field.
2. **Hale farm** (level 3, the quiet farm): house, well, a fenced pen with haystacks and a scarecrow south of the
   track, a second field east of it, a crate chest by the lane. One wasp pack in the field, one pack at the lane end.
   This is the "nothing is wrong here yet" farm.
3. **The cart track to the mill** (level 3 → 4): the first raider patrol (`cart_track` route) walks this stretch
   both ways, so a player meets the **first archer** (the slinger in the patrol row) on the move. A pack at each
   bend. The hedgerow (bushes along a path shape) runs east–west across the meadow here, and a gullhawk patrol
   follows it.
4. **The windmill hill** (mid-zone, the waypoint): a 34 m hill with a dirt top, the windmill, stone wall bits, a
   cart, a haystack. The **waypoint** is on the hill's south-east shoulder with four torches. The `cave_mouth` on
   the north-west side is the cellar door — the `entrance` marker to `mill_cellars`. Grain crates by the mill carry
   the first **rat swarm** (`tag: swarm`, `marker: grain_sacks`): the swarm lesson happens 30 m from the waypoint so
   a player who dies to it is straight back. A crate chest behind the haystack.
5. **The orchard and the pond** (south-east side trip, level 3–4): four rows of oaks and birches inside a fence,
   the lane goes round the west and south of the rows to the pond. Chaffwasps nest by the water (level 4), a pack in
   the orchard, a chest at the pond's south shore behind the wasps. Reeds all round the pond.
6. **The burned farmstead** (north-west side trip, level 4, `quest` marker): an ash circle with the stone footings
   of the house, dead trees, bones, a well, and the warband camped in the ruin — this is the table's "raided
   farmstead" row (`minLevel 4`, raiders + two slingers). A pack on the lane in, another in the field, a chest in
   the ruin. A smaller lane continues to a crate hidden in the north-west wood.
7. **The north field and the burrows** (level 4–5, north of the mill): a fenced field with a lane into it,
   haystacks, a cart, and two **churnmole** markers (`marker: burrow`, dirt circles painted under them) — the
   brute-from-underneath lesson — guarding a level-5 chest at the top of the field.
8. **The ford** (level 4): the stream has one gap, where the track crosses on a bridge; a pack waits on the east
   bank, and the second raider patrol's route starts just past it.
9. **Longacre farm** (east side trip, level 4–5): house, barn (a hut) with the second **rat swarm** in the grain
   crates, a well, pens, a crate chest at the barn, a pack on the lane and one by the pen.
10. **The wrecked cart** (level 5): a cart on its side at the road's edge with cargo spilled, a pack behind it —
    the road ambush beat.
11. **The warband camp** (north-west of the track's last bend, level 5): a palisade ring on a low hill with its gate
    facing the road, a watchtower, three tents, a campfire, banners, crates, a cart. Two warband packs inside, a
    pack at the gate, the **locked chest** behind the tower. The `quest` marker "The Warband Camp" is at the fire.
    The second raider patrol walks the road past the gate so flee-calls land (bestiary: leaders run for the nearest
    pack).
12. **The exit** to Thornwood in the north-east corner, in the wood, 30 m past the last pack.

Numbers: 35 spawns (30 packs incl. 3 burrow markers, 3 patrols with routes — two raider bands on the track, one
gullhawk flight on the hedgerow — and 2 rat swarms), 8 chests (4 crates, 3 chests, 1 locked), 342 hand-placed props
+ 17 scatter rules (~960 after scatter), stream in two pieces + pond, 9 hills/ridges, 2 cliffs.

## Rules I followed (so the next zones match)

- **The road is painted `path`** (never `dirt`), because `scatterProps` refuses to put anything on `path`/`cobble`.
  A lane that is dirt fills with trees.
- **Water is a wall, so a stream has a gap where the road crosses** and a `bridge` prop (radius 0) sits in the gap.
  The two pieces end 15–18 m apart so a pack can fight on the ford.
- **A fence is porous to the walk grid at 2.2 m spacing** (posts block 0.7 m, cells are 1 m) — fine for farm pens
  that should not trap a monster; a wall that must hold is a `palisade` run (2.1 m spacing).
- **Houses need 8 m between centres** or the gap between them is blocked.
- **Nothing spawns within 25 m of a waypoint or a start**, and a chest never sits on the road.
- **Patrol routes never cross water or a hard wall**; they may brush a bush (monsters path round props).
- **Fight spacing on the road: 25–35 m**, with a landmark fight (3+ packs) at the far end and one hard optional
  spot (the lighthouse, the warband camp) holding the locked chest.
- I kept a strict checker next to the project's (every road cell free and reachable, every spawn/marker cell free,
  no route leg in water, no hand prop on a road); it is in my scratchpad, not the repo — `tools/zone-check.mjs` could
  grow those four tests (see below).

## For the programmer

- While these were being built the editor and game page crashed for every zone ("Cannot access 'under' before
  initialization" in `js/client/zone-view.js`); commit d45b59c4 fixed it. Mentioned so nobody blames the data.
- `tools/zone-check.mjs` is lenient (anything within 2–3 m counts as reached). Worth adding: every cell of a `path`
  surface reachable, patrol route legs free of water, props on roads.
- **Spawn fields the sim does not read yet** (left in the data on purpose, named after the bestiary's vocabulary):
  `rare: "old_pincer"` on the fixed crab pack at the tidepools (the one spot the rare stands when it is up, 35%);
  `marker: "burrow"` / `"grain_sacks"` on mole and rat markers (the table rows carry the same `marker` key and
  `spawn.js` ignores it today, so a burrow marker can currently roll wasps); `note` strings. `tag: "swarm"` on a zone
  whose table has an empty `swarms` row would fall back to the test stand-ins, so the shore has none.
- **acts.json is new data nobody loads yet**: `portalAfter` is the story gate, `links` must match a zone's `exit` /
  `entrance` markers (tests could check that), `order` is the quest order.
- **Marker kinds I used** beyond start/waypoint/exit/entrance/portal/npc: `quest` (side errands) and `stash`.
  NPC labels are `"<name> — <role>"`.
- **Prop kinds I wished for** (not used): a *boat* / *wrecked hull* (the wreck is logs and a tilted dock), *grain
  sacks* (crates stand in), *egg sac* / *leech pool* spawner props for later zones, a *gate* (an open palisade
  gap with posts), a *lighthouse tower* (a pillar ring stands in), *rope bridge* for the pass, *coffin* and *brazier*
  for the barrow, a *dock boat* for the town, *lantern post* for town streets, *market stall* (a tent + crates
  stands in), and a *burrow mound* (a dirt circle stands in).
- The town's `levels` is `[1, 1]` and its `table` is the shore's; `town: true` is a hint field — the sim should skip
  `spawnArea` for a zone flagged `town`.

## Notes for the next zones

- **Thornwood (5–7)**: a wood with one road and tree walls (dense `tree`/`tree_big` scatter with minGap 2) so the
  flankers have cover; `bush` markers for bramblewights (a scatter bush beside each); the Hollow's `cave_mouth`
  under a `tree_big`; Grandmother Root in a clearing ringed by `log`s.
- **King's Road (7–9)**: a straight road with toll camps every 40–50 m (palisade + banner + campfire), so the
  warcaller's flee-call always reaches the next camp; `perch` rocks for slingers at every camp.
- **Dungeons** need their own format (rooms, doors, stairs, the `door` prop for Gravesworn chanters, `coffin`,
  `brazier`, `egg_sac`); the zone format works for a cave floor if "cliffs" draw as cave walls and the theme is
  `cave`.
- Keep the sea on the map edge in any coastal zone (the Sunken Ruins) — the water chain is cheap and reads as the
  world's edge.

## Dungeons

Written by Fable, 2026-11-11, for rulings 4, 16, 25, 32 and 46. Same JSON format as the outdoor zones; the sim is flat,
so a cave is **rooms and corridors walled by `cliffs`** on a dark `mud` base (the editor's cliff tool draws the same
thing). Built so far: **The Tidecaves** (two floors, levels 3–4, Clatterjaw) and the **Mill Cellars** (one floor,
level 5, Gristmaul). Each floor was laid out as rooms + corridors first, the walls were *traced from that layout*,
and the result was checked for a 4 m walkable lane along every corridor (heroes, a pack and a companion must pass)
before any prop went in. Numbers at the end of each section.

### How a dungeon floor is built (the rules behind the three files)

- **A wall is a cliff path.** The collider chains 0.9 m circles along it and inflates them by the body (0.45 m), so a
  cliff drawn *on* the edge of a floor eats 1.35 m of it; the renderer's rocks are 3.2 m wide and eat 1.6 m. The
  cave contours therefore sit **1.4 m back** inside the rock from the floor I meant to leave open, and a corridor
  is drawn **7–7.5 m nominal** to give ≥ 4 m of lane after the wobble in the walls (a tight passage, the Shellback
  Narrows, is 6.8). A cave wall between two passages must stay ≥ 5 m thick or the two rooms fuse.
- **The cellar is built from `crypt_wall` props** (484 of them, 2.2 m each, placed end to end along straight
  contours 0.5 m into the earth), not cliffs, so it reads as a built room with square corners; corridors there are
  7–7.5 m nominal (the wall's 1 m block + the body leaves ~4.6 m).
- **Water is a wall.** A pool is a visual centrepiece a fight happens *around*: every pool is inside a room with a
  ≥ 4 m dry lane all round, and the patrol routes run on that lane. The boss arenas have **no water inside the
  fight circle** — Clatterjaw's "knee-deep middle" is `wetsand` + a `mud` centre, with real sea in three bays off
  the rim (so the Claw Slam's "knockback into the water" has water to point at).
- **Arrival**: the way-back `exit` marker carries `ax`/`az` so the hero lands 6 m into the room, past the marker's
  4.5 m reach, facing in. The exit to the next floor is at the far end with the same rule on its twin.
- **Lights**: only the 10 nearest the start are real lights underground, so the entries are lit by torches /
  lanterns and the rest of the floor by crystals (blue) and braziers (orange) as colour, not light. Each floor
  leans on one colour: the caves are crystal-blue with two fisherfolk torches at the mouth; the cellar is lantern
  gold with torches at the doors and four braziers on the millstone floor.
- **Spawns**: one new monster per floor is **pinned** (`pack: [...]`) at the spot where its lesson is clearest — the
  first husks, the first brinewife, the first shellback, the first shambler, the looters at the stair. Everything
  else rolls from the floor's table. Dungeon packs sit 20–30 m apart (closer than outdoors; the fights are the
  floor). Nothing spawns within 20 m of a start.

### The Tidecaves, floor 1 (levels 3–4, 140 × 200 m, theme `cave`, table `tidecaves`)

The sea comes in under the headland. You enter from the shore's cave mouth at the **south** end and the floor climbs
north-west through the cliff, then back east and down to the stair. The tide left boats in here; the drowned are
walking back up through it.

1. **The Mouth**: the exit back to the shore (arrive 6 m in), the `start`, two torches the fisherfolk left in the
   rock, their nets (a crate chest), and a tide pool with reeds. Sand floor. Quiet.
2. **The Drip Gallery** (level 3): a 60 m winding corridor of stalagmites and the first crystals. Two crab packs, the
   first 28 m from the start, the second at the last bend before the hall.
3. **The Flooded Hall** (level 3, the big room, 42 m across): a round pool in the middle, wet sand around it, two
   **wrecked boats** the tide dumped on the shore and the chest in the west one's cargo. A crab pack on the west
   shore, the **first drowned husks** (pinned, three) on the north shore, and the table's `flooded_hall` patrol —
   three husks walking the pool's rim. Three ways out: west to the Bone Shelf, north to the Crystal Throat.
4. **The Bone Shelf** (level 3, dead end west): a corridor fight, then a small round chamber of bone piles and a crate
   chest with crabs feeding on what the sea left.
5. **The Crystal Throat** (level 4, the climb): a 45 m corridor lined with crystals; the **first brinewife** (pinned,
   with three crabs) stands mid-corridor — the interrupt lesson happens in a passage where you cannot walk round
   the Drowning Song circle, which is the point. A crab pack at the top.
6. **The Sump** (level 4, dead end east off the throat): a corridor pack, then a drowned pool with a boat half in
   it, reeds, and **four husks** (pinned) round the water guarding the level-4 chest behind the pool.
7. **The Drowned Stair** (level 4): the last corridor north-east with a pack on it, a round wet chamber with a pool, a
   crab pack at the foot of the stair, and the exit down to floor 2, lit by two big crystals.

Numbers: 13 spawns (12 packs incl. 3 pinned, 1 patrol with a 9-point ring route), 4 chests (2 crates, 2 chests),
97 hand props + 39 scatter, one wall loop of 224 points, 4 pools, 3,177 m² walkable.

### The Tidecaves, floor 2 — The Tyrant's Pool (level 4, 130 × 190 m)

Arrive at the foot of the stair (south), climb north through the narrows, and the floor opens into the brinewives'
chantry before the last corridor to Clatterjaw.

1. **The Landing**: the exit up (arrive 6 m in), the `start`, two crystals, bones.
2. **The Shellback Narrows** (6.8 m nominal, the tightest passage in the act): the **first barnacle shellback**
   (pinned, with two crabs) 23 m from the start — Hunker in a corridor where melee cannot get behind it — and a
   second pack at the bottom end.
3. **The Chantry** (the big room, 30 m across): the brinewives' pool with **two braziers** at its edge, two wrecked
   boats, the chest in the east wreck. A **brinewife and her three drowned** (pinned) at the fire, a pack on the
   west shore, and the `flooded_hall` patrol walking the pool again.
4. **The Fisher's Cache** (dead end east): what the drowned carried down — crates, barrels, a boat, a torch still
   lit, a small pool — a corridor pack on the way and a **shellback** (pinned) on the chest.
5. **The Threshold**: a corridor north-east to a small wet chamber where **two brinewives** (pinned, with two crabs)
   sing at the arena mouth — interrupt both, or walk into the boss fight with the song still going.
6. **The Tyrant's Pool** (the arena, per the bestiary): a 28 m round chamber whose middle 24 m is the pool — `sand`
   rim 2 m wide, `wetsand` to 12 m, a `mud` centre 12 m across for the knee-deep middle — **four cave pillars** at
   9 m on the diagonals (the Call the Tide crabs come out from behind them; the boss marker carries `pillars` with
   their positions), three **sea bays** off the rim (west, north, south-east: real water, outside the fight), crystals
   round the wall, and the **boss hoard** in a nook on the north-east, behind the boss as you enter from the
   south-west. Clatterjaw's marker is dead centre, 7 m from the nearest pillar.

Numbers: 9 spawns (7 packs incl. 4 pinned, 1 patrol, the boss), 3 chests (2 chests, 1 bossHoard), 82 hand props +
29 scatter, 227 wall points, 5 pools, 2,418 m² walkable.

### Mill Cellars (level 5, 140 × 135 m, theme `cellar`, table `mill_cellars`)

Under the windmill. One floor of square stone rooms off a central grain hall; the miller's lanterns still burn. The
cellar door is the `cave_mouth` on the windmill hill, so you arrive at the **south** stair and the mill's own
stones are at the **north** end, straight up the spine of the plan.

1. **The Stair Landing**: the exit up (arrive 6 m in), the `start`, two lantern posts, timber props, a barrel and a
   crate.
2. **The Sack Hall** (32 × 22 m): two rows of grain sacks, four lanterns, timber props along the walls, a cart, the
   looters' mess. The **looters** (pinned: two raiders + a slinger, the table's "near the stair" row) stand in the
   east half, the **first rat swarm** (`marker: grain_sacks`) in the south row of sacks; a crate chest on the west
   wall. Doors west, east and north.
3. **The Wet Store** (west, 24 × 30 m): the damp got in, then the mould — `mud` patches, moss, mushrooms, a sump pool
   in the south-west corner, barrels gone soft, a bone pile. The **first mould shambler** (pinned, with two weevils)
   on the mud, **two shamblers** (pinned) by the sump guarding the chest in the north-west corner. The lasting-ground
   lesson (Bloom) in a room with corners to be cornered in.
4. **The Cooperage** (east, 24 × 30 m): barrels in two rows, a cart, crates — two weevil packs (Bore, the armour
   shred) and the **second rat nest** in the sacks by the south wall; a crate chest in the north-east corner.
5. **The Rat Run** (north, 18 m): a 7 m corridor with a **grain chute alcove on each side** (sacks, flour on the
   floor) and a **rat swarm** between them — the swarm lesson in a passage with no room to kite.
6. **The Weevil Gallery** (40 × 16 m): the timber frames that hold the mill up, flour drifts (`snow` surfaces),
   a cart, sacks — a weevil pack west and a **shambler + weevils** (pinned) east at the strongroom door.
7. **The Strongroom** (east off the gallery): the miller's barred `gate` (open — the looters forced it), a torch, a
   pack on the **locked chest**.
8. **The Millstone Floor** (the arena, per the bestiary): a round stone room 20 m across up a 7.5 m corridor from
   the gallery; the **great axle** in the centre (a `ruin_pillar` at scale 2 — a 2 m pillar that blocks the
   boss's line and that he walks round), **four grain chutes** as alcoves in the wall (W, E, NW, NE — each with sacks
   and a timber frame; the boss marker carries `chutes` with their mouths, for Rats in the Walls), four braziers,
   four flour drifts, bones. Gristmaul's marker is 6 m north of the axle, so he stands across it from you as you
   come in. The **boss hoard** is in a nook in the north wall behind him.

Numbers: 12 spawns (8 packs incl. 4 pinned, 3 rat swarms, the boss), 5 chests (2 crates, 1 chest, 1 lockedChest,
1 bossHoard), 628 hand props (484 crypt-wall pieces, 13 lanterns, 9 torches, 4 braziers) + 27 scatter, 1 pool,
3,222 m² walkable.

### For the programmer (dungeons)

- **`floor` on a spawn-table row is not read** (`spawn.js` `rollComposition` only filters `minLevel`), so the
  tidecaves table's two `floor: 2` rows (shellback + crabs, brinewife + husks) can roll on floor 1 and the floor-1
  rows roll on floor 2. The pinned packs above make the lessons land in the right order regardless; the fix is a
  one-line filter on `sp.floor ?? area.floor` when the sim gets a floor number (floor 1 is `tidecaves`, floor 2 is
  `tidecaves_2`; the zone files carry no floor field yet — add `floor: 1 / 2` to the zone JSON when it is read).
- **Boss markers carry hints the sim does not read yet**: `pillars` (Clatterjaw — where Call the Tide's crabs appear)
  and `chutes` + `axle` (Gristmaul — where Rats in the Walls pour from, and the pillar he walks round). Spawn the
  adds at those points rather than at the boss.
- **The editor's theme list lacks `cellar`** (and `crypt`, `catacomb`, `mine`, which `zone-view.js` already draws
  dark): the Mill Cellars file says `cellar` and draws dark in the game, but the editor's dropdown shows "meadow"
  for it and would overwrite the theme on Save. `js/editor/editor.js` line ~152.
- **The walk grid's "unreachable" count is the rock outside the walls** (22,491 cells on floor 1): the checker only
  counts cells not inside a blocker, and the ground beyond a cave wall is open ground that nothing can get to. Fine
  for play (flow fields stop at the wall); the number just is not a bug.
- **`swarms: []` in the tidecaves table** means no swarm markers there (as on the shore); the Mill Cellars has three
  swarm markers against its one rat row.
- The two outdoor-side arrivals (shore `entrance` at (-80, -62), fields `entrance` at (-10, -26)) use the default
  (0, +3) offset and both land on open ground — checked.
- The three files were generated from a room/corridor design script kept outside the repo (walls traced from the
  layout, then hand props nudged off the 4 m lanes). Editing the JSON by hand or in the editor is fine; the walls are
  plain `cliffs` / `crypt_wall` props like anywhere else.
