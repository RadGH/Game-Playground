# LANTERNFALL — Canon changelog

Every change to `00-OVERVIEW.md` (the canon) is logged here, newest first.

## 2026-09-26 — canon v2 (design review)

The v1 bible (pages 00–10, commit `9898f5f`) was roasted in `ROAST.md` (92 findings). `REVIEW.md` rules on every
finding, `00-OVERVIEW.md` is rewritten as canon v2, and `EDIT-ORDERS.md` tells the page editors what to change in
01–10. The engine already built (cell world, WebGL2 pipeline, room compiler, player movement) was kept as-is and
the decisions were fitted around it.

**Scope cut to one agent's size** (R7, R30–R34). 50 act-map nodes instead of 103 (~42 on a route), ~55
hand-authored rooms plus 6 room kits instead of ~250 rooms, 30 monsters instead of 51, 3 minibosses instead of 6,
5 classes (3 default + 2 unlockable) with 12-node boards instead of 8 with 24, 8 charms, 2 knots, 8 combos, 5 gear
slots, 12 affixes, 8 relics, 5 shops instead of 12, 14 NPCs instead of 28, 3 endings instead of 4, 5 trials, 10
Guild Hall unlocks, 20 achievements, no NG+. Everything cut moves to a "Parked (v2)" appendix, not the bin.

**One finale, one ending rule** (R1, R2, R40). The Storm's Eye (Ossery P1–P3, in rain) → `cs_rain_stops` → the
Falling Flood → the Dry Root → the Dry Eye (P4 and the walked-to final choice). The Rain now stops mid-Act 6, so the
last third of the game is a dry, falling world. Kindling (8 flags) is the only karma counter; endings A, B, C.

**"Start easy" is real** (R35, R42, R16). Act 1 teaches move, pole, dodge, two wicks (Rime and lob added), and the
plank kit; charms, overcharge, affixes and the skill board move to Act 2. Mother Tallow is two phases and 1,500 HP
in the campaign (her third phase stays for Lampless and Boss Rush). Spark moves to Act 2, Gleam's guaranteed drop
to Act 4. Act 1 telegraphs are 25% slower on every difficulty.

**Owners.** A table in 00 §3 says which page owns which fact; 10 owns file names and field shapes, content pages
own values; every other page links instead of restating (R4, R15–R29, R52–R72).

**Engine rules made canon** (R3, R10, R11, R12, R13, R45–R47, R50). Prefab state persists, raw cells do not;
saves stay in `localStorage` with size budgets. Pinned cells with a brass rim plus a free Rekindle post make
physics puzzles recoverable. Single thread is a constraint (measured: 1.4–1.8 ms sim per tick for a 56k-water
room); no scene holds more than 60,000 awake liquid cells, and big water is height-field water. Currents are
authored zones. Gravity bands move entities and hold the cells inside them still. One CPU light grid with four
tiers is the gameplay truth.

**Fun fixes.** The Act 4 oil economy has teeth (no regen in the dark, flask refills only at lamp-posts, R36); the
shape table meets its own balance rule (R37); burn-in is per flame and per shape so experiments start half-trained
(R38); boss counters are weaknesses, not punishments (R41); Floodgate scales with the player and the acts reached
(R43); traps hit enemies too and are taught as weapons (R51); grabs end on their own (R73).

**Missing specs filled** (R14, R83–R92): the procedural score ("the rain is the score"), body contact, player
hurt rules, hit-stop, spawning at load, sanctuary hubs, the builder's first-time overlay, boss camzones, room
transitions, the Endless flood rule, desktop + gamepad only.

**Brainstorm adopted** (REVIEW §b): Act 1 grace, the balcony first view, the relight sweep, the "last drop"
lantern-out rule, the lure rule, trap kills paying extra XP as "The Hollow" in the Ledger, the Tinker's trap
Hijack node, the diegetic Rekindle, brass-means-safe lesson, room kits, the procedural score, burning panic, oil
barrels as refuel and bomb, the flood clock, wick codes and the Wick Book, the Daily share line, the
`reach-check` test, perfect-dodge rain freeze.

**Plan.** 39 milestones (REVIEW §d): foundations M1–M10 (M1–M5 partly built), the Act 1 vertical slice at M15,
mechanics and acts M16–M33, classes, modes, balance, sound, polish and ship M34–M39.
