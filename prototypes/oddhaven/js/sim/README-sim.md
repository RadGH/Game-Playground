# Oddhaven sim

The town, pure and seeded. No clock, randomness, DOM, three, Rapier or sockets; every import is a relative file, so it runs
in a module Worker, a Node room and `node --test` unchanged (`tests/sim/purity.test.js` enforces all of it). Time and
speed come from outside: `tick()` is one more quarter second and nothing else.

Tests: `node --test prototypes/oddhaven/tests/sim/*.test.js` (about 30 seconds). Town interface: `town-api.md`.
Tuning: `data/balance.json` (a test fails if any number in it is read by nothing).

## Use

```js
import { createSim } from './js/sim/index.js';
const sim = createSim({ seed, data, town });        // new world; data = fetchData(url) or the five data/*.json
const sim = createSim({ data, town, save });        // from sim.save() text
sim.tick([commands]);                               // one tick, 4 a second at 1x
sim.drainEvents();                                  // what happened since last asked
sim.state; sim.t; sim.clock; sim.hash();
sim.save(nowMs); sim.catchUp(realMsAway);           // catch-up is background only, capped at saves.catchUpDays
sim.positionOf(id); sim.needsOf(id); sim.routeById(routeId);  // reading never changes the state
```

`audit.js` has `problems(sim)` and `createStuckWatch(sim)`: the same health check in node tests and in the Worker (`health` message).

Speeds are 0, 1, 2 and 4 (`driver.js`); `setTestSpeed` is any multiple, for tests. Premades (`data/premades.json`) take the first households in town. In the page, use the Worker (`worker.js`, protocol at the top of the file); `driver.js` is what a Node room would use.
`snapshot.js` has `createMirror()`, the client half of the delta protocol, plus `rosterOf` and `inspectPerson`.

## Commands

| kind | fields | |
|---|---|---|
| `focus` | `points: [{x,z}], party: [ids]` | camera centre(s) and who is always L0 |
| `order` | `who, order` | Direct, queue of 3: `{kind:'go',place}` `{kind:'use',action,place?}` `{kind:'chat',person}` `{kind:'home'}` `{kind:'work'}` |
| `cancelOrders` | `who` | |
| `autonomy` | `household, level` | `off`, `essentials`, `full` |
| `flipCar` / `clearCar` | `trip` | client reports a car on its roof / righted before the timer ran out |
| `placeObstacle` | `edge, pos?, len?, dir?` | a parked truck; `dir` 0 both ways, 1 a to b, -1 b to a |
| `clearObstacle` | `id` | ids count from 1 in order placed |

M2, in `control.js` (every one takes `owner`, default `solo`; a room stamps it):

| kind | fields | |
|---|---|---|
| `take` | `who, x?, z?, h?` | stop deciding for them; from any state. Emits `took.done`, with `live` if they were driving |
| `partyAdd` | `who` | the same, as a follower (`control.partyMax`) |
| `release` | `who?` | hand back one, or everyone the owner holds; emits `recap`, `car.back` or `car.gone` |
| `releaseAll` | | everyone (loading a save made mid-play) |
| `pos` | `people: [[who,x,z,h,edge?,fwd?,at?]], cars: [[id,x,z,yaw,v,edge?,fwd?,at?]]` | from the browser that runs them. `edge` = the lane they are on, which is what traffic reads |
| `carIn` / `carOut` | `who, car` | seats are `control.carSeats`; a full car emits `car.full` |
| `summon` | `car, x, z, yaw` | a parked household car comes out, driverless |
| `swap` | `who` | the party's front person changes; one car, the two swap seats |
| `liveAdd` / `liveDrop` | `model` / `id` | the free test car, so it counts to traffic too |
| `rideOut` | `who` | a player riding as a passenger asks the driver to pull over; `ride.out` when they are out |

M3, in `wiring.js`: `press` `{ who, building, thing }` and `plate` `{ who, building, thing, on }`, within `control.pressMeters` of the thing. `pos` rows gain `lv, inside` (floor, place id). `take` from a room puts them at their spot, with `lv`.

M4: `work` `{ who, verb, tree?, bench?, cart?, q? }` is a player's hands on the timber chain (`swing pick drop pull load unload`, work.js). `setJob` `{ who, job }` takes an opening. `mailRead` `{ household, id }`. An `order` may be `{ kind:'stir', person, stir }` with `stir` one of `data/stir.json`'s kinds. Worker and room also answer `{ type:'phone', household, who }` with `{ type:'phoned', phone }`.

M5: `fire` `{ who, verb, room?, secs?, door?, q?, person? }` is a player's hands on a fire (`hose hook spray force lift drop`, fire.js). `startFire` `{ building, room?, cause?, who?, noCall?, jam? }`, `ringNow` `{ building }` and `printSheet` are for tests. Things in the wiring gain `detector`, `sprinkler`, `extinguisher`; `press` works the extinguisher. A `take` works from every fire state.

A bad command never throws; it emits `cmd.refused`.

## Events

From `drainEvents()`, each `{ kind, t, ... }`. `act` (L0 only), `talk {a,b,tone}`, `car.reset {trip,reason,s}`, `order.done`,
`order.failed`, `obstacle`, `cmd.refused`. These also go in the saved, capped log `state.log`: `tow`, `bills`, `late`,
`promoted`, `mishap`, `quarrel`, `friends`, `hardship`, and from M5 `fire.start`, `fire.call`, `fire.out`, `engine.out`, `engine.there`, `trapped`, `rescued`, `injured`, `discharged`, `rehoused`, `home.again`, `repaired`, `story`. `moment { m }` and `sheet { no }` are only drained.

## Being played (M2)

A held person has `trip: {mode:'held'}`, `wake: NEVER` and `p.hold`; their needs keep falling. `s.held` lists them, `s.live` lists cars off the
rails. Live rows and held people on a lane are blockers in `traffic.js`: same gap rule as a car in front, same 20 s reset, and
`obstacleAhead` takes a reset car past them. Hand back: on a lane, a live car becomes a trip on a route that starts on that road
(`@edge:f>node`, `roads.routeAlong`, never doubles back); off a lane it fades onto the nearest road. On foot: within `doorMeters` of a door
they are there; otherwise a walk trip with `ox, oz` from exactly where they stand. Anyone in the back rides (`trip.mode 'ride'`, `trip.riders`).
`p.diary` keeps the last few things everyone did. `room.js` runs all this for several clients with the Worker's messages.

## Indoors (M3)

`planInterior` (interior.js) turns a footprint and a trade into rooms, doors, furniture, slots and standing room: pure, seeded, retried until `validate()` is happy. `interior-nav.js` finds ways round
it; the sim uses it only through the plan's own check, the page to walk people. A place holds `spots` (slot kind -> indexes into `plan.slots`, for its unit) and `floor`.
`act.spot` is who stands where (spots.js): >= 0 a slot, < -1 a place on the floor, -1 the line at the door (`act.q`), null outdoors. `c.occ` is the map behind it, rebuilt on load, never saved; the audit fails if two people hold a spot.
A home's `work` slot is its desks, chairs and sofa. A busy slot: they stand and wait `autonomy.waitMinutes`, `waitTries` times. An action with `then` is followed by that action (cook, then eat), and is scored as the two together. `sometimes` actions go on the step `autonomy.outdoorChance` of the time.

Wiring (`wiring.js`, `data/wiring.json`): a thing fires an event, a wire turns it into toggle / set / pay. `s.mech[building]` holds only what differs from the plan's defaults. Timers follow a place's hours; gates fire when all their conditions hold. People near the camera press the same light switches.

Saves: v3 adds `s.mech` and act spots. A v1 or v2 save is upgraded on load and everyone indoors is given a spot (`tests/sim/indoors.test.js` loads a real one, `tests/fixtures/save-v2.json.gz`).

## Jobs (M4)

`work.js` runs a chain on `s.sites`; `c.town.timber` is the layout. A worker has `p.sh` (the open shift), `p.task`, `p.wpos`, `p.carry`. `p.sh` splits a shift into the sim's ticks and a player's, and clockOut pays each its own way. `site_work` is the outdoor action a chain worker holds; it has no slot, so a crew can be any size. `p.run` is a truck run: the shift stays open while the driver is off the site. `chainProblems` (in the audit) proves the books every check. A company truck is a car in `s.cars` with `company: true`, `base`, `load`; it is not on the household's list.

Saves: v4 adds `s.sites`, `s.crew`, `h.mail`, `h.book`, and the two timber places on the END of the places list, so older ids keep their meaning. A v3 save moves its loggers and sawyers to the real site, and two sawyers become drivers (`fitV3`). `tests/sim/wage.test.js` loads a real one.

## Fire (M5)

`s.fire` holds fires, calls, the sparse burnt table and the repairs (top of fire.js). `c.burning`, `c.burntSlots` and `place.fireShut` are rebuilt by `refreshFire`, never saved. A person on a call has `p.call`; on the scene their act is `fire_work`, with `p.task`, `p.wpos`, `p.wlv`, `p.legs`, as a timber worker's. Trip mode `aboard` = riding in an engine a player drives. Fires roll hourly off a hash, so they never touch `s.rng`. Trips can carry `siren` and `model`; `trip.yield` is a car pulled over. `fireProblems` is in the audit.

Saves: v5 adds `s.fire`, `s.moments`, `s.news`, `s.sheets`, `h.story`, and the engines on the END of the cars list. A v4 save gets all of them on load (`tests/fixtures/save-v4.json.gz`).

## People (M6)

`s.social = { bonds, threads, done, meets, th, m }` (top of social.js and threads.js). `c.partner`, `c.foes`, `c.booked` are rebuilt by `refreshSocial`, never saved. `p.rl` = when the race's want was last met, `p.sp` = spell ready at, `p.hu` = hushed until. Rolls are hashes, so threads do not touch `s.rng`. An order may be `{ kind:'cast', spell, person? }`; `{ kind:'meet' }` is the sim's own. Command `cast` `{ who, spell, target?, near? }`. Worker and room answer `{ type:'facts', a, b }`. Events: `scene.start`, `scene.done`, `scene.off`, `spell`, `spell.wait`, `moved.in`, `recruited`. Snapshot rows gain `mw` (bits: 1 in love, 2 feud, 4 lonely, 8 worn out, 16 hushed) and `stage`; `snap.sky`, `snap.signs`.

Saves: v6 adds `s.social`; a v5 save's couples become married bonds, and `p.couple` a dating bond (`tests/fixtures/save-v5.json.gz`). An empty household (everyone married out) stays in the list with no members and no bills.

## How it works

- **One record, three cadences.** A person holds where they are (`at` place, or a `trip`), what they do (`act`) and when they
  next need attention (`wake`). Position is worked out from the trip, never stored. A level is one number that decides how
  often someone is looked at and how the next thing is picked: L0 and L1 score actions (`people.js` `pickUtility`) and can
  be pulled out by a critical need; L2 reads the day's blocks (`pickSchedule`). So a level change has nothing to copy.
- **Needs are lazy** (`needs.js`): worked out in closed form when somebody looks, so background people cost nothing in between.
- **Traffic** (`traffic.js`): every drive at every level is a trip with `route, s, v`. Gaps on each directed road, one car at a
  time through a junction, and the reset rule: flipped or not moving for 20 s means reappear past whatever stopped it, keep
  going, tow invoice. That rule is also what makes gridlock impossible.
- **Money** (`economy.js`): only `earn` and `charge` move it, and both write a ledger, so the books are testable. A household
  cannot go below zero; a charge it cannot meet is a logged hardship grant. Rent is capped against income when the household
  is made, and the autopilot test asserts no grant is ever needed.
- **Speed** lives only in `driver.js`. It runs more ticks, and it holds 1x while someone has control.

## Not here yet

Buses, memories, relations beyond the six numbers. `job.physical` is read only for the timber jobs and the brigade.

## M8

`room.js` adds seats, parties, permissions, votes, shared lines, the `pos` relay (top of the file). `transfer` `{ who, from, to, as?, at? }` is written by the room only; events `owner.moved`, `car.owner`, `car.left`, `party.over`. `carIn` reads `crew` and `noWheel`, `summon` reads `comp`, `addPerson` reads `guest`: all stamped by the room. `sim.apply(cmd)` runs a command between ticks; `driver.commandNow`, `setAgreed`, `tap`, and `addClient(send, { busy, focus })` (a client that is busy skips snapshots and gets the news later; `focus` limits what it is sent to what is near it). A command that throws is refused, not fatal. `protocol.js` is the message check. Save v8 adds `s.guests` (`tests/fixtures/save-v7.json.gz` is the real old save).

## M7

`addPerson`, `editPerson` (newcomer.js), `wear` { who, wear, indoors } (wardrobe.js). Events `person.added { row, house }`, `person.edited { row }`. Log `newcomer`. `p.wear` is one of WEARS; snapshot field `we`. Save v7.
