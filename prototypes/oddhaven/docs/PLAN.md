# Oddhaven: the plan

Status: 2026-10-30. Owner's request: `OWNER-BRIEF.md`, confirmed ending: "plan the game in multiple milestones".
Background: `research/brainstorm.md` (ideas, 54 jobs), `research/tech-recon.md` (code, numbers), `research/roast.md` (verdicts).
Where this file and those disagree, this file wins. "Oddhaven" is a working title.

**The hook: the town keeps living without you, and you can jump into anyone in it.**

## 0. Rules this game never breaks

1. **One clock.** A day is 16 real minutes (1 game hour = 40 s). No clock jumps, ever: a hands-on 6-hour shift IS 4 real minutes.
   Solo god view has speed controls, which drop to 1x when you take control. Night skip only when every player agrees.
2. **Jumping is free and unlimited.** No cooldowns, cost, burnout or rank caps. Never ration a core verb.
3. **Both ways, always.** A job in the sim has a hands-on version, and every hands-on job simulates when nobody is playing it.
   God mode can reach the top of any career, just slower. Hands-on pays about 1.25x; the real reward is stories, medals and finds.
4. **A family on autopilot never goes under.**
5. **A door you can see is a door you can use.**
6. **Physical means physical.** Jobs happen in the world with real props; a meter may add to that, never replace it.
7. **Playable on a phone after every milestone**, portrait first. Touch, keyboard and controller, menus included.
8. **Pure sim.** Seeded, no clocks or sockets inside, runs in node. The same code runs in a Worker (solo) and a Node room (online).
9. **Nothing is shared without opt-in.** Chibi, proctown, Rapier and vehicle code stay additive; other games must not change.
10. Original names only; `docs/banned-names.md` applies. Adults only for now; romance stays adults only for ever.

## 1. The game

**Minute:** walk, drive, one physical verb. Something funny on screen. Tap a thing, it responds.
**Shift (2-5 minutes, the session unit):** finish a job, a call-out or a Moment, or stir up a scene, and get paid at once.
**Three days:** bills, and the town paper (the Odd Sheet) built from what really happened. A town event every 3-4 days.
**Long term:** Life Dreams per person, careers to Chief, owning a shop, a mill or a rental, the Town Book.

**Three ways to act as god**, all one thumb:
- **Direct:** tap a person, tap anything, pick from a short list. Queue of three.
- **Stir:** drag one person onto another: introduce, set up a date, start a row, patch it up. Funny within seconds.
- **Plan:** the household board: jobs, shifts, purchases, who owns which car, where people live.

**Hands-on:** take anyone. Hand them back and they deal with what you did, and talk about it as if it was their idea (Bodies remember).
**Moments:** a pop-up ("Fire at the bakery, your brother is on shift") you can ignore; say yes and you fade straight in. The always-open
**Happening now** list shows everything live; only the top item may interrupt, and nothing pauses.
**The Phone** is the one hub: mail, group chat, gigs, Happening now, camera, summon vehicle, party orders, permissions.

## 2. Technical decisions (numbers from the recon; phone figures are estimates until measured)

| Area | Decision |
|---|---|
| World | 3,072 m square, 4 m height grid. Two cities 140 m radius, about 2.3-2.8 km apart. Car between them ~105 s. Walking pace is 2.6 m/s (M1 changed it from 6, which looked like a sprint), so townsfolk take ~15 min on foot; a player jogs at 5.2 m/s, ~7.5 min. |
| Positions | `{zone, x, z}`-friendly, ids free of coordinates, from M1: insurance for the bigger map and planet. |
| Sim | 4 Hz, 300 residents, under 5 ms a tick on a phone. Worker solo, Node room online. Module Worker has no importmap: the sim never imports `three`. |
| People, detail levels | L0 full body, L1 stand-in near the camera, L2 schedule-only in the background (households live but draw nothing, like the brief asks). Rank by what the camera is centred on, not by distance. |
| Crowd | 10 full Chibi 2.5 bodies + 60 instanced stand-ins. Budget 180 draws, 350k triangles. If stand-ins look poor in god view, a shared low-poly body comes first. |
| Looks | ~270 ms a build on a phone: colours from a palette so templates repeat. Uniform swaps happen indoors only. 39 clip cap: pick what leaves before adding. |
| Vehicles | Baked merged models with wheels as their own instanced mesh. Rapier only for player, party or crashed cars (4-8 live). |
| Traffic | Cars follow road rails. Flipped or blocked for 20 s: fade out, reappear on the route and keep progressing, with a tow-gnome invoice. Parked trucks are faded through. |
| Interiors | New pure `planInterior` lives in the sim, so background buildings can burn. Interiors sit in world space. One cutaway camera indoors, for god and hands-on. |
| Towns | M3: the two hand-written street grids stay (roads, rails and old saves are built on them) with a modern lot plan in `build-world.js` (yards, side rows squeezed, parking) and a modern kit in `js/client/modern-kit.js`. `planTown` with a `modern` culture waits for M12's generated worlds. Apartments absorb households so every visible door works. |
| Mechanisms | Levers, buttons, pressure plates, timers, gates and actions as plain data. Sim workers and players use the same machines. |
| Combat | New small system using `combat-feel.js` and `creatures.js`. Three buttons on the phone. |
| Words | Lingo with `grammar.add` packs. Only visible conversations make text; background people swap small numbers. Replace the `Math.random` in `relations.js:36` by an opt-in rng. |
| Voice | One interface: `createVoice().speak()` + adapters + an engine-neutral voice profile, so a better engine is one new file. Short barks by default, babble for strangers, full speech for the household. |
| Co-op | `js/sim/room.js` (pure: seats, parties, permissions, votes, kept outside the sim's state) + `server/` on 8560 stable, 8561 dev, https 8562/8563. The server serves the page too, so a phone needs one certificate. The sim is authoritative; the controlled person and their car run in that player's browser (as Roverlands does). Empty rooms sleep to disk and catch up on load. Target 2 KB a tick. |
| Saves | Sparse feelings, capped logs, under 1 MB compressed after 60 days. Same format in Worker and room, via the shared cloud save. |

## 3. Milestones

Each ends published to LAN stable with an in-game speed readout. Phone tests that need Radley are a one-tap link that posts numbers back;
work never waits on them (low graphics tier until a result arrives). From M2, every milestone runs a two-tab co-op smoke test.

| M | Name | What's in it | Pass test |
|---|---|---|---|
| 0 | **Keys and a road** | Vehicle page + tags (era: fantasy/medieval/modern/future, plus type). Game shell (☰, !, What's new, Credits, gameEye). 3 km world blockout, two towns as box shells, baked traffic, 10 bodies + 60 stand-ins + 40 cars. Drive around. | 20-minute soak link. Draw counts at the worst junction in budget. |
| 1 | **The street lives** | Clock, needs, moods, autonomy, schedules, L0-L2, 300 residents, traffic rails + reset + fade-through, god camera, Direct, premade gallery, races as looks, Lingo bubbles, voice interface. | 10-day bot run, nobody stuck. Park a truck on the bridge: traffic flows. |
| 2 | **Jump in** | Take anyone, walk, tap-to-walk, drive, hand back, "what did I just do?", party follow, get in, catch-up, summon a car by menu, room run in the same process. | Hop test: 200 jumps across 6 states, each under 1 s, nobody stuck. Save moves Worker ↔ room intact. |
| 3 | **Doors open** | Modern town plan and buildings, `planInterior`, cutaway, furniture slots, levers/buttons/plates/events, life clips, home + shop interiors. | Family lives through a day indoors. Every race through every door. List of all doors. |
| 4 | **First wage** | Job kit (carry, swing, time-the-lever), forestry + sawmill both ways, pay, bills, Phone, mail, Happening now, Stir, modern clothes batch 1. | A family left alone stays solvent. |
| 5 | **Fire** | Room fires in the sim, engine + hose, carrying people out, alarm wiring, Moments, the Odd Sheet. **The loop is proven here.** | 3 real days and you want a fourth. Burn a background building, walk in, same state. Family alone 10 days has a story. |
| 6 | **People are funny** | Hundreds of lines (target 800+), relations, quirks, mood weather, feuds, Who's Who, race moods, 4 spells, Tomodachi-style scenes. | No line repeats inside 5 days. Every line renders with no stray `{`. |
| 7 | **Make yourself** | Full creator, all nine races checked, clothing batch 2, the full premade gallery. | Own person in 2 minutes. Every race in every uniform. |
| 8 ✓ | **Bring a friend** | Server rooms, join a world, make or join a party, permissions, leader takeback, split into a new party, solo save into co-op. | Two phones, one town. Takeback at 20 m/s moves nothing over 2 m. Under 2% of a core with 300 people. |
| 9 | **Law and rifts** | Police radio with varied calls, crimes, permits. Monster hunter: rifts, 3-button combat, party in a fight, swap mid-fight. | A fight beaten by a bot and a person. 8-10 monsters in budget. |
| 10 | **Primary industries** | Farming, fishing, mining + quarry, oil. Goods feed shops. Gig jobs, own a shop, flip cars, buy another house, rent it out. | Every sim job has hands-on. Every good is made and used. |
| 11 | **Two cities** | Second city full, better vehicles (damage, trims, garage), summon at owned garage, fleet, buses, more interiors. | Soak re-run on the finished world. |
| 12 | **Pick a world** | World picker: premade plus a seeded generator on `proctown`. Public release if Radley says yes. | 20 seeds pass the same bot run. |

M9 and M10 can swap; neither can be cut.

## 4. Later iterations (after M12)

These are the map's route, in order; `brainstorm.md` §5 has the detail.
1. **The county:** a third town, rail line, train driver, farmland between.
2. **The region:** several cities, a highway, airport, boats, 10+ km.
3. **Far places:** a coast, mountains, a volcano; race homelands as destinations.
4. **The nation:** cities streamed by zone, buses and flights between them.
5. **The planet:** World Forge continents, flying, travel between regions.
Also parked for a later round: children and generations, seasons, rumours that change as they spread, court and jail, elections and strikes,
weddings gone wrong, potions, enchanted cars, photo album and museum, floods, power cuts, storms, bank heist, house building, player-built wiring.

## 5. Everything the brief named, and where it lands

| Brief item | M |
|---|---|
| Life sim on Chibi 2.5, modern, races + magic | 1, 6, 7 |
| Vehicle page with era tags | 0 |
| Vehicles used in the sim, NPCs drive, reset-on-track | 0, 1 |
| Better vehicle system | 2, 11 |
| Background houses simulate, contents not drawn | 1 |
| Pick a world, premade or random; small custom first | 12 (small custom from 0) |
| New clothing, character creator, premade gallery | 1, 4, 7 |
| Autonomy | 1 |
| Lingo + voice, 100s of lines, swappable voice | 1, 6 |
| Tomodachi-style social scenes | 4, 6 |
| Brainstorm + gameplay loop | Done, §1 |
| God game or take control | 1, 2 |
| Realistic routes, clock, jobs, several ways to earn | 1, 4, 10 |
| Firefighter puts out real fires | 5 |
| Cops with varied goals | 9 |
| Enterable buildings | 3 |
| Physical minigames | 4, 5, 9, 10 |
| Levers, buttons, plates, events, actions | 3 |
| Party follows, gets in vehicles, catch-up | 2 |
| Monster job with combat | 9 |
| Phone | Every one |
| Co-op, party make/join, permissions, takeback, split | 8 |
| Buy another house | 10 |
| Summon vehicles at a garage or by menu | 2, 11 |
| Two cities + distance, later several, then the planet | 0, 11, §4 |
| All primary industries incl. forestry, sawmill | 4, 10 |
| God-mode workers simulate jobs; control means real actions | 4 |

## 6. Decisions made (change any of them by saying so)

- **M8:** a player is a SEAT (`p1`, `p2`), which is what `hold.owner` holds; a random token in the browser, or an account, claims it. Parties, permissions and shared lines live in the room, not the sim, so a save that went through co-op hashes as it did. A party is players; a body belongs to whichever browser runs it. Leave gives your body back to the leader (or the town); Split keeps it and starts your own party, and the old leader has no more rights over you. A leader's takeback plays that body straight away and whoever the leader was playing becomes a follower. The guest's other followers go back to their day. Five permissions, per player, host only: take people, spend money, drive cars, change settings, Direct and Stir. Defaults: take and drive on, the rest off. Your own brought person is always yours, even with Take off. A guest with no money right pays no tow for a car they took out; a Direct order that ends in a taxi is the one spend not caught. Without Drive you can ride but not take the wheel. Eight players a room. Grace after a dropped socket 90 s; a room with nobody in it sleeps after 2 minutes, with nobody doing anything after an hour; rooms on disk go after 30 days. A kicked player stays out; vote-kick is not in. Speed votes need everyone online; anyone can bring it back to 1x alone; a newcomer ends the agreement. Night skip runs the night at 30x, every tick real (rule 1: no jumps), only between 21:00 and 05:00, and stops at 06:00. Bodies report 4 times a second, a car at the wheel 8. Two screens can pick the same line in the same moment, before either has heard the other: each player still hears it once. The room's relay goes straight on between ticks; everything else waits for a tick.
- **M7:** the plan never named a gallery size; it is 24 households (59 people), every race at least three people. Creator options are the shared Chibi 2.5 lists plus `js/client/outfits.js`; a person made there keeps a `design` in the save that the sim never reads. A new person goes on the end of the list, into an empty home (with a car) or a gallery family (no car, no more than the home has beds). People change only where they can: when they start something at a place, or leave home. This replaces M4's "uniforms worn all day". One town day in about seven is cold and people going out put a coat on. Swimwear has no place to be worn yet (no pool): it is in the creator and on the Change clothes list when playing. Gallery faces are real renders baked at build time, not on the phone; only your made people and your own non-gallery family are rendered on a device. Indoors a tall body still draws smaller (the door is the door): the change is eased over about half a second with a duck, not removed.
- **iPhone fixes (2026-10-31):** town view draws buildings at 0.55 height, not 0.38; on foot they are full height and only what stands between you and the camera comes down. Garage doors are 2.5 m high; a vehicle that does not fit parks on the drive. Selecting someone zooms in to 24 m and never out.
- **M6:** "No line repeats in 5 days" is held strictly, town-wide: with nothing fresh a person says nothing. To keep that from going silent a chat spends from an allowance of 100 lines a day. The four spells are Tidy, Warm, Mend, Hush. Mend takes a scorched room off the repair bill but never replaces lost rooms, so boards still matter. Fires went from about 0.8 to about 0.4 a town-day: a fire is now a thread of several days, and at 0.8 the paper led on fire nearly every issue. A firefighter on shift waits longer for a call; a Moment still jumps you in. Most couples go steady; about 35% (more for a picked family) go on to ask. The whole date-to-wedding run is about 9 days. Marriage moves one person and their car; a picked household is never emptied, so two picked singles who marry keep two homes. Feuds do not pass down the family (roast).
- **Killed the "house spirit" story**: god view and taking control are a plain camera and button.
- **Adults only for now.** The brief says family; first version means couples, siblings and housemates. Children are on the later list.
- **Day = 16 real minutes**, pay at end of shift, bills every 3 days, 300 residents.
- **Portrait first.**
- **Listing on games.radgh.com** waits for Radley's yes.
- **Walk speed 2.6 m/s, not 6** (M1): the sim's pace; a played person jogs at 5.2.
- **M5:** a fire is rooms stepped by arithmetic and hashes, not the sim's random stream, so it is the same at every detail level. Nobody dies. Fires are about one a day in town. The paper comes every 3 days (roast, not the brainstorm's weekly). The ambulance is a taxi-style trip with no driver of its own. An engine waits 50 s for a player on the crew. Repairs are done by a contractor with real boards; hands-on repair waits for a job that does it. Smoke does not hurt the person you are playing. Sleep refills faster (0.19 to 0.3 an hour) so a long commute with a 10-hour shift cannot empty it for good; a shift gives back 0.04 fun an hour, not 0.02, for the same reason.
- **M4:** the timber site is new, on Timber Lane off Oddhaven's north-east corner, not in the two town plots: a yard with falling trees does not fit a shop plot. Those plots stay: the town `sawmill` is a timber office, `lumber_yard` is where boards go. New places go on the END of the list so old saves keep their ids. Logs go by cart on rails, boards by a truck with a real driver (a new job, `timber_driver`). A log always makes the same boards; bad timing costs time. Hands-on pay is by steps done, at 1.25x, capped by the hours held. Planks reach homes as repairs on bills day.
- **M3:** the street grid is not re-planned (above). A home's beds and chairs are per flat; flats reach their floors by a lift list, not stairs. Upstairs of a shop or an office has no rooms and no door to one. Indoors a body is drawn smaller so the tall and wide races clear a door (x0.6-1.1). Dinner is two actions, cook then eat. E is Use first, and turns the camera only when nothing is in reach. An artic is not drawn parked at a home. Sim workers press switches only near the camera.
- **M2:** party overflow walks (no second car driven by the sim); a car left out at hand-back is fetched home by the tow gnome for 5 coins; a car handed back off-road fades onto the nearest road; only a person you have at the wheel, or standing in a lane, counts to traffic.
