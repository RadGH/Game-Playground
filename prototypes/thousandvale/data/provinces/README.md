# Provinces (stream E)

| File | What |
|---|---|
| `torbor_downs.json` | The starter province sheet (PLAN §4.1): 16 zones on a 4×4 grid — archetype, level band (a ramp from the start hub: the low edge is what the ramp gives on the zone's near side, P26), town/hamlet/fort names, dungeon family, rares, hook, quest file, **`camps`** (the wilds monster mix: `type, level [lo,hi], count [lo,hi], where, with?`). `grid.start` = the starter (`test` → world zone z12_02). |
| `archetypes.json` | The 12 zone archetypes: the floor every zone has + what each adds (`extras`), its zone event, monsters, dungeon families. |
| `sites.json` | Fort / farm / cave templates (props, garrison, pests, cave plans) and `byArchetype` weights. |
| `rares.json` | The two named rares of every zone (encounter ids). |
| `torbor_downs-places.json` | Made by `tools/place-vignettes.mjs`: per zone, `rename` (stream B settlement/crossing id → sheet name) and `asks` (settlements the sheet needs where the world has none — stream B places them). |
| `travellers.json` | Who walks the roads and works the wilds (P19): `rules` (groups per km of route, spacing, waits, night, who fights), 12 traveller `kinds` (crew roles, pack beast/cart, speed, day/night, chatter pools) and 14 `folk` roles the placer puts in the wilds (where they fit, loop size, work verb, props, chatter). |
| `torbor_downs-routes.json` | Made by `tools/place-vignettes.mjs`: the travellers' routes — B's roads stitched across the province, one per pair of neighbouring settlements, WORLD metres, pts every ~16 m, `kinds` that fit; `unanchored` = settlements with no road yet. |
| `schedules.json` | NPC day/night schedules for town roles (PLAN §4.3): a day is 120 min; blocks start at a phase and stand at an anchor (B building `want`s, the square, the gate, home, the fields). A role's service never switches off — at night it serves from the inn or home. Per-town role lists and guard counts. |

Where things stand on the map: `data/vignettes/placements/<world zone>.json` (see data/vignettes/README.md).
The world zones each sheet zone uses: stream B's `data/world/province-map.json`.

Tests: `tests/E/province.test.js` (grid, bands, archetypes, variety), `tests/E/placement.test.js` (coordinates,
schedules), `tests/E/quests.test.js` (sites).
