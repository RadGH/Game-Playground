# Arcline — plan

A 2D isometric city builder in the SimCity 4 mould, set in a futuristic cyber city on an alien world, defended by
walls and turrets against native wildlife. Independent project by Radley Sustaire. Sandbox (playground prototype).
Owner's own words and every answer: `docs/OWNER-BRIEF.md`. First game under `~/claude/docs/game-standards.md` §12
(genre sheets city-builder + tower-defense; strict screen walk; tuning panel; hand-back card).

## §0 Owner rulings (2026-11-15 Q&A — these override anything below)

| System | Ruling |
|---|---|
| Setting | Futuristic cyber city — skyscrapers, hotels, neon; not simple houses |
| View | SimCity 4-style isometric: diamond grid, pre-drawn detailed 2D buildings, 4 rotations + fixed zoom levels |
| Art | 3D models rendered to 2D iso sprites; buildings **procedural** (same Hotel in 1/2/3/4-floor versions…); an **experiment page** lists every building/creature/option to review and adjust without playing; models reusable later |
| World | Generated world → pick a region (SC4 region map); **mixed region sizes** side by side |
| Away from a region | Keeps earning at its last rates into **its own** stockpile; regions are independent cities |
| Growth | SC4 zoning (R/C/I painted beside roads, grows by demand, taller with land value + services) **+ hand-placed landmarks** unlocked by milestones that boost their area |
| Services | Power grid (turrets draw power), Water (pipes, underground view), Education & leisure. **No safety/health, and NO FIRES at all** |
| Resources | Raw Metal / Stone / Crystal (+ Credits), refined once in city industry (Steel, Concrete, Power cells) for big buildings and better turrets |
| Outposts | Built on deposits around the region; once built + powered they send resources home on their own (no link needed); must be defended |
| Trade routes | **Cut** for now. Parked: trade between your own cities later ("tbd") — keep stockpiles shippable |
| Roads | Street/avenue/highway, simple traffic (vehicles + congestion colour), mass transit lines (monorail/maglev), **interstate links between cities on the world map** |
| Budget | SC4-lite: R/C/I tax sliders, upkeep for everything on one budget screen, loans; materials a separate stockpile |
| Terrain | Generated hills/rivers/lakes/coasts; light terraforming (level ground), bridges + tunnels; hills add turret range, rivers slow creatures |
| Defence | Walls (gates for roads) + turrets anywhere; turrets need **power + money upkeep only** (no ammo); walls take damage, repaired with materials |
| Endless threat | Owner 2026-11-16: "killing all the nests would defeat the enemies but I want even end game cities to require defenses." Monsters "prefer to attack gates over walls, within some distance." |
| Threats | **Alien wildlife only**, ground creatures, **no flyers**; **constant pressure** — creatures roam and probe walls, hit where defence is thin, occasional big swarms; nests spread, react to expansion/mining; clearing a nest frees land |
| Units | None. Turrets and walls do the fighting |
| Effects & feel | Kindlewild-meteor satisfaction: slow glowing particles, a big boom, crisp sound. Every gun turret fires **visible projectiles** with real impacts; a **mortar/bomb turret** lobs slow shells for crowd-clearing blasts. Study why Kindlewild's meteor beat Stoneward's before building |
| No shooting over walls | Owner 2026-11-15: no ranged enemy hits turrets behind walls. Rule like Factorio's "walls block spitters" mod: **walls block every enemy attack** — anything an enemy throws or spits hits the first wall in its way. Creatures must break through to reach what's behind |
| Creatures & traffic look | Small 3D models rendered to 2D animated frames (8 directions: walk, attack, die), same angle/light/night glow as buildings; deaths, impacts, projectiles are live particles. Hover-cars, trams, maglev pods the same way |
| Hordes | **Flocking** (spread out, move together, follow paths) — no stacking |
| Bridges | Plain bridges are the river crossings and natural choke points (creatures don't swim); no gates, no demolition |
| Population | **Round 2 (owner 2026-11-16) replaces the ship rule:** "make people keep coming in when there's demand and forget the drop pods thing for population." People move in on their own whenever there are free homes, faster the more attractive the city is (SimCity-style immigration). Births add slowly. Linked cities raise each other's growth: "transit lines benefit other cities by increasing growth and demand." The city must grow fast enough to pay for its defence: "More people, more money, more defenses." |
| Start | Pick a landing spot; a founding ship drops a Colony Core (city hall, small power, storage, starter turret) and the first settlers in a pod rain; short calm before creatures notice |
| Landings | Pods land on open ground near the city (always safe) until a Landing Pad exists; then pads take priority. Round 2: pods carry **supplies and exotic goods**, not people ("Maybe we can use it for supplies or exotic goods") |
| Ship comms | Build a powered **Comms Array**; ships pass overhead on their own (icon crossing a sky strip with a timer); tap to call. Rare and earned: ~1 per 10–15 min early, more with reputation and a bigger array; a struggling city sees fewer settler ships and more warships. Ship kinds: **settlers**, **warships** (sell 1–3 orbital strike charges for Credits + Crystal), **merchants** (sell only exclusive goods — rare turret parts, landmark pieces, blueprints — for Credits + Crystal) |
| Orbital strikes | Bought charges (aim a circle, the shell falls for 2–3 s, huge boom, debris, creatures flung) AND a late landmark **Orbital Lance** on a long cooldown (power + Crystal) |
| Stakes | Sandbox with pressure: no game over, no win screen; damage, debt shutdowns, milestones + landmarks as goals |
| Unlocks | Population milestones (SC4-style); education raises the industry tier; next milestone always on screen |
| Day/night | Slow cycle; neon + windows light at night; creatures bolder at night |
| Weather & sky | **Visual only, never harmful** (owner 2026-11-15). Rain (wet streets reflect neon, puddle ripples) and thunderstorms with lightning that lights the whole city for a frame; plus sci-fi sky shows: auroras, shooting stars, meteor showers far off, drifting mist, ships' contrails, the occasional distant orbital flash. Each region's biome sets which show up and how often; a settings toggle turns them down |
| Devices | Desktop first (mouse/keys, drag tools, hotkeys, edge scroll); phone fully playable (pinch zoom, big buttons); controller only if asked |
| Saves | Solo; browser + optional account cloud save; built so friends could later own regions in one shared world (server later) |

## Guessed (Claude's choices — overrule any in one line)

- Region sizes: small 64×64, medium 128×128, large 256×256 tiles; world about 5×5 cells of the region map.
- **Round 2 (2026-11-16) growth, money and threat — every number in data/tuning.json, checked with
  `tools/balance.mjs` (a bot that plays a sensible city for N years and prints people, monthly balance, milestone
  times and the fighting):**
  - Immigration: newcomers a game day = (immigrateBase 1 + immigrateSqrt 0.1 × √people) × appeal, only into free
    homes. Appeal ~0.1–2: land value where people live, open jobs vs unemployed, power + water, homes tax over 9%,
    reputation, links to other cities; ×0.7 for 8 days after a wall breaks, ×0.3 while broke. Homes grow 15% (at least
    16) ahead of the people, plus room for half of any open jobs' workers.
  - Ships carry no people: warships + merchants only (merchants also sell supply crates for credits). A free supply
    crate from the colony's sponsors lands every ~25 days (no Comms Array needed): raw materials, refined goods from
    milestone 1, a 12% chance of a rare part (the cheapest non-rare merchant good you don't own).
  - Money: Colony grant 700 cr/month at founding, fading to 0 by 1,500 people; resident tax 4 cr/month at 9%; job tax
    4 cr scaled by building tier (1× → 1.75×). Upkeep cut: Fusion Plant 90 (was 180), large 240, Water Pump 30,
    Comms Array 30, Landing Pad 20, Pulse Gun 10 (and costs 700, was 900), Mortar 22, Arc Coil 30, Rail Lance 45,
    walls 0.5 / 1 / 2 a tile, gate 1 (Barrier Wall costs 40, was 60). Upkeep is read from the catalog live, so old
    saves get the new numbers.
  - Milestone times (bot, 1×): **M1 ~4 min, M2 ~14 min, M3 ~36 min, M4 ~1.9 h**; M5/M6 later still. Shorter than the
    first plan below (owner: "the city should grow faster in order to keep up").
  - The wilds: 20% of the steady stream always comes in from the region edges (all of it once no nest is left, when the
    stream keeps running at the wildFloor share, 0.4 — it used to stop dead); big swarms come from the edge when no nest can send one
    (still announced); a nest migrates in from an edge every 40 days ÷ (1 + √(people/1000)). Nests still cap per area.
  - Gates: a gate tile costs a wall's path cost minus 10 tiles (gatePull), so creatures within about 10 tiles of a gate
    (more when the city sits right behind it) go for the gate.
  - Links: a road link adds 10%, a transit link 25% (capped at 60% together) to Residential and (×1.2) Commercial
    demand and 80% of that to appeal, on BOTH cities — a link built by either side counts for both.
- Population milestones, rebalanced 2026-11-15 for arrivals-first growth (owner: "We will need to rebalance the
  population milestone since we changed how arrivals worked"): the founding drop brings ~40 settlers; early settler
  ships carry 20–60, later colony liners 150–400 (bigger with reputation + Comms Array size); births add ~0.3% a game
  month once over 500; each linked neighbour city sends a trickle. Milestones: **100 / 300 / 800 / 2,000 / 5,000 /
  12,000**, aimed at roughly 20 min / 45 min / 1.5 h / 3 h / 6 h / 10 h+ of play. Housing scales to match (a pod
  home ~6 people, an apartment block ~60–150, a 30-storey tower ~300), so 12,000 is a real skyline, not a village.
  All of these live in data/tuning.json so the tuning panel can move them.
- Creature kinds for a first build (genre floor 3+): swarmer (fast, weak), wall-breaker (armoured, targets walls), sapper (fragile, melts walls fast — kill it before it arrives), brute (rare, huge). All ground, all melee.
- Turret kinds: pulse gun (cheap), arc coil (chains between close creatures), rail lance (long range, slow), plus wall tiers.
- Rendering: three.js offline renders to sprite sheets in the experiment page; the game itself draws sprites on a 2D canvas (fast on phones). Not live 3D.
- Wild creatures and nests are frozen while a region isn't loaded (it only earns).

## Rounds

0. **Experiment: `citykit/`** (playground experiment, reusable): procedural futuristic building generator (type × floors × width × style seed × wealth), creatures, turrets, walls, terrain tiles → iso sprites at 4 rotations, day + night layers. Review page with every option and sliders. Sprite atlas export.
1. **World + regions:** world generator, region map screen (mixed sizes, biome, deposits, nest density), enter/leave a region; iso terrain renderer with rotation + zoom, light terraforming, water.
2. **The city:** founding drop + Colony Core, arrivals as the main growth (pods, Landing Pad, Comms Array + passing ships),  roads (3 tiers) + traffic colour, R/C/I zoning, demand meter, growth by land value, power + water networks (underground view), budget screen + taxes + loans, milestones.
3. **Defence:** walls + gates, turrets with visible projectiles + mortar (power + upkeep), flocking creatures, nests and spreading, constant-pressure AI, bridges as choke points, damage + repair, outposts on deposits, orbital strikes.
4. **City depth:** weather + sky effects (rain, lightning, auroras, shooting stars…), education + leisure, landmarks, refined industry (Steel/Concrete/Power cells), mass transit, interstate links on the world map, away-earning, day/night gameplay.
5. **Finish to the house standard:** ☰ menu, settings, Report a bug, What's new, accounts + cloud save, tuning panel on every number, strict walk on every screen, publish to games.radgh.com.

## Parked
- Trade routes between your own cities (owner: "tbd").
- Shared multiplayer world (server).
- Controller support.

## Round 2 (2026-11-16, owner's first play-test) — sim changes

Owner: "My colony stagnated as new people stopped arriving… I could not get my monthly income to be positive and I
kept having to lay down turrets." Done in js/sim: immigration replaces settler ships (city.js `appeal`,
`immigrationRate`, `immigrate`); pods bring supplies (ships.js `supplyDrop`, `SUPPLIES`); Colony grant + cheaper early
upkeep (city.js `colonyGrant`, catalog); endless threat from the wilds (nests.js `edgeSpot`, migrations); gates draw
hordes (nests.js `gateCost`, citykit field.js `Grid.wallCost`); links count for both cities (transit.js `linkBoost`,
`linksFrom`). Balance bot: `node prototypes/arcline/tools/balance.mjs [--years 4] [--nofight]`.
