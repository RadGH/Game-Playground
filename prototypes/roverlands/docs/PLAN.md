# Roverlands — plan and contracts (2026-10-25)

## The owner's request (summary — full text in `~/claude/agent/roverlands-checklist.md`)

A vehicle prototype for a future travel-and-discovery game. Co-op, Farhold-like third person, Chibi 2.5 players (built
exactly like Thousandvale's, `createTvBody`) with every vehicle scaled to Chibi proportions. Goal mode: a one-way
**Flag Run** (pick a vehicle, cross the landscape, get out, grab the flag, get back in, bring it home). Plus a
**Sandbox** with every vehicle parked around a big area. Vehicles that feel like a certain famous sci-fi shooter's:
suspension, light drifting, ramps, tyres that grip uneven ground and dig ruts/leave tracks, destructible plants /
trees / fences (by mass x speed), open vehicles you can be thrown out of in a crash (enclosed ones safer), standing on
a moving platform, trailers, a forklift that can lift a vehicle, trunk storage with physics props that never pass
through walls. Everything works in multiplayer. Graphics like `highdef-3d/` but with more biomes, soft mud, fallen
trees, river crossings. Map + minimap + markers. Release on games.radgh.com for testing.

**Owner (mid-request): release a DEMO first with a couple of vehicles, then add the rest** (he may hit his session
limit). So: **M1 = demo** (world, multiplayer, both modes, map, Trail Jeep + Dirtbike) → publish → **M2..Mn = vehicle
batches**, each published when green.

(Other games may be named in Claude-facing docs only. Nothing a player sees names another game or vehicle brand.
Never use "ember", "veil", "muster". Original names for every vehicle.)

## The shape

* **Name** Roverlands. Folder `prototypes/roverlands/`. Sandbox; part of the playground repo.
* **Physics** Rapier 0.21 (`vendor/rapier/rapier.mjs`, `await RAPIER.init()`), runs in the browser. Fixed 1/60 step.
* **Authority** (deliberate exception to game-standards §7, because steering through a 100 ms round trip feels bad and
  the droplet has one CPU): **every moving body has an OWNER client that simulates it**; everyone else draws it
  interpolated and collides with it as a kinematic body. The SERVER is a relay + referee: who sits in which seat, who
  owns which body, the flag, what has been broken, the wheat that has been cut, scores. Owner of a vehicle = its
  driver, else the last driver, else the room host. A trailer / a prop in a trunk / a vehicle on forks is handed to
  the owner of the thing carrying it (so joints and stacked bodies are always simulated together on ONE machine).
  A local body hitting a remote one sends a `bump` (impulse at a point) to the remote one's owner.
* **Same code solo and online**: `js/net/room-core.js` (pure rules) runs on the server for online rooms and in the
  page through a loopback transport for solo play. The client never knows the difference.
* **Look** Chibi 2.5 people (`prototypes/thousandvale/js/client/chibi-version.js` `createTvBody`). A standing Chibi is
  **1.73 m tall, hips at 0.60 m, shoulders 0.99 m, arms 0.41 m, shoulder width 0.52 m, head ~0.6 m, 7.1k triangles**.
  Seated: head top = seat + 1.13 m. Vehicles are built to that: low seats, short reach to the bars / wheel, tall roofs
  and cages. Budget **3-10k triangles per vehicle** (big trucks up to 14k).
* **No build step**, ES modules, standalone CSS, three.js r186 from `vendor/three/` through an importmap. Never a path
  starting with `/` (the public site lives under a sub-folder).

## Ports
| | http | https (gamepads need a secure page) |
|---|---|---|
| stable (published copy, user unit `roverlands`) | 8550 | 8552 |
| dev (working tree, user unit `roverlands-dev`) | 8551 | 8553 |
| agents' own test servers | 8554, 8555, 8556 | localhost counts as secure |

## Files and who owns them (M1)
```
prototypes/roverlands/
  index.html, css/roverlands.css, README.md, docs/PLAN.md           lead
  data/vehicles.json          every vehicle's numbers (lead)
  data/world.json             biome table + scatter rules (world agent)
  data/changelog.json         What's new (lead)
  js/world/   PURE (no DOM/three/rapier). worldgen.js, scatter.js   OWNER: world agent
  js/client/world-view/       terrain, water, vegetation + destructible props drawing, sky, tracks, map image  OWNER: world agent
  js/phys/    physics.js (Rapier world from the world data), vehicle.js, walker.js, seats.js     OWNER: lead
  js/game/    the in-page game: entities, ownership, sync, flag rules client side, camera       OWNER: lead
  js/client/  main.js (boot + frame loop: lead), models/*.js (vehicle models: lead),
              ui/* (title, lobby, look builder, menus, HUD shell, minimap/map panel, touch, report): net/UI agent
  js/net/     protocol.js, room-core.js, loopback.js, client.js     OWNER: net/UI agent
  server/     main.mjs, hub.js, static.js, accounts (copy Knockabout's pattern)  OWNER: net/UI agent
  ops/, tools/publish-roverlands.sh, tools/feedback-report.mjs      OWNER: net/UI agent
  tests/      node tests per module + Playwright specs (each owner writes its own)
```

## World contract (`js/world/worldgen.js`) — pure, deterministic from the seed, same on every machine
```js
import { generateWorld } from './js/world/worldgen.js';
const world = generateWorld({ seed: 7 });   // < 1.5 s in a browser; may also expose a generator for a progress bar
world.size        // 1536 (metres on a side, centred on the origin: x,z in [-768, 768])
world.cell        // 2 (metres between height samples)
world.dim         // 769 samples across (size/cell + 1)
world.heights     // Float32Array dim*dim, row-major: index = j*dim + i, x = -size/2 + i*cell, z = -size/2 + j*cell
world.surface     // Uint8Array dim*dim — a SURFACE id per sample (see SURFACES)
world.waterLevel  // sea / lake level (m). Rivers carry their own water height: world.waterAt(x,z) -> height | null
world.heightAt(x, z)    // bilinear over `heights` (THE ground height; the physics heightfield is built from the same array)
world.normalAt(x, z)    // [nx, ny, nz]
world.surfaceAt(x, z)   // a SURFACES entry (nearest sample)
world.waterAt(x, z)     // water surface height at this point, or null if dry
world.biomeAt(x, z)     // biome name, for the map / HUD ("Mudflats", "Pine ridge"...)
world.sites = {
  home:  { x, z, r },                 // the home base (flag goes here). Flat pad.
  flags: [{ id, x, z, name }],        // 3-5 flag sites far from home, each across a different kind of challenge
  pads:  [{ x, z, yaw, vehicle }],    // vehicle spawn pads (home base garage row + sandbox lots); `vehicle` = a vehicles.json id
  ramps: [{ x, z, yaw, len, h }],     // jump ramps (also in `objects` as kind 'ramp' with a collider)
  bridges: [{ x0,z0,x1,z1, w, y }],   // walkable/drivable decks
  labels: [{ x, z, text }],           // place names for the map
}
world.objects     // EVERY placed thing the physics + renderer share, one list, stable ids (index = id):
//  { id, kind, x, y, z, yaw, s (scale), shape: { t:'cyl', r, h } | { t:'box', hx, hy, hz } | { t:'ball', r },
//    breakAt: number|null  (impulse in N·s that breaks it; null = indestructible: big rocks, cliffs, buildings),
//    mass (kg, for the falling piece once broken), fall: 'topple'|'shatter'|'flatten' }
//  kinds (M1): tree_pine, tree_birch, tree_oak (big trunks: breakAt null or very high), sapling, bush, fern, reeds,
//  fence (a 2.4 m panel), fence_post, log (fallen tree: static, driveable over), rock_s/rock_m/rock_l, boulder,
//  ramp, crate, barrel, hay_bale, sign, wheat (NOT in objects — wheat is a field mask, M-later)
export const SURFACES = [   // index = surface id. grip = tyre friction multiplier, sink = how far a wheel sinks (m),
                            // drag = rolling resistance multiplier, rut = how deep a track it leaves (0..1), dust = particle colour
  { id: 0, name: 'grass',  grip: 1.0,  sink: 0.00, drag: 1.0, rut: 0.15, dust: '#7a8a4a' },
  { id: 1, name: 'dirt',   grip: 0.95, sink: 0.01, drag: 1.1, rut: 0.45, dust: '#8a6a44' },
  { id: 2, name: 'mud',    grip: 0.55, sink: 0.12, drag: 2.6, rut: 1.00, dust: '#4a3a28' },
  { id: 3, name: 'sand',   grip: 0.70, sink: 0.06, drag: 1.8, rut: 0.70, dust: '#d8c08a' },
  { id: 4, name: 'gravel', grip: 0.85, sink: 0.01, drag: 1.2, rut: 0.30, dust: '#9a948a' },
  { id: 5, name: 'rock',   grip: 1.05, sink: 0.00, drag: 1.0, rut: 0.00, dust: '#8a8a8a' },
  { id: 6, name: 'snow',   grip: 0.50, sink: 0.08, drag: 1.6, rut: 0.80, dust: '#f0f4f8' },
  { id: 7, name: 'road',   grip: 1.15, sink: 0.00, drag: 0.9, rut: 0.05, dust: '#6a6660' },
  { id: 8, name: 'ice',    grip: 0.25, sink: 0.00, drag: 0.9, rut: 0.05, dust: '#dfeefa' },
  { id: 9, name: 'farm',   grip: 0.90, sink: 0.03, drag: 1.3, rut: 0.55, dust: '#9a7a4a' },
  { id:10, name: 'shallows', grip: 0.7, sink: 0.05, drag: 2.0, rut: 0.3, dust: '#9ab8c8' },   // fords: drivable water
];
```
Biomes (M1, at least): meadow, pine ridge, birch wood, mudflats / bog (soft mud, fallen trees), river valley (a river
with 2+ fords, 1 bridge, a deep part you must go round or float over), red-rock canyon (dirt + rock, ramps, narrow
switchbacks), dunes (sand), snowy uplands (snow + ice pond), farmland (fields, fences, hay bales, a farm track).
Plus a gravel road network linking home, the pads and the flag sites (so there is always a way, and a faster rough way).

## Client world view contract (`js/client/world-view/index.js`, world agent)
```js
const view = await createWorldView({ THREE, renderer, scene, camera, world, quality });  // sky, sun, shadows, fog, terrain,
                                                                                       // water, vegetation, props, grass
view.update(dt, camera)                // per frame (LODs, grass follow, water time)
view.breakObject(id, { dir: [x,y,z], speed })   // the object's static draw disappears; it becomes a falling piece the
                                               // CALLER simulates (view.objectPiece(id) -> a THREE.Object3D to move), or
                                               // a flatten (bushes/ferns/reeds just squash flat, no piece)
view.objectPiece(id)                   // THREE.Object3D (added to the scene) for a broken object; caller sets its transform
view.tracks.add(key, x, y, z, nx, ny, nz, width, surfaceId, dirX, dirZ)   // call ~every 0.3 m per wheel in contact.
                                       // `key` = one ribbon per wheel (string). A gap > 1.5 m starts a new ribbon. Ruts
                                       // are darker + drawn deeper on soft surfaces (SURFACES[].rut). Ring-buffered.
view.tracks.lift(key)                  // the wheel left the ground (ends this ribbon)
view.dust(x, y, z, surfaceId, amount)  // a puff of particles in that surface's dust colour (and splash on water)
view.splash(x, y, z, amount)           // water spray
view.mapImage(size)                    // HTMLCanvasElement: a top-down map of the whole world (biome colours, hill shading,
                                       // rivers, roads), drawn once and cached; the HUD draws markers over it
view.setQuality(name)                  // 'low' | 'medium' | 'high'
view.sunDir                            // THREE.Vector3
```
Reuse `highdef-3d/js/*` wherever it fits (sky.js, materials.js enhance(), postfx.js, kit/trees.js, kit/rocks.js,
kit/textures.js, grass.js idea) by importing, not copying, unless a copy is needed to change behaviour (then say so in
the README).

## Net contract (`js/net/*`, net/UI agent; the lead's game code calls exactly this)
```js
import { connect } from './js/net/client.js';
const net = await connect({ online: true|false, url, code?, create?: { mode: 'flag'|'sandbox', public, seed, flagId? },
                            name, look, ticket? });
net.you            // my pid
net.room           // { code, mode, seed, host, public, flagId, players: [{ pid, name, look }] }
net.on('room', fn) / net.on('msg', fn)   // roster changes; every relayed / referee message below
net.send(msg)      // client -> server messages below
net.close()
```
Messages **client → server** (the server checks every one: shape, sizes, rate):
* `{ t: 'pos', me: Me, ents: [Ent...] }` up to 20/s. `Me = { p:[x,y,z], yaw, a: animId, on?: entId, rel?:[x,y,z], ryaw?, seat?: [entId, seatIdx], rag?: 1 }`.
  `Ent = { id, p:[x,y,z], q:[x,y,z,w], v:[x,y,z], w:[x,y,z], x?: [numbers] }` — ONLY bodies I own (the server drops the
  rest). `x` = per-kind extras (wheel spin/steer/suspension, turret yaw/pitch, fork height, lights/siren...).
* `{ t: 'seat', id, seat }` ask for a seat; `{ t: 'unseat' }` get out (or thrown out: `{ t:'unseat', thrown: 1 }`).
* `{ t: 'spawn', kind, p:[x,y,z], yaw }` (sandbox only: put a vehicle down; server gives it an id and makes me owner).
* `{ t: 'own', id }` ask to own an unowned/idle body (I touched it, I am towing it, it is in my trunk).
* `{ t: 'give', id, to }` hand a body to another owner (trailer hitched to someone else's truck).
* `{ t: 'bump', id, j:[x,y,z], at:[x,y,z] }` I hit a body someone else owns; relayed to its owner only.
* `{ t: 'break', obj, dir:[x,y,z], speed }` I broke world object `obj`; the server keeps the set and tells everyone once.
* `{ t: 'flag', act: 'take'|'drop', p:[x,y,z] }`; `{ t: 'fire', id, p:[...], d:[...], kind }` (turret shot, cosmetic +
  bumps done by the shooter); `{ t: 'horn', id }`; `{ t: 'rate', what, up, reasons, note }`; `{ t: 'reset' }` (host:
  new run). `{ t: 'ping', c }`.
Messages **server → client**:
* `{ t: 'state', s: serverTime, players: { pid: Me }, ents: { id: Ent } }` 20/s (everyone else's, newest).
* `{ t: 'ents', list: [{ id, kind, owner, seats: [pid|null...], idle }] }` whenever a seat / owner / spawn / despawn changes.
* `{ t: 'bump', id, j, at }` (only to the owner); `{ t: 'broken', objs: [ids...] }` (on join: all so far; later: new ones);
  `{ t: 'fire', ... }` (relayed); `{ t: 'horn', id }`.
* `{ t: 'flag', state: 'home'|'site'|'carried'|'dropped'|'captured', site, by?, p?, time? }`;
  `{ t: 'run', phase: 'pick'|'go'|'done', startedAt, best, times: [...] }` (Flag Run clock: starts when the first
  vehicle leaves the home pad; done at capture; best times kept per seed/site).
* `{ t: 'toast', text }`, `{ t: 'pong', c, s }`, `{ t: 'kicked' }`.
Referee rules in `room-core.js` (pure, tested): a seat is granted only if empty and the asker is within 6 m of the body
(the asker's last `pos`); the driver seat (index 0) makes you owner; the flag can be taken only by a player on foot
within 3 m of it; a carried flag rides with its carrier (in a vehicle too); a player within the home ring with the
flag captures it; a carrier who is thrown out or leaves drops it where they are; an owner who leaves hands every body
to the host (or the next player); idle unowned vehicles stay where they were left.

## Vehicle data (`data/vehicles.json`, lead) — one entry per vehicle (M1: `trail_jeep`, `dirtbike`)
```json
{ "id": "trail_jeep", "name": "Trail Jeep", "type": "car", "enclosed": false, "mass": 1400,
  "chassis": { "hx": 1.0, "hy": 0.35, "hz": 1.9, "com": [0, -0.25, 0] },
  "wheels": [{ "p": [-0.9, -0.2, 1.3], "r": 0.42, "w": 0.32, "steer": 1, "drive": 1, "brake": 1 }, ...],
  "susp": { "rest": 0.45, "travel": 0.35, "k": 42000, "damp": 4200 },
  "engine": { "force": 9000, "top": 26, "reverse": 9, "boost": 0 }, "steer": { "max": 0.55, "speedFalloff": 0.6 },
  "tyre": { "grip": 1.6, "slide": 0.75, "handbrakeRear": 0.35 },
  "seats": [{ "role": "driver", "p": [-0.45, 0.35, 0.1], "pose": "sit", "exit": [-1.8, 0, 0] },
            { "role": "gunner", "p": [0, 0.75, -1.2], "pose": "stand", "gun": "turret_light" },
            { "role": "passenger", "p": [0.45, 0.35, 0.1], "pose": "sit", "look": true }],
  "eject": { "threshold": 11 } }
```

## Controls (M1)
| | keyboard + mouse | controller | phone |
|---|---|---|---|
| drive / walk | W A S D | left stick (steer) + RT gas / LT brake-reverse | left stick + GAS / BRAKE |
| look | mouse (click to capture) | right stick | drag on the right half |
| get in / out | E | X (Square) | ENTER |
| handbrake / jump | Space | A (Cross) | JUMP |
| boost / sprint / lean | Shift | B (Circle) / L3 | — |
| fire (gunner) / horn | left click / H | RT (gunner) / R3 | FIRE |
| swap seat | F | Y (Triangle) | SEAT |
| camera distance | wheel / V | d-pad up/down | pinch |
| map / menu | M / Esc | Back / Start | ☰ |

## Net contract additions (2026-10-25, net/UI agent) — nothing above changes meaning
Code: `js/net/protocol.js` (`CLIENT_MSGS` is the full list, with rates), `js/net/room-core.js`, tests in `tests/room-core.test.js`.

**connect()** also takes `spectate` (join with no seat), and for SOLO only `sites` (= `world.sites`) + `vehicles`
(= data/vehicles.json) — the server builds its own from the seed + the file. `create` also takes `start: true` (skip
the lobby: solo always does). Extras on `net`: `net.on('<type>', fn)` for one message type (`'msg'` still gets every
one except `room`), `net.off`, `net.on('status', s)` ('online' | 'reconnecting' | 'closed'), `net.status`, `net.online`,
`net.code`, `net.ping` (ms), `net.serverNow()` (the room's clock — `run.startedAt` is on it), `net.stats()`,
`net.drop()` (tests: drop the line without leaving), `net.last` (lead's addition: the newest `ents` / `flag` / `run` / `room`, the last FULL `state`, all `broken` ids and `pins` { pid: [x,z] } — so code that starts listening after connect() resolves can catch up). Also exported: `serverAvailable()`, `listRooms()`, `lastRoom()`.
Default world seed is **7** when `create.seed` is left out.

**Rooms have a phase**: `room.phase` = `'lobby'` (waiting; nothing may be driven) | `'play'`. `room` message =
`{ t:'room', code, mode, seed, host, public, flagId, flagPick ('random'|id), phase, you, players: [{ pid, name, look, spec?, on, kick? }], sites: { flags: [{ id, name }] } }`.

Client → server, added:
* front desk: `{ t:'hello', v, token?, ticket? }` → `{ t:'welcome', token, build }`; `{ t:'create', mode, public?, seed?, flagId?, start?, name?, look? }`;
  `{ t:'join', code, spectate?, name?, look? }`; `{ t:'leave' }` → `{ t:'left' }`. Errors: `{ t:'err', code: 'noroom'|'full'|'kicked'|'busy'|'version', msg }`.
* `{ t:'me', name?, look? }` my name / look changed. `{ t:'opt', key: 'mode'|'public'|'flagId', value }` host (mode only in the lobby;
  flagId during play = a reset to that site). `{ t:'start' }` host: lobby → play. `{ t:'reset', flagId? }` host (flagId optional).
* `{ t:'kick', pid }` host removes a player (banned from the room). `{ t:'votekick', pid, on? }` anyone: a majority of the others removes them.
* `{ t:'pin', p: [x, z] | null }` my map pin, shared with the room.
* `{ t:'crash', id, v:[x,y,z] }` (lead, 2026-10-25) sent only by the OWNER of body `id` when it crashes hard; the server checks
  ownership (2/s) and relays `{ t:'crash', id, v }` to EVERYONE (owner too). Each rider reacts on their own machine (throws
  themselves out, then sends `{ t:'unseat', thrown: 1 }`; a thrown flag carrier drops the flag where they are).

Server → client, added:
* `{ t:'deny', what: 'seat'|'own'|'give'|'spawn'|'flag'|'opt'|'start'|'reset'|'kick', why, id? }` — `why` is a player-facing sentence (show it as a toast).
* `{ t:'reset', flagId }` a new run: everybody is out of their seats, spawned vehicles are gone, parked ones are back on
  their pads (pose forgotten, owner = host): the client puts its bodies back on the pads and its player at home.
* `{ t:'pin', pid, p }`; `{ t:'crash', id, v }`; `{ t:'kicked', by: 'host'|'vote' }`; `{ t:'pong', c, s }` (s = server time).
* `broken` from a live break also carries `hits: [{ obj, dir, speed, by }]` (the fall direction for the piece); on join it is just `objs`.
* `bump`, `fire`, `horn` carry `by` (pid). `state` on join carries `full: 1` (every known pose); later `state`s carry only
  what changed since the last one. `ents` rows of parked vehicles carry `pad` (index into `world.sites.pads`, id = pad + 1).
* `run` also carries `time` when done (left out when the run does not count). **Run rules (lead, 2026-10-25)**: the clock
  starts when a DRIVEN vehicle that was ever inside the home ring (a home pad counts from the start) is outside it; if
  the clock still has not started when the flag is taken, it starts then; a capture less than 10 s after the start
  (`MIN_RUN_MS`) brings the flag home but records no time and no best. `flag` state `'home'` is not used (a new run starts at `'site'`).

Rules, added: a seat swap inside the same vehicle needs no distance check; a spectator never gets a seat / the flag / a pose;
`own` is granted for a body nobody drives that is idle or whose owner is offline; `give` only by the owner, and never
away from the body's driver; sandbox `spawn`: within 40 m of you, at most 4 each (the oldest empty one of yours goes),
64 bodies a room; Flag Run refuses `spawn`. A dropped line: bodies it owned that nobody drives go to the host at once,
the one it drives waits for it (90 s in play, 5 min in the lobby), then everything goes to the host. An empty room
closes after 5 minutes. A drive of 5 s or more is logged to insights as `played` (key `vehicle`) — the admin feed's ratings
key is `vehicle`. HTTP: `GET /rooms` (the public list), `/status`, `/healthz`.

## World contract additions (2026-10-25, world agent) — nothing above changes meaning
Full detail in `js/world/README-world.md`; the header of `js/world/worldgen.js` is the reference.
* **`y` is the BASE** of every object (where it meets the ground). The collider centre is `y + lift`, with
  `lift = shape.lift ?? (cyl: h/2, box: hy, ball: r, wedge: 0)`. **Shape sizes already include `s`** — never scale a
  shape by `s` again; `s` is only for the renderer's model.
* `yaw` is three.js `rotation.y`: local +z points at world (sin yaw, 0, cos yaw).
* `{ t:'wedge', hx, hy, hz }`: flat bottom 2hx × 2hz, top rising from 0 at local z = −hz to 2hy at z = +hz, vertical back
  face at +hz. Drive along local +z to go up it.
* Logs are `box` shapes with `round: 'z'` (really a cylinder of radius hy lying along local z) and their own `lift`
  (sunk 20 %). Everything works as a box.
* `objectHeight(o)` (exported from worldgen.js): how tall an object LOOKS from its base — size a falling piece with it
  (a tree's collider `shape.h` is only its trunk).
* Objects also carry `look` (the model the renderer draws) and maybe `tint` ([r,g,b], rocks). Kinds added:
  `bridge_deck`, `bridge_rail`, `bridge_pier`, `shed` (all indestructible).
* World fields added: `biome` (Uint8 per sample), `water` (Float32 per sample: water surface height, NaN = dry),
  `roadDist` (Float32: metres past the nearest road's driving edge, ≤ 0 = on it), `decor` (drawn, never simulated),
  `roads` (polylines `[[x,z,y]...]` every 2 m with `cls` road | gravel | track), `roadGraph` `{nodes, edges}`, `river`,
  `lakes`, `icePond`, `mudPit`, `loopTrack`, `labels` (= `sites.labels`), `stats`. Accessors added: `biomeIdAt`,
  `surfaceIdAt`, `slopeAt`, `roadDistAt`. `sites.flags[]` carry `y`, `r`, `note`; `sites.pads[]` carry `y`, `area`;
  `sites.ramps[]` / `sites.bridges[]` carry the object `id`; bridge `y` = deck top.
* `world.waterLevel` is −50: there is no sea. Use `world.waterAt(x, z)`.
* **Prop pads** (2026-10-25, for vehicles.json `type: 'prop'`): `sites.pads` lists the 24 vehicle pads FIRST, then the
  prop pads, same shape plus `prop: true`: home — 6 `crate`, 4 `bag`, 3 `barrel`, 2 `jetpack` (a row 18 m north of
  the pad centre, clear of the garage rows); sandbox — 2 `ball` (12 m apart, ≥ 3 m clear of anything), 4 `crate`;
  one `crate` at each flag (4.5 m east of it, `area: 'flag_<id>'`). 49 pads in all. A test checks no object or other
  pad overlaps any of them.
* **Runway**: `sites.runway = { x0, z0, x1, z1, w, y }` — 300 m x 20 m east-west strip in open meadow between Glassmere
  and home (x −230..70, z 525), flat to ±0.35 m, surface `road`, no objects within 5 m, easing back into the land over
  45 m at both ends. Roads may cross it (they follow its height).
* `generateWorldSteps(opts)` yields `{progress, label}` then `{progress: 1, world}`. `worldHash(world)` for "same map?" checks.
* Data lives in `js/world/world-data.js` (a plain module, so the generator stays synchronous in Node and the browser),
  not `data/world.json`.

## Client world view contract additions (2026-10-25, world agent)
* `createWorldView` also takes `hour`, `weather`, and `onProgress` / `progress` ((fraction, label)).
* `view.render(dt)` draws the frame through the post chain (bloom, light shafts, grade). Calling `renderer.render`
  yourself also works but skips the look. `view.resize(w, h)` after resizing the renderer. `view.setCamera(cam)`.
* `view.enhance(material)` → the material with the cascaded shadows + height fog chain. `view.csm` (or null).
* `view.breakObject(id, { dir, speed, instant })` → `'gone' | 'flat' | null`. `instant` (joining mid-game) hides with no
  piece; a `flatten` object is squashed in place either way.
* `view.objectPiece(id)`: origin = the object's base point (x, y, z), `rotation.y = yaw`; already in the scene. null for
  `flatten` kinds.
* `view.preload(pos)` builds ground + objects around a point now (after a teleport). `view.pushGrass([{x,y,z,r}])` up to
  4 things that bend grass. `view.worldToMap(x, z, size)`. `view.setTime(h)` / `view.setWeather(name)`. `view.debug()`.
* The view sets the renderer's tone mapping (ACES), sRGB output and shadow map type.
