# Farhold (prototype, phases 1–2)

A third-person action RPG on a whole procedural planet. You land on a real world of a real star
system, walk it out to the horizon, fight what lives there, and wear what it drops — and the other
planets of that system are genuinely in the sky above you.

Working title. Independent project (Radley Sustaire). Sandbox.

**Run it:** `./serve.sh --bg` from the playground root, then
`http://192.168.1.34:8400/prototypes/farhold/` (LAN IP: `hostname -I | awk '{print $1}'`).

[`PLAN.md`](PLAN.md) is the ten-phase plan; [`BRAINSTORM.md`](BRAINSTORM.md) is the idea pile behind
it. There is still **no sound and no dialogue** — the user asked for those to wait (phase 7).

---

## What works now

| | |
|---|---|
| **Land** | A seed picks a star, its system and a landable planet (`universe/`), and World Forge draws that planet's surface (`worldgen/`). |
| **Walk** | 163 km × 82 km of ground with real elevation, drawn to a horizon 7.8 km away. |
| **Look up** | The star crosses the sky on a 15-minute day; the system's other planets and this planet's moons hang where their orbits put them, each wearing its own weather. |
| **Weather** | 14 kinds of sky — clear through thunderstorm, blizzard, sandstorm, ashfall, ion storm — chosen by the climate you are standing in, rolling in and out over minutes. |
| **A planted world** | Trees, conifers, palms, ferns, reeds, cacti, crystals, mushrooms, boulders, bones and grass, by biome — plus ruins, columns and standing stones. |
| **The map made real** | The rivers, roads, bridges, villages, towns and cities World Forge already placed are built on the ground you walk. |
| **Fight** | 16 enemies over two body types — Chibi 2 humanoids and `avatar-3d` creatures — that wander, notice you, chase and swing. |
| **Loot** | Real Emberveil items: bases, affixes, qualities, uniques and set pieces, with rarity colours and an upgrade arrow. |
| **Grow** | XP, 30 levels, attribute points, gear that changes your damage and the weapon in your character's hand. |
| **Debug** | A menu on **`** (backtick) for weather, time of day, world density, teleports and character tools. |

## Controls

`WASD` move · `Shift` run · `Space` jump · left click swing (click once to capture the mouse) ·
`I` or `Tab` character sheet · **`` ` `` debug menu** · `Esc` release the mouse.

URL options: `?seed=7`, `?auto=1` (skip the title), `?quality=low` (smaller budgets — what the
Playwright specs use), `?weather=storm` (start in a given sky and hold it).

---

## How the ground works

The planet is **one world map, sampled continuously**.

`js/planet.js` is pure JavaScript — no Three.js, no DOM — and answers one question:
`heightAt(x, z)` in metres. It samples the world map's elevation smoothly between cells, converts it
to metres with the planet's own relief scale, and adds two octaves of noise for the detail between
cells. That is exactly what `worldgen/js/local.js` does when it zooms into a tile, so **what you walk
over matches what the map said was there**, and the same seed always grows the same hill.

```js
import { createWorld, makeTerrain } from './js/planet.js';
const { star, system, planet, world } = createWorld({ seed: 7 });
const terrain = makeTerrain(world, planet);
terrain.heightAt(12_400, 8_900);   // metres above sea level
terrain.colorAt(12_400, 8_900);    // [r,g,b] 0..1 — biome, rock on slopes, snow up high, sand at the shore
terrain.climateAt(12_400, 8_900);  // what the weather model needs
terrain.riverAt(x, z);             // 0..1 how much river runs through here
terrain.spawnPoint();              // dry, flat-ish, and near a road or a town
```

Scale: **one world-map cell is 640 m** (`M_PER_CELL`). A 256 × 128 map is a surface 163 km × 82 km.
Heights come from `reliefFor(planet)` in `universe/`, so a light world has taller mountains.

**Rivers and roads are cut into the ground, not painted on it.** `makeTerrain` builds a softened mask
from the map's river cells and road cells, then `heightAt` quietens the detail noise along a road (a
road is graded) and subtracts a valley under a river. At a real river cell the bed sits 7–99 m below
the ground 400 m to either side, so the water surface `js/features.js` lays down has a valley to sit
in instead of draping over a hill.

### Drawing it: rings, not chunks

`js/terrain.js` draws concentric **square rings** centred on the player. Every ring has the same
vertex count but covers three times the area of the one inside it, each with a hole where the finer
ring covers it:

| Ring | Covers | Per quad |
|---|---|---|
| 1 | 192 m | 2 m |
| 2 | 576 m | 6 m |
| 3 | 1.7 km | 18 m |
| 4 | 5.2 km | 54 m |
| 5 | 15.6 km | 162 m |

Five meshes, five draw calls, ~92,000 triangles for the whole visible planet. A ring only rebuilds
when the player crosses one of its own cells. Colour is per-vertex, so one material paints every
biome, and normals come from heights already sampled.

### The sky is a second scene

`js/sky.js` renders the sky into **its own scene with a camera at the origin** that copies only the
player camera's rotation; the world is then drawn over it with the depth buffer cleared. Everything
in the sky is infinitely far away for free — no depth-precision fight, and nothing up there can clip
into a mountain.

**Where the planets sit is real.** Each body's heliocentric angle comes from its own orbital period;
the difference between its angle and ours decides where it appears relative to the star. An inner
planet hangs near the sun at dusk; a planet at opposition rides overhead at midnight. Each is built
by `createPlanet()` from `assets/js/space-models.js` **with its own cloud deck**
(`universe/js/texture.js` `cloudTexture`, tinted by that planet's own palette), so a neighbour's
weather and atmosphere are visible from here.

**How big they are drawn is not real.** A sibling's true angular size is a dot. `balance.json`
`sky.siblingScale` (default 160) exaggerates it on purpose — the same cheat every space game makes.
Set it to 1 for the honest sky. **Moons need no cheat**: these worlds keep their moons 5–10 planet
radii out (our own Moon is at 60), so `moonScale: 1` already fills a chunk of the sky. Note a moon's
orbit is given in *planet radii*, not AU; `js/sky.js` converts through the parent planet's radius.

---

## Weather

The model is **not** in this prototype — it is `worldgen/js/weather.js`, shared with World Forge, and
it is pure data and arithmetic with no renderer in it.

```js
import { weatherWeights, rollWeather, WeatherClock, atmospherePalette } from '/worldgen/js/weather.js';
const weights = weatherWeights(terrain.climateAt(x, z));   // { clear: 3.2, rain: 1.1, storm: 0.4, … }
const clock = new WeatherClock({ weights, seed: 7 });
clock.update(dt);
clock.blend();   // { cloud, rain, snow, dust, fog, wind, lightning, gloom, key, name }
```

14 states. Which ones are possible is decided by the climate under your feet: a hot dry plain can
blow a sandstorm but can never snow, a freezing peak can blizzard but never blows sand, a storm needs
heat *and* water, volcanic ground throws ash and embers, raw magic throws ion storms, and a world
with no liquid at all gets no rain, snow or drizzle — only `clear`, `fog`, `dust` and the rest.
`WeatherClock` holds a state for a few minutes then **crossfades** into the next, so a storm rolls in.

`js/weather.js` (this folder) draws it: two scrolling cloud decks in the sky scene, rain as recycled
line segments in a 44 m box that follows the camera, snow and blown dust as points, lightning that
flashes the whole scene and draws a bolt, and fog that closes your view from 7 km down to 90 m in a
blizzard.

### Every world gets its own colours

`atmospherePalette(body)` gives a planet its `sky`, `skyHorizon`, `sea`, `cloud`, `cloudShadow` and
`fog`. The archetype sets the family, the planet's own seed moves it around inside that family, and
**how far it may move is the world's `extremity`** — a temperate blue-sky world barely shifts, while
a lava, toxic or void-touched world can come out any colour it likes. Two toxic worlds are not the
same toxic world. The same function colours the neighbours' cloud decks in the sky.

---

## Settlements, roads, rivers and bridges

`js/features.js` builds what the map already knew about:

- **Rivers** — traced polylines smoothed through the cell centres, laid as a water ribbon whose
  heights are forced downhill so a river never flows up a slope.
- **Roads** — the A* network, as a ribbon in the cutting the terrain carved for it.
- **Bridges** — World Forge already records where a road had to cross water (`road.bridges`), which
  is the list to trust. (Looking for a road cell that is also a river cell finds almost nothing:
  those overlaps are at road *ends*, because towns are founded on rivers.)
- **Settlements** — the map's own nodes, sized from `node.size`: a village is a well and a ring of
  huts, a city adds a hall, a wall with a gate gap and four towers. All instanced.

**These are buildings, not a town layer.** There are no people in them, no shops and no interiors —
that is phase 4.

---

## Files

| File | What it does |
|---|---|
| `js/planet.js` | Star → system → planet → surface map → `heightAt`/`colorAt`/`climateAt`/`spawnPoint`, with rivers and roads carved in. **Pure, node-testable.** |
| `js/terrain.js` | The clipmap rings, vertex colours, the water plane. |
| `js/sky.js` | Star, sibling planets with their weather, moons, starfield, day/night, the two-pass render. |
| `js/weather.js` | Cloud decks, rain, snow, dust, lightning, fog. |
| `js/props.js` | The scatter: 16 prop kinds, per-biome kits, grass, ruins. One draw call per kind. |
| `js/features.js` | Rivers, roads, bridges and settlements from the map's own data. |
| `js/debug.js` | The backtick menu. |
| `js/player.js` | Input, the third-person controller, the follow camera. |
| `js/actors.js` | One interface over Chibi 2 humanoids and creatures; the enemy field. |
| `js/rpg.js` | Stats, XP, levels, equipment, damage, loot rolls. **Pure, node-testable.** |
| `js/hud.js` | Bars, log, minimap, character sheet, bag. |
| `js/main.js` | Boot, wiring, the frame loop, `window.farhold`. |
| `data/balance.json` | Every knob: player numbers, enemy scaling, drops, ring sizes, scatter density, weather timing, sky exaggeration. |
| `data/enemies.json` | 16 enemies with the biome families they live in and the body each builds. |

## What it reuses

| From | What |
|---|---|
| `universe/` | `makeStar`, `generateSystem`, `generatePlanetMap`, `reliefFor`, `cloudTexture`. |
| `worldgen/` | The world map, biomes and colours, noise, `elevationToMetres`, **and `js/weather.js`, which was written for this and lives there so World Forge uses it too**. |
| `avatar-3d/` | `createChibi2Character` (player and humanoid enemies), `createCreature` (beasts). |
| `avatar-2d/` | `normalizeAvatar`, so a partial enemy look still builds. |
| `assets/` | `createPlanet` / `createStar` from `js/space-models.js` for the bodies in the sky. |
| `prototypes/emberveil/` | `js/loot.js` + `data/items.json` and `data/class-looks.json`. |

**Note the last row**: this prototype imports from another prototype. Fine here — prototypes are
throwaway — but when Farhold graduates, `loot.js`, `rng.js`, `items.json` and `class-looks.json`
should be **copied in**, not linked.

## Data formats

`data/enemies.json` — one entry per enemy:

```json
{
  "id": "moor_hound", "name": "Moor Hound", "kind": "beast",
  "biomes": ["grass", "tundra"],
  "minLevel": 1, "maxLevel": 8,
  "hp": 34, "dmg": [4, 7], "armor": 0, "speed": 4.2, "reach": 2.2,
  "aggroRange": 30, "attackEvery": 1.3, "xp": 12, "gold": 4,
  "look": { "creature": { "type": "hound", "size": 0.85, "colors": { "body": "#6a5c4a" } } },
  "dropBases": ["dagger", "light_boots", "ring"]
}
```

- `biomes` are **World Forge biome families** (`worldgen/js/biomes.js` `BIOME_FAMILIES`): `grass`,
  `jungle`, `desert`, `ice`, `tundra`, `ocean`, `rock`, `lava`, `toxic`, `crystal`, `void`, or `any`.
- `kind` picks the body: `"beast"` builds `look.creature` with `avatar-3d/js/creatures.js`,
  `"humanoid"` builds `look.avatar` with Chibi 2.
- Stats are level-1 values; `balance.json` `enemies.perLevel` (1.17) compounds them per level.

Prop kits live in `js/props.js` `KITS`, keyed by **biome key** (not family), each a list of
`[prop, how many per 64 m cell at density 1]`. Add a prop kind to `PROP_KINDS` and it can appear in
any kit.

## Honest limits

- **Affixes that do nothing yet are declared, not hidden.** Anything outside `LIVE_STATS` in
  `js/rpg.js` is kept on the item and listed on the character sheet as "carried but not yet wired up
  in this phase". Phase 3 turns them on.
- **Settlements have no people**, shops or interiors — phase 4.
- **No sound and no dialogue** — deliberate; phase 7.
- **No save.** Close the tab and the run is gone.
- **Combat is one swing.** No skills, no statuses, no spell effects — phase 3.
- **No full-screen map yet** — that is the first job of the next round (see `PLAN.md`).
- **Props do not sway** in the wind, and grass has no alpha texture — both are cheap wins later.
- **The rings leave small seams** where two resolutions meet, visible at a grazing angle. Proper
  skirts are phase 10.
- **Enemies do not path around terrain.** They walk straight at you and turn away from water.

## Tests

```sh
node --test prototypes/farhold/tests/*.test.js     # ground + rules, no browser
node --test worldgen/tests/weather.test.js         # the weather model
npx playwright test prototypes/farhold             # the real page (17 tests)
```

The node tests cover terrain determinism, height sanity, agreement with the map, slopes vs normals,
levels, gear, loot and the bestiary; `worldgen/tests/weather.test.js` covers the weather model (no
snow in a desert, no rain on a dry world, a clock that crossfades, palettes that vary by seed but
stay recognisable). The browser tests cover the three reported bugs (daylight start, facing and
strafe, looking straight up with ground behind you), the scatter staying instanced and never standing
in the sea, rivers/roads/bridges/towns built from the map, weather changing the sky, the debug menu,
and every planet getting its own colours.
