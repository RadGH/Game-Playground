# Round 14 — the wiring I could not make myself

Two files were off limits this round because another agent was in them: **`js/main.js`** and
**`js/features.js`**. Everything below is written out as a copy-pasteable patch against the code as
it stood when I finished. Nothing in this file has been applied.

Without part B, `js/logistics.js` is a finished module nothing calls — which is the exact fault
rounds 11 to 13 kept turning up, so it is worth doing before anything else.

---

## A — `js/features.js`: town streets become lanes

**What is wrong now.** A street is a row of white slabs: one every three metres, each turned to its
span's bearing, each sitting on the ground height at its own midpoint, plus a square pad dropped on
every junction to fill the wedge where two bearings meet. On a slope consecutive slabs step past
each other and the seams open; a flat slab on sloped ground puts a corner under the surface. Round 11
halved the step and overlapped by a third, round 13 paved the junctions — both are patches on the
wrong model.

**What it becomes.** `streetLanes()` (in `js/town-plan.js`, mine, already written and tested) turns
proctown's street polylines into the same LANE the world's roads use, and `laneRibbon()` (in
`js/roadplan.js`) draws each as one continuous strip of triangles. No seams, because consecutive
quads share their vertices. No wedge at a corner, because the corner is rounded in the plan.

**One thing it deliberately does NOT do:** it does not reshape the ground. `features.js` has no
terraform book, and painting brushes from here would write a permanent terrain edit into the save
every time a settlement was rebuilt — they accumulate, and a town you walked past forty times would
carry forty copies of its own streets. So a street lane is graded with **two** smoothing passes
rather than the world roads' four: it follows the hillside instead of cutting into it, which is the
right answer when nothing is going to carve the hill for it.

### A1 — imports

Find (near the top, the existing local imports):

```js
import { waterRibbon, lakeSheet } from './water-plan.js';
```

Replace with:

```js
import { waterRibbon, lakeSheet } from './water-plan.js';
import { streetLanes } from './town-plan.js';
import { laneRibbon } from './roadplan.js';
```

`BUILDING_INFO` is already imported from `./town-plan.js` elsewhere in the file — if the existing
import line can take another name, add `streetLanes` to it instead of adding a second line.

### A2 — a mesh for the streets, beside the one for the roads

Find:

```js
  const roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b5c49') });
  const riverMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  for (const m of [riverMesh, roadMesh]) { m.frustumCulled = false; m.name = 'farhold-' + (m === riverMesh ? 'rivers' : 'roads'); scene.add(m); }
```

Replace with:

```js
  const roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b5c49') });
  const riverMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  /**
   * ROUND 14 — every street of every town in one mesh, with the culture's colour on the vertices.
   *
   * A street used to be an instance of the `street` box. It is a ribbon now (see `js/roadplan.js`),
   * and a ribbon is geometry rather than a transform — so the colour cannot ride on the instance and
   * has to ride on the vertices instead. One mesh for the lot, rebuilt with the settlements.
   */
  const streetMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const streetMesh = new THREE.Mesh(new THREE.BufferGeometry(), streetMat);
  for (const m of [riverMesh, roadMesh, streetMesh]) {
    m.frustumCulled = false;
    m.name = 'farhold-' + (m === riverMesh ? 'rivers' : m === roadMesh ? 'roads' : 'streets');
    scene.add(m);
  }

  /** Append one ribbon's triangles to a growing buffer, offsetting its indices. Same as `push` in `buildRibbons`. */
  function pushRibbon(into, part) {
    const base = into.position.length / 3;
    into.position.push(...part.position);
    into.normal.push(...part.normal);
    if (part.color) into.color.push(...part.color);
    for (const i of part.index) into.index.push(i + base);
  }
```

### A3 — `buildSettlement` takes the accumulator

Find:

```js
  function buildSettlement(node, counts, px = 0, pz = 0) {
```

Replace with:

```js
  function buildSettlement(node, counts, px = 0, pz = 0, streets = null) {
```

### A4 — the street loop

Find the whole block that begins with the comment `Lay the street surface along each polyline.` and
runs to the end of `for (const st of plan.streets) { … }` — it is the two nested loops that call
`place('street', …)`, one for the junction pads and one for the spans. Replace **all of it**
(comments included) with:

```js
    /**
     * ROUND 14 — A STREET IS A LANE, NOT A ROW OF TILES.
     *
     * *"The tiles in town clip through the terrain. It would be better if they behaved like the
     * regular roads, which we've worked on to get smooth on the terrain."*
     *
     * What was here laid a white slab every three metres along each street, each one turned to its
     * span's bearing and sitting on the ground height at its OWN midpoint, plus a square pad on
     * every junction to fill the wedge where two bearings met. Two rounds of patches on the wrong
     * model: on a slope consecutive slabs still step past each other, and a flat slab on sloped
     * ground puts a corner under the surface.
     *
     * `streetLanes` resamples each street at three metres, rounds its corners in the PLAN and grades
     * its heights, and `laneRibbon` draws it as one continuous strip whose quads share their
     * vertices — so a seam is not something that can happen and a junction needs no pad. The same
     * two functions draw the roads between towns and the roads the player lays in build mode.
     */
    if (streets) {
      const tint = new THREE.Color(cultKit.street.colour);
      for (const lane of streetLanes(plan, {
        cx, cz, terrain,
        // a street stops at the water and picks up on the far side, as a road does at a sea lane
        skip: (x, z) => terrain.underwater(x, z) || terrain.riverAt(x, z) > 0.3,
      })) {
        pushRibbon(streets, laneRibbon(lane, { lift: 0.12, color: [tint.r, tint.g, tint.b] }));
      }
    }
```

### A5 — build it, upload it, and let it be hidden

In `buildInstances`, find:

```js
  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts, px, pz);
    }
```

Replace with:

```js
  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();
    const streets = { position: [], normal: [], color: [], index: [] };

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts, px, pz, streets);
    }
```

…and at the very end of the same function, find:

```js
    for (const key of BUILDING_KEYS) {
      const mesh = instanced[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
```

Replace with:

```js
    for (const key of BUILDING_KEYS) {
      const mesh = instanced[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // the streets, as one ribbon mesh — see the note in buildSettlement
    streetMesh.geometry.dispose();
    const sg = new THREE.BufferGeometry();
    if (streets.position.length) {
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(streets.position), 3));
      sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(streets.normal), 3));
      sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(streets.color), 3));
      sg.setIndex(streets.index);
    }
    streetMesh.geometry = sg;
    streetMesh.visible = visible && streets.position.length > 0;
  }
```

### A6 — export it

Find:

```js
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, solids,
```

Replace with:

```js
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, streetMesh, solids,
```

### A7 — leftovers, deliberately left

`BUILDINGS.street` and `BUILDING_INFO.street` stay where they are. Nothing places one any more, so
the instanced mesh sits at count 0 and costs a draw call of nothing. Deleting them means touching
`BUILDING_KEYS`, the caps table and whatever tests read them, and that is a tidy-up rather than a
fix — worth doing in a later round, not worth risking in this one.

---

## B — `js/main.js`: the deliveries and the away clock

### B1 — imports

Find:

```js
import { createStoreNetwork } from './stores.js';
```

Replace with:

```js
import { createStoreNetwork } from './stores.js';
import { createLogistics, createAwayClock } from './logistics.js';
```

### B2 — build the two of them, after build mode exists

`createLogistics` wants `build.roads`, so it has to come after `createBuild(…)`. Find the comment
that opens the build panel, immediately after the `});` that closes `createBuild`:

```js
  /**
   * The panel that answers the question. B puts it up with the ghost.
```

Insert **before** it:

```js
  /**
   * ROUND 14 — GOODS THAT TAKE TIME TO ARRIVE.
   *
   * *"I would like to slap down a drill at a remote deposit, connect it to the power grid and
   * storage, and send the output back to my base using a travel route. Resources should take time to
   * move unless in the immediate vicinity."*
   *
   * Inside one storage pool nothing moves and nothing is charged — that is js/stores.js's rule and
   * it is unchanged. Between two pools a load leaves one and arrives at the other on a real clock,
   * timed by the ground a hauler can actually walk (js/haulpath.js) and cut sharply by how much of
   * that ground is a road you laid. `build.roads` is the book of those roads.
   */
  const logistics = createLogistics({
    stores,
    terrain,
    roads: build.roads,
    power: powerData,
    materials: resourceData?.materials || {},
    log: (t) => hud.log(t, ''),
  });

  /**
   * …and the base keeps working when you are not on the planet.
   *
   * *"Production and manufacturing should continue even if you leave a planet."* The clock is
   * stamped on the way out and run forward on the way back, capped at six hours so a weekend away is
   * not a mountain of iron. The grid is in the list because without it the generators would run for
   * six hours on no fuel at all.
   */
  const away = createAwayClock({
    works, logistics, stores, grid,
    materials: resourceData?.materials || {},
  });
```

If `powerData` / `resourceData` are named something else where `stores` is created, use those names —
they are the parsed `data/power.json` and `data/resources.json`.

### B3 — tick it

Find:

```js
    works.tick(dt);
```

Replace with:

```js
    works.tick(dt);
    // the carts on the road between your outposts and your base — js/logistics.js
    for (const got of logistics.tick(dt).arrived) {
      hud.log(`${got.n} ${got.name.toLowerCase()} arrived at ${got.to}.`, 'good');
    }
```

### B4 — save it

Find:

```js
      works: works.toJSON(),
```

Replace with:

```js
      works: works.toJSON(),
      // round 14 — loads on the road, the standing orders behind them, and when you left
      logistics: logistics.toJSON(),
      away: away.toJSON(),
```

### B5 — load it, and say what happened while you were gone

Find:

```js
  if (save?.works) works.load(save.works);
```

Replace with:

```js
  if (save?.works) works.load(save.works);
  /**
   * ROUND 14 — THE WORKS KEPT RUNNING.
   *
   * The stamp has to be loaded before the catch-up is asked for, and the catch-up has to happen
   * after the stores, the grid and the works are all back — otherwise it runs a base that is still
   * half empty and produces nothing. `resume()` re-stamps the clock itself, so this is safe to run
   * more than once.
   */
  if (save?.logistics) logistics.load(save.logistics);
  if (save?.away) {
    away.load(save.away);
    const back = away.resume();
    if (back.text) hud.log(back.text, 'level');
  }
```

`logistics` and `away` are created further down the file than this load block, so one of the two has
to move. The smaller move is to lift the `const logistics` / `const away` pair from B2 up to just
after `works` is created, and pass `roads: () => build.roads` — **except** that `createLogistics`
reads `roads` once. So the straightforward version is: leave B2 where it is, and put this load block
immediately after B2 instead of here, hoisting the `save?.works` line with it if the ordering note
above still holds. Either is fine; what must not happen is `resume()` running before the stores are
loaded.

### B6 — stamp the clock when the player leaves the planet

Find wherever take-off out of the atmosphere is committed (`js/atmos.js`'s hand-off, or the warp
start in `js/warp.js`'s caller) and add:

```js
  away.mark();
```

…and on landing, or on arriving back in the system:

```js
  const back = away.resume();
  if (back.text) hud.log(back.text, 'level');
```

If there is no single obvious place, stamping on every save and resuming on every load (B4/B5) alone
already covers the common case, because leaving a planet saves.

### B7 — the Route tool should also make a standing order

`onRoute` currently only lays a mining route. When the player clicks two STORES rather than a drill
and a store, it says "that is not a store" about the wrong end. Find:

```js
    onRoute: (from, to) => {
      const pool = stores.poolAt(to.x, to.z);
      if (!pool) return { ok: false, why: `${to.name} is not a store. A route ends somewhere that holds things.` };
      const out = mining.route(from.id, pool.id);
      if (out.ok) drawRoutes();
      return out;
    },
```

Replace with:

```js
    onRoute: (from, to) => {
      const pool = stores.poolAt(to.x, to.z);
      if (!pool) return { ok: false, why: `${to.name} is not a store. A route ends somewhere that holds things.` };
      /**
       * ROUND 14 — TWO STORES IS A SUPPLY LINE, NOT A MISTAKE.
       *
       * Clicking a drill and then a store lays a mining route, as it always has. Clicking a STORE and
       * then a store is the thing the user asked for — *"send the output back to my base using a
       * travel route"* — and it used to be refused for the wrong reason, because `mining.route`
       * cannot bind something that is not a drill.
       */
      const fromPool = stores.poolAt(from.x, from.z);
      if (fromPool && fromPool.id !== pool.id && !mining.overview().some(r => r.id === from.id)) {
        const made = logistics.link(fromPool.id, pool.id);
        if (!made.ok) return made;
        hud.log(`${fromPool.name} now sends what it piles up to ${pool.name}. ${made.quote.text}`, 'good');
        return { ok: true };
      }
      const out = mining.route(from.id, pool.id);
      if (out.ok) drawRoutes();
      return out;
    },
```

### B8 — one line for the outposts, if you want it on screen

`build.outposts()` returns the groups worked out from the geometry — id, name, role, centre,
member count. `outpostLines(posts, { x, z })` in `js/outposts.js` turns them into one string each. A
list of them belongs in the build panel or the journal; nothing in my files draws it, and nothing
breaks without it.

---

## C — things I changed that are worth knowing about

* **`data/structures.json`** — `claim_stone` is renamed **Outpost Marker**, costs 12 stone (it cost
  two iron ingots, which was the deadlock), and permits nothing. `loom` costs fibre instead of rope.
  `alloy_forge` costs iron and block instead of steel and machine parts.
* **`data/refining.json`** — new recipe `forge_rough_part` on the alloy forge, because nothing in the
  game could make a machine part without an assembler and an assembler costs ten of them.
* **`data/power.json`** — new `travel` block: `roadFactor`, `minSeconds`, `maxMetres`, `batch`,
  `loadCap`. This is the tuning file for delivery times.
* **`js/terraform.js`** — `strip()` takes `caps: false`, which turns off the rounded ends. A chain of
  strips levelling a road needs it; nothing else uses it and the default is unchanged.
* **`js/buildplan.js`** — anything 30 cm tall or less now levels under itself when it is placed, to
  the MEAN height under its footprint rather than the height at its middle.
* **`js/build.js`** — `build.roads` (the lane book), `build.lanes`, `build.outposts()`. The save it
  writes gained a `roads` key; a save without one still loads.

---

## D — one line of prose I did not own

`README.md` line 531 still reads:

> 2. Put down a **Claim Stone**. The ground is yours; a raid comes for this.

It is the "starting a base" list, and it is now wrong in the way that led the user into the deadlock.
`README.md` was being edited by the other agent this round, so I left it alone. Suggested replacement:

```md
2. Put down a **Furnace** and a **Storage Crate**. You can build anywhere — there is no permit. An
   **Outpost Marker** is optional and only names the place; a raid comes for whatever you have built.
```

The same list in `BUILD-MODE.md` §0 has already been corrected.
