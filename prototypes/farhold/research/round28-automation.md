# Round 28 — automation: audit, brainstorm, roast, plan

> *"Improve building system and automation. Use sub agents and brainstorm ideas, update interfaces."*

The BUILDING half (placement, the ring, js/build*.js) belongs to another agent this round. This file
is the AUTOMATION half: production chains, drills/routes, storage logistics, power, worker jobs,
machine queues, standing orders, diagnostics, the base overview and alerts.

## 1. Play-path audit — ore to ingot to part, today

| Step | Key / action | Code path |
|---|---|---|
| Find ore | Scan tool (B → Scan) or walk | `scan` in js/build-ui.js, `oreHere().at` |
| Dig by hand | `E` on a seam | main.js `interactTarget` → `kind:'seam'` → `beginGather` → `mining.swing` → pool or pack |
| Drill | B → Extraction → Small Drill on the seam | `onPlace` → `mining.bindDrill` → `mining.autoRoute` (A* in js/haulpath.js) |
| Power | B → Power → Burner Generator, coal in a crate in reach | `joinSystems` → `grid.add`; `syncPower` writes `entry.powered` once every 20 frames |
| Store | B → Storage → Storage Box | `stores.add`, re-routes every un-routed drill |
| Smelt | `E` at the Furnace → station screen → Smelt Iron ×N | js/station-ui.js `drawStationBody` → `works.queue` |
| Work it | hold `E`, or a citizen bound by js/colony.js | `createHandWork` → `board.swing` → `works.collectLabour` → `workBank` |
| Ship between outposts | Map (M) → Supply → arrow | js/map.js → `logistics.link(from, to, { batch })` |
| Part | Assembler (powered) → Machine Part | same station screen |

Every link works. What is missing is everything *around* the chain: once a base has more than
three machines there is no screen that says what it makes, what it eats, what is stuck and why.

### Findings — finished modules nothing calls, rules in data nobody reads, and bugs

1. **`stores.overview()`** — its own comment: *"Everything the base overview panel wants (§8.9)"*.
   No caller. There is no base overview panel.
2. **`stores.linkAdvice(a, b)`** — "46 m apart; one relay mast joins them" — no caller anywhere.
3. **`grid.overview()` and `grid.whatIf()`** — the power network's whole report (made / wanted /
   battery / what was shed / every machine's badge counted) and the "what if I add a 20 kW machine"
   question. No caller. The only power readout in the game is the build card's `spareAt`.
4. **`works.allJobs()`** — "for the base overview (§8.9) and the one shared job list (§3.19)". Only
   the Town Hall uses it, for its eight-row work list.
5. **Recipe `power`** in data/refining.json — *"the extra draw while working"* — on 33 of 61 recipes,
   read by nothing. A smelter on wire draws the same as a smelter on nothing.
6. **Recipe `waste`** — *"marked … only so the UI can grey them"* — the UI never greys them. Slag
   is listed beside an ingot as if it were the point.
7. **Logistics `link(…, { only, keep })`** — a supply route can carry only some materials and leave
   a floor behind. The only caller (the map's Supply tab) passes `batch`; `only` and `keep` have no
   way in, so a route out of a mining camp also carries off the coal its own generator burns.
8. **BUG — the away clock never runs the drills.** `createAwayClock` is handed works, logistics,
   stores and grid. Not mining. Leave the planet for six hours and every furnace runs on the ore
   already in the crates while the drills feeding them sit still.
9. **BUG — a reload turns every Small Drill into a full Drill.** `mining.toJSON` does not write
   `tool`, `load` does not restore it, and `drillRate(node, { drill: undefined })` falls back to its
   default `'drill'` — tier 3, rate 3.2 against the Small Drill's tier 1 and 1.4. Save, load, and
   a hand-cranked drill digs 2.3× faster and can work hardness-2 seams it was refused before.
10. **BUG — the next-step hint's `hasRoute` reads two fields nothing writes.** main.js asks
    `d.routed || d.deliveredPerMinute > 0` of `mining.overview()` rows, which carry `route`. So once
    you have a drill the hint says *"Put a crate near the drill"* for ever — even with a crate right
    beside it — and the `link` and `power` steps behind it are never reached.
11. **BUG — a working drill never tells the grid it is busy.** js/refine.js calls `grid.setBusy`;
    js/mining.js never does, so an 18 kW Drill digging flat out is billed `idleShare` (25%) — 4.5 kW.
    The power readout lies by 13.5 kW per drill and a base can run four drills on one generator.

## 2. Problems from the player's side

* "My furnace stopped. Why?" — the station checklist answers it **at that furnace**. Nothing
  answers it for the base, and nothing traces it *upstream*: "no iron ore" is true and useless when
  the reason is that the drill feeding it is out of power.
* "How much iron am I making?" — no number anywhere. Not per machine, not per base.
* "Keep 50 ingots in stock" — impossible. A job is ×N (runs out) or *keep going* (fills every crate
  with ingots and starves the next machine of ore).
* A full store is silent until a machine says "nowhere to put it".
* The power grid has no screen.
* A drill that is route-limited looks like it is working.

## 3. Brainstorm — 22 ideas

1. **Base overview screen** — one place listing every machine, drill, store, network and route.
2. **Measured flow meter** — sample what the stores hold once a second; the net change per minute
   per material is the honest "what is this base making", like the away clock's diff.
3. **Rated throughput per machine** — "makes 6.0 iron ingot/min, eats 12 ore/min, 4 log/min".
4. **Why-idle diagnosis with an upstream trace** — starved of X → who makes X here? a drill? is
   that drill unpowered / route-limited? → one sentence and one fix.
5. **Alerts** — ranked, aged problems (starved > 20 s, blocked, unpowered, store ≥ 90 %, power
   short, loads stuck, drill pile capped), and a small pill on the HUD.
6. **Keep-in-stock standing orders** — "keep 50 iron ingot": the machine pauses at 50 and starts
   again below it; it stops asking for a worker while paused.
7. **Recipe `power` wired** — the extra draw while working (dead data, finding 5).
8. **Byproducts greyed** (finding 6).
9. **Supply-route filters** — only these materials / keep N here (finding 7).
10. **Pool join advice** — "Home and Quarry are 46 m apart: one relay mast joins them" (finding 2).
11. **Power panel** — grid.overview per network, satisfaction bar, what was shed (finding 3).
12. **Re-route button for drills** from the overview.
13. **Machine input/output ports** — pick which pool a machine takes from and delivers to.
14. **Belts / conveyors** between machines.
15. **Hauler vehicles** that physically drive the route.
16. **Recipe chains as one order** — "make 10 machine parts" queues the ingots upstream.
17. **Copy / paste machine settings** across benches.
18. **Production graph view** (nodes = machines, wires = materials).
19. **Shift schedule for citizens** (day/night).
20. **Low-fuel warning** with minutes-left on generators.
21. **Throughput history sparkline** per material.
22. **Auto-balance** — share one input across two machines by priority.

## 4. Roast

* **13 Ports — kill.** The pool IS the port: everything a machine reaches is the pool it stands
  in, and §8's whole design is "inside one pool nothing moves". Ports would be a second logistics
  model fighting the first.
* **14 Belts — kill.** Same reason, plus 3D path art the building agent owns.
* **15 Hauler vehicles — park.** Visual only; js/logistics.js's timed loads already *are* the
  hauler. Not this round.
* **16 Chain orders — park.** Real value, but it needs a planner that knows which machine to send
  upstream work to; the keep-in-stock order gets 80 % of it for 10 % of the code (set the ingot
  furnace to keep 50 and the part line is fed).
* **17 Copy settings — kill.** Low value with ~10 machines.
* **18 Graph view — park.** Pretty; the flows table answers the same question in a list.
* **19 Shift schedule — park.** Colony schedule is data/colony.json's, owned by the people rounds.
* **22 Auto-balance — kill.** Priority (R16) already decides who gets the worker; inputs are first
  come, first served by tick order and a keep-in-stock floor covers the case that matters.
* **21 Sparkline — merge into 2.** A trend arrow beside the number is enough.
* **20 Low fuel — merge into 5** as one alert kind (generator with < 2 min of fuel in reach).
* **1, 2, 3, 4, 5, 6** — keep. These are the round: a screen, numbers, reasons, alerts, one new
  verb.
* **7, 8, 9, 10, 11, 12** — keep. Each one is a dead rule or an orphan module this audit found,
  and each is small.

## 5. Plan — what gets built

| # | Piece | Where |
|---|---|---|
| P0 | Bugs 8–11 | js/mining.js, js/logistics.js, js/main.js |
| P1 | `js/production.js` — pure: flow meter, rated rates, diagnosis + upstream trace, alerts | new |
| P2 | Keep-in-stock orders: `works.queue(id, recipe, { keep })`, state `stocked` | js/refine.js, data/power.json |
| P3 | Recipe `power` draw while working; `waste` greyed | js/refine.js, js/station-ui.js |
| P4 | Station screen: rated line, "why" trace, Keep 20/50/100, byproducts | js/station-ui.js |
| P5 | Production tab in the Holding (K): alerts, flows, machines, drills (+ re-route), power, storage (+ join advice), supply routes (+ only/keep) | js/production-ui.js, js/civics-ui.js |
| P6 | HUD pill: "2 things need you — K" | js/production-ui.js |
| P7 | Tests: node (production, keep, power, bugs) + Playwright (tab drives keep-in-stock and the alert) | tests/round28-automation.* |

Parked (documented in BUILD-MODE.md): chain orders (16), graph view (18), hauler vehicles (15),
citizen shift schedule (19).

## 6. Status (end of round)

Everything in §5 is built, plus the review's people-side fixes and a "Send a cart" form for
js/trade.js (which had no way in). The write-up is BUILD-MODE.md "Round 28 — automation".
Standing cart runs (Repeat) and the pack mule's grain were built at the end of the round.
Parked as planned: chain orders, graph view, hauler vehicles, shift schedule.
