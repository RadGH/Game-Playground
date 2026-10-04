# Hunters vs Farmers — roast of plan v1

Status: 2026-10-03. Target: `docs/hvf-plan.md`. Output: `docs/hvf-PLAN.md`.

## Ground rules for this roast (owner)

This roast may **not** trade away the genre's core fun (`feedback-genre-feel-over-paper-balance`).
Protected, and any change that weakens them is rejected:

1. **Hiding** — finding a hollow, walling it, lying low.
2. **Animals wander and are the main tell** (R2.16). No "animals stay put" fix, no hard leash.
3. **Cookie-clicker growth** — many producers, escalating costs, multipliers, the number climbing.
   No income caps, no build timers, no tech time-locks.
4. **Tense hunting** — hunters strong early, falling off; the farmers' mid-game flip.
5. **Farmers can't attack** (their units can, from mid-game).

The roast targets scope, the determinism cost of fog/vision, map-generator quality, AI feasibility,
readability and names. Balance numbers are advisory (owner: "balance later").

---

## Findings

| # | Area | Problem in v1 | Change | Protected feel kept? |
|---|---|---|---|---|
| R1 | Scope | **Two resources** (gold + wood) doubles the HUD, the AI's planner and every price; wood exists only so tree walls are "harvestable" | **One resource: gold.** Chopping a tree is a free action (farmer 4 s, hunter 2 s) that opens the cell and pays 2 g. Tree walls stay harvestable (R2.13) and chopping your own door open is still a real decision (it makes the hollow easier to find) | Yes |
| R2 | Scope | 4 farmer army units + a separate ram | **2 units + 1 upgrade:** Scarecrow (melee, can hit lodges), Crow Flock (fast flyer, vision, harass). Hay Golem becomes the Harvest Hall's *Stuffing* upgrade line for scarecrows. Ram cut | Yes (the flip stays) |
| R3 | Scope | Footprints from every animal every 2 s | **Only strays leave tracks** (an animal outside its wander radius). Cheaper (tens, not hundreds of prints) and it ties tracking to the herding skill: a tidy flock leaves nothing to follow | Strengthens #2 |
| R4 | Determinism | Vision grid kept out of state but read by the AI. A snapshot restored on a tick between vision updates would recompute a *different* grid from current positions → desync after resync | **Vision lives in state** as packed int32 bitsets (plain arrays, JSON-safe), one per team, updated on ticks where `tick % 4 === teamIndex`. Explored memory: same shape. ~2 × 650 ints at 144² cells; hashed with the rest | n/a |
| R5 | Determinism | LOS method unspecified beyond "Bresenham table" | Precompute **integer ray tables** per radius (cells only, no trig, built once at load from integer circle maths). Opaque = tree, rock, wall/fence building, higher level. Viewer radius quantised to whole cells. A **purity test** covers `modes/hvf/**` and a **vision golden test** pins 12 hand-drawn cases | n/a |
| R6 | Determinism | Tracks/noise: "every few seconds each" | All periodic emitters run off **tick arithmetic** (`(tick + ent.id * 7) % period === 0`) so there's no per-entity timer state and no rng draw ordering issue | n/a |
| R7 | Perf | 360 animal viewers each casting rays | Animals and lookouts within 3 cells use a **stamp** (precomputed disc, no LOS); only characters, towers, wards and the hawk cast rays. Budget measured in H2: vision update ≤ 0.6 ms at 12 players + 400 animals in node | Yes (animals still see — the flock is the alarm) |
| R8 | Map quality | MST-over-glades + noisy carving tends to give **spaghetti with even density** — every place feels the same, and "hidden" spots are just forest pockets | A **feature vocabulary** stamped by the generator, each a small rule with its own validator: *pocket valley* (plateau hollow with one ramp), *briar maze*, *pond island* (hollow reached by a ford), *ravine trail* (trail between two cliff walls — an ambush spot), *stone ring* (open glade, a landmark), *old orchard* (a big glade, good farmland, exposed), *deadfall wall* (a long tree wall with one choppable gap). Plus **quality metrics** per seed: dead-end count, mean branching, hollow hiddenness (distance from trail × LOS blocked from the trail), largest open area, and a 16-seed **compare page** (as proctown does) so the owner can judge by eye | Strengthens #1 |
| R9 | Map quality | 3 elevation levels + cliffs + ramps everywhere | **2 levels** (ground, plateau). Plateaus are the special case that makes a pocket valley; "can't see uphill" is kept because it is the best hiding rule the old maps had | Yes |
| R10 | Map quality | Retry loop "reseed up to 8" can silently produce a different map per engine if any step is non-deterministic | Generator is pure, uses `sortBy` only, integer-hash value noise; a **cross-engine test** (node vs Firefox) hashes the cell array for 50 seeds. Generation ≤ 150 ms at the largest size | n/a |
| R11 | AI | Farmer AI "chooses a hollow and builds a base" — free placement search is expensive and fragile | The generator emits **build slots** per hollow (a few hand-shaped layouts fitted to each hollow: door cell, pen cells, tower cell). The AI picks a slot set; humans never see them. Placement validity is the same function humans use | Yes |
| R12 | AI | Hunter pathing to arbitrary points on a 144² grid with choppable trees | **A\*** on the cell grid with tree cost = chop time (so hunters cut through when cheaper), deterministic heap tie-break (the `flow.js` heap), **≤ 2 searches per tick** shared by all AIs, results cached per (target node, chopped-list version). Farmers flee along the trail graph, not the grid | Yes |
| R13 | AI | "Suspicion map" is the right idea but unspecified | Nodes = glades/hollow mouths/junctions from the generator. Evidence weights in `data/hvf/ai.json`: noise heard 3, animal seen 5, stray tracks 4 (with direction), last-seen building 10, ward ping 6, "unexplored pocket" 1; decay per difficulty. Hunter targets argmax(suspicion / travel time). Tested for decisions, not clicks (Commander-with-Veteran-micro still beats Veteran ≥ 60%, as line war) | Yes |
| R14 | Rules | **A hunter is "out" if he dies with no lodge** — but lodges cost 300 g and he starts with 150, so an early death could end his game | Each hunter starts with a **Kennel** that counts as a lodge (destructible like any lodge). Farmers can't attack until their army exists, so it's safe early and a target late | Yes |
| R15 | Rules | Farmhouse respawn costs 50% of banked gold — a rationing penalty that punishes the hiders twice (their animals already go wild) | **Respawn at a Farmhouse after 40 s, no gold cost.** Ally revive stays (4 s channel). The wild animals are the penalty, and it's a genre-true one | Yes |
| R16 | Rules | Hunter handicap formula `(farmers/hunters)/3` gives odd values at small counts | A **table** in `data/hvf/rules.json` keyed by format (`2v1` … `9v3`): hunter HP/damage multiplier, head start, map size, timer default | Yes |
| R17 | Rules | Animal cap 40 per farmer reads as rationing the cookie clicker | Cap is a performance limit (the old maps had one too) set high: **60 per farmer, 420 total**. Growth **continues past the cap** through multipliers (Feed, Granary, Windmill) so the number keeps climbing; at cap a building simply stops breeding | Yes (growth unbounded) |
| R18 | Readability | The "Turn meter" compares unlike things | A sim value `turn` in −1..+1: farmers' **army + tower value** vs hunters' **combat value** (level, items, count), both in gold-equivalent. HUD shows it as a moon (new → full) with a one-line reason ("Farmers out-earn you 3:1"). AI uses the same number for the flip | Strengthens #4 |
| R19 | Readability | Hunters hear noise via audio only — useless for a split-screen or muted player | Every heard noise is also a **minimap ripple + an edge-of-screen arrow** for 2 s | Yes |
| R20 | Readability | No onboarding (the old maps' top complaint) | Both roles get a 5-step hint line (the line-war onboarding component): farmer "Find a hidden spot → Build a sheep pen → Keep your flock close (Bell) → Wall the door → Raise scarecrows"; hunter "Listen for animals → Follow tracks → Plant a watchstone → Build a lodge → Hunt the strays" | Yes |
| R21 | Split screen | Opposite roles on one screen defeat fog entirely | Couch players may be on opposite roles, but the lobby shows "Both screens are visible — no peeking" and **defaults local seats to the same role**. Each half draws its own team's fog | Yes |
| R22 | Integration | Hunter's 6 item slots depend on stream I's R2.2 runtime | HvF is scheduled **after line war is finished** (owner), so I's runtime exists. HvF supplies only a catalogue (`data/hvf/hunter-items.json`); if I's API changed, the adapter lives in `js/sim/modes/hvf/items.js`. No edits to `js/sim/items.js` | Yes |
| R23 | Integration | v1 implied rewriting `sim.js` | A's framework owns the registry; HvF is one module + data. If something HvF needs is missing (e.g. `modes` must allow different players-per-team), it's a request to A in `requests.md`, not an edit | n/a |
| R24 | Scope | Beehive at 640 s payback is a trap, not a choice | Beehive **0.40 g/s** (400 s payback) and **silent** — a deliberate "safe but slow" pick, the counterpart of the loud pig. Windmill keeps its tall-silhouette tell (greed and risk, Sheep Tag's savings farm) | Strengthens #3 |
| R25 | Economy | Payback ~100 s for hens/sheep compounds very fast; with ×1.15 per copy nobody knows when the flip happens | Add `tools/hvf-econ-sim.mjs` (reads the same data) that plots a farmer's income curve under 3 build styles (quiet, balanced, greedy) against the hunter's combat value; target flip (turn = 0) at **minute 11–16**. **Verdicts advisory** (owner: balance later); it exists to put numbers in front of the owner, not to gate the build | Yes |
| R26 | Names | "Hunters vs Farmers" is close to the old map's title "Farmers vs Hunters" (convention 9) | Player-facing title **"Fold & Fang"**, with the plain subtitle "hunters vs farmers" in the mode card's description. Internal id `hvf`. Owner may veto | n/a |
| R27 | Names | "Bolt" (farmer sprint) collides with the line-war skill shape `bolt` in code and logs | **Scamper.** Other names checked against convention 9 + the Bannerline list (no "muster", no ember/veil, no Sentry/Far Sight/Wind Walk/Feral Spirit/Phase Shift): Lie Low, Bell, Pull Up, Watchstone, Snare, Hawk, Pounce, Hunting Horn, Flare, Lodge, Kennel, Harvest Hall, Scarecrow, Crow Flock, Commons, Hollow | n/a |
| R28 | Perf | ~9,000 tree cells + fog + shadows in one view, ×2 in split screen | Trees: 3 kinds × InstancedMesh, far ring as cross-billboards, no shadow casting beyond 40 m; chopped trees hidden by an instance-matrix swap (no rebuild). Fog: one 144² R8 texture, updated at 5 Hz, smoothed in the shader. Budget: ≤ 250 draw calls per viewport | Yes |
| R29 | Tests | No test that the core feel *exists* | **Feel tests** over AI-vs-AI seeds: hunters find their first base through a stray/noise/track in ≥ 50% of finds (the tell works); a farmer that never rings the Bell is found earlier than one who does (herding matters); median time to first base found 4–9 min; hunters' kill rate per minute falls after the Turn (falloff happens) | Protects all five |

## Rejected (would harm the core)

- *"Leash animals to their pen so bases can't be found by accident."* — rejected, it deletes R2.16.
- *"Cap a farmer's income or time-lock the Harvest Hall to 15:00."* — rejected, cookie-clicker growth
  and gold-as-the-gate are the genre; the Harvest Hall is gated by **price** and by owning 3 producers.
- *"Remove noise so the game is purely visual."* — rejected; hearing a sheep through the trees is the
  most hunter-feeling moment the mode has.
- *"Give farmers a weak attack so they aren't helpless."* — rejected, owner rule; they have Scamper,
  Lie Low, hedges, towers, and later an army.

## Risks that remain

1. Generator taste: metrics can't tell a fun forest from a dull one — the compare page and owner
   play-testing are the real check (H1 ends with the owner looking at 16 seeds).
2. AI farmers that hide well are hard; a Recruit farmer that hides badly is fine, a Commander farmer
   that hides badly makes the mode feel broken. The feel tests above are the bar.
3. Full-information lockstep means fog is client-enforced; a modified client sees everything.
   Accepted for friends' games (line war §11.5); a relay-authoritative fog is far future.
