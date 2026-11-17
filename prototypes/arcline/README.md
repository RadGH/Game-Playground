# Arcline

**Status:** first playable build (2026-11-16) — rounds 0–4 built: City Kit art, world + regions, the city sim, defence, ships, transit, weather; round 5 (house standard + publish) in progress.
**Play:** http://192.168.1.34:8400/prototypes/arcline/ (stable, LAN) · live: https://games.radgh.com/arcline/ once published.
**Next:** publish to games.radgh.com; then owner play-testing — balance from the tuning panel and the feel log.
**Parked:** trade routes between your own cities (owner: "tbd"); shared online world; controller support. See `docs/PLAN.md`.

A SimCity 4-style isometric city builder: a futuristic cyber city (skyscrapers, hotels, neon) on an alien world,
held behind walls and powered turrets against native wildlife that flocks in from its nests. No units. You generate a
world, pick a region of a mixed-size region map, land a Colony Core, and grow — people arrive by ship (that's the main
way a city grows), zoning decides where they live and work.

- **Plan + owner rulings:** `docs/PLAN.md` (§0 overrides everything), the owner's own words: `docs/OWNER-BRIEF.md`.
- **Code map:** `docs/ARCH.md`. Sim = `js/sim/` (pure, tested in node). City view = `js/render/` + `js/ui/` + `js/main.js`.
- **Art:** baked from `../../citykit/` (procedural three.js models → iso 2D day + night-lights pictures).
- **Feel:** effects follow `docs/research-boom-feel.md` (why Kindlewild's meteor felt good and Stoneward's didn't).
- **Tuning:** every balance number is in `data/tuning.json`; press ` (or add `?tune`) for the tuning panel; paste its
  Save block to Claude → `node tools/apply-tune.mjs arcline --why "…"` writes it and logs it in `docs/feel-log.md`.

## Tests

`node --test prototypes/arcline/tests/*.test.mjs` (sim), `tests/walk.mjs` (every screen, strict), Playwright specs.

## History

- 2026-11-15 — planned in a Q&A with the owner; City Kit (round 0) built; sim core (world, terrain, networks, zoning
  growth, arrivals-first population, budget, land value, industry, milestones); city renderer + tools + HUD.
- 2026-11-16 — title, new world, world map, saves; ships (settlers, warships, merchants), orbital strikes + Lance;
  nests with constant pressure and warned swarms; away earnings; transit + neighbour arrivals; wall repair; guide;
  traffic. Tests: 60+ node, Playwright player path + W-is-up, strict screen walk.
- 2026-11-16 — sound: zoom-aware mix (`citykit/js/world/mix.js`: effects 100% at zoom ≥ 1.2 → 25% at the widest,
  quieter off screen, big blasts carry; an ambient bed fades in as you zoom out — synthesized city hum + traffic, wind,
  alien birds by day / insects by night, Sound Lab rain + storm loops) and original procedural synthwave
  (`js/audio/music.js`: calm / night / tension moods that crossfade, seeded 8-bar phrase planning, ducks under big
  blasts; starts on the first tap, also on the title). Settings: Volume, Music, Effects, Ambience sliders + Mute.
  Tests: `tests/audio.test.mjs` (curves, mood picking, phrases), city.spec.js "sound" (browser).
- 2026-11-16 — owner report: cars drifted at an angle, terrace homes spilled into roads and neighbours. Vehicles are
  baked per ground direction (citykit `groundDirOfHeading`) and drive straight lane runs with square corners
  (`render/traffic.js`); a zoned lot laid sideways (1×2) now turns its building with it — `lot.face` (networks.js
  `lotFace`: the model turn that puts its front on a road; old saves get one on load) — and only grows where its front
  meets a road. Tests: `tests/alignment.test.mjs`, `tests/alignment.spec.js`.
- 2026-11-16 — owner reports #72 #73 #76 #77 #78 #81 #82 #86 (builder's tools). Turrets aim from their tile's middle
  and bake 32 facings, creatures 16 (citykit `Defence.centre`, recipe `dirs`). `sim/arms.js` is the one source for
  turret/wall numbers and merchant upgrades (`refreshArms`: Mk II/III refit every turret of a kind; wall/range
  blueprints, landmark discounts — none were read before). `sim/repair.js`: ghosts of destroyed walls/turrets/placed
  buildings (tap → rebuild; Tools › Bulk repair), walls heal above 50% after `wallRegenQuietSec`. `sim/undo.js`: every
  build action is a tile diff, undone with a full refund for `undoSec` (Ctrl+Z, the tool bar's Undo). Right-click or
  Esc during a drag cancels it. `ui/builder.js`: tray stat cards, turret/wall/ghost panels, Bulk repair, Undo. No
  pylon on a turret/wall/building tile. Tests: `tests/builder-1116.test.mjs`, `tests/builder.spec.js`, walk lines.
- 2026-11-16 — owner reports #71 #74 #75 #79 #80 #83 #84 #85 (city, world, HUD). Street lights every 3 tiles on
  straight roads + neon billboards / blade signs at most shops (`render/street.js` plan, `citykit/js/kit/street.js`
  models). Money shown per day = what each day pays (`city.js dailyNet`), a pay-day bar under the date (on the Credits
  pill on phones). Power/Water pills amber ≥ 85% use, red over, a toast when it gets worse; the R/C/I, Power and Water
  pills open sheets (`sim/advice.js`). Zoned lots level up through `city.js levelUp()` — the same check the info panel
  shows as a bar + needs — and grow into neighbouring zoned land (1×1 homes could never upgrade before). Bridges sit at
  bank height (`networks.js bridgeDecks`). Road links need roads meeting on both sides of the border; a new region gets
  a road stub at every neighbour road (`transit.js seedEdgeRoads`, summaries save `edgeRoads`); the world map draws a
  link only then. The city view resets traffic/effects per region (`main.js resetCityView`). Tests:
  `tests/feedback-1116.test.mjs`, `tests/feedback-1116.spec.js`, walk lines (power/water/demand sheets, info-home).
- 2026-11-17 — round 4, statistics + links (owner: "statistics to map view that lists the bonuses from neighboring
  cities, and an in game statistics menu"). **Statistics** (☰ menu or G, `ui/stats.js`, charts `ui/chart.js` — small
  SVG line/bar charts, labelled axes, tap/drag to read a day, legend shows the latest numbers): Overview tiles, History
  (people, credits, income/day, R/C/I demand, power and water made vs used, attractiveness + land value; 30 / 120 days /
  all), Neighbours, Defence (turrets, walls, wall health, kills, swarms held, damage taken + charts). History lives in
  the region save (`sim/stats.js`: `r.history` = one row a day for `statsRecentDays` days, older days folded into
  blocks that merge in pairs past `statsOldRows`; old saves start recording when opened; `r.stats` = defence tallies).
  **Neighbours** (Statistics tab + the world map card, one printer `neighbourList`, one rule `transit.js linkReport` /
  `linkValue` / `linkKind`): each neighbouring city, its link (road / transit / both / none) and what it gives (homes +
  shops demand, move-in speed, arrivals a month) and the capped total; the map draws transit links cyan. Links:
  transit needs a line with a station at the shared border on **both** sides (summaries save `edgeTransit`); summaries
  from before 2026-11-16 get `edgeRoads`/`edgeTransit` worked out from the city's save on load (`save.js
  edgesFromSave`), or fall back on their own link list; a saved region gets the starter road stub for a neighbour road
  built since (`transit.js lateEdgeRoads`, offered once — `r.stubs`), with a notice. Region names are unique per world.
  Tests: `tests/stats-1117.test.mjs`, `tests/stats-1117.spec.js`, walk lines (stats-*, world-map-neighbours).
- 2026-11-17 — owner round 4 (Helper B): **Parks tab** — 13 new parks and plazas (`pk-*` in data/catalog.json, cat `park`;
  City Kit `citykit/js/kit/parks.js`, 1×1 to 4×4, night lights) plus the Park & Plaza and Arena moved in. Each has a
  `cover.leisure` reach and a `boost` (city.js `boostOf` → land value), and homes in park reach raise appeal
  (`parksNearHomes` × `T.parkAppeal`); the Memorial adds reputation (`rep`). Holding one shows the Land value view and
  its reach. **R&D** — `sim/research-data.js` (the tree: 28 techs in City / Defence / Buildings / Policies, 3 tiers)
  + `sim/research.js` (rules: pay up front, one at a time, full refund on stop, `researchTick` on the day tick,
  `effect(r, key)` read by networks.js (pumps, plants), city.js (upkeep, mines, refineries, parks, appeal, shop demand)
  and arms.js (stat cards); policies cost credits a month while on, a budget line). **One system with merchants**:
  the Mk parts/blueprints keep their ids; every other merchant tech is a good in ships.js GOODS (`tech: true`, priced
  at `T.rdMerchantShare` of research credits); `catalog.techDone` (= research.has) is true either way; `goodOpen` is
  the one filter for merchant offers, supply-crate parts and called ships. `catalog.unlocked` reads techs (`unlocks`
  = needs the tech, `early` = opens before its milestone); `lockText` says why. UI: `ui/research.js` + `css/research.css`
  (tree in tier columns, one column on phones; cards with numbers, price chips red when short, merchant line, needs),
  comms offers say "Unlocks: X (R&D)". **Phone tool bar** (`css/menu.css`): icon tabs, scroll arrows + end fades only
  when there is more, Undo pinned, the map views fold into a View button. Keys: P parks, T R&D. Tests:
  `tests/research-parks.test.mjs`, walk lines parks-tray, park-chosen, research, research-card, research-running,
  phone-menu.
- 2026-11-17 — **zoning, bigger blocks, balance** (owner: "I painted 4x8 rci regions but residential only took 1x1
  squares on the edge and left the middle empty… multiple size buildings 1x1 and 1x2 and 2x2 for each rci… a 4x2 region
  fits two 2x2 houses"). `sim/plots.js`: every painted block (one zone, 4-neighbour, incl. its own buildings) is cut into
  plots — 2×2 first, swept from each of the 4 corners rows- or columns-first, the plan with the most 2×2, fewest 1×1,
  no standing building cut, most big plots on a road wins; leftovers pair into 2×1/1×2 strips along one edge. **Access
  rule:** a plot grows if it is within `zoneDepth` (8) tiles of a road that reaches the Core, walking through the same
  zone's block (so a 4×8 block fills from either side); buildings that don't touch a road with their front face the way
  out (`inwardFace`). Growth puts the whole plot up on better land, else a 2×1 or 1×1 piece at the front;
  `levelUp()` is now the next step of either kind — **combine** (the piece is smaller than its plot: once it and every
  piece in the plot have settled 60 days, power, land value and demand are met and the plot is flat, they become one
  building the plot's size at the best piece's level) or **level** (fills its plot: one level up, same footprint). The
  info panel title says which ("Combine into 2 × 2: Pod Court" / "Level 2 → 3: Midrise Bar"). Combines run before new
  growth each pass. catalog.json `zones`: 1×1, 2×1 and 2×2 at every level for R (4 levels), C (4) and I (3, new) —
  24 new City Kit recipes in `citykit/js/kit/zoned.js`; the old 3×2 Logistics Depot is `legacy` (old saves keep it,
  never grown). Names come from the table (`city.designName`). Tests: `tests/zoning-1117.test.mjs` (4×2 → two 2×2, 4×8
  fills with 8×2×2, odd widths edge-only, L-shapes, depth rule, combine + its needs, old saves), alignment updated for
  inward-facing lots. Shots: `node tools/zone-shots.mjs` → `test-results/arcline-zones/`.
- 2026-11-17 — **balance pass.** Why the bot stalled at 150–200 people: (1) only road-touching zoned tiles grew (the
  bot's 5×5 blocks never filled their middle — even with no creatures it sat at 204 people for 300 days); (2) the bot
  walled a 164-tile ring at founding (33k of the 35k start), then every credit went on rebuilding chewed walls, so it
  never bought guns, and it waited for 90% of its wanted ring guns before zoning anything — a lock; (3) nests doubled
  every few months (13 → 42 in a year) and the stream + swarms grew with them, so buildings were wrecked (~300 a year)
  faster than they regrew. Bot now: first ring half-size 14, zones whenever the city wants and there's money after the
  guns. Tuning (data/tuning.json): nestSpreadDays 18 → 30, migrateEveryDays 40 → 60, spawnPerDay 0.35 → 0.28,
  swarmSize 18 → 14, calmDays 6 → 20, colonyGrant 700 → 1100, grantFadePop 1500 → 2000. Bot, 8 seeds × 3 years, same
  bot both ways (median): **before** 443 / 441 / 533 people at years 1/2/3, worst 172, M3 never, ~181 buildings wrecked
  and 55 wall tiles broken a year, 20 turrets, ~2.6k credits; **after** 711 / 898 / 1,695, M2 at 14 min, M3 in 6 of 8
  games (median 67 min), M4 in 1 of 8, ~14 wrecked and 23 walls broken a year, 60 turrets, net 1.2k → 3.9k → 8.8k a
  month (money tight for the first months, comfortable by year 3); **Easy (60,000)**: 852 / 1,154 / 2,387, M3 in 8 of
  8 (56 min), M4 in 6 of 8, worst 1,872. One game day is 6 s, so a year is 36 real minutes. The fight rolls
  Math.random, so single runs swing a lot — compare medians (`tools/balance.mjs --seed N --set k=v,k=v --ring 14`).
