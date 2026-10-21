# Torbor Downs regenerated (play-test 12, #81)

Owner, 2026-10-17: "Let's just regenerate the first island to have more variety, more complex terrain like Mistfall.
There should still be some valleys, plains, etc, but also more hills and stuff too." Plus: split the island into several
biomes the way Vharlen has, and let the land reach the sea instead of stopping at a square edge.

Started 2026-10-17, parked at ~80% on branch `wip/torbor-regen` (2026-10-20), finished on branch `map-rebuild` the same day
(owner: "finish the full map rebuild").

## What changed on the ground

| (16 zones, sampled every 8 m) | before | after |
|---|---|---|
| median slope | 6.7° | 13.5° |
| land steeper than 15° | 27% | 51% |
| flat land under 5° (plains, valley floors) | 33% | 15% |
| typical rise inside 200 m | 20 m | 46 m |
| sea inside the island's square | 0.2% | 8.2% |
| biomes over 5% of a zone (mean) | 3.0 | 3.8 |
| share of a zone's biggest biome (mean) | 63% | 52% |
| scatter (trees, rocks, bushes) | 258k | 317k |

Measured with `node tools/measure-terrain.mjs --province torbor_downs` (add `--dir <zones>` to measure another copy).

## How it is made

* **`tools/lib/torbor.mjs`** — the island's own ground profile. Every road, river, lake, pinned town and pinned dungeon
  door stays EXACTLY where it was: a distance field from all of them keeps the new hills at zero within 14 m and at full
  height past 210 m, so the roads and rivers run along valley floors with hills rising on both sides.
* **Regions**: the island is cut into named regions (a warped Voronoi over hand-placed seeds), each with its own relief,
  coast and biome mix. Their biomes, as players see them (`TORBOR_BIOME_NAMES`): Chalk Downs, Oakwood, Pine Highwood,
  Heather Moor, Saint's Meadow, Brack Fen, Red Scarps, Gorse Heath, Golden Wolds, Blackthorn Scar, High Fell, Grey Crags,
  Fell Tops, Shingle Shore. Region borders blend over ~300 m, so a border is a change of ground, never a step.
* **Coastline**: the land ends a wandering 120-560 m inside the old square (never closer to a pinned town or door than
  its radius + 90 m). Most of it eases down to a shingle shore; the Pine Highwood, Red Scarps and Blackthorn Scar keep sea
  cliffs, and the south coast is high (the old inland ground there was high).
* **`tools/lib/world-core.mjs`**: Torbor is now `kind: 'island', profile: 'downs'`. `downsWorld` re-fits the world's
  rivers, roads and bridges to the new ground (a river that now meets the coast ends in a mouth at sea level; one that
  rose out at sea now rises 250 m inland). Surfaces never drop below sea level.
* **Looks** (`downs` palette): ground colours per biome (`js/client/terrain-view.js` `GROUND_PALETTES.downs`), far
  horizon colours (`horizon-grid.js` `REGION_PALETTES.downs`), ground clutter (`clutter-plan.js` `CLUTTER_PALETTES.downs`)
  and seven new scatter kinds (silver birch, crack willow, gorse, heather, blackthorn, red sandstone, old oak).

## Moving what stood on the old ground

`node tools/coast-content.mjs --province=torbor_downs` treats every zone like the bay zone of play-test 11. In one run it:

1. moves a pinned dungeon door the sea took;
2. re-binds each set piece BOUND onto one of the bake's farms, mills or stones to where that piece now is (the Nine
   Maidens, Brannock Fields, the Turnwater mill, Saint Hulda's yard), carrying its folk with it;
3. moves every camp, curio, wayside stone, vignette, farm, fort and hunt camp (`<zone>.hunt.json` too) that now stands in
   the sea, on a cliff, on a road or on farmland to the nearest spot that passes the placer's own rule — further out, or
   anywhere in the zone, or (set pieces only) drawn smaller if nothing that big is left. A moved camp keeps clear of
   towns and farms, because the bake lays farmland wherever stream E left room and would take the spot again next bake.
   A curio or wayside stone with no fair spot within ~1.2 km is dropped (scenery only);
4. sets every camp's level to the level ramp at its new spot;
5. fills any zone left below 95% coverage (open ground within 50 m of something) with curios that suit the ground.

A move changes what the bake carves (paths, clearings), so it runs as a loop: bake → move → bake → `--check`, until the
check finds nothing (12 rounds the first time, a few after that). Then the content chain (docs/ON-HOLD.md step 4):
`content-professions`, `content-towns`, `content-givers`, `content-hunts`, `fill-quest-marks --refresh` (new: it also
re-points use/talk steps whose set piece moved), `content-packs`, `content-pools`, `content-fit --fix`, then
`bake-horizon`, `bake-map`, `ship-routes --write`.

## Players' saved spots

`js/sim/safe-spot.js` (called from `js/sim/province.js` on every log-in): a saved spot that is now sea, cliff, inside a
wall or a building wakes you on the nearest good ground — rings 2 m apart out to 160 m, then 8 m apart out to 800 m for
someone saved where the sea now is — and only with nothing within 800 m, in the nearest town. All 816 spots in
`tests/W/fixtures/torbor-old-spots.json` (random wilds, the old square's edge, beside buildings) wake on good ground; none
needs a town. The six characters on the live server were checked on 2026-10-20: all six stand on good ground already.

## Knock-on changes

* The world map draws Torbor's rivers again (`tools/lib/coast-lines.mjs` `ownWaters`: only an island WITHOUT the downs
  profile, i.e. Vharlen, hides the old mainland's rivers under it).
* The Fackfalpot now runs past Gullwick Bay to the open coast (it inherited the Batpate Run's old lower course).
* Fishing: a zone whose only reachable water is one cove packs its pools closer (`content-pools.mjs` `POOL.minPools`);
  a zone's open-spot count can no longer exceed its pool count.
* Economy: log tier 3/4 19/38 → 22/46 and ore tier 4 24 → 25 (`content-professions.mjs` `RAW_PRICE`) — the high zones'
  trees and ore stand further apart now. At level 1 a refined row (mining + smithing) may reach 135% of questing: every
  raw piece is already at the 1-gold floor and a bronze bar of two ores cannot sell for under 3.
* Tests that pinned the old ground now measure the island instead of one spot (`tests/D/playtest8-horizon.test.js`), the
  "Torbor untouched" hashes in `tests/B/vharlen.test.js` are the regenerated zones', and the start zone needs 36 fields
  (was 40: the four farms keep 18 fields on the new slopes).

## Tests
`tests/W/torbor-regen.test.js` (safe spots on toy ground, the 816 old spots, a real log-in where the sea now is, the
island's biomes / hills / plains / coast / towns), `tests/W/torbor-regen.spec.js` (screenshots per biome, from
`tests/W/fixtures/torbor-look-places.json`, made by `tools/torbor-look-places.mjs`).
