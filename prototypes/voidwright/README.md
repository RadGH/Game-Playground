# Voidwright

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
  strength and what the shops sell.
- The **quest line** (Goals, J/Tab) gives one vague goal at a time ("mine 25 ore", "make 3,000 profit trading") that
  can be done anywhere; each one unlocks the next part of the game (drip-feed). Finding certain parts unlocks their
  feature early.

## Code map
No build step; ES modules. `index.html` → `js/main.js`.

| Folder | What |
|---|---|
| `js/core/` | `math.js` (seeded rng, noise, angles), `input.js` (keys/mouse, gamepad, two touch sticks → one input object), `audio.js` (a synthesized voice per weapon + the shared `sfx/` library for explosions/loot/UI; positional; beam/mining loops) |
| `js/data/` | Plain data: `types.js` (5 damage types × 3 hit sizes, 14 armour materials, 17 materials, 6 rarities), `weapons.js` (36 weapons/tools incl. 13 alien), `blocks.js` (≈150 blocks: structure in 1×1/2×2/4×4, modules, rock/ore cells), `hulls.js` (8 hull classes + 13 shipyard ships), `factions.js` (3 human + 4 alien), `drones.js` |
| `js/sim/` | The pure simulation (no DOM, no clock): `grid.js` (block grids, connectivity), `ship.js` (bodies, stats, damage, breaking apart), `world.js` (the step: flight, collisions, turrets, shots, beams, shields, splash, destruction, loot, drones, harpoon), `ai.js`, `shipgen.js` (procedural ships + stations from a seed), `galaxy.js` (galaxy, system population, asteroids, outposts, encounter groups), `loot.js`, `economy.js`, `quests.js`, `state.js` (the save), `rand.js` |
| `js/render/` | `post.js` (WebGL2: bloom, coloured light map, up to 16 shockwave ripples with colour split, vignette), `bake.js` (grid → hull picture with the cosmetic slope smoothing + a glow layer), `turret-art.js` (per-weapon turret drawings with recoil), `fx.js` (particles, lights, waves, shake; sim events → visuals), `draw.js` (the frame) |
| `js/ui/` | `dom.js` helpers, `station.js`, `build.js`, `galaxy.js` (star map), `hold.js`, `quests-ui.js`, `minimap.js`, `items.js` |

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
loot, shields, determinism, mining, harpoon, destruction, galaxy, economy, quests) and
`npx playwright test prototypes/voidwright/tests/game.spec.js` (desktop + phone, zero console errors).
