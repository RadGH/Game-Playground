# Round 28 — building: audit, brainstorm, roast, picks

Owner of this file: the building half of round 28 (placement, snapping, rotation, the panel, blueprints,
upgrades, take-down, walls and gates, undo). Automation (works / stores / grid / haulpath / station-ui)
is somebody else's this round and is not touched here.

## 1. Play-path audit — "how does a player DO this?"

Each row is a build feature followed from the key press through `js/main.js` into `js/build.js` /
`js/buildplan.js`. **Bold** = a finished module nothing calls, or a rule in data nobody reads.

| # | Feature as documented | What actually happens | Verdict |
|---|---|---|---|
| A1 | §4.2 / BUILD-MODE §2: *"Hold a key for free placement."* | `build.setFree()` exists. **Nothing calls it.** No key, no button. | dead |
| A2 | §4.8 blueprints: `plan.blueprint()`, `plan.stamp()`, `plan.billFor(bp)` | **No caller anywhere.** No tool, no panel, nothing in the save. Raid rewards even count `blueprints: 0`. | dead |
| A3 | Wall tool hint: *"a gate goes where you double back over a corner"* | `finishRun({ gateAt })` is called as `finishRun()` with no args from main.js's Enter. **`gateAt` is never filled.** The hint is false. | dead |
| A4 | `data/structures.json` every row has `snap: "wall" / "floor" / "grid"` | **Read by nobody.** `plan.snap()` only joins same-category end faces. A Wall Sconce, Shutters, a Banner (14 wall-mounted pieces) cannot be hung on a wall — they snap to the 2 m grid like a crate. | dead data |
| A5 | `gate: true` on fence_gate / gate / gate_house | Only copied onto the entry. `rebuildBuildSolids` makes **every** piece a solid circle — **you cannot walk through your own gate.** A 4 m gate is a 1.4 m circle between two walls, leaving 0.6 m gaps a 0.8 m-wide player cannot use. | dead rule, real bug |
| A6 | Wall collision | Each section is a circle of radius `min(1.4, max(w,d)/2)`. A 2 × 0.2 m fence blocks a 2 m-wide disc; a diagonal fence is a row of bumps. | crude |
| A7 | Scroll turns the ghost | Wheel turns by π/8 but `snap()` rounds to `rotateStep` π/4, so **every other notch does nothing**. No key turns it at all. | bug |
| A8 | `Ctrl+Z` *"undo the last thing"* | Undo pops the ledger. A **wall run of 20 pieces needs 20 presses** (runs never pushed onto the action stack); **Level / Raise / Lower cannot be undone** at all (terraform has `remove(id)`, never called by undo); a take-down cannot be undone. `undoDepth` is checked as `entries.length > undoDepth + 200`, which is not a depth. | half-built |
| A9 | Undoing a flattening piece | The slab it painted under itself stays. Undo a foundation and its plinth of levelled ground remains. | minor |
| A10 | `hp` / `maxHp` on 39 pieces, `repairs` on the Repair Station | Nothing ever damages a structure. `repairs` only feeds raid-loss share. A repair action would repair nothing. | dead data (parked, see roast) |
| A11 | Take down | No highlight of WHAT the click will take, no refund preview until after. | unclear |
| A12 | Slopes | "The ground is too steep — level it first" is the commonest red. A crate on a 0.5 m hummock needs a trip to the Level tool, a click, and a trip back. | friction |
| A13 | Ghost | A translucent tint. No footprint on the ground, so on a slope you cannot see where the corners land. | clarity |

## 2. Brainstorm — 22 ideas

1. **Undo that undoes a step**: one stack for pieces, runs (one press), brushes, take-downs, moves, upgrades, stamps.
2. **Redo** (Ctrl+Y).
3. **Auto-level small slopes**: if the worst corner is within ~1.5 m, the piece levels its own footprint on placement (the slab path every flat piece already uses); the card says *"will level the ground under it"*.
4. **Shift+click a line**: a row of the selected piece from your last placement to the cursor, spaced by its footprint, previewed with count and total price.
5. **Drag-to-place a line** with the left button.
6. **Free placement on Alt** (wire `setFree`).
7. **Q turns the ghost**, Shift+Q back; the wheel steps by the catalogue's real `rotateStep`.
8. **Gates you can walk through**: walls collide as segments along their length; a gate is two posts.
9. **A gate in a wall run**: click the same corner twice (the documented gesture) and a gate of the right width goes there.
10. **Run preview with the bill**: pieces and total cost on the card before Enter.
11. **Wall-mounted pieces hang on walls** (read `snap: "wall"`).
12. **Move tool**: pick a piece up for a full refund and carry it — re-placing is the move.
13. **Eyedropper** (C / middle-click): build another one of whatever is under the cursor.
14. **Upgrade in place**: palisade → stone wall → reinforced wall, fence → hedge, lamp → crystal lamp; pay the difference.
15. **Blueprints**: a Copy tool lifts every piece inside the brush into a named layout; layouts are saved and stamped with a whole-cluster ghost and one bill.
16. **Repair tool** for damaged structures.
17. **Footprint outline** on the ground under the ghost, coloured by the verdict.
18. **Hover highlight** for point tools (Take down / Move / Upgrade / Copy) with the refund or price shown before the click.
19. **Context-sensitive key strip** on the placement card.
20. **Search box** in the long panel.
21. **Grid overlay** near the cursor.
22. **Area take-down** (a brush that deconstructs everything inside).

## 3. Roast

* **2 Redo** — killed. Redo of a placement has to re-run every placement rule against a world that may have changed (the terrain moved, a raid knocked something over, the pool is emptier). One honest undo beats a redo that sometimes lies.
* **5 Drag-a-line** — killed in favour of 4. Left-drag already turns the camera in build mode (R13 "B gives the mouse back"); stealing the drag breaks the camera. Shift+click gives the same line with no new gesture to learn.
* **16 Repair** — parked. Nothing in the game damages a structure (A10). A repair tool would repair nothing; it becomes worth building the round raids hit walls. Written into the parked list.
* **20 Search box** — killed. The ring shows ten pieces a page and the panel groups them; 125 pieces is not a search problem.
* **21 Grid overlay** — killed. The footprint outline (17) answers "where does it go" without drawing a hundred lines on the ground.
* **22 Area take-down** — killed. A brush that silently deletes a base is a disaster on one misclick, and Undo of thirty pieces with mixed refunds is fiddly. Move + Take down one at a time is fine at this base size.
* **13 Eyedropper** — merged with 12 (Move) and 18 (hover): same "what is under the cursor" pick, one key.
* **14 Upgrade** — kept, but **only for pieces with no system attached** (walls, fences, lights, decor). A crate holds a store pool and a generator is on the grid; swapping the key under those belongs to automation's files, and getting it wrong loses the contents. Data-driven (`upgradesTo`), so adding a chain later is a JSON line.
* **15 Blueprints** — kept. The most-asked-for base-builder feature and the module already exists; it only needs a door, a ghost and a save slot.
* **3 Auto-level** — kept with a cap: within the cap it is the same slab every flat piece already paints; beyond it the old sentence stands, so the Level tool is still taught.
* **8 + 9 Gates** — kept. A gate you cannot walk through is a bug, not a feature request.

## 4. Picks (built this round)

| Pick | Ideas | Effort | Why |
|---|---|---|---|
| P1 Undo is a step | 1 (+A8, A9) | M | Ctrl+Z was the only safety net and it lied for runs and brushes |
| P2 Auto-level small slopes | 3 (+A12) | S | Removes the commonest red ghost |
| P3 Shift+click a line | 4 | S | Fences, lamps, crates in a row |
| P4 Free placement + rotation | 6, 7 (+A1, A7) | S | Dead key + a half-dead wheel |
| P5 Walls, gates, runs | 8, 9, 10 (+A3, A5, A6) | M | Gates were solid; the documented gate gesture did nothing |
| P6 Wall-mounted pieces | 11 (+A4) | S | 14 pieces had a rule nobody read |
| P7 Move + eyedropper | 12, 13 | S | Re-arranging a base cost 25% a time |
| P8 Upgrade in place | 14 | M | Walls get better without a gap |
| P9 Blueprints | 15 (+A2) | M | Finished module with no door |
| P10 Interface | 17, 18, 19 | M | Every new key has to be on screen or it does not exist |

## 5. Status (2026-10-02)

All ten picks are built. A reviewer checked the first build (`~/claude/agent/r28/building-roast-findings.md`),
and every finding is answered row by row in **BUILD-MODE.md §28.4**. Testing found three more
bugs and they are fixed: clicks used the previous frame's aim, the run's bill priced the leg out to
the cursor, and a gate was an open gap to enemies. The dead `blocks`/`perch` flags were removed,
and the watchtower got the guard post its description promised. Structure damage + the Repair tool were then built as well (BUILD-MODE.md §28.7). Parked: Redo, drag-to-line, and the short leftover gap after a
gate on an awkward leg length.
