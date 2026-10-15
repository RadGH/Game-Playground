# Vignettes (stream E)

Small hand-designed sites — a hanged man's tree, a tipped cart, a drowned shrine — that make walking
through a zone turn up something new every ~45 seconds (PLAN §3.5). M1 ships 8 in `m1.json`; the plan
grows the library to ~120.

## Recipe (`m1.json` → `vignettes[]`)

| Field | Meaning |
|---|---|
| `id`, `name` | Unique id; the place name players see. |
| `blurb` | Claude-facing: what it is and why it is there. |
| `lore` | Player-facing line shown when you first walk in. Plain language, no banned names. |
| `tags` | Where the bake may put it: `biomes` (World Forge biome keys, see `t.biomes`), `archetypes` (keys of `data/provinces/archetypes.json`), `band` [min, max] level, `cultures`. |
| `radius` | Metres it needs clear and walkable (scatter stays off it). |
| `props[]` | `{kind, id, x, z, yaw, scale?}` relative to the centre. `kind`: `prop` = `highdef-3d/js/kit/rocks.js` PROP_BUILDERS id, `ground` = its GROUND_BUILDERS id, `tree` = `pine/fir/oak/birch` (`dead: true` = leafless). |
| *(fences)* | A `fence_rail` prop is 2.4 m long and runs along the recipe's **local X at yaw 0** (put a `fence_post` at x ± 1.2). To run it along local Z use yaw 1.57. Play-test 5 (T8): three recipes had rails at yaw 1.57 between posts spaced along X — every rail stood ACROSS its own fence. `tests/B/fences.test.js` checks every recipe. The `wooden_fence` / `iron_fence` / `stone_wall` models follow the same rule (they run along local X). |
| `monsters[]` | The one encounter: `{type (Farhold bestiary id), count, level (added to the zone's low band), x, z, radius}` — becomes a camp. |
| `objects[]` | `{type: chest|note|npc|use, name, x, z, …}`: chest `tier` (`only`, `hidden`+`hint`, `after` = opens once that object is used); note `text`; npc `says[]`; use `text`, `gives`, `cost`, `buff`. `quest` = the quest it starts. |

## Which vignettes go where (`assignment/<province>.json`)

`tools/assign-vignettes.mjs [province] [perZone=10]` picks the vignettes of every zone of a province sheet (seeded
local search, same inputs → same file): only where the zone's archetype is in the recipe's tags; **pinned** ones first
(every vignette a quest, a quest NPC or a treasure step of that zone names — `tools/content-lib.mjs pinnedVignettes`);
never twice within 2 zones; **variety** — any 5 connected zones hold ≥ 40 distinct (Torbor Downs: worst set 42). A
wet-only recipe (every biome tag lake/coast/beach/marsh) never goes to a baked zone that has none of those and no water.

## Placements (`placements/<world zone>.json`)

`tools/place-vignettes.mjs [zone]` (rules in `tools/content-place.mjs`) places a whole zone's content on stream B's
bake — vignettes, forts, farms, caves, wilds camps, rares (+ a roaming loop), waystones, quest NPCs, treasure clues and
caches, the zone hook — and writes `data/provinces/<province>-places.json` (settlement names imposed on B's settlements,
and "asks" for the settlements the sheet needs where the world has none). Every record: `{ type, id, name?, x, z, yaw,
radius }` in zone metres (point things `radius: 1`); the full field list per type is in the file's `_doc` and in
docs/requests.md "E -> A, 2026-10-04 — the placement format". Rules every disc obeys: dry walkable ground over its radius,
in the **province hub's walkable component** (nav.bin of every zone stitched together, so a river that cuts a zone in two
does not strand the far half), off roads/streets (distance field from nav ROAD), off building plots and settlement
circles (+ a per-kind gap), not steep (16–28° by kind), ≥ 60 m from the zone edge, spaced from every other disc
(vignettes ≥ 140 m apart), and clear of stream B's door/arenas by **B's own re-search rule** so a re-bake never moves them.
Trees and rocks inside a disc do not count: B's re-bake keeps scatter off every placement. `features[]` holds hooks that
ARE an existing feature (a ford, a city, a line across the zone) — not keep-clear discs.
**Longest boring walk ≤ 250 m** (PLAN §16, `tools/boring-walk.mjs`): after everything else is placed, the placer drops
fillers into the emptiest reachable pockets and the longest road stretches with nothing in sight (60 m) — a `wayside`
dressing from `wayside.json` (a cairn, a milestone, a ribboned tree… props + a lore line, no encounter) or a camp from the
zone's mix, alternating, tagged `filler: true` — until both the road and the cross-country measure pass.
`placements/test.json` is the M0 fixture zone (vignettes only): `node tools/place-vignettes.mjs test`.

**The living world (owner play-test P19/P26, `tools/content-living.mjs`):** after the boring-walk fillers, `fillDensity`
walks an 8 m grid of each zone's reachable open ground and keeps dropping things until no open sample is more than 50 m
from the edge of something (45 m on roads) — about one thing every ~100 m. Per 32 drops in the open: 14 **curios**
(`type: 'curio'`, `recipe` = an id in `curios.json`: mini vignettes with props and a note / chest / use, no monsters),
8 **strays** (`camp` + `stray: true`, 1-3 of the zone's mix), 5 **wayside** dressings, 3 **roaming packs** (`camp` +
`roam: true` + a walkable `path` loop) and 2 **folk** (`type: 'folk'`: a woodcutter, shepherd, hermit… from
`data/provinces/travellers.json` with a small `path` and `chatter` pools from `data/names/chatter.json`); on roads mostly
wayside and curios. No curio twice within 350 m. Every hostile thing takes the **level of its spot** from the level ramp
(`tools/content-place.mjs` `levelField`: 1 by Torborhold's gate, +1 per ~550 m, never above the zone's band; weaker types
are placed where the ramp is low). Each file reports `density` (share covered) and `levels` ([lo, hi] it holds).
Waystones: never two within 60 m; a hub town's stone stands inside its circle, the door's 10-30 m from the door and named
after the zone's dungeon (P14). Whole-province runs also write `data/provinces/torbor_downs-routes.json` (travellers'
routes), the `where`/`map`/capped levels in `data/quests/events.json` and `data/quests/marks/torbor_downs.json` (quest map
marks).

Order after a change: B bakes → `assign-vignettes.mjs` (if recipes/quests changed) → `place-vignettes.mjs` → B re-bakes
(scatter/nav only).

## Tests

`tests/E/content.test.js`: kit ids exist, monsters exist, tags resolve, everything inside its radius,
placements on real ground, banned names. `tests/E/placement.test.js`: every zone's file matches its bake, the floor
counts, every disc passes the placer's rule AND an independent check against B's road polylines, bridges, plots and
settlement circles, reachability from the hub, rare loops walkable, spacing, quest/treasure references placed, variety
and sameness on the placed world, B's sites untouched. `tests/E/living.test.js` (play-test 1): builds stream A's real
layout and checks no duplicate waystones (P14), the level ramp round the start (P26), density measured independently +
curio/folk/route/chatter references (P19), quest `text`/`where`/marks and no vignette quest asking for its own fight (P17),
event `where`/`blurb`/`map`.

## Set pieces (play-test 2, Q18) — `setpieces.json`

Twelve hand-designed places near Torborhold (graveyard, farmland with orchard, watermill, hunters' camp, beast den, standing
stones, roadside shrine, burned manor, lumber camp, fishing pool, drill field, crossroads inn). A recipe is a vignette recipe
(props, monsters, objects) plus `setpiece`, `kind`, `pin` (where: near a town or another set piece, dist / fromEdge, water,
road, route, biome, high, awayFromRoad), `ground` (B: level/paint), `parts` / `models` / `buildings` / `fields` (drawn by
stream D; `models` = the top-level catalog with a description and a primitive fallback for each), `folk` (workers with a
loop), `boss` (Gristle's Hollow: `mb_old_gristle`) and `bind` ({zone, piece, name}: put the content ON one of stream B's baked
ground pieces). Placed FIRST by `tools/content-setpieces.mjs` (from place-vignettes): bound ones at B's piece (`bound`,
`scale` = B's radius / ours — stream A/D multiply offsets by it; B's piece takes our name through places.json `setPieces` /
`lanes`), the rest by their pin as discs (rule `setpiece` in content-place.mjs). B's other pieces get a worker at each of
their slots (`slotFolk`). B's set pieces, fields and set buildings are keep-clear discs for everything we place.

## Per-province dressing (Expansion 1, stream W)

A province other than Torbor Downs may have its own catalogues beside Torbor's: `<province>-vignettes.json`
(`vignettes`), `<province>-curios.json` (`curios`), `<province>-wayside.json` (`kinds`) — Vharlen has all three. When
it has one, the tools use it INSTEAD of Torbor's (tools/content-lib.mjs `provinceDressing`; assign-vignettes,
place-vignettes, content-living) — never a mix — and every id is prefixed (`vh_`) so the server and client can hold
every province's recipes at once (js/sim/content.js VIGNETTE_FILES / WAYSIDE_FILES, js/client/vignette-props.js).
Island recipes use only the props listed in `vharlen-props.json` (`island` ids drawn by js/client/vharl-props.js,
plus a few neutral kit pieces); no `tree` kind (palms, tree ferns and charred trunks are island props).
Unlike Torbor's (whose wayside props have never been drawn — only the lore reaches the player), the island's wayside
dressing and its folk's camp props ARE drawn (site-view.js `waysidePropList`; Torbor's look is unchanged).
Dev page: tools/vharl-props.html shows every island prop; tools/ground-look.html?sites=1 draws a zone's placed content.
