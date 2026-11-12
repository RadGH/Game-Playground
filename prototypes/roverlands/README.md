# Roverlands

> **QA pass pending** (added 2026-11-11): the next time this game is worked on, run `tools/prepublish-check.sh roverlands` from the playground and fix what it finds — game-lint (on 2026-11-11: 8 browser-tooltip, 1 browser-popup), modules nothing loads (`tools/game-reach.mjs`), and a `tests/walk.mjs` that walks every screen on desktop + phone (`tools/walk-screens.mjs`; none yet). Replace this note with the **Status / Play / Next / Parked** block (`~/claude/docs/game-standards.md`) and add `roverlands` to `tools/qa-passed.json`. Publishing this game refuses until the checks pass.

A co-op vehicle game prototype: a big, varied landscape, vehicles that feel good to drive, and a goal to drive for.
**Flag Run** — pick a vehicle at home base, cross the country, get out, grab the flag, get back in and bring it home
(fastest time wins; drive together: one at the wheel, one on the gun, one riding along). **Sandbox** — every vehicle
parked around a big area, no goal. Built to be the vehicle layer for a later travel-and-discovery game (or a mechanic
game, or transport for fishing and hunting).

Players are Chibi 2.6 people (realistic-cartoon adults, ~1.74 m), built exactly like Thousandvale's (`createTvBody`),
and every vehicle is sized to them (Expansion 1 M1, "Rider fit" below): real-car cabins with the roof ~1.6 m off the
ground, wheels and bars where a 2.6 arm lands, feet on the floor, pegs or pedals. Third-person camera.

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

## Vehicles (all 23 released)

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
| `harvester` | Goldline Harvester | driver + passenger | red + cream; two parked at Haystead Farms (own pads, spliced in before the props); the header cuts wheat (`harvest`), the reel turns with the wheels |
| `army_truck` | Trailhauler Six | 2 cab + 8 benches + 1 standing | open bed you can stand in while it drives; tailgate = ramp |

Tow points (`tow`, T to hitch): jeep, forklift, tank, rocket car, fire truck, ambulance, patrol car, sedan, quad, buggy,
army truck, semi, and the utility trailer itself (so trailers chain).

### Expansion 1 batch A (farm + work) — released in M6 (in `data/vehicles.json` and for sale at every Dealer)

Models, physics and tests came in M5; M6 Farming moved them into `data/vehicles.json` and `data/shop.json` (seed drill
500, produce trailer 500, water bowser 600, parcel van 1400, tractor 1500, tow truck 2500). Three tractors with a seed
drill, a water bowser and a produce trailer are parked in the Marrow Barn farm yard for anyone to use (the farming
referee's fixtures, below). `tests/next-drive.spec.js` still drives them all in the real game loop.

| id | name | seats | notes |
|---|---|---|---|
| `tractor` | Furrowline Tractor | driver + buddy seat (in the cab) | orange; slow (11 m/s) and strong; lugged tyres (`tyre.soft` 0.75) keep ~90% of their speed in mud; Space / Shift lift / drop the mid-mounted mower (`mower`, room act `mower` on while it is down); fire switches the towed implement's work on and off (seat act `tow_work`); drawbar `tow` at the back |
| `seed_drill` | Seed Drill | — | trailer (`hitch`); jockey wheel (`leg`); work act `door_sow`: the coulters drop into the soil and seed trickles down the tubes; `sow` = the strip it plants (M6) |
| `water_bowser` | Water Bowser | — | tandem trailer; work act `door_spray`: mist from 11 nozzles on a 6 m boom; `spray` = the strip it waters (M6) |
| `produce_trailer` | Produce Trailer | — | tandem tipping trailer; work act `door_bed` (also F on foot) tips the bed (`tip`: the bed colliders turn 0.62 rad at 0.4 rad/s and the load slides out) and drops the tailgate; the model's heap shows `load` 0..1 (session passes `E.load`) |
| `tow_truck` | Hookline Tow Truck | driver (amber lights: seat act `lights`) + passenger | yellow; crane + hook; `towAny`: the under-lift (`tow`) takes any car with no tongue by its front bumper and lifts its front wheels clear — trailers still by the tongue |
| `delivery_van` | Parcel Van | driver + passenger | teal + cream (not the sheet's brown and gold: a real parcel firm's livery); sliding side door (`side`) + two back doors (`rear`), F opens; shelves along the left wall and the wheel arches are colliders too; parcels are prop crates; a rear step bumper and a running board (rises under 0.3 m: the walker's autostep) |

### Expansion 1 batch B (combat, sky, space, Moon)

Models, physics and tests done; the milestone that uses each one (M8 raider buggy, M9 cargo plane + glider, M11
rocket + pod, M12 rover) moves it to vehicles.json and gives it a place. M11 moved the rocket, the landing pod and the
moon rover (parked on the Moon) into `data/vehicles.json`, M8 the Scrapper Buggy (Dealer, 2,200 gold; two parked at the
Rustwild Gate Garage); `data/vehicles-next.json` is empty until the next batch.
See them in `garage.html?v=<id>`.

| id | name | seats | notes |
|---|---|---|---|
| `raider_buggy` | Scrapper Buggy | driver, passenger, gunner (standing on the deck over the engine) | rust patch panels on a grey tube cage, spiked ram; twin gun (`pellet`, 7/s) on a post that clears the cage roof; open (thrown out), 0.62 m travel, 29 m/s; also the M8 raider enemy |
| `cargo_plane` | Big Sky Lifter | pilot (fire = ramp), co-pilot, 4 on wall benches in the hold | 16 t, four props; the hold floor is the chassis top (walk in, stand, ride); rear `ramp` door: shut it is swung up into the tail, open a 23° slope to the ground (F on foot or the pilot's `door_ramp`); lifts off ~35 m/s after ~530 m of runway; `aero.trim` |
| `glider` | Soarwing Glider | pilot (hangs in the harness, hands on the base bar, boots on a stirrup) | no engine (`engine.force` 0); glides ~11.7 m/s, sinks ~1.0 m/s (about 12 : 1); Shift dives for speed, Space pulls up, A / D bank; `aero.trim` + `aero.pathHold` bring a let-go glider back to its glide; `linDamp: 0` |
| `rocket` | Skyreach Rocket | commander (fire = separate the booster, one way), crew | type `rocket`: `thrust` lever (W / S, it stays), thrust 1.4 × its weight, then the upper stage 1.6 ×; A / D and the stick tip it at most 0.25 rad, let go it stands straight up; the booster (`stage` door, `seatOnly`) is extra mass + colliders that go when staged; launch / orbit flow is M11 |
| `landing_pod` | Homeward Pod | 2 inside (fire = parachute out / cut away) | type `pod`: shield-first drag rights a tumbling pod; ~80 m/s falling; `chute` (a door with no collider) opens over 2.5 s, jolt capped at 4 g, then ~6.7 m/s; W / S / A / D thrusters nudge ~0.8 m/s²; the model glows (shield rim + plasma) from its own speed past 70 m/s |
| `moon_rover` | Crater Crawler | driver + passenger | six wire-mesh wheels (sheet had four), 4-wheel steer, 0.55 m soft travel (`k` 4200: little sag at 1.62 m/s², still clear of the stops on Earth), 10 m/s; flies a kicker at Moon gravity and lands flat |

Physics added for them (all opt-in, every older vehicle behaves exactly as before): **gravity** is a world setting
(`createPhysics(RAPIER, world, { gravity })`, else `world.gravity`, else 9.81; `phys.gravity`; the crash check uses it);
types `rocket` (`thrust { force, leverRate, tilt, hold, cda, stage { door, mass, com, r, h, force } }`) and `pod`
(`pod { cda, cp, thrust, hold }` + `chute { door, cda, open, at, maxG }`), neither gets air control or flip-back;
`aero.trim` / `aero.trimAoa` / `aero.pathHold` / `aero.glidePath` for planes. A plane's `aero.inertia` must keep
`mass × inertia × 6 / (60 × the body's own inertia)` under 1 or the control torque oscillates (the glider's first try
spun at 46 rad/s). Seat acts `door_ramp` / `door_stage` / `door_chute` are doors, so the room needs no change; the HUD
names them (`ACT_HINT` in session.js) and a part with `seatOnly` is never offered to F on foot.

Codex reference sheets for every vehicle, and the next ones, are in `assets/ref/` (README there).

**Adding a vehicle** = one entry in `data/vehicles.json` (numbers, wheels, seats) + `js/client/models/<id>.js`
(`build(THREE, def, { enhance }) -> { group, wheels, steer?, turret?, update(st) }`) + its id in the world's pad list.
Check it in `garage.html?v=<id>` against `assets/ref/<id>.webp`, then drive it in `drive.html`.

### Rider fit (Chibi 2.6, Expansion 1 M1)

Measured, not guessed: `node --import ./avatar-3d/tests/three-register.mjs prototypes/roverlands/tools/measure-rider.mjs
[--looks N] [--json]` builds bodies exactly like the game (Thousandvale's version switch + Knockabout's look pipeline)
and reads each clip off the bones and the skinned mesh. Metres above the floor under the feet (the actor root):

| pose (clip) | used for | hips | eye | head top | shoulders | notes |
|---|---|---|---|---|---|---|
| `idle` | gunners, standing spots | 0.909 | 1.546 | 1.80 | 1.286 (0.456 wide) | default human, 1.733 m |
| `drive` | every driver with a wheel / yoke / stick | 0.447 | 1.078 | 1.34 | 0.824 | fists ~0.17 over and ~0.52 ahead of the hips |
| `seated` | passengers, benches | 0.450 | 1.086 | 1.34 | 0.828 | hands in the lap |
| `ride` | dirtbike, motorcycle, bicycle, quad | 0.900 | 1.517 | 1.79 | 1.274 | does not move the root: hips = standing height |

Across the 13 looks the garage and game use (human, elf, dwarf, halfling): standing 1.43–1.78 m, standing hips
0.77–0.94, arm (shoulder to fist) 0.42–0.75 (halflings and dwarves 0.42–0.45, humans 0.63–0.66, elves 0.74), leg
0.70–0.85, ankle 0.07–0.08 over the sole, **head top 0.69–0.98 over the hips** (2.5 was 1.13), shoulders 0.25–0.43
over the hips. Every roof, cage and canopy is now "hips + ~1.0"; the 2.5 vehicles had hips + 1.13–1.35.

How `riders.js` seats a body (any race comes out exact):
1. plays the seat's clip, then moves the body so its **hip bone lands on `seat.p`** (`fitInfo().hipErr` ~0);
2. **`seat.feet`** `[half, y, fwd]` — the soles go at height `y` (vehicle frame: floor, footwell, peg or deck top),
   `fwd` m ahead of the hips along the seat's facing, `half` m either side; `'pedals'` follows the model's
   `group.userData.pedals` (bicycle). Two-bone leg solve, knees up and forward (out a little on bikes), feet kept flat;
3. **hands** from `handTargets(model, seat)` (exported, the session and the Garage share it): `hands: 'wheel'` the
   steer node's rim at ±0.14, `'bars'` the bars group's grips at ±0.3, a gun seat the turret's spade grips, or explicit
   `grips` + `gripFrame` ('body' | 'steer' | 'bars' | 'yaw' | 'pitch'). Two passes put the **fist** (grip bone), not the
   wrist, on the point. Short arms **slide the seat forward** (up to 0.2 m) instead of stretching; the stretch cap
   (1.08) is a last resort and `fitInfo().stretch` reports it.
`?chibi=2.5` still works: `sit` for drive/seated, the old hip table, the same pin and solves.
Thrown out (`rag`): the `dead` clip lies the body along -z from its root, so `onFoot(..., ragQ)` turns it to lie along
the tumbling capsule (capsule axis = local y, centre 0.35 over `feet`); before M1 it lay across the capsule.

Where things go, per seat (all 23 vehicles were refitted to this): car footwells 0.22–0.27 under the hips with the
feet ~0.6–0.7 ahead (legs out, like a real car), chair-height cabs (trucks, forklift, helicopter, plane) 0.42–0.45;
wheel centre ~0.3 over and ~0.42 ahead of the hips; roof underside at hips + 1.0; standing gun grips ~1.1 over the
feet. Check with `garage.html?v=<id>&cam=side&zoom=1.7&xray=1&dbg=1` (x-ray body, red = where a hand is asked to go,
yellow = where the fist landed; `&seat=N` one rider, `&look=halfling` one race, `&hide=1` no vehicle, `&t=0` freeze)
and `window.garage.fit()` (per seat: stretch, slide, hip error, head room under the roof, foot gap over the floor).
`flock ~/claude/agent/roverlands-pw.lock node prototypes/roverlands/tools/garage-shots.mjs [--only id,id] [--views
close-side,close-34,xray-close-side] [--q dbg=1]` screenshots every vehicle into `tests/shots/fit/` with `fit.json`.
`node --import ./avatar-3d/tests/three-register.mjs prototypes/roverlands/tools/fit-check.mjs [--only id,id]` does the
same numbers with no browser for every seat x human / elf / dwarf / halfling (flags STRETCH, HEAD, FEET-IN, FEET-AIR,
FIST); `tools/onfoot-check.mjs` checks a person on foot (idle, run, walk, jump, thrown out) stands on the ground.

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

* `main.js` boot + frame loop + the glue to the screens; `riders.js` Chibi 2.6 bodies seated with hips pinned to the
  seat, feet on `seat.feet` and hands on the wheel / bars / turret handles (Knockabout's two-bone solve, see "Rider
  fit"); `models/*` the vehicles (`kit.js`: chunky tyres, tubes,
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
| car (jeep, sedan, trucks…) | gas / brake, then reverse | steer (or point the camera: look-to-steer) | handbrake (drift) / flip back when upside down | boost if it has one | — | hold R (d-pad right, phone FLIP — shown only while tipped) to sit it back on its wheels; it does so by itself after 3 s lying still on its side or roof (`js/game/righting.js`); in the air Q / Z or the stick's up / down lean it back / forward (gas no longer does — it flipped people holding gas over jumps); plane: stick = elevator |
| bike (dirtbike, motorcycle) | gas / brake | steer (it leans itself) | rear brake | lean back (wheelie); Q / Z lean back / forward | — | controller / phone: left stick up / down leans forward / back (pitch): on the ground an angle target (`def.wheelie`, 0.45 rad), in the air (a 2.2 rad/s pitch-rate hold, `def.airPitch`); falls over if it goes too far over |
| bicycle | **tap** gas to sprint (hold = cruise) | steer | brake | — | — | `pedal` in its data |
| tank | both tracks | turn (on the spot with no gas) | — | — | gun (the driver aims with the camera) | no look-to-steer. Skid steering: the tracks only resist the hull sliding, and a yaw drive turns it toward `steer.turn` rad/s standing (1.3) down to `steer.turnFast` at top speed (0.7), limited by track grip × `steer.bite` (report #7: ten wheels' side grip had held it nearly straight) |
| hover | thrust / reverse | turn | — | boost | gun | floats over water |
| combat (the Rustwild, M8) | | | | | tank / hover tank driver: main gun; jeep / Scrapper Buggy: the gunner seat (or the driver with the Second gun mount: a forward gun) | G / d-pad right / REPAIR = the Field repair kit (once per camp); phone: a tank driver gets FIRE beside GAS; the crosshair shows for any seat with a gun |
| helicopter | tip forward / back | turn | climb | sink | — | controller / phone: stick tips, RT / GAS climbs, LT / BRAKE sinks; climb aims for `heli.climb` m/s (9); rotor spins up in ~1 s |
| plane | throttle lever up / down (it stays) | roll + turn | pull up | push down | — | needs ~27 m/s to lift off (the runway) |
| rocket car | gas / brake | steer; in the air A/D roll | jump, again in the air = dodge / flip | boost (also in the air) | — | |
| forklift | gas / brake | steer (rear wheels) | forks up | forks down | — | the forks really lift a vehicle |
| seat switches | | | | | fire flips the seat's switch (siren and lights; the tow truck's amber `lights`) | `act` in the seat's data |
| tractor | gas / brake (top 11 m/s) | steer | mower up | mower down | the towed implement's work switch: seed drill sows, bowser sprays, produce trailer tips | seat act `tow_work`; T hitches the seed drill, bowser and produce trailer like any trailer; farming (M6): mower down cuts, drill on plants, spray on waters, trailer tipped at the market sells |
| tow truck | gas / brake | steer | handbrake | — | amber lights | T with the under-lift within 1.8 m of a car's front bumper (or a trailer's tongue) lifts and tows it; with nothing that close, T runs the winch on a wreck up to 22 m away (M7), T again stops it |
| M7 jobs | | | | | fire truck cannon seat (F twice): water; patrol car / ambulance: siren | T (d-pad left, HITCH) stopped beside a job's station sign takes a call (on foot: E); T in a patrol car with the Stinger strip drops a strip during a chase; ambulance / helicopter: stop beside a patient to load them, stop in a hospital yard to drop them; tow / haul: stop in the yard to drop or load |
| trailer hitch | | | | | | T / d-pad left / HITCH while driving something with `tow` and its tow ball within 1.8 m of a trailer's tongue (`hitch`); press again to unhitch. The trailer is claimed (`own`) first so both ends are simulated on one machine; a hitch drops itself if either end stops being mine |
| on foot | run (hold Shift to walk) | walk | jump (jetpack: hold to fly) | walk | — | E: get in / pick up / put down (Shift+E throws); F: open or close doors |
| Crater Crawler (Moon, M12) | gas / brake | steer | handbrake; **in the air with the Jump booster: one extra push** | — | — | **T** (d-pad left, HITCH) beside a glowing sample: the arm takes it; stop at the Sample Drop / a supply yard / beside a loose crate and it happens by itself; on foot hold E beside a sample |
| survey kits (M10) | | | | | | on foot: tap E by a kit crate picks it up; **hold E** (X on a controller, the HOLD TO SET UP button on a phone) sets it up; carrying one beside a jeep / truck / quad / buggy / trailer, E loads it into the back; E beside your set-up kit packs it up. Helicopter pilot: **T** (d-pad left / HITCH) hooks a crate hanging under you on the sling, T again drops it |

## Farming (Expansion 1 M6)

The farm belt south of Marrow Barn is ten **fields** (the county's farm plots, field 1 nearest the yard), each cut into
4 m cells. Every cell goes **grown → cut → planted → watered → grows (4 min) → grown**, and every step is done with a
machine (expansion rule 1):

| step | with | how | pays (per 10 cells, `data/jobs.json` steps) |
|---|---|---|---|
| cut | Goldline Harvester (crop into its own 200-cell hopper), or a tractor with the mower down (Shift) — the crop goes into a produce trailer it tows (150 cells; none towed = the crop is lost) | drive over standing crop | 12 |
| plant | tractor towing the seed drill, switched on (fire / RB) | drive over cut ground | 8 |
| water | tractor towing the water bowser, spraying (fire / RB) | drive over planted ground; the tank waters 120 cells, then park at the yard's **water point** (blue tank, "W" on the map) and it fills itself | 6 |
| sell | the produce trailer (tip it: fire / RB) or the harvester (stop) in the yard of the **Marrow Flats Produce Market** or the **Port Lindell Freight Depot** ("M" on the map, "Sell produce here" sign) | — | 3 gold a cell of crop + 2 per cell per km it was carried |

Fields grow one crop each: 1-2 wheat, 3 carrots, 4 pumpkins, 5 sunflowers, then round again (each with its own look).
**Levels** (`data/jobs.json` farming, each level's `need` is checked by the room): 1 cut + plant + water 70% of field 1;
2 sell a full load (field 2 opens); 3 harvest and sell most of a carrot field; 4 three loads at Port Lindell within 30
minutes; 5 every field (all 10 open) replanted at once. A field your level has not opened says so ("Field 3 opens at
farming level 3"). **Upgrades**: Wide seed drill (a strip twice as wide), Big water tank (240 cells), Rich soil (grows in
2 minutes), Tall trailer sides (225 cells). **Co-op**: everyone in the machine you drive, or within 30 m of the cells
worked, gets every batch in full; the fields are the room's, so friends see the same crops.

Files: `js/game/jobs/farming.js` (pure: fields, the cell state machine, rules per upgrade, level goals, the room's
`farmingReferee`), `js/net/jobs-core.js` (the generic job referee room-core calls — docs/EXPANSION-1.md "Jobs"),
`js/game/crops.js` (one InstancedMesh per look per field: crops, stubble / dug soil, seed furrows, wet soil with sprouts
that grow), `js/game/farm-play.js` (the page side: work strips under the mower / header / drill / spray bar, cells
change at once and go back if the room did not take them within 2.5 s, fill-up + sell asks, the HUD's farm line and
hints, the signs and the water tank, the map spots). In the old world (Sandbox / Flag Run) the plain wheat stays.
The phone's Jobs app: Farming → **Start** pins the farm yard; the level you are on shows the room's progress line.

## Emergency and haul jobs: fire, ambulance, patrol, tow, haul (Expansion 1 M7)

Five County jobs, each started from the phone (**Jobs → the job → Start**: the call comes in at once and a pin goes to
the station where its vehicle waits) or at the job's **station sign** (walk up and press **E**, or stop beside it in
the job's vehicle and press **T** / d-pad left / HITCH). Each job's vehicles wait at its stations, for anyone (`fixtures()`): a fire
truck at the Marrow Flats and Port Lindell fire stations, an ambulance at each hospital (+ a helicopter at Port
Lindell's), a patrol car at the Marrow Flats and Copperton garages (Port Lindell's garage has one on a pad, Highgate a
motorcycle), a tow truck in every tow yard, a Parcel Van at every freight depot, the tanker at Port Lindell's and a
flatbed at Copperton's and Highgate's (semis + box trailers stand on the depot pads). Calls are the room's: everyone in
the county sees the fires, patients, runaways and wrecks (map / minimap letters, a coloured beacon over yours) and can
help — **everyone who helped, rode along, or stood within 30 m is paid the whole amount** (rule 3). A call nobody
answers just goes away after 20-25 minutes; nothing ever costs gold.

| job | do this | pays (`data/jobs.json` pay) | levels (`need`) | upgrades (they change the play) |
|---|---|---|---|---|
| **Fire** | a hay stack, barn, grass patch, house or depot warehouse burns; its severity (1-10) climbs every 45 s left alone and grass spreads. Drive the fire truck there, **F** twice to the water cannon (or a friend rides it), aim at the flames and hold **fire**. Water that lands in it puts it out; the tank (≈15 s of spray) refills at any **hydrant** (red posts at every town gate) or fire station | base 60 + 40 per km (nearest fire station → fire) + 25 × the worst severity | 1 hay · 2 barn · 3 grass, out before it spreads past 40 m · 4 a house in town · 5 a severity-8 fire | Long-reach cannon (reaches 30 → 42 m, the stream flies further) · Bigger water tank (twice the spray) · Foam mix (puts fires out twice as fast) |
| **Ambulance** | someone is hurt: a car off a highway, a farm accident, a hiker on the Highgate switchbacks, a climber on the floor of Tollen Gorge. Stop the ambulance (or the helicopter) beside them — the crew loads them after 2 s — or get out and press **E** beside them. Drive gently to a hospital (Port Lindell, Highgate) and stop in the yard | base 50 + 45 per km, +25% if quick (no slower than 36 km/h + a minute), + up to 50% for a gentle ride (each hard bump — a jolt past ~1.8 g — takes a third of that off) | 1 any patient · 2 no hard bump · 3 the switchback hiker · 4 the gorge, by helicopter | Soft suspension (a bump has to be 50% harder to count) · Second stretcher (two patients at once) |
| **Patrol** | a runaway car tears along a county road (the Southmead road, the Highgate switchbacks, the gorge highway). Patrol car or motorcycle, **siren on** (fire), ram it: each hit fills its stop meter; boxing it in fills it too. At 100% it pulls over | base 80 + 4 per second under 2 minutes | 1 any runaway · 2 on the switchbacks · 3 a convoy of two · 4 a fast one on the gorge highway | Pursuit engine (the patrol vehicle you drive: +25% top speed) · Stinger strip (**T** / HITCH in a patrol car drops a strip behind you; a runaway that drives over it slows to 60% and its meter jumps 35%) |
| **Tow** | a broken-down car: on a road shoulder, in a ditch, on a mountain road's edge, or a broken-down semi. Back the tow truck's under-lift up to its front and press **T**; further off (up to 22 m) **T** runs the **winch**, which drags it in. Drive it into any tow yard and stop | base 40 + 50 per km (wreck → yard) | 1 shoulder · 2 ditch · 3 cliff edge · 4 the heavy truck | Strong winch (pulls twice as hard) · Heavy hitch (without it the tow truck crawls at 7 m/s with the semi on) |
| **Haul** | stop in a freight depot yard to load whatever your rig carries: **Parcel Van** = parcels to 3 stops in that town (yellow beacons); **semi + box trailer** (or the Trailhauler) = goods to the nearest other town's depot; **semi + tanker** = fuel to Highgate over the switchbacks; **semi + flatbed** = a machine (level 5: rocket parts) to the Skyreach launch site. Rough driving knocks the load's condition and crates fall off | (base 40 + 35 per km + 15 per tonne) × 60-100% by condition (never less) | 1 parcels · 2 box trailer · 3 tanker · 4 machine · 5 rocket parts | Air-ride trailer (bumps knock half as much) · Long-haul cab (the farthest depot instead of the nearest, ×1.3 pay; 5 parcel stops) |

**How it is built.** Pure rules + the room's referee per job: `js/game/jobs/{fire,ambulance,patrol,tow,haul}.js`
(+ `calls.js`, the shared plumbing: station signs, yards, the level step — one call is one level at most). Where things
happen comes from the map: `js/world/county/job-spots.js` reads the finished road network into `world.sites.jobSpots`
(crash / hiker / gorge patient spots, wreck spots by kind, the three runaway routes as 6 m polylines, parcel stops on
each town's streets). The runaway and the wrecks are real bodies in the room (`api.spawn`, nobody may sit in them); the
**runaway's driver runs on whichever machine simulates its body** (docs/PLAN.md: the owner simulates — the caller's at
first, the rammer's once they touch), follows its route with a little wobble, backs out when stuck, and reports the hits.
The page side is `js/game/work-play.js` (loading, jolts measured as the change of velocity over 0.1 s, the worst each
second; drop-offs, refills, the winch, the Pursuit engine on that body's own copy of the car's numbers, hints, the HUD
line, map spots) and `js/game/work-fx.js` (flames + smoke for every fire in two point clouds, beacons, signs, the
stretchers, stinger strips, hydrants in one instanced draw, the winch cable, falling crates). Tests:
`tests/jobs-m7.test.js` (every job's rules + referee: paid, co-op, far player not, refusals, the level chain, each
upgrade), `tests/job-spots.test.js` (the spots on the real map), `tests/jobs-m7-net.test.js` (a fire call through the
real server), `tests/jobs-m7.spec.js` (all five in the page, ?view=simple, + the HUD at 1280 / 402 / 360 px).

## The Rustwild: raider camps and vehicle combat (Expansion 1 M8)

The badlands in the county's south-east are **the Rustwild**, a combat zone: red on the map and minimap (dashed edge),
and crossing its edge says **"Entering the Rustwild"** / "Leaving the Rustwild". Inside it — and only inside it —
vehicles have **hit points** (the bar under the top-left readouts: "Ironback Tank 420 / 600"). Raider shots and hard
crashes (over 9 m/s, `(v − 9) × 7`, at most 90) take them away; at 0 the vehicle is **wrecked**: it smokes, it will not
drive, and the hint says to get out and call another from the phone's Garage (rule 2: nothing is lost — a wreck nobody
sits in is patched after 40 s, and a vehicle that leaves the zone is whole again). On foot the raiders shoot you too
(`js/game/health.js` `hurt`); knocked out in the Rustwild you come round at the **Rustwild Gate Garage** (just outside
the zone on the road in, "G" on the map) after 4 s, with full health. Its two Scrapper Buggies and a Trail Jeep are
anyone's to take.

**Five raider camps** ("R" on the map, grey once cleared), each with a **generator** (a box with two glowing coils and
the raiders' banner) and its defenders — **turrets** (up on scrap towers you can see over the shacks: they turn, wind up for a second, then lob a slow orange slug), **drones**
(circle you at 28 m and fire pink darts) and **raider buggies** (Scrapper Buggies that chase to ~22 m, circle you and fire
yellow bursts, and go home if led more than 260 m away). Every raider shot is slow and aimed at where you ARE, not where
you will be: keep moving and most of them miss. A camp is **cleared** when every defender AND the generator are down
(hp bars over hurt raiders; wrecks smoke). It pays `120 + 25 × defenders` (+200 for the fortress) to everyone who hit it
in the last 3 minutes, everyone riding with them, and anyone within 30 m of the last kill — each the whole amount — and
comes back 4 minutes later (never while someone stands in it).

| camp | job title | defenders |
|---|---|---|
| Redcut Camp | Scrap camp (the smallest) | 2 turrets |
| Saltpan Camp | Gun nest | 3 turrets, 1 drone |
| Dustjaw Camp | Drone yard | 1 turret, 3 drones |
| Scrapper Hollow | Buggy pack | 1 turret, 3 raider buggies |
| Ironbluff Camp | The fortress (generator 420 hp) | 4 turrets, 2 drones, 2 raider buggies |

**The weapons vehicles** (numbers in `js/game/combat-data.js`): Ironback Tank — the driver fires the main gun (shell, 90
+ a 7 m splash of 45, 0.6/s, 600 hp; clears Redcut alone in ~8 shells); Driftwing Hover Tank — the driver's bolt cannon
(34, 2.5/s, 380 hp); Trail Jeep and Scrapper Buggy — the GUNNER seat's machine gun (7, 6/s; 220 / 260 hp): the driver
has no gun, so a jeep needs a friend on the gun. Any other vehicle can drive in (160 hp) but cannot fight. Aim with the
camera (the crosshair shows for any seat with a gun), fire = left click / RB / FIRE (a tank driver on a phone gets FIRE
too). **Levels**: 1 clear any camp; 2 clear one without being wrecked; 3 three camps within 30 minutes; 4 the fortress;
5 all five within 45 minutes. **Upgrades** (kept forever): Armour plating (the vehicle you drive has 1.5 × hp), Quick
loader (every gun you fire shoots 1.5 × as fast), Second gun mount (the driver of a combat vehicle with no gun gets a
forward machine gun that leans toward the raider nearest straight ahead — a jeep alone can fight), Field repair kit
(once per camp: 60 % of the hp back, even on a wreck — G / d-pad right / the green REPAIR button). The phone's Jobs app:
Rustwild Raids → **Start** pins the gate garage.

**Who runs the raiders: the room** (docs/EXPANSION-1.md "Who simulates the raiders"). `js/game/jobs/combat.js` (the
referee) moves them (`js/game/combat.js stepCamp`, only for camps someone is within 340 m of), flies their shots and
decides what they hit (`stepShots`, segment against sphere), keeps every hit point, and sends `foes` snapshots 10 a
second (and every `shot` / `boom`) only to players within 650 m. The page (`js/game/combat-play.js`) draws them ~110 ms
behind like other people's vehicles, draws the room's shots on the same straight line, and reports its OWN guns' hits
(`hit { veh, to }`, `n: 1` for a shell's splash) — the room checks the seat has that gun, the raider is in range, and
the gun is not firing faster than it can. Effects (`js/client/combat-fx.js`): muzzle flashes, explosions, smoke and sparks
in two particle clouds (one draw call each) and the raiders' shots as one instanced mesh; turrets, generators and parked
buggies are solid (static / kinematic Rapier boxes). HUD: `js/client/combat-hud.js` + `css/combat.css`. The room's ground
heights come from a coarse 8 m grid of the Rustwild the county carries (`sites.rustwild.grid`; the room has no world).
Tests: `tests/combat.test.js` (rules + the referee in a room), `tests/combat-net.test.js` (real server, three clients),
`tests/combat.spec.js` (the page, desktop + 402 / 360 px phones).

## Wayfare Field, skydiving and fall damage (Expansion 1 M9)

**The airport.** Wayfare Field (south, the 1.1 km runway) has its hangars and tower from M3; now the Tundra Hopper and
the Skylark Helicopter wait on their pads, and the airport's own **Big Sky Lifter** (cargo plane, rear ramp) and two
**Soarwing Gliders** stand on the apron (`airportVehicles()` in `js/game/jobs/skydive.js` — job fixtures, parked like pad
vehicles, County only). The Dealer sells the glider (1,800) and the Big Sky Lifter (16,000). An orange **Jump Point**
sign floats over the jump building and the maps show it as **J**; the landing rings are **T**.

**A jump.** Walk into the orange ring at the Jump Point and press **E** (X / ENTER): a small menu — **Parachute jump**
(E / X) or **Glider** (F / Y; you need a glider of your own). The room puts you on the next plane: friends who board
within 6 seconds share it (`board` -> one flight). You stand in the plane's hold at 1,200 m (2,400 m with High drop)
while it flies a straight line over the county that passes over a **target ring** (`sites.skyTargets`: Southmead,
Vale Green, Copperfoot, Pebblerun). The ramp opens after 6 s; the light turns **green** when jumping now lands near the
target. Run out the back (walk off the ramp; when the plane reaches the end of its line it puts you out anyway).

| | keyboard | controller | phone |
|---|---|---|---|
| in the hold | W A S D walk (the camera turns it), Shift walk slowly | left stick | stick |
| free fall | W A S D drift / track (forward = faster, flatter) | left stick | stick |
| open the parachute | Space (or the **OPEN** button) | A | **OPEN** (right edge) or JUMP |
| canopy | A / D turn, W a little faster | stick | stick |
| flare (brake before touchdown) | hold S or Space (or **FLARE**) | hold LT or A | hold **FLARE** |

The parachute opens by itself at 140 m if you have not pulled it (forgiving). Free fall tops out at ~54 m/s (~60
tracking); the canopy flies ~8 m/s forward and sinks ~5.2 m/s; a flare is strong for about two seconds of pulling,
then spent until you let go a while — start it 3-4 m above the ground. The **glider** drop: you come out of the ramp
and your own glider is summoned under you, already flying (it is the ordinary `summon`, so you must own one); land it
on wheels.

**Pay** (`data/jobs.json` skydive; the room referees it, `js/game/jobs/skydive.js`): every safe landing (under 9 m/s)
40 gold; inside the 30 m ring up to +80 (closer = more), a bullseye within 5 m +40 more; the glider landed on Highgate
Plateau +80. Everyone within 30 m of your landing gets the same (co-op rule). The room refuses a landing that came
down faster than a free fall could. **Levels**: 1 a safe landing, 2 within 30 m of the ring, 3 the glider onto Highgate
Plateau, 4 within 5 m. **Upgrades** change the play: Sport parachute (turns twice as fast, flies faster, sinks slower,
a stronger flare), High drop (the plane flies at 2,400 m), Long-span glider wing (your own glider sinks slower and
glides further — your copy of its definition, `gliderDef()`).

**Falling off anything high** (a cliff over 60 m, out of the helicopter or the glider): you get a parachute too
(the same free fall and OPEN button, no pay).

**Health and fall damage** (docs/EXPANSION-1.md "Health", `js/game/health.js`): you have 100 health. Landing faster
than 9 m/s hurts `(v - 9) x 8`; faster than 22 m/s knocks you down for 3 s; at 0 you are knocked out and get up where
you are after 4 s with full health. Never gold or progress. It counts on foot everywhere — jumping off things, cliffs,
being thrown out of a crashing vehicle (the tumble, `walker.landV`), a hard parachute landing. The health bar (top
middle) shows only after you are hurt. The walker reports its hardest landing (`walker.takeLanding()`); the session
turns it into damage.

Files: `js/game/sky.js` (pure: the flight line and pose, the hold floor + ramp, free fall / canopy / flare physics,
scores, level goals, the glider upgrade), `js/game/jobs/skydive.js` (the referee: board / jump / land / sync, flights
shared for 6 s, fixtures, pay, levels), `js/game/health.js`, `js/game/sky-play.js` (the page: the plane drawn from the
flight data — every machine draws the same line from the room's clock; my hold position is in the plane's frame and
friends in the hold are drawn there through `on: 900000 + flight`; free fall, canopy model, rings, the Jump Point sign,
the glider drop, the high-fall parachute), `js/client/sky-hud.js` + `css/sky.css` (altitude, jump light, OPEN / FLARE,
health bar, the Jump Point menu), `js/client/sky-clips.js` (Chibi clips `skydive`, `canopy`, `flare`; `down` uses the
`dead` clip). County sites: `sites.skyTargets`, `sites.plateau` (`js/world/county/countygen.js`).

## Survey kits (Expansion 1 M10)

**Buy.** Every Supply store sells five survey kits, each bought once and kept forever (rule 2): **Weather Mast** (150
gold — a new player can afford the first one), **Seismic Probe** (400), **Signal Relay** (600), **Radar Dish** (700),
**Field Lab** (900). They are data in `js/game/survey-kits.js` (rules, pay, setup time, colour, letter) and rows in
`data/shop.json` under the same ids.

**Carry.** The phone's **Items** app → **Spawn** puts the kit's crate (an olive case with the kit's coloured band and
letter, a real prop: `kit_crate` in `data/vehicles.json`) down beside you. Tap **E** to pick it up; beside a vehicle with
a crate slot (`HOLDS` in survey-kits.js: Trail Jeep, Scramble Quad, Sandhopper Buggy, Trailhauler Six (two), Hookline
Tow Truck, Parcel Van, the utility and flatbed trailers) **E loads it into the back**, where physics holds it — drive
like a maniac and it falls out; walk up and pick it up again. The **Skylark Helicopter** slings it: hover over a crate
(less than 6 m above it, 16 m with the Long sling) and press **T**; T again drops it. One crate out at a time (two with
the Second crate slot); spawning another sends the oldest back to the store.

**Place.** Each kit wants a kind of spot, judged live as you carry it, drive with it or stand by it: a ring on the
ground under it and a readout at the top of the screen — green **Good spot — fair / good / excellent**, or red with the
reason in plain words ("Too low — 54 m up, it needs 60 m or more. Go higher", "Too near a road (32 m) — get 90 m away
from roads", "Not the top — the ground 17 m away is 6 m higher", "Too dry — set it up within 45 m of water, or in the
Elderwood", "Too close to another Radar Dish (210 m) — keep 500 m apart", "Too near the Survey Office").

| kit | wants |
|---|---|
| Weather Mast | higher than 70% of the land, under 24° of slope, not on water / ice / a road |
| Seismic Probe | flat (under 6°), 90 m from any road, firm ground (no mud, sand, snow, fields) |
| Radar Dish | a hilltop (nothing within 50 m more than 1.5 m higher, standing 4 m above the ground round it), higher than 45% of the land, 500 m from your other dishes |
| Field Lab | within 45 m of water, or in the Elderwood (the giant trees); under 12°; off the road |
| Signal Relay | 900 m from the Survey Office, on a rise, 150 m from any other kit |

**Set up.** Put the crate on the ground at a good spot and **hold E** (5-8 s, half with Quick setup): the room checks
you are on foot beside it, the crate is on the ground and has not moved, the hold was long enough and the spot passes —
then the crate unfolds into the kit (mast with wind cups, probe and its geophones, turning dish, ridge tent with a
bench of jars, lattice relay with a blinking light). It stays in the world for everyone in the room and is saved in your
profile (`profile.sites`), so it is standing again next session. E beside your own kit **packs it up** (back into its
crate where it stood). Up to 3 of each kit at once (2 Field Labs).

**Report.** Drive (or walk) into the **Highgate Survey Office** yard (map **O**): every kit you have set up and not
reported yet pays once — (kit base + per km from the office) × (0.75 + 0.5 × spot quality) — to you, everyone who stood
within 30 m while it was set up, and everyone with you at the office (in your vehicle or within 30 m). Each gets the
whole amount (rule 3). Then the level goals are checked.

**Levels** (`data/jobs.json` survey, goals counted over your REPORTED kits still standing): 1 First reading (a mast) → 2
Quiet ground (a probe) → 3 Three masts (each 400 m apart) → 4 Radar network (two dishes) → 5 Field lab → 6 Full survey
(one of every kit). **Upgrades** change the play: Quick setup (half the hold), Site scanner (the map and minimap mark
good spots for the kit you carry, `+` in green), Second crate slot (two crates out at once), Long sling (16 m of rope).

**How it is built.** `js/game/survey.js` is pure: `surveyGrid(world)` samples a place every 8 m (heights, metres to the
nearest road and water, ground kind, special areas such as the giant wood, the Survey Office, gravity) — 72 ms for the
County; the server builds it in `sitesFor` and the page builds the same one after its world (`js/client/main.js`), so
the readout's green is the room's green. `judgeSpot(kit, placeView(grid), p, { others, office })` runs the kit's rules
(`RULES`: high, slope, road, ground, summit, apart, near, office) and returns every check with its sentence and a quality.
The referee is `js/game/jobs/survey.js` (`kitBench(api, { place, grid, office })` is the whole machine — the Moon reuses
it); the page side is `js/game/survey-play.js` (crates, load, sling, the E hold, the ring, the set-up models, report at
the office, map spots) and `js/client/survey-hud.js` + `css/survey.css`. Tests: `tests/survey.test.js` (rules, referee,
levels, upgrades, the real County has spots for every kit), `tests/survey-net.test.js` (two clients through the real
server, a reconnect keeps the kit), `tests/survey.spec.js` (the page: buy, spawn, load, drive, green, hold E, report).

## The rocket, orbit, Lantern Station and the landing pod (Expansion 1 M11)

**Buying it.** The **Skyreach Rocket** is the dearest thing in the game (250,000 gold, `data/shop.json`); every Dealer
lists it, and the **Skyreach sales desk** by the launch control block at the Skyreach Launch Site (E there) opens the
Dealer too. The **Homeward Pod** comes with it (`includes` in the shop row — js/game/profile.js) and is never called: it
comes down from orbit. The rocket is summoned from the phone's Garage like anything else, but only from the launch site
(within 190 m) and only onto the launch pad; the room checks both (`spaceSummonRefusal` in js/net/room-core.js).

**The launch.** Get in (E): the commander's seat flies it, the second seat rides along (friends ride free). **W** (or
Space, or the red **LAUNCH** button) starts a five-second countdown that everyone aboard sees; at zero the engines light
and the launch assist opens the throttle lever to full over two seconds (hold **S** to ease off). **A / D** and the stick
(or Q / Z) tip it gently, let go and it stands straight up. Smoke boils off the pad, the camera shakes, the HUD (top
left) shows the height over the pad, the speed and the lever. At 900 m the **STAGE** button / fire separates the booster
(it falls away); at 1,500 m it goes by itself. The climb to **orbit, 3,000 m over the pad**, takes about 45 s.

**The orbit screen.** At 3,000 m the page sends `{ t:'space', step:'launch', id }`; the room checks the rocket really is
that high and that the sender is aboard, then puts **everyone in it** in orbit (`{ t:'orbit' }`, the rocket is gone —
call it again for the next launch) and gives them **Liftoff** + **Around the world**. The view fades to black and comes
back on the planet below with three choices (click / tap, or 1 2 3): **Dock at Lantern Station**, **Land on the Moon**,
**Return home**. Each is a `go` (js/game/space-play.js `travelMsg`); the Moon and the station are refused to anyone who
is not in orbit (or already up there).

**Lantern Station (zero-g).** You float in at the docking hatch. **W / S** puff you gently along where you look, A / D
sideways (at most 2.6 m/s); **Space** (A, **PUSH**) pushes off the nearest wall or rail toward where you look (3.4 m/s);
**E** (X, **GRAB**) grabs the nearest rail and holds you still, E again lets go. You drift on with only a little slowing
and bounce softly off the hull (`floatStep` in js/game/space.js: a ball against the hull's boxes, one axis at a time).
Friends float too (drawn with the `float` clip, js/client/space-clips.js). The rooms: Docking Port, Hub, Lab (a window),
Greenhouse (glass roof), Bunkroom, Airlock, and the **Observation Cupola** under the hub with the planet in its window.
Float through every room for **Grand tour**. **R** (d-pad right, the SPIN button when no handrail is near) turns a somersault; three in a row, each within 3 s of the last, earns **Zero-g somersault** (the room counts them: `step: 'spin'` in js/net/room-core.js). At the **docking hatch**, E opens a menu: **Head home** or **Go to the Moon**.

**The Moon** (its jobs: "Moon jobs" below): you land on **Greywatch Landing** beside a **Crater Crawler** (the room parks one by
the pad and four at the garage, place `moon`, `moonParking()`); gravity is 1.62 m/s² for vehicles and walking (the
walker scales its own gravity by the world's, so a jump goes ~4 m up). E on the pad: **Head home** or **Fly up to
Lantern Station**.

**Coming home.** Head home / Return home = `go` 'county' from up there: the room puts a **Homeward Pod** 2,600 m up over the
county between Wayfare Field and the launch site with you in its seat (`podHome`). It falls heat shield first at ~190 m/s; the screen edges glow through
reentry and fade as it slows (`heatTarget` / `heatStep`), the camera shakes, a dark trail streams behind. **W / A / S /
D** nudge it with small thrusters to pick a spot. The parachute opens **by itself** at a safe height for your speed
(`chuteHeight`: ~460 m at 110 m/s), or earlier with fire / Space / **CHUTE**; it settles at a walking-pace thump.
Touchdown earns **Splashdown? Touchdown**. **Get out any time** (E): in the air that is a bail-out (**Early exit**) — you
leave it falling and M9's high-fall parachute opens up for you (Space / OPEN).

| | keyboard | controller | phone |
|---|---|---|---|
| rocket: countdown | W / Space | RT / A | **LAUNCH** |
| rocket: tip / ease off | A / D, Q / Z; S | stick; LT | stick; BRAKE |
| rocket: booster | fire | RB | **STAGE** |
| station: float | W / S along the view, A / D sideways | left stick | stick |
| station: push off / grab | Space / E | A / X | **PUSH** / **GRAB** |
| pod: thrusters / chute | W A S D / Space or fire | stick / A or RB | stick / **CHUTE** |

**Places on the wire.** The room keeps `p.orbit` (in orbit, between the launch and the choice), `p.launched`, `p.pod`
(the pod you came home in, until touchdown or bail). `{ t:'space', step }`: `launch` (above), `touchdown` (your pod is
on the ground and still), `bail` (you left it in the air), `lap` (a lap of the station). `go` to 'sky' from the Moon or
the station is refused (the pod is the way home). The page (js/client/main.js): `orbit` -> the orbit screen
(js/client/orbit-screen.js, its own little scene: js/client/world-view/space.js's planet + the upper stage); `go` to a
place on another map (the station, the Moon, home from them) -> the session ends, the world is built, a new session
starts on the same connection with `arrive: { place, at, pod }`; the sky and the pod home from orbit share the county's
world, so nothing is rebuilt. A session takes its own `net.on` handlers off again when it ends, and `net.last` starts
over at every `go` (js/net/client.js).

Files: `js/game/space.js` (pure: the numbers, launch phases, countdown, assist, staging, the choices, arrivals, the
Moon's parking, the pod's start, the reentry glow, the chute height, zero-g floating, the lap), `js/game/space-play.js`
(the page: countdown + assist + staging + orbit, floating, the pod, the travel menus, the sales desk, smoke, shake, the
far plane), `js/client/space-hud.js` + `css/space.css`, `js/client/orbit-screen.js`, `js/client/space-clips.js`.
Tests: `tests/space.test.js` (pure), `tests/space-room.test.js` (the referee, two players in one rocket),
`tests/space.spec.js` (the whole trip in the page, desktop + 402 + 360 px).

## Moon jobs: samples, crater jumps, supply runs, kits on the Moon (Expansion 1 M12)

**Moon Work** is the Moon's one job (`data/jobs.json` row `moon`), hidden ("Requires: launch the rocket") until the
rocket has flown. Everything is done in the **Crater Crawler** (the room parks one at Greywatch Landing and four at the
Rover Garage); co-op as everywhere: the driver, whoever rides in the other seat and anyone within 30 m get the whole pay.
The phone's Jobs app shows it once it is found; **Start** on the Moon asks the room where to go first and drops a pin.

- **Sample runs.** Seven sample sites each hold three **glowing samples** (cyan = common, violet = uncommon, **gold =
  rare** — the floors of the steep Orrin and Vandry craters). Stop beside one and press **T** (d-pad left, **HITCH** on a
  phone): the arm takes it and it rides in the bin behind the seats, where you can see it. On foot, hold E beside one
  with a rover parked close. Stop at the **Sample Drop** at Greywatch to hand the bin in: each sample pays
  `(sample + km x per_km) x rarity` (common 1, uncommon 1.6, rare 2.6; km = the site to the drop). A taken sample
  grows back after 3 minutes.
- **Crater jumps.** Two **Hopper Ramps** north of the base and four ramps on crater aprons aimed into the bowl. Leaving
  a ramp's lip is reported (`launch`) and the room times the air itself; touching down (`land`) is measured from the
  lip. Pay = `(base + air s x per_s + metres x per_m)`, x1.5 landed upright, plus a bonus for landing upright inside the
  ramp's orange **landing ring** in the crater bowl (cyan rings past the practice ramps). The same ramp again within a
  minute pays half. A full-speed run at a Hopper Ramp flies ~48 m.
- **Supply runs.** Stop in the **Greywatch supply yard** (in front of the Rover Garage) and crates load; drive to
  **Farside Depot** (over the rille and past the ridge, ~1.6 km) and stop: paid per crate. At Farside the return load is
  **ice cores** for Greywatch. A hard jolt (a jump's landing, a rim taken flat out — over 30 m/s² in a tenth of a
  second) bounces a crate out: it lies glowing where it fell; stop beside it and it loads again (forgiving — the run is
  just no longer "clean").
- **Moon survey.** M10's survey kits work on the Moon (the same kit machine, `kitBench`, over the Moon's own grid —
  `moonSurveyGrid`: craters and the base are the special areas, **Greywatch Base** is the office). Spawn a kit's crate
  from the phone, carry it in the rover, set it up and report at Greywatch. The four named survey spots each suit a kit:
  a Seismic Probe on **Hush Flat**, a Weather Mast / Radar Dish / Signal Relay on **Lumen Crest** or **Orrin Rim**, a
  Field Lab in **Kestle Basin**.

**Levels** (each pays its own bonus): 1 three samples · 2 a 40 m jump · 3 a crate to Farside · 4 a survey kit on the
Moon · 5 a rare sample · 6 a ring landing · 7 a clean round trip (supplies out, ice cores back, nothing dropped).
**Upgrades** (kept forever, each changes the play): **Big sample bin** (6 samples a run), **Crater lamp and strong
motor** (x1.45 force, x1.3 top speed — it climbs crater walls and jumps ~68 m — a spotlight for the dark side of
craters, and the arm reaches 11 m instead of 6), **Mesh wheels** (x1.3 grip in the dust), **Jump booster** (Space / A /
JUMP in the air gives one extra push per jump), **Crate rack** (three crates, strapped down: only a real crash throws
one). **Achievements** (hidden until the launch): Moon rock, Deep find, Low-gravity leap (40 m), Moon hang time (7 s),
Hole in one, Down the Silverthread (the rille end to end — the room follows the driver along it), Farside delivery,
There and back, Moon science.

**On the Moon** the wheels throw dust that arcs up and falls slowly (`view.kick`, a few points per wheel). The rover is
tuned for 1.62 m/s²: 12 m/s top, and `tests/moon-feel.test.js` drives it flat out across the Moon (about one tip-over
in 1.9 km of boulders and crater rims; it rights itself) and off a Hopper Ramp.

**The room.** The Moon's job sites reach the room as `sites.moon` (`moonJobSites(moonWorld)` — the server builds them
with the County's sites; solo, the page adds them the first time it builds the Moon). Wire (`{ t:'job', id:'moon',
step }`): `sync`, `start`, `grab { veh, n: rock }`, `drop { veh }`, `load { veh }`, `jolt { veh, n }`, `pick { veh, n }`,
`launch { veh, n: ramp }`, `land { veh, p, on: upright }`; room -> page: `rocks`, `bins`, `loose`, `jump`, `delivered`,
`order`, `prog`. The page's survey glue keeps speaking as job `survey`; on the Moon jobs-core hands those steps to the
Moon referee (`claims: ['survey']`), which answers as `survey` (`sendAs` / `castAs`). Refused: dropping samples never
collected, a grab out of reach, a landing that was never off a ramp or that does not add up (distance vs air time), crates
to the wrong yard, a passenger loading, anything before the launch.

Files: `js/game/jobs/moon.js` (pure rules + the referee), `js/game/moon-play.js` (the page), `js/game/moon-fx.js` (glowing
samples, cargo on the rovers, loose crates, rings, beacons, the booster puff, the lamp). Tests: `tests/moon-jobs.test.js`
(rules + referee), `tests/moon-jobs-net.test.js` (three friends on the Moon through the real server),
`tests/moon-feel.test.js` (physics), `tests/moon-jobs.spec.js` (the page, desktop + 402 + 360 px).

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
* **Farm and work vehicles** (Expansion 1 M5) added five data keys, all read by `js/phys/vehicle.js`:
  * `tyre.soft` 0..1 — on a soft surface (`sink > 0`: mud, farm, sand, snow, shallows) the tyre shrugs off that share
    of the grip loss and drag. Keep `susp.travel` well over the rest compression + the surface's sink (mud 0.12), or
    the cast loses the ground in mud: the tractor's first 0.18 m travel bottomed out and stalled every 25 m.
  * `mower` `{ speed, drop, p, hw, hd }` — a deck with no body of its own, 0 raised .. 1 down, moved by `input.lift`
    (Space up, Shift down), carried in the fork-height slot of the network state (so remote copies draw it). The
    session keeps the room act `mower` in step (on above 0.9, off below 0.5); `p/hw/hd` is the cut strip for farming.
  * `tip` `{ door, pivot, angle, speed }` + parts with `tip: true` — a tipping bed: while door `tip.door` is open the
    tip parts' colliders TURN about the pivot a little each tick (they are never swapped in one go: a bed that appears
    tipped under a load shoves the crates through it and threw the trailer over). Runs on every copy.
  * `towAny` — this vehicle also hitches any `car` with no `hitch` by its front bumper (`frontHitch`: the middle of the
    chassis box's front face); the tow point sits higher so the car's front wheels lift, joint contacts off.
  * `work` on a trailer (`door_sow`, `door_spray`, `door_bed`) + seat act `tow_work` on the puller: fire in that seat
    sends `{ t:'act', id: <trailer>, what: work }`. The room only lets a player flip a vehicle's switch when seated in
    it — or, for `door_*` acts, standing within 10 m — so the work switches are named `door_*` and the tractor driver,
    a few metres from the hitched trailer, may flip them with no change to the room (js/net is untouched). Farming
    reads `ents.get(trailer).acts[work]`; a trailer with a door of that name (the produce trailer's tailgate `bed`) also
    moves it.
  * Two-wheel trailers need a front `leg` wheel (a jockey wheel / stand foot 5 cm off the ground when level), and a
    trailer's `chassis.com` is in the CHASSIS BOX's frame (it is added to `chassis.p`): the produce trailer first sat
    nose-up and crept backwards because its centre of mass was behind the bogie.

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

* **Expansion 1 M2 — co-op backbone** (spec: docs/PLAN.md "Net contract additions, Expansion 1 M2"): every player has a
  saved **profile** (gold, owned vehicles / clothes / items / kits, look, job levels, achievements — `js/game/profile.js`),
  kept on the server per account or device (`server/profiles.mjs`, `<data>/profiles.json`) and in localStorage
  `roverlands.profile` solo; the room is the only thing that changes it (`buy` priced from `data/shop.json`, `grant` /
  `payJob` for job referees — each helper gets the whole pay). Every player and body has a **place** (`js/net/places.js`:
  county, sandbox, moon, station, sky) and the room only tells you about yours; `go` moves you; `summon` calls one owned
  vehicle within 25 m. New mode **County** (first on the title) builds `generateWorld({ seed, map: 'county' })`. The HUD
  shows gold on its own row under the flag box.

* **Expansion 1 M4 — phone, gold, shops, wardrobe, job registry** (spec: docs/PLAN.md "Net contract additions, Expansion 1
  M4"): the **job registry** (`js/game/jobs/registry.js`, pure: levels open in order, hidden jobs, pay per level, upgrades,
  the Jobs checklist, where Start points) and **achievements** (`js/game/achievements.js`, pure: counts, events, the hidden
  rule) are run by the room: new messages `upgrade` (buy a job upgrade), `stats` (driven metres, capped by time; city
  visits) -> `ach`; `core.jobDone(pid, job, level, …)` pays everyone in the job vehicle and records each one's level. In
  County rooms you wear only clothes you own: the room swaps the rest out (`profile.js stripLook`, never a refusal) and
  says so (`look`).

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
  out, Leave). **Report a bug** lives in that menu only — no floating "!" button (game standards, 2026-11-06) — and
  sends text + a picture + debug: screen, room, network, `getDebug()`, device, recent errors. The ☰ owns the
  top-right corner; Escape / Start opens it and the arrows / d-pad walk it.
* **HUD**: flag line + run clock + best (top-left, from the room's own messages), speed, seat hint, toasts, banners, a
  round **minimap** under the corner buttons that turns with the camera, the connection dot, the spectator bar.
  **Map** (M / Back / ☰ / tap the minimap): pan + zoom with mouse, touch (pinch) and controller (stick, triggers),
  legend, place a pin (A / Enter / tap) shared with the room.
* **Vehicle rating card** after leaving a vehicle you drove for 60 s+ (once per vehicle per visit): 👍/👎 + reasons
  that say what kind (Grippy, Fun to jump… / Floaty, Slides too much…) + "Tell us more" -> `{ t:'rate' }` -> insights.
* **Phone controls** (`touch.js`): a stick under the left thumb, drag right to look, pinch for camera distance, GAS /
  BRAKE / JUMP / ENTER / FIRE / SEAT buttons (which show depends on `ui.touch.mode()`), HITCH and FLIP only while
  they would do something (`ui.touch.hitchable()` / `flippable()`). A seat that does not steer (gunner, passenger) has
  no stick: the whole screen aims / looks (a controller's left stick aims there too). Every button sits in the
  bottom-right corner; the page cancels `touchstart` on the controls and has `user-select: none` +
  `-webkit-touch-callout: none` so iPhone taps never raise the selection loupe or copy menu (`tests/ui.spec.js`
  "phone controls").
* **Controller in every menu**: Knockabout's `nav.js` focus ring; d-pad / stick moves, A presses, B backs, Start /
  Back open the menu / map in a game; arrows / Enter / Esc on a keyboard.
* **Phone** (`phone.js`, Expansion 1 M4): **P**, controller **LB**, the phone button beside the gold, or ☰ → Phone. On a
  phone it fills the screen; on a desktop it is a phone-shaped panel (the layer scrolls, never a box inside it). Apps:
  **Garage** (every owned vehicle with a picture of the real model — `js/client/thumbs.js` draws each once into an
  offscreen target of the game's renderer — and Summon: `js/game/summon-spot.js` finds the nearest flat, dry, clear spot
  within 25 m, a road if there is one; refused in Flag Run and while driving faster than 12 km/h), **Wardrobe** (the look
  editor with only owned clothes in the clothing slots — Knockabout's builder takes an opt-in `limit`), **Items** (owned
  items + kits; empty for now: says to buy at a Supply store), **Jobs** (every job with its level; hidden jobs show `???`
  + their "Requires" line; a job's page: levels ✓ / open / locked, upgrades bought with gold (`upgrade`, asks twice),
  Start = a waypoint pin at the nearest place for that job), **Map**, **Awards** (achievements, hidden ones locked with
  their "Requires" line; a **Jobs checklist** tab: every job's levels done at least once, obscured if not found),
  **Settings**. B / Esc: app → home → closed.
* **Shops** (`shop.js`): County towns have a Dealer (the garage), an Outfitter and a Supply store
  (`world.sites.shops`). A floating name over each door (`js/client/shop-signs.js`), a lettered marker on the minimap and
  the map; walk up and press **E** ("E — Open the Dealer"). **Dealer**: every vehicle with its picture and price, Owned ✓,
  the rocket listed as coming soon; **Outfitter**: clothes by slot, your own face wearing the piece (hats, tops, glasses,
  scarves) or a swatch, filters per slot; **Supply**: items + kits (the survey kits are listed as coming soon). Buying
  over 100 gold asks twice. Toasts: "+12 gold — Farming · One field", "Bought: …", "Achievement: Ring ring — …".
* `dev.html` + `dev.js` — the screens on their own over a flat painted stand-in (no 3D), used by `tests/ui.spec.js` and
  `tests/phone.spec.js` (it has stand-in County shops and places).

### Tests
`npm test` (node): `protocol`, `room-core` (every referee rule), `net-room` (the real server on :8555 with the game's
own client: two players, seats, handoff, bump relay, break dedupe, flag run, reconnect, host leaving, junk + rate
limits, solo loopback), `static-allow`. Playwright (from the playground root, under the lock):
`flock ~/claude/agent/roverlands-pw.lock npx playwright test prototypes/roverlands/tests/ui.spec.js` — its own server
on :8556; desktop + phone; title, solo HUD, menu, settings, how to drive, map + pin, report, rating, look editor,
host -> invite link -> Find a game -> vote-kick / remove -> start -> spectate; zero console errors; pictures in
`tests/shots/` (git-ignored).
`tests/skydive.test.js` (node, M9: fall damage maths, health states, the flight line, the hold, free fall + canopy +
flare numbers, every upgrade changing the play, scoring + level goals, and the referee in a room: two friends on one
plane, both paid, a far one not, too-quick landings refused, the glider needs owning, the plateau level, High drop) and
`tests/skydive.spec.js` (Playwright on :8557, the real page `?view=simple`: Jump Point -> hold -> ramp -> free fall ->
OPEN -> circle down -> flare -> landed on target + paid + level 1; fall damage from a ledge and a cliff, knocked out
and up again; phones at 402 and 360 wide: altitude + OPEN reachable, tapping it opens the canopy).
`tests/farming.test.js` (node, M6: fields, the cell life, snapshots, upgrades, goals, and the referee in a room: co-op
batch pay, refusals, the level 1 -> 2 -> 3 chain, the harvester's hopper, every upgrade in play, jobs-core alone),
`tests/farming-net.test.js` (the real server on :8559: three clients, one cut step seen by all, paid to the driver + the
passenger and not the far player, a newcomer's snapshot) and `tests/farming.spec.js` (Playwright on :8558, the real
page `?view=simple`: cut -> plant -> water -> sell with the yard's machines, waits on state; the field + Jobs app at
1280 / 402 / 360). `tests/m4.test.js` (node: registry, achievements, the wardrobe rule, the summon spot, the room's upgrade / jobDone / stats /
look strip) and `tests/phone.spec.js` (Playwright, its own server on :8557: the phone at 1280, 402 and 360 wide, every
app, a Dealer buy, the Wardrobe offering only owned clothes, hidden jobs obscured, keyboard + controller reaching every
app; plus the real game page summoning the owned jeep beside you).


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Roverlands** (2026-10-25 →): co-op vehicle game — Flag Run (drive out, get out, grab the flag, drive it home, timed) + Sandbox, Chibi 2.5 drivers with vehicles sized to them, 1.5 km world (10 biomes, river with fords + bridge, switchback mesa, mud, dunes, snow, farm, runway). **Rapier 0.21** (`vendor/rapier/`); every body is simulated by its OWNER's browser, the server (stable :8550/https :8552, dev :8551/:8553) only relays + referees. LIVE at https://roverlands.games.radgh.com/ with all 23 vehicles (jeep, bikes, bicycle, quad, buggy, sedan, tank, hover tank, heli, plane, rocket car, forklift, army truck, fire truck, ambulance, patrol car, semi + 3 trailers + utility trailer, harvester); T hitches trailers. **Expansion 1 "Wayfare County" (2026-11-10, `docs/EXPANSION-1.md` M1-M13)**: Chibi 2.6 humans only, a 3 km county map (Sandbox kept), gold + phone + shops + wardrobe, farming, fire/ambulance/patrol/tow/haul, Rustwild raider camps, Wayfare Field skydiving + glider + fall damage, survey kits, rocket → orbit → Lantern Station (zero-g) → landing pod, the Moon + Crater Crawler + Moon jobs, 48 achievements + a Jobs checklist on the phone; pure job rules in `js/game/jobs/*.js`, one referee `js/net/jobs-core.js`. Read `docs/PLAN.md` + README first; checklists `~/claude/agent/roverlands-checklist.md`, `roverlands-expansion-checklist.md`

**Status / key files:** all vehicles live 2026-10-25; Expansion 1 2026-11-10
