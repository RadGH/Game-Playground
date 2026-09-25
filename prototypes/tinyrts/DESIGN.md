# Tiny RTS — Design Document (v2, after the roast)

Working title: **Tiny RTS**. Independent project (Radley Sustaire). Sandbox.
v1 of this doc was reviewed by a separate agent; its critique is in [`docs/ROAST.md`](docs/ROAST.md).
§20 lists every change made in response, and §21 is the written backlog of what was cut.

A side-view, physics-driven real-time strategy / defense game drawn in chunky pixels. You found a
glowing outpost on a strip of alien rock, mine crystal out of the ground, raise walls a pixel at a
time, put laser turrets on them, and hold against waves of geometric void-creatures, or against a
rival AI commander building its own fort on the far side of the map. Every wall, hill and building
is made of cells: shots chip them away, spans that stick out too far break off and fall, rubble
piles up in the trenches, and you can dig the ground out from under things on purpose.

Inspirations (feel only; **no names, art, units or text from any of them**): the production and
power pressure of factory builders, the ammo-and-power tension of tower-defense factory hybrids,
the hero-plus-small-army control of classic hero RTS games, and falling-sand destructible worlds.

---

## 1. Pillars

1. **Everything is made of pixels, and pixels obey gravity.** Destruction is both the spectacle and
   a tool: undermine a ledge onto the swarm, and watch for enemies undermining yours.
2. **Build the line, then hold the line.** Short build phases, loud defense phases.
3. **Readable chaos.** Abstract shapes, strong faction colors, glowing beams on dark space.
4. **Keyboard and mouse first.** Every action has a hotkey whose position matches the on-screen grid.
5. **Short sessions.** A mission is 10–20 minutes.

---

## 2. The World

### 2.1 View and scale
- Side view, gravity pulls down. The map is a long horizontal strip with depth underground.
- **Cell** = smallest unit of the world. Drawn as an **integer** block of screen pixels (the
  *pixel scale*).
- The canvas fills the window. Pixel scale auto = `max(2, floor(windowHeight / 200))`
  (720p → 3, 900p → 4, 1080p → 5, 1440p → 7). Mouse wheel steps the scale through whole numbers
  (2 … 8), so zoom never blurs. The visible cell area is `window / scale`.
- The HUD is slim and overlays the canvas: a 28 px top bar and a 116 px bottom panel. The camera
  lets you scroll 116 px worth of cells past the bottom edge so nothing is ever stuck under the HUD.
- HP bars, text, range circles and placement info are drawn on the **screen-resolution** canvas
  after the scaled world, so they stay crisp.
- Map sizes (cells): Small **768 × 256**, Medium **1024 × 288**, Large **1280 × 320**.
- Units are 5–12 cells tall. Buildings are 8–24 cells wide.
- Turret ranges are capped at ~170 cells (≈ 45 % of a 1280 px-wide view at scale 3). Anything
  firing at a target off-screen shows an edge arrow.

### 2.2 Materials (cell types)
Each cell stores material (Uint8), HP (Uint8), team (Uint8), aux (Uint8), owner (Uint16).
Data: `data/materials.json`.

| id | Material | Behavior | HP | Notes |
|---|---|---|---|---|
| 0 | Empty | — | — | |
| 1 | Bedrock | static, indestructible | ∞ | Floor rows and underground map edges |
| 2 | Rock | static | 30 | Terrain body. Can be dug. |
| 3 | Dust | loose | 5 | Surface skin; falls and piles |
| 4 | Crystal ore | static | 40 | Mined → Crystal |
| 5 | Ferrite ore | static | 50 | Mined → Ferrite |
| 6 | Panel | structural, span 10 | 20 | Cheap wall |
| 7 | Plate | structural, span 18 | 60 | Armored wall |
| 8 | Prism | structural, span 8 | 15 | **Reflects enemy lasers back at the shooter** (your own pass through), weak to kinetic/blast |
| 9 | Foam | sticky, span 3 | 8 | Cheap plug. Anchors by touching terrain on any side, weak to lasers and acid |
| 11 | Rubble | loose | 3 | What broken built cells become |
| 12 | Slag | loose, glowing | 4 | Left by blasts; cools into Rubble after 6 s (visual only) |
| 13 | Footprint | building-owned | — | Damage goes to the owning building |

(Gate is a **building** now, §5.1.)

### 2.3 Cell physics
- **Loose** cells (Dust, Rubble, Slag) fall: down, else diagonally, alternating scan direction
  each tick so piles don't lean. Only awake 32 × 32 chunks step; a chunk sleeps after a still tick.
- **Support rule for built cells** (the rule shown in-game):
  > *Stacking straight up is free. Every cell reaching sideways or hanging below counts one step
  > from the nearest cell that stands on the ground (terrain, rubble or a building) or presses
  > against terrain from the side. Past the material's span, it breaks off.*
  Implemented as a 0-1 breadth-first search over the connected structure, triggered only by
  changes, with a per-tick cell budget. Paint preview draws cells that would break in red.
- **Clumps**: unsupported cells break off as a rigid block that falls straight down (no rotation),
  collides using a per-column bottom profile, and on landing turns partly into Rubble (more the
  farther it fell). Landed cells are re-checked once.
- **Crush damage**: a landing clump deals `cells × fall distance × 0.05` damage to units and
  buildings under it. Collapsing a ledge onto a swarm is a real tactic.
- **Buildings** rest on anything solid, including your walls. Every half second a building counts
  solid cells under its bottom row; below 40 % it **falls** as an entity and takes fall damage.
  So a turret on top of a wall drops when the wall is chewed out from under it.
  **The Core never falls** (deep foundation).
- **Debris**: shots and blasts throw particles; at most 60 of them per second turn into real
  Rubble cells where they land. The rest fade.

### 2.4 Damage types and friendly fire
| Type | Sources | Notes |
|---|---|---|
| **Laser** | Pulse, Lance, Trooper, Lancer, Skimmer, Commander, Core, Glare (Hollow) | Hitscan. **Reflects** off Prism cells and off the *front* of Carapace. Up to 3 bounces. |
| **Kinetic** | Railgun, Siege slugs | Fast slug that **pierces** enemies and carves enemy/neutral cells until its damage pool runs out. |
| **Blast** | Mortar, Siege Walker, bombs, Reactor death, Orbital Lance | Radius damage, crater, some Slag, knockback, screen shake. |
| **Arc** | Arc Coil | Chains between up to 5 targets; no terrain damage. |
| **Acid** | Spitter, Gnawer | Damage over time to built cells it lands on. |

- **Your own shots pass through your own built cells** (walls, footprints) and never hurt your
  own units or buildings. So turrets behind or on walls work.
- **Blasts do carve your own terrain and walls** if they land there (Mortars have a minimum range).
- Reflected beams keep their owner: they never hurt the owner's things.

### 2.5 Terrain generation
Seeded; same seed and options give the same map.
1. Surface line from layered noise; style = Rolling / Canyons (terraces + chasms) / Islands
   (floating masses on pillars) / Flat.
2. Flatten a **home pad** per base and (Versus) a **front pad** in front of each base, with
   pre-validated **build slots** for the AI (§10.2).
3. Rock body with a 2–5 cell Dust skin.
4. Worm-tunnel caves, never under home pads.
5. Ore: guaranteed 2 Crystal veins + 1 Ferrite vein near each base; scattered ore elsewhere,
   Ferrite richer toward the middle and deeper.
6. Bedrock floor and underground side walls.
7. Campaign presets (`data/maps.json`) add authored features: mesas, bridges, chasms, nests.

### 2.6 Backdrop
Near-black space gradient, two parallax star layers, slow abstract nebula blobs, a ringed planet
on the horizon. Beams and particles draw additively for glow.

---

## 3. Factions

| Faction | Who | Color | Shape language |
|---|---|---|---|
| **Lumen** | You | cyan / white | Clean rectangles, diamond core |
| **Umbra** | Rival AI (Versus + 2 campaign missions) | amber / red | Same roster, notched angles |
| **The Hollow** | Wave creatures | magenta / violet | Triangles, jagged polygons, pulsing eyes |

Umbra plays by exactly the same rules and roster as Lumen.

---

## 4. Economy

### 4.1 Resources
| Resource | Source | Used for |
|---|---|---|
| **Crystal** (cyan) | Core trickle **+2/s**; Drills on Crystal ore | Almost everything |
| **Ferrite** (orange) | Drills on Ferrite ore | Plate, kinetic ammo, machines |
| **Alloy** (violet) | Refinery: 2 C + 1 F + power → 1 A every 3 s | Advanced turrets/units, research |
| **Power** (yellow) | Core +10, Solar +3, Reactor +20; Battery stores 300 | Drills, factories, laser fire |

- Crystal, Ferrite and Alloy are banked in the Core (no cap).
- **Power is a rate** (units per second). Every building has a draw; laser turrets draw only
  while firing. If draw > supply, batteries drain; when they're empty the grid **browns out**: all
  consumers run at `supply / draw` speed. The top bar shows `+net`, battery level, and turns amber/red.

### 4.2 Link network
- Buildings work only when **linked**: within 90 cells of the Core or 60 of a linked **Relay**.
- A link beam needs **line of sight through terrain** (Rock/Dust/ore block it; built cells and
  buildings don't). Tunnel with the Dig tool or put a Relay up high to route around hills.
- Killing or burying a Relay unlinks everything behind it (broken-link icon; they stop).
- **L** toggles the link overlay; it's always shown while placing.

### 4.3 Ammo
Kinetic weapons spend **Ferrite** per shot from the Core bank; lasers spend **power**.
Out of Ferrite = Mortars and Railguns go quiet; brown-out = lasers fire slower.

### 4.4 Mining is digging
A Drill mines ore cells in a **20 × 48 area below it**, one cell every 1.4 s, 4 resource per cell
(≈ 2 /s). Ore cells visibly vanish, which can hollow out the ground under things. An exhausted drill
says so; salvaging it refunds 100 %.

---

## 5. Buildings (`data/buildings.json`)

Costs C/F/A. Power: + makes, − draws per second. Size in cells (w × h). Build time is at 1 drone.

### 5.1 Core, economy, production
| Building | Size | Cost | Power | HP | Build | Role |
|---|---|---|---|---|---|---|
| **Core** | 24×20 | — | +10 | 3000 | — | Base. Lose it = lose. Builds Drones. Link r 90. Laser zap 6 dmg ×1/s, r 60. Never falls. |
| **Drill** | 12×10 | 40 C | −2 | 300 | 8 s | Mines ore below (§4.4). |
| **Solar Array** | 12×6 | 30 C | +3 | 150 | 6 s | Needs sky: output × fraction of columns open to the sky. |
| **Reactor** | 16×14 | 150 C 80 F 20 A | +20 | 600 | 25 s | **Explodes** (blast r 30, 400 dmg) when destroyed. |
| **Battery** | 8×8 | 40 C 20 F | stores 300 | 250 | 6 s | Buffer. |
| **Relay** | 4×14 | 20 C | — | 150 | 4 s | Extends link network 60. |
| **Refinery** | 16×12 | 80 C 40 F | −5 | 450 | 15 s | Makes Alloy. On/off. |
| **Gate** | 4×16 | 20 C | — | 400 | 5 s | Solid to enemies, open to your units. |
| **Fabricator** | 20×14 | 120 C 60 F | −4 | 700 | 20 s | Trains army units, queue 5, rally point. |
| **Research Lab** | 16×12 | 100 C 60 F | −3 | 500 | 15 s | One research at a time (§8). |

### 5.2 Turrets
| Turret | Size | Cost | Fire | Range | Damage | Ammo | Notes |
|---|---|---|---|---|---|---|---|
| **Pulse** | 8×8 | 50 C | 2 / s | 90 | Laser 8 | 1 power/shot | All-rounder, air + ground. |
| **Lance** | 10×12 | 90 C 10 A | beam | 140 | Laser 24 /s, pierces | 5 power/s | Ground. |
| **Mortar** | 12×10 | 80 C 30 F | 1 / 2.5 s | 40–160 | Blast 35, r 10 | 1 F/shot | Arcs over walls, carves. Ground. |
| **Railgun** | 14×8 | 100 C 60 F 20 A | 1 / 3 s | 170 | Kinetic pool 150 | 2 F/shot | Pierces enemies + enemy cells. Ignores reflection. |
| **Flak** | 10×8 | 70 C 30 F | burst 4 / 1 s | 120 | 5 ×4 + r 4 splash | 1 F/burst | Air only; also shoots down acid globs and bombs. |
| **Arc Coil** | 8×12 | 90 C 15 A | 1 / s | 60 | Arc 20, chains 5 | 4 power/zap | Crowds, air + ground. |

Targeting modes (per turret): **Nearest** (default), **Strongest**, **Weakest**, **Air first**,
**Closest to Core**. Lasers need a clear line (own cells don't block). Mortars arc.

### 5.3 Walls (painted)
Painted with a brush (2 / 4 / 6 / 8). Costs per cell:
**Panel** 1 C per 2 cells · **Plate** 1 C + 1 F per 3 cells · **Prism** 1 C per 2 cells + 1 A per 10 ·
**Foam** 1 C per 4 cells.
- Painting makes a **blueprint**; drones build it bottom-up (12 cells/s per drone).
- The blueprint remembers the wall. Destroyed cells show as dim outlines; drones rebuild them
  **between waves** by default (setting: also during waves), paying the cell cost again.
- Paint only into empty cells or over Dust/Rubble (replaced). Rock needs the Dig tool first.
- **Salvage** removes walls/blueprint (built cells refund 50 %, unbuilt 100 %).

### 5.4 Dig tool
Paint a dig area (same brush). Drones clear Rock/Dust/ore there at 6 cells/s. Rock gives nothing,
ore cells give their resource. Bedrock can't be dug. Used for tunnels for links and units,
moats (enemies climb out, but slowly), and **undermining** (dig under a ledge to drop it).

### 5.5 Placement rules
- Footprint must be free of solid cells (Dust/Rubble get pushed aside); ≥ 80 % of the bottom row on
  solid cells (**terrain, walls or rubble**). So turrets can go on top of walls.
- Must be linked (ghost shows the link beam, red if none).
- 1-cell gap between buildings. Walls may touch anything.
- Ghost shows footprint (green/red + reason), range, drill ore count, solar sky %, link beam, cost.

---

## 6. Units

### 6.1 Movement
- **Walkers** (Lumen/Umbra): gravity, climb steps ≤ 3 cells, jump if they have it, fall damage
  from > 30 cells. They use **A\*** over a coarse 4 × 4 nav grid (standable nodes with 2-node
  clearance; walk/step/jump/drop edges), rebuilt lazily per dirty region. Own Gates are open.
- **Hollow walkers** use a simpler **crawl rule**: move toward the target; they cling to and climb
  *natural terrain* at ½ speed (pits slow them, never trap them) but **can't climb built cells**:
  blocked by a wall, they chew the cells in front of them (3 × 3 bite; Gnawers 5 × 5). This
  undermines walls from the bottom naturally. Stuck > 6 s → chew whatever is in the way, rock included.
- **Flyers**: hover at cruise height, steer around solids.
- **Borers**: move through terrain, eating a 5-cell tunnel; they surface under their target. A
  tremor line shows their path (also on the minimap).
- **Targets**: Hollow go for the nearest Lumen/Umbra building on their side of travel and
  ultimately the Core; they attack units that attack them or block them.

### 6.2 Lumen / Umbra roster
| Unit | From | Cost | Pop | HP | Speed | Weapon | Notes |
|---|---|---|---|---|---|---|---|
| **Drone** | Core | 30 C | 0 (max 10) | 60 | fly 40 | zap laser 3, r 30 | Builds, digs, repairs, salvages. |
| **Trooper** | Fabricator | 40 C 10 F | 1 | 90 | 16, jump 8 | laser 6 ×1.5/s, r 60 | Line infantry. |
| **Lancer** | Fabricator | 60 C 10 A | 2 | 70 | 12 | beam 16 /s, r 100, pierce | Fragile, reflects off Prism. |
| **Skimmer** | Fabricator | 50 C 20 F | 1 | 70 | fly 45 | laser 4 ×2/s, r 60, air first | Anti-air, raider. |
| **Siege Walker** | Fabricator | 120 C 60 F 20 A | 3 | 300 | 8 | mortar blast 30, r 40–150 | **Deploy**: range 190, can't move. |
| **Commander** | Core, free | — | 0 | 600 | 18, jump 10 | laser 12 ×2/s, r 70 | Hero (§7). Respawns 30 s after death. |

Pop cap 30 (+10 from research). Drones don't count against pop.

### 6.3 The Hollow (`data/enemies.json`)
Speeds in cells/s. Cost = director budget points.
| Enemy | HP | Speed | Attack | Cost | Notes / counter |
|---|---|---|---|---|---|
| **Mite** | 20 | 22 | bite 3 (units 4) | 1 | Swarm. Arc Coil, Pulse. |
| **Gnawer** | 90 | 12 | acid bite 8, ×3 vs built, 5×5 | 4 | Chews the weakest wall. |
| **Spitter** | 60 | 10 | acid lob 10, r 110 | 4 | Lobs over walls. Mortar or Flak (shoots globs). |
| **Glare** | 70 | 10 | laser beam 10 /s, r 100 | 5 | **Hollow laser**: Prism walls bounce it back. |
| **Wisp** | 35 | 30, fly | dive 15 | 3 | Flak, Skimmers, Pulse. |
| **Splitter** | 90 | 14 | bite 8 | 5 | Splits into 4 Mites. |
| **Carapace** | 240 | 8 | bite 20 | 10 | **Front reflects lasers.** Hit from above/behind, or kinetic/blast. |
| **Borer** | 120 | 8, burrow | bite 10 | 8 | Tunnels under walls. |
| **Bombard** | 160 | 10, fly | bomb blast 25, r 12 | 12 | Craters. Flak shoots bombs. |
| **Titan** (boss) | 4000 | 5 | stomp blast 60 r 25 | 120 | Too tall for low walls; carves as it walks. |
| **Hive Mother** (boss) | 3000 | 6, fly | spawns 2 Wisps / 4 s, acid rain | 120 | |
| **Nest** (structure) | 1500 | — | spawns a trickle | — | Campaign objective. |

---

## 7. The Commander
One per player, free, at the Core from the start of every mission (campaign mission 1 onward).
Respawns at the Core 30 s after death. No XP; abilities are fixed:

| Key | Ability | Effect | Cooldown |
|---|---|---|---|
| **Q** | Overcharge | Your turrets within 50 fire +50 % faster for 8 s | 30 s |
| **W** | Blink | Teleport to the cursor within 80 (needs room) | 12 s |
| **E** | Orbital Lance | After 2 s, a sky beam hits a 12-wide column: 500 dmg, carves up to **40 cells** deep. Can't target within 60 of any Core. | 90 s |

---

## 8. Research (`data/research.json`)
One Research Lab needed; one project at a time per lab. 8 projects, no tiers:
Hardened Plate (+30 % wall HP) · Efficient Drills (+30 % mining) · Capacitors (battery +100 %) ·
Focused Lenses (+15 % laser damage) · Rapid Assembly (drones +40 % build) · Refraction
(enemy lasers reflected by your Prism hit twice as hard) · Supply Lattice (+10 pop) · Deep Core (Core HP +50 %, link radius +20 %).
Each costs 60–150 C/F/A and 30–60 s.

---

## 9. Game Modes

### 9.1 Campaign — "Signal Line" (8 missions, authored waves)
The Lumen are laying a line of beacons across a dead world; the Hollow wake up to the light; an Umbra
commander wants the line for itself.

| # | Mission | Teaches | Objective | Star 2 / Star 3 |
|---|---|---|---|---|
| 0 | **First Light** (tutorial) | camera, drones, Drill, Relay, Panel painting, Pulse, Mites | Survive 4 waves | Core undamaged / < 8 min |
| 1 | **Deep Vein** | Ferrite, Plate, Mortar, Commander, Spitters, Gnawers | Survive 6 waves | no building lost / Commander never dies |
| 2 | **Extend the Line** | Relays across hostile ground, Wisps, Flak | Link 3 beacons (keep them linked 60 s) | all beacons alive / < 12 min |
| 3 | **Undertow** | Dig tool, caves, Borers, Foam plugs, Railgun | Survive 8 waves | no Borer surfaces inside walls / no Core damage |
| 4 | **Demolition** | Fabricator, army orders, Siege Walker, undermining | Destroy 3 Nests (one sits under a mesa you can drop) | Nest killed by collapse / no units lost |
| 5 | **Glass Garden** | Glares, Prism reflection, Lance, Carapace fronts, research | Hold the bridge 10 waves (fort on a span) + Titan | bridge never collapses / no Core damage |
| 6 | **Umbra** | Rival AI (easy) | Destroy the Umbra Core | < 15 min / Core > 50 % |
| 7 | **Two Fronts** | Everything | Destroy the Umbra Core (normal) while waves hit both sides; Hive Mother | < 20 min / Core > 50 % |

Progress, stars and best times persist. Missions unlock in order. Each lists its available tech.
Campaign difficulty: Story (0.6× waves) / Normal / Hard (1.4×).

### 9.2 Free Play — Siege
Director waves vs your base. Options: map size, seed (random button / type a word), terrain style,
difficulty (Easy / Normal / Hard / Brutal), waves (10 / 20 / 30 / Endless), starting resources
(Low / Normal / High), wave sides (Right / Both / Right + Underground), build-phase length
(Short / Normal / Long). Everything unlocked.

### 9.3 Free Play — Versus
You vs one Umbra AI on a mirrored map. Options: map size, seed, terrain style, AI difficulty
(Easy / Normal / Hard / Brutal), AI style (Bastion: walls + artillery, late push; Swarm: early
infantry pressure), starting resources. Win by destroying the enemy Core.

---

## 10. AI

### 10.1 Director (Hollow waves, Free Play)
- Budget per wave: authored table for waves 1–10 `[8, 12, 18, 24, 32, 40, 50, 62, 75, 90]`, then
  ×1.12 per wave; × difficulty (0.7 / 1 / 1.35 / 1.7).
- It **reads your defense** before each wave: laser share of DPS → Carapace; thin walls on a lane →
  Gnawers; lots of walls → Spitters/Borers/Bombards; weak anti-air → Wisps/Bombards; many Prism
  cells → fewer Glares. 50 % counter-picks, 50 % weighted random, within unlock gates (a type
  appears only from its first-wave number on).
- Lanes: right surface; left surface (if enabled); sky; underground (Borers).
- Every 5th wave is a **surge** (+40 %), every 10th has a boss.
- Preview panel shows composition and lanes 20 s ahead (hidden on Brutal).
- Build phase: 75 s before wave 1, 40 s between waves (Short 25 / Long 60). **Call early**
  (Shift+N) pays 1 C per second skipped.

### 10.2 Rival AI (Umbra)
Issues the same commands a player can. No cheating on information except where noted.
- **Build slots**: terrain gen flattens a home pad and front pad and emits validated slots
  (`econ`, `turret`, `wall`, `factory`) with exact positions. The AI fills them from a
  **build order** (`data/ai-templates.json`) per style, so it never builds nonsense on odd terrain.
- **Economy**: drills on ore slots, keeps power ≥ +10 %, refinery once Ferrite > 150.
- **Reactive rules**: rebuild lost walls/drills; add Flak after seeing your flyers; pull the army
  home if the Core or front takes damage.
- **Army**: trains to a style mix; **timing pushes** when army value > threshold (the threshold
  falls over time); retreats units under 30 % HP; Siege Walkers deploy at max range against your
  wall; the Commander joins pushes and uses Orbital Lance on your wall.
- **Visible intent**: alerts like "Umbra is massing an army" and "Umbra Siege Walkers deploying".
- Difficulty = income multiplier (0.8 / 1 / 1.15 / 1.35) + reaction delay (4 / 2 / 1 / 0.5 s) +
  build-order pace + push threshold.

---

## 11. Screens & Menus (every one)

DOM overlays styled as glowing terminal panels, pixel font **Silkscreen** (Google Fonts) with a
`monospace` fallback. Keyboard navigable (↑↓ / Enter / Esc) and clickable. Buttons blur after a
click (so Space/Enter never re-press them) and have `tabindex=-1` in game.

### 11.1 Boot
Logo pulse and a "Click to start" gate (unlocks audio), then the Title.

### 11.2 Title
Backdrop: slow parallax space with a small, live, simulated skirmish (attract mode, if performance
allows — see backlog). Buttons: **Continue** (if a suspended game exists) · **Campaign** · **Free
Play** · **How to Play** · **Settings** · **Credits**. Version bottom-right. Fullscreen button.

### 11.3 Campaign map
A horizontal **signal line** of 8 nodes lighting up as you progress. Selecting a node shows: name,
blurb, objective, star conditions with earned stars, best time, new tech. **Launch** · **Back**.
Difficulty selector (Story / Normal / Hard).

### 11.4 Mission briefing
Briefing text, objectives, new tech cards (icon, name, one-line use), new enemy intel. **Begin** ·
**Back**.

### 11.5 Free Play setup
Tabs **Siege** | **Versus**. Segmented pickers for the options in §9.2/9.3, a live terrain preview
that regenerates on seed/style/size change, **Random seed** button, seed text field. **Start** ·
**Back**. Last settings remembered.

### 11.6 In-game HUD
```
┌ TOP BAR (28 px) ───────────────────────────────────────────────────────────────────────┐
│ ◆ 340 +6/s  ▲ 80 +2/s  ⬢ 12  ⚡ +8 [bat ███░ 220/300]  Pop 14/30 │ WAVE 4/10 · 0:32 [Call early +32] │ ×1 ⏸ ☰ │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ alerts (top-left, click to jump)                                  wave preview (top-right) │
│ objectives (left)                                                                      │
│                                   GAME VIEW                                            │
├ BOTTOM PANEL (116 px) ─────────────────────────────────────────────────────────────────┤
│ MINIMAP (whole map strip) │ SELECTION (portrait, HP, status, queue/targeting) │ CARD 4×3 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
- **Top bar**: resources + income (hover = breakdown), power net + battery bar, pop, wave number +
  timer, Call early button, speed (Free Play), pause, menu.
- **Minimap**: terrain silhouette + buildings + units + enemies + lane arrows + Borer tremors.
  Click/drag moves the camera.
- **Selection panel**: single = portrait, name, HP, stats, status flags (Unlinked, Brown-out,
  Depleted, Falling), context (production queue with cancel, research progress, turret targeting
  mode, drill ore left, solar sky %). Multi = up to 24 icons with HP; click = select that one;
  Shift-click = remove; double-click = select that type.
- **Command card**: 4 × 3 grid, each button shows icon, hotkey letter (from the real keyboard
  layout), cost; tooltip on hover (name, cost, power, description, hotkey). Disabled buttons say why.
- **Alerts**: up to 5 toasts (under attack, building lost, wall breached, relay lost, brown-out, ore
  depleted, research done, unit trained, wave incoming, Umbra massing). Click → jump. **Space**
  jumps to the latest.
- **Objective tracker**, **wave preview**.
- **Screen-res overlays**: HP bars (on damage, or all while **Alt** is held), damage numbers
  (setting), build progress, broken-link icons, rally flags, range circles, placement ghost info,
  off-screen target arrows.

### 11.7 Pause menu (Esc)
Dimmed, paused. **Resume** · **Settings** · **How to Play** · **Restart** (confirm) · **Save & Quit**
· **Quit to Title** (confirm).

### 11.8 Settings (tabs)
- **Audio**: Master, Music, SFX sliders; mute when window loses focus.
- **Video**: pixel scale (Auto / 2–8), screen shake (0–100 %), damage numbers, particle amount
  (Low / Med / High), show FPS, high-contrast palette.
- **Gameplay**: edge panning on/off + speed, rebuild walls during waves (off/on), pause when window
  loses focus, default game speed.
- **Controls**: a read-only list of all hotkeys (rebinding is in the backlog).
- **Data**: reset campaign progress (confirm), delete suspended game.

### 11.9 How to Play
Paged panels: Camera · Selecting & orders · Building, walls & digging · Economy & links · Physics
(support rule, collapse, crushing) · Turrets & damage types · Units & Commander · Waves & AI ·
**Field Guide** (every building, unit and Hollow creature with stats, generated from the data;
Hollow entries appear once met).

### 11.10 Results (Victory / Defeat)
Banner, stars with which conditions were met, time, and stats: enemies killed by type, cells
destroyed, cells rebuilt, resources mined/spent, units lost, damage by turret type (bar chart).
**Continue** · **Retry** · **Title** (Defeat: **Retry** · **Title**).

### 11.11 Credits
Author (Radley Sustaire), font credit, "made with Claude Code".

### 11.12 Small-screen / touch notice
Under 900 px wide or touch-only: menus work, a banner explains the game needs keyboard + mouse,
"Play anyway".

---

## 12. Controls & Hotkeys (bound by physical key position, `event.code`)

The **4 × 3 command card** maps to the keys **Q W E R / A S D F / Z X C V**. The letter printed on
each button is the key on *your* keyboard layout.

### 12.1 Camera
| Input | Action |
|---|---|
| **Arrow keys** (Shift = fast) | Pan |
| Mouse at screen edge | Edge pan (setting) |
| **Middle-drag** | Drag camera |
| **Mouse wheel** | Zoom (whole-number pixel scale) |
| **Home** | Jump to Core |
| **Space** | Jump to latest alert |
| Minimap click/drag | Move camera |

### 12.2 Selection
| Input | Action |
|---|---|
| **LMB** / **LMB drag** | Select / box select (units preferred over buildings) |
| **Shift+LMB** | Add/remove from selection |
| **Double-click** | Select all of that type on screen |
| **Shift+1…0** (or Ctrl+1…0 where the browser allows) | Assign control group |
| **1…0** | Select group; press twice = center camera |
| **Tab** | Cycle subgroup type in a mixed selection |
| **`** (key left of 1) | Select idle drone (repeat = next) |
| **Ctrl+A**… not used. **Shift+`** | Select all army units |
| **Esc** | Cancel mode → close sub-card → clear selection → pause menu (in that order) |

### 12.3 Unit card (any army unit or Commander selected)
| Key | Action |
|---|---|
| **RMB** | Smart order: move / attack target / drones: build-repair |
| **A** then click | Attack-move |
| **S** | Stop |
| **D** | Hold position |
| **F** then click | Patrol |
| **Q** | Siege Walker: Deploy/Undeploy · Commander: Overcharge |
| **W** | Commander: Blink (click target) |
| **E** | Commander: Orbital Lance (click target) |
| **Shift** + order | Queue it |

### 12.4 Build card (nothing selected, or only drones selected, or **B** from anywhere)
| Key | Category | Sub-card |
|---|---|---|
| **Q** | Walls | Q Panel · W Plate · E Prism · R Foam |
| **W** | Turrets | Q Pulse · W Lance · E Mortar · R Railgun · A Flak · S Arc Coil |
| **E** | Economy | Q Drill · W Solar · E Reactor · R Battery · A Relay · S Refinery |
| **R** | Base | Q Fabricator · W Research Lab · E Gate |
| **Z** | Dig | paint dig area |
| **X** | Salvage | drag a box to salvage (refund 50 %, unbuilt 100 %) |
| **V** | Repeat last build | |

Example: build a Pulse Turret = **W, Q**, click. Paint Plate = **Q, W**, drag.

Placement mode:
| Input | Action |
|---|---|
| **LMB** (drag for walls/dig) | Place / paint |
| **Shift** held | Walls: lock to a straight line. Buildings: stay in placement mode after placing |
| **RMB / Esc** | Cancel |
| **[ / ]** | Brush size |
| **Ctrl+Z** | Undo last placement if not started (full refund) |

### 12.5 Building card (one building type selected)
| Building | Keys |
|---|---|
| Core | **Q** Build Drone · **V** Set rally |
| Fabricator | **Q** Trooper · **W** Lancer · **E** Skimmer · **R** Siege Walker · **V** Set rally |
| Research Lab | **Q W E R A S D F** = the 8 projects |
| Turret | **Q** Nearest · **W** Strongest · **E** Weakest · **R** Air first · **A** Closest to Core |
| Drill / Refinery / Solar | **Q** On/Off |
| Any (except Core) | **X** Salvage (press twice) |

### 12.6 Global
| Key | Action |
|---|---|
| **Esc** | Cancel chain / pause menu |
| **P** or **Pause** | Pause toggle (always; never an order) |
| **Shift+N** | Call next wave early |
| **L** | Link overlay |
| **G** | Range overlay for all turrets |
| **Alt** (hold) | Show all HP bars |
| **+ / −** | Game speed ×0.5 / ×1 / ×2 (Free Play) |
| **?** or **F1** | Hotkey cheat sheet |
| **F11** | Browser fullscreen (plus a fullscreen button in the menu; uses Keyboard Lock where supported so Esc is reachable) |
| **\\** | Debug overlay (only with `?debug=1`) |

Input safety: keys are ignored while a text field has focus; modifiers are cleared on window
blur; Tab, Space, arrows, Alt, F1, middle-click, and Ctrl+wheel are blocked from the browser.

---

## 13. Save data
- `localStorage`: `tinyrts.settings.v1`, `tinyrts.campaign.v1` (unlocks, stars, best times, Hollow
  seen), `tinyrts.freeplay.v1` (last setup).
- **IndexedDB** `tinyrts` / store `suspend`: one suspended game (cells as RLE, HP only where below
  max, all entities as plain data with integer ids, AI + director + RNG state). **Continue** loads
  it; it's deleted when resumed or when the match ends.
- Rule from M5 on: the whole sim state is plain data with integer ids; a save → load → compare test
  runs in the suite.

---

## 14. Audio (all synthesized, WebAudio, no files)
- **SFX**: recipes in `data/sfx.json` (oscillator, pitch envelope, filter sweep, noise, duration).
  Pulse chirp, Lance hum (held while firing), Mortar thump + whistle + boom, Railgun charge + crack,
  Arc crackle, collapse rumble, build ticks, UI clicks, two-tone alerts. Max 24 voices, per-sound
  throttling, volume and stereo pan from camera distance.
- **Music**: procedural synthwave sequencer (bass arp, pads, synth drums, lead). Layers: *build*
  (pads + slow arp), *wave* (+ drums + lead), *boss* (faster, minor shift). Crossfades by state;
  seeded per mission.

---

## 15. Visual style
Palette: space #07060d, terrain desaturated blue-greys with per-cell shade variation, ore glints,
Lumen cyan/white, Umbra amber/red, Hollow magenta/violet. Beams 1 cell wide with an additive glow.
Sprites are code-defined pixel art (`data/sprites.json`, ASCII grids + palette keys), tinted per
faction; turret barrels drawn as rotating lines. Juice: screen shake (setting), hit flashes,
debris, muzzle flashes, shell trails, Core pulse, damaged walls darken with cracks.

---

## 16. Architecture
Vanilla ES modules, no build step. The **simulation has no DOM access** and runs in Node.

```
index.html, css/{style,hud,menus}.css
js/main.js                 boot + screen router
js/core/                   loop.js (30 Hz fixed step), rng.js, events.js, util.js
js/world/                  materials.js, world.js, terrain-gen.js, cellsim.js, support.js, raycast.js
js/sim/                    game.js (state + tick order), commands.js (the only way to change state),
                           buildings.js, units.js, enemies.js, weapons.js, projectiles.js,
                           network.js (links + power), economy.js, nav.js, construction.js,
                           waves.js (director + authored), commander.js, research.js,
                           objectives.js, save.js
js/ai/rival.js             Umbra AI
js/render/                 renderer.js, terrain-layer.js (one world canvas + dirty rects),
                           sprites.js, fx.js, overlays.js, camera.js
js/ui/                     hud.js, commandcard.js, selection-panel.js, minimap.js, alerts.js,
                           tooltip.js, controller.js (input → commands), menus/*.js
js/input/                  input.js
js/audio/                  audio.js, sfx.js, music.js
data/                      materials, buildings, units, enemies, research, waves, campaign, maps,
                           ai-templates, sprites, sfx (.json)
tests/                     *.test.js (node:test), e2e/*.spec.js (Playwright)
tools/                     serve.sh, serve.py, sim.js (headless matches)
```

Tick order (30 Hz): commands → power/economy → construction → buildings/turrets → units/enemies →
projectiles/beams → damage → loose cells → support queue → clumps → nav dirty rebuild →
waves/director → objectives → events out.

Budgets: sim ≤ 8 ms/tick on Large with 300 entities; render ≤ 6 ms. Max game speed ×2.

---

## 17. Testing
- **Unit (`node --test`)**: rng, materials, cell physics (piles, spans, arches, clumps, crush),
  raycast + reflection + friendly pass-through, damage/resist, economy + brown-out math, link LOS,
  placement, drone construction, nav (A* reachability), Hollow crawl + chew, director counter
  picks, rival AI completes a match vs a passive player and is never idle > 3 min, campaign data
  validation, save/load round-trip.
- **Headless sims** (`tools/sim.js`): director waves vs a scripted defense and AI vs AI, many
  seeds; win rates and durations for balance.
- **Playwright** (desktop 1280×720 + 1920×1080, phone 390×844 for menus/notice): boot, every menu
  by mouse and keyboard, a Siege match placing drill/relay/wall/turret by hotkeys + mouse, waves
  fast-forwarded, pause/settings, save & continue, win and lose screens, tutorial playthrough.

---

## 18. Milestones (20), playable slice at M5

Each ends with: tests green, a commit, the checklist updated, something visible at
`http://192.168.1.34:8460/`.

| # | Milestone | Done when |
|---|---|---|
| **M1** | Scaffold | index.html + CSS, fixed-step loop, integer pixel scaling + wheel zoom, camera, input, serve script, node + Playwright harness, data loader |
| **M2** | World & render | materials, grid + chunks, seeded terrain (styles, caves, ore, bedrock, pads), one world canvas with dirty rects, backdrop |
| **M3** | Cell physics | falling sand, chunk sleeping, support search, clumps, crush damage |
| **M4** | Buildings & economy core | data-driven buildings, placement ghost + rules, Core, Drill digging ore, Solar sky check, Relay link network with LOS, power balance, top bar |
| **M5** | **Playable slice** | wall painting + blueprints, drones building bottom-up, Pulse turret, Mites crawling + chewing, wave timer, win/lose, plain-data state + save round-trip test, fun check playthrough |
| **M6** | Weapons & destruction | beams with reflection + friendly pass-through, projectiles (arc, pierce), blasts + craters + slag, damage types, debris → rubble, screen shake |
| **M7** | Full turrets & resources | Lance, Mortar, Railgun, Flak, Arc Coil; Ferrite, Refinery/Alloy, Battery, Reactor, brown-out, targeting modes |
| **M8** | Dig, salvage, repair | dig tool, salvage, Gate building, blueprint rebuild between waves, undo, repeat last build |
| **M9** | The Hollow | all enemy types + crawl/climb/chew, flyers, borers + tremors, Carapace front reflection, bosses, nests |
| **M10** | Waves & Director | authored + director waves, counter-picks, lanes, surges, preview, call early, alerts |
| **M11** | Units & orders | nav grid + A*, selection (click/box/groups/tab/double-click), orders, Fabricator + rally |
| **M12** | HUD complete | command card + tooltips, selection panel, minimap, alerts, objectives, overlays, off-screen arrows |
| **M13** | Commander & research | hero abilities + respawn, Research Lab + 8 projects |
| **M14** | Rival AI & Versus | build slots, build orders, economy, reactive rules, timing pushes, styles, difficulty |
| **M15** | Menus | title, free play setup + preview, pause, settings, How to Play + Field Guide, results, credits, notice |
| **M16** | Audio | synth SFX, voice limits, spatial pan, procedural music layers |
| **M17** | Campaign | 8 missions: maps, authored waves, objective scripts, briefings, campaign map, stars |
| **M18** | Save & tutorial | IndexedDB suspend/continue, tutorial step hints with ghost outlines, cheat sheet, high contrast |
| **M19** | Balance & performance | headless sims, tuning, profiling on Large |
| **M20** | Ship | full Playwright pass desktop + phone, polish, docs, final audit |

---

## 19. Numbers live in data
Every number above is a starting value in `data/*.json`. Balance changes happen in data, not code.

---

## 20. Changes from the roast (v1 → v2)

Accepted:
1. Own shots pass through own built cells; turrets may sit on walls (§2.4, §5.5).
2. Buildings rest on walls and fall when undermined (§2.3).
3. **Dig tool** added (Z on the Build card) (§5.4).
4. Hollow walkers climb natural terrain at ½ speed (no moat traps), can't climb built cells, chew
   them instead, and chew rock when stuck (§6.1).
5. Foam: span 3, 1 C / 4 cells, weak to lasers and acid (§2.2).
6. Crush damage from landing clumps (§2.3).
7. Carapace reflects only from the front; new **Glare** Hollow laser enemy makes Prism useful
   against the Hollow (§6.3).
8. Milestones reordered: playable slice at M5, plain-data state + save test from M5, objectives
   and hints with the slice (§18).
9. Campaign rebuilt: 8 missions, authored waves, varied objectives (Extend the Line, Demolition,
   Hold the Bridge), Ferrite before Plate, Commander from mission 1 (§9.1).
10. Hotkeys: Shift = straight line (no Ctrl chords with letter keys); P = pause only; Hold/Patrol
    on the grid (D/F); `?`/F1 cheat sheet; no F-key camera spots; Shift+N call early; `event.code`
    binding; Home = Core; input guards and blur clearing (§12).
11. Integer scale with whole-number zoom, slim overlaid HUD, screen-res overlays (§2.1, §11.6).
12. Turret ranges capped ~170, off-screen arrows (§2.1, §5.2).
13. Walls re-priced (~2×) and melee bites 3 × 3 / 5 × 5 (§5.3, §6.1).
14. All missing numbers specified: fire rates, build times, speeds, enemy costs, phase lengths,
    friendly fire, reflected-beam ownership (§5–§6, §10).
15. Core trickle +2 C/s; exhausted drills refund 100 % (§4).
16. Orbital Lance: 40-deep, not within 60 of a Core; Core never falls (§7, §2.3).
17. Call early pays per second skipped (§10.1).
18. Rival AI = build slots + build orders + reactive rules + timing pushes; no APM simulation or
    scouting (§10.2).
19. Max speed ×2; IndexedDB saves with sparse HP (§13).
20. Wall rebuild between waves by default (§5.3).
21. Power defined as a rate everywhere; batteries store it (§4.1).
22. Mixed drones + army selection shows the Unit card; B opens the Build card from anything (§12).

Not taken, with reasons:
- **Replace the support search with a row-scan rule.** The 0-1 search is already written, tested
  (piles, overhangs, arches, towers) and bounded by a per-tick budget, and it produces the same
  results players would predict from the stated rule. Kept; the rule is now written plainly (§2.3).
- **Cut Arc Coil, Splitter, Skimmer, Nests, Hive Mother.** Each is small given the systems already
  needed (chain damage, split-on-death, flyer movement, a spawner structure, a flying spawner), and
  they give missions and the director variety. Kept.
- **Cut the whole Codex.** Folded into How to Play as a Field Guide generated from the data (cheap).
- **"One canvas per chunk row" critique.** The design now states one world canvas + dirty rects.

---

## 20b. Changes made during the build
- **Prism reflects only enemy lasers**, and a reflected beam switches owner (it now hurts the
  shooter's side). Your own lasers pass through your own Prism like any own wall. Found in M6: with
  both-team reflection, a Prism wall in front of your own laser turrets bounced their shots back.
  Research "Ricochet Optics" became **Refraction** (reflected beams hit twice as hard).

- **Bases sit 110 cells in from the map edge** (was 70–80) so there's room behind the Core for the
  economy. Found in M19: bots put batteries on the front line because the "back" had no space.
- **Drills: 20 × 48 area, 4 per ore cell, one cell per 1.4 s**, and home-base veins are bigger.
  Found in M19: drills ran dry after ~4 minutes and income collapsed to the Core trickle.
- **Repair costs crystal** (1 per 20 HP) and runs at 8 HP/s per drone. Found in M14: three drones
  out-healed an entire Umbra army.
- **Buildings can't stack on buildings** (they can still sit on walls). Found in M14: stacked sites
  were unreachable for drones.
- **Beacons (mission 2) start dormant** — the Hollow ignore them until you link one — and a destroyed
  beacon reforms 30 s later (costing a star, not the mission).
- **Army units shoot through enemy walls** that block their path, and right-clicking an enemy wall
  orders an attack on it. Walkers that get wedged **scramble up rock and their own buildings**; a
  path is only followed if it reaches the goal, otherwise they walk straight and climb. Units drop a
  target after 1.5 s of shots that don't land (a ridge in the way).
- **Rival AI build slots** are zones around its Core checked with the player's own placement rules
  (instead of slots emitted by terrain generation); it expands with Relays when it runs out of room,
  keeps ore spots free for drills, and its wall is a Gate with a cap (so its army can get out).
- **Difficulty multipliers** are Easy 0.65 · Normal 1 · Hard 1.5 · Brutal 2, growth past wave 10 is
  ×1.10 per wave (+4 % HP). Tuned with `tools/sim.js`.
- **Crush damage** is `cells × fall × 0.08` (cap 1500) so a dropped slab can kill a Nest.
- **Results screen** shows damage by damage type (laser/kinetic/blast/arc/acid) rather than per turret.

## 21. Backlog (v1.1: cut from this release, written down on purpose)
Shield Projector · Repair Node · Bulwark unit · Leech enemy · The Maw (segmented worm boss) ·
Commander XP/levels + 4th ability · research tiers · fog of war · Hollow interference in Versus ·
more AI styles (Engineer) · key rebinding UI · three colorblind palettes (one high-contrast mode
ships) · crooked buildings/re-leveling · slag burning damage · camera bookmarks · minimap pings ·
add-to-control-group · attract-mode battle on the title (ships only if cheap, otherwise here).
