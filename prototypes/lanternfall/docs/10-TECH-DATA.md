# LANTERNFALL — 10: Tech, Data and Room Authoring

> How the code is laid out, how a frame runs, every data file and its shape, the room format an agent
> will use to build ~100 rooms, saves, settings, the playground integrations, tests and debug tools.

This page is the spec for the codebase in `prototypes/lanternfall/`. The cell world and renderer are
`06-PHYSICS-RENDER.md`; this page names their modules but does not repeat their rules. Game numbers
(damage, oil, prices, HP) belong to the content pages (`03`, `04`, `05`, `08`, `09`); where this page shows a
number inside an example JSON it is **an example of the shape**, and the content page wins.

## Contents

1. [Principles](#1-principles)
2. [Folder layout](#2-folder-layout)
3. [Modules and their public functions](#3-modules-and-their-public-functions)
4. [Main loop, game state, event bus, random numbers](#4-main-loop-game-state-event-bus-random-numbers)
5. [Data files and schemas](#5-data-files-and-schemas)
6. [The room authoring format](#6-the-room-authoring-format)
7. [Save format](#7-save-format)
8. [Settings](#8-settings)
9. [Testing plan](#9-testing-plan)
10. [Playground integration (Lingo, voices, meter, sound)](#10-playground-integration-lingo-voices-meter-sound)
11. [Debug tools](#11-debug-tools)
12. [Paths, serving and publishing](#12-paths-serving-and-publishing)
13. [Milestone 1 checklist for this page](#13-milestone-1-checklist-for-this-page)
14. [Proposed canon changes](#14-proposed-canon-changes)

---

## 1. Principles

1. **No build step.** Plain HTML, standalone `.css` files, ES modules (`<script type="module">`). No npm
   packages at runtime. (Playground convention 2.)
2. **The simulation has no DOM.** Everything under `js/core`, `js/world`, `js/entities`, `js/spells`,
   `js/rpg`, `js/ai` and `js/modes` must import and run in Node 20 with no browser globals. Only `js/render`,
   `js/ui`, `js/audio`, `js/debug` and `js/main.js` may touch `window`, `document`, WebGL or WebAudio. A unit
   test enforces this (§9.1 `purity.test.js`).
3. **Data first.** Every tunable number, name and list is in `data/*.json` or `rooms/**.json`. Code reads
   ids, never hard-codes a monster or a charm. (Convention 7.)
4. **Same input, same result.** The sim runs at a fixed 60 Hz, all gameplay randomness comes from seeded
   streams (§4.4), and player input is recorded as per-tick intents. A recorded run replays exactly. This is
   what makes the balance sim, the Playwright room scripts and the Daily Wick possible.
5. **Relative paths only.** The site lives under `/Game-Playground/` on GitHub Pages; a path starting with
   `/` breaks there. §12.
6. **No third-party IP** in anything the player sees (convention 9).
7. **One writer per thing.** Cells are only written through `grid.set/swap` (`06` §2.3); save data only
   through `save/save.js`; settings only through `save/settings.js`; sounds only through `audio/sfx-bridge.js`.

---

## 2. Folder layout

```
prototypes/lanternfall/
├── index.html                 title screen + game canvas + DOM HUD root
├── editor.html                room editor-lite (§11.5)
├── README.md                  what this prototype tests, what worked, what didn't (playground rule)
├── css/
│   ├── base.css               fonts (Cinzel, Spectral), colours as CSS variables, layout
│   ├── hud.css                in-game HUD (02-CONTROLS-UI.md)
│   ├── menus.css              title, pause, inventory, wick builder, map, shops, settings
│   └── debug.css              overlay, inspector, editor
├── docs/                      this design bible (00–10, CHANGELOG.md, research-*.md)
├── js/
│   ├── main.js                boot: load data, pick renderer, build Game, start loop, route screens
│   ├── core/                  loop, tick order, bus, rng, input, data loader, math, ids
│   ├── world/                 cell grid and everything in 06 (materials → rooms → rain)
│   ├── render/                WebGL2 renderer, Canvas2D fallback, shaders, camera, particles draw
│   ├── entities/              entity base, player, physics, projectiles, pickups, prefabs, wiring
│   ├── spells/                wick compiler, casting, shapes, flames, charms, knots, overcharge, burn-in
│   ├── rpg/                   stats, damage, statuses, levels, skills, items, affixes, loot, shops
│   ├── ai/                    brains, behaviours, boss scripts, wave director
│   ├── modes/                 campaign, act map, waves, endless, daily, boss rush, trials
│   ├── ui/                    HUD, menus, wick builder, inventory, map, shops, dialogue, ledger
│   ├── audio/                 sfx bridge, voice bridge, music/ambience director
│   ├── talk/                  Lingo bridge, speakers, barks, conversations
│   ├── save/                  save slots, migrations, settings, profile
│   └── debug/                 window.lanternfall API, overlay, inspector, spawn menu, editor
├── data/                      every JSON file in §5
├── rooms/
│   ├── index.json             list of every room: id → file, act, kind, size
│   ├── _template.json         the blank room an agent copies (§6.10)
│   ├── bench/                 benchmark rooms (06 §21)
│   ├── test/                  tiny rooms used by unit + Playwright tests
│   ├── act1/ … act6/          campaign rooms
│   ├── trials/                trial rooms
│   ├── waves/                 Floodgate arenas
│   └── endless/               Long Descent chunk-rooms (room pieces stitched by modes/endless.js)
├── assets/
│   ├── sprites/               generated at load from data/sprites.json; only hand-made PNGs live here
│   └── fonts/                 nothing yet (the 5×7 font is drawn in code; Cinzel/Spectral from Google Fonts)
├── tests/
│   ├── unit/*.test.js         node --test
│   ├── fixtures/              saves/v1.json…, rooms, recorded inputs
│   └── e2e/*.spec.js          Playwright
└── tools/
    ├── room-check.mjs         validate every room (§6.11)
    ├── room-thumbs.mjs        render every room to PNG + a contact sheet (§6.11)
    ├── room-new.mjs           scaffold a room from the template (§6.10)
    ├── sim-lanternfall.mjs    headless balance sim (§9.3)
    ├── wick-rank.mjs          damage-per-oil ranking of every wick (§9.3)
    ├── data-check.mjs         validate every data file against §5 (cross-references too)
    └── bench.mjs              run the benchmark room headless and print the report (§9.4)
```

The prototype registers in the playground the normal way (a card in the root `index.html`, a row in
`~/claude/playground/CLAUDE.md`'s prototype table, a line in `~/claude/docs/playground.md`), and its unit
tests are added to the root `package.json` `test:unit` glob as `prototypes/lanternfall/tests/unit/*.test.js`.

---

## 3. Modules and their public functions

Only the public surface is listed; helpers stay private to their file. "Pure" = no DOM, runs in Node.

### 3.1 `js/core/` (pure)

| File | Responsibility | Public |
|---|---|---|
| `loop.js` | fixed-step loop with render interpolation (§4.1). The only file that calls `requestAnimationFrame` — injected, so Node tests drive it by hand | `createLoop({ tick, render, raf, now })` → `{ start(), stop(), pause(on), setSpeed(x), stepOnce(), stats }` |
| `tick.js` | the tick order (`06` §4.1), calls each system in turn | `tickGame(game)` |
| `bus.js` | event bus (§4.3) | `createBus()` → `{ on(type, fn) → off, once, emit(type, payload), flush(), clear() }` |
| `rng.js` | seeded random streams (§4.4) | `createRng(seed)` → `{ next(), int(lo,hi), range(lo,hi), pick(arr), chance(p), weighted(list, key='w'), shuffle(arr), fork(name), state(), setState(s) }`, `hashSeed(...parts)` |
| `data.js` | loads and indexes every data file; resolves URLs relative to this module | `loadData(base?)` → `Data` object (§5.0); `dataUrl(file)` |
| `input.js` | raw keyboard/mouse/gamepad → per-tick `Intent` objects; rebinding table | `createInput(bindings)` → `{ poll() → Intent, bind(action, code), bindings(), record(on), replay(list) }` (DOM listeners attached by `main.js`, so the module stays pure) |
| `math.js` | vectors, clamps, easing, AABB helpers | `clamp, lerp, v2, aabbOverlap, smoothDamp, …` |
| `ids.js` | id helpers and checks | `isId(s)` (snake_case), `uid(prefix)` (deterministic counter per game) |
| `state.js` | builds a fresh `Game` object (§4.2) | `createGame({ data, mode, seed, save })` |

### 3.2 `js/world/` (pure) — the rules are in `06-PHYSICS-RENDER.md`

| File | Responsibility | Public |
|---|---|---|
| `materials.js` | JSON → typed lookup tables (`06` §5.3) | `buildMaterials(json)` → `Mats`; `M` (id constants: `M.AIR`, `M.STONE`…), `CLS` |
| `grid.js` | the cell arrays and the only writers | `createGrid(W, H, mats)` (API in `06` §2.3) |
| `chunks.js` | waking, dirty rects, sim window, slow lane | `createChunks(grid)`; `chunks.touch(x,y)`, `beginTick(view)`, `endTick()`, `forEachActive(fn)`, `stats()` |
| `cellsim.js` | pass A (powders, liquids) and pass B (gases, fire) | `stepCells(world, tick)` |
| `thermal.js` | heat diffusion + state changes + reactions | `stepThermal(world, tick)` |
| `elements.js` | what a flame does to cells | `applyElement(world, x, y, r, flame, power, owner)` |
| `liquids.js` | equaliser, basins, surfaces, shock | `stepLiquids(world, tick)`, `surfaceAt(x, y)`, `surfaceSpans(chunk)`, `electrify(i)`, `createBasin(spec)`, `release(region, rows)` |
| `support.js` | island / span / hang checks, budgeted | `createSupport(world)` → `{ queue(i), process(budget) }` |
| `fragments.js` | falling rigid pieces, landing, crush, powderise fallback | `createFragments(world)` → `{ list, step(dt), detach(cells), powderise(cells) }` |
| `explode.js` | carve, throw liquid, debris, events | `explode(world, x, y, r, power, opts)` |
| `raycast.js` | grid ray march (DDA) | `raycast(grid, x0, y0, x1, y1, stopFn)` → `{ hit, x, y, i, mat, dist }` |
| `rain.js` | near rain, drips, deposits, sky columns | `createRain(world, spec)` → `{ step(view), setDensity(d), findDripPoints(chunk) }` |
| `collide.js` | entity vs grid (`06` §12) | `moveBox(world, box, dx, dy, opts)` → `{ hitX, hitY, grounded, steppedUp }`, `depenetrate(world, box)`, `sampleBox(world, box)` → fractions |
| `lightquery.js` | CPU light estimate for gameplay | `lightAt(world, lights, x, y)` |
| `roomload.js` | compile a room file into a world (§6.9) | `compileRoom(roomJson, data, { seed })` → `{ grid, things, wires, basins, meta }` |
| `decor.js` | the procedural decorator (§6.7) | `decorate(grid, spec, rng)` |
| `world.js` | ties the above into one `World` object | `createWorld(compiled, data)` → `World` |

### 3.3 `js/render/` (browser)

| File | Responsibility | Public |
|---|---|---|
| `renderer.js` | picks WebGL2 or Canvas2D, owns the canvas | `createRenderer(canvas, { prefer })` → `{ kind, resize(), draw(game, alpha), dispose(), stats }` |
| `gl.js` | WebGL2 helpers: programs, targets, textures, context loss | `createGL(canvas)`, `program(gl, shaderModule)`, `target(gl, w, h, fmt)` |
| `webgl2.js` | the pass list in `06` §16 | `createWebGL2Renderer(gl)` |
| `canvas2d.js` | fallback (`06` §17) | `createCanvas2DRenderer(ctx)` |
| `celltex.js` | dirty-chunk packing + upload | `uploadDirty(gl, tex, world, view, budget)` |
| `palette.js` | material ramps → palette texture / Uint32 table | `buildPalette(mats)` |
| `backdrops.js` | per-act parallax layers from seed | `buildBackdrops(act, seed)` |
| `lights.js` | gather lights, aggregate fire | `collectLights(game)` → array |
| `water.js` | ripple buffers | `createRipples()` → `{ impulse(x, a), step(), texture data }` |
| `particles.js` | particle pool (sim half is pure, draw half here) | `createParticles(cap)` → `{ spawn(kind, …), step(world), draw(r) }` (the pool itself lives in `js/entities/particles-sim.js`, pure) |
| `sprites.js` | ASCII sprite data → atlas | `buildAtlas(spritesJson)` → `{ tex, rect(id, frame) }` |
| `camera.js` | follow, bounds, shake, scale (`06` §19) | `createCamera()` → `{ update(target, room, dt), shake(t), view, scale, alpha-interpolated pos }` |
| `font5x7.js` | the pixel font, drawn in code | `drawText(target, text, x, y, color)`, `measure(text)` |
| `shaders/*.js` | one GLSL program per file (`06` §16.11) | `export default { vert, frag, uniforms }` |

### 3.4 `js/entities/` (pure)

| File | Responsibility | Public |
|---|---|---|
| `entity.js` | base record + registry, prev/cur positions for interpolation | `createEntity(kind, props)`, `EntityList` (`add, remove, byId, near(x,y,r), each(kind, fn)`) |
| `physics.js` | gravity, `moveBox`, swimming/steam/web effects | `stepBody(world, e, dt)` |
| `player.js` | intent → movement, jump buffer + coyote time, wick slots, melee, interact | `createPlayer(save, data)`, `stepPlayer(game, intent)` |
| `projectiles.js` | spell projectiles (owned by spell shapes, moved here) | `spawnProjectile(game, spec)`, `stepProjectiles(game)` |
| `pickups.js` | pennies, pearls, oil flasks, items, scrap | `spawnPickup(game, kind, x, y, props)` |
| `particles-sim.js` | the pure particle pool | `createParticlePool(cap)` |
| `rope.js` | grapple ropes as verlet chains (`07-TRAVERSAL-PUZZLES.md`) | `createRope(game, a, b)`, `stepRopes(game)` |
| `prefabs/*.js` | one file per thing type (§6.5): `lever.js`, `button.js`, `plate.js`, `door.js`, `sluice.js`, `lamp_post.js`, `great_lamp.js`, `chest.js`, `sign.js`, `grapple_point.js`, `gravity_lantern.js`, `bell.js`, `spike.js`, `drip.js`, `light.js`, `zone.js`, `timer.js`, `exit.js`, `spawner.js`, `npc.js`, `shopkeeper.js`, `camzone.js`, `scrap.js`, `crate.js`, `oil_barrel.js` | each exports `{ type, create(game, spec), step(game, self), onSignal(game, self, action, value), interact?(game, self, who), save(self), load(self, data) }` |
| `prefabs/index.js` | registry | `PREFABS[type]`, `spawnThing(game, spec)` |
| `wiring.js` | signal graph (§6.6) | `createWiring(things, wires)` → `{ emit(fromId, value), step(), state() }` |

### 3.5 `js/spells/` (pure) — rules in `03-SPELLS.md`

| File | Responsibility | Public |
|---|---|---|
| `wick.js` | **compile** a wick (flame + shape + charms + knot + burn-in + overcharge) into a flat `CastPlan` of numbers | `compileWick(wick, hero, data)` → `CastPlan`; `validateWick(wick, unlocks)` → `null` or a reason string |
| `cast.js` | start/hold/release, oil spend, overcharge, gutter roll | `beginCast(game, caster, slot)`, `holdCast(…)`, `releaseCast(…)` |
| `shapes/{bolt,arc,lob,beam,ring,rune,wave,tether}.js` | one file per shape | `{ spawn(game, plan, caster, aim), step(game, obj), hit(game, obj, target) }` |
| `flames.js` | per-flame hit effects on entities (statuses) | `applyFlameHit(game, plan, target)` |
| `charms.js` | charm hooks | `CHARM_HOOKS[id] = { onCompile, onSpawn, onHit, onExpire }` |
| `knots.js` | trigger a child wick | `KNOT_HOOKS[id]` |
| `burnin.js` | wick XP and levels 1–5 | `addBurnXp(wick, amount)`, `burnLevel(wick)` |
| `names.js` | Odile's spell names (`shop_wick` quirk) — Lingo template driven | `nameWick(wick, lingo)` |

### 3.6 `js/rpg/` (pure) — numbers in `04` and `08`

| File | Public |
|---|---|
| `stats.js` | `deriveStats(hero, data)` → `{ maxHp, maxOil, oilRegen, spellPower, meleePower, crit, critDmg, armour, resist{flame}, moveSpeed, knack… }` (formulas from `04-CLASSES-PROGRESSION.md`) |
| `damage.js` | `dealDamage(game, { source, target, amount, flame, via, crit, tags })` → record; the single place damage happens; writes to the meter (§10.3) |
| `status.js` | `applyStatus(game, target, id, stacks, dur, source)`, `stepStatuses(game)` |
| `levels.js` | `xpToNext(level)`, `grantXp(hero, n)` → level-ups |
| `skills.js` | `canTake(hero, nodeId)`, `take(hero, nodeId)`, `skillEffects(hero)` |
| `items.js` | `rollItem(data, { base, level, rarity, rng })`, `itemScore(item)`, `equip(hero, item, slot)` |
| `affixes.js` | `rollAffixes(item, data, rng)`, `affixText(affix)` |
| `loot.js` | `rollLoot(table, level, rng)` |
| `shops.js` | `stockFor(shopId, ctx, rng)`, `priceOf(item, shop, ctx)`, `sell(…)`, `buy(…)` + one quirk hook per shop id |
| `currency.js` | `give(hero, cur, n)`, `spend(hero, cur, n)` → bool |

### 3.7 `js/ai/` (pure) — behaviour in `05-BESTIARY-BOSSES.md`

| File | Public |
|---|---|
| `brain.js` | `createBrain(enemyDef)`, `thinkAndAct(game, enemy)`; a small state machine: `idle → alert → chase → attack → recover`, with `flee`, `hide_in_dark`, `swim`, `swarm` hooks |
| `senses.js` | `canSee(game, e, target)` (raycast + `lightAt`), `canHear(game, e, event)` |
| `nav.js` | coarse walk graph per room (8 × 8 blocks), jump links, `path(from, to)` |
| `behaviours/*.js` | one file per behaviour id used in `enemies.json` (`melee_rush`, `ranged_kite`, `swim_ambush`, `ceiling_drop`, `swarm`, `burrow`, `lantern_snuff`, …) |
| `bosses/{tallow,gnaw,sluicemaw,widow,bellfather,ossery}.js` | phase scripts reading `bosses.json` |
| `director.js` | waves for `waves` and `endless` (reads `waves.json`) |

### 3.8 `js/modes/` (pure)

| File | Public |
|---|---|
| `campaign.js` | `startCampaign(save)`, `enterRoom(game, roomId, entryId)`, `onGreatLampLit(game, act)` |
| `actmap.js` | `actGraph(act, data)`, `reveal(node)`, `canTravel(a, b)` (`09-MODES-MAP.md`) |
| `waves.js` | Floodgate: `startWaves(game, arenaId)`, water-rise schedule |
| `endless.js` | Long Descent: stitches `rooms/endless/*` pieces by seed, flood chase |
| `daily.js` | `dailySeed(dateISO)` = `hashSeed('daily', 'YYYY-MM-DD')`, fixed class + wick from `trials.json` `daily` table |
| `bossrush.js`, `trials.js` | the other modes |

### 3.9 `js/ui/`, `js/audio/`, `js/talk/`, `js/save/`, `js/debug/`

| File | Responsibility |
|---|---|
| `ui/screens.js` | screen router: `title`, `class_select`, `game`, `pause`, `inventory`, `wick_builder`, `map`, `shop`, `dialogue`, `ledger`, `settings`, `results` |
| `ui/hud.js` | HP, oil, wick slots, charm icons, minimap (layout in `02-CONTROLS-UI.md`) |
| `ui/wickbuilder.js`, `ui/inventory.js`, `ui/map.js`, `ui/shop.js`, `ui/dialogue.js`, `ui/ledger.js`, `ui/settings.js`, `ui/tooltips.js` | one per screen; tooltips use `shared/tooltip.js` (`installTooltips()` once, `data-tip-render`) and numbers use `shared/format.js` |
| `audio/sfx-bridge.js` | bus events → `Sfx` ids (§10.4) |
| `audio/voice-bridge.js` | speech lines → voice-lab `say()` with a per-speaker voice (§10.2) |
| `audio/music.js` | ambience loops per room/act, rain loudness |
| `talk/lingo-bridge.js` | loads Lingo + the pack, builds speakers, `speak(intent, ctx)` (§10.1) |
| `talk/barks.js` | throttled combat barks (max 1 per 4 s per speaker, 1 per 1.5 s globally) |
| `save/save.js`, `save/migrations.js`, `save/settings.js`, `save/profile.js` | §7, §8 |
| `debug/api.js`, `debug/overlay.js`, `debug/inspector.js`, `debug/spawn.js`, `debug/editor.js` | §11 |

---

## 4. Main loop, game state, event bus, random numbers

### 4.1 The loop

```js
// js/core/loop.js — fixed 60 Hz simulation, render every animation frame with interpolation
export function createLoop({ tick, render, raf = requestAnimationFrame, now = () => performance.now() }) {
  const STEP = 1 / 60, MAX_STEPS = 5;
  let acc = 0, last = 0, running = false, paused = false, speed = 1;
  const stats = { steps: 0, slowFrames: 0, simMs: 0, frameMs: 0 };
  function frame(t) {
    if (!running) return;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : STEP; last = t;
    if (!paused) acc += dt * speed;
    let n = 0; const s0 = now();
    while (acc >= STEP && n < MAX_STEPS) { tick(); acc -= STEP; n++; }
    if (n === MAX_STEPS && acc >= STEP) { acc = 0; stats.slowFrames++; }  // slow down, never spiral
    stats.simMs = now() - s0; stats.steps = n;
    render(paused ? 1 : acc / STEP);           // alpha 0..1 between the last two ticks
    stats.frameMs = dt * 1000;
    raf(frame);
  }
  return {
    start() { running = true; last = 0; raf(frame); }, stop() { running = false; },
    pause(on) { paused = on; }, setSpeed(x) { speed = x; },  // debug: 0.25 / 0.5 / 1 / 2 / 4
    stepOnce() { tick(); render(1); }, stats,
  };
}
```

- **Interpolation:** every entity keeps `px, py` (position at the start of the last tick) and `x, y`. The
  renderer draws `lerp(px, x, alpha)`. The camera does the same. Cells, particles and fragments are **not**
  interpolated (they move in whole cells; particles are fine at tick rate).
- **Pause** stops ticks but keeps rendering (menus over a live, still frame).
- **Hidden tab:** on `visibilitychange` hidden → pause; the 0.25 s `dt` clamp stops a burst on return.
- **Hit-stop** (a few frozen frames on big hits, `03`/`05`) is implemented as `game.freezeTicks`: `tick()`
  returns early while it is > 0, except for particles and the camera.

### 4.2 The `Game` object (one per run; pure data + systems)

```js
game = {
  data,                     // §5, read-only
  mode: 'campaign',         // canon mode id
  seed, tick: 0, freezeTicks: 0, speed: 1,
  rng: { world, loot, ai, spell, room, fx, talk },   // §4.4
  bus,                      // §4.3
  room: { id, meta, world, things, wiring, basins, rain, lights, camzones, exits, state },
  entities,                 // EntityList: player, enemies, npcs, projectiles, pickups
  player,                   // shortcut into entities
  hero,                     // persistent character: class, level, attrs, wicks, items (saved)
  run,                      // per-run: pennies picked up, kills, time, ledger meter
  meter,                    // meters/js/meter.js instance (§10.3)
  talk,                     // lingo bridge (optional in Node tests: a stub that returns '')
  input: { intent },        // this tick's Intent
  flags: {},                // story flags
  perf: {},                 // timings, filled by loop + world
}
```

`createGame` builds it; `tickGame(game)` advances it; nothing else mutates it outside the tick except UI
actions, which go through **commands** (`game.command({ type: 'equip', … })`) queued and applied at the start
of the next tick so saves, replays and UI stay consistent.

### 4.3 Event bus

Events are queued during the tick and delivered at `bus.flush()` (tick step 15, `06` §4.1), so a listener
never runs in the middle of a cell pass. `emit` is cheap (push to an array). Listeners are the UI, audio,
talk, meter bridge, achievements/challenges and the debug log. Gameplay systems **do not** listen to the bus
(they call each other directly); the bus is for *reactions*.

| Event | Payload | Main listeners |
|---|---|---|
| `room.enter` / `room.exit` | `{ roomId, entryId }` | music, talk (room comments), save (last room) |
| `lamp.post` | `{ id, roomId }` | save (autosave), heal, sfx |
| `lamp.great` | `{ act }` | story, ambient palette change, shops' prices |
| `cast.start` / `cast.release` / `cast.gutter` | `{ caster, wickId, plan, overcharge }` | sfx, hud, talk (Odile names spells) |
| `hit` | damage record (§10.3) | meter, sfx, damage numbers, barks |
| `kill` | `{ source, target, via, overkill }` | loot, xp, meter, challenges, barks |
| `status.apply` / `status.expire` | `{ target, id, stacks }` | sfx, hud |
| `player.hurt` / `player.die` / `player.respawn` | `{ amount, source }` | hud, camera shake, save |
| `explode` | `{ x, y, r, power, source }` | sfx, AI hearing, camera shake |
| `cell.ignite` (throttled: 1 per chunk per 0.5 s) | `{ x, y, mat }` | sfx (whoosh), talk |
| `water.shock` | `{ bodySize, x, y }` | sfx, barks |
| `fragment.land` | `{ x, y, mass, fallen }` | sfx (crash by mass), shake |
| `wire` | `{ from, to, action, value }` | sfx (lever clunk, door grind), debug |
| `door.open` / `door.close` / `sluice.level` | `{ id, value }` | sfx, hud objective text |
| `pickup` | `{ kind, item?, amount }` | sfx (`coin`, `loot.<rarity>`), hud |
| `levelup` | `{ level }` | sfx `levelup`, hud, talk |
| `unlock` | `{ kind: 'flame'|'shape'|'charm'|'knot'|'mechanic'|'class', id }` | hud banner, save, profile |
| `shop.buy` / `shop.sell` / `shop.haggle` | `{ shop, item, price, mood }` | talk, sfx, save |
| `talk.line` | `{ speakerId, text, speech, tags, x, y }` | voice bridge, speech bubble UI, subtitles |
| `boss.phase` / `boss.telegraph` / `boss.die` | `{ boss, phase, attack }` | music, talk, hud boss bar |
| `wave.start` / `wave.clear` | `{ n }` | hud, music |
| `challenge.progress` | `{ id, value }` | profile (class unlocks, `00` §7) |

Bus API: `on(type, fn)` returns an `off` function; `on('*', fn)` receives everything (debug log only).

### 4.4 Random numbers

We use **our own** `js/core/rng.js`, not `shared/ui.js` `rng()`, because saves and replays need
`state()`/`setState()` and named forks, which the shared helper does not offer. The algorithm is the same
(mulberry32), so a seed means the same thing across the playground.

| Stream | Seeded from | Used by | Saved? |
|---|---|---|---|
| `world` | `hashSeed(room.seed, tick)` each tick (xorshift in hot loops, `06` §4.4) | cell rules | no (derived) |
| `room` | `hashSeed(runSeed, roomId)` | decorator, spawner picks, endless stitching | no (derived) |
| `loot` | run seed | drops, shop stock, gambles | **yes** |
| `ai` | `hashSeed(runSeed, roomId, visit)` | enemy choices | no |
| `spell` | run seed | crit rolls, gutter rolls, split angles | **yes** |
| `talk` | run seed | Lingo line choice | yes |
| `fx` | `Math.random()` is allowed here only | cosmetic particles that never become cells, screen-shake noise | no |

Rule: **cosmetic randomness never draws from a gameplay stream**, so turning particles down cannot change
a fight's outcome.

---

## 5. Data files and schemas

### 5.0 Loading and validation

`core/data.js` fetches every file in the table below in parallel with
`fetch(new URL('../../data/<file>', import.meta.url))` (browser) or `readFile` (Node), then:

1. indexes each list by `id` (`data.enemies.byId.rat_choirboy`),
2. **validates** with the same checker `tools/data-check.mjs` uses: required fields, types, snake_case ids,
   no duplicate ids, every cross-reference resolves (a charm's `excludes` names real charms; a loot table's
   items exist; a room's enemy ids exist…),
3. freezes the result (`Object.freeze` deep) so nothing mutates data at runtime.

A failed validation in the browser shows a red boot panel listing every problem (not just the first), and
`window.lanternfall.dataErrors` holds them for tests.

Every file starts with `"_doc"` (a one-paragraph description for Claude and humans) and `"version"`.

| File | Owner page | Holds |
|---|---|---|
| `materials.json` | 06 | cell materials (§5.1) |
| `flames.json` | 03 | the 7 flames (§5.2) |
| `shapes.json` | 03 | the 8 shapes (§5.3) |
| `charms.json` | 03 | the 12 charms (§5.4) |
| `knots.json` | 03 | the 4 knots (§5.5) |
| `statuses.json` | 03, 05 | every status effect (§5.6) |
| `classes.json` | 04 | the 8 classes (§5.7) |
| `skills.json` | 04 | skill boards (§5.8) |
| `progression.json` | 04 | XP table, attribute formulas' constants (§5.9) |
| `enemies.json` | 05 | every monster and elite modifier (§5.10) |
| `bosses.json` | 05 | the 6 bosses, phases, attacks (§5.11) |
| `items.json` | 08 | item bases, uniques, consumables (§5.12) |
| `affixes.json` | 08 | affix pool (§5.13) |
| `loot.json` | 08 | loot tables (§5.14) |
| `shops.json` | 08 | the 8 shops (§5.15) |
| `acts.json` | 01, 09 | districts, ambient, grade, rain, act maps (§5.16) |
| `npcs.json` | 01 | named NPCs, speech + voice (§5.17) |
| `trials.json` | 09 | trials, daily config, challenges (§5.18) |
| `waves.json` | 09 | Floodgate waves + endless scaling (§5.19) |
| `prefabs.json` | 07 | defaults for every room thing type (§5.20) |
| `themes.json` | 06, 09 | room themes: background wall, parallax set, decor defaults (§5.21) |
| `legend.json` | 10 | default map characters (§6.3) |
| `sprites.json` | art | ASCII pixel sprites + palettes (§5.22) |
| `sfx-map.json` | 10 | game event → sfx catalog id (§10.4) |
| `strings.json` | 02 | fixed UI text (menu labels, tutorial prompts) (§5.23) |
| `../../lingo/data/packs/lanternfall.json` | 01 | Lingo lexicon pack (§5.24) |
| `grammar-lanternfall.json` | 01 | extra Lingo grammar intents (§5.24) |

### 5.1 `materials.json`

```json
{ "_doc": "Cell materials for the Lanternfall world. Rules: docs/06-PHYSICS-RENDER.md §5.", "version": 1,
  "list": [
    { "id": 22, "key": "water", "name": "Water", "cls": "liquid", "density": 10, "hp": 0, "flam": 0,
      "dispersion": 5, "repose": 1, "conduct": 0.25, "transmit": 0.8, "tint": "#99ccff",
      "boilAt": 100, "boilTo": "steam", "freezeAt": -5, "freezeTo": "ice",
      "support": "none", "span": 0, "emit": null, "absorb": 0.06, "reflect": 0.55,
      "resist": { "blast": 1, "cut": 1, "heat": 1, "acid": 1, "crush": 1 },
      "ramp": ["#0d1a2a", "#10213a", "#14294a"], "alpha": 1, "sheen": 0 }
  ] }
```

| Field | Type | Notes |
|---|---|---|
| `id` | int 0–255 | fixed forever (saves and room caches store numbers) |
| `key` | snake_case | the name code and rooms use |
| `cls` | `empty` `static` `powder` `liquid` `gas` `fire` | |
| `density`, `hp`, `flam`, `dispersion`, `repose`, `conduct`, `transmit` | numbers | meanings in `06` §5.2 |
| `meltAt/meltTo`, `freezeAt/freezeTo`, `boilAt/boilTo`, `igniteAt`, `burnRate`, `burnsTo` | optional | `burnsTo` is `[{ "to": "ember", "p": 0.3 }, …]` |
| `support` / `span` | `none` `island` `span` `hang` / int | `06` §10 |
| `lifeMin`, `lifeMax` | ticks | gases, fire |
| `emit` | `null` or `{ "color": "#hex", "power": 0.15 }` | emissive |
| `resist` | object of 5 kinds | multipliers, 0 = immune |
| `ramp` | 2–8 hex | albedo ramp |
| `alpha`, `sheen`, `absorb`, `reflect`, `tint` | render hints | `06` §15 |
| `brokenTo` | material key | fragment shatter / debris product |
| `climbable`, `slow`, `hurt` | optional | rope climb; web slow 0.35; `hurt: { "amount": 4, "every": 10, "flame": "ember" }` |

### 5.2 `flames.json`

```json
{ "id": "ember", "name": "Ember", "color": "#ff8a2a", "unlock": { "act": "start" },
  "status": { "id": "burn", "chance": 1.0, "stacks": 1, "duration": 3.0 },
  "cell": { "heat": 6, "ignite": true, "radiusBonus": 0 },
  "vs": { "wet": 0.5, "oily": 2.0, "unlit": 1.0 },
  "light": { "radius": 1.0, "intensity": 1.0 },
  "sfx": { "launch": "spell.fire.launch", "travel": "spell.fire.travel", "impact": "spell.fire.impact" },
  "meterType": "fire", "icon": "flame_ember", "desc": "Burns. Lights oil, wood and wax. Boils water to steam." }
```

`unlock.act` is `start` or an act id; `unlock.class` optional (Gleam starts with the Lamplighter). `vs` holds
multipliers against target tags. `cell` feeds `world/elements.js`. All numbers: `03-SPELLS.md`.

### 5.3 `shapes.json`

```json
{ "id": "bolt", "name": "Bolt", "unlock": { "act": "start" },
  "oil": 6, "cooldown": 0.35, "castTime": 0, "power": 1.0,
  "speed": 420, "range": 320, "size": [3, 2], "gravity": 0, "pierce": 0, "bounces": 0,
  "hold": false, "aoe": null, "lifetime": 0.9,
  "stopsOn": ["static", "powder"], "light": { "r": 28, "shadow": false },
  "charmsAllowed": "all", "desc": "A fast straight shot." }
```

Shape-specific blocks: `lob.gravity/bounces/fuse`, `beam.tickRate/width/oilPerSecond`, `ring.maxRadius/
growSpeed`, `rune.armTime/triggerRadius/maxPlaced`, `wave.climb/stepUp`, `tether.maxLength/ropeCells`.

### 5.4 `charms.json`

```json
{ "id": "split", "name": "Split", "unlock": { "act": "act2" }, "oilMult": 1.35,
  "mods": { "projectiles": 3, "spreadDeg": 18, "powerMult": 0.55 },
  "excludes": ["beam_only_example"], "shapes": ["bolt", "lob", "wave"], "tier": 1,
  "desc": "Casts three weaker copies in a fan." }
```

`mods` keys are read by `spells/charms.js` hooks; a key a hook does not know fails validation (no dead
data). `shapes` lists which shapes it can go on (or `"all"`).

### 5.5 `knots.json`

```json
{ "id": "on_hit", "name": "Knot: On Hit", "unlock": { "act": "act4" }, "oilMult": 1.2,
  "child": { "powerMult": 0.5, "oilMult": 0.4, "maxDepth": 1, "cooldown": 0.5 },
  "trigger": { "event": "hit", "chance": 1.0 }, "desc": "When this wick hits, it fires the tied wick from the hit point." }
```

### 5.6 `statuses.json`

```json
{ "id": "burn", "name": "Burning", "kind": "dot", "flame": "ember", "tickEvery": 0.5, "perTick": 0.08,
  "maxStacks": 5, "refresh": "add_duration", "cleansedBy": ["water", "tide", "rime"],
  "visual": { "tint": "#ff8a2a", "particles": "ember" }, "sfx": "status.burn.apply" }
```

`perTick` is a fraction of the source's spell power (formula in `03`). Kinds: `dot`, `slow`, `stun`, `mark`,
`shield`, `buff`, `debuff`, `special`.

### 5.7 `classes.json`

```json
{ "id": "lamplighter", "name": "Lamplighter", "role": "balanced caster-duelist",
  "unlock": { "default": true },
  "attrs": { "might": 5, "wick": 7, "draught": 7, "nerve": 5, "knack": 5 },
  "perLevel": { "attrPoints": 3, "skillPoints": 1 },
  "weapon": "pole_lantern", "startItems": ["pole_lantern", "oil_flask_small"],
  "startWicks": [ { "flame": "ember", "shape": "bolt", "charms": [] }, { "flame": "gleam", "shape": "ring", "charms": [] } ],
  "passives": [ { "id": "deep_reservoir", "stat": "maxOilPct", "value": 0.2 } ],
  "skillBoard": "board_lamplighter", "voiceRole": "villager", "sprite": "hero_lamplighter" }
```

Locked classes carry `"unlock": { "challenge": "ferry_sluicemaw_water" }` pointing into `trials.json`
`challenges`.

### 5.8 `skills.json`

```json
{ "boards": [ { "id": "board_lamplighter", "class": "lamplighter",
   "nodes": [ { "id": "ll_steady_hand", "name": "Steady Hand", "pos": [2, 0], "cost": 1, "max": 3,
                "requires": [], "effect": { "stat": "overchargeSafePct", "perRank": 0.05 },
                "desc": "Your wicks can take {value} more overcharge before they risk guttering." } ] } ] }
```

`pos` is the node's grid spot on the board UI (`02`); `requires` are node ids; `effect` is a stat
modifier or `{ "grant": "…" }`.

### 5.9 `progression.json`

```json
{ "levelCap": 30, "xpTable": [0, 100, 240, 420, 650],
  "attrFormulas": { "maxHp": { "base": 60, "perNerve": 8, "perLevel": 4 } },
  "respecCost": { "pennies": 200, "maxHp": 5 }, "burnIn": { "levels": [0, 200, 600, 1400, 3000], "powerPerLevel": 0.06 } }
```

`xpTable` must have `levelCap` entries; `burnIn.powerPerLevel` is canon (+6%, `00` §8).

### 5.10 `enemies.json`

```json
{ "enemies": [
  { "id": "wax_mite", "name": "Wax Mite", "act": ["act1"], "family": "wax", "tags": ["small", "flammable"],
    "size": [5, 4], "hp": 14, "armour": 0, "speed": 40, "stepUp": 2, "jump": 18, "swim": false,
    "resist": { "ember": 1.5, "rime": 0.5 }, "xp": 6, "loot": "loot_small_a1",
    "behaviour": "melee_rush", "senses": { "sight": 140, "hearing": 200, "needsLight": false },
    "attacks": [ { "id": "nip", "damage": 4, "range": 6, "windup": 0.35, "cooldown": 1.2, "telegraph": "flash" } ],
    "onDeath": { "cells": [ { "mat": "molten_wax", "count": 12 } ], "sfx": "death.beast" },
    "light": { "eyes": "#ffcc66" }, "sprite": "en_wax_mite", "voice": { "role": "goblin", "babble": true },
    "barks": "bark_wax" } ],
  "elites": [ { "id": "elite_guttering", "name": "Guttering", "hpMult": 2.2, "adds": { "aura": "dim_light" } } ] }
```

`onDeath.cells` spills cells (Tallow's wax, ichor for the drowned). `senses.needsLight` true means it can't see
the player in darkness (`06` §14.7). `telegraph` values: `flash`, `line`, `circle`, `cone`, `ground`.

### 5.11 `bosses.json`

```json
{ "id": "boss_tallow", "name": "Mother Tallow", "act": "act1", "room": "a1_chapel_boss",
  "hp": 1400, "size": [48, 96], "script": "tallow", "music": "boss_tallow",
  "phases": [
    { "n": 1, "until": 0.66, "attacks": ["drip_rain", "wick_lash", "wax_wave"], "voidZones": ["molten_pool"] },
    { "n": 2, "until": 0.33, "attacks": ["drip_rain", "tallow_slam", "wick_lash"], "arena": { "op": "melt_floor", "rows": 2 } },
    { "n": 3, "until": 0, "attacks": ["candle_rain", "tallow_slam", "wax_wave"], "enrage": 1.25 } ],
  "attacks": { "wax_wave": { "damage": 18, "telegraph": "ground", "windup": 0.9, "cells": { "mat": "molten_wax", "count": 180 } } },
  "voidZones": { "molten_pool": { "mat": "molten_wax", "rim": "#ffcf6a", "dps": 12 } },
  "lines": { "open": "boss_tallow_open", "phase": "boss_tallow_phase", "die": "boss_tallow_die" },
  "rewards": { "xp": 400, "marks": 3, "unlock": [ { "kind": "mechanic", "id": "waves_mode" } ] } }
```

### 5.12 `items.json`

```json
{ "slots": ["weapon", "lantern", "hood", "coat", "boots", "charm_ring", "trinket"],
  "bases": [ { "id": "pole_lantern", "name": "Pole Lantern", "slot": "weapon", "class": ["lamplighter"],
               "level": 1, "stats": { "meleeDamage": [6, 9], "attackSpeed": 1.1 }, "price": 40, "sprite": "it_pole_lantern" } ],
  "uniques": [ { "id": "u_vigil_of_the_first_lamp", "base": "pole_lantern", "name": "Vigil of the First Lamp",
                 "fixed": [ { "affix": "light_radius", "value": 0.3 } ], "power": "first_lamp", "lore": "…" } ],
  "consumables": [ { "id": "oil_flask_small", "name": "Small Oil Flask", "stack": 5, "use": { "oil": 30 }, "price": 12 } ],
  "rarities": [ { "id": "common", "color": "#b8b8b8", "affixes": [0, 0] }, { "id": "rare", "color": "#ffd54a", "affixes": [3, 4] } ] }
```

### 5.13 `affixes.json`

```json
{ "affixes": [ { "id": "light_radius", "name": "of the Long Wick", "kind": "suffix", "slots": ["lantern", "weapon"],
                 "stat": "lightRadiusPct", "tiers": [ { "min": 1, "range": [0.05, 0.1] }, { "min": 10, "range": [0.1, 0.2] } ],
                 "weight": 10, "text": "+{value%} lantern light radius" } ] }
```

Every `stat` must be a key `rpg/stats.js` reads (validator checks against an exported `KNOWN_STATS` list —
the "no dead data" rule from Farhold's round 6).

### 5.14 `loot.json`

```json
{ "tables": [ { "id": "loot_small_a1", "rolls": 1, "entries": [
    { "w": 60, "kind": "pennies", "amount": [1, 4] }, { "w": 25, "kind": "oil", "amount": [5, 10] },
    { "w": 12, "kind": "item", "rarity": { "common": 80, "magic": 18, "rare": 2 } }, { "w": 3, "kind": "scrap", "amount": [1, 2] } ] } ] }
```

### 5.15 `shops.json`

```json
{ "id": "shop_wick", "name": "Wick & Tallow", "keeper": "odile_pennywax", "currency": "pennies",
  "stock": { "slots": 8, "tables": ["stock_wick_basic"], "always": ["oil_flask_small"], "refresh": "on_room_enter" },
  "pricing": { "base": 1.0, "lampDiscount": 0.08 }, "quirk": "names_spells",
  "lines": { "greet": "shop_greet", "buy": "shop_buy", "sell": "shop_sell", "haggle": "shop_haggle" } }
```

One `quirk` per shop id from `00` §11: `names_spells`, `remembers_sales`, `flooded_only`, `menu_rotates`,
`sealed_lanterns`, `custom_gadget`, `tithe_by_kills`, `pays_in_health`. `rpg/shops.js` has one hook per quirk.

### 5.16 `acts.json`

```json
{ "acts": [ { "id": "act1", "name": "Lanterncrown & the Wax Stair", "lamp": "the Crown Lamp", "boss": "boss_tallow",
  "levels": [1, 6], "mechanic": "wicks",
  "ambient": { "dark": "#2a3348", "darkPower": 0.55, "lit": "#5a4a3a", "litPower": 0.7, "floor": 0.1, "bottomMult": 0.6 },
  "grade": { "lift": [0.02, 0.02, 0.04], "gamma": [1, 1, 1.03], "gain": [1.02, 1, 0.96] },
  "rain": { "density": 90, "wind": 0.15, "deposit": 0.07 },
  "parallax": "act1_city", "music": "act1", "ambience": "ambience.rain.light",
  "map": { "start": "a1_crown_gate", "nodes": [ { "id": "n1", "room": "a1_crown_gate", "pos": [0, 0], "next": ["n2a", "n2b"], "kind": "hub" } ] } } ] }
```

The act map graph shape is here; its content and rules (branching, room kinds) are `09-MODES-MAP.md`.

### 5.17 `npcs.json`

```json
{ "id": "odile_pennywax", "name": "Odile Pennywax", "role": "shopkeeper", "shop": "shop_wick",
  "sprite": "npc_odile", "gender": "f",
  "voice": { "role": "villager", "seed": 4411 },
  "speech": { "traits": ["kind", "chatty"], "formality": 0.4, "cheer": 0.7,
              "custom": { "greeting": "Mind the drips, love", "catchphrase": "Every wick has a name." } },
  "lexicon": "odile_pennywax", "rooms": ["a1_crown_gate"] }
```

`speech` is the Lingo speaker block (shared character schema `shared/character-schema.md`); `voice` is fed
to `shared/voices.js` `voiceFor()`; `lexicon` is the entry id in the Lingo pack.

### 5.18 `trials.json`

```json
{ "trials": [ { "id": "trial_rope_gauntlet", "name": "Rope Gauntlet", "room": "tr_rope_gauntlet",
     "rules": { "noSpells": true, "timeLimit": 150 }, "goal": "reach_exit", "rewards": { "marks": 2, "unlock": [ { "kind": "class", "id": "chimneysweep" } ] } } ],
  "challenges": [ { "id": "sweep_rope_2000", "name": "Two Thousand Metres of Rope", "stat": "ropeMetresRun", "target": 2000, "unlock": { "kind": "class", "id": "chimneysweep" } } ],
  "daily": { "classes": ["lamplighter", "sluicewarden", "tinker"], "wickPool": [ { "flame": "ember", "shape": "lob" } ] } }
```

Challenge `stat` names are counters kept in `profile.stats` (§7.3). 1 m of rope = 8 cells (so 2,000 m = 16,000
cells swung) — the conversion lives in `progression.json` `cellsPerMetre: 8`.

### 5.19 `waves.json`

```json
{ "floodgate": { "arenas": ["wv_old_lamp"], "waves": [ { "n": 1, "groups": [ { "enemy": "wax_mite", "count": 6, "from": "left", "delay": 0 } ],
                 "waterRise": 4, "buildTime": 20 } ] },
  "endless": { "floorEvery": 1, "hpScale": 0.09, "damageScale": 0.06, "floodSpeed": [18, 60], "pieces": ["ed_shaft_a", "ed_ledges_b"] } }
```

### 5.20 `prefabs.json`

Defaults for each thing type in §6.5: size, sprite, whether it is solid, save policy, default props.

```json
{ "lever": { "size": [6, 10], "sprite": "pf_lever", "solid": false, "interact": true, "save": "state",
             "props": { "state": false, "oneShot": false, "cooldown": 0.4 } } }
```

`save` is `none` (resets on re-entry), `state` (remembered per save slot), or `once` (remembered, and
cannot be undone: a secret wall broken, a chest opened).

### 5.21 `themes.json`

```json
{ "wax_chapel": { "act": "act1", "backWall": "brick", "backWallShade": 0.55, "parallax": "act1_city",
    "decor": { "erode": 0.35, "round": 2, "moss": 0.1, "cracks": 0.15, "grime": 0.3, "strata": "none", "drips": 6, "waxDrips": 0.4 },
    "props": ["candle_cluster", "chain", "hymn_board"], "ambience": "ambience.rain.light" } }
```

### 5.22 `sprites.json`

ASCII pixel art, one character per pixel, with a per-sprite palette. Built into one atlas at load by
`render/sprites.js`. (Same idea as Tiny RTS's sprites file; it keeps art diffable and editable by an agent.)

```json
{ "palettes": { "hero": { ".": null, "k": "#10131a", "h": "#2d3342", "f": "#c9b39a", "l": "@flame" } },
  "sprites": { "hero_lamplighter": { "palette": "hero", "anchor": [3, 12], "anims": {
      "idle": { "fps": 4, "frames": [ [ "..hh..", ".hhhh.", ".hffh.", "..kk..", ".kkkk.", "kkkkkk", ".kkkk.", ".kkkk.", ".k..k.", ".k..k.", ".k..k.", "kk..kk" ] ] } } } } }
```

`@flame` means "the current flame colour" (the lantern pixel). Sprites never exceed 64 × 64.

### 5.23 `strings.json`

Every fixed UI string (menu labels, tutorial prompts, lesson-room hints) keyed by id, so wording has one
home and a wording test can scan it (like Farhold's `WORDING.md` idea): `{ "menu.continue": "Continue", …}`.

### 5.24 Lingo pack and grammar

- `lingo/data/packs/lanternfall.json` (lives in the Lingo experiment, following its convention): `{ "_doc",
  "entries": [ … ] }` with entries of types `place` (Vessmere, the Hollow, every district and named room),
  `faction` (Lamplighters' Guild, the Pale Congregation, the Rat Choir, bell-cultists), `person` (every NPC in
  `npcs.json`, every boss), `creature` (every enemy id — so `{foe.sg}` reads naturally), `item` (flames, shapes,
  charms, notable items), `weather` (the Rain), `title`. Each proper name gets `pron.respell` so the formant
  voice says it right.
- `data/grammar-lanternfall.json`: extra intents merged into Lingo's grammar at load: `shop_greet`,
  `shop_haggle`, `shop_remember_sale`, `odile_name_wick`, `boss_*_open/phase/die`, `bark_<family>_*`,
  `lamp_relit`, `room_comment_<theme>`, `lesson_hint_*`. Merge rule: `grammar.add(name, entry)` for each; an
  intent here with the same name as a core one **extends** it (adds entries) rather than replacing it.

---

## 6. The room authoring format

About 100 campaign rooms plus trials, arenas and endless pieces have to be made by an agent writing JSON.
The format is built so a room is **~150–400 lines of JSON**, reads like a sketch, and still looks
hand-made after the decorator runs.

### 6.1 The idea in one paragraph

A room is a **coarse ASCII map** where each character is a square **block** of cells (8 × 8 by default,
16 × 16 for big rooms, 4 × 4 for small detailed ones) of one material. On top of that come **shape
operations** in exact cell coordinates (rectangles, circles, polygons, lines, noise carving, water fills,
stairs, arches) for the parts a block grid can't draw, then **things** (levers, doors, lamp posts, enemy
spawns, exits…) and **wires** between them. Last, a seeded **decorator** roughens every block edge, grows
moss where it is wet, adds cracks and drips, so no one ever sees an 8 × 8 staircase edge.

### 6.2 Top-level shape

```json
{
  "format": 1,
  "id": "a1_wax_stair_02",
  "name": "The Guttering Steps",
  "act": "act1",
  "kind": "lesson",
  "size": [480, 272],
  "block": 8,
  "seed": 1702,
  "theme": "wax_chapel",
  "rain": { "density": 90, "wind": 0.2, "deposit": 0.07, "maxDeposit": 3000 },
  "ambient": null,
  "legend": {},
  "map": [ "… 34 strings of 60 characters …" ],
  "back": null,
  "ops": [],
  "things": [],
  "wires": [],
  "edges": { "drain": [] },
  "decor": {},
  "camera": { "lookAheadY": 0 },
  "music": null,
  "notes": "Free text for authors. Not shown in game."
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | this format's version (§6.12 migrations) |
| `id` | yes | `a<act>_<area>_<nn>` for campaign (`a1_wax_stair_02`), `tr_*` trials, `wv_*` waves, `ed_*` endless pieces, `bench_*`, `test_*` |
| `name` | yes | shown on the map and the room banner; original words only |
| `act` | yes | canon act id or `none` |
| `kind` | yes | `hub` `combat` `lesson` `puzzle` `secret` `shop` `boss` `rest` `set_piece` `trial` `arena` `piece` `bench` `test` (meanings in `09-MODES-MAP.md`) |
| `size` | yes | `[w, h]` in cells, both multiples of `block`, each 480–2048 (§06 §1). `w/block` must equal every map row's length; `h/block` the row count |
| `block` | yes | 4, 8 or 16 |
| `seed` | yes | decorator + spawner seed; changing it re-rolls the look without moving anything that matters |
| `theme` | yes | key in `themes.json` (background wall, parallax, decor defaults) |
| `rain` | no | overrides the act's rain; `{ "density": 0 }` for indoors |
| `ambient` | no | overrides the act's ambient `{ "color", "power", "bottomMult" }` |
| `legend` | no | extra/overriding characters for this room (§6.3) |
| `map` | yes | the coarse grid |
| `back` | no | an optional second grid, same size, for the background wall (default: theme's `backWall` everywhere the map is not `:`) |
| `ops` | no | shape operations, applied in order after the map (§6.4) |
| `things` | no | placed prefabs (§6.5) |
| `wires` | no | signal connections (§6.6) |
| `edges` | no | `drain` spans on the room edge where liquids leave (`06` §2.4): `[{ "side": "e", "from": 384, "to": 447 }]` |
| `decor` | no | overrides the theme's decorator settings (§6.7) |
| `camera` | no | defaults for camera zones |

### 6.3 The legend

Default characters (`data/legend.json`). A room's `legend` can add or override single characters.

| Char | Material | Char | Material | Char | Material |
|---|---|---|---|---|---|
| `.` | air, background wall behind | `:` | air, **open sky** (no back wall; rain falls) | `X` | bedrock |
| `#` | stone | `B` | brick | `M` | metal |
| `G` | glass | `W` | wood | `x` | wax |
| `I` | ice | `m` | moss (stone underneath, moss skin) | `k` | bone |
| `c` | cloudstuff | `d` | dirt | `s` | sand |
| `i` | silt | `r` | rubble | `~` | water |
| `o` | oil | `b` | bile | `u` | mud |
| `q` | molten wax | `e` | web | `g` | glowmoss (on stone) |
| `%` | stone, **pinned** (never detaches) | `=` | brick, **pinned** | `?` | stone, **cracked** (half HP, a hint of a secret) |

A legend value is either a material key (`"~": "water"`) or an object
`{ "mat": "brick", "pin": true, "cracked": true, "sky": false, "bg": "stone" }` (`cracked` halves HP,
`sky` means no back wall, `bg` sets this block's back wall).

Rules: every map row is the same length; every character is in the legend; the whole outer ring of the
room should be `X` except where exits and drains are (the checker warns otherwise, because the room edge
counts as bedrock anyway and an explicit frame keeps stone "islands" anchored — `06` §10.2).

### 6.4 Shape operations (`ops`)

Coordinates are **cells** unless the op has `"unit": "block"`. Rectangles are `[x, y, w, h]`. Every op
can take `"mat"` (material key), `"back"` (write the background wall instead), `"pin": true`, `"only":
["air"]` (only overwrite these materials) and `"seed"`.

| op | Fields | Draws |
|---|---|---|
| `rect` | `rect`, `mat` | a filled rectangle |
| `frame` | `rect`, `mat`, `thick` | a hollow rectangle (rooms inside rooms, cisterns) |
| `circle` | `at: [x, y]`, `r`, `mat` | filled disc |
| `ellipse` | `at`, `rx`, `ry`, `mat` | |
| `poly` | `points: [[x,y],…]`, `mat` | filled polygon (even-odd) — slopes, wedges, cave mouths |
| `line` | `from`, `to`, `thick`, `mat` | thick line — beams, pipes, chains of wood |
| `stairs` | `from`, `steps`, `rise`, `run`, `dir: "r"|"l"`, `mat` | a staircase (each step a filled rect down to the floor below) |
| `arch` | `rect`, `thick`, `mat` | a semicircular arch cut into / built on a wall |
| `carve` | `rect`, `noise: { "scale": 24, "threshold": 0.55, "octaves": 3 }`, `mat` (default air), `keepFloor` | noise-carved cave pockets inside the rect; `keepFloor: 4` leaves 4 solid cells on top of every carved hole's floor so it stays walkable |
| `fill` | `at`, `mat`, `level` (y), `max` | flood-fills **air** from `at` with a liquid, only below `level`, up to `max` cells (a pool that fits its container exactly) |
| `scatter` | `rect`, `mat`, `count`, `size: [min, max]` | clumps of a powder or solid (rubble piles, sand drifts) |
| `vein` | `from`, `to`, `mat`, `thick`, `wobble` | a wandering line (ore-like seams, roots, cracks filled with glowmoss) |
| `strata` | `rect`, `mats: ["stone", "dirt"]`, `bands: [8, 3]`, `tilt` | layered bands in the solid part of a rect |
| `basin` | `id`, `rect`, `level`, `mode: "controlled"|"physical"`, `rate`, `inlets: [[x,y]]`, `drains: [[x,y]]` | declares a sluice basin (`06` §8.5); does not draw — use `fill` for the starting water |
| `rope` | `from` (anchor cell), `length`, `mat` (default rope) | a hanging rope of rope cells (`06` §10.1 `hang`) |
| `tunnel` | `points`, `r` | carves a round tunnel along a path (air) |
| `copy` | `rect`, `to`, `flipX` | copy a region (symmetrical rooms) |
| `clear_decor` | `rect` | tells the decorator to leave this rect alone (puzzle geometry that must be exact) |

Ops are applied **in order**; later ops overwrite earlier ones. Ops draw into the grid before the decorator
runs; ops flagged `"exact": true` are recorded in the decorator's keep-out mask (same as `clear_decor`).

### 6.5 Things (placed prefabs)

Each thing: `{ "t": type, "id": unique-in-room, "at": [x, y], …props }`. `at` is the **bottom-centre** for
anything that stands (like entities), the **top-left** for rect things (doors, zones, gates — they use
`rect` instead). The prefab defaults are in `prefabs.json`; behaviour is in `07-TRAVERSAL-PUZZLES.md`.

| `t` | Key props | Notes |
|---|---|---|
| `entry` | `id` (e.g. `w`, `e`, `n`, `from_a1_03`), `face` | where the player appears when arriving by that id |
| `exit` | `rect`, `to: "room_id"`, `entry: "entry id there"`, `requires?` | touching the rect changes room; the checker verifies the other room has that entry |
| `lamp_post` | `id` | save point (§7.4), heal, respawn point |
| `great_lamp` | `act` | the act's Great Lamp (hub rooms only) |
| `lever` | `state`, `oneShot` | emits `on`/`off` |
| `button` | `hold: 0.5` | emits `pulse` |
| `plate` | `rect`, `weight: 1` (entities or `cells: 30` powder cells) | emits `on` while pressed |
| `door` | `rect`, `mat`, `state: "closed"`, `speed` | cells (`06` §12.6); takes `open`/`close`/`toggle` |
| `timed_door` | `rect`, `mat`, `open: 6` s | opens on signal, closes after `open` s |
| `sluice` | `rect`, `basin`, `mat: "metal"` | a door that also sets its basin draining/filling |
| `grapple_point` | — | hook target (Act 2+) |
| `rope_anchor` | `length` | spawns a verlet rope (not cells) |
| `gravity_lantern` | `rect`, `dir: "up"|"down"|"left"|"right"`, `state` | Act 5 field |
| `bell` | `rect`, `radius`, `shake` | Act 5; shakes loose cells (triggers support checks in `radius`) |
| `spike` | `rect`, `damage`, `dir` | trap |
| `chest` | `loot`, `locked?: "key_id"` | `save: once` |
| `pickup` | `kind`, `amount`/`item` | pennies, pearls, oil, scrap, a fixed item |
| `crate` / `oil_barrel` | — | pushable box; oil barrel spills 120 oil cells when broken |
| `spawn` | `enemy`, `count`, `rect?`, `wave?`, `when: "enter"|"signal"`, `elite?` | enemy spawns; `wave` groups for arenas |
| `boss` | `boss` | boss spawn + arena lock |
| `npc` | `npc` (id in `npcs.json`), `face` | talkable |
| `shopkeeper` | `shop` | opens a shop |
| `sign` | `text` (a `strings.json` id) | readable plaque |
| `light` | `color`, `r`, `intensity`, `shadow`, `flicker` | a static light source (wall lantern, brazier) with its sprite `sprite?` |
| `drip` | `every: [1.2, 4]`, `stream: false` | a forced drip point / leaking pipe (`06` §11.5) |
| `zone` | `rect`, `on: "enter"|"leave"|"inside"`, `once` | emits signals when the player is there |
| `timer` | `every` or `after` s | emits `pulse` |
| `camzone` | `rect`, `lock: "x"|"y"|"both"`, `frame?`, `wide?` | camera rules (`06` §19.2) |
| `counter` | `need: 3` | emits `on` after N pulses |
| `logic` | `kind: "and"|"or"|"not"|"xor"|"latch"|"delay"`, `delay?` | a logic gate for wiring |
| `lesson` | `mechanic`, `hint` (strings id) | marks a Lesson room's teaching moment (`09`) |
| `decor_prop` | `prop`, `layer: "back"|"front"` | pure decoration sprites (candles, chains, pipes) |

### 6.6 Wiring

```json
"wires": [
  { "from": "lv_sluice", "to": "gate_1", "do": "toggle" },
  { "from": "lv_sluice", "to": "weir", "do": "drain", "when": "on" },
  { "from": "lv_sluice", "to": "weir", "do": "fill", "when": "off" },
  { "from": "plate_1", "to": "door_low", "do": "open" },
  { "from": "weir", "to": "zone_hint", "do": "enable", "when": { "levelBelow": 400 } }
]
```

- **Signals** are `on`, `off`, `pulse` or a number (basin level, counter value). `when` filters them:
  `"on"`, `"off"`, `"pulse"`, `{ "levelBelow": y }`, `{ "levelAbove": y }`, `{ "equals": n }`.
- **Actions** (`do`) any target understands: `open`, `close`, `toggle`, `enable`, `disable`, `pulse`,
  `spawn`, `fill`, `drain`, `stop`, `light`, `snuff`, `say` (with `"line": "intent"`), `shake`, `set`
  (with `"value"`).
- Wiring runs at tick step 2; a signal chain is resolved in one tick, max depth 16 (a loop is reported by the
  checker and cut at runtime).
- Wires are drawn in the debug overlay as lines (`11`).

### 6.7 The decorator

Runs after ops, seeded with `hashSeed(room.seed, 'decor')`, never touches `clear_decor`/`exact` areas or
cells within 2 cells of a thing's rect. Steps, each controlled by a number in `decor` (0 = off):

| Step | Setting (default from theme) | What it does |
|---|---|---|
| 1. **Edge erosion** | `erode` 0–1 (0.35) | For every cell within 4 cells of a boundary between two *different* material classes (e.g. stone/air), sample 2D value noise at scale 6; if `noise > 1 − erode × 0.5` swap it to the neighbouring material across the boundary. Breaks up every straight block edge into a ragged natural line. Liquids are never created this way — only solids eroded to air, or air filled with the neighbouring solid |
| 2. **Rounding** | `round` 0–3 passes (2) | A cellular automaton pass on solid/air: a solid cell with ≤ 2 solid neighbours of 8 becomes air; an air cell with ≥ 6 becomes the majority neighbour solid. Takes the corners off |
| 3. **Strata and shading** | `strata`: `none`/`flat`/`tilted` | writes `shade` bands (ramp step) through stone so rock has layers; also `grime`: darker steps within 6 cells above any floor |
| 4. **Masonry** | automatic for brick | brick courses (8 × 4 with a 1-cell mortar line, offset every other row) are shader-drawn from `(x, y)`; the decorator only knocks out **missing bricks** at `erode × 0.1` near edges |
| 5. **Cracks** | `cracks` 0–1 (0.15) | `cracks × area/4000` random walks of 6–20 cells through stone/brick, turning cells to air with `bg` visible (1 cell wide), never through 2-cell-thin walls |
| 6. **Moss** | `moss` 0–1 (0.1) | top surfaces within 24 cells of water or open sky get a 1–2 cell moss skin with probability `moss`; `glowmoss` instead in Act 3–4 themes at `glow` rate |
| 7. **Wax runs** | `waxDrips` (Act 1) | frozen wax drips hanging 2–10 cells from wax undersides |
| 8. **Rubble and dust** | `rubble` 0–1 | small rubble piles at wall bases |
| 9. **Drips** | `drips` n | registers the `n` best drip points (`06` §11.5) in addition to the automatic ones |
| 10. **Props** | theme `props` | places decor sprites (candles, chains) on suitable surfaces, max 1 per 40 cells of floor |

Result: the same map + a different `seed` gives a room that plays the same and looks freshly carved.

### 6.8 Coordinates cheat sheet (for authors)

- Map row `r`, column `c` at block `b` covers cells `x ∈ [c×b, c×b+b−1]`, `y ∈ [r×b, r×b+b−1]`.
- A floor whose top block is row `r` has its walkable surface at `y = r × b`; an entity standing on it has
  feet at `y = r × b − 1` (use that for `at`).
- Player: 6 × 12 cells; running jump clears ≈ 52 cells across and ≈ 34 up; ledges more than 30 cells up
  need a rope, a plank or a steam lift. Keep corridors ≥ 16 cells tall (8 with a crouch, if `07` adds one).
- 1 screen = 480 × 270 cells. A room that takes 30 s–4 min (canon pillar 6) is usually 1–4 screens.

### 6.9 Compile pipeline (`world/roomload.js`)

1. **Parse** and check `format`; run room migrations if older (§6.12).
2. **Blocks:** allocate the grid (`size`), write each map character's material to its block; `:` also
   clears `bg`; set `PINNED` for `%`/`=`; halve HP for `?`.
3. **Back wall:** fill `bg` with the theme's `backWall` (or the `back` grid) wherever the map char isn't `:`.
4. **Ops** in order.
5. **Decorator** (§6.7).
6. **Things:** create each prefab (its cells too, e.g. doors), set `PINNED` on door frames and prefab mounts.
7. **Derived data:** sky columns, drip points, liquid bodies, basins, temperatures (ambient; molten starts hot),
   `shade` for any cell still 0 (random ramp step from the room rng).
8. **Settle:** run 120 ticks of cell sim with rain off, entities off (so sand and water from ops find their
   rest before the player sees them). Cache the result in memory for the session keyed by
   `id + seed + format`.

Budget: compile + settle ≤ 150 ms for a 960 × 540 room (room transition fades cover it).

### 6.10 How an agent makes a room (workflow)

1. `node tools/room-new.mjs a3_sluice_05 --act act3 --kind puzzle --size 960x544 --block 16` copies
   `rooms/_template.json`, fills in id/act/size/seed (random)/theme (act default) and a map of the right
   dimensions with a bedrock frame, and adds it to `rooms/index.json`.
2. Draw the map (air `.`/sky `:` first, then solids), add ops for slopes, pools and exact puzzle geometry.
3. Add `entry`/`exit` things first, then the lamp post, then puzzle things and wires, then spawns.
4. `node tools/room-check.mjs a3_sluice_05` — must print `OK`.
5. `node tools/room-thumbs.mjs a3_sluice_05` — look at `rooms/_thumbs/a3_sluice_05.png` (Read tool) to see the
   compiled room.
6. Open `index.html?room=a3_sluice_05&debug=1` to play it; the editor-lite (§11.5) can nudge things and
   export.

### 6.11 The checker and thumbnails

`tools/room-check.mjs [id|--all]` (pure Node, reuses `roomload.js`) fails on:

- map row count/lengths not matching `size/block`; unknown legend chars; size outside 480–2048;
- duplicate thing ids; unknown thing types; unknown enemy/npc/shop/boss/loot ids;
- exits whose target room or entry id is missing; a room with no `entry`; campaign rooms of kind
  `combat|puzzle|set_piece` more than 2 rooms from a lamp post (graph distance in the act map);
- wires naming missing things or actions a target does not accept; wire loops;
- things overlapping solid cells after compile (a lever inside a wall), or floating with no floor within
  64 cells below (warning);
- **reachability** (warning, not error): a coarse walk graph on the compiled room (8 × 8 blocks, jump
  links up to 32 up / 48 across, ropes and grapple points as links when the act allows them) from each
  entry to each exit; unreachable exits are listed with the act's unlocked mechanics taken into account;
- liquids above 250,000 cells, gas above 6,000, lights above 24 shadowed (perf limits from `06`);
- player-facing text containing a name on the banned third-party list (a small word list in
  `tools/ip-words.json`).

`tools/room-thumbs.mjs [id|--all]` renders the compiled + settled room at 1 px per cell with flat colours
(Node, a tiny PNG writer — no canvas package), and writes `rooms/_thumbs/<id>.png` plus
`rooms/_thumbs/index.html` (a contact sheet with every room's name, act, kind and size). Thumbs are
git-ignored.

### 6.12 Versioning rooms

`format` starts at 1. A format change adds a migration in `world/roomload.js` (`ROOM_MIGRATIONS[n](room) →
room`) and `tools/room-migrate.mjs` rewrites files on disk. The game can load any older format.

### 6.13 Example 1 — a one-screen lesson room (block 8)

Act 1, teaches the **plank kit** (`00` §6: "Act 1 mid"): a cistern under a broken beam walkway, a jump that is
barely makeable at a run and easy with a plank. Rain falls into the open middle, so the cistern visibly
catches it. 480 × 272, block 8 → 60 columns × 34 rows.

```json
{
  "format": 1,
  "id": "a1_wax_stair_02",
  "name": "The Guttering Steps",
  "act": "act1",
  "kind": "lesson",
  "size": [480, 272],
  "block": 8,
  "seed": 1702,
  "theme": "wax_chapel",
  "rain": { "density": 90, "wind": 0.2, "deposit": 0.07, "maxDeposit": 3000 },
  "map": [
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::",
    "XX#############.........###...............################XX",
    "XX#############...........................################XX",
    "XX........................................................XX",
    "XX..........................................................",
    "XX..........................................................",
    "XX..........................................................",
    "XX..........................................................",
    "XX................................................BBBBBBBBXX",
    "XX................................................BBBBBBBBXX",
    "XX................................................BBBBBBBBXX",
    "XX.................xxxWWWW.......WWWW#............BBBBBBBBXX",
    "XX.................xxxxx.............#BBBBBBBB....BBBBBBBBXX",
    "...................xxxxx.............#BBBBBBBBBBBBBBBBBBBBXX",
    "................xxxxx................#####################XX",
    "................xxxxx................#####################XX",
    "................xxxxx................#####################XX",
    "............xxxxxxxxx................#####################XX",
    "............xxxxxxxxx................#####################XX",
    "ddddddddddddxxxxxxxxx................#####################XX",
    "XX####################...............#####################XX",
    "XX####################~~~~~~~~~~~~~~~#####################XX",
    "XX####################~~~~~~~~~~~~~~~#####################XX",
    "XX########################################################XX",
    "XX########################################################XX",
    "XX########################################################XX",
    "XX########################################################XX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  ],
  "ops": [
    { "op": "stairs", "from": [76, 199], "steps": 5, "rise": 3, "run": 4, "dir": "r", "mat": "wax", "note": "a walkable ramp from the dirt floor (y 200) up to the first wax block (y 184); rises of 3 are within step-up" },
    { "op": "circle", "at": [200, 64], "r": 10, "mat": "stone", "note": "hanging rock under the ceiling gap" },
    { "op": "poly", "mat": "stone", "points": [[192, 64], [208, 64], [201, 84]], "note": "stalactite tip; drips form here" },
    { "op": "carve", "rect": [168, 208, 136, 32], "only": ["stone"], "noise": { "scale": 10, "threshold": 0.62, "octaves": 2 }, "note": "ragged cistern walls; 'only' keeps the water untouched" },
    { "op": "fill", "at": [232, 229], "mat": "water", "level": 214, "max": 3000, "note": "refill any carved pockets below y 214, so the surface sits 6 cells under the lip" },
    { "op": "rect", "rect": [176, 136, 32, 3], "mat": "air", "only": ["wood"], "note": "thin both beams from 8 to 5 cells tall" },
    { "op": "rect", "rect": [264, 136, 32, 3], "mat": "air", "only": ["wood"] },
    { "op": "stairs", "from": [368, 151], "steps": 3, "rise": 12, "run": 10, "dir": "r", "mat": "brick", "note": "three hop-up steps (tops y 139/127/115) to the ruin roof at y 112" },
    { "op": "rect", "rect": [400, 112, 64, 40], "mat": "air", "only": ["brick"], "note": "hollow out the chandlery ruin" },
    { "op": "frame", "rect": [400, 112, 64, 40], "thick": 3, "mat": "brick" },
    { "op": "rect", "rect": [400, 136, 3, 13], "mat": "air", "note": "doorway in the ruin's left wall (inside floor is y 149, 3 up from outside)" },
    { "op": "scatter", "rect": [306, 140, 40, 4], "mat": "rubble", "count": 3, "size": [4, 9] },
    { "op": "clear_decor", "rect": [176, 132, 120, 12], "note": "the jump distance is the lesson; keep the beam ends exact" }
  ],
  "things": [
    { "t": "entry", "id": "w", "at": [8, 199], "face": "r" },
    { "t": "exit", "id": "exit_w", "rect": [0, 152, 4, 48], "to": "a1_wax_stair_01", "entry": "e" },
    { "t": "entry", "id": "e", "at": [468, 111], "face": "l" },
    { "t": "exit", "id": "exit_e", "rect": [476, 80, 4, 32], "to": "a1_wax_stair_03", "entry": "w" },
    { "t": "lamp_post", "id": "lp_a1_02", "at": [40, 199] },
    { "t": "pickup", "id": "scrap_1", "kind": "scrap", "amount": 2, "at": [64, 199] },
    { "t": "pickup", "id": "scrap_2", "kind": "scrap", "amount": 2, "at": [160, 135] },
    { "t": "sign", "id": "sign_plank", "at": [168, 135], "text": "sign.a1_02.plank" },
    { "t": "lesson", "id": "lesson_plank", "mechanic": "plank_kit", "hint": "lesson.plank.gap", "at": [176, 135] },
    { "t": "zone", "id": "zone_gap", "rect": [176, 96, 32, 40], "on": "inside", "once": true },
    { "t": "light", "id": "lt_ruin", "at": [432, 124], "color": "#ffc46a", "r": 64, "intensity": 0.9, "shadow": true, "flicker": 0.1, "sprite": "wall_lantern" },
    { "t": "light", "id": "lt_wax", "at": [150, 120], "color": "#ffd27a", "r": 40, "intensity": 0.6, "shadow": true, "flicker": 0.15, "sprite": "candle_cluster" },
    { "t": "spawn", "id": "sp_mites", "enemy": "wax_mite", "count": 2, "rect": [312, 120, 60, 20], "when": "enter" },
    { "t": "drip", "id": "drip_stal", "at": [201, 85], "every": [1.2, 2.4] },
    { "t": "pickup", "id": "oil_ruin", "kind": "oil", "amount": 20, "at": [440, 148] }
  ],
  "wires": [
    { "from": "zone_gap", "to": "lesson_plank", "do": "pulse", "note": "shows the plank prompt when the player stands at the gap" }
  ],
  "decor": { "erode": 0.3, "moss": 0.15, "cracks": 0.1, "waxDrips": 0.5 },
  "notes": "Beam gap is 56 cells (x 208..263): a running jump clears ~52, so it fails without a plank unless the player is very precise. The cistern catches rain; by the time a slow player arrives it has visibly risen a little (maxDeposit keeps it from overflowing the lip)."
}
```

### 6.14 Example 2 — a two-by-two-screen sluice puzzle (block 16)

Act 3. A flooded weir basin fills most of a vaulted hall. Pull the lever in the upper-left alcove to open the
sluice gate: the basin drains through a trench and out of the room, which uncovers a pressure plate on the
basin floor that opens the lower east door for 12 s. Or leave it flooded and use the grapple points in the
vault to swing across to the high north-east shelf. A cracked brick wall in the lower-left room hides a
chest. Three eels live in the basin (and die in a shocked flood — the Spark lesson from Act 2 pays off).
960 × 544, block 16 → 60 columns × 34 rows.

```json
{
  "format": 1,
  "id": "a3_sluice_04",
  "name": "The Weir Stair",
  "act": "act3",
  "kind": "puzzle",
  "size": [960, 544],
  "block": 16,
  "seed": 88031,
  "theme": "sluice_vault",
  "rain": { "density": 0 },
  "ambient": { "color": "#1a2a40", "power": 0.45, "bottomMult": 0.5 },
  "legend": { "Q": { "mat": "brick", "cracked": true } },
  "map": [
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XX###################BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB#######XX",
    "XX###################..............................#######XX",
    "XX###################.....................................XX",
    "XX###################.......................................",
    "......................................BBB...................",
    "............................................................",
    "..............................BBB...........................",
    "............................................................",
    "XXBBBBBBBBBBBBBBBBBBB..............................BBBBB##XX",
    "XX###############..................................#######XX",
    "XX###############.....BB......................BB...#######XX",
    "XX###############.....BB......................BB...#######XX",
    "XX###################.BB~~~~~~~~~~~~~~~~~~~~~~BB...#######XX",
    "XX###################.BB~~~~~~~~~~~~~~~~~~~~~~BB...#######XX",
    "XX###################.BB~~~~~~~~~~~~~~~~~~~~~~BB...#######XX",
    "XX###################.BB~~~~~~~~~~~~~~~~~~~~~~BB...#######XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~BB........##XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~BB........##XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~GG........##XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~GG........##XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~GG........##XX",
    "XX#########...........BB~~~~~~~~~~~~~~~~~~~~~~BB..........XX",
    "XX##......Q...........BB~~~~~~~~~~~~~~~~~~~~~~BB............",
    "XX##......Q...........BB~~~~~~~~~~~~~~~~~~~~~~BB............",
    "XX##......Q...........BB~~~~~~~~~~~~~~~~~~~~~~BB............",
    "XX##......Qdddddddddd.BB~~iiiiiiii~~~~~~~~~~~~BB............",
    "XX#########BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBMMMMMMMMMMXX",
    "XX####################BBBBBBBBBBBBBBBBBBBBBBBBBBMMMMMMMMMMXX",
    "XX########################################################XX",
    "XX########################################################XX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  ],
  "ops": [
    { "op": "poly", "mat": "brick", "points": [[336, 48], [400, 48], [336, 96]], "note": "vault corner fillet, left" },
    { "op": "poly", "mat": "brick", "points": [[816, 48], [752, 48], [816, 96]], "note": "vault corner fillet, right" },
    { "op": "rect", "rect": [352, 192, 32, 256], "mat": "brick", "pin": true, "note": "pin the basin's left wall so a drained basin never collapses it" },
    { "op": "rect", "rect": [736, 192, 32, 256], "mat": "brick", "pin": true },
    { "op": "basin", "id": "weir", "rect": [384, 224, 352, 224], "level": 224, "mode": "controlled", "rate": 90,
      "inlets": [[440, 64]], "drains": [[744, 440]] },
    { "op": "line", "from": [432, 48], "to": [432, 64], "thick": 6, "mat": "metal", "note": "inlet pipe stub in the vault" },
    { "op": "rope", "from": [560, 48], "length": 380, "note": "hangs from the vault to 20 cells above the basin floor: the way back up when drained" },
    { "op": "rope", "from": [336, 176], "length": 256, "note": "hangs beside the gallery's end, down the shaft into the lower-left room" },
    { "op": "carve", "rect": [48, 176, 128, 96], "only": ["stone"], "noise": { "scale": 18, "threshold": 0.6, "octaves": 3 }, "keepFloor": 4, "note": "a small cave pocket in the left rock mass, flavour only" },
    { "op": "vein", "from": [60, 300], "to": [150, 360], "mat": "glowmoss", "thick": 2, "wobble": 6 },
    { "op": "scatter", "rect": [180, 420, 150, 12], "mat": "rubble", "count": 4, "size": [4, 10] },
    { "op": "clear_decor", "rect": [736, 368, 48, 80], "note": "sluice gate slot must be exact" }
  ],
  "things": [
    { "t": "entry", "id": "w", "at": [12, 159], "face": "r" },
    { "t": "exit", "id": "exit_w", "rect": [0, 96, 4, 64], "to": "a3_sluice_03", "entry": "e" },
    { "t": "entry", "id": "ne", "at": [900, 159], "face": "l" },
    { "t": "exit", "id": "exit_ne", "rect": [956, 80, 4, 80], "to": "a3_cistern_hub", "entry": "sw" },
    { "t": "entry", "id": "se", "at": [940, 447], "face": "l" },
    { "t": "exit", "id": "exit_se", "rect": [956, 384, 4, 64], "to": "a3_sluice_05", "entry": "w" },

    { "t": "lamp_post", "id": "lp_a3_04", "at": [248, 431] },

    { "t": "lever", "id": "lv_sluice", "at": [296, 223], "state": false },
    { "t": "sign", "id": "sign_weir", "at": [280, 223], "text": "sign.a3_04.weir" },
    { "t": "sluice", "id": "gate_1", "rect": [736, 384, 32, 64], "basin": "weir", "mat": "metal" },
    { "t": "plate", "id": "plate_1", "rect": [600, 444, 24, 4], "weight": 1 },
    { "t": "timed_door", "id": "door_low", "rect": [896, 368, 16, 80], "mat": "metal", "open": 12 },

    { "t": "grapple_point", "id": "gp_1", "at": [480, 50] },
    { "t": "grapple_point", "id": "gp_2", "at": [640, 50] },
    { "t": "grapple_point", "id": "gp_3", "at": [744, 50] },

    { "t": "chest", "id": "chest_secret", "at": [112, 431], "loot": "loot_chest_a3_secret" },
    { "t": "pickup", "id": "pearl_basin", "kind": "pearls", "amount": 1, "at": [424, 447] },

    { "t": "spawn", "id": "sp_eels", "enemy": "sluice_eel", "count": 3, "rect": [400, 260, 320, 150], "when": "enter" },
    { "t": "spawn", "id": "sp_rats", "enemy": "drip_rat", "count": 2, "rect": [190, 400, 120, 30], "when": "enter" },

    { "t": "light", "id": "lt_lp", "at": [248, 400], "color": "#ffc46a", "r": 96, "intensity": 1.2, "shadow": true, "flicker": 0.04, "sprite": "none" },
    { "t": "light", "id": "lt_vault_a", "at": [420, 70], "color": "#6fb0ff", "r": 90, "intensity": 0.5, "shadow": true, "flicker": 0.02, "sprite": "sluice_lamp_cold" },
    { "t": "light", "id": "lt_vault_b", "at": [700, 70], "color": "#6fb0ff", "r": 90, "intensity": 0.5, "shadow": true, "flicker": 0.02, "sprite": "sluice_lamp_cold" },
    { "t": "light", "id": "lt_trench", "at": [860, 380], "color": "#ffb060", "r": 70, "intensity": 0.8, "shadow": true, "flicker": 0.1, "sprite": "wall_lantern" },

    { "t": "drip", "id": "drip_inlet", "at": [432, 66], "every": [0.2, 0.2], "stream": true },
    { "t": "zone", "id": "zone_drained", "rect": [384, 400, 352, 48], "on": "enter", "once": true },
    { "t": "camzone", "id": "cam_hall", "rect": [336, 32, 480, 432], "lock": "none", "wide": true },
    { "t": "npc", "id": "npc_warden_ghost", "npc": "weirwarden_ashe", "at": [872, 159], "face": "l" }
  ],
  "wires": [
    { "from": "lv_sluice", "to": "gate_1", "do": "open", "when": "on" },
    { "from": "lv_sluice", "to": "gate_1", "do": "close", "when": "off" },
    { "from": "lv_sluice", "to": "weir", "do": "drain", "when": "on" },
    { "from": "lv_sluice", "to": "weir", "do": "fill", "when": "off" },
    { "from": "plate_1", "to": "door_low", "do": "open", "when": "on" },
    { "from": "weir", "to": "npc_warden_ghost", "do": "say", "line": "weir_drained_comment", "when": { "levelBelow": 420 } },
    { "from": "zone_drained", "to": "sp_rats", "do": "spawn", "note": "two more rats come out of the drain once you walk the basin floor" }
  ],
  "decor": { "erode": 0.25, "moss": 0.35, "glow": 0.1, "cracks": 0.2, "grime": 0.4, "drips": 10 },
  "notes": "Routes. (1) Drained: gallery -> rope down the shaft (x 336) -> lever alcove at y 223 -> pull -> the gate opens and the basin empties in ~15 s (78,800 cells at 90/tick) -> drop into the basin (256 cells; the vault rope at x 560 gives a way down and back up) -> step on the plate at x 600 -> door_low opens for 12 s -> run through the open gate (x 736..767) and along the trench to x 896: ~300 cells, about 3.5 s. (2) Flooded: swim the basin surface (y 224), climb the right wall top (y 192), grapple gp_3 and swing to the NE shelf (floor y 160). The cracked brick column (Q, x 160..175) hides the chest in the lower-left room; Ember or melee breaks it. Controlled drain: cells are removed at the drain point, and the outflow through the open gate is drawn as fading particles, so the trench stays walkable."
}
```


### 6.15 Room pieces for Endless

`rooms/endless/ed_*.json` use the same format with `kind: "piece"`, a fixed width of 480, heights of 272 or
544, and `things` of type `entry` `n` (top) and `exit` `s` (bottom) at matching x ranges so any piece can
stack under any other. `modes/endless.js` stitches 3–6 pieces into one room at run time (it is still
≤ 2048 tall) and re-seeds each piece's decorator.

---

## 7. Save format

### 7.1 Storage

`shared/store.js`: `const store = makeStore('lanternfall', 1)`. **The store version stays 1 forever**
(changing it moves every key to a new prefix and would orphan old saves); our own `schema` number inside
each save handles changes (§7.5).

| Key | Holds | Size budget |
|---|---|---|
| `settings` | §8 | < 4 KB |
| `profile` | cross-run progress: Guild marks, unlocked classes, trials, challenges, cosmetics, bests, seen tutorials | < 64 KB |
| `slot1`, `slot2`, `slot3` | campaign saves | < 400 KB each |
| `slotN.bak` | the previous version of each slot, written before overwriting | same |
| `endless` | the current Long Descent run (floor transitions only) | < 200 KB |
| `daily` | today's seed, whether the scored try is spent, the local best table | < 16 KB |
| `bests` | local leaderboards per mode (top 20) | < 32 KB |

`localStorage` has ~5 MB per origin shared by the **whole playground**, so the meter history saved in a slot
is trimmed to the last 30 rooms (`meter.toJSON()` with `fights.slice(-30)`, each fight's records already cut to
2,000 by the meter). `save.js` measures the JSON before writing; over budget it trims the ledger first, then
refuses with a visible error (never a silent failure: `store.set` returns false on quota errors — we check it).

### 7.2 Slot schema (campaign)

```json
{
  "schema": 1,
  "game": "lanternfall",
  "slot": 1,
  "created": "2026-09-26T18:04:11Z",
  "updated": "2026-09-27T01:12:40Z",
  "playtime": 5231.4,
  "build": "2026-09-26",
  "mode": "campaign",
  "seed": 918273,
  "difficulty": "normal",

  "hero": {
    "name": "Wren", "class": "lamplighter", "level": 7, "xp": 1340,
    "attrs": { "might": 8, "wick": 14, "draught": 11, "nerve": 9, "knack": 6 },
    "unspent": { "attr": 0, "skill": 1 },
    "skills": { "ll_steady_hand": 2 },
    "hp": 112, "oil": 70, "maxHpLost": 0,
    "look": { "hood": 2, "cloak": "#3a2f45" }
  },
  "wicks": [
    { "id": "w1", "flame": "ember", "shape": "bolt", "charms": ["split"], "knot": null,
      "burn": { "xp": 640 }, "name": "Odile's Little Sparrow" },
    { "id": "w2", "flame": "gleam", "shape": "ring", "charms": [], "knot": null, "burn": { "xp": 90 }, "name": null }
  ],
  "loadout": { "slots": ["w1", "w2"], "selected": 0 },
  "unlocked": {
    "flames": ["ember", "gleam", "rime", "spark"], "shapes": ["bolt", "ring", "lob", "arc"],
    "charms": ["split"], "knots": [],
    "mechanics": ["wick_builder", "plank_kit"], "wickSlots": 2, "charmSlots": 1
  },
  "inventory": {
    "equipped": { "weapon": { "base": "pole_lantern", "rarity": "magic", "ilvl": 6, "affixes": [ { "id": "light_radius", "value": 0.07 } ] } },
    "bag": [], "consumables": { "oil_flask_small": 3 }, "keys": [], "scrap": 5, "blueprints": []
  },
  "currency": { "pennies": 212, "pearls": 1, "marksEarnedThisRun": 0 },

  "world": {
    "act": "act1", "room": "a1_wax_stair_02", "lampPost": "lp_a1_02",
    "lampsLit": [],
    "roomState": { "a1_wax_stair_02": { "scrap_1": "taken", "sp_mites": "cleared" },
                   "a1_crypt_05": { "chest_1": "open", "wall_secret": "broken" } },
    "actMaps": { "act1": { "visited": ["n1", "n2a"], "cleared": ["n1"], "revealed": ["n1", "n2a", "n2b", "n3"] } }
  },
  "story": { "flags": { "met_odile": true }, "npcs": { "odile_pennywax": { "disposition": 0.25, "met": true, "memories": [] } } },
  "shops": { "shop_pawn": { "sold": [ { "base": "rusty_hook", "price": 8, "room": "a1_crown_gate" } ], "mood": 0.1 } },
  "stats": { "kills": 88, "deaths": 2, "ropeMetres": 0, "oilSpent": 1840, "cellsBurned": 12003 },
  "ledger": { "fights": [], "itemStats": {} },
  "rng": { "loot": 3942781, "spell": 118273, "talk": 55120 }
}
```

`roomState` holds only things whose prefab `save` policy is `state` or `once` (§5.20), keyed by thing id.
Things never written: cell terrain changes, enemies (rooms respawn their spawns unless `cleared` is set and
the room kind is not `combat` with `respawn: true`), particles, liquids.

### 7.3 Profile schema

```json
{ "schema": 1, "marks": 14, "classes": ["lamplighter", "sluicewarden", "tinker"],
  "trials": { "trial_rope_gauntlet": { "best": 131.2, "done": true } },
  "challenges": { "bellringer_silent_bells": { "value": 5, "found": ["sb_a1_1", "sb_a2_3"] } },
  "modes": ["campaign", "waves", "trials"], "cosmetics": ["hood_moth"],
  "stats": { "ropeMetresRun": 412, "bossesBeaten": ["boss_tallow"] },
  "tutorialsSeen": ["move", "wick_builder"], "codex": { "enemies": ["wax_mite"] } }
```

### 7.4 When saving happens

Canon: **mid-room saves happen only at lamp posts** (plus a few safe points).

| Moment | What is written |
|---|---|
| interacting with a `lamp_post` | whole slot; `world.lampPost` = that post; hp/oil refilled first |
| lighting a Great Lamp | whole slot |
| entering an act hub room | whole slot |
| buying/selling at a shop | `inventory`, `currency`, `shops` of the slot (a partial write of the same JSON) |
| unlocking a class/trial/cosmetic, earning marks | `profile` only (immediately) |
| quitting from the pause menu | **nothing new** — resume puts you at the last lamp post with the state saved there (the menu says so) |
| death | nothing written; respawn at the last lamp post with its saved state; pennies dropped where you died (rules in `08`) |
| settings change | `settings` (debounced 300 ms) |

Every write: serialise → size check → copy current slot to `slotN.bak` → write `slotN` → re-read and
`JSON.parse` it to verify. On load, if `slotN` fails to parse or migrate, offer the `.bak`.

### 7.5 Versioning and migrations

`js/save/migrations.js`:

```js
export const CURRENT = 1;
export const MIGRATIONS = [
  // { from: 1, to: 2, up(s) { s.hero.look ??= {}; return s; } },
];
export function migrate(save) {
  let s = structuredClone(save);
  while (s.schema < CURRENT) {
    const m = MIGRATIONS.find(m => m.from === s.schema);
    if (!m) throw new Error(`No migration from schema ${s.schema}`);
    s = m.up(s); s.schema = m.to;
  }
  if (s.schema > CURRENT) throw new Error('Save is from a newer build');
  return s;
}
```

Rules: a migration never deletes a field it does not understand (it moves it to `s._legacy`); every
migration gets a fixture (`tests/fixtures/saves/v<N>.json`) and a unit test; ids renamed in data get a map
in `migrations.js` (`RENAMED = { charms: { old_id: 'new_id' } }`) applied on load so a renamed charm never
disappears from a save.

### 7.6 Export / import

Pause → Save slots → **Export** downloads `lanternfall-slot1-<date>.json` (`shared/ui.js` `downloadJSON`);
**Import** reads one (`readJSONFile`), migrates, validates, and asks which slot to overwrite.

---

## 8. Settings

Stored under `settings` (one object; defaults in `js/save/settings.js`; UI in `02-CONTROLS-UI.md`).

```json
{ "schema": 1,
  "audio": { "master": 0.8, "sfx": 0.9, "ambience": 0.7, "voice": 0.9, "music": 0.6, "sfxMethod": "hybrid", "voices": true, "babble": true, "mono": false },
  "video": { "renderer": "auto", "scale": "auto", "bloom": 0.35, "physicsDetail": "high", "particles": "high",
             "rain": 1.0, "reflections": true, "shake": 1.0, "flashes": "normal", "brightnessFloor": 0, "fpsCounter": false, "vsync": true },
  "access": { "subtitles": true, "speakerNames": true, "flameGlyphs": false, "holdToCast": true, "aimAssist": 0, "gameSpeed": 1.0, "textSize": 1.0 },
  "controls": { "bindings": { "left": ["KeyA", "ArrowLeft"], "right": ["KeyD", "ArrowRight"], "jump": ["Space"], "cast": ["Mouse0"] }, "gamepad": { "deadzone": 0.2, "layout": "default" } },
  "ui": { "damageNumbers": true, "ledgerAuto": false, "minimap": true, "hints": true },
  "debug": { "langDebug": false }
}
```

- The full binding list and default keys belong to `02-CONTROLS-UI.md`; this schema stores
  `action → [event.code, …]` and gamepad button indices.
- `renderer`: `auto` | `webgl2` | `2d`. `physicsDetail`: `high` | `low` (`06` §10.6, §20.3).
  `flashes: "reduced"` caps light flashes at 0.5 intensity and disables full-screen whites.
  `flameGlyphs` draws a small shape per flame colour on projectiles and UI for colour-blind players.
- Settings load before anything renders; unknown keys are kept (forward compatible); missing keys get
  defaults.

---

## 9. Testing plan

Three layers, as in the rest of the playground: **Node unit tests** for pure logic, **Playwright** in a
real browser, and **headless sims** for balance and performance. Remember the house rules: run one
Playwright suite at a time on this machine, and when a spec is red, check whether it was red before your
change (the A/B memory note).

### 9.1 Node unit tests (`tests/unit/*.test.js`, `node --test`)

| File | What it proves |
|---|---|
| `purity.test.js` | every file in the pure folders imports in Node with no `window`/`document`; no file outside `world/grid.js` writes `grid.mat[`/`grid.temp[` (a grep); no `Math.random` in pure folders except the `fx` stream helper |
| `paths.test.js` | no `import`/`fetch`/`src`/`href` string in `js/`, `css/`, `*.html` or data starts with `/` (§12) |
| `data.test.js` | every data file passes `data-check` (ids unique, references resolve, known stats only, every flame/shape/charm/knot/class/boss/shop id from `00-OVERVIEW.md` present with the exact canon id) |
| `materials.test.js` | tables built right; every material has a ramp; every `*To` key exists |
| `cells.test.js` | sand pile angle (a poured column spreads to a slope within 2 cells of 45°), water levels flat within 1 cell after 600 ticks, oil ends on top of water, ash floats, bile sinks, U-tube equalises within 3 cells in 900 ticks, dispersion distance per tick, scan alternation leaves a symmetric pile, same seed → identical arrays (hash), water conservation through boil/freeze (`06` §8.8) |
| `thermal.test.js` | ember heat boils water to steam; rime freezes; ice melts after 90 ticks above 1 °C; wax melts at 60 and re-hardens < 50; ember cools to ash; heat stays in hot chunks only |
| `fire.test.js` | fire spreads along a wood beam at a measured rate band; a wet beam ignites ~4× slower; water puts fire out; oil burns across its whole surface ≤ 70 ticks |
| `support.test.js` | stone island with no anchor detaches; a stone ceiling tied to the frame holds at any width; brick span 24 holds 24 and drops 25; rope cut at the top drops whole; budget carry-over; fragment lands and shatters proportional to fall; crush damage formula; powderise fallback |
| `liquids.test.js` | basin drain/fill rates; electrify reaches the whole body up to budget; surface finding; drain edges delete and count |
| `rain.test.js` | spawns only in sky columns; deposit cap and drain refund; drip points found under ledges |
| `collide.test.js` | step-up 3 cells, not 4; step-down glue; depenetration from buried sand; swim fraction thresholds; steam lift acceleration; web slow |
| `raycast.test.js` | DDA hits the first solid; passes glass for beams; no tunnelling at 7 cells/tick |
| `explode.test.js` | carve radius by resist; debris-to-cell budget 60/s; liquid thrown not destroyed |
| `wick.test.js` | **the spell compiler**: every flame × shape compiles; charm stacking order is deterministic; oil cost formula matches `03` examples to the cent; invalid wicks (locked charm, too many charms for slots, knot before Act 4) give the right reason string; overcharge curve (+80% at 2× oil) and gutter chance; burn-in +6%/level |
| `damage.test.js` | damage formula examples from `03`/`04` (armour, resist, crit, `vs` tags, Shade ignores armour); one record per hit written to a fake meter with the right fields |
| `status.test.js` | stacking/refresh rules per status |
| `stats.test.js` | attribute → derived stat formulas from `04` |
| `loot.test.js` / `shops.test.js` | weights over 100,000 seeded rolls within 1% of table weights; every shop quirk hook exists and does its one thing (Odile's lamp discount, Crane remembers sales, Ferry takes max HP) |
| `wiring.test.js` | signal chains, `when` filters, logic gates, latch/delay, loop cut at depth 16 |
| `rooms.test.js` | **every room in `rooms/index.json` compiles** and passes `room-check`; the two examples in this page compile to the same cell hash as the checked-in files (so the doc stays true) |
| `save.test.js` | round-trip a full slot; each migration against its fixture; renamed-id map; size trim; `.bak` fallback on a corrupt slot |
| `replay.test.js` | a recorded 600-tick input file on `test_replay` room reproduces the same final state hash |
| `bus.test.js`, `rng.test.js` | ordering, `off`, fork independence, state round-trip |

Run: `node --test prototypes/lanternfall/tests/unit/*.test.js` (and via the root `npm run test:unit`).

### 9.2 Playwright specs (`tests/e2e/*.spec.js`, against the dev server on 8401)

| Spec | Steps and assertions |
|---|---|
| `boot.spec.js` | load `index.html`; no console errors, no failed requests; title screen visible; `window.lanternfall.ready === true`; data validation errors empty; both `?renderer=webgl2` and `?renderer=2d` boot |
| `newgame.spec.js` | title → New Game → pick Lamplighter → first room loads; HUD shows HP, oil, 1 wick slot |
| `scripted-room.spec.js` | open `?room=test_script_01&debug=1`; drive with `lanternfall.input.script([...])` (run right 2 s, jump, cast Ember Bolt at a wood crate); assert via the debug API: crate cells burning within 60 ticks, an enemy dummy's HP dropped by the expected amount, the meter has a record with `via` = the wick id |
| `water.spec.js` | `?room=test_flood`: pull the lever via `lanternfall.act('interact')` → basin level falls below a line within 20 s; screenshot shows the reflection pass active (pixel test: water region differs from the no-reflection render) |
| `light.spec.js` | darkness room: lantern off vs on → mean luminance of a region changes by > 3×; enemy eye pixels bright at the darkest setting (pillar 5) |
| `wickbuilder.spec.js` | open the builder, drag a flame/shape/charm, the preview text and oil cost update, save the wick, cast it |
| `save.spec.js` | touch a lamp post → reload page → Continue → same room, same inventory; export/import round-trip |
| `settings.spec.js` | change volume/bindings/renderer; reload; persisted; rebinding jump to `KeyW` works |
| `menus.spec.js` | every screen opens and closes with keyboard only and with mouse; phone viewport 390×844 shows the "desktop recommended" notice and menus fit without horizontal scroll |
| `context-loss.spec.js` | force `WEBGL_lose_context` → restore → frame renders, no errors |
| `rooms-smoke.spec.js` | loads every room id for 60 frames with the player idle; no errors; frame p95 recorded per room into `test-results/lanternfall-rooms.json` |

Screenshots go to `test-results/`. Desktop 1280×800 (config default) plus a 1920×1080 project for render
specs.

### 9.3 Headless balance sim (`tools/sim-lanternfall.mjs`) and wick ranking

- **`wick-rank.mjs`** (verdict risk 3): for every legal wick (7 flames × 8 shapes × every charm combo up to
  the slot limit for each act, knots from Act 4), compile it and simulate 30 s against three standard target
  sets (single tank, pack of 6 small, a mixed wet/oily group) in a flat test room with the real spell and
  damage code. Output `research/wick-rank.md`: damage per oil, damage per second, time-to-kill, rank; and
  **flag every wick above 1.5× the median damage-per-oil of its act tier** as a balance bug. Runs in
  under 2 minutes by using a tiny room and no rendering.
- **`sim-lanternfall.mjs --runs 200`**: a bot plays the campaign's act maps as data (not physics): each room
  is resolved by a fight model fed from `enemies.json`/`bosses.json` and the hero's compiled wicks, with the
  real XP, loot, shop and level code. Reports per act: level on arrival vs `acts.json` `levels`, pennies
  earned vs shop prices, deaths per boss, which wicks the bot favoured. Writes `research/sim-report.md`.
- **Boss sims:** each boss script can run headless against a scripted dodger bot with a chosen build;
  reports fight length and damage taken per attack (to catch an attack that hits too hard for its telegraph).

### 9.4 Performance benchmark spec

- `tools/bench.mjs` runs `bench_flood` (`06` §21) in headless Chromium via Playwright's API and prints the
  report; `--save-baseline` writes `tests/fixtures/bench-baseline.json`.
- `tests/e2e/perf.spec.js` runs the same room and fails if **sim p95 grows more than 25%** or **cells
  scanned per tick grow more than 25%** over the baseline (ratios, not milliseconds — headless GPU is software
  so absolute frame times there mean nothing). The absolute pass line (frame p95 ≤ 16.7 ms on the reference
  laptop) is checked by hand at each milestone that touches world/render, with the numbers written to
  `research/perf-log.md`.

---

## 10. Playground integration (Lingo, voices, meter, sound)

All four are optional at runtime: if one fails to load, the game still runs (a stub is used and the debug
overlay shows a yellow warning). Node tests use stubs.

### 10.1 Lingo (`js/talk/lingo-bridge.js`)

```js
import { Lingo, Speaker, Entity } from '../../../../lingo/js/lingo.js';

const LINGO = new URL('../../../../lingo/data/', import.meta.url);
const OWN = new URL('../../data/', import.meta.url);
const getJSON = (u) => fetch(u).then(r => r.json());

export async function createTalk({ seed, npcs }) {
  const [lexicon, grammar, traits, pack, extra] = await Promise.all([
    getJSON(new URL('lexicon.json', LINGO)), getJSON(new URL('grammar.json', LINGO)),
    getJSON(new URL('traits.json', LINGO)), getJSON(new URL('packs/lanternfall.json', LINGO)),
    getJSON(new URL('grammar-lanternfall.json', OWN)),
  ]);
  const lingo = new Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  for (const [name, list] of Object.entries(extra.symbols)) for (const entry of list) lingo.grammar.add(name, entry);

  const speakers = new Map();
  for (const n of npcs) speakers.set(n.id, new Speaker({ id: n.id, name: n.name,
    entry: lingo.lexicon.get(n.lexicon), lexicon: lingo.lexicon, speech: n.speech }));

  return {
    lingo,
    speaker: (id) => speakers.get(id),
    /** Returns { text, speech, tags } or null. ctx may carry foe/item/place Entities. */
    say(speakerId, intent, ctx = {}) {
      const speaker = speakers.get(speakerId); if (!speaker || !lingo.grammar.has(intent)) return null;
      return lingo.speak(intent, { speaker, ...ctx });
    },
    foe: (enemyId, count = 1) => new Entity(lingo.lexicon.get(enemyId), { lexicon: lingo.lexicon, count }),
  };
}
```

Game code never calls Lingo directly: it emits `talk.request { speakerId, intent, ctx, x, y }` → the bridge
speaks → emits `talk.line` → the voice bridge and speech-bubble UI react. Barks go through `talk/barks.js`
throttling. Memories and relationships (Lingo's `memory.js` / `relations.js`) are used for NPC dispositions
and Crane's "remembers every item you sold" — details in `01-WORLD-STORY.md` and `08-ITEMS-SHOPS.md`.

### 10.2 Voices (`js/audio/voice-bridge.js`)

```js
import { say, stopAll } from '../../../../voice-lab/js/voice.js';
import { voiceFor } from '../../../../shared/voices.js';

export function createVoiceBridge({ bus, settings, npcs, enemies, camera }) {
  const voices = new Map();
  const voiceOf = (id) => {
    if (!voices.has(id)) {
      const n = npcs.byId[id] || enemies.byId[id];
      voices.set(id, n?.voice?.custom || voiceFor({ role: n?.voice?.role || 'villager', gender: n?.gender || 'n', seed: n?.voice?.seed || 1 }));
    }
    return voices.get(id);
  };
  bus.on('talk.line', ({ speakerId, speech, x, y, babble }) => {
    if (!settings.audio.voices) return;
    const v = voiceOf(speakerId);
    const pan = x == null ? 0 : Math.max(-1, Math.min(1, (x - camera.cx) / 240));
    say(babble ? '' : speech, babble ? { ...v, engine: 'babble' } : v, { volume: settings.audio.voice, pan });
  });
  return { stopAll };
}
```

Rats and moths use the `babble` engine (canon §13). The Narrator uses `voiceFor({ role: 'narrator' })` — add
`narrator` to `ROLE_VOICES` in `shared/voices.js` if it is not there (Emberveil already added one: check
before adding). Max 2 voices at once; a new line from the same speaker cuts its old one.

### 10.3 The Ledger (meter, `js/rpg/damage.js` + `js/ui/ledger.js`)

```js
import { Meter } from '../../../../meters/js/meter.js';
// one Meter per run; a "fight" = one room visit (startFight on room.enter, endFight on room.exit)
game.meter = new Meter({ maxFights: 60 });

// inside dealDamage(): exactly one record per hit
game.meter.record({
  t: game.tick / 60,
  source: src.id, sourceName: src.name,
  target: tgt.id, targetName: tgt.name,
  kind: 'damage', amount, overkill, crit,
  dtype: flame ? data.flames.byId[flame].meterType : 'physical',   // fire|frost|… so the bars colour
  via: wick ? wick.id : 'melee', viaName: wick ? wick.name || wickLabel(wick) : 'Pole',
  itemId: weaponItemId, killingBlow, tags: [shape, ...charms],
});
```

Healing (`gleam`, `siphon`) writes `kind: 'heal'` with `overheal`; statuses write `kind: 'status'`; deaths
`kind: 'death'`. **Each wick is a source** (canon §13): `via` is the wick id so the Ledger's drill-down goes
player → wick → hits. The Ledger tab mounts `meters/js/meter-ui.js` `renderMeter(meter, root, state)` inside
our own themed panel (`02-CONTROLS-UI.md`).

### 10.4 Sound (`js/audio/sfx-bridge.js`)

```js
import { Sfx } from '../../../../sfx/js/sfx.js';

export async function createSfxBridge({ bus, settings, map }) {       // map = data/sfx-map.json
  const sfx = await Sfx.create({ method: settings.audio.sfxMethod, volume: settings.audio.master });
  const play = (key, payload = {}) => {
    const id = map[key] ?? null;
    if (!id || !sfx.entry(id)) return;                                  // unknown ids are skipped, and listed by data-check
    sfx.cue(id, { pan: payload.pan ?? 0 });
  };
  bus.on('cast.release', (e) => play(`cast.${e.plan.flame}`, e));
  bus.on('hit', (e) => play(e.crit ? 'hit.crit' : `hit.${e.flame || 'physical'}`, e));
  bus.on('explode', (e) => play('explode', e));
  bus.on('pickup', (e) => play(e.item ? `loot.${e.item.rarity}` : 'coin', e));
  bus.on('room.enter', (e) => { sfx.stopLoops(); const amb = e.ambience; if (amb) sfx.ambience(amb); });
  return sfx;
}
```

`data/sfx-map.json` maps our event keys to catalog ids, e.g.
`{ "cast.ember": "spell.fire.launch", "hit.ember": "spell.fire.impact", "cast.rime": "spell.ice.launch",
"cast.spark": "spell.lightning.launch", "cast.bile": "spell.poison.launch", "cast.gleam": "spell.holy.launch",
"cast.tide": "spell.arcane.launch", "cast.shade": "spell.shadow.launch", "hit.crit": "melee.crit",
"levelup": "levelup", "coin": "coin", "ui.click": "ui.click" }`.

**Sounds the shared catalog does not have yet** (listed under `"missing"` in `sfx-map.json`, and added to
`sfx/` — its `data/catalog.json` + synth recipes — as their own milestone): `ambience.rain.light`,
`ambience.rain.heavy`, `rain.tick.metal`, `water.splash.small`, `water.splash.big`, `water.pour`,
`water.drain`, `steam.hiss`, `fire.whoosh`, `fire.crackle` (loop), `ice.form`, `ice.crack`, `stone.crumble`,
`fragment.crash` (3 sizes), `lever.pull`, `door.grind`, `sluice.open`, `rope.creak`, `grapple.fire`,
`lamp.relight`, `lamp.post`, `bell.toll`, `gutter.burst`, `oil.pickup`, `pearl.pickup`. `tide` has no element
of its own in the catalog; `spell.arcane.*` stands in until `spell.water.*` is added. Adding ids to the shared
catalog must not change any existing id (Emberveil and Farhold use it).

---

## 11. Debug tools

### 11.1 Turning it on

`?debug=1` in the URL, or the backquote key (`` ` ``) when `settings.debug` is enabled in Settings →
Debug. Debug keys only work while the overlay is open (so they never collide with play bindings in
`02-CONTROLS-UI.md`).

### 11.2 The overlay (`debug/overlay.js`)

| Key (overlay open) | Toggles |
|---|---|
| `1` | chunk grid: awake (green), slow lane (yellow), asleep (none), dirty rects (magenta outlines) |
| `2` | temperature heat map (blue → white → red) |
| `3` | material ids as flat colours (no lighting) |
| `4` | light list: circles for every light, shadowed ones solid; the occlusion texture as an inset |
| `5` | liquid bodies (each a colour) + basin levels + surfaces |
| `6` | support: queued cells, last detached groups, live fragments' boxes |
| `7` | entity boxes, AI state labels, nav graph, sight rays |
| `8` | wiring: lines between things with the last signal value |
| `9` | perf graph: sim ms, frame ms, awake chunks, cells scanned, particles, uploads (last 240 frames) |
| `0` | turn all off |
| `P` | pause/unpause; `.` step one tick; `,` step 10 ticks; `[` `]` speed ÷2 / ×2 (0.25–4) |
| `G` | god mode (no damage, infinite oil) |
| `N` | noclip fly (arrows/WASD, Shift ×4) |
| `R` | reload the current room from disk (re-fetch its JSON, keep the player's position) |
| `L` | toggle lighting off (full bright) |
| `K` | kill every enemy in the room |

### 11.3 Cell inspector (`debug/inspector.js`)

Hover shows, for the cell under the mouse: `x, y`, material key, class, shade, temp, life, flags (named),
aux, bg material, chunk (awake/dirty), liquid body id and size, `lightAt`, and the nearest thing's id.
**Click** pins the readout; **Shift+click** opens a small editor for that cell's fields.

### 11.4 Spawn menu and brush (`debug/spawn.js`)

A side panel (`Tab` with the overlay open):

- **Brush:** pick any material, radius 1–24, paint with left mouse, erase with right; `temp` brush (±200 °C);
  `wet` brush; `ignite` brush; `explode` click (radius/power sliders).
- **Spawn:** any enemy (with elite modifiers), boss (in any room), NPC, pickup, item by id + rarity, thing
  prefab.
- **Give:** unlock any flame/shape/charm/knot/mechanic; set level; add pennies/pearls/marks; fill the Wick
  builder with every part.
- **Room:** jump to any room id + entry (a searchable list from `rooms/index.json`); reseed the decorator;
  toggle rain; set time scale.

### 11.5 Room editor-lite (`editor.html`, `debug/editor.js`)

Not a full level editor — a helper for tweaking agent-made rooms:

- Loads a room by id; shows the **coarse map grid** (click a block, pick a legend char), the compiled
  preview (live re-compile on change, ~150 ms), and overlays for ops (outlines) and things (icons).
- Drag things to move them (snaps to 1 cell, Shift to 8); edit props in a form generated from
  `prefabs.json`; draw a wire by dragging from one thing to another and choosing an action.
- Ops list: reorder, toggle, edit numbers.
- **Play from here** opens `index.html?room=<id>&debug=1&at=x,y` in a new tab.
- **Export:** "Download JSON" (`shared/ui.js` `downloadJSON`) and "Copy JSON" (`copyText`). The file is then
  put in `rooms/` by hand or by Claude; the editor never writes to disk itself (the dev server has no write
  endpoint for rooms, and adding one is not needed).
- Runs `room-check` rules in the browser and lists problems.

### 11.6 `window.lanternfall` (debug API, always present; mutating calls need `?debug=1` or `?test=1`)

| Member | Use |
|---|---|
| `ready` | true once the first room has compiled and rendered a frame |
| `version`, `dataErrors`, `warnings` | build date, validation errors, integration warnings |
| `game` | the live `Game` object (read-only by convention) |
| `room()` | `{ id, size, kind, things: [...ids], basins: {...} }` |
| `cell(x, y)` | inspector readout for a cell |
| `count(mat, rect?)` | cells of a material (e.g. water total) |
| `player()` | `{ x, y, vx, vy, hp, oil, grounded, swimming, wick }` |
| `entities(kind?)` | list of `{ id, kind, x, y, hp }` |
| `input.script(steps)` | feed intents: `[{ ticks: 120, right: true }, { ticks: 1, jump: true }, { ticks: 30, cast: 0, aim: [300, 140] }]` |
| `act(action, arg)` | one-shot actions: `interact`, `cast`, `melee`, `build`, `grapple` |
| `step(n)` / `pause(on)` / `speed(x)` | drive time deterministically |
| `loadRoom(id, entry)` | jump |
| `spawn(kind, id, x, y)` / `give(kind, id, n)` / `unlock(kind, id)` | setup for tests |
| `setCell(x, y, mat)` / `paint(rect, mat)` / `explode(x, y, r, p)` / `heat(x, y, r, t)` | world setup for tests |
| `meter()` | `game.meter.toJSON()` |
| `perf` | live counters + `bench` report (`06` §21.3) |
| `save(slot)` / `load(slot)` / `clearSaves()` | save tests |
| `screenshotRegion(rect)` | mean RGB + luminance of a screen region (for light/water pixel tests) |
| `hash()` | a hash of the grid + entities (replay/determinism tests) |

---

## 12. Paths, serving and publishing

- **Every path is relative.** In HTML: `href="css/base.css"`, `src="js/main.js"`. In modules:
  `import { x } from '../world/grid.js'`; shared helpers from inside `js/<folder>/`:
  `'../../../../shared/store.js'`; from `js/main.js`: `'../../../shared/store.js'`. Data:
  `new URL('../../data/flames.json', import.meta.url)` — never `fetch('/prototypes/...')`. Rooms:
  `new URL('../../rooms/act1/a1_wax_stair_02.json', import.meta.url)` built from `rooms/index.json`'s
  relative `file` field. CSS `url()` values are relative to the CSS file. `paths.test.js` (§9.1) fails on any
  string starting with `/`.
- **Serving:** the playground's two servers (`tools/serve-both.sh`): give the user the **stable** URL,
  `http://<LAN-IP>:8400/prototypes/lanternfall/`; Playwright runs against dev `8401`. Promote with
  `tools/publish-stable.sh`, then `tools/publish-pages.sh` for GitHub Pages
  (`https://radgh.github.io/Game-Playground/prototypes/lanternfall/`).
- **Fonts:** Cinzel and Spectral from Google Fonts (a `<link>` in `index.html`), with serif fallbacks so an
  offline copy still works. The 5 × 7 pixel font is code.
- **No service worker, no CDN scripts.** Everything else is in the repo.

---

## 13. Milestone 1 checklist for this page

Before content work, the first milestone lands exactly this from page 10 (page 06 §23 lists its half):

1. Folder layout (§2) with `index.html`, `README.md`, `css/base.css`, empty module files with their public
   signatures stubbed.
2. `core/`: loop, tick, bus, rng, data loader, input (keyboard only), state.
3. `data/materials.json`, `legend.json`, `themes.json` (two themes: `bench`, `wax_chapel`), `prefabs.json`
   (entry, exit, light, lever, door, basin-related, drip).
4. `world/roomload.js` + `decor.js` compiling `bench_flood`, the two examples in §6.13–6.14, and three test
   rooms.
5. `tools/room-check.mjs`, `tools/room-thumbs.mjs`, `tools/room-new.mjs`, `tools/bench.mjs`.
6. `debug/api.js` with `ready`, `cell`, `count`, `step`, `perf`, `hash`; overlay keys `1`, `3`, `9`, `P`, `.`.
7. Unit tests: `purity`, `paths`, `materials`, `cells`, `rooms`, `rng`, `bus`; Playwright: `boot`, `perf`.
8. Register the prototype (root `index.html` card, CLAUDE.md prototype row, `~/claude/docs/playground.md`
   line, `package.json` unit glob).

---

## 14. Proposed canon changes

1. **Shared sound catalog additions** (§10.4): Lanternfall needs ~26 new sound ids (rain, water, steam,
   ice, stone, levers, lamps, bells) and a `spell.water.*` element for Tide. These are additions to the
   shared `sfx/` experiment, not a canon change to the game, but they affect other projects' catalog files
   and so should be done as their own reviewed step.
2. **Narrator voice role:** `shared/voices.js` may need a `narrator` role (check first). Same note.
3. **Save policy wording:** canon doesn't say what "quit mid-room" does; this page makes it "resume at the
   last lamp post with that post's saved state". Please confirm in `00` or `09`.
4. **Room id convention** `a<act>_<area>_<nn>` / `tr_` / `wv_` / `ed_` / `bench_` / `test_` should be added
   to canon so pages 01 and 09 name rooms the same way.
