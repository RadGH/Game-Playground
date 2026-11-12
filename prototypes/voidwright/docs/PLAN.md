# Voidwright — design plan

Working title. A 2D top-down space game: **build your ship from blocks → kill things or work for things → upgrade →
kill bigger things.** Started 2026-11-06. Owner brief verbatim in `docs/OWNER-BRIEF.md`.

## §0 Owner answers (2026-11-06, the 20 questions) — these never change without asking

| # | Question | Answer |
|---|---|---|
| 1 | Map | **Star systems** on a galaxy map, jump between them; each system an open area (station, asteroids, planets, enemies); danger rises with distance from the start |
| 2 | Planets | **Low-orbit layer**: fly over a planet and you hover over its surface (ground turrets, ore, bases) and shoot down. No landing |
| 3 | Death | **Insurance**: drop some cargo, respawn at the last docked station in your saved design; rebuild costs credits unless insured |
| 4 | Saves | **One long save** (several slots) |
| 5 | Blocks | **Squares only.** Wedges/slopes are added automatically as COSMETIC smoothing; never placeable, no function |
| 6 | Big ships | **Bigger blocks** per class (1×1 → 2×2 → 4×4 capital parts) + mirror / copy tools |
| 7 | Flight | **Arcade**: speed/turn from totals; shape does not matter for handling |
| 8 | Turret arcs | **Arc only**: each turret has an arc set by its rotation, drawn in build mode; shots pass over your own hull |
| 9 | Controls | **WASD flies, mouse aims manual weapons, turrets auto-fire.** Controller = two sticks, phone = two on-screen sticks |
| 10 | Facing | **Nose points where you travel** (mouse only aims). So fixed forward guns face travel and turrets cover the back |
| 11 | Damage | **5 types × 3 sizes**: kinetic, laser, plasma, explosive, lightning × small/medium/large hits. Armour materials resist some, are weak to others; ship screen shows resistances, a scan shows the enemy's |
| 12 | Perf | **Balanced**: ~60 small enemies + bullets smooth on a phone; effects scale down first |
| 13 | Trade | **Market only**: supply/demand prices + events, a clear trade screen (best prices seen, profit per trip). No smuggling/courier |
| 14 | Crew | **Just a number** (like CPU) |
| 15 | Factions | Human traders / navy / pirates + **4 invented alien races** + **reputation** (hurting one pleases its rivals) |
| 16 | Unlocks | **Quest + finds**: the open quest introduces systems; anything can be found early |
| 17 | Shops | Shipyard, outfitter, market, refinery, repair, crew hall, insurance + **research lab, salvage yard, black market + bounty board** (no arena, no paint shop) |
| 18 | World | **Roaming bosses, derelicts + distress beacons, pirate bases + mining claims** (no blueprint crafting / set bonuses) |
| 19 | Players | **Solo, co-op ready** (pure sim, inputs as data) |
| 20 | Build | **Milestones nonstop**, LAN links as we go; ask before games.radgh.com |

Also from the brief: bug report lives in the ☰ menu (no on-screen "!" button).

## §E1 Expansion 1 "Shipwright" — owner answers (2026-11-12) — these never change without asking

From the owner's request (2026-11-12: implement play-test reports #24-#41, more encounters/outposts/loot, rare loot that
impresses, emphasis on growing a bigger ship by killing+buying OR mining+crafting, better visuals) and 10 questions:

| # | Question | Answer |
|---|---|---|
| E1 | Main goal after hour one | **Flagship + small wing**: your own ship is the star, grows toward a dreadnought; 1-3 merc wingmen + drones back you up; outposts and crafting feed the flagship |
| E2 | Mercenaries grow? | **Fixed stats — hire better ones**: better mercs at more dangerous stations, cost more; no levels |
| E3 | Planet outposts attacked? | **Occasional warned raids**: announced with a timer; build outpost turrets; fight them off for loot; if you're away a weak outpost loses some stored goods, never destroyed |
| E4 | Rare loot | **All four**: big reveal card + fanfare (compare with fitted), ~20 **named uniques** + collection log, **sealed caches** cracked at stations (guaranteed rare+), **treasure systems** for a while on the star map |
| E5 | Bigger hull | **Grow your own hull** at a shipyard: next class, keeps every block; pay credits OR that tier's materials; premades still sold |
| E6 | Encounters | **All four**: convoy under attack (help or join raiders), wandering merchant (dock mid-space), anomalies (rift, ion cloud, comet, derelict station, cache in the middle), wanted elites + ambushes |
| E7 | Space outposts | **Friendly small outposts** (1-3 services + mission board), **pirate & alien outposts** (vault / nest that spawns swarms), **abandoned outposts** (search sections: caches, survivors, traps). Not capturable |
| E8 | Missions | Harpoon **recovery** (asteroid / wreck / disabled ship), **delivery**, **clear a site**, **escort**, **survey** (scan), **acquisition** (bring something you must find yourself: mine, trade, craft) |
| E9 | Crafting | Recipe in structural + energy ore; **adding exotic raises rarity odds**; Forge bay / outpost factory adds more; bonuses random; **re-roll one bonus** for exotic ore |
| E10 | Extras | **Ship upgrades screen** (Ship power rating + next-step path: buy / kill / craft) and **galaxy events** (alien invasion, gold rush, pirate war — region-wide, on the star map with a timer) |

Also from the play-test reports: materials are Rock + structural/energy/exotic per tier (tier = warp class);
asteroids are typed, with the occasional mixed "cluster" rock (owner: allowed, not the norm); crew is a number
(min / need / room, "+3 Crew"); every gun can be fired by hand, auto needs a targeting slot (sentries/point defence
are always auto); drones are items fitted to drone ports, respawn for free; finishing "Further out" unlocks everything.

## §1 Pillars
1. **The ship is the character.** Every block is real: it has hit points, it can be shot off, it can be repaired.
2. **Scale like a living ocean.** You start ~5 blocks wide; stations are hundreds; a late battleship is ~100× your
   first ship's mass. Big things are reachable early if you look, but they will crush you.
3. **Juice**: coloured light from every gun and engine, bloom, screen-ripple shockwaves, debris with physics,
   rarity-coloured loot with beams and labels.
4. **Drip-feed**: the screen starts with very little; the quest log adds one system at a time.

## §2 Technical shape
- No build step; ES modules; `index.html` + `css/game.css`.
- **Render**: Canvas 2D draws the world into an offscreen scene canvas (ships baked to their own canvases, re-baked
  when blocks change; particles are pre-made glow sprites with additive blending) + a low-res **light canvas**
  (additive coloured lights). A **WebGL2 post pass** combines them: lit scene + bloom + up to 8 shockwave ripples +
  vignette + chromatic kick. Falls back to plain 2D if WebGL2 is missing.
- **Sim** (`js/sim/`): plain objects, seeded rng, fixed 60 Hz step, `now` passed in. Input is a data object per
  player (`{ move:[x,y], aim:[x,y], fire, beam, ... }`) so co-op can add a second one later.
- **Ship model** (`js/sim/ship.js`): a grid of cells; a block covers size×size cells; one block = one entry with hp,
  type, rotation. Derived stats (mass, thrust, CPU, crew, power, shields, resistances) are recomputed when blocks change.
  Blocks that lose their path to the core break away as **debris bodies** that tumble.
- **Data first** (`data/*.json`): blocks, weapons, materials, ships (hull classes + premade layouts), factions,
  enemies, goods, quests, systems seed rules.
- Sound: a game-local Web Audio synth for weapon voices (dozens of distinct sounds, no files) + the shared `sfx/`
  library for explosions, loot, interface.

## §3 Milestones (built back to back)
- **M0 Fly**: renderer + post pass, input (keys/mouse/pad/touch), ship grid + smoothing bake, arcade flight, camera
  zoom by ship size, starfield + nebula, asteroids, mining laser, cargo.
- **M1 Fight**: weapons (pulse laser turret, autocannon, machine gun, mass driver, homing missiles, dumb rockets,
  manual beam, plasma, lightning arc, flak, railgun, mines), shields (directional + bubble), armour materials,
  damage types, enemy AI (swarms, gunships, one big), block destruction + debris physics, explosions + shockwaves,
  escape pods, rarity loot with beams.
- **M2 Build**: build mode (palette, place/remove, rotate, arcs drawn, CPU/crew/power budget, stats + resistances),
  repair out of combat, saved designs, mirror/copy.
- **M3 Stations**: docking; shipyard (buy premade ships), outfitter, market (supply/demand, price memory, profit),
  refinery, repair, crew hall, insurance, research lab, salvage yard, black market + bounty board.
- **M4 Galaxy**: star systems, jump, danger tiers, factions + reputation, planets with a low-orbit layer, roaming
  bosses, derelicts + beacons, pirate bases, mining claims.
- **M5 Drones + harpoon**: drone bay, 6+ drone kinds flying ahead of you; harpoon tether that drags asteroids/ships.
- **M6 Big ships**: frigate → destroyer → cruiser → battleship → carrier, bigger blocks, capital guns, massive stations.
- **M7 Quest + drip-feed**: the open quest line, unlock gates, hints.
- **M8 Ship-shape**: What's new, credits, ☰ menu with Report a bug, cloud saves, settings, phone layout, tests, docs.
