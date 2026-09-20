# Farhold — industry: digging, refining, crafting, power

`BUILDING_EXPANSION.md` §1, §2, §3 and §8, built. Four modules and three data files, all pure —
no DOM, no Three.js, no clock of their own — so `node --test` checks the rules rather than a
screenshot, and whoever owns the scene owns the meshes.

| File | What it is |
|---|---|
| `js/resources.js` | Nodes: richness, yield per tick, depletion, respawn, and **the distance trade-off as a number** |
| `js/stores.js` | Storage pools: stores that reach each other share everything; further away needs hauling |
| `js/power.js` | The grid: generation, storage, draw, duty cycle, load shedding down a stated ladder |
| `js/refine.js` | Three tiers of machine, recipes as data, jobs that queue and run while you are elsewhere |
| `js/craft.js` | The existing bench, folded in — it now pays out of the store pool as well as the bag |
| `data/resources.json` | 75 materials, 17 node kinds, richness bands, planet bands, the haul maths |
| `data/refining.json` | 16 machines over three tiers, 61 recipes, the goals list |
| `data/power.json` | Generators, batteries, poles, stores, haulers, the shed ladder |
| `tests/industry.test.js` | 44 tests |

Nothing here writes to `data/items.json` — that file is shared with Emberveil and has a test that
every affix in it resolves. Farhold's materials live in `data/resources.json` instead.

---

## 1. The one decision this exists to make

The user's words:

> "I would like the resource system so that I have to choose between a particularly dense node far
> away with more travel time, or a closer node that produces less per tick."

So that is not a side effect of the system, it **is** the system. Every node has a **richness** (how
much comes out per swing) and a **distance** (how long you spend not swinging), and `haulReport()`
folds both into one number the player can read *before* committing:

```
delivered = carry / (carry / faceRate + 2 * distance / walkSpeed)
```

Fill your arms at the face, walk home, walk back. That is the whole sum.

**Worked example, straight out of the test.** A Mother Lode iron outcrop (richness 2.2) four hundred
metres out digs at 39.6/min at the face. A Lean seam (richness 0.6) twenty metres from the workshop
digs at 10.8/min — less than a third as fast. Carried home:

| | at the face | distance | delivered |
|---|---|---|---|
| Mother Lode | 39.6 /min | 400 m | **8.8 /min** |
| Lean seam | 10.8 /min | 20 m | **10.3 /min** |

The lean seam wins. `breakEvenDistance()` says exactly where they cross — about **324 m** — so the
UI can draw a ring on the map rather than leave the player to discover it by regretting it.

Three things make that legible rather than fiddly:

* `nodeText(node, ctx)` is one sentence: *"Mother Lode Iron Ore Outcrop (2.2x) — 39.6/min at the
  face, 400 m away, 8.8/min once you have walked it home."*
* `compareNodes()` ranks a handful by what actually arrives and says **why** each lost: *"richer,
  but the walk eats the difference"* / *"closer, but there is less in it"*.
* `walkShare` is the fraction of your effort the walk eats. Over 0.5 means you are a courier.

**Weight matters.** `walkSpeedFor()` slows you by the material's weight, so stone (weight 1.6) is a
different decision from gold ore at the same range. A quarry wants a cart; a gold seam does not.

**Tools gate rather than slow.** A stone tool on a crystal spire is not slow, it is impossible, and
the report says which tool you need. A drill is 3.2x an iron tool *and* works while you are away —
§1's "a drill should feel like a promotion, not a convenience".

### Depletion and respawn

A node runs dry, waits out `respawnSeconds`, and comes back at **0.92x the richness and 0.75x the
amount**, down to a floor of 0.5. So the ground around your house stays workable forever and is
never as good as walking out to a fresh seam — the same tension as the distance trade-off, at a
slower tempo. A wreck, a meteor fall and a rare seam have `respawnSeconds: 0` and never come back:
a planet has what it has, which is §9.6's whole point.

---

## 2. The escape hatch, and why it is the good bit

Distance only costs you while you are carrying things. Put a store or a logistics pole within reach
of the node and the ore goes straight into the pool: `walkSeconds` becomes 0 and the Mother Lode
wins again, by a mile.

That turns "which node do I walk to" into "**where do I put the base**", which is a much better
question, and it is why §8's pools are the mechanism rather than a convenience.

```js
stores.add({ id: 'outpost', type: 'storage_crate', x: 400, z: 0 });
haulReport(richNode, { data, origin, stores }).pooled;   // true — nothing to carry
```

Two pools that do not touch need a hauler, and `linkAdvice()` prices both sides of that:
*"293 m apart. A Hand Cart moves 48.9/min across it, or 5 relay masts joins them into one pool and
the trip stops existing."*

---

## 3. Refining — three tiers, and everything queues

| Tier | Machines | Power |
|---|---|---|
| 0 | campfire, furnace, kiln | none — they **burn** something, which is why coal matters before power does |
| 1 | sawmill, stonecutter, tannery, loom, smelter, alloy forge, chemical bench, crusher | most want it; the ones that do not are the ones you build on day one |
| 2 | washer, refinery, assembler, crystal cutter, fuel synthesiser | will not run at all without a grid |

* **Fuel is stated in seconds.** `fuels: { coal: 70, charcoal: 45, log: 18 }` — one log buys
  eighteen seconds of furnace. Best-first, so nobody burns beams by accident.
* **Recipes unlock by doing** (§2.18). Smelt iron ten times and Forge Steel appears on the alloy
  forge. `unlockProgress()` gives the "6 more Smelt Iron and this turns up" line; there is no tech
  tree for tier one.
* **Everything queues** (§2.19). `works.catchUp(600)` runs every machine forward ten minutes when
  you come back from a dungeon, sliced so a machine can go running → starved → blocked inside the
  window in the right order.
* **Byproducts are real and all of them go somewhere** (§2.17). Slag crushes into gravel, ash
  leaches into lye, tailings go back through the washer with a splash of acid. Tipping them is a
  choice, not the only option.
* **The refinery will not start without coolant**, and coolant is made at the chemical bench rather
  than at the refinery — otherwise the tier-2 gate is behind itself.

Machine badges (§8.8) are one of `running`, `idle`, `starved`, `blocked`, `unpowered`, `shed`, each
with a plain-language line: *"Grid is short — this was switched off to keep the important things
on."*

### No recipe is a dead end

`tests/industry.test.js` walks every recipe output and demands it be an input somewhere, a machine
fuel, a build cost, or a stated goal in `refining.json`'s `goals` block. A second test walks the
chain forward from everything a planet can hand you and proves every goal — the four ship
subsystems, lift fuel, the waypoint core, the warp core — is actually reachable.

---

## 4. Power, and what stops first

Generation, storage and draw, with generators on a **duty cycle**: one carrying half the load burns
half the fuel, so a base with headroom does not drain its coal overnight. A generator with no fuel
or no coolant reports **zero** potential rather than power that is not there.

**Load shedding is an ordered ladder, stated in `data/power.json` and argued for in its `_doc`:**

```
life  >  defence  >  extraction  >  waypoint  >  refining  >  crafting  >  comfort
```

The grid serves from the top and whatever is left over reaches the bottom — the same thing as
shedding from the bottom up, and much easier to read. The order is not arbitrary:

* **life** first, because a base that sheds its water pump kills the people in it.
* **defence** next: if a raid is on nothing else matters, and if one is not, turrets draw almost
  nothing anyway.
* **extraction** high, because shedding drills is a death spiral — the coal stops, so the generator
  stops, so the coal stops harder.
* **waypoint** below that: a dark waypoint costs you fast travel, not the base.
* **comfort** always first out. Nobody minds the lamps going off.

A brownout is announced **once**, in the log, naming what it dropped — never a modal (§8.10). An
idle machine still draws a quarter of its rating, which is why a shed full of idle smelters is not
free.

---

## 5. The crafting fold-in

`js/craft.js` was not replaced (§3.8). It gained one thing: a **supply**, which is the materials bag
first (it is in your pockets) and then the storage pool the bench is standing in (§3.11,
craft-from-storage). Quotes, rerolls, promotion and the forge are untouched.

```js
const craft = createCrafting({ data, rpg, materials });                          // exactly as before
const craft = createCrafting({ data, rpg, materials, stores, resources, bench }); // and the crate behind you
craft.heldAll();          // [{ id, n, bag, stored, name, tier, colour }]
craft.setBench(anvil);    // walk to a different anvil, draw from a different pool
```

Recycled gear stays the only source of the three magical materials — nothing you dig grinds into
Resonant Dust — so the loot loop is not devalued, it is joined by a second one.

---

## 6. What was lifted from Frontier Foundry

`prototypes/frontier-foundry/js/production.js` did most of this for a different game and it would
have been daft to write it twice:

| Lifted | From |
|---|---|
| Storage pools by union-find over overlapping reach | `recomputeLinks()` |
| Pull from your own buffer, then anywhere in the pool | `pull()` / `push()` |
| The raw-material share caps (a quarter per resource, half in total) | `roomFor()`, `SHARE_PER_RESOURCE` |
| Power networks by union-find over supply radii | `recomputePower()` |
| Generator duty cycle and "no fuel means no power counted" | `generatorPotential()` / `burnFuel()` |
| Battery charge/discharge shared by capacity | `tickPower()` |
| Round-trip throughput as capacity over cycle time | `routeThroughput()` in `rules.js` |

Changed on the way across: shedding is an N-tier ladder instead of a two-tier split, the pool is
metres on a planet instead of tiles on a grid, and the whole thing is driven by `tick(dt)` from
outside rather than owning a game loop.

---

## 7. Wiring this agent could not reach

These need files owned by other agents. Nothing below is guesswork — the call is exact.

1. **Load the three data files.** `js/main.js`, beside the other `loadJSON` calls (~line 105):
   ```js
   loadJSON('data/resources.json'), loadJSON('data/refining.json'), loadJSON('data/power.json'),
   ```
2. **Create the three systems** once the data is in, in the same place the other systems are made:
   ```js
   const stores = createStoreNetwork({ power: POW, materials: RES.materials });
   const grid   = createGrid({ power: POW, stores, log: msg => hud.log(msg) });
   const works  = createWorks({ refining: REF, resources: RES, stores, grid, log: msg => hud.log(msg) });
   works.rare = planet.rare?.[0] || null;     // §9.6 — this world's rare element
   ```
3. **Drive them from the frame loop**: `grid.tick(dt); works.tick(dt);` — and call
   `works.catchUp(seconds)` after anything that skips time (a dungeon, a rest, fast travel).
4. **`js/build.js`** should call `stores.add()` / `grid.add()` / `works.place()` when a storage,
   power or manufacturing structure finishes, and the matching `remove()` on deconstruct. Build
   costs are in each type's `build` block in `refining.json` and `power.json`; pay them with
   `stores.spend(pool, cost)`.
5. **`js/features.js` / `js/props.js`** own where nodes appear. `createNodeField({ data, rng, area,
   biomeAt, band, planet })` returns plain objects with `x`, `z`, `radius` and `kind`; `placedNode()`
   makes a single one for a meteor fall, a cleared camp or the starting wreck.
6. **`js/work.js`** (mining interaction) should call `mine(node, seconds, { data, tool })` per swing
   and put the result into `stores.poolAt(node.x, node.z)` when there is one, or the player's bag
   when there is not. Run `tickNodes(nodes, elapsed, RES)` once a game-hour for respawns.
7. **`js/hud.js`** wants `works.snapshot(id)` for a machine panel, `works.allJobs()` for the one
   shared job list (§3.19), `grid.overview()` + `stores.overview()` for the base panel (§8.9), and
   `nodeText()` / `compareNodes()` on the node tooltip and the map.
8. **`js/craft.js` callers** should pass `stores`, `resources` and `bench` to `createCrafting()` for
   craft-from-storage. Without them the bench behaves exactly as it always has.
9. **`data/balance.json`** (owned elsewhere) is the right home for a `world.industry` block if these
   numbers want tuning without touching data files — §9.20.
