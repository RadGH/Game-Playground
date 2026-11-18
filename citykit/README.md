# City Kit (`citykit/`)

**Status:** round 0 of Arcline (2026-11-15) — the review page for every procedural building, wall, turret, creature
and vehicle Arcline will draw, before any gameplay exists. Overdrive Frame round 0 (2026-11-17) added catalog
categories, wreck stages for every building and true-to-scale workshop props.
**Play:** http://192.168.1.34:8400/citykit/ (stable) · dev 8401
**Next:** see `prototypes/arcline/docs/PLAN.md` rounds; the game bakes its sprites with this kit.
**Parked:** terrain + road tiles move to Arcline round 1 (they depend on the terrain system's slopes and water).

Owner ruling (Arcline Q15, 2026-11-15): "3d models → 2d sprites. Buildings should be procedural so the same Hotel
could come in 1,2,3,4 floor varieties etc. Create an experiment page where all the options are listed so I can easily
review/adjust without having to actually play the game to see it. These models may possibly be useful later for reuse."

## How it works (SimCity 4's trick)

1. A **recipe** builds a three.js model from a few numbers (storeys, size, style, seed). Same numbers → same model.
2. The **baker** (`js/bake.js`) renders it from the fixed iso camera (`js/iso.js`: 30° down, 45° turned, a tile is a
   64×32 diamond at 1×) into two pictures that line up pixel for pixel:
   - **day** — sun-lit, with its soft shadow on the ground, transparent elsewhere;
   - **lights** — only what glows (lit windows, neon, beacons), black elsewhere, with a soft halo.
   At night the game darkens the day picture and adds the lights (`composite()`), so one bake covers the whole day.
3. Each picture carries its **anchor**: the pixel where the model's ground origin (its lot centre) lands. The game
   puts the anchor on the tile centre.
4. **Turning the map**: 4 view turns. Buildings are baked once per turn (the model turns, the camera and sun stay).
   Things that face a way (creatures, vehicles, turret heads) are baked per **screen direction** instead
   (8 or 16, 0 = up the screen, clockwise; `headingOfDir` / `dirOfHeading` in `iso.js`), so one set works at every turn.
   Things that run along the grid (vehicles on roads) are baked per **ground direction** instead
   (`groundDirOfHeading` / `headingOfGroundDir`: even steps of world heading as seen from the view, so the four road
   directions are exact steps). A road runs ~26.6° off the screen's horizontal — between screen steps — so a car baked
   for the nearest screen step looked like it was driving crabwise (owner report 2026-11-16).

Everything is code: no image files, no model files. Materials and textures are cached.

## The recipe contract (every kit file follows it)

```js
import { addRecipes } from './buildings.js';
addRecipes({
  'my-thing': {
    name: 'My Thing',            // player-facing name (original, no third-party names)
    group: 'industry',           // one of GROUPS in buildings.js (a kit file may add its own group, like parks.js)
    genre: ['neon'],             // optional: catalog categories (CATEGORIES in buildings.js: neon, industrial,
                                 //   military, alien). Left out = ['neon'] (Arcline's futuristic city).
    bakeScale: 8,                // optional: bake bigger for tiny props (the page uses it; default 2)
    zone: 'I',                   // optional: R / C / I for zoned buildings
    size: [2, 2],                // lot in tiles (buildings/walls). Nothing may stick out past ±size/2 in x and z.
    blurb: 'One line for the review page.',
    params: [{ key: 'floors', label: 'Storeys', min: 1, max: 8, step: 1, def: 3 /*, names: [...] for a pick list */ }],
    build(p) { /* p.style, p.seed, p.R (seeded random), plus your params */ return group; },
    // things that face a way:
    dirs: 8,                     // 8 or 16 screen directions
    anims: { walk: { label: 'Walk', frames: 8, fps: 10 }, attack: {...}, die: { ..., once: true } },
    // build() returns a group whose userData.pose(anim, phase 0..1, heading) poses it (creatures, vehicles),
    // or userData.face(heading) for a turret head. heading = world angle (radians, atan2(dz, dx)).
  },
});
```
Then add one `import` line in `js/kit/all.js`.

**Common settings** (`commonParams(id)` in buildings.js) come on top of a recipe's own params: every recipe in a building
group (`WRECK_GROUPS`: homes, shops, industry, services, parks, colony, landmarks, outposts; opt out with `noWreck: true`)
gets **`damage`** 0..3 — Whole / Damaged / Burning / Rubble. `build(id, { damage: 2 })` builds the whole building and then
runs `wreck()` (`js/kit/wreck.js`) on it, so no recipe needs its own damaged version and Arcline (which never passes
`damage`) is unchanged. `defaults(id)` includes the common settings.

### Wreck stages (`js/kit/wreck.js`)
`wreck(group, stage, seed, { size, style })` post-processes any finished model; seeded and repeatable, nothing added
outside ±size/2. Every BoxGeometry in the model (storeys, slabs, signs, at any rotation) is cut into cells (a storey
high, ~0.22 tiles across); a cell goes when it is in the stage's "gone" region, or rests on something that went. What is
left is rebuilt column by column with its facade texture mapped to the same windows; new inside faces show bare floors.
- **1 Damaged**: a chunk off a top corner, soot + cracks and smashed windows (decals), 45% of window faces dark, a third
  of the neon dead, a small debris pile at the foot of the wall.
- **2 Burning**: a big bite out of the main block's top corner (+ a hole in the side of a tall one), a jagged roofline,
  broken floor slabs and rebar at the cuts, fires on whatever is now on top (raycast) and burning windows round the cuts
  (glow material: shines in the lights picture), dark smoke drifting back, power out, heavy soot, a bigger debris pile.
- **3 Rubble**: a heap of slabs, beams and chunks over the footprint (height grows with the building), ragged outer wall
  stubs and one to three taller stubs toward the back, charred tree stumps, embers and a few small fires.
Decals (`userData.decal`) darken what is behind them in the lights picture instead of blacking out a square (bake.js).

### Workshop props (`js/kit/workshop.js`, group `workshop`, genre `industrial`)
For Overdrive Frame's title workshop and hangar (`prototypes/overdrive-frame/docs/ARCH.md`). **True to scale: 1 unit =
16 m** (`M = 1/16`). Forklift (forks down/up, paint), Semi Truck (cab colour; box van / flatbed / tanker), Gantry Crane
(span 16–30 m, hook height), Scaffolding Tower (levels), Mech Maintenance Cradle (walkways, service arms), Welding
Scissor Lift (deck height, welder), Cable Reel, Tool Cart, Oil Drums, Crates & Containers, Pallet Jack, Crew Member
(stand / point / weld / carry, coveralls colour; `crewFigure()` is exported for scenes), Hanging Work Lamp (its ground
point is the lamp: hang it at any height), Floor Markings (mech bay, walkway, hazard zone, parking bays). Forklift,
truck, pallet jack and crew face a way (`dirs: 8`, `userData.face`). Shapes to build with: `js/kit/shapes.js` (`box`, `cyl`, `dome`,
`storeys` — a block of floors with windows on four sides, `slab`, `neonEdges`, `sign`, `roofProps`, `balconies`,
`lotPad`). Materials: `js/kit/materials.js` (`STYLES`, `bodyMat`, `trimMat`, `glassMat`, `neonMat(color, dayGlow)` —
anything that should light up at night must use a material with `userData.glow`). Heights: `FLOOR` (one storey).

### Hangar pieces (`js/kit/hangar.js`, group `hangar`, genre `industrial`)
Overdrive Frame round 2's walkable hangar (`prototypes/overdrive-frame/js/sim/hangarmap.js` lays them out). Same scale as
the workshop props; back walls are 1.9 tiles (~30 m, two and a half mechs). Wall pieces are built along x with their
working face toward +z (the game turns them with the lot's `rot: 3` for the other back wall). Every bay sign glows in its
station's colour (`STATIONS`), so the bays read across the floor at the hangar's indoor light; the game paints the bay
names on the floor rather than baking words. The dropship (`of-dropship`, the game's `js/render/props.js`) has a
`parked` setting (gear down, on the pad).

## Enemies (Overdrive Frame, `swarm.js` + `army.js`)

Every enemy faces 16 screen directions and is rebuilt per frame by `userData.pose(anim, phase, heading)`; each kind has
its own animation list in `anims` (walk/attack/die, plus leap, spit, charge, slam, emerge, burrow, swell, burst,
spawn, summon, roar, deploy, fire, open, hover, jam, brace, aim…). Extra contract, all from `enemy-bits.js`:

- `dims: { len?, h? }` on the recipe: its size in tiles (1 = 16 m; a mech is 0.75 tall), checked by `tests/enemies.spec.js`.
- `userData.face(aim)` turns a turret / launcher to a world heading on its own; `layers: ['hull', 'turret']` recipes
  also have `userData.only('hull' | 'turret' | null)` so the game bakes hulls and turrets apart (same frame and anchor)
  and pairs any hull facing with any turret facing.
- `userData.muzzles()` → every barrel / nozzle / tube tip (`muzzle`, `muzzle:<n>`) in model units, for spawning shots.
- Boss parts: `parts` on the recipe, `userData.breakPart(name, on)`; the model has `part:<name>` groups, or a
  `stump:<name>` once shot off. The review page has a Whole / Shot off setting per part (`brk_<name>`).
- Flyers (`flyer: true`) hover at the `alt` setting; the baker's shadow sits on the ground under them.
- Glows: eyes, sacs, pores, vents, visors, the army's faction stripe, head/tail lights, engine glow — all glow
  materials, so the lights layer carries them at night. Deaths throw pieces and fire; glows go dark.

## The page

- **Catalog**: every item by group, its settings as sliders (style, seed, storeys…), the 4 view turns (Q / E),
  zoom (Fit, ½×, 1× = the game's own size, 2×), and time of day from noon to night. **Copy settings** puts the item's
  numbers on the clipboard to paste to Claude with what to change.
- **Categories**: chips above the list (All, Neon city, Industrial & workshop, …, with counts) filter the list and the
  phone's pick list; several can be on, the choice is remembered on this device. Mouse, tap, keyboard, and a controller
  (D-pad / stick walks the focus through the page, A presses, LB / RB turn the view).
- **Variants**: every view turn (rows) × one setting at evenly spaced values (columns) — the first setting unless
  **Across** picks another, e.g. the Hotel at 1 … 48 storeys, or at every Damage stage, from all four sides.
- **Scene**: (coming this round) a strip of city with a wall line, turrets firing, creatures arriving, and the
  weather/sky effects.

`window.citykit` exposes `{ state, RECIPES, baker, bakerFor, pairFor, select }` for tests.

## Files

| File | What |
|---|---|
| `js/iso.js` | The view: tile size, 2:1 projection, rotations, screen directions ↔ world headings |
| `js/bake.js` | `Baker` (model → day + lights pictures + anchor), `composite` (day/night on a 2D canvas), `halo` |
| `js/kit/rng.js` | Seeded random |
| `js/kit/materials.js` | Styles, facade window textures (day + night lit windows), neon, signs |
| `js/kit/shapes.js` | The building blocks |
| `js/kit/buildings.js` | Groups, the recipe registry, homes + shops/offices + hotel |
| `js/kit/power.js` | Power pylon (`pwr-pylon`): lattice mast, crossarm with glowing insulators; exports `PYLON` (where the game hangs its wires) |
| `js/kit/street.js` | Street furniture (`st-lamp` street light, one or two arms; `st-billboard` billboard or neon blade sign, 6 colours, word-free patterns) — Arcline stands them along roads and at shops (report #71) |
| `js/kit/zoned.js` | 24 zoned buildings so every zone comes in 1×1, 2×1 and 2×2 lots at every level: homes (`res-court`, `res-duplex`, `res-townhouse`, `res-walkup`, `res-slim`, `res-midrise`, `res-needle`, `res-twin`), shops/offices (`com-kiosks`, `com-mart`, `com-corner`, `com-gallery`, `com-studio`, `com-capsule`, `com-spire`, `com-exchange`), industry (`ind-shed`, `ind-yard`, `ind-printworks`, `ind-chemworks`, `ind-freight`, `ind-cleanlab`, `ind-assembly`, `ind-robotics`); `tests/zoned.spec.js` checks every storey × style × seed × turn stays in its lot |
| `js/kit/parks.js` | Parks & plazas group (Arcline round 4): `pk-pocket`, `pk-fountain`, `pk-playground` (1×1), `pk-court` (2×1), `pk-promenade` (3×1), `pk-garden`, `pk-skate`, `pk-memorial`, `pk-neon`, `pk-terrace` (2×2), `pk-central`, `pk-amphi` (3×3), `pk-biodome` (4×4); moves the Park & Plaza and Arena into the group |
| `js/kit/wreck.js` | `wreck()`: damage stages 1–3 for any building model (`DAMAGE_NAMES`); `tests/wreck.spec.js` |
| `js/kit/workshop.js` | Workshop & industrial props, true to scale (`crewFigure`, `M`); `tests/workshop.spec.js` measures them |
| `js/kit/hangar.js` | Overdrive Frame's hangar hub + test range (group `hangar`, category Industrial): `hg-wall` (ribbed + catwalk, window band, pipes + vents, column, range berm; `len` 1–6), `hg-bay` (the back of a bay: neon sign with a word-free pictogram in the station's colour + the station — contracts terminal, assembly cradle, parts dealer shelves, workshop fabricator, paint booth, range blast door), `hg-spine` (lockers + pipes between bays), `hg-rail` (low safety rail), `hg-target` / `hg-target-armour` / `hg-target-sled` (range targets, 16 facings) |
| `js/kit/enemy-bits.js` | Shared pieces for posable enemies: mesh builders, two-bone IK + gait steps, thrown debris / fireballs / flames for deaths, and `poseable()` (the pose wrapper with `face`, `only`, `breakPart`, `muzzles`, and a ground clamp so nothing is drawn under the street) |
| `js/kit/swarm.js` | Overdrive Frame's alien Swarm (group `swarm`, category Alien): `sw-swarmer`, `sw-leaper`, `sw-spitter`, `sw-brute`, `sw-burrower`, `sw-bloater`, `sw-hive` (1×1), `sw-hive-great` (2×2), `sw-broodmother` (boss, 2×2, breakable parts) |
| `js/kit/army.js` | Overdrive Frame's rival army (group `army`, category Military): `ar-troopers`, `ar-tank`, `ar-rocket-truck`, `ar-apc`, `ar-gunship`, `ar-drone`, `ar-aa`, `ar-shield`, `ar-jammer`, `ar-sniper`; paint + faction stripe settings |
| `tests/enemies.spec.js` | Every swarm/army recipe × animation × 16 facings poses cleanly and stays above the street; sizes match `dims` and ARCH.md; the broodmother loses each part alone; turrets point within 6° of their aim; hull/turret layers split |
| `js/kit/all.js` | Imports every kit file |
| `js/app.js` | The review page |
