# New game — 2D city builder + defence (planning Q&A)

Started: 2026-11-15
Status: asking questions (one at a time, AskUserQuestion)

## Owner's pitch (verbatim)
"I want to build a city builder with 2d graphics, more detailed than the pixel physics games we've been working on. I'd like to have some SimCity 4 systems but with defense system like Factorio (walls + turrets, not the pollution stuff). I would like to generate a whole world, then pick a region like from SimCity 4 how you can pick various regions to play in and each region itself is actually huge play area, but you can exit that region to go back to the world view and your city still produces some things automatically even though it isn't loaded fully. I want to start out with basic materials like wood, stone, iron, keeping it relatively simple like Warcraft 3. I don't want to deal with any units. I do want to build mining outposts and set up trade routes."

Genre sheets: city-builder (leads zones, roads, needs, money) + tower-defense (leads waves; city pays for towers) — ~/claude/docs/genres/. First game under game-standards §12 (strict walk, tuning panel, Guessed card).
Note: Stoneward is an existing medieval PIXEL city sim — this one is a separate, more detailed 2D game.

## Questions planned (systems)
look/view · setting · threat source · growth model (zoning vs placing) · population/workers · resources + chains · money/taxes · services (SC4 subset) · defence detail (walls, turret types, ammo) · mining outposts · trade routes · away-from-region production · world + region size · stakes/win · progression/unlocks · devices · multiplayer/saves · name

## Answers
- Q1 setting (owner, in his words): "more futuristic. Not simple houses, but skyscrapers and hotels and stuff like in SimCity 4. Turrets and walls protecting a cyber city from wild inhabitants + invaders." → view not picked yet; re-asked.
- Q1b view: SimCity 4 style isometric (diamond grid, pre-drawn detailed 2D buildings, 4 rotations + zoom levels).
- Q2 threats: wildlife only — nests spread over time, attacks grow as you expand and mine; clearing nests opens land (no invader faction).
- Q3 resources: raw Metal/Stone/Crystal (+ Credits) refined once in city industry (Steel, Concrete, Power cells) for big buildings + better turrets. Short chain.
- Q4 growth: SC4 zoning (R/C/I painted beside roads, grows by demand, taller with land value + services) + hand-placed landmark buildings unlocked by milestones that boost their area.
- Q5 services: Power grid (turrets draw power), Water (pipes, underground view), Education & leisure (schools unlock tech industry; parks raise land value). NOT safety/health — and NO FIRES at all ("I'm BURNED out by kindlewild").
- Q6 defence: walls (gates for roads) + turrets anywhere; turrets need power + money upkeep only (no ammo delivery); walls get damaged and need repairs.
- Q7 outposts: placed on deposits across the region; once built + powered they send resources home on their own (no road/rail link needed); you defend them. (Deposits near nests implied by Q2.)
- Q8 trade routes: CANCELLED — focus on military + city building.
- Q9 away: unloaded region keeps earning at last rates into ITS OWN stockpile (regions independent); presumably no growth/attacks while away (not stated — confirm/guess).
- Q10 size: mixed region sizes like SC4 region map (small/medium/large side by side) — guess ~64/128/256 tiles, maybe 512 for large.
- Q11 stakes: sandbox with pressure — no game over/win screen; creatures wreck walls/outposts/buildings; money can go negative (shutdowns until recovered); milestones + landmarks as long goals.
- Owner note (mid-Q&A): "Having multiple cities could later be a reason for trade routes, tbd" → PARKED: trade routes between own regions, a later round. Keep region stockpiles in a shape that could ship between regions later.
- Q12 unlocks: population milestones (SC4: e.g. 1k/5k/20k/100k) unlock services, refineries, turret types, landmarks; education raises industry tier; next milestone always on screen.
- Q13 creatures: alien wildlife, NO flyers, "more tower defense" (distinct ground kinds: swarmers, armoured wall-breakers, big brutes…; attacks feel like TD waves — follow-up asked).
- Q13b attacks: constant pressure — no set waves; creatures roam and probe walls, attack where defence is thin, occasional big swarms. ("More tower defense" = turrets/walls do the fighting, no units.)
- Q14 devices: desktop first (mouse+keys, drag tools, hotkeys, edge scroll); phone fully playable (pinch zoom, drag tools, big buttons); controller later if asked.
- Q15 art: 3D models → 2D iso sprites (4 rotations). Buildings PROCEDURAL (same Hotel in 1/2/3/4-floor varieties etc.). Build an EXPERIMENT page (own playground folder) listing every building/creature/option to review and adjust without playing the game. Models meant for reuse later (stable, reusable API).
- Q16 day/night: slow cycle; neon/windows light at night, turret beams glow; creatures bolder at night.
- Q17 roads: street/avenue/highway + simple traffic (moving vehicles, congestion colour) + mass transit lines/stations (monorail/maglev) + INTERSTATE links between cities on the world map (SC4 neighbour connections; ties into parked trade routes).
- Q18 budget: SC4-lite — R/C/I tax sliders (higher = slower growth), upkeep for services/roads/turrets on one budget screen (monthly in vs out), loans; materials are a separate stockpile.
- Q19 terrain: generated hills/rivers/lakes/coasts; light terraforming (level ground for money), bridges + tunnels; hills add turret range, rivers slow creatures.
- Q20 saves: solo now; browser save + optional account cloud save; build so friends could later own regions in one shared world (server = later round).

## Owner additions (2026-11-15, during the 5-game publish) — verbatim
"I enjoyed dropping meteors on groups of enemies in Kindlewild. Somehow that was not as good when we built Stoneward (which is an earlier attempt at this same type of game). I still think it would be very satisfying if Arcline had similar satisfying physics - slow moving particles with a big boom and crisp sfx. I would like gun turrets to have visible projectiles and satisfying impacts, and some sort of catapult or bomb turret with more explosive ends for crowds. I would also like to use flock-AI for hordes of monsters so they don't all stack up, and move more sensibly as a group. I would like to have bridges that can serve as choke points. I also think since we are going a bit scifi with Arcline it may be cool if your intitial population arrives by drop pods or rockets landing, and this event could happen occasionally (though not as regularly as getting migrants in other games). This would just be one way to increase population. Let's do a brainstorm Q&A session about that type of feature, I'm also wondering if we should go more rimworld style and have it so you can open comms with spaceships overhead, and how would that work with a city builder?"

Notes for the build:
- Study WHY Kindlewild's meteor felt good and Stoneward's didn't (compare the two implementations: particle speed, flash, screen shake, sound, delay before impact) and write it down before building Arcline's effects.
- Visible projectiles + impact effects on every gun turret; a mortar/bomb turret with slow arcing shells and big crowd-clearing booms.
- Flocking for creature hordes (separation, alignment, cohesion + path following) — no stacking.
- Bridges as natural choke points (creatures path over them; rivers slow creatures — Q19).
- Arrivals by drop pod / rocket landing: the starting population, then occasional landings as one way to grow (rarer than migrants in other games). Brainstorm Q&A below.

## Brainstorm Q&A — arrivals + ship comms
- B1 comms purpose: settler ships (choose to accept a landing; ship types carry different people for different zones) + orbital strikes (buy a slow glowing shell onto a horde — the Kindlewild meteor feel, cooldown) + merchant ships (one-off deals while overhead: buy/sell surplus, Steel, Power cells, landmark parts). NOT requests/rewards.
- B2 comms how: build a powered Comms Array; ships pass overhead on their own schedule (icon crossing a sky strip with a timer); tap to open the call; bigger arrays reach farther = more ships + better offers.
- B3 landing: pods come down anywhere (open ground) UNTIL a Landing Pad is built; then pads take priority (like RimWorld trade drops landing near beacons). Probably same rule for merchant goods.
- B4 population: ARRIVALS are the main source (zones only fill as people arrive); births add slowly later on; neighbour cities you built send extra arrivals over land (no pods), more when connected by roads/transit/interstate. → zoning decides WHERE people live/work; landings decide HOW MANY.
- B5 strikes: BOTH — buy 1–3 strike charges from passing warships (Credits + Crystal), aim a circle, shell falls slowly (2–3 s, visible), big boom + physics debris + creatures flung; AND a late landmark Orbital Lance that fires on a long cooldown with power + Crystal.
- B6 settler choice: accept or refuse the whole ship (ship type tells roughly who is aboard).
- B7 frequency: rare + earned — early ~1 ship per 10–15 min; more with reputation (land value, landmarks, defence holding, bigger Comms Array); struggling/under-attack city sees fewer settler ships, more warships offering strikes.
- B8 start: pick a landing spot on the region; founding ship drops a Colony Core (city hall + small power + storage + starter turret) + first settlers in a pod rain; short calm period before creatures notice.
- B9 stray pods: always safe — land near the city on open ground, settlers walk in; pads are just tidier/faster.
- B10 merchants: exclusive goods only — they sell what you cannot make (rare turret parts, landmark pieces, blueprints) for Credits + Crystal; they do not buy your basics.
- B11 bridges: plain — creatures cross on bridges (no swimming implied by choke-point wish; shallow fords slow them); no gates or demolition; the choke point is turret placement.
- B12 (owner): NO ranged enemies hitting towers behind walls — likes the Factorio "walls block spitters" mod. Walls block every enemy attack.
- B13 creatures + traffic look: small 3D models rendered to 2D animated sprite frames (8 directions; walk/attack/die), same pipeline as buildings, night glow; deaths/impacts/projectiles are LIVE physics particles. Review page shows every creature animation, vehicle, and a wall-line test strip.
- B14 (owner): weather + sky effects, purely visual, NO harm: rain + lightning especially; sci-fi/neon extras like auroras, shooting stars, etc.
