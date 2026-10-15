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

## Owner feedback 8 (2026-10-08): town guards, ox carts, titles, town services

- **`guards.json`** (W1) — `rules` (what a guard is), `ranks`, `raid` (how a raid meets them), `hold` (the tuning rule), and the generated `posts` + `gates`. `node tools/sim-raid.mjs` prints whether the guards hold each town raid alone / with players.
- **`carts.json`** (W5) — the Longroad Carters: `rules`, `stops` (one per settlement), `links`, `fares` (every pair, priced by economy.json `cart`), `roaming`.
- **`town-services.json`** (W15) — which roles and shop kinds each settlement has, for the map's search.
- Made by `tools/content-towns.mjs` -> `tools/content-givers.mjs` -> `tools/content-hunts.mjs` (the last copies guards, carters and carts into `data/vignettes/placements/<zone>.quest.json` as `guard`, `npc` and `cart` rows). Run those three after any re-bake that moves a gate. The hand-written blocks of guards.json / carts.json are kept by the tool.
- `titled: true | false` (W27) is on every NPC record; the rule is `tools/content-titled.mjs` and, as data, `data/names/titles.json` `titled`.
- `shops.json`: no light items (W22); backpacks at the tailor (W19) — `minCapBase` on a category is the hand-kept version of `minCap` for bases that are not catalog rows.

## More than one province (Expansion 1, stream P)

Torbor Downs is the HOME province: every file above stays where it is and means what it meant. Any other province
(`vharlen`, levels 10–20, its own island) keeps its OWN copy of each file beside Torbor's, named `<province>-<file>`
in the same folder. The one table of which file is which is `js/sim/province-files.js` (`PROVINCE_DATA`); the server
(js/sim/content.js `loadProvinceContent`), the content tools (`--province=<id>`) and the map's search all go through it.

| Kind | Files | A province without its own file gets |
|---|---|---|
| **shared** (rules, catalogues) | shops, schedules, travellers, wanderers, economy, angling, professions, road-events, rares, sites, archetypes, mounts; names (`data/names/<province>.json`, or the sheet's `names`) | Torbor's file. WITH its own file: Torbor's, with its own laid over it **key by key at the top level** — name only the blocks you change (e.g. `vharlen-shops.json` = `{ "towns": {…} }`, or a `kinds` block that replaces all kinds). Torbor's town-bound keys are never lent: shops `towns`, angling `anglers`, professions `trainers`. |
| **placed** (things that stand on one map) | offices, carts, guards, angling-pools, professions-nodes, town-services, setpiece-pins, refunds, and `data/quests/marks/<province>-givers.json` | nothing (no offices, no carts, no guard posts until its tools are run for it). |

Already per province before Expansion 1: the sheet `<province>.json`, `<province>-places.json`, `<province>-routes.json`,
`data/quests/marks/<province>.json` + `-hunts.json`, `data/vignettes/assignment/<province>.json`. Shared across every
province and filtered by zone: `data/quests/events.json`, `data/quests/<sheet zone>.json`, `data/vignettes/placements/<world zone>*.json`.

What the server does with them (js/sim/province.js): each province has its own shops, ox carts (a cart never leaves its
island), road events, guards' words, NPC name pool, schedule phases, potion drops and — when its economy file differs —
its own gold numbers (economy-knobs `withEconomy`, applied to its rooms and its players' messages). Realm-wide on purpose:
the mount book (every province's mounts; a mount you own rides everywhere), refunds (per character), fishing pools and
gathering nodes (keyed by world zone, so all of them are held at once), potion numbers, the professions recipes.

The rules between provinces: the **starter** province is the one whose sheet band starts at level 1 — new characters
begin there whatever order the provinces load in. A province's **continent** is its province-map entry's `continent`
(else the province itself); waystone travel, free travel to a realm event and the Callboard never cross from one
continent to another ("take a ship from a harbour" — the voyage, js/sim/ships.js, is the only way). Respawn, the recall
charm and the inn you are bound at stay on the island you are on. The server loads every province of
data/world/province-map.json that has a sheet and at least one baked zone (server/load.mjs `defaultProvinces`, starter
first); one that fails to load is left out with a log line and never stops Torbor. Named encounters of a new province say
where they stand in their own encounter file (`data/encounters/<id>.json` `place`), not in realm.js's Torbor table.
Tests: `tests/A/expansion-provinces.test.js`.

## Vharlen, the Burning Isle (Expansion 1, stream C — content)

The second province (docs/EXPANSION-1.md): 9 zones, levels 10–20, reached only by ship. Its own files:

| File | What |
|---|---|
| `vharlen.json` | The sheet (same shape as torbor_downs.json) plus `elite` / `eventBoss` per zone, `specialties` + `specialtySites` (the bake's hot springs, acid pools and crater lake, with the names the island gives them — the mechanics are a later stream's), `gathering` (tools/content-professions.mjs: node kinds per family and tier, tier shares by band top — tiers 3–5, Torbor never grows 4–5) and `levels` (tools/content-place.mjs levelField: 300 m a level and every zone keeps its own band floor, because the hardest zone is in the middle of a small island). |
| `vharlen-rares.json` | Two named rares per zone (encounter ids). |
| `vharlen-sites.json` | The island's fort / farm / cave templates under the home template KEYS: Slagborn fire-camps (`warband: false` = its own garrison, not a Farhold warband), the Glass Kings' ruins, taro terraces, goat walls, salt pans, ironpalm groves, net racks, steam wells (`short` = the farm-name word), caves on the island's dungeon families. Island monsters only. |
| `vharlen-shops.json` | `towns` only (levelCap = band top + 1–2, priceMult 1.1–1.3; `shops` written by content-offices from stream T's town plans). `harbour` on Port Vharl = the ships.json harbour on its pier; tools/content-givers.mjs lists `harbourmaster` in the town's services for it. Trader kinds are Torbor's. |
| `vharlen-angling.json` | 15 warm-water / volcanic fish (bands 10–20), 9 legends, 9 anglers, island pull-backs. The server joins every province's species into one catch table (js/sim/angling.js `joinAnglingContent`). |
| made by the tools (`--province=vharlen`) | `-places`, `-routes`, `-offices`, `-setpiece-pins`, `-angling-pools`, `-professions-nodes`, `-carts`, `-guards`, `-town-services`; data/quests/marks/`vharlen.json`, `-givers`, `-hunts`; data/vignettes/placements/z1{1,2,3}_{09,10,11}*.json. |

Gathering: tools/content-professions.mjs `VHARL_MATERIALS` / `VHARL_NODES` / `SKIN_HIDE` add obsidian, sulphur, ironpalm, steamcap, cinderbloom and salamander hide to the realm-wide data/provinces/professions.json, each as an ALTERNATE in an existing tier-4/5 recipe (blackiron from obsidian, sunsteel with a sulphur fire, drake leather from salamander hide, the tier-4 wood / mushroom and tier-5 herb gear patterns) and most with a new line (Obsidian Edge, Brimstone Oil, Cinderbloom Draught, Steamcap Broth). A salamander's hide is its own (`skins.types.<id>.hide`, read by js/rules/professions.js skinOf).

**The island's own wilderness dressing (stream W).** Vharlen is never dressed from Torbor's catalogues any more: its own
`data/vignettes/vharlen-vignettes.json` (24 vignettes, 4 a zone — `assign-vignettes.mjs vharlen 4`), `vharlen-curios.json`
(49), `vharlen-wayside.json` (20), and here `vharlen-travellers.json` (10 traveller kinds, 14 folk roles, `fighters`),
`vharlen-wanderers.json` (8 kinds incl. the `ash_hauler` cart for hire, an island pedlar shop, lore, tips),
`vharlen-road-events.json` (8 chests, 4 deliver, 3 escort, 3 rescue; `words` on each record, `info` by content-events),
`vharlen-shops.json` `kinds` + `goodsCatalog` (island goods in place of trail ale, oats and horseshoes; `roles` made by
content-shops) and `vharlen-carts.json` `rules.greetings` (read by content-towns for the carters). New chatter pools
(`role.<island role>`, `road.isle_*`) are in data/names/chatter.json; js/sim/travellers.js speaks `road.isle_*` for a kind
that lists them. The tools pick a province's catalogue through tools/content-lib.mjs `provinceDressing` (Torbor's runs
are byte-identical); island folk records carry their camp `props`, which the client draws. Props: only the ids in
data/vignettes/vharlen-props.json (js/client/vharl-props.js). The placer keeps every disc off stream S's hazard sites
(`hazardDiscs`). `vharlen-sites.json` props are island props too, and js/client/site-view.js draws island farms/forts in
the `vharl` culture (basalt goat walls, taro terraces, salt pans, a steam well). Tests: tests/W/vharlen-dressing.test.js.

Run order after a change to the island's content: `place-vignettes -> bake-zone --province vharlen -> bake-horizon -> bake-map -> content-pools -> content-professions -> content-towns -> content-givers -> content-hunts -> content-events -> content-hazards`, all `--province=vharlen`. The bake keeps scatter off the placed discs, so it must come AFTER the last place-vignettes (the density filler does not settle: placing again on the new bake moves ~1,000 things a zone); the content tools after the bake. Tests: tests/C/vharlen-content.test.js (ids, bands, names, banned words, no Torbor place names, gathering, angling, shops, placements, marks) and tests/C/vharlen-server.test.js (the real realm: sail to Port Vharl, camps, folk, a quest, a shop, the Harbourmaster).

## Vharlen's hazards (Expansion 1 §4 items 1–4, stream S)

- **`vharlen-hazards.json`** — MADE by `node tools/content-hazards.mjs --province=vharlen` from the baked island (never by hand; the bake does not write it). A **placed** file (`js/sim/province-files.js` `hazards`; Torbor Downs has none). World metres: `springs` (stream T's hot-spring pools + the crater lake, whose warm shallows count), `geysers` (4–7 each in the Steamwood, Fumarole Fen, Sulphur Bight; a `ledge` = where a throw from it lands, found by running the real movement step over the real terrain), `vents` (fissure lines a→b in the Pumice Wastes, Kiln Ridge, the Caldera; `level` = the zone band top the fire is scaled to), `ashfall.zones`, and `terrain` (each zone's bake hash — the test fails when the island is re-baked and the tool has not been re-run).
- Rules: `js/rules/hazards.js` (numbers, timing per site from its id, geometry, what a soak / warm / hit does). Server: `js/sim/hazards.js` (ticked from province.js). Client: `js/client/vharlen-fx.js`. Wire: docs/protocol.md "Expansion 1 §4".
- Placement keeps clear of roads (a vent line is 35 m+ from any road its whole length), towns, NPCs, folk, guards, waystones, event arenas, dungeon doors and camps' middles; vents prefer to sit near a camp.
- **Run order after a re-bake of the island:** the chain above (`place-vignettes … content-events`), THEN `content-hazards --province=vharlen`. Tests: `tests/S/hazards.test.js` (rules, server loop, glide, placement), `tests/S/hazards-server.test.js` (the real realm), `tests/S/hazards.spec.js` (browser look; shots in tests/S/shots/).
