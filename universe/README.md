# Star Forge (`universe/`)

A universe simulator, built the same way as World Forge: a pure, seeded library plus a viewer that is
only one consumer of it. Four levels, each one a zoom into the last:

```
galaxy  →  system  →  planet  →  world map  →  region  →  local tile
                          ↘  moon  →  world map (half size)  →  region  →  local tile
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

// a moon is a small planet: same calls, a smaller grid
const moon      = planet.moons[0];
const moonWorld = generatePlanetMap(moon, moonMapSize({ width: 192, height: 96 }));   // 96×48
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
  moons: [ moon ],                       // see below — each one is a planet record in miniature
  rings: { inner, outer, color, opacity, gaps, tilt } | null,
}
```

### Moon

A moon carries every field `planetmap.js` and `texture.js` read, so anything that works on a planet
works on a moon. It also keeps the four old fields (`kind`, `distance`, `periodDays`, `color`) that
the 3D models read.

```
moon = {
  id,            // "<planetId>m<index>" — stable, so a link or a save can point at one
  seed,          // its own, from the planet's: the same moon always builds the same map
  moon: true, parentId, parentName, index,
  name, archetype, archetypeName, blurb, kind,
  star: { … },   // the same small star reference a planet carries
  orbit: { au, aroundPlanet, periodDays, inZone, beyondFrost },   // au is its planet's
  radius, gravity, mass, dayLengthHours, tidalLocked, axialTilt, tidalHeat,
  atmosphere, temperature, biomeMode, biomeFamily, palette, poles, skyColor, seaColor,
  giant: false, landable: true, difficulty, hazards[], tags[],
  resources[], rareElements[],   // the baseline four and one rare, scaled down by its size
  moons: [], rings: null,
}
```

`moonsOf(system)` gives every moon with its parent, `moonById(system, id)` finds one.

### Names

Nothing inside one system shares a name: the star's name is taken first, then every planet, moon,
belt and comet name is re-rolled (up to five times) if it collides, falling back to the numbered form
(`Wyrmcrag IV`), which is unique by construction. Star names are deduped the same way across a whole
galaxy — Name Forge does repeat itself over a few hundred rolls, and a repeat makes the star list and
any save ambiguous. A moon is always `<planet name> a`, `b`, `c`…, so *Elm Barrow* and *Elm Barrow a*
are a planet and its moon, not a collision.

---

## The files

| File | What it does |
|---|---|
| `js/stars.js` | The stellar class table (11 kinds), habitable zone, frost line, orbit temperature, colour by temperature, the star namer, `makeStar()`. |
| `js/galaxy.js` | `generateGalaxy(opts)` — five layouts, star placement, class mix, unique star names, travel lanes, `nearestStar`, `route`, `GALAXY_PRESETS`. |
| `js/system.js` | The archetype table (14 kinds) and `generateSystem(star, opts)` — orbits, planets, moons, rings, belts, comets, resources and hazards. Also the orbit spacing: `nextOrbitAu`, `MIN_ORBIT_RATIO`, `orbitRatios`, and `orbitLayout()` for drawing them. |
| `js/elements.js` | Loads `data/elements.json` in a page or in node, and answers `rareFor(archetype)`. |
| `js/planetmap.js` | `planetWorldOpts(body)` → World Forge knobs, `generatePlanetMap(body)` → a world (cached), the tidal-lock pass (`applyTidalLock`, `columnClimate`), `reliefFor` (metres per body), `moonMapSize` / `mapSizeFor`, `familyShare` / `mapMix`. Takes a moon anywhere it takes a planet. |
| `js/texture.js` | The canvases a 3D planet needs: surface, clouds, night lights, self-glow, bump, and the banded texture for gas giants. Browser only. |
| `js/export.js` | `toJSON` / `fromJSON` for a galaxy, a system, a planet, a moon or all of them; `moonIndex(system)` lists every moon and the seed its map comes from; `regenerate({ moonId })` rebuilds everything from the seed alone. |
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
| **Barren Rock** | single | `rock` + dust palette | 90–620 K | metals, stone | aetherite · cryonite · voltaic ore · pyrocrystal · umbral shale · glimmer salt · nullstone · emberlace | radiation, cold |
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
everything worth having sits in the ring of twilight between them (`applyTidalLock`):

```
map column:   0 ──────────── w/4 ──────── w/2 ──────── 3w/4 ──────────── w
              antistellar    twilight     substellar   twilight          antistellar
temperature   cold 0.02      ~0.5         hot          ~0.5              cold 0.02
              └── the same longitude: the two edges meet on the sphere ──┘
```

The profile is a **raised cosine** of the longitude distance from the substellar point, so the
gradient is flat at both ends: the far face is a whole frozen hemisphere rather than a thin band at
the edges, and — because the slope is zero exactly where the map wraps — the seam carries no step,
which is what used to show as a white stripe down one longitude of the 3D sphere. On top of that the
poles run a little colder and the burning face is dried out (`0.28×` its moisture at the substellar
point), so the freezing line comes out as a curve rather than a ruled column.

`columnClimate(world)` returns the mean temperature and the share of frozen ground in every column,
west to east — the check that a locked world really is hot in the middle, frozen at both edges, and
free of any single column that steps away from its neighbours.

## Moons

Every moon is a small planet with its own archetype, temperature, resources, id and seed, so it gets
its own surface map, its own texture and its own card in the viewer. There are only four kinds,
which is about what the real ones look like:

| Kind | When it happens | Notes |
|---|---|---|
| **Barren Moon** | the default | airless rock, mining and nothing else |
| **Ice Moon** | anything below about 230 K, and most of what orbits a giant | water ice, the easiest fuel in the system |
| **Volcanic Moon** | close in around a giant, where tidal squeezing never lets the inside cool | `tidalHeat` 0…1 records how hard it is being kneaded |
| **Living Moon** | *rare* — a big moon (≥ 0.25× Earth, so it can hold air) where the sunlight is right for water | about 1% of moons; in practice a large moon of a gas giant sitting in the star's water zone |

The rules, in order: a dead star (neutron star, black hole) leaves only ice and rock; a hard tidal
squeeze makes it volcanic; then the size-and-warmth roll for a living moon; then temperature decides
between ice and barren. `moonArchetype()` is exported if you want to run the same rules yourself.

What a moon gets less of than a planet:

- **map**: half the grid (`moonMapSize()` — a 192×96 planet gives a 96×48 moon), fewer and chunkier
  landmasses, roughly half the provinces, almost no settlements.
- **resources**: the baseline four and usually one rare element, all scaled by the moon's size
  (`0.35 + radius × 0.7`, capped at 0.9 of a planet's abundance). A second rare element is a third as
  likely as it is on a planet.
- **air**: scaled by radius, so most moons come out at "none". Only a living moon keeps real air, and
  only it can be breathable. An airless moon's map is dry — see *What is on the ground* below.

A locked moon keeps one face to **its planet**, not to the star, so the tidally locked day/night pass
that a locked planet gets does not run on a moon.

### Orbit spacing

Orbits step outwards on a ratio ladder, never a fixed distance:

| Constant | Value | What it means |
|---|---|---|
| `MIN_ORBIT_RATIO` | 1.5 | inside the frost line, each orbit is at least 1.5× the one before it |
| `MIN_ORBIT_RATIO_OUTER` | 1.7 | past the frost line, where the real gaps are wider |

`nextOrbitAu(au, rng, beyondFrost)` is the ladder itself; it rounds **up** to four decimals so the
stored numbers keep the invariant too. `orbitRatios(system)` hands back every ratio for a check.

Drawing them is a second problem: real orbits run from 0.03 AU to 150 AU, and squashing that onto a
log scale is what used to push two rings almost on top of each other. `orbitLayout(system, opts)`
does it properly and has no DOM or Three.js in it, so a test can check it:

```js
const L = orbitLayout(system, { starRadius: 0.6, minGap: 1.05 });
L.radii[i]            // where planet i's ring is drawn, in scene units
L.radiusFor(au)       // the same ladder for a belt or a comet (monotone, interpolated in log space)
L.gapAt(i)            // the narrower of the two gaps around planet i
L.sizeFor(i, wanted)  // `wanted`, capped at a third of that gap — a planet never fills its lane
L.laneAt(i)           // how far out from planet i's ring still belongs to planet i
L.moonRings(i, n, { bodyRadius })   // where to draw that planet's n moons, all inside its lane
L.max                 // the outermost ring, for the camera
```

A **lane** is the space either side of a ring that belongs to one planet and nothing else
(`laneShare`, 0.8 of the half-gap). A moon is only ever drawn inside its parent's lane, so nothing a
moon sweeps can meet anything else in the system — Farhold's orbit view used to put a giant's moon a
fixed eight *planet* radii out, which on an oversized giant was a circle wider than the gap to the
next world. `sizeFor(i, wanted, { moons: n })` caps the planet smaller again when it has moons, so
the whole moon ladder (`moonInner` 2.4 planet radii, then ×`moonStep` 1.35 each) fits outside it.

`map: 'au'` keeps the real orbit in AU instead of remapping it, and lends only the gaps, the size cap
and the moon lanes. That is for a caller drawing the system at its own scale — a flight sim, where
"0.3 AU away" on the HUD has to mean what it says.

Each ring's place is a blend of where it sits by distance (log) and where it sits in the queue
(`even`, 0.55 by default), then a pass outwards opens up anything still closer than `minGap`. The
even part is what stops one far-out giant from squashing the inner planets together.

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
| `moonChance` | 0…1 | 0.55 | How readily a planet keeps moons. Giants keep 2–7, a big rocky world 0–2. |
| `ringChance` | 0…1 | 0.28 | Rings, weighted up for giants and down for small worlds. |
| `beltChance` | 0…1 | 0.55 | An asteroid belt in one of the gaps. |
| `cometChance` | 0…1 | 0.5 | A few long-period comets. |
| `rareWorlds` | 0…1 | 0.5 | How often crystal, void-touched and living worlds turn up. |
| `hazardLevel` | 0…1 | 0.5 | Scales every hazard tag and the difficulty number. |
| `rareDensity` | 0…1 | 0.5 | How often a planet carries a *second* rare element, and how much of it. |

### Map size (viewer only)

`small` 128×64 · `medium` 192×96 (default) · `large` 288×144. Bigger means a slower first look at a
planet and a deeper zoom once you are there. A moon uses half of whichever size is picked.

---

## What this adds to World Forge

Eight new knobs, all off by default, so every existing world is unchanged
(`worldgen/js/world.js`, `biomes.js`, `render.js`):

| Knob | What it does |
|---|---|
| `biomeLock` | A `BIOME_FAMILIES` key. Every land cell is forced into that family, picked by height and slope — an ice world is ice, tundra and snowy peaks and nothing else. |
| `polarCaps` | 0…1, how far ice reaches down from the top and bottom rows. Land becomes Ice Sheet, water becomes **Sea Ice** (biome 25, appended so old saves still read correctly). |
| `atmosphereTint` | `'#rrggbb'` or `{ color, strength }` — a colour wash over the drawn map, so a toxic sky yellows its own map. |
| `palette` | A `PALETTES` key (`lava`, `crystal`, `toxic`, `void`, `ember`, `rust`, `dust`) that swaps the biome colours without touching the biome table. |
| `liquid` | `water` · `lava` · `none` — `none` is a dry world: no seas, lakes or rivers at any zoom. |
| `frame` | `ocean` · `land` · `rim` — what the map edge fades into; dry bodies use `land`. |
| `inhabited` | `false` skips settlements, ports, roads, bridges, sea lanes, borders and history. |
| `nameTheme` | A vocabulary (`dead`, `ice`, `lava`, `crystal`, `void`, `desert`, `toxic`, `twilight`) with forbidden word lists. |

Plus `BIOME_FAMILIES`, `familiesOf()`, `inFamily()`, `lockBiome()` and `palettedColors()` in
`biomes.js`.

---

## What is on the ground

`surfaceOf(body)` in `planetmap.js` decides, per planet or moon, four World Forge knobs that are all
off for World Forge's own worlds (see `../worldgen/README.md`, *Dry, empty and themed worlds*):

| Archetype | `liquid` | Settled | `nameTheme` |
|---|---|---|---|
| Barren Rock, Barren Moon | none | no | `dead` |
| Ice World, Ice Moon | none (frozen from pole to pole) | no | `ice` |
| Crystal World | none | no | `crystal` |
| Void-Touched | none | no | `void` |
| Lava World, Volcanic Moon | lava | no | `lava` |
| Desert World | water | no | `desert` |
| Toxic World | water | no | `toxic` |
| Tidally Locked | water | no | `twilight` |
| Living (planet or moon), Ocean, Jungle, Tundra | water | **yes** | none (the classic vocabulary) |

- **Water needs air.** Below 0.05 bar a body is dry whatever its archetype, and a dry body always
  takes one of the dry vocabularies (`dead` unless it is ice, crystal or void).
- **Settled** is the four archetypes whose air is breathable (system.js marks the same four). Only
  those get settlements, ports, roads, bridges, sea lanes, drawn borders and history. Every other body
  gets landmarks that need nobody — craters, vents, caves, ruins, monoliths, volcanoes — plus
  dungeons (vaults, not lairs) and mountain passes.
- **No liquid** means no ocean rim at the edge of the map (the frame is `land`), no seas, lakes or
  rivers at any zoom, and dry basins where the sea would have been.
- **Names** come from the theme's own words: *Thuktir Scar*, *the Grey Basin*, *the Flint Shelf*,
  not *the Silver Fen*. A lava world may have *the Tralnit Lava Ocean*; a twilight world may have a
  wood in its twilight ring, but never a kingdom.

The biome families that single-biome bodies are locked to were cleaned up to match: a barren world's
slopes are hills, not shrubland, drawn in the grey-brown `dust` palette rather than green; an ice world is ice and snowy peaks, not tundra scrub; a void-touched
world has ash plains, not blighted forest.

## Heights

A World Forge map stores elevation as 0…1 with the shoreline at 0.5. `reliefFor(body)` in
`planetmap.js` turns that into metres for one planet or moon, and `generatePlanetMap` stores it as
`world.relief`, which World Forge's `cellInfo()` reads (and its region and local grids copy):

```
relief = { landMetres, seaMetres, datum: 'sea' | 'datum', label }
```

| Rule | Why |
|---|---|
| `landMetres = 8800 × gravity^−0.72`, ±12% by seed, kept inside 2 400…26 000 m | a heavy world pulls its mountains down; at 1 g the tallest peaks sit near 9 km, at a third of a g about twice that |
| `datum: 'sea'` when `surfaceOf(body).liquid` is `water` | only then is below 0.5 really water depth; the readout says *820 m below sea level* |
| otherwise `datum: 'datum'` (*the lava plain* on a lava world) | an airless rock or an ice shell has no sea to measure from, so low ground reads *−340 m below datum* |
| `seaMetres` = 0.85 × `landMetres` with a sea, 0.45 × without | deep oceans on a sea world, shallower basins elsewhere |

It is plain arithmetic on the body record, so a planet or moon reports the same heights every time it
is opened, and a saved record rebuilds the same scale.

## Viewer

`index.html` + `universe.css` + `js/app.js`. Left: every knob and the five presets. Middle: the
breadcrumb, one of four views, a hover readout and a legend. Right: a card about whatever is
selected, the planet list, a filterable star list and the export buttons.

- **galaxy** — a 2D canvas: stars coloured and sized by class, travel lanes, a core glow. Hover for
  the class and the water zone, click to fly in.
- **system** — Three.js: the star (with its own model for binary pairs, pulsars and black holes),
  orbit rings on a log scale so the inner planets do not pile up, planets, belts. Click a planet.
- **planet** — Three.js close-up: the real surface texture, an atmosphere rim, a cloud deck, rings,
  moons, and the star off to one side so there is a day side and a night side. **Click one of the
  moons** going round it, or click it in the "Moons of …" list on the right, to land on it.
- **moon** — the same close-up for a moon, with the world it circles hanging behind it — drawn from
  the parent's own cached surface texture, not a stand-in — its own card (what it orbits, how far,
  tidal heat, resources, hazards) and its own surface map.
- **map** — the body's World Forge map, with the usual world → region → local zooms. Hovering reads
  the biome, the **height** in metres on that body's own scale (see *Heights* below), temperature
  and region. While a map is up, the right-hand column carries World Forge's own **Layers** panel
  (`worldgen/js/layers-panel.js`): a chip per map layer and a checkbox per overlay. Anything with
  nothing to show on this body is greyed out with the reason as its tooltip and in a note under the
  panel — rivers on an airless moon, roads where nobody built any, moisture with no air, aura or
  magic where there is none, borders with no regions. The choice is kept in `state.mapLayer` /
  `state.layers`, so it comes back on the next body where it does apply.

Escape, or the breadcrumb, walks back out. **JSON** saves the knobs and the records; **PNG** saves
whatever view is on screen; **Copy link** puts the knobs in the URL hash.

`window.universeDemo` exposes `{ state, generate, openStar, openPlanet, openMoon, currentBody,
orbitLayout, parentDrawn, layerUnavailable, effectiveLayers, showMap, openRegion, openLocal, showView, back, setOpt, pixelStats, toJSON,
ready }` for the tests and the console. `pixelStats({ x, y, w, h })` takes an optional box in
fractions of the view and counts cool (blue/green) against brown pixels. `state.moon` is the moon being looked at, or null.

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
node --test universe/tests/universe.test.js        # 26 tests, part of npm run test:unit
npx playwright test universe/tests/universe.spec.js
npx playwright test assets/tests/models.spec.js    # the 3D models
```

The node tests cover the orbit ladder (no two orbits closer than `MIN_ORBIT_RATIO` over 200 seeds,
and the drawn rings keeping their gap with every planet narrower than its own lane), moons (stable
ids and seeds, only the four kinds, temperatures inside their band, living moons rare/big/warm, less
of everything than a planet, a half-size map that is the same on every visit, and moons surviving a
save and a `regenerate({ moonId })`), the star table's arithmetic, per-seed determinism for stars, galaxies, systems
and maps, every layout being one connected graph, every star class and every archetype turning up,
living worlds staying between 3% and 8%, orbits stepping outwards with temperatures inside their
archetype's band, giants forming past the frost line, every planet carrying the baseline four and at
least one rare element that belongs on it, single-biome planets coming out ≥85% one family,
living worlds coming out with six or more land biomes and ice at the poles (and not in the tropics),
a tidally locked world being hot in the middle and a frozen hemisphere at both edges with no column
stepping away from its neighbours (and a locked *moon* getting no hot face at all), no two names
colliding inside a system or between the stars of a galaxy, and the JSON round trip.

## Known rough edges

- The Layers panel greys out a layer from what is actually on the generated map, not from the body's
  description: a thinly settled world that still grew a few roads keeps its roads toggle.

- The galaxy is 2D. Stars carry a `z`, but nothing uses it yet — no 3D star chart.
- Planets do not move. Orbits are drawn as rings and each planet is parked at a fixed angle; nothing
  animates round the star, and moons orbit only for show.
- The drawn orbits are spaced for readability, not to scale: the ladder blends distance with the
  planet's place in the queue, so you cannot read the AU off the picture. The number on the card is
  the real one.
- A lava world's seas and rivers are still World Forge water cells underneath, drawn molten by the
  palette and named by the lava theme — `world.water` does not tell water from lava; `world.opts.liquid`
  does.
- The elevation legend is on the body's own relief scale, so two maps with the same colours can mean
  very different heights; read the metres, not the colour.
- Two planets in *different* systems can still share a name. Only names inside one system, and the
  star names across a galaxy, are deduped.
- The surface map is a framed island world, not a globe (World Forge does not wrap), so the texture
  hides the seam in ocean rather than being seamless by construction. It shows on a planet with very
  little water if you look for it.
- Belts and comets are decoration: they carry resources and a name, but nothing generates a mining
  site on them.
- Only the planet's *dominant* archetype drives the map. A living world does not get a desert belt
  because of its axial tilt — the tilt is recorded but unused.
