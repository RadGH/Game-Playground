# Procedural Towns

The town planner, and a page to tune it on.

**This is the one true planner.** `prototypes/farhold/` imports `js/townplan.js` from here, so a town
tuned on this page is the town you walk into in the game. There is no second copy to drift.

Open it at `http://<LAN-IP>:8400/proctown/`.

## Why it exists

Farhold's original planner fired 2–6 straight-ish spokes out of a central square and dropped
buildings along them. A play-test came back with: *"Houses sitting on roads. Some roofs don't line up
with the walls. Alleyway roads clip beneath the surface texture. All the towns look and feel the
same, and they don't feel anything at all natural."*

Every one of those is downstream of the same mistake: **a building was placed at a coordinate, and a
street was drawn at a coordinate, and nothing reconciled the two.**

## The idea: a plot is the unit, not a building

```
footprint → blocks (recursive split — the CUTS become the streets)
          → plots  (each block divided; each plot knows which edge fronts a street)
          → a building fitted INSIDE its plot, facing its frontage
```

A house cannot sit on a road because **a road is not a plot**. That is why `overlaps()` can be a hard
assertion rather than a hopeful one, and why the test *"NOTHING sits on a street, in any culture, at
any size, on any seed"* is allowed to exist.

The street hierarchy falls out of the same recursion: the first cuts run the whole width of the town
and are **main** streets; by the time the blocks are small the cuts are **alleys**. A street is
important because it is long and it came first.

## Cultures are parameters, not code

`CULTURES` in `js/townplan.js` holds seven: human, elf, dwarf, undead, orc, halfling, desert. Each is
a street grammar, a jitter, block and plot sizes, storey range, a wall type and a street surface.

`jitter` is doing most of the work. A dwarf splits at the exact middle, square on (`0.04`) and comes
out as a rigid grid. A halfling wanders (`0.48`) and comes out irregular. **The generator does not
know what an elf is.**

The written design for each culture — aesthetic, materials, palette and cornerstone buildings — is in
`prototypes/farhold/TOWN_EXPANSION.md` §6.

## The page

| Control | What it is for |
|---|---|
| Seed, ← →, Reroll | Step through seeds. Stepping is how you spot a bad one. |
| Culture, Size | The two knobs that change the most. |
| Plots and districts | Plot outlines, coloured by district (civic / craft / residential). |
| Blocks | The blocks the plots were cut from. |
| Frontage | A line from each building out to the street it faces — the reason a door is never on a blank back wall. |
| Compare four seeds | The sameness test you can do with your eyes. If they look like one town drawn four times, the knobs are wrong. |
| Highlight | Type `inn`, `forge`, `hall`… — matches get a gold ring, the rest fade. |
| Checks | Live overlap verdict. Red boxes mean a building is on a street and the **planner** is wrong. |
| Sameness report | 200 towns, and the spread of streets / plots / gates. Numbers, not vibes. |
| Copy / Paste JSON | Reproduce a reported town exactly. |

## API

```js
import { planTown, overlaps, summarise, CULTURES } from './townplan.js';

const plan = planTown({ seed: 7, size: 4, culture: 'human' });
```

`planTown` returns:

| Field | Shape |
|---|---|
| `streets` | `[{ a:[x,z], b:[x,z], cls, width, depth }]` — `cls` is `main` / `lane` / `alley`, clipped to the wall |
| `blocks` | `[{ x, z, w, d, depth }]` |
| `plots` | `[{ x, z, w, d, cx, cz, facing, district, want }]` — `facing` is the angle out to the street |
| `square` | `{ cx, cz, r }` — open ground, nothing built on it |
| `wall` | `{ kind, poly, gates:[{ angle, x, z, road }] }` or `null` below size 4 |
| `ring`, `wallRadius`, `culture`, `size`, `seed` | |

Everything is deterministic from `seed` alone, so a town is the same town every visit and **nothing
has to be stored**. A bug report that names a seed is reproducible.

Helpers: `overlaps(plan)` returns the hit list (must be empty), `summarise(plan)` gives the one-line
shape used by the batch report, `footprintOf(size)` gives `{ ring, wall, walled }`, and `makeRng(seed)`
is the generator everything else draws from.

## Rules the tests hold

`node --test proctown/tests/townplan.test.js` (14 tests):

- the same seed is the same town, and a different seed is a different town
- **nothing sits on a street**, across 7 cultures × 11 seeds × 6 sizes
- every plot is inside the footprint — trimmed on the plot's own corners, not its block's centre
- a bigger settlement really is bigger
- a walled town has **2–4 gates**, spread around the wall, never stacked on one side
- every plot faces a real direction and knows its district
- what a town wants follows its size — a hamlet never raises a barracks
- the trades get the big plots, not an alley
- the culture genuinely changes the shape of the town
- street classes are a real hierarchy

## Still to build

`TOWN_EXPANSION.md` is the full plan. From §2, still open: the 3D preview, the building-kit gallery,
the palette editor, the walkability flood-fill, the performance readout, and the regression guard
that Farhold's import and this page produce identical plans. §1 items not yet in: approach roads
seeding the graph, terrain-aware streets, and plot-fill (yards, pens, woodpiles).
