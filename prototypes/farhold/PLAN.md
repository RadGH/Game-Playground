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

## Phase 2 — A world worth walking

**You can:** walk through forests, over rocks, past ruins — and the ground stops being empty.

- **Scatter system.** A deterministic prop placer over the same seed: `propsAt(chunk)` returns what
  stands in a cell, driven by biome, slope, moisture and altitude, so the same clearing is always
  the same clearing. Reuse the feature sets `worldgen/js/local.js` already scatters (tree, rock,
  bush, reed, cactus, ruinblock, bones, campfire…).
- **Instanced rendering.** One `InstancedMesh` per prop type per ring; that is the reason phase 1
  spent almost no draw calls. Budget: stay under ~60 draw calls with full scatter.
- **Prop kits per biome family**: broadleaf / conifer / palm / dead / crystal / fungal / none.
  Procedural, in the style of `avatar-3d/js/creatures.js` — shaped geometry, not downloads.
- **Grass and ground cover** on the inner two rings only, fading out with distance.
- **Water that reads as water**: shorelines, rivers carved from `world.river`, lakes, a shader with
  depth tint and a moving normal. Swimming.
- **Weather and time**: rain, snow, fog banks, wind that moves the grass; a real 24-hour clock.
- **Caves and overhangs** where the map says there is relief (stretch goal — needs geometry the
  heightfield cannot express).

**Risk:** scatter density is where the frame budget goes. Measure before adding a third prop layer.

---

## Phase 3 — A fight worth having

**You can:** use abilities, see spells land, fight things that are actually dangerous.

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

## Phase 4 — Places on the map

**You can:** find villages, ruins and dungeons that were already on the world map, and get work.

- **The map's own nodes** (`world.nodes`: settlements, ports, dungeons, landmarks, passes) become
  real places on the ground, with the roads (`world.roads`) drawn as paths you can follow.
- **Settlement builder**: procedural huts/walls/wells from the same prop kits, scaled by node size.
- **NPCs** with `library/` blueprints, standing where they should, with shops, a smith, an inn.
- **Dungeons**: hand-shaped interiors keyed to a dungeon node; Emberveil's `dungeons.json` as
  the content model.
- **Quests**: `conversations/` topics and Emberveil's side quests, pinned to real map coordinates.
- **Fast travel that is earned** — a discovered node, not a free teleport.

---

## Phase 5 — Ground to orbit, without a cut ⭐ the one the user asked for

**You can:** walk to your ship, take off, fly up until the sky goes black and the planet curves
away beneath you, and come back down somewhere else.

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

## Phase 6 — The rest of the system

**You can:** fly to another planet of the same system and land on it.

- **Interplanetary travel** with a real travel time and a skip; moons as landing targets
  (`universe/` already treats a moon as a small planet with its own map).
- **Worlds that are hostile**: temperature, atmosphere, radiation, gravity from the planet record —
  a lava world needs protection, a low-gravity moon changes how you jump.
- **Resources and rare elements** (`universe/data/elements.json`) as a reason to go somewhere.
- **Orbital stations and wrecks** (`assets/js/space-models.js` has a station, a satellite, a probe).
- **Jump to another star** — `universe/js/galaxy.js` already builds a connected lane graph.

---

## Phase 7 — Sound and speech (the two things phase 1 left out)

**You can:** hear the world and talk to the people in it.

- **Sound Lab** (`sfx/`): 118 catalogued ids, four interchangeable makers, loudness already
  normalised per category. Footsteps by ground material, weather beds, combat, interface.
- **Ambience by biome**, crossfaded as you walk from forest to marsh.
- **Voices** (`voice-lab/` formant engine + `shared/voices.js` role timbres) for NPCs and the player.
- **Lingo** (`lingo/`): dialogue, the trait and slider personality system, the narrator.
- **Memories and relationships** (`lingo/js/memory.js`, `relations.js`) so an NPC remembers the
  fight you had outside their village.

---

## Phase 8 — Who you are

**You can:** make a character, build them your way, and look like it.

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
| 2 | large | scatter density vs. frame budget |
| 3 | large | making third-person combat feel good |
| 4 | large | procedural settlements that do not look generated |
| 5 | **largest** | the scale handoff and floating-point precision |
| 6 | medium | making other planets worth the trip |
| 7 | medium | mostly wiring; the pieces all exist |
| 8 | medium | armour on a procedural body |
| 9 | large | content, not code |
| 10 | medium | the simulator pays for itself |

**Suggested order if time is short:** 2 → 3 → 5. Props, a real fight, and the launch are what make
it read as the game described. Phases 4, 6 and 9 are content depth; 7, 8 and 10 are polish that can
land late.
