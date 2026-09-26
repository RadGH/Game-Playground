# LANTERNFALL — Design Bible Roast

> A blunt review of `docs/00`–`10` before one agent builds this in 20–50 milestones. Written as a game
> director and tech lead who has to sign off on the plan. Every finding has a number (R1…), a severity, where
> it lives (file:section), what is wrong, and a fix. The **Top 10** list at the end is what must change before
> milestone 1.

## The verdict in one paragraph

The pitch is good and the core idea is real: every spell is a coloured light, the world is made of stuff, and
the Rain is both the weather and the plot. Pages 03, 06 and 07 are unusually careful. But as a build plan the
bible is in trouble. It was written by five writers in parallel who each invented their own ids, keys, file
names, status names and numbers, so the pages **disagree on nearly every shared fact**. The finale (when the Rain
stops, how the ending is chosen) is described three different ways. The content volume is roughly a
**commercial indie game's worth of content** (≈ 250 hand-authored rooms, 63 monsters and bosses with ASCII
sprites, 8 classes × 24-node boards, 12 shops, 5 modes, NG+×5, 44 achievements), aimed at one agent. And a few
systems that the whole game leans on (terrain saving, water currents, the Act 4 oil economy, the "start easy"
ramp) either contradict themselves or do not do what the pitch promises. None of this is fatal. It needs one
canon pass, a hard cut, and three technical proofs before any content is written.

## Severity key

- **Critical** — builds the wrong game, or blocks the build, or cannot work as written. Fix before milestone 1.
- **Major** — will cost several milestones or make the game worse in a way players will notice. Fix before the
  system it touches is built.
- **Minor** — confusing, sloppy or small. Fix during the canon pass; nobody will die.

## Where to find each requested area

| Area | Findings |
|---|---|
| 1. Contradictions between pages | R1–R6, R15–R29, R52–R72 |
| 2. Scope reality | R7, R8, R9, R30–R34 |
| 3. Fun | R35–R44, R73–R76 |
| 4. Technical risk | R10–R13, R45–R50, R77–R80 |
| 5. Brief coverage | R14, R51, R81–R82 |
| 6. Missing specs | R12, R14, R50, R83–R92 |

---

# Part 1 — Critical

### R1. The finale is written three different ways — **Critical** · Contradiction
**Where:** 00 §6 (Act 6 *start*: "The Rain stops") · 00 §10 ("phase 4 happens as the Rain stops") · 01 §9.6,
§10.9 (end of Ossery P3 → the arena floor drops, you **fall 1,600 cells** down the root and climb back up through
`a6_flood_1…4`, then P4) · 09 §6.6 (three separate nodes: 15 "Storm's Eye" P1–3, 16 "Falling Flood" chain, 17 "The
Dry Eye" P4) · 05 §24.8–24.9 (an **8 s cinematic on the same platform**, cisterns under the platform burst, you
never leave the arena; the platform crumbles during P4; the arena is "the Warden's Loom") · 05 §18.6 (the
Rootwarden's wood burns "only after the Rain stops… if the player takes the Rain-stop lever route; 09" — a route
that exists nowhere).
**Problem:** the single most important set piece in the game has no agreed shape. The builder will pick one and
two pages will be wrong; the boss script, the room chain, the checkpoint rule (09 §6.6) and the Boss Rush
version (09 §13) all depend on it.
**Fix:** decide once. Recommendation: **09's three-node version** (P1–3 → Falling Flood chain → P4), because it is
the spectacle the pitch sold and it gives natural checkpoints. Rewrite 05 §24.8–24.9 to hand off to the chain
instead of an in-arena cinematic, delete the Rootwarden "lever route" line, rename the arena `a6_storm_eye` in 05,
and change 00 §6's Act 6 row to "Act 6 start: Charm slot 3, mastery; Act 6 end: the Rain stops" (09 §20.2 already
asks for this).

### R2. The ending is chosen three different ways — **Critical** · Contradiction
**Where:** 01 §11.2 (at 10% HP in P4 time stops; three physical prompts; success needs `kindling ≥ 5` and
`knows_keeper_rule`; Ending A keeps Ossery alive) · 05 §24.9 & §24.11 (a 3 s "Plea" window where *hitting him
ends it*; he then **dies**; his death line depends on a `mercy` counter and `vane_journal` pages; the ending
starts "when the player takes the Sky Wick") · 08 §12.3 (`vane_journal_1..6`: "the ending changes with all 6") ·
05 §16.1 (the `mercy` counter from sparing Knell, which 01 never reads).
**Problem:** 01's ending needs Ossery alive at 10%; 05 kills him. Three different "karma" counters (Kindling
flags, `mercy`, journal pages) feed an ending that only one page defines.
**Fix:** 01 owns the ending. Delete 05's Plea/death branch: at 10% the fight freezes into 01 §11.2's choice.
Make **Kindling the only karma counter**; fold `mercy` into one Kindling flag (`knell_spared`, e.g. "spared 10
Knell") and drop `vane_journal` as an ending input (keep the pages as lore). Update 05 §30.5.

### R3. Terrain you change is saved, and also never saved — **Critical** · Contradiction + Tech
**Where:** 10 §7.2 ("Things never written: **cell terrain changes**, … liquids") · 09 §4.3 & §5.4 (burned walls,
placed planks, frozen falls, set sluices stored as a **per-room diff**; water drifts back in 60 s) · 07 §9.1
("campaign rooms save their parts…; a burned plank stays burned") · 01 §3.3 ("gates you have set stay set").
**Problem:** in a game about changing the world, "does my change stay?" is a core rule, and the save page says
no while three content pages say yes. A cell diff for a 960×540 room can be hundreds of KB, and slots share a
~5 MB `localStorage` with the whole playground (R47). And if changes persist, a player can permanently soft-lock
a room (R10).
**Fix:** a middle rule, stated in 00: **prefab state persists** (levers, gates, doors, chests, broken
`breakable_wall` groups, built parts as a part list), **raw cell changes do not** (burned floors, melted wax,
moved water, frozen falls reset on re-entry). Anything a puzzle needs to remember must be a prefab. This keeps
saves small and makes soft-locks recoverable by leaving the room.

### R4. The schemas are five dialects, and 10 is not actually authoritative — **Critical** · Contradiction
**Where:** 10 §5.0 lists the "real" data files; every other page lists its own: 03 §19 (`reactions.json`,
`combos.json`), 04 §21 (`movesets.json`, `boards.json`, `abilities.json`, `challenges.json`), 07 §1 (`movement.json`,
`rope.json`, `interactables.json`, `traps.json`, `build-parts.json`), 01 §13 (`story.json`, `districts.json`,
`lore.json`, `silent-bells.json`), 02 (`bindings.json`, `difficulty.json`, `captions.json`), 08 §20 (`economy.json`),
09 §17 (`acts/act1..6.json`, `modes/*.json`, `guildhall.json`, `achievements.json`). 10 has `skills.json`,
`progression.json`, `prefabs.json`, one `acts.json`, `trials.json`, `waves.json` instead, and **no** reactions,
combos, movement, rope, traps, story, lore, bindings, difficulty or economy files. Rooms live in `data/rooms/`
(09 §17) or `rooms/` (10 §2). Tests live in `tests/*.test.js` (every page) or `tests/unit` + `tests/e2e` (10 §2).
And 10's own example JSON disagrees with the content pages on **field names**, not just numbers (resists as
multipliers `"ember": 1.5` in 10 §5.10 vs percent in 03/05; `mods.projectiles` vs `params.count`; rarity
`magic` vs `fine`; slot `charm_ring` that 08 does not have).
**Problem:** 10 says "the content page wins" for numbers, but nobody wins for file names and field names. The
first data-loader milestone will stall on this.
**Fix:** before milestone 1, write **one file manifest** in 10 §5.0 that is the union actually needed, and one
canonical example per file copied from the owning content page (not invented in 10). Delete every other page's
file list and replace it with a link. Rule: *10 owns names and shapes; content pages own values*.

### R5. Two incompatible wiring systems — **Critical** · Contradiction
**Where:** 07 §6 (logic **gates as nodes** in `wiring[]`, targets name their inputs with `in`, `wires[]` is
drawing-only, analog values via `"valve_1.level"`) vs 10 §6.5–6.6 (wiring is `wires: [{from, to, do, when}]`
with **actions** like `open/drain/say`, and gates are `logic`/`counter` **things**). Thing types also differ:
07 `sluice_gate`, `weighted_plate`, `lever3`, `grapple ring`, `trap_*`; 10 `sluice`, `plate`, `grapple_point`,
`spike`. Timed door default 4 s (07) vs `open: 6` (10).
**Problem:** every puzzle room depends on this, and 10's two example rooms use 10's model while 07's 39 puzzles
are written in 07's.
**Fix:** keep **10's action model** (it reads better for room authors and handles `say`/`spawn`/`drain`), add
07's gate list as `logic` kinds (`timer` modes, `latch`, `toggle`, `counter`, `sequence`, `compare`, `any_of`),
and adopt 07's type names everywhere (they are more precise). Rewrite 07 §6.4 in 10's syntax.

### R6. Is sand solid? — **Critical** · Contradiction + Tech
**Where:** 06 §12.1 ("Solid for movement = `STATIC` **or `POWDER`**") vs 07 §2.1 ("powders (sand, soot, ash) are
**not solid** for the player; powders slow ×0.7"). Step-up is 3 cells (06 §12.2, 10 `collide.test.js`) vs 2
walking / 3 running / 4 airborne (07 §2.1).
**Problem:** this decides whether rubble piles are floors, whether burying works, whether dunes are walls. It is
the first thing the collision code has to know.
**Fix:** powders are **solid** (06), with depenetration (06 §12.3) so burial never traps; loose top layers slow
you. Adopt 07's variable step-up (it feels better) and fix 10's test.

### R7. The content volume is not a 20–50 milestone game — **Critical** · Scope
**Where:** everywhere; totals below are counted from the pages.

| Content | As specified | Realistic for one agent at good quality |
|---|---|---|
| Act map nodes | 103 (18/17/18/16/16/18) | 6 acts × 6–8 nodes ≈ 40 |
| Room templates | ~35 per act target, 22 min (09 §4.2) → **132–210**, + 15 trials + ~20 endless pieces + arenas ≈ **250** | ≈ 60–80 |
| Rooms played on one route | 25–38 per act → **~180** (09 §3.3) | ≈ 70–90 |
| Regular monsters | 51 + 14 elite mods (05) | ≈ 24–30 |
| Minibosses / bosses | 6 / 6 (Ossery 4 phases) | 3 / 6 |
| Boss attacks with bespoke telegraphs | ≈ 90 | ≈ 40 |
| Classes | 8 × (7-move moveset, ability, passive, **24-node board**) = 192 nodes | 5 × 12-node boards |
| Spell parts | 7 flames, 8 shapes, 12 charms, 4 knots, 12 relic strands, 20 combos, 16×7 reactions, 12×8 charm-shape rules | keep flames/shapes; 8 charms; 2 knots; 8 combos |
| Items | 66 bases, 32 affixes × 5 tiers, 18 uniques, 3 sets, 26 consumables, 14 dishes, 12 blessings/curses, 10 gadgets | 30 bases, 12 affixes, 8 relics, 0 sets, 12 consumables |
| Shops | 8 canon + 4 roaming/secret, incl. a real-time auction | 5 |
| NPCs / lines | 28 NPCs, ~190 lexicon entries, ~30 new intents × 10–16 lines, 11 cutscenes, 4 endings, 60 lore plaques | 12 NPCs, 10 intents, 6 cutscenes, 3 endings |
| Traversal | 33 interactables, 22 traps, 19 build parts, 39 puzzles with ≥ 2 replays each | 18 / 10 / 8 / 20 |
| Modes | Floodgate 30 waves, Endless, Daily, Boss Rush, 15 Trials, NG+×5, Guild Hall 26 unlocks, 44 achievements | Waves (15), Endless (+ Daily as a flag), Boss Rush, 5 Trials |

**Problem:** a milestone that lands one act's content well (rooms, monsters, boss, puzzles, NPCs, shop) is 4–6
milestones on its own. Six acts at this size is 30+ milestones **after** a 8–10 milestone engine, before any
mode. The playground's own history (Farhold's rounds 11–27) shows that half-connected systems are the house
failure mode ("a finished module with no way in"). This bible multiplies the number of modules.
**Fix:** adopt the right-hand column as the **ship scope**, keep the left as the "someday" list in 00. Section
"Suggested cut and milestone skeleton" at the end gives a concrete plan.

### R8. An agent cannot author ~250 good rooms in the format given — **Critical** · Scope + Tech
**Where:** 10 §6 (ASCII block map + ops + things + wires, "~150–400 lines of JSON" per room), 10 §6.10–6.11
(workflow: write JSON, check, look at a thumbnail PNG), 09 §4 (templates + seeded variation).
**Problem:** the format is clever, but: (a) an agent designs blind — the only feedback is a 1-px-per-cell
thumbnail and a **reachability check that is only a warning** (10 §6.11); (b) the things that make this game's
rooms interesting (water that must reach a plate, fire that must spread, a crate that jams a gate) cannot be
checked statically; (c) the two worked examples in 10 already fail their own checker (R66). 250 of these at
quality is not happening; 250 bland ones is worse than 70 good ones.
**Fix:** (1) cut to ~70 rooms (R7). (2) Make **reachability an error**, computed by a movement-aware bot using the
real `movement.json` numbers and the act's unlocked verbs. (3) Add **room kits**: small parametric generators for
the bread-and-butter rooms (`fight_small`, `shaft`, `bridge_gap`, `flooded_hall`) that emit the same JSON, so
hand-authoring is saved for lessons, puzzles, hubs and arenas (~30 rooms). (4) Add a headless **"play the
solution" script** per puzzle in high-level verbs (`goto`, `interact`, `castAt`) instead of frame-exact replays
(R49).

### R9. ASCII sprites for everything, including 120-cell bosses — **Critical** · Scope + Tech
**Where:** 10 §5.22 (sprites are ASCII art in JSON, "never exceed 64 × 64"), 05 sizes (Sluicemaw 120×40,
Bellfather 90×110, Widow 80×60, Tallow 56×88, minibosses up to 48×40), 02 §14.2 (the paper doll re-renders gear on
the 6× sprite), 02 §9 (6 hood shapes × 8 coats × 4 lanterns), 04 (8 classes with ~7 attack animations each).
**Problem:** the art budget is not in the bible at all. The 64×64 cap contradicts every boss size. Hand-typed
ASCII frames for 60+ creatures × idle/move/wind-up/attack/hurt/death is thousands of lines of pixel strings
nobody has sized.
**Fix:** add an **art plan** to 06: (a) bosses and big enemies are **assembled from parts** (a torso, limbs,
head as separate small sprites posed by code), which also makes telegraph "glows" per limb easy; (b) small
enemies are ASCII, 2–4 frames, with squash/stretch done in code; (c) gear is a colour swap + 1 overlay per slot,
not a new body; (d) Tallow's "body of real wax cells" uses her *cells* as the art. Raise the sprite cap or make
parts the rule. Budget it: one milestone per act for art.

### R10. Nothing stops the player from soft-locking a physics puzzle — **Critical** · Missing spec + Fun
**Where:** 07 §9.2 rule 5 only stops you *building* yourself in; 03 §12 lets spells dissolve brick, burn wood and
ropes, drain and freeze water; 09 §8.2 resets a room only on death; 02 §20 "Return to last lamp-post" charges the
death penalty.
**Problem:** in a falling-sand puzzle game the player **will** burn the only rope, dissolve the only ledge, drain
the water the plate needed, or drop rubble on the lever. With R3 unresolved, that mistake can even persist in
the save. The current answer is "die on purpose".
**Fix:** three rules in 07/09: (1) **puzzle-critical cells are `PINNED`/`lampstone`** (indestructible, drawn with a
faint brass rim so the player learns the look); (2) every puzzle room has a **free "Rekindle room" action** at its
entry door (reset to the template + prefab state, no penalty); (3) `room-check` fails a puzzle room whose
★ solution script (R8) can be broken by any single flame applied to any non-pinned cell on the solution path.

### R11. The performance plan is unproven and there is no escape valve off the main thread — **Critical** · Tech
**Where:** 06 §20 (sim 2.7 ms normal / 8.7 ms worst on a 2020 Iris Xe laptop), 06 §8.7 (Falling Flood authored
to **≤ 250,000 liquid cells** in the sim window), 06 §14.3 (24 shadowed ray-marched lights at half res), 10 §12
(no service worker), `spike/` (a working sand spike exists, but **no numbers are recorded anywhere**).
**Problem:** a JavaScript falling-sand pass that moves 250 k liquid cells a tick is not 3.5 ms; on that
hardware it is closer to 10–25 ms. Worse, the usual fix — moving the sim to a Worker with shared memory — needs
`SharedArrayBuffer`, which needs cross-origin-isolation headers that **GitHub Pages cannot send** (and 10 bans the
service-worker workaround). So the sim, AI, spells, ropes and Lingo all share one thread forever.
**Fix:** (1) Before any content, run `bench_flood` (06 §21) on the real reference laptop and **write the numbers
into 06**; make the milestone-1 gate numeric. (2) Cap moving liquid by design: the Falling Flood, Sluicemaw
reservoir, Floodgate and Endless floods are **height-field water with a thin cell band** (06 already does this for
three of them — make it the rule for all big water, and say so for the Falling Flood). (3) Decide now whether to
allow a Worker with `postMessage` of dirty chunks (no shared memory); if not, write "single thread" into 00 as a
constraint every page must respect.

### R12. Currents, undertow, jets and water wheels need a velocity the sim does not have — **Critical** · Contradiction + Tech
**Where:** 06 §2.1 ("There is **no per-cell velocity**") vs 07 §2.10 ("water cells carry a flow velocity from the
sim; the player gets 60% of the local flow"), 07 §5.14b (dynamo level = flow ÷ `ratedFlow`), 07 §5.10 (sluice jet
speed), 01 §3.3 (undertow 50 cells/s at open sluices), 01 §3.3 & 09 (the 2,000-cell Long Channel "water slide on
the current"), 05 §21 (Sluicemaw's permanent current, whirlpool pull).
**Problem:** half of Act 3's play and one boss are built on a quantity the engine explicitly does not compute.
**Fix:** add **authored current zones** (a `current` thing: rect + vector + strength, optionally switched by
wiring) that push entities, floats and loose cells. Dynamos read a zone or a basin's drain rate, not the cell sim.
Say in 06 that cell water is cosmetic for flow; gameplay flow is zones.

### R13. Gravity bands fight the cell scan order — **Critical** · Tech
**Where:** 07 §2.15 (loose cells, water and rain "fall up" inside a band), 05 §23 (Bellfather flips bands of a
380-tall shaft every 8–9 s), 06 §4.2 (pass A scans **bottom-up** so falling columns move together; there is no
up-falling pass).
**Problem:** a liquid that falls up must be scanned top-down or it tears into single cells and moves 1 cell per
tick. Bands are arbitrary rectangles, not chunk-aligned. This is a new cell-sim mode hidden in two pages.
**Fix:** either (a) bands affect **entities, fragments and particles only** and cells inside a band freeze
(simplest, still spectacular), or (b) bands snap to **whole chunk rows** and pass A scans those rows top-down with
mirrored rules. Pick one in 06 before Act 5.

### R14. Music is referenced everywhere and specified nowhere — **Critical** · Brief/Missing spec
**Where:** 02 §19.2 (`music` bus), 02 §7 (title theme), 05 §26 (boss beds `lf.boss.<id>.bed`), 09 §14 (a jukebox
reward), 09 §15 (`gh_jukebox`), 10 §3.9 (`audio/music.js`).
**Problem:** there is no music source. The playground's `sfx/` has ambience loops, not music. A boss fight
without music in a game this atmospheric will feel unfinished, and an agent will not compose 15 tracks by hand.
**Fix:** decide in 00: either (a) **rain + ambience is the score** (on theme: the Rain never stops) with a small
procedural drone/bell layer per act and a pulse layer for bosses, built on the sfx engine; or (b) CC0 tracks
vendored like the Kenney sounds. Delete the jukebox if (a).

---

# Part 2 — Major

## Contradictions

### R15. Four names for the same difficulty ladder — **Major**
02 §10 (`wicklit`/`lamplighter`/`lampless` + Iron Wick, Drowned as a post-game unlock) · 04 §19 (`easy`/`normal`/
`hard`) · 05 §2.4 (`lamplit`/`normal`/`guttering`/`drowned`) · 10 §7.2 (`"difficulty": "normal"`) · 01 §11.7
(Ending C unlocks a fifth, "Lanternfall hard mode": enemy HP +25%, oil −20%).
**Fix:** 02's ids and 05's numbers, as 02 §29.5 proposes; drop the Ending-C mode (it is Lampless again) and
make that reward cosmetic.

### R16. Overcharge: which button, and when — **Major**
02 §2.2 and §29.8 say **holding cast** overcharges and that "03 §9 is followed"; 03 §9 says you must **hold `R`**
and "without `R` held, cast always taps". Unlock: 02 says Act 1 **room 5** citing 03 §15.1; 03 §15.1 says **room
3** citing 02; 03 §23.3 says "room 3 as 02 says"; 09 §6.1 puts an overcharge lesson in Candlemarket's third room
("act room 5"). 00 §6 lists no overcharge before Act 6, and the pitch verdict wanted it "invisible to new players".
**Fix:** hold-to-overcharge (02), unlocked at **Act 2 mid** with the Charm slot (see R35 for why not Act 1).
Fix all four cross-references.

### R17. Overcharge "mastery" means three things — **Major**
00 §8 ("removes the burst chance for **a single charm slot**"), 03 §9.4 (one charm slot on one wick, but then the
**whole wick** never gutters), 03 §9.2 ("+0.05 per Act-6 Mastery **step**", steps undefined), 02 §11.6 ("removes
the red for the mastered charm slot").
**Fix:** "one **wick** is mastered: it cannot gutter"; move it at any lamp-post. Drop "charm slot" and "steps".

### R18. The key map collides with itself — **Major**
07 §3.1 grapple = **right mouse / LT** (02: `F` / RB; right mouse is the pole) · 07 §9.1 build mode = **`B` /
d-pad down** (02: `G`; `B` is the Wick builder; d-pad down is quick heal) · 07 rotate = **`R` / Y** (02: wheel / LB·RB;
`R` is the overcharge modifier) · 07 part pick `1`–`9` (02: `1`–`4` for "plank / brace / **step / wedge**", two parts
that do not exist in 07 §9.3) · 07 §6.5 Inspect = **hold `Tab` / R3** (02: `Tab` is menu focus, R3 is soft lock; Inspect
is missing from 02) · 07 interact = gamepad **X** (02: North) · 07 run = gamepad **B held** (02: B is dodge) · 04
§23.1 class ability = **`Y` / LB** (02: `Y` is hood, LB is the tool wheel; 02 never binds the class ability) · 08
§2.1 belt = `1`–`4` (02 moved it to `Z X C V`).
**Fix:** 02 owns keys. Add `class_ability` (suggest `R`, since the overcharge modifier is opt-in and can move to
`Shift+cast`; pad: tap LB, hold LB stays the tool wheel) and `inspect` (hold `Tab` **only in play context**, where it
does not clash with menu focus; pad: hold View). Delete every key table outside 02 and run 02 §28's
`bindings.test.js` idea against the *docs* now.

### R19. Build mode speed, grid and rotation disagree — **Major**
02 §2.3 (time 35%, 2-cell grid, 15° rotation, 4 parts) and 02 §10.1 (0%/35%/50% by difficulty) vs 07 §9.1 (full
speed "building in a fight is a skill", 4×4 grid, 45° steps, 1–9 parts). 08 §11.2's plank is 12×2 for 3 scrap;
07's is 24×2 for 2 scrap.
**Fix:** 07 owns building; 35% slow-time as an accessibility option only; 4×4 grid; 45°; 07's part sizes.

### R20. Status effects are defined twice with different numbers and names — **Major**
03 §4 (`burn`, `chill` −10%/stack, **5** stacks → `frozen` 1.5 s, bosses never freeze → `Numbed`; `soaked` blocks
burn and Spark ×1.5; `dimmed` affects **only the player**) vs 05 §5 (`burning`, `chilled` −15%/stack, **4** stacks,
bosses frozen 0.6 s once per 20 s; `wet`: ember −30%, Spark +50%, knockback ×1.5; `dazzled` for Gleam; `dimmed` on
**monsters**) vs 08 (`wet`) vs 10 §5.6 (burn ticks 0.08 of *spell power*, vs 03's 20% of *the hit* per second).
**Fix:** 03 owns statuses (05 §30.7 even says so). Merge `wet` into `soaked`, adopt 03's numbers, add `dazzled`
to 03, and let 05 list only AI reactions.

### R21. Resistances break the rules they were given — **Major**
03 §14.1 says no flame goes below −50 on a normal enemy, bosses are immune to at most 2 flames, and there is no
"heals from" tier. 05 uses −100 (Dripling tide, Waxwing ember), −150 (Shroud gleam), `HEAL` (Unlit shade, Tallow
ember, Widow shade, Bloat Toad tide) and `IMM`. 10 §5.10 stores resists as multipliers.
**Fix:** allow `weak2` (−100) and `heal` explicitly in 03 (they are good design: "douse the candle"), keep the
boss cap, one number format (percent).

### R22. Boss voices and lines are different in 01 and 05 — **Major**
01 §6.4: Tallow `cultist`, Gnaw **babble only, subtitled**, Widow speaks in **stolen NPC voices**, Bellfather `brute`
+ robot, Ossery `stormcaller`. 05: Tallow `elder`, Gnaw `priest` speaking **English** bespoke lines, Widow `oracle`,
Bellfather `dragon`, Ossery `sorcerer`. The bespoke lines differ between 01 §12.4.3 and 05 §19.11–24.14.
**Fix:** 01 owns voice and lines (its ideas are better: the stolen voices are the best idea in the bible). 05
keeps only mechanics and references line ids.

### R23. Most voice roles do not exist — **Major** · Contradiction + Tech
**Where:** `shared/voices.js` `ROLE_VOICES` has exactly **warrior, ranger, mage, cleric, narrator, villager**
(checked). The docs use elder, knight, merchant, priest, swashbuckler, child, tinker, rogue, cultist, runesmith,
necromancer, undead, scavenger, oracle, stormcaller (01), brute, dragon, sorcerer, druid, tactician, goblin (05),
cook, mystic, smith, sailor (08). `voiceFor` silently falls back to `villager`. 01 §13's test ("every voice role
exists in `ROLE_VOICES`") would fail on day one.
**Fix:** add ~12 roles to `shared/voices.js` as its own reviewed milestone (Emberveil and Farhold import it — add,
never change), and map the rest onto them in one table in 01.

### R24. Shopkeepers are two different people — **Major**
01 §6: Odile `jolly/scholar/romantic` seed 1104, Crane `greedy/sarcastic/paranoid` seed 1105, Brisket
`kind/jolly/hungry`, Wenna `sarcastic/greedy/scholar`, Marl `pious/greedy/pompous`. 08 §16: Odile `gourmand, kind`
seed 2101, Crane `greedy, sentimental` 2203, Brisket `kind, loud`, Mothwife `cryptic, playful`, Clink `tinkerer,
blunt`, Marl `zealous, mercenary`, Wenna `weary, wry`. **`gourmand`, `sentimental`, `loud`, `cryptic`, `playful`,
`tinkerer`, `blunt`, `zealous`, `mercenary`, `weary`, `wry`, `chatty`, `sly`, `terse` are not Lingo traits** (the
real 25 are listed in 01 §6.1). Catchphrases differ too.
**Fix:** 01 owns people. 08 references `npc_*` ids only.

### R25. Odile names your spells in five different ways — **Major**
01 §12.4.1 (`spell_taste` Lingo pool; the name comes from 08's namer), 02 §15.3 (offered at **burn-in 5**) and
§23.2 (a **Lingo** name generator), 03 §16.2 (burn-in 5, intent `odile_names_wick`), 08 §16.1 (**rule-based dish
names** "Smoky Skewer for Two", free once per build, intent `shop_wick_taste`, +10% burn-in on "superb"), 10 §3.5
(`nameWick(wick, lingo)`) and 10 §5.24 (`odile_name_wick`).
**Fix:** 08's dish-name rule for the name (deterministic, testable, funny), 01's pool for her comment, available
any time at her shop. One intent id.

### R26. Crane's memory and mood are two systems — **Major**
01 §12.5 (memory type `sold_item`, recall intent `pawn_recall`, mood = Lingo `rel.opinion()`, ±15%) vs 08 §16.2
(memory type `trade`, intent `shop_pawn_remember`, a separate mood scalar with a 7-row table, 15–35% sell, a
3-step haggle per row).
**Fix:** use the Lingo relation (the playground already has it; that is the point of the brief) and 08's price
formula reading `opinion()`. Delete 08's mood table.

### R27. Where the strands come from, and a Lesson that needs one you may not have — **Major**
Rime: 01 A1.3 (Seld, Candlemarket), 03 §15.2 ("Wax Stair lesson room"), 09 §6.1 (Candlemarket room 2). Spark: 01
A1.6 (Drip Gallery), 03 (the "dead lamp-lift puzzle"), 07 P1-6 (a Spark Lift in `a1_stair` **that needs Spark to
solve**), 09 (Drip Gallery room 2). Bile: 01 (Brickgut) vs 03 (Gutter cistern). Shade: 01 (Hanging Houses) vs 03
(Moth Nave approach). **P1-2** (07 §10.1), the Wick-builder Lesson, has as its ★ solution "Ember Bolt for the
high candles and **Ember Lob** for the lipped ones" — but at that point the player owns bolt, ring and arc; **lob is a
shop item or a boss reward** (03 §15.2). A Lesson that cannot be solved as taught is a broken first hour.
**Fix:** 09's node table is the source of truth for where each strand drops; 03 §15.2 becomes a link. Give **lob**
in the Candlemarket lesson (the builder lesson should teach two shapes, not one), and move P1-6 after Spark is
granted.

### R28. The Sluicewarden starts with Act 3's headline mechanic — **Major** · Contradiction + Fun
00 §6 says Tide arrives in Act 3 as "Water is terrain you change"; 04 §6.2 hands the Sluicewarden **Tide Wave** in
slot 1 at minute one (and says "a starting wick grants the strand"). 05 §19 notes "Act 1 has no Tide". 01's
`tallow_cooled` needs Rime/Tide only in Act 1. Meanwhile 00 §6 says every start is "1 wick slot with **Ember +
Bolt**".
**Fix:** the Sluicewarden starts with **Rime Wave** + a Tide wick that is "Guild-braided but dry" (can only be used
on existing water, no water creation) until Act 3. Or accept it and cut Tide from the Act 3 row. Don't do both.

### R29. The Moth Oracle challenge and the Widow's snuff — **Major**
04 §16.5 (the Widow's snuff **counts** as the lantern going out unless relit within 2.0 s) vs 05 §22.1 (the lantern
**cannot be relit** inside the Nave until she dies) and 05 §22.13/§30.6 (the snuff is a **scripted exemption**).
Following 04 + 05 §22.1 makes the Moth Oracle **impossible to unlock**.
**Fix:** 05's exemption. Delete 04's 2 s rule and its test case.

## Scope

### R30. Five classes you mostly never play — **Major** · Scope + Fun
04 §16.1: a class unlocked mid-campaign is only usable in a **new game** (no mid-save swap); Endless, Boss Rush and
Trials can use it at once. Ferrywitch unlocks in Act 3, Drowned Knight needs 3 underwater deaths *then* a clean
act, Moth Oracle needs Act 4, Bellringer needs 12 bells including a backtrack. So 5 of 8 classes (and 5 × 24
board nodes, 5 movesets, 5 abilities) are content most players see only in modes. That is ~60% of the class work
for ~10% of play time.
**Fix:** ship **3 + 2** classes (Chimneysweep and Moth Oracle have the most distinct play). Let an unlocked class
be **picked at any lamp-post at the start of the next act** (a "new Lamplighter answers the call": same level,
respec'd points, the new class's kit) so unlocks matter in the run where they happen.

### R31. Twelve shops, each with a mini-game — **Major** · Scope + Fun
08 §16–17: 8 canon shops + peddler (90 s timer), fence (heat system), salvage diver (dive timers), auction
(real-time bidding with rival bidders). Plus Crane's 3-step haggle, Brisket's rotating menus + mystery table +
donations, the Mothwife's glow confusion matrix, Clink's 3-part gadget recipes, the Tithe's blessings/curses
economy, the Ferry's max-health payments. Each is a UI screen, a data table, a test and a sim target (08 §19).
**Fix:** ship 5 shops: **Wick & Tallow** (strands; the naming quirk), **Crane's Pawn** (sell anything; remembers
sales via Lingo), **Soup Barge** (meals; menu rotates), **Mothwife** (sealed lanterns), **the Ferry** (travel,
respec, pay in max health). Fold Scrapwright into Crane (parts + satchel rows), make the Drowned Market a stall
of the Mothwife underwater, cut the roaming four. That keeps every quirk the brief asked for.

### R32. Items: too many knobs for a spell game — **Major** · Scope + Fun
08: 8 gear slots, 32 affixes × 5 tiers, rarity steps, blessings, 18 relics, 3 sets, tempering +1…+5, reforge,
recast, add-affix, relic rerolls. Pillar 3 says **"Gear and levels support the Wick builder; they never replace
it."** A full ARPG loot game beside a spell builder splits the player's attention and doubles the balance work.
**Fix:** 5 slots (lantern, weapon, coat, boots, trinket), ~12 affixes with item-level scaling instead of tiers,
~8 relics whose powers touch **spells or the world** (Tallow Heart, Maw Tooth, Widow Veil are exactly right), no
sets, tempering only.

### R33. Canvas2D as a full second renderer — **Major** · Scope + Tech
06 §17 and 10 §9.2 require the Canvas2D path to **pass the same visual specs** (CPU light map with occlusion,
reflections, sheen), 02 §7 a static PNG fallback title, 06 §23.11 a "Canvas2D parity pass". WebGL2 is available
in every browser the user targets; the fallback is a second renderer to keep in sync forever.
**Fix:** Canvas2D is a **debug/test view only** (flat colours, no lights, no reflections), used by Node-less
unit specs. Drop "same visual specs". Show a clear "needs WebGL2" card otherwise.

### R34. NG+ ×5, Guild Hall ×26, achievements ×44, 15 trials — **Major** · Scope
09 §9, §14–16. Meta layers are cheap to specify and expensive to test (each unlock needs "the module reads the
knob" tests, 09 §18).
**Fix:** v1 ships 5 trials (the ones that unlock classes, 09 §19.9), 10 Guild Hall unlocks, 20 achievements, no
NG+. List the rest as "parked" in 00 so they are not forgotten (house rule).

## Fun

### R35. "Start easy" is not easy: Act 1 is the busiest act — **Major** · Fun
In the first hour (00 §6, 07 §2, 02, 03 §15.1, 08, 09 §6.1) the player gets: walk/run/jump with variable height,
dodge with i-frames, wall-slide + wall-jump, ledge-grab, crouch/crawl/slide, drop-through, carry/push/pull/throw,
a 3-hit combo + heavy + air + plunge/pogo, lantern touch, the Wick builder with 2 slots and 4–5 flames and 4 shapes,
**overcharge with a gutter risk** (03 §15.1 turns the gutter off until Act 2 — so a hold does nothing risky, which
teaches the wrong habit), the plank kit with a build mode, levers (decorative), 2 shops, 8 gear slots with
affixes, attributes, a 24-node skill board, the Ledger, the map, a miniboss, a boss with terrain melting and a grab.
Five Lesson rooms in 18 nodes.
**Fix:** Act 1 = move/jump/wall-jump, pole combo, **one** wick → two wicks (Ember, Rime; bolt, lob), plank kit
late. Move dodge i-frames, ledge-grab and slide to the Act 1 hub trials (optional), overcharge to Act 2, affixes
and the skill board to Act 2 (Act 1 gear is plain bases; the first level-ups give attribute points only).

### R36. The Act 4 oil economy has no teeth — **Major** · Fun
The pitch sells Act 4 as "light is finite" (00 §6). The numbers say otherwise: Lamplighter oil regen is
`3.0 + 0.1 × Draught` ≈ **3.6/s** at level 1 and **always on** (04 §5); the Guild lantern's dark burn is **0.9 oil/s**
(08 §5.1), reduced further by Draught. Net: **+2.7 oil/s while standing in the dark**. On top: the oil flask
**auto-refills** the lantern under 25% (08 §3), `lamp_oil` stacks to **99 × 40 oil** (08 §9.1), and oil blobs drop
from 15–100% of kills (08 §14.2). The only real cost is that the lantern radius shrinks with oil % (06 §14.2), and
casting is what drains it.
**Fix:** in darkness, **regen stops** (the Rain "carries no light", 01 §1.3) and the lantern burns 2–3 oil/s; lamp-posts,
sconces, Hush and Beacon are the refuel/relief points; the flask refills only at lamp-posts; `lamp_oil` stack 10.
Then 08 §19's "oil spend share 20–30% in Act 4" becomes true.

### R37. The spell table fails its own balance rule before a single charm — **Major** · Fun
Using 03 §3.1/§5.1 (Ember power 12, level 1, no charms), damage per oil against one target:

| Shape | Damage / oil | vs median (≈1.68) |
|---|---|---|
| ring | 0.77 | **0.46× — "dead" (< 0.67×)** |
| wave | 1.32 | 0.79× |
| bolt | 1.50 | 0.89× |
| lob | 1.56 | 0.93× |
| rune | 1.80 | 1.07× |
| arc | 2.80 | **1.67× — flagged** |
| beam | 3.00 (54 DPS for 18 oil/s) | **1.79× — flagged** |
| tether | 0.3 × 5 ticks/s × 12 × 30 s ÷ 15 oil ≈ **36** if anything stands in it | **~21× — broken** |

03 §17 promises the sim will catch this, but the starting numbers are the first thing the sim will reject, and
tether as written is a 15-oil turret. Also: with the 0.67–1.5× band enforced everywhere, spell choice risks
becoming flavour; the interesting differences are the **material effects**, which the band does not measure.
**Fix:** price per-second shapes per second of *uptime on a target* (cap tether damage per enemy per second and
give it an oil drain while it exists), raise ring's power or lower its cost, and add a **"utility score"** column
to the sim (cells changed, water made, doors opened) so a Tide Ring that throws a pool is not "dead".

### R38. Burn-in punishes the experimenting the game is built on — **Major** · Fun
03 §10: burn-in belongs to the **core** (flame + shape) and needs 7,000 oil for level 5 (+24% power). A player who
tries a new core starts at +0%. Pillar 3 is "Build the spell, then prove it."
**Fix:** burn-in per **flame** and per **shape** separately (each +3% × level), so a new pairing starts half-trained,
or grant new cores the average of their two parents.

### R39. The Bell Tithe will refuse service to nearly everyone — **Major** · Fun
08 §16.7: blessing prices climb +8% per `lt_cult` kill (cap ×4) and the shop **refuses service at 25+ kills**. 05 §7.3
puts Knell in the spawn tables from **Act 2** (≈20% of act 2 groups, 15% act 3, ~25% act 4, groups of 2–4). A normal
player kills 100+ Knell before reaching the Tithe in Act 5. Surrender (05 §16.1) needs the victim below 25% HP,
no ally within 150 cells, and a 40% roll.
**Fix:** only **named/marked** Knell (a lit bronze badge) count, or count only kills *after* meeting Marl, and raise
the refusal line to 60. Or make the quirk a discount for mercy instead of a ban for kills.

### R40. Act 6's "drastic change" happens in the last fight — **Major** · Fun
Acts 2–5 each add a verb. Act 6 adds overcharge mastery (a number) and wind, and the Rain stops only between boss
phases (R1). The climb itself is Act 1–5 play in grey.
**Fix:** stop the Rain at **The Last Wall** (09 node 14), mid-act. The last third of Act 6 is the *dry, falling*
world: held water pours, cloudstuff dissolves, Tide can no longer draw from rain, Ember finally burns the root. The
boss fight then keeps its P4 "the last cloud" beat without carrying the whole set piece.

### R41. Some bosses invalidate the build you were told to make — **Major** · Fun
The Widow P3 heals **25% of damage from beam, ring and rune** (05 §22.7); Ossery P2–P3 **steals your selected wick**
(05 §24.5) and has a **60–80% Rain Mantle** unless you fight under cover (§24.1); the Bellfather's arena is 380 tall
with a 270-cell view and gravity flips every 8 s in P3 (§23.2, §23.7). Each is a fine idea alone; together, the
late game repeatedly says "the spell you built is wrong here".
**Fix:** keep one "counter-build" rule per boss and make it **positive**: e.g. the Widow is *weak* to bolts/lobs
(+25%) instead of healing from lingering shapes; the Mantle is 40% and falls off for 5 s after any Ember/Rime/Shade
counterplay; the Bellfather's view goes wide (06 §19.4) and every band shows its state on-screen, not only at the
edge.

### R42. Mother Tallow is not an Act 1 boss — **Major** · Fun
05 §19: 2,400 HP, 3 phases, 11 attacks including a grab with button-mashing, a full-floor molten wave, a
floor-filling "Last Pour" void band, summons, terrain that changes every 5% HP, and enrage. It is a great boss for
Act 2 or 3. For the first boss of a game that promises to start easy, it is a wall, and 01's `tallow_cooled` asks
first-time players to finish her with Rime only.
**Fix:** Act 1 Tallow = P1 + P2 only (drop the grab and Last Pour; the wax wave telegraph 1,800 ms), 1,500 HP. Move
the full three-phase Tallow into Boss Rush / Drowned difficulty.

### R43. Floodgate is a water puzzle, not a fight — **Major** · Fun
09 §10: start **level 8**, gain **0.5 levels per wave** (≈ level 23 by wave 30), enemies at area level **3→12**.
The combat is trivial by wave 5; the only loss condition is water, solved by 6 pumps. It also needs **the whole
bestiary** (Unlit, Act 6 cloud things) and darkness waves, yet unlocks after Act 1 (00 §12) — spoilers, and the
mode cannot be finished until every act's roster exists.
**Fix:** enemy area level = player level + wave/5; waves use **only acts the profile has reached** (so the mode
grows with the campaign); 15 waves at ship.

### R44. Hidden rules everywhere, few of them readable — **Major** · Fun
The charm × charm table (03 §6.3) has 3 bans and 9 "!" special rules; charm × shape (03 §7) has 20 bans and 12
changed meanings; 20 flame combos (03 §13); 112 flame × material reactions (03 §12). The builder shows readouts,
but a player cannot hold this. Players will find 3–4 combos and never see the rest.
**Fix:** keep the reactions (that is pillar 2), cut charm changed-meanings to 4 (split, bounce, echo, volatile), cut
combos to the 8 that are *visible in the world* (steam burst, shatter, electrified water, burning slick, blessed
water, glassblow, mud trap, rime-lock), and teach each combo once with a codex entry and a room.

## Technical

### R45. The CPU and the GPU disagree about what is lit — **Major** · Tech
06 §14.7: gameplay light (`lightAt`) is a CPU estimate (light list + raycast occlusion, cached per 4×4 tile) because
the GPU light map is never read back. Unlit sight, Moth Oracle crits, light doors, rat spawning and the stealth hood
all read it. The GPU draws glass tint, water transmission, emissive blur and big-light quarter-res marching; the CPU
does none of that. The player will stand in visible light and be treated as in darkness, and the reverse.
**Fix:** make the CPU light grid the **source of truth** at 1/8 resolution (same list, same falloff, same opaque
test) and **draw ambient from it too**, or read the GPU map back asynchronously at 1/8 res with a pixel buffer +
fence (WebGL2 supports this without stalling). Either way, one number.

### R46. The light thresholds don't agree — **Major** · Tech + Contradiction
Unlit see you below 0.35, burn above 0.6, dissolve above 0.8 (05 §15); prefer below 0.15, flee above 0.5 (06 §14.7);
get +50% damage on targets below 0.1 (01 §3.4); come for anything below 0.1 (07 P4-1). Moth Oracle crits below 0.3
(04 §14.1) or 0.2 (06). Rats avoid light above 0.3 (01). The readable floor is 0.04 (06 §14.6), "0.08, 06's readable
floor" (05 §22.1), or a colour clamp (01 §3.4).
**Fix:** one table in 06 §14.7: `dark < 0.2`, `dim 0.2–0.5`, `lit ≥ 0.5`, `bright ≥ 0.8`; everything reads a tier,
not a raw number. Floor 0.08 in rooms, tested by the dark-screenshot spec.

### R47. `localStorage` is too small for this save — **Major** · Tech
10 §7.1: 3 slots × 400 KB + 3 `.bak` + profile 64 KB + Endless 200 KB + Lingo memories (01 §12.5 says ~150 KB) +
room diffs (09 §4.3) in a ~5 MB quota **shared with the whole playground** (Emberveil and Farhold saves already live
there). 02 §8.1 also wants 3 rotating backups per slot.
**Fix:** slots, backups and the Endless run go in **IndexedDB** (a small wrapper beside `shared/store.js`);
settings and profile stay in `localStorage`. Adopt R3 so room state stays tiny.

### R48. Rope wrapping with 4-cell verlet links on pixel terrain — **Major** · Tech
07 §3.4: a 38-link verlet chain, points pushed out of solid cells, the swing pivot = the last rope point touching
geometry. With 4-cell links, 1–2-cell walls, fragments and moving platforms, this jitters, snags and tunnels; the
"pivot walks back up the chain" rule flickers at corners. Rope swing *feel* is the Act 2 verb.
**Fix:** for the **player's hook**, use the classic wrap list: a straight segment from the player to the last wrap
point, add a wrap point when the segment hits a corner, remove it when the angle unwinds. Keep verlet for level
ropes and tethers (few, slow). 07 already has `rope.simple` — make it the default, not the fallback.

### R49. Frame-exact replays as puzzle tests will break every week — **Major** · Tech
07 §11 and 10 §9.1: each puzzle solution is a recorded input log from room entry, replayed at 8×, and must reach the
exit. Any change to jump height, acceleration, a room's seed-driven chunk pick, or a material's dispersion breaks
every replay after it.
**Fix:** keep replays only for **determinism** tests (same log → same hash). Puzzle tests become **solution scripts**
in verbs the bot executes with path-finding (R8): `goto(lever_1)`, `interact`, `castAt(water, rime)`, `waitFor(plate_a)`,
`goto(exit)`.

### R50. Room compile + settle in 150 ms is not realistic — **Major** · Tech + Missing spec
10 §6.9: compile, decorate and run **120 ticks of cell sim** for a 960×540 room in ≤150 ms "covered by the fade".
120 ticks of pass A on a freshly filled room is ~0.3–1 s in JS. And there is no spec for **room transitions** at
all: fade length, what the player sees, where enemies that follow you (Unlit, `relentless`, 05 §4.5) appear, how
the camera enters a room that starts mid-flood.
**Fix:** settle **offline** (the room tool writes a settled cell cache next to the JSON; the game loads it and only
re-settles swap zones). Add a "Room transitions" section to 06: 0.25 s fade out, load, 0.25 s fade in, followers
appear at the entry after 1.5 s with a sound cue.

## Brief

### R51. "Activate traps" is mostly traps that hurt *you* — **Major** · Brief
The brief lists activating traps with levers and buttons. 07 §8's 22 traps are nearly all hazards against the
player; turning them on enemies is possible through wiring but no puzzle, encounter type or lesson is built around
it (the index in 07 §10.7 has no `trap` mechanic).
**Fix:** add an encounter tag "trap room": 3–4 rooms per act where the intended fight is won with a crusher, a
flame jet, a rat pipe or a flood, plus one Lesson in Act 2 ("Pickering's Lockhouse" is the natural spot).

---

# Part 3 — Minor

## Contradictions (smaller)

| # | What | Where | Fix |
|---|---|---|---|
| R52 | 1 metre = 8 cells vs 16 cells (so the Chimneysweep challenge is 16,000 or 32,000 cells) | 02 §9.1, 04 §16.6, 10 §5.18 vs 07 §3.5, §13.3 | 8 cells |
| R53 | Fall damage from 120 cells (10%/20) vs from 160 (5%/20, cap 60%, never lethal); monsters from 60 | 04 §2 vs 07 §2.5 vs 05 §6 | 07's rule for the player |
| R54 | Coyote/buffer 90/110 ms vs 100/120 ms; running jump reach 49 vs ≈52 (10's example room is tuned to 52) | 04 §2 vs 07 §2.3–2.4 vs 10 §6.8, §6.13 | 07 owns movement; fix 10 |
| R55 | Melee: per-class frame data in ms and % of a weapon roll vs a single moveset in seconds with base damage 6/11/14; heavy charge 350 ms vs Clout 0.5 s; non-lethal tag `subduable` vs `can_knock_out`; pogo 24 vs 27 cells | 04 §3, §8–15 vs 07 §4.1 | 04 owns melee; 07 keeps only tool uses |
| R56 | Class movement numbers: Sluicewarden run 85/breath 12 vs 90/16; Moth glide fall 60 vs 90; Chimneysweep wall-run 0.6 s/40 cells vs 60 cells at 90/s; Drowned Knight bottom walk "full speed" vs 45; Ferrywitch water "Glide" dodge vs "stand on still water"; Tinker build ×1.5 vs −30% | 04 §6, §9–15 vs 07 §2.16 | 04 owns classes; delete 07 §2.16 |
| R57 | Wall-jump: everyone from the start (07 §2.6, 01 bell 1 needs it) vs Chimneysweep's "wall-jumps work on any wall" read as unique | 07 vs 04 §15.1 | everyone; Chimneysweep gets wall-*run* |
| R58 | Lantern light radius 72 / 40 / 64 / per-item 48–110; hood 18 | 06 §14.2, 07 §4.2, 04 §5, 08 §5.1, 02 §2.2 | 08's item value is the radius; 06 multiplies it by oil % in Act 4 |
| R59 | Rain density 18/32/48/64/80/96 (heavier with depth, a story rule) vs 90/60/120/70/100/160 | 01 §3, 06 §11.2, 10 §5.16 | keep 01's *shape*, 06's *scale*: 60/70/90/110/130/160 |
| R60 | Materials: 03 has `flesh`, `poison_water`, `blessed_water`, `black_water`, `frost`, `void`, `slag`, `glass_shard`, `gravel`, `lampstone`, fire as a *state*; 06 has none of those but has `fire` as a *material*, `rust`, `rubble`, `ember`, `plank`, glass → `sand`; 07 adds `plank_wood`, `brace_wood`, `cloth_sand`, `soot`, `snow`, `tar`, `fuse`, `cracked_brick`, `rotten_wood`, `wax_crust`, `pipe` | 03 §12.1, 06 §5.2, 07 §2.13, §5.19, §9.3 | 06 owns the list; add the ones puzzles need (`tar`, `fuse`, `soot`, `lampstone`, `flesh`), make "cracked/rotten/crust" a flag, merge slag→rust, gravel→rubble |
| R61 | Code layout: 03 §20 (`compile.js`, bytecode `program.js`, `reactions.js`, `combos.js`) vs 10 §3.5 (`wick.js`, hook objects, no reactions/combos) | 03 §20, 10 §3.5 | 03's compiled-program design (it is the better one); 10 lists it |
| R62 | AI: 9-state machine + 4×4 flow field vs 5 states + 8×8 nav graph with jump links | 05 §3 vs 10 §3.7 | 05 owns AI; 10 lists files only |
| R63 | Bark limits: 6 s per enemy (01), room cooldowns 6–8 s (05), 4 s per speaker + 1.5 s global (10); voices at once 3 (01) vs 2 (05, 10) | 01 §12.3, 05 §25, 10 §3.9 | one table in 01 |
| R64 | Save backups: 3 rotating per slot vs one `.bak`; meter history 200 rooms merged vs 30 vs `maxFights: 60` | 02 §8.1, §17.4 vs 10 §7.1, §10.3 | 3 backups (IndexedDB, R47); 50 rooms |
| R65 | Class pick: before the intro (02 §6) vs in the Guild Hall after `cs_opening` (01 A1.1, 09 §6.1); `cs_opening` hands every class "Corvin's pole-lantern" | 02, 01 §10.1 | pick first, and make Aldra hand over *a* lantern |
| R66 | 10's own examples fail its checker: example 1 is a **Lesson** room with a `spawn` of 2 wax mites (00 §6 and 05 §7.2: lessons never spawn); example 2 spawns `drip_rat` (not in 05) and talks to NPC `weirwarden_ashe` (not in 01) | 10 §6.13–6.14 | fix the examples; the `rooms.test.js` "examples compile" test must also run `room-check` |
| R67 | Room count: "~100 campaign rooms" vs ~132–210 templates and ~180 rooms per route | 10 §6 vs 09 §3.3, §4.2 | R7 |
| R68 | 09 §3.3 contains a **corrupted duplicate table** (a stray `---|---|` row, then different node and room counts per act) | 09 §3.3 | delete the second table |
| R69 | Silent Bells: pole only (01 §4, 07 §4.3) vs melee, spell or Great Toll, some needing a clapper key (04 §16.3) vs 12 `key_silent_bell` clappers (08 §12.2) | 01, 04, 07, 08 | pole or toll; no key item |
| R70 | Drowned Market: one stall in `a3_drowned_market` with Sister Unna (00, 01) vs "one per act 3–6 map" with three babbling keepers (08 §16.3) | 01 §3.3, 08 §16.3 | one; Unna speaks (formant + underwater fx) |
| R71 | Scroll of Rebraiding: "free rebuild at any lamp post (normally only at hubs)" — but braiding is already free at any lamp-post | 08 §9.5 vs 03 §15.1, 02 §15.1 | make it "braid anywhere once" or cut it |
| R72 | Camera "zooms out 10%/25%" at boss transitions vs integer scale only, cut not zoom | 05 §19.4, §24.6 vs 06 §19.4 | switch to wide view (a cut) |

More small ones worth fixing in the same pass: miniboss list has no Dunmere (01 `elite_dunmere`) and 05 names its
Act 3 miniboss "**Lockmaster Ebb**" beside the NPC **Cantor Ebb**, and 08's peddler "Fennick Tallowby" beside **Ada
Fennick** (rename two of them); Nell is "the only NPC who can die" (01) but Corvin can drown (07 P6-4); Ossery's arena is
"the Warden's Loom" (05) or `a6_storm_eye` (01, 09); the Lamp Bands "remove a segment of the climb" per relit Lamp (01 §2.1)
but all five are always relit, so it is a constant; Trials unlock "after Act 1" (00 §12) but the Rope Gauntlet door needs
the grapple (09 §14); tether reach 140 (02 §4.1) vs 120 (03 §5.9), rune 120 vs 80; interact range 18 (02 §11.10) vs 12
(07 §5.1); 02 and 06 cite a "Physics detail" and "Brightness floor" setting that 02 §19 does not list; Tide borrows
`spell.nature.*` (02 §25.5) or `spell.arcane.*` (10 §10.4); "Lamp shrine" is used in 02/03 but is not a node type in 09;
07 P4-5's ★ relies on `on_timer` firing "a second Ember after 2 s" while 03 §8.1 fires every 0.5 s and ends when a lob
bursts; 07 P6-5 cites "an overcharged Spark gives +3 charges per hit" which 03 never defines; 00 §0 points at
`docs/CHANGELOG.md`, which does not exist.

## Fun (smaller)

### R73. Button-mash grabs — **Minor** · Fun + Accessibility
Fatberg Engulf, Tallow Embrace, Widow Cocoon, Kelpwraith (05) all "mash to escape". Mashing is an accessibility
problem and does not fit a precise action game. **Fix:** grabs end on their own in 1.5 s, and a dodge/Ember/pole hit
frees you early.

### R74. A shop screen that closes itself — **Minor** · Fun
The Drowned Market keeps your breath running while the menu is open and **closes the menu** at 3 s (08 §16.3). The
peddler leaves after 90 s (08 §17.1). Timers on menus create stress with no play in it. **Fix:** breath pauses in menus;
the peddler waits while you are in his room.

### R75. Ferry health payments are a trap for new players — **Minor** · Fun
Paying in max health is permanent for the save (08 §16.8), refunded only by relights, ash and one coin. It is flavourful,
but a first-time player who pays for three respecs in Act 2 carries it for 8 hours. **Fix:** cap the debt at 20% and
refund it fully at each Great Lamp.

### R76. Kindling asks for knowledge the player doesn't have — **Minor** · Fun
Several Kindling flags need non-obvious actions (finish Tallow with Rime/Tide after asking Seld; escort Ebb without him
losing 50%; give Crane his brother's lantern; share Jory's oil), and Ending A needs 5 of 11. **Fix:** each flag gets one
hint line from an NPC before the choice, and the Journal lists "people you could still help".

## Technical (smaller)

### R77. Lingo + formant voice on the main thread in combat — **Minor**
01 §12.1/§12.6: barks synthesize live, 10–80 ms per line, skipped above 30 ms. In a fight that is dropped frames or
silent barks. **Fix:** pre-render each enemy kind's bark pool at room load (they are short and seeded), cache per act.

### R78. Wide view and a HUD drawn in 480×270 coordinates — **Minor**
02 §11.1 places every HUD element at fixed cell coordinates for 480×270, but 06 §19.4 flexes the view between
400–600 × 225–340 and switches to 640×360 in boss arenas and Floodgate. **Fix:** anchor HUD elements to edges
(`left/top/right/bottom` + offset) and test at 427×240, 512×288 and 640×360.

### R79. The balance sims are specified against stubs — **Minor**
03 §17.2 simulates ~9,500 wicks with a "tiny cell-world stub"; 10 §9.3 simulates the campaign "as data, not physics".
The combos and material effects (most of the game's value) cannot show up in either. **Fix:** fine as a first pass; add
a small **physics set** (pool, oil slick, wood wall) to the wick sim using the real cell code at 160×90.

### R80. Knot budgets and child instances vs the instance pool — **Minor**
12 child instances per cast × echo × split with a 512-instance pool and 64 fields (03 §20.3) is fine alone, but
Floodgate turrets fire "your selected wick" (04 §10.3, 07 §9.3), so turrets can spawn knotted children. **Fix:** turret
shots never trigger knots.

## Brief (smaller)

### R81. "Realistic" water — **Minor**
Falling-sand water has no momentum (06 §2.1), so splashes, waves and surges are faked by particles and rules. That is
the right call for a browser, but the bible never tells the reader where "realistic" comes from. **Fix:** name the three
tricks in 06 §15 intro: ripples on surfaces, pour/jet particles, height-field floods — and put one showcase room per act
that is *about* water looking good.

### R82. Lingo/Voice Lab use is heavy for a game whose hero never speaks — **Minor**
The brief asks to use Lingo and Voice Lab; the bible uses them for ~30 intents and 28 NPCs, which is great, but the
player is silent (01 §12.1) and most talk is barks. **Fix:** keep it, but make the **hubs** the showcase (idle chatter,
Lingo `converse` pairs, memories of your deeds) and keep combat barks sparse; that is where generated speech shines.

## Missing specs (the builder will need these)

| # | Missing | Where it should go | Proposal |
|---|---|---|---|
| R83 | **Player ↔ enemy body contact.** Do enemies block the player? Deal contact damage? Push? Do enemies overlap each other? | 04 §2 + 05 §6 | enemies do not block; contact damage only for `contact` attacks; soft separation between enemies |
| R84 | **Player hurt rules in one place.** 04 has 600 ms i-frames after a hit; 07 has a 0.2 s `hurt` state and 30% control for 0.2 s; knockback into walls staggers at 200 (07) or 120 (05) | 04 §2 | one table: i-frames 600 ms, hurt 0.2 s, stagger rule |
| R85 | **Hit-stop.** 10 §4.1 implements `freezeTicks` "per 03/05"; neither page gives a number | 03 or 04 | 2 ticks on heavy/crit, 4 on boss break, 0 on DoT |
| R86 | **Spawning on room entry.** 05 §7.2: never spawn in camera view; 10's `spawn` thing has `when: "enter"` and one-screen rooms | 05 §7.1 | enemies are **placed** at load (present before you see them); only hatches and ambushes spawn later, with the 500 ms sound |
| R87 | **Hubs and NPCs vs physics.** Can the player burn Odile's shop, flood the Dripmarket, freeze Brisket's barge, hit an NPC with a spell? | 07 §9.2 + 01 | hubs are `sanctuary`: no-build, spells don't change cells, NPCs ignore damage |
| R88 | **Tutorialisation of the Wick builder UI.** P1-2 teaches the *concept*; nobody says how a first-time player is walked through drag-and-drop, sockets, saving and slotting | 02 §15 | a 4-step guided overlay the first time the builder opens, skippable |
| R89 | **Camera in boss arenas.** Tallow 320×180, Gnaw 360×220, Sluicemaw 440×240, Widow 360×220, Bellfather 300×380, Ossery 400×260 — which use wide view, which lock, which follow vertically? | 06 §19 + 05 | a per-boss `camzone` row in 05 |
| R90 | **"Lamp shrine" and "rest point"** — used as braid points in 02/03 but not a node or prefab type | 09 §3 + 10 §6.5 | drop the term; lamp-posts only |
| R91 | **Game-over flow for the flood chase in Endless** (09 §11.4): what kills you — drowning only, or does the room "fill" to the ceiling and end the run? | 09 §11.4 | the flooded room drowns you by breath rules; no instant loss |
| R92 | **Touch/phone.** 10 §9.2 shows a "desktop recommended" notice; the user's house rule is to test desktop *and* mobile | 02 §27 | state "desktop + gamepad only" in 00 non-goals, keep the menu-fit test |

---

# Top 10 things to fix before building

1. **Decide the finale and the ending** (R1, R2): 09's three-node Rain-stops sequence, 01's physical final choice,
   Kindling as the only karma counter. Rewrite 05 §24 to match.
2. **Cut the scope to the ship column** (R7, R30–R34): ~70 rooms, ~28 monsters, 5 classes (3 + 2 with mid-campaign
   pick-up), 5 shops, 5 gear slots, 3 modes + 5 trials, no NG+. Put the rest in a "parked" list in 00.
3. **One canon pass on names, ids, keys and numbers** (R4, R15–R29, R52–R72): 00 gets a table of *owners* (which page
   owns which fact) and every other page links instead of restating. 02 owns keys, 03 statuses/spells, 04
   classes/melee/progression, 05 monsters/AI, 06 materials/light, 07 movement/building/interactables, 08 items/prices,
   09 maps/modes, 01 people/voices/lines, 10 file names and field shapes.
4. **Fix the save rule and move saves to IndexedDB** (R3, R47): prefab state persists, raw cells don't.
5. **Unify the wiring schema** (R5) in 10's action syntax with 07's gate kinds and type names.
6. **Prove performance on the real laptop and write the numbers down** (R11): run `bench_flood`, record sim/frame p95,
   and make all big water height-field water. Decide single-thread vs Worker now.
7. **Add the three missing world systems** (R12, R13, R45/R46): authored current zones, a gravity-band cell rule, and
   one CPU light grid (with tiered thresholds) that both the AI and the renderer agree on.
8. **Make physics puzzles recoverable and testable** (R8, R10, R49): pinned critical cells, a free "Rekindle room",
   reachability as an error, verb-level solution scripts instead of frame replays.
9. **Re-tune the first hour and the oil economy** (R35, R36, R37, R42): Act 1 = move, pole, two wicks, planks; overcharge
   and affixes in Act 2; darkness stops regen; fix ring/beam/arc/tether before the sim ever runs; a smaller Tallow.
10. **Write the missing art and music plan** (R9, R14): part-assembled big sprites with a real size budget, and a decision
    on music (procedural drone from the sfx engine is the cheap, on-theme answer).

---

# Suggested cut and milestone skeleton (for reference)

A shape that one agent can finish in ~36 milestones and still hit every line of the brief.

| # | Milestone | Proves |
|---|---|---|
| 1 | Grid, materials, chunks, pass A/B, Canvas debug view, `bench_flood` numbers on the reference laptop | R11 |
| 2 | WebGL2 cells + upscale + camera; room loader + decorator + room-check (reachability as error) | R8 |
| 3 | Light map + CPU light grid + ambient + bloom | R45 |
| 4 | Water reflections, ripples, wet sheen, rain + drips | the pitch |
| 5 | Player movement (07) + collision + swimming stub; fixed canon keys (02) | R6, R18 |
| 6 | Pole combat, hurt rules, enemies' AI core (3 test monsters), telegraphs + void zones + dark screenshot test | R83–R86 |
| 7 | Wick compiler + 4 shapes + 3 flames + reactions + builder UI + sandbox | pillar 3 |
| 8 | HUD (edge-anchored), inventory (5 slots), attributes, level-ups, Ledger (meters) | brief UI |
| 9 | Save (IndexedDB) + lamp-posts + death purse + rekindle room | R3, R10, R47 |
| 10 | Lingo bridge, voices (new roles added to `shared/voices.js`), Narrator, bark pre-render | R23, R77 |
| 11–15 | **Act 1 vertical slice**: hub, 10–12 rooms, 5 monsters, Tallow (2 phases), Odile + Crane, plank kit, map + minimap, 3 lessons | the whole loop |
| 16 | Wiring + interactables + traps (action schema) | R5, R51 |
| 17–20 | Act 2: grapple (wrap-list rope), charms (8), Gnaw, Soup Barge, Bile, first trap rooms | R48 |
| 21–24 | Act 3: current zones, basins, swimming, Tide, Sluicemaw, Ferry | R12 |
| 25–27 | Act 4: darkness economy, Unlit, hood, Mothwife, Widow, knots (2) | R36 |
| 28–30 | Act 5: gravity bands, bells, Bellfather | R13 |
| 31–33 | Act 6: Rain stops at the Last Wall, Falling Flood (height field), Ossery, endings | R1, R2, R40 |
| 34 | Floodgate (15 waves, acts reached only) | R43 |
| 35 | Long Descent + Daily flag + Boss Rush | modes |
| 36 | 2 unlockable classes, 5 trials, Guild Hall (10), achievements (20), balance sims pass | brief classes |

Everything else in the bible is a good backlog. Keep it, park it, and build the spine first.
