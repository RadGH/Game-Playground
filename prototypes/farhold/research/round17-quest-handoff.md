# Round 17 — the onboarding line: the five lines of `js/main.js` it needs

`js/onboarding.js` and `data/onboarding.json` are finished and tested
(`tests/round17-onboarding.test.js`, 22 checks, green). Everything below is plumbing in
`js/main.js`, which the quest agent does not own. **Until these are applied the line is a finished
module nothing calls — this project's signature fault — so please apply all five.**

Every one of them is guarded with `?.`, so if `js/onboarding.js` were deleted tomorrow the game
would still boot and play. The module also refuses to arm itself if any id in
`data/onboarding.json` stops resolving against `data/structures.json`, `data/refining.json` or
`data/resources.json`: it logs the problem and goes quiet rather than pointing a new player at
something that is not there.

No other file needs touching. The quest is offered through `js/quests.js`'s new `setFirstJob`
hook, which `js/town.js`'s `questFrom` already reaches by calling `makeQuest` — so the talk screen,
the journal, the save and the turn-in path all work on it with no changes at all.

---

## H1 — the import

**Anchor** (insert the new line immediately after):

```js
import { nextStep as chainNextStep } from './nextstep.js';
```

**Insert:**

```js
// R17 — the five-step line that takes a new player from an empty field to an iron ingot.
import { createOnboarding } from './onboarding.js';
```

---

## H2 — the handle, declared early so nothing reads it in its dead zone

`objective:` (H3) is a closure inside the `new Hud({...})` argument list, roughly five thousand
lines above where the module can actually be built — `stores`, `build` and `works` do not exist
yet at that point. A `const` read before its declaration throws, and `RPG.md` records three
crashes of exactly that shape from round 11, none of which `node --check` can see. A `let`
initialised to `null` cannot.

**Anchor** (insert after):

```js
  const questLog = save?.quests ? QuestLog.fromJSON(save.quests) : new QuestLog();
```

**Insert:**

```js
  /**
   * R17 — the onboarding line. Built much further down, once the base modules it reads exist;
   * declared here as a `let` so the HUD's `objective:` closure can name it without reading a
   * `const` that has not been initialised yet.
   */
  let onboard = null;
```

---

## H3 — the objective strip

**Anchor** — the first two lines of the existing `objective:` provider:

```js
    objective: () => {
      if (dungeon) return { name: dungeon.name, where: 'find the way down' };
```

**Replace with:**

```js
    objective: () => {
      /**
       * R17 — the onboarding line speaks first while it is live, and only while it is live.
       *
       * Round 10's review put this strip here because "the game never said what to do"; what it
       * says is WHERE something is, which is no use at all for the opening ten minutes, where
       * every move is a key nobody has been told about. js/onboarding.js returns null the moment
       * the line is over, or if the player never took it, so the strip goes straight back to the
       * marker book. It never holds the line hostage.
       */
      const guide = onboard?.objective();
      if (guide) return guide;
      if (dungeon) return { name: dungeon.name, where: 'find the way down' };
```

---

## H4 — building it

Must go **after** `autoSave` is defined, because it is handed `autoSave`, and after `stores`,
`works`, `build`, `mining`, `craft` and `features` — all of which are declared by roughly line
3000. The anchor below is comfortably past all of them.

**Anchor** (insert after):

```js
  window.addEventListener('beforeunload', () => { try { autoSave(); } catch { /* ignore */ } });
```

**Insert:**

```js
  /**
   * R17 — THE ONBOARDING LINE, WIRED UP.
   *
   * Five steps from an empty field to an iron ingot: take a job in the first town, cut timber and
   * break stone, put a crate down, dig clay and raise a furnace, smelt. It is one quest in the
   * ordinary log, so the journal row, the save, the marker sweep and the turn-in path all already
   * work on it; what is wired here is the four things that only main.js has.
   *
   * `game` is READ, never written — the module asks what is standing and what is in a pool rather
   * than keeping any bookkeeping of its own, which is the only way a hint can be trusted.
   * `pay` is js/questrewards.js, the one payer; there is no second one.
   *
   * It awaits its own data file rather than joining the `loadJSON` block at the top, so a failed
   * fetch turns the tutorial off instead of stopping the game from booting.
   */
  onboard = await createOnboarding({
    questLog,
    structures: structureData, refining: refiningData, resources: resourceData,
    game: { player, control, stores, materials: craft.materials, build, features },
    pay: quest => grantReward(quest, questRewardCtx()),
    log: (text, tone) => hud.log(text, tone),
    save: () => autoSave(),
    // R17: the research module, if it has landed. `createOnboarding` also looks for
    // `window.farhold.research` at award time, so this can stay null until it exists.
    research: null,
  }).catch(err => { console.warn('onboarding: could not start', err); return null; });
```

> If `grantReward` is not already imported in `main.js` under that name, it is — line ~60,
> `import { grantReward, ... } from './questrewards.js'`. Nothing new is needed.

---

## H5 — the tick

**Anchor** (insert after — it is the `sinceArrive` block in the frame loop):

```js
      for (const q of questLog.onArrive({ x: control.x, z: control.z })) {
        hud.log(`${q.title}: arrived.`, 'good');
      }
    }
```

**Insert:**

```js
    // R17 — the onboarding line watches what is actually standing and what is actually in a pool.
    // It throttles itself (half a second), so this is one comparison on most frames.
    onboard?.tick(dt);
```

---

## For the research agent

`js/onboarding.js` calls, once per finished step:

```js
research.award(`onboarding:${step.id}`, step.research || 0);
```

`step.research` is 1, 1, 2, 2, 4 across the five steps — ten points for the whole line. It finds
the module in one of two ways, in this order:

1. the `research` option passed to `createOnboarding` (H4 above — change `research: null` to the
   real module once it exists), or
2. `window.farhold.research` at the moment of awarding, so exposing it there is enough on its own.

The call is wrapped in `try/catch` and a missing module is silence, not a crash. Nothing has to be
timed against anything.

## For the crafting-chain agent

Two ids the line names, and what happens if you move them:

| step | names | how it is resolved |
|---|---|---|
| `store` | `storage_crate` **or** `storage_box` | `anyOf` — whichever exists. The step is actually finished by a storage **pool** forming, so a rename that keeps either id costs nothing. |
| `heat` | `furnace` | must exist in `data/structures.json`. |
| `ingot` | recipe `smelt_iron` → `iron_ingot` | must exist in `data/refining.json`, and its `machine` must be one of the structures the `heat` step builds. |

`tests/round17-onboarding.test.js` §1–§1.3 fails loudly on any of those, and
`resolveTargets()` turns the whole line off at runtime rather than sending a first-time player at
something that is not there. §2.1 also asserts that the gather step asks for at least as much stone
as the structures the line goes on to build actually cost — so if a furnace gets dearer, that test
tells you the tutorial is now under-collecting.

The line deliberately does **not** require a campfire: `data/refining.json` lets a furnace burn
plain logs, so demanding one would be a step the player could skip, and a tutorial that asks for
something optional teaches people to ignore it. If the fuel rules change so that a furnace cannot
burn logs, add a campfire step to `data/onboarding.json` — the shape is already there.
