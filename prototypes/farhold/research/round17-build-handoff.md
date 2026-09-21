# Round 17 — the build/station/research cluster: hooks other files need

Everything in this round is implemented and reachable **without any of the patches below**. They are
improvements and joins, not life support — the fallbacks are named in each section. Files listed
here belong to other agents this round (`js/main.js`, `js/hud.js`, `js/quests.js`,
`data/campaign.json`), so the code is written out in full rather than applied.

Ordered by how much difference it makes.

---

## 1. REQUIRED-ish — research points have no source until three one-liners exist

`js/research.js` exposes exactly one way for points to come into being:

```js
research.award(reason, n)     // reason: 'quest' | 'story' | 'region' | 'landmark'
                              //         'instance' | 'boss' | 'worldboss' | 'planet'
                              // n: how many of that THING happened, not how many points
```

`n` is a count of deeds, not a count of points — what one is worth lives in `data/research.json`'s
`points` block, so a caller never has to know that a boss is three.

Reach it from anywhere with:

```js
import { sharedResearch } from './research.js';
sharedResearch().award('quest', 1);
```

`sharedResearch()` is the one instance `js/build.js` and `js/build-ui.js` already use. It needs no
constructor arguments and it loads `data/research.json` itself.

**Without these calls:** Age 1 (everything low-tech) still works exactly as it does today, because
Age 1 is never researched — but ages 2–4 can never be bought, so the Smelter, the Drill, the
Assembler and the rest stay locked for ever. The Research screen says what to go and do; nothing
would ever register that you did it.

### 1a. `js/quests.js` — a quest handed in

Find where a quest is marked complete and its reward is paid (the `questrewards.js` call site), and
add one line beside it:

```js
sharedResearch().award('quest', 1);
```

For a story/campaign objective use `'story'` (worth 2). Add the import at the top:

```js
import { sharedResearch } from './research.js';
```

### 1b. `js/main.js` — exploring

Two places, whichever is convenient:

* when the zone banner fires because you crossed into a region you had not entered before —
  `sharedResearch().award('region', 1);`
* in `atLandmark` / `adoptLandmark`, the first time a landmark is claimed —
  `sharedResearch().award('landmark', 1);`

And, if it is cheap to spot, the first landing on a world you have not stood on before:
`sharedResearch().award('planet', 1);` (worth 3).

### 1c. `js/main.js` (or wherever a death is credited) — bosses

Where a kill is recorded and the enemy is a boss / champion-with-a-name / world boss:

```js
sharedResearch().award(enemy.worldBoss ? 'worldboss' : 'boss', 1);
```

Finishing an instanced place from `data/instances.json` is `'instance'` (worth 2).

**Budget check:** the whole tree is 27 points. Quest 1, region 1, landmark 1, instance 2, boss 3,
world boss 4. That is roughly eight hours of play, which is what it was tuned for.

---

## 2. `js/main.js` — E at a station should open the station's screen

**This is item 23 proper.** There is a working fallback (the build panel's bench section carries an
"Open the *Furnace*" button, which opens the same screen), so nothing is unreachable without it —
but E is where the player looks, and E currently opens the build menu.

**File:** `js/main.js`
**Anchor:** inside the `KeyE` handler, the `else if (it.kind === 'machine')` branch (around line
6717 in the version this round started from). It currently reads:

```js
        else if (it.kind === 'machine') {
          const m = it.works;
          const wants = m && works.labourNeed(m) > 0 && m.queue.length > 0 && m.enabled !== false;
          if (wants) {
            handWork.tick(0.25, { at: state.elapsed, holding: true, machine: it.machine });
            hud.log(`You put your back into the ${m.name}. Hold E to keep at it — B opens its recipes.`, 'good');
          } else {
            build.setMode(true);
            buildUI.setOpen(true);
            document.body.classList.add('building');
            buildUI.refresh();
            input.release();
            hud.log(m
              ? `${m.name}. ${works.stateText(m)} Pick what it should make.`
              : `${it.machine.name || 'It'} is not a machine that makes anything.`, m ? '' : 'warn');
          }
        }
```

**Replace the whole branch with:**

```js
        else if (it.kind === 'machine') {
          /**
           * R17 — E AT A STATION OPENS THAT STATION'S SCREEN.
           *
           *   "I built a furnace, campfire, kiln, and loom… when I press E to open it it just
           *    opens the regular build menu."
           *
           * It did: the only door into the recipe list was the build panel's bench section, so
           * asking a furnace what it could make put the whole catalogue, the tool rail, the
           * digging list and the shipyard on screen. `buildUI.openStation` returns false when the
           * thing you are standing at has no screen, so the old answer is still the fallback and
           * nothing can end up with no answer at all.
           *
           * TAP E to open it, HOLD E to work it: the frame loop's `handWork.tick` already runs on
           * `keys.has('KeyE')` and is not touched by this, so holding the key keeps putting units
           * into the same order whether the screen is up or not.
           */
          const m = it.works;
          if (buildUI.openStation?.(it.machine)) {
            input.release();
            if (m) hud.log(`${m.name}. ${works.stateText(m)} Hold E to work it.`, '');
          } else {
            const wants = m && works.labourNeed(m) > 0 && m.queue.length > 0 && m.enabled !== false;
            if (wants) {
              handWork.tick(0.25, { at: state.elapsed, holding: true, machine: it.machine });
              hud.log(`You put your back into the ${m.name}. Hold E to keep at it.`, 'good');
            } else {
              build.setMode(true);
              buildUI.setOpen(true);
              document.body.classList.add('building');
              buildUI.refresh();
              input.release();
              hud.log(`${it.machine.name || 'It'} is not a machine that makes anything.`, 'warn');
            }
          }
        }
```

`buildUI.openStation(entry)` takes a build-ledger entry (which `it.machine` is) and returns
`true`/`false`. `buildUI.closeStation()` closes it; the × on the screen and `Esc` already do.

### 2a. the pointer comes back

The station screen calls the same `onClose` js/main.js already passes `createBuildUI`, which is
`() => { build.setMode(false); document.body.classList.remove('building'); regrab(); }`. Closing the
screen therefore re-grabs the pointer with no change needed. If `regrab()` ever stops being the
right answer for a screen that did not enter build mode, that is the line to look at.

---

## 3. `js/hud.js` + `js/main.js` — the Research tab

The rail entry and the mount point **already exist** (`SCREENS` in `js/hud.js` lists `'research'`,
`index.html` has `#sheet-body-research`, and `hud.mount(tab, screen)` is written). All that is
missing is the two lines that build the screen and hand it over.

**File:** `js/main.js`, beside the `createCivicsScreen(...)` call (the Holding screen is mounted the
same way).

```js
import { createResearchScreen } from './research-ui.js';
import { sharedResearch } from './research.js';

// …then, after `hud` exists:
const researchScreen = createResearchScreen({
  research: sharedResearch(),
  log: (t, c) => hud.log(t, c),
});
researchScreen.mount(document.getElementById('sheet-body-research'));
hud.mount('research', researchScreen);
```

The screen satisfies hud.js's contract: `draw()`, `show()`, `hide()`, and its own root with a
`hidden` flag. It loads `research.css` itself.

**Without this:** the Research screen is still reachable — the build panel's head has a **Research**
button that opens the same screen as an overlay — and `numberRail()` correctly hides the tab while
nothing is mounted, so there is no empty promise on the rail.

### 3a. optional — a badge for points waiting to be spent

`research.summary().ready` is how many nodes could be bought this instant. In `railBadges()`:

```js
set('research', this.mounted?.research ? (sharedResearch().summary().ready || 0) : 0);
```

---

## 4. `js/main.js` — one word in the `nextStep` context

`js/nextstep.js`'s `hasSmelter` is computed in js/main.js as "any js/refining.json machine is
standing". That was already loose (a Campfire made it true), and R17 made it looser by adding the
Crafting Table, the Anvil, the Workbench and the Garage to that list — so the "Build a Furnace" and
"Dig clay" hints can be skipped by somebody who has only built a bench.

**Anchor:** js/main.js's `nextStep:` callback, the line `hasSmelter: smelters.length > 0,`.

```js
      // R17 — "is there a FURNACE", not "is there a bench". `smelters` now includes the Crafting
      // Table, the Anvil, the Workbench and the Garage, none of which smelts anything.
      hasSmelter: smelters.some(m => Object.keys(m.def?.fuels || {}).length > 0),
```

(Every tier-0 burner — campfire, furnace, kiln — has a `fuels` block; no bench does.)

**Without this:** the hint chain occasionally skips a step. Nothing breaks.

---

## 5. `js/settings.js` (Debug) — optional

`sharedResearch().unlockAll()` takes every node without spending anything. It is what the browser
specs use to go on testing drills and assemblers. A "Unlock all research" row under
Settings → Debug would be one line, beside "Go here".

---

## 6. `data/campaign.json` / the onboarding — the words that changed

Nothing here is required, but the onboarding text should match the game:

* **"Storage Crate" is now "Storage Box"** (the id `storage_crate` is unchanged, deliberately — every
  save files its crates under it). It costs **6 planks and no metal**.
* There is a **Storage Chest** above it: 8 planks + 2 iron ingots, twenty slots.
* The step before both of them is a **Crafting Table** — 6 logs, 2 stone — which splits logs into
  planks and is the reason the Box is buildable before a forge exists.
* The build panel's own starting list (`FIRST_STEPS` in js/build-ui.js) already says all of this in
  order, and `js/nextstep.js`'s `store` step names both halves.

---

## 7. `data/vehicles.json` — optional, and only if the Garage should count as a workshop

A vehicle's `craft.stations` list says which benches must be within ten metres. A motorcycle wants
`["assembler"]`, a car adds `alloy_forge`, a truck adds `refinery`. The Garage is deliberately NOT
in any of those lists: it is a shed with a pit in it, and the parts are cut on the line. Its screen
says so, and the natural answer is to build the Garage beside the Assembler.

If that reads badly in play, adding `"garage"` to each `craft.stations` array makes the Garage a
required fourth bench rather than an optional one — which is a design decision, not a fix, so it is
left alone.

---

## 8. `index.html` — regenerate the modulepreload block at the end of the round

Three new modules are reached through `js/build-ui.js`: `js/station-ui.js`, `js/research.js` and
`js/research-ui.js`. They are not in the generated `<link rel="modulepreload">` block at the top of
`index.html`, so the browser discovers them two imports deep rather than fetching them with
everything else. Nothing breaks; it is three extra round trips on a cold load, which is the thing
R16 spent a morning removing.

`index.html` belongs to another agent this round, and the block says "do not edit by hand". One
command at the end of the round:

```
cd ~/claude/playground && python3 tools/preload-modules.py prototypes/farhold/index.html
```

(It must keep skipping `.json`, per the R16 note — `data/research.json` is fetched by
`js/research.js` at runtime, not imported.)

---

## What this cluster did NOT touch

`js/main.js`, `js/hud.js`, `style.css`, `index.html`, `js/tools.js`, `js/resources.js`,
`data/resources.json`, `js/quests.js`, `data/campaign.json` — none of them were edited.

Five Playwright specs were edited, and only because a piece they place is now behind the tech tree
or has moved screens: `tests/garage.spec.js` (the garage rows moved to the Garage's own screen),
`tests/shipyard.spec.js`, `tests/mining.spec.js`, `tests/base-roundtrip.spec.js`,
`tests/defence.spec.js` (one `f.build.research?.unlockAll?.()` line each), and
`tests/build-mode.spec.js` (seven starting steps instead of six, plus the new assertion that the
catalogue disappears with a non-placement tool). Two node tests were edited for the same reason:
`tests/civilization.test.js` (its scenery crate is a Chest now) and `tests/nextstep.test.js`
(the drill hint asks for `iron_ingot`, which is what a furnace actually makes).
