# Plan — the world layer: remote sites, roads and convoys

Status: **planned, not built.** Target: the update after round 20.
Owner: Radley Sustaire. Written 2026-09-14.

Read this with `DESIGN.md` (the engine as it stands) and `README.md`. Everything below is additive:
the base you build on today does not change.

Reference points, for Claude only, never for player-facing text: the road-building mods for RimWorld
(build a road across the world map, it speeds up later travel), and Project 5: Sightseer (drive a
vehicle across a large world to set up and defend supply runs). The ideas we are taking are *build
your own route* and *the route itself is the interesting object*. All names, fiction and mechanics
in the game must be our own.

---

## 1. Why this exists

The local map is now a 5×5 block of worldgen cells, 480×480 tiles, generated as the camera
approaches. That is 25 world cells out of 256×128 on the planet, and it has a hard outer edge.

Growing that grid is the wrong fix. It is one flat typed array and the pathfinding cost field sweeps
all of it, so every extra ring costs memory and tick time for ground the player barely visits.

The right fix is a second scale. Far-away places become *abstract* production sites joined to your
base by convoys, and the interesting question stops being "how many tiles can I load" and becomes
"is that deposit worth the drive, and should I build a road to it".

This also makes the win condition load-bearing. See §9.

## 2. Three scales

| Scale | What it is | Simulated how |
|---|---|---|
| Base tiles | The 5×5 chunk window you build on. Unchanged. | Every tile, every tick. |
| **The world layer (new)** | The planet's world cells: your base, outposts, deposits, roads, convoys. | Per world cell, on a slow tick. |
| Orbit and system | The existing orbit screen, satellites, rockets. | Unchanged. |

The world layer sits between the two and is where this update lives.

## 3. Remote sites

A remote site is **not** a loaded tile grid. It is a record:

```
{ id, cell: {x, y}, deposit, buildings: [...], throughput, stockpile,
  power, defence, crew, discovered, status }
```

It produces into its own stockpile at a rate derived from its buildings and deposit richness. A
convoy empties that stockpile. No tiles, no pathfinding, no per-structure tick — one cheap update
per site per slow tick.

**Founding one.** Send a founding convoy: builder vehicles plus the materials. On arrival the site
appears in an outline state and finishes over time, exactly like a building outline does locally,
so the mental model carries over.

**Specialisation** is the first real decision. A site can extract raw (cheap, many trips) or refine
on site (needs power and defence out there, but ships a quarter of the tonnage for the same value).
Shipping 100 ore or 25 ingots is a genuinely different logistics problem.

**The escape hatch.** A player who loves one outpost can *promote* it: the game loads that world
cell as real tiles and it becomes a second buildable base. Expensive, capped at one or two, and
optional. This keeps the abstraction from feeling like a wall.

## 4. Convoys and routes

A route is origin, destination, assigned vehicles, and a cargo manifest.

Pathing already exists. `worldgen/js/roads.js` gives `roadCostField(world)` (biome move cost, slope,
river crossings, mountain passes at 0.3×) and `aStar`, plus `seaCostField` for water. Per vehicle
class:

- **Ground** paths over the land cost field, scaled by the vehicle's `offroad` exponent.
- **Air** goes in a straight line and ignores terrain, water and roads entirely.
- **Water/amphibious** uses the sea field, which opens coastal routes as a distinct option.

Round trip time is path cost divided by effective speed, plus load and unload. Throughput is
capacity times trips per hour. Every number this needs is already in `data/vehicles.json`:
`baseSpeed`, `offroad`, `capacity`, `loadTime`, `unloadTime`, `fuelUse`, `hp`, `armor`, and the
per-planet upgrades (the Rime Rover treating ice as road, the Arc Rover needing no fuel).

**Fuel and range** make the map matter. A long route needs a fuel stop, which is the reason to build
a forward depot, which is the reason the road network grows outward rather than in one straight line.

## 5. Roads: find them, improve them, build them

This is the heart of the update.

**Found ways.** The planet is uninhabited, so there are no human roads to inherit. Instead the
generator already knows about ground that is naturally fast: mountain passes (`world.passCells`,
already 0.3× cost), dry riverbeds, ridgelines, and — good for the fiction — derelict roadbeds left
by whoever was here before, which also gives ruins a reason to exist and something to scan for.
Finding a pass that halves a drive should feel like a discovery, because it is one.

**Tiers.** Local paving already has tiers and `ROAD_SPEED` lives in `js/rules.js` so
`data/balance.json` can tune it. Extend the same ladder to the world layer:

| Tier | Rough feel | Needs |
|---|---|---|
| Graded track | Cheap, modest gain | Labour only |
| Gravel | The workhorse | Stone |
| Paved | Heavy haulers stop crawling | Concrete |
| Rail or hover lane | Late game, large gain | Steel, flat grades |

Rail wanting flat grades is deliberate: it forces cuttings, embankments and bridges, so terrain keeps
mattering into the late game instead of being solved.

**Building one.** Propose a path with A* between two points, let the player drag waypoints to
override it, then it becomes an outline like any build. Road crews and builder buggies work along it
and consume materials per cell. **Partial roads must give partial benefit** — the finished cells are
fast immediately. Without that the whole system feels like a wall of cost before any payoff.

**Bridges** at river crossings cost extra and are separate objects, because they can be lost.

**Maintenance.** Storms, quakes and creatures degrade road cells. A degraded cell slows every convoy
through it, so repair crews become a standing job. This is what keeps the network alive as a thing
you tend rather than a thing you finish.

## 6. Routes that re-evaluate

Radley's ask, and it falls out of §5 almost for free.

Each route caches its path plus a **stamp** of the world cost field version. Bump the version
whenever any cell's cost changes: a road tier completes, a cell degrades, a bridge falls, a hazard
or nest appears, an outpost moves. On a slow tick a route compares stamps and repaths only if stale.
Cheap, and it never scans anything on a quiet tick.

The payoff is feedback. The notification feed should say it plainly:

> Route 3 found a faster way. 14 min → 9 min, now the gravel road is through the pass.

That single line is what makes road spending legible. Show the same before/after in the route panel.

## 7. Danger on the road

Convoys cross open ground, so nests near a route produce ambushes. The answers are escorts, armour,
clearing the nest, or routing around at a cost in time. Losing a convoy loses the cargo *and* the
vehicle, which is a real enough stake to make escorts worth paying for.

This also gives the combat code a job outside base defence, and it gives the "presence" idea in §8
something to push against.

## 8. Ideas worth considering

Ranked by how much they give back for the work.

1. **Throughput as the headline number.** Every route shows units per minute *and* a bottleneck
   badge: limited by road quality, by capacity, by load time, by fuel stops. It teaches the whole
   system without a tutorial.
2. **Forward depots and relays.** A depot halfway turns one long trip into two short ones with two
   vehicles. More throughput for more infrastructure is the cleanest decision in the whole design.
3. **A remote launch site.** The launch pad needs flat open ground clear of your base, so the rocket
   *requires* a supply line. This makes the world layer load-bearing instead of optional content.
4. **Presence.** Roads, outposts and patrols extend a radius that suppresses nest spawning. Road
   building becomes strategic rather than purely logistical.
5. **A logistics meter.** Reuse the `meters/` experiment: delivered per hour per route, vehicle idle
   time, fuel burned, cargo lost to ambush, which leg is the bottleneck. Cheap to build, very
   satisfying to read.
6. **Weather and season on routes.** Storms ground air convoys, floods take out fords, a hard freeze
   turns a bog into the fastest road you own. Hazards already exist; this points them at logistics.
7. **World-scale scanning loop.** Satellites reveal world cells, skimmers reveal detail within them.
   Gives satellites a clear job well before the rocket.
8. **Convoy autonomy ladder.** One-off haul → scheduled route → standing order with priorities. The
   pleasure of the genre is watching manual work become automatic; make that progression explicit.
9. **Named places.** Run discovered passes, deposits and ruins through the `namegen/` experiment.
   Nearly free, and a route to "the Ashen Gate" reads better than a route to cell 74,31.
10. **Convoy camera.** A "ride along" view following a convoy across the world. Pure spectacle, but
    it is the moment that sells the scale, and the 3D vehicle models already exist in `avatar-3d`.

## 9. What this changes elsewhere

- **The bot (`js/ai.js`) must understand the world layer**, or the balance sim stops being
  meaningful the moment remote sites carry real production. Budget real time for this; it is not a
  trailing chore. It should also inherit the material reservation work landing now.
- **Balance** gains a `world` block in `data/balance.json`: road costs and speed multipliers per
  tier, degradation rates, convoy fuel burn, ambush chance per cell of exposure, outpost yields.
- **Saves** stay small precisely because outposts are abstract. Keep it that way; do not drift into
  storing tiles for them.
- **Test time** is already a problem at roughly nineteen minutes. The world layer must be tested at
  its own scale, separately from the tile sim, and the slow tick must stay slow.

## 10. Build order

1. World layer data model and slow tick: cells, sites, stockpiles. No UI.
2. Route pathing over the existing cost fields, per vehicle class, with round trip and throughput
   maths. Node tests on the numbers.
3. World map screen: your cells, known deposits, sites, routes drawn as paths.
4. Founding convoys and the outpost outline → built flow.
5. Road tiers, the build-a-road flow, partial benefit, bridges.
6. Re-evaluation stamps and the "found a faster way" notification.
7. Ambushes and escorts.
8. Bot support, then a balance pass with the three worlds by three difficulties matrix.
9. The ideas from §8, in the ranked order, as far as the appetite goes.

Stop after any step and the game is still coherent. That is the point of the order.

## 11. Risks

- **Do not grow the tile grid.** It is the thing this design exists to avoid.
- **Two scales can confuse.** The world screen and the base screen need obviously different visual
  languages, and one consistent way to jump between them.
- **Abstract sites can feel lifeless.** The promote-to-real escape hatch in §3 and the convoy camera
  in §8 are the antidotes; keep at least one of them.
- **The bot lagging behind the features** is how the balance numbers quietly stop meaning anything.
