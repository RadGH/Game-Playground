# Lodestar — brainstorm

Working title **Lodestar**. Solo browser game, independent project (Radley Sustaire). Sandbox.
Written 2026-10-28 from `docs/OWNER-BRIEF.md`, which is the authority: where this document and the brief
disagree, the brief wins unless an item here is clearly marked **[ADDITION]** and Radley has said yes to it.

This is a brainstorm, not a plan. It is deliberately opinionated and full of numbers so the planner has
something concrete to cut down. Every number is a first guess meant to be tuned by a balance bot.

Other games are named here only as reference for Claude (playground rule 9). Nothing in this file that a
player would read should borrow a name from them.

> **Owner changes, 2026-10-28 (these override the brief and the first draft):**
> 1. **The world is flat.** *"Forget lava and water physics. I have built a top down game with terrain
>    height before and it is terrible. I would rather the world be flat but with water/lava and cliffs as
>    edges."* So: no height field, no flowing water or lava, nothing in gameplay depends on height. Water
>    and lava are **fixed areas** (lakes, rivers, seas, lava fields) that act as edges and barriers. Cliffs
>    are impassable **edge lines** between areas; a plateau is a look, not a height. Pixel physics stays for
>    everything else: fire, explosions (a crater is scorched, broken ground and rubble — not a hole), debris,
>    smoke, sparks, lighting. Per-pixel "relief" for lighting stays as a **visual effect only** (walls,
>    buildings, rocks and ore look raised and catch light). Sections 0, 2–7, 9 and 11–14 were rewritten
>    for this.
>    *(This also cut the first draft's sluice gates, flooded trenches and dug moats/canals: water is where
>    the map put it.)*
> 2. **Roads and bridges.** *"It would be cool to create roads and potentially bridges to cross at least
>    shallow water."* Water now comes in **shallow** and **deep**; roads are drawn like walls and become
>    bridges where they cross shallow water — **section 2.5**.
> 3. **Roads are just a path, and one damage rule.** *"Simplify roads to just a path. No upgrade. Tedious
>    detail for a pixel game. Agreed about damage - only attack production or military buildings and
>    offensive units etc."* One road kind, no tiers. Enemies attack only production buildings, military
>    buildings (walls, towers, gates) and fighting units — never roads, bridges, rails or other passive
>    infrastructure. Delivery vehicles can still be attacked while they travel; trains are the protected
>    exception. The rule lives in **one place: section 5.1**.

---

## 0. The pitch in one paragraph

You are the commander of a buried command post on a hostile world. You never see the planet with your own
eyes. You see it the way a real commander would: through a big round-cornered sensor screen, a rack of
knobs and switches, a teletype that chatters out reports, a radio full of crackly voices, and a brass
needle that tells you how much magic is left in the tanks. From that chair you plan a town, draw walls with
a light pen, send drills to the edge of what your sensors can see, lay rails, hold off the things that
crawl out of the nests when your factories get loud, and call down meteors when they get too close. Then
you put a rocket on a pad, map the next planet one stripe at a time from orbit, land a second command post
there, and tie the two together with a ferry line. Eventually you build a warp drive and do it again in
the next star system. The world underneath is a flat, living pixel simulation — rivers and lava fields
that carve the map into pieces you must bridge, grass fires that jump your wall, craters that throw
rubble, smoke that blinds your sensors — and the instruments are the only window onto it.

**The feeling to protect:** *I am in a room, using machines, and the war is out there.* Every design
choice below is tested against that.

---

## 1. Fantasy, tone and the console

### 1.1 Tone

- **Diesel-age bunker meets frontier magic.** Riveted steel, bakelite knobs, green-grey enamel paint,
  brass bezels, warm incandescent indicator lamps, a coffee ring on the desk. Magic is treated like a
  dangerous industrial fluid: piped, metered, stored in heavy cylinders, handled by people in thick gloves.
- **Serious but not grim.** The radio operators have personalities. Convoy drivers complain. High Command
  sends occasionally absurd directives by pneumatic tube. Enemies are alien wildlife, not people, so the
  violence is pest control on a planetary scale, and it can be loud and gleeful.
- **Abstract, not cartoon.** The world on the scope is a sensor picture: honest, beautiful pixels, but
  always framed by glass, scan lines, a range ring and a grid reference. You never get a "free camera".

### 1.2 Who is in the room with you **[ADDITION]**

The bunker is lived-in. You never see the people, you hear and read them:

| Voice | Role | Where it comes out |
|---|---|---|
| **Signals** (radio operator) | relays every call from the field | radio speaker, formant voice + static |
| **The Quartermaster** | logistics complaints, shortages, "depot 3 is full" | teletype, sometimes radio |
| **The Arcanist** | mana, crystals, spell readiness, warnings about spills | intercom from the mana room |
| **The Calculator crew** | research results | teletype + a capsule down the pneumatic tube |
| **High Command** | optional directives, commendations, the long story | pneumatic tube, sealed envelopes |

Voices use our own formant engine (`shared/voices.js`, `voice-lab/`) through a radio filter (band-pass
300–3000 Hz, light distortion, static bed, squelch "kssh" at start and end). Radio lines are short and
useful: *"Convoy Four, contact at grid Delta-Seven, they're on the road."* Subtitles always shown.

### 1.3 The console — the core idea

The interface is a set of **machines bolted into a bunker wall**. Each machine does one job and looks like
it. The rule: **every machine is also a normal, fast control.** A knob turns with a drag, the mouse wheel,
the gamepad stick, or a keyboard key, and clicking a labelled detent jumps straight to it. Knob *feel*,
button *speed*. A physical interface that is slower than a menu would be a betrayal of the player.

**The machines (first pass):**

| Machine | Job | Physical behaviour |
|---|---|---|
| **Tactical Scope** | the main CRT; the only view of the world | curved glass, scan lines, phosphor afterglow on moving things, a grid reference stencil on the bezel |
| **Light Pen** | the cursor; draws walls, routes, patrols, aims spells | a pen on a coiled cord; its tip glows on the scope where it points |
| **Range knob** | zoom | 6 detents: 1 / 2 / 3 / 4 / 6 / 8 screen px per cell; a heavy clunk per step |
| **Filter selector** | what the scope shows | rotary with labelled positions: SIGHT / HEAT / ORE / FLOW / THREAT / GRID (see 1.4) |
| **Tool bank** | what the light pen does | a row of chunky toggle switches with paper labels: BUILD, WALL, ROUTE, POST, DIG, SURVEY, CLEAR. Only one can be up; raising one drops the others with a satisfying mechanical slap |
| **Build Ledger** | the catalogue of buildings | a flip-file / rolodex of cards; each card a blueprint drawing with cost stamped on it |
| **Dispatch Board** | logistics | a split-flap departure board: every line, its next departure, its status ("DELAYED — UNDER ATTACK") |
| **Garrison Board** | units and posts | a pegboard: each post a brass hook, each squad a tag hung on it; drag tags between hooks |
| **Mana Gauge** | the HQ mana store | a big round dial with a needle, a red "reserve" sector, a second thin needle showing cap; a sight-glass tube that glows with the colour of the mana inside |
| **Spell Board** | spells | a rack of spell cartridges; a **keyed arming switch**; a guarded big red FIRE button under a flip cover |
| **Teletype** | the message log | paper scrolls up; important lines are printed in red ribbon; tear-off a line to pin it (a pinned note on the cork strip) |
| **Radio set** | live chatter, select by channel | a tuning dial; turning it to a unit's channel selects that unit and centres the scope on it |
| **Pneumatic tube** | deliveries: research results, directives, new blueprints | a brass canister lands with a "thoonk"; click to open |
| **The Calculator** | research | a relay computer: card hopper, spinning tape reels, rows of blinking lamps (section 7) |
| **Orrery** | the star system | a brass mechanical model of the planets that really turns with game time (section 8) |
| **Orbital Scope** | satellite mapping | a second, smaller CRT showing a planet map filling in stripe by stripe |
| **Alarm panel** | everything urgent | a row of labelled jewel lamps (RAID, FIRE, FLOOD, SPILL, CONVOY, HQ) + a klaxon + a mute toggle |
| **Day clock** | the planet's day | a 24-hour dial with a sun and moon disc rotating behind a window |
| **Degauss button** **[ADDITION]** | clears scope distortion after a hit | press it: thunk, a colour wobble washes across the glass, the picture snaps clean |

**The console grows.** **[ADDITION]** At the start of the game the bunker is sparse: the scope, the range
knob, the tool bank, the teletype, the radio and a tiny mana gauge. Research and promotions deliver new
machines: a crate comes down the freight lift, and the new machine is bolted into an empty bay with a
short animation. The Dispatch Board arrives with the first haul route, the Calculator with the first lab,
the Orrery with rocketry. Empty bays have blank cover plates with stencilled "RESERVED". Watching your own
desk fill up is the progress bar for the whole game, and it keeps the first ten minutes simple without a
separate tutorial UI.

### 1.4 How the world is seen (the scope is a sensor, not a camera)

- **Fog of war is literally sensor range.** The HQ has a sensor mast (radius 160 cells to start). Every
  sensor tower, scout, outpost, satellite pass and lit area adds coverage. Three states:
  1. **Never seen:** soft analogue static, slowly crawling.
  2. **Seen before, not covered now:** the last picture, desaturated and slightly blurred, with a small
     stamp "LAST SEEN DAY 4 14:20" if you hover. Terrain is remembered; enemies are not.
  3. **Live:** full colour, full lighting, moving things.
- **Different sensors see different things.** **[ADDITION]** Optical sensors are blocked by smoke, steam,
  sandstorm and night (they see only lit areas at night). Radar ignores smoke and dark but shows no colour
  and only moving or metal things. Thermal sees heat through smoke. A fire in front of your wall is
  therefore also a blindfold — the physics feeds the information game.
- **The Filter selector** re-paints the same feed:
  - **SIGHT** — true colour with lighting (default).
  - **HEAT** — thermal palette, black → red → yellow → white. Lava, fires, machines, warm-blooded enemies.
  - **ORE** — known deposits as coloured hatching with amounts; unknown ground dark.
  - **FLOW** — logistics schematic: roads, rails, routes, depots, vehicles as moving dots with cargo
    colour. Buildings show their three jam lamps (section 3.7).
  - **THREAT** — nests, their size, Noise and Glow (section 5.2) as contour lines, raid paths predicted.
  - **GRID** — power and mana networks; pipes glow, breaks flash.
- **CRT treatment** (all subtle and switchable): barrel curvature, scan lines, a faint vignette, phosphor
  afterglow (moving things leave a short trail), bloom on bright pixels. A "plain" setting removes all of
  it for players who want clarity.

### 1.5 Desktop layout (16:9, 1920×1080 reference)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ALARM LAMPS ● RAID ● FIRE ● FLOOD ● SPILL ● CONVOY ● HQ   [klaxon mute]  DAY◐│
├────────────┬────────────────────────────────────────────────┬───────────────┤
│ TELETYPE   │                                                │  MANA GAUGE   │
│ (log)      │                                                │   (needle)    │
│            │            TACTICAL SCOPE                      │───────────────│
│ cork strip │         (≈ 60% of screen width)                │  SPELL BOARD  │
│ (pinned)   │                                                │  cartridges   │
│────────────│                                                │  [KEY] [FIRE] │
│ RADIO      │                                                │───────────────│
│ dial + spk │                                                │  TUBE inbox   │
├────────────┴──────────┬───────────────┬──────────────────────┴───────────────┤
│ RANGE ◎  FILTER ◎     │ TOOL BANK ▮▮▮▮▮▮▮ │ DRAWER BAY: [Ledger][Dispatch][Garrison]│
└───────────────────────┴───────────────┴──────────────────────────────────────┘
```

- The **drawer bay** holds the bigger machines (Build Ledger, Dispatch Board, Garrison Board, Calculator).
  One drawer is open at a time; it slides up over the bottom third of the scope like a real pull-out panel.
- **The bunker has walls** **[ADDITION]**: FRONT (the console above), LOGISTICS (big Dispatch Board, the
  depot ledger, the production clipboard), ARCANE (mana room window, batteries, crystal intake meters,
  the spill alarm) and SPACE (the Orrery, the Orbital Scope, the launch control with its two-key
  interlock). Tab / Q-E / bumpers **swivel the chair**. Every wall has a small **repeater scope** — a
  little monitor showing the main feed — so you never lose sight of the battlefield while doing paperwork.

### 1.6 Phone portrait layout (~402×780 CSS px)

The phone is the same bunker, stacked:

```
┌────────────────────────┐
│ lamps ● ● ● ● ●  DAY ◐ │  32 px strip — always visible
├────────────────────────┤
│                        │
│     TACTICAL SCOPE     │  ~52% of height, square-ish
│                        │
├────────────────────────┤
│ MANA ▕▔▔▔▔▔▏ RANGE ◎ FLT◎│  48 px strip: mini mana bar with needle, two knobs
├────────────────────────┤
│                        │
│     MACHINE DRAWER     │  the rest: ONE machine at a time
│ (tool bank / spells /  │  swipe left-right = swivel chair
│  ledger / dispatch …)  │
├────────────────────────┤
│ [TOOLS][SPELL][BUILD][LOG][MORE] │ drawer handles, 56 px
└────────────────────────┘
```

- **Swipe on the drawer** = swivel to the next machine; the handles are physical drawer pulls, the open
  one is pulled out.
- **On the scope:** one finger = light pen, two fingers = pan and pinch (pinch snaps to the range knob's
  detents, with a knob animation so the metaphor holds). A long press = "inspect" (prints a teletype line).
- **Drawing walls on a phone** is the risk: a finger hides what it draws. The light pen is drawn offset
  40 px above the finger with a little reticle, and every drawing tool has a "confirm" toggle so a slip
  costs nothing.
- **Landscape phone:** scope on the left (≈ 62%), drawer on the right, strips become a column.
- No scrolling panel inside the page (the Chromium blanks-the-canvas gotcha): every drawer is
  fixed-height and pages with buttons, never scrolls.

### 1.7 Gamepad

| Input | Does |
|---|---|
| Left stick | moves the light pen on the scope (with gentle snapping to buildings, wall ends and roads) |
| Right stick | pans the scope (W/up = screen north, always) |
| LT / RT | range knob down / up, one detent per press |
| LB / RB | swivel the chair / cycle machine focus; a small amber lamp lights over the focused machine |
| A | press / place / toggle; hold A while moving = draw (walls, routes, patrols) |
| B | cancel / back / close drawer |
| X | open the tool bank radial (8 switches around the stick) |
| Y | open the spell board; hold Y + A to turn the arming key, release to fire on the pen position |
| D-pad | inside a focused machine, moves between its controls; left/right turns a knob one detent |
| Start | the ☰ menu |
| Select / View | filter selector, one step |

The spell board is deliberately **two-step on every device** (arm, then fire) so you can never cast a
400-mana meteor by brushing a button.

### 1.8 Sound of the room

The room is a big part of the fantasy and is cheap to make with synthesis:
knob detent clicks (pitch rises per step), toggle slaps, relay clatter from the Calculator, teletype
hammers, the tube's suction and thump, the klaxon, the low 50 Hz hum of the bunker, a fan, distant thuds
when something explodes close to the HQ (and dust falling, see section 10). Battle sound comes through the
**scope speaker**, filtered and a little lo-fi, and gets louder with the range knob zoomed in. Use
`sfx/js/sfx.js` for battle sounds and a small new bank of room sounds.

---

## 2. The pixel world (top-down, flat)

### 2.1 Scale

- **1 cell = 0.5 m.** A person is a 3×3-cell sprite, a truck 5×10, a train car 6×18, a house 16×16,
  the HQ 48×48, a nest 20–40 across.
- **Home map: 2048 × 2048 cells (1 km square).** Other planets 1536² to 3072², one per landing site.
- **Chunks: 64 × 64 cells** (1,024 chunks on the home map). A chunk sleeps when nothing in it changed last
  tick. With no flowing liquids, most of the map sleeps most of the time: expect 20–80 awake chunks
  (fires, blasts, building work, mining).
- Units and vehicles are **entities** (drawn as pixel sprites at cell scale), not cells. Cells are the
  ground, water, lava, fire, walls and debris.

### 2.2 The ground is flat — and why that is a good thing

The owner has built a top-down game with terrain height before and it played badly: hard to read, units
snagging on slopes, a camera fight. So **every cell is at the same level**. What gives the map shape is
**edges**:

| Edge | Who it stops | How you get past it |
|---|---|---|
| **Shallow water** (fords, marsh, river edges, lake shallows) | stops vehicles; people and most enemies **wade** at 35% speed | a **bridge** (2.5), or wading |
| **Deep water** (river channels, lakes, seas) | stops everything that walks | **boats**, a long bridge (later research), freezing it (frost) |
| **Lava field** (still, glowing, crusted) | burns anything that enters (heavy damage per second); fire-immune enemies cross | a heat-proof bridge (late research), going round |
| **Cliff line** | stops everything that walks; flyers pass | going round, a **ramp** building cut into it (era III), or blasting a **breach** |
| **Chasm** (crystal worlds, quake spells) | stops everything that walks | bridges only |

Water and lava are **fixed areas** drawn by the map generator. They do not flow. They can still *react*
(2.4): water puts out fire and makes steam, lava sets fire to things and cools to rock where it meets
water. A cliff is a **line between two areas**, drawn as a dark rim with a lit edge and a shadow on the
low side so it reads as a drop — but the "low" and "high" side are only paint. Under it all, the map is a
2D plane where every rule is a yes/no about a cell.

This makes the map a puzzle of **chokepoints**: a river with three fords, a plateau with one ramp, a lava
field you can only cross at its narrow end. Bridges, gates and walls across those chokepoints are what the
defensive game is about.

### 2.3 What a cell holds (6 bytes)

| Byte | Field | Range | Notes |
|---|---|---|---|
| 0 | material | 0–255 | index into `materials.json` (includes the water and lava kinds) |
| 1 | temperature | 0–255 | mapped to about −60 °C … 1400 °C on a curve; lava ~1100, fire ~700 |
| 2 | wetness | 0–255 | how damp: rain and nearby water raise it, sun dries it, slows fire |
| 3 | amount | 0–255 | ore left (×8 units), fuel left for burnables, hit points for built cells |
| 4 | relief | 0–255 | **visual only** — how "raised" the pixel looks for lighting (rocks, ore, walls, buildings, trees). No rule reads it |
| 5 | flags | bits | burning, owned (player-built), scorched, revealed, road, bridge, rail bed, cliff edge |

Plus a **coarse gas layer** at quarter resolution (one value per 4×4 cells: smoke, steam, ash, mana mist,
density + kind) and a **wind** vector from the planet's weather. Gas is cheap at quarter resolution and
looks better soft anyway.

### 2.4 Materials and reactions

| Group | Materials |
|---|---|
| Ground | soil, grass, dry grass, sand, gravel, clay, mud, rock, scorched ground, ash, rubble |
| Plants | shrub, tree (trunk + crown cells), reed, alien growth (per planet) |
| Ore (outcrop cells) | copper, iron, coal, tin, quartz, sulphur, mana crystal, plus per-planet exotics |
| Water | **shallow water**, **deep water**, ice (frozen shallow or deep), marsh |
| Heat | **lava** (still, very hot), crust (cooling lava — crossable, slowly hurts), basalt (cold), obsidian, glass, slag |
| Built | timber, stone block, brick, concrete, steel plate, runed stone |

Each material row in `data/materials.json` carries: colour ramp, relief (for the look), hardness (dig and
mining time), flammability, fuel, ignition temperature, walk cost (0 = blocked), whether vehicles can cross,
light emission curve, and what it turns into when it burns, freezes, melts or is blasted.

**Reactions (none of them involve anything flowing):**

- **Fire next to water** stops at the shore; a burning thing pushed into water goes out with a puff of
  steam.
- **Lava next to water:** the shore line between them is permanent obsidian and makes a thin steam haze
  (pretty, and a little sensor blindness, near every volcanic river mouth).
- **Hot debris into water** (a meteor into a lake): a burst of steam that blinds optical sensors for
  ~20 s, and a ring of hissing splashes.
- **Lava + anything burnable at its edge** → ignites. A grass field next to a lava field is a fire risk
  all game long.
- **Cold:** frost freezes shallow water into walkable **ice** (and deep water into ice too, for a short
  time) — a bridge for you, or a bridge for the enemy (5.5). Ice thaws back over a few minutes in sun.
- **Heat:** fire or a meteor next to ice melts it back to water — and anyone standing on it falls in.
- **Lightning + water:** the charge spreads across connected water cells (section 6).
- **Lightning + sand** → small glass streak (a fulgurite) — pretty, harmless, rewarded with an
  achievement.
- **Rain** raises wetness everywhere, turns bare soil to **mud** (40% walk speed), puts out fires.

### 2.5 Roads and bridges **[OWNER ADDITION, simplified by the owner]**

> Owner: *"Simplify roads to just a path. No upgrade. Tedious detail for a pixel game."*

**A road is one thing: a drawn path that makes travel faster.** No tiers, no upgrades, no materials to
choose.

**Drawing** (the same light pen and the same polyline drawing as walls, so there is one line tool to
learn):
- **ROAD** switch on the tool bank, then click-drag. Each click adds a corner; corners are rounded into
  smooth curves automatically.
- **Auto-join:** a road ending within 3 m of another road snaps to it. Ending in the *middle* of a road
  makes a **junction**; crossing another road makes a crossroads. Both are drawn as a rounded meeting
  pad.
- **Roads through a wall** get a **gate** offered at the crossing (one click to accept).
- **Cost:** a flat price per metre (1 stone per 4 m), stamped live on the light pen. Workers build it
  outward from the nearest depot, so a long road visibly fills in.

**What a road does:**

| | Off road | On road |
|---|---|---|
| People and your units | ×1.0 | ×1.4 |
| Carts and cars | ×0.4 (they crawl) | ×1.0 (full speed) |
| Enemies | ×1.0 | ×1.2 — a road to your gate is also a fast lane for a raid, so put the gate where the towers are |

A road is also a **firebreak**. Rain does nothing to it (no mud on roads).

**Bridges** are simply **road drawn over water**:
- Drag a road across **shallow water** and that stretch becomes a bridge automatically. The price stamp
  changes colour over water (bridge = 6× the road price per metre, max 60 m) so the cost is never a
  surprise.
- **Deep water is boat-only** at first. One research step (**Long Spans**, era III) lets a bridge cross deep
  water, up to 150 m. A second (**Heat-proof Spans**, era IV) lets one cross lava, up to 60 m. That is the
  whole bridge ladder — no bridge types to pick.
- When the road tool can't bridge a gap, the gap is drawn red with the name of the research that would.
- Boats pass under bridges. (Drawbridges are cut: a raised bridge is a moat with a door, but it's another
  detail. Gates on walls do that job.)

**Roads, bridges and rails are never attacked** — see **the damage rule in section 5.1**. Debris from an
explosion can land on a road or rail and slows traffic until a road crew clears it (automatic), but
nothing ever needs rebuilding.

**How this sits with trains:** rails are drawn the same way (smooth curve, auto-join) and cross water the
same way, but they cost much more per metre (steel + timber sleepers), need gentle curves (no tighter than
12 m) and a train is faster than any car and plows through small enemies. Roads are cheap and everywhere;
rails are the expensive trunk line. Where a road meets a rail line, a level crossing is automatic: cars
wait for the train.

### 2.6 Fire

- A cell burns when its temperature passes its ignition point and it has fuel. A burning cell heats its
  neighbours, more strongly **downwind**, and less if they are wet.
- Dry grass catches in about 1 second next to fire, grass in 3, shrubs in 5, timber walls in 8, trees in 10.
- Fire leaves **scorched ground** (no fuel, regrows to grass over ~3 planet days) and **ash**, and puts
  **smoke** into the gas layer — which blinds optical sensors, which is the hidden cost of burning a field.
- Rain and sprinkler towers put fires out. **Firebreaks** stop them: water, roads,
  cleared ground, stone walls.
- Timber walls burn. That is the main reason to upgrade to stone, and the fire line
  spell (section 6) a reason to be careful about your own grass.

### 2.7 Explosions, craters and debris (flat)

- An explosion has a **radius** and a **power**. Inside the radius the ground is **broken**, not lowered:
  grass and soil become scorched ground and rubble in a ragged ring pattern (denser at the centre), built
  cells take damage, trees are flattened into burning logs, temperature jumps, things burn.
- **Rubble** is the useful leftover: it is rough ground (walk speed 60%, vehicles 40%) until it is cleared
  or it weathers back to gravel over a few days. A crater field in front of your wall is a slow zone for
  the next raid — mortars and meteors **shape the battlefield** without any height.
- The broken material also becomes **debris particles** that fly on a fake arc (they have a pretend
  height purely for drawing: a little shadow and a bounce), and when they land they become rubble cells,
  or for hot debris, small burning patches. Cap: at most ~300 particles alive and ~80 per second turning
  into cells (TinyRTS's lesson: an uncapped debris shower costs more than the whole sim).
- Debris that lands on a unit does a little damage.
- **Breaching a cliff:** a big enough blast (meteor, demolition charge) against a cliff line turns a few
  metres of it into a rubble **gap** that walkers can cross — your new shortcut, or the enemy's.
- **Chain reactions** (section 10): powder stores, fuel tanks, mana cylinders and some enemies explode
  when destroyed, and an explosion heats and damages things near it, which can set off the next one.

### 2.8 Cliffs, ramps and breaches

- Cliffs come from the map generator as **lines**, not slopes: a plateau rim, a canyon wall, a sea cliff.
  Their outline is stored as polylines (so they render as a clean edge) and rasterised into blocking cells.
- **Ramps** (era III building) cut a passage through a cliff: expensive, permanent, and a chokepoint you
  choose. A ramp can have a gate.
- **Breaches** (2.7) open a rough passage by force — enemies with siege attacks can do it too on later
  worlds, which is why a cliff is a good wall but not a perfect one.
- Flyers ignore cliffs. Some enemies **climb** (spider-like families): they cross a cliff at 20% speed.

### 2.9 Smooth lines alongside the grid (the vector layer)

The owner asked for walls and rails as smooth lines. The approach: **author and draw as vectors, simulate
as cells.**

| Thing | Drawn as | Simulated as |
|---|---|---|
| Walls | a polyline with rounded joins, thick textured strip, raised look and shadow | rasterised into "built" cells along the line; each **4 m section** has its own hit points |
| Roads | a soft strip with edges and rounded junction pads | a `road` flag on the cells (speed bonus, firebreak); never damaged |
| Bridges | a deck over the water, rails, pier shadows | a walkable `bridge` flag on top of water cells; never damaged |
| Rails | a smooth curve (sampled spline), two shining rails + sleepers | a `rail bed` flag on the cells; trains run on the curve itself, not cells |
| Pipes (water, mana, fuel) | a polyline, glowing for mana | cells flagged as pipe; passive, never damaged |
| Power lines | poles + sagging wire | a graph; poles are buildings |
| Cliffs | a rim line with a lit edge and a shadow | blocking cells |

Walls are the important one. Drawing:
- **Click-drag polylines.** Each click adds a corner; double-click or press A twice to finish.
- **Auto-join:** a line ending within 3 m of another wall's end or side **snaps** and joins (one wall,
  no gap). Walls also snap to **cliffs and deep water**, so a wall from cliff to river closes a gap
  properly. Closing a loop is shown with a green flash and a "RING CLOSED" teletype line.
- **Gates** are dropped onto a wall with the BUILD tool: your units and vehicles pass, enemies don't.
  Roads that cross a wall line get a gate offered automatically.
- **Curves:** hold Shift (or turn a small "CURVE" knob) to bend the next segment into an arc.
- **Upgrading in place:** select the WALL tool with a higher tier and drag **along** an existing wall —
  the section highlights and the cost is stamped; release to queue the upgrade. Builders upgrade one 4 m
  section at a time, so the wall is never open while it is improved.
- **The blueprint remembers.** A broken section shows as a dashed outline and is rebuilt automatically
  after the raid (TinyRTS lesson), paying the cost again.

### 2.10 Light (relief is visual only)

The owner's ask: a spark lights the pixels near it, and tall pixels catch more light. Kept, as a look:

- **Relief:** each cell has a visual "relief" value (2.3). Rocks, ore, trees, walls, buildings and
  rubble are drawn raised; water and roads flat. The renderer works out a surface direction for each
  pixel from its neighbours' relief (a "normal map"), so a boulder is lit on the side facing a light and
  shaded on the other, and a wall casts a short soft shadow. **No rule ever reads relief** — it never
  slows a unit, blocks a shot or changes a range.
- **Sun:** each planet has a day length and a sun angle that moves across the day, so shadows swing
  round over the day.
- **Emitters:** every hot cell (lava, fire, glowing slag), every lamp, every muzzle flash, spell, mana pipe
  and enemy eye puts colour into a **light buffer**. The light buffer is blurred outward at a few sizes
  (cheap and soft) and multiplied onto the picture, so light spreads into the cells around a source and
  is stronger on the side of a raised pixel facing it.
- **Lava fields** are the big light source of volcanic worlds: a constant orange glow across the plain,
  with a slow crawling pattern on the crust (animated in the shader, not simulated).
- **Water** reflects: lights and the sky colour shimmer on water cells (a cheap shader effect), so a
  river at night shows the lamps of the bridge.
- **Night is dark.** Really dark. Your base is a pool of lamplight; lava glows across the plain; a grass
  fire on the horizon is beautiful and terrible. Lit areas are the only places optical sensors see at
  night, so **floodlight towers** are a real defence building.
- **Bloom** on the brightest pixels before the CRT treatment, so explosions bleed into the glass.

### 2.11 Weather per planet **[ADDITION]**

Rain (puts out fires, turns dirt tracks and bare soil to mud, makes lightning stronger), dust storms
(blind optical sensors, sand slowly drifts over roads and must be cleared), snow and cold snaps (freeze
shallow water into walkable ice — **your river line stops being a barrier**, and raids cross it!), ash fall
on volcanic worlds (blinds, and slowly smothers fires), mana storms on crystal worlds. A barometer needle on
the day clock warns a few minutes ahead. Weather is what makes a defence you built in sunshine fail on
day 12.

---

## 3. Economy and logistics

### 3.1 The rule of the economy

**Nothing teleports.** Every unit of ore leaves the ground on a vehicle or a person, travels across the
map, and can be ambushed. Inside a compact base, buildings share stores for free (the Frontier Foundry
storage-pool rule worked and is legible; keep it). Everything else moves.

### 3.2 Detection

| Layer | How you find it | Typical size |
|---|---|---|
| **Outcrops** | visible on the surface; any sensor coverage shows them | 200–1,500 units each, 15–30 on the home map |
| **Shallow deposits** (≤ 10 m) | **Survey thumper** building: a pulse every 30 s rings out on the scope (a satisfying expanding ring), reveals radius 64 cells | 4,000–15,000 units |
| **Deep deposits** (≤ 40 m) | Seismic array (research era II), or orbital radar | 30,000–200,000 units |
| **Planet-wide picture** | satellites (section 8) | everything of the probe's kind, at map scale |

Outcrops are deliberately small: they run out in the first 20–40 minutes, which is the push to survey,
push sensors outward and fight for ground. Deep deposits sit under nests more often than not.

### 3.3 Resources (first list)

| Tier | Raw | Refined |
|---|---|---|
| 1 | timber, stone, copper ore, sand, clay | planks, stone block, copper bar, brick |
| 2 | iron ore, coal, tin, quartz | iron bar, steel, bronze, glass, wire |
| 3 | sulphur, oil (pumped), rare earth | powder, fuel, concrete, circuits, rubber |
| Arcane | mana crystal | raw mana, tamed mana (HQ store), crystal lenses, mana cells |
| Planet exotics | e.g. *frostglass* (ice world), *dawnsteel ore* (volcanic), *tidepearl* (ocean), *voidstone* (outer moon), *singing quartz* (crystal world) | each feeds 1–3 buildings or units that only exist with it |

Exotics are named by the planet generator (`namegen/`); the ones above are placeholders.

### 3.4 Mining

- **Hand camps** (tier 1): 4 workers with picks; slow (1 unit / 6 s each), cheap, can work any outcrop.
- **Drills** (tier 2): sit on a deposit, 1 unit / 2 s, need power. Mk I–V each ×1.6 speed.
- **Strip mine / quarry** (tier 3): eats a whole area, turning it into bare grey quarry floor with
  spoil heaps of rubble around it (rubble is rough ground, 2.7). **The landscape remembers your
  industry** — in colour and texture, not height.
- **Pumps** for oil and water, **lava taps** at the edge of a lava field (feed a foundry, save fuel), and
  raw mana springs.
- A worked-out outcrop leaves a scar: dull, cracked ground that slowly greens over.

### 3.5 Logistics — decided: **depots + lines + a dispatcher, no conveyor belts**

Belts are a different game (tile-by-tile routing puzzles); they also do not suit a top-down pixel world
with fire and explosions. Instead:

- **A depot** is a store with a **yard ring** (radius 24 cells). Every building inside a yard ring shares
  the depot's contents. Overlapping rings join into one pool. A drill next to its own small depot is an
  **outpost**.
- **Requests and offers.** Every depot shows two lists on its card: what it **offers** (everything above
  a reserve you set) and what it **wants** (target amounts: "iron ore 400"). The HQ depot wants
  everything by default.
- **The dispatcher** (the Dispatch Board machine) assigns idle vehicles to move offers to wants, along the
  networks that connect them (roads, rails, rivers, sky). The player never assigns a truck to a trip. The
  player builds **networks, stations and vehicles**, and sets wants.
- **Lines** for heavy transport: a train line or barge line is drawn as a sequence of stations and shown
  on the Dispatch Board with departures like a real station board. Lines run on a timetable ("leave when
  full or every 90 s").
- **The three jam lamps** (Frontier Foundry lesson, it explained nearly every stuck machine): on every
  building and every line — **POWER** (grid short), **INPUT** (something missing, named), **OUTPUT**
  (nowhere to put it). Red lamp + the teletype tells you which.
- **Starter fix from Frontier Foundry's bug reports:** the first vehicles run on nothing (people and mule
  carts), and the HQ depot starts nearly empty so the first route does not jam instantly.

### 3.6 Vehicles — a ladder

| Era | Vehicle | Capacity | Speed (m/s) | Needs | Danger profile |
|---|---|---|---|---|---|
| I | Porters (2 people) | 10 | 1.4 | anywhere | very exposed, cheap, run home when attacked |
| I | Mule cart | 40 | 2.0 | road (crawls off it) | slow; mule panics near fire |
| II | Steam crawler | 120 | 3.5 | road | armoured a little, can mount one gun |
| III | Truck | 200 | 8 | road | fast on roads, slow off them; fuel |
| III | **Train** (engine + up to 8 cars) | 400 / car | 22 | rail | **rails can't be hurt**; fast; plows small enemies |
| III | Barge | 600 | 4 | deep or shallow water | big and cheap per unit; swimming enemies board it |
| IV | Cargo airship | 300 | 10 | mooring masts | flies over walls; flying enemies hunt it |
| IV | Pneumatic freight tube **[ADDITION]** | 50 / capsule | 30 | buried tube | expensive per metre; capsules underground can't be seen or hit |
| V | Rocket / lander | see section 8 | — | pad | vulnerable only on the pad |
| VI | Mass driver **[ADDITION]** | 20 / shot | — | long straight rail | flings cargo pods to orbit; cheap per unit, huge to build |

**Trains, as the brief says:** rails are never attacked (the damage rule, section 5.1). A train at speed
**plows** anything up to "medium" size off the track (damage + knockback, a crunchy hit-stop), and outruns
everything on the home world. The danger is when it **stops**: a train standing at a station is a delivery
vehicle like any other and can be attacked while it loads, so stations want a tower. On later worlds a few
special enemies threaten moving trains too (section 5.8: a burrower that surfaces under the track and a big
beast that stands on it). Debris on the rails slows the train until it pushes through. Rails are expensive
(steel + timber sleepers) and need gentle curves — the rail tool refuses a curve tighter than 12 m radius
and shows why. Rails cross water like roads do (as rail bridges, same research limits) and are never
damaged either.

**Rivers are highways [ADDITION]:** the map generator always gives the home world at least one long river
or lake chain, so barges have somewhere to go. Docks are buildings on the shore; a barge line runs dock to
dock. Water is where the map put it — no digging canals (owner: no water physics).

### 3.7 Escorts and protection — still no micromanagement

- Any line or road can have **escort posts** along it (section 5.7): a squad assigned to "guard Line 2"
  spreads along it and responds to attacks within 80 cells.
- Vehicles have a **threat setting**: "go anyway" / "wait if the route is hot" / "turn back". A route
  turns "hot" on the Dispatch Board when an enemy is seen within 40 cells of it.
- Armoured cars and gun wagons (train cars with turrets) can be added to lines.

### 3.8 Refining and production

- Buildings take recipes; a smelter set to "copper bar" pulls copper ore + coal from its pool and pushes
  bars back. A **keep-in-stock** order ("keep 200 copper bars") switches machines on and off by
  themselves (Farhold round 28 lesson: this is what makes automation feel like automation).
- **Upgrade tiers:** every production building has Mk I–V upgrades in place (×1.6 output, ×1.3 cost of
  power each). That, plus multiplicative research ranks, is the "incremental" spine (section 9).
- Waste: smelters make **slag** (dumped in a slag yard as glowing rubble that cools over a day — a slag
  yard at night is a lovely orange smear). Chemical works make **smoke** and **Noise**.

---

## 4. The city

### 4.1 What the city is

The HQ is buried; the **town** is on the surface around it. People live there, work the machines, crew the
towers, and fill the army. Without a town the industry stops. Enemies never target houses (5.1), but a
town only works while its mines, workshops and walls do, and a raid inside the walls is felt by everyone
(morale, below). Defence is about keeping the town's livelihood alive.

### 4.2 People

- **Population** grows when there is **housing**, **food**, **water** and **safety**. Migrants arrive by
  road from the map edge (a little column of pixels walking in — which can be attacked on the way!).
- Every building needs a **crew** (e.g. smelter 4, drill 2, tower 2, train line 6 drivers).
- **Classes of worker** (kept to four, so it stays readable): **Labourers** (anything), **Engineers**
  (era II+ machines, rails, repairs), **Arcanists** (mana works, spell board, empowered units), **Soldiers**
  (units). Engineers and Arcanists are trained at a school from Labourers.
- **Morale** (a single 0–100 needle per town) affects work speed (×0.6 to ×1.2). It goes down with
  raids that get inside the walls, buildings lost, deaths, hunger, smoke over homes, and nights without light; up with a mess
  hall, a clinic, a tavern, festivals **[ADDITION: a festival is a button that costs food and a day's
  production and raises morale for 3 days]**, and victories announced on the radio.

### 4.3 Housing and services

| Building | Does |
|---|---|
| Tent row → cottages → row houses → tenement block | 8 → 16 → 40 → 120 people; upgrade in place |
| Farm field, fishery, greenhouse, hydroponics | food; fields burn, greenhouses don't |
| Well, water tower, pump house | water |
| Mess hall, clinic, school, tavern, chapel-like "Quiet hall" | services with a radius of 40 cells |
| Floodlights | safety at night; also sensors |
| Shelter bunkers **[ADDITION]** | when the RAID lamp lights, workers in threatened workshops within 60 cells run to them; fewer crew lost when a building falls |

### 4.4 How the city ties to production and defence

- Houses near industry suffer smoke (morale), so you zone without zoning: heavy industry downwind.
- Town size raises **Noise** (section 5.3), so a big city draws bigger raids.
- Soldiers come out of the population, so losing a squad hurts the workforce.
- The town's walls are your walls — the core picture of the game is a walled town with towers, a rail line
  leaving through a gate, and a mining outpost a kilometre away with its own little ring wall.

---

## 5. Defence

### 5.1 The damage rule — what enemies attack (the ONE place this is decided)

> Owner: *"Only attack production or military buildings and offensive units etc. Like Factorio."*

**Enemies attack, and can only damage:**
1. **Production buildings** — anything that mines, pumps, harvests, refines, makes, researches or powers:
   camps, drills, quarries, farms, smelters, workshops, mana works, labs, generators, batteries.
2. **Military buildings** — walls, gates, towers, barracks, posts, the HQ (it is a command post).
3. **Fighting units** — soldiers, walkers, golems, armed vehicles.
4. **Delivery vehicles while they travel** (the brief: everything that moves is in danger) — porters, carts,
   trucks, barges, airships, ferries near stations. **Trains are the protected exception**: they run on
   indestructible rails, outrun everything on the home world and plow through small enemies; a train is
   only open to attack while it is **standing** at a station, plus a couple of rare rule-breaking beasts
   on far worlds (5.8).

**Enemies never attack, and nothing can damage, passive infrastructure:** roads, bridges, rails, rail
bridges, pipes, power lines, signposts, docks, stations and depots (the buildings themselves — the
vehicles and cargo at them are fair game). Houses and town services are never *targeted* by enemies
either.

Two notes so the rule stays clean:
- **Physics is not an enemy.** Fire and your own spells follow the cell rules: a wildfire can burn your
  timber houses and fields, your own meteor can wreck your own smelter. Passive infrastructure is immune
  to these too, so a road, bridge or rail is never something you have to rebuild.
- **Debris and rubble** can land on roads and rails; it slows traffic until a crew clears it (automatic).
  That is the only way infrastructure is ever "hurt".

Why this rule: raids go for the things that matter and that the player can defend (walls, towers,
workshops) instead of nibbling at kilometres of road. It keeps repair chores away and puts every fight at
a wall, an outpost, a convoy or a station.

### 5.2 Nests

- Nests sit on the map from the start (home world: 6–10), more often near deep deposits and crystals.
- A nest has **stages 1–5**. Each stage is bigger on the scope, has more defenders, and sends bigger
  raids. A nest grows a stage every ~2 planet days on its own, faster when it is fed Noise or Glow.
- A stage-4 nest **buds**: it starts a new stage-1 nest up to 200 cells away. Leaving nests alone is how
  you lose the map.
- **Nest cores [ADDITION]:** destroying a nest leaves a core — a research sample (section 7). This gives
  attacking a reason beyond safety.

### 5.3 What makes them come: **Noise** and **Glow** **[ADDITION, an answer to "what is our pollution"]**

Two separate attractors, both shown as contour lines on the THREAT filter:

- **Noise** — machines, drills, trains, explosions, gunfire, a big town. It spreads outward and is soaked
  up by trees (keep a forest belt!) and blocked a little by walls and hills.
- **Glow** — magic. Every spell cast, every mana pipe, refinery and battery gives off Glow. Some enemy
  families ignore Noise entirely and only hunt Glow.

When a nest has soaked up enough Noise/Glow, it sends a **raid** toward the **loudest thing in its
range** — which is often an outpost, a mine or a train station, not the HQ. The raid's predicted path is
drawn on the THREAT filter as a dotted arrow as soon as it forms (a warning, about 60–120 s ahead).

This creates the central strategic tension: **industry and magic both make you stronger and both make
you a target, but different targets.** On a world whose enemies hunt Glow, you defend the mana works; on
one whose enemies hunt Noise, you defend the mines.

### 5.4 Raids

- A raid is a column of 5–80 creatures, scaled by nest stage, game time and difficulty.
- They path with a **flow field** (a map of arrows telling every enemy which way to step toward the
  target; rebuilt only for chunks whose terrain changed). They wade shallow water, avoid deep water and
  lava unless immune, go round cliffs, use **your roads and bridges** like anyone else, and treat your
  walls as a cost: they will go round a short wall and **chew through**
  a long one at its weakest section (lowest tier, most damaged).
- **A raid is a story on the radio:** Signals calls it when spotted, when it hits the wall, when the wall
  breaks, when it is beaten. Losses and kills print on the teletype.

### 5.5 Walls (tiers)

| Tier | Material | HP / 4 m | Cost / 4 m | Burns? | Notes |
|---|---|---|---|---|---|
| 1 | Timber palisade | 300 | 8 timber | yes | quick; the first ring |
| 2 | Stone wall | 1,200 | 12 stone block | no | heavy; slow to build |
| 3 | Brick-and-steel | 3,000 | 10 brick + 4 steel | no | can mount walkway turrets |
| 4 | Reinforced concrete | 7,000 | 12 concrete + 6 steel | no | resists acid |
| 5 | Runed stone | 9,000 + regenerates 20/s | 10 concrete + 2 crystal lens | no | gives off Glow |
| 6 | Ward wall | uses mana (1 / s per 40 m) instead of hit points | — | no | a shimmering line; collapses if the mana runs out |

Walls come in two builds: a **fence** (cheap, enemies that "leap" hop it) and a **full wall** (era II+,
nothing hops it). Your own turrets fire over your own walls (TinyRTS lesson). Walls snap to cliffs and deep
water, so the map's own edges are part of every ring.

### 5.6 Towers and defence buildings

| Building | Era | What it does | Physics hook |
|---|---|---|---|
| Watch post | I | sensor radius 120, 2 archers | lights the area at night with a brazier (and can set grass alight if it falls) |
| Bolt thrower | I | slow heavy bolts, pierce a line | — |
| Gun nest | II | fast bullets | muzzle flashes light the scene |
| Mortar pit | II | lobs shells over walls | craters leave rubble that slows the next wave; minimum range |
| Flame projector | II | cone of fire | **ignites grass in front of the wall** — a deliberate burn zone, or a disaster upwind |
| Floodlight | II | lights 80 cells | needed for optical sight at night |
| Arc mast | III | lightning chain to 5 targets | **chain doubles through water** — put it behind a ford or a marsh, where raids wade |
| Frost lance **[ADDITION]** | III | freezes targets | **also freezes water** — the river guarding your flank becomes an ice bridge for the enemy if you aim badly. Deliberately double-edged |
| Rail cannon | IV | long range, pierces | — |
| Ward pylon | IV | slows enemies in 30 cells, costs mana | Glow |
| Mana lance | V | beam, huge damage | big Glow |
| Shield emitter | V | a permanent small dome over a key building | uses mana |

### 5.7 Units — stationed, never steered

**The rule: you never select a unit and click to move it.** You give them a place and a job:

- **Posts.** A post is a brass hook on the Garrison Board and a marker on the map with a radius
  (default 40 cells). A squad on a post stands there and fights anything inside the radius, then returns.
- **Patrols.** Draw a loop or a there-and-back line with the light pen. A squad walks it forever, fights
  what it meets within 30 cells, and continues.
- **Escorts.** Attach a squad to a line or a road; it spreads along it.
- **Response team.** One or more squads at the HQ with "respond to alarms within N cells". When a RAID
  lamp lights inside that range, they go, fight, and come home. This is how you get a "click to send help"
  feeling without micro: you set the rule in advance.
- **Strike orders [ADDITION].** A once-per-order task: "clear nest at grid C-4". The squad (or several)
  marches, fights, and comes home or dies trying. You choose it on the Garrison Board; you watch it happen.
- **Stances** per squad: hold, defend radius, pursue to range, retreat when below 40%.

**Roster (first pass, home world):**

| Unit | Era | Notes |
|---|---|---|
| Militia (4) | I | cheap, spears, from labourers |
| Riflemen (4) | II | the backbone |
| Scouts (2) | II | sensor radius 90 on the move; ideal on patrols that push fog back |
| Sappers (3) | II | repair walls, rebuild sections during a raid, clear rubble |
| Flamers (2) | III | set things alight on purpose; immune to fire |
| Mortar crew (3) | III | — |
| Steam walker (1) | III | slow, armoured, big gun |
| Battlemages (2) | IV | **empowered**: need crystal lenses; cast small lightning; give off Glow |
| Crystal golem (1) | IV | **empowered**: built from mana crystal, regenerates, no food, slow |
| Hover tank (1) | V | crosses water and lava |

Units have upkeep (food, ammo from the local depot — so a post far away needs supply, which the dispatcher
handles automatically if the post has a small depot).

### 5.8 Enemy families per planet (first ideas, original names)

| World | Family | Highlights |
|---|---|---|
| Home (temperate) | **Skitterkin** | *Skitters* (swarm), *Tunnellers* (dig under a wall and surface inside), *Lobbers* (acid arcs over walls), *Ramhide* (armoured; charges walls), *Brood matron* (nest guardian) |
| Volcanic | **Slagborn** | walk through lava, leave burning trails; **weak to water** — they come apart wading a river, so a volcanic base wants water in front of it |
| Ice | **Rime stalkers** | breathe frost: **freeze the river guarding you into a bridge**; fragile to fire |
| Crystal world | **Glowfeeders** | hunt **Glow only**, drain mana batteries they touch, explode in a mana burst when killed |
| Ocean / swamp | **Tide crawlers** | swim; rivers and lakes are no barrier; board barges |
| Desert | **Dune serpents** | burrow; the one thing that can **surface under a rail line** and derail a train (the train is damaged, the rail never) |
| Gas giant moon | **Gale wisps** | fly; ignore walls; Noise only; hunt airships |
| Outer dark moon | **Driftborn** | come from orbit in falling pods — the first threat to **space stations** |

Every family has a "rule breaker" that defeats one standard defence, so each planet forces a new habit.
Plus one **train-stopper** big beast on the later worlds: so big a train cannot plow it, it stands on the
track; the line stops and Signals shouts about it.

---

## 6. Spells and mana

### 6.1 The mana chain

```
crystal cluster ─(harvester)→ crystal shards ─(dissolver)→ RAW MANA (glowing, unstable)
     ─(pipe)→ attunement works ─→ TAMED MANA ─(pipe)→ HQ mana store (the gauge)
                                                         └→ batteries raise the cap
```

- **Crystal clusters** are outcrops that **regrow** slowly on ley lines **[ADDITION]** — faint glowing
  lines in the ground on the ORE filter. A harvested cluster regrows in ~4 planet days if left alone, so
  crystals are a renewable resource you defend rather than a mine you empty.
- **Raw mana travels in pipes** (or as sealed cells on vehicles). Mana pipes glow — pretty at night, and
  they give off Glow. Pipes are passive infrastructure and are never damaged (5.1); the dangerous parts
  are the dissolvers, attunement works and batteries, which are production buildings and can be hit (6.6).
- **The HQ store** is shown on the **Mana Gauge**. Starting cap: **100**. Regeneration without crystals:
  **0.5 per second, and only up to 25% of the cap** — enough to cast a small spell every few minutes, not
  enough to rely on. Real mana comes from crystals.
- **Batteries** (mana cylinders) add cap: Mk I +150, Mk II +400, Mk III +1,000, Mk IV +3,000. They are
  big, heavy, and **explode** if destroyed (radius ∝ charge). Put them deep in the base.
- **Spell tiers unlock by cap**, so batteries are the progression: tier 1 spells need cap 100, tier 2 need
  400, tier 3 need 1,500, tier 4 need 5,000. The gauge face has the tier marks engraved on it — you can
  literally see the needle's maximum creep past a line.

### 6.2 Casting — a fire mission from a bunker

You are not a wizard in the field. Casting is a **fire mission**:

1. Pull the spell cartridge (or press its key). The cartridge clunks into the slot; the Spell Board's
   lamp lights.
2. Turn the **arming key**. The gauge shows a "ghost needle" where the mana will drop to.
3. Aim with the light pen on the scope. A reticle shows the area; the effect preview is drawn.
4. Lift the guard, press FIRE.
5. **Travel time** — the effect is sent out from the HQ's **projector** (or a relay obelisk) and takes a
   moment to arrive: a meteor takes 3 s with a growing streak, lightning is instant, a shield inflates
   over 1 s.

**Range and sight [ADDITION]:** a spell can only land where you have **live sensor coverage** and
within **projection range** of the HQ (300 cells) or a **relay obelisk** (150 cells each, costs crystal).
So scouting, sensors and obelisks extend your magic, and an enemy hidden in smoke cannot be targeted
until something sees it.

### 6.3 Spells (first list — 16, each with a physics hook)

| Spell | Tier | Mana | What it does to the world |
|---|---|---|---|
| **Meteor** | 2 | 300 | 3 s fall; crater radius 12 (scorched ground + a rubble ring that slows the next wave); throws **molten blobs** in a ring that land as small burning patches and set grass alight; debris shower; shakes the bunker |
| **Shield bubble** | 1 | 80 + 5/s | a dome radius 20 for up to 30 s; blocks enemies and projectiles; **fire cannot cross it** (a shield over a workshop saves it from a grass fire as well as a raid) |
| **Line of fire** | 1 | 60 | draw a line up to 60 cells; it ignites everything on it; dries out wet ground; makes smoke |
| **Lightning** | 1 | 40 | strikes one target, chains to 4 more; **chains through water to everything standing in it**; ignites wood; overcharges your arc masts for 10 s |
| **Stone ridge** | 2 | 150 | draw a line up to 40 m; a line of rock cells bursts up along it — an instant barrier that blocks walkers, crumbles to rubble over 5 minutes |
| **Rift** | 2 | 150 | draw a line up to 40 m; a glowing crack opens that nothing can walk across for 90 s, then seals with a thud — a temporary cliff edge |
| **Call rain** | 2 | 120 | 2 minutes of rain in a 120-cell area: fires out, bare ground to mud that slows enemies, lightning there is doubled |
| **Frost snap** | 2 | 100 | freezes water in radius 25: enemies wading are locked in ice, **or** you make a bridge for your own units |
| **Gust** | 1 | 50 | a strong wind in one direction for 20 s: steers fire and smoke |
| **Sensor flare** | 1 | 30 | a slow-falling light: live optical sight radius 90 for 40 s, at night too |
| **Mend** | 2 | 200 | repairs walls and buildings in radius 30 over 10 s |
| **Molten pool** | 3 | 600 | a 12-cell pool of lava appears for 60 s (a fixed area, it doesn't spread): anything in it burns, anything next to it catches fire; it cools to a black basalt scar |
| **Gravity well** | 3 | 500 | pulls enemies, debris and smoke toward a point for 8 s — then they all land at once |
| **Chain storm** | 3 | 900 | 15 s of lightning strikes across a 100-cell area |
| **Comet** | 4 | 2,500 | a huge meteor: radius 40 crater, a molten pool at the centre for 2 minutes, everything nearby on fire. A set piece |
| **Recall the line** **[ADDITION]** | 3 | 400 | every vehicle on one line jumps to its next station (save a convoy) |

Spells **combine**, and the game should notice: lightning into a rain zone, frost on a ford full of wading enemies, a
gust behind a line of fire, a gravity well before a meteor. The teletype prints a small commendation the
first time each combo happens. **[ADDITION]**

### 6.4 Mana crystal as a crafting material

- **Crystal lenses** (crystal + glass): parts for runed walls, ward pylons, battlemages.
- **Mana cells** (crystal + copper): portable power that replaces fuel for some vehicles and buildings.
- **Empowered units**: battlemages, crystal golems, crystal-hulled trains **[ADDITION: a crystal engine
  needs no fuel but gives off Glow along the whole line]**.
- **Magical power sources**: a crystal resonator makes electrical power from mana — trading magic for
  industry.

### 6.5 Mana per planet

Every planet's crystals have a **colour and a flavour** **[ADDITION]**: home blue (balanced), volcanic red
(+50% damage to fire spells, raw mana runs hot), ice white (frost spells cheap), crystal world violet
(huge yield, brutal Glowfeeders). Mana is **planet-specific**: each base has its own gauge, and mana can
be shipped between planets as mana cells, but at a loss (~30%).

### 6.6 Spills **[ADDITION]**

A destroyed dissolver, attunement works or battery, or a Glowfeeder death, leaves a **raw mana stain** on
the ground: a glowing patch of cells (a fixed area, it does not flow) that slowly fades. Raw mana makes
**wild effects** where it lies: small random sparks, grass growing in
seconds, enemies healed or mutated (a little bigger, a little glowing). The SPILL lamp lights; Arcanists
can clear it, or you can let it evaporate (it raises Glow while it does). A careless mana works becomes a
second front.

---

## 7. Research

### 7.1 The Calculator (how research is presented)

A wall-sized relay computer in a glassed-off room you see through a window on the ARCANE/FRONT wall:

- **Research projects are punch cards.** The Calculator's crew types a card for every project you can
  start; they appear in a rack. Drag a card into the **hopper** (or press its button) to queue it; up to
  4 queue.
- **Progress** is shown by **tape reels spinning** and a row of 10 lamps filling. The clatter of relays
  speeds up when it is fast (more labs = faster).
- **Results** print on the teletype and a **capsule comes down the pneumatic tube** with the blueprint
  card, which is filed into the Build Ledger with a satisfying slot sound. Big unlocks (a new machine for
  the console) come up the freight lift as a crate instead.
- **Research costs** materials and **samples** **[ADDITION]**: nest cores, enemy tissue, crystal from a
  new colour, soil from a new planet, satellite data reels. You cannot research everything by sitting at
  home; you have to go and get things. This is what ties exploration and combat into progression.
- A **tree view** exists too (the planner should keep a readable node graph for the "what does this
  unlock" question), shown as a big printed wall chart behind glass with pins in the done nodes.

### 7.2 Eras (about 120 nodes)

| Era | Name (placeholder) | Main unlocks | Sample needed to enter |
|---|---|---|---|
| I | **Outpost** | timber walls, hand camps, porters, mule carts, watch posts, bolt throwers, militia, tent rows, farm fields, the first mana harvester + 100 cap | — |
| II | **Foundry** | iron/steel, drills, stone walls, roads + steam crawlers, gun nests, mortars, floodlights, riflemen/scouts/sappers, thumper, the Dispatch Board, batteries Mk I | a stage-2 nest core |
| III | **Engine Age** | concrete, trucks, **rails + trains**, barges + docks, ramps through cliffs, **Long Spans** (bridges over deep water), arc masts, flame projectors, frost lances, steam walkers, seismic array, attunement works Mk II, tier 2 spells | 3 nest cores + a deep deposit sample |
| IV | **Arcane Works** | runed walls, ward pylons, battlemages, golems, crystal resonators, airships, pneumatic freight tube, tier 3 spells, batteries Mk III | crystal from 2 ley lines + a stage-4 core |
| V | **Rocketry** | launch pad, rockets, satellites + probes, the Orrery and Orbital Scope, mass driver | a full planet-day of weather data from a balloon station **[ADDITION]** |
| VI | **Interplanetary** | stations, ferries, landers, second bases, exotic-material buildings, shield emitters, mana lance, tier 4 spells | a soil sample from another planet |
| VII | **Stellar** | warp drive, trade routes, the Lodestar beacon (section 9.4) | samples from 4 planets |

Plus **repeatable research** at the end of every branch (+5% drill speed, +4% wall HP, −3% spell cost…)
that never ends, each rank a bit dearer. That is the incremental tail (section 9).

---

## 8. Space

### 8.1 Getting up

- **Launch pad + rocket.** A rocket is built in stages at the pad (frame, engines, tank, payload), filled
  with fuel, then launched with the **two-key launch interlock** on the SPACE wall (turn both keys within
  2 s — one is yours, one is "the Arcanist's"; on one device you just turn them in order). Countdown on a
  nixie display, the room shakes, the scope tracks the plume.
- A launch is loud: huge **Noise**. Nests notice. Launching is a defence event.

### 8.2 Orbit and scanning (the stripe mapper)

- The **Orbital Scope** shows the planet as a flat map (longitude across, latitude down). A satellite's
  **ground track** is a wavy line across it. As it flies, it reveals a **stripe** under it (the swath).
- The planet **turns**, so each orbit's stripe lands further west. Over several planet days the stripes
  cover the whole map. Gaps close slowly; you can watch it fill, which is the hypnotic satisfaction this
  mechanic is for.
- **Numbers (home world):** day = 24 real minutes; a satellite orbits in 1/12 of a day (2 min); its swath
  is 10° wide; each day it makes 12 passes spaced 30° apart, and the stripe drifts a little each day
  because the orbit is slightly out of step with the day. Full coverage of a **polar orbit** in ~3 days
  (72 min). An **equatorial orbit** only ever sees a band (cheap, fast, but limited). The launch dialog
  has an **inclination knob** (0°–90°) with the covered band drawn as you turn it.
- **Probe types (one per satellite):**

| Probe | Sees |
|---|---|
| Optical | ground, outcrops, rivers, cliffs, lava fields (only where it's daylight under the track!) |
| Metal spectrometer | metal deposits (copper, iron, tin, exotics with metal) |
| Crystal resonance | mana crystals and ley lines |
| Ice / liquid | water (shallow and deep), ice, oil, lava fields |
| Ground radar | deep deposits (any kind, but only "something big here") |
| Life sensor | nests and their stages |
| Weather | weather forecasts a full day ahead |

- On the home world the scan reveals what is in your map region and the deep ground around it. On another
  planet it is how you **choose where to land**: scan first, then pick a landing site with the best mix.

### 8.3 The system

- **The first system always has 6–10 planets** (from `universe/` star forge, which already does stars,
  planets, moons, rare elements per planet). The Orrery is a brass model that actually turns with game
  time; hovering a planet shows its card.
- **Further out = harder and richer:** each orbit out raises enemy tier and exotic value. The home world
  is always the gentlest habitable one.
- **Travel time** depends on where the planets are on the Orrery right now (they really move), so timing
  a departure matters without hard launch windows. A "best departure" lamp lights when the alignment is
  good. **[ADDITION, Kerbal-style windows made gentle]**

### 8.4 Stations and ferries

- **One station per planet**, built in orbit from rocket deliveries (6–10 deliveries for the core, more for
  modules: dock, warehouse, ferry yard, warp yard).
- **Ferries** are reusable automated ships between stations. A ferry line ("home ↔ red world") is a line
  on the Dispatch Board like a train line, with departures, cargo and status.
- **Cargo path between two planets' ground bases:** ground base → rocket or mass driver → home station →
  ferry → other station → lander → other base. Every leg is a real vehicle with a real trip time; the
  Dispatch Board shows the whole chain.
- **Danger in space:** low at first. Later worlds bring **Driftborn** pods that attack stations and
  ferries; stations get point-defence modules. Ships in transit can be hit only near stations, so space
  defence is about stations, not chasing ships (keeps it no-micro).

### 8.5 New bases

- Landing a new base uses a **landing kit**: a command pod (a mini HQ), 4 builders, a materials crate
  (e.g. 200 timber, 150 stone, 80 copper bar, 40 steel), a 30-unit food crate, and a **small mana battery
  (cap 150, full)** that regenerates slowly like the home HQ.
- **Switching bases:** the console has a **channel selector** — a keyed rotary switch labelled with each
  base. Turning it changes what the scope shows and swaps the gauge to that base's mana. A CRT "channel
  change" roll sells it.
- **Bases you are not watching** keep running at reduced detail (section 12). If a raid starts there, that
  base's alarm lamp flashes on the panel and the radio calls it; you have about 60 s of warning to tune in.

### 8.6 Warp, other systems and trade

- **Warp drive** is assembled at a station's warp yard: huge deliveries of exotics + a full big battery's
  worth of mana for each jump. It takes a ship (and later a ferry fleet) to a **nearby star system**,
  chosen on a star chart.
- A new system: 4–12 planets, different star types change day length, light colour, and how bright the
  scope's SIGHT picture is.
- **Trade routes:** ferries between systems on lines, like everything else. Each system's exotics are
  what other systems need, so a second system is an economic necessity, not a sightseeing trip.
- **Neutral traders [ADDITION]:** a merchant guild ship visits stations; you sell surplus for **credits**
  and buy rare samples you have not found yet. It is a pressure valve for a stuck economy and a reason to
  overproduce.

---

## 9. Progression and the incremental loop

### 9.1 The loop at every scale

**Look → claim → move → make → defend → reach further.** It repeats at the scale of an outcrop (minutes),
of the home map (hours), of a planet (a session), and of a star system (a campaign).

### 9.2 The incremental spine

- Building upgrades Mk I–V, repeatable research ranks, wall tiers, battery caps, vehicle ladders, nest
  stages that grow with you. Every ten minutes something gets visibly bigger — a needle passes a line, a
  line gets a second train, a wall turns from brown to grey.
- **The Commander's daily report [ADDITION]:** at the end of each planet day the teletype prints a
  short report: produced, shipped, lost, killed, mana spent, records broken ("highest daily copper:
  4,200 ▲ 18%"). It is the heartbeat of the incremental loop and costs nothing to make.
- **Commendations [ADDITION]:** medals from High Command for milestones (first train, 1,000 kills, a ring
  wall closed, a planet fully mapped). They hang on a board on the wall and each gives a small permanent
  bonus. They carry into a new game as a cosmetic only.

### 9.3 What sessions look like

**Hour 1 (home world, era I → II):** the bunker is nearly empty. Sensors show 160 cells around the HQ;
the rest is static. Porters carry copper and stone from three outcrops. You draw your first timber
palisade around the tents, put two watch posts on it, and the first small raid (12 Skitters) comes out
of the woods at minute 14 because the hand camps are noisy. A grass fire from a fallen brazier teaches
you that timber burns. You harvest your first crystals and cast lightning; the needle drops and crawls
back. By the end of the hour the outcrops near the HQ are drying up, a thumper has found an iron deposit
next to a stage-2 nest, and the Dispatch Board has just arrived on the desk.

**Hour 5 (home world, era III → IV):** a stone ring wall closed against a river on one side and a cliff on
the other, arc masts covering the ford where raids wade across.
Two outposts with their own small walls, linked by a rail line whose train plows through Skitters on the
way. 140 citizens, a school training engineers. Three nests cleared, one budded somewhere you have not
looked. The mana works glows at night; you have 1,500 cap and you have just dropped your first meteor on a
stage-4 nest, crater, burning ring and all. The Calculator is chewing on Rocketry.

**Hour 20 (three planets, first system complete, warp yard started):** the home world is a hub city with
three train lines and an airship mast. A volcanic world produces dawnsteel between lava fields that
Slagborn walk straight through — you learned to build that base behind a river instead. An ice moon's mana
makes frost spells cheap. Two ferry lines on the Dispatch Board. Every base's lamp row is green most of
the time; you spend your attention on the next problem, not on the last one.

### 9.4 Win state — both

- **The story goal [ADDITION]:** High Command's long directive is to light the **Lodestar** — a great beacon
  built at a station in a third star system that calls the rest of the fleet home. Lighting it is the
  credits roll: every base you built is shown on the Orrery, the beacon flares, the radio fills with
  voices.
- **Then endless:** keep playing — more systems, repeatable research, nest tiers that keep climbing.
- **Difficulty presets** (Calm / Standard / Grim) plus a **Peaceful** builder mode with no raids.

---

## 10. Juice

### 10.1 Explosions and chain reactions

- Every explosion: a white flash frame, a light pulse that lights the whole area for 200 ms, a crater,
  debris arcs with shadows, smoke that rises and drifts with the wind, and a low thump through the
  scope speaker.
- **Things that blow up:** powder stores, fuel tanks (and fire spreads from them), mana batteries
  (violet shock ring + a raw mana spill), Lobbers (acid splash), Glowfeeders (mana burst), steam walkers.
- **Chain reactions** are allowed to cascade and the game celebrates them: a counter ("CHAIN ×6") on
  the scope bezel and a teletype line. A meteor into a fuel depot that a raid has just reached should be
  the most memorable thing in the game.
- **Hit-stop:** a 30–60 ms freeze on big impacts (a train plowing a Ramhide, a meteor landing).

### 10.2 The bunker reacts **[ADDITION]**

- **Close explosions shake the room:** the console bounces a few pixels, dust drifts down across the
  glass, the ceiling lamp swings (its light moves across the machines).
- **When the HQ is hit:** the scope picture rolls (lost vertical hold), static bursts, colours fringe,
  the lamps flicker, the klaxon goes. Heavy damage cracks the scope glass (a crack overlay that stays
  until repaired) and knocks out one machine at a time (the radio goes to static, the teletype jams).
  Press **DEGAUSS** to clear the colour fringing.
- **Power loss:** the room goes to red emergency lighting, machines dim, the scope shrinks to a bright
  dot and comes back.

### 10.3 Sound

All synthesised (Web Audio + `sfx/`), no files to license:
explosions in three sizes with a sub-bass thump; lava's bubbling crackle and the hiss of water on lava;
fire's roar that grows with its size; train horn (a two-note chord) and the rumble of the rails; arc mast
crackle; meteor's rising whistle; rain on the bunker hatch; the room sounds of section 1.8.
**Loudness rules from `sfx/js/loudness.js`** so nothing is painful.

### 10.4 Little delights

- The scope's phosphor afterglow makes a train at night a bright comet tail.
- Lava at night lighting the underside of the smoke above it.
- Lightning briefly lighting the whole scope.
- The first time you close a ring wall: a green sweep of light along the whole loop.
- The Calculator's lamps doing a little celebratory chase when a big project finishes.

---

## 11. More of my own additions (in one place)

Each of these is also marked where it appears. The ones that matter most come first.

1. **The console grows** — new machines arrive as the game progresses (1.3).
2. **Sensors see differently** — smoke, steam and night blind optical sensors; radar/thermal see through
   (1.4). Physics becomes information.
3. **Noise and Glow** as two separate attractors for raids (5.3).
4. **Chair swivel** with a repeater scope on every wall (1.5).
5. **Samples drive research** — nest cores, planet soil, crystal colours (7.1).
6. **Spells need sight and projection range** — scouts and relay obelisks extend magic (6.2).
7. **Regrowing crystals on ley lines** — mana is defended, not emptied (6.1).
8. **Mana spills** as a second front (6.6).
9. **Weather per planet** that breaks defences (2.11) — a cold snap freezes your river line.
10. **Water and cliffs as the map's walls** — fords and cliffs as chokepoints, arc masts behind fords, the frost lance's double edge (2.2, 5.6).
11. **Commander's daily report** and **commendations** (9.2).
12. **Pneumatic freight tube** and **mass driver** (3.6).
13. **Shelter bunkers and festivals** in the town (4.2, 4.3).
14. **Strike orders** for clearing nests without micro (5.7).
15. **The Lodestar beacon** as the story goal (9.4).
16. **Neutral traders** (8.6).
17. **Spell combos noticed by the teletype** (6.3).
18. **Bunker damage states and DEGAUSS** (10.2).
19. **A rule breaker in every enemy family** (5.7).
20. **Photo mode [ADDITION]:** a "print" button on the scope that saves the current feed as a picture
    with a typed caption and grid stamp, like a recon photo. Cheap and very shareable.

---

## 12. Technical shape (for the planner)

### 12.1 No build step

Plain HTML, standalone CSS, ES modules, vendored libraries only (playground rules). Nothing is downloaded
at runtime. The bunker UI is **HTML/CSS/SVG** (knobs, switches, the gauge, the boards), crisp at every
screen size and cheap; the **Tactical Scope** and **Orbital Scope** are WebGL2 canvases. Machine textures
(enamel, brass, bakelite) can be painted by Codex (art only), everything else is code.

### 12.2 The simulation

- **Pure and deterministic:** a seeded random generator, a fixed tick (**20 ticks per second** for the
  world; fire and heat every tick, gas every 2nd, regrowth and cooling every 20th — there are no liquids or
  slopes to simulate), no clock or DOM inside. The same
  seed and the same orders always give the same result, so node tests and a balance bot can play whole
  games in memory (TinyRTS and Frontier Foundry both lived on this).
- **Integer maths for cells.** Avoid `Math.sin` and friends in the sim (they can differ between browsers);
  use lookup tables. Vehicles and units can use plain numbers if the operations are simple.
- **Runs in a Web Worker** in the browser; the worker sends **changed chunks** to the page each frame as
  transferable buffers (handing the memory over instead of copying it). **Do not plan on
  SharedArrayBuffer**: it needs special page headers (cross-origin isolation) that GitHub Pages cannot
  send. The same modules run in node for tests.
- **Sleeping chunks:** only chunks with something changing are stepped. Budget: **≤ 4 ms per tick on a
  mid-range phone** for the world, ≤ 2 ms for entities (up to ~800 enemies + 300 of yours + 100 vehicles).
  Flow fields cached per target and rebuilt only for chunks whose terrain changed.
- **Off-screen bases** (other planets) run a **summary sim**: production as rates, vehicles as timers,
  raids resolved by comparing raid strength to the defence rating of the walls/towers/posts on their path.
  When you tune in, the full sim takes over from the summary state. This is the hardest design-vs-tech
  compromise in the game; prototype it early.
- **Memory:** home map 2048² × 6 bytes = 24 MB for cells + ~4 MB for coarse layers; aim for a page under
  ~250 MB on a phone. Other planets not being watched keep only their summary + a compressed copy of their
  changed chunks.

### 12.3 The renderer (Tactical Scope)

- Each visible chunk's cells are uploaded as small textures (material+relief, temperature+wetness,
  flags). A single shader turns them into colour: material palette, **relief normals for lighting only**,
  sun shading and short soft shadows, water shimmer and reflections (shallow lighter, deep darker), lava
  glow with a slow animated crust pattern.
- **Light pass:** emissive cells and lights drawn into a half-resolution light buffer, blurred at 3–4 sizes
  (the cheap "mip blur"), combined with the sun. **Bloom** from the bright pixels. Then the **CRT pass**
  (curvature, scan lines, afterglow from blending in last frame, a little noise; all switchable).
- The **vector layer** (walls, rails, roads, pipes, bridges) is drawn as triangle strips in the same pass,
  with its own visual relief so it catches light and casts a soft shadow.
- **Entities** as sprites (instanced quads from one atlas).
- Draws only what is on the scope; zoom changes how many cells are visible, so the shader cost is about
  constant. Target **60 fps desktop, 30+ fps on a mid-range phone**, with a quality knob that halves the
  light buffer and turns off afterglow.

### 12.4 Saves

- **IndexedDB** in the browser: the seed + **only the chunks that changed** (compressed with the built-in
  `CompressionStream` gzip) + all entity, economy and research state as JSON. Most chunks never change, so
  a save should be a few MB at most even late on.
- Autosave every planet day and on tab hide; three slots; export/import as a file.
- **Cloud save:** `shared/rgs-cloudsave.js` copies **localStorage keys**, not IndexedDB. Either keep a
  compact "cloud slot" (state + compressed diffs, base64) in a localStorage key — only works while it stays
  under the browser's ~5 MB limit — or give `rgs-cloudsave.js` an opt-in IndexedDB adapter. The planner
  should pick; I'd extend the shared module (opt-in, so other games are untouched).

### 12.5 Standards checklist (from `~/claude/docs/game-standards.md`)

Phone first (402×780 checked every milestone), touch + keyboard + gamepad everywhere including menus,
https dev port for gamepads, ☰ menu and "!" report button on every screen (reports to a feedback endpoint;
a browser-only game can post to the RGS API), What's new changelog from the first publish, optional
account sign-in for cloud saves, plain language, no third-party IP, `window.gameEye.state()` so Claude can
look at and play the game, unit tests for every rule, Playwright on desktop + phone with zero console
errors, a balance bot from early on.

---

## 13. Risks, hard problems and a rough milestone order

### 13.1 Risks

| Risk | Why it is hard | What to do |
|---|---|---|
| **Fire, smoke and debris on a big map on a phone** | the cell-sim cost grows with area | flat world and no liquids already removes the biggest cost; sleeping chunks, a simulation window around the scope + around burning areas, a benchmark page from day one (Lanternfall kept 1.6 ms with a heavier sim) |
| **A flat map feeling samey** | no hills to give shape | the map generator's job is edges: rivers with a few fords, lakes, cliff-rimmed plateaus with one or two ways up, lava fields, marsh, forests (Noise sponges). Reuse `worldgen/` biomes for colour and placement |
| **The bunker interface being slow or fiddly** | knobs and keys can be slower than buttons | every control has a direct click, wheel, key and pad mapping; measure "time to draw a wall" against a plain-button version |
| **Phone layout** | 1 scope + 20 machines on 400 px | the drawer model (1.6) and the console-grows rule (fewer machines early) |
| **Readability of a pixel world at a distance** | 0.5 m cells on a 1 km map | the filter selector carries the strategy views; SIGHT is for beauty and close work |
| **Off-screen bases** | full sim of 3–6 planets is impossible | summary sim + tune-in (12.2); prototype in the first interplanetary milestone |
| **Pathfinding over a changing map** | walls, rubble, ice, breaches and ridges change paths constantly | chunked flow fields, rebuilt per changed chunk; enemies chew walls when blocked (never get stuck) |
| **No-micro army that still feels like command** | without click-to-move, units can feel like scenery | posts, patrols, response teams, strike orders, plus radio chatter so you *hear* your orders carried out |
| **Scope creep** | this is a 4X + city builder + RTS + sim | a playable home-world game before any space work (milestone 7) |
| **Balance across eras** | Frontier Foundry's bot stalled mid-game and never reached a rocket | build the balance bot alongside the economy (milestone 3), teach it to widen a short chain and to build compactly, and make "time to rocket" a test |
| **Determinism in a worker** | float maths and ordering bugs | integer cells, ordered entity updates, a test that runs the same seed twice and compares a hash |
| **Cloud save size** | world diffs can grow | chunk diffs + gzip; an IndexedDB adapter for the shared module |

### 13.2 Suggested milestone order (rough — the planner owns the real one)

1. **Cell world toy** — a test page with the flat cell grid, a generated map (water, lava fields, cliffs),
   fire, smoke, explosions, rubble, debris and relief lighting on WebGL2, in a worker, with a benchmark. Paint materials with the mouse. Prove the
   phone budget here before anything else.
2. **The bunker shell** — the console on desktop + phone: scope, range knob, filter selector, tool bank,
   teletype, radio, light pen, gamepad driving it. Sensor fog with the three states.
3. **Economy core + balance bot** — outcrops, hand camps, porters/mule carts, depots with yard rings,
   requests/offers, the dispatcher, smelting, jam lamps, **roads and bridges** (2.5), a node bot that plays it.
4. **Walls, towers, nests and raids** — polyline walls with joins, gates, tiers, upgrade-in-place,
   blueprint rebuild; the damage rule (5.1); Noise; nests that grow and bud; raids with flow fields that
   chew walls.
5. **Units on posts and patrols** — Garrison Board, posts, patrols, response teams, strike orders.
6. **Town** — housing, food, water, morale, crews, shelters.
7. **Mana and spells (tiers 1–2)** — crystals, raw mana pipes, attunement, gauge, batteries, the casting
   flow, 8 spells with their physics hooks, Glow. **At this point the home world is a whole game** —
   publish a first playable here.
8. **Research** — the Calculator, punch cards, tube deliveries, eras I–IV, samples, the console growing.
9. **Vehicles ladder** — trucks, rails + trains (plow, stations), barges + docks, airships, Long Spans.
10. **Saves** — IndexedDB, chunk diffs, export/import, cloud save.
11. **Space I** — launch pad, rocket, orbit, satellites, the stripe mapper, probe types, the Orrery.
12. **Space II** — other planets (from `universe/`), landing kit, second base, stations, ferries, the
    summary sim for off-screen bases, enemy families per planet.
13. **Space III** — warp drive, a second system, trade routes, neutral traders, the Lodestar goal.
14. **Juice and sound pass** — chain reactions, bunker damage states, radio voices, room sounds (should
    also be sprinkled into every milestone, but give it a dedicated pass).
15. **Balance + weather + polish** — the bot plays to the beacon; weather; difficulty presets.

---

## 14. Top 10 ideas I'd fight for

1. **The world is only ever seen through instruments** — the scope is a sensor feed, fog is sensor range,
   and smoke, steam and night actually blind you. This is the commander fantasy, made into rules.
2. **The console grows as you progress** — your desk filling up with machines *is* the progress bar, and
   it keeps the first ten minutes simple without a tutorial screen.
3. **Noise and Glow** — industry and magic draw different enemies to different places, so every planet
   asks "what do I defend here?"
4. **A flat map carved by edges** — rivers, lava fields and cliffs make chokepoints; roads become bridges
   where they cross shallow water; walls snap to the map's own edges; lightning chains through raiders
   wading a ford; a cold snap can freeze your river line.
5. **Spells are fire missions with real physics** — arm the key, aim, fire, wait for the streak; the meteor
   leaves a scorched crater, a rubble ring and burning grass that the world keeps simulating.
6. **Units are stationed, never steered** — posts, patrols, escorts, response teams and strike orders, with
   the radio telling you your orders were carried out.
7. **Trains that plow** — indestructible rails, a train that smashes through a swarm with a crunchy
   hit-stop, and one rare beast big enough to stop it.
8. **The stripe mapper** — a satellite slowly painting a planet stripe by stripe over a few planet days,
   then choosing a landing site from what it found.
9. **The bunker reacts to the war** — dust from the ceiling on close blasts, the picture rolling when the
   HQ is hit, the DEGAUSS button, red emergency light when power fails.
10. **The Commander's daily report** — one teletype page per planet day with records and trends: the
    heartbeat of the incremental loop, and nearly free to make.
