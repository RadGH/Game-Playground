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
2. **Claim Stone** (*Waypoint* group). The ground is yours; raids come for this.
3. A **Storage Crate** and a **Burner Generator** beside it, with coal in the crate.
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
