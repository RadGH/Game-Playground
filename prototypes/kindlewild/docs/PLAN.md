# Kindlewild — plan

A pixel god-game sandbox in a medieval fantasy world. You are the sky above a small realm: paint the land, drop
creatures into it, and cast spells that the world answers with real physics — fire that spreads with the wind, lava
that floods downhill and cools to stone, water that pools in craters, blasts that throw burning debris. Little people
farm, build cottages, have children and get on with their lives until you do something dramatic.

Owner brief: `OWNER-BRIEF.md`. Reference: Lodestar M1's cell world (fire, blasts, lighting) — ideas reused, code is new.

## 0. Rules this game never breaks

1. **Fun first.** Every tool should make something visibly happen within a second: flashes, sparks, sound, shake.
2. **Phone first.** Portrait phone is the main screen. Every control is a big tile, nothing needs a precise tap,
   nothing hides behind a scrolling panel. One finger acts, two fingers move the camera.
3. **Everything is the world's own rules.** A spell is made of materials, heat, force and creatures. A meteor is a
   blast + a crater + burning debris; it is not a "damage number".
4. **Plain words, original names.** No third-party names, no banned words (`docs/banned-names.md`).
5. **No build step.** Plain ES modules, standalone CSS, data in JSON.

## 1. Modes

| Mode | What it is |
|---|---|
| **Sandbox** | Pick a land (or a blank field), everything you have unlocked, mana is endless by default (switch it off to play with the mana rules). Time of day, wind, speed controls. Discoveries still count. |
| **Challenges** | Act I "The First Kindling", 6 levels. Each has a loadout (the tools it gives you), a mana pool that regenerates, one main goal and three stars. |
| **Realm** | A saved world that keeps going between visits. Mana regenerates, and your people's **faith** speeds it up and pays Essence. Omens (raids, dry seasons, a dragon) arrive on a timer. The incremental mode. |

## 2. The world (`js/sim/`)

Top-down. Size per map (challenge maps ~160×240 so they fit a phone, sandbox 256×256, realm 320×320).

Per-cell typed arrays (one index `i = y*W + x`):

- `mat` (Uint8) — what is in the cell: empty, grass, water, lava, tree, stone wall, fire… (`data/materials.json`).
- `ground` (Uint8) — the floor under it (grass, dirt, sand, rock, snow, scorched, mud, ash). Liquids and walls sit on
  it; when they leave, the floor shows again. Scorched floor regrows grass slowly.
- `height` (Uint8) — terrain height. Liquids flow downhill; meteors dig craters, Raise Earth piles it up. Drawn as
  relief light.
- `temp` (Uint8) — heat. 20 = ambient. Things ignite, melt, freeze, boil and cool by thresholds in the material table.
- `life` (Uint8) — per-material counter: fuel left while burning, liquid amount, growth stage, wall health.
- `flag` (Uint8) — burning, wet, owned-by-village, lit.
- Half-resolution **gas field** (smoke, steam, poison, spores) that drifts with the wind and fades.

Chunks of 16×16 sleep when nothing in them changes; rules only run on awake chunks.

### Rules (each its own module, every number in the data)

- **Heat & fire** (`heat.js`): burning cells spend fuel and heat neighbours (more downwind). A cell catches when its
  temperature passes its ignition point; wet cells take longer. Burnt cells become their `burnsTo` (ash, charcoal,
  scorched floor) glowing hot. Hot cells cool. Rain and water put fire out.
- **Liquids** (`liquid.js`): every liquid cell holds an amount; it flows to lower `height + amount` neighbours, so
  floods pour downhill, pool in hollows and pile up behind walls. Lava is slow and cools into **magma crust** then
  **basalt**; water + lava → **obsidian** + steam; water soaks into dry ground (mud) and evaporates under heat.
- **Reactions** (`reactions.js`, `data/reactions.json`): a table of `a + b → c (+ d)` with a chance, heat or blast.
  Acid eats stone, frostfire freezes water, mana crystal + lightning = arcane blast, spores + fire = spore flash…
  Every reaction is a **discovery** the first time you cause it (pays Essence, a toast names it).
- **Blasts** (`blast.js`): a radius and a power. Cells inside break by hardness, throw **debris particles** that fly
  in an arc and land (burning debris starts fires where it lands), heat, push creatures, dig the height map.
- **Particles** (`particles.js`): free-flying sparks, embers, debris, rain drops, magic motes. Some turn back into
  cells when they land.
- **Growth** (`growth.js`): grass spreads onto dirt, trees seed, crops ripen, mushrooms spread at night, scorched
  ground recovers.
- **Weather** (`weather.js`): wind direction/strength, rain clouds (moving areas that wet and drown fire), lightning,
  day/night clock.

## 3. Creatures (`js/sim/creatures.js`, `data/creatures.json`)

Free-moving units with a pixel sprite from 1×1 (a swarm mite) to 15×11 (a dragon), several frames, a palette and
glowing pixels (eyes, flames). Each has health, hunger, age, sex, a species, a diet, a size and flags (flies, swims,
burns, fireproof, glows).

**Life sim:** hunger goes up; herbivores graze grass/crops, predators hunt, people eat from their village stores.
Adults of the same species with full bellies and room nearby **breed** (litter size, cooldown, a cap by species and
by housing for people). They age and die. They **flee fire**, panic when burning (and run around spreading it),
drown in deep water, cook in lava, freeze in ice.

**People and villages** (`village.js`): a village is a centre, a store (food, wood, stone) and a list of buildings.
People pick simple jobs (farm, chop, quarry, build, fetch water to fires). With wood and stone they build cottages
(beds = population cap), farms, a well, a shrine (faith) and a watchtower (a guard shoots arrows). Buildings are real
cells (planks burn, stone holds). Nothing is ordered by you — it just happens.

**Monsters:** goblin swarms raid villages, fire imps light everything, a troll smashes walls (turns to stone at
dawn), slimes split, a dragon flies in circles breathing fire cones.

## 4. Spells (`js/sim/spells.js`, `data/spells.json`)

Tap to cast (or drag for lines). Mana cost, cooldown, an upgrade level. Starter set: Fireball, Rain, Raise Earth,
Lightning. Unlockable: Meteor, Meteor Shower, Frost Nova, Blizzard, Quake, Tornado, Gale, Volcano, Spring, Growth,
Healing Light, Blessing (breeding boost), Smite, Void Orb, Acid Rain, Chain Storm, Firefly Swarm, Summon Golem.

## 5. Mana and progression (`js/game/progress.js`)

- **Mana**: a pool with a cap and regen. Challenges set their own; Realm mana grows with faith (people + shrines).
- **Essence ✦**: the one currency. Earned from challenge stars (first time), discoveries (first time each reaction /
  combo), Realm faith over time and Realm milestones.
- **The Grimoire**: an unlock tree in tiers. Each page (a spell, a creature, a material) costs Essence and needs the
  page before it, so new things arrive a few at a time. Pages can also be upgraded (spell power, cheaper mana).
- **Boons** (Realm upgrades): mana cap, mana regen, faith rate, village growth.
- Clearing a challenge level unlocks the thing it featured.

## 6. Level generation (`js/sim/mapgen.js`, `data/biomes.json`)

A layered pipeline from a seed + a recipe:

1. **Height**: fbm noise + ridge noise, shaped by the recipe (island, valley, basin, ridge, crater).
2. **Moisture**: noise, wetter near low ground.
3. **Biome** per cell from height × moisture × the recipe's climate (meadow, forest, marsh, desert, tundra,
   ashland, crystal glade).
4. **Water**: rivers traced downhill from wet high points, lakes filled into basins.
5. **Features**: forests by clustered noise, rock outcrops on ridges, lava vents on volcanic peaks, crystal clusters,
   ruins.
6. **Life**: villages on flat land near water, herds by biome, monster dens.
7. **Set pieces** (challenges): scripted spawns, zones, timers, layered on top.

## 7. Challenges — Act I "The First Kindling"

| # | Name | Goal | Teaches |
|---|---|---|---|
| 1 | Falling Star | Drop a meteor into the goblin swarm before it reaches the village | Meteor, blasts |
| 2 | The Molten Tide | Keep the lava from reaching the village for 90 s | Raise Earth, walls, water + lava |
| 3 | Dry Season | Survive a wildfire: keep 6 cottages standing | Rain, firebreaks, wind |
| 4 | Shepherd's Watch | Grow the flock to 30 sheep while wolves hunt | Blessing, Healing, breeding |
| 5 | Wings over Thornby | Drive off (or bring down) the dragon before it burns the village | Lightning, Frost, flying units |
| 6 | The Long Night | Survive until dawn: raids, a waking volcano and a meteor shower | everything |

Stars: ① win, ② a level-specific "nicely done" (one meteor, no cottage lost…), ③ mana or time target.

## 8. Screens and controls (`js/ui/`)

- **Title**: Play (Challenges), Sandbox, Realm, Grimoire, What's new, settings, account pill.
- **Game screen (phone portrait)**: top strip (☰, mana bar, goal pill, speed, !); the world; the **dock** at the
  bottom: four big tabs — Spells, Elements, Creatures, Tools — over a paged grid of big tiles (swipe or arrows, never
  a scrolling panel). Long-press a tile for its card. A brush size control for Elements.
- **Input**: one finger = use the tool (tap or drag); two fingers = pan + pinch zoom; mouse wheel zoom + right-drag
  pan; WASD/arrows pan, number keys pick tiles, Space pauses; a controller moves a cursor (stick), A uses, LB/RB
  change tabs, d-pad picks tiles, Start = menu.
- ☰ menu on every screen, "!" report button, What's new, ratings (👍/👎 + reasons) after each challenge.

## 9. Rendering (`js/render/`)

WebGL2, no library. Each frame: the CPU writes the cell colours (+ creatures + particles) into a world-size texture
and the light emitters into an emission texture; the GPU blurs the emission into a coloured light field (two radii),
lights the world (day/night ambient, relief from the height map, coloured light), adds bloom, animates water and lava,
and draws it with nearest-neighbour pixels. Canvas2D fallback with no lights.

## 10. Tests

Node (`node --test tests/`): material table, heat, liquid conservation, reactions, blasts, mapgen determinism,
creature breeding/hunger, objectives, progression. Playwright: title → each level at phone + desktop size, cast a
spell, zero console errors, screenshots.
