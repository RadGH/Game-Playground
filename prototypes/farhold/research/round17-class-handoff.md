# Round 17 handoff — the custom class, followers and mercenaries

Everything in this round's cluster is built and tested. The modules below are **finished and
reachable from each other**, but four of the six files that have to call them belong to other
agents this round: `js/main.js`, `js/save.js`, `js/rpg.js`, `js/effects.js` (plus two optional ones,
`js/town.js` and `index.html`/`js/hud.js`).

**An unapplied patch here is the same fault as a module nothing calls.** Patches 1–8 are the ones
that matter; 9–13 are tidy-ups and extra doors. Each patch says the exact anchor line to find and
the exact text to put after it.

New files this round (nothing below has to be created, only called):

| File | What it is |
|---|---|
| `data/classbuild.json` | loadouts, elements, armour tiers, the opening kit, the six tier names |
| `data/mercenaries.json` | the follower slot ladder, the per-type summon rule, ten hireable types |
| `js/classbuild.js` | pure: the spell tier list, the point-buy, the loadout gate, the opening kit |
| `js/classbuild-ui.js` + `classbuild.css` | the builder screen, mounted into a div of its own |
| `js/followers.js` | pure: slots, the summon gate, contracts, the broker's board, level scaling |
| `js/followers-ui.js` + `followers.css` | the Followers screen (Company / Hire / Spells) |
| `tests/round17-class.test.js` | 25 tests, all green |

---

## Patch 1 — `js/main.js`: load the two data files

**Anchor** (in `boot()`, the destructure of `Promise.all`):

```js
    resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, goodsData] = await Promise.all([
```

**Replace that one line with:**

```js
    resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, goodsData,
    // R17 — the custom class's tuning and the ten hireable mercenary types
    classbuildData, mercData] = await Promise.all([
```

**Anchor** (the last entry of the same `Promise.all` array):

```js
    loadJSON('data/tradegoods.json').catch(() => null),
  ]);
```

**Replace with:**

```js
    loadJSON('data/tradegoods.json').catch(() => null),
    /**
     * R17 — the custom class and the mercenary types.
     *
     * Both `.catch(() => null)` like everything else added since round 14: without
     * `classbuild.json` the title screen simply does not offer the Custom entry and the thirty
     * presets are untouched, and without `mercenaries.json` the follower book falls back to its
     * own defaults (three slots, one of each summon) and nobody is for hire.
     */
    loadJSON('data/classbuild.json').catch(() => null),
    loadJSON('data/mercenaries.json').catch(() => null),
  ]);
```

## Patch 2 — `js/main.js`: hand them to the title screen and to `begin`

**Anchor:**

```js
  const data = { items, balance, bestiary, talents, campaignData, classLooks, skillData, classData,
    craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData,
    landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData,
    cropData, raidData, goodsData };
```

**Replace with** (two names added to the end):

```js
  const data = { items, balance, bestiary, talents, campaignData, classLooks, skillData, classData,
    craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData,
    landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData,
    cropData, raidData, goodsData, classbuildData, mercData };
```

**Anchor:**

```js
  const choice = await runTitle({ classData, classLooks, skillData, items, bestiary, balance, saves, params, settings, status });
```

**Replace with:**

```js
  const choice = await runTitle({ classData, classLooks, skillData, items, bestiary, balance, saves, params, settings, status, classbuildData });
```

## Patch 3 — `js/main.js`: `begin()`'s argument list

**Anchor** (the whole signature line):

```js
async function begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData: rawStructures, colonyData, cropData, raidData, goodsData, status, settings, choice, save }) {
```

**Replace with** (two names added before `status`):

```js
async function begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData: rawStructures, colonyData, cropData, raidData, goodsData, classbuildData, mercData, status, settings, choice, save }) {
```

**Also add the import**, next to the other `js/` imports at the top of the file:

```js
// R17 — the custom class: the opening kit a build asks for, and the screen that manages the company
import { applyOpeningKit } from './classbuild.js';
import { createFollowers } from './followers.js';
import { createFollowersScreen } from './followers-ui.js';
```

## Patch 4 — `js/main.js`: the opening kit (ONE line, and it is the whole custom class)

**Anchor** (inside `if (!save) { … }`, the last statement of the starting-kit block):

```js
    const firstTool = makeTool((toolData.bases || [])[0], 'normal', toolData, { level: 1 });
    if (firstTool) rpg.equip(player, firstTool, { force: true });
    player.held = 'weapon';
```

**Insert immediately after `player.held = 'weapon';` and before the closing `}`:**

```js
    /**
     * R17 — THE CUSTOM CLASS'S OPENING KIT.
     *
     * A build is installed AS a class on the title screen (js/newgame.js), so everything above this
     * line has already happened for it: the starter weapon out of `classDef.starter`, the armour
     * out of `classDef.startingArmour`, and the companion out of `classDef.pet`. What is left is
     * the three things a class def has no field for — the second weapon a dual loadout wants, the
     * element a branded caster was attuned to, and the sealed chest. A preset class returns
     * immediately without doing anything at all.
     */
    applyOpeningKit({ player, rpg, classDef, data: classbuildData, log: (t, k) => hud.log(t, k) });
```

## Patch 5 — `js/main.js`: the follower book, and the dead `petSlots` line

**Anchor:**

```js
  if (classDef.pet) {
    // "One more companion follows you" — the perk existed, and the class summon ignored it, so the
    // answer to "what companion?" was "none, ever". It is the class's own, one more of them.
    const pet = { ...classDef.pet, count: (classDef.pet.count ?? 1) + (player.derived?.petSlots || 0) };
    pets.summonForClass(classId, player, pet).then(made => {
```

**Replace those five lines with:**

```js
  /**
   * R17 — THE FOLLOWER BOOK, and it goes in BEFORE the class companion is summoned.
   *
   * It installs the limit on `pets.summon` (`pets.setGate`) and registers the ten hireable types,
   * so every door into the pet system — a summoning skill, a hire, the class companion below —
   * asks the same question. Built here rather than later because the class companion is the first
   * thing through that door.
   */
  const followers = createFollowers({
    data: mercData, skillData, pets,
    getPlayer: () => player,
    // where a new body is PUT DOWN: the player's position lives on `control`, not on `player`
    getAt: () => control,
    log: (t, k) => hud.log(t, k),
  });

  if (classDef.pet) {
    /**
     * R17 — the perk no longer adds to this. The Kept Company grants `followerSlots` now, which is
     * a limit on how many things may walk with you rather than a number added to a summon; the
     * follower book above enforces it at `pets.summon`. See js/perks.js and js/skills.js.
     */
    const pet = { ...classDef.pet };
    pets.summonForClass(classId, player, pet).then(made => {
```

## Patch 6 — `js/main.js`: the Followers screen, on `F`

**Anchor** (the Holding screen, which is the pattern this copies):

```js
  const holding = createCivicsScreen({
```

**Insert this block immediately BEFORE that line:**

```js
  /**
   * R17 — THE FOLLOWERS SCREEN.
   *
   *   "We should also add a Followers tab to the menu where you can manage your follower slots."
   *
   * Its own module and its own stylesheet, the way the Holding screen is, so it can be a key now
   * and a tab of the character sheet the moment somebody wants it — pass `embedded: true` and a
   * `mount` and it becomes a box inside whatever owns the window.
   */
  const company = createFollowersScreen({
    followers, pets,
    getPlayer: () => player,
    getAt: () => control,
    getDay: () => Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1,
    /**
     * WHERE YOU COULD HIRE SOMEBODY, IF ANYWHERE. A broker keeps a board in every settlement; out
     * on the road the tab says so in a sentence rather than showing four dead rows.
     */
    hireAt: () => {
      const town = features.settlementAt(control.x, control.z);
      return town ? { town, name: town.name } : null;
    },
    log: (t, k) => hud.log(t, k),
    // the Spells tab is the in-game respec, and it needs the live bar or a changed pick would
    // reach the screen and not the keys
    classData, skillData, classLooks, classbuildData, skills, forest: rpg.forest,
  });
```

**Anchor** (the `K` handler):

```js
    if (e.code === 'KeyK' && !hud.sheetOpen && !map.isOpen && !talk.isOpen && !build.mode) {
      e.preventDefault();
      pauseMenu.toggle(false);
      holding.toggle();
    }
```

**Insert after that block:**

```js
    /**
     * R17 — F IS YOUR COMPANY.
     *
     * Three tabs: who follows you and a dismiss on everything that can be dismissed, the mercenary
     * board in whatever settlement you are standing in, and the spell respec — "you should be able
     * to unlearn a skill at any time", which means at any time and not only on the title screen.
     */
    if (e.code === 'KeyF' && !hud.sheetOpen && !map.isOpen && !talk.isOpen && !build.mode) {
      e.preventDefault();
      pauseMenu.toggle(false);
      company.toggle();
    }
```

**Anchor** (the per-frame pet update):

```js
    pets.update(dt, control, player, {
      onPetHit: (p, target, result) => { if (result.crit) hud.log(`${p.name} lands a critical.`, 'good'); },
      onFallen: p => { hud.log(`${p.name} will come back.`, ''); },
      // …and say so when it does. `reviveSeconds` was dead data, so "will come back" was a lie.
      onReturned: p => { hud.log(`${p.name} is back.`, 'good'); },
    });
```

**Insert after it:**

```js
    /**
     * R17 — a save carries the CONTRACTS and not the bodies, because the bodies are meshes and the
     * world they stood in is rebuilt from its seed. This is what puts a mercenary you are paying
     * for back beside you after a load. It runs on a slow clock of its own.
     */
    followers.tick(dt);
    if (company.open) company.draw();
```

## Patch 7 — `js/main.js`: the road captain sells one of the ten types

The road mercenary (`data/wanderers.json`, `gives: 'hire'`) has always sold exactly one product —
`sellsword`, the one humanoid in the bestiary's pet table. `js/hire.js` now has `roadHireOffer`,
which picks one of the ten types deterministically from who the person is.

**Anchor** (in the `case 'hire':` block):

```js
        const pet = (bestiary.pets || []).find(x => x.id === 'sellsword') || null;
        talk.showOffer(folk.hireOffer(w, { level: player.level, gold: player.gold, pet }), {
          accept: () => {
            const price = w.hire?.gold ?? 180;
            if (player.gold < price) { hud.log(`${w.name} wants ${price} up front, and you have ${player.gold}.`, 'bad'); return; }
            player.gold -= price;
            // A hired sword is a real companion, not a line of text — `sellsword` is the one humanoid
            // in the pet table, added for exactly this.
            pets.summon('sellsword', control, { count: 1 }).then(made => {
              for (const one of made || []) one.name = w.name;
              hud.setPlayer(player);
            }).catch(() => {});
            hud.log(`${w.name} takes your ${price} and falls in beside you.`, 'good');
            roadFolk.settle(w.id, 'paid');
            autoSave();
          },
```

**Replace down to the end of that `accept` with:**

```js
        /**
         * R17 — ONE OF TEN, NOT ALWAYS THE SAME SELLSWORD.
         *
         * `roadHireOffer` picks a type out of data/mercenaries.json from a hash of who this person
         * is, so they always sell the same thing and different captains sell different people. The
         * hire itself goes through the follower book, which is what charges for it, writes the
         * contract a save carries, and refuses when there is no slot left.
         */
        const offer = roadHireOffer(w, {
          mercenaries: mercData?.mercenaries || [],
          playerLevel: player.level, gold: player.gold, scaling: mercData?.scaling,
        });
        talk.showOffer(offer, {
          accept: async () => {
            const out = await followers.hire(offer.mercId, { at: control });
            if (!out.ok) { hud.log(out.why, 'bad'); return; }
            if (out.unit) out.unit.name = w.name;
            hud.setPlayer(player);
            roadFolk.settle(w.id, 'paid');
            autoSave();
          },
```

…and add `roadHireOffer` to the existing `js/hire.js` import (or, if main.js imports it through
`js/town.js`, `folk.roadHireOffer` is not re-exported — import it directly):

```js
import { roadHireOffer } from './hire.js';
```

## Patch 8 — `js/save.js`: carry the build and the contracts

Both ride on the `player` object, which `snapshot()` already receives whole — so this is two lines
in `snapshot()` and two in `restore()` and nothing in `js/main.js` changes.

**Anchor** (inside `snapshot()`'s `player: { … }` block):

```js
      devices: player.devices || {},
      held: player.held || 'weapon',
    },
```

**Replace with:**

```js
      devices: player.devices || {},
      held: player.held || 'weapon',
      /**
       * R17 — THE CLASS THEY BUILT, AND WHO THEY ARE PAYING.
       *
       * `classId` on a custom character is the string "custom", which means nothing on its own:
       * `build` is the loadout, the six spell picks, the element and the opening choice, and
       * js/newgame.js re-installs the class from it before a load is handed back — without this a
       * custom character reloads as whatever `classData.classes[0]` happens to be, with the wrong
       * skill bar, and nothing says so.
       *
       * `followers` is the mercenary contracts. A save carries the contracts and not the bodies,
       * because the bodies are meshes and the world is rebuilt from its seed; js/followers.js
       * `tick` summons anybody under contract back beside you once the run is up.
       */
      build: player.build || null,
      followers: player.followers || null,
    },
```

**Anchor** (in `restore()`):

```js
  player.devices = p.devices || {};
  player.held = p.held || 'weapon';
```

**Insert after it:**

```js
  // R17 — the custom class and the mercenary contracts. A save from before this round has neither,
  // and a preset class never has a `build` at all.
  player.build = p.build || null;
  player.followers = p.followers || { contracts: [] };
```

---

## Patch 9 — `js/rpg.js` (tidy-up): declare `followerSlots`

Not load-bearing — `rpg.derive` folds an undeclared perk stat in anyway
(`if (key in d) d[key] += value; else d[key] = value;`) — but rpg.js's table is where every other
perk stat is declared and `tests/round16-perks.test.js` parses it.

**Anchor:**

```js
      areaPct: 0, petDamagePct: 0, petSlots: 0, arrowDamage: 0, arrowsPerShot: 1, arrowHoming: 0,
```

**Replace with:**

```js
      // R17 — `followerSlots` is The Kept Company's grant: how many things may WALK WITH YOU, and
      // how many of each creature a summoning spell may have standing. `petSlots` is the old key,
      // still granted by the `cond_companionExtra` affix; js/followers.js adds the two together.
      areaPct: 0, petDamagePct: 0, petSlots: 0, followerSlots: 0, arrowDamage: 0, arrowsPerShot: 1, arrowHoming: 0,
```

If this is applied, the `for (const stat of FOLLOWER_STATS) known.add(stat);` line added to
`tests/round16-perks.test.js` can stay — it is harmless either way.

## Patch 10 — `js/effects.js` (tidy-up): the companion affix says what it now does

`cond_companionExtra` grants `petSlots`, which used to mean "one more body per cast". It now means
"one more follower", because `js/followers.js` adds `petSlots` and `followerSlots` together — so the
affix is live, and only its WORDS are out of date.

**Anchor:**

```js
def('affix:cond_companionExtra', v => `Every summoning skill calls up ${n1(v)} more companion${n1(v) > 1 ? 's' : ''}`, {
  derive: (v, d) => { d.petSlots = (d.petSlots || 0) + v; },
});
```

**Replace with:**

```js
// R17 — this is a FOLLOWER SLOT now, not a body per cast. A summoning skill puts down its own
// number; what this raises is how many things may walk with you at once, and how many of each
// creature may be standing (js/followers.js). The key stays `petSlots` so an old save is unchanged
// and js/followers.js `followerBonus` adds it to `followerSlots`.
def('affix:cond_companionExtra', v => `${n1(v)} more follower may walk with you`, {
  derive: (v, d) => { d.petSlots = (d.petSlots || 0) + v; },
});
```

## Patch 11 — `js/town.js` (optional): a mercenary broker you can walk up to

The Hire tab works today in any settlement, through `F`. This makes it a **person**, which is what
the user asked for: *"add a mercenary person who sells mercenaries to the player"*.

**Anchor** (the end of the `ROLES` table):

```js
  { key: 'gambler', name: 'Gambler', minSize: 3, gambles: true, greeting: 'Sealed, unopened, and I do not know what is in it either. That is the arrangement.' },
];
```

**Replace with:**

```js
  { key: 'gambler', name: 'Gambler', minSize: 3, gambles: true, greeting: 'Sealed, unopened, and I do not know what is in it either. That is the arrangement.' },
  /**
   * R17 — THE BROKER. "Add a mercenary person who sells mercenaries to the player."
   *
   * Not a hired sword themselves: they keep the board, and what is on it comes from
   * data/mercenaries.json through js/followers.js `board()`. Size 2 and up, because a hamlet has
   * nobody to sell.
   */
  { key: 'broker', name: 'Mercenary Broker', minSize: 2, brokers: true, greeting: 'Four names on the board today. They all want paying up front.' },
];
```

**And in `js/main.js`**, in `talkContext(npc)`, add:

```js
      // R17 — the broker's board, so the offer is made in a conversation like every other offer
      mercBoard: npc.brokers ? followers.board({ town: npc.node, day: Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1 }) : null,
```

…then a branch in `js/talkui.js` beside the existing `context.hireOffer` one. (If this patch is
skipped, nothing is lost: `F` → Hire is the same board in the same settlement.)

## Patch 12 — `index.html` + `js/hud.js` (optional): Followers as a sheet tab

The lead agent is already embedding the Holding screen as a tab this round (`civics-ui.js` gained
`embedded`). `js/followers-ui.js` takes the identical two options, so:

```js
  const company = createFollowersScreen({ …, embedded: true, mount: document.querySelector('[data-tab="followers"]') });
```

…plus a rail button and a `<div class="tab-body hidden" data-tab="followers">` in `index.html`, and
`if (this.tab === 'followers') company.draw();` in `hud.js`'s `render()`. With `embedded: true` the
screen drops its fixed positioning and its own close button and lets the sheet's Esc cover it. The
`F` key in patch 6 can stay or go — both call the same `toggle()`.

## Patch 13 — regenerate the module preload list

```
python3 tools/preload-modules.py prototypes/farhold/index.html
```

It was already stale before this round (exit 1 on `--check`). Run it once after patches 1–8 land,
so the five new modules are preloaded with the other 190.

---

## What works without any of this

* Nothing. The modules are complete and tested, but the custom class is unreachable until
  `classbuildData` reaches `runTitle` (patches 1–2) and the Followers screen is unreachable until it
  is created (patches 5–6). **Patches 1–8 are the round.**
* Already applied by this agent, in files it owns: `tests/round4.spec.js` and
  `tests/round16-title.spec.js` both asserted exactly 30 entries in `#boot-class`; there are 31 now
  and both were updated.
