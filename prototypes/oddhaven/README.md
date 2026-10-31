# Oddhaven

Working title. A modern life sim with fantasy races: **the town keeps living without you, and you can jump into anyone
in it.** The spec is `docs/PLAN.md` (rules in §0, decisions in §2, milestones in §3); the owner's words are
`docs/OWNER-BRIEF.md`; the reasoning is in `docs/research/`.

Credit: Radley Sustaire (independent). Sandbox. Not listed on games.radgh.com until he says so.

## Where it stands: M7 "Make yourself"

Radley has now played it on a real iPhone (2026-10-31, plain http on 8400). There are still no speed numbers from a phone: the soak link has not been run on one.

300 people in 100 households live in two towns, whether you watch or not. Pick a household, watch from a god camera, tap
anyone, give orders, or press **Take over** and be them: walk, drive their car, bring a party, summon a car, hand back and read
what you did. "Drive" in town view still hands you the free M0 test car, which now counts to traffic. Every building opens: walk in, or look down in town
view and the shell drops away. People sleep in their own beds, queue for the shower, serve at tills; things can be pressed; the Rift Lodge has a test room.
Timber Lane leads to Wend Mill and Wend Wood: trees fall, logs go to the mill, boards go to the lumber yards and into homes, and that chain runs the same whether a crew of sim workers does it or you do. Everyone has a Phone (bank, jobs, mail, map, calendar, Happening now, the Paper, their household's Story), and in town view you can drag one person onto another to Stir.
People now have real relations at every detail level: friends, dates, marriages that move someone house, feuds with a cause. Dates, rows and weddings happen at real places and play as staged scenes on a phone. Quirks change what people do, each race has a mood rule, four spells work both ways, the Phone has Who's Who, and the Story and the Odd Sheet follow threads that connect what happened. Buildings catch fire, room by room, whether or not anyone is looking. A crew drives a real engine there with a siren and fights it; or take a firefighter and do it yourself: engine, hose, hydrant, jammed doors, carrying people out. Burned rooms stay burned until boards from the mill mend them. Moments pop up and fade you in, and every three days the Odd Sheet prints what really happened.

Make your own person on the title screen (or Make a person on the ☰ menu in town, or Tell them, Change how they look, on anyone): race, body, face, eyes, hair, seven kinds of clothes, nature, quirk, voice, name, or Random. They move into an empty home or in with a family, and from then on live like anybody else. Everyone changes clothes through the day. The gallery has 24 households with real 3D faces.

* Open: `prototypes/oddhaven/` on 8400 (stable) or 8401 (dev). `?play=1` skips the gallery (or `?play=<premade id>`),
  `?tier=low|high` forces the graphics tier, `?touch=1` shows the driving controls on a desktop.
* **Phone speed test:** open `prototypes/oddhaven/?soak=1`, on the https port (8442) if the screen must stay on, because
  browsers only give a page the "keep the screen awake" lock on https. It drives itself for 20 minutes and posts to
  `library/synced/inbox/oddhaven-soak-*.json` on the server that served the page (stable: `~/claude/playground-stable/...`).
  Numbers go out at minute 1 and every 4 minutes after, so a phone that dies still reports. Never blocks anything:
  `?mins=` shortens it, and an unsent result is resent the next time the page opens.
* **Two tabs in one town:** `node prototypes/oddhaven/server/main.mjs` (needs `npm install` in `prototypes/oddhaven/` once, for `ws`; port 8561),
  then open `prototypes/oddhaven/?room=ABCD&seed=5&play=1` twice. Dev only: no limits or permissions until M8. In a room the clock stays at 1x.
* Reports from the ! button: `library/synced/inbox/oddhaven-report-*.json` on the LAN.

## How it is put together

```
js/world/        pure: no three, no DOM, no clock, no Math.random. Runs in a page, a Worker or Node.
  first-map.js     the hand-written county (plain data)
  build-world.js   map -> the Roverlands world contract, plus towns, buildings, blocks, lamps, trees, bridge
  routes.js        road graph -> lanes and junction links (keep right; every id is a name, never a coordinate)
  rails.js         a sim route laid onto the lanes: metres along a trip -> a point on the road. No traffic rules
  pavement.js      a walk trip -> door, kerb side, across at junctions, door; strolls round a block or a park
  autopilot.js     steers a Rapier car along the rails (soak test, node test)
  walker.js        feet: W is the top of the screen, walls and the river, which lane is under a point, kerbs, the follow trail
js/client/       the page
  main.js          boot and the frame: rules -> picture -> draw
  world-view.js    ground chunks (three detail levels), merged roads and buildings per 384 m square, river, instanced trees and lamps
  batch.js         the triangle pile those are merged with
  vehicle-bake.js  a Roverlands model -> near body + far shell + wheel list; the paint material
  town-link.js     the Worker, the mirror of the visible town, promises for inspect / save / health
  rail-cars.js     the sim's trips as cars on rails, smoothed between snapshots; fades when a car arrives or is reset
  traffic-view.js  draws them
  people-view.js   who is outdoors, 10 bodies + 60 stand-ins ranked by the camera's centre; where everyone stands
  standin.js       the shared low-poly body (one draw); mood-marks.js the weather signs (one draw)
  looks.js         person + what they have on -> Chibi 2.5 avatar, cached; premades use their written look
  outfits.js       pure: what a word from the sim means (uniforms for all 23 jobs, sets, what the creator offers); design.js pure: the creator's rows, a design -> an avatar
  creator.js       the creator: renders on the game's own context, no scrollers; portraits.js faces (baked for premades by tools/bake-portraits.mjs, in data/portraits/)
  god.js           the camera: drag, pinch, wheel, keys, stick; picking.js what a tap hit; orders.js the short list
  god-hud.js       clock, speed, household faces, the person sheet; gallery.js the start screen
  talk.js          Lingo with the Oddhaven pack; chatter.js conversations on screen; bubbles.js
  voice-api.js     createVoice().speak(profile, text); voice-engines/ one file per engine
  saves.js         localStorage + shared cloud save
  modern-kit.js    what a building looks like from the street, by trade
  interior-view.js one merged mesh per open floor, the cutaway in the vertex shader, the parts that move (doors, levers, shutters)
  indoors.js       walks people to the spot the sim gave them; life-clips.js sleeping, eating, the toilet and so on (registerClips, opt-in)
  drive.js         the Rapier cars, the cameras, solid boxes that ride along with the nearest rail cars
  hands.js         the person you play: walking, tap to walk, cars live and back, party, summon, the camera; hands-hud.js its buttons
  recap.js         the "what did I just do?" card from the sim's log; keynav.js menus by keyboard
  timber-view.js   the timber site you can see: merged rails, benches and racks, then six instanced pools (trees, stumps, logs, boards, the moving parts, the marker)
  fire-view.js     a fire in two draws: one instanced quad + one shader (flames, smoke, sparks, water), one instanced box (hydrants, hose, jammed doors, scorch, engine lights); fire-sound.js the siren
  moment-card.js   the Moment pop-up and what may interrupt (shouldPop); news-text.js the words of Moments, the Story and the Odd Sheet, out of data/news.json
  job-hands.js     a job in your hands: what the big button does, the needle, the marked target. ../world/job-kit.js is the pure half
  phone.js         the Phone: apps on the same sheet as every list. phone-text.js the words of letters, the statement, Happening now (pure)
  touch.js, shell.js, perf.js, soak.js, gfx-tier.js
js/sim/          the town: pure and seeded (README-sim.md). Runs in the Worker; the page holds only a mirror. control.js = being played; room.js = several clients;
                 interior.js = planInterior, interior-nav.js = the way round a plan, spots.js = who stands where, wiring.js = things that fire and wires that act
                 work.js = the timber chain both ways, fire.js = fires, calls, the crew, repairs, moments.js = what is worth telling + the paper, stories.js = small things that happen to a household, mail.js = letters, stir.js = scenes, phone.js = what the Phone reads, happening.js = the live list
server/main.mjs  tiny dev room server, port 8561
data/            sim data, premades.json (the gallery), changelog.json, vehicle-extra.json
data/lines/*.txt  the lines as plain text; tools/build-lines.mjs writes them into
../../lingo/data/packs/oddhaven.json   words and 1,100+ lines
```

**Imported from Roverlands, unchanged:** `js/phys/*`, `js/client/models/*`, `js/game/input.js`, `js/game/camera.js`,
`js/client/sounds.js`, `world-data.js`, `wmath.js`. Never edit them for this game (it is live); anything Oddhaven needs goes
in an opt-in option or in `data/vehicle-extra.json`.

### Roads, ground and rails agree

Road heights come first and the ground is cut to fit: ground sits exactly at road height for 5 m past the edge, then fades
back over 26 m. The road ribbon, the wheels and the rails all read the same `pts[][2]` heights. The 4 m grid is too coarse
to carry a road's edge, so `surfaceAt` asks "how far from a road centre?" instead (a distance grid, filled when the world is
built). The bridge is one straight deck box plus two rail boxes; a test proves the deck points lie on it and that it meets
dry ground at both ends.

### Traffic: one model

The sim owns traffic: every drive is a trip `{ route, s, v }`, with gaps on each road, one car at a time through a junction,
and the one reset rule (flipped or not moving for 20 s: reappear past what stopped it, tow invoice). `rails.js` lays a route's
steps onto lanes and links, so the page only walks a car to where the sim says. M0's second traffic model and its own
20 s fade-through are deleted. If you stand still in a lane with the test car, the page tells the sim there is an obstacle there.
**Pass test:** a truck across the bridge (`gameEye.parkOnBridge()`): traffic keeps flowing.

### People

The sim sends people near the camera: L0 at 4 Hz, L1 at 1 Hz, L2 not at all. The page draws only who is outdoors: walking
(on the pavement, `pavement.js`), strolling, in the park, chatting or on the phone on the step, sitting out, having a coffee
on the terrace, and half of shop staff. In a car, a body sits in the driver's seat (a stand-in does not). The rest are indoors,
and indoors is not drawn until M3. A body is built by one queue, sliced, never inside a frame; until it is ready that person
is a stand-in.

### Playing someone

The browser runs the body and the car (PLAN §2), the sim is told where they are four times a second. Same car on screen: `rail-cars.js`
keeps one entry from rail to live and back, drawn by the same baked mesh, with Roverlands' Rapier vehicle under it, any of the five
types. Going back it stays where it is and eases onto the lane over 1.3 s (`blend`). `js/world/walker.js` is pure, so node tests walk the
real map. Followers walk the leader's own trail, so they go round what you went round; far behind (34 m+, you slowed down) or walled in, they
shrink away and pop up behind you. A chibi head is taller than a sedan's roof, so nobody is drawn inside a closed car.

Keys: T take over, W A S D, Shift walk, E get in/out, F list, M view. Pad: X list in town view, then the same; Y list when playing.
Menus: arrows + Enter or digits on keys, d-pad + A/B on pad.

### Indoors

`planInterior({ id, kind, w, d, floors, units, doorX, garage })` gives rooms, walls with door gaps, furniture, slots, standing room, things and wires, in the building's own frame. It is pure
and seeded and lives in the sim, so a town nobody watches has the same beds. The world's building list keeps its ids, order and count from M2 (old saves name places by position); what
changed is that every plot stands 3 m back from the pavement behind a yard, side rows are squeezed to clear the corners, and doors, garages and parking spots are data on the building row.

The cutaway: a cut building's tag is matched in the shell's vertex shader and its shell sinks into the ground (`world-view.js setCut`), nothing is rebuilt. `interior-view.js` draws that floor as one
mesh; any wall between the camera and the focus is cut to knee height in the vertex shader, so it works from every side the camera can turn. The camera stays above the walls in both views, so it
cannot be shut out of a room. Rooms are unlit by the sun: a room's brightness is its switch and the time of day (a uniform, so no shader rebuild). People are drawn indoors only when their building is open.

Walls are real: `walker.js` takes `plans` and `shut`; a body is a circle against the walls, furniture and any shut door on its floor (`w.lv`). A shutter or garage door is the same gap with a box in it while it is down.
Flats: two a floor round a core, a lift by list. Keys: E is Use first (things in reach, the lift, your car) and turns the camera only with nothing in reach; Q turns it the other way; right-drag; PageUp/PageDown or [ ] floors in town view. Pad: X to use, right stick turns, d-pad left steps floors. Touch: the big button names the thing, a drag turns, two fingers twist in town view.

Wiring: `data/wiring.json`, by kind of building; `js/sim/wiring.js` runs it. Light switch in every room, garage and roller door buttons inside and out, shop shutters on a timer with buttons each side, and the Lodge's test room: left lever up, right lever down, stand on the plate and the strongroom opens and stays open; the chest pays once.

All doors: `data/doors.json`, written by `tools/list-doors.mjs`. Biggest body of each race, measured on the real model: `data/race-sizes.json`, `tools/measure-races.mjs`.

### Jobs

`js/sim/work.js` is the chain. A person on shift has a task, and a task is the same step whoever does it: the sim runs steps at a fixed pace, a player's `work` command runs the same step from where the browser says they stand. So a half-cut tree stays half cut, the log on a shoulder is still there at hand-back, and `audit.js` checks on every run that logs and boards add up. A log always makes `planksPerLog` boards; a bad timing costs time, never goods.

Chain: tree -> log on the ground -> carried to the landing -> cart on rails to the mill deck -> carried to a saw bench -> lever pulls make boards -> bundle carried to the rack -> truck to a lumber yard -> homes use them on bills day. A full rack, deck or yard holds the chain up rather than losing anything. Felled stumps grow back after `regrowHours`.

Pay: the sim pays by the hour. A step done by hand earns the seconds the sim would have spent on it, paid at `work.handsPay` (1.25), and credit can never pass the time you held the shift, so working faster than the sim does not pay more, and standing about pays nothing. Time with nothing to do counts as worked. Only the timber jobs are hands-on so far; everyone else still pays as before if taken over.

`js/world/job-kit.js` is the reusable kit: swing, carry and lever. A later job adds a row to `promptFor`, not a game.

Keys: E, X on a pad, or the big button does whatever it names. A log on your shoulder takes you down to 0.72 of your speed. Taking a hands-on worker before their shift, walk onto the site in shift time and you clock in.

### The Phone, mail, Happening now, Stir

Phone: the button in town view (under the !), Phone in the hands bar, P on keys, Back on a pad in town view, Y list on a pad when playing. The apps read `town.phone(household, who)` once as they open. Mail is facts from the sim (`h.mail`), worded by `phone-text.js`. Letters: statement every bills day, payslip for a shift worked by hand, promotion, mishap, tow, new job, friends, Stir.

Happening now (`happening.js`) is worked out from what is live and the log's last two hours, sent every four seconds, never saved. The top row is the pill in town view; nothing pauses and nothing interrupts.

Stir (`stir.js`, `data/stir.json`): drag a person onto a person in town view (zoomed in under 70 m), or tap someone with a person picked: the list has the same four scenes, so keys and pads reach them. A scene is an order and then a chat with a result.

### Fire

`js/sim/fire.js` is the whole of it. A fire is a list of rooms on the real plan, stepped once a second by arithmetic and hashes, never the sim's random stream, so a house nobody has drawn burns exactly as one on screen does. Heat grows, burn creeps up, neighbours gain exposure (door fastest, then ceiling, then wall), smoke moves through doors. `data/wiring.json` fits smoke alarms (a third of homes have a flat battery), sprinklers in big buildings and extinguishers you can press.

The crew and a player use one set of steps: `hoseOut hookUp sprayRoom forceDoor lift setDown`. Sim crew run them from `thinkCrew`; the `fire` command runs them from where the browser says you stand. Take over mid-fire and the hose, the half-forced door and the person on a shoulder are still there. Call pay works like shift pay: hands-on 1.25x, by steps, capped by time held. If you are on shift when the call comes the engine waits 50 s for you; if you never come, the next crew goes.

Keys: E, X on a pad, or the big button. Walk to the engine and E to get in; stop within 34 m of the fire; E to get out, E at the engine for the hose, E at a hydrant to connect, E held to spray (the stick steers, and with no stick the stream swings onto the nearest burning room in reach; only the room it points at gets wet), E with the needle in the middle to break a jammed door, E to lift someone and E outside to set them down. Moments: J, or Y on a pad, or the button.

Nobody dies: someone left inside too long gets out by the skin of their teeth and stays longer at the clinic. Insurance pays the repairs; a household's own share is capped by what it can spare after the next bill (rule 4). A home that has lost its beds or a third of its rooms: the family moves to the nearest empty home until the boards have been fitted (`boardsPerRoom`, out of the lumber yards; a town out of boards waits 36 hours, then the county buys in).

### Moments, the Story, the Odd Sheet

`moments.js` turns log entries into one record, used three ways: live on Happening now, in `h.story` for every household it touches, in `s.news` for the paper. Facts only; the words are `data/news.json`, read by `js/client/news-text.js`. The page decides what may interrupt: only your household's, or a town-stopper, four a day (`shouldPop`). Nothing pauses. The paper prints every 3 days at 07:00 and reaches every household's mail. `stories.js` rolls one small event a household a day (`data/stories.json`), off a hash, so a family left alone has things happen to it.

### People (M6)

`js/sim/social.js`: feelings stay the same small capped rows (`p.f`); a pass a day, off hashes, moves them for everyone, drawn or not. `s.social.bonds` are the few named relations (dating, engaged, married). `moveIn` moves one person and their car to the other's home; a premade household never empties, and two people who cannot share stay in two homes. `js/sim/threads.js` holds romance, feud and fire threads and meets: a meet is booked when both are free (`busyAt`), both really travel, and the scene is a chat with `act.stage`. Every step of a thread goes through `log()` as a `story` row with `thread` and `part`, so Moments, the Story and the paper read it with no extra plumbing. `js/sim/gossip.js` answers what two people could talk about, Who's Who and the street's weather. `js/sim/quirks.js` turns `data/people.json` `does` rows into effects read by people.js. `js/sim/racemood.js` is one rule per race, closed form. `js/sim/spells.js`: Tidy, Warm, Mend, Hush, by hash on the hour, by Direct order, or by the `cast` command; all end in `castSpell`.

Lines: `data/lines/*.txt` (a `# pool tag` header, then a line per row), `tools/build-lines.mjs` writes the pack. Pools: `od_race_*`, `od_quirk_*`, `od_mood_*`, `od_need_*`, `od_rel_*`, `od_sit_*`, `od_fact_*`, `od_spell_*`, `od_scene_<scene>_<step>`. `{fact.x}` is filled from a sim topic by `talk.js` (place who with person a b by job cause rooms ago prank). `talk.js` keeps `used`: a line said by anyone is out for all for 5 game days, saved in the save's note. If nothing fresh is left the person says nothing, never a repeat. A chat also spends from an allowance (100 lines a day, `PER_DAY`), because a chat reaches about 500 of the lines; past it they chat on with no bubble. Scenes and spells do not spend it.

`js/client/stage.js` plays a scene: letterbox, low side-on camera, one clip and line a beat, voices through voice-api, the words along the bottom. Stir plays one at once; a meet near you or yours offers a Watch card (J, Y on a pad, or the button) and sits on Happening now. Next and Leave are real buttons; E or Enter, Esc; A and B. Speed drops to 1x while it plays. Signs: `mood-marks.js` adds hearts, a red bolt, Zs, snow, hushed, a glow; above 150 m each block is one big sign (`stepSky`). Yard signs are boxes in fire-view's prop pool, so they cost no draw.

Keys: C spells when playing. Pad: Y list, then Spells. Touch: Phone, then Spells. In town view spells are on the Direct list.

### Making people (M7)

`js/client/design.js` `TABS` is every row of the creator: 11 tabs, six rows at most, so nothing scrolls over the picture on a phone (a scroller blanks the canvas). A row is a name with ‹ and ›; hold repeats; tapping a long list opens all of it. Keys: arrows or W A S D move and change, Q E tabs, Enter, R Random, F Done. Pad: d-pad or stick, LB RB tabs, A, X Random, Y Done, B back. A chooser is a normal sheet, so the menu walker has it.

Sim: `js/sim/newcomer.js` `addPerson`, `editPerson` (plain commands, so a room runs them). The new person is the last id; `s.made` keeps the audit honest. Their household gets `premade: 'made'`, which makes the sim treat it as picked. `design`, `voice` and everything else come to the page in the `person.added` / `person.edited` events; a late room client gets them in the roster. `js/sim/wardrobe.js` sets `p.wear` at every detail level, only in `startAct` and on leaving home, from the `wear` field in `data/actions.json`. The word goes out as `we`.

Clothes on the page: `people-view.js` compares a body's key (look, wear, job) with what the sim says, bakes the new template off the frame (`prepareChibi2`), and swaps when the person is indoors or out of sight. `createChibi2Character(look, { park: true })` is opt-in: a template taken off stays parked, `prepareChibi2(look, { keep: 24 })` caps how many. A stand-in uses the same colours.

Faces: a premade's face is `data/portraits/<household>-<n>.webp`, with a hash per face in `index.json`; `tests/creator.test.js` fails if a look changes and the face did not. Re-bake with the dev server up: `node prototypes/oddhaven/tools/bake-portraits.mjs`.

Contact sheets: `tests/creator.spec.js -g "contact sheets"` writes `tests/shots/m7-sheet-*.jpg`.

### Vehicles and the budget

A sedan is 17 draw calls as built, so traffic never draws one. `bakeVehicle` builds each type once at load and flattens it
into one geometry, with the wheels off. Near cars (the nearest 8 within 45 m, a hard ceiling so a jam can never break the
budget) are every triangle; the rest are a shell of about 100 triangles lofted from the body. All wheels are one instanced
mesh. `aPaint` marks which vertices take the car's own colour, so bumpers stay black when a sedan is resprayed.
Seven types are baked (the ones in `people.json` `cars`, the fire engine and the ambulance); the police car waits for its job.

## Numbers (2026-10-30, this VM, software rendering; a real phone's speed comes from the soak)

| | Budget | Low tier (phone) | High tier |
|---|---|---|---|
| Worst of 80 junction views, draw calls | 180 | 34 | 63 |
| Worst of 80 junction views, triangles | 350k | 52k | 91k |
| 40 cars, 10 bodies, 60 stand-ins in one view, draw calls | 180 | 44 | |
| The same, triangles | 350k | 196k | |
| M2: you + party of 4, 160 junction views near and far, draw calls | 180 | 30 | 43 |
| The same, triangles | 350k | 90k | 139k |
| M2: you + party, 30 cars, 10 bodies, 60 stand-ins in one view | 180 / 350k | 38 / 166k | |

10 days in a real browser at 4x (39 minutes), sim in its Worker: nobody stuck, audit clean, 3,186 trips, peak 38 draws / 94k
triangles in normal play, worst tick 3.9 ms (with the unit tests running beside it; 0.6 ms alone), 0 console errors. Save 37 KB
(gzip) at day 10, 44 KB at day 60. A week of catch-up: 0.35 s here.

M2 on this VM: 200 hops (phone size, low tier): median 269 ms, p95 287, worst 297, nobody stuck, audit clean. Worst speed seen across a
rail -> live -> rail car, frame by frame: 26 m/s (no jump). Save moved Worker -> room -> Worker: byte-identical, 254 KB plain.

M3 on this VM: every interior (836 views: every floor of every building, four turns), low 28 draws / 105k triangles worst, high 33 / 152k. One open floor is about 3k triangles at most. 10 days at 40x clean, 200 hops median 250 ms, worst 319. A family's day: closest two bodies 0.62 m.

M4 and M5 on this VM: see `~/claude/docs/oddhaven.md` "Measured" (the same numbers, kept in one place).

## Tests

* `node --test prototypes/oddhaven/tests/*.test.js prototypes/oddhaven/tests/sim/*.test.js` (also part of `npm run test:unit`).
  `traffic.test.js` is the join (every route lands on the lanes, 5 days on the real map, the truck, pavements), `client.test.js`
  the short lists, tapping, voices, looks and premades, `talk.test.js` the line pack (no stray `{`) and the opt-in rng.
* `npx playwright test prototypes/oddhaven/tests/game.spec.js`: phone (402x780) and desktop, zero console errors. It prints the
  budget numbers. Never two Playwright suites at once on this VM.
* `tests/long.spec.js`: the M1 pass test, 10 days. 40x by default (4 minutes); `ODDHAVEN_SPEED=4` is the top speed a player can
  pick (40 minutes). Run it alone.
* `tests/hands.spec.js`: M2 end to end, the 200-hop test, phone stick, keyboard and controller menus, budget with a party. `tests/coop.spec.js`: the two-tab
  smoke test and a real save moved Worker -> room -> Worker; starts its own server on 8561. **Every milestone from M2 runs it.** `tests/room.test.js`, `tests/hands.test.js`, `tests/sim/control.test.js` are the node half.
* `tests/doors.spec.js`: M3 end to end, phone and desktop, a real old save, a drawn family day, the budget across every interior. `tests/doors.test.js` every race through every door; `tests/interior.test.js` plans over seeds; `tests/sim/indoors.test.js`, `tests/sim/wiring.test.js` the sim half.
* `tests/wage.spec.js`: M4 end to end, a whole logging shift by bot on the real keys, the mill by touch, the Phone in portrait, Stir by drag, keys and controller, the budget at the site, a real v3 save. `tests/sim/wage.test.js` is the node half, and holds the 30-day rule 4 test. `tests/fixtures/save-v3.json.gz` is a real old save; never regenerate it.
* `tests/people.spec.js`: M6 in a browser: a scene on a phone with its budget and the whole crowd piled round it, all 12 scene kinds, spells by touch keys and pad, Who's Who by controller, the view from high up, a real v5 save. `tests/sim/social.test.js` is the node half and prints family stories over four seeds. `tests/talk-run.test.js` is the five-day no-repeat run; `tests/talk.test.js` renders every line for every race. `tests/fixtures/save-v5.json.gz` is a real old save; never regenerate it.
* `tests/iphone.spec.js`: what a real iPhone found: summoned cars stay put and the HUD is true, parked vehicles of every type, garages fit, select zooms, only what hides you comes down, sound after a tab change (context suspended on purpose; a real iPhone is the only full proof), no control over a prompt at 380, 402 and 430 wide.
* `tests/fire.spec.js`: M5 end to end: the undrawn building, a whole fire by bot on the real keys and the same fire left to the crew, the budget with a real burning frame and a count of shader builds, Moments, a hose by thumb in portrait, a real v4 save. `tests/sim/fire.test.js` is the node half and prints family stories. `tests/fixtures/save-v4.json.gz` is a real old save; never regenerate it.
* `tests/creator.spec.js`: M7 end to end: your own person by thumb at a person's pace, by keys and by pad, a family, editing, a made person's life, clothes, the worst-case budget, doors, the gallery, the contact sheets. `tests/creator.test.js` every option through a save, the gallery, uniforms, other games' looks unchanged (`fixtures/random-looks.json`, written before the new clothes). `tests/races.test.js` nine races with every option really built, hats on every head and ear. `tests/sim/newcomer.test.js` the sim half. `tests/fixtures/save-v6.json.gz` is a real old save; never regenerate it.
* `window.gameEye`: M5 adds `fires()`, `burnt()`, `fireDrawn()`, `fireStats()`, `startFire(b, opts)`, `moment()`, `momentShow(m)`, `momentJump()`, `hydrants()`, `cmd(c)`, `printSheet()`, `news()`, `sweepFire(b)`, `routeMe(x, z)`, `spraying()`, `roadPath(...)`, `loadSaveBytes(u8)`. Also `state()` (with `sim`, `god`, `talk`, `hands`), `take(id)`, `handBack()`, `use()`, `partyAdd(id)`, `swap(id)`, `summon(id)`, `putMe(x, z)`, `sweepHands()`, `saveText()`, `plan(building)`, `buildings()`, `mech(building, target)`, `spots()`, `parkedCars()`, `sweepIndoors()`, `goFloor(lv)`, `owner()`, `health()` (the sim's audit), `begin(id)`, `speed(x)`, `turbo(x)` (tests
  only), `select(id, go)`, `goTo(x, z, dist)`, `who()`, `mirror()`, `roster()`, `screenOf(id)`, `tapThing(x, y)`, `save()`, `job()`, `site()`, `timber()`, `phone()`, `phoneApp(name)`, `now()`, `stir(a, b)`, `sweepTimber()`, `bark(id, intent)`,
  `say(id, text, opts)`, `parkOnBridge()`, `toDrive()`, `toGod()`, `pile(on)`, `sweep()`, `perf()`, `teleport`, `view`, `autopilot`.

## Not in yet

Repairs have no hands-on version: a contractor fits the boards (rule 3 not met for repairs, nobody holds that job yet). Smoke does not hurt the person you play. Swimwear has nowhere to be worn yet. Other jobs are not hands-on yet (M9, M10). Site trees have no car collider, so a car drives through them. A rail car you hit is not knocked (M11). Rooms: dev only, no permissions, no leader takeback, no saved rooms (M8). Co-op lines would need Lingo in the room (M8). Party overflow walks; no second car drives itself. A party member's catch-up is a quick shrink and grow, not a see-through fade: fading a body's material recompiles shaders mid-frame. Faces of ordinary townsfolk (not gallery, not made, not your family) are still the 2D paper doll.
Rail cars still end at the junction: a parked car stands at home and the moving one fades out at the corner, nothing drives up the last few metres. Trucks are not drawn parked at a house. Bodies pass through each other while walking indoors (where they stand and sit is checked, not their paths). Stairs: none, flats have a lift. Upper floors of shops and offices are not rooms. Tall races still draw smaller indoors; since M7 it eases over a stride with a bend at the waist, there is no ducking clip. Sim people use doors but only near-camera people press light switches.
