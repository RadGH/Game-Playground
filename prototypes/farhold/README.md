# Farhold (prototype — ten phases, plus round 4: the RPG expansion)

A third-person action RPG on a whole procedural planet. You land on a real world of a real star
system, walk it out to the horizon, fight what lives there, and wear what it drops — and the other
planets of that system are genuinely in the sky above you.

Working title. Independent project (Radley Sustaire). Sandbox.

**Run it:** `./serve.sh --bg` from the playground root, then
`http://192.168.1.34:8400/prototypes/farhold/` (LAN IP: `hostname -I | awk '{print $1}'`).

[`PLAN.md`](PLAN.md) is the ten-phase plan; [`BRAINSTORM.md`](BRAINSTORM.md) is the idea pile behind
it. All ten phases and the round-3 queue are done. **Round 4 is the RPG expansion** — level-banded
regions, a much bigger bestiary, dungeons you go inside, chests, bosses, crafting from recycled
gear, companions, thirty classes and light you can carry. [`RPG.md`](RPG.md) documents it.

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
| **Fight** | 46 enemies + 6 bosses over two body types — Chibi 2 humanoids and `avatar-3d` creatures — arriving in **packs**, with **champions** and **rares** among them. |
| **Zones** | Every named region on the map has its own level band. The one you start in is always level 1–4; walk further and everything is stronger and worth more. |
| **Dungeons** | Real interiors: rooms, corridors, walls you cannot pass, a pack in most rooms, a boss at the far end, chests worth the walk, and no daylight at all. |
| **Treasure** | Chests in four grades on the ground and in every dungeon, loot bags off bosses and rares, and a reward screen that counts it up. |
| **Craft** | Recycle anything you do not want into materials, then forge, temper, promote, inscribe, reweave, recast or brand a weapon at the bench. No mining, no woodcutting. |
| **Companions** | Thirteen of the thirty classes bring something with them — a necromancer's skeletons, a druid's wolves, a tinker's sentry — with their own AI and their own bodies. |
| **Light** | Every character starts with a torch, and it lights a large area. Braziers, dungeon sconces and camp fires light themselves. |
| **Loot** | Real Emberveil items: bases, affixes, qualities, uniques and set pieces, with rarity colours and an upgrade arrow. |
| **Grow** | XP, 30 levels, attribute points, gear that changes your damage and the weapon in your character's hand. |
| **Swim** | Deep water makes you swim — floating at the surface, with front, back and side strokes. |
| **Ride** | **H** puts you on a horse: faster, longer jumps, no attacking. |
| **Combat feel** | A white arc shows exactly the area a swing damages; bows fire real arrows; every hit splashes. |
| **Skills** | Four per class on **1–4**, with cooldowns and mana, drawn with `avatar-3d`'s spell effects — and statuses that keep working after the hit: burn, poison, chill, Might, Guard. |
| **First person** | **V** puts the camera in your character's head — the head itself comes off the model, so you are not looking through the inside of your own face. |
| **The star** | God rays, a lens flare that survives an eclipse with a corona ring, and a warm wash up the sky as the sun goes behind a ridge. Off under Picture in the settings if it is too much. |
| **Map** | **M** opens a full-screen map with your position, pins and World Forge's own layer filters. |
| **Save** | Runs save themselves to the browser and load back — several slots, with a Continue button. |
| **Solid** | Trees, rocks, ruins, houses and walls stop you walking through them. |
| **Eclipses** | The neighbours visibly orbit, and a body crossing the star really darkens the world. |
| **Towns** | Every settlement has people in it — a merchant, an elder, a smith, an innkeeper, guards — with names from Name Forge in the settlement's own race. **E** to talk, trade and take work. |
| **Work** | Four kinds of job, all anchored to real things on this map: cull a creature that really spawns here, carry word to a town that really exists, clear a dungeon that was really placed, gather items that really drop. |
| **Fly** | **J** boards the ship. W throttle, **Shift** boost, hold **Space** to warp. Fly to another planet and **J** to land — the whole world is rebuilt and your character comes with you. |
| **Hear** | Footsteps at your walking cadence, combat, loot by rarity, coins, levels, and an ambience bed that follows the ground from forest to marsh to mountain to town. |
| **Be spoken to** | NPC lines are generated by Lingo from that person's own personality, and spoken aloud in a formant voice built from their role, gender and seed. |
| **Debug** | A menu on **`** (backtick) for weather, time of day, world density, teleports, eclipses, audio, character tools and a copy-to-clipboard report. |

## Controls

**On foot:** `WASD` move · `Shift` run · `Space` jump · left click swing (click once to capture the
mouse) · **`1`–`6` skills** · **`V` first person** · **`E` talk / open a chest / go into a dungeon /
climb back out** · **`F` light or snuff your torch** · `H` mount a horse · `J` board the ship ·
`M` the map · `I` or `Tab` character sheet · `O` settings · **`` ` `` debug menu** · `Esc` step back.

**In space:** `W` throttle · mouse steer · `Shift` boost · hold `Space` to warp · `J` land.

URL options: `?seed=7`, `?auto=1` (skip the title), `?class=mage` (pick a class without the menu),
`?quality=low` (smaller budgets — what the Playwright specs use), `?weather=storm` (start in a given
sky and hold it).

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

**Rivers and roads are cut into the ground, not painted on it — and cut from the PATH, not the cell
grid.** A map cell is 640 m and a river is about 30 m. Carving from the cell mask gave a gorge wide
enough to swallow a town, which is exactly what it did: World Forge founds towns on rivers (45 of 93
on one test world), so a town in a 640 m trench was the common case, not the odd one.

`makeTerrain` now builds smoothed polylines through the river and road cells, indexes their segments
in buckets, and asks "how far is the nearest one?" for every height sample (the early-out when no
bucket holds anything is what keeps a 47,000-sample ring rebuild at ~34 ms). From that it carves:

- **a river channel** the width of its water (7 + 5 × the map's river width, so about 22 m across)
  with a flat bed 2.4 + 1.5 × width below the surface — deep enough to swim in — and banks blending
  back to the land over ~26 m.
- **the water surface** itself: the natural ground along the line, forced downhill so a river never
  flows uphill, then smoothed *and pulled back down to the ground* on each pass. Smoothing alone
  lifted the line over steep ground and turned a mountain stream into a 56 m deep canal.
- **a graded road**: the natural ground smoothed along the line, so a road is flat across its width
  and gentle along its length. Nothing is planted on it, and **a road that meets a river is lifted
  clear of the water** with its approaches ramped up, so the bridge has something to stand on.

`js/features.js` then lays the water and road ribbons on *those same surfaces*, which is why neither
can clip through the ground it was carved into.

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
  those overlaps are at road *ends*, because towns are founded on rivers.) A bridge sits at the
  road's own lifted height, is built with its deck along **+Z** — the axis `yaw` points down, like
  every other body in the game — and is stretched along that axis to span the channel and both
  banks. Built across +X instead, it lay *across* the river rather than spanning it.
- **Settlements** — the map's own nodes, sized from `node.size`: a village is a well and a ring of
  huts, a city adds a hall, a wall with a gate gap and four towers. All instanced. Nothing is built
  in the channel or on the bank, so a riverside town sits *beside* its river. The wall is walked
  corner to corner, each segment spanning the chord to the next and sitting on the lower of its two
  ends — spacing segments by arc length, each at its own ground height, is what left gaps in it.

**These are buildings, not a town layer.** There are no people in them, no shops and no interiors —
that is phase 4.

---

## Files

| File | What it does |
|---|---|
| `js/planet.js` | Star → system → planet → surface map → `heightAt`/`colorAt`/`climateAt`/`spawnPoint`, with rivers and roads carved in. **Pure, node-testable.** |
| `js/terrain.js` | The clipmap rings, vertex colours, the water plane. |
| `js/sky.js` | Star, sibling planets with their weather, moons, starfield, day/night, the two-pass render. Each body on its own shell (so they occlude) and its own orbital clock (so none of them whips round). |
| `js/sunfx.js` | God rays, lens flare, the corona ring during an eclipse, and the sun going behind a ridge — screen space, with a terrain march for the occlusion. |
| `js/weather.js` | Cloud decks, rain, snow, dust, lightning, fog. |
| `js/props.js` | The scatter: 16 prop kinds, per-biome kits, grass, ruins. One draw call per kind. |
| `js/features.js` | Rivers, roads, bridges and settlements from the map's own data. |
| `js/debug.js` | The backtick menu, including a copy-to-clipboard debug report. |
| `js/map.js` | The full-screen map on `M`, over World Forge's own `renderWorld()`. |
| `js/save.js` | Browser saves: the seed plus what you did, never the world. |
| `js/collide.js` | The obstacle field — props and buildings file cylinders as they are instanced. |
| `js/combat-fx.js` | The swipe arc (which is the hit box), arrows and impact puffs. |
| `js/space.js` | The star system in its own compressed units: flight, warp, landing. |
| `js/town.js` | The people in the settlements — roster, names, trade, the work they hand out. |
| `js/quests.js` | The job model. **Pure, node-testable.** |
| `js/talkui.js` | The one panel that does greeting, trade and work. |
| `js/sound.js` | When the game asks the Sound Lab for what, and which bed belongs over which ground. |
| `js/speech.js` | Personality and a voice per NPC; Lingo generates what they say. |
| `js/player.js` | Input, the third-person controller, the follow camera. |
| `js/actors.js` | One interface over Chibi 2 humanoids and creatures; the enemy field. |
| `js/rpg.js` | Stats, XP, levels, equipment, damage, loot rolls. **Pure, node-testable.** |
| `js/skills.js` | The skill bar: cooldowns, mana, what a skill does and to whom, and the statuses it leaves behind. **Pure, node-testable.** |
| `js/hud.js` | Bars, log, minimap, prompts, the boss bar, and the **tabbed** character sheet. |
| `js/zones.js` | The level band of every named region, from the region graph. **Pure, node-testable.** |
| `js/effects.js` | Every affix and legendary power in the game, as real-time hooks. **Pure, node-testable.** |
| `js/craft.js` | The materials bag and the bench: recycle, forge, temper, promote, reweave, recast, brand. **Pure.** |
| `js/chests.js` | Chests, loot bags, and the brazier and sconce models. |
| `js/dungeon.js` | The dungeon interior: geometry, lighting, a terrain stand-in, its own chests. |
| `js/dungeon-plan.js` | The room-and-corridor layout, with no Three.js in it. **Pure, node-testable.** |
| `js/encounters.js` | Set-piece encounters on the road: warbands, ambushes, swarms, a rare with an escort. |
| `js/sites.js` | Camps with a fire in them, and the lairs world bosses keep. |
| `js/pets.js` | Companions: follow, engage, return, fall, come back. |
| `js/light.js` | The torch, the world's light sources, and the floor under the night ambient. |
| `js/markers.js` | Quests, story objectives and dropped pins, each filed under the world it is on. Feeds the map, the minimap's rim arrows and the space brackets. **Pure, node-testable.** |
| `js/starchart.js` | `M` with no ground under you: system → nearby stars → arm → galaxy, and the jump. **Projections and reach rules are pure and node-tested.** |
| `js/warp.js` | The five-second tunnel between stars: one buffer of line segments stretched by a single intensity curve. |
| `js/water-plan.js` | Where a river's sheet ends and where a lake's sheet goes. Split out of `features.js` so node can test that the water meets its bank. **Pure, node-testable.** |
| `js/affixes.js` | What an affix is worth and when it may appear: units, floors, caps, slot rules, item levels and tiers. **Pure, node-testable.** |
| `js/gear.js` | Mounts, lights and quivers (loot), and boats and ships (unlockables). **Pure, node-testable.** |
| `js/weapons.js` | A weapon's attack pattern, dual wielding, two-handers, staves and wands. **Pure, node-testable.** |
| `js/perks.js` | The perk forest: four arms, oddballs, keystones, and what walking them grants. **Pure, node-testable.** |
| `js/skilltalents.js` | A three-tier tree per skill, folded into the plan that gets cast. **Pure, node-testable.** |
| `js/meteors.js` | Something falls out of the sky for thirty seconds and leaves a chest. |
| `js/town-plan.js` | What a town is made of and how it is laid out. **Pure, node-testable.** |
| `js/sky-looks.js` | The six skies a system can have. **Pure, node-testable.** |
| `js/main.js` | Boot, wiring, the frame loop, `window.farhold`. |
| `data/balance.json` | Every knob: player numbers, enemy scaling, drops, ring sizes, scatter density, weather timing, sky exaggeration. |
| `data/enemies.json` | 46 enemies, 6 bosses, 10 companions, 14 champion/rare modifiers. |
| `data/skills.json` | 39 skills, 14 statuses, and the six each of the thirty classes gets. |
| `data/classes.json` | All thirty classes: look, starting kit, skills, companions. |
| `data/crafting.json` | 12 materials, the recycling tables, and 16 bench recipes. |
| `data/encounters.json` | 11 set-piece encounters. |
| `BESTIARY-IDEAS.md` | ~40 creatures worth adding — neutral wildlife, folk on the road, and the four thin biome families — each tagged by how much work its body is. |

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

- **Affixes are all wired now.** `js/effects.js` carries every one of the 63 affix stats items.json
  can roll and all 24 legendary powers. The `inert` list on the character sheet still exists as a
  guard, and it is empty — a node test fails if anything ever goes back into it.
- **Enemies have roles but not skill bars.** Archers and casters keep their distance and throw real
  bolts, champions and rares carry modifiers, bosses have phases that turn modifiers on — but no
  enemy chooses between several abilities the way the player does.
- **No dodge roll, block input or knockback** — blocking happens on the dice (`block_chance`), not
  on a button. Hits land, but the fight still has no defensive *input*.
- **Dungeons have no ceiling.** Tall walls, black sky and close fog instead, because a third-person
  camera inside a closed box spends its life clipped into the roof.
- **Companions do not path around walls.** They walk at you, and snap to you if they fall a long
  way behind.
- **The sun effects are screen space, not volumetric.** `js/sunfx.js` projects the star, asks the
  terrain whether anything is in the way, and paints gradients. Real shafts want a depth pre-pass and
  a radial blur, which this prototype cannot spare. It reads correctly and costs nothing, but it is
  a painted effect, and a very thin ridge can cut the shafts a frame before it covers the star.
- **Props do not sway** in the wind, and grass has no alpha texture — both are cheap wins later.
- **Collision is cylinders, not shapes.** A house is a circle to walk around, so its corners are
  softer than they look; and enemies ignore collision entirely.
- **Swimming is surface only** — no diving, no underwater anything.
- **Dungeons are markers, not places.** A "clear" job sends you to the site; there is no interior.
- **Enemies do not path around terrain.** They walk straight at you and turn away from water.

## Tests

```sh
node --test prototypes/farhold/tests/*.test.js     # ground + rules, no browser
node --test worldgen/tests/weather.test.js         # the weather model
npx playwright test prototypes/farhold             # the real page
```

The node tests cover terrain determinism, height sanity, agreement with the map, slopes vs normals,
levels, gear, loot and the bestiary. Round 4 adds 32 more: zone bands (the start is always the
softest, they climb outward, every world shape works), dungeon layouts (every room reachable, the
boss is never in the doorway, no two rooms overlap), crafting (the materials bag has no limit,
recycling is the only source, advanced work needs rarer components, every bench action does what it
says, a unique cannot be reworked), the effect registry (nothing in items.json is dead data, every
effect describes itself, conditionals only fire under their condition), the statuses, and — after
the bug the user hit in play — **no strike anywhere in the bestiary, at any rank, can produce a
NaN**. The browser tests add fourteen: a new run starts in daylight wherever it lands, the map's
level overlay, a busy world, a chest that pays out, a dungeon you can stand in with walls that stop
you, the torch, the sheet's five tabs and the mouse coming back, recycling feeding the bench,
companions that follow, all thirty classes booting, the galaxy sitting behind the planets with the
atmosphere in front, camps that fill when you walk up to them, and a live fight with no NaN in it.

 `worldgen/tests/weather.test.js` covers the weather model (no
snow in a desert, no rain on a dry world, a clock that crossfades, palettes that vary by seed but
stay recognisable). The browser tests cover the three reported bugs (daylight start, facing and
strafe, looking straight up with ground behind you), the scatter staying instanced and never standing
in the sea, rivers/roads/bridges/towns built from the map, weather changing the sky, the debug menu,
and every planet getting its own colours. Round 3 adds: a river that is a swimmable channel rather
than a gorge, no building standing in the water, roads graded into the ground with nothing growing
on them, roads that pay for the height they gain, things you cannot walk through, a closed city
wall, a swipe arc that points where the damage lands, a bow that fires, a horse, the map screen, a
save that round-trips through a reload, a minimap with relief on a single-biome world, and an
eclipse that takes the light away. Phase 3's fight adds: the bar drawing four slots and dimming a
slot on cooldown, a firebolt that reaches a moving enemy and leaves it burning after the bolt is
gone, a nova that catches and chills everything around you, key 1 spending mana and refusing when
the pool is empty, and War Cry and Guard landing as real statuses. The queued round-3 items add:
first person putting the camera at the eye and the head off the body, sky bodies at distinct depths
in real distance order, nothing crossing the sky faster than the cap on a seed with a three-day
planet, a flare that is on the star and survives an eclipse, ground between you and the star
putting the rays out, and the settings switch for all of it.

**Round 5** adds 22 node tests over three new files — `tests/markers.test.js` (a marker belongs to
the world it was made on; tracking sticks; quests mark and unmark themselves; a bearing takes the
short way round the seam), `tests/starchart.test.js` (each step shows more than the last, the drive's
reach fits inside the first star view, you are dead centre at every step, fewer than 6% of the
galaxy's stars are dead ends, and no two stars share a seed) and `tests/water.test.js` (the sheet is
never narrower than its channel, no vertex on any river is open to the air, the skirt hangs down and
faces outward, and every lake is level and sits in a basin the terrain really carved) — plus two more
in `tests/planet.test.js` for the habitable-start search. `tests/round5.spec.js` adds eleven in the
page: the habitable start on and off, water and lakes on a real world, a quest marking itself on the
map and the tracking list, a marker staying behind when you leave, `M` branching between the world
map and the chart, the chart stepping out to the galaxy and back, a five-second jump that comes out
in a different system with the old world's markers left where they were, a throttle that falls and a
planet that sharpens as you close, falling into an atmosphere with nobody touching a key, and the
clipmap covering ten kilometres at altitude for the same triangle count.

## Round 10 — the play-test list, the full-screen sheet, and The Territory

Seven things came back from a play-test. `RPG.md` has the full write-up of each; the headlines:

1. **A level-1 character was being dropped into a level 30-33 zone.** A world's difficulty band was
   decided partly by `seed % 3`, so 47% of seeds started you somewhere whose softest corner was level
   30. The band now comes from what the world IS, the low band is claimed first for whichever world a
   newcomer would land on, and every system carries a body for every band (moons count). The starting
   system always holds a world you can live on — and turning *Habitable start* off now means
   something: you come down on the harshest rock in the system instead, with the blue world one short
   flight away.
2. **Clicking the perk tree selected whatever was ~100px below the cursor.** The canvas buffer was
   sized from its parent and one device-pixel ratio was applied to both axes. Fixed, and verified: at
   three viewport sizes, fitted and zoomed, all 89 nodes hit-test to themselves.
3. **The perk forest is a lattice now** — whole-unit rings, even angular steps, no jitter, and the
   oddballs off the arm centrelines they used to sit on top of. Scroll to zoom, drag to pan.
4. **The character sheet is a full screen.** Designed from `research/ui-round10-design.md`: a
   persistent header, a tab rail with number keys and unspent-point badges, and one purpose-built
   grid per screen. Nothing scrolls but a pane body.
5. **W and S fly the ship forward again.** The longitude wrap was not bit-exact, so the "you hit the
   edge of the map" brake fired forty-five times a second in the middle of the map: 80 m in twenty
   seconds instead of 15.3 km. The poles wrap now too, so a heading held long enough goes round.
6. **Planet size gets Tiny and Super tiny**, the default is Small, and the knob finally reaches
   everything — camps, dungeon doors, the horizon and the flight model all followed a hard-coded 640
   metres a cell before.
7. **Save and load.** `snapshot()` was silently dropping `world`, `quests` and `campaign` from its
   own argument list, which is why a run saved in a town reloaded into open ocean — and why every
   load emptied the quest log.

### The Territory

`EXPANSION.md` is the plan. Farhold is a whole planet and crossing one is slow on purpose, but
everything it asked of you was somewhere else. This makes a zone a place with people in it:

| file | what it adds |
|---|---|
| `js/factions.js` · `data/factions.json` | 12 factions, a standing each from −100 to 100, and the rule that a deed for one is a third of a deed against everyone they are at odds with |
| `js/territory.js` | one record a zone — holder, grip, real camps, open trouble — generated from the seed, with only the deltas saved |
| `js/jobgen.js` · `data/job-frames.json` | 22 frames that only fire when every slot binds to something that exists right now |
| `js/patrols.js` | 10 compositions walking the zone's real road nodes, reacting to your standing |
| `js/caravans.js` | 10 manifests; trade with it, escort it, rob it, or find its wreck — the same object in four states |
| `js/wanderers.js` · `data/wanderers.json` | 14 kinds of person on the road, the main way a job reaches you outside a town |
| `js/incidents.js` · `data/incidents.json` | 12 things that happen TO a zone and change what spawns, what a shop charges, and which frames can fire |
| `js/rumours.js` | the only thing allowed to talk about somewhere you are not — a sentence, never a pin |
| `data/landmarks.json` · `data/faction-rewards.json` | 14 places that fill a zone in, and two ranks a faction of things standing buys |

All of it is pure JavaScript, ticked from the game loop, so a distant patrol costs one line of
arithmetic a frame. Shown in three new Journal panes: who holds this ground, work going here, and
word going round.

Tests: `tests/round10.test.js` (17) and `tests/expansion.test.js` (37).

## The round-10 review, and the gear you buy

`research/review-round10.md` is a full play-and-inspect pass: 45 findings across the title screen, the
first five minutes, every sheet screen, the map, the chart, a town, a shop, a dungeon, space and
night. All 45 are implemented. `RPG.md` has the write-up; what a player notices:

- **The game tells you what to do now.** A tracked objective on the HUD, a title screen that says what
  the game is, and a class preview that fills in as you scroll the thirty-entry dropdown — the four
  skills, the starting weapon, the companion.
- **The map only names places you have been.** You learn a region's name by crossing into it or
  hearing a rumour about it. Danger colour, level band, towns and roads are always drawn, so planning
  a route is unchanged.
- **Every key can be rebound** — 14 actions, click a row and press a key — plus a field-of-view
  slider and units on every slider.
- **Dungeons are navigable, the torch is a flame rather than a spotlight, and the hooded mage has a
  head.**
- **Rumours are signed by a real person** out of the town's roster, not "somebody in The Bleak Moor".

### Mounts, lights, boats and ships

`js/gear.js` holds three mounts, three lights, three boats and three ships. The dividing line is
whether a thing is **loot**: a mount, a lantern and a quiver roll a rarity, carry affixes, upgrade at
the bench and drop as a find. A boat and a ship do not — you buy one once, you own it for the run, and
you pick between them from a dropdown. Mixing the two is what makes an inventory tedious.

Every merchant carries **all three** mounts and **all three** lights (the rarity still rolls on the
two dearer ones), sorted into racks with headings so they are not buried behind the Weapons tab. A
shop row carries its own spec — slot, damage or armour, speed, how far a light reaches, the level it
needs, and one word on whether it beats what you are wearing — so a shelf can be read without hovering
it item by item.

**Boats equip themselves.** Walk into water deep enough to swim in and whichever boat you own goes
under you; walk out and it comes with you. There is no key and no slot. The speed is the hull's:

| boat | speed | price | against |
|---|---|---|---|
| Lashed Raft | 3.4 m/s | free, you start with it | swimming is 2.7 |
| Fenland Skiff | 5.6 m/s | 340g | walking is 5.4 |
| Coast Cutter | 8.2 m/s | 1400g | sprinting is 11.3 |

So the cheapest boat already beats swimming, the best one beats walking, and none of them beats a
sprint on dry land — water stays a choice, not a shortcut. `js/boat.js` draws the three hulls.

Tests: `tests/vehicles.test.js` (15 node) and `tests/vehicles.spec.js` (4 page).
