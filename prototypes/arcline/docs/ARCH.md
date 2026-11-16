# Arcline — how the code is laid out

Read `PLAN.md` §0 first (owner rulings). This file is the map of the code: what lives where and how parts talk, so
several helpers can build in parallel without stepping on each other. Plain ES modules, no build step.

## Layers

```
prototypes/arcline/
  index.html            title → world → region (one page; screens swap)
  css/arcline.css
  data/
    tuning.json         EVERY feel/balance number (shared/tune.js panel; tools/apply-tune.mjs) — milestones, costs, rates
    catalog.json        every placeable thing: id, name, recipe (citykit), size, cost, upkeep, power/water use,
                        housing/jobs, unlock milestone, category (zone growth table lives here too)
    changelog.json      What's new
  js/
    sim/                PURE: no DOM, no canvas. Runs in node tests. Same input → same output (seeded).
      world.js          generate a world: a grid of cells packed with mixed-size regions (SC4 region map),
                        biome per region, deposits, nest density, rivers crossing region edges
      terrain.js        a region's ground: height levels (0..5 per tile), water, rivers + bridges sites, deposits,
                        nests; levelling (light terraforming) with its cost
      region.js         the Region state object (tiles, lots, networks, people, money, stock) + save/load (JSON)
      zones.js          R/C/I painting, demand meters, lot growth by land value + services + density tier
      people.js         population, housing capacity, jobs, arrivals queue, births, education level
      economy.js        monthly budget: R/C/I taxes, upkeep, loans; materials stock (Metal, Stone, Crystal → Steel,
                        Concrete, Power cells)
      networks.js       roads (street/avenue/highway), power grid, water pipes: connectivity + coverage. Power: every
                        road, line, wall, building, turret and zoned tile hands power on to anything within POWER_REACH;
                        pylonPlan() spaces pylons along lines (≤ PYLON_SPAN apart) for the renderer
      services.js       education + leisure coverage, land value
      transit.js        mass transit lines + stations; interstate links at region edges
      ships.js          Comms Array range, passing ships (warships, merchants), offers, supply landings (pods →
                        Landing Pad priority), founding drop. People arrive by immigration (city.js appeal / immigrate).
      schedule.js       the Comms timetable: a merchant convoy + warship patrol on a fixed beat, and ships you call
                        for a fee (requestVisit); visits become ordinary passing ships
      industry.js       outposts on deposits (send home on their own when powered), refineries
      milestones.js     population milestones → unlocks; landmarks
      defence.js        walls, gates, turrets (power + upkeep) — wraps citykit/js/world/{field,horde,defence}.js
      nests.js          nests: spread over time, react to expansion/mining; constant pressure spawner
      away.js           a region not loaded: earn at last rates into ITS OWN stockpile (no growth, no attacks)
      clock.js          game time (days/months), speed, the day/night position
    render/
      sprites.js        citykit Baker + cache keyed by recipe/params/rot/dir/frame; bakes in idle time
      map.js            ground (height levels with cliff faces, water, roads, zones tint), culling, depth sort
      overlays.js       zone / power / water (underground view) / land value / coverage / path-to-city views
      world-view.js     the world map screen (regions, your cities, interstate links)
      fx.js, weather.js → citykit/js/world/fx.js, weather.js (shared)
    ui/
      hud.js            top bar (money, population + next milestone, date, speed), tool bar, info panel
      tools.js          road / zone / bulldoze / level / place building / wall / turret tools (drag + ghost + price)
      comms.js          the Comms panel (ships overhead + answers, timetable, call a ship) — C key, row-2 button, or
                        tapping a Comms Array
      panels.js         budget, comms (ships), city stats, milestones, build menu
      menu.js           ☰ menu: settings, What's new, Report a bug, credits, sign in, save/load, back to world
      input.js          one binding table (lessons rule 34), mouse/touch/keys, edge scroll, pinch
    audio/
      music.js          original procedural synthwave (WebAudio): calm / night / tension moods crossfade; pickMood()
                        picks from night, alerts and creature count; ducks under big blasts. Mixer: citykit/js/world/mix.js
                        (zoom → effects gain, off-screen cut, ambient bed of city/wilds/weather; main.js audioFrame feeds it)
    main.js             boot, screens, the frame loop (fixed sim step + smooth drawing between steps)
  tests/                node --test for every sim module; Playwright specs; walk.mjs (strict: true)
```

## Rules for every module

- `sim/` never imports from `render/` or `ui/`. Render and UI read sim state; they change it only through sim
  functions (`zones.paint(region, rect, 'R')`, `economy.setTax(region, 'C', 0.09)`…).
- Every number from `data/tuning.json` through `sim/tuning.js` (`T.key`), read at use time (tuning panel moves it live).
- Every displayed number through `shared/format.js`; every id shown through `catalog.json` names (lessons 1–2).
- No browser popups or `title=` tooltips; styled dialogs (`shared/dialog.js`) and `shared/tooltip.js`.
- Effects follow `docs/research-boom-feel.md`. Big effects run in real time, not game speed.
- Determinism: `sim/` uses the region's seeded RNG (`citykit/js/kit/rng.js`), never `Math.random`.

## Region state (sim/region.js) — the shape every module shares

```js
{
  id, name, size: 64|128|256, seed, biome,
  t: { day, speed },                       // clock
  tiles: {                                 // typed arrays, length size*size, index z*size+x
    height, water, zone, road, power, pipe, lot, wall, deposit, nest, value, cover
  },
  lots: [{ id, x, z, w, d, recipe, params, kind: 'zoned'|'placed', zone, tier, people, jobs, built }],
  turrets: [{ kind, x, z, hp }], walls: hp per tile in tiles.wall,
  money, loans: [], taxes: { R, C, I }, stock: { metal, stone, crystal, steel, concrete, cells },
  people: { total, educated, arriving: [], born }, milestone, unlocked: Set,
  ships: { array, passing: [], strikes, log: [] },
  rates: { money, metal, ... }             // last month's per-day rates, used by away.js
}
```

## Frame loop (main.js)

Fixed sim step 1/30 s × game speed with an accumulator; creatures and shots drawn between the last two steps
(lessons H3 — Voidwright #35); effects, weather and the orbital strike in real time. The month tick runs inside the
sim step (economy, growth, arrivals, ships), spread across steps so no frame hitches.
