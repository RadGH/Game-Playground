# Farhold — brainstorm

An idea pile for the game, biased toward things the playground can already do. Each idea names the
experiment that would carry it, so nothing here is a blank cheque.

Reference points are named here for Claude's benefit only — the block-world exploration RPG loop
(*Cube World*), the seamless planet-to-orbit sandbox (*No Man's Sky*), and the user's own loot RPG
(*Emberveil*). **None of these names, or anything from them, goes in player-facing text or data.**

Marked ⭐ where the payoff looks large against the work.

---

## 1. The world underfoot

1. ⭐ **Props from the map, not from thin air** — `worldgen/js/local.js` already scatters biome-suited
   features per cell (tree, rock, bush, reed, cactus, ruinblock, bones, campfire). Read that same
   list for the visible world so the map and the ground keep agreeing.
2. **Prop kits per biome family** — broadleaf, conifer, palm, dead, crystal, fungal, none. Procedural
   like the creature builder: shaped geometry, no downloads, seeded variation.
3. ⭐ **Instanced everything** — one `InstancedMesh` per prop type per ring. Phase 1 spent five draw
   calls on the whole planet specifically to leave room for this.
4. **Grass that reacts** — inner two rings only, bent by wind and by the player walking through it.
5. **Rivers you can follow** — `world.river` and `world.rivers` are already traced polylines from
   source to sea. Carve them into the heightfield and put a current in them.
6. **A shoreline that reads** — wet sand, foam, tide line. Cheap, and it sells the scale.
7. **Cliffs the heightfield cannot make** — overhangs, arches and cave mouths as placed geometry at
   points where slope is extreme.
8. **Caves as a second surface** — a separate heightfield below the first, entered at cave mouths.
9. **Ore and herbs where the planet says they are** — `universe/` gives every planet baseline
   resources and 1–2 rare elements. Scatter nodes weighted by biome.
10. **Landmarks you can see from far away** — a monolith, a crashed hull, a broken tower, placed on
    `world.nodes` landmarks and made tall enough to read at 5 km. Navigation without a compass.
11. **Weather** — rain, snow, dust, fog banks driven by the map's own moisture and temperature.
12. **Seasons** on a long clock, moving the snow line the terrain colourer already computes.
13. **Footprints, trampled grass, and mud** — small, and nobody who plays it will not notice.
14. **A world that is not all one planet's colour** — the aura biomes (blighted, hallowed, glimmer
    waste) are already in the biome table and look alien for free.

## 2. The sky and space

15. ⭐ **The honest-sky toggle** — a settings slider from "true scale" (siblings are dots) to
    "cinematic". Ship it as a setting rather than a secret, and the cheat becomes a feature.
16. ⭐ **An eclipse you can predict** — the orbital maths is already running. When a moon crosses the
    star, darken the world. Put the next one on the clock so players travel to see it.
17. **Auroras on worlds with a magnetosphere**, flares on red dwarfs (`star.flareRate` exists).
18. **A binary sunset** — `universe/` already generates binary pairs with a companion record.
19. **Real constellations** — the starfield drawn from `generateGalaxy()`'s actual star positions, so
    the sky is the map of where you can go.
20. **Satellites and stations crossing overhead** as moving points, then as places to dock.
21. **See the planet you are going to before you go** — a surface texture already exists for every
    body (`universe/js/texture.js`); show it in the sky as it really looks.
22. ⭐ **Launch with no cut** (phase 5) — walk, board, climb, watch the sky go black and the horizon
    curve. The single strongest moment in the whole plan.
23. **Land anywhere, not at pads** — pick a point on the sphere and the rings rebuild there.
24. **Orbital scanning** — mark resources, ruins and life from orbit, then go down for them.
25. **A ship that is yours** — modules, cargo, a look you change. `assets/js/space-models.js` has
    three ship models, a probe, a satellite and a rocket already.

## 3. Fighting

26. ⭐ **The skill bar** — Emberveil has 30 classes of skills with costs, cooldowns and unlock levels
    sitting in data, unused by this prototype.
27. ⭐ **Spell effects** — `avatar-3d/js/spellfx.js` is built and batched: 11 elements of projectile
    and impact, 23 looping status auras, cast/heal/revive/aoe. It is a wiring job, not a build.
28. **Statuses that show on the body** — the 23 auras are parented to a body and scaled to its height.
29. **Dodge roll and block** — the difference between an auto-battler and an action game.
30. **Hit reactions, knockback and stagger** — Chibi 2 has `hit` and `guard` clips already.
31. **Enemies that use the ground** — archers on ridges, ambushes in gullies, packs that flank. The
    terrain sampler makes "is this high ground?" a one-line question.
32. **Champions and named foes** — Emberveil's modifiers and named-enemy tables port directly.
33. ⭐ **A nemesis that comes back** — Emberveil's nemesis system remembers who beat you, gives them a
    title, and sends them after you. It survives a change of planet, which makes it better here.
34. **Beasts that are not hostile** — herds that flee, predators that hunt other animals, and a
    hunting loop for hides. 37 creature bodies exist.
35. **Enemy camps with a reason to exist** — a fire, tents, a leader, loot in a chest.
36. **Boss arenas placed on real terrain** — a crater, a peak, a ruin, chosen from the map.
37. **The damage meter as an endgame toy** — `meters/` is a full Skada-style meter with per-item kill
    counts and drill-downs. Players who care will care a lot.

## 4. Loot and character

38. ⭐ **Turn on the affixes already in the bag** — `prototypes/emberveil/js/effects.js` has all 359
    effect ids implemented as hooks. Phase 1 carries them and does nothing with them.
39. **Loot that shows on the body** — the 85 gear parts in `chibi2-gear.js` across 17 slots, so a
    plate chest and a horned helm actually appear.
40. **Set bonuses** — Emberveil's sets are in `items.json`, with class sets that a party can collect.
41. **Uniques with lore** — already written, already generating, currently unread.
42. **Item names from Name Forge** — `namegen/` builds artifact names with real meanings and
    pronunciations, and exports them as dictionary entries.
43. ⭐ **Weapons that change how you move, not just your numbers** — Emberveil's "road weapons" each
    touch a travel system. Here the equivalent is gear that changes jump height, climb, breath,
    heat tolerance, or how far you can see.
44. **Salvage and crafting** — salvage yields, a smith and an enchanter are all in `loot.js`.
45. **A bag with weight** — a reason to go home, and the beginning of a base.
46. **Attribute builds that matter** — STR/DEX/INT already pick which weapon class scales.
47. **Talents and passives** — 20 passive trees and six talent levels, in `rules.js`.
48. **Transmog / dyes** — the avatar is CSS-variable recolourable; this is nearly free.

## 5. People and places

49. ⭐ **The map's towns become real towns** — settlements, ports, dungeons, landmarks and passes are
    already placed, named, and connected by an A* road network with bridges.
50. **Roads you can actually see and follow** — draw `world.roads` on the terrain as paths.
51. **NPCs from the library** — `library/` holds character, NPC, companion and enemy blueprints, with
    defaults seeded from the demos and a sync path to Claude.
52. ⭐ **NPCs that remember you** — `lingo/js/memory.js` (trait-weighted importance, decay, recall) and
    `relations.js` (warmth, respect, trust, fear, familiarity). Built and tested.
53. **Conversations with structure** — `conversations/` has 82 topics with roles, requirements over
    memories, gear, kill counts and party facts, plus six multi-day threads.
54. **A narrator for scene text** — Emberveil learned the hard way that scene text must not come out
    of a party member's mouth; `js/talk.js` has the fix.
55. **Shops, inns, a smith, a stable** — all modelled in Emberveil's town layer.
56. **Quests pinned to real coordinates** — "clear the ridge two kilometres north" is a better quest
    when the ridge is genuinely there.
57. **Strangers on the road** offering better-paid work, from Emberveil's road quests.
58. **A settlement that grows** as you help it.
59. **Per-race languages** — `namegen/` has 12 races with phonologies and concept dictionaries, so a
    place name can mean something.

## 6. Travel and survival

60. **Mounts and vehicles** — `avatar-3d/js/vehicles.js` has seven builds with real creature bodies
    in the shafts, built to be driven.
61. **Fast travel that is earned** — discovered nodes only, and a cost.
62. **Camp anywhere** — a fire, a rest, a conversation, a save point. Emberveil's camp scene is built.
63. **Hunger, warmth, air** on worlds that need them, from the planet record's hazards.
64. **Day length that is the planet's own** — `planet.dayLengthHours` is generated and currently
    barely used. A world with a 6-hour day plays differently.
65. **Tidally locked worlds** — one face baked, one frozen, a habitable ring between. `universe/`
    already reworks the climate for these.
66. **Low gravity changes the game** — jump height and fall damage already read `planet.gravity`.

## 7. Presentation

67. **Sound** — `sfx/` is 118 ids, four makers, loudness-normalised per category, with a bridge
    pattern that hooks a game without editing it.
68. **Footsteps by ground material** — the terrain already knows the biome under each foot.
69. **Voices** — the formant engine plus `shared/voices.js` role timbres (class, gender, seed).
70. **A themed interface** — Emberveil's dark-fantasy UI kit exists; Farhold wants its own, but the
    pattern (art set + tooltips + panels) is proven.
71. **Photo mode** — free camera, hide the HUD, time and weather sliders. Cheap; people share these.
72. **A map screen** worth opening — `worldgen/js/render.js` draws the world with hillshade, rivers,
    roads, labels and borders already.
73. **A journal and bestiary** that fills itself from what you have killed and found.

## 8. Things worth testing early

74. **A balance simulator** in the shape of `tools/sim-emberveil.mjs` — hundreds of seeded headless
    runs with a bot, reporting where players die, which biomes are empty, and what gear they end in.
75. **A frame-budget bench** in the shape of `tools/bench-chibi2.mjs`, so "add more props" is a
    measured decision.
76. **A binding audit** — Emberveil's `tests/bindings.test.js` renders every line and fails on a
    stray `{`. The same idea catches every unnamed item and empty tooltip.
77. **Seed sweeps** — generate 200 planets and assert every one has a walkable spawn, some flat
    ground, and at least three biomes. Procedural generation fails on the seed you did not try.

---

## The five worth doing first

Judged on payoff against work, using what is already built:

1. **Props and instancing** (#1–#4) — the world stops being empty, and the budget is already there.
2. **Skills and spell effects** (#26, #27) — the effects library is finished and unused.
3. **Seamless launch** (#22) — the moment the whole plan is arranged around.
4. **The map's towns and roads made real** (#49, #50) — the data exists and is going to waste.
5. **NPCs that remember you** (#52, #53) — no other prototype's tech reads as strongly in a first
   ten minutes.

---

# Round 4 additions — the RPG expansion, and what is next

Round 4 built most of section 3 (fighting) and section 4 (loot and character) out of the list above,
plus the zone system that was never in it. `RPG.md` says what was built and why. This section is the
*next* pile: things the round turned up that are worth doing, and the ones the user asked for that
are not built yet.

## Creatures worth adding

**Done — it grew too big for this file and now lives in [`BESTIARY-IDEAS.md`](BESTIARY-IDEAS.md).**

That file holds about forty new creatures written out properly: fifteen pieces of **neutral
wildlife** (the game currently has none — everything charges you, which makes a planet a shooting
gallery), eight kinds of **people who are not in a town** (the roads between settlements are empty),
and hostiles filling the four thin biome families — `ice`, `crystal`, `void` and `toxic`. The
**sea is deliberately left barren**: swimming here is surface-only, so anything in the water is
either scenery or an attack you cannot answer. Each says
what the thing is in Dwarf-Fortress-style plain sentences, and each is tagged **variation**,
**variation+**, **bespoke** or **chibi** so the cost of building it is visible up front. Most are
variations, which is the whole point of having a procedural creature system.

## Still on the list from the round-4 play-test

- **A galaxy map** on `M` while in space: the system, then adjacent stars, then the galaxy, each
  with the player and any pins on it; travel to a neighbouring star with a warp effect and a
  different skybox at the other end. (`universe/js/galaxy.js` already generates the galaxy with
  travel lanes between stars — this is a wiring job plus a screen, not a new system.)
- **Quest and pin tracking** across every scale: a marker on the map and the minimap, an edge arrow
  when the target is off the minimap, track/untrack, and the same marker visible from orbit.
- **A continuous approach from orbit**: slow as you near a world, raise its detail as you close, and
  slip into the atmosphere without pressing anything. Take-off and landing are already seamless;
  only the approach still needs a key.
- **A "habitable start" option** guaranteeing a multi-biome first world.
- **Water that meets its bank.** The river ribbon and the carved channel still leave a sliver you can
  see under from the right angle.

## Things round 4 turned up that are worth building

- **A second dungeon shape.** The layout is rooms and corridors. A tower (one shaft, floors stacked)
  and a cave (no right angles) would use the same machinery and feel entirely different.
- **Enemies with skill bars.** They have roles and ranks and modifiers; they still choose between
  exactly one thing. The player's own `skills.js` would drive them with almost no change.
- **Dodge and block as inputs.** Blocking is on the dice. A button would change every fight.
- **A reason to go home.** Crafting made the bag valuable and there is nowhere to put anything.
- **Set pieces that are not fights**: a caravan to escort, a wreck to search, somebody being robbed.
  `js/encounters.js` already places them; only the outcome is missing.
- **The damage meter** (`meters/`) as an endgame screen. It is built, tested, and unused here.
