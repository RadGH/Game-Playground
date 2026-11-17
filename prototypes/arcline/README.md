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
