# Round 28 — roads

The report: *"Improve road plans and fix floating paper thin roads."*

Everything below was measured, not eyeballed. Tools:

* `tools/probe-road-float.mjs [scale] [seeds…]` builds the real `createFeatures` around a town (Three.js in node)
  and checks the road and street meshes' own vertex buffers against `heightAt` and against the ground
  js/terrain.js draws at each clipmap ring.
* `tools/probe-road-plan.mjs [scale] [seeds…]` measures the network: length by class, side-by-side duplicate
  roads, junction angles, grade, and paving drawn twice.
* `tests/road-measure.mjs` holds the shared measuring code (`ribbonVsGround`, `seenFrom`, `ringCells`,
  `roadPlanStats`, `junctionAngle`).
* Screenshots are in `research/round28-roads/`. `before-*` is the commit before round 28, `after-*` is now,
  `noshader-*` is the drape without the distance shader, and `before-map-*` / `after-map-*` show the map
  change.

## Part 1 — floating, paper-thin roads

### What we measured (before)

Road vertices against `heightAt`, default Small planet, seed 25392:

| | median | 95th pct | worst |
|---|---|---|---|
| world roads, Small | **0.84 m** | 1.74 m | 3.1 m |
| world roads, full size | 1.6 m | — | 13.3 m |
| town streets | 0.35 m | — | 2.9 m |

Seen from a town: 13–25% of world-road vertices were **buried** in the coarse terrain rings, and 23–71% were
**hanging** over them.

### Root causes

1. **The ribbon was lifted, not laid.** Round 22's fix for "the ground pokes through the road" raised each
   flat cross-section to the highest ground across its width *and half a step toward each neighbour*. Road
   points are a fifth of a map cell apart (12.8 m on Super tiny, 45 m on Small, 128 m at full size), so on any
   slope "half a step uphill" means half the climb to the next point. A 4% road on Small floated 0.9 m
   everywhere. The flat quad between two lifted cross-sections was a sheet hanging over the verge. Town
   streets had the same bug in `crownLane`: they took the highest ground across the street plus 2 m either
   side, so on a side slope the downhill kerb floated.
2. **A road was one face with no thickness.** Seen edge-on it was a line, and over a dip it was a sheet of
   paper.
3. **Far away, the terrain can't draw a road bed.** Past the fine rings, a clipmap quad is 10–160 m wide:
   a flat plane through three height samples. A 7 m road bed isn't in it at all. The drawn ground was
   1–5 m off the road (95th pct) on the 32 m ring and up to 21 m on the 96 m ring, sometimes above (road
   buried) and sometimes below (road hanging). No CPU-side fix can solve this, because which ring covers a
   road changes every time the player crosses a cell.
4. `polygonOffset` was not an option: the renderer uses a logarithmic depth buffer, which writes
   `gl_FragDepth` and ignores the offset.
5. **Two paving sheets where a branch ran into its trunk.** Once both lie on the same ground, they flicker
   against each other, and a trail's grass crown showed through a highway.

### What changed

* **The ribbon drapes** (`drapeRibbon` in `js/roadplan.js`). It is cut every 3 m along (16 m far off,
  `drapeStepAt`). Every vertex asks `heightAt` and sits a 5–9 cm lift above it (`ROAD_LIFT` by class). Then the
  midpoint of each quad edge is checked, and the quad is raised if the hillside bulges between its corners.
  Under a world road, the ground *is* the graded road bed that planet.js carves, so the ribbon matches the bed
  to the millimetre. Drawn geometry and walked geometry are now the same surface.
* **Every road has an edge** (`ROAD_SKIRT`): a sloped earth-coloured face that drops 0.45 m over 0.35 m,
  tucked under the verge. A first version was dark and read as a black slab edge in the screenshots; the
  bank is now half road colour and half soil, lit like the ground.
* **A distance shader** (`roadShader` in `js/features.js`) handles what the coarse rings can't draw. Starting
  60 m out, each vertex slides toward the camera along its own view ray. It doesn't move on screen, but in the
  depth buffer it now sits in front of the hill that would have covered it. Starting 40 m out, the skirt
  drops further, so a road over a coarse ring's dip reads as an embankment instead of a hanging sheet.
* **Branch trim** (`roadKeep`): where a branch runs inside a road that outranks it, the branch stops at the
  kerb, keeping one row tucked under. Paving drawn twice on 25392@Small went from 28 m² to 12 m².

### After

Seed 25392, Small (`probe-road-float.mjs 0.35 25392`):

| | median | 95th pct | 99th pct | worst |
|---|---|---|---|---|
| world roads vs `heightAt` | 0.09 m | 0.10 m | 0.13 m | 0.33 m |
| town streets vs `heightAt` | 0.06 m | 0.07 m | 0.09 m | 0.24 m |

The median is the lift itself. Seen from the town, 0.49% of road vertices are still behind the drawn hill
(all of them 1.6 km away) and 0.00% hang past the skirt. A road + town rebuild takes 85 ms (round 27: about 65 ms).

## Part 2 — road plans

### Problems we found by measuring

| seed @ Small | km | duplicate side-by-side road | junctions < 30° (old measure) | over 12% grade |
|---|---|---|---|---|
| 25392 | 42.6 | 0.2% | 18% | 3.9% |
| 7 | 197.7 | 0.3% | 14% | 0.3% |
| 4477 | 241.4 | 0.1% | 16% | 0.5% |
| 101 | 33.2 | 2.5% | 6% | 11.3% |
| 14343310 | 190.1 | 0.4% | 12% | 2.0% |

* **The 12–18% "sliver junctions" were a bug in the measurement.** It compared the branch to the trunk
  segment's line using an absolute cosine. A road carrying straight on from another road's *end* therefore
  read as 0°, and all of the reported "slivers" on Small were continuations like that. `junctionAngle` now
  measures against each arm of the trunk that actually leaves the junction. Real count: **0 of 337** on
  Small, and **2** on seed 7 at Super tiny (roads 53 and 33, both a 23° Y).
* **The map showed roads that aren't there.** The map stroked World Forge's `world.roads`, the links planet.js
  *starts* from, not the roads it builds (merged corridors, switchbacks, spurs, dropped stubs). Measured
  against `terrain.roadPaths`:

  | seed @ Small | real road > ½ cell from any map line | map line > ½ cell from any real road |
  |---|---|---|
  | 25392 (the user's world) | **18.4%** | **20.5%** |
  | 101 | 12.0% | 6.8% |
  | 7 | 1.4% | 0.8% |
  | 4477 | 1.3% | 0.6% |

  The hilly worlds are where it's worst, because switchbacks are only on the ground. In `before-map-z11.png`
  the player is standing on the road while the map draws it a full cell away. On top of that, the region
  detail view stroked each region's own dashed "tracks", which nothing in Farhold ever builds.
* **Grade:** most length over 12% is on switchback legs (the fold targets about 10% over 40 m windows, so a
  20 m leg can reach 12–20%). The worst cases (34% on seed 101, 61% on seed 14343310) are climbs the fold
  pass already gave up on and marked `steep` (`js/road-fold.js`: water, cliff or town ring in the way).

### Ideas considered

1. Draw the real network on the map. **Chosen.** It's the biggest player-facing mismatch.
2. Square thin Y junctions. **Chosen**, at the true count (2 junctions).
3. Retune the fold toward 8% legs. Not done: it moves every folded road on every world, invalidates the
   fold cache and round 27's pinned road hashes, and legs at 12–15% are what real switchbacks are.
   Noted as a candidate.
4. Merge side-by-side duplicate roads harder. Not needed: 0.1–0.4% (2.5% on seed 101) is within what the
   merge allows.
5. Ruts and edge wear in the vertex colours. Not done this round; the class looks from round 27 M8 already
   tell highway, road and trail apart.

### What changed

* **`js/map.js` `drawRoadNetwork`** strokes `terrain.roadPaths` by class, in World Forge's own colours and
  widths, at the map's own `x / M_PER_CELL + 0.5` (the player marker's rule). The lines are cached as
  Path2D in cell units. `renderWorld` is called with `roads: false`, and the region detail tracks are no
  longer drawn. Sea lanes are still World Forge's, because they aren't built on the ground.
* **`js/planet.js` `squareJunctions`** runs after the crossroads pass and before grading. A branch leaving
  its trunk at under 30°, measured against the trunk's arms, has its hugging points dropped. Its junction
  slides along the trunk to the last spot where the branch still leaves at 55°. This is a search rather than
  a solved formula, because the trunk bends at both junctions it fixes. `terrain.roadJunctionsSquared`
  reports the count; `opts.squareJunctions: false` turns it off. On every world tested at Small and full
  size it squares nothing, so those roads are unchanged.
* `tests/road-measure.mjs` gets `junctionAngle` and `pointAlong`, and `roadPlanStats` uses them.

## Tests

`tests/round28-roads.test.js` (node), on four worlds (25392 at Small and full size, 7 at Super tiny, 4477 at Small):

* draped road and street vertices *and edge midpoints* against `heightAt`: median < 0.12 m, 99th pct < 0.2 m (roads);
* every skirt foot is under the verge;
* seen from the town against the drawn rings: < 2% buried, < 1% hanging;
* the compiled shader is the formula the test models;
* drape over a pure bump and a pure valley;
* branch trim: < 20 m² of paving drawn twice;
* rebuild cost (logged);
* **new:** no junction under 30°, with the arm-based measure checked first on a continuation (180°) and a 20° Y;
* **new:** the map reads `terrain.roadPaths` and never asks World Forge for `world.roads`.

`tests/round28-roads.spec.js` (Playwright) takes the close-up, side-on, 60 m and 120 m road shots plus the map
at zoom 1, 4.2 and 11, and fails on any page error.
