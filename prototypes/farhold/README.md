# Farhold (prototype — ten phases, plus round 4: the RPG expansion)

> **QA pass pending** (added 2026-11-11): the next time this game is worked on, run `tools/prepublish-check.sh farhold` from the playground and fix what it finds — game-lint (on 2026-11-11: 17 browser-tooltip, 2 browser-popup, 5 muster, 3 banned-name, 1 no-whats-new), modules nothing loads (`tools/game-reach.mjs`), and a `tests/walk.mjs` that walks every screen on desktop + phone (`tools/walk-screens.mjs`; none yet). Replace this note with the **Status / Play / Next / Parked** block (`~/claude/docs/game-standards.md`) and add `farhold` to `tools/qa-passed.json`. Publishing this game refuses until the checks pass. **A head start exists:** a helper got Farhold lint-clean (1,621 unit tests green) before the sweep was stopped — its work is in the git stash named "QA pass WIP 2026-11-11" (`git checkout <that stash> -- prototypes/farhold` plus its untracked `js/whatsnew.js`, `data/changelog.json`, `tests/walk.mjs`), two more fixes are in `~/claude/agent/farhold-qa-extra-2026-11-11.patch` (class card damage label vs its sentence; sheet tab margins), and the walk needs `ready` to wait for `#boot-news`; the phone Skills tab step failed and was not looked at.

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
**Round 17 adds a thirty-first class: the one you build.** Point-buy spells off a tier list drawn
from all thirty presets, eighteen loadouts, a companion or a sealed chest to open with, follower
slots you manage on a screen of their own, and ten kinds of mercenary for hire in town.
[`CLASSES.md`](CLASSES.md) documents the builder, the spell tier list, the follower rules and the
mercenary data format.
**Round 17 also gives every building a screen of its own** — press `E` at a furnace and you get the
furnace, not the build menu — and puts four ages of **research** behind the high-tech half of the
catalogue, with everything low-tech yours from the moment you land.
[`RESEARCH.md`](RESEARCH.md) documents the tree, the points and the gate; the station screens, the
tidied build panel and the onboarding deadlock they fixed are in the "Round 17" section of
[`BUILD-MODE.md`](BUILD-MODE.md).
**And a five-step line holds your hand from an empty field to your first iron ingot** — a job taken
in the starter town, timber and stone, a crate on the ground, a furnace, a smelt
([`js/onboarding.js`](js/onboarding.js)).

Round 17's other five clusters — the interface and the keys, the map, weapons/tools/seams, worldgen,
and onboarding — each have a `## Round 17` section in [`RPG.md`](RPG.md).
[`FUTURE_SYSTEM_BRAINSTORM.md`](FUTURE_SYSTEM_BRAINSTORM.md) is the parking lot for what comes after
this round: scanning that turns into material discovery, a research tree that branches, more land
vehicles, followers with opinions. **Nothing in it is built**, deliberately.

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

**Build mode (`B`):** opens the panel **and gives you the mouse back**, so you can click the tools
and the catalogue. The ghost follows the cursor, not the middle of the screen; left-drag still turns
the camera, and a click is a click only if the mouse did not move. `Enter` finishes a run of road or
wall · `Esc` drops a half-drawn run, then leaves the mode · `Ctrl+Z` undo · `[` `]` brush size ·
scroll turns the piece (or sizes the brush).

**Gathering:** there is no gathering key. **Swing at it.** Trees, bushes, reeds, rocks, boulders and
ore seams all come down to the weapon in your hands, and the tool tier is read off that weapon — so
a crystal refuses a bronze sword and says what would work instead. `E` on a seam still takes a
single measured swing and reports what it would deliver per minute.

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
- **Roads** — the A* network, as a ribbon in the cutting the terrain carved for it. Three widths
  (R27): a highway is 9 m, a road 7 m, a trail 4.5 m, from
  `ROAD_CLASS` in `js/planet.js`, which is the only place a road's width is set. A road that meets a
  hill it cannot take straight is folded into switchbacks (`js/road-fold.js`), and where two roads
  cross they meet at a filed crossroads with one height.
- **Bridges** — come from `findCrossings()` in `js/planet.js`, which walks every road over the
  river network and records a crossing wherever the carriageway is over water and the deck is clear
  of it (the lift pass raises the road to meet it). World Forge's own `road.bridges` cells are NOT
  used: they only mark where the map's A* stepped onto a water cell, which misses a river passing
  between two road points and found almost nothing anyway (those overlaps are at road *ends*,
  because towns are founded on rivers). Each crossing is built from its plan by
  `js/bridge-plan.js` — the deck follows the road's own rise and fall and is filed as a walkable
  deck collider — with its long axis along **+Z**, the axis `yaw` points down.
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
| `js/props.js` | The scatter: 16 prop kinds, per-biome kits, grass, ruins. One draw call per kind. Plus the **harvest ledger** — what you have felled and where you have cleared — since a pure-function scatter has nowhere else to record it. |
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
| `js/meteors.js` | Something falls out of the sky for thirty seconds and leaves a chest — and a Meteor Fall seam in the crater, the only source of meteoric iron. |
| `js/haulpath.js` | A\* over an 8 m grid: what a hauler actually walks between a drill and a store, round the water and along the contour. **Pure, node-testable.** |
| `js/resources.js` | What is in the ground, what it costs to get home, and the whole-planet seam field. Surface, indoors and placed-by-hand kinds are three different things. **Pure, node-testable.** |
| `js/mining.js` | Drills, routes that lay themselves, and the one number the resource system exists to produce. **Pure, node-testable.** |
| `js/ore-view.js` | The seams on the ground, and the haul routes drawn between them. |
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

Round 13 adds `tests/round13.test.js` (13 node tests) and `tests/round13.spec.js` (7 browser tests).
The node ones pin the rules: **nothing on the surface holding iron ore may need a tool you cannot
have yet** (it caught a second offender the moment it was written), an `indoors` seam is underground
and a `placedOnly` one is nowhere in the scatter, a refusal names the tool *and* where the tool comes
from, a haul route walks round water instead of through it, a cliff is a wall and an unreachable
store answers instead of searching the planet, the best store is the one that *delivers* most, a
drill lays its own route and re-routing moves it rather than refusing, the drawn path is the measured
one, and every entry in `PROP_HARVEST` has health, a tool tier, a verb, and drops that are real
materials. The browser ones play it: Clear actually clears and pays out, levelling takes the trees
with it, a tree comes down to repeated swings and leaves timber, `B` frees the cursor and the panel's
buttons work, the Road tool draws the run from the first click and Enter lays it, the scanner finds
deposits and pins them to the map, and every town on the world is one connected street network.

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

## Rounds 11 and 12 — a base, and everything that was already built but not plugged in

Two play-test rounds and `BUILDING_EXPANSION.md`. The detail is in **`BUILD-MODE.md`** (§§0, 12–19)
and the "Rounds 11 and 12" section of **`RPG.md`**; this is the short version.

### What you can do now that you could not before

Press **`B`**. A panel comes up with four numbered steps at the top telling you how to start a base,
and they disappear once you own anything. Then:

1. **Level** a circle of ground — nothing in the catalogue will sit on raw Farhold, which is the
   point of the tool.
2. Put down a **Furnace** and a **Storage Crate**. You can build anywhere — there is no permit. An
   **Outpost Marker** is optional and only names the place; a raid comes for whatever you have built.
   (Round 14: the Claim Stone is gone. It cost two iron ingots, iron needed a furnace, and a furnace
   needed a claim — so your second base was impossible.)
3. A **Storage Crate** and a **Burner Generator** beside it, with coal in the crate.
4. A **Waypoint Pad** when you can afford one — and now you can come home from anywhere, including
   from another star system.

Along the way: `E` works an ore seam, a **drill** on a seam digs it for you, a **route** to a crate
carries it at a rate the distance decides, a **bench** you walk up to smelts it, a **turret** shoots
what comes at you, an **alarm bell** offers you a raid you choose the hour of, **beds** make a
holding with people who pay tax, a **field** you break is one your folk will replant for ever, a
**motorcycle** is `G`, and four subsystems on a levelled pad open the sky.

### The real story of the round

Almost none of that was new code. It was **seven joins that had never been made**: complete, tested
modules that no line of `main.js` imported, or imported and never fed. From the player's side that
is indistinguishable from a feature that does not exist, and it is much harder to notice than a
crash, because every test of the module itself passes.

A few, for flavour: nothing called `build.confirm()`, so clicking in build mode drew a sword. The
build ghost was aimed at the player's own feet. Ore was generated with
`createNodeField({ data, seed, terrain })` — a function that takes **none** of those three — so
every seam in the game sat in a 300 m circle around the origin, about 29 km from where anyone lands.
`js/raid.js` was imported by nothing at all. And `canLaunch` refused a flight the tanks could not pay
for while nothing, anywhere, ever put fuel in them.

### Two things worth carrying to the next project

A **settlement id is a number, and the first one is `0`** — so every `if (padPick)` in the map
silently dropped the pad nearest the middle of the screen.

And **three TDZ crashes** from `const`s read above their own declaration. `node --check` cannot see
them, they do not fire until that line runs, and one of them only fired on a *load* — so every
fresh-start test in the suite passed while every saved game was broken.

---

## Round 13 — the play-test list: build tools, gathering, and the roads

Eleven items. Eight of them were the same fault in different clothes — **a rule written into the
data and read by nobody, or a module finished and never called** — which is now three rounds
running. The full write-up is in `RPG.md`; the build-mode half is in `BUILD-MODE.md`.

### What you can do now that you could not before

* **Swing at a tree and get timber.** Trees, bushes, reeds, rocks, boulders and crystals all have
  health, a tool tier and a drop list (`PROP_HARVEST`). The swing you already make is the gathering
  verb; there is no new key. Woods regrow, boulders do not.
* **Clear actually clears**, and pays out what was standing there. It called a method that did not
  exist, behind an `?.`, for the whole life of the building expansion.
* **Level, Raise and Lower take the trees with them** and rebuild what is left on the new ground,
  instead of leaving a levelled plot with its wood hanging in the air.
* **Road and Wall draw the run as you click it** — pegs, bands and a dashed leg to the cursor — and
  picking the tool picks a piece, so the panel stops quoting the price of a crate.
* **Scan** sweeps for deposits from the cursor and lists one row per material, best of each by what
  it would deliver, with a bearing and a pin that goes to the map, the minimap and the rim arrows.
* **A drill lays its own route**, to whichever store *delivers* most over ground a hauler can walk —
  `js/haulpath.js` is A\* with water as a wall — and the track is drawn on the ground.
* **`B` gives you the mouse back**, so the panel is clickable and the ghost is under the cursor.
* **Iron is reachable.** The Deep Vein said `indoors: true` from the day it landed and nothing read
  it, so a hardness-2 iron seam was scattered on open grassland with no tier-2 tool in the game yet.
* **A town is one street network**, and the highway that passes through becomes its high street.
* **Build costs are payable.** The catalogue priced things in `timber`/`iron`/`parts`; the game
  produces `log`/`iron_ingot`/`machine_part`; the two had never been introduced, so a palisade cost
  six units of a thing nothing has ever made. One alias table, applied once at boot — plus `wire`
  and `concrete`, which ten structures spent and no recipe produced, now made at a real bench.

### The rule that came out of it

> **Whatever the surface offers, a brand new player holding a starting weapon must be able to work
> it.** Crystal and obsidian may be a "come back later"; nothing holding iron ore may be.

`tests/round13.test.js` checks it over every biome, and it caught a second offender (`meteor_site`)
within a minute of being written — which is the argument for writing the rule down as a test rather
than fixing the one seam that was reported.

## Round 16 — the seventeen-item play-test list

Full write-up: the **Round 16** sections of `RPG.md` and `BUILD-MODE.md`. The short version of what
changed for a player:

* **You have a tool now.** It is an item, in a slot of its own, and you build it — one tool is pick
  and axe, its tier says what it can work and its quality says how fast. The mouse wheel turns
  between **weapon, tool, scanner and Command Rod**, and a mode with nothing behind it is not in the
  ring. Pressing **E** *or the attack button* at a seam or a tree starts a **progress bar over the
  thing**, and the take comes when it fills.
  This is the fix for "ranged characters can't harvest": the tool tier used to be a regular
  expression on your weapon's *name*, and a bow is made of yew.
* **The scanner** is a device you build. It sweeps close to you and remembers everything it finds
  for the rest of the save, on the map and in the Find tab (which now sorts by distance and filters
  to your favourites). While it is running, the map shows nothing but deposits, each labelled.
* **Twenty new places you can go into** — a cave, an abandoned farmstead, a flooded cistern, a
  sealed vault, a dragon's lair — each with its own interior, its own inhabitants and something
  worth the walk. Some are found; some a town sends you to.
* **Quests can be handed in from the journal**, and they pay in four different ways now: coin,
  a loot crate, materials, or the giver asking which you would rather have. The biggest jobs offer
  **one of three rare-or-better items**.
* **The perk tree has eight arms** instead of four: defence, bonus loot, recovery and mobility join
  the original melee, ranged, arcane and wild.
* **Houses are a population**, the **Town Hall** in any settlement of size three or more is a door
  you can open, and the **Command Rod** lets you select your own people and tell them where to be.
* **Drills have their own build menu and run themselves**; benches need work, and **holding E** at
  one puts your back into the same job your people are doing.
* **A new title screen**: menu, load, a character step with a live figure and an appearance editor,
  and a world step that draws the actual planet for the seed you picked.
* **No ammunition anywhere**, and a flight leg costs one unit of fuel.

And a great many bugs, most of which were not what they looked like — a gibbet with no model was two
landmark systems that had never been introduced; a raft tilting was a Euler rotation *order*; a
stuttering horse was an animation clock reset sixty times a second; and "every JS file takes 2–5
seconds over wifi" was a dev server speaking HTTP/1.0. A cold load is **7.31 s → 0.07 s**.

## Round 20 — one spell at creation, the rest as you level, and the Unbinder

Full write-up: the [`# Round 20`](CLASSES.md) section of `CLASSES.md`.

* **The character creator asks for one spell, not six.** The ladder moved to **1 / 3 / 6 / 12 / 18 /
  24** (7 became 6), and a pick is gated by the character's own level. That one rule is the whole
  change: the title screen builds a level-1 character, so five of the six slots refuse themselves
  and the creator needs no code that knows it is a creator.
* **An unfilled slot is a real slot.** It is not quietly filled with the cheapest spell of its tier
  any more — that would have meant the game choosing four spells on your behalf. The key spends
  nothing and says what is wrong.
* **A "Spell available" slot** on the character sheet, a badge on the tab, a green slot on the bar
  and a line on the level-up. Clicking it opens the chooser — which is the builder's own Spells tab
  with a level on it, not a second dialog holding a second copy of the rules.
* **The Unbinder**, in any settlement of two houses or more, takes a **spell, a perk or a talent**
  back off you for gold — one at a time or all of them. Every free undo left the character sheet,
  and so did the two ways round it that survived removing the buttons: overwriting a filled spell
  slot, and re-picking a spent talent tier. Prices are in `data/balance.json`.

Three bugs that were already there before this round started, and one of them was the big one:
**the custom class could not start a game at all.** The opening kit logged a line through a `hud`
that would not exist for another seven hundred lines, and the default opening is the crate, and the
crate logs — so every custom character made the ordinary way had died on boot since R17. Every spec
we had opened the builder and none of them ever pressed Start. Picked talents were also never saved,
and a refused row on the new counter explained itself only in a tooltip.

## Accounts and cloud saves (2026-10-23)

Signing in is optional: a guest's game is exactly what it was. The title menu and the pause menu (Esc) each carry the
shared games.radgh.com account button (`shared/rgs-signin.js` — a QR code to sign in with your phone, or a username
and password; Thousandvale accounts work, with their own Farhold saves) and one status line ("Saves kept in your
account · saved 2 min ago" / "Sign in to keep your saves in your account").

`js/cloud.js` wires `shared/rgs-cloudsave.js` with game id `farhold`. What travels: `farhold.saves.v1` (every slot),
`farhold.lastSave` (what Continue loads), `farhold.blueprints.v1` (build layouts kept across worlds) and every
`farhold.seen.*` key (discovered regions, one key per world — synced as one prefix group). Settings, key bindings, the
log filter and the terrain cache stay on the device. `createSaves({ onChange })` calls `saveSoon()` after every write
and delete.

Restoring only happens on the title screen: the saves land in localStorage and `farhold:saves-changed` makes
js/newgame.js redraw Continue and the Load list in place. Once a run has started (`setPlaying(true)` in main.js),
newer saves on the account wait — the status line says so — and come down the next time the title opens (pause menu →
Main menu). When both copies changed, `.fh-cloud-ask` asks which to keep; nothing is replaced while it is up.

Tests: `tests/cloud-saves.spec.js` (real dev API on :8600, skipped when it is down) — guest sends nothing, a save
reaches the account, a fresh browser on the same account gets it and Continue loads it, a device with different saves
is asked.


## Project history (moved from playground CLAUDE.md, 2026-11-11)

This was the table row for this folder in `playground/CLAUDE.md`, kept word for word when that file was cut down to a short index. Newer notes belong in this README, not in CLAUDE.md.

**Farhold**: a third-person RPG on a whole planet, and off it. Phases 1-10 + the round-3 queue are in `README.md`; **round 4 is the RPG expansion** and is documented in `prototypes/farhold/RPG.md`: level-banded **zones** from the World Forge region graph (`js/zones.js`, bands that tile 1-30 with no gaps, an overlay on the map and a banner when you cross a border), a bestiary of **46 enemies + 6 bosses + 10 companions + 14 champion/rare modifiers** (`data/enemies.json`, everything rescaled so nothing is knee-high), **packs, champions and rares** with visible auras and Name Forge names, **11 set-piece encounters** (`js/encounters.js`), **real dungeon interiors** (`js/dungeon.js` + the pure `js/dungeon-plan.js`), **chests, loot bags and the shared reward popup**, **crafting from recycled gear only** (`js/craft.js` + `data/crafting.json`: three materials, a Crafting tab that forges a base you pick and an Upgrade tab that tempers / promotes / inscribes / reweaves / recasts / brands), **every one of items.json's 63 affix stats and 24 legendary powers wired** (`js/effects.js` — nothing is inert, and a test fails if anything goes back), **39 skills over 6 slots unlocked by level**, **all 30 Emberveil classes** with **companions** for 13 of them (`js/pets.js`), **light you carry** (`js/light.js`), a **tabbed sheet** with rich item tooltips, **seamless take-off and landing** through the atmosphere (`js/atmos.js`) with reticles and an information card on whatever you point at in space, and **landable moons**. The round-4b play-test fixed NaN damage, night starts, off-centre aiming, terrain spikes, the galaxy drawing over the planets, walls built ninety degrees out, and two dozen others — all listed in `RPG.md`. **Round 5** closes the six items that round 4 flagged as not built: a **star chart on `M` whenever there is no ground under you** (`js/starchart.js` — system → nearby stars → arm → galaxy, every view centred on you) with **travel to nearby stars** over a real Star Forge disc (a star carries its own seed, so a star *is* a system) through a five-second **warp tunnel** (`js/warp.js`) that lands you in a system with its own skybox palette; **one marker book** (`js/markers.js`) holding quests, story objectives and dropped pins, each filed under the world it is on, drawn on the map with a Tracking list, on the minimap as a glyph or a rim arrow with the distance, and in space as glyphs over a world's bracket; a **continuous approach from orbit** (the throttle is governed by how close you are, the world you are closing on is rebuilt at two finer detail steps, warp locks out near anything, and below half a radius you fall into the atmosphere with no key press — then `view.setViewScale` stretches the clipmap to cover ten kilometres for the same 13,552 triangles); a **Habitable start** knob, on by default, that walks the seed until it finds a lived-in multi-biome world; **water that meets its bank** (`js/water-plan.js` — the river sheet is pushed out to where the bank comes back up, with a skirt for flat deltas, and lakes finally have water in them at one level); and `BESTIARY-IDEAS.md`, ~40 creatures written out Dwarf-Fortress-style and tagged by how much work each body is. **Rounds 6-9** are a 46-item play-test list, written up at the end of `RPG.md`. The headline is that **the seven reported affix bugs were one bug**: items.json stores some percentages as fractions and some as plain percentages, and Farhold's two readers picked opposite sides - so 0.02 crit chance printed "0%" AND did nothing, while 19.93 vs undead printed "+1993%". `js/affixes.js` states per stat which unit its consumer reads, restates the table once at load, then applies floors, caps and slot rules on top, with **item levels** and affix tiers over that. Also: **a weapon is a PATTERN** (`js/weapons.js` - a longsword is slash-slash-overhead at 3.0 m, a dagger jab-jab-slash at 1.9 m and twice the speed), which is the one idea that covers dual wielding, two-handers, elemental staves and the area stat; a **perk forest** (`js/perks.js`, 89 generated nodes) replacing attribute point-buy, passives and talents, where the shape of the tree is the cost; a **three-tier talent tree per skill** (`js/skilltalents.js`) that changes the plan cast rather than a stat; **twelve town buildings and a real street plan** (`js/town-plan.js`); **level 50** with planets banded low/medium/high; **meteors**; **loot beacons** whose colour is the rarity a chest is guaranteed to hold; shops with categories, buyback and a gambler; and a map that pans, zooms to the whole planet and draws World Forge's region detail instead of a bigger blur. Traps: `Effects.update()` ticked its timers and nothing rebuilt the derived sheet, so five timed affixes were silently dead; a DoT paying `perSecond * dt` sixty times a second reads as "1 damage" however correct the total; and **items.json is SHARED with Emberveil**, which has its own registry and a test that every affix in it resolves - anything only one game understands is injected at load, never written into the file.  **Round 10** is the play-test list plus two bigger pieces, all written up in `RPG.md` and `EXPANSION.md`: a level-1 character was being dropped into a **level 30-33 zone** because a world's difficulty band came partly from `seed % 3` (47% of seeds), so the band now comes from what the world IS and the low band is claimed first for whichever world a newcomer lands on — every system carries a body for every band (moons count) and the starting system always holds somewhere you can breathe; clicking the **perk tree** picked whatever was ~100px below the cursor (the canvas buffer was measured from its parent and one device-pixel ratio was used on both axes) and the forest is now a **lattice** with zoom and pan rather than a scatter; the **character sheet is a full screen** (`research/ui-round10-design.md` — header, tab rail with unspent-point badges, paper-doll equip figure, inventory filters + a standing compare panel, three-tier talent columns, nine-pane journal; nothing scrolls but a pane body) which also turned up three real bugs — the Perks screen was titled "Character", **every** skill was offered the bolt talent tree, and the XP bar was wrong above 30; **W and S fly forward again** (the longitude wrap was not bit-exact, so atmos.js's edge-brake fired ~45x a second mid-map: 80 m in 20s instead of 15.3 km) and the poles wrap; **planet size** gets Tiny and Super tiny, defaults to Small, and finally reaches the camps, dungeon doors, horizon and flight model that all read a hard-coded 640 m a cell; and **save/load** stopped dropping `world`, `quests` and `campaign` out of `snapshot()`'s own argument list, which is why a run saved in a town reloaded into open ocean and every load emptied the quest log. **The Territory** (`EXPANSION.md`) makes a zone a place with people in it: 12 factions whose standing moves for what you did (a deed for one is a third of a deed against their rivals, so nobody can be liked by everybody), a territory record a zone generated from the seed with only the deltas saved, patrols on real road nodes, caravans to trade with / escort / rob / find the wreck of, 14 kinds of person on the road, 12 things that happen to a zone, rumours that are a sentence and never a pin, and a job generator of 22 frames that will only offer one when every slot binds to something that exists right now — nothing is invented, so nothing can send you to an empty field. **The round-10 review** (`research/review-round10.md`, 45 findings, all implemented): the screens were fine and the **connective tissue** was missing - the game never said what to do, never explained what it had just built, and two content files (`data/landmarks.json`, `data/faction-rewards.json`) were parsed at boot and thrown away. Now: a tracked objective on the HUD, a class preview beside the 30-entry dropdown, the level-up message naming the perk point it actually gives (`pendingAttr` was never incremented anywhere - the perk forest replaced point-buy in round 7 and the message was never changed), the map naming only regions you have entered or heard about, **key rebinding** over 14 actions through a capture-phase listener (there was no binding table to build over, so it translates the event), the star chart's two measurement bugs (it measured its wrapper, and drew CSS pixels on a 2x buffer, which is why five worlds were 3px specks), a torch that is a flame not a spotlight (a Three.js point light with `distance` dumps its falloff over the last fifth - the cutoff is pushed out 2.2x and decay does the fading), the hooded mage's cowl trimmed inside his own shoulders (`avatar-3d/js/chibi2.js`, SHARED with Emberveil), and rumours signed by a real person out of `folk.roster()`. **Mounts, lights, boats and ships** (`js/gear.js`, `js/boat.js`): three of each, the dividing line being whether a thing is loot - a mount/lantern/quiver rolls a rarity and upgrades at the bench, a boat/ship is bought once and picked from a dropdown. Every shelf now carries all three mounts and all three lights (it used to guarantee the cheapest and roll for ONE of the rest), sorted into racks with headings, and a shop row carries its own spec + an upgrade/worse mark from `itemScore`. **Boats equip themselves** on entering deep water and the hull sets the speed (raft 3.4 / skiff 5.6 / cutter 8.2 against a 2.7 swim, a 5.4 walk and an 11.3 sprint) - `js/player.js` had never read the vehicle data at all. Two traps: the boat was put away by watching for the TRANSITION out of swimming, which `teleport()`, a load and a dungeon floor all skip, so the raft stayed equipped on dry land; and the shared `Loot.price()` (`prototypes/emberveil/js/loot.js`) prices everything off ONE global `basePrice` and ignores the price an item carries, so a 620g Wisp Lamp sat on the shelf at 30g - Farhold's `rpg.price()` honours `item.basePrice` and the shared file is left alone. **Rounds 11-12 and the building expansion** (`BUILD-MODE.md` §§0, 12-18, `RPG.md` "Rounds 11 and 12"): this round's theme was **finished modules that nothing called** - seven joins that had never been made, each indistinguishable from a missing feature and much harder to spot than a crash. Nothing called `build.confirm()` (clicking in build mode drew a sword); the ghost was aimed at the player's own FEET; nothing called `grid.add`/`stores.add` (a generator generated nothing, a crate held nothing, a 25 kW waypoint pad could never light); `stores` and `grid` were not in the save (a reloaded base was empty boxes beside a dead generator); ore was built with `createNodeField({data, seed, terrain})`, which takes NONE of those - `area` defaults to a 300 m circle at the ORIGIN, so every seam in the game was 29 km from where the player lands; nothing called `works.place`, so 16 machines and 61 recipes stood on the grass as geometry; `js/raid.js` was imported by nothing at all; `colony.setBase()` was never called, so appeal was 0, migration never fired and prosperity was permanently 1.00; and neither `js/vehicles.js` nor `avatar-3d/js/ground-vehicles.js` was imported. Now playable end to end: **`B` opens a real panel** (`js/build-ui.js` - four numbered first steps, tools with Level first, catalogue by group, live prices against what you are holding, and the live reason the ghost is red), the cursor is a ray marched from the camera, **E works a seam** (`js/mining.js` + `js/ore-view.js`), a **drill on a seam plus a route** delivers at `haulThroughput(metres)` so double the distance halves the delivery, a **bench you walk up to** takes a recipe, **turrets shoot** (all 19 defensive structures had no numbers at all; seven got a `defence` block and the gate is the BLOCK not the category so a palisade never snipes), a **raid you ring for** (`js/defence.js` - offer, take it on, ring the bell, and the world is quiet between them), a **Holding** with migrants, taxes and Necesse farming (your folk replant but never break new ground), a **Garage** (motorcycle/car/truck on `G`, Shift is the throttle), and **§9's sky**: no ship, no purchase, four subsystems at an assembler then a levelled pad - and `refuel()`, because `canLaunch` refused and `spendFlightFuel` spent while NOTHING ever put fuel in. `js/homes.js` is every base you ever raised, filed by BOTH systemSeed and planetId (every world uses the same metre grid, so matching on planetId alone folds you to the right coordinates on the wrong planet), with `routeTo` naming three legs - here / land / jump. Map pads now SELECT on click and a button travels; "Go here" moved to Settings -> Debug, on by default. Two bug classes worth keeping: **a settlement id is a number and the first one is 0**, so every `if (padPick)` dropped the pad nearest the middle of the map; and **three TDZ crashes** from `const`s read above their declaration, none of which `node --check` can see. **Closing the round** found five more of the same thing, making TWELVE finished modules with no way in and not one genuine algorithmic bug among them: js/shipyard.js had `stationProgress`/`stationGate`/`buildStationModule`/`nextStep` and NOTHING imported any of them, so §9.15's orbital yard and §9.16's "what to build next" were both unreachable; js/work.js did the whole ten-units work system with no screen at all; `colony.recruitOffer` and its refilling `townPool` had no way in (talking to any non-guard in a town now brings them home, with a BODY at the claim stone via `folk.spawnOne`); and `board` was declared TWICE on window.farhold so the later one silently won — a duplicate key in an object literal is not an error in JavaScript, it is a shrug. §1.4's **radial density falloff** closes the graphics round: a cell is thinned by how far out it is, and the rule that makes it safe is that a thinned cell is a SUBSET of the dense one — approaching a wood adds trees BETWEEN the ones you could already see. `tests/density.spec.js` caught a bug in my own fix on its first run: `break`ing out of the scatter loop consumed fewer rng calls, and the cell's rng is shared with the ruin roll, the megaflora and the grass, so the bushes jumped while the trees stood still. **Round 13** is the eleven-item play-test list (`RPG.md` "Round 13", `BUILD-MODE.md` "Round 13") and EIGHT of them were the same fault again — a rule written into the data and read by nobody, or a module finished and never called. `props.clearAround` did not exist and `onClear` called it behind `?.`, so the **Clear tool** silently did nothing for the whole life of the expansion (and under that, `build.js` passed the whole materials bag to `store.give(id, n)` as the id). `deep_vein` has carried `indoors: true` since it landed and `kindsForBiome` never read it, so a hardness-2 iron seam was scattered on open grassland with no tier-2 tool yet in the game — "I found iron ore but it says I need a steel tool, how do I get steel if I can't mine iron?"; the test written for that fix caught `meteor_site` doing the same thing within a minute, so a meteor now places its own seam in its own crater. The **Road tool** did exactly what it was written to do and none of it was visible (a peg, a band and a dashed leg to the cursor now, and picking the tool picks a road instead of quoting the price of whatever crate was selected). **Terrain tools** did not touch the trees on the ground they moved. `rpg.equip`'s auto-slot branch opened with `oneHanded(item)`, so the one case the two-hander keystone exists FOR was excluded by the guard — it asks `offhandRefusal` now, and a better weapon takes the main hand with the one it beat sliding across instead of going in the bag. **New**: `js/props.js` keeps a harvest ledger (`felled` by `propKey`, `cleared` circles, both saved) so **you swing at a tree and get timber** — the tool tier is the same ladder a seam uses, read off your weapon; a **Scan** build tool sweeps from the cursor and lists one row per material with a pin that goes to the marker book; `js/haulpath.js` is A* over an 8 m grid (water is a wall) so a **drill lays its own route** to whichever store DELIVERS most rather than the one that is nearest, and the track is drawn on the ground; and **B frees the cursor** (`aimSpot` unprojects the real pointer, a click is a click only if the mouse moved under six pixels). The keystone "Titan's Grip" is renamed **Doubled Grasp** — a saved perk is the NODE id, so renaming one costs nobody their point. And the one nobody reported, found by fixing item 7: **data/structures.json prices everything in short names** (`timber`, `iron`, `parts`, `block`) while everything that PRODUCES a material speaks `log`/`iron_ingot`/`machine_part`/`cut_stone` — the catalogue's own header deferred the join to "§1 and §2" and it was never made, so a palisade cost six units of a thing nothing in Farhold has ever produced and 22 pieces were unbuildable by any honest route. `MATERIAL_ALIASES` + `alignCatalogue()` in js/buildplan.js join them ONCE at boot, carrying the display names so the panel still says "6 timber"; `wire` and `concrete` were aliases for nothing at all (ten structures spent wire, no recipe made any) and are real materials now with real recipes. The rule, as a test: **every build cost must be something the game actually produces**, dug or made — a cost you cannot obtain is not a price, it is a wall. tests/industry.test.js's §3.20 "no recipe is a dead end" had the same blind spot from the other side and never counted the build catalogue as a consumer. **Round 14 is combat** (`RPG.md` "Round 14 — combat", plan in `research/combat-redesign.md`, unapplied main.js/hud.js patches in `research/round14-combat-handoff.md`): melee really was terrible — a greatsword did 165 damage a second against a bow's 336 at eleven times the range — and the arithmetic was the smaller half, because **a melee swing was one flat white ring on the grass resolved on the frame the button went down**, with no wind-up, no impact, no knockback and one animation for every attack in the game. `TWO_HANDED_SCALE.damage` was dead data AND its guard excluded every real two-hander, so the only thing it ever did was make bows 20% slower; a bow's rate of fire was the light-melee swing clock because `bow` was in neither weapon table; every arrow was a free 2.6 m area hit at full power (`strikeArea`'s `power` defaults to 1 and `onArrowLand` passed none); the off hand lent only its CLOCK, so the best off-hand weapon was always the fastest one whatever its damage; a **quarterstaff was a wand** (items.json files it magic + twoHanded, which is exactly `isStaff()`'s test, so five classes started the game holding a free area spell every 0.41 s); a steel sword drew no impact at all because of one `element !== 'physical'`; and **every hafted weapon had its head behind the fist** (+y is up the forearm, and the mace/hammer/warhammer/greataxe heads all sat at +0.40 or worse, so the head travelled up and back as the character chopped down). Now: **`js/combat-feel.js`** — hit-stop, screen shake, knockback with rank resistance, stagger with diminishing returns and visual recoil, none of which existed anywhere in the playground; a **three-part swing** (wind-up/damage/recovery) whose invariant is that wind + recovery comes OUT of the weapon's clock, so no damage number moves; three new strike shapes (`arc`/`slam`/`lunge`) and a `WEAPON_TRAITS` table — armour break, bleed, backstab, a polearm's **7.4 m pierce line** (tested against every enemy reach in the data), brace, flow, guard; a bow with a real draw and a staff that charges for mana; 18 new procedural weapons in **`avatar-3d/js/chibi2-weapons.js`** (new file, new `fh_` ids, one dispatch line — Emberveil's looks untouched) with the grip corrected and the shield moved from the fist to the forearm; and 14 combat clips added to `chibi2-motion.js` in their own opt-in list  **Round 16** is the seventeen-item play-test list (`RPG.md` "Round 16", `BUILD-MODE.md` "Round 16"), and more than half of the reports were not the bug they looked like. The **Gibbet with no model** was TWO landmark systems that had never been introduced — js/territory.js invents landmarks with state, a save slot and no geometry, js/sites.js builds the set pieces with NUMERIC ids, and `atLandmark` looked a mark up by id, so a set piece never matched, never paid, and a `solve:true` one dead-ended with E doing nothing (`claimLandmarks` + `adoptLandmark` join them; `taken` finally reaches the save). The **cage with nobody in it** was real — `js/encounters.js` owned no meshes — and underneath it events closed at 520 m while their bodies despawned at 300, so a rescue WON ITSELF and dropped a gilded bag on empty grass; `js/eventprops.js` dresses all 22 events (up from 11) and a rescue has a captive you can talk to. The **wall with no gate** scanned road SAMPLE POINTS (45–128 m apart) for one inside a 19 m annulus, found none, and put a gate at a random bearing — `ringCrossings` solves the segment/circle intersection exactly. A **road across a river** re-imposed its deck as a 12 m earth plug; bridges now file a real walkable deck primitive (`collide.addDeck`) and a road alongside water gets a quay. The **raft** was the rotation ORDER (`XYZ` puts yaw in the middle, so bow-lift became a diagonal roll) and the rider was playing the SWIM clip, which tips the root back 64°. The **horse stutter** was `setAnim` resetting its clock every frame — every beast in the game was frozen on the first 16 ms of its gait. The **target bar** asked a 2D yaw score from the player's feet while `aim()`'s 3D hitscan sat unread. **Ranged characters couldn't harvest** because the tool tier was A REGEX ON THE WEAPON'S NAME — a bow is yew — so `js/tools.js` + `data/tools.json` give a real **Tool slot** (built, rarities affect speed / yield / reach / scan), a **mouse-wheel ring** of what you own (weapon / tool / scanner / rod), **WoW-style gathering** (`E` or attack → a bar over the rock, `hud.workBar` projects it), and a **scanner** whose survey is permanent and drives the map's Find tab (sort + favourites). **Meteors** wait for a tool that could mine the crater. `data/instances.json` adds **20 instanced places** incl. a dragon's lair, reusing the dungeon whole (`createDungeon` takes a `shape`, a `nodeId` and what it `holds`). `js/questrewards.js` is **one payer for every turn-in path**, five reward kinds incl. pick-one-of-three-rares, turned in **from the journal**. The **perk tree is eight arms / 169 nodes** (defence, bonus loot, recovery, mobility) — which turned up `thorns: 6` where the code reads a fraction (a 600% reflect) and `goldFind` multiplied by nothing. `js/population.js` / `js/command.js` / `js/townhall.js` are **houses as a population cap, a Town Hall you can open in any settlement of size 3+, and a Command Rod** that gives orders. Extraction is **its own build menu** and manufacturing takes **hold-E work** into the same `js/work.js` ledger citizens use. **No ammunition anywhere**; a flight leg costs 1. And the **load time was not the wifi**: the dev server spoke HTTP/1.0 so all 190 modules got their own TCP connection, and keep-alive then exposed a 40 ms Nagle/delayed-ACK stall per response — `tools/serve.py` + `tools/preload-modules.py` take a cold load from 7.31 s to 0.07 s and 6.28 MB to 1.80 MB. Eight of the seventeen were **a finished module with no way in**, which is now this project's signature fault **Round 17** is a 27-item play-test list across six clusters (`RPG.md` "Round 17" x6, `BUILD-MODE.md` "Round 17"), and the theme this time was **a key, a check or a printer with two owners**. `settings.js` had the combat log on KeyK while main.js had the Holding hard-coded on KeyK and had never put it in the binding table, so one press ran both and rebinding could not separate them; a test now fails if any key main.js listens for is missing from `BINDINGS`. `el(tag, cls, text)` sets textContent and the held-mode ring was handing it a pip ELEMENT — that is the reported "[object HTMLElement]", and it also silently dropped every pip after the first. A mount's `speed` is a MULTIPLIER and one row stamped "m/s" on it while the other multiplied by the walk. The map's hover strip did `readout.className = 'readout' + tone`, REPLACING the class list and dropping a min-height — and the canvas is `flex:1` with the map fitted to it, so the strip growing made the whole planet redraw smaller ("the sides shrink in"). The map's hit list was built in paint order and took the FIRST circle containing the pointer, so whatever was painted underneath won every overlap; markers destructured `{scale, ox, oy}` from a `viewBox()` that returns `offsetX`/`offsetY`, so **no marker had been hoverable since round 14**. The staff printed its description twice from two printers and drew `CATEGORY_PATTERNS.magic` — a melee jab and a melee cut — as its "attack style"; **the charge was a channel with a reader and no writer**, so all six of round 15's charged forms had never once fired and `.charge-meter` had no CSS rule anywhere. The scanner never appeared in the wheel because it costs `crystal` and resources.json calls it `crystal_raw`. And **building had been free for the whole building expansion**: buildplan spends a whole bill, main.js handed it a store that spends one line at a time, the arithmetic went to NaN and nothing was ever deducted. New this round: a **custom class** with a spell tier list, 18 loadouts and a point-buy (`js/classbuild.js`, `CLASSES.md`), **followers** with 3/4/5 slots at levels 1/20/30, ten mercenary types and a broker who sells them (`js/followers.js`), a **four-age research tree** (`js/research.js`) as a sheet tab, **per-station screens** so `E` at a furnace opens the furnace (`js/station-ui.js`), a five-step **onboarding line** from an empty field to an iron ingot (`js/onboarding.js`), **choppable mega-trees**, a **mining animation**, **scanner tiers with a right-click chooser**, and seam art that is rock with ore growing out of it. The Log and the Holding became tabs of the character sheet, which is where Research and Followers live too; the rail numbers itself. `FUTURE_SYSTEM_BRAINSTORM.md` parks what comes next. **Round 18** cleared round 17's five red specs. Four were tests that had gone stale under features R17 added on purpose, and all four failed with a message naming the wrong component — "the furnace made nothing (Out of fuel)" was `js/stores.js`'s raw-material share rule (one raw material caps at 25% of a store, all raws at 50%, so seven raw ids at 120 each meant the iron and copper ate the budget and the COAL got zero), "Cannot read properties of undefined (reading 'x')" was R17's onboarding line becoming the first job every giver hands over (kind `onboard`, no `place`), and "the crate would not take the coal" was the Storage Box correctly capping at its new six slots. The fifth was real and is the round: **the water surface was a STAIRCASE while the drawn one is a RAMP** — `js/planet.js` `riverTopAt` answered `max(surface[i], surface[i+1])`, the higher END of a segment for the WHOLE segment, while `waterRibbon` fills the quad between two river points with a linear ramp. 12.21 m apart at the worst point on seed 7. Swim across a segment boundary and the surface dropped several metres at once, `player.js` found the body above it, `swimming` went false, and you were falling through the air over water still drawn underneath you — caught only because a swim-clip assertion read `jump`. `nearest()` had always returned the `t` to interpolate with. The ~0.10 m bend case the max had been hiding (a flat drawn slab at a vertex vs a ramp along the nearest segment) is now an explicit constant 0.25 m `EDGE` at the waterline with depth floored at 0, so it cannot come back as a step. Also the quarterstaff R17 recorded as NOT fixed: `attuneWeapon` cleared `castElement` and the very next branch asked `CASTERS.has(sub) && !item.castElement` with `sub` = `staff` — **the de-attune was the thing that re-armed the attune**, so the raw base came out "Arc Quarterstaff" with a cast affix and a glowing topper. **Round 20 — the spell ladder and the Unbinder** (`CLASSES.md` "Round 20"): the creator asks for ONE spell, the ladder is 1/3/6/12/18/24 (7 became 6), and a pick is gated by the character's own level — one rule in `pickRefusal`, so the title screen builds a level-1 character and five of the six slots refuse themselves with no code that knows about creation. An unfilled slot is a REAL slot (`installCustomClass` stopped inventing a spell for one, `createSkillBar` carries `empty`/`pending`, the key spends nothing and names the way out) and the sheet draws a green **Spell available** card that opens the chooser — which is the builder's own Spells tab with a level on it, not a second copy of the pick rules. The **Unbinder** (`js/retrain.js` + the `unbinder` town role) takes a spell, perk or talent back off you for gold, one or all, priced in `data/balance.json`'s `retrain` block; every free undo left the character sheet, **and so did the two back doors that survived removing the buttons** — overwriting a filled spell slot, and re-picking a spent talent tier. The role is rostered WITH the merchant and the elder rather than at the end of `ROLES`, because `rosterFor` stops the moment it is full and a role declared last would have existed only in size 4-5 towns. Three pre-existing bugs fell out: **the custom class could not start a game at all** (`applyOpeningKit` was handed `log: (t,k) => hud.log(t,k)` and `hud` is a `const` ~700 lines below — the default opening is the crate, the crate logs, so every custom character made through the title screen died on boot with "Cannot access 'hud' before initialization", unplayable since R17; the fourth TDZ crash here and `node --check` sees none of them — the existing specs all opened the builder and never pressed Start); **picked talents were never saved** (`player.skillTalents` on no save list, so a reload silently un-picked every one — the same fault the perk forest had in R18, in the same list); and a refused row on the Unbinder's counter said why only in a tooltip. **Round 21** is an eight-item play-test from one spot (seed 25392, Kydsel IV, x 5265 z 1683) and it split two ways: geometry nobody measured, and prose that described a feeling instead of a quantity. **The town square** piled up because three systems compute a town's position as `node.x * M_PER_CELL` and get the same float — the origin, the world road (Catmull-Rom INTERPOLATES its control points, so a road routed to a settlement cell passes exactly through the origin and turns there) and `territory.js`, which listed `settlement` and `port` among the nodes a landmark may stand on; `claimLandmarks` was also the one site path that never asked `townGap`. **The streets**: 164 planned, 159 of them alleys averaging 11.2 m, 308 of 318 endpoints dead ends, and 17% of street samples paved on top of the world road at `lift 0.12` over its `lift 0.06`. proctown's `connectStreets` could not catch it because it decides connectivity in PLAN space while the cut happens later in `streetLanes` — so `keepConnected` asks again on the runs that are actually drawn (164 -> 66, all joined). `padOk` had never tested the road, so the waypoint pad sat at `roadAt 0.994`, dead centre of the carriageway; it now tests the pad's whole FOOTPRINT (-> 0.009), and `place()` (well, board, stalls, wall, towers) tests it too, with the gatehouse opting back in. **The waystones in the road** were two bugs: the approach bearing was `rng() * TAU` so it never asked which way the road ran, and the offset was a bare JSON constant (3.2/3.4/3.6) against a 3.5 m carriageway edge — three of the four layouts were inside the road by construction. **The faceted hillsides were `Math.round`**: `elevationToMetres` quantised every ground height to whole metres, so a 640 m bilinear ramp became a staircase — walking half a metre moved the unrounded height 0.0019 m and the rounded one 1.0000 m, and adjacent vertex normals differed by up to 27° against 12° without it. `elevationToMetresExact` keeps the rounding in the readout where it belongs. **Cliffs** did not exist because symmetric `fbm` has none in it and everything upstream (`thermalErode`, `hydraulicErode`, `despike`) smooths them away: a `ridged` crease through a narrow `smoothstep` band, gated on BOTH ruggedness and a slow `cliffMask`, because gating on ruggedness alone put 39% of the world past 45°. Median slope is unchanged at 0.28 and 2.5% of land is now past 63°, where it was 0.000%. **Events popped in at 90 m** (a 6.6 m stone house at 63-99 m); 240 now, with a separate `keepRadius` leash for set-piece bodies because the 300 m despawn would otherwise have culled an event's guards while you walked to it. **The Forge Fire** was three faults: `buildLayout` renders only the nearest FIVE sites in full so it lost that contest at a town centre and came out as a lone hut with none of its declared fires; `gives.bench` was a log line and nothing else, so the place its own data calls "a crafting bench, outside a town" never opened one; and the set-piece branch of `interactTarget` had no `taken` filter at all, so a spent one-shot offered itself forever. A spent landmark is rubble now (a REPLACEMENT, not a removal — `collide.add` has no delete). **And the language**: `WORDING.md` is the standard, `tests/wording.test.js` the enforcement. Accuracy is REMOVED (Farhold's enemies are built `dodge: 0`, so it cancelled a dodge chance that was always zero) — stripped as the shared `items.json` loads, since Emberveil still rolls it; life steal is gated to `!skill && element === 'physical'`, which excludes spells, wands and staves in one test; skill descriptions are GENERATED from the numbers already on the skill. The sweep found nine descriptions that were not vague but FALSE — "Nothing ambushes you in the dark" (it is a 0.25 multiplier), Execute "wasted on anything healthy" (no such bonus exists), Smoke's "vanish" (there is none), Strength's "how much you can carry" (there is no encumbrance), and a Tool help line still describing the system round 16 replaced, kept alive by two tests that pinned its wording. **Round 21b** fixed the two things round 21 flagged instead of fixing. **The damage-over-time WAS the skill**: generating the descriptions meant adding a skill's numbers up for the first time, and the three best skills in the game turned out to be the three with a DoT — five DoT skills averaging 68% of weapon damage a second against 20% for everything else, with Firebolt's burn (216%) worth more than Firebolt's bolt (160%) and Poison Dart's poison worth three times its own dart. `STATUS_POWER_SHARE` 0.9 -> 0.35 puts a DoT at about half its impact and the top of the table at 61%/s against the best direct skill's 48%/s. The constant also had TWO COPIES — js/skills.js exported one for the generator and js/main.js carried its own `0.9` literal for the code that applies the status, and nothing compared them. **And the seeking bolt did not seek**: `homing` sat on `PENDING_MODS` as "a projectile cannot steer yet", but it is not only a talent — js/weapons.js has a `seeking` WAND BEHAVIOUR, sold to the player as "turns after what you aimed at", whose homing value main.js carries all the way into `fireBolt`, which never read the field. The talent was unreachable as well (in `TALENT_LIBRARY` and in no `OFFERS` list). `fireBolt` now widens its acquisition and sweeps the flight path for a body to turn onto, and `Seeking` takes `heavy`'s place on the bolt board because a tier offers two or three picks and no more. Zero inert talents. **Round 22** is a fifteen-item play-test and the theme is **a multiplier written twice** and **a promise the world could not keep**. Consecrate hitting for 500 against a basic attack's 7 was not tuning: `js/skills.js` folded `1 + spellPower` into `plan.mult` while `js/rpg.js`'s `strike` — which a wand bolt and an elemental swing also pass through — applied it again, so every non-physical skill scaled as `(1 + spellPower)²`, and R18's move of `outgoingFrom * incomingFrom` into `strike` left `castSkill`'s own copy behind. A PHYSICAL skill got neither squared term. The **experience economy** had the same shape: a kill's award never mentioned the player's level at all (no grey-con rule in either direction), and five different per-level scalings had grown up on five different event awards. Now `rpg.killXpFor` (a fifth of what a kill paid, -20% a level below you so five below pays **nothing**, +15% a level above to a +60% cap) and one `eventXp` priced by the **zone** rather than by you (+50% on quests and cleared places, 3x on the little "experience for the walk" awards). **Companions** grew at 1.17 a level against enemy health at 1.13 AND against a player whose damage is not an exponent at all — a hired blade does 16-26 at level 1 and 7,301-11,864 at 40 — so both knobs are 1.13 and `scaleFollower` will not let one hit for more than 75% of the top of your own swing. The **level ladder is a world setting** (`setLevelCap`, 30/50/100): the curve is written in fractions of the cap with the early section stretched, so a 1-100 world is the same total climb cut into twice as many steps and cap 50 is bit-for-bit unchanged. The promises: **E on a tree** said "Nothing here to do" because Farhold has two tree objects and only the invisible resource node was on E (`beginGather` has handled props since R13 and only the attack button called it); **"E to talk to Mercenary Captain"** offered a conversation with an empty field from 22 m, because js/wanderers.js is pure JavaScript by design and a wanderer has never had a body (`folk.spawnOne` gives them one now, and the prompt drops to 3.6 m); a **quest arrow pointed at the corner of the planet** because `markers.add()` defaulted a missing cell to (0, 0), while `js/jobgen.js` bound to things carrying metres and no cell at all and got no pin whatever; and **enemies could not see a companion** — there was no `e.target` in js/actors.js, no threat table and no taunt, and a pet landing a hit set `state = 'chase'`, which is chase the PLAYER. Also: a **quiver** could not be worn with a bow (every bow is `twoHanded`, so `offhandRefusal` covered the one thing a bow's off hand is for); picking a **mount** took it off (`onEquip(item, slot)` reads its second argument as "unequip this slot"), and the Mount row and the Ride row are one row now; two **lantern affixes** deleted because `cond_lightWard` gated itself on a stat the lamp itself grants; **respawn** restores health AND mana on both paths; the first **talent tier** moves off level 1 to 3/8/18 with a fourth at 28; the **Town Hall** built its Close button inside the `draw()` that could throw; the **loot card**'s property list is gone and its hover is `hud.itemCard` (the `tipRender` hook had existed since R16 and never fired — `shared/rewards.js` wrote `dataset.itemId` while every renderer reads `dataset.tipItem`); the **research screen** is a node graph with wires and a side panel (`.research` was a flex column with no height, so `.res-body` could never scroll inside the sheet tab and "Reagents" ran off the bottom); and the **roads** were measured for the first time — a junction fade fighting the bridge-floor restore pass put a ribbon 3.49 m above the trunk it joins, `features.js` carried a byte-for-byte twin of `roadplan.js`'s `laneRibbon`, town streets were 7.9% of samples under the terrain at up to 12.67 m, 5 of 236 road ends led nowhere, and **31% of one town's plots crossed its own wall** because proctown retries with `ringScale` up to 1.65 and publishes `plan.wallRadius` while Farhold recomputed its own unscaled ring. **Round 23** (`RPG.md` "Round 23", `research/round23-*.md`): **184 uniques** (`js/uniques.js`, `data/uniques.json` from `tools/build-uniques.mjs`, injected at load — items.json untouched) at 4 per plain weapon type, 2 per element per caster, 2 per every other lootable type, with 48 new powers (stacking/ramping DoTs, self effects, chain/ricochet/split/cleave/burning-ground attacks) — and the find that **every unique's power ran twice**; the Followers screen lost R17's leftover Spells tab; the **title, character and world screens** restructured with a live **3D figure** (`js/figure3d.js`, disposed before the game's renderer); **bridges** are one height list for mesh and colliders (`js/bridge-plan.js`), every walker asks `js/ground.js`, rails are height-banded wall segments; **town gates** meet their walls (walls are `addSegment` pieces now, filed a step wider so a fast step cannot skip one), take the wall colour, stand open, with two guards; and **graphics** from highdef-3d behind Settings → Graphics effects (`js/graphics.js`, `postfx.js`, `sky-palette.js`, `wind.js`, `rain.js`, `grass-gpu.js`): bloom, light shafts, a nine-band sunset table per planet palette, valley fog, one shared wind, GPU rain and grass. **Round 25** (`RPG.md` "Round 25") is the 9-24 play-test list: caster **foci** as off-hand armour (`js/foci.js`: Grimoire, Seer's Orb, Reliquary, Effigy + 8 uniques + the Archivist's Regalia set, new Chibi 2 `relic`/`idol` models), the melee and arcane perk arms **branch into four paths** each with a keystone per hand shape and per element (`BRANCHES`, `perk:*` powers in js/effects.js, old keystone ids kept), **seven new skills** (Flamethrower, Ember Stride, Storm Orbs, Blizzard, Toxic Cloud, Judgement, Void Rift — `repeats` on melee/ground, `trail`, `orbs` as `always` skill auras), skill damage scaled by unlock level and cooldown (`effectiveMult`), Whirlwind x5, a grass distance setting, night torches and spell lights, log filters, event chests sealed until the guards fall, −30% drops, and the wheel removed (E harvests everything). **Round 26** (`RPG.md` "Round 26"): Human/Elf/Dwarf/Halfling **body presets** in the appearance editor (`js/bodypresets.js`); the other five Chibi 2 races are **enemy warbands** (`js/warbands.js`, `data/warbands.json`: melee/rogue/ranged/caster/leader each) that hold level-banded zones and spawn only there; raidable warband bases are wishlist (`FUTURE_SYSTEM_BRAINSTORM.md` §7b). **Round 27** (`RPG.md` "## Round 27"; pipeline `research/round27-{brainstorm,roast,plan}.md` — a brainstorm agent, a roast agent that killed/merged ideas, then 10 milestones built as EXTENSIONS): **M1** strongholds pay ONCE (`sites.take`, saved `strongholds`; freeing prisoners re-paid on every visit) and a taken castle opens a real stair; `bossFor` never empty 1-50; **M2** one town size (`townExtent`, `wallTier`) everywhere — enemies had spawned inside grown city walls — and the planner's own gates; **M3** six culture wall kinds, village fences, hamlet stones, towers by spacing, gate banners, an arrival card; **M4** gates that shut (siege camp nearby, or hunted) with always a way in (knock/fee; respawn and quest towns never shut), guards greet by standing, `nightSpawn` finally read; **M5** switchbacks (`js/road-fold.js`, cached), level crossroads and junction landings, `ROAD_CLASS` widths; **M6** bridges by kind (arch/trestle/plank from one deck list), solid piers, wadeable fords, lake spans; **M7** cliffs over 63 deg stop player, enemies and companions (3 s escape climb), scree via `solids.add`, road pace x1.15 walk / x1.25 ride applied once, snow by relief; **M8** road looks by class, signposts naming the town down each branch (`js/roadside.js`), milestones, approach lamps, player roads are roads; beasts merged to one skinned mesh per material (`js/mesh-merge.js`, 1,377 -> 86 meshes; landing 104 -> 72 draw calls); **M9** one hostile holder per zone, saved `warGrip` you can push back, a warband map layer, patrols with bodies; **M10** a war camp per held zone, five warlords with phases (they fill the boss range above 30), leaders that buff/wake/rout their escort, standard-bearers, one unique per warband. Parked list at the end of RPG.md's Round 27. **Round 28** (`RPG.md` "Round 28 — skills" / "— roads", `BUILD-MODE.md` "Round 28 — building" / "— automation", `CLASSES.md` "Round 28"): **180 skills, each owned by ONE class** (the 47 old ids kept, each on the class it fits best), **per-skill talent trees** written as data on the skill row (4 tiers x 2 bespoke nodes + optional shared node), `js/skillmech.js` (the mechanics vocabulary — every key names its reader and writes its own card sentence; the audit strips skillmech.js's own description table before looking for a reader, because `dotRate` passed the old audit with no reader) + `js/skillrun.js` + `js/skillcard.js`; **one form system** for the druid's shapes (Briarback/Fenrunner/Sporecap, real creature bodies, each turning the druid's other skills into new ones), fighter stances, dragon knight tempers and bard songs; class `signature` lines in classes.json; content written by five parallel agents through `tools/merge-r28-batch.mjs` (one lock, staging files in `data/r28-batches/`) because every data write is a whole-file rewrite. Bugs: no-`mult` ring/ground skills struck for 100% weapon damage; a dash hit a body once per 2 m step; classes.json and skills.json disagreed on 11 classes. **Roads** were a flat sheet raised to the highest ground across their width and held flat between points 45-128 m apart (up to 13 m in the air); now draped every 3 m with an earth edge and a far-distance depth pull, and the map draws the network that is actually built. **Building**: undo, slope levelling, line placement, gates that stop enemies, enemies that break walls, hit points + salvage + a Repair tool, and `build.update` finally called (the repair station and portal ring had never ticked). **Automation**: a Production tab and HUD pill, keep-in-stock orders, cold-machine reasons, trade carts you can send and repeat, a mule that eats grain, and carts that arrived while you were away finally pay.
