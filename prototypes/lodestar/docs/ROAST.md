# Lodestar — the roast

Written 2026-10-28 after reading `OWNER-BRIEF.md` (all five same-day changes) and `BRAINSTORM.md` (1,277 lines).
This is the hard pass. `PLAN.md` is the result and wins over the brainstorm wherever they differ.

**The ground rules I held myself to:**

1. Every sentence in the owner's brief survives somewhere. I can change *how* a requirement works; I cannot drop it.
   The full sentence-by-sentence map is the last table in `PLAN.md`.
2. The owner's two loudest instructions are filters for everything: **"The goal is not to micro manage units"** and
   **"Tedious detail for a pixel game."** A system that asks the player to set a number on every building, pick a tier
   on every wall section, or babysit a squad fails both. The latest change sharpens this into a rule: **upgrades are
   global** — you upgrade "walls", not *this* wall.
3. Protect the core verbs. Drawing a wall, drawing a road, dropping a meteor and watching a satellite paint a planet
   are the fun. They must be instant, cheap to try and satisfying. I cut around them, never into them.
4. A phone browser is the target machine. Anything that doubles the layout work or the per-tick cost has to earn it.
5. Additions the owner invited ("This is your game") stay without asking him if they survive this roast.

Verdicts: **keep** (as written, maybe renumbered) · **simplify** (keep the idea, smaller) · **merge** (folded into
another idea) · **cut** (gone, with the reason) · **park** (good, not now — listed in `PLAN.md` "Parked").

---

## 1. The big problems

### 1.1 It is four games stapled together

City builder + factory game + tower defence + 4X space game, plus a spell system and a bunker UI that is itself a
small game. The brainstorm proposes **~17 console machines, 4 bunker walls, 6 filters, 3 sensor types, 7 eras /
~120 research nodes, 16 spells, 10 vehicles, 10 unit types, 12 tower types, 6 wall tiers, 4 worker classes, 8 enemy
families, 7 probe types**. Each list is reasonable on its own. Together they are three years of work and a phone
screen nobody can read.

The fix is not to drop any layer the owner asked for. It is to **make each layer one rule deep** and let the layers
multiply each other, the way the best factory games do: one storage rule, one transport rule, one upgrade rule, one
damage rule, one order rule.

### 1.2 Per-piece tiers everywhere — the owner already killed two of them

The owner cut road tiers, then wall tiers, for the same reason: *you cannot tell the difference between pieces in a
pixel game, and choosing per piece is tedious.* The brainstorm has the same pattern in five more places:

| Where | Brainstorm | Verdict |
|---|---|---|
| Walls | 6 tiers, upgrade-in-place by dragging along a wall | **cut** — owner change. One wall. Global **Wall** upgrade levels |
| Roads | already one kind | **keep** + global **Road** upgrade levels (owner: "walls (and roads etc)") |
| Production buildings | Mk I–V per building, upgraded in place | **simplify** — global level **per building kind** ("Smelters III" upgrades every smelter, past and future) |
| Drills | Mk I–V per drill | **merge** into the per-kind rule above |
| Housing | tent → cottage → row house → tenement, per house | **simplify** — one house; a global **Housing** level raises every house's capacity |
| Batteries | Mk I–IV | **keep as separate builds** — a battery is a *count* you build more of, not a tier you pick; one battery kind, a global **Battery** level raises every battery's capacity |
| Towers | 12 kinds | **simplify** to 8 kinds over the whole game, each with a global level |
| Bridges | road bridge / Long Spans / Heat-proof | **keep** — it is already a global reach ladder ("bridges can now cross deep water"), which is exactly the owner's pattern |

This is the single biggest simplification in the plan and it comes straight from the owner: **every upgrade in the
game is a global level on a kind of thing.** It also makes the incremental late game cleaner — repeatable research
just raises those levels further. A level change shows as one subtle global look change (wall trim colour, road edge
paint, tower cap colour) so the player can see it happened.

### 1.3 The bunker UI is the soul of the game and the biggest risk

The owner's own words are the strongest in the brief: *"sitting at command HQ acting as commander, not a floating
god"*, *"actual screens, knobs, and buttons"*, *"physical machines"*. The brainstorm nails the fantasy. Its risk is
size: four walls you swivel between, each with its own machines, plus a repeater scope on every wall, is four UIs
to lay out on desktop **and** phone **and** gamepad.

- **Chair swivel between 4 walls — merge** into the drawer bay. The drawers are grouped under stencilled wall labels
  (FRONT / LOGISTICS / ARCANE / SPACE) so the "rooms" exist as a label, but there is one layout. The scope is always on
  screen, so no repeater scopes are needed. The "swivel" sound and a short slide plays when you open a drawer from a
  different group — the feeling for free.
- **The console grows — keep.** Best idea in the brainstorm. It is also the tutorial and the answer to "20 machines on
  400 px": on day one there are five.
- **Every machine is also a fast control — keep and make it law** (PLAN §0). A knob is a drag, a wheel, a key, a stick
  and a tap on its labelled detent.
- **Two-step casting (pick, then fire) — keep.** The 5-step fire mission (cartridge, key, aim, lift guard, fire) —
  **simplify** to: tap the cartridge (it arms, the key turns by itself with a clunk), aim, press FIRE. The guard cover
  is drawn open while armed. Three actions, still impossible to fire by brushing a button.

### 1.4 The map is too fine to read at strategy scale

0.5 m cells on a 2,048² map (1 km) means a 400 px phone scope at 1 px per cell shows a fifth of the map's width, and a raid
on the far side is invisible without the filters. The filters do the strategy work, which is
right, but the numbers need trimming:

- **Map size — simplify.** Home map **1,536²** cells by default (768 m), with Small 1,024² and Large 2,048² choices.
  Other planets 1,024²–2,048² by planet size. 2.4 M cells is 9.4 MB at 4 bytes (see 1.5).
- **Range knob — simplify** detents to **¼ / ½ / 1 / 2 / 4 / 8** screen pixels per cell. The two zoomed-out detents are a
  downsampled "chart" picture so the whole map fits on a phone. Keep the clunk.
- **Cell scale 0.5 m — keep.** People need to be 3×3 to read as people.

### 1.5 The cell is fatter than it needs to be

Six bytes with a stored *relief* byte and a *wetness* byte. Relief is visual only and no rule reads it — so it should
not be stored at all: **derive it** from the material table plus a hash of the cell position (same input always gives
the same bump). Wetness changes slowly and over areas: put it on the quarter-resolution layer with smoke.

**Verdict: simplify to 4 bytes** (material, temperature, amount/hit points, flags) — one `Uint32Array`, half the memory,
half the upload to the GPU. Contract in PLAN §3.1.

### 1.6 A second economy hidden inside: power

The brainstorm adds an electrical power grid (generators, power lines as a graph, POWER jam lamp, red emergency
lights). The owner never asked for power. It is a third network on top of roads and rails, and wires are exactly the
"tedious detail" he rejected.

**Verdict: simplify.** Power is **a number per base**: generators add, machines draw, shown as a needle on the HQ
console. No wires, no grid, no poles. If draw exceeds supply, every machine on that base slows evenly (and the POWER
lamp lights). Mana cells (crystal) are an alternative power source — which keeps the owner's "magical energy sources".

### 1.7 Things that quietly contradict the owner

| Brainstorm idea | Problem | Verdict |
|---|---|---|
| Dune serpents that **derail trains**; a train-stopper beast that stands on the track | The brief: *"trains and such should have certain protection … fast enough to outrun enemies or even plow through them."* A beast built to stop trains undoes the one protection he asked for | **cut** both. A train is attackable only while **standing** at a station |
| Cliff **breaches** by meteors and siege enemies; **ramps** cut into cliffs | Owner: cliffs are *edges*. A blastable cliff turns them back into terrain to edit, and needs pathing rebuilds | **cut** breaches. **Merge** ramps into the road rule: a late global road upgrade lets a road climb a cliff as **stairs**, exactly like a road over water becomes a bridge |
| **Chasms** as a separate edge kind | A cliff line with bridges allowed is the same thing | **merge** into cliffs |
| Frost lance freezing your own river | A tower that silently breaks your defence is a trap, not a choice | **cut** the tower; freezing water stays on the **Frost snap** spell (your choice) and **ice-world cold snaps** (a warned event) |
| Lava taps, molten pool spell, molten blobs from meteors | Owner removed lava physics. Short-lived burning patches are fire (fine); a new lava *area* made by a spell is a lava rule we don't need | **cut** molten pool and lava taps. Meteor blobs **keep** as burning patches (fire rules, not lava) |
| "Recall the line" spell teleporting a convoy | Brief: *"All delivery methods actually have to travel."* | **cut** |
| Pneumatic freight tube: underground, can't be seen or hit | Also dodges *"in danger of enemies attack"*. And it's another network | **park** |
| Shelter bunkers | Houses are never targeted (owner's damage rule), so they protect nothing | **cut** |
| Migrants that can be ambushed on the road | Migrants are not production, military or delivery — the damage rule says no | **simplify**: migrants walk in, are never attacked |

### 1.8 Micromanagement that crept back in

| Brainstorm idea | Why it's micro | Verdict |
|---|---|---|
| Per-depot **wants and offers** with reserves on every depot card | a number per resource per depot | **simplify**: defaults do everything — HQ wants everything, outposts offer everything, production pulls what its recipe needs. One optional "keep here" override per depot |
| Crews per building, 4 worker classes, a school to train Engineers/Arcanists | assigning people by type | **simplify**: one population; jobs are filled automatically, nearest first; research, not schooling, unlocks advanced machines |
| 4 **stances** per squad | a setting per squad | **cut**: one behaviour — fight inside your area, chase to 1.5× it, come back, fall back to the HQ under 30% strength |
| **Escort posts** + response teams + strike orders + posts + patrols (5 order kinds) | five ways to say "stand here" | **merge** into 3 orders: **Post** (stand at a spot, guard a radius; a post on a nest is a strike — they attack it, then hold the ground), **Patrol** (walk a drawn loop or there-and-back; a patrol drawn along a road or rail is an escort), **Response** (wait at HQ, go to any alarm within range, come home) |
| Vehicle **threat setting** per vehicle | a setting per truck | **simplify**: one setting per *line*, default "wait if the route is hot" |
| Radio **tuning dial selects units** | it's click-to-select with extra steps | **cut** the selection role. The radio is a speaker and the channel strip on the Garrison Board |
| Per-wall-section **upgrade by dragging** | per-piece tiers | **cut** (owner change) |
| Dust storms that **drift sand over roads** that must be cleared | chores | **cut** |
| Debris on roads cleared by a crew | automatic, so not a chore | **keep** (cosmetic slowdown, automatic) |

---

## 2. Section-by-section verdicts

### 2.1 Fantasy and tone (BRAINSTORM §1.1–1.2)

| Idea | Verdict | Note |
|---|---|---|
| Diesel-age bunker meets frontier magic, mana as an industrial fluid | **keep** | the art direction |
| Enemies are alien wildlife; violence is pest control | **keep** | |
| Abstract sensor picture, no free camera | **keep** | the scope pans and zooms; it never tilts or orbits |
| Five voices (Signals, Quartermaster, Arcanist, Calculator crew, High Command) | **simplify** to **three**: Signals (radio — field calls), Quartermaster (teletype — logistics and research), High Command (tube — objectives). The Arcanist's lines go to Signals | fewer voices to write and tune |
| Formant voices through a radio filter, subtitles always | **keep** — `shared/voices.js` | radio lines are short; voice can be turned off |
| High Command directives | **keep and promote**: they are the **objective list** — the game's quiet tutorial and long story | one envelope at a time, always says what to do next |

### 2.2 The console (§1.3–1.8)

| Machine | Verdict | Note |
|---|---|---|
| Tactical Scope | **keep** | the only view of the world |
| Light Pen | **keep** | the cursor; offset reticle on touch |
| Range knob | **simplify** detents (¼…8) | |
| Filter selector (6 filters) | **simplify** to **4**: SIGHT, ORE, FLOW (roads/rails/lines/vehicles + power and mana needles), THREAT (nests, Noise/Glow contours, raid arrows). HEAT **park** | a sixth of the art, same decisions |
| Tool bank | **keep**: BUILD, WALL, ROAD, RAIL (when unlocked), ORDER, CLEAR | DIG and SURVEY cut — no digging on a flat world; survey is a building |
| Build Ledger (rolodex of cards) | **keep** | the build menu |
| Dispatch Board (split-flap) | **keep** | arrives with the first line |
| Garrison Board (pegboard) | **keep** | squads and their orders |
| Mana Gauge with tier marks | **keep** | battery cap creeping past an engraved line is the spell progress bar |
| Spell Board | **simplify** casting to 3 steps (1.3) | |
| Teletype + cork strip (pin a line) | **keep** teletype; **simplify** pinning to a "pin" tap that keeps the line at the top | |
| Radio set | **simplify** — a speaker + subtitles on the teletype | |
| Pneumatic tube | **merge**: it is how High Command envelopes and research results arrive (one inbox) | |
| The Calculator (relay computer, punch cards) | **keep**, smaller: card rack + hopper + lamps; queue up to 4 | |
| Orrery | **keep** | space era |
| Orbital Scope | **keep** | the stripe mapper |
| Alarm panel (jewel lamps + klaxon + mute) | **keep** with RAID, FIRE, CONVOY, HQ, BASE (another planet). FLOOD cut (no water physics); SPILL parked with spills | |
| Day clock + barometer | **merge** into one dial | |
| Degauss button | **keep** | cheap, delightful |
| Console grows | **keep** | 1.3 |
| Four bunker walls + chair swivel + repeater scopes | **merge** into grouped drawers | 1.3 |
| Desktop layout | **keep** the sketch | |
| Phone portrait layout (lamps / scope / mana+knobs / one drawer / handles) | **keep** | the right shape |
| Phone: offset pen + confirm toggle | **simplify** — offset pen yes; instead of a confirm toggle, every drawn line is a **blueprint** until you lift the finger, and **Undo** sits on the drawer edge. A slip is one tap to undo, not a toggle to manage | |
| Gamepad map | **keep**, with B = undo last point while drawing | |
| Room sounds | **keep** | cheap and core to the feeling |
| **Time dial** (pause, 1×, 2×, 4×) | **[my addition] keep** | a solo game needs pause and speed; a heavy rotary on the desk |

### 2.3 The world (§2)

| Idea | Verdict | Note |
|---|---|---|
| Flat world, edges give shape | **keep** — owner's rule | |
| Shallow water (wade, bridge), deep water (boats; later bridges), lava (burns, later bridges), cliffs (walls of the map) | **keep** | chasms merged into cliffs |
| Fixed water and lava areas that react but never flow | **keep** | |
| Reactions: fire stops at water, steam; lava ignites edges; lava-water shore is obsidian | **simplify** — obsidian shores are drawn by the map generator once, not a live rule | |
| Hot debris into water → steam burst that blinds | **keep** | sensor-blinding is a good rule |
| Frost freezes water into walkable ice; heat thaws it | **keep**, sources limited to Frost snap spell + ice-world cold snaps | |
| Lightning chains through connected water | **keep** | |
| Lightning + sand = glass streak | **park** | |
| Rain → mud, puts out fires | **keep** on worlds that have rain | |
| 4-byte cell, derived relief, quarter-res gas+wet layer | **simplify** (1.5) | |
| Fire spreading by temperature, downwind, slowed by wet | **keep** | the world's main physics; ignite times stay data |
| Timber walls burn | **keep as a global rule**: at **Wall level I** every wall is timber and burns; **Wall level II** (stone) makes every wall fireproof. That is the old "wooden walls, reinforcing to be stronger" — now global | |
| Explosions: broken ground, rubble that slows, debris arcs with a fake height, caps 300 particles / 80 landings per second | **keep** | TinyRTS lesson kept |
| Cliff breaches | **cut** (1.7) | |
| Ramps | **merge** into road "stairs" upgrade | |
| Climbing enemies (cross cliffs slowly) | **keep** as one later family's rule breaker | |
| Vector layer: walls, roads, bridges, rails drawn as smooth lines, simulated as cells | **keep** | the owner asked for it |
| Pipes and power lines on the vector layer | **cut** (no pipes, no wires — 1.6, 2.6 below) | |
| Wall drawing: polyline, auto-join within 3 m, snap to cliffs and deep water, RING CLOSED flash, gates, curves with Shift | **keep** — core verb | |
| Blueprint remembers broken sections and rebuilds | **keep** — TinyRTS lesson | |
| Relief lighting, sun angle, emitters, light buffer, lava glow, water shimmer, dark nights, floodlights, bloom | **keep** | the owner asked for it; budget in PLAN |
| Weather per planet (rain, dust, snow, ash, mana storms) + barometer | **simplify**: **one weather per planet type** — home: rain; ice: cold snaps; volcanic: ash fall (blinds); crystal: none. Dust storms and mana storms **park** | |

### 2.4 Roads and bridges (§2.5)

| Idea | Verdict |
|---|---|
| One road kind, drawn like walls, auto-join, junctions, rounded pads | **keep** |
| Road through a wall offers a gate | **keep** |
| Flat price per metre, built outward from the nearest depot | **simplify**: the road is placed as a blueprint at once and **builds fast** (≥ 20 m/s at the start) — never slow, never expensive. Core verb |
| Speed table (walkers ×1.4, wheels ×1.0 vs ×0.4 off road, enemies ×1.2) | **keep** |
| Road is a firebreak, no mud on roads | **keep** |
| Bridge = road over shallow water, automatic, price stamp turns colour | **keep** |
| Long Spans (deep water) and Heat-proof Spans (lava) | **keep** as global **Bridge** levels |
| Gap drawn red with the research name | **keep** |
| Drawbridges | **cut** (brainstorm already) |
| Roads/bridges/rails never attacked | **keep** — owner rule |
| Global **Road** upgrade levels (speed) | **[owner change] keep** |
| Road **Stairs** (cross a cliff line) | **[my addition] keep** — a late Road level; replaces ramps |

### 2.5 Economy and logistics (§3)

| Idea | Verdict | Note |
|---|---|---|
| Nothing teleports; buildings inside one yard ring share a store | **keep** — Frontier Foundry lesson | |
| Detection: outcrops / shallow (thumper) / deep (seismic or orbit) | **simplify** to **3 layers, 2 tools**: surface (any sight), shallow (**Survey thumper** building), deep (thumper's global level III, or an orbital ground-radar probe). No separate seismic array | |
| Outcrops small, run out in 20–40 min | **keep** — the owner's "limited quantity" | |
| Resource list (5 tiers, ~20 raws/refineds) | **simplify**: home world **8 raw** (timber, stone, copper ore, iron ore, coal, sand, sulphur, mana crystal) → **9 refined** (planks, stone block, copper bar, iron bar, steel, glass, concrete, powder, circuits) + **mana**. Oil, tin, quartz, clay, rare earth, rubber **cut**. One or two **exotics per planet** | fewer recipes, same chain depth |
| Hand camps → drills, global level per kind | **simplify** (1.2) | |
| Strip mine / quarry eating an area | **park** | the scar idea stays: a worked-out outcrop leaves cracked ground |
| Pumps, lava taps, mana springs | **cut** (no oil, no lava taps, mana comes from crystals) | |
| Depots + yard ring + dispatcher + lines, **no belts** | **keep** — right call | |
| Wants/offers per depot | **simplify** (1.8) | |
| Three jam lamps POWER / INPUT / OUTPUT | **keep** | Frontier Foundry lesson |
| First vehicles need no fuel; HQ starts nearly empty | **keep** | |
| Vehicle ladder (10 kinds) | **simplify** to the owner's list: **porters, cart** (era I), **truck** (era II — merges steam crawler), **train** (era III), **barge** (era III); rocket/lander/ferry in space. Airship, freight tube, mass driver **park** | the brief names cars, trains, boats |
| Trains: rails never attacked, plow through small/medium enemies, outrun everything, attackable only while standing | **keep** (with the beast cut) | |
| Rail tool refuses curves under 12 m radius and says why | **keep** | |
| Rivers are highways (home world always gets one long river/lake chain) | **keep** | |
| Escort posts on lines | **merge** into Patrol (a patrol drawn along a road/rail) | |
| Gun wagons, armoured cars | **simplify**: one **gun car** for trains (not needed often) and one **armoured truck** level on the global Truck upgrade (trucks shoot back at level III) | |
| Recipes + keep-in-stock orders | **keep** — Farhold lesson; default keep-in-stock on every producer | |
| Slag yard glowing at night | **simplify**: slag is a short-lived glowing rubble patch next to smelters, no yard to place | |
| Waste smoke and Noise from industry | **keep** | |
| **Power** | **simplify** to a per-base number (1.6) | |

### 2.6 The city (§4)

The owner wants to *"build a city"*. The brainstorm's town is a second sim (four worker classes, morale with seven
inputs, services with radii, festivals, shelters).

| Idea | Verdict | Note |
|---|---|---|
| Population grows with housing, food, water, safety | **keep** | |
| Migrants walk in from the map edge | **keep**, never attacked | |
| Crews per building | **simplify** to automatic jobs; a building without workers shows the INPUT lamp "no workers" | |
| 4 worker classes + school | **cut** | |
| Soldiers come out of population | **keep** | a lost squad is lost people |
| Morale needle (×0.6–×1.2 work speed) | **simplify**: inputs are **food, water, a Commons in reach, light at night, and raids inside the walls**. Five inputs, each shown as a lamp under the needle | |
| Housing ladder | **simplify** to one house + global level | |
| Food: field, fishery, greenhouse, hydroponics | **simplify** to **farm field** (burns) and **fishery** (on water). Greenhouse **park** | |
| Water: well, water tower, pump house | **simplify** to **well** | |
| Services: mess hall, clinic, school, tavern, quiet hall | **merge** into **one Commons** building with a radius | |
| Floodlights as safety | **keep** — also the night-sight tower |
| Shelters | **cut** (1.7) | |
| Festivals | **park** | |
| Smoke over homes lowers morale (zone without zoning) | **keep** — only cost of putting industry upwind | |
| Town size raises Noise | **keep** | |

### 2.7 Defence (§5)

| Idea | Verdict | Note |
|---|---|---|
| **The damage rule** (production, military, fighting units, travelling delivery vehicles; never roads/bridges/rails/depots/stations/houses) | **keep** — owner rule, PLAN §0 | trains: only while standing |
| Physics is not an enemy (your fire and spells can hurt your own things; never infrastructure) | **keep** | |
| HQ is a military building | **keep**, plus a lose rule the brainstorm forgot: **home HQ destroyed = game over** (Calm difficulty: it falls to 1 hit point and the base is "crippled" for a day instead) | |
| Nests on the map, stages 1–5, grow over time and with Noise/Glow, bud at stage 4 | **keep** | |
| Nest cores as research samples | **keep** | the reason to attack |
| **Noise and Glow** as two attractors on the THREAT filter | **keep** — top idea | computed per 4×4 block, cheap |
| Raids go for the loudest thing in range; path drawn 60–120 s ahead | **keep** | |
| Flow-field pathing, wade shallow water, go round cliffs, use roads, chew walls at the weakest section | **keep** — with one wall kind, "weakest" means "most damaged" | |
| Raid as a radio story | **keep** | |
| 6 wall tiers, fence vs full wall, ward wall | **cut** (owner change). One wall. **Wall levels I–V** global: I timber (burns), II stone (fireproof), III steel-banded (turrets can sit on walls), IV concrete (resists acid), V runed (slow self-repair, adds Glow). Repeatable ranks after V | the ladder's *ideas* survive as global levels |
| Own turrets fire over own walls | **keep** — TinyRTS lesson | |
| 12 tower kinds | **simplify** to **8**: watch post (I), bolt thrower (I), gun nest (II), mortar pit (II), flame projector (II), floodlight (II), arc mast (III), rail cannon (IV) — plus **ward pylon** and **shield emitter** (mana, era IV–V). Frost lance **cut**, mana lance **merge** into rail cannon's mana level | 10 total, each with global levels |
| Flame projector lights grass in front of the wall | **keep** — a good double edge you choose |
| Arc mast chains double through water | **keep** | |
| Units stationed, never steered | **keep** — owner rule; orders merged to **Post / Patrol / Response** (1.8) |
| Strike orders | **merge** into Post (a post on a nest) |
| Stances | **cut** |
| Roster of 10 | **simplify** to **7**: militia (I), riflemen (II), scouts (II, see far on patrol), mortar crew (III), steam walker (III), battlemage (IV, empowered), crystal golem (IV, empowered). Sappers **cut** (builders repair automatically); flamers **merge** into flame projector; hover tank **park** | |
| Unit upkeep from the local depot | **simplify**: units draw food from the base pool wherever they are; no ammo. Ammo is a chore | |
| Enemy families (8) | **simplify** to **5 built**: Skitterkin (home), Slagborn (volcanic), Rime stalkers (ice), Glowfeeders (crystal), Driftborn (stations, late). Tide crawlers, dune serpents, gale wisps **park**; other planets reuse a family with a harder tier and a new colour | |
| A rule breaker in every family | **keep** — but none of them stops a moving train | |

### 2.8 Spells and mana (§6)

| Idea | Verdict | Note |
|---|---|---|
| Mana chain crystal → harvester → shards → dissolver → raw → attunement → tamed → HQ by pipes | **simplify** to **crystal cluster → harvester → crystal shards (hauled like ore) → Mana refinery (in the HQ yard ring) → HQ store**. Two buildings, no pipes. The owner's "harvested by crystals and had to be processed" is satisfied by the refinery | |
| Crystals regrow on ley lines | **simplify**: clusters regrow if not fully harvested; no ley-line layer | |
| Starting cap 100, regen 0.5/s only up to 25% of cap | **keep** — the owner's "slowly regenerate but ultimately requires mana crystal" | |
| Batteries raise cap, explode when destroyed | **keep**; one battery kind + global level | |
| Spell tiers unlock by cap; tier marks engraved on the gauge | **keep** | owner: "unlock better spells" |
| Casting as a fire mission with travel time | **keep**, 3 steps (1.3) | |
| Spells need live sight | **keep** — smoke and night matter | |
| Projection range from the HQ + relay obelisks | **cut** range limit at home (map is small); **park** obelisks | |
| 16 spells | **simplify** to **10**: the owner's four — **Meteor, Shield bubble, Line of fire, Lightning** — plus **Sensor flare, Frost snap, Call rain, Stone ridge, Mend, Chain storm**, with **Comet** as the tier-4 set piece (11). Rift **merge** into Stone ridge; Molten pool, Recall the line **cut**; Gust and Gravity well **park** | each must touch the physics |
| Combos noticed by the teletype | **keep** — free | |
| Crystal crafting: lenses, mana cells, empowered units, crystal-engine trains, resonators | **simplify**: **crystal lens** (part for empowered units, ward pylon, Wall V) and **mana cell** (power source for buildings — the "magical energy source"). Resonator merged into mana cell; crystal-engine train **park** | |
| Mana per planet: colour + flavour, can't move mana directly | **simplify**: each planet's mana has a colour and **one** cheaper spell school. Mana itself never travels (owner: planet specific); mana cells are cargo and power, not mana | |
| Spills | **park** | a second front is fun, but it's a second fire system |

### 2.9 Research (§7)

| Idea | Verdict | Note |
|---|---|---|
| Calculator, punch cards, hopper, lamps, results by tube, crates for new machines | **keep**, smaller | |
| Research costs materials + **samples** (nest cores, planet soil) | **keep** — ties exploring and fighting into progress | |
| Printed wall chart tree | **keep** as one read-only "chart" drawer page | |
| 7 eras / ~120 nodes | **simplify** to 7 eras, **~60 unlock nodes** + global **upgrade levels** (walls, roads, bridges, rails, each tower kind, each producer kind, housing, batteries, trucks, trains) which are bought on the same Calculator. Most of the "120" were tiers the owner removed | |
| Era sample gates | **keep**, but every gate is reachable on the home world for eras I–IV | |
| Balloon station weather data gate for Rocketry | **cut** — gate is "a stage-4 nest core + a deep deposit" | |
| Repeatable research | **keep** — it *is* the global levels, continued past V | |

### 2.10 Space (§8)

| Idea | Verdict | Note |
|---|---|---|
| Launch pad, rocket built in stages | **simplify**: one Rocket building that fills with parts and fuel (progress bar on the card); launches carry cargo or a satellite | |
| Two-key launch interlock + nixie countdown + room shake | **keep** — physical-machine moment |
| Launch is loud (Noise) | **keep** | |
| Stripe mapper with real ground tracks, planet turning, inclination knob, polar full in ~3 days | **keep** — owner's exact request | |
| 7 probe kinds | **simplify** to **5**: Surface (terrain, outcrops, water, lava — daylight only), Metal, Crystal, Deep radar, Life (nests). Weather and ice/liquid probes **cut** (surface covers water) | owner: "different probes detect different material" |
| Scan first, then choose a landing site | **keep** | |
| First system 6–10 planets from `universe/` | **keep** | owner rule |
| Further out = harder + richer; home is gentlest | **keep** | |
| Travel time depends on live positions; "best departure" lamp | **keep** | gentle windows |
| One station per planet built from rocket deliveries | **keep** — owner rule; simplified to **core + 3 modules** (dock, warehouse, yard) | |
| Ferries between stations as Dispatch Board lines | **keep** | owner: reusable automated transport |
| Ground base → rocket → station → ferry → station → lander → base, all real trips | **keep** | |
| Driftborn attack stations; space fights only near stations | **keep** | |
| Landing kit (pod, builders, materials, food, small full battery) | **keep** — owner rule | |
| Channel selector to switch bases with a CRT roll | **keep** | |
| Off-screen bases on a summary sim, 60 s warning | **keep** — and prototype it early (PLAN M13) | |
| Warp drive at a station's yard; nearby star system | **keep** | |
| Trade routes between systems | **keep** — owner rule | |
| Neutral traders + credits | **park** | a currency is a whole extra balance problem |

### 2.11 Progression, juice and extras (§9–§11)

| Idea | Verdict | Note |
|---|---|---|
| Look → claim → move → make → defend → reach further | **keep** | the loop |
| Incremental spine | **keep**, now the global levels + repeatables | |
| Commander's daily report | **keep** — nearly free | |
| Commendations with permanent bonuses | **simplify** to medals that are cosmetic (no hidden power creep) | |
| Lodestar beacon story goal, then endless | **keep** | |
| Difficulty presets + Peaceful | **keep** | |
| Explosions, chain counter, hit-stop | **keep** | |
| Bunker shakes, dust, scope roll when HQ is hit | **keep** | |
| Machines knocked out one at a time by HQ damage | **cut** — punishing you by taking your controls away, while under attack, is anti-fun. The look (static, cracks) stays | |
| Red emergency light on power loss | **simplify**: plays when power draw > supply at the HQ base | |
| Synth sound, loudness rules | **keep** — `sfx/` | |
| Little delights list | **keep** | |
| Photo mode | **keep**, late (M16) | |
| Sensors see differently (optical blinded by smoke/night; radar/thermal see through) | **simplify**: **one sensor rule** — sight is blocked by smoke/steam/ash and by darkness outside lit areas. A **Radar mast** (era II) shows enemies as blips (no colour, no detail) through smoke and dark. Thermal **cut** | still the best rule in the game: fire is a blindfold |
| `window.gameEye.state()`, plain language, tests | **keep** | |

---

## 3. Additions of my own that survived

1. **Time dial** — pause and 1×/2×/4× on a heavy rotary (solo games need it; the bot uses it too).
2. **Global upgrade levels as the one progression rule** for every built kind (the owner's wall/road change, applied
   consistently).
3. **Road stairs** over cliffs as a road upgrade, replacing ramps and breaches.
4. **High Command directives are the objective list and the tutorial.** One envelope at a time.
5. **Power as one needle per base**, mana cells as the magic alternative.
6. **Undo on the drawer edge** instead of a confirm toggle for drawing.
7. **Calm difficulty never ends the game on an HQ hit** — the base is crippled for a day instead.
8. **One sensor rule + radar blips** in place of three sensor types.

## 4. What the planner must never forget (the risks, re-ranked)

1. **Phone frame time with lighting.** The light pass (blurred light buffer + bloom + CRT) is the expensive bit, not
   the sim. M1 must prove 30 fps on a phone with a quality knob before anything else is built.
2. **The summary sim.** Off-screen bases must keep producing and must be raidable, without the full cell sim.
   Prototype it at the start of the interplanetary work, not the end.
3. **The balance bot.** Frontier Foundry's bot never reached a rocket. Build it with the economy (M3) and keep "time
   to rocket" and "time to beacon" as tests that must pass.
4. **The bunker UI being slower than menus.** Every control gets a direct mapping, and a test measures "draw a 40 m
   wall with a gate" in actions.
5. **Determinism across a worker.** Integer cells, ordered updates, and a same-seed-twice hash test from M1.
