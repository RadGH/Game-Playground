# The Civilization Expansion — the wiring I could not make myself

Two agents were in **`js/main.js`**, **`js/hud.js`**, **`js/build-ui.js`**, **`js/buildplan.js`**,
**`js/town.js`** and **`index.html`** while this round was written, so none of them was touched.
Everything below is a copy-pasteable patch against the code as it stood when I finished. **Nothing
in this file has been applied.**

Everything else — `js/civics.js`, `js/housing.js`, `js/vendors.js`, `js/hold.js`, `js/trade.js`,
`js/muster.js`, `js/civics-ui.js`, `civics.css`, the changes to `js/colony.js`, `js/refine.js`,
`js/defence.js`, `js/raid.js`, `js/caravans.js`, `js/hire.js`, `js/save.js`, and the data — is in
the working tree and `npm run test:unit` is green on it.

**Do part A first.** Without it `js/civics.js` is a finished module nothing calls, which is the
exact fault rounds 11 to 14 kept turning up, and the headline feature of the round — *an NPC runs
the furnace while you are four kilometres away* — is switched off at source. `createWorks` only
enforces the labour rule when it is handed the `labour` block (A2), on purpose: a caller that has
not wired the colony gets the module it has always had, so nothing breaks in the meantime. But
nothing new happens either.

Roughly forty lines in total, in eleven places, and nine of them are one line each.

---

## A — `js/main.js`

### A1 — the goods file, and the import

Find (the building expansion's data block, near line 166):

```js
    loadJSON('data/colony.json').catch(() => null),
    loadJSON('data/crops.json').catch(() => null),
    loadJSON('data/raids.json').catch(() => null),
  ]);
```

Replace with:

```js
    loadJSON('data/colony.json').catch(() => null),
    loadJSON('data/crops.json').catch(() => null),
    loadJSON('data/raids.json').catch(() => null),
    // the Civilization Expansion §6 — the twenty-two trade goods, injected into resources and
    // refining at boot by js/trade.js rather than written into either file
    loadJSON('data/tradegoods.json').catch(() => null),
  ]);
```

…and add `goodsData` to the three places the destructured list appears. Find:

```js
    resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData] = await Promise.all([
```

Replace with:

```js
    resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, goodsData] = await Promise.all([
```

Then add `goodsData` to the end of every `begin({ … colonyData, cropData, raidData, status, save … })`
call (there are four, at roughly lines 253, 266, 274 and 294) and to `begin`'s own parameter list at
line 304 — in each case immediately after `raidData,`.

Finally, beside the other local imports at the top of the file:

```js
import { createColony } from './colony.js';
```

becomes

```js
import { createColony } from './colony.js';
// the Civilization Expansion: one module owns housing, vendors, the hold, trade, the muster and
// the away half, so main.js constructs ONE thing and ticks ONE thing
import { createCivics } from './civics.js';
import { createCivicsScreen } from './civics-ui.js';
```

### A2 — the works learn that somebody has to turn them

Find (about line 1740):

```js
  const works = createWorks({
    refining: refiningData || {}, resources: resourceData || {},
    stores, grid, log: (t, c) => hud.log(t, c),
    rareElement: planet?.rare?.[0] || null,
  });
```

Replace with:

```js
  const works = createWorks({
    refining: refiningData || {}, resources: resourceData || {},
    stores, grid, log: (t, c) => hud.log(t, c),
    rareElement: planet?.rare?.[0] || null,
    /**
     * THE CIVILIZATION EXPANSION §3 — AND THIS ONE ARGUMENT IS THE WHOLE SWITCH.
     *
     * With it, a tier-0 or tier-1 machine refuses to run unless somebody has put work units into
     * it: one unit is thirty seconds of running time, and a bound smelter is worth about ten units
     * a day, so one worker is one furnace. Without it js/refine.js behaves exactly as it always
     * has. Passing it is what turns the headline of the round on.
     */
    labour: colonyData?.labour || null,
  });
```

### A3 — the colony learns where the beds and the machines are

Find (about line 2016):

```js
  const colony = createColony({
    data: colonyData || null, board, seed,
    name: `${player.name}'s holding`,
  });
```

Replace with:

```js
  const colony = createColony({
    data: colonyData || null, board, seed,
    name: `${player.name}'s holding`,
    /**
     * `stationAt` is how a citizen's walk to work becomes a real number of metres. It is a callback
     * rather than an object because js/colony.js must never learn what a machine is — and `civics`
     * is declared below this, so it is read lazily.
     */
    stationAt: id => civics?.stationAt?.(id) || null,
  });
```

`housing` is handed over by `civics.rebuild` (A4) rather than passed here, because the register has
to be built from `build.entries` and `build` is declared further down than this.

### A4 — construct the layer, right after `farm`

Find (about line 2021):

```js
  const farm = createFarm({ data: cropData || null, board, seed });
  if (save?.farm) farm.load(save.farm);
```

Replace with:

```js
  const farm = createFarm({ data: cropData || null, board, seed });
  if (save?.farm) farm.load(save.farm);

  /**
   * ================= THE CIVILIZATION EXPANSION =================
   *
   * One module, one tick, one save field. js/civics.js owns js/housing.js, js/vendors.js,
   * js/hold.js, js/trade.js and js/muster.js, and it injects the twenty-two trade goods into the
   * live resources and refining data before anything reads either — never into the files, which is
   * the rule data/items.json taught when it turned out to be shared with Emberveil.
   */
  const civics = createCivics({
    data: colonyData || null, goods: goodsData || null, raids: raidData || null,
    resources: resourceData || {}, refining: refiningData || {},
    colony, works, board, stores, farm, bestiary,
    dayLengthSeconds: balance.sky?.dayLengthSeconds ?? 900,
    seed, log: t => hud.log(t, 'level'),
  });
  if (save?.civics) civics.loadJSON(save.civics);
```

### A5 — the screen, beside the other panels

Put this anywhere after `civics` and `hud` both exist (just before the keydown block at ~5308 is
fine):

```js
  /**
   * THE HOLDING SCREEN — its own file, its own stylesheet, and `K` opens it.
   *
   * js/hud.js is 3 100 lines and carries nine other screens; a sixth tab bolted into it would be
   * the tenth thing that has to be right for the character sheet to open. civics.css is loaded by
   * the module itself, so index.html needs no change either.
   */
  const holding = createCivicsScreen({
    civics, colony, works,
    getPlayer: () => player,
    getDay: () => Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1,
    log: (t, c) => hud.log(t, c),
  });
```

### A6 — `K` opens it

Find (in the keydown block, about line 5322):

```js
    if (e.code === 'KeyB' && !hud.sheetOpen && !map.isOpen && !talk.isOpen) {
```

Insert ABOVE it:

```js
    /**
     * K IS THE HOLDING.
     *
     * Five tabs: who lives here, what they sleep in, what is being worked, which traders would move
     * in and why the rest will not, and what is in the hold. Every refusal on that screen is a
     * sentence — "a Forge-Warden would set up here, but the only free bed is a bedroll in the open"
     * — because a greyed-out row is the one answer a player cannot act on.
     */
    if (e.code === 'KeyK' && !hud.sheetOpen && !map.isOpen && !talk.isOpen && !build.mode) {
      e.preventDefault();
      pauseMenu.toggle(false);
      holding.toggle();
    }
```

### A7 — rebuild the register whenever a piece goes up or comes down

Find (about line 2366, in `onPlace`):

```js
    onPlace: (entry, def) => {
      joinSystems(entry, def);
```

Replace with:

```js
    onPlace: (entry, def) => {
      joinSystems(entry, def);
      // houses, utilities, watch posts, Trade Posts and Tender Arms, all worked out from where
      // things stand rather than declared — the same rule js/outposts.js applies to outposts
      civics.rebuild(build.entries, build.defOf);
```

…and the same one line after the other `joinSystems` call at about line 2842, and in whatever
`onRemove`/`remove` handler the build panel uses (search for `build.remove` — the register has to
lose a house that was pulled down or the citizen in it keeps a bed that is not there).

### A8 — the tick

Find (about line 6250, inside the `state.frames % 15` block):

```js
      colony.setClock(sky.dayFraction * 24, Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1);
      colony.tick?.(dt * 15);
      farm.tick?.(dt * 15);
      board.runMachines?.(works.machines?.() || [], (dt * 15) / 3600);
```

Replace with:

```js
      colony.setClock(sky.dayFraction * 24, Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1);
      colony.tick?.(dt * 15);
      farm.tick?.(dt * 15);
      /**
       * `works.machines()` NOW RETURNS SOMETHING.
       *
       * This call has been here since the building expansion and `works.machines` did not exist, so
       * js/work.js's third source — the whole reason `runMachines` was written — has never once
       * run. It returns the Tender Arms, which js/civics.js hands over in `rebuild`.
       */
      board.runMachines?.(works.machines?.() || [], (dt * 15) / 3600);
      /**
       * …and the labour orders, the vendor day, and the carts on the long roads.
       *
       * `civics.tick` posts at most one small order per machine that wants tending and takes it off
       * again when it does not, then pays each finished order into the machine it was for. That is
       * the join the whole round is about.
       */
      const civ = civics.tick(dt * 15, {
        day: Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1,
        hour: sky.dayFraction * 24,
        gold: player.gold, rng: rpg.rng, at: state.elapsed,
      });
      for (const r of civ.arrived) player.gold += civics.trade.collect(r.id).gold || 0;
      if (civ.vendor) hud.log(`${civ.vendor.name} is asking after a bed. Press K.`, 'level');
      holding.drawHold();
      if (holding.open) holding.draw();
```

### A9 — the away card

Find (about line 2508):

```js
  if (save?.away) {
    away.load(save.away);
    const back = away.resume();
    if (back.text) hud.log(back.text, 'level');
  }
```

Replace with:

```js
  if (save?.away) {
    away.load(save.away);
    const back = away.resume();
    if (back.text) hud.log(back.text, 'level');
    /**
     * THE HALF THE AWAY CLOCK NEVER COVERED: THE PEOPLE.
     *
     * js/logistics.js runs the grid, the machines and the shipments forward. Nobody woke, nobody
     * walked to work, nobody ate and nobody filled a labour order — which did not matter before
     * this round, because a citizen's work never made a single ingot. `civics.away` takes the
     * window that clock already decided on (cap included) and runs the colony, the fields and the
     * trade routes across the same seconds, in the same order the live loop uses.
     *
     * The mercy: nobody walks out while you are off-world. Losing your village because you took a
     * flight is a punishment for playing.
     */
    civics.rebuild(build.entries, build.defOf);
    const card = civics.away({ seconds: back.seconds, rng: rpg.rng });
    if (card) holding.showAway(card);
  }
```

Do the same two lines wherever the game re-lands on a world you have a base on (search for the
other `away.resume()` at about line 4323), so the card fires on a landing as well as on a load.

### A10 — the save

Find (in `currentSnapshot`, about line 4980):

```js
      colony: colony.toJSON?.() || null,
      farm: farm.toJSON?.() || null,
      work: board.toJSON?.() || null,
```

Replace with:

```js
      colony: colony.toJSON?.() || null,
      farm: farm.toJSON?.() || null,
      work: board.toJSON?.() || null,
      // who sleeps where, which traders moved in, what is in the hold and the Trade Post, the carts
      // on the long roads, and the muster cooldowns. js/save.js's parameter list already has it.
      civics: civics.toJSON?.() || null,
```

`js/save.js` is already done: `civics` is in the destructured parameter list AND in the returned
object, in the same edit, for the reason that file's own comment gives.

### A11 — `window.farhold`, for the specs

Find:

```js
    get world() { return world; },
```

Insert after it:

```js
    /** The Civilization Expansion, for tests/civilization.spec.js. */
    get civics() { return civics; },
    get holding() { return holding; },
    get housing() { return civics.housing; },
    get hold() { return civics.hold; },
    get trade() { return civics.trade; },
    get muster() { return civics.muster; },
```

---

## B — `js/main.js`: the defence getters and the muster (§8.5, §9)

### B1 — the three lines that close `colony.guards()` → `defence.baseOf()`

Find (about line 1830):

```js
  const defence = createDefence({
    data: raidData || null, bestiary, grid,
    rng: rpg.rng, log: (t, c) => hud.log(t, c), spellfx,
    // getters: the enemy field is rebuilt on every landing, and `build` is declared below this
    getField: () => field,
    getBuild: () => build,
  });
```

Replace with:

```js
  const defence = createDefence({
    data: raidData || null, bestiary, grid,
    rng: rpg.rng, log: (t, c) => hud.log(t, c), spellfx,
    // getters: the enemy field is rebuilt on every landing, and `build` is declared below this
    getField: () => field,
    getBuild: () => build,
    /**
     * THE NINTH JOIN. `colony.guards()` has counted citizens standing a watch since the colony
     * landed and `defence.baseOf()` hard-coded `citizens: 0` right next to it. Two consequences,
     * both immediate: four guards and a bolt turret now qualify for the Warband, where before you
     * needed five turrets; and `notoriety.perCitizen` finally gets a real number instead of a zero,
     * so a village of twelve with a watch is noticed by the world.
     *
     * Getters, for the same reason `getField` is one: both are rebuilt on every landing.
     */
    getColony: () => colony,
    getWorks: () => works,
    getOutposts: () => outposts?.all?.() || null,
    folk,
  });
```

If `outposts` or `folk` is not in scope at that point, pass `() => null` / `null` — both are
optional and `baseOf` falls back to the behaviour it has today.

### B2 — the muster: `E` on a notice board or a Muster Stone

Find the interact router at about line 3126, which already returns `{ kind: 'board', town: inTown }`
for a town's notice board, and add beside it:

```js
      // the Civilization Expansion §9.2 — a stone you strike to call a drill
      const stone = (build.entries || []).find(e =>
        build.defOf?.(e.key)?.muster && Math.hypot(control.x - e.x, control.z - e.z) < 4);
      if (stone) return { kind: 'muster', at: stone };
```

…and where a `board` or `muster` interaction is handled:

```js
    /**
     * THE MUSTER BOARD. Four ranks, always all four, each greyed with its reason.
     *
     * The existing Alarm Bell stays exactly what it is — that is the REAL raid, the one that pays
     * standing and can cost you a wall. The stone and the notice board are the DRILL. Two objects,
     * two meanings, and the panel says which is which every time.
     *
     * Losing one costs nothing at all beyond whatever dying already costs you: no broken
     * structures, no materials taken, no citizen leaves, no standing lost, no repair bill. That is
     * the user's own condition and js/raid.js `loseRaid` enforces it rather than the call site —
     * which matters, because a call site that re-derived the loss from raids.json would bypass the
     * flag and a minigame would quietly start eating walls.
     */
    function openMuster({ placeId, placeName, base }) {
      const rows = civics.muster.board({ placeId, base, level: player.level, at: state.elapsed });
      // draw `rows` however the notice board already draws a job list; taking one is:
      //   const out = civics.muster.start({ placeId, placeName, tier: row.key, base,
      //                                     level: player.level, biome: terrain.biomeAt(control.x, control.z).key,
      //                                     at: state.elapsed, hour: sky.dayFraction * 24 });
      //   if (out.ok) { defence.rally({ level: player.level }); spawnFor(out.quest); }
      return rows;
    }
```

**And the warning from the design, which is the one thing to be careful of.** The existing wave-loss
call site routes through `defence.lost({ materials })` and then applies the result. It must read
`outcome.structuresBroken` and friends **from the returned object** rather than re-deriving the loss
from `raidData.loss`. If any of it is computed at the call site, the drill flag is bypassed.

### B3 — the leash, in the tick

```js
    if (civics.muster.quest) {
      const out = civics.muster.tickLeash(dt, { x: control.x, z: control.z, spot: defence.spot() });
      if (out?.warn) hud.log(`You are ${out.metres} m from the muster. ${out.seconds}s and it is over.`, 'warn');
      if (out?.over) hud.log(out.line, '');
    }
```

---

## C — `js/build-ui.js`: nothing at all

The two new catalogue categories (`home` — Housing, and `trade` — Trade) are picked up automatically:
`createBuildUI` reads `catalogue.categories` and filters to the ones that have pieces in them
(`js/build-ui.js:99`). Checked, and it works as it stands. **No edit needed.**

## D — `js/buildplan.js`: nothing at all, and deliberately

The design (§10.4) wanted `place()` to copy `home`, `utility`, `post`, `tender` and `muster` blocks
on to the entry beside `waypoint`/`run`/`gate`. It is not necessary: every module in this round
reads the blocks through `build.defOf(entry.key)` instead, which is the same information from the
same file and needs no edit to a file two other agents are in. If a later round wants them on the
entry anyway, `js/housing.js` `blockOf()` already prefers the entry's own copy when there is one.

## E — `js/hud.js`: nothing at all

§6.6's hold readout is drawn by `js/civics-ui.js` `drawHold()` into its own fixed element, styled by
`civics.css`. Called from A8. **No edit needed.**

## F — `js/town.js` and `proctown/js/townplan.js`: deferred, and why

§5.3's town half — mapping `BUILDING_INFO` roles to the eleven new vendor names, adding `tradepost`
and `countinghouse` plots to proctown's `WANT_ORDER`, and placing a vendor IN their building rather
than in a ring — is **not done**. Both files were off limits, `proctown/js/townplan.js` is shared
with other pages and its overlap test runs 7 cultures × 11 seeds × 6 sizes, and the vendor system
works without it: a vendor at your own outpost takes the free plot nearest the centre.

What it costs to leave out: the eleven new traders exist at YOUR holding and not in generated towns,
and `js/trade.js`'s `profileFor` reads a settlement's `plots` array when it is given one and falls
back to biome, size and culture when it is not — so town prices work today and get sharper the day
those two data lines land.

---

## The three-line version

1. **A2 and A8 are the round.** `labour:` on `createWorks`, and `civics.tick` in the frame loop.
2. **A4 is the only construction**, and A10 is the only save line.
3. **B1 is three lines and closes a join the colony has been waiting on since it landed.**
