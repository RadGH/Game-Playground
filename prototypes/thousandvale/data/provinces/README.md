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

## Play-test 2 (2026-10-05): shops, offices, barber

- **`shops.json`** (Q9/Q11/Q16/Q20) — `kinds` (authored): per trader kind its `role`, `sign`, `light`, gear `categories`
  (emberveil items.json / Farhold foci bases, `count`, `rarity` weights — rolled at the buyer's level), fixed `goods`
  (`source` potion | gear (Farhold js/gear.js GEAR_BASES: mounts, lights, quivers) | good (described in `goodsCatalog` with a
  `use` block), `price`, `minLevel`) and `services` (barber `appearance` price list with the first change free, inn `bind`,
  smith `salvage`, broker `followers`, unbinder `retrain`, healer `cure`, stable `stable`). `pricing` = sell factor, buyback,
  restock, per-item-level price step. `towns` = per hub town `levelCap`, `priceMult`, `stock` overrides, and `shops` (written
  from stream B's bake by tools/content-offices.mjs). `roles` = MADE by `tools/content-shops.mjs` from `kinds` in stream A's
  shape (js/sim/shops.js) — never edit it by hand. The stable sells the Trail Horse from level 1 (60 g; the owner wants to
  try a mount), then pony 240 (5), courser 900 (10), dray elk 1600 (15).
- **`offices.json`** (Q10) — MADE by `tools/content-offices.mjs` (also run by place-vignettes): every working NPC of every hub
  town gets ONE building plot of B's town plan (B's `data.role` tag first, then ROLE_WANT), a `door` to stand at (>= 2.5 m from
  any other), a `sign` and `light` (shops lit, offices not), and `npc` when a quest NPC is that office's keeper (one body).
  Quest NPCs standing in a town without a trade get a `home`. `setpieces` lists the NPCs whose office is a set piece.
- **`schedules.json`** — anchor `office` (the NPC's own plot) and the new roles (armourer, bowyer, apothecary, provisioner,
  trader, tailor, jeweller, barber, reeve, trainer), named as stream B's data/world/town-offices.json.
- **`travellers.json`** — folk roles with `setpiece: true` work only at set pieces / B's slots (never picked by the filler).

## Angling (play-test 5, T25)

- **`angling.json`** — the text content: `fish[]` (46: id, name, desc, `water` river | lake | marsh | coast, `bands` = zone levels, `time`, `rarity`,
  `size` cm, `price`, `skill`, `pool?` = pools only), `junk[]` (12), `legends[]` (one per zone: `zone`, optional `foundIn` when the zone itself is dry,
  `water`, `time`, `skill`, `title`, `trophy`), `pullBack[]` (the monster that climbs out, real bestiary ids), `crates` (the sunken crate: a T9 crate),
  `meals{}` (shops.json goodsCatalog shape) + `recipes[]`, `tools[]` (three rods) + `bait[]`, `anglers[]` (one per hub town), `skill.ranks`.
  The NUMBERS of the loop are stream C's (`js/rules/fishing.js`, `data/rules/fishing.json`). Tests: `tests/E/playtest5-angling.test.js`.
- **`angling-pools.json`** — MADE by `node tools/content-pools.mjs` from stream B's baked water (never edit by hand): 308 pool spots (world metres,
  each with a walkable `shore` point a cast away, a `water` kind, a `tier` 1/2/3 and its distance to the nearest road), `meta.<zone>` (`live` = how
  many are open at once, `water` = what each baked water kind counts as in that zone), and where each town's angler stands. Roadside pools are tier 1;
  every zone keeps at least a quarter of its pools at tier 1. The pool flagged `start` + `always` is the first quest's, by Torborhold.
  Tests: `tests/E/playtest5-pools.test.js` (in the water, bank walkable, legends catchable, a newcomer passes two on the first walk).
- **`shops.json`** gained `kinds.angler` (role `angler`: rods and bait as goods) and, from `node tools/content-gear.mjs`, every NEW row of stream F's
  `avatar-3d/data/gear-catalog.json` on a shelf (64 of 66; `catalog: [bases]` + `minCap: {base: level}` + `countBase` on a category are that tool's).
  Tests: `tests/E/playtest5-gear.test.js`.
- **`road-events.json`** — every kind now carries an `info` block (name, what, objective, durationSec, onSuccess, onFail, rewardText): see
  data/quests/README.md "Event info"; `node tools/content-events.mjs`.

## The economy (owner feedback 7, V2)

- **`economy.json`** — every gold number a place or a person pays or charges: `unit` (one kill's gold, the same numbers as data/rules/prices.json `kill`),
  `quest.mult`, `event`, `chest`, `treasure`, `roadChest`, `fare`, `mounts`, `mail`, `guild`, `barber`, and `targets` (the rules as ratios).
  Read by js/sim/economy-knobs.js. Measure any change with `node tools/sim-economy.mjs`; tables in docs/economy/README.md; the rules are pinned by
  tests/E/playtest7-economy.test.js. A fixed price in `shops.json` must cost at least one kill and at most twenty hours at the level it opens.
- **Pools (V3)** — `angling-pools.json` now has a `town` pool (always open, tier 1) for every hub town with water in reach, with the angler beside it;
  `byRoad` pools from a second roadside pass; 60% of a zone's pools are tier 1 and 60% are open at once.
