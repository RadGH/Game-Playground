# Hunters vs Farmers — plan v1 (draft, before the roast)

Status: **draft v1**, 2026-10-03. Superseded by `docs/hvf-PLAN.md` wherever they differ. Inputs:
owner items R2.10–R2.20 (`~/claude/agent/bannerline/round2-feedback.md`), `docs/hvf-research.md`,
the line-war `docs/PLAN.md` + `docs/interfaces.md`. Third-party names appear only in the research page.

Must-keep feel (owner + research, not negotiable in the roast): **hiding**, **animals wander and are
the main tell**, **cookie-clicker growth** (buy producers, buy multipliers, watch the number climb),
**tense hunting** (hunters strong early, falling off), **farmers can't attack**, **a mid-game flip**
where the farmers go hunting.

---

## 1. The mode in one paragraph

A seeded forest world of glades joined by winding trails, cliffs, ponds, thickets and tree walls.
2–9 **farmers** start together in the middle and have 45 s to scatter before 1–3 **hunters** are let
out of their kennels. A farmer can't attack. He finds a hidden hollow, builds a **hen coop** or a
**sheep pen**, and the animals start earning gold — but animals **wander**, and a sheep standing on a
trail is how a hunter finds a base. Gold buys more producers (each copy costs 15% more), feed and
breeding upgrades, a sheepdog to keep the flock close, fences, briar hedges only farmers squeeze
through, arrow towers and lookout posts. Hunters chop through tree walls, plant **watchstones**
(vision wards the farmers can pull up), fly a hawk, lay snares and build **lodges** (shop + respawn)
around the map. Hunters are deadly in minute 2 and merely dangerous by minute 15: by then the
farmers can build a **Harvest Hall** and raise **scarecrows** to march on the lodges. Hunters win if
every farmer is a ghost at the same moment; farmers win by destroying every lodge and killing every
hunter, or by having anyone alive when the clock runs out.

---

## 2. Mode plumbing (plugs into stream A's framework)

Stream A is building `js/sim/modes/` (`config.mode` + `config.format`, back-compat `'1v1'`). This mode:

```
config = { seed, mode: 'hvf', format: '6v2', map: 'wild', players: [
  { role: 'farmer', name, kind: 'human'|'ai', ai: {difficulty} },
  { role: 'hunter', ... } ], rules: { timer: 1800, headStart: 45, mapSize: 'auto' } }
```

A mode module exports `{ id, formats, validate(config, data), buildMap(config, data), createState(config,
data, map), step(ctx, commands), commands: {type: fn}, queries, checkResult(ctx), dataFiles }`. The
line-war step pipeline in `sim.js` becomes `modes/linewar.js`; `hvf` has its own pipeline. Shared:
rng, mathx, order, hash, statuses, combat damage maths, items runtime (R2.2) for the hunter's 6 slots.

---

## 3. The world generator (`js/sim/modes/hvf/mapgen.js`, pure)

**Grid:** 2 m cells. Size by player count: `side = clamp(160 + 16 × players, 192, 320)` metres
(6v2 → 288 m, 144×144 cells). Cell kinds: `grass`, `trail` (+10% speed), `tree` (blocks walk + sight,
choppable, 3 kinds for looks), `briar` (low brambles: farmers and animals pass, hunters/scarecrows
don't, does not block sight, hunters chop it in 1 s), `tallgrass` (passable; a unit standing in it is
seen only from ≤ 4 m), `rock` (blocks walk + sight, not choppable), `water` (blocks walk), `ford`
(slow 30%), `cliff` (edge between elevation levels). Elevation 0/1/2: a lower unit cannot see onto a
higher level (the old maps' rule); ramps join levels.

**Steps** (all from rng stream `mapgen`, value noise built on an integer hash — no `Math.sin`):
1. Elevation: 2-octave value noise → 3 levels → cellular smoothing; plateaus get ramps.
2. Glades: Poisson-disc centres (count ∝ area), radius 5–14 m, cleared to grass.
3. Trails: k-nearest (k = 4) graph over glades → minimum spanning tree + 25% of the remaining edges
   for loops → each edge carved as a noisy polyline (midpoint displacement), 3–5 m wide.
4. Everything else is forest; a cellular pass roughens edges; scatter rocks, tallgrass patches, ponds
   in basins, a stream with 1–2 fords.
5. **Hollows** (hidden build spots): 2× farmer count small glades 6–10 m wide, set off a trail by
   8–20 m of forest and reached through a briar gap, a single tree to chop, or a ramp onto a plateau.
6. The **Commons** (farmer start, centre) and 1–3 **kennels** (hunter starts, edges, opposite sides).
7. Validate by flood fill: every glade/hollow reachable for a farmer; ≥ 85% for a hunter without
   chopping; hollows ≥ 2× farmers; forest 35–55%; ≥ 3 trail loops. Fail → reseed `seed + k` (k ≤ 8).

Output `sim.map` (static, not in state): `cells` (Uint8Array), `height`, `graph {nodes, edges}`,
`hollows`, `commons`, `kennels`, `size`. Chopped trees and briars live in **state** as a sorted array
of cell indices; the walk/sight grid = map cells patched by that list.

---

## 4. Fog of war and vision

- **Sim-side vision** so AI and rules see the same thing on every peer: per team, a vision grid at the
  2 m resolution, recomputed every 4 ticks (5 Hz), teams staggered on different ticks.
- **Viewers:** farmers 16 m, hunters 14 m (+Spyglass), animals 6 m (they belong to the farmer team),
  towers 16 m, lookout posts 20 m, watchstones 12 m, hawk 12 m, lodges 10 m. Line of sight through a
  precomputed Bresenham ray table per radius; trees, rocks, cliffs-from-below and walls block.
- **Explored memory:** per team a bitset (array of int32) in state; **last-seen buildings** per team in
  state (id, kind, x, z, tick) — a hunter's AI remembers the barn it saw.
- **The view** draws fog from the local team's grid (a `DataTexture` sampled by the ground and tree
  shaders, smoothed over 200 ms), hides enemy units in unseen cells, and draws last-seen buildings as
  grey ghosts.
- **Noise:** animals bleat/oink (event `noise {x,z,kind}` every few seconds each). Hunters within 25 m
  hear it even in fog (sound + a ping ring on the minimap). The AI uses the same rule.
- **Tracks:** every animal drops a footprint every 2 s into a per-farmer ring buffer (last 15 s). A
  hunter with *Tracking* sees footprints in his vision; the AI follows them.
- Lockstep sends commands only, so every client knows everything; a hacked client can see through
  fog. Accepted (friends' games), as in line-war §11.5.

---

## 5. Farmer kit

**The farmer** (one type): 260 HP, 5.6 m/s (hunter 5.2), radius 0.35, cannot attack. Abilities:
*Bolt* (sprint +60% 2.5 s, 18 s), *Lie Low* (stand still 1.5 s in tallgrass or at a forest edge →
hidden beyond 3 m until he moves), *Bell* (animals within 30 m walk home, 25 s), *Build*, *Chop*
(4 s → 5 wood), *Repair*, *Pull Up* (destroy a watchstone/snare: 3 s channel, not an attack),
*Revive* (4 s channel at an ally's grave).

**Resources:** gold (animals and hives) and wood (chopping). Start 60 g.

**Producers** (each further copy of the same building ×1.15 cost):

| Building | Cost | Animals | Income each | Wander | Notes |
|---|---|---|---|---|---|
| Hen Coop | 30 g | 3 hens | 0.10 g/s | 6 m | small, quiet |
| Sheep Pen | 90 g | 4 sheep | 0.22 g/s | 10 m | bleats; best early value |
| Pigsty | 220 g | 3 pigs | 0.45 g/s | 7 m | loud (25 m noise) |
| Cow Barn | 600 g | 2 cows | 1.4 g/s | 12 m | big, slow, visible |
| Beehive | 160 g | — | 0.25 g/s flat | — | silent, no tell, worse value |
| Granary | 400 g | — | +10% all income | — | stacks additively |
| Windmill | 1500 g | — | +35% all income | — | tall: seen over trees from 40 m |

Animals respawn at their building (Breeding upgrades speed it). **Crowding:** a building's animals
wander 1.5× further while their count is over its capacity (from breeding over cap via upgrades).
**Upgrades** (per farmer): Feed I/II/III (+25% animal income each), Shears (sheep +50%), Breeding
(respawn 2×), **Sheepdog** (a building: animals within 18 m keep half their wander radius), Fencing.

**Defence:** Fence (2 wood, 120 HP), Stone Wall (15 g + 3 w, 600 HP), **Briar Hedge** (4 w, farmers and
animals pass, hunters don't), Mud Patch (slows hunters 40%), Arrow Tower (150 g + 10 w, 24 dmg/s,
16 m sight), Lookout Post (25 g, 20 m sight), Farmhouse (200 g, the farmer's respawn point).

**Mid-game offence:** Harvest Hall (1200 g, needs 3 producer buildings) unlocks Scarecrow (melee, 250 g),
Crow Flock (fast flyer, vision, harass), Hay Golem (tank, 600 g), Haywain Ram (siege vs lodges).

**Death:** a farmer drops to a **ghost at his grave**. An ally reviving him (4 s) or his own Farmhouse
(60 s, 50% of banked gold) brings him back. His animals **go wild** (wander unbounded, no income)
until he is back — a beacon for the hunters.

---

## 6. Hunter kit

**The hunter** (one type): 1200 HP, 60 dmg melee (+ a thrown spear, 8 m), 5.2 m/s, radius 0.9, chops
trees in 2 s. Levels 1–10 from kills only (no neutral creeps — the old maps' camping complaint).
Abilities: Q *Pounce* (leap 8 m), W *Snare* (place up to 3; roots 3 s, hidden), E *Hawk* (fly to a
point, 12 s vision), R (level 6) *Hunting Horn* (animals within 40 m are revealed 5 s and bolt —
**toward home**, so they lead you there). Passive *Tracking* from level 3.

**Gold:** start 150, +1 g/s, bounty hen 4 / sheep 10 / pig 18 / cow 40 / buildings 30% of cost /
farmer 120. **6 item slots** using the line-war R2.2 item runtime (items stack; a few "unique equipped").
**Lodge:** 300 g, up to 3 per hunter, shop + respawn + 10 m sight. Respawn 15 s + 3 s per death; a
hunter who dies with no lodge standing is **out**.
**Shop:** Horse I/II/III (+15/30/45% speed), Woodsman's Axe (chop 3×), Spyglass (+30% sight),
Watchstone (40 g, stack 3, 12 m LOS vision, 5 min, visible within 6 m), Flare (60 g, reveal 20 m for 6 s),
Hound (a pet that points at animals within 20 m), Torch Oil (×2 vs buildings), damage/armour/regen items.

**Handicap for 1/2/3 hunters:** hunter HP and damage × `(farmers / hunters) / 3`, clamped 0.8–1.6.

---

## 7. Win conditions and length

- **Hunters win** the moment every farmer is a ghost.
- **Farmers win** when every hunter is out (dead with no lodge), or when the clock runs out with at
  least one farmer alive. Clock: lobby 20 / 25 / 30 / 40 min, default 30.
- Target length median 22–28 min; hunters win 40–60% of Veteran-vs-Veteran AI games at default.

---

## 8. AI (one AI per role, three settings: Recruit / Veteran / Commander)

**Farmer AI:** chooses a hollow by score (enclosure, distance from trails and kennels, plateau bonus,
ally spread); build order by payback (`cost / income` with a risk weight per producer = its tell);
rings the Bell when strays > 2; flees when a hunter is seen (path away using the graph); revives
allies; walls the hollow's entrance with briar; at the flip builds towers at the entrance then a
Harvest Hall and attacks known lodges with scarecrows.
**Hunter AI:** a **suspicion map** over the graph nodes (noise heard, animals seen, tracks, last-seen
buildings, unexplored hollow-shaped forest pockets, decaying over time); patrols to the best node;
plants watchstones on high-traffic junctions; chops into suspicious pockets; buys horse → spyglass →
watchstones → hound; builds lodges spread over the map.
| Knob | Recruit | Veteran | Commander |
|---|---|---|---|
| Reaction (ticks) | 30 | 14 | 6 |
| Farmer herding | rings Bell late | rings at 2 strays | rings at 1, places sheepdog |
| Farmer hiding | random hollow | best-scored | scored + spread from allies + briar door |
| Hunter memory decay | fast | medium | slow + tracks + noise triangulation |
| Wards | 1 | 3 | 3 per hunter on graph choke nodes |
| Flip timing | never attacks | attacks at 3 scarecrows | attacks when estimated power > hunter's |

The AI reads only its own team's vision grid and memory (no peeking).

---

## 9. Lobby, online, split screen

- **Mode screen first** (R2.11, stream B): Line War / Hunters vs Farmers. HvF lobby: a Hunters column
  (1–3 seats) and a Farmers column (up to 9 seats), timer, map size, seed (random or typed), each seat
  Local / Remote / AI (difficulty) / Closed. No hero/race pick (R2.18); farmers pick a hat colour.
- **Online:** same lockstep (R2.19); the mode's data files join the data hash.
- **Split screen:** each half draws its own team's fog. Two couch players on opposite roles can see
  each other's half; allowed with an "honour system" note.

## 10. Camera and HUD

- Camera as line-war (perspective, pitch ~50°), more zoom steps (out to 90 m), follows your character
  with a free-pan toggle; minimap with fog, pings for noise, kills and pulled wards.
- Farmer HUD: gold, wood, income/s, clock, **Strays** counter (animals beyond their wander radius,
  red), build grid in the control bar, per-pen animal count. Hunter HUD: gold, level, watchstones left,
  lodges, tracks toggle. Shared: the **Turn meter** — farmers' total income vs hunters' strength.

## 11. Art

New creatures in `avatar-3d` + library: `sheep` (quad + new `wool` feature), `hen` (small biped bird
variant), `pig` (boar variant without tusks), `cow` (quad), `scarecrow` (biped, straw), `hay_golem`.
Chibi 2 looks: farmer (straw hat, smock), hunter (hood, cloak, spear). Structures in
`js/view/hvf-structures.js`: coop, pen, sty, barn, hive, granary, windmill, fence, wall, hedge, tower,
lookout, farmhouse, harvest hall, lodge, watchstone, snare, kennel. Trees instanced (3 kinds).

## 12. Performance

Animals ≤ 40 per farmer (≤ 360), instanced rigid meshes with vertex bob; trees instanced (~8,000
cells); fog texture 144²; sim vision ≤ 1 ms per update; sim tick ≤ 3 ms at 9 farmers + 3 hunters.

## 13. Tests

mapgen (500 seeds: valid, deterministic, connected, hollow counts, cross-engine hash), vision (LOS
cases, elevation rule, tallgrass), purity scan extended, determinism + snapshot for hvf, economy
(payback curve, the Turn happens 12–18 min in AI games), AI bars, win conditions, fuzz, Playwright
(mode screen → HvF lobby → match vs AI → results; split screen; two-page online).

## 14. Milestones

H1 mapgen + debug viewer · H2 ugly playable (move, build pen, sheep wander, hunter kills, fog, win) ·
H3 full kits + economy + lodges + wards + ghosts · H4 AI · H5 lobby/HUD/online/split · H6 art ·
H7 polish + onboarding + docs.
