# Star Forge (`universe/`)

A universe simulator, built the same way as World Forge: a pure, seeded library plus a viewer that is
only one consumer of it. Four levels, each one a zoom into the last:

```
galaxy  →  system  →  planet  →  world map  →  region  →  local tile
```

The last three of those are World Forge's, so a planet you pick out of a star chart ends up as a
64×64 tile you can stand a party on.

Open `/universe/` on the dev server (`./serve.sh --bg`, then `http://<LAN-IP>:8400/universe/`).

All names, elements and mechanics here are invented for this playground (rule 9 in `../CLAUDE.md`).

---

## What you get

```js
import { generateGalaxy } from '/universe/js/galaxy.js';
import { generateSystem } from '/universe/js/system.js';
import { generatePlanetMap } from '/universe/js/planetmap.js';
import { planetTexture } from '/universe/js/texture.js';

const galaxy = generateGalaxy({ seed: 7, stars: 300, layout: 'spiral', arms: 4 });
const star   = galaxy.stars[42];
const system = generateSystem(star, { seed: star.seed });
const planet = system.planets.find(p => p.archetype === 'living');
const world  = generatePlanetMap(planet);              // a World Forge world
const tex    = planetTexture(planet, world);           // canvases for the 3D sphere (browser only)
```

Everything except `texture.js` runs in node and in a worker.

### Galaxy

```
galaxy = {
  seed, layout, name, opts, stats,
  stars: [ star ],          // each one a full record from stars.js plus x, y, z, neighbours[]
  lanes: [ { a, b, dist, bridge? } ],   // the travel graph — always one connected piece
}
```

`nearestStar(galaxy, x, y)` and `route(galaxy, fromId, toId)` (shortest hop path) come with it.

### Star

```
star = {
  id, seed, name, classKey, className, exotic, color, corona, tempK, lum, radius, mass, age,
  habitable: { inner, outer },   // AU — where liquid water can sit
  frostLine,                     // AU — past here, ice survives and giants can form
  planetRange, tags[], blurb, rotation, flareRate, x, y, z, neighbours[],
  companion?,                    // binary pairs
  accretion?, pulse?, radiation? // neutron stars and black holes
}
```

### System

```
system = {
  seed, star, name, opts, stats,
  planets: [ planet ],
  belts:   [ { name, inner, outer, density, rocks, resources[], rareElements[] } ],
  comets:  [ { name, perihelion, aphelion, periodYears, tail } ],
}
```

### Planet

```
planet = {
  id, seed, name, index, archetype, archetypeName, blurb, tags[],
  star: { id, name, classKey, color, lum, frostLine, habitable },
  orbit: { au, periodDays, eccentricity, inclination, inZone, beyondFrost },
  radius, gravity, mass,                 // Earth = 1
  dayLengthHours, tidalLocked, axialTilt,
  atmosphere: { type, density, color, breathable },
  temperature: { K, C, label },          // label: molten … bitter
  biomeMode: 'single' | 'multi',         // one kind of ground, or a real climate
  biomeFamily,                           // which BIOME_FAMILIES key (worldgen/js/biomes.js)
  palette,                               // a PALETTES key, or null
  poles,                                 // ice caps?
  skyColor, seaColor, giant, landable, difficulty,
  resources:     [ { key, name, color, tags[], abundance } ],   // always the baseline four
  rareElements:  [ { key, name, color, tags[], value, blurb, abundance } ],   // one or two
  hazards: [ 'heat' | 'cold' | 'toxic' | 'radiation' | 'storms' ],
  moons: [ { name, kind, radius, distance, periodDays, color, tidalLocked, seed } ],
  rings: { inner, outer, color, opacity, gaps, tilt } | null,
}
```

---

## The files

| File | What it does |
|---|---|
| `js/stars.js` | The stellar class table (11 kinds), habitable zone, frost line, orbit temperature, colour by temperature, the star namer, `makeStar()`. |
| `js/galaxy.js` | `generateGalaxy(opts)` — five layouts, star placement, class mix, travel lanes, `nearestStar`, `route`, `GALAXY_PRESETS`. |
| `js/system.js` | The archetype table (14 kinds) and `generateSystem(star, opts)` — orbits, planets, moons, rings, belts, comets, resources and hazards. |
| `js/elements.js` | Loads `data/elements.json` in a page or in node, and answers `rareFor(archetype)`. |
| `js/planetmap.js` | `planetWorldOpts(planet)` → World Forge knobs, `generatePlanetMap(planet)` → a world (cached), the tidal-lock pass, `familyShare` / `mapMix`. |
| `js/texture.js` | The canvases a 3D planet needs: surface, clouds, night lights, self-glow, bump, and the banded texture for gas giants. Browser only. |
| `js/export.js` | `toJSON` / `fromJSON` for a galaxy, a system, a planet or all three; `regenerate()` rebuilds everything from the seed alone. |
| `js/app.js` | The viewer: knobs, four views, breadcrumb, lists, export. Exposes `window.universeDemo`. |
| `data/elements.json` | The mining table: four baseline resources and twelve rare elements, with colours, tags, values and which worlds carry them. |

3D models for all of it live in **`../assets/js/space-models.js`** (see `../assets/README.md`), so a
game can draw a planet or a star without pulling in this library.

---

## Star classes

Brightness is relative to our own sun, and it is what sets everything else: the habitable zone, the
frost line, and every planet's temperature.

| Class | Colour | Surface | Brightness | Water zone | Notes |
|---|---|---|---|---|---|
| Blue Giant | blue-white | 28 000 K | 12 000× | 104–150 AU | scours anything close, short-lived |
| White Star | white | 8 600 K | 18× | 4.0–5.8 AU | hot, hard light |
| Pale Star | warm white | 6 600 K | 2.4× | 1.48–2.13 AU | a shade hotter than ours |
| Yellow Star | yellow | 5 700 K | 1× | 0.95–1.37 AU | most living worlds are here |
| Orange Dwarf | orange | 4 400 K | 0.34× | 0.55–0.8 AU | dim, calm, very long-lived |
| Red Dwarf | red | 3 100 K | 0.03× | 0.17–0.24 AU | commonest star; its planets end up tidally locked |
| Red Giant | orange-red | 3 500 K | 900× | 29–41 AU | dying, swollen over its inner planets |
| White Dwarf | white | 16 000 K | 0.004× | 0.06–0.09 AU | a cooling cinder |
| Neutron Star | blue-white | huge | ~0 | — | pulsar; hard radiation, frozen leftovers |
| Binary Pair | mixed | — | both suns added | wider | two sunrises, an unsettled climate |
| Black Hole | none | — | 0 | — | light only from the accretion disc |

Neutron stars and black holes never hold a living world: anything left orbiting them is frozen rock
(capped at 90 K) and the archetype roll is forced to barren, ice, crystal or void-touched.

---

## Planet archetypes

`biomeMode: single` means the whole surface is one biome family — worldgen's `biomeLock` knob does
the work. `multi` means a real climate with several biomes, and `poles` adds ice caps.

| Archetype | Biomes | Family / palette | Temperature | Baseline lean | Rare elements it can carry | Hazards |
|---|---|---|---|---|---|---|
| **Barren Rock** | single | `rock` | 90–620 K | metals, stone | aetherite · cryonite · voltaic ore · pyrocrystal · umbral shale · glimmer salt · nullstone · emberlace | radiation, cold |
| **Ice World** | single | `ice` | 40–235 K | water ice | cryonite · aetherite · umbral shale · nullstone · brinepearl | cold |
| **Lava World** | single | `lava` + lava palette | 700–2200 K | metals | pyrocrystal · voltaic ore · helion gas · emberlace | heat, toxic, storms |
| **Desert World** | single | `desert` + rust palette | 250–460 K | stone, metals | voltaic ore · pyrocrystal · glimmer salt · emberlace | heat, storms |
| **Ocean World** | multi | `ocean` | 255–330 K | water ice | xenoplasm · cryonite · glimmer salt · ferrovine · brinepearl | storms |
| **Gas Giant** | no surface | — | 60–700 K | gas | helion gas · voltaic ore | storms, radiation |
| **Ice Giant** | no surface | — | 40–200 K | gas, water ice | helion gas · cryonite | cold, storms |
| **Toxic World** | single | `toxic` + toxic palette | 330–760 K | gas | voltaic ore · xenoplasm · helion gas · ferrovine | toxic, heat, storms |
| **Tundra World** | multi | `tundra` | 225–275 K | water ice | cryonite · xenoplasm · glimmer salt · ferrovine · brinepearl | cold, storms |
| **Jungle World** | multi | `jungle` | 285–325 K | water ice | xenoplasm · ferrovine · brinepearl | toxic, heat, storms |
| **Living World** *(rare, 3–8%)* | multi + ice caps | none (full climate) | 265–305 K | balanced | aetherite · xenoplasm · glimmer salt · ferrovine · brinepearl | none |
| **Crystal World** | single | `crystal` + crystal palette | 120–400 K | stone | aetherite · glimmer salt · umbral shale · nullstone | radiation, cold |
| **Void-Touched** | single | `void` + void palette | 80–420 K | stone, metals | aetherite · pyrocrystal · umbral shale · nullstone | radiation, toxic, cold |
| **Tidally Locked** | multi (day/night halves) | none | 200–420 K | metals, stone | voltaic ore · cryonite · pyrocrystal · umbral shale · emberlace | heat, cold, storms |

A tidally locked world is generated with the latitude gradient switched off, then its temperature is
redone **by longitude** and the biomes reclassified, so one face bakes, the far face freezes, and
everything worth having sits in the ring of twilight between them.

### Resources

Every planet carries all four **baseline** resources at some abundance (0…1) — a lava world still has
water ice, just almost none of it — plus **one or two rare elements**, drawn only from the ones whose
`worlds` list names its archetype.

| Baseline | What it is for |
|---|---|
| Base Metals | the floor of any supply chain |
| Stone | building |
| Water Ice | drinking, cooling, split for fuel |
| Volatile Gas | light gases, fuel |

| Rare element | Colour | Found on | What it does |
|---|---|---|---|
| Aetherite | violet | barren, ice, crystal, void, locked, living | holds a charge far too long; the core of a jump drive |
| Cryonite | pale blue | ice, tundra, ice giant, barren, ocean, locked | stays frozen well above freezing — reactor coolant |
| Voltaic Ore | yellow | barren, desert, lava, locked, toxic, gas giant | halves battery mass |
| Pyrocrystal | orange | lava, desert, barren, locked, void | burns from the inside for months |
| Xenoplasm | green | jungle, ocean, living, toxic, tundra | living gel that knits torn tissue |
| Umbral Shale | dark violet | void, barren, ice, crystal, locked | swallows light — the best hull shielding known |
| Glimmer Salt | pink | desert, ocean, crystal, living, barren, tundra | glows after a hot day; flares and lamps |
| Ferrovine | brass | jungle, living, toxic, ocean, tundra | a creeper that lays metal down in its stems |
| Helion Gas | gold | gas giant, ice giant, toxic, lava | clean fusion feedstock, skimmed from a giant |
| Nullstone | grey | void, crystal, barren, ice | drains any field laid across it |
| Emberlace | copper | lava, barren, desert, locked | copper threads grown in cooling lava |
| Brinepearl | teal | ocean, living, jungle, ice, tundra | keeps a crew's bones from thinning on a long haul |

The table lives in `data/elements.json` — colour, tags, a rough value and a one-line description each
— so a crafting or trade system can read it without touching this code.

---

## Knobs

### Galaxy (`GALAXY_DEFAULTS` in `js/galaxy.js`)

| Knob | Range | Default | What it does |
|---|---|---|---|
| `seed` | any integer | 1 | Same seed + same knobs = the same galaxy, always. |
| `stars` | 4…4000 | 220 | How many systems. The viewer tops out at 900. |
| `layout` | spiral · elliptical · cluster · ring · scattered | `spiral` | The shape of the whole thing. |
| `arms` | 1…8 | 4 | Spiral only. 2 is the classic, 6 is a pinwheel. |
| `twist` | 0…2.5 | 1.0 | How tightly the arms wind. 0 gives straight spokes. |
| `spread` | 0…1 | 0.32 | How far a star can wander off its arm or shell. |
| `coreDensity` | 0…1 | 0.45 | How much the middle crowds up. |
| `clusters` | 1…14 | 6 | Cluster layout only. |
| `lanes` | 1…6 | 3 | Neighbours each star tries to link to. |
| `laneRange` | 0…1 | 0.22 | Longest link allowed before the connector has to force one. |
| `mix` | `{ hot, cool, dying, exotic }` | all 1 | Multipliers on how common each group of classes is. |
| `nameRace` | a Name Forge language | null | Which language names the stars (null = one per star). |
| `namegen` | NameGen or null | null | Without it, the built-in star namer is used. |

**Presets**: *Quiet spiral*, *Dense cluster*, *Dying stars*, *Young ring*, *Exotic frontier*.

### System (`SYSTEM_DEFAULTS` in `js/system.js`)

| Knob | Range | Default | What it does |
|---|---|---|---|
| `planets` | 0…1 | 0.55 | How full the system is, inside the star class's own range. |
| `moonChance` | 0…1 | 0.55 | How readily a planet keeps moons. |
| `ringChance` | 0…1 | 0.28 | Rings, weighted up for giants and down for small worlds. |
| `beltChance` | 0…1 | 0.55 | An asteroid belt in one of the gaps. |
| `cometChance` | 0…1 | 0.5 | A few long-period comets. |
| `rareWorlds` | 0…1 | 0.5 | How often crystal, void-touched and living worlds turn up. |
| `hazardLevel` | 0…1 | 0.5 | Scales every hazard tag and the difficulty number. |
| `rareDensity` | 0…1 | 0.5 | How often a planet carries a *second* rare element, and how much of it. |

### Map size (viewer only)

`small` 128×64 · `medium` 192×96 (default) · `large` 288×144. Bigger means a slower first look at a
planet and a deeper zoom once you are there.

---

## What this adds to World Forge

Four new knobs, all off by default, so every existing world is unchanged
(`worldgen/js/world.js`, `biomes.js`, `render.js`):

| Knob | What it does |
|---|---|
| `biomeLock` | A `BIOME_FAMILIES` key. Every land cell is forced into that family, picked by height and slope — an ice world is ice, tundra and snowy peaks and nothing else. |
| `polarCaps` | 0…1, how far ice reaches down from the top and bottom rows. Land becomes Ice Sheet, water becomes **Sea Ice** (biome 25, appended so old saves still read correctly). |
| `atmosphereTint` | `'#rrggbb'` or `{ color, strength }` — a colour wash over the drawn map, so a toxic sky yellows its own map. |
| `palette` | A `PALETTES` key (`lava`, `crystal`, `toxic`, `void`, `ember`, `rust`) that swaps the biome colours without touching the biome table. |

Plus `BIOME_FAMILIES`, `familiesOf()`, `inFamily()`, `lockBiome()` and `palettedColors()` in
`biomes.js`.

---

## Viewer

`index.html` + `universe.css` + `js/app.js`. Left: every knob and the five presets. Middle: the
breadcrumb, one of four views, a hover readout and a legend. Right: a card about whatever is
selected, the planet list, a filterable star list and the export buttons.

- **galaxy** — a 2D canvas: stars coloured and sized by class, travel lanes, a core glow. Hover for
  the class and the water zone, click to fly in.
- **system** — Three.js: the star (with its own model for binary pairs, pulsars and black holes),
  orbit rings on a log scale so the inner planets do not pile up, planets, belts. Click a planet.
- **planet** — Three.js close-up: the real surface texture, an atmosphere rim, a cloud deck, rings,
  moons, and the star off to one side so there is a day side and a night side.
- **map** — the planet's World Forge map, with the usual world → region → local zooms.

Escape, or the breadcrumb, walks back out. **JSON** saves the knobs and the records; **PNG** saves
whatever view is on screen; **Copy link** puts the knobs in the URL hash.

`window.universeDemo` exposes `{ state, generate, openStar, openPlanet, showMap, openRegion,
openLocal, showView, back, setOpt, pixelStats, toJSON, ready }` for the tests and the console.

---

## From galaxy to a landing site

```js
import { generateGalaxy } from '/universe/js/galaxy.js';
import { generateSystem } from '/universe/js/system.js';
import { generatePlanetMap } from '/universe/js/planetmap.js';
import { generateLocalDetail } from '/worldgen/js/local.js';
import { nearestNode } from '/worldgen/js/world.js';

const galaxy = generateGalaxy({ seed: 20260913, stars: 300 });

// somewhere worth going: a living world with something rare under it
let home = null;
for (const star of galaxy.stars) {
  const system = generateSystem(star, { seed: star.seed });
  const world = system.planets.find(p => p.archetype === 'living' && p.rareElements.length >= 1);
  if (world) { home = { star, system, planet: world }; break; }
}

const map = generatePlanetMap(home.planet);                  // ~0.4 s at 192×96
const port = map.nodes.find(n => n.type === 'port') || map.nodes[0];
const tile = generateLocalDetail(map, port.x, port.y, { node: port });   // the 64×64 tile you land on

console.log(`${home.planet.name}: ${home.planet.rareElements.map(r => r.name).join(', ')}`);
console.log(`touching down at ${port.name}, ${map.regions[port.region].name}`);
```

Useful bits for game code:

- `planet.difficulty` (0…1) and `planet.hazards[]` — straight into an encounter or survival table.
- `planet.rareElements[].value` — a price per unit, for trade.
- `planet.gravity`, `planet.atmosphere.breathable`, `planet.dayLengthHours` — rules the player feels.
- `route(galaxy, a, b)` — a jump path for travel time and fuel.
- `star.habitable` and `star.frostLine` — for a scanner UI, or to decide where to send a survey.
- `system.belts[]` and `system.comets[]` — mining and escort jobs that are not on a planet.

### Cost

| Step | Time (node, this machine) |
|---|---|
| `generateGalaxy` 300 stars | ~50 ms |
| `generateSystem` one star | ~0.2 ms |
| `generatePlanetMap` 128×64 | ~400 ms |
| `generatePlanetMap` 192×96 | ~550 ms |
| `planetTexture` at 1024 | ~250 ms (browser) |

Maps are cached per planet seed and size (ten of them), and are **never saved** — they come back from
the seed faster than they would load. A whole galaxy of 300 stars saves as about 180 KB of JSON.

---

## Tests

```
node --test universe/tests/universe.test.js        # 19 tests, part of npm run test:unit
npx playwright test universe/tests/universe.spec.js
npx playwright test assets/tests/models.spec.js    # the 3D models
```

The node tests cover the star table's arithmetic, per-seed determinism for stars, galaxies, systems
and maps, every layout being one connected graph, every star class and every archetype turning up,
living worlds staying between 3% and 8%, orbits stepping outwards with temperatures inside their
archetype's band, giants forming past the frost line, every planet carrying the baseline four and at
least one rare element that belongs on it, single-biome planets coming out ≥85% one family,
living worlds coming out with six or more land biomes and ice at the poles (and not in the tropics),
a tidally locked world being warm in the middle and cold at the edges, and the JSON round trip.

## Known rough edges

- The galaxy is 2D. Stars carry a `z`, but nothing uses it yet — no 3D star chart.
- Planets do not move. Orbits are drawn as rings and each planet is parked at a fixed angle; nothing
  animates round the star, and moons orbit only for show.
- The surface map is a framed island world, not a globe (World Forge does not wrap), so the texture
  hides the seam in ocean rather than being seamless by construction. It shows on a planet with very
  little water if you look for it.
- Belts and comets are decoration: they carry resources and a name, but nothing generates a mining
  site on them.
- Only the planet's *dominant* archetype drives the map. A living world does not get a desert belt
  because of its axial tilt — the tilt is recorded but unused.
