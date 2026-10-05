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
`placements/test.json` is the M0 fixture zone (vignettes only): `node tools/place-vignettes.mjs test`.

Order after a change: B bakes → `assign-vignettes.mjs` (if recipes/quests changed) → `place-vignettes.mjs` → B re-bakes
(scatter/nav only).

## Tests

`tests/E/content.test.js`: kit ids exist, monsters exist, tags resolve, everything inside its radius,
placements on real ground, banned names. `tests/E/placement.test.js`: every zone's file matches its bake, the floor
counts, every disc passes the placer's rule AND an independent check against B's road polylines, bridges, plots and
settlement circles, reachability from the hub, rare loops walkable, spacing, quest/treasure references placed, variety
and sameness on the placed world, B's sites untouched.
