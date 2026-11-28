# Dungeons (`js/world/dungeon/`)

Reusable dungeon system for Oathwild (design: `docs/BRAINSTORM-2026-11-27-regions.md` §3). Every module here is
pure: no page, no file reading, no unseeded dice. The same code runs on the server, in the browser and in the tests
(`tests/world/dungeon.test.mjs`).

The first dungeon is **the Catacombs** (`data/dungeons/catacombs.json`): The Ossuary (lvl 6), The Pillared Deep (lvl 7)
and The Barrow Throne (lvl 8), two entrances (the main crypt and a collapsed grave shortcut into level 2), and an exit
behind the boss.

## The spacious rule (owner)

Indoor places leave room for the camera to swing round. Rooms are at least 16 m across, big halls 30-60 m, corridors
6-8 m wide, ceilings at least 6 m (rooms 10-24 m). Columns are 2-3 m thick, reach the ceiling, and stand at least 6 m
from each other and from the walls, so every lane between them is at least 6 m wide. The test sweeps a 6 m camera at
25° round every floor tile: where there is 3 m of floor round you it never gets shorter than 3 m, every tile has
a full-length direction, and the ceiling never shortens it.

## What each file does

| File | What it does |
|---|---|
| `plan.js` | `planDungeon(spec, seed)`: the layout on a 2 m tile grid. All levels share ONE space: each level is lower than the one before and joined to it by a 40 m ramp, so there is never empty space between floors. Gives the tile codes, floor height and ceiling per tile, rooms, corridors, doors, columns, entrances, exits, ramps (`stairs`) and features. `planToJSON` / `planFromJSON` give a smaller saved form. Same seed always gives the same plan. |
| `walk.js` | `createWalk(plan, state)`: **the one answer to "can feet go here?"** for heroes, monsters, pets, knockbacks, spawns and loot. Same method names as `js/game/ground.js` (`settle`, `y`, `standAt`, `solidsNear`, `stepOk`, `swimming`, `inBox`, `boxes`), so the server can use either one as its ground. Moves are checked every 0.5 m and slide along walls and round columns. A body that starts off the grid is first moved to the nearest open tile, so it can never walk through walls from there. |
| `sight.js` | `lineOfSight` (walks the tiles along the line and checks the columns; remembers answers per tile pair), `firstHit` (where a shot stops), `canNotice(walk, monster, target, range)` = in range AND in sight AND a walking path no longer than about range × 1.6. `joinsFight`: a pack mate joins only if it can notice the fight itself. |
| `path.js` | `createPather(walk)`: A* in 8 directions without cutting corners, cached flow fields (the cost from every tile to one target), `goHome` (walks a monster home step by step, never teleports it), `shouldGiveUp` (the path is gone or too long). |
| `encounters.js` | `planEncounters(plan, spec, seed)`: packs on open floor inside their rooms, spread out and away from doors, walls, columns and sarcophagi; named elites, the boss with guards, patrols along corridors. |
| `features.js` | Tile codes, plus gates + levers (a shut gate counts as a wall), secret doors, the chasm with one bridge (the pit is never walkable), sarcophagi (loot spots, sometimes with a skeleton; solid), bone walls (drawing only). Also the gate/door state helpers: `featureState`, `pullLever`, `openSecret`. |
| `camera.js` | `cameraBoom(walk, target, yaw, pitch, want)`: how long the camera arm can be before a small ball swept back from the hero hits a wall, a column, a shut gate or the ceiling. The client should ease toward it each frame. |
| `index.js` | `buildDungeon(spec, seed, saved)` = plan + state + walk + pather + encounters + `pullLever` / `openSecret`. |

## How a game uses it

```js
import { buildDungeon, canNotice, cameraBoom } from './js/world/dungeon/index.js';
const D = buildDungeon(spec, worldSeed, save.dungeons?.catacombs);   // spec = data/dungeons/catacombs.json
// server: D.walk is the place's ground (settle every unit that moved, standAt for spawns and loot)
// monsters: canNotice(D.walk, m, hero, range) replaces the plain distance check; D.pather.goHome(m, m.home, dt, speed)
//           replaces walking home in a straight line; D.pather.shouldGiveUp(m, hero, spec.giveUpTiles) is the leash
// levers: D.pullLever(id) → { gate, open } (send to clients; save D.state)
// client: cameraBoom(D.walk, heroHead, yaw, pitch, wantedBoom) each frame, eased
```

## Drawn in the browser

`js/client/render/dungeon-draw.js` draws a dungeon place from this plan (live-edits.js `makeWorldView` picks it when
`app.W.dungeon` is set): floors at the walk grid's heights, walls only where floor meets rock, a vault over every room
and corridor springing at `plan.ceiling` (so `walk.air`, the camera's space, is always inside the stone), columns,
features, torches baked into the stone + a fixed pool of real lights, flames, dust, the dungeon's own air (no sun, sky
or weather). The camera's indoor boom is `js/client/play/camera.js` (`dungeonWalk`). Pictures and checks:
`tests/ui/dungeon-shots.mjs` (draws the dungeon on its own page `tests/ui/dungeon-view.html`, scans for same-plane
faces, then swaps a real game page to the catacombs and back).

Grid: tile (i, k) covers x ∈ [2i, 2i+2), z ∈ [2k, 2k+2). The plan starts at (0, 0); a region that puts the dungeon
somewhere else shifts points in and out. Facing angles follow `js/rules/combat.js`: angle a points along (sin a, cos a).

## Monster ids not in `data/monsters.json` yet

`crypt_zombie`, `skeleton_archer`, `deep_king` (the Catacombs' end boss, "The Deep King"; the Barrow King stays in
the Vale). The named elites are existing ids with a name: The Bone Warden (`skeleton_warrior`), Gritch the Digger
(`goblin_warchief`), The Deep Troll (`bridge_troll`).
