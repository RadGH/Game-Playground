# Farhold — build mode, terrain tools, the player's waypoint and the town portal

What was built for `BUILDING_EXPANSION.md` **§4** (build mode, terrain transformation, decorative /
manufacturing / defensive structures), **§5.5–5.20** (a waypoint the player raises) and **§6** (the
town portal). The design document is the brief; this is what the code does and where the seams are.

| File | What it is | Three.js? |
|---|---|---|
| `js/terraform.js` | The terrain delta book — level, raise, lower, strip, slab | no |
| `js/buildplan.js` | The build ledger — catalogue, snapping, validity, claims, costs, blueprints | no |
| `js/portal.js` | The one portal: open, use, check, save | no |
| `js/build.js` | Build mode — ghost, brush ring, meshes for 98 structures, the portal ring | yes |
| `js/build-ui.js` | The panel `B` puts up — first steps, tools, catalogue, live prices, why the ghost is red | no |
| `js/homes.js` | Every base you ever raised, and the route home from another star system | no |
| `js/mining.js` | Drills on seams, and the route whose length decides the transfer rate | no |
| `js/ore-view.js` | The seams, drawn — one InstancedMesh per kind | yes |
| `js/defence.js` | The raid you ring for, and the turrets that answer it | no |
| `data/structures.json` | 98 structures, 25 materials, the placement rules, and seven guns | — |
| `tests/building.test.js` | 31 node tests over all of the above | — |

Two small edits to files that already existed: `js/terrain.js` gained `editedAt()`, and
`js/waypoints.js` learned about pads the player built.

---

## 0. How build mode actually works, from the player's side

This section is the answer to *"How does build mode work? How do I start building a base?"* — the
question that turned up four joins that had never been made. Every module below was finished and
tested; none of them were reachable.

**`B` opens build mode.** A panel comes up on the right with four numbered steps at the top (they
disappear once you own anything), a row of tools, the catalogue by group, and — beneath whatever is
selected — its price against what you are actually holding, plus the live reason the ghost is red.

| Input | What it does |
|---|---|
| `B` | Build mode on and off. `Esc` also leaves. |
| move the mouse | The ghost follows **where you are looking**, not where you stand |
| left click | Use the current tool: place, level, raise, lower, clear, take down |
| scroll | Turn the ghost · sizes the brush when a terrain tool is up |
| `[` `]` | Brush size, for when the wheel is doing something else |
| `Enter` | Finish a run of road or wall |
| `Ctrl+Z` | Undo the last thing |

**Starting a base**, in the order the panel lists it:

1. **Level** a circle of ground. Nothing in the catalogue will sit on raw Farhold.
2. A **Furnace** and a **Storage Crate**. You can build anywhere — round 14 removed the permit; see
   §14.1. (An **Outpost Marker** is optional and only puts a name on the place.)
3. A **Burner Generator** beside the crate, with coal in it.
4. A **Waypoint Pad** when you can afford one. Now you can come home from anywhere.

### The four joins that were missing

Build mode was complete and inert. Worth recording, because every one of them is the same shape as
the bugs in `RPG.md`: a finished module that nothing ever called.

* **Nothing called `build.confirm()`.** Every key worked; clicking drew a sword. There was no mouse
  wiring in build mode at all.
* **The ghost was aimed at `control.x, control.z`** — the player's own feet — so building meant
  standing on the exact spot and then walking off it.
* **Nothing called `grid.add` or `stores.add`.** A generator you built generated nothing, a crate
  held nothing, and a waypoint pad (which draws 25 kW) could never light. The catalogue ids in
  `data/structures.json` match `data/power.json` exactly; the join is four lines.
* **`stores` and `grid` were not in the save.** `build` saved *where* the crate was; only
  `js/stores.js` knew what was in it. A reloaded base was empty boxes beside a dead generator.

Plus one in the build-mode cost callback itself: it called `stores.count(id, x, z)` when the
signature is `count(pool, res)`, so a crate at your feet paid for nothing and the whole storage-pool
layer was decorative.

---

## 1. Terrain first, because nothing else works without it

§4.11 is blunt: *"the single most-needed tool — you cannot build on Farhold's terrain otherwise."*
Farhold's ground is noise all the way down; there is no naturally flat metre on the planet, and
every placement rule below would refuse everything forever without a way to level a patch.

### How an edit is stored: a brush, not a heightfield

This is the one design decision in the whole section worth arguing about, so here is the argument.

A grid of changed heights over a 163 km world at the innermost clipmap step (2 m) is eight billion
cells. Even a sparse patch of it is tens of kilobytes per building site, in a save that is currently
a couple of kilobytes in total. So an edit is stored as the **shape you painted and the level you
painted it to** — a *brush* — and the ground is a function of the generator plus the brushes:

```js
apply(x, z, natural) → natural, with every brush near this point laid over it in paint order
```

* **Tiny.** Forty edits cost under 6 kB of JSON; a whole base is a few hundred bytes.
* **Resolution-free.** The clipmap samples at 2 m under your boots and 162 m on the horizon, and
  stretches both by up to nine in flight. A brush answers any query; a stored grid would have to be
  resampled for each.
* **Replays exactly.** The target height is baked in at the moment you paint — we store the number,
  not "whatever the ground was here" — so a reload cannot drift even if the generator is retuned.
* **Undoable**, because removing a brush is just removing it.

This is deliberately the same trick `js/territory.js` uses for zones: store the deltas, never the
world. A zone nobody touched writes nothing; ground nobody dug writes nothing.

The cost is that a height query walks the brushes near the point, so there is a 32 m bucket index
(untouched ground costs one map lookup and returns) and a per-claim area budget — §4.20's *"a limit
on how much you may reshape"*, 60,000 m² by default, which is a generous base and nowhere near a
landscape.

### The five brushes

| Call | §  | Shape | What it does |
|---|---|---|---|
| `level({x,z,r,h,feather})` | 4.11 | circle | The smoothing tool. Flat inside `r`, eased to nothing by `feather`. |
| `raise` / `lower` | 4.12 | circle | Capped at `maxLift` so nobody digs to the core. |
| `strip({x1,z1,x2,z2,half,h1,h2})` | 4.14, 4.16 | capsule | A graded run — the road tool, and the footing a wall follows. |
| `slab({x,z,w,d,rot,h})` | 4.17 | rectangle | Flatten and floor in one action, rotated to match the building. |

### Getting the edits in front of the world

`terraform.wrap(terrain)` replaces `heightAt`, `slopeAt` and `normalAt` on the object `js/planet.js`
returns. Every caller in the game reaches the ground through those properties — collision, the
camera, prop placement, the clipmap — so one move covers all of them. `slopeAt` and `normalAt` are
recomputed *from the wrapped height* on purpose: a levelled pad that still reads as a cliff would be
refused by its own placement rules and would slide the player off it.

`js/terrain.js` `editedAt(x, z, r, px, pz)` redraws only the clipmap rings whose covered square
touches the edit. A ring only rebuilds when it *moves*, and flattening the ground you are standing
on moves nothing — without this you smooth a hillside and the hillside is still drawn there until
you walk a cell away. Forcing every ring instead would resample ~92,000 vertices on every click.

---

## 2. Build mode

`js/buildplan.js` decides; `js/build.js` draws. The split is the same one `js/waypoints.js` made
(the book, not the geometry) and it is what lets `node --test` check the rules that matter.

* **Ghost with green/red validity and the reason in words** (§4.1, §4.4). The ghost's colour comes
  from the same `check()` the placement uses, so there is no second copy of the rules to drift. The
  refusal is a sentence — *"the ground is too steep here — level it first"* — because a red box
  teaches nothing and that sentence teaches the terrain tool in one go.
* **Snap to a piece first, grid second** (§4.2, §4.3). Walls join walls and floors tile because the
  snap offers the neighbour's end face before it offers the grid. Hold a key for free placement.
* **Structural sense, not simulation** (§4.6). A piece's four corners must sit within
  `footingTolerance` (0.35 m) of the height under its middle. That is the entire model. Anything
  with `flatten` in the catalogue paints its own slab as it lands, so a foundation *cannot* float —
  it is true by construction rather than by hoping the player levelled enough.
* **Never intersects** (§4.6). Exact separating-axis test on rotated rectangles. Two boxes that
  *touch* are not overlapping, which is what makes a run of wall buildable at all.
* **Deconstruct refunds 75%** (§4.7); **undo is a full refund** (§4.9). Building should not punish
  experimenting.
* **Runs** (§4.14, §4.16): click a corner at a time, then `finishRun()`. Each leg gets its strip
  brush *before* the pieces are measured — doing it the other way leaves the footings in the air,
  which is the same shape of bug `js/planet.js` wrote its long note about with bridges.
* **Blueprints** (§4.8): a cluster stored relative to its own centre, so stamping it turned puts the
  whole camp down turned. Plain data — it can live in a save or be a raid reward.
* **Claims** (§4.10): the first thing you build stakes one, so nobody has to learn about claims
  before they can learn about building. A claim stone starts another.

### The catalogue — `data/structures.json`

98 structures over nine categories: 37 decorative and lighting (§4c), 35 workshop, refining, power
and storage (§4d), 19 defensive (§4e), 5 groundwork pieces, the claim stone and the waypoint pad.

Each entry is a footprint in metres, a material cost, a `look` recipe and the rules that gate it.
`js/build.js` turns `look.kind` into boxes and cylinders through a table of 59 recipes — the same
*"a building is a kit, not a model"* idea `TOWN_EXPANSION.md` §1 argues for, which is what keeps 98
pieces from being 98 modelling jobs. Every part sizes itself from the declared footprint, so the
geometry is guaranteed to fit inside the box the overlap test checked.

**Street lights genuinely light.** Anything with a `light` block hands it straight to `js/light.js`'s
source pool — the same pool the carried torch uses, the same falloff, the same flicker. Fourteen of
them: lamp post, wall sconce, hanging lantern, brazier and crystal lamp (§4c's five street lights),
plus the campfire, cooking pot, cooking station, furnace, burner generator, watchtower, arc coil,
shield pylon and the waypoint pad's own sigils. A light that draws power goes dark when the grid
does.

**Materials are a contract, not an inventory.** The ids in `cost` (timber, block, steel, lens…) are
declared in the file's own `materials` block. `js/buildplan.js` never reads a bag — it asks a
`have(id)` callback — so whichever store system §1/§2 ends up with, the catalogue does not change.

---

## 3. The waypoint you build — §5.5–5.20

Deliberately the **same pad**: same concrete, same sigil ring, same network. Not a second system —
a row in the same book, with three differences:

* lit the moment it is finished, because you were obviously there (§5.8);
* it needs power, and a dark pad cannot be travelled to (§5.10) — the one real reason to keep a
  base's grid up, and the refusal says *"the sigils are dark, its grid is down"* rather than
  pretending you have not been there;
* one per **claim**, not one per player (§5.9), so a second base gets a second.

`js/waypoints.js` gained `addBuilt` / `removeBuilt` / `setPowered` / `builtList` / `journal`, and
its save now carries the built pads (§5.16) — they are the only part of the network that is not a
function of the world seed. A built pad reads exactly like a town pad to the map, the journal and
the travel screen; only `canTravel` knows the difference.

---

## 4. The town portal — §6

> Travelling to a waypoint opens a portal **at** that waypoint leading back to **exactly** where you
> were standing, and opening a new one closes any existing one.

**The whole state of the feature is one variable.** Not an array with a length check, not a map
keyed by id — one slot. "Exactly one exists" is then true because there is nowhere for a second one
to be, rather than true because some code remembered to close the old one.

That is the entire reason the design is worth having: one portal needs no list, no naming, no
management screen and no map legend. It is open or it is not, and the journal line says where it
goes.

* **No expiry** (§6.9, recommended and kept). A clock makes players rush, which is the opposite of
  what a convenience feature is for. It stays until a new one replaces it or its anchor stops being
  a real place.
* **Two-way, and it does not close on use** (§6.6, §6.7). Walking home for an anvil and walking back
  is most of what it is worth.
* **Closes with a sentence when the anchor dies** (§6.10): you left the planet, or the dungeon you
  anchored inside was left. Silence there means walking into a ring and arriving in the sea.
* **Blocked out of a boss room** (§6.12), or bosses become optional.
* **Never opens inside geometry** (§6.18): a spiral nudge, and if nothing works it takes the
  original spot anyway — a portal a couple of metres off is a shrug, a portal that refuses to exist
  strands you.
* **The scroll** (§6.17) opens one *where you stand* back to your last waypoint. Same code path on
  purpose: two nearly-identical portal systems is exactly how you end up with two portals.
* **Survives a save** (§6.11), **both ends on the map** (§6.8), **a journal line** (§6.19).

The ring is a torus on edge with a thin disc inside it, rising out of the sigils (§6.4) and turning
slowly — two draw calls, because it is on screen every time the feature is used.
`avatar-3d/js/spellfx.js` may be passed in for the flourish on opening (§6.14), but the ring exists
without it: a missing sprite sheet must not mean a portal you cannot see.

---

## 5. Tests — `tests/building.test.js`

31 tests, no browser. The ones the design document asked for by name:

* terrain deltas survive a round-trip — 400 sample points across every brush, feather and gap;
* a structure never floats (every corner within tolerance of the ground) and never intersects;
* **exactly one portal exists** — opened 21 times in a loop, checked every time;
* a portal survives a save;
* a player waypoint joins the network, and a dark one is refused.

Plus: the brush maths, the reshape budget, catalogue completeness (every cost names a declared
material, every structure has a description), the "you are short of 6 rough stone" wording, the
refund split, the claim rules, wall runs, blueprints, the light list, and one end-to-end chain that
levels ground, stakes a claim, seats a waypoint core, powers it, travels, and walks back through the
portal.

---

## 12. Getting home, from anywhere — `js/homes.js`

> *"It should be easy to teleport back to your bases even if you go to a different star system."*

`js/waypoints.js` is **per world**, and rightly so: it is built from the settlements of the planet
you are standing on and thrown away the moment you land somewhere else. That is correct for a town —
a town on another planet is not somewhere you can walk to — and completely wrong for a base, which
is the one thing in the game the player made with their own hands.

So the register of bases lives **above** the world, beside the character, and is saved with them:

```js
const homes = createHomes(save?.homes);
homes.add({ id, name, x, z, starId, systemSeed, starName, planetId, planetName, claim });
homes.forWorld({ systemSeed, planetId })   // → pads for createWaypoints({ built })
homes.routeTo(id, here)                    // → { step: 'here' | 'land' | 'jump', legs, why }
```

**A world is two numbers, not one.** Every world uses the same metre grid and the same map size, so
`planetId` 2 exists in every system. Matching on it alone would fold the player to the right
coordinates on the wrong planet — which is not a rare accident but the expected case the moment
somebody builds a second base.

**Three legs, and `routeTo` names which.** `here` is the ordinary waypoint network. `land` flies
down to another world in this system. `jump` rebuilds the system from the base's own `systemSeed` —
exactly what `arriveAt` does coming out of warp, because a star *is* its seed — then lands, then
puts you on the sigil. The clock cost is the ordinary waypoint cost times the number of legs, so
crossing the galaxy is most of a day and walking home is half of one. A town portal opens behind
you in all three cases.

The only refusal is mid-jump. Being in space is deliberately allowed: making the player land on some
unrelated world first so they can stand on a sigil is the opposite of easy.

### On the map

The map's side panel grew a **Your bases** list — every base, wherever it is, with one button each
(`Travel` or `Fold home`) and the reason greyed out if the grid is down. Waypoint pads on *this*
world are drawn as sigil discs as before, but clicking one now **selects** it and the panel's button
is what travels. It used to travel on the click itself, so a misplaced click on a world map cost you
a day on the road with no way to say no.

`Go here` — teleport to any cell you can see — is now **Settings → Debug → Map "Go here" teleport**,
on by default at the user's request. The waypoint button never answers to that switch: travelling
between lit sigils is a game rule, not a cheat.

> **A settlement id is a number, and the first settlement on a world is `0`.** Every `id || null` and
> every `if (padPick)` in `js/map.js` silently dropped the pad nearest the middle of the map. All the
> checks there are against `null` on purpose.

---

## 13. Ore, drills, and the route that decides the rate — `js/mining.js`

> *"set up resources to be mined at a location, route between them determines transfer rate."*

`js/resources.js` knew what was in the ground and `js/stores.js` knew what a cart costs over a
distance. Neither was reachable, and the node field was being built with a call that took none of
its arguments:

```js
createNodeField({ data: resourceData, seed, terrain })   // takes none of `seed`, `terrain`
```

`createNodeField` scatters seams inside one circle — `area` defaults to a 300 m radius at the
**origin**. So every ore seam in the game was about twenty-nine kilometres from where the player
lands, and nobody could ever have found one.

**`createNodeWorld`** generates a 512 m tile at a time, seeded by the world seed folded with the
tile's own coordinates, so a seam stays where you left it without a single one being saved. What
*is* saved is what you took out of it.

### Three ways ore moves, and they are the same sum on purpose

| | Rate | Cost of getting it home |
|---|---|---|
| You, with a pick (`E`) | `faceRate` × your tool | the walk, paid by carrying it |
| A drill on the seam | `drillRate`, needs power | none, *if* it is in a storage pool |
| A **route** | `haulThroughput(metres)` | double the distance, roughly half the delivery |

They agree because the trade-off the user asked for — *"resources dense but far away, or less dense
and closer"* — only works if both sides are comparable in one number. That number is ore delivered
per second, and `haulReport` is where it is computed.

**Digging and hauling are separate.** A drill fills its own stock; the route drains it at whatever
the distance allows. That is what makes a long route *visible* — the stock sits there climbing —
instead of silently scaling the drill down. The panel says which in one word: `power`, `seam`,
`no route`, `hauling`, `digging`.

### In play

* Seams are drawn by `js/ore-view.js` — one InstancedMesh per kind, a faint emissive tint so a seam
  never reads as one of the thousands of scenery boulders `js/props.js` scatters. A worked-out seam
  shrinks rather than vanishing.
* `E` on one takes a swing. The prompt says what is in it *and* how rich it is, because that is the
  decision you are making.
* Build a **drill** on a seam and it binds to it. It needs power, so it needs a generator in reach,
  which needs fuel, which needs a store in reach of the generator. The layout is the puzzle.
* The **Route** tool: click a drill, then click a store. Both ends are objects standing in the
  world, so they are picked in the world — picking them off a list would mean naming forty crates.

> One more found here: the world prompt's final fallback was `near.who.name`, correct for every
> branch above it and wrong the moment a new kind of thing was added. Standing on an ore seam threw
> a TypeError sixty times a second.

---

## 14. The benches — and the fifth join that was never made

`js/refine.js` holds sixteen machines and sixty-one recipes with a real unlock system (you learn a
recipe by *doing* the one before it). Every machine id in `data/refining.json` has a structure with
**exactly the same id** in `data/structures.json`. Nothing called `works.place`.

So you could build the entire refining chain — furnace, smelter, alloy forge, assembler — and it
would stand on the grass as geometry while the module that runs it had an empty machine list.
`works.toJSON` and `works.load` were never called either, so even if it had worked, a reload would
have emptied every queue.

Both are one line each, in `joinSystems` and beside the other save fields.

**The panel shows the bench you are standing next to, and only that one.** A base ends up with
sixteen; listing them all turns the panel into a spreadsheet, and walking up to the one you want is
already how every other interaction in Farhold works.

A locked recipe is **shown**, greyed, with what unlocks it. A recipe you cannot see is a recipe you
will never go looking for.

### The whole chain, end to end

`E` on a seam → ore in the pool at your feet → a drill on the seam → a generator in reach of the
drill → a fuel crate in reach of the generator → a **route** to a crate sixty metres away → a
furnace beside that crate → iron ingots → the Waypoint Pad's cost → a base you can fold home to from
another star system.

Every link in that sentence is covered by `tests/mining.spec.js` and `tests/base-roundtrip.spec.js`,
played through the keyboard and the mouse.

---

## 15. §9 — the sky, and the sixth and seventh joins

The launch gate has been refusing correctly since it was wired: *"You have no ship. Build one: hull,
drive, tanks, avionics, then put them together on a pad."* What had never been checked is that the
refusal could be **satisfied**. A gate with no key behind it is worse than no gate.

Two things were missing, and both are the same shape as everything else in this document.

**Nothing ever put fuel in the tanks.** `canLaunch` refuses a flight the tanks cannot pay for and
`spendFlightFuel` takes it out again; `y.fuel` only ever moved when the save migration back-filled a
character who *already had* a ship. So a player who built one from nothing would have had a finished
ship, a finished pad, and a permanent refusal telling them the tanks were empty. `refuel()` takes
`lift_fuel` out of the pool at your feet or the bag on your back, and `data/shipyard.json` grew a
`fuel.capacity` rather than a magic number appearing in code.

**`bagOf` only recognises a purse by its `canAfford`.** Anything without that method is treated as a
plain `{ id: count }` map and read with `held[id]` — so the purse the shipyard was handed (which had
`count` and `spend` but no `canAfford`) came back completely empty, and every subsystem answered
*"the assembler has not built a Hull Section yet"* while ninety of them sat in the crate at the
player's feet.

### The shipyard screen

There wasn't one. It is a section of the build panel now, up when you are standing at an **assembler**
(where three of the four subsystems are fitted) or once you have started, so a half-built ship can
always be found again.

Every row is a button with its refusal **written beside it** rather than a disabled button with a
tooltip. `js/shipyard.js`'s `why` strings are deliberately specific — "the assembler has not built a
Drive Assembly yet", "the pad wants 12 metres of level ground, use the smoothing tool" — and hiding
them behind a greyed-out button throws all of that away.

`tests/shipyard.spec.js` presses every one of those buttons in order and then presses `J`.

---

## 16. §7 — the raid you ring for, and the turrets that answer

`js/raid.js` was written pure and complete: notoriety, two gates, waves, night scaling, loss rules,
rewards. Nothing imported it. `js/defence.js` is the join.

**Nothing here ever fires on its own**, which is the user's own condition on the feature:

> *"[the tower defence] might be better as a quest rather than a random event, so the player can
> decide when to start on it rather than being a burden."*

Three separate acts, and between them the world is quiet:

1. **The offer.** `E` at an **Alarm Bell** asks whether anything out there has noticed you. It
   answers with the tier, or with *which of the two gates is short* — "there is not enough here yet
   for anybody to bother with" reads very differently from "nothing would come at a place with no
   defences, and nothing should, until you have some."
2. **Taking it on.** A second `E`. Still nothing happens.
3. **The bell.** A third. Night is harder and pays better, and that is a choice you made at an hour
   you picked, not a punishment for having built a fourth wall.

### The turrets

`data/structures.json` listed nineteen defensive structures and **not one of them had any numbers**
— no range, no damage, no rate — so "defensive structure" meant a shape with a cost. Seven of them
have a `defence` block now (range, damage, seconds between shots, splash, element), tuned beside the
costs they are paid for.

`js/defence.js` gates on **the block, not the category**: a wall, a gate, a trap and a barricade
share `cat: "defence"` and must never snipe across the valley. An unpowered turret is a post.

The shot is drawn through the same `spellfx.projectile` the player's own spells use — a turret whose
target loses health across the clearing with nothing in between reads as broken.

> Same bug as the ore, in a different file: `ring()` called `spawnWave()` with no position, and its
> `x = 0, z = 0` defaults put every raider at the world origin — twenty-nine kilometres from the base
> they had come to attack. The raid asks the buildings where they are now.

---

## 17. §6.3 — the motorcycle, the car and the truck

> *"I definitely want the ability to craft a motorcycle and a car and eventually a truck."*

Both halves existed. `js/vehicles.js` held what they cost, how fast each is on road and off it, what
slope stops it, what it drinks and how it wears. `avatar-3d/js/ground-vehicles.js` held all three
bodies, built from primitives, with wheels that turn and a motorcycle that leans into a corner.
Neither file was imported by the game.

**`G` gets on and off.** `H` stays the horse, because they are genuinely different things: the horse
climbs and swims badly, the motorcycle does neither and does not care about the hill until suddenly
it does. Shift is the throttle.

A ground vehicle **replaces** the walking speed rather than multiplying it. `speedOn()` already knows
the surface, the slope and how worn the thing is, so applying the walker's hill penalty on top would
charge the slope twice.

`drive()` runs every frame with the metres actually covered: it burns the fuel, puts the wear on, and
when the tank runs dry it says so once and puts you on your feet. A vehicle comes out of the shed
with an **empty tank** on purpose — the first thing a new owner does is go and find charcoal.

The **Garage** is a section of the build panel shown at a bench that could do the work, not a row in
the catalogue: everything in that list has a footprint and a ghost, and a motorcycle has neither.

> Two of my own, both worth recording. The `G` handler first landed inside the *flight* block (there
> are two `KeyL` handlers, one for the carried lamp and one for the landing lights), so it was
> unreachable on foot; moved, it then sat above `const frozen = …` and took the whole page down with
> a TDZ error on the first frame.

---

## 18. §6.5 / §6.8 / §6.9 — the people, the fields and the tax

`js/colony.js` (citizens with jobs, moods, beds, hunger rungs, migration offers, recruiting from
towns, tax) and `js/farm.js` (plots your folk harvest and **replant** but never start) were both
complete, both already ticking in the frame loop, and both completely invisible. There was no way to
see a citizen, accept a migrant, break a field or collect a penny.

**`colony.setBase()` is the one input the whole module has**, and nothing called it. Beds decide how
many people can live here, defences decide whether anybody feels safe enough to come, structures
decide prosperity and therefore what a tax is worth — so every one of those was zero for ever:
appeal 0, migration never, prosperity exactly 1.00, tax nothing. It is fed from what is actually
standing now, which means knocking a turret down genuinely lowers the appeal.

The **Holding** section of the build panel appears once there is a bed, because a colony with
nowhere to sleep is not a colony and a panel of zeroes teaches nothing. It shows the head count
against the beds, the appeal as a percentage, the fields and how many are ripe, and the meals in
store — then the migrants waiting at the gate with *Take them in* / *Turn away*, a *Collect the tax*
button that says how many are housed, and *Break a field here*.

> **The Necesse rule, kept exactly.** *"They don't plant new crops but they will harvest and replant
> existing crops, this way the player still has to set up the crops in the first place but they
> maintain it after that."* `layPlot({ by: 'citizen' })` is refused with "Only you can break new
> ground. Your folk will work a field, not start one." — and `tests/holding.spec.js` checks it.

---

## 19. Two more `gives` blocks nobody read

Recorded here because it is the same failure as everything above, found twice more while closing the
round-11 loose ends.

**`data/landmarks.json` uses sixteen `gives` keys. Nine were handled and seven were not** — `xp`,
`curse`, `namesFoe`, `callsPatrol`, `reviveDaily`, `startsIncident`, `toll` — so seven kinds of
landmark were a name, a blurb and no consequence whatever. It went unnoticed because the *territory*
layer reads its own copy for the zone record: the world knew something had happened at the standing
stones and the player never found out.

`reviveDaily` in particular is worth its own line. Writing `player.reviveCharge = 1` and stopping
would have been the exact mistake this whole round is about, so `respawn()` spends it (you get up
where you fell, and keep your gold) and it expires with the day.

**`data/strongholds.json` has one too**, and `territory.clearSite` was doing only half the job. It
moved the grip and the claim — that part worked — and the whole payout went in the bin: `xp`, a
guaranteed `loot` grade, `standing`, a `perkPoint`, `revealZone`, `opensDungeon`, `liftsSiege`. The
difference between clearing a bandit camp and taking a Stonecount keep was two lines in the log.

The guaranteed loot needed one small change in `js/chests.js`: `place()` takes a `floor` now. The
beacon colour and the roll read the same field, so raising it makes the light outside the box match
what is really in it — a stronghold's `gives.loot` is a promise about *that keep*, not about the
grade of chest it happens to use.

**And the prisoners.** `sites.populate` has returned a count since the strongholds landed and
nothing ever did anything with it, so a camp whose entire point was that somebody was being held in
it played out exactly like one that was not. `js/town.js` grew `spawnOne()` — the same body, name
and look work `populate()` does for a settlement's roster, for one person standing at coordinates —
so a prisoner is a figure with a name you can walk up to and talk to. The boss going down frees
them, and they say so.

---

## 20. The last five — and they were all the same bug again

Closing the round meant clearing the five items that were still partly done. Every one of them was
another finished module with no way in.

### The whole top of the tech tree was unreachable

`js/shipyard.js` has carried `stationProgress`, `stationGate`, `buildStationModule` and `nextStep`
since the shipyard landed. **Nothing imported any of them.** So §9.15's orbital yard — four modules,
each lifted by a hauler, ending in refuelling and refitting in orbit — could not be reached at all,
and neither could §9.16's one line telling the player what to build next.

Both are in the shipyard panel now. The yard appears only once you own a hauler or already have
something up there, because a list of four things you cannot touch for twenty hours of play is
noise, and that panel is busy enough.

The **refining families** are shown where the decision is actually made: select an Alloy Forge in
the catalogue and it lists what it makes and what is still locked, with the same learn-by-doing
progress the bench shows. Listing it only once you own the bench is exactly backwards — "why would
I build one of these" is asked before the thing exists.

### The work board had no screen at all

`js/work.js` has done the whole of §6.6 — ten units of work, supplied by the player swinging, by a
machine, or by an assigned citizen — from the day it landed. You could not see an order, put a swing
into one, or point anybody at it.

The build panel has a **Work** section now: the order, a bar, the two buttons, and the **credit
line**, which is the feature rather than a decoration — a unit is a unit whoever produced it, and
the row says where they came from.

> It also turned up a shadowing bug: `board` was declared **twice** on `window.farhold` — the work
> board and the zone's notice board — and the later one silently won. Nothing outside `main.js`
> could reach `js/work.js`. It is `workBoard` now.

### Recruiting, and a migrant with a face

`colony.recruitOffer` and its refilling `townPool` had no way in. Talking to anybody in a town who
is not a guard now offers to bring them home to work — a different question from the mercenary hire
beside it, and worth keeping apart: a mercenary walks with you and fights, a recruit goes to your
holding and never leaves it.

They arrive with a **body**, standing at the claim stone, through the `folk.spawnOne()` written for
the prisoners. A colony of six is six people walking about rather than a number on a screen.

### Density that radiates out — and my own bug in it

§1.4, the last of the graphics round. The instance cap and the nearest-cell-first scan stopped trees
*shifting*; what was left was the outer ring arriving all at once as a wall. A cell is thinned by
how far out it is now — flat inside 62% of the radius, easing to 0.22 at the rim — and grass gets
its own fade over its own much smaller radius, where the view falloff was always exactly 1 and using
it would have been a change that did nothing.

**The rule that makes it safe**: a thinned cell is a *subset* of the dense one, never a different
scatter. Every tree standing there at arm's length was already standing there at the horizon, so
walking towards a wood adds trees *between* the ones you could already see.

> And the bug the test caught, which is the same lesson as everything else here. `break`ing out of
> the scatter loop is the obvious way to thin a cell, and it is wrong: the cell's `rng` is shared
> with the ruin roll, the megaflora and the grass, so stopping early consumed fewer numbers and
> every one of those got a different answer. Trees stood still while the bushes around them jumped
> — worse than the pop-in it was meant to cure. The item is drawn in full now and only the write to
> the mesh is skipped, so the stream ends in the same place whatever the thinning says.

---

## Round 13 — the tools that did nothing, and the routes that lay themselves

Reported in play, and every item here was a tool the panel offered that the world ignored. Full
write-up in `RPG.md`; this is the build-mode half.

### The toolbar now

| Tool | What it does | Round 13 |
|---|---|---|
| Level | Flatten a circle to the height under the cursor | fells what is inside the brush and rebuilds the props at the new height |
| Place | Put the selected piece down | — |
| Road | Click corners, Enter to lay | **draws the run as you click it**, picks a road for you, says what it laid |
| Wall | Same, with a gate where you double back | same preview |
| Raise / Lower | Pull the ground up or push it down | same prop handling as Level |
| **Scan** | Sweep for deposits and pin them | **new** |
| Clear | Fell the trees and boulders in the brush | **now does anything at all** |
| Take down | Deconstruct what you point at | — |
| Route | Click a drill, then a store | still here, but a drill routes itself |

### B gives the mouse back

Build mode is in `input.setBlocked`, so the click that would re-take the pointer does not.
`aimSpot()` unprojects the **real cursor** when the pointer is free and falls back to the camera's
heading when it is locked — otherwise you point at one patch of ground with the mouse and build on
another in the middle of the screen. Left-drag still turns the camera; a click and a drag are told
apart by whether the mouse moved more than six pixels between press and release. `body.building`
hides the fixed crosshair dot (a lie, while there is a cursor) and puts a real one on the canvas.

### The run preview

`js/build.js` keeps a `farhold-build-run` group: a peg at every clicked corner, a band of ground
between consecutive corners, and a dashed leg from the last peg to the cursor — all at the piece's
own half-width, so the preview is the footprint. Without it, four clicks and a silent array were
indistinguishable from a broken tool.

`setTool('road')` also selects `road_dirt` (and `'wall'` selects `palisade`) unless a piece of that
category is already picked. The fallback used to live inside `finishRun`, *after* the run was drawn,
so the panel spent the whole time quoting the price of whatever you last selected.

### The harvest ledger

`js/props.js` is a pure function of the cell seed, so there is nowhere to record "this tree is gone"
except a list of exceptions kept beside it:

```js
props.strike(x, z, { damage, reach, tier })   // a swing. { hit, name, verb, felled, materials }
props.clearAround(x, z, r)                     // the Clear tool. { removed, materials }
props.groundMoved(x, z, r)                     // a terrain edit: clear + rebuild at the new height
props.near(x, z, reach) / props.nearest(...)   // what is standing and can be harvested
props.describe(prop)                           // name, verb, tool tier, hp, what it drops
props.tickHarvest(seconds)                     // regrowth clocks
props.toJSON() / props.loadHarvest(json)       // in the save
```

`felled` is keyed by `propKey(kind, x, z)` — the position rounded to a tenth of a metre, which is far
inside the gap between two neighbouring scatter points and exact enough to hash the same on every
rebuild. `cleared` is a list of circles, so ground you cleared stays clear for cells that had not
been generated when you painted it. The skip follows round 12's rule: the numbers are all drawn and
only the write to the mesh is skipped, so felling one tree cannot shuffle the bushes around it.

`PROP_HARVEST` gives each kind `hp`, `tier`, `drops`, `verb` and `regrow`. The tier is the same
ladder `js/resources.js` uses for seams, read off your weapon by `toolTierFor` — one rule, not two.

### Scan, and the deposits

`build.setTool('scan')` then click: `onScan(x, z, radius)` sweeps from the **cursor**, and the panel
shows one row per material — the best of each, judged by delivered-per-minute from where you are
standing — with a bearing and a **Pin it** button that drops a `seam` marker into `js/markers.js`.
The brush size is the range, so `[` and `]` trade reach for detail.

### Routes lay themselves, over ground you can walk

`js/haulpath.js` is A\* over an 8 m grid. Water is impassable, anything steeper than `MAX_SLOPE`
(0.62) is a bank a loaded cart does not go up, a step costs its length times `stepCost(slope)`, and
the search is bounded to half again the straight-line distance so an unreachable store fails fast.

```js
findHaulPath({ from, to, terrain })   // { ok, metres, points, direct }
bestStoreFor({ from, pools, terrain, rateFor, insidePoolId })
mining.autoRoute(drillId)             // the drill picks its own store
```

`mining.rateOf` uses the **walked** length, cached on the route and recomputed only when an end
moves, and reports a `detour` ratio. A drill auto-routes when it is placed; a new store re-routes
every drill that had none. `js/ore-view.js` `drawRoutes` lays the track on the ground, because a
route that goes twice as far as the crow flies explains itself the moment you look at it.

### One vocabulary for materials

`data/structures.json` prices in short names (`timber`, `iron`, `parts`, `block`); everything that
*produces* a material speaks `log`, `iron_ingot`, `machine_part`, `cut_stone`. The catalogue's own
header deferred the join to "§1 and §2", and the join was never made — so **a palisade cost six
units of a thing nothing in the game has ever produced.**

```js
import { alignCatalogue, realCost, MATERIAL_ALIASES } from './buildplan.js';
const catalogue = alignCatalogue(structureData, resourceData);   // once, at boot
```

Ten aliases, applied at the boundary, with the display names carried across so the panel still says
"6 timber" while the pool spends logs. `realCost` is idempotent, so a raw catalogue handed straight
to `createBuildPlan` still works — the plan translates again and lands on the same answer.

`wire` and `concrete` were not aliases for anything: ten structures spent wire and no recipe made
any. They are real materials now, from `draw_wire` at the smelter and `pour_concrete` at the
stonecutter.

The rule, in `tests/round13.test.js`: **every build cost must be something the game actually
produces** — dug out of the ground or made at a bench. A cost you cannot obtain is not a price, it
is a wall.

---

## Round 14 — the permit that could not be bought, and the road that was a row of tiles

Two things the player asked for, and both of them turned out to be the same fault underneath: a rule
written down in one file and never reconciled with the file that would have to satisfy it.

### 14.1 The deadlock, in the user's own words

> "I can't build a claim stone because it requires 2 iron ingots. I can't refine iron without a
> furnace. I can't build a furnace without a claim stone. I don't really want to have claim stones
> and would rather just allow building arbitrarily anywhere."

Every sentence of that is true. `js/buildplan.js` refused any placement outside a claim once anything
at all was standing; the only way to make a second claim was a Claim Stone; a Claim Stone cost two
iron ingots; iron comes out of a furnace; a furnace had to stand inside a claim. Your *first* base
was fine, because the first thing you ever build stakes a claim for free. Your second was impossible.

**The gate is deleted, not repriced.** Every rule about the WORLD is kept — not on water, not on a
slope, not inside another building, on the right ground for the machine — and the one rule about
paperwork is gone. The lines it used to occupy in `check()` now carry the note explaining why.

### 14.2 An outpost is worked out, not declared

`js/outposts.js` replaces the idea a Claim Stone used to sell you. An outpost is **a group of things
standing near each other**, found by single-linkage clustering over footprint edges with a 40 m gap —
a little further than a logistics pole reaches, so two crates that share a pile are never called two
different places. A road you laid joins two clusters into one, because that is what laying it said.

Nothing is stored. The group cannot drift out of step with what is actually standing there, and an
old save needs no migration because there is nothing new in it to migrate. `roleOf()` reads the
group and names it — Mine, Depot, Works, Power, Fort, Hub — so the panel has something to list.

The Claim Stone survives as the **Outpost Marker**: 12 stone, permits nothing, and all it does is
carry the name of the group it stands in. `js/defence.js` still finds the middle of a base by looking
for one, and a save that has one still loads.

### 14.3 The other two self-gates, found by the test written for the first

The test that would have caught the claim stone is *"walk the whole catalogue and prove every piece
is reachable from a bare-handed start"*. It is in `tests/round14.test.js` and it found two more of
exactly the same shape within a minute:

| Piece | Cost | Made by |
|---|---|---|
| Loom | 4 **rope** | the loom, and nothing else |
| Assembler | 10 **machine parts** | the assembler, and nothing else |

The second one is the expensive one: with no machine parts obtainable, the smelter, alloy forge,
crusher, washer, refinery, crystal cutter, drill, pump, wind turbine, battery bank, hauler drone and
eleven more were unbuildable by any honest route, and `wire`, `lens`, `bronze` and `lift fuel` were
unreachable behind them. **Twenty-two of the ninety-eight pieces in the catalogue, and the entire top
half of the refining chain.**

The fixes are three lines of data:

* the loom costs 10 **fibre** (which you pull out of the ground);
* the alloy forge costs iron and block instead of steel and machine parts;
* a new recipe, **`forge_rough_part`** on the alloy forge: 4 iron ingots and 2 planks into one machine
  part, at seventy seconds — three times an assembler's and with no bronze in it, so reaching the
  assembler is still worth doing.

With those, the walk reaches every machine and every one of the 98 structures. The test asserts that,
and it is the one in this file to keep green above all the others: **a cost you cannot obtain is not
a price, it is a wall.**

### 14.4 Goods take time to move — `js/logistics.js`

> "I would like to slap down a drill at a remote deposit, connect it to the power grid and storage,
> and send the output back to my base using a travel route. Resources should take time to move unless
> in the immediate vicinity, and should be able to greatly improve that time by building roads…
> (no vehicles right now, materials can just teleport after a delay)."

Three rules, and the first one is unchanged from §8:

1. **Inside one storage pool nothing moves.** That is what a pool IS, and planting a logistics pole
   to make one is still the reward.
2. **Between two pools a load takes a real trip.** `handling + metres / speed`, where `metres` is the
   ground a hauler can actually walk (`js/haulpath.js`'s A\*, not the crow flight through the hill).
   The goods leave the source pool the moment it is sent, so a base cannot spend the same ore twice
   by shipping it and smelting it, and they land in the destination when the clock runs out.
3. **A road cuts it sharply**, in proportion to how much of the walked route runs on one:
   `boost = 1 + roadFraction × (roadFactor − 1)`, and `roadFactor` is 2.6 in `data/power.json`'s new
   `travel` block. A track laid the whole way is the full speed-up; half a track is half of it, so
   finishing one is worth doing.

`link(from, to)` is a **standing order** — "whatever piles up in this pool goes to that one" — so
nobody has to press a button per cartload. One load on the road per link at a time, or a rich mine
floods the track. A load that arrives at a full store waits at the gate marked `waiting` and tries
again every tick; it never bounces and it never vanishes, because losing a player's ore for reasons
they cannot see is the worst thing a logistics system can do.

### 14.5 The base keeps working while you are off the planet

> "Production and manufacturing should continue even if you leave a planet."

`createAwayClock` stamps the wall clock on the way out and runs the base forward on the way back.
The machines and the carts take turns in fifteen-minute slices rather than running one after the
other — a mine that ships ore home so the smelters can eat it would smelt nothing if all the refining
happened before any of the hauling. The power grid is ticked too, or the generators would run for six
hours on no fuel at all.

**The cap is six hours, and it is a promise rather than a balance knob.** Without one, a player who
leaves the game open over a weekend comes back to a hundred thousand ingots and the progression is
gone. Six hours is a generous reward for setting a base up and an amount you could plausibly have sat
and watched.

The summary is a **diff of what the stores hold**, not a log of what the machines claim they made,
because a furnace that smelted forty ingots into a full crate and then jammed has produced nothing as
far as anybody can tell. `back.text` is the line for the HUD; the stamp goes in the save.

### 14.6 A road you lay is a road — `js/roadplan.js`

> "The road tool places a lot of rectangles that leave gaps in between and look unnatural. The tiles
> in town clip through the terrain. It would be better if they behaved like the regular roads, which
> we've worked on to get smooth on the terrain."

There were two completely different ideas of what a road is.

* **The world's roads** are a polyline with a graded height per point. `js/planet.js` smooths the
  natural ground along the line four times, stores it as `surface`, and carves the terrain down to
  meet it; `js/features.js` draws one continuous ribbon, two vertices per point, every quad sharing
  its neighbour's edge. No seam is possible because there are no sections.
* **The build tool's roads** were ninety separate 4 m `road_dirt` boxes in the build ledger, each
  sitting on the height of its own middle. On a slope they step past each other; at a corner each
  stops square and the wedge between two bearings is bare grass.

`js/roadplan.js` is the first idea, made reusable. A **lane** is `{ points, surface, half }` — the
same three fields `terrain.roadPaths` carries — and the file makes them, levels the ground under
them, and turns them into triangles:

```js
const lane = planLane([[0,0],[40,10],[80,4]], { terrain, half: 2 });
levelLane(lane, terraform, { claim });          // the ground comes up to meet it
const geom = laneRibbon(lane, { lift: 0.06 });  // → { position, normal, index }
```

Three decisions worth keeping:

* **Resampled by total length, not leg by leg.** The first version walked each leg at a fixed 3 m
  step, carried the remainder into the next, and moved the last point on to the true end if it had
  stopped within a whisker of it. Both leave gaps — measured on a 90 m street, a tail 0.72 m short was
  pulled forward and left a **3.72 m gap where the spacing is 3 m**. Dividing the whole line into
  `ceil(length / spacing)` equal steps makes every gap the same and never longer than the spacing.
* **Corners are rounded in the PLAN.** Two light 1-2-1 passes over the points turn a corner into a
  short curve, and a curve has no wedge to pave over. `js/features.js` was dropping a square pad on
  every junction to fill that wedge; a lane needs none.
* **A levelling brush is only as long as the road is straight.** `strip()` grades linearly from one
  end to the other — a chord — while the lane's surface is a smoothed curve. Painting a brush every
  ten metres regardless left the road **2.8 m off the ground it was drawn on** on a nine-metre swell.
  A brush now stops at ten metres *or* wherever the chord has drifted 25 cm from the curve.

And one bug that only showed up because of the above: a strip brush has a rounded cap at each end,
and in a chain each cap reaches back over its neighbour's middle. Because `segmentHit` clamps `t`,
the ground there was pulled towards the neighbour's *endpoint* height rather than towards the road's
height at that spot — half the road floating and half buried, which is the complaint the round set
out to fix arriving through a different door. `strip({ caps: false })` in `js/terraform.js` says "the
next leg covers the ground past my end, so I do not"; every point on a chain then belongs to exactly
one brush and the skirt is purely sideways, which is what a road shoulder is anyway.

The lanes live in their own book (`createRoadBook`) rather than the build ledger, because a lane has
no footprint, collides with nothing, and ninety boxes in the ledger meant ninety overlap tests on
every frame the ghost was up. `Ctrl+Z` learned about the second book at the same time — before that,
laying a road and pressing undo quietly took down the shed you built ten minutes earlier.

### 14.7 Tiles and slabs level to the average, not to the middle

The user's own fallback — *"maybe these tiles and slabs just need to level the ground beneath them
automatically, though IDK how to handle slopes"* — is the right answer for anything that cannot be a
line. **Anything 30 cm tall or less is a tile now, and a tile levels under itself.** That covers the
rug, the flower bed, the caltrops, the moss carpet and the paving square, all of which were 10 cm
tall, all of which sat on the height of their own middle, and all of which poked a corner through the
hill on anything but a billiard table.

How to handle slopes: **level to the mean of the four corners and the centre.** Level to the lowest
corner and the pad sits in a pit; to the highest and it stands on a plinth; the mean makes half of it
a shallow cut and half a shallow fill, which is how a real terrace is built. Five samples rather than
four because a slab across a ridge has four corners that agree and a middle two metres higher. The
skirt is sized by how far the ground was falling, so a slab on a hummock gets a 1.2 m feather and one
cut into a bank gets a wide one.

### 14.8 Town streets

`streetLanes()` in `js/town-plan.js` turns proctown's street polylines into the same lanes, sampled
every three metres BEFORE the water check (an alley straight through a town can be two corners ninety
metres apart, and asking "is this in the river?" of two corners tells you nothing about the
eighty-eight metres between them). It grades with **two** passes rather than four on purpose: nothing
carves the ground under a town — `js/features.js` has no terraform book, and painting brushes from
there would write a permanent terrain edit into the save every time a settlement was rebuilt — so a
street has to follow the hillside instead of cutting into it.

`js/features.js` belonged to another agent this round, so the change there is written out as an
exact patch in **`research/round14-build-handoff.md`** rather than made. The same document carries
the `js/main.js` wiring for §14.4 and §14.5, without which `js/logistics.js` is a finished module
nothing calls — which is the fault rounds 11 to 13 kept finding, and not one to repeat.

### 14.9 Tests — `tests/round14.test.js`

Twenty-four of them. In rough order of how much they matter:

* **every piece in the catalogue is reachable from a bare-handed start** (§14.3), walking machines,
  recipes and the three tool tiers to a fixed point;
* the three self-gates stay fixed — no iron in the marker, no rope in the loom, more than one thing
  in the game that makes a machine part;
* you can build anywhere, and the world rules (water, slope, footing) are all still enforced;
* an outpost comes out of the geometry, and a road joins two of them;
* a load's time is `handling + metres / speed`, doubling the distance doubles the wait, a road cuts
  it by `roadFactor` and half a road by half of that;
* goods are in neither pile while they are on the road, and a full destination holds them at the gate;
* the away clock produces, caps at six hours, and keeps its stamp across a save;
* a laid road has no gaps — checked on the points AND by walking the index buffer to prove each quad
  shares an edge with the one before it;
* the ground under a laid road is within half a metre of the surface it is drawn at;
* a tile's corners are within 12 cm of the ground it sits on, and a slab levels to the mean;
* a town street is a lane, and it breaks at the water instead of leaving a hole.

---

## Round 16 — Extraction, Refining, and holding E

> "Drills and similar resource extraction devices should be on their own building menu and are
> automated, separate from manufacturing devices which require work to be done by the player or NPC.
> Players can contribute work by holding E, and the progress bar should be indicated over the
> structure. NPCs can also work automatically and the player can jump in to help make it go faster.
> This is more groundwork for the building system. Expand the building system by adding some more
> features that would fit the new mechanisms I've described."

### 16.1 The split

`data/structures.json` grew a category. **Extraction** holds the three pieces that take raw material
out of the world — Small Drill, Drill, Pump — and **Refining** keeps the seventeen that turn one
thing into another. Ids did not move, because a saved base stores `entry.key`; what moved is `cat`,
which is display data, so `js/buildplan.js` `load()` now re-reads it from the catalogue on every
load. An old save's drill arrives filed under "refine" and is corrected before anything looks at it.

The panel needed no code for the new button: `js/build-ui.js` derives its categories from
`Object.keys(categories)` filtered by what has something in it, and `extract` is inserted before
`refine` so the buttons read in the order you actually do the work.

**The invariant the split rests on, and it is checked from both ends:** an extraction piece is never
a `data/refining.json` machine. That is not a convention — it is the mechanism. `works.place` is
only ever called for a structure with a machine definition, so a drill is not in `works` at all, so
`postLabour` cannot see it, so there is no way for a drill to ask for a worker. `tests/round16-
industry.test.js` asserts no `extract` structure has a machine def, no machine sits in `extract`,
and that a base of drills posts zero orders.

The two id lists that knew about drills are gone: `js/buildplan.js` `isExtractor()` is the one
answer (`cat === 'extract' || needs === 'node' || needs === 'water'`), and `js/outposts.js` `roleOf`
reads the category — which incidentally fixes the Small Drill, the FIRST drill anybody builds, never
having been in that list, so a camp of them called itself a Workshops outpost.

### 16.2 Holding E

`js/refine.js` `createHandWork()`. One rule: **your units go into the same order a citizen fills.**

R15 already let you work a machine by standing near it, and it did it by calling `works.credit`
directly — straight into the machine's bank, round the side of the board. It worked, and it was a
parallel system: your effort never appeared in an order, never in `ledgerRows`, never in
`creditLine`, and a citizen walking to the same furnace could not tell you had been there. "The
player can jump in to help" has to mean helping with the job they are doing.

So it goes through `board.swing`, which is `addWork(source: 'player')`, which is the identical
function `colony._doWork` and the Tender Arm call. The bar over the structure is that order's real
`progressFraction` — a citizen filling the same order moves your bar, which a local clock could
never do. Two rates, in `data/refining.json`'s `handWork` block: standing near a bench is
`1/30` units a real second (R15's 1:1, kept exactly), holding E is `0.1`, three times that, scaled
by the tool you are carrying.

**It is not `createGathering`,** and this is the one place that module's "the same object can run a
seam, a tree and a manufacturing structure" header does not hold. A gather owns a clock and fires
once at the end; this owns nothing and finishes nothing.

**E decides by the machine, not by how long you hold the key.** A bench with a job on it that wants
hands is one you help; a bench that is idle, switched off or already running itself is one you talk
to, and the recipe list comes up as it did in R15. There is always a door — B opens the bench panel
on whatever you are standing at.

### 16.3 The bug the join turned up

Routing the player through the board meant labour was only paid when a four-unit order finished —
two minutes of standing at a cold furnace, then two minutes of running off a lump sum. Same
throughput, reads as broken. `collectLabour` now pays the DELTA of what an order has had put into
it, open orders included. That fixes it for citizens too: one worker halfway through an order used
to buy their machine nothing at all, so a bench with one person on it ran in two-minute pulses.

### 16.4 What else got wired

Three things that existed, were saved, were read — and had no way in.

* **The switch.** `m.enabled` is checked at the top of `step`, in `postLabour` and in `toJSON`, and
  nothing has ever set it. `works.setEnabled` and a button on the bench panel. A bench you turn off
  keeps its queue, its half-finished batch and its bank; it stops, and it stops asking for a worker,
  which matters because an idle loom was splitting your one smelter's shift with the furnace.
* **Batches and standing orders.** `works.queue(id, recipe, count)` has taken a count since the day
  it was written and `count <= 0` has always meant "keep going" — the queue rows have printed the
  word "repeating" all along. The panel only ever sent 1, so clicking a recipe twenty times was the
  only way to make twenty of anything. ×1 / ×5 / ×20 / keep going, chosen once.
* **Priority.** New, and it is nothing but the `priority` on the machine's own work order, which
  `js/work.js` `nextFor` has always sorted by and nothing ever set above the default. Last / Normal
  / First on the bench panel; a change reaches an order that is already open.

And one thing that existed and had never been *rendered*: `creditLine`. A machine remembers the
sentence for its last shift, so a bench can say "2.5 by You, 1.5 by Marwen".

`js/work.js`'s `WorkBoard` also keeps its orders when it is built from a save. `toJSON` has always
written them out and the constructor read `now` and threw the rest away (`fromJSON`, which does read
them, is called by nobody) — invisible for a machine's order, which is re-posted within the second,
and a silent loss of every harvest and build order and the half-shift already in it.

---

## Round 17 — stations, the panel and research

Four items, and three of them are the same complaint in different clothes: **the build panel had
become the only screen in the game, so everything you might want to do to a building was a section
of it.** The fourth is the deadlock that came out of the first hour of play.

> *"I built a furnace, campfire, kiln, and loom, but I still cannot figure out how to convert iron
> ore into ingots. The furnace says it can smelt iron. But when I press E to open it it just opens
> the regular build menu."*
>
> *"The build menu itself could use some work… it shows a list of building category buttons and a
> list of buildings even if the 'Place' option is not selected. If I select 'Scan', it shouldn't show
> those placement options. It also has a 'Tools and devices' menu… There is also a garage menu…
> there should be a distinct Garage building where you manage that sort of thing."*
>
> *"Since I still can't craft an iron ingot, I can't build a chest, so I can't complete the building
> onboarding."*

### 17.1 The deadlock, which was a ring three links long

The onboarding says to build a Storage Crate before a forge. A Storage Crate cost **6 planks and an
iron ingot**. A plank came off a **Sawmill**, a Sawmill cost **8 iron ingots**, an ingot came out of
a **Furnace** — and a furnace draws its inputs only from a **storage pool**, which is the thing you
were trying to build. Every link in that ring was correct on its own, which is why it survived four
rounds of play-testing: the fault is only visible if you ask the whole question at once.

Three changes, and the ring is cut:

* **The Crafting Table costs six logs and two stone** — both of which bare hands take off a tree and
  a boulder — **and it carries its own three-slot shelf**, so it IS a storage pool the moment it is
  down. It used to cost 6 planks and 2 iron ingots, which is to say it was inside the ring it is the
  way out of.
* **`split_planks`**: one log into two planks, twenty seconds, on the Crafting Table. Against the
  Sawmill's four planks in nine seconds — a Sawmill is 4.4× better and still worth every ingot, and
  a wedge and a mallet will get you the first six planks in the game.
* **The Storage Crate is the Storage Box**: six slots, **6 planks and no metal at all**. Above it,
  a **Storage Chest** — 8 planks and 2 iron ingots, twenty slots, which is exactly the old crate's
  capacity at roughly the old crate's price. So a settled base is as roomy as it always was and the
  NEW thing is the rung below.

**The id `storage_crate` did not move.** Every save in existence files its crates under it — in the
build ledger, in the store network and in `data/power.json` — so what changed is the name the player
reads. A save written before this round also keeps the `cap: 250` written inside each of its crates
(`Store.toJSON` writes the number, not the type), so no existing base shrank.

### 17.2 A station is a screen, and it is a row of JSON

Every structure may carry a `station` block:

```json
"station": {
  "title": "Furnace",
  "blurb": "Ore in, ingot out, wood or coal underneath. Hold E to work it yourself, or house somebody who will.",
  "recipes": ["smelt_iron", "smelt_copper", "smelt_tin", "…"],
  "panels": ["tools"]
}
```

`js/station-ui.js` draws it. `E` opens it (see the handoff note below), and adding a station later
is a row in `data/structures.json`, not a panel in code. `panels` are the three built-in sections —
`tools`, `garage`, `shipyard` — for the things that are not refining recipes.

**Four benches had no entry in `data/refining.json` at all**, and that was the whole of why E did
nothing at them: js/main.js's `interactTarget` offers a `machine` only for something in
`works.machineDefs`, so a Crafting Table, an Anvil, a Workbench and a Garage were structures the game
could build and had no door into. Three of them run no recipe and are listed anyway, with no `labour`
block, so they never ask for a worker and never post an order. The cost of listing them is a name and
a footprint; the benefit is a key that works.

**One renderer, two mounts.** `drawStationBody` is shared between the station screen and the build
panel's "the bench you are standing next to" section, because two copies of a recipe list is how a
bench reached with B starts behaving differently from the same bench reached with E.

**"Load it from your pack."** A machine draws only from the pool it stands in, and everything you
dig up while you are away from home is in the bag on your back — so *"I have forty iron ore and the
furnace says it has none"* is the honest report, and the answer (walk home, stand next to the crate,
swing at something else) is not one anybody could guess. The button is `plan.pay(bill)` followed by
`plan.giveBack(bill)` on the build ledger's own purse: `pay` takes from the pool first and then the
bag, `giveBack` puts back into the pool first and spills only what the crates will not hold. Doing
both with the same bill is exactly "tip the pack into the store", and it reuses the one purse in the
game that already knows which order those two come in.

### 17.3 The tool rail hides what the tool cannot use

`TOOLS` gained a `kind`: `place` (Place, Road, Wall), `brush` (Level, Raise, Lower, Clear), `scan`,
`point` (Take down, Route). The category row, the catalogue and the detail card are drawn **only for
a placement tool** — and Road and Wall narrow the catalogue to their own family, because picking a
Statue while the Road tool is up was only ever a way to make the panel quote a price for something
the tool would never lay. A brush tool gets its radius and its sentence instead.

It was not really a display bug. Nothing in `js/build-ui.js` knew which tools place something;
`catsForTool(toolKey, catKeys)` is that fact, stated once, and it is a pure function so
`node --test` checks it without a browser.

**Out of the panel entirely:** the *Tools and devices* bench, which now lives at the Crafting Table,
the Anvil and the Workbench — filtered by the `at` key `data/tools.json` has carried since the day it
was written and **which nothing had ever read**, so you could forge a Steelhead Pick standing in an
empty field. `at: "hand"` is the one exception and it is deliberate: the Knapped Tool is lashed
together out of four logs and eight fibre with no bench at all, and it shows on every station screen.
And the *Garage*, which is a **building** now — `data/structures.json` `garage`, 16 planks, 8 iron
and 10 block, behind Steelwork. Note what it does not do: the parts are still cut on an Assembler
(and for the bigger rigs an Alloy Forge and a Refinery), because `data/vehicles.json` owns that rule
and a garage is a shed with a pit in it. Its blurb says so; put it beside the line.

### 17.4 Research: four ages, and the first one is free

`js/research.js` + `data/research.json`. Seven purchasable nodes over four ages, twenty-seven points
in total, which is about eight hours of play.

**The rule the whole system is built around is enforced by ABSENCE.** A structure is locked only if
it carries a `tech` key naming a node. No key, no lock — so the default for anything anybody adds to
the catalogue later is "available", and the failure mode of forgetting is a piece that is too cheap
rather than a player who lands on a planet and cannot build a box. Getting that default backwards is
how §17.1 happened in the first place.

| Age | Node | Cost | Opens |
|---|---|---|---|
| 1 Timber | — | — | everything not named below, from the moment you land |
| 2 Iron | Ironworking | 2 | Smelter, Alloy Forge, Crusher, Drill, Pump, Storage Silo, Ballista, Reinforced Wall |
| 2 Iron | Drawn Wire | 3 | Battery Bank, Solar Array, Wind Turbine, Repair Station, Flame and Frost turrets |
| 2 Iron | Reagents | 3 | Chemical Bench, Washer, Alchemy Bench |
| 3 Steel | Steelwork | 4 | Refinery, Manufactory, Hauler Post, Tender Arm, Geothermal Tap, Garage |
| 3 Steel | Ground Glass | 4 | Crystal Cutter, Enchanting Altar, Shield Pylon, Crystal Lamp, Tesla Coil |
| 4 Rocket | Assembly | 5 | Assembler |
| 4 Rocket | Propulsion | 6 | Fuel Synthesiser, Waypoint Pad |

Points come from **finishing a quest, finding somewhere new, and killing something with a name** —
one function, `research.award(reason, n)`, so each of those call sites is a single line. Nothing is
bought with materials or gold: research is what you did, not what you saved up.

A locked row in the catalogue is **shown**, struck through, carrying the sentence *"Locked — research
Ironworking (Age of Iron), 2 points."* Shown, because a piece you cannot see is a piece you will
never go looking for and the whole point of four ages is that you can see where the fourth one is.
With the sentence, because a greyed row with no reason is the one answer a player cannot act on.

Research rides in the `build` blob of the save (`js/build.js`'s `toJSON`/`load`) rather than in a
slot of its own, because adding a save key means editing `js/main.js`'s `currentSnapshot()` **and**
`js/save.js`'s parameter list together, and both belong to another pair of hands this round. It is
not an unreasonable home: research gates the build catalogue and nothing else.

### 17.5 The bug under all of it: **building has been free since the expansion landed**

`js/buildplan.js` spends a whole bill at once — `bank.take({ log: 6, iron_ingot: 1 })` — because a
half-paid structure is worse than an unpaid one, and `makeBag` does exactly that, so every node test
has always passed. `js/main.js` hands in a different object: `take(id, n)` and `give(id, n)`, **one
line at a time**, because `js/build.js`'s clear tool calls them that way (round 13's own note:
*"this was `store.give(res.materials)` — the whole bag as the first argument"*). Nobody joined the
two up.

So in the real game the cost object arrived as the material id and `undefined` arrived as the count.
`stores.count(pool, {object})` is 0, `n - fromPool` is `NaN`, `materials.spend({'[object Object]':
NaN})` refuses and changes nothing — **and the placement went ahead anyway**, because `check` had
already approved it off `bank.have(id)`, which is the one method both shapes agree on.

That is why nobody noticed: you still could not build what you could not afford, you simply never ran
out. Every structure in Farhold has been free, and every deconstruct has refunded nothing, for the
whole of the building expansion. `bankAdapter` in `js/buildplan.js` is the join — it detects which
contract a store speaks (a per-line one takes two arguments) and checks `have` before it spends a
penny, so a bill that is half payable buys nothing.

And two prices that round 13's rule could not see, because they name materials something *does*
produce — at the far end of the tech tree:

* a tier-1 **Power Pole** cost 2 `wire`, and wire is drawn on a **Smelter**, which needs a grid,
  which needs poles. Copper now, which comes straight out of a furnace.
* a **Lamp Post** cost 1 `fuel`, which aliases to `lift_fuel`, which comes out of the **Fuel
  Synthesiser** — the last structure in the game. A street lamp was priced in rocket propellant.
  Resin off a sawmill now.

### 17.6 Where each thing is reached

* **A station** — walk up and press `E` (after the one-line js/main.js patch in
  `research/round17-build-handoff.md`); until then, `B` → the bench section → **"Open the Furnace"**.
* **Tools and devices** — the station screen of a Crafting Table, an Anvil or a Workbench.
* **The garage** — build a **Garage** and press `E` at it.
* **Research** — the **Research** tab of the character sheet once `js/hud.js` mounts it (the rail
  entry and `#sheet-body-research` already exist), or the **Research** button in the build panel's
  head, which opens the same screen as an overlay.
* **The Storage Chest** — Build mode → Storage, once you can smelt two ingots.

### 17.7 Tests

`tests/round17-build.test.js`, 22 of them. The first is the round: **land with nothing, gather, build
a Crafting Table, split planks, build a Storage Box, build a Furnace, and smelt iron ore into an
ingot** — through the real ledger, the real pools, the real refining engine and the real work board,
with no research bought and no test-only shortcut. Under it: the purse fix, round 13's rule extended
to the new entries, every station's recipes resolving, the tech gates agreeing with the tree in both
directions, the tree being finishable and nothing in it stranded, Box and Chest capacities, an old
save's crates surviving, and the tool rail.

The last three of them **draw the screens**, in `tests/tiny-dom.mjs` — sixty lines of `document`,
deliberately not a DOM. `node --check` proves a file parses; it does not prove that a helper renamed
in one place was renamed in the other, or that a `const` is not read above its own declaration, both
of which this project has shipped. It caught one on its first run: `drawStationBody` opened with
`box.replaceChildren()`, which silently wiped the heading and the "Open the Furnace" button the build
panel had just put above it.
