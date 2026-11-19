# Mech Kit (`mechkit/`)

**Status:** round 0 of Overdrive Frame (2026-11-17) — every mech part with its stats, the layered bake the game will
draw with, and a dress-up page to check every part, paint, direction and animation outside the game.
**Play:** http://192.168.1.34:8400/mechkit/ (stable) · dev 8401
**Next:** Overdrive Frame round 1 draws the player's mech with `composeMech` (see `prototypes/overdrive-frame/docs/PLAN.md`).
**Parked:** firmware chips and rolled loot bonuses (round 2: the hangar); a shared "sharp" baker is on the page only.

Owner (2026-11-17): "I would also like an experiment screen to view mech parts and 'dress up' the mech, to check all the
parts visually outside of the game (same purpose as building kit)." Mech look: a different style per maker; mixing
makers looks odd on purpose. Mechs can be drones (no pilot).

## The four makers (`data/makers.json`)

| Maker | Look | Leaning | Leg types |
|---|---|---|---|
| Celerity Works | Sleek, angular: knife-edge plates, swept fins, narrow waist, glowing seams | Speed, energy weapons, thin armour | two legs ×2, bird legs, hover delta |
| Brannoch Heavy Industries | Chunky industrial: slabs, bolted plates, rams, hazard stripes, exhaust stacks | Armour, kinetic + explosive, heavy carry | two legs ×2, four legs, treads |
| Calyx Biomechanics | Rounded organic: smooth shells, capsule limbs, ring joints, glowing pods | Endurance, odd tech: shields, repair, chain lightning | two legs, mantis four legs, jellyfish hover |
| Patchwork Salvage | Scrap-built: mismatched plates, exposed pipes, roll cages, a bare bulb | Cheap, light, hot-running: fire, mines, turrets | two legs, hopper bird legs, treads |

## Parts (`data/parts.json` — the game reads this same file)

172 parts: per maker 5 heads, 5 cores, 5 arms, 5 boosters, 5–6 legs, 2 generators, 2 coolers, 2 CPUs (126 frame
parts) + 46 weapons (11–12 per maker; 16 added in Overdrive Frame round 7). Every head / core / arms / booster / legs part carries `line` — its frame line. Every part: `{ id, name, slot, maker, class, tier, weight, energy, heat, cost, … }`
plus its slot's numbers — armour parts `ap` + `res` (% resisted per damage type); head `scan`, `stability`; core
`supply` (% of generator output), `boostEff`, `stability`; arms `aim`, `recoil`, `melee`, `handLoad`; legs `type`,
`speed`, `jump`, `carry`, `turn`, `stability` (`hoverTime` on hover); booster `thrust`, `qbThrust`, `qbCost`,
`qbCooldown`, `boostCost`, `boostHeat`; generator `output`, `capacity`, `recharge`, `delay`; cooler `sink`, `rate`,
`recovery`; CPU `firmware`, `lockSpeed`, `lockCount`, `lockRange`; weapons `kind`, `mount` (arm | shoulder), `hand`
(one | two), `type` (kinetic | energy | explosive | fire | electric), `damage`, `rate`, `range`, `ammo`, `mag`,
`reload`, `heatPerShot`, `shotEnergy`, `lock` (none | aim | homing | multi), `impact`, and extras (`salvo`, `pellets`,
`blast`, `chain`, `heal`, `block`, `drones`, `turrets`, `mines`, `burn`, `charge`, `pierce`, `melee`).
Round 7 kinds (weapons that do something other than shoot bullets — models in `js/parts/weapons.js`, numbers in the game's
`js/sim/weapon-kinds.js`): sweep lance, prism laser, orbital lance, wave scythe, rift needler, cluster mortar, gravity well
launcher, cryo projector, arc coil, seeker orbs, storm caller, nanite sprayer, firepot lobber, returning saw disc, ricochet
gun, spark carbine. `elementTypes` (cryo, void) are weapon-only damage types: armour carries no resistance to them.
Effect fields a weapon part may carry: `ricochet`, `chainJumps` + `chainChance`, `seek`, `echo`, `wellRadius` +
`wellTime` + `wellPull` + `wellDps`, `cluster`, `napalm`, `leech`, `overkill` (units in the file's `about`).
Weapon kinds: rifle, machine gun, shotgun, laser rifle, pulse gun, laser blade, pile driver, buzzsaw, shield (slab and
energy petals), single / salvo / vertical missile pods, homing swarm pods, grenade launcher, mortar, railgun, gatling,
sniper cannon, flamethrower, chain lightning, plasma cannon, repair beam, drone bay, mine layer, turret deployer, rivet gun.
`js/stats.js` adds a build up (pure, the game's sim uses it too): load vs carry limit (overload slows every move),
energy draw vs generator output × core supply, heat (idle + full fire + boosting vs cooling → seconds to overheat),
resistances weighted by armour, damage per second (salvos, pellets and reloads counted), and a list of problems.

## Frame lines (`data/lines.json`)

Owner (2026-11-18, Overdrive Frame round 7): "I would like each faction to have multiple mechs, not just one frame."
A **line** is a matching head / core / arms / booster / legs set with its own silhouette and role inside its maker's
shape language. `lines.json` lists every line `{ id, maker, name, tier, legType, isNew, parts, look, role,
suggestedBonus }` — `suggestedBonus` is a set-bonus idea for wearing 3+ parts of the line (null for legs-only lines).
The three original lines per maker (Wisp / Stride / Halberd …) are the same drawer at three sizes; round 7 added two
clearly different lines per maker (each part keeps its numbers inside the existing bands of its slot):

| Maker | Line | Tier | Legs | Look | Leaning |
|---|---|---|---|---|---|
| Celerity | Vantage | 2 | bird | sensor-mast head, dorsal blade, scoped arms, tail-fin booster, stilt legs with vanes | scan, aim, jump |
| Celerity | Rapier | 3 | two legs | crested one-slit helm, wasp-waisted V chest with coat-tail fins, tonfa blades, X booster, spiked legs | melee, quick boost, turn |
| Brannoch | Redoubt | 3 | four legs | periscope bunker head, casemate core with sandbags, mantlet arms, braced legs on pads | armour, stability, recoil |
| Brannoch | Breaker | 2 | treads | caged welding-mask head, wedge prow, ram shoulders + big fists, dozer blade | melee, charge boost |
| Calyx | Bloom | 1 | hover | flower head, pod-cluster core, halo shield booster, ring of floating seed pods | energy supply, cool running, hover |
| Calyx | Sickle | 3 | bird | triangle mantis head, hunched thorax + abdomen, scythe forearms, wing-case booster | melee, speed, turn |
| Patchwork | Hauler | 2 | treads | crane-cab head with beacon, skip-bin core, crane jib + winch arms, exhaust stack, forklift tines | carry, hand load |
| Patchwork | Pogo | 1 | bird | bucket head with traffic-light eye, barrel core with a flag, scaffold-pole arms, pogo-spring legs | jump, cheap boosts |

New looks come from knobs on the shared drawers (`limbs.js`: arm `shoulder` / `forearm` extras in `SHOULDER` /
`FOREARM`, biped `spike`, bird-leg `vanes` / `pogo` / `shovel`, quad `bunker` / `pads`, treads `dozer` / `forks`,
hover `pods`) and new head / core / booster drawers in each maker file. The Line-up shows one card per line.

## How it works

1. **Visuals** (`js/parts/*.js`): `addParts({ id: { … } })`, the same ids as the data. Every maker draws through its
   own shape language in `kit.js` (`block`, `limb`, `joint`, `lamp`: chamfered facets / rounded slabs + rams / capsules +
   rings / plain boxes + straps), so one leg or arm drawer (`limbs.js`) gives four looks. Paint regions are marked on
   materials (`paint(mk, 'primary' | 'secondary' | 'accent')` → `userData.paint`); lights use City Kit's `neonMat`.
   Internal parts (generator, cooler, CPU) get a small model for icons and the hangar.
2. **The rig** (`js/rig.js`): `legsRig(id).pose(anim, phase)` redraws the legs for one moment and returns the **hip
   socket** (height + sway); each leg type moves its own way (bipeds stride, bird legs hop on a raised heel, four legs
   step in diagonal pairs, treads roll their links, hover skirts bob). `upperRig(build)` hangs the core, head,
   booster, arms and weapons from the hip; arms are 2-bone IK to their hands, a two-handed weapon sits in one hand and
   the other hand reaches for its front grip. Animations — legs: idle, walk, boost, jump, hover, land, quick boost,
   down; upper: idle, fire left, fire right, fire shoulder (recoil), down. `animAlt(anim, phase)` = how high the game
   should lift the mech (the legs bake never leaves the ground, so shadows stay put).
3. **The layered bake** (`js/bake-mech.js`, on City Kit's `Baker`): each part is baked **alone in its assembled pose**,
   per screen direction (16) × frame, into `{ day, lights, paint, mask, w, h, ax, ay }` (`paint` = the mask picture, `mask` = its pixels). Upper parts are baked with the hip at
   a fixed height rounded to a whole pixel, and their anchor **is** the hip; the legs' anchor is the ground and `hip`
   is the pixel the upper body hangs on. Painted areas are baked grey; the **mask** (R primary, G secondary, B accent,
   white = lights) lets `tinted()` repaint them at run time (and recolour lights). Shadows are baked once for the legs
   and once for the whole upper body as solid masks and drawn merged, so parts never double-darken and a jumping mech's
   shadow stays on the ground. Draw order per aim direction: far parts first by their middle's distance from the camera;
   legs under everything. Bakes are lazy and cached (LRU).
4. **`composeMech(ctx, layers, legDir, aimDir, frame, paint, t, { x, y, zoom, alt })`** draws one mech: shadows, legs,
   then the upper layers on the hip; night = City Kit's `composite` (darken + add lights). It returns the hip, the top
   and each weapon's **muzzle** pixel, so the game draws flashes and shots from the right spot. Default bake scale 3:
   a 0.75-unit (12 m) mech is ~90 px tall, the size the game draws.

```js
import { MechBaker, mechLayers, composeMech } from '../../mechkit/js/bake-mech.js';
const mb = new MechBaker({ scale: 3 });
const layers = mechLayers(mb, build);                     // lazy
composeMech(ctx, layers, legDir, aimDir, { legs: ['walk', 3], upper: ['fire-R', 0] }, paint, night, { x, y });
```

## The page (`index.html`, `css/mechkit.css`, `js/app.js`)

- **Dress up**: a part per slot (‹ › and a list, filtered by maker), weapons per slot (a two-hander frees the other
  hand), paint (Maker colours — each part in its own maker's paint — plus 15 schemes and primary / secondary / accent /
  lights swatches + a colour picker), separate **legs** and **aim** dials (A / D, ← / →, drag; "Aim with legs", "Aim at
  pointer" — click to fire — and "Spin"), a player per layer (legs + upper animation, play / pause / step, lift off for
  jump and hover), zoom (1× = the game's size, 2×, Fit), time of day, "Show" one layer alone, hip and muzzle markers,
  "Sharp close-up" (pictures at 2× detail), **stats** with every number (load vs carry in red when over, energy draw vs
  output, heat, targeting, arms, each weapon), Random build (R — fits its legs; uses the maker filter), Random paint (P),
  Copy settings (C — the build JSON for Claude), Starter build.
- **Parts sheet**: every part of a slot side by side, on your mech (framed on that part) or alone; Fit to my mech.
- **Line-up**: one card per frame line (its own parts in factory paint, with its role), plus each maker's other legs.
- Part lists name each part's line ("Celerity · Vantage line · Light").
- Controller: d-pad / left stick move the highlight, A presses, B closes a list; right stick aims; LB / RB turn the
  legs; X random build, Y random paint, Start play / pause, Back copy. Key hints follow the device.
- `window.mechkit = { state, PARTS, MAKER, mb, layers, composeMech, mechLayers, setBuild, equip, buildStats, showView, redraw }`.

## Tests

- `tests/parts.test.js` (node, in `npm run test:unit`): data complete and in range, 3+ per visible slot per maker,
  every frame part in a described line (and nothing else), 2+ new full lines per maker on different leg types, new
  lines at every tier, new parts inside the existing number bands,
  every brief weapon kind and damage type, every id has a visual, no banned names, build totals = sum of parts,
  overload / energy / two-hander problems reported, random builds fit, dps counts salvos and reloads.
- `tests/mechkit.spec.js` (Playwright; run alone under the lock): every part builds and bakes (alone and fitted, weapons
  have muzzles); **alignment** — for every legs part × animation × frame × 16 directions the hip pixel matches the bake
  camera's own projection and the socket touches the legs' geometry, marker bakes prove the hip pixel / core attach
  pixel / arm shoulder land where the pictures say (≤ 1 px; every arms part on its own line's core), and composeMech puts every core on every legs part's hip;
  paint changes only masked pixels; the page works with zero console errors at 1280×800 and 390×844.

## Files

| File | What |
|---|---|
| `data/makers.json`, `data/parts.json` | The makers and every part's stats |
| `data/lines.json` | Frame lines: look, role, set-bonus idea, parts |
| `js/data.js` | Loads the JSON (fetch + top-level await; no import attributes) |
| `js/parts/kit.js` | Geometry cache, maker materials + paint regions, the maker shape language, IK |
| `js/parts/limbs.js` | Leg drawers per leg type + the arm drawer, dressed per maker |
| `js/parts/celerity.js` … `patchwork.js` | Each maker's heads, cores (with sockets), arms, boosters, legs |
| `js/parts/weapons.js` | One drawer per weapon kind (sets the muzzle) |
| `js/parts/internal.js` | Generator / cooler / CPU models |
| `js/rig.js` | Assembly, sockets, animations, `animAlt` |
| `js/bake-mech.js` | `MechBaker`, `mechLayers`, `composeMech`, `tinted`, `drawPart` |
| `js/stats.js` | Build totals and problems, `randomBuild` |
| `js/app.js`, `js/padnav.js` | The page; controller menus (copied from Arcline) |
