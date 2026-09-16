# Farhold — the ten-phase plan

The target: a third-person action RPG where you walk a whole planet, fight and loot your way across
it, then fly off it without a loading screen and do the same on the next one.

Reference points, for Claude's benefit only — **none of these names may appear in player-facing text
or data** (CLAUDE.md, no third-party IP): the block-world exploration RPG loop is *Cube World*'s, the
seamless planet-to-orbit and "see the neighbours in the sky" is *No Man's Sky*'s, and the loot,
affixes, levels and classes are the user's own *Emberveil*.

Each phase is meant to end with something playable. A phase that only adds plumbing is a phase that
will get skipped.

---

## Phase 1 — Ground, sky, walk, fight, loot ✅ done 2026-09-15

**You can:** land on a planet of a seeded star system, walk 163 km × 82 km of real elevation with a
7.8 km horizon, watch the star cross a 15-minute sky with the system's other planets in it, kill
things, take levels and wear what drops.

- `js/planet.js` — the pure terrain sampler over a `universe/` planet's `worldgen/` map.
- `js/terrain.js` — five concentric clipmap rings, 92k triangles, five draw calls.
- `js/sky.js` — two-pass sky scene; siblings placed by real orbital angle, drawn exaggerated.
- Chibi 2 player + 16 enemies over two body types; Emberveil's item generator for drops.

**Deliberately not here:** sound, dialogue, props, skills, saves.

---

## Phase 2 — A world worth walking ✅ done 2026-09-15

**You can:** walk through forests and past ruins, follow a road to a village, stand on a bridge over
a river in its own valley, and watch a thunderstorm roll in over it.

- **Scatter** (`js/props.js`) — 16 prop kinds (broadleaf, conifer, palm, dead tree, stump, rock,
  boulder, bush, fern, reed, cactus, crystal, mushroom, bones, plus ruins, columns and standing
  stones) over per-biome kits, with grass in the cells you are standing among. Nothing is stored:
  every 64 m cell is generated from a hash of the seed and its own coordinates.
- **Instanced** — one draw call per kind, which is what phase 1's five-draw-call terrain was saving
  room for. ~3,200 props and 2,600 grass tufts cost about 8 draw calls.
- **Weather** — `worldgen/js/weather.js` (the model, shared with World Forge) plus `js/weather.js`
  (cloud decks, rain, snow, dust, lightning, fog). 14 states chosen by the climate you stand in.
- **Per-planet colours** — `atmospherePalette()` varies sky, sea and cloud by the planet's own seed,
  as far as that world's `extremity` allows.
- **A neighbour's weather is visible from here** — sibling planets and moons carry their own cloud
  decks in the sky.
- **Rivers and roads carved into the terrain** (`js/planet.js`) and drawn (`js/features.js`), with
  **bridges** where World Forge says a road crosses water.
- **Settlements** — the map's own villages, towns, cities and capitals, built as instanced huts,
  houses, halls, walls and towers. No people in them yet.
- **A debug menu** on the backtick key: weather, time of day, world density, teleports, character
  tools and a live readout.
- **Three bugs fixed**: runs start in daylight, the character faces the way it walks (and D is
  right), and the camera pulls in instead of rising so you can look straight up into space.

**Still open from this phase's wish list**, moved on rather than dropped: swimming, seasons, caves
and overhangs, props that sway in the wind, and grass with a real alpha texture.

---

## Phase 3 — The map, the fixes, and a fight worth having

**You can:** open a real map of the world you are on, and then use abilities and fight things that
are actually dangerous.

### The map screen (asked for 2026-09-15, first job of this phase)
- **`M` opens a full-screen map** and releases the mouse so you can interact with it.
- **Your location and heading** drawn on it, and the ground you have actually seen.
- **Map pins** you can drop, name and remove.
- **Filters like World Forge's**, because they are the same layers: biomes, elevation, temperature,
  moisture, regions, and the new weather layer. `worldgen/js/render.js` already draws all of them and
  `layers-panel.js` is the shared control, so this is mostly wiring.
- **Rivers, roads and city markers** — `worldgen/js/render.js` already paints these; the node icons
  live in `assets/data/icons/`.
- **Routes later**: the groundwork is `worldgen/js/roads.js` `aStar`, which already finds a path over
  the same cost field the road network was built from.

### Fixes and systems asked for after playing phase 2 (2026-09-15)

Bugs seen in play:
- **Roads float and clip through the ground.** The ribbon is draped on sampled heights but the
  terrain under it is not flat. Fix properly: flatten the ground *around* a road (widen the carve and
  grade it across the road's width), then lay the ribbon in the graded channel.
- **Roads run straight up mountains.** `worldgen/js/roads.js` `aStar` already costs by biome and
  slope; the cost field needs a real gradient penalty so a road switchbacks around a peak, and
  ideally a tunnel node where it cannot. This is a World Forge change, not a Farhold one.
- **Walls do not always connect end to end.** `js/features.js` spaces wall segments by arc length
  on a circle; it should walk the ring and place each segment to meet the last, and follow the
  ground height between them.
- **Tree "leaves" are six cylinders lying sideways** — the palm frond build rotates cones about the
  wrong axis, so it reads as an arrow. Rebuild the palm (and check fern and reed, which use the
  same trick).
- **Seed 9's map is white.** A desert world is washing out the minimap. The minimap draws raw biome
  colour with no shading; it needs the same hillshade the World Forge renderer uses, and a clamp.
- **The text under the minimap is grey on a grey shadow** and unreadable on bright ground.
- **Enemy dots on the minimap** exist but are too subtle to notice — make them obvious.

Systems:
- **Collision.** The player can walk through walls, houses and trees. Props and buildings are
  instanced, so the cheapest answer is a per-cell list of cylinders (position + radius + height)
  built alongside the instances, tested against the player each frame.
- **Swimming.** Basic and simple: float at the surface, no diving, no seabed detail. Needs new
  Chibi 2 clips for swimming forward, sideways and backwards.
- **Saves.** Auto-save during play, load, new game, and more than one slot, in browser storage, with
  a character name entered at the start. Keep it simple: the seed plus what the player has done —
  never a dump of the world, because the world is a pure function of the seed.
- **Debug readout**: show the seed and the player's coordinates on screen, and add a debug-menu
  button that copies a block of diagnostic text to the clipboard to paste into a chat.

Sky:
- **Planets appear to move with the sun.** They do orbit — each uses its own `periodDays` — but the
  clock makes it invisible: one 15-minute in-game day advances the orbital clock by less than a day,
  so a sibling with a 365-day year needs about 91 hours of real time to go round. Give orbital
  motion its own (faster) clock, or a time-scale knob, so the neighbours visibly move against the
  stars.
- **Eclipses.** Once the orbital clock is visible, a moon crossing the star is computable from the
  same angles. Solar and lunar eclipses, with the world genuinely darkening — the sun's light and
  the sky colour already run through one place, so this is a multiplier plus a corona.

### Queued from the round 3 play-test (2026-09-15)

Camera and view:
- **Over the LEFT shoulder by default**, not the right.
- **An options menu**, with a Controls section that switches the shoulder side.
- **`V` toggles first person**, which needs first-person support on the Chibi 2 body (hide the head
  and the near arm, move the camera to the eye bone).

Sky:
- **Planets in the sky should occlude one another** — they currently intersect, because each is
  drawn on the same shell at a size that ignores its neighbours.
- **Lens flare** during an eclipse, and **god rays / sun shafts** generally.
- **An effect as the sun sets behind a mountain or the horizon.**
- **Some bodies cross the sky far too fast.** `sky.orbitScale` (150) and `moonOrbitScale` (6) are one
  knob for every body, so a close-in planet or a short-period moon whips round. Needs a per-body
  clamp on apparent angular speed rather than one global multiplier.

### The fight

- **Skills and cooldowns** from Emberveil's `data/skills.js` — a bar of 4–6, mana, cast times.
- **Spell effects**: `avatar-3d/js/spellfx.js` + `spellfx-batched.js`, already built for 11 elements,
  23 status auras, cast/heal/revive/aoe. Wire them to the skill bar and to enemy casts.
- **Statuses** (burn, poison, chill, stun…) from Emberveil's `status-effects.json`.
- **The effect registry**: turn on the 359 ids in `prototypes/emberveil/js/effects.js` so the
  `cond_*` affixes phase 1 carries but ignores start doing what they say.
- **Enemy variety**: champions and named foes (Emberveil's modifiers), packs with a leader,
  ranged and casting enemies, fleeing, calling for help.
- **Dodge roll, block, hit reactions, knockback.** Make the third-person combat feel like input.
- **Death and recovery**: a real penalty, and Emberveil's revive rule for companions.

---

## Phase 4 — Places on the map ⭐ **people, trade and work (2026-09-15)**

**You can, now:** walk into any settlement and find people standing in it — a merchant, an elder, a
smith, an innkeeper, guards and villagers, sized by how big the place is. Press **E** to talk. Buy
from their stock, sell out of your bag, and take work. Names come from **Name Forge** in the
settlement's own race, so a dwarf town has dwarf names.

Four kinds of job, all anchored to things that actually exist: cull a creature the bestiary really
spawns here, carry word to a settlement World Forge really founded, clear a dungeon it really placed,
or gather items the loot tables really drop. Taking one drops a pin on the map. They only advance
through events — a kill, an arrival, a piece of loot — and only the person who gave it will pay.

**Still to do in this phase:** dungeon interiors (a "clear" job currently sends you to the site, but
the site is a marker, not a place you go inside), shops that restock over time, an inn that does
anything, and NPC dialogue with real personality — that waits for Lingo in phase 7.

- **The map's own nodes** (`world.nodes`: settlements, ports, dungeons, landmarks, passes) become
  real places on the ground, with the roads (`world.roads`) drawn as paths you can follow.
- **Settlement builder**: procedural huts/walls/wells from the same prop kits, scaled by node size.
- **NPCs** with `library/` blueprints, standing where they should, with shops, a smith, an inn.
- **Dungeons**: hand-shaped interiors keyed to a dungeon node; Emberveil's `dungeons.json` as
  the content model.
- **Quests**: `conversations/` topics and Emberveil's side quests, pinned to real map coordinates.
- **Fast travel that is earned** — a discovered node, not a free teleport.

---

## Phase 5 — Ground to orbit ⭐ **flying and landing work (2026-09-15)**

**You can, now:** press **J** to lift off, fly the system in `js/space.js` (W throttle, Shift boost,
hold Space to warp), pick another world, press **J** again to land on it — and your character, level,
gold and bag come with you while the whole planet is rebuilt underneath. Orbits are real: the
semi-major axis, period, inclination and **eccentricity** `universe/` generated, on the same clock
the sky uses, so what you saw overhead from the ground is where you actually fly.

**Still to do in this phase:** the swap is a climb-and-fade, not a true continuous descent — the
terrain rings fall away and the space scene takes over behind the fog. Making it genuinely seamless
needs the planet sphere and the heightfield visible at the same time, and a camera-relative origin.
Also missing: flying *down* through atmosphere to a chosen point rather than a scripted descent, and
an orbit view you can look at without flying.

- **A ship** you own, from `assets/js/space-models.js` (three ship models are already there) or a
  new procedural builder in the `avatar-3d/js/vehicles.js` style.
- **Flight model**: walk → ship → atmospheric flight → space, on one continuous altitude axis.
- **The scale handoff.** This is the real work. Three things swap over as you climb:
  1. the terrain rings stop following you and fall away, replaced by
  2. a **planet sphere** built from the same map (`universe/js/texture.js` already renders the
     surface, cloud, night-lights and glow textures from that exact `world`), and
  3. the sky scene's exaggeration winds down toward the honest one, so the siblings shrink to the
     dots they really are as the reason to fake them disappears.
  Done right, there is one moment where both the local heightfield and the distant sphere are
  visible and must agree. Phase 1's choice of 640 m cells and real metre heights is what makes that
  arithmetic possible; keep it.
- **Re-entry**: pick a spot on the sphere, descend, and the rings rebuild under you there.
- **Orbit view**: the planet from above, the moons, the star, the rest of the system.

**Risk:** floating-point precision. A planet surface is 163 km; a spaceship is 10 m. Use a
camera-relative origin (shift the world, not the camera) before this phase, not during it.

---

## Phase 6 — The rest of the system ⭐ **travel works (2026-09-15)**

**You can, now:** fly to any landable planet of the system and land on it. Every world is rebuilt
from its own seed, with its own weather, palette, scatter, rivers, roads and towns.

**Still to do:** moons as landing targets, hazards that actually bite (temperature, atmosphere,
radiation, gravity are all in the planet record and unused), resources worth the trip, stations and
wrecks, and jumping to another star.

- **Interplanetary travel** with a real travel time and a skip; moons as landing targets
  (`universe/` already treats a moon as a small planet with its own map).
- **Worlds that are hostile**: temperature, atmosphere, radiation, gravity from the planet record —
  a lava world needs protection, a low-gravity moon changes how you jump.
- **Resources and rare elements** (`universe/data/elements.json`) as a reason to go somewhere.
- **Orbital stations and wrecks** (`assets/js/space-models.js` has a station, a satellite, a probe).
- **Jump to another star** — `universe/js/galaxy.js` already builds a connected lane graph.

---

## Phase 7 — Sound and speech ⭐ **done 2026-09-15**

**You can, now:** hear the world and be talked to by the people in it.

- **Sound** (`js/sound.js`) over the Sound Lab: footsteps at your actual walking cadence (and not
  while swimming or riding), swings, hits, crits, deaths by body type, bow and arrow, loot by
  rarity, coins, equipping, levels, finished work and interface clicks.
- **Ambience by ground**: a forest, a marsh, a mountain, a town and a gale are five different beds,
  crossfaded as you walk from one to the next.
- **Voices**: every NPC gets a formant voice built from their role, gender and seed
  (`shared/voices.js`), so the smith in one town does not sound like the smith in the next.
- **Lingo**: what they say is generated from their own personality, not a fixed string. A greedy,
  talkative merchant says "Look who it is. Wren. Be quick."; a kind innkeeper says "Peace, Wren.
  Have you eaten? You should eat." They know who they are talking to.
- All of it degrades quietly: `?sound=off`, a debug toggle, or a browser that will not give the page
  an audio context, and the game runs on in silence.

**Still to do:** memories and relationships (`lingo/js/memory.js`, `relations.js`) so an NPC
remembers the fight you had outside their village, and combat barks.

- **Sound Lab** (`sfx/`): 118 catalogued ids, four interchangeable makers, loudness already
  normalised per category. Footsteps by ground material, weather beds, combat, interface.
- **Ambience by biome**, crossfaded as you walk from forest to marsh.
- **Voices** (`voice-lab/` formant engine + `shared/voices.js` role timbres) for NPCs and the player.
- **Lingo** (`lingo/`): dialogue, the trait and slider personality system, the narrator.
- **Memories and relationships** (`lingo/js/memory.js`, `relations.js`) so an NPC remembers the
  fight you had outside their village.

---

## Phase 8 — Who you are ⭐ **talents, passives and visible armour (2026-09-15)**

**You can, now:** build a character your own way and see it on them.

- **Passives** — Emberveil's own twenty nodes and per-class trees, reused rather than reinvented. A
  point every fifth level, three ranks a node. The ones this game reads are live (health, mana,
  regeneration, block, dodge, crit, life steal, damage reduction, thorns, health and mana back on a
  kill); the rest are listed on the sheet as carried but not wired up, the same way unimplemented
  affixes are.
- **Talents** — ten broad masteries, one at levels 3, 8, 13, 18, 23 and 28. Emberveil's talents
  modify named skills and Farhold has no skill bar, so its talent levels would have handed out
  points with nothing to spend them on. Every one of these changes a number the game already reads,
  and a test asserts exactly that.
- **Armour you can see** — the base's tier picks the Chibi 2 part, so cloth is a robe, heavy is
  plate, and a legendary piece is gilded. Looked up through `loot.base(baseKey)`, because the
  generated item does not carry its tier.

**Still to do:** character creation (you pick a class and a name; you cannot yet pick a face), dyes,
crafting at the smith, and companions.

- **Character creation** on the Chibi 2 body: the avatar builder already exists in `avatar-2d/` and
  `avatar-3d/`; put it in front of the game.
- **Classes, talents, passives** from Emberveil's `rules.js` (30 classes, talent levels, passive
  trees) — phase 1 uses a class only for its look.
- **Gear that shows**: armour sets visible on the body, dyes, the 85 gear parts in
  `avatar-3d/js/chibi2-gear.js`.
- **Crafting and salvage** — Emberveil's `loot.js` already has salvage yields, a blacksmith and an
  enchanter.
- **Party or companions**: the pets and companions in Emberveil's `enemy-looks.json` are built.

---

## Phase 9 — The long game

**You can:** have a reason to keep playing past the first hour.

- **A campaign spine**: acts, a goal, a reason this system matters.
- **Factions and reputation**; **a nemesis** that remembers beating you (Emberveil has both).
- **Multi-day conversation threads** (`conversations/` has six).
- **A home you build** — a camp, then a hold, then a landing pad. Frontier Foundry's build/haul/power
  engine is the obvious donor if this gets serious.
- **A save system** worth the name: seed + deltas, not a dump of the world.
- **New game plus**, difficulty tiers, a bestiary and a journal.

---

## Phase 10 — Make it hold up

**You can:** play it for hours without it falling over, and hand it to someone else.

- **Performance**: ring skirts to kill the seams, GPU instancing for props and enemies, batched
  sprites everywhere (`spellfx-batched.js`), a camera-relative origin, a frame budget per system,
  a `tools/bench-farhold.mjs` like the Chibi 2 one.
- **A balance simulator** in the shape of `prototypes/emberveil/tools/sim-emberveil.mjs`: hundreds
  of seeded headless runs with a bot, reporting where players die, what gear they end up in, and
  which biomes are empty.
- **Settings**: view distance, quality, key bindings, accessibility.
- **Test coverage** across the systems, including a headless WebGL pass.
- **Graduate it**: copy the borrowed pieces in (see the README's note about importing from
  `prototypes/emberveil/`), write the docs, move it to its own repo.

---

## What each phase costs, roughly

| Phase | Size | The hard part |
|---|---|---|
| 1 ✅ | done | getting the terrain and the map to agree |
| 2 ✅ | done | scatter density vs. frame budget — landed at ~8 draw calls |
| 3 | **large** | now carries the map screen, the phase 2 play-test fixes (roads, collision, swimming, saves, eclipses) and combat — may be worth splitting |
| 4 ⭐ | people, trade and work done | dungeon interiors and real dialogue still open |
| 5 | **largest** | the scale handoff and floating-point precision |
| 6 | medium | making other planets worth the trip |
| 7 ⭐ | done | was mostly wiring, as predicted — memories and relations still open |
| 8 ⭐ | talents, passives and armour done | character creation and crafting still open |
| 9 | large | content, not code |
| 10 | medium | the simulator pays for itself |

**Suggested order if time is short:** 3 → 5. Props, a real fight, and the launch are what make
it read as the game described. Phases 4, 6 and 9 are content depth; 7, 8 and 10 are polish that can
land late.
