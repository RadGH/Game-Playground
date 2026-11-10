# Roverlands Expansion 1 — "Wayfare County" (plan, 2026-11-09)

Owner request (verbatim in `~/claude/agent/roverlands-expansion-checklist.md`). The short version: **driving is the
point of everything.** A new big map with cities and real terrain; jobs that pay gold for driving the right vehicle well;
gold buys vehicles (summoned from a phone), clothes and equipment, all kept forever; an airport with skydiving; a combat
wilderness; KSP-style survey equipment; a rocket to orbit, a space station and the Moon with its own rover and jobs;
achievements and a jobs checklist. Chibi 2.6 and co-op come first. The old world stays as **Sandbox** (and Flag Run).

Read `docs/PLAN.md` first — its contracts (owner-simulates authority, room-core referee, pure world gen) still hold.
This file adds to them; where they disagree, this file wins for expansion work.

## Rules this expansion never breaks

1. **Driving first.** Every job is done *with a vehicle* (on foot only for the short bit at either end: grab, set up,
   jump out). A job that can be done better on foot is a bad job.
2. **Bought = kept.** Nothing bought is consumed or destroyed. A wrecked or lost vehicle is just summoned again.
3. **Co-op everywhere.** Every job works with friends: anyone riding in or helping with the job vehicle gets the pay
   (each player gets the full amount — gold is not split, it is a co-op game). The room referees job steps.
4. **Same code solo and online** (room-core in the page through loopback, on the server online).
5. **Every job has levels.** Level N unlocks once level N-1 is done once. Upgrades are bought with gold and change how
   the job plays (bigger field, longer hose, faster seeder), never just a number on the payout.
6. **Forgiving.** Fall damage knocks you down and costs a few seconds, never your progress. Nothing takes gold away.
7. Original names only. No "ember", "veil", "muster", no real brands, no other game's names in anything a player sees.

## Milestones

Ordered by priority (owner: "prioritize Chibi 2.6 and co-op"). Each is published when its tests are green.

| # | Milestone | What the player gets | Depends on |
|---|---|---|---|
| **M1** | **Chibi 2.6 fit** | Riders use 2.6's `drive` / `seated` poses at measured hip heights; every one of the 23 vehicles refitted (seat height, wheel / bars reach, foot wells, headroom trimmed to the smaller 2.6 head); garage check per vehicle | — |
| **M2** | **Co-op backbone** | Saved player profile (gold, owned vehicles / clothes / items, job levels, achievements) on the server per player (account or device token) and in localStorage solo; the room knows each player's **place** (county / moon / station / sky) so friends can be in different places; job pay shared to everyone in the vehicle; title gets **County** as the main mode (Sandbox + Flag Run keep the old world); two-client test through the real server | — |
| **M3** | **Wayfare County map** | A new 3 km map: 4 placeholder cities (box blocks on street grids) joined by winding roads with switchbacks, steep cliffs and gorges, huge trees, a river + lake, farm belt, the Rustwild badlands, the airport, the launch site; every later milestone's sites placed now | — |
| **M4** | **Phone, gold, shops, wardrobe** | Phone menu (P / Back / phone button): Garage (summon any owned vehicle beside you, any time), Wardrobe (change clothes / look), Items (spawn an owned item), Jobs, Map, Achievements. Shops in the cities: Dealer, Outfitter (clothes), Supply (equipment). Start with a few basic clothes + the Trail Jeep. Job registry (levels, unlocks, upgrades) | M2, M3 |
| **M5** | **New vehicles A (farm + work)** | Codex reference sheets, then models + physics: tractor, seed drill, water bowser (sprayer), produce trailer, tow truck, delivery van | M1 |
| **M6** ✓ | **Farming** (built 2026-11-09: README "Farming") | Field plots with crop states: grown → cut (harvester / tractor + mower) → planted (seed drill) → watered (bowser) → grows (minutes) → cut… each step pays. Produce fills a trailer / truck → sell at the market (delivery pays by distance + load). Levels: more fields, new crops; upgrades: wider seeder, bigger tank | M4, M5 |
| **M7** ✓ | **Emergency + haul jobs** (built 2026-11-10: README "Emergency and haul jobs") | Fire: something catches fire (barns, hay, grass, buildings), severity grows over time; drive the fire truck there and spray it out; pay = distance × severity. Ambulance: patient → hospital, gentle driving bonus. Patrol: catch the runaway car (bump it to a stop). Tow: wrecks → the yard. Haul: semi + trailer deliveries between cities. Each with levels + upgrades | M4, M5 |
| **M8** ✓ | **Rustwild combat zone** (built 2026-11-10: README "The Rustwild") | A wilderness with raider camps: turrets, drones, raider buggies that fight back; weapons vehicles (jeep gunner, tank, hover tank, + a new armed buggy) clear camps for gold; camps come back. Vehicle health + respawn | M3, M4 |
| **M9** ✓ | **Airport + skydiving** (built 2026-11-09: README "Wayfare Field, skydiving and fall damage") | Wayfare Field: planes, helicopter, a new cargo plane and glider for sale/use; the **jump point**: teleport into a flying cargo hold, run out the ramp, free-fall, open the parachute (or fly the glider); forgiving fall damage everywhere | M3, M4 |
| **M10** ✓ | **Survey equipment** (built 2026-11-10: README "Survey kits") | Buy kits (weather mast, seismic probe, radar dish, science lab); carry them in a vehicle to a site that meets the kit's rule (high enough, flat enough, far from the others, the right ground); set up (hold E); drive back to the Survey Office → reward + new missions | M4 |
| **M11** ✓ | **Rocket, orbit, station, landing pod** (built 2026-11-09: README "The rocket, orbit, Lantern Station and the landing pod") | The most expensive purchase: a rocket at the launch site. Launch (staging, effects) → orbit screen → **Lantern Station** (walk in zero-g: float, push off walls) or **the Moon**. Coming home = a landing pod with reentry glow, subtle steering, a parachute before impact, gentle touchdown; exit any time and you get a parachute | M2, M9 |
| **M12** ✓ | **The Moon** (built 2026-11-10: README "Moon jobs") | Low-gravity moon map (craters, rilles, a base), the moon rover, moon jobs (sample runs, survey kits on the Moon, crater jumps, supply runs to the base) | M10, M11 |
| **M13** | **Achievements + jobs checklist, release** | Achievements (hidden ones show locked: "Requires: launch the rocket"); a Jobs checklist (each job's levels done at least once; jobs not yet found shown obscured); What's new, docs, publish | all |

M5's Codex sheets are made early (one job at a time, in the background) so models never wait for pictures.

## Contracts (added)

### Places (M2)
A room holds several **places**: `county` (the Wayfare map), `sandbox` (the old world: Sandbox + Flag Run rooms only),
`moon`, `station`, `sky` (the jump plane / free fall, really just the county with you high up). Every player and every
entity has `place`. The room only sends you bodies, breaks, fires and job events in your place. Changing place:
`{ t:'go', place, at? }` → room checks the reason (rocket launched, pod landed…) → the client rebuilds its world +
physics for that place and keeps the connection. A place's world comes from `generateWorld({ seed, map })` (`map` =
`'classic' | 'county' | 'moon' | 'station'`), pure, same on the server.

**Space (M11).** `go` to 'moon' / 'station' needs the player in orbit (room-core `p.orbit`, set only by a refereed
`{ t:'space', step:'launch', id }` from someone in a rocket ≥ 3,000 m over the launch pad — everyone aboard goes, the
rocket is removed, each gets `{ t:'orbit' }`) or already up there. `go` 'county' from orbit / the station / the Moon is
the trip home: `at` must be 300-4,200 m up, and the room puts a landing pod there with the player in its seat (the
reply `go` carries `pod: id`). `go` 'sky' from the Moon / station is refused. `space` steps `touchdown`, `bail`, `lap`
earn achievements. The Moon's rovers are parked by room-core with place 'moon' and a pose whose height is null (the
client sits them on its ground). Pure rules: js/game/space.js.

### Profile (M2)
```js
profile = { v: 1, gold, owned: { vehicles: [ids], clothes: [ids], items: [ids], kits: [ids] },
            look, jobs: { <jobId>: { level, done: [levels done at least once], upgrades: [ids], best } },
            ach: { <achId>: timeDone }, stats: { metres, jumps, … }, seen: { jobs: [ids] } }
```
Server online: kept in `<data>/profiles.json` keyed by account (`acct:<id>`) or the device token; the room loads it on
join and saves on change (debounced). Solo: localStorage `roverlands.profile`. Gold only ever changes through the
room (`grant` from a job step it refereed, `buy` it priced from `data/shop.json`). Rule 2: no `sell`, no loss.

### Jobs (M4 → M6..M12)
`data/jobs.json`: `{ id, name, vehicle(s), place, levels: [{ n, title, goal, pay, need?, unlocks? }], upgrades: [{ id,
cost, effect }], steps?, batch?, hidden?: 'requires text' }`. Pure job logic in `js/game/jobs/<id>.js` (no
DOM/three/rapier), each step reported as `{ t:'job', id, step, … }`, refereed by `js/net/jobs-core.js` inside room-core
(distance / position / time checks, generous). Pay goes to every player in the job vehicle or within 30 m of the step.

**The job referee contract (built in M6; farming is the first user — fire, ambulance, tow, haul, combat, survey and the
Moon jobs plug in the same way).**

1. Write `<job>Referee(api)` in `js/game/jobs/<job>.js` (pure, seeded from `api.seed`, every time from `api.now()`),
   and add it to `REFEREES` in `js/net/jobs-core.js`. Return `null` when the map has nothing for the job (e.g. no farm
   plots in the old world). The referee returns `{ step(pid, msg), tick?(), resync?(pid), fixtures?(),
   profileChanged?(pid) }`.
2. **Wire, client → room:** `{ t:'job', id, step, cells?: ids (≤ 400), veh?: entId, to?: entId, p?: [x,y,z], n?: int,
   on?: bool }` (js/net/protocol.js `job`, 14 a second, burst 28). `step` is the job's own word (farming: `cut`, `plant`,
   `water`, `refill`, `sell`, `sync` = send me your picture again). Only players in the job's place (or one that shares
   its view: the sky sees the county) reach the referee; watchers never do; nothing before the host starts.
3. **Wire, room → client:** `{ t:'job', id, k, … }` — `api.send(pid, payload)` to one player, `api.cast(payload)` to
   everyone in the job's place. Keep shared state in the referee (the room), send the whole picture on `resync`
   (room-core calls it when a player arrives in the place and when the drive starts) and small deltas after
   (farming: `k:'full'` run-length snapshot, a few hundred bytes for the 3,725 cells, `k:'cells'` batches like wheat `cut`,
   `k:'veh'` loads, `k:'prog'` the player's level goal + progress line, `k:'sold'`).
4. **Checks the referee makes** (all through `api`): `api.player(pid)` → `{ place, seat, pos, profile }`, `api.ent(id)` →
   `{ kind, owner, seats, pos, acts }` — is the sender DRIVING (seat 0), is the tool that vehicle or one they tow (they
   own it and it is right behind), is its switch on (`acts`), is each reported thing within reach of the vehicle's last
   reported pose (farming: 16 m), is it the right state (no planting a standing crop), is it open at the player's level
   (`api.unlocked(pid)`, `api.nextLevel(pid)`, `api.upgrades(pid)`), and `api.take(key, rate, burst, n)` (a token
   bucket: farming lets one machine cover ~40 cells a second, burst 160). Refusals: `api.deny(pid, why)` — a toast;
   say each one at most every few seconds.
5. **Pay:** `api.pay({ pid, step, count, at, vehicle, why })` pays `job.steps[step]` gold for every whole `job.batch`
   (10) units of that step done with that vehicle (the rest carries to the next message), to every helper — the sender,
   everyone seated in `vehicle` (the one the sender DRIVES, so its passengers count, not the towed trailer), and anyone
   within 30 m of `at` (y null = across the ground) — each the whole amount (rule 3). It returns the helpers even when no
   batch completed, so the referee can credit progress to all of them. `api.payGold({ … gold })` pays a lump (a sale,
   a delivery). Gold never goes down (rule 6).
6. **Levels:** keep each player's progress in the referee; when a player's `api.nextLevel(pid)` goal (`level.need` in
   jobs.json) is met, call `api.levelDone(pid, n, { at, vehicle })` → room-core `jobDone` pays `level.pay` to every helper
   and records the level for each one who had it open; the next level unlocks. Tell the player their goal with a
   `k:'prog'` message (the phone's Jobs app shows it under the level).
7. **Fixtures:** vehicles a job needs parked in the world (the farm's three tractors + drill + bowser + trailer) come
   from `fixtures()` → `[{ kind, x, y, z, yaw }]`; room-core parks them like pad vehicles (fixed ids after the pads,
   back on every reset). Only in the County.
8. **Upgrades** are bought through the existing `upgrade` message (registry `applyUpgrade`); the referee reads them with
   `api.upgrades(pid)` and must change the PLAY (farming: `farmRules(upgrades)` → strip width, tank size, grow time,
   trailer size), and room-core calls `profileChanged(pid)` so the referee can re-send the goal.
8b. **(M7) More `api`:** `payTo({ pids, gold, at, vehicle, why })` pays an exact list of helpers (everyone who sprayed
   a fire, loaded a patient, hit the runaway) plus the usual 30 m / in-the-vehicle helpers, each the whole amount once;
   `spawn({ kind, p, yaw, owner, noSeat })` puts a job's own body in the room (the runaway car, a wreck: `noSeat` =
   room-core refuses every seat in it), simulated by `owner`'s machine like any body, gone at a reset; `remove(id)`
   takes it away again. A job's places come from `world.sites.jobSpots` (js/world/county/job-spots.js: patient spots,
   wreck spots, runaway routes, parcel stops) — a referee returns null without it. `calls.js` `kit(api).levelUp`: one
   finished call is one level at most per player (a helper's level done records it for the others too).
9. Tests for a new job: a pure test of its rules, a room test of its referee (two players in one vehicle both paid, a
   far one not, a step from where you are not refused, the level chain, each upgrade changing the play — see
   `tests/farming.test.js`), the two-client real-server test (`tests/farming-net.test.js`), and a Playwright spec in
   `?view=simple` that does the job with the real vehicles and waits on state.

### Who simulates the raiders (M8)
**The room does** (`js/game/jobs/combat.js` inside room-core: on the server online, in the page's loopback solo) — not
PLAN.md's owner-simulates rule, which is for bodies with physics. Why:
1. **Nothing about a raider needs physics.** Turrets stand still; drones fly; raider buggies are steered points that sit on
   a coarse 8 m height grid of the Rustwild the county carries in its sites (`sites.rustwild.grid`). A few dozen of them
   at most (5 camps, 3-9 each), stepped 20 times a second only for a camp someone is within 340 m of — a few
   microseconds on the droplet's one CPU.
2. **One truth for every hit point.** The raiders', the vehicles' in the zone, what a shot hit: all in one place, so two
   players never disagree about whether a turret is dead, there is no hand-over when a "camp owner" leaves or lags, and a
   camp cannot be cleared twice.
3. **The pay is refereed where the damage is.** A page reports only its own gun's hit (`hit { veh, to }`); the room checks
   the seat has that gun, the raider is in range, and the gun is not firing faster than it can — "clearing a camp you
   were never near" is impossible by construction.
4. **Same code solo and online** (rule 4), and it is pure, so `tests/combat.test.js` plays whole fights on a pretend clock.
Cost: the raiders are seen ~110 ms late (drawn like other people's vehicles), and their shots are drawn from the
room's `shot` message on the same straight line the room flies them; that is why the shots are SLOW (30-55 m/s) and
aimed at where you are, never led — what you see coming is what can hit you, and moving dodges it (rule 6, forgiving).
Raider buggies are kinematic boxes in each page's physics (you can bump into them); they cannot be pushed.

Vehicle hp (`vhp`) exists only for an occupied vehicle inside the zone; leaving the zone, or a wreck standing empty for
40 s, makes it whole. A knocked-out player in the zone comes round at `sites.rustwild.garage`.

### Survey kits (M10) — the kit rules contract (the Moon reuses it)
Kits are data (`js/game/survey-kits.js` `KITS`: id, name, letter, colour, model, max, setup s, pay { base, per_km },
`rules`, and `places: { <map>: { rules } }` for a place with its own rules). A rule is `{ t, … }`; `js/game/survey.js`
`RULES` says what each kind means — `high { pct }` (higher than that share of the place's dry land), `slope { max }`,
`road { min }`, `ground { not | only }` (SURFACES names + 'water'), `summit { r, by, rise }`, `apart { m, any }`, `near
{ water, special: [kinds] }`, `office { min }`. **Nothing in a rule knows the County**: every one asks a place view.
1. **A place = a grid.** `surveyGrid(world)` samples any generated world every 8 m: `h`, `road` (m to the nearest road),
   `water` (m to the nearest water), `ground` (index into `grounds`), `specials` ([{ kind, name, x, z, r }]: the giant wood
   from `tree_giant` objects, a place's `craters`, `sites.base`), `office` (the `survey_office` place), `gravity`
   (world.gravity, else 1.62 on map 'moon', 9.81 otherwise), `map`. `placeView(grid)` answers heightAt / slopeAt /
   roadDist / waterDist / groundAt / specialAt / pct; plain arrays work as well as typed ones (a JSON test file).
2. **The same grid on both sides.** The server builds it in `sitesFor` (`sites.surveyGrid`, County); the page builds it
   after its world (`js/client/main.js`) for the readout and for the loopback room. What the readout calls green is what
   the room accepts.
3. **Judging:** `judgeSpot(kit, view, [x, y, z], { others: [{ kit, x, z }], office })` -> `{ ok, why, checks: [{ t, ok,
   text }], q, grade }` — the rules for `view.map` (`rulesFor`). `why` is the first failing check's plain sentence.
   `spotPay(kit, q, metresFromOffice)`, `surveyRules(upgrades)`, `setupMs`, `levelMeets/levelText(need, sites)`,
   `goodSpots(kit, view, ctx, { x, z, r })` (the Site scanner).
4. **The referee is reusable:** `kitBench(api, { place, grid, office, kits?, levels?: false, onReport?(pid, sites),
   officeR? })` in `js/game/jobs/survey.js` is the whole crate → set up → report machine (wire in that file's header).
   The Moon: `kitBench(api, { place: 'moon', grid: <the Moon's surveyGrid>, office: <the base>, levels: false, onReport })`
   and its own `places.moon` rules (already in the data for the Weather Mast and the Field Lab: no weather ground
   kinds, no water — the lab wants a big crater or the base instead).
5. **Saved in the profile:** `profile.sites` [{ id, kit, place, p, yaw, q, paid, at }] (`cleanSites` in profile.js, 40 at
   most); the referee shows everyone connected's sites in its place and writes through `api.saveProfile(pid)` (room-core
   keeps it and sends the player their profile). A kit is never lost: packing it puts the crate back.

### Moon Work (M12)
One referee (`js/game/jobs/moon.js`, job `moon`, place `moon`) for the four Moon jobs; it reads the Moon's job sites from
`sites.moon` (`moonJobSites(moonWorld)`: samples with rarity, ramps with lip + landing ring, the Sample Drop, the two
supply yards, survey spots, the rille line, and `surveyGrid` = `moonSurveyGrid`), which the server builds with the
County and the page adds in solo when it first builds the Moon. Samples ride in a rover's bin (per rover, shared by
whoever rides in it); jumps are timed by the room between `launch` (near a lip) and `land` (checked against distance /
air time); crates bounce out on a reported jolt and lie as loose crates anyone can pick up. The Moon survey is M10's
`kitBench` on the Moon's grid with Greywatch as the office; it speaks as job `survey` so the page's survey glue is the
same on both worlds — jobs-core routes a job's steps to a referee of the player's place that `claims` it, and `sendAs` /
`castAs` let a referee answer as another job. `api.award(pid, when)` gives a referee's own achievement events. The
Crater Crawler is 12 m/s (was 10) so a full-speed ramp jump clears level 2's 40 m (tests/moon-feel.test.js).

### Phone (M4)
`js/client/ui/phone.js`: one full-height panel styled as a phone (phone-first: it IS the screen on a phone). Apps:
Garage, Wardrobe, Items, Jobs, Map, Achievements, Settings. Key P / controller LB (built M4; Back is the map) / phone button on the HUD.
Summon = `{ t:'summon', vehicle }` → the room places it on the nearest road/flat spot within 25 m, removes your previous
summoned one if empty (one summoned vehicle per player at a time, plus anything you are driving).

### Health (M8, M9)
Players get `hp` (100). Fall damage: landing speed over 9 m/s hurts (`(v-9)*8`), over 22 m/s knocks you down for 3 s.
At 0 you are knocked out → stand up at the spot after 4 s with full hp (forgiving), or at the nearest garage if in a
combat zone. (M9, `js/game/health.js`: the landing speed is the speed INTO the ground — the walker's falling speed, a
tumbling body's vertical speed when it is stopped, a parachute's sink; from full health anything over 22 m/s is at
least 104 damage, so it is a knock-out. Falling more than 60 m gives you a parachute instead.) Vehicles get `hp` only in combat zones; at 0 they smoke and stop, summon again.

## Vehicles to add (Codex sheets → model → physics)

| id | name | for |
|---|---|---|
| `tractor` | Furrowline Tractor | farming: pulls the seed drill / bowser / produce trailer, mows with a front mower |
| `seed_drill` | Seed Drill | farming trailer: plants a strip as it rolls |
| `water_bowser` | Water Bowser | farming trailer: waters a strip (spray bar) |
| `produce_trailer` | Produce Trailer | farming: holds the crop (tipping bed) |
| `tow_truck` | Hookline Tow Truck | tow jobs (crane + hook) |
| `delivery_van` | Parcel Van | delivery runs in town |
| `raider_buggy` | Scrapper Buggy | armed buggy (player) / raider enemy |
| `cargo_plane` | Big Sky Lifter | the jump plane (rear ramp) — flown by the game for jumps, drivable at the airport |
| `glider` | Soarwing Glider | glider |
| `rocket` | Skyreach Rocket | the rocket (launch pad only) |
| `landing_pod` | Homeward Pod | reentry pod |
| `moon_rover` | Crater Crawler | the Moon |

## Testing
Every milestone: its node tests (pure logic: jobs, profile, places, map sites), a Playwright pass on desktop + phone
(`?view=simple`), the two-client room test for anything shared, and `tests/game.spec.js` under the lock. Gameplay specs
wait on distance / state, never on time.
