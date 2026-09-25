# Round 17 — worldgen cluster: what the lead agent needs to do

**Short answer: nothing.** No hook is needed in `js/main.js`, `js/hud.js`, `style.css` or
`index.html`. Everything in this cluster runs off the `terrain` object, and the four modules that
needed the new information (`js/features.js`, `js/resources.js`, `js/sites.js`,
`proctown/js/townplan.js`) already receive it directly.

This file exists so that is on the record, and to carry the two optional follow-ups below that touch
files this cluster does not own.

## What changed, in one line each

| File | What |
|---|---|
| `js/planet.js` | the road lift walks its legs instead of sampling its points; every road point carries `floor` (the water it may never go under) and the junction pass is clamped to it; a road whose carriageway is over a river gets a crossing at any angle; a crossing's footprint is clamped to the carriageway that has to carry it; the river carve builds a rim so the water's edge has a bank to stop against; `riverTopAt` is one answer for "how high is the water here" shared by the lift, `waterAt` and `plantable`; **new: `terrain.bridgedAt(x, z, pad = 0)`** |
| `js/water-plan.js` | the sheet's widening bisects back onto the waterline instead of stopping up the bank |
| `js/features.js` | `dryFor` — a footprint water test with freeboard, used by every `place()`; `buildable` and the street `skip` ask `bridgedAt` |
| `js/resources.js` | `onTheRoad` drops a seam that lands on a road or a bridge deck, **after** the scatter so the tile's rng is untouched |
| `js/sites.js` | a set-piece slot is never inside a bridge footprint |
| `proctown/js/townplan.js` | the central square goes on ground `buildable` accepts |
| `tools/probe-worldgen.mjs` | new: builds one named world and prints a number for every claim in a play-test report |
| `tests/round17-worldgen.test.js` | new: 14 tests |
| `tests/round16-roads.test.js` | three assertions re-aimed, each commented with what changed underneath it |

## The one new piece of terrain API

```js
terrain.bridgedAt(x, z, pad = 0)   // → boolean: is this point inside a bridge's deck footprint?
```

A crossing's footprint is a **hole**: `heightAt` leaves the river channel carved under it so the
water runs through, and the deck carries you. Anything that stands something on the ground has to
ask, or it stands in mid-air over a river — that was the user's *"there is a tower inside of the
bridge"*. `pad` widens the rectangle, for a thing wider than a point (a fort's walls, a seam's
radius). It is accurate to about 16 m of pad, which is what the bucket grid holds.

## Optional follow-ups, in files this cluster does not own

Neither is a reported bug; both are the same fault one system along, and both are one line.

1. **`js/props.js` — trees and rocks on a bridge deck.** The prop scatter keeps clear of roads
   (`roadAt`) and of water, but nothing asks about a bridge footprint, so a tree can be scattered on
   ground that has been carved out to the river bed under a deck. Wherever the scatter tests
   `terrain.roadAt(x, z)`, add `|| terrain.bridgedAt?.(x, z, 1)`.

2. **`js/build.js` / `js/buildplan.js` — the player's own build ghost.** Same question for anything
   the player places: a crate on a bridge deck is a crate hanging over a river. Wherever the ghost's
   red/green test reads the terrain, `terrain.bridgedAt?.(x, z, radius)` should make it red.

## Known and deliberate: the town is still in the river

Feafungate (seed 56138, Chodikvraun III) has its **map node** in the middle of a river channel, 5.4 m
under the water, with 41% of the ground inside its ring under the surface. Everything the town DOES
about that is fixed — its square, its plots and its structures stay out of the water now, and the
river through it is bridged rather than dammed — but the settlement itself was not moved.

Moving one means moving `node.x` / `node.y`, which is a **map cell**: 64 m at this planet size and
224 m at the default, far coarser than the ~30 m the town needs to shift. World Forge has already
routed every road to the old cell, and `js/map.js`, `js/quests.js`, `js/markers.js` and
`js/waypoints.js` each derive their own metres from `node.x * M_PER_CELL` independently. A sub-cell
offset would have to be read by all of them, and four of those files belong to other people this
round. It is the right fix and it is a round of its own.
