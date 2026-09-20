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
| `data/structures.json` | 98 structures, 25 materials, the placement rules | — |
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
