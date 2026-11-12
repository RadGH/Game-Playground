# Voidwright

> **Status:** live on games.radgh.com · QA pass done 2026-11-11 (lint clean, every screen walked on desktop + phone) · enemy toughness taken back + gnat packs 2026-11-11 · checked 2026-11-11
> **Play:** LAN `http://<LAN IP>:8400/prototypes/voidwright/` (stable; https 8442 for a controller) · public https://games.radgh.com/voidwright/
> **Next:** the owner's next play-test — watch whether enemies now feel right and gnat packs are fun; tune `ENEMY_HP` / gnat numbers in `js/sim/shipgen.js` from what he reports
> **Parked:** co-op (the input shape is ready, `docs/PLAN.md`); nothing else on hold

A 2D top-down space game: **build your ship from blocks → kill things or work for things → upgrade → kill bigger
things.** You start in a tiny mining skiff at the edge of a galaxy and can grow into a dreadnought about 100 times
its mass. Started 2026-11-06 from the owner's brief (`docs/OWNER-BRIEF.md`); his 20 rulings are `docs/PLAN.md` §0 —
read both before changing anything.

Play: `http://<LAN-IP>:8400/prototypes/voidwright/` (stable) — `8401` is the working tree. Controllers need the https
ports (8442 stable / 8441 dev).

## How it plays
- **Fly** with WASD / left stick / left thumb. The nose follows the way you fly (owner ruling #10), so fixed forward
  guns point where you travel and turrets cover the sides and back.
- **Aim** with the mouse / right stick / right thumb. Turrets aim and fire on their own; *manual* weapons (beams,
  rocket pods, railguns, plasma cannons, mining lasers) fire where you aim while Fire is held; *fixed* weapons fire
  straight ahead; *missiles* lock onto the marked target nearest your aim and fire with the Missile button.
- **Harpoon** (F / X): spear an asteroid, wreck or ship and drag it around; press again to let go; hold R to reel in.
  The rope is a real spring constraint between two bodies, so a big ship drags *you*.
- **Mine** asteroids (they are block grids too — the laser cuts them cell by cell; ore cells drop ore) and planets
  (fly over one — "low orbit" — and point a mining laser at the ground).
- **Dock** (E) at stations to trade, refit, repair, hire crew, buy ships, insure, research, take bounties.
- **Build mode** (B): place blocks on your hull — structure from materials, parts from your hold. Turret arcs and a
  coverage ring show where you can shoot. CPU is a hard limit; power and crew shortfalls slow your parts down.
- **Star map** (M): jump to linked systems. Danger rises with distance from the start; so do loot quality, enemy
  strength and what the shops sell. Your **warp core** class caps the danger you can jump INTO (Class I = danger 2,
  each class +2, `WARP_CORES` in `sim/galaxy.js`); upgrades are bought at outfitters for credits + materials; safer
  stars are always reachable; locked stars show a padlock. Each star has **traits** (`systemTraits`: enemy density,
  loot luck, asteroid richness, size, economy) that the star map spells out.
- **Local map** (N, D-pad left, or tap the radar; `ui/localmap.js`): the whole system — sun, planets, stations,
  belts, every sector inside sensor range, ships, POIs — with a key; tap anything to set a course marker.
- **Big systems** (30-65 km across): `sim/sectors.js` cuts space into 4 km sectors whose contents (asteroid
  cluster, rich cluster, wreck field, enemy camp, alien swarm, convoy) come from the star's seed alone;
  `streamSectors` fills the ones near you (one per call) and drops far ones, remembering mined rocks and camp kills
  for the visit. **Cruise**: out of combat with no enemy within 2.2 km, top speed ×2.4 (`inp.cruise`).
- **Combat rules (2026-11-11 play-test)**: no friendly fire (shots/beams pass through non-hostiles), ally bumps do
  no damage, allies steer around you (`ai.js avoid`); combat (which blocks building/docking) is only a real
  exchange with an enemy (`world.js noteCombat`). Stations never turn hostile over reputation. **Safe launch**:
  `P.grace` for 6 s after undocking/arriving — nothing can hurt or target you, your auto turrets hold fire, firing
  yourself ends it; hostiles are moved off a friendly station's doorstep (`SAFE_RADIUS` 3.5 km, also kept free of
  spawns/camps). Enemies are hardened (`shipgen.js hardenEnemy`: guns ×0.75 rate; hostile stations ×0.45
  rate, ×0.6 damage, at most 3+danger big guns). One blast deals at most 1.5× its damage to YOUR ship
  (`SPLASH_CAP`). The ×2+ enemy hull and the blast cap on enemies were taken back on 2026-11-11 (owner: "now they
  are too strong") — `ENEMY_HP` is 1.
- **Gnats** (2026-11-11, owner: "low level enemies easy to kill in small swarms without shields"): `generateShip({
  gnat: true })` makes a 3-4 cell dart with one small gun, frame hull, no shield, 60% damage (Gnat-123 for human
  factions, Mite-123 for aliens). `spawnGroup(..., 'gnats')` makes a pack of 5-9; about a quarter of roaming groups
  near home are gnat packs (fewer further out), and the sector streamer adds **Gnat pack** sectors (orange on the
  local map).
- The **quest line** (Goals, J/Tab) gives one vague goal at a time ("mine 25 ore", "make 3,000 profit trading") that
  can be done anywhere; each one unlocks the next part of the game (drip-feed). Finding certain parts unlocks their
  feature early.

## Code map
No build step; ES modules. `index.html` → `js/main.js`.

| Folder | What |
|---|---|
| `js/core/` | `math.js` (seeded rng, noise, angles), `input.js` (keys/mouse, gamepad, two touch sticks → one input object), `audio.js` (a synthesized voice per weapon + the shared `sfx/` library for explosions/loot/UI; positional; beam/mining loops) |
| `js/data/` | Plain data: `types.js` (5 damage types × 3 hit sizes, 14 armour materials, 17 materials, 6 rarities), `weapons.js` (36 weapons/tools incl. 13 alien), `blocks.js` (≈150 blocks: structure in 1×1/2×2/4×4, modules, rock/ore cells), `hulls.js` (8 hull classes + 13 shipyard ships), `factions.js` (3 human + 4 alien), `drones.js` |
| `js/sim/` | The pure simulation (no DOM, no clock): `grid.js` (block grids, connectivity), `ship.js` (bodies, stats, damage, breaking apart), `world.js` (the step: flight, collisions, turrets, shots, beams, shields, splash, destruction, loot, drones, harpoon), `ai.js`, `shipgen.js` (procedural ships + stations from a seed), `galaxy.js` (galaxy, star traits, warp cores, system population, asteroids, outposts, encounter groups), `sectors.js` (big systems filled in as you fly), `loot.js`, `economy.js`, `quests.js`, `state.js` (the save), `rand.js` |
| `js/render/` | `post.js` (WebGL2: bloom, coloured light map, up to 16 shockwave ripples with colour split, vignette), `bake.js` (grid → hull picture with the cosmetic slope smoothing + a glow layer), `turret-art.js` (per-weapon turret drawings with recoil), `fx.js` (particles, lights, waves, shake; sim events → visuals), `draw.js` (the frame) |
| `js/ui/` | `dom.js` helpers, `station.js`, `build.js`, `galaxy.js` (star map), `localmap.js` (local system map), `hold.js`, `quests-ui.js`, `minimap.js`, `items.js` |

### Gotcha
- A station body's `kind` is always `'station'`; what sort it is lives in `stationKind` (`trade`/`pirate`/`hive`).
  Until 2026-11-11 `generateStation` passed `kind` in the makeBody options, which overwrote it — trade stations and
  hives were never treated as stations (their guns never ran, the reputation rules missed them).

### Key ideas
- **Everything is a block grid.** Ships, stations, ground bunkers, wrecks and asteroids share `makeBody(kind, grid)`.
  Shots ray-walk the grid (`rayHit`), splash damages the cells in a radius, collisions sample the smaller body's
  blocks against the bigger body's grid. When blocks die, `splitOff` breaks off anything no longer connected to the
  core into a tumbling wreck; a ship dies when its core goes or its hull drops below 25 % (12 % for the player).
- **Slopes are cosmetic** (ruling #5): `bake.js` cuts outside corners and fills inside corners at 45° on the
  picture only.
- **Armour maths** (`types.js armorDamage`): `max(10 %, dmg × (1 − resist[type]) − flat × sizeFactor)`; size factor is
  1 / 0.45 / 0.12 for light / medium / heavy hits, so plate stops machine guns but not capital shells.
- **Shields**: bubble (whole ship) or deflector (an arc facing the block's rotation), each its own pool with regen
  after a delay; lightning does ×1.6 to shields.
- **Scale**: block size per class (1, 2, 4), weapon DPS per cell grows with mount size, enemy damage scales with
  danger tier (`TIER_DMG` in shipgen). Stations are 70–140 cells across.
- **Determinism**: the sim draws randomness from `world.r` via `rand.js`; same seed + same inputs → same fight
  (tested), which keeps co-op possible later (ruling #19).

## Tools
- `node tools/smoke.mjs [system] [design]` — 30 s headless fight, prints step cost and event counts.
- `node tools/duel.mjs <design> <faction> <tier> <pack|big> <runs>` — balance check, a bot flies a shipyard design.
- `tools/shot.mjs` — Playwright screenshots: `STEPS="click:text=New game~~wait:300~~…" node prototypes/voidwright/tools/shot.mjs name`.

## Tests
`node --test prototypes/voidwright/tests/*.test.mjs` (rules: grids, premades fit CPU/power, scale ratio, armour,
loot, shields, determinism, mining, harpoon, destruction, galaxy, economy, quests; `playtest-1110.test.mjs` = one
test per play-test report 15-23) and
`npx playwright test prototypes/voidwright/tests/game.spec.js` (desktop + phone, zero console errors).


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Voidwright** (2026-11-06 →): 2D top-down space game — ships are grids of SQUARE blocks (slopes are a cosmetic smoothing pass in `js/render/bake.js`), arcade flight with the nose following travel, turrets with arcs, 41 weapons over 5 damage types × 3 hit sizes, bubble + deflector shields, 14 armour materials, mining asteroids cell by cell and planets from low orbit, harpoon tether, drones that fly ahead, 7 factions (3 human, 4 alien), a 46-star galaxy whose danger grows with distance, station shops (market with price memory, outfitter, shipyard, refinery, repair, crew, insurance, drones, research, salvage, bounties, black market), 8 hull classes up to a dreadnought ~100× the starter's mass, an 18-goal quest that drip-feeds features. Pure sim in `js/sim/` (seeded via `rand.js`), WebGL2 post pass (bloom, light map, shockwave ripples) in `js/render/post.js`. Read `README.md` + `docs/PLAN.md` §0 (owner's 20 rulings) first

**Status / key files:** playable 2026-11-06
