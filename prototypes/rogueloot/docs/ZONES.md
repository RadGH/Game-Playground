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

## Act 1, part 2: Thornwood, the King's Road, the Hollow and the Barrow

Written by Fable, 2026-11-10, for the same rulings as above plus the click-to-move pass (every exit, entrance and quest
marker stands on open ground with nothing that blocks within 2 m, so a click on its label walks you onto it; the one
exception is the waypoint, which sits on its stone like every earlier zone and is reached at the 2.4 m click reach).
Four new nodes, seven files: `thornwood`, `kings_road`, `thornwood_hollow` + `thornwood_hollow_2`, `old_barrow` + `_2` +
`_3`. All seven pass `tools/zone-check.mjs` and a stricter checker (every road and corridor keeps a 4 m lane, every
spawn has open ground for its pack ring, every patrol leg is free of walls and water, no hand prop stands on a road,
every arrival point has 1.5 m of open ground). `acts.json` has `built: true` on the four nodes and every `links` entry
has a matching `exit` / `entrance` marker.

### Thornwood (levels 5–7, 300 × 300 m, table `thornwood`, theme `forest`)

A dark wood with one road and tree walls (~1,280 trees placed off the roads and clearings; pines take over north of the
middle) so the flankers always have cover. A brook runs down the west side with one ford, where the hollow lane crosses
on a bridge. You come in from the fields at the **south-east** corner and leave for the King's Road at the
**north-east**; the Hollow is under the hill in the **north-west**.

Walked from start to exit:

1. **The Fields gate** (start, south-east): a signpost, torches, a broken cart, the woodcutters' stumps. Two level-5
   packs off the road either side, 30 m on.
2. **The woodcutters' camp** (south, a lane off the first bend, `quest` marker): a hut, sawn timber, logs, a dead fire,
   and the **cutthroats who looted it** (pinned, four) — the first go-behind-you lesson, in a dirt clearing ringed by
   stumps. A crate by the cart. The `logging_road` patrol (cutthroats + raiders) walks the lane out and back.
3. **The road north** (level 5 → 6): a pack at each bend, the brambles beginning east of the road.
4. **The boar wallow** (west lane, level 6): a mud circle inside a grass clearing with **three rootboars** (pinned) —
   the charge line, in the open, with a chest behind the boulder.
5. **The bramble thicket** (east lane, level 6): thick bushes either side of the lane and **two bramblewights** (pinned,
   `marker: bush`, a hand-placed bush 3.5 m from each so the "it was a bush" read works), wolves on the chest at the
   thicket's heart.
6. **The waypoint glade** (middle, moss, 0,0): the stone, four torches, a signpost, a cairn. Nothing within 25 m.
7. **The hollow lane** (west, level 6 → 7): the **first web spinners** hang in a great oak (pinned, `marker: perch`),
   a pack before the ford, the bridge, then cobwebs thickening across the lane, two more spinner pairs in the oaks
   either side, egg sacs at the mouth, a chest in the webs, and the `cave_mouth` under the hill with the `entrance`
   to `thornwood_hollow` 6 m in front of it (arrival 5 m east, on the lane).
8. **Grandmother Root's clearing** (north off the hollow lane, level 7, `quest` marker): a ring of fallen logs with a
   gap where the lane comes in, an elder tree, white blossom bushes, bones. Her spot is a pinned bramblewight with
   `rare: "grandmother_root"`; the **locked chest** is behind her.
9. **The deer glade** (east off the road, level 6–7): a meadow with narrow deer trails painted `path` (2.2 m) that the
   `deer_trails` **wolf patrols** walk (one loop round the glade, one out-and-back on the north trail), a **den of five
   wolves** under a boulder (pinned), a chest behind the den.
10. **The hunter's stand** (north of the road, level 7): a watchtower the warband took, a tent, a fence, banners, and
    the table's level-7 row pinned (two cutthroats, two slingers, a raider) — slingers on the doorstep of the exit.
11. **The exit** to the King's Road (north-east): the warband's first marker stone and banners, 30 m past the last pack.

Numbers: 32 spawns (29 packs incl. 9 pinned, 3 patrols with routes; the table has no swarm row), 8 chests (3 crates,
4 chests, 1 locked), 857 hand props (~780 trees) + 610 scatter, brook in two pieces + bridge, 1 cliff, 8 hills/ridges,
84,520 m² reachable, 58 KB.

### King's Road (levels 7–9, 320 × 320 m, table `kings_road`, theme `ruins`)

An old paved road (`cobble`, 7 m) across a meadow with the ruins of the king's milestones and a wayfort, a stream with
one bridge, and **the warband's toll camps** on it — the quest step "Toll Road". You come in from Thornwood at the
**west** edge; the road runs east to a **crossroads**, then forks **north-west to Elderglade** and **north-east to
Mirefen** (both links are in acts.json, so both exits exist). The Old Barrow is a lane **south-east** off the
crossroads.

Five camps, each different, each with a perch rock for its slinger and its own fire:

1. **The Westgate Toll** (level 7, 45 m from the start): a palisade across both verges with an open `gate` on the road,
   a watchtower, two tents, and the **first warcaller with three raiders and a slinger** (pinned) — the LEADER lesson,
   with the wall to flee behind. A second pack behind the wall; a chest by the tents.
2. **The Milestone Camp** (level 7, 50 m on): no wall — a fence, three tents, the milestone, a haystack; a **bonechanter
   and her raiders** at the fire (pinned) so the SHAMAN lesson is met twice (the wayfort has the other).
3. **The Bridge Toll** (level 8): the stream's only crossing; palisade stubs on the east bank, tents, and **two warhounds
   with two cutthroats** (pinned) — the pull-the-straggler lesson at a choke. A crate by the crates.
4. **The Crossroads Toll** (level 8–9, `quest` marker "The Crossroads Toll" at the junction): two palisade arcs between
   the four roads with gates on the north roads, a watchtower, six tents, two fires, carts and crates. **Sergeant
   Krull's fire** is the pinned warcaller pack with his signature's roster (4 raiders, 2 slingers, a bonechanter) and
   `rare: "sergeant_krull"`; a pack at the north fire, one on the east side, the **locked chest** beside the tower.
5. **The Mire Toll** (level 9, on the Mirefen branch): the last palisade and gate, a tower, tents, a chest behind the
   crates; the last warcaller pinned at the fire.

Between the camps: the **`the_road` patrols** — four warcaller bands walking out-and-back stretches of road between
camps 1–2, 2–bridge, crossroads–Mire Toll and down the glade road, 35–50 m apart so a fleeing warcaller always has a
camp to run to; the **`verges` patrol** (three warhounds) on a narrow trail along the south verge past the burnt
mile-house. Side trips: the **burnt mile-house** (south-west lane, ash circle, ruin walls, looters, a crate), the
**wayfort ruin** on a knoll north of camp 2 (a pillar ring with a gap for the lane, braziers, the **first bonechanter**
pinned, a chest under the arch), the **wayshrine** (the waypoint: a broken arch, two pillars, a cairn, 10 m off the
road on the west bank between camps 2 and 3, nothing within 25 m), the **shepherd's fold** (a fenced pen with boars) and
the **barrow lane**: the **diggers' camp** (`quest` marker — tents, mine carts, shoring timber, lanterns, nobody home,
their crate) and the **barrow mound** (a hill with gravestones, dead trees, a cliff face, the `cave_mouth` facing west
and the `entrance` to `old_barrow` 6 m before it). Milestones (small standing stones) every ~60 m on the right verge.

Numbers: 34 spawns (29 packs incl. 6 pinned, 5 patrols), 8 chests (4 crates, 3 chests, 1 locked), 593 hand props (~300
trees) + 512 scatter, stream in two pieces + bridge, 2 cliffs, 7 hills/ridges, 97,741 m² reachable, 52 KB.

### Thornwood Hollow, floor 1 — the Webbed Gallery (level 7, 144 × 204 m, theme `cave`, table `thornwood_hollow`)

Same construction as the Tidecaves (rooms + corridors first, the wall traced 1.4 m outside the floor, corridors 6.8–7.5 m
nominal), lit crystal-blue with two hunters' torches at the mouth; webs everywhere, egg sacs where swarms come from.

1. **The Mouth** (south): the exit back to Thornwood (arrive 6 m in), the `start`, the hunters' crate, webs.
2. **The Silk Run** (50 m): the **first spinners** on a cave pillar in a bay off the corridor (pinned, `perch`) — Snare
   Line where you cannot walk round it; a pack at the last bend.
3. **The Nursery** (the big room, 44 m across): six egg sacs round the walls, the **first thistle sprite with a spinner**
   (pinned — the giggle, then Pollen Cloud, with a snare to hold you in it), a pack west, the **first spiderling swarm**
   (`tag: swarm`, `marker: egg_sac`) at the west sacs, the chest in the crystal nook past it.
4. **The Pinch** (west, 6.8 m — the tight one): a **burrow spider** on a dirt disc mid-corridor (pinned, `burrow`), then
   the Spinners' Nook (dead end) with a pack on a crate.
5. **The Sprite Hollow** (east, dead end, moss and mushrooms): a corridor pack, then **two sprites** (pinned) over the
   chest.
6. **The North Run and the Drop**: a swarm between sacs either side of the corridor, a pack at the stair, the exit down.

Numbers: 11 spawns (9 packs incl. 4 pinned, 2 swarms), 4 chests (2 crates, 2 chests), 96 hand props + 40 scatter, one
wall loop of 237 points, 3,980 m² walkable, 33 KB.

### Thornwood Hollow, floor 2 — the Brood Below (level 7, boss 8)

1. **The Landing**: the exit up (arrive 6 m in), the `start`, crystals, bones.
2. **The Trapdoor Run** (6.8 m): **two burrow spiders** on discs at the two pinches (pinned) — you know the disc now; a
   crate against the wall between them.
3. **The Hatchery** (40 m across): eight sacs, **two sprites** (pinned, the floor-2 row), **a burrow spider under a
   spinner** (pinned, the other floor-2 row), two swarms at the east and west sacs, a chest on the east wall.
4. **The Spinners' Loft** (west, dead end): a corridor pack, then **two spinners** on cave pillars over the chest.
5. **The Threshold** (north): sacs on the walls, a swarm, and a **web-wall door** (three big cobwebs across the mouth).
6. **Mother Thrum's cavern** (per the bestiary): an ellipse **26 × 18 m** floored `stone` (the web floor) with cobwebs,
   **six egg sacs** at the walls (the boss marker's `sacs`), the two web-wall doors (`doors`: the south mouth and the
   north nook), crystals at the long walls. She stands dead centre; the **boss hoard** is in the nook behind her past
   the second web wall.

Numbers: 11 spawns (7 packs incl. 5 pinned, 3 swarms, the boss), 4 chests (crate, 2 chests, bossHoard), 90 hand props +
36 scatter, 204 wall points, 3,051 m² walkable, 29 KB.

### The Old Barrow (levels 9–10, theme `crypt`, table `old_barrow`) — three floors of `crypt_wall`

Built like the Mill Cellars: axis-aligned rooms and 7 m corridors, the walls are `crypt_wall` runs traced round the
union of the rooms 0.5 m into the earth (361 / 377 / 226 pieces), floors `stone`, corridors `cobble`, niches 0.9 m inside
the walls facing in, braziers for light (orange), the diggers' lantern posts at the mouth.

**Floor 1 — the Diggers' Cut** (144 × 144 m, level 9): the barrow mouth (exit up, arrive 6 m in) opens into **the
diggers' camp** — tents, mine carts, shoring, a dead fire, their crate, and **three diggers at the fire + two at the
cut** (pinned, the floor-1 row) so the Gravesworn are met as people. **The Cut** north is a shored 7 m corridor where
the **first husks** rise from the slabs (pinned, four — the slow wall). **The Niche Hall** (48 × 24): niches, coffins,
four braziers, a pack west and the **first gravecandle** over its husks (pinned), a chest in the south-west corner.
West: a corridor pack, then the **Crossfire Gallery** — a room with an archers' alcove at each end and the pinned
crossfire pack (two archers, two husks), the chest in the north alcove. East: a corridor pack, the **Kennels** (bone
piles, broken coffins) with a pack and the **bone hound patrol** walking kennels → hall → kennels. North: a corridor
pack and the stair room with the exit down.

**Floor 2 — the Lamplit Galleries** (152 × 162 m, levels 9–10): stair → corridor pack → the **Lamp Hall** (52 × 24, six
braziers, niches, coffins) with **the Lamplighter's spot** in the middle (pinned gravecandle pack with `rare:
"the_lamplighter"`) and packs at both ends. West: the **Coffin Rows** — three rows of coffins, a sarcophagus shrine and
the **first Shroudmother** with her husks and a hound (pinned, the floor-2 row; the chest is behind her). East: a
forced `gate`, then the **Sealed Vault** — two sarcophagi, archers on the **locked chest** (pinned crossfire). North: a
corridor pack, the **Ossuary** (bone piles, niches on three walls, a pinned gravecandle pack, a chest) and the **hound
patrol** between the Ossuary and the Lamp Hall; then the lower stair with a last pack in the corridor.

**Floor 3 — the Hall of Records** (96 × 134 m, level 10): stair → corridor pack → the **Antechamber** (four sarcophagi,
braziers) with the floor-3 row pinned (two candles, two archers); a side chapel each way (a pack and a chest / crate);
then the reeve's doors (a `gate`) with the **last Shroudmother** pinned in front of them, and the **Hall of Records** per
the bestiary: a long hall **18 × 31 m** (18 rather than 16 so the lanes outside the coffin rows stay 2.5 m wide) with
**twelve stone coffins in two rows** (the boss marker's `coffins`), **four braziers** at the corners (`braziers`), the
**dais** at the far end (a low hill, `dais: [x, z, r]`) with the **ledger-lectern** (a small standing stone, `lectern`).
Reeve Oswin stands before the lectern, across the coffins from the doors. The **boss hoard** is in the nook behind the
dais.

Numbers: floor 1 — 11 spawns (10 packs incl. 5 pinned, 1 patrol), 4 chests, 461 hand props + 23 scatter, 3,904 m²,
38 KB; floor 2 — 12 spawns (11 packs incl. 4 pinned, 1 patrol), 4 chests (crate, chest, locked, chest), 490 + 24,
4,054 m², 41 KB; floor 3 — 6 spawns (5 packs incl. 2 pinned, the boss), 3 chests (chest, crate, bossHoard), 294 + 10,
2,116 m², 25 KB.

### For the programmer (part 2)

- **Two onward exits on the King's Road** (`elderglade` and `mirefen`, both in its `links`). If "a zone is complete
  when its far `exit` was reached" means one exit, make it either onward exit — or, better for the quest, complete
  "Toll Road" when the five camp packs are dead (the pinned packs at the five fires).
- **Boss marker hints** (not read yet): Mother Thrum's `sacs` (six positions — spawn Hatch's spiderlings there, and
  make those egg_sac props the breakable ones) and `doors` (the two web walls); Reeve Oswin's `coffins` (twelve — Read
  the Names rises from the nearest ones, Chain of Office shackles to one, and they should block line of sight),
  `braziers` (four, the ones you light), `lectern` and `dais`.
- **`rare` spots**: `grandmother_root` (Thornwood clearing), `sergeant_krull` (the crossroads fire, with his
  signature's roster as the pinned pack), `the_lamplighter` (the Lamp Hall) — as with `old_pincer`, the sim does not
  read `rare` yet.
- **`marker` values** used: `perch`, `bush`, `burrow`, `egg_sac`, `crossfire` — the table rows carry the same key and
  `spawn.js` ignores it, so a `perch` marker can roll wolves. The pinned packs make every lesson land regardless.
- **`floor` on table rows** is still unfiltered, and the barrow table writes it as an array (`"floor": [2, 3]`), so the
  one-line filter has to accept a number or a list.
- **Egg sacs are decoration today** (`egg_sac` is a plain prop, r 0.5). The swarm markers next to them are what
  actually spawns spiderlings; when a spawner prop exists, the `sacs` list on the boss and the sacs beside each swarm
  marker are the ones to make live.
- **The web-wall doors** are three `cobweb` props at scale 1.6 (r 0, walk-through). A sealing door needs a prop with a
  radius and a way to break it.
- **Yaw convention worth a comment in `props.js`**: pieces that span their local x axis (fence, palisade, crypt_wall,
  gate, niche) take `yaw = atan2(-dz, dx)` of the run direction; pieces that run along local z (bridge, cave_mouth's
  opening) take `atan2(dx, dz)`. I had the first one rotated 90° on the first pass and nothing complained — the
  checker sees circles.
- **Windmill Fields' cave mouth** at (-12, -30) has `yaw 2.36`, which opens it north-east while its entrance marker is
  south-east of it; `yaw ≈ 0.45` would face the marker. Not touched (not in this batch's file list).
- The editor's theme dropdown now lists `cellar` / `crypt` / `catacomb` / `mine`, so the earlier note about it
  overwriting the theme on Save is resolved.
- Same as before: the strict checker (4 m lanes along every `path`/`cobble` road and every corridor centreline, patrol
  legs free, props on roads, arrival points open) is a scratchpad script, not in the repo — `tools/zone-check.mjs`
  could grow it; `tests/world/zones.test.js` passes on all 14 files.

### Notes for the next zones

- **Elderglade (9–11)**: arrive from the King's Road's north-west exit; the glade should be the first zone with the
  elder trees as walls and a river you cannot cross except at Velka's bridge; `elder_roots` entrance under the biggest
  tree. Mirefen (11–13) arrives from the Mire Toll road — reeds, pools as walls, boardwalks (`dock` props, r 0).
- Keep the camp recipe: dressing at ≥ 4.5 m from any road centreline, the pinned pack 5 m from its fire, perch rocks
  on the far side of the road from the tents.

## Act 1, part 3: Elderglade, the Elder Roots, Mirefen and the Mire Crypt

Written by Fable, 2026-11-11, to the same rulings and checks as part 2 (click-to-move markers on open ground, 4 m lanes on
every road and corridor, open ground for every pack ring, patrol legs free of walls and water, no hand prop on a road,
arrival points open). Four nodes, six files: `elderglade`, `elder_roots` + `_2`, `mirefen`, `mire_crypt` + `_2`. The owner
asked that new places look NEW, so each region has its own silhouettes, added to the kit this round (`js/world/props.js`
+ `js/client/prop-meshes.js`): the Elderkin's `moon_well` (a pale stone rim round a pool of moonlight, lit), `rune_stone`
(a tall grey slab with a glowing ring, lit), `root_pillar` and `root_arch` (walk-under); the Mirefolk's `stilt_hut`,
`totem`, `boardwalk` (r 0, the causeway's planks), `swamp_tree` (a flared cypress with hanging moss), `lily_pads` (water
only: it floats 0.5 m above the ground so it sits just over the water plane); the Gravesworn's `crypt_door` (a sealed
door in a frame, gold sigil), `bell` (the great bell on its frame) and `sconce` (a candle stand, lit). Draw-call floors
at Low graphics (one instanced draw per prop kind x part, whatever the camera sees): Elderglade 57, Roots 22 / 19,
Mirefen 63, Crypt 24 / 21 - all under Thornwood's 94 and the King's Road's 128.

### Elderglade (levels 9-11, 300 x 300 m, table `elderglade`, theme `forest`)

A wood of **elder trees** (150 of them, 9 m apart, the walls) with ordinary oaks and birches between, on a `forest` base
with `moss` glades. The gate is on the south edge (the King's Road's exit to here is on ITS north edge) and the road
climbs north: the Road gate (two rune stones and a root arch over the road) -> the **Oathfield** east (rows of
gravestones, the oath-bound archers' own graves: two archers behind a glade warden, pinned - formation fighting, nothing
here flanks) -> the **waypoint glade** (the stone, a moon-well on flagstones, rune stones round the rim; quiet 25 m) ->
the **Cantor's Walk** west (rune stones every few metres down the lane, a cantor pinned between them: the Unfinished
Chorus is the interrupt exam, then a second cantor pack at the shrine) -> the **Hollow Elder's clearing** east (root
arches ring the moss; the `hollow_elder` pinned with `marker: "clearing"`) -> **Velka's bank** (the river is a wall across
the whole zone; the one gap is at the bridge, 18 m wide so a pack can fight on the ford; three standing stones for her
three husbands; the cantor pack there carries `rare: "velka_thricewed"`) -> the north bank at level 11: the **Stone
Ring** (ten standing stones on a 14 m ring, two wardens pinned on the flagstones with `marker: "markers"`, the `stone_markers`
patrol walking the ring outside the stones, the locked chest in the north-east gap), the **Moon Shrine** north (the
minLevel-11 row - cantor, warden, archer - pinned), and the **Roots mouth** in the north-west under the oldest tree (a
`cave_mouth` facing its entrance marker, a sprite-and-bramblewight pack on the doorstep). 28 spawns, 8 chests, 10 pinned.

### Elder Roots (level 12, two floors, theme `cave`, table `elder_roots`)

The Hollow's cave recipe (the floor's contour traced into cliffs) but the cliffs carry `color: "#5a3a22"` so the walls are
ROOT, and the dressing is root pillars, root arches across the corridors, rune stones for light and the Elderkin's
moon-wells, with burrow mounds where the borers are. **Floor 1, the Grasping Dark**: the mouth under the tree -> the
**Choke Run** (two moss patches with `root_choker`s pinned in them, two and then three: Drag in a corridor you cannot walk
round - do not stand in a line) -> the **Hall of Roots** (a warden and two archers on the flagstones, egg sacs in the
east nook for the spiderling swarm) -> the **Borer Warren** west (a `root_borer` under the pinch with `marker: "burrow"`
and another in the den: Bore Through down the corridor) -> the **Sprite Nursery** east (two sprites over a moon-well with
a choker in the moss) -> the **Descent** north (chokers at the stair). **Floor 2, the Heart of the Roots**: the Landing
-> the **Pillar Walk** (two borer pinches) -> the **Choir** (the floor-2 row: a cantor on the flagstones with two chokers
at her feet; the last Elderkin guard at the north gate; sacs east) -> the **Borer Holes** west (the big borer over the
chest) -> the **Threshold** (sprites and a choker before a root-arch door) -> **Ildreth's chamber**: a round room 27 x 23 m
with the moon-well as PAINTED moonlight (`snow`) at the centre so she can stand over it with nothing blocking, four
`root_pillar`s at 7.6 m, a flagstone rim, moss floor, petals on it, the hoard nook through a second arch. The boss marker
carries `pillars` (the floor at the foot of each pillar) and `spots` (the roots either side of the door): the engine
spawns her helpers at those six points, which is where Seedfall's sprites drop.

### Mirefen (levels 11-13, 320 x 320 m, table `mirefen`, theme `marsh`)

The whole zone is `reeds`-coloured fen on a `mud` base; **23 pools are water** (walls, each with its own murky colour), and
the **boardwalk is the road**: `path` surfaces with a `boardwalk` plank every 6 m (r 0, so the lane stays a lane; the
strict checker's `roadProps` allows them). The gate is the south-west corner (the King's Road's Mire Toll leaves ITS
north-east corner) and the causeway runs north-east: the Toll gate -> croakers on a perch rock (`marker: "perch"`) ->
the **stilt village** west (six `stilt_hut`s on a 15 m ring with the gap facing the lane, totems, boardwalks between the
huts; the mudwitch at the totem with croakers on the steps and a `mire_lurker` in the mud between you and her - the
healer-first lesson; a leech pool under the west huts) -> the **Lurker Logs** south-east (logs in the shallows, two
lurkers pinned with `marker: "log"`: Death Roll and the tail cone behind) -> the **waypoint islet** (the fen's one dry
rock, cairns, a shrine totem) -> the **Marsh Lights' Mere** north (a 56 x 44 m pool, the mudwitch's hut on its south
shore with two lights pinned: Lure walks you into the water; the `open_water` patrol of two lights on a 12-point loop
round the shore; lily pads on the water; the locked chest on the far shore) -> the **pass lane** north-west at level 13
(the drowned dead: `sludge_husk` packs, the minLevel-13 row; leeches at the bone pile; **Bogmother's pool**, the deepest
and darkest, with the mudwitch pack that carries `rare: "bogmother_sulk"`; the exit to Highcairn Pass at the north edge,
for the zone that is not built yet) -> the **east causeway** to the **diggers' halt** (three `gravesworn_digger`s pinned,
crossing the fen toward the crypt: the Gravesworn before their dungeon) and the **crypt mound** (a `crypt_door` set in the
rock behind a `cave_mouth`, both facing the entrance marker; husks that waded out of it on the doorstep). 31 spawns
(5 leech swarms, 1 patrol), 8 chests, 11 pinned.

### Mire Crypt (level 14, two floors, theme `crypt`, table `mire_crypt`)

The Barrow's recipe (axis-aligned rooms and corridors, `crypt_wall` runs traced round their union) with the fen inside:
flooded rooms are painted `mud` over the stone with `leech_pool`s and reeds, every room has candle `sconce`s at its
corners (the lights), and the Gravesworn's **sealed doors** stand IN the corridor walls (`crypt_door` 0.8 m outside the
wall line, facing in, r 1.0 - the lane keeps 4.7 m). **Floor 1, the Drowned Nave**: the mouth -> the flooded **nave**
(three sludge husks in the water, pinned - they burst, kill them apart; leeches under the west niches) -> the **first
door** (a chanter with two diggers, `marker: "door"`: Open the Door, 8 s, interrupt any time) -> the **Candle Hall**
(a gravecandle over three husks between the coffins) -> the **Lurker Cistern** west (the floor-1 row: a mudwitch on her
totem side with a lurker in the tank between you and her) and the **Ossuary** east (the second door in the corridor's
north wall with another chanter party; a shroudmother stitching husks back together) -> the bone-hound patrol walking
the hall and both corridors -> the stair. **Floor 2, the Bell Chamber**: the landing -> the **Keeper's Door** (the floor-2
row: keeper, chanter and two diggers at the door - the interrupt ORDER, the keeper's ward first) -> the **Vestry**
(gravecandle and husks, leeches in the dip) -> the **Shroud Cell** west (the shroudmother among her coffins, a sealed door
in her north wall she has not opened) -> the **last door** (a chanter, the bell behind her) -> the **bell hall**: 24 m
square, the east half painted `mud` with leech pools and reeds (the knee-deep water), the `bell` on its frame at the
centre, a `sconce` at each corner, coffins along the dry west wall, Sister Vennel on the dry side 7 m from the bell. Her
marker carries `spots` (three points on the water's edge, where the engine spawns her helpers: Husks from the Water)
and two hints the engine does not read, `sconces` (the four to light) and `bell` (where she walks to ring it). The hoard
nook is north of the hall through a 5.5 m corridor.

### For the programmer (part 3)

- **Boss helper lists** (read by the engine now): `elder_roots_2` Ildreth has `pillars` (4) + `spots` (2); `mire_crypt_2`
  Sister Vennel has `spots` (3). Both also carry `well` / `sconces` / `bell` positions that nothing reads yet.
- **The moon-well under Ildreth is paint, not a prop** (`snow` circle r 2.6): a prop with a radius would put her spawn
  inside a blocker. The `moon_well` prop (r 2.3) is used everywhere else. If "out of melee reach" is ever enforced, the
  painted circle is the area to make unreachable until a pillar falls.
- **Water that slows** does not exist in the sim: the bell hall's flooded half, the nave and the cistern are `mud` paint.
  A `slow` surface kind (`SURFACES` in `js/world/zone.js` + a reader in `move.js`) would make Vennel's and Bogmother's
  mechanics real. `lily_pads` only belongs on real water polygons (it is built 0.5 m up).
- **`marker` values** this round: `markers`, `clearing`, `burrow`, `egg_sac`, `perch`, `log`, `leech_pool`, `door` - the
  table rows carry the same key and `spawn.js` still ignores it; the pinned packs make every lesson land regardless.
- **`rare` spots**: `velka_thricewed` (Velka's bank, Elderglade) and `bogmother_sulk` (Bogmother's pool, Mirefen) - not
  read yet, same as `old_pincer`.
- **Mirefen's exit to `highcairn_pass`** points at a zone that is not built; acts.json lists the link, so the marker is
  there (the King's Road did the same for these two zones before they existed).
- **Cliff colour**: `cliffs[].color` was already read by `zone-view.js`; the Roots are the first zone to use it. The
  Mirefen crypt mound uses `#6a6660`.
- **The walk grid inflates every blocker by 0.5 m** (`INFLATE` in `js/sim/paths.js`), so a prop must stand about 3.8 m
  from a spawn's centre for the 2.2 m pack ring to be free - 3 m is not enough. The burrow mounds beside the borer spawns
  are placed at 3.8 m.
- Draw calls measured at Low graphics are in the batch report; the floors above are the instanced minimum.

### Notes for the next zones

- **Highcairn Pass (13-15)**: arrive from Mirefen's north-west exit (its marker at (-100, -154), arrival southward).
  A pass wants real height (`ridge` entries) and ledges for the lynx - cliffs with `color` for grey rock, `rope_bridge`
  over a gorge (r 0, like the fen's boardwalks), drakes' landing rocks as `boulder`s.
- **Redcliff Heights (15-17)** and the **Warband Mine**: the mine is the third dungeon recipe (crypt walls as `timber_frame`
  shoring + cliffs for rock), with `mine_cart` rails on the floor for Ruhk's gallery.
