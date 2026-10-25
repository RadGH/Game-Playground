# Roverlands

A co-op vehicle game prototype: a big, varied landscape, vehicles that feel good to drive, and a goal to drive for.
**Flag Run** — pick a vehicle at home base, cross the country, get out, grab the flag, get back in and bring it home
(fastest time wins; drive together: one at the wheel, one on the gun, one riding along). **Sandbox** — every vehicle
parked around a big area, no goal. Built to be the vehicle layer for a later travel-and-discovery game (or a mechanic
game, or transport for fishing and hunting).

Players are Chibi 2.5 people, built exactly like Thousandvale's (`createTvBody`), and every vehicle is sized to them:
low seats, controls pulled in close to short arms, tall roofs and cages for big heads. Third-person camera.

**Read `docs/PLAN.md` first** — the contracts between the parts (world, physics, network, screens), the ports, the
authority model and who owns which file. This README is what each part does and how to work on it.

| | |
|---|---|
| Play (LAN, stable) | `http://<LAN-IP>:8550/prototypes/roverlands/` (https `:8552` for controllers) |
| Play (LAN, dev) | `:8551` (https `:8553`) — the working tree, user unit `roverlands-dev` |
| Public | https://roverlands.games.radgh.com/ (RGS droplet, `rgs update roverlands`) |
| Garage (every model with riders) | `garage.html?v=trail_jeep&cam=side` |
| Test drive (solo, no menus) | `drive.html?seed=7&mode=sandbox` (`&online=1`, `&code=ABCD` to join, `&view=full`) |
| World preview (fly around) | `world.html` |

## Vehicles (released: 22 of the planned 23 — the harvester is left)

| id | name | seats | notes |
|---|---|---|---|
| `trail_jeep` | Trail Jeep | driver, passenger, gunner (standing, twin-barrel turret on a riser) | open: a hard crash or rolling it throws everyone out |
| `dirtbike` | Dirtbike | rider | balances itself while ridden, leans into turns, Shift = lean back (wheelie), you fall off if it goes over |
| `tank` | Ironback Tank | driver (stands in the hatch, aims + fires the shell gun), 2 passengers | enclosed; tank controls |
| `hover_tank` | Driftwing Hover Tank | driver (bolt gun), passenger | enclosed; floats over water |
| `helicopter` | Skylark Helicopter | pilot + 3 | Space climbs, Shift sinks |
| `airplane` | Tundra Hopper | pilot + 1 | parked on the runway (own pad, never in the cycling pad list) |
| `rocket_car` | Bounder Rocket Car | driver | jump / dodge / boost; big balls in the sandbox lot |
| `forklift` | Lugmore Forklift | driver | Space / Shift move the forks; they lift a parked vehicle |
| `trailer_utility` | Utility Trailer | — | hitch behind the Trail Jeep (`tow` added to the jeep) with T |
| `semi_truck` | Longhaul Semi | driver + 1 | tows the three semi-trailers (fifth wheel: the trailer's nose rides over its back) |
| `trailer_box` / `trailer_flatbed` / `trailer_tanker` | Box / Flatbed / Tanker Trailer | — | landing legs (`leg: 1` wheels) at z 1.8, clear of the semi's back tyres; box doors = a ramp (F) |
| `fire_truck` | Brightwater Fire Truck | driver (siren), passenger, gunner (water cannon at the back) | model shares `models/lightbar.js` |
| `ambulance` | Swiftcare Ambulance | driver (siren) + 3 (two on benches in the back) | rear doors open into a ramp |
| `police_car` | Patrol Car | driver (siren) + 3 | trunk lid; no police words anywhere |
| `sedan` | Meadowlark Sedan | 4 | enclosed; trunk (door `trunk`) carries props with physics |
| `quad` | Scramble Quad | rider + passenger | open, thrown off in big crashes |
| `dune_buggy` | Sandhopper Buggy | 2 | 0.75 m suspension travel (jeep 0.42) |
| `motorcycle` | Roadrunner Motorcycle | rider | road bike: faster, lower, less travel than the dirtbike |
| `bicycle` | Pedalpush Bicycle | rider | tap gas to pedal (`pedal`) |
| `army_truck` | Trailhauler Six | 2 cab + 8 benches + 1 standing | open bed you can stand in while it drives; tailgate = ramp |

Tow points (`tow`, T to hitch): jeep, forklift, tank, rocket car, fire truck, ambulance, patrol car, sedan, quad, buggy,
army truck, semi, and the utility trailer itself (so trailers chain).

The harvester + wheat comes next — see `~/claude/agent/roverlands-checklist.md`. Codex reference sheets for all of them
are in `assets/ref/` (README there).

**Adding a vehicle** = one entry in `data/vehicles.json` (numbers, wheels, seats) + `js/client/models/<id>.js`
(`build(THREE, def, { enhance }) -> { group, wheels, steer?, turret?, update(st) }`) + its id in the world's pad list.
Check it in `garage.html?v=<id>` against `assets/ref/<id>.webp`, then drive it in `drive.html`.

## The physics (`js/phys/`, Rapier 0.21, fixed 1/60 s)

* **`physics.js`** — the Rapier world from the world data: the heightfield (Rapier stores it column-major, the world
  row-major — `heightfieldArray()` transposes, and a test proves the ground under a ray is the world's `heightAt`),
  one collider per placed object, collision groups, and **smashing**: a solver stops a car dead on a fixed collider
  in the same tick it reports the contact, so breaking the object afterwards still costs the car all its speed.
  Instead every fast local body sweeps its box forward each tick; a breakable object in that space is judged on the
  momentum carried into it (`mass x closing speed >= breakAt`) and removed BEFORE the solver sees it, the body paying
  part of `breakAt` as a slowdown. Not enough momentum and it stays a wall. (Never change the world inside a Rapier
  query or event callback — collect, then act; that was the first version's bug.)
* **`vehicle.js`** — wheels are shape casts, not colliders: a sphere the size of the tyre swept down from the top of
  its suspension travel, so a tyre climbs onto a log with its front edge. Springs + dampers + anti-roll bars + bump
  stops; a tyre model with load-scaled grip, a slip curve that falls to `tyre.slide` once sliding (that fall is what
  makes a drift hold), a friction circle shared by drive and cornering (power oversteer), handbrake that locks and
  loosens the rear, surface grip/sink/drag (mud sits you 12 cm lower and holds you to ~20 m/s against 26 on grass),
  air control (pitch/yaw/roll in the air), downforce, flip-back (hold jump when upside down), crash detection (a tick's
  velocity change beyond gravity → `onImpact(dv)`). Bikes: a lean controller that holds the lean a real bike needs for
  the turn (`tan(lean) = v x yawRate / g`) and a fork-trail yaw hold so braking can't swap the ends.
* **`walker.js`** — people on foot: Rapier's character controller plus **riding moving platforms** (stand on a jeep's
  deck: next tick you start where the jeep carried your spot, turned with it — no friction tricks, so it holds at
  speed), **thrown out** (the capsule becomes a dynamic tumbling body, then stands up), and swimming.
* Tests: `node --test tests/phys-*.test.js` — settle, top speed, brake, steer, drift, mud, ramp jump, bike balance,
  smash a fence but not a boulder, crash impact vs a gentle bump, platform riding, thrown out.

## The game (`js/game/`)

* **`session.js`** — one drive: bodies from the room's `ents` list (dynamic here when I own them, kinematic at the
  owner's pose 120 ms in the past otherwise), seats (E = nearest free seat, the driver seat slightly favoured; F swaps),
  driving (look-to-steer when no steering key is held, the old jeep-shooter way; Settings can turn it off), the gunner's
  turret (aims at what the crosshair is over; pellets push bodies and break small things), crashes (the owner sends
  `crash`, every rider throws themselves out), breaking (local smash → `break` → everyone removes it, a falling piece
  for trees and fences), bumps between machines' bodies, the flag (walk onto it to take it; the room decides), tyre
  tracks + dust + splash through the world view, engine sounds, and what the HUD/minimap read.
* **`input.js`** — keyboard + mouse (pointer lock), controller, the phone controls (from the UI) → one state.
* **`camera.js`** — third person; swings in behind the vehicle when you stop looking; never through the ground.

## Client (`js/client/`)

* `main.js` boot + frame loop + the glue to the screens; `riders.js` Chibi 2.5 bodies seated with hands on the wheel /
  bars / turret handles (Knockabout's two-bone arm solve); `models/*` the vehicles (`kit.js`: chunky tyres, tubes,
  bevelled panels, struts — static parts merge into one matte + one shiny vertex-coloured mesh per vehicle, struts and
  small bits hide past 45 m; a jeep is 6.6k triangles / ~25 meshes, the bike 4k / 12); `sounds.js` engine voices
  (two oscillators through a low-pass, fake gear changes, skid noise) + one-shots through the playground's Sfx;
  `simple-view.js` the plain world renderer (fallback, `?view=simple`, and the "Simple" graphics setting).
* `world-view/` (world agent) — the full highdef-style world view; `ui/` (net/UI agent) — every screen and the HUD.

## Controls by vehicle

Space and Shift mean different things in each vehicle (`js/game/session.js`, driver block). W/S and A/D are always
gas/brake and steer unless noted. Fire = left click / RT; F = Y on a controller.

| type | W / S | A / D | Space | Shift | fire | notes |
|---|---|---|---|---|---|---|
| car (jeep, sedan, trucks…) | gas / brake, then reverse | steer (or point the camera: look-to-steer) | handbrake (drift) / flip back when upside down | boost if it has one | — | hold R to sit it back on its wheels; in the air Q / Z or the stick's up / down lean it back / forward (gas no longer does — it flipped people holding gas over jumps); plane: stick = elevator |
| bike (dirtbike, motorcycle) | gas / brake | steer (it leans itself) | rear brake | lean back (wheelie); Q / Z lean back / forward | — | controller / phone: left stick up / down leans forward / back (pitch): on the ground an angle target (`def.wheelie`, 0.45 rad), in the air (a 2.2 rad/s pitch-rate hold, `def.airPitch`); falls over if it goes too far over |
| bicycle | **tap** gas to sprint (hold = cruise) | steer | brake | — | — | `pedal` in its data |
| tank | both tracks | turn (on the spot with no gas) | — | — | gun (the driver aims with the camera) | no look-to-steer |
| hover | thrust / reverse | turn | — | boost | gun | floats over water |
| helicopter | tip forward / back | turn | climb | sink | — | controller / phone: stick tips, RT / GAS climbs, LT / BRAKE sinks; climb aims for `heli.climb` m/s (9); rotor spins up in ~1 s |
| plane | throttle lever up / down (it stays) | roll + turn | pull up | push down | — | needs ~27 m/s to lift off (the runway) |
| rocket car | gas / brake | steer; in the air A/D roll | jump, again in the air = dodge / flip | boost (also in the air) | — | |
| forklift | gas / brake | steer (rear wheels) | forks up | forks down | — | the forks really lift a vehicle |
| seat switches | | | | | fire flips the seat's switch (siren and lights) | `act` in the seat's data |
| trailer hitch | | | | | | T / d-pad left / HITCH while driving something with `tow` and its tow ball within 1.8 m of a trailer's tongue (`hitch`); press again to unhitch. The trailer is claimed (`own`) first so both ends are simulated on one machine; a hitch drops itself if either end stops being mine |
| on foot | run (hold Shift to walk) | walk | jump (jetpack: hold to fly) | walk | — | E: get in / pick up / put down (Shift+E throws); F: open or close doors |

## Systems added after the demo plan

* **Props** (`js/phys/props.js`, type `prop` in vehicles.json: crate, bag, barrel, big ball, jetpack): CCD bodies you
  carry, drop or throw; a vehicle claims (`own`) any prop that touches it, so trunk cargo is simulated with the car.
  Soft-CCD prediction was tried and REMOVED: it shot squeezed crates out of a trunk at 50 m/s.
  A wheel's cast ignores any prop whose centre is above its own chassis top (cargo in the trunk or bed): the top of a
  wheel's travel pokes up through the floor, and a crate there used to read as ground and get shoved through the floor.
* **Doors** (`parts[].door` + `open` shape): closed = solid wall, open = its ramp / lid shape. Box trailer, ambulance,
  sedan / patrol car trunk. Opened with F on foot via the `act` message (`door_<name>`), the room remembers the state.
* **Towing** (`tow` on the puller, `hitch` on the trailer; ball joint): semi trailers (`fifthWheel: true`) don't
  collide with their tractor, and no wheel stands on the thing it is hitched to. Every trailer has a rear `tow` too.
* **Seat switches** (`seats[].act`, `act` message): siren and light bars; the siren is a two-tone voice.
* **Shots by kind** (pellet, bolt, shell with a blast radius, water spray that arcs) — `SHOT` in session.js.
* **Wheat** (`js/game/wheat.js`): grows on every farm sample; the harvester's `harvest` header cuts it; `cut` message.
* **Next-batch vehicles** live in `data/vehicles-next.json` with physics tests in `tests/phys-next.test.js` until their
  model exists; then they move to vehicles.json and get pads in the world.

## Online + screens

(net/UI agent.) Contracts: `docs/PLAN.md` "Net contract" + "Net contract additions" — that is the spec; this is the map.

### How it fits together
* **Every moving body is simulated by its OWNER's browser** (the driver; else the last driver; else the host). The
  server never runs physics: it is a **relay + referee**. Same referee solo and online: `js/net/room-core.js` (pure,
  `now()` and the world's `sites` handed in) runs on the server per room, and in the page through
  `js/net/loopback.js` for solo play — the game cannot tell the difference.
* `js/net/protocol.js` — every client message type with its field types, size limits and its own rate (token bucket
  per socket); `validate()`, `parseFrame()`, `cleanName/cleanLook/cleanReasons`, the constants (6 m seat range, 3 m
  flag range, seat kept 90 s while driving / 5 min in the lobby, 10 s shortest run that counts).
* `js/net/room-core.js` — seats (empty + within 6 m), driver = owner, `own` / `give`, `bump` relayed to the owner
  only, the broken-objects set (told once), the flag (site -> carried -> dropped / captured; drops when the carrier is
  thrown out or leaves), the Flag Run clock (starts when a driven vehicle leaves the home ring — or when the flag is
  taken if it somehow has not; a run under 10 s records no time), best times per seed + site, sandbox spawns, host
  handover, kick + vote-kick, pins, `crash` relay, ratings -> insights. `state` 20/s = only what changed, never your
  own bodies back to you.
* `js/net/client.js` — `connect({ online, url, code, create, spectate, name, look, ticket, sites, vehicles })` ->
  `net` (`you`, `room`, `on('room'|'msg'|'<type>'|'status')`, `send`, `close`, `serverNow()`, `ping`, `last`,
  `drop()`). Reconnects by itself with the tab's token and gets the same seat back; remembers the tab's room so a
  refresh rejoins (`lastRoom()`). `serverAvailable()`, `listRooms()`.

### The server (`server/`)
* `main.mjs` — http + https (the playground's self-signed cert, gamepads need a secure page) + WebSocket `/ws` on one
  port each. `GET /status` (`server: 'roverlands'`, build, rooms, players, bad/limited frame counts), `/healthz`,
  `GET /rooms` (Find a game), `POST /feedback` (Tumblefair's `server/feedback.mjs`), `POST /tally` + the rooms' reports
  (Tumblefair's `server/insights.mjs`), `POST /account` (Knockabout's `server/accounts.js`; env `RGS_API`),
  `/internal/admin/feed` + `/action` (Tumblefair's `server/rgs.mjs`; env `RGS_ADMIN_SECRET`, ratings keyed by
  `vehicle`). It builds each seed's world once with the same pure `js/world/worldgen.js` the browsers run, so the
  home ring and flag sites match what everyone draws; reads `data/vehicles.json` for seat counts (re-read every 30 s);
  keeps best times in `<data>/bests.json`. Flags: `--port --https-port --certs --host --public --data --build`.
  Tests may set `ROVERLANDS_TEST_SITES` / `ROVERLANDS_TEST_VEHICLES` (JSON files).
* `hub.js` — rooms by 4-letter code (no I/O), the public list, per-socket validation + rate limits; an empty room
  closes after 5 minutes. `static.js` — serves the playground root but ONLY the `ALLOW` list (gzip, brotli for the
  big ones: Rapier 4.3 MB goes out ~1 MB); `tests/static-allow.test.js` walks the page's real imports and fails when
  something it loads is not on the list.

### Running it
| | http | https | how |
|---|---|---|---|
| dev (working tree) | 8551 | 8553 | user unit `roverlands-dev` (`ops/install.sh` once; `systemctl --user restart roverlands-dev` after changing `server/` or `js/net/`) |
| stable (published) | 8550 | 8552 | `tools/publish-roverlands.sh [<ref>]` — from a COMMIT (git archive), gates: node --check + unit tests + no server files in the public copy; `~/.local/share/roverlands/{releases,current,stable,dev}` |

`ops/install.sh --status` shows both. Bug reports: `node tools/feedback-report.mjs --env stable|dev [--html f.html]`,
`--mark 3,4 --state done --note "…"`. Data lives in `~/.local/share/roverlands/<env>/` (feedback/, insights/,
profiles.json, bests.json). Public: games.radgh.com via the RGS repo (`~/claude/docs/rgs.md`) — not set up yet.

### Screens (`js/client/ui/`, styles in `css/roverlands.css`)
`index.js` `createUI({...})` is the one entry point — its header lists every call main.js makes (`setWorld`,
`markers`, `hud.*`, `vehicleLeft`, `touchState`, `touch.mode`, `settings`, `openMenu/openMap`, `blocking`, `state`).
* **Title**: name + Chibi look card ("Edit look" = Knockabout's piece-by-piece builder on a Chibi 2.5 body, in its own
  small 3D view: `look-editor.js`), **Play solo** (one tap; Flag Run / Sandbox chips), Host (mode, Public / Invite only,
  flag site), Join (code), Find a game, Spectate, My runs (local best times + ratings), What's new
  (`shared/whats-new.js` + `data/changelog.json`), the account pill (`shared/rgs-signin.js`, optional). An invite link
  `?code=ABCD` joins at once (a brand-new device is asked for a name first, one tap).
* **Lobby**: big code, QR + Big QR, copy invite link, drivers + watchers with portraits, host: Remove / options
  (others see them read-only and can vote to remove), Start driving.
* **☰ menu** on every screen (Back, Invite, Map, New run (host), How to drive, Settings, What's new, Report, Sign in /
  out, Leave) and the **!** report button (text + a picture + debug: screen, room, network, `getDebug()`, device,
  recent errors). Both own the top-right corner.
* **HUD**: flag line + run clock + best (top-left, from the room's own messages), speed, seat hint, toasts, banners, a
  round **minimap** under the corner buttons that turns with the camera, the connection dot, the spectator bar.
  **Map** (M / Back / ☰ / tap the minimap): pan + zoom with mouse, touch (pinch) and controller (stick, triggers),
  legend, place a pin (A / Enter / tap) shared with the room.
* **Vehicle rating card** after leaving a vehicle you drove for 60 s+ (once per vehicle per visit): 👍/👎 + reasons
  that say what kind (Grippy, Fun to jump… / Floaty, Slides too much…) + "Tell us more" -> `{ t:'rate' }` -> insights.
* **Phone controls** (`touch.js`): a stick under the left thumb, drag right to look, pinch for camera distance, GAS /
  BRAKE / JUMP / ENTER / FIRE / SEAT buttons (which show depends on `ui.touch.mode()`).
* **Controller in every menu**: Knockabout's `nav.js` focus ring; d-pad / stick moves, A presses, B backs, Start /
  Back open the menu / map in a game; arrows / Enter / Esc on a keyboard.
* `dev.html` + `dev.js` — the screens on their own over a flat painted stand-in (no 3D), used by `tests/ui.spec.js`.

### Tests
`npm test` (node): `protocol`, `room-core` (every referee rule), `net-room` (the real server on :8555 with the game's
own client: two players, seats, handoff, bump relay, break dedupe, flag run, reconnect, host leaving, junk + rate
limits, solo loopback), `static-allow`. Playwright (from the playground root, under the lock):
`flock ~/claude/agent/roverlands-pw.lock npx playwright test prototypes/roverlands/tests/ui.spec.js` — its own server
on :8556; desktop + phone; title, solo HUD, menu, settings, how to drive, map + pin, report, rating, look editor,
host -> invite link -> Find a game -> vote-kick / remove -> start -> spectate; zero console errors; pictures in
`tests/shots/` (git-ignored).
