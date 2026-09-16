# Farhold (prototype, phase 1)

A third-person action RPG on a whole procedural planet. You land on a real world of a real star
system, walk it out to the horizon, fight what lives there, and wear what it drops — and the other
planets of that system are genuinely in the sky above you.

Working title. Independent project (Radley Sustaire). Sandbox.

**Run it:** `./serve.sh --bg` from the playground root, then
`http://192.168.1.34:8400/prototypes/farhold/` (LAN IP: `hostname -I | awk '{print $1}'`).

**Phase 1 of ten.** [`PLAN.md`](PLAN.md) is the ten-phase plan; [`BRAINSTORM.md`](BRAINSTORM.md) is
the idea pile behind it. This phase deliberately has **no sound and no dialogue** — the user asked
for those to wait.

---

## What this phase does

| | |
|---|---|
| **Land** | A seed picks a star, its system and a landable planet (`universe/`), and World Forge draws that planet's surface (`worldgen/`). |
| **Walk** | 163 km × 82 km of ground you can actually walk, with real elevation, drawn to a horizon 7.8 km away. |
| **Look up** | The star crosses the sky on a 15-minute day, and the system's other planets and this planet's moons hang where their orbits put them. |
| **Fight** | 16 enemies over two body types — Chibi 2 humanoids and `avatar-3d` creatures — that wander, notice you, chase and swing. |
| **Loot** | Real Emberveil items: bases, affixes, qualities, uniques and set pieces, with rarity colours and an upgrade arrow. |
| **Grow** | XP, 30 levels, attribute points to spend, gear that changes your damage and the weapon in your character's hand. |

## Controls

`WASD` move · `Shift` run · `Space` jump · left click swing (click once to capture the mouse) ·
`I` or `Tab` character sheet · `Esc` release the mouse.

URL options: `?seed=7` (which star system), `?auto=1` (skip the title screen),
`?quality=low` (three terrain rings instead of five — what the Playwright spec uses).

---

## How the ground works

This is the part worth reusing. The planet is **one world map, sampled continuously**.

`js/planet.js` is pure JavaScript — no Three.js, no DOM — and answers one question:
`heightAt(x, z)` in metres. It takes the world map's elevation, samples it smoothly (bilinear)
between cells, converts it to metres with the planet's own relief scale, and adds two octaves of
noise for the detail between cells. That is exactly what `worldgen/js/local.js` does when it zooms
into a tile, so **what you walk over matches what the map said was there**, and the same seed always
grows the same hill.

```js
import { createWorld, makeTerrain } from './js/planet.js';
const { star, system, planet, world } = createWorld({ seed: 7 });
const terrain = makeTerrain(world, planet);
terrain.heightAt(12_400, 8_900);   // metres above sea level
terrain.colorAt(12_400, 8_900);    // [r, g, b] 0..1 — biome, rock on slopes, snow up high, sand at the shore
terrain.spawnPoint();              // somewhere sensible to stand
```

Scale: **one world-map cell is 640 m** (`M_PER_CELL`), the same 64 × 10 m tile World Forge zooms
into. A 256 × 128 map is therefore a surface 163 km × 82 km. Heights come from `reliefFor(planet)`
in `universe/`, so a light world really does have taller mountains.

### Drawing it: rings, not chunks

`js/terrain.js` draws concentric **square rings** centred on the player. Every ring has the same
vertex count but covers three times the area of the one inside it, and each has a hole in the middle
where the finer ring covers it:

| Ring | Covers | Per quad |
|---|---|---|
| 1 | 192 m | 2 m |
| 2 | 576 m | 6 m |
| 3 | 1.7 km | 18 m |
| 4 | 5.2 km | 54 m |
| 5 | 15.6 km | 162 m |

So the grass under your boots is 2 m resolution and the mountains 8 km away are 162 m — and the
whole visible planet is **five meshes, five draw calls, about 92,000 triangles**. A ring only
rebuilds when the player has moved one of its own cells, so the outer rings rebuild almost never.
Each ring's hole is slightly smaller than the ring inside it, so they overlap by a couple of quads
rather than leaving a crack where the resolutions meet.

Colour is per-vertex (one material paints every biome), and normals are computed from the heights
already sampled, so no extra terrain sampling happens for lighting.

### The sky is a second scene

`js/sky.js` renders the sky into **its own scene with a camera at the origin** that copies only the
player camera's rotation, then the main scene is drawn over it with the depth buffer cleared:

```js
renderer.clear();
renderer.render(sky.scene, sky.camera(camera));
renderer.clearDepth();
renderer.render(scene, camera);
```

That makes everything in the sky infinitely far away for free — no depth-precision fight between a
2 m rock and a planet, and nothing up there can ever clip into a mountain.

**Where the planets sit is real.** Each body's heliocentric angle comes from its own orbital period;
the difference between its angle and ours decides where it appears relative to the star. An inner
planet therefore hangs near the sun at dusk, and a planet at opposition rides overhead at midnight.
The bodies themselves are `createPlanet()` from `assets/js/space-models.js`, lit by a light at the
star's position, so they show phases.

**How big they are drawn is not real.** A sibling planet's true angular size is a dot — Venus is a
bright point, not a disc. `balance.json` `sky.siblingScale` (default 160) exaggerates it on purpose,
which is the same cheat every space game makes. Set it to 1 for the honest sky.

**Moons need no cheat.** These worlds keep their moons 5–10 planet radii out — our own Moon sits at
60 — so at `moonScale: 1` a moon genuinely fills a chunk of the sky. Note that a moon’s orbit is
given in *planet radii*, not AU; `js/sky.js` converts through the parent planet’s own radius.

---

## Files

| File | What it does |
|---|---|
| `js/planet.js` | Star → system → planet → surface map → `heightAt`/`colorAt`/`spawnPoint`. **Pure, node-testable.** |
| `js/terrain.js` | The clipmap rings, vertex colours, the water plane. |
| `js/sky.js` | Star, sibling planets, moons, starfield, day/night, the two-pass render. |
| `js/player.js` | Keyboard/mouse input, the third-person controller, the follow camera. |
| `js/actors.js` | One interface over Chibi 2 humanoids and `avatar-3d` creatures; the enemy field (spawn, wander, chase, swing, die, despawn). |
| `js/rpg.js` | Stats, XP, levels, equipment, damage, loot rolls. **Pure, node-testable.** |
| `js/hud.js` | Bars, log, minimap, character sheet, bag. |
| `js/main.js` | Boot, wiring, the frame loop, `window.farhold`. |
| `data/balance.json` | Every knob: player numbers, enemy scaling, drop rates, ring sizes, sky exaggeration. |
| `data/enemies.json` | 16 enemies with the biome families they live in and the body each one builds. |

## What it reuses

| From | What |
|---|---|
| `universe/` | `makeStar`, `generateSystem`, `generatePlanetMap`, `reliefFor` — the star system and the planet's surface map and height scale. |
| `worldgen/` | The world map itself, the biome table and colours, the noise helpers, `elevationToMetres`. |
| `avatar-3d/` | `createChibi2Character` (the player and humanoid enemies), `createCreature` (beasts). |
| `avatar-2d/` | `normalizeAvatar`, so a partial enemy look still builds. |
| `assets/` | `createPlanet` / `createStar` from `js/space-models.js` for the bodies in the sky. |
| `prototypes/emberveil/` | `js/loot.js` + `data/items.json` (the whole item generator) and `data/class-looks.json` (30 designed character looks). |

**Note the last row**: this prototype imports from another prototype. That is fine here — prototypes
are throwaway and may break when the things under them change — but when Farhold graduates to its
own repo, `loot.js`, `rng.js`, `items.json` and `class-looks.json` should be **copied in**, not
linked.

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
- `kind` picks the body: `"beast"` builds `look.creature` with `avatar-3d/js/creatures.js`
  (37 creature types), `"humanoid"` builds `look.avatar` with Chibi 2.
- `dropBases` are item base keys from Emberveil's `items.json`.
- Stats are the level-1 values; `balance.json` `enemies.perLevel` (1.17) compounds them per level.

## Honest limits of this phase

- **Affixes that do nothing yet are declared, not hidden.** Anything outside `LIVE_STATS` in
  `js/rpg.js` (the `cond_*` conditional powers, mostly) is kept on the item, shown on its card, and
  listed at the bottom of the character sheet as "carried but not yet wired up in this phase".
  Phase 3 turns them on via Emberveil's effect registry.
- **No props.** No trees, rocks, plants or buildings yet — that is phase 2, and the whole point of
  choosing a terrain system that leaves the draw-call budget almost untouched.
- **No sound and no dialogue.** Deliberate; phase 7.
- **No save.** Close the tab and the run is gone.
- **Combat is one swing.** No skills, no statuses, no spell effects yet.
- **The rings leave small seams.** Where two ring resolutions meet, the overlap can show as a
  hairline at a grazing angle. Fixing it properly means stitching skirts — phase 10.
- **Enemies do not path around terrain.** They walk straight at you and turn away from water.

## Tests

```sh
node --test prototypes/farhold/tests/*.test.js     # ground + rules, no browser
npx playwright test prototypes/farhold             # the real page
```

The node tests check the things a player feels: the same seed gives the same hill, no height is
ever `NaN`, the ground never drifts far from the map it came from, slopes and normals agree, a
better weapon hits harder, armour is worth wearing, a level heals you, every enemy in the table
builds, every weapon maps to a Chibi 2 part that exists, and the loot roller produces wearable
items at every level. The Playwright spec lands on the planet, walks, turns the day, kills 26 rats
for a level, wears a greatsword from the bag and watches enemies spawn and despawn.
