# Farhold — Research

Four ages, seven purchasable nodes, twenty-seven points. R17.

> *"There are some high-tech options in the building menu so it's clear we'll need a research system.
> I think our research system can unlock research points by completing quests or exploring or
> defeating bosses. This can be another menu added to the Inventory screen… Make this rather simple
> for now, basically unlock all low tech gear from the start and then iron-age tier 2 and steel-age
> tier 3 and rocket-age tier 4."*

| | |
|---|---|
| Engine | `js/research.js` — pure, no DOM |
| Data | `data/research.json` — ages, nodes, what a deed is worth |
| Screen | `js/research-ui.js` + `research.css` |
| Gate | `js/buildplan.js`'s `locked` callback, fitted in `js/build.js` |
| Save | inside the `build` blob (`js/build.js` `toJSON`/`load`) |

---

## 1. The rule it is built around

**A structure is locked only if it says which node unlocks it.**

`lockReason(id)` reads `def.tech` out of `data/structures.json` and nothing else. No key, no lock.

That default is not a convenience, it is the whole safety property. The failure mode of forgetting to
gate something is a piece that is too cheap; the failure mode of the other default is a player who
lands on a planet and cannot build a box — which is exactly the deadlock round 17 opened on
(`BUILD-MODE.md` §17.1). **Age 1 is everything low-tech and it has no nodes in it at all.**

A `tech` key naming a node that does not exist does not brick the piece either: `lockReason` returns
null. A gate you cannot open is worse than no gate.

---

## 2. The tree

| Age | Node | Cost | Needs | Opens |
|---|---|---|---|---|
| 1 · Age of Timber | — | — | — | everything not named below |
| 2 · Age of Iron | **Ironworking** | 2 | — | Smelter, Alloy Forge, Crusher, Drill, Pump, Storage Silo, Ballista Turret, Reinforced Wall |
| 2 · Age of Iron | **Drawn Wire** | 3 | Ironworking | Battery Bank, Solar Array, Wind Turbine, Repair Station, Flame Turret, Frost Turret |
| 2 · Age of Iron | **Reagents** | 3 | Ironworking | Chemical Bench, Washer, Alchemy Bench |
| 3 · Age of Steel | **Steelwork** | 4 | Drawn Wire + Reagents | Refinery, Manufactory, Hauler Post, Tender Arm, Geothermal Tap, Garage |
| 3 · Age of Steel | **Ground Glass** | 4 | Steelwork | Crystal Cutter, Enchanting Altar, Shield Pylon, Crystal Lamp, Tesla Coil |
| 4 · Age of the Rocket | **Assembly** | 5 | Steelwork + Ground Glass | Assembler |
| 4 · Age of the Rocket | **Propulsion** | 6 | Assembly | Fuel Synthesiser, Waypoint Pad |

It is a small lattice rather than a line: Steelwork wants both arms of the Age of Iron, and Assembly
wants both arms of the Age of Steel — because an Assembler costs a lens, and lenses are Ground Glass.

Each node opens **several** structures so that buying one is a visible change to the build panel. A
node that unlocked one bench would read as a paywall.

Decoration, housing, roads, lighting and the low-tech defences are **not gated at all**. They are the
"low tech gear" the brief says is yours from the start, and their materials gate them naturally.

---

## 3. Points

One function, and it is the only way a point comes into being:

```js
import { sharedResearch } from './research.js';
sharedResearch().award('boss', 1);       // three points
```

`n` is a count of DEEDS, not of points. What one is worth lives in the data, so a caller never has to
know that a boss is three.

| reason | worth | what it means |
|---|---|---|
| `quest` | 1 | a job finished |
| `story` | 2 | a campaign objective |
| `region` | 1 | a region entered for the first time |
| `landmark` | 1 | a landmark claimed |
| `instance` | 2 | one of `data/instances.json`'s places cleared |
| `boss` | 3 | something with a name killed |
| `worldboss` | 4 | a world boss |
| `planet` | 3 | a world landed on for the first time |

An unknown reason is worth `default` (1) and is still counted in the ledger — a point quietly worth
nothing is worse than a point worth one, because the first is a bug you find six months later and
the second is a number somebody can tune.

**Nothing is bought with materials and nothing is bought with gold**, deliberately. Research is what
you did, not what you saved up. There is no refund and no respec, because there is nothing to
regret: every node is a gain.

The call sites live in files this round did not own — see
`research/round17-build-handoff.md` §1 for the exact three one-liners. **Until they exist, ages 2–4
cannot be bought.** Age 1 is unaffected, which is why the game is still playable without them.

---

## 4. The API

```js
import { createResearch, sharedResearch, resetShared } from './research.js';

const research = sharedResearch({ catalogue });     // the one in the game
const own      = createResearch({ data, catalogue }); // an isolated one, for tests

research.award(reason, n)      // → points gained
research.canBuy(id)            // → { ok, why, blocked?, short? }   — `why` is always a sentence
research.buy(id)               // → { ok, why, node }
research.lockReason(idOrDef)   // → null, or { node, name, age, cost, text }
research.allows(idOrDef)       // → boolean
research.board()               // → one row per age, one card per node, each with its own verdict
research.summary()             // → { points, earned, spent, taken, total, ready, age }
research.ledgerRows()          // → where your points came from, biggest first
research.unlockAll()           // debug / the browser suite: take every node, spend nothing
research.toJSON() / .load(json)
```

`sharedResearch()` is a singleton because research is read in four places that do not know about each
other — `js/buildplan.js` (may this be placed), `js/build-ui.js` (why is this row grey),
`js/research-ui.js` (the screen) and the three `award` call sites. Threading one object through all
of them would mean new arguments on `createBuild`, `createBuildPlan` and `createBuildUI` in
`js/main.js`. It loads `data/research.json` itself, guarded on `document` so `node --test` never
tries to fetch a `file:` URL; a test hands `data` in instead.

---

## 5. The screen

`createResearchScreen({ research, log, standalone })` — `mount(parentEl)`, `draw()`, `show()`,
`hide()`, `toggle()`. It satisfies `js/hud.js`'s mounted-screen contract, so the Research tab of the
character sheet is two lines in `js/main.js` (handoff §3), and with `standalone: true` it is an
overlay, which is how the **Research** button in the build panel's head opens it.

**Every node is visible from the first minute**, including the ones you cannot touch for ten hours. A
tech tree that hides its far end cannot be planned against, and the point of four ages is that the
player can see where the fourth one is. What a node you cannot buy shows is the SENTENCE — *"Steelwork
and Ground Glass first"*, *"4 more research points"* — never a grey box with nothing in it.

The "where points come from" pane always lists all eight reasons whether or not you have earned any
of that kind, because **the list is the instruction**: a player who reads "4 points" and nothing else
has no idea which of the three things to go and do.

---

## 6. The gate in the build panel

A locked row is **shown**, struck through, with *"Locked — research Ironworking (Age of Iron), 2
points."* in place of its price, and clicking it says the same thing in the log. Shown, because a
piece you cannot see is a piece you will never go looking for. With the sentence, because a greyed
row with no reason is the one answer a player cannot act on.

The refusal is also the FIRST thing `js/buildplan.js`'s `check` tests — before the water, the slope
and the purse — because a piece you have not researched is not something you can fix by standing
somewhere flatter or fetching more iron, and telling the player about the slope first would send
them off to do work that could never help. `quote()` asks the same question, so a run of locked
cobbled road cannot be laid by the metre either.

---

## 7. Tests

`tests/round17-build.test.js`: the tech gates agree with the tree in both directions, nothing the
first hour needs is gated, the first age has no nodes, the tree can be finished and nothing in it is
stranded, a locked piece refuses placement with the node and the age named, research survives a save,
a save from before R17 is a fresh tree, and a `tech` key naming nothing does not brick its piece. The
screen is rendered and a node is bought in `tests/tiny-dom.mjs`.

---

## 8. Round 22 — the screen is a graph now, and it can scroll

> "The new Research screen is a good start. However 'Reagants' goes off screen and I can't scroll
> down. Can we redesign this menu to be more like a tech tree, having smaller boxes with networked
> relationship/requirements and click to view more details in a tooltip or side popup? Rather than
> just a massive screen of text."

### The scroll bug, which was not in this module at all

`.research` is a flex column and `.res-body` asks for `flex: 1 1 auto; min-height: 0;
overflow-y: auto`. **A flex child only becomes a scroller when its flex parent has a height to
divide up.** The standalone overlay had one — `max-height: min(84vh, 820px)` — so the overlay always
scrolled. The character-sheet tab did not, so the column simply grew past the bottom of the sheet,
and `style.css`'s `overflow: hidden` on `.tab-body[data-tab="research"]` cut off whatever hung over.
Nothing in the screen was broken; there was just no bottom for it to stop at, and "Reagents" is the
last node in the Age of Iron column, so it was the first thing over the edge.

The Holding and the Followers screens solve this with a flag their caller passes in (`.civics--tab`,
`.flw--tab`). This one needs no flag: `.research` is `height: 100%; max-height: 100%` by default and
`.research--overlay` puts its own bounded height back, so the chain from `.sheet-mount` (already
`height: 100%`) down to `.res-body` has no gaps in it.

### The board

One column per age, one card per node, and the card is placed on a **row below everything it waits
on** — `laneRows(ages)` pushes a node down again if the row it wants is already taken in its own
column, which is what stops Drawn Wire and Reagents landing on top of each other when they both wait
on Ironworking. Every wire therefore runs downward.

The `needs` relationships are drawn as bezier curves on an SVG layer behind the cards, coloured by
the target's state, and `layoutWires()` measures the laid-out cards before it writes the paths — it
no-ops where there is no box model, so the node tests still run.

A card carries the name, the cost, a state dot and one short line. Everything else — the blurb, the
`why`, the prerequisites as **clickable chips that jump the panel to whatever is holding the node
up**, what the node opens, and the Research button with its refusal sentence — is in a 272px side
panel, which pre-selects the first node you could actually buy so it is never an empty box.
Hovering or keyboard-focusing a card lights its whole prerequisite chain and dims every other wire.

The "where points come from" ledger moved off the grid into a collapsible strip. It starts open only
while you have earned nothing, which is the one moment it is an instruction rather than a reference.

Under 760px the panel drops below the board rather than squeezing it.

### Tests

`tests/round22-research.test.js`: every node's age exists, every `needs` id resolves, nothing waits
on a later age, there are no cycles, no structure is unlocked twice, `laneRows` never draws a wire
upward and never double-books a slot, the board renders one column per age / one card per node / one
wire per requirement, the blurb is out of the card and in the panel, the chips navigate, the buy
button buys, and the CSS bounds `.research`'s height while the overlay keeps its own bound.
