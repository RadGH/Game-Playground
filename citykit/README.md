# City Kit (`citykit/`)

**Status:** round 0 of Arcline (2026-11-15) — the review page for every procedural building, wall, turret, creature
and vehicle Arcline will draw, before any gameplay exists.
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
    group: 'industry',           // one of GROUPS in buildings.js
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
Then add one `import` line in `js/kit/all.js`. Shapes to build with: `js/kit/shapes.js` (`box`, `cyl`, `dome`,
`storeys` — a block of floors with windows on four sides, `slab`, `neonEdges`, `sign`, `roofProps`, `balconies`,
`lotPad`). Materials: `js/kit/materials.js` (`STYLES`, `bodyMat`, `trimMat`, `glassMat`, `neonMat(color, dayGlow)` —
anything that should light up at night must use a material with `userData.glow`). Heights: `FLOOR` (one storey).

## The page

- **Catalog**: every item by group, its settings as sliders (style, seed, storeys…), the 4 view turns (Q / E),
  zoom (Fit, ½×, 1× = the game's own size, 2×), and time of day from noon to night. **Copy settings** puts the item's
  numbers on the clipboard to paste to Claude with what to change.
- **Variants**: every view turn (rows) × the first setting at evenly spaced values (columns) — e.g. the Hotel at
  1 … 48 storeys from all four sides.
- **Scene**: (coming this round) a strip of city with a wall line, turrets firing, creatures arriving, and the
  weather/sky effects.

`window.citykit` exposes `{ state, RECIPES, baker, pairFor, select }` for tests.

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
| `js/kit/all.js` | Imports every kit file |
| `js/app.js` | The review page |
