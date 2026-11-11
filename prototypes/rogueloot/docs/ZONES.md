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
