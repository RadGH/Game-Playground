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

## Placements (`placements/<zone>.json`)

`tools/place-vignettes.mjs [zone]` places every recipe on a baked zone: dry walkable ground over its
whole radius, biome in its tags, ≥ 160 m from the town centre, ≥ 70 m from the dungeon door, ≥ 140 m
apart. Output `{ zone, terrainHash, placements: [{ id, type:'vignette', name, x, z, yaw, radius, biome, level }] }`
in absolute zone metres — stream A turns each into room objects + a camp (rotate the recipe's relative
coordinates by `yaw` around `x, z`). `terrainHash` must match the bake; the test fails on a stale file.
Stream B's full bake will take this job over (PLAN §3.2) and keep the same record shape.

## Tests

`tests/E/content.test.js`: kit ids exist, monsters exist, tags resolve, everything inside its radius,
placements on real ground, banned names.
