# Fold & Fang (Hunters vs Farmers) — final plan

> **Owner naming (lead, 2026-10-03):** the mode is titled **"Hunters vs Farmers"** in the UI, as the owner asked for it by name (plain descriptive words). "Fold & Fang" is not used.

Status: **final for build**, 2026-10-03. Supersedes `docs/hvf-plan.md` (v1) wherever they differ;
every roast change in `docs/hvf-roast.md` is applied here (R-numbers in brackets). Research with
sources: `docs/hvf-research.md` (the only page that names the old maps). Owner items covered:
R2.12–R2.19 (§20 audits them), R2.20 noted in §19.

**Scheduling:** owner rule — this mode is built **after line war is finished**. Two pieces touch no
line-war file and may start earlier if the lead has a free agent: H1 (the world generator + compare
page) and the creature art in H6.

**Must-keep feel** (owner; no stream may trade these away — see `feedback-genre-feel-over-paper-balance`):
1. **Hiding** — find a hollow, wall the door, lie low.
2. **Animals wander and are the main tell** — never leash them.
3. **Cookie-clicker growth** — many producers, each copy dearer, multipliers, the number climbs. Gold
   is the only gate: no income caps, no build timers, no tech time-locks.
4. **Tense hunting** — hunters deadly early, falling off; the farmers' mid-game flip.
5. **Farmers can't attack** — their army can, from mid-game.

---

## 1. The mode in one paragraph

A seeded forest world: glades joined by winding trails, plateaus with cliffs, ponds, briar mazes,
tall grass and long walls of trees you can chop through. 2–9 **farmers** start together on the
**Commons** in the middle and have about 45 s to scatter before 1–3 **hunters** come out of their
**kennels**. A farmer can't attack. He finds a hidden **hollow**, builds a **hen coop** or a **sheep
pen**, and the animals start earning gold — but animals **wander**, and a sheep standing on a trail
is how a hunter finds a base. Gold buys more producers (each copy costs 15% more), feed and breeding
upgrades, a sheepdog, fences, **briar hedges** only farmers and their animals squeeze through, arrow
towers and lookout posts. Hunters hear bleating through the trees, follow the tracks strays leave,
chop through tree walls, plant **watchstones** (vision the farmers can pull up), fly a hawk, lay
snares and build **lodges** around the map. Hunters are deadly at minute 2 and merely dangerous by
minute 15: by then the farmers raise **scarecrows** and **crow flocks** from a **Harvest Hall** and
march on the lodges. Hunters win the moment every farmer is a ghost; farmers win by putting every
hunter out, or by having anyone alive when the clock runs out.

**Name** [R26]: player-facing title **Fold & Fang** (a fold is a sheep pen), mode-card subtitle "hunters
vs farmers". Internal id `hvf`. The owner may veto the title; changing it is one string in
`data/hvf/rules.json` + the mode card.

---

## 2. Mode plumbing (plugs into stream A's framework)

Stream A is building `js/sim/modes/` (R2.10: `config.mode` + `config.format`, back-compat `'1v1'`).
HvF is **one mode module plus its data**; it never edits `sim.js`, the line-war systems or
`js/sim/items.js` [R23]. What HvF needs from the framework (request to A in `docs/requests.md` if
any is missing):

```js
// js/sim/modes/hvf/index.js
export default {
  id: 'hvf',
  formats: ['2v1','3v1','4v1','4v2','5v2','6v2','7v2','8v2','6v3','7v3','8v3','9v3'], // farmers v hunters
  dataFiles: ['hvf/rules.json','hvf/buildings.json','hvf/animals.json','hvf/units.json',
              'hvf/hunter.json','hvf/hunter-items.json','hvf/mapgen.json','hvf/ai.json'],
  validate(config, data),            // throws Error with a lobby-readable message
  buildMap(config, data),            // pure; the world generator (§3) — static, not in state
  createState(config, data, map),
  step(ctx, commands),               // HvF's own pipeline (§2.2)
  commands: { type: fn },            // §2.3
  queries,                           // §2.5, re-exported for the UI
  checkResult(ctx),
};
```

Framework requirements this mode tests (and that keep R2.20's future modes unblocked): **seats carry
a `role`, not a race/hero**; teams may be **unequal in size**; the **mode owns the map builder and the
step pipeline**; **data files are per mode** and all join the data hash; queries are per mode.

### 2.1 Config

```js
{ seed, mode: 'hvf', format: '6v2', map: 'wild',
  players: [ { role: 'farmer', name, kind: 'human'|'ai', ai: { difficulty }, colour: 0..8 },
             { role: 'hunter', ... } ],
  rules: { timer: 1800, headStart: null /* from the format table */, size: 'auto' } }
```

### 2.2 Step pipeline (order matters for determinism)

`commands → AI commands → timers → hunterRelease → buildTick (construction, breeding) → incomeTick
(every 20 ticks) → animalThink → unitThink (characters, scarecrows, crows, hound) → moveTick (grid
collision, briar rule) → combat (shared damage maths) → noiseAndTracks → visionTick (team = tick % 4)
→ seenMemory → turnTick (every 20 ticks) → ghosts/respawns → cleanup → checkResult`.

### 2.3 Commands (all `{ p, type, ...args }`, illegal → `reject` with a reason)

| type | args | who | effect |
|---|---|---|---|
| `move` / `amove` / `stop` / `moveDir` | as line war | both | character (and, with `ids`, selected army units) |
| `attack` | `target` | hunter, army | |
| `build` | `kind, x, z, rot?` | farmer | place a building (footprint snapped to cells); the farmer walks there and builds |
| `chop` | `cell` | both | walk to a tree/briar cell and cut it (farmer 4 s, hunter 2 s, Axe ×3); pays 2 g |
| `cast` | `slot, x, z, target?` | both | farmer: Scamper / Lie Low / Bell; hunter: Pounce / Snare / Hawk / Horn |
| `pullup` | `target` | farmer | 3 s channel on a watchstone or snare in reach: removes it (not an attack) |
| `revive` | `target` (grave) | farmer | 4 s channel at an ally's grave |
| `upgrade` | `id` | farmer | buy a farm upgrade (Feed, Shears, Breeding, Stuffing) |
| `train` | `unit, building` | farmer | queue a Scarecrow / Crow Flock at a Harvest Hall |
| `rally` | `building, x, z` | farmer | where new animals/units walk to first (the old maps' herding tool) |
| `order` | `ids, kind: 'move'|'amove'|'attack'|'stop', x?, z?, target?` | farmer | command army units |
| `buy` / `sell` / `equip` / `use` | via the items adapter | hunter | the 6-slot items runtime from stream I, HvF catalogue [R22] |
| `lodge` | `x, z` | hunter | build a lodge (300 g, 12 s; max 3 including the kennel) |
| `ward` | `x, z` | hunter | plant a watchstone from inventory |
| `surrender` | — | both | your side loses (vote if > 1 human on the side) |

Reject reasons add `'blocked'` (bad footprint), `'needs'` (Harvest Hall needs 3 producers),
`'cap'` (animal or army body cap), `'reach'`, `'role'`.

### 2.4 Events

`spawn, despawn, built, buildStart, lost (building), animalBorn, animalKilled {by, x, z}, noise {x, z,
kind}, track {x, z, dir}, spotted {team, ent}, wardPlanted, wardPulled, snared, farmerDown {grave},
farmerRevived, hunterDown, hunterOut, released (hunters out of kennels), turn {value, reason}, gold
{amount, why}, reject, result`. The view plays sounds and pings from these; nothing visual is decided
in the view.

### 2.5 Queries (`js/sim/modes/hvf/query.js`, pure)

`clock` (time left, release countdown, income tick), `farmerInfo(pid)` (gold, income/s and its parts,
animals by kind, **strays**, buildings, next-copy prices, upgrades, revive/respawn state),
`buildMenu(pid)` (rows with cost, income, payback seconds, **tell rating** 0–3, canBuy, reason),
`hunterInfo(pid)` (level, xp, gold, wards, snares, lodges, respawn, skills), `turnInfo` (value, the
two sides' values, one-line reason), `visibleTo(team, x, z)`, `fogTexture(team)` (the packed bitset for
the view), `seenBuildings(team)`, `sideInfo(role)` (alive/ghost/out counts).

### 2.6 State (`state.hvf`, plain JSON-safe data)

```js
{ chopped: [cellIdx...],            // sorted ints; walk/sight grid = map cells patched by this
  vision:   [[int32...], [int32...]],   // per team, packed bitset of cells seen now   [R4]
  explored: [[int32...], [int32...]],   // per team, ever seen                         [R4]
  seen:     [[{ id, kind, x, z, tick }], [...]],   // last-seen buildings per team
  tracks:   [{ x, z, dir, tick, owner }],          // stray tracks, pruned after 20 s  [R3]
  graves:   [{ pid, x, z, since }],
  turn: 0, releaseTick, endTick }
```

Vision lives **in state** so a snapshot restored between vision updates can't recompute a different
grid [R4]. At the largest map (160² cells) each bitset is 800 ints.

---

## 3. The world generator (`js/sim/modes/hvf/mapgen.js`, pure, ≤ 150 ms)

### 3.1 Grid and cell kinds

2 m cells. Elevation **2 levels** (ground, plateau) [R9]; a unit on the ground can't see onto a
plateau, a unit on a plateau sees down (the old maps' best hiding rule).

| Kind | Walk | Sight | Notes |
|---|---|---|---|
| `grass` | yes | clear | buildable |
| `trail` | yes, +10% speed | clear | buildable (but obvious) |
| `tree` (3 looks) | no | blocks | choppable (farmer 4 s, hunter 2 s) → grass, 2 g |
| `briar` | farmers + animals only | clear | hunters/army chop it in 1 s; the "sheep-sized gap" |
| `tallgrass` | yes | clear, but a unit **standing in it** is seen only from ≤ 2 cells | |
| `rock` | no | blocks | not choppable |
| `water` | no | clear | |
| `ford` | yes, −30% speed | clear | |
| `cliff` | no | blocks from below | border between levels |
| `ramp` | yes | clear | joins levels |

### 3.2 Steps (rng stream `mapgen`, integer-hash value noise, `sortBy` only) [R10]

1. **Size** from the format table (§9): 192–320 m.
2. **Plateaus:** 2-octave value noise thresholded to ~18% of the area, cellular smoothing, each plateau
   gets 1–2 ramps.
3. **Glades:** Poisson-disc centres (count ∝ area), radius 5–14 m, cleared.
4. **Trails:** k-nearest (k = 4) graph over glades → minimum spanning tree + 25% of the other edges for
   loops → each edge carved as a noisy polyline (midpoint displacement), 3–5 m wide.
5. **Forest** everywhere else; a cellular pass roughens edges; tallgrass patches; ponds in low noise
   basins; one stream with 1–2 fords.
6. **Feature vocabulary** [R8] — stamped where they fit, each with its own validator, counts in
   `data/hvf/mapgen.json`:
   - *pocket valley* — a hollow on a plateau with one ramp;
   - *briar maze* — a glade ringed by briar with two farmer-only gaps;
   - *pond island* — a hollow reached only by a ford;
   - *ravine trail* — a trail between two cliff walls (an ambush spot);
   - *stone ring* — an open glade of standing rocks (a landmark everyone can name);
   - *old orchard* — a big glade, great farmland, exposed;
   - *deadfall wall* — a long tree wall across the map with one or two choppable gaps.
7. **Hollows** (hidden build spots): ≥ 2 × farmers, 6–10 m across, 8–20 m of forest off a trail, entered
   by a briar gap, one choppable tree, a ramp or a ford. Each hollow carries **build slots** — a few
   layouts fitted to it (door cell, pen cells, tower cell) for the AI only [R11].
8. **Commons** (centre glade, farmers' start) and **kennels** (1–3, on the rim, spread by angle).
9. **Validate** by flood fill: every glade and hollow reachable for a farmer; ≥ 85% of glades reachable
   for a hunter without chopping; hollows ≥ 2 × farmers; forest 35–55%; ≥ 3 trail loops; every kennel
   ≥ 60 m from the Commons. Fail → retry with `seed + k` (k ≤ 8), else throw.

### 3.3 Output (`sim.map`, static)

`{ id: 'wild', size, cols, rows, cell: 2, cells: Uint8Array, level: Uint8Array, graph: { nodes: [{ id,
x, z, kind: 'glade'|'junction'|'hollowMouth'|'landmark', name }], edges: [{ a, b, len }] }, hollows:
[{ id, cells, mouth, slots }], features: [{ kind, x, z, name }], commons, kennels, metrics }`.
Typed arrays are fine here because the map is rebuilt from the seed on restore and never serialised.
Landmark names come from Name Forge (`namegen/`) through an rng adapter, for the minimap and pings
("Sheep spotted near the Stone Ring").

### 3.4 Quality

`metrics`: dead-end count, mean branching, hollow hiddenness (distance from trail × share of the
hollow not visible from any trail cell), largest open area, plateau share. `hvf-map.html` (2D canvas,
no three.js) shows one seed with layers (cells, graph, hollows + slots, metrics) and a **16-seed
compare grid** so the owner can judge by eye (as proctown does). H1 ends with the owner looking at it.

---

## 4. Fog of war and vision (`js/sim/modes/hvf/vision.js`)

- **Per team**, recomputed on ticks where `tick % 4 === team` (5 Hz each, staggered) [R4].
- **Line of sight:** precomputed **integer ray tables** per radius in cells (built once at load from
  integer circle maths — no trig) [R5]. Opaque: tree, rock, cliff-from-below, wall and fence
  buildings, plateau-from-ground. **Stamps** (a precomputed disc, no LOS) for animals and anything
  with radius ≤ 3 cells [R7].
- **Radii (m):** farmer 16, hunter 14 (+30% Spyglass), animals 6, arrow tower 16, lookout post 20,
  watchstone 12, hawk 12, lodge 10, scarecrow 10, crow 14, hound 10.
- **Concealment:** a unit in tallgrass is seen only within 2 cells; a farmer **lying low** is seen only
  within 3 m; watchstones and snares are seen by farmers only within 6 m.
- **Memory:** explored bitset + last-seen buildings per team; the view draws remembered buildings as
  grey ghosts where they were last seen.
- **Noise** (event `noise`): sheep bleat, pigs and cows are louder, hens cluck quietly. Emitters run on
  tick arithmetic `(tick + id * 7) % period === 0` [R6]. A hunter within the noise radius (hen 10 m,
  sheep 18, pig 25, cow 22) hears it through fog: sound + **minimap ripple + screen-edge arrow** [R19].
  The AI uses the same rule.
- **Tracks:** only **strays** (animals outside their wander radius) and fleeing animals leave a track
  every 2 s, kept 20 s [R3]. Hunters see tracks in their vision from level 3 (*Tracking*); the arrow on
  the print shows which way the animal went — usually home.
- **Integrity:** lockstep shares commands, so every client holds the whole state; fog is enforced by
  the client. Accepted for friends' games (line war §11.5).

---

## 5. Animals (the tell)

- Each producer breeds its animals one at a time (hen 15 s, sheep 25, pig 30, cow 45; *Breeding* halves
  it) up to its capacity; new animals walk to the building's **rally point** first.
- **Wander:** every 3–6 s (rng stream `animals`) pick a point within the wander radius of home (hen 6 m,
  sheep 10, pig 7, cow 12) and amble there; grid collision; **fences and walls stop them, briar does
  not** (so the briar door that keeps hunters out lets sheep out — the farmer must choose).
- **Crowding ("too many sheep", R2.16):** a building's comfort = open cells within its wander radius / 6.
  While the animals around it exceed comfort, their wander radius is ×1.5. Packing six pens into a
  tiny hollow pushes the flock out onto the trail.
- **Flee:** an animal that sees a hunter or army unit within 6 m runs **away** for 4 s, often out of the
  hollow, leaving tracks. *Bell* (farmer) sends every own animal within 30 m home at a trot; the
  *Sheepdog* building halves the wander radius of animals within 18 m.
- **Stray:** outside wander radius × 1.2 → counted on the farmer's HUD in red, leaves tracks.
- **Owner down:** a ghost farmer's animals **go wild** (wander radius ×3, no income) until he's back.
- **Cap** [R17]: 60 animals per farmer, 420 in the match (a performance limit, as the old maps had). At
  the cap a building stops breeding; **income keeps growing through multipliers**.
- Animals belong to the farmer team for vision: the flock is both the tell and the alarm.

---

## 6. Farmer kit (`data/hvf/buildings.json`, `units.json`, `rules.json`)

**The farmer** (one type, R2.18): 260 HP, 5.6 m/s (hunter 5.2), radius 0.35, cannot attack. Colour
choice in the lobby (a hat band + ground ring).

| Ability | Effect |
|---|---|
| **Scamper** [R27] | +60% speed for 2.5 s, 18 s cooldown |
| **Lie Low** | stand still 1.5 s in tallgrass or at a forest edge → seen only within 3 m until he moves |
| **Bell** | own animals within 30 m go home, 25 s cooldown |
| **Build / Chop / Repair** | repair costs 25% of the lost share of the price |
| **Pull Up** | 3 s channel: remove a watchstone or snare |
| **Revive** | 4 s channel at an ally's grave |

**One resource: gold** [R1]. Start 60 g. Income paid every second (shown per second); chopping pays 2 g.

### 6.1 Producers (cookie clicker; each further copy of the same building ×1.15)

| Building | Cost | Makes | Income | Payback | Tell (0–3) |
|---|---|---|---|---|---|
| Hen Coop | 30 | 3 hens × 0.10 g/s | 0.30 g/s | 100 s | 1 — small, quiet |
| Sheep Pen | 90 | 4 sheep × 0.22 | 0.88 | 102 s | 2 — bleats |
| Pigsty | 220 | 3 pigs × 0.45 | 1.35 | 163 s | 3 — loud |
| Cow Barn | 600 | 2 cows × 1.40 | 2.80 | 214 s | 3 — big and slow |
| Beehive [R24] | 160 | — | 0.40 flat | 400 s | 0 — silent |
| Granary | 400 | — | +10% all income (adds) | — | 0 |
| Windmill | 1500 | — | +35% all income (adds) | — | 2 — tall: seen over trees from 40 m |

The build menu shows **payback seconds and the tell rating** on every row: the core decision is
quiet-and-slow against loud-and-fast.

### 6.2 Upgrades (per farmer)

Feed I / II / III (150 / 450 / 1200 g, +25% animal income each) · Shears (300 g, sheep +50%) · Breeding
(200 g, breed time ×0.5) · Sheepdog (building, 120 g) · Stuffing I / II / III (400 / 900 / 1800 g,
scarecrow HP and damage +25% each — the v1 Hay Golem folded in [R2]).

### 6.3 Defence

| Building | Cost | HP | Notes |
|---|---|---|---|
| Fence (1 cell) | 8 | 120 | blocks everyone and animals; blocks sight |
| Stone Wall (1 cell) | 25 | 600 | as fence, tougher |
| Briar Hedge (1 cell) | 15 | 200 | farmers + animals pass, hunters/army don't |
| Mud Patch (2×2) | 20 | — | hunters −40% speed and attack speed |
| Lookout Post | 25 | 80 | 20 m sight |
| Arrow Tower | 180 | 500 | 24 dmg/s, range 12 m, 16 m sight |
| Farmhouse | 200 | 700 | one per farmer: his respawn point |

### 6.4 Mid-game offence (the flip)

**Harvest Hall** — 1200 g, needs 3 producer buildings (a price gate, never a timer). Trains:

| Unit | Cost | Stats | Role |
|---|---|---|---|
| Scarecrow | 220 | 650 HP, 28 dmg/s melee, 4.4 m/s, 10 m sight | the army; can hit lodges |
| Crow Flock | 160 | 3 crows, 120 HP each, 8 dmg/s each, flyer, 6.5 m/s, 14 m sight | scouting, picking off wards, harass |

Army body cap 30 per farmer (performance). Units use `rally` and `order`.

### 6.5 Death and return

A downed farmer becomes a **ghost at his grave** (stationary; the grave is visible to everyone, so a
hunter may camp it). An ally's 4 s *Revive* or his own **Farmhouse after 40 s** brings him back, **no
gold cost** [R15]. Meanwhile his animals go wild (§5). Hunters get 120 g + XP per down.

---

## 7. Hunter kit (`data/hvf/hunter.json`, `hunter-items.json`)

**The hunter** (one type, R2.18): 1200 HP, 60 dmg melee at 1.0/s + a thrown spear (8 m, 6 s
cooldown), 5.2 m/s, radius 0.9 (can't pass briar), 14 m sight. HP and damage × the format's
multiplier (§9). Levels 1–10 from **kills only** (no neutral creeps — the old maps' camping
complaint): +8% HP and damage per level.

| Skill | Effect |
|---|---|
| Q **Pounce** | leap 8 m to a point, 10 s |
| W **Snare** | place a hidden snare (max 3 standing): roots a farmer 3 s, slows a scarecrow; farmers see it within 6 m and can pull it up |
| E **Hawk** | a hawk flies to a point and circles 12 s (12 m sight), 30 s |
| R **Hunting Horn** (level 6) | every animal within 40 m is revealed 5 s and bolts **toward home** |
| Passive **Tracking** (level 3) | sees stray tracks |

**Gold:** start 150, +1 g/s, bounty hen 4 / sheep 10 / pig 18 / cow 40 / buildings 30% of cost /
scarecrow 40 / farmer 120. **6 item slots** through stream I's runtime with an HvF catalogue [R22]:
Horse I / II / III (150 / 350 / 700, +15 / 30 / 45% speed, one horse equipped), Woodsman's Axe (120,
chop ×3), Spyglass (200, +30% sight), **Watchstone** (40 g, 3 charges: 12 m sight with LOS, lasts 5
min, 60 HP), Flare (60 g consumable: reveal 20 m for 6 s), Hound (250 g: a pet that runs to the
nearest animal within 20 m and bays), Torch Oil (100 g consumable: ×2 vs buildings for 60 s), Snare
Kit (+2 snares standing), and stacking combat items (damage, armour, regeneration). Items stack (R2.2),
a few are "unique equipped".

**Lodges:** every hunter starts with a **Kennel** that counts as a lodge [R14]; he may build more
(300 g, max 3 including the kennel): shop + respawn + 10 m sight. Respawn 15 s + 3 s per death. A
hunter who dies with **no lodge standing is out**.

**Why the hunter falls off (R2.15):** his strength is a finite ladder (10 levels, 6 slots), his income
is a trickle plus what he finds, while the farmers' income compounds. The **Turn** (§8.2) makes the
crossing visible.

---

## 8. Win, length, and the Turn

### 8.1 Win

- **Hunters win** the moment every farmer is a ghost.
- **Farmers win** when every hunter is out, or when the clock reaches zero with at least one farmer
  alive. Clock from the format table (20–30 min), lobby override 20 / 25 / 30 / 40.
- Results screen: who won and why, each farmer's income curve, animals lost, how each base was found
  (stray / noise / track / ward / hawk / horn / seen directly), hunter kills, the Turn over time.

### 8.2 The Turn [R18]

`turn` in −1..+1, computed every second: farmers' **army + tower value** vs hunters' **combat value**
(level, items, count), both in gold-equivalent (weights in `rules.json`). The HUD draws it as a moon
from new (hunters' night) to full (farmers'), with a one-line reason ("The farmers out-earn you 3:1").
The AI uses the same number for the flip. Target: turn crosses 0 around **minute 11–16** in balanced
play (`tools/hvf-econ-sim.mjs`, **advisory** — owner: balance later [R25]).

---

## 9. Formats (`data/hvf/rules.json` table) [R16]

| Format | Map (m) | Hunter mult | Head start | Default clock |
|---|---|---|---|---|
| 2v1 / 3v1 / 4v1 | 192 / 208 / 224 | 0.80 / 1.00 / 1.20 | 40 / 45 / 45 s | 20 / 20 / 25 min |
| 4v2 / 5v2 / 6v2 | 240 / 256 / 272 | 0.80 / 0.90 / 1.00 | 45 s | 25 / 25 / 30 min |
| 7v2 / 8v2 | 288 / 304 | 1.10 / 1.20 | 50 s | 30 min |
| 6v3 / 7v3 / 8v3 / 9v3 | 288 / 304 / 320 / 320 | 0.85 / 0.95 / 1.05 / 1.15 | 50 s | 30 min |

Numbers are starting values for the econ sim and play-tests.

---

## 10. AI (`js/sim/modes/hvf/ai/{farmer,hunter,suspicion,path}.js`, `data/hvf/ai.json`)

Same rules as line war: runs inside the sim on its own rng stream, reads only its team's vision and
memory (no peeking), acts through the same commands. Difficulties **Recruit / Veteran / Commander**.

**Farmer AI:** scores hollows (hiddenness metric, distance from trails and kennels, plateau bonus,
spread from allies) and takes a **build-slot set** [R11]; builds by payback weighted by tell
(Commander shifts from quiet to loud producers as walls and towers go up); rings the Bell on strays;
walls the door with briar, later stone + a tower; flees along the trail graph when a hunter is seen
and Scampers when one is close; revives allies when the grave is not watched; at the flip builds a
Harvest Hall and sends scarecrows at the lodges it has seen (crows first to scout and pull wards).

**Hunter AI:** a **suspicion map** over the graph nodes [R13] — evidence weights: noise heard 3, animal
seen 5, stray track 4 (with direction), last-seen building 10, watchstone sighting 6, unexplored pocket
1; decay per difficulty. Goes to argmax(suspicion / travel time); plants watchstones on the busiest
junctions; chops into pockets; Horn when suspicion is high but nothing is visible; buys Horse →
Spyglass → Watchstones → Hound; builds lodges spread out; retreats to a lodge below 30% HP.

**Pathing** [R12]: A\* on the cell grid with tree cost = chop time (hunters cut through when it's
quicker), the `flow.js`-style deterministic heap, **≤ 2 searches per tick** shared by all AIs, cached
per (target node, chopped-list length).

| Knob | Recruit | Veteran | Commander |
|---|---|---|---|
| Reaction (ticks) | 30 | 14 | 6 |
| Herding | Bell at 4 strays | at 2 | at 1 + sheepdog |
| Hiding | random valid hollow | best-scored | best-scored + spread + briar door |
| Hunter memory decay | fast | medium | slow + tracks + noise triangulation |
| Watchstones | 1 at a time | 3 | 3 per hunter on choke nodes |
| Flip | rarely | at 3 scarecrows | when the Turn says the army wins |

**Bars** (decisions, not clicking): Commander with Veteran micro beats Veteran ≥ 60% over 50 seeds on
each side; Veteran beats Recruit ≥ 80%.

---

## 11. Lobby, online, split screen

- **Mode screen first** (R2.11, stream B): cards for Line War and **Fold & Fang**; planned modes shown
  greyed (§19).
- **HvF lobby:** a Hunters column (1–3 seats) and a Farmers column (2–9), format derived from the seats,
  clock, map size (auto / small / large), seed (random or typed, so a fun forest can be replayed). Each
  seat: Local (device icon, as line war's ready-up) / Remote / AI + difficulty / Closed. No hero or race
  pick (R2.18); farmers pick a colour.
- **Online (R2.19):** the same lockstep, transport and data hash; HvF's data files join the hash.
  Disconnect → Veteran AI takes the seat from an announced tick.
- **Split screen** [R21]: each half draws its own team's fog. Opposite roles on one couch are allowed
  with the note "Both screens are visible — no peeking"; local seats default to the same role.
- Back to the HvF lobby after results, seats kept.

## 12. Camera and HUD (stream B)

- Camera as line war (perspective, pitch ~50°) with zoom out to 90 m; follows your character, free
  pan with a toggle (farmers managing a base, hunters scouting with the hawk).
- **Farmer HUD:** gold, income/s (tap for the breakdown), clock, release countdown, **Strays** (red),
  animal count per building, build grid in the control bar with payback + tell icons, army bar after
  the Harvest Hall.
- **Hunter HUD:** gold, level/XP, watchstones and snares left, lodges, tracks overlay, item slots.
- **Both:** the Turn moon, minimap with fog + remembered buildings + ripples, alerts ("A sheep was
  taken near the Stone Ring", "Your watchstone was pulled up", "Hunter spotted"), sides strip (farmers
  alive / ghost, hunters alive / out).
- **Onboarding** [R20] with the line-war hint component — farmer: find a hidden spot → build a sheep pen
  → keep your flock close (Bell) → wall the door → raise scarecrows; hunter: listen for animals →
  follow tracks → plant a watchstone → build a lodge → hunt the strays.

## 13. View (stream B)

`js/view/hvf-terrain.js` (ground from cells + plateaus, cliffs, water, trails, tallgrass), trees as 3
InstancedMeshes with a cross-billboard far ring and no shadows beyond 40 m; a chopped tree is hidden
by swapping its instance matrix [R28]. `js/view/fog.js`: one R8 `DataTexture` per local team from the
bitset at 5 Hz, smoothed in the ground/tree/building shaders; enemy units in unseen cells hidden;
remembered buildings grey. Animals drawn as instanced rigid meshes with a vertex-shader walk bob (one
draw per species). Tracks as decals visible only to hunters with Tracking.

## 14. Art (stream C; new creatures go into avatar-3d + library)

| Asset | How | Where |
|---|---|---|
| `sheep` | quad + new `wool` feature (lumpy fleece) | `avatar-3d/js/creature-types.js` + variant + library `bl_sheep` |
| `hen` | small `bat`-plan bird with a ground gait (or a new tiny biped) | same |
| `pig` | boar variant, no tusks, pink | variant |
| `cow` | quad (horse frame, heavier, horns) | new type |
| `scarecrow` | biped, straw + sack head + stick arms | new type |
| `crow` | exists (line war) | reuse |
| `hound` | exists | reuse |
| farmer / hunter looks | Chibi 2: straw hat + smock + crook; hood + cloak + spear | `data/looks.json` (hvf keys); a new hat id must also go in `avatar-2d/js/parts/chibi2-parts.js` |
| structures | coop, pen, sty, barn, hive, granary, windmill, fence, wall, hedge, mud, tower, lookout, farmhouse, harvest hall, lodge, kennel, watchstone, snare, grave | `js/view/hvf-structures.js` |
| icons + portrait | from the line-war icon baker | `assets/icons/` |
| sound | bleat, cluck, oink, moo, bell, horn, hawk, chop, snare, ward pull | ids added to `sfx/data/catalog.json` |

Rendering farm animals as instanced rigid meshes (§13) means the creature models also need a
**static-pose export** (one merged mesh per species) — C provides it from the same generator.

## 15. Performance

| Item | Budget |
|---|---|
| Map | ≤ 160² cells; generation ≤ 150 ms |
| Vision update | ≤ 0.6 ms per team update at 12 players + 420 animals (node) |
| Sim tick | ≤ 3 ms at 9 farmers + 3 hunters, full army caps, 3 Commander AIs |
| A\* | ≤ 2 searches per tick |
| Draw calls | ≤ 250 per viewport, ≤ 500 split |
| Frame | 60 fps owner desktop; 30 fps split on integrated graphics |

## 16. Tests (`tests/hvf-*.test.js` node, `tests/hvf-*.spec.js` Playwright)

1. **mapgen** — 500 seeds per size: valid, deterministic, every validator, metrics in range; generation time.
2. **mapgen cross-engine** — Firefox vs node cell-array hash for 50 seeds [R10].
3. **vision golden** — 12 hand-drawn LOS cases incl. plateau, tallgrass, lie low, walls [R5].
4. **purity** — the line-war scan extended to `modes/hvf/**` and everything it imports.
5. **determinism + snapshot** — two sims, same log → same hash every tick for 20 min; restore at a tick
   between vision updates → same future [R4].
6. **rules** — farmers can't attack; briar rule; hunter out only with no lodge; win conditions; ghost and
   revive; crowding widens wander; Bell; cap stops breeding but not income growth.
7. **dead-data** — every building, upgrade, item, skill and AI weight moved to an odd value changes the sim.
8. **feel tests** [R29] over AI-vs-AI seeds: ≥ 50% of bases are first found via stray / noise / track;
   a farmer that never rings the Bell is found earlier than one who does; median first find 4–9 min;
   hunter kills per minute fall after the Turn.
9. **AI bars** (§10) · **fuzz** (random/illegal commands, no throw, equal hashes) · **soak** (30-min 9v3,
   tick budget) · **banned terms** (HvF data + UI strings; includes "muster").
10. Playwright — mode screen → HvF lobby → match vs AI at ×8 → results → lobby; pad-only farmer build
    walk; split screen with two fogs; two-page online over BroadcastChannel with equal hashes; fog
    texture non-blank; draw-call probe.

## 17. Milestones (each ends playable or viewable, and tested)

| # | Slice | Result | Green tests |
|---|---|---|---|
| **H1** | World generator | `hvf-map.html`: any seed, layers, metrics, 16-seed compare; owner reviews | mapgen, cross-engine, purity |
| **H2** | Ugly playable | capsules/boxes: farmer builds coop + pen, animals wander/crowd/flee, hunter chops/kills, vision + fog, ghosts, kennel, win/lose, 1 human vs Recruit-ish AIs | determinism, snapshot, vision golden, rules |
| **H3** | Full kits | all producers, upgrades, defences, Harvest Hall + army, lodges, watchstones, snares, hawk, horn, tracks, noise, Turn, hunter items via I, `hvf-econ-sim.mjs` (advisory) | dead-data, rules |
| **H4** | AI | both roles × 3 difficulties | AI bars, feel tests, fuzz, soak |
| **H5** | Lobby + HUD + online + split | mode card, HvF lobby, both HUDs, minimap, onboarding, two-page online, split screen | Playwright set |
| **H6** | Art + sound | creatures, looks, structures, trees, icons, portrait, sfx | icon/portrait specs, draw-call probe, avatar-3d creature tests |
| **H7** | Ship | polish pass, README section, CLAUDE.md row update, `~/claude/docs/playground.md`, code review, publish | everything, banned terms |

## 18. Streams and file ownership (no overlap with line-war files)

| Stream | Owns | Slices |
|---|---|---|
| **H — HvF sim** (new, A's conventions) | `js/sim/modes/hvf/**` (except `ai/`), `data/hvf/**`, `tools/hvf-econ-sim.mjs`, `hvf-map.html` + `js/tools/hvf-map-page.js` + `css/hvf-map.css`, `tests/hvf-*.test.js` | H1, H2 (sim), H3 |
| **A — core sim** | the mode registry and anything shared (`rng`, `mathx`, `order`, `hash`, `statuses`, combat maths); HvF asks through `requests.md` | framework hooks only |
| **E — AI** | `js/sim/modes/hvf/ai/**`, `data/hvf/ai.json` (H owns the rest of `data/hvf/`) | H4 |
| **B — view + UI** | mode screen + HvF lobby in `js/ui/lobby.js`, `js/ui/hvf-hud.js`, `js/ui/hvf-build.js`, `css/hvf.css`, `js/view/{hvf-terrain,fog,hvf-animals}.js`, the `main.js` hook, `tests/hvf-*.spec.js` | H2 (view), H5 |
| **C — art** | `avatar-3d` creature types/variants + library entries, `data/looks.json` hvf keys, `js/view/hvf-structures.js`, icons, sfx ids | H6 (creatures may start early) |
| **I — items/town** | its items runtime and shop panel; HvF only supplies `data/hvf/hunter-items.json` and an adapter in `js/sim/modes/hvf/items.js` | consulted in H3 |
| **D — net** | nothing new expected; checks HvF in the two-page online test | H5 |

## 19. Planned modes (R2.20 — document only)

Tower defense, MOBA, and Heroes and Empires are planned, not scheduled. HvF is deliberately the mode
that proves the framework won't block them: per-mode map builder (TD and MOBA need their own maps),
seats with roles (MOBA picks, TD co-op), unequal teams, per-mode data files and queries, per-mode step
pipeline. The mode screen shows them as greyed "planned" cards.

## 20. Owner-item audit

| Item | Where |
|---|---|
| R2.12 research and feel | `hvf-research.md`; must-keep list at the top; feel tests §16.8 |
| R2.13 generated nature world (paths, cliffs, harvestable tree walls, hidden spots, features) | §3 |
| R2.14 farmers can't attack, cookie-clicker, wandering sheep, hidden spots, towers/walls, mid-game army | §5, §6 |
| R2.15 hunters strong early, falling off, multiple bases, mobility/scouting upgrades | §7, §8.2 |
| R2.16 sheep as the main tell (strays, too many) | §4 noise/tracks, §5 crowding/strays, feel tests |
| R2.17 active fog, destroyable wards | §4, watchstones §7 + Pull Up §6 + crows §6.4 |
| R2.18 one farmer type, one hunter type | §6, §7 |
| R2.19 online for every mode | §11 |
| R2.20 future modes noted, not blocked | §19 |

## 21. Risks

1. **Generator taste** — metrics can't tell a fun forest from a dull one; the compare page and owner
   play-tests are the check (H1 gate).
2. **AI farmers that hide well** are hard; the feel tests are the bar, and Recruit farmers hiding badly
   is acceptable.
3. **Client-enforced fog** in full-information lockstep (accepted for friends' games).
4. **Mode framework timing** — HvF H2+ waits for A's registry; H1 and creature art do not.
5. **Title** — "Fold & Fang" is a recommendation; the owner may prefer another.
