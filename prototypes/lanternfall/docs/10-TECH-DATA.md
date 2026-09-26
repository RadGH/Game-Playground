# LANTERNFALL — 10: Tech, Data and Room Authoring

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> How the code is laid out, how a frame runs, every data file and its shape, the room format an agent
> uses to build ~55 hand-made rooms and 6 room kits, saves, settings, the playground integrations, tests,
> tools and debug tools.

**10 owns** (00 §3): the file manifest, folders, JSON field shapes, the room format, the save format and its
budgets, module names, tests, tools, the debug API and the playground bridges (Lingo, voices, meter, sfx,
score). **Content pages own the values** inside those shapes: where this page shows a number inside an example
JSON it is **an example of the shape**, and the owner page wins. No other page keeps its own file list; they link
to §5.0. The cell world and renderer rules are `06-PHYSICS-RENDER.md`.

**Built vs planned.** The engine is partly built (commits `1080613`, `d6bd82d`, `c0ef340` and the M1–M5 work
in progress). Every table below marks each file **built** (exists in the tree now) or **planned** (with its
milestone from `REVIEW.md` §d). A built file's listed functions are its real exports.

## Contents

1. [Principles](#1-principles)
2. [Folder layout](#2-folder-layout)
3. [Modules and their public functions](#3-modules-and-their-public-functions)
4. [Main loop, game state, event bus, random numbers](#4-main-loop-game-state-event-bus-random-numbers)
5. [Data files: the manifest and every shape](#5-data-files-the-manifest-and-every-shape)
6. [The room authoring format](#6-the-room-authoring-format)
7. [Save format](#7-save-format)
8. [Settings](#8-settings)
9. [Testing plan and tools](#9-testing-plan-and-tools)
10. [Playground integration (Lingo, voices, meter, sound, score)](#10-playground-integration-lingo-voices-meter-sound-score)
11. [Debug tools](#11-debug-tools)
12. [Paths, serving and publishing](#12-paths-serving-and-publishing)
13. [Build order](#13-build-order)
14. [Applied in v2 — v2 changes](#14-applied-in-v2--v2-changes)
15. [Parked (v2)](#parked-v2)

---

## 1. Principles

1. **No build step.** Plain HTML, standalone `.css` files, ES modules (`<script type="module">`). No npm
   packages at runtime. (Playground convention 2.)
2. **Single thread** (00 §13). Sim, AI, spells, ropes, talk and audio share the main thread. No Worker, no
   `SharedArrayBuffer`. The per-frame p95 budget is 00 §13's (sim ≤ 4 ms, AI + spells + ropes ≤ 3 ms, render
   CPU ≤ 2 ms, talk + audio ≤ 1 ms); 06 §20 splits it.
3. **The 60,000 awake-liquid cap.** No scene holds more than 60,000 awake liquid cells; big water is
   height-field water with a ≤ 8-row band of real cells (06 §8.9). `room-check` enforces it (§6.11).
4. **The simulation has no DOM.** Everything under `js/core`, `js/world`, `js/entities`, `js/spells`, `js/rpg`,
   `js/ai` and `js/modes` imports and runs in Node 20 with no browser globals. Only `js/render`, `js/ui`,
   `js/audio`, `js/debug` and `js/main.js` may touch `window`, `document`, WebGL or WebAudio. A unit test
   enforces this (§9.1 `purity.test.js`).
5. **Data first.** Every tunable number, name and list is in `data/*.json` or `rooms/**.json`. Code reads ids,
   never hard-codes a monster or a charm. (Convention 7.)
6. **Same input, same result.** The sim runs at a fixed 60 Hz, gameplay randomness comes from seeded streams
   (§4.4), and input is recorded as per-tick intents. Replays exist **only to prove determinism** (same log →
   same state hash, R49); puzzle tests are verb-level solution scripts (§6.11).
7. **Relative paths only.** The site lives under `/Game-Playground/` on GitHub Pages; a path starting with `/`
   breaks there (§12).
8. **No third-party IP** in anything the player sees (convention 9).
9. **One writer per thing.** Cells are written only through `grid.set` / `grid.swap` (06 §2.3); save data only
   through `save/save.js`; settings only through `save/settings.js`; sounds only through `audio/sfx-bridge.js`.
10. **No module without a door** (00 §13, B17). Every milestone leaves its work reachable from the title screen,
    and `tools/reach-check.mjs` fails on any `js/` module not reachable from `main.js`, any data file not in the
    manifest or never read, and any data id never referenced (§9.5).

---

## 2. Folder layout

```
prototypes/lanternfall/
├── index.html                 title screen + game canvas + DOM HUD root                       (built)
├── README.md                  what this prototype tests, what worked, what didn't              (planned, M8)
├── css/
│   ├── base.css               fonts (Cinzel, Spectral), colours as CSS variables, layout       (built)
│   ├── hud.css                in-game HUD (02)                                                 (built, empty)
│   ├── menus.css              title, pause, inventory, wick builder, map, shops, settings      (built, empty)
│   └── debug.css              overlay, inspector, editor                                       (planned)
├── docs/                      this design bible (00–10, REVIEW, EDIT-ORDERS, CHANGELOG, ROAST, research-*)
├── data/                      every JSON file in §5.0; data/acts/ holds one file per act       (built, partial)
├── dev/                       one-off agent tools: render.html (the cell/render test scene), shot.mjs
│                              (headless screenshot), cast.mjs, move.mjs, fight.mjs (scripted checks) (built)
├── spike/                     the pitch-stage render/cell spike, kept for reference            (built)
├── js/
│   ├── main.js                boot: load data, build the renderer and the Game, start the loop (built)
│   ├── core/                  loop, tick order, bus, rng, input, data loader, math, state      (built)
│   ├── world/                 the cell world and everything in 06                              (built, partial)
│   ├── render/                WebGL2 renderer, shaders, camera, frame builder, sprite atlas    (built)
│   ├── entities/              player, actors, particle pool; prefabs/ one file per thing type  (built, partial)
│   ├── spells/                wick compiler, casting, shape handlers; shapes/                  (built, partial)
│   ├── rpg/                   damage, statuses; stats, levels, boards, items, loot, shops      (built, partial)
│   ├── ai/                    brain.js (built); senses, nav; behaviours/, bosses/             (built, partial)
│   ├── modes/                 campaign, act map, Floodgate, Long Descent, Daily, Boss Rush, Trials (empty)
│   ├── ui/                    HUD and screens                                                  (empty)
│   ├── audio/                 sfx bridge, voice bridge, the score                              (empty)
│   ├── talk/                  Lingo bridge, speakers, barks                                    (empty)
│   ├── save/                  slots, migrations, settings, profile                             (empty)
│   └── debug/                 bench.js (built); api, overlay, inspector, spawn, editor (planned)
├── rooms/
│   ├── index.json             every playable room: id → file, act, kind; plus "examples"       (built)
│   ├── _template.json         the blank room an agent copies (§6.10)                           (planned, M11)
│   ├── bench/                 bench_flood (06 §21)                                             (built)
│   ├── test/                  tiny rooms used by unit + Playwright tests                       (folder only)
│   ├── act1/ … act6/          campaign rooms (act1/, act3/ hold the two worked examples)       (built, partial)
│   ├── trials/                trial rooms                                                      (folder only)
│   ├── waves/                 the Floodgate arena                                              (folder only)
│   ├── endless/               rooms tagged for the Long Descent                                (folder only)
│   └── _thumbs/               compiled-room PNGs from room-thumbs (git-ignored)                (built)
├── tests/
│   ├── unit/*.test.js         node --test                                                      (built, partial)
│   ├── fixtures/              saves/v<N>.json, recorded inputs, bench baseline                 (planned)
│   └── e2e/*.spec.js          Playwright                                                       (planned, M2)
└── tools/
    ├── png.mjs                tiny PNG writer, no dependencies                                 (built)
    ├── room-thumbs.mjs        compile a room and write rooms/_thumbs/<id>.png (§6.11)          (built)
    ├── room-check.mjs         validate rooms, reachability as an error (§6.11)                 (built, partial)
    ├── bench.mjs              run bench_flood headless and print the report (§9.4)             (built)
    ├── room-new.mjs           scaffold a room or a kit instance (§6.10)                        (planned, M11)
    ├── data-check.mjs         validate every data file against §5 (cross-references too)        (planned, M8)
    ├── reach-check.mjs        no module / data file / id without a door (§9.5)                 (planned, M8)
    ├── wick-rank.mjs          damage-per-oil and utility ranking of every wick (§9.3)          (planned, M7)
    └── sim-lanternfall.mjs    headless balance sim (§9.3)                                      (planned, M36)
```

The prototype registers in the playground the normal way (a card in the root `index.html`, a row in
`~/claude/playground/CLAUDE.md`'s prototype table, a line in `~/claude/docs/playground.md`), and its unit tests
join the root `package.json` `test:unit` glob as `prototypes/lanternfall/tests/unit/*.test.js` (planned, M8 — not
in the glob yet).

---

## 3. Modules and their public functions

Only the public surface is listed; helpers stay private to their file. "Pure" = no DOM, runs in Node.

### 3.1 `js/core/` (pure; built)

| File | Responsibility | Public (as built) |
|---|---|---|
| `loop.js` | fixed-step loop with render interpolation (§4.1); the only file that calls `requestAnimationFrame` — injected, so Node drives it by hand | `STEP`, `createLoop({ tick, render, raf, now })` → `{ start(), stop(), pause(on), paused, setSpeed(x), stepOnce(), stats }` |
| `tick.js` | the tick order (06 §4.1) | `DT`, `tickGame(game, intent, view)` |
| `bus.js` | event bus (§4.3) | `createBus()` → `{ on(type, fn) → off, once, emit(type, payload), emitNow, flush(), clear(), pending() }` |
| `rng.js` | seeded random streams (§4.4), mulberry32 | `createRng(seed)` → `{ next, int(lo, hi), range, pick, chance(p), weighted(list, key='w'), shuffle, fork(name), state(), setState(s) }`, `hashSeed(...parts)` |
| `data.js` | loads every file in `data/manifest.json`, indexes lists by id, builds material tables; loads rooms through `rooms/index.json` | `loadData()` → `Data`, `loadRoom(data, id)`, `dataUrl(file)`, `roomUrl(rel)`, `readJson(url)` |
| `input.js` | raw keyboard/mouse → per-tick `Intent`; rebinding; a script driver for tests | `createInput(bindings)` → `{ mouse, bindings(), bind(action, codes), onKey(code, down), clear(), script(steps), poll() → Intent, record(on), isDown(a) }`; `bindingsFrom(json, context)` maps `data/bindings.json`'s action names (02) onto the sim's intent names through `ALIASES` (built; `main.js` uses it, R18); `DEFAULT_BINDINGS` is only the fallback. Gamepad and the other contexts land in M5 |
| `math.js` | small helpers | `clamp, lerp, sign, approach, dist, aabbOverlap, hexToRgb, hexToRgb01, smoothDamp` |
| `state.js` | builds a fresh `Game` (§4.2) and enters rooms | `createGame({ data, mode, seed, save })`, `enterRoom(game, roomJson, entryId, opts)` |

### 3.2 `js/world/` (pure) — the rules are in `06-PHYSICS-RENDER.md`

| File | Status | Public |
|---|---|---|
| `materials.js` | built | `buildMaterials(json)` → `Mats` (typed tables, 06 §5.3); `M` (id constants: `M.WATER`…), `CLS`, `RESIST_KINDS` |
| `grid.js` | built | `createGrid(W, H, mats)` (API in 06 §2.3; includes the chunk state, `touch`, `beginTick`, `rand`), `CHUNK`, `F` (flag bits), `AMBIENT_TEMP` |
| `cellsim.js` | built | `stepCells(world, view)` (pass A + pass B, sim window + slow lane), `ignite(g, i, x, y)` |
| `thermal.js` | built | `stepThermal(world)` |
| `liquids.js` | built | `stepLiquids(world)` (equaliser), `surfaceAt(g, x, y)`, `electrify(world, x, y, ticks, budget)`, `stepShock(world)`, `createBasin(spec)`, `stepBasin(world, basin)` |
| `elements.js` | built | `applyElement(game, x, y, r, flame, opts)` → summary, `explode(game, x, y, r, power, opts)`, `HARDNESS` |
| `support.js` | built | `createSupport(world)` → `{ process(budget) → loose groups, visited, detached }` |
| `fragments.js` | built | `createFragments(world)` → `{ list, lowDetail, detach(cells), step(bodies) }` |
| `currents.js` | built | `createCurrents(things)`, `stepCurrents(game, currents)`, `createFloodline(spec)`, `stepFloodline(game, flood)` (06 §8.9–8.10) |
| `lightgrid.js` | built | `createLightGrid(grid, { res, floor })` → `{ update(lights), rebuildOpacity(), … }`, `collectLights(game)`, `tierOf(v)`, `TIER` (06 §14.7) |
| `reach.js` | built | `buildReachGraph(grid, movement, verbs, extra)`, `reachable`, `nearestNodes`, `nodesInRect` — the movement-aware reachability bot `room-check` uses |
| `collide.js` | built | `moveBox(g, body, dx, dy, opts)` → `{ hitX, hitY, landed, bonk, steppedUp }`, `depenetrate`, `sampleBox`, `grounded`, `headBlocked`, `overlapsSolid`, `extents`, `isSolidCell`, `wallTouchRows` |
| `rain.js` | built | `createRain(world, spec)` → `{ step(particles, view, dt, ripples), onHit(…), findDrips(limit) }`, `createRipples(n)` |
| `roomload.js` | built | `compileRoom(roomJson, data, opts)` → `{ world, grid, room, theme, things, wires, basins, entries, exits, skyTop, keepOut, errors }`, `validateRoomShape(room, data)`, `ROOM_FORMAT` |
| `decor.js` | built | `decorate(grid, spec, seed, keepOut)` |
| `kits.js` | planned, M11 | `KITS[id](params, rng)` → room JSON in §6 format; used by the game (Long Descent) and `tools/room-new.mjs` (§6.16) |
| `gravity.js` | planned, M28 | `createBands(things)`, `stepBands(game)`, `isHeld(y)` (06 §10.7) |
| `raycast.js` | planned | `raycast(grid, x0, y0, x1, y1, stopFn)` → `{ hit, x, y, i, mat, dist }` |

### 3.3 `js/render/` (browser)

| File | Status | Public |
|---|---|---|
| `webgl2.js` | built | `createWebGL2Renderer(canvas, { mats })` → `{ kind, gl, setRoom(grid), render(frame), setAtlas(rgba, w, h), stats }` or `null` without WebGL2 (the boot shows the "needs WebGL2" card, 06 §17) |
| `shaders.js` | built | every GLSL program as a string export (`FULL_VS`, `SCENE_FS`, `BATCH_VS`, `BATCH_FS`, `OVERLAY_FS`, `LIGHT_FS`, `DOWN_FS`, `BLUR_FS`, `UP_FS`, `COMPOSITE_FS`, `WATER_FS`, `FINAL_FS`; 06 §16.11) |
| `gl.js` | built | `compile(gl, vs, fs, name)`, `texture(gl, w, h, opts)`, `target(gl, w, h, opts)`, `mrt(gl, w, h, n, opts)` |
| `frame.js` | built | `buildFrame(game, cam, atlas, alpha)` → `{ lights, sprites, overlays, additive }`, `lanternPos(p, x, y)`, `spellVisuals(…)` |
| `camera.js` | built | `createCamera()` → `{ fit(w, h, wide), snap(x, y, room), update(target, room, dt), shake(t), view(), x, y, vw, vh, scale, lock }` |
| `sprites.js` | built | `buildAtlas(spritesJson, W)` → `{ rgba, w, h, index, meta, rect(id, anim, t) }` (format 06 §25) |
| `flatview.js` | planned, M2 | the Canvas2D flat-colour debug view (06 §17) |
| `rig.js` | planned, M14 | part rigs → sprite instances with rotation and telegraph glow (06 §25.2) |
| `font5x7.js` | planned | the in-world pixel font: `drawText(list, text, x, y, color)`, `measure(text)` |

### 3.4 `js/entities/` (pure)

| File | Status | Public |
|---|---|---|
| `player.js` | built | `createPlayerBody(x, y, cls)`, `stepPlayerMovement(game, p, intent)` (07's numbers from `movement.json`) |
| `actor.js` | built | `createActor(kind, props)`, `stepActorPhysics(game, a)`, `speedMult` |
| `particles.js` | built | `PK` (kinds), `createParticles(cap)` → pool with `spawn`, `kill`; `stepParticles(pool, world, dt, hooks)` |
| `prefabs/*.js` | folder built, files planned (M16) | one file per thing type of §6.5; each exports `{ type, create(game, spec), step(game, self), onSignal(game, self, action, value), interact?(game, self, who), save(self) → state, load(self, state) }` |
| `prefabs/index.js` | planned, M16 | `PREFABS[type]`, `spawnThing(game, spec)` |
| `wiring.js` | planned, M16 | `createWiring(things, wires)` → `{ emit(fromId, value), step(), state() }` (§6.6) |
| `rope.js` | planned, M17 | the player's hook as a wrap list; verlet level ropes and tethers (07, R48) |
| `pickups.js` | planned, M8 | `spawnPickup(game, kind, x, y, props)` |

### 3.5 `js/spells/` (pure) — 03's compiled-program design (03 §20)

03 §20 describes the compiled spell program (compile once, run a flat plan each tick). The built files carry it
under these names, which are canonical (R61):

| File | Status | Public |
|---|---|---|
| `wick.js` | built | the **compiler**: `compileWick(wick, data, hero, opts)` → flat `CastPlan`; `validateWick(wick, data, unlocks, charmSlots)` → `null` or a reason; `wickName`; two-track burn-in `burnLevel(oilSpent)`, `burnLevels(burn, flame, shape)`, `BURN_THRESHOLDS` |
| `cast.js` | built | casting: `createCaster(p)`, `stepCasting(game, p, intent, aim)` (slots, oil, cooldowns, hold-to-overcharge, the safe line and guttering), `release(…)`, `OC` (overcharge constants) |
| `instances.js` | built | live instances: `castPlan(game, caster, plan, aim, meta)`, `stepSpells(game)`, `endInstance(…)`, `stepSpellLeftovers(game)` — one handler per shape, charm hooks, knots, combos (steam burst, shatter, electrified water so far) |
| `shapes/` | folder built | planned split of `instances.js` into one handler file per shape when it passes ~600 lines |
| `reactions.js`, `combos.js` | planned, M7 / M25 | table-driven flame × material reactions and the 8 combos from `reactions.json` / `combos.json` |
| `builder-ui.js` → `js/ui/wickbuilder.js` | planned, M7 | the Wick builder screen (02) |

### 3.6 `js/rpg/` (pure) — numbers in 03, 04, 08

| File | Status | Public |
|---|---|---|
| `damage.js` | built | `dealDamage(game, hit)` → record — the single place damage happens; writes one meter record per hit (§10.3); `heal(…)`, `FLAME_KEYS`, `meterType(flame)` |
| `status.js` | built | `applyStatus(game, target, id, opts)`, `stepStatuses(game, actor, dt)`, `speedMult(a)`, `canAct(a)` |
| `melee.js` | built | `createMelee(…)`, `stepMelee(…)`, `hitbox(…)` — the pole: combo, heavy, air, plunge/pogo, hit-stop, oil from hits (04's frame data from `movesets.json`) |
| `voidzones.js` | built | `spawnVoidZone(…)`, `inZone(…)`, `stepVoidZones(…)`, `voidZoneVisuals(…)` — lit rim, ≥ 500 ms warm-up, 4 damage ticks a second (05 §8) |
| `stats.js` | planned, M8 | `deriveStats(hero, data)` (04's formulas); exports `KNOWN_STATS` for data-check |
| `levels.js` | planned, M8 | `xpToNext(level)`, `grantXp(hero, n)` → level-ups |
| `boards.js` | planned, M19 | `canTake(hero, nodeId)`, `take(hero, nodeId)`, `boardEffects(hero)` (12 nodes per class) |
| `items.js`, `affixes.js`, `loot.js` | planned, M8 / M13 | `rollItem`, `itemScore`, `equip`; `rollAffixes`, `affixText`; `rollLoot(table, level, rng)` |
| `shops.js` | planned, M13 | `stockFor`, `priceOf`, `buy`, `sell` + one hook per shop id (08) |
| `currency.js` | planned, M8 | `give(hero, cur, n)`, `spend(hero, cur, n)` → bool |

### 3.7 `js/ai/` (pure) — behaviour is 05's (R62)

| File | Status |
|---|---|
| `brain.js` | **built** — `spawnEnemy`, `stepAI`, `hurtPlayer` (one state machine, senses on the CPU light grid, attack tokens, telegraphed attacks, poise) |
| `senses.js` | planned, M6 (reads 06's `lightTier` / `ambientTier`) |
| `nav.js` | planned, M6 |
| `behaviours/*.js` | folder built; one file per behaviour id in `enemies.json` (M6 on) |
| `bosses/{tallow,gnaw,sluicemaw,widow,bellfather,ossery}.js` | folder built; files M14–M33 |
| `director.js` | planned, M20 / M24 (Floodgate waves, Long Descent spawns) |

### 3.8 `js/modes/` (pure; planned)

| File | Milestone |
|---|---|
| `campaign.js` — `startCampaign(save)`, `goRoom(game, roomId, entryId)`, `onGreatLampLit(game, act)` | M12 |
| `actmap.js` — `actGraph(act, data)`, `reveal(node)`, `canTravel(a, b)` (09) | M11 |
| `waves.js` — Floodgate | M20 |
| `endless.js` — the Long Descent chain from kits + `endless`-tagged rooms; `daily` is its flag | M24 |
| `bossrush.js`, `trials.js` | M35, M34 |

### 3.9 `js/ui/`, `js/audio/`, `js/talk/`, `js/save/`, `js/debug/`

| File | Status | Responsibility |
|---|---|---|
| `ui/screens.js` | planned, M8 | screen router (02 owns the screens) |
| `ui/hud.js`, `ui/wickbuilder.js`, `ui/inventory.js`, `ui/map.js`, `ui/shop.js`, `ui/dialogue.js`, `ui/ledger.js`, `ui/settings.js`, `ui/tooltips.js` | planned | one per screen; tooltips use `shared/tooltip.js`, numbers use `shared/format.js` |
| `audio/sfx-bridge.js` | planned, M10 | bus events → `Sfx` ids (§10.4) |
| `audio/voice-bridge.js` | planned, M10 | speech lines → voice-lab with a per-speaker voice (§10.2) |
| `audio/score.js` | planned, M10 / M37 | the procedural score on the sfx engine's context (§10.5) |
| `talk/lingo-bridge.js` | planned, M10 | loads Lingo + the pack, builds speakers, pre-renders bark pools (§10.1) |
| `talk/barks.js` | planned, M10 | bark throttling (the one bark table is 01's) |
| `save/save.js`, `save/migrations.js`, `save/settings.js`, `save/profile.js` | planned, M9 | §7, §8 |
| `debug/bench.js` | built | `createBench(game, cam)` — the scripted 20 s benchmark run (06 §21) |
| `debug/api.js`, `debug/overlay.js`, `debug/inspector.js`, `debug/spawn.js`, `debug/editor.js` | planned | §11 (today `main.js` fills `window.lanternfall` directly, §11.6) |

---
## 4. Main loop, game state, event bus, random numbers

### 4.1 The loop (built, `js/core/loop.js`)

```js
export const STEP = 1 / 60;
export function createLoop({ tick, render, raf = globalThis.requestAnimationFrame?.bind(globalThis), now = () => performance.now() }) {
  const MAX_STEPS = 5;
  let acc = 0, last = 0, running = false, paused = false, speed = 1;
  const stats = { steps: 0, slowFrames: 0, simMs: 0, frameMs: 0, fps: 60 };
  function frame(t) {
    if (!running) return;
    const dt = last ? Math.min(0.25, (t - last) / 1000) : STEP; last = t;
    if (!paused) acc += dt * speed;
    let n = 0; const s0 = now();
    while (acc >= STEP && n < MAX_STEPS) { tick(); acc -= STEP; n++; }
    if (n === MAX_STEPS && acc >= STEP) { acc = 0; stats.slowFrames++; }   // slow down, never spiral
    stats.simMs = now() - s0; stats.steps = n;
    const r0 = now(); render(paused ? 1 : acc / STEP, dt); stats.renderMs = now() - r0;   // alpha 0..1
    stats.frameMs = dt * 1000; stats.fps = stats.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    raf(frame);
  }
  return { start(), stop(), pause(on), get paused(), setSpeed(x), stepOnce(), stats };
}
```

- **Interpolation:** every body keeps `px, py` (position at the start of the last tick) and `x, y`; the renderer
  draws `lerp(px, x, alpha)`. Cells, particles and fragments are not interpolated.
- **Pause** stops ticks but keeps rendering (menus over a live, still frame). Breath and every other timer pause
  with it (R74).
- **Hidden tab:** on `visibilitychange` hidden → pause (planned, M8); the 0.25 s `dt` clamp stops a burst on return.
- **Hit-stop** (04's numbers) is `game.freezeTicks`: `tickGame` returns early while it is > 0 (built).

### 4.2 The `Game` object (one per run; pure data + systems)

As built by `createGame` + `enterRoom` (`js/core/state.js`), with the planned fields marked:

```js
game = {
  data,                      // §5, read-only
  mode: 'campaign', seed, tick: 0, freezeTicks: 0, time: 0,
  rng: { loot, spell, ai, talk },                 // §4.4
  bus,                                            // §4.3
  room,                      // the compiled room (roomload.js result: grid, things, wires, basins, entries, exits…)
  world, grid,               // shortcuts into room
  entities: [],              // actors (enemies, npcs, dummies); the player is separate
  player,                    // the player body (player.js)
  hero,                      // the persistent character: class, level, attrs, wicks, burn, items (saved)
  particles, rain, ripples,  // pools (06 §11, §18)
  spells, pending, fields, shockZones, flashes, arcs, climbLines,   // live spell state (spells/instances.js)
  support, fragments, lightGrid, currents, floodlines,             // world systems for this room
  tokens,                    // attack tokens this room (05; Act 1 grace = 1 melee token)
  roomState,                 // this run's per-room saved state (§7.3)
  flags, story, perf, lights,
  // planned: meter (§10.3), talk (§10.1), run (per-run counters), command queue
}
```

`createGame` builds it; `tickGame` advances it. UI actions (equip, buy, braid a wick) go through **commands**
(`game.command({ type: 'equip', … })`) queued and applied at the start of the next tick (planned, M8), so saves,
replays and UI stay consistent.

### 4.3 Event bus (built, `js/core/bus.js`)

Events are queued during the tick and delivered at `bus.flush()` (tick step 15, 06 §4.1), so a listener never runs
in the middle of a cell pass. `emitNow` bypasses the queue for UI-only events outside the tick. Gameplay systems
**do not** listen to the bus (they call each other directly); the bus is for *reactions*: UI, audio, talk, the
meter bridge, achievements/challenges, the debug log. `on('*', fn)` receives everything (debug log only).

| Event | Payload | Main listeners |
|---|---|---|
| `room.enter` / `room.exit` | `{ roomId, entryId }` (built: `room.enter`) | score, talk (room comments), save (last room) |
| `lamp.post` | `{ id, roomId }` | save (autosave), heal, sfx |
| `lamp.great` | `{ act }` | story, relight sweep (06 §14.6), score voice, shop prices |
| `lantern.out` / `lantern.lit` | `{ how }` | sfx, AI (the Unlit converge), hud (B4) |
| `rekindle` | `{ roomId }` | Narrator remark, Ledger stat "Rooms rekindled" (B8) |
| `cast.start` / `cast.release` / `cast.gutter` | `{ caster, wickId, plan, overcharge }` | sfx, hud |
| `hit` | damage record (§10.3) | meter, sfx, damage numbers, barks |
| `kill` | `{ source, target, via, overkill }` | loot, xp (+50% when `source` is "The Hollow", i.e. a trap or the world), meter, challenges, barks |
| `status.apply` / `status.expire` | `{ target, id, stacks }` | sfx, hud |
| `player.hurt` / `player.die` / `player.respawn` | `{ amount, source }` | hud, camera shake, save |
| `explode` | `{ x, y, r, power, source }` (built) | sfx, AI hearing (the lure rule), camera shake |
| `cell.ignite` (throttled: 1 per chunk per 0.5 s) | `{ x, y, mat }` | sfx, talk |
| `water.shock` | `{ bodySize, x, y }` | sfx, barks |
| `fragment.land` | `{ x, y, mass, fallen }` | sfx (crash by mass), shake |
| `wire` | `{ from, to, do, value }` | sfx (lever clunk, door grind), debug |
| `door.open` / `door.close` / `basin.level` / `flood.level` | `{ id, value }` | sfx, hud objective text, flood clock (B14) |
| `pickup` | `{ kind, item?, amount }` | sfx (`coin`, `loot.<rarity>`), hud |
| `levelup` | `{ level }` | sfx, hud, talk |
| `unlock` | `{ kind: 'flame'|'shape'|'charm'|'knot'|'mechanic'|'class', id }` | hud banner, save, profile |
| `shop.buy` / `shop.sell` | `{ shop, item, price }` | talk (Crane's `sold_item` memory), sfx, save |
| `talk.request` / `talk.line` | `{ speakerId, intent, ctx }` / `{ speakerId, text, speech, tags, x, y }` | lingo bridge / voice bridge, bubbles, subtitles |
| `boss.phase` / `boss.telegraph` / `boss.die` | `{ boss, phase, attack }` | score (boss pulse), talk, hud boss bar, camera (wide cut) |
| `wave.start` / `wave.clear` | `{ n }` | hud, score |
| `kindling` | `{ flag }` | journal, story |
| `challenge.progress` | `{ id, value }` | profile (class unlocks, 04) |

### 4.4 Random numbers

We use **our own** `js/core/rng.js` (mulberry32, the same algorithm as `shared/ui.js` `rng()`), because saves
and replays need `state()` / `setState()` and named forks.

| Stream | Seeded from | Used by | Saved? |
|---|---|---|---|
| cell rules | the grid's xorshift, seeded from `hashSeed(room.seed, 'cells')` at compile and re-mixed each tick (built, 06 §4.4) | cell passes, currents | no (derived) |
| `room` | `hashSeed(room.seed, …)` (built in the compiler: shade, decor, veins, scatter) | decorator, kit generation, spawn picks | no (derived) |
| `loot` | `hashSeed(runSeed, 'loot')` (built) | drops, shop stock, sealed lanterns | **yes** |
| `spell` | `hashSeed(runSeed, 'spell')` (built) | crit rolls, gutter rolls, split angles | **yes** |
| `ai` | `hashSeed(runSeed, 'ai')` (built) | enemy choices | no |
| `talk` | `hashSeed(runSeed, 'talk')` (built) | Lingo line choice | yes |
| `fx` | `Math.random()` is allowed **only** here | cosmetic particles that never become cells, screen-shake noise | no |

Rule: **cosmetic randomness never draws from a gameplay stream**, and nothing that can become a cell uses
`Math.random`. Known gaps in the built code (M1/M4 close them): rain spawning, rain deposits and drip timers
(`rain.js`, `tick.js` splashes, `state.js` drip timers), debris spawning in `explode()`, and the shatter and
powderise rolls in `fragments.js` use `Math.random`; of these, rain deposits, debris-to-cell and fragment shatter
can change cells, so they must move to a seeded stream before replay tests go in (M8).

---
## 5. Data files: the manifest and every shape

### 5.0 The manifest (R4) — the one list of data files

This table is the **only** data-file list in the bible; every other page links here. The bracket in "Owner"
is the page that owns the **values**; this page owns the **shape**. "Status" is what exists in `data/` now.

**Loading.** `data/manifest.json` (built) lists every file the game loads at boot, by path under `data/`
without `.json` (`"flames"`, `"acts/act1"`). `js/core/data.js` (built) reads the manifest, fetches every file in
parallel (`fetch(new URL('../../data/<file>.json', import.meta.url))` in the browser, `readFile` in Node), indexes
every `list` by `id` (`data.flames.byId.ember`) and builds the material tables (`data.mats`). A file that is not
in the manifest is not loaded; `reach-check` fails on a file in `data/` that is not in the manifest, and on a
manifest entry no module reads (§9.5). Rooms are not in the manifest: they load through `rooms/index.json`.

**Validation (planned, M8).** `tools/data-check.mjs` and the boot run the same checker: required fields, types,
snake_case ids, no duplicate ids, every cross-reference resolves (a charm's exclusive pair names real charms, a
loot table's items exist, a room's enemies exist…), every `stat` key is one `rpg/stats.js` reads
(`KNOWN_STATS`), and every canon id from `00-OVERVIEW.md` is present exactly. A failed validation in the browser
shows a red boot panel listing every problem, and `window.lanternfall.errors` holds them for tests. Every file
starts with `"_doc"` (one paragraph for Claude and humans) and `"version"` (or `"schema"`).

**Conventions every file follows:** resist is **percent**, −100…+100, plus the word `"heal"` (03's model);
item rarities are `common`, `fine`, `rare`, `relic` (08); there is **no** `charm_ring` slot (charms live on
wicks); ids are 00's, verbatim.

| File (`data/…`) | Owner | Status | Holds | Shape |
|---|---|---|---|---|
| `manifest.json` | 10 | built | the load list | §5.0 |
| `materials.json` | 06 | **built** (36) | cell materials | §5.1 |
| `legend.json` | 10 | **built** | default room map characters | §6.3 |
| `themes.json` | 06 | **built** (8 themes) | room themes: back wall, sky, decor defaults | §5.2 |
| `movement.json` | 07 | **built** (add a `rope` block, M17) | player movement numbers | §5.3 |
| `movesets.json` | 04 | **built, interim** — folds into `classes.json` (see below) | pole movesets and melee frame data | §5.6 |
| `bindings.json` | 02 | **built** (loaded; `input.js` reads its `play` keys) | keys and pad per context | §5.4 |
| `difficulty.json` | 02 | planned, M15 | the difficulty table + Iron Wick | §5.4 |
| `strings.json` | 02 | planned, M8 | fixed UI text by id | §5.4 |
| `flames.json` | 03 | **built** (7) | flames | §5.5 |
| `shapes.json` | 03 | **built** (8) | shapes | §5.5 |
| `charms.json` | 03 | **built** (8) | charms + exclusive pairs | §5.5 |
| `knots.json` | 03 | planned, M26 | the 2 knots | §5.5 |
| `statuses.json` | 03 | **built** (all 14) | statuses | §5.5 |
| `reactions.json` | 03 | planned, M7 | flame × material reactions (all 36 materials) | §5.5 |
| `combos.json` | 03 | planned, M25 | the 8 combos | §5.5 |
| `classes.json` | 04 | planned, M8 (movesets live in `movesets.json` until then) | classes incl. movesets and abilities | §5.6 |
| `boards.json` | 04 | planned, M19 | the 12-node skill boards | §5.6 |
| `progression.json` | 04 | planned, M8 | XP table, attribute constants, respec rules | §5.6 |
| `challenges.json` | 04 | planned, M34 | class unlock challenges | §5.6 |
| `enemies.json` | 05 | **built** (Act 1's 4 so far; M6 on) | the 30 monsters | §5.7 |
| `elite-mods.json` | 05 | planned, M13 | the 8 elite modifiers | §5.7 |
| `spawn-tables.json` | 05 | planned, M11 | weighted spawn tables per act | §5.7 |
| `bosses.json` | 05 | planned, M14 | 6 bosses + 3 minibosses | §5.7 |
| `prefabs.json` | 07 | planned, M16 | interactables, traps, build parts: defaults per thing type | §5.8 |
| `items.json` | 08 | planned, M8 | slots, bases, relics, consumables, rarities | §5.9 |
| `affixes.json` | 08 | planned, M18 | the 12 affixes | §5.9 |
| `loot.json` | 08 | planned, M13 | ≤ 20 loot tables | §5.9 |
| `shops.json` | 08 | planned, M13 | the 5 shops | §5.9 |
| `acts/act1.json` … `acts/act6.json` | 09 (ambient/grade/rain values: 06) | planned, M11 | one act: map nodes and edges, level band, ambient, grade, rain, score keys | §5.10 |
| `kits.json` | 09 | planned, M11 | parameters for the 6 room kits | §5.10 |
| `modes.json` | 09 | planned, M20 | `waves`, `endless`, `daily`, `bossrush` settings | §5.10 |
| `trials.json` | 09 | planned, M34 | the 5 trials | §5.10 |
| `guildhall.json` | 09 | planned, M35 | the 10 Guild Hall unlocks | §5.10 |
| `achievements.json` | 09 | planned, M35 | the 20 achievements | §5.10 |
| `npcs.json` | 01 | planned, M10 | the 14 NPCs + Hush + the Narrator: speech, voice, places | §5.11 |
| `story.json` | 01 | planned, M12 | beats, cutscenes, Kindling flags and hint lines, endings | §5.11 |
| `districts.json` | 01 | planned, M12 | district names, lore, title cards | §5.11 |
| `lore.json` | 01 | planned, M12 | the 24 lore plaques | §5.11 |
| `grammar-lanternfall.json` | 01 | planned, M10 | extra Lingo intents (≤ 12 new) | §5.11 |
| `events-lanternfall.json` | 01 | planned, M10 | extra Lingo memory event types | §5.11 |
| `../../lingo/data/packs/lanternfall.json` | 01 | planned, M10 | the Lingo lexicon pack (lives in `lingo/`) | §5.11 |
| `sprites.json` | 06 format, content pages' art | **built** | ASCII sprites | 06 §25.1 |
| `rigs.json` | 06 format, content pages' art | planned, M14 | part rigs for big bodies | 06 §25.2 |
| `sfx-map.json` | 10 shape, owners' ids | planned, M10 | game event → sfx catalog id, missing ids, fallbacks | §10.4 |
| `score.json` | 10 shape, knobs by owners | planned, M10 | the procedural score | §10.5 |
| `balance.json` | 10 shape, knobs by owners | planned, M36 | global tuning multipliers the sims move | §5.12 |

**Retired names** (do not create): `skills.json` (→ `boards.json`), `waves.json` (→ `modes.json`), `acts.json`
(→ `acts/actN.json`), `economy.json` (→ `balance.json` + 08's files), `rope.json` (→ `movement.json` `rope`),
`interactables.json`, `traps.json`, `build-parts.json` (→ `prefabs.json`), `movesets.json`, `abilities.json`
(→ `classes.json`), `silent-bells.json` (parked). The built `js/core/data.js` still lists some of these in its
`OPTIONAL` array (v1 names); M8 removes the array — the manifest is the list. **Open conflict:** the M6 work has
created `data/movesets.json` (`classes`, `shared`) and put `movesets` in the manifest, while v2's manifest folds
movesets into `classes.json`. Until `classes.json` exists (M8) the file stands; when it lands, its `classes` block
moves into `classes.json` (per-class `moveset`) and the manifest entry goes. Nothing else may be added under a
retired name.

**Examples.** One canonical example per file follows. Built files are quoted from the file; planned ones use
canon ids and the owner page's shape. Where an owner page shows a fuller example, the owner page wins on
values.

### 5.1 `materials.json` (built; values 06 §5.2)

```json
{ "_doc": "Cell materials… Ids are fixed forever…", "version": 1,
  "list": [
    { "id": 22, "key": "water", "name": "Water", "cls": "liquid", "density": 10, "hp": 0, "flam": 0,
      "ramp": ["#0d1a2a", "#10213a", "#14294a"], "dispersion": 5, "boilAt": 100, "boilTo": "steam",
      "freezeAt": -5, "freezeTo": "ice", "transmit": 0.8, "conduct": 0.25, "absorb": 0.06, "reflect": 0.55 } ] }
```

| Field | Type | Notes |
|---|---|---|
| `id` | int 0–255 | fixed forever; new ids append from 36 (06 §5.2) |
| `key`, `name` | snake_case, text | the key code and rooms use; the display name |
| `cls` | `empty` `static` `powder` `liquid` `gas` `fire` | |
| `density`, `hp`, `flam`, `dispersion`, `repose`, `conduct`, `transmit` | numbers | meanings in 06 §5.2 |
| `meltAt/meltTo`, `freezeAt/freezeTo`, `boilAt/boilTo`, `igniteAt`, `burnRate`, `burnsTo` | optional | `burnsTo` is `[{ "to": "ember", "p": 0.3 }, …]` |
| `support` / `span` | `none` `island` `span` `hang` / int | 06 §10 |
| `lifeMin`, `lifeMax` | ticks | gases, fire |
| `temp` | °C | starting temperature (ember 700, molten wax 90…) |
| `emit` | `{ "color": "#hex", "power": 0.35 }` | self light |
| `resist` | object of the 5 kinds (`blast` `cut` `heat` `acid` `crush`) | multipliers, 0 = immune (a cell's resist, not a creature's) |
| `ramp` | 1–8 hex | albedo ramp, dark → light |
| `alpha`, `absorb`, `reflect`, `friction` | render / feel hints | 06 §15 |
| `brokenTo` | material key | shatter / debris product |
| `climbable`, `slow`, `hurt` | optional | `hurt: { "amount": 4, "every": 10, "flame": "ember" }` |

### 5.2 `themes.json` (built)

```json
{ "_doc": "Room themes…", "version": 1,
  "themes": {
    "wax_chapel": { "act": "act1", "backWall": "brick",
                    "sky": { "top": "#1a1f2e", "bottom": "#0a0c12", "sil": "#1b1f2c" },
                    "decor": { "erode": 0.35, "round": 2, "moss": 0.1, "cracks": 0.15, "grime": 0.3, "drips": 6, "waxDrips": 0.4 } } } }
```

Built themes: `bench`, `crown_streets`, `wax_chapel`, `gutter_tunnels`, `sluice_vault`, `blackwater`, `bellwell`,
`cloudroot`. Planned optional fields: `props` (decor sprite ids, §6.7 step 10), `ambience` (sfx loop id).

### 5.3 `movement.json` (built; values 07 §2)

Top-level blocks as built: `body`, `run`, `jump`, `land`, `wall`, `ledge`, `crouch`, `dropThrough`, `swim`,
`climb`, `carry`, `wind`, `knock`, `surfaces`, `pogo` (it has `_doc` but no `version` yet — add `"version": 1`
when M17 adds the `rope` block). Units: cells, cells/s, cells/s², seconds.

```json
{ "body": { "w": 6, "h": 12, "crouchH": 7, "stepUp": 2, "stepUpRun": 3, "stepUpAir": 4, "stepDown": 3 },
  "jump": { "v": 248, "gravity": 900, "coyote": 0.1, "buffer": 0.12 },
  "rope": { "_planned": "M17", "hookRange": 0, "reelSpeed": 0, "swingGravity": 0, "wrapMin": 0 } }
```

(The `rope` block's field names are 07's to fix in M17; the zeros only show where it goes.)

### 5.4 02's files: `bindings.json` (built), `difficulty.json`, `strings.json`

`bindings.json` (built, `"schema": 1`): `keys.<context>.<action> = [KeyboardEvent.code …]` (mouse buttons
`Mouse0`/`Mouse1`/`Mouse2`, wheel `WheelUp`/`WheelDown`), `gamepad.<context>.<action> = [standard button names]`,
`options` (accessibility variants such as `overchargeNeedsKey`), `meta.contexts` (with `inherits`), `reserved`.
Contexts: `play`, `build`, `menu`, `dialogue`, `sandbox`, `text`, `rebind`. Values are 02's.

```json
{ "keys": { "play": { "move_left": ["KeyA", "ArrowLeft"], "jump": ["Space"], "cast": ["Mouse0"], "pole": ["Mouse2"] } },
  "gamepad": { "play": { "jump": ["south"], "cast": ["rt"], "class_ability": ["lb_tap"] } },
  "meta": { "contexts": { "play": {}, "build": { "inherits": "play" } } } }
```

`difficulty.json`: `{ "list": [ { "id": "wicklit" | "lamplighter" | "lampless", …02's columns (enemy damage and
health multipliers, telegraph scale, penny loss on death 0 / 25 / 50%, `tallowPhase3` false/false/true)… } ],
"ironWick": { "lives": 1 } }`. The Act 1 grace (05) applies on top.

`strings.json`: `{ "strings": { "menu.continue": "Continue", "lesson.plank.gap": "…" } }` — every fixed UI string
by id, so wording has one home and a wording test can scan it.

### 5.5 03's files

Built (`flames.json`, `shapes.json`, `charms.json`, `statuses.json`) — quoted:

```json
{ "id": "ember", "name": "Ember", "power": 12, "oilMult": 1, "color": "#ff8a2a", "lightMult": 1.1,
  "lightIntensity": 1, "flicker": [0.12, 8], "status": "burn", "unlock": "start", "meterType": "fire",
  "desc": "Burns. Lights oil, wood and wax. Boils water into steam." }
```

```json
{ "id": "lob", "name": "Lob", "mult": 1.3, "oil": 10, "cooldown": 0.7, "castTime": 0.12, "speed": 220,
  "gravity": 600, "size": 14, "lifetime": 2.5, "light": 22, "dig": 1,
  "desc": "An arcing throw that bursts where it lands." }
```

```json
{ "id": "echo", "name": "Echo", "unlock": "act5", "dmg": 1, "oil": 1.35, "cd": 1.1, "echoDelay": 0.35,
  "echoPower": 0.6, "notOn": ["beam", "tether"], "byShape": { "rune": { "fires": 2, "gap": 0.35, "second": 0.6 } },
  "desc": "Casts itself again a moment later." }
```

`charms.json` also carries `"exclusive": [["heavy", "swift"]]` (pairs that cannot share a wick). `byShape` is how
the four charms that change meaning by shape (split, bounce, echo, volatile) say so.

```json
{ "id": "chill", "name": "Chilled", "flame": "rime", "maxStacks": 5, "slowPerStack": 0.1, "duration": 4,
  "freezeAt": 5, "freezeAtSoaked": 3, "attackSlowPerStack": 0.1, "color": "#6fe3ff" }
```

`statuses.json` holds all 14 of 00's statuses, plus top-level `statusCap` and `steadfastDurationMult` (03 owns
the numbers).

Planned:

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "on_hit", "name": "Knot: On Hit", "unlock": "act4", "oil": 1.2,
    "child": { "power": 0.5, "oil": 0.4, "gap": 0.5, "maxPerCast": 3 }, "desc": "…" } ] }
```

```json
{ "_doc": "flame x material, every flame against all 36 materials (03)", "version": 1,
  "reactions": { "ember": { "water": { "to": "steam", "heat": 6 }, "wax": { "to": "molten_wax" }, "wood": { "ignite": true } } } }
```

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "steam_burst", "name": "Steam Burst", "needs": { "flame": "ember", "cells": { "water": 12 } },
    "effect": { "burst": { "r": 18, "power": 0.8 }, "status": "burn" }, "codex": "codex.steam_burst" } ] }
```

The eight combo ids are 00 §8's. A key the code does not read fails validation (no dead data).

### 5.6 04's files

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "lamplighter", "name": "Lamplighter", "role": "balanced caster-duelist", "unlock": { "default": true },
    "attrs": { "might": 5, "wick": 7, "draught": 7, "nerve": 5, "knack": 5 },
    "startWicks": [ { "flame": "ember", "shape": "bolt" }, { "flame": "gleam", "shape": "ring" } ],
    "ability": { "id": "ability_beacon", "cooldown": 0 },
    "passive": { "id": "…", "stat": "…", "value": 0 },
    "moveset": { "pole": { "combo": ["jab", "sweep", "lift"], "heavy": "…", "plunge": "…" }, "frames": "…04's frame data…" },
    "board": "board_lamplighter", "sprite": "hero_lamplighter" } ] }
```

Locked classes carry `"unlock": { "challenge": "sweep_rope_2000" }` pointing into `challenges.json`. The class
switch rule (next act hub's lamp-post) is 04's.

```json
{ "_doc": "…", "version": 1, "boards": [ { "id": "board_lamplighter", "class": "lamplighter",
  "nodes": [ { "id": "ll_steady_hand", "name": "Steady Hand", "pos": [2, 0], "cost": 1, "requires": [],
               "effect": { "stat": "overchargeSafePct", "value": 0.1 }, "desc": "…{value}…" } ] } ] }
```

12 nodes per board. `effect` is a stat modifier (a `KNOWN_STATS` key) or `{ "grant": "…" }`.

```json
{ "_doc": "…", "version": 1, "levelCap": 30, "xpTable": [0, 100, 240],
  "points": { "attrPerLevel": 3, "skillPerLevel": 1, "skillFromLevel": 2, "skillPerGreatLamp": 1 },
  "attrFormulas": { "maxHp": { "base": 60, "perNerve": 8, "perLevel": 4 } },
  "cellsPerMetre": 8, "trapKillXp": 1.5 }
```

`xpTable` has `levelCap` entries. Burn-in thresholds are 03's (in `shapes.json` / `flames.json` meta or
`wick.js`); respec prices are 08's.

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "sweep_rope_2000", "name": "Two Thousand Metres of Rope", "stat": "ropeMetres", "target": 2000,
    "or": { "trial": "trial_rope_gauntlet", "medal": "bronze" }, "unlock": { "kind": "class", "id": "chimneysweep" } } ] }
```

### 5.7 05's files

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "wax_mite", "name": "Wax Mite", "act": ["act1"], "family": "wax", "tags": ["small", "flammable"],
    "size": [5, 4], "hp": 14, "armour": 0, "speed": 40, "stepUp": 2, "swim": "none",
    "resist": { "ember": -50, "rime": 50 }, "xp": 6, "drops": "loot_a1_small",
    "behaviour": "melee_rush", "senses": { "sight": 140, "hearing": 200, "needsLight": false },
    "attacks": [ { "id": "nip", "damage": 4, "range": 6, "windup": 350, "cooldown": 1.2, "telegraph": { "kind": "flash", "color": "#ffcc66" } } ],
    "onDeath": { "cells": [ { "mat": "molten_wax", "count": 12 } ] },
    "eyes": "#ffcc66", "sprite": "en_wax_mite", "voice": { "role": "…", "babble": true }, "barks": "bark_wax" } ] }
```

Resist is percent (−100…+100, or `"heal"`). `windup` in ms. Monster voice roles are 05's list; NPC voices 01's.

```json
{ "_doc": "…", "version": 1, "list": [ { "id": "mod_wickfed", "name": "Wick-fed", "aura": "#ff8a2a", "effect": { "…": 0 }, "exclude": ["small"] } ] }
```

```json
{ "_doc": "…", "version": 1, "list": [ { "id": "sp_a1", "entries": [ ["wax_mite", 40, [2, 4]], ["dripling", 30, [1, 2]] ] } ] }
```

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "boss_tallow", "name": "Mother Tallow", "act": "act1", "arena": "a1_n08", "hp": 1500, "rig": "boss_tallow",
    "camzone": "lock",
    "phases": [ { "n": 1, "until": 0.66, "attacks": ["wick_lash", "wax_wave"], "voidZones": ["molten_pool"] },
                { "n": 2, "until": 0, "attacks": ["tallow_slam", "wax_wave"] },
                { "n": 3, "until": 0, "only": ["lampless", "bossrush"], "attacks": ["…"] } ],
    "attacks": { "wax_wave": { "damage": 18, "windup": 1800, "telegraph": { "kind": "ground", "parts": ["arm_l", "arm_r"] } } },
    "voidZones": { "molten_pool": { "mat": "molten_wax", "rim": "#ffcf6a", "warmup": 500, "ticksPerSecond": 4 } },
    "lines": { "open": "boss_tallow_open", "phase": ["boss_tallow_p2"], "die": "boss_tallow_die" },
    "rewards": { "xp": 400, "relic": "relic_tallow_heart" } } ] }
```

Minibosses sit in the same list with `"miniboss": true`. Line ids are 01's.

### 5.8 `prefabs.json` (07's values)

Defaults for every room thing type of §6.5: size, sprite, solid, save policy, default props.

```json
{ "_doc": "…", "version": 1, "types": {
  "lever":       { "size": [6, 10], "sprite": "pf_lever", "solid": false, "interact": true, "save": "state", "props": { "state": false, "oneShot": false } },
  "timed_door":  { "save": "state", "props": { "mat": "metal", "open": 4 } },
  "trap_crusher":{ "save": "none", "props": { "damage": 0, "period": 0, "hitsAnything": true } },
  "bp_plank":    { "part": true, "cells": { "mat": "plank", "w": 24, "h": 2 }, "cost": { "scrap": 2 }, "save": "state" } } }
```

`save` is `none` (resets on re-entry), `state` (remembered per save slot), or `once` (remembered, cannot be
undone: a chest opened, a wall broken). Timed door default **4 s** (07).

### 5.9 08's files

```json
{ "_doc": "…", "version": 1,
  "slots": ["lantern", "weapon", "coat", "boots", "trinket"],
  "rarities": [ { "id": "common" }, { "id": "fine", "color": "#8fc7ff" }, { "id": "rare" }, { "id": "relic" } ],
  "bases": [ { "id": "pole_lantern", "slot": "weapon", "class": ["lamplighter"], "level": 1,
               "stats": { "meleeDamage": [6, 9] }, "price": 40, "look": { "pal": { "m": "#8a6a3a" }, "overlay": "ov_pole_brass" } },
             { "id": "lantern_tin", "slot": "lantern", "level": 1, "stats": { "lightRadius": 72, "darkBurn": 2.5 }, "price": 30 } ],
  "relics": [ { "id": "relic_first_lamp", "power": "…", "desc": "…" } ],
  "consumables": [ { "id": "lamp_oil", "stack": 10, "use": { "oil": 40 }, "price": 12 } ],
  "belt": { "guildFlask": { "charges": 2, "oil": 40, "refill": "lamp_post" } },
  "keys": [ { "id": "great_wick_act1" } ] }
```

A lantern's `lightRadius` is the radius 06 §14.2 uses. `look` is the gear overlay of 06 §25.3.

```json
{ "_doc": "…", "version": 1, "list": [ { "id": "aff_light_radius", "name": "of the Long Wick", "slots": ["lantern"],
  "stat": "lightRadiusPct", "perLevel": 0.004, "weight": 10, "text": "+{value%} lantern light radius" } ] }
```

```json
{ "_doc": "…", "version": 1, "list": [ { "id": "loot_a1_small", "rolls": 1, "entries": [
  { "w": 60, "kind": "pennies", "amount": [1, 4] }, { "w": 25, "kind": "oil", "amount": [5, 10] },
  { "w": 12, "kind": "item", "rarity": { "common": 90, "fine": 10 } }, { "w": 3, "kind": "scrap", "amount": [1, 2] } ] } ] }
```

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "shop_wick", "name": "Wick & Tallow", "keeper": "npc_odile", "currency": "pennies",
    "stock": { "slots": 8, "tables": ["stock_wick_basic"], "always": ["lamp_oil"] },
    "quirk": "names_wicks", "pricing": { "lampDiscount": 0.08 } } ] }
```

One quirk hook per shop id (00 §14): `shop_wick` names wicks, `shop_pawn` remembers sales (Lingo `sold_item` +
`opinion()`), `shop_soup` rotates its menu, `shop_gamble` sells sealed lanterns (and the Drowned Market pearl
shelf), `shop_ferry` pays in coin or max health.

### 5.10 09's files

```json
{ "_doc": "…", "version": 1, "id": "act1", "name": "Lanterncrown & the Wax Stair", "lamp": "Crown Lamp",
  "boss": "boss_tallow", "levels": [1, 6], "hub": "a1_n01",
  "ambient": { "dark": "#2a3348", "darkPower": 0.55, "lit": "#5a4a3a", "litPower": 0.7, "bottomMult": 0.6 },
  "grade": { "lift": [0.01, 0.01, 0.02], "gamma": [1, 1, 1], "gain": [1, 1, 1] },
  "rain": { "density": 60, "wind": 0.15, "deposit": 0.07 },
  "score": { "drone": "act1", "key": "D" },
  "nodes": [ { "id": "a1_n01", "name": "The Guild Hall", "type": "hub", "rooms": ["a1_guild_hall_01"], "pos": [0, 0] },
             { "id": "a1_n04", "name": "Chandlers' Lane", "type": "fight", "kit": { "id": "fight_small", "seed": 104, "count": 2 } } ],
  "edges": [ ["a1_n01", "a1_n02"], ["a1_n03", "a1_n04"], ["a1_n01", "a1_n09", { "needs": "grapple" }] ] }
```

Node types: `hub`, `lesson`, `fight`, `puzzle`, `event`, `elite`, `flood`, `lamppost`, `boss`, `secret`. A node
lists hand-made `rooms` or a `kit` to generate them. Ambient, grade and rain values are 06's; the rest 09's.

```json
{ "_doc": "…", "version": 1, "kits": {
  "fight_small":  { "size": [[480, 272], [960, 272]], "block": 8, "platforms": [3, 6], "gaps": [0, 2], "spawns": [2, 5] },
  "fight_tall": {}, "shaft": {}, "bridge_gap": {}, "flooded_hall": { "floodline": true }, "corridor_run": {} } }
```

```json
{ "_doc": "…", "version": 1,
  "waves": { "arena": "wv_watch_cistern", "count": 15, "areaLevel": "player+floor(wave/5)", "rosterFromActsReached": true },
  "endless": { "pieces": "kits+endless", "floodline": { "rate": [0.5, 4] } },
  "daily": { "flag": "endless", "classes": ["lamplighter", "sluicewarden", "tinker"], "shareLine": true },
  "bossrush": { "tallowPhases": 3, "pauseRooms": true } }
```

`trials.json`: `{ "list": [ { "id": "trial_rope_gauntlet", "door": "a2_n04", "needs": "grapple", "room":
"tr_rope_gauntlet", "rules": {…}, "medals": { "bronze": 150, "silver": 120, "gold": 95 } } ] }` (5 trials).
`guildhall.json`: `{ "list": [ { "id": "gh_flask", "cost": { "marks": 3 }, "effect": { "flaskCharges": 1 } } ] }`
(10 unlocks). `achievements.json`: `{ "list": [ { "id": "…", "stat": "…", "target": 1 } ] }` (20).

### 5.11 01's files

```json
{ "_doc": "…", "version": 1, "list": [
  { "id": "npc_odile", "name": "Odile Pennywax", "gender": "f", "shop": "shop_wick", "sprite": "npc_odile",
    "portrait": "portrait_npc_odile",
    "voice": { "role": "merchant", "seed": 4411 },
    "speech": { "traits": ["…01's…"], "tics": ["…"], "formality": 0.4 },
    "lexicon": "npc_odile", "places": ["a1_n01"] } ] }
```

`speech` is the Lingo speaker block (`shared/character-schema.md`); `voice` feeds `shared/voices.js`
`voiceFor()`; traits and tics are only from Lingo's real lists (01).

```json
{ "_doc": "…", "version": 1,
  "kindling": [ { "id": "tallow_cooled", "act": "act1", "hint": { "npc": "npc_seld", "place": "a1_n08", "intent": "hint_tallow_cooled" } } ],
  "cutscenes": [ { "id": "cs_relight", "template": true, "lines": { "act1": ["…"] } } ],
  "endings": [ { "id": "end_a", "needs": { "kindling": 5, "flags": ["knows_keeper_rule"] } } ] }
```

`districts.json`: `{ "list": [ { "id": "act1", "name": "…", "titleCard": ["…"] } ] }`. `lore.json`: `{ "list": [ {
"id": "lore_a1_1", "place": "a1_n02", "text": "…" } ] }` (24). `grammar-lanternfall.json`: `{ "symbols": { "intent":
[ entries ] } }` merged into Lingo's grammar at load (an intent with a core name **extends** it).
`events-lanternfall.json`: Lingo memory event types (e.g. `sold_item`, `kindling_*`). The pack
`lingo/data/packs/lanternfall.json` follows Lingo's convention: `{ "_doc", "entries": [ … ] }` with `place`,
`faction`, `person` (every NPC and boss), `creature` (every monster id), `item`, `weather`, `title` entries, each
proper name with `pron.respell`.

### 5.12 `balance.json` (10 shape)

```json
{ "_doc": "Global tuning the sims move. Owners set the base numbers; this file only scales them.", "version": 1,
  "enemies": { "hp": 1, "damage": 1, "perAct": { "act1": { "hp": 1, "damage": 1 } } },
  "economy": { "xp": 1, "pennies": 1, "dropRate": 1 },
  "oil": { "regen": 1, "darkBurn": 1 },
  "spells": { "power": 1, "oil": 1 } }
```

Every key must be read by the module it names (a "move the knob, ask the module" test, §9.1).

---
## 6. The room authoring format

About **55 hand-authored rooms** (hubs, lessons, puzzles, events, arenas, set pieces, trials) plus **6 room kits**
that generate the fight rooms (R8, B10) are made by an agent writing JSON. The format is built so a room is
**~150–400 lines of JSON**, reads like a sketch, and still looks hand-made after the decorator runs. The format
below is **built** (`js/world/roomload.js`, `format: 1`); v2 adds only optional fields (`tags`, `puzzle`,
`floodlines`, `kit`) and new thing types, so it stays format 1.

### 6.1 The idea in one paragraph

A room is a **coarse ASCII map** where each character is a square **block** of cells (8 × 8 by default,
16 × 16 for big rooms, 4 × 4 for small detailed ones) of one material. On top of that come **shape
operations** in exact cell coordinates (rectangles, circles, polygons, lines, noise carving, water fills,
stairs, arches) for the parts a block grid can't draw, then **things** (levers, doors, lamp-posts, enemy
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
  "tags": [],
  "size": [480, 272],
  "block": 8,
  "seed": 1702,
  "theme": "wax_chapel",
  "rain": { "density": 60, "wind": 0.2, "deposit": 0.07, "maxDeposit": 3000 },
  "ambient": null,
  "legend": {},
  "map": [ "… 34 strings of 60 characters …" ],
  "back": null,
  "ops": [],
  "things": [],
  "wires": [],
  "floodlines": [],
  "edges": { "drain": [] },
  "decor": {},
  "puzzle": null,
  "camera": { "lookAheadY": 0 },
  "notes": "Free text for authors. Not shown in game."
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | this format's version (§6.12) |
| `id` | yes | `a<act>_<area>_<nn>` for campaign rooms (`a1_wax_stair_02`), `tr_*` trials, `wv_*` the Floodgate arena, `kit_*` generated rooms, `bench_*`, `test_*`. Which node a room belongs to is the act file's business (§5.10) |
| `name` | yes | shown on the map and the room banner; original words only |
| `act` | yes | canon act id or `none` |
| `kind` | yes | a node type (`hub` `lesson` `fight` `puzzle` `event` `elite` `flood` `lamppost` `boss` `secret`, 09) or `trial` `arena` `bench` `test` |
| `tags` | no | `trap` (a room whose intended win is a trap, 2–3 per act from Act 2, R51), `endless` (usable by the Long Descent), `showcase` (the act's water/light showcase, R81) |
| `size` | yes | `[w, h]` in cells, both multiples of `block`, each 480–2048 (06 §1; `test` rooms may be smaller). `w/block` must equal every map row's length; `h/block` the row count |
| `block` | yes | 4, 8 or 16 |
| `seed` | yes | decorator + spawner seed; changing it re-rolls the look without moving anything that matters |
| `theme` | yes | key in `themes.json` |
| `rain` | no | overrides the act's rain; `{ "density": 0 }` for indoors |
| `ambient` | no | overrides the act's ambient `{ "color", "power", "bottomMult" }` |
| `legend` | no | extra/overriding characters for this room (§6.3) |
| `map` | yes | the coarse grid |
| `back` | no | an optional second grid, same size, for the background wall (default: the theme's `backWall` everywhere the map is not `:`) |
| `ops` | no | shape operations, applied in order after the map (§6.4) |
| `things` | no | placed prefabs (§6.5) |
| `wires` | no | signal connections (§6.6) |
| `floodlines` | no | height-field floods (06 §8.9): `[{ "id", "rect", "level", "target", "rate", "mat" }]` (built first cut) |
| `edges` | no | `drain` spans on the room edge where liquids leave (06 §2.4): `[{ "side": "e", "from": 384, "to": 447 }]` (built) |
| `decor` | no | overrides the theme's decorator settings (§6.7) |
| `puzzle` | puzzle, lesson, flood and trap rooms | `{ "solution": [ verbs ] }` — the verb-level solution script (§6.11) |
| `kit` | generated rooms only | `{ "id": "fight_small", "params": {…}, "seed": 104 }` — how it was made (§6.16) |
| `camera` | no | defaults for camera zones |

### 6.3 The legend (built, `data/legend.json`)

A room's `legend` can add or override single characters.

| Char | Material | Char | Material | Char | Material |
|---|---|---|---|---|---|
| `.` | air, background wall behind | `:` | air, **open sky** (no back wall; rain falls) | `X` | bedrock |
| `#` | stone | `B` | brick | `M` | metal |
| `G` | glass | `W` | wood | `x` | wax |
| `I` | ice | `m` | stone with a moss skin | `k` | bone |
| `c` | cloudstuff | `d` | dirt | `s` | sand |
| `i` | silt | `r` | rubble | `~` / `w` | water |
| `o` | oil | `b` | bile | `u` | mud |
| `q` | molten wax | `e` | web | `g` | stone with a glowmoss skin |
| `%` | stone, **pinned** | `=` | brick, **pinned** | `?` | stone, **cracked** (half life, a hint of a secret) |

A legend value is either a material key (`"~": "water"`) or an object
`{ "mat": "brick", "pin": true, "cracked": true, "sky": false, "bg": "stone", "skin": "moss" }`. **Pinned** cells
are the soft-lock rule's puzzle-critical cells: they never detach, blasts skip them, and they draw a brass rim
(00 §13, 06 §2.2).

Rules: every map row is the same length; every character is in the legend; the whole outer ring of the room
should be `X` except where exits and drains are (the checker warns otherwise).

### 6.4 Shape operations (`ops`, built)

Coordinates are **cells** unless the op has `"unit": "block"`. Rectangles are `[x, y, w, h]`. Every op can take
`"mat"` (material key), `"back"` (write the background wall instead), `"pin": true`, `"only": ["air"]` (only
overwrite these materials) and `"exact": true` (add its rect to the decorator's keep-out mask).

| op | Fields | Draws |
|---|---|---|
| `rect` | `rect`, `mat` | a filled rectangle |
| `frame` | `rect`, `mat`, `thick` | a hollow rectangle |
| `circle` | `at: [x, y]`, `r`, `mat` | filled disc |
| `ellipse` | `at`, `rx`, `ry`, `mat` | |
| `poly` | `points: [[x,y],…]`, `mat` | filled polygon (even-odd) |
| `line` | `from`, `to`, `thick`, `mat` | thick line |
| `stairs` | `from`, `steps`, `rise`, `run`, `dir: "r"|"l"`, `mat` | a staircase |
| `arch` | `rect`, `thick`, `mat` | a semicircular arch |
| `carve` | `rect`, `noise: { "scale", "threshold", "octaves" }`, `mat` (default air) | noise-carved pockets |
| `fill` | `at`, `mat`, `level` (y), `max` | flood-fills **air** from `at` with a liquid, only below `level`, up to `max` cells |
| `scatter` | `rect`, `mat`, `count`, `size: [min, max]` | clumps of a powder or solid |
| `vein` | `from`, `to`, `mat`, `thick`, `wobble` | a wandering line |
| `strata` | `rect`, `mats: ["stone", "dirt"]`, `bands: [8, 3]`, `tilt` | layered bands in the solid part of a rect |
| `basin` | `id`, `rect`, `level`, `rate`, `inlets: [[x,y]]`, `drains: [[x,y]]` | declares a sluice basin (06 §8.5); does not draw — use `fill` for the starting water |
| `rope` | `from` (anchor cell), `length`, `mat` (default rope) | a hanging rope of rope cells (06 §10.1 `hang`) |
| `tunnel` | `points`, `r` | carves a round tunnel along a path |
| `copy` | `rect`, `to`, `flipX` | copy a region |
| `clear_decor` | `rect` | the decorator leaves this rect alone |

Ops are applied **in order**; later ops overwrite earlier ones. Ops draw before the decorator runs.

### 6.5 Things (placed prefabs)

Each thing: `{ "t": type, "id": unique-in-room, "at": [x, y], …props }`. `at` is the **bottom-centre** for
anything that stands, and rect things (doors, zones, gates) use `rect` instead. Defaults are in `prefabs.json`;
behaviour is 07's (interactables, traps, building, zones) or the owner named below. **Type names are 07's**
(R5).

| `t` | Key props | Owner / notes |
|---|---|---|
| `entry` | `id` (`w`, `e`, `n`, `from_a1_03`…), `face` | where the player appears when arriving by that id |
| `exit` | `rect`, `to: "room_id"`, `entry`, `requires?` | touching it changes room (06 §19.5); built in `tick.js` |
| `rekindle` | — | the free Rekindle post at the entry of every puzzle, lesson, flood and trap room (00 §13) |
| `lamp_post` | `id` | save, heal, respawn, braid, fast travel (07) |
| `great_lamp` | `act` | the act's Great Lamp (hub rooms only) |
| `lamp_socket` | `id` | a place a lantern post or a thrown light can sit (07) |
| `lever` / `button` / `target` / `plate` / `valve` | 07's props | emit `on` / `off` / `pulse` or a number (valve) |
| `door` / `timed_door` / `portcullis` / `light_door` | `rect`, `mat`, `state`, `open` (timed: default **4 s**) | cells (06 §12.6) |
| `sluice_gate` | `rect`, `basin` or `flood`, `mat` | a door that also drives its basin or floodline |
| `spark_coil` | `rect` | powered by Spark (07) |
| `lift` | `rect`, `path` | a moving platform entity |
| `bell` | `rect`, `radius` | Act 5 (07); shakes loose cells |
| `breakable_wall` | `rect`, `group` | broken walls persist as prefab state |
| `gravity_lantern` | `rect`, `dir` | Act 5 (07) |
| `gravity_band` | `rect`, `dir` | a zone: 06 §10.7 |
| `current` | `rect`, `v: [vx, vy]`, `share`, `on`, `cells` | a zone: 06 §8.10 (built) |
| `sanctuary` / `nobuild` | `rect` | zones: no building, spells change no cells, NPCs ignore damage (sanctuary). A `hub` room is a sanctuary as a whole (R87) |
| `oil_barrel` / `crate` | — | physics objects; the barrel refuels or ignites (07) |
| `trap_spikes`, `trap_icicle`, `trap_pendulum`, `trap_crusher`, `trap_darts`, `trap_flamejet`, `trap_ratpipe`, `trap_sparkpuddle`, `trap_waxdrip`, `trap_tollrubble` | 07's props | traps hit anything, enemies included |
| `grapple_point` | — | hook target (Act 2+) |
| `rope_anchor` | `length` | a verlet level rope (not cells) |
| `chest` | `loot`, `locked?` | `save: once` |
| `pickup` | `kind`, `amount` / `item` | pennies, pearls, oil, scrap, a fixed item |
| `spawn` | `enemy`, `count`, `rect?`, `when: "enter"|"signal"`, `elite?` | enemies are placed at room load; only hatches and ambushes use `signal`, with a 500 ms sound (05, R86). **Never in lesson rooms** |
| `boss` | `boss` | boss spawn + arena lock (05) |
| `npc` | `npc` (an `npc_*` id), `face` | talkable (01) |
| `shopkeeper` | `shop` | opens a shop (08) |
| `sign` | `text` (a `strings.json` id) | readable plaque |
| `light` | `color`, `r`, `intensity`, `shadow`, `flicker`, `sprite?` | a static light source (built: read by `frame.js`) |
| `drip` | `every: [1.2, 4]`, `stream` | a forced drip point / leaking pipe (built) |
| `zone` | `rect`, `on: "enter"|"leave"|"inside"`, `once` | emits signals when the player is there |
| `camzone` | `rect`, `lock: "x"|"y"|"both"|"none"`, `frame?`, `wide?` | camera rules (06 §19.2; per-boss rows 05) |
| `logic` | `kind`, kind props (§6.6) | a gate for wiring |
| `lesson` | `mechanic`, `hint` (strings id) | marks a lesson room's teaching moment (09) |
| `decor_prop` | `prop`, `layer: "back"|"front"` | decoration sprites |

Build parts (`bp_plank`, `bp_brace`, `bp_crate`, `bp_ladder`, `bp_rope_peg`, `bp_sandbag`, `bp_float`,
`bp_lantern_post`; Tinker `bp_turret_1`, `bp_spikes`) are placed by the player, not authored; they are saved in
the room state's `built` list (§7.3). The built `tools/room-check.mjs` still accepts some v1 type names
(`sluice`, `spike`, `breakable`, `trap`, `sconce`, `timer`, `counter`); M16 switches it to this table.

### 6.6 Wiring (R5)

```json
"wires": [
  { "from": "lv_sluice", "to": "gate_1", "do": "toggle" },
  { "from": "lv_sluice", "to": "weir", "do": "drain", "when": "on" },
  { "from": "lv_sluice", "to": "weir", "do": "fill", "when": "off" },
  { "from": "plate_1", "to": "door_low", "do": "open", "when": "on" },
  { "from": "weir", "to": "voss", "do": "say", "line": "weir_drained_comment", "when": { "levelBelow": 420 } }
]
```

- **Signals** are `on`, `off`, `pulse` or a number (a basin or flood level, a counter value). `when` filters them:
  `"on"`, `"off"`, `"pulse"`, `{ "levelBelow": y }`, `{ "levelAbove": y }`, `{ "equals": n }`.
- **Actions** (`do`): `open`, `close`, `toggle` (doors, gates, lights, currents, bands — "open" means on),
  `drain`, `fill`, `stop` (basins and floodlines), `say` (with `"line"`: a Lingo intent), `spawn` (a `spawn`
  thing with `when: "signal"`), `fire` (a trap or a `logic` gate's output).
- **Logic gates** are `logic` things of **seven kinds** (07's list):

| `kind` | Props | Emits |
|---|---|---|
| `timer` | `every` or `after` (s) | `pulse` |
| `latch` | — | `on` after the first `on`, until `off` |
| `toggle` | — | flips `on`/`off` on each `pulse` |
| `counter` | `need` | `on` after `need` pulses |
| `sequence` | `order: [ids]` | `on` when inputs arrive in order (`pulse` resets) |
| `compare` | `op: "<"|">"|"="`, `value` | `on` while its number input compares true |
| `any_of` | — | `on` while any input is `on` |

- Wiring runs at tick step 2; a chain resolves in one tick, max depth 16 (a loop is reported by the checker and
  cut at runtime). Wires are drawn in the debug overlay (§11). Wiring itself is planned (M16).

### 6.7 The decorator (built, `js/world/decor.js`)

Runs after ops, seeded with `hashSeed(room.seed, 'decor')`, and never touches keep-out rects: `clear_decor`,
`exact` ops, and a margin around every thing (2 cells round a thing's rect; a 12 × 18 box above an `at` point).
Steps, each controlled by a number in `decor` (0 = off):

| Step | Setting (default from theme) | What it does |
|---|---|---|
| 1. **Edge erosion** | `erode` 0–1 | near boundaries between solid and air, noise swaps cells across the boundary, breaking straight block edges into ragged lines. Liquids are never created this way |
| 2. **Rounding** | `round` 0–3 passes | a cellular pass that takes corners off |
| 3. **Grime / strata** | `grime`, `strata` | darker shade steps near floors; rock layers |
| 4. **Masonry** | automatic for brick | courses are shader-drawn; the decorator knocks out a few missing bricks near edges |
| 5. **Cracks** | `cracks` 0–1 | short random walks through stone/brick, never through 2-cell-thin walls |
| 6. **Moss** | `moss`, `glow` | moss (or glowmoss) skins on wet top surfaces |
| 7. **Wax runs** | `waxDrips` | frozen wax drips under wax (Act 1) |
| 8. **Rubble** | `rubble` | small piles at wall bases |
| 9. **Drips** | `drips` n | the `n` best drip points in addition to the automatic ones |
| 10. **Props** | theme `props` | decor sprites on suitable surfaces (planned) |

**Never on puzzle geometry:** pinned cells are never edited by the decorator (built: `canEdit` skips `PINNED`).
Result: the same map + a different `seed` gives a room that plays the same and looks freshly carved.

### 6.8 Coordinates cheat sheet (for authors)

- Map row `r`, column `c` at block `b` covers cells `x ∈ [c×b, c×b+b−1]`, `y ∈ [r×b, r×b+b−1]`.
- A floor whose top block is row `r` has its walkable surface at `y = r × b`; an entity standing on it has feet at
  `y = r × b − 1` (use that for `at`).
- Movement limits (jump height and distance, step-up, what needs a rope or a plank) are `movement.json` (07);
  `tools/room-check.mjs` runs the reachability bot with those real numbers, so author by testing, not by rule of
  thumb.
- 1 screen = 480 × 270 cells. A room that takes 30 s–4 min (pillar 6) is usually 1–4 screens.

### 6.9 Compile pipeline (`js/world/roomload.js`, built)

1. **Validate** the shape (`validateRoomShape`: id, size vs block, row count and lengths, unknown legend chars).
2. **Blocks:** allocate the grid, write each map character's material to its block; `:` marks sky; set `PINNED`
   for pinned chars; halve life for `cracked`; set the back wall from the theme or the `back` grid.
3. **Shade:** a seeded shade for every cell.
4. **Ops** in order; keep-out rects from `exact` ops, `clear_decor` and things.
5. **Decorator** (§6.7), then legend skins (moss / glowmoss).
6. **Derived data:** water count, sky columns (`skyTop`), drain edges, basins, entries and exits; wake every
   chunk, mark everything hot and dirty.
7. **Things' cells** (door cells, prefab mounts pinned) — planned with prefabs (M16).
8. **No settle** (R50). The compiler places liquids already level (`fill` only fills below a level) and powders on
   support; `room-check` fails a room that needs more than **30 ticks** to go quiet. *As built, the compiler still
   runs `opts.settle ?? 120` ticks; M2 sets the default to 0 once every room passes the check.*

Budget: compile + load inside the 0.25 s fade-out for a 960 × 540 room (06 §19.5).

### 6.10 How an agent makes a room (workflow)

1. `node tools/room-new.mjs a3_sluice_05 --act act3 --kind puzzle --size 960x544 --block 16` (planned, M11)
   copies `rooms/_template.json`, fills in id/act/size/seed/theme and a map with a bedrock frame, and adds it to
   `rooms/index.json`. `--kit fight_small --seed 104` instead writes a kit-generated room (§6.16) for hand editing.
2. Draw the map (air `.`/sky `:` first, then solids), add ops for slopes, pools and exact puzzle geometry; pin
   puzzle-critical cells.
3. Add `entry`/`exit` things first, then the lamp-post or Rekindle post, then puzzle things and wires, then spawns.
4. For puzzle, lesson, flood and trap rooms, write `puzzle.solution` (§6.11).
5. `node tools/room-check.mjs a3_sluice_05` — must print `OK` (built).
6. `node tools/room-thumbs.mjs a3_sluice_05` — look at `rooms/_thumbs/a3_sluice_05.png` (Read tool) (built).
7. Open `index.html?room=a3_sluice_05&debug=1` to play it (built: `?room=`; `debug` planned).

### 6.11 `room-check`, solution scripts and thumbnails

`tools/room-check.mjs [id|--all]` (pure Node, reuses `roomload.js` and `reach.js`) **errors** on (built items
marked ✓):

- ✓ map row count/lengths not matching `size/block`; unknown legend chars; size over 2048; `id` not matching its
  `rooms/index.json` key;
- ✓ duplicate thing ids; unknown thing types; ✓ unknown enemy / npc ids (when those files exist); unknown shop,
  boss, loot ids;
- ✓ exits whose target room or entry id is missing; ✓ a room with no `entry`; ✓ a **lesson room that spawns**
  enemies (R66);
- ✓ wires naming missing things; actions a target does not accept; wire loops;
- ✓ **reachability** (R8): the bot builds a movement graph from the compiled room with the real
  `movement.json` and the act's verbs (swim from Act 3, grapple from Act 2, ropes and grapple points as links)
  and fails any exit not reachable from every entry;
- **settle:** more than **30 ticks** before no cell moves in the sim window (R50);
- **the awake-liquid cap:** more than 60,000 awake liquid cells at the peak of the room's scripted events (00 §13);
- **the single-flame rule** (R10): for puzzle rooms, apply each flame (03's reactions) to each unpinned cell on the
  solution path; if any one breaks the solution script, fail;
- things overlapping solid cells after compile; floating with no floor within 64 cells below (warning);
- gas above 6,000, shadowed lights above 24 (06 perf limits);
- player-facing text containing a word on the banned third-party list (`tools/ip-words.json`).

**Solution scripts (R49).** A puzzle, lesson, flood or trap room carries
`"puzzle": { "solution": [ … ] }`, a list of **verbs** the path-finding bot plays with the real movement and
spell code:

| Verb | Shape | Does |
|---|---|---|
| `goto` | `{ "goto": "thing_id" }` or `{ "goto": [x, y] }` | walk/jump/swim there using the reach graph |
| `interact` | `{ "interact": "thing_id" }` | the interact action at that thing |
| `castAt` | `{ "castAt": [x, y], "wick": { "flame": "rime", "shape": "lob" } }` | braid and cast |
| `build` | `{ "build": "bp_plank", "at": [x, y], "rot": 0 }` | place a part |
| `waitFor` | `{ "waitFor": { "thing": "weir", "levelBelow": 420 } }` or `{ "waitFor": 2.5 }` | wait for a signal or seconds (timeout 60 s) |

The script passes when the room's **goal** is met: every exit listed in `puzzle.goal` (default: all exits) is
reached. Scripts are also what the e2e route specs replay.

`tools/room-thumbs.mjs [id|--all]` (built) compiles a room and writes `rooms/_thumbs/<id>.png` at 1 px per cell in
flat colours (a tiny PNG writer, no canvas package). A contact sheet `rooms/_thumbs/index.html` is planned.

### 6.12 Versioning rooms

`format` starts at 1. A format change adds a migration in `roomload.js` (`ROOM_MIGRATIONS[n](room) → room`) and
`tools/room-migrate.mjs` rewrites files on disk. The game can load any older format. v2's additions are optional
fields, so no migration was needed.

### 6.13 Example 1 — a one-screen lesson room (block 8)

Both examples are checked in (`rooms/act1/a1_wax_stair_02.json`, `rooms/act3/a3_sluice_04.json`, listed under
`examples` in `rooms/index.json`). The text below is the **v2** version (R66: no spawn in the lesson, `gutter_rat`,
`npc_voss`, 07's `sluice_gate`, Rekindle posts, solution scripts). The checked-in files still carry the v1 names
until M2 updates them; from then on `rooms.test.js` asserts that each example here compiles to the same cell hash
as its file and passes `room-check`.

Act 1, a room of the Drip Gallery lesson (`a1_n06`), teaching the **plank kit** (00 §6.2): a cistern under a
broken beam walkway, a jump that fails without a plank. Rain falls into the open middle, so the cistern visibly
catches it. Lessons have **no enemies** (R66) and a Rekindle post at the entry. 480 × 272, block 8 → 60 columns
× 34 rows.

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
  "rain": { "density": 60, "wind": 0.2, "deposit": 0.07, "maxDeposit": 3000 },
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
    { "op": "stairs", "from": [76, 199], "steps": 5, "rise": 3, "run": 4, "dir": "r", "mat": "wax", "note": "a walkable ramp from the dirt floor (y 200) up to the first wax block (y 184); rises of 3 are within the running step-up (movement.json)" },
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
    { "t": "rekindle", "id": "rk_a1_02", "at": [24, 199] },
    { "t": "lamp_post", "id": "lp_a1_02", "at": [40, 199] },
    { "t": "pickup", "id": "scrap_1", "kind": "scrap", "amount": 2, "at": [64, 199] },
    { "t": "pickup", "id": "scrap_2", "kind": "scrap", "amount": 2, "at": [160, 135] },
    { "t": "sign", "id": "sign_plank", "at": [168, 135], "text": "sign.a1_02.plank" },
    { "t": "lesson", "id": "lesson_plank", "mechanic": "plank_kit", "hint": "lesson.plank.gap", "at": [176, 135] },
    { "t": "zone", "id": "zone_gap", "rect": [176, 96, 32, 40], "on": "inside", "once": true },
    { "t": "light", "id": "lt_ruin", "at": [432, 124], "color": "#ffc46a", "r": 64, "intensity": 0.9, "shadow": true, "flicker": 0.1, "sprite": "wall_lantern" },
    { "t": "light", "id": "lt_wax", "at": [150, 120], "color": "#ffd27a", "r": 40, "intensity": 0.6, "shadow": true, "flicker": 0.15, "sprite": "candle_cluster" },
    { "t": "drip", "id": "drip_stal", "at": [201, 85], "every": [1.2, 2.4] },
    { "t": "pickup", "id": "oil_ruin", "kind": "oil", "amount": 20, "at": [440, 148] }
  ],
  "wires": [
    { "from": "zone_gap", "to": "lesson_plank", "do": "pulse", "note": "shows the plank prompt when the player stands at the gap" }
  ],
  "decor": { "erode": 0.3, "moss": 0.15, "cracks": 0.1, "waxDrips": 0.5 },
  "puzzle": { "solution": [
    { "goto": "scrap_2" }, { "build": "bp_plank", "at": [206, 135], "rot": 0 },
    { "goto": [270, 135] }, { "goto": "exit_e" } ] },
  "notes": "Beam gap is 56 cells (x 208..263): tuned against movement.json so the running jump falls short and the plank makes it (room-check's reachability bot proves both: exit_e unreachable without bp_plank, reachable with it). The cistern catches rain; by the time a slow player arrives it has visibly risen a little (maxDeposit keeps it from overflowing the lip)."
}
```

### 6.14 Example 2 — a two-by-two-screen sluice puzzle (block 16)

Act 3, a puzzle room. A flooded weir basin fills most of a vaulted hall. Pull the lever in the upper-left alcove to
open the sluice gate: the basin drains through a trench and out of the room, which uncovers a pressure plate on the
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
    { "op": "basin", "id": "weir", "rect": [384, 224, 352, 224], "level": 224, "rate": 90,
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

    { "t": "rekindle", "id": "rk_a3_04", "at": [24, 159] },
    { "t": "lamp_post", "id": "lp_a3_04", "at": [248, 431] },

    { "t": "lever", "id": "lv_sluice", "at": [296, 223], "state": false },
    { "t": "sign", "id": "sign_weir", "at": [280, 223], "text": "sign.a3_04.weir" },
    { "t": "sluice_gate", "id": "gate_1", "rect": [736, 384, 32, 64], "basin": "weir", "mat": "metal" },
    { "t": "plate", "id": "plate_1", "rect": [600, 444, 24, 4], "weight": 1 },
    { "t": "timed_door", "id": "door_low", "rect": [896, 368, 16, 80], "mat": "metal", "open": 12 },

    { "t": "grapple_point", "id": "gp_1", "at": [480, 50] },
    { "t": "grapple_point", "id": "gp_2", "at": [640, 50] },
    { "t": "grapple_point", "id": "gp_3", "at": [744, 50] },

    { "t": "chest", "id": "chest_secret", "at": [112, 431], "loot": "loot_chest_a3_secret" },
    { "t": "pickup", "id": "pearl_basin", "kind": "pearls", "amount": 1, "at": [424, 447] },

    { "t": "spawn", "id": "sp_eels", "enemy": "sluice_eel", "count": 3, "rect": [400, 260, 320, 150], "when": "enter" },
    { "t": "spawn", "id": "sp_rats", "enemy": "gutter_rat", "count": 2, "rect": [190, 400, 120, 30], "when": "signal" },

    { "t": "light", "id": "lt_lp", "at": [248, 400], "color": "#ffc46a", "r": 96, "intensity": 1.2, "shadow": true, "flicker": 0.04, "sprite": "none" },
    { "t": "light", "id": "lt_vault_a", "at": [420, 70], "color": "#6fb0ff", "r": 90, "intensity": 0.5, "shadow": true, "flicker": 0.02, "sprite": "sluice_lamp_cold" },
    { "t": "light", "id": "lt_vault_b", "at": [700, 70], "color": "#6fb0ff", "r": 90, "intensity": 0.5, "shadow": true, "flicker": 0.02, "sprite": "sluice_lamp_cold" },
    { "t": "light", "id": "lt_trench", "at": [860, 380], "color": "#ffb060", "r": 70, "intensity": 0.8, "shadow": true, "flicker": 0.1, "sprite": "wall_lantern" },

    { "t": "drip", "id": "drip_inlet", "at": [432, 66], "every": [0.2, 0.2], "stream": true },
    { "t": "zone", "id": "zone_drained", "rect": [384, 400, 352, 48], "on": "enter", "once": true },
    { "t": "camzone", "id": "cam_hall", "rect": [336, 32, 480, 432], "lock": "none", "wide": true },
    { "t": "npc", "id": "voss", "npc": "npc_voss", "at": [872, 159], "face": "l" }
  ],
  "wires": [
    { "from": "lv_sluice", "to": "gate_1", "do": "open", "when": "on" },
    { "from": "lv_sluice", "to": "gate_1", "do": "close", "when": "off" },
    { "from": "lv_sluice", "to": "weir", "do": "drain", "when": "on" },
    { "from": "lv_sluice", "to": "weir", "do": "fill", "when": "off" },
    { "from": "plate_1", "to": "door_low", "do": "open", "when": "on" },
    { "from": "weir", "to": "voss", "do": "say", "line": "weir_drained_comment", "when": { "levelBelow": 420 } },
    { "from": "zone_drained", "to": "sp_rats", "do": "spawn", "note": "an ambush: two rats come out of the drain once you walk the basin floor (500 ms sound first, 05)" }
  ],
  "decor": { "erode": 0.25, "moss": 0.35, "glow": 0.1, "cracks": 0.2, "grime": 0.4, "drips": 10 },
  "puzzle": { "solution": [
    { "goto": [336, 176] }, { "goto": "lv_sluice" }, { "interact": "lv_sluice" },
    { "waitFor": { "thing": "weir", "levelBelow": 440 } },
    { "goto": "plate_1" }, { "waitFor": 0.2 }, { "goto": "exit_se" } ] },
  "notes": "Routes. (1) Drained: gallery -> rope down the shaft (x 336) -> lever alcove at y 223 -> pull -> the gate opens and the basin empties in ~15 s (78,800 cells at 90/tick) -> drop into the basin (256 cells; the vault rope at x 560 gives a way down and back up) -> step on the plate at x 600 -> door_low opens for 12 s -> run through the open gate (x 736..767) and along the trench to x 896: ~300 cells, about 3.5 s. (2) Flooded: swim the basin surface (y 224), climb the right wall top (y 192), grapple gp_3 and swing to the NE shelf (floor y 160). The cracked brick column (Q, x 160..175) hides the chest in the lower-left room; Ember or melee breaks it. Controlled drain: cells are removed at the drain point, and the outflow through the open gate is drawn as fading particles, so the trench stays walkable."
}
```

### 6.15 `rooms/index.json` (built)

```json
{ "_doc": "Every room: id -> file (relative to rooms/), act, kind. 'examples' are the two worked examples…",
  "version": 1,
  "rooms": { "bench_flood": { "file": "bench/bench_flood.json", "act": "none", "kind": "bench" } },
  "examples": { "a1_wax_stair_02": "act1/a1_wax_stair_02.json", "a3_sluice_04": "act3/a3_sluice_04.json" } }
```

`rooms` holds every playable room; `examples` holds format references that compile and are tested but are not in
any act (built: `loadRoom` falls back to `examples`).

### 6.16 Room kits (R8, B10; planned M11)

Fight nodes are filled by **six room kits** — parametric generators that emit ordinary §6 room JSON:
`fight_small`, `fight_tall`, `shaft`, `bridge_gap`, `flooded_hall`, `corridor_run`.

- **Code:** `js/world/kits.js` exports `KITS[id](params, rng) → room JSON`. It is used by the game (the Long
  Descent chains kit rooms at run time) and by `tools/room-new.mjs --kit` (campaign fight rooms are generated
  once, checked in, and may be hand-edited afterwards; the room keeps its `kit` field for provenance).
- **Parameters** live in `data/kits.json` (§5.10): size ranges, block, platform and gap counts, spawn counts,
  whether the room has a floodline, the act's theme.
- **Output rules:** a kit room always has a bedrock frame, `entry`/`exit` things matching its node's edges, a
  lamp-post or none (per 09), spawns drawn from the act's spawn table, and it **must pass `room-check`** —
  acceptance: every kit × 8 seeds passes (REVIEW M11).
- **The Long Descent** chains kit rooms plus hand-made rooms tagged `endless` (09); its floodline is a
  `floodlines` entry (06 §8.9). The v1 "endless pieces" format is in Parked.

---
## 7. Save format

### 7.1 Storage and budgets (R47, R64)

Saves use `localStorage` through the playground's `shared/store.js`: `const store = makeStore('lanternfall', 1)`,
so every key lives under the `lanternfall:` prefix. **The store version stays 1 forever** (changing it moves
every key to a new prefix and orphans old saves); each save's own `schema` number handles changes (§7.6).

| Key | Holds | Budget |
|---|---|---|
| `settings` | §8 | ≤ 4 KB |
| `profile` | cross-run progress: Guild marks, unlocked classes, trials and medals, challenges, Guild Hall unlocks, achievements, cosmetics, codex, tutorials seen, the Daily record and the local boards (top 20 per mode) | ≤ 16 KB |
| `slot1`, `slot2`, `slot3` | campaign saves | ≤ 64 KB each |
| `slot1.bak` … `slot3.bak` | **one** rotating backup per slot: the previous version, written before overwriting | ≤ 64 KB each |
| `endless` | the current Long Descent run (written at room changes only) | ≤ 16 KB |
| **Total** | | **≤ 420 KB** (4 + 16 + 6 × 64 + 16) |

`localStorage` has ~5 MB per origin shared by the **whole playground**, which is why the budgets are tight. Rules:

- `save.js` measures the JSON before writing. Over budget it trims the Ledger history first (keep the last
  **50 rooms**, §10.3), then Lingo memories (each NPC keeps at most 24, 01), then refuses with a visible error —
  never a silent failure (`store.set` returns false on a quota error; we check it).
- A **max-save test** builds the biggest legal slot (every room visited, every NPC with 24 memories, a full
  Ledger) and asserts it is ≤ 64 KB, and that all keys together estimate ≤ 420 KB.
- **IndexedDB** only if that estimate ever passes 1 MB (parked).

### 7.2 Slot schema (campaign)

```json
{
  "schema": 1, "game": "lanternfall", "slot": 1,
  "created": "2026-09-26T18:04:11Z", "updated": "2026-09-27T01:12:40Z", "playtime": 5231.4, "build": "2026-09-26",
  "mode": "campaign", "seed": 918273, "difficulty": "lamplighter", "ironWick": false,

  "hero": {
    "name": "Wren", "class": "lamplighter", "level": 7, "xp": 1340,
    "attrs": { "might": 8, "wick": 14, "draught": 11, "nerve": 9, "knack": 6 },
    "unspent": { "attr": 0, "skill": 1 }, "board": { "ll_steady_hand": 1 },
    "hp": 112, "oil": 70, "maxHpDebt": 0,
    "look": { "hood": 2, "cloak": "#3a2f45" }
  },
  "wicks": [
    { "id": "w1", "flame": "ember", "shape": "bolt", "charms": ["split"], "knot": null, "name": "Odile's Little Sparrow" },
    { "id": "w2", "flame": "gleam", "shape": "ring", "charms": [], "knot": null, "name": null }
  ],
  "burn": { "flame": { "ember": 640, "gleam": 90 }, "shape": { "bolt": 610, "ring": 120 } },
  "mastered": null,
  "loadout": { "slots": ["w1", "w2"], "selected": 0 },
  "unlocked": {
    "flames": ["ember", "gleam", "rime", "spark"], "shapes": ["bolt", "ring", "lob", "tether"],
    "charms": ["split"], "knots": [],
    "mechanics": ["wick_builder", "plank_kit", "grapple", "overcharge"], "wickSlots": 2, "charmSlots": 1
  },
  "inventory": {
    "equipped": { "weapon": { "base": "pole_lantern", "rarity": "fine", "ilvl": 6, "temper": 1,
                              "affixes": [ { "id": "aff_light_radius", "value": 0.07 } ] } },
    "bag": [], "belt": { "guildFlask": 2, "lamp_oil": 3 }, "keys": [], "scrap": 5
  },
  "currency": { "pennies": 212, "pearls": 1 },
  "purse": { "room": "a2_crank_01", "x": 310, "y": 199, "pennies": 70 },

  "world": {
    "act": "act2", "room": "a2_crank_01", "lampPost": "lp_a2_06",
    "lampsLit": ["act1"],
    "rooms": {
      "a1_wax_stair_02": { "prefabs": { "scrap_1": "taken" }, "killed": [], "built": [] },
      "a2_lockhouse_01": { "prefabs": { "lv_1": "on", "wall_secret": "broken", "chest_1": "open" },
                           "killed": ["sp_rats#0", "sp_rats#1"],
                           "built": [ { "part": "bp_plank", "x": 206, "y": 135, "rot": 0, "cells": 48 } ] }
    },
    "actMaps": { "act1": { "visited": ["a1_n01", "a1_n02"], "cleared": ["a1_n01"], "revealed": ["a1_n01", "a1_n02", "a1_n03"] } }
  },
  "story": {
    "flags": { "met_odile": true }, "kindling": ["tallow_cooled"], "knows_keeper_rule": false,
    "npcs": { "npc_odile": { "met": true, "memories": [], "relation": {} } }
  },
  "stats": { "kills": 88, "deaths": 2, "ropeMetres": 0, "oilSpent": 1840, "trapKills": 3, "roomsRekindled": 1 },
  "ledger": { "fights": [], "itemStats": {} },
  "rng": { "loot": 3942781, "spell": 118273, "talk": 55120 }
}
```

### 7.3 The room state record (R3)

Canon (00 §13): **prefab state persists, raw cell changes do not.** Each visited room keeps exactly:

```json
{ "prefabs": { "<thing id>": "<state>" }, "killed": ["<spawn id>#<n>"], "built": [ { "part", "x", "y", "rot", "cells" } ] }
```

- `prefabs`: only things whose `prefabs.json` `save` policy is `state` or `once` (levers, gates, doors, chests,
  lamp-posts, broken `breakable_wall` groups…), keyed by thing id.
- `killed`: placed enemies that are dead (a spawn thing's id plus the index within its count); killed enemies
  stay dead, including across a Rekindle.
- `built`: the player's build parts as a part list (07): a burned or broken part is removed from the list or its
  `cells` count lowered; the cells themselves are rebuilt from the list on entry.
- **No cell diffs.** Burns, melts, moved water, frozen falls and dug holes reset on re-entry. Anything a puzzle
  must remember is a prefab (07). Built so far: `game.roomState = {}` is created in `enterRoom` (M9 fills it).

### 7.4 Profile schema

```json
{ "schema": 1, "marks": 14, "classes": ["lamplighter", "sluicewarden", "tinker"],
  "trials": { "trial_rope_gauntlet": { "best": 131.2, "medal": "bronze" } },
  "challenges": { "sweep_rope_2000": { "value": 412 } },
  "guildhall": ["gh_flask"], "achievements": ["…"], "modes": ["campaign", "waves", "trials"],
  "cosmetics": ["lantern_lanternfall"], "codex": { "enemies": ["wax_mite"], "combos": ["steam_burst"] },
  "tutorialsSeen": ["move", "wick_builder"],
  "daily": { "date": "2026-09-26", "spent": true, "best": [] },
  "boards": { "endless": [], "waves": [], "bossrush": [] } }
```

### 7.5 When saving happens

| Moment | What is written |
|---|---|
| resting at a `lamp_post` | the whole slot; `world.lampPost` = that post; hp/oil refilled first |
| relighting a Great Lamp | the whole slot (the Ferry health debt is refunded first) |
| entering an act hub | the whole slot |
| buying or selling | `inventory`, `currency` and `story.npcs` of the slot (a partial write of the same JSON) |
| unlocking a class/trial/cosmetic, earning marks | `profile` only, at once |
| quitting from the pause menu | nothing new — resume puts you at the last lamp-post with the state saved there (the menu says so) |
| death | nothing written; respawn at the last lamp-post with its saved state; the penny purse is left where you died (`purse`; the percentage is 02's difficulty table) |
| settings change | `settings` (debounced 300 ms) |

Every write: serialise → size check → copy the current slot to `slotN.bak` → write `slotN` → re-read and
`JSON.parse` it to verify. On load, if `slotN` fails to parse or migrate, offer the `.bak`.

### 7.6 Versioning and migrations (`js/save/migrations.js`, planned M9)

```js
export const CURRENT = 1;
export const MIGRATIONS = [ /* { from: 1, to: 2, up(s) { s.hero.look ??= {}; return s; } } */ ];
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

A migration never deletes a field it does not understand (it moves it to `s._legacy`); every migration gets a
fixture (`tests/fixtures/saves/v<N>.json`) and a unit test; ids renamed in data get a map
(`RENAMED = { charms: { old_id: 'new_id' } }`) applied on load so a renamed id never disappears from a save.

### 7.7 Export / import

Pause → Save slots → **Export** downloads `lanternfall-slot1-<date>.json` (`shared/ui.js` `downloadJSON`);
**Import** reads one (`readJSONFile`), migrates, validates, and asks which slot to overwrite.

---

## 8. Settings

Stored under `settings` (one object; defaults in `js/save/settings.js`; the screens and the values are 02's).

```json
{ "schema": 1,
  "audio": { "master": 0.8, "sfx": 0.9, "ambience": 0.7, "music": 0.6, "voice": 0.9, "sfxMethod": "hybrid", "voices": true, "babble": true, "mono": false },
  "video": { "scale": "auto", "bloom": 0.35, "physicsDetail": "high", "particles": "high", "rain": 1.0,
             "reflections": true, "shake": 1.0, "flashes": "normal", "brightnessFloor": 0, "fpsCounter": false },
  "access": { "subtitles": true, "speakerNames": true, "flameGlyphs": false, "overchargeNeedsKey": false,
              "slowTimeBuilding": false, "aimAssist": 0, "gameSpeed": 1.0, "textSize": 1.0 },
  "controls": { "keys": { "play": { "jump": ["Space"] } }, "gamepad": { "deadzone": 0.2 } },
  "ui": { "damageNumbers": true, "minimap": true, "hints": true },
  "debug": { "enabled": false, "langDebug": false } }
```

- `controls.keys` / `controls.gamepad` hold **only the player's overrides**, in `bindings.json`'s shape
  (context → action → codes); the defaults are `data/bindings.json` (02).
- `physicsDetail`: `high` | `low` (06 §10.6, §20.4). `brightnessFloor` adds up to +0.1 to the light floor (06
  §14.6). `slowTimeBuilding` is the 35% build-mode slow-time, default off (R19). `overchargeNeedsKey` is hold
  `Shift` + `cast` / LT (R16). `flashes: "reduced"` caps light flashes at 0.5 and disables full-screen whites.
- There is no renderer choice: the game is WebGL2 (06 §17).
- Settings load before anything renders; unknown keys are kept (forward compatible); missing keys get defaults.

---

## 9. Testing plan and tools

Three layers, as in the rest of the playground: **Node unit tests** for pure logic, **Playwright** in a real
browser, and **headless sims** for balance and performance. House rules: run one Playwright suite at a time on
this machine, and when a spec is red, check whether it was red before your change.

### 9.1 Node unit tests (`tests/unit/*.test.js`, `node --test`)

Built now: `cells.test.js`, `support.test.js`, `currents.test.js`, `wick.test.js` (with `helpers.js`).

| File | Status | What it proves |
|---|---|---|
| `cells.test.js` | built | sand piles into a slope; water levels; oil on top of water; ash floats; conservation (water + steamDebt + ice(FROM_WATER)) through boil/freeze (06 §8.8); same seed → identical arrays |
| `support.test.js` | built | the island, span and hang rules (06 §10) |
| `currents.test.js` | built | a current pushes a body at 60%; floodlines move a row at a time (06 §8.9–8.10) |
| `wick.test.js` | built | the compiler: flame × shape compile, charm rules, two-track burn-in (+3% per level per track), overcharge |
| `purity.test.js` | planned, M8 | every file in the pure folders imports in Node; no file outside `world/grid.js` (and the compiler) writes `grid.mat[`/`grid.temp[`; no `Math.random` in pure folders except the `fx` helper |
| `paths.test.js` | planned, M8 | no `import`/`fetch`/`src`/`href` string in `js/`, `css/`, `*.html` or data starts with `/` (§12) |
| `data.test.js` | planned, M8 | every file passes `data-check`; every canon id from `00-OVERVIEW.md` present exactly |
| `reach-check` | planned, M8 | runs `tools/reach-check.mjs` (§9.5) as a test |
| `rooms.test.js` | planned, M2 | every room in `rooms/index.json` (rooms and examples) compiles and passes `room-check`; the two examples in §6.13–6.14 compile to the same cell hash as the checked-in files; every kit × 8 seeds passes (M11) |
| `solutions.test.js` | planned, M12 | every `puzzle.solution` passes, and the single-flame rule holds (§6.11) |
| `thermal.test.js`, `fire.test.js`, `liquids.test.js`, `rain.test.js`, `collide.test.js`, `explode.test.js`, `fragments.test.js`, `bands.test.js`, `lightgrid.test.js` | planned, M1–M4, M28 | the 06 rules, one file each; `lightgrid` checks tiers, the floor and `ambientTier` leaving out the lantern |
| `damage.test.js`, `status.test.js`, `stats.test.js` | planned, M6–M8 | formula examples from 03/04; one meter record per hit |
| `loot.test.js`, `shops.test.js` | planned, M13 | weights over 100,000 seeded rolls within 1%; every shop quirk hook does its one thing |
| `wiring.test.js` | planned, M16 | signal chains, `when` filters, the 7 logic kinds, loop cut at depth 16 |
| `save.test.js` | planned, M9 | round-trip a full slot; migrations against fixtures; renamed-id map; trim; `.bak` fallback; **max-save size** (≤ 64 KB per slot, ≤ 420 KB total) |
| `replay.test.js` | planned, M8 | a recorded 600-tick input file reproduces the same final state hash (determinism only, R49) |
| `knobs.test.js` | planned, M36 | for each `balance.json` key: move it to an odd value and assert the module that reads it changes its output |
| `bus.test.js`, `rng.test.js` | planned, M8 | ordering, `off`, fork independence, state round-trip |

Run: `node --test prototypes/lanternfall/tests/unit/*.test.js`, and via the root `npm run test:unit` once the
glob is added (M8).

### 9.2 Playwright specs (`tests/e2e/*.spec.js`, against the dev server on 8401; planned from M2)

| Spec | Steps and assertions |
|---|---|
| `boot.spec.js` | load `index.html`; no console errors, no failed requests; `window.lanternfall.ready === true`; `errors` empty; without WebGL2 the "needs WebGL2" card shows |
| `newgame.spec.js` | title → class pick → first room; HUD shows HP, oil, 1 wick slot |
| `scripted-room.spec.js` | `?room=test_script_01&debug=1`; drive with `lanternfall.input.script([...])`; crate cells burning within 60 ticks; a dummy's HP dropped; the meter has a record with `via` = the wick id |
| `water.spec.js` | a flood room: pull the lever → basin level below a line within 20 s; reflection pass active (pixel test) |
| `light.spec.js` | **dark-screenshot spec:** a 0.08-floor room — telegraph rims and enemy eyes visible; lantern on vs off changes a region's luminance > 3×; **CPU/GPU agreement:** one async readback of the light map at 1/8 puts ≥ 95% of tiles in the CPU grid's tier (06 §14.7) |
| `transitions.spec.js` | exits fade 0.25 s out and in; a follower arrives after 1.5 s; a mid-flood room loads at its level |
| `wickbuilder.spec.js` | build a wick, preview and oil cost update, cast it; the guided overlay shows once |
| `save.spec.js` | rest at a lamp-post → reload → Continue → same room, same inventory, prefab state kept, burned cells reset; export/import round trip |
| `settings.spec.js` | change volume/bindings; reload; persisted; rebinding jump works |
| `menus.spec.js` | every screen opens and closes by keyboard and mouse; the HUD fits 427×240, 512×288, 640×360; a 390 px phone viewport shows the "desktop recommended" card and menus fit without horizontal scroll |
| `context-loss.spec.js` | force `WEBGL_lose_context` → restore → frame renders, no errors |
| `rooms-smoke.spec.js` | every room id for 60 frames idle; no errors; frame p95 per room into `test-results/lanternfall-rooms.json` |
| `act1-route.spec.js` | title → Crown relit with debug accelerators (M15) |

Screenshots go to `test-results/`. Desktop 1280×800 plus a 1920×1080 project for render specs.

### 9.3 Headless balance sim and wick ranking

- **`tools/wick-rank.mjs`** (M7): every legal wick per act tier, compiled and simulated 30 s against three target
  sets (single tank, pack of 6 small, a mixed wet/oily group) with the real spell and damage code, **plus a
  physics set** (a pool, an oil slick, a wood wall in a 160 × 90 room using the real cell code, R79). Output
  `research/wick-rank.md`: damage per oil, damage per second, time-to-kill, and a **utility score** (cells changed,
  water moved, doors opened) so utility shapes are not flagged dead; every shape must sit inside 0.67–1.5× the
  median damage per oil of its tier or be utility-flagged.
- **`tools/sim-lanternfall.mjs --runs 200`** (M36): a bot plays the act maps as data with a fight model fed from
  `enemies.json`/`bosses.json` and the real XP, loot, shop and level code. Reports per act: level on arrival
  (target 6 / 11 / 16 / 21 / 25 / 29), pennies vs prices, deaths per boss, oil spend share in Act 4 (target
  20–30%). Writes `research/sim-report.md`.
- **Boss sims:** each boss script runs headless against a scripted dodger bot; reports fight length and damage
  taken per attack.

### 9.4 Performance

- `tools/bench.mjs` (built) runs `bench_flood` (06 §21) in headless Chromium and prints the report
  (`window.lanternfall.perf.bench`, filled by `js/debug/bench.js`); `--save-baseline` writes
  `tests/fixtures/bench-baseline.json`.
- `tests/e2e/perf.spec.js` (planned) runs the same room and fails if **sim p95 grows more than 25%** or **cells
  scanned per tick grow more than 25%** over the baseline (ratios, because headless GPUs are software). The
  absolute budget (00 §13: sim p95 ≤ 4 ms) is checked headless at each world/render milestone and on a real
  laptop at M39, with numbers in `research/perf-log.md`.

### 9.5 `tools/reach-check.mjs` — no module without a door (B17; planned M8)

Runs in `npm run test:unit` and fails when:

1. any file under `js/` is not reachable by static `import` from `js/main.js` (dev tools under `dev/`, `tools/`
   and `tests/` are exempt; `js/debug/*` counts as reachable when `main.js` imports it behind `?debug`);
2. any file in `data/` is missing from `data/manifest.json`, or a manifest entry is read by no module
   (`data.<name>` never referenced);
3. any id defined in a data file (a flame, a charm, a monster, an item, a shop, a room in `rooms/index.json`) is
   never referenced by another data file, a room, an act map or the code.

It prints the unreachable list and exits 1. It is the house failure mode — a finished module nothing calls —
made a test.

---

## 10. Playground integration (Lingo, voices, meter, sound, score)

All five are optional at runtime: if one fails to load, the game still runs (a stub is used and the debug
overlay shows a yellow warning). Node tests use stubs. All are planned for M10 unless noted.

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
    lingo, speaker: (id) => speakers.get(id),
    say(speakerId, intent, ctx = {}) {
      const speaker = speakers.get(speakerId); if (!speaker || !lingo.grammar.has(intent)) return null;
      return lingo.speak(intent, { speaker, ...ctx });
    },
    foe: (enemyId, count = 1) => new Entity(lingo.lexicon.get(enemyId), { lexicon: lingo.lexicon, count }),
  };
}
```

- Game code never calls Lingo directly: it emits `talk.request { speakerId, intent, ctx, x, y }` → the bridge
  speaks → emits `talk.line` → the voice bridge and the bubbles react.
- **Barks pre-render (R77):** at room load the bridge renders each enemy kind's bark pool present in the room
  (text + voice buffer), cached **per act**, so a bark in a fight is a lookup. Rendering a line live is the
  fallback, skipped if it would take more than 30 ms. The throttle numbers (6 s per enemy, 1.5 s global, 6 s per
  room, 2 enemy bubbles, 3 voices) are **01's one bark table**; `talk/barks.js` reads them.
- Memories and relations (Lingo `memory.js` / `relations.js`) drive NPC dispositions and Crane's `sold_item` memory
  with the `pawn_recall` intent (01, 08); hubs are the Lingo showcase (idle chatter, `converse` pairs, memories of
  your deeds, R82).

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
  bus.on('talk.line', ({ speakerId, speech, x, babble }) => {
    if (!settings.audio.voices) return;
    const v = voiceOf(speakerId);
    const pan = x == null ? 0 : Math.max(-1, Math.min(1, (x - camera.cx) / 240));
    say(babble ? '' : speech, babble ? { ...v, engine: 'babble' } : v, { volume: settings.audio.voice, pan });
  });
  return { stopAll };
}
```

- The bridge assumes **seven roles added** to `shared/voices.js`: `elder`, `merchant`, `priest`, `child`,
  `cultist`, `brute`, `stormcaller` (R23). The change is **add-only**: no existing role changes, and Emberveil's
  and Farhold's voice tests must stay green (M10 acceptance). Which NPC uses which role is 01's table.
- The Narrator uses `voiceFor({ role: 'narrator' })` (Emberveil already added it; check before adding).
- Rats and moths use the `babble` engine. Max 2 voices at once; a new line from the same speaker cuts its old one.

### 10.3 The Ledger (meter; `js/rpg/damage.js` built + `js/ui/ledger.js` planned)

```js
import { Meter } from '../../../../meters/js/meter.js';
// one Meter per run; a "fight" = one room visit (startFight on room.enter, endFight on room.exit)
game.meter = new Meter({ maxFights: 50 });
game.meter.record({                               // inside dealDamage(): exactly one record per hit (built)
  t: game.tick / 60, source: src.id, sourceName: src.name, target: tgt.id, targetName: tgt.name,
  kind: 'damage', amount, overkill, crit, dtype: meterType(flame),     // fire|frost|… so the bars colour
  via: wick ? wick.id : 'melee', viaName: wick ? wick.name : 'Pole', killingBlow, tags: [shape, ...charms],
});
```

- **Each wick is a source** (00 §15): `via` is the wick id, so the Ledger drills down player → wick → hits. Combos,
  knots and guttering are their own `via` (`combo:steam_burst`, `knot:on_hit`, `gutter`).
- **"The Hollow"** is the source for traps and the world (fragments, fire, drowning, falls): its kills pay +50% XP
  (B6) and the Narrator remarks on the first one (01).
- History: the last **50 rooms** (R64), trimmed first when a save is over budget. Healing writes `kind: 'heal'`
  with `overheal`; statuses `kind: 'status'`; deaths `kind: 'death'`. The Ledger tab mounts
  `meters/js/meter-ui.js` `renderMeter(meter, root, state)` inside our themed panel (02).

### 10.4 Sound (`js/audio/sfx-bridge.js`)

```js
import { Sfx } from '../../../../sfx/js/sfx.js';

export async function createSfxBridge({ bus, settings, map }) {       // map = data/sfx-map.json
  const sfx = await Sfx.create({ method: settings.audio.sfxMethod, volume: settings.audio.master });
  const play = (key, payload = {}) => {
    const id = map.events[key] ?? null; if (!id) return;
    const real = sfx.entry(id) ? id : map.fallbacks[id];              // missing ids fall back
    if (real) sfx.cue(real, { pan: payload.pan ?? 0 });
  };
  bus.on('cast.release', (e) => play(`cast.${e.plan.flame}`, e));
  bus.on('hit', (e) => play(e.crit ? 'hit.crit' : `hit.${e.flame || 'physical'}`, e));
  bus.on('explode', (e) => play('explode', e));
  bus.on('pickup', (e) => play(e.item ? `loot.${e.item.rarity}` : 'coin', e));
  return sfx;
}
```

`data/sfx-map.json`:

```json
{ "_doc": "…", "version": 1,
  "events": { "cast.ember": "spell.fire.launch", "hit.ember": "spell.fire.impact", "cast.rime": "spell.ice.launch",
              "cast.spark": "spell.lightning.launch", "cast.bile": "spell.poison.launch", "cast.gleam": "spell.holy.launch",
              "cast.tide": "spell.water.launch", "cast.shade": "spell.shadow.launch", "hit.crit": "melee.crit",
              "levelup": "levelup", "coin": "coin" },
  "missing": ["spell.water.launch", "spell.water.travel", "spell.water.impact", "ambience.rain.light", "ambience.rain.heavy", "…"],
  "fallbacks": { "spell.water.launch": "spell.nature.launch", "spell.water.impact": "spell.nature.impact" } }
```

- **Tide** uses `spell.water.*`, added through the Lanternfall sfx bridge (its own recipes, registered at load
  without touching the shared catalog files); where one is missing it falls back to `spell.nature.*`.
- **Sounds the shared catalog does not have yet** are listed under `missing` with a fallback each:
  `ambience.rain.light`, `ambience.rain.heavy`, `rain.tick.metal`, `water.splash.small`, `water.splash.big`,
  `water.pour`, `water.drain`, `steam.hiss`, `fire.whoosh`, `fire.crackle` (loop), `ice.form`, `ice.crack`,
  `stone.crumble`, `fragment.crash` (3 sizes), `lever.pull`, `door.grind`, `sluice.open`, `rope.creak`,
  `grapple.fire`, `lamp.relight`, `lamp.post`, `lantern.out`, `bell.toll`, `gutter.burst`, `oil.pickup`,
  `pearl.pickup`, `rekindle`. Adding ids to the shared `sfx/` catalog is its own reviewed step and must not
  change any existing id (Emberveil and Farhold use it).
- **Buses:** Lanternfall's wrapper adds a `music` bus (the score) and a `voice` bus beside the sfx engine's
  `sfx` / `ui` / `ambience` buses, all under its master limiter, each with its own settings volume.

### 10.5 The score (R14, B11): `js/audio/score.js` + `data/score.json`

**The rain is the score.** No vendored music, no jukebox. `score.js` builds a procedural layer on the **sfx
engine's own audio context** and plays it through the `music` bus:

- the **rain bed** (the ambience loops, crossfaded by rain density and sky columns in view, 06 §11.6);
- a **per-act drone** (key, voices, filter);
- the **Guild bell motif** (6 notes) at lamp-posts and title cards;
- **one voice added per relit Great Lamp** to its district's drone (the relight sweep, 06 §14.6);
- a **boss pulse** that tightens per phase;
- **silence** when the Rain stops (`cs_rain_stops`).

```json
{ "_doc": "…", "version": 1,
  "motif": { "notes": ["D4", "F4", "A4", "G4", "F4", "D4"], "tempo": 60, "timbre": "bell" },
  "acts": { "act1": { "key": "D", "drone": ["D2", "A2"], "voicesPerLamp": ["F3"], "filter": 900 } },
  "boss": { "pulse": { "bpm": [72, 88, 104, 120], "timbre": "low_drum" } },
  "rainStops": { "fadeOut": 4.0, "silence": true } }
```

Budget: part of talk + audio ≤ 1 ms p95 (00 §13). Score v1 (rain bed + act drone) lands in M10; the rest in M37.

---

## 11. Debug tools

### 11.1 Turning it on

`?debug=1` in the URL, or the backquote key when Settings → Debug is enabled. Debug keys only work while the
overlay is open, so they never collide with 02's bindings. (Planned, M8; today the dev pages in `dev/` and the
`window.lanternfall` members of §11.6 are the debug surface.)

### 11.2 The overlay (`debug/overlay.js`, planned)

| Key (overlay open) | Toggles |
|---|---|
| `1` | chunk grid: awake (green), slow lane (yellow), dirty rects (magenta) |
| `2` | temperature heat map |
| `3` | the flat material view (06 §17) |
| `4` | light list (shadowed solid) and the CPU light grid's tiers as coloured tiles |
| `5` | liquid bodies, basin and floodline levels, current zones and gravity bands |
| `6` | support queue, last detached groups, live fragments |
| `7` | entity boxes, AI state labels, nav graph, sight rays |
| `8` | wiring: lines between things with the last signal value |
| `9` | perf graph: sim ms, frame ms, awake chunks, cells scanned, awake liquid cells, particles, uploads |
| `0` | all off |
| `P` / `.` / `,` / `[` `]` | pause / step one tick / step 10 / speed ÷2 ×2 |
| `G` | god mode |
| `N` | noclip |
| `R` | reload the current room from disk |
| `L` | lighting off (full bright) |
| `K` | kill every enemy in the room |

### 11.3 Cell inspector (`debug/inspector.js`, planned)

Hover shows, for the cell under the mouse: `x, y`, material key, class, shade, temp, life, flags (named), aux, bg
material, chunk (awake/dirty), liquid body id and size, the CPU light tier (`lightTier` / `ambientTier`), and the
nearest thing's id. Click pins it; Shift+click opens a small editor for that cell.

### 11.4 Spawn menu and brush (`debug/spawn.js`, planned)

A side panel: **brush** (any material, radius 1–24; temp, wet and ignite brushes; `explode` click), **spawn** (any
enemy with elite mods, boss, NPC, pickup, item, thing), **give** (unlock any flame/shape/charm/knot/mechanic; set
level; currency), **room** (jump to any room id + entry; reseed the decorator; toggle rain; time scale).

### 11.5 Room editor-lite (`editor.html`, `debug/editor.js`; planned, after M11)

A helper for tweaking agent-made rooms, not a level editor: loads a room by id, shows the coarse map grid and the
compiled preview (live re-compile), overlays for ops and things; drag things, edit props from `prefabs.json`,
draw wires; **Play from here**; **Export** by download or copy (it never writes to disk); runs `room-check` rules
in the browser.

### 11.6 `window.lanternfall` (the debug API)

Built members (set by `js/main.js`):

| Member | Use |
|---|---|
| `ready` | true once the first room has compiled and the loop started |
| `errors` | boot and room-load errors (data errors join it in M8) |
| `data`, `game`, `input`, `cam`, `renderer`, `loop` | the live objects (read-only by convention) |
| `room` | the current room id (after `goRoom`) |
| `goRoom(id, entry)` | change room |
| `player()` | `{ x, y, vx, vy, grounded, state, anim, hp }` |
| `step(n)` | run `n` ticks deterministically |
| `stepTimed()`, `renderOnce()` | one timed tick for the bench; one render |
| `perf.bench` | the benchmark report (06 §21.3) when `?bench=1` |
| `input.script(steps)` | feed intents: `[{ ticks: 120, right: true }, { ticks: 1, jump: true }]` (built in `input.js`) |

Planned (M8, `debug/api.js`; mutating calls need `?debug=1` or `?test=1`): `version`, `warnings`,
`cell(x, y)`, `count(mat, rect?)`, `entities(kind?)`, `act(action, arg)`, `pause(on)`, `speed(x)`,
`spawn / give / unlock`, `setCell / paint / explode / heat`, `meter()`, `save(slot) / load(slot) / clearSaves()`,
`screenshotRegion(rect)`, `lightTier(x, y)`, `hash()`, `runSolution(roomId)`.

---

## 12. Paths, serving and publishing

- **Every path is relative.** In HTML: `href="css/base.css"`, `src="js/main.js"`. In modules:
  `import { x } from '../world/grid.js'`; shared helpers from inside `js/<folder>/`:
  `'../../../../shared/store.js'`; from `js/main.js`: `'../../../shared/store.js'`. Data:
  `new URL('../../data/flames.json', import.meta.url)` (built: `dataUrl()`) — never `fetch('/prototypes/...')`.
  Rooms: `new URL('../../rooms/<file>', import.meta.url)` from `rooms/index.json`'s relative `file` field (built:
  `roomUrl()`). CSS `url()` values are relative to the CSS file. `paths.test.js` fails on any string starting
  with `/`.
- **Serving:** the playground's two servers (`tools/serve-both.sh`): give the user the **stable** URL,
  `http://<LAN-IP>:8400/prototypes/lanternfall/`; Playwright runs against dev `8401`. Promote with
  `tools/publish-stable.sh`, then `tools/publish-pages.sh` for GitHub Pages
  (`https://radgh.github.io/Game-Playground/prototypes/lanternfall/`).
- **Fonts:** Cinzel and Spectral from Google Fonts (a `<link>` in `index.html`, built), with serif fallbacks.
  The 5 × 7 pixel font is code.
- **No service worker, no CDN scripts.** Everything else is in the repo.

---

## 13. Build order

The milestone plan is **`REVIEW.md` §d** (39 milestones, each ending green, committed and reachable from the
title screen). This page's pieces land in: M1–M2 (tools, `room-check` with reachability and settle, `bench.mjs`),
M5 (`bindings.json` read by `input.js`), M8 (`data-check`, `reach-check`, purity/paths tests, the debug API,
registration in the playground), M9 (saves), M10 (Lingo, voices, sfx, score v1), M11 (kits, `room-new`, act files),
M16 (prefabs and wiring), M36 (sims). The v1 "Milestone 1 checklist" is in Parked.

---

## 14. Applied in v2 — v2 changes

The v1 "Proposed canon changes" are resolved:

1. **Shared sound catalog additions** — kept as their own reviewed step; Tide uses `spell.water.*` through the
   Lanternfall bridge, falling back to `spell.nature.*` (§10.4).
2. **Narrator voice role** — use Emberveil's existing `narrator` role; the seven new roles are add-only (§10.2, R23).
3. **Quit mid-room** — resume at the last lamp-post with that post's saved state (§7.5); prefab state persists, cells
   do not (00 §13, R3).
4. **Room id convention** — kept (§6.2); which node a room serves is the act file's (§5.10).

What changed on this page in v2:

| Finding | Change |
|---|---|
| R4 | §5.0 is the one manifest (owners, status, retired names); one canonical example per file (§5.1–5.12); resist is percent; rarity `fine`; no `charm_ring` |
| R5 | §6.5–6.6: `wires: [{from, to, do, when}]` with actions `open/close/toggle/drain/fill/stop/say/spawn/fire`; `logic` things of 7 kinds; 07's thing names (`sluice_gate`, `plate`, `grapple_point`, `trap_*`); `current`, `gravity_band`, `rekindle`, `sanctuary`, `nobuild` added |
| R8, R10, R49, R50, B10 | §6.9–6.11, §6.16: reachability is an error (bot with `movement.json` and the act's verbs); > 30 settle ticks fails; single-flame rule; `puzzle.solution` verb scripts; room kits in `js/world/kits.js` + `kits.json`; no 120-tick settle |
| R66 | §6.13–6.14 examples fixed (no spawn in the lesson; `gutter_rat`; `npc_voss`); the examples test runs `room-check` |
| R3, R47, R64 | §7: `localStorage` via `shared/store.js`, budgets (slot 64 / profile 16 / run 16 KB, 3 slots + 1 backup, ≤ 420 KB), max-save test, the room state record `{ prefabs, killed, built }`, no cell diffs, Ledger history 50 rooms, IndexedDB parked |
| R11 | §1: single thread and the 60k awake-liquid cap as principles; §9.4 uses 00 §13's budget |
| R14, B11 | §10.5: `js/audio/score.js` + `data/score.json` on the sfx engine's context; `music` and `voice` buses; no jukebox |
| R18 | §3.1: `input.js` reads `data/bindings.json` (built through `bindingsFrom`; gamepad and other contexts in M5) |
| R23 | §10.2: seven roles added to `shared/voices.js`, add-only, other games' tests stay green |
| R33 | §3.3, §8, §9.2: no Canvas2D renderer; a flat debug view; the "needs WebGL2" card |
| R61, R62 | §3.5 lists 03's compiled-program files under their built names (`wick.js`, `cast.js`, `instances.js`); §3.7 lists 05's AI files only |
| R77 | §10.1: bark pools pre-render per room, cached per act; throttles are 01's |
| B6 | §10.3: "The Hollow" source, +50% XP on its kills |
| B17 | §1 and §9.5: `tools/reach-check.mjs` in `npm run test:unit` |
| R15, R16, R19, R87 | §7.2 difficulty ids; §8 accessibility `overchargeNeedsKey`, `slowTimeBuilding`; `sanctuary` zones and hub rooms |
| (small) | Tide sounds `spell.water.*` via the bridge, else `spell.nature.*` (§10.4) |
| (§13) | the Milestone 1 checklist is replaced by a link to REVIEW §d |
| (built) | every module table marks built vs planned and lists real exports; the loop, bus, rng streams, game object, debug API, room format and compile pipeline are written as built; known gaps flagged (`Math.random` in rain/debris; the 120-tick settle; `data.js`'s v1 `OPTIONAL` list; the `movesets` manifest entry; v1 thing names in the checked-in examples and `room-check`) |

---
## Parked (v2)

Material cut or superseded in v2, kept as it was. Each block says which finding cut it and what replaced it. The
master parked list is `REVIEW.md` §(c).

### Tech ideas parked by the review

**Parked by R47 — an IndexedDB save wrapper.** Saves would move to IndexedDB (async, much larger quota) behind the
same `save.js` API. Replaced by `localStorage` with budgets and a max-save test (§7.1); revisit only if the
test's estimate passes 1 MB.

**Parked by R11 — Worker / `postMessage`.** Running the cell sim in a Web Worker and posting changed chunks back to
the main thread. Replaced by the single-thread rule (§1, 06 §20); GitHub Pages cannot send the headers
`SharedArrayBuffer` needs, and the measured sim already has a 2× margin.

**Parked by R33 — Canvas2D parity specs.** v1's `boot.spec.js` booted both `?renderer=webgl2` and `?renderer=2d`,
settings offered `renderer: auto | webgl2 | 2d`, and visual specs compared both renderers by region sums. Replaced
by the flat debug view (06 §17) and the "needs WebGL2" card.

**Parked by R50 — offline settle caches.** v1 §6.9 step 8: "**Settle:** run 120 ticks of cell sim with rain off,
entities off (so sand and water from ops find their rest before the player sees them). Cache the result in memory
for the session keyed by `id + seed + format`." with the budget "compile + settle ≤ 150 ms for a 960 × 540 room".
Replaced by a compiler that places liquids level and the ≤ 30-tick `room-check` rule.

**Parked by R34 — NG+ save fields.** NG+ (5 cycles) would add `ngPlus: { cycle, carried: {…} }` to the slot and
`ngPlusBest` to the profile. NG+ is parked, so neither field exists.

**Parked by R39 / R69 — `silent-bells.json` and the Bellringer's challenge counter** (`profile.challenges.
bellringer_silent_bells`), with the Silent Bells and the Bellringer class.

### v1 sections replaced in v2

**Replaced by §2 (built/planned layout) — the v1 folder tree.**

**(v1) 2. Folder layout**

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

**Replaced by §3 (built files and real exports; R61, R62) — the v1 module tables.**

**(v1) 3. Modules and their public functions**

Only the public surface is listed; helpers stay private to their file. "Pure" = no DOM, runs in Node.

**(v1) 3.1 `js/core/` (pure)**

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

**(v1) 3.2 `js/world/` (pure) — the rules are in `06-PHYSICS-RENDER.md`**

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

**(v1) 3.3 `js/render/` (browser)**

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

**(v1) 3.4 `js/entities/` (pure)**

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

**(v1) 3.5 `js/spells/` (pure) — rules in `03-SPELLS.md`**

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

**(v1) 3.6 `js/rpg/` (pure) — numbers in `04` and `08`**

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

**(v1) 3.7 `js/ai/` (pure) — behaviour in `05-BESTIARY-BOSSES.md`**

| File | Public |
|---|---|
| `brain.js` | `createBrain(enemyDef)`, `thinkAndAct(game, enemy)`; a small state machine: `idle → alert → chase → attack → recover`, with `flee`, `hide_in_dark`, `swim`, `swarm` hooks |
| `senses.js` | `canSee(game, e, target)` (raycast + `lightAt`), `canHear(game, e, event)` |
| `nav.js` | coarse walk graph per room (8 × 8 blocks), jump links, `path(from, to)` |
| `behaviours/*.js` | one file per behaviour id used in `enemies.json` (`melee_rush`, `ranged_kite`, `swim_ambush`, `ceiling_drop`, `swarm`, `burrow`, `lantern_snuff`, …) |
| `bosses/{tallow,gnaw,sluicemaw,widow,bellfather,ossery}.js` | phase scripts reading `bosses.json` |
| `director.js` | waves for `waves` and `endless` (reads `waves.json`) |

**(v1) 3.8 `js/modes/` (pure)**

| File | Public |
|---|---|
| `campaign.js` | `startCampaign(save)`, `enterRoom(game, roomId, entryId)`, `onGreatLampLit(game, act)` |
| `actmap.js` | `actGraph(act, data)`, `reveal(node)`, `canTravel(a, b)` (`09-MODES-MAP.md`) |
| `waves.js` | Floodgate: `startWaves(game, arenaId)`, water-rise schedule |
| `endless.js` | Long Descent: stitches `rooms/endless/*` pieces by seed, flood chase |
| `daily.js` | `dailySeed(dateISO)` = `hashSeed('daily', 'YYYY-MM-DD')`, fixed class + wick from `trials.json` `daily` table |
| `bossrush.js`, `trials.js` | the other modes |

**(v1) 3.9 `js/ui/`, `js/audio/`, `js/talk/`, `js/save/`, `js/debug/`**

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

**Replaced by §4 (the built loop, game object, bus and streams) — the v1 §4.**

**(v1) 4. Main loop, game state, event bus, random numbers**

**(v1) 4.1 The loop**

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

**(v1) 4.2 The `Game` object (one per run; pure data + systems)**

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

**(v1) 4.3 Event bus**

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

**(v1) 4.4 Random numbers**

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

**Replaced by §5.0 (the one manifest, R4) and §5.1–5.12 — the v1 data table and schemas** (they used v1 names and counts: 12 charms, 4 knots, 8 classes, 8 shops, `skills.json`, `acts.json`, `waves.json`, a `charm_ring` slot, resist as multipliers, rarity `magic`).

**(v1) 5. Data files and schemas**

**(v1) 5.0 Loading and validation**

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

**(v1) 5.1 `materials.json`**

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

**(v1) 5.2 `flames.json`**

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

**(v1) 5.3 `shapes.json`**

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

**(v1) 5.4 `charms.json`**

```json
{ "id": "split", "name": "Split", "unlock": { "act": "act2" }, "oilMult": 1.35,
  "mods": { "projectiles": 3, "spreadDeg": 18, "powerMult": 0.55 },
  "excludes": ["beam_only_example"], "shapes": ["bolt", "lob", "wave"], "tier": 1,
  "desc": "Casts three weaker copies in a fan." }
```

`mods` keys are read by `spells/charms.js` hooks; a key a hook does not know fails validation (no dead
data). `shapes` lists which shapes it can go on (or `"all"`).

**(v1) 5.5 `knots.json`**

```json
{ "id": "on_hit", "name": "Knot: On Hit", "unlock": { "act": "act4" }, "oilMult": 1.2,
  "child": { "powerMult": 0.5, "oilMult": 0.4, "maxDepth": 1, "cooldown": 0.5 },
  "trigger": { "event": "hit", "chance": 1.0 }, "desc": "When this wick hits, it fires the tied wick from the hit point." }
```

**(v1) 5.6 `statuses.json`**

```json
{ "id": "burn", "name": "Burning", "kind": "dot", "flame": "ember", "tickEvery": 0.5, "perTick": 0.08,
  "maxStacks": 5, "refresh": "add_duration", "cleansedBy": ["water", "tide", "rime"],
  "visual": { "tint": "#ff8a2a", "particles": "ember" }, "sfx": "status.burn.apply" }
```

`perTick` is a fraction of the source's spell power (formula in `03`). Kinds: `dot`, `slow`, `stun`, `mark`,
`shield`, `buff`, `debuff`, `special`.

**(v1) 5.7 `classes.json`**

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

**(v1) 5.8 `skills.json`**

```json
{ "boards": [ { "id": "board_lamplighter", "class": "lamplighter",
   "nodes": [ { "id": "ll_steady_hand", "name": "Steady Hand", "pos": [2, 0], "cost": 1, "max": 3,
                "requires": [], "effect": { "stat": "overchargeSafePct", "perRank": 0.05 },
                "desc": "Your wicks can take {value} more overcharge before they risk guttering." } ] } ] }
```

`pos` is the node's grid spot on the board UI (`02`); `requires` are node ids; `effect` is a stat
modifier or `{ "grant": "…" }`.

**(v1) 5.9 `progression.json`**

```json
{ "levelCap": 30, "xpTable": [0, 100, 240, 420, 650],
  "attrFormulas": { "maxHp": { "base": 60, "perNerve": 8, "perLevel": 4 } },
  "respecCost": { "pennies": 200, "maxHp": 5 }, "burnIn": { "levels": [0, 200, 600, 1400, 3000], "powerPerLevel": 0.06 } }
```

`xpTable` must have `levelCap` entries; `burnIn.powerPerLevel` is canon (+6%, `00` §8).

**(v1) 5.10 `enemies.json`**

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

**(v1) 5.11 `bosses.json`**

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

**(v1) 5.12 `items.json`**

```json
{ "slots": ["weapon", "lantern", "hood", "coat", "boots", "charm_ring", "trinket"],
  "bases": [ { "id": "pole_lantern", "name": "Pole Lantern", "slot": "weapon", "class": ["lamplighter"],
               "level": 1, "stats": { "meleeDamage": [6, 9], "attackSpeed": 1.1 }, "price": 40, "sprite": "it_pole_lantern" } ],
  "uniques": [ { "id": "u_vigil_of_the_first_lamp", "base": "pole_lantern", "name": "Vigil of the First Lamp",
                 "fixed": [ { "affix": "light_radius", "value": 0.3 } ], "power": "first_lamp", "lore": "…" } ],
  "consumables": [ { "id": "oil_flask_small", "name": "Small Oil Flask", "stack": 5, "use": { "oil": 30 }, "price": 12 } ],
  "rarities": [ { "id": "common", "color": "#b8b8b8", "affixes": [0, 0] }, { "id": "rare", "color": "#ffd54a", "affixes": [3, 4] } ] }
```

**(v1) 5.13 `affixes.json`**

```json
{ "affixes": [ { "id": "light_radius", "name": "of the Long Wick", "kind": "suffix", "slots": ["lantern", "weapon"],
                 "stat": "lightRadiusPct", "tiers": [ { "min": 1, "range": [0.05, 0.1] }, { "min": 10, "range": [0.1, 0.2] } ],
                 "weight": 10, "text": "+{value%} lantern light radius" } ] }
```

Every `stat` must be a key `rpg/stats.js` reads (validator checks against an exported `KNOWN_STATS` list —
the "no dead data" rule from Farhold's round 6).

**(v1) 5.14 `loot.json`**

```json
{ "tables": [ { "id": "loot_small_a1", "rolls": 1, "entries": [
    { "w": 60, "kind": "pennies", "amount": [1, 4] }, { "w": 25, "kind": "oil", "amount": [5, 10] },
    { "w": 12, "kind": "item", "rarity": { "common": 80, "magic": 18, "rare": 2 } }, { "w": 3, "kind": "scrap", "amount": [1, 2] } ] } ] }
```

**(v1) 5.15 `shops.json`**

```json
{ "id": "shop_wick", "name": "Wick & Tallow", "keeper": "odile_pennywax", "currency": "pennies",
  "stock": { "slots": 8, "tables": ["stock_wick_basic"], "always": ["oil_flask_small"], "refresh": "on_room_enter" },
  "pricing": { "base": 1.0, "lampDiscount": 0.08 }, "quirk": "names_spells",
  "lines": { "greet": "shop_greet", "buy": "shop_buy", "sell": "shop_sell", "haggle": "shop_haggle" } }
```

One `quirk` per shop id from `00` §11: `names_spells`, `remembers_sales`, `flooded_only`, `menu_rotates`,
`sealed_lanterns`, `custom_gadget`, `tithe_by_kills`, `pays_in_health`. `rpg/shops.js` has one hook per quirk.

**(v1) 5.16 `acts.json`**

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

**(v1) 5.17 `npcs.json`**

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

**(v1) 5.18 `trials.json`**

```json
{ "trials": [ { "id": "trial_rope_gauntlet", "name": "Rope Gauntlet", "room": "tr_rope_gauntlet",
     "rules": { "noSpells": true, "timeLimit": 150 }, "goal": "reach_exit", "rewards": { "marks": 2, "unlock": [ { "kind": "class", "id": "chimneysweep" } ] } } ],
  "challenges": [ { "id": "sweep_rope_2000", "name": "Two Thousand Metres of Rope", "stat": "ropeMetresRun", "target": 2000, "unlock": { "kind": "class", "id": "chimneysweep" } } ],
  "daily": { "classes": ["lamplighter", "sluicewarden", "tinker"], "wickPool": [ { "flame": "ember", "shape": "lob" } ] } }
```

Challenge `stat` names are counters kept in `profile.stats` (§7.3). 1 m of rope = 8 cells (so 2,000 m = 16,000
cells swung) — the conversion lives in `progression.json` `cellsPerMetre: 8`.

**(v1) 5.19 `waves.json`**

```json
{ "floodgate": { "arenas": ["wv_old_lamp"], "waves": [ { "n": 1, "groups": [ { "enemy": "wax_mite", "count": 6, "from": "left", "delay": 0 } ],
                 "waterRise": 4, "buildTime": 20 } ] },
  "endless": { "floorEvery": 1, "hpScale": 0.09, "damageScale": 0.06, "floodSpeed": [18, 60], "pieces": ["ed_shaft_a", "ed_ledges_b"] } }
```

**(v1) 5.20 `prefabs.json`**

Defaults for each thing type in §6.5: size, sprite, whether it is solid, save policy, default props.

```json
{ "lever": { "size": [6, 10], "sprite": "pf_lever", "solid": false, "interact": true, "save": "state",
             "props": { "state": false, "oneShot": false, "cooldown": 0.4 } } }
```

`save` is `none` (resets on re-entry), `state` (remembered per save slot), or `once` (remembered, and
cannot be undone: a secret wall broken, a chest opened).

**(v1) 5.21 `themes.json`**

```json
{ "wax_chapel": { "act": "act1", "backWall": "brick", "backWallShade": 0.55, "parallax": "act1_city",
    "decor": { "erode": 0.35, "round": 2, "moss": 0.1, "cracks": 0.15, "grime": 0.3, "strata": "none", "drips": 6, "waxDrips": 0.4 },
    "props": ["candle_cluster", "chain", "hymn_board"], "ambience": "ambience.rain.light" } }
```

**(v1) 5.22 `sprites.json`**

ASCII pixel art, one character per pixel, with a per-sprite palette. Built into one atlas at load by
`render/sprites.js`. (Same idea as Tiny RTS's sprites file; it keeps art diffable and editable by an agent.)

```json
{ "palettes": { "hero": { ".": null, "k": "#10131a", "h": "#2d3342", "f": "#c9b39a", "l": "@flame" } },
  "sprites": { "hero_lamplighter": { "palette": "hero", "anchor": [3, 12], "anims": {
      "idle": { "fps": 4, "frames": [ [ "..hh..", ".hhhh.", ".hffh.", "..kk..", ".kkkk.", "kkkkkk", ".kkkk.", ".kkkk.", ".k..k.", ".k..k.", ".k..k.", "kk..kk" ] ] } } } } }
```

`@flame` means "the current flame colour" (the lantern pixel). Sprites never exceed 64 × 64.

**(v1) 5.23 `strings.json`**

Every fixed UI string (menu labels, tutorial prompts, lesson-room hints) keyed by id, so wording has one
home and a wording test can scan it (like Farhold's `WORDING.md` idea): `{ "menu.continue": "Continue", …}`.

**(v1) 5.24 Lingo pack and grammar**

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

**Replaced by §6.6 (R5) — the v1 wiring action list:** "`open`, `close`, `toggle`, `enable`, `disable`, `pulse`, `spawn`, `fill`, `drain`, `stop`, `light`, `snuff`, `say` (with `"line": "intent"`), `shake`, `set` (with `"value"`)" and the v1 `logic` kinds `and`, `or`, `not`, `xor`, `latch`, `delay`, with separate `timer` and `counter` things. `enable`/`disable`/`light`/`snuff` became `open`/`close`/`toggle`; `shake` is a bell's own behaviour; `set` and the boolean gates are covered by `compare` and `any_of`.

**Replaced by §6.5 — v1 thing types not in 07's ship list:** `sluice` (→ `sluice_gate`), `spike` (→ `trap_spikes`), `timer` / `counter` (→ `logic` kinds), and the v1 `spawn` note "`wave` groups for arenas" (waves live in `modes.json`).

**Replaced by §6.11 — the v1 checker list** (reachability was a warning):

**(v1) 6.11 The checker and thumbnails**

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

**Replaced by §6.16 room kits and `endless`-tagged rooms (B10) — v1 room pieces for Endless.**

**(v1) 6.15 Room pieces for Endless**

`rooms/endless/ed_*.json` use the same format with `kind: "piece"`, a fixed width of 480, heights of 272 or
544, and `things` of type `entry` `n` (top) and `exit` `s` (bottom) at matching x ranges so any piece can
stack under any other. `modes/endless.js` stitches 3–6 pieces into one room at run time (it is still
≤ 2048 tall) and re-seeds each piece's decorator.

**Replaced by §7 (R3, R47, R64) — the v1 save storage, slot and profile schemas** (budgets of 400 KB per slot, 30-room meter history, `roomState` by thing id only, the Silent Bells challenge).

**(v1) 7. Save format**

**(v1) 7.1 Storage**

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

**(v1) 7.2 Slot schema (campaign)**

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

**(v1) 7.3 Profile schema**

```json
{ "schema": 1, "marks": 14, "classes": ["lamplighter", "sluicewarden", "tinker"],
  "trials": { "trial_rope_gauntlet": { "best": 131.2, "done": true } },
  "challenges": { "bellringer_silent_bells": { "value": 5, "found": ["sb_a1_1", "sb_a2_3"] } },
  "modes": ["campaign", "waves", "trials"], "cosmetics": ["hood_moth"],
  "stats": { "ropeMetresRun": 412, "bossesBeaten": ["boss_tallow"] },
  "tutorialsSeen": ["move", "wick_builder"], "codex": { "enemies": ["wax_mite"] } }
```

**Replaced by §8 — the v1 settings object.**

**(v1) 8. Settings**

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

**Replaced by §9 — the v1 test tables.**

**(v1) 9.1 Node unit tests (`tests/unit/*.test.js`, `node --test`)**

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

**(v1) 9.2 Playwright specs (`tests/e2e/*.spec.js`, against the dev server on 8401)**

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

**Replaced by §13 (link to REVIEW §d) — the v1 Milestone 1 checklist.**

**(v1) 13. Milestone 1 checklist for this page**

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
